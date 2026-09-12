# 《回响深渊》整体优化建议(2026-09-12 只读审阅)

> 目的:对当前 Cocos 版(`cocos/assets/scripts/`)做一次玩法流程、经济养成、商业化、工程质量四个维度的通读,产出可排期的优化清单。**本文只梳理、不改代码**;每条结论附文件:行号,标注「已核实」的条目由本次审阅在源码中逐行确认,其余为静态通读结论,落地前建议再过一遍。
>
> 审阅基线:`master` @ `7ade7ff`;`npm test` 66 文件 / 3897 例全绿;工作区有 411 处未提交改动(148 修改 + 263 未跟踪,绝大多数是 `cocos/assets/resources` 下的 S1 美术批次)。

---

## 0. 一页结论

项目底子扎实:词缀引擎、赛季壳、章型、Boss 三阶段、套组/英雄、平衡模拟器、3897 例测试都已落地,`TODO/FIXME/@ts-ignore` 全树为零。**问题不在功能缺失,而在「系统之间的接缝」**:多个系统各自正确,但拼在一起后出现账目漏洞、门控失效、流程死角,以及一条尚未打通的微信出包通路。

按影响排序的十条:

| # | 问题 | 影响 | 位置 |
|---|---|---|---|
| 1 | **微信出包通路未打通**:Cocos 侧只有 `web-desktop` 构建,`build:minigame` 打的还是旧 Canvas 版 `src/main.ts`;web-desktop 产物 ≈7.7 MB,远超 4 MB 主包 | 上线阻塞 | `cocos/build/`、`vite.config.minigame.ts`、`scripts/copy-assets.cjs` |
| 2 | **新手引导 6 步只能走到第 2 步**:引导上下文里 `shop` 恒传 false,第 3-5 步永远不满足,顺序游标卡死 | 首局留存 | `battle/BattleSim.ts:324`、`game/systems/onboarding.ts:48-59`(已核实) |
| 3 | **商店点「主页」退出本局,回响一分不入账**:`closeShop(false)` 直接切屏,只有死亡才置 `pendingSettle` | 玩家打 19 章主动退出白打 | `GameShell.ts:927-931`、`battle/BattleSim.ts:403-419`(已核实) |
| 4 | **广告换回响 +100/次、无任何上限**,而整棵天赋树只要 280 点 → 3 次广告点满;局内正常产出约 4-5 点/局 | 天赋成长线被一个广告位击穿 | `GameShell.ts:816-826`、`core/ViewTable.ts:1194`(已核实) |
| 5 | **通行证第二赛季起零产出**:`passTier` 无任何重置路径,赛季翻页 `commitSeasonRoll` 不清它;进度又吃永久 `points` + 从不清零的 `dayEcho` | 赛季付费点第 2 季失效 | `GameShell.ts` `commitSeasonRoll`、`game/data/pass.ts:33`(已核实) |
| 6 | **「本日回响」从不清零**:`checkDailyReset` 只清 7 个字段,`dayEcho` 只有 `+=` 没有归零 | 40%/60% 跨天设计名存实亡 | `battle/BattleSim.ts:343-356`(已核实) |
| 7 | **5 个占位天赋可花 63 点购买**(占全树 22%),其中「无尽模式」20 点买的是本来就常开的功能 | 玩家花点无效果 | `game/data/talents.ts:56,57,59,65,85`、`season.ts:52`(已核实) |
| 8 | **战斗屏无暂停/退出**,天赋屏无返回钮,融合只能从局内商店进 | 流程死角 | `battle/HudView.ts`、`prestige/PrestigeModel.ts:266-279`、`GameShell.ts:941` |
| 9 | **一局需手点 19 次「开始下一章」**,单关 20 章 × 60 秒 ≥ 20 分钟纯战斗 | 挂机游戏的节奏与「挂机」定位矛盾 | `data/stages.ts:50-52`、`ShopModel.ts:523` |
| 10 | **投射物×敌人无空间划分**:420 × 340 峰值 14 万次距离判定/帧;FX 层每帧 new Color/Set/模板串 | 低端机帧率 | `battleWorld.ts:966-994`、`FxView.ts:25`、`BattleWorldView.ts` |

---

## 1. 玩法流程现状

### 1.1 屏幕与跳转

