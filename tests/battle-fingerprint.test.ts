/**
 * 战斗编排层行为指纹回归。
 *
 * 编排队列在 game/systems/battleWorld.ts,是 Web 与 Cocos 共用的单一事实源,
 * 一处改动同时落在两端。本用例把随机源与时钟钉死后驱动 3000 帧,把每个检查点的
 * 状态计数与实体集合哈希存成内联基线:推进顺序、伤害倍率管线、竞技场钳制、
 * 掉落与连杀规则的任何变动都会在这里显形。
 *
 * 基线更新:npx vitest run tests/battle-fingerprint.test.ts -u
 * 先确认变动是有意的,再更新,并把差异写进提交说明。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vec2 } from "@game/core/math";
import { LIMITS } from "@game/systems/battleWorld";
import { emptySave } from "../cocos-prototype/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos-prototype/assets/scripts/battle/BattleSim";

/** 与浏览器侧人工指纹同源的 mulberry32 */
const SEED = 0x9e3779b9;
/** 能量回复与每日重置读 Date.now,钉死才可比 */
const T0 = Date.UTC(2026, 8, 3, 12, 0, 0);

const realRandom = Math.random;
const realNow = Date.now;

const FRAMES = 3000;
const EVERY = 500;

function fnv(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

interface Harvest {
  digest: string[];
  events: { damage: number; death: number; victory: number; shop: number };
  /** 实体数组是否始终同一个引用(BattleContext 捕获的是引用,换数组会让世界层读到旧数组) */
  identityStable: boolean;
  maxCounts: Record<string, number>;
  playerBox: { x0: number; x1: number; y0: number; y1: number };
  arena: { x0: number; y0: number; x1: number; y1: number };
  finalKills: number;
  finalGold: number;
}

function harvest(): Harvest {
  let s = SEED >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Date.now = () => T0;

  const save = emptySave();
  save.energy = 99;
  const events = { damage: 0, death: 0, victory: 0, shop: 0 };
  const sim = new BattleSim({
    save,
    input: { isMoving: false, moveDir: vec2(0, 0) },
    worldH: 996,
    persist: () => {},
    callbacks: {
      onDamage: () => { events.damage += 1; },
      onDeath: () => { events.death += 1; },
      onVictory: () => { events.victory += 1; },
      onChapterShop: () => { events.shop += 1; },
    },
  });

  if (!sim.startStage(1)) throw new Error("startStage(1) 未开局,指纹无从采集");

  const enemiesRef = sim.enemies;
  const projectilesRef = sim.projectiles;
  const gemsRef = sim.gems;

  const digest: string[] = [];
  const maxCounts: Record<string, number> = {};
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };

  const note = (tag: string) => {
    const counts: Record<string, number> = {
      enemies: sim.enemies.length,
      projectiles: sim.projectiles.length,
      gems: sim.gems.length,
      clouds: sim.clouds.length,
      minions: sim.minions.length,
    };
    for (const k of Object.keys(counts)) maxCounts[k] = Math.max(maxCounts[k] ?? 0, counts[k]);
    const p = sim.player.pos;
    // t0000 采在任何一帧 update 之前:Player 构造在原点,首次 updatePlayer 才把它钳进竞技场带。
    // 边界统计跳过这一帧,量的是稳态而不是开局初始位置;该帧仍进指纹摘要。
    if (tag !== "t0000") {
      box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x);
      box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y);
    }

    const es = sim.enemies.map((e) => `${e.kind}:${Math.round(e.pos.x)},${Math.round(e.pos.y)},${Math.round(e.hp)}`).sort().join("|");
    const ps = sim.projectiles.map((q) => `${Math.round(q.pos.x)},${Math.round(q.pos.y)}`).sort().join("|");
    digest.push(
      [
        tag, `ch=${sim.chapter}`, `ct=${Math.round(sim.chapterTimer * 10)}`,
        `k=${sim.kills}`, `gold=${sim.gold}`,
        `en=${counts.enemies}`, `pr=${counts.projectiles}`, `gm=${counts.gems}`,
        `cl=${counts.clouds}`, `mn=${counts.minions}`,
        `hp=${Math.round(sim.player.hp)}`, `lv=${sim.player.level}`,
        `px=${Math.round(p.x)},${Math.round(p.y)}`,
        `eh=${fnv(es)}`, `ph=${fnv(ps)}`,
      ].join(" ")
    );
  };

  note("t0000");
  for (let f = 1; f <= FRAMES; f++) {
    sim.update(1 / 60);
    if (f % EVERY === 0) note(`f${f}`);
  }

  return {
    digest,
    events,
    identityStable: sim.enemies === enemiesRef && sim.projectiles === projectilesRef && sim.gems === gemsRef,
    maxCounts,
    playerBox: {
      x0: Math.round(box.x0), x1: Math.round(box.x1),
      y0: Math.round(box.y0), y1: Math.round(box.y1),
    },
    arena: {
      x0: Math.round(sim.arena.x0), y0: Math.round(sim.arena.y0),
      x1: Math.round(sim.arena.x1), y1: Math.round(sim.arena.y1),
    },
    finalKills: sim.kills,
    finalGold: sim.gold,
  };
}

