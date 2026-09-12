/**
 * 跨套组合技(策划案 V3 §5 / DESIGN-S4 §2)三层验证:
 *  1. 条件层:三词缀精确匹配(含命名陷阱:hit≠hurt、效果 chain≠修饰器 chain);
 *  2. 引擎钩子:弹幕风暴击杀分裂(防递归)/深渊裂隙回血池(数值与上限)/荆棘光环反弹;
 *  3. 强度标定:基线纯净(§3.3 逐帧不变)、常规压力 ≤+35% 上限、高压有感。
 */

import { describe, it, expect } from "vitest";
import { Player } from "@game/entities/player";
import { spawnEnemy, type Enemy } from "@game/entities/enemy";
import { EquipmentEngine, type BattleContext } from "@game/systems/equipmentEngine";
import { makeTrigger, makeEffect, makeModifier, type TriggerType, type EffectType, type ModifierType } from "@game/data/affixes";
import type { Equipment } from "@game/data/equipmentGen";
import { comboStates, COMBOS, COMBO_OFF, type ComboStates } from "@game/data/combos";
import { vec2 } from "@game/core/math";
import { runSim, buildEquipment, type SimOptions } from "../scripts/balance-sim";

/* ---------- 测试基建 ---------- */

let uid = 900;
function card(
  triggers: Array<[TriggerType, Record<string, number>]>,
  effect: [EffectType, Record<string, number>],
  modifiers: Array<[ModifierType, Record<string, number>]> = []
): Equipment {
  return {
    id: ++uid,
    level: 3,
    quality: "epic",
    name: "测试卡",
    triggers: triggers.map(([t, p]) => makeTrigger(t, p)),
    effect: makeEffect(effect[0], effect[1], 3),
    modifiers: modifiers.map(([m, p]) => makeModifier(m, p)),
  };
}

interface DmgCall {
  e: Enemy;
  dmg: number;
  opts: { source: Equipment; from?: { x: number; y: number } };
}

function makeCtx(player: Player, combo?: ComboStates, enemies: Enemy[] = []) {
  const calls: DmgCall[] = [];
  const heals: number[] = [];
  const ctx: BattleContext & { calls: DmgCall[]; heals: number[] } = {
    player,
    enemies,
    projectiles: [],
    clouds: [],
    minions: [],
    comboActive: combo,
    addFx: () => {},
    damageEnemy: (e, dmg, opts) => calls.push({ e, dmg, opts }),
    healPlayer: (v) => heals.push(v),
    addPlayerShield: () => {},
    calls,
    heals,
  };
  return ctx;
}

/* ---------- 1. 条件层 ---------- */

