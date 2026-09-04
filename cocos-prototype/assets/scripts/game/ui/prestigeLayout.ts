/**
 * 转生与天赋屏纯几何 —— Web `src/game.ts:prestigeLayout`(4178-4222)、`drawPrestige`
 * (4224-4353)与 `onPrestigeClick`(4355-4385)的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - **底部锚定,行区上界固定**:分区自下而上是 `开始新轮回钮 → 完美蓝图块 → 定向搜索块 → 节点行区`。
 *    `startBtn = { x: w/2 − 130, y: h − pad − 52, w: 260, h: 52 }`;`blockTop` 从 `startBtn.y − 10`
 *    起,**每命中一个条件块就再减 46**,行区预算底缘就是 `blockTop − 8`;
 *  - **两个条件块会吃掉行区预算**,所以下界在 `startBtn.y − 10 / − 56 / − 102` 三档跳
 *    (`hasBlueprint` / `hasTargetedSearch` 各让一档)。行区上界恒为 `PT_LIST_Y0 = 156`,
 *    于是这一屏的行高对屏高与对"拥有哪几枚天赋"同时敏感;
 *  - 绘制顺序决定纵向位置:**蓝图块先让位、定向搜索块后让位**,所以定向搜索块压在蓝图块之上
 *    (`triggerLabelY = startBtn.y − 102`、`effectLabelY = startBtn.y − 56` 那一档),
 *    两块都在时行区只剩 664..914 的预算;
 *  - 行区 `spreadRows(routeLen, PT_LIST_Y0, blockTop − 8, 40, 64)` —— **只传五个实参**,
 *    第六个 `maxGap` 走默认 20,行距步进就是 `rowH + gap`(与 gearup 丢弃 gap 硬编码 4 正相反);
 *  - 行 `y = PT_LIST_Y0 + i × (rowH + gap)`、`x = pad`、`w = w − pad×2`,行**以天赋 id 为键**;
 *  - 条件块内的钮:`bw = (w − pad×2 − (n−1)×gap) / n`,定向搜索 6 枚间距 6、完美蓝图 8 枚间距 4,
 *    钮 `y = labelY + 18`、`h = 28`,水平从 `pad + i×(bw + gap)` 起;
 *  - 三系页签 `tabW = (w − pad×2)/3`、`y = 120`、`h = 30`,恒三枚;整条贴图打底
 *    `tabs_talent_three`(盒 = `tabs[0].x, y, tabs[0].w×3, h`),再逐签画覆盖层;
 *  - 头部是 `skinHeader("banner_purple_cosmic", "转生与天赋", pad, 36, …, 240, 46)` —— **横幅键 +
 *    显式 240×46**(与 gacha 同参数):有图时标题居中于横幅、基线 `36 − 4`,缺图时左起笔于 `pad`、
 *    基线 36;紧接一枚**固定坐标**的小立绘 `player_pose_5 (252, 4, 38, 60)` 压在头部区,
 *    四行信息在它之后绘制(Web 的先后顺序就是覆盖顺序,本层不做平移);
 *  - 节点行是**两行布局**:`l1 = Math.round(r.y + r.h/2 − 6)`、`l2 = l1 + 19`;
 *    名称在 `r.x + 8` 限宽 150,右侧右对齐末笔 `r.x + r.w − 8`;已拥有档的勾选标记 13×13 落在
 *    `r.x + r.w − 12 − 量字宽 − 17`、`l1 − 12`,量字宽按 Cocos 侧近似量字(CJK = 1×px)由
 *    `PT_OWNED_TEXT_W = 3 × fs.muted` 给出 —— **与 Web 的 `measureText("已拥有").width` 不同源**,
 *    这一档偏差与已落地五屏同类,不在几何层修;
 *  - 面板底走 `panelPad(g, w, h)` **不传专属键**,于是那一步就是 `panel_dark_corners`
 *    九宫格 `(pad, pad, w − pad×2, h − pad×2)`、切深 32;
 *  - 开始新轮回钮是纯代码矩形,描边 `lineWidth` 临时设 2 再复位 1(`PT_START_STROKE_W`)。
 *
 * 命中口径(几何侧的事实):热区按 Web 的判定顺序排 —— 页签 → 逐行 → 触发器钮 → 效果钮 →
 * 开始新轮回钮。热区之外的空白**没有"其余一律"兜底**,点下去不产动作。
 * **本屏没有返回钮**:Web 的 `onPrestigeClick` 里不存在 backBtn,屏内唯一离开路径就是
 * "开始新轮回"(见 `PrestigeModel.ts` 文件头与 `docs/COCOS-MIGRATION.md` §8)。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:Web 的 `fillText` 不限宽,这里给的每一档只决定
 * `fitOne` 什么时候补「…」,不改变任何起笔与基线。
 *
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `pt`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { fs, rowTextY, spreadRows, ui } from "./theme";
import type { EffectType, TriggerType } from "../data/affixes";
import type { TalentId } from "../data/talents";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface PtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type PtAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface PtTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: PtAlign;
}

/** 三系页签的键(与 Web 的 `this.talentRoute` 同取值) */
export type PtRouteKey = "builder" | "efficient" | "conqueror";

