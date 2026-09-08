/**
 * 转生与天赋屏纯几何 —— 像素暗黑翻新档(批 6):单一出口,绘制与命中判定共读这一份矩形。
 *
 * 网格:页边距 `PT_PAD = 16`、内容宽 528(右缘恒落 544)、设计高先 `evenDown(h)`,
 * 于是**所有坐标与尺寸都落在 module = 2 的偶数栅格上**(1 美术 px = 2 逻辑 px)。
 * `ui.pad`(Web 冻结档 14)在本屏不再使用,与排行榜 / 英雄两屏同一处置。
 *
 * 分区自下而上:`开始新轮回钮 → 完美蓝图块 → 定向搜索块 → 节点行区 → 页签带 → 头部四行 → 标题横幅`。
 *  - `startBtn = { x: evenDown(w/2 − 130), y: evenDown(h) − 16 − 52, w: 260, h: 52 }`,底缘正落面板内缘;
 *  - 条件块每枚钮 `h = 44`(热区下限),`PT_BLOCK_H = 68` 一档吃掉「标签 + 钮 + 缝」整块;
 *    块内钮 `bw = evenDown((528 − (n−1)×8)/n)` 后**整组居中**,余量落在组的两端而不落在列距里,
 *    所以列距恒为栅格的 8,不会出现 62.5 这类半格;
 *  - 行区预算 `[PT_LIST_Y0 = 192, blockTop − 8]`。`spreadRows` 的 rowH / gap 出数后再 `evenDown`,
 *    让下来的余量全部落进 `rowsEnd … rowsBottom` 这道**无硬上限的呼吸缝**,不落进任何有上限的字段;
 *    行内 `l1 = evenDown(y + h/2 − 6)`、`l2 = l1 + 20`,行内起笔与右缘内缩一律 16(行板 nineMargin);
 *  - 三系页签 `tabW = evenDown(528/3) = 176`、`y = 140`、`h = 44`(热区下限,Web 的 30 不达),
 *    整条贴图 `tabs_talent_three` 按固有 264×15 art px 的 2 倍 = **528×30** 落在带内顶缘下沉 8 处,
 *    既不拉伸也不切边;
 *  - 头部横幅 `banner_purple_cosmic` 走固有 120×23 → **240×46 整数倍**、盒 `(18, 18)`,
 *    完全落在面板内缘之内(Web 的 `y = −2` 会把上沿两像素裁掉,本档改掉);横幅在否两档
 *    共用基线 48,`PT_BANNER_DX / DY / TEXT_DY` 因此恒为 0,只作向后兼容保留;
 *  - 头部小立绘 `player_pose_5` 移到右列 `(500, 18, 44, 60)`,右缘就是内容列右缘 544,
 *    纵向 18..78 与四行信息基线(84 / 84 / 104 / 122)错开 —— **Web 那里文字压在立绘之上**,
 *    本档把两件事拆开:立绘不再当文字底,四行的限宽也不必再为它让位;
 *    44×60 是 67×92 源比例(0.728)下最贴近的偶数档(0.733),旧世代图,见挂账;
 *  - 已拥有档的勾选标记 `mark_check_green` 走固有 7×7 → **14×14**,与「已拥有」四字
 *    (`PT_OWNED_TEXT_W = 40`,取偶)之间留 `PT_MARK_GAP = 16`,标记整体坐在行右内缩 16 之内;
 *  - 面板底 `panel_dark_corners` 九宫格 `(16, 16, 528, evenDown(h) − 32)`。
 *
 * 命中口径(几何侧的事实):热区按 Web 的判定顺序排 —— 页签 → 逐行 → 触发器钮 → 效果钮 →
 * 开始新轮回钮。热区之外的空白**没有"其余一律"兜底**,点下去不产动作。
 * **本屏没有返回钮**:Web 的 `onPrestigeClick` 里不存在 backBtn,屏内唯一离开路径就是
 * "开始新轮回"(见 `PrestigeModel.ts` 文件头与 `docs/COCOS-MIGRATION.md` §8)。
 *
 * 文本带限宽(`maxW`)是 Cocos 侧的口径:每档都 `evenDown` 过,只决定 `fitOne` 什么时候补
 * 「…」,不改变任何起笔与基线。
 *
 * 颜色、字号、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `pt`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { fs, rowTextY, spreadRows } from "./theme";
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

/* 屏专属常量(像素暗黑翻新档:具名一处,不散在函数体里;坐标与尺寸一律取偶) */
/** 页边距 16 / 内容宽 528:右缘恒落 544,与像素栅格同一把尺(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const PT_PAD = 16;
export const PT_CONTENT_W = 528;
/** 开始新轮回钮:半宽 / 宽 / 高 / 底缘相对 `h − PT_PAD` 的上抬 */
export const PT_START_HALF_W = 130;
export const PT_START_W = 260;
export const PT_START_H = 52;
export const PT_START_UP = 52;
/** 条件块起始纵线与每块让位(块内容 = 标签基线一档 + 44 高钮,让位必须盖住整块) */
export const PT_BLOCK_DY = 10;
export const PT_BLOCK_H = 68;
/** 块内钮相对块顶缘的下移与钮高(钮高抬到热区下限 44) */
export const PT_BTN_DY = 18;
export const PT_BTN_H = 44;
/** 块内钮枚数与横向间距(列距走栅格的 8;钮宽取偶后整组居中) */
export const PT_EFFECT_N = 8;
export const PT_EFFECT_GAP = 8;
export const PT_TRIGGER_N = 6;
export const PT_TRIGGER_GAP = 8;
/** 块标签相对块顶缘的下移 */
export const PT_LABEL_DY = 12;
/** 行区顶缘与预算底缘的让位 */
export const PT_LIST_Y0 = 192;
export const PT_ROWS_BOTTOM_DY = 8;
/** 行高钳制两档(两档取偶;`spreadRows` 出数后再 evenDown,余量落进行区与块之间那道呼吸缝) */
export const PT_ROW_MIN_H = 40;
export const PT_ROW_MAX_H = 64;
/** 行距下限(取偶,零行距会让行板贴在一起) */
export const PT_ROW_MIN_GAP = 4;
/** 页签行带(热区抬到 44;`tabs_talent_three` 的固有 2 倍尺寸 528×30 垂直坐在这一带里) */
export const PT_TAB_Y = 140;
export const PT_TAB_H = 44;
export const PT_TAB_N = 3;
/** 页签整条贴图:固有尺寸 264×15 art px → 528×30 逻辑 px,相对页签带顶缘下沉 8 */
export const PT_TABS_STRIP_W = 528;
export const PT_TABS_STRIP_H = 30;
export const PT_TABS_STRIP_DY = 8;
/** 头部:标题基线 / 横幅宽高与落位(`banner_purple_cosmic` 固有 120×23 → 240×46 整数倍,不裁不拉) */
export const PT_TITLE_BASE_Y = 48;
export const PT_BANNER_W = 240;
export const PT_BANNER_H = 46;
export const PT_BANNER_X = 18;
export const PT_BANNER_Y = 18;
/** 保留键:横幅档与裸档共用同一基线,故文字相对基线的让位为 0 */
export const PT_BANNER_DX = 0;
export const PT_BANNER_DY = 0;
export const PT_BANNER_TEXT_DY = 0;
/** 头部小立绘(`player_pose_5` 源 67×92,44×60 是最贴近固有比例的偶数档;挂在右列,不再压头部四行) */
export const PT_POSE_X = 500;
export const PT_POSE_Y = 18;
export const PT_POSE_W = 44;
export const PT_POSE_H = 60;
/** 头部四行信息的基线,以及「可支配」相对 pad 的横向偏移 */
export const PT_ECHO_BASE_Y = 84;
export const PT_AVAIL_BASE_Y = 84;
export const PT_AVAIL_DX = 198;
export const PT_ROUTE_BASE_Y = 104;
export const PT_COLL_BASE_Y = 122;
/** 节点行两行布局的两个裸加数(两档取偶,l1 再 evenDown 兜一次) */
export const PT_L1_DY = 6;
export const PT_L2_DY = 20;
/** 行内三处偏移:名称起笔 / 右列末笔内缩 / 描述起笔与限宽收进(一律走行板 nineMargin 的 16) */
export const PT_NAME_DX = 16;
export const PT_NAME_MAX_W = 150;
export const PT_RIGHT_DX = 16;
export const PT_DESC_DX = 16;
export const PT_DESC_MAX_DX = 32;
/** 勾选标记:边长(`mark_check_green` 固有 7×7 → 14)/ 相对 l1 的上抬 / 右缘内缩 / 与「已拥有」的间隙 */
export const PT_MARK_SIZE = 14;
export const PT_MARK_DY = 12;
export const PT_MARK_INSET = 16;
export const PT_MARK_GAP = 16;
/** 「已拥有」三字的近似量字宽(取偶;Web 用的是 measureText,与 Cocos 不同源) */
export const PT_OWNED_TEXT_W = 40;
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

