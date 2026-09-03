/**
 * 面板套件(宿主侧):商店屏与英雄屏共用的三种底 —— 可热换贴图底板、品质卡框、居中文本。
 *
 * 为什么要单独一个文件:Phase 1 的坞板与 Phase 2 的菜单底板各自把"有图走九宫格、
 * 缺图走暗底 + 细描边"这条回退链路写了一遍。章间商店与英雄页要画十几块底板,
 * 再复制一遍就成了第四套实现 —— 这里收敛成一处,边距仍走 `core/ViewTable.borderOf`。
 *
 * 坐标约定与全局一致:进来的矩形一律是**左上原点设计像素**,只在 placeRect 那一处换算。
 * 挂在底板节点内部的文本走"子局部矩形",必须同时把盒尺寸交给 label(否则文字飞出屏幕)。
 */

import { Graphics, Label, Node, Sprite, SpriteFrame } from "cc";
import { DESIGN_W, logicalH, placeRect, Rect } from "../core/DesignMetrics";
import { borderOf, viewTable } from "../core/ViewTable";
import { HEX, hexToColor, label, makeNode } from "./Widgets";
import { hexA } from "../game/ui/theme";

/** key:边距 → 克隆过 inset 的帧;同一张源图只克隆一次(视图每轮 refresh 都在热路径上) */
const insetCache = new Map<string, SpriteFrame>();

function insetFrame(key: string, sf: SpriteFrame, border: number): SpriteFrame {
  const id = `${key}:${border}`;
  const hit = insetCache.get(id);
  if (hit) return hit;
  const c = sf.clone();
  c.insetLeft = border;
  c.insetRight = border;
  c.insetTop = border;
  c.insetBottom = border;
  insetCache.set(id, c);
  return c;
}

/**
 * 文本盒:Web 的 `fillText(t, x, baseline)` 基线口径 → 左上原点设计像素矩形。
 * 盒顶 = 基线 − 字号 × lift,lift 走 `viewTable().menu.baselineLift`(系统字体基线近似,表可调)。
 */
export function textBand(x: number, baseY: number, w: number, px: number): Rect {
  const lift = viewTable().menu.baselineLift;
  return { x, y: Math.round(baseY - px * lift), w, h: Math.round(px * 1.25) };
}

/**
 * 文本落位:横向按对齐取锚点(左 0 / 中 0.5 / 右 1),纵向顶锚。
 * 必须按对齐取锚点 —— Label 的 overflow=NONE 会把 contentSize 改成文字实宽,
 * 锚点为 0.5 时左对齐文字会被摆到文本盒的中心(与 Web 的 fillText 起点差半个盒宽)。
 */
export function placeText(node: Node, r: Rect, align: "left" | "center" | "right" = "left"): void {
  const ax = align === "left" ? 0 : align === "center" ? 0.5 : 1;
  placeRect(node, r, DESIGN_W, logicalH(), ax, 1);
}

/** 一块可热换的底板:有图走贴图(九宫格或整图),缺图走暗底 + 描边 */
export class Plate {
  readonly node: Node;
  private sp: Sprite;
  private g: Graphics;
  private frames: Map<string, SpriteFrame>;

  constructor(name: string, parent: Node, frames: Map<string, SpriteFrame>) {
    this.frames = frames;
    this.node = makeNode(name, parent);
    this.sp = this.node.addComponent(Sprite);
    this.sp.sizeMode = Sprite.SizeMode.CUSTOM;
    this.g = this.node.addComponent(Graphics);
  }

  /**
   * 贴一块。`key` 为空或图未就绪 → 走回退形状(fill/stroke 由调用方给,默认取主题面板色)。
   * 返回是否真用上了贴图(调用方据此决定要不要再补描边强调)。
   */
  show(key: string, r: Rect, mode: "slice" | "stretch" = "slice", fill?: string, stroke?: string): boolean {
    const frame = key ? this.frames.get(key) : undefined;
    this.sp.enabled = !!frame;
    if (frame) {
      this.sp.spriteFrame = mode === "slice" ? insetFrame(key, frame, borderOf(key, frame.width, frame.height)) : frame;
      this.sp.type = mode === "slice" ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    }
    this.g.clear();
    if (!frame) {
      this.g.fillColor = hexToColor(fill ?? HEX.bgPanel);
      this.g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
      this.g.fill();
      this.g.lineWidth = 1;
      this.g.strokeColor = hexToColor(stroke ?? HEX.bgPanelLight);
      this.g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
      this.g.stroke();
    }
    placeRect(this.node, r);
    return !!frame;
  }

  setActive(on: boolean): void {
    this.node.active = on;
  }
}

