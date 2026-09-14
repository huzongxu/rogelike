# 策划配置表 · CONFIG-TABLES

> 配置文件:[`public/config/balance.json`](../public/config/balance.json) —— 改完保存,**浏览器刷新即生效**(开发服务器无需重启)。
> 规则:删除任意段或字段 = 使用内置默认值;**数值越界/类型错误 = 该字段回退默认值**(不会钳到边界,不会崩游戏,控制台告警)。
> 单测:`tests/balance-config.test.ts`;加载器:`src/platform/balance.ts`。微信小游戏端暂不支持外置配置,自动使用内置默认值。
> 开发准则:策划数值一律遵循 [`DESIGN-VALUES-SPEC.md`](./DESIGN-VALUES-SPEC.md) —— 数值入数据层规范文件、每个数值带备注、单一事实源。

## energy · 体力

| 字段 | 默认 | 单位 | 说明 | 建议范围 |
|---|---|---|---|---|
| max | 20 | 点 | 体力上限 | 10~60 |
| regenSeconds | 360 | 秒/点 | 自然恢复速度(360=6 分钟,10 小时回满) | 60~1800 |
| adGain | 5 | 点/次 | 看广告补体力 | 2~10 |
| adLimit | 5 | 次/日 | 每日广告回体力次数 | 3~10 |
| diamondRefillCost | 10 | 钻 | 钻石直接回满价格 | 5~30 |
| stageCosts | [5,5,6,6,7,7,8] | 点/关 | 主线第 1~7 关体力消耗(超出 7 关取最后一项) | 每项 0~20 |
| endlessCost | 3 | 点 | 无限关消耗 | 1~6 |

## economy · 经济/商店/钻石

| 字段 | 默认 | 单位 | 说明 |
|---|---|---|---|
| diamondPerAd | 1 | 钻/次 | 每次看完广告得钻石 |
| diamondAdDaily | 10 | 钻/日 | 每日广告产钻上限 |
| diamondTicketCost | 2 | 钻/券 | 钻石直购扭蛋券 |
| shopRefreshAdLimit | 5 | 次/日 | 商店广告刷新每日上限 |
| basePrice.common/rare/epic/legendary/hidden | 15/30/60/120/200 | 金 | 品质基础价(卡价/销毁回收/进化费共用基数) |
| slotExpandBase | 100 | 金 | 槽位扩展首价:第 n 次 = base × growth^n |
| slotExpandGrowth | 2.3 | - | 槽位价格增长系数 |
| slotCap | 6 | 个 | 场内主动法宝槽硬顶(基础 4 + 天赋 ≤2 + 本局广告 1,合计钳到此值;R7) |

> 商店卡价公式:`basePrice × (1 + 已购数×0.12) × (1 + 章节×0.03)`;刷新价:`(8 + 章节×2) × 1.6^本章已刷次数`(曲线系数已入规范表 `src/data/shop.ts`,见 DESIGN-VALUES-SPEC.md 目录;未接 balance.json 热调)。

## battle · 战斗框架

| 字段 | 默认 | 单位 | 说明 |
|---|---|---|---|
| chapterSeconds | 60 | 秒/章 | 每章限时(同步 waves.chapterLength) |
| chaptersPerStage | 20 | 章/关 | 每关卡章节数 |
| echoRetainRate | 0.4 | - | 回响跨天保留比例(0.4=40% 入永久池) |
| monsterCountBase | 30 | 只 | 每章怪物数量曲线基数(第 1 章) |
| monsterCountGrowth | 1.15 | -/章 | 数量曲线增长率 |
| echoRewardBase | 10 | 点 | 关卡回响奖励基数:N = base × N^exp |
| echoRewardExp | 1.5 | - | 回响奖励指数 |
| stageUnlockProgress | 0.5 | - | 关卡解锁门槛:前一关打到 ceil(章节数×此值) 章即解锁下一关(0.5=第 10/20 章);通关整关始终解锁 |
| clearRewardGrowth | 0.15 | -/关 | 通关奖励成长:奖励 ×(1 + growth×(解锁前最高关-1)),通关越多奖励越好 |

## waves · 生成节奏

| 字段 | 默认 | 单位 | 说明 |
|---|---|---|---|
| chapterLength | 60 | 秒/章 | 同 battle.chapterSeconds(两者改一处即同步,显式配置以本段为准) |
| spawnBase | 0.9 | 秒/只 | 第 1 章生成间隔基数 |
| spawnEarlyDecay | 0.9 | -/章 | 前 earlyChapters 章每章间隔乘 0.9(-10%) |
| spawnEarlyChapters | 5 | 章 | 新手曲线章数 |
| spawnLateDecay | 0.96 | -/章 | 之后每章 -4% |
| spawnIntervalMin | 0.18 | 秒 | 间隔下限(防数值墙) |
| spawnMultiFrom | 6 | 章 | 第 N 章起一波多只(1 + wave÷N) |

