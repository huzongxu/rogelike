/**
 * 赛季结算屏纯几何 —— Web `src/game.ts:drawSeason`(3847-3880)与 `onSeasonClick`(4002-4007)
 * 的几何部分抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。
 *  - **内容块在面板可落区里垂直居中**:徽标、横幅、标题与四行摘要是一整块,块高由块内
 *    最高件(徽标顶缘 `SE_BLOCK_TOP_DY`)与最低件(摘要末行基线 + 半行距 `SE_BLOCK_BOT_DY`)
 *    推导,块心对齐可落区中线,于是 `anchorY` 落在这两档屏高下的正中位。可落区 = 面板内缘
 *    `SE_PAD + SE_BLOCK_INSET` 到贴底钮顶缘上抬 `SE_BLOCK_INSET`,**上下两道留白等分**——
 *    本屏内容条数恒定,富余全在这两道缝里,不挤行距也不挤钮高;
 *    贴底钮另有一条锚线 `by = h − 78`(底边落在 `h − 34`,**不压 `h − pad`**,与已落地各屏的
 *    贴底钮不同口径 —— Web 这里写的就是裸 78);
 *  - **屏底板是 Cocos 侧加的一层**:`panel` / `panelKey` 给出 `panel_dark_corners` 九宫格的
 *    落位矩形(Web `drawSeason` 只画一笔全屏暗底 `rgba(8,10,16,0.92)` 就起内容,不调 `panelPad`
 *    也不画九宫格),底板铺 `[SE_PAD, hh − SE_PAD]`,内容块的可落区由它的内缘推出;
 *  - 徽标与横幅都是 `assets.draw` 的**整幅拉伸且没有回退分支**(Web 不接返回值),两笔的
 *    横向锚点分别是半宽 24 与 120、纵向相对 `anchorY` 上抬 96 与 32;
 *  - 七行文字全部 `textAlign = "center"`、锚点 `w / 2`,基线相对 `anchorY` 为 `0 / +34 / +62 /
 *    +86 / +114`,钮内文字基线是 `by + 28` 的裸偏移(Web 这里没走 `rowTextY` —— 同档实参下
 *    `rowTextY` 会给 `by + 27`,差的那 1px 属于 Web 原样,不改);
 *  - **两种形态互斥**:`seasonSummary` 为空时四行摘要整体不画(Web 的 `if (s)` 分支),徽标、
 *    横幅、标题与贴底钮照画。Web 的进屏判据本身就要 `seasonSummary` 非空,所以空摘要那一支
 *    在 Web 侧不可达,是绘制层的防御分支;几何层恒算出全部矩形,形态位由入参 `summary` 给出;
 *  - 返回出口只有贴底那一枚钮,没有返回钮、没有资源读数、没有标题横幅的九宫格档;
 *  - **本屏不调 `spreadRows`**(内容条数恒为 5 行 + 至多 4 行摘要,不随存档长度变),纵向全靠
 *    两条锚线:内容块的居中位与贴底钮的 `h − 78`。块高随 `summary` 形态位取档(有摘要到末行
 *    半行距、无摘要到横幅下缘),于是 996 与 1246 两档之间富余一律等分成上下两道留白,
 *    没有任何"随屏高摊开"的行区。
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
  /** 内容块的纵向居中位(块心 = 可落区中线;徽标、横幅、标题与四行摘要都从它加减) */
  anchorY: number;
  /** 内容块的可落区(面板内缘 `pad + SE_BLOCK_INSET` → 贴底钮顶缘上抬 `SE_BLOCK_INSET`) */
  contentBand: SeRect;
  /** 内容块自身矩形(顶 = 徽标顶缘,底 = 摘要末行半行距 / 无摘要时横幅下缘) */
  block: SeRect;
  /** 顶部徽标盒(`anchorY` 上方 96;48×40 贴 `emblem_flow_gold` 的 100×84 源比例) */
  emblem: SeRect;
  /** 标题横幅盒(`anchorY` 上方 32,362×44 = `banner_mid_bronze` 固有 181×22 的 2 倍) */
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
/** 内容块可落区上下各让出的呼吸位(含义:块缘到面板内缘 / 到贴底钮顶缘的最小留白;
 *  单位:设计 px;依据:本屏页边距档同一把尺,不再引入第二个间距事实源;
 *  出处:`SE_PAD` 与 `seasonCloseBtn` 的 `by = hh − SE_BTN_UP`) */
