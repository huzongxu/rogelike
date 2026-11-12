# 回响深渊 · 全量设计与数值总表

> 基准：`master` @ `cff181d` 的工作树（R18–R22 的改动在册未提交），2026-11-04 提取；本文所有数值按工作树源码转录，逐条可在 `game/data/*.ts` 与标注的屏层文件里核到。
> 事实源优先级：`cocos/assets/scripts/game/**`（共享纯逻辑层，文中写作 `game/data/…` / `game/systems/…` / `game/entities/…`）是数值与几何的**唯一事实源**；`public/config/balance.json` 是运行期热调覆盖层（只覆盖部分字段，规范表默认值仍是权威定义）；`src/game.ts` 是 Web 冻结基准（设计上不再改动）；`cocos/assets/scripts/` 屏层与 `GameShell.ts` 只读表。
> 开发准则：数值与逻辑分离、单一事实源、每个数值带四要素备注，见 [`DESIGN-VALUES-SPEC.md`](./DESIGN-VALUES-SPEC.md)。热调字段清单与合法区间见 [`CONFIG-TABLES.md`](./CONFIG-TABLES.md)。
> 单位约定：半径与距离 = 设计 px，生命/伤害 = 点，速度 = px/秒，时间 = 秒，比例 = 0–1，倍率 = ×。

## 目录

1. 产品骨架与主循环（三轴、一局的时间结构、主线 7 关、局内循环）
2. 局内战斗框架：章型、波次生成、章节敌情、场地实体与地形
3. 玩家白值与战斗结算常量（含承伤反哺池、荆棘层）
4. 品质体系（五档主表与全部派生轴）
5. 敌人：基础属性、波次曲线、登场曲线、特化机制、Boss 三阶段、赛季主题怪 120 行、环境词缀
6. 英雄 · 本命节律 · 独有技能（12 英雄、6 节律、4 技能 × 5 阶、身份特効与调率）
7. 法宝 · 被动 · 遗物 · 共鸣（14 + 8 + 2 + 8，赛季共鸣格与过季衰减）
8. 装备生成、词缀三轴、融合、重随、槽位与强化经济
9. 套组 12 套、`SET_BONUSES`、组合技、天赋树、赛季新鲜感三层
10. 场内成长闸门：升级三选一、章间商店、金币经济
11. 场外：体力、钻石与广告闸门、回响转生、委托、通行证、扭蛋、收藏与每日、幻影榜
12. 赛季壳与结算：14 天、解锁、星数、首通与补星补领、赛季分、结算屏
13. 局内战斗运行时：流程、走位与姿势、伤害结算管线、掉落与拾取、上限与节流
14. 宿主层：存档结构、帧调度、配置通道、引导、调试、升级弹层与形态机读合同
15. 热调覆盖层现状（`balance.json` 逐键与差异）
16. 屏层与运行时内联数值清单（未进 `game/data` 规范表的那一类）
17. 设计支柱与已拍板裁定（元纪律、三轴、战斗、英雄、套组、商业化、呈现与验证）
18. 待办、未决与已知缺陷（数值层 / 内容层 / 工程基建 / 已知噪声）
19. 口径漂移点（文档 ↔ 代码，38 条）
20. 事实源索引与核对方法

---

## 1. 产品骨架与主循环

**定位**：赛季关卡式 × 场内肉鸽 × 场外养成的竖屏挂机游戏。三轴各自回答一个问题——赛季壳给「明天回来的理由」，场内肉鸽给「这局重开的理由」，场外养成给「一直在变强的理由」。

**一局的时间结构**（表值 `game/data/stages.ts`）：

| 层级 | 口径 | 值 |
|---|---|---|
| 章 | 一屏竞技场限时生存 | 60 秒（`CHAPTER_SECONDS`，同步 `waves.CHAPTER_LENGTH`） |
| 关 | 章数 | 15 章（`CHAPTERS_PER_STAGE`，R20 由 20 缩到 15） |
| Boss 章 | 每关末章 | 第 15 章，7 关全部出 Boss；杀 Boss = 通关，超时未杀判负 |
| 竞技场 | 真机 arena = `battleWorld.chapterArena()` = `{x0: 0, y0: HUD_TOP_H 64, x1: 560, y1: worldH − 底坞高}`；`worldH() = min(designH, WORLD_H_CAP 996)`、底坞高 v4 双排 96（缺省 48）→ 高屏 560 × 836、48 档 560 × 884 | px |
| 画面设计空间 | 宽恒 560（FIXED_WIDTH），设计高按屏比 `clamp(996 → 1246)`；战场标定高恒 560 × 996，多出的高度给顶/底坞与底坞之下的歇指区 | px |

**主线 7 关**（`STAGES` 逐行）：

| id | 名 | 文案 | 章数 | Boss 章 | 环境词缀 | 密度 `spawnScale` | 奖励（券/点数/星尘） |
|---|---|---|---|---|---|---|---|
| 1 | 初入尸潮 | 第一次直面尸潮 | 15 | 15 | 无 | 0.6 | 1 / 10 / 0 |
| 2 | 荒野求生 | 荒原上的脚步声越来越密 | 15 | 15 | mist | 0.9 | 1 / 28 / 0 |
| 3 | 沼泽深处 | 毒雾弥漫，怪物会持续回血 | 15 | 15 | heal_aura | 1 | 2 / 52 / 5 |
| 4 | 裂谷火海 | 时间扭曲，反伤弥漫 | 15 | 15 | time_dilation, reflect_field | 1 | 2 / 80 / 8 |
| 5 | 深渊边缘 | 死亡在此连锁引爆 | 15 | 15 | death_chain | 1.1 | 3 / 112 / 12 |
| 6 | 深渊之喉 | 扭曲的空间吞噬一切 | 15 | 15 | space_warp, heal_aura, mist | 1.15 | 3 / 147 / 16 |
| 7 | 王座之间 | 深渊领主在此等候 | 15 | 15 | reflect_field, time_dilation, death_chain | 1.2 | 5 / 185 / 25 |

关型节奏：奇数关（1/3/5/7）= 深渊领主满机制；偶数关（2/4/6）= 弱化变体（血量 ×0.7、跳过 P2、死亡不分裂），作用是节奏阀门，避免连关高压。

竞技场口径分两条：真机 playable arena 宽恒 560、纵向随上下坞高伸缩；`stages.CHAPTER_ARENA` = 480 × 854 只在 `scripts/balance-sim.ts` 用作平衡模拟的兜底矩形，运行期 `world.arena` 的构造点在 Cocos 侧 grep 不可见（由 `world.view` 派生）。刷怪节奏是绝对时间制，不随屏幕尺寸稀释。

**局内循环**：自动战斗与拾取（挂机档）→ 杀怪掉金币 → 每章 60 秒结束进章间商店（买法宝 / 强化 / 进化 / 购槽）→ 玩家手动开始下一章 → 第 15 章杀 Boss → 结算回响与星数 → 回主菜单。玩家升级时弹「三选一」发**英雄独有技能**；首章开始前有一次**免费法宝三选一**。

**跨局结构**：回响点数（转生）→ 三系天赋树 → 委托挂机离线产出 → 星尘 → 词缀融合 / 扭蛋 / 通行证 / 每日；回响跨天保留 40% 入永久池，其余 60% 本日池次日清空。

**屏面**：主菜单（主线关卡列表 + 无限关 + 出战英雄带 + 7 枚场外入口：委托 / 扭蛋 / 天赋 / 通行证 / 每日 / 升级 / 融合）+ 战斗 + 章间商店 + 结算族（胜利 / 阵亡 / 体力 / 二次确认弹层）。Cocos 侧 `ScreenKey` 路由共 16 屏：battle / menu / shop / heroes / leaderboard / daily / pass / gearup / gacha / prestige / commission / fusion / season / gameover / victory / energy；升级弹层、二次确认与姿势层不挂路由键，走常驻 `Overlay` 层并以 `visible` 顶到末位压过懒建 toast。

---

## 2. 局内战斗：章型、波次、场地

### 2.1 章型差异化（`game/data/chapters.ts`）

每关 15 章 = 普通 ×10 / 精英 ×3 / 宝箱 ×2 / Boss ×1。章型判定确定性：`chapter === bossChapter → boss`，`∈ ELITE_CHAPTERS → elite`，`∈ TREASURE_CHAPTERS → treasure`，否则 normal。铁律：**章型倍率只作用本章局部，绝不折入全局曲线**（`waveHpMult` 与生成间隔 base 是数值墙标定基线）。

| 常量 | 值 | 含义 |
|---|---|---|
| `ELITE_CHAPTERS` | [4, 8, 12] | 精英章位置（数值台阶章）；R20 随 15 章重排，落在 27% / 53% / 80% 与原 5/10/15 同形，末章让给 Boss |
| `TREASURE_CHAPTERS` | [6, 10] | 宝箱章位置（40% / 67%），刻意不与精英章同拍 |
| `ELITE_SPAWN_SCALE` | 1.3 | 精英章本章密度倍率 |
| `ELITE_BURST` | 1.5 | 精英章开局 burst 倍率 |
| `ELITE_INTEL_BIAS` | 0.3 | 精英章强制精英敌情的生成倾向 |
| `ELITE_INTEL_DELAY_SEC` | 6 | 章首 6 秒只有密度，第 6 秒起精英入场并打「精英入场」横幅；R12 对照延迟 0 / 3 / 6 与偏向 0.15 的深度总和 = 368 / 343 / 387 / 385，穆 30 → 46 章 |
| `TREASURE_SPAWN_SCALE` | 0.5 | 宝箱章稀疏，给商店攒钱窗口 |
| `TREASURE_GOLD_MIX` | 0.25 | 宝箱章金怪混入概率 |
| `DEFAULT_INTEL_BIAS` | 0.45 | 普通/宝箱章沿用轮转敌情的倾向 |

### 2.2 生成节奏（`game/systems/waves.ts`）

| 常量 | 值 | 含义 |
|---|---|---|
| `CHAPTER_LENGTH` | 60 秒 | 每章时长（与 `stages.CHAPTER_SECONDS` 同步） |
| `SPAWN_BASE` | 0.9 秒/只 | 第 1 章间隔基数（标定基线，章型倍率不入此值） |
| `SPAWN_EARLY_DECAY` | 0.9 | 前 5 章每章间隔 −10%，紧凑施压 |
| `SPAWN_EARLY_CHAPTERS` | 5 章 | 新手曲线段 |
| `SPAWN_LATE_DECAY` | 0.96 | 第 6 章起 −4%/章，避免生成加速度长期甩开商店成长 |
| `SPAWN_INTERVAL_MIN` | 0.18 秒 | 间隔下限（防数值墙） |
| `SPAWN_MULTI_FROM` | 6 章 | 第 6 章起一波多只 |

公式：

```
wave       = floor(elapsed / 60) + 1
base       = wave ≤ 5 ? 0.9 × 0.9^(wave−1)
                      : 0.9 × 0.9^(5−1) × 0.96^(wave−5)
interval   = max(0.18, base ÷ spawnScale)      // spawnScale = 本关缩放 × 章型局部倍率
count      = 1 + floor(wave / 6)                // 一波数量
burst      = (6 + floor(章/3)) × burstMult      // 章首开局波
每章怪物数  = round(30 × 1.15^(chapter−1))       // stages.chapterMonsterCount
```

出生点规则（`waves.edgePos`）：边缘内缩 pad 40、与玩家最小距离 260、采样 8 次后退回随机环内点。敌情偏向 `if (intel.prefer && rand < bias) kind = intel.prefer`；金怪替换 `if (goldMix > 0 && rand < goldMix) kind = "goldkind"`（掉 5 倍金币）；主力敌种血量 `buffed = round(maxHp × (1 + intel.hpBuff))`。

### 2.3 章节敌情（`game/data/intel.ts`）

四类轮转，`chapterIntel(chapter) = INTELS[(chapter − 1) % 4]`，确定性同章同敌情。

| chapter%4 | 敌情 | 主力敌种（+40% 血） | 推荐套组 | 提示 | 描述 |
|---|---|---|---|---|---|
| 1 | 尸潮 | chaser | ember | 范围清群，推荐余烬天灾 | 大量腐尸与迅捷鬼涌入 |
| 2 | 重甲 | tank | barrage | 高伤穿透，推荐弹幕风暴 | 石巨与护盾卫士列阵 |
| 3 | 异变 | null | thorn | 扛伤回血，推荐荆棘回响 | 分裂体与反射者出没 |
| 4 | 精英 | swift | null | 随机应变 | 精英怪潜伏，小心应对 |

赛季改写：`seasonId ≥ 1` 且本章 `prefer` 有当季主题怪时，候选 1 个 → 「{名} 单独出没」，≥2 个 → 「{名1}、{名2} 等 {n} 种」，否则用基线文案；候选池与 `rollSeasonMonster` 同源，文案不会承诺刷不出的怪。

### 2.4 场地实体与地形（`game/data/field.ts` + `game/entities/objects.ts`）

| 常量 | 值 | 含义 |
|---|---|---|
| `PROJECTILE_RADIUS_KNIFE` / `_RAY` | 5 / 7 px | 弹体碰撞半径（射线贴脸覆盖更宽） |
| `CHAIN_RANGE_DEFAULT` | 300 px | 连锁检索半径 |
| `PROJECTILE_TTL` | 2.5 秒 | 未命中即消失，防场外残留 |
| `HOMING_SEARCH_RANGE` | 640 px | 追踪弹（冰锥）索敌半径 |
| `MINION_SPEED_DEFAULT` | 210 px/秒 | 召唤物默认移速（灵狼 ×1.3） |
| `MINION_RADIUS` | 12 px | 召唤物碰撞半径 |
| `MINION_ATTACK_INTERVAL` | 0.9 秒 | 召唤物攻击间隔 |
| `GEM_PICKUP_DELAY` | 0.4 秒 | 掉落延迟吸附，给击杀反馈留一拍 |
| `GEM_MAGNET_SPEED` | 340 px/秒 | 金币吸附飞行速度 |
| `OBSTACLE.pillarRadius` | 40 px | 石柱碰撞半径（阻挡移动，最小位移推出） |
| `OBSTACLE.poolRadius` | 90 px | 毒池半径（不阻挡移动） |
| `OBSTACLE.poolDps` / `poolTick` | 6 点/秒 / 0.25 秒 | 毒池每 tick 1.5 点；定性为地形，不走受击管线 |
| `OBSTACLE_PLACEMENT.countMin`/`countMax` | 1 / 1 | 每章**恒 1 个**障碍（R13 真机口径标定，见 §17 注释滞后项） |
| `.inset` / `.minCenterDist` / `.minSpacing` | 120 / 180 / 150 px | 四边内缩环带摆放、距出生点、障碍互距 |
| `.pillarChance` | 2/3 | 石柱 : 毒池 = 2 : 1 |
| `.tries` / `.minBandSize` | 30 次 / 40 px | 采样不满足则少放 1 个（防出生点被堵）；环带过窄放弃摆放 |

摆放门控：第 1 章与 Boss 章不放障碍。超额金币堆并入**离玩家最近的那一堆**（金额守恒），旧行为「splice 掉最早的堆」会让钱静默蒸发，已废弃。

弹道碰撞口径：线段-圆相交（`projectileHits`），修复「高速弹道每帧步长 26px 对碰撞半径 19px 的目标做点检测会穿透跳过，导致密集扇形掩盖、全向弹幕大量脱靶」。

---

## 3. 玩家白值与战斗结算常量（`game/data/combat.ts` + `game/entities/player.ts`）

### 3.1 白值

| 常量 | 值 | 含义与依据 |
|---|---|---|
| `PLAYER_BASE.radius` | 16 px | 接触判定与拾取判定共用碰撞圆 |
| `PLAYER_BASE.speed` | 240 px/秒 | 新手标定：可稳躲震击预警（1.2s 蓄力）与围杀缺口 |
| `PLAYER_BASE.maxHp` | 100 点 | 数值墙锚点，新手稳态 75–95，与 `BOSS_SLAM.damage` 80 成对标定 |
| `PLAYER_BASE.hpPerLevel` | 8 点/级 | 温和成长；主成长来自装备/收藏/天赋 |
| `PLAYER_BASE.slots` | 4 个 | 主动法宝槽，取舍提前到第 2–3 章；天赋最多 +2、本局商店 +1，硬顶 `SHOP_SLOT_CAP` 6 |
| `PASSIVE_SLOTS` | 4 个 | 被动法宝槽（`data/artifacts`），天赋「被动槽扩展」+1 |
| `XP_BASE` / `XP_PER_LEVEL` / `XP_POWER_EXP` / `XP_POWER_COEF` | 8 / 5 / 1.5 / 1.0 | 升级经验曲线 |

```
xpToNext(level) = floor(8 + level×5 + level^1.5 × 1.0)
首次升级门槛     = floor(xpToNext(1) × firstXpScale)   // 天赋「快速启动」= −20%
升级回血         = min(maxHp, hp + floor(maxHp × 0.2))  // LEVELUP_HEAL_PCT
slots            = 4 + slotBonus(天赋) + runSlotBonus(本局商店，每局清零)
castList         = 独有技能在前 + 主动法宝在后（技能不占槽）
```

### 3.2 结算与节奏常量

| 常量 | 值 | 含义 |
|---|---|---|
| `CONTACT_HIT_CD` | 0.8 秒 | 同一敌人贴身后每 0.8s 结算一次接触伤害，防每帧咬人 |
| `CRIT_TRIGGER_CD` | 0.7 秒 | 隐藏触发器「暴击触发」冷却，口径与受击触发一致 |
| `COMBO_WINDOW` | 3 秒 | 连杀窗口，3 秒无新击杀断连 |
| `COMBO_FRENZY_EVERY` / `FRENZY_DURATION` / `FRENZY_PULSE_MULT` | 10 / 2 秒 / 0.6 | 每 10 连杀触发 2 秒狂潮，全装备触发间隔 ×0.6 |
| `REFLECT_BUDGET_HP_PCT` | 0.15 | 玩家侧反伤每秒最多 15% 最大生命伤害（惩罚可读，不处刑） |
| `THORN_HEAL_PCT` | 0.02 | 荆棘反伤回血流：每次挨打回 2% 最大生命 |
| `GOLD_PER_XP` | 1 | 击杀金币 = 敌人金币基数 × 本值（A4 由 2 下调） |
| `BOSS_GOLD` | 45 金 | Boss 固定掉落，不走上式（A4 由 60 下调） |
| `ELITE_GEM_COUNT` | 6 堆 | 精英死亡掉落堆数，普通敌人 1 堆（A4 由 8 下调） |
| `DROP_SCATTER` | 10 px | 金币散布半径（±围绕尸体） |
| `GEM_PICK_RADIUS_BONUS` | 8 px | 拾取距离 = 玩家半径 + 8 |
| `GEM_MAGNET_RADIUS` | 420 px | 无自动拾取天赋时的吸附起始半径 |
| `MINION_SIGHT` / `MINION_ATTACK_RANGE` | 320 / 100 px | 召唤物索敌视野 / 出手距离 |
| `MINION_HIT_KNOCKBACK` | 20 | 召唤物攻击击退力度 |
| `MINION_HEAL_ON_HIT_PCT` | 0.3 | 亡灵契约：召唤物命中治疗主人 = 本次伤害 30% |
| `MINION_FOLLOW_LEASH` | 60 px | 无目标时跟随：距离 > 60 才移动 |
| `REVIVE_SHIELD_SECONDS` / `REVIVE_CLEAR_RADIUS` | 2 秒 / 70 px | 复活后 2 秒无敌盾 + 清空周围 70 内敌人 |
| `BOSS_SPAWN_OFFSET_X` / `_Y` / `BOSS_SPAWN_INSET` | 260 / 60 / 60 px | Boss 登场位置与边界收进 |

A4 金币经济重标口径：出口侧补齐场内强化与升级重随两个深出口后，产出侧砍半，把「每章末余额」拉回「够买一张卡、但买不光货架」的区间；`ELITE_GEM_COUNT` 8→6 因精英章原本是单章产出尖峰。

### 3.3 承伤反哺池（穆的身份特効）与荆棘层（薇拉的身份特効）

`RETALIATION_HEAL`：

| 字段 | 值 | 依据 |
|---|---|---|
| `halfLifeSec` | 2.5 秒 | 池半衰期，超时不用即流失；精英尖峰是 1–2 秒脉冲，2.5s 把一次尖峰摊到多次狼命中 |
| `capMaxHpPct` | 0.5 | 池上限占最大生命比例，防单次超大尖峰囤出超额奶 |
| `perHitMult` | 8 | 每次召唤物命中最多抽取 = 基础回血 × 本值；sweep 结论「卡点在释放速率而非池子大小」——1.5 时约 90 次命中/秒只退 ≈540/秒，追不上精英章单秒 734–1005 的承伤尖峰 |

```
入池   pool = min(pool + dmg × retaliationPct, maxHp × 0.5)   // 护盾挡掉的不计（"没挨到打"）
流失   pool *= 0.5^(dt / 2.5)；pool < 0.5 → 0
抽取   got = min(perHitMult × 基础回血, pool)；抽多少扣多少
不变量 反哺总量恒 ≤ 承伤 × 入池比例，与场上召唤物数量无关（防上百只灵狼放大成无限奶）
```

`THORN_STACK`：

| 字段 | 值 | 依据 |
|---|---|---|
| `cap` | 6 层 | 满层给半径 +36%，与共鸣档位（半径 ×1.5）同量级且不越它 |
| `perContactPerSec` | 3 层/(只·秒) | 首版 0.5 跑出层均 0.02–0.46、满层 0%（只吃到零层罚项，没有报酬曲线）；3 = 一只贴身敌 2 秒攒满 |
| `decayPerSec` | 0.8 层/秒 | 无贴身敌时掉层；满层脱离接触约 7.5 秒清零 |
| `contactRadius` | 110 px | 「贴身」距离闸，与挂机档围数统计同源 |
| `contactEchoDecayPerSec` | 6 围数/秒 | 接触记忆衰减；1 只 ≈0.17 秒 / 3 只 ≈0.5 秒 / 6 只 ≈1 秒的记忆窗口。取 6 不取 1：放到 1 那档绕场满层占比 81.7%，涨落曲线消失——站位资源的全部意义就是那条读得出的涨落曲线 |
| `ThornGainMode` | `still` \| `move` | 两态姿势：站定且贴身才涨（挂机 hold）/ 边走边贴身才涨（挂机 orbit）；没有「什么都不约束」的第三档 |

```
记忆  echo = max(contacts, echo − 6 × dt)
攒层  gained = fed > 0 && (still ? !moving : moving) ? fed : 0      // moving = movedPx > 0.001
      stack  = gained > 0 ? min(6, stack + echo × 3 × gainMult × dt) : max(0, stack − 0.8 × dt)
比例  thornStackFrac = min(1, stack / 6)                            // HUD 节律进度条与半径/威力共用
```

设计口径：把「什么时候站在圈里」变成一条玩家读得出的曲线——贴进去换半径与威力，退出来保命；反哺类 runaway 的防线是层数封顶 + 零层有罚，不靠奶量。

### 3.4 玩家实体其余规则（`game/entities/player.ts`）

护盾先吸收（`absorbed = min(shield, dmg)`，余量扣 hp），返回实际穿透伤害；`addShield` 取更强与更长（`max`），不叠加；受击减速 `slowFactor = min(旧, factor)`、`slowTimer = max(旧, duration)`；`thornGainMode` 缺省 `still`（= `heroSkills.VERA_STANCES[0]`，给模拟器/机器人/老档一个确定值）；`branchChosen = null` 表示未选，选中即另一分岔永久消失；`spareLifeUsed` 记遗物「假命」本局是否已用；`rhythmLevelUp` 到 `RHYTHM_MAX_LEVEL` 返回 false。

---

## 4. 品质体系（五档，`game/data/quality.ts`）

口径：品质决定**形态**（部件构成 / 射速 / 赠量 / 强化上限），等级决定**数值**；品质不直接放大伤害。隐藏品质仅由词缀融合产出，不进任何掉落/抽取权重。

`QUALITIES` 主表（唯一主表，其余轴全部 `tierFieldMap` 派生）：

| key | 名 | 色 | rank | 触发器 | 效果 | 修饰器 | maxLevel | basePrice | rateHaste | bonusPoints | powerMult | 重复星尘 | 收藏攻% | 收藏血% |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| common | 普通 | #c8c8c8 | 0 | 1 | 1 | 0 | 5 | 15 | 0 | 0 | 1.0 | 2 | 2 | 1 |
| rare | 稀有 | #4aa3ff | 1 | 1 | 1 | 1 | 8 | 30 | 0.06 | 1 | 1.1 | 5 | 4 | 2 |
| epic | 史诗 | #c06cff | 2 | 1 | 1 | 2 | 12 | 60 | 0.12 | 2 | 1.2 | 15 | 6 | 3 |
| legendary | 传奇 | #ff9d2e | 3 | **2** | 1 | 2 | 16 | 120 | 0.18 | 3 | 1.3 | 40 | 9 | 5 |
| hidden | 隐藏 | #4dffc8 | 4 | 1 | 1 | **3** | 20 | 200 | 0.25 | 4 | 1.4 | 60 | 15 | 8 |

双触发器是传奇档形态特征，三修饰器是隐藏档形态特征；`effects` 恒 1（品质不加效果数）。

其他常量：

| 常量 | 值 | 含义 |
|---|---|---|
| `QUALITY_DROP_CURVE.shiftCap` | 30 级 | 等级位移封顶，防后期全传说 |
| `QUALITY_DROP_CURVE.common` | base 70 / −1.6/级 / 下限 10 | 下限 = 保底出货 |
| `QUALITY_DROP_CURVE.rare` | base 30 / +0.9/级 | 另加天赋「战利品嗅觉」`rareBonusWeight` 100/点 |
| `QUALITY_DROP_CURVE.epic` | base 8 / +0.7/级 | — |
| `QUALITY_DROP_CURVE.legendary` | base 1 / +0.25/级 / 上限 12 | 上限 = 防碾压 |
| `QUALITY_EVOLVE_POWER_STEP` | 1.35 | 每升一档数值 ×1.35（进化是场内数值成长主出口） |
| `QUALITY_UPGRADE_COST_GROWTH` | 0.6 | 强化价格等级递增系数 |
| `QUALITY_HASTE_CAP` | 0.7 | 射速总上限：修饰器/品质/套组/组合技 haste 叠加后不超过本值 |
| `QUALITY_BONUS_CONVERSION.radiusPerPoint` | 0.06 | AOE 系（新星/毒云/霜环/陨星/熔岩）：每点赠量 → 范围 +6% |
| `QUALITY_BONUS_CONVERSION.summonPointsPerExtra` | 2 点 | 召唤系（骷髅/灵狼/亡影）：每 2 点赠量 → 召唤 +1（向上取整） |
| `QUALITY_BONUS_CONVERSION.fallbackPowerPerPoint` | 0.05 | 无数量轴效果（护盾/汲取）：每点 → 数值 +5% |
| `FUSION_COST_FALLBACK` | 60 星尘 | 表未匹配组合的兜底 |
| `HIDDEN_PITY_N` | 10 次 | 隐藏词缀保底，出货时三选一（彩虹品质） |
| `TRIPLE_FUSION_UNLOCK_TALENTS` / `_COST_MULT` | ≥6 个天赋 / ×2 | 三重融合解锁与成本 |
| `GACHA_QUALITY_WEIGHTS` | 55 / 30 / 12 / 3 | 扭蛋品质权重默认（隐藏不入池） |
| `GACHA_EPIC_PITY` / `GACHA_LEGENDARY_PITY` / `_EPIC_PITY_LEGENDARY_CHANCE` | 10 / 50 / 0.3 | 保底 |
| `GACHA_EQUIPMENT_BASE_LEVEL` | 5 级 | 扭蛋装备等级基数 |
| `STAGE_FRAME_QUALITY` | ≤2→common，≤4→rare，≤5→epic，≤6→legendary | 关卡头像框，超出用 `STAGE_FRAME_OVERFLOW_QUALITY` = hidden |

```
掉落权重   shift = min(level, 30)
           common = max(10, 70 − 1.6×shift)
           rare   = 30 + 0.9×shift + 稀有加成×100
           epic   = 8 + 0.7×shift
           legendary = min(12, 1 + 0.25×shift)
升品数值比 = 1.35^(rank(目标) − rank(来源))
强化价格   = 基础价 × (1 + (等级−1) × 0.6)
销毁回收   = basePrice × 0.5        进化费用 = basePrice × 2
扭蛋装备等级 = 5 + (已解锁最高关 − 1)
融合成本     = FUSION_COST_TABLE[`${lo}x${hi}`] ?? 60   // 按 rank 排序，a+b 与 b+a 同键
```

`FUSION_COST_TABLE` 全 10 项（星尘）：common×common 0、common×rare 5、rare×rare 15、rare×legendary 30、legendary×legendary 60、common×epic 10、rare×epic 20、epic×epic 30、epic×legendary 45、common×legendary 20。

---

## 5. 敌人：基础属性、登场曲线、特化机制、Boss

基础属性表定义在 `game/data/enemies.ts`，运行时行为在 `game/entities/enemy.ts`。取值为新手局标定基线，铁律：**新怪只加行为多样性，不抬基础曲线**。

### 5.1 `ENEMY_DEFS`（14 敌种）

| kind | 名 | 半径 | HP | 速度 | 接触伤害 | XP | 金币 | 机制要点 |
|---|---|---|---|---|---|---|---|---|
| chaser | 腐尸 | 14 | 30 | 72 | 8 | 1 | — | 新手区主力 |
| swift | 迅捷鬼 | 11 | 18 | 150 | 5 | 2 | — | 高速 |
| tank | 石巨 | 24 | 140 | 40 | 16 | 4 | — | 压场 + 收入锚点 |
| elite | 精英 | 34 | 520 | 52 | 26 | 12 | — | `isElite`，掉 6 堆金币 |
| reflector | 反射者 | 14 | 42 | 62 | 10 | 3 | — | 反弹 25% 伤害给来源 |
| splitter | 分裂体 | 16 | 56 | 76 | 8 | 4 | — | 死亡分裂 2 幼体 |
| hider | 隐匿者 | 12 | 32 | 92 | 6 | 3 | — | 周期隐身，隐身时不可被瞄准 |
| devourer | 吞噬者 | 16 | 62 | 56 | 9 | 4 | — | 吸收投射物回血，克远程 |
| shieldguard | 护盾卫士 | 18 | 82 | 46 | 10 | 5 | — | 正面 60° 内伤害 ×0.2 |
| summoner | 召唤师 | 18 | 52 | 52 | 8 | 5 | — | 每 4 秒召 2 只腐尸 |
| splitling | 幼体 | 10 | 16 | 92 | 4 | 1 | — | 分裂产物 |
| god | 神级敌人 | 40 | 2600 | 46 | 40 | 80 | — | 需天赋「神之挑战」，波 8 起 4%；反射+隐身+正面减伤+分裂 4 |
| boss | 深渊领主 | 48 | 220 | 95 | 36 | 120 | — | 三阶段，血量走 `BOSS_HP_CURVE` 乘算 |
| goldkind | 金怪 | 13 | 20 | 110 | 4 | 8 | 16 | 宝箱章混入，掉 16 金 |

