/**
 * 扭蛋机屏纯几何 —— Web `src/game.ts:gachaLayout`(3527-3560)、`drawGacha`(3562-3702)
 * 与 `onGachaClick`(3704-3742)的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。纵向是一条**列向弹性带链**:
 * 面板恒铺满内容列 `(pad, pad, w − pad×2, even(h) − pad×2)`,链上每一档(头带 / 主按钮行 / 换券条 /
 * 保底带 / 最近抽取 / 收藏标签 / 行带 / 板底缝)由 `gachaBands` 一次摊平 —— 富余先按轮次均分给
 * 还没封顶的档(行带权重最高,它的天花板就是行真正能用上的高度 `件数 × GC_ROW_MAX_H + 行距`),
 * 档档封顶后按权重继续摊到各档天花板(七段缝的天花板含"标定档之上的屏高富余"那一段,于是多出来的
 * 高度落在分区带里),最后由板底缝收零头。钮高 / 条高 / 行高都有硬下限 44 与各自上限,富余只在缝里
 * 流动,于是任何「屏高 × 件数 × 最近条数」组合都不会在板里堆出整段空腔,也不会撑破热区。标定档
 * (996 之下的裸加数链)逐项保留:
 *  - 纵向分区自上而下是**主按钮行 → 钻石换券条 → 双保底条 → 最近抽取 → 永久收藏列表**,
 *    标定加数是 `btnY 122`、`btnH 48`、`ticketY = btnY + btnH + 10`、`pityLabelY = ticketY + 38 + 18`、
 *    `resLabelY = pityLabelY + 40`、`collLabelY = resLabelY + (nRes > 0 ? nRes × 20 : 20) + 22`、
 *    `rowsTop = collLabelY + 36`;`gachaTicketY()` 等五支纵线函数给的就是这一档标定值;
 *  - 弹性档的 `min` 就是网格硬约束:主按钮行与换券条都不得低于热区下限 44,收藏行同样 44 起;
 *  - 行带 `spreadRows(ownedGear.length, rowsTop, 视口底缘, GC_ROW_MIN_H, GC_ROW_MAX_H)` ——
 *    仍只传五个实参(第六个 `maxGap` 走默认 20),行步进 = `rowH + gap`,结果再向偶数收一次,
 *    取整零头落到板底缝,一分高度不丢;
 *  - **行以 `id` 为键**:`rows[i].id = ownedGear[i].id`,绘制与命中都拿这个 id 回 `ownedGear`
 *    里 `find`。id 重复时永远命中第一条匹配,与 Web 同式(本层不去重、不改成按下标);
 *  - 行区**没有硬截断也没有滚动**(gearup 有 14 件截断):件数一多,各档已收到 `min` 仍装不下,
 *    `rowsEnd` 越出视口底缘 —— 这是本屏作为"九屏唯一溢出风险屏"的性质,两端一致,原样保留;
 *  - 面板底是本屏的**整幅内容板**,走 `panel_dark_corners` 九宫格(切深 32)——与融合 / 委托 /
 *    体力 / 转生四屏同一张板,于是本屏外框与九屏同属深渊蓝黑族;缺图那一档退到
 *    `phase4.gcPanelFallbackBg` 的代码底板(与 Web `panel()` 的 theme.bgPanel 同值);
 *  - 标题是 `skinHeader("banner_large_purple", "扭蛋机", pad, 36, …, 240, 46)` —— **横幅键 +
 *    显式 240×46**(daily 同参数,与 gearup 的"纯文字无横幅"不同):有图时标题居中于横幅、
 *    基线 `36 − 4`,缺图时左起笔于 `pad`、基线 36;
 *  - 券数走 `iconText("icon_ticket", "✦", …, pad, 60, …, 15)`:图标盒 `(pad, 60 − 15 + 2, 15, 15)`,
 *    文字起笔 `pad + 15 + 4`;缺图时文字回到 `pad` 并前置替代字形「✦」;
 *  - **两条保底条各贴自己的标签**:史诗条顶缘 `pityLabelY + 8`、传奇条顶缘
 *    `pityLabelY + 双保底带 + 8`,两档同为 6 高,条间净缝 = `双保底带 − 6`(标定档 12)。
 *    传奇标签基线 `pityLabelY + 双保底带` 落在自己那条条之上,左右两列(标签列限宽收到条起笔前)
 *    互不相压;`pityBarOverlap` 给出的是这一档**带符号的条间距**(负数 = 两档条之间有缝);
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
  /** 整幅内容板:`(pad, pad, w − pad×2, h − pad×2)`,底缘恒 `h − pad`,富余由列向带链吸收 */
  panel: GcRect;
  /** 面板贴图键:本屏与融合 / 委托 / 体力 / 转生同键(`panel_dark_corners`),缺图时视图退到代码底板 */
  panelKey: string;
  /** 标题横幅贴图盒(Web skinHeader 的 `bx = x − 8`、`by = y − h + 10`,那一档比 Web 多让 2 以贴住画布顶缘) */
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
  /** 两条进度条的纵向重叠量(带符号:负数 = 两档条之间留着的净缝,标定档 `−(双保底带 − 6)`) */
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
/** 页边距 16 / 内容宽 528:右缘恒落 544,与像素网格同一把尺 */
export const GC_PAD = 16;
/** 标定屏高:弹性链在此高之下仍按内容生长,996 与 1246 两档共一条出口 */
export const GC_CALIBRATION_H = 996;
/** 主按钮行的顶缘与行高(Web 的 122 / 48) */
export const GC_BTN_Y = 122;
export const GC_BTN_H = 48;
/** 换券条顶缘相对按钮行底的让位(Web `btnY + btnH + 10`)与条高(Web 的 38;热区下限 44 由弹性档给) */
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
/**
 * 行高钳制两档:下限抬到热区 44,上限按**行内那一行文字的名义高**给。
 * 本屏的行只有一行正文(fs.muted 13 → 行盒 20),48 = 20 的块上下各让一档内缩,行框贴着内容长,
 * 行底不再拖一条空腔;富余从行带退回七段缝与板底缝(见 `gcFlexFill` 的 ①②③)。
 */
