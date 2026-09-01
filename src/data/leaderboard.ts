/**
 * 幻影榜 —— 策划案 V3 §4.3(诚实 MVP)。
 * platform/adapter 无网络能力 → 本地幻影榜:按 seasonId 种子生成 10 个固定名次幽灵分,
 * 玩家以赛季分对照得到名次。纯函数、零依赖、不落盘;后端就绪后数据层可直插替换。
 */

export interface PhantomEntry {
  /** 名次(1 = 榜首,分数最高) */
  rank: number;
  /** 赛季分口径的幽灵分 */
  score: number;
}

/** 幻影条数 */
export const PHANTOM_COUNT = 10;

/**
 * 幽灵基线分:下 8 条走幂曲线(12→162),顶 2 条压缩定标(审计 F1/F2 修复,用户拍板):
 * 次席 213 落在轻玩全 3 星(210)与核心(+无限关 ≈234)之间 → 两画像名次分化;
 * 榜首 233(+抖动 ≤237)≤ 现实上限 241(全 3 星 210 + 无限关波 31)→ 榜首可争夺。
 */
function phantomBase(k: number): number {
  if (k === PHANTOM_COUNT - 1) return 233;
  if (k === PHANTOM_COUNT - 2) return 213;
  return 12 + Math.round(236 * Math.pow(k / (PHANTOM_COUNT - 1), 1.8));
}

/**
 * 按赛季生成固定幻影榜(同 seasonId 恒同榜;赛季翻页自动换榜)。
 * 分布 ≈[13, 237]:新手 1 星首通(10 分)仍第 11 名不空榜,二次通关可超第 10;
 * 顶格需星数近满 + 无限关高波次才可登顶;中段玩家(~140 分)落在第 4 名。
 */
export function phantomBoard(seasonId: number): PhantomEntry[] {
  let s = (seasonId * 48271) % 2147483647;
  if (s <= 0) s = 1;
  const rng = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const scores: number[] = [];
  let prev = 0;
  for (let k = 0; k < PHANTOM_COUNT; k++) {
    const v = Math.max(prev + 1, phantomBase(k) + Math.floor(rng() * 5));
    scores.push(v);
    prev = v;
  }
  // rank 1 = 最高分;返回按名次升序(第 1 名在前)
  return scores
    .slice()
    .sort((a, b) => b - a)
    .map((score, i) => ({ rank: i + 1, score }));
}

/**
 * 玩家名次:1 + 严格大于玩家的幽灵数(并列名次口径:与幽灵同分共享该名次),返回 1–11。
 * 11 = 未入榜(低于全部幻影)。
 */
export function rankAmong(score: number, board: readonly PhantomEntry[]): number {
  return 1 + board.filter((e) => e.score > score).length;
}
