# 赛季手感迭代设计（压力 · 决策 · Boss · 养成）

> 目标：让一局战斗有**可感知的成长形状**、**真实的生存压力**、**每章都要做取舍的金币决策**、
> 以及**一场需要躲闪的关底 Boss 战**。跨局养成补上技能等级入口与英雄独有技能。
> 编号 F1–F10 见文末「需求对账」。落地顺序 A → B → C → D，A 批先走。
>
> 数值纪律：所有新增数值入表，禁止内联魔法数（见 [DESIGN-VALUES-SPEC](DESIGN-VALUES-SPEC.md)）。
> 本文所有 `文件:行` 均为撰写时的现役 Cocos 侧事实（`S/` = `cocos/assets/scripts/`）。

---

## 0. 现状定位（决定方案的四个事实）

| 事实 | 证据 | 影响 |
| --- | --- | --- |
| 玩家本体等级在本局内**永不提升** | `addXp` 全仓只有定义无调用（`S/game/entities/player.ts:50`），而击杀掉落已改为金币（`S/game/data/combat.ts:68-77`）→ 经验没有入口 | 成长只剩"多买几张卡"，F1「没有变强过程」的直接根因 |
| 开局武器已经是终局形状 | 默认飞刀 `spread=16 / pierce=1 / damage=40`（`S/game/data/equipmentGen.ts:351-357`），代码注释自陈"前 5 章新手区一发秒，挂机可随意通过" | 第 1 章与第 20 章的**形状差**几乎为零 |
| 三个场内成长函数写好了没接线 | `upgradeCost`/`canUpgrade`（`equipmentGen.ts:683,688`）、`generateChoices`（`:295`）、`reforgeEquipment`（`:327`）、`applyTargetedSearch`（`:339`）—— cocos 侧零调用 | F5、F9 大部分是接线工作，不是新系统 |
| 击退是瞬时位移 | `enemy.ts:599-605` 直接 `pos += dir×(power/d)`，无速度、无质量、无抗性；力度字面量散在 6 处（投射物 30 `battleWorld.ts:1003`、区域 tick 60 `:1087`、nova 120 / chain 40 / supernova 200 / explode 90 `equipmentEngine.ts:482,553,607,668`），仅召唤 20 与死亡连锁 60 走表 | 同时造成 F1「范围太大」与 F2「没有生存压力」 |

补充一条纠偏：**关底已经是"必须击杀"**——末章超时未杀 Boss 会置死判负（`S/game/systems/battleWorld.ts:669-683`），
杀掉即刻通关（`:649-652`）。F7 的真实缺口不是判定，而是**时长与压迫感**：
Boss 血量标定成 TTK 20–40 s（`S/game/data/enemies.ts:319-333`），落在 60 s 章时限内绰绰有余，
所以打起来像"顺手就过了"。

---

## 批次 A · 决策与金币闭环（F5 F9 F6）

本批以**接线**为主（A1 强化、A2 三选一与重随），新增两张表（重随曲线、技能亲和），产出重标（A4）排在出口补齐之后。
**本批不动伤害与血量曲线** → 手感立刻变，风险最低。

### A1 场内强化上货架（金币深出口，F5）

**问题定量**：第 10 章每章产出 ≈1000+ 金（间隔 = `0.9 × 0.9^4 × 0.96^5 ≈ 0.48 s`，公式见 `S/game/systems/waves.ts:46-47`；
第 6 章起每 tick 出 2 只 = `SPAWN_MULTI_FROM`；≈250 只 × 均值 5 金），
而同章出口 = 3 张卡 ≈120 + 一次槽位 ≤230 + 刷新 ≤90；槽位硬顶 8 → 6–8 件满场后**零出口**
（`S/game/data/shop.ts:9-14`、`equipmentGen.ts:651-655`、`battleWorld.ts:1327-1333`）。

**做法**：武器行（现在只有「点选 / 销毁」，`ShopModel.ts:294-308`）加一颗**强化钮**。

- 逻辑：直接调已存在的 `upgradeEquipment`（`equipmentGen.ts:223-235`，每级 damage/dps/heal/amount ×1.12、radius ×1.03）
  与 `upgradeCost`（`:688`，= 品质基础价 ×(1+(level−1)×0.6)，递增系数 `QUALITY_UPGRADE_COST_GROWTH` 在 `S/game/data/quality.ts:172`）。
- 视图：`ShopWeaponView` 加 `upgradeText` / `upgradeCost` / `canUpgrade`（`ShopModel.ts:96-106`），
  可强化的卡显示"→ 下一级数值预览"（数值差直接写在钮上，解决 F9「变化体感差」）。
- 出口深度（按上式实算，单件从 1 级强到品质满级）：common **114** / rare 588 / epic 2,640 / legendary 9,360 / hidden 24,320 金
  → 8 件满场后金币依然有万金级去处，F5 的"零出口"消失。
- 热区顺序：`ShopModel.ts:347` 那段注释（工具钮→槽位→三卡→武器行→进化→下一章）需同步为
  「武器行内：强化 > 销毁」，并更新对应测试。

**验收**：新 `tests/shop-upgrade.test.ts` — 价格曲线逐位对齐 `upgradeCost`、达 `QUALITY_MAX_LEVEL` 后钮禁用、
金币不足禁用、强化后 params 与 `EQUIPMENT_LEVEL_GROWTH` 同源（用 grep 锁本文件不出现强化价字面量）。

### A2 升级三选一 + 单卡重随（F9）

