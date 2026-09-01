/**
 * 委托挂机系统 —— 策划案六 + 4.4 离线收益规则。
 *
 * 委托按真实时间结算(存档记录开始时间戳,离线也继续积累):
 *  收益衰减(策划案 4.4):前 2 小时 100%,之后线性衰减至 50%,再之后保持 50%。
 *  失败概率(策划案 6.2):难度越高失败率越高,失败时收益减半(离线玩法避免全损)。
 */

import { BUILDER_ROUTE, type TalentId } from "./talents";

export type RegionId = "plains" | "swamp" | "rift" | "abyss" | "sanctum" | "diamond";

export interface RegionDef {
  id: RegionId;
  name: string;
  /** 基础产出(每小时有效时长的产出量) */
  baseRate: number;
  /** 产出类型说明 */
  output: string;
  /** 解锁所需转生次数(0 = 初始解锁) */
  unlockPrestiges: number;
  /** 星尘圣殿需要天赋树点满 */
  unlockTreeFull?: boolean;
  /** 产出是否直接为星尘(否则为词缀碎片) */
  givesStardust?: boolean;
  /** 产出是否为钻石(辉钻矿脉,广告驱动硬通货的另一来源) */
  givesDiamond?: boolean;
}

export const REGIONS: readonly RegionDef[] = [
  { id: "plains", name: "枯萎平原", baseRate: 30, output: "基础材料", unlockPrestiges: 0 },
  { id: "swamp", name: "腐蚀沼泽", baseRate: 45, output: "毒素系词缀碎片", unlockPrestiges: 1 },
  { id: "rift", name: "熔岩裂谷", baseRate: 70, output: "火焰系词缀碎片", unlockPrestiges: 3 },
  { id: "abyss", name: "虚空深渊", baseRate: 110, output: "全类型词缀碎片", unlockPrestiges: 5 },
  { id: "sanctum", name: "星尘圣殿", baseRate: 25, output: "星尘结晶", unlockPrestiges: 0, unlockTreeFull: true, givesStardust: true },
  { id: "diamond", name: "辉钻矿脉", baseRate: 2, output: "钻石结晶", unlockPrestiges: 7, givesDiamond: true },
];

export function regionOf(id: RegionId): RegionDef {
  return REGIONS.find((r) => r.id === id)!;
}

export interface DifficultyDef {
  level: number;
  mult: number;
  fail: number;
}

/** 策划案 6.2 难度等级(表格止于 IV,V 按趋势补齐) */
export const DIFFICULTIES: readonly DifficultyDef[] = [
  { level: 1, mult: 1.0, fail: 0 },
  { level: 2, mult: 1.5, fail: 0.02 },
  { level: 3, mult: 2.2, fail: 0.05 },
  { level: 4, mult: 3.0, fail: 0.12 },
  { level: 5, mult: 4.0, fail: 0.2 },
];

export function difficultyOf(level: number): DifficultyDef {
  return DIFFICULTIES.find((d) => d.level === level) ?? DIFFICULTIES[0];
}

export function regionUnlocked(region: RegionDef, prestiges: number, ownedTalents: readonly TalentId[]): boolean {
  if (region.unlockTreeFull && !BUILDER_ROUTE.every((n) => ownedTalents.includes(n.id))) return false;
  return prestiges >= region.unlockPrestiges;
}

/** 委托最长结算时长(小时):超过后不再积累,领取后重新派遣(永恒工厂天赋可解除) */
export const COMMISSION_MAX_HOURS = 12;

/** 委托收益衰减曲线(策划案 4.4):前 fullHours 100% → 线性衰减至 decayEndHours 的 floorRate → 之后保持 floorRate */
export const COMMISSION_DECAY = {
  /** 全额收益窗口(小时;前 2 小时按 100% 产出) */
  fullHours: 2,
  /** 衰减终点(小时;2h→4h 从 100% 线性降到下限) */
  decayEndHours: 4,
  /** 衰减后保持的产出比例下限(比例 0-1;50%,离线玩法保底) */
  floorRate: 0.5,
} as const;

