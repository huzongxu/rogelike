import { Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UITransform } from "cc";
import { placeRect, Rect } from "../core/DesignMetrics";

/** 字阶令牌,与 src/ui/theme.ts 的 fs 同源 */
export const FS = { display: 28, title: 22, section: 16, body: 14, muted: 13, micro: 12 } as const;

/** 控件尺度令牌,与 src/ui/theme.ts 的 ui 同源 */
export const UI = {
    pad: 14,
    headerH: 64,
    backW: 72,
    backH: 34,
    touchMin: 44,
    rowMin: 48,
    rowMax: 100,
} as const;

/** 调色板,与 src/ui/theme.ts 的 theme 同源(十六进制/rgba 字面量) */
export const HEX = {
    bgDeep: "#0B0E14",
    bgPanel: "rgba(19,24,38,0.92)",
    bgPanelLight: "rgba(30,38,58,0.6)",
    textPrimary: "#E8ECF4",
    textSecondary: "#8F9BB3",
    textMuted: "#5A6A80",
    gold: "#FFD76A",
    echo: "#C8B6FF",
    stardust: "#7FD8FF",
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

const colorCache = new Map<string, Color>();

/** 支持 #rgb / #rrggbb / rgba(r,g,b,a);解析失败回落纯白 */
export function hexToColor(src: string): Color {
    const hit = colorCache.get(src);
    if (hit) return hit.clone();
    const out = new Color(255, 255, 255, 255);
    const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(src.trim());
    if (rgba) {
        out.set(Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Math.round((rgba[4] === undefined ? 1 : Number(rgba[4])) * 255));
    } else {
        const hex = src.trim().replace("#", "");
        const full =
            hex.length === 3
                ? hex
                      .split("")
                      .map((c) => c + c)
                      .join("")
                : hex.slice(0, 6);
        const v = parseInt(full, 16);
        if (Number.isFinite(v)) {
            out.set((v >> 16) & 255, (v >> 8) & 255, v & 255, 255);
        }
    }
    colorCache.set(src, out);
    return out.clone();
}

export function makeNode(name: string, parent: Node | null = null): Node {
    const n = new Node(name);
    // 运行时节点默认不在 UI_2D 层,Canvas 相机会漏渲染,统一在此兜底
    n.layer = Layers.Enum.UI_2D;
    if (parent) parent.addChild(n);
    return n;
}

/** 系统字体标签:替代 ctx.fillText,避免随包分发字体文件 */
export function label(
    name: string,
    parent: Node,
    text: string,
    px: number,
    color: string,
    opts?: { bold?: boolean; rect?: Rect; hAlign?: Label.HorizontalAlign; wrap?: boolean; box?: { w: number; h: number } }
): Label {
    const node = makeNode(name, parent);
    const lb = node.addComponent(Label);
    lb.string = text;
    lb.fontSize = px;
    lb.lineHeight = Math.round(px * 1.25);
    lb.useSystemFont = true;
    lb.fontFamily = "system-ui, sans-serif";
    lb.color = hexToColor(color);
    lb.isBold = !!opts?.bold;
    if (opts?.hAlign !== undefined) lb.horizontalAlign = opts.hAlign;
    if (opts?.wrap) lb.overflow = Label.Overflow.RESIZE_HEIGHT;
    if (opts?.rect) {
        if (opts.box) placeRect(node, opts.rect, opts.box.w, opts.box.h);
        else placeRect(node, opts.rect);
    }
    return lb;
}

/** 只改文本的标签刷新:缓存上一次值,避免每帧重排文本 */
export function bindLabel(lb: Label, text: string): void {
    if (lb.string === text) return;
    lb.string = text;
}

/** 九宫格 Sprite:边距由 ViewTable.borderOf 推导,替代 drawNineUniform */
export function sliced(
    name: string,
    parent: Node,
    frame: SpriteFrame,
    rect: Rect,
    border: number,
    tint?: string
): Sprite {
    const node = makeNode(name, parent);
    const sf = frame.clone();
    sf.insetLeft = border;
    sf.insetRight = border;
    sf.insetTop = border;
    sf.insetBottom = border;
    const sp = node.addComponent(Sprite);
    sp.spriteFrame = sf;
    sp.type = Sprite.Type.SLICED;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (tint) sp.color = hexToColor(tint);
    placeRect(node, rect);
    return sp;
}

/** 整幅贴图(背景/立绘):尺寸自 coverRect,交给调用方决定裁剪语义 */
export function cover(name: string, parent: Node, frame: SpriteFrame, rect: Rect, size: Rect): Sprite {
    const node = makeNode(name, parent);
    const sp = node.addComponent(Sprite);
    sp.spriteFrame = frame;
    sp.type = Sprite.Type.SIMPLE;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    placeRect(node, size);
    return sp;
}

/** 纯色矩形底:替代 ctx.fillStyle + fillRect;与 placeRect 共用"原点居中"绘制约定 */
export function solidRect(name: string, parent: Node, rect: Rect, color: string): Node {
    const node = makeNode(name, parent);
    const g = node.addComponent(Graphics);
    g.fillColor = hexToColor(color);
    g.rect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    g.fill();
    placeRect(node, rect);
    return node;
}

/** Graphics 绘制的矩形进度条:替代 ctx.fillRect 系列的 HP/能量/经验条 */
export function bar(
    name: string,
    parent: Node,
    rect: Rect,
    bgColor: string,
    radius = 4
): { node: Node; draw: (ratio: number, fillColor: string) => void } {
    const node = makeNode(name, parent);
    const g = node.addComponent(Graphics);
    const draw = (ratio: number, fillColor: string) => {
        const r = Math.max(0, Math.min(1, ratio));
        g.clear();
        g.fillColor = hexToColor(bgColor);
        g.roundRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h, radius);
        g.fill();
        if (r > 0) {
            g.fillColor = hexToColor(fillColor);
            g.roundRect(-rect.w / 2, -rect.h / 2, Math.max(radius * 2, rect.w * r), rect.h, radius);
            g.fill();
        }
    };
    placeRect(node, rect);
    draw(0, bgColor);
    return { node, draw };
}
