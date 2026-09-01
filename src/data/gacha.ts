/**
 * 扭蛋机 —— 战场外抽卡(参考弹壳特工队):
 * 扭蛋券(主线/无限关/委托产出)→ 抽取装备 → 进永久收藏 → 每局开局带入 1 件。
 * 保底:10 抽必史诗,50 抽必传奇;重复装备转化为星尘。
 */

import { generateEquipment, type Equipment } from "./equipmentGen";
import { pickWeighted } from "../core/math";
import {
  type Quality,
  QUALITY_ORDER,
  GACHA_QUALITY_WEIGHTS,
  GACHA_EPIC_PITY,
  GACHA_LEGENDARY_PITY,
  GACHA_EPIC_PITY_LEGENDARY_CHANCE,
  DUPLICATE_STARDUST_DEFAULT,
} from "./quality";

export let GACHA_COST = 1;
export let GACHA_10_COST = 10;

/* ---------- 概率与保底(默认值出自 ./quality 品质规范表;可配 balance.json → gacha 段) ---------- */
export let RATES: { value: Quality; weight: number }[] = GACHA_QUALITY_WEIGHTS.map((w) => ({ ...w }));
/** 保底阈值:pityEpic 达 epicPity-1 次后必出史诗+;pityLegendary 达 legendaryPity-1 次后必出传奇 */
export let EPIC_PITY = GACHA_EPIC_PITY;
export let LEGENDARY_PITY = GACHA_LEGENDARY_PITY;
/** 史诗保底触发时升格为传奇的概率 */
export let EPIC_PITY_LEGENDARY_CHANCE = GACHA_EPIC_PITY_LEGENDARY_CHANCE;
/** 十连保底(前 9 抽无史诗+ 时第 10 抽强制史诗)保持开启 */
export const GACHA_10_GUARANTEE = true;

/** 重复装备的星尘补偿(按品质;默认值出自 ./quality) */
export let DUPLICATE_STARDUST: Record<Quality, number> = { ...DUPLICATE_STARDUST_DEFAULT };

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

const DEFAULT_RATES = () => GACHA_QUALITY_WEIGHTS.map((w) => ({ ...w }));
const DEFAULT_DUP = DUPLICATE_STARDUST_DEFAULT;

/** 应用配置表覆盖(balance.json → gacha 段);非法字段回退默认 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const g = cfg ?? {};
  GACHA_COST = num(g.cost, 0, 99, 1);
  GACHA_10_COST = num(g.cost10, 0, 990, 10);
  if (Array.isArray(g.rates) && g.rates.length >= 1) {
    const valid = g.rates
      .map((r) => ({ value: String(r?.value ?? ""), weight: num(r?.weight, 0, 100000, -1) }))
      .filter((r) => (QUALITY_ORDER as readonly string[]).includes(r.value) && r.weight >= 0)
      .map((r) => ({ value: r.value as Quality, weight: r.weight }));
    if (valid.length >= 1) RATES = valid;
  } else RATES = DEFAULT_RATES();
  EPIC_PITY = num(g.epicPity, 2, 1000, GACHA_EPIC_PITY);
  LEGENDARY_PITY = num(g.legendaryPity, EPIC_PITY, 5000, GACHA_LEGENDARY_PITY);
  EPIC_PITY_LEGENDARY_CHANCE = num(g.epicPityLegendaryChance, 0, 1, GACHA_EPIC_PITY_LEGENDARY_CHANCE);
  const dup = g.duplicateStardust;
  DUPLICATE_STARDUST = { ...DEFAULT_DUP };
  if (dup && typeof dup === "object") {
    for (const q of QUALITY_ORDER) {
      DUPLICATE_STARDUST[q] = num((dup as Record<string, unknown>)[q], 0, 999999, DEFAULT_DUP[q]);
    }
  }
}

export interface GachaPity {
  /** 距上次史诗(及以上)已抽次数 */
  pityEpic: number;
  /** 距上次传奇已抽次数 */
  pityLegendary: number;
}

/** 保底逻辑:legendaryPity 抽必传奇;epicPity 抽必史诗或更好 */
export function rollGachaQuality(state: GachaPity, roll: () => number = Math.random): Quality {
  if (state.pityLegendary >= LEGENDARY_PITY - 1) return "legendary";
  if (state.pityEpic >= EPIC_PITY - 1) return roll() < EPIC_PITY_LEGENDARY_CHANCE ? "legendary" : "epic";
  return pickWeighted(RATES, roll);
}

export interface GachaResult {
  eq: Equipment;
  /** 是否重复(转化为星尘) */
  duplicate: boolean;
  /** 重复补偿星尘 */
  stardust: number;
}

/** 抽取一件装备并推进保底计数 */
export function drawGacha(
  level: number,
  state: GachaPity,
  owned: readonly Equipment[],
  roll: () => number = Math.random
): GachaResult {
  const q = rollGachaQuality(state, roll);
  const eq = generateEquipment(level, q);
  state.pityEpic = q === "epic" || q === "legendary" ? 0 : state.pityEpic + 1;
  state.pityLegendary = q === "legendary" ? 0 : state.pityLegendary + 1;
  const dup = owned.some((g) => g.name === eq.name && g.quality === q);
  if (dup) return { eq, duplicate: true, stardust: DUPLICATE_STARDUST[q] };
  return { eq, duplicate: false, stardust: 0 };
}

/** 十连:保底 1 件史诗或更好(第 10 抽强制史诗,若前 9 抽无史诗) */
export function drawGacha10(
  level: number,
  state: GachaPity,
  owned: readonly Equipment[],
  roll: () => number = Math.random
): GachaResult[] {
  const results: GachaResult[] = [];
  for (let i = 0; i < 10; i++) {
    // 十连保底:前 9 抽无史诗+ 时,第 10 抽强制史诗(阈值随 EPIC_PITY/LEGENDARY_PITY 配置)
    const isLast = i === 9;
    const lastWasEpic = results.some((r) => r.eq.quality === "epic" || r.eq.quality === "legendary");
    if (isLast && !lastWasEpic) {
      state.pityEpic = EPIC_PITY - 1; // 触发史诗保底
      if (state.pityLegendary < LEGENDARY_PITY - 1) state.pityLegendary = 0; // 保底不消耗传奇保底
    }
    results.push(drawGacha(level, state, owned, roll));
  }
  return results;
}