**决策点收在一处（落地范围调整）**：重随与锁定**全部收进「升级三选一」弹层**，章间商店的货架卡保持原样。

两条理由：

1. 商店塞不下第三颗钮 —— 卡带是**定高、不参与弹性生长**的（`game/ui/shop.ts:227` 注释自陈"卡一长高，`frame_<品质>` 的白带就盖住卡名"），
   工具钮行又是 4 钮等宽 126 对标 Web 的冻结口径。在不破坏这两条的前提下，货架卡上没有重随钮的位置。
2. F9 的原话是「**升级时**可以选择保存哪个或者重新随机」—— 那个时刻就是升级三选一，不是货架。

所以三选一弹层是 A2 的唯一新界面：三张卡各带「选它 / 重随 / 锁定」，几何从零设计，不与任何已验收屏抢位置。

**弹层内的三选一**（模态暂停）：选项 =
`generateChoices(cardLevel(), 3, ensureRare, rareBonus, owned)`（`equipmentGen.ts:295`，已含 1 张强化卡）。
选完立即恢复战斗，不进商店。
**A 批自带最小版经验入口**：`killEnemy` 内补 `player.addXp(e.def.xp)`，经验曲线参数原样不动（`combat.ts:33-40`）——
只接"升级 → 弹三选一"这一条通路，等级收益（HP / 回血 / 弹幕形状）留到 B2，这样 A 批可独立交付与验收。

**重随语义**：新函数 `rerollCard(eq)` = 重随**触发器 + 修饰器，效果不变**
（现有 `reforgeEquipment` 只动修饰器，`equipmentGen.ts:327-331`；效果若变，玩家会觉得"我点的不是这张"）。

**「保存哪个」**：弹层内每张卡可**锁定**（`lockedOffer`，同时最多锁 1 张，本局内跨弹层记忆）。
被锁的卡不进重随池，且下一轮三选一必再出现一次 → 玩家能"囤一张好卡等钱"，这就是长线取舍。

**新表**（落在 `S/game/data/shop.ts` 或新 `data/reroll.ts`）：

```
REROLL_CURVE        = { base: 12, growth: 1.5 }        // 价 = base × growth^n，n = 本章已重随次数，进下一章清零
REROLL_HIDDEN       = { chance: 0.06, pity: 12 }       // 隐藏词条概率 + 本局累计未出必出
SKILL_AFFINITY      : Record<EffectType, { triggers: TriggerType[], modifiers: ModifierType[] }>
SET_AFFINITY_BIAS   : Record<SetId, { weight: 3 }>     // 英雄特色覆写：所属套组亲和触发器权重 ×3
```

`SKILL_AFFINITY` 是 F9「不同技能适配不一样（参考英雄特色）」的落点：
例 `meteor → { triggers:["pulse","combo"], modifiers:["explode","power"] }`、
`frost_ring → { triggers:["move","hurt"], modifiers:["chain","duration"] }`。
重随时在亲和池内 ×3 加权，非亲和项仍可能出（保留构筑意外）。

**隐藏词条**（F9「重随有概率出现隐藏触发器加修饰器」）：
现有 `HiddenAffixType` 4 条（`S/game/data/affixes.ts:25`）是**效果级**、只走词缀融合，保持不动。
本批另开两个小池，走重随通道：

- 新触发器 2 个：`onCrit`（暴击时）、`onEliteKill`（击杀精英/Boss 时）→ 扩 `TriggerType`（`affixes.ts:6`）+ 结算分支（`equipmentEngine.ts:132-214`）。
- 新修饰器 2 个：`echo`（效果 0.35 s 后二次触发，系数 0.5）、`condemned`（对 HP<30% 敌人伤害 +45%）→ 扩 `ModifierType`（`affixes.ts:22`）。
- 命中隐藏时卡面复用隐藏品质彩虹框色 `#4dffc8`（`quality.ts:88`），加 `Equipment.hiddenAffix?: boolean` 标记。

**落地形状**：

- 新屏 `S/levelup/LevelUpModel.ts`（cc-free 账本：三张 `Choice`、按章清零的重随计数、本局隐藏保底连续未出计数、跨弹层的锁定项）+ `LevelUpView.ts`（只摆节点）。
- 策略表 `S/game/data/levelUp.ts`：`LEVELUP_OFFER_COUNT` / `LEVELUP_LOCK_LIMIT` / `LEVELUP_ENSURE_RARE_TALENT` / `LEVELUP_MAIN_LABELS`（键集派生自 `UPGRADE_MAIN_KEYS`，不会与强化口径漂移）。
- 共享几何 `S/game/ui/levelUpLayout.ts`：盒 528×552 居中、三卡 168×412、每卡三钮 144×44（= `ui.touchMin`）、坐标宽高全偶。
- 宿主侧：`BattleWorldHost.onLevelUp?(levels)` 纯通知（`addXp` 内部是 while 循环只返 boolean，连升级数由前后等级之差得出）；`GameShell` 持升级队列、弹层开着时在 `update()` 里另设一道停战闸门（弹层不挂路由，`router.blocksPlay()` 看不到它），并处理"升级与章末转场撞同一帧"的自愈。

**连带修复（必须与本批同笔）**：图鉴与转生屏「定向搜索」原本直接枚举整张 `TRIGGERS` / `MODIFIERS`，
扩表会把隐藏词条摆进图鉴、还能在开局配置里**白选** → 稀有度模型直接垮。改为只枚举常规池
（`NORMAL_TRIGGER_DEFS` / `NORMAL_MODIFIER_DEFS`，由 `affixes.ts` 的隐藏归属过滤派生），
并且图鉴**分子**也要排除隐藏词条的显示名（`save.collection` 收的是"见过的一切"，重随发现的隐藏词条会进去，
否则出现「触发器 7/6」）。既有断言按"分母 = 常规池表长"改写，**6 / 14 / 8 三个字面量保留、没有放宽**。

