# 赛季怪物扩充设计:4 赛季 × 30 种(主题命名)

> 状态:批 1-4 已实装(批 1-3 = S1-S4 全 120 种 + 赛季门控 + 3 个机制 tag;批 4 = 精英/首领技能 24 只全量,见 §5)。基线:装备系统重构后(条目 45)。
> 原则:① 怪物曲线铁律不破——新怪**不提高基础血量/伤害曲线**,只加行为多样性,强度走行为机制(CONTEXT 铁律);② 数据驱动:**变体表换皮**——新怪 = `game/data/seasonMonsters.ts`(即 `cocos/assets/scripts/game/data/seasonMonsters.ts`)一行,`behavior` 复用现有 `EnemyKind`(追击/分裂/隐身/反伤/吞噬/护盾/召唤),AI 零新增;三维倍率在 (主题, 行为) 组内**均值恒等于 1.0**,`xp`/`radius` 一律继承基线(金币经济与碰撞几何不动)。之所以不扩 `ENEMY_DEFS`:该表按 `EnemyKind` 穷尽,扩行等于引入新 kind,会让主题怪悄悄落进"无机制"分支并动摇波次构成测试;③ 按赛季主题门控出场(`SEASON_MONSTER_TENDENCY`:当季 45% / 过季存量 15% / 0-1 章新手区不换皮),换皮严格发生在 kind 选定**之后**,故波次构成与 `hpBuff` 逐帧不变。

## 0. 通用原型档(每季 30 种 = 6 档 × 5 档位)
| 档位 | 数量 | 行为原型(复用现有 AI) | 强度锚点 |
|---|---|---|---|
| 基础 ×8 | 追击 + 数值变体(速度/血量/体型微调) | 腐尸级 |
| 迅捷 ×5 | 高速低血,贴身骚扰 | 迅捷鬼级 |
| 重甲 ×5 | 慢速高血,正面减伤 | 石巨级 |
| 特性 ×6 | 每季主题机制(见各季表) | 反射者/隐匿者级 |
| 精英 ×4 | 光环/召唤/技能(精英章主力) | 精英级 |
| 首领 ×2 | 小 Boss(章中/宝箱章守护) | 弱化深渊领主 |

## 1. S1 回响苏醒(尸潮/回响系,色 #7a5cff)
- 基础:回响行尸 · 共鸣尸 · 空鸣骸 · 低语腐尸 · 震颤尸 · 回响壳 · 余音骸骨 · 初醒尸群
- 迅捷:颤音疾骸 · 残响掠影 · 谐振鬼 · 速鸣骸 · 回声追猎者
- 重甲:共鸣甲壳 · 混响岩铠 · 鸣盾行尸 · 回音巨壳 · 驻波重尸
- 特性:**裂鸣体**(死亡分裂,复用 splitling)/ **消音隐者**(周期隐身,复用 hider)/ **鸣伤反射者**(反伤 12%,复用 reflector)/ **吸声者**(吸收投射回血,复用 devourer)/ **驻鸣护壁**(给周围怪加盾,复用 shieldguard)/ **回响之种**(死后召唤 2 只基础怪,复用召唤师)
- 精英:领鸣者(光环:周围怪 +10% 速)/ 深渊传声者(周期震击)/ 万骸指挥(死亡召唤 4 只)/ 第一回音(冲锋)
- 首领:**初代回响**(震击 + 召唤行尸)/ **空谷之主**(分裂 3 体)

## 2. S2 永冻深渊(冰系控场,色 #5ac8fa)
- 基础:冻殍 · 霜壳尸 · 冰脉蠕体 · 寒晶骨 · 凝霜行尸 · 冰碴傀儡 · 永冻躯壳 · 霜纹尸
- 迅捷:冰面掠者 · 霜刃鬼 · 寒风疾影 · 裂冰疾行 · 凛冬猎犬
- 重甲:玄冰巨像 · 千年冻甲 · 冰晶壁垒 · 霜铠蠕王 · 极寒壳
- 特性:**凝滞之触**(攻击减速,复用 slow)/ **冰雾隐者**(迷雾隐身)/ **碎冰反射**(冰甲反伤)/ **融冰孳生**(死亡分裂水尸)/ **寒渊吞噬者**(吞噬投射)/ **冰脉护卫**(冰盾光环)
- 精英:极北守卫(冰环震击)/ 永冻祭司(冻结脉冲)/ 冰脉母巢(周期产冰虫)/ 霜咬巨狼(冲锋+减速)
- 首领:**深渊冰髓**(全场冰雾周期隐身)/ **极渊之颚**(吞噬投射 + 震击)