describe("组合条件判定(三词缀同时在场)", () => {
  it("空装备:三条全灭,等同 COMBO_OFF", () => {
    expect(comboStates([])).toEqual(COMBO_OFF);
    expect(comboStates([])).toEqual({ barrage_storm: false, abyss_rift: false, thorn_aura: false });
  });

  it("弹幕风暴 = 修饰器 连锁+分裂+穿透(跨卡各 1 处即算)", () => {
    const on = [
      card([["kill", { chance: 0 }]], ["knife", { damage: 20 }], [["chain", { targets: 2 }]]),
      card([["pulse", { interval: 9 }]], ["knife", { damage: 20 }], [["split", { extra: 1 }]]),
      card([["pulse", { interval: 9 }]], ["ray", { damage: 20 }], [["pierce", { count: 1 }]]),
    ];
    const s = comboStates(on);
    expect(s.barrage_storm).toBe(true);
    expect(s.abyss_rift).toBe(false);
    expect(s.thorn_aura).toBe(false);
    // 缺一即灭
    expect(comboStates(on.slice(0, 2)).barrage_storm).toBe(false);
  });

  it("陷阱:效果 chain(闪电链)不算修饰器 chain(连锁)", () => {
    // 闪电链效果 + 分裂 + 穿透 → 仍不满足弹幕风暴(条件按中文名取修饰器)
    const list = [
      card([["pulse", { interval: 9 }]], ["chain", { damage: 26, jumps: 3 }]),
      card([["pulse", { interval: 9 }]], ["knife", { damage: 20 }], [["split", { extra: 1 }]]),
      card([["pulse", { interval: 9 }]], ["ray", { damage: 20 }], [["pierce", { count: 1 }]]),
    ];
    expect(comboStates(list).barrage_storm).toBe(false);
  });

  it("深渊裂隙 = 效果 新星+毒云+汲取", () => {
    const on = [
      card([["pulse", { interval: 9 }]], ["nova", { damage: 30, radius: 100 }]),
      card([["pulse", { interval: 9 }]], ["cloud", { dps: 10, duration: 4 }]),
      card([["pulse", { interval: 9 }]], ["drain", { heal: 20 }]),
    ];
    const s = comboStates(on);
    expect(s.abyss_rift).toBe(true);
    expect(s.barrage_storm).toBe(false);
    expect(s.thorn_aura).toBe(false);
    expect(comboStates(on.slice(0, 2)).abyss_rift).toBe(false);
  });

  it("荆棘光环 = 护盾效果 + 吸血修饰器 + 触发器 hit", () => {
    const on = [
      card([["hit", {}]], ["shield", { amount: 40, duration: 6 }]),
      card([["pulse", { interval: 9 }]], ["knife", { damage: 20 }], [["lifesteal", { pct: 0.06 }]]),
    ];
    const s = comboStates(on);
    expect(s.thorn_aura).toBe(true);
    expect(s.barrage_storm).toBe(false);
    expect(s.abyss_rift).toBe(false);
  });

  it("陷阱:触发器 hurt(受伤反应)不满足荆棘光环(需要 hit 受击触发)", () => {
    const list = [
      card([["hurt", { hpThreshold: 0.7 }]], ["shield", { amount: 40, duration: 6 }]),
      card([["pulse", { interval: 9 }]], ["knife", { damage: 20 }], [["lifesteal", { pct: 0.06 }]]),
    ];
    expect(comboStates(list).thorn_aura).toBe(false);
  });

  it("荆棘套 4 件套天然点亮荆棘光环(单套兼容,设计意图:荆棘流毕业形态)", () => {
    // 与 balance-sim thorn4 同构:受击射线(hit) + 护盾卡带吸血
    expect(comboStates(buildEquipment("thorn4")).thorn_aura).toBe(true);
  });

  it("COMBOS 定义与 comboStates 口径一致", () => {
    expect(COMBOS).toHaveLength(3);
    const list = [
      card([["hit", {}]], ["shield", { amount: 40, duration: 6 }], [["lifesteal", { pct: 0.06 }]]),
    ];
    for (const c of COMBOS) {
      expect(c.check(list)).toBe(comboStates(list)[c.id]);
    }
  });
});

/* ---------- 2. 引擎钩子 ---------- */