/** 委托待领取提醒门槛(小时):有效收益满全额窗口(前 2h)即在主界面提醒领取(与衰减曲线全额窗口同源) */
export const COMMISSION_READY_HOURS = COMMISSION_DECAY.fullHours;
/** 委托产出扭蛋券:每满 N 有效小时得 1 张 */
export const COMMISSION_TICKET_HOURS = 3;
/** 委托产出扭蛋券:单次委托至少 1 张(保底) */
export const COMMISSION_TICKET_MIN = 1;

/** 委托完成发放的扭蛋券数:有效时长 ÷ COMMISSION_TICKET_HOURS 向下取整,保底 COMMISSION_TICKET_MIN 张 */
export function commissionTickets(effHours: number): number {
  return Math.max(COMMISSION_TICKET_MIN, Math.floor(effHours / COMMISSION_TICKET_HOURS));
}

/** 词缀碎片兑换星尘比例:多少个碎片换 1 星尘 */
export const FRAGMENT_TO_STARDUST = 10;

/** 委托天赋加成(效率专家路线,策划案 5.2) */
export interface CommissionBonus {
  /** 收益倍率(离线增效 I/II/III 累计,默认 1) */
  rewardMult?: number;
  /** 结算速度倍率(委托加速 +20%,默认 1) */
  speedMult?: number;
  /** 时间压缩:实际耗时缩短 30% → 等效时间倍率 ~1.43 */
  timeScale?: number;
  /** 永恒工厂:解除 12 小时封顶 */
  uncapped?: boolean;
}

const noBonus: CommissionBonus = {};

/**
 * 有效收益时长(策划案 4.4 衰减曲线 + 天赋加成):
 * 前 2 小时 100%;2→4 小时线性衰减至 50%;4 小时后保持 50%;默认 12 小时封顶。
 */
export function effectiveHours(elapsedHours: number, bonus: CommissionBonus = noBonus): number {
  const speed = (bonus.speedMult ?? 1) * (bonus.timeScale ?? 1);
  const { fullHours, decayEndHours, floorRate } = COMMISSION_DECAY;
  let t = Math.min(elapsedHours, bonus.uncapped ? Number.MAX_SAFE_INTEGER : COMMISSION_MAX_HOURS) * speed;
  if (t <= fullHours) return t;
  const avgRate = (1 + floorRate) / 2; // 线性衰减段的平均产出比例
  if (t <= decayEndHours) return fullHours + avgRate * (t - fullHours);
  return fullHours + avgRate * (decayEndHours - fullHours) + floorRate * (t - decayEndHours);
}

export interface CommissionState {
  region: RegionId;
  difficulty: number;
  /** 开始时间戳(ms) */
  startedAt: number;
}

/** 计算委托当前应得的基础产出(未扣失败惩罚与天赋加成) */
export function accruedReward(c: CommissionState, now: number, bonus: CommissionBonus = noBonus): number {
  const hours = (now - c.startedAt) / 3600000;
  const eff = effectiveHours(hours, bonus);
  const region = regionOf(c.region);
  return Math.floor(region.baseRate * difficultyOf(c.difficulty).mult * eff * (bonus.rewardMult ?? 1));
}

/** 领取:按失败率 roll,失败收益减半(离线玩法避免全损)。返回最终产出 */
export function collectReward(
  c: CommissionState,
  now: number,
  roll: () => number = Math.random,
  bonus: CommissionBonus = noBonus
): { reward: number; failed: boolean } {
  const reward = accruedReward(c, now, bonus);
  const failRate = difficultyOf(c.difficulty).fail;
  const failed = roll() < failRate;
  return { reward: failed ? Math.floor(reward / 2) : reward, failed };
}
