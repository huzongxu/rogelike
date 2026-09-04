/**
 * 扭蛋机屏纯几何 —— Web `src/game.ts:gachaLayout`(3527-3560)、`drawGacha`(3562-3702)
 * 与 `onGachaClick`(3704-3742)的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - 纵向分区自上而下是**主按钮行 → 钻石换券条 → 双保底条 → 最近抽取 → 永久收藏列表**,
 *    每一档的顶缘都由上一档的裸加数推出:`btnY 122`、`btnH 48`、`ticketY = btnY + btnH + 10`、
 *    `pityLabelY = ticketY + 38 + 18`、`resLabelY = pityLabelY + 40`、
 *    `collLabelY = resLabelY + (nRes > 0 ? nRes × 20 : 20) + 22`、`rowsTop = collLabelY + 36`;
 *  - **`rowsTop` 随最近结果条数在 354(nRes = 0)与 434(nRes = 5)之间跳**:Web 画 5 条
 *    (`slice(0, 5)`),而 `nRes = min(gachaResults.length, 5)`;`nRes = 0` 那一支仍然让出
 *    一整行 `resLineH`,所以 0 条与 1 条同高,不会收拢;
 *  - 行区 `spreadRows(ownedGear.length, rowsTop, h − pad, 40, 64)` —— **只传五个实参**,
 *    第六个 `maxGap` 走默认 20,行距步进就是 `rowH + gap`(与 gearup 丢弃 gap 硬编码 4 正相反);
 *  - **行以 `id` 为键**:`rows[i].id = ownedGear[i].id`,绘制与命中都拿这个 id 回 `ownedGear`
 *    里 `find`。id 重复时永远命中第一条匹配,与 Web 同式(本层不去重、不改成按下标);
 *  - 行区**没有硬截断也没有滚动**(gearup 有 14 件截断):件数一多就越出 `h − pad`,
 *    这是本屏作为"九屏唯一溢出风险屏"的性质,两端一致,原样保留;
 *  - 面板底走 `panelPad(g, w, h)` **不传专属键**,于是那一步就是 `panel_dark_corners`
 *    九宫格 `(pad, pad, w − pad×2, h − pad×2)`、切深 32;
 *  - 标题是 `skinHeader("banner_large_purple", "扭蛋机", pad, 36, …, 240, 46)` —— **横幅键 +
 *    显式 240×46**(daily 同参数,与 gearup 的"纯文字无横幅"不同):有图时标题居中于横幅、
 *    基线 `36 − 4`,缺图时左起笔于 `pad`、基线 36;
 *  - 券数走 `iconText("icon_ticket", "✦", …, pad, 60, …, 15)`:图标盒 `(pad, 60 − 15 + 2, 15, 15)`,
 *    文字起笔 `pad + 15 + 4`;缺图时文字回到 `pad` 并前置替代字形「✦」;
 *  - **两条保底条在纵向互相压字**:史诗条顶缘在 `pityLabelY + 8`、高 6(底 250),传奇条顶缘在
 *    `pityLabelY + 12`(底 254),两者重叠 2px;传奇标签基线 `pityLabelY + 18` 就压在传奇条之下。
 *    本层照抄这两个裸加数,`pityBarOverlap` 把该重叠量给出来便于断言,**不在几何层修**;
 *  - 换券条 `(pad, ticketY, w − pad×2, 38)` 与三枚钮 `(pad,122,110,48)`、`(pad+120,122,170,48)`、
 *    `(pad+300,122,w−pad×2−300,48)` 同处一行带,广告钮宽度**吃掉剩余**
 *    (所以它是四枚热区里唯一随屏宽变的那枚);
 *  - 保底条从 `pad + 110` 起、宽 `w − pad×2 − (pad + 110)`、高 6,标签列限宽收到条起笔前;
 *  - 行内名字起笔 `x + 8`、`Lv.` 段起笔 `x + 150`(**固定偏移,不是右对齐**),
 *    两者基线都是 `rowTextY(y, h, fs.muted)`;`带入中` 是右对齐末笔 `x + w − 8`。
 *
 * 命中口径(几何侧的事实):热区按 Web 的判定顺序排 —— 返回 → 单抽 → 十连 → 广告抽 →
 * 钻石换券 → 逐行(按 id 切换带入)。热区之外的空白**没有"其余一律"兜底**,点下去不产动作。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:Web 的 `fillText` 不限宽,这里给的每一档只决定
 * `fitOne` 什么时候补「…」,不改变任何起笔与基线。三处预留带(`GC_DUP_RESERVE` /
 * `GC_BADGE_RESERVE`)按各自那串文案的字形数与字号量出来,只用于让出右列位置。
 *
 * 文本行(`GcTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `gc`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface GcRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type GcAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface GcTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: GcAlign;
}

/** 最近抽取的一行:名字左起笔 + 右对齐「重复→星尘+N」(画不画由内容层的 duplicate 门控) */
export interface GcRecentLine {
  name: GcTextLine;
  dup: GcTextLine;
}

