/**
 * 广告驱动商业化数值 —— 弹壳特攻队思维 + 数值墙成长:
 * 体力闸门 / 钻石 / 每日宝箱 / 每日天赋 / 收藏基础数值 / 通关装备掉落。
 * 纯数据与纯函数,不依赖 game.ts(便于单测)。
 */

import { COLLECTION_ATK_PCT, COLLECTION_HP_PCT } from "./quality";
import type { Equipment } from "./equipmentGen";
// 收藏图鉴按品质加成表已抽离至 ./quality 品质规范表;保持从本模块导出(历史导入路径兼容)
export { COLLECTION_ATK_PCT, COLLECTION_HP_PCT };

/* ---------- 体力(弹壳式硬体力) ---------- */
/* 本节全部字段可被 public/config/balance.json 的 energy/economy 段覆盖(见 applyBalance) */

export let ENERGY_MAX = 20;
/** 自然恢复:每 6 分钟 1 点(10 小时回满) */
export let ENERGY_REGEN_SECONDS = 360;
/** 看广告补充体力 +5(每次) */
export let ENERGY_AD_GAIN = 5;
/** 每日广告回体力次数上限 */
export let ENERGY_AD_LIMIT = 5;
/** 钻石直接回满的价格 */
export let ENERGY_DIAMOND_COST = 10;
/** 主线第 1-7 关体力消耗(随关卡递增,弹壳式) */
export let STAGE_ENERGY_COST: number[] = [5, 5, 6, 6, 7, 7, 8];
export let ENDLESS_ENERGY_COST = 3;

/* ---------- 钻石/广告(商业化) ---------- */

/** 每次完整看完广告 +1 钻石 */
export let DIAMOND_PER_AD = 1;
/** 每日看广告产钻石上限 */
export let DIAMOND_AD_DAILY = 10;
/** 钻石直购扭蛋券价格(1 券) */
export let DIAMOND_TICKET_COST = 2;
/** 商店广告刷新每日次数上限(每章另有 1 次免费刷新) */
export let SHOP_REFRESH_AD_LIMIT = 5;

/* ---------- 策划配置接入(balance.json → energy/economy 段) ---------- */

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

const DEFAULTS = { ENERGY_MAX, ENERGY_REGEN_SECONDS, ENERGY_AD_GAIN, ENERGY_AD_LIMIT, ENERGY_DIAMOND_COST, STAGE_ENERGY_COST: [...STAGE_ENERGY_COST], ENDLESS_ENERGY_COST, DIAMOND_PER_AD, DIAMOND_AD_DAILY, DIAMOND_TICKET_COST, SHOP_REFRESH_AD_LIMIT };

/** 应用配置表覆盖;非法/越界字段自动回退默认值。传入 undefined = 全部恢复默认 */
export function applyBalance(cfg?: { energy?: Record<string, unknown>; economy?: Record<string, unknown> }): void {
  const e = cfg?.energy ?? {};
  const c = cfg?.economy ?? {};
  ENERGY_MAX = num(e.max, 1, 999, DEFAULTS.ENERGY_MAX);
  ENERGY_REGEN_SECONDS = num(e.regenSeconds, 1, 86400, DEFAULTS.ENERGY_REGEN_SECONDS);
  ENERGY_AD_GAIN = num(e.adGain, 0, 999, DEFAULTS.ENERGY_AD_GAIN);
  ENERGY_AD_LIMIT = num(e.adLimit, 0, 999, DEFAULTS.ENERGY_AD_LIMIT);
  ENERGY_DIAMOND_COST = num(e.diamondRefillCost, 0, 9999, DEFAULTS.ENERGY_DIAMOND_COST);
  ENDLESS_ENERGY_COST = num(e.endlessCost, 0, 99, DEFAULTS.ENDLESS_ENERGY_COST);
  const arr = Array.isArray(e.stageCosts) ? e.stageCosts : [];
  STAGE_ENERGY_COST = arr.length
    ? arr.map((v) => num(v, 0, 99, 5))
    : [...DEFAULTS.STAGE_ENERGY_COST];
  DIAMOND_PER_AD = num(c.diamondPerAd, 0, 99, DEFAULTS.DIAMOND_PER_AD);
  DIAMOND_AD_DAILY = num(c.diamondAdDaily, 0, 999, DEFAULTS.DIAMOND_AD_DAILY);
  DIAMOND_TICKET_COST = num(c.diamondTicketCost, 0, 9999, DEFAULTS.DIAMOND_TICKET_COST);
  SHOP_REFRESH_AD_LIMIT = num(c.shopRefreshAdLimit, 0, 999, DEFAULTS.SHOP_REFRESH_AD_LIMIT);
}

export function stageEnergyCost(stageId: number): number {
  return STAGE_ENERGY_COST[Math.min(stageId - 1, STAGE_ENERGY_COST.length - 1)];
}

/**
 * 按时间戳恢复体力:每 regenSeconds 秒 1 点,上限封顶。
 * 时间戳推进到"已结算的整点",能量已满时不浪费已流逝时间。
 */
export function regenEnergy(energy: number, lastEnergyAt: number, now: number): { energy: number; lastEnergyAt: number } {
  if (energy >= ENERGY_MAX) return { energy, lastEnergyAt: now };
  const elapsed = Math.floor((now - lastEnergyAt) / 1000 / ENERGY_REGEN_SECONDS);
  if (elapsed <= 0) return { energy, lastEnergyAt };
  const gained = Math.min(elapsed, ENERGY_MAX - energy);
  return { energy: energy + gained, lastEnergyAt: lastEnergyAt + gained * ENERGY_REGEN_SECONDS * 1000 };
}

