/**
 * 装备升级屏纯几何 —— 按像素栅格(module = 2)重排后的单一出口。
 *
 * 绘制与命中判定共读这一份矩形,宿主视图不产任何几何。栅格口径:
 *  - 宽恒 560、页边距 `GU_PAD = 16`、内容宽 `GU_CONTENT_W = 528`,所有矩形右缘恒落 544;
 *    纵向锚线一律先 `evenDown(h)` 再算,行高与行距出 `spreadRows` 后各再过一次 `evenDown`,
 *    于是 996 与 1246 两档屏高的每一个坐标与尺寸都是偶数;
 *  - **头部拆两带**:A 带是「标题(左) + 返回钮(右)」,B 带是「副标题(左) + 星尘(右)」。
 *    星尘因此不再与返回钮矩形重叠(冻结的 Web 基准里两者纵向叠在一起、读数被钮盖住),
 *    两带各给一个具名带高,文字基线走 `rowTextY` 居中于带;
 *  - 屏底板是 `panel_dark_corners` 的九宫格档(与已重排各屏同一张),切深由
 *    `core/ViewTable.ts:borderOf` 按 `nineSlice` 表推导,本层不再给切深常量、也不留回落键;
 *  - 行底板是**品质框**(`ui/PanelKit.qualityBox` 的 Cocos 实现),行矩形只用于绘制:
 *    命中口径是「返回钮 → 逐行升级钮」,行 `rect` 不参与命中,点行内非按钮区不产动作;
 *  - 升级钮高 `GU_BTN_H` 由 `ui.touchMin` 推出(= 44),钮宽取 `btn_minor` 固有 30×20 art px
 *    的 2 倍档 120,右缘从行右缘内缩 `GU_BTN_INSET = 16`;
 *  - 徽记带在按钮左侧:颗数 = `GEAR_UPGRADE_MAX`,边长 `GU_STAR_BOX = 12`(= `badge_gear_lv`
 *    固有 6×6 art px 的 2 倍),颗间缝 `GU_STAR_GAP = 4` 让每颗的 x 都落在栅格上,
 *    整条带与钮之间留 `GU_STAR_BTN_GAP = 16`;
 *  - 行内两行文本的限宽**由徽记带左缘推导**(`starsX − GU_TEXT_SLACK − textX`),不留第二个
 *    事实源;基线走每日屏同款两行式 `l1 = evenDown(y + h/2 − GU_LINE1_DY)`、`l2 = l1 + 18`;
 *  - 截断提示占**恒定的一条贴底带**(不论 `showHint` 在不在都让出这段预算),于是行数变化
 *    不会让行高跳动;末行底缘到该带顶缘之间那条 `seamAboveHint` 是本屏**唯一无硬上限的
 *    呼吸缝**,屏高富余只进它;
 *  - 空态(`gearCount === 0`)只有一行提示,基线居中于行区,此时 `rows` 为空数组、无截断提示。
 *
 * 文本行(`GuTextLine`)沿用 `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 颜色与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `gu`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 *
 * 与冻结的 Web 基准(`src/game.ts:drawGearUp`)的有意分歧:页边距 14→16、头部两带化、
 * 行距改用 `spreadRows` 的 `gap`(Web 硬编码 4)、升级钮高抬到热区下限、星尘不再被返回钮盖住、
 * 底板换 `panel_dark_corners`。判据见 `docs/UI-PIXEL-REFRESH.md` §8(不再做逐项视觉对标)。
 */

import { GEAR_UPGRADE_MAX } from "../data/daily";
import { evenDown, fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface GuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type GuAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 fillText 的锚点与基线,maxW 为限宽 */
export interface GuTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: GuAlign;
}

