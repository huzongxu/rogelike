import { ImageAsset, Node, Sprite, SpriteFrame, Texture2D, UITransform } from "cc";
import { Rect, placeRect } from "../core/DesignMetrics";
import { hexToColor, makeNode } from "./Widgets";
import { pixelNumKey } from "../game/data/pixelArt";

/**
 * 像素数字/符号条带。
 *
 * 存在的理由:像素风的数字必须走 `pxnum_*` 字形图集,系统字体的数字与贴图网格不对齐。
 * 中文继续走 `ui/Widgets.ts:label()` —— 本组件只管「整串都能用字形表表达」的情形,
 * 混排(如 `12.5万`)由调用方按 `setText()` 的返回值回落到 Label。
 *
 * 约定:
 *  - 字形框 = 贴图尺寸 × scale,`scale` 只接受正整数,保证最近邻采样是整数倍放大;
 *  - 推进宽度 advance 独立可配(默认 12 逻辑 px),字形贴边时调大它而不是改贴图;
 *  - 定位沿用 Web 版的「左上原点设计像素矩形」,与 placeRect 同一套换算。
 */

/** 含义:scale=1 时相邻两字形的推进宽度。单位:逻辑 px。依据:pxnum 字形 8 逻辑 px 宽 + 4 px 字距 */
export const PXNUM_ADVANCE = 12;

export type PixelNumberAlign = "left" | "center" | "right";

export interface PixelNumberOptions {
    /** 整数倍放大,默认 1(= 字形按贴图原尺寸落屏) */
    scale?: number;
    /** 推进宽度,逻辑 px;默认 PXNUM_ADVANCE × scale */
    advance?: number;
    /** 在给定矩形内的对齐方式,默认左对齐 */
    align?: PixelNumberAlign;
    /** 染色(十六进制 / rgba 字面量),与 Sprite.color 同一解析 */
    tint?: string;
}

export class PixelNumber {
    readonly node: Node;
    private frames: Map<string, SpriteFrame>;
    private glyphs: Node[] = [];
    private text = "";
    private scale: number;
    private advance: number;
    private align: PixelNumberAlign;
    private tint: string | undefined;
    private glyphW = 0;
    private glyphH = 0;

    constructor(name: string, parent: Node, frames: Map<string, SpriteFrame>, opts: PixelNumberOptions = {}) {
        this.node = makeNode(name, parent);
        this.node.addComponent(UITransform);
        this.frames = frames;
        this.scale = Math.max(1, Math.round(opts.scale ?? 1));
        this.advance = opts.advance ?? PXNUM_ADVANCE * this.scale;
        this.align = opts.align ?? "left";
        this.tint = opts.tint;
        this.measure();
    }

    /** 换贴图来源(skin 重排 / 流式加载完成)后重新指认字形帧 */
    setFrames(frames: Map<string, SpriteFrame>): void {
        this.frames = frames;
        this.measure();
        this.render();
    }

    setOptions(opts: PixelNumberOptions): void {
        if (opts.scale !== undefined) this.scale = Math.max(1, Math.round(opts.scale));
        if (opts.advance !== undefined) this.advance = opts.advance;
        if (opts.align !== undefined) this.align = opts.align;
        if (opts.tint !== undefined) this.tint = opts.tint;
        this.measure();
        this.render();
    }

    get currentText(): string {
        return this.text;
    }

    /** 整串宽度(含末字形,不含尾部 advance) */
    get runWidth(): number {
        return this.glyphsVisibleCount() * this.advance - (this.advance - this.glyphW);
    }

    /**
     * 写一串文本。返回 false 表示这串里有字形表外的字符(或空串),
     * 此时本组件隐藏,由调用方的 Label 继续承担显示。
     */
    setText(text: string): boolean {
        // Array.from 而非 [...text]:构建把字符串展开 downlevel 成 [].concat(text),整串会变成单元素数组
        const chars = Array.from(text);
        if (chars.length === 0 || chars.some((ch) => pixelNumKey(ch) === "")) {
            this.text = "";
            this.node.active = false;
            return false;
        }
        this.text = text;
        this.node.active = true;
        this.render(chars);
        return true;
    }

    setActive(on: boolean): void {
        this.node.active = on;
    }

    private glyphsVisibleCount(): number {
        return Array.from(this.text).length;
    }

    /** 字形尺寸取任一在图集里的帧;图集未就绪时按 8×10 的规格表兜底 */
    private measure(): void {
        for (const key of ["pxnum_0", "pxnum_8", "pxnum_1"]) {
            const sf = this.frames.get(key);
            if (sf) {
                this.glyphW = sf.width * this.scale;
                this.glyphH = sf.height * this.scale;
                return;
            }
        }
        this.glyphW = 8 * this.scale;
        this.glyphH = 10 * this.scale;
    }