export const GC_ROW_MIN_H = 44;
export const GC_ROW_MAX_H = 48;
/** 行距上限(spreadRows 的默认 maxGap 那一档,本屏按网格用到 20) */
export const GC_ROW_GAP_MAX = 20;
/** 三枚钮的宽度与横向偏移(Web 的 110 / +120 与 170 / +300) */
export const GC_SINGLE_W = 110;
export const GC_TEN_DX = 120;
export const GC_TEN_W = 170;
export const GC_AD_DX = 300;
/**
 * 保底条:标签列右侧让位、条高、条顶缘相对**各自标签基线**的让位(两档条同一把尺,各自坐在
 * 自己的标签之下,条间净缝 = 双保底带 − 条高)、传奇标签基线的下移。
 * `GC_PITY_BAR_DY_LEGENDARY` 记的是标定档(pityBand 18 + 8)下传奇条顶缘相对 `pityLabelY` 的
 * 加数,弹性档由 `B.pityBand` 推导(见 `gachaLayout` 里的 `pityLegendBar`)。
 */
export const GC_PITY_BAR_DX = 110;
export const GC_PITY_BAR_H = 6;
export const GC_PITY_BAR_DY_EPIC = 8;
/** 传奇标签基线相对 `pityLabelY` 的下移(标定档 = 双保底带 18) */
export const GC_PITY_LABEL_DY_LEGENDARY = 18;
export const GC_PITY_BAR_DY_LEGENDARY = GC_PITY_LABEL_DY_LEGENDARY + GC_PITY_BAR_DY_EPIC;
/** 标题基线 / 券数基线 / 图标边长 / 图标上抬 / 图标与文字的间隙 */
export const GC_TITLE_BASE_Y = 36;
export const GC_TICKET_BASE_Y = 60;
export const GC_ICON_SIZE = 15;
export const GC_ICON_DY = 2;
export const GC_ICON_TEXT_DX = 4;
/** 横幅宽高与 skinHeader 的三处让位(左移 8、上移 h − 10、有图时文字上抬 4;上移那一档比 Web 多 2,
 *  为的是 240×46 的盒顶缘落在 0 而不是 −2 —— 像素网格要求逐屏越界 0) */