/** 一枚页签:矩形就是热区,同时是覆盖层底板 */
export interface PrestigeTabLayout {
  route: PtRouteKey;
  label: string;
  rect: PtRect;
  /** 居中标题(fs.muted 加粗,基线 `rowTextY(y, h, fs.muted)`) */
  text: PtTextLine;
}

/** 开局配置块里的一枚钮(触发器或效果) */
export interface PrestigeChoiceLayout {
  type: TriggerType | EffectType;
  rect: PtRect;
  /** 居中钮文(fs.micro,基线 `rowTextY(y, h, fs.micro)`) */
  text: PtTextLine;
}

/** 节点行(两行布局) */
export interface PrestigeRowLayout {
  /** 行键(= 该系路线第 i 个天赋的 id),绘制与命中都拿它回路线里反查 */
  id: TalentId;
  /** 路线内下标(只用于节点槽对齐) */
  index: number;
  /** 行矩形(纯代码底板 + 描边;同时就是本屏的行热区) */
  rect: PtRect;
  /** 第一行基线(Web 的 `Math.round(r.y + r.h/2 − 6)`) */
  l1: number;
  /** 第二行基线(Web 的 `l1 + 19`) */
  l2: number;
  /** 名称(`r.x + 8`,限宽 150,fs.body 加粗) */
  name: PtTextLine;
  /** 右列 `${cost}点 · Lv.${tier}`(右末笔 `r.x + r.w − 8`,fs.muted 加粗) */
  cost: PtTextLine;
  /** 右列「已拥有」档的文字(与 cost 同一右末笔与基线) */
  ownedText: PtTextLine;
  /** 「已拥有」左侧的勾选标记盒 */
  ownedMark: PtRect;
  /** 描述行(`r.x + 8`、基线 l2、限宽 `r.w − 24`,fs.micro) */
  desc: PtTextLine;
}

/** 整屏几何 */
export interface PrestigeLayout {
  /** 面板底矩形(panelPad 的九宫格实参矩形) */
  panel: PtRect;
  /** 面板贴图键 —— Web 的 `panelPad(g, w, h)` 不传专属键,故这一档就是 panel_dark_corners */
  panelKey: string;
  /** 标题横幅贴图盒(Web skinHeader 的 `bx = x − 8`、`by = y − h + 8`) */
  headerBanner: PtRect;
  /** 有横幅时的标题:横幅内水平居中,基线 `36 − 4` */
  titleWithBanner: PtTextLine;
  /** 缺图时的标题:左起笔于 pad,基线 36 */
  titleBare: PtTextLine;
  /** 头部小立绘(Web `assets.draw("player_pose_5", 252, 4, 38, 60)` 的固定坐标) */
  pose: PtRect;

  /** 头部四行信息 */
  echoLine: PtTextLine;
  availLine: PtTextLine;
  routeLine: PtTextLine;
  collLine: PtTextLine;

  /** 页签整条贴图打底盒 */
  tabsStrip: PtRect;
  /** 恒三枚 */
  tabs: PrestigeTabLayout[];

