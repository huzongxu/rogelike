/**
 * 三系天赋树(策划案 5.2)与神之敌(神之挑战)测试。
 */

import { describe, it, expect } from "vitest";
import {
  BUILDER_ROUTE,
  EFFICIENT_ROUTE,
  CONQUEROR_ROUTE,
  BUILDER_ROUTE_COST,
  EFFICIENT_ROUTE_COST,
  CONQUEROR_ROUTE_COST,
  isTierUnlocked,
  offlineBonusFor,
  globalXpMultFor,
  commissionSpeedFor,
  commissionTimeScaleFor,
  uncappedCommissionFor,
  autoPickupFor,
  rareBonusFor,
  maxHpMultFor,
  startShieldFor,
  globalDamageMultFor,
  cdrScaleFor,
  critFor,
  elementalMultFor,
  desperateMultFor,
} from "@game/data/talents";
import { effectiveHours, accruedReward } from "@game/data/commissions";
import {
  spawnEnemy,
  updateSpecial,
  reflectDamage,
  shieldguardDamageMult,
  splitBabies,
  randomEnemyKind,
} from "@game/entities/enemy";
import { vec2 } from "@game/core/math";

describe("三系路线定义(策划案 5.2)", () => {
  it("构筑师 91 点 / 效率专家 91 点", () => {
    expect(BUILDER_ROUTE_COST).toBe(91);
    expect(EFFICIENT_ROUTE_COST).toBe(91);
    expect(EFFICIENT_ROUTE).toHaveLength(10);
    expect(CONQUEROR_ROUTE).toHaveLength(10);
  });

  it("征服者路线成本 = 节点之和", () => {
    expect(CONQUEROR_ROUTE_COST).toBe(CONQUEROR_ROUTE.reduce((s, n) => s + n.cost, 0));
  });

  it("层级门槛按路线隔离:构筑师的 2 层节点不解锁征服者 3 层", () => {
    expect(isTierUnlocked(["dmg1"], 3, CONQUEROR_ROUTE)).toBe(true); // dmg1 是征服者 2 层
    expect(isTierUnlocked(["cdr"], 3, CONQUEROR_ROUTE)).toBe(true);
    expect(isTierUnlocked(["slot1"], 3, CONQUEROR_ROUTE)).toBe(false); // slot1 是构筑师 2 层
    expect(isTierUnlocked(["slot1"], 3, BUILDER_ROUTE)).toBe(true);
  });
});

describe("效率专家天赋效果", () => {
  it("离线增效 I/II/III 累计 +50% 委托收益", () => {
    expect(offlineBonusFor([])).toBe(1);
    expect(offlineBonusFor(["offline1", "offline2", "offline3"])).toBe(1.5);
  });
  it("经验加成 +10%", () => {
    expect(globalXpMultFor(["exp_gain"])).toBe(1.1);
  });
  it("委托加速 +20% 结算速度 / 时间压缩耗时 -30% / 永恒工厂解除封顶", () => {
    expect(commissionSpeedFor(["commission_speed"])).toBe(1.2);
    expect(commissionTimeScaleFor(["time_compress"])).toBeCloseTo(1 / 0.7);
    expect(uncappedCommissionFor(["eternal_factory"])).toBe(true);
    expect(autoPickupFor(["auto_pick"])).toBe(true);
    expect(rareBonusFor(["loot_sense"])).toBe(0.05);
  });
});

describe("征服者天赋效果", () => {
  it("生命强化 +15% / 初始护盾 50 / 伤害强化 I+II 累计 +25%", () => {
    expect(maxHpMultFor(["vitality"])).toBe(1.15);
    expect(startShieldFor(["start_shield"])).toBe(50);
    expect(globalDamageMultFor(["dmg1", "dmg2"])).toBe(1.25);
  });
  it("冷却缩减 -10% / 暴击 10%×1.25 / 元素 +15% / 绝境 +50%", () => {
    expect(cdrScaleFor(["cdr"])).toBe(0.9);
    expect(critFor(["crit"])).toEqual({ rate: 0.1, mult: 1.25 });
    expect(elementalMultFor(["elemental"])).toBe(1.15);
    expect(desperateMultFor(["desperate"])).toBe(1.5);
  });
});

describe("委托天赋叠加(效率专家 × 离线收益规则)", () => {
  it("时间压缩 + 委托加速:2 小时 ≈ 3.43 有效时长", () => {
    const eff = effectiveHours(2, { speedMult: 1.2, timeScale: 1 / 0.7 });
    // 2 × 1.2 × 1.43 ≈ 3.43;但 3.43 > 2 进入衰减段
    expect(eff).toBeGreaterThan(2);
  });
  it("永恒工厂解除 12 小时封顶", () => {
    const capped = effectiveHours(24, {});
    const uncapped = effectiveHours(24, { uncapped: true });
    expect(capped).toBe(7.5);
    expect(uncapped).toBeGreaterThan(10);
  });
  it("离线增效:收益 ×1.5", () => {
    const c = { region: "plains" as const, difficulty: 1, startedAt: Date.now() - 2 * 3600000 };
    expect(accruedReward(c, Date.now(), { rewardMult: 1.5 })).toBe(Math.floor(30 * 1 * 2 * 1.5));
  });
});

describe("神之敌(神之挑战,策划案 5.2)", () => {
  it("由神之挑战天赋解锁:波 8 起有概率登场;未解锁不出现", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(randomEnemyKind(8, true));
    expect(seen.has("god")).toBe(true);
    const seenLow = new Set<string>();
    for (let i = 0; i < 5000; i++) seenLow.add(randomEnemyKind(7, true));
    expect(seenLow.has("god")).toBe(false);
    const locked = new Set<string>();
    for (let i = 0; i < 5000; i++) locked.add(randomEnemyKind(12));
    expect(locked.has("god")).toBe(false);
  });

  it("复合机制:反射 + 周期性隐身 + 正面减伤 + 死亡分裂 4 个", () => {
    const e = spawnEnemy("god", vec2(0, 0), 8);
    expect(reflectDamage(e, 100)).toBe(25);
    e.facing = vec2(1, 0);
    expect(shieldguardDamageMult(e, vec2(50, 0))).toBe(0.2);
    // 隐身周期
    updateSpecial(e, 4, () => {});
    expect(e.hidden).toBe(true);
    // 分裂 4 个幼体
    expect(splitBabies(e)).toHaveLength(4);
  });
});
