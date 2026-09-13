/**
 * 赛季套组轮换单元测试(DESIGN-SEASON-SETS.md)。
 * 覆盖:L1 主题纯函数 / L2 赛季联动词缀(确定性、轮换、数值上限、引擎折入)/
 *       L3 赛季限定套组守卫 / 商店修饰器倾向 / 环境词缀加权 / S1 行为冻结。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { seasonTheme, setMutation, featuredSetId, isSeasonBoosted } from "@game/data/seasonSets";
import { SETS, setBonusState, setDef, allSets, releasedSets, seasonNewSets, type SetId } from "@game/data/sets";
import { generateSetEquipment, type Equipment } from "@game/data/equipmentGen";
import { makeTrigger, makeEffect, type EffectType } from "@game/data/affixes";
import { Player } from "@game/entities/player";
import { EquipmentEngine, type BattleContext, type Fx } from "@game/systems/equipmentEngine";
import { rollEnvAffixes, ENV_AFFIXES, type EnvAffixType } from "@game/data/envAffixes";
import { spawnEnemy } from "@game/entities/enemy";
import { vec2 } from "@game/core/math";

/* ---------- L1 主题 ---------- */

describe("赛季主题(seasonTheme)", () => {
  it("同赛季恒同主题(纯函数确定性)", () => {
    for (let id = 1; id <= 12; id++) {
      const a = seasonTheme(id);
      expect(seasonTheme(id)).toBe(a);
    }
  });
  it("S1-S4 主题齐全,S1 冻结为「回响苏醒」且无环境倾向", () => {
    expect(seasonTheme(1).name).toBe("回响苏醒");
    expect(seasonTheme(2).name).toBe("永冻深渊");
    expect(seasonTheme(3).name).toBe("熔火回响");
    expect(seasonTheme(4).name).toBe("幽冥潮汐");
    expect(seasonTheme(1).envBias).toBeUndefined();
  });
  it("主题按 4 循环(S5 = S1)", () => {
    expect(seasonTheme(5).name).toBe(seasonTheme(1).name);
    expect(seasonTheme(6).name).toBe(seasonTheme(2).name);
  });
  it("主题倾向里的环境词缀类型全部合法", () => {
    for (let id = 1; id <= 8; id++) {
      const bias = seasonTheme(id).envBias ?? {};
      for (const k of Object.keys(bias)) {
        expect(ENV_AFFIXES.some((a) => a.type === k)).toBe(true);
      }
    }
  });
});

/* ---------- L2 赛季联动词缀 ---------- */

