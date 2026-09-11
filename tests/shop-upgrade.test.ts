/**
 * A1 · 场内强化(金币深出口)—— 依据 docs/DESIGN-SEASON-FEEL.md 批次 A。
 *
 * 守三件事:
 *  ① 价格与等级上限只读共享层(`upgradeCost` / `canUpgrade` / `QUALITY_MAX_LEVEL`),商店侧不得另算一份;
 *  ② 强化是原地改场上那件(词缀引擎持同一引用),且不像进化那样再登记一次图鉴;
 *  ③ 行内几何与热区优先级:强化钮在销毁钮左侧、含于所在行,点击判定 强化 > 销毁 > 整行点选。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ShopModel, type ShopWorld } from "../cocos/assets/scripts/shop/ShopModel";
import {
  EQUIPMENT_LEVEL_GROWTH,
  SHOP_SLOT_CAP,
  UPGRADE_MAIN_KEYS,
  canUpgrade,
  upgradeCost,
  type Equipment,
} from "@game/data/equipmentGen";
import { QUALITY_MAX_LEVEL, QUALITY_ORDER, type Quality } from "@game/data/quality";
import { makeEffect, makeTrigger } from "@game/data/affixes";
import { SHOP_PAD, shopLayoutPure } from "@game/ui/shop";

interface FakeWorld {
  equipment: Equipment[];
  gold: number;
  baseSlots: number;
  runSlotBonus: number;
  totalBought: number;
  recorded: Equipment[];
  chapter: number;
}

/** 窄假世界:与 tests/cocos-phase3.test.ts 同形态,只留商店账本用得着的字段 */
function makeWorld(over: Partial<FakeWorld> = {}): { world: ShopWorld; st: FakeWorld } {
  const st: FakeWorld = {
    equipment: [],
    gold: 100000,
    baseSlots: 6,
    runSlotBonus: 0,
    totalBought: 0,
    recorded: [],
    chapter: 1,
    ...over,
  };
  const world: ShopWorld = {
    equipment: st.equipment,
    gold: () => st.gold,
    setGold: (v) => {
      st.gold = v;
    },
    slots: () => st.baseSlots + st.runSlotBonus,
    runSlotBonus: () => st.runSlotBonus,
    addRunSlot: () => {
      st.runSlotBonus += 1;
    },
    chapter: () => st.chapter,
    seasonId: () => 1,
    highestStage: () => 1,
    selectedSet: () => null,
    ownedTalents: () => [],
    totalBought: () => st.totalBought,
    addTotalBought: () => {
      st.totalBought += 1;
    },
    recordEquipment: (eq) => st.recorded.push(eq),
    cardTypeKey: (eq) => `${eq.effect.def.type}:${eq.quality}`,
    mergeGroups: () => [],
  };
  return { world, st };
}

function mk(quality: Quality, level: number, id = 1, damage = 30): Equipment {
  return {
    id,
    level,
    quality,
    name: "测试刀",
    triggers: [makeTrigger("pulse", { interval: 1.5 })],
    effect: makeEffect("knife", { damage, speed: 520, radius: 640, spread: 3 }, level),
    modifiers: [],
  };
}

/** 共享层成长口径:第 level 级 → level+1 级的主数值倍率 */
function growthRatio(level: number): number {
  return (1 + level * EQUIPMENT_LEVEL_GROWTH) / (1 + (level - 1) * EQUIPMENT_LEVEL_GROWTH);
}

describe("A1 强化价与上限只读共享层", () => {
  it("每个品质、每一级的 upgradeCost 逐位等于共享层算出的价", () => {
    for (const q of QUALITY_ORDER) {
      for (let lv = 1; lv < QUALITY_MAX_LEVEL[q]; lv++) {
        const eq = mk(q, lv);
        const { world } = makeWorld({ equipment: [eq] });
        const row = new ShopModel(world).content().weapons[0];
        expect(row.upgradeCost, `${q} Lv.${lv}`).toBe(upgradeCost(eq));
        expect(row.canUpgrade, `${q} Lv.${lv}`).toBe(canUpgrade(eq));
      }
    }
  });

  it("商店侧不重写强化价公式(源码里不出现递增系数与基础价乘法)", () => {
    const src = readFileSync("cocos/assets/scripts/shop/ShopModel.ts", "utf8");
    expect(src.includes("QUALITY_UPGRADE_COST_GROWTH"), "递增系数只能待在 quality 主表").toBe(false);
    expect(src.includes("EQUIPMENT_LEVEL_GROWTH"), "成长系数只能待在 equipmentGen").toBe(false);
    expect(src.includes("upgradeCost("), "价格必须调共享层").toBe(true);
    expect(src.includes("canUpgrade("), "上限必须调共享层").toBe(true);
  });

  it("视图的主数值键与共享层同一份(不在视图层另抄键表)", () => {
    const src = readFileSync("cocos/assets/scripts/shop/ShopModel.ts", "utf8");
    expect(src.includes("UPGRADE_MAIN_KEYS")).toBe(true);
    expect([...UPGRADE_MAIN_KEYS]).toEqual(["damage", "dps", "heal", "amount"]);
  });
});