/** 收藏列表的一行(以 id 为键,绘制与命中都拿 id 回 ownedGear 反查) */
export interface GachaRowLayout {
  /** `ownedGear[i].id` —— 本屏的行键(Web 的行不按下标命中) */
  id: number;
  /** `ownedGear` 的原序下标(只用于节点槽对齐,不参与命中与反查) */
  index: number;
  /** 行矩形(纯代码底板 + 描边;同时就是本屏的行热区) */
  rect: GcRect;
  /** 名字(Web:`r.x + 8`,`rowTextY(r.y, r.h, fs.muted)`,muted;品质色由内容层给) */
  name: GcTextLine;
  /** `Lv.等级 品质名`(Web:`r.x + 150`,**固定偏移**,与名字同基线) */
  level: GcTextLine;
  /** 「带入中」(Web:`r.x + r.w − 8`,**右对齐**,仅选中档绘制) */
  badge: GcTextLine;
}

/** 整屏几何 */
export interface GachaLayout {
  /** 面板底矩形(panelPad 的九宫格实参矩形) */
  panel: GcRect;
  /** 面板贴图键 —— Web 的 `panelPad(g, w, h)` 不传专属键,故这一档就是 panel_dark_corners */
  panelKey: string;
  /** 标题横幅贴图盒(Web skinHeader 的 `bx = x − 8`、`by = y − h + 8`) */
  headerBanner: GcRect;
  /** 有横幅时的标题:横幅内水平居中,基线 `36 − 4` */
  titleWithBanner: GcTextLine;
  /** 缺图时的标题:左起笔于 pad,基线 36(Web themePaint.header 的回退分支) */
  titleBare: GcTextLine;
  /** 券数图标盒(Web iconText 的 `x, y − size + 2, size, size`) */
  ticketIcon: GcRect;
  /** 有图标时的券数:起笔 `pad + size + 4` */
  ticketTextWithIcon: GcTextLine;
  /** 缺图时的券数:回到 pad 并前置替代字形 */
  ticketTextBare: GcTextLine;

  /** 右上返回钮矩形与两档文字位 */
  backBtn: GcRect;
  /** 返回钮图标位(Web skinIconButton 的 `x + 4, y + (h − ih) / 2, ih, ih`,`ih = h − 12`) */
  backIcon: GcRect;
  /** 返回钮文字:有图标时居中于图标右侧剩余空间 */
  backTextWithIcon: GcTextLine;
  /** 返回钮文字:缺图时整体居中 */
  backTextBare: GcTextLine;

  /** 单抽钮 `(pad, 122, 110, 48)` —— 热区,同时是底板矩形 */
  singleBtn: GcRect;
  /** 十连钮 `(pad + 120, 122, 170, 48)` */
  tenBtn: GcRect;
  /** 广告钮 `(pad + 300, 122, w − pad×2 − 300, 48)` —— 宽度吃掉剩余,唯一随屏宽变的那枚 */
  adBtn: GcRect;
  /** 换券条 `(pad, ticketY, w − pad×2, 38)` —— 纯代码矩形,没有贴图 */
  ticketBtn: GcRect;
  /** 三枚钮的居中文字位:fs.body 加粗(Web 那一侧先 textAlign=center 画完再切回 left) */
  singleText: GcTextLine;
  tenText: GcTextLine;
  adText: GcTextLine;
  /** 换券条文字:fs.muted 居中,基线 `rowTextY(ticketY, 38, fs.muted)` */
  ticketText: GcTextLine;

