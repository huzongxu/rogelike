/**
 * A2 · 单卡重随与隐藏词条 —— 依据 docs/DESIGN-SEASON-FEEL.md 批次 A · A2(需求 F9)。
 *
 * 守四件事:
 *  ① 隐藏词条**只**从重随通道产出:常规刷卡/三选一/套组生成永远不发它们,否则稀有度模型垮;
 *  ② 重随只换触发器与修饰器,效果 / 品质 / 等级 / id 一律不动(玩家点的是"这张卡的词条");
 *  ③ 亲和加权真的把"适配这个技能的词条"抬起来,且倍率就是表里那个 AFFINITY_WEIGHT;
 *  ④ 四个隐藏词条在战斗结算里各有真实行为(猎首 / 暴击 / 回响 / 送葬),不是挂名不出货。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player } from "@game/entities/player";
import { spawnEnemy, type Enemy } from "@game/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "@game/systems/equipmentEngine";
import { makeEffect, makeModifier, makeTrigger, HIDDEN_MODIFIER_TYPES, HIDDEN_TRIGGER_TYPES, type ModifierType, type TriggerType } from "@game/data/affixes";
import {
  HIDDEN_MODIFIER_VALUES,
  NORMAL_MODIFIERS,
  NORMAL_TRIGGERS,
  condemnedMultOf,
  describeModifier,
  describeTrigger,
  echoSpecOf,
  generateEquipment,
  generateSetEquipment,
  rerollCard,
  type Equipment,
} from "@game/data/equipmentGen";
import { AFFINITY_WEIGHT, REROLL_CURVE, REROLL_HIDDEN, SKILL_AFFINITY, rerollPrice } from "@game/data/reroll";
import { QUALITY_MAX_LEVEL, qualityDef } from "@game/data/quality";
import { CRIT_TRIGGER_CD } from "@game/data/combat";
import { setDef, type SetId } from "@game/data/sets";
import { vec2 } from "@game/core/math";

/** 与战斗指纹同源的 mulberry32:样本统计要可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 固定值随机源:用于精确命中/不命中隐藏概率 */
function constRoll(v: number): () => number {
  return () => v;
}

function mk(quality: Equipment["quality"], effect: Equipment["effect"]["def"]["type"] = "meteor", level = 5, id = 1): Equipment {
  return {
    id,
    level,
    quality,
    name: "测试",
    triggers: [makeTrigger("pulse", { interval: 1.5 })],
    effect: makeEffect(effect, { damage: 90, radius: 140, delay: 1 }, level),
    modifiers: [],
  };
}

describe("A2 隐藏词条只走重随通道", () => {
  it("常规生成 400 件:触发器与修饰器都不含隐藏那四条", () => {
    const roll = mulberry32(7);
    const seenT = new Set<TriggerType>();
    const seenM = new Set<ModifierType>();
    for (let i = 0; i < 400; i++) {
      void roll;
      const eq = generateEquipment(1 + (i % 30), i % 7 === 0 ? "legendary" : undefined);
      for (const t of eq.triggers) seenT.add(t.def.type);
      for (const m of eq.modifiers) seenM.add(m.def.type);
    }
    for (const h of HIDDEN_TRIGGER_TYPES) expect(seenT.has(h), `常规池漏出隐藏触发器 ${h}`).toBe(false);
    for (const h of HIDDEN_MODIFIER_TYPES) expect(seenM.has(h), `常规池漏出隐藏修饰器 ${h}`).toBe(false);
    expect([...seenT].every((t) => NORMAL_TRIGGERS.includes(t))).toBe(true);
    expect([...seenM].every((m) => NORMAL_MODIFIERS.includes(m))).toBe(true);
  });

  it("套组生成同样不发隐藏词条", () => {
    const ids = Object.keys(SKILL_AFFINITY).length > 0 ? (["thorn", "barrage", "ember", "frost"] as SetId[]) : [];
    const seenT = new Set<TriggerType>();
    for (const id of ids) {
      for (let i = 0; i < 60; i++) {
        const eq = generateSetEquipment(id, 5 + (i % 10));
        for (const t of eq.triggers) seenT.add(t.def.type);
      }
    }
    for (const h of HIDDEN_TRIGGER_TYPES) expect(seenT.has(h)).toBe(false);
  });

  it("常规池与隐藏归属合起来正好是整张类型联合(不漏不重)", () => {
    expect(NORMAL_TRIGGERS).toEqual(["pulse", "kill", "hurt", "move", "hit", "combo"]);
    expect(NORMAL_MODIFIERS).toEqual(["chain", "explode", "split", "lifesteal", "pierce", "haste", "power", "duration"]);
    expect(HIDDEN_TRIGGER_TYPES).toEqual(["crit", "elite"]);
    expect(HIDDEN_MODIFIER_TYPES).toEqual(["echo", "condemned"]);
  });
});