### 5.2 波次曲线

| 常量 | 值 | 含义 |
|---|---|---|
| `WAVE_HP_EARLY_CHAPTERS` / `EARLY_RATE` | 5 / 0.02 | 前 5 章 +2%/章，第 5 章 ≈1.10（初始武器 + 挂机可随意通过的新手区） |
| `WAVE_HP_LATE_BASE` / `LATE_RATE` | 1.1 / 0.07 | 台阶段起点连续（不断层），+7%/章，第 20 章 ≈2.15（数值台阶，靠刷装备/强化破墙） |
| `WAVE_SPEED_RATE` | 0.01 | 移速每章 +1%，轻微压迫感，不破坏走位空间 |

```
spawnEnemy: hp = round(def.hp × waveHpMult(wave))，speed = def.speed × (1 + 0.01 × (wave−1))
```

### 5.3 登场曲线 `SPAWN_CURVE`（累计阈值上界，命中区间 = [上行阈值, 本行阈值)）

| kind | minWave | rBelow 累计上界 |
|---|---|---|
| god | 8 | 0.04（godOnly） |
| summoner | 6 | 0.08 |
| shieldguard | 6 | 0.13 |
| reflector | 6 | 0.19 |
| devourer | 6 | 0.25 |
| splitter | 5 | 0.32 |
| hider | 5 | 0.40 |
| tank | 3 | 0.50 |
| swift | 3 | 0.55 |
| swift | 1 | 0.45（仅波 1–2 生效，被前一行遮蔽） |

即：前 2 章纯基础怪（腐尸 55% + 迅捷 45%）；第 3 章起石巨压场 50%；第 5 章机制怪试水；第 6 章全面台阶。反射者（克高频弹幕）与吞噬者（吸收投射）刻意推迟到第 6 章，避免新手死于自己的弹幕。标定链三条教训：迅捷不可提到 tank 前（3–4 章石巨 50%→5% 曾致新手模拟 12 章崩）；波段宽度锯齿敏感（2%/4%/6%/7%/8% 在两道新手门槛交替崩，5% 是唯一双门槛全过且满程 22 章的稳定岛）；tank 扩带让位（0.65）虽过两门槛但章型模拟卡死第 5 章、地形聚合回落超标，已弃。兜底 `SPAWN_FALLBACK_KIND` = chaser。

### 5.4 特化机制常量

| 常量 | 值 | 含义 |
|---|---|---|
| `HIDER_CYCLE` / `HIDER_VISIBLE` | 5 / 3 秒 | 周期 5 秒，前 3 秒可见、后 2 秒隐身 |
| `SUMMONER_INTERVAL` / `SUMMONER_COUNT` / `SUMMON_SPREAD` | 4 秒 / 2 只 / 40 px | 召唤腐尸，落点 ±20px |
| `SPLIT_COUNT_DEFAULT` / `_GOD` / `_BOSS` / `SPLIT_SPREAD` | 2 / 4 / 2 只 / 30 px | 分裂幼体数（weak 变体不分裂），散布 ±15px |
| `REFLECT_RATE` / `REFLECT_RATE_BOSS` | 0.25 / 0.15 | 反射者/神之敌 25%；Boss 15%（机制重在牵制而非惩罚） |
| `FRONT_GUARD_DOT` / `MULT` / `MULT_BOSS` | 0.5 / 0.2 / 0.6 | cos > 0.5 即正面 60° 弧；卫士/神 ×0.2（近免疫），Boss ×0.6（保留打击感）；多方向/AOE 可绕过 |
| `AURA_MULT_CAP` | 1.5 | 光环每轴连乘封顶（安全阀，现表最大单轴 1.15）；派生值只影响当帧移速/接触伤害，不改写目标属性 |
| `tryRevive` | `hp = max(1, round(maxHp × mech.hpFrac))` | 还魂体，仅带 revive 机制且每只限一次 |

围圈与走位：已贴身不再前进，沿切向以 0.35 系数缓慢漂移（尸潮围成圈而非叠在目标身上）；每只敌人有固定左右偏好 `sin(id×7.31)×0.5+0.5`；贴身校正阈值 `stop×0.7`、重定位半径 `stop×0.8`；移动抖动 `1 + sin(id×12.9898 + pos.x×0.01)×0.08`（±8%，按 id 取哈希，测试须 `_resetEnemyUid` 归零）；冲锋 `dash` 落点钳制在战场矩形内，单次冲锋只结算一次（`chargeHit`）。

### 5.5 Boss

| 常量 | 值 | 含义与标定 |
|---|---|---|
| `BOSS_HP_CURVE` | base 5.0、growth √2 | `bossHpMult(stage) = 5.0 × (√2)^(stage−1)`；第 1 关 TTK ≈15s（2365hp）、第 7 关 ≈42s（18920hp），中间每关 ×√2(+41%) 几何增长（玩家战力近似乘性增长，相对难度平滑爬坡）；base 3.5→5.0 由 R13 按真机口径重锚 |
| `BOSS_PHASE2_HP` / `PHASE3_HP` | 0.6 / 0.25 | 三阶段阈值 |
| `BOSS_WEAK_HP_MULT` | 0.7 | 偶数关弱化变体：hp ×0.7、跳过 P2、无死亡分裂 |
| `BOSS_SLAM.charge` / `radius` / `damage` | 1.2 秒 / 220 px / 80 点 | P2 震击：红色预警 1.2s → 新星 80 伤害；与新手 maxHp 100 成对标定，可躲 |
| `BOSS_SUMMON.first` / `p2` / `p3` / `count` | 3 / 6 / 3 秒 / 2 只 | 入场 3s 首次，P2 每 6s、P3 每 3s（间隔减半），每次 2 只 |
| `BOSS_FRENZY_SPEED` | 1.4 | P3 狂暴移速倍率，同时震击停止 |

三阶段单调推进不回退：P1 100–60% 追击 + 反射；P2 60–25% 召唤 + 地面震击（蓄力锁定玩家位置快照 → 引爆，走位可躲），每次召唤事件附带一次震击蓄力；P3 <25% 狂暴。单发大伤害可跳过 P2 直达 P3，两次回调都触发；P1→P3 给入场缓冲 `bossSummonTimer = BOSS_SUMMON.first`，P2→P3 取 `min(剩余, BOSS_SUMMON.p3)`。

伤害预算锚点（技能层铁律）：以 `BOSS_SLAM`（80 伤 / 220px / 1.2s 蓄力）与新手 maxHp 100 为基准，精英单事件 ≤0.7×、变体首领附加层 ≤0.85×；`slam.charge ≥ 0.9` 保证可躲；`hideCycle` 隐身占比 ≤0.2 由表预算守门。

TTK 标定口径：锚点 = 单目标木桩 DPS（`measureBossDps`，确定性口径，`tests/boss.test.ts` 守窗口）。第 1 关到达态（凯尔核心 16 束 ×1.2s 齐射 + 20 章商店成长 + 强化，真机口径 = 章首清场 + 章型）≈163 dps，终局态（神装 + 成长 + 天赋）≈448 dps；旧版所有关统一 473hp → 到达态 ~10s、终局 ~2.5s，三阶段机制毫无存在感，故按曲线重标。

### 5.6 赛季主题怪（`game/data/seasonMonsters.ts`，4 季 × 30 = 120 行）

三条铁律：行为仍由基线 kind 决定（零新 AI）；同（主题 × 行为）组三轴倍率**组内均值恒 = 1.0**、单项 |mult−1| ≤ 0.15；`xp` 与 `radius` 一律继承基线（金币经济与碰撞几何不动），机制怪/精英/首领变体三轴钉死 1.0。

合成式：`hp = round(基线hp × hpMult)`、`speed = 基线speed × speedMult`（不取整）、`contactDmg = round(基线dmg × dmgMult)`；贴图键 `monster_<id>`，缺图回退 `enemy_<kind>`。档位配额：基础 ×8 / 迅捷 ×5 / 重甲 ×5 / 特性 ×6 / 精英 ×4 / 首领 ×2（每季）。

**S1 回响苏醒**（基线 chaser 30/72/8 等）

| 名(id) | behavior | HP× | 速× | 伤× | 机制/技能 |
|---|---|---|---|---|---|
| 回响行尸 echo_walker | chaser | 1.08 | 0.92 | 0.95 | — |
| 共鸣尸 resonance_body | chaser | 0.94 | 1.06 | 1.05 | — |
| 空鸣骸 hollow_hum | chaser | 1.12 | 0.96 | 0.90 | — |
| 低语腐尸 whisper_rot | chaser | 0.90 | 1.10 | 1.10 | — |
| 震颤尸 tremor_body | chaser | 1.02 | 1.00 | 1.00 | — |
| 回响壳 echo_shell | chaser | 1.13 | 0.90 | 1.15 | — |
| 余音骸骨 after_tone | chaser | 0.96 | 1.04 | 0.95 | — |
| 初醒尸群 first_awake | chaser | 0.85 | 1.02 | 0.90 | — |
| 颤音疾骸 vibrant_cadaver | swift | 1.10 | 0.92 | 1.04 | — |
| 残响掠影 afterimage_echo | swift | 0.95 | 1.06 | 0.92 | — |
| 谐振鬼 harmonics_ghost | swift | 1.00 | 1.00 | 1.10 | — |
| 速鸣骸 rapid_hum | swift | 1.10 | 1.12 | 0.96 | — |
| 回声追猎者 echo_lurker | swift | 0.85 | 0.90 | 0.98 | — |
| 共鸣甲壳 resonant_carapace | tank | 1.08 | 0.94 | 1.00 | — |
| 混响岩铠 reverb_rockmail | tank | 0.96 | 1.06 | 1.10 | — |
| 鸣盾行尸 huming_shieldwalker | tank | 1.14 | 0.88 | 0.92 | — |
| 回音巨壳 echo_giantshell | tank | 0.90 | 1.10 | 1.04 | — |
| 驻波重尸 standing_wave_hulk | tank | 0.92 | 1.02 | 0.94 | — |
| 裂鸣体 splitting_tone | splitter | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 消音隐者 mute_hider | hider | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 鸣伤反射者 wound_reflector | reflector | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 吸声者 sound_devourer | devourer | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 驻鸣护壁 hum_wallguard | shieldguard | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 回响之种 echo_seed | summoner | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 领鸣者 tone_leader | elite | 1.10 | 0.90 | 1.06 | aura |
| 深渊传声者 abyss_herald | elite | 0.92 | 1.08 | 0.94 | slam |
| 万骸指挥 myriad_bone_marshal | elite | 1.04 | 0.96 | 1.12 | deathSummon |
| 第一回音 first_echo | elite | 0.94 | 1.06 | 0.88 | charge |
| 初代回响 primeval_echo | boss | 1.00 | 1.00 | 1.00 | slam + summon |
| 空谷之主 empty_valley_lord | boss | 1.00 | 1.00 | 1.00 | deathSplit ×3 |

**S2 永冻深渊**（主题色 #5ac8fa）

| 名(id) | behavior | HP× | 速× | 伤× | 机制/技能 |
|---|---|---|---|---|---|
| 冻殍 frozen_cadaver | chaser | 1.10 | 0.90 | 0.95 | — |
| 霜壳尸 frostshell_corpse | chaser | 0.96 | 1.05 | 1.08 | — |
| 冰脉蠕体 icevein_worm | chaser | 1.04 | 0.98 | 1.02 | — |
| 寒晶骨 chillcrystal_bone | chaser | 0.88 | 1.12 | 0.90 | — |
| 凝霜行尸 rime_walker | chaser | 1.15 | 0.86 | 1.10 | — |
| 冰碴傀儡 icechunk_puppet | chaser | 0.92 | 1.10 | 1.05 | — |
| 永冻躯壳 permafrost_husk | chaser | 1.02 | 1.00 | 0.92 | — |
| 霜纹尸 frost_pattern_corpse | chaser | 0.93 | 0.99 | 0.98 | — |
| 冰面掠者 ice_skater | swift | 1.06 | 0.90 | 1.02 | — |
| 霜刃鬼 frostblade_ghost | swift | 0.94 | 1.08 | 1.10 | — |
| 寒风疾影 coldwind_dash | swift | 1.10 | 0.96 | 0.94 | — |
| 裂冰疾行 icebreak_sprint | swift | 0.88 | 1.12 | 0.96 | — |
| 凛冬猎犬 winter_hound | swift | 1.02 | 0.94 | 0.98 | — |
| 玄冰巨像 blackice_colossus | tank | 1.10 | 0.92 | 1.00 | — |
| 千年冻甲 millennium_frostplate | tank | 0.94 | 1.04 | 0.96 | — |
| 冰晶壁垒 icecrystal_bulwark | tank | 0.88 | 1.10 | 1.12 | — |
| 霜铠蠕王 frostmail_wormking | tank | 1.06 | 0.98 | 1.04 | — |
| 极寒壳 polar_shell | tank | 1.02 | 0.96 | 0.88 | — |
| 凝滞之触 stagnation_touch | chaser | 1.00 | 1.00 | 1.00 | **mech slowOnHit** |
| 冰雾隐者 icefog_hider | hider | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 碎冰反射 icebreak_reflector | reflector | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 融冰孳生 meltwater_spawn | splitter | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 寒渊吞噬者 coldabyss_devourer | devourer | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 冰脉护卫 icevein_guardian | shieldguard | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 极北守卫 farnorth_guard | elite | 1.08 | 0.90 | 1.10 | slam |
| 永冻祭司 permafrost_priest | elite | 0.94 | 1.10 | 0.94 | pulse |
| 冰脉母巢 icevein_broodmother | elite | 1.02 | 1.04 | 0.98 | summon |
| 霜咬巨狼 frostfang_wolf | elite | 0.96 | 0.96 | 0.98 | charge + slow |
| 深渊冰髓 abyss_icemarrow | boss | 1.00 | 1.00 | 1.00 | hideCycle + pulse(global) |
| 极渊之颚 polarabyss_jaw | boss | 1.00 | 1.00 | 1.00 | slam + devour |

**S3 熔火回响**（主题色 #ff9d2e）

| 名(id) | behavior | HP× | 速× | 伤× | 机制/技能 |
|---|---|---|---|---|---|
| 熔渣行尸 slag_walker | chaser | 1.12 | 0.92 | 1.04 | — |
| 焰壳尸 flame_shell_corpse | chaser | 0.90 | 1.08 | 0.96 | — |
| 灰烬蠕体 ash_worm | chaser | 1.05 | 1.00 | 0.90 | — |
| 焦骨 charred_bone | chaser | 1.08 | 0.88 | 1.12 | — |
| 燃烬傀儡 smoldering_puppet | chaser | 0.94 | 1.12 | 1.02 | — |
| 火脉尸 firevein_corpse | chaser | 1.00 | 1.05 | 0.88 | — |
| 熔核残躯 moltencore_remain | chaser | 0.85 | 0.96 | 1.15 | — |
| 烬灰爬行者 cinder_crawler | chaser | 1.06 | 0.99 | 0.93 | — |
| 火线掠者 fireline_raider | swift | 1.08 | 1.05 | 0.90 | — |
| 烈焰疾鬼 blaze_djinn | swift | 0.92 | 1.10 | 1.04 | — |
| 爆燃疾行 flashburn_sprint | swift | 1.00 | 0.93 | 1.12 | — |
| 火舌追猎 firetongue_hunt | swift | 1.14 | 0.90 | 1.02 | — |
| 焚风影 scorchwind_shade | swift | 0.86 | 1.02 | 0.92 | — |
| 熔岩巨像 lava_colossus | tank | 0.90 | 0.94 | 1.05 | — |
| 黑曜甲壳 obsidian_carapace | tank | 1.12 | 1.10 | 0.90 | — |
| 火成岩铠 igneous_mail | tank | 0.94 | 0.96 | 0.98 | — |
| 熔核壁垒 moltencore_bulwark | tank | 0.96 | 1.06 | 1.10 | — |
| 焦土重壳 scorched_heavyshell | tank | 1.08 | 0.94 | 0.97 | — |
| 余烬孕体 ember_broodmother | chaser | 1.00 | 1.00 | 1.00 | **mech deathPool** |
| 烟幕隐者 smokescreen_hider | hider | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 焰甲反射 flameplate_reflector | reflector | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 爆裂孕体 rupture_broodmother | splitter | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 熔口吞噬者 smeltmouth_devourer | devourer | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 火盾护卫 fireshield_guardian | shieldguard | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 熔核祭司 moltencore_priest | elite | 0.94 | 1.06 | 0.96 | barrage(aroundPlayer) |
| 火脉母巢 firevein_broodmother | elite | 1.10 | 0.92 | 1.02 | summon |
| 焚天巨像 skyburn_colossus | elite | 1.06 | 0.96 | 1.10 | barrage(field) |
| 燎原狼王 wildfire_wolf | elite | 0.90 | 1.06 | 0.92 | charge + ignite |
| 熔核之心本体 molten_heart_core | boss | 1.00 | 1.00 | 1.00 | slam + fireTrail |
| 教团之焰 cult_flame | boss | 1.00 | 1.00 | 1.00 | summon + deathSplit |

**S4 幽冥潮汐**（主题色 #9b6cff）

| 名(id) | behavior | HP× | 速× | 伤× | 机制/技能 |
|---|---|---|---|---|---|
| 冥潮浮尸 darktide_floatcorpse | chaser | 1.10 | 0.90 | 0.95 | — |
| 幽影壳 shade_shellhusk | chaser | 0.92 | 1.06 | 1.08 | — |
| 亡语骸 deathspeak_bones | chaser | 1.05 | 0.98 | 1.02 | — |
| 潮鸣腐尸 tidewail_rotter | chaser | 0.88 | 1.12 | 0.90 | — |
| 缚魂躯 soulbound_husk | chaser | 1.15 | 0.86 | 1.10 | — |
| 幽冥爬行者 nether_crawler | chaser | 0.94 | 1.10 | 0.96 | — |
| 汐灵 tideling_wisp | chaser | 1.02 | 1.00 | 0.92 | — |
| 归潮骸 returntide_skeleton | chaser | 0.94 | 0.98 | 1.07 | — |
| 潮影疾鬼 tide_shadeimp | swift | 1.06 | 0.92 | 1.02 | — |
| 幽冥掠影 nether_glideshade | swift | 0.94 | 1.10 | 0.96 | — |
| 亡魂追猎 wraith_stalker | swift | 1.00 | 1.04 | 1.08 | — |
| 汐闪影 tideflash_wraith | swift | 0.90 | 1.06 | 0.98 | — |
| 冥潮疾行者 darktide_sprinter | swift | 1.10 | 0.88 | 0.96 | — |
| 幽冥巨像 nether_colossus | tank | 1.10 | 0.92 | 1.00 | — |
| 亡者重铠 deadplate_armor | tank | 0.94 | 1.04 | 0.96 | — |
| 潮汐壁垒 tide_bulwark | tank | 0.88 | 1.10 | 1.12 | — |
| 缚魂甲壳 soulbound_carapace | tank | 1.06 | 0.98 | 1.04 | — |
| 冥渊重壳 darkabyss_heavyshell | tank | 1.02 | 0.96 | 0.88 | — |
| 还魂体 returning_soul | splitter | 1.00 | 1.00 | 1.00 | **mech revive** |
| 雾潮隐者 misttide_hider | hider | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 怨甲反射 grudgeplate_reflector | reflector | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 噬魂者 soul_devourer | devourer | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 亡语护冢 deathspeak_tombguard | shieldguard | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 引潮孕母 tide_broodmother | summoner | 1.00 | 1.00 | 1.00 | 纯换皮 |
| 剧团班主 troupe_ringmaster | elite | 1.08 | 0.92 | 1.06 | summon(swift) |
| 冥潮祭司 darktide_priest | elite | 0.94 | 1.08 | 0.96 | pulse |
| 潮汐墓守 tide_gravewarden | elite | 1.04 | 0.96 | 1.10 | slam + hideCycle |
| 百鬼统领 hundred_ghost_commander | elite | 0.94 | 1.04 | 0.88 | aura(dmg) |
| 剧团之主 troupe_master | boss | 1.00 | 1.00 | 1.00 | summon ×4 |
| 幽冥潮主 nether_tidelord | boss | 1.00 | 1.00 | 1.00 | pulse(global) + summon + deathSplit |

### 5.7 变体机制参数 `SEASON_MONSTER_MECHS`（3 原语）

| 机制 | 参数 | 设计注记 |
|---|---|---|
| `slowOnHit` 凝滞之触 | factor 0.7、duration 1.5 秒 | 玩家 240 → 168 仍可走位；≤0.6 即硬控（软控下限线）；1.5s < `CONTACT_HIT_CD` 0.8s × 2 → 贴脸最多叠两段快照；多只叠加快照取最长 |
| `deathPool` 余烬孕体 | radius 60、duration 4 秒、cap 6 | DoT 复用毒池口径 6 点/秒 × 0.25 tick；60 = 毒池基线 90 的 2/3；4s × 6dps = 24 点 ≈ 新手血墙 100 的 1/4；超上限驱逐最早一池 |
| `revive` 还魂体 | hpFrac 0.5 | 首次致死原地复活回 50% maxHp（基于波次缩放后），每只限一次，总有效血量 1.5×；复活后照常可被击杀/分裂 |

### 5.8 精英/首领技能参数 `SEASON_MONSTER_SKILLS`（24 键 × 11 原语）

预算纪律（对表断言）：锚点 = `BOSS_SLAM` 80 伤 / 220px / 1.2s 蓄力 + 新手 maxHp 100；精英单事件 ≤0.7×（≤56）、变体首领附加层 ≤0.85×（≤68）、蓄力 ≥0.9 秒、间隔 ≥6 秒、池伤 `duration × 6 ≤ 25`、隐身占比 ≤0.2、软控 factor > 0.6；radius 分档精英 110 / 变体首领 140（基线 220 的半分档）。技能不进 `balance-sim`（`seasonId = 0` 铁律）。

| 变体 | 原语 | 参数（first / interval / 其他） |
|---|---|---|
| abyss_herald | slam | 3 / 8 / charge 1.0 / radius 110 / damage 50 |
| farnorth_guard | slam | 3 / 8 / 1.0 / 110 / 55 |
| tide_gravewarden | slam + hideCycle | slam 同 abyss_herald（50）；hideCycle {cycle 7, visible 5.6}（隐身占比恰 0.2） |
| primeval_echo | slam + summon | slam {3, 8, 1.1, 140, 60}；summon {first 4, interval 9, count 2, chaser, childVariant echo_walker} |
| polarabyss_jaw | slam + devour | slam {3, 8, 1.1, 140, 65}；devour {healRate 0.5} |
| molten_heart_core | slam + fireTrail | slam 同 primeval_echo（60）；fireTrail {3, 7, radius 70, duration 4, cap 4} |
| myriad_bone_marshal | deathSummon | count 4、chaser、echo_walker（尸体处 ±`SUMMON_SPREAD`） |
| empty_valley_lord | deathSplit | count 3（覆盖式；weak 阀门不分裂） |
| icevein_broodmother | summon | {4, 9, 2, chaser, icevein_worm} |
| firevein_broodmother | summon | {4, 9, 2, chaser, firevein_corpse} |
| troupe_ringmaster | summon | {4, 9, 2, **swift**, tide_shadeimp} |
| cult_flame | summon + deathSplit | summon {4, 9, 2, chaser, firevein_corpse}；deathSplit {2} |
| troupe_master | summon | {4, 8, **4**, chaser, darktide_floatcorpse} |
| nether_tidelord | pulse(global) + summon + deathSplit | pulse {5, 10, charge 1.2, radius 0, damage 0, slow {0.8, 2}, global}；summon {4, 8, 3, chaser, returntide_skeleton}；deathSplit {2} |
| permafrost_priest | pulse | {5, 9, 1.0, radius 130, damage 22, slow {0.65, 2}} |
| darktide_priest | pulse | {5, 9, 1.0, 130, 28, slow {0.75, 2}} |
| abyss_icemarrow | hideCycle + pulse(global) | hideCycle {10, 8}（占比恰 0.2）；pulse {5, 10, 1.2, radius 0, damage 0, slow {0.85, 2}, global} |
| moltencore_priest | barrage | {5, 9, count 3, charge 1.0, radius 80, damage 36, aim aroundPlayer, spread 260} |
| skyburn_colossus | barrage | {5, 10, 6, 1.2, radius 70, damage 32, aim field, spread 0}（6 点 × 70px ≈ 560×996 战场的 3%） |
| first_echo | charge | {5, 9, windup 1.0, duration 0.6, speedMult 6, damage 34}（精英 52 × 6 ≈ 312px/s，位移 ≈187px ≈ 场宽 1/3） |
| frostfang_wolf | charge | 同上，damage 30 + slow {0.7, 2} |
| wildfire_wolf | charge | 同上 damage 30 无减速 + ignite {radius 55, duration 3}（3s × 6dps = 18 ≤ 25） |
| tone_leader | aura | {radius 130, speedMult 1.1} |
| hundred_ghost_commander | aura | {radius 130, dmgMult 1.15} |

技能运行时（`entities/enemy.ts`）：触发瞬间快照玩家位置生成 telegraph（pos/radius/charge/damage/slow/global/color），世界层倒计时引爆；冲锋三段状态机（待命 → windup 原地 → dash 直线，方向在 windup 结束时锁玩家快照，撞击每轮仅结算一次，位移钳制战场 ±半径）；光环每帧扫描派生（`updateEnemy` speedMult 入参、接触伤害乘 aura.dmg），存活载体 ≤10 只。

### 5.9 出场倾向（`SEASON_MONSTER_TENDENCY`）

`inSeason` 0.45（当季主题有该行为怪时的替换概率）、`offSeason` 0.15（仅别的主题有该行为）、`minChapter` 2（第 0–1 章新手区不换皮）。`rollSeasonMonster(behavior, seasonId, chapter, rnd)`：seasonId < 1 或 chapter < 2 → 不换；候选池 = 当前主题该行为全部变体，当前主题没有 → 回退其它已实装主题；掷 < 倾向概率则池中均匀取一，否则保持基线外观。

### 5.10 环境词缀（`game/data/envAffixes.ts`）

每次进关卡随机 1–3 个、不重复。

| type | 名 | 数值 | 克制 | 色 |
|---|---|---|---|---|
| reflect_field | 反伤领域 | `REFLECT_FIELD_RATE` 0.12（受击反弹 12%，与反射者自带 25% 不叠加） | 高频攻击型 | #4fc3f7 |
| heal_aura | 治疗光环 | `HEAL_AURA_RATE` 0.02（每秒回最大生命 2%） | 持续输出型 | #4dffc8 |
| space_warp | 空间扭曲 | 无参数常量（弹道弯曲） | 精准弹道型 | #c06cff |
| time_dilation | 时间膨胀 | `TIME_DILATION_MULT` 2（周期脉冲间隔 ×2，世界层 `globalPulseMult`） | 高频触发型 | #ffd76a |
| death_chain | 死亡连锁 | `DEATH_CHAIN_RADIUS` 90px、`_KNOCKBACK` 60；伤害 `max(1, round(maxHp × dmgPct 默认 0.25))` | 单体高伤型（鼓励 AOE） | #ff9d2e |
| mist | 隐匿迷雾 | `MIST_CYCLE` 5 / `MIST_VISIBLE` 3（全体敌人，与隐匿者同口径） | 依赖最近目标型 | #8f9bb3 |

`rollEnvAffixes(bias)`：count = randInt(1,3)；加权池 `w = max(1, round(bias[type] ?? 1))`（1 = 平权），按权重复制条目，抽中即移除该类型全部副本（不重复语义）。赛季主题的 `envBias` 见 §10.4。

---

## 6. 英雄 · 本命节律 · 独有技能

### 6.1 12 英雄（`game/data/heroes.ts`）

纪律：`HeroDef` **无数值**，纯人物包装。全部战斗语义由 `setId` 一个键派生；`releaseSeason` / `themeIndex` / `accentColor` 从 `sets` + `seasonSets` 派生；列表顺序 = `allSets()` 顺序（S1→S4，不二次排序）。英雄页恒 5 行详情（核心 / 两个互斥分岔 / 进阶 / 本命节律 / 套装），运行时读源表拼装。

| 英雄 | id | 称号 | setId | 套组 | 释放季 | themeIndex | 本命 | 挂机档 |
|---|---|---|---|---|---|---|---|---|
| 薇拉 | vera | 荆肤者 | thorn | 荆棘回响 | S1 | 0 | hit | hold |
| 凯尔 | kyle | 织雨工匠 | barrage | 弹幕风暴 | S1 | 0 | pulse | kite |
| 布兰 | bran | 燎原者 | ember | 余烬天灾 | S1 | 0 | kill | kite |
| 希雅 | sia | 霜语者 | frost | 极北冰脉 | S2 | 1 | hurt | hold |
| 诺拉 | nora | 界碑守卫 | glacier | 冰川界碑 | S2 | 1 | pulse | kite |
| 洛卡 | loka | 白啸猎手 | blizzard | 白啸霜刃 | S2 | 1 | combo | kite |
| 多兰 | doran | 陨星祭司 | magma | 熔核教团 | S3 | 2 | move | orbit |
| 莎莉 | sally | 薪火疫医 | plague | 熔毒瘟薪 | S3 | 2 | hurt | hold |
| 雷恩 | rayne | 雷殛佣兵 | cinderfang | 炽牙雷殛 | S3 | 2 | combo | kite |
| 薇洛 | willow | 剧团主哨 | phantom | 亡影剧团 | S4 | 3 | move | orbit |
| 奥登 | oden | 安可指挥 | requiem | 镇魂安可 | S4 | 3 | kill | kite |
| 缪 | mu | 噬灵巫祝 | veil | 雾缚噬灵 | S4 | 3 | hit | hold |

