/**
 * 委托挂机屏纯几何 —— Web `src/game.ts:commissionLayout`(5001-5023)与 `drawCommissionPanel`
 * (5034-5086)/`drawCommission`(5088-5200)/`onCommissionClick`(5202-5252)的几何部分抽取，
 * 已按像素暗黑翻新的 art 网格重排（`docs/UI-PIXEL-REFRESH.md` §1 / §8 / §11）。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。
 *
 * 纵向骨架是**头部三件 → 两个互斥分支**:
 *  - **头部（两族两带）**：第一带顶缘 16 挂标题横幅（16..58）、小立绘（16..76）与右上返回钮
 *    （16..60）；第二带挂三项读数（基线 104）与兑换钮（80..124）。立绘右缘 396 与兑换钮左缘
 *    394 只在横向上相邻 2px，纵向差 4px，因此两带互不相交；
 *  - **列表态（无活动槽位）**：区域列表顶边锚定 `CM_ROWS_Y0 = 136`，难度行与开始钮底边锚定
 *    `evenDown(h) − pad`。`spreadRows(6, 136, diffY − 24, 52, 88)` 只传五个实参、第六个
 *    `maxGap` 走默认 20，于是 `rowH` 被 88 封顶、`gap` 被 20 封顶 —— 两档设计高（996 / 1246）
 *    下六条区域行的矩形**逐字相同**，屏高的差全部落进 `rowsToDiff` 这道**无硬上限的呼吸缝**；
 *  - **面板态（有活动槽位）**：Web 在 5134 直接 `return`，区域行 / 难度说明 / 难度钮 / 开始钮
 *    一个都不画。面板高 158、间距 12 都是常量，富余落进 `seamBelowPanels`（同样无上限）。
 *    几何层照 Web 一样恒算出列表侧的全部矩形（命中层按分支取用），面板侧条数由入参 `slotCount` 给。
 *
 * 像素栅格（module = 2）：**坐标与尺寸一律偶数**。屏高先 `evenDown`；`spreadRows` 出的 `rowH`
 * 与 `gap` 再各取一次偶；所有基线（横幅标题 / 钮内文字 / 行内两行 / 难度钮两行）都过 `evenDown`。
 * 半宽一律**由宽度推导**：`CM_START_HALF_W = evenDown(CM_START_W / 2)`、难度钮宽
 * `commissionDiffBtnW(rowW) = evenDown((rowW − 4 × 12) / 5)`（标定档 = 96，五枚正好铺满 528，
 * 左起 16、右缘 544）、立绘左缘 `CM_POSE_X = CM_BANNER_X + CM_BANNER_W + CM_POSE_GAP`。
 *
 * 热区一律 ≥ `ui.touchMin = 44`：兑换钮 32 → 44、返回钮 34 → 44、五枚难度钮 42 → 44、
 * 面板内领取 / 放弃钮 36 → 44。钮高抬档吃掉的纵向由 `CM_PANEL_H` 150 → 158 与
 * `CM_PANEL_BTN_DY` 44 → 52 吸收，进度条与钮之间仍留 6、钮底边与面板底边仍留 8。
 *
 * 命中口径(几何侧的事实):热区按 Web 的判定顺序排 —— 返回钮 → (有槽位)逐面板的领取 / 放弃 →
 * (无槽位)区域行 → 难度钮 → 开始钮 → 兑换钮。有槽位那一支 Web 在面板循环之后直接 `return`,
 * 于是**兑换钮虽然照画、却不参与命中**;热区之外的空白没有"其余一律"兜底。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:Web 的 `fillText` 不限宽,这里给的每一档只决定
 * `fitOne` 什么时候补「…」,不改变任何起笔与基线。三项读数与「转生 N 次」的限宽都收到相邻件
 * 起笔前 10px，`转生 N 次` 另外收在兑换钮左缘之前。
 *
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `cm`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { DIFFICULTIES, REGIONS, type RegionId } from "../data/commissions";
import { evenDown, fs, rowTextY, spreadRows, ui } from "./theme";

/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const CM_PAD = 16;
/** 取偶下界住在共享层 `theme.ts`,这里原样再导出,免得每个屏各写一份 */
export { evenDown };

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface CmRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type CmAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface CmTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: CmAlign;
}

