# S4 详细设计：跨套组合技 + 竞技场地形

> 依据 DESIGN-V3 §5（P1-D 跨套组合技）、§6（P1-C 地形）、§7 落地拆解（S4 行）。
> 本文为落地前详设：机制 → 现有代码钩子的精确映射、数据结构、数值决策、验证方案。
> 状态：**S4a 已落地验收**（2026-08-28，22 项测试全绿）；**S4b 地形已落地标定**（2026-08-28，248/248 全绿，每章 1–2 个）。
> 前置：风险 #5 Boss 独立血量曲线已先行完成（S2 补丁，任务 #8）。

---

## 1. 现状盘点（代码事实，设计的锚点）

| 事实 | 位置 | 对 S4 的含义 |
| --- | --- | --- |
| `BattleContext.setBonus` 是 **getter 实时结算** | game.ts:716 | `comboActive` 照同一模式做 getter，装备变动（买卡/融合/进化）即时生效 |
| 引擎事件钩子：`onKill(ctx, enemy)`、`onHurt(ctx)` | equipmentEngine.ts:132/151 | 弹幕风暴挂 onKill；荆棘光环需要 **onHurt 增传伤害与攻击者** |
| `onHurt` 现在不传伤害值，两个调用点：接触伤害、Boss 震击 | game.ts:1193/1217 | 签名扩展为 `onHurt(ctx, dmg, attacker?)`，sim 同步（balance-sim.ts:434） |
| 触发器命名陷阱：`hurt` = **受伤反应**（HP 低于阈值），`hit` = **受击触发**（被击中） | affixes.ts:24/26 | 荆棘光环条件"受击触发" = `hit`，不是 `hurt` |
| 修饰器 `chain`（连锁）与效果 `chain`（闪电链）同名不同物 | affixes.ts:8/7 | 弹幕风暴条件"连锁"取**修饰器** `chain`（按中文名精确匹配） |
| 毒云 `Cloud`：dps 伤害 + 0.25s tick 结算 | objects.ts:11 / game.ts:1278 | 回血池复用 `Cloud`，加 `heals` 标志走治疗分支 |
| 敌人移动 = 直线追击 + 贴身切向漂移，纯函数 `updateEnemy` 不知道障碍物 | enemy.ts:154 | 障碍物推挤放在 game.ts 的统一推挤 pass，不动 enemy 纯函数 |
| 竞技场 = 整个逻辑屏（480×854 基准），章节间不换 | game.ts:285 | 障碍物每章在整屏内重新生成 |
| 投射物命中用 `projectileHits`（圆-圆），命中后走连锁/穿透/消亡分支 | game.ts:1234-1269 | 障碍物判定插在同一循环、敌怪判定之前 |
| sim 与游戏逐系统镜像（敌人/投射物/毒云/骷髅各一份循环） | balance-sim.ts:423-532 | sim 扩展 = 镜像插入同样的组合技/障碍逻辑，保持两边一致 |

---

## 2. A 案：跨套组合技（§5）

### 2.1 条件判定（新纯函数层 `src/data/combos.ts`）

```ts
export type ComboId = "barrage_storm" | "abyss_rift" | "thorn_aura";

export interface ComboDef {
  id: ComboId;
  name: string;            // 弹幕风暴 / 深渊裂隙 / 荆棘光环
  desc: string;
  color: string;           // HUD 图标色，复用 theme 现有色
  check(list: readonly Equipment[]): boolean;
}

export function comboStates(list): { id, active }[]   // 一次遍历出三条状态
```

三条条件（"三词缀同时在场"，跨装备、跨套组，各 1 处即算）：

| 组合 | 条件（精确词缀类型） | 备注 |
| --- | --- | --- |
| 弹幕风暴 | 修饰器 `chain` + 修饰器 `split` + 修饰器 `pierce` | 全是修饰器：三件稀有以上卡各带其一即可凑 |
| 深渊裂隙 | 效果 `nova` + 效果 `cloud` + 效果 `drain` | 三个效果分属 ember/thorn 两套 → 天然"跨套" |
| 荆棘光环 | 效果 `shield` + 修饰器 `lifesteal` + 触发器 **`hit`** | ⚠️ `hit`（受击触发）≠ `hurt`（受伤反应），见 §1 |

判定只读 `equipment` 数组，无状态 → 可单测、可在商店/融合界面做"差一件"提示（后续批次，本期不做）。

### 2.2 三个效果与数值决策