人物文案（`lore`，逐位）：薇拉「把挨下的每一下都长成刺，越贴身越不肯倒」；凯尔「给每台机子校过准星，落点密得像织雨」；布兰「先烧出一条路，再让余烬守住路口」；希雅「听得见冰脉低鸣，冰锥先半步冻住退路」；诺拉「射线穿过的地方就是界线」；洛卡「霜刀成幕齐射，一声白啸后只剩冰锥」；多兰「数着秒等陨星，熔岩封住不肯退的路」；莎莉「把毒云当药铺在路上，烧起来的才治」；雷恩「一份报酬咬五个目标，陨星是收钱的尾音」；薇洛「一声哨笛，雾里的亡者和灵狼都来谢幕」；奥登「骷髅列阵当前排，每场都要多演一遍」；缪「不追求一击，只把对手一点点耗死在雾里」。

第二本命候选 = `[本命, 两分岔技能节律]` 去重保序；该英雄任一关 3 星通关解锁，英雄页第 4 行点行切换，开局核心技能与挂机档随之改变。未选英雄兜底本命 = pulse。

### 6.2 六节律（`game/data/rhythm.ts`）

节律 = `TriggerType` 的 6 个常规值；`crit` / `elite` 两个隐藏触发器退出节律体系，转为稀有被动法宝附带效果。法宝不再自带随机触发参数，发动参数一律读本表。

| 节律 | id | 玩家名 | 打法 | 1 级发动参数 | 取值依据 |
|---|---|---|---|---|---|
| 受击 | hit | 受击 | 站桩承伤，怪越多越强 | `{}` 空（受击即触发） | — |
| 周期 | pulse | 周期 | 风筝走位，稳定输出 | interval 2.4 秒 | 旧随机池 1.2–3.5 的中位数 |
| 击杀 | kill | 击杀 | 滚雪球，尸潮爆发 | chance 0.35 | 旧 0.18+ → 0.35（不再叠触发器数） |
| 移动 | move | 移动 | 绕圈拉怪，一路留痕 | distance 240 px | 旧 300–600 → 240（一条节律撑全部法宝） |
| 连杀 | combo | 连杀 | 越快越猛 | count 5、window 3 秒 | 旧 3–6 → 5；窗 3s = `COMBO_WINDOW` |
| 低血 | hurt | 低血 | 绝境反打 | hpThreshold 0.5 | 旧 0.5–0.85 → 0.5 |

等级缩放（`RHYTHM_MAX_LEVEL` 5 级）：`RHYTHM_CD_PER_LEVEL` 0.08（间隔/冷却每级 −8%，下限 ×0.2）、`RHYTHM_THRESHOLD_PER_LEVEL` 0.06（连杀数与移动距离每级 −6%；击杀概率与低血阈值每级 **+6%**，钳 0.9）、`HIT_RHYTHM_WINDOW` 0.5 秒（受击节律同帧齐放窗口，0.5s 内只有一件受击法宝响应）。

```
rhythmIntervalMult(lv)  = max(0.2, 1 − 0.08 × (lv−1))
rhythmThresholdMult(lv) = max(0.2, 1 − 0.06 × (lv−1))
kill/hurt 阈值缩放       = base × (1 + 0.06 × (lv−1))，钳 0.9
```

逐档实算（pulse 取 1 位小数、kill/hurt 取 2 位、move/combo 取整、combo 下限 2）：

| 级 | interval 倍率 | threshold 倍率 | pulse.interval | kill.chance | hurt.hpThreshold | move.distance | combo.count |
|---|---|---|---|---|---|---|---|
| 1 | 1.00 | 1.00 | 2.4 | 0.35 | 0.50 | 240 | 5 |
| 2 | 0.92 | 0.94 | 2.2 | 0.37 | 0.53 | 226 | 5 |
| 3 | 0.84 | 0.88 | 2.0 | 0.39 | 0.56 | 211 | 4 |
| 4 | 0.76 | 0.82 | 1.8 | 0.41 | 0.59 | 197 | 4 |
| 5 | 0.68 | 0.76 | 1.6 | 0.43 | 0.62 | 182 | 4 |

（combo.window 恒 3 秒；hit 恒 `{}`，不随等级变化。）

挂机档参数 `AI_PROFILE_PARAMS`：`hold {maxContacts: 4, fleeHpPct: 0.35}`（贴身 110px 内敌数达 4 才躲 = 允许被三只围着打；血量 <35% 无条件躲；精英与普通怪同权）、`orbit {dodgeRadius: 60}`、`kite` 走逃逸分支。映射 `RHYTHM_AI_PROFILE`：hit/hurt → hold，move → orbit，pulse/kill/combo → kite。

### 6.3 独有技能结构（`game/data/heroSkills.ts`）

每英雄 4 技能 = 核心 1 + 互斥分岔 2 + 进阶 1。独有技能只出现在升级三选一、不花金币、不占法宝槽；核心开局自带并绑本命；分岔选中一个另一个永久消失，**选中即解锁该分岔的第 2 节律**；进阶改写核心规则；分岔带 `coreMorph`（真实载荷，进包立即改变主武器落点/残留）。

阶数与成长：`SKILL_MAX_RANK` 5，每技能 5 阶，升阶走装备等级成长 `upgradeEquipment`（+12%/阶），技能表不另写系数；下表 params 均为 **1 阶值**，2–5 阶伤害类主数值 ×(1 + 0.12×(阶−1))（5 阶 = ×1.48），半径/速度/持续等非伤害参数按 `upgradeEquipment` 规则同步（见 §9.1）。

分岔出牌档：`BRANCH_TEASE_LEVEL` 3（预告起始等级，让玩家在转折点前两次升级里知道该囤升阶还是节律强化）、`BRANCH_MIN_LEVEL` 5（最早出现等级，落在第 1 章末至第 2 章中——已拿首章法宝、见过商店再选方向才是有信息的选择）、`BRANCH_GUARANTEE_LEVEL` 8（仍未出现则必出；再晚分岔只剩 2–3 阶成长、第二节律解锁过晚）；5–7 级出牌概率五成。`OFFER_WEIGHTS = {skill: 3, rank: 2, rhythm: 1}`。R20 已取消「另辟蹊径·重置分岔」与「补给」兜底卡，池耗尽则不开弹层。

**章节节点层（V1.1，`game/data/heroBuild.ts`；合同见 [DESIGN-HERO-BUILD](DESIGN-HERO-BUILD.md)）**：薇拉 / 凯尔 / 薇洛三条路线把分岔从 5–8 级升级发牌搬到**第 2 章开章二选一**，并在第 4 / 8 / 12 章开章各加一层二选一节点；分岔技能 = 路线主动件，分岔 `coreMorph.loop` 承载主循环，节点 patch 改主循环。三层节点 = 2³ = 8 组合，不占升级槽 / 商店槽 / 共鸣计数。其余 9 英雄仍走原 5–8 级分岔，`branchPairDue` 对三原型直接返回 null。

### 6.4 专属技能表 · S1

**薇拉（thorn）**

| 技能 | kind | 节律（tune） | effect | 1 阶 params | 共鸣被动 → 共鸣名（补丁） |
|---|---|---|---|---|---|
| 荆棘圆环 | core | hit（baseline 0.7） | nova | damage 50、radius 200、speed 1、stackRadiusPer 0.06、stackPowerLoss 0.15、sustainHeal 6 | duration → 荆棘领域 {radiusMult 1.5, power 1.2} |
| 荆甲 | branch | hurt | shield | amount 8、duration 4；`coreMorph.loop.stackConsume`（满 6 付 3 + 内收圈 0.45× / ≤6 靶） | duration → 不朽荆甲 {durationMult 3, power 1.5} |
| 棘行者 | branch | move | magma_trail | dps 20、radius 56、duration 2.5；`coreMorph.loop.trailImprint`（踏迹 1 印/秒、3 印爆种 30/75px/≤4 靶） | split → 裂棘 {radiusMult 2} |
| 血棘 | advance | hit | drain | sustainHeal 4 | lifesteal → 饮血荆棘 {healMult 2} |

coreMorph：荆甲 `{castAtAttacker: true, radiusMult: 0.8}`（圆环改打来袭者脚下、半径 −20%）；棘行者 `{afterCastGround {radiusMult 0.6, duration 3, dpsPerDamage 0.12}, power 0.75}`（爆发 −25%，换地面残留）。V1.1 第 4/8/12 章各二选一节点（回护 / 穿棘 / 双向反刺 / 截阵 / 城垣 / 扎根 / 播种 / 接续棘径 / 折枝 / 花圃 / 孤花），见 [DESIGN-HERO-BUILD](DESIGN-HERO-BUILD.md) §3.1。

**凯尔（barrage）**

| 技能 | kind | 节律（tune） | effect | 1 阶 params | 共鸣 → 共鸣名（补丁） |
|---|---|---|---|---|---|
| 寒霜齐射 | core | pulse（interval 0.5 → 1.2 秒） | ray | damage 30、speed 620、radius 640、spread 16、pierce 1、slow 0.45、duration 2 | haste → 寒霜连射 {haste 0.5} |
| 弹幕风暴 | branch | combo | ray | damage 60、speed 620、radius 640、spread 8、pierce 1、slow 0.45、duration 2；`coreMorph.loop.overload` | power → 过载不熄 {power 1.5} |
| 冰晶狙猎 | branch | move | ray | damage 42、…、spread 3、…；`coreMorph.loop.marksB`（基础轮改 3 束同向） | pierce → 贯穿猎步 {pierce 2} |
| 冰晶穿刺 | advance | pulse | icelance | damage 40、speed 700、radius 640、homing 4 | chain → 冰晶弹射 {chainTargets 2} |

**布兰（ember）**

| 技能 | kind | 节律 | effect | 1 阶 params | 共鸣 → 共鸣名（补丁） |
|---|---|---|---|---|---|
| 连闪天火 | core | kill（底拍 3.0） | chain | damage 50、jumps 4、radius 380 | chain → 跨屏天火 {radiusMult 2} |
| 余烬脉冲 | branch | pulse | nova | damage 36、radius 150、speed 1 | duration → 余烬不熄 {radiusMult 1.4, power 1.2} |
| 燎原怒火 | branch | hurt | nova | damage 60、radius 420、speed 1 | explode → 燎原余爆 {explode {radius 120, damageMult 0.8}} |
| 引燃 | advance | kill | cloud | dps 12、radius 90、duration 3 | power → 叠燃 {power 1.5} |

### 6.5 专属技能表 · S2

**希雅（frost）**：极北权杖 core / hurt（threshold 1.4 → 0.7、baseline 0.8 → 2.4 秒）/ frost_ring {damage 40, radius 240, expandSpeed 260, slow 0.35, duration 1}，共鸣 duration → 永冻权杖 {durationMult 2, radiusMult 1.3}；冰壁 branch / hit / shield {amount 12, duration 4}，共鸣 power → 玄冰壁 {power 2}；霜行 branch / move / frost_ring {damage 25, radius 180, …}，共鸣 chain → 连环霜行 {radiusMult 1.5}；极北冰锥 advance / hurt / icelance {damage 55, speed 700, radius 640, homing 4}，共鸣 pierce → 贯北冰锥 {splitExtra 1, pierce 1}。

**诺拉（glacier）**：界碑冰棱 core / pulse（interval 0.5 → 1.2 秒）/ ray {damage 30, speed 620, radius 640, spread 5, pierce 3, slow 0.5, duration 2.4}，共鸣 pierce → 界线冰棱 {pierce 3}；界碑守誓 branch / hit / shield {amount 10, duration 5}，共鸣 duration → 不倒界碑 {durationMult 2}；碑前收割 branch / kill / ray {damage 36, …, spread 1, pierce 2, …}，共鸣 split → 分光收割 {splitExtra 2}；界碑霜环 advance / pulse / frost_ring {damage 30, radius 220, expandSpeed 260, slow 0.4, duration 1}，共鸣 haste → 疾霜界碑 {haste 0.3}。

**洛卡（blizzard）**：白啸霜刃 core / combo（count 0.6 → 3、baseline 0.4 → 1.2 秒）/ knife {damage 34, speed 560, radius 640, spread 12, pierce 1, slayDevourer 1.5}，共鸣 split → 白啸刃雨 {splitExtra 4}；猎息 branch / pulse / knife {damage 28, spread 3, …}，共鸣 haste → 疾猎息 {haste 0.3}；白啸疾奔 branch / move / knife {damage 30, spread 2, …}，共鸣 pierce → 贯奔霜刃 {pierce 2}；白啸冰锥 advance / combo / icelance {damage 60, speed 700, radius 640, homing 4}，共鸣 power → 破霜冰锥 {power 1.5}。

### 6.6 通用职业包 · S3/S4 五英雄

`BESPOKE_HEROES = [vera, kyle, bran, sia, nora, loka, willow]` 有专属表；其余五位（多兰 / 莎莉 / 雷恩 / 奥登 / 缪）走 `genericPack`（固定分岔/进阶参数，仅节律随本命改挂），R4 裁定按赛季逐批替换。

**薇洛（phantom，V1.1 专属表）**：影群哨笛 core / move / spirit_wolves {count 2, damage 14, duration 12}；狼群统帅 branch / hurt / icelance {damage 28, speed 700, radius 640, homing 4}，`coreMorph.loop.wolfPair`（双狼配对 3 记 → 头狼 2×14）；亡影剧团 branch / pulse（tune interval 1.25 → 3.0 秒）/ haunt_crown {damage 14, duration 4}，`coreMorph.loop.shadeTroupe`（替代狼槽、4 幕谢幕）；哨刃回响 advance / pulse / knife {damage 30, spread 4, pierce 1}。

包结构：核心 = 该英雄初始武器，挂本命节律，共鸣被动 `power →「<名>·极」` {power 1.3}；守势（branch）= shield {amount 30, duration 5}，节律 = 本命为 hurt 则改 hit、否则 hurt，共鸣 duration → 铁壁 {durationMult 2}；奔袭（branch）= knife {damage 24, speed 560, radius 640, spread 3}，节律 = 本命为 move 则改 combo、否则 move，共鸣 split → 疾奔刃雨 {splitExtra 3}；专注（advance）= 核心效果的第二发，节律 = 本命为 pulse 则改 kill、否则 pulse，params 的 damage/dps/heal/amount 各 ×0.6（四舍五入，其余键不变），共鸣 haste → 心流 {haste 0.5}。

| 英雄 | 本命 | 核心名 | 核心 effect + 1 阶 params | 守势节律 | 奔袭节律 | 专注节律 | 专注 scaled | tune |
|---|---|---|---|---|---|---|---|---|
| doran | move | 熔核之心 | meteor {damage 65, radius 160, delay 0.6} | hurt | combo | pulse | damage 39 | {distance 0.7} |
| sally | hurt | 瘟薪熔炉 | cloud {dps 15, radius 150, duration 4.5} | hit | move | pulse | dps 9 | 无 |
| rayne | combo | 炽牙雷殛 | chain {damage 44, jumps 5, radius 400} | hurt | move | pulse | damage 26 | 无 |
| oden | kill | 镇魂安可 | skeleton {count 2, damage 13, duration 14} | hurt | move | pulse | damage 8 | 无 |
| mu | hit | 雾缚噬灵 | spirit_wolves {count 3, damage 14, duration 10, healOnHit 1, retaliationHeal 0.6} | hurt | move | pulse | damage 8 | 无 |

未选英雄兜底 `GENERIC_HERO_SKILLS`：核心 = 飞刀阵 knife {damage 40, speed 520, radius 640, spread 16, pierce 1} 挂 pulse。

### 6.7 身份特効与调率常量

| 常量 | 值 | 依据（源码注释口径） |
|---|---|---|
| `LOKA_SLAY_DEVOURER` | 1.5 | 第 6 章吞噬者吃掉洛卡 25% 弹体（存活种子 7 是 16%），有效 DPS 993 → 644/秒、末 4 秒归零 → 击杀断供 → 连杀节律饥饿 → 只剩 1.2s 底拍；先把被吃掉的 25% 变有效输出再谈加伤。带此位弹体命中吞噬者（含吞噬技能载体）不被吸收、不喂血，并 ×1.5 伤害 |
| `MU_RETALIATION_POOL_PCT` | 0.6 | 第 10 章承伤是单秒尖峰（734）、回血是平滑流（501）；0.6 = 挨 100 下能追回 60 点血，由灵狼命中分多次发放，在 2.5s 半衰期内约追回六成尖峰 |
| `VERA_STACK_TUNE` | radiusPerStack 0.06、powerLossAtZero 0.15 | 每层半径 +6%（满 6 层 +36%）；零层伤害只剩八成五。罚项首版 0.35，R18 实测后收到 0.15——自动档她多数时间不在 110px 接触带，0.35 会让挂机变成纯惩罚 |
| `VERA_BRANCH_COST` | armorRadiusMult 0.8、walkerPowerMult 0.75 | 荆甲代价：圆环半径 −20%；棘行者代价：圆环爆发 −25%。R18 基线剖面：荆甲 21/21/19† HP 波动带 0.118，棘行者 21/17†/21 带宽 0.756，深度只差 0.7 章。荆甲半径代价与共鸣 ×1.5 同键，共鸣到手即覆盖代价 |
| `VERA_SUSTAIN` | coreHealPerSec 6、advanceHealPerSec 4 | 满层每秒回血（实际给量 = 值 × 层数比例 × dt，攒满 1 点入账）。旧的三条受击型回复（挨打回 2% / 棘肤 1.5% / 血棘每下 6 点）对她停用：R18 实测每秒承伤 7–30 对回血 60–120、四种敌情全净，天敌不成立；按最大生命比例给会无限成长，按秒/按层给才钳得住 |
| `VERA_STANCES` | [站定 still, 绕场 move] | 局首二选一的两态姿势；`DEFAULT_THORN_MODE` = still；贴身 110px 内涨层带接触记忆；R22 起姿势不再挂分岔，`sustainMode` 退役 |
| `CORE_RHYTHM_TUNE` | 见下 6 键 | 节律体系把周期统一 2.4s、事件节律共用阈值，但旧初始武器各有射速；调率只补「快而薄」那几位的节拍，不动伤害（用户裁定 A，2026-09-14） |
| `CORE_BASELINE_INTERVAL` | 3.0 秒 | 事件节律（hit/kill/move/combo/hurt）英雄的核心另带慢周期底拍保证冷启动（真机复现 bran/loka 13 秒阵亡 0 击杀）；3.0s 慢于周期英雄的 2.4/1.2s，不抢周期双雄身份。`baselineInterval = round(3.0 × baseline × 10) / 10`，`needsBaseline = core && rhythm ≠ pulse`，底拍挂 triggers[1] |

`CORE_RHYTHM_TUNE` 逐位：vera {baseline 0.7}（旧周期 2.0s 保底 + 受击爆发 → 底拍 2.1s）；kyle {interval 0.5}（旧 1.1s → 1.2s；12 英雄 × 2 种子复审 kyle 7/10 章掉队，束数回 16、节拍 1.2s）；nora {interval 0.5}（旧 1.2s → 1.2s，与 kyle 同拍，周期双雄对称）；loka {count 0.6, baseline 0.4}（连杀 5×0.6 = 3，底拍 1.2s；三档对照 1.5s → 11/6/21、1.2s → 21/17/7、1.05s → 6/7/21，取 1.2s）；doran {distance 0.7}（旧 1.4s → 移动 240×0.7 = 168 一发）；sia {threshold 1.4, baseline 0.8}（旧 1.8s 常驻 → 低血阈值 0.5×1.4 = 0.7，底拍 2.4s；R14 三种子：基线 Σ44、阈值 0.8 → Σ55、底拍 2.4s → 19/19/19 Σ57、伤 50 → Σ40，取底拍，阈值不再抬）。

---

## 7. 法宝 · 被动 · 遗物 · 共鸣（`game/data/artifacts.ts`）

### 7.1 主动法宝 14 枚（`ARTIFACT_DEFS`）

主动法宝 = 旧「效果层」（不带修饰器），挂在已解锁节律上发动；`innerCd` 是事件型节律的内置冷却（秒，周期节律不读）；共鸣两条派生自 `SKILL_AFFINITY`；挂到共鸣节律上即改名变形并叠 `morph` 补丁。

| 效果 | 法宝 | innerCd | 共鸣节律 | 变形名 | 变形说明 | 补丁 |
|---|---|---|---|---|---|---|
| knife | 飞刀符 | 0.4 | pulse, combo | 连杀飞刃 | 飞刀数随连杀（每 4 连杀 +1） | comboScale {per 4, cap 8} |
| nova | 新星符 | 0.6 | pulse, hurt | 护心新星 | 爆发时附带 1 秒护盾 | shieldOnCast {amountPct 0.08, sec 1} |
| skeleton | 骸骨符 | 1.0 | pulse, kill | 尸起骸骨 | 从尸体起身，数量 +1 | spawnAtKill, summonExtra 1 |
| cloud | 毒云符 | 0.4 | move, pulse | 毒径 | 收窄成连续毒径，持续翻倍 | radiusMult 0.7, durationMult 2 |
| ray | 冰射符 | 0.4 | pulse, hit | 反打冰射 | 朝来袭方向反打，穿透 +1 | aimAtAttacker, pierce 1 |
| chain | 雷链符 | 0.4 | kill, combo | 连杀雷链 | 跳数随连杀（每 3 连杀 +1） | comboScale {per 3, cap 8} |
| shield | 护盾符 | 1.2 | hurt, hit | 棘盾 | 吸收 ×1.5，持续 ×1.5 | power 1.5, durationMult 1.5 |
| drain | 汲取符 | 1.2 | hurt, hit | 绝境汲取 | 回复翻倍 | healMult 2 |
| icelance | 冰锥符 | 0.4 | pulse, kill | 连冻冰锥 | +1 发，穿透 +1 | splitExtra 1, pierce 1 |
| frost_ring | 霜环符 | 0.6 | move, hurt | 随行霜环 | 范围 ×1.3，持续 ×1.5 | radiusMult 1.3, durationMult 1.5 |
| meteor | 陨星符 | 0.6 | pulse, combo | 连杀陨星 | 范围 ×1.25，伤害 ×1.2 | radiusMult 1.25, power 1.2 |
| magma_trail | 熔迹符 | 0.3 | move, pulse | 不灭熔迹 | 持续 ×3 | durationMult 3 |
| spirit_wolves | 灵狼符 | 1.0 | kill, pulse | 食尸灵狼 | 尸体处扑出，数量 +1 | spawnAtKill, summonExtra 1 |
| haunt_crown | 冠冕符 | 0.6 | kill, combo | 连杀冠冕 | 亡影伤害 ×1.5，存活 ×1.5 | power 1.5, durationMult 1.5 |

`MorphPatch` 字段全集：power / radiusMult / durationMult / splitExtra / pierce / chainTargets / summonExtra / healMult / haste / shieldOnCast{amountPct, sec} / spawnAtKill / comboScale{per, cap} / aimAtAttacker / explode{radius, damageMult} / castAtAttacker / afterCastGround{radiusMult, duration, dpsPerDamage}（后两项由英雄分岔 `coreMorph` 使用）。

### 7.2 被动法宝 8 常规 + 2 稀有（`PASSIVE_DEFS`）

被动法宝 = 旧修饰器层升格为全局乘区；数值同 `modifierParams`（随装备等级缩放），叠放按出现序衰减。

| type | 名 | 稀有 | 全局乘区与作用位 |
|---|---|---|---|
| haste | 冷缩 | 否 | `s.haste += pct × decay^n`，受 0.7 上限（0.1 + level×0.004） |
| power | 增幅 | 否 | `s.power ×= (1 + pct × decay^n)`（0.15 + level×0.006） |
| duration | 恒久 | 否 | `s.durationBonus += sec × decay^n`（加算秒，randInt 1–3） |
| explode | 爆裂 | 否 | 只取首枚，`damageMult × decay^n`（radius 90–120、damageMult 0.8） |
| split | 分裂 | 否 | `s.splitExtra += cnt(extra)`（randInt 2–4） |
| pierce | 穿透 | 否 | `s.pierce += cnt(count)`（randInt 1–3） |
| chain | 连锁 | 否 | `s.chainTargets += cnt(targets)`（randInt 2–4） |
| lifesteal | 吸血 | 否 | `s.lifesteal += pct × decay^n`（0.04 + level×0.0015） |
| echo | 回响 | **是** | 不入 `statsOf`；结算在 `fire`（装备自带优先，无则读被动），固定 0.35 秒 / 0.5 倍 |
| condemned | 送葬 | **是** | 不入 `statsOf`；结算在伤害侧，多枚**叠乘**，固定 30% 血线 / ×1.45 |

叠加与槽位：`PASSIVE_STACK_DECAY` 0.6、`PASSIVE_STACK_CAP` 3、`passiveStackMult(n) = n ≥ 3 ? 0 : 0.6^n`（第 1/2/3 枚 = 1 / 0.6 / 0.36）；遗物叠加总倍率 `relicStack = Σ decay^n`；`PASSIVE_SLOTS` 4；商店三卡位固定被动格 `SHOP_PASSIVE_SLOTS` 1（第三格恒为被动，主动 : 被动 = 2 : 1）；稀有出货率 `PASSIVE_RARE_CHANCE` 0.06、遗物占比 `PASSIVE_RELIC_RATIO` 1/3（修饰器 : 遗物 = 2 : 1），稀有 2 种均分、遗物 8 种均分、常规 8 种均分。计数类取整 `cnt(v) = mult ≥ 1 ? v : max(1, round(v × mult))`（首枚至少 1）。

### 7.3 遗物 8 枚（`RELIC_VALUES`）

| id | 名 | 数值 | 结算位 / 上限 |
|---|---|---|---|
| dice | 命运骰 | rareChance 0.15 | 每枚使商店稀有被动出货 +15%（进 `generatePassive` 的 rareChanceBonus） |
| core | 裂核 | critRate 0.08 | 世界层暴击判定 +8% 暴击率 |
| hourglass | 沙漏 | haste 0.1 | `statsOf` 的 haste −10%，受 0.7 上限 |
| lens | 透镜 | radiusMult 1.12 | `statsOf` radiusMult，`×(1 + 0.12 × decay^n)` |
| stabilizer | 稳定器 | speedMult 1.25 | `statsOf` speedMult（飞刀/射线/冰锥读） |
| yoke | 磁轭 | magnetMult 1.4 | 拾取半径 ×1.4（`battleWorld.updateGems`） |
| mirror | 护心镜 | contactMult 0.85 | 接触伤害 ×0.85，作用于接触/震击/冲锋三处受击口 |
| spare_life | 假命 | chance 0.2、healPct 0.2 | 致死一击 20% 免死并回 20% 最大生命，每局 1 次，不叠 |

### 7.4 共鸣、发现与赛季共鸣

共鸣判定仅对 `kind === "active"` 且无 hiddenAffix 的法宝生效，按触发器序取第一条命中。共鸣数 = 挂共鸣节律的主动法宝数 + 拿到共鸣被动的独有技能数。两档 `RESONANCE_TIERS`：tier1 = 2 处（复用原 3 件档数值）、tier2 = 4 处（复用原 6 件档数值）；件套线 `SET_PIECE_TIERS` = 3 / 6 件仍在表内（与共鸣线正交计数）。首次达成展示 `DISCOVERY = {hitStop 0.4 秒, bannerSec 2 秒, 角标「本季新共鸣 / 回响共鸣 / 本季首发」}`，并入图鉴。

赛季共鸣格 `SEASON_RESONANCES`（每季 3 对新「法宝 × 节律」+ 1 枚赛季法宝）：

| 季 | pairs（效果 × 节律 → 变形名 / 补丁） | 赛季法宝 |
|---|---|---|
| 1 | 无（featured 展示位：cloud×move 毒径、ray×hit 反打冰射、chain×kill 连杀雷链） | null |
| 2 | frost_ring×hit → 霜甲环 {radiusMult 1.2, durationMult 1.3}；icelance×hurt → 绝境冰雨 {splitExtra 2, power 0.85}；ray×combo → 连杀冰束 {pierce 2, power 1.2} | s2_frost_jail |
| 3 | meteor×hit → 反击陨星 {power 1.3, radiusMult 1.1}；magma_trail×kill → 尸焰熔迹 {durationMult 1.5, explode {60, 0.4}}；nova×kill → 连爆新星 {power 1.2, explode {70, 0.5}} | s3_magma_core |
| 4 | skeleton×hurt → 绝境亡军 {summonExtra 2, durationMult 1.2}；haunt_crown×hurt → 濒死冠冕 {power 1.6}；spirit_wolves×move → 随行狼群 {summonExtra 1, haste 0.1} | s4_soul_call |
| ≥5 | 无表（只剩回响共鸣） | — |

赛季法宝 `SEASON_ARTIFACTS`（innerCd 口径：弹幕 0.5、AOE 0.6）：s2_frost_jail 霜牢符（icelance，innerCd 0.5，共鸣 hit → 冰牢 {splitExtra 2, pierce 1}）；s3_magma_core 熔核符（meteor，0.6，hit → 熔核反击 {power 1.4, explode {80, 0.5}}）；s4_soul_call 招魂符（haunt_crown，0.6，hurt → 招魂 {power 1.5, summonExtra 1}）。过季新格降为回响共鸣（改名保留、补丁减半）。

过季衰减 `SEASON_ECHO_MULT` 0.5，`echoMorph` 规则：乘区 `1 + (v−1) × 0.5`；整数项 `ceil(v × 0.5)`；haste `× 0.5`；shieldOnCast 的 amountPct ×0.5、sec 原样；explode 的 radius 原样、damageMult ×0.5；comboScale 的 per 原样、`cap = max(1, ceil(cap × 0.5))`；spawnAtKill / aimAtAttacker 开关原样；castAtAttacker 与 afterCastGround 不透传。

当季出货偏向 `SEASON_FACE_OFFER_CHANCE` 0.25：`rollSeasonVariant` 先掷 25% 出当季 face；未中则按 `avail / (8 + avail)` 在「已上市全部赛季法宝」与通用池 8 种间均摊（S2 1/9、S3 2/10、S4 3/11）；都不中 = 通用池。过季不再偏向，常驻可收藏。

---

## 8. 装备生成、词缀、融合、重随

### 8.1 效果基础白值（`game/data/equipmentGen.ts`，`g = 1 + (level − 1) × 0.12`）

