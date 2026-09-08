/**
 * 赛季结算屏纯几何 —— Web `src/game.ts:drawSeason`(3847-3880)与 `onSeasonClick`(4002-4007)
 * 的几何部分抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - 全屏只有一条纵向锚线 `anchorY = h × 0.28`,徽标、横幅、标题与四行摘要全部从它加减;
 *    贴底钮另有一条锚线 `by = h − 78`(底边落在 `h − 34`,**不压 `h − pad`**,与已落地各屏的
 *    贴底钮不同口径 —— Web 这里写的就是裸 78);
 *  - **本屏没有面板**:Web 只画一笔全屏暗底 `rgba(8,10,16,0.92)` 就起内容,既不调 `panelPad`
 *    也不画九宫格,所以这里没有 `panel` / `panelKey` 两项;
 *  - 徽标与横幅都是 `assets.draw` 的**整幅拉伸且没有回退分支**(Web 不接返回值),两笔的
 *    横向锚点分别是半宽 24 与 120、纵向相对 `anchorY` 上抬 96 与 32;
 *  - 七行文字全部 `textAlign = "center"`、锚点 `w / 2`,基线相对 `anchorY` 为 `0 / +34 / +62 /
 *    +86 / +114`,钮内文字基线是 `by + 28` 的裸偏移(Web 这里没走 `rowTextY` —— 同档实参下
 *    `rowTextY` 会给 `by + 27`,差的那 1px 属于 Web 原样,不改);
 *  - **两种形态互斥**:`seasonSummary` 为空时四行摘要整体不画(Web 的 `if (s)` 分支),徽标、
 *    横幅、标题与贴底钮照画。Web 的进屏判据本身就要 `seasonSummary` 非空,所以空摘要那一支
 *    在 Web 侧不可达,是绘制层的防御分支;几何层恒算出全部矩形,形态位由入参 `summary` 给出;
 *  - 返回出口只有贴底那一枚钮,没有返回钮、没有资源读数、没有标题横幅的九宫格档;
 *  - **本屏不调 `spreadRows`**(内容条数恒为 5 行 + 4 行摘要,不随存档长度变),纵向全靠两条
 *    锚线,于是 996 与 1246 两档之间所有矩形都按 `h` 线性走,没有任何"随屏高摊开"的行区。
 *
 * 字号是 Web 写死的字面量:24 / 16 / 17 / 17 / 16 / 15,其中 24、17、15 三档**不在 `fs` 表里**
 * (`fs` 只有 28 / 22 / 16 / 14 / 13 / 12)。它们留在本层是因为文本行的 `px` 是几何签名的一部
 * 分,而共享层读不到宿主侧的 ViewTable;`tests/cocos-phase4-season.test.ts` 把这三档与 `fs`
 * 全表逐项锁开,防止有人把它们顺手"归到表上"而悄悄改掉与 Web 的像素差。
 *
 * 颜色与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `se`);
 * 本文件只留几何。
 */

/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const SE_PAD = 16;
export const SE_CONTENT_W = 528;
/** 取偶下界:像素栅格 module = 2,奇数坐标会让贴图错半格 */
export const evenDown = (v: number): number => Math.floor(v / 2) * 2;

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface SeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type SeAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 fillText 的锚点与基线,maxW 为限宽 */
export interface SeTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: SeAlign;
  bold: boolean;
}

/** 整屏几何 */
export interface SeasonLayout {
  /** 屏底板(像素九宫格 panel_dark_corners 的落位矩形) */
  panel: SeRect;
  /** 屏底板贴图键 */
  panelKey: string;
  /** 全屏唯一的纵向锚线(`evenDown(h × 0.28)`,七处实参都从它加减) */
  anchorY: number;
  /** 顶部徽标盒(`anchorY` 上方 96;48×40 贴 `emblem_flow_gold` 的 100×84 源比例) */
  emblem: SeRect;
  /** 标题横幅盒(`anchorY` 上方 32,240×44 = `banner_mid_bronze` 固有 120×22 的 2 倍) */
  banner: SeRect;
  /** 标题「赛季结算」有横幅那一档(居中于 `anchorY`,落在横幅带内) */
  title: SeTextLine;
  /** 标题缺图那一档:左起笔于页边距,基线同一处 */
  titleBare: SeTextLine;
  /** 摘要四行(仅 `summary` 为真时上屏;矩形与基线恒算) */
  themeLine: SeTextLine;
  scoreLine: SeTextLine;
  dustLine: SeTextLine;
  noteLine: SeTextLine;
  /** 摘要四行相对 `anchorY` 的基线偏移 */
  summaryDys: number[];
  /** 贴底钮(热区 + 底板;`by = evenDown(h) − 78`) */
  closeBtn: SeRect;
  closeText: SeTextLine;
  /** 钮顶缘相对屏底的上抬(78;钮底边因此落在 `h − 34`) */
  btnBottomGap: number;
  /** 摘要形态位(原样带回,命中与绘制层据此分派) */
  summary: boolean;
}

