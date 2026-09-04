/**
 * 装备升级屏纯几何 —— Web `src/game.ts:drawGearUp`(3887-3977)与 `onGearUpClick`(3979-4000)
 * 的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - **Web 的 `private gearRows` 是 draw 时写下的侧信道**(每行存 `{rect, btn, idx}`,click 只读
 *    它)。这里不留那条通道:行矩形由本函数按 `gearCount` 现算,绘制与命中同源同一份 rows;
 *  - 面板贴图键是 `panel_gearup`(daily / pass 走默认面板),内缩与 `panelPad` 同档:
 *    `(pad, pad, w − pad×2, h − pad×2)`,九宫格切深 32,缺图回落 `panel_dark_corners`;
 *  - 标题是**纯文字**,没有横幅贴图(daily 是 `banner_title_gold_c`、pass 是 `banner_title_gold_b`),
 *    起笔 `(pad, 36)`、`fs.title` 加粗;副标题在 `(pad, 56)`、`fs.muted`;
 *  - 右上星尘是**右对齐**,末笔锚点 `w − pad`、基线 36、`fs.body` 加粗 —— 与返回钮
 *    `(w − pad − backW, 22, backW, backH)` 的矩形纵向重叠,Web 的绘制顺序是先文字后按钮,
 *    于是这一串会被返回钮盖住。本层照抄该顺序与坐标,**不在几何层修**;
 *  - 列表顶缘 `y0 = 78`,行区底缘 `h − pad − 8`,行高 `spreadRows(n, y0, h − pad − 8, 40, 56)`
 *    —— **五个实参**(pass 是六个),第六个 `maxGap` 走默认 20,而 Web 把返回的 `gap` **丢弃**,
 *    行距用的是硬编码 4,所以这里给出的是 `rowStep = rowH + 4` 而不是 `rowH + gap`;
 *  - 行底板是**品质框**(`drawQualityFrame(rect.x, rect.y, rect.w, rect.h, qualityDef(q).color)`,
 *    圆角 4、无顶栏),不是 `skinButtonBase`;描边参数(圆角 / 线宽 / 内缩)在 Web 侧是
 *    `src/ui/skin.ts:215` 的函数体内联值,Cocos 侧的同款实现在 `ui/PanelKit.ts:qualityBox`,
 *    两处线宽与内缩已按那个实参对齐,本层只给矩形;
 *  - 行内左列两行文本起笔都是 `rect.x + 10`,限宽 230 / 320 就是 Web `fitOne` 的第二个实参;
 *    基线分别是 `rowTextY(rect.y, rect.h, fs.body)` 与 `rowTextY(rect.y, rect.h, fs.micro) + 14`
 *    (那个 14 是 Web 的裸加数,不是行距口径);
 *  - 升级钮 `{ x: rect.x + rect.w − 100, y: rect.y + (rect.h − min(rowH − 8, 30)) / 2, w: 90,
 *    h: min(rowH − 8, 30) }` —— 高在 `rect.h` 与 `rowH` 同值的当下写成 `min(rowH − 8, 30)`,
 *    原样保留(行高被钳到 40 时钮高 30,行高 56 时也是 30);
 *  - 星级徽记在按钮**左侧**:`GU_STAR_BOX = 12`、`GU_STAR_GAP = 3`、
 *    `sx0 = btn.x − (GEAR_UPGRADE_MAX × 12 + (GEAR_UPGRADE_MAX − 1) × 3) − 10`、
 *    `sy0 = rect.y + (rect.h − 12) / 2`,第 s 颗落在 `sx0 + s × 15`;颗数就是 `GEAR_UPGRADE_MAX`;
 *    缺图回退的文字星基线 `sy0 + starS − 2`,左对齐于该颗左沿;
 *  - 截断提示 `(pad, h − pad − 10)`、`fs.micro`,**仅 `gearCount > GU_ROWS_MAX` 时存在**;
 *  - 空态(`gearCount === 0`)只有一行 `(pad, h / 2)` 的 `fs.body` 文字,此时**没有行、
 *    没有品质框、也没有截断提示**,`rows` 为空数组;
 *  - 返回钮 `(w − pad − backW, 22, backW, backH)` 叠 `btn_back` 图标,文字 x 随图标在否改变
 *    (Web `skinIconButton` 的 `hasIcon` 分支),于是两档文字线都摆在几何里。
 *
 * 命中口径(几何侧的事实):`rows[i].btn` 是本屏唯一的行内热区,**行 `rect` 不参与命中** ——
 * 与 pass 的"点任意非热区都领下一档"正相反。点行内非按钮区域什么都不发生。
 *
 * 文本行(`GuTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 颜色与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `gu`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { GEAR_UPGRADE_MAX } from "../data/daily";
import { fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface GuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type GuAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface GuTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: GuAlign;
}

/** 一个装备行的几何:品质框矩形 + 两行左对齐文本 + 升级钮与钮文 + 五颗徽记 */
export interface GearUpRowLayout {
  /** 对应 `ownedGear` 的下标(Web `gearRows[i].idx`,即 `list` 的原序下标) */
  index: number;
  /** 品质框矩形(Web 侧只用于绘制;命中不看它 —— 见文件头的命中口径) */
  rect: GuRect;
  /** 本屏唯一的行内热区(Web `onGearUpClick` 只遍历这个矩形) */
  btn: GuRect;
  /** 徽记槽(长度 = GEAR_UPGRADE_MAX,逐颗左→右;点亮颗数由内容层的 lv 门控) */
  stars: GuRect[];
  /** 名字(Web:rect.x + 10,rowTextY(rect.y, rect.h, fs.body),body 加粗,限宽 230) */
  name: GuTextLine;
  /** 描述(Web:rect.x + 10,rowTextY(...micro) + 14,micro,限宽 320;文字内容由模型给) */
  desc: GuTextLine;
  /** 钮文(Web:textAlign center、x = btn.x + btn.w / 2、rowTextY(btn.y, btn.h, fs.micro)、micro 加粗) */
  btnText: GuTextLine;
  /** 徽记缺图回退的文字星基线(`sy0 + GU_STAR_BOX − 2`,逐颗同 x,与 stars 一一对应) */
  starGlyphBaseY: number;
  /** 文字星的字号(Web `F(fs.micro)`) */
  starGlyphPx: number;
}

