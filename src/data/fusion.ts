/**
 * 词缀融合系统(基于策划案 5.3 的减压改版)。
 *
 * 基本融合:两件装备合成一件,必成功;触发器/效果/修饰器自动继承品质更高一方(同品质取 A)。
 * 成本按品质组合查表,星尘是唯一门槛(无失败机制)。
 * 隐藏词缀走保底:每 HIDDEN_PITY_N 次融合必出,出货时玩家从 3 个候选中三选一(彩虹品质)。
 * 三重融合:需解锁 ≥6 个天赋节点,部件同样自动继承,可保留双触发器或双修饰器。
 */

import type { Equipment } from "./equipmentGen";
import {
  type HiddenAffixType,
  type TriggerInstance,
  type ModifierInstance,
} from "./affixes";
import {
  qualityRank,
  fusionCost,
  HIDDEN_PITY_N,
  TRIPLE_FUSION_UNLOCK_TALENTS,
  TRIPLE_FUSION_COST_MULT,
} from "./quality";
// 品质组合成本表/隐藏保底周期已抽离至 ./quality 品质规范表;保持从本模块导出(历史导入路径兼容)
export { fusionCost, HIDDEN_PITY_N };

/* ---------- 隐藏词缀(保底三选一) ---------- */

export interface HiddenAffixDef {
  type: HiddenAffixType;
  name: string;
  desc: string;
  color: string;
}

export const HIDDEN_AFFIXES: readonly HiddenAffixDef[] = [
  { type: "death_barrage", name: "死亡弹幕", desc: "击杀时向所有方向发射8把飞刀", color: "#4dffc8" },
  { type: "supernova", name: "超新星", desc: "范围+300%,每次触发后间隔+1秒(可叠加)", color: "#ff9d2e" },
  { type: "necromancer", name: "亡灵契约", desc: "受伤时召唤的骷髅数量翻倍,且骷髅攻击为角色回血", color: "#c06cff" },
  { type: "death_trail", name: "死亡轨迹", desc: "毒云不再消散,永久留在地图上(上限10个)", color: "#4aa3ff" },
];

export function hiddenAffixDef(type: HiddenAffixType): HiddenAffixDef {
  return HIDDEN_AFFIXES.find((h) => h.type === type)!;
}

/** 抽 3 个互不重复的隐藏词缀候选(供三选一) */
export function rollHiddenCandidates(roll: () => number = Math.random): HiddenAffixType[] {
  const pool = [...HIDDEN_AFFIXES.map((h) => h.type)];
  const out: HiddenAffixType[] = [];
  while (out.length < 3 && pool.length > 0) {
    out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  }
  return out;
}

/** 把隐藏词缀落到成品上:彩虹品质 + 隐藏词缀命名 */
export function applyHiddenAffix(eq: Equipment, hidden: HiddenAffixType): Equipment {
  return { ...eq, quality: "hidden", name: hiddenAffixDef(hidden).name, hiddenAffix: hidden };
}

/* ---------- 融合执行(必成功,部件自动继承) ---------- */

export interface FusionOutcome {
  /** 成品(hiddenPending 时未含隐藏词缀,由调用方选定后经 applyHiddenAffix 落上) */
  result: Equipment;
  /** 消耗的星尘 */
  cost: number;
}

/** 部件继承来源:品质更高一方;同品质取 A */
export function inheritSource(a: Equipment, b: Equipment): Equipment {
  return qualityRank(a.quality) >= qualityRank(b.quality) ? a : b;
}

function inheritPair(a: Equipment, b: Equipment): [Equipment, Equipment] {
  return [inheritSource(a, b), inheritSource(a, b)];
}

function fusedLevel(...eqs: readonly Equipment[]): number {
  return Math.max(...eqs.map((e) => e.level));
}

function cloneTriggers(src: Equipment): TriggerInstance[] {
  return src.triggers.map((t) => ({ def: t.def, params: { ...t.params } }));
}

function cloneModifiers(src: Equipment): ModifierInstance[] {
  return src.modifiers.map((m) => ({ def: m.def, params: { ...m.params } }));
}

