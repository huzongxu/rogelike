# 回响深渊 · 赛季套组轮换设计(给玩家每个赛季的新鲜感)

> 状态:待评审。代码基线:2026-08-29(611 测试全绿,基线 = CONTEXT.md 条目 39)。
> 前置:赛季壳已落地(DESIGN-V3 S3/S5:14 天翻页、幻影榜、补星补领),但翻页只变 `seasonId` 与幻影榜种子——**赛季与赛季之间玩法内容零差异**,这是本设计要解决的问题。
> 铁律继承:所有新增强度只作用于玩家侧,绝不改怪物曲线、绝不折入全局难度(DESIGN-V3 §0)。

---

## 0. 一句话结论

**常驻三套不动**(身份、存档、肌肉记忆全兼容),新鲜感走三层递进:

1. **L1 赛季主题层**——每赛季一个主题(名称/主色/环境词缀倾向),纯风味,零引擎;
2. **L2 套组赛季词缀**——每赛季三套常驻套组各获得一条确定性的"赛季联动"加成 + 商店卡池倾向微调,全部走现有 `ctx.setBonus` 数值通路,零引擎;
3. **L3 赛季限定套组**——每赛季引入 1 套新套组(含 1-2 个新效果,复用引擎原语),赛季结束后永久保留可选(图鉴价值)但失去赛季加成;第 5 赛季起新套组池轮换复用,不无限堆内容。

P1(L1+L2)零引擎改动、一个迭代可发版;P2(L3)才碰引擎。

---

## 1. 现状与约束(带代码证据)

| # | 事实 | 证据 |
| --- | --- | --- |
| 1 | `SETS` 是写死的静态常量,3 套,不读 `seasonId` | `src/data/sets.ts:28`;grep 全 src 无任何 `seasonId → sets` 关联 |
| 2 | 效果池仅 8 个,且被三套 **1:1 瓜分干净**(荆棘=drain/shield、弹幕=knife/ray、余烬=nova/cloud/chain/skeleton) | `sets.ts:34/45/56` + `setOfEffect`(sets.ts:69,每个效果恰好归属一套) |
| 3 | 套组归属 = 效果派系,装备按效果类型计件 | `isSetPiece`(sets.ts:77) |
| 4 | 套组加成走 `ctx.setBonus` getter 实时结算,引擎 `statsOf` 内折入 | `game.ts:771/848/1862`,`CONTEXT.md` 技术要点 |
| 5 | 引擎 cast 按 `EffectType` 分发,隐藏词缀已有"加 case"先例(4 条) | `equipmentEngine.ts:228-249`(八效果)、`:411-466`(death_barrage 等) |
| 6 | 套组初始武器 `SET_STARTERS: Record<SetId, …>` 按套组定义 | `equipmentGen.ts:368/378` |
| 7 | 商店 60% 偏向刷本套卡(专属卡池) | `game.ts:1054-1055/1108-1109` |
| 8 | 主菜单套组选择器 = **3 个按钮横排**(`L.setBtns`),CONTEXT.md 条目 31 刚修过它与无限关钮的重叠,代价是 `listY 132→152` | `game.ts:3681-3702` |
| 9 | 赛季翻页只做:`seasonId += 1`、`seasonStartAt += 14d`,然后幻影榜换种子 | `game.ts:1598-1600`,`leaderboard.ts:37` |
| 10 | `save.selectedSet` 存 SetId 字符串,老存档必须继续有效 | `game.ts:2227` |
| 11 | 环境词缀已有独立数据模块,可做赛季倾向 | `src/data/envAffixes.ts` |

**约束推导**:

- **A(轮换不可行)**:因为 #2,想"每赛季换不同套组"只能重划派系——玩家的装备突然换了归属套组,2/4 件套进度作废,这是负体验而不是新鲜感。所以**派系划分永久冻结,新鲜感只能来自"加法"**。
- **B(加法需要新效果)**:新增套组必须带新效果(否则归属判定冲突),走 #5 的加 case 先例。
- **C(确定性)**:无后端,一切赛季配置必须是 `seasonId → 纯函数`,同赛季恒同配置(与幻影榜同纪律)。
- **D(UI 几何风险)**:套组选择器每加一个按钮都要过三高度(996/1212/1246)几何验证,不能重蹈条目 31 的重叠。

