/**
 * 赛季通行证策划规范表 —— 双轨(免费 + 高级)档位与进度公式的唯一出处。
 * 数值出处:需求优化 v2 / 策划案 V3 §4.2(星数叠加通行证进度)。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md。
 */

/** 通行证档位:阈值(累计进度)→ 免费轨奖励;高级轨 = 免费轨 × PASS_PREMIUM_MULT */
export interface PassTier {
  /** 解锁所需累计进度(回响 + 星数加权) */
  need: number;
  /** 免费轨扭蛋券奖励(张) */
  tickets: number;
  /** 免费轨星尘奖励(个) */
  stardust: number;
}

/** 通行证档位表(5 档,升序阈值) */
export const PASS_TIERS: readonly PassTier[] = [
  { need: 10, tickets: 1, stardust: 5 },
  { need: 30, tickets: 2, stardust: 10 },
  { need: 60, tickets: 3, stardust: 20 },
  { need: 100, tickets: 5, stardust: 40 },
  { need: 150, tickets: 8, stardust: 80 },
];

/** 进度公式星数权重:进度 = 累计回响(永久+本日) + 关卡星数 × 本值 */
export const PASS_STAR_WEIGHT = 2;
/** 高级轨奖励倍率:看广告激活,本赛季有效,赛季翻页自动失效 */
export const PASS_PREMIUM_MULT = 2;

/** 通行证总进度:永久回响 + 本日回响 + 星数加权 */
export function calcPassProgress(points: number, dayEcho: number, stars: number): number {
  return points + dayEcho + stars * PASS_STAR_WEIGHT;
}
