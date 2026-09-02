/**
 * 垂直滚动列表纯逻辑(仓库首个滚动容器,可测不碰 Canvas)。
 *
 * 三条纪律:
 * ① 时间是入参 —— 本模块永不读 Date.now(),惯性推进由调用方在 update(dt) 里喂 dt。
 * ② offset 一律指「内容上移距离」(≥0 向下滚),屏幕 dy 向下为正,故 drag 时 offset 减 dy。
 * ③ 边界只有两套语义:拖拽期可越界(rubber 阻尼显示),松手/惯性期恒硬钳 [0, maxOffset]。
 */

/* ---------- 常量(集中于此,不散落字面量) ---------- */

/** 位移超过该值即判为拖动而非点击(设计 px) */
export const SCROLL_TAP_SLOP = 28;
/** 超过该时长即判为长按而非点击(ms) */
export const SCROLL_TAP_MS = 500;
/** 松手速度低于该值不产生惯性(px/s) —— 慢速拖拽就地停住 */
export const SCROLL_FLICK_MIN_V = 900;
/** 惯性衰减系数(1/s):vel 按 exp(-k·t) 衰减,k 越大停得越急 */
export const SCROLL_DECEL = 3.4;
/** 越界阻尼:拖出边界的位移按此比例显示(0.35 ≈ 拉到边界外 100px 只见 35px) */
export const SCROLL_EDGE_RUBBER = 0.35;
/** 速度低于该值视为已停(px/s),避免渐近线导致的永不停歇 */
export const SCROLL_STOP_V = 12;
/** 滚动条滑块最小高度(设计 px) */
export const SCROLL_THUMB_MIN_H = 28;
/** 滚动条轨道宽度(设计 px) */
export const SCROLL_TRACK_W = 4;

/* ---------- 类型 ---------- */

export interface ScrollState {
  /** 内容上移距离,0 = 首行贴顶 */
  offset: number;
  /** 惯性速度(px/s,offset 空间;>0 = 继续向下滚) */
  vel: number;
}

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScrollWindow {
  /** 硬钳上界(= maxScrollOf) */
  maxOffset: number;
  /** 首个可见行下标(count=0 时为 0) */
  first: number;
  /** 末个可见行下标,含(空区间为 -1) */
  last: number;
}

export interface Thumb {
  y: number;
  h: number;
}

/* ---------- 内容几何 ---------- */

/** n 行内容总高:n≤0 → 0(不留空带) */
export function contentHeightOf(n: number, rowH: number, gap: number): number {
  if (n <= 0) return 0;
  return n * rowH + (n - 1) * gap;
}

/** 可滚行程:内容比视口矮时无程可滚 */
export function maxScrollOf(contentH: number, viewportH: number): number {
  return Math.max(0, contentH - viewportH);
}

/** 硬钳到 [0, maxOffset];maxOffset 由内容/视口推出 */
export function clampScroll(offset: number, contentH: number, viewportH: number): number {
  const max = maxScrollOf(contentH, viewportH);
  return Math.max(0, Math.min(max, offset));
}

/**
 * 可视行区间:闭区间 [first,last],上下各多带 1 行缓冲,
 * 使惯性高速段的边缘行不闪。调用方按此区间只造可见行 → 命中测试天然裁剪。
 */
export function scrollViewport(offset: number, viewportH: number, rowH: number, gap: number, count: number): ScrollWindow {
  const maxOffset = maxScrollOf(contentHeightOf(count, rowH, gap), viewportH);
  if (count <= 0 || rowH <= 0) return { maxOffset, first: 0, last: -1 };
  const step = rowH + gap;
  const raw = Math.floor(Math.max(0, offset) / step);
  const first = Math.max(0, raw - 1);
  const last = Math.min(count - 1, Math.ceil((Math.max(0, offset) + viewportH) / step));
  return { maxOffset, first, last };
}

/** 轨道内滑块几何;内容不超出视口 → null(不画轨道) */
export function scrollThumb(offset: number, contentH: number, viewportH: number, track: { y: number; h: number }): Thumb | null {
  if (contentH <= 0 || viewportH <= 0 || contentH <= viewportH) return null;
  const h = Math.max(SCROLL_THUMB_MIN_H, Math.min(track.h, (track.h * viewportH) / contentH));
  const max = maxScrollOf(contentH, viewportH);
  const frac = max <= 0 ? 0 : clampScroll(offset, contentH, viewportH) / max;
  return { y: track.y + frac * (track.h - h), h };
}

/* ---------- 手势 ---------- */

/** 点击判据:位移未过 slop 且时长未过 tap 阈值(两轴分别核,横滑同样算拖动) */
export function isTapGesture(dx: number, dy: number, elapsedMs: number): boolean {
  return Math.abs(dx) <= SCROLL_TAP_SLOP && Math.abs(dy) <= SCROLL_TAP_SLOP && elapsedMs <= SCROLL_TAP_MS;
}

/** 越界阻尼:区间内原样,超出边界的位移按比例压缩 */
function rubberBand(target: number, max: number): number {
  if (target < 0) return target * SCROLL_EDGE_RUBBER;
  if (target > max) return max + (target - max) * SCROLL_EDGE_RUBBER;
  return target;
}

/**
 * 拖拽一位:dy = 屏幕纵向位移(向下为正 → 内容向回走)。
 * 返回 display(带阻尼,直接画)与 settled(硬钳,松手即 snap 到此值)。
 */
export function dragScrollFrom(startOffset: number, dy: number, contentH: number, viewportH: number): { display: number; settled: number } {
  const max = maxScrollOf(contentH, viewportH);
  return { display: rubberBand(startOffset - dy, max), settled: clampScroll(startOffset - dy, contentH, viewportH) };
}

/** 松手速度门槛:不足 flick 阈值 → 0(不惯性),避免慢拖被甩出去 */
export function flickOf(vel: number): number {
  return Math.abs(vel) < SCROLL_FLICK_MIN_V ? 0 : vel;
}

/**
 * 惯性推进一步(解析积分,不做数值累加,故 dt 抖动不累积误差):
 * offset += vel/k·(1−e^(−k·dt)),vel *= e^(−k·dt)。触界即停(无回弹动画,由调用方 snap)。
 */
export function inertiaNext(state: ScrollState, dt: number, contentH: number, viewportH: number): ScrollState {
  const max = maxScrollOf(contentH, viewportH);
  const offset = clampScroll(state.offset, contentH, viewportH);
  if (state.vel === 0) return { offset, vel: 0 };
  // dt≤0 = 本帧没走时间(同时间戳两帧),只钳位不吞速度 —— 吞了会让甩动一次静默即死
  if (dt <= 0) return { offset, vel: state.vel };
  const decay = Math.exp(-SCROLL_DECEL * dt);
  const next = offset + (state.vel / SCROLL_DECEL) * (1 - decay);
  const nextVel = state.vel * decay;
  if (next < 0 || next > max) return { offset: Math.max(0, Math.min(max, next)), vel: 0 };
  if (Math.abs(nextVel) < SCROLL_STOP_V) return { offset: next, vel: 0 };
  return { offset: next, vel: nextVel };
}
