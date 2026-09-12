/**
 * 词缀融合屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawFusion`
 * 的文案侧(4412-4518)、`drawHiddenChoice`(4519-4555)、`drawTriplePanel`(4566-4613)、
 * `onFusionClick`(4615-4657)与玩法侧 `openFusion`(641)/`onFusionEquipmentTap`(651)/
 * `fusedPair`(675)/`fusedTriple`(682)/`bumpFusionPity`(691)/`doFusion`(700)/
 * `afterFusionRoll`(724)/`pickHiddenAffix`(740)的分支侧抽取。
 *
 * 分工与前七屏同构:几何一律问共享层 `game/ui/fusionLayout.ts`,本文件只产
 * "每处写什么文本、哪一件算选中、这一下该往存档写什么",外加命中判定与**写入意图**。
 * 颜色档不在这里 —— 取表(`core/ViewTable.ts` 的 `phase4` 段,键前缀 `fu`);品质名与品质色
 * 走共享层 `qualityDef`,隐藏词缀的名/描述/色走 `hiddenAffixDef`,本文件不复制任何一张表。
 *
 * 三条纪律:
 *  ① 数值与判据一律走既有函数:成本走 `fusionCost` / `tripleFusionCost`、解锁门走
 *     `tripleUnlocked`、融合执行走 `performFusion` / `performTripleFusion`、继承源走
 *     `inheritSource`、保底周期走 `HIDDEN_PITY_N`、候选抽取走 `rollHiddenCandidates`、
 *     落词缀走 `applyHiddenAffix`。本文件不重写任何一条规则;
 *  ② **本文件不写存档也不写局内装备**:`fusionClaim()` 只返回一份增量描述,扣星尘、写
 *     `fusionPity`、增删局内装备、`recordEquipment` 与 `persist()` 全在宿主 `GameShell`;
 *  ③ **随机源是入参**:保底三选一的候选走 `rollHiddenCandidates(roll)` 的 `roll` 形参
 *     (默认 `Math.random`)。本屏没有任何 `Date.now()` 消费点(无实时读数),时间不进签名。
 *
 * 五条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **必成功 + 自动继承**:这一版没有失败分支,双选/三重都 100% 出成品,部件继承品质
 *     更高一方(同品质取 A;三重按 A/B/C 取先)—— 判据全在共享层 `performFusion` /
 *     `performTripleFusion` / `inheritSource`,本层只转调;
 *  2. **保底触达走三选一暂存**:`bumpFusionPity` 先 +1,到 `HIDDEN_PITY_N` 归零并触达;
 *     触达那一发素材照扣、成品**不直接入场**而是暂存 `pendingHidden`(存档也不落盘),
 *     玩家从 3 个候选里选定后经 `applyHiddenAffix` 落上彩虹品质再入场落档(Web
 *     `afterFusionRoll` 的注释:不会出现"扣了星尘没拿到货"的中间态);
 *  3. **弹层打开时只响应卡片**:Web `onFusionClick` 在 `pendingHidden` 分支里循环完卡片
 *     直接 `return`,返回钮 / 装备行 / 融合钮全部吞掉 —— 三选一必须选定,没有放弃出口;
 *  4. **选中态是会话级瞬时态**:`fusA/fusB/fusC`(每次开屏清空)与 `tripleMode`(开屏
 *     **不**清空,整局会话内保留)都是 `Game` 的 private 字段,`SaveData` 里没有这三项;
 *     `pendingHidden` 同为瞬时态,开屏清空。于是选中与换模式两类意图 `persists: false`;
 *  5. **隐藏词缀装备可以点选但不可作素材**:`onFusionEquipmentTap` 不看 `hiddenAffix`
 *     (点它照样进 A/B/C),`doFusion` 才拦(`mats.some((e) => e.hiddenAffix)` → 静默
 *     no-op);绘制侧行名换成 `【隐藏·名字】` 并标灰"不可作素材"。
 *
 * 四处静默(Web 全程无提示,本层也不加):素材带隐藏词缀时点融合钮 no-op;星尘不足时
 * 点融合钮 no-op(钮文案已换成 `星尘不足(cost)`);三重态素材 find 落空时底部整块不画;
 * 装备 < 2 件时开屏本身被宿主拦掉(Web `openFusion` 首行,屏内则画居中提示)。
 */