/** 一枚图标:有图贴画,无图不画(调用方自己决定是否退化成文字/圆底) */
export function iconNode(name: string, parent: Node, frames: Map<string, SpriteFrame>, r: Rect): { node: Node; show: (key: string) => boolean } {
  const node = makeNode(name, parent);
  const sp = node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  placeRect(node, r);
  return {
    node,
    show: (key: string) => {
      const frame = key ? frames.get(key) : undefined;
      if (frame && sp.spriteFrame !== frame) sp.spriteFrame = frame;
      sp.enabled = !!frame;
      return !!frame;
    },
  };
}

/**
 * 品质卡框(对标 Web drawQualityFrame):圆角暗底 + 品质色描边 +
 * 内缩内发光 + 可选顶部品质色条。返回 draw 句柄,因为商店卡的品质与矩形每轮 sync 都会变。
 */
export function qualityBox(name: string, parent: Node): { node: Node; draw: (r: Rect, color: string, topBar?: boolean) => void } {
  const node = makeNode(name, parent);
  const g = node.addComponent(Graphics);
  const draw = (r: Rect, color: string, topBar = false) => {
    const radius = 4;
    g.clear();
    g.fillColor = hexToColor(QUALITY_FRAME_BG);
    g.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, radius);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeColor = hexToColor(color);
    g.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, radius);
    g.stroke();
    g.lineWidth = 1;
    g.strokeColor = hexToColor(hexA(color, 0.35));
    g.rect(-r.w / 2 + 2.5, -r.h / 2 + 2.5, r.w - 5, r.h - 5);
    g.stroke();
    if (topBar) {
      g.fillColor = hexToColor(color);
      g.rect(-r.w / 2 + 3, r.h / 2 - 6, r.w - 6, 3);
      g.fill();
    }
    placeRect(node, r);
  };
  return { node, draw };
}

/** 卡框暗底(Web drawQualityFrame 的 fillStyle);主题表里没有对应令牌,故在此定一处 */
export const QUALITY_FRAME_BG = "rgba(0,0,0,0.5)";

/** 纯色 + 描边的平面块(禁态按钮 / 分区条缺图回退;对标 Web 的 fillRect + strokeRect) */
export function flatBox(name: string, parent: Node): { node: Node; draw: (r: Rect, fill: string, stroke?: string) => void } {
  const node = makeNode(name, parent);
  const g = node.addComponent(Graphics);
  const draw = (r: Rect, fill: string, stroke?: string) => {
    g.clear();
    g.fillColor = hexToColor(fill);
    g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
    g.fill();
    if (stroke) {
      g.lineWidth = 1;
      g.strokeColor = hexToColor(stroke);
      g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
      g.stroke();
    }
    placeRect(node, r);
  };
  return { node, draw };
}

export interface TextOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
  /** 盒尺寸(= 所在父节点的尺寸);子局部矩形必传,否则文字飞出屏幕 */
  box: { w: number; h: number };
  /** 行高倍数(默认按字号 ×1.25,与 label() 同源) */
  lineHeight?: number;
  /** 多行正文的顶对齐 */
  top?: boolean;
}

/**
 * 底板内部的一行文本:矩形用**父节点局部坐标**(左上原点),盒尺寸交给 label。
 * 返回 Label 以便每帧 bindLabel;align 用锚点表达(placeRect 的单一换算点支持任意锚点)。
 */
export function boxText(name: string, parent: Node, r: Rect, text: string, px: number, color: string, o: TextOpts): Label {
  const ax = o.align === "center" ? 0.5 : o.align === "right" ? 1 : 0;
  const ay = o.top ? 1 : 0.5;
  const lb = label(name, parent, text, px, color, {
    bold: o.bold,
    hAlign: ax === 0.5 ? Label.HorizontalAlign.CENTER : ax === 1 ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT,
  });
  lb.verticalAlign = o.top ? Label.VerticalAlign.TOP : Label.VerticalAlign.CENTER;
  if (o.lineHeight) lb.lineHeight = o.lineHeight;
  placeRect(lb.node, r, o.box.w, o.box.h, ax, ay);
  return lb;
}

/* ================= 量字与折行(近似量字:与 HudView 同一档系数,系数本身走表) ================= */

/** 近似量字:CJK = 1×px,ASCII = hud.asciiWidth×px,空格 = hud.spaceWidth×px */
export function approxW(text: string, px: number): number {
  const h = viewTable().hud;
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += px * h.spaceWidth;
    else if (ch.charCodeAt(0) > 0x2e7f) w += px;
    else w += px * h.asciiWidth;
  }
  return w;
}

/** 单行限宽(对标 Web fitOne:超宽逐字截断补「…」) */
export function fitOne(text: string, maxW: number, px: number): string {
  if (approxW(text, px) <= maxW) return text;
  const chars = [...text];
  while (chars.length > 1 && approxW(chars.join("") + "…", px) > maxW) chars.pop();
  return chars.join("") + "…";
}

/** 按像素宽度折行(对标 Web fitLines) */
export function fitLines(text: string, maxW: number, px: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const c of [...text]) {
    const test = line + c;
    if (line && approxW(test, px) > maxW) {
      out.push(line);
      line = c;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}