**验收**：确定性 rand 下单测 — pity 第 12 次必出隐藏；亲和触发器出现率 ≥ 3× 非亲和基准；
锁定卡不出现在重随结果且下轮必现。

### A3 局内槽位改广告解锁（F6）

**现状**：局内槽位走金币 `slotExpandCost = 100 × 2.3^n`，硬顶 8，无广告闸门（`equipmentGen.ts:651-655`、`ShopModel.ts:284-292`）。

**改法**（口径已定：**局内槽**）：

- 本局第 7、8 槽 = 各看 1 次广告解锁；`slotExpandCost` 的金币通道退役（出口由 A1 强化补回，金币不会更闲）。
- 天赋槽 `slot1/slot2`（`S/game/data/talents.ts:54,58`，各 +1 永久槽）保持星尘购买，**不动**。
- `SHOP_SLOT_CAP = 8` 不变。

**广告闸门纪律**（仓库已有 8 处广告位，唯一守卫是 `GameShell.watchAd` 首行 `if (this.adPending) return;`，`S/GameShell.ts:769-771`）：

- `ShopModel` 是纯模型，**不碰广告**：模型侧只给两个只读查询（`adSlotLeft()` / `slotMaxed()`）加一个**入账半边** `grantSlotByAd()`
  （复用既有的 `ShopWorld.addRunSlot()`，所以 `ShopWorld` 接口没长新成员、各处假世界与既有测试都不用改）；
  宿主侧负责看广告、在成功回调里调 `grantSlotByAd()`，走唯一 `watchAd`。广告是异步回调，`onShopAction` 末尾那次 `sync()` 早已跑完，回调里要自己补一次。
- 现有测试锁的是「整个 GameShell 里 `if (this.adPending) return;` 只出现 1 次」（`tests/cocos-phase4-gacha.test.ts:1582`）。
  新增第 9 个广告位只多一个**调用点**，不新增闸门 → 守卫仍为 1。**禁止**在商店屏自建 pending 标志。
- 每局上限 **2 次**（对应第 7、8 槽），**每局开始时重置**（计数就挂在 `runSlotBonus` 上，开局归零）；不设日上限。
  ⚠️ 但要记清代价：`GameShell.watchAd` 对**每次看完的广告都发 1 钻**、受 `DIAMOND_AD_DAILY = 10` 的日上限约束，
  所以槽位广告与道具扩容广告是**共享**那份钻石日预算的，不是两条独立账 —— 单局最多 4 次解锁型广告（槽 2 + 道具 2）
  就能吃掉当日近一半钻石额度。这正是 D3 那条「广告次数/局 ≤ 6」指标要盯的东西。
  广告失败/无库存时钮文案转「暂不可用」，不回退成金币价（避免同一格出现两种价）。

**验收**：实机 harness 一例 — 看完广告槽位 +1 且金币不扣；未看完时钮禁用；第 8 槽后钮消失；`adPending` 计数守卫仍为 1。

### A4 金币产出与价格重标（F5）

**顺序纪律**：必须在 A1（强化）、A2（重随）、A3（槽位改为不花金币）三个出口都落地之后再动产出，
否则先砍产出只会让玩家更穷而不是更有取舍感。

| 项 | 现值 | 目标 | 落点 |
| --- | --- | --- | --- |
| 金币换算 | `GOLD_PER_XP 2` | **1** | `combat.ts:71` → 新增 `balance.json → battle.economy.goldPerXp` |
| Boss 固定掉落 | `BOSS_GOLD 60` | **45** | `combat.ts:73` |
| 精英堆数 | `ELITE_GEM_COUNT 8` | **6** | `combat.ts:75` |
| 卡价·已购递增 | `perPurchase 0.12` | **0.18** | `S/game/data/shop.ts:11` |
| 卡价·章节递增 | `perChapter 0.03` | **0.05** | `S/game/data/shop.ts:13` |
| 重随价 | 无 | `12 × 1.5^n`（A2 新表） | `data/reroll.ts` |
| 溢出金币 | 超过 `LIMITS.gems 300` **直接丢弃最早的堆**（`battleWorld.ts:1333`） | 上限提至 420，且溢出的新堆**并入最近的那一堆**（数值累加，不产生可见损失） | `LIMITS.gems` |

**验收（实测口径与结果）**：量具是 `tests/gold-economy.test.ts`（11 条）。

⚠️ **与原方案的偏差**：原写的是"sim 输出每章末金币余额分布（7 种子）"，那需要一套消费策略驱动的 sim；
实际落地用的是**表算口径**——按 `waves` 的生成公式算每章击杀数，乘平均经验得产出，与"一轮出口"（三张史诗卡 + 一次史诗强化 + 一次重随）相比。
它不依赖操作策略、可复现、逐项可核，但**不是**真实游玩下的余额分布。带消费策略的 sim 分布留作后续。

实测（平均经验取 2 的保守口径；刷怪常量读随仓 `balance.json → waves`，未在测试里另抄）：

