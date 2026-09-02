/**
 * 英雄立绘几何 + 四级降级链测试(纯 mock,不碰真 Canvas / 不碰网络资产)。
 *
 * 三条断言纪律:
 * ① 几何用「标定盒 200×200 逐像素锚定」—— 半径/环/刻度/徽标位写成硬数字,
 *    改动比例(留边、环径、刻度长、旋转周期)会立刻红。
 * ② 降级链用「注入 ready 探针」—— 四级各走一遍,不依赖真实 AssetManager。
 * ③ 立绘纪律「contain-fit,永不裁切」用不变量扫描(不越界 + 宽高比守恒 + 居中)。
 */

import { describe, it, expect } from "vitest";
import {
  badgeKeyOf,
  drawHeroPortrait,
  fitInside,
  heroPortraitRect,
  planPortrait,
  portraitRings,
  type Box,
} from "../src/ui/heroPortrait";
import { allHeroes, heroDef } from "../src/data/heroes";
import { setDef } from "../src/data/sets";
import { ASSET_MANIFEST } from "../src/data/assets";
import { F, hexA } from "../src/ui/theme";
import type { AssetManager } from "../src/platform/assets";

/* ---------- 标定档与桩 ---------- */

/** 标定盒:整盒见方,所有像素锚点以此为唯一真相 */
const BOX: Box = { x: 0, y: 0, w: 200, h: 200 };
/** 盒心(下面所有锚点的原点) */
const C = 100;
/**
 * 锚点全部用「比例字面量 × 标定盒」现算:比例抄自 heroPortrait.ts 的私有常量,
 * 源比例一改这里必红 —— 既留住浮点尾数一致,又保住回归锁。
 */
const R = C * 0.96;
const R_OUTER = R * 0.98;
const R_INNER = R * 0.72;
const TICK_LEN = R * 0.12;
/** 徽标内接方 = rInner × √2 × 0.9,居中于底盘 */
const BADGE_SIDE = R_INNER * Math.SQRT2 * 0.9;
const BADGE_XY = C - BADGE_SIDE / 2;
/** 兜底盘半径 = r × 0.46;字号 = round(r × 0.42);基线下移 r × 0.16 */
const DISC_R = R * 0.46;
const DISC_FONT_PX = Math.round(R * 0.42);
const DISC_TEXT_Y = C + R * 0.16;
/** 未发布灰罩色值(与 PORTRAIT_LOCK_ALPHA .62 同源) */
const LOCK_FILL = "rgba(5,7,12,0.62)";

interface Op {
  op: string;
  args: number[];
  style?: string;
}

/** 记录型 ctx:fill/stroke 时把当时的样式一起钉进轨迹,便于断言色阶 */
function makeCtx() {
  const ops: Op[] = [];
  const ctx: Record<string, unknown> = {
    ops,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "left",
    beginPath: () => ops.push({ op: "beginPath", args: [] }),
    arc: (...a: number[]) => ops.push({ op: "arc", args: a }),
    fill: () => ops.push({ op: "fill", args: [], style: String(ctx.fillStyle) }),
    stroke: () => ops.push({ op: "stroke", args: [], style: String(ctx.strokeStyle) }),
    moveTo: (...a: number[]) => ops.push({ op: "moveTo", args: a }),
    lineTo: (...a: number[]) => ops.push({ op: "lineTo", args: a }),
    fillText: (...a: unknown[]) => ops.push({ op: "fillText", args: a.slice(1) as number[], style: String(a[0]) }),
    createRadialGradient: (...a: number[]) => {
      ops.push({ op: "grad", args: a });
      return { addColorStop: () => {} };
    },
  };
  return ctx as unknown as CanvasRenderingContext2D & { ops: Op[] };
}

/**
 * 派生矩形逐字段近比:几何是运行时乘积,手写十进制字面量必差末位。
 * 比例仍然写成字面量(源比例一改必红),乘积交给现算。
 */
function expectRectNear(actual: { x: number; y: number; w: number; h: number }, want: { x: number; y: number; w: number; h: number }, tag = ""): void {
  for (const k of ["x", "y", "w", "h"] as const) expect(actual[k], `${tag}${k}`).toBeCloseTo(want[k], 6);
}

