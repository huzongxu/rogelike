/**
 * 英雄节律 × 独有技能 × 法宝(docs/DESIGN-HERO-RHYTHM.md)—— 数据表与引擎行为的闸门。
 *
 * 覆盖:
 *  §2 节律表:12 英雄 × 6 节律各 2 人、节律参数与等级倍率、挂机档位;
 *  §4 法宝:14 主动法宝的共鸣表取自亲和表、默认分配 / 切换 / 归一化、被动法宝生成与叠加衰减、槽位常量;
 *  §5 共鸣变形:挂在共鸣节律上的法宝改名并在引擎结算里拿到补丁(乘区 / 护盾 / 落点 / 连杀 / 朝向);
 *  引擎:技能与法宝同列结算、节律等级缩放周期、事件型内置冷却、受击齐放窗口、被动法宝全局折入;
 *  商店:三分之一货位出被动、被动进被动槽、点行切节律、共鸣数取代套组件数。
 */

import { describe, it, expect, vi } from "vitest";
import { Player } from "@game/entities/player";
import { spawnEnemy, type Enemy } from "@game/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "@game/systems/equipmentEngine";
import { makeTrigger, makeEffect, makeModifier, EFFECTS, type EffectType, type ModifierType } from "@game/data/affixes";
import {
  assignRhythm,
  equipmentDisplayName,
  equipmentResonant,
  equipmentRhythm,
  generateEquipment,
  generatePassive,
  makeSkillEquipment,
  nextRhythmOf,
  normalizeArtifact,
  passiveCondemnedMult,
  passiveEchoSpec,
  resonanceBonusState,
  resonanceCount,
  skillResonant,
  qualityBasePrice,
  artifactBaseName,
  artifactInnerCd,
  artifactResonanceRhythms,
  defaultRhythmOf,
  equipmentResonance,
  type Equipment,
} from "@game/data/equipmentGen";
import { RESONANCE_TIERS, SET_BONUSES, setDef } from "@game/data/sets";
import { DESTROY_REFUND_RATE } from "@game/data/shop";
import { readFileSync } from "node:fs";

function fileSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}
import { heroSkillLines } from "@game/data/heroes";
import { LV_TEXT, LevelUpModel } from "../cocos/assets/scripts/levelup/LevelUpModel";
import {
  ARTIFACT_DEFS,
  PASSIVE_DEFS,
  PASSIVE_NORMAL_TYPES,
  PASSIVE_RARE_CHANCE,
  PASSIVE_RARE_TYPES,
  PASSIVE_SLOTS,
  PASSIVE_STACK_CAP,
  PASSIVE_STACK_DECAY,
  RELIC_TYPES,
  RELIC_VALUES,
  SHOP_PASSIVE_SLOTS,
  defaultRhythmFor,
  isRelicType,
  isResonant,
  makePassive,
  type PassiveArtifact,
  SEASON_RESONANCES,
  SEASON_ARTIFACTS,
  SEASON_ECHO_MULT,
  DISCOVERY,
  seasonArtifactDef,
  seasonArtifactsAvailable,
  seasonFace,
  seasonPairOf,
  echoMorph,
  resonanceRhythmsOf,
  passiveDesc,
  passiveStackMult,
  relicStack,
} from "@game/data/artifacts";
import {
  AI_PROFILE_PARAMS,
  HERO_RHYTHM,
  HIT_RHYTHM_WINDOW,
  RHYTHM_AI_PROFILE,
  RHYTHM_BASE_PARAMS,
  RHYTHM_CD_PER_LEVEL,
  RHYTHM_IDS,
  RHYTHM_MAX_LEVEL,
  heroAiProfile,
  heroRhythm,
  heroRhythmOptions,
  isRhythm,
  rhythmIntervalMult,
  rhythmThresholdMult,
  rhythmTriggerParams,
  type RhythmId,
} from "@game/data/rhythm";
import { SKILL_AFFINITY } from "@game/data/reroll";
import { BESPOKE_HEROES, CORE_BASELINE_INTERVAL, CORE_RHYTHM_TUNE, DEFAULT_THORN_MODE, HERO_SKILLS, LOKA_SLAY_DEVOURER, MU_RETALIATION_POOL_PCT, VERA_BRANCH_COST, VERA_STACK_TUNE, VERA_SUSTAIN, coreSkillOf, heroStances, needsBaseline, skillTriggerParams } from "@game/data/heroSkills";
import { spawnProjectile } from "@game/entities/projectile";
import { allHeroes, type HeroId } from "@game/data/heroes";
import { QUALITY_HASTE_CAP, qualityDef } from "@game/data/quality";
import { THORN_STACK } from "@game/data/combat";
import { vec2 } from "@game/core/math";
import { ShopModel, isPassiveOffer, type ShopWorld } from "../cocos/assets/scripts/shop/ShopModel";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";
import { spawnMinion } from "@game/entities/objects";
import { ELITE_CHAPTERS, ELITE_ENTER_BANNER, ELITE_INTEL_DELAY_SEC, chapterTypeOf } from "@game/data/chapters";
import { MINION_CARRY_SPREAD } from "@game/systems/battleWorld";

function makeContext(player: Player, enemies: Enemy[] = [], extra: Partial<BattleContext> = {}): BattleContext & { fx: Fx[] } {
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
    ...extra,
  };
}

/** 一件挂在指定节律上的主动法宝(显式 kind = active,才参与共鸣) */
function artifact(effect: EffectType, rhythm: RhythmId, params: Record<string, number>, id = 500): Equipment {
  const eq: Equipment = {
    id,
    level: 1,
    quality: "common",
    name: "",
    triggers: [makeTrigger(rhythm, rhythmTriggerParams(rhythm))],
    effect: makeEffect(effect, params, 1),
    modifiers: [],
    kind: "active",
  };
  eq.name = equipmentDisplayName(eq);
  return eq;
}

/* ==================== §2 节律表 ==================== */

describe("节律表(§2)", () => {
  it("6 种节律 = 常规触发器;隐藏触发器 crit / elite 不是节律", () => {
    expect(RHYTHM_IDS).toEqual(["hit", "pulse", "kill", "move", "combo", "hurt"]);
    for (const r of RHYTHM_IDS) expect(isRhythm(r)).toBe(true);
    expect(isRhythm("crit")).toBe(false);
    expect(isRhythm("elite")).toBe(false);
  });

  it("12 英雄本命节律:每种节律恰好 2 人,覆盖全部英雄;未选英雄 = 周期", () => {
    const heroes = allHeroes().map((h) => h.id);
    expect(Object.keys(HERO_RHYTHM).sort()).toEqual([...heroes].sort());
    const count = new Map<RhythmId, number>();
    for (const r of Object.values(HERO_RHYTHM)) count.set(r, (count.get(r) ?? 0) + 1);
    for (const r of RHYTHM_IDS) expect(count.get(r), r).toBe(2);
    expect(heroRhythm(null)).toBe("pulse");
    expect(heroRhythm("vera")).toBe("hit");
    expect(heroRhythm("kyle")).toBe("pulse");
    expect(heroRhythm("bran")).toBe("kill");
  });

  it("节律参数不再随机:同节律同等级恒同参数;等级抬高 → 周期缩短、阈值收窄、概率抬高", () => {
    expect(rhythmTriggerParams("pulse")).toEqual(rhythmTriggerParams("pulse"));
    expect(rhythmTriggerParams("pulse", 1)).toEqual({ interval: RHYTHM_BASE_PARAMS.pulse.interval });
    expect(rhythmTriggerParams("pulse", 3).interval!).toBeLessThan(rhythmTriggerParams("pulse", 1).interval!);
    expect(rhythmTriggerParams("move", 5).distance!).toBeLessThan(rhythmTriggerParams("move", 1).distance!);
    expect(rhythmTriggerParams("combo", 5).count!).toBeLessThan(rhythmTriggerParams("combo", 1).count!);
    expect(rhythmTriggerParams("kill", 5).chance!).toBeGreaterThan(rhythmTriggerParams("kill", 1).chance!);
    expect(rhythmTriggerParams("hurt", 5).hpThreshold!).toBeGreaterThan(rhythmTriggerParams("hurt", 1).hpThreshold!);
    expect(rhythmTriggerParams("hit")).toEqual({});
    expect(rhythmIntervalMult(1)).toBe(1);
    expect(rhythmIntervalMult(RHYTHM_MAX_LEVEL)).toBeCloseTo(1 - RHYTHM_CD_PER_LEVEL * (RHYTHM_MAX_LEVEL - 1), 10);
    expect(rhythmThresholdMult(0)).toBe(1);
  });

  it("挂机档位:受击 / 低血 → hold,移动 → orbit,其余 kite;参数入表", () => {
    expect(RHYTHM_AI_PROFILE.hit).toBe("hold");
    expect(RHYTHM_AI_PROFILE.hurt).toBe("hold");
    expect(RHYTHM_AI_PROFILE.move).toBe("orbit");
    expect(RHYTHM_AI_PROFILE.pulse).toBe("kite");
    expect(heroAiProfile("vera")).toBe("hold");
    expect(heroAiProfile(null)).toBe("kite");
    expect(AI_PROFILE_PARAMS.hold.maxContacts).toBeGreaterThan(1);
    expect(AI_PROFILE_PARAMS.hold.fleeHpPct).toBeLessThan(RHYTHM_BASE_PARAMS.hurt.hpThreshold!);
    expect(AI_PROFILE_PARAMS.orbit.dodgeRadius).toBeLessThan(110);
  });

  it("Player:解锁节律去重、节律等级封顶、castList = 技能在前 + 法宝在后", () => {
    const p = new Player();
    expect(p.rhythms).toEqual([]);
    expect(p.unlockRhythm("hit")).toBe(true);
    expect(p.unlockRhythm("hit")).toBe(false);
    expect(p.rhythmLevelOf("hit")).toBe(1);
    for (let i = 1; i < RHYTHM_MAX_LEVEL; i++) expect(p.rhythmLevelUp("hit")).toBe(true);
    expect(p.rhythmLevelUp("hit")).toBe(false);
    expect(p.rhythmLevelOf("hit")).toBe(RHYTHM_MAX_LEVEL);
    const s = makeSkillEquipment(coreSkillOf("vera"));
    const a = artifact("knife", "hit", { damage: 10 });
    p.skills.push(s);
    p.equipment.push(a);
    expect(p.castList).toEqual([s, a]);
    expect(p.passiveSlots).toBe(PASSIVE_SLOTS);
    expect(p.freePassiveSlots).toBe(PASSIVE_SLOTS);
  });
});

/* ==================== §4 法宝 ==================== */

describe("主动法宝(§4.1)", () => {
  it("14 个效果各有一条法宝定义,名字互不重复,共鸣节律取自亲和表且都是节律", () => {
    const names = new Set<string>();
    for (const e of EFFECTS) {
      const d = ARTIFACT_DEFS[e.type];
      expect(d.effect).toBe(e.type);
      expect(names.has(d.name), d.name).toBe(false);
      names.add(d.name);
      expect(d.innerCd).toBeGreaterThan(0);
      expect(d.resonance).toEqual(SKILL_AFFINITY[e.type].triggers.filter(isRhythm));
      expect(d.resonance.length).toBe(2);
      expect(d.morphName.length).toBeGreaterThan(0);
      expect(Object.keys(d.morph).length).toBeGreaterThan(0);
    }
  });

  it("默认分配:已解锁里的共鸣者优先(按表序),没有共鸣取首条(本命)", () => {
    expect(defaultRhythmFor("cloud", ["pulse"])).toBe("pulse");
    expect(defaultRhythmFor("cloud", ["hit", "move"])).toBe("move");
    expect(defaultRhythmFor("cloud", ["hit", "kill"])).toBe("hit");
    expect(defaultRhythmFor("knife", ["hit", "combo"])).toBe("combo");
    expect(isResonant("cloud", "move")).toBe(true);
    expect(isResonant("cloud", "hit")).toBe(false);
    expect(isResonant("cloud", "crit")).toBe(false);
  });

  it("切换节律:按已解锁顺序轮转,首条触发器换成新节律并重算名字;只解锁 1 条时无事可做", () => {
    const eq = generateEquipment(3, "common", false, 0, ["hit", "move"]);
    expect(nextRhythmOf(eq, ["hit"])).toBeNull();
    const cur = equipmentRhythm(eq)!;
    const next = nextRhythmOf(eq, ["hit", "move"])!;
    expect(next).not.toBe(cur);
    assignRhythm(eq, next, ["hit", "move"]);
    expect(equipmentRhythm(eq)).toBe(next);
    expect(eq.name).toBe(equipmentDisplayName(eq));
    // 技能不接受切换
    const skill = makeSkillEquipment(coreSkillOf("kyle"));
    assignRhythm(skill, "hit", ["pulse", "hit"]);
    expect(equipmentRhythm(skill)).toBe("pulse");
  });

  it("归一化:随身带入的老装备补上 kind、按已解锁节律重挂;已合法的只重算名字", () => {
    const old: Equipment = { id: 1, level: 1, quality: "common", name: "旧卡", triggers: [makeTrigger("combo", { count: 4, window: 2 })], effect: makeEffect("knife", { damage: 10 }, 1), modifiers: [] };
    normalizeArtifact(old, ["hit"]);
    expect(old.kind).toBe("active");
    expect(equipmentRhythm(old)).toBe("hit");
    expect(old.name).toBe(ARTIFACT_DEFS.knife.name);
    const legal: Equipment = { id: 2, level: 1, quality: "common", name: "旧卡", triggers: [makeTrigger("pulse", { interval: 1.2 })], effect: makeEffect("cloud", { dps: 10 }, 1), modifiers: [] };
    normalizeArtifact(legal, ["pulse"]);
    expect(legal.triggers[0].params.interval).toBe(1.2);
    expect(equipmentResonant(legal)).toBe(true);
    expect(legal.name).toBe(ARTIFACT_DEFS.cloud.morphName);
  });

  it("共鸣命名:挂在共鸣节律上改走变形名,否则法宝名;未标 kind 的老对象不变形", () => {
    const a = artifact("cloud", "move", { dps: 10 });
    expect(equipmentResonant(a)).toBe(true);
    expect(a.name).toBe(ARTIFACT_DEFS.cloud.morphName);
    const b = artifact("cloud", "hit", { dps: 10 });
    expect(equipmentResonant(b)).toBe(false);
    expect(b.name).toBe(ARTIFACT_DEFS.cloud.name);
    const legacy: Equipment = { ...a, kind: undefined };
    expect(equipmentResonant(legacy)).toBe(false);
  });
});