---

## 2. 三层新鲜感模型

### L1 赛季主题层(theme)

`src/data/seasonSets.ts` 导出纯函数:

```ts
export interface SeasonTheme {
  name: string;        // 如「永冻深渊」
  color: string;       // 主题主色(菜单点缀、结算面板)
  flavor: string;      // 一句 flavor 文案
  envBias?: Partial<Record<EnvAffixType, number>>; // 环境词缀权重微调(±1 档内)
}
export function seasonTheme(seasonId: number): SeasonTheme;
```

- 菜单标题栏副标题、赛季结算面板、幻影榜标题带主题色与主题名(现有 `赛季 S${id}` 文案处,game.ts:3356/3497)。
- 环境词缀生成时按 `envBias` 加权——冰主题赛季毒池更少、减速场更多之类的**风味级**差异,不改数值曲线。
- 主题序列写死在表里前 4-6 个,之后按 `(seasonId-1) % N` 循环。

### L2 套组赛季词缀(mutation)

每赛季给**三套常驻套组各**发一条"赛季联动"加成,选套后叠在 4 件套 bonus 之上:

```ts
export interface SetMutation {
  name: string;   // 如「棘刺过载」
  desc: string;
  /** stat 级补丁:全部是 statsOf 已有字段,±15% 以内 */
  patch: Partial<{ dmgMult: number; intervalMult: number; rangeMult: number;
                    healMult: number; durationMult: number }>;
  /** 该 mutation 对应的修饰器倾向:商店刷本套卡时此修饰器权重上调 */
  modifierBias?: ModifierType;
}
export function setMutation(seasonId: number, setId: SetId): SetMutation;
```

- **实现通路零引擎**:mutation patch 在 `Game` 组装 `ctx.setBonus` 时与现有 bonus2/bonus4 同层折入(套组加成本来就走这条 getter,`statsOf` 无感);`modifierBias` 在 `generateSetEquipment` 选修饰器时加权。
- **确定性**:每套组维护 5 条 mutation 池,`pool[(seasonId - 1) % 5]` 轮换,同赛季恒同一条。
- **UI**:商店套组进度行、主菜单选套提示各加一行「赛季联动:xxx」(文本出口走 `fitOne`,纪律继承)。
- **强度纪律**:所有 patch 数值 ≤15%,与"数值墙不回头"铁律兼容;发版前跑 `balance-sim` 三套场景回归。

### L3 赛季限定套组(featured set)

每赛季一个"赛季套组"进入可选列表:

```ts
export function featuredSet(seasonId: number): SetDef | null; // S1 = null(过渡),S2 起每赛季一套
export function isSeasonBoosted(seasonId: number, setId: SetId): boolean;
  // setId === featuredSet(seasonId)?.id → 该套商店偏向从 60% 提到 70%、且享受本季专属 mutation
```

