/**
 * 平台适配层 —— 全部平台相关 API 集中在这里。
 *
 * 浏览器环境下直接映射到 DOM/window;微信小游戏环境下映射到 wx.*。
 * 其余游戏代码一律只依赖本模块,不直接触碰 document/window/wx,
 * 因此整个游戏可以原样移植到微信小游戏(见 docs/PORTING-WECHAT.md)。
 */

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export type TouchHandler = (touches: TouchPoint[]) => void;

export interface Platform {
  readonly isWeChat: boolean;
  /** 创建全屏游戏画布 */
  createCanvas(): HTMLCanvasElement;
  /** 创建图片对象(浏览器 Image / 微信 wx.createImage;环境不支持时返回 null) */
  createImage(): PlatformImage | null;
  /** 资源根路径(统一 "assets/":浏览器指向 public/,微信指向 minigame/) */
  assetRoot(): string;
  requestAnimationFrame(cb: (t: number) => void): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  onTouchStart(h: TouchHandler): void;
  onTouchMove(h: TouchHandler): void;
  onTouchEnd(h: TouchHandler): void;
  getStorage(key: string): string | null;
  setStorage(key: string, value: string): void;
  /**
   * 激励视频广告(广告驱动的商业化核心点位)。
   * 浏览器为模拟实现(延时后直接成功),微信为 wx.createRewardedVideoAd 封装。
   * onResult(true) = 完整看完,发放奖励;false = 中途关闭/不可用,不发奖励。
   */
  showRewardedAd(onResult: (ok: boolean) => void): void;
}

/** 跨平台的图片最小接口(浏览器 HTMLImageElement 天然满足) */
export interface PlatformImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  width: number;
  height: number;
}

function detectWeChat(): boolean {
  return typeof wx !== "undefined" && typeof wx.createCanvas === "function";
}

function browserPlatform(): Platform {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  return {
    isWeChat: false,
    createCanvas: () => canvas,
    createImage: () => new Image() as unknown as PlatformImage,
    assetRoot: () => "assets/",
    requestAnimationFrame: (cb) => {
      window.requestAnimationFrame(cb);
    },
    getBoundingClientRect: () => {
      const r = canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    onTouchStart: (h) => {
      window.addEventListener("touchstart", (e) => {
        e.preventDefault();
        h(normalizeTouches(e.touches, canvas));
      });
    },
    onTouchMove: (h) => {
      window.addEventListener("touchmove", (e) => {
        e.preventDefault();
        h(normalizeTouches(e.touches, canvas));
      });
    },
    onTouchEnd: (h) => {
      // 传 changedTouches(含坐标),供 UI 点击检测使用
      window.addEventListener("touchend", (e) => {
        e.preventDefault();
        h(normalizeTouches(e.changedTouches, canvas));
      });
      window.addEventListener("touchcancel", () => h([]));
    },
    getStorage: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    setStorage: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* 隐私模式下可能失败,忽略 */
      }
    },
    showRewardedAd: (onResult) => {
      // 浏览器模拟广告:短暂延迟后直接判定完整观看(便于验证完整广告流程)
      setTimeout(() => onResult(true), 1000);
    },
  };
}

function wechatPlatform(): Platform {
  const canvas = wx.createCanvas();
  // 微信触摸坐标已是画布相对坐标
  const mapWx = (touches: any[]): TouchPoint[] =>
    (touches ?? []).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  return {
    isWeChat: true,
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    createImage: () => (typeof wx.createImage === "function" ? (wx.createImage() as PlatformImage) : null),
    assetRoot: () => "assets/",
    requestAnimationFrame: (cb) => {
      wx.requestAnimationFrame(cb as (t: number) => void);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height }),
    onTouchStart: (h) => wx.onTouchStart((e: any) => h(mapWx(e.touches))),
    onTouchMove: (h) => wx.onTouchMove((e: any) => h(mapWx(e.touches))),
    onTouchEnd: (h) => wx.onTouchEnd((e: any) => h(mapWx(e.changedTouches))),
    getStorage: (k) => {
      try {
        return wx.getStorageSync(k);
      } catch {
        return null;
      }
    },
    setStorage: (k, v) => {
      try {
        wx.setStorageSync(k, v);
      } catch {
        /* 忽略 */
      }
    },
    showRewardedAd: (onResult) => {
      try {
        if (typeof wx.createRewardedVideoAd !== "function") {
          onResult(false);
          return;
        }
        const ad = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        // 微信要求先 off 旧监听,否则同实例重复 show 会叠加回调
        if (typeof ad.offClose === "function") ad.offClose();
        ad.onClose((res: any) => onResult(res?.isEnded ?? false));
        ad.show().catch(() => {
          // 首次/失败时先 load 再 show
          ad.load()
            .then(() => ad.show())
            .catch(() => onResult(false));
        });
      } catch {
        onResult(false);
      }
    },
  };
}

function normalizeTouches(touches: TouchList, canvas: HTMLCanvasElement): TouchPoint[] {
  const rect = canvas.getBoundingClientRect();
  const out: TouchPoint[] = [];
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i];
    out.push({ id: t.identifier, x: t.clientX - rect.left, y: t.clientY - rect.top });
  }
  return out;
}

declare const wx: any; // eslint-disable-line

/**
 * 微信激励视频广告位 ID —— 真机接入时替换为申请到的广告位。
 * 浏览器模拟广告不依赖此值。
 */
export const REWARDED_AD_UNIT_ID = "adunit-xxxxxxxxxxxxxxxx";

export const platform: Platform = detectWeChat() ? wechatPlatform() : browserPlatform();