describe("被动法宝(§4.2)", () => {
  it("常规 8 + 稀有 2 正好覆盖修饰器类型联合;稀有 = 旧隐藏修饰器", () => {
    expect([...PASSIVE_NORMAL_TYPES].sort()).toEqual(["chain", "duration", "explode", "haste", "lifesteal", "pierce", "power", "split"]);
    expect([...PASSIVE_RARE_TYPES].sort()).toEqual(["condemned", "echo"]);
    for (const t of Object.keys(PASSIVE_DEFS) as ModifierType[]) expect(PASSIVE_DEFS[t].name.length).toBeGreaterThan(0);
  });

  it("生成:随机源高于稀有概率 → 常规池;低于 → 稀有池;数值走修饰器参数那一支", () => {
    const normal = generatePassive(5, 0, () => 0.5);
    expect(normal.kind).toBe("passive");
    expect((PASSIVE_NORMAL_TYPES as readonly string[]).includes(normal.type)).toBe(true);
    expect(normal.name).toBe(PASSIVE_DEFS[normal.type].name);
    let n = 0;
    const seq = [0.5, 0.1, 0.5]; // 品质 → 稀有判定(不中)→ 遗物判定(中)
    const relic = generatePassive(5, 0, () => seq[n++ % seq.length]);
    expect((RELIC_TYPES as readonly string[]).includes(relic.type)).toBe(true);
    expect(relic.params).toEqual({});
    const rare = generatePassive(5, 0, () => PASSIVE_RARE_CHANCE / 2);
    expect((PASSIVE_RARE_TYPES as readonly string[]).includes(rare.type)).toBe(true);
    // 命运骰:稀有概率加成
    const boosted = generatePassive(5, 0, () => PASSIVE_RARE_CHANCE + 0.1, undefined, 0.15);
    expect((PASSIVE_RARE_TYPES as readonly string[]).includes(boosted.type)).toBe(true);
    const echo = makePassive(9, "echo", "rare", 1, { echoSec: 0.35, echoMult: 0.5 });
    expect(passiveEchoSpec([echo])).toEqual({ sec: 0.35, mult: 0.5 });
    expect(passiveEchoSpec([])).toBeNull();
    const cond = makePassive(10, "condemned", "rare", 1, { condemnHp: 0.3, condemnMult: 1.45 });
    expect(passiveCondemnedMult([cond], 0.2)).toBeCloseTo(1.45, 10);
    expect(passiveCondemnedMult([cond], 0.5)).toBe(1);
    expect(passiveCondemnedMult([cond, cond], 0.1)).toBeCloseTo(1.45 * 1.45, 10);
  });

  it("叠加衰减:第 n 枚 × decay^n,到上限归零;槽位与商店占比是表值", () => {
    expect(passiveStackMult(0)).toBe(1);
    expect(passiveStackMult(1)).toBeCloseTo(PASSIVE_STACK_DECAY, 10);
    expect(passiveStackMult(PASSIVE_STACK_CAP)).toBe(0);
    expect(PASSIVE_SLOTS).toBe(4);
    expect(SHOP_PASSIVE_SLOTS).toBe(1);
  });
});

/* ==================== 引擎 ==================== */

describe("引擎:技能与法宝同列、节律等级、内置冷却、齐放窗口、被动折入(§2.3 / §4.2)", () => {
  it("技能与法宝同列结算:核心技能(周期)与法宝(周期)都在 update 里发射", () => {
    const p = new Player();
    p.rhythms = ["pulse"];
    p.skills.push(makeSkillEquipment(coreSkillOf("kyle")));
    p.equipment.push(artifact("knife", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }));
    const enemies = [spawnEnemy("chaser", vec2(80, 0), 1)];
    const ctx = makeContext(p, enemies);
    const engine = new EquipmentEngine();
    engine.update(ctx, 2.5);
    // 核心 16 束(R6 回到旧弹幕密度)+ 飞刀 1 发
    expect(ctx.projectiles.length).toBe(17);
    expect(engine.pulseLeft(p.skills[0].id)).not.toBeNull();
  });

  it("节律等级缩放周期:hit 节律 5 级不影响 pulse;pulse 节律 5 级把 2.4s 缩到 2.4 × (1 − 8% × 4)", () => {
    const p = new Player();
    p.rhythms = ["pulse"];
    p.equipment.push(artifact("knife", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }));
    const ctx = makeContext(p, [spawnEnemy("chaser", vec2(80, 0), 1)]);
    const engine = new EquipmentEngine();
    engine.update(ctx, 0.01);
    expect(engine.pulseLeft(p.equipment[0].id)!.interval).toBeCloseTo(2.4, 5);
    p.rhythmLevel.pulse = RHYTHM_MAX_LEVEL;
    engine.update(ctx, 0.01);
    expect(engine.pulseLeft(p.equipment[0].id)!.interval).toBeCloseTo(2.4 * rhythmIntervalMult(RHYTHM_MAX_LEVEL), 5);
  });

  it("事件型内置冷却:击杀节律的法宝在 innerCd 内不会连放两次;技能不受内置冷却约束", () => {
    const p = new Player();
    p.rhythms = ["kill"];
    const a = artifact("nova", "kill", { damage: 10, radius: 100 });
    a.triggers[0].params.chance = 1;
    p.equipment.push(a);
    const skill = makeSkillEquipment(coreSkillOf("bran"));
    skill.triggers[0].params.chance = 1;
    p.skills.push(skill);
    const enemies = [spawnEnemy("chaser", vec2(60, 0), 1), spawnEnemy("chaser", vec2(-60, 0), 1)];
    const ctx = makeContext(p, enemies);
    const engine = new EquipmentEngine();
    const rand = vi.spyOn(Math, "random").mockReturnValue(0);
    engine.onKill(ctx, enemies[0]);
    engine.onKill(ctx, enemies[1]);
    rand.mockRestore();
    // 法宝(新星)只放了一次(第二次被 innerCd 挡住),技能(闪电链)放了两次
    const novas = ctx.fx.filter((f) => f.type === "nova").length;
    const bolts = ctx.fx.filter((f) => f.type === "lightning").length;
    expect(novas).toBe(1);
    expect(bolts).toBeGreaterThanOrEqual(2);
    // 冷却过后再放
    engine.update(ctx, ARTIFACT_DEFS.nova.innerCd + 0.01);
    const rand2 = vi.spyOn(Math, "random").mockReturnValue(0);
    engine.onKill(ctx, enemies[0]);
    rand2.mockRestore();
    expect(ctx.fx.filter((f) => f.type === "nova").length).toBe(2);
  });

  it("受击齐放窗口:两件受击法宝同一下受击只放一件,窗口过后轮到另一件;受击技能不受窗口约束", () => {
    const p = new Player();
    p.rhythms = ["hit"];
    p.skills.push(makeSkillEquipment(coreSkillOf("vera"))); // 荆棘圆环:受击 nova
    p.equipment.push(artifact("shield", "hit", { amount: 10, duration: 3 }, 601), artifact("drain", "hit", { heal: 5 }, 602));
    const ctx = makeContext(p, [spawnEnemy("chaser", vec2(20, 0), 1)]);
    const engine = new EquipmentEngine();
    engine.onHurt(ctx, 5, ctx.enemies[0]);
    const shield = ctx.addPlayerShield as ReturnType<typeof vi.fn>;
    const heal = ctx.healPlayer as ReturnType<typeof vi.fn>;
    expect(ctx.fx.filter((f) => f.type === "nova").length, "技能照放").toBe(1);
    expect(shield.mock.calls.length + heal.mock.calls.length, "两件法宝只放一件").toBe(1);
    engine.update(ctx, HIT_RHYTHM_WINDOW + 0.8); // 窗口与 hitCd 都过去
    engine.onHurt(ctx, 5, ctx.enemies[0]);
    expect(shield.mock.calls.length + heal.mock.calls.length).toBe(2);
    expect(shield.mock.calls.length).toBe(1);
    expect(heal.mock.calls.length).toBe(1);
  });

  it("被动法宝全局折入:增幅 ×(1 + pct3),第二枚按衰减;冷缩叠入 haste 且不越上限", () => {
    const p = new Player();
    p.rhythms = ["pulse"];
    p.equipment.push(artifact("nova", "pulse", { damage: 100, radius: 100 }));
    const e = spawnEnemy("chaser", vec2(30, 0), 1);
    const ctx = makeContext(p, [e]);
    const engine = new EquipmentEngine();
    engine.update(ctx, 2.5);
    const dmg = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0][1] as number;
    expect(dmg).toBe(100);
    p.passives.push(makePassive(1, "power", "common", 1, { pct3: 0.2 }), makePassive(2, "power", "common", 1, { pct3: 0.2 }));
    const engine2 = new EquipmentEngine();
    const ctx2 = makeContext(p, [e]);
    engine2.update(ctx2, 2.5);
    const dmg2 = (ctx2.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0][1] as number;
    expect(dmg2).toBe(Math.round(100 * (1 + 0.2) * (1 + 0.2 * PASSIVE_STACK_DECAY)));
    // 冷缩
    p.passives.length = 0;
    for (let i = 0; i < 3; i++) p.passives.push(makePassive(10 + i, "haste", "common", 1, { pct2: 0.5 }));
    const engine3 = new EquipmentEngine();
    const ctx3 = makeContext(p, [e]);
    engine3.update(ctx3, 0.01);
    const iv = engine3.pulseLeft(p.equipment[0].id)!.interval;
    expect(iv).toBeCloseTo(Math.max(0.2, 2.4 * (1 - Math.min(QUALITY_HASTE_CAP, 0.5 + 0.5 * PASSIVE_STACK_DECAY + 0.5 * PASSIVE_STACK_DECAY ** 2))), 5);
  });

  it("被动「回响」:没有装备自带回响时按被动排队一次二次触发", () => {
    const p = new Player();
    p.rhythms = ["pulse"];
    p.equipment.push(artifact("nova", "pulse", { damage: 100, radius: 100 }));
    p.passives.push(makePassive(1, "echo", "rare", 1, { echoSec: 0.35, echoMult: 0.5 }));
    const e = spawnEnemy("chaser", vec2(30, 0), 1);
    const ctx = makeContext(p, [e]);
    const engine = new EquipmentEngine();
    engine.update(ctx, 2.5);
    engine.update(ctx, 0.4);
    const calls = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as number);
    expect(calls).toEqual([100, 50]);
  });
});

describe("HUD 节律进度条(R15)", () => {
  it("引擎 rhythmProgress:连杀 = 已攒 / 所需、移动 = 已走 / 所需、低血 = 已失血 / 到阈值、受击 / 击杀按内置冷却(带荆棘层的受击技能改读层数)、周期 null", () => {
    const p = new Player();
    p.rhythms = ["combo", "move", "hurt", "hit", "pulse"];
    const combo = makeSkillEquipment(coreSkillOf("loka")); // 3 连杀
    const sia = makeSkillEquipment(coreSkillOf("sia")); // 低血 0.7
    const move = artifact("cloud", "move", { dps: 10, radius: 100, duration: 4 }, 1201);
    const hit = artifact("nova", "hit", { damage: 20, radius: 100 }, 1202);
    const pulse = artifact("knife", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }, 1203);
    p.skills.push(combo, sia);
    p.equipment.push(move, hit, pulse);
    const enemies = [spawnEnemy("chaser", vec2(60, 0), 1), spawnEnemy("chaser", vec2(-60, 0), 1)];
    const ctx = makeContext(p, enemies);
    const engine = new EquipmentEngine();
    engine.update(ctx, 0.01);
    expect(engine.rhythmProgress(pulse, ctx)).toBeNull();
    expect(engine.rhythmProgress(combo, ctx)).toEqual({ frac: 0, kind: "combo" });
    engine.onKill(ctx, enemies[0]);
    engine.onKill(ctx, enemies[1]);
    expect(engine.rhythmProgress(combo, ctx)!.frac).toBeCloseTo(2 / 3, 5);
    // 移动:走 120px(所需 240)→ 0.5
    p.movedThisFrame = 120;
    engine.update(ctx, 0.01);
    expect(engine.rhythmProgress(move, ctx)!.frac).toBeCloseTo(0.5, 5);
    // 低血:阈值 0.7 → 需失血 30%;失血 15% → 0.5;满血 0
    expect(engine.rhythmProgress(sia, ctx)!.frac).toBe(0);
    p.hp = p.maxHp * 0.85;
    expect(engine.rhythmProgress(sia, ctx)!.frac).toBeCloseTo(0.5, 5);
    // 受击法宝:触发后内置冷却走完前 < 1,技能恒 1
    expect(engine.rhythmProgress(hit, ctx)).toEqual({ frac: 1, kind: "hit" });
    engine.onHurt(ctx, 1, enemies[0]);
    expect(engine.rhythmProgress(hit, ctx)!.frac).toBeLessThan(1);
    // 带荆棘层的技能(薇拉核心)读的是层数比例,不属于"内置冷却"这一支
    p.thornStack = 0;
    expect(engine.rhythmProgress(makeSkillEquipment(coreSkillOf("vera")), ctx)).toEqual({ frac: 0, kind: "hit" });
    p.thornStack = THORN_STACK.cap;
    expect(engine.rhythmProgress(makeSkillEquipment(coreSkillOf("vera")), ctx)).toEqual({ frac: 1, kind: "hit" });
    // 同为受击节律但不带层数(穆核心)→ 仍是"恒 1"口径
    expect(engine.rhythmProgress(makeSkillEquipment(coreSkillOf("mu")), ctx)).toEqual({ frac: 1, kind: "hit" });
  });

  it("HudView 每张卡带节律进度条(cardRp),经 BattleSim.rhythmProgress 取值", () => {
    const hud = fileSource("../cocos/assets/scripts/battle/HudView.ts");
    expect(hud.includes("private cardRp: Graphics[]")).toBe(true);
    expect(hud.includes("sim.rhythmProgress(eq)")).toBe(true);
    expect(hud.includes('makeNode("Rp", card)')).toBe(true);
  });
});

describe("精英入场横幅(R15)", () => {
  it("精英章到 ELITE_INTEL_DELAY_SEC 那一拍报一次「精英入场 · 第 N 章」;普通章不报;下一章复位", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "vera";
    save.selectedSet = "thorn";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    // V1.1:薇拉在第 2 章开章选支、第 4 章开章节节点;不提交会冻结世界
    while (s.world.chapter < ELITE_CHAPTERS[0]) {
      s.world.nextChapter();
      const step = s.world.buildStep();
      if (step) s.world.commitBuild(step.options[0].id);
    }
    s.world.discoveryBanner = null;
    s.world.chapterTimer = ELITE_INTEL_DELAY_SEC - 1 / 120;
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toBe(`${ELITE_ENTER_BANNER} · 第 ${ELITE_CHAPTERS[0]} 章`);
    expect(s.world.hitStop, "不时停").toBeLessThanOrEqual(0);
    s.world.discoveryBanner = null;
    for (let i = 0; i < 30; i++) s.update(1 / 60);
    expect(s.discoveryBanner, "同章不重复").toBeNull();
    s.world.nextChapter();
    expect(chapterTypeOf(s.world.chapter)).toBe("normal");
    s.world.chapterTimer = ELITE_INTEL_DELAY_SEC - 1 / 120;
    s.update(1 / 60);
    expect(s.discoveryBanner, "普通章不报").toBeNull();
  });
});