export const GC_BANNER_W = 240;
export const GC_BANNER_H = 46;
export const GC_BANNER_DX = 8;
export const GC_BANNER_DY = 10;
export const GC_BANNER_TEXT_DY = 4;
/** 行内三处偏移:名字起笔 / `Lv.` 段起笔 / 「带入中」右缘内缩 */
export const GC_TEXT_DX = 8;
export const GC_LEVEL_DX = 150;
/** 加成串起笔相对 pad 的偏移(Web 的 `pad + 170`)与空态提示的下移(Web 的 `+ 24`) */
export const GC_BONUS_DX = 170;
export const GC_EMPTY_DY = 24;
/** 返回钮顶缘 / 钮高(本屏抬到热区下限 44,共享 ui.backH 的 34 不够一档)/ 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const GC_BACK_Y = 22;
export const GC_BACK_H = 44;
export const GC_BACK_ICON_DX = 4;
export const GC_BACK_ICON_SHRINK = 12;
export const GC_BACK_TEXT_DY = 5;
/**
 * 面板九宫格切深(Web panelPad 的 drawNine 第六实参,记录两端同源的那一笔)。
 * Cocos 侧的切深走 `viewTable.nineSlice.keys` 按贴图键给,几何层不重复落一个数。
 */
export const GC_PANEL_NINE = 32;
/**
 * 面板底缘相对末行底边的内缩量。取 20 = `spreadRows` 默认 `maxGap` 那一档,
 * 于是「末行 → 板底缘」读起来就是一行行距,与行间隙同一标尺。
 */
export const GC_PANEL_FOOT = 20;
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

/* ==================== 列向弹性带链(屏高富余的唯一出口) ==================== */

/** 偶数落位(2px 像素模块) */
const even = (v: number): number => Math.round(v / 2) * 2;
/** 屏高专用:向下取偶。向上取会把面板底缘推出画布(1080×2340 → 逻辑 1213 → 1214 就多出 1px) */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;
const between = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 一条纵向带的分配结果:每一档都是"这一段带占多少高",总和恰等于面板内高 */
export interface GcBands {
  pad: number;
  /** 面板顶缘 → 主按钮行顶缘的头带(标定 = `GC_BTN_Y − pad`) */
  headH: number;
  btnH: number;
  ticketDy: number;
  ticketH: number;
  pityDy: number;
  /** 双保底带:史诗标签基线 → 传奇标签基线 */
  pityBand: number;
  resDy: number;
  /** 最近抽取的行距与整带(0 条那一支照样让出一整行) */
  resLineH: number;
  resBand: number;
  collDy: number;
  rowsDy: number;
  /** 行带预算:行高 × 件数 + 行距 ×(件数 − 1) */
  rowBand: number;
  /** 末行 → 面板底缘的板底缝 */
  foot: number;
  nRes: number;
  gearCount: number;
}

/** 一档列向弹性位:`v` 当前值 / `min` 硬下限(热区与可读性) / `max` 理想上限 / `ceil` 续摊天花板 / `w` 续摊权重 */
interface GcFlex {
  v: number;
  min: number;
  max: number;
  ceil: number;
  w: number;
}

const gcFlex = (v: number, min: number, max: number, w: number, ceil = max): GcFlex => ({ v: even(Math.max(v, min)), min: even(min), max: even(max), ceil: even(Math.max(ceil, max)), w });
const gcSum = (slots: GcFlex[]): number => slots.reduce((a, s) => a + s.v, 0);

/** 链上七段「缝」(分区带)的下标:头带 / 钮行→换券条 / 换券条→保底标签 / 保底带→最近抽取 / 最近抽取→收藏标签 / 收藏标签→行区 / 板底缝 */
const GC_GAP_SLOTS = [0, 2, 4, 6, 8, 9, 11];
/** 板底缝那一档的下标:理想上限 ×1.2 的余量之外,屏高富余按权重先摊给七段缝,再由这一档收零头 */
const GC_FOOT_SLOT = 11;

/**
 * 把 total 摊给链上的每一档(就地写回,全偶数)。
 * ① 轮次均分:每轮把余量均分给还没到 `max` 的档(缺量方向则还没降到 `min` 的档);
 * ② 加权续摊:档档封顶后按 `w` 继续摊到各自的 `ceil`(七段缝的 `ceil` 里已含屏高富余那一段);
 * ③ 兜底:再剩下的零头全部落到**板底缝**那一档(列表尾),行带 / 钮高 / 条高一分不加 ——
 *    于是行高恒 ≤ `GC_ROW_MAX_H`、四枚热区恒 ≥ 44,而富余永远有地方落,不会凭空变成板下空腔。
 */