/** 区域行(两行布局;行键就是 `REGIONS` 的 id) */
export interface CommissionRowLayout {
  id: RegionId;
  /** `REGIONS` 里的原序下标 */
  index: number;
  /** 行矩形(纯代码底板 + 描边;同时就是本屏的行热区) */
  rect: CmRect;
  /** 第一行基线(`evenDown(r.y + r.h/2 − 4)`) */
  l1: number;
  /** 第二行基线(`l1 + 18`) */
  l2: number;
  /** 区域名(`r.x + 16`,限宽 150,fs.body 加粗) */
  name: CmTextLine;
  /** `${output} · ${unlockNote}`(`r.x + 16`、基线 l2、fs.micro) */
  sub: CmTextLine;
  /** `产出 ${baseRate}/h`(右末笔 `r.x + r.w − 16`、基线 l1、fs.muted;**仅解锁档绘制**) */
  rate: CmTextLine;
}

/** 难度钮(两行固定偏移,不是 rowTextY) */
export interface CommissionDiffLayout {
  level: number;
  index: number;
  rect: CmRect;
  /** `×${mult}`(居中,基线 `d.y + 18`,fs.muted 加粗) */
  mult: CmTextLine;
  /** `${fail%}%败`(居中,基线 `d.y + 34`,fs.micro) */
  fail: CmTextLine;
}

/** 一个进行中槽位的面板(条数 = 活动槽位数,上限 2) */
export interface CommissionPanelLayout {
  /** 面板序号(0 = `commission`,1 = `commission2`;槽位归属由内容层给) */
  index: number;
  /** 羊皮纸底板矩形 = `(pad, y, w − pad×2, panelH)`;Web 走整幅拉伸,不是九宫格 */
  rect: CmRect;
  /** `委托中:… · 难度N`(`pad + 16`、`y + 24`、fs.body 加粗) */
  line1: CmTextLine;
  /** `已进行 … · 有效时长 … · 预计 …`(`pad + 16`、`y + 48`、fs.muted) */
  line2: CmTextLine;
  /** `成功率 …% · 收益前2h 100%,之后降至 50%`(`pad + 16`、`y + 68`、fs.micro) */
  line3: CmTextLine;
  /** 全额收益窗口进度条轨道(`pad + 8`、`y + h − 66`、200×8) */
  bar: CmRect;
  /** 领取钮(热区 + 底板) */
  collect: CmRect;
  collectText: CmTextLine;
  /** 放弃钮(热区 + 底板) */
  abandon: CmRect;
  abandonText: CmTextLine;
}

/** 整屏几何 */
export interface CommissionLayout {
  /** 面板底矩形(panelPad 的九宫格实参矩形) */
  panel: CmRect;
  /** 面板贴图键 —— Web 的 `panelPad(g, w, h)` 不传专属键,故这一档就是 panel_dark_corners */
  panelKey: string;
  /** 标题横幅贴图盒(`banner_title_iron` 固有 169×21 → 338×42 整数倍,左缘落页边距) */
  headerBanner: CmRect;
  /** 有横幅时的标题:横幅内水平居中,基线在带内垂直居中 */
  titleWithBanner: CmTextLine;
  /** 缺图时的标题:左起笔于 pad,基线同一处 */
  titleBare: CmTextLine;
  /** 头部小立绘(横向由横幅右缘推导,让开加宽后的铁带) */
  pose: CmRect;