/** 取偶下界:像素栅格 module = 2,1 美术 px = 2 逻辑 px,任何奇数坐标都会让贴图错半格 */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;

/** 开始新轮回钮矩形(`x = w/2 − 130`、`y = evenDown(h) − PT_PAD − 52`;底缘贴面板内缘) */
export function prestigeStartBtn(w: number, h: number): PtRect {
  return { x: evenDown(w / 2 - PT_START_HALF_W), y: evenDown(h) - PT_PAD - PT_START_UP, w: PT_START_W, h: PT_START_H };
}

/**
 * 条件块累计让位后的纵线:蓝图块先减一档、定向搜索块再减一档(顺序就是书写顺序,
 * 于是两块都在时定向搜索块落在更靠上的那一档)。每档是整块高度(标签 + 44 高钮 + 缝)。
 */
export function prestigeBlockTop(w: number, h: number, hasBlueprint: boolean, hasTargetedSearch: boolean): number {
  let blockTop = prestigeStartBtn(w, h).y - PT_BLOCK_DY;
  if (hasBlueprint) blockTop -= PT_BLOCK_H;
  if (hasTargetedSearch) blockTop -= PT_BLOCK_H;
  return blockTop;
}

/**
 * n 枚等宽钮的一档:`bw = evenDown((contentW − (n−1)×gap) / n)`。
 * 取偶后整组宽度必然 ≤ 内容宽,余量(恒为偶)一分为二落在组的两端 —— 落在组外,
 * 不落在钮与钮之间,于是列距恒等于 `gap`,栅格不会被半格挤歪。
 */