/** 一个装备行的几何:品质框矩形 + 两行左对齐文本 + 升级钮与钮文 + 五颗徽记 */
export interface GearUpRowLayout {
  /** 对应 `ownedGear` 的下标(即 `list` 的原序下标) */
  index: number;
  /** 品质框矩形(只用于绘制;命中不看它 —— 见文件头的命中口径) */
  rect: GuRect;
  /** 本屏唯一的行内热区(`hitGearUp` 只遍历这个矩形) */
  btn: GuRect;
  /** 徽记槽(长度 = GEAR_UPGRADE_MAX,逐颗左→右;点亮颗数由内容层的 lv 门控) */
  stars: GuRect[];
  /** 名字(左对齐于 `rect.x + GU_ROW_TEXT_DX`,基线 l1) */
  name: GuTextLine;
  /** 描述(与名字同一起笔位,基线 l2 = l1 + GU_LINE_SPACING;文字内容由模型给) */
  desc: GuTextLine;
  /** 钮文(居中于钮,基线走 `rowTextY`) */
  btnText: GuTextLine;
  /** 徽记缺图回退的文字星基线(逐颗同 x,与 stars 一一对应) */
  starGlyphBaseY: number;
  /** 文字星的字号 */
  starGlyphPx: number;
}

/** 整屏几何 */
export interface GearUpLayout {
  /** 行数 = `min(gearCount, GU_ROWS_MAX)`;0 即空态 */
  rowCount: number;
  /** `gearCount === 0`(只有一行提示,无行无截断提示) */
  empty: boolean;
  /** `gearCount > GU_ROWS_MAX`(硬截断,故有"仅显示前 14 件"一行) */
  showHint: boolean;
  /** 收藏总件数(截断提示的分母;绘制与命中都不参与) */
  gearCount: number;
  /** 行高(spreadRows 的第一返回值过一次 evenDown;空态为 0) */
  rowH: number;
  /** 行距步进 = rowH + rowGap */
  rowStep: number;
  /** 行距(spreadRows 的第二返回值过一次 evenDown;富余摊在这里,上限默认 20) */
  rowGap: number;
  rows: GearUpRowLayout[];
  /** 屏底板矩形(`[pad, evenDown(h) − pad]` 的九宫格内缩区) */
  panel: GuRect;
  /** 屏底板贴图键(九宫格;切深由宿主 `ViewTable.borderOf` 按表推导) */
  panelKey: string;
  /** 标题(A 带左起笔,与返回钮同一带) */
  title: GuTextLine;
  /** 副标题(B 带左起笔) */
  subtitle: GuTextLine;
  /** 星尘读数(B 带右对齐,末笔落 `w − GU_PAD`;与副标题同带不再被返回钮盖住) */
  stardust: GuTextLine;
  /** 空态提示(仅 empty 为真时存在;基线居中于行区) */
  emptyText: GuTextLine;
  /** 截断提示(仅 showHint 为真时存在;落在恒定的贴底带里) */
  hint: GuTextLine;
  /** 末行底缘到截断提示带顶缘的呼吸缝(本屏唯一的留白吸收体;空态时是整条行区) */
  seamAboveHint: number;
  /** 行区顶缘(所有行的 y 从它起算) */
  listY0: number;
  /** 行区底缘预算(= 贴底提示带的顶缘) */
  listBottom: number;
  /** 右上返回钮矩形与两档文字位 */
  backBtn: GuRect;
  /** 返回钮图标位(边长 = `btn_back` 固有 11×11 art px 的 2 倍档,纵向居中于钮) */
  backIcon: GuRect;
  /** 返回钮文字:有图标时居中于图标右侧剩余空间 */
  backTextWithIcon: GuTextLine;
  /** 返回钮文字:缺图时整体居中 */
  backTextBare: GuTextLine;
}

/* ---------- 屏专属几何常量(具名一处,不散在函数体里;一律偶数) ---------- */

/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const GU_PAD = 16;
export const GU_CONTENT_W = 528;
export { evenDown };

/** 列表硬截断件数(提示文案里的同一个 14 由它插值) */
export const GU_ROWS_MAX = 14;