| 章 | 击杀≈ | 产出≈ | 一轮出口≈ | 产出/出口 比值（重标前 → 后） |
| --- | --- | --- | --- | --- |
| 1 | 67 | 133 | 439 | 0.65 → **0.30** |
| 5 | 102 | 203 | 482 | 0.93 → **0.42** |
| 10 | 249 | 498 | 534 | 2.14 → **0.93** |
| 15 | 459 | 917 | 588 | 3.70 → **1.56** |
| 20 | 750 | 1500 | 641 | 5.69 → **2.34** |

**如实读这张表**：比值全档约略减半（产出砍半、出口 +15%），但**第 15/20 章仍大于 1** —— 光靠 A4 并不能让后期"产出 < 出口"。
真正堵上 F5「满场后零出口」的是 A1 那个**可重复**的深出口：单件从 1 级强到品质满级要吃
common 114 / rare 588 / epic **2,640** / legendary **9,360** / hidden 24,320 金（八件传奇满场 ≈ 7.5 万金）。
A4 的作用不是制造稀缺，而是**把每次购买的分量放大**：产出数字减半后，"买这张还是强化那张"才有重量。
后期存在盈余是设计意图（成长回报），前提是盈余有地方去 —— 这已由 A1/A2 提供。

战斗指纹按 P6 重标：`gold=` 字段逐行**正好减半**（10→5 / 16→8 / 32→16 / 38→19 / 48→24 / 60→30），
`k/en/pr/gm/cl/mn/hp/lv/px` 与 `eh=`/`ph=` 两列摘要逐字未变 → 证明本次只动了产出、未扰动随机流。

---

## 批次 B · 成长形状与生存压力（F1 F2 F3）

本批会移动战斗指纹与既有标定基线，**单独一笔提交**，且先只改表、后改机制。

### B1 开局武器降档：把"满弹幕"还给后期（F1）

- `makeStarterEquipment('knife')`（`equipmentGen.ts:349-367`）：`spread 16→5`、`pierce 1→0`、`damage 40→12`、`interval 1.2→1.5`。
  腐尸 HP 30 → 首章约 3 发杀 1 只。
- 12 把套组初始武器（`equipmentGen.ts:391-520`）同批降档，规则统一为：**第 1 章单只腐尸 TTK ∈ [2.0 s, 3.5 s]**。
- 新增弹幕数量随等级成长（这是"变强看得见"的主轴）：

```
SPREAD_GROWTH = { perLevels: 4, max: 12 }   // spread = base + min(max, floor(level/4))，落 S/game/data/quality.ts 或 combat.ts
```

  于是"全向 16 发"变成**终局形态**（等级/强化堆出来），而不是开局就发给玩家。

### B2 接通玩家本体等级（F1）

- `killEnemy` 内补 `player.addXp(e.def.xp)`（`battleWorld.ts:1275-1335` 段尾）；金币掉落公式不变。
- 等级收益：`maxHp += hpPerLevel(8)`（`combat.ts:23`）、升级回血 `LEVELUP_HEAL_PCT 0.2`（`:43`）、
  **每级触发一次 A2 三选一**。不新增第四种收益，避免和装备/天赋抢语义。
- 经验曲线目标：**终局（20 章）等级落在 25–35**，即每 30–50 杀一级、每章约 1.5 次决策。
  曲线参数 `XP_BASE/XP_PER_LEVEL/XP_POWER_*`（`combat.ts:33-40`）先按此目标跑 sim 定标，再写入 `balance.json → battle.xp` 段。

### B3 击退改冲量模型 + 抗性表（F1 F2）

把瞬时位移换成有物理感的冲量，是 F2「没有生存压力」的主修口：

- `Enemy` 加 `knockVel: Vec2` 与 `knockResist: number`；`knockback()`（`enemy.ts:599-605`）改写为
  `knockVel += dir × power / mass`，每帧 `pos += knockVel·dt`、`knockVel ×= exp(−KNOCK_DRAG·dt)`，位移后按竞技场钳制。
- 新表（落 `S/game/data/combat.ts` 或新 `data/knockback.ts`）：

```
KNOCKBACK_MODEL   = { drag: 9, maxOffset: 180 }                 // 衰减 1/s、单帧累积位移上限 px
KNOCKBACK_FORCE   : Record<EffectId, number>                    // 收 6 处内联：投射物 18 / 区域 tick 30 / nova 55 / supernova 90 / explode 40 / chain 20
KNOCK_MASS        : Record<EnemyKind, number>                   // 显式表：腐尸 0.9 / 迅捷鬼 0.7 / 石巨 1.8 / elite 2.2 / god 4
KNOCK_RESIST      : Record<EnemyKind, number>                   // boss/god 1.0（免疫）、elite 0.6、tank 0.5、shieldguard 0.4
```

- 力度对比现值：投射物 30→18、nova 120→55、supernova 200→90 → 直接回应"击退能力太强范围太大"。
- Boss 与精英免疫后，P2 震击/召唤的贴近压力才成立（B4/C 批依赖这条）。

### B4 受伤与回血节奏（F2）

- `THORN_HEAL_PCT 0.02 → 0.012`，且触发条件从"该构筑内挨打即回"（两处结算：`battleWorld.ts:848` 与 `:881`，均由 `isThornBuild()` 门控）
  改成 **荆棘爆发命中才回** → 保留荆棘 Build 身份，去掉该构筑内"站着让人打反而满血"的反直觉正解。改动只作用于荆棘构筑，其余构筑不受影响。
- `CONTACT_HIT_CD 0.8 → 0.6`（`combat.ts:48`）：被围时的掉血速率 +33%。
- 压力目标（实机 + sim 双口径）：第 1 章稳态 HP ∈ [60, 90]、第 6 关不带回复构筑时 HP 峰值 < 50、
  末关需要护盾/回血卡才敢站桩。