/** 整屏几何 */
export interface GearUpLayout {
  /** 行数 = `min(gearCount, GU_ROWS_MAX)`;0 即空态 */
  rowCount: number;
  /** `gearCount === 0`(Web 的 `ownedGear.length === 0` 分支:只有一行提示,无行无截断提示) */
  empty: boolean;
  /** `gearCount > GU_ROWS_MAX`(硬截断,故有"仅显示前 14 件"一行) */
  showHint: boolean;
  /** 收藏总件数(截断提示的分母;绘制与命中都不参与) */
  gearCount: number;
  /** 行高(spreadRows 的第一返回值;空态为 0) */
  rowH: number;
  /** 行距步进 = rowH + GU_ROW_STEP_GAP(Web 丢弃 spreadRows 的 gap,硬编码 4) */
  rowStep: number;
  /** spreadRows 的 gap(Web 未使用,给出来是为了让"行距 4 ≠ gap 20"这条口径可断言) */
  rowGap: number;
  rows: GearUpRowLayout[];
  /** 面板底矩形(panelPad 的九宫格实参矩形) */
  panel: GuRect;
  /** 面板贴图键与回落键(Web panelPad 的 `key` 命中失败后回落 panel_dark_corners) */
  panelKey: string;
  panelKeyFallback: string;
  /** 标题(Web 没有横幅,只有一档线位) */
  title: GuTextLine;
  /** 副标题 */
  subtitle: GuTextLine;
  /** 右上星尘(右对齐,末笔 = w − pad;与返回钮矩形重叠是 Web 原样) */
  stardust: GuTextLine;
  /** 空态提示(仅 empty 为真时存在) */
  emptyText: GuTextLine;
  /** 截断提示(仅 showHint 为真时存在) */
  hint: GuTextLine;
  /** 右上返回钮矩形与两档文字位 */
  backBtn: GuRect;
  /** 返回钮图标位(Web skinIconButton 的 `x+4, y+(h−ih)/2, ih, ih`,`ih = h − 12`) */
  backIcon: GuRect;
  /** 返回钮文字:有图标时居中于图标右侧剩余空间 */
  backTextWithIcon: GuTextLine;
  /** 返回钮文字:缺图时整体居中 */
  backTextBare: GuTextLine;
}