  /** 行区顶缘(恒 156) */
  rowsTop: number;
  /** 行区预算底缘(Web 的第三实参 `blockTop − 8`) */
  rowsBottom: number;
  /** 条件块累计让位后的纵线(Web 的 blockTop) */
  blockTop: number;
  /** 行高(spreadRows 的第一返回值) */
  rowH: number;
  /** 行距(spreadRows 的第二返回值;本屏**使用**它) */
  rowGap: number;
  /** 行步进 = rowH + gap */
  rowStep: number;
  /** 末行底边 = `rowsTop + (n − 1) × rowStep + rowH` */
  rowsEnd: number;
  /** 当前系的天赋条数(= rows.length;三系恒 10) */
  routeLen: number;
  /** 逐行几何 */
  rows: PrestigeRowLayout[];

  /** 定向搜索块的标签基线(该块不在时 null) */
  triggerLabel: PtTextLine | null;
  /** 定向搜索钮(不在档为空数组) */
  triggerBtns: PrestigeChoiceLayout[];
  /** 完美蓝图块的标签基线 */
  effectLabel: PtTextLine | null;
  /** 完美蓝图钮 */
  effectBtns: PrestigeChoiceLayout[];
  /** 拥有「完美蓝图」:决定效果钮组在不在,并吃掉 46px 行区预算 */
  hasBlueprint: boolean;
  /** 拥有「定向搜索」:决定触发器钮组在不在,并吃掉 46px 行区预算 */
  hasTargetedSearch: boolean;

  /** 开始新轮回钮 —— 热区,同时是底板矩形(描边见 PT_START_STROKE_W) */
  startBtn: PtRect;
  /** 钮文居中,fs.section 加粗 */
  startText: PtTextLine;
}

/* Web drawPrestige / prestigeLayout 的内联几何常量(屏专属常量在本文件具名一处) */
/** 开始新轮回钮:半宽 / 宽 / 高 / 底缘相对 `h − pad` 的上抬 */
export const PT_START_HALF_W = 130;
export const PT_START_W = 260;
export const PT_START_H = 52;
export const PT_START_UP = 52;
/** 条件块起始纵线与每块让位(Web 的 `startBtn.y − 10` 与两次 `blockTop −= 46`) */
export const PT_BLOCK_DY = 10;
export const PT_BLOCK_H = 46;
/** 块内钮相对标签基线的下移与钮高(Web 的 `blockTop + 18`、`h: 28`) */
export const PT_BTN_DY = 18;
export const PT_BTN_H = 28;
/** 块内钮枚数与横向间距(Web 的 `(w − pad×2 − 7×4)/8` 与 `(w − pad×2 − 5×6)/6`) */
export const PT_EFFECT_N = 8;
export const PT_EFFECT_GAP = 4;
export const PT_TRIGGER_N = 6;
export const PT_TRIGGER_GAP = 6;
/** 块标签相对块顶缘的下移(Web 的 `labelY + 10`) */
export const PT_LABEL_DY = 10;
/** 行区顶缘与预算底缘的让位(Web 的 `listY0 = 156`、`blockTop − 8`) */
export const PT_LIST_Y0 = 156;
export const PT_ROWS_BOTTOM_DY = 8;
/** 行高钳制两档(Web spreadRows 的第四/第五实参;第六实参不传 → 默认 maxGap 20) */
export const PT_ROW_MIN_H = 40;
export const PT_ROW_MAX_H = 64;
/** 页签行带(Web 的 `y = 120`、`h = 30`、恒三枚) */
export const PT_TAB_Y = 120;
export const PT_TAB_H = 30;
export const PT_TAB_N = 3;
/** 头部:标题基线 / 横幅宽高与 skinHeader 的三处让位 / 文字上抬 */
export const PT_TITLE_BASE_Y = 36;
export const PT_BANNER_W = 240;
export const PT_BANNER_H = 46;
export const PT_BANNER_DX = 8;
export const PT_BANNER_DY = 8;
export const PT_BANNER_TEXT_DY = 4;
/** 头部小立绘的固定坐标(Web 逐字照搬) */
export const PT_POSE_X = 252;
export const PT_POSE_Y = 4;
export const PT_POSE_W = 38;
export const PT_POSE_H = 60;
/** 头部四行信息的基线,以及「可支配」相对 pad 的横向偏移 */
export const PT_ECHO_BASE_Y = 60;
export const PT_AVAIL_BASE_Y = 60;
export const PT_AVAIL_DX = 210;
export const PT_ROUTE_BASE_Y = 82;
export const PT_COLL_BASE_Y = 100;
/** 节点行两行布局的两个裸加数(Web 的 `− 6` 与 `+ 19`) */
export const PT_L1_DY = 6;
export const PT_L2_DY = 19;
/** 行内三处偏移:名称起笔 / 右列末笔内缩 / 描述起笔与限宽收进 */
export const PT_NAME_DX = 8;
export const PT_NAME_MAX_W = 150;
export const PT_RIGHT_DX = 8;
export const PT_DESC_DX = 8;
export const PT_DESC_MAX_DX = 24;
/** 勾选标记:边长 / 相对 l1 的上抬 / 右缘内缩 / 与「已拥有」的间隙 */
export const PT_MARK_SIZE = 13;
export const PT_MARK_DY = 12;
export const PT_MARK_INSET = 12;
export const PT_MARK_GAP = 17;
/** 「已拥有」三字的近似量字宽(CJK = 1×px;Web 用的是 measureText,与 Cocos 不同源) */
export const PT_OWNED_TEXT_W = 3 * fs.muted;
/** 开始新轮回钮的描边宽度(Web 把 lineWidth 临时设 2 再复位 1) */
export const PT_START_STROKE_W = 2;
/** 面板九宫格切深(Web panelPad 的 drawNine 第六实参) */
export const PT_PANEL_NINE = 32;
/** 文本带限宽与相邻文本之间留的余量(Cocos 侧口径;Web 的 fillText 不限宽) */
export const TEXT_SLACK = 10;