import type { Equipment } from "../game/data/equipmentGen";
import type { HiddenAffixType } from "../game/data/affixes";
import {
  applyHiddenAffix,
  fusionCost,
  hiddenAffixDef,
  inheritSource,
  performFusion,
  performTripleFusion,
  rollHiddenCandidates,
  tripleFusionCost,
  tripleUnlocked,
  type TripleMode,
} from "../game/data/fusion";
import { HIDDEN_PITY_N, qualityDef, type Quality } from "../game/data/quality";
import type { FusionLayout, FuRect } from "../game/ui/fusionLayout";

/** 本屏要读的存档字段(`ownedTalents` 只取长度,收窄成计数;装备列表是局内态,另走入参) */
export interface FusionSaveView {
  stardust: number;
  fusionPity: number;
  ownedTalentCount: number;
}

/** 选中的三件装备 id(= Web 的 `fusA/fusB/fusC`,会话级瞬时态,每次开屏清空) */
export interface FusionSelection {
  a: number | null;
  b: number | null;
  c: number | null;
}

/** 选中态的默认值(逐字对标 Web 的三个实例字段初值) */
export const FUSION_DEFAULT_SELECTION: FusionSelection = { a: null, b: null, c: null };

/** 三重模式的默认值(= Web 的 `private tripleMode: TripleMode = "double_trigger"`) */
export const FUSION_DEFAULT_TRIPLE_MODE: TripleMode = "double_trigger";

/** 模式钮的顺序与标签(Web triplePanelRects 的字面量顺序:双触发器 / 双修饰器) */
export const TRIPLE_MODES: readonly TripleMode[] = ["double_trigger", "double_modifier"];
export const TRIPLE_MODE_LABELS: readonly string[] = ["双触发器", "双修饰器"];

/** 保底三选一的暂存(= Web 的 `pendingHidden`;素材已扣、成品未入场、存档未落) */
export interface FusionPendingHidden {
  base: Equipment;
  candidates: HiddenAffixType[];
}

/** 隐藏词缀卡片描述的折行口径(Web drawHiddenChoice 的字面量:每行 10 字、最多 4 行) */
export const FUSION_CARD_DESC_CHARS = 10;

/** 一件装备行的文案与三档态 */
export interface FusionRowContent {
  id: number;
  /** 选中标记("A"/"B"/"C"),null = 未选中 */
  sel: "A" | "B" | "C" | null;
  /** 隐藏词缀装备换成 `【隐藏·名字】`(Web 的行名分支) */
  nameText: string;
  /** `Lv.N 品质名 · 词缀摘要( · 不可作素材)` */
  subText: string;
  /** 品质色(未选中且可用时行名与行描边都走它;动态色,来自 qualityDef 不进表) */
  qualityColor: string;
  /** 品质键(v5 行左徽记 emblem_<quality> 用) */
  quality: Quality;
  /** 带隐藏词缀 → 不可作素材(行名标灰) */
  disabled: boolean;
}

/** 底部操作区的形态(互斥;Web drawFusion 的提前 return 链) */
export type FusionBottomKind = "empty" | "hint" | "pair" | "triple" | "silent";

/** 三选一弹层的一张卡片 */
export interface FusionHiddenCardContent {
  name: string;
  /** 隐藏词缀色(名字与卡片描边共用;动态色,来自 hiddenAffixDef 不进表) */
  color: string;
  /** 描述按 10 字/行切、最多 4 行(与 layout 的 4 条基线逐位对齐) */
  descLines: string[];
}

/** 三选一弹层文案(null = 弹层未打开) */
export interface FusionHiddenContent {
  /** `隐藏词缀保底!` */
  title: string;
  /** `选择 1 / 3(每 N 次融合必出)` —— N 从 HIDDEN_PITY_N 插值 */
  subText: string;
  /** 与 layout.hiddenCards 逐位对齐 */
  cards: FusionHiddenCardContent[];
  /** 每张卡底部的 `点击选择` */
  cardHint: string;
}

