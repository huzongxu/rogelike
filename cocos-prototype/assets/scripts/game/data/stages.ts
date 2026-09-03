/**
 * 主线关卡 —— 需求优化 v2(赛季关卡式 × 场内肉鸽):
 * 每关 20 章 × 每章 60 秒(限时生存 + 有限竞技场);
 * 关底结算:7 关第 20 章全部出 Boss(策划案 V3 §3.1 补偶数关空洞),杀 Boss = 通关;
 * 奇数关(1/3/5/7)= 深渊领主满机制,偶数关(2/4/6)= 弱化变体;
 * 章间商店(金币买卡/三合一升品,玩家手动开始下一章)。
 */

import type { EnvAffixType } from "./envAffixes";
import { FIRST_CLEAR_TICKET_MULT, FIRST_CLEAR_ECHO_MULT } from "./season";

export interface StageRewards {
  tickets: number;
  points: number;
  stardust: number;
}

export interface StageDef {
  id: number;
  name: string;
  desc: string;
  /** 章节数(每章 60 秒) */
  chapters: number;
  /** Boss 出现的章节(第 20 章) */
  bossChapter?: number;
  /** 关卡固定环境词缀(策划案 4.2) */
  envAffixes: EnvAffixType[];
  /** 敌人生成密度缩放(<1 更稀疏;前两关新手友好) */
  spawnScale: number;
  rewards: StageRewards;
}

export const STAGES: readonly StageDef[] = [
  { id: 1, name: "初入尸潮", desc: "第一次直面尸潮", chapters: 20, bossChapter: 20, envAffixes: [], spawnScale: 0.6, rewards: { tickets: 1, points: 10, stardust: 0 } },
  { id: 2, name: "荒野求生", desc: "荒原上的脚步声越来越密", chapters: 20, bossChapter: 20, envAffixes: ["mist"], spawnScale: 0.9, rewards: { tickets: 1, points: 28, stardust: 0 } },
  { id: 3, name: "沼泽深处", desc: "毒雾弥漫,怪物会持续回血", chapters: 20, bossChapter: 20, envAffixes: ["heal_aura"], spawnScale: 1, rewards: { tickets: 2, points: 52, stardust: 5 } },
  { id: 4, name: "裂谷火海", desc: "时间扭曲,反伤弥漫", chapters: 20, bossChapter: 20, envAffixes: ["time_dilation", "reflect_field"], spawnScale: 1, rewards: { tickets: 2, points: 80, stardust: 8 } },
  { id: 5, name: "深渊边缘", desc: "死亡在此连锁引爆", chapters: 20, bossChapter: 20, envAffixes: ["death_chain"], spawnScale: 1.1, rewards: { tickets: 3, points: 112, stardust: 12 } },
  { id: 6, name: "深渊之喉", desc: "扭曲的空间吞噬一切", chapters: 20, bossChapter: 20, envAffixes: ["space_warp", "heal_aura", "mist"], spawnScale: 1.15, rewards: { tickets: 3, points: 147, stardust: 16 } },
  { id: 7, name: "王座之间", desc: "深渊领主在此等候", chapters: 20, bossChapter: 20, envAffixes: ["reflect_field", "time_dilation", "death_chain"], spawnScale: 1.2, rewards: { tickets: 5, points: 185, stardust: 25 } },
];

export function stageOf(id: number): StageDef {
  return STAGES.find((s) => s.id === id)!;
}

/* ---------- 章节与竞技场参数(需求优化 v2;可被 balance.json 的 battle 段覆盖) ---------- */

/** 每章时长(秒) */
export let CHAPTER_SECONDS = 60;
/** 每关章节数 */
export let CHAPTERS_PER_STAGE = 20;

/** 章内竞技场 = 一屏(需求反馈:行动范围缩小到一屏,全屏可见无需移镜头) */
export const CHAPTER_ARENA = { w: 480, h: 854 };