| 效果 | 名/分类 | 白值 |
|---|---|---|
| knife | 飞刀投射 · 物理单体 | damage `round(18g)`，speed 520，radius 640，spread randInt(1,3) |
| nova | 火焰新星 · 火焰 AOE | damage `round(30g)`，radius `130 + level×4`，speed 1 |
| skeleton | 召唤骷髅 | count 1，damage `round(12g)`，duration 12 |
| cloud | 生成毒云 · 毒素区域 | dps `round(10g)`，radius 110，duration 4 |
| ray | 冰霜射线 · 冰霜单体 | damage `round(22g)`，speed 620，radius 640，slow 0.45，duration 2 |
| chain | 闪电链 · 闪电连锁 | damage `round(26g)`，jumps 3，radius 380 |
| shield | 护盾生成 · 防御 | amount `round(40g)`，duration 6 |
| drain | 生命汲取 · 恢复 | heal `round(20g)` |
| icelance | 冰锥 · 冰霜单体 | damage `round(55g)`，speed 700，radius 640，homing 4 |
| frost_ring | 霜环 · 冰霜扩散 | damage `round(25g)`，radius 240，expandSpeed 260，slow 0.35，duration 1 |
| meteor | 陨星 · 火焰落点 | damage `round(90g)`，radius 140，delay 1 |
| magma_trail | 熔岩足迹 · 火焰地带 | dps `round(12g)`，radius 60，duration 3 |
| spirit_wolves | 灵狼 · 召唤协战 | count 2，damage `round(14g)`，duration 12（引擎移速定值 273） |
| haunt_crown | 亡灵冠冕 · 召唤增殖 | count 1，damage `round(10g)`，duration 8（场上亡影上限 4） |

效果 1–8（knife…drain）为通用池 `GENERIC_EFFECT_TYPES`；9–14 只能由赛季套组卡池 `generateSetEquipment` 或赛季变体 `rollSeasonVariant` 产出。

### 8.2 词缀三轴（`game/data/affixes.ts`）

触发器 8 条（6 节律 + 2 隐藏）：

| type | 名 | 参数键 | 生成数值（重随/定向搜索通道） |
|---|---|---|---|
| pulse | 周期脉冲 | interval 秒 | `round1(rand(1.2,3.5) × max(0.6, 1 − level×0.012))` |
| kill | 击杀触发 | chance 0–1 | `round2(min(0.6, 0.18 + level×0.008))` |
| hurt | 受伤反应 | hpThreshold 0–1 | `round2(rand(0.5,0.85))` |
| move | 移动触发 | distance 像素（100px = 1m） | `round(rand(300,600))` |
| hit | 受击触发 | 空参 | — |
| combo | 连杀触发 | count、window 秒 | `count = randInt(3,6)`，`window = 2` |
| crit（隐藏） | 暴击触发 | 空参 | 节奏走 `combat.CRIT_TRIGGER_CD` 0.7 秒 |
| elite（隐藏） | 猎首触发 | 空参 | 击杀精英/首领即放，引擎不给概率也不给冷却 |

法宝的实际发动参数不读上面这组随机值，改读节律表（§6.2）；上述生成式只在重随与定向搜索通道用。

修饰器 10 条（8 常规 + 2 隐藏）：

| type | 名 | 生成数值 | 引擎作用位 |
|---|---|---|---|
| chain | 连锁 | targets randInt(2,4) | `s.chainTargets += cnt(targets)` |
| explode | 爆炸 | radius `90 + randInt(0,30)`、damageMult 0.8 | 只取首枚：`s.explode = {radius, damageMult × mult}` |
| split | 分裂 | extra randInt(2,4) | `s.splitExtra += cnt(extra)` |
| lifesteal | 吸血 | pct `0.04 + level×0.0015` | `s.lifesteal += pct × mult`（加算） |
| pierce | 穿透 | count randInt(1,3) | `s.pierce += cnt(count)`，与 `params.pierce` 叠加 |
| haste | 加速 | pct `0.1 + level×0.004` | `s.haste = min(0.7, haste + pct × mult)` |
| power | 增幅 | pct `0.15 + level×0.006` | `s.power ×= (1 + pct × mult)`（连乘） |
| duration | 持续 | sec randInt(1,3) | `s.durationBonus += sec × mult`（加算秒） |
| echo（隐藏） | 回响 | `HIDDEN_MODIFIER_VALUES.echo` {echoSec 0.35, echoMult 0.5} | 不入 `statsOf`；`fire` 排队 `echoTimer/echoMult`，二次触发 `s.power ×= dmgScale` |
| condemned（隐藏） | 送葬 | {condemnHp 0.3, condemnMult 1.45} | 不入 `statsOf`；伤害侧多枚叠乘 |

隐藏触发器/修饰器只走重随通道，不进常规池、图鉴、定向搜索。修饰器条数 = `qualityDef(q).modifiers`，同一次生成内类型不重复（shuffle 后 `i % types.length`）。词缀参数只随**装备等级**缩放，不随品质档位缩放；品质只给形态/射速/赠量/powerMult。

技能位字段（生成器不产出，仅英雄技能表携带）：`healOnHit`（>0 即开，回血 = 召唤物伤害 × `MINION_HEAL_ON_HIT_PCT` 0.3）、`retaliationHeal`（承伤 × 本值入反哺池）、`slayDevourer`、`stackRadiusPer` / `stackPowerLoss` / `sustainHeal`（荆棘层三件套，见 §3.3 与 §6.7）。

### 8.3 隐藏词缀 4 条（`game/data/fusion.ts`，仅融合产出、彩虹品质）

| type | 名 | 描述 | 色 | 引擎数值 |
|---|---|---|---|---|
| death_barrage | 死亡弹幕 | 击杀向所有方向发射 8 把飞刀 | #4dffc8 | 8 发、speed 620、pierce 1、damage `round((damage ?? 18) × power)` |
| supernova | 超新星 | 范围 +300%，每次触发后间隔 +1 秒（可叠加） | #ff9d2e | radius `(params.radius ?? 130) × 4`；pulse 触发器 `interval += 1`；knockback 200 |
| necromancer | 亡灵契约 | 受伤时骷髅翻倍且攻击回血 | #c06cff | count `(params.count ?? 1) × 2`、healOnHit true、hp `40 + level×6` |
| death_trail | 死亡轨迹 | 毒云永久留存（上限 10 个） | #4aa3ff | duration 99999；clouds 超 10 移除最旧 |

落上后 `applyHiddenAffix`：quality → hidden、name → 隐藏词缀名。

### 8.4 开局武器白值（`equipmentGen.ts`，全部 quality = common、level = 1、modifiers = []）

| id | 来源 | 触发器 | 效果参数 |
|---|---|---|---|
| 9000 | 默认（可完美蓝图指定效果） | pulse interval 1.2 | knife 覆盖 spread 16、pierce 1、damage 40 |
| 9001 | thorn 荆棘圆环 | pulse 2 + hit | nova damage 50、radius 200、speed 1 |
| 9002 | barrage 寒霜风暴 | pulse 1.1 | ray damage 30、speed 620、radius 640、spread 16、pierce 1、slow 0.45、duration 2 |
| 9003 | ember 连闪天火 | pulse 1.6 | chain damage 50、jumps 4、radius 380 |
| 9004 | frost 极北权杖 | pulse 1.8 | frost_ring damage 40、radius 240、expandSpeed 260、slow 0.35、duration 1 |
| 9005 | magma 熔核之心 | pulse 1.4 | meteor damage 65、radius 160、delay 0.6 |
| 9006 | phantom 影群哨笛 | pulse 2.5 | spirit_wolves count 2、damage 14、duration 12 |
| 9007 | glacier 界碑冰棱 | pulse 1.2 | ray damage 30、speed 620、radius 640、spread 5、pierce 3、slow 0.5、duration 2.4 |
| 9008 | blizzard 白啸霜刃 | pulse 1.05 | knife damage 34、speed 560、radius 640、spread 12、pierce 1 |
| 9009 | plague 瘟薪熔炉 | pulse 1.8 | cloud dps 15、radius 150、duration 4.5 |
| 9010 | cinderfang 炽牙雷殛 | pulse 1.5 | chain damage 44、jumps 5、radius 400 |
| 9011 | requiem 镇魂安可 | pulse 2.6 | skeleton count 2、damage 13、duration 14 |
| 9012 | veil 雾缚噬灵 | pulse 2.8 | spirit_wolves count 3、damage 11、duration 10 |

技能 id 段自 9100 起；装备 id 自 `++uid` 递增。

### 8.5 亲和词条（`game/data/reroll.ts`，共鸣格同源）

knife {pulse, combo} / {split, pierce} · nova {pulse, hurt} / {explode, power} · skeleton {pulse, kill} / {duration, power} · cloud {move, pulse} / {duration, power} · ray {pulse, hit} / {haste, pierce} · chain {kill, combo} / {chain, haste} · shield {hurt, hit} / {duration, power} · drain {hurt, hit} / {duration, lifesteal} · icelance {pulse, kill} / {pierce, power} · frost_ring {move, hurt} / {chain, duration} · meteor {pulse, combo} / {explode, power} · magma_trail {move, pulse} / {duration, explode} · spirit_wolves {kill, pulse} / {duration, haste} · haunt_crown {kill, combo} / {lifesteal, duration}。

### 8.6 重随与融合

| 项 | 值 / 公式 |
|---|---|
| 重随价格 | `rerollPrice(n) = round(12 × 1.5^n)`，n = 本章已重随次数，进下一章清零 |
| 重随隐藏概率 | `REROLL_HIDDEN.chance` 0.06 |
| 重随本局保底 | `pity` 12（连续 12 次未出必出）；与融合保底各自计数 |
| 亲和加权 | `AFFINITY_WEIGHT` 3（`SKILL_AFFINITY` + 出战套组 triggers/modifiers 一并进亲和池，加权不放回） |
| 重随不变项 | 效果 / 品质 / 等级都不变；条数上限 = 该品质 `triggers` / `modifiers` |
| 隐藏落点 | 仅替换首条触发器（`HIDDEN_TRIGGERS` 等权）与首条修饰器；该品质无修饰器槽时只给触发器 |
| 词缀重铸（天赋） | `reforgeEquipment` 只重随修饰器，每局 1 次 |
| 基本融合 | 两件合成一件，**必成功**；星尘是唯一门槛；触发器/效果/修饰器继承品质更高一方（同品质取 A） |
| 成品口径 | 等级 = `max(a.level, b.level)`；品质 = `max(rank)`；id 保留 A |
| 命名 | `融合·<触发器/><效果名>·<修饰器/>`；三重 `三重·…` |
| 隐藏保底 | `HIDDEN_PITY_N` 10 次融合必出，出货时抽 3 个互不重复候选三选一 |
| 三重融合 | 解锁门槛 = 已拥有天赋节点数 ≥ 6；成本 = 三件两两组合中最高融合成本 × 2；可保留双触发器或双修饰器（第二部件取其余装备中第一个含该部件者） |
| 融合成本兜底 | `FUSION_COST_FALLBACK` 60（含 hidden 的组合走此值） |

### 8.7 槽位与强化经济

| 项 | 值 / 公式 |
|---|---|
| 主动槽 | 基础 4 + 天赋最多 +2 + 本局广告 +1，硬顶 `SHOP_SLOT_CAP` 6（balance.json `economy.slotCap` 可覆盖，钳 4–32） |
| 槽位扩展价 | `round(100 × 2.3^n)`，n = 本局第 n 次购买（0 起）；可覆盖 `slotExpandBase` / `slotExpandGrowth`（钳 1–10） |
| 强化价 | `round(basePrice(quality) × (1 + (level − 1) × 0.6))` |
| 强化效果 | `ratio = g(level+1)/g(level)`，`UPGRADE_MAIN_KEYS`（damage/dps/heal/amount）各 `round(v × ratio)`；`radius ×1.03`；`level += 1` |
| 可强化条件 | `level < QUALITY_MAX_LEVEL[quality]`（5/8/12/16/20） |
| 升品数值比 | 每档 ×1.35，跨档 `1.35^(rank差)` |
| 销毁回收 | `basePrice × 0.5`；进化费用 `basePrice × 2`（2 张同款升档，3 张免费） |
| 三选一构成 | 已有装备时固定 1 张强化卡（随机一件现有装备的强化预览），其余新装备；同名去重重试 8 次；`ensureRare` 至少 1 件非 common（替换为 rare） |
| 流派配对补卡 | 有荆棘无回血 / 有回血无荆棘 → 重掷最多 30 次补一张互补卡 |

---

## 9. 套组、组合技、天赋、赛季新鲜感三层

### 9.1 12 套组定义（`game/data/sets.ts`）

归属规则：效果 → 套组多对一，14 效果各被恰好 2 套认领（28 条链接）；新套组复用既有效果、不新增攻击手段；共享套的质变档强度降档补偿（不到翻倍，×1.6 / ×1.5）。

| setId | 名称 | 主色 | effects | triggers | modifiers | 一档 | 二档 | releaseSeason |
|---|---|---|---|---|---|---|---|---|
| thorn | 荆棘回响 | #4dffc8 | drain, shield | hurt, hit | lifesteal, power | 棘肤 | 反伤回响·极 | 常驻(S1) |
| barrage | 弹幕风暴 | #5ac8fa | knife, ray | pulse, move | split, pierce, haste | 齐射 | 弹幕风暴·极（数量翻倍） | 常驻 |
| ember | 余烬天灾 | #ff9d2e | nova, cloud, chain, skeleton | kill, combo | explode, power, duration | 余烬扩散 | 元素天灾·极 | 常驻 |
| frost | 极北冰脉 | #5ac8fa | icelance, frost_ring | pulse, kill | power, pierce, haste | 锋寒 | 极北威压·极 | 2 |
| glacier | 冰川界碑 | #7fd8ff | ray, frost_ring, shield | hit, move | pierce, duration, power | 界碑铭刻 | 冰川裁断·极 | 2 |
| blizzard | 白啸霜刃 | #cfeeff | knife, icelance | pulse, kill | split, pierce, haste | 白啸 | 白啸霜刃·极 | 2 |
| magma | 熔核教团 | #ff9d2e | meteor, magma_trail | pulse, move | explode, duration, power | 地火奔涌 | 烈焰统治·极 | 3 |
| plague | 熔毒瘟薪 | #9ede4f | cloud, nova, magma_trail | kill, move | explode, duration, power | 瘟薪蔓延 | 熔毒瘟薪·极 | 3 |
| cinderfang | 炽牙雷殛 | #ff6b5a | chain, meteor | combo, hit | chain, explode, power | 炽牙 | 雷殛·极 | 3 |
| phantom | 亡影剧团 | #9b6cff | spirit_wolves, haunt_crown | kill, pulse | power, duration, haste | 群影 | 亡者行军·极 | 4 |
| requiem | 镇魂安可 | #c3a6ff | skeleton, haunt_crown | kill, combo | duration, power, split | 安可 | 镇魂安可·极 | 4 |
| veil | 雾缚噬灵 | #6fe0b8 | drain, spirit_wolves | hurt, pulse | lifesteal, duration, haste | 雾噬 | 雾缚噬灵·极 | 4 |

### 9.2 `SET_BONUSES`（29 键，唯一数值事实源）

一档（原「3 件」，现由共鸣 2 处触发）17 键：

| 键 | 值 | 含义 |
|---|---|---|
| thorn3HealPct | 0.015 | 每次受击回复最大生命 1.5%（只对不吃荆棘层的玩家；薇拉走层数） |
| thorn3HealCd | 0.5 秒 | 受击回血冷却 |
| thorn3StackGainMult | 1.5 | 对荆棘层积累倍率 ×1.5（薇拉这一档改为涨层更快） |
| barrage3SplitExtra | 1 发 | 额外弹幕数 |
| barrage3Haste | 0.08 | 触发间隔 −8%（叠入 haste） |
| ember3DurationSec | 1 秒 | 效果持续延长 |
| ember3RadiusMult | 1.18 | 效果范围 +18% |
| frost3RangeMult | 1.12 | 射程 +12% |
| magma3DurationSec | 1 秒 | 效果持续延长 |
| phantom3SummonPower | 1.2 | 召唤物伤害 +20%（仅召唤系） |
| glacier3RangeMult | 1.1 | 射程 +10% |
| blizzard3SplitExtra | 1 发 | 额外弹幕数 |
| blizzard3PierceExtra | 1 次 | 额外穿透数 |
| plague3RadiusMult | 1.12 | 范围 +12%（新套一律相乘口径） |
| cinderfang3ChainExtra | 1 个 | 连锁额外目标数 |
| requiem3SummonExtra | 1 只 | 召唤额外数量 |
| veil3HealMult | 1.25 | 回复量 +25% |

二档（原「6 件」，现由共鸣 4 处触发）12 键：

| 键 | 值 | 含义 |
|---|---|---|
| thorn6PowerMult | 2 | 受击/受伤触发系效果伤害翻倍 |
| ember6Mult | 2 | 元素效果范围与持续双双翻倍 |
| frost6PowerMult | 2 | 冰系效果伤害翻倍 |
| magma6PowerMult | 2 | 火系效果伤害翻倍 |
| phantom6SummonPower | 1.5 | 召唤伤害 ×1.5（数量另行翻倍再 +1 保底，引擎侧规则） |
| glacier6PowerMult | 1.6 | ray/frost_ring 伤害 ×1.6（共享套降档） |
| blizzard6PowerMult | 1.6 | knife/icelance ×1.6（共享套降档） |
| plague6PowerMult | 1.6 | cloud/nova/magma_trail ×1.6（共享套降档） |
| cinderfang6PowerMult | 1.5 | chain/meteor ×1.5（共享套降档） |
| requiem6SummonPower | 1.5 | 召唤物伤害 ×1.5（只动伤害轴，数量轴留给一档） |
| veil6HealMult | 2 | 回复量翻倍（数量/回复轴允许翻倍） |
| veil6Lifesteal | 0.05 | 附带吸血（伤害 ×5% 回血） |

弹幕风暴二档「数量翻倍」无独立数值键，由引擎规则 `splitExtra += max(1, splitExtra)` 结算。

### 9.3 跨套组合技（`game/data/combos.ts`）

三种「三部件同时在场」组合技，判定源已随法宝化改读**主动 + 被动法宝 id**，内容不变；跨装备/跨套组各 1 处即算。

| id | 名 | 主色 | 激活条件 | `COMBO_VALUES` |
|---|---|---|---|---|
| barrage_storm | 弹幕风暴 | #4aa3ff | 修饰器 连锁 + 分裂 + 穿透 | splitCount 3 发；splitDamageMult 0.3（击杀卡基础伤害 ×30%）；splitSpeed 520；haste 0.2（全装备触发间隔 −20%） |
| abyss_rift | 深渊裂隙 | #c06cff | 效果 新星 + 毒云 + 汲取 | durationSec 2 秒；poolDuration 3 秒；healRatio 0.4（总治疗 = 新星伤害 ×40%，按时长均摊）；poolCap 3 个（超出移除最旧） |
| thorn_aura | 荆棘光环 | #4dffc8 | 效果 护盾 + 修饰器 吸血 + 触发器 **hit**（受击，非 hurt） | reflectPct 0.3（受击反弹所受伤害 30%）；healMult 1.3 |

另有全场联动的「荆棘反伤回血流」：受击/受伤触发件 + 吸血/汲取/护盾回血来源同时在场 → 每次挨打回 `THORN_HEAL_PCT` 2% 生命、受击/受伤触发效果伤害 +50%（`combat.THORN_HEAL_PCT` + 商店配对补卡引导凑流派）。

### 9.4 天赋树（`game/data/talents.ts`，跨局永久）

30 节点、`TALENT_VALUES` 18 键。层级解锁：1 层无前置；N 层需已拥有至少 1 个同路线 N−1 层节点。路线全价：构筑师 91、效率专家 91、征服者 98。

构筑师 BUILDER（10 节点，合计 91）：

| id | 名 | 价 | 层 | 效果 |
|---|---|---|---|---|
| extra_gear | 额外武装 | 3 | 1 | 开局多带 1 件（主动槽 +1） |
| quick_start | 快速启动 | 2 | 1 | 首次升级所需经验 −20%（`firstXpScale` 0.8） |
| affix_taste | 词缀鉴赏 | 5 | 2 | 升级装备选项至少 1 件稀有品质（= `LEVELUP_ENSURE_RARE_TALENT`） |
| slot1 | 槽位扩展 I | 6 | 2 | 装备槽上限 +1 |
| targeted_search | 定向搜索 | 8 | 3 | 开局指定 1 种触发器，首次升级必出 |
| affix_preview | 词缀预览 | 7 | 3 | 升级选装备时显示词缀图鉴收录标记 |
| reforge | 词缀重铸 | 12 | 4 | 每局 1 次，重铸一张装备卡的修饰器 |
| slot2 | 被动槽扩展 | 10 | 4 | 被动法宝槽上限 +1（4 → 5） |
| universal | 万能适配 | 20 | 5 | 槽满时新装备不受同触发器类型冲突限制 |
| blueprint | 完美蓝图 | 18 | 5 | 开局从已解锁词缀选 1 个效果作初始武器 |

效率专家 EFFICIENT（10 节点，合计 91）：

| id | 名 | 价 | 层 | 效果 |
|---|---|---|---|---|
| offline1 | 离线增效 I | 2 | 1 | 委托收益 +15% |
| exp_gain | 经验加成 | 3 | 1 | 全局经验获取 +10%（`globalXpMult` 1.1） |
| offline2 | 离线增效 II | 5 | 2 | 委托收益额外 +15%（累计 +30%） |
| commission_speed | 委托加速 | 4 | 2 | 委托收益结算速度 +20%（`commissionSpeedMult` 1.2） |
| auto_pick | 自动拾取 | 7 | 3 | 全屏自动拾取经验宝石，无需走位 |
| loot_sense | 战利品嗅觉 | 8 | 3 | 稀有装备掉落概率 +5%（`rareBonus` 0.05，每点折 100 权重） |
| offline3 | 离线增效 III | 10 | 4 | 委托收益额外 +20%（累计 +50%） |
| double_commission | 双委托 | 12 | 4 | 可同时派遣 2 个委托任务 |
| time_compress | 时间压缩 | 18 | 5 | 委托实际耗时缩短 30%（`timeCompressScale` 0.7，等效速度 +43%） |
| eternal_factory | 永恒工厂 | 22 | 5 | 委托不受 12 小时封顶限制，持续积累 |

征服者 CONQUEROR（10 节点，合计 98）：

| id | 名 | 价 | 层 | 效果 |
|---|---|---|---|---|
| start_shield | 初始护盾 | 2 | 1 | 开局可吸收 50 点伤害 |
| vitality | 生命强化 | 3 | 1 | 最大生命 +15%（`maxHpMult` 1.15） |
| dmg1 | 伤害强化 I | 5 | 2 | 全局伤害 +10% |
| cdr | 冷却缩减 | 6 | 2 | 所有周期脉冲触发器间隔 −10%（`cdrScale` 0.9） |
| crit | 暴击精通 | 8 | 3 | 暴击率 +10%（`critRate` 0.1），暴击伤害 +25%（`critMult` 1.25） |
| elemental | 元素精通 | 7 | 3 | 火焰/冰霜/毒素/闪电伤害 +15%（`elementalMult` 1.15） |
| dmg2 | 伤害强化 II | 10 | 4 | 全局伤害额外 +15%（累计 +25%） |
| desperate | 绝境爆发 | 12 | 4 | 生命 <20% 时伤害 +50%（`desperateHpThreshold` 0.2、`desperateMult` 1.5） |
| endless | 无尽模式 | 20 | 5 | 解锁无尽挑战，波次无限递增，记录最高波次 |
| god_challenge | 神之挑战 | 25 | 5 | 第 8 章起出现神级敌人（反射 + 隐身 + 正面减伤 + 分裂 4） |

接入状态：25 个节点已接入效果，5 个为占位（词缀预览、词缀重铸、万能适配、无尽模式、经验加成——金币经济下暂无生效入口）。

### 9.5 赛季新鲜感三层（`game/data/seasonSets.ts`）

全部为 `seasonId → 纯函数`（同赛季恒同配置），只作用玩家侧，**绝不折入怪物曲线**（数值墙不回头，`|mult − 1| ≤ 0.15`）。

L1 赛季主题（4 主题循环，`seasonThemeIndex = (seasonId − 1) % 4`）：

| 下标 | 主题 | 主色 | flavor | envBias（1 = 平权） |
|---|---|---|---|---|
| 0 | 回响苏醒 | #7a5cff | 深渊的第一声回响，唤醒了沉睡的武器套组 | 无 |
| 1 | 永冻深渊 | #5ac8fa | 寒雾凝成迷障，冰脉在冻土下低鸣 | mist 2、space_warp 2 |
| 2 | 熔火回响 | #ff9d2e | 余烬未冷，熔核教团在地底重燃炉火 | death_chain 2 |
| 3 | 幽冥潮汐 | #9b6cff | 亡者在雾中列队，应和亡影剧团的哨音 | mist 2 |

L2 常驻三套 mutation 池（每套 5 条，按 `pool[(seasonId − 1) % 5]` 轮换；下标 0–3 = S1–S4，4 = S5 起复用期）：

| 套组 | 5 条 mutation（名 · 效果 · patch · 定向商店首个修饰器） |
|---|---|
| thorn | 棘刺过载 射程 +15% {rangeMult 1.15} bias explode · 冰鳞棘甲 生命回复 +15% {healMult 1.15} lifesteal · 熔核心搏 间隔 −10% {intervalMult 0.9} haste · 蚀骨之棘 伤害 +12% {dmgMult 1.12} power · 回响缠绕 持续 +10% {durationMult 1.1} duration |
| barrage | 过载装填 间隔 −8% {0.92} haste · 贯穿寒潮 伤害 +10% {1.1} pierce · 爆裂风暴 伤害 +12% {1.12} explode · 影刃齐射 间隔 −10% {0.9} split · 弹幕延展 射程 +12% {1.12} split |
| ember | 余烬滋养 持续 +15% {1.15} duration · 余烬封霜 射程 +10% {1.1} split · 燎原之势 范围 +15% {1.15} duration · 群影盛宴 持续 +12% {1.12} chain · 星火燎原 伤害 +10% {1.1} power |

L2 赛季套组的当季专属「赛季联动」词缀（仅当季新发布时生效，双 patch 比常驻套稍强，过季回落 null）：

| setId | 词缀 | 效果 | patch | bias |
|---|---|---|---|---|
| frost | 凛冬已至 | 伤害 +10%、间隔 −8% | {dmgMult 1.1, intervalMult 0.92} | haste |
| glacier | 界碑寒压 | 射程 +12%、间隔 −8% | {rangeMult 1.12, intervalMult 0.92} | pierce |
| blizzard | 白啸潮 | 伤害 +10% | {dmgMult 1.1} | split |
| magma | 过热地脉 | 持续 +15% | {durationMult 1.15} | duration |
| plague | 瘟火同焚 | 持续 +12%、伤害 +8% | {durationMult 1.12, dmgMult 1.08} | duration |
| cinderfang | 雷殛余温 | 间隔 −10%、伤害 +8% | {intervalMult 0.9, dmgMult 1.08} | chain |
| phantom | 亡影谢幕 | 召唤物伤害 +25% | {summonMult 1.25} | power |
| requiem | 安可返场 | 召唤物伤害 +15% | {summonMult 1.15} | duration |
| veil | 雾噬回响 | 生命回复 +15%、间隔 −8% | {healMult 1.15, intervalMult 0.92} | lifesteal |

L3 发布季与门控：发布季由 `SetDef.releaseSeason` 决定（frost/glacier/blizzard = S2，magma/plague/cinderfang = S3，phantom/requiem/veil = S4；常驻三套视作 S1），到赛季永久可选。`FEATURED_BY_SEASON = {2: frost, 3: magma, 4: phantom}`（当季代表套组，仅展示/文案锚点，非强化门控）。`isSeasonBoosted(seasonId, setId) = setReleaseSeason(setId) === floor(seasonId)`：命中时商店刷本套卡偏向 60% → 70% + 专属词缀；每季 3 新套同季受益，过季自动回落。`SeasonMutationPatch` 六轴：dmgMult / intervalMult（<1 = 更快）/ rangeMult / healMult / durationMult / summonMult。

---

## 10. 场内成长闸门：升级三选一、章间商店、金币经济

### 10.1 升级弹层（`game/data/levelUp.ts` + `game/data/reroll.ts` + `equipmentGen.generateChoices`）

| 项 | 值 | 含义与依据 |
|---|---|---|
| `LEVELUP_OFFER_COUNT` | 3 张 | 每轮弹层卡片张数（三张卡各带「选它 / 重随 / 锁定」） |
| `LEVELUP_LOCK_LIMIT` | 1 张 | 同时最多锁定，本局内跨弹层记忆——只能囤一张好卡等钱，多锁就没有取舍 |
| `LEVELUP_FREE_REROLL_PER_CHAPTER` | 1 次/章 | 独有技能不花金币、金币重随退役，保留一次免费重随作「三张全是烂牌」的补救；进下一章清零 |
| `LEVELUP_ENSURE_RARE_TALENT` | affix_taste | 「三张里至少 1 件稀有及以上」保底的开关天赋，与商店进货共用同一判据 |
| `FIRST_PICK_COUNT` / `FIRST_PICK_RESONANCE_GUARANTEE` | 3 张 / 至少 1 张 | 进第 1 章前的免费法宝三选一，其中至少 1 张与本命共鸣 |
| `OFFER_WEIGHTS` | skill 3 / rank 2 / rhythm 1 | 升级弹层三类候选的出牌权重 |
| `BRANCH_TEASE_LEVEL` / `MIN` / `GUARANTEE` | 3 / 5 / 8 级 | 分岔预告 / 最早出现 / 必出；5–7 级出牌概率五成 |
| `SKILL_MAX_RANK` | 5 阶 | 每个独有技能的阶数上限 |
| 池耗尽 | `open()` 返回 false → 不开弹层 | R20 撤销「另辟蹊径·重置分岔」与「补给」兜底卡；一局牌 ≈ 22–25 张（3 件技能各 5 阶 + 2 条节律各 5 级），实测每章约 2.5–3 级 → 约第 8–9 章发完 |
| 构成规则 | 已有装备时固定 1 张强化卡；同名去重重试 8 次；`ensureRare` 至少 1 件非 common（替换为 rare） | 强化预览取随机一件现有装备 |
| 流派配对 | 有荆棘无回血 / 有回血无荆棘 → 重掷最多 30 次补一张互补卡 | 引导凑成荆棘反伤回血流 |
| 重随价格 | `rerollPrice(n) = round(12 × 1.5^n)`，n = 本章已重随次数 | 进下一章清零 |
| 重随出货 | 隐藏概率 0.06；本局保底 12 次（与融合保底各自计数） | 效果/品质/等级不变，条数上限 = 该品质 triggers/modifiers |
| 亲和加权 | `AFFINITY_WEIGHT` 3 | `SKILL_AFFINITY` + 出战套组 triggers/modifiers 进亲和池，加权不放回 |
| 词缀重铸（天赋） | `reforgeEquipment` 只重随修饰器，每局 1 次 | — |