/** 一屏文案 */
export interface FusionContent {
  title: string;
  /** `星尘 ${stardust}` */
  stardustText: string;
  backText: string;
  /** 装备 < 2 件时的居中提示(bottomKind === "empty" 时唯一上屏的正文) */
  emptyText: string;
  bottomKind: FusionBottomKind;
  /** 与 layout.rows 逐位对齐(bottomKind === "empty" 时为空) */
  rows: FusionRowContent[];
  /** 未选齐提示(bottomKind === "hint" 时上屏;两档文案由 tripleUnlocked 分派) */
  hintText: string;
  /** 本发成本(pair / triple 两态共用;其余形态为 null) */
  cost: number | null;
  /** 成本与保底读数行(pair / triple 各自一档模板) */
  readoutText: string;
  /** 成品预览行(颜色走 previewColor) */
  previewText: string;
  previewColor: string;
  /** 规则说明行(pair 一档、triple 随模式两档) */
  noteText: string;
  canFuse: boolean;
  /** `融合` / `三重融合` / `星尘不足(cost)` */
  fuseText: string;
  /** 与 layout.bottom.modeBtns 逐位对齐 */
  modes: { mode: TripleMode; label: string; sel: boolean }[];
  hidden: FusionHiddenContent | null;
}

/**
 * 一次点击落到的热区。顺序与 Web onFusionClick 逐项一致:
 * (弹层)卡片 → 返回钮 → 装备行 → (三重态)模式钮 → 融合钮。
 */
export type FusionAction =
  | { kind: "back" }
  | { kind: "tap"; id: number }
  | { kind: "mode"; index: number }
  | { kind: "fuse" }
  | { kind: "pickHidden"; index: number };

/** 改选中三件:只改宿主持有的瞬时态,**不入档** */
export interface FusionSelectClaim {
  kind: "select";
  persists: false;
  sel: FusionSelection;
}

/** 改三重模式:同上(开屏不清空,跨开屏保留) */
export interface FusionModeClaim {
  kind: "mode";
  persists: false;
  mode: TripleMode;
}

/**
 * 执行融合(必成功)。三档账面:
 *  - 星尘扣 `stardustCost`,`fusionPity` 写成 `fusionPityTo`(触达即归零);
 *  - `removeIds` 里的素材从局内装备移除(两档都移);
 *  - 未触达保底:`result` 直接入场并落盘(`persists: true`,选中态清空);
 *    触达保底:`pending` 暂存三选一、**不落盘**(`persists: false`,选中态保留 ——
 *    Web afterFusionRoll 的 hitsPity 分支就是这两件事都不做,等 pickHiddenAffix 收尾)。
 */
export interface FusionRollClaim {
  kind: "fuse";
  persists: boolean;
  stardustCost: number;
  fusionPityTo: number;
  removeIds: number[];
  /** 未触达档的成品(触达档为 null,成品在 pending.base 里等三选一) */
  result: Equipment | null;
  /** 触达档的暂存(未触达档为 null) */
  pending: FusionPendingHidden | null;
  /** Web 只在未触达档清 fusA/B/C */
  clearSelection: boolean;
}

/** 三选一落定:成品带上隐藏词缀入场并落盘(选中态与暂存由宿主一并清空) */
export interface FusionPickClaim {
  kind: "pickHidden";
  persists: true;
  result: Equipment;
}

export type FusionClaim = FusionSelectClaim | FusionModeClaim | FusionRollClaim | FusionPickClaim;