describe("A2 重随只换词条", () => {
  it("效果 / 品质 / 等级 / id 一律不动", () => {
    const eq = mk("epic", "meteor", 7, 42);
    const before = { id: eq.id, level: eq.level, quality: eq.quality, effect: eq.effect.def.type, damage: eq.effect.params.damage };
    rerollCard(eq, { roll: constRoll(0.5) });
    expect({ id: eq.id, level: eq.level, quality: eq.quality, effect: eq.effect.def.type, damage: eq.effect.params.damage }).toEqual(before);
  });

  it("词条数量仍由品质决定(各档逐一核)", () => {
    for (const q of ["common", "rare", "epic", "legendary", "hidden"] as const) {
      const eq = mk(q, "knife", 3, 900 + q.length);
      rerollCard(eq, { roll: mulberry32(11) });
      expect(eq.triggers, q).toHaveLength(qualityDef(q).triggers);
      expect(eq.modifiers, q).toHaveLength(qualityDef(q).modifiers);
    }
  });

  it("同一张卡内触发器不重复、修饰器不重复(抽样不放回)", () => {
    const eq = mk("hidden", "knife", 10, 77); // 隐藏品质 = 1 触发器 + 3 修饰器
    for (let i = 0; i < 200; i++) {
      rerollCard(eq, { roll: mulberry32(1000 + i) });
      const ts = eq.triggers.map((t) => t.def.type);
      const ms = eq.modifiers.map((m) => m.def.type);
      expect(new Set(ts).size, ts.join(",")).toBe(ts.length);
      expect(new Set(ms).size, ms.join(",")).toBe(ms.length);
    }
  });

  it("重随会改名(卡名由词条拼出,词条换了名字要跟着换)", () => {
    const eq = mk("epic", "knife", 5, 5);
    eq.name = "旧名";
    rerollCard(eq, { roll: mulberry32(3) });
    expect(eq.name).not.toBe("旧名");
    expect(eq.name.length).toBeGreaterThan(0);
  });

  it("等级达到品质上限后仍可重随(重随换的是形态,强化换的是数值,两条互不挡)", () => {
    const eq = mk("common", "knife", QUALITY_MAX_LEVEL.common, 8);
    const r = rerollCard(eq, { roll: mulberry32(5) });
    expect(r.eq.level).toBe(QUALITY_MAX_LEVEL.common);
    expect(r.eq.triggers).toHaveLength(1);
  });
});