**V1.1 章节节点层不走本表**：三原型的分岔（第 2 章）与节点（第 4/8/12 章）由 `heroBuild.buildStepFor` 在开章挂起，经 `LevelUpModel` 的 `build` 形态二选一提交；不占普通轮、不占商店卡位、不可重随 / 锁定。普通升级仍按本表每级发三选一。

### 10.2 章间商店（`game/data/shop.ts`）

| 项 | 值 | 含义 |
|---|---|---|
| 货架卡位 | 3 张（售罄后为 null，只有刷新有新货） | 内联于 `shop/ShopModel.ts:53` |
| `SHOP_PRICE_CURVE.perPurchase` | 0.18 | 本局每已购 1 张卡的后续加价（A4 由 0.12 上调） |
| `SHOP_PRICE_CURVE.perChapter` | 0.05 | 每章加价（A4 由 0.03 上调） |
| `SHOP_REFRESH_CURVE` | base 8 金 / +2 金每章 / ×1.6 每次 | 手动刷新价，本章内递增，进下一章清零 |
| `MERGE_FEE_MULT` | 2 | 2 张同款合并的补位费 = 品质基础价 × 2；**3 张免费** |
| `DESTROY_REFUND_RATE` | 0.5 | 销毁回收 = 基础价 × 50% |
| `DUPLICATE_OFFER_CHANCE` | 0.4 | 把一张货替换为已持有卡的同款（给进化攒料） |
| `SET_OFFER_BIAS` | 当季强化套 0.7 / 常规套 0.6 | 刷出本套卡概率 |
| `RUN_AD_SLOT_LIMIT` | 1 次/局 | 本局广告开槽上限（对应第 7、8 槽），只设局上限、不设日上限 |
| 被动卡位 | 末 `SHOP_PASSIVE_SLOTS` = 1 格恒为被动；每章必见一张 | 主动 : 被动 = 2 : 1 |
| 卡等级 | `max(章节 + 1, 已解锁最高关)` | 出货数值档位 |
| 武器行 / 技能行展示上限 | 8 件 / 3 招 | 只读行，槽位钮下方 |
| 遗物「命运骰」 | 每枚给稀有被动出货 +15%（按叠加衰减） | 进货偏向 |
| 天赋「词缀鉴赏」 | 三张全无稀有+ 时首张强制重投 rare | 保底 |
| 同款补位负 id | `−(章节 × 100 + 1)` | 防撞号 |

```
卡价   = round(basePrice × (1 + 本局已购 × 0.18) × (1 + 章节 × 0.05))
刷新价 = round((8 + 章节 × 2) × 1.6^本章已刷次数)
强化价 = round(基础价 × (1 + (等级 − 1) × 0.6))          // 满级五档轨迹见 §8.7
回收   = round(基础价 × 0.5)      补位费 = 基础价 × 2（2 张档）
广告开槽余量 = max(0, min(1 − runSlotBonus, SLOT_CAP − slots))
```

进化规则：保留修饰器最多那张；3 张摘 2、2 张摘 1；主数值按 `powerRatio` 四舍五入；屏面标题「进化(2 张同款 → 升档;3 张免费)」。

### 10.3 场内金币经济

| 项 | 值 | 含义 |
|---|---|---|
| `GOLD_PER_XP` | 1 | 击杀金币 = 敌人金币基数 × 本值（A4 由 2 下调；每日天赋「淘金」另乘 +50%） |
| `BOSS_GOLD` | 45 金 | Boss 固定掉落，不走上式（A4 由 60 下调） |
| `ELITE_GEM_COUNT` | 6 堆 | 精英掉落堆数，普通敌人 1 堆（A4 由 8 下调，因精英章原本是单章产出尖峰） |
| `DROP_SCATTER` | 10 px | 散布半径 |
| `GEM_PICKUP_DELAY` / `GEM_MAGNET_SPEED` | 0.4 秒 / 340 px/秒 | 掉落延迟吸附 / 吸附速度 |
| `GEM_MAGNET_RADIUS` | 420 px | 无自动拾取天赋的起始吸附半径（遗物「磁轭」×1.4） |
| 堆数上限 | `LIMITS.gems` 420（A4 由 300 上调） | 超额堆并入离玩家最近的一堆，金额守恒 |

```
goldValue = round((boss ? 45 : xp × 1) × dailyGoldMult)   // 普通 1 堆、精英 6 堆，每堆面值同为 goldValue
```

A4 重标的设计口径：出口侧补齐场内强化与升级重随两个深出口后，产出侧砍半，把「每章末余额」拉回「够买一张卡、但买不光货架」的区间。第 10 章量级参考：单章产出 ≈1000+ 金（间隔 `0.9×0.9⁴×0.96⁵ ≈ 0.48s`、第 6 章起每 tick 2 只、≈250 只 × 均值 5 金），同章出口 = 3 卡 ≈120 + 槽位 ≤230 + 刷新 ≤90。产出/出口比随章上移（第 15/20 章仍 > 1），后期盈余属设计意图，前提是盈余有地方去。

### 10.4 槽位与升级

| 项 | 值 | 说明 |
|---|---|---|
| 主动法宝槽 | 基础 4 + 天赋 ≤2 + 本局广告 1 | 硬顶 `SHOP_SLOT_CAP`：代码默认 6，当前 `balance.json → economy.slotCap` 覆盖为 **8**（合法域 4–32），见 §19 漂移点 |
| 被动法宝槽 | 4（`PASSIVE_SLOTS`）+ 天赋「被动槽扩展」1 | 不扩广告，硬顶 5 |
| 独有技能 | 不占槽 | 与主动法宝同列结算（`castList` 技能在前） |
| 升级经验 | `xpToNext(level) = floor(8 + 5·level + 1.0·level^1.5)` | 首次升级受天赋「快速启动」×0.8 |
| 每级生命 | +8 点 | 主成长来自装备/收藏/天赋，不来自等级 |
| 升级回血 | +20% 最大生命 | `LEVELUP_HEAL_PCT` |

---

## 11. 场外：体力、钻石、广告、转生、委托、通行证、扭蛋、收藏与每日

### 11.1 体力（`game/data/daily.ts`）

| 项 | 值 | 单位 |
|---|---|---|
| `ENERGY_MAX` | 20 | 点 |
| `ENERGY_REGEN_SECONDS` | 360 | 秒/点（6 分钟 1 点，10 小时回满） |
| `ENERGY_AD_GAIN` | 5 | 点/次 |
| `ENERGY_AD_LIMIT` | 5 | 次/日 |
| `ENERGY_DIAMOND_COST` | 10 | ◆（直接回满） |
| `STAGE_ENERGY_COST` | [5, 5, 6, 6, 7, 7, 8] | 点/关，超出取末项 |
| `ENDLESS_ENERGY_COST` | 3 | 点/次 |

```
regenEnergy: gained = min(floor((now − last) / 1000 / 360), MAX − energy)   // 满时不浪费已流逝时间，按整点推进时间戳
广告回体力 = min(MAX, energy + 5)      钻石回满 = energy = MAX（不看当前值）
体力不足 → startStage / startEndless 返回 false → 弹体力屏
```

### 11.2 钻石与广告闸门

| 项 | 值 | 单位 |
|---|---|---|
| `DIAMOND_PER_AD` | 1 | ◆/次（完整看完一次广告） |
| `DIAMOND_AD_DAILY` | 10 | ◆/日（按 `adWatchCount` 累计） |
| `DIAMOND_TICKET_COST` | 2 | ◆/券 |
| `SHOP_REFRESH_AD_LIMIT` | 5 | 次/日（登记值；Cocos 侧无消费方，商店刷新只走金币） |
| 广告回响礼包 | 100 点/次 | 主菜单回响筹码 |
| 每日宝箱内含钻石 | 银箱 5 / 金箱 10 | ◆ |
| 委托「辉钻矿脉」 | 2 ◆/小时（有效时长） | 直接产钻石的区域 |
| 钻石出口 | 体力回满 10、换券 2、补星 5 | ◆ |

广告点位逐条（全工程唯一出口 `GameShell.watchAd`，Web 侧 `src/game.ts:watchAd`；屏级动作一律不自建第二道闸门）：

| # | 场景 | 上限 | 计数口径 |
|---|---|---|---|
| 0 | `watchAd` 本身 | 无次数上限；在途 `adPending` 挡第二次点击 | 看完 `adWatchCount += 1` → 落盘 → 发本屏奖励；未看完走 `onFail` |
| 1 | 体力屏 +5 体力 | 5 次/日（`energyAdCount`） | 每日，跨天清零 |
| 2 | 体力屏钻石回满 | 无广告 | 10 ◆ |
| 3 | 扭蛋免费抽 | 1 次/日（`dailyGachaAdUsed`），不扣券 | 用尽后热区仍命中、由守卫静默 |
| 4 | 钻石换券 | 无广告 | 扣 2◆ 得 1 券 |
| 5 | 商店广告开槽 | 1 次/局（`RUN_AD_SLOT_LIMIT`） | 计数挂 `runSlotBonus`，开局归零即重置 |
| 6 | 通行证激活高级轨 | 1 次/赛季 | 写 `premiumPassSeason = seasonId`，翻页自然失效 |
| 7 | 每日宝箱开启 | 每箱 1 次，共 3 箱/日 | 每日 |
| 8 | 每日天赋解锁 | 今日 3 条中第 1 条免费，其余需广告 | 门控读已领条数 `< DAILY_TALENT_FREE` |
| 9 | 首通补领 | 1 次/日 | 今日已写 `makeUpDate` 或今日已首通即不可领 |
| 10 | 阵亡广告复活 | 1 + 天赋「不屈」1 = 最多 2 次 | 每局（`reviveUsed` 开局清零、不入档；复活本身不写存档） |
| 11 | 阵亡双倍回响 | 1 次/局 | `doubleClaimed` |
| 12 | 通关双倍回响 | 1 次/局 | 同上，取数 `pointsEarnedThisRun ‖ stageEchoReward(stageId ?? 1)` |
| 13 | 主菜单回响筹码 | 不设屏级上限 | 只受全局 `watchAd` 闸门 |

无广告位屏（`needsAd` 恒 false）：装备升级、委托、转生天赋、幻影榜、赛季结算、融合、关卡内重随。激励视频共 9 个产品化点位：死亡复活 / 结算双倍 / 体力补充 / 商店刷新 / 每日宝箱 / 扭蛋免费抽 / 补领 / 通行证高级轨 / 主菜单回响筹码。

### 11.3 回响与转生（`game/data/prestige.ts`）

```
回响点数 = floor(1 + floor(秒/60) × 0.5 + floor(击杀/1000) × 0.3 + (1 + 难度 × 0.2))
```

| 项 | 值 | 含义 |
|---|---|---|
| `PRESTIGE_FORMULA.base` | 1 | 每局保底（参与即有回报） |
| `.perMinute` | 0.5 | 每整 1 分钟存活 |
| `.perThousandKills` | 0.3 | 每 1000 击杀 |
| `.difficultyWeight` | 0.2 | 难度系数 = 1 + 难度 × 0.2 |
| `PRESTIGE_OVERFLOW_STARDUST_RATE` | 1:1 | 天赋树点满后溢出转星尘 |
| 回响跨天保留 | 40% 永久 / 60% 本日池 | `splitEcho`：`permanent = floor(total × 0.4)`，本日部分次日清空 |
| 死亡入账 | `points += permanent`、`dayEcho += day`、`prestiges += 1` | `settlePendingRun` |
| 难度实参 | 死亡路径恒 1 | — |
| 「开始新轮回」 | 不结算死亡、不产写入意图 | `prestiges` 计的是死亡结算次数；转生页唯一出口是开始新轮回，本页无返回路径 |
| 天赋买入三道守卫 | 已拥有 / `availablePoints < cost` / `isTierUnlocked(tier, routeOf(id))` | — |
| 开局配置通道 | 定向搜索（targeted_search）、完美蓝图（blueprint） | 均为瞬时态不入档；蓝图未选回落 `"knife"`；完美蓝图经 `BattleSimOptions.starterEffect` 现取 getter 注入 |

### 11.4 委托挂机（`game/data/commissions.ts`）

| 区域 | 产出 | 解锁 |
|---|---|---|
| 枯萎平原 | 30 碎片/小时（基础材料） | 转生 0 |
| 腐蚀沼泽 | 45 碎片/小时（毒素系词缀） | 转生 1 |
| 熔岩裂谷 | 70 碎片/小时（火焰系） | 转生 3 |
| 虚空深渊 | 110 碎片/小时（全类型） | 转生 5 |
| 星尘圣殿 | 25 星尘/小时 | 天赋树点满（构筑师全亮） |
| 辉钻矿脉 | 2 钻石/小时 | 转生 7 |

| 项 | 值 |
|---|---|
| 难度 1–5 | ×1.0/败 0%、×1.5/2%、×2.2/5%、×3.0/12%、×4.0/20% |
| 失败惩罚 | 收益 `floor(reward / 2)`，不额外扣分 |
| `COMMISSION_MAX_HOURS` | 12（默认结算封顶；天赋「永恒工厂」解除） |
| `COMMISSION_DECAY` | fullHours 2 → decayEndHours 4 → floorRate 0.5 |
| `COMMISSION_READY_HOURS` | 2（主界面红点门槛，与全额窗口同源） |
| `COMMISSION_TICKET_HOURS / MIN` | 每满 3 有效小时得 1 券，单次保底 1 张 |
| `FRAGMENT_TO_STARDUST` | 10 碎片 = 1 星尘 |
| 槽位 | 基础 1 槽；天赋 `double_commission` 解锁第 2 槽 |
| 天赋乘区 | rewardMult（离线增效 I/II/III，累计 +50%）、speedMult +20%、timeScale ≈1.43、uncapped |

```
speed        = speedMult × timeScale
t            = min(elapsed, 12 或 ∞) × speed
有效时长      t ≤ 2      → t
             2 < t ≤ 4  → 2 + 0.75 × (t − 2)          // 0.75 = (1 + 0.5) / 2
             t > 4      → 2 + 0.75 × 2 + 0.5 × (t − 4)
应得产出      = floor(baseRate × 难度倍率 × 有效时长 × rewardMult)
券数          = max(1, floor(有效时长 / 3))
兑换          = n = floor(碎片 / 10)，花 10n 碎片得 n 星尘
```

按真实时间结算，存档只记时间戳 → 关掉游戏继续积累；完成（有效收益 ≥ 2h）后战场 HUD 提示 + 主菜单委托钮红点，回主菜单领取。

### 11.5 通行证（`game/data/pass.ts`）

| 档 | need | 免费轨券 | 免费轨星尘 | 高级轨（×2） |
|---|---|---|---|---|
| 1 | 10 | 1 | 5 | 2 / 10 |
| 2 | 30 | 2 | 10 | 4 / 20 |
| 3 | 60 | 3 | 20 | 6 / 40 |
| 4 | 100 | 5 | 40 | 10 / 80 |
| 5 | 150 | 8 | 80 | 16 / 160 |

```
进度 = 永久回响(points) + 本日回响(dayEcho) + Σ关卡星数 × PASS_STAR_WEIGHT(2)
高级轨倍率 PASS_PREMIUM_MULT = 2；生效判据 premiumPass ‖ premiumPassSeason === seasonId
```

激活只写 `premiumPassSeason`、不发奖励（先看完激励视频）；赛季翻页需重新激活。领取口径：判完返回钮与激活行后，屏内其余任何位置都领 `PASS_TIERS[passTier]` 当前一档；`i < passTier` 即已领。进度条分母 = 末档 need 150。

### 11.6 扭蛋（`game/data/gacha.ts`）

| 项 | 值 | 含义 |
|---|---|---|
| `GACHA_COST` / `GACHA_10_COST` | 1 / 10 券 | 单抽 / 十连 |
| 品质权重 | common 55 / rare 30 / epic 12 / legendary 3 | 隐藏不进池 |
| `EPIC_PITY` / `LEGENDARY_PITY` | 10 / 50 抽 | 必出史诗及以上 / 必出传奇（`legendaryPity` 下界取 `EPIC_PITY`） |
| `EPIC_PITY_LEGENDARY_CHANCE` | 0.3 | 史诗保底触发时升格传奇 |
| `GACHA_10_GUARANTEE` | true | 前 9 抽无史诗+ 时第 10 抽强制史诗；触发时若 `pityLegendary < LEGENDARY_PITY − 1` 则清零（不消耗传奇保底） |
| 装备等级 | `5 + (highestStage − 1)` | 出货数值档 |
| 重复补偿 | 2 / 5 / 15 / 40 / 60 星尘 | 只看抽前收藏；同一发十连内同名两件都算不重复 |
| 开局带入 | 从收藏点选 1 件，同 id 再点取消 | — |
| 收藏加成读数 | 单实参 `collectionBonus(ownedGear)`，不传 gearLevels | 屏面口径 |

```
rollGachaQuality: pityLegendary ≥ 49 → legendary
                  pityEpic ≥ 9 → (roll < 0.3 ? legendary : epic)
                  否则按权重抽
```

### 11.7 收藏、装备升级与每日（`game/data/daily.ts`）

| 项 | 值 | 含义 |
|---|---|---|
| 每日宝箱 | 木：券 2 + 星尘 10；银：星尘 40 + 钻石 5；金：券 3 + 钻石 10 + 星尘 50 | 3 箱/天，各 1 次广告开启 |
| 每日天赋池 | 战意 伤害 +20% / 坚韧 生命 +30% / 淘金 金币 +50% / 疾咒 触发间隔 −15% / 幸运 暴击 +10% / 不屈 复活 +1 | 6 条，当日有效（数值墙内） |
| `DAILY_TALENT_COUNT` / `FREE` | 3 / 1 | 每日抽 3 条，1 条免费 |
| 天赋抽取 | 无重复袋子随机，当天固定 | 跨天键 `YYYY-MM-DD`（本地日） |
| 每日重置字段 | `adWatchCount`、`energyAdCount`、`dailyBoxClaimed`、`dailyGachaAdUsed`、`dailyTalentClaimed`、`dailyTalents` 重抽 | — |
| 收藏贡献 | 每件已收藏装备（不重复计）给 `COLLECTION_ATK_PCT[q] × (1 + 0.25 × 等级)`，HP 同理 | 永久基础数值，不提供卡牌效果 |
| `GEAR_UPGRADE_STEP` / `MAX` | 0.25 / 5 级 | 每级提升收藏贡献 25%，上限 5 级 |
| `gearUpgradeCost` | `(等级 + 1) × 15` → 15/30/45/60/75 星尘 | 升级价 |
| 等级索引键 | `gearLevels[装备名]`（同名不同品质共用一格） | 已知缺陷面：融合改卡名会让同一技能另起一格 |
| 装备升级屏行数上限 | `GU_ROWS_MAX` = 14 | 超出给截断提示 |
| 通关掉落 | 件数 = `1 + floor(关卡id / 2)`；等级 = 关卡 id | 收藏入口 |
| 重复掉落 | 折进 `DUPLICATE_STARDUST[品质]`，不入收藏 | — |

### 11.8 排行与幻影榜（`game/data/leaderboard.ts`）

| 项 | 值 | 含义 |
|---|---|---|
| `PHANTOM_COUNT` | 10 | 幻影条数；榜单行数恒 11 |
| 基线曲线 | `k < 8 → 12 + round(236 × (k/9)^1.8)`；次席（k=8）213；榜首（k=9）233 | 顶两名走独立基准，使投入度可区分、榜首现实可达 |
| 名次抖动 | `+ floor(rng × 5)`，且 `≥ 前一名 + 1` | 严格单调化 |
| 种子 | `s = seasonId × 48271 % 2147483647`，再 `s = s × 16807 % 2147483647` | 同 seasonId 恒同榜，翻页换榜，不落盘、无网络 |
| 玩家名次 | `1 + 严格大于玩家的幽灵数`，返回 1–11（11 = 未入榜）；同分共享名次 | 名次只做实时对照 |
| 名次提示 | 通关/死亡前后各算一次榜单，名次前进才给 `rankImprovedTo` | — |
| 关卡框徽标 | 仅 `frames` 非空时显示，框心数字 = `max(frames)`，贴图键 `frame_<frameQualityForStage>` | — |

真排行待后端；结算仍按赛季分 1:1 发星尘，无按名次发奖。

---

## 12. 赛季壳与结算

### 12.1 赛季骨架（`game/data/season.ts`）

| 项 | 值 | 含义 |
|---|---|---|
| `SEASON_DAYS` | 14 天 | 仅用于轮转与结算；关卡解锁**不按天数门控** |
| `DAY_MS` | 86,400,000 | 全项目唯一时间口径 |
| 赛季第几天 | `min(14, floor((now − start) / DAY_MS) + 1)` | 不足一天算第 1 天 |
| 到期判据 | `now − start ≥ 14 × DAY_MS` | 触发结算 |
| 关卡解锁 | `stageId ≤ 1` 常开；`stageId ≤ highestStage`；或前一关打到 `max(1, ceil(章节数 × 0.5)) = 8` 章 | 进度制 |
| 无限关 | `endlessOpen()` 恒 true | 常开，不再按天数门控 |
| `SEASON_STARDUST_RATE` | 1 | 1 赛季分 = 1 星尘 |

### 12.2 星数、首通、补星、补领

| 项 | 值 | 说明 |
|---|---|---|
| 星数口径 | ★1 通关 + ★1 剩余生命 ≥ 50%（`STAR_HP_THRESHOLD` 0.5）+ ★1 未用广告复活 | 恒 1–3；存档 `stageStars[id] = max(prev, stars)` 只升不降 |
| `THREE_STAR_TICKETS` | 5 券 | 3 星首达一次性奖励，并解锁该关头像框 |
| 关卡头像框 | 1–2 关 common、3–4 关 rare、5 关 epic、6 关 legendary、7+ 关 hidden | `STAGE_FRAME_QUALITY` |
| 第二本命 | 该英雄任一模 3 星通关 → 解锁开局节律二选一 | — |
| `STAR_MAKEUP_COST` | 5 ◆ | 仅 `stars === 2` 可补；扣 5◆ → 记 3 星 + 5 券 + 关卡框（与 3 星口同径） |
| 每日首通 | 券 ×2、回响 ×1.5（本日第一次通关任意关卡） | `FIRST_CLEAR_TICKET_MULT` / `FIRST_CLEAR_ECHO_MULT` |
| 首通补领 | 与首通同口径，基准取当前最高关 `stageId = clamp(highestStage, 1, 7)` | 当日未首通可看广告领 |

### 12.3 赛季分与结算

```
seasonScore = Σ(星数 > 0 ? 星数 × 10 : 0) + seasonBest
seasonBest  = 赛季内最佳（主线章节数与无限关波次同口径取大）
结算星尘    = floor(score × 1)
```

结算翻页：`stageStars` 清为全 0、`seasonBest = 0`、`seasonId += 1`、`startAt += 14 × DAY_MS`；关卡、收藏、天赋永久保留。离线跨多赛季用 `while` 逐轮结算，`stardustGain` 逐轮累加（首轮之外每轮加 0），摘要只留最近一次。上限参考：全 3 星 = 210 + 波次 31 ≈ 241 分，正压在榜首 233 之上。

通关推进：`highestStage = min(7, 通关关号 + 1)`；阵亡时 `recordStageProgress` 记本关最远章节，并更新 `bestRun` / `bestWave` / `seasonBest`（`bestRun` 只在更好时覆盖）。

### 12.4 结算屏与掉落

| 项 | 口径 |
|---|---|
| 通关屏热区 | 2 枚：双倍回响（带 `!doubleClaimed` 前置）与底部返回条；其余吞掉；返回落点 = menu |
| 阵亡屏热区 | 5 枚按序：复活 → 双倍 → 重开 → 天赋 → 菜单；复活与双倍形态不成立即穿透 |
| 阵亡屏复活上限 | `1 + (领了不屈 ? 1 : 0)`，文案「看广告复活(剩余 x 次)」 |
| 双倍回响取数 | `pointsEarnedThisRun ‖ stageEchoReward(stageId ?? 1)` |
| 关卡框解锁提示 | 仅 `stars === 3 && prevStars < 3 && frameNew` 时本屏出现；补星拿的框不走本屏 |
| 时间格式 | `m:ss`（分钟不补零、秒补零、向下取整） |
| 阵亡屏星尘行 | 死亡路径 `stardustEarnedThisRun` 恒 0，该支不出现（胜利屏才非零） |
| 通关掉落 | 件数 `1 + floor(关卡id / 2)`、等级 = 关卡 id；重复件折星尘 |
| 无限关 | 无尽章节，随机环境词缀，爽模式 |

---

## 13. 局内战斗运行时：流程、走位、结算管线、掉落

事实源：`game/systems/battleWorld.ts`（两端共用；Web 与 Cocos 都经 `@game` 别名 import 同一份，只有 FX 发射层分两端）、`battle/BattleSim.ts`、`battle/HudView.ts`、`battle/FxCore.ts`。

### 13.1 局内流程实现口径

| 环节 | 实现口径 |
|---|---|
| 计时 | `advance()` 内 `chapterTimer += dt`，≥ 60 秒 → `chapterEnd()` 并**当帧 return**（后续 Boss 生成与 FX tick 不跑） |
| 波次计时 | 独立变量 `waves.CHAPTER_LENGTH`，`wave = floor(waves.elapsed / 60) + 1`，`waves.elapsed` 跨章累加不重置 |
| 章末判定 | 非末章 → `recordStageProgress()` + `host.onChapterShop()`；末章（`chapter ≥ 15`）：有 `bossChapter` 且 `!bossDead` → `hp = 0, alive = false, onStageFailed()`，否则 `onStageCleared()` |
| 清场转章 | `nextChapter()` 原地清空 enemies / skillTelegraphs / projectiles / clouds / gems（**minions 不清**，按 `MINION_CARRY_SPREAD` 80 散布回场心），`fxLayer.reset()`，`bossSpawned = false`，重掷地形，玩家回竞技场中心 |
| 章首 burst | `round((6 + floor(chapter / 3)) × ct.burstMult)` 只，边缘随机出生（内缩 40px） |
| Boss 生成 | `!bossSpawned && waves.wave ≥ bossChapter(15)`；落点 = 玩家位 + (260, 60)，被 `BOSS_SPAWN_INSET` 60 夹进 arena；血量再乘 `bossHpMult`，偶数关 `bossVariant = "weak"` 再乘 0.7 |
| Boss 期停止刷怪 | `bossActive → spawnScale = 0 → interval = Infinity`，生成循环不再进入 |
| 升级闸门 | 世界层只上报级数（`addXp()` 内 while 跨多级，级数 = 前后 level 差 → `host.onLevelUp(levels)`）；宿主 `levelUpPending += levels`；`GameShell.update` 里 `if (levelUpModel?.visible) return;` **排在每日重置/赛季翻页之后、`sim.update` 之前** → 弹层开着战斗不推进；每轮选完 `-1`（姿势层与首章法宝层不占队列）；回战斗屏下一帧接着弹（队列自愈） |
| 共鸣时停 | `hitStop = DISCOVERY.hitStop` 0.4 秒，`advance()` 首行短路，只跑 `tickBanners(dt)` |
| 死亡 | `updatePlayer` 首行 `!p.alive → host.onPlayerDown()`；`BattleSim.onDeath()` 若 `world.over` 直接 return（与 `onStageFailed` 去重），否则 `over = true, pendingSettle = true`，预计算回响与名次后切 gameover 屏 |
| 免死（遗物假命） | `hurtPlayer()` 致死时 `trySpareLife()`：`relicStack("spare_life") > 0` 且 `rand < 0.2` → `alive = true`、`hp = max(1, round(maxHp × 0.2))`、附加护盾 `round(maxHp × 0.1)` 时长 1 秒、横幅「假命 · 免死一次」；本局限一次 |
| 复活 | `revive()`：`alive = true`、`hp = maxHp`、护盾清零后 `addShield(maxHp, 2)`、删除 70px 内敌人、`reviveUsed += 1`、`over = false`；`chapterTimer` 与玩家位置不改，复活本身不写存档 |
| 放弃本局 | `settlePendingRun()`：记最远章 → `splitEcho` → `bestRun/bestWave/seasonBest` → `prestiges += 1` → 落盘；必须排在任何 `startStage/startEndless` 前（`startRun()` 会清 `pendingSettle`） |
| 帧步长 | `step = min(dt, viewTable().battle.maxFrameDt = 0.05)` |
| 停闸 | 共三道：`levelUpModel.visible` → `router.blocksPlay()`（shop / gameover 等屏）→ dt 钳到 0.05；世界层内另有 `hitStop > 0` 一道 |

一帧顺序：`player → 连杀/狂潮/反伤预算 → globalPulseMult → engine → enemies → telegraphs → projectiles → clouds → minions → gems → waves → 章节计时 → Boss 生成与通关判定 → tickFx/tickDmg/tickBanners → 敌人上限裁剪`。

### 13.2 走位与姿势（三条互斥输入支）

| 支 | 判定 | 位移 |
|---|---|---|
| 手动 | `host.input.isMoving` | `pos += moveDir × 240 × speedMult × dt` |
| 挂机 | `!isMoving && autoMove` | 见下 |
| 静止 | 两者皆 false | 不积分（仅受石柱推挤） |

挂机档取值：`aiProfile = !stacked ? this.aiProfile : (gainMode === "move" ? "orbit" : "hold")` —— 薇拉的姿势直接接管挂机档（`stacked` 时站定 → hold、绕场 → orbit），`this.aiProfile` 在 `startRun()` 由 `heroAiProfile(hero, start)` 写入。

```ts
const nearest = nearestEnemy(p.pos, 110);          // 贴身闸
let dodge = !!nearest;
if (nearest && aiProfile === "hold") {
  if (stacked && gainMode === "still") dodge = hp/maxHp < 0.35;                  // 站定档只看血线
  else {
    let around = 0;  // 统计 110px 内存活敌数（精英与普通同权）
    dodge = around >= 4 || hp/maxHp < 0.35;                                      // hold 默认档
  }
} else if (nearest && aiProfile === "orbit") {
  dodge = hypot(nearest.pos, p.pos) <= 60;                                       // orbit
}
```

