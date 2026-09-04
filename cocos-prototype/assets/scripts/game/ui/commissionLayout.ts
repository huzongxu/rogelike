/**
 * 委托挂机屏纯几何 —— Web `src/game.ts:commissionLayout`(5001-5023)与 `drawCommissionPanel`
 * (5034-5086)/`drawCommission`(5088-5200)/`onCommissionClick`(5202-5252)的几何部分抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - **区域列表顶边锚定、难度行与开始钮底边锚定**,两者之间不吃满:
 *    `startBtn = { x: w/2 − 130, y: h − pad − 52, w: 260, h: 52 }`、`diffY = startBtn.y − 30 − 42`,
 *    区域行 `spreadRows(REGIONS.length, 100, diffY − 24, 52, 88)` —— **只传五个实参**,
 *    第六个 `maxGap` 走默认 20。`rowH` 被 `maxH = 88` 封顶、`gap` 被 20 封顶,于是两档设计高
 *    (996 / 1246)下区域行的矩形**逐字相同**,屏高只把难度行与开始钮往下推 —— 多出来的高度
 *    全部落在末行底边与难度说明基线之间的空档里;
 *  - 行 `y = 100 + i × (rowH + gap)`、`x = pad`、`w = w − pad×2`、`h = rowH`;
 *  - 难度钮 `bw = (w − pad×2 − 4×8)/5`,恒五枚(`DIFFICULTIES` 的长度),`x = pad + i×(bw+8)`、
 *    `y = diffY`、`h = 42`;
 *  - **两个分支的矩形互斥**:有活动槽位时 Web 在 5134 直接 `return`,区域行 / 难度说明 / 难度钮 /
 *    开始钮一个都不画;没有槽位时面板一个都不画。几何层照 Web 的 `commissionLayout()` 一样
 *    恒算出列表侧的全部矩形(命中层按分支取用),面板侧的矩形条数则由入参 `slotCount` 给出;
 *  - 面板 `panelH = 150`、`topY = 84`、第 i 个 `y = topY + i × (panelH + 12)`,底板矩形就是
 *    `(pad, y, w − pad×2, panelH)`(Web `assets.draw("panel_parchment", …)` 的整幅拉伸,
 *    不是九宫格);面板内三行基线 `y+24` / `y+48` / `y+68`、进度条 `(pad+8, y+h−58, 200, 8)`、
 *    领取钮 `(w − pad − 2×112 − 8, y+h−44, 112, 36)`、放弃钮 `(w − pad − 112, y+h−44, 112, 36)`;
 *  - 区域行两行基线 `l1 = Math.round(r.y + r.h/2 − 5)`、`l2 = l1 + 18`;名字与右对齐产出同在 `l1`,
 *    左内缩 `r.x + 8`、右内缩 `r.x + r.w − 8`;
 *  - 难度钮内两行是**固定偏移** `d.y + 17` 与 `d.y + 33`(不走 `rowTextY`),难度说明基线
 *    `diffY − 6`;
 *  - 头部是 `skinHeader("banner_title_iron", "委托挂机", pad, 36, …)` —— **不传宽高**,于是走
 *    `skin.ts` 的默认 220×42:横幅盒 `(pad − 8, 36 − 42 + 8, 220, 42)`,有图时标题居中于横幅、
 *    基线 `36 − 4`,缺图时左起笔于 `pad`、基线 36;紧接一枚固定坐标的小立绘
 *    `player_pose_6 (252, 4, 38, 60)`;
 *  - 两项读数走 `iconText(…, y = 60, size = 13)`:图标盒 `(x, 60 − 13 + 2, 13, 13)`,有图时文字
 *    起笔 `x + 13 + 4`,缺图时回到 `x` 并由视图前置替代字形;`x` 分别是 `pad` 与 `pad + 130`;
 *    `转生 N 次` 起笔 `pad + 250`、同一基线 60;
 *  - 面板底走 `panelPad(g, w, h)` **不传专属键**,于是那一步就是 `panel_dark_corners`
 *    九宫格 `(pad, pad, w − pad×2, h − pad×2)`、切深 32;
 *  - 开始钮描边 `lineWidth` 临时设 2 再复位 1(`CM_START_STROKE_W`)。
 *
 * 命中口径(几何侧的事实):热区按 Web 的判定顺序排 —— 返回钮 → (有槽位)逐面板的领取 / 放弃 →
 * (无槽位)区域行 → 难度钮 → 开始钮 → 兑换钮。有槽位那一支 Web 在面板循环之后直接 `return`,
 * 于是**兑换钮虽然照画、却不参与命中**;热区之外的空白没有"其余一律"兜底。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:Web 的 `fillText` 不限宽,这里给的每一档只决定
 * `fitOne` 什么时候补「…」,不改变任何起笔与基线。
 *
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `cm`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { DIFFICULTIES, REGIONS, type RegionId } from "../data/commissions";
import { fs, rowTextY, spreadRows, ui } from "./theme";

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
  /** 第一行基线(Web 的 `Math.round(r.y + r.h/2 − 5)`) */
  l1: number;
  /** 第二行基线(Web 的 `l1 + 18`) */
  l2: number;
  /** 区域名(`r.x + 8`,限宽 150,fs.body 加粗) */
  name: CmTextLine;
  /** `${output} · ${unlockNote}`(`r.x + 8`、基线 l2、fs.micro) */
  sub: CmTextLine;
  /** `产出 ${baseRate}/h`(右末笔 `r.x + r.w − 8`、基线 l1、fs.muted;**仅解锁档绘制**) */
  rate: CmTextLine;
}

