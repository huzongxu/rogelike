/**
 * 英雄技能树展开面板的纯几何(与英雄页同族:draw 与 hit-test 共读一处)。
 * 五行结构不动;本面板浮在英雄页之上,只读 `heroTree` 的 2 条分支 × 4 行(分支头 + 3 层)。
 */

import { ui } from "./theme";

export interface TreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroTreeColumnLayout {
  rect: TreeRect;
  header: TreeRect;
  rows: TreeRect[];
}

export interface HeroTreeLayout {
  dim: TreeRect;
  panel: TreeRect;
  title: { x: number; baseY: number; maxW: number; px: number };
  close: TreeRect;
  columns: HeroTreeColumnLayout[];
  footer: { x: number; baseY: number; maxW: number; px: number };
}

const PAD = 16;
const PANEL_W = 528;
const PANEL_MAX_H = 720;
const PANEL_TOP_GAP = 32;
const TITLE_H = 56;
const FOOTER_H = 40;
const COL_GAP = 12;
const ROW_GAP = 8;

const evenDown = (v: number): number => Math.floor(v / 2) * 2;

export function heroTreeLayout(w: number, h: number): HeroTreeLayout {
  const hh = evenDown(h);
  const panelH = evenDown(Math.min(PANEL_MAX_H, hh - PANEL_TOP_GAP * 2));
  const panel: TreeRect = { x: PAD, y: evenDown((hh - panelH) / 2), w: PANEL_W, h: panelH };
  const close: TreeRect = { x: panel.x + panel.w - PAD - 80, y: panel.y + 12, w: 80, h: ui.touchMin };
  const title = { x: panel.x + PAD, baseY: panel.y + 38, maxW: close.x - 12 - (panel.x + PAD), px: 18 };
  const columnsTop = panel.y + TITLE_H;
  const columnsBottom = panel.y + panel.h - FOOTER_H;
  const colW = evenDown((panel.w - PAD * 2 - COL_GAP) / 2);
  const rowH = evenDown(Math.max(72, (columnsBottom - columnsTop - ROW_GAP * 3) / 4));
  const columns: HeroTreeColumnLayout[] = [];
  for (let i = 0; i < 2; i++) {
    const x = panel.x + PAD + i * (colW + COL_GAP);
    const header: TreeRect = { x, y: columnsTop, w: colW, h: rowH };
    const rows: TreeRect[] = [];
    for (let k = 0; k < 3; k++) rows.push({ x, y: columnsTop + (k + 1) * (rowH + ROW_GAP), w: colW, h: rowH });
    columns.push({ rect: { x, y: columnsTop, w: colW, h: columnsBottom - columnsTop }, header, rows });
  }
  return {
    dim: { x: 0, y: 0, w, h: hh },
    panel,
    title,
    close,
    columns,
    footer: { x: panel.x + PAD, baseY: panel.y + panel.h - 18, maxW: panel.w - PAD * 2, px: 12 },
  };
}
