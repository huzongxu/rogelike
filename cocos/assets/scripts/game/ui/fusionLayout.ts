/**
 * 词缀融合屏纯几何 —— Web `src/game.ts:fusionLayout`(4389-4411)与 `drawFusion`(4412-4518)/
 * `drawHiddenChoice`(4519-4555)/`triplePanelRects`(4556-4565)/`drawTriplePanel`(4566-4613)/
 * `onFusionClick`(4615-4657)的几何部分抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - **自底向上**:融合钮底边锚定 `h − pad`(`{ x: w/2 − 110, y: h − pad − 48, w: 220, h: 48 }`),
 *    下方面板区顶缘 `panelY = fuseBtn.y − 180`,装备列表吃剩余 —— 行区预算 `[92, panelY − 12]`,
 *    `spreadRows(n, 92, panelY − 12, 44, 76)` **只传五个实参**,第六个 `maxGap` 走默认 20;
 *    `rowH` 被 `maxH = 76` 封顶、`gap` 被 20 封顶,于是列表短(件数少)时两档设计高(996 / 1246)
 *    下行矩形逐字相同,屏高只把 panelY 与其下的面板区往下推,多出来的高度全部落在末行底边与
 *    panelY 之间的空档里;件数多到把 `floor(avail/n) − 6` 压到 76 以下时行高才开始随屏高变;
 *  - 行 `y = 92 + i × (rowH + gap)`、`x = pad`、`w = w − pad×2`、`h = rowH`,条数 = 装备件数;
 *  - 行内两行基线 `l1 = Math.round(r.y + r.h/2 − 6)`、`l2 = l1 + 19`;选中标记 `[A] ` 起笔
 *    `r.x + 6`,名字起笔 `r.x + 6 + (sel ? 24 : 0)`(选中标记的宽度是**固定让位 24**,不是量字),
 *    摘要行起笔 `r.x + 6`;
 *  - **底部三形态互斥**(Web drawFusion 的提前 return 链):装备 < 2 件 → 只有居中提示一行
 *    (`(w/2, h/2)`,**textAlign 是 left**,Web 在返回钮那一段之后没再改对齐 —— 照抄);
 *    三重态(fusC 已选且解锁)→ 两枚模式钮 + 三行读数 + 融合钮,`drawTriplePanel` 里素材
 *    find 落空时整块不画;双选态 → 三行读数(基线 `panelY + 20 / +42 / +62`)+ 融合钮;
 *    未选齐 → 一行提示(基线 `panelY + 20`,居中)。几何层恒算出全部矩形,取用由内容层按形态分派;
 *  - 模式钮 `{ x: pad, y: panelY, w: 124, h: 36 }` 与 `{ x: pad + 132, … }`(Web triplePanelRects
 *    的顺序就是 双触发器 / 双修饰器),三重态三行读数基线 `panelY + 54 / +76 / +96`;
 *  - 融合钮文字居中、基线 `rowTextY(fuseBtn.y, 48, fs.section)`,描边 `lineWidth` 临时设 2
 *    再复位 1(`FU_FUSE_STROKE_W`);行底板选中档描边同样是 2(`FU_ROW_SEL_STROKE_W`);
 *  - 隐藏词缀三选一卡片一行三张:`cw 150`、`ch 128`、间距 16,`cx = (w − 150×3 − 16×2)/2`、
 *    `cy = h/2 − 64 + 10`;卡内名字基线 `y + 30`、描述四行 `y + 56 + i×16`、「点击选择」
 *    `y + h − 12`,起笔一律 `x + 12`,卡片描边宽 2(`FU_CARD_STROKE_W`);弹层标题与副行居中,
 *    基线 `h/2 − 110` 与 `h/2 − 78`;
 *  - 头部:标题横幅是 **`assets.draw("banner_mid_blue", pad − 6, 8, 190, 40)` 的整幅拉伸**
 *    (不是 skinHeader,Web 不接返回值 → 没有缺图回退档,标题恒左起笔于 `pad`、基线 36);
 *    横幅盒的 `x = pad − 6` 故意探出 pad,与其它屏 skinHeader 的 `bx = x − 8` 同性质;
 *  - 星尘读数走 `iconText(…, y = 62, size = 14)`:图标盒 `(pad, 62 − 14 + 2, 14, 14)`,有图时
 *    文字起笔 `pad + 14 + 4`,缺图时回到 `pad` 并由视图前置替代字形;
 *  - 返回钮 `(w − pad − backW, 22, backW, backH)` 是**纯代码矩形**(Web 那里没有贴图也没有
 *    skinIconButton),文字居中、基线 `rowTextY(22, 34, fs.muted)`;
 *  - 面板底走 `panelPad(g, w, h)` **不传专属键**,于是那一步就是 `panel_dark_corners` 九宫格
 *    `(pad, pad, w − pad×2, h − pad×2)`、切深 32。
 *
 * 命中口径(几何侧的事实):热区按 Web onFusionClick 的判定顺序排 —— 三选一弹层打开时**只响应
 * 卡片**(其余一律吞掉)→ 返回钮 → 装备行 → (三重态)模式钮 → 融合钮。三重态与双选态的融合钮
 * 是同一个矩形;弹层是否打开与三重态是否成立都由入参 `forms` 给出,本层不读存档、不查天赋。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:Web 的 `fillText` 不限宽,这里给的每一档只决定
 * `fitOne` 什么时候补「…」,不改变任何起笔与基线。
 *
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `fu`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface FuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type FuAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface FuTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: FuAlign;
}

/** 命中与绘制要分派的两个形态位(都由宿主投影传入,本层不读存档) */
export interface FusionForms {
  /** 隐藏词缀三选一弹层是否打开(Web 的 `pendingHidden !== null`) */
  hidden: boolean;
  /** 三重态是否成立(Web 的 `fusC !== null && tripleUnlocked(ownedTalents.length)`) */
  triple: boolean;
}