| 组合 | 效果 | 数值决策（§5 未定处的补全） |
| --- | --- | --- |
| 弹幕风暴 | 击杀时分裂 2 发子弹 | 伤害 = **击杀来源装备效果基础伤害 × 15%**（`effDamageOf(source, 0.15)`，equipmentEngine.ts:517 已有同款口径）；子弹继承 0 穿透、不继承连锁（防递归链爆）；由子弹造成的击杀**不再触发**弹幕风暴（`proj.splitChild = true` 标记，防无限递归） |
| 深渊裂隙 | 新星落点留 3s 回血池 | 新星以玩家为中心（castNova, equipmentEngine.ts:261），池 = 玩家位置；半径 = 新星半径；治疗 = **新星基础伤害 × 40% 分 3 秒**（0.25s tick，玩家在池内才结算）；场上回血池上限 3 个（超出移除最旧，同 death_trail 的云上限模式） |
| 荆棘光环 | 受击反弹所受伤害 30% | 反弹给**攻击者**（接触怪 / Boss 震击 → Boss；无攻击者 → 最近敌人）；走正常 `damageEnemy` 管线（吃增幅/吸血）；与荆棘套 4 件「反伤回响」乘算叠加——两者同场是设计意图（荆棘流的毕业形态） |

### 2.3 接线点

1. **`ctx.comboActive`**：game.ts:716 ctx 字面量内加 `get comboActive() { return comboStates(game.player.equipment); }`（同 setBonus 模式）。
2. **弹幕风暴**：`EquipmentEngine.onKill(ctx, enemy)` 内、现有触发器结算之后追加：若 `comboActive.barrage_storm` 且非分裂子弹击杀 → 朝击杀点两随机方向 `spawnProjectile`（伤害按 2.2，`source` = 击杀装备）。需要把"本次击杀是否分裂子弹造成"传进来：`onKill` 增可选参数 `opts?: { fromSplit?: boolean }`，game.ts 的 `killEnemy` 调用点透传投射物标记。
3. **深渊裂隙**：`castNova` 末尾追加：若组合激活 → `spawnCloud({ heals: true, dps: damage*0.4/3, duration: 3, radius })`。`Cloud` 增 `heals?: boolean`；game.ts `updateClouds`（1278）与 sim 毒云循环增治疗分支：`heals` 云不伤敌，玩家入圈每 tick `healPlayer(dps*0.25)`。
4. **荆棘光环**：`onHurt(ctx)` → `onHurt(ctx, dmg, attacker?)`。引擎内：若组合激活 → `ctx.damageEnemy(attacker ?? nearest, dmg*0.3, { source: 触发装备??最近卡, ... })`。调用点改 3 处：接触伤害（传 `e`）、`bossSlam`（传 Boss 实体，需从 enemies 里找 `kind === "boss"`）、sim（balance-sim.ts:434，传攻击敌人）。
5. **HUD**：战场顶部货币栏下沿一排 3 个小图标（代码绘制圆形 + 首字），未激活灰描边、激活填色 + 名字首帧闪一下。不新增美术资源（§5 零美术约束）。

### 2.4 强度验证（进 balance-sim）

- 新增 3 个 build：`combo_barrage`（连锁+分裂+穿透各 1 卡 + 输出底座）、`combo_rift`（新星+毒云+汲取 + 受伤触发底座）、`combo_thorn`（护盾+吸血+受击触发 + 荆棘底座，复用 thorn4 改件）。
- 断言（落地口径，见 `tests/combos.test.ts`）：
  - **机制层**：三钩子数值/防递归/池上限用引擎单测锁定（sim 伤害受刷怪封顶，逐 run 对照噪声大，不做逐种子断言）；
  - **上限**：常规压力（3 种子聚合）增幅 ≤ +35%（防数值墙提前崩塌；超了回调 2.2 的常数）；
  - **有感**：弹幕风暴 = 高压（spawnScale 3，8 种子聚合）`totalDamage` 显著高于对照；荆棘光环 = 高压聚合续航（每分钟 HP 之和）不低于对照；深渊裂隙 = 纯续航，机制单测锁定；
  - **基线纯净**：已标定 build（starter/chain/turret/thorn/godly/barrage4/ember4/三套初始）不满足任何组合条件，`combos` 开/关逐帧全等（同 §3.3 接口约定）。

**标定结论（2026-08-28 实测）**：