/** 头部 A 带:顶缘 / 带高(= 返回钮高)/ 返回钮宽高与图标边长 */
export const GU_TOP_Y = 16;
export const GU_BACK_W = ui.backW;
/** 返回钮图标边长:`btn_back` 固有 11×11 art px × module 2 */
export const GU_BACK_ICON_BOX = 22;
/** 图标上下各留 12 → 钮高 46(≥ `ui.touchMin`,且让图标纵向居中后 y 仍为偶数) */
export const GU_BACK_ICON_PAD = 12;
export const GU_BACK_H = Math.max(ui.touchMin, GU_BACK_ICON_BOX + GU_BACK_ICON_PAD * 2);
export const GU_BACK_Y = GU_TOP_Y;
export const GU_BACK_ICON_DX = 4;
/** A 带带高就是返回钮高(标题基线居中于它) */
export const GU_HEAD_A_H = GU_BACK_H;

/** 头部 B 带:A→B 缝 / 带高 / 星尘读数预留宽 */
export const GU_SUB_GAP = 12;
export const GU_SUB_BAND_H = 24;
export const GU_DUST_RESERVE_W = 140;

/** 行区顶缘 = B 带底缘 + 一条带缝 */
export const GU_LIST_GAP = 16;
export const GU_LIST_Y0 = GU_TOP_Y + GU_HEAD_A_H + GU_SUB_GAP + GU_SUB_BAND_H + GU_LIST_GAP;
/** 贴底截断提示带:恒定让出这一段预算(不论提示在不在),带高 28 */
export const GU_HINT_BAND_H = 28;
/** 行高钳制两档(spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const GU_ROW_MIN_H = 56;
export const GU_ROW_MAX_H = 72;

/** 行内文本起笔偏移 / 两行基线式 / 文本带与徽记带之间的余量 */
export const GU_ROW_TEXT_DX = 16;
export const GU_LINE1_DY = 4;
export const GU_LINE_SPACING = 18;
export const GU_TEXT_SLACK = 10;

/** 升级钮:右缘内缩 / 钮宽(`btn_minor` 固有 30 art px 宽 × 2 的整倍档)/ 高相对行高的上下让位 / 钮高上限 */
export const GU_BTN_INSET = 16;
export const GU_BTN_W = 120;
export const GU_BTN_V_INSET = 8;
/** 钮高上限就是热区下限(行高 ≥ GU_ROW_MIN_H 时 `gearBtnHeight` 恒返回这一档) */
export const GU_BTN_H = Math.max(ui.touchMin, 44);

/** 徽记:边长(`badge_gear_lv` 固有 6×6 art px × 2)/ 颗间距 / 整条徽记带与按钮之间的间隙 */
export const GU_STAR_BOX = 12;
export const GU_STAR_GAP = 4;
export const GU_STAR_BTN_GAP = 16;
/** 徽记缺图回退的文字星基线相对徽记底缘的上抬 */
export const GU_STAR_GLYPH_DY = 2;

/** 字号档(文本行的 px 是几何签名的一部分) */
export const GU_TITLE_PX = fs.title;
export const GU_SUB_PX = fs.muted;
export const GU_DUST_PX = fs.body;
export const GU_NAME_PX = fs.body;
export const GU_DESC_PX = fs.micro;
export const GU_BTN_PX = fs.micro;
export const GU_HINT_PX = fs.micro;
export const GU_EMPTY_PX = fs.body;
export const GU_BACK_PX = fs.body;

/** 屏底板贴图键(与已重排各屏同一张九宫格) */
export const GU_PANEL_KEY = "panel_dark_corners";

/** 返回钮矩形(右缘恒落 `w − GU_PAD`;热区 ≥ `ui.touchMin`) */
export function gearUpBackBtn(w: number): GuRect {
  return { x: w - GU_PAD - GU_BACK_W, y: GU_BACK_Y, w: GU_BACK_W, h: GU_BACK_H };
}

/** 头部 A 带矩形(标题基线居中于它) */
export function gearUpHeadBandA(): GuRect {
  return { x: GU_PAD, y: GU_TOP_Y, w: GU_CONTENT_W, h: GU_HEAD_A_H };
}