/** 一件装备行(两行布局;行键就是装备 id) */
export interface FusionRowLayout {
  id: number;
  /** 装备列表里的原序下标 */
  index: number;
  /** 行矩形(纯代码底板 + 描边;同时就是本屏的行热区) */
  rect: FuRect;
  /** 第一行基线(Web 的 `Math.round(r.y + r.h/2 − 6)`) */
  l1: number;
  /** 第二行基线(Web 的 `l1 + 19`) */
  l2: number;
  /** 选中标记 `[A] `(起笔 `r.x + 6`、基线 l1、fs.body 加粗;未选中那一档不画) */
  selTag: FuTextLine;
  /** 名字·选中档:起笔右移固定 24(Web 的 `r.x + 6 + (sel ? 24 : 0)`) */
  nameWithTag: FuTextLine;
  /** 名字·未选中档:起笔 `r.x + 6` */
  nameBare: FuTextLine;
  /** `Lv.N 品质 · 词缀摘要`(起笔 `r.x + 6`、基线 l2、fs.micro) */
  sub: FuTextLine;
}

/** 一枚三重融合模式钮(顺序 = Web triplePanelRects:双触发器 / 双修饰器) */
export interface FusionModeBtnLayout {
  index: number;
  rect: FuRect;
  /** 居中,基线 rowTextY(rect.y, 36, fs.muted) */
  text: FuTextLine;
}

/** 底部操作区几何(三形态互斥,矩形恒全算,取用由内容层分派) */
export interface FusionBottomLayout {
  /** 面板区顶缘(Web 的 `panelY = fuseBtn.y − 180`) */
  panelY: number;
  /** 未选齐时的提示行(居中 `w/2`、基线 `panelY + 20`、fs.muted) */
  hint: FuTextLine;
  /** 双选态三行:成本与保底读数 / 成品预览 / 规则说明(基线 `panelY + 20 / +42 / +62`) */
  pairReadout: FuTextLine;
  pairPreview: FuTextLine;
  pairNote: FuTextLine;
  /** 三重态两枚模式钮(恒 2 枚) */
  modeBtns: FusionModeBtnLayout[];
  /** 三重态三行:成本与保底读数 / 成品预览 / 保留说明(基线 `panelY + 54 / +76 / +96`) */
  tripleReadout: FuTextLine;
  triplePreview: FuTextLine;
  tripleNote: FuTextLine;
  /** 融合钮(热区 + 底板;双选态与三重态共用同一个矩形,描边宽度见 FU_FUSE_STROKE_W) */
  fuseBtn: FuRect;
  fuseText: FuTextLine;
}

/** 隐藏词缀三选一的一张卡片 */
export interface FusionHiddenCardLayout {
  idx: number;
  rect: FuRect;
  /** 词缀名(起笔 `x + 12`、基线 `y + 30`、fs.body 加粗) */
  name: FuTextLine;
  /** 描述折行基线(恒 4 条 `y + 56 + i×16`;每行有没有字由内容层按 10 字/行切) */
  descLines: FuTextLine[];
  /** 「点击选择」(起笔 `x + 12`、基线 `y + h − 12`、fs.micro) */
  hint: FuTextLine;
}

