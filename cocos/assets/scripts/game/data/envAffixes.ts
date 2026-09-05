/**
 * 环境词缀 —— 策划案 4.2。
 * 每次进入关卡时,地图自带 1-3 个随机环境词缀,改变战场规则(克制特定 Build 类型)。
 */

import { type Enemy } from "../entities/enemy";
import { randInt } from "../core/math";

export type EnvAffixType =
  | "reflect_field"
  | "heal_aura"
  | "space_warp"
  | "time_dilation"
  | "death_chain"
  | "mist";

export interface EnvAffixDef {
  type: EnvAffixType;
  name: string;
  desc: string;
  color: string;
  /** 策划案 4.2:克制 Build 类型 */
  counters: string;
}

export const ENV_AFFIXES: readonly EnvAffixDef[] = [
  { type: "reflect_field", name: "反伤领域", desc: "敌人受击时反弹 12% 伤害", counters: "高频攻击型", color: "#4fc3f7" },
  { type: "heal_aura", name: "治疗光环", desc: "敌人每秒回复 2% 生命", counters: "持续输出型", color: "#4dffc8" },
  { type: "space_warp", name: "空间扭曲", desc: "投射物轨迹弯曲,难以命中", counters: "精准弹道型", color: "#c06cff" },
  { type: "time_dilation", name: "时间膨胀", desc: "周期脉冲触发间隔翻倍", counters: "高频触发型", color: "#ffd76a" },
  { type: "death_chain", name: "死亡连锁", desc: "敌人死亡时爆炸,波及周围敌人", counters: "单体高伤型(鼓励AOE)", color: "#ff9d2e" },
  { type: "mist", name: "隐匿迷雾", desc: "所有敌人周期性隐身", counters: "依赖最近目标型", color: "#8f9bb3" },
];

export function envAffixDef(type: EnvAffixType): EnvAffixDef {
  return ENV_AFFIXES.find((a) => a.type === type)!;
}

/* ---------- 环境词缀数值参数(与上表 desc 文案同源;改数值须同步文案) ---------- */

/** 反伤领域:敌人受击时反弹的伤害比例(克制高频攻击型;与反射者自带 25% 不叠加) */
export const REFLECT_FIELD_RATE = 0.12;
/** 治疗光环:敌人每秒回复其最大生命的比例(克制持续输出型) */
export const HEAL_AURA_RATE = 0.02;
/** 时间膨胀:周期脉冲触发间隔倍率(文案"翻倍"= ×2,克制高频触发型) */
export const TIME_DILATION_MULT = 2;
/** 隐匿迷雾:全体敌人隐身节奏(秒;与隐匿者同口径 —— 周期 5、前 3 秒可见) */
export const MIST_CYCLE = 5;
export const MIST_VISIBLE = 3;
/** 死亡连锁:死亡爆炸波及半径(px)与击退力度(伤害量另见 deathChainDamage) */
export const DEATH_CHAIN_RADIUS = 90;
export const DEATH_CHAIN_KNOCKBACK = 60;

/** 每局随机 1-3 个环境词缀,不重复;bias = 赛季主题倾向(权重 1 = 平权,>1 提升倾向,DESIGN-SEASON-SETS L1) */
export function rollEnvAffixes(bias?: Partial<Record<EnvAffixType, number>>): EnvAffixType[] {
  const count = randInt(1, 3);
  // 加权候选池:按权重复制条目,抽中后移除该类型的全部副本(不重复语义与平权版一致)
  let pool: EnvAffixType[] = [];
  for (const a of ENV_AFFIXES) {
    const w = Math.max(1, Math.round(bias?.[a.type] ?? 1));
    for (let i = 0; i < w; i++) pool.push(a.type);
  }
  const out: EnvAffixType[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const picked = pool[idx];
    out.push(picked);
    pool = pool.filter((t) => t !== picked);
  }
  return out;
}

/** 死亡连锁:敌人死亡时的爆炸伤害(基于其最大生命,鼓励 AOE 清场) */
export function deathChainDamage(e: Enemy, dmgPct = 0.25): number {
  return Math.max(1, Math.round(e.maxHp * dmgPct));
}