/** 难度钮(两行固定偏移,不是 rowTextY) */
export interface CommissionDiffLayout {
  level: number;
  index: number;
  rect: CmRect;
  /** `×${mult}`(居中,基线 `d.y + 17`,fs.muted 加粗) */
  mult: CmTextLine;
  /** `${fail%}%败`(居中,基线 `d.y + 33`,fs.micro) */
  fail: CmTextLine;
}

/** 一个进行中槽位的面板(条数 = 活动槽位数,上限 2) */
export interface CommissionPanelLayout {
  /** 面板序号(0 = `commission`,1 = `commission2`;槽位归属由内容层给) */
  index: number;
  /** 羊皮纸底板矩形 = `(pad, y, w − pad×2, panelH)`;Web 走整幅拉伸,不是九宫格 */
  rect: CmRect;
  /** `委托中:… · 难度N`(`pad + 8`、`y + 24`、fs.body 加粗) */
  line1: CmTextLine;
  /** `已进行 … · 有效时长 … · 预计 …`(`pad + 8`、`y + 48`、fs.muted) */
  line2: CmTextLine;
  /** `成功率 …% · 收益前2h 100%,之后降至 50%`(`pad + 8`、`y + 68`、fs.micro) */
  line3: CmTextLine;
  /** 全额收益窗口进度条轨道(`pad + 8`、`y + h − 58`、200×8) */
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
  /** 标题横幅贴图盒(Web skinHeader 的 `bx = x − 8`、`by = y − h + 8`,默认 220×42) */
  headerBanner: CmRect;
  /** 有横幅时的标题:横幅内水平居中,基线 `36 − 4` */
  titleWithBanner: CmTextLine;
  /** 缺图时的标题:左起笔于 pad,基线 36 */
  titleBare: CmTextLine;
  /** 头部小立绘(Web `assets.draw("player_pose_6", 252, 4, 38, 60)` 的固定坐标) */
  pose: CmRect;

  /** 词缀碎片读数:图标盒 + 有图 / 缺图两档文字位 */
  fragmentIcon: CmRect;
  fragmentTextWithIcon: CmTextLine;
  fragmentTextBare: CmTextLine;
  /** 星尘读数:同上 */
  stardustIcon: CmRect;
  stardustTextWithIcon: CmTextLine;
  stardustTextBare: CmTextLine;
  /** `转生 N 次`(与两项读数同基线,起笔 `pad + 250`) */
  prestigesText: CmTextLine;

  /** 兑换钮(热区 + 底板;**绘制与命中都带 `fragments ≥ FRAGMENT_TO_STARDUST` 前置条件**) */
  exchangeBtn: CmRect;
  exchangeText: CmTextLine;

  /** 右上返回钮与两档文字位(Web skinIconButton) */
  backBtn: CmRect;
  backIcon: CmRect;
  backTextWithIcon: CmTextLine;
  backTextBare: CmTextLine;

  /** 活动槽位数(= 面板条数;`> 0` 就是 Web 在 5134 return 的那一支) */
  slotCount: number;
  /** 逐面板几何(长度 = slotCount,上限 2) */
  panels: CommissionPanelLayout[];