/** 整屏几何 */
export interface FusionLayout {
  /** 面板底矩形(panelPad 的九宫格实参矩形) */
  panel: FuRect;
  /** 面板贴图键 —— Web 的 `panelPad(g, w, h)` 不传专属键,故这一档就是 panel_dark_corners */
  panelKey: string;
  /** 标题横幅贴图盒(Web `assets.draw` 的整幅拉伸实参 `(pad − 6, 8, 190, 40)`) */
  headerBanner: FuRect;
  /** 标题:缺图那一档 —— 左起笔于页边距、基线 44 */
  title: FuTextLine;
  /** 标题:有横幅那一档 —— 居中于 `banner_mid_blue` 带内、同一基线 */
  titleOnBanner: FuTextLine;
  /** 星尘读数:图标盒 + 有图 / 缺图两档文字位 */
  stardustIcon: FuRect;
  stardustTextWithIcon: FuTextLine;
  stardustTextBare: FuTextLine;
  /** 右上返回钮与文字位(纯代码矩形,无贴图档) */
  backBtn: FuRect;
  backText: FuTextLine;
  /** 装备 < 2 件时的居中提示(Web 的 textAlign 停在了 left,锚点是 `w/2`) */
  emptyText: FuTextLine;
  /** 装备件数(= 行条数) */
  eqCount: number;
  /** 行区顶缘(恒 92) */
  rowsTop: number;
  /** 行区预算底缘(Web spreadRows 的第三实参 `panelY − 12`) */
  rowsBottom: number;
  /** 行高(spreadRows 的第一返回值;被 maxH 76 封顶) */
  rowH: number;
  /** 行距(spreadRows 的第二返回值;被默认 maxGap 20 封顶) */
  rowGap: number;
  /** 行步进 = rowH + gap */
  rowStep: number;
  /** 末行底边 = `rowsTop + (n − 1) × rowStep + rowH` */
  rowsEnd: number;
  /** 末行底边与面板区顶缘之间的空档(列表短时两档屏高的差全落在这里) */
  rowsToPanel: number;
  /** 逐行几何(长度 = eqCount) */
  rows: FusionRowLayout[];
  /** 底部操作区 */
  bottom: FusionBottomLayout;
  /** 三选一卡片(恒 3 张;Web fusionLayout 无条件算出,弹层打开时才参与绘制与命中) */
  hiddenCards: FusionHiddenCardLayout[];
  /** 弹层标题(居中、基线 `h/2 − 110`、fs.title 加粗) */
  hiddenTitle: FuTextLine;
  /** 弹层副行(居中、基线 `h/2 − 78`、fs.body) */
  hiddenSub: FuTextLine;
  /** 两个形态位(原样带回,命中层据此分派) */
  forms: FusionForms;
}

