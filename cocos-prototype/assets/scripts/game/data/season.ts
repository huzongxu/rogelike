/**
 * 赛季壳 —— 策划案 V3 §4(P0-B):14 天赛季、门控、星数、每日首通、赛季分。
 * 纯数据与纯函数,不依赖 game.ts(便于单测)。
 */

/* ---------- 赛季骨架(§4.1) ---------- */

/** 赛季时长(天)(仅用于赛季轮转/结算;关卡解锁不再按天门控) */
export const SEASON_DAYS = 14;
/** 赛季分兑换星尘比例(1 分 = 1 星尘) */
export const SEASON_STARDUST_RATE = 1;

/** 一天毫秒数(单位:ms;赛季轮转/跨天计算的时间口径,全项目唯一出处) */
export const DAY_MS = 86400000;

/** 赛季第几天(1–14,不足一天算第 1 天) */
export function seasonDay(seasonStartAt: number, now: number): number {
  if (now < seasonStartAt) return 1;
  return Math.min(SEASON_DAYS, Math.floor((now - seasonStartAt) / DAY_MS) + 1);
}

/** 赛季是否已结束(≥14 天整) */
export function seasonEnded(seasonStartAt: number, now: number): boolean {
  return now - seasonStartAt >= SEASON_DAYS * DAY_MS;
}

/* ---------- 关卡解锁(进度制:不看天数) ----------
 * 规则:第 1 关常开;第 N 关(≥2)在「通关第 N-1 关」或「第 N-1 关打到
 * ceil(章节数 × unlockProgress) 章」时解锁(默认 50%,策划可配)。
 */

/** 关卡是否解锁(进度制;furthestPrev = 前一关打到过的最远章节) */
export function stageUnlocked(
  stageId: number,
  highestStage: number,
  furthestPrev: number,
  chaptersPerStage: number,
  unlockProgress: number
): boolean {
  if (stageId <= 1) return true;
  if (stageId <= highestStage) return true;
  const need = Math.max(1, Math.ceil(chaptersPerStage * unlockProgress));
  return furthestPrev >= need;
}

/** 解锁下一关所需的章节门槛(展示用):ceil(章节数 × 进度) */
export function stageUnlockNeed(chaptersPerStage: number, unlockProgress: number): number {
  return Math.max(1, Math.ceil(chaptersPerStage * unlockProgress));
}

/** 无限关:常开(不再按赛季天数门控) */
export function endlessOpen(): boolean {
  return true;
}

/* ---------- 通关星数(§4.2) ---------- */

/** 生命之星达标线(剩余生命比例;0–1):≥50% 记 1 星(策划案 §4.2:稳态通关应能拿到) */
export const STAR_HP_THRESHOLD = 0.5;

/** 通关 ★1 + 剩余生命 ≥50% ★1 + 未使用广告复活 ★1 */
export function calcStars(hpRatio: number, reviveUsed: number): number {
  return 1 + (hpRatio >= STAR_HP_THRESHOLD ? 1 : 0) + (reviveUsed === 0 ? 1 : 0);
}

/** 星数显示(★/☆) */
export function starsText(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.floor(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** 3 星一次性奖励(扭蛋券;关卡框待美术) */
export const THREE_STAR_TICKETS = 5;

/* ---------- 补星(§4.4:纯自愿钻石消费) ---------- */

/** 补星价格:2★ → 3★,5 钻 */
export const STAR_MAKEUP_COST = 5;

/** 只有恰好 2 星(差最后一颗)的关卡可补星 */
export function canStarMakeup(stars: number): boolean {
  return stars === 2;
}

/* ---------- 每日首通(§4.2) ---------- */

/** 每日首通:本日第一次通关任意关卡,券 ×2 + 回响 ×1.5 */
export const FIRST_CLEAR_TICKET_MULT = 2;
export const FIRST_CLEAR_ECHO_MULT = 1.5;

/* ---------- 赛季分与结算(§4.1) ---------- */

/** 赛季分 = Σ(关卡星数 ×10) + 赛季内最佳波次(§4.1:与 bestWave 同口径,赛季内单独记录) */
export function seasonScore(stageStars: readonly number[], seasonBest: number): number {
  return stageStars.reduce((sum, n) => sum + (n > 0 ? n * 10 : 0), 0) + seasonBest;
}

/** 赛季结算星尘 */
export function seasonStardust(score: number): number {
  return Math.floor(score * SEASON_STARDUST_RATE);
}