function gcFlexFill(slots: GcFlex[], total: number): void {
  const target = even(total);
  const roundTo = (capAt: (s: GcFlex) => number) => {
    let guard = 0;
    while (Math.abs(target - gcSum(slots)) >= 2 && guard++ < 96) {
      const diff = target - gcSum(slots);
      const open = slots.filter((s) => (diff > 0 ? s.v < capAt(s) : s.v > s.min));
      if (!open.length) return;
      const step = Math.max(2, Math.floor(Math.abs(diff) / open.length / 2) * 2);
      let budget = Math.abs(diff);
      let used = 0;
      for (const s of open) {
        if (budget < 2) break;
        const room = Math.min(step, diff > 0 ? capAt(s) - s.v : s.v - s.min, budget);
        s.v += diff > 0 ? room : -room;
        budget -= room;
        used += room;
      }
      if (used === 0) return;
    }
  };
  roundTo((s) => s.max);
  /* ② 加权续摊:摊到各自的天花板 */
  let rest = target - gcSum(slots);
  while (rest >= 2) {
    const open = slots.filter((s) => s.v < s.ceil);
    if (!open.length) break;
    const wsum = open.reduce((a, s) => a + s.w, 0);
    if (wsum <= 0) break;
    let budget = rest;
    let used = 0;
    for (const s of open) {
      if (budget < 2) break;
      const want = Math.max(2, Math.floor((rest * s.w) / wsum / 2) * 2);
      const share = Math.min(s.ceil - s.v, want, budget);
      s.v += share;
      budget -= share;
      used += share;
    }
    if (used === 0) break;
    rest = target - gcSum(slots);
  }
  /* ③ 板底缝吃干剩余(列表尾的那一段呼吸带) */
  rest = target - gcSum(slots);
  if (rest >= 2 && slots[GC_FOOT_SLOT]) slots[GC_FOOT_SLOT].v += even(rest);
}

/**
 * 本帧的纵向带。标定档(`GC_BTN_Y` 起的裸加数链)是各档的 `base`,富余全部由 ①②③ 摊掉;
 * 件数少 → 行带吃得最多,件数多到装不下 → 各档退到硬下限,行带越出视口底缘(本屏的既有性质)。
 */
