/**
 * 幻影榜(排行屏)纯几何 —— Web `src/game.ts:drawLeaderboard`(2752-2821)的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 * 行区 `spreadRows(PHANTOM_COUNT + 1, 78, h − pad, 44, 72)`,行内三段文本锚点
 * pad+10 / pad+78 / w−pad−10(右对齐),徽标圆心 (pad+118, 行中心) 边长 24,
 * 返回钮 (w−pad−backW, 22, backW, backH),文本基线一律 `rowTextY`。
 *
 * 文本行(`LbTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 */

import { PHANTOM_COUNT } from "../data/leaderboard";
import { fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface LbRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type LbAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface LbTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: LbAlign;
}

/** 一行的几何:底板矩形 + 三段文本 + 徽标位(徽标是否显示由内容层门控) */
export interface LbRowLayout {
  index: number;
  rect: LbRect;
  /** 名次 `No.X`(Web:pad+10 起笔,body 加粗) */
  rank: LbTextLine;
  /** `你` / `幻影 X`(Web:pad+78 起笔,muted) */
  name: LbTextLine;
  /** `{分数} 分`(Web:w−pad−10 末笔右对齐,body 加粗) */
  score: LbTextLine;
  /** 关卡框徽标盒(圆心 pad+118 / 行中心,边长 24);仅玩家行有意义 */
  badge: LbRect;
}

/** 整屏几何 */
export interface LeaderboardLayout {
  /** 行数恒 = PHANTOM_COUNT + 1(10 幽灵 + 玩家行插位) */
  rowCount: number;
  rowH: number;
  gap: number;
  rows: LbRowLayout[];
  /** 标题(Web:(pad, 36) 金色加粗;限宽避开右上返回钮) */
  title: LbTextLine;
  /** 副标题(Web:(pad, 56) 次级色 muted) */
  sub: LbTextLine;
  /** 右上返回钮矩形(Web:skinButtonBase(btn_minor, w−pad−backW, 22, backW, backH, 8)) */
  backBtn: LbRect;
  /** 返回钮文字(Web:钮内居中,基线 rowTextY(22, backH, muted)) */
  backText: LbTextLine;
}

/* Web drawLeaderboard 的内联几何常量(策划数值纪律:屏专属常量在本文件顶部具名一处) */
/** 行区顶缘 */
export const LB_ROWS_TOP = 78;
/** 行高钳制档(Web spreadRows 的 minH/maxH 实参) */
export const LB_ROW_MIN_H = 44;
export const LB_ROW_MAX_H = 72;
/** 行内三段文本的横向锚点偏移(名次 / 名字起笔,徽标圆心) */
export const LB_RANK_DX = 10;
export const LB_NAME_DX = 78;
export const LB_BADGE_DX = 118;
/** 分数右对齐锚点的右缘内缩 */
export const LB_SCORE_INSET = 10;
/** 徽标盒边长(Web drawAvatarFrame 的 box 实参) */
export const LB_BADGE_BOX = 24;
/** 返回钮顶缘 */
export const LB_BACK_Y = 22;
/** 标题 / 副标题基线 */
export const LB_TITLE_BASE_Y = 36;
export const LB_SUB_BASE_Y = 56;

/** 行文本带的横向余量:限宽收到相邻元素起笔前 10px(与 Web 各段互不重叠的间距同档) */
const TEXT_SLACK = 10;

function rowLayout(index: number, rect: LbRect, scoreRightX: number): LbRowLayout {
  const baseY = rowTextY(rect.y, rect.h, fs.body);
  const rankX = rect.x + LB_RANK_DX;
  const nameX = rect.x + LB_NAME_DX;
  const badge: LbRect = { x: rect.x + LB_BADGE_DX - LB_BADGE_BOX / 2, y: rect.y + rect.h / 2 - LB_BADGE_BOX / 2, w: LB_BADGE_BOX, h: LB_BADGE_BOX };
  return {
    index,
    rect,
    rank: { x: rankX, baseY, maxW: nameX - TEXT_SLACK - rankX, px: fs.body, align: "left" },
    name: { x: nameX, baseY, maxW: scoreRightX - TEXT_SLACK - nameX, px: fs.muted, align: "left" },
    score: { x: scoreRightX, baseY, maxW: scoreRightX - rect.x - LB_SCORE_INSET, px: fs.body, align: "right" },
    badge,
  };
}

/**
 * 整屏几何。行数收 `rowCount`(恒传 PHANTOM_COUNT + 1,内容层负责给足),
 * 屏高收 `h`(行区在 [78, h − pad] 内摊开,996 与 1246 两档都成立)。
 */
export function leaderboardLayout(w: number, h: number, rowCount: number = PHANTOM_COUNT + 1): LeaderboardLayout {
  const pad = ui.pad;
  const { rowH, gap } = spreadRows(rowCount, LB_ROWS_TOP, h - pad, LB_ROW_MIN_H, LB_ROW_MAX_H);
  const backBtn: LbRect = { x: w - pad - ui.backW, y: LB_BACK_Y, w: ui.backW, h: ui.backH };
  const rows: LbRowLayout[] = [];
  for (let i = 0; i < rowCount; i++) {
    const y = LB_ROWS_TOP + i * (rowH + gap);
    rows.push(rowLayout(i, { x: pad, y, w: w - pad * 2, h: rowH }, w - pad - LB_SCORE_INSET));
  }
  return {
    rowCount,
    rowH,
    gap,
    rows,
    title: { x: pad, baseY: LB_TITLE_BASE_Y, maxW: backBtn.x - TEXT_SLACK - pad, px: fs.title, align: "left" },
    sub: { x: pad, baseY: LB_SUB_BASE_Y, maxW: w - pad * 2, px: fs.muted, align: "left" },
    backBtn,
    backText: { x: backBtn.x + backBtn.w / 2, baseY: rowTextY(backBtn.y, backBtn.h, fs.muted), maxW: backBtn.w, px: fs.muted, align: "center" },
  };
}
