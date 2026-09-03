/**
 * 环境词缀测试 —— 策划案 4.2:每局随机 1-3 个、死亡连锁爆炸、时间膨胀倍率。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ENV_AFFIXES, rollEnvAffixes, deathChainDamage, envAffixDef } from "@game/data/envAffixes";
import { spawnEnemy } from "@game/entities/enemy";
import { vec2 } from "@game/core/math";
import { Player } from "@game/entities/player";
import { EquipmentEngine, type BattleContext } from "@game/systems/equipmentEngine";
import { makeTrigger, makeEffect } from "@game/data/affixes";
describe("环境词缀定义(策划案 4.2 六种)", () => {
  it("定义完整且覆盖策划案 4.2 全部词缀", () => {
    expect(ENV_AFFIXES).toHaveLength(6);
    const names = ENV_AFFIXES.map((a) => a.name);
    expect(names).toContain("反伤领域");
    expect(names).toContain("治疗光环");
    expect(names).toContain("空间扭曲");
    expect(names).toContain("时间膨胀");
    expect(names).toContain("死亡连锁");
    expect(names).toContain("隐匿迷雾");
  });

  it("每局随机 1-3 个且不重复", () => {
    for (let i = 0; i < 50; i++) {
      const affixes = rollEnvAffixes();
      expect(affixes.length).toBeGreaterThanOrEqual(1);
      expect(affixes.length).toBeLessThanOrEqual(3);
      expect(new Set(affixes).size).toBe(affixes.length);
    }
  });
});

describe("死亡连锁(策划案 4.2)", () => {
  it("爆炸伤害基于敌人最大生命", () => {
    const e = spawnEnemy("tank", vec2(0, 0), 1); // 140 × 波次缩放
    const dmg = deathChainDamage(e);
    expect(dmg).toBe(Math.max(1, Math.round(e.maxHp * 0.25)));
  });
});

describe("时间膨胀(引擎倍率)", () => {
  let engine: EquipmentEngine;
  let player: Player;
  let ctx: ReturnType<typeof makeCtx>;

  function makeCtx(p: Player): BattleContext {
    return {
      player: p,
      enemies: [],
      projectiles: [],
      clouds: [],
      minions: [],
      globalPulseMult: 1,
      addFx: () => {},
      damageEnemy: vi.fn(),
      healPlayer: vi.fn(),
      addPlayerShield: vi.fn(),
    };
  }

  beforeEach(() => {
    player = new Player();
    engine = new EquipmentEngine();
    ctx = makeCtx(player);
  });

  it("间隔翻倍:2s 脉冲在倍率 2 下需要 4s 才触发", () => {
    player.equipment = [
      {
        id: 2001,
        level: 1,
        quality: "common",
        name: "测试脉冲",
        triggers: [makeTrigger("pulse", { interval: 2 })],
        effect: makeEffect("knife", { damage: 10, speed: 500, radius: 400 }, 1),
        modifiers: [],
      },
    ];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));
    ctx.globalPulseMult = 2;
    engine.update(ctx, 2); // 2s:还差一半
    expect(ctx.projectiles).toHaveLength(0);
    engine.update(ctx, 2); // 累计 4s:触发
    expect(ctx.projectiles).toHaveLength(1);
  });

  it("倍率 1 时行为不变", () => {
    player.equipment = [
      {
        id: 2002,
        level: 1,
        quality: "common",
        name: "测试脉冲",
        triggers: [makeTrigger("pulse", { interval: 2 })],
        effect: makeEffect("knife", { damage: 10, speed: 500, radius: 400 }, 1),
        modifiers: [],
      },
    ];
    ctx.enemies.push(spawnEnemy("chaser", vec2(80, 0), 1));
    engine.update(ctx, 2);
    expect(ctx.projectiles).toHaveLength(1);
  });
});

describe("环境词缀名称查询", () => {
  it("envAffixDef 返回对应定义", () => {
    expect(envAffixDef("mist").name).toBe("隐匿迷雾");
    expect(envAffixDef("time_dilation").desc).toContain("间隔翻倍");
  });
});