/* 屏专属几何常量(像素暗黑翻新档:具名一处;坐标与尺寸一律取偶) */
/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const FU_PAD = 16;
export const FU_CONTENT_W = 528;
/** 取偶下界:像素栅格 module = 2,奇数坐标会让贴图错半格 */
export const evenDown = (v: number): number => Math.floor(v / 2) * 2;
/** 融合钮:半宽 / 宽 / 高 / 底缘相对 `evenDown(h) − FU_PAD` 的上抬 */
export const FU_FUSE_HALF_W = 110;
export const FU_FUSE_W = 220;
export const FU_FUSE_H = 48;
export const FU_FUSE_UP = 48;
/** 面板区顶缘相对融合钮顶缘的让位(容纳 44 高模式钮 + 三行读数 + 缝) */
export const FU_PANEL_DY = 196;
/** 行区顶缘与预算底缘的让位 */
export const FU_ROWS_Y0 = 100;
export const FU_ROWS_BOTTOM_DY = 12;
/** 行高钳制两档(两档取偶;spreadRows 出数后再 evenDown,余量落进 rowsToPanel 那道呼吸缝) */
export const FU_ROW_MIN_H = 44;
export const FU_ROW_MAX_H = 76;
/** 行距下限(取偶) */
export const FU_ROW_MIN_GAP = 4;
/** 行内两行布局的两个裸加数 */
export const FU_L1_DY = 6;
export const FU_L2_DY = 20;
/** 行内三处偏移:文字起笔内缩(走行板 nineMargin 的 16)/ 选中标记的固定让位 */
export const FU_ROW_TEXT_DX = 16;
export const FU_SEL_TAG_DX = 24;
/** 返回钮顶缘 */
export const FU_BACK_Y = 18;
/** 三选一卡片:宽 / 高 / 间距 / 纵向中心相对 `h/2` 的下沉 */
export const FU_CARD_W = 150;
export const FU_CARD_H = 128;
export const FU_CARD_GAP = 16;
export const FU_CARD_CY_DY = 10;
/** 卡内四处:起笔内缩 / 名字基线 / 描述首行基线 / 描述行距 / 「点击选择」相对卡底的上抬 */
export const FU_CARD_TEXT_DX = 12;
export const FU_CARD_NAME_DY = 30;
export const FU_CARD_DESC_DY = 56;
export const FU_CARD_DESC_LINE = 16;
export const FU_CARD_HINT_DY = 12;
/** 卡片描边宽度 */
export const FU_CARD_STROKE_W = 2;
/** 描述折行的行数上限(每行 10 字的切分在内容层) */
export const FU_CARD_DESC_MAX_LINES = 4;
/** 弹层标题与副行相对 `evenDown(h/2)` 的上抬 */
export const FU_HIDDEN_TITLE_DY = 110;
export const FU_HIDDEN_SUB_DY = 78;
/** 头部:标题基线 / 横幅盒(`banner_mid_blue` 固有 161×20 → 322×40 整数倍,不裁不拉) */
export const FU_TITLE_BASE_Y = 44;
export const FU_BANNER_DX = 6;
export const FU_BANNER_Y = 18;
export const FU_BANNER_W = 322;
export const FU_BANNER_H = 40;
/** 星尘读数:基线 / 图标边长(`icon_stardust` 固有 14×14 → 28×28)/ 图标相对基线的上抬 / 图标与文字间距 */
export const FU_RES_BASE_Y = 88;
export const FU_ICON_SIZE = 28;
export const FU_ICON_DY = 2;
export const FU_ICON_TEXT_DX = 8;
/** 双选态三行读数相对 panelY 的基线 */
export const FU_PAIR_READOUT_DY = 20;
export const FU_PAIR_PREVIEW_DY = 42;
export const FU_PAIR_NOTE_DY = 62;
/** 未选齐提示的基线(与双选态读数行同高) */
export const FU_HINT_DY = 20;
/** 模式钮:宽 / 高(热区下限 44)/ 第二枚相对 pad 的横向起笔(= 宽 + 列距 8) */
export const FU_MODE_W = 128;
export const FU_MODE_H = 44;
export const FU_MODE2_DX = 136;
/** 三重态三行读数相对 panelY 的基线 */
export const FU_TRIPLE_READOUT_DY = 56;
export const FU_TRIPLE_PREVIEW_DY = 80;
export const FU_TRIPLE_NOTE_DY = 104;
/** 融合钮与行底板选中档的描边宽度(Web 两处都把 lineWidth 临时设 2 再复位 1) */
export const FU_FUSE_STROKE_W = 2;
export const FU_ROW_SEL_STROKE_W = 2;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参) */
export const FU_PANEL_NINE = 32;
/** 文本带限宽与相邻文本之间留的余量(Cocos 侧口径;Web 的 fillText 不限宽) */
export const TEXT_SLACK = 10;

/** 融合钮矩形(`x = evenDown(w/2 − 110)`、`y = evenDown(h) − FU_PAD − 48`;底边锚定屏高) */
export function fusionFuseBtn(w: number, h: number): FuRect {
  return { x: evenDown(w / 2 - FU_FUSE_HALF_W), y: evenDown(h) - FU_PAD - FU_FUSE_UP, w: FU_FUSE_W, h: FU_FUSE_H };
}

/** 面板区顶缘(Web 的 `panelY = fuseBtn.y − 180`;随融合钮一起底边锚定) */
export function fusionPanelY(w: number, h: number): number {
  return fusionFuseBtn(w, h).y - FU_PANEL_DY;
}

/** 行区预算底缘(Web spreadRows 的第三实参 `panelY − 12`) */
export function fusionRowsBottom(w: number, h: number): number {
  return fusionPanelY(w, h) - FU_ROWS_BOTTOM_DY;
}