位移合成：`hold` + 有近敌 + 不撤 → 原地不动（站桩承伤）；有近敌 + 撤 → 单位反向向量 + 切向漂移 `(-dy, dx)/d × side × 0.6`，`side = sin(elapsed × 2.3) > 0 ? 1 : -1`（随时间翻转的确定符号，不是每帧新随机、也不是恒定值），整体归一化；无近敌 → 顺时针巡场 `ang = elapsed × 0.4`。边界：横向恒 `clamp(x, arena.x0 + 30, arena.x1 − 30)`，纵向 `arena.y0 + 16 … y1 − 16`（arena 宽 560，纵 = `battleBandY(worldH, bottomDockH)`）。

`movedThisFrame` 的口径：在手动支 / 挂机三支 / 静止支之后统一取 `hypot(pos − before)`，**并含石柱推挤的位移** → 姿势判定「本帧动不动」读的是这个合成后的数，被石柱挤开也算在动。`stacked` 由「castList 里是否存在带 `stackRadiusPer` 或 `sustainHeal` 的施放源」决定，与出战英雄无关；围数统计只看 `hp > 0`（不跳隐身目标，与 `nearestEnemy` 的口径不同）；`stacked = false` 时层数与接触记忆双双归零。

路由与帧闸门口径（`core/ScreenRouter.ts`）：`blocksPlay() = _current !== "battle"`，而 `_current` 的**初值就是 `"battle"`**（boot 期从不闸，dt 照常积分；首关尚未开局、`sim.started = false` 使 `advance()` 内部直接返回）→ 战斗真正被闸住的时刻只有升级弹层 `visible` 与 shop / gameover 等非 battle 屏。路由表无栈式回退（没有 `back()` 这类方法），屏层「返回」一律是显式屏键。

`nearestEnemy(from, range)` 的实现口径（重要事实）：哨兵 `bestD = range * range`（平方），循环内 `d = Math.hypot(...)`（线性），首个候选写入后为线性-线性比较 —— `range` 参数只在「无任何候选」时生效。同款哨兵见 `equipmentEngine.nearest()`；正确写法对照 `projectile.steerHoming`（`bestD = searchRange` 线性）。调用点：走位 110、连锁弹射 300、召唤物索敌 320、各 cast 用 `params.radius`（640/380/300）。该口径的影响与候选修法记在 §18。

贴身前提带与接触记忆：贴身闸 = `THORN_STACK.contactRadius` 110；围数统计有两处实现（平方距离 `cr2 = 110²` 与 `Math.hypot(...) <= 110`）。`thornContactEcho = max(contacts, thornContactEcho − 6 × dt)`，喂层读 `fed = thornContactEcho`；`moving = movedPx > 0.001`，`movedPx` 在位移与石柱推挤**之后**取样；记忆只放宽贴身前提，不放宽姿势条件；`stacked = false` 时层数与记忆双双归零。姿势落点由局首弹层 `setThornGainMode(mode)` 写入，`openStance()` 仅在 `heroStances(hero)` 非空（当前只有 vera）时开层，默认 `still`。

### 13.3 施放侧属性聚合顺序

`EquipmentEngine.statsOf()`：① 效果自带 `pierce` → ② 装备自带修饰器 → ③ 全局被动法宝（同 type 第 n 枚乘 `0.6^n`，n ≥ 3 跳过；遗物 hourglass/lens/stabilizer 在此折入）→ ④ 共鸣变形 `morphOf`（power/radiusMult/durationMult/healMult 连乘，splitExtra/pierce/chainTargets/summonExtra 加算，haste 钳 0.7）→ ⑤ 品质（haste + rateHaste 钳 0.7、power ×= powerMult、赠量按类别折算）→ ⑥ 套组一档 → ⑦ 套组二档 → ⑧ 赛季联动词缀 → ⑨ 组合技 → ⑩ 回响那一次 `power ×= dmgScale`（**放最后，覆盖以上所有乘区**）。

装备等级成长在**生成期**折进 params（`g = 1 + (level − 1) × 0.12`），结算侧不再乘。

乘区（连乘）：power / radiusMult / durationMult / healMult / speedMult。加区（累加后钳制）：haste（≤0.7）、durationBonus（秒）、splitExtra、pierce、chainTargets、summonExtra、lifesteal。`explode` 只取首枚；`echo` 与 `condemned` 不入 `statsOf`。

```
最终伤害      = round(params.damage × s.power)
持续          = (params.duration + s.durationBonus) × s.durationMult
触发间隔      = max(0.2, params.interval × (1 − s.haste) × rhythmIntervalMult(lv) × globalPulseMult)
移动节律阈值  = distance × (1 − haste) × rhythmThresholdMult(lv)
击杀判定      = rand < min(0.95, chance × (2 − rhythmThresholdMult(lv)))
连杀判定      = 窗口 params.window ?? 2 内计数 ≥ max(2, round((count ?? 5) × thresholdMult))
低血判定      = hp/maxHp ≤ min(0.95, hpThreshold × (2 − thresholdMult))，CD 1.2 秒
受击判定      = 同帧只放一件主动法宝（HIT_RHYTHM_WINDOW 0.5 轮转），独有技能不受约束；CD 0.7 秒
```

### 13.4 命中侧 `damageEnemy()` 结算顺序

| 序 | 结算 |
|---|---|
| 0 | 隐匿者隐身 → 整条 return（不结算） |
| 1 | 正面减伤：`dot ≤ 0.5` 不算正面，否则盾卫/神之敌 ×0.2、Boss ×0.6；`fm < 1` 出盾面火花 + 每 0.45 秒至多一条「盾 ×fm」读数 |
| 2 | `dmg ≤ 0 → return` |
| 3 | 全局增伤 `globalDamageMultFor(talents)`（dmg1 +0.10、dmg2 +0.15 累加） |
| 4 | `mult *= (1 + collectionBonus.atkPct / 100) × dailyDmgMult()`（每日战意 +20%） |
| 5 | 绝境：`生命 < 20% → mult *= 1.5` |
| 6 | 暴击：`critRate = 天赋 0.10 + 天赋另档 0.10 + 遗物 core 0.08 × relicStack`；命中 `mult *= 1.25`，并触发 `crit` 隐藏触发器（CD 0.7） |
| 7 | 元素精通：`type ∈ {nova, ray, cloud, chain} → mult *= 1.15` |
| 8 | 荆棘流增伤：`isThornBuild() && 来源带受击/受伤触发 → mult *= 1.5` |
| 9 | 送葬：`condemnedMultOf(目标血线) × passiveCondemnedMult(被动)`（依赖目标当前血量，只能在结算侧乘） |
| 10 | `dmg = round(dmg × mult)`；`≤ 0 → return` |
| 11 | 反伤领域：`kind ≠ reflector → applyReflect(max(1, round(dmg × 0.12)))` |
| 12 | 反射者/神之敌 ×0.25、Boss ×0.15 → `applyReflect()` |
| 13 | `e.hp −= dmg`，飘字 |
| 14 | 吸血：`player.heal(dmg × lifesteal)`（在扣血之后） |
| 15 | 击退（投射物命中力度 30） |
| 16 | `hp ≤ 0` → `tryRevive(e)`（还魂体首次致死原地复活，**不记击杀、不掉落**）→ 否则 `killEnemy()` |

反伤预算：`applyReflect` 取 `min(dmg, reflectBudget)` 并扣预算，预算每 1 秒重置为 `round(maxHp × 0.15)`。玩家承伤侧**无减伤乘区**，仅护盾先吸收；接触/冲锋/震击三路在调用前乘护心镜 `contactMult = 1 − 0.15 × relicStack("mirror")`。

词缀触发时机：`hurt` / `hit` 走 `engine.onHurt()`，紧跟 `hurtPlayer` 之后；`kill` 在 `killEnemy()` 末行；`crit` 在第 6 步乘区内。荆棘层消费点：`castNova` 的 `radius × (1 + 0.06 × stack)` 与 `damage × (1 − 0.15 × (1 − min(1, stack/6)))`，仅当施放源带 `stackRadiusPer` 或 `stackPowerLoss` 时 `stack = p.thornStack`，否则按 0；`sustainHeal` 逐帧累积 `sustainAcc += sustain × thornStackFrac × healMult × dt`，攒满 1 才入账，层数 0 时清零；`stackDriven` 为真时两条按最大生命比例的受击回血让位。

### 13.5 掉落与拾取（运行时口径）

```
goldValue = round((boss ? 45 : xp × 1) × dailyGoldMult())
堆数       = isElite ? 6 : 1                       // isElite 仅 kind === "elite"
落点       = 尸体 + rand(−10, 10)（x/y 独立）
吸附       magnetR = 自动拾取 ? ∞ : 420 × (1 + 0.4 × relicStack("yoke"))
           d < magnetR 且 d > 1 → pos += 单位向量 × 340 px/s × dt
拾取       d ≤ 16 + 8 → picked，gold += value
经验入口   player.addXp(e.def.xp)                   // 原始 xp，不乘 GOLD_PER_XP，也不乘 globalXpMult
```

`TALENT_VALUES.globalXpMult`（经验加成 ×1.1）在 `talents.ts` 定义但运行时未被调用；天赋「经验加成」因此无生效入口，属占位五项之一。敌人侧死亡结算另有：分裂（`skillSplitBabies ?? splitBabies`，god 4 / boss 2 / splitter 2，散布 ±15px）、`deathSummon`（±20px）、主题怪 `deathPool`、死亡连锁（`max(1, round(maxHp × 0.25))`、半径 90、击退 60）。

### 13.6 实体上限与 FX 节流

实体上限 `{enemies: 340, projectiles: 420, clouds: 44, minions: 24, gems: 420}`（内联于 `battleWorld.ts:151`，超限 `splice(0, len − cap)` 淘汰最早）；伤害飘字同屏上限 200；FX 粒子池 520、冲击环池 40；震屏幅度上限截断 10、每秒衰减系数 9、归零阈值 0.05。FX 发射节流窗（同一模式，逐类）：预警余烬 0.05 秒 × 6 追帧、陨星落点余烬 0.03 × 8、陨星坠落本体 0.016 × 4、领域云氛围 0.05 × 6、召唤物拖影 0.22 × 4、冲锋蓄力与 Boss 狂暴 0.05 × 6。

---

## 14. 宿主层：存档结构、帧调度、配置通道与引导

事实源：`GameShell.ts`（2695 行）、`levelup/LevelUpModel.ts`、`core/{SaveModel,SaveChannel,ConfigChannel,AdChannel,ViewTable,ScreenRouter}.ts`、`battle/BattleSim.ts`、`game/systems/onboarding.ts`、Web 侧 `src/systems/save.ts`。

### 14.1 存档结构（键 `echo-abyss-save-v1`，两端共用）

Cocos 走 `sys.localStorage`、Web 走 `platform.getStorage/setStorage`，同名键同结构。**没有版本号、没有 schema 迁移函数**：全部兼容由 `normalizeSave` / `loadSave` 的逐字段回落完成；读档异常时 Web 回空档、Cocos 归一化空档。唯一的「老档补齐」是 `applyHeroSelection`：老档只写了 `selectedSet` 时反查英雄并把 `selectedSet` 重写为 `heroDef(id).setId`。

| 字段 | 含义 | 初始值 | 归一化钳制 |
|---|---|---|---|
| `points` | 累计回响点数（含已花） | 0 | `Number() \|\| 0` |
| `availablePoints` | 可花点数（派生，**不入库**） | — | `points − Σ talentOf(id).cost` |
| `ownedTalents` | 已拥有天赋 id | `[]` | 非数组 → `[]` |
| `collection.{triggers,effects,modifiers,enemies,resonances}` | 词缀/敌人/共鸣图鉴，转生保留 | 全 `[]` | 缺省 `?? []`；`resonances` 仅 Cocos 侧有 |
| `bestRun` | 最佳局 `{kills, seconds}` | `null` | 只在更好时覆盖 |
| `bestWave` | 历史最高章节 | 0 | `\|\| 0` |
| `stardust` | 星尘（融合 / 装备升级货币） | 0 | `\|\| 0` |
| `gearLevels` | 收藏装备升级等级，键 = 装备名 | `{}` | 非对象 → `{}` |
| `gachaTicket` | 扭蛋券 | 0 | `\|\| 0` |
| `highestStage` | 已解锁最高主线关 | 1 | `max(1, ·)` |
| `stageFurthest` | 每关打到过的最远章节 | `{}` | 值 `max(0, ·)`，键转 number |
| `ownedGear` | 永久收藏装备 | `[]` | 非数组 → `[]` |
| `gachaPityEpic` / `gachaPityLegendary` | 扭蛋保底计数 | 0 | `\|\| 0` |
| `fusionPity` | 融合隐藏词缀保底计数 | 0 | `\|\| 0` |
| `selectedGearId` | 开局带入的收藏件 id | `null` | `?? null` |
| `dayEcho` | 本日临时回响（次日清空） | 0 | `\|\| 0` |
| `premiumPass` / `premiumPassSeason` | 高级轨持有（旧字段）/ 激活赛季 | false / 0 | `!!` / `\|\| 0` |
| `passTier` | 通行证下一可领档位 | 0 | `\|\| 0` |
| `prestiges` | 转生/死亡结算次数（委托区域解锁依据） | 0 | `\|\| 0` |
| `fragments` | 词缀碎片（10:1 兑星尘） | 0 | `\|\| 0` |
| `commission` / `commission2` | 进行中的委托（双委托天赋开第二槽） | `null` | `?? null` |
| `selectedHero` | 出战英雄（场外唯一事实源） | `null` | `normalizeHeroId`：非表内 id → null |
| `selectedSet` | `selectedHero` 的派生镜像 | `null` | 仅经 `applyHeroSelection` 写 |
| `heroRhythmUnlock` / `heroRhythmChoice` | 跨局解锁的第二本命 / 当前选用（仅 Cocos 侧） | `{}` | 非对象 → `{}` |
| `tutorialDone` | 首局引导已关闭 | false | `!!` |
| `energy` / `lastEnergyAt` | 体力 / 恢复时间戳 | 20（满）/ `Date.now()` | `Number() \|\| ENERGY_MAX`（0 也回落到满） |
| `diamond` | 钻石 | 0 | `\|\| 0` |
| `adWatchCount` / `energyAdCount` | 今日完整观看次数 / 今日广告回体力次数 | 0 | 跨天清零 |
| `dailyDate` / `dailyBoxClaimed` / `dailyTalentClaimed` / `dailyTalents` | 每日基准日与三项当日进度 | `""` / `[]` | `dailyTalents` 空即重抽 3 项 |
| `dailyGachaAdUsed` / `shopRefreshCount` | 广告免费抽已用 / 商店广告刷新次数 | false / 0 | `!!` / `\|\| 0` |
| `seasonId` / `seasonStartAt` | 赛季序号 / 开始时间戳 | 1 / `Date.now()` | `max(1, ·)` / `\|\| Date.now()` |
| `stageStars` | 各关历史最高星（索引 1–7，恒 8 格） | `[0×8]` | `floor` 后钳 0–3 |
| `seasonBest` | 赛季内最佳（章节/波次同口径） | 0 | 赛季翻页归零 |
| `dailyClearedDate` / `dailyClearedStage` | 每日首通日期 / 关卡 | `""` / 0 | `String` / `\|\| 0` |
| `frames` | 首次 3 星解锁的关卡框（关卡 id） | `[]` | 过滤到 1–7 后 `map(Number)` |
| `makeUpDate` | 广告补领当日首通日期 | `""` | `String(?? "")` |

会话态（不入档）：`levelUpPending`、`levelUpStanceThenFirst`、`gachaResults`（保留 8 条、只画前 5 条）、`seasonSummary`、`rankImprovedTo`、`runSlotBonus`、`branchChosen`、委托默认选中、开局配置通道（定向搜索 / 完美蓝图）。

### 14.2 启动与帧调度

启动次序：`refreshDesignResolution` → `loadBalance` → `applySharedBalance` → `loadViewTable` → `loadFrames(HUD_PRELOAD_KEYS 27 枚)` → `buildLayers` → `ready` → `router.show("menu")` → 后台 `loadFrames(restFrameKeys())` 流式补图（晚到只换贴图不重建）。每个 `await` 后以 `this.node` 验活，组件销毁即整条 boot 作废。

`GameShell.update(dt)` 每帧次序：

| # | 步骤 | 条件 |
|---|---|---|
| 1 | `tickToast(dt)` | 路由闸门之前；非战斗屏也自己收起（`hintTtl` 1.6 秒） |
| 2 | `tickHeroScroll(dt)` | 仅英雄屏（惯性解析积分 + 触界 snap） |
| 3 | `tickCommission(dt)` | 仅委托屏，每 1 秒重排；列表态（0 槽）跳过 |
| 4 | `tickEnergy()` | 仅体力屏，`sim.syncEnergy()` 后数值变了才重排 |
| 5 | `if (!ready) return` | — |
| 6 | `sim.syncDaily()` | **任何状态都跑**；变了则重排每日/扭蛋屏 + `refreshMenu()` |
| 7 | `tickSeason()` | **任何状态都跑**；真翻页先落账 → `router.refresh()` → 菜单态自动弹赛季屏 |
| 8 | 升级队列自愈 | `levelUpPending > 0 && !visible → openLevelUp()` |
| 9 | 弹层闸门 | `levelUpModel.visible → return`（战斗停住） |
| 10 | 路由闸门 | `router.blocksPlay()` = `current !== "battle"` → return |
| 11 | 步进 | `step = min(dt, 0.05)` → `joystick.update()` → `sim.update(step)` → 世界/FX/HUD 三视图 sync |

每日重置（`checkDailyReset`）：`needsDailyReset(dailyDate)` 为真 → 写 `dailyDate`，清零 `adWatchCount` / `energyAdCount` / `dailyBoxClaimed` / `dailyGachaAdUsed` / `dailyTalentClaimed`，重抽 `dailyTalents`（3 项无放回）；每次变更落盘。

开局漏斗与体力：`requestStage(id, bypassGate)` → `syncEnergy()` → `cost = STAGE_ENERGY_COST[min(id−1, 6)]`；不足则记 `energyPending` 闭包并弹体力屏，够则 `energy −= cost` + 落盘。`requestEndless` 同构（cost 3，无门控）。`restartRun` 用 `bypassGate = true` 重开当前关，且首行必须 `settlePendingRun()`。

结算与顶账：死亡与通关的账都在 `BattleSim`，宿主只切屏。死亡路径预计算 `pointsEarnedThisRun = calcPrestigePoints(elapsed, kills, 1)`、`stardustEarnedThisRun = 0`；放弃本局的三个出口首行必须 `sim.settlePendingRun()`（调用点：菜单选关、菜单无限关、`restartRun` 首行、死亡屏天赋/菜单出口、通关屏返回，共 6 处）。通关路径：`calcStars` → `stageStars[id] = max(prev, stars)` → 3 星解锁第二本命 → 成长倍率 `1 + 0.15 × (highestStage − 1)` → 每日首通券 ×2 / 回响 ×1.5 → 3 星一次性 5 券 + 关卡框 → 掉落件数 → `highestStage = min(7, id + 1)` → 落盘。

赛季 sync：每帧 `seasonRoll(saveSlice, Date.now())`；到期（`now − seasonStartAt ≥ 14 × DAY_MS`）后离线跨多季按 `while` 逐季结算（每季 `stardust += floor(seasonScore × 1)`、`seasonId + 1`、`seasonStartAt += 14 天`、`stageStars` 归零 8 格、`seasonBest = 0`），只留最后一轮摘要。

广告闸门：唯一入口 `watchAd(onOk, onFail)`。守卫 `adPending`（Web `adBusy` 同位）在途期间任何第二次调用直接 return；平台分流在 `AdChannel.showRewardedAd`——非微信环境按 `AD_SIMULATE_MS = 1000` 判「看完」，微信按 `res.isEnded`。计数口径：`ok` 时先 `adWatchCount += 1`，**再判 `adWatchCount <= DIAMOND_AD_DAILY(10)` 发 1 ◆**（即第 11 次起不发钻石），随后落一次盘，最后才调 `onOk()` 发本屏奖励。调用点 9 处 / 8 屏：主菜单回响筹码（`points += 100`）、商店广告开槽、每日宝箱与补领、通行证激活、扭蛋广告抽、死亡复活、死亡双倍、通关双倍、体力广告。屏级 action 层不再自建 pending 标志。

### 14.3 配置通道

`loadBalance()` 读包内 `resources/config/balance.json`（`JsonAsset`，离线可读）；`loadJsonTable` 带 `Map` 缓存。`num()` 只认有限数字、其余回落，**ConfigChannel 本身不做区间校验**，区间钳制在各 data 表自己的 `applyBalance` 里。分发：`energy` + `economy` → `daily`；`battle` → `stages`；`waves`（缺省时用 `battle.chapterSeconds` 合成 `{chapterLength}`）→ `systems/waves`；`chapterTypes`、`gacha`、`economy` → `equipmentGen`；`menuLayout` / `menuSkin` → 布局与皮肤两条通道。`viewTable.json` 实有段：`nineSlice / cardFrame / battle / fx / joystick / pool / hud / backdrop / phase3 / menu / lab`。

### 14.4 新手引导

生效门：`guide.enabled = !save.tutorialDone && currentStage?.id === 1`，同处 `guide.reset()`。驱动：`BattleSim.update` 每帧 `guide.update(world.guideCtx(true, false), dt)`；走完全部步骤置 `tutorialDone = true` 并落盘；跳过钮 → `guide.skipAll()` + 写 `tutorialDone`。状态机严格顺序，游标只在前一步条件满足时才推进；单条展示 `TIP_SECONDS = 8` 秒后自动收起，展示期间不再判断下一步。

| 步 | id | 推进条件 | 内容 |
|---|---|---|---|
| 1 | auto | `playing && elapsed > 2.5` | 自动挂机 |
| 2 | gold | `kills >= 8` | 金币 |
| 3 | shop | `c.shop` | 章间商店 |
| 4 | set | `c.shop` | 套组（文案按 `hasSet` 分两支，仍含 3/6 件套说法） |
| 5 | merge | `c.shop && mergesAvailable > 0` | 强化与进化 |
| 6 | chapter2 | `playing && chapter >= 2 && elapsed % 60 < 4` | 章节与敌情 |

实现事实：Cocos 侧 `guideCtx(true, false)` 的第二参恒为 `false`，且非战斗屏被路由闸门挡住 → 第 3–5 步的 `c.shop` 在 Cocos 侧无真值来源，游标停在第 3 步，`tutorialDone` 只能由「跳过」写下；Web 侧按 `state === "playing" / "shop"` 传真值，六步可走完。

### 14.5 调试与 dev-only 通道

| 端 | 通道 |
|---|---|
| Cocos | `F6` 切换挂机/手动；`WASD` / 方向键移动（优先于摇杆）。无 F1–F10、无 `?lab=1`、无控制台调试句柄 |
| Web 热键 | `1–3` 买商店卡；`Enter`/`Space` 下一章；菜单 `1–9` 选关、`e` 无限关、`g` 扭蛋、`t` 天赋、`p` 通行证、`c` 委托、`b` 每日、`u` 装备升级；`Escape` 取消确认/关 daily-energy-gearup/收赛季屏/回菜单；`R` 重开；`T` 死亡屏进天赋；`M` 回菜单；`F1`–`F4` 策划示例 Build（荆棘反伤 / 死亡连锁 / 移动炮台 / 融合演示）；`F5` 本日回响清零（模拟次日）；`F7` 委托快进 4 小时；`F8` 星尘 +100；`F9` 回响 +100；`F10` 整档重置 |
| Web URL / 控制台 | `#reset-save`、`?give=1`（点数/星尘 +1000、券 +100）、`?demo=triple`、`?bot=1`、`?fxdemo=meteor`；`window.game` 暴露实例与 `debugEquipThorn/Chain/Turret/FusionDemo()` |
| 布局台（dev-only） | `layout-lab.html` 载 `src/dev/layoutWorkbench.ts`；`←/→/↑/↓` 微调选中手柄（`Shift` = ±10）、`Escape` 取消；三条数据通道 `game/dev/{labModel,labSkin,labTable}.ts` 分别写 `balance.json` 的 `menuLayout` / `menuSkin` 与 `viewTable.json`（共 125 个可编辑字段：origin 37 + deco 88） |

真机验证走无头 Edge + CDP 探针（`.probe/`，整目录 gitignore）。验证门五道：`npm test`（vitest；`tests/` 现 71 个测试文件）、`npm run build`（`tsc --noEmit` + vite）、构建产物 grep（只看导出名/文案/像素，私有函数名会被打包器改名）、文案配对、`npm run typecheck:cocos`（屏层类型检查，基线 0 条零容忍）；另有 `npm run sync:cocos`、`npm run build:cocos`、`npm run smoke:cocos`、`npm run serve:cocos`。`errorTS = 0` 不等于做了类型检查——屏层必须由 `scripts/cocos-typecheck.mjs` 覆盖。

### 14.6 升级弹层的四个形态（同一套卡位承载）

`LevelUpMode = "levelup" | "first" | "stance" | "build" | "passives"`（`levelup/LevelUpModel.ts`）。五形态共用同一个 Model、同一片卡位矩形与同一条 `hitLevelUp` 命中链；每个动作只执行自己那一种语义，互不串味。弹层不挂路由键，靠 `visible` 停战。

| 形态 | 进入时机 | 卡源 | 可锁 | 可重随 | 选它之后 |
|---|---|---|---|---|---|
| `levelup` | 玩家升级、队列有余量（且当前在 battle 屏、二次确认层未开） | `heroSkills.rollSkillOffers`：分岔成对时先占两格，其余按权重不放回抽样（skill 3 / rank 2 / rhythm 1） | 是（1 张；换锁即释放上一格；锁定卡恒落第 0 格、下一轮必再出现；目标已满阶则丢锁） | 每章 1 次免费（`rerollsLeft() = max(0, 1 − rerolls)`）；用尽返回 false 且不改任何状态，宿主提示「本章免费重随已用完」 | 按 `kind` 分发：新技能 = 施放源 +1（`skills.push` + 记图鉴）并解锁该分岔第 2 节律、写 `branchChosen`；升阶 = 该技能阶数 +1；节律强化 = `player.rhythmLevelUp`（满级返回 false → `{ok:false, reason:"maxed"}`） |
| `first` | 进第 1 章前（本局 `equipment.length === 0`） | 每张 `generateEquipment(cardLevel, "common", false, rareBonus, rhythms, seasonId)`；同效果去重重试上限 8 | 否 | 换一张不同 `effect type` 的法宝（重试上限 12），不占本章次数 | 法宝数 +1、槽位随即可用（需 `freeSlots() > 0`） |
| `stance` | 局首，且英雄有姿势表（当前仅薇拉两态） | `heroStances(heroId)` 表原序，不排序不去重 | 否 | 钮存在但调用即拒（姿势不是可囤的牌） | `world.setThornGainMode(mode)` 写本局世界态（不入档），随后在同一层续开 `first` |
| `build` | 第 2 / 4 / 8 / 12 章开章，世界层挂起 `buildStep` | `heroBuild` 的路线 / 节点表原序，两张明牌 | 否 | 否（本局 / 本层锁定） | `world.commitBuild(id)`：分岔 = 技能入场 + 解锁节律 + 写 `branchChosen` / `buildBranchId`；节点 = 写 `buildNodes[tier-1]`。提交后立即算下一步（第 4 章补选分岔会紧接着弹节点） |
| `passives` | 商店「被动 n/4」钮借用本弹层 | 只读本局已装被动，每页 3 枚 | 否（锁定钮 = 关闭） | 重随钮 = 翻页 `‹ 第 p/pages ›`，不占重随次数 | 移除该枚被动并回收金币 `round(品质基础价 × 0.5)`，被动槽随之可用 |

- 共鸣保底（`first`）：三张里不足共鸣时按 `ARTIFACT_DEFS` 表序找第一个与本命节律共鸣的效果，替换首张，重试上限 40。
- 卡面等级与商店同一支：`cardLevel() = max(章节 + 1, 已解锁最高关)`。
- 稀有度只作卡面帧档（不改判定）：新技能 core/advance → rare、branch → epic；升阶 rare；节律强化 legendary；首章法宝共鸣时 hidden；姿势 epic；被动 rare → hidden 否则实际品质。
- 命中：`hitLevelUp` 按卡序、卡内「选它 → 重随 → 锁定」三钮矩形，九片之外一律 `null`（整屏吞掉）；返回键被吞、背景点击不关闭。
- 文案取数全在 `game/ui/levelUpText.ts` 的 `LV_TEXT`（Model / View / 测试三方读同一份）；三钮标签未锁「保留」→ 已锁「已保留」→ 锁定额占满「保留(已满)」；被动形态整卡热区文案是「销毁」；`tagFallback` / `tagReset` / `resetName` / `resetDesc` 四项随 R20 退场只留注释。
- 节律强化的实际效果只在卡面写「冷却 −8%、阈值放宽 6%」，事实源是 `rhythm.ts` 的 `RHYTHM_CD_PER_LEVEL` / `RHYTHM_THRESHOLD_PER_LEVEL`。
- 开局配置（定向搜索、完美蓝图）不在本弹层：由转生屏（`prestige/PrestigeModel.ts` 的 `hasTargetedSearch` / `hasBlueprint`）选取，写进宿主 `runConfig`，下一次开局经 `BattleSimOptions.starterEffect` 现取 getter 注入；不注入时逐位等于默认飞刀（id 9000），故战斗指纹不动。两者均为瞬时会话态，不入档。

---

## 15. 热调覆盖层现状（`public/config/balance.json`）

两份配置文件逐字节相同（`public/config/balance.json` 与 `cocos/assets/resources/config/balance.json`）；Web 侧经 `src/platform/balance.ts`、Cocos 侧经 `core/ConfigChannel.ts` 双通道读同一份，逐字段 `num(值, min, max, fallback)`，越界或非法即回退内置默认并告警；整段缺省 = 全部默认；微信小游戏端无外置配置，自动使用规范表默认值。`menuLayout` 与 `menuSkin` 段为布局/皮肤通道（本表玩法数值为主，字段口径见 `CONFIG-TABLES.md`）。

