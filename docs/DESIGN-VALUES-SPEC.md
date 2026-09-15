# 策划数值抽离开发准则 · DESIGN-VALUES-SPEC

> 本准则是全项目策划数值的开发规范:**数值与逻辑分离、单一事实源、每个数值带备注**。
> 后续所有新功能、新数值一律按本准则执行;存量代码按"碰到即迁移"原则逐步收敛。
> 参考实现(范本):[`game/data/quality.ts`](../cocos/assets/scripts/game/data/quality.ts) —— 品质策划规范表。
> **路径约定**:文中 `game/data/…` / `game/ui/…` 指共享纯逻辑层 `cocos/assets/scripts/game/…`(数值与几何的唯一事实源),两端经 `@game/*` 别名 import 同一份;`src/data/` 目录已清空,历史写法一律按本约定读。

## 一、总则

策划数值(掉率、价格、成长系数、保底次数、加成比例等)曾经散落在逻辑代码里,
导致"改一个数要翻三个文件、同一数值两处定义悄悄不同步"。本准则规定:

1. **数值只住在数据层规范文件**(`game/data/*.ts`),逻辑代码只读不写;
2. **每类数值有唯一规范表**(单一事实源),其余位置一律从它派生;
3. **每个数值必带备注**,让不看策划案的人也能读懂这个数。

## 二、强制条款

### 条款 1:数值入表,禁止内联

策划数值必须写进对应主题的规范文件,禁止在 `game/systems/`、`game/entities/`、`game/ui/`
等共享层逻辑代码里内联魔法数,也禁止在宿主与屏层(`cocos/assets/scripts/` 的 `GameShell.ts` /
各屏 `*Model.ts` / `*View.ts`)与 Web 基准侧 `src/game.ts` 里内联——两棵树都只读表。

```ts
// ❌ 逻辑代码内联策划数
s.haste = Math.min(0.7, s.haste + 0.06);
cost = base * (1 + (level - 1) * 0.6);

// ✅ 读规范表
import { QUALITY_HASTE_CAP, QUALITY_UPGRADE_COST_GROWTH } from "../data/quality";
s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + qualityDef(q).rateHaste);
cost = base * (1 + (level - 1) * QUALITY_UPGRADE_COST_GROWTH);
```

例外:纯结构性常量(如数组下标、几何布局的 0/1)和只在单处使用、无策划含义的
实现细节(如渲染淡入时长)可以留在原地,但新增前请自问"策划以后会不会想调它"。

### 条款 2:每个数值必带备注

备注必须覆盖四要素,写在数值定义处的注释里:

| 要素 | 说明 | 示例 |
|---|---|---|
| 含义 | 这个数控制什么 | "触发间隔缩减比例" |
| 单位 | 量纲/取值域 | "0-1"、"星尘/次"、"%" |
| 取值依据 | 为什么是这个数 | "保底出货防数值墙" |
| 策划案出处 | 哪份文档定的 | "策划案 5.3 减压改版" |

### 条款 3:单一事实源 + 派生

同一主题的数值集中到**一张主表**(如 `QUALITIES`),各消费轴(上限/价格/加成…)
通过派生函数或派生映射从主表生成,**禁止另写第二份顺序表/等级表/价格表**:

```ts
// 主表唯一
export const QUALITIES: readonly QualityTierSpec[] = [ ... ];
// 各轴派生,永不与主表失同步
export const QUALITY_MAX_LEVEL = tierFieldMap("maxLevel");
```

跨模块消费时,原模块可用 `export { ... } from "./quality"` 转发保持旧导入路径可用,
但**新代码必须直接从规范表导入**。

### 条款 4:两层结构 —— 规范表定默认,配置层做热调

| 层 | 文件 | 职责 | 修改成本 |
|---|---|---|---|
| 规范表(内置默认 + 结构型数值) | `game/data/*.ts` | 唯一事实源;含全部备注 | 改代码 → `npm test` |
| 热调覆盖层(可选) | `public/config/balance.json` | 运行期覆盖部分字段,刷新即生效 | 改 JSON 即可 |

规则:

- 规范表中的值是**内置默认值**;某字段被 `balance.json` 覆盖时,以配置为准,
  但规范表中的默认值与备注仍是该字段的权威定义。
- 可热调字段清单与合法性规则见 [`CONFIG-TABLES.md`](./CONFIG-TABLES.md);
  新增热调字段必须同时在两处登记(规范表默认值 + CONFIG-TABLES 字段表)。
- 微信小游戏端无外置配置,自动使用规范表默认值 —— 所以**规范表必须是可独立运行的完整数值**。

