/**
 * 竞技场地形(策划案 V3 §6 / DESIGN-S4 §3)两层验证:
 *  1. 纯函数:生成规则(每章 1–2 个/环带/间距/豁免)与石柱推挤几何;
 *  2. 强度标定(§3.4):新手局 24 种子聚合均值回落 ≤1 章、风筝局存活回落 ≤30%、毒池上限不主导。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  rollChapterObstacles,
  pushOutOfPillar,
  isInPool,
  OBSTACLE,
  _resetObjectUids,
  type Obstacle,
} from "../src/entities/objects";
import { vec2 } from "../src/core/math";
import { runSim } from "../scripts/balance-sim";

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const ARENA = { x0: 0, y0: 0, x1: 480, y1: 854 };
const CENTER = { x: 240, y: 427 };

beforeEach(() => _resetObjectUids());

/* ---------- 1. 生成规则 ---------- */

describe("rollChapterObstacles 生成规则(§3.1)", () => {
  it("第 1 章新手区净空", () => {
    expect(rollChapterObstacles(1, ARENA, seededRng(2))).toEqual([]);
  });

  it("Boss 章豁免(单挑设计不被障碍破坏)", () => {
    expect(rollChapterObstacles(20, ARENA, seededRng(2), 20)).toEqual([]);
    // 非 Boss 章不受影响
    expect(rollChapterObstacles(19, ARENA, seededRng(2), 20).length).toBeGreaterThan(0);
  });

  it("每章 1–2 个,石柱半径 40 / 毒池半径 90(100 个种子全覆盖)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const obs = rollChapterObstacles(5, ARENA, seededRng(seed));
      expect(obs.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(obs.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      for (const ob of obs) {
        if (ob.kind === "pillar") expect(ob.radius).toBe(OBSTACLE.pillarRadius);
        else expect(ob.radius).toBe(OBSTACLE.poolRadius);
      }
    }
  });

  it("位置约束:内缩 120 环带、距中心出生点 ≥180、互相间距 ≥150", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const obs = rollChapterObstacles(3, ARENA, seededRng(seed));
      for (const ob of obs) {
        expect(ob.pos.x, `seed ${seed} x`).toBeGreaterThanOrEqual(ARENA.x0 + 120);
        expect(ob.pos.x, `seed ${seed} x`).toBeLessThanOrEqual(ARENA.x1 - 120);
        expect(ob.pos.y, `seed ${seed} y`).toBeGreaterThanOrEqual(ARENA.y0 + 120);
        expect(ob.pos.y, `seed ${seed} y`).toBeLessThanOrEqual(ARENA.y1 - 120);
        expect(Math.hypot(ob.pos.x - CENTER.x, ob.pos.y - CENTER.y), `seed ${seed} 中心距`).toBeGreaterThanOrEqual(180);
      }
      for (let i = 0; i < obs.length; i++) {
        for (let j = i + 1; j < obs.length; j++) {
          const d = Math.hypot(obs[i].pos.x - obs[j].pos.x, obs[i].pos.y - obs[j].pos.y);
          expect(d, `seed ${seed} 间距`).toBeGreaterThanOrEqual(150);
        }
      }
    }
  });

  it("确定性:同种子同布局(只比几何,uid 全局递增不参与)", () => {
    const a = rollChapterObstacles(4, ARENA, seededRng(7));
    const b = rollChapterObstacles(4, ARENA, seededRng(7));
    expect(b.map((o) => [o.kind, o.pos.x, o.pos.y, o.radius])).toEqual(
      a.map((o) => [o.kind, o.pos.x, o.pos.y, o.radius])
    );
  });

  it("竞技场过小放不下环带 → 净空(不强凑)", () => {
    const tiny = { x0: 0, y0: 0, x1: 300, y1: 200 };
    expect(rollChapterObstacles(5, tiny, seededRng(2))).toEqual([]);
  });
});

/* ---------- 2. 推挤与毒池几何 ---------- */

describe("pushOutOfPillar / isInPool(§3.2)", () => {
  const pillar: Obstacle = { id: 1, kind: "pillar", pos: vec2(0, 0), radius: 40 };
  const pool: Obstacle = { id: 2, kind: "pool", pos: vec2(0, 0), radius: 90 };

  it("圆侵入石柱 → 最小位移推到恰好相切", () => {
    const pos = vec2(30, 0); // 中心距 30 < 40+16
    expect(pushOutOfPillar(pos, 16, pillar)).toBe(true);
    expect(pos.x).toBeCloseTo(56, 5);
    expect(pos.y).toBeCloseTo(0, 5);
  });

  it("石柱外不推挤;斜向侵入沿法线推出", () => {
    const outside = vec2(200, 0);
    expect(pushOutOfPillar(outside, 16, pillar)).toBe(false);
    expect(outside.x).toBe(200);
    const diag = vec2(10, 10); // 中心距 ≈14.1 < 56
    expect(pushOutOfPillar(diag, 16, pillar)).toBe(true);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(56, 4);
  });

  it("正中心退化:定向推 +x(与贴身校正同款处理)", () => {
    const pos = vec2(0, 0);
    expect(pushOutOfPillar(pos, 16, pillar)).toBe(true);
    expect(pos.x).toBeCloseTo(56, 5);
  });

  it("毒池不阻挡移动(推挤恒为 false)", () => {
    expect(pushOutOfPillar(vec2(0, 0), 16, pool)).toBe(false);
  });

  it("isInPool:池内为真、池外为假、石柱不算", () => {
    expect(isInPool(vec2(10, -20), [pool])).toBe(true);
    expect(isInPool(vec2(95, 0), [pool])).toBe(false);
    expect(isInPool(vec2(0, 0), [pillar])).toBe(false);
    expect(isInPool(vec2(0, 0), [])).toBe(false);
  });
});