  /** 词缀碎片读数:图标盒 + 有图 / 缺图两档文字位 */
  fragmentIcon: CmRect;
  fragmentTextWithIcon: CmTextLine;
  fragmentTextBare: CmTextLine;
  /** 星尘读数:同上 */
  stardustIcon: CmRect;
  stardustTextWithIcon: CmTextLine;
  stardustTextBare: CmTextLine;
  /** `转生 N 次`(与两项读数同基线,限宽收在兑换钮左缘之前) */
  prestigesText: CmTextLine;

  /** 兑换钮(热区 + 底板;**绘制与命中都带 `fragments ≥ FRAGMENT_TO_STARDUST` 前置条件**) */
  exchangeBtn: CmRect;
  exchangeText: CmTextLine;

  /** 右上返回钮与两档文字位(skinIconButton 的底板 / 图标 / 文字) */
  backBtn: CmRect;
  backIcon: CmRect;
  backTextWithIcon: CmTextLine;
  backTextBare: CmTextLine;

  /** 活动槽位数(= 面板条数;`> 0` 就是 Web 在 5134 return 的那一支) */
  slotCount: number;
  /** 逐面板几何(长度 = slotCount,上限 2) */
  panels: CommissionPanelLayout[];
  /** 末面板底边到屏底内缩 `pad` 的空档(面板态的无上限呼吸缝;`slotCount = 0` 时为 0) */
  seamBelowPanels: number;

  /** 区域行区顶缘(恒 `CM_ROWS_Y0`) */
  rowsTop: number;
  /** 区域行区预算底缘(`diffY − 24`) */
  rowsBottom: number;
  /** 行高(spreadRows 的第一返回值取偶;被 maxH 88 封顶) */
  rowH: number;
  /** 行距(spreadRows 的第二返回值取偶;被默认 maxGap 20 封顶) */
  rowGap: number;
  /** 行步进 = rowH + gap */
  rowStep: number;
  /** 末行底边 = `rowsTop + (n − 1) × rowStep + rowH` */
  rowsEnd: number;
  /** 末行底边与难度说明基线之间的空档(列表态的无上限呼吸缝,两档屏高的差全落在这里) */
  rowsToDiff: number;
  /** 逐行几何(恒 `REGIONS.length` 条) */
  rows: CommissionRowLayout[];

  /** 难度行顶缘(diffY) */
  diffY: number;
  /** 难度钮宽(由内容宽推导:`evenDown((rowW − 4 × 12) / 5)`,标定档 96) */
  diffBtnW: number;
  /** 难度说明基线(`diffY − 8`) */
  diffLabel: CmTextLine;
  /** 恒 `DIFFICULTIES.length` 枚 */
  diffs: CommissionDiffLayout[];

  /** 开始委托钮(热区 + 底板;描边宽度见 CM_START_STROKE_W) */
  startBtn: CmRect;
  startText: CmTextLine;
}