### B5 "打不死的怪"改高防御 / 正面防御（F3）

**根因定位**：代码里没有无敌怪。体感来自**回血叠加**——第 3 关「沼泽深处」带 `heal_aura`（敌人每秒回 2% maxHp，
`S/game/data/stages.ts:36`、`envAffixes.ts:28`），第 6 关「深渊之喉」叠了 `heal_aura + mist + 吞噬者`
（`stages.ts:39`、吞噬者被弹命中回血 `healRate 0.5` 在 `S/game/data/seasonMonsters.ts:169`、结算在 `battleWorld.ts:990-995`）。
DPS 追不上回血即构成事实无限，`mist` 又让目标周期免命（`battleWorld.ts:771-774` + `:1203`）。

**改法**（正面减伤已有实现，`enemy.ts:219-227`、`enemies.ts:309-315`，把它扶正为主机制）：

| 项 | 处置 |
| --- | --- |
| 新机制 `armor` | 每击固定减免 N（结算后最低留 1 点）。tank 8、新「铁卫」16 → "防御更高"的直白表达 |
| 新环境词缀 `bulwark`（铁壁） | 正面弧 `FRONT_GUARD_DOT` 0.5 → 对应 110°、期内 `FRONT_GUARD_MULT` 0.2 → 0.12 → "正面防御" |
| 第 3 关（P2 = A） | 治疗光环**保留但降档** `2%/s → 1%/s`；回血时飘绿色读数、顶部词缀条常驻（现在只有进关时一闪）；`envAffixes.ts:28` 的 desc「每秒回复 2% 生命」同步改数值 |
| 第 6 关（P2 = A） | 治疗光环同样 1%/s；`mist` 隐身**不再作用于精英与 Boss**（`battleWorld.ts:771-774` 加豁免）；吞噬者 `devour.healRate` 0.5 → 0.25 并加衰减 `{decay:0.5, window:2}` |
| 隐身免命 | 保留为"需要多段/持续伤害应对"的机制，但**不再与回血同关叠加作用于精英** |

**P2 = A 的连带落点**：`armor` 与 `bulwark` 作为**新机制**上线，但不替换第 3/6 关既有主题
（第 4 关「裂谷火海」已挂 `time_dilation + reflect_field`，再塞铁壁会串味，见 `stages.ts:37`）——改挂**第 2 关**：

- 第 2 关「荒野求生」的词缀从 `mist` 换成 `bulwark`（`stages.ts:35`），desc「荒原上的脚步声越来越密」保留。
- `mist` 由此收敛为**只在第 6 关**出现，且不再作用于精英与 Boss → 同时消掉"打不中"在两关重复投放的体感。
- 第 2 关因此成为**正面减伤的教学关**：在玩家 DPS 还低的早期建立"绕后 / 用 AOE"的操作习惯，
  为第 3 关的回血墙与后面 Boss 的正面防御铺路。
- `armor` 挂 tank（石巨）与新敌人「铁卫」，第 2 关起出场。

这样 F3 要的"高防御 / 正面防御"体验成立，第 3 关「持续输出破回血」的原有玩法也不被抹掉。
真正要拆掉的是那一层叠加：**回血 + 打不中同时出现在第 6 关且都作用于精英**。

---

## 批次 C · 关底 Boss 战重做（F7）

### C1 控制免疫表

`EnemyDef` 加控制抵抗结构（走 `S/game/data/enemies.ts`）：

```
cc: { knockResist: number, slowResist: number, immuneHidden: boolean }   // boss: {1, 0.6, true}
```

施加侧补判定点：`applySlow`（`enemy.ts:275-278`，现无 Boss 例外）乘 `(1 − slowResist)`；
`knockback` 走 B3 的 `KNOCK_RESIST`；`immuneHidden` 修掉当前"迷雾词缀让 Boss 周期不可命中"的体验漏洞。

### C2 时长闸：把 Boss 战撑成一场战斗

- Boss 所在章独立时长 `BOSS_CHAPTER_SECONDS = 150`（普通章仍 60 s；`balance.json → battle.chapterSeconds` 旁新增键）。
  取 150 而非 120：让"2 分钟内打完"是**正常节奏**，而不是卡线判负——超时线只用来惩罚"完全不针对 Boss 构筑"。
- **阶段锁**：血量跨过 `BOSS_PHASE2_HP 0.6` / `BOSS_PHASE3_HP 0.25`（`enemies.ts:340-341`）时冻结伤害 1.6 s + 播阶段演出 + `bossBanner`。
  作用有二：机制必然展开（旧标定注释自陈"三阶段机制毫无存在感"，`enemies.ts:323`）；顺带堵住"一发大招秒过阶段"。
- 血量重标目标（P4 口径：**正常数值下 2 分钟内能打下**）：首关 TTK **45–60 s**、第 7 关 **90–120 s**，硬上限压在 120 s，
  与 150 s 时限之间留 30 s 容错。`BOSS_HP_CURVE`（`enemies.ts:328`，现 base 2.0 / growth √2）的系数**等 B1/B2 落地后重取 DPS 锚再定**
  ——现锚点 48 / 191 会被降档与本体成长同时改掉，先跑 sim 反解系数，别先写死。
- 偶数关弱化变体保留 `×0.7`（`enemies.ts:343-344`），但"跳过 P2"改为"跳过 P3"，保证至少展开一段机制。

