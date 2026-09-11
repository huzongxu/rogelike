/**
 * 转生与天赋屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawPrestige`
 * 的文案侧(4224-4353)与 `onPrestigeClick`(4355-4385)、`buyTalent`(1830-1838)的分支侧抽取。
 *
 * 分工与前五屏同构:几何一律问共享层 `game/ui/prestigeLayout.ts`,本文件只产
 * "每处写什么文本、哪一枚钮算选中、这一下该往存档写什么",外加命中判定与**写入意图**。
 * 颜色档不在这里 —— 与已落地五屏同一处置,取表(`core/ViewTable.ts` 的 `phase4` 段,键前缀 `pt`)。
 *
 * 三条纪律:
 *  ① 数值与判据一律走既有函数:可支配点数走 `core/SaveModel.ts:availablePoints`
 *     (Web 同名函数的 Cocos 侧对应物)、节点查表走 `talentOf`、路线走 `routeOf` /
 *     `BUILDER_ROUTE` 等三张表、层级门走 `isTierUnlocked`、路线总价走 `routeCost`、
 *     图鉴四个分母走 `TRIGGERS` / `EFFECTS` / `MODIFIERS` / `ENEMY_DEFS` + `SEASON_MONSTERS`。
 *     本文件不复制任何一条判据、不重写定价与解锁规则;
 *  ② **本文件不写存档**:`prestigeClaim()` 只返回一份增量描述,真正落字段、`persist()` 与
 *     `world.applyTalentBonuses()` 全在宿主 `GameShell`;
 *  ③ **本页签态与开局配置都是宿主持有的瞬时态,不入档**(逐字对标 Web:`talentRoute` 与
 *     `runConfig` 都是 `Game` 的 private 字段,`SaveData` 里没有这两项,`persistSave` 也就永远
 *     读不到它们)。于是这两类动作的写入意图 `persists: false`,宿主落的是内存字段、不盘。
 *
 * 四条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **本屏没有返回路径**:`onPrestigeClick` 里不存在 backBtn,键盘分支只认 `r`
 *     (`src/game.ts:782-783`)。屏内唯一的离开出口就是"开始新轮回",而它做的是**重开一局**,
 *     不是回主菜单 —— 从主菜单的「天赋」入口(`src/game.ts:3440`)进本屏后同样回不去。
 *     本层照抄这条,不加返回钮。
 *  2. **「开始新轮回」不结算死亡**:Web 的 `startNewRun()` 只是 `restart()`,而 `restart()`
 *     第一行 `settlePendingRun()` 有 `if (!this.pendingSettle) return;` 守在前头
 *     (`src/game.ts:1186`)。从结算屏进本屏时(613-617)已经先结算过、`pendingSettle` 已置假,
 *     从战斗中按 `t` 进本屏时它本来就是假 —— 两条进屏路径下点这个钮都**不会**使
 *     `save.prestiges + 1`。`prestiges` 计的是死亡结算次数(`settleRun` 那一处 +1),
 *     不是点按钮次数。本层因此不给"开始新轮回"任何写入意图。
 *  3. **`affordable` 是三个条件的合取**:`!owned && avail >= n.cost &&
 *     isTierUnlocked(ownedTalents, n.tier, currentRoute)` —— 与 Web 4271 逐字同式,
 *     缺一不可。它只决定右列那一串取哪个色档,**不参与命中**:已拥有与买不起的行照样返回
 *     `buy` 动作,静默发生在 `prestigeClaim` 的守卫里(与 Web `buyTalent` 开头三道 `return` 同分层)。
 *  4. **`routeOf(id)` 与 `currentRoute` 在买入守卫里不是同一个实参**:Web `buyTalent` 查的是
 *     `isTierUnlocked(ownedTalents, node.tier, routeOf(id))`(该 id **自己所属**的路线),
 *     而绘制侧的 `affordable` 查的是**当前页签**那一系。两者只在"当前页签就是该行所属系"时同值,
 *     而本屏的行恒取自当前系,所以两端在正常路径下重合 —— 守卫仍照 Web 用 `routeOf(id)`,不改成当前系。
 *
 * 一条与本屏有关、但落在 Cocos 侧别处的事实:
 *  - `runConfig.blueprintEffect` 由**下一次开局**消费:Web 走 `makeStarter()`(`src/game.ts:5336`),
 *    Cocos 走 `GameShell.buildBattle()` 注入 `BattleSim` 的 `starterEffect` 通道
 *    (`battle/BattleSim.ts` 的 `makeStarterEquipment`)。两端都在开局时现取、整局会话内不清零,
 *    未选时都回落 `"knife"`;本层只管开关本身(瞬时态,不入档)。
 *  - `runConfig.targetTrigger` 在 **Web 侧本身就没有消费方**:全仓只有 371(声明)、4311(绘制选中态)
 *    与 4372(点击写入)三处,「首次升级必定出现的触发器」这条玩法未实装。本层同样只管开关本身。
 */

