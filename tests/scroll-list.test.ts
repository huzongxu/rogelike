/**
 * 垂直滚动列表纯逻辑测试(英雄系统批次 M2)。
 * 守住四条:① 内容/视口/钳制三套几何在边界上不含糊;② 可视行区间恒覆盖视口且带缓冲不外溢;
 * ③ 拖拽期可越界显示、松手位恒硬钳;④ 惯性单调衰减并在有限步内停住,且任何入参组合都不越界。
 */

import { describe, it, expect } from "vitest";
import {
  clampScroll,
  contentHeightOf,
  dragScrollFrom,
  flickOf,
  inertiaNext,
  isTapGesture,
  maxScrollOf,
  scrollThumb,
  scrollViewport,
  SCROLL_DECEL,
  SCROLL_EDGE_RUBBER,
  SCROLL_FLICK_MIN_V,
  SCROLL_STOP_V,
  SCROLL_TAP_MS,
  SCROLL_TAP_SLOP,
  SCROLL_THUMB_MIN_H,
  SCROLL_TRACK_W,
  type ScrollState,
} from "@game/ui/scrollList";

/* 与英雄页同源的实参,便于逐像素核对 */
const ROW = 72;
const GAP = 8;
const STEP = ROW + GAP; // 80
const VP = 392; // 560×996 档列表视口高
const N = 12;
const CONTENT = 952; // 12×72 + 11×8
const MAX = 560; // 952 − 392

/* ---------- 1. 常量 ---------- */

describe("滚动常量", () => {
  it("阈值关系自洽:停速 < 甩速门槛,阻尼在 (0,1)", () => {
    expect(SCROLL_STOP_V).toBeLessThan(SCROLL_FLICK_MIN_V);
    expect(SCROLL_EDGE_RUBBER).toBeGreaterThan(0);
    expect(SCROLL_EDGE_RUBBER).toBeLessThan(1);
    expect(SCROLL_DECEL).toBeGreaterThan(0);
    expect(SCROLL_THUMB_MIN_H).toBeLessThan(VP);
    expect(SCROLL_TRACK_W).toBe(4);
  });

  it("点击判据不严于平台侧(微信端 d<24 / t<400ms 已先判掉大位移)", () => {
    expect(SCROLL_TAP_SLOP).toBeGreaterThanOrEqual(24);
    expect(SCROLL_TAP_MS).toBeGreaterThanOrEqual(400);
  });
});

/* ---------- 2. 内容几何与钳制 ---------- */

describe("contentHeightOf / maxScrollOf / clampScroll", () => {
  it("n≤0 → 0 高(不留空带);n=1 → 恰一行,不加尾缝", () => {
    expect(contentHeightOf(0, ROW, GAP)).toBe(0);
    expect(contentHeightOf(-3, ROW, GAP)).toBe(0);
    expect(contentHeightOf(1, ROW, GAP)).toBe(ROW);
    expect(contentHeightOf(N, ROW, GAP)).toBe(CONTENT);
  });

  it("内容不超出视口 → 无滚程;超出 → 差值", () => {
    expect(maxScrollOf(232, VP)).toBe(0);
    expect(maxScrollOf(VP, VP)).toBe(0);
    expect(maxScrollOf(CONTENT, VP)).toBe(MAX);
  });

  it("clampScroll 三态:负归 0、溢出归 max、区间内原样", () => {
    expect(clampScroll(-100, CONTENT, VP)).toBe(0);
    expect(clampScroll(9999, CONTENT, VP)).toBe(MAX);
    expect(clampScroll(123, CONTENT, VP)).toBe(123);
  });

  it("矮内容下任何 offset 都钳到 0(不可滚 = 恒贴顶)", () => {
    for (const o of [-50, 0, 50, 9999]) expect(clampScroll(o, 232, VP)).toBe(0);
  });
});

/* ---------- 3. 可视行区间 ---------- */

