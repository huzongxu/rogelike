/**
 * 英雄立绘绘制(占位先行:本批无 AI 立绘,四级降级全在代码里)。
 *
 * 降级链(planPortrait 决策,drawHeroPortrait 执行):
 *   ① `hero_<id>` 命中 → 直接 contain-fit 真立绘
 *   ② 未命中 → 代码绘制徽章底盘(径向底 + 2 环 + 12 刻度,刻度随 now 慢转)
 *   ③ 底盘内再试徽标贴图:老 6 套 `icon_set_<setId>` / 新 6 套 `icon_fx_<首个效果>`
 *   ④ 连徽标也没有 → 实色圆盘 + 名字首字
 *
 * 立绘纪律:**contain-fit,永不裁切**。资源装不进槽位时改的是绘制端(本文件),
 * 不是把图裁扁 —— 换真立绘那天只改 ASSET_MANIFEST,不改这里的几何。
 */

import type { AssetManager } from "../platform/assets";
import type { HeroDef } from "../data/heroes";
import { setDef } from "../data/sets";
import { F, hexA, theme } from "./theme";

/** 底盘半径 = 方框半宽 × 该比例(留 4% 边缝,贴面板不顶死) */
const PORTRAIT_INSET = 0.96;
/** 外环 / 内环半径比(相对底盘半径) */
const PORTRAIT_RING_OUTER = 0.98;
const PORTRAIT_RING_INNER = 0.72;
/** 刻度环:外端落在外环上,长度 = 半径 × 该比例 */
const PORTRAIT_TICK_LEN = 0.12;
const PORTRAIT_TICKS = 12;
/** 刻度整圈旋转周期(ms) */
const PORTRAIT_SPIN_PERIOD = 12000;
/** 徽标内接正方形边长 = 内环半径 × √2 × 该比例 */
const PORTRAIT_BADGE_FILL = 0.9;
/** 兜底圆盘半径比 + 字号比 */
const PORTRAIT_DISC_R = 0.46;
const PORTRAIT_DISC_FONT = 0.42;
/** 未发布灰罩透明度 */
const PORTRAIT_LOCK_ALPHA = 0.62;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitRect extends Box {
  /** 等比缩放系数(src → 目标) */
  scale: number;
}

export interface PortraitTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PortraitRings {
  cx: number;
  cy: number;
  /** 底盘半径 */
  r: number;
  rOuter: number;
  rInner: number;
  /** 12 条刻度(已含 now 旋转角) */
  ticks: PortraitTick[];
}

export interface PortraitPlan {
  /** ① 真立绘可用 */
  usePortrait: boolean;
  /** ③ 徽标贴图键(立绘真画砸时也靠它降级);仅「套组无效果且无 icon」时为 null */
  badgeKey: string | null;
}

export interface PortraitOpts {
  /** 边长上限(行内小立绘用;不传 = 用 box 内最大正方形) */
  size?: number;
  /** 动画时钟(ms)—— 时间永远是入参,本模块不读 Date.now() */
  now?: number;
  /** 未发布:压灰 + 不给徽章高光 */
  locked?: boolean;
}

const TAU = Math.PI * 2;

/** box 内最大正方形(size 可再收),水平垂直均居中 */
export function heroPortraitRect(box: Box, sizeCap?: number): Box {
  const side = Math.max(0, Math.min(box.w, box.h, sizeCap ?? Math.min(box.w, box.h)));
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
}

/** contain-fit:srcW×srcH 等比放进 box(永不裁切),返回居中结果矩形 */
export function fitInside(box: Box, srcW: number, srcH: number): FitRect {
  if (srcW <= 0 || srcH <= 0) return { ...box, scale: 1 };
  const scale = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, scale };
}

/** 底盘环 + 刻度几何(纯函数,可在无 Canvas 下断言) */
export function portraitRings(square: Box, now = 0): PortraitRings {
  const cx = square.x + square.w / 2;
  const cy = square.y + square.h / 2;
  const r = (Math.min(square.w, square.h) / 2) * PORTRAIT_INSET;
  const rot = ((now % PORTRAIT_SPIN_PERIOD) / PORTRAIT_SPIN_PERIOD) * TAU;
  const ticks: PortraitTick[] = [];
  for (let i = 0; i < PORTRAIT_TICKS; i++) {
    const a = rot + (i / PORTRAIT_TICKS) * TAU;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const ro = r * PORTRAIT_RING_OUTER;
    ticks.push({
      x1: cx + cos * ro,
      y1: cy + sin * ro,
      x2: cx + cos * (ro - r * PORTRAIT_TICK_LEN),
      y2: cy + sin * (ro - r * PORTRAIT_TICK_LEN),
    });
  }
  return { cx, cy, r, rOuter: r * PORTRAIT_RING_OUTER, rInner: r * PORTRAIT_RING_INNER, ticks };
}

