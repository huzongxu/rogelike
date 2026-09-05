/**
 * 面板套件(宿主侧):商店屏与英雄屏共用的三种底 —— 可热换贴图底板、品质卡框、一行文本的落位。
 *
 * 为什么要单独一个文件:Phase 1 的坞板与 Phase 2 的菜单底板各自把"有图走九宫格、
 * 缺图走暗底 + 细描边"这条回退链路写了一遍。章间商店与英雄页要画十几块底板,
 * 再复制一遍就成了第四套实现 —— 这里收敛成一处,边距仍走 `core/ViewTable.borderOf`。
 *
 * 坐标约定与全局一致:进来的矩形一律是**左上原点设计像素**,只在 placeRect 那一处换算。
 * 文本只有 `placeLine` 一个入口:x 走 Web fillText 的对齐锚点(左/中/右),父节点是行、卡、
 * 按钮这类容器时把它的尺寸作为 box 传进来(子局部矩形),否则参照系错一档、文字整体平移。
 */

import { Graphics, Node, Sprite, SpriteFrame } from "cc";
import { DESIGN_W, logicalH, placeRect, Rect } from "../core/DesignMetrics";
import { borderOf, viewTable } from "../core/ViewTable";
import { alignAx, anchorBand, type TextAlign } from "./TextBand";
import { HEX, hexToColor, makeNode } from "./Widgets";
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
 * 一行文本落位,口径 = Web 的 `ctx.textAlign` + `fillText(t, x, baseY)`:
 * **x 随对齐取锚点**(left 起笔 / center 中心 / right 末笔),maxW 是容器内宽(已扣内缩)。
 * 布局函数交回来的就是这些锚点值,折盒的那一步在 `ui/TextBand.ts:anchorBand`,全工程只此一处。
 *
 * 纵向顶锚 + 按对齐取横向锚点:Label 的 overflow=NONE 会把 contentSize 改成文字实宽,
 * 锚点不随对齐走就会出现"左对齐文字被摆到盒中心"(与 Web 差半个盒宽)。
 *
 * `box` = 所在父节点尺寸:屏幕节点上的文本省略(全屏参照),行 / 卡 / 按钮内部的文本必传,
 * 漏传即 R5"子局部矩形忘传 box"—— 文字整体飞出屏幕。
 */
export function placeLine(node: Node, x: number, baseY: number, maxW: number, px: number, align: TextAlign = "left", box?: { w: number; h: number }): void {
  placeRect(node, anchorBand(x, baseY, maxW, px, align, viewTable().menu.baselineLift), box?.w ?? DESIGN_W, box?.h ?? logicalH(), alignAx(align), 1);
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

/**
 * 描边环带:`(r.x, r.y, r.w, r.h)` 这一圈的实心形状。语义对标 Canvas2D `strokeRect`
 * —— **中心线压在矩形边界上**、带宽由调用方给、颜色不参与额外混合(Web 侧依据见
 * `src/game.ts:1221`/`1374`/`1469` 的 `lineWidth` + `strokeRect` 同一矩形两件套),
 * 于是被涂到的像素集 = 外扩半带宽的 OUTER 减去内缩半带宽的 INNER。
 *
 * 为什么不走 `Graphics.stroke()`:本构建包实测该出口的成图带宽恒为 `lineWidth - 1.5`
 * —— 1px 描边四边覆盖率峰值 0.00(一个像素都没有)、2px 峰值 0.50(只到一半强度)、
 * 4/8/16px 分别 2.5/6.5/14.5 行,五档同一条直线。顶点是生成了(同矩形重描后
 * vertexStart 4→14、indexStart 6→30,带宽与位置都对),丢在成图那一步,不是路径被吃掉。
 * 改成真形状填充后由 UI 材质的 MSAA 负责覆盖率:奇数带宽正好摊在两行各半(峰值 0.50)、
 * 偶数带宽铺满两行(峰值 1.00),与 Web 逐像素剖面同分布。
 *
 * 上下两条走整宽(含两角),左右两条只占上下边之间:四条拼成环带、互不重叠,
 * 免得半透明描边色在角上被混两遍。
 */
function strokeRing(g: Graphics, w: number, h: number, lw: number): void {
  const hw = w / 2, hh = h / 2, hf = lw / 2;
  g.rect(-hw - hf, hh - hf, w + lw, lw);
  g.rect(-hw - hf, -hh - hf, w + lw, lw);
  if (h > lw) {
    g.rect(-hw - hf, -hh + hf, lw, h - lw);
    g.rect(hw - hf, -hh + hf, lw, h - lw);
  }
  g.fill();
}

/** 纯色 + 描边的平面块(禁态按钮 / 分区条缺图回退;对标 Web 的 fillRect + strokeRect) */
export function flatBox(name: string, parent: Node): { node: Node; draw: (r: Rect, fill: string, stroke?: string, strokeWidth?: number) => void } {
  const node = makeNode(name, parent);
  const g = node.addComponent(Graphics);
  const draw = (r: Rect, fill: string, stroke?: string, strokeWidth = 1) => {
    g.clear();
    g.fillColor = hexToColor(fill);
    g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
    g.fill();
    if (stroke) {
      g.fillColor = hexToColor(stroke);
      strokeRing(g, r.w, r.h, strokeWidth);
    }
    placeRect(node, r);
  };
  return { node, draw };
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
