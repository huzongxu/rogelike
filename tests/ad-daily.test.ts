/**
 * 广告驱动商业化测试 —— 体力闸门 / 钻石 / 每日宝箱 / 每日天赋 / 每日重置 / 收藏基础数值 / 委托钻石区。
 */

import { describe, it, expect, vi } from "vitest";

// 存档模块依赖平台存储,这里 mock 掉 platform(与 prestige.test.ts 一致)
const store = vi.hoisted(() => ({} as Record<string, string>));
vi.mock("../src/platform/adapter", () => ({
  platform: {
    isWeChat: false,
    createCanvas: () => ({} as HTMLCanvasElement),
    requestAnimationFrame: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    getStorage: (k: string) => store[k] ?? null,
    setStorage: (k: string, v: string) => {
      store[k] = v;
    },
    showRewardedAd: (cb: (ok: boolean) => void) => cb(true),
  },
}));

import {
  ENERGY_MAX,
  ENERGY_AD_GAIN,
  ENERGY_AD_LIMIT,
  ENERGY_DIAMOND_COST,
  stageEnergyCost,
  ENDLESS_ENERGY_COST,
  regenEnergy,
  DIAMOND_PER_AD,
  DIAMOND_AD_DAILY,
  DIAMOND_TICKET_COST,
  DAILY_BOXES,
  DAILY_TALENT_COUNT,
  DAILY_TALENT_FREE,
  rollDailyTalents,
  dailyTalentOf,
  todayKey,
  needsDailyReset,
  collectionBonus,
  COLLECTION_ATK_PCT,
  COLLECTION_HP_PCT,
  stageDropCount,
  stageDropLevel,
} from "@game/data/daily";
import { REGIONS, effectiveHours } from "@game/data/commissions";
import { loadSave, persistSave, type SaveData } from "../src/systems/save";
import { makeTrigger, makeEffect } from "@game/data/affixes";
import type { Equipment } from "@game/data/equipmentGen";

const HOUR = 3600000;
const MIN = 60000;

function mkSave(partial: Partial<SaveData> = {}): SaveData {
  return {
    points: 0,
    ownedTalents: [],
    collection: { triggers: [], effects: [], modifiers: [], enemies: [] },
    bestRun: null,
    bestWave: 0,
    stardust: 0,
    gachaTicket: 0,
    highestStage: 1,
    stageFurthest: {},
    ownedGear: [],
    gachaPityEpic: 0,
    gachaPityLegendary: 0,
    fusionPity: 0,
    selectedGearId: null,
    dayEcho: 0,
    premiumPass: false,
    premiumPassSeason: 0,
    passTier: 0,
    prestiges: 0,
    fragments: 0,
    commission: null,
    commission2: null,
    selectedHero: null,
    selectedSet: null,
    tutorialDone: false,
    energy: ENERGY_MAX,
    lastEnergyAt: 0,
    diamond: 0,
    adWatchCount: 0,
    energyAdCount: 0,
    dailyDate: "",
    dailyBoxClaimed: [],
    dailyGachaAdUsed: false,
    dailyTalentClaimed: [],
    dailyTalents: [],
    shopRefreshCount: 0,
    seasonId: 1,
    seasonStartAt: 0,
    stageStars: [0, 0, 0, 0, 0, 0, 0, 0],
    seasonBest: 0,
    dailyClearedDate: "",
    dailyClearedStage: 0,
    frames: [],
    gearLevels: {},
    makeUpDate: "",
    ...partial,
  };
}

describe("体力闸门(弹壳式硬体力)", () => {
  it("每 6 分钟恢复 1 点,上限封顶", () => {
    const t0 = 1_700_000_000_000;
    // 空体力,1 小时 = 10 点
    const r = regenEnergy(0, t0, t0 + HOUR);
    expect(r.energy).toBe(10);
    // 3 小时 = 30 点 → 封顶 20
    const r2 = regenEnergy(0, t0, t0 + 3 * HOUR);
    expect(r2.energy).toBe(ENERGY_MAX);
  });

  it("已满体力不消耗已流逝时间(时间戳推进到 now)", () => {
    const t0 = 1_700_000_000_000;
    const r = regenEnergy(ENERGY_MAX, t0, t0 + 5 * HOUR);
    expect(r.energy).toBe(ENERGY_MAX);
    expect(r.lastEnergyAt).toBe(t0 + 5 * HOUR);
  });

  it("恢复时间戳推进到已结算整点,不丢剩余时间", () => {
    const t0 = 1_700_000_000_000;
    const r = regenEnergy(5, t0, t0 + 30 * MIN); // 30 分钟 = 5 点
    expect(r.energy).toBe(10);
    expect(r.lastEnergyAt).toBe(t0 + 30 * MIN);
    // 之后再过 6 分钟再多 1 点
    const r2 = regenEnergy(r.energy, r.lastEnergyAt, r.lastEnergyAt + 6 * MIN);
    expect(r2.energy).toBe(11);
  });

  it("主线关卡体力消耗随关卡递增,无限关 3 点", () => {
    expect(stageEnergyCost(1)).toBe(5);
    expect(stageEnergyCost(2)).toBe(5);
    expect(stageEnergyCost(3)).toBe(6);
    expect(stageEnergyCost(4)).toBe(6);
    expect(stageEnergyCost(7)).toBe(8);
    expect(ENDLESS_ENERGY_COST).toBe(3);
  });

  it("广告回体力数值:每次 +5,每日 5 次;钻石回满 10 钻", () => {
    expect(ENERGY_AD_GAIN).toBe(5);
    expect(ENERGY_AD_LIMIT).toBe(5);
    expect(ENERGY_DIAMOND_COST).toBe(10);
  });
});