/* Web drawGearUp 的内联几何常量(屏专属常量在本文件顶部具名一处) */
/** 列表硬截断件数(Web `gear.slice(0, 14)` 与提示文案里的同一个 14) */
export const GU_ROWS_MAX = 14;
/** 列表顶缘(Web `const y0 = 78`) */
export const GU_LIST_Y0 = 78;
/** 行区底缘的额外让位(Web spreadRows 的第三实参 `h - pad - 8`) */
export const GU_LIST_BOTTOM_EXTRA = 8;
/** 行高钳制两档(Web spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const GU_ROW_MIN_H = 40;
export const GU_ROW_MAX_H = 56;
/** 行距步进里的硬编码间距(Web `y0 + idx * (rowH + 4)`,与 spreadRows 的 gap 无关) */
export const GU_ROW_STEP_GAP = 4;
/** 标题 / 副标题 / 星尘三条线的基线(Web 的 36 / 56 / 36) */
export const GU_TITLE_BASE_Y = 36;
export const GU_SUB_BASE_Y = 56;
export const GU_DUST_BASE_Y = 36;
/** 行内两行文本的起笔偏移与两处限宽(Web fitOne 的第二实参) */
export const GU_TEXT_DX = 10;
export const GU_NAME_MAXW = 230;
export const GU_DESC_MAXW = 320;
/** 描述相对 micro 字号居中基线的裸加数(Web `rowTextY(..., fs.micro) + 14`) */
export const GU_DESC_DY = 14;
/** 升级钮:右缘内缩(= 钮宽 + 10 的留白)/ 钮宽 / 高相对行高的上下让位 / 高上限 */
export const GU_BTN_INSET = 100;
export const GU_BTN_W = 90;
export const GU_BTN_V_INSET = 8;
export const GU_BTN_MAX_H = 30;
/** 徽记:边长 / 颗间距 / 整条徽记带与按钮之间的间隙 */
export const GU_STAR_BOX = 12;
export const GU_STAR_GAP = 3;
export const GU_STAR_BTN_GAP = 10;
/** 徽记缺图回退的文字星基线相对徽记底缘的上抬(Web `sy0 + starS - 2`) */
export const GU_STAR_GLYPH_DY = 2;
/** 空态提示的基线就是屏高一半(Web `h / 2`) */
export const GU_EMPTY_HALF = 2;
/** 截断提示贴底让位(Web `h - pad - 10`) */
export const GU_HINT_BOTTOM_EXTRA = 10;
/** 返回钮顶缘 / 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const GU_BACK_Y = 22;
export const GU_BACK_ICON_DX = 4;
export const GU_BACK_ICON_SHRINK = 12;
export const GU_BACK_TEXT_DY = 5;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参) */
export const GU_PANEL_NINE = 32;

/** 升级钮高度(Web 的 `Math.min(rowH - 8, 30)`,行高与钮高同处一个表达式) */
export function gearBtnHeight(rowH: number): number {
  return Math.min(rowH - GU_BTN_V_INSET, GU_BTN_MAX_H);
}

/** 徽记带总宽(`GEAR_UPGRADE_MAX` 颗 + 之间的 `GU_STAR_BOX − 1` 条缝) */
export function gearStarStripW(): number {
  return GEAR_UPGRADE_MAX * GU_STAR_BOX + (GEAR_UPGRADE_MAX - 1) * GU_STAR_GAP;
}

function rowLayout(index: number, rect: GuRect, rowH: number): GearUpRowLayout {
  const btnH = gearBtnHeight(rowH);
  const btn: GuRect = { x: rect.x + rect.w - GU_BTN_INSET, y: rect.y + (rect.h - btnH) / 2, w: GU_BTN_W, h: btnH };
  const sx0 = btn.x - gearStarStripW() - GU_STAR_BTN_GAP;
  const sy0 = rect.y + (rect.h - GU_STAR_BOX) / 2;
  const stars: GuRect[] = [];
  for (let s = 0; s < GEAR_UPGRADE_MAX; s++) stars.push({ x: sx0 + s * (GU_STAR_BOX + GU_STAR_GAP), y: sy0, w: GU_STAR_BOX, h: GU_STAR_BOX });
  const nameX = rect.x + GU_TEXT_DX;
  return {
    index,
    rect,
    btn,
    stars,
    name: { x: nameX, baseY: rowTextY(rect.y, rect.h, fs.body), maxW: GU_NAME_MAXW, px: fs.body, align: "left" },
    desc: { x: nameX, baseY: rowTextY(rect.y, rect.h, fs.micro) + GU_DESC_DY, maxW: GU_DESC_MAXW, px: fs.micro, align: "left" },
    btnText: { x: btn.x + btn.w / 2, baseY: rowTextY(btn.y, btn.h, fs.micro), maxW: btn.w, px: fs.micro, align: "center" },
    starGlyphBaseY: sy0 + GU_STAR_BOX - GU_STAR_GLYPH_DY,
    starGlyphPx: fs.micro,
  };
}