const inRect = (r: FuRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 三重态是否成立(Web drawFusion / doFusion / onFusionClick 三处共用的同一个判据) */
export function fusionTripleArmed(sel: FusionSelection, ownedTalentCount: number): boolean {
  return sel.c !== null && tripleUnlocked(ownedTalentCount);
}

/** 双选素材(Web fusedPair 逐字:按 id 回局内列表 find) */
export function fusedPair(equipment: readonly Equipment[], sel: FusionSelection): [Equipment | undefined, Equipment | undefined] {
  return [equipment.find((e) => e.id === sel.a), equipment.find((e) => e.id === sel.b)];
}

/** 三重素材(Web fusedTriple 逐字) */
export function fusedTriple(equipment: readonly Equipment[], sel: FusionSelection): [Equipment | undefined, Equipment | undefined, Equipment | undefined] {
  return [equipment.find((e) => e.id === sel.a), equipment.find((e) => e.id === sel.b), equipment.find((e) => e.id === sel.c)];
}

/** 保底推进(Web bumpFusionPity 逐字:+1,到 HIDDEN_PITY_N 归零并触达) */
export function bumpFusionPity(pity: number): { pityTo: number; hitsPity: boolean } {
  const next = pity + 1;
  if (next >= HIDDEN_PITY_N) return { pityTo: 0, hitsPity: true };
  return { pityTo: next, hitsPity: false };
}

/**
 * 词缀摘要串(Web drawFusion 行内与预览行的同一个内联模板):
 * `触发器名/…/效果名(·修饰器名/…)`,修饰器为空时不带「·」段。
 */
export function fusionAffixSummary(eq: Equipment): string {
  return `${eq.triggers.map((t) => t.def.name).join("/")}/${eq.effect.def.name}${eq.modifiers.length ? "·" + eq.modifiers.map((m) => m.def.name).join("/") : ""}`;
}

/** 卡片描述的折行(Web drawHiddenChoice 的 `line * 10 < chars.length && line < 4` 逐字) */
export function hiddenCardDescLines(desc: string): string[] {
  const chars = desc.split("");
  const out: string[] = [];
  for (let line = 0; line * FUSION_CARD_DESC_CHARS < chars.length && line < 4; line++) {
    out.push(chars.slice(line * FUSION_CARD_DESC_CHARS, line * FUSION_CARD_DESC_CHARS + FUSION_CARD_DESC_CHARS).join(""));
  }
  return out;
}

/**
 * 点一件装备(Web onFusionEquipmentTap 逐字):已选中 → 取消;否则按 A → B → C 补空位;
 * 三件都占了 → 换成当前点击的那一件(B/C 清空)。**不看 hiddenAffix** —— 隐藏词缀装备
 * 照样能点选,拦在 doFusion 的素材守卫里。
 */
export function fusionTapSelection(sel: FusionSelection, id: number): FusionSelection {
  if (sel.a === id) return { ...sel, a: null };
  if (sel.b === id) return { ...sel, b: null };
  if (sel.c === id) return { ...sel, c: null };
  if (sel.a === null) return { ...sel, a: id };
  if (sel.b === null) return { ...sel, b: id };
  if (sel.c === null) return { ...sel, c: id };
  return { a: id, b: null, c: null };
}

/** 未选齐提示的两档文案(Web drawFusion 的三元链,顺序不能换;第二档的 6 是字面量) */
export function fusionHintText(ownedTalentCount: number): string {
  return tripleUnlocked(ownedTalentCount)
    ? "选择两件(融合)或三件(三重融合·双触发器/双修饰器)"
    : "选择两件装备进行融合(A/B);三重融合需解锁 ≥6 个天赋节点";
}

/** 存档 + 局内装备 + 三份瞬时态 + 一帧几何 → 一屏文案(行序与卡片序都与 layout 同源) */
export function buildFusionContent(
  save: FusionSaveView,
  equipment: readonly Equipment[],
  sel: FusionSelection,
  mode: TripleMode,
  pending: FusionPendingHidden | null,
  L: FusionLayout
): FusionContent {
  const out: FusionContent = {
    title: "装备融合",
    stardustText: `星尘 ${save.stardust}`,
    backText: "返回",
    emptyText: "至少需要 2 件装备才能融合",
    bottomKind: "hint",
    rows: [],
    hintText: fusionHintText(save.ownedTalentCount),
    cost: null,
    readoutText: "",
    previewText: "",
    previewColor: "",
    noteText: "",
    canFuse: false,
    fuseText: "",
    modes: TRIPLE_MODES.map((m, i) => ({ mode: m, label: TRIPLE_MODE_LABELS[i], sel: mode === m })),
    hidden: null,
  };

  if (pending) {
    out.hidden = {
      title: "隐藏词缀保底!",
      subText: `选择 1 / 3(每 ${HIDDEN_PITY_N} 次融合必出)`,
      cards: pending.candidates.map((t) => {
        const hd = hiddenAffixDef(t);
        return { name: hd.name, color: hd.color, descLines: hiddenCardDescLines(hd.desc) };
      }),
      cardHint: "点击选择",
    };
  }

  if (equipment.length < 2) {
    out.bottomKind = "empty";
    return out;
  }

  out.rows = L.rows.map((r) => {
    const eq = equipment.find((e) => e.id === r.id)!;
    const q = qualityDef(eq.quality);
    return {
      id: r.id,
      sel: sel.a === eq.id ? "A" : sel.b === eq.id ? "B" : sel.c === eq.id ? "C" : null,
      nameText: eq.hiddenAffix ? `【隐藏·${eq.name}】` : eq.name,
      subText: `Lv.${eq.level} ${q.name} · ${fusionAffixSummary(eq)}${eq.hiddenAffix ? " · 不可作素材" : ""}`,
      qualityColor: q.color,
      quality: eq.quality,
      disabled: !!eq.hiddenAffix,
    };
  });

  const pityReadout = `隐藏词缀保底 ${save.fusionPity}/${HIDDEN_PITY_N}`;
  if (fusionTripleArmed(sel, save.ownedTalentCount)) {
    const [a, b, c] = fusedTriple(equipment, sel);
    if (!a || !b || !c) {
      out.bottomKind = "silent";
      return out;
    }
    const cost = tripleFusionCost(a, b, c);
    const main = inheritSource(inheritSource(a, b), c);
    const pq = qualityDef(main.quality);
    out.bottomKind = "triple";
    out.cost = cost;
    out.readoutText = `三重融合 · 星尘 ${cost} · ${pityReadout}`;
    out.previewText = `三重预览:三重·${fusionAffixSummary(main)}(${pq.name})`;
    out.previewColor = pq.color;
    out.noteText = mode === "double_trigger" ? "额外保留:其余装备首个触发器" : "额外保留:其余装备首个修饰器";
    out.canFuse = save.stardust >= cost;
    out.fuseText = out.canFuse ? "三重融合" : `星尘不足(${cost})`;
    return out;
  }

  const [a, b] = fusedPair(equipment, sel);
  if (!a || !b) {
    out.bottomKind = "hint";
    return out;
  }
  const cost = fusionCost(a.quality, b.quality);
  const src = inheritSource(a, b);
  const pq = qualityDef(src.quality);
  out.bottomKind = "pair";
  out.cost = cost;
  out.readoutText = `星尘成本 ${cost} · ${pityReadout}`;
  out.previewText = `融合预览:融合·${fusionAffixSummary(src)}(${pq.name})`;
  out.previewColor = pq.color;
  out.noteText = "部件自动继承品质更高一方(同品质取 A);必成功";
  out.canFuse = save.stardust >= cost;
  out.fuseText = out.canFuse ? "融合" : `星尘不足(${cost})`;
  return out;
}

/**
 * 命中判定(对标 Web onFusionClick 的五段顺序)。
 * 弹层打开时**只响应卡片**,循环完直接 null(返回钮 / 装备行 / 融合钮全被吞掉);
 * 三重态在模式钮与融合钮之后收口(与 Web 的 return 同位),双选态只剩融合钮。
 * 星尘不足与素材带隐藏词缀照样返回 `fuse` 动作,静默留给 `fusionClaim`(命中层不看状态)。
 */
export function hitFusion(L: FusionLayout, x: number, y: number): FusionAction | null {
  if (L.forms.hidden) {
    for (const c of L.hiddenCards) {
      if (inRect(c.rect, x, y)) return { kind: "pickHidden", index: c.idx };
    }
    return null;
  }
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  for (const r of L.rows) {
    if (inRect(r.rect, x, y)) return { kind: "tap", id: r.id };
  }
  if (L.forms.triple) {
    for (const m of L.bottom.modeBtns) {
      if (inRect(m.rect, x, y)) return { kind: "mode", index: m.index };
    }
    if (inRect(L.bottom.fuseBtn, x, y)) return { kind: "fuse" };
    return null;
  }
  if (inRect(L.bottom.fuseBtn, x, y)) return { kind: "fuse" };
  return null;
}

/**
 * 动作 → 写入意图(纯)。`roll` 是入参:宿主用默认 `Math.random`,测试传钉死的值。
 *  - `back` 不产写入意图:Web 是 `this.state = overlayFrom`,本屏唯一入口是章间商店的
 *    工具钮(`openFusion("shop")`),那一态恒为 `"shop"`,由宿主 `router.show("shop")` 承担;
 *  - `tap` / `mode` 只改瞬时态,`persists: false`;
 *  - `fuse` 的守卫与 Web `doFusion` 逐条对应:三重态素材不足 3 件或任一素材带隐藏词缀 →
 *    null;双选态 find 落空或任一带隐藏词缀 → null;星尘不足 → null(全程静默无提示)。
 *    过守卫后扣费、`bumpFusionPity`、执行融合,按是否触达保底分成"直接入场落盘"与
 *    "三选一暂存不落盘"两档(Web afterFusionRoll 的 if/else 同构);
 *  - `pickHidden` 照 Web `pickHiddenAffix`:暂存落空 → null;否则 `applyHiddenAffix`
 *    给成品落上彩虹品质与隐藏词缀名,入场并落盘。
 */
export function fusionClaim(
  save: FusionSaveView,
  equipment: readonly Equipment[],
  sel: FusionSelection,
  mode: TripleMode,
  pending: FusionPendingHidden | null,
  a: FusionAction,
  roll: () => number = Math.random
): FusionClaim | null {
  switch (a.kind) {
    case "back":
      return null;
    case "tap":
      return { kind: "select", persists: false, sel: fusionTapSelection(sel, a.id) };
    case "mode": {
      const m = TRIPLE_MODES[a.index];
      if (!m) return null;
      return { kind: "mode", persists: false, mode: m };
    }
    case "pickHidden": {
      if (!pending) return null;
      const cand = pending.candidates[a.index];
      if (!cand) return null;
      return { kind: "pickHidden", persists: true, result: applyHiddenAffix(pending.base, cand) };
    }
    case "fuse": {
      if (fusionTripleArmed(sel, save.ownedTalentCount)) {
        const mats = fusedTriple(equipment, sel).filter((e): e is Equipment => !!e);
        if (mats.length < 3 || mats.some((e) => e.hiddenAffix)) return null;
        const cost = tripleFusionCost(mats[0], mats[1], mats[2]);
        if (save.stardust < cost) return null;
        const { pityTo, hitsPity } = bumpFusionPity(save.fusionPity);
        const outcome = performTripleFusion(mats[0], mats[1], mats[2], mode);
        return fusionRollClaim(outcome.result, cost, pityTo, hitsPity, mats, roll);
      }
      const [a2, b] = fusedPair(equipment, sel);
      if (!a2 || !b || a2.hiddenAffix || b.hiddenAffix) return null;
      const cost = fusionCost(a2.quality, b.quality);
      if (save.stardust < cost) return null;
      const { pityTo, hitsPity } = bumpFusionPity(save.fusionPity);
      const outcome = performFusion(a2, b);
      return fusionRollClaim(outcome.result, cost, pityTo, hitsPity, [a2, b], roll);
    }
  }
}

/** afterFusionRoll 的两档(素材移除两档都做;入场与落盘只在未触达档) */
function fusionRollClaim(result: Equipment, cost: number, pityTo: number, hitsPity: boolean, mats: Equipment[], roll: () => number): FusionRollClaim {
  const removeIds = mats.map((m) => m.id);
  if (hitsPity) {
    return { kind: "fuse", persists: false, stardustCost: cost, fusionPityTo: pityTo, removeIds, result: null, pending: { base: result, candidates: rollHiddenCandidates(roll) }, clearSelection: false };
  }
  return { kind: "fuse", persists: true, stardustCost: cost, fusionPityTo: pityTo, removeIds, result, pending: null, clearSelection: true };
}