/* 屏专属几何常量(像素暗黑翻新档:具名一处;坐标与尺寸一律偶数) */
/** 头部第一带顶缘(与页边距同档) */
export const CM_TOP_Y = 16;
/** 标题横幅:宽 / 高 / 左上角(`banner_title_iron` 固有 169×21 → ×2 整数倍,不裁不拉) */
export const CM_BANNER_W = 338;
export const CM_BANNER_H = 42;
export const CM_BANNER_X = CM_PAD;
export const CM_BANNER_Y = CM_TOP_Y;
/** 标题基线:横幅带内垂直居中(`rowTextY(16, 42, 22)` 的取偶档),缺图那一档同一基线 */
export const CM_TITLE_BASE_Y = evenDown(rowTextY(CM_BANNER_Y, CM_BANNER_H, fs.title));
/** 头部小立绘:相对横幅右缘的让位 / 宽 / 高 / 顶缘(左缘因此由横幅推导,不留第二个事实源) */
export const CM_POSE_GAP = 4;
export const CM_POSE_X = CM_BANNER_X + CM_BANNER_W + CM_POSE_GAP;
export const CM_POSE_Y = CM_TOP_Y;
export const CM_POSE_W = 38;
export const CM_POSE_H = 60;
/** 两项读数:基线 / 图标边长(原档 13 是奇数,取偶到 14)/ 图标相对基线的上抬 / 图标与文字间距 / 两枚的横向起笔 */
export const CM_RES_BASE_Y = 104;
export const CM_ICON_SIZE = 14;
export const CM_ICON_DY = 2;
export const CM_ICON_TEXT_DX = 4;
export const CM_STARDUST_DX = 130;
/** `转生 N 次` 相对 pad 的横向偏移 */
export const CM_PRESTIGES_DX = 250;
/** 兑换钮:顶缘 / 宽 / 高(高抬到热区下限 44,原档 32 不够一档) */
export const CM_EXCHANGE_Y = 80;
export const CM_EXCHANGE_W = 150;
export const CM_EXCHANGE_H = Math.max(ui.touchMin, 32);
/** 返回钮:顶缘 / 高(抬到热区下限 44)/ 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const CM_BACK_Y = CM_TOP_Y;
export const CM_BACK_H = Math.max(ui.touchMin, ui.backH);
export const CM_BACK_ICON_DX = 4;
export const CM_BACK_ICON_SHRINK = 12;
export const CM_BACK_TEXT_DY = 5;
/** 开始委托钮:宽 / 半宽(**由宽推导**)/ 高 / 底缘相对 `evenDown(h) − pad` 的上抬 */
export const CM_START_W = 260;
export const CM_START_HALF_W = evenDown(CM_START_W / 2);
export const CM_START_H = 52;
export const CM_START_UP = 52;
/** 难度行底缘 → 开始钮顶缘的缝,与难度钮高(高抬到热区下限 44,原档 42 不够一档) */
export const CM_DIFF_GAP_Y = 28;
export const CM_DIFF_H = Math.max(ui.touchMin, 42);
/** 难度钮枚数 / 横向间距 / 钮内两行的固定偏移(不走 rowTextY;两档都取偶) */
export const CM_DIFF_N = 5;
export const CM_DIFF_GAP_X = 12;
export const CM_DIFF_TEXT_DY1 = 18;
export const CM_DIFF_TEXT_DY2 = 34;
/** 区域行区顶缘与预算底缘的让位 */
export const CM_ROWS_Y0 = 136;
export const CM_ROWS_BOTTOM_DY = 24;
/** 行高钳制两档(spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const CM_ROW_MIN_H = 52;
export const CM_ROW_MAX_H = 88;
/** 难度说明基线相对 diffY 的上抬 */
export const CM_DIFF_LABEL_DY = 8;
/** 区域行两行布局的两个加数(都取偶:`l1 = evenDown(y + h/2 − 4)`、`l2 = l1 + 18`) */
export const CM_L1_DY = 4;
export const CM_L2_DY = 18;
/** 行内三处偏移:名字与第二行起笔 / 右对齐产出末笔内缩 / 名字限宽 */
export const CM_ROW_TEXT_DX = 16;
export const CM_ROW_RIGHT_DX = 16;
export const CM_NAME_MAX_W = 150;
/** 面板:高 / 顶缘 / 面板间距(高 150 → 158 是为了吃下抬到 44 的钮高,底缘内缩仍是 8) */
export const CM_PANEL_H = 158;
export const CM_PANEL_TOP_Y = 136;
export const CM_PANEL_GAP = 12;
/** 面板内三行基线的加数与起笔内缩(与页边距同族,三档基线都是偶数) */
export const CM_PANEL_LINE1_DY = 24;
export const CM_PANEL_LINE2_DY = 48;
export const CM_PANEL_LINE3_DY = 68;
export const CM_PANEL_TEXT_DX = 16;
/** 进度条:相对面板底的让位 / 起笔内缩 / 宽 / 高 */
export const CM_BAR_DY = 66;
export const CM_BAR_DX = 8;
export const CM_BAR_W = 200;
export const CM_BAR_H = 8;
/** 面板两枚钮:相对面板底的让位 / 宽 / 高(抬到热区下限 44)/ 两枚之间的间距 */
export const CM_PANEL_BTN_DY = 52;
export const CM_PANEL_BTN_W = 112;
export const CM_PANEL_BTN_H = Math.max(ui.touchMin, 36);
export const CM_PANEL_BTN_GAP = 8;
/** 开始委托钮的描边宽度(Web 把 lineWidth 临时设 2 再复位 1) */
export const CM_START_STROKE_W = 2;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参;Cocos 侧由 `ViewTable.borderOf` 按图推导,本层只留作断言锚点) */
export const CM_PANEL_NINE = 32;
/** 字号档(全在 `fs` 表内) */
export const CM_TITLE_PX = fs.title;
export const CM_RES_PX = fs.muted;
export const CM_EXCHANGE_PX = fs.muted;
export const CM_BACK_PX = fs.body;
export const CM_PANEL_LINE1_PX = fs.body;
export const CM_PANEL_LINE2_PX = fs.muted;
export const CM_PANEL_LINE3_PX = fs.micro;
export const CM_ROW_NAME_PX = fs.body;
export const CM_ROW_SUB_PX = fs.micro;
export const CM_ROW_RATE_PX = fs.muted;
export const CM_DIFF_LABEL_PX = fs.micro;
export const CM_DIFF_MULT_PX = fs.muted;
export const CM_DIFF_FAIL_PX = fs.micro;
export const CM_START_PX = fs.section;
/** 文本带限宽与相邻文本之间留的余量(Cocos 侧口径;Web 的 fillText 不限宽) */
export const TEXT_SLACK = 10;

