/**
 * 场内成长测试 —— 进化(2 张同款保底升档)与强化(金币升级,数值增长)。
 */

import { describe, it, expect } from "vitest";
import { vec2 } from "@game/core/math";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";
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
import { MERGE_FEE_MULT } from "@game/data/shop";

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

/** 复刻 game.mergeGroups 的纯逻辑(按类型键,阈值 2,且仍有上一档可升) */
function mergeGroups(equipment: Equipment[]) {
  const map = new Map<string, { name: string; quality: Equipment["quality"]; count: number; sample: Equipment }>();
  for (const eq of equipment) {
    const key = typeKey(eq);
    const g = map.get(key);
    if (g) g.count += 1;
    else map.set(key, { name: eq.effect.def.name, quality: eq.quality, count: 1, sample: eq });
  }
  return [...map.values()].filter((g) => g.count >= 2 && qualityUpgrade(g.quality) !== null).slice(0, 4);
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

  it("隐藏档 2 张/3 张 → 不成组(终止档无可升上一档,挂出来是死点击)", () => {
    expect(mergeGroups([mk("x", "hidden", 1), mk("x", "hidden", 2)])).toHaveLength(0);
    expect(mergeGroups([mk("x", "hidden", 1), mk("x", "hidden", 2), mk("x", "hidden", 3)])).toHaveLength(0);
  });

  it("传奇档仍可进化到隐藏(终止档只卡隐藏自己)", () => {
    expect(mergeGroups([mk("x", "legendary", 1), mk("x", "legendary", 2)]).map((g) => g.quality)).toEqual(["legendary"]);
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

describe("共享层 mergeGroups:只有仍可升档的组才进商店进化列表", () => {
  /** 活世界只读装备数组,不开局也能取到 sim.world */
  function worldWith(equipment: Equipment[]) {
    const sim = new BattleSim({
      save: emptySave(),
      input: { isMoving: false, moveDir: vec2(0, 0) },
      worldH: 996,
      persist: () => {},
      callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
    });
    sim.player.equipment.push(...equipment);
    return sim.world;
  }

  it("2 张隐藏 → 空列表(进化行不再挂出「升品 400金」)", () => {
    const w = worldWith([mk("x", "hidden", 1), mk("x", "hidden", 2)]);
    expect(w.mergeGroups()).toHaveLength(0);
  });

  it("2 张传奇 → 成组,补位费仍是品质基础价 ×2", () => {
    const w = worldWith([mk("x", "legendary", 1), mk("x", "legendary", 2)]);
    const groups = w.mergeGroups();
    expect(groups).toHaveLength(1);
    expect(qualityBasePrice(groups[0].quality) * MERGE_FEE_MULT).toBe(240);
  });
});
