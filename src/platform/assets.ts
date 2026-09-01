/**
 * 资源管理器 —— 美术贴图加载与绘制(浏览器 Image / 微信 wx.createImage)。
 *
 * 用法:
 *   1. 资源清单见 `src/data/assets.ts`(key → 文件名,统一放 assets/ 目录)。
 *   2. 启动时 `beginLoad()` 异步加载,就绪前 `draw()` 返回 false → 调用方回退画形状。
 *   3. 美术丢图进 public/assets/(微信 minigame/assets)后自动生效,无需改代码。
 */

import { platform, type PlatformImage } from "./adapter";

export type DrawMode = "stretch" | "cover";

export class AssetManager {
  private images = new Map<string, PlatformImage | null>();
  private loaded = new Set<string>();

  constructor(
    private manifest: Record<string, string>,
    private root: string
  ) {}

  /** 皮肤钩子源(运行时换图/隐藏);未设置 = 原行为,零画面变化 */
  private skinSource: { remapKey?: (k: string) => string | undefined; isHidden?: (k: string) => boolean } | null = null;
  /** devOverride 的原件备份(key → 被覆盖前的图与就绪态),撤销时还原 */
  private devOriginals = new Map<string, { img: PlatformImage | null; loaded: boolean }>();

  /**
   * 皮肤通道:游戏启动时接线(读皮肤表快照),所有绘制入口取图前先过本钩子。
   * 传 null 解除。钩子内不得缓存状态 —— 调用方每帧按当前表解析。
   */
  setSkinSource(src: { remapKey?: (k: string) => string | undefined; isHidden?: (k: string) => boolean } | null): void {
    this.skinSource = src;
  }

  /** 皮肤解析:隐藏 → null(走与缺图完全相同的回退);换键 → 目标键;否则原键 */
  private resolveKey(key: string): string | null {
    const s = this.skinSource;
    if (s?.isHidden?.(key)) return null;
    return s?.remapKey?.(key) ?? key;
  }

  /**
   * 仅布局台:本地图片预览覆盖(刷新即失,绝不进配置)。传 null 撤销并还原原图。
   * 运行时无人调用。
   */
  devOverride(key: string, img: PlatformImage | null): void {
    if (img !== null) {
      if (!this.devOriginals.has(key)) this.devOriginals.set(key, { img: this.images.get(key) ?? null, loaded: this.loaded.has(key) });
      this.images.set(key, img);
      this.loaded.add(key);
      return;
    }
    const orig = this.devOriginals.get(key);
    if (!orig) return;
    this.devOriginals.delete(key);
    this.loaded.delete(key);
    if (orig.img) this.images.set(key, orig.img);
    else this.images.delete(key);
    if (orig.loaded) this.loaded.add(key);
  }

  /** 发起全部资源加载(异步,不阻塞;缺图/环境不支持自动跳过) */
  beginLoad(): void {
    for (const [key, file] of Object.entries(this.manifest)) {
      const img = platform.createImage();
      if (!img) {
        this.images.set(key, null);
        continue;
      }
      this.images.set(key, img);
      img.onload = () => this.loaded.add(key);
      img.onerror = () => {
        /* 缺图:保持回退绘制,不报错 */
      };
      img.src = this.root + file;
    }
  }

  /** 图片是否已加载就绪(经皮肤解析:隐藏键按缺图返回 false) */
  isReady(key: string): boolean {
    const k = this.resolveKey(key);
    return k !== null && this.loaded.has(k);
  }

  /**
   * 绘制贴图到矩形。未加载/缺失返回 false,调用方绘制回退形状。
   * mode: stretch = 拉伸铺满矩形;cover = 等比放大裁切铺满(背景用)。
   */
  draw(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, mode: DrawMode = "stretch"): boolean {
    const rk = this.resolveKey(key);
    if (rk === null) return false;
    const img = this.images.get(rk);
    if (!img || !this.loaded.has(rk) || !img.width || !img.height) return false;
    const src = img as unknown as CanvasImageSource;
    if (mode === "cover") {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      ctx.drawImage(src, x, y, w, h);
    }
    return true;
  }