describe("scrollViewport", () => {
  it("空列表 → first=0 / last=-1(调用方据此不造行)", () => {
    expect(scrollViewport(0, VP, ROW, GAP, 0)).toEqual({ maxOffset: 0, first: 0, last: -1 });
    expect(scrollViewport(0, VP, 0, GAP, 5)).toEqual({ maxOffset: 0, first: 0, last: -1 });
  });

  it("首/末位:顶格 0..5,滚到底 6..11", () => {
    expect(scrollViewport(0, VP, ROW, GAP, N)).toEqual({ maxOffset: MAX, first: 0, last: 5 });
    expect(scrollViewport(MAX, VP, ROW, GAP, N)).toEqual({ maxOffset: MAX, first: 6, last: 11 });
  });

  it("不漏行:凡与视口相交的行必在区间内;窗口行数有界(上下各 1 行缓冲)", () => {
    for (let o = -40; o <= MAX + 40; o += 7) {
      const w = scrollViewport(o, VP, ROW, GAP, N);
      expect(w.first).toBeLessThanOrEqual(w.last);
      expect(w.first).toBeGreaterThanOrEqual(0);
      expect(w.last).toBeLessThanOrEqual(N - 1);
      for (let i = 0; i < N; i++) {
        const top = i * STEP - Math.max(0, o);
        const intersects = top < VP && top + ROW > 0;
        if (intersects) {
          expect(i, `offset=${o} 第 ${i} 行可见却被裁掉`).toBeGreaterThanOrEqual(w.first);
          expect(i, `offset=${o} 第 ${i} 行可见却被窗口截断`).toBeLessThanOrEqual(w.last);
        }
      }
      expect(w.last - w.first + 1).toBeLessThanOrEqual(8);
    }
  });

  it("缓冲行不外溢:offset=0 时 first 仍为 0,滚到底 last 仍为末行", () => {
    expect(scrollViewport(0, VP, ROW, GAP, N).first).toBe(0);
    expect(scrollViewport(40, VP, ROW, GAP, N).first).toBe(0);
    expect(scrollViewport(MAX, VP, ROW, GAP, N).last).toBe(N - 1);
  });
});

/* ---------- 4. 滑块 ---------- */

describe("scrollThumb", () => {
  const track = { y: 78, h: VP };

  it("内容不超出视口 → null(不画轨道;判据是视口高,与轨道高无关)", () => {
    expect(scrollThumb(0, 232, VP, track)).toBeNull();
    expect(scrollThumb(0, CONTENT, CONTENT, { y: 78, h: VP })).toBeNull();
    expect(scrollThumb(0, CONTENT, CONTENT + 1, track)).toBeNull();
    expect(scrollThumb(0, 0, VP, track)).toBeNull();
  });

  it("滑块高 = 视口占比,且夹在最小高与轨道高之间", () => {
    const th = scrollThumb(0, CONTENT, VP, track)!;
    expect(th.h).toBeCloseTo((VP * VP) / CONTENT, 6);
    expect(th.h).toBeGreaterThan(SCROLL_THUMB_MIN_H);
    expect(th.h).toBeLessThan(VP);
  });

  it("顶/底两端贴合轨道,全程不越轨", () => {
    const top = scrollThumb(0, CONTENT, VP, track)!;
    expect(top.y).toBeCloseTo(track.y, 9);
    const bottom = scrollThumb(MAX, CONTENT, VP, track)!;
    expect(bottom.y + bottom.h).toBeCloseTo(track.y + track.h, 9);
    for (let o = -60; o <= MAX + 60; o += 11) {
      const th = scrollThumb(o, CONTENT, VP, track)!;
      expect(th.y).toBeGreaterThanOrEqual(track.y - 1e-9);
      expect(th.y + th.h).toBeLessThanOrEqual(track.y + track.h + 1e-9);
    }
  });
});

/* ---------- 5. 手势 ---------- */

describe("isTapGesture", () => {
  it("位移/时长各自独立判定,任一越界即非点击", () => {
    expect(isTapGesture(0, 0, 0)).toBe(true);
    expect(isTapGesture(SCROLL_TAP_SLOP, -SCROLL_TAP_SLOP, SCROLL_TAP_MS)).toBe(true);
    expect(isTapGesture(SCROLL_TAP_SLOP + 1, 0, 0)).toBe(false);
    expect(isTapGesture(0, SCROLL_TAP_SLOP + 1, 0)).toBe(false);
    expect(isTapGesture(0, 0, SCROLL_TAP_MS + 1)).toBe(false);
  });
});

describe("dragScrollFrom", () => {
  it("手指下滑 → 内容回走;区间内 display === settled(无阻尼)", () => {
    const d = dragScrollFrom(200, 80, CONTENT, VP);
    expect(d.display).toBeCloseTo(120, 9);
    expect(d.settled).toBeCloseTo(120, 9);
    expect(d.display).toBe(d.settled);
  });

  it("顶界外:display 带阻尼为负,settled 恒 0", () => {
    const d = dragScrollFrom(0, 100, CONTENT, VP);
    expect(d.display).toBeCloseTo(-100 * SCROLL_EDGE_RUBBER, 9);
    expect(d.display).toBeLessThan(0);
    expect(d.settled).toBe(0);
  });

  it("底界外:display 越过 max 但被压缩,settled 恒 max", () => {
    const d = dragScrollFrom(MAX, -100, CONTENT, VP);
    expect(d.display).toBeCloseTo(MAX + 100 * SCROLL_EDGE_RUBBER, 9);
    expect(d.display).toBeGreaterThan(MAX);
    expect(d.settled).toBe(MAX);
  });

  it("不可滚内容:任何拖拽 settled 恒 0,display 仍走阻尼(橡皮筋手感)", () => {
    const d = dragScrollFrom(0, -100, 232, VP);
    expect(d.settled).toBe(0);
    expect(d.display).toBeGreaterThan(0);
  });
});