  /** 区域行区顶缘(恒 100) */
  rowsTop: number;
  /** 区域行区预算底缘(Web 的第三实参 `diffY − 24`) */
  rowsBottom: number;
  /** 行高(spreadRows 的第一返回值;被 maxH 88 封顶) */
  rowH: number;
  /** 行距(spreadRows 的第二返回值;被默认 maxGap 20 封顶) */
  rowGap: number;
  /** 行步进 = rowH + gap */
  rowStep: number;
  /** 末行底边 = `rowsTop + (n − 1) × rowStep + rowH` */
  rowsEnd: number;
  /** 末行底边与难度说明基线之间的空档(两档屏高的差全落在这里) */
  rowsToDiff: number;
  /** 逐行几何(恒 `REGIONS.length` 条) */
  rows: CommissionRowLayout[];

  /** 难度行顶缘(Web 的 diffY) */
  diffY: number;
  /** 难度说明基线(`diffY − 6`) */
  diffLabel: CmTextLine;
  /** 恒 `DIFFICULTIES.length` 枚 */
  diffs: CommissionDiffLayout[];

  /** 开始委托钮(热区 + 底板;描边宽度见 CM_START_STROKE_W) */
  startBtn: CmRect;
  startText: CmTextLine;
}

/* Web commissionLayout / drawCommission / drawCommissionPanel 的内联几何常量 */
/** 开始委托钮:半宽 / 宽 / 高 / 底缘相对 `h − pad` 的上抬 */
export const CM_START_HALF_W = 130;
export const CM_START_W = 260;
export const CM_START_H = 52;
export const CM_START_UP = 52;
/** 难度行相对开始钮顶缘的两个裸加数(Web `startBtn.y − 30 − 42`)与钮高 */
export const CM_DIFF_GAP_Y = 30;
export const CM_DIFF_H = 42;
/** 难度钮枚数与横向间距(Web 的 `(w − pad×2 − 4×8)/5`) */
export const CM_DIFF_N = 5;
export const CM_DIFF_GAP_X = 8;
/** 难度钮内两行的固定偏移(Web 不用 rowTextY) */
export const CM_DIFF_TEXT_DY1 = 17;
export const CM_DIFF_TEXT_DY2 = 33;
/** 区域行区顶缘与预算底缘的让位(Web 的 100 与 `diffY − 24`) */
export const CM_ROWS_Y0 = 100;
export const CM_ROWS_BOTTOM_DY = 24;
/** 行高钳制两档(Web spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const CM_ROW_MIN_H = 52;
export const CM_ROW_MAX_H = 88;
/** 难度说明基线相对 diffY 的上抬(Web 的 `L.diffY − 6`) */
export const CM_DIFF_LABEL_DY = 6;
/** 区域行两行布局的两个裸加数(Web 的 `− 5` 与 `+ 18`) */
export const CM_L1_DY = 5;
export const CM_L2_DY = 18;
/** 行内三处偏移:名字与第二行起笔 / 右对齐产出末笔内缩 / 名字限宽 */
export const CM_ROW_TEXT_DX = 8;
export const CM_ROW_RIGHT_DX = 8;
export const CM_NAME_MAX_W = 150;
/** 面板:高 / 顶缘 / 面板间距 */
export const CM_PANEL_H = 150;
export const CM_PANEL_TOP_Y = 84;
export const CM_PANEL_GAP = 12;
/** 面板内三行基线的裸加数(Web 的 `y+24` / `y+48` / `y+68`)与起笔内缩 */
export const CM_PANEL_LINE1_DY = 24;
export const CM_PANEL_LINE2_DY = 48;
export const CM_PANEL_LINE3_DY = 68;
export const CM_PANEL_TEXT_DX = 8;
/** 进度条:相对面板底的让位 / 起笔内缩 / 宽 / 高(Web `y + h − 58`、`pad + 8`、200、8) */
export const CM_BAR_DY = 58;
export const CM_BAR_DX = 8;
export const CM_BAR_W = 200;
export const CM_BAR_H = 8;
/** 面板两枚钮:相对面板底的让位 / 宽 / 高 / 两枚之间的间距(Web `w − pad − 2×112 − 8`) */
export const CM_PANEL_BTN_DY = 44;
export const CM_PANEL_BTN_W = 112;
export const CM_PANEL_BTN_H = 36;
export const CM_PANEL_BTN_GAP = 8;
/** 兑换钮(Web 的 `w − pad − 150, 58, 150, 32`) */
export const CM_EXCHANGE_Y = 58;
export const CM_EXCHANGE_W = 150;
export const CM_EXCHANGE_H = 32;
/** 返回钮顶缘 / 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const CM_BACK_Y = 22;
export const CM_BACK_ICON_DX = 4;
export const CM_BACK_ICON_SHRINK = 12;
export const CM_BACK_TEXT_DY = 5;
/** 头部:标题基线 / 横幅宽高(skinHeader 的默认档)与三处让位 / 文字上抬 */
export const CM_TITLE_BASE_Y = 36;
export const CM_BANNER_W = 220;
export const CM_BANNER_H = 42;
export const CM_BANNER_DX = 8;
export const CM_BANNER_DY = 8;
export const CM_BANNER_TEXT_DY = 4;
/** 头部小立绘的固定坐标(Web 逐字照搬) */
export const CM_POSE_X = 252;
export const CM_POSE_Y = 4;
export const CM_POSE_W = 38;
export const CM_POSE_H = 60;
/** 两项读数:基线 / 图标边长 / 图标相对基线的上抬 / 图标与文字间距 / 两枚的横向起笔 */
export const CM_RES_BASE_Y = 60;
export const CM_ICON_SIZE = 13;
export const CM_ICON_DY = 2;
export const CM_ICON_TEXT_DX = 4;
export const CM_STARDUST_DX = 130;
/** `转生 N 次` 相对 pad 的横向偏移 */
export const CM_PRESTIGES_DX = 250;
/** 开始委托钮的描边宽度(Web 把 lineWidth 临时设 2 再复位 1) */
export const CM_START_STROKE_W = 2;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参) */
export const CM_PANEL_NINE = 32;
/** 文本带限宽与相邻文本之间留的余量(Cocos 侧口径;Web 的 fillText 不限宽) */
export const TEXT_SLACK = 10;

