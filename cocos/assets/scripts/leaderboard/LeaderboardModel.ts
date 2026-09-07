/**
 * 幻影榜屏的**内容与命中**(纯逻辑,cc-free)—— Web `src/game.ts:drawLeaderboard` 的文案侧抽取。
 *
 * 分工与 Phase 3 三屏同构:几何一律问共享层 `game/ui/leaderboardLayout.ts`,
 * 本文件只产"每行写什么、是不是玩家行、徽标贴哪张图",外加返回钮这一个热区
 * (对标 Web `onLeaderboardClick` → `hitPanelBack`,同几何同判据)。
 *
 * 三条纪律:
 *  ① 名次与插位全部走共享层既有函数(`phantomBoard` / `rankAmong` / `seasonScore` /
 *     `seasonTheme` / `frameQualityForStage`),本文件不复制判据;
 *  ② 纯只读屏:不产任何写入动作,宿主拿到 content 只负责摆节点;
 *  ③ 关卡框徽标与 Web `drawAvatarFrame` 同语义:贴图键优先,缺图由视图回退代码金圈,
 *     徽标盒几何恒在 layout 里(显示与否只由 `save.frames` 门控)。
 */

import { PHANTOM_COUNT, phantomBoard, rankAmong, type PhantomEntry } from "../game/data/leaderboard";
import { seasonScore } from "../game/data/season";
import { seasonTheme } from "../game/data/seasonSets";
import { frameQualityForStage } from "../game/data/quality";
import { leaderboardLayout, type LbRect, type LeaderboardLayout } from "../game/ui/leaderboardLayout";

/** 本屏要读的存档字段就这四项(SaveModel 结构上天然兼容) */
export interface LeaderboardSaveView {
  seasonId: number;
  stageStars: readonly number[];
  seasonBest: number;
  frames: readonly number[];
}

/** 玩家行的关卡框徽标(null = 不显示:Web 仅在 save.frames 非空时绘制) */
export interface LeaderboardBadge {
  /** 框贴图键(`frame_<品质>`,像素批次的五档品质框,与 `frameQualityForStage` 同一映射);缺图时视图回退硬边方框 */
  textureKey: string;
  /** 框心数字 = 最高已获框关卡(Web:`Math.max(...save.frames)`) */
  text: string;
}

/** 一行内容:isPlayer 决定配色档,幽灵行恒带 rank/score */
export interface LeaderboardRowContent {
  isPlayer: boolean;
  rank: number;
  rankText: string;
  nameText: string;
  scoreText: string;
  ghost: PhantomEntry | null;
  badge: LeaderboardBadge | null;
}

/** 本屏唯一的热区出口(纯只读,除返回外无动作) */
export type LeaderboardAction = { kind: "back" };

/** 一屏文案 */
export interface LeaderboardContent {
  title: string;
  sub: string;
  rows: LeaderboardRowContent[];
  myRank: number;
  myScore: number;
}

const inRect = (r: LbRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 存档 → 一屏文案。行数恒 = PHANTOM_COUNT + 1,玩家行插在 rankAmong 的名次位 */
export function buildLeaderboardContent(save: LeaderboardSaveView): LeaderboardContent {
  const board = phantomBoard(save.seasonId);
  const myScore = seasonScore(save.stageStars, save.seasonBest);
  const myRank = rankAmong(myScore, board);
  const top = save.frames.length > 0 ? Math.max(...save.frames) : null;
  const badge: LeaderboardBadge | null = top === null ? null : { textureKey: `frame_${frameQualityForStage(top)}`, text: String(top) };
  const rows: LeaderboardRowContent[] = [];
  // 10 幽灵 + 玩家行插入其名次位(第 11 名 = 未入榜,列末尾)—— 与 Web 循环逐项同式
  for (let i = 0; i <= board.length; i++) {
    const isPlayer = i === myRank - 1;
    // ghost === null 恰等价于 isPlayer(board[...] 恒为有效条目),故以 ghost 作判别式收窄非空
    const ghost = isPlayer ? null : board[i < myRank - 1 ? i : i - 1];
    const rank = ghost ? ghost.rank : myRank;
    const score = ghost ? ghost.score : myScore;
    rows.push({
      isPlayer,
      rank,
      rankText: `No.${rank}`,
      nameText: ghost ? `幻影 ${ghost.rank}` : "你",
      scoreText: `${score} 分`,
      ghost,
      badge: isPlayer ? badge : null,
    });
  }
  return {
    title: `幻影榜 · S${save.seasonId}「${seasonTheme(save.seasonId).name}」`,
    sub: "本地幻影 · 非联网数据 · 后端就绪后接入真榜",
    rows,
    myRank,
    myScore,
  };
}

/** 命中判定(对标 Web onLeaderboardClick:只有返回钮一个热区,其余点击不响应) */
export function hitLeaderboard(L: Pick<LeaderboardLayout, "backBtn">, x: number, y: number): LeaderboardAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  return null;
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数恒 PHANTOM_COUNT + 1) */
export function leaderboardScreenLayout(w: number, h: number): LeaderboardLayout {
  return leaderboardLayout(w, h, PHANTOM_COUNT + 1);
}