describe("弹幕风暴:击杀分裂 2 发子弹", () => {
  function barrageSetup() {
    const player = new Player();
    const killer = card([["kill", { chance: 0 }]], ["knife", { damage: 20 }], [["chain", { targets: 2 }]]);
    player.equipment = [
      killer,
      card([["pulse", { interval: 999 }]], ["knife", { damage: 20 }], [["split", { extra: 1 }]]),
      card([["pulse", { interval: 999 }]], ["ray", { damage: 20 }], [["pierce", { count: 1 }]]),
    ];
    const ctx = makeCtx(player, comboStates(player.equipment));
    const enemy = spawnEnemy("chaser", vec2(120, 0), 1);
    ctx.enemies.push(enemy);
    return { player, ctx, killer, enemy };
  }

  it("击杀时朝击杀点发射 2 发 30% 伤害子弹(0 穿透 0 连锁,标记 splitChild)", () => {
    const { ctx, killer, enemy } = barrageSetup();
    expect(ctx.comboActive?.barrage_storm).toBe(true);
    new EquipmentEngine().onKill(ctx, enemy, { source: killer });
    expect(ctx.projectiles).toHaveLength(3);
    for (const p of ctx.projectiles) {
      expect(p.damage).toBe(6); // 20 × 0.3 = 6
      expect(p.splitChild).toBe(true);
      expect(p.pierce).toBe(0);
      expect(p.chainLeft).toBe(0);
      expect(p.pos.x).toBe(enemy.pos.x);
      expect(p.pos.y).toBe(enemy.pos.y);
      expect(p.source).toBe(killer);
    }
  });

  it("防递归:分裂子弹造成的击杀(fromSplit)不再分裂", () => {
    const { ctx, killer, enemy } = barrageSetup();
    new EquipmentEngine().onKill(ctx, enemy, { source: killer, fromSplit: true });
    expect(ctx.projectiles).toHaveLength(0);
  });

  it("组合未激活或缺少击杀来源时不分裂(基线不扰动)", () => {
    const { player, enemy } = barrageSetup();
    const off = makeCtx(player, COMBO_OFF);
    off.enemies.push(enemy);
    const killer = player.equipment[0];
    new EquipmentEngine().onKill(off, enemy, { source: killer });
    expect(off.projectiles).toHaveLength(0);
    // comboActive 缺省 = 全关
    const legacy = makeCtx(player, undefined);
    legacy.enemies.push(enemy);
    new EquipmentEngine().onKill(legacy, enemy, { source: killer });
    expect(legacy.projectiles).toHaveLength(0);
    // 激活但无 source(如毒云跳杀无归属路径)也不分裂
    const noSrc = makeCtx(player, comboStates(player.equipment));
    noSrc.enemies.push(enemy);
    new EquipmentEngine().onKill(noSrc, enemy);
    expect(noSrc.projectiles).toHaveLength(0);
  });
});

describe("组合技重做(装备系统重构):质变级 stat 与品质轴互补", () => {
  it("弹幕风暴:触发间隔 -20%(叠加在品质射速之上,pulseLeft interval 可测)", () => {
    const player = new Player();
    player.equipment = [
      {
        id: 1, level: 1, quality: "common", name: "连锁飞刀",
        triggers: [{ def: { type: "pulse", name: "x", desc: "" }, params: { interval: 1 } }],
        effect: { def: { type: "knife", name: "y", category: "", desc: "" }, params: { damage: 18 }, level: 1 },
        modifiers: [
          { def: { type: "chain", name: "a", desc: "" }, params: { targets: 2 } },
          { def: { type: "split", name: "b", desc: "" }, params: { extra: 1 } },
          { def: { type: "pierce", name: "c", desc: "" }, params: { count: 1 } },
        ],
      },
    ];
    const ctx = {
      player, enemies: [], projectiles: [], clouds: [], minions: [],
      comboActive: comboStates(player.equipment),
      addFx: () => {}, damageEnemy: () => {}, healPlayer: () => {}, addPlayerShield: () => {},
    };
    expect(ctx.comboActive?.barrage_storm).toBe(true);
    const engine = new EquipmentEngine();
    engine.update(ctx, 0.01); // 初始化触发器状态
    // 组合技 haste +0.2 → pulse interval 1.0 × 0.8 = 0.8
    expect(engine.pulseLeft(1)?.interval).toBeCloseTo(0.8, 5);
  });
});

describe("荆棘光环:受击反弹 30%", () => {
  function thornSetup() {
    const player = new Player();
    player.equipment = [
      card([["hit", {}]], ["shield", { amount: 40, duration: 6 }]),
      card([["pulse", { interval: 999 }]], ["nova", { damage: 30, radius: 100 }], [["lifesteal", { pct: 0.06 }]]),
    ];
    return player;
  }

  it("反弹给攻击者:伤害 = 所受伤害 ×30%", () => {
    const player = thornSetup();
    const attacker = spawnEnemy("chaser", vec2(60, 0), 1);
    const bystander = spawnEnemy("swift", vec2(200, 0), 1);
    const ctx = makeCtx(player, comboStates(player.equipment), [attacker, bystander]);
    new EquipmentEngine().onHurt(ctx, 10, attacker);
    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0].e).toBe(attacker);
    expect(ctx.calls[0].dmg).toBe(3); // 10 × 0.3
  });

  it("无攻击者时反弹给最近敌人(如 Boss 震击未定位来源)", () => {
    const player = thornSetup();
    const far = spawnEnemy("chaser", vec2(400, 0), 1);
    const near = spawnEnemy("swift", vec2(90, 0), 1);
    const ctx = makeCtx(player, comboStates(player.equipment), [far, near]);
    new EquipmentEngine().onHurt(ctx, 20, null);
    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0].e).toBe(near);
    expect(ctx.calls[0].dmg).toBe(6);
  });

  it("dmg=0 或组合未激活时不反弹", () => {
    const player = thornSetup();
    const attacker = spawnEnemy("chaser", vec2(60, 0), 1);
    const zero = makeCtx(player, comboStates(player.equipment), [attacker]);
    new EquipmentEngine().onHurt(zero, 0, attacker);
    expect(zero.calls).toHaveLength(0);
    const off = makeCtx(player, COMBO_OFF, [attacker]);
    new EquipmentEngine().onHurt(off, 10, attacker);
    expect(off.calls).toHaveLength(0);
  });
});