import {
  EFFECTS,
  HIDDEN_MODIFIER_TYPES,
  HIDDEN_TRIGGER_TYPES,
  NORMAL_MODIFIER_DEFS,
  NORMAL_TRIGGER_DEFS,
  effectDef,
  modifierDef,
  triggerDef,
  type EffectType,
  type TriggerType,
} from "../game/data/affixes";
import { ENEMY_DEFS } from "../game/data/enemies";
import { SEASON_MONSTERS } from "../game/data/seasonMonsters";
import { BUILDER_ROUTE, CONQUEROR_ROUTE, EFFICIENT_ROUTE, isTierUnlocked, routeCost, routeOf, talentOf, type TalentId, type TalentNode } from "../game/data/talents";
import { availablePoints } from "../core/SaveModel";
import { PT_TAB_DEFS, type PrestigeLayout, type PtRect, type PtRouteKey } from "../game/ui/prestigeLayout";

/** 本屏要读的存档字段(SaveModel 结构上天然兼容);页签态与开局配置都是宿主瞬时态,不在这里 */
export interface PrestigeSaveView {
  points: number;
  ownedTalents: readonly TalentId[];
  collection: { triggers: string[]; effects: string[]; modifiers: string[]; enemies: string[] };
}

/** 开局配置:与 Web 的 `private runConfig` 同形,`undefined` = 未选 */
export interface PrestigeRunConfig {
  targetTrigger?: TriggerType;
  blueprintEffect?: EffectType;
}

/** 一行天赋的文案与三档态 */
export interface PrestigeRowContent {
  /** 行键(= `layout.rows[i].id`) */
  id: TalentId;
  name: string;
  desc: string;
  /** `${cost}点 · Lv.${tier}` —— 未拥有档的右列文本 */
  costText: string;
  /** 右列那一串取"可负担"色还是"锁死"色(Web 的 #ffd76a / #5a6a80 两档) */
  affordable: boolean;
  /** `已拥有` 档:决定右列走文字 + 勾选标记,而不是价格串 */
  owned: boolean;
}

/** 开局配置块里的一枚钮 */
export interface PrestigeChoiceContent {
  type: TriggerType | EffectType;
  /** `triggerDef(type).name` / `effectDef(type).name` */
  label: string;
  /** 与 Web 的 `runConfig.targetTrigger === b.type` / `blueprintEffect === b.type` 同档 */
  selected: boolean;
}

/** 一屏文案 */
export interface PrestigeContent {
  title: string;
  /** `回响点数 ${points}(已用 ${points − 可支配})` */
  echoText: string;
  /** `可支配 ${avail}` */
  availText: string;
  /** `${routeName}路线(${routeCost(route)}点)· 击败更多敌人获得回响点数` */
  routeText: string;
  /** `图鉴:触发器 a/b · 效果 c/d · 修饰器 e/f · 敌方 g/h`(分母一律取共享层表的长度) */
  collText: string;
  /** 恒三枚:标签与选中档 */
  tabs: { route: PtRouteKey; label: string; selected: boolean }[];
  /** 已拥有行右列的那一串(Web 的「已拥有」;它与勾选标记同档出现) */
  ownedText: string;
  /** 与 `layout.rows` 逐位对齐 */
  rows: PrestigeRowContent[];
  /** 定向搜索块:`false` = 未拥有该天赋,整块不画(layout 侧对应入参为 null) */
  hasTargetedSearch: boolean;
  hasBlueprint: boolean;
  triggerLabel: string;
  effectLabel: string;
  triggerBtns: PrestigeChoiceContent[];
  effectBtns: PrestigeChoiceContent[];
  startText: string;
}

/**
 * 一次点击落到的热区。顺序与 Web onPrestigeClick 逐项一致:
 * 页签 → 逐行买天赋 → 触发器钮 → 效果钮 → 开始新轮回;热区之外没有"其余一律"兜底。
 */
export type PrestigeAction =
  | { kind: "tab"; route: PtRouteKey }
  | { kind: "buy"; id: TalentId }
  | { kind: "trigger"; type: TriggerType }
  | { kind: "effect"; type: EffectType }
  | { kind: "start" };

/** 买下一枚天赋:写 `ownedTalents`,并因此落一次盘 */
export interface PrestigeTalentClaim {
  kind: "talent";
  persists: true;
  id: TalentId;
}

/** 切页签:只改宿主持有的瞬时态 `talentRoute`,**不入档** */
export interface PrestigeTabClaim {
  kind: "tab";
  persists: false;
  route: PtRouteKey;
}