路由注册 16 屏(`core/ScreenRouter.ts:1-18`)+ 2 个不挂路由的覆盖层(二次确认、升级三选一)。启动链 `Bootstrap → GameShell.boot() → menu`,启动直接落主城。

```
menu ──► battle ──► shop ──► battle(下一章)
  │        │  ▲        ├──► fusion ──► shop(只能回商店)
  │        │  │        └──► menu(二次确认;不结算)
  │        │  └── gameover ──► battle(复活/重开) / prestige / menu
  │        └────► victory ──► menu(只有这一个出口)
  ├──► energy(体力不足时插入)──► menu / 续上被挡的开局
  ├──► heroes / leaderboard / daily / pass / gearup / gacha / commission
  ├──► prestige(天赋)──► 无返回钮,唯一出口是「开始新轮回」
  └──► season(赛季结算,tickSeason 自动弹,无手动入口)
```

死角与冗余:

- **天赋屏无返回**:从菜单进天赋后只能靠开一局出来;且 `currentStage` 为 null 时直接开无限关扣 3 体力(`GameShell.ts:1000-1006`、`PrestigeModel.ts:266-279`)。
- **战斗屏无暂停/退出入口**:HUD 没有 back/pause,中途只能等章末商店或死亡。
- **融合是场外玩法却只挂在局内商店工具钮**(`GameShell.ts:941`),主菜单进不去。
- **通关屏没有「下一关」**,只能回菜单再点一次。
- **商店「重开」「主页」各套一层二次确认**(`GameShell.ts:944-950`),且菜单锁定关卡先 toast 再在开局漏斗里重判一次(`GameShell.ts:720` 与 `2261-2263`)。
- **静默点击**:融合不足 2 件不开屏无提示(`GameShell.ts:1765`);daily/pass/gearup 多处条件不满足时「点了没反应」(`GameShell.ts:1180,1274,1358,1783`)。

### 1.2 一局时间线

1. 菜单点关卡(1 击)→ 解锁判定 → 扣体力 5-8(无限关 3)→ 直接进战斗,**无出征确认页**。
2. 战斗全自动(`autoMove` 默认真,`battleWorld.ts:331`)。玩家必做操作只有两处:**升级三选一**(强制暂停)和**章末商店**。
3. 每章 60 秒 × 20 章(`stages.ts:50-52`)→ 单关纯战斗 ≥ 20 分钟,加 19 次商店决策约 20-32 分钟(与 `SEASON-PACING-AUDIT §3` 一致,落在策划目标 15-30 分钟的上沿)。
4. 章末进商店,必须手点「▶ 开始第 N 章」(`ShopModel.ts:523`)。
5. 第 20 章刷 Boss(`battleWorld.ts:639-656`),击杀即通关;60 秒未杀直接判死(`:682-687`)。
6. 通关入账全在 `BattleSim.victory()`(`:432-496`);死亡只预计算,放弃时才 `settlePendingRun`(`:403-419`)。

### 1.3 战中成长规则(代码事实)

| 项 | 规则 | 位置 |
|---|---|---|
| 金币 | 杀怪掉 `xp × GOLD_PER_XP`,Boss 走 `BOSS_GOLD` | `battleWorld.ts:1339` |
| 买卡价 | 品质基础价 ×(1+已购×0.18)×(1+章×0.05) | `data/shop.ts:9-17,53-55` |
| 刷新价 | (8+章×2)×1.6^本章已刷,进店清零 | `shop.ts:20-27`、`ShopModel.ts:214,245` |
| 售罄制 | 三卡买完不补;40% 刷已有同款;套组偏向 60%/当季 70% | `shop.ts:43-50` |
| 进化 | 2 张付基础价×2,3 张免费 | `shop.ts:30`、`ShopModel.ts:351-379` |
| 槽位 | 基础 6,广告每局 +2 次,硬顶 8;金币开槽已退役 | `shop.ts:36-39` |
| 升级三选一 | 3 张、锁 1 张、重随 12×1.5^次、隐藏词条 6%/第 12 次保底 | `data/levelUp.ts:23-39`、`reroll.ts:17-34` |

