/**
 * 死亡结算屏（阵亡）纯几何 —— Web `src/game.ts:drawGameOver`(4015-4113) 与
 * `handleTap` 的 gameover 分支(598-615) 的几何部分抽取。
 *
 * 单一出口：绘制与命中判定共读这一份矩形，宿主视图不产任何几何。口径与 Web 逐项同数：
 *  - **整屏只有一条纵向锚线 `a = h × 0.3`**（比赛季屏那条 0.28 还低一档），横幅 / 立绘 / 五行
 *    读数 / 复活钮 / 三钮行 / 名次提示全部从它加减；唯独广告双倍钮是**贴底锚**
 *    `{ x: w/2 − 95, y: h − 116, w: 190, h: 34 }`（底边落在 `h − 82`，不压 `h − pad`）；
 *    于是两档设计高之间，锚线族按 `h` 线性走、贴底族按 `h` 平移走，两族之间的空档一起伸缩；
 *  - **本屏没有面板**：Web 只画一笔全屏暗底 `rgba(0,0,0,0.8)` 就起内容，既不调 `panelPad`
 *    也不画九宫格，所以这里没有 `panel` / `panelKey` 两项；
 *  - 横幅 `banner_large_red` 是 `assets.draw` 的**整幅拉伸且没有回退分支**（Web 不接返回值）；
 *    立绘 `player_pose_4` 同一笔之前把 `globalAlpha` 压到 0.5、之后复位 1（Web 这里唯一的
 *    半透明件，横向锚点是半宽 196，也就是**压在横幅左侧、探出屏心 266**）；
 *  - 三钮行是 `bw 118 / bh 44 / gap 8` 的横排：`total = 118×3 + 8×2 = 370`、
 *    `bx = w/2 − 185`、`by = a + 170`，三枚依次 `bx` / `bx + 126` / `bx + 252`；钮内文字
 *    基线是裸偏移 `by + 28`（Web 这里没走 `rowTextY` —— 同档实参下 `rowTextY` 会给 `by + 29`，
 *    差的那 1px 属于 Web 原样，不改）；
 *  - 复活钮文字基线同样是裸偏移 `rb.y + 21`（钮高 32，故文字并不在钮的视觉正中）；
 *  - 双倍钮文字基线 `dbl.y + 22`（钮高 34）。
 *
 * 形态位（`canRevive` / `canDouble`）由入参给出，本层不读存档、不查天赋：
 *  - `canRevive` 决定复活钮在不在（Web 的 `if (this.canRevive()) { this.reviveBtn = rb } else
 *    { this.reviveBtn = null }`，钮不在时热区同时消失）；几何层恒算出那一格矩形，
 *    取不取由视图按形态位切容器 `active`、命中按形态位短路；
 *  - `canDouble` **不改任何矩形**（Web 的 `doubleBtn` 无条件赋值，领取后钮还在、只是变灰），
 *    它只影响配色档与命中顺序里的 `!doubleClaimed` 前置。
 *
 * 文本带限宽（`maxW`）是 Cocos 侧的口径：Web 的 `fillText` 不限宽。本屏八处居中文字一律取
 * 整屏带宽 `w − pad×2`，**包括三枚钮与复活 / 双倍钮内的文字** —— Web 那里 `看广告复活(剩余 1 次)`
 * 这一串比 220 的钮还宽、直接压出钮缘，若按钮宽限宽就会被 `fitOne` 补「…」，那是 Web 没有的
 * 裁字。起笔与基线不受 `maxW` 影响。
 *
 * 字号是 Web 写死的字面量：26 / 16 / 16 / 16 / 16 与 15 / 15 / 15 / 15 / 15，其中 26 与 15
 * 两档**不在 `fs` 表里**（`fs` 只有 28 / 22 / 16 / 14 / 13 / 12）。它们留在本层是因为文本行的
 * `px` 是几何签名的一部分，而共享层读不到宿主侧的 ViewTable；`tests/cocos-phase5-gameover.test.ts`
 * 把这两档与 `fs` 全表逐项锁开，防止有人把它们顺手「归到表上」而悄悄改掉与 Web 的像素差。
 *
 * 颜色、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段（键前缀 `go`）；
 * 本文件只留几何。
 */

import { ui } from "./theme";

/** 左上原点设计像素矩形（与 core/DesignMetrics.Rect 同形；共享层不引宿主类型） */
export interface GoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐，取值与 `ctx.textAlign` 一致 */
export type GoAlign = "left" | "center" | "right";

/** 一行文本的落位请求：x/baseY 就是 Web fillText 的锚点与基线，maxW 为限宽 */
export interface GoTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: GoAlign;
  bold: boolean;
}

