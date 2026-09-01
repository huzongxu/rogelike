/**
 * 回响(转生)结算策划规范表 —— 回响点数公式与满树溢出转化的唯一出处。
 * 数值出处:策划案 5.2(基础分 + 生存分 + 击杀分 + 难度系数;满树溢出转星尘)。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md。
 */

/** 回响点数公式系数 */
export const PRESTIGE_FORMULA = {
  /** 基础分:每局保底(参与即有回报) */
  base: 1,
  /** 生存分:每整 1 分钟存活 +0.5 分 */
  perMinute: 0.5,
  /** 击杀分:每 1000 击杀 +0.3 分 */
  perThousandKills: 0.3,
  /** 难度系数:总分加项 = 1 + 难度 × 0.2(难度越高结算越好) */
  difficultyWeight: 0.2,
} as const;

/** 天赋树点满后溢出转化比率:1 回响点数 → 1 星尘(1:1,策划案 5.2) */
export const PRESTIGE_OVERFLOW_STARDUST_RATE = 1;

/** 回响点数公式:基础分 + 生存分 + 击杀分 + 难度系数(向下取整) */
export function calcPrestigePoints(seconds: number, kills: number, difficulty = 1): number {
  const f = PRESTIGE_FORMULA;
  const survive = Math.floor(seconds / 60) * f.perMinute;
  const killScore = Math.floor(kills / 1000) * f.perThousandKills;
  const diff = 1 + difficulty * f.difficultyWeight;
  return Math.floor(f.base + survive + killScore + diff);
}