/** 完美蓝图的八枚效果钮顺序(Web prestigeLayout 里内联的那一串) */
export const PT_EFFECT_TYPES: readonly EffectType[] = ["knife", "nova", "skeleton", "cloud", "ray", "chain", "shield", "drain"];
/** 定向搜索的六枚触发器钮顺序(Web prestigeLayout 里内联的那一串) */
export const PT_TRIGGER_TYPES: readonly TriggerType[] = ["pulse", "kill", "hurt", "move", "hit", "combo"];
/** 三系页签的顺序与标签(Web prestigeLayout 里内联的那一串) */
export const PT_TAB_DEFS: readonly { route: PtRouteKey; label: string }[] = [
  { route: "builder", label: "构筑师" },
  { route: "efficient", label: "效率专家" },
  { route: "conqueror", label: "征服者" },
];

/** 开始新轮回钮矩形(Web 的 `x = w/2 − 130`、`y = h − pad − 52`) */
export function prestigeStartBtn(w: number, h: number): PtRect {
  return { x: w / 2 - PT_START_HALF_W, y: h - ui.pad - PT_START_UP, w: PT_START_W, h: PT_START_H };
}

/**
 * 条件块累计让位后的纵线:蓝图块先减一档、定向搜索块再减一档(顺序就是 Web 的书写顺序,
 * 于是两块都在时定向搜索块落在更靠上的那一档)。
 */
export function prestigeBlockTop(w: number, h: number, hasBlueprint: boolean, hasTargetedSearch: boolean): number {
  let blockTop = prestigeStartBtn(w, h).y - PT_BLOCK_DY;
  if (hasBlueprint) blockTop -= PT_BLOCK_H;
  if (hasTargetedSearch) blockTop -= PT_BLOCK_H;
  return blockTop;
}

/** n 枚等宽钮的宽度:`(w − pad×2 − (n−1)×gap) / n` */
function choiceWidth(w: number, n: number, gap: number): number {
  return (w - ui.pad * 2 - (n - 1) * gap) / n;
}

