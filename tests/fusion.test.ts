/**
 * 词缀融合系统测试 —— 减压改版:成本表、自动继承、必成功、隐藏词缀保底三选一、三重融合。
 */

import { describe, it, expect } from "vitest";
import {
  fusionCost,
  performFusion,
  performTripleFusion,
  tripleUnlocked,
  tripleFusionCost,
  rollHiddenCandidates,
  applyHiddenAffix,
  inheritSource,
  HIDDEN_AFFIXES,
  HIDDEN_PITY_N,
} from "../src/data/fusion";
import { makeTrigger, makeEffect, makeModifier, type TriggerType, type EffectType, type ModifierType } from "../src/data/affixes";
import type { Equipment } from "../src/data/equipmentGen";

function makeEq(
  id: number,
  quality: Equipment["quality"],
  trigger: TriggerType,
  effect: EffectType,
  modifiers: ModifierType[] = []
): Equipment {
  return {
    id,
    level: 3,
    quality,
    name: `测试装备${id}`,
    triggers: [makeTrigger(trigger, { interval: 1, chance: 1 })],
    effect: makeEffect(effect, { damage: 20, radius: 100 }, 3),
    modifiers: modifiers.map((m) => makeModifier(m, {})),
  };
}

describe("融合成本(品质组合表)", () => {
  it("普通×普通:0 星尘", () => {
    expect(fusionCost("common", "common")).toBe(0);
  });
  it("稀有×稀有:15 星尘", () => {
    expect(fusionCost("rare", "rare")).toBe(15);
  });
  it("稀有×传奇:30 星尘(组合键与顺序无关)", () => {
    expect(fusionCost("rare", "legendary")).toBe(30);
    expect(fusionCost("legendary", "rare")).toBe(30);
  });
  it("传奇×传奇:60 星尘", () => {
    expect(fusionCost("legendary", "legendary")).toBe(60);
  });
});

describe("自动继承与必成功", () => {
  it("必成功:总产出成品且成本返回", () => {
    const a = makeEq(1, "epic", "kill", "knife", ["chain"]);
    const b = makeEq(2, "rare", "pulse", "nova");
    const out = performFusion(a, b);
    expect(out.result).toBeDefined();
    expect(out.cost).toBe(fusionCost("epic", "rare"));
  });

  it("部件自动继承品质更高一方", () => {
    const a = makeEq(1, "rare", "kill", "knife");
    const b = makeEq(2, "epic", "pulse", "nova");
    const out = performFusion(a, b);
    expect(out.result.effect.def.type).toBe("nova");
    expect(out.result.triggers[0].def.type).toBe("pulse");
    expect(out.result.quality).toBe("epic");
  });

  it("同品质取 A(效果取 A)", () => {
    const a = makeEq(1, "rare", "kill", "knife");
    const b = makeEq(2, "rare", "pulse", "nova");
    const out = performFusion(a, b);
    expect(out.result.effect.def.type).toBe("knife");
  });

  it("成品等级取两件最高", () => {
    const a = makeEq(1, "rare", "kill", "knife");
    const b = { ...makeEq(2, "epic", "pulse", "nova"), level: 7 };
    expect(performFusion(a, b).result.level).toBe(7);
  });

  it("继承来源助手:品质更高一方;同品质取 A", () => {
    const a = makeEq(1, "epic", "kill", "knife");
    const b = makeEq(2, "rare", "pulse", "nova");
    expect(inheritSource(a, b)).toBe(a);
    expect(inheritSource(b, a)).toBe(a);
  });
});

describe("隐藏词缀保底三选一", () => {
  it("保底周期常量为 10", () => {
    expect(HIDDEN_PITY_N).toBe(10);
  });

  it("候选为 3 个互不重复的合法隐藏词缀", () => {
    const cands = rollHiddenCandidates();
    expect(cands).toHaveLength(3);
    expect(new Set(cands).size).toBe(3);
    for (const c of cands) {
      expect(HIDDEN_AFFIXES.some((h) => h.type === c)).toBe(true);
    }
  });

  it("确定性 roll 也产出合法候选", () => {
    const cands = rollHiddenCandidates(() => 0.999);
    expect(cands).toHaveLength(3);
    expect(new Set(cands).size).toBe(3);
  });

  it("applyHiddenAffix:彩虹品质 + 隐藏词缀命名", () => {
    const base = performFusion(makeEq(1, "epic", "kill", "knife"), makeEq(2, "rare", "pulse", "nova")).result;
    const hd = applyHiddenAffix(base, "supernova");
    expect(hd.quality).toBe("hidden");
    expect(hd.hiddenAffix).toBe("supernova");
    expect(hd.name).toBe("超新星");
  });

  it("隐藏词缀定义完整(4 种)", () => {
    expect(HIDDEN_AFFIXES).toHaveLength(4);
    for (const h of HIDDEN_AFFIXES) {
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.desc.length).toBeGreaterThan(0);
    }
  });
});

describe("三重融合(减压改版)", () => {
  it("解锁条件:需 ≥6 个天赋节点", () => {
    expect(tripleUnlocked(5)).toBe(false);
    expect(tripleUnlocked(6)).toBe(true);
  });

  it("成本 = 最高品质融合成本 × 2", () => {
    const a = makeEq(1, "legendary", "kill", "knife");
    const b = makeEq(2, "legendary", "pulse", "nova");
    const c = makeEq(3, "rare", "move", "cloud");
    expect(tripleFusionCost(a, b, c)).toBe(120);
  });

  it("部件自动继承品质最高一方(同品质按 A/B/C 取先)", () => {
    const a = makeEq(1, "rare", "kill", "knife");
    const b = makeEq(2, "legendary", "pulse", "nova");
    const c = makeEq(3, "rare", "move", "cloud");
    const out = performTripleFusion(a, b, c, "double_trigger");
    expect(out.result.effect.def.type).toBe("nova");
    expect(out.result.quality).toBe("legendary");
  });

  it("双触发器模式:成品保留 2 个触发器(主来源 + 其余装备首个)", () => {
    const a = makeEq(1, "rare", "kill", "knife");
    const b = makeEq(2, "rare", "pulse", "nova");
    const c = makeEq(3, "rare", "move", "cloud");
    const out = performTripleFusion(a, b, c, "double_trigger");
    expect(out.result.triggers).toHaveLength(2);
    expect(out.result.triggers.map((t) => t.def.type)).toContain("kill");
    expect(out.result.triggers.map((t) => t.def.type)).toContain("pulse");
  });

  it("双修饰器模式:成品保留 2 个修饰器", () => {
    const a = makeEq(1, "rare", "kill", "knife", ["chain"]);
    const b = makeEq(2, "rare", "pulse", "nova", ["explode"]);
    const c = makeEq(3, "rare", "move", "cloud", ["split"]);
    const out = performTripleFusion(a, b, c, "double_modifier");
    expect(out.result.modifiers).toHaveLength(2);
  });

  it("必成功:总产出成品", () => {
    const a = makeEq(1, "legendary", "kill", "knife");
    const b = makeEq(2, "legendary", "pulse", "nova");
    const c = makeEq(3, "rare", "move", "cloud");
    const out = performTripleFusion(a, b, c, "double_trigger");
    expect(out.result).toBeDefined();
    expect(out.cost).toBe(120);
  });
});