describe("flickOf", () => {
  it("门槛以下归零(慢拖不甩),门槛及以上原样且保号", () => {
    expect(flickOf(0)).toBe(0);
    expect(flickOf(SCROLL_FLICK_MIN_V - 1)).toBe(0);
    expect(flickOf(-(SCROLL_FLICK_MIN_V - 1))).toBe(0);
    expect(flickOf(SCROLL_FLICK_MIN_V)).toBe(SCROLL_FLICK_MIN_V);
    expect(flickOf(-2000)).toBe(-2000);
  });
});

/* ---------- 6. 惯性 ---------- */

/** 从给定状态推进到停住,返回步数与末状态 */
function run(state: ScrollState, dt: number): { steps: number; end: ScrollState; peak: number; floor: number } {
  let s = state;
  let steps = 0;
  let peak = s.offset;
  let floor = s.offset;
  while (s.vel !== 0 && steps < 5000) {
    s = inertiaNext(s, dt, CONTENT, VP);
    peak = Math.max(peak, s.offset);
    floor = Math.min(floor, s.offset);
    steps++;
  }
  return { steps, end: s, peak, floor };
}

describe("inertiaNext", () => {
  it("纯函数:同入参两次调用逐字段相同(时间永远是入参,不读时钟)", () => {
    const a = inertiaNext({ offset: 100, vel: 1500 }, 0.016, CONTENT, VP);
    const b = inertiaNext({ offset: 100, vel: 1500 }, 0.016, CONTENT, VP);
    expect(a).toEqual(b);
  });

  it("vel=0 只把越界 offset 收回区间,不产生位移", () => {
    expect(inertiaNext({ offset: 9999, vel: 0 }, 0.016, CONTENT, VP)).toEqual({ offset: MAX, vel: 0 });
    expect(inertiaNext({ offset: -20, vel: 0 }, 0.016, CONTENT, VP)).toEqual({ offset: 0, vel: 0 });
  });

  it("dt≤0 视为本帧未走时间:只钳位,不吞速度(否则一次 dt=0 就杀死甩动)", () => {
    expect(inertiaNext({ offset: 100, vel: 1500 }, 0, CONTENT, VP)).toEqual({ offset: 100, vel: 1500 });
    expect(inertiaNext({ offset: 9999, vel: -1500 }, -0.01, CONTENT, VP)).toEqual({ offset: MAX, vel: -1500 });
  });

  it("向下甩:速度单调衰减、位移单调增加,总行程 ≤ v/k", () => {
    const v0 = 1500;
    let s: ScrollState = { offset: 0, vel: v0 };
    let prevV = v0 + 1;
    let prevO = -1;
    for (let i = 0; i < 200 && s.vel !== 0; i++) {
      s = inertiaNext(s, 0.016, CONTENT, VP);
      expect(Math.abs(s.vel)).toBeLessThan(Math.abs(prevV));
      expect(s.offset).toBeGreaterThan(prevO);
      prevV = s.vel;
      prevO = s.offset;
    }
    expect(s.vel).toBe(0);
    expect(s.offset).toBeGreaterThan(300);
    expect(s.offset).toBeLessThanOrEqual(v0 / SCROLL_DECEL + 1e-6);
  });

  it("触界即停:贴底/贴顶继续甩 → 一步内落在边界且速度归零", () => {
    expect(inertiaNext({ offset: 550, vel: 1500 }, 0.016, CONTENT, VP)).toEqual({ offset: MAX, vel: 0 });
    expect(inertiaNext({ offset: 5, vel: -1500 }, 0.016, CONTENT, VP)).toEqual({ offset: 0, vel: 0 });
  });

  it("有限步内必停(渐近衰减有硬停阈值),且全程不越界", () => {
    for (const v of [SCROLL_FLICK_MIN_V, 1200, 4000, -4000, 20000]) {
      for (const o of [0, 137, MAX]) {
        const r = run({ offset: o, vel: v }, 0.016);
        expect(r.end.vel).toBe(0);
        expect(r.steps).toBeLessThan(400);
        expect(r.peak).toBeLessThanOrEqual(MAX + 1e-9);
        expect(r.floor).toBeGreaterThanOrEqual(-1e-9);
        expect(r.end.offset).toBeGreaterThanOrEqual(0);
        expect(r.end.offset).toBeLessThanOrEqual(MAX);
      }
    }
  });

  it("dt 抖动不破坏不变量(解析积分,与步长无关地收敛)", () => {
    for (const dt of [0.004, 0.016, 0.033, 0.1]) {
      const r = run({ offset: 0, vel: 2400 }, dt);
      expect(r.end.vel).toBe(0);
      expect(r.end.offset).toBeGreaterThan(0);
      expect(r.end.offset).toBeLessThanOrEqual(MAX);
    }
  });
});