describe("战斗编排层行为指纹", () => {
  let h: Harvest;

  beforeAll(() => { h = harvest(); });
  afterAll(() => { Math.random = realRandom; Date.now = realNow; });

  it("3000 帧推进与基线一致", () => {
    expect(h.digest.join("\n")).toMatchInlineSnapshot(`
      "t0000 ch=1 ct=0 k=0 gold=0 en=0 pr=0 gm=0 cl=0 mn=0 hp=100 lv=1 px=0,0 eh=811c9dc5 ph=811c9dc5
      f500 ch=1 ct=83 k=5 gold=10 en=1 pr=32 gm=2 cl=0 mn=0 hp=100 lv=1 px=30,150 eh=9728ac69 ph=97c302b7
      f1000 ch=1 ct=167 k=7 gold=16 en=5 pr=32 gm=1 cl=0 mn=0 hp=100 lv=1 px=30,272 eh=9230fafc ph=7105672d
      f1500 ch=1 ct=250 k=14 gold=32 en=3 pr=32 gm=1 cl=0 mn=0 hp=100 lv=1 px=30,80 eh=98d3c914 ph=adf48f09
      f2000 ch=1 ct=333 k=17 gold=38 en=6 pr=32 gm=1 cl=0 mn=0 hp=92 lv=1 px=30,80 eh=cf4e65eb ph=45dffa4d
      f2500 ch=1 ct=417 k=22 gold=48 en=6 pr=32 gm=1 cl=0 mn=0 hp=92 lv=1 px=530,108 eh=9f1da37e ph=fea4a4b3
      f3000 ch=1 ct=500 k=30 gold=60 en=4 pr=31 gm=4 cl=0 mn=0 hp=92 lv=1 px=530,80 eh=dca85186 ph=b6732a25"
    `);
  });

  it("实体数组原地 mutate,引用身份稳定", () => {
    expect(h.identityStable).toBe(true);
  });

  it("各类实体不越上限", () => {
    expect(h.maxCounts.enemies).toBeLessThanOrEqual(LIMITS.enemies);
    expect(h.maxCounts.projectiles).toBeLessThanOrEqual(LIMITS.projectiles);
    expect(h.maxCounts.gems).toBeLessThanOrEqual(LIMITS.gems);
    expect(h.maxCounts.clouds).toBeLessThanOrEqual(LIMITS.clouds);
    expect(h.maxCounts.minions).toBeLessThanOrEqual(LIMITS.minions);
  });

  it("玩家始终留在竞技场带内(空气墙钳制生效)", () => {
    expect(h.playerBox.x0).toBeGreaterThanOrEqual(h.arena.x0);
    expect(h.playerBox.x1).toBeLessThanOrEqual(h.arena.x1);
    expect(h.playerBox.y0).toBeGreaterThanOrEqual(h.arena.y0);
    expect(h.playerBox.y1).toBeLessThanOrEqual(h.arena.y1);
  });

  it("推进确实在产出击杀、金币与飘字事件", () => {
    expect(h.finalKills).toBeGreaterThan(0);
    expect(h.finalGold).toBeGreaterThan(0);
    expect(h.events.damage).toBeGreaterThan(0);
  });
});
