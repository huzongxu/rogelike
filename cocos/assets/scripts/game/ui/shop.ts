/**
 * 章间商店纯布局(列向弹性分配):顶信息条恒 0..64,底操作条贴屏高,内容带把**全部屏高富余
 * 摊给行高 / 带距 / 卡高** —— 稀疏内容不再于武器行与进化条之间堆出整段空洞,高视口也不在底坞
 * 以下留下平色带。
 *
 * 与战斗双坞同源同位的口径保留:顶坞恒 0..64,底坞恒 `屏高 − HUD_BOT_H .. 屏高`;
 * 标定高 996 的骨架与旧版同构(内容末行底缘 = 底坞顶缘 − 6),只是行带与带距改为随富余生长。
 *
 * 分配算法见 `flexFill`:每一档给 `min`(硬下限)/ `base`(标定值)/ `max`(理想上限)/ `w`
 * (封顶后继续吃富余的权重),富余按轮次均分给还有余量的档、偶数落位,档档封顶后仍有余量就按
 * 权重继续摊;缺量方向同理向下收到 `min`。于是任何「行数 × 屏高」组合的内容底缘恒贴底坞。
 *
 * 网格:页边距 16、内容宽 528、右缘 544,坐标与尺寸全取偶。
 */

import { HUD_BOT_H, HUD_TOP_H } from "./hud";

/** 战场标定高:此高之下底坞与旧版逐像素同位,之上多出的屏高由内容吸收 */
export const SHOP_CALIBRATION_H = 996;
/** 顶信息条底缘(= 战斗顶坞高),内容自此始,不得越过 */
export const SHOP_TOP = HUD_TOP_H; // 64
/** 底操作条顶缘(标定高 996 − 战斗底坞高) */
export const SHOP_BOTTOM = SHOP_CALIBRATION_H - HUD_BOT_H; // 948
/** 内容末行底缘(标定高档:与底坞间留 `SHOP_FOOT` 呼吸缝) */
export const SHOP_ROW_BOTTOM = SHOP_BOTTOM - 6; // 942
/** 末行 → 底坞的呼吸缝(标定档) */
export const SHOP_FOOT = 6;

/** 页边距 16 / 内容宽 528:右缘恒落 544,与像素网格同一把尺 */
export const SHOP_PAD = 16;
const CONTENT_W = 560 - SHOP_PAD * 2; // 528

export interface ShopRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 品质卡框的源图几何,形状与 `viewTable.cardFrame` 一致。本层不得 import 带 `cc` 的
 * `core/ViewTable`(共享层读不到,同一个数放两边就是两个事实源),故由视图把表值传进来。
 */
export interface CardFrameGeom {
  /** 源图高度(贴图像素) */
  srcH: number;
  /** 装饰横带在源图上的起止行(含端点,贴图像素) */
  ribbon: readonly [number, number];
}

/** 卡内装饰横带的逻辑行(相对卡顶缘,单位:逻辑 px) */
export interface CardRibbon {
  top: number;
  bottom: number;
  center: number;
}

/**
 * 横带落在九宫格的可拉伸带内,故其屏上行位随节点高线性缩放:
 * `border + (源行 − border) × (h − 2·border) / (srcH − 2·border)`。
 * 标定档 h = srcH 时缩放系数为 1,屏上行位与源图行位逐像素重合。
 */
export function cardRibbon(h: number, border: number, cf: CardFrameGeom): CardRibbon {
  const span = Math.max(1, cf.srcH - border * 2);
  const k = (h - border * 2) / span;
  const top = border + (cf.ribbon[0] - border) * k;
  const bottom = border + (cf.ribbon[1] - border) * k;
  return { top, bottom, center: (top + bottom) / 2 };
}

/**
 * 卡内图标边长两档.单位:逻辑 px.依据:图标居中于横带,其底缘要给卡名行让出
 * 一行 `FS.body`(14),标定卡(208)放 36、短卡收一档到 28,四行文本仍逐档不撞.
 * 出处:逐屏视觉对标 A2(横带从图标腰上横穿)
 */
export function cardIconSize(h: number): number {
  return h >= 200 ? 36 : 28;
}

export interface ShopToolBtn extends ShopRect {
  /** passive = 被动法宝管理(docs/DESIGN-HERO-RHYTHM.md R2:融合钮退出商店、移到主菜单,这一格改给被动) */
  id: "refresh" | "passive" | "restart" | "home";
  label: string;
}