**文档与实现相反的一处**:README 第 31 行写「场内金币经济替代经验/升级」,但 `battleWorld.ts:1348-1351` 又接回 `addXp` + 升级三选一,HUD 还画经验条(`HudView.ts:539`)。现状是**金币买卡 + 经验升级三选一双轨并行**,需要在文档和设计上二选一或明确定位。

### 1.4 英雄与套组

12 英雄 ≡ 12 套组,类型系统保证双射(`data/heroes.ts:54-145`);**英雄没有独立数值**,战斗语义只有 `setId`。开局选择 3 击(更换英雄 → 列表行 → 确定出战)。这是「纯包装」的既定决策,但意味着英雄页的选择成本换来的差异只有初始武器 + 套组偏向,后续若要英雄有辨识度需要加被动。

---

## 2. 玩法与体验层建议

### P0(影响首局与留存)

1. **修复新手引导**:`BattleSim.ts:324` 的 `guideCtx(true, false)` 改为在商店态传真值,并在商店屏也渲染引导条(目前只在 `HudView.ts:838` 战斗屏画)。同时清理 PC 残留文案:「按 F6」(`onboarding.ts:37`)、「重开 (R)/天赋 (T)/菜单 (M)」(`GameOverModel.ts:136-138`)、「返回菜单 (R)」(`VictoryModel.ts:142`)。
2. **主动退出要结算**:`closeShop(false)` 前走一次与死亡同口径的结算(或至少在确认弹窗里写明「本局回响 N 将丢失」,`ConfirmModel.ts:172` 现只写「进度将丢失」)。
3. **给战斗屏一个退出/暂停**:挂机游戏被迫等 60 秒才能退是硬伤;可复用商店的二次确认。

### P1(节奏)

4. **缩短单关或引入「自动下一章」**:20 章 × 60 秒对放置游戏偏长。候选方案任选其一:
   - 章数 20 → 12(Boss 章相应前移,精英/宝箱章表 `chapterTypes` 同步);
   - 保留 20 章但商店加「自动开始(3 秒倒计时)」开关,金币不足时才停;
   - 每章 60 → 45 秒。
   三者都需要重跑 `balance-sim` 标定(数值墙在第 5-6 章的台阶要保持)。
5. **天赋屏加返回钮,融合加主菜单入口,通关屏加「下一关」**。
6. **静默点击全部补 toast**,与商店刷新金币不足的处理对齐。
7. **双成长轨定位**:金币买卡与经验三选一同时存在,新玩家要理解两套货币+两套弹窗。建议要么让三选一只出「强化/临时增益」不出装备,要么把它并入商店。

### P2

8. 英雄增加轻量被动(每英雄 1 条,复用现有 `setBonus` getter 通道),让 3 击选择有回报。
9. Boss 判据用 `waves.wave`、商店/通关判据用 `world.chapter`,两套章节计数靠同一 dt 才一致(`waves.ts:108` vs `battleWorld.ts:631-635,681`),建议统一读一个源。

---

## 3. 经济与养成层

### 3.1 货币闭环一览

| 资源 | 产出 | 消耗 | 状态 |
|---|---|---|---|
| 金币 | 局内杀怪 | 买卡/进化/刷新 | 闭环(不入档) |
| 回响 points | 结算 40%、补领、**广告 +100** | 天赋树共 280 点 | 满树后只产不耗;`prestige.ts:21` 溢出转星尘常量零引用 |
| dayEcho | 结算 60% | 仅通行证进度 | **从不清零**(已核实) |
| 星尘 | 通关/重复装备/委托/碎片/宝箱/通行证/赛季结算 | 装备升级、融合 | 产远大于耗 |
| 扭蛋券 | 首通/3★/委托/宝箱/通行证/钻石换 | 单抽 1、十连 10 | 139 券/季与投入无关(审计 F3) |
| 体力 | 时间 + 广告 5×5 + 钻石回满 | 关卡 5-8 / 无限 3 | 门控不咬人(见下) |
| 钻石 | 广告 1×10/天 + 宝箱 + 辉钻矿脉 | 回满体力 10、换券 2、补星 5 | 出口太少 |
| 词缀碎片 | 委托 4 区 | 10:1 换星尘 | 单一出口 |

### 3.2 具体问题