function choiceLayout(type: TriggerType | EffectType, w: number, n: number, gap: number, blockTop: number, index: number): PrestigeChoiceLayout {
  const bw = choiceWidth(w, n, gap);
  const rect: PtRect = { x: ui.pad + index * (bw + gap), y: blockTop + PT_BTN_DY, w: bw, h: PT_BTN_H };
  return { type, rect, text: { x: rect.x + rect.w / 2, baseY: rowTextY(rect.y, rect.h, fs.micro), maxW: rect.w, px: fs.micro, align: "center" } };
}

function rowLayout(id: TalentId, index: number, rect: PtRect): PrestigeRowLayout {
  const l1 = Math.round(rect.y + rect.h / 2 - PT_L1_DY);
  const l2 = l1 + PT_L2_DY;
  const rightX = rect.x + rect.w - PT_RIGHT_DX;
  return {
    id,
    index,
    rect,
    l1,
    l2,
    name: { x: rect.x + PT_NAME_DX, baseY: l1, maxW: PT_NAME_MAX_W, px: fs.body, align: "left" },
    cost: { x: rightX, baseY: l1, maxW: rect.w - PT_NAME_DX - PT_NAME_MAX_W - TEXT_SLACK, px: fs.muted, align: "right" },
    ownedText: { x: rightX, baseY: l1, maxW: PT_OWNED_TEXT_W, px: fs.muted, align: "right" },
    ownedMark: { x: rect.x + rect.w - PT_MARK_INSET - PT_OWNED_TEXT_W - PT_MARK_GAP - PT_MARK_SIZE, y: l1 - PT_MARK_DY, w: PT_MARK_SIZE, h: PT_MARK_SIZE },
    desc: { x: rect.x + PT_DESC_DX, baseY: l2, maxW: rect.w - PT_DESC_MAX_DX, px: fs.micro, align: "left" },
  };
}

/**
 * 整屏几何。`routeIds` 就是当前系路线的 `map(n => n.id)`(三系各 10 条),
 * `hasBlueprint` / `hasTargetedSearch` 就是 `owns("blueprint")` / `owns("targeted_search")` ——
 * 三个入参全部由宿主投影传入,本层不读存档、不查拥有态。
 *
 * 行区预算是 `[PT_LIST_Y0, blockTop − 8]`,`spreadRows` 把 `rowH` 钳在 40..64、`gap` 上限 20,
 * 两个下限(`rowH ≥ 40`、`gap ≥ 4`)在预算被吃光时兜不住。最紧的一格(996 档 × 两块都在)
 * 实测 `rowH 60 / gap 7`、末行底边 819 对预算底缘 820,还剩 1px —— 三系恒 10 条,
 * 六格矩阵实测都不越界(数字见 `tests/cocos-phase4-prestige.test.ts`)。
 */