/** 定向搜索开关:同值则取消(`undefined`),否则设为该值 —— 逐字对标 Web 4372 */
export interface PrestigeTriggerClaim {
  kind: "trigger";
  persists: false;
  targetTrigger: TriggerType | undefined;
}

/** 完美蓝图开关:同值则取消 —— 逐字对标 Web 4378 */
export interface PrestigeEffectClaim {
  kind: "effect";
  persists: false;
  blueprintEffect: EffectType | undefined;
}

export type PrestigeClaim = PrestigeTalentClaim | PrestigeTabClaim | PrestigeTriggerClaim | PrestigeEffectClaim;

const inRect = (r: PtRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 页签键 → 该系路线节点表(Web `currentTalentRoute` 的那个三元) */
export function prestigeRouteNodes(route: PtRouteKey): readonly TalentNode[] {
  return route === "efficient" ? EFFICIENT_ROUTE : route === "conqueror" ? CONQUEROR_ROUTE : BUILDER_ROUTE;
}

/** 页签键 → 该系路线的 id 序列(共享层布局的行键) */
export function prestigeRouteIds(route: PtRouteKey): TalentId[] {
  return prestigeRouteNodes(route).map((n) => n.id);
}

/** 页签键 → 头部那一串用的路线名(Web 的 `routeName`) */
export function prestigeRouteName(route: PtRouteKey): string {
  return route === "efficient" ? "效率专家" : route === "conqueror" ? "征服者" : "构筑师";
}

/** 拥有某枚天赋(Web `owns`:就是 `ownedTalents.includes`) */
export function prestigeOwns(owned: readonly TalentId[], id: TalentId): boolean {
  return owned.includes(id);
}

/** 两个条件块在不在(宿主据此向共享层传入参,本层不读存档) */
export function prestigeBlocks(save: PrestigeSaveView): { hasBlueprint: boolean; hasTargetedSearch: boolean } {
  return { hasBlueprint: prestigeOwns(save.ownedTalents, "blueprint"), hasTargetedSearch: prestigeOwns(save.ownedTalents, "targeted_search") };
}

/**
 * 图鉴四个分母:触发器 / 效果 / 修饰器 / 敌方(基线怪 + 赛季变体)。
 * 触发器与修饰器只数**常规池** —— 隐藏词条(`crit`/`elite`/`echo`/`condemned`)只从单卡重随产出,
 * 进图鉴等于把答案先摊给玩家。
 */
export function prestigeCollectionTotals(): { triggers: number; effects: number; modifiers: number; enemies: number } {
  return {
    triggers: NORMAL_TRIGGER_DEFS.length,
    effects: EFFECTS.length,
    modifiers: NORMAL_MODIFIER_DEFS.length,
    enemies: Object.keys(ENEMY_DEFS).length + SEASON_MONSTERS.length,
  };
}

/**
 * 隐藏词条的显示名(从定义表取,不写死中文字面量)。
 * `save.collection` 收的是"见过的一切",重随发现的隐藏词条也会进去;而图鉴分母
 * `prestigeCollectionTotals()` 只数常规池 —— 分子不排除它们就会出现「触发器 7/6」。
 */
const HIDDEN_AFFIX_NAMES: ReadonlySet<string> = new Set([
  ...HIDDEN_TRIGGER_TYPES.map((t) => triggerDef(t).name),
  ...HIDDEN_MODIFIER_TYPES.map((m) => modifierDef(m).name),
]);

/** 图鉴分子:已发现数,排除隐藏词条(与只数常规池的分母同口径) */
function countDiscovered(names: readonly string[]): number {
  return names.filter((n) => !HIDDEN_AFFIX_NAMES.has(n)).length;
}

/** 存档 + 页签态 + 开局配置 + 一帧几何 → 一屏文案(行序与限宽都与 layout 同源) */
export function buildPrestigeContent(save: PrestigeSaveView, route: PtRouteKey, cfg: PrestigeRunConfig, L: PrestigeLayout): PrestigeContent {
  const avail = availablePoints(save);
  const nodes = prestigeRouteNodes(route);
  const col = save.collection;
  const total = prestigeCollectionTotals();
  const ownedSet = save.ownedTalents;
  return {
    title: "转生与天赋",
    echoText: `回响点数 ${save.points}(已用 ${save.points - avail})`,
    availText: `可支配 ${avail}`,
    routeText: `${prestigeRouteName(route)}路线(${routeCost(nodes)}点)· 击败更多敌人获得回响点数`,
    collText: `图鉴:触发器 ${countDiscovered(col.triggers)}/${total.triggers} · 效果 ${countDiscovered(col.effects)}/${total.effects} · 修饰器 ${countDiscovered(col.modifiers)}/${total.modifiers} · 敌方 ${col.enemies.length}/${total.enemies}`,
    tabs: PT_TAB_DEFS.map((t) => ({ route: t.route, label: t.label, selected: route === t.route })),
    ownedText: "已拥有",
    rows: L.rows.map((row) => {
      const n = talentOf(row.id);
      const owned = prestigeOwns(ownedSet, n.id);
      // Web 4271 的三个条件缺一不可;当前页签那一系就是该行所属系,故实参传 nodes
      const affordable = !owned && avail >= n.cost && isTierUnlocked(ownedSet, n.tier, nodes);
      return { id: row.id, name: n.name, desc: n.desc, costText: `${n.cost}点 · Lv.${n.tier}`, affordable, owned };
    }),
    hasTargetedSearch: L.hasTargetedSearch,
    hasBlueprint: L.hasBlueprint,
    triggerLabel: "定向搜索:首次升级必定出现的触发器(再点一次取消)",
    effectLabel: "完美蓝图:开局武器效果(再点一次取消)",
    triggerBtns: L.triggerBtns.map((b) => ({ type: b.type, label: triggerDef(b.type as TriggerType).name, selected: cfg.targetTrigger === b.type })),
    effectBtns: L.effectBtns.map((b) => ({ type: b.type, label: effectDef(b.type as EffectType).name, selected: cfg.blueprintEffect === b.type })),
    startText: "开始新轮回 (R)",
  };
}

/**
 * 命中判定(对标 Web onPrestigeClick 的五段顺序)。
 * 热区依次是 页签 → 逐行买天赋 → 触发器钮 → 效果钮 → 开始新轮回钮;循环走完没有命中就是
 * null —— 点热区之外的空白什么都不发生(Web 没有"其余一律"兜底,也**没有返回钮**)。
 * 已拥有 / 点不起 / 层级未解锁都照样返回动作,静默留给 `prestigeClaim`(命中层不看状态)。
 */
export function hitPrestige(L: PrestigeLayout, x: number, y: number): PrestigeAction | null {
  for (const t of L.tabs) {
    if (inRect(t.rect, x, y)) return { kind: "tab", route: t.route };
  }
  for (const r of L.rows) {
    if (inRect(r.rect, x, y)) return { kind: "buy", id: r.id };
  }
  for (const b of L.triggerBtns) {
    if (inRect(b.rect, x, y)) return { kind: "trigger", type: b.type as TriggerType };
  }
  for (const b of L.effectBtns) {
    if (inRect(b.rect, x, y)) return { kind: "effect", type: b.type as EffectType };
  }
  if (inRect(L.startBtn, x, y)) return { kind: "start" };
  return null;
}

/**
 * 动作 → 写入意图(纯)。买天赋的三道守卫与 Web `buyTalent` 的扣费前 `return` 逐条对应:
 * 已拥有、`availablePoints < cost`、`isTierUnlocked` 不过,一律 null。
 * 形参里没有页签:Web 的守卫查的是 `routeOf(id)` 即该天赋所属那一系(见文件头口径 4),
 * 与当前显示在哪一系无关,所以本函数不需要 `route`。
 * `start` 不产任何写入意图(见文件头口径 2 —— 它只是重开一局,死亡结算不在这里);
 * 页签与两枚开局配置钮产的是**瞬时态**意图(`persists: false`),宿主写内存字段而不落盘。
 */
export function prestigeClaim(save: PrestigeSaveView, cfg: PrestigeRunConfig, a: PrestigeAction): PrestigeClaim | null {
  switch (a.kind) {
    case "start":
      return null;
    case "tab":
      // Web: this.talentRoute = t.route;(瞬时态,不入档)
      return { kind: "tab", persists: false, route: a.route };
    case "trigger":
      // Web: this.runConfig.targetTrigger = 同值 ? undefined : b.type;
      return { kind: "trigger", persists: false, targetTrigger: cfg.targetTrigger === a.type ? undefined : a.type };
    case "effect":
      // Web: this.runConfig.blueprintEffect = 同值 ? undefined : b.type;
      return { kind: "effect", persists: false, blueprintEffect: cfg.blueprintEffect === a.type ? undefined : a.type };
    case "buy": {
      const node = talentOf(a.id);
      // Web buyTalent 的三道守卫:已拥有 / 点数不够 / 层级未解锁(实参是 routeOf(id) 所属系)
      if (prestigeOwns(save.ownedTalents, a.id)) return null;
      if (availablePoints(save) < node.cost) return null;
      if (!isTierUnlocked(save.ownedTalents, node.tier, routeOf(a.id))) return null;
      return { kind: "talent", persists: true, id: a.id };
    }
  }
}