describe("赛季联动词缀(setMutation)", () => {
  it("同赛季恒同一条(纯函数确定性)", () => {
    const a = setMutation(3, "thorn");
    expect(setMutation(3, "thorn")).toBe(a);
  });
  it("S1 三套各得一条:荆棘射程 / 弹幕间隔 / 余烬持续(设计文档 §3.1)", () => {
    expect(setMutation(1, "thorn")).toMatchObject({ name: "棘刺过载", patch: { rangeMult: 1.15 }, modifierBias: "explode" });
    expect(setMutation(1, "barrage")).toMatchObject({ name: "过载装填", patch: { intervalMult: 0.92 }, modifierBias: "haste" });
    expect(setMutation(1, "ember")).toMatchObject({ name: "余烬滋养", patch: { durationMult: 1.15 }, modifierBias: "duration" });
  });
  it("S1-S4 每季每套都有词缀且名称互不相同", () => {
    for (const setId of ["thorn", "barrage", "ember"] as SetId[]) {
      const names = new Set<string>();
      for (let season = 1; season <= 4; season++) {
        const m = setMutation(season, setId);
        expect(m, `S${season} ${setId} 应有词缀`).not.toBeNull();
        expect(m!.name.length).toBeGreaterThan(0);
        expect(m!.desc.length).toBeGreaterThan(0);
        names.add(m!.name);
      }
      expect(names.size).toBe(4);
    }
  });
  it("池长 5,轮换周期 5 赛季(S6 = S1)", () => {
    expect(setMutation(6, "thorn")).toBe(setMutation(1, "thorn"));
    expect(setMutation(7, "ember")).toBe(setMutation(2, "ember"));
  });
  it("所有 patch 数值都在上限内:召唤物伤害 +25% 封顶,其余 ±15%(数值墙不回头)", () => {
    for (const setId of allSets().map((s) => s.id)) {
      for (let season = 1; season <= 20; season++) {
        const m = setMutation(season, setId);
        if (!m) continue;
        for (const [k, v] of Object.entries(m.patch)) {
          const cap = k === "summonMult" ? 0.25 : 0.15;
          expect(Math.abs(v - 1), `S${season} ${setId} ${k}`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });
  it("每套在自己的发布赛季都有专属词缀;赛季限定套过季回落 null", () => {
    for (const season of [1, 2, 3, 4]) {
      for (const setId of seasonNewSets(season)) {
        const m = setMutation(season, setId);
        expect(m, `S${season} ${setId} 应有赛季联动词缀`).not.toBeNull();
        expect(m!.name.length).toBeGreaterThan(0);
        expect(m!.desc.length).toBeGreaterThan(0);
      }
    }
    // 非发布赛季:常驻三套仍走 5 条池轮换,赛季套组一律无词缀
    expect(setMutation(3, "glacier")).toBeNull();
    expect(setMutation(4, "blizzard")).toBeNull();
    expect(setMutation(2, "plague")).toBeNull();
    expect(setMutation(5, "cinderfang")).toBeNull();
    expect(setMutation(1, "requiem")).toBeNull();
    expect(setMutation(2, "veil")).toBeNull();
    expect(setMutation(9, "thorn")).not.toBeNull();
  });
  it("未选套组返回 null", () => {
    expect(setMutation(1, null)).toBeNull();
  });
  it("赛季套组专属词缀:仅当季生效,赛后回落 null", () => {
    expect(setMutation(2, "frost")).toMatchObject({
      name: "凛冬已至",
      patch: { dmgMult: 1.1, intervalMult: 0.92 },
      modifierBias: "haste",
    });
    expect(setMutation(3, "magma")).toMatchObject({
      name: "过热地脉",
      patch: { durationMult: 1.15 },
      modifierBias: "duration",
    });
    expect(setMutation(1, "frost")).toBeNull(); // 赛季未到
    expect(setMutation(3, "frost")).toBeNull(); // 赛季已过
    expect(setMutation(2, "magma")).toBeNull(); // 赛季未到
    expect(setMutation(4, "magma")).toBeNull(); // 赛季已过
    expect(setMutation(4, "phantom")).toMatchObject({
      name: "亡影谢幕",
      patch: { summonMult: 1.25 },
      modifierBias: "power",
    });
    expect(setMutation(2, "phantom")).toBeNull(); // 赛季未到
    expect(setMutation(5, "phantom")).toBeNull(); // 赛季已过
  });
});

/* ---------- L3 赛季限定套组守卫 ---------- */

describe("赛季限定套组(featuredSetId / isSeasonBoosted)", () => {
  it("featuredSetId = 当季代表套组(展示锚点),S1 与排期外赛季为 null", () => {
    expect(featuredSetId(1)).toBeNull();
    expect(featuredSetId(2)).toBe("frost");
    expect(featuredSetId(3)).toBe("magma");
    expect(featuredSetId(4)).toBe("phantom");
    expect(featuredSetId(5)).toBeNull(); // 排期外
  });
  it("强化门控 = 当季新发布(每季 3 套全部受益),与代表套组解耦", () => {
    for (const season of [1, 2, 3, 4]) {
      const boosted = allSets().filter((s) => isSeasonBoosted(season, s.id)).map((s) => s.id).sort();
      expect(boosted, `S${season} 受益套组`).toEqual(seasonNewSets(season).sort());
      expect(boosted).toHaveLength(3);
    }
    expect(allSets().filter((s) => isSeasonBoosted(5, s.id))).toEqual([]); // 四季循环,无第 5 季新内容
  });
  it("套组只在自己的发布赛季被强化,过季回落 false", () => {
    expect(isSeasonBoosted(1, "thorn")).toBe(true);
    expect(isSeasonBoosted(2, "thorn")).toBe(false);
    expect(isSeasonBoosted(2, "frost")).toBe(true);
    expect(isSeasonBoosted(1, "frost")).toBe(false); // 赛季未到
    expect(isSeasonBoosted(3, "frost")).toBe(false); // 赛季已过
    expect(isSeasonBoosted(2, "glacier")).toBe(true);
    expect(isSeasonBoosted(2, "blizzard")).toBe(true);
    expect(isSeasonBoosted(3, "plague")).toBe(true);
    expect(isSeasonBoosted(3, "cinderfang")).toBe(true);
    expect(isSeasonBoosted(4, "requiem")).toBe(true);
    expect(isSeasonBoosted(4, "veil")).toBe(true);
  });
});

/* ---------- 引擎折入(statsOf × 赛季词缀) ---------- */

function makeEquipment(effect: EffectType, id = 1, params: Record<string, number> = {}): Equipment {
  return {
    id,
    level: 1,
    quality: "common",
    name: effect,
    triggers: [makeTrigger("pulse", { interval: 1 })],
    effect: makeEffect(effect, { ...params }, 1),
    modifiers: [],
  };
}

function makeContext(
  player: Player,
  setId: SetId | null,
  seasonId: number
): BattleContext & { fx: Fx[]; heal: ReturnType<typeof vi.fn> } {
  const fx: Fx[] = [];
  const heal = vi.fn();
  return {
    player,
    enemies: [],
    projectiles: [],
    clouds: [],
    minions: [],
    setBonus: setBonusState(player.equipment, setId),
    seasonMutation: setMutation(seasonId, setId),
    addFx: (f) => fx.push(f),
    damageEnemy: vi.fn(),
    healPlayer: heal,
    addPlayerShield: vi.fn(),
    fx,
    heal,
  };
}

let engine: EquipmentEngine;
let player: Player;

beforeEach(() => {
  player = new Player();
  engine = new EquipmentEngine();
});

describe("S2 极北冰脉:新效果落地(EquipmentEngine)", () => {
  /** 辅助计件卡:kill 触发不发弹,避免干扰计数 */
  const aux = (effect: EffectType, id: number): Equipment => {
    const eq = makeEquipment(effect, id);
    eq.triggers = [makeTrigger("kill", {})];
    return eq;
  };
  it("冰锥:发射追踪弹;6 件质变(冰系×2)+ 凛冬已至(×1.1)全部折入伤害", () => {
    const eq = makeEquipment("icelance", 1, { damage: 55, speed: 700, radius: 640, homing: 4 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, aux("icelance", 2), aux("icelance", 3), aux("frost_ring", 4), aux("frost_ring", 5), aux("frost_ring", 6)];
    expect(setBonusState(player.equipment, "frost")).toMatchObject({ pieces: 6, bonus6: true });
    const ctx = makeContext(player, "frost", 2);
    ctx.enemies = [spawnEnemy("chaser", vec2(120, 0), 1)];
    engine.update(ctx, 0.35);
    expect(ctx.projectiles.length).toBe(1);
    expect(ctx.projectiles[0].homing).toBe(4);
    // 55 × 2(极北威压·质变) × 1.1(凛冬已至) = 121
    expect(ctx.projectiles[0].damage).toBe(121);
  });
  it("霜环:生成扩散环(ring),伤害折入冰系加成;无目标也照常成型", () => {
    const eq = makeEquipment("frost_ring", 1, { damage: 40, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, aux("frost_ring", 2), aux("icelance", 3), aux("icelance", 4), aux("icelance", 5), aux("icelance", 6)];
    const ctx = makeContext(player, "frost", 2);
    engine.update(ctx, 0.35);
    expect(ctx.clouds.length).toBe(1);
    const c = ctx.clouds[0];
    expect(c.ring).toBeTruthy();
    expect(c.ring!.expandSpeed).toBe(260);
    expect(c.radius).toBe(20); // 起始小环,扩张由 cloud tick 承担
    // 40 × 1.1(凛冬已至) × 2(极北威压·质变) = 88
    expect(c.dps).toBe(88);
    expect(c.ring!.hits.size).toBe(0);
  });
});

describe("S3 熔核教团:新效果落地(EquipmentEngine)", () => {
  /** 辅助计件卡:kill 触发不发弹,避免干扰计数 */
  const aux = (effect: EffectType, id: number): Equipment => {
    const eq = makeEquipment(effect, id);
    eq.triggers = [makeTrigger("kill", {})];
    return eq;
  };
  it("陨星:telegraph 云参数全链折入(地火奔涌+烈焰统治+过热地脉),无周期 tick 字段", () => {
    const eq = makeEquipment("meteor", 1, { damage: 90, radius: 140, delay: 1 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, aux("meteor", 2), aux("magma_trail", 3), aux("magma_trail", 4), aux("meteor", 5), aux("meteor", 6)];
    expect(setBonusState(player.equipment, "magma")).toMatchObject({ pieces: 6, bonus6: true });
    const ctx = makeContext(player, "magma", 3);
    ctx.enemies = [spawnEnemy("chaser", vec2(100, 0), 1)];
    engine.update(ctx, 0.35);
    expect(ctx.clouds.length).toBe(1);
    const c = ctx.clouds[0];
    expect(c.meteor).toBeTruthy();
    expect(c.radius).toBe(140); // 常规品质无赠量,无范围质变(烈焰统治·极 = 伤害翻倍)
    // delay (1 + 0.3 地火奔涌×0.3) × 1.15 过热地脉
    expect(c.ttl).toBeCloseTo(1.495);
    expect(c.dps).toBe(180); // 90 × 2(烈焰统治·质变)
    expect(c.meteor!.burnDps).toBe(16); // 90 × 0.09 × 2
    expect(c.meteor!.burnRadius).toBe(80);
  });
  it("熔岩足迹:在玩家位置留灼烧云,持续/范围折入", () => {
    const eq = makeEquipment("magma_trail", 1, { dps: 12, radius: 60, duration: 3 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, aux("magma_trail", 2), aux("meteor", 3), aux("meteor", 4), aux("magma_trail", 5), aux("meteor", 6)];
    const ctx = makeContext(player, "magma", 3);
    engine.update(ctx, 0.35);
    expect(ctx.clouds.length).toBe(1);
    const c = ctx.clouds[0];
    expect(c.meteor).toBeFalsy();
    expect(c.radius).toBe(60);
    expect(c.dps).toBe(24); // 12 × 2(烈焰统治·质变)
    expect(c.ttl).toBeCloseTo(4.6); // (3 + 1 地火奔涌) × 1.15
  });
});

describe("S4 亡影剧团:新效果落地(EquipmentEngine)", () => {
  /** 辅助计件卡:kill 触发不发弹,避免干扰计数 */
  const aux = (effect: EffectType, id: number): Equipment => {
    const eq = makeEquipment(effect, id);
    eq.triggers = [makeTrigger("kill", {})];
    return eq;
  };
  it("灵狼:一次召唤 2 只,移速 ×1.3;群影/亡者行军/亡影谢幕全链折入伤害", () => {
    const eq = makeEquipment("spirit_wolves", 1, { count: 2, damage: 14, duration: 12 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, aux("spirit_wolves", 2), aux("haunt_crown", 3), aux("haunt_crown", 4), aux("spirit_wolves", 5), aux("haunt_crown", 6)];
    expect(setBonusState(player.equipment, "phantom")).toMatchObject({ pieces: 6, bonus6: true });
    const ctx = makeContext(player, "phantom", 4);
    engine.update(ctx, 0.35);
    expect(ctx.minions.length).toBe(3); // 2 + 1(亡者行军·极 召唤数量翻倍的保底 +1)
    // 14 × 1.2(群影) × 1.5(亡者行军·极) × 1.25(亡影谢幕 summonMult) = 31.5 → 32
    expect(ctx.minions[0].damage).toBe(32);
    expect(ctx.minions[0].speed).toBe(273); // 210 × 1.3
    expect(ctx.minions[0].ttl).toBe(12);
  });
  it("亡灵冠冕:击杀触发在尸体位置唤出亡影(shade 标记),场上上限 4", () => {
    const eq = makeEquipment("haunt_crown", 1, { count: 1, damage: 10, duration: 8 });
    eq.triggers = [makeTrigger("kill", { chance: 1 })]; // 必触发
    player.equipment = [eq, aux("haunt_crown", 2), aux("spirit_wolves", 3), aux("spirit_wolves", 4)];
    const ctx = makeContext(player, "phantom", 4);
    const killAt = vec2(77, 55);
    for (let i = 0; i < 6; i++) {
      engine.onKill(ctx, { id: 100 + i, hp: 0, maxHp: 10, pos: killAt } as never);
    }
    const shades = ctx.minions.filter((m) => m.shade);
    expect(shades.length).toBe(4); // 上限 4,6 次击杀只唤 4
    expect(shades[0].pos.x).toBeGreaterThanOrEqual(77 - 15); // 尸体位置附近(±15 抖动)
    expect(shades[0].pos.x).toBeLessThanOrEqual(77 + 15);
    expect(shades[0].speed).toBe(210); // 亡影不加速
  });
});

describe("赛季联动词缀落地(EquipmentEngine)", () => {
  it("荆棘 S2「冰鳞棘甲」4 件套:汲取回复 ×1.15", () => {
    const eq = makeEquipment("drain", 1, { heal: 20 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, makeEquipment("shield", 2), makeEquipment("shield", 3), makeEquipment("shield", 4)];
    expect(setBonusState(player.equipment, "thorn")).toMatchObject({ pieces: 4, bonus3: true });
    const ctx = makeContext(player, "thorn", 2);
    engine.update(ctx, 0.35);
    expect(ctx.heal).toHaveBeenCalledTimes(1);
    expect(ctx.heal.mock.calls[0][0]).toBeCloseTo(23); // 20 × 1.15
  });
  it("2 件套不触发词缀(仅 4 件套激活)", () => {
    const eq = makeEquipment("drain", 1, { heal: 20 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, makeEquipment("shield", 2)];
    const ctx = makeContext(player, "thorn", 2);
    engine.update(ctx, 0.35);
    expect(ctx.heal.mock.calls[0][0]).toBeCloseTo(20);
  });
  it("余烬 S1「余烬滋养」4 件套:毒云持续 (4+1)×1.15", () => {
    const eq = makeEquipment("cloud", 1, { dps: 10, radius: 100, duration: 4 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, makeEquipment("nova", 2), makeEquipment("nova", 3), makeEquipment("chain", 4)];
    const ctx = makeContext(player, "ember", 1);
    ctx.enemies = [spawnEnemy("chaser", vec2(100, 100), 1)];
    engine.update(ctx, 0.35);
    expect(ctx.clouds.length).toBe(1);
    // 2 件套「余烬扩散」+1 秒基础 + 赛季词缀 ×1.15
    expect(ctx.clouds[0].ttl).toBeCloseTo(5.75);
  });
  it("弹幕 S1「过载装填」4 件套:间隔 0.92 + 齐射 0.08 → 0.9 秒内触发(无词缀则不触发)", () => {
    const mk = (): BattleContext & { fx: Fx[]; heal: ReturnType<typeof vi.fn> } => {
      const eq = makeEquipment("knife", 1, { damage: 18, spread: 1 });
      player.equipment = [eq];
      // 其余 3 件只作计件,不给脉冲(避免同时开火干扰计数)
      for (let i = 2; i <= 4; i++) {
        const aux = makeEquipment(i % 2 === 0 ? "ray" : "knife", i);
        aux.triggers = [makeTrigger("kill", {})];
        player.equipment.push(aux);
      }
      return makeContext(player, "barrage", 1);
    };
    const withMut = mk();
    withMut.enemies = [spawnEnemy("chaser", vec2(50, 50), 1)];
    engine.update(withMut, 0.9); // 1.0 × (1-0.08-0.08) = 0.84 → 已触发
    expect(withMut.projectiles.length).toBe(2); // spread 1 + 齐射 1
    const withoutMut = mk();
    withoutMut.seasonMutation = null;
    withoutMut.enemies = [spawnEnemy("chaser", vec2(50, 50), 1)];
    engine.update(withoutMut, 0.9); // 1.0 × (1-0.08) = 0.92 → 未触发
    expect(withoutMut.projectiles.length).toBe(0);
  });
});

/* ---------- 商店修饰器倾向 ---------- */

describe("套组卡池与修饰器倾向(generateSetEquipment modBias)", () => {
  it("修饰器层已升格为全局被动法宝(docs/DESIGN-HERO-RHYTHM.md §4.2):本套卡不再自带修饰器,倾向参数不产生修饰器", () => {
    for (let i = 0; i < 60; i++) {
      const eq = generateSetEquipment("thorn", 5, 0, "explode");
      expect(eq.modifiers).toHaveLength(0);
    }
  });
  it("本套卡的效果仍来自本套定义,触发器落在该效果的共鸣节律上", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const eq = generateSetEquipment("ember", 5);
      seen.add(eq.effect.def.type);
      expect(setDef("ember").effects.includes(eq.effect.def.type)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

/* ---------- 环境词缀加权 ---------- */

describe("环境词缀赛季倾向(rollEnvAffixes bias)", () => {
  it("无 bias 时行为不变(1-3 个、不重复、类型合法)", () => {
    for (let i = 0; i < 40; i++) {
      const out = rollEnvAffixes();
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.length).toBeLessThanOrEqual(3);
      expect(new Set(out).size).toBe(out.length);
      for (const t of out) expect(ENV_AFFIXES.some((a) => a.type === t)).toBe(true);
    }
  });
  it("权重 2 的类型出现频率显著高于权重 1 的类型(统计断言)", () => {
    const bias: Partial<Record<EnvAffixType, number>> = { mist: 8, death_chain: 1 };
    let mist = 0;
    let death = 0;
    for (let i = 0; i < 300; i++) {
      const out = rollEnvAffixes(bias);
      if (out.includes("mist")) mist += 1;
      if (out.includes("death_chain")) death += 1;
    }
    expect(mist).toBeGreaterThan(death * 2);
  });
});

/* ---------- S1 行为冻结 ---------- */

describe("S1 行为冻结(回归红线)", () => {
  it("常驻三套定义不变;全套组库 = 4 季 × 3 套 = 12", () => {
    expect(SETS).toHaveLength(3);
    expect(allSets()).toHaveLength(12);
  });
  it("发布门控:S1 只放开常驻三套,S4 起 12 套全部可选且永久保留", () => {
    expect(releasedSets(1)).toHaveLength(3);
    expect(releasedSets(2)).toHaveLength(6);
    expect(releasedSets(3)).toHaveLength(9);
    expect(releasedSets(4)).toHaveLength(12);
    expect(releasedSets(9)).toHaveLength(12);
  });
  it("seasonId=1 的词缀与设计文档逐字一致", () => {
    expect(setMutation(1, "thorn")!.name).toBe("棘刺过载");
    expect(setMutation(1, "barrage")!.name).toBe("过载装填");
    expect(setMutation(1, "ember")!.name).toBe("余烬滋养");
  });
});