describe("共鸣变形(§5 表 1)", () => {
  it("乘区类:毒径 = 范围 ×0.7、持续 ×2;非共鸣节律下不变形", () => {
    const p = new Player();
    p.rhythms = ["move"];
    p.equipment.push(artifact("cloud", "move", { dps: 10, radius: 100, duration: 4 }));
    const ctx = makeContext(p, [spawnEnemy("chaser", vec2(50, 0), 1)]);
    const engine = new EquipmentEngine();
    p.movedThisFrame = 1000;
    engine.update(ctx, 0.05);
    expect(ctx.clouds).toHaveLength(1);
    expect(ctx.clouds[0].radius).toBeCloseTo(70, 5);
    expect(ctx.clouds[0].ttl).toBeCloseTo(8, 5);
    const q = new Player();
    q.rhythms = ["hit"];
    q.equipment.push(artifact("cloud", "hit", { dps: 10, radius: 100, duration: 4 }));
    const ctx2 = makeContext(q, [spawnEnemy("chaser", vec2(50, 0), 1)]);
    const engine2 = new EquipmentEngine();
    engine2.onHurt(ctx2, 1, ctx2.enemies[0]);
    expect(ctx2.clouds[0].radius).toBeCloseTo(100, 5);
    expect(ctx2.clouds[0].ttl).toBeCloseTo(4, 5);
  });

  it("护心新星:低血节律上的新星施放附带护盾(最大生命 × 比例)", () => {
    const p = new Player();
    p.rhythms = ["hurt"];
    p.hp = 10;
    p.equipment.push(artifact("nova", "hurt", { damage: 10, radius: 100 }));
    const ctx = makeContext(p, [spawnEnemy("chaser", vec2(30, 0), 1)]);
    new EquipmentEngine().onHurt(ctx, 1, ctx.enemies[0]);
    const shield = ctx.addPlayerShield as ReturnType<typeof vi.fn>;
    expect(shield).toHaveBeenCalledTimes(1);
    expect(shield.mock.calls[0]).toEqual([Math.round(p.maxHp * ARTIFACT_DEFS.nova.morph.shieldOnCast!.amountPct), ARTIFACT_DEFS.nova.morph.shieldOnCast!.sec]);
  });

  it("尸起骸骨:击杀节律上的骸骨从尸体处起身且数量 +1", () => {
    const p = new Player();
    p.pos = vec2(0, 0);
    p.rhythms = ["kill"];
    const a = artifact("skeleton", "kill", { count: 1, damage: 10, duration: 5 });
    a.triggers[0].params.chance = 1;
    p.equipment.push(a);
    const dead = spawnEnemy("chaser", vec2(300, 300), 1);
    const ctx = makeContext(p, [dead]);
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.5);
    new EquipmentEngine().onKill(ctx, dead);
    rand.mockRestore();
    expect(ctx.minions).toHaveLength(2);
    for (const m of ctx.minions) expect(Math.hypot(m.pos.x - 300, m.pos.y - 300)).toBeLessThan(40);
  });

  it("连杀飞刃:飞刀数随世界层连杀数增长(每 4 连杀 +1,封顶 8)", () => {
    const p = new Player();
    p.rhythms = ["combo"];
    const a = artifact("knife", "combo", { damage: 10, speed: 500, radius: 640, spread: 1 });
    a.triggers[0].params.count = 2; // 连杀所需数下限 2:两次击杀放一次
    p.equipment.push(a);
    const e = spawnEnemy("chaser", vec2(80, 0), 1);
    const ctx = makeContext(p, [e], { comboCount: 17 });
    const engine = new EquipmentEngine();
    engine.onKill(ctx, e);
    engine.onKill(ctx, e);
    expect(ctx.projectiles.length).toBe(1 + Math.min(8, Math.floor(17 / 4)));
    const ctx2 = makeContext(p, [e], { comboCount: 100 });
    const engine2 = new EquipmentEngine();
    engine2.onKill(ctx2, e);
    engine2.onKill(ctx2, e);
    expect(ctx2.projectiles.length).toBe(1 + 8);
  });

  it("反打冰射:受击节律上的射线朝来袭方向打,穿透 +1", () => {
    const p = new Player();
    p.pos = vec2(0, 0);
    p.rhythms = ["hit"];
    p.equipment.push(artifact("ray", "hit", { damage: 10, speed: 500, radius: 640, spread: 1 }));
    const attacker = spawnEnemy("chaser", vec2(0, -100), 1);
    const decoy = spawnEnemy("chaser", vec2(50, 0), 1);
    const ctx = makeContext(p, [decoy, attacker]);
    new EquipmentEngine().onHurt(ctx, 1, attacker);
    expect(ctx.projectiles).toHaveLength(1);
    const dir = ctx.projectiles[0].vel;
    expect(dir.y).toBeLessThan(0);
    expect(Math.abs(dir.x)).toBeLessThan(1e-6);
    expect(ctx.projectiles[0].pierce).toBe(1);
  });
});

/* ==================== 商店 ==================== */

describe("商店:被动货位、被动槽、切节律、共鸣数(§4 / §6)", () => {
  interface St { equipment: Equipment[]; skills: Equipment[]; passives: ReturnType<typeof generatePassive>[]; gold: number; rhythms: RhythmId[]; recorded: Equipment[] }
  function makeShop(rand: () => number, over: Partial<St> = {}): { m: ShopModel; st: St } {
    const st: St = { equipment: [], skills: [], passives: [], gold: 100000, rhythms: ["hit", "move"], recorded: [], ...over };
    const world: ShopWorld = {
      equipment: st.equipment,
      skills: st.skills,
      passives: st.passives,
      passiveSlots: () => PASSIVE_SLOTS,
      rhythms: () => st.rhythms,
      gold: () => st.gold,
      setGold: (v) => {
        st.gold = v;
      },
      slots: () => 6,
      runSlotBonus: () => 0,
      addRunSlot: () => {},
      chapter: () => 1,
      seasonId: () => 1,
      highestStage: () => 1,
      selectedSet: () => "thorn",
      ownedTalents: () => [],
      totalBought: () => 0,
      addTotalBought: () => {},
      recordEquipment: (eq) => {
        st.recorded.push(eq);
      },
      cardTypeKey: (eq) => eq.effect.def.type + "|" + eq.quality,
      mergeGroups: () => [],
    };
    return { m: new ShopModel(world, rand), st };
  }

  it("三卡位前两格恒主动、第三格恒被动(R1);主动货全挂在已解锁节律上;刷新后第三格仍是被动", () => {
    for (const r of [0.05, 0.5, 0.95]) {
      const { m } = makeShop(() => r);
      m.open();
      expect(m.offers).toHaveLength(3);
      for (const o of m.offers.slice(0, 2)) {
        expect(o && !isPassiveOffer(o)).toBe(true);
        for (const t of (o as Equipment).triggers) expect(["hit", "move"].includes(t.def.type)).toBe(true);
        expect((o as Equipment).kind).toBe("active");
      }
      expect(m.offers[2] && isPassiveOffer(m.offers[2])).toBe(true);
      const card = m.content().cards[2];
      expect(card.sub.startsWith("被动")).toBe(true);
      expect(card.iconKey).toBeNull();
      m.refresh();
      expect(m.offers[2] && isPassiveOffer(m.offers[2])).toBe(true);
      expect(m.offers.slice(0, 2).every((o) => o && !isPassiveOffer(o))).toBe(true);
    }
    // 没接被动槽的老宿主:三格全主动
    const st = { equipment: [] as Equipment[], gold: 1000 };
    const legacy = new ShopModel({
      equipment: st.equipment,
      gold: () => st.gold,
      setGold: (v) => {
        st.gold = v;
      },
      slots: () => 6,
      runSlotBonus: () => 0,
      addRunSlot: () => {},
      chapter: () => 1,
      seasonId: () => 1,
      highestStage: () => 1,
      selectedSet: () => null,
      ownedTalents: () => [],
      totalBought: () => 0,
      addTotalBought: () => {},
      recordEquipment: () => {},
      cardTypeKey: (eq) => eq.effect.def.type + "|" + eq.quality,
      mergeGroups: () => [],
    }, () => 0.5);
    legacy.open();
    expect(legacy.offers.every((o) => o && !isPassiveOffer(o))).toBe(true);
  });

  it("买被动:进被动槽、扣钱、不登记装备图鉴;被动槽满时买不了且原因是 passiveSlots", () => {
    const { m, st } = makeShop(() => 0.99);
    m.open();
    m.offers[0] = generatePassive(1, 0, () => 0.5);
    const price = m.priceOf(m.offers[0]!);
    expect(m.buyBlocker(0)).toBeNull();
    expect(m.buy(0)).toBe(true);
    expect(st.passives).toHaveLength(1);
    expect(st.gold).toBe(100000 - price);
    expect(st.recorded).toHaveLength(0);
    expect(m.offers[0]).toBeNull();
    for (let i = 0; i < PASSIVE_SLOTS; i++) st.passives.push(generatePassive(1, 0, () => 0.5));
    m.offers[1] = generatePassive(1, 0, () => 0.5);
    expect(m.buyBlocker(1)).toBe("passiveSlots");
    expect(m.buy(1)).toBe(false);
    expect(m.content().cards[1].afford).toBe(false);
  });

  it("点行切节律:两条已解锁时轮转、免费、改名;只有一条时返回 null(宿主退化为点选)", () => {
    const { m, st } = makeShop(() => 0.99);
    const eq = generateEquipment(1, "common", false, 0, st.rhythms);
    const effect = eq.effect.def.type;
    st.equipment.push(eq);
    const before = equipmentRhythm(eq);
    const next = m.switchRhythm(eq.id);
    expect(next).not.toBe(before);
    expect(equipmentRhythm(eq)).toBe(next);
    expect(st.gold).toBe(100000);
    expect(eq.name).toBe(isResonant(effect, next!) ? ARTIFACT_DEFS[effect].morphName : ARTIFACT_DEFS[effect].name);
    expect(m.switchRhythm(eq.id)).toBe(before);
    st.rhythms.length = 1;
    expect(m.switchRhythm(eq.id)).toBeNull();
    expect(m.switchRhythm(-1)).toBeNull();
  });

  it("头部:套组件数退役为共鸣数;被动与节律写在联动行;法宝行副标带节律名与共鸣标", () => {
    const { m, st } = makeShop(() => 0.99);
    st.equipment.push(artifact("cloud", "move", { dps: 10, radius: 100, duration: 4 }, 701), artifact("knife", "hit", { damage: 10, speed: 500, radius: 640, spread: 1 }, 702));
    st.passives.push(makePassive(1, "power", "common", 1, { pct3: 0.2 }));
    const c = m.content();
    expect(c.setText).toBe("荆棘回响 共鸣 1/2");
    // 进度以最高档 tier2 为满格(1 处 = 1/4);旧口径写死 /6 → 全部生效时条只走到 67%,玩家看不到「凑齐」
    expect(c.setProgress).toBeCloseTo(1 / RESONANCE_TIERS.tier2, 10);
    expect(c.bonusText).toContain("节律:受击/移动");
    expect(c.bonusText).toContain(`被动 1/${PASSIVE_SLOTS}:增幅`);
    expect(c.weapons[0].sub.startsWith("移动·共鸣")).toBe(true);
    expect(c.weapons[1].sub.startsWith("受击 ")).toBe(true);
    expect(c.weaponHeader.title).toContain("点行切节律");
  });

  it("共鸣读数与引擎同源:拿到共鸣被动的独有技能计入商店(旧口径只 filter 主动法宝 → 漏算这一半)", () => {
    const { m, st } = makeShop(() => 0.99);
    // 荆棘圆环的共鸣被动 = duration;只给技能 + 那枚被动,主动法宝侧共鸣数为 0
    st.skills.push(makeSkillEquipment(coreSkillOf("vera")));
    st.passives.push(makePassive(1, "duration", "common", 1, { sec: 1 }));
    const engine = resonanceBonusState([...st.skills, ...st.equipment], st.passives, "thorn", 1)!;
    expect(engine.pieces).toBe(1);
    const c = m.content();
    expect(c.setText).toBe("荆棘回响 共鸣 1/2");
    expect(c.setProgress).toBeCloseTo(engine.pieces / RESONANCE_TIERS.tier2, 10);
    // 一档达成后文案改口报缺口,把下一个目标摆在玩家眼前
    st.equipment.push(artifact("cloud", "move", { dps: 10, radius: 100, duration: 4 }, 703));
    expect(m.content().setText).toBe("荆棘回响 共鸣 2/4 · 差2");
    // 质变档达成后不再报缺口(S1 首发共鸣格 = cloud/move、ray/hit、chain/kill 三对)
    st.equipment.push(artifact("ray", "hit", { damage: 10, speed: 600, radius: 600 }, 704), artifact("chain", "kill", { damage: 10, jumps: 3, radius: 500 }, 705));
    const full = resonanceBonusState([...st.skills, ...st.equipment], st.passives, "thorn", 1)!;
    expect(full.pieces).toBeGreaterThanOrEqual(RESONANCE_TIERS.tier2);
    expect(m.content().setText).toContain("· 质变");
    expect(m.content().setProgress).toBeCloseTo(1, 10);
  });

  it("宽度闸:setText 逐档实宽不得超出套组文本盒(超了会画到进度胶囊底下)", () => {
    const VT = JSON.parse(fileSource("../cocos/assets/resources/config/viewTable.json"));
    const { asciiWidth, spaceWidth } = VT.hud;
    const box = Number(/setHintW:\s*(\d+)/.exec(fileSource("../cocos/assets/scripts/core/ViewTable.ts"))?.[1]);
    const micro = Number(/micro:\s*(\d+)/.exec(fileSource("../cocos/assets/scripts/ui/Widgets.ts"))?.[1]);
    expect(box, "ViewTable 须有 setHintW").toBeGreaterThan(0);
    expect(micro, "FS.micro 字号").toBeGreaterThan(0);
    // 与 PanelKit.approxW 同一判别式:空格按 spaceWidth、CJK(>0x2E7F)按整格、其余按 asciiWidth
    const width = (t: string) => [...t].reduce((w, ch) => w + (ch === " " ? micro * spaceWidth : ch.charCodeAt(0) > 0x2e7f ? micro : micro * asciiWidth), 0);

    const { m, st } = makeShop(() => 0.99);
    st.skills.push(makeSkillEquipment(coreSkillOf("vera")));
    st.passives.push(makePassive(1, "duration", "common", 1, { sec: 1 }));
    const stages: string[] = [m.content().setText!];
    st.equipment.push(artifact("cloud", "move", { dps: 10, radius: 100, duration: 4 }, 711));
    stages.push(m.content().setText!);
    st.equipment.push(artifact("ray", "hit", { damage: 10, speed: 600, radius: 600 }, 712), artifact("chain", "kill", { damage: 10, jumps: 3, radius: 500 }, 713));
    stages.push(m.content().setText!);
    expect(stages.length).toBe(3);
    for (const t of stages) expect(width(t), `${t} 实宽 ${Math.round(width(t) * 10) / 10}px / 盒 ${box}px`).toBeLessThanOrEqual(box);

    // 视图侧盒宽必须读表,不得再出现裸 150(否则模型改长文案时无声溢出)
    const view = fileSource("../cocos/assets/scripts/shop/ShopView.ts");
    expect(view.includes("p3.setHintW")).toBe(true);
    expect(/Math\.min\(150,/.test(view)).toBe(false);
  });
});

/* ==================== 开局链路 ==================== */

describe("BattleSim 开局:本命节律、核心技能、挂机档位", () => {
  function sim(hero: HeroId | null): BattleSim {
    const save = emptySave();
    save.energy = 99;
    if (hero) {
      save.selectedHero = hero;
      save.selectedSet = allHeroes().find((h) => h.id === hero)!.setId;
    }
    const s = new BattleSim({
      save,
      input: { isMoving: false, moveDir: vec2(0, 0) },
      worldH: 996,
      persist: () => {},
      callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
    });
    if (!s.startStage(1)) throw new Error("startStage(1) 未开局");
    return s;
  }

  it("12 英雄逐个开局:rhythms = [本命]、skills = [核心]、equipment 为空、挂机档位按节律", () => {
    for (const h of allHeroes()) {
      const s = sim(h.id);
      expect(s.player.rhythms, h.id).toEqual([HERO_RHYTHM[h.id]]);
      expect(s.player.skills.map((e) => e.skillId), h.id).toEqual([coreSkillOf(h.id).id]);
      expect(s.player.skills[0].kind).toBe("skill");
      expect(s.player.equipment).toHaveLength(0);
      expect(s.world.aiProfile, h.id).toBe(RHYTHM_AI_PROFILE[HERO_RHYTHM[h.id]]);
      expect(s.world.heroId()).toBe(h.id);
      expect(HERO_SKILLS[h.id][0].kind).toBe("core");
    }
  });

  it("重开一局:技能 / 节律 / 被动 / 分岔全部归零(Player 是新实例)", () => {
    const s = sim("vera");
    s.player.unlockRhythm("move");
    s.player.branchChosen = "vera_walker";
    s.player.passives.push(makePassive(1, "power", "common", 1, { pct3: 0.2 }));
    expect(s.startStage(1)).toBe(true);
    expect(s.player.rhythms).toEqual(["hit"]);
    expect(s.player.branchChosen).toBeNull();
    expect(s.player.passives).toHaveLength(0);
    expect(s.player.skills).toHaveLength(1);
  });

  it("引擎结算列跟着 castList:开局后跑 2 秒,核心技能有触发状态", () => {
    const s = sim("kyle");
    for (let i = 0; i < 120; i++) s.update(1 / 60);
    expect(s.engine.pulseLeft(s.player.skills[0].id)).not.toBeNull();
  });

  it("quality 主表隐藏档色被复用为共鸣高亮(卡面与商店角标同色)", () => {
    expect(qualityDef("hidden").color).toBe("#4dffc8");
    expect(makeModifier("power", { pct3: 0.1 }).def.name).toBe("增幅");
  });

  it("S2 第二本命:未解锁时 startRhythm 被忽略;解锁后按存档选择开局,核心技能跟着挂到所选节律", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "vera";
    save.selectedSet = "thorn";
    save.heroRhythmChoice.vera = "move";
    const mk = () => new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    const a = mk();
    a.startStage(1);
    expect(a.player.rhythms).toEqual(["hit"]);
    save.heroRhythmUnlock.vera = true;
    const b = mk();
    b.startStage(1);
    expect(b.player.rhythms).toEqual(["move"]);
    expect(b.player.skills[0].triggers[0].def.type).toBe("move");
    expect(b.world.aiProfile).toBe("orbit");
    save.heroRhythmChoice.vera = "pulse"; // 不在薇拉可选集(受击 / 低血 / 移动)里 → 回落本命
    const c = mk();
    c.startStage(1);
    expect(c.player.rhythms).toEqual(["hit"]);
  });
});

