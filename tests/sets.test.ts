/**
 * 武器套组单元测试(需求优化 v2:每赛季 3 套,套组专属卡池 + 2/4 件套联动)。
 * 覆盖:效果归属分区 / 件数计数 / 档位激活 / 套组专属卡生成 / 敌情轮转 / 套组加成落地。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player } from "../src/entities/player";
import { spawnEnemy } from "../src/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "../src/systems/equipmentEngine";
import { makeTrigger, makeEffect, type EffectType } from "../src/data/affixes";
import { generateSetEquipment, type Equipment } from "../src/data/equipmentGen";
import { SETS, setDef, setOfEffect, setPieces, setBonusState, releasedSets, type SetId } from "../src/data/sets";
import { chapterIntel } from "../src/data/intel";
import { EFFECTS } from "../src/data/affixes";
import { vec2 } from "../src/core/math";

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
  it("3 套常驻武器套组,每套有 3/6 件套加成", () => {
    expect(SETS).toHaveLength(3);
    for (const s of SETS) {
      expect(s.bonus3.name.length).toBeGreaterThan(0);
      expect(s.bonus6.name.length).toBeGreaterThan(0);
    }
  });
  it("14 种效果恰好各归属一套(无重叠无遗漏;S2/S3/S4 各 2 新效果)", () => {
    const seen = new Set<EffectType>();
    for (const e of EFFECTS) {
      const s = setOfEffect(e.type);
      expect(s, `${e.type} 应归属某套`).not.toBeNull();
      expect(seen.has(e.type)).toBe(false);
      seen.add(e.type);
    }
    expect(seen.size).toBe(14);
  });
  it("S2 赛季套组「极北冰脉」:发布门控与归属正确(DESIGN-SEASON-SETS L3)", () => {
    const frost = setDef("frost");
    expect(frost.effects.sort()).toEqual(["frost_ring", "icelance"]);
    expect(frost.releaseSeason).toBe(2);
    // 发布门控:S1 不出,S2 起永久可选
    expect(releasedSets(1).map((s) => s.id)).toEqual(["thorn", "barrage", "ember"]);
    expect(releasedSets(2).map((s) => s.id)).toContain("frost");
    expect(releasedSets(5).length).toBe(6); // 发布后永久保留(frost + magma + phantom)
    // 赛季套组的卡也全部归属本套
    for (let i = 0; i < 40; i++) {
      const eq = generateSetEquipment("frost", 5);
      expect(setOfEffect(eq.effect.def.type)).toBe("frost");
      for (const t of eq.triggers) expect(frost.triggers.includes(t.def.type)).toBe(true);
      for (const m of eq.modifiers) expect(frost.modifiers.includes(m.def.type)).toBe(true);
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
  it("效果/触发器/修饰器都来自本套定义", () => {
    for (const setId of SETS.map((s) => s.id)) {
      for (let i = 0; i < 40; i++) {
        const eq = generateSetEquipment(setId, 5);
        expect(setOfEffect(eq.effect.def.type), `${eq.name} 效果应属于 ${setId}`).toBe(setId);
        for (const t of eq.triggers) {
          expect(setDef(setId).triggers.includes(t.def.type), `${t.def.name} 应在 ${setId} 亲和池`).toBe(true);
        }
        for (const m of eq.modifiers) {
          expect(setDef(setId).modifiers.includes(m.def.type), `${m.def.name} 应在 ${setId} 亲和池`).toBe(true);
        }
      }
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