export function gachaBands(h: number, recentCount: number, gearCount: number): GcBands {
  const pad = GC_PAD;
  /** 屏高先落偶数档:奇数视口高(如 1080×2340 → 1213)会把面板底缘与行底缘推到奇数坐标上 */
  const hh = evenDown(h);
  const nRes = gachaRecentRows(recentCount);
  const resLines = Math.max(1, nRes);
  const rowBandBase = gearCount > 0 ? gearCount * GC_ROW_MIN_H + (gearCount - 1) * 4 : 0;
  const rowBandMax = gearCount > 0 ? gearCount * GC_ROW_MAX_H + (gearCount - 1) * GC_ROW_GAP_MAX : 0;
  const headBase = GC_BTN_Y - pad;

  const slots: GcFlex[] = [
    gcFlex(headBase, headBase, headBase + 24, 0.5), // ① 头带
    gcFlex(GC_BTN_H, 44, 64, 1), // ② 主按钮行(44 = 热区下限)
    gcFlex(GC_TICKET_DY, 8, 24, 1), // ③ 按钮行 → 换券条
    gcFlex(GC_TICKET_H, 44, 54, 1), // ④ 换券条(44 = 热区下限)
    gcFlex(GC_PITY_DY, 14, 28, 0.8), // ⑤ 换券条 → 保底标签
    gcFlex(GC_PITY_LABEL_DY_LEGENDARY, 16, 30, 0.8), // ⑥ 双保底带
    gcFlex(GC_RES_DY - GC_PITY_LABEL_DY_LEGENDARY, 16, 34, 1), // ⑦ 保底带 → 最近抽取标签
    gcFlex(resLines * GC_RES_LINE_H, resLines * 20, resLines * 32, 1), // ⑧ 最近抽取带
    gcFlex(GC_COLL_DY, 16, 38, 1), // ⑨ 最近抽取 → 收藏标签
    gcFlex(GC_ROWS_DY, 28, 50, 1), // ⑩ 收藏标签 → 行区顶缘
    gcFlex(rowBandBase, rowBandBase, rowBandMax, 3), // ⑪ 行带(天花板 = 行真正能用上的高度)
    gcFlex(GC_PANEL_FOOT, 18, 40, 1), // ⑫ 板底缝(列表尾,兼兜底档)
  ];

  /* 七段缝的天花板 = 理想上限 ×1.2(标定档就是这一档)+ 屏高富余按各自权重的份额;
     于是标定档之上的那一段高度落在分区带里,而不是在板下堆成空腔 */
  const slack = Math.max(0, hh - GC_CALIBRATION_H);
  const gapWeightSum = GC_GAP_SLOTS.reduce((a, i) => a + slots[i].w, 0);
  for (const i of GC_GAP_SLOTS) slots[i].ceil = even(slots[i].max * 1.2) + even((slack * slots[i].w) / gapWeightSum);
  gcFlexFill(slots, hh - pad * 2);

  const [headH, btnH, ticketDy, ticketH, pityDy, pityBand, resDy, resBand, collDy, rowsDy, rowBand, foot] = slots.map((s) => s.v);
  return {
    pad,
    headH,
    btnH,
    ticketDy,
    ticketH,
    pityDy,
    pityBand,
    resDy,
    resLineH: even(Math.floor(resBand / resLines)),
    resBand: resLines * even(Math.floor(resBand / resLines)),
    collDy: collDy + (resBand - resLines * even(Math.floor(resBand / resLines))),
    rowsDy,
    rowBand,
    foot,
    nRes,
    gearCount,
  };
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
 * 行区视口是 `[rowsTop, h − pad − 板底缝]`,`spreadRows` 把 `rowH` 钳在
 * `GC_ROW_MIN_H..GC_ROW_MAX_H`、`gap` 上限 `GC_ROW_GAP_MAX`,行高与行距再向偶数收一次;
 * 件数一多,各档已退到硬下限仍装不下时,`rowsEnd` 越出视口底缘。
 * 这是 Web `gachaLayout` 同式的既有性质,两端一致,本层不钳也不裁。
 */
export function gachaLayout(w: number, h: number, ownedIds: readonly number[], recentCount: number): GachaLayout {
  const pad = GC_PAD;
  /** 与 `gachaBands` 同一档偶数屏高:带链摊平的总高 = 面板内高,奇数视口不留奇数底缘 */
  const hh = evenDown(h);
  const B = gachaBands(hh, recentCount, ownedIds.length);
  const rowW = w - pad * 2;
  /* 纵线:每一档的顶缘都由上一档的带高推出(标定档与 `gachaTicketY()` 那五支同数) */
  const btnY = pad + B.headH;
  const ticketY = btnY + B.btnH + B.ticketDy;
  const pityLabelY = ticketY + B.ticketH + B.pityDy;
  const resLabelY = pityLabelY + B.pityBand + B.resDy;
  const collLabelY = resLabelY + B.resBand + B.collDy;
  const rowsTop = collLabelY + B.rowsDy;
  const rowsBottom = hh - pad;
  /** 行区视口底缘 = 面板内底 − 板底缝;件数多到装不下时行仍从这里往下排(本屏的既有性质) */
  const listBottom = rowsBottom - B.foot;
  const spread = spreadRows(ownedIds.length, rowsTop, listBottom, GC_ROW_MIN_H, GC_ROW_MAX_H);
  /* 行高与行距再向偶数收一次,取整零头自然落到板底缝里 */
  const rowH = ownedIds.length > 0 ? spread.rowH - (spread.rowH % 2) : 0;
  const gap = ownedIds.length > 1 ? between(spread.gap - (spread.gap % 2), 4, GC_ROW_GAP_MAX) : 0;
  const rowStep = rowH + gap;
  const nRes = gachaRecentRows(recentCount);

  const backBtn: GcRect = { x: w - pad - ui.backW, y: GC_BACK_Y, w: ui.backW, h: GC_BACK_H };
  const iconH = backBtn.h - GC_BACK_ICON_SHRINK;
  const backIcon: GcRect = { x: backBtn.x + GC_BACK_ICON_DX, y: backBtn.y + (backBtn.h - iconH) / 2, w: iconH, h: iconH };
  const backBaseY = backBtn.y + backBtn.h / 2 + GC_BACK_TEXT_DY;
  const backRemainW = backBtn.w - GC_BACK_ICON_DX - iconH;
  /** 头部与券数两档文字都收到返回钮起笔前 */
  const topLimit = backBtn.x - TEXT_SLACK - pad;

  const singleBtn: GcRect = { x: pad, y: btnY, w: GC_SINGLE_W, h: B.btnH };
  const tenBtn: GcRect = { x: pad + GC_TEN_DX, y: btnY, w: GC_TEN_W, h: B.btnH };
  const adBtn: GcRect = { x: pad + GC_AD_DX, y: btnY, w: rowW - GC_AD_DX, h: B.btnH };
  const ticketBtn: GcRect = { x: pad, y: ticketY, w: rowW, h: B.ticketH };

  const barX = pad + GC_PITY_BAR_DX;
  const barW = rowW - barX;
  const pityEpicBar: GcRect = { x: barX, y: pityLabelY + GC_PITY_BAR_DY_EPIC, w: barW, h: GC_PITY_BAR_H };
  /** 传奇条贴自己的标签基线(`pityLabelY + B.pityBand`),于是两档条之间的净缝 = `B.pityBand − GC_PITY_BAR_H` 恒正 */
  const pityLegendBar: GcRect = { x: barX, y: pityLabelY + B.pityBand + GC_PITY_BAR_DY_EPIC, w: barW, h: GC_PITY_BAR_H };

  const headerBanner: GcRect = { x: pad - GC_BANNER_DX, y: GC_TITLE_BASE_Y - GC_BANNER_H + GC_BANNER_DY, w: GC_BANNER_W, h: GC_BANNER_H };
  const ticketIcon: GcRect = { x: pad, y: GC_TICKET_BASE_Y - GC_ICON_SIZE + GC_ICON_DY, w: GC_ICON_SIZE, h: GC_ICON_SIZE };

  const resRows: GcRecentLine[] = [];
  for (let i = 0; i < nRes; i++) {
    const baseY = resLabelY + (i + 1) * B.resLineH;
    resRows.push({
      name: { x: pad + GC_TEXT_DX, baseY, maxW: rowW - GC_TEXT_DX - GC_DUP_RESERVE, px: fs.muted, align: "left" },
      dup: { x: w - pad, baseY, maxW: GC_DUP_RESERVE, px: fs.muted, align: "right" },
    });
  }

  const rows: GachaRowLayout[] = [];
  for (let i = 0; i < ownedIds.length; i++) rows.push(rowLayout(ownedIds[i], i, { x: pad, y: rowsTop + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = ownedIds.length > 0 ? rowsTop + (ownedIds.length - 1) * rowStep + rowH : rowsTop;

  return {
    /** 整幅内容板:纵向从页边距铺到 `h − pad`,屏高富余全部由上面那条带链吸收 */
    panel: { x: pad, y: pad, w: rowW, h: rowsBottom - pad },
    /** 与融合 / 委托 / 体力 / 转生同一张板:外框归深渊蓝黑族。切深走 `viewTable.nineSlice.keys`
     *  按贴图键给(本屏内容内缩 pad,与那四屏同档);缺图那一档由视图的代码底板兜住 */
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
    singleText: { x: singleBtn.x + singleBtn.w / 2, baseY: rowTextY(btnY, B.btnH, fs.body), maxW: singleBtn.w, px: fs.body, align: "center" },
    tenText: { x: tenBtn.x + tenBtn.w / 2, baseY: rowTextY(btnY, B.btnH, fs.body), maxW: tenBtn.w, px: fs.body, align: "center" },
    adText: { x: adBtn.x + adBtn.w / 2, baseY: rowTextY(btnY, B.btnH, fs.body), maxW: adBtn.w, px: fs.body, align: "center" },
    ticketText: { x: ticketBtn.x + ticketBtn.w / 2, baseY: rowTextY(ticketY, B.ticketH, fs.muted), maxW: ticketBtn.w, px: fs.muted, align: "center" },
    pityEpicLabel: { x: pad, baseY: pityLabelY, maxW: barX - TEXT_SLACK - pad, px: fs.micro, align: "left" },
    pityLegendLabel: { x: pad, baseY: pityLabelY + B.pityBand, maxW: barX - TEXT_SLACK - pad, px: fs.micro, align: "left" },
    pityEpicBar,
    pityLegendBar,
    pityBarOverlap: pityEpicBar.y + pityEpicBar.h - pityLegendBar.y,
    resLabel: { x: pad, baseY: resLabelY, maxW: rowW, px: fs.muted, align: "left" },
    nRes,
    resLineH: B.resLineH,
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