**连带影响（P4 已接受）**：Boss 章的实际耗时 = TTK（杀掉即刻通关，`battleWorld.ts:649-652`），
现 20–40 s → 改后 45–120 s，即每关 +25~80 s、**单局约 +4~6 分钟**。
`docs/SEASON-PACING-AUDIT.md` §3 现记"单局 20–32 分钟，目标区间 15–30 分钟" → 需重跑并把目标区间上移到 **20–35 分钟**。

### C3 攻击模式机 + 敌方弹幕

现 Boss AI 是"按血量阶段反应式出招"（`S/game/entities/enemy.ts:552-596`），且**敌方弹幕不存在**：
现有 `barrage`（`enemy.ts:436-445`、`enemies.ts:83`）是"在玩家附近撒预警圈"的落点攻击，
`spawnProjectile`（`entities/projectile.ts:66`）是玩家专用。所以：

1. **模式机**（满足"攻击模式固定"＝可背板）：

```
BOSS_PATTERNS : Record<BossId, readonly Pattern[]>
Pattern = { id, phases: number[], telegraph: number, action: ActionSpec, cooldown: number }
```

   每个 phase 从自己的轮转表**按序**取下一招（顺序固定、非随机），玩家两遍就能背。

2. **敌方弹体通道**：`projectile.ts` 的 `spawnProjectile` 加 `hostile?: boolean`，
   命中判定改走 `player.takeDamage`（复用现有渲染/TTL，成本最低）。

3. 深渊领主招式表（S1 落地版）：

| 阶段 | 招式 | 规格 | 玩家该做什么 |
| --- | --- | --- | --- |
| P1 | **中央扫射**（新增，即你举的例子） | 跳场地中央（位移演出 0.8 s）→ 蓄力 1.2 s 预警 → 6 道扇形弹幕顺时针转一圈（8 步 × 45°） | 绕圈躲 |
| P1 | 反射（保留） | `REFLECT_RATE_BOSS 0.15`（`enemies.ts:307`） | 控制单发规模 |
| P2 | 地面震击（保留） | 蓄力 1.2 s / 220 px / 80 伤（`enemies.ts:346-347`） | 看红圈走位 |
| P2 | **环形弹幕**（新增） | 12 发、charge 1.0 s、damage 45 | 找缺口穿 |
| P2 | 召唤（保留） | `BOSS_SUMMON p2:6 / count:2`（`:348-349`） | — |
| P3 | 狂暴冲锋（新增，替掉纯数值狂暴） | 锁定玩家 0.6 s 预警 → 直线冲刺 900 px/s；移速 `BOSS_FRENZY_SPEED 1.4` 保留 | 侧闪 |

### C4 多 Boss 差异化

`ENEMY_DEFS.boss` 加 `patternId`，按关号取模轮转。**S1 只做 2 个**：

- `abyss_lord`（现有深渊领主，上表重做）。
- `iron_colossus`「玄铁巨像」（新）：慢（移速 0.6×）、正面免疫 `×0.2`、大范围踩击（半径 300 / 蓄力 1.6 s）+ 直线三排弹幕 →
  教会玩家"绕后"，正好把 B5 的正面防御机制在教学关里立起来。

后续赛季每季 +1 个 Boss（美术：新立绘 1 张/季，走像素档 AI 生图）。

---

## 批次 D · 养成与内容（F4 F8 F10）

### D1 技能等级入口（F4）

数值层已有，缺入口与统一命名：`gearup` 屏按**装备名**索引永久等级（`S/gearup/GearUpModel.ts:111-123`），
上限 `GEAR_UPGRADE_MAX = 5`、每级把该件的收藏贡献 ×1.25（`GEAR_UPGRADE_STEP`，`S/game/data/daily.ts:167-169`）；
被放大的是收藏图鉴那件装备给的全局攻/血百分比（`quality.ts:47-50` 的 `collectionAtkPct` / `collectionHpPct`）——
即"等级 → 收藏贡献 → 全局白值"两跳，不是直接给攻防。

1. **先修键**：索引从 `name` 改 `effect.def.type`。现状融合会改卡名（`S/game/data/fusion.ts:115` 拼 `融合·…`）导致同一技能另起一格。
   存档迁移一次性做：旧 name 键 → type 键，取该档已花点数的 max。
2. **英雄界面加入口**：技能详情恒 4 条（`S/game/data/heroes.ts:232-259`）每条右侧加「Lv n/5 + 升级钮」，
   直接执行 gearup 的等级动作（消耗同一份货币，不新增数值系统）。
3. **术语统一**：全场界面文案改称「技能等级」，gearup 屏保留为"总览/批量升级"，两处读同一份账。

### D2 六独有 + 六常规（F8，S1 起手，按赛季迭代）

**目标模型**：套装 = 这个英雄的 6 个独有技能。这条把 F8「套装不明确」一次解掉——
件数归属不再靠"效果类型是否被本套认领"（现状 14 个效果各被 2 套共享，`S/game/data/sets.ts:7-8,296-302`，"独有"根本不存在）。

- **常规技能 6 个**（全员标配，人人可装）：飞刀 `knife`、新星 `nova`、毒云 `cloud`、护盾 `shield`、回血 `drain`、闪电链 `chain`。
  （现 `GENERIC_EFFECT_TYPES` 8 个中的 skeleton / ray / 批 3-4 特效归入独有池或赛季套组。）