/** 开始委托钮矩形(Web 的 `x = w/2 − 130`、`y = h − pad − 52`;底边锚定 h) */
export function commissionStartBtn(w: number, h: number): CmRect {
  return { x: w / 2 - CM_START_HALF_W, y: h - ui.pad - CM_START_UP, w: CM_START_W, h: CM_START_H };
}

/** 难度行顶缘(Web 的 `diffY = startBtn.y − 30 − 42`;随开始钮一起底边锚定) */
export function commissionDiffY(w: number, h: number): number {
  return commissionStartBtn(w, h).y - CM_DIFF_GAP_Y - CM_DIFF_H;
}

/** 区域行区预算底缘(Web spreadRows 的第三实参 `diffY − 24`) */
export function commissionRowsBottom(w: number, h: number): number {
  return commissionDiffY(w, h) - CM_ROWS_BOTTOM_DY;
}

/** 进度条的两档口径(与 gacha 的 `gachaBarRects` 同式,对标 Web `skinBar` 与它的缺图回退) */
export interface CmBarRects {
  /** 缺图档的代码填充:从左起画 `w × min(1, frac)`(Web 回退分支里的 `Math.min(1, hours/2)`) */
  fill: CmRect;
  /** 贴图档盖住空缺的暗罩:`frac ≥ 1` 时为 null(Web skinBar 的 `if (f < 1)` 才画) */
  cover: CmRect | null;
}

/**
 * Web 传给 `skinBar` 的是**未钳制**的 `hours / 2`,钳制发生在 `skinBar` 内部
 * (`f = min(1, max(0, frac))`);缺图回退分支则自己写了 `Math.min(1, hours / 2)`。
 * 两条路径的钳制落点不同、结果同值,这里按同一份 frac 折出两档矩形。
 */
export function commissionBarRects(track: CmRect, frac: number): CmBarRects {
  const f = Math.min(1, Math.max(0, frac));
  return {
    fill: { x: track.x, y: track.y, w: track.w * Math.min(1, frac), h: track.h },
    cover: f < 1 ? { x: track.x + track.w * f, y: track.y, w: track.w * (1 - f), h: track.h } : null,
  };
}

function rowLayout(id: RegionId, index: number, rect: CmRect): CommissionRowLayout {
  const l1 = Math.round(rect.y + rect.h / 2 - CM_L1_DY);
  const l2 = l1 + CM_L2_DY;
  const leftX = rect.x + CM_ROW_TEXT_DX;
  const rightX = rect.x + rect.w - CM_ROW_RIGHT_DX;
  return {
    id,
    index,
    rect,
    l1,
    l2,
    name: { x: leftX, baseY: l1, maxW: CM_NAME_MAX_W, px: fs.body, align: "left" },
    sub: { x: leftX, baseY: l2, maxW: rect.w - CM_ROW_TEXT_DX * 2, px: fs.micro, align: "left" },
    rate: { x: rightX, baseY: l1, maxW: rect.w - CM_ROW_TEXT_DX - CM_NAME_MAX_W - TEXT_SLACK, px: fs.muted, align: "right" },
  };
}

