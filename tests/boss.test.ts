/**
 * Boss 三阶段机制测试(策划案 V3 §3.2)。
 * updateBoss 为纯逻辑(事件回调记录),直接驱动验证阶段/召唤/震击时序。
 */

import { describe, it, expect } from "vitest";
import { spawnEnemy, updateBoss, splitBabies, BOSS_SLAM, BOSS_SUMMON, BOSS_FRENZY_SPEED, type BossEvents } from "@game/entities/enemy";
import { vec2 } from "@game/core/math";

function makeBoss(variant: "full" | "weak" = "full") {
  const b = spawnEnemy("boss", vec2(200, 200), 20);
  b.bossVariant = variant;
  return b;
}

function recorder() {
  const phases: number[] = [];
  const slams: { x: number; y: number; radius: number; damage: number }[] = [];
  const children: string[] = [];
  const ev: BossEvents = {
    spawnChild: (kind) => {
      children.push(kind);
    },
    onPhaseChange: (ph) => {
      phases.push(ph);
    },
    onSlam: (pos, radius, damage) => {
      slams.push({ x: pos.x, y: pos.y, radius, damage });
    },
  };
  return { phases, slams, children, ev };
}

function tick(b: ReturnType<typeof makeBoss>, ev: BossEvents, secs: number, playerPos = vec2(100, 100), step = 0.1) {
  const n = Math.round(secs / step);
  for (let i = 0; i < n; i++) updateBoss(b, step, playerPos, ev);
}

describe("Boss 三阶段(策划案 V3 §3.2)", () => {
  it("P1:满血只追击,不召唤不震击", () => {
    const b = makeBoss();
    const r = recorder();
    tick(b, r.ev, 20);
    expect(b.bossPhase).toBe(1);
    expect(r.phases).toHaveLength(0);
    expect(r.children).toHaveLength(0);
    expect(r.slams).toHaveLength(0);
  });

  it("血量 ≤60% 进入 P2:回调触发,入场 3s 后首次召唤 2 腐尸并锁定玩家位置蓄力震击", () => {
    const b = makeBoss();
    const r = recorder();
    b.hp = Math.floor(b.maxHp * 0.6);
    tick(b, r.ev, 0.1);
    expect(b.bossPhase).toBe(2);
    expect(r.phases).toEqual([2]);
    expect(r.children).toHaveLength(0);
    // 入场 3s 后首次事件
    const playerPos = vec2(100, 100);
    tick(b, r.ev, BOSS_SUMMON.first, playerPos);
    expect(r.children).toEqual(["chaser", "chaser"]);
    expect(b.bossSlamCharge).toBeGreaterThan(0); // 蓄力进行中(可能已走 1 步)
    expect(b.bossSlamCharge).toBeLessThanOrEqual(BOSS_SLAM.charge);
    expect(b.bossSlamPos).toEqual(playerPos);
  });

  it("震击在蓄力 1.2s 后引爆,震点 = 蓄力开始时的玩家位置快照(走位可躲)", () => {
    const b = makeBoss();
    const r = recorder();
    b.hp = Math.round(b.maxHp * 0.55);
    const atCharge = vec2(100, 100);
    tick(b, r.ev, 0.1);
    tick(b, r.ev, BOSS_SUMMON.first, atCharge);
    expect(b.bossSlamPos).toEqual(atCharge);
    // 蓄力期间玩家跑开
    const runAway = vec2(450, 450);
    tick(b, r.ev, BOSS_SLAM.charge + 0.05, runAway);
    expect(r.slams).toHaveLength(1);
    expect(r.slams[0].x).toBe(atCharge.x);
    expect(r.slams[0].y).toBe(atCharge.y);
    expect(r.slams[0].radius).toBe(BOSS_SLAM.radius);
    expect(r.slams[0].damage).toBe(BOSS_SLAM.damage);
    expect(b.bossSlamCharge).toBe(0);
    expect(b.bossSlamPos).toBeNull();
  });

  it("P2 召唤节奏 6s/次,每次都附带一次震击蓄力", () => {
    const b = makeBoss();
    const r = recorder();
    b.hp = Math.round(b.maxHp * 0.55);
    tick(b, r.ev, 0.1);
    tick(b, r.ev, BOSS_SUMMON.first + BOSS_SUMMON.p2 + 0.2);
    expect(r.children).toHaveLength(4); // 两次事件 × 2
    // 第一次震击已引爆(3 + 1.2 < 9.2),第二次刚蓄力或接近引爆
    expect(r.slams.length).toBeGreaterThanOrEqual(1);
  });

  it("血量 ≤25% 进入 P3:移速 ×1.4、召唤减半(3s)、震击停止", () => {
    const b = makeBoss();
    const r = recorder();
    const baseSpeed = b.speed;
    b.hp = Math.round(b.maxHp * 0.55);
    tick(b, r.ev, 0.1); // → P2
    const slamsInP2 = () => r.slams.length;
    b.hp = Math.round(b.maxHp * 0.24);
    tick(b, r.ev, 0.1); // → P3
    expect(b.bossPhase).toBe(3);
    expect(r.phases).toEqual([2, 3]);
    expect(b.speed).toBeCloseTo(baseSpeed * BOSS_FRENZY_SPEED, 5);
    const before = slamsInP2();
    tick(b, r.ev, 12); // P3 长时间:只召唤,不再有震击
    expect(r.slams).toHaveLength(before);
    expect(r.children.length).toBeGreaterThanOrEqual(8); // P3 每 3s 召 2 只,12s 内至少 4 次事件
  });

  it("单发大伤害从 >60% 直接压到 <25%:两次阶段回调都触发,最终落在 P3", () => {
    const b = makeBoss();
    const r = recorder();
    b.hp = Math.round(b.maxHp * 0.2);
    tick(b, r.ev, 0.1);
    expect(r.phases).toEqual([2, 3]);
    expect(b.bossPhase).toBe(3);
  });

  it("偶数关弱化变体:跳过 P2(60%-25% 仍是 P1),<25% 直达 P3", () => {
    const b = makeBoss("weak");
    const r = recorder();
    b.hp = Math.round(b.maxHp * 0.5);
    tick(b, r.ev, 10);
    expect(b.bossPhase).toBe(1); // 不经过 P2:无召唤无震击
    expect(r.children).toHaveLength(0);
    expect(r.slams).toHaveLength(0);
    b.hp = Math.round(b.maxHp * 0.2);
    tick(b, r.ev, 0.1);
    expect(b.bossPhase).toBe(3);
    expect(r.phases).toEqual([3]);
    // P3 召唤有入场缓冲,不会进阶段瞬间召怪
    const kids = r.children.length;
    tick(b, r.ev, 1);
    expect(r.children).toHaveLength(kids);
  });

  it("弱化变体死亡不分裂;满机制 Boss 分裂 2 幼体(现状保持)", () => {
    const full = makeBoss("full");
    const weak = makeBoss("weak");
    expect(splitBabies(full)).toHaveLength(2);
    expect(splitBabies(weak)).toHaveLength(0);
  });
});