### 条款 5:改数流程

1. 改规范文件中的数值;
2. 同步更新备注(含义变了/依据变了都要写清);
3. 跑 `npm test`(含 `scripts/balance-sim.ts` 平衡模拟),确认曲线未失控;
4. 若该字段在 `balance.json` 有覆盖项,检查覆盖值是否还合理;
5. 若该字段在 `CONFIG-TABLES.md` 有登记,同步"默认"列。

## 三、新增数值检查清单

新增一个策划数值时,逐条自检:

- [ ] 放进了对应主题的规范文件(没有就新建,命名 `game/data/<主题>.ts`,即 `cocos/assets/scripts/game/data/<主题>.ts`)?
- [ ] 备注四要素齐全(含义/单位/取值依据/策划案出处)?
- [ ] 与既有数值同源吗?(能用主表派生就不另立表)
- [ ] 逻辑代码只通过导入的具名常量读取,没有复制字面量?
- [ ] 需要策划免发版热调吗?需要 → 登记到 `balance.json` 覆盖层 + CONFIG-TABLES;不需要 → 只留规范表。
- [ ] 有测试锚定吗?(关键曲线至少有一条单测或平衡模拟覆盖)

## 四、已落地规范表目录

| 规范表 | 主题 | 覆盖数值 |
|---|---|---|
| [`game/data/quality.ts`](../cocos/assets/scripts/game/data/quality.ts) | 品质(范本) | 五档品质主表(部件/上限/价/射速/赠量/收藏)、掉落权重曲线、升品强化经济、赠量折算、融合成本、扭蛋默认概率、关卡头像框映射 |
| [`game/data/daily.ts`](../cocos/assets/scripts/game/data/daily.ts) | 商业化/日常 | 体力、钻石、每日宝箱、每日天赋、收藏基础数值(品质部分默认值读 quality 主表) |
| [`game/data/gacha.ts`](../cocos/assets/scripts/game/data/gacha.ts) | 扭蛋运行态 | 概率/保底运行期状态(默认值读 quality 主表) |
| [`game/data/affixes.ts`](../cocos/assets/scripts/game/data/affixes.ts) | 词缀结构 | 触发器/效果/修饰器定义(品质定义已迁出) |
| [`game/data/enemies.ts`](../cocos/assets/scripts/game/data/enemies.ts) | 敌人/Boss | 基础属性表(14 敌种)、波次血量/移速曲线、出生权重曲线、特化机制常量(隐身/召唤/分裂/反射/前护)、Boss 血量曲线与三阶段阈值、震击/召唤/狂暴参数 |
| [`game/data/seasonMonsters.ts`](../cocos/assets/scripts/game/data/seasonMonsters.ts) | 赛季主题怪 | 120 行变体三维倍率(组内均值 = 1.0)、出场倾向 `SEASON_MONSTER_TENDENCY`(当季 45%/过季 15%/新手区门控)、机制参数表 `SEASON_MONSTER_MECHS`(接触减速/死亡灼烧池/死亡复活)、精英/首领技能参数表 `SEASON_MONSTER_SKILLS`(24 只 × 11 原语:伤害预算/蓄力/间隔/召唤节奏/冲锋/光环乘数) |
| [`game/data/combat.ts`](../cocos/assets/scripts/game/data/combat.ts) | 玩家/战斗结算 | 玩家白值(半径/移速/生命/升级成长/装备槽)、连击窗口与狂暴、精英宝石与金币掉落、复活护盾/清场、随从视野/射程/击退/吸血、宝石磁吸/拾取半径、**承伤反哺池机制常量 `RETALIATION_HEAL`**(半衰期 / 池上限 / 每次命中的释放速率) |
| [`game/data/field.ts`](../cocos/assets/scripts/game/data/field.ts) | 场地实体 | 投射物半径/连锁半径、召唤物默认值、金币掉落散布、障碍物与地形生成规则 |
| [`game/data/envAffixes.ts`](../cocos/assets/scripts/game/data/envAffixes.ts) | 环境词缀 | 词缀定义表 + 数值参数(反伤比例/治疗光环/时间膨胀倍率/迷雾节奏/死亡连锁半径与击退)、每局抽取规则 |
| [`game/data/shop.ts`](../cocos/assets/scripts/game/data/shop.ts) | 商店 | 卡价曲线(已购/章节递增)、刷新价曲线(基础/章节/指数底数)、合成补位费、销毁回收率、援助概率、套组卡池偏向 |
| [`game/data/season.ts`](../cocos/assets/scripts/game/data/season.ts) | 赛季壳 | 赛季天数、星尘兑换率、星数口径(生命达标线/补星价/三星奖励)、每日首通倍率、赛季分算法 |
| [`game/data/sets.ts`](../cocos/assets/scripts/game/data/sets.ts) | 套组(12 套)| 件数激活档位(3/6 件)、`SET_BONUSES` 32 键全部套装联动数值(棘肤回血/冷却、齐射分裂/加速、余烬扩散、锋寒射程、地火持续、群影召唤、六件质变倍率 + 6 新套冰川界碑/白啸霜刃/熔毒瘟薪/炽牙雷殛/镇魂安可/雾缚噬灵)、每套效果清单与发布季 |
| [`game/data/heroes.ts`](../cocos/assets/scripts/game/data/heroes.ts) | 英雄(12 位 = 12 套组的角色包装)| 名号/称号/文案四要素、`setId` 双射映射;**无数值**(伤害/被动/主动一律不落地),`releaseSeason`/`themeIndex`/`accentColor` 全部从 `sets` + `seasonSets` 派生,技能详情 4 行(初始武器/三件套/六件套/赛季联动)运行时读源表拼装 |
| [`game/data/combos.ts`](../cocos/assets/scripts/game/data/combos.ts) | 跨套组合技 | 弹幕风暴(分裂数/伤害比/弹速/触发间隔减成)、深渊裂隙(加时/血池持续与回血比/池上限)、荆棘光环(反伤比/治疗倍率) |
| [`game/data/talents.ts`](../cocos/assets/scripts/game/data/talents.ts) | 天赋树 | 19 项天赋效果数值(经验/离线增效/委托加速/稀有加成/生命/护盾/伤害/冷却/暴击/元素/背水),解锁价备注在定义表 |
| [`game/data/commissions.ts`](../cocos/assets/scripts/game/data/commissions.ts) | 委托挂机 | 收益衰减曲线(2h 全额 → 4h 衰减至 50% → 保底)、领取提醒门槛 |
| [`game/data/equipmentGen.ts`](../cocos/assets/scripts/game/data/equipmentGen.ts) | 装备生成 | 装备等级成长系数(每级 +12%,生成与强化共用同一常量) |
| [`game/data/rhythm.ts`](../cocos/assets/scripts/game/data/rhythm.ts) | 本命节律 | 六节律的发动参数表(周期 / 阈值 / 概率)、节律等级 1–5 的冷却与阈值缩放、受击齐放窗口、12 英雄本命分配与挂机档位 |
| [`game/data/heroSkills.ts`](../cocos/assets/scripts/game/data/heroSkills.ts) | 独有技能 | `HERO_SKILLS` 逐英雄 4 技能(核心 / 分岔 / 进阶)与 5 阶成长、`CORE_RHYTHM_TUNE` 节律调率、`CORE_BASELINE_INTERVAL` 底拍、分岔出现与保底等级(`BRANCH_MIN_LEVEL` / `BRANCH_GUARANTEE_LEVEL` / `BRANCH_TEASE_LEVEL`)、重置分岔保底轮数、兜底三项、**`LOKA_SLAY_DEVOURER` 白啸霜刃对吞噬者特効倍率**(依据 = 逐秒剖面 CONTEXT 66) |
| [`game/data/artifacts.ts`](../cocos/assets/scripts/game/data/artifacts.ts) | 法宝 | 14 主动法宝(内置冷却 / 两条共鸣节律 / 变形补丁)、8+2 被动法宝(全局乘区数值、叠加衰减与上限)、8 枚遗物数值、槽位数、赛季共鸣格与赛季法宝、回响衰减与当季出货偏向 |

> 战斗批表(`enemies` / `seasonMonsters` / `combat` / `field` / `envAffixes`)目前是**纯常量表**:未接 balance.json 热调覆盖层,
> 改动走"改规范表 → npm test"流程;如需策划免发版调参,再按条款 4 登记热调字段。
>
> 商店/赛季两表(`shop` / `season`)与战斗批相同,目前是**纯常量表**,未接 balance.json 热调。
>
> 结构型数据批(`gacha` / `affixes` / `sets` / `combos` / `talents` / `commissions` / `equipmentGen`)已按准则收口:**接口形状不动,数值入表带四要素备注**,
> 全部为**纯常量表**,未接 balance.json 热调。至此数值型与结构型主题均已纳入目录;
> 后续碰到新数值直接登记进对应目录表,见 [`CONFIG-TABLES.md`](./CONFIG-TABLES.md)。