  /** 史诗保底标签行(基线 = pityLabelY)与其进度条 */
  pityEpicLabel: GcTextLine;
  /** 传奇保底标签行(基线 = pityLabelY + 18)与其进度条 */
  pityLegendLabel: GcTextLine;
  pityEpicBar: GcRect;
  pityLegendBar: GcRect;
  /** 两条进度条的纵向重叠量(Web 的 8 / 12 两档加高 6 的既有性质,给出来便于断言) */
  pityBarOverlap: number;

  /** 「最近抽取:」标签行 */
  resLabel: GcTextLine;
  /** 最近抽取的行数 = `min(recentCount, GC_RES_MAX)`(Web 的 nRes) */
  nRes: number;
  /** 最近抽取行距(Web 的 resLineH = 20) */
  resLineH: number;
  /** 逐行落位(长度就是 nRes) */
  resRows: GcRecentLine[];

  /** 「永久收藏(点选开局带入)」标签行 */
  collLabel: GcTextLine;
  /** 「加成:攻+x% 命+y%」(Web:起笔 `pad + 170`,与标签同基线、fs.micro) */
  collBonus: GcTextLine;
  /** 空态提示(Web:`pad`、基线 `collLabelY + 24`、fs.muted) */
  collEmpty: GcTextLine;
  /** `ownedGear.length === 0`(Web 只在这一个分支画提示,收藏标签与加成仍然照画) */
  empty: boolean;

  /** 收藏件数 = `ownedGear.length` = 行数(本屏不截断) */
  gearCount: number;
  /** 行区顶缘(随 nRes 在 354 与 434 之间跳) */
  rowsTop: number;
  /** 行高(spreadRows 的第一返回值;0 件时为 0) */
  rowH: number;
  /** 行距(spreadRows 的第二返回值;本屏**使用**它,与 gearup 丢弃正相反) */
  rowGap: number;
  /** 行步进 = rowH + gap */
  rowStep: number;
  /** 行区预算底缘(Web 的第三实参 `h − pad`) */
  rowsBottom: number;
  /** 末行底边 = `rowsTop + (n − 1) × rowStep + rowH`(溢出量的度量;0 件时为 rowsTop) */
  rowsEnd: number;
  /** 逐行几何(长度 = gearCount,无上限) */
  rows: GachaRowLayout[];
}

/* Web drawGacha / gachaLayout 的内联几何常量(屏专属常量在本文件具名一处) */
/** 主按钮行的顶缘与行高(Web 的 122 / 48) */
export const GC_BTN_Y = 122;
export const GC_BTN_H = 48;
/** 换券条顶缘相对按钮行底的让位(Web `btnY + btnH + 10`)与条高(Web 的 38) */
export const GC_TICKET_DY = 10;
export const GC_TICKET_H = 38;
/** 保底标签基线相对换券条底的让位(Web `ticketY + 38 + 18`;38 就是条高) */
export const GC_PITY_DY = 18;
/** 最近抽取标签基线相对保底标签基线的让位(Web `pityLabelY + 40`) */
export const GC_RES_DY = 40;
/** 最近抽取行距(Web 的 resLineH)与最多显示条数(Web 的 `slice(0, 5)` 与 `min(…, 5)`) */
export const GC_RES_LINE_H = 20;
export const GC_RES_MAX = 5;
/** 收藏标签相对最近抽取末行的让位(Web `+ 22`)与行区顶缘再让位(Web `+ 36`) */
export const GC_COLL_DY = 22;
export const GC_ROWS_DY = 36;
/** 行高钳制两档(Web spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const GC_ROW_MIN_H = 40;
export const GC_ROW_MAX_H = 64;
/** 三枚钮的宽度与横向偏移(Web 的 110 / +120 与 170 / +300) */
export const GC_SINGLE_W = 110;
export const GC_TEN_DX = 120;
export const GC_TEN_W = 170;
export const GC_AD_DX = 300;
/** 保底条:标签列右侧让位、条高、两档条顶缘相对标签基线的裸加数、传奇标签的下移 */
export const GC_PITY_BAR_DX = 110;
export const GC_PITY_BAR_H = 6;
export const GC_PITY_BAR_DY_EPIC = 8;
export const GC_PITY_BAR_DY_LEGENDARY = 12;
export const GC_PITY_LABEL_DY_LEGENDARY = 18;
/** 标题基线 / 券数基线 / 图标边长 / 图标上抬 / 图标与文字的间隙 */
export const GC_TITLE_BASE_Y = 36;
export const GC_TICKET_BASE_Y = 60;
export const GC_ICON_SIZE = 15;
export const GC_ICON_DY = 2;
export const GC_ICON_TEXT_DX = 4;
/** 横幅宽高与 skinHeader 的三处让位(左移 8、上移 h − 8、有图时文字上抬 4) */
export const GC_BANNER_W = 240;
export const GC_BANNER_H = 46;
export const GC_BANNER_DX = 8;
export const GC_BANNER_DY = 8;
export const GC_BANNER_TEXT_DY = 4;
/** 行内三处偏移:名字起笔 / `Lv.` 段起笔 / 「带入中」右缘内缩 */
export const GC_TEXT_DX = 8;
export const GC_LEVEL_DX = 150;
/** 加成串起笔相对 pad 的偏移(Web 的 `pad + 170`)与空态提示的下移(Web 的 `+ 24`) */
export const GC_BONUS_DX = 170;
export const GC_EMPTY_DY = 24;
/** 返回钮顶缘 / 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const GC_BACK_Y = 22;
export const GC_BACK_ICON_DX = 4;
export const GC_BACK_ICON_SHRINK = 12;
export const GC_BACK_TEXT_DY = 5;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参) */
export const GC_PANEL_NINE = 32;
/** 文本带限宽与相邻热区之间留的余量(Cocos 侧口径;Web 的 fillText 不限宽) */
export const TEXT_SLACK = 10;
/** 最近抽取右列「重复→星尘+N」的预留带宽(9 字 @ fs.muted 的量字) */
export const GC_DUP_RESERVE = 118;
/** 行右列「带入中」的预留带宽(3 字 @ fs.muted 的量字) */
export const GC_BADGE_RESERVE = 56;