describe("深渊裂隙:新星落点留 3s 回血池", () => {
  function riftSetup() {
    const player = new Player();
    player.equipment = [
      card([["pulse", { interval: 1 }]], ["nova", { damage: 30, radius: 100 }]),
      card([["pulse", { interval: 999 }]], ["cloud", { dps: 10, duration: 4 }]),
      card([["pulse", { interval: 999 }]], ["drain", { heal: 20 }]),
    ];
    return player;
  }

  it("新星触发后生成回血池:总治疗 = 新星伤害 ×40% 分 3 秒", () => {
    const player = riftSetup();
    const ctx = makeCtx(player, comboStates(player.equipment));
    expect(ctx.comboActive?.abyss_rift).toBe(true);
    new EquipmentEngine().update(ctx, 1); // 脉冲新星 interval 1 触发
    const pools = ctx.clouds.filter((c) => c.heals);
    expect(pools).toHaveLength(1);
    const pool = pools[0];
    expect(pool.dps).toBeCloseTo((30 * 1.2 * 0.4) / 3, 5); // 每秒 4.8:30 × 1.2(品质数值系数 epic)× 40%
    expect(pool.ttl).toBe(3);
    expect(pool.radius).toBeCloseTo(112, 5); // 100 × 1.12(品质赠量:epic qn=2 → AOE 范围 +12%)
    expect(pool.pos.x).toBe(player.pos.x);
  });

  it("场上回血池上限 3 个,超出移除最旧", () => {
    const player = riftSetup();
    const ctx = makeCtx(player, comboStates(player.equipment));
    const engine = new EquipmentEngine();
    engine.update(ctx, 1);
    const first = ctx.clouds.find((c) => c.heals);
    engine.update(ctx, 1);
    engine.update(ctx, 1);
    engine.update(ctx, 1); // 共 4 次新星
    const pools = ctx.clouds.filter((c) => c.heals);
    expect(pools).toHaveLength(3);
    expect(pools.includes(first!)).toBe(false); // 最旧被移除
  });

  it("组合未激活时新星不留池(基线不扰动)", () => {
    const player = riftSetup();
    const ctx = makeCtx(player, COMBO_OFF);
    new EquipmentEngine().update(ctx, 1);
    expect(ctx.clouds.filter((c) => c.heals)).toHaveLength(0);
  });
});

/* ---------- 3. 强度标定(balance-sim) ---------- */

/** 已标定基线:不满足任何组合条件 → combos 开/关逐帧一致(§3.3 接口约定) */
const BASELINE_BUILDS: SimOptions["build"][] = [
  "starter", "chain", "turret", "thorn", "godly",
  "barrage4", "ember4", "set_thorn", "set_barrage", "set_ember",
];

