/**
 * UI 主题令牌(设计规范 v1,见 docs/UI-DESIGN.md)
 * 色彩/字阶/控件尺寸与纯几何口径,各界面统一调用。
 * Canvas2D 绘制件见 Web 侧 src/ui/themePaint.ts;本文件是 Web 与 Cocos 共用的单一事实源,不引 cc、不引 DOM。
 */

/**
 * 竖屏设计令牌(全量翻版 v2):统一字阶/控件尺寸,面板 draw 与 hit-test 共用。
 * 设计空间宽恒 560;高随视口 996→1246 伸展(战场仍锁 996 标定高)。
 */
export const fs = {
  display: 28,
  title: 22,
  section: 16,
  body: 14,
  muted: 13,
  micro: 12,
} as const;

/** 字体字符串助手(全项目单一出口) */
export const F = (px: number, bold = false): string => `${bold ? "bold " : ""}${px}px system-ui, sans-serif`;

export const ui = {
  pad: 14,
  /** 面板头部区高度(标题 + 副信息),内容区从 headerBottom() 起 */
  headerH: 64,
  backW: 72,
  backH: 34,
  /** 最小触控高(设计 px) */
  touchMin: 44,
  rowMin: 48,
  rowMax: 100,
} as const;

/**
 * n 行在 [y0,y1] 内均匀分布:行高 clamp(minH,maxH),富余摊进行距(≤maxGap,
 * 剩余落在列表尾留白——小列表拉成全屏大缝反而凌乱)。轨道型列表可放大 maxGap。
 */
export function spreadRows(n: number, y0: number, y1: number, minH: number = ui.rowMin, maxH: number = ui.rowMax, maxGap: number = 20): { rowH: number; gap: number } {
  if (n <= 0) return { rowH: 0, gap: 0 };
  const avail = Math.max(0, y1 - y0);
  const rowH = Math.max(minH, Math.min(maxH, Math.floor(avail / n) - 6));
  const gap = n > 1 ? Math.max(4, Math.min(maxGap, Math.floor((avail - n * rowH) / (n - 1)))) : 0;
  return { rowH, gap };
}

/** 行内单行文字基线(垂直居中) */
export const rowTextY = (y: number, h: number, px: number): number => Math.round(y + h / 2 + px / 3);

export const theme = {
  bgDeep: "#0B0E14",
  bgPanel: "rgba(19,24,38,0.92)",
  bgPanelLight: "rgba(30,38,58,0.6)",
  textPrimary: "#E8ECF4",
  textSecondary: "#8F9BB3",
  textMuted: "#5A6A80",
  gold: "#FFD76A",
  echo: "#C8B6FF",
  stardust: "#7FD8FF",
  /** 钻石(广告驱动硬通货) */
  diamond: "#4FC3F7",
  hp: "#FF5A6E",
  actionPrimary: "#4DFFC8",
  actionPrimaryBg: "#1D3D2E",
  actionDanger: "#FF6B7A",
  actionDangerBg: "#3A2222",
  boss: "#FF4D5E",
  select: "#5AC8FA",
  selectBg: "rgba(90,200,250,0.16)",
} as const;

/** 十六进制颜色 + 透明度 → rgba 字符串(如 hexA("#4dffc8", 0.2)) */
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- 像素栅格取偶(module = 2；居中除法与比例锚线都会算出奇数或半格) ---------- */

/** 取偶下界：1 美术 px = 2 逻辑 px，奇数坐标会让贴图错半格 */
export const evenDown = (v: number): number => Math.floor(v / 2) * 2;

/* ---------- 二次确认弹窗几何(条目 39):框居中,两钮横排居中,绘制与命中共用 ---------- */
/* 本块与 confirmRects 由 Web 与 Cocos 共读（`src/game.ts:10` 直接 import），属冻结基准：
   像素栅格的取偶与钮间距调整一律放在 Cocos 独有层 `confirm/ConfirmModel.ts`，不动这里。 */

export const CONFIRM_W = 360;
export const CONFIRM_H = 170;
export const CONFIRM_BTN_W = 150;
export const CONFIRM_BTN_H = 44;
export const CONFIRM_BTN_GAP = 14;

export interface ConfirmRects {
  box: { x: number; y: number; w: number; h: number };
  ok: { x: number; y: number; w: number; h: number };
  cancel: { x: number; y: number; w: number; h: number };
}

export function confirmRects(w: number, h: number): ConfirmRects {
  const bx = (w - CONFIRM_W) / 2;
  const by = (h - CONFIRM_H) / 2;
  const left = bx + (CONFIRM_W - (CONFIRM_BTN_W * 2 + CONFIRM_BTN_GAP)) / 2;
  const btnY = by + CONFIRM_H - 16 - CONFIRM_BTN_H;
  return {
    box: { x: bx, y: by, w: CONFIRM_W, h: CONFIRM_H },
    ok: { x: left, y: btnY, w: CONFIRM_BTN_W, h: CONFIRM_BTN_H },
    cancel: { x: left + CONFIRM_BTN_W + CONFIRM_BTN_GAP, y: btnY, w: CONFIRM_BTN_W, h: CONFIRM_BTN_H },
  };
}