/* ---------- Boss 独立血量曲线(关卡维度) ---------- */

import { bossHpMult, BOSS_HP_CURVE } from "@game/entities/enemy";
import { ENEMY_DEFS, waveHpMult } from "@game/entities/enemy";
import { runSim, measureBossDps } from "../scripts/balance-sim";

describe("Boss 血量曲线(关卡维度;修复终局 3 秒融化/全关同血)", () => {
  it("曲线形状:第 1 关 = base,每关 ×1.35 单调增长,小于 1 的关卡按第 1 关钳制", () => {
    expect(bossHpMult(1)).toBeCloseTo(BOSS_HP_CURVE.base, 10);
    expect(bossHpMult(0)).toBeCloseTo(bossHpMult(1), 10);
    for (let s = 2; s <= 7; s++) {
      expect(bossHpMult(s) / bossHpMult(s - 1)).toBeCloseTo(BOSS_HP_CURVE.growth, 10);
    }
    expect(bossHpMult(7)).toBeGreaterThan(bossHpMult(1) * 5); // 终局血量显著高于首关
  });

  it("标定守护:锚点 build 单目标 TTK 落在目标窗口(首关 ≈20s / 末关 ≈40s,均 < 60s 超时线)", () => {
    const baseHp = Math.round(ENEMY_DEFS.boss.hp * waveHpMult(20)); // 第 20 章基础血量(旧版全关统一值)
    // 锚点 1:第 1 关到达态(套组初始武器 + 套组偏向商店成长;装备系统重构后重标定)
    const arrival = runSim({ build: "set_barrage", move: "kite", shopGrowth: true, set: "barrage", maxSeconds: 1200, seed: 21 });
    const dps1 = measureBossDps(arrival.finalEquipment, { seconds: 45, seed: 21, passives: arrival.finalPassives }).dps;
    const ttk1 = (baseHp * bossHpMult(1)) / dps1;
    // 锚点 2:终局态(神装 + 商店成长 + 征服者天赋;被动法宝是全局乘区,探针一起带上)
    const endgame = runSim({ build: "godly", move: "kite", shopGrowth: true, boosted: true, maxSeconds: 1200, seed: 21 });
    const dps7 = measureBossDps(endgame.finalEquipment, { boosted: true, seconds: 45, seed: 21, passives: endgame.finalPassives }).dps;
    const ttk7 = (baseHp * bossHpMult(7)) / dps7;
    console.log(`[Boss 曲线] 首关 ${Math.round(baseHp * bossHpMult(1))}hp TTK ${ttk1.toFixed(1)}s · 末关 ${Math.round(baseHp * bossHpMult(7))}hp TTK ${ttk7.toFixed(1)}s`);
    expect(dps7).toBeGreaterThan(dps1); // 终局输出确实更高(曲线前提)
    expect(ttk1).toBeGreaterThan(12); // 不能回到「一刀秒」(三阶段机制需要展开时间)
    expect(ttk1).toBeLessThan(35); // 也不能难为新手
    expect(ttk7).toBeGreaterThan(14); // 终局 Boss 要有存在感(装备系统重构后重标定:品质三重跃迁下输出上移)
    expect(ttk7).toBeLessThan(55); // 必须稳过 60s 章节超时线
  }, 240000);
});