/**
 * 整屏几何。行数与截断提示都由 `gearCount`(= `ownedGear.length`)推出:
 * 0 → 空态(无行、无提示),1..GU_ROWS_MAX → 列表无提示,> GU_ROWS_MAX → 列表 + 提示。
 * 屏高收 `h`(行区在 `[78, h − pad − 8]` 内按 rowH 摊开,996 与 1246 两档都成立 ——
 * `rowH` 被钳到 `GU_ROW_MAX_H` 后行区底缘不再随屏高移动,富余落在列表尾留白)。
 */
export function gearUpLayout(w: number, h: number, gearCount: number): GearUpLayout {
  const pad = ui.pad;
  const rowW = w - pad * 2;
  const rowCount = Math.max(0, Math.min(gearCount, GU_ROWS_MAX));
  // Web 只在非空分支调 spreadRows;n = 0 时它返回 rowH 0,与"不调"同值,故这里共用一次调用
  const { rowH, gap } = spreadRows(rowCount, GU_LIST_Y0, h - pad - GU_LIST_BOTTOM_EXTRA, GU_ROW_MIN_H, GU_ROW_MAX_H);
  const rowStep = rowH + GU_ROW_STEP_GAP;
  const rows: GearUpRowLayout[] = [];
  for (let i = 0; i < rowCount; i++) rows.push(rowLayout(i, { x: pad, y: GU_LIST_Y0 + i * rowStep, w: rowW, h: rowH }, rowH));

  const backBtn: GuRect = { x: w - pad - ui.backW, y: GU_BACK_Y, w: ui.backW, h: ui.backH };
  const iconH = backBtn.h - GU_BACK_ICON_SHRINK;
  const backIcon: GuRect = { x: backBtn.x + GU_BACK_ICON_DX, y: backBtn.y + (backBtn.h - iconH) / 2, w: iconH, h: iconH };
  const backBaseY = backBtn.y + backBtn.h / 2 + GU_BACK_TEXT_DY;
  const backRemainW = backBtn.w - GU_BACK_ICON_DX - iconH;
  return {
    rowCount,
    empty: rowCount === 0,
    showHint: gearCount > GU_ROWS_MAX,
    gearCount,
    rowH,
    rowStep,
    rowGap: gap,
    rows,
    panel: { x: pad, y: pad, w: rowW, h: h - pad * 2 },
    panelKey: "panel_gearup",
    panelKeyFallback: "panel_dark_corners",
    title: { x: pad, baseY: GU_TITLE_BASE_Y, maxW: rowW, px: fs.title, align: "left" },
    subtitle: { x: pad, baseY: GU_SUB_BASE_Y, maxW: rowW, px: fs.muted, align: "left" },
    stardust: { x: w - pad, baseY: GU_DUST_BASE_Y, maxW: rowW, px: fs.body, align: "right" },
    emptyText: { x: pad, baseY: h / GU_EMPTY_HALF, maxW: rowW, px: fs.body, align: "left" },
    hint: { x: pad, baseY: h - pad - GU_HINT_BOTTOM_EXTRA, maxW: rowW, px: fs.micro, align: "left" },
    backBtn,
    backIcon,
    backTextWithIcon: { x: backBtn.x + GU_BACK_ICON_DX + iconH + backRemainW / 2, baseY: backBaseY, maxW: backRemainW, px: fs.body, align: "center" },
    backTextBare: { x: backBtn.x + backBtn.w / 2, baseY: backBaseY, maxW: backBtn.w, px: fs.body, align: "center" },
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数与截断提示都由 `gearCount` 推出) */
export function gearUpScreenLayout(w: number, h: number, gearCount: number): GearUpLayout {
  return gearUpLayout(w, h, gearCount);
}