describe("A2 隐藏概率与保底", () => {
  it("随机源高于概率且未到保底 → 不出隐藏", () => {
    const eq = mk("epic", "knife", 5, 1);
    const r = rerollCard(eq, { roll: constRoll(0.99), hiddenDryStreak: 0 });
    expect(r.hidden).toBe(false);
    expect(r.hiddenTriggers).toEqual([]);
    expect(r.hiddenModifiers).toEqual([]);
  });

  it("随机源低于概率 → 出隐藏,首条触发器与首条修饰器都来自隐藏池", () => {
    const eq = mk("epic", "knife", 5, 2); // epic = 1 触发器 + 2 修饰器
    const r = rerollCard(eq, { roll: constRoll(0.0), hiddenDryStreak: 0 });
    expect(r.hidden).toBe(true);
    expect(r.hiddenTriggers).toHaveLength(1);
    expect(HIDDEN_TRIGGER_TYPES.includes(r.hiddenTriggers[0])).toBe(true);
    expect(r.hiddenModifiers).toHaveLength(1);
    expect(HIDDEN_MODIFIER_TYPES.includes(r.hiddenModifiers[0])).toBe(true);
    expect(eq.triggers[0].def.type).toBe(r.hiddenTriggers[0]);
    expect(eq.modifiers[0].def.type).toBe(r.hiddenModifiers[0]);
  });

  it("连续未出达保底次数 → 必出(即使随机源一直很高)", () => {
    const eq = mk("rare", "knife", 5, 3);
    const r = rerollCard(eq, { roll: constRoll(0.99), hiddenDryStreak: REROLL_HIDDEN.pity - 1 });
    expect(r.hidden).toBe(true);
    expect(REROLL_HIDDEN.pity).toBe(12);
  });

  it("保底前一次仍按概率走(边界不提前)", () => {
    const eq = mk("rare", "knife", 5, 4);
    const r = rerollCard(eq, { roll: constRoll(0.99), hiddenDryStreak: REROLL_HIDDEN.pity - 2 });
    expect(r.hidden).toBe(false);
  });

  it("普通品质没有修饰器槽 → 命中隐藏时只给隐藏触发器,不硬塞修饰器", () => {
    const eq = mk("common", "knife", 5, 5);
    const r = rerollCard(eq, { roll: constRoll(0.0) });
    expect(r.hidden).toBe(true);
    expect(r.hiddenTriggers).toHaveLength(1);
    expect(r.hiddenModifiers).toEqual([]);
    expect(eq.modifiers).toHaveLength(0);
  });

  it("传奇双触发器:命中隐藏时只有首条是隐藏的,第二条仍从常规池取", () => {
    const eq = mk("legendary", "knife", 5, 6);
    for (let i = 0; i < 50; i++) {
      const r = rerollCard(eq, { roll: constRoll(0.0) });
      expect(r.hidden).toBe(true);
      expect(HIDDEN_TRIGGER_TYPES.includes(eq.triggers[0].def.type)).toBe(true);
      expect(NORMAL_TRIGGERS.includes(eq.triggers[1].def.type), `第二条漏成隐藏:${eq.triggers[1].def.type}`).toBe(true);
    }
  });

  it("大样本下隐藏命中率贴近表里的概率(±2 个百分点,种子固定可复现)", () => {
    const roll = mulberry32(2026);
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const eq = mk("rare", "knife", 5, 1000 + i);
      if (rerollCard(eq, { roll }).hidden) hits += 1;
    }
    const rate = hits / N;
    expect(Math.abs(rate - REROLL_HIDDEN.chance)).toBeLessThan(0.02);
  });
});