- **独有技能 6 个/英雄**：只该英雄可装备与触发；`isSetPiece`（`sets.ts:320-331`）改判 `skill.ownerHeroId ?? skill.setId`。
- **门槛**：3/6 件不变（`sets.ts:199-204`），但计件只数独有技能 → 文案与进度条终于一致。
- 顺带修两处对不上的文案：`sets.ts:333` 注释仍写"2 件/4 件"、`ShopModel.ts:429-431` 显示 `pieces/4` 而进度条按 /6。

**S1 范围（P5 已定：S1 就做三个英雄，逐赛季迭代）**：
S1 主题「回响苏醒」（`DESIGN-MONSTERS-SEASONS` §1），做 **3 个常驻套英雄 × 6 = 18 个独有技能**：
**荆棘 / 寒霜 / 余烬**（玩家接触最早的三套）。其余 9 个英雄沿用现套组身份，S2 起每季补 3 个。

- 18 个里约 12 个需要新效果（`EffectType` 扩容 + `effectParams` + `equipmentEngine` 分支），约 6 个由现有特效改壳。
- 数值全入新表 `SKILL_DEFS`；美术 18 枚图标（AI 生图，像素档）+ 复用 `fxLayer` 特效通道（`project-fx-art-direction` 已建立的路线）。
- 存档兼容：新增 `heroSkillLoadout: Record<HeroId, SkillId[]>`（默认 = 该英雄 6 独有），`selectedHero` 仍是唯一事实源、`selectedSet` 派生镜像（现有纪律，`heroes.ts:4-6`）。

### D3 商店道具（F10）

现状：**完全没有道具概念**（`cocos/assets/scripts` 内 `道具/item/consumable/inventory` 零命中，玩家身上只有 `equipment ≤8`）→ 新子系统。

- 数据：`player.relics: RelicId[]`，`startRun` 清空（局内制，与金币同生命周期）。
- 上限：`RELIC_CAP = 4`；第 5、6 格各看 1 次广告解锁 → `RELIC_HARD_CAP = 6`；两个广告格均**每局重置**（与 A3 槽位同口径）。
- ⚠️ **广告密度**：A3 槽位 2 次 + D3 道具 2 次 = 单局最多 4 次解锁型广告，叠加原有复活 / 通关双倍 / 体力等 8 处 →
  落地时给 `GameShell` 加一个**「广告次数 / 局」计数指标**（目标 ≤ 6 次/局），超阈值时后续广告格转为灰置提示，
  避免同一段构筑里连续弹四层广告。
- 获取：章间商店第 4 类商品（**本局第 1/2/3/4 件 = 60 / 90 / 140 / 210**，即 `round(60 × 1.5^(n-1))`，每章库存 1 件；与装备卡同用局内金币，进下一局清零）
  + 精英怪 3% 掉落。
- 效果做成**被动为主**（无操作负担），新表 `RELIC_DEFS`（8 件，"样式多种多样"= 8 枚独立图标 + 品质框复用 `frame_<品质>`）：

| id | 名 | 效果 | 数值键 |
| --- | --- | --- | --- |
| `dice` | 命运骰 | 三选一/重随的隐藏词条概率 +15% | 乘区挂 `REROLL_HIDDEN.chance` |
| `core` | 裂核 | 暴击率 +8% | 挂结算乘区（`battleWorld.ts:1201-1232`） |
| `hourglass` | 沙漏 | 全装备触发间隔 −10% | 走 `QUALITY_HASTE_CAP` 内叠加 |
| `lens` | 透镜 | 效果范围 +12% | radius 乘区 |
| `stabilizer` | 稳定器 | 弹道速度 +25% | speed 乘区 |
| `yoke` | 磁轭 | 拾取半径 +40% | `GEM_MAGNET_RADIUS` 乘区（`combat.ts:80-81`） |
| `mirror` | 护心镜 | 接触伤害 −15% | 受击乘区 |
| `spare_life` | 假命 | 死亡时 20% 免死一次（全局 1 次/局） | 与广告复活相互独立，先结算它 |

- 与 F5 的联动：道具是金币的**第二个深出口**，且它不与装备抢槽位 → 构筑决策面变宽而不加长 HUD 主行。

---

## 分期与提交切分

| 期 | 内容 | 动到的基线 | 验收 |
| --- | --- | --- | --- |
| A | A1 强化上货架、A2 三选一+重随+锁定、A3 局内槽广告、A4 金币曲线 | A2 的经验入口与 A4 的产出改动**都会移动战斗指纹** → 需 `-u` 重标（同 P6，本批唯一需签字的基线移动）；其余为新增测试 | 新单测 3 套 + 实机 harness（商店/重随/广告槽）|
| B | B1 降档、B2 等级接通、B3 击退冲量化、B4 回血节奏、B5 防御改造 | **战斗指纹、boss.test DPS 锚、seasonPacing 时长审计**全部移动 | sim 出「每章余额 / 等级曲线 / HP 稳态」三张分布 + 实机 |
| C | C1 免疫表、C2 时长闸、C3 模式机+敌方弹体、C4 双 Boss | 单局时长 +7 分钟需重定审计目标区间 | 实机录 Boss 战帧序（预警→走位→阶段锁逐段出现）|
| D | D1 入口与键修复、D2 S1 三英雄 18 独有技能、D3 道具 | 存档新增两字段（需迁移） | 存档兼容测试 + 18 技能图标实采 + 道具上限/广告扩容实机 |

每批落地后跑：`npm test`（现基线 59 套 / 3,103 条）→ `npm run typecheck:cocos`（门 5，基线 0 条）→
`npm run build:cocos` + `npm run smoke:cocos` → 删档冷加载实机。**战斗指纹重标需单独签字**（P6）。