  /**
   * 九宫格绘制:四角取自源图方形边角区(边长 = f×短边),按固定目标尺寸 m 绘制,
   * 边与中心区拉伸——带角饰的按钮/面板可拉伸进任意矩形而角饰不变形。
   * 未加载/缺失返回 false(与 draw 同契约);w/h 不足 2m 时退化为整体拉伸。
   */
  drawNine(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, m: number, f = 0.35): boolean {
    const rk = this.resolveKey(key);
    if (rk === null) return false;
    const img = this.images.get(rk);
    if (!img || !this.loaded.has(rk) || !img.width || !img.height) return false;
    const src = img as unknown as CanvasImageSource;
    const sw = img.width, sh = img.height;
    const mm = Math.min(m, w / 2, h / 2);
    if (mm <= 0 || w <= mm * 2 || h <= mm * 2) {
      ctx.drawImage(src, x, y, w, h);
      return true;
    }
    const sm = Math.max(1, Math.floor(Math.min(sw, sh) * f));
    const cw = sw - sm * 2, ch = sh - sm * 2; // 源中心区宽高
    const dw = w - mm * 2, dh = h - mm * 2;   // 目标中心区宽高
    // 四角
    ctx.drawImage(src, 0, 0, sm, sm, x, y, mm, mm);
    ctx.drawImage(src, sw - sm, 0, sm, sm, x + w - mm, y, mm, mm);
    ctx.drawImage(src, 0, sh - sm, sm, sm, x, y + h - mm, mm, mm);
    ctx.drawImage(src, sw - sm, sh - sm, sm, sm, x + w - mm, y + h - mm, mm, mm);
    // 四边
    ctx.drawImage(src, sm, 0, cw, sm, x + mm, y, dw, mm);
    ctx.drawImage(src, sm, sh - sm, cw, sm, x + mm, y + h - mm, dw, mm);
    ctx.drawImage(src, 0, sm, sm, ch, x, y + mm, mm, dh);
    ctx.drawImage(src, sw - sm, sm, sm, ch, x + w - mm, y + mm, mm, dh);
    // 中心
    ctx.drawImage(src, sm, sm, cw, ch, x + mm, y + mm, dw, dh);
    return true;
  }

  /**
   * 等比九宫格:角深由源图短边与**实际目标高度**推导(m = h × sm / sh),
   * 角饰与边条在任意目标高度下都不变形。drawNine 的手写角深只在单一高度等比,
   * 行高会随屏幕拉伸的列表/卡片必须走本方法。缺图契约同 drawNine。
   */
  drawNineUniform(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, f = 0.35): boolean {
    const rk = this.resolveKey(key);
    if (rk === null) return false;
    const img = this.images.get(rk);
    if (!img || !this.loaded.has(rk) || !img.width || !img.height) return false;
    const sm = Math.max(1, Math.floor(Math.min(img.width, img.height) * f));
    return this.drawNine(ctx, rk, x, y, w, h, (h * sm) / img.height, f);
  }

  /**
   * 等比九宫格底板的有效边距(与 drawNineUniform 同一套公式)——角饰/边饰占用的宽度。
   * 底板上的文字与图标须内缩此值,否则压在角饰/中央凸饰上;缺图返回 0(回退平面底板无边距)。
   */
  nineMargin(key: string, w: number, h: number, f = 0.35): number {
    const rk = this.resolveKey(key);
    if (rk === null) return 0;
    const img = this.images.get(rk);
    if (!img || !this.loaded.has(rk) || !img.width || !img.height) return 0;
    const sm = Math.max(1, Math.floor(Math.min(img.width, img.height) * f));
    return Math.round(Math.min((h * sm) / img.height, w / 2, h / 2));
  }

  /** 贴图固有宽高(供纯布局函数推导角深);未加载/缺失返回 null(与 nineMargin 缺图契约一致) */
  sizeOf(key: string): { w: number; h: number } | null {
    const rk = this.resolveKey(key);
    if (rk === null) return null;
    const img = this.images.get(rk);
    if (!img || !this.loaded.has(rk) || !img.width || !img.height) return null;
    return { w: img.width, h: img.height };
  }
}