| 段 | 键 | 当前值 | 规范表默认 | 差异 |
|---|---|---|---|---|
| energy | max / regenSeconds / adGain / adLimit / diamondRefillCost | 20 / 360 / 5 / 5 / 10 | 同 | 同 |
| energy | stageCosts / endlessCost | [5,5,6,6,7,7,8] / 3 | 同 | 同 |
| economy | diamondPerAd / diamondAdDaily / diamondTicketCost / shopRefreshAdLimit | 1 / 10 / 2 / 5 | 同 | 同（`shopRefreshAdLimit` Cocos 侧无消费方） |
| economy | basePrice | 15/30/60/120/200 | 同（quality 主表） | 同；写入 `equipmentGen` 的 `QUALITY_BASE_PRICE` |
| economy | slotExpandBase / slotExpandGrowth | 100 / 2.3 | 同 | 同（金币开槽通道已退役，此值仅共享层保留） |
| economy | **slotCap** | **8** | `SHOP_SLOT_CAP` 代码默认 **6** | **不同**：运行时主动槽硬顶 = 8；README 与 DESIGN-HERO-RHYTHM R7 记的 6 是代码默认值 |
| battle | chapterSeconds / chaptersPerStage / echoRetainRate | 60 / 15 / 0.4 | 同 | 同 |
| battle | monsterCountBase / Growth | 30 / 1.15 | 同 | 同 |
| battle | echoRewardBase / Exp | 10 / 1.5 | 同 | 同 |
| battle | stageUnlockProgress / clearRewardGrowth | 0.5 / 0.15 | 同 | 同 |
| waves | chapterLength / spawnBase / spawnEarlyDecay / spawnEarlyChapters | 60 / 0.9 / 0.9 / 5 | 同 | 同 |
| waves | spawnLateDecay / spawnIntervalMin / spawnMultiFrom | 0.96 / 0.18 / 6 | 同 | 同 |
| chapterTypes | eliteChapters / treasureChapters | [4,8,12] / [6,10] | 同 | 同 |
| chapterTypes | eliteSpawnScale / eliteBurst / eliteIntelBias | 1.3 / 1.5 / 0.3 | 同 | 同 |
| chapterTypes | treasureSpawnScale / treasureGoldMix / defaultIntelBias | 0.5 / 0.25 / 0.45 | 同 | 同 |
| chapterTypes | eliteIntelDelay | **未配置** | 6 秒 | 缺键即用默认 |
| gacha | cost / cost10 / rates / epicPity / legendaryPity / epicPityLegendaryChance / duplicateStardust | 1 / 10 / 55,30,12,3 / 10 / 50 / 0.3 / 2,5,15,40,60 | 同 | 同（`legendaryPity` 下界取 `EPIC_PITY`） |
| menuSkin | 整段 | `{}` | 全空默认 | 空对象 = 零画面变化 |

**未纳入热调、只走「改规范表 → `npm test`」代码流程的表**：战斗批 `enemies` / `seasonMonsters` / `combat` / `field` / `envAffixes`，商店与赛季 `shop` / `season`，结构型批 `gacha`（运行态）/ `affixes` / `sets` / `combos` / `talents` / `commissions` / `equipmentGen` / `artifacts` / `heroSkills` / `rhythm` / `heroes`，以及英雄页几何（`scrollList` / `heroSelectLayout`）。

---

## 16. 屏层与运行时内联数值清单（未进 `game/data` 规范表）

按准则，策划数应住在 `game/data/*.ts`；下列数值目前内联在宿主层、世界层、FX 层与各屏 Model/View，是本总表里最容易与文档失同步的一类。改数时先确认它该不该入表。

### 16.1 世界层与引擎侧

| 值 | 用途 | 位置 |
|---|---|---|
| 340 / 420 / 44 / 24 / 420 | 敌人 / 投射物 / 毒云 / 召唤物 / 金币堆上限 | `battleWorld.ts:151` |
| 200 | 伤害飘字同屏上限 | `battleWorld.ts:156` |
| 80 | 换章召唤物散布边长 `MINION_CARRY_SPREAD` | `battleWorld.ts:153` |
| hpBuff 0.4 / bias 0.45 | `spawnIntel()` 未走章型时的兜底 | `battleWorld.ts:509` |
| 40 | `chapterEdgePos()` 四边内缩 | `battleWorld.ts:497` |
| `6 + floor(chapter/3)` | 章首 burst 基数 | `battleWorld.ts:638` |
| 1 秒 | 反射预算重置周期 | `battleWorld.ts:693` |
| `maxHp × 0.1`、1 秒 | 假命免死后附加护盾量与时长 | `battleWorld.ts:841` |
| 110 | 走位索敌半径字面量 | `battleWorld.ts:916` |
| 110 | hold 档围数统计半径（与 `THORN_STACK.contactRadius` 同值另写一份） | `battleWorld.ts:924` |
| 30 | 玩家横向边界内缩（三处同一字面量） | `battleWorld.ts:909/953/956` |
| 2.3 / 0.6 | 撤退切向漂移频率与权重 | `battleWorld.ts:941` |
| 0.4 | 无近敌巡场角速度 rad/秒 | `battleWorld.ts:949` |
| 6 | 灼烧池场上上限兜底（`fireTrail ?? 6`） | `battleWorld.ts:1035` |
| 140 / 120 / 90 / 60 | Boss 登场 / 阶段切换 / 共鸣 / 假命的贴花半径 | `battleWorld.ts:751/1106/809/843` |
| 2 秒 | Boss 阶段横幅 ttl | `battleWorld.ts:1104` |
| 0.45 秒 | 「盾 ×fm」读数节流窗 | `battleWorld.ts:1464` |
| 30 / 0.5 / 2 | 投射物击退力度 / 吞噬者兜底吸收比例 / 射线减速时长缺省 | `battleWorld.ts:1248/1236/1250` |
| `110 × dt` | 「空间扭曲」正弦横向摆动幅度系数 | `battleWorld.ts:1207` |
| 0.25 | 领域云 DoT tick 与回血池同口径 | `battleWorld.ts:1307` |
| 60 | 陨星落点引爆击退 | `battleWorld.ts:1332` |
| 99999 | 自动拾取天赋的全屏磁吸哨兵 | `battleWorld.ts:1406` |
| 40 / 22 / 0.22 | 击杀贴花半径（精英/普通）与 ttl | `battleWorld.ts:1551` |
| 0.35 / 0.2 / 300 / 0.7 | 引擎侧：pulse 间隔下限 / hurt 阈值钳 / 瞄准半径缺省 / 连锁检索缺省 | `equipmentEngine.ts:285/205/640/672` |
| 1.2 / 0.7 | `hurt` 节律内置 CD / `hit` 节律 CD | `equipmentEngine.ts:393/401` |
| 0.35 rad | 冰锥多发扇形间隔 | `equipmentEngine.ts:500` |
| 120 / 40 / 20 / 90 / 80 | 施放侧击退与余烬：新星 120、闪电链 40、爆炸 90、陨星余烬 burnRadius 80、burnDps 系数 0.09 | `equipmentEngine.ts:708/792/1120/565` |
| `40 + level × 6` / `30 + level × 5` / 4 / 273 | 召唤物血量（骷髅、灵狼）/ 亡影血量 / 亡影上限 / 灵狼移速 | `equipmentEngine.ts:766/622/616/603` |
| ±20 / ±15 | 召唤落点抖动（骷髅、灵狼 / 亡影） | `equipmentEngine.ts:766/622` |
| 0.35 / 0.2 / `sin(id×7.31)` / ±8% | 敌人侧：贴身切向漂移系数 / 每敌左右偏好哈希 / 移动抖动幅度 | `entities/enemy.ts:157/182` |
| 0.7 / 0.8 | 贴身校正触发与回位半径系数 | `entities/enemy.ts:168` |
| 0.001 / 0.5 | 玩家侧：判定「本帧在动」阈值 / 反哺池清零阈值 | `entities/player.ts:210/175` |

### 16.2 FX 与画面档

| 值 | 用途 | 位置 |
|---|---|---|
| 520 / 40 | 粒子池 / 冲击环池上限 | `battle/FxCore.ts:90` |
| 0.35 / 0.2 / 3 / 3 / 2.5 / 6 / 4 / 0.1 | 粒子与拖影缺省参数（spread / endScale / halo / ring width / trail halo / drift / drag / endScale） | `battle/FxCore.ts:104–160` |
| 10 / 9 / 0.05 / 61 / 47 / 1.3 / 0.7 | 震屏截断 / 每秒衰减 / 归零阈值 / x,y 频率·相位·幅系数 | `battle/FxCore.ts:167–190` |
| 0.05 | 主循环单帧 dt 钳制 `maxFrameDt` | `core/ViewTable.ts:1239` |
| 0.3 | 血条转红阈值 `hpLowFrac` | `core/ViewTable.ts:1308` |
| 100 / 100 / 34 / 22 / 34 | 特效贴花基准半径表：nova / explosion / lightning / shield / heal | `battle/BattleWorldView.ts:30` |
| `!e.isElite` | 精英敌人不画头顶血条 | `battle/BattleWorldView.ts:557` |

### 16.3 HUD 与各屏

| 值 / 规则 | 用途 | 位置 |
|---|---|---|
| 护盾条分母 `maxHp × 0.6` | HUD 归一化 | `battle/HudView.ts:488` |
| 连杀行情条最小连杀 ≥ 2 | HUD | `battle/HudView.ts:593` |
| 260 / 136 / 190 / 8 | 底坞右侧预留宽（Boss 态 / v4 / 旧档）与间距 | `battle/HudView.ts:676/770` |
| HUD 坞高 48 / 双排 96 | 战场带计算 | `game/ui/hud.ts:8/10` |
| 商店卡位 3、武器行 8、技能行 3 | 货架与只读行容量 | `shop/ShopModel.ts:53/286/295` |
| 开槽钮三档文案 `槽位已满 n/8` | 直接读硬顶 8 | `shop/ShopModel.ts:611` |
| 扭蛋保底读数分母 字面量 10 / 50 | 绘制侧与共享层阈值同源，由测试锁住 | `gacha/GachaModel.ts:23/200` |
| 最近抽取缓存 8 条、落屏画 `GC_RES_MAX` = 5 行 | 瞬时态 | `gacha/GachaModel.ts:191`、`game/ui/gachaLayout.ts:206` |
| 委托默认 `plains` / 难度 1；屏面文案「开始委托(4h)」「收益前2h 100%,之后降至 50%」；进度比 `hours / 2` | 会话瞬时态与字面量 | `commission/CommissionModel.ts:76/276/307` |
| 体力读数行 `体力 N/20 · 每 6 分钟恢复 1 点`（`X = regenSeconds/60` 不取整） | 屏内唯一时间口径 | `energy/EnergyModel.ts:24` |
| 体力屏热区 4 片按序：返回 → 广告 → 钻石 → 关闭（`close` 与 `back` 同效） | 命中序 | `energy/EnergyModel.ts:39/147` |
| 通行证档位行恒 5 行；右列「高级:×2」为字面量 | 行数与文案 | `pass/PassView.ts:168` / `PassModel.ts:69` |
| 每日宝箱图标 3 枚、天赋徽记循环 3 枚、行槽预建 `3 + 6 + 1` | 池容量 | `daily/DailyView.ts:41/164` |
| 通关屏：双倍钮底边 `h − 82`、返回顶缘 `h − 62`（缝 20px）、星数上限 `VI_STAR_MAX` 3（三枚 24 见方） | 几何 | `victory/VictoryModel.ts:182` / `VictoryView.ts:191` |
| 阵亡屏：立绘 opacity 取共享层 `GO_POSE_ALPHA`（整屏唯一）、时间格式 `m:ss` | 视觉与口径 | `gameover/GameOverView.ts:18` / `GameOverModel.ts:88` |
| 装备升级：徽记槽 5 颗、副标题「每级 +25% 贡献,上限 5 级」为字面量、命中只比每行 `btn` 矩形 | 屏层 | `gearup/GearUpModel.ts:75/126/171`、`GearUpView.ts:190` |
| 赛季屏：四行摘要整棵起落、无倒计时不挂 update 计时、唯一热区是贴底钮且命中不写档 | 规则 | `season/SeasonModel.ts:26/137` |
| 幻影榜：行数恒 11、玩家行插在 `myRank − 1` 位、缺图退硬边方框线宽 2、像素数字 `scale 2 / advance 18` | 几何 | `leaderboard/LeaderboardModel.ts:63` / `LeaderboardView.ts:35` |
| 主菜单：7 枚入口（委托/扭蛋/天赋/通行证/每日/升级/融合）、通行证激活时标签换「通行证★」、红点（每日 `claimed < 3`、委托任一盘 `elapsed ≥ 2h`）、补星钮 `5◆` 仅在已解锁且 `stars === 2` 的行出现且行内热区优先 | 文案与命中序 | `menu/MenuContentModel.ts:130/154/173/271` |
| 英雄屏：12 名 × 5 行、行池 16（视口 634 / 步长 80 ≈ 9 可见）、技能行池 5、lore 最多 2 行、方框线宽 2、空态行距 26、暗石面 `rgba(11,14,20,0.78)` | 内联常量 | `heroes/HeroSelectView.ts:57/71/78` |
| 商店箱图 `SHOP_CHEST_S = 64` | 视觉 | `shop/ShopView.ts:28` |

### 16.4 升级弹层几何（内联于 `game/ui/levelUpLayout.ts`）

设计令牌（`game/ui/theme.ts`）：`fs.section` 16 / `fs.body` 14 / `fs.muted` 13 / `fs.micro` 12；`ui.touchMin` 44（全项目最小触控高档）。

| 常量 | 值 | 含义 |
|---|---|---|
| `LV_PAD` / `LV_CONTENT_W` | 16 / 528 | 页边距与内容宽（右缘恒落 544；`ui.pad` 是 Web 冻结档 14，本屏不再用） |
| `LV_BOX_W` / `LV_BOX_H` | 528 / 552 | 盒 = 内容列宽（横向铺满 `[16, 544]`）、恒高，整屏垂直居中且取偶 |
| `LV_BOX_TEXT_INSET` / `LV_BOX_TEXT_MAX_W` | 16 / 496 | 盒内文本带内缩与限宽（标题 / 读数 / 底提示共读这一档） |
| `LV_BANNER_INSET` / `_TOP` / `_H` / `_NINE` | 16 / 16 / 40 / 13 | 标题横幅：内缩、顶缘下沉、高、九宫切深（与二次确认弹层同档） |
| `LV_PANEL_NINE` | 32 | 盒底垫九宫切深（同上同源） |
| `LV_TITLE_DY` / `LV_READOUT_DY` | 26 / 82 | 标题基线相对横幅顶缘（带内居中偏下一格取偶）/ 读数行基线相对盒顶缘（= 横幅底缘 56 之下 26） |
| `LV_CARDS_DY` / `LV_CARDS` | 98 / 3 | 卡片带顶缘相对盒顶缘 / 卡数 |
| `LV_CARD_W` / `LV_CARD_GAP` | 168 / 12 | 三卡等宽：`16 + 3×168 + 2×12 = 544`，右缘正好落内容列右界 |
| `LV_CARD_INSET` / `LV_CARD_TEXT_MAX_W` | 12 / 144 | 卡内文本与钮的每边内缩 / 限宽 = `168 − 12×2` |
| `LV_QUALITY_DY` / `LV_NAME_DY` / `LV_DESC_DY` | 22 / 44 / 68 | 卡内各族基线相对卡顶缘（全偶数）：`史诗 · Lv.5` / 卡名 / 描述首行 |
| `LV_DESC_LINE` / `LV_DESC_MAX_LINES` / `LV_DESC_CHARS` | 18 / 8 / `floor(144 / 12) = 12` | 描述行距（= `fs.micro` 12 的 1.5 倍）/ 槽位数 / 每行折行字符预算（CJK 一字 ≈ 1×px） |
| `LV_DELTA_DY` / `LV_TAG_DY` | 216 / 238 | 强化数值差一行（`伤害 12 → 13`）/ 状态标签一行（`新装备` / `强化现有` / `已锁定` / `隐藏词条!`） |
| `LV_EMBLEM_S` / `_DY` / `_N` / `_ALPHA` | 96 / 104 / 3 / 120 | v6 卡中徽记水印：见方 / 顶缘落卡顶 104 / 素材 3 枚按卡位循环 / 水印不透明度（压在描述文字之下） |
| `LV_BTN_W` / `LV_BTN_H` / `LV_BTN_GAP` | 144 / 44（= `ui.touchMin`）/ 6 | 钮宽 = 卡内限宽（与文本同一条内缩尺）；钮高不留第二份「钮该多高」的口径 |
| `LV_BTN_TOP_DY` / `LV_BTN_STEP` / `LV_BTN_TEXT_DY` | 256 / 50 / 26 | 首枚钮顶缘相对卡顶缘 / 纵向步进（钮高 + 缝）/ 钮内文字基线（钮高 44、字号 13 → 带内居中取偶）；三枚竖排落 256 / 306 / 356 |
| `LV_CARD_BOTTOM_INSET` / `LV_CARD_H` | 12 / 412 | 末枚钮底缘到卡底的内缩 / 卡高 = `256 + 50×2 + 44 + 12` |
| `LV_HINT_GAP` / `LV_HINT_DY` / `LV_BOX_BOTTOM_INSET` | 26 / 536 / 16 | 底提示与卡片带底缘的缝（= 标题带与读数行之间那道 26，同一把尺）/ 底提示基线相对盒顶缘 / 盒底内缩；`LV_BOX_H = 536 + 16` |
| 字号档 `LV_*_PX` | 标题 16、读数 13、品质 12、名称 14、描述 12、数值差 13、标签 12、钮 13、底提示 13 | 全部取自 `theme.fs`，本屏不另立字号 |
| `LV_CARD_STROKE_W` / `LV_BTN_STROKE_W` | 2 / 1 | 卡框描边（与融合屏三选一卡片同档）/ 三枚钮底板描边（纯代码矩形档，全项目「描边后复位 1」的约定值） |
| 弹层读数行（逐形态） | `levelup`：`Lv.N · 节律:<本命 Lv.k / 第二条 Lv.k> · 本章免费重随 <剩余>`（+ 分岔预告）；`first`：同上去掉预告；`stance`：`第 1 章前 · 本局姿势 · 贴身 110px 内才涨层 · 每只死后留 0.17 秒记忆`（110 与 0.17 直接读 `THORN_STACK.contactRadius` 与 `1 / contactEchoDecayPerSec`，不复述数字）；`passives`：`被动 n/4 · 第 p/pages 页 · 金币 G` | 读数行是「把机制写在明面上」这一要求落屏的位置 |

弹层置顶规则与二次确认层同一条：`setSiblingIndex(children.length − 1)`（否则压不住懒建 toast）。卡面帧档：新技能 core/advance → rare、branch → epic；升阶 rare；节律强化 legendary；首章法宝共鸣时 hidden；姿势 epic；被动 rare → hidden 否则实际品质——只换卡面帧与文案，不改判定。

---

## 17. 设计支柱与已拍板裁定

本节是「为什么是这些数」的设计意图层，按主题汇编 13 份文档的裁定；每标一条注明落在哪张表。

### 17.1 元纪律（跨所有系统）

1. **数值墙不回头**：任何新玩法不得重新引入全局难度增长，不碰 `waveHpMult` 与生成间隔 base，不加新墙；章型倍率只作用本章局部，赛季 mutation 全部 `|mult − 1| ≤ 0.15` 且只作用玩家侧，主题怪三轴倍率组内均值恒 = 1.0。
2. **单一事实源**：策划数一律住 `game/data/*.ts`，逻辑代码与屏层只读表；同一主题一张主表，其余轴派生；每个数值带四要素备注（含义 / 单位 / 取值依据 / 策划案出处）。规范表定内置默认，`balance.json` 做运行期热调覆盖（见 `DESIGN-VALUES-SPEC.md`）。
3. **确定性优先**：赛季配置、主题怪出场、幻影榜、章型、敌情一律 `seasonId / chapter → 纯函数`（同输入恒同输出），不落盘、不依赖网络；测试用 `_reset*Uid` 归零哈希上下文。
4. **标定用真机口径**：`runSim({chapterReset, chapterTypes, shopGrowth, maxSeconds, trace})`，种子 21/123/7 起步、结论级读数 ≥60 种子（3 种子能把 50% 与 17% 混为一谈），A/B 必带「关掉新机制」的对照档。
5. **`.probe/` 全目录不入提交**；一次性驱动脚本留着不删，关键对照立刻另存（固定输出文件名会被下一轮覆盖）。

### 17.2 产品三轴与局内形状

赛季关卡式（14 天壳 + 进度制解锁 + 星数 + 每日首通 + 赛季分 + 幻影榜）× 场内肉鸽（15 章 × 60 秒、章型起伏、升级三选一发独有技能、章间商店卖法宝）× 场外养成（回响/天赋/委托/星尘/扭蛋/通行证/收藏）。紧张感来自「有限空间 + 高密度怪 + 倒计时」三者叠加，竞技场一屏可见、无镜头移动。

裁定：7 关全部在第 15 章出 Boss，杀 Boss 才算通关、超时判负；偶数关用弱化变体作节奏阀门（hp ×0.7、跳过 P2、死亡不分裂）。关卡解锁走进度制（前一关打到第 8 章），**不按天数门控**；无限关常开。体力消耗维持现状不下调（2026-08-28 拍板）。

### 17.3 战斗与难度

血量曲线双段（前 5 章 +2%/章、之后 +7%/章）与移速 +1%/章是标定基线；登场曲线把「惩罚型怪」（反射者、吞噬者）推迟到第 6 章台阶，避免新手死于自己的弹幕。精英章定位是「数值台阶章：台阶要有感而非处决」，因此走「章首 6 秒只有密度、第 6 秒起精英入场」而非降低精英偏向。

Boss 以 TTK 标定而非血量整数：锚点 = 单目标木桩 DPS，第 1 关 ≈15 秒、第 7 关 ≈42 秒，每关 ×√2（玩家战力近似乘性增长）。伤害预算锚点统一取 `BOSS_SLAM`（80 伤 / 220px / 1.2 秒蓄力）与新手 maxHp 100 成对：精英单事件 ≤0.7×、变体首领附加层 ≤0.85×、蓄力 ≥0.9 秒、间隔 ≥6 秒、池伤 ≤25、隐身占比 ≤0.2、软控 factor > 0.6。

惩罚可读不处刑：玩家侧反伤每秒预算 15% 最大生命；金币堆超额并入最近一堆（金额守恒，钱不静默蒸发）；毒池定性为地形、不走受击管线。

### 17.4 英雄、节律、技能、法宝（三层拆分）

一张卡拆成三种物品、三个决策时刻：**节律**（英雄本命 1 条 + 分岔解锁第 2 条 = 玩家决定「我怎么打」）、**独有技能**（每英雄 4 个 = 核心 + 互斥分岔 2 + 进阶，升级三选一不花钱 = 「我是谁」）、**法宝**（主动 14 + 被动 8+2 + 遗物 8，章间商店唯一金币出口 = 「我拿什么」）。触发器彻底离开法宝，卡面不写随机发动条件。

关键裁定：Q2 → B 案（14 通用效果全员可买，对照弹壳/Hades/雨中冒险/杀戮尖塔/Brotato 全是「独有核心 + 通用道具池」）；Q7 → C 案（本命固定 + 首章法宝三选一 + 跨局 3 星解锁第二本命，因为「零信息的开局选节律会退化为全选周期型」）；否决「第 2 节律金币买」（钱能绕过取舍）与「开局 2 本命」（身份糊掉一半）；R8「重置分岔」与「补给」兜底三张在 R20 撤销（分岔互斥是一局最重的决策，不给可回退的第二条路）。

英雄差异主轴 = **站位有增益**：不设战场按钮，挂机照样通，但伤害几何（自身中心 / 来袭者脚下 / 弹体 / 地面）决定她打盾卫与 Boss 时吃不吃正面减伤、绕向有没有报酬。12 英雄 = 12 套组的角色包装，`heroes.ts` 无数值。

英雄强弱由六项口径判定（首章存活是硬门；另五轴 = 深度带 / 种子方差 / 甜点·天敌章差 / 分支差 / 逐秒剖面形状），每个英雄各自一条**目标带宽**——「数值的作用是把英雄翻译成一条有起伏的曲线，而不是把一个数字推到上限」。纪律：深度不是目标值、带宽才是；每个英雄必须有一条天敌和一个打不了的仗；分岔必须关一扇门（两枚都更好 = 决策不存在）；机制病不用数值治；反哺/层数类资源必须有总量上限与释放速率约束。

R20–R22 落地口径：升级层只剩技能与节律（没牌就不开层）；每关从 20 章缩到 15 章（对齐「一局牌 ≈22–25 张」）；姿势 = 局首二选一的两态（站定 / 绕场，贴身是两态共有前提）。

V1.1 章节节点层（[DESIGN-HERO-BUILD](DESIGN-HERO-BUILD.md)）：薇拉 / 凯尔 / 薇洛三原型把分岔搬到第 2 章开章，第 4 / 8 / 12 章各加一层二选一节点；每支 2³ = 8 组合。分岔技能 = 路线主动件，`coreMorph.loop` 承载主循环，节点 patch 改主循环；不占升级槽 / 商店槽 / 共鸣计数。其余 9 人维持 5–8 级分岔；「每章一次普通轮」（CR-01）未接线，仍按每级三选一。

### 17.5 套组、组合技与赛季新鲜感

品质决定形态（部件构成 / 射速 / 赠量 / 强化上限），等级决定数值，品质不直接放大伤害；隐藏品质仅融合产出、不进任何掉落/抽取权重。

套组仍是效果派系（商店卡池偏向与卡面「套」角标的依据），**派系划分永久冻结，新鲜感只能来自加法**；新套组必须带新效果；14 效果各被恰好 2 套认领，共享套的质变档降档补偿（×1.6 / ×1.5，不到翻倍）。套装件数联动已退役，`SET_BONUSES` 表内容保留、触发条件改读本局**共鸣数**（2 / 4 处）。

赛季新鲜感三层：L1 主题循环（4 主题 + envBias 加权）、L2 赛季联动词缀（常驻套 5 条池轮换 + 当季套专属双 patch，过季回落）、L3 赛季限定套组（当季商店偏向 0.6 → 0.7，过季永久保留可选）。赛季共鸣与赛季法宝（R5）：S2 起每季 3 对新「法宝 × 节律」共鸣格 + 1 枚赛季法宝，过季新格降为回响共鸣（改名保留、补丁减半 `SEASON_ECHO_MULT` 0.5）。内容节流：S5 起不再新增套组，改为池轮换 + mutation 换血 + 主题轮换（给美术量一个上限）。

主题怪纪律：变体表换皮、`behavior` 复用现有 kind、AI 零新增；机制不新增 tag 枚举而参数化挂载；技能由 11 原语 + 参数表达，无单只特例；批 4 技能不进 balance-sim，「后人不得为此放开模拟的 seasonId」。

### 17.6 商业化与广告纪律

场内金币是唯一场内货币，场外货币三轨：回响点数（转生/天赋）、星尘（融合/收藏升级）、钻石（体力/补星/换券）、扭蛋券。**场外道具与收藏只给基础属性，不给卡牌效果**——「场外底盘 × 场内构筑 = 最终战斗力」。

广告纪律：模型侧不碰广告、全工程唯一 `watchAd` 闸门、禁止屏级自建 pending；解锁型广告一律**局内上限 + 每局重置**（开槽、复活、双倍），常规型走日上限；槽位广告与道具扩容广告共享钻石日预算。指标口径：广告次数/局 ≤ 6。风险提示（原文保留）：单局最多 4 次解锁型广告就能吃掉当日近一半钻石额度。

回响跨天保留 40% 入永久池、60% 本日池次日清空，是「明天回来」与「今天再打一关」之间的纽带。

### 17.7 呈现与验证

画面按 560 宽设计空间布局，设计高随屏比 `clamp(996→1246)`，手机竖屏顶满无黑边；战场恒为 560×996 标定空间，刷怪节奏是绝对时间制、不随屏幕尺寸稀释。派生几何不入配置表（行高/行距/九宫格角深/套组卡宽等由锚点算出），改位置走布局台拖拽后导出 JSON。

文字可读性口径：折行读 `descLines`，量字出口一律 `Array.from`（`[...str]` 会被 downlevel 成 `[].concat` → 量字与折行静默失效，有 `tests/text-fit-downlevel.test.ts` 守行为）。出战英雄界面必须看得见套装与两档效果（英雄页五行 + 「本套计件」清单）；节律标签必带发动条件（`rhythmShort` / `rhythmPlay`）。

验收门：五道门（`npm test` / `build` / 产物 grep 导出名与文案 / 文案配对 / `typecheck:cocos` 零容忍）+ 无头实机探针；`errorTS = 0` 不等于做了类型检查，屏层必须由 `scripts/cocos-typecheck.mjs` 覆盖。

---

## 18. 待办、未决与已知缺陷

唯一待办面是 [`TODO-HERO-RHYTHM.md`](./TODO-HERO-RHYTHM.md)，本节按其分组汇总并补上文档面遗留。

### 18.1 数值层