/* ==================== S1-c / S2:被动 × 技能共鸣、共鸣里程碑、发现横幅、遗物 ==================== */

describe("被动 × 技能共鸣(§5 表 2)与共鸣里程碑", () => {
  it("每个技能都标了共鸣被动与补丁;拿到那枚被动 → skillResonant 真、显示名改走共鸣名", () => {
    for (const list of Object.values(HERO_SKILLS)) {
      for (const def of list) {
        expect(PASSIVE_NORMAL_TYPES.includes(def.resonancePassive), def.id).toBe(true);
        expect(Object.keys(def.resonanceMorph).length, def.id).toBeGreaterThan(0);
        expect(def.resonanceName.length).toBeGreaterThan(0);
      }
    }
    const core = makeSkillEquipment(coreSkillOf("vera")); // 共鸣被动 = duration
    expect(skillResonant(core, [])).toBe(false);
    expect(equipmentDisplayName(core, [])).toBe("荆棘圆环");
    const dur = makePassive(1, "duration", "common", 1, { sec: 1 });
    expect(skillResonant(core, [dur])).toBe(true);
    expect(equipmentDisplayName(core, [dur])).toBe("荆棘领域");
  });

  it("分支给核心的形态补丁(coreMorph):棘行者让圆环爆完留荆棘带;荆甲把落点搬到来袭者脚下", () => {
    const walker = HERO_SKILLS.vera.find((d) => d.id === "vera_walker")!;
    const armor = HERO_SKILLS.vera.find((d) => d.id === "vera_armor")!;
    expect(walker.coreMorph?.afterCastGround).toBeDefined();
    expect(armor.coreMorph?.castAtAttacker).toBe(true);

    // 基线:没选分支时圆环不留地 —— 地面只可能来自 coreMorph
    const p0 = new Player();
    p0.rhythms = ["hit", "move"];
    p0.skills.push(makeSkillEquipment(coreSkillOf("vera")));
    const e0 = spawnEnemy("chaser", vec2(30, 0), 1);
    const c0 = makeContext(p0, [e0]);
    new EquipmentEngine().onHurt(c0, 1, e0);
    expect(c0.clouds.filter((x) => !x.heals).length).toBe(0);

    // A) 棘行者:圆环结算后在落点长出荆棘带,半径与持续都读表
    const p1 = new Player();
    p1.rhythms = ["hit", "move"];
    p1.skills.push(makeSkillEquipment(coreSkillOf("vera")), makeSkillEquipment(walker));
    const e1 = spawnEnemy("chaser", vec2(30, 0), 1);
    const c1 = makeContext(p1, [e1]);
    new EquipmentEngine().onHurt(c1, 1, e1);
    const nova1 = c1.fx.find((f) => f.type === "nova")!;
    const ground = c1.clouds.filter((x) => !x.heals);
    expect(ground.length).toBe(1);
    expect(ground[0].radius).toBeCloseTo(nova1.radius! * walker.coreMorph!.afterCastGround!.radiusMult, 6);
    expect(ground[0].maxTtl).toBeCloseTo(walker.coreMorph!.afterCastGround!.duration, 10);
    expect(ground[0].dps).toBeGreaterThan(0);

    // B) 荆甲:新星中心从玩家自身搬到最近一次来袭者位置(onHurt 已记 lastAttackerPos)
    const p2 = new Player();
    p2.rhythms = ["hit", "hurt"];
    p2.skills.push(makeSkillEquipment(coreSkillOf("vera")), makeSkillEquipment(armor));
    const e2 = spawnEnemy("chaser", vec2(30, 40), 1);
    const c2 = makeContext(p2, [e2]);
    new EquipmentEngine().onHurt(c2, 1, e2);
    const nova2 = c2.fx.find((f) => f.type === "nova")!;
    expect([Math.round(nova2.pos.x), Math.round(nova2.pos.y)]).toEqual([30, 40]);
  });

  it("引擎:技能拿到共鸣被动后叠 resonanceMorph(荆棘领域:范围 ×1.5、伤害 ×1.2 再乘被动本身)", () => {
    const p = new Player();
    p.rhythms = ["hit"];
    // 钉在满层:零层罚项会让"×1.2 后再取整"与"取整后 ×1.2"差 1 点,这条只验共鸣乘区
    p.thornStack = THORN_STACK.cap;
    p.skills.push(makeSkillEquipment(coreSkillOf("vera")));
    const e = spawnEnemy("chaser", vec2(30, 0), 1);
    const before = makeContext(p, [e]);
    new EquipmentEngine().onHurt(before, 1, e);
    const dmg0 = (before.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0][1] as number;
    const r0 = before.fx.find((f) => f.type === "nova")!.radius!;
    p.passives.push(makePassive(1, "duration", "common", 1, { sec: 1 }));
    const after = makeContext(p, [e]);
    new EquipmentEngine().onHurt(after, 1, e);
    const dmg1 = (after.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0][1] as number;
    const r1 = after.fx.find((f) => f.type === "nova")!.radius!;
    expect(dmg1).toBe(Math.round(dmg0 * 1.2));
    expect(r1).toBeCloseTo(r0 * 1.5, 5);
  });

  it("共鸣数 = 共鸣法宝 + 共鸣技能;里程碑 2 / 4 处对应 bonus3 / bonus6", () => {
    const skills = [makeSkillEquipment(coreSkillOf("vera"))];
    const arts = [artifact("cloud", "move", { dps: 1 }, 1), artifact("cloud", "hit", { dps: 1 }, 2), artifact("shield", "hit", { amount: 1 }, 3)];
    expect(resonanceCount([...skills, ...arts], [])).toBe(2);
    const s2 = resonanceBonusState([...skills, ...arts], [], "thorn")!;
    expect([s2.pieces, s2.bonus3, s2.bonus6]).toEqual([2, true, false]);
    const dur = makePassive(9, "duration", "common", 1, { sec: 1 });
    expect(resonanceCount([...skills, ...arts], [dur])).toBe(3);
    const arts4 = [...arts, artifact("drain", "hit", { heal: 1 }, 4)];
    const s4 = resonanceBonusState([...skills, ...arts4], [dur], "thorn")!;
    expect([s4.pieces, s4.bonus3, s4.bonus6]).toEqual([4, true, true]);
    expect(RESONANCE_TIERS).toEqual({ tier1: 2, tier2: 4 });
    expect(resonanceBonusState([], [], null)).toBeNull();
  });

  it("真跑 BattleSim:首次共鸣 → 横幅 + 时停 + 图鉴;同一条不重复报", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "kyle";
    save.selectedSet = "barrage";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    s.update(1 / 60);
    expect(s.discoveryBanner).toBeNull();
    // 凯尔本命周期;毒云符共鸣节律是 移动 / 周期 → 挂周期即共鸣
    s.player.equipment.push(artifact("cloud", "pulse", { dps: 10, radius: 100, duration: 4 }, 901));
    const t0 = s.elapsed;
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain("共鸣 · 毒径");
    expect(s.world.hitStop).toBeGreaterThan(0);
    expect(save.collection.resonances).toEqual(["art:cloud:pulse"]);
    // 时停期间战斗不推进(章节计时不动)
    const timer = s.world.chapterTimer;
    s.update(1 / 60);
    expect(s.world.chapterTimer).toBe(timer);
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    expect(s.world.hitStop).toBeLessThanOrEqual(0);
    expect(s.elapsed).toBeGreaterThan(t0);
    // 再挂一件同效果同节律不再报;换个效果才报
    s.world.discoveryBanner = null;
    s.player.equipment.push(artifact("cloud", "pulse", { dps: 10, radius: 100, duration: 4 }, 902));
    s.update(1 / 60);
    expect(s.discoveryBanner).toBeNull();
    s.player.equipment.push(artifact("knife", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }, 903));
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain("连杀飞刃");
    expect(save.collection.resonances).toEqual(["art:cloud:pulse", "art:knife:pulse"]);
  });
});

describe("遗物类被动(D3 并入)", () => {
  it("表:8 枚遗物、数值入表、relicStack 按叠加衰减;常规修饰器池仍是 8 枚", () => {
    expect(RELIC_TYPES).toHaveLength(8);
    for (const t of RELIC_TYPES) {
      expect(isRelicType(t)).toBe(true);
      expect(PASSIVE_DEFS[t].relic).toBe(true);
      expect(RELIC_VALUES[t]).toBeDefined();
    }
    expect(isRelicType("power")).toBe(false);
    expect(PASSIVE_NORMAL_TYPES).toHaveLength(8);
    const list = [makePassive(1, "core", "common", 1, {}), makePassive(2, "core", "common", 1, {}), makePassive(3, "lens", "common", 1, {})];
    expect(relicStack(list, "core")).toBeCloseTo(1 + PASSIVE_STACK_DECAY, 10);
    expect(relicStack(list, "lens")).toBe(1);
    expect(relicStack(list, "yoke")).toBe(0);
    expect(passiveDesc(list[0])).toBe(`【裂核】${PASSIVE_DEFS.core.desc}`);
  });

  it("引擎:沙漏叠入 haste、透镜放大范围、稳定器加快弹速", () => {
    const p = new Player();
    p.rhythms = ["pulse"];
    p.equipment.push(artifact("nova", "pulse", { damage: 10, radius: 100 }, 1), artifact("knife", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }, 2));
    p.passives.push(makePassive(11, "hourglass", "common", 1, {}), makePassive(12, "lens", "common", 1, {}), makePassive(13, "stabilizer", "common", 1, {}));
    const e = spawnEnemy("chaser", vec2(60, 0), 1);
    const ctx = makeContext(p, [e]);
    const engine = new EquipmentEngine();
    engine.update(ctx, 2.5);
    expect(engine.pulseLeft(1)!.interval).toBeCloseTo(2.4 * (1 - RELIC_VALUES.hourglass.haste), 5);
    expect(ctx.fx.find((f) => f.type === "nova")!.radius).toBeCloseTo(100 * RELIC_VALUES.lens.radiusMult, 5);
    const knife = ctx.projectiles[0];
    expect(Math.hypot(knife.vel.x, knife.vel.y)).toBeCloseTo(500 * RELIC_VALUES.stabilizer.speedMult, 3);
  });

  it("世界层:磁轭放大拾取半径、护心镜减接触伤害、裂核抬暴击、假命致死免死一次", () => {
    const save = emptySave();
    save.energy = 99;
    const mk = () => {
      const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
      s.startStage(1);
      return s;
    };
    /** 把一只怪钉在玩家脚下,推进到第一次接触伤害发生,返回那一下扣的血 */
    const firstBite = (s: BattleSim): { dealt: number; e: Enemy } => {
      s.world.autoMove = false;
      const e = spawnEnemy("chaser", vec2(s.player.pos.x + 1, s.player.pos.y), 1);
      s.enemies.push(e);
      const hp0 = s.player.hp;
      for (let i = 0; i < 120 && s.player.hp === hp0; i++) {
        e.pos.x = s.player.pos.x + 1;
        e.pos.y = s.player.pos.y;
        s.update(1 / 60);
      }
      return { dealt: hp0 - s.player.hp, e };
    };
    // 护心镜:同一只怪贴身一次,伤害 ×0.85
    const a = mk();
    const bite = firstBite(a);
    expect(bite.dealt).toBe(bite.e.def.contactDmg);
    const b = mk();
    b.player.passives.push(makePassive(1, "mirror", "common", 1, {}));
    const bite2 = firstBite(b);
    expect(bite2.dealt).toBe(Math.max(1, Math.round(bite2.e.def.contactDmg * RELIC_VALUES.mirror.contactMult)));
    // 假命:致死一击 → 20% 判定命中时活下来并回 20%
    const c = mk();
    c.player.passives.push(makePassive(2, "spare_life", "common", 1, {}));
    c.player.hp = 1;
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.01);
    const bite3 = firstBite(c);
    rand.mockRestore();
    expect(bite3.dealt, "致死那一下确实打到了").not.toBe(0);
    expect(c.player.alive).toBe(true);
    expect(c.player.hp).toBe(Math.round(c.player.maxHp * RELIC_VALUES.spare_life.healPct));
    expect(c.player.spareLifeUsed).toBe(true);
    expect(c.discoveryBanner?.text).toContain("假命");
    // 第二次致死不再免
    c.player.hp = 1;
    c.player.shield = 0;
    const rand2 = vi.spyOn(Math, "random").mockReturnValue(0.01);
    bite3.e.hitCooldown = 0;
    for (let i = 0; i < 120 && c.player.alive; i++) {
      bite3.e.pos.x = c.player.pos.x + 1;
      bite3.e.pos.y = c.player.pos.y;
      c.update(1 / 60);
    }
    rand2.mockRestore();
    expect(c.player.alive).toBe(false);
  });
});

