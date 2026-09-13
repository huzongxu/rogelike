/**
 * 武器套组单元测试(需求优化 v2:每赛季 3 套,套组专属卡池 + 2/4 件套联动)。
 * 覆盖:效果归属分区 / 件数计数 / 档位激活 / 套组专属卡生成 / 敌情轮转 / 套组加成落地。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player } from "@game/entities/player";
import { spawnEnemy } from "@game/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "@game/systems/equipmentEngine";
import { makeTrigger, makeEffect, type EffectType } from "@game/data/affixes";
import { generateSetEquipment, GENERIC_EFFECT_TYPES, type Equipment } from "@game/data/equipmentGen";
import { ARTIFACT_DEFS } from "@game/data/artifacts";
import type { RhythmId } from "@game/data/rhythm";
import { SETS, setDef, setOfEffect, setsOfEffect, allSets, seasonNewSets, setReleaseSeason, isSetPiece, setPieces, setBonusState, releasedSets, type SetId } from "@game/data/sets";
import { chapterIntel } from "@game/data/intel";
import { EFFECTS } from "@game/data/affixes";
import { vec2 } from "@game/core/math";

function makeContext(player: Player, setBonus?: Parameters<typeof setBonusState>[1]): BattleContext & { fx: Fx[]; heal: ReturnType<typeof vi.fn> } {
  const fx: Fx[] = [];
  const heal = vi.fn();
  return {
    player,
    enemies: [],
    projectiles: [],
    clouds: [],
    minions: [],
    setBonus: setBonus ? setBonusState(player.equipment, setBonus) : undefined,
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

describe("套组定义与效果归属", () => {
  it("12 套武器套组(4 季 × 3),每套有 3/6 件套加成", () => {
    expect(SETS).toHaveLength(3); // 常驻三套(S1 视作首发)
    const all = allSets();
    expect(all).toHaveLength(12);
    for (const s of all) {
      expect(s.bonus3.name.length, s.id).toBeGreaterThan(0);
      expect(s.bonus6.name.length, s.id).toBeGreaterThan(0);
      expect(s.effects.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });
  it("每季 3 个专属套组:S1 常驻 + S2/S3/S4 各 3 新套", () => {
    expect(seasonNewSets(1).sort()).toEqual(["barrage", "ember", "thorn"]);
    expect(seasonNewSets(2).sort()).toEqual(["blizzard", "frost", "glacier"]);
    expect(seasonNewSets(3).sort()).toEqual(["cinderfang", "magma", "plague"]);
    expect(seasonNewSets(4).sort()).toEqual(["phantom", "requiem", "veil"]);
    expect(seasonNewSets(5)).toEqual([]); // 四季循环,无第 5 季新内容
    expect(allSets().every((s) => setReleaseSeason(s.id) >= 1 && setReleaseSeason(s.id) <= 4)).toBe(true);
  });
  it("14 种效果各恰被 2 个套组认领(多对一归属,共 28 条链接)", () => {
    expect(EFFECTS).toHaveLength(14);
    let links = 0;
    for (const e of EFFECTS) {
      const owners = setsOfEffect(e.type);
      expect(owners.length, `${e.type} 认领套数`).toBe(2);
      expect(new Set(owners).size, `${e.type} 认领套不重复`).toBe(2);
      for (const id of owners) expect(setDef(id).effects.includes(e.type)).toBe(true);
      links += owners.length;
    }
    expect(links).toBe(28);
    expect(setOfEffect("knife"), "首个认领套 = 展示/兜底用").not.toBeNull();
    expect(setsOfEffect("nonexistent" as EffectType)).toEqual([]);
  });
  it("S2 赛季套组「极北冰脉」:发布门控与归属正确(DESIGN-SEASON-SETS L3)", () => {
    const frost = setDef("frost");
    expect(frost.effects.sort()).toEqual(["frost_ring", "icelance"]);
    expect(frost.releaseSeason).toBe(2);
    // 发布门控:S1 不出,S2 起永久可选
    expect(releasedSets(1).map((s) => s.id)).toEqual(["thorn", "barrage", "ember"]);
    expect(releasedSets(2).map((s) => s.id)).toContain("frost");
    expect(releasedSets(5).length).toBe(12); // 发布后永久保留(四季 12 套)
    // 赛季套组的卡也全部归属本套;触发器 = 所挂节律(共鸣表),修饰器层已升格为被动法宝
    for (let i = 0; i < 40; i++) {
      const eq = generateSetEquipment("frost", 5);
      expect(isSetPiece(eq, "frost")).toBe(true);
      for (const t of eq.triggers) expect(ARTIFACT_DEFS[eq.effect.def.type].resonance.includes(t.def.type as RhythmId)).toBe(true);
      expect(eq.modifiers).toHaveLength(0);
    }
  });
  it("效果不在本套时不计件", () => {
    const eq = makeEquipment("knife");
    expect(setPieces([eq], "thorn")).toBe(0);
    expect(setPieces([eq], "barrage")).toBe(1);
  });
});

describe("件数与档位", () => {
  it("0-2 件无加成,3-5 件仅 3 件套,6 件起双档", () => {
    const set: SetId = "ember";
    const mk = (n: number): Equipment[] => Array.from({ length: n }, (_, i) => makeEquipment("nova", i + 100));
    expect(setBonusState(mk(0), set)).toMatchObject({ pieces: 0, bonus3: false, bonus6: false });
    expect(setBonusState(mk(2), set)).toMatchObject({ pieces: 2, bonus3: false, bonus6: false });
    expect(setBonusState(mk(3), set)).toMatchObject({ pieces: 3, bonus3: true, bonus6: false });
    expect(setBonusState(mk(5), set)).toMatchObject({ pieces: 5, bonus3: true, bonus6: false });
    expect(setBonusState(mk(6), set)).toMatchObject({ pieces: 6, bonus3: true, bonus6: true });
  });
  it("null 套组 = 无加成", () => {
    expect(setBonusState([], null)).toBeNull();
  });
  it("混装只按效果类型计数(荆棘套算护盾/汲取,弹幕套算飞刀/射线)", () => {
    const list = [makeEquipment("drain"), makeEquipment("shield"), makeEquipment("knife")];
    expect(setPieces(list, "thorn")).toBe(2);
    expect(setPieces(list, "barrage")).toBe(1);
    expect(setPieces(list, "ember")).toBe(0);
  });
});

describe("套组专属卡池(generateSetEquipment)", () => {
  it("效果来自本套定义(全部 12 套);触发器 = 所挂节律,给了已解锁节律就只落在其中", () => {
    for (const setId of allSets().map((s) => s.id)) {
      for (let i = 0; i < 40; i++) {
        const eq = generateSetEquipment(setId, 5, 0, undefined, ["kill", "move"]);
        expect(isSetPiece(eq, setId), `${eq.name} 效果应属于 ${setId}`).toBe(true);
        expect(eq.kind).toBe("active");
        for (const t of eq.triggers) {
          expect(["kill", "move"].includes(t.def.type), `${t.def.name} 应是已解锁节律之一`).toBe(true);
        }
        expect(eq.modifiers, "修饰器层已升格为全局被动法宝").toHaveLength(0);
      }
    }
  });
  it("通用卡池可达性:仅专属效果池的三套(极北/熔核/亡影)靠本套卡池成型,其余每套至少含 1 个通用池效果", () => {
    // 三套元老赛季套组效果完全专属(已知设计),它们的件只能从套组卡池刷出
    const exclusivePool: SetId[] = ["frost", "magma", "phantom"];
    for (const s of allSets()) {
      const shared = s.effects.filter((e) => GENERIC_EFFECT_TYPES.includes(e));
      if (exclusivePool.includes(s.id)) {
        expect(shared, `${s.id} 应为纯专属效果池`).toHaveLength(0);
        continue;
      }
      expect(shared.length, `${s.id} 无通用池效果,3 件档不可达`).toBeGreaterThanOrEqual(1);
    }
  });
  it("荆棘套生成护盾/汲取效果,弹幕套生成飞刀/射线效果", () => {
    const seenThorn = new Set<string>();
    const seenBarrage = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seenThorn.add(generateSetEquipment("thorn", 5).effect.def.type);
      seenBarrage.add(generateSetEquipment("barrage", 5).effect.def.type);
    }
    expect([...seenThorn].sort()).toEqual(["drain", "shield"]);
    expect([...seenBarrage].sort()).toEqual(["knife", "ray"]);
  });
  it("共享效果的卡片同时计入两个认领套(多对一不失控:同一份装备只算一个套组的件)", () => {
    // ray 被 barrage(弹幕)与 glacier(冰川界碑)共同认领
    const ray = makeEquipment("ray");
    expect(isSetPiece(ray, "barrage")).toBe(true);
    expect(isSetPiece(ray, "glacier")).toBe(true);
    expect(setPieces([ray, ray], "barrage")).toBe(2);
    expect(setPieces([ray, ray], "glacier")).toBe(2);
    // 一套装备同时是两套的件,但战斗里只有玩家选定的那个套组会激活加成
    const both = setBonusState([makeEquipment("ray"), makeEquipment("ray"), makeEquipment("ray")], "glacier");
    expect(both?.pieces).toBe(3);
    expect(both?.bonus3).toBe(true);
    expect(both?.bonus6).toBe(false);
  });
});

describe("章节敌情(chapterIntel)", () => {
  it("同章节确定性一致,4 类轮转", () => {
    const a = chapterIntel(3);
    const b = chapterIntel(3);
    expect(a.title).toBe(b.title);
    expect(chapterIntel(1).title).not.toBe(chapterIntel(2).title);
    // 轮转周期 4
    expect(chapterIntel(5).title).toBe(chapterIntel(1).title);
  });
  it("推荐套组与 prefer 敌种均合法", () => {
    for (let ch = 1; ch <= 20; ch++) {
      const i = chapterIntel(ch);
      expect(["尸潮", "重甲", "异变", "精英"].includes(i.title)).toBe(true);
      if (i.recommended) expect(SETS.some((s) => s.id === i.recommended)).toBe(true);
    }
  });
});

describe("套组加成落地(EquipmentEngine)", () => {
  it("弹幕套 3 件「齐射」:飞刀弹幕 +1", () => {
    const eq = makeEquipment("knife", 1, { spread: 1 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, makeEquipment("ray", 2), makeEquipment("knife", 3)]; // 3 件 = knife + ray
    const ctx = makeContext(player, "barrage");
    ctx.enemies = [spawnEnemy("chaser", vec2(50, 50), 1)];
    // 触发 1 次脉冲:基础 spread 1 + 齐射 1 = 2 发
    engine.update(ctx, 0.35);
    expect(ctx.projectiles.length).toBe(2);
  });
  it("荆棘套 3 件「棘肤」:受击回血 1.5% 最大生命,0.5 秒冷却", () => {
    const eq = makeEquipment("drain", 1);
    player.equipment = [eq, makeEquipment("shield", 2), makeEquipment("shield", 3)];
    player.hp = 50;
    const ctx = makeContext(player, "thorn");
    engine.update(ctx, 0.01); // 递减冷却
    engine.onHurt(ctx);
    engine.onHurt(ctx); // 冷却内第二次受击不重复回血
    expect(ctx.heal).toHaveBeenCalledTimes(1);
    expect(ctx.heal.mock.calls[0][0]).toBeCloseTo(player.maxHp * 0.015);
  });
  it("余烬套 3 件「余烬扩散」:毒云范围 +18%", () => {
    const eq = makeEquipment("cloud", 1, { radius: 100 });
    eq.triggers = [makeTrigger("pulse", { interval: 0.3 })];
    player.equipment = [eq, makeEquipment("nova", 2), makeEquipment("cloud", 3)];
    const ctx = makeContext(player, "ember");
    ctx.enemies = [spawnEnemy("chaser", vec2(100, 100), 1)];
    engine.update(ctx, 0.35);
    expect(ctx.clouds.length).toBe(1);
    expect(ctx.clouds[0].radius).toBeCloseTo(118);
  });
});

/** 构造最小装备(默认普通品质) */
function makeEquipment(effect: EffectType, id = 1, params: Record<string, number> = {}): Equipment {
  return {
    id,
    level: 1,
    quality: "common",
    name: effect,
    triggers: [makeTrigger("pulse", { interval: 2 })],
    effect: makeEffect(effect, { damage: 10, ...params }, 1),
    modifiers: [],
  };
}