1. **`nearestEnemy` 的距离闸（优先于所有英雄数值刀，待裁定）**：`battleWorld.nearestEnemy` 与 `scripts/balance-sim.ts` 两份同名镜像都把线性距离与 `range × range` 比（初值 `range²`、比较 `d`），贴身闸 110 实为 12100px、链式重瞄 300 为 90000px、召唤物视野 320 为 102400px，而竞技场对角线仅 ≈1000px —— 只要场上还有活怪，三道闸一律放行。后果：挂机档 `nearest` 恒非空 → `hold` 支恒成立、巡场支永不执行；`kite` 档 `dodge` 恒真 → 永远在逃。A/B：一只怪钉在 400px 外推 3 秒，站定档位移 85.4px、绕场 536px、换上正确实现后 536px。闸修好后的预览：薇拉站定+荆甲 21/21/21、层均 5.4–5.5（与绕场齐平，即「站定档不成立」主因是这条缺陷而非数值）；其余 11 英雄整体变难（凯尔 → 8†/21/18†，正好对上 §4 矩阵 R20 的 7†/21/18†）。代价：`battle-fingerprint` 快照会红 → 需 P6 重签 + 12 英雄 × 3 种子整表重出。**重基线量级，不由实现者裁定。**
2. **薇拉 R18/R19/R22 剩两刀（待裁定）**：② 站定档独有报酬（站定时圆环半径或减伤另加一档 + 绕场档层数速率打折；最轻形状「记忆只给站定档」已量过——绕场与基线逐位相同、站定与对称档逐位相同）；③ seek 改成找最密的一簇（不是最近一只）。现状：接触记忆已落地（`contactEchoDecayPerSec` 6），站定层均 1.62 → 2.13、饿死秒占比 41% → 33%，但死亡率与章均在噪声带内（38→43% / 18.32→18.66），两态仍不对等（站定 18.66 章 / 43% 死 vs 绕场 20.58 章 / 13% 死）；绕场满层占比 41.7% → 54.6%（放到 1 那档会到 81.7%，涨落曲线消失，故未取）。
3. **薇拉续航最后一刀**：实测回血 9.5–29.7/秒，其中层数续航只占 1.8–7.9/秒，其余是商店全局「吸血」被动 × 她 nova 的多目标总伤（每秒 1150–1971 × 3%）。候选 ② 吸血对多目标 AOE 按命中数折算（影响全员，须先量凯尔/洛卡/莎莉）；③ 给清场速度设上限（改动面最大）。定了才谈 `intel.ts`「异变 → 推荐荆棘」的改判（异变章她回血最凶，改文案等于掩盖问题）。
4. **穆精英章之墙**（杠杆 A 已落地，第 15 章修好、第 10 章仍在）：10 / 15 / 21 → 10 / 21 / 21。承伤反哺池已把「释放速率」从 1.5 提到 8；第 10 章那一死任何池参数都救不了——致死脉冲发生在章首第 16 秒的第一波精英贴身，池里还没有可退存量。剩余方向收窄为开局脉冲本身（站桩档在精英到脸前的脱离时机，或精英章开场到场节奏），或接受穆 = 高风险高上限。
5. **标定口径未统一**：`runSim` 默认仍是旧口径（不清场、不开章型），只有 boss / balance / chapters / terrain 四套显式传真机口径；`combos` / `seasonSets` / `hero-rhythm` 里的 sim 用例仍走旧口径。两种口径并存，读数据容易混。
6. **Boss 末关 TTK 42 秒**：窗口 14–55 内，离 60 秒超时线只剩 18 秒；后续法宝/技能数值再上移时 `BOSS_HP_CURVE.base` 5.0 要跟着看。
7. **R20 第二枚杠杆**：一局的牌只有 ≈22–25 张，实测每章约 2.5–3 级 → 约第 8–9 章发完，后面靠 `open()` 返回 false 静默跳过。候选：每章固定发一轮 / 开局自带阶数 / 抬 `SKILL_MAX_RANK` 与 `RHYTHM_MAX_LEVEL`。先测手感再定，不顺手灌水。
8. **12 英雄矩阵**：`DESIGN-HERO-PIPELINE` §4 的甜点 / 天敌 / 带宽三列现只有薇拉填齐，其余 11 位待补；R20 那 36 个数与本轮驱动对不上（更可能的解释就是第 1 条那道闸）；闸定了之后整表按同一驱动重出一遍。

### 18.1b 章节节点层（V1.1，三原型）

- **范围**：只启用薇拉 / 凯尔 / 薇洛；其余 9 人仍走 5–8 级分岔。24 条路线里 18 条仍是方向矩阵，未出同规格技能树。
- **数值**：6 条主循环与 36 个节点的系数均为初值（`heroBuild.ts`）；首章硬门与六项带宽的 A/B 读数待按 `DESIGN-HERO-BUILD` §7 回填。
- **呈现**：开章弹层已接（两卡、不可重随 / 锁定）；英雄页仍是五行，节点行与 R21 详情板截断问题一并留后续。
- **机制近似**：城垣「首次越界」按首个 tick 入圈结算、接续棘径 / 合围猎线 / 双舞台按线段命中、冰晶裁决按直线 + 落点近似；均已在 `DESIGN-HERO-BUILD` §3 标注，待真机剖面收紧。
- **CR-01 未接线**：普通升级仍每级三选一；「每章一次普通轮」会改全部 12 人曲线，单独立项。

### 18.2 内容层

9. **S2–S4 赛季共鸣格与赛季法宝全是初值**（`SEASON_RESONANCES` / `SEASON_ARTIFACTS`），没有真实赛季数据；等真有 `seasonId = 2` 的对局再标。
10. **S5+ 赛季表**：`SEASON_RESONANCES` 只到 S4，第 2 轮主题循环只剩过季回响，无新格、无赛季法宝。
11. **其余 5 英雄仍走通用职业包**（多兰 / 莎莉 / 雷恩 / 奥登 / 穆），R4 裁定按赛季逐批补专属表；换表时「老玩家该英雄进度按熟练度折算」的细则未写。薇洛已在 V1.1 换专属表（狼群统帅 / 亡影剧团）。
12. **共鸣图鉴没有界面**：`save.collection.resonances` 已落盘（键 `art:<效果|变体>:<节律>` / `skill:<id>`），发现横幅带赛季角标，但没有任何屏能翻看已发现的共鸣。
13. **英雄详情前三行文案在屏上被截断**（薇拉 996 档实测）：核心需 2 行只给 1 行、**分岔需 5 行只给 1 行**（150 字）、进阶需 2 行只 1 行；详情板已从 440 长到 488（列表视口 384 → 336 换的），继续加高就是拿列表换。候选：① 分岔拆两行（代价太大）② 点行展开 ③ 给 `HeroSkillDef` 补一条短文案字段、长文留给升级卡。定了再动。
14. **主题怪在画面上看不出来**：渲染链「变体贴图 `monster_<id>` → 缺图回退 `enemy_<kind>` → 再缺才用 `def.color`」，而 14 个 kind 的 `enemy_*` 全部在册，`def.color` 分支不可达 → 120 只换皮此刻只在名字、敌情文案、图鉴三处生效。S2 变体铺满战场后主题色精确命中 0 像素。候选（无专属贴图时叠低透明度色罩或描一圈主题色环，纯代码不新出图）标注「待定，未擅自改渲染」。S1 30 枚已入库，S2–S4 待出 90 只；怪物图鉴页未做。
15. **仍写「3 件 / 6 件」的两处文案**：`onboarding.ts` 两条引导语与 Web HUD 的套组链（`src/game.ts` 的 `3件·/6件·`）——结算早已改走共鸣 2 / 4 处，属文案滞后不是行为缺陷；Web 那处受冻结基准约束。
16. **真排行、分享卡**：幻影榜是本地模拟，真排行待后端直插；分享卡 `rankScore` 零实现、文档挂账。

### 18.3 工程与基建

17. **`onboarding` 第 3–5 步在 Cocos 侧不可达**：`guideCtx(true, false)` 第二参恒 false → 游标停在第 3 步，`tutorialDone` 只能由「跳过」写下。
18. **`LEVELUP_ENSURE_RARE_TALENT` 常量零消费者**：升级层没有调用点，`affix_taste` 的判据在 `ShopModel.ts:332` 与 `src/game.ts:897` 各写一份字面量（与「单一事实源」条款有出入）。
19. **`TALENT_VALUES.globalXpMult` 运行时未被调用**：`globalXpMultFor()` 有定义无调用点，天赋「经验加成」因此是占位五项之一（另四项：词缀预览 / 词缀重铸 / 万能适配 / 无尽模式）。
20. **广告开槽注释口径与实现不一致**：`GameShell.ts:980-993` 注释写「每局 2 次」（DESIGN-SEASON-FEEL P1 也裁定局内 2 次），实现是 `RUN_AD_SLOT_LIMIT = 1`；升级层文件头「重随走局内金币 / 价格走 `rerollPrice`」的句子与实现不一致（实现只读 `LEVELUP_FREE_REROLL_PER_CHAPTER`）。
21. **存档无版本号、无迁移函数**：全靠逐字段回落；Web `SaveData` 少 3 项（`collection.resonances`、`heroRhythmUnlock`、`heroRhythmChoice`）。`gearLevels` 以装备名为键，融合改卡名会让同一技能另起一格，需一次性迁移。
22. **`stages.ts` 文件头注释仍写「每关 20 章 / 第 20 章出 Boss」**，同文件表值与常量都是 15；`enemies.ts` 曲线注释仍以「第 20 章 ≈2.15」举例。改注释即可，行为与表值不动。
23. **地形数量注释滞后**：`OBSTACLE_PLACEMENT.countMax` 已收到 1，`objects.ts` 里 `rollChapterObstacles` 头注释仍写「每章 2–4 个」、`want` 行仍写「1–2 个」。
24. **引擎侧可读性缺口**：`equipmentEngine.rhythmProgress` 对技能的受击 / 击杀恒返 1（技能不走内置冷却，只有 `hitCd` / `hurtCd`）；`castKnife` 全向刃幕（spread ≥ 6 走 360° 等分）命中率低是洛卡偏弱的疑点之一，但没量过。
25. **sim 建模缺口**：`sim.strengthen` 只建模「每章最多 3 次最便宜强化」，真实玩家会优先强化核心输出件 → 低估后期 DPS，Boss 锚是按它标的；A4 当年声明的「带消费策略的每章末余额分布」那套 sim 未做。
26. **R20 之后的文档面待扫**：`CONFIG-TABLES.md`、`SEASON-PACING-AUDIT.md`、`DESIGN-V3.md` §3 章型分布图的表述需与 15 章对齐（改表没改文档会在下一轮漂移对齐被抓）。
27. `cocos/settings/v2/packages/information.json` 每次开编辑器都写回、长期留在工作区未提交；要么一起收口，要么加进 `.gitignore`。
28. **微信端**：本机无微信开发者工具，`wechatgame` 出包未量；外置配置在小游戏端不可用，规范表必须是可独立运行的完整数值。包体已复测：整包 6,144,511 B、贴图 1,954,271 B / 158 枚；首屏 `ready` 前只 await 27 枚 HUD 件，实测 2,288 ms。

### 18.4 已知噪声（不必再查）

`npm run build:cocos` 退出码 36 / `build-script` 子进程 SIGTERM 与 `window.json` 解析报错属编辑器收尾噪声，产物完整；vitest 末尾 `[vitest-worker] Timeout calling "onTaskUpdate"` 是 worker RPC 超时、不是测试失败；全套 vitest 跑时浏览器面板里的 Cocos 场景会停在 0 帧（CPU 被 worker 占满 + 面板隐藏无 rAF），跑完刷新即可。

---

## 19. 口径漂移点（文档 ↔ 代码）

代码是事实源；下列是本次通读时发现「文档说的和表里写的不是同一个数」的位置，逐条摆证据、不下结论。带 ✅ 的是已按代码校准本文的。

| # | 主题 | 文档/注释口径 | 代码与配置事实源 |
|---|---|---|---|
| 1 | 主动法宝槽硬顶 | README、`DESIGN-HERO-RHYTHM` R7、`CONFIG-TABLES` 均写 **6**（「基础 4 + 天赋 ≤2 + 本局广告 1，合计钳到 6」） | `equipmentGen.ts:1069` 默认 6，但 `balance.json → economy.slotCap` = **8**（合法域 4–32）→ 运行期硬顶 8；商店开槽钮文案「槽位已满 n/8」按 8 显示。本文 §10.4 与 §15 已同时标出两档 |
| 2 | 每关章数 | `DESIGN-V2` / `DESIGN-V3` / `SEASON-PACING-AUDIT` / `DESIGN-HERO-RHYTHM` §6 流程图多处写 20 章、Boss 在第 20 章 | `stages.ts:59` 与 `STAGES` 七行全为 **15 章、bossChapter 15**（R20）；`stages.ts` 文件头注释仍写「每关 20 章」 |
| 3 | 精英章 / 宝箱章位置 | `DESIGN-V2` 精英每 5 章、宝箱每 7 章；`DESIGN-V3` 初稿 5/10/15 与 7/14 | `chapters.ts` = `[4, 8, 12]` 与 `[6, 10]`（随 15 章重排）✅ |
| 4 | 金怪掉金 | `ENEMY_DEFS.goldkind` 描述串与 README、`DESIGN-V3` §3 都写「掉 16 金」 | 现口径 `xp 8 × GOLD_PER_XP 1` = 单堆 **8 金**；16 对应 A4 之前的 `GOLD_PER_XP = 2` |
| 5 | `SET_BONUSES` 键数 | `DESIGN-VALUES-SPEC` 与 `sets.ts` 说明写 **33 键** | 实际 **29 键**（一档 17 + 二档 12）；弹幕风暴二档「数量翻倍」无独立键，走引擎规则 |
| 6 | 天赋数量 | `DESIGN-VALUES-SPEC` 写「19 项天赋效果数值」 | `talents.ts` = 30 节点、`TALENT_VALUES` **18** 键；25 节点接入效果、5 个占位 |
| 7 | 共鸣档位 | `DESIGN-HERO-RHYTHM` 写「共鸣 2 / 4 / 6 处」三档（6 处给该英雄「极」质变） | `RESONANCE_TIERS` 只有 **2 / 4** 两档；件套线 `SET_PIECE_TIERS` 3 / 6 仍在表内但正交计数 |
| 8 | 治疗光环 | `DESIGN-SEASON-FEEL` P2 拍板「A 降档 + 显性化」：2%/秒 → **1%/秒**、回血飘读数、词缀条常驻 | `envAffixes.ts:44` `HEAL_AURA_RATE` 仍 **0.02**；第 2/3/6 关词缀表也仍含 heal_aura（P2 还要求 mist 收出第 2 关，现第 2 关是 mist、第 6 关也含 mist） |
| 9 | 接触伤害间隔 | `DESIGN-SEASON-FEEL` B 批：0.8 → **0.6 秒**（掉血 +33%，压力目标第 1 章稳态 HP ∈[60,90]） | `combat.ts:49` `CONTACT_HIT_CD` = **0.8** |
| 10 | 荆棘反伤回血 | B 批：`THORN_HEAL_PCT` 0.02 → **0.012**，并改「荆棘爆发命中才回」 | `combat.ts:73` = **0.02**，仍是「每次挨打回 2%」 |
| 11 | 吞噬者吸收 | B 批：`healRate` 0.5 → **0.25**，并加 `{decay 0.5, window 2}` | 无 `skill.devour` 时兜底 **0.5**（`battleWorld.ts:1236`）；带技能的变体走表值 |
| 12 | 正面减伤弧 | `DESIGN-SEASON-FEEL` B 批：`FRONT_GUARD_DOT 0.5`（写作 **110°**）且 `FRONT_GUARD_MULT` 0.2 → **0.12**；`DESIGN-HERO-PIPELINE` 写 **60° 弧** | `enemies.ts`：`FRONT_GUARD_DOT = 0.5`、`MULT = 0.2`、`MULT_BOSS = 0.6`；`entities/enemy.ts` 注释写「正面 60° 内」。`dot > 0.5` 的几何含义是 ±60°（合计 120° 全角），三处表述互不一致，倍率 0.12 未落地 |
| 13 | 初始武器降档 | B 批：starter `spread 16 → 5`、`pierce 1 → 0`、`damage 40 → 12`、`interval 1.2 → 1.5`，规则「第 1 章单只腐尸 TTK ∈[2.0,3.5] 秒」 | `equipmentGen.ts` 开局武器 9000 仍是 pulse 1.2 / knife spread 16 / damage 40；12 把初始武器未同批改 |
| 14 | 击退模型 | B 批：新增 `KNOCKBACK_MODEL {drag 9, maxOffset 180}` 与逐敌质量/抗性表，力度重标 30→18 等 | 实现仍是 `knockback`：`k = power / d`，位移 = `(e − from) × k`；投射物命中力度 30（内联 `battleWorld.ts:1248`）。质量/抗性表无对应字段 |
| 15 | Boss 战时长与招式 | C 批：`BOSS_CHAPTER_SECONDS = 150`、阶段锁冻结伤害 1.6 秒、TTK 目标首关 45–60 秒 / 第 7 关 90–120 秒、招式表（扫射 / 环形弹幕 / 冲锋 / 新 Boss 玄铁巨像） | 实现按 15 章制、Boss 章仍是 60 秒限时；`BOSS_HP_CURVE.base` 5.0 → 实测首关 ≈15 秒、末关 ≈42 秒；三阶段只有震击 + 召唤 + 狂暴，无扫射/环形弹幕/阶段锁 |
| 16 | `BOSS_HP_CURVE.base` 轨迹 | `DESIGN-V3` 记 2.0 → 3.5 → 4.0 → 5.0 各阶段（不同文档停在不同值：`DESIGN-HERO-RHYTHM` R7 记 2.0→4.0） | 现值 **5.0**、growth √2（`enemies.ts:331`），R13 按真机口径重锚 ✅ |
| 17 | 道具（遗物）经济 | `DESIGN-SEASON-FEEL` D 批：8 件道具走商店买卖，价格 60/90/140/210（`round(60×1.5^(n−1))`）、`RELIC_CAP 4` / `RELIC_HARD_CAP 6`、每章库存 1 件、精英 3% 掉落 | 遗物是**被动池的一档**（与稀有被动同池，按 `PASSIVE_RELIC_RATIO` 1/3 出货），无价格、无库存、无独立上限；被动槽 4（+天赋 1） |
| 18 | 每日天赋 / 收藏贡献 | D 批「道具 8 件」与 `GEAR_UPGRADE_MAX 5`、每级 ×1.25 | 与代码一致（`daily.ts`：`GEAR_UPGRADE_MAX` 5、`GEAR_UPGRADE_STEP` 0.25）✅ |
| 19 | 收藏装备强化 | `DESIGN-V3` §9 明确「P2-E 收藏装备强化推迟到赛季结算星尘消耗定型后」 | 已落地为独立屏（`gearup/GearUpModel.ts` + Phase 5 提交 c281547 族），星尘 15/30/45/60/75 |
| 20 | 赛季限定套组节奏 | `DESIGN-SEASON-SETS`：S2/S3/S4 各 1 套（3 新套、6 新效果），S5 起不再新增 | 现每季 **3 套**（12 套 = 12 英雄一一对应），新效果 6 种 ✅ 英雄系统扩的，文首已自陈 |
| 21 | 回响跨天保留 | `DESIGN-V2` 写 50%（并在 §6 待确认项里问 40%/60%） | `ECHO_RETAIN_RATE` = **0.4**，`balance.json` 同步 0.4 ✅ |
| 22 | 场内「升级三选一」 | `DESIGN-V2`：「升级概念保留为章节推进，不再升级三选一装备」 | 升级三选一保留且是核心出口（现只发独有技能与节律），`DESIGN-HERO-RHYTHM` Q1 明确「保留战场内三选一」✅ |
| 23 | 关卡门控 | `DESIGN-V2`：「赛季第 N 天 = 第 N 关」日历门控 | 现进度制解锁（前一关打到第 8 章即解锁），**不按天数门控**；14 天只用于轮转与结算 ✅ |
| 24 | 商店广告刷新 | `CONFIG-TABLES` / `daily.ts` 登记 `shopRefreshAdLimit` 5 次/日，README 广告 9 点位含「商店刷新」 | Cocos 侧 `ShopModel` 无广告刷新消费方（刷新只走金币；存档 `shopRefreshCount` 有字段无写入路径） |
| 25 | 槽位广告次数 | `DESIGN-SEASON-FEEL` P1 与 `GameShell.ts:980-993` 注释：局内 **2 次** | `shop.ts:39` `RUN_AD_SLOT_LIMIT` = **1 次/局** |
| 26 | 升级层重随消耗 | `GameShell.ts:2446` 与 `LevelUpModel.ts` 文件头：「重随走局内金币，价格走 `rerollPrice`」 | 升级层只读 `LEVELUP_FREE_REROLL_PER_CHAPTER = 1`（免费、每章清零、无金币、无广告）；`rerollPrice` / `REROLL_HIDDEN` 仅商店与掉落链路消费 |
| 27 | 词缀鉴赏（稀有保底） | `levelUp.ts` 注释与 `talents.ts` desc：「升级时装备选项至少 1 件稀有品质」，并导出 `LEVELUP_ENSURE_RARE_TALENT` | 该常量零消费者；升级弹层没有 `ensureRare` 调用点，判据只在 `ShopModel.ts:332`（字面量 `"affix_taste"`） |
| 28 | 引导第 3–5 步 | README / `DESIGN-V2`：6 步顺序教学，每条 8 秒自动隐藏 | Cocos 侧 `guideCtx(true, false)` 使第 3–5 步（`c.shop`）永不为真，游标停在第 3 步；`tutorialDone` 只能由「跳过」写下 |
| 29 | 品质档数 | README「已实现（核心循环 MVP）」仍记 4 档品质 + 三合一卡 | 5 档（含隐藏），且已拆成节律 / 独有技能 / 主动 + 被动法宝三层；README 该节自陈为历史面貌 ✅ |
| 30 | 竞技场尺寸 | `DESIGN-S4` / `DESIGN-V2` 记竞技场 480 × 854 基准 | `stages.ts` `CHAPTER_ARENA` = 480 × 854（逻辑场），画面侧是 560 宽设计空间 / 战场 560 × 996 标定带——两套坐标口径并存，换算见 `LAYOUT-LAB.md` 与 `run-game-in-app-browser` 记录（560×996 档 `px == 设计 px`，`imageY = 996 − worldY`） |
| 31 | 天赋「天赋树 30 节点」与「三系 91/91/98」 | `DESIGN-SEASON-FEEL`/README 记 30 节点、25 接入、5 占位 | `talents.ts` 与代码一致；`CONFIG-TABLES` 与 `DESIGN-VALUES-SPEC` 的「19 项」见第 6 行 |
| 32 | 测试基线 | 各文档状态行分别记 55/59/61 套、1996/3103/3973 条 | `tests/` 现 70 个 `*.test.ts`；历史状态行是当时快照，不作为当前事实 |
| 33 | 章型额外奖励 | `DESIGN-V3` §3.1：精英章 = 章间商店 +1 次免费刷新 + 15 金；宝箱章 = 暴击击杀金怪触发「金币雨」（本章后续掉落 +20%） | `chapters.ts` 的 `ChapterTypeSpec` 只有 `spawnScaleMult` / `burstMult` / `goldMix` / `intelPrefer` / `intelBias` 五个杠杆，**无奖励字段**；`ShopModel` 无免费刷新额度、无金币雨实现。章型差异目前只落在「密度 / 开局波 / 敌情 / 金怪混入」四件事上 |
| 34 | 商店免费刷新 | `daily.ts:36` 注释与 Web `src/game.ts:266` 字段 `shopFreeRefreshUsed`（「每章另有 1 次免费刷新」） | Cocos 侧 `ShopModel.refreshes` 只做金币递增计价（`(8 + 章节×2) × 1.6^本章已刷`），无免费额度；Web 侧该字段仍在（冻结基准） |
| 35 | 分岔时机 / 节点层 | `DESIGN-HERO-RHYTHM` / README 仍以「5–8 级成对分岔」为全体口径 | 三原型（薇拉 / 凯尔 / 薇洛）改走第 2 章选支 + 4/8/12 节点（`heroBuild.ts`、`branchPairDue` 对三原型返回 null）；其余 9 人仍是 5–8 级。`DESIGN-HERO-BUILD` 是这层的合同 ✅ |
| 35 | 战场几何 | 文档与 `stages.CHAPTER_ARENA` 记 480 × 854 | 真机 arena 由 `battleWorld.chapterArena()` 现取：`{x0: 0, y0: HUD_TOP_H 64, x1: 560, y1: worldH() − 底坞高}`，`worldH() = min(designH, WORLD_H_CAP 996)`、底坞高 v4 双排 96（缺省 48）→ 560 × 836 或 560 × 884；`CHAPTER_ARENA` 480 × 854 仅 `scripts/balance-sim.ts` 两处作兜底矩形（`:599` / `:1239`） |

**读法建议**：想知道「现在实际生效的数」→ 看本文 §2–§16 对应表；想知道「当初为什么这么定」→ 看 §17 与 `DESIGN-HERO-*` / `DESIGN-SEASON-*`；想知道「哪里还没做完」→ 看 §18 与 `TODO-HERO-RHYTHM.md`。文档状态行（含 `CONTEXT.md` 逐轮记录）记录的是撰写时事实，数字以 `game/data/*.ts` 与 `balance.json` 为准。

---

## 20. 事实源索引与核对方法

### 20.1 按主题的规范表（数值唯一出处）

| 主题 | 文件 | 行数 | 覆盖 |
|---|---|---|---|
| 玩家与战斗结算 | `game/data/combat.ts` | ~300 | 白值、经验曲线、连杀狂潮、金币/拾取/召唤物、反哺池、荆棘层、复活与 Boss 登场位 |
| 场地实体 | `game/data/field.ts` | ~80 | 弹体半径与连锁、召唤物默认、金币吸附、障碍与地形摆放 |
| 关卡 | `game/data/stages.ts` | ~130 | `STAGES` 七关、章长与章数、回响拆分、怪物数量与通关曲线、解锁门槛、补领 |
| 章型 | `game/data/chapters.ts` | ~110 | 四型章的密度/burst/金怪/敌情杠杆与热调合法区间 |
| 波次 | `game/systems/waves.ts` | ~130 | 生成间隔曲线、一波多只、出生点、敌情偏向与金怪替换 |
| 敌人与 Boss | `game/data/enemies.ts` | ~360 | 14 敌种、波次曲线、登场曲线、特化机制常量、Boss 血量曲线与三阶段参数 |
| 赛季主题怪 | `game/data/seasonMonsters.ts` | ~530 | 120 行三维倍率、出场倾向、3 个机制原语、24 只精英/首领技能 |
| 环境词缀 | `game/data/envAffixes.ts` | ~90 | 六词缀数值与每局抽取规则 |
| 品质 | `game/data/quality.ts` | ~270 | 五档主表与全部派生轴、掉落曲线、融合成本、扭蛋默认、关卡头像框 |
| 英雄 | `game/data/heroes.ts` | ~230 | 12 英雄文案与 `setId` 双射（无数值） |
| 节律 | `game/data/rhythm.ts` | ~200 | 六节律基础参数、等级缩放、本命分配、挂机档与 AI 参数 |
| 独有技能 | `game/data/heroSkills.ts` | ~760 | `HERO_SKILLS` 逐英雄 4 技能、通用职业包、分岔档、身份特効与调率、底拍 |
| 章节节点层 | `game/data/heroBuild.ts` | ~620 | 三原型 profile、6 条路线主循环、36 个 4/8/12 层节点、开章挂起与运行时资源 |
| 法宝 | `game/data/artifacts.ts` | ~450 | 14 主动、8+2 被动、8 遗物、槽位与衰减、共鸣发现、赛季共鸣格与赛季法宝 |
| 装备生成 | `game/data/equipmentGen.ts` | ~1110 | 14 效果白值与成长、开局武器、三选一构成、重随与融合消费链、价格与槽位 |
| 词缀 | `game/data/affixes.ts` | ~250 | 触发器/效果/修饰器定义与参数键 |
| 套组 | `game/data/sets.ts` | ~440 | 12 套定义、`SET_PIECE_TIERS` / `RESONANCE_TIERS`、`SET_BONUSES` 29 键 |
| 赛季三层 | `game/data/seasonSets.ts` | ~300 | L1 主题、L2 mutation 池与当季专属词缀、L3 发布季门控 |
| 组合技 | `game/data/combos.ts` | ~90 | 三组激活条件与 `COMBO_VALUES` |
| 天赋 | `game/data/talents.ts` | ~230 | 30 节点、三系路线、`TALENT_VALUES` 18 键与推导函数 |
| 商店 | `game/data/shop.ts` | ~70 | 卡价与刷新价曲线、合并/回收/偏向、广告开槽上限 |
| 扭蛋 | `game/data/gacha.ts` | ~130 | 券耗、权重、双保底、十连保底、重复补偿 |
| 赛季壳 | `game/data/season.ts` | ~100 | 14 天、进度解锁、星数、首通、补星、赛季分与结算 |
| 转生 | `game/data/prestige.ts` | ~30 | 回响公式四系数与溢出转化 |
| 通行证 | `game/data/pass.ts` | ~35 | 5 档阈值与奖励、星数权重、高级轨倍率 |
| 委托 | `game/data/commissions.ts` | ~150 | 6 区域、5 难度、衰减曲线、券与碎片兑换 |
| 每日与收藏 | `game/data/daily.ts` | ~200 | 体力、钻石与广告、三宝箱、六天赋、收藏贡献与升级 |
| 幻影榜 | `game/data/leaderboard.ts` | ~70 | 幽灵分曲线、LCG 种子、名次口径 |
| 升级闸门 | `game/data/levelUp.ts` | ~70 | 卡数、锁数、免费重随、首章三选一与共鸣保底 |
| 重随 | `game/data/reroll.ts` | ~90 | 价格曲线、隐藏概率与保底、亲和表 |
| 运行时 | `game/systems/battleWorld.ts` / `equipmentEngine.ts`、`battle/BattleSim.ts`、`GameShell.ts` | ~2700 / ~1130 / ~530 / ~2700 | 走位、结算管线、掉落拾取、形态调度、存档与广告闸门 |

### 20.2 核对方法

1. 逐表读源码（非抽样），数值一律从定义处转录；注释里的「含义 / 单位 / 取值依据 / 出处」一并带进本文「依据」列。
2. 交叉核过的既有文档：`CONFIG-TABLES.md`、`DESIGN-VALUES-SPEC.md`、`README.md` 玩法节、`DESIGN-V2/V3/S4`、`DESIGN-SEASON-FEEL`、`DESIGN-SEASON-SETS`、`DESIGN-MONSTERS-SEASONS`、`DESIGN-HERO-PIPELINE`、`DESIGN-HERO-RHYTHM`、`TODO-HERO-RHYTHM`、`SEASON-PACING-AUDIT`、`ADS-DESIGN`、`UI-DESIGN`——分歧记入 §19，不改任何既有文档。
3. 关键不变量按源码复核：`CHAPTERS_PER_STAGE` 与 `balance.battle.chaptersPerStage` 同为 15、七关 `bossChapter` 同为 15、`RHYTHM_IDS` 六条、`PASSIVE_SLOTS` 4、`SHOP_SLOT_CAP` 代码 6 与配置 8、`HIDDEN_PITY_N` 10、`THORN_STACK` 五参数、`BOSS_HP_CURVE.base` 5.0、广告入口唯一（`GameShell.watchAd` / `src/game.ts.watchAd`）。
4. 内联数值的定位方式：grep 未走 `@game/data/*` 的字面量并回读上下文，逐条落进 §16 的「文件:行号」——这一类是后续「数值入表」收敛的清单。
5. 行号基准是工作树当前状态；改过源码后行号会漂，认符号名不认行号。
