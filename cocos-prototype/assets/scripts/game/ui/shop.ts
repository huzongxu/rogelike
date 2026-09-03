/**
 * 章间商店纯布局(几何恒定):自绘顶信息条 0..64 与底操作条 948..996,
 * 与战斗双坞同源同位;内容区 (64,948) 固定骨架自上而下顺排。
 * 底坞恒锚 worldH()≡996(与屏高无关),故本函数签名不收屏高——
 * 几何恒定是结构保证,996/1212 两档逐像素相同。
 */

import { HUD_TOP_H, HUD_BOT_H } from "./hud";

/** 顶信息条底缘(= 战斗顶坞高),内容自此始,不得越过 */
export const SHOP_TOP = HUD_TOP_H; // 64
/** 底操作条顶缘(= 标定高 996 − 战斗底坞高),内容止于此,不得留缝 */
export const SHOP_BOTTOM = 996 - HUD_BOT_H; // 948
/** 内容末行底缘(与底坞间 6px 呼吸缝) */
export const SHOP_ROW_BOTTOM = SHOP_BOTTOM - 6; // 942

export const SHOP_PAD = 14;
const CONTENT_W = 560 - SHOP_PAD * 2; // 532

export interface ShopRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShopToolBtn extends ShopRect {
  id: "refresh" | "fusion" | "restart" | "home";
  label: string;
}

export interface ShopLayoutPure {
  toolBtns: ShopToolBtn[];
  cards: ShopRect[];
  cardH: number;
  slotBtn: ShopRect;
  /** 武器管理标题条顶缘(条高 26,接首行留 4) */
  weaponLabelY: number;
  /** 占位行几何(委托方按实际武器数截取并附 id) */
  weaponRows: ShopRect[];
  destroyRects: ShopRect[];
  /** 进化标题条顶缘(底锚,含 30 标题带) */
  mergeLabelY: number;
  mergeStartY: number;
  /** 占位行几何(委托方按实际组数截取并附 group) */
  merges: ShopRect[];
  nextBtn: ShopRect;
  /** 几何占位行数(0 件 → 1 行空态) */
  nW: number;
  nM: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 商店几何:行数越多卡越矮,让位给列表;武器区/进化区按期望高
 * (武器 46/行;进化 30 标题 + 44/行)分带,互补取整,进化区底锚 942——
 * 任何行数组合内容底缘恒 942,紧贴底坞。
 * @param weaponCount 实际武器数(0 → 1 行空态占位,上限 8 = 槽位上限)
 * @param mergeCount 实际可进化组数(0 → 1 行空态占位,上限 4)
 */
export function shopLayoutPure(weaponCount: number, mergeCount: number): ShopLayoutPure {
  const nW = clamp(weaponCount, 1, 8);
  const nM = clamp(mergeCount, 1, 4);
  const N = nW + nM;

  // 工具钮行 72..108:4 钮等宽 127,间距 8(14 + 4×127 + 3×8 = 546)
  const toolDefs: { id: ShopToolBtn["id"]; label: string }[] = [
    { id: "refresh", label: "刷新" },
    { id: "fusion", label: "融合" },
    { id: "restart", label: "重开" },
    { id: "home", label: "主页" },
  ];
  const toolBtns: ShopToolBtn[] = toolDefs.map((t, i) => ({ ...t, x: SHOP_PAD + i * 135, y: 72, w: 127, h: 36 }));

  // 三张可购卡 116..:行越多卡越矮(160/176/208 三档)
  const cardH = N >= 10 ? 160 : N >= 6 ? 176 : 208;
  const cards: ShopRect[] = [0, 1, 2].map((i) => ({ x: SHOP_PAD + i * 180, y: 116, w: 172, h: cardH }));

  // 槽位+1 钮 + 武器管理标题条(高 26)+ 首行顶缘
  const slotBtn: ShopRect = { x: SHOP_PAD, y: 116 + cardH + 8, w: CONTENT_W, h: 36 };
  const weaponLabelY = slotBtn.y + slotBtn.h + 8;
  const yW0 = weaponLabelY + 30;

  // 列表带分带:期望高占比分区,互补取整(余量落在两区之间垫底区)
  const band = SHOP_ROW_BOTTOM - yW0;
  const dW = 46 * nW;
  const dM = 30 + 44 * nM;
  const wZone = Math.round((band * dW) / (dW + dM));
  const mZone = band - wZone;
  const rw = clamp(Math.floor((wZone - 4 * (nW - 1)) / nW), 34, 56);
  const rm = clamp(Math.floor((mZone - 30 - 4 * (nM - 1)) / nM), 32, 56);

  const weaponRows: ShopRect[] = [];
  for (let i = 0; i < nW; i++) weaponRows.push({ x: SHOP_PAD, y: yW0 + i * (rw + 4), w: CONTENT_W, h: rw });
  const bh = Math.min(rw - 8, 30);
  // 强化已移除(装备系统重构:场内只买不强化);销毁钮保持右缘位
  const destroyRects: ShopRect[] = weaponRows.map((r) => ({ x: 486, y: r.y + (r.h - bh) / 2, w: 60, h: bh }));

  // 进化区底锚 942:整区贴底,行数少时余量落在上方垫底区(暗底吸收)
  const mergeUsed = 30 + nM * rm + 4 * (nM - 1);
  const mergeLabelY = SHOP_ROW_BOTTOM - mergeUsed;
  const mergeStartY = mergeLabelY + 30;
  const merges: ShopRect[] = [];
  for (let i = 0; i < nM; i++) merges.push({ x: SHOP_PAD, y: mergeStartY + i * (rm + 4), w: CONTENT_W, h: rm });

  const nextBtn: ShopRect = { x: 266, y: 950, w: 280, h: 44 };

  return {
    toolBtns,
    cards,
    cardH,
    slotBtn,
    weaponLabelY,
    weaponRows,
    destroyRects,
    mergeLabelY,
    mergeStartY,
    merges,
    nextBtn,
    nW,
    nM,
  };
}