1. **天赋点数两条口径差 20 倍**:局内约 4-5 永久点/局(`prestige.ts:24` 经 `splitEcho ×0.4`),点满需 60-70 局;主菜单广告筹码一次 +100 无上限,3 次点满。建议:广告回响加每日上限(1-3 次)或单次降到 10-20 点,并按 `docs/ADS-DESIGN.md` 登记为第 9 个广告位(目前文档只记 8 个)。
2. **5 个占位天赋**(`talents.ts:56 affix_preview / 57 reforge / 59 universal / 65 exp_gain / 85 endless`,共 63 点):`globalXpMultFor`(`:172`)定义后无人调用;`endless` 门控的 `endlessOpen()` 恒返回 true(`season.ts:52`)。建议至少把 `exp_gain` 接进 `battleWorld` 的经验入口,`endless` 改为解锁「无限关高倍环境词缀」之类真实内容,其余三个下架或改价为 0。
3. **定向搜索开关未接线**:`GameShell.ts:305-309` 与 `PrestigeModel.ts:47` 自述「未实装」,但屏上可点可保存。
4. **体力门控名存实亡**:`ENERGY_MAX=20`、6 分钟回 1(`daily.ts:15-17`)→ 2 小时回满,注释却写「10 小时回满」;日自然产能约 100 点,可打 12 局以上;审计 §2 也记「被体力卡住的局数 0」。要么 `max` 提到与「10 小时」自洽的档位,要么承认体力只是广告触点、简化 UI。
5. **回响与钻石出口过少**:满树后回响溢出转星尘(`prestige.ts:21`)零实现;钻石日产约 25 而最贵出口才 10。建议实现溢出转化,并给钻石加「委托秒完成 / 十连折扣 / 限定套组直购」中的一到两个。
6. **存档遗留字段**(`core/SaveModel.ts`):`shopRefreshCount`(零读零写)、`premiumPass`(只读无写,老版永久证残留)、`dailyClearedStage`(两写零读)、`collection.enemies`(只写不读);`prestiges` 名为转生数、实为死亡结算次数(`BattleSim.ts:416`),却做委托区域解锁门槛(`commissions.ts:64`),语义错位;`ownedGear` 无裁剪随抽卡线性膨胀。
7. **配置字段无人消费**:`SHOP_REFRESH_AD_LIMIT`(`daily.ts:37` + `balance.json`)在 Cocos 侧零引用,商店刷新只走金币;`ADS-DESIGN §3 ④ 商店广告刷新` 实际未实现。

---

## 4. 商业化与赛季

### 4.1 广告点位实况

唯一入口 `GameShell.watchAd()`(`:799`)→ `AdChannel.showRewardedAd`(`AdChannel.ts:29`)。真接的点位:复活 / 死亡双倍 / 通关双倍 / 体力+5 / 每日宝箱·天赋·补领 / 扭蛋免费抽 / 通行证高级轨 / 局内广告开槽 / **主菜单回响筹码(文档未登记)**。

- `REWARDED_AD_UNIT_ID` 仍是 `"adunit-xxxxxxxxxxxxxxxx"` 占位(`AdChannel.ts:2`,`src/platform/adapter.ts` 还有第二份)。
- 非微信环境 1 秒必回 true(`AdChannel.ts:31-35`):浏览器/编辑器可白嫖全部广告奖励,上线前需要一个「无广告环境禁用广告位」开关。

### 4.2 赛季翻页账目

`commitSeasonRoll`(已核实)只写五笔:星尘、seasonId、seasonStartAt、stageStars、seasonBest。

- **不清 `passTier`** → 5 档领完永久锁死,第 2 季通行证零产出。
- 进度公式 `points + dayEcho + stars×2`(`pass.ts:33`)吃永久回响 + 从不清零的 dayEcho → 天然溢满,通行证没有「本季推进」的感觉。建议进度改为「本季获得回响 + 本季星数」,翻页清 `passTier`。
- 玩家翻页失去:全部 3★(含花 5 钻补的星)、赛季最佳、高级轨。**补星本质是赛季耗材,UI 无提示**,建议补星确认弹窗写明「本赛季有效」。

### 4.3 赛季新鲜感

主题 / mutation / 限定套组三层已落地;赛季主题怪 30 只 S1 已落图(本次未提交批次)。剩余缺口是关卡/章型/地形赛季无关,这是内容问题不是机制问题,按美术产能排。

---

## 5. 工程与技术债

### 5.1 出包通路(P0)