/** 头部 B 带矩形(副标题与星尘共带) */
export function gearUpHeadBandB(): GuRect {
  const a = gearUpHeadBandA();
  return { x: GU_PAD, y: a.y + a.h + GU_SUB_GAP, w: GU_CONTENT_W, h: GU_SUB_BAND_H };
}

/** 贴底截断提示带矩形(恒定让位,与 `showHint` 无关) */
export function gearUpHintBand(h: number): GuRect {
  const hh = evenDown(h);
  return { x: GU_PAD, y: hh - GU_PAD - GU_HINT_BAND_H, w: GU_CONTENT_W, h: GU_HINT_BAND_H };
}

/** 升级钮高度(行高 ≥ GU_ROW_MIN_H 时恒为 GU_BTN_H = 热区下限) */
export function gearBtnHeight(rowH: number): number {
  return Math.min(rowH - GU_BTN_V_INSET, GU_BTN_H);
}

/** 徽记带总宽(`GEAR_UPGRADE_MAX` 颗 + 之间的 `GU_STAR_GAP` 条缝) */
export function gearStarStripW(): number {
  return GEAR_UPGRADE_MAX * GU_STAR_BOX + (GEAR_UPGRADE_MAX - 1) * GU_STAR_GAP;
}

function rowLayout(index: number, rect: GuRect, rowH: number): GearUpRowLayout {
  const btnH = gearBtnHeight(rowH);
  const btn: GuRect = {
    x: rect.x + rect.w - GU_BTN_INSET - GU_BTN_W,
    y: evenDown(rect.y + (rect.h - btnH) / 2),
    w: GU_BTN_W,
    h: btnH,
  };
  const sx0 = btn.x - gearStarStripW() - GU_STAR_BTN_GAP;
  const sy0 = evenDown(rect.y + (rect.h - GU_STAR_BOX) / 2);
  const stars: GuRect[] = [];
  for (let s = 0; s < GEAR_UPGRADE_MAX; s++) stars.push({ x: sx0 + s * (GU_STAR_BOX + GU_STAR_GAP), y: sy0, w: GU_STAR_BOX, h: GU_STAR_BOX });
  const nameX = rect.x + GU_ROW_TEXT_DX;
  // 限宽由徽记带左缘推导:文本带与徽记带之间恒留 GU_TEXT_SLACK,不留第二个宽度事实源
  const textW = evenDown(sx0 - GU_TEXT_SLACK - nameX);
  const l1 = evenDown(rect.y + rect.h / 2 - GU_LINE1_DY);
  const l2 = l1 + GU_LINE_SPACING;
  return {
    index,
    rect,
    btn,
    stars,
    name: { x: nameX, baseY: l1, maxW: textW, px: GU_NAME_PX, align: "left" },
    desc: { x: nameX, baseY: l2, maxW: textW, px: GU_DESC_PX, align: "left" },
    btnText: { x: evenDown(btn.x + btn.w / 2), baseY: evenDown(rowTextY(btn.y, btn.h, GU_BTN_PX)), maxW: btn.w, px: GU_BTN_PX, align: "center" },
    starGlyphBaseY: sy0 + GU_STAR_BOX - GU_STAR_GLYPH_DY,
    starGlyphPx: fs.micro,
  };
}

/**
 * 整屏几何。行数与截断提示都由 `gearCount`(= `ownedGear.length`)推出:
 * 0 → 空态(无行、无提示),1..GU_ROWS_MAX → 列表无提示,> GU_ROWS_MAX → 列表 + 提示。
 *
 * 屏高收 `h`:行区在 `[GU_LIST_Y0, evenDown(h) − GU_PAD − GU_HINT_BAND_H]` 内摊开,
 * 996 与 1246 两档都不越界;`rowH` 顶到 `GU_ROW_MAX_H` 之后富余只进 `seamAboveHint`。
 */