> 实际间隔 = 曲线值 ÷ 关卡密度(spawnScale) ÷ 章型密度,再钳到 spawnIntervalMin。

## chapterTypes · 章型差异化

| 字段 | 默认 | 说明 |
|---|---|---|
| eliteChapters | [5,10,15] | 精英章位置(第几章) |
| treasureChapters | [7,14] | 宝箱章位置 |
| eliteSpawnScale | 1.3 | 精英章生成密度倍率 |
| eliteBurst | 1.5 | 精英章开局 burst 倍率 |
| eliteIntelBias | 0.3 | 精英章敌情倾向概率 |
| eliteIntelDelay | 6 | 精英章章首多少秒内不强制精英敌情(开局 burst 只有密度;R12 对照:0 / 3 / 6s 与偏向 0.15 深度总和 368 / 343 / 387 / 385) |
| treasureSpawnScale | 0.5 | 宝箱章密度倍率(<1 稀疏) |
| treasureGoldMix | 0.25 | 宝箱章金怪替换概率 |
| defaultIntelBias | 0.45 | 普通/宝箱章敌情倾向概率 |

> 章型倍率只作用于本章局部,不折入全局曲线(数值墙标定铁律,勿在配置里"补偿"全局难度)。

## gacha · 扭蛋

| 字段 | 默认 | 说明 |
|---|---|---|
| cost / cost10 | 1 / 10 | 单抽/十连消耗券数 |
| rates[].value/weight | 55/30/12/3 | 品质权重(common/rare/epic/legendary/hidden,按权重归一化) |
| epicPity | 10 | 第 N 抽必出史诗及以上 |
| legendaryPity | 50 | 第 N 抽必出传奇(≥ epicPity) |
| epicPityLegendaryChance | 0.3 | 史诗保底触发时升格传奇概率 |
| duplicateStardust.* | 2/5/15/40/60 | 重复装备转星尘(按品质) |

## menuLayout · 主菜单布局

> 规范表:[`src/data/layoutMenu.ts`](../src/data/layoutMenu.ts)(唯一事实源,每个字段带四要素备注) / 纯几何:`src/ui/menuLayout.ts` `menuLayoutPure()` / 单测:`tests/menu-layout.test.ts`。
> **不想手填数字?** 本段的数值可在浏览器里拖出来:`npm run dev:lab` → [`LAYOUT-LAB.md`](./LAYOUT-LAB.md)(dev-only 布局台,实时预览 + 导出本段 JSON)。
> **单位:设计 px** —— 560 宽设计空间内的像素(宽恒 560,高按屏比在 996~1246 之间伸展);`*Src*`/`*Num`/`*Den` 类字段的单位是**源图像素**。
> 分两层:`origin` 是决定区块位置/尺寸的**锚点**(改一个数 = 整块移动或缩放);`deco` 是区块**内部**的装饰偏移与贴图尺寸档。
> **派生几何不在本表**(关卡行高/行距、列表分布、九宫格角深、套组卡宽、入口宽、标题条绘制宽),它们由 `origin` 算出——直接写死会随屏高与贴图失真,这是本项目布局的硬约束。
> 越界处理:字段值落在"范围"外 → 回退默认并告警(不钳到边界);`rowMinH > rowMaxH` 时两者自动互换。

### menuLayout.origin · 锚点