/* ---------- 3. 强度标定(§3.4:地形是摩擦,不是墙) ----------
 * 标定方法学(重要):新手局带商店成长,商店抽卡吃共享种子流——障碍几何扰动事件时序后,
 * 抽卡序列整体重排,单种子 ON/OFF 波次差被商店混沌淹没(对照臂自身即在 6/21 两谷间摆荡,
 * 噪声地板 ±15 波)。故单种子对比不可测,一律用多种子聚合:比均值与失败谷占比,不比单种子。
 * 样本量下限 64:该分布是双峰的(≈85% 种子止步 5–8 章,少数冲到 15–21 章),24 粒种子时
 * 均值标准误(SE≈0.5 章)与 ±1 章阈值同量级,断言退化成掷硬币;64 粒把 SE 压到 ≈0.3 章,
 * ≤1 章阈值约合 3 倍标准误,才是有判别力的守卫(实测 |ON−OFF| 均值差 ≤0.25 章)。 */

describe("地形标定(§3.4)", () => {
  it(
    "新手局:64 种子聚合,开障碍后均值回落 ≤1 章、失败谷(≤10 波)占比不恶化",
    () => {
      const SEEDS = 64;
      const offW: number[] = [];
      const onW: number[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const off = runSim({ build: "set_barrage", move: "kite", shopGrowth: true, set: "barrage", maxSeconds: 1200, seed });
        const on = runSim({ build: "set_barrage", move: "kite", shopGrowth: true, set: "barrage", maxSeconds: 1200, seed, obstacles: true });
        offW.push(off.wave);
        onW.push(on.wave);
      }
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const fail = (a: number[]) => a.filter((w) => w <= 10).length;
      const meanOff = mean(offW);
      const meanOn = mean(onW);
      const failOff = fail(offW);
      const failOn = fail(onW);
      console.log(`[新手/地形] OFF 均值 ${meanOff.toFixed(1)} 失败谷 ${failOff}/${SEEDS} | ON 均值 ${meanOn.toFixed(1)} 失败谷 ${failOn}/${SEEDS}`);
      // 空转守卫:两臂均值都须停在第一章谷之上,否则模拟本身已塌,差值断言会 trivially 成立
      expect(meanOff, "对照臂均值异常塌陷(先查模拟/装备生成,别调阈值)").toBeGreaterThanOrEqual(6);
      expect(meanOn, "障碍臂均值异常塌陷(先查地形生成/毒池 dps,别调阈值)").toBeGreaterThanOrEqual(6);
      // 平均回落 ≤1 章(64 种子实测 0.25 以内);失败谷噪声带 6 粒 ≈ 样本量的 9%
      expect(meanOff - meanOn, "均值回落超 1 章(回调数量/毒池 dps,不动生成曲线)").toBeLessThanOrEqual(1);
      expect(failOn, "失败谷占比系统性恶化").toBeLessThanOrEqual(failOff + 6);
    },
    300_000
  );

  it(
    "风筝局:存活时间回落 ≤ 30%(3 种子聚合)",
    () => {
      let secOff = 0;
      let secOn = 0;
      for (const seed of [1, 2, 3]) {
        const off = runSim({ build: "godly", move: "kite", maxSeconds: 900, seed, spawnScale: 3 });
        const on = runSim({ build: "godly", move: "kite", maxSeconds: 900, seed, spawnScale: 3, obstacles: true });
        console.log(`[风筝/地形] seed ${seed}: 存活 ${off.seconds}s -> ${on.seconds}s`);
        secOff += off.seconds;
        secOn += on.seconds;
      }
      expect(secOn).toBeGreaterThanOrEqual(secOff * 0.7);
    },
    300_000
  );

  it("挂机局:毒池在场、承伤上限不主导;站池承伤口径 6 dps(0.25s 跳 × 1.5)", () => {
    // 风筝/挂机 AI 贴墙巡航(转向曲率半径 ≈600 > 竞技场尺寸),毒池中心内缩 120 →
    // 巡场路径几何上踩不到池,模拟中 poolDamage ≈ 0 是预期;池的走位压力只对真实手动玩家生效。
    // 因此模拟侧只断言:上限不主导 + 池非死代码 + DoT 口径。
    for (const seed of [1, 2, 3]) {
      const r = runSim({ build: "starter", move: "kite", maxSeconds: 300, seed, spawnScale: 2, obstacles: true });
      console.log(`[挂机/地形] seed ${seed}: 存活 ${r.seconds}s · 毒池伤害 ${r.poolDamage}`);
      expect(r.poolDamage / Math.max(1, r.seconds), `seed ${seed} 毒池承伤超上限(平均 ≤1 dps)`).toBeLessThanOrEqual(1);
    }
    // 池非死代码:连续 60 章内必见至少一个毒池(每章 1–2 个、池占比 1/3)
    const rng = seededRng(4);
    let sawPool = false;
    for (let ch = 2; ch <= 61 && !sawPool; ch++) {
      sawPool = rollChapterObstacles(ch, ARENA, rng).some((o) => o.kind === "pool");
    }
    expect(sawPool).toBe(true);
    // 站池承伤口径:6 dps,0.25s 一跳 = 每跳 1.5(不走 onHurt,直接扣血)
    expect(OBSTACLE.poolDps).toBe(6);
    expect(OBSTACLE.poolDps * OBSTACLE.poolTick).toBeCloseTo(1.5, 10);
  }, 120_000);

  it("基线纯净:未开障碍时 poolDamage 为 0(不扰动已标定曲线)", () => {
    const r = runSim({ build: "starter", move: "kite", maxSeconds: 180, seed: 2 });
    expect(r.poolDamage).toBe(0);
  }, 60_000);
});