- Cocos 侧只有 `cocos/build/web-desktop`,**没有 wechatgame 构建配置**(已核实)。web-desktop 产物 assets 4.5 MB + cocos-js 3.1 MB ≈ 7.7 MB。
- `vite.config.minigame.ts` 入口仍是 `src/main.ts`(旧 Canvas 版);`scripts/copy-assets.cjs` 会把 40 MB 的 `public/assets` 整体拷入 `minigame/`。**微信通路只覆盖旧版,新版尚未接通**;`smoke:wechat` 冒烟测的也是旧包。
- 首屏 ready 2,288 ms 里关键路径 3.9 MB,其中 PNG 仅 180 KB(`docs/COCOS-MIGRATION.md:653`)→ **96% 是引擎 JS**。继续压图收益有限,应做引擎模块裁剪(spine/物理/3D/粒子等未用模块)+ 分包(菜单/战斗/场外三个 bundle)+ `loadBalance` 与 `loadViewTable` 并行。
- `cocos/assets/resources/textures` 279 张 / 4.0 MB,无单图 >500 KB(像素翻新已把背景压到约 200 KB);但 `public/assets` 仍 152 张 / 40 MB 且在 git 跟踪内(`bg_shop.png` 4.16 MB 等 10 张背景未压),仓库 pack 52.6 MB。
- 无图集:全树无 `.plist`/auto-atlas,279 张散图 = 279 次请求。

### 5.2 战斗性能(P1)

- `battleWorld.ts:966-994` 投射物循环内遍历全部敌人,`LIMITS = {enemies:340, projectiles:420}`(已核实)→ 峰值约 14 万次距离判定/帧;同型还有投射物×障碍(`:983`)、敌×障碍(`:863`)、死亡连锁敌×敌(`:1303`)。建议 64 px 均匀网格,只查 3×3 邻域。
- 每帧 `filter` 分配:`:772`(光环载体)、`:901`(燃烧池);`removeIf` 的 10 处调用全部合规。
- FX:`FxCore.ts:114/134` 每粒子 push 字面量无池(上限 520);`FxView.ts:25 shaded()` 每粒子两次 `Color.clone` → 峰值约 1040 个 Color + 1040 次 Graphics fill/帧;`BattleWorldView` 7 处每帧 `new Set()`、7 处模板串脏检查;`HudView.sync()` 每帧约 20 条模板串。建议预解析色表复用、粒子按颜色分批 fill、脏检查改数值比较。
- Cocos 节点层做得好:8 个 `NodePool` + 按 `viewTable.pool` 预热(`BattleWorldView.ts:68-134`)。

### 5.3 代码组织(P2)

- `GameShell.ts` 2604 行 = 15 屏宿主胶水,`build*/open*/sync*/on*Action/commit*Claim` 五连方法平铺 15 次;`update()` 里 13 个 `router.current === "xxx"` 串判(`:507-519`)。可抽 `ScreenController` 接口,GameShell 只留路由/层级/toast/watchAd。
- `ViewTable.ts` 1474 行里 1215 行是 interface + 默认值,逻辑只有 `:1365-1474`,可拆 types/defaults/loader 三文件。
- `battleWorld.ts` 1722 行已按子系统分段(`advance` 串 12 段,`:594-666`),按段拆文件即可。
- 与 `src/` 的真重复:`src/systems/save.ts` vs `core/SaveModel.ts` 字段表逐项照抄;`adapter.ts` 与 `AdChannel.ts` 同名同占位;`balance.ts` 与 `ConfigChannel.ts` 钳制口径。`src/dev/labModel.ts` 的 `export * from "@game/..."` 是正确模板,三处应照此上移。
- **类型检查盲区**(已核实):`tsconfig.json` 的 `include` 只有 `src / tests / vite.config.ts / cocos/assets/scripts/game`,`GameShell.ts`、`ViewTable.ts`、各 View 约 2 万行不在 `npm run build` 的 `tsc --noEmit` 内,只靠单独的 `scripts/cocos-typecheck.mjs`。建议并入主 tsconfig 或在 `build` 脚本里串联。
- `viewTable.json` 只有 `balance.json` 同目录的一份,`shopV4/hudV4/restV4` 开关恒 false(`ViewTable.ts:1189-1193, 1388-1395`)→ `ShopView.ts:473-528` 等成片 v4 分支在出包里跑不到,两套版式并行维护;需要决定保留哪一套。
- 魔法数字集中在渲染与 FX:51 处 `fxLayer.burst/ring` 的 speed/size/life 内联(典型 `battleWorld.ts:1505-1545`),与 `DESIGN-VALUES-SPEC` 条款 1「数值入表」冲突;建议收进 `viewTable.fx.presets`。
- 未引用导出 155+ 处(主要是各 `*Layout.ts` 的字号常量与 `data/*` 的旧曲线常量),建议 `knip`/`ts-prune` 入 CI。