function choiceGeom(w: number, n: number, gap: number): { bw: number; x0: number } {
  const contentW = w - PT_PAD * 2;
  // 4 的倍数:bw/2 也落在偶数上,钮内居中文字的锚点才不掉出栅格
  const bw = Math.floor((contentW - (n - 1) * gap) / n / 4) * 4;
  const slack = evenDown((contentW - (bw * n + gap * (n - 1))) / 2);
  return { bw, x0: PT_PAD + slack };
}

function choiceLayout(type: TriggerType | EffectType, w: number, n: number, gap: number, blockTop: number, index: number): PrestigeChoiceLayout {
  const { bw, x0 } = choiceGeom(w, n, gap);
  const rect: PtRect = { x: x0 + index * (bw + gap), y: blockTop + PT_BTN_DY, w: bw, h: PT_BTN_H };
  return { type, rect, text: { x: rect.x + rect.w / 2, baseY: rowTextY(rect.y, rect.h, fs.micro), maxW: evenDown(rect.w), px: fs.micro, align: "center" } };
}

function rowLayout(id: TalentId, index: number, rect: PtRect): PrestigeRowLayout {
  const l1 = evenDown(rect.y + rect.h / 2 - PT_L1_DY);
  const l2 = l1 + PT_L2_DY;
  const rightX = rect.x + rect.w - PT_RIGHT_DX;
  return {
    id,
    index,
    rect,
    l1,
    l2,
    name: { x: rect.x + PT_NAME_DX, baseY: l1, maxW: PT_NAME_MAX_W, px: fs.body, align: "left" },
    cost: { x: rightX, baseY: l1, maxW: evenDown(rect.w - PT_NAME_DX - PT_NAME_MAX_W - TEXT_SLACK), px: fs.muted, align: "right" },
    ownedText: { x: rightX, baseY: l1, maxW: PT_OWNED_TEXT_W, px: fs.muted, align: "right" },
    ownedMark: { x: rect.x + rect.w - PT_MARK_INSET - PT_OWNED_TEXT_W - PT_MARK_GAP - PT_MARK_SIZE, y: l1 - PT_MARK_DY, w: PT_MARK_SIZE, h: PT_MARK_SIZE },
    desc: { x: rect.x + PT_DESC_DX, baseY: l2, maxW: evenDown(rect.w - PT_DESC_MAX_DX), px: fs.micro, align: "left" },
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
  const hh = evenDown(h);
  const pad = PT_PAD;
  const rowW = w - pad * 2;
  const startBtn = prestigeStartBtn(w, hh);
  let blockTop = startBtn.y - PT_BLOCK_DY;

  // 蓝图块先让位(于是它落在靠下的那一档),定向搜索块后让位(靠上)—— 与绘制顺序同序
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
  const spread = spreadRows(routeIds.length, rowsTop, rowsBottom, PT_ROW_MIN_H, PT_ROW_MAX_H);
  // spreadRows 出数不带栅格意识:两档一律取偶,让下来的余量自然落进 rowsEnd..rowsBottom 那道无上限呼吸缝
  const rowH = Math.max(PT_ROW_MIN_H, evenDown(spread.rowH));
  const gap = routeIds.length > 1 ? Math.max(PT_ROW_MIN_GAP, evenDown(spread.gap)) : spread.gap;
  const rowStep = rowH + gap;
  const rows: PrestigeRowLayout[] = [];
  for (let i = 0; i < routeIds.length; i++) rows.push(rowLayout(routeIds[i], i, { x: pad, y: rowsTop + i * rowStep, w: rowW, h: rowH }));
  const rowsEnd = routeIds.length > 0 ? rowsTop + (routeIds.length - 1) * rowStep + rowH : rowsTop;

  const tabW = evenDown(rowW / PT_TAB_N);
  const tabs: PrestigeTabLayout[] = PT_TAB_DEFS.map((t, i) => {
    const rect: PtRect = { x: pad + tabW * i, y: PT_TAB_Y, w: tabW, h: PT_TAB_H };
    return { route: t.route, label: t.label, rect, text: { x: rect.x + rect.w / 2, baseY: rowTextY(rect.y, rect.h, fs.muted), maxW: evenDown(rect.w), px: fs.muted, align: "center" } };
  });

  const headerBanner: PtRect = { x: PT_BANNER_X, y: PT_BANNER_Y, w: PT_BANNER_W, h: PT_BANNER_H };
  // 立绘右缘就是内容列右缘(544);四行文字的最右锚点一律收在立绘起笔之前
  const poseRight = PT_POSE_X;
  const textMaxRight = evenDown(poseRight - TEXT_SLACK - pad);

  return {
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: "panel_dark_corners",
    headerBanner,
    titleWithBanner: { x: headerBanner.x + headerBanner.w / 2, baseY: PT_TITLE_BASE_Y - PT_BANNER_TEXT_DY, maxW: evenDown(headerBanner.w), px: fs.title, align: "center" },
    titleBare: { x: pad, baseY: PT_TITLE_BASE_Y, maxW: textMaxRight, px: fs.title, align: "left" },
    pose: { x: PT_POSE_X, y: PT_POSE_Y, w: PT_POSE_W, h: PT_POSE_H },
    // 四行都在立绘之下起笔,横向让位只为隔开同带的回响点数与可支配两点读数
    echoLine: { x: pad, baseY: PT_ECHO_BASE_Y, maxW: evenDown(PT_AVAIL_DX - TEXT_SLACK), px: fs.body, align: "left" },
    availLine: { x: pad + PT_AVAIL_DX, baseY: PT_AVAIL_BASE_Y, maxW: evenDown(w - pad - TEXT_SLACK - (pad + PT_AVAIL_DX)), px: fs.body, align: "left" },
    routeLine: { x: pad, baseY: PT_ROUTE_BASE_Y, maxW: evenDown(rowW - TEXT_SLACK), px: fs.micro, align: "left" },
    collLine: { x: pad, baseY: PT_COLL_BASE_Y, maxW: evenDown(rowW - TEXT_SLACK), px: fs.micro, align: "left" },
    tabsStrip: { x: pad + evenDown((rowW - PT_TABS_STRIP_W) / 2), y: PT_TAB_Y + PT_TABS_STRIP_DY, w: PT_TABS_STRIP_W, h: PT_TABS_STRIP_H },
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
