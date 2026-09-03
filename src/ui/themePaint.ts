/**
 * UI 主题的 Canvas2D 绘制件(Web 侧专属)。
 * 纯令牌与几何口径见 @game/ui/theme —— 那一份是 Web 与 Cocos 共用的单一事实源。
 */

import type { AssetManager } from "../platform/assets";
import { F, fs, theme } from "@game/ui/theme";

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