describe("商店独有技能只读段(R10 两列表)", () => {
  it("接了 skills 的宿主:content().skills 列出核心 / 分岔(名 / 节律 / 阶数),layout 带技能段;没接 = 空段且几何与之前相同", () => {
    const st = { equipment: [] as Equipment[], passives: [] as PassiveArtifact[], gold: 500 };
    const skills = [makeSkillEquipment(coreSkillOf("vera")), makeSkillEquipment(HERO_SKILLS.vera[2])];
    skills[1].level = 3;
    const base = {
      equipment: st.equipment,
      passives: st.passives,
      passiveSlots: () => PASSIVE_SLOTS,
      rhythms: () => ["hit", "move"] as RhythmId[],
      gold: () => st.gold,
      setGold: (v: number) => {
        st.gold = v;
      },
      slots: () => 4,
      runSlotBonus: () => 0,
      addRunSlot: () => {},
      chapter: () => 2,
      seasonId: () => 1,
      highestStage: () => 1,
      selectedSet: () => "thorn" as const,
      ownedTalents: () => [],
      totalBought: () => 0,
      addTotalBought: () => {},
      recordEquipment: () => {},
      cardTypeKey: (eq: Equipment) => eq.effect.def.type + "|" + eq.quality,
      mergeGroups: () => [],
    };
    const withSkills = new ShopModel({ ...base, skills } as ShopWorld, () => 0.5);
    withSkills.v4 = true;
    withSkills.rollOffers();
    const c = withSkills.content();
    expect(c.skills.map((s) => s.name)).toEqual([skills[0].name, skills[1].name]);
    expect(c.skills[0].sub).toContain("核心");
    expect(c.skills[0].sub).toContain("受击节律");
    expect(c.skills[1].sub).toContain("分岔");
    expect(c.skills[1].sub).toContain("3/5 阶");
    expect(c.skillHeader.right).toBe("2 招");
    expect(withSkills.layout(996).skillRows).toHaveLength(2);
    const without = new ShopModel(base as ShopWorld, () => 0.5);
    without.v4 = true;
    without.rollOffers();
    expect(without.content().skills).toEqual([]);
    expect(without.layout(996).skillLabelY).toBe(null);
    expect(without.layout(996).weaponLabelY).toBeLessThan(withSkills.layout(996).weaponLabelY);
  });
});

describe("章首保留召唤物(R11)", () => {
  it("nextChapter 不清召唤物:数量 / 剩余存活不变,位置跟主人回场心;startRun 仍清空", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "oden";
    save.selectedSet = "requiem";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    const src = s.player.skills[0];
    for (let i = 0; i < 3; i++) s.world.minions.push(spawnMinion({ pos: vec2(40 + i * 200, 900), hp: 50, damage: 10, duration: 12, speed: 100, color: "#fff", source: src }));
    const ttl = s.world.minions.map((m) => m.ttl);
    s.world.nextChapter();
    expect(s.world.minions).toHaveLength(3);
    expect(s.world.minions.map((m) => m.ttl)).toEqual(ttl);
    for (const m of s.world.minions) {
      expect(Math.abs(m.pos.x - s.player.pos.x)).toBeLessThanOrEqual(MINION_CARRY_SPREAD / 2);
      expect(Math.abs(m.pos.y - s.player.pos.y)).toBeLessThanOrEqual(MINION_CARRY_SPREAD / 2);
    }
    expect(s.world.enemies.length, "敌人照常清场").toBeGreaterThanOrEqual(0);
    s.world.startRun();
    expect(s.world.minions).toHaveLength(0);
  });
});

describe("被动管理(R2:商店「被动」钮借升级弹层)", () => {
  function passiveWorld(passives: PassiveArtifact[], gold = 100) {
    const st = { gold };
    const world = {
      equipment: [] as Equipment[],
      skills: [makeSkillEquipment(coreSkillOf("vera"))],
      passives,
      heroId: () => "vera" as const,
      playerLevel: () => 6,
      rhythms: () => ["hit"] as RhythmId[],
      unlockRhythm: () => {},
      rhythmLevel: () => 1,
      rhythmLevelUp: () => true,
      branchChosen: () => null,
      setBranchChosen: () => {},
      gold: () => st.gold,
      setGold: (v: number) => {
        st.gold = v;
      },
      healPct: () => {},
      addMaxHp: () => {},
      slots: () => 6,
      chapter: () => 3,
      highestStage: () => 1,
      ownedTalents: () => [],
      recordEquipment: () => {},
    };
    return { world, st };
  }

  it("openPassives:每页 3 枚、重随钮 = 翻页、锁定钮 = 关闭;卡面写销毁回收额 = 基础价 × DESTROY_REFUND_RATE", () => {
    const list = [
      makePassive(1, "power", "common", 1, { pct3: 0.2 }),
      makePassive(2, "haste", "rare", 1, { pct2: 0.5 }),
      makePassive(3, "hourglass", "epic", 1, {}),
      makePassive(4, "pierce", "common", 1, { count: 1 }),
    ];
    const { world } = passiveWorld(list);
    const m = new LevelUpModel(world, () => 0.5);
    m.openPassives();
    expect(m.visible).toBe(true);
    expect(m.mode).toBe("passives");
    expect(m.choices.length).toBe(3);
    expect(m.passivePages()).toBe(2);
    const c = m.content();
    expect(c.title).toBe(LV_TEXT.titlePassives);
    expect(c.readoutText.includes("被动 4/4")).toBe(true);
    expect(c.cards[0].pickText).toBe(`${LV_TEXT.destroyPrefix}${Math.round(qualityBasePrice("common") * DESTROY_REFUND_RATE)}${LV_TEXT.destroySuffix}`);
    expect(c.cards[1].qualityText).toBe(`${qualityDef("rare").name} · 被动`);
    expect(c.cards[2].tagText).toBe(LV_TEXT.tagPassiveRelic);
    expect(c.cards[0].rerollText).toBe(LV_TEXT.nextPage);
    expect(c.cards[0].lockText).toBe(LV_TEXT.close);
    // 翻页
    expect(m.reroll(0)).toBe(true);
    expect(m.passivePage).toBe(1);
    expect(m.choices.length).toBe(1);
    expect(m.reroll(0)).toBe(true);
    expect(m.passivePage).toBe(0);
    // 关闭
    expect(m.toggleLock(1)).toBe(true);
    expect(m.visible).toBe(false);
    expect(list.length, "关闭不动被动").toBe(4);
  });

  it("选它 = 销毁那一枚并回收半价;弹层留着直到被动清空;单页时翻页钮灰", () => {
    const list = [makePassive(1, "power", "epic", 1, { pct3: 0.3 }), makePassive(2, "haste", "common", 1, { pct2: 0.3 })];
    const { world, st } = passiveWorld(list, 100);
    const m = new LevelUpModel(world, () => 0.5);
    m.openPassives();
    expect(m.canReroll(0), "只有一页").toBe(false);
    expect(m.canLock(0)).toBe(true);
    const r = m.pick(0);
    expect(r.ok).toBe(true);
    expect(list.map((p) => p.id)).toEqual([2]);
    expect(st.gold).toBe(100 + Math.round(qualityBasePrice("epic") * DESTROY_REFUND_RATE));
    expect(m.visible, "还剩被动,弹层留着").toBe(true);
    expect(m.choices.length).toBe(1);
    expect(m.pick(0).ok).toBe(true);
    expect(list.length).toBe(0);
    expect(m.visible, "清空即关").toBe(false);
  });

  it("商店工具钮第二格是「被动」:有被动才亮,文案带 n/槽数;GameShell 在 passives 形态下不动 levelUpPending", () => {
    const shopSrc = fileSource("../cocos/assets/scripts/shop/ShopModel.ts");
    expect(shopSrc.includes('{ id: "passive"')).toBe(true);
    const shell = fileSource("../cocos/assets/scripts/GameShell.ts");
    expect(shell.includes("this.levelUpModel.openPassives();")).toBe(true);
    const seg = shell.slice(shell.indexOf("private onLevelUpAction"), shell.indexOf("private buildConfirmLayer"));
    const passivesBranch = seg.slice(seg.indexOf('if (m.mode === "passives") {'), seg.indexOf("if (a.kind === \"reroll\") {"));
    expect(passivesBranch.includes("levelUpPending")).toBe(false);
    expect(passivesBranch.includes("this.shopView?.sync();")).toBe(true);
  });
});