/** 难度钮宽:由内容宽推导(`(rowW − 4 × 12) / 5`,标定档 96 → 五枚正好铺满 528) */
export function commissionDiffBtnW(rowW: number): number {
  return evenDown((rowW - (CM_DIFF_N - 1) * CM_DIFF_GAP_X) / CM_DIFF_N);
}

/** 开始委托钮矩形(`x = evenDown(w/2) − 半宽`、`y = evenDown(h) − pad − 52`;底边锚定 h) */
export function commissionStartBtn(w: number, h: number): CmRect {
  return { x: evenDown(w / 2) - CM_START_HALF_W, y: evenDown(h) - CM_PAD - CM_START_UP, w: CM_START_W, h: CM_START_H };
}

/** 难度行顶缘(`startBtn.y − 28 − 44`;随开始钮一起底边锚定) */
export function commissionDiffY(w: number, h: number): number {
  return commissionStartBtn(w, h).y - CM_DIFF_GAP_Y - CM_DIFF_H;
}

/** 区域行区预算底缘(spreadRows 的第三实参 `diffY − 24`) */
export function commissionRowsBottom(w: number, h: number): number {
  return commissionDiffY(w, h) - CM_ROWS_BOTTOM_DY;
}

/** 返回钮矩形(右缘恒落 `w − CM_PAD`;热区抬到 `ui.touchMin`) */
export function commissionBackBtn(w: number): CmRect {
  return { x: w - CM_PAD - ui.backW, y: CM_BACK_Y, w: ui.backW, h: CM_BACK_H };
}

/** 兑换钮矩形(右缘恒落 `w − CM_PAD`;热区抬到 `ui.touchMin`) */
export function commissionExchangeBtn(w: number): CmRect {
  return { x: w - CM_PAD - CM_EXCHANGE_W, y: CM_EXCHANGE_Y, w: CM_EXCHANGE_W, h: CM_EXCHANGE_H };
}

