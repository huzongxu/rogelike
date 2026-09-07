/**
 * 幻影榜(排行屏)纯几何 —— 像素暗黑翻新档:单一出口,绘制与命中判定共读这一份矩形。
 *
 * 网格:页边距 16、内容宽 528(右缘恒落 544)、坐标与尺寸一律取偶;返回钮抬到热区下限 44。
 * 行区在 [LB_ROWS_TOP, h − pad] 内摊开,行高钳 [44,72]、富余先吃行距(≤40,取偶),
 * 于是三档屏高(996 / 1212 / 1246)都由同一式子成立,不在板下堆空腔。
 *
 * 行内四段:品质框徽标(左起 16 内缩,落在行板 nineMargin 内)→ 名次 → 名字 → 分数(右对齐,
 * 右缘内缩 16)。文本行(`LbTextLine`)沿用 `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
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
  /** 名次 `No.X`(行左起 LB_RANK_DX,body 加粗) */
  rank: LbTextLine;
  /** `你` / `幻影 X`(行左起 LB_NAME_DX,muted) */
  name: LbTextLine;
  /** `{分数} 分`(右缘内缩 LB_SCORE_INSET 末笔右对齐,body 加粗) */
  score: LbTextLine;
  /** 品质框徽标盒(行左起 LB_BADGE_DX / 行内垂直居中);仅玩家行有意义 */
  badge: LbRect;
}

/** 整屏几何 */
export interface LeaderboardLayout {
  /** 行数恒 = PHANTOM_COUNT + 1(10 幽灵 + 玩家行插位) */
  rowCount: number;
  rowH: number;
  gap: number;
  rows: LbRowLayout[];
  /** 屏底板(像素九宫格 panel_dark_corners 的落位矩形) */
  panel: LbRect;
  /** 标题横幅(banner_large_purple 整图拉伸,240×46 = 源图 2 倍整数放大) */
  banner: LbRect;
  /** 标题(横幅在否两档:横幅档居中落在带内,缺图档左起笔) */
  title: LbTextLine;
  titleBare: LbTextLine;
  /** 副标题(横幅下方一档,次级色 muted) */
  sub: LbTextLine;
  /** 右上返回钮矩形(热区下限 44) */
  backBtn: LbRect;
  /** 返回钮文字(钮内居中) */
  backText: LbTextLine;
}

/* 屏专属常量(策划数值纪律:具名一处,不散在函数体里) */
/** 页边距 16 / 内容宽 528:右缘恒落 544,与像素网格同一把尺 */
export const LB_PAD = 16;
export const LB_CONTENT_W = 528;
/** 行区顶缘(标题横幅 0..46 + 副标题基线 68 之下留一档呼吸) */
export const LB_ROWS_TOP = 84;
/** 行高钳制档 */
export const LB_ROW_MIN_H = 44;
export const LB_ROW_MAX_H = 72;
/** 行距上限:富余高度由行距这道无硬上限的呼吸缝吸收(取偶,不落奇数坐标) */
export const LB_ROW_MAX_GAP = 40;
/** 行内四段的横向内缩(相对行左缘) */
export const LB_BADGE_DX = 16;
export const LB_RANK_DX = 68;
export const LB_NAME_DX = 148;
/** 分数右对齐锚点的右缘内缩(相对内容列右缘) */
export const LB_SCORE_INSET = 16;
/** 徽标盒边长(品质框 frame_* 的九宫格边距 16 → 边长 ≥ 32 才有可拉伸带) */
export const LB_BADGE_BOX = 40;
/** 返回钮顶缘 / 钮高(抬到热区下限 44,共享 ui.backH 的 34 不够一档) */
export const LB_BACK_Y = 16;
export const LB_BACK_H = 44;
/** 标题横幅(与扭蛋屏同一档:源图 120×23 的 2 倍整数放大) */
export const LB_BANNER_X = 8;
export const LB_BANNER_Y = 0;
export const LB_BANNER_W = 240;
export const LB_BANNER_H = 46;
/**
 * 标题基线 / 字号:横幅档带赛季名(「幻影榜 · S4「幽冥潮汐」」这类长串),22px 实渲染约 269,
 * 既装不进带内 208 限宽、也超 240 宽的横幅本身 → 横幅档收到 fs.section(实渲染约 196),
 * 基线按 rowTextY(0, 46, 16) 取 28 落在带内居中;缺图档限宽到返回钮前,仍走 fs.title 左起笔。
 */
export const LB_TITLE_BASE_Y = 28;
export const LB_TITLE_PX = 16;
export const LB_TITLE_BARE_BASE_Y = 36;
/** 副标题基线 */
export const LB_SUB_BASE_Y = 68;

/** 文本带的横向余量:限宽收到相邻元素起笔前 12px(与像素网格同档的偶数缝) */
const TEXT_SLACK = 12;

/** 取偶:奇数落位会让贴图与文本压在半个像素网格上 */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;

function rowLayout(index: number, rect: LbRect, scoreRightX: number): LbRowLayout {
  const baseY = rowTextY(rect.y, rect.h, fs.body);
  const rankX = rect.x + LB_RANK_DX;
  const nameX = rect.x + LB_NAME_DX;
  const badge: LbRect = {
    x: rect.x + LB_BADGE_DX,
    y: rect.y + evenDown((rect.h - LB_BADGE_BOX) / 2),
    w: LB_BADGE_BOX,
    h: LB_BADGE_BOX,
  };
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
 * 屏高收 `h`(行区在 [LB_ROWS_TOP, h − pad] 内摊开,三档屏高都成立)。
 */
export function leaderboardLayout(w: number, h: number, rowCount: number = PHANTOM_COUNT + 1): LeaderboardLayout {
  const pad = LB_PAD;
  const hh = evenDown(h);
  const { rowH, gap } = spreadRows(rowCount, LB_ROWS_TOP, hh - pad, LB_ROW_MIN_H, LB_ROW_MAX_H, LB_ROW_MAX_GAP);
  const evenGap = evenDown(gap);
  const backBtn: LbRect = { x: w - pad - ui.backW, y: LB_BACK_Y, w: ui.backW, h: LB_BACK_H };
  const banner: LbRect = { x: LB_BANNER_X, y: LB_BANNER_Y, w: LB_BANNER_W, h: LB_BANNER_H };
  const rows: LbRowLayout[] = [];
  for (let i = 0; i < rowCount; i++) {
    const y = LB_ROWS_TOP + i * (rowH + evenGap);
    rows.push(rowLayout(i, { x: pad, y, w: LB_CONTENT_W, h: rowH }, pad + LB_CONTENT_W - LB_SCORE_INSET));
  }
  return {
    rowCount,
    rowH,
    gap: evenGap,
    rows,
    panel: { x: pad, y: pad, w: LB_CONTENT_W, h: hh - pad * 2 },
    banner,
    title: { x: banner.x + banner.w / 2, baseY: LB_TITLE_BASE_Y, maxW: banner.w - 32, px: LB_TITLE_PX, align: "center" },
    titleBare: { x: pad, baseY: LB_TITLE_BARE_BASE_Y, maxW: backBtn.x - TEXT_SLACK - pad, px: fs.title, align: "left" },
    sub: { x: pad + LB_BADGE_DX, baseY: LB_SUB_BASE_Y, maxW: LB_CONTENT_W - LB_BADGE_DX * 2, px: fs.muted, align: "left" },
    backBtn,
    backText: { x: backBtn.x + backBtn.w / 2, baseY: rowTextY(backBtn.y, backBtn.h, fs.muted), maxW: backBtn.w, px: fs.muted, align: "center" },
  };
}
