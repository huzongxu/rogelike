/**
 * 策划配置表(balance.json)接入测试:
 * 各数值模块 applyBalance 的覆盖/钳制回退,以及配置生效后的公式联动。
 * 另含随仓 public/config/balance.json 自身的解析/段名自检。
 * 注意:配置是模块级可变状态,每个用例结束恢复默认。
 */

import { describe, it, expect, afterEach } from "vitest";
import BALANCE_RAW from "../public/config/balance.json?raw";
import {
  applyBalance as applyDaily,
  ENERGY_MAX,
  ENERGY_REGEN_SECONDS,
  STAGE_ENERGY_COST,
  DIAMOND_TICKET_COST,
  regenEnergy,
  stageEnergyCost,
} from "@game/data/daily";
import {
  applyBalance as applyBattle,
  CHAPTER_SECONDS,
  CHAPTERS_PER_STAGE,
  ECHO_RETAIN_RATE,
  chapterMonsterCount,
  stageEchoReward,
  splitEcho,
} from "@game/data/stages";
import { applyBalance as applyWaves, SPAWN_BASE, SPAWN_EARLY_CHAPTERS, SPAWN_INTERVAL_MIN } from "@game/systems/waves";
import { applyBalance as applyChapters, chapterTypeOf, ELITE_CHAPTERS, TREASURE_CHAPTERS } from "@game/data/chapters";
import { applyBalance as applyGacha, EPIC_PITY, LEGENDARY_PITY, rollGachaQuality, DUPLICATE_STARDUST } from "@game/data/gacha";
import { applyBalance as applyEconomy, qualityBasePrice, SHOP_SLOT_CAP, slotExpandCost } from "@game/data/equipmentGen";

afterEach(() => {
  applyDaily();
  applyBattle();
  applyWaves();
  applyChapters();
  applyGacha();
  applyEconomy();
});

describe("体力/商业化配置(energy+economy 段)", () => {
  it("覆盖生效:上限/恢复速度/关卡消耗/券价", () => {
    applyDaily({
      energy: { max: 50, regenSeconds: 60, stageCosts: [2, 3, 4, 5, 6, 7, 8], endlessCost: 1 },
      economy: { diamondTicketCost: 5 },
    });
    expect(ENERGY_MAX).toBe(50);
    expect(ENERGY_REGEN_SECONDS).toBe(60);
    expect(stageEnergyCost(3)).toBe(4);
    expect(STAGE_ENERGY_COST).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(DIAMOND_TICKET_COST).toBe(5);
  });

  it("恢复公式按新上限/速度结算", () => {
    applyDaily({ energy: { max: 10, regenSeconds: 10 } });
    const r = regenEnergy(5, 0, 35_000);
    expect(r.energy).toBe(8); // 35s / 10s = +3 点
    expect(r.energy).toBeLessThanOrEqual(ENERGY_MAX);
  });

  it("非法值回退默认:负数/越界/类型错误", () => {
    applyDaily({ energy: { max: -5, regenSeconds: "abc", stageCosts: "不是数组" } });
    expect(ENERGY_MAX).toBe(20);
    expect(ENERGY_REGEN_SECONDS).toBe(360);
    expect(STAGE_ENERGY_COST).toEqual([5, 5, 6, 6, 7, 7, 8]);
  });

  it("无参调用恢复全部默认", () => {
    applyDaily({ energy: { max: 99 } });
    expect(ENERGY_MAX).toBe(99);
    applyDaily();
    expect(ENERGY_MAX).toBe(20);
  });
});

describe("战斗/曲线配置(battle 段)", () => {
  it("章节时长/章节数/保留比例生效", () => {
    applyBattle({ chapterSeconds: 90, chaptersPerStage: 30, echoRetainRate: 0.6 });
    expect(CHAPTER_SECONDS).toBe(90);
    expect(CHAPTERS_PER_STAGE).toBe(30);
    expect(ECHO_RETAIN_RATE).toBe(0.6);
    expect(splitEcho(100)).toEqual({ permanent: 60, day: 40 });
  });

  it("怪物数量与回响奖励曲线随参数走", () => {
    applyBattle({ monsterCountBase: 50, monsterCountGrowth: 1.1, echoRewardBase: 20, echoRewardExp: 2 });
    expect(chapterMonsterCount(1)).toBe(50);
    expect(chapterMonsterCount(3)).toBe(Math.round(50 * 1.1 * 1.1));
    expect(stageEchoReward(4)).toBe(20 * 16); // 20 × 4²
  });

  it("chapterSeconds 越界回退默认 60", () => {
    applyBattle({ chapterSeconds: 99999 });
    expect(CHAPTER_SECONDS).toBe(60);
    applyBattle({ chapterSeconds: 0.1 });
    expect(CHAPTER_SECONDS).toBe(60);
    applyBattle({ chapterSeconds: 120 });
    expect(CHAPTER_SECONDS).toBe(120);
  });
});

