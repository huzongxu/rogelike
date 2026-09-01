/**
 * 装备词缀引擎单元测试 —— 覆盖策划案 3.4 的三个示例 Build:
 *  1. 荆棘反伤流:受伤反应(HP<80%) → 火焰新星
 *  2. 死亡连锁流:击杀触发 → 飞刀 + 连锁(3);周期脉冲(2s) → 召唤骷髅
 *  3. 移动炮台流:移动触发(5m) → 毒云 + 爆炸;周期脉冲(1s) → 飞刀 + 分裂(4)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player } from "../src/entities/player";
import { spawnEnemy, type Enemy } from "../src/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "../src/systems/equipmentEngine";
import { makeTrigger, makeEffect, makeModifier } from "../src/data/affixes";
import { generateEquipment, generateChoices, type Equipment } from "../src/data/equipmentGen";
import { qualityDef } from "../src/data/quality";
import { vec2 } from "../src/core/math";

function makeContext(player: Player, enemies: Enemy[] = []): BattleContext & { fx: Fx[] } {
  const fx: Fx[] = [];
  return {
    player,
    enemies,
    projectiles: [],
    clouds: [],
    minions: [],
    addFx: (f) => fx.push(f),
    damageEnemy: vi.fn(),
    healPlayer: vi.fn(),
    addPlayerShield: vi.fn(),
    fx,
  };
}

let engine: EquipmentEngine;
let ctx: ReturnType<typeof makeContext>;
let player: Player;

beforeEach(() => {
  player = new Player();
  engine = new EquipmentEngine();
  ctx = makeContext(player);
});

describe("装备品质构成(策划案 3.2)", () => {
  it("普通 = 1触发器 + 1效果 + 0修饰器", () => {
    const eq = generateEquipment(1, "common");
    expect(eq.triggers).toHaveLength(1);
    expect(eq.modifiers).toHaveLength(0);
  });
  it("稀有 = 1触发器 + 1效果 + 1修饰器", () => {
    const eq = generateEquipment(1, "rare");
    expect(eq.triggers).toHaveLength(1);
    expect(eq.modifiers).toHaveLength(1);
  });
  it("史诗 = 1触发器 + 1效果 + 2修饰器", () => {
    const eq = generateEquipment(1, "epic");
    expect(eq.triggers).toHaveLength(1);
    expect(eq.modifiers).toHaveLength(2);
  });
  it("传奇 = 2触发器 + 1效果 + 2修饰器", () => {
    const eq = generateEquipment(1, "legendary");
    expect(eq.triggers).toHaveLength(2);
    expect(eq.modifiers).toHaveLength(2);
  });
  it("三选一生成 3 个不同装备", () => {
    const choices = generateChoices(5);
    expect(choices).toHaveLength(3);
    const names = new Set(choices.map((c) => c.eq.name));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("示例 Build 1:荆棘反伤流", () => {
  it("生命低于 80% 时受伤触发火焰新星", () => {
    const eq: Equipment = {
      id: 1,
      level: 3,
      quality: "common",
      name: "荆棘反伤",
      triggers: [makeTrigger("hurt", { hpThreshold: 0.8 })],
      effect: makeEffect("nova", { damage: 50, radius: 140 }, 3),
      modifiers: [makeModifier("power", { pct3: 0.2 })],
    };
    player.equipment = [eq];
    const enemy = spawnEnemy("chaser", vec2(50, 0), 1);
    ctx.enemies.push(enemy);

    // 生命 90% (>80%):不应触发
    player.hp = 90;
    engine.onHurt(ctx);
    expect(ctx.damageEnemy).not.toHaveBeenCalled();

    // 生命 70% (<80%):触发新星,敌人受到 50×1.2=60 伤害
    player.hp = 70;
    engine.onHurt(ctx);
    expect(ctx.damageEnemy).toHaveBeenCalledTimes(1);
    const [e, dmg] = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(e).toBe(enemy);
    expect(dmg).toBe(60);
  });
});

describe("示例 Build 2:死亡连锁流", () => {
  it("击杀触发投掷飞刀,并携带连锁修饰器", () => {
    const eq: Equipment = {
      id: 2,
      level: 3,
      quality: "common",
      name: "死亡连锁",
      triggers: [makeTrigger("kill", { chance: 1 })],
      effect: makeEffect("knife", { damage: 28, speed: 540, radius: 480 }, 3),
      modifiers: [makeModifier("chain", { targets: 3 })],
    };
    player.equipment = [eq];
    const enemy = spawnEnemy("chaser", vec2(100, 0), 1);
    ctx.enemies.push(enemy);

    engine.onKill(ctx, enemy);
    expect(ctx.projectiles).toHaveLength(1);
    expect(ctx.projectiles[0].chainLeft).toBe(3);
    expect(ctx.projectiles[0].damage).toBe(28);
  });

  it("周期脉冲每 2 秒召唤骷髅", () => {
    const eq: Equipment = {
      id: 3,
      level: 3,
      quality: "common",
      name: "骷髅前排",
      triggers: [makeTrigger("pulse", { interval: 2 })],
      effect: makeEffect("skeleton", { count: 1, damage: 18, duration: 12 }, 3),
      modifiers: [],
    };
    player.equipment = [eq];

    engine.update(ctx, 1); // 1 秒:未到 2 秒
    expect(ctx.minions).toHaveLength(0);
    engine.update(ctx, 1); // 累计 2 秒:触发
    expect(ctx.minions).toHaveLength(1);
  });
});

describe("示例 Build 3:移动炮台流", () => {
  it("移动 5 米后生成毒云", () => {
    const eq: Equipment = {
      id: 4,
      level: 3,
      quality: "common",
      name: "移动炮台·毒云",
      triggers: [makeTrigger("move", { distance: 500 })],
      effect: makeEffect("cloud", { dps: 16, radius: 120, duration: 4 }, 3),
      modifiers: [makeModifier("explode", { radius: 120, damageMult: 1.2 })],
    };
    player.equipment = [eq];

    player.movedThisFrame = 300;
    engine.update(ctx, 0.1); // 累计 300px < 500
    expect(ctx.clouds).toHaveLength(0);

    player.movedThisFrame = 300;
    engine.update(ctx, 0.1); // 累计 600px ≥ 500:触发
    expect(ctx.clouds).toHaveLength(1);
    expect(ctx.clouds[0].explode).toBeDefined();
  });

  it("周期脉冲每秒投掷飞刀并分裂为 5 把", () => {
    const eq: Equipment = {
      id: 5,
      level: 3,
      quality: "common",
      name: "移动炮台·飞刀",
      triggers: [makeTrigger("pulse", { interval: 1 })],
      effect: makeEffect("knife", { damage: 20, speed: 560, radius: 460 }, 3),
      modifiers: [makeModifier("split", { extra: 4 })],
    };
    player.equipment = [eq];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));

    engine.update(ctx, 1);
    expect(ctx.projectiles).toHaveLength(5); // 1 + 4 分裂
  });

  it("扇形多发:spread=3 基础发射 3 把飞刀(战斗爽感)", () => {
    const eq: Equipment = {
      id: 51,
      level: 1,
      quality: "common",
      name: "开局扇形",
      triggers: [makeTrigger("pulse", { interval: 1.5 })],
      effect: makeEffect("knife", { damage: 24, speed: 520, radius: 420, spread: 3 }, 1),
      modifiers: [],
    };
    player.equipment = [eq];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));

    engine.update(ctx, 1.5);
    expect(ctx.projectiles).toHaveLength(3);
  });

  it("扇形 + 分裂叠加:spread=3 + 分裂2 = 5 把", () => {
    const eq: Equipment = {
      id: 52,
      level: 3,
      quality: "common",
      name: "弹幕",
      triggers: [makeTrigger("pulse", { interval: 1 })],
      effect: makeEffect("knife", { damage: 20, speed: 560, radius: 460, spread: 3 }, 3),
      modifiers: [makeModifier("split", { extra: 2 })],
    };
    player.equipment = [eq];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));

    engine.update(ctx, 1);
    expect(ctx.projectiles).toHaveLength(5);
  });
});

describe("加速修饰器", () => {
  it("间隔缩短 50%:周期脉冲 2s → 1s", () => {
    const eq: Equipment = {
      id: 6,
      level: 3,
      quality: "common",
      name: "加速脉冲",
      triggers: [makeTrigger("pulse", { interval: 2 })],
      effect: makeEffect("knife", { damage: 10, speed: 500, radius: 400 }, 3),
      modifiers: [makeModifier("haste", { pct2: 0.5 })],
    };
    player.equipment = [eq];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));

    engine.update(ctx, 1);
    expect(ctx.projectiles).toHaveLength(1);
  });
});

describe("品质颜色映射", () => {
  it("传奇为橙色,史诗为紫色", () => {
    expect(qualityDef("legendary").color).toBe("#ff9d2e");
    expect(qualityDef("epic").color).toBe("#c06cff");
  });
});

describe("隐藏词缀效果(策划案 5.3)", () => {
  it("死亡弹幕:击杀时发射 8 把飞刀", () => {
    const eq: Equipment = {
      id: 101,
      level: 3,
      quality: "hidden",
      name: "死亡弹幕",
      hiddenAffix: "death_barrage",
      triggers: [makeTrigger("kill", { chance: 1 })],
      effect: makeEffect("knife", { damage: 20, speed: 600, radius: 400 }, 3),
      modifiers: [],
    };
    player.equipment = [eq];
    const enemy = spawnEnemy("chaser", vec2(100, 0), 1);
    ctx.enemies.push(enemy);
    engine.onKill(ctx, enemy);
    expect(ctx.projectiles).toHaveLength(8);
  });

  it("超新星:范围爆炸且触发间隔 +1 秒(可叠加)", () => {
    const eq: Equipment = {
      id: 102,
      level: 3,
      quality: "hidden",
      name: "超新星",
      hiddenAffix: "supernova",
      triggers: [makeTrigger("pulse", { interval: 2 })],
      effect: makeEffect("nova", { damage: 30, radius: 100 }, 3),
      modifiers: [],
    };
    player.equipment = [eq];
    ctx.enemies.push(spawnEnemy("chaser", vec2(50, 0), 1));
    engine.update(ctx, 2);
    expect(ctx.damageEnemy).toHaveBeenCalled();
    expect(eq.triggers[0].params.interval).toBe(3);
  });

  it("亡灵契约:骷髅数量翻倍且攻击回血", () => {
    const eq: Equipment = {
      id: 103,
      level: 3,
      quality: "hidden",
      name: "亡灵契约",
      hiddenAffix: "necromancer",
      triggers: [makeTrigger("hurt", { hpThreshold: 0.8 })],
      effect: makeEffect("skeleton", { count: 1, damage: 15, duration: 12 }, 3),
      modifiers: [],
    };
    player.equipment = [eq];
    player.hp = 50; // < 80%
    engine.onHurt(ctx);
    expect(ctx.minions).toHaveLength(2);
    expect(ctx.minions.every((m) => m.healOnHit)).toBe(true);
  });

  it("死亡轨迹:毒云永久留存(上限10个)", () => {
    const eq: Equipment = {
      id: 104,
      level: 3,
      quality: "hidden",
      name: "死亡轨迹",
      hiddenAffix: "death_trail",
      triggers: [makeTrigger("move", { distance: 500 })],
      effect: makeEffect("cloud", { dps: 10, radius: 100, duration: 4 }, 3),
      modifiers: [],
    };
    player.equipment = [eq];
    player.movedThisFrame = 600;
    engine.update(ctx, 0.1);
    expect(ctx.clouds).toHaveLength(1);
    expect(ctx.clouds[0].ttl).toBeGreaterThan(1000);
  });
});

describe("pulseLeft 脉冲冷却只读查询(战斗 HUD 倒计时)", () => {
  const pulseEq = (id: number, interval: number, modifiers: Equipment["modifiers"] = []): Equipment => ({
    id,
    level: 3,
    quality: "common",
    name: "脉冲",
    triggers: [makeTrigger("pulse", { interval })],
    effect: makeEffect("skeleton", { count: 1, damage: 18, duration: 12 }, 3),
    modifiers,
  });

  it("无状态返 null", () => {
    expect(engine.pulseLeft(999)).toBeNull();
  });

  it("非脉冲触发器无冷却(返 null)", () => {
    const eq = pulseEq(10, 2);
    eq.triggers = [makeTrigger("kill", { chance: 1 })];
    player.equipment = [eq];
    engine.update(ctx, 1);
    expect(engine.pulseLeft(10)).toBeNull();
  });

  it("随 dt 递减,触发后按间隔重新计满", () => {
    player.equipment = [pulseEq(11, 2)];
    engine.update(ctx, 0.5);
    const a = engine.pulseLeft(11);
    expect(a).not.toBeNull();
    expect(a!.interval).toBe(2);
    expect(a!.left).toBeCloseTo(1.5, 5);
    engine.update(ctx, 1.5); // 累计 2s 触发
    expect(ctx.minions).toHaveLength(1);
    const b = engine.pulseLeft(11)!;
    expect(b.interval).toBe(2);
    expect(b.left).toBeCloseTo(2, 5);
  });

  it("加速修饰器缩放 interval:2s × 0.5 = 1s", () => {
    player.equipment = [pulseEq(12, 2, [makeModifier("haste", { pct2: 0.5 })])];
    engine.update(ctx, 0.1);
    const r = engine.pulseLeft(12);
    expect(r).not.toBeNull();
    expect(r!.interval).toBeCloseTo(1, 5);
    expect(r!.left).toBeCloseTo(0.9, 5);
  });

  it("globalPulseMult 缩放 interval:时间膨胀 ×2", () => {
    player.equipment = [pulseEq(13, 2)];
    ctx.globalPulseMult = 2;
    engine.update(ctx, 0.1);
    const r = engine.pulseLeft(13)!;
    expect(r.interval).toBeCloseTo(4, 5);
    expect(r.left).toBeCloseTo(3.9, 5);
  });
});