export function gearUpLayout(w: number, h: number, gearCount: number): GearUpLayout {
  const hh = evenDown(h);
  const pad = GU_PAD;
  const rowW = w - pad * 2;
  const bandA = gearUpHeadBandA();
  const bandB = gearUpHeadBandB();
  const hintBand = gearUpHintBand(hh);
  const listY0 = GU_LIST_Y0;
  const listBottom = hintBand.y;

  const rowCount = Math.max(0, Math.min(gearCount, GU_ROWS_MAX));
  // n = 0 时 spreadRows 返回 rowH 0,与"不调"同值,故空态与列表共用一次调用
  const spread = spreadRows(rowCount, listY0, listBottom, GU_ROW_MIN_H, GU_ROW_MAX_H);
  const rowH = evenDown(spread.rowH);
  const gap = evenDown(spread.gap);
  const rowStep = rowH + gap;
  const rows: GearUpRowLayout[] = [];
  for (let i = 0; i < rowCount; i++) rows.push(rowLayout(i, { x: pad, y: listY0 + i * rowStep, w: rowW, h: rowH }, rowH));

  const lastBottom = rowCount > 0 ? rows[rows.length - 1].rect.y + rowH : listY0;
  const seamAboveHint = hintBand.y - lastBottom;

  const backBtn = gearUpBackBtn(w);
  const iconY = evenDown(backBtn.y + (backBtn.h - GU_BACK_ICON_BOX) / 2);
  const backIcon: GuRect = { x: backBtn.x + GU_BACK_ICON_DX, y: iconY, w: GU_BACK_ICON_BOX, h: GU_BACK_ICON_BOX };
  const backBaseY = evenDown(rowTextY(backBtn.y, backBtn.h, GU_BACK_PX));
  const backRemainW = backBtn.w - GU_BACK_ICON_DX - GU_BACK_ICON_BOX;
  const dustX = w - pad;
  const subMaxW = evenDown(rowW - GU_DUST_RESERVE_W - GU_TEXT_SLACK);

  return {
    rowCount,
    empty: rowCount === 0,
    showHint: gearCount > GU_ROWS_MAX,
    gearCount,
    rowH,
    rowStep,
    rowGap: gap,
    rows,
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: GU_PANEL_KEY,
    title: { x: pad, baseY: evenDown(rowTextY(bandA.y, bandA.h, GU_TITLE_PX)), maxW: evenDown(backBtn.x - GU_TEXT_SLACK - pad), px: GU_TITLE_PX, align: "left" },
    subtitle: { x: pad, baseY: evenDown(rowTextY(bandB.y, bandB.h, GU_SUB_PX)), maxW: subMaxW, px: GU_SUB_PX, align: "left" },
    stardust: { x: dustX, baseY: evenDown(rowTextY(bandB.y, bandB.h, GU_DUST_PX)), maxW: GU_DUST_RESERVE_W, px: GU_DUST_PX, align: "right" },
    emptyText: { x: pad, baseY: evenDown(rowTextY(listY0, listBottom - listY0, GU_EMPTY_PX)), maxW: rowW, px: GU_EMPTY_PX, align: "left" },
    hint: { x: pad, baseY: evenDown(rowTextY(hintBand.y, hintBand.h, GU_HINT_PX)), maxW: rowW, px: GU_HINT_PX, align: "left" },
    seamAboveHint,
    listY0,
    listBottom,
    backBtn,
    backIcon,
    backTextWithIcon: { x: evenDown(backIcon.x + GU_BACK_ICON_BOX + backRemainW / 2), baseY: backBaseY, maxW: backRemainW, px: GU_BACK_PX, align: "center" },
    backTextBare: { x: evenDown(backBtn.x + backBtn.w / 2), baseY: backBaseY, maxW: backBtn.w, px: GU_BACK_PX, align: "center" },
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数与截断提示都由 `gearCount` 推出) */
export function gearUpScreenLayout(w: number, h: number, gearCount: number): GearUpLayout {
  return gearUpLayout(w, h, gearCount);
}
