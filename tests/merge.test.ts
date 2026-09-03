/**
 * 场内成长测试 —— 进化(2 张同款保底升档)与强化(金币升级,数值增长)。
 */

import { describe, it, expect } from "vitest";
import {
  qualityUpgrade,
  qualityPowerRatio,
  qualityBasePrice,
  QUALITY_MAX_LEVEL,
  canUpgrade,
  upgradeCost,
  type Equipment,
} from "@game/data/equipmentGen";
import { makeTrigger, makeEffect, makeModifier } from "@game/data/affixes";

function mk(name: string, quality: Equipment["quality"], id: number, mods: Equipment["modifiers"] = []): Equipment {
  return {
    id,
    level: 3,
    quality,
    name,
    triggers: [makeTrigger("pulse", { interval: 1.5 })],
    effect: makeEffect("knife", { damage: 30, speed: 520, radius: 640, spread: 3 }, 3),
    modifiers: mods,
  };
}

/** 复刻 game.cardTypeKey(效果+品质;触发器/修饰器不参与) */
function typeKey(eq: Equipment): string {
  return eq.effect.def.type + "|" + eq.quality;
}

/** 复刻 game.mergeGroups 的纯逻辑(按类型键,阈值 2) */
function mergeGroups(equipment: Equipment[]) {
  const map = new Map<string, { name: string; quality: Equipment["quality"]; count: number; sample: Equipment }>();
  for (const eq of equipment) {
    const key = typeKey(eq);
    const g = map.get(key);
    if (g) g.count += 1;
    else map.set(key, { name: eq.effect.def.name, quality: eq.quality, count: 1, sample: eq });
  }
  return [...map.values()].filter((g) => g.count >= 2).slice(0, 4);
}

/** 构造指定触发器的装备(护盾生成场景:同效果同品质但触发器不同) */
function mkTrigger(name: string, quality: Equipment["quality"], id: number, trigger: "pulse" | "kill" | "hit", mods: Equipment["modifiers"] = []): Equipment {
  return {
    id,
    level: 3,
    quality,
    name,
    triggers: [makeTrigger(trigger, { interval: 1.5 })],
    effect: makeEffect("shield", { amount: 40, duration: 6 }, 3),
    modifiers: mods,
  };
}

describe("进化检测(2 张同款保底)", () => {
  it("2 张同效果+同品质(修饰器不同)→ 可进化(压力减半:不再等 3 张)", () => {
    const a = mk("x", "rare", 1, [makeModifier("chain", { targets: 2 })]);
    const b = mk("x", "rare", 2, [makeModifier("split", { extra: 2 })]);
    expect(mergeGroups([a, b])).toHaveLength(1);
  });

  it("3 张完全同名同品 → 检测到进化组(免费 + 送强化)", () => {
    const a = mk("周期脉冲·飞刀投射", "rare", 1);
    const b = mk("周期脉冲·飞刀投射", "rare", 2);
    const c = mk("周期脉冲·飞刀投射", "rare", 3);
    expect(mergeGroups([a, b, c])).toHaveLength(1);
  });

  it("同效果同品质但触发器不同 → 可进化(2 张护盾受击×1+击杀×1 也能合成)", () => {
    const a = mkTrigger("受击·护盾生成", "common", 1, "hit");
    const b = mkTrigger("击杀·护盾生成", "common", 2, "kill");
    expect(mergeGroups([a, b])).toHaveLength(1);
  });

  it("同效果同品质但触发器不同 → 保留词条最多的一张(进化后触发器随保留卡)", () => {
    const a = mkTrigger("受击·护盾生成", "common", 1, "hit", [makeModifier("power", { pct3: 0.2 })]);
    const b = mkTrigger("击杀·护盾生成", "common", 2, "kill");
    const groups = mergeGroups([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sample.id).toBe(1); // 修饰器最多的保留
  });

  it("1 张同款 → 不进化(保底 2 张)", () => {
    expect(mergeGroups([mk("x", "rare", 1)])).toHaveLength(0);
  });

  it("同效果不同品质 → 不进化", () => {
    const a = mk("x", "rare", 1);
    const b = mk("x", "epic", 2);
    expect(mergeGroups([a, b])).toHaveLength(0);
  });

  it("品质升级路径:common→rare→epic→legendary→hidden", () => {
    expect(qualityUpgrade("common")).toBe("rare");
    expect(qualityUpgrade("rare")).toBe("epic");
    expect(qualityUpgrade("epic")).toBe("legendary");
    expect(qualityUpgrade("legendary")).toBe("hidden");
    expect(qualityUpgrade("hidden")).toBeNull();
    expect(qualityPowerRatio("rare", "epic")).toBeCloseTo(1.35);
  });
});

describe("强化(数值增长,金币出口)", () => {
  it("品质等级上限:品质决定形态上限", () => {
    expect(QUALITY_MAX_LEVEL.common).toBe(5);
    expect(QUALITY_MAX_LEVEL.rare).toBe(8);
    expect(QUALITY_MAX_LEVEL.epic).toBe(12);
    expect(QUALITY_MAX_LEVEL.legendary).toBe(16);
    expect(QUALITY_MAX_LEVEL.hidden).toBe(20);
  });

  it("canUpgrade:未达上限可强化,满级不可(转进化)", () => {
    const eq = mk("x", "common", 1);
    expect(canUpgrade(eq)).toBe(true);
    eq.level = QUALITY_MAX_LEVEL.common;
    expect(canUpgrade(eq)).toBe(false);
  });

  it("强化价格随等级递增(金币出口),基础价按品质", () => {
    const eq = mk("x", "rare", 1);
    const lv1Cost = upgradeCost(eq);
    eq.level = 4;
    const lv4Cost = upgradeCost(eq);
    expect(lv4Cost).toBeGreaterThan(lv1Cost);
    expect(qualityBasePrice("common")).toBe(15);
    expect(qualityBasePrice("rare")).toBe(30);
    expect(qualityBasePrice("epic")).toBe(60);
    expect(qualityBasePrice("legendary")).toBe(120);
  });
});