/* ---------- 每日宝箱(3 箱/天,各看广告开启) ---------- */

export interface DailyBoxDef {
  id: string;
  name: string;
  desc: string;
  tickets: number;
  stardust: number;
  diamond: number;
}

export const DAILY_BOXES: readonly DailyBoxDef[] = [
  { id: "wood", name: "木宝箱", desc: "扭蛋券 ×2 + 星尘 ×10", tickets: 2, stardust: 10, diamond: 0 },
  { id: "silver", name: "银宝箱", desc: "星尘 ×40 + 钻石 ×5", tickets: 0, stardust: 40, diamond: 5 },
  { id: "gold", name: "金宝箱", desc: "扭蛋券 ×3 + 钻石 ×10 + 星尘 ×50", tickets: 3, stardust: 50, diamond: 10 },
];

export function dailyBoxOf(id: string): DailyBoxDef {
  return DAILY_BOXES.find((b) => b.id === id)!;
}

/* ---------- 每日天赋(数值墙工具:免费 1 个,看广告解锁其余,当日有效) ---------- */

export interface DailyTalentDef {
  id: string;
  name: string;
  desc: string;
  /** 效果数值:乘算类为增量率(伤害/生命/金币 +value)、cd15 为缩减率(间隔 ×(1-value))、crit10 为暴击率加值、extra_revive 为复活次数加值;desc 文案须与本值同步 */
  value: number;
}

export const DAILY_TALENT_POOL: readonly DailyTalentDef[] = [
  { id: "dmg20", name: "战意", desc: "本日全局伤害 +20%", value: 0.2 },
  { id: "hp30", name: "坚韧", desc: "本日最大生命 +30%", value: 0.3 },
  { id: "gold50", name: "淘金", desc: "本日金币掉落 +50%", value: 0.5 },
  { id: "cd15", name: "疾咒", desc: "本日触发间隔 -15%", value: 0.15 },
  { id: "crit10", name: "幸运", desc: "本日暴击率 +10%", value: 0.1 },
  { id: "extra_revive", name: "不屈", desc: "本日死亡复活次数 +1", value: 1 },
];

/** 每日天赋数量(免费 1 个,其余看广告解锁) */
export const DAILY_TALENT_COUNT = 3;
export const DAILY_TALENT_FREE = 1;

/* ---------- 每日重置(跨天检测,弹壳式每日刷新) ---------- */

export function todayKey(now: number = Date.now()): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 是否跨天需要每日重置(dailyDate 非今日) */
export function needsDailyReset(dailyDate: string, now: number = Date.now()): boolean {
  return dailyDate !== todayKey(now);
}

export function dailyTalentOf(id: string): DailyTalentDef {
  return DAILY_TALENT_POOL.find((t) => t.id === id)!;
}

/** 每日 3 个随机天赋(当天固定,不重复) */
export function rollDailyTalents(count = DAILY_TALENT_COUNT, pool: readonly DailyTalentDef[] = DAILY_TALENT_POOL): string[] {
  const out: string[] = [];
  const bag = [...pool];
  while (out.length < count && bag.length > 0) {
    const idx = Math.floor(Math.random() * bag.length);
    out.push(bag[idx].id);
    bag.splice(idx, 1);
  }
  return out;
}

/* ---------- 收藏基础数值(通关刷装备 → 图鉴 → 永久基础数值) ---------- */

/** 每件收藏装备提供的全局基础数值(按品质;数值本体见 ./quality 主表的 collectionAtkPct/collectionHpPct) */

export interface CollectionBonus {
  atkPct: number;
  hpPct: number;
}

/** 收藏装备升级(装备系统重构:装备外侧升级)每级提升收藏贡献 25%,上限 GEAR_UPGRADE_MAX */
export const GEAR_UPGRADE_STEP = 0.25;
export const GEAR_UPGRADE_MAX = 5;
export function gearUpgradeCost(level: number): number {
  return (level + 1) * 15; // 星尘
}

/** 收藏图鉴加成:每件已收藏装备(不重复计)提供全局攻击/生命百分比;升级等级乘算贡献 */
export function collectionBonus(owned: readonly Equipment[], gearLevels?: Record<string, number>): CollectionBonus {
  let atk = 0;
  let hp = 0;
  for (const eq of owned) {
    const mult = 1 + GEAR_UPGRADE_STEP * (gearLevels?.[eq.name] ?? 0);
    atk += COLLECTION_ATK_PCT[eq.quality] * mult;
    hp += COLLECTION_HP_PCT[eq.quality] * mult;
  }
  return { atkPct: atk, hpPct: hp };
}

/* ---------- 通关装备掉落(数值随关卡解锁:越后面关卡掉越高级装备) ---------- */

/** 第 N 关通关掉落装备件数 */
export function stageDropCount(stageId: number): number {
  return 1 + Math.floor(stageId / 2);
}

/** 通关掉落装备等级 = 关卡 id(第 N 关的装备数值 = 1+(N-1)×12%,后续刷关装备更高) */
export function stageDropLevel(stageId: number): number {
  return stageId;
}