function rowLayout(id: number, index: number, rect: FuRect): FusionRowLayout {
  const l1 = evenDown(rect.y + rect.h / 2 - FU_L1_DY);
  const l2 = l1 + FU_L2_DY;
  const leftX = rect.x + FU_ROW_TEXT_DX;
  return {
    id,
    index,
    rect,
    l1,
    l2,
    selTag: { x: leftX, baseY: l1, maxW: evenDown(rect.w - FU_ROW_TEXT_DX * 2), px: fs.body, align: "left" },
    nameWithTag: { x: leftX + FU_SEL_TAG_DX, baseY: l1, maxW: evenDown(rect.w - FU_ROW_TEXT_DX - FU_SEL_TAG_DX - TEXT_SLACK), px: fs.body, align: "left" },
    nameBare: { x: leftX, baseY: l1, maxW: evenDown(rect.w - FU_ROW_TEXT_DX - TEXT_SLACK), px: fs.body, align: "left" },
    sub: { x: leftX, baseY: l2, maxW: evenDown(rect.w - FU_ROW_TEXT_DX * 2), px: fs.micro, align: "left" },
  };
}

function hiddenCardLayout(idx: number, x: number, y: number): FusionHiddenCardLayout {
  const rect: FuRect = { x, y, w: FU_CARD_W, h: FU_CARD_H };
  const textX = x + FU_CARD_TEXT_DX;
  const maxW = FU_CARD_W - FU_CARD_TEXT_DX * 2;
  const descLines: FuTextLine[] = [];
  for (let i = 0; i < FU_CARD_DESC_MAX_LINES; i++) descLines.push({ x: textX, baseY: y + FU_CARD_DESC_DY + i * FU_CARD_DESC_LINE, maxW, px: fs.micro, align: "left" });
  return {
    idx,
    rect,
    name: { x: textX, baseY: y + FU_CARD_NAME_DY, maxW, px: fs.body, align: "left" },
    descLines,
    hint: { x: textX, baseY: y + FU_CARD_H - FU_CARD_HINT_DY, maxW, px: fs.micro, align: "left" },
  };
}

/**
 * 整屏几何。`eqIds` 是局内装备列表的 id 序列(条数 = 行条数),`forms` 是弹层与三重态两个
 * 形态位,都由宿主投影传入,本层不读存档、不查天赋。
 *
 * 行区预算是 `[92, panelY − 12]`,`spreadRows` 把 `rowH` 钳在 44..76、`gap` 上限 20。
 * 件数少时 `rowH` 与 `gap` 同时顶到上限,两档设计高下行矩形逐字相同,屏高的差全部落在
 * `rowsToPanel` 这一段空档里;件数多时行高才开始吃预算(数字见 `tests/cocos-phase4-fusion.test.ts`)。
 */