describe("A1 强化结算", () => {
  it("金币足够 → 扣价、等级 +1、主数值按共享层倍率放大,且改的是场上那件本体", () => {
    const eq = mk("rare", 3, 7, 30);
    const { world, st } = makeWorld({ equipment: [eq], gold: 5000 });
    const m = new ShopModel(world);
    const cost = upgradeCost(eq);
    expect(m.upgradeWeapon(7)).toBe(true);
    expect(st.gold).toBe(5000 - cost);
    expect(eq.level).toBe(4);
    expect(eq.effect.params.damage).toBe(Math.round(30 * growthRatio(3)));
    expect(world.equipment[0], "原地改,不换新对象").toBe(eq);
  });

  it("强化不再登记一次图鉴(与进化不同:等级提升不产生新的卡牌身份)", () => {
    const eq = mk("rare", 3);
    const { world, st } = makeWorld({ equipment: [eq] });
    new ShopModel(world).upgradeWeapon(eq.id);
    expect(st.recorded).toHaveLength(0);
  });

  it("达品质上限 → 文案转「已满级」、价 0、不可点,且状态一分不动", () => {
    const q: Quality = "common";
    const eq = mk(q, QUALITY_MAX_LEVEL[q]);
    const { world, st } = makeWorld({ equipment: [eq], gold: 99999 });
    const m = new ShopModel(world);
    const row = m.content().weapons[0];
    expect(row.canUpgrade).toBe(false);
    expect(row.upgradeCost).toBe(0);
    expect(row.affordUpgrade).toBe(false);
    expect(row.upgradeText).toBe("已满级");
    const before = { gold: st.gold, level: eq.level };
    expect(m.upgradeWeapon(eq.id)).toBe(false);
    expect({ gold: st.gold, level: eq.level }).toEqual(before);
  });

  it("金币差 1 → affordUpgrade false、强化失败且不扣钱不加级", () => {
    const eq = mk("epic", 2);
    const cost = upgradeCost(eq);
    const { world, st } = makeWorld({ equipment: [eq], gold: cost - 1 });
    const m = new ShopModel(world);
    expect(m.content().weapons[0].affordUpgrade).toBe(false);
    expect(m.upgradeWeapon(eq.id)).toBe(false);
    expect(st.gold).toBe(cost - 1);
    expect(eq.level).toBe(2);
  });

  it("金币刚好够 → 可强化(边界含等号)", () => {
    const eq = mk("epic", 2);
    const { world, st } = makeWorld({ equipment: [eq], gold: upgradeCost(eq) });
    const m = new ShopModel(world);
    expect(m.content().weapons[0].affordUpgrade).toBe(true);
    expect(m.upgradeWeapon(eq.id)).toBe(true);
    expect(st.gold).toBe(0);
  });

  it("不存在的 id → 失败且不扣钱", () => {
    const { world, st } = makeWorld({ equipment: [mk("rare", 1)], gold: 500 });
    expect(new ShopModel(world).upgradeWeapon(999)).toBe(false);
    expect(st.gold).toBe(500);
  });

  it("按钮文案写出「现值→强化后」的数值差(F9:变化要一眼看见)", () => {
    const eq = mk("rare", 3, 1, 30);
    const { world } = makeWorld({ equipment: [eq] });
    const row = new ShopModel(world).content().weapons[0];
    const next = Math.round(30 * growthRatio(3));
    expect(row.upgradeText).toBe(`30→${next} · ${upgradeCost(eq)}金`);
  });

  it("护盾类走 amount 键、毒云类走 dps 键(主数值取键序里第一个存在的)", () => {
    const shield: Equipment = { ...mk("rare", 2, 11), effect: makeEffect("shield", { amount: 40, duration: 6 }, 2) };
    const cloud: Equipment = { ...mk("rare", 2, 12), effect: makeEffect("cloud", { dps: 10, radius: 110, duration: 4 }, 2) };
    const { world } = makeWorld({ equipment: [shield, cloud] });
    const rows = new ShopModel(world).content().weapons;
    expect(rows[0].upgradeText.startsWith("40→")).toBe(true);
    expect(rows[1].upgradeText.startsWith("10→")).toBe(true);
  });
});