function diffLayout(level: number, index: number, rect: CmRect): CommissionDiffLayout {
  const cx = rect.x + rect.w / 2;
  return {
    level,
    index,
    rect,
    mult: { x: cx, baseY: rect.y + CM_DIFF_TEXT_DY1, maxW: rect.w, px: fs.muted, align: "center" },
    fail: { x: cx, baseY: rect.y + CM_DIFF_TEXT_DY2, maxW: rect.w, px: fs.micro, align: "center" },
  };
}

function panelLayout(index: number, w: number, y: number): CommissionPanelLayout {
  const pad = ui.pad;
  const rect: CmRect = { x: pad, y, w: w - pad * 2, h: CM_PANEL_H };
  const textX = pad + CM_PANEL_TEXT_DX;
  const textW = rect.w - CM_PANEL_TEXT_DX * 2;
  const collect: CmRect = { x: w - pad - 2 * CM_PANEL_BTN_W - CM_PANEL_BTN_GAP, y: y + rect.h - CM_PANEL_BTN_DY, w: CM_PANEL_BTN_W, h: CM_PANEL_BTN_H };
  const abandon: CmRect = { x: w - pad - CM_PANEL_BTN_W, y: y + rect.h - CM_PANEL_BTN_DY, w: CM_PANEL_BTN_W, h: CM_PANEL_BTN_H };
  const btnText = (r: CmRect): CmTextLine => ({ x: r.x + r.w / 2, baseY: rowTextY(r.y, r.h, fs.body), maxW: r.w, px: fs.body, align: "center" });
  return {
    index,
    rect,
    line1: { x: textX, baseY: y + CM_PANEL_LINE1_DY, maxW: textW, px: fs.body, align: "left" },
    line2: { x: textX, baseY: y + CM_PANEL_LINE2_DY, maxW: textW, px: fs.muted, align: "left" },
    line3: { x: textX, baseY: y + CM_PANEL_LINE3_DY, maxW: textW, px: fs.micro, align: "left" },
    bar: { x: pad + CM_BAR_DX, y: y + rect.h - CM_BAR_DY, w: CM_BAR_W, h: CM_BAR_H },
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
 * 区域行区预算是 `[100, diffY − 24]`,`spreadRows` 把 `rowH` 钳在 52..88、`gap` 上限 20。
 * 六行恒不越界:两档设计高下 `rowH` 与 `gap` 同时顶到上限,于是矩形逐字相同,
 * 屏高的差全部落在 `rowsToDiff` 这一段空档里(数字见 `tests/cocos-phase4-commission.test.ts`)。
 */
export function commissionLayout(w: number, h: number, slotCount: number): CommissionLayout {
  const pad = ui.pad;
  const rowW = w - pad * 2;
  const startBtn = commissionStartBtn(w, h);
  const diffY = commissionDiffY(w, h);
  const rowsBottom = commissionRowsBottom(w, h);

  const { rowH, gap } = spreadRows(REGIONS.length, CM_ROWS_Y0, rowsBottom, CM_ROW_MIN_H, CM_ROW_MAX_H);
  const rowStep = rowH + gap;
  const rows: CommissionRowLayout[] = [];
  for (let i = 0; i < REGIONS.length; i++) rows.push(rowLayout(REGIONS[i].id, i, { x: pad, y: CM_ROWS_Y0 + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = rows.length > 0 ? CM_ROWS_Y0 + (rows.length - 1) * rowStep + rowH : CM_ROWS_Y0;

  const bw = (rowW - (CM_DIFF_N - 1) * CM_DIFF_GAP_X) / CM_DIFF_N;
  const diffs: CommissionDiffLayout[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) diffs.push(diffLayout(DIFFICULTIES[i].level, i, { x: pad + i * (bw + CM_DIFF_GAP_X), y: diffY, w: bw, h: CM_DIFF_H }));

  const panels: CommissionPanelLayout[] = [];
  for (let i = 0; i < slotCount; i++) panels.push(panelLayout(i, w, CM_PANEL_TOP_Y + i * (CM_PANEL_H + CM_PANEL_GAP)));

  const backBtn: CmRect = { x: w - pad - ui.backW, y: CM_BACK_Y, w: ui.backW, h: ui.backH };
  const iconH = backBtn.h - CM_BACK_ICON_SHRINK;
  const backIcon: CmRect = { x: backBtn.x + CM_BACK_ICON_DX, y: backBtn.y + (backBtn.h - iconH) / 2, w: iconH, h: iconH };
  const backBaseY = backBtn.y + backBtn.h / 2 + CM_BACK_TEXT_DY;
  const backRemainW = backBtn.w - CM_BACK_ICON_DX - iconH;

  const exchangeBtn: CmRect = { x: w - pad - CM_EXCHANGE_W, y: CM_EXCHANGE_Y, w: CM_EXCHANGE_W, h: CM_EXCHANGE_H };
  const headerBanner: CmRect = { x: pad - CM_BANNER_DX, y: CM_TITLE_BASE_Y - CM_BANNER_H + CM_BANNER_DY, w: CM_BANNER_W, h: CM_BANNER_H };

  const iconRect = (x: number): CmRect => ({ x, y: CM_RES_BASE_Y - CM_ICON_SIZE + CM_ICON_DY, w: CM_ICON_SIZE, h: CM_ICON_SIZE });
  const fragX = pad;
  const starX = pad + CM_STARDUST_DX;
  const prestX = pad + CM_PRESTIGES_DX;
  const resLine = (x: number, maxW: number): CmTextLine => ({ x, baseY: CM_RES_BASE_Y, maxW, px: fs.muted, align: "left" });

  return {
    panel: { x: pad, y: pad, w: rowW, h: h - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    titleWithBanner: { x: headerBanner.x + headerBanner.w / 2, baseY: CM_TITLE_BASE_Y - CM_BANNER_TEXT_DY, maxW: headerBanner.w, px: fs.title, align: "center" },
    titleBare: { x: pad, baseY: CM_TITLE_BASE_Y, maxW: CM_POSE_X - CM_BANNER_DX - TEXT_SLACK - pad, px: fs.title, align: "left" },
    pose: { x: CM_POSE_X, y: CM_POSE_Y, w: CM_POSE_W, h: CM_POSE_H },
    fragmentIcon: iconRect(fragX),
    fragmentTextWithIcon: resLine(fragX + CM_ICON_SIZE + CM_ICON_TEXT_DX, starX - TEXT_SLACK - (fragX + CM_ICON_SIZE + CM_ICON_TEXT_DX)),
    fragmentTextBare: resLine(fragX, starX - TEXT_SLACK - fragX),
    stardustIcon: iconRect(starX),
    stardustTextWithIcon: resLine(starX + CM_ICON_SIZE + CM_ICON_TEXT_DX, prestX - TEXT_SLACK - (starX + CM_ICON_SIZE + CM_ICON_TEXT_DX)),
    stardustTextBare: resLine(starX, prestX - TEXT_SLACK - starX),
    prestigesText: resLine(prestX, w - pad - prestX),
    exchangeBtn,
    exchangeText: { x: exchangeBtn.x + exchangeBtn.w / 2, baseY: rowTextY(exchangeBtn.y, exchangeBtn.h, fs.muted), maxW: exchangeBtn.w, px: fs.muted, align: "center" },
    backBtn,
    backIcon,
    backTextWithIcon: { x: backBtn.x + CM_BACK_ICON_DX + iconH + backRemainW / 2, baseY: backBaseY, maxW: backRemainW, px: fs.body, align: "center" },
    backTextBare: { x: backBtn.x + backBtn.w / 2, baseY: backBaseY, maxW: backBtn.w, px: fs.body, align: "center" },
    slotCount,
    panels,
    rowsTop: CM_ROWS_Y0,
    rowsBottom,
    rowH,
    rowGap: gap,
    rowStep,
    rowsEnd,
    rowsToDiff: diffY - CM_DIFF_LABEL_DY - rowsEnd,
    rows,
    diffY,
    diffLabel: { x: pad, baseY: diffY - CM_DIFF_LABEL_DY, maxW: rowW, px: fs.micro, align: "left" },
    diffs,
    startBtn,
    startText: { x: startBtn.x + startBtn.w / 2, baseY: rowTextY(startBtn.y, startBtn.h, fs.section), maxW: startBtn.w, px: fs.section, align: "center" },
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;面板条数由入参推出,本层不读存档) */
export function commissionScreenLayout(w: number, h: number, slotCount: number): CommissionLayout {
  return commissionLayout(w, h, slotCount);
}