describe("生成节奏配置(waves 段)", () => {
  it("曲线参数生效", () => {
    applyWaves({ spawnBase: 1.2, spawnEarlyChapters: 3, spawnIntervalMin: 0.3 });
    expect(SPAWN_BASE).toBe(1.2);
    expect(SPAWN_EARLY_CHAPTERS).toBe(3);
    expect(SPAWN_INTERVAL_MIN).toBe(0.3);
  });
});

describe("章型配置(chapterTypes 段)", () => {
  it("精英/宝箱章位置可改", () => {
    applyChapters({ eliteChapters: [3, 9], treasureChapters: [6] });
    expect(chapterTypeOf(3)).toBe("elite");
    expect(chapterTypeOf(9)).toBe("elite");
    expect(chapterTypeOf(6)).toBe("treasure");
    expect(chapterTypeOf(5)).toBe("normal");
    expect(ELITE_CHAPTERS).toEqual([3, 9]);
    expect(TREASURE_CHAPTERS).toEqual([6]);
  });

  it("章型数组非法回退默认", () => {
    applyChapters({ eliteChapters: "abc", treasureChapters: [] });
    expect(ELITE_CHAPTERS).toEqual([5, 10, 15]);
    expect(TREASURE_CHAPTERS).toEqual([7, 14]);
  });
});

describe("扭蛋配置(gacha 段)", () => {
  it("保底阈值生效", () => {
    applyGacha({ epicPity: 5, legendaryPity: 20 });
    expect(EPIC_PITY).toBe(5);
    expect(LEGENDARY_PITY).toBe(20);
    // 20 保底:第 19 次未出传奇 → 第 20 次必出
    const state = { pityEpic: 0, pityLegendary: 19 };
    expect(rollGachaQuality(state, () => 0.99)).toBe("legendary");
  });

  it("概率权重可改(全传奇权重=必出传奇)", () => {
    applyGacha({ rates: [{ value: "legendary", weight: 1 }] });
    expect(rollGachaQuality({ pityEpic: 0, pityLegendary: 0 }, () => 0.5)).toBe("legendary");
  });

  it("重复补偿按品质覆盖,非法字段回退", () => {
    applyGacha({ duplicateStardust: { common: 9, legendary: 999 } });
    expect(DUPLICATE_STARDUST.common).toBe(9);
    expect(DUPLICATE_STARDUST.legendary).toBe(999);
    expect(DUPLICATE_STARDUST.epic).toBe(15); // 未配置字段保持默认
    applyGacha({ duplicateStardust: { common: -1 } });
    expect(DUPLICATE_STARDUST.common).toBe(2);
  });
});

describe("经济配置(economy 段)", () => {
  it("品质底价/槽位上限/槽位曲线生效", () => {
    applyEconomy({ basePrice: { common: 20, legendary: 200 }, slotCap: 12, slotExpandBase: 50, slotExpandGrowth: 2 });
    expect(qualityBasePrice("common")).toBe(20);
    expect(qualityBasePrice("legendary")).toBe(200);
    expect(qualityBasePrice("rare")).toBe(30); // 未配置字段保持默认
    expect(SHOP_SLOT_CAP).toBe(12);
    expect(slotExpandCost(2)).toBe(200); // 50 × 2²
  });
});

/* ==================== 随仓文件自检 ==================== */

/**
 * 上面全部用例喂的是内联 fixture,所以"随仓那份 JSON 本身能不能读"一直是盲区。
 * 实际踩过:文件末尾混进一个多余字符 → JSON.parse 抛 → 加载器只 console.warn 就整份回退默认值,
 * 表现为"策划改了数值、保存了、刷新生效了个寂寞",而且没人看到告警。
 */
describe("随仓 balance.json 自检", () => {
  const KNOWN_SECTIONS = new Set(["energy", "economy", "battle", "waves", "chapterTypes", "gacha", "menuLayout", "menuSkin"]);

  it("能解析成对象(整份配置生效的前提)", () => {
    const cfg = JSON.parse(BALANCE_RAW) as unknown;
    expect(cfg).toBeTypeOf("object");
    expect(Array.isArray(cfg)).toBe(false);
    expect(Object.keys(cfg as object).length).toBeGreaterThan(1);
  });

  it("顶层段名全部由加载器认领(拼错段名 = 静默失效)", () => {
    const cfg = JSON.parse(BALANCE_RAW) as Record<string, unknown>;
    const unclaimed = Object.keys(cfg).filter((k) => k !== "$comment" && !KNOWN_SECTIONS.has(k));
    expect(unclaimed).toEqual([]);
  });

  it("每个已配置段都是对象", () => {
    const cfg = JSON.parse(BALANCE_RAW) as Record<string, unknown>;
    const bad = Object.keys(cfg).filter((k) => k !== "$comment" && (!cfg[k] || typeof cfg[k] !== "object" || Array.isArray(cfg[k])));
    expect(bad).toEqual([]);
  });
});
