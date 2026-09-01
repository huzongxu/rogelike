/**
 * UI 主题(设计规范 v1,见 docs/UI-DESIGN.md)
 * 集中管理色彩/按钮/面板绘制,各界面统一调用。
 */

import type { AssetManager } from "../platform/assets";

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

/** 绘制玻璃面板(圆角矩形 + 细边框) */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts?: { stroke?: string; radius?: number }): void {
  const r = opts?.radius ?? 6;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fillStyle = theme.bgPanel;
  g.fill();
  if (opts?.stroke) {
    g.strokeStyle = opts.stroke;
    g.lineWidth = 1;
    g.stroke();
  }
}

/** 绘制主按钮(高 44,描边 action-primary;传入 assets 时优先九宫格按钮皮,缺图回退平面底) */
export function primaryButton(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, enabled = true, assets?: AssetManager): void {
  const skinned = enabled && assets ? assets.drawNine(g, "btn_primary", x, y, w, h, 10) : false;
  if (!skinned) {
    g.fillStyle = enabled ? theme.actionPrimaryBg : "#1A1F2A";
    g.fillRect(x, y, w, h);
    g.strokeStyle = enabled ? theme.actionPrimary : "rgba(255,255,255,0.2)";
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }
  g.fillStyle = (enabled ? theme.actionPrimary : theme.textMuted) as string;
  g.font = F(fs.section, true);
  g.textAlign = "center";
  g.fillText(label, x + w / 2, y + h / 2 + 5);
  g.textAlign = "left";
}

/** 绘制危险按钮(销毁等;传入 assets 时优先九宫格按钮皮,缺图回退平面底) */
export function dangerButton(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, assets?: AssetManager): void {
  if (!(assets && assets.drawNine(g, "btn_danger", x, y, w, h, 8))) {
    g.fillStyle = theme.actionDangerBg;
    g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(255,107,122,0.4)";
    g.lineWidth = 1;
    g.strokeRect(x, y, w, h);
  }
  g.fillStyle = theme.actionDanger as string;
  g.font = F(fs.muted);
  g.textAlign = "center";
  g.fillText(label, x + w / 2, y + h / 2 + 4);
  g.textAlign = "left";
}

/** 次级小按钮底板(九宫格按钮皮,缺图回退平面底;不含文字) */
export function minorButtonBg(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, assets?: AssetManager): void {
  if (!(assets && assets.drawNine(g, "btn_minor", x, y, w, h, 8))) {
    g.fillStyle = "#2A3D55";
    g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.lineWidth = 1;
    g.strokeRect(x, y, w, h);
  }
}

/** 绘制次级小按钮 */
export function minorButton(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, color?: string, assets?: AssetManager): void {
  minorButtonBg(g, x, y, w, h, assets);
  g.fillStyle = (color ?? theme.textSecondary) as string;
  g.font = F(fs.body, true);
  g.textAlign = "center";
  g.fillText(label, x + w / 2, y + h / 2 + 5);
  g.textAlign = "left";
}

/** 界面标题(H1 + 副标题) */
export function header(g: CanvasRenderingContext2D, title: string, x: number, y: number, color?: string): void {
  g.fillStyle = (color ?? theme.echo) as string;
  g.font = F(fs.title, true);
  g.textAlign = "left";
  g.fillText(title, x, y);
}

/** 货币显示(图标 + 数值) */
export function currency(g: CanvasRenderingContext2D, icon: string, value: number, x: number, y: number, color: string): void {
  g.fillStyle = color as string;
  g.font = F(fs.body, true);
  g.textAlign = "left";
  g.fillText(`${icon} ${value}`, x, y);
}

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

/* ---------- 二次确认弹窗几何(条目 39):框居中,两钮横排居中,绘制与命中共用 ---------- */

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