describe("A1 行内几何与热区", () => {
  for (const nW of [1, 4, 8]) {
    it(`${nW} 行:强化钮含于所在行、在销毁钮左侧、不重叠、坐标取偶`, () => {
      const L = shopLayoutPure(nW, 2);
      expect(L.upgradeRects).toHaveLength(nW);
      L.weaponRows.forEach((r, i) => {
        const u = L.upgradeRects[i];
        const d = L.destroyRects[i];
        expect(u.x).toBeGreaterThanOrEqual(r.x);
        expect(u.x + u.w).toBeLessThanOrEqual(r.x + r.w);
        expect(u.y).toBeGreaterThanOrEqual(r.y);
        expect(u.y + u.h).toBeLessThanOrEqual(r.y + r.h);
        expect(u.y).toBe(d.y);
        expect(u.h).toBe(d.h);
        expect(u.x + u.w, "强化在销毁左侧且留缝").toBeLessThanOrEqual(d.x - 2);
        for (const v of [u.x, u.y, u.w, u.h]) expect(v % 2, JSON.stringify(u)).toBe(0);
        expect(u.x).toBeGreaterThanOrEqual(SHOP_PAD);
        expect(u.x + u.w).toBeLessThanOrEqual(560 - SHOP_PAD);
      });
    });
  }

  it("副标列不与强化钮重叠(视图把 sub 收到 106 宽)", () => {
    const src = readFileSync("cocos/assets/scripts/shop/ShopView.ts", "utf8");
    expect(src.includes("slot.sub.set(r.x + 246, icy + FS.micro / 3, 106")).toBe(true);
    const L = shopLayoutPure(8, 2);
    expect(16 + 246 + 106).toBeLessThanOrEqual(L.upgradeRects[0].x);
  });

  it("点击优先级:强化钮 > 销毁钮 > 整行点选", () => {
    const eq = mk("rare", 2, 5);
    const { world } = makeWorld({ equipment: [eq], gold: 100000 });
    const m = new ShopModel(world);
    const L = m.layout();
    const u = L.upgradeRects[0];
    const d = L.destroyRects[0];
    expect(m.hitTest(u.x + u.w / 2, u.y + u.h / 2)).toEqual({ kind: "upgrade", id: 5 });
    expect(m.hitTest(d.x + d.w / 2, d.y + d.h / 2)).toEqual({ kind: "destroy", id: 5 });
    expect(m.hitTest(L.weaponRows[0].x + 40, L.weaponRows[0].y + L.weaponRows[0].h / 2)).toEqual({ kind: "weapon", id: 5 });
  });

  it("8 件满场时强化仍是可用出口(槽位硬顶不等于金币没去处)", () => {
    const eqs = Array.from({ length: SHOP_SLOT_CAP }, (_, i) => mk("legendary", 1, 100 + i, 50));
    const { world, st } = makeWorld({ equipment: eqs, gold: 100000, baseSlots: SHOP_SLOT_CAP });
    const m = new ShopModel(world);
    expect(m.freeSlots()).toBe(0);
    expect(m.slotMaxed()).toBe(true);
    expect(m.grantSlotByAd()).toBe(false); // 槽已满 → 广告也开不出新格
    const before = st.gold;
    expect(m.upgradeWeapon(100)).toBe(true); // 但还能强化 → 金币有出口
    expect(st.gold).toBeLessThan(before);
    expect(m.content().weapons).toHaveLength(SHOP_SLOT_CAP);
  });

  it("空态(0 件)整条武器行带不产行内热区(强化/销毁/点选都不该有)", () => {
    const { world } = makeWorld({ equipment: [] });
    const m = new ShopModel(world);
    const L = m.layout();
    expect(m.content().weapons).toHaveLength(0);
    const band = L.weaponRows[0];
    const y = band.y + band.h / 2;
    for (let x = band.x; x <= band.x + band.w; x += 8) {
      const a = m.hitTest(x, y);
      const kinds: string[] = a ? [a.kind] : [];
      const rowAction = kinds.includes("upgrade") || kinds.includes("destroy") || kinds.includes("weapon");
      expect(rowAction, `x=${x} 命中 ${a ? a.kind : "null"}`).toBe(false);
    }
  });
});