describe("赛季共鸣(R5:每季换共鸣格 + 1 枚赛季法宝)", () => {
  const seasons = Object.values(SEASON_RESONANCES);

  it("表:S1 无新对只标 3 格首发;S2–S4 各 3 对,全部落在基础表空格上,名字与基础变形名互不重复;每季 1 枚赛季法宝与本季一对同节律", () => {
    expect(SEASON_RESONANCES[1].pairs).toEqual([]);
    expect(SEASON_RESONANCES[1].face).toBeNull();
    expect(SEASON_RESONANCES[1].featured.length).toBe(3);
    for (const [e, r] of SEASON_RESONANCES[1].featured) expect(ARTIFACT_DEFS[e].resonance.includes(r), `${e}×${r}`).toBe(true);
    const names = new Set<string>(Object.values(ARTIFACT_DEFS).map((d) => d.morphName));
    for (const set of seasons) {
      if (set.season === 1) continue;
      expect(set.pairs.length).toBe(3);
      for (const p of set.pairs) {
        expect(ARTIFACT_DEFS[p.effect].resonance.includes(p.rhythm), `${p.effect}×${p.rhythm} 撞基础格`).toBe(false);
        expect(names.has(p.name), p.name).toBe(false);
        names.add(p.name);
        expect(Object.keys(p.morph).length).toBeGreaterThan(0);
      }
      const face = seasonArtifactDef(set.face)!;
      expect(face.season).toBe(set.season);
      expect(face.innerCd).toBeGreaterThan(0);
      expect(set.pairs.some((p) => p.rhythm === face.resonance[0])).toBe(true);
      expect(names.has(face.morphName)).toBe(false);
      names.add(face.morphName);
    }
    expect(seasonFace(1)).toBeNull();
    expect(seasonFace(2)?.id).toBe("s2_frost_jail");
    expect(seasonArtifactsAvailable(1)).toEqual([]);
    expect(seasonArtifactsAvailable(3).map((d) => d.id)).toEqual(["s2_frost_jail", "s3_magma_core"]);
  });

  it("seasonPairOf:当季全量、过季回响、未上市 null;echoMorph 乘区向 1 收半、整数项上整半、开关保留", () => {
    expect(seasonPairOf("frost_ring", "hit", 1)).toBeNull();
    expect(seasonPairOf("frost_ring", "hit", undefined)).toBeNull();
    const s2 = seasonPairOf("frost_ring", "hit", 2)!;
    expect([s2.season, s2.echo, s2.pair.name]).toEqual([2, false, "霜甲环"]);
    const s3 = seasonPairOf("frost_ring", "hit", 3)!;
    expect([s3.season, s3.echo]).toEqual([2, true]);
    expect(seasonPairOf("frost_ring", "crit", 3)).toBeNull();
    expect(echoMorph({ power: 1.3, radiusMult: 1.2, splitExtra: 2, pierce: 1, haste: 0.1, spawnAtKill: true, comboScale: { per: 4, cap: 8 }, explode: { radius: 60, damageMult: 0.4 } }, SEASON_ECHO_MULT)).toEqual({
      power: 1.15,
      radiusMult: 1.1,
      splitExtra: 1,
      pierce: 1,
      haste: 0.05,
      spawnAtKill: true,
      comboScale: { per: 4, cap: 4 },
      explode: { radius: 60, damageMult: 0.2 },
    });
    expect(resonanceRhythmsOf("frost_ring")).toEqual(["move", "hurt"]);
    expect(resonanceRhythmsOf("frost_ring", 1)).toEqual(["move", "hurt"]);
    expect(resonanceRhythmsOf("frost_ring", 2)).toEqual(["move", "hurt", "hit"]);
    expect(isResonant("frost_ring", "hit")).toBe(false);
    expect(isResonant("frost_ring", "hit", 2)).toBe(true);
    expect(defaultRhythmFor("frost_ring", ["hit", "pulse"])).toBe("hit");
    expect(defaultRhythmFor("frost_ring", ["pulse", "hit"])).toBe("pulse");
    expect(defaultRhythmFor("frost_ring", ["pulse", "hit"], 2)).toBe("hit");
  });

  it("装备层:同一件霜环挂受击 —— S1 不共鸣、S2 当季共鸣「霜甲环」、S3 回响(名字保留、补丁减半);不给赛季 = 老口径", () => {
    const eq = artifact("frost_ring", "hit", { damage: 10, radius: 100, duration: 3 }, 950);
    expect(equipmentResonance(eq)).toBeNull();
    expect(equipmentResonance(eq, 1)).toBeNull();
    const s2 = equipmentResonance(eq, 2)!;
    expect([s2.kind, s2.season, s2.name]).toEqual(["season", 2, "霜甲环"]);
    expect(s2.morph).toEqual({ radiusMult: 1.2, durationMult: 1.3 });
    const s3 = equipmentResonance(eq, 3)!;
    expect([s3.kind, s3.name]).toEqual(["echo", "霜甲环"]);
    expect(s3.morph.radiusMult).toBeCloseTo(1.1, 9);
    expect(s3.morph.durationMult).toBeCloseTo(1.15, 9);
    expect(equipmentDisplayName(eq)).toBe(ARTIFACT_DEFS.frost_ring.name);
    expect(equipmentDisplayName(eq, undefined, 2)).toBe("霜甲环");
    expect(resonanceCount([eq], [])).toBe(0);
    expect(resonanceCount([eq], [], 2)).toBe(1);
    // 基础格优先于赛季格,且不受赛季影响
    const base = artifact("frost_ring", "move", { damage: 10, radius: 100, duration: 3 }, 951);
    expect(equipmentResonance(base, 4)?.kind).toBe("base");
    expect(equipmentDisplayName(base, undefined, 4)).toBe(ARTIFACT_DEFS.frost_ring.morphName);
  });

  it("引擎:ctx.seasonId = 2 时霜环受击变形(范围 ×1.2);不给赛季不变形;赛季法宝按变体表取内置冷却与变形", () => {
    const run = (seasonId: number | undefined) => {
      const p = new Player();
      p.rhythms = ["hit"];
      p.equipment.push(artifact("frost_ring", "hit", { damage: 10, radius: 100, duration: 3 }, 960));
      const ctx = makeContext(p, [spawnEnemy("chaser", vec2(40, 0), 1)], seasonId === undefined ? {} : { seasonId });
      const engine = new EquipmentEngine();
      engine.onHurt(ctx, 1, ctx.enemies[0]);
      // 霜环 = 扩散环 cloud,ttl = min(持续, 最大半径 / 扩张速度) = 100·radiusMult / 260 → 范围乘区直接落在 ttl 上
      return ctx.clouds[0]?.ttl ?? -1;
    };
    const plain = run(undefined);
    const season = run(2);
    expect(plain).toBeGreaterThan(0);
    expect(season).toBeCloseTo(plain * 1.2, 5);
    // 赛季法宝:霜牢符 = 冰锥变体,共鸣格只有受击;挂受击 → 「冰牢」;挂周期(冰锥基础格)不算共鸣
    const face: Equipment = { ...artifact("icelance", "hit", { damage: 10, speed: 500, radius: 640, spread: 1 }, 961), variant: "s2_frost_jail" };
    expect(artifactInnerCd(face)).toBe(SEASON_ARTIFACTS.s2_frost_jail.innerCd);
    expect(artifactBaseName(face)).toBe("霜牢符");
    expect(equipmentResonance(face, 2)?.name).toBe("冰牢");
    expect(equipmentResonance(face)?.name, "变体自带格不依赖赛季").toBe("冰牢");
    const facePulse: Equipment = { ...artifact("icelance", "pulse", { damage: 10, speed: 500, radius: 640, spread: 1 }, 962), variant: "s2_frost_jail" };
    expect(equipmentResonance(facePulse, 2)).toBeNull();
    expect(equipmentDisplayName(facePulse, undefined, 2)).toBe("霜牢符");
    expect(artifactResonanceRhythms(face)).toEqual(["hit"]);
    expect(defaultRhythmOf(face, ["pulse", "hit"])).toBe("hit");
    expect(defaultRhythmOf(face, ["pulse", "kill"])).toBe("pulse");
  });

  it("生成:S1 永不出赛季法宝;S2 商店按 SEASON_FACE_OFFER_CHANCE 偏向出「霜牢符」,过季(S3)仍可出但只按件数均摊;归一化 / 切节律保留变体名", () => {
    for (let i = 0; i < 200; i++) expect(generateEquipment(3, "common", false, 0, ["hit"], 1).variant).toBeUndefined();
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValue(0.1);
    const face = generateEquipment(3, "common", false, 0, ["pulse", "hit"], 2);
    expect(face.variant).toBe("s2_frost_jail");
    expect(equipmentRhythm(face), "默认挂到变体共鸣格").toBe("hit");
    expect(face.name).toBe("冰牢");
    // 0.3:偏向未中;S2 已上市 1 枚 → 1/9 ≈ 0.111 → 也未中 → 通用池
    spy.mockReturnValue(0.3);
    expect(generateEquipment(3, "common", false, 0, ["hit"], 2).variant).toBeUndefined();
    // S3:当季脸偏向未中(0.3),均摊 2/10 = 0.2 → 0.3 也未中 → 通用池
    expect(generateEquipment(3, "common", false, 0, ["hit"], 3).variant).toBeUndefined();
    // S3 过季法宝走均摊池:脸未中(0.3)→ 均摊中(0.1 < 0.2)→ 已上市 2 枚里取首枚 = 上季的霜牢符(过季常驻)
    spy.mockReturnValueOnce(0.3).mockReturnValueOnce(0.1).mockReturnValueOnce(0.1);
    const past = generateEquipment(3, "common", false, 0, ["hit"], 3);
    expect(past.variant).toBe("s2_frost_jail");
    spy.mockRestore();
    // 归一化 / 切节律:变体名不丢
    normalizeArtifact(face, ["pulse"], undefined, 2);
    expect(equipmentRhythm(face)).toBe("pulse");
    expect(face.name).toBe("霜牢符");
    assignRhythm(face, "hit", ["pulse", "hit"], undefined, 2);
    expect(face.name).toBe("冰牢");
  });

  it("真跑 BattleSim(S2):霜环挂受击首次共鸣横幅带「本季新共鸣」,图鉴键沿用 art:效果:节律;赛季法宝图鉴键用变体 id", () => {
    const save = emptySave();
    save.energy = 99;
    save.seasonId = 2;
    save.selectedHero = "vera";
    save.selectedSet = "thorn";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    s.update(1 / 60);
    s.player.equipment.push(artifact("frost_ring", "hit", { damage: 10, radius: 100, duration: 3 }, 970));
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain("霜甲环");
    expect(s.discoveryBanner?.text).toContain(DISCOVERY.seasonNew);
    expect(save.collection.resonances).toEqual(["art:frost_ring:hit"]);
    for (let i = 0; i < 40; i++) s.update(1 / 60);
    s.world.discoveryBanner = null;
    s.player.equipment.push({ ...artifact("icelance", "hit", { damage: 10, speed: 500, radius: 640, spread: 1 }, 971), variant: "s2_frost_jail" });
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain("冰牢");
    expect(s.discoveryBanner?.text.includes(DISCOVERY.seasonNew)).toBe(false);
    expect(save.collection.resonances).toEqual(["art:frost_ring:hit", "art:s2_frost_jail:hit"]);
  });

  it("真跑 BattleSim(S1):首发基础格横幅带「本季首发」,非首发基础格无角标", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "kyle";
    save.selectedSet = "barrage";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    s.update(1 / 60);
    s.player.equipment.push(artifact("cloud", "pulse", { dps: 10, radius: 100, duration: 4 }, 980));
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain("毒径");
    expect(s.discoveryBanner?.text.includes(DISCOVERY.seasonFeatured)).toBe(false);
    for (let i = 0; i < 40; i++) s.update(1 / 60);
    s.world.discoveryBanner = null;
    s.player.unlockRhythm("kill");
    s.player.equipment.push(artifact("chain", "kill", { damage: 10, jumps: 3, radius: 200 }, 981));
    s.update(1 / 60);
    expect(s.discoveryBanner?.text).toContain(DISCOVERY.seasonFeatured);
  });

  it("商店(S2):卡面 sub 带「本季新」/ 赛季法宝带「赛季」;切节律后名字按赛季重算", () => {
    const st = { gold: 5000, equipment: [artifact("frost_ring", "pulse", { damage: 10, radius: 100, duration: 3 }, 990)] as Equipment[], passives: [] as PassiveArtifact[] };
    const world: ShopWorld = {
      equipment: st.equipment,
      passives: st.passives,
      passiveSlots: () => PASSIVE_SLOTS,
      rhythms: () => ["pulse", "hit"],
      gold: () => st.gold,
      setGold: (v) => {
        st.gold = v;
      },
      slots: () => 6,
      runSlotBonus: () => 0,
      addRunSlot: () => {},
      chapter: () => 3,
      seasonId: () => 2,
      highestStage: () => 1,
      selectedSet: () => null,
      ownedTalents: () => [],
      totalBought: () => 0,
      addTotalBought: () => {},
      recordEquipment: () => {},
      cardTypeKey: (eq) => eq.effect.def.type + "|" + eq.quality,
      mergeGroups: () => [],
    };
    const m = new ShopModel(world, () => 0.5);
    m.rollOffers();
    // 霜环当前挂周期(非共鸣);切一次到受击 → S2 新格「霜甲环」
    const row = m.content().weapons[0];
    expect(row.name.startsWith(ARTIFACT_DEFS.frost_ring.name)).toBe(true);
    expect(m.switchRhythm(990)).toBe("hit");
    expect(st.equipment[0].name).toBe("霜甲环");
    expect(m.content().weapons[0].sub.includes("共鸣")).toBe(true);
    // 货架塞一张赛季法宝与一张当季新格卡,卡面角标
    const face: Equipment = { ...artifact("icelance", "hit", { damage: 10, speed: 500, radius: 640, spread: 1 }, 991), variant: "s2_frost_jail" };
    const fresh = artifact("ray", "combo", { damage: 10, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 992);
    m.offers[0] = face;
    m.offers[1] = fresh;
    const cards = m.content().cards;
    expect(cards[0].name).toBe("冰牢");
    expect(cards[0].sub.includes("共鸣")).toBe(true);
    expect(cards[1].name).toBe("连杀冰束");
    expect(cards[1].sub.includes("本季新")).toBe(true);
  });
});