/* 屏专属几何常量(具名一处,不散在函数体里;一律偶数) */
/** 全屏纵向锚线相对屏高的比例 */
export const SE_ANCHOR_RATIO = 0.28;
/** 徽标:半宽与相对锚线的上抬;边长走源比例(100×84)→ 48 宽 / 40 高 */
export const SE_EMBLEM_DX = 24;
export const SE_EMBLEM_SIZE = 48;
export const SE_EMBLEM_H = 40;
export const SE_EMBLEM_DY = 96;
/** 横幅:半宽 / 宽 / 高 / 相对锚线的上抬 */
export const SE_BANNER_DX = 120;
export const SE_BANNER_W = 240;
export const SE_BANNER_H = 44;
export const SE_BANNER_DY = 32;
/** 摘要四行相对锚线的基线偏移 */
export const SE_THEME_DY = 34;
export const SE_SCORE_DY = 62;
export const SE_DUST_DY = 86;
export const SE_NOTE_DY = 114;
/** 贴底钮:宽 / 高 / 半宽 / 顶缘相对屏底的上抬 / 钮内文字相对钮顶的基线
 *  (宽 190 → 220 是为了让 `w/2 − half` 落在偶数上;高 44 就是热区下限) */
export const SE_BTN_W = 220;
export const SE_BTN_H = 44;
export const SE_BTN_HALF_W = 110;
export const SE_BTN_UP = 78;
export const SE_BTN_TEXT_DY = 28;
/** 钮底板描边宽度 */
export const SE_BTN_STROKE_W = 1;
/** 字号档(24 / 17 / 15 三档不在 `fs` 表内,留在本层是文本行几何签名的一部 分) */
export const SE_TITLE_PX = 24;
export const SE_THEME_PX = 16;
export const SE_SCORE_PX = 17;
export const SE_DUST_PX = 17;
export const SE_NOTE_PX = 16;
export const SE_BTN_PX = 15;
/** 摘要行数(四行;`summary` 为假时整支不画) */
export const SE_SUMMARY_LINES = 4;
/** 翻页时写回的星数槽宽(长度 = 关卡数 + 1,索引 0 不用) */
export const SE_STARS_RESET: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];
/** 屏底板贴图键(与已落地各屏同一张九宫格) */
export const SE_PANEL_KEY = "panel_dark_corners";

/** 贴底钮矩形(`x = evenDown(w/2 − 110)`、`y = evenDown(h) − 78`) */
export function seasonCloseBtn(w: number, h: number): SeRect {
  return { x: evenDown(w / 2 - SE_BTN_HALF_W), y: evenDown(h) - SE_BTN_UP, w: SE_BTN_W, h: SE_BTN_H };
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): SeTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。`summary` 是摘要形态位(= 赛季摘要是否为空),本层不读存档、不查时间。
 *
 * 纵向全靠两条锚线(`anchorY` 与 `evenDown(h) − 78`),于是 996 与 1246 两档之间
 * 所有矩形都按 `h` 线性走;`anchorY` 与 `h` 都先取偶,徽标 / 横幅 / 四行摘要的
 * 相对偏移又全是偶数,所以任何一档屏高都不会掉出栅格。
 */
export function seasonLayout(w: number, h: number, summary: boolean): SeasonLayout {
  const hh = evenDown(h);
  const pad = SE_PAD;
  const maxW = SE_CONTENT_W;
  const anchorY = evenDown(hh * SE_ANCHOR_RATIO);
  const cx = evenDown(w / 2);
  const btn = seasonCloseBtn(w, hh);
  return {
    panel: { x: pad, y: pad, w: SE_CONTENT_W, h: hh - pad * 2 },
    panelKey: SE_PANEL_KEY,
    anchorY,
    emblem: { x: cx - SE_EMBLEM_DX, y: anchorY - SE_EMBLEM_DY, w: SE_EMBLEM_SIZE, h: SE_EMBLEM_H },
    banner: { x: cx - SE_BANNER_DX, y: anchorY - SE_BANNER_DY, w: SE_BANNER_W, h: SE_BANNER_H },
    title: line(cx, anchorY, maxW, SE_TITLE_PX, true),
    titleBare: { x: pad, baseY: anchorY, maxW: evenDown(cx - pad - 10), px: SE_TITLE_PX, align: "left", bold: true },
    themeLine: line(cx, anchorY + SE_THEME_DY, maxW, SE_THEME_PX, false),
    scoreLine: line(cx, anchorY + SE_SCORE_DY, maxW, SE_SCORE_PX, true),
    // 这一行继承上一行的 bold 17px
    dustLine: line(cx, anchorY + SE_DUST_DY, maxW, SE_DUST_PX, true),
    noteLine: line(cx, anchorY + SE_NOTE_DY, maxW, SE_NOTE_PX, false),
    summaryDys: [SE_THEME_DY, SE_SCORE_DY, SE_DUST_DY, SE_NOTE_DY],
    closeBtn: btn,
    closeText: line(cx, btn.y + SE_BTN_TEXT_DY, maxW, SE_BTN_PX, true),
    btnBottomGap: hh - (btn.y + btn.h),
    summary,
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;形态位由入参给出,本层不读存档) */
export function seasonScreenLayout(w: number, h: number, summary: boolean): SeasonLayout {
  return seasonLayout(w, h, summary);
}