export const SE_BLOCK_INSET = SE_PAD;
/** 徽标:半宽与相对锚线的上抬;边长走源比例(100×84)→ 48 宽 / 40 高 */
export const SE_EMBLEM_DX = 24;
export const SE_EMBLEM_SIZE = 48;
export const SE_EMBLEM_H = 40;
export const SE_EMBLEM_DY = 96;
/** 横幅:宽 / 高 / 半宽 / 相对锚线的上抬
 *  (`banner_mid_bronze` 固有 181×22 → 362×44;art 宽为奇数故半宽取 evenDown 档,
 *   让 `x = cx − SE_BANNER_DX` 仍落在 2 逻辑像素栅格上,视觉中心相对屏心让位 1 逻辑像素) */
export const SE_BANNER_W = 362;
export const SE_BANNER_DX = evenDown(SE_BANNER_W / 2);
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

/** 内容块顶缘相对锚线的上抬(含义:块内最高件到锚线的距离;单位:设计 px;
 *  依据:徽标是整块最高的一件,它的顶缘就是块顶;出处:`SE_EMBLEM_DY`) */
export const SE_BLOCK_TOP_DY = SE_EMBLEM_DY;

/** 摘要末行的半行距(与视图 `Txt` 的 `lineHeight = round(px × 1.25)` 同一档,取偶落回栅格) */
export const SE_LINE_HALF_DY = evenDown(Math.ceil((SE_NOTE_PX * 1.25) / 2));

/**
 * 内容块底缘相对锚线的下抬(含义:块内最低件到锚线的距离;单位:设计 px;
 *  依据:摘要那一支最低是末行基线 + 半行距,无摘要那一支最低是横幅下缘;
 *  出处:`SE_NOTE_DY` / `SE_NOTE_PX` 与 `SE_BANNER_H − SE_BANNER_DY`)
 */
export function seasonBlockBottomDy(summary: boolean): number {
  return summary ? SE_NOTE_DY + SE_LINE_HALF_DY : SE_BANNER_H - SE_BANNER_DY;
}

/** 内容块的可落区(含义:面板内缘与贴底钮顶缘之间、上下各让一道呼吸位的纵向区间;
 *  单位:设计 px;依据:块只能落在这道区间里,富余才会读成留白而不是没画完;
 *  出处:`SE_PAD` / `SE_BLOCK_INSET` 与 `seasonCloseBtn`) */
export function seasonContentBand(w: number, h: number): SeRect {
  const hh = evenDown(h);
  const top = SE_PAD + SE_BLOCK_INSET;
  const bottom = seasonCloseBtn(w, hh).y - SE_BLOCK_INSET;
  return { x: SE_PAD, y: top, w: SE_CONTENT_W, h: Math.max(0, bottom - top) };
}

/** 内容块的纵向居中位(块心对可落区中线,再补回块顶抬量;屏高不够容纳块时贴可落区顶缘) */
export function seasonAnchorY(w: number, h: number, summary: boolean): number {
  const band = seasonContentBand(w, h);
  const blockH = SE_BLOCK_TOP_DY + seasonBlockBottomDy(summary);
  const centered = band.y + Math.max(0, band.h - blockH) / 2 + SE_BLOCK_TOP_DY;
  return evenDown(centered);
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): SeTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。`summary` 是摘要形态位(= 赛季摘要是否为空),本层不读存档、不查时间。
 *
 * 纵向全靠两条锚线:内容块的居中位 `anchorY`(块心对可落区中线,块高随 `summary` 取档)与
 * 贴底钮的 `evenDown(h) − 78`。`anchorY` 与 `h` 都先取偶,徽标 / 横幅 / 四行摘要的相对偏移
 * 又全是偶数,块高的半行距那一项也走 `evenDown`,所以任何一档屏高都不会掉出栅格;
 * 两档之间的富余等分落在块的上下两道留白上,不进行距也不进钮高。
 */
export function seasonLayout(w: number, h: number, summary: boolean): SeasonLayout {
  const hh = evenDown(h);
  const pad = SE_PAD;
  const maxW = SE_CONTENT_W;
  const band = seasonContentBand(w, hh);
  const anchorY = seasonAnchorY(w, hh, summary);
  const blockH = SE_BLOCK_TOP_DY + seasonBlockBottomDy(summary);
  const cx = evenDown(w / 2);
  const btn = seasonCloseBtn(w, hh);
  return {
    panel: { x: pad, y: pad, w: SE_CONTENT_W, h: hh - pad * 2 },
    panelKey: SE_PANEL_KEY,
    anchorY,
    contentBand: band,
    block: { x: band.x, y: anchorY - SE_BLOCK_TOP_DY, w: band.w, h: blockH },
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