describe("钻石硬通货", () => {
  it("每次看广告 +1 钻,每日上限 10", () => {
    expect(DIAMOND_PER_AD).toBe(1);
    expect(DIAMOND_AD_DAILY).toBe(10);
  });

  it("钻石换扭蛋券:2 钻 = 1 券", () => {
    expect(DIAMOND_TICKET_COST).toBe(2);
  });

  it("委托新增辉钻矿脉:钻石产出,需 7 次转生解锁", () => {
    const diamond = REGIONS.find((r) => r.givesDiamond);
    expect(diamond).toBeDefined();
    expect(diamond!.id).toBe("diamond");
    expect(diamond!.unlockPrestiges).toBe(7);
    expect(diamond!.baseRate).toBeGreaterThan(0);
  });
});

describe("每日宝箱", () => {
  it("3 个宝箱,产出券/星尘/钻石", () => {
    expect(DAILY_BOXES.length).toBe(3);
    for (const b of DAILY_BOXES) {
      expect(b.tickets + b.stardust + b.diamond).toBeGreaterThan(0);
      expect(b.id).toBeTruthy();
    }
  });
});

describe("每日天赋(数值墙工具)", () => {
  it("每日 3 个不重复天赋,免费 1 个", () => {
    expect(DAILY_TALENT_COUNT).toBe(3);
    expect(DAILY_TALENT_FREE).toBe(1);
    const ids = rollDailyTalents();
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(dailyTalentOf(id).name).toBeTruthy();
  });

  it("天赋池覆盖数值墙关键维度:伤害/生命/金币/冷却/暴击/复活", () => {
    const ids = rollDailyTalents(6); // 全量抽取(池子 <= 6 时全部)
    expect(ids).toContain("dmg20");
    expect(ids).toContain("hp30");
    expect(ids).toContain("gold50");
    expect(ids).toContain("extra_revive");
  });
});

describe("每日重置(跨天)", () => {
  it("同日不重置,跨天重置", () => {
    const t0 = 1_700_000_000_000;
    expect(needsDailyReset(todayKey(t0), t0 + MIN)).toBe(false);
    // 跨天(今天 23:59 → 明天 00:01 需要构造;直接用不同日期)
    const later = t0 + 2 * 24 * HOUR;
    expect(needsDailyReset(todayKey(t0), later)).toBe(true);
  });

  it("todayKey 格式 YYYY-MM-DD", () => {
    expect(todayKey(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("收藏基础数值(通关刷装备 → 永久成长)", () => {
  const mkGear = (quality: Equipment["quality"], name: string): Equipment => ({
    id: 1,
    level: 5,
    quality,
    name,
    triggers: [makeTrigger("pulse", { interval: 1.5 })],
    effect: makeEffect("knife", { damage: 30, speed: 520, radius: 640 }, 5),
    modifiers: [],
  });

  it("每件收藏按品质提供攻击/生命百分比", () => {
    const bonus = collectionBonus([mkGear("common", "a"), mkGear("epic", "b")]);
    expect(bonus.atkPct).toBe(COLLECTION_ATK_PCT.common + COLLECTION_ATK_PCT.epic);
    expect(bonus.hpPct).toBe(COLLECTION_HP_PCT.common + COLLECTION_HP_PCT.epic);
  });

  it("传奇收藏加成高于普通(数值随品质解锁)", () => {
    expect(COLLECTION_ATK_PCT.legendary).toBeGreaterThan(COLLECTION_ATK_PCT.common);
    expect(COLLECTION_HP_PCT.hidden).toBeGreaterThan(COLLECTION_HP_PCT.rare);
  });
});

describe("通关装备掉落(数值随关卡解锁)", () => {
  it("第 N 关掉落件数递增,装备等级 = 关卡 id", () => {
    expect(stageDropCount(1)).toBe(1);
    expect(stageDropCount(4)).toBe(3);
    expect(stageDropCount(7)).toBe(4);
    expect(stageDropLevel(5)).toBe(5);
    expect(stageDropLevel(7)).toBeGreaterThan(stageDropLevel(1));
  });
});

describe("存档扩展字段持久化", () => {
  it("体力/钻石/每日计数往返一致", () => {
    const save = mkSave({ energy: 13, diamond: 42, adWatchCount: 4, dailyBoxClaimed: ["wood"], shopRefreshCount: 2 });
    persistSave(save);
    const loaded = loadSave();
    expect(loaded.energy).toBe(13);
    expect(loaded.diamond).toBe(42);
    expect(loaded.adWatchCount).toBe(4);
    expect(loaded.dailyBoxClaimed).toEqual(["wood"]);
    expect(loaded.shopRefreshCount).toBe(2);
  });

  it("旧存档(无新字段)加载不崩溃,默认体力满", () => {
    store["echo-abyss-save-v1"] = JSON.stringify({ points: 7 });
    const loaded = loadSave();
    expect(loaded.points).toBe(7);
    expect(loaded.energy).toBe(ENERGY_MAX);
    expect(loaded.diamond).toBe(0);
  });
});

describe("委托衰减不回归(商业化挂载未破坏)", () => {
  it("12 小时有效时长仍为 7.5", () => {
    expect(effectiveHours(12)).toBeCloseTo(7.5);
  });
});