/**
 * 执行基本融合:必成功。触发器/效果/修饰器自动继承品质更高一方(同品质取 A)。
 * 隐藏词缀不由本函数决定;保底触达时由调用方经 applyHiddenAffix 落上。
 */
export function performFusion(a: Equipment, b: Equipment): FusionOutcome {
  const cost = fusionCost(a.quality, b.quality);
  const src = inheritPair(a, b)[0]; // 触发器/效果/修饰器同源:品质更高一方

  const level = fusedLevel(a, b);
  const result: Equipment = {
    id: a.id, // 保留 A 的 id,避免引擎状态错位
    level,
    quality: qualityRank(a.quality) >= qualityRank(b.quality) ? a.quality : b.quality,
    name: buildFusionName(src),
    triggers: cloneTriggers(src),
    effect: { def: src.effect.def, params: { ...src.effect.params }, level },
    modifiers: cloneModifiers(src),
  };
  return { result, cost };
}

function buildFusionName(effectSrc: Equipment): string {
  const trig = effectSrc.triggers.map((t) => t.def.name).join("/");
  const mod = effectSrc.modifiers.map((m) => m.def.name).join("/");
  return `融合·${trig}/${effectSrc.effect.def.name}${mod ? "·" + mod : ""}`;
}

/* ---------- 三重融合(策划案 5.3:需解锁 ≥6 个天赋节点) ---------- */

/** 三重融合解锁条件:已拥有足够多的天赋节点(阈值见 ./quality) */
export function tripleUnlocked(ownedCount: number): boolean {
  return ownedCount >= TRIPLE_FUSION_UNLOCK_TALENTS;
}

/** 成本 = 三件原材料中最高品质融合成本 × 倍率(见 ./quality) */
export function tripleFusionCost(a: Equipment, b: Equipment, c: Equipment): number {
  const costs = [fusionCost(a.quality, b.quality), fusionCost(b.quality, c.quality), fusionCost(a.quality, c.quality)];
  return Math.max(...costs) * TRIPLE_FUSION_COST_MULT;
}

export type TripleMode = "double_trigger" | "double_modifier";

/**
 * 执行三重融合:必成功。部件主来源自动取品质最高一方(同品质按 A/B/C 顺序取先),
 * 双触发器/双修饰器模式下,第二个部件取其余装备中第一个含该部件的。
 */
export function performTripleFusion(a: Equipment, b: Equipment, c: Equipment, mode: TripleMode): FusionOutcome {
  const srcs = [a, b, c];
  const cost = tripleFusionCost(a, b, c);
  // 主来源:品质最高;同品质按 A/B/C 顺序取先
  const main = [...srcs].sort((x, y) => qualityRank(y.quality) - qualityRank(x.quality))[0];

  const triggers = cloneTriggers(main);
  if (mode === "double_trigger") {
    const other = srcs.find((s) => s !== main && s.triggers.length > 0);
    if (other) triggers.push({ def: other.triggers[0].def, params: { ...other.triggers[0].params } });
  }
  const modifiers = cloneModifiers(main);
  if (mode === "double_modifier") {
    const other = srcs.find((s) => s !== main && s.modifiers.length > 0);
    if (other) modifiers.push({ def: other.modifiers[0].def, params: { ...other.modifiers[0].params } });
  }

  const level = fusedLevel(a, b, c);
  const result: Equipment = {
    id: a.id,
    level,
    quality: main.quality,
    name: buildTripleName(triggers, main, modifiers),
    triggers,
    effect: { def: main.effect.def, params: { ...main.effect.params }, level },
    modifiers,
  };
  return { result, cost };
}

function buildTripleName(
  triggers: readonly TriggerInstance[],
  eSrc: Equipment,
  modifiers: readonly ModifierInstance[]
): string {
  const t = triggers.map((x) => x.def.name).join("/");
  const m = modifiers.map((m) => m.def.name).join("/");
  return `三重·${t}/${eSrc.effect.def.name}${m ? "·" + m : ""}`;
}
