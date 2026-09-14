/**
 * 章型差异化(策划案 V3 §3.1):普通 / 精英 / 宝箱 / Boss 四型。
 *
 * 铁律:章型倍率只作用于"本章局部",绝不折入全局曲线
 * (waveHpMult / waves.ts 生成间隔 base)——那是数值墙标定基线。
 * 因此本模块只提供"本章乘数",由 Game 在生成密度与开局 burst 上应用。
 */

import type { EnemyKind } from "../entities/enemy";

export type ChapterType = "normal" | "elite" | "treasure" | "boss";

export interface ChapterTypeInfo {
  type: ChapterType;
  /** 本章生成密度倍率(乘在本关 spawnScale 上,仅本章;<1 更稀疏) */
  spawnScaleMult: number;
  /** 开局 burst 倍率(乘在 6+floor(章/3) 上) */
  burstMult: number;
  /** 金怪混入比例(0-1,仅宝箱章;生成时按此概率替换为金怪) */
  goldMix: number;
  /** 强制敌情主力敌种(精英章 = elite;null = 沿用章节轮转敌情) */
  intelPrefer: EnemyKind | null;
  /** 强制敌情的生成倾向(仅配 intelPrefer;轮转敌情沿用 0.45) */
  intelBias: number;
}

/** 精英章位置(数值台阶章:密集 + 强制精英敌情;可配 balance.json → chapterTypes.eliteChapters) */
export let ELITE_CHAPTERS: number[] = [5, 10, 15];
/** 宝箱章位置(低密度 + 金怪,鼓励集火攒金币;可配 chapterTypes.treasureChapters) */
export let TREASURE_CHAPTERS: number[] = [7, 14];

/* ---------- 章型局部参数(可配 balance.json → chapterTypes) ---------- */
export let ELITE_SPAWN_SCALE = 1.3;
export let ELITE_BURST = 1.5;
export let ELITE_INTEL_BIAS = 0.3;
/**
 * 精英章「精英入场延迟」(秒):章首这几秒的开局 burst 与刷怪不强制精英敌情(只有密度 ×1.3),之后精英按 ELITE_INTEL_BIAS 入场。
 * 取 6:R12 对照(7 英雄 × 3 种子,章首清场口径)延迟 0 / 3 / 6 与偏向 0.15 的深度总和 368 / 343 / 387 / 385,穆 30 → 46 章,
 * 其余英雄在噪声内;6s 比降偏向更好在保住精英章的精英占比 —— 章首只有密度,第 6 秒起「精英入场」。
 * 0 = 旧口径(章首 14 只 burst 里就有 ~30% 精英,站桩 / 召唤英雄 10s 内被贴身打穿;CONTEXT 56 / 59)。可配 balance.json → chapterTypes.eliteIntelDelay
 */
export let ELITE_INTEL_DELAY_SEC = 6;
export let TREASURE_SPAWN_SCALE = 0.5;
export let TREASURE_GOLD_MIX = 0.25;
export let DEFAULT_INTEL_BIAS = 0.45;

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const chapterArr = (v: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(v) || !v.length) return [...fallback];
  const arr = v.map((x) => num(x, 1, 500, 0)).filter((x) => x > 0);
  return arr.length ? Array.from(new Set(arr)).sort((a, b) => a - b) : [...fallback];
};

/** 应用配置表覆盖(balance.json → chapterTypes 段);非法字段回退默认 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const c = cfg ?? {};
  ELITE_CHAPTERS = chapterArr(c.eliteChapters, [5, 10, 15]);
  TREASURE_CHAPTERS = chapterArr(c.treasureChapters, [7, 14]);
  ELITE_SPAWN_SCALE = num(c.eliteSpawnScale, 0.1, 10, 1.3);
  ELITE_BURST = num(c.eliteBurst, 0.1, 10, 1.5);
  ELITE_INTEL_BIAS = num(c.eliteIntelBias, 0, 1, 0.3);
  ELITE_INTEL_DELAY_SEC = num(c.eliteIntelDelay, 0, 30, 6);
  TREASURE_SPAWN_SCALE = num(c.treasureSpawnScale, 0.1, 10, 0.5);
  TREASURE_GOLD_MIX = num(c.treasureGoldMix, 0, 1, 0.25);
  DEFAULT_INTEL_BIAS = num(c.defaultIntelBias, 0, 1, 0.45);
}

/** 本章章型(确定性:同一章永远同一型) */
export function chapterTypeOf(chapter: number, bossChapter?: number): ChapterType {
  if (bossChapter !== undefined && chapter === bossChapter) return "boss";
  if (ELITE_CHAPTERS.includes(chapter)) return "elite";
  if (TREASURE_CHAPTERS.includes(chapter)) return "treasure";
  return "normal";
}

/** 本章章型的局部参数(只在本章生效) */
export function chapterTypeInfo(chapter: number, bossChapter?: number): ChapterTypeInfo {
  const type = chapterTypeOf(chapter, bossChapter);
  switch (type) {
    case "elite":
      // 数值台阶章(标定自 balance-sim:台阶要"有感"而非"处决")
      return { type, spawnScaleMult: ELITE_SPAWN_SCALE, burstMult: ELITE_BURST, goldMix: 0, intelPrefer: "elite", intelBias: ELITE_INTEL_BIAS };
    case "treasure":
      // 宝箱章:稀疏 + 金怪,给商店攒钱窗口
      return { type, spawnScaleMult: TREASURE_SPAWN_SCALE, burstMult: 1, goldMix: TREASURE_GOLD_MIX, intelPrefer: null, intelBias: DEFAULT_INTEL_BIAS };
    default:
      return { type, spawnScaleMult: 1, burstMult: 1, goldMix: 0, intelPrefer: null, intelBias: DEFAULT_INTEL_BIAS };
  }
}

/** 章型展示名(用于 HUD/商店标签) */
export function chapterTypeLabel(type: ChapterType): string {
  return type === "elite" ? "精英章" : type === "treasure" ? "宝箱章" : type === "boss" ? "Boss 章" : "";
}