### 5.4 平台层与存档(P3)

- `SaveChannel.ts` 31 行:明文 JSON、key 固定 `echo-abyss-save-v1`,**无 schemaVersion、无迁移分支、无校验、无云存档预留**。现在只靠逐字段 `Number(x)||默认` 兜底,能兼容加字段,处理不了语义变更或回滚。建议加版本号 + 迁移表 + 摘要。
- `src/platform/balance.ts:22` 无 fetch 时跳过用内置默认,与 Cocos 侧 `ConfigChannel` 读 resources 的行为可能产生两端数值不一致(只在 src 旧版仍在维护时才成问题)。

### 5.5 测试与验证

- 66 文件 / 约 2026 个 `it()`,其中 `cocos-*` 迁移对照 19 文件约 60%,真实玩法逻辑 47 文件约 40%。迁移完成后对照测试的维护成本会高于价值,可逐步收敛为快照。
- 有自研 CDP 冒烟(`scripts/smoke-cocos.mjs`)但**无真机/微信开发者工具自动化,无帧时/GC 性能基准**。
- 多处标定依赖单一或少数 seed(CONTEXT 条目 44/45 自记),建议多 seed 聚合。
- `.probe/` 463 MB 本地取证目录已 gitignore,可整目录清理。

### 5.6 仓库卫生

- 最近提交 `7ade7ff "暂存提交"` 无信息量;工作区 411 处未提交改动(S1 美术批次)建议尽快按批次拆分提交。
- `public/assets` 40 MB 未压背景仍在 git 跟踪内,是 pack 体积主因。

---

## 6. 建议排期

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **第 1 批(阻塞项,1-2 周)** | 微信 wechatgame 构建 profile + 分包 + 引擎裁剪;广告位 ID 与「非广告环境禁用」开关;存档 schemaVersion | 无 |
| **第 2 批(账目与门控,数日)** | 新手引导修复;主动退出结算;广告回响上限;`passTier` 翻页清零 + 进度公式改本季;`dayEcho` 跨天清零;5 个占位天赋处置;定向搜索接线或下架 | 无 |
| **第 3 批(流程,1 周)** | 战斗暂停/退出;天赋返回;融合主菜单入口;通关屏下一关;静默点击补提示;PC 文案清理 | 第 2 批 |
| **第 4 批(节奏与数值,需重标定)** | 单关时长方案二选一(减章/自动下一章);双成长轨定位;体力档位自洽;钻石/回响新出口;英雄轻量被动 | balance-sim 重跑 |
| **第 5 批(性能与结构)** | 空间网格;FX 颜色/粒子池;GameShell 拆控制器;ViewTable 拆分;tsconfig 全覆盖;v4 版式二选一;死导出清理 | 可与前几批并行 |

---

## 附录:核实方法

- 已核实条目:在源码中逐行读到对应代码(引导上下文、`closeShop`、`watchAdForEcho`、`commitSeasonRoll`、`checkDailyReset`、`dayEcho`/`passTier` 全部引用、`tsconfig.include`、`cocos/build` 目录、`endlessOpen`、`LIMITS`、贴图目录体积)。
- 其余条目来自静态通读 + grep 统计,行号以审阅时的工作区为准;未跑真机、未做帧时采样,性能项是复杂度推断而非实测。
- 参考的既有文档:`README.md`、`docs/CONTEXT.md`(条目 41-52 与「待办」节)、`docs/SEASON-PACING-AUDIT.md`、`docs/ADS-DESIGN.md`、`docs/DESIGN-V3.md`、`docs/PORTING-WECHAT.md`、`docs/DESIGN-VALUES-SPEC.md`。