/** nRes 口径:最多画 5 条,但 0 条那一支照样让出一整行(Web 的三元表达式) */
export function gachaRecentRows(recentCount: number): number {
  return Math.max(0, Math.min(recentCount, GC_RES_MAX));
}

/** 分区纵线的单一推导处:换券条 → 保底标签 → 最近抽取标签 → 收藏标签 → 行区顶缘 */
export function gachaTicketY(): number {
  return GC_BTN_Y + GC_BTN_H + GC_TICKET_DY;
}

export function gachaPityLabelY(): number {
  return gachaTicketY() + GC_TICKET_H + GC_PITY_DY;
}

export function gachaResLabelY(): number {
  return gachaPityLabelY() + GC_RES_DY;
}

/** 收藏标签基线 = `resLabelY + (nRes > 0 ? nRes × resLineH : resLineH) + 22` */
export function gachaCollLabelY(recentCount: number): number {
  const nRes = gachaRecentRows(recentCount);
  return gachaResLabelY() + (nRes > 0 ? nRes * GC_RES_LINE_H : GC_RES_LINE_H) + GC_COLL_DY;
}

/** 行区顶缘 = `collLabelY + 36`:本屏唯一的"随最近结果条数下移"的那条线 */
export function gachaRowsTop(recentCount: number): number {
  return gachaCollLabelY(recentCount) + GC_ROWS_DY;
}

/** 进度条的两档口径(与 pass 的 `passProgressRects` 同式,对标 Web `skinBar`) */
export interface GcBarRects {
  /** 缺图档的代码填充:从左起画 `w × min(1, frac)` */
  fill: GcRect;
  /** 贴图档盖住空缺的暗罩:`frac ≥ 1` 时为 null(Web skinBar 的 `if (f < 1)` 才画) */
  cover: GcRect | null;
}

export function gachaBarRects(track: GcRect, frac: number): GcBarRects {
  const f = Math.min(1, Math.max(0, frac));
  return {
    fill: { x: track.x, y: track.y, w: track.w * Math.min(1, frac), h: track.h },
    cover: f < 1 ? { x: track.x + track.w * f, y: track.y, w: track.w * (1 - f), h: track.h } : null,
  };
}

function rowLayout(id: number, index: number, rect: GcRect): GachaRowLayout {
  const baseY = rowTextY(rect.y, rect.h, fs.muted);
  return {
    id,
    index,
    rect,
    name: { x: rect.x + GC_TEXT_DX, baseY, maxW: GC_LEVEL_DX - GC_TEXT_DX - TEXT_SLACK, px: fs.muted, align: "left" },
    level: { x: rect.x + GC_LEVEL_DX, baseY, maxW: rect.w - GC_LEVEL_DX - GC_BADGE_RESERVE, px: fs.muted, align: "left" },
    badge: { x: rect.x + rect.w - GC_TEXT_DX, baseY, maxW: GC_BADGE_RESERVE - GC_TEXT_DX, px: fs.muted, align: "right" },
  };
}