/** 进度条的两档口径(与 gacha 的 `gachaBarRects` 同式,对标 Web `skinBar` 与它的缺图回退) */
export interface CmBarRects {
  /** 缺图档的代码填充:从左起画 `fillW`(宽度过 `evenDown`,落在 art 网格上) */
  fill: CmRect;
  /** 贴图档盖住空缺的暗罩:填满时为 null(Web skinBar 的 `if (f < 1)` 才画) */
  cover: CmRect | null;
}

/**
 * Web 传给 `skinBar` 的是**未钳制**的 `hours / 2`,钳制发生在 `skinBar` 内部
 * (`f = min(1, max(0, frac))`);缺图回退分支则自己写了 `Math.min(1, hours / 2)`。
 * 两条路径的钳制落点不同、结果同值,这里按同一份钳制后的 frac 折出两档矩形,
 * 填充宽先取偶、暗罩从填充右缘起画,于是两档的接缝恒落在 art 网格上且不漏底。
 */
export function commissionBarRects(track: CmRect, frac: number): CmBarRects {
  const f = Math.min(1, Math.max(0, frac));
  const fillW = evenDown(track.w * f);
  return {
    fill: { x: track.x, y: track.y, w: fillW, h: track.h },
    cover: fillW < track.w ? { x: track.x + fillW, y: track.y, w: track.w - fillW, h: track.h } : null,
  };
}

function rowLayout(id: RegionId, index: number, rect: CmRect): CommissionRowLayout {
  const l1 = evenDown(rect.y + rect.h / 2 - CM_L1_DY);
  const l2 = l1 + CM_L2_DY;
  const leftX = rect.x + CM_ROW_TEXT_DX;
  const rightX = rect.x + rect.w - CM_ROW_RIGHT_DX;
  return {
    id,
    index,
    rect,
    l1,
    l2,
    name: { x: leftX, baseY: l1, maxW: CM_NAME_MAX_W, px: CM_ROW_NAME_PX, align: "left" },
    sub: { x: leftX, baseY: l2, maxW: evenDown(rect.w - CM_ROW_TEXT_DX * 2), px: CM_ROW_SUB_PX, align: "left" },
    rate: { x: rightX, baseY: l1, maxW: evenDown(rect.w - CM_ROW_TEXT_DX - CM_NAME_MAX_W - TEXT_SLACK), px: CM_ROW_RATE_PX, align: "right" },
  };
}

function diffLayout(level: number, index: number, rect: CmRect): CommissionDiffLayout {
  const cx = evenDown(rect.x + rect.w / 2);
  return {
    level,
    index,
    rect,
    mult: { x: cx, baseY: rect.y + CM_DIFF_TEXT_DY1, maxW: rect.w, px: CM_DIFF_MULT_PX, align: "center" },
    fail: { x: cx, baseY: rect.y + CM_DIFF_TEXT_DY2, maxW: rect.w, px: CM_DIFF_FAIL_PX, align: "center" },
  };
}

function panelLayout(index: number, w: number, y: number): CommissionPanelLayout {
  const rect: CmRect = { x: CM_PAD, y, w: w - CM_PAD * 2, h: CM_PANEL_H };
  const textX = CM_PAD + CM_PANEL_TEXT_DX;
  const textW = evenDown(rect.w - CM_PANEL_TEXT_DX * 2);
  const btnY = y + rect.h - CM_PANEL_BTN_DY;
  const collect: CmRect = { x: w - CM_PAD - 2 * CM_PANEL_BTN_W - CM_PANEL_BTN_GAP, y: btnY, w: CM_PANEL_BTN_W, h: CM_PANEL_BTN_H };
  const abandon: CmRect = { x: w - CM_PAD - CM_PANEL_BTN_W, y: btnY, w: CM_PANEL_BTN_W, h: CM_PANEL_BTN_H };
  const btnText = (r: CmRect): CmTextLine => ({ x: evenDown(r.x + r.w / 2), baseY: evenDown(rowTextY(r.y, r.h, CM_PANEL_LINE1_PX)), maxW: r.w, px: CM_PANEL_LINE1_PX, align: "center" });
  return {
    index,
    rect,
    line1: { x: textX, baseY: y + CM_PANEL_LINE1_DY, maxW: textW, px: CM_PANEL_LINE1_PX, align: "left" },
    line2: { x: textX, baseY: y + CM_PANEL_LINE2_DY, maxW: textW, px: CM_PANEL_LINE2_PX, align: "left" },
    line3: { x: textX, baseY: y + CM_PANEL_LINE3_DY, maxW: textW, px: CM_PANEL_LINE3_PX, align: "left" },
    bar: { x: CM_PAD + CM_BAR_DX, y: y + rect.h - CM_BAR_DY, w: CM_BAR_W, h: CM_BAR_H },
    collect,
    collectText: btnText(collect),
    abandon,
    abandonText: btnText(abandon),
  };
}