| 字段 | 默认 | 范围 | 说明 |
|---|---|---|---|
| pad | 16 | 0~40 | 页边距(内容宽 = 屏宽 − 2pad = 528;module=2 的整数倍档) |
| entryH / entryY | 44 / 148 | 20~60 / 40~160 | 场外入口钮高度(= 热区下界)/ 入口带顶缘 Y |
| setH | 34 | 34~90 | 尾块英雄带高度加数(展示带净高) |
| setDescH | 46 | 30~90 | 尾块英雄带高度加数(说明文字带) |
| setGapY | 16 | 0~20 | 英雄带底缘到屏底的下留白;英雄带顶缘 = 屏高 − 本值 − (heroRise + setH + setDescH) |
| sectionH | 32 | 0~60 | 分区条高(缺贴图时自动归零,退回纯文字标签) |
| sectionSrcW / sectionSrcH | 528 / 32 | 1~2048 | 分区条绘制比例(绘制宽 = sectionH × 本比值 → 通栏落在内容宽) |
| stageHdrY | 200 | 100~300 | 有分区条时"主线关卡"条顶缘 Y |
| listYNoSection | 240 | 100~300 | 无分区条时列表顶缘 Y |
| hdrBand | 8 | 0~20 | 分区条底缘 → 列表顶缘呼吸缝(带间缝档) |
| setHdrGap | 13 | 0~40 | 套组标题带相对套组卡顶缘的上抬量(套组卡一带算而不画,保留旋钮) |
| endlessGapSet / endlessGapSet2 | 4 / 4 | 0~80 | 有分区条时主 CTA 与英雄带的间隙(两段独立旋钮) |
| endlessGapFlat | 8 | 0~80 | 无分区条时主 CTA 与英雄带的间隙 |
| endlessW / endlessH | 528 / 56 | 120~560 / 30~80 | 主 CTA 尺寸(水平居中,通栏 = 内容宽) |
| endlessListGap | 8 | 0~40 | 列表可用下界 = 主 CTA 顶缘 − 本值 |
| rowMinH / rowMaxH / rowMaxGap | 72 / 96 / 28 | 40~120 / 40~160 / 0~60 | 关卡行展开三参数,交给 `spreadRowsGrid`:行高与行距都落偶数,富余先加行高再加行距,末段余数落在列表与主 CTA 之间的缝 |
| phantomAnchor | 124 | 60~560 | 幻影榜筹码右锚宽(x = 屏宽 − 本值,w = 本值 − pad → 右缘恒落内容右界) |
| phantomY / phantomH | 96 / 44 | 20~160 / 14~60 | 幻影榜筹码顶缘 Y / 高(与筹码带同档 44) |
| entryGap | 12 | 0~32 | 入口钮横向间距(7 枚:floor((528 − 6×12)/7)=65 取偶 64,末枚右缘 536,余 8 归容器;上界 32 留给实验室手柄按 1/n 步进) |
| entryCount | 7 | 1~12 | 入口钮个数(等宽 = (屏宽 − 2pad − entryGap×(本值−1)) / 本值) |
| setGap | 8 | 0~20 | 套组卡横向间距(算而不画,保留旋钮) |
| rowPlateF | 0.35 | 0.05~0.5 | 行底板角深系数(仅在调用方没给九宫格边距时用作回退内缩量) |
| setBandNum / setBandDen | 20 / 124 | 0~200 / 1~512 | 套组卡贴边装饰带厚 = setH ×(本分子/本分母),文字落在带间净空 |
| noteBandNum / noteBandDen | 8 / 45 | 0~200 / 1~512 | 说明板装饰带厚同口径(menu_note_plate 源图上下各 8 行、总高 45) |
| heroRise / heroClearance | 8 / 8 | 8~160 / 0~40 | 英雄带高度加数 / 带顶缘与主 CTA 底缘的最小间隙(富余量不足时 heroRise 拖不动属正常) |
| heroBtnW / heroBtnH | 96 / 44 | 40~200 / 20~60 | 「选择英雄 / 更换英雄」按钮尺寸(带内右锚 + 垂直居中;高按 ×2 换算才跟手) |

### menuLayout.deco · 装饰内缩与绘制档

> 全部字段取值域 **−200~200**(设计 px;`noteCap*` 为源图行),越界回退默认。逐字段四要素备注见规范表源码。