/** 两个形态位（都由宿主投影传入，本层不读存档、不查天赋） */
export interface GameOverForms {
  /** 复活钮在不在（Web 的 `canRevive()`：`reviveUsed < reviveLimit()`） */
  canRevive: boolean;
  /** 双倍还领不领得了（Web 的 `canDouble = !doubleClaimed`；矩形不随它变） */
  canDouble: boolean;
}

/** 整屏几何 */
export interface GameOverLayout extends GameOverForms {
  /** 全屏唯一的纵向锚线（Web 的 `h * 0.3`，十处实参都从它加减） */
  anchorY: number;
  /** 标题横幅盒（`a` 上方 34，240×48；整幅拉伸，没有缺图回退档） */
  banner: GoRect;
  /** 阵亡立绘盒（`a` 上方 44，58×92；整屏唯一带半透明的贴图件） */
  pose: GoRect;
  /** 「阵亡」 */
  title: GoTextLine;
  /** 生存 / 波次·击杀 / 回响（或星尘） / 最佳纪录 四行读数 */
  timeLine: GoTextLine;
  waveLine: GoTextLine;
  echoLine: GoTextLine;
  bestLine: GoTextLine;
  /** 广告复活钮（`canRevive` 为假时整棵收起） */
  reviveBtn: GoRect;
  reviveText: GoTextLine;
  /** 三钮行：重开 / 天赋 / 菜单 */
  restartBtn: GoRect;
  prestigeBtn: GoRect;
  menuBtn: GoRect;
  restartText: GoTextLine;
  prestigeText: GoTextLine;
  menuText: GoTextLine;
  /** 幻影榜名次提示（矩形恒算，有没有内容看 `rankImprovedTo`） */
  rankLine: GoTextLine;
  /** 贴底的广告双倍钮（热区恒在，`canDouble` 只改配色与文字） */
  doubleBtn: GoRect;
  doubleText: GoTextLine;
  /** 三钮行步进（`bw + gap`，Web 写的是 `bx + bw + gap` 与 `bx + (bw + gap) * 2`） */
  btnStep: number;
  /** 三钮行总宽（`bw × 3 + gap × 2`） */
  btnRowW: number;
  /** 双倍钮底边相对屏底的下沉（Web 的裸 116 顶缘 → 底边 `h − 82`） */
  doubleBottomGap: number;
}

/* Web drawGameOver 的内联几何常量 */
/** 全屏纵向锚线相对屏高的比例 */
export const GO_ANCHOR_RATIO = 0.3;
/** 横幅：半宽 / 宽 / 高 / 相对锚线的上抬 */
export const GO_BANNER_DX = 120;
export const GO_BANNER_W = 240;
export const GO_BANNER_H = 48;
export const GO_BANNER_DY = 34;
/** 立绘：半宽 / 宽 / 高 / 相对锚线的上抬 */
export const GO_POSE_DX = 196;
export const GO_POSE_W = 58;
export const GO_POSE_H = 92;
export const GO_POSE_DY = 44;
/** 四行读数相对锚线的基线偏移 */
export const GO_TIME_DY = 34;
export const GO_WAVE_DY = 56;
export const GO_ECHO_DY = 80;
export const GO_BEST_DY = 100;
/** 复活钮：半宽 / 宽 / 高 / 相对锚线的下沉 / 钮内文字相对钮顶的基线 */
export const GO_REVIVE_DX = 110;
export const GO_REVIVE_W = 220;
export const GO_REVIVE_H = 32;
export const GO_REVIVE_DY = 124;
export const GO_REVIVE_TEXT_DY = 21;
/** 三钮行：宽 / 高 / 间距 / 相对锚线的下沉 / 钮内文字相对钮顶的基线 */
export const GO_BTN_W = 118;
export const GO_BTN_H = 44;
export const GO_BTN_GAP = 8;
export const GO_BTN_DY = 170;
export const GO_BTN_TEXT_DY = 28;
/** 名次提示相对锚线的基线偏移 */
export const GO_RANK_DY = 232;
/** 双倍钮：半宽 / 宽 / 高 / 顶缘相对屏底的上抬 / 钮内文字相对钮顶的基线 */
export const GO_DOUBLE_DX = 95;
export const GO_DOUBLE_W = 190;
export const GO_DOUBLE_H = 34;
export const GO_DOUBLE_UP = 116;
export const GO_DOUBLE_TEXT_DY = 22;
/** 钮底板描边宽度（Web 本屏一处都不设 lineWidth，取全项目「描边后复位 1」的约定档） */
export const GO_BTN_STROKE_W = 1;
/** 字号：Web 十处 `g.font` 的字面量档位（26 / 15 两档不在 `fs` 表内） */
export const GO_TITLE_PX = 26;
export const GO_TIME_PX = 16;
export const GO_WAVE_PX = 16;
export const GO_ECHO_PX = 16;
export const GO_BEST_PX = 16;
export const GO_REVIVE_PX = 15;
export const GO_BTN_PX = 15;
export const GO_RANK_PX = 15;
export const GO_DOUBLE_PX = 15;
/** 立绘的透明度（Web 的 `g.globalAlpha = 0.5`；是几何签名的一部分故留在本层，视图按它设节点透明度） */
export const GO_POSE_ALPHA = 0.5;