## 3. S3 熔火回响(火系区域压制,色 #ff9d2e)
- 基础:熔渣行尸 · 焰壳尸 · 灰烬蠕体 · 焦骨 · 燃烬傀儡 · 火脉尸 · 熔核残躯 · 烬灰爬行者
- 迅捷:火线掠者 · 烈焰疾鬼 · 爆燃疾行 · 火舌追猎 · 焚风影
- 重甲:熔岩巨像 · 黑曜甲壳 · 火成岩铠 · 熔核壁垒 · 焦土重壳
- 特性:**余烬孕体**(死亡留灼烧带,复用毒池机制)/ **烟幕隐者**(烟雾隐身)/ **焰甲反射**(火焰反伤)/ **爆裂孕体**(死亡爆炸,复用 death_chain)/ **熔口吞噬者**(吞噬投射)/ **火盾护卫**(火焰护盾光环)
- 精英:熔核祭司(陨星齐射)/ 火脉母巢(周期产火虫)/ 焚天巨像(全场火雨 telegraph)/ 燎原狼王(冲锋+点燃)
- 首领:**熔核之心本体**(地面火带 + 震击)/ **教团之焰**(召唤火虫 + 分裂)

## 4. S4 幽冥潮汐(亡灵召唤,色 #9b6cff)
- 基础:冥潮浮尸 · 幽影壳 · 亡语骸 · 潮鸣腐尸 · 缚魂躯 · 幽冥爬行者 · 汐灵 · 归潮骸
- 迅捷:潮影疾鬼 · 幽冥掠影 · 亡魂追猎 · 汐闪影 · 冥潮疾行者
- 重甲:幽冥巨像 · 亡者重铠 · 潮汐壁垒 · 缚魂甲壳 · 冥渊重壳
- 特性:**还魂体**(死亡复活一次,复用分裂)/ **雾潮隐者**(潮雾隐身)/ **怨甲反射**(怨念反伤)/ **噬魂者**(吞噬投射)/ **亡语护冢**(召唤物光环,强化周围"亡影")/ **引潮孕母**(死亡召唤 3 冥虫)
- 精英:剧团班主(召唤灵狼敌版)/ 冥潮祭司(亡者脉冲)/ 潮汐墓守(震击 + 隐身)/ 百鬼统领(光环:周围怪 +15% 伤)
- 首领:**剧团之主**(召唤协战怪群)/ **幽冥潮主**(潮雾 + 分裂 + 召唤)