interface Drawn {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 桩资产:ready 白名单 + 尺寸表 + 可选「探针 ready 但 draw 失败」(模拟加载竞态) */
function makeAssets(ready: readonly string[], sizes: Record<string, { w: number; h: number }> = {}, failDraw: readonly string[] = []) {
  const drawn: Drawn[] = [];
  const set = new Set(ready);
  const bad = new Set(failDraw);
  const stub = {
    drawn,
    isReady: (k: string) => set.has(k),
    sizeOf: (k: string) => (set.has(k) ? sizes[k] ?? null : null),
    draw: (_g: CanvasRenderingContext2D, k: string, x: number, y: number, w: number, h: number) => {
      if (!set.has(k) || bad.has(k)) return false;
      drawn.push({ key: k, x, y, w, h });
      return true;
    },
  };
  return stub as unknown as AssetManager & { drawn: Drawn[] };
}

function opsOf(ctx: CanvasRenderingContext2D & { ops: Op[] }, op: string): Op[] {
  return ctx.ops.filter((o) => o.op === op);
}

/* ---------- heroPortraitRect:box 内最大正方形 ---------- */

describe("heroPortraitRect", () => {
  it("正方盒原样返回;扁盒/高盒取短边并双轴居中", () => {
    expect(heroPortraitRect(BOX)).toEqual(BOX);
    expect(heroPortraitRect({ x: 0, y: 0, w: 200, h: 100 })).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(heroPortraitRect({ x: 0, y: 0, w: 100, h: 200 })).toEqual({ x: 0, y: 50, w: 100, h: 100 });
    expect(heroPortraitRect({ x: 28, y: 492, w: 168, h: 168 })).toEqual({ x: 28, y: 492, w: 168, h: 168 });
  });

  it("sizeCap 只收紧不放大,且仍以盒心收拢", () => {
    expect(heroPortraitRect(BOX, 80)).toEqual({ x: 60, y: 60, w: 80, h: 80 });
    expect(heroPortraitRect(BOX, 400)).toEqual(BOX);
    expect(heroPortraitRect({ x: 10, y: 10, w: 4, h: 90 }, 2)).toEqual({ x: 11, y: 54, w: 2, h: 2 });
  });

  it("退化盒(零边/负边)不产出负边长", () => {
    expect(heroPortraitRect({ x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    const sq = heroPortraitRect({ x: 10, y: 10, w: 4, h: -20 });
    expect(Math.max(sq.w, sq.h)).toBe(0);
    expect(Number.isFinite(sq.x) && Number.isFinite(sq.y)).toBe(true);
  });

  it("不变量扫描:恒为正方、恒在盒内、恒居中、边长不超盒内切", () => {
    const boxes: Box[] = [
      { x: 0, y: 0, w: 56, h: 56 },
      { x: 14, y: 78, w: 532, h: 392 },
      { x: -20, y: 5, w: 130, h: 77 },
      { x: 100, y: 100, w: 999, h: 3 },
    ];
    for (const b of boxes) {
      for (const cap of [undefined, 7, 56, 200]) {
        const s = heroPortraitRect(b, cap);
        expect(s.w, JSON.stringify({ b, cap })).toBe(s.h);
        expect(s.w).toBeLessThanOrEqual(Math.min(b.w, b.h) + 1e-9);
        expect(s.x).toBeGreaterThanOrEqual(Math.min(b.x, b.x + b.w) - 1e-9);
        expect(s.x + s.w).toBeLessThanOrEqual(Math.max(b.x, b.x + b.w) + 1e-9);
        expect(s.x + s.w / 2).toBeCloseTo(b.x + b.w / 2, 9);
        expect(s.y + s.h / 2).toBeCloseTo(b.y + b.h / 2, 9);
      }
    }
  });
});

/* ---------- fitInside:contain-fit 永不裁切 ---------- */

describe("fitInside", () => {
  it("横图/竖图放进方盒:短边贴满、长边留居中缝", () => {
    const tall = fitInside(BOX, 800, 1200);
    expect(tall.scale).toBeCloseTo(200 / 1200, 9);
    expectRectNear(tall, { x: (200 - 800 / 6) / 2, y: 0, w: 800 / 6, h: 200 }, "竖图 ");
    const wide = fitInside(BOX, 1200, 800);
    expect(wide.scale).toBeCloseTo(200 / 1200, 9);
    expectRectNear(wide, { x: 0, y: (200 - 800 / 6) / 2, w: 200, h: 800 / 6 }, "横图 ");
  });

  it("同形等比 → 铺满盒;小图允许等比放大(仍是 contain,不是裁切)", () => {
    const full = fitInside(BOX, 64, 64);
    expectRectNear(full, { x: 0, y: 0, w: 200, h: 200 });
    expect(full.scale).toBe(200 / 64);
    expect(fitInside(BOX, 200, 200).scale).toBe(1);
  });

  it("非方盒按两轴较小缩放比走", () => {
    const f = fitInside({ x: 10, y: 20, w: 300, h: 100 }, 200, 200);
    expectRectNear(f, { x: 10 + (300 - 100) / 2, y: 20, w: 100, h: 100 });
    expect(f.scale).toBe(0.5);
  });

  it("源尺寸非法(0 / 负)→ 原样给盒且 scale=1,不产出 NaN", () => {
    for (const [sw, sh] of [
      [0, 0],
      [-10, 50],
      [50, 0],
    ]) {
      const f = fitInside(BOX, sw, sh);
      expect(f).toEqual({ ...BOX, scale: 1 });
    }
  });

  it("不变量扫描:不越界 + 宽高比守恒 + 盒心对齐 + 至少一轴贴满", () => {
    const srcs = [
      [1, 1],
      [64, 64],
      [1024, 256],
      [256, 1024],
      [56, 57],
      [168, 168],
      [7, 4000],
    ];
    const boxes: Box[] = [BOX, { x: 4, y: -6, w: 100, h: 40 }, { x: 0, y: 0, w: 37, h: 37 }];
    for (const b of boxes) {
      for (const [sw, sh] of srcs) {
        const f = fitInside(b, sw, sh);
        expect(f.w, JSON.stringify({ b, sw, sh })).toBeLessThanOrEqual(b.w + 1e-9);
        expect(f.h).toBeLessThanOrEqual(b.h + 1e-9);
        expect(f.w).toBeGreaterThanOrEqual(0);
        expect(f.h).toBeGreaterThanOrEqual(0);
        expect(f.w / f.h).toBeCloseTo(sw / sh, 6);
        expect(f.x + f.w / 2).toBeCloseTo(b.x + b.w / 2, 6);
        expect(f.y + f.h / 2).toBeCloseTo(b.y + b.h / 2, 6);
        expect(Math.max(f.w / b.w, f.h / b.h)).toBeCloseTo(1, 6);
        expect(f.scale).toBeCloseTo(Math.min(b.w / sw, b.h / sh), 6);
      }
    }
  });
});

/* ---------- portraitRings:底盘环 + 12 刻度 ---------- */

describe("portraitRings", () => {
  it("标定盒:圆心在盒心,三半径与刻度长按锚点落地(now=0)", () => {
    const g = portraitRings(BOX, 0);
    expect(g.cx).toBe(100);
    expect(g.cy).toBe(100);
    expect(g.r).toBeCloseTo(R, 9);
    expect(g.rOuter).toBeCloseTo(R_OUTER, 9);
    expect(g.rInner).toBeCloseTo(R_INNER, 9);
    expect(g.ticks.length).toBe(12);
    // 0 号刻度指向正右:外端落在外环上,内端缩短一个刻度长
    expect(g.ticks[0].x1).toBeCloseTo(100 + R_OUTER, 9);
    expect(g.ticks[0].y1).toBeCloseTo(100, 9);
    expect(g.ticks[0].x2).toBeCloseTo(100 + R_OUTER - TICK_LEN, 9);
    expect(g.ticks[0].y2).toBeCloseTo(100, 9);
    // 3 号(90°)指向正下
    expect(g.ticks[3].x1).toBeCloseTo(100, 9);
    expect(g.ticks[3].y1).toBeCloseTo(100 + R_OUTER, 9);
  });

  it("半径严格递减且全部几何不出盒", () => {
    for (const b of [BOX, { x: 28, y: 492, w: 168, h: 168 }, { x: 0, y: 0, w: 56, h: 56 }]) {
      const g = portraitRings(b, 1234);
      expect(g.r).toBeGreaterThan(g.rOuter);
      expect(g.rOuter).toBeGreaterThan(g.rInner);
      expect(g.rInner).toBeGreaterThan(0);
      const right = b.x + b.w;
      const bottom = b.y + b.h;
      expect(g.cx + g.r).toBeLessThanOrEqual(right + 1e-9);
      expect(g.cy + g.r).toBeLessThanOrEqual(bottom + 1e-9);
      expect(g.cx - g.r).toBeGreaterThanOrEqual(b.x - 1e-9);
      expect(g.cy - g.r).toBeGreaterThanOrEqual(b.y - 1e-9);
      for (const t of g.ticks) {
        expect(Math.hypot(t.x1 - g.cx, t.y1 - g.cy)).toBeCloseTo(g.rOuter, 6);
        expect(Math.hypot(t.x2 - g.cx, t.y2 - g.cy)).toBeCloseTo(g.rOuter - TICK_LEN_SCALE(g.r), 6);
        for (const v of [t.x1, t.y1, t.x2, t.y2]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("刻度整圈 12 分,相邻间隔恒等(均匀而非堆叠)", () => {
    const g = portraitRings(BOX, 0);
    const angles = g.ticks.map((t) => Math.atan2(t.y1 - g.cy, t.x1 - g.cx));
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1];
      if (d < 0) d += Math.PI * 2;
      expect(d).toBeCloseTo((Math.PI * 2) / 12, 6);
    }
  });

  it("旋转:四分之一周期 == 转过 3 格;满周期回到原位;负 now 仍是合法几何", () => {
    const at0 = portraitRings(BOX, 0).ticks;
    expect(portraitRings(BOX, 3000).ticks[0]).toEqual(at0[3]);
    const wrapped = portraitRings(BOX, 12000).ticks;
    expect(wrapped).toEqual(at0);
    for (const t of portraitRings(BOX, -1000).ticks) expect(Math.hypot(t.x1 - 100, t.y1 - 100)).toBeCloseTo(R_OUTER, 6);
  });

  it("圆心随盒走,尺寸随盒缩放(平移不改变形状比例)", () => {
    const small = portraitRings({ x: 0, y: 0, w: 100, h: 100 }, 0);
    const moved = portraitRings({ x: 100, y: 100, w: 100, h: 100 }, 0);
    expect(small.r).toBeCloseTo(R / 2, 9);
    expect(moved.cx - small.cx).toBe(100);
    expect(moved.ticks[0].x1 - moved.cx).toBeCloseTo(small.ticks[0].x1 - small.cx, 9);
  });
});

/** 刻度长 = 半径 × 0.12(环几何里唯一随 r 线性缩放的量) */
function TICK_LEN_SCALE(r: number): number {
  return r * 0.12;
}

/* ---------- badgeKeyOf / planPortrait:降级决策 ---------- */

describe("badgeKeyOf", () => {
  it("12 英雄全部落到 icon_fx_ 首个效果,且该键在资源清单里真实存在(末级贴图必可达)", () => {
    for (const h of allHeroes()) {
      const key = badgeKeyOf(h);
      expect(key, h.id).toBe(`icon_fx_${setDef(h.setId).effects[0]}`);
      expect(ASSET_MANIFEST[key], `${h.id} 的徽标兜底键不在清单`).toBeTruthy();
    }
  });

  it("老 6 套有 icon_set_ 贴图,新 6 套没有 —— 故兜底链确有两条分支被用到", () => {
    const legacy = allHeroes().filter((h) => ASSET_MANIFEST[h.iconKey]);
    const modern = allHeroes().filter((h) => !ASSET_MANIFEST[h.iconKey]);
    expect(legacy.map((h) => h.setId)).toEqual(["thorn", "barrage", "ember", "frost", "magma", "phantom"]);
    expect(modern.map((h) => h.setId)).toEqual(["glacier", "blizzard", "plague", "cinderfang", "requiem", "veil"]);
    expect(legacy.length + modern.length).toBe(12);
    for (const h of legacy) expect(h.iconKey).toBe(`icon_set_${h.setId}`);
    for (const h of modern) expect(h.iconKey).toBe(`icon_set_${h.setId}`);
  });
});

describe("planPortrait", () => {
  const vera = heroDef("vera");
  const nora = heroDef("nora");

  it("① 真立绘命中 → 走立绘,但徽章键仍预留(立绘画砸时靠它降级,不会掉到 ④)", () => {
    expect(planPortrait(vera, (k) => k === vera.portraitKey)).toEqual({ usePortrait: true, badgeKey: badgeKeyOf(vera) });
  });

  it("③ 无立绘、icon_set_ 就绪 → 用 iconKey", () => {
    expect(planPortrait(vera, (k) => k === "icon_set_thorn")).toEqual({ usePortrait: false, badgeKey: "icon_set_thorn" });
  });

  it("③′ 无立绘、iconKey 缺图(新 6 套)→ 退到 badgeKeyOf 的 icon_fx_", () => {
    expect(planPortrait(nora, (k) => k === badgeKeyOf(nora))).toEqual({ usePortrait: false, badgeKey: badgeKeyOf(nora) });
  });

  it("④ 什么都没就绪 → badgeKey 仍给出建议键(画不出由绘制端兜底),且不抛错", () => {
    expect(planPortrait(nora, () => false)).toEqual({ usePortrait: false, badgeKey: badgeKeyOf(nora) });
  });

  it("立绘优先于徽章:两者都就绪时走 ①,徽章键取 iconKey 备用", () => {
    const p = planPortrait(vera, (k) => k === vera.portraitKey || k === vera.iconKey);
    expect(p.usePortrait).toBe(true);
    expect(p.badgeKey).toBe(vera.iconKey);
  });
});

/* ---------- drawHeroPortrait:四级降级实际落笔 ---------- */

describe("drawHeroPortrait", () => {
  it("① 真立绘:按 contain-fit 车进盒内,返回 true,底盘一笔不画", () => {
    const h = heroDef("vera");
    const assets = makeAssets([h.portraitKey], { [h.portraitKey]: { w: 800, h: 1200 } });
    const ctx = makeCtx();
    expect(drawHeroPortrait(assets, ctx, h, BOX)).toBe(true);
    expect(assets.drawn).toHaveLength(1);
    expect(assets.drawn[0].key).toBe(h.portraitKey);
    expectRectNear(assets.drawn[0], { x: (200 - 800 / 6) / 2, y: 0, w: 800 / 6, h: 200 }, "立绘 ");
    expect(ctx.ops).toEqual([]);
  });

  it("①′ 立绘探针就绪但 draw 失败(加载竞态)→ 静默落到徽章链并返回 false", () => {
    const h = heroDef("vera");
    const assets = makeAssets([h.portraitKey, h.iconKey], { [h.portraitKey]: { w: 100, h: 100 } }, [h.portraitKey]);
    const ctx = makeCtx();
    expect(drawHeroPortrait(assets, ctx, h, BOX)).toBe(false);
    expect(assets.drawn.map((d) => d.key)).toEqual([h.iconKey]);
    expect(opsOf(ctx, "grad")).toHaveLength(1);
  });

  it("②+③ 老套:径向底 + 双环 + 12 刻度 + icon_set_ 徽标,逐像素落在标定值上", () => {
    const h = heroDef("vera");
    const assets = makeAssets([h.iconKey], { [h.iconKey]: { w: 64, h: 64 } });
    const ctx = makeCtx();
    expect(drawHeroPortrait(assets, ctx, h, BOX, { now: 0 })).toBe(false);
    expect(assets.drawn).toHaveLength(1);
    expect(assets.drawn[0].key).toBe(h.iconKey);
    expectRectNear(assets.drawn[0], { x: BADGE_XY, y: BADGE_XY, w: BADGE_SIDE, h: BADGE_SIDE }, "徽标 ");
    // 三次 fill(径向底 / 徽标兜底未走 / 灰罩未走)→ 此处只应有底盘 fill
    const arcs = opsOf(ctx, "arc").map((o) => o.args);
    expect(arcs).toEqual([
      [100, 100, R, 0, Math.PI * 2],
      [100, 100, R_OUTER, 0, Math.PI * 2],
      [100, 100, R_INNER, 0, Math.PI * 2],
    ]);
    expect(opsOf(ctx, "moveTo")).toHaveLength(12);
    expect(opsOf(ctx, "fillText")).toHaveLength(0);
  });

  it("②+③′ 新套:icon_set_ 不存在 → 徽标改用 icon_fx_ 首效果(链路的第三级不被资源缺位打断)", () => {
    const h = heroDef("nora");
    expect(ASSET_MANIFEST[h.iconKey]).toBeUndefined();
    const badge = badgeKeyOf(h);
    const assets = makeAssets([badge], { [badge]: { w: 48, h: 64 } });
    const ctx = makeCtx();
    expect(drawHeroPortrait(assets, ctx, h, BOX)).toBe(false);
    expect(assets.drawn).toHaveLength(1);
    const d = assets.drawn[0];
    expect(d.key).toBe(badge);
    // 竖源图在方形徽标位里 contain:高贴满、宽按比例收窄并居中
    expect(d.w).toBeCloseTo(BADGE_SIDE * (48 / 64), 6);
    expect(d.h).toBeCloseTo(BADGE_SIDE, 6);
    expect(d.x + d.w / 2).toBeCloseTo(100, 6);
    expect(d.y + d.h / 2).toBeCloseTo(100, 6);
  });

  it("④ 一张图都没有:实色盘 + 名字首字,字号走 F(round(r×0.42), bold)", () => {
    const h = heroDef("mu");
    const assets = makeAssets([]);
    const ctx = makeCtx();
    expect(drawHeroPortrait(assets, ctx, h, BOX)).toBe(false);
    expect(assets.drawn).toEqual([]);
    expect(opsOf(ctx, "fillText")).toHaveLength(1);
    const text = opsOf(ctx, "fillText")[0];
    expect(text.style).toBe(h.name.slice(0, 1));
    expect(text.args[0]).toBe(100);
    expect(text.args[1]).toBeCloseTo(DISC_TEXT_Y, 9);
    expect(ctx.font).toBe(F(DISC_FONT_PX, true));
    expect(ctx.textAlign).toBe("left");
    expect(opsOf(ctx, "arc").map((o) => o.args)).toContainEqual([100, 100, DISC_R, 0, Math.PI * 2]);
    expect(opsOf(ctx, "grad")).toHaveLength(1);
  });

  it("size 入参收方:整条链路(含兜底盘)按收后的方盒重算", () => {
    const h = heroDef("mu");
    const assets = makeAssets([]);
    const ctx = makeCtx();
    drawHeroPortrait(assets, ctx, h, BOX, { size: 100 });
    // 100 见方仍以 (100,100) 为心 → 圆心不动,所有半径相对标定档折半
    expect(opsOf(ctx, "grad")[0].args.slice(0, 2)).toEqual([100, 100]);
    expect(opsOf(ctx, "arc").map((o) => o.args[2])).toEqual([R / 2, R_OUTER / 2, R_INNER / 2, DISC_R / 2]);
    expect(opsOf(ctx, "moveTo")).toHaveLength(12);
  });

  it("locked:未发布压灰罩盖在最上层(真立绘与降级两条路都压)", () => {
    const h = heroDef("vera");
    const withPortrait = makeAssets([h.portraitKey], { [h.portraitKey]: { w: 200, h: 200 } });
    const ctx1 = makeCtx();
    expect(drawHeroPortrait(withPortrait, ctx1, h, BOX, { locked: true })).toBe(true);
    const fills1 = opsOf(ctx1, "fill").map((o) => o.style);
    expect(fills1[fills1.length - 1]).toBe(LOCK_FILL);

    const bare = makeAssets([]);
    const ctx2 = makeCtx();
    expect(drawHeroPortrait(bare, ctx2, h, BOX, { locked: true })).toBe(false);
    const fills2 = opsOf(ctx2, "fill").map((o) => o.style);
    expect(fills2[fills2.length - 1]).toBe(LOCK_FILL);
    expect(LOCK_FILL).toBe(hexA("#05070C", 0.62));
  });

  it("locked 的真立绘仍返回 true(降级只由「有没有画成」决定,不由灰罩决定)", () => {
    const h = heroDef("kyle");
    const assets = makeAssets([h.portraitKey], { [h.portraitKey]: { w: 100, h: 100 } });
    expect(drawHeroPortrait(assets, makeCtx(), h, BOX, { locked: true })).toBe(true);
  });

  it("now 是纯入参:同盒不同 now → 刻度笔迹移动,其余几何不动", () => {
    const h = heroDef("vera");
    const a = makeAssets([h.iconKey]);
    const b = makeAssets([h.iconKey]);
    const ctxA = makeCtx();
    const ctxB = makeCtx();
    drawHeroPortrait(a, ctxA, h, BOX, { now: 0 });
    drawHeroPortrait(b, ctxB, h, BOX, { now: 1500 });
    const moveA = opsOf(ctxA, "moveTo").map((o) => o.args);
    const moveB = opsOf(ctxB, "moveTo").map((o) => o.args);
    expect(moveA).not.toEqual(moveB);
    expect(opsOf(ctxA, "arc").map((o) => o.args)).toEqual(opsOf(ctxB, "arc").map((o) => o.args));
  });

  it("12 英雄 × 四种就绪度全跑一遍:永不抛错,返回值与落笔严格对应链路级别", () => {
    const ROW_BOX: Box = { x: 22, y: 86, w: 56, h: 56 };
    for (const h of allHeroes()) {
      const badge = badgeKeyOf(h);
      const cases: { name: string; ready: string[] }[] = [
        { name: "①立绘", ready: [h.portraitKey] },
        { name: "③老徽章", ready: [h.iconKey] },
        { name: "③′效果图标", ready: [badge] },
        { name: "④全缺", ready: [] },
      ];
      for (const c of cases) {
        const sizes = Object.fromEntries(c.ready.map((k) => [k, { w: 128, h: 128 }]));
        const assets = makeAssets(c.ready, sizes);
        const ctx = makeCtx();
        const painted = drawHeroPortrait(assets, ctx, h, ROW_BOX, { now: 777 });
        expect(painted, `${h.id}/${c.name}`).toBe(c.ready.includes(h.portraitKey));
        expect(assets.drawn.length > 0, `${h.id}/${c.name} 落笔`).toBe(c.ready.length > 0);
        // 降级路(非 ①)必画底盘:3 个环 + 12 刻度;④全缺再多一笔兜底盘 fill
        expect(opsOf(ctx, "arc").length, `${h.id}/${c.name} 环`).toBe(painted ? 0 : c.ready.length > 0 ? 3 : 4);
        expect(opsOf(ctx, "moveTo").length).toBe(painted ? 0 : 12);
      }
    }
  });

  it("无立绘批次(本批真实状态):12 英雄全部只靠清单内资产成画,不需要 hero_ 图", () => {
    for (const h of allHeroes()) {
      const manifestKeys = Object.keys(ASSET_MANIFEST);
      const assets = makeAssets(manifestKeys, Object.fromEntries(manifestKeys.map((k) => [k, { w: 96, h: 96 }])));
      const ctx = makeCtx();
      expect(drawHeroPortrait(assets, ctx, h, BOX)).toBe(false);
      expect(assets.drawn).toHaveLength(1);
      expect(manifestKeys).toContain(assets.drawn[0].key);
    }
  });
});