describe("A2 技能亲和加权(F9:不同技能适配不一样)", () => {
  it("首个触发器里,亲和项的出现率是非亲和项的 AFFINITY_WEIGHT 倍", () => {
    const effect = "meteor" as const;
    const affine = SKILL_AFFINITY[effect].triggers;
    expect(affine).toEqual(["pulse", "combo"]);
    const roll = mulberry32(99);
    const count = new Map<TriggerType, number>();
    let samples = 0;
    for (let i = 0; i < 6000; i++) {
      const eq = mk("common", effect, 5, 2000 + i); // common = 1 触发器,只看首条
      const r = rerollCard(eq, { roll });
      if (r.hidden) continue; // 隐藏命中会占掉首条,剔除以免污染分布
      samples += 1;
      const t = eq.triggers[0].def.type;
      count.set(t, (count.get(t) ?? 0) + 1);
    }
    expect(samples).toBeGreaterThan(5000);
    const perAffine = affine.reduce((s, t) => s + (count.get(t) ?? 0), 0) / affine.length;
    const others = NORMAL_TRIGGERS.filter((t) => !affine.includes(t));
    const perOther = others.reduce((s, t) => s + (count.get(t) ?? 0), 0) / others.length;
    const ratio = perAffine / perOther;
    expect(ratio, `实测倍率 ${ratio.toFixed(2)}`).toBeGreaterThan(AFFINITY_WEIGHT * 0.8);
    expect(ratio).toBeLessThan(AFFINITY_WEIGHT * 1.2);
  });

  it("非亲和项仍可能出(不是硬定向,保留构筑意外)", () => {
    const roll = mulberry32(123);
    const seen = new Set<TriggerType>();
    for (let i = 0; i < 300; i++) {
      const eq = mk("common", "meteor", 5, 3000 + i);
      const r = rerollCard(eq, { roll });
      if (!r.hidden) seen.add(eq.triggers[0].def.type);
    }
    expect(seen.size).toBe(NORMAL_TRIGGERS.length);
  });

  it("出战套组声明的触发器也进亲和池(英雄特色)", () => {
    const setId: SetId = "blizzard";
    const setTriggers = setDef(setId).triggers;
    const skillAffine = SKILL_AFFINITY.knife.triggers;
    const extra = setTriggers.filter((t) => !skillAffine.includes(t));
    expect(extra.length, "本用例需要一个不在技能亲和里的套组触发器").toBeGreaterThan(0);
    const roll = mulberry32(555);
    let withSet = 0;
    let without = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const a = mk("common", "knife", 5, 4000 + i);
      const ra = rerollCard(a, { roll, setId });
      const b = mk("common", "knife", 5, 8000 + i);
      const rb = rerollCard(b, { roll });
      if (ra.hidden || rb.hidden) continue;
      n += 1;
      if (extra.includes(a.triggers[0].def.type)) withSet += 1;
      if (extra.includes(b.triggers[0].def.type)) without += 1;
    }
    expect(n).toBeGreaterThan(3000);
    expect(withSet, `带套组 ${withSet} vs 不带 ${without}`).toBeGreaterThan(without * 1.5);
  });

  it("修饰器侧同样按亲和加权", () => {
    const affine = SKILL_AFFINITY.frost_ring.modifiers;
    const roll = mulberry32(31);
    const count = new Map<ModifierType, number>();
    let samples = 0;
    for (let i = 0; i < 5000; i++) {
      const eq = mk("rare", "frost_ring", 5, 5000 + i); // rare = 1 修饰器
      const r = rerollCard(eq, { roll });
      if (r.hidden) continue;
      samples += 1;
      const m = eq.modifiers[0].def.type;
      count.set(m, (count.get(m) ?? 0) + 1);
    }
    const perAffine = affine.reduce((s, m) => s + (count.get(m) ?? 0), 0) / affine.length;
    const others = NORMAL_MODIFIERS.filter((m) => !affine.includes(m));
    const perOther = others.reduce((s, m) => s + (count.get(m) ?? 0), 0) / others.length;
    expect(samples).toBeGreaterThan(4000);
    expect(perAffine / perOther).toBeGreaterThan(AFFINITY_WEIGHT * 0.8);
  });
});

describe("A2 重随价格曲线", () => {
  it("base × growth^n,且与表同源(不在别处另算一份)", () => {
    expect(rerollPrice(0)).toBe(REROLL_CURVE.base);
    expect(rerollPrice(1)).toBe(Math.round(REROLL_CURVE.base * REROLL_CURVE.growth));
    expect(rerollPrice(2)).toBe(Math.round(REROLL_CURVE.base * Math.pow(REROLL_CURVE.growth, 2)));
    expect([0, 1, 2, 3].map(rerollPrice)).toEqual([12, 18, 27, 41]);
  });

  it("单调不减(越刷越贵,防无限重随刷词条)", () => {
    for (let n = 0; n < 12; n++) expect(rerollPrice(n + 1)).toBeGreaterThanOrEqual(rerollPrice(n));
  });

  it("负次数按 0 计(防御性钳制,不产生 0 价或负价)", () => {
    expect(rerollPrice(-3)).toBe(REROLL_CURVE.base);
  });
});