## 5. 实装计划(分四批,铁律:不改全局曲线)
| 批次 | 内容 | 引擎工作 | 验收 |
|---|---|---|---|
| 批 1(已实装) | S1 全 30 种(行为全复用,零新 AI)+ 赛季门控 | 新增 `game/data/seasonMonsters.ts`(规范表 + `SEASON_MONSTER_TENDENCY` + `rollSeasonMonster` + 记忆化 `seasonMonsterDef`);换皮入口 `waves.seasonMonsterDefFor(kind, seasonId, chapter)` 在 `spawnEnemy` 的第 4 参传入(kind 已定,分布零改动);`EnemyDef.variantId` 标记 + 渲染键 `monster_<variantId>`(缺图回退 `enemy_<kind>`);敌情 `chapterIntel(chapter, seasonId)` 威胁文案改报当季主题怪名;图鉴 `collection.enemies`(击杀即收录,老档迁移补空数组) | 新手局平衡模拟不回退(铁律可证:`tests/seasonMonsters.test.ts` 28 例断言组内倍率均值 = 1.0、单轴 ±15%、xp/radius 继承、special/boss 钉死 1.0、倾向 45%/15% 统计命中、seasonId<1 默认路径一致)。icon 待美术批(见下)|
| 批 2(已实装) | S2/S3 各 30 种(新机制:凝滞之触/余烬孕体 = 现有 slow/毒池 tag 参数化) | 主题下标 `seasonMonsterThemeIndex(seasonId) = (seasonId-1) % 4` 一行公式放开主题 1/2(主题 3 待批 3,S4 走 `offSeason` 存量池);机制**不新增 tag 枚举**而是参数化挂载:`EnemyMech = slowOnHit{factor,duration} \| deathPool{radius,duration,cap}` 挂在 `EnemyDef.mech`(数值取自 `SEASON_MONSTER_MECHS` 表,`seasonMonsterDef` 逐行拷贝入表),`kind` 仍是 `chaser` → 零新 AI;受击侧 `game` 接触判定读 `e.def.mech?.type === "slowOnHit"` → `player.applySlow`(与 `Enemy` 侧同款单一共享快照:`factor` 取最慢、剩余取最长,计时归零才复原);死亡侧 `deathPool` → `spawnBurnPool()` 往 `game.obstacles` 推一只临时 `Obstacle{kind:"pool",burn:true,ttl}`,逐帧复用 `isInPool` + `OBSTACLE.poolDps/poolTick` 地形 DoT 通道,`tickObstacleTtl` 原地回收、同屏上限 `cap` 只驱逐最旧 | 章型模拟过精英台阶不回归(`balance-sim` 调 `waves.update` 不传 seasonId = 0 → 模拟永不混入主题怪,曲线天然免疫);铁律可证:`tests/seasonMonsters.test.ts` 56 例(90 行配额、每主题 6 档均值 = 1.0、单轴 ±15%、id 唯一 90/90、mech 行白名单仅 2 只、mech 参数表自洽:减速属软控 `factor>0.6`、灼烧池半径 < 地形毒池且单池总伤 < 新手血墙 1/3);全套 833/833 绿 + tsc 干净;实机验证(localhost 真包):变体合成/接触减速 0.7/死亡落池 r60·ttl4/灼烧与地形池同点位同掉血 10.5/池数上限 6/图鉴记 `variantId` |
| 批 3(已实装;精英/首领技能移批 4) | S4 全 30 种(主题 3;还魂体 = 分裂行为 + 复活机制)+ 复活 tag | 第 3 个机制参数化:`EnemyMech = ... \| revive{hpFrac}` 挂 `EnemyDef.mech`(`SEASON_MONSTER_MECHS.revive = {hpFrac: 0.5}`),还魂体 `kind` 仍是 `splitter` → 零新 AI;实体层 `tryRevive(e)`(entities/enemy):首次致死(hp≤0 且未复活)回 `max(1, round(maxHp×hpFrac))` 血并置 `revivedOnce`,每只限一次;`game.damageEnemy` 击杀分支先问 `tryRevive`——复活成功不记击杀、不掉落、不移除,只发幽紫魂火 FX 后 return,二次致死照常 `killEnemy`(分裂/图鉴/金币全走原通道);主题 3 落地后四主题全覆盖,`offSeason` 回退只对当季缺行为的组合生效(如 S2/S3 无召唤师 → 取 S1/S4 存量) | 铁律可证:`tests/seasonMonsters.test.ts` 73 例(120 行配额、chaser 组 34 行、每主题 6 档均值 = 1.0、单轴 ±15%、id 唯一 120/120、mech 白名单恰 3 只、revive 参数 0<hpFrac<1、tryRevive 一次性/非复活怪不触发/复活后分裂行为不变);全套 850/850 绿 + tsc 干净;模拟门槛不回归(模拟不传 seasonId = 曲线天然免疫)|
| 批 4(已实装) | 精英/首领技能 **24 只全量**(4 季 × 精英4 + 首领2):变体首领保留三阶段状态机,技能作纯附加层;全部由 **11 原语 + 参数**表达(`aura/slam/pulse/barrage/summon/deathSummon/deathSplit/charge/hideCycle/fireTrail/devour`),无单只特例 | `EnemySkill` 接口挂 `EnemyDef.skill`;数据入 `SEASON_MONSTER_SKILLS` 纯常量表(键 = 变体 id 1:1,`seasonMonsterDef` 逐槽克隆折入);执行入口 `updateSkill(e, dt, ...)`(entities/enemy,纯逻辑 + 事件回调 `SkillEvents`);震击/脉冲/轰炸统一走 `SkillTelegraph` 实体 → game 层 `skillTelegraphs[]` 倒计时/渲染/引爆(与三阶段机 `bossSlamCharge` 零耦合,`detonateSlam` 抽离复用);召唤走 `spawnChild` + `LIMITS.enemies`,死亡召唤/分裂挂 `killEnemy`(`skillSplitBabies` 覆盖式、回落 `splitBabies`;weak 变体返 []);冲锋三段状态机(原地蓄力 → 锁向冲刺 → 单次撞击,`skillDashing` 期间 `updateEnemy` 让位);光环 `auraMultAt` 每帧派生乘数(连乘封顶 1.5)入追击速度与接触伤害;伤害预算锚点 `BOSS_SLAM`(精英单事件 ≤0.7×、变体首领附加层 ≤0.85×、蓄力 ≥0.9s、间隔 ≥6s、池伤 ≤25、隐身占比 ≤0.2、软控 factor>0.6) | 铁律可证:`tests/monsterSkills.test.ts` 新增套件(表预算逐档断言 + 折入独立性 + 11 原语行为单测 + 基线精英/首领 60s 零事件)+ `seasonMonsters.test.ts` 全量核账(恰 24 行挂载 = 16 精英 + 8 首领、每季恰 6 只);全套 900+ 绿 + tsc 干净;**批 4 技能不进 balance-sim**(模拟不传 seasonId、也不调 `updateSkill`,Boss TTK 守卫天然免疫——后人不得为此放开模拟的 seasonId);双构建 + 微信冒烟 + 实机(精英章 5/10/15 + Boss 章,预警圈可读)|
- 图鉴:`collection.enemies` 已实装(遇见即收录 = 击杀时记 `variantId ?? kind`,基线怪与主题怪分开计),配合条目 44 升级面板思路可做怪物图鉴页。
- 美术:每批 30 张 256px 抠图;**S1 的 30 枚 `monster_<id>` 已入库**(走 `game/data/pixelArt.ts` 的 `S1_MONSTER_KEYS` + `BATTLE_FIRST_PAINT_KEYS`,派生产线 `scripts/pixel-variants.mjs` 与 Holopix 重绘各 18 枚),**待出图剩 S2-S4 的 90 只**;Web 侧 `ASSET_MANIFEST` 现 154 键(`public/assets/` 152 张),这些变体键在 PNG 到位前**故意不登记进清单**(加空键只会换来等量失败加载)。出图时同步登记 ART-REQUIREMENTS §12。
- **已知缺口(2026-09-01 像素验证):批 1/2 的主题怪目前在画面上看不出来。** 渲染链是"变体贴图 `monster_<variantId>` → 缺图回退 `enemy_<kind>` → 再缺才用 `def.color` 纯色圆"(game.ts:3203),而 14 个 `EnemyKind` 的 `enemy_<kind>` 贴图**全部在册**,故 `def.color` 分支当前不可达。真包取样证实:把 S2 变体铺满战场后,其主题色在全画布精确命中 0 像素(唯一命中的 `#5ac8fa` 来自经验宝石/HUD 同色,与怪物无关)。也就是说 120 只换皮此刻只在**名字、敌情文案、图鉴**三处生效,战场上仍与基线怪像素一致。PNG 到位前若要提前可读,可选:变体无专属贴图时按 `def.color` 叠加低透明度色罩或描一圈主题色环(纯代码,不新出图)。**待定,未擅自改渲染。**
- **迅捷占位已修复(2026-09-01 独立小平衡调整)**:批 1 验证曾发现 `SPAWN_CURVE` 的 `swift`(0.45)被 `tank`(0.5)遮蔽,第 3 章起永不出现,各季「迅捷 ×5」主题皮 3 章后不可达。定案 = `swift` 拆两行:`{swift, minWave 3, rBelow 0.55}` 吃波 3+ 的 [0.5,0.55)=5%(从兜底腐尸段取,`tank` 50% 收入锚点不动)+ 原 `{swift, minWave 1, rBelow 0.45}` 行保住波 1-2 的 45% 主力位。实测探索(全套门槛模拟:新手 20 章 ×2 / 章型台阶 / 地形 24 种子聚合):迅捷不可提到 tank 前(石巨 50%→5% 致 12 章崩);波段宽度锯齿敏感,2/4/6/7/8% 各崩其一,**5% 是唯一全门槛绿岛**;tank 扩带 0.65 让位虽过新手门槛但章型卡死第 5 章、地形回落超标,已弃。最终全套 805/805 绿。