export function prestigeLayout(w: number, h: number, routeIds: readonly TalentId[], hasBlueprint: boolean, hasTargetedSearch: boolean): PrestigeLayout {
  const pad = ui.pad;
  const rowW = w - pad * 2;
  const startBtn = prestigeStartBtn(w, h);
  let blockTop = startBtn.y - PT_BLOCK_DY;

  // 蓝图块先让位(于是它落在靠下的那一档),定向搜索块后让位(靠上)—— 与 Web 的书写顺序同序
  let effectLabelY = 0;
  const effectBtns: PrestigeChoiceLayout[] = [];
  if (hasBlueprint) {
    blockTop -= PT_BLOCK_H;
    effectLabelY = blockTop;
    for (let i = 0; i < PT_EFFECT_TYPES.length; i++) effectBtns.push(choiceLayout(PT_EFFECT_TYPES[i], w, PT_EFFECT_N, PT_EFFECT_GAP, blockTop, i));
  }
  let triggerLabelY = 0;
  const triggerBtns: PrestigeChoiceLayout[] = [];
  if (hasTargetedSearch) {
    blockTop -= PT_BLOCK_H;
    triggerLabelY = blockTop;
    for (let i = 0; i < PT_TRIGGER_TYPES.length; i++) triggerBtns.push(choiceLayout(PT_TRIGGER_TYPES[i], w, PT_TRIGGER_N, PT_TRIGGER_GAP, blockTop, i));
  }

  const rowsTop = PT_LIST_Y0;
  const rowsBottom = blockTop - PT_ROWS_BOTTOM_DY;
  const { rowH, gap } = spreadRows(routeIds.length, rowsTop, rowsBottom, PT_ROW_MIN_H, PT_ROW_MAX_H);
  const rowStep = rowH + gap;
  const rows: PrestigeRowLayout[] = [];
  for (let i = 0; i < routeIds.length; i++) rows.push(rowLayout(routeIds[i], i, { x: pad, y: rowsTop + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = routeIds.length > 0 ? rowsTop + (routeIds.length - 1) * rowStep + rowH : rowsTop;

  const tabW = rowW / PT_TAB_N;
  const tabs: PrestigeTabLayout[] = PT_TAB_DEFS.map((t, i) => {
    const rect: PtRect = { x: pad + tabW * i, y: PT_TAB_Y, w: tabW, h: PT_TAB_H };
    return { route: t.route, label: t.label, rect, text: { x: rect.x + rect.w / 2, baseY: rowTextY(rect.y, rect.h, fs.muted), maxW: rect.w, px: fs.muted, align: "center" } };
  });

  const headerBanner: PtRect = { x: pad - PT_BANNER_DX, y: PT_TITLE_BASE_Y - PT_BANNER_H + PT_BANNER_DY, w: PT_BANNER_W, h: PT_BANNER_H };

  return {
    panel: { x: pad, y: pad, w: rowW, h: h - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    titleWithBanner: { x: headerBanner.x + headerBanner.w / 2, baseY: PT_TITLE_BASE_Y - PT_BANNER_TEXT_DY, maxW: headerBanner.w, px: fs.title, align: "center" },
    titleBare: { x: pad, baseY: PT_TITLE_BASE_Y, maxW: PT_POSE_X - PT_BANNER_DX - TEXT_SLACK - pad, px: fs.title, align: "left" },
    pose: { x: PT_POSE_X, y: PT_POSE_Y, w: PT_POSE_W, h: PT_POSE_H },
    // 第一行收到「可支配」起笔前;第二行右缘收到立绘起笔前;后两行整幅宽
    echoLine: { x: pad, baseY: PT_ECHO_BASE_Y, maxW: PT_AVAIL_DX - TEXT_SLACK, px: fs.body, align: "left" },
    availLine: { x: pad + PT_AVAIL_DX, baseY: PT_AVAIL_BASE_Y, maxW: w - pad - (pad + PT_AVAIL_DX), px: fs.body, align: "left" },
    routeLine: { x: pad, baseY: PT_ROUTE_BASE_Y, maxW: rowW, px: fs.micro, align: "left" },
    collLine: { x: pad, baseY: PT_COLL_BASE_Y, maxW: rowW, px: fs.micro, align: "left" },
    tabsStrip: { x: tabs[0].rect.x, y: tabs[0].rect.y, w: tabs[0].rect.w * PT_TAB_N, h: PT_TAB_H },
    tabs,
    rowsTop,
    rowsBottom,
    blockTop,
    rowH,
    rowGap: gap,
    rowStep,
    rowsEnd,
    routeLen: routeIds.length,
    rows,
    triggerLabel: hasTargetedSearch ? { x: pad, baseY: triggerLabelY + PT_LABEL_DY, maxW: rowW, px: fs.micro, align: "left" } : null,
    triggerBtns,
    effectLabel: hasBlueprint ? { x: pad, baseY: effectLabelY + PT_LABEL_DY, maxW: rowW, px: fs.micro, align: "left" } : null,
    effectBtns,
    hasBlueprint,
    hasTargetedSearch,
    startBtn,
    startText: { x: startBtn.x + startBtn.w / 2, baseY: rowTextY(startBtn.y, startBtn.h, fs.section), maxW: startBtn.w, px: fs.section, align: "center" },
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数与两个条件块在不在都由入参推出,本层不读存档) */
export function prestigeScreenLayout(w: number, h: number, routeIds: readonly TalentId[], hasBlueprint: boolean, hasTargetedSearch: boolean): PrestigeLayout {
  return prestigeLayout(w, h, routeIds, hasBlueprint, hasTargetedSearch);
}