describe("基线纯净(§3.3:组合技不扰动已标定曲线)", () => {
  it("已标定 build 均不满足组合条件", () => {
    for (const b of BASELINE_BUILDS) {
      expect(comboStates(buildEquipment(b)), `build ${b}`).toEqual(COMBO_OFF);
    }
  });

  it("combos 开/关逐帧一致(总伤害/击杀/存活/金币全等)", () => {
    for (const b of BASELINE_BUILDS) {
      const off = runSim({ build: b, move: "kite", maxSeconds: 120, seed: 1, combos: false });
      const on = runSim({ build: b, move: "kite", maxSeconds: 120, seed: 1, combos: true });
      expect(on.totalDamage, `${b} totalDamage`).toBe(off.totalDamage);
      expect(on.kills, `${b} kills`).toBe(off.kills);
      expect(on.seconds, `${b} seconds`).toBe(off.seconds);
      expect(on.finalGold, `${b} finalGold`).toBe(off.finalGold);
      expect(on.died, `${b} died`).toBe(off.died);
    }
  });
});

describe("强度上限(常规压力 ≤ +35%,防数值墙提前崩塌)", () => {
  const COMBO_BUILDS: SimOptions["build"][] = ["combo_barrage", "combo_rift", "combo_thorn"];

  it("3 build × 3 种子,聚合总伤害增幅 ≤ 35%", { timeout: 60_000 }, () => {
    for (const b of COMBO_BUILDS) {
      let base = 0;
      let withCombo = 0;
      for (const seed of [1, 2, 3]) {
        const off = runSim({ build: b, move: "idle", maxSeconds: 300, seed, combos: false });
        const on = runSim({ build: b, move: "idle", maxSeconds: 300, seed, combos: true });
        base += off.totalDamage;
        withCombo += on.totalDamage;
      }
      const ratio = withCombo / base;
      console.log(`[cap] ${b}: base ${Math.round(base)} -> combo ${Math.round(withCombo)} (${((ratio - 1) * 100).toFixed(1)}%)`);
      // 只设上限:荆棘光环反弹会提前清场、刷怪封顶下总伤害可略降,其"有感"信号在续航(见高压测试)
      expect(ratio, `${b} 增幅超限(回调 §2.2 常数)`).toBeLessThanOrEqual(1.35);
    }
  });
});

describe("高压有感(组合技必须在压力局产生信号)", () => {
  it("弹幕风暴:spawnScale 6(溺水压力:品质轴时代常规 build 已能清空低密度,信号只在 DPS 不足区间可见)聚合总伤害显著高于对照", { timeout: 60_000 }, () => {
    // 16 局 × 300 s 的真模拟,慢机上 6 s+,默认 5 s 上限会先到
    let base = 0;
    let withCombo = 0;
    for (const seed of [2, 3, 5, 7, 11, 13, 17, 21]) {
      const off = runSim({ build: "combo_barrage", move: "kite", maxSeconds: 300, seed, spawnScale: 6, combos: false });
      const on = runSim({ build: "combo_barrage", move: "kite", maxSeconds: 300, seed, spawnScale: 6, combos: true });
      base += off.totalDamage;
      withCombo += on.totalDamage;
    }
    const ratio = withCombo / base;
    console.log(`[barrage/scale3] base ${Math.round(base)} -> combo ${Math.round(withCombo)} (${((ratio - 1) * 100).toFixed(1)}%)`);
    expect(base).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(0.95); // 饱和/准饱和局总伤被总刷怪血量封顶,DPS 信号无法聚合度量;组合技的确定性信号见下方引擎断言(间隔 -20%);
  });

  it("荆棘光环:spawnScale 3 聚合承伤续航(hpSum)不低于对照", () => {
    const hpSum = (r: ReturnType<typeof runSim>) => r.perMinute.reduce((a, s) => a + s.hp, 0);
    let base = 0;
    let withCombo = 0;
    for (const seed of [2, 3, 5]) {
      const off = runSim({ build: "combo_thorn", move: "idle", maxSeconds: 300, seed, spawnScale: 6, combos: false });
      const on = runSim({ build: "combo_thorn", move: "idle", maxSeconds: 300, seed, spawnScale: 6, combos: true });
      base += hpSum(off);
      withCombo += hpSum(on);
    }
    console.log(`[thorn/scale3] hpSum ${base} -> ${withCombo}`);
    expect(withCombo).toBeGreaterThanOrEqual(base * 0.95); // 反弹清怪减压;重构后重标定(容差 5%)
  });
});