/** 回响点跨天保留比例(40% 永久,60% 本日临时,需求优化 v2) */
export let ECHO_RETAIN_RATE = 0.4;

/** 回响拆分:40% 入永久池,60% 入本日池(次日清空) */
export function splitEcho(total: number): { permanent: number; day: number } {
  const permanent = Math.floor(total * ECHO_RETAIN_RATE);
  return { permanent, day: total - permanent };
}

/** 每章怪物数量曲线基数与增长率:第 1 章 30 只,每章 +15%(可配) */
export let MONSTER_COUNT_BASE = 30;
export let MONSTER_COUNT_GROWTH = 1.15;
/** 回响奖励曲线:第 N 关通关回响 = base × N^exp(默认 10 × N^1.5) */
export let ECHO_REWARD_BASE = 10;
export let ECHO_REWARD_EXP = 1.5;
/** 关卡解锁进度门槛:前一关打到 ceil(章节数×进度) 章即解锁下一关(默认 0.5 = 打到第 10/20 章) */
export let STAGE_UNLOCK_PROGRESS = 0.5;
/** 通关奖励成长:奖励 ×(1 + growth × (解锁前最高关-1)),通关越多奖励越好(默认 +15%/关) */
export let CLEAR_REWARD_GROWTH = 0.15;

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** 应用配置表覆盖(balance.json → battle 段);非法字段回退默认 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const b = cfg ?? {};
  CHAPTER_SECONDS = num(b.chapterSeconds, 5, 3600, 60);
  CHAPTERS_PER_STAGE = num(b.chaptersPerStage, 1, 200, 20);
  ECHO_RETAIN_RATE = num(b.echoRetainRate, 0, 1, 0.4);
  MONSTER_COUNT_BASE = num(b.monsterCountBase, 1, 9999, 30);
  MONSTER_COUNT_GROWTH = num(b.monsterCountGrowth, 1, 4, 1.15);
  ECHO_REWARD_BASE = num(b.echoRewardBase, 0, 99999, 10);
  ECHO_REWARD_EXP = num(b.echoRewardExp, 0, 5, 1.5);
  STAGE_UNLOCK_PROGRESS = num(b.stageUnlockProgress, 0.05, 1, 0.5);
  CLEAR_REWARD_GROWTH = num(b.clearRewardGrowth, 0, 2, 0.15);
}

export function chapterMonsterCount(chapter: number): number {
  return Math.round(MONSTER_COUNT_BASE * Math.pow(MONSTER_COUNT_GROWTH, chapter - 1));
}

/** 回响奖励曲线:第 N 关通关回响 = base × N^exp */
export function stageEchoReward(stageId: number): number {
  return Math.round(ECHO_REWARD_BASE * Math.pow(stageId, ECHO_REWARD_EXP));
}

/**
 * 关底结算规则(策划案 V3:7 关全部有 Boss):声明了 bossChapter 的关必须击杀 Boss 才算通关,
 * 超时未杀即判负;未声明 bossChapter 的关(仅理论兼容)撑过最后一章即通关。
 */
export function stageClearedAtFinalChapter(stage: StageDef, bossDead: boolean): boolean {
  return !stage.bossChapter || bossDead;
}

/* ---------- 补领(策划案 V3 §4.4) ---------- */

/** 补领奖励:首通同口径(券 ×2 + 回响 ×1.5),基准 = 玩家当前最高关卡 */
export function makeUpReward(highestStage: number): { stageId: number; tickets: number; echo: number } {
  const stageId = Math.max(1, Math.min(STAGES.length, highestStage));
  const st = stageOf(stageId);
  const base = st.rewards.points > 0 ? st.rewards.points : stageEchoReward(st.id);
  return { stageId, tickets: st.rewards.tickets * FIRST_CLEAR_TICKET_MULT, echo: Math.round(base * FIRST_CLEAR_ECHO_MULT) };
}