export function fusionLayout(w: number, h: number, eqIds: readonly number[], forms: FusionForms): FusionLayout {
  const hh = evenDown(h);
  const pad = FU_PAD;
  const rowW = w - pad * 2;
  const midX = evenDown(w / 2);
  const midY = evenDown(hh / 2);
  const fuseBtn = fusionFuseBtn(w, hh);
  const panelY = fusionPanelY(w, hh);
  const rowsBottom = fusionRowsBottom(w, hh);

  const spread = spreadRows(eqIds.length, FU_ROWS_Y0, rowsBottom, FU_ROW_MIN_H, FU_ROW_MAX_H);
  const rowH = Math.max(FU_ROW_MIN_H, evenDown(spread.rowH));
  const gap = eqIds.length > 1 ? Math.max(FU_ROW_MIN_GAP, evenDown(spread.gap)) : spread.gap;
  const rowStep = rowH + gap;
  const rows: FusionRowLayout[] = [];
  for (let i = 0; i < eqIds.length; i++) rows.push(rowLayout(eqIds[i], i, { x: pad, y: FU_ROWS_Y0 + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = rows.length > 0 ? FU_ROWS_Y0 + (rows.length - 1) * rowStep + rowH : FU_ROWS_Y0;

  const modeRects: FuRect[] = [
    { x: pad, y: panelY, w: FU_MODE_W, h: FU_MODE_H },
    { x: pad + FU_MODE2_DX, y: panelY, w: FU_MODE_W, h: FU_MODE_H },
  ];
  const modeBtns: FusionModeBtnLayout[] = modeRects.map((rect, index) => ({
    index,
    rect,
    text: { x: rect.x + rect.w / 2, baseY: rowTextY(rect.y, rect.h, fs.muted), maxW: evenDown(rect.w), px: fs.muted, align: "center" },
  }));

  const leftLine = (baseY: number, px: number): FuTextLine => ({ x: pad, baseY, maxW: evenDown(rowW - TEXT_SLACK), px, align: "left" });
  const bottom: FusionBottomLayout = {
    panelY,
    hint: { x: midX, baseY: panelY + FU_HINT_DY, maxW: rowW, px: fs.muted, align: "center" },
    pairReadout: leftLine(panelY + FU_PAIR_READOUT_DY, fs.muted),
    pairPreview: leftLine(panelY + FU_PAIR_PREVIEW_DY, fs.body),
    pairNote: leftLine(panelY + FU_PAIR_NOTE_DY, fs.micro),
    modeBtns,
    tripleReadout: leftLine(panelY + FU_TRIPLE_READOUT_DY, fs.muted),
    triplePreview: leftLine(panelY + FU_TRIPLE_PREVIEW_DY, fs.body),
    tripleNote: leftLine(panelY + FU_TRIPLE_NOTE_DY, fs.micro),
    fuseBtn,
    fuseText: { x: fuseBtn.x + fuseBtn.w / 2, baseY: rowTextY(fuseBtn.y, fuseBtn.h, fs.section), maxW: evenDown(fuseBtn.w), px: fs.section, align: "center" },
  };

  const backH = Math.max(44, ui.backH);
  const backBtn: FuRect = { x: evenDown(w - pad - ui.backW), y: FU_BACK_Y, w: evenDown(ui.backW), h: backH };
  const cx = evenDown((w - FU_CARD_W * 3 - FU_CARD_GAP * 2) / 2);
  const cy = evenDown(midY - FU_CARD_H / 2 + FU_CARD_CY_DY);
  const hiddenCards: FusionHiddenCardLayout[] = [0, 1, 2].map((i) => hiddenCardLayout(i, cx + i * (FU_CARD_W + FU_CARD_GAP), cy));

  const headerBanner: FuRect = { x: pad - FU_BANNER_DX, y: FU_BANNER_Y, w: FU_BANNER_W, h: FU_BANNER_H };
  const stardustIcon: FuRect = { x: pad, y: FU_RES_BASE_Y - FU_ICON_SIZE + FU_ICON_DY, w: FU_ICON_SIZE, h: FU_ICON_SIZE };
  const resLine = (x: number): FuTextLine => ({ x, baseY: FU_RES_BASE_Y, maxW: evenDown(w - pad - TEXT_SLACK - x), px: fs.body, align: "left" });

  return {
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    title: { x: pad, baseY: FU_TITLE_BASE_Y, maxW: evenDown(backBtn.x - TEXT_SLACK - pad), px: fs.title, align: "left" },
    titleOnBanner: { x: evenDown(headerBanner.x + headerBanner.w / 2), baseY: FU_TITLE_BASE_Y, maxW: evenDown(headerBanner.w - FU_BANNER_DX * 2), px: fs.title, align: "center" },
    stardustIcon,
    stardustTextWithIcon: resLine(pad + FU_ICON_SIZE + FU_ICON_TEXT_DX),
    stardustTextBare: resLine(pad),
    backBtn,
    backText: { x: backBtn.x + backBtn.w / 2, baseY: rowTextY(backBtn.y, backBtn.h, fs.muted), maxW: evenDown(backBtn.w), px: fs.muted, align: "center" },
    emptyText: { x: midX, baseY: midY, maxW: evenDown(w - pad - midX), px: fs.body, align: "left" },
    eqCount: eqIds.length,
    rowsTop: FU_ROWS_Y0,
    rowsBottom,
    rowH,
    rowGap: gap,
    rowStep,
    rowsEnd,
    rowsToPanel: panelY - rowsEnd,
    rows,
    bottom,
    hiddenCards,
    hiddenTitle: { x: midX, baseY: evenDown(midY - FU_HIDDEN_TITLE_DY), maxW: rowW, px: fs.title, align: "center" },
    hiddenSub: { x: midX, baseY: evenDown(midY - FU_HIDDEN_SUB_DY), maxW: rowW, px: fs.body, align: "center" },
    forms,
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行条数与形态位由入参给出,本层不读存档) */
export function fusionScreenLayout(w: number, h: number, eqIds: readonly number[], forms: FusionForms): FusionLayout {
  return fusionLayout(w, h, eqIds, forms);
}