describe("A2 隐藏词条的文案与数值出处", () => {
  it("四个隐藏词条都有非空的玩家可读文案", () => {
    for (const t of HIDDEN_TRIGGER_TYPES) {
      expect(describeTrigger(makeTrigger(t, {})).length, t).toBeGreaterThan(0);
    }
    expect(describeModifier(makeModifier("echo", { ...HIDDEN_MODIFIER_VALUES.echo }))).toContain("回响");
    expect(describeModifier(makeModifier("condemned", { ...HIDDEN_MODIFIER_VALUES.condemned }))).toContain("30%");
  });

  it("隐藏修饰器数值只有一个出处(生成与结算读同一份)", () => {
    const eq = mk("rare", "knife", 5, 1);
    eq.modifiers = [makeModifier("echo", { ...HIDDEN_MODIFIER_VALUES.echo })];
    expect(echoSpecOf(eq)).toEqual({ sec: HIDDEN_MODIFIER_VALUES.echo.echoSec, mult: HIDDEN_MODIFIER_VALUES.echo.echoMult });
    expect(HIDDEN_MODIFIER_VALUES.echo).toEqual({ echoSec: 0.35, echoMult: 0.5 });
    expect(HIDDEN_MODIFIER_VALUES.condemned).toEqual({ condemnHp: 0.3, condemnMult: 1.45 });
  });

  it("送葬:阈值内按倍率增伤、阈值外为 1、多条叠乘、无此修饰器为 1", () => {
    const one = mk("rare", "knife", 5, 1);
    one.modifiers = [makeModifier("condemned", { ...HIDDEN_MODIFIER_VALUES.condemned })];
    expect(condemnedMultOf(one, 0.29)).toBeCloseTo(1.45, 10);
    expect(condemnedMultOf(one, 0.3)).toBe(1); // 阈值是严格小于
    expect(condemnedMultOf(one, 1)).toBe(1);
    const two = mk("rare", "knife", 5, 2);
    two.modifiers = [
      makeModifier("condemned", { ...HIDDEN_MODIFIER_VALUES.condemned }),
      makeModifier("condemned", { ...HIDDEN_MODIFIER_VALUES.condemned }),
    ];
    expect(condemnedMultOf(two, 0.1)).toBeCloseTo(1.45 * 1.45, 10);
    expect(condemnedMultOf(mk("rare", "knife", 5, 3), 0.01)).toBe(1);
  });

  it("无回响修饰器 → echoSpecOf 返 null(不会白排队一次二次触发)", () => {
    expect(echoSpecOf(mk("rare", "knife", 5, 1))).toBeNull();
  });
});

/* ==================== 战斗结算侧:四个隐藏词条真的会动 ==================== */

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

function hiddenCard(triggers: TriggerType[], modifiers: ModifierType[], damage = 100, pulseInterval = 10, quality: Equipment["quality"] = "common"): Equipment {
  return {
    id: 1,
    level: 5,
    quality,
    name: "隐藏测试刀",
    triggers: triggers.map((t) => makeTrigger(t, t === "pulse" ? { interval: pulseInterval } : {})),
    effect: makeEffect("knife", { damage, speed: 520, radius: 640, spread: 1 }, 5),
    modifiers: modifiers.map((m) => makeModifier(m, m === "echo" ? { ...HIDDEN_MODIFIER_VALUES.echo } : { ...HIDDEN_MODIFIER_VALUES.condemned })),
  };
}

let engine: EquipmentEngine;
let ctx: ReturnType<typeof makeContext>;
let player: Player;

beforeEach(() => {
  player = new Player();
  engine = new EquipmentEngine();
  // 靶怪相对玩家放:飞刀有索敌射程,写死坐标一旦超出射程就会空放,断言全废
  ctx = makeContext(player, [spawnEnemy("chaser", vec2(player.pos.x + 200, player.pos.y), 1)]);
});

describe("A2 隐藏触发器的战斗行为", () => {
  it("猎首:击杀精英触发,击杀普通怪不触发", () => {
    const eq = hiddenCard(["elite"], []);
    player.equipment.push(eq);
    engine.onKill(ctx, spawnEnemy("chaser", vec2(300, 500), 1));
    expect(ctx.projectiles).toHaveLength(0);
    engine.onKill(ctx, spawnEnemy("elite", vec2(300, 500), 5));
    expect(ctx.projectiles.length).toBeGreaterThan(0);
  });

  it("猎首:击杀首领也触发", () => {
    const eq = hiddenCard(["elite"], []);
    player.equipment.push(eq);
    engine.onKill(ctx, spawnEnemy("boss", vec2(300, 500), 20));
    expect(ctx.projectiles.length).toBeGreaterThan(0);
  });

  it("暴击触发:onCrit 放一次,冷却内再暴击不放,冷却过后再放", () => {
    const eq = hiddenCard(["crit"], []);
    player.equipment.push(eq);
    engine.onCrit(ctx);
    const after1 = ctx.projectiles.length;
    expect(after1).toBeGreaterThan(0);
    engine.onCrit(ctx);
    expect(ctx.projectiles.length, "冷却内不该连发").toBe(after1);
    engine.update(ctx, CRIT_TRIGGER_CD + 0.05);
    engine.onCrit(ctx);
    expect(ctx.projectiles.length).toBeGreaterThan(after1);
  });

  it("冷却常量取自表(不在引擎里内联)", () => {
    expect(CRIT_TRIGGER_CD).toBe(0.7);
  });
});