| 组合 | 常规压力（3 种子聚合） | 高压信号 | 结论 |
| --- | --- | --- | --- |
| 弹幕风暴 | +1.0% | spawnScale 3 × 8 种子：220290 → 237204（**+7.7%**） | 高密度场景分裂子弹产生额外命中，符合预期 |
| 深渊裂隙 | 0.0% | 无（极限压力 scale 5/6 亦无） | 回血池 + 汲取使 HP 恒满，sim 无差分信号；纯续航定位，机制由单测锁定 |
| 荆棘光环 | -2.6%（`totalDamage`） | spawnScale 3 × 3 种子 hpSum：1016 → 1078（**+6.1%**） | 反弹提前清场 → 刷怪封顶下总伤害略降属预期；有感信号在续航 |

- **修正**：原假设"三套 4 件不满足任何组合条件"对 `thorn4` 不成立——荆棘 4 件（受击射线 `hit` + 护盾卡带吸血）天然点亮荆棘光环。判定为**设计意图**（荆棘流毕业形态，与 4 件「反伤回响」乘算叠加），基线纯净清单因此不含 `thorn4`，并在 `tests/combos.test.ts` 中断言该行为。

---

## 3. B 案：竞技场地形（§6）

### 3.1 实体与生成

`objects.ts` 追加（与毒云/骷髅/宝石同款小实体风格）：

```ts
export interface Obstacle {
  id: number;
  kind: "pillar" | "pool";   // 石柱(挡路) / 毒池(DoT)
  pos: Vec2;
  radius: number;            // pillar 40 / pool 90
}
export function rollChapterObstacles(chapter, arena, rng): Obstacle[]
```

- **数量**：每章恒 1 个（R13 真机口径重标 2026-09-15：章首清场后玩家每章回场心，1–2 个时 64 种子均值回落 1.67 章 > 守卫 1，恒 1 个 → 0.86；更早的标定 2–4 → 2–3 → 1–2），第 1 章不生成（新手区净空，保 §3.3 新手台阶标定）；石柱:毒池 ≈ 2:1 随机。标定轨迹见 §3.4。
- **位置**：竞技场边缘内缩 120px 的环带随机；距玩家中心出生点 ≥ 180px；互相间距 ≥ 150px；30 次采样不满足则少放 1 个（不强凑，防出生点被堵）。纯函数 + 可注入 `rng` → 单测 & sim 确定性。
- **Boss 章豁免**：`bossChapter` 所在章不生成（Boss 震击走位已是走位压力，叠加障碍过苛；§3.2 单挑设计不破坏）。
- **生命周期**：`nextChapter`（game.ts:1380）里生成并替换 `this.obstacles`，与"清场换章"同节奏；毒池与石柱同章共存、下章全清。

### 3.2 碰撞与效果（圆-圆，接现有循环）

| 对象 | 石柱 | 毒池 | 实现位置 |
| --- | --- | --- | --- |
| 投射物 | 命中即消亡（`ttl = -1`，连锁/穿透不触发） | 无交互 | `updateProjectiles`（game.ts:1234）敌怪判定前插入障碍判定 |
| 敌人 | 统一推挤 pass：`updateEnemies` 末尾遍历障碍做最小位移推出（复用贴身校正的几何） | 无交互（敌人不受毒池影响，见待确认 #2） | game.ts（不动 enemy.ts 纯函数） |
| 玩家 | 移动后推挤推出（`updatePlayer` clamp 之后） | 每秒 6 点伤害（0.25s tick × 1.5），**不走**受击管线（不触发受击类装备，是地形不是攻击） | `updatePlayer` / 新增 `tickTerrainDamage` |
| 骷髅/宝石 | 不阻挡（控制复杂度，视觉穿过可接受） | — | — |

### 3.3 渲染

代码绘制：石柱 = 灰色圆 + 深色描边 + 顶面高光椭圆；毒池 = 半透明紫绿圆 + 现有粒子贴图冒泡。0 新增图（§6 约束）。

### 3.4 模拟器扩展（§6 风险对冲："先模拟再上线"）