| 区块 | 字段 = 默认 |
|---|---|
| 标题横幅 | `banInset`=0 `banY`=8 `banH`=56 · 纹章 `crestOffX`=16 `crestOffY`=8 `crestW`=40 `crestH`=40 · 标题 `titleOffX`=64 `titleOffY`=36 · 赛季行 `seasonInset`=0 `seasonOffY`=76(右缘 = 屏宽 − pad)· 体力/钻石行 `row2OffY`=88 `energyGap`=8 · 钻石图标 `gemOffX`=8 `gemOffY`=14 `gemW`=28 `gemH`=28 |
| 货币条 | 能量筹码板 `stripY`=96 `stripH`=44 · 筹码 `chipH`=44 `chipW`=96 `energyW`=84 `chipGap`=12 `chipX1`=0 `chipX2`=0 `chipX3`=0(三枚货币筹码由右界反推左挂,本三值只做逐枚微调)· 图标 `chipIconW`=28 `chipIconGap`=4 `chipSlide`=8 `chipInnerGap`=4 `chipTailPad`=8 `chipProbePad`=20 · 幻影筹码 `phChipProbeW`=40 `phChipPadAdd`=8 `phChipPadMin`=14 `phRightGap`=0 |
| 关卡行 | 基线 `rowC1Off`=8 `rowC2Gap`=18 · 列 `rowTxOff`=52 `rowRightInset`=16 `descClipPad`=88(右尾列「N 章 · Boss」预留宽)· 补星钮 `rowMakeupReserve`=80 `makeupW`=72 `makeupH`=44 `makeupRightGap`=0 · 序号牌 `badgeOffX`=20 `badgeSize`=40 `badgeR`=18 `badgeStroke`=2 `badgeTextOffY`=6 · 通关勾 `checkOffX`=4 `checkOffY`=11 `checkSize`=13 `checkAdvance`=16 · 星数 `starSize`=13 `starGap`=2 `starOffX`=4 `starLift`=2 |
| 分区标题 | `sectionTextPad`=30(条文可用宽 = 条宽 − 本值)/ `listHintFallbackY`=200(缺条时文字基线 Y) |
| 红点 | `dotR`=5 `dotInsetX`=8 `dotInsetY`=8(圆心相对宿主钮右上角) |
| 套组卡 | 图标 `setIconOffX`=6 `setIconOffY`=9 `setIconW`=18 `setIconH`=18 · 选中态 `setFramePad`=2 `setBadgeInsetX`=16 `setBadgeOffY`=6 `setBadgeSize`=18 · 内容列 `setColPadL`=28 `setColPadR`=34 `setRow1Off`=12 `setRow2Gap`=15 · 赛季标记 `tagPad`=4 |
| 说明板 | `noteCapNum`=20 `noteCapDen`=45(带厚下限,取 `noteBand` 与本换算的较大值)· 说明板与英雄带同一矩形:`noteTopOff`=0 `noteInsetX`=0 `noteSlide`=0 · 文字 `noteRow1Off`=12 `noteRow2Gap`=14 |
| 英雄展示带 | 内缩 `heroPadX`=16(立绘左缘 / 按钮右缘 / 图文列距共用一节)· 立绘 `heroPortW`=56 `heroPortH`=56 `heroPortOffX`=0 `heroPortOffY`=0(0 = 带内垂直居中;带高不足时按带高收缩保持正方形)· 图文列 `heroNameOffY`=30 `heroRow2Gap`=18 `heroRow3Gap`=16 |

> 只动 `deco` 不会移动任何区块,只改区块内部的对齐/避让;想让整块挪位置改 `origin`。缺贴图时相关尺寸按原"纯代码形状"回退口径,布局与接入贴图前逐像素一致。

## menuSkin · 主菜单皮肤

> 规范表:[`src/data/menuSkin.ts`](../src/data/menuSkin.ts)(唯一事实源,带四要素备注)/ 几何消费:`src/ui/menuLayout.ts` `menuLayoutPure()`(insets 加性增量)/ 绘制消费:`src/game.ts` `drawMenu()`(换图/显隐)/ 单测:`tests/menu-skin.test.ts` + `tests/lab-skin.test.ts`。
> **不想手填数字?** `npm run dev:lab` 的「结构树 · 皮肤」面板直接点选操作:图层显隐、换图、四边间距,实时预览并导出本段 JSON(见 [`LAYOUT-LAB.md`](./LAYOUT-LAB.md))。
> **整段缺省或 `{}` = 零画面变化**(本项目铁律);非法键/越界值 → 回退默认并告警,口径同 menuLayout。insets 每边 −100~100(取整)。
> 拓扑固定:7 面板 13 层(标题横幅/货币条/筹码/分区标题条/关卡行/套组卡/说明板,除货币条无文字层外各图+文两层)。本段只能操作既有图层,不新增。
> **面板位沿用**:`setCard` 那一行现在画的是「出战英雄展示带」(原套组卡已被它接管),皮肤仍按既有 `setCard` 键位作用于该带文字层,不新增面板 id。

### menuSkin.remap · 换图映射(资产键 → 资产键)

| 字段 | 默认 | 说明 |
|---|---|---|
| `<源键>: <目标键>` | `{}` | 运行时把源键的贴图换成目标键绘制,例 `"menu_note_plate": "menu_chip_plate"`(说明板改画筹码底板)。两键都须在资产清单内;恒等映射(`a→a`)被忽略。目标键自身被 `hidden` 时按缺图回退形状 |

### menuSkin.insets · 图文四边间距(面板级加性增量)