/** 徽标兜底键:新 6 套无 icon_set_*,退到首个效果图标(14 效果均有 icon_fx_ 键) */
export function badgeKeyOf(hero: HeroDef): string {
  return setDef(hero.setId).effects.length > 0 ? `icon_fx_${setDef(hero.setId).effects[0]}` : hero.iconKey;
}

/** 降级决策:ready 探针注入 → 链路可测,不依赖真实 AssetManager */
export function planPortrait(hero: HeroDef, ready: (key: string) => boolean): PortraitPlan {
  const badgeKey = ready(hero.iconKey) ? hero.iconKey : badgeKeyOf(hero);
  return { usePortrait: ready(hero.portraitKey), badgeKey };
}

function circle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, Math.max(0, r), 0, TAU);
}

function drawBadgePlate(g: CanvasRenderingContext2D, ring: PortraitRings, hero: HeroDef): void {
  circle(g, ring.cx, ring.cy, ring.r * PORTRAIT_DISC_R);
  g.fillStyle = hexA(hero.accentColor, 0.22);
  g.fill();
  g.strokeStyle = hexA(hero.accentColor, 0.75);
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = theme.textPrimary;
  g.font = F(Math.round(ring.r * PORTRAIT_DISC_FONT), true);
  g.textAlign = "center";
  g.fillText(hero.name.slice(0, 1), ring.cx, ring.cy + ring.r * 0.16);
  g.textAlign = "left";
}

/**
 * 绘制英雄立绘。缺资产时静默降级(永不抛错),返回 false 表示走了兜底链,
 * 调用方可据此决定是否再叠一层提示 —— 主菜单/列表/详情三处共用本函数。
 */
export function drawHeroPortrait(assets: AssetManager, g: CanvasRenderingContext2D, hero: HeroDef, box: Box, opts: PortraitOpts = {}): boolean {
  const square = heroPortraitRect(box, opts.size);
  const plan = planPortrait(hero, (k) => assets.isReady(k));

  if (plan.usePortrait) {
    const src = assets.sizeOf(hero.portraitKey);
    const fit = src ? fitInside(square, src.w, src.h) : square;
    if (assets.draw(g, hero.portraitKey, fit.x, fit.y, fit.w, fit.h)) {
      if (!opts.locked) return true;
      lockTint(g, square);
      return true;
    }
  }

  const ring = portraitRings(square, opts.now ?? 0);
  const grad = g.createRadialGradient(ring.cx, ring.cy, ring.r * 0.1, ring.cx, ring.cy, ring.r);
  grad.addColorStop(0, hexA(hero.accentColor, 0.34));
  grad.addColorStop(1, hexA(hero.accentColor, 0.04));
  circle(g, ring.cx, ring.cy, ring.r);
  g.fillStyle = grad;
  g.fill();

  g.strokeStyle = hexA(hero.accentColor, 0.8);
  g.lineWidth = 1.5;
  circle(g, ring.cx, ring.cy, ring.rOuter);
  g.stroke();
  g.strokeStyle = hexA(hero.accentColor, 0.35);
  g.lineWidth = 1;
  circle(g, ring.cx, ring.cy, ring.rInner);
  g.stroke();

  g.strokeStyle = hexA(hero.accentColor, 0.6);
  g.lineWidth = 2;
  g.beginPath();
  for (const t of ring.ticks) {
    g.moveTo(t.x1, t.y1);
    g.lineTo(t.x2, t.y2);
  }
  g.stroke();

  let badgePainted = false;
  if (plan.badgeKey) {
    const src = assets.sizeOf(plan.badgeKey);
    const side = ring.rInner * Math.SQRT2 * PORTRAIT_BADGE_FILL;
    const slot = { x: ring.cx - side / 2, y: ring.cy - side / 2, w: side, h: side };
    const fit = src ? fitInside(slot, src.w, src.h) : slot;
    badgePainted = assets.draw(g, plan.badgeKey, fit.x, fit.y, fit.w, fit.h);
  }
  if (!badgePainted) drawBadgePlate(g, ring, hero);

  if (opts.locked) lockTint(g, square);
  return false;
}

function lockTint(g: CanvasRenderingContext2D, square: Box): void {
  const ring = portraitRings(square);
  circle(g, ring.cx, ring.cy, ring.r);
  g.fillStyle = hexA("#05070C", PORTRAIT_LOCK_ALPHA);
  g.fill();
}