/**
 * 整屏几何。`ownedIds` 就是 `ownedGear.map(g => g.id)`(行以 id 为键、原序不排序),
 * `recentCount` 就是瞬时态 `gachaResults.length` —— 两者都由宿主投影传入,本层不读存档。
 *
 * 行区预算是 `[rowsTop, h − pad]`,`spreadRows` 把 `rowH` 钳在 40..64、`gap` 上限 20,
 * 但件数一多,两个下限(`rowH ≥ 40`、`gap ≥ 4`)就兜不住,`rowsEnd` 越出 `h − pad`。
 * 这是 Web `gachaLayout` 同式的既有性质,两端一致,本层不钳也不裁。
 */
export function gachaLayout(w: number, h: number, ownedIds: readonly number[], recentCount: number): GachaLayout {
  const pad = ui.pad;
  const rowW = w - pad * 2;
  const btnY = GC_BTN_Y;
  const ticketY = gachaTicketY();
  const pityLabelY = gachaPityLabelY();
  const resLabelY = gachaResLabelY();
  const collLabelY = gachaCollLabelY(recentCount);
  const rowsTop = collLabelY + GC_ROWS_DY;
  const rowsBottom = h - pad;
  const { rowH, gap } = spreadRows(ownedIds.length, rowsTop, rowsBottom, GC_ROW_MIN_H, GC_ROW_MAX_H);
  const rowStep = rowH + gap;
  const nRes = gachaRecentRows(recentCount);

  const backBtn: GcRect = { x: w - pad - ui.backW, y: GC_BACK_Y, w: ui.backW, h: ui.backH };
  const iconH = backBtn.h - GC_BACK_ICON_SHRINK;
  const backIcon: GcRect = { x: backBtn.x + GC_BACK_ICON_DX, y: backBtn.y + (backBtn.h - iconH) / 2, w: iconH, h: iconH };
  const backBaseY = backBtn.y + backBtn.h / 2 + GC_BACK_TEXT_DY;
  const backRemainW = backBtn.w - GC_BACK_ICON_DX - iconH;
  /** 头部与券数两档文字都收到返回钮起笔前 */
  const topLimit = backBtn.x - TEXT_SLACK - pad;

  const singleBtn: GcRect = { x: pad, y: btnY, w: GC_SINGLE_W, h: GC_BTN_H };
  const tenBtn: GcRect = { x: pad + GC_TEN_DX, y: btnY, w: GC_TEN_W, h: GC_BTN_H };
  const adBtn: GcRect = { x: pad + GC_AD_DX, y: btnY, w: rowW - GC_AD_DX, h: GC_BTN_H };
  const ticketBtn: GcRect = { x: pad, y: ticketY, w: rowW, h: GC_TICKET_H };

  const barX = pad + GC_PITY_BAR_DX;
  const barW = rowW - barX;
  const pityEpicBar: GcRect = { x: barX, y: pityLabelY + GC_PITY_BAR_DY_EPIC, w: barW, h: GC_PITY_BAR_H };
  const pityLegendBar: GcRect = { x: barX, y: pityLabelY + GC_PITY_BAR_DY_LEGENDARY, w: barW, h: GC_PITY_BAR_H };

  const headerBanner: GcRect = { x: pad - GC_BANNER_DX, y: GC_TITLE_BASE_Y - GC_BANNER_H + GC_BANNER_DY, w: GC_BANNER_W, h: GC_BANNER_H };
  const ticketIcon: GcRect = { x: pad, y: GC_TICKET_BASE_Y - GC_ICON_SIZE + GC_ICON_DY, w: GC_ICON_SIZE, h: GC_ICON_SIZE };

  const resRows: GcRecentLine[] = [];
  for (let i = 0; i < nRes; i++) {
    const baseY = resLabelY + (i + 1) * GC_RES_LINE_H;
    resRows.push({
      name: { x: pad + GC_TEXT_DX, baseY, maxW: rowW - GC_TEXT_DX - GC_DUP_RESERVE, px: fs.muted, align: "left" },
      dup: { x: w - pad, baseY, maxW: GC_DUP_RESERVE, px: fs.muted, align: "right" },
    });
  }

  const rows: GachaRowLayout[] = [];
  for (let i = 0; i < ownedIds.length; i++) rows.push(rowLayout(ownedIds[i], i, { x: pad, y: rowsTop + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = ownedIds.length > 0 ? rowsTop + (ownedIds.length - 1) * rowStep + rowH : rowsTop;

  return {
    panel: { x: pad, y: pad, w: rowW, h: h - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    titleWithBanner: { x: headerBanner.x + headerBanner.w / 2, baseY: GC_TITLE_BASE_Y - GC_BANNER_TEXT_DY, maxW: headerBanner.w, px: fs.title, align: "center" },
    titleBare: { x: pad, baseY: GC_TITLE_BASE_Y, maxW: topLimit, px: fs.title, align: "left" },
    ticketIcon,
    ticketTextWithIcon: { x: pad + GC_ICON_SIZE + GC_ICON_TEXT_DX, baseY: GC_TICKET_BASE_Y, maxW: topLimit - GC_ICON_SIZE - GC_ICON_TEXT_DX, px: fs.body, align: "left" },
    ticketTextBare: { x: pad, baseY: GC_TICKET_BASE_Y, maxW: topLimit, px: fs.body, align: "left" },
    backBtn,
    backIcon,
    backTextWithIcon: { x: backBtn.x + GC_BACK_ICON_DX + iconH + backRemainW / 2, baseY: backBaseY, maxW: backRemainW, px: fs.body, align: "center" },
    backTextBare: { x: backBtn.x + backBtn.w / 2, baseY: backBaseY, maxW: backBtn.w, px: fs.body, align: "center" },
    singleBtn,
    tenBtn,
    adBtn,
    ticketBtn,
    singleText: { x: singleBtn.x + singleBtn.w / 2, baseY: rowTextY(btnY, GC_BTN_H, fs.body), maxW: singleBtn.w, px: fs.body, align: "center" },
    tenText: { x: tenBtn.x + tenBtn.w / 2, baseY: rowTextY(btnY, GC_BTN_H, fs.body), maxW: tenBtn.w, px: fs.body, align: "center" },
    adText: { x: adBtn.x + adBtn.w / 2, baseY: rowTextY(btnY, GC_BTN_H, fs.body), maxW: adBtn.w, px: fs.body, align: "center" },
    ticketText: { x: ticketBtn.x + ticketBtn.w / 2, baseY: rowTextY(ticketY, GC_TICKET_H, fs.muted), maxW: ticketBtn.w, px: fs.muted, align: "center" },
    pityEpicLabel: { x: pad, baseY: pityLabelY, maxW: barX - TEXT_SLACK - pad, px: fs.micro, align: "left" },
    pityLegendLabel: { x: pad, baseY: pityLabelY + GC_PITY_LABEL_DY_LEGENDARY, maxW: barX - TEXT_SLACK - pad, px: fs.micro, align: "left" },
    pityEpicBar,
    pityLegendBar,
    pityBarOverlap: pityEpicBar.y + pityEpicBar.h - pityLegendBar.y,
    resLabel: { x: pad, baseY: resLabelY, maxW: rowW, px: fs.muted, align: "left" },
    nRes,
    resLineH: GC_RES_LINE_H,
    resRows,
    collLabel: { x: pad, baseY: collLabelY, maxW: GC_BONUS_DX - TEXT_SLACK, px: fs.body, align: "left" },
    collBonus: { x: pad + GC_BONUS_DX, baseY: collLabelY, maxW: rowW - GC_BONUS_DX, px: fs.micro, align: "left" },
    collEmpty: { x: pad, baseY: collLabelY + GC_EMPTY_DY, maxW: rowW, px: fs.muted, align: "left" },
    empty: ownedIds.length === 0,
    gearCount: ownedIds.length,
    rowsTop,
    rowH,
    rowGap: gap,
    rowStep,
    rowsBottom,
    rowsEnd,
    rows,
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数与行区顶缘都由入参推出,本层不读存档) */
export function gachaScreenLayout(w: number, h: number, ownedIds: readonly number[], recentCount: number): GachaLayout {
  return gachaLayout(w, h, ownedIds, recentCount);
}