/**
 * v4「深渊铭刻」版式开关(Cocos 侧由 viewTable.phase3.shopV4 打开;Web 冻结基准不传 = 旧版式)。
 * - 工具钮 / 槽位钮收到 40..44 高、卡带恒 208(最满形态收 176)、分区标题 22 高;
 * - 武器行按**槽位数**铺满(空槽画占位行),行高 34..56,富余不再把行撑成大块;
 * - 卡带与槽位钮之间留一条说明行(套组链 / 推荐 / 卡价提示从顶信息条挪到这里);
 * - 仍有富余时落到末行与底坞之间(gapBottom),不撑行、不撑钮。
 */
export interface ShopLayoutOpts {
  v4: boolean;
  /** 当前总槽位数(v4:武器行数 = max(持有数, 槽位数),空槽也占一行) */
  slotCount?: number;
}

export interface ShopLayoutPure {
  /** 本帧屏高:几何的唯一纵向输入 */
  screenH: number;
  /** 底坞顶缘 = screenH − HUD_BOT_H,底锚全由它推 */
  dockTop: number;
  toolBtns: ShopToolBtn[];
  cards: ShopRect[];
  cardH: number;
  slotBtn: ShopRect;
  /** 武器管理标题条顶缘(条高见 `headerH`) */
  weaponLabelY: number;
  headerH: number;
  /** 武器行高 / 行距(武器行带 `weaponBandH` 的两种落法) */
  weaponRowH: number;
  weaponRowGap: number;
  weaponBandH: number;
  /** 占位行几何(委托方按实际武器数截取并附 id) */
  weaponRows: ShopRect[];
  destroyRects: ShopRect[];
  /** 强化钮几何(与 destroyRects 同高,位于其左侧;武器行内第二颗钮) */
  upgradeRects: ShopRect[];
  /** 进化标题条顶缘 */
  mergeLabelY: number;
  mergeStartY: number;
  mergeRowH: number;
  mergeRowGap: number;
  mergeBandH: number;
  /** 占位行几何(委托方按实际组数截取并附 group) */
  merges: ShopRect[];
  nextBtn: ShopRect;
  /** 内容末行底缘 = 底坞顶缘 − 呼吸缝 */
  contentBottom: number;
  /** 几何占位行数(0 件 → 1 行空态) */
  nW: number;
  nM: number;
  /** v4:卡带与槽位钮之间的说明行顶缘(行高 16;左套组链 / 推荐,右卡价提示);旧版式为 null */
  captionY: number | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** 偶数落位(2px 像素模块) */
const even = (v: number): number => Math.round(v / 2) * 2;
/** 屏高专用:向下取偶 —— 向上取会让底坞与末行底缘压出画布(1080×2340 → 逻辑 1213 → 1214 就多 1px) */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;

/** 一档列向弹性位:`min` 硬下限 / `v` 标定值 / `max` 理想上限 / `w` 续摊权重 / `ceil` 续摊天花板 */
interface FlexSlot {
  v: number;
  min: number;
  max: number;
  w: number;
  ceil: number;
}

const flex = (v: number, min: number, max: number, w: number, ceil = max): FlexSlot => ({ v: even(Math.max(v, min)), min: even(min), max: even(max), w, ceil: even(Math.max(ceil, max)) });
const sum = (slots: FlexSlot[]): number => slots.reduce((a, s) => a + s.v, 0);

/**
 * 把 total 摊给列向的每一档(就地写回 `s.v`,全部偶数)。
 * 富余方向:每轮把余量均分给「还没到 max」的档,单轮步长取偶;档档封顶后仍有余量,按 `w`
 * 继续摊到各自的 `ceil` —— 留白必须由内容吃掉,绝不在一处堆成整段空腔。
 * `ceil` 也满时残余只落到两处呼吸缝(顶坞 → 工具行、武器行带 → 进化标题),行带与卡带一分不加,
 * 于是行高上限与热区下限这两条硬约束对任何「行数 × 屏高」组合都成立。
 * 缺量方向:每轮从「还没降到 min」的档均分扣减,硬下限兜住最后一格。
 * 返回摊不平的零头(偶数),由调用方落到就近的带距上。
 */
function flexFill(slots: FlexSlot[], total: number): number {
  const target = even(total);
  let rest = target - sum(slots);
  for (let guard = 0; Math.abs(rest) >= 2 && guard < 200; guard++) {
    const open = slots.filter((s) => (rest > 0 ? s.v < s.max : s.v > s.min));
    if (!open.length) break;
    const step = Math.max(2, Math.floor(Math.abs(rest) / open.length / 2) * 2);
    let budget = Math.abs(rest);
    let used = 0;
    for (const s of open) {
      if (budget < 2) break;
      const room = Math.min(step, rest > 0 ? s.max - s.v : s.v - s.min, budget);
      s.v += rest > 0 ? room : -room;
      budget -= room;
      used += room;
    }
    if (used === 0) break;
    rest = target - sum(slots);
  }
  rest = target - sum(slots);
  if (rest < 2) return Math.min(0, rest);
  /* 封顶后仍有余量:按权重摊到各自的天花板(行带与卡带的天花板最高 → 富余优先落在内容上) */
  for (let guard = 0; rest >= 2 && guard < 64; guard++) {
    const open = slots.filter((s) => s.v < s.ceil);
    if (!open.length) break;
    const wsum = open.reduce((a, s) => a + s.w, 0);
    if (wsum <= 0) break;
    let budget = rest;
    let used = 0;
    for (const s of open) {
      if (budget < 2) break;
      const share = Math.min(Math.floor((rest * s.w) / wsum / 2) * 2, s.ceil - s.v, budget);
      s.v += share;
      budget -= share;
      used += share;
    }
    if (used === 0) break;
    rest = target - sum(slots);
  }
  /* 兜底:仍有残余只落呼吸缝(顶坞→工具行 / 武器行带→进化标题)——行带与卡带封顶后一分不加,
     于是行高恒 ≤180、热区下限恒不被撑破,富余全部由「缝」承担。 */
  for (const s of [slots[0], slots[10]]) {
    rest = target - sum(slots);
    if (rest >= 2) s.v += even(rest);
  }
  return target - sum(slots);
}

/** v4:行距恒 gap,行高吃满剩余(偶数),零头回带距 */
function rowSplitFixedGap(band: number, n: number, minH: number, gap: number): { rowH: number; gap: number; left: number } {
  const rowH = Math.max(even(minH), even(Math.floor((band - (n - 1) * gap) / n)));
  return { rowH, gap, left: Math.max(0, even(band - (n * rowH + (n - 1) * gap))) };
}

/** 行带 → 行高 + 行距:行距按带高比例取 4..12,行高吃满剩余(偶数);返回取整零头 */
function rowSplit(band: number, n: number, minH: number): { rowH: number; gap: number; left: number } {
  const gap = clamp(even(Math.floor(band / (n * 10))), 4, 12);
  const rowH = Math.max(even(minH), even(Math.floor((band - (n - 1) * gap) / n)));
  return { rowH, gap, left: Math.max(0, even(band - (n * rowH + (n - 1) * gap))) };
}

/**
 * 商店几何。`screenH` 是本帧逻辑屏高(996..1246),缺省取标定高 996 以保留旧调用口径。
 * 武器 8 行 + 进化 4 组的最满组合也落在各档硬下限之上,故任何行数 × 任何屏高都不越界。
 * @param weaponCount 实际武器数(0 → 1 行空态占位,上限 8 = 槽位上限)
 * @param mergeCount 实际可进化组数(0 → 1 行空态占位,上限 4)
 */
export function shopLayoutPure(weaponCount: number, mergeCount: number, screenH: number = SHOP_CALIBRATION_H, opts?: ShopLayoutOpts): ShopLayoutPure {
  const v4 = !!opts?.v4;
  const nW = clamp(v4 ? Math.max(weaponCount, opts?.slotCount ?? 0) : weaponCount, 1, 8);
  const nM = clamp(mergeCount, 1, 4);
  const N = nW + nM;
  const h = Math.max(SHOP_CALIBRATION_H, evenDown(screenH));
  const dockTop = h - HUD_BOT_H;
  const contentBottom = dockTop - SHOP_FOOT;

  /** 卡高三档(行越多卡越矮 160/176/208)是弹性分配的标定值,硬下限 152 保住四行文本 */
  const cardBase = N >= 10 ? 160 : N >= 6 ? 176 : 208;
  const HEAD = 30;

  const slots: FlexSlot[] = v4 ? [
    /* 钮与带距全部 max = 标定值:富余只进行带(到 56 / 48 的天花板)与末行 → 底坞那一档,钮永不被撑高 */
    flex(10, 8, 10, 0), // ① 顶坞 → 工具钮行
    flex(40, 40, 40, 0), // ② 工具钮行高
    flex(10, 8, 10, 0), // ③ 工具行 → 卡带
    flex(208, 176, 208, 0), // ④ 三张可购卡(v4 恒 208,只在最满形态下收到 176)
    flex(24, 22, 24, 0), // ⑤ 卡带 → 槽位钮(说明行落在这一档)
    flex(40, 40, 40, 0), // ⑥ 槽位钮
    flex(12, 10, 12, 0), // ⑦ 槽位钮 → 武器标题
    flex(22, 22, 22, 0), // ⑧ 武器标题行
    flex(6, 6, 6, 0), // ⑨ 标题 → 首行
    flex(nW * 52 + (nW - 1) * 6, nW * 34 + (nW - 1) * 6, nW * 56 + (nW - 1) * 6, 2), // ⑩ 武器行带(空槽也占行;行距恒 6)
    flex(12, 10, 12, 0), // ⑪ 武器行带 → 进化标题
    flex(22, 22, 22, 0), // ⑫ 进化标题行
    flex(6, 6, 6, 0), // ⑬ 标题 → 首行
    flex(nM * 44 + (nM - 1) * 6, nM * 32 + (nM - 1) * 6, nM * 48 + (nM - 1) * 6, 2), // ⑭ 进化行带(行距恒 6)
    flex(SHOP_FOOT, 4, 400, 1, 400), // ⑮ 末行 → 底坞:富余的唯一落点
  ] : [
    flex(8, 6, 36, 0.5), // ① 顶坞 → 工具钮行
    flex(48, 44, 64, 0.8), // ② 工具钮行高(44 = 热区下限)
    flex(10, 6, 56, 1.2), // ③ 工具行 → 卡带
    /** 卡带**不参与生长**:frame_<品质> 的角深按节点高推导,卡一长高白带就盖住卡名 */
    flex(cardBase, cardBase, cardBase, 0), // ④ 三张可购卡(152/176/208 三档定高)
    flex(10, 6, 56, 1.2), // ⑤ 卡带 → 槽位钮
    flex(48, 44, 64, 0.8), // ⑥ 槽位 +1 钮高
    flex(10, 6, 56, 1.2), // ⑦ 槽位钮 → 武器标题条
    flex(HEAD, 26, 44, 0.6), // ⑧ 武器标题条
    flex(6, 4, 32, 0.6), // ⑨ 标题条 → 首行
    flex(nW * 46 + (nW - 1) * 4, nW * 34 + (nW - 1) * 4, nW * 96 + (nW - 1) * 12, 3, nW * 180 + (nW - 1) * 12), // ⑩ 武器行带
    flex(14, 10, 56, 1.4), // ⑪ 武器行带 → 进化标题条(旧版那处空洞,如今只是一格带距)
    flex(HEAD, 26, 44, 0.6), // ⑫ 进化标题条
    flex(6, 4, 32, 0.6), // ⑬ 标题条 → 首行
    flex(nM * 44 + (nM - 1) * 4, nM * 32 + (nM - 1) * 4, nM * 96 + (nM - 1) * 12, 3, nM * 180 + (nM - 1) * 12), // ⑭ 进化行带
    flex(SHOP_FOOT, 4, 40, 1.2), // ⑮ 末行 → 底坞
  ];
  flexFill(slots, contentBottom - SHOP_TOP);

  const [gapTool, toolH, gapCards, cardBand, gapSlot, slotH, gapWHead, wHead, gapWRows, bandW, gapWM, mHead, gapMRows, bandM, gapBottom] = slots;

  const splitW = v4 ? rowSplitFixedGap(bandW.v, nW, 34, 6) : rowSplit(bandW.v, nW, 34);
  const splitM = v4 ? rowSplitFixedGap(bandM.v, nM, 32, 6) : rowSplit(bandM.v, nM, 32);
  /* 行带取整剩下的偶数零头回到就近的带距:总高一分不丢 */
  gapWM.v += bandW.v - (nW * splitW.rowH + (nW - 1) * splitW.gap);
  gapBottom.v += bandM.v - (nM * splitM.rowH + (nM - 1) * splitM.gap);

  /* 纵向走带:每一档的顶缘都由前档累加推出,draw 与 hit-test 共用这一份 */
  const toolY = SHOP_TOP + gapTool.v;
  const cardsY = toolY + toolH.v + gapCards.v;
  const slotY = cardsY + cardBand.v + gapSlot.v;
  const weaponLabelY = slotY + slotH.v + gapWHead.v;
  const rowsTop = weaponLabelY + wHead.v + gapWRows.v;

  /* 工具钮行:4 钮等宽 126、间距 8(16 + 4×126 + 3×8 = 544) */
  const toolDefs: { id: ShopToolBtn["id"]; label: string }[] = [
    { id: "refresh", label: "刷新" },
    { id: "passive", label: "被动" },
    { id: "restart", label: "重开" },
    { id: "home", label: "主页" },
  ];
  const toolBtns: ShopToolBtn[] = toolDefs.map((t, i) => ({ ...t, x: SHOP_PAD + i * 134, y: toolY, w: 126, h: toolH.v }));

  /* 三张可购卡:等宽 172、间距 6(16 + 3×172 + 2×6 = 544) */
  const cards: ShopRect[] = [0, 1, 2].map((i) => ({ x: SHOP_PAD + i * 178, y: cardsY, w: 172, h: cardBand.v }));

  const slotBtn: ShopRect = { x: SHOP_PAD, y: slotY, w: CONTENT_W, h: slotH.v };

  const weaponRows: ShopRect[] = [];
  for (let i = 0; i < nW; i++) weaponRows.push({ x: SHOP_PAD, y: rowsTop + i * (splitW.rowH + splitW.gap), w: CONTENT_W, h: splitW.rowH });
  /* 销毁钮:右缘贴内容列(544 − 60),高吃行内剩余(30..56),行内居中偏移保持偶数落位 */
  const rawBh = clamp(splitW.rowH - 4, 30, 56);
  const bh = (splitW.rowH - rawBh) % 4 === 0 ? rawBh : rawBh - 2;
  const destroyRects: ShopRect[] = weaponRows.map((r) => ({ x: SHOP_PAD + CONTENT_W - 60, y: r.y + (r.h - bh) / 2, w: 60, h: bh }));
  /* 强化钮:销毁钮左侧、同高,两钮之间留 4px 缝;宽 108 是为了放下"40→45 · 24金"这种带数值差的文案 */
  const upgradeRects: ShopRect[] = weaponRows.map((r) => ({ x: SHOP_PAD + CONTENT_W - 172, y: r.y + (r.h - bh) / 2, w: 108, h: bh }));

  const mergeLabelY = weaponRows[nW - 1].y + weaponRows[nW - 1].h + gapWM.v;
  const mergeStartY = mergeLabelY + mHead.v + gapMRows.v;
  const merges: ShopRect[] = [];
  for (let i = 0; i < nM; i++) merges.push({ x: SHOP_PAD, y: mergeStartY + i * (splitM.rowH + splitM.gap), w: CONTENT_W, h: splitM.rowH });

  const nextBtn: ShopRect = { x: 264, y: dockTop + 2, w: 280, h: 44 };
  /* v4 说明行(16 高):居中落在卡带与槽位钮之间那一档(该档最少 22 高) */
  const captionY = v4 ? even(cardsY + cardBand.v + Math.round((gapSlot.v - 16) / 2)) : null;

  return {
    screenH: h,
    dockTop,
    toolBtns,
    cards,
    cardH: cardBand.v,
    slotBtn,
    weaponLabelY,
    headerH: wHead.v,
    weaponRowH: splitW.rowH,
    weaponRowGap: splitW.gap,
    weaponBandH: nW * splitW.rowH + (nW - 1) * splitW.gap,
    weaponRows,
    destroyRects,
    upgradeRects,
    mergeLabelY,
    mergeStartY,
    mergeRowH: splitM.rowH,
    mergeRowGap: splitM.gap,
    mergeBandH: nM * splitM.rowH + (nM - 1) * splitM.gap,
    merges,
    nextBtn,
    contentBottom,
    nW,
    nM,
    captionY,
  };
}