- `SimOptions` 增 `obstacles?: boolean`（默认关，不扰动已标定基线）。
- sim 内镜像 §3.2 全部交互（推挤 / 投射物阻挡 / 毒池 DoT），障碍位置用 `rollChapterObstacles(chapter, arena, rng)` 同款纯函数 → 与游戏逐章一致。
- **独立随机流**：sim 内障碍生成走从 `opts.seed` 派生的独立 LCG，不吃共享 `Math.random`——否则会平移商店抽卡/进化序列，ON/OFF 对比被污染（曾产出 9→21 的假"提升"）。
- 验证断言与标定结论（2026-08-28，落地口径）：
  - **新手局（starter + shopGrowth）→ 24 种子聚合**：均值回落 ≤1 章、失败谷（≤10 波）占比不恶化（实测：均值 13.1→12.4，失败谷 13/24→14/24）。**单种子对比不可测**：商店抽卡吃共享种子流，障碍几何扰动事件时序后抽卡序列整体重排，对照臂自身即在 6/21 两谷间摆荡（噪声地板 ±15 波）——这是本次标定最重要的方法学发现。
  - **风筝局（godly + kite，spawnScale 3）**：存活时间回落 ≤ 30%（3 种子聚合）。
  - **挂机局毒池**：贴墙巡航的转向曲率半径 ≈600 > 竞技场尺寸，池中心内缩 120 → 挂机/风筝 AI 几何上踩不到池，`poolDamage ≈ 0` 是预期而非 bug；池的走位压力只对真实手动玩家生效。模拟侧断言改为：承伤上限不主导（≤1 dps）+ 池非死代码 + DoT 口径（6 dps = 0.25s 跳 × 1.5）。
- 标定轨迹：2–4 个 → 全向弹幕 build 被石柱挡崩（新手局单种子回落超 15 波）→ 2–3 个仍崩（第 3 章抽到 3 石柱即雪崩）→ 1–2 个达标（旧 sim 口径）→ 真机口径（章首清场 + 章型）下 1–2 个回落 1.67 章，恒 1 个达标 0.86（距心 ≥240 只到 1.23，毒池 4 dps 无效）。数量是唯一回调旋钮（§3.4 纪律：不动生成曲线）；石柱双面性确认——既挡玩家弹幕也挡敌怪贴脸，弱局反而可能受益（曾见 9→21），故只比聚合不比单种子。
- 标定不达标 → 回调数量/毒池 dps，**不动**现有生成曲线（§3.3 同款接口纪律）。

---

## 4. 落地拆解

| 子阶段 | 内容 | 主要文件 | 状态 |
| --- | --- | --- | --- |
| S4a 组合技 | combos.ts 纯函数 → 引擎三钩子（onKill 增参 / castNova 回血池 / onHurt 增参）→ Cloud.heals → HUD → tests/combos.test.ts → sim 3 build + 断言 | src/data/combos.ts（新）、equipmentEngine.ts、objects.ts、game.ts、balance-sim.ts、tests | ✅ 已验收（233/233 全绿） |
| S4b 地形 | Obstacle + rollChapterObstacles → nextChapter 接线 → 三处碰撞 → 渲染 → tests/terrain.test.ts（生成/推挤纯函数）→ sim obstacles 参数 + 断言 | objects.ts、game.ts、balance-sim.ts、tests | ✅ 已验收（248/248 全绿，15 项地形测试） |

- 两者文件交叉仅 `objects.ts` 与 `game.ts` update 循环，可并行；合并验收：`npm test` 全绿 + balance-sim 三种子无回归（同 §7 验收口径）。
- 存档零改动（组合技与地形都是局内机制，不落盘）。

## 5. 风险与待确认决策

1. **荆棘光环条件取 `hit`（受击触发）**：按中文名精确匹配判定；若策划意图是 `hurt`（受伤反应），条件与触发节奏完全不同（hurt 有 1.2s CD 与 HP 阈值）。
2. **毒池是否伤敌**：现方案只伤玩家（纯走位压力）；若伤敌则变成可利用的杀怪地形，数值与 AI 含义都变。
3. **弹幕风暴子弹不递归**（分裂子弹的击杀不再分裂）：否则连锁修饰器 + 高密度怪可能指数增殖。
4. **Boss 章无障碍**：是否保留"弱化变体关（偶数关）也豁免"？现方案一并豁免（凡 bossChapter 章）。
5. ~~**Boss 平衡遗留（第三次提醒）**~~ ✅ 已解决：按"先动 Boss 血量曲线，再落地 S4a"的顺序，Boss 独立血量曲线标定已先行完成（任务 #8），S4a 验证不受 Boss 战段失真影响。
6. §8 决策 #2（赛季初期体力 5→4）仍未拍板，与 S4 无关但同属待确认积压。