> 单位:设计 px。**加性**叠在 `deco` 派生的基准值上 —— `deco` 仍是唯一基准事实源,本段只表达"这张图/这段文字相对基准再挪多少",不移动任何区块、不碰命中热区。

| 面板 | l(左)| r(右)| t / b(上 / 下)|
|---|---|---|---|
| title | 纹章、标题文字右移 | 赛季行左移 | 标题/赛季行/体力钻石行整体上下移(`t−b`)|
| strip | 全部筹码右移 | 幻影筹码右锚左移 | 筹码行整体上下移 |
| chip | 筹码图文内距加宽 | 筹码尾部留白加宽 | 筹码文字基线区收窄(`chipBase` 按 `chipY+t, chipH−t−b` 重算)|
| section | 条内文字左右内缩加深 | 同左(两侧合并)| 条文竖直带收窄(`sectionTextBand`)|
| row | 行文字、头像徽章右移 | 行右列左移(避让加深)| 行内文字竖直偏移(`rowC1Off += b−t`)|
| setCard | 内容列、套组图标右移(仅供 `setBtns` 几何,该卡算而不画 → **画面无可见效果**)| 同左 | 同左 |
| note | 板内文字右移、最大宽收窄 | 最大宽收窄 | 板内行基线上下移 |

### menuSkin.hidden / textHidden / layers

| 字段 | 默认 | 说明 |
|---|---|---|
| `hidden` | `[]` | 资产键数组:整张图不绘制,走缺图契约(回退纯代码形状,与贴图接入前逐像素一致)。`isReady()` 对被隐藏键返回 false |
| `textHidden` | `[]` | 面板 id 数组(`title`/`strip`/`chip`/`section`/`row`/`setCard`/`note`):只隐该面板文字,图与热区不动。`setCard` 现对应英雄展示带的三行文字(带底板、「更换英雄」按钮与热区不受影响)|
| `layers` | `{}` | 图层自定义命名(`"row.text": {"name": "…"}`),布局台展示用;运行时不消费,仅透传保存 |

> 换图两种通道的分工:`remap` 写进本段**真生效**(浏览器+微信同源);布局台的「📁 本地文件」只是 dev 预览(刷新即失,绝不进导出)。

## 暂未纳入(仍是代码常量,后续按需迁移)

> 品质体系数值已按开发准则抽离至规范表 [`src/data/quality.ts`](../src/data/quality.ts)(全项目品质数值唯一出处),不在本清单;其中基础价/扭蛋概率/重复补偿等字段已有本文件的运行期覆盖项,规范表中的值为内置默认。
>
> 战斗侧数值(敌人成长、Boss 标定、玩家白值、场地实体、环境词缀参数)已抽离至规范表 `src/data/enemies.ts` / `combat.ts` / `field.ts` / `envAffixes.ts`,见 [DESIGN-VALUES-SPEC.md](./DESIGN-VALUES-SPEC.md) 目录;这些表目前是纯常量表,**未接本文件的 balance.json 热调覆盖**,改数走代码流程。

- 词缀/天赋/套组/委托区域等结构型数据:数值已按准则抽离入表(`SET_BONUSES`/`COMBO_VALUES`/`TALENT_VALUES`/`COMMISSION_DECAY`/`EQUIPMENT_LEVEL_GROWTH`,见 [DESIGN-VALUES-SPEC.md](./DESIGN-VALUES-SPEC.md) 目录),仅剩纯结构性定义(接口形状),无数值缺口
- 英雄页几何与滚动手感:常量已入表但**未接 balance.json 热调**——滚动容器口径(点击判定阈值/惯性初速/减速度/边界橡皮筋/滑块宽)在 `src/ui/scrollList.ts`,页面分区与行高(列表带、详情区、立绘盒、确认按钮)在 `src/ui/heroSelectLayout.ts`,改数走"改表 → `npm test`"代码流程(单测:`tests/scroll-list.test.ts` + `tests/hero-select-layout.test.ts`)

## 策划操作指引

1. 打开 `public/config/balance.json`,按上表改字段值(保持 JSON 格式:键带英文双引号,数组/对象结构不变)。
2. 保存后刷新游戏页面(F5)即生效;控制台会打印 `[balance] 策划配置已应用: energy, economy, ...`。
3. 若某字段写错(越界/类型错误),控制台 `[balance] 部分配置字段非法已回退` 会列出被忽略的字段,该字段用默认值,其余字段正常生效。
4. 想恢复某段默认:删除该段即可。
5. 数值验证:`npm run test`(内置平衡模拟 `scripts/balance-sim.ts` 会用当前生效曲线跑长局)。