/** 三钮行的左起笔（Web 的 `bx = w/2 − total/2`，`total = 118×3 + 8×2`） */
export function gameOverRowX(w: number): number {
  return w / 2 - (GO_BTN_W * 3 + GO_BTN_GAP * 2) / 2;
}

/** 广告复活钮矩形（Web 的 `{ x: w/2 − 110, y: a + 124, w: 220, h: 32 }`） */
export function gameOverReviveBtn(w: number, h: number): GoRect {
  return { x: w / 2 - GO_REVIVE_DX, y: h * GO_ANCHOR_RATIO + GO_REVIVE_DY, w: GO_REVIVE_W, h: GO_REVIVE_H };
}

/** 贴底的广告双倍钮（Web 的 `{ x: w/2 − 95, y: h − 116, w: 190, h: 34 }`） */
export function gameOverDoubleBtn(w: number, h: number): GoRect {
  return { x: w / 2 - GO_DOUBLE_DX, y: h - GO_DOUBLE_UP, w: GO_DOUBLE_W, h: GO_DOUBLE_H };
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): GoTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。`forms` 是两个形态位（= Web 的 `canRevive()` 与 `!doubleClaimed`），
 * 本层不读存档、不查天赋。
 */
export function gameOverLayout(w: number, h: number, forms: GameOverForms): GameOverLayout {
  const pad = ui.pad;
  const maxW = w - pad * 2;
  const a = h * GO_ANCHOR_RATIO;
  const cx = w / 2;
  const rb = gameOverReviveBtn(w, h);
  const dbl = gameOverDoubleBtn(w, h);
  const bx = gameOverRowX(w);
  const by = a + GO_BTN_DY;
  const step = GO_BTN_W + GO_BTN_GAP;
  return {
    anchorY: a,
    banner: { x: cx - GO_BANNER_DX, y: a - GO_BANNER_DY, w: GO_BANNER_W, h: GO_BANNER_H },
    pose: { x: cx - GO_POSE_DX, y: a - GO_POSE_DY, w: GO_POSE_W, h: GO_POSE_H },
    title: line(cx, a, maxW, GO_TITLE_PX, true),
    timeLine: line(cx, a + GO_TIME_DY, maxW, GO_TIME_PX, false),
    waveLine: line(cx, a + GO_WAVE_DY, maxW, GO_WAVE_PX, false),
    // Web 这一行与星尘那一档共用同一笔 fillStyle 与 font，两档只差文案
    echoLine: line(cx, a + GO_ECHO_DY, maxW, GO_ECHO_PX, false),
    bestLine: line(cx, a + GO_BEST_DY, maxW, GO_BEST_PX, false),
    reviveBtn: rb,
    reviveText: line(cx, rb.y + GO_REVIVE_TEXT_DY, maxW, GO_REVIVE_PX, true),
    restartBtn: { x: bx, y: by, w: GO_BTN_W, h: GO_BTN_H },
    prestigeBtn: { x: bx + step, y: by, w: GO_BTN_W, h: GO_BTN_H },
    menuBtn: { x: bx + step * 2, y: by, w: GO_BTN_W, h: GO_BTN_H },
    restartText: line(bx + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    prestigeText: line(bx + step + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    menuText: line(bx + step * 2 + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    rankLine: line(cx, a + GO_RANK_DY, maxW, GO_RANK_PX, true),
    doubleBtn: dbl,
    doubleText: line(cx, dbl.y + GO_DOUBLE_TEXT_DY, maxW, GO_DOUBLE_PX, true),
    btnStep: step,
    btnRowW: GO_BTN_W * 3 + GO_BTN_GAP * 2,
    doubleBottomGap: h - (dbl.y + dbl.h),
    canRevive: forms.canRevive,
    canDouble: forms.canDouble,
  };
}

/** 整屏几何的单一出口（视图经宿主钩子调它；形态位由入参给出，本层不读存档） */
export function gameOverScreenLayout(w: number, h: number, forms: GameOverForms): GameOverLayout {
  return gameOverLayout(w, h, forms);
}