    private ensure(count: number): void {
        while (this.glyphs.length < count) {
            const n = makeNode(`G${this.glyphs.length}`, this.node);
            const sp = n.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            if (this.tint) sp.color = hexToColor(this.tint);
            this.glyphs.push(n);
        }
    }

    private render(chars?: string[]): void {
        const list = chars ?? Array.from(this.text);
        this.ensure(list.length);
        const n = this.glyphs.length;
        for (let i = 0; i < n; i++) {
            const node = this.glyphs[i];
            const on = i < list.length;
            node.active = on;
            if (!on) continue;
            const sp = node.getComponent(Sprite)!;
            const sf = this.frames.get(pixelNumKey(list[i]));
            sp.spriteFrame = sf ?? null;
            const ui = node.getComponent(UITransform)!;
            ui.setContentSize(this.glyphW, this.glyphH);
            ui.setAnchorPoint(0.5, 0.5);
            node.setPosition(-this.runWidth / 2 + i * this.advance + this.glyphW / 2, 0, 0);
            if (this.tint) sp.color = hexToColor(this.tint);
        }
    }

    /** 摆进一个「左上原点」矩形:矩形给出可用区间,align 决定串落在区间哪一头 */
    place(rect: Rect): void {
        const w = Math.max(this.glyphW, this.runWidth);
        const left = this.align === "left" ? rect.x : this.align === "right" ? rect.x + rect.w - w : rect.x + (rect.w - w) / 2;
        placeRect(this.node, { x: left, y: rect.y + (rect.h - this.glyphH) / 2, w, h: this.glyphH });
    }
}

/**
 * 字形是掩码:出图管线的 flood keyout 只吃「与外界连通」的底色(pixel-kit.mjs:keyOut),
 * 0/4/6/8/9 的封闭字腔里残留的同色底被量化进调色板红族(#7a1f2a/#c0374a/#ff5a6e 一族),
 * 实机上再被 tint 相乘就呈饱和红块。这里只键出「被字身完全围住、与透明像素不连通」的红族(字腔残留);
 * 与透明四邻连通(可经红族连通)的红族视为描边/轮廓,原样保留 —— 出图侧换字形世代时本函数保持中立。
 * 字身是骨白→灰阶(r-g、r-b 都很小),红族判据不会误伤字身。
 * 仅在 DOM 平台生效(本工程的 Cocos 构建只有 web-desktop);读不到图源或无封闭红族时原样返回,不影响其它 key。
 */
export function neutraliseGlyphHoles(sf: SpriteFrame): number {
    const base = sf ? sf.texture : null;
    // SpriteFrame.texture 静态类型是 TextureBase,只有 Texture2D 才有 image(可取图源)
    if (!base || !(base instanceof Texture2D) || typeof document === "undefined") return 0;
    const tex = base;
    const src = tex.image ? (tex.image.data as unknown) : null;
    if (!src || typeof (src as { width?: unknown }).width !== "number") return 0;
    const w = tex.width;
    const h = tex.height;
    if (w <= 0 || h <= 0) return 0;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);
    const at = (x: number, y: number): number => {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        const i = (y * w + x) * 4;
        return px.data[i + 3] === 0 ? 0 : 1;
    };
    const isRed = (x: number, y: number): boolean => {
        const i = (y * w + x) * 4;
        if (px.data[i + 3] === 0) return false;
        const r = px.data[i];
        const g = px.data[i + 1];
        const b = px.data[i + 2];
        return r > 100 && r - g > 40 && r - b > 30;
    };
    // 描边判定:与透明像素四邻连通(可经红族像素连通)的红族是轮廓,不是字腔残留,必须保留
    const stroke = new Uint8Array(w * h);
    const queue: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!isRed(x, y)) continue;
            const touchesHole = at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0 || at(x, y + 1) === 0;
            if (touchesHole) {
                stroke[y * w + x] = 1;
                queue.push(y * w + x);
            }
        }
    }
    while (queue.length) {
        const cur = queue.pop() as number;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        const spread = (nx: number, ny: number): void => {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
            const ni = ny * w + nx;
            if (stroke[ni] || !isRed(nx, ny)) return;
            stroke[ni] = 1;
            queue.push(ni);
        };
        spread(cx + 1, cy);
        spread(cx - 1, cy);
        spread(cx, cy + 1);
        spread(cx, cy - 1);
    }
    let purged = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (px.data[i + 3] === 0 || stroke[y * w + x]) continue;
            if (isRed(x, y)) {
                px.data[i + 3] = 0;
                purged += 1;
            }
        }
    }
    if (purged === 0) return 0;
    ctx.putImageData(px, 0, 0);
    const next = new Texture2D();
    next.image = new ImageAsset(cv);
    sf.texture = next;
    return purged;
}

export function pixelNumber(
    name: string,
    parent: Node,
    frames: Map<string, SpriteFrame>,
    opts: PixelNumberOptions = {}
): PixelNumber {
    return new PixelNumber(name, parent, frames, opts);
}