---

## 口径裁定

| 编号 | 事项 | 裁定 | 状态 |
| --- | --- | --- | --- |
| P1 | 局内槽位广告上限 | 局内 2 次、每局开始重置、不设日上限 | ✅ 已定 → A3 |
| P2 | 第 3/6 关的「治疗光环」怎么处置 | **A 降档 + 显性化**：2%/s → 1%/s、回血飘读数、词缀条常驻；`mist` 收出第 2 关并豁免精英 | ✅ 已定 → B5 |
| P3 | 道具第 5、6 格的来源 | 两格都走本局广告（各 1 次、每局重置） | ✅ 已定 → D3 |
| P4 | Boss 战时长 | 正常数值下 **2 分钟内可击杀**即可；超时线取 150 s 留 30 s 容错 | ✅ 已定 → C2 |
| P5 | S1 独有技能范围 | 3 个英雄（荆棘 / 寒霜 / 余烬）× 6 = 18 个 | ✅ 已定 → D2 |
| P6 | 战斗指纹基线移动 | A、B 两批各重标一次，留新旧摘要对照 | ✅ 已同意 |

### P2 详解：「治疗光环」（代码里叫 `heal_aura`）是什么

一条**关卡环境词缀**：挂着它的那一关，**所有敌人每秒回复自身最大生命的 2%**（定义在 `S/game/data/envAffixes.ts:28`，
生效在 `battleWorld.ts:767-769`）。它出现在**第 3 关「沼泽深处」**与**第 6 关「深渊之喉」**，
是 F3「打不死的怪」的直接成因——你的输出低于每秒 2% 时，血量会不降反升；
第 6 关还同时叠了「迷雾」（周期性打不中）和吞噬者（吃到伤害回 50%），三者同关 → 事实无限。

三条候选处置：

| 选项 | 做法 | 代价 |
| --- | --- | --- |
| **A 降档 + 显性化** ✅ 已选 | 2%/s → **1%/s**，回血时飘绿色读数 + 顶部词缀条常驻；第 6 关的「迷雾」不再作用于精英与 Boss | 保住了"要用持续输出破墙"的玩法张力，改动最小；但回血怪仍然存在，体感改善靠可视化 |
| **B 从关卡池退役** | 第 3/6 关改挂新词缀「铁壁」（正面减伤 + 高护甲，即 F3 你要的方向），`heal_aura` 只留给赛季 `envBias` 做稀有变体 | 最贴合你的原意，两关的玩法主题要重写（第 3 关现有 desc「怪物会持续回血」作废） |
| **C 只拆叠加** | 词缀数值不动，禁止 `heal_aura` 与「迷雾」/吞噬者同关出现 | 最省，但单看第 3 关"打不死"的手感仍在 |

**裁定：A**。选它的代价是回血怪仍然存在，体感改善主要依赖"看得懂为什么打不死"——
因此**回血飘字与词缀条常驻是这条方案的必做项，不是可选装饰**；只做降档不做显性化，等于把同一个困惑留在原地。
B 会连带重写两关的玩法说明与怪表，C 则完全不解决第 3 关的手感。

---

## 需求对账

| 编号 | 需求要点 | 落点 |
| --- | --- | --- |
| F1 | 初始技能太强、缺变强过程；击退太强范围太大 | B1 开局降档 + `SPREAD_GROWTH` 把满弹幕还给后期；B3 击退冲量化 + 力度重标 + 抗性表 |
| F2 | 没有生存压力 | B3（怪不再被无限推开）+ B4（回血口收窄、接触频率 +33%）+ B2/C2（本体与压力同向成长） |
| F3 | 打不死的怪改高防御/正面防御 | B5：新增 `armor` 与 `bulwark`，**第 2 关**转为正面减伤教学关；第 3/6 关治疗光环 `2%→1%/s` 并显性化（飘字 + 词缀条常驻），`mist` 收出第 2 关且豁免精英与 Boss |
| F4 | 技能等级概念不明确，英雄界面加入口或直接升 | D1：gearup 键修正 + 英雄界面 4 条技能各带升级钮 + 术语统一 |
| F5 | 场内金币太多，没有压力和抉择 | A1 强化深出口 + A2 金币换重随 + A3 槽位移出金币通道 + A4 产出/价格重标；D3 道具为第二出口 |
| F6 | 槽位改广告解锁 | A3：本局第 7、8 槽各看 1 次广告，走唯一 `watchAd` 闸门 |
| F7 | Boss 战要打满时长、免疫控制、技能有压制力、模式固定、逐 Boss 差异化 | C1 免疫表 + C2 时长闸（Boss 章超时线 150 s、正常数值 TTK ≤ 120 s + 阶段锁 + 血量重标）+ C3 模式机与敌方弹幕 + C4 双 Boss |
| F8 | 套装不明确；每英雄 6 独有 + 6 常规 | D2：套装＝该英雄 6 独有技能，常规 6 个全员标配；S1 先做 3 英雄 18 技能 |
| F9 | 触发器升级体感差；可选保留/重随，重随概率出隐藏，按技能适配 | A2：数值差预览 + 锁定保留 + 单卡重随 + `SKILL_AFFINITY` 加权 + 隐藏词条池（6% / 12 保底） |
| F10 | 商店加道具，身上 ≤4，广告 +1、上限扩 2，效果为概率重置/暴击/冷却/范围/弹速等 | D3：`RELIC_DEFS` 8 件被动道具 + 上限 4/5/6 三档 + 商店第 4 类商品 |