- **归属规则不破坏**:新套组带 1-2 个**新 EffectType**(引擎加 case,先例 #5),`setOfEffect` 纯追加映射,老八效果归属不变 → 老存档、已养成进度全部有效。
- **赛后归宿**:赛季翻页后该套**永久保留可选**(收藏/图鉴价值,徽章从「赛季限定」变为「S2 限定」),但不再享受当季强化(商店偏向回落 60%、无 mutation)——鼓励玩家每赛季尝鲜新套,同时不惩罚老套玩家。
- **内容节流**:S2/S3/S4 各引入一套(共 3 套新,6 个新效果);S5 起不再新增,改为新套组轮换 + mutation 换血 + 主题轮换。避免内容库存无限膨胀,也给美术量一个上限。
- **UI**:`menuLayout().setBtns` 从 3 个变 3+1,竖排改两行(常驻 3 个一行 + 赛季套组一行通栏,或 4 个按钮自适应收窄——落地时按三高度几何验证二选一);赛季套组按钮带主题色描边 + 「赛季限定」角标(复用 `badge_star_gold` 位置模式)。

---

## 3. 四赛季具体内容方案(S1–S4)

> 所有新效果 `EffectParams` 只新增可选字段(`homing?` 追踪转向率、`expandSpeed?` 环扩张速度),不破坏现有 8 效果;所有新套组走 `ALL_SETS` 追加,`setOfEffect` 纯增量映射。
> 数值基准参照:新手区怪血第 1 章 30-39、初始武器 40 伤一发秒;荆棘圆环基准 = 新星 50 伤/半径 200/双触发,**第 1 章 60s 存活**(balance-sim 已验证)。

### 3.0 赛季总览

| 赛季 | 主题 | 主题色 | envBias | 赛季套组(faction 定位) | 新效果 |
| --- | --- | --- | --- | --- | --- |
| S1 | 回响苏醒 | #7a5cff 回响紫 | 无(过渡赛季不动环境) | 无(L1+L2 先行发版) | — |
| S2 | 永冻深渊 | #5ac8fa 深渊蓝 | 减速/冰系环境词缀 +1 档 | **极北冰脉**(控场·精准单体) | `icelance` `frost_ring` |
| S3 | 熔火回响 | #ff9d2e 熔岩橙 | 灼烧/毒系环境词缀 +1 档 | **熔核教团**(地面区域压制) | `meteor` `magma_trail` |
| S4 | 幽冥潮汐 | #9b6cff 幽冥紫 | 召唤/分裂敌种 +1 档倾向 | **亡影剧团**(召唤·协战) | `spirit_wolves` `haunt_crown` |

三常驻套 mutation 池:每套 5 条,`pool[(seasonId-1) % 5]` 轮换;S1–S4 用 pool[0..3],pool[4] 留 S5(轮换复用期)。全部为 stat 级 patch(±15% 内)+ 商店修饰器倾向 `modifierBias`。

### 3.1 三常驻套赛季词缀(S1–S4 具体数值)

| 赛季 | 荆棘回响 | 弹幕风暴 | 余烬天灾 |
| --- | --- | --- | --- |
| S1 | **棘刺过载** 效果射程 +15%(`rangeMult 1.15`)·bias: explode | **过载装填** 触发间隔 -8%(`intervalMult 0.92`)·bias: haste | **余烬滋养** 效果持续 +15%(`durationMult 1.15`)·bias: duration |
| S2 | **冰鳞棘甲** 生命回复 +15%(`healMult 1.15`)·bias: lifesteal | **贯穿寒潮** 效果伤害 +10%(`dmgMult 1.10`)·bias: pierce | **余烬封霜** 效果射程 +10%(`rangeMult 1.10`)·bias: split |
| S3 | **熔核心搏** 触发间隔 -10%(`intervalMult 0.90`)·bias: haste | **爆裂风暴** 效果伤害 +12%(`dmgMult 1.12`)·bias: explode | **燎原之势** 效果范围 +15%(`rangeMult 1.15`)·bias: duration |
| S4 | **蚀骨之棘** 效果伤害 +12%(`dmgMult 1.12`)·bias: power | **影刃齐射** 触发间隔 -10%(`intervalMult 0.90`)·bias: split | **群影盛宴** 效果持续 +12%(`durationMult 1.12`)·bias: chain |

设计原则:每季给每套的 patch 轴向与其身份互补而不重复(荆棘=回复/生存轴、弹幕=频率/伤害轴、余烬=范围/持续轴),同轴数值每季 ±2-3% 微调,玩家能感知"这季荆棘更快了"但不会破坏数值墙标定。

### 3.2 S2 赛季套组「极北冰脉」(控场·精准单体)

**SetDef**:

```ts
{
  id: "frost", name: "极北冰脉", desc: "冰锥点杀,霜环控场", color: "#5ac8fa",
  effects: ["icelance", "frost_ring"],
  triggers: ["pulse", "kill"],           // 脉冲稳定点杀 + 击杀触发霜环扩散
  modifiers: ["power", "pierce", "haste"],
  bonus2: { name: "锋寒", desc: "效果射程 +12%" },
  bonus4: { name: "极北威压", desc: "冰系效果伤害 +30%,冰锥伤害 +25%" },
  // 冰系伤害加成复用余烬 bonus4 的元素分类通路(equipmentEngine 已有 火/冰/毒/电 归类)
}
```

**新效果 ① `icelance 冰锥`(冰霜/单体·追踪)**:

- 效果定义:`{ type: "icelance", name: "冰锥", category: "冰霜/单体", desc: "追踪冰锥刺穿目标" }`
- 基础参数(effectParams case):`{ damage: 55g, speed: 700, radius: 640, homing: 4 }` —— homing = 转向率(rad/s),复用投射物系统 + 每帧朝最近目标转向;定位是"打高价值目标"的精准弹,与飞刀(就近直射)区分。
- 引擎 cast:投射物加 `homing` 字段,update 时 `steerToward(nearestEnemy, homing·dt)`;命中逻辑与 knife 完全共用。≈40 行。

**新效果 ② `frost_ring 霜环`(冰霜/扩散 AOE)**:

- 效果定义:`{ type: "frost_ring", name: "霜环", category: "冰霜/扩散", desc: "以自身为中心扩散霜环,扫过的敌人受伤并减速" }`
- 基础参数:`{ damage: 25g, radius: 240(最大), expandSpeed: 260(px/s), slow: 0.35, duration: 1 }`
- 引擎 cast:新 Area 类型——半径按 `expandSpeed·dt` 增长,维护已命中集合(每个敌人只吃一次),命中即伤害 + 挂减速(与 ray 同一 slow 通路)。≈60 行。

**初始武器「极北权杖」**(对标荆棘圆环 50/200/双触发的清场强度,必须是 AOE 而非点杀):

```ts
{ id: 9004, level: 1, quality: "common", name: "极北权杖",
  triggers: [makeTrigger("pulse", { interval: 1.8 })],
  effect: makeEffect("frost_ring", { damage: 40, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 }, 1),
  modifiers: [] }
```

**本季专属 mutation**(仅当 selectedSet === "frost" 且当前赛季 = S2):**凛冬已至** —— 效果伤害 +10%(`dmgMult 1.10`)+ 触发间隔 -8%(`intervalMult 0.92`)(赛季套组双 patch,比常驻套稍强,强化"本赛季玩新套"动机)。

### 3.3 S3 赛季套组「熔核教团」(地面区域压制)

**SetDef**:

```ts
{
  id: "magma", name: "熔核教团", desc: "陨星轰炸,熔岩封路", color: "#ff9d2e",
  effects: ["meteor", "magma_trail"],
  triggers: ["pulse", "move"],           // 脉冲陨星 + 移动留火(挂机巡场天然触发)
  modifiers: ["explode", "duration", "power"],
  bonus2: { name: "地火奔涌", desc: "效果持续 +1 秒" },
  bonus4: { name: "烈焰统治", desc: "火系效果伤害 +30%,地面效果范围 +20%" },
}
```

**新效果 ① `meteor 陨星`(火焰/延迟落点 AOE)**:

- 效果定义:`{ type: "meteor", name: "陨星", category: "火焰/落点", desc: "标记敌人密集处,短暂延迟后陨星坠落" }`
- 基础参数:`{ damage: 90g, radius: 140, duration: 1(落点延迟秒) }` + 落点生成灼烧余烬(内置小毒云:`dps 8g, radius 80, duration 3`)
- 引擎 cast:落点 telegraph 复用 Boss 震击预警绘制;延迟到点后按 nova 原语结算 AOE,再 spawn 一个 cloud。≈50 行。

**新效果 ② `magma_trail 熔岩足迹`(火焰/移动持续)**:

- 效果定义:`{ type: "magma_trail", name: "熔岩足迹", category: "火焰/地带", desc: "移动时留下熔岩地带灼烧敌人" }`
- 基础参数:`{ dps: 12g, radius: 60, duration: 3 }` + 内置节流(每移动 80px 落一滩,防止糊满屏)
- 引擎 cast:move 触发器命中时 spawn cloud(小号);零新实体类型。≈25 行。

**初始武器「熔核之心」**(对标基准:60s 内可清第 1 章;落点延迟换更高单发):

```ts
{ id: 9005, level: 1, quality: "common", name: "熔核之心",
  triggers: [makeTrigger("pulse", { interval: 2.2 })],
  effect: makeEffect("meteor", { damage: 55, radius: 140, duration: 0.8 }, 1),
  modifiers: [] }
```

**本季专属 mutation**:**过热地脉** —— 效果持续 +15%(`durationMult 1.15`)(地面流派吃持续收益最直接)。

### 3.4 S4 赛季套组「亡影剧团」(召唤·协战)

**SetDef**:

```ts
{
  id: "phantom", name: "亡影剧团", desc: "灵狼协战,亡者为兵", color: "#9b6cff",
  effects: ["spirit_wolves", "haunt_crown"],
  triggers: ["kill", "pulse"],           // 击杀触发亡影(滚雪球) + 脉冲保底召唤
  modifiers: ["power", "duration", "haste"],
  bonus2: { name: "群影", desc: "召唤物伤害 +20%" },
  bonus4: { name: "亡者行军", desc: "召唤物伤害 +35%,召唤持续 +3 秒" },
  // 召唤物伤害加成走 statsOf 对 skeleton 系召唤物的 dmg 折算通路(与现 skeleton 伤害公式同源)
}
```

**新效果 ① `spirit_wolves 灵狼`(召唤/近战协战)**:

- 效果定义:`{ type: "spirit_wolves", name: "灵狼", category: "召唤/协战", desc: "召唤灵狼群扑咬敌人" }`
- 基础参数:`{ count: 2, damage: 14g, duration: 12 }` —— 复用 skeleton AI(追击/近战),参数化体型与速度(狼比骷髅快 30%);与余烬的"单骷髅挂件"区分 = 群体 + 高频。
- 引擎 cast:skeleton 召唤原语 + count/速度参数化。≈20 行。

**新效果 ② `haunt_crown 亡灵冠冕`(召唤/击杀增殖)**:

- 效果定义:`{ type: "haunt_crown", name: "亡灵冠冕", category: "召唤/增殖", desc: "击杀敌人时概率唤醒亡影为你作战" }`
- 基础参数:`{ chance: 0.25, damage: 10g, duration: 8, count: 1 }` —— kill 触发器语义天然契合;场上亡影上限 4(防滚雪球失控)。
- 引擎 cast:击杀钩子里按概率在尸体位置 spawn skeleton(短持续)。≈30 行。参照隐藏词缀 necromancer(equipmentEngine.ts:447)的成熟先例,注意与其叠加时的上限共享。

**初始武器「影群哨笛」**(召唤流开局节奏最慢,保底输出用双狼 + 高频):

```ts
{ id: 9006, level: 1, quality: "common", name: "影群哨笛",
  triggers: [makeTrigger("pulse", { interval: 2.5 })],
  effect: makeEffect("spirit_wolves", { count: 2, damage: 14, duration: 12 }, 1),
  modifiers: [] }
```

**本季专属 mutation**:**亡影谢幕** —— 召唤物伤害 +25%(与群影/亡者行军同通路叠乘)。

### 3.5 每赛季工程清单与验收标准

| 赛季 | 引擎改动 | 资产(小图) | 验收标准 |
| --- | --- | --- | --- |
| S1 | 零(纯数据 + setBonus 折 patch) | 无 | ① S1 存档行为与当前逐字节一致(回归冻结测试);② balance-sim:三套带各自 mutation,新手 20 章+ 断言不回退 |
| S2 | icelance + frost_ring 两个 cast + 投射物 homing 字段 | `icon_fx_icelance` `icon_fx_frost_ring` `icon_set_frost`(各 96px,≈30KB) | ① 「极北权杖」模拟第 1 章 60s 内存活 HP>50(对标荆棘圆环);② frost 套组 4 件套诚实经济模拟 ≥ 第 10 章;③ mutation 回归同 S1 |
| S3 | meteor + magma_trail 两个 cast(全部复用 cloud/nova 原语) | `icon_fx_meteor` `icon_fx_magma_trail` `icon_set_magma` | 同 S2 口径(「熔核之心」60s 清第 1 章;magma 套 ≥ 第 10 章) |
| S4 | spirit_wolves + haunt_crown 两个 cast(复用召唤原语;与 necromancer 词缀上限共享) | `icon_fx_spirit_wolves` `icon_fx_haunt_crown` `icon_set_phantom` | 同上 + 召唤物上限 4 断言 + 与 necromancer 叠加不超限测试 |

通用验收(每赛季):`seasonSets.test.ts` 确定性断言(同 seasonId 恒同配置)/赛后回落断言(S2 结束后 frost 商店偏向 70%→60%、专属 mutation 失效);主菜单 4 钮套组区三高度(996/1212/1246)0 越界 0 重叠;微信冒烟四件套全绿。

---

## 4. 数据结构与存档兼容

- **零新增存档字段**:`selectedSet` 继续存 SetId 字符串(新套组 id 直接可存);主题/mutation/featured 全由 `seasonId` 纯函数推导,翻页时现有 `seasonId += 1` 一行即触发全部轮换。
- `SETS` 语义调整:保持现有 3 项不动,新增 `ALL_SETS`(含赛季套组库)与 `baseSets()`(恒 3 套)出口;`setDef()` 改查 `ALL_SETS`。`SET_STARTERS` 扩 Record 即可(编译器强制新套组必须给初始武器)。
- 回滚安全:所有新内容挂在 `seasonId >= 2` 分支,S1 存档行为与现在逐字节一致(测试断言)。

---

## 5. 改动面清单

| 文件 | 改动 |
| --- | --- |
| `src/data/seasonSets.ts` | **新增**:主题/mutation/featured 纯函数 + 内容表 |
| `src/data/sets.ts` | `ALL_SETS`/`baseSets()` 出口;setDef 查全库 |
| `src/data/affixes.ts` | 新 EffectType 追加(P2,每赛季 2 个) |
| `src/systems/equipmentEngine.ts` | 新效果 cast case(P2);statsOf 不动(mutation 走 setBonus 层) |
| `src/data/equipmentGen.ts` | `generateSetEquipment` 支持 featured 套组 + modifierBias;`SET_STARTERS` 扩充 |
| `src/game.ts` | ① menuLayout setBtns 3→3+1 + drawMenu 套组区主题色/角标;② ctx.setBonus 折入 mutation patch;③ 赛季结算/幻影榜标题带主题;④ 商店套组行 mutation 文案 |
| `src/data/envAffixes.ts` | 生成时读 `seasonTheme().envBias` 加权 |
| 测试 | 新增 `tests/seasonSets.test.ts`:确定性(同 seasonId 恒同配置)/S1 行为不变(回归冻结)/featured 门控与赛后回落/mutation 折入 setBonus 的引擎断言;balance-sim 加三赛季场景 |

---

## 6. 分期落地

- **P1(零引擎,一个迭代)**:L1 主题 + L2 mutation + seasonSets 测试 + UI 三处文案/着色。发版即让当前赛季翻页时有可见变化。
- **P2(引擎,一个迭代)**:S2 主题全量 + 新效果 ×2 + 赛季套组「极北冰脉」+ 初始武器 + 商店偏向 70% + 平衡模拟标定(balance-sim 新手局/三套组/新套组四场景)+ 主菜单套组区三高度几何验证。
- **P3(节流期)**:S3 赛季套组「熔核教团」;S5 起轮换复用机制验证(跨 3 个模拟赛季跑内容不重复断言)。

---

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| mutation 破坏数值墙标定 | patch 上限 ±15%、只玩家侧;发版前 balance-sim 回归"新手 20 章+"断言 |
| 主菜单套组区几何回归(条目 31 刚修过重叠) | 布局改动必须过 996/1212/1246 三高度 0 越界 0 重叠验证,draw 与 hit-test 同源纪律 |
| 新效果强度失控(参照历史:荆棘初始武器曾 53s 阵亡) | P2 必须走 balance-sim 可清第 1 章的标定流程再实装 |
| 微信包体(现 129 键资产已逼近主包上限) | 新效果图标走 icon_fx 管线各 +1 张 96px 小图(≈10KB),无大图;背景压缩仍是独立待办 |
| 赛季中途玩家已选套组,翻页后 featured 变化导致困惑 | 选套不受翻页强制重置(selectedSet 持久),赛季加成按当前 seasonId 实时判定,菜单提示「本季强化」角标动态显隐 |