describe("A2 回响的战斗行为", () => {
  it("施放后按延迟二次触发,且二次伤害是首次的 echoMult 倍", () => {
    const eq = hiddenCard(["pulse"], ["echo"], 100); // 脉冲间隔 10s:窗口内只可能有一次正常施放
    player.equipment.push(eq);
    engine.update(ctx, 10.5);
    const first = ctx.projectiles.map((p) => p.damage);
    expect(first).toHaveLength(1);
    const spec = HIDDEN_MODIFIER_VALUES.echo;
    engine.update(ctx, spec.echoSec + 0.05); // 回响到期 → 第二发只可能来自回响
    const all = ctx.projectiles.map((p) => p.damage);
    expect(all).toHaveLength(2);
    // 缩放乘在乘区上、两次各自取整,故留 1 点容差
    expect(Math.abs(all[1] - first[0] * spec.echoMult)).toBeLessThanOrEqual(1);
    expect(all[1]).toBeLessThan(first[0]);
  });

  it("二次触发自身不再排队:再推三个回响周期也不多发", () => {
    const eq = hiddenCard(["pulse"], ["echo"], 100);
    player.equipment.push(eq);
    engine.update(ctx, 10.5);
    const spec = HIDDEN_MODIFIER_VALUES.echo;
    engine.update(ctx, spec.echoSec + 0.05);
    expect(ctx.projectiles).toHaveLength(2);
    engine.update(ctx, spec.echoSec * 3);
    expect(ctx.projectiles, "回响链失控").toHaveLength(2);
  });

  it("没有回响修饰器 → 同一条时间线上只有正常施放那一发", () => {
    const eq = hiddenCard(["pulse"], [], 100);
    player.equipment.push(eq);
    engine.update(ctx, 10.5);
    expect(ctx.projectiles).toHaveLength(1);
    engine.update(ctx, HIDDEN_MODIFIER_VALUES.echo.echoSec + 0.05);
    expect(ctx.projectiles).toHaveLength(1);
  });

  it("回响对隐藏词缀卡同样生效(fire 在 hiddenAffix 提前返回那条路上也要复位缩放)", () => {
    const eq: Equipment = { ...hiddenCard(["pulse"], ["echo"], 100), hiddenAffix: "death_barrage" };
    player.equipment.push(eq);
    engine.update(ctx, 10.5);
    const first = ctx.projectiles.map((p) => p.damage);
    expect(first.length).toBeGreaterThan(1); // 死亡弹幕是八方齐射
    const spec = HIDDEN_MODIFIER_VALUES.echo;
    engine.update(ctx, spec.echoSec + 0.05);
    const all = ctx.projectiles.map((p) => p.damage);
    expect(all).toHaveLength(first.length * 2);
    for (const d of all.slice(first.length)) expect(Math.abs(d - first[0] * spec.echoMult)).toBeLessThanOrEqual(1);
    // 缩放必须已复位:再放一张**不带回响**的同伤害卡,若 fire 的提前返回路径漏了复位,这张会继承半伤
    const plain = hiddenCard(["pulse"], [], 100, 10);
    plain.id = 2;
    player.equipment.push(plain);
    const before = ctx.projectiles.length;
    engine.update(ctx, 10.5);
    const plainShots = ctx.projectiles.slice(before).map((p) => p.damage);
    expect(plainShots.length).toBeGreaterThan(0);
    for (const d of plainShots) expect(Math.abs(d - first[0])).toBeLessThanOrEqual(1);
  });
});