/**
 * 整屏几何。`slotCount` 就是 `activeCommissionSlots().length`(0 / 1 / 2),由宿主投影传入,
 * 本层不读存档、不查天赋。
 *
 * 区域行区预算是 `[136, diffY − 24]`,`spreadRows` 把 `rowH` 钳在 52..88、`gap` 上限 20。
 * 六行恒不越界:两档设计高下 `rowH` 与 `gap` 同时顶到上限,于是矩形逐字相同,
 * 屏高的差全部落在 `rowsToDiff` 这一段空档里(数字见 `tests/cocos-phase4-commission.test.ts`)。
 */
export function commissionLayout(w: number, h: number, slotCount: number): CommissionLayout {
  const hh = evenDown(h);
  const pad = CM_PAD;
  const rowW = w - pad * 2;
  const startBtn = commissionStartBtn(w, hh);
  const diffY = commissionDiffY(w, hh);
  const rowsBottom = commissionRowsBottom(w, hh);

  const spread = spreadRows(REGIONS.length, CM_ROWS_Y0, rowsBottom, CM_ROW_MIN_H, CM_ROW_MAX_H);
  const rowH = evenDown(spread.rowH);
  const gap = evenDown(spread.gap);
  const rowStep = rowH + gap;
  const rows: CommissionRowLayout[] = [];
  for (let i = 0; i < REGIONS.length; i++) rows.push(rowLayout(REGIONS[i].id, i, { x: pad, y: CM_ROWS_Y0 + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = rows.length > 0 ? CM_ROWS_Y0 + (rows.length - 1) * rowStep + rowH : CM_ROWS_Y0;

  const bw = commissionDiffBtnW(rowW);
  const diffs: CommissionDiffLayout[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) diffs.push(diffLayout(DIFFICULTIES[i].level, i, { x: pad + i * (bw + CM_DIFF_GAP_X), y: diffY, w: bw, h: CM_DIFF_H }));

  const panels: CommissionPanelLayout[] = [];
  for (let i = 0; i < slotCount; i++) panels.push(panelLayout(i, w, CM_PANEL_TOP_Y + i * (CM_PANEL_H + CM_PANEL_GAP)));
  const lastPanel = panels[panels.length - 1];
  const seamBelowPanels = lastPanel ? hh - pad - (lastPanel.rect.y + lastPanel.rect.h) : 0;

  const backBtn = commissionBackBtn(w);
  const iconH = backBtn.h - CM_BACK_ICON_SHRINK;
  const backIcon: CmRect = { x: backBtn.x + CM_BACK_ICON_DX, y: evenDown(backBtn.y + (backBtn.h - iconH) / 2), w: iconH, h: iconH };
  const backBaseY = evenDown(backBtn.y + backBtn.h / 2 + CM_BACK_TEXT_DY);
  const backRemainW = backBtn.w - CM_BACK_ICON_DX - iconH;

  const exchangeBtn = commissionExchangeBtn(w);
  const headerBanner: CmRect = { x: CM_BANNER_X, y: CM_BANNER_Y, w: CM_BANNER_W, h: CM_BANNER_H };

  const iconRect = (x: number): CmRect => ({ x, y: CM_RES_BASE_Y - CM_ICON_SIZE + CM_ICON_DY, w: CM_ICON_SIZE, h: CM_ICON_SIZE });
  const fragX = pad;
  const starX = pad + CM_STARDUST_DX;
  const prestX = pad + CM_PRESTIGES_DX;
  const resLine = (x: number, maxW: number): CmTextLine => ({ x, baseY: CM_RES_BASE_Y, maxW: evenDown(maxW), px: CM_RES_PX, align: "left" });

  return {
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    titleWithBanner: { x: evenDown(headerBanner.x + headerBanner.w / 2), baseY: CM_TITLE_BASE_Y, maxW: evenDown(headerBanner.w), px: CM_TITLE_PX, align: "center" },
    titleBare: { x: pad, baseY: CM_TITLE_BASE_Y, maxW: evenDown(CM_POSE_X - TEXT_SLACK - pad), px: CM_TITLE_PX, align: "left" },
    pose: { x: CM_POSE_X, y: CM_POSE_Y, w: CM_POSE_W, h: CM_POSE_H },
    fragmentIcon: iconRect(fragX),
    fragmentTextWithIcon: resLine(fragX + CM_ICON_SIZE + CM_ICON_TEXT_DX, starX - TEXT_SLACK - (fragX + CM_ICON_SIZE + CM_ICON_TEXT_DX)),
    fragmentTextBare: resLine(fragX, starX - TEXT_SLACK - fragX),
    stardustIcon: iconRect(starX),
    stardustTextWithIcon: resLine(starX + CM_ICON_SIZE + CM_ICON_TEXT_DX, prestX - TEXT_SLACK - (starX + CM_ICON_SIZE + CM_ICON_TEXT_DX)),
    stardustTextBare: resLine(starX, prestX - TEXT_SLACK - starX),
    prestigesText: resLine(prestX, exchangeBtn.x - TEXT_SLACK - prestX),
    exchangeBtn,
    exchangeText: { x: evenDown(exchangeBtn.x + exchangeBtn.w / 2), baseY: evenDown(rowTextY(exchangeBtn.y, exchangeBtn.h, CM_EXCHANGE_PX)), maxW: exchangeBtn.w, px: CM_EXCHANGE_PX, align: "center" },
    backBtn,
    backIcon,
    backTextWithIcon: { x: evenDown(backBtn.x + CM_BACK_ICON_DX + iconH + backRemainW / 2), baseY: backBaseY, maxW: backRemainW, px: CM_BACK_PX, align: "center" },
    backTextBare: { x: evenDown(backBtn.x + backBtn.w / 2), baseY: backBaseY, maxW: backBtn.w, px: CM_BACK_PX, align: "center" },
    slotCount,
    panels,
    seamBelowPanels,
    rowsTop: CM_ROWS_Y0,
    rowsBottom,
    rowH,
    rowGap: gap,
    rowStep,
    rowsEnd,
    rowsToDiff: diffY - CM_DIFF_LABEL_DY - rowsEnd,
    rows,
    diffY,
    diffBtnW: bw,
    diffLabel: { x: pad, baseY: diffY - CM_DIFF_LABEL_DY, maxW: rowW, px: CM_DIFF_LABEL_PX, align: "left" },
    diffs,
    startBtn,
    startText: { x: evenDown(startBtn.x + startBtn.w / 2), baseY: evenDown(rowTextY(startBtn.y, startBtn.h, CM_START_PX)), maxW: startBtn.w, px: CM_START_PX, align: "center" },
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;面板条数由入参推出,本层不读存档) */
export function commissionScreenLayout(w: number, h: number, slotCount: number): CommissionLayout {
  return commissionLayout(w, h, slotCount);
}