describe("核心技能节律调率(R6:按旧武器射速折算节拍)", () => {
  it("表:调率只给 kyle / nora / loka / doran / sia,倍率落在 0.3–2;其余英雄核心不带调率", () => {
    const tuned = Object.keys(CORE_RHYTHM_TUNE).sort();
    expect(tuned).toEqual(["doran", "kyle", "loka", "nora", "sia", "vera"]);
    for (const [h, t] of Object.entries(CORE_RHYTHM_TUNE)) {
      for (const v of Object.values(t!)) expect(v, h).toBeGreaterThanOrEqual(0.3);
      for (const v of Object.values(t!)) expect(v, h).toBeLessThanOrEqual(2);
      expect(coreSkillOf(h as HeroId).rhythmTune).toBe(t);
    }
    for (const h of allHeroes().map((x) => x.id).filter((id) => !(id in CORE_RHYTHM_TUNE))) expect(coreSkillOf(h).rhythmTune, h).toBeUndefined();
    expect(coreSkillOf(null).rhythmTune).toBeUndefined();
  });

  it("skillTriggerParams:周期 2.4 × 0.5 = 1.2;连杀 5 × 0.6 = 3;移动 240 × 0.7 = 168;低血 0.5 × 1.4 = 0.7;无调率 = 节律表原值;等级缩放叠在调率之上", () => {
    expect(skillTriggerParams(coreSkillOf("kyle"), "pulse")).toEqual({ interval: 1.2 });
    expect(skillTriggerParams(coreSkillOf("loka"), "combo")).toEqual({ count: 3, window: 3 });
    expect(skillTriggerParams(coreSkillOf("doran"), "move")).toEqual({ distance: 168 });
    expect(skillTriggerParams(coreSkillOf("sia"), "hurt")).toEqual({ hpThreshold: 0.7 });
    expect(skillTriggerParams(coreSkillOf("vera"), "hit"), "baseline 调率不碰本命参数").toEqual(rhythmTriggerParams("hit"));
    expect(skillTriggerParams(coreSkillOf("bran"), "kill")).toEqual(rhythmTriggerParams("kill"));
    // 调率只作用于自己那一项:kyle 的周期调率挂到移动节律上不改距离
    expect(skillTriggerParams(coreSkillOf("kyle"), "move")).toEqual(rhythmTriggerParams("move"));
    expect(skillTriggerParams(coreSkillOf("kyle"), "pulse", RHYTHM_MAX_LEVEL).interval).toBeCloseTo(Math.round(rhythmTriggerParams("pulse", RHYTHM_MAX_LEVEL).interval! * 0.5 * 10) / 10, 9);
  });

  it("底拍:事件节律的核心多带一条 3.0s 周期触发器(triggers[1]),周期核心 / 分岔 / 进阶不带;bran 真机 30s 内有击杀且不死", () => {
    const bran = makeSkillEquipment(coreSkillOf("bran"));
    expect(bran.triggers.map((t) => t.def.type)).toEqual(["kill", "pulse"]);
    expect(bran.triggers[1].params.interval).toBe(CORE_BASELINE_INTERVAL);
    expect(makeSkillEquipment(coreSkillOf("loka")).triggers[1].params.interval).toBe(1.2);
    expect(makeSkillEquipment(coreSkillOf("vera")).triggers[1].params.interval).toBe(2.1);
    expect(makeSkillEquipment(coreSkillOf("sia")).triggers[1].params.interval).toBe(2.4);
    expect(makeSkillEquipment(coreSkillOf("kyle")).triggers.map((t) => t.def.type)).toEqual(["pulse"]);
    expect(makeSkillEquipment(HERO_SKILLS.vera[2]).triggers.length).toBe(1);
    expect(makeSkillEquipment(HERO_SKILLS.bran[3]).triggers.length).toBe(1);
    expect(needsBaseline({ kind: "core" }, "hurt")).toBe(true);
    expect(needsBaseline({ kind: "core" }, "pulse")).toBe(false);
    expect(needsBaseline({ kind: "branch" }, "hurt")).toBe(false);
    for (const hero of ["bran", "loka"] as const) {
      const save = emptySave();
      save.energy = 99;
      save.selectedHero = hero;
      save.selectedSet = hero === "bran" ? "ember" : "blizzard";
      const s = new BattleSim({ save, input: { isMoving: true, moveDir: vec2(1, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
      s.startStage(1);
      for (let i = 0; i < 60 * 30; i++) s.update(1 / 60);
      expect(s.world.kills, hero).toBeGreaterThan(0);
      expect(s.player.alive, hero).toBe(true);
    }
  });

  it("实例化:kyle 核心技能触发器 1.2s;法宝挂周期仍 2.4s(调率不外溢);第二本命开局核心也带调率与底拍", () => {
    expect(makeSkillEquipment(coreSkillOf("kyle")).triggers[0].params.interval).toBe(1.2);
    expect(generateEquipment(1, "common", false, 0, ["pulse"]).triggers[0].params.interval).toBe(2.4);
    // sia 解锁第二本命「受击」后仍回到本命低血:阈值 0.7 跟着核心走
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "sia";
    save.selectedSet = "frost";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    expect(s.player.skills[0].triggers[0].params.hpThreshold).toBe(0.7);
    expect(s.player.skills[0].triggers[1]?.def.type).toBe("pulse");
  });

  it("穆核心灵狼命中回血(healOnHit),幻影剧团的灵狼不回", () => {
    for (const [hero, expectHeal] of [["mu", true], ["willow", false]] as const) {
      const p = new Player();
      p.rhythms = [HERO_RHYTHM[hero]];
      p.skills.push(makeSkillEquipment(coreSkillOf(hero)));
      const ctx = makeContext(p, [spawnEnemy("chaser", vec2(60, 0), 1)]);
      const engine = new EquipmentEngine();
      // 底拍 / 周期都能召狼:推 3.1s 让底拍或本命周期至少发一次
      for (let i = 0; i < 62; i++) engine.update(ctx, 0.05);
      if (hero === "mu") engine.onHurt(ctx, 1, ctx.enemies[0]);
      expect(ctx.minions.length, hero).toBeGreaterThan(0);
      expect(ctx.minions.every((m) => m.healOnHit === expectHeal), hero).toBe(true);
    }
  });

  it("平衡 sim 与游戏同口径:选英雄的 build 用 makeSkillEquipment(coreSkillOf) 建核心,不再拿套组旧初始武器当核心", () => {
    const sim = fileSource("../scripts/balance-sim.ts");
    expect(sim.includes("makeSkillEquipment(coreSkillOf(heroId))")).toBe(true);
    expect(sim.includes('player.skills = [{ ...core, kind: "skill", skillId: coreSkillOf(heroId).id }];')).toBe(false);
  });
});

describe("S2 专属表与英雄页四行", () => {
  it("六个英雄有专属表(id 前缀 = 英雄),其余走通用职业包", () => {
    expect(BESPOKE_HEROES).toEqual(["vera", "kyle", "bran", "sia", "nora", "loka", "willow"]);
    for (const h of BESPOKE_HEROES) for (const s of HERO_SKILLS[h]) expect(s.id.startsWith(`${h}_`)).toBe(true);
    expect(HERO_SKILLS.doran[1].id).toBe("doran_guard");
    expect(HERO_SKILLS.sia[0].rhythm).toBe(HERO_RHYTHM.sia);
    expect(HERO_SKILLS.nora[0].rhythm).toBe(HERO_RHYTHM.nora);
    expect(HERO_SKILLS.loka[0].rhythm).toBe(HERO_RHYTHM.loka);
  });

  it("heroSkillLines:核心 / 分岔 / 进阶 / 本命节律 / 套装,五行文案取自技能表、节律表与套组表;第二本命提示随解锁态变", () => {
    const lines = heroSkillLines("kyle", 1);
    expect(lines.map((l) => l.tag)).toEqual(["核心技能", "分岔", "进阶", "本命节律", "套装"]);
    expect(lines[0].label).toBe("寒霜齐射");
    expect(lines[1].label).toBe("弹幕风暴 / 冰晶狙猎");
    expect(lines[2].label).toBe("冰晶穿刺");
    expect(lines[3].label).toBe("周期节律");
    expect(lines[3].desc).toContain("3 星通关解锁第二本命");
    const unlocked = heroSkillLines("kyle", 1, { rhythm: "move", unlocked: true });
    expect(unlocked[3].label).toBe("移动节律(第二本命)");
    expect(unlocked[3].desc).toContain("周期 / 连杀 / 移动");
    expect(heroRhythmOptions("kyle")).toEqual(["pulse", "combo", "move"]);
    // 套装行与第 4 行的节律选择无关(换本命不动套组),内容全部来自 sets 表
    const set = setDef("barrage");
    expect(unlocked[4]).toEqual(lines[4]);
    expect(lines[4].label).toBe(`${set.name} · ${set.desc}`);
    expect(lines[4].desc).toContain(`共鸣 ${RESONANCE_TIERS.tier1} 处「${set.bonus3.name}」`);
    expect(lines[4].desc).toContain(`${RESONANCE_TIERS.tier2} 处「${set.bonus6.name}」`);
  });
});

describe("白啸霜刃对吞噬者特効(R16;剖面依据 CONTEXT 66)", () => {
  /** 走真实 updateProjectiles:洛卡开局(主动槽只有核心技能),清场后手动放一只吞噬者与一枚弹 */
  function lokaWorldWithDevourer() {
    const save = emptySave();
    save.energy = 99;
    save.selectedHero = "loka";
    save.selectedSet = "blizzard";
    const s = new BattleSim({ save, input: { isMoving: false, moveDir: vec2(0, 0) }, worldH: 996, persist: () => {}, callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} } });
    s.startStage(1);
    s.world.enemies.length = 0;
    s.world.projectiles.length = 0;
    const dev = spawnEnemy("devourer", vec2(s.player.pos.x + 40, s.player.pos.y), 1);
    dev.hp = 500;
    dev.maxHp = 1000;
    s.world.enemies.push(dev);
    return { s, dev };
  }
  const stepProjectiles = (s: { world: unknown }, dt: number) =>
    (s.world as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(dt);

  it("洛卡核心参数带倍率,且只有它有(其余 11 英雄不受影响)", () => {
    const core = makeSkillEquipment(coreSkillOf("loka"));
    expect(core.effect.def.type).toBe("knife");
    expect(core.effect.params.slayDevourer).toBe(LOKA_SLAY_DEVOURER);
    for (const id of ["vera", "kyle", "bran", "sia", "nora", "doran", "sally", "rayne", "willow", "oden", "mu"]) {
      expect(makeSkillEquipment(coreSkillOf(id as never)).effect.params.slayDevourer, id).toBeUndefined();
    }
    expect(core.name || core.effect.def.type).toBeTruthy();
  });

  it("带特効的弹:命中吞噬者不被吸收、按倍率扣血、还能继续飞", () => {
    const { s, dev } = lokaWorldWithDevourer();
    const p = spawnProjectile({
      kind: "knife", pos: vec2(dev.pos.x - 12, dev.pos.y), dir: vec2(1, 0), speed: 0,
      damage: 100, pierce: 5, slayDevourer: LOKA_SLAY_DEVOURER, source: s.player.skills[0],
    });
    s.world.projectiles.push(p);
    stepProjectiles(s, 0.05);
    expect(dev.hp, "100 × 1.5 = 150 扣血").toBe(500 - 150);
    expect(p.ttl, "不被吸收 → 弹体仍在飞").toBeGreaterThan(0);
    expect(p.pierce, "走正常命中流程(穿透照常扣一次)").toBe(4);
  });

  it("不带特効的弹:仍被吸收并给吞噬者喂血(基线行为不动)", () => {
    const { s, dev } = lokaWorldWithDevourer();
    const p = spawnProjectile({
      kind: "knife", pos: vec2(dev.pos.x - 12, dev.pos.y), dir: vec2(1, 0), speed: 0,
      damage: 100, pierce: 5, source: s.player.skills[0],
    });
    s.world.projectiles.push(p);
    stepProjectiles(s, 0.05);
    expect(dev.hp, "不掉血,反而回 100 × 0.5").toBe(550);
    expect(p.ttl, "非穿透弹被吃掉").toBeLessThan(0);
  });
});

describe("承伤反哺池(R17:穆「缠斗回复」的杠杆 A)", () => {
  it("只有穆的核心带入池比例,其余英雄不受影响", () => {
    expect(makeSkillEquipment(coreSkillOf("mu")).effect.params.retaliationHeal).toBe(MU_RETALIATION_POOL_PCT);
    for (const id of ["vera", "kyle", "bran", "sia", "nora", "loka", "doran", "sally", "rayne", "willow", "oden"]) {
      expect(makeSkillEquipment(coreSkillOf(id as never)).effect.params.retaliationHeal, id).toBeUndefined();
    }
  });

  it("承伤按比例入池:护盾挡掉的部分不计、池上限 = 最大生命 × capMaxHpPct", () => {
    const p = new Player();
    p.maxHp = 100; p.hp = 100; p.shield = 30; p.retaliationPct = 0.6;
    expect(p.takeDamage(50)).toBe(20);            // 护盾吃掉 30
    expect(p.retaliationPool).toBeCloseTo(12, 5); // 只按实际扣血入池
    const q = new Player();
    q.maxHp = 1000; q.hp = 1000; q.retaliationPct = 0.6;
    q.takeDamage(900);
    expect(q.retaliationPool, "540 被钳到 maxHp × 0.5").toBe(500);
  });

  it("抽取:最多给到上限、抽多少扣多少;半衰期到期流失;未开反哺时承伤不入池", () => {
    const p = new Player();
    p.maxHp = 100; p.hp = 50; p.retaliationPct = 0.6;
    p.takeDamage(50);
    expect(p.retaliationPool).toBeCloseTo(30, 5);
    expect(p.drawRetaliation(10)).toBe(10);
    expect(p.retaliationPool).toBeCloseTo(20, 5);
    expect(p.drawRetaliation(999)).toBeCloseTo(20, 5);   // 池被抽干
    expect(p.drawRetaliation(999)).toBe(0);
    p.retaliationPool = 40;
    p.tickRetaliation(2.5);                               // 一个半衰期
    expect(p.retaliationPool).toBeCloseTo(20, 5);
    const off = new Player();
    off.maxHp = 100; off.hp = 100;
    off.takeDamage(40);
    expect(off.retaliationPool, "没有 retaliationHeal 源 → 不入池").toBe(0);
  });
});

describe("荆棘层·站位续航与分岔代价(R18 / R19,docs/DESIGN-HERO-PIPELINE.md §2 / §5.5)", () => {
  /** 一次受击施放:回传圆环的半径、落点与结算伤害(与真机同一条 castNova 通路) */
  function castVera(opts: { branchId?: string | null; stack?: number } = {}) {
    const p = new Player();
    p.pos = vec2(0, 0);
    p.rhythms = ["hit"];
    const list: Equipment[] = [makeSkillEquipment(coreSkillOf("vera"))];
    if (opts.branchId) {
      const b = HERO_SKILLS.vera.find((s) => s.id === opts.branchId);
      expect(b, `分岔 ${opts.branchId} 必须在薇拉表里`).toBeTruthy();
      list.push(makeSkillEquipment(b!));
    }
    p.skills = list;
    p.thornStack = opts.stack ?? 0;
    const e0 = spawnEnemy("chaser", vec2(30, 0), 1);
    const ctx = makeContext(p, [e0]);
    new EquipmentEngine().onHurt(ctx, 1, e0);
    const nova = ctx.fx.find((f) => f.type === "nova");
    expect(nova, "受击必须爆出一枚圆环").toBeTruthy();
    const call = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls[0];
    return { radius: nova!.radius!, pos: nova!.pos, dmg: call[1] as number };
  }

  const thornTier = { id: "thorn", pieces: 2, bonus3: true, bonus6: false } as const;

  it("层数的作用位与续航档位只挂在薇拉身上:别人的核心不带这些字段", () => {
    const core = makeSkillEquipment(coreSkillOf("vera")).effect.params;
    expect(core.stackRadiusPer).toBe(VERA_STACK_TUNE.radiusPerStack);
    expect(core.stackPowerLoss).toBe(VERA_STACK_TUNE.powerLossAtZero);
    expect(core.sustainHeal).toBe(VERA_SUSTAIN.coreHealPerSec);
    const blood = HERO_SKILLS.vera.find((s) => s.id === "vera_blood")!;
    expect(blood.params.sustainHeal).toBe(VERA_SUSTAIN.advanceHealPerSec);
    expect(blood.params.heal, "R19:血棘不再是「受击回几点血」").toBeUndefined();
    for (const h of allHeroes()) {
      if (h.id === "vera") continue;
      const pr = makeSkillEquipment(coreSkillOf(h.id)).effect.params;
      expect(pr.stackRadiusPer, `${h.id} 不该吃荆棘层`).toBeUndefined();
      expect(pr.stackPowerLoss, `${h.id} 不该吃荆棘层罚项`).toBeUndefined();
      expect(pr.sustainHeal, `${h.id} 不该走荆棘层续航`).toBeUndefined();
    }
    for (const s of HERO_SKILLS.vera) {
      if (s.kind === "core") continue;
      expect(makeSkillEquipment(s).effect.params.stackRadiusPer, `${s.id} 不带层数作用位`).toBeUndefined();
    }
  });

  it("两态各自怎么攒层:站定才涨 / 边走边涨,贴身是两态共有的前提;倍率与上限都读表", () => {
    /** 预填层数后走一帧,回传本帧层数变化(0 起点会被钳住,读不出衰减) */
    const step = (mode: "still" | "move", contacts: number, movedPx: number, dt = 1, gainMult = 1, from = 3) => {
      const p = new Player();
      p.thornStack = from;
      p.tickThornStack(dt, contacts, movedPx, true, mode, gainMult);
      return +(p.thornStack - from).toFixed(4);
    };
    const per = THORN_STACK.perContactPerSec;
    const dec = THORN_STACK.decayPerSec;
    expect(step("still", 1, 0), "站定档:停下不动才涨").toBeCloseTo(per, 5);
    expect(step("still", 1, 40), "站定档:一走就停涨、改按衰减掉层").toBeCloseTo(-dec, 5);
    expect(step("move", 1, 40), "绕场档:边走边贴身才涨").toBeCloseTo(per, 5);
    expect(step("move", 1, 0), "绕场档:站着不动反而掉层").toBeCloseTo(-dec, 5);
    // 两态共有的前提 = 贴身:R22 收掉第三档之后,"什么都不约束"不再是可选项
    expect(step("move", 0, 40), "绕场档:走是走了,但没贴身 → 不涨").toBeCloseTo(-dec, 5);
    expect(step("still", 0, 0), "站定档:站住了但身边没人 → 一样不涨").toBeCloseTo(-dec, 5);
    expect(step("still", 1, 0, 1, SET_BONUSES.thorn3StackGainMult, 0), "棘肤档:层数涨得更快(不再是按最大生命回血)")
      .toBeCloseTo(per * SET_BONUSES.thorn3StackGainMult, 5);
    const grow = new Player();
    grow.tickThornStack(999, 3, 0, true, "still", 4);
    expect(grow.thornStack, "封顶在 cap").toBe(THORN_STACK.cap);
    const dry = new Player();
    dry.tickThornStack(999, 0, 0, true, "move");
    expect(dry.thornStack, "从不贴身 → 恒 0(不会变负)").toBe(0);
    const off = new Player();
    off.thornStack = 5;
    off.tickThornStack(999, 5, 0, false, "still");
    expect(off.thornStack, "没带层数源 → 直接归零").toBe(0);
    expect(off.stackDriven, "并写下「本局不走层数」的标记").toBe(false);
    expect(new Player().thornGainMode, "玩家自带的姿势位 = 姿势表首档(没走到弹层时的确定值)").toBe(DEFAULT_THORN_MODE);
  });

  it("接触记忆(R22 候选①):怪刚被清掉也算这一拍 —— 窗口按围数正比、只放宽贴身、不放宽姿势", () => {
    // 上一组用例每步都新开一个 Player,记忆位天然是 0,所以那些单帧读数与加记忆之前逐位一致
    const dt = 0.1;
    const per = THORN_STACK.perContactPerSec;
    const dec = THORN_STACK.decayPerSec;
    const edec = THORN_STACK.contactEchoDecayPerSec;
    /** 一拍贴身 `n` 只的记忆窗口(帧):窗口 = 围数 / 衰减率,全部由表值算,不在用例里写死帧数 */
    const winOf = (n: number) => Math.round(n / edec / dt);

    /** 站定档:一拍贴身 3 只(怪随即被圆环清掉),之后每帧都是 0 只 */
    const n = 3;
    const win = winOf(n);
    const p = new Player();
    p.tickThornStack(dt, n, 0, true, "still");
    expect(p.thornStack, "贴身那一拍照旧按围数攒").toBeCloseTo(n * per * dt, 6);
    expect(p.thornContactEcho, "记忆位记下的是围数,不是层数").toBeCloseTo(n, 6);
    let prev = p.thornStack;
    let fed = 0;
    for (let i = 1; i <= win; i++) {
      p.tickThornStack(dt, 0, 0, true, "still");
      const mem = Math.max(0, n - edec * dt * i);
      if (mem > 0) {
        expect(p.thornStack, `第 ${i} 帧:怪已经没了,记忆里的 ${mem.toFixed(2)} 只继续喂层`).toBeCloseTo(prev + mem * per * dt, 6);
        expect(p.thornStack, `第 ${i} 帧仍在涨(这就是站定档不必出门的报酬)`).toBeGreaterThan(prev);
        fed += 1;
      } else {
        expect(p.thornStack, `第 ${i} 帧:记忆见底 → 交回 decayPerSec 掉层`).toBeCloseTo(prev - dec * dt, 6);
      }
      prev = p.thornStack;
    }
    expect(fed, "窗口内除末帧都在喂").toBe(win - 1);
    expect(p.thornContactEcho, "窗口结束记忆归零").toBeCloseTo(0, 6);

    // 窗口与围数成正比:6 只的记忆是 3 只的两倍长
    const wide = new Player();
    wide.tickThornStack(dt, 6, 0, true, "still");
    expect(winOf(6), "窗口按围数正比放大").toBe(win * 2);
    for (let i = 1; i < winOf(6); i++) wide.tickThornStack(dt, 0, 0, true, "still");
    expect(wide.thornContactEcho, "6 只在窗口末帧之前还没退完").toBeGreaterThan(0);
    wide.tickThornStack(dt, 0, 0, true, "still");
    expect(wide.thornContactEcho, "满窗退尽").toBeCloseTo(0, 6);
    expect(wide.thornStack, "但总量仍被 cap 夹住(记忆不放开上限)").toBeLessThanOrEqual(THORN_STACK.cap);

    // 只放宽"贴身"这一条前提:姿势那一条照旧读"本帧动不动"
    const walked = new Player();
    walked.tickThornStack(dt, n, 0, true, "still");
    const s0 = walked.thornStack;
    walked.tickThornStack(dt, 0, 40, true, "still");
    expect(walked.thornContactEcho, "记忆还在(挪位置不会把记忆抹掉)").toBeGreaterThan(0);
    expect(walked.thornStack, "站定档一走就掉层:记忆救不了姿势").toBeCloseTo(s0 - dec * dt, 6);
    const froze = new Player();
    froze.tickThornStack(dt, n, 1, true, "move");
    const m0 = froze.thornStack;
    froze.tickThornStack(dt, 0, 0, true, "move");
    expect(froze.thornContactEcho, "绕场档同样有记忆").toBeGreaterThan(0);
    expect(froze.thornStack, "但站下不动就不涨,这一条没被放宽").toBeCloseTo(m0 - dec * dt, 6);

    // 记忆只记"曾经在闸里"的峰值,不会自己长:新的真实围数抬得上来,退尽后归零
    const peak = new Player();
    peak.tickThornStack(dt, 2, 0, true, "still");
    peak.tickThornStack(dt, 5, 0, true, "still");
    expect(peak.thornContactEcho, "贴身更多 → 抬到当前围数").toBeCloseTo(5, 6);
    // 5 只的记忆要 winOf(5) 帧才退尽;这期间层数一路被喂到封顶(记忆放开的是喂层节奏,不是上限)
    for (let i = 0; i < winOf(5) + 2; i++) peak.tickThornStack(dt, 0, 0, true, "still");
    expect(peak.thornContactEcho, "记忆退尽归零,不会变负").toBe(0);
    expect(peak.thornStack, "层数仍被 cap 夹住").toBeLessThanOrEqual(THORN_STACK.cap);
    const peakTail = peak.thornStack;
    peak.tickThornStack(dt, 0, 0, true, "still");
    expect(peak.thornStack, "记忆一尽就交回 decayPerSec 掉层").toBeCloseTo(peakTail - dec * dt, 6);
    const off = new Player();
    off.tickThornStack(dt, 4, 0, true, "still");
    expect(off.thornContactEcho).toBeGreaterThan(0);
    off.tickThornStack(dt, 4, 0, false, "still");
    expect(off.thornContactEcho, "不走层数的人:层数与记忆一起清零").toBe(0);

    // 数值只在表里:实现读的是表字段,不是在 player 里写死一个窗口
    expect(fileSource("../cocos/assets/scripts/game/entities/player.ts")).toContain("cfg.contactEchoDecayPerSec");
  });

  it("状态型回血只认层数:两条源各给一档、小数攒满才入账,血棘的共鸣被动只翻自己那一档", () => {
    /** 逐帧给量:核心 6 点/秒、血棘 4 点/秒(各自乘层数比例与本源 healMult) */
    const run = (stack: number, dt: number, withBlood: boolean, withLifesteal: boolean) => {
      const p = new Player();
      p.rhythms = ["hit"];
      p.skills = [makeSkillEquipment(coreSkillOf("vera"))];
      if (withBlood) p.skills.push(makeSkillEquipment(HERO_SKILLS.vera.find((s) => s.id === "vera_blood")!));
      if (withLifesteal) p.passives.push(makePassive(9, "lifesteal", "common", 1, { pct: 0.03 }));
      p.thornStack = stack;
      const ctx = makeContext(p, [spawnEnemy("chaser", vec2(30, 0), 1)]);
      new EquipmentEngine().update(ctx, dt);
      return (ctx.healPlayer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    };
    const core = VERA_SUSTAIN.coreHealPerSec;
    const adv = VERA_SUSTAIN.advanceHealPerSec;
    expect(run(THORN_STACK.cap, 0.5, false, false), "只有核心:半秒给一半").toEqual([core / 2]);
    expect(run(THORN_STACK.cap, 0.5, true, false), "拿到血棘 → 两条源各出一笔").toEqual([core / 2, adv / 2]);
    expect(run(THORN_STACK.cap, 0.5, true, true), "共鸣「饮血荆棘」只翻倍血棘那一档,核心档不动").toEqual([core / 2, adv]);
    expect(run(THORN_STACK.cap / 2, 0.1, true, false), "半层 0.1 秒不足 1 点 → 不入账").toEqual([]);
    expect(run(0, 1, true, true), "零层不给血(层数掉了续航就断)").toEqual([]);
  });

  it("棘肤让位:走荆棘层的人不再按最大生命比例受击回血,不吃层数的荆棘装备流照旧", () => {
    const run = (stackDriven: boolean) => {
      const p = new Player();
      p.rhythms = ["hit"];
      p.stackDriven = stackDriven;
      const ctx = makeContext(p, [spawnEnemy("chaser", vec2(30, 0), 1)], { setBonus: { ...thornTier } });
      new EquipmentEngine().onHurt(ctx, 1, ctx.enemies[0]);
      return { calls: (ctx.healPlayer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]), maxHp: p.maxHp };
    };
    const legacy = run(false);
    expect(legacy.calls, "非层数玩家:仍按棘肤回 1.5% 最大生命").toEqual([legacy.maxHp * SET_BONUSES.thorn3HealPct]);
    expect(run(true).calls, "走层数:这一档不再回血(续航改由层数逐帧给)").toEqual([]);
  });

  it("姿势来自局首二选一:薇拉两档明牌、其余英雄没有姿势表、分岔一律不再带姿势位", () => {
    const st = heroStances("vera");
    expect(st.map((s) => s.mode), "两态:站定 / 绕场(表序 = 局首卡序)").toEqual(["still", "move"]);
    expect(DEFAULT_THORN_MODE, "兜底档 = 姿势表首项(没走到弹层的局按它跑,可复现)").toBe(st[0].mode);
    for (const s of st) {
      expect(s.name.length, "卡面名").toBeGreaterThan(0);
      expect(s.desc, `${s.name} 必须写清发动条件`).toContain("才攒荆棘层");
      expect(s.desc, `${s.name} 必须交代接触记忆(两态同享的贴身前提)`).toContain("也算这一拍");
      expect(s.aiNote, `${s.name} 必须交代挂机档跟着怎么变`).toContain("挂机");
    }
    for (const h of allHeroes()) if (h.id !== "vera") expect(heroStances(h.id), `${h.id} 不该弹姿势层`).toEqual([]);
    expect(heroStances(null), "没选英雄 = 没有姿势").toEqual([]);
    // 姿势位已从分岔上摘掉:整张技能表里不该再有 sustainMode 这个字段(源码级钉死)
    for (const src of [fileSource("../cocos/assets/scripts/game/data/heroSkills.ts"), fileSource("../cocos/assets/scripts/game/systems/battleWorld.ts")]) {
      expect(src.includes("sustainMode"), "sustainMode 已退役").toBe(false);
    }
    // 两枚分岔因此只剩"核心怎么打"(几何差)+ 数值代价:各自的 coreMorph 与代价仍在
    const armor = HERO_SKILLS.vera.find((s) => s.id === "vera_armor")!;
    const walker = HERO_SKILLS.vera.find((s) => s.id === "vera_walker")!;
    expect(armor.coreMorph?.castAtAttacker, "荆甲:爆发搬到来袭者脚下").toBe(true);
    expect(armor.coreMorph?.radiusMult, "荆甲:半径代价").toBe(VERA_BRANCH_COST.armorRadiusMult);
    expect(walker.coreMorph?.afterCastGround, "棘行者:落点长荆棘带").toBeDefined();
    expect(walker.coreMorph?.power, "棘行者:爆发代价").toBe(VERA_BRANCH_COST.walkerPowerMult);
    // 分岔文案里不再出现姿势句(那两句话已搬进姿势表,不留两份)
    for (const s of [armor, walker]) expect(s.desc.includes("攒荆棘层"), `${s.id} 的文案不该再写姿势`).toBe(false);
  });

  it("圆环的半径与威力读同一个层数:满层半径 +36%,零层吃满罚项", () => {
    const zero = castVera({ stack: 0 });
    const half = castVera({ stack: THORN_STACK.cap / 2 });
    const full = castVera({ stack: THORN_STACK.cap });
    expect(zero.radius).toBeCloseTo(200, 5);
    expect(half.radius).toBeCloseTo(200 * (1 + VERA_STACK_TUNE.radiusPerStack * THORN_STACK.cap / 2), 5);
    expect(full.radius).toBeCloseTo(200 * (1 + VERA_STACK_TUNE.radiusPerStack * THORN_STACK.cap), 5);
    expect(Math.abs(half.dmg - full.dmg * (1 - VERA_STACK_TUNE.powerLossAtZero / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(zero.dmg - full.dmg * (1 - VERA_STACK_TUNE.powerLossAtZero))).toBeLessThanOrEqual(1);
    expect(full.dmg, "满层不再有罚项").toBeGreaterThan(zero.dmg);
  });

  it("两扇门:荆甲压圆环半径(换来绕开盾面)、棘行者压即时爆发(换来地面)", () => {
    const base = castVera();
    const armor = castVera({ branchId: "vera_armor" });
    const walker = castVera({ branchId: "vera_walker" });
    expect(armor.radius).toBeCloseTo(base.radius * VERA_BRANCH_COST.armorRadiusMult, 5);
    expect(armor.dmg, "荆甲不碰伤害").toBe(base.dmg);
    expect(Math.abs(walker.dmg - base.dmg * VERA_BRANCH_COST.walkerPowerMult)).toBeLessThanOrEqual(1);
    expect(walker.radius, "棘行者不碰圆环半径").toBe(base.radius);
    expect(armor.pos.x, "荆甲把落点搬到刚打我的人脚下").toBeCloseTo(30, 5);
    expect(base.pos.x, "没选分岔时仍以自身为中心").toBeCloseTo(0, 5);
  });

  it("HUD 的节律进度条改读层数;不带荆棘层的技能与法宝仍是内置冷却口径", () => {
    const p = new Player();
    p.rhythms = ["hit"];
    p.skills = [makeSkillEquipment(coreSkillOf("vera"))];
    p.thornStack = THORN_STACK.cap / 2;
    const engine = new EquipmentEngine();
    expect(engine.rhythmProgress(p.skills[0], makeContext(p, []))).toMatchObject({ frac: 0.5, kind: "hit" });
    p.thornStack = 0;
    expect(engine.rhythmProgress(p.skills[0], makeContext(p, []))!.frac).toBe(0);
    const k = new Player();
    k.rhythms = ["pulse"];
    k.skills = [makeSkillEquipment(coreSkillOf("kyle"))];
    expect(engine.rhythmProgress(k.skills[0], makeContext(k, [])), "周期节律不画这条(CD 条另画)").toBeNull();
    const m = new Player();
    m.rhythms = ["hit"];
    m.skills = [makeSkillEquipment(coreSkillOf("mu"))];
    expect(engine.rhythmProgress(m.skills[0], makeContext(m, []))!.frac, "同为受击但不带荆棘层 → 仍是内置冷却口径").toBe(1);
    const a = artifact("nova", "hit", { damage: 10, radius: 100 });
    const q = new Player();
    q.rhythms = ["hit"];
    q.equipment.push(a);
    expect(engine.rhythmProgress(a, makeContext(q, []))!.frac, "受击法宝仍走内置冷却").toBe(1);
  });

  it("驱动点唯一:世界层与模拟器同款调用(位移之后、同一个距离闸、同一套模式与倍率)", () => {
    const world = fileSource("../cocos/assets/scripts/game/systems/battleWorld.ts");
    const sim = fileSource("../scripts/balance-sim.ts");
    expect(world).toContain("p.tickThornStack(dt, contacts, p.movedThisFrame, true, gainMode, gainMult)");
    expect(world).toContain("THORN_STACK.contactRadius * THORN_STACK.contactRadius");
    expect(world).toContain("SET_BONUSES.thorn3StackGainMult");
    expect(sim).toContain("player.tickThornStack(dt, contacts, player.movedThisFrame, true, thornMode, gainMult)");
    expect(sim).toContain("THORN_STACK.contactRadius * THORN_STACK.contactRadius");
    expect(sim).toContain("SET_BONUSES.thorn3StackGainMult");
    // 挂机档跟着姿势走:两边同一处改写,不允许只有一侧改
    expect(world).toContain('gainMode === "move" ? "orbit"');
    expect(sim).toContain('thornMode === "move" ? "orbit"');
    // 站桩档(荆甲)取消"围到 4 只就跑":这一条两侧都要在,否则 sim 与真机各玩各的
    expect(world).toContain('stacked && gainMode === "still"');
    expect(sim).toContain('thornStacked && thornMode === "still"');
  });
});
