/**
 * 转生系统测试 —— 回响点数公式(策划案 5.2)/存档/天赋定义/生成器扩展。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 存档模块依赖平台存储,这里 mock 掉 platform
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
  },
}));

import { calcPrestigePoints, availablePoints, loadSave, persistSave, applyRunRewards, isTreeFull, type SaveData } from "../src/systems/save";
import { BUILDER_ROUTE, BUILDER_ROUTE_COST, ALL_TALENTS, isTierUnlocked, slotBonusFor, passiveSlotBonusFor, firstXpScaleFor } from "@game/data/talents";

/** 构造完整 SaveData(广告驱动字段给默认值),便于测试聚焦差异字段 */
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
    energy: 20,
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
import {
  generateChoices,
  generateEquipmentWithTrigger,
  reforgeEquipment,
  generateEquipment,
  applyTargetedSearch,
  makeStarterEquipment,
  upgradeEquipment,
  thornPairOffer,
  equipmentHasHeal,
  equipmentHasThornTrigger,
  buildHasHeal,
  buildHasThorn,
  type Equipment,
} from "@game/data/equipmentGen";
import { makeTrigger, makeEffect, makeModifier } from "@game/data/affixes";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("回响点数公式(策划案 5.2)", () => {
  it("示例:难度3、生存15分钟(900秒)、击杀8000 → 12 点", () => {
    expect(calcPrestigePoints(900, 8000, 3)).toBe(12);
  });

  it("难度1、生存2分钟、击杀0 → floor(1+1+0+1.2)=3 点", () => {
    expect(calcPrestigePoints(120, 0, 1)).toBe(3);
  });

  it("刚开局死亡至少保底 2 点(基础1+难度系数1.2)", () => {
    expect(calcPrestigePoints(0, 0, 1)).toBe(2);
  });
});

describe("构筑师天赋定义", () => {
  it("总成本为 91 点", () => {
    expect(BUILDER_ROUTE_COST).toBe(91);
  });

  it("层级解锁:N 层需要至少一个 N-1 层节点", () => {
    expect(isTierUnlocked([], 2, BUILDER_ROUTE)).toBe(false);
    expect(isTierUnlocked(["extra_gear"], 2, BUILDER_ROUTE)).toBe(true);
    expect(isTierUnlocked(["extra_gear"], 3, BUILDER_ROUTE)).toBe(false);
  });
});

describe("可支配点数", () => {
  it("点数扣减已花费天赋", () => {
    const save: SaveData = mkSave({ points: 10, ownedTalents: ["extra_gear"] });
    expect(availablePoints(save)).toBe(7); // 10 - 额外武装3
  });
});

describe("存档持久化", () => {
  it("persistSave → loadSave 往返一致", () => {
    const save: SaveData = mkSave({
      points: 12,
      ownedTalents: ["extra_gear", "slot1"],
      collection: { triggers: ["周期脉冲"], effects: ["飞刀投射"], modifiers: ["连锁"], enemies: ["chaser", "echo_walker"] },
      bestRun: { kills: 800, seconds: 900 },
      stardust: 5,
      gachaTicket: 3,
      highestStage: 2,
      gachaPityEpic: 3,
      dayEcho: 5,
      premiumPass: true,
      passTier: 1,
      prestiges: 2,
      fragments: 30,
      commission: { region: "plains", difficulty: 1, startedAt: 1000 },
      bestWave: 4,
    });
    persistSave(save);
    const loaded = loadSave();
    expect(loaded.points).toBe(12);
    expect(loaded.ownedTalents).toEqual(["extra_gear", "slot1"]);
    expect(loaded.gachaTicket).toBe(3);
    expect(loaded.highestStage).toBe(2);
    expect(loaded.collection.effects).toEqual(["飞刀投射"]);
    expect(loaded.stardust).toBe(5);
    expect(loaded.prestiges).toBe(2);
    expect(loaded.fragments).toBe(30);
    expect(loaded.commission?.region).toBe("plains");
  });
});

describe("天赋相关生成器扩展", () => {
  it("词缀鉴赏:三选一至少 1 件稀有及以上", () => {
    const choices = generateChoices(5, 3, true);
    expect(choices.some((c) => c.kind === "equip" && c.eq.quality !== "common")).toBe(true);
  });

  it("荆棘反伤回血流:受击/受伤触发与回血来源可识别,商店会补配对卡", () => {
    // 荆棘触发卡(受击触发 + 吸血)
    const thorn: Equipment = {
      id: 9901,
      level: 3,
      quality: "rare",
      name: "荆棘飞刀",
      triggers: [makeTrigger("hit", {})],
      effect: makeEffect("knife", { damage: 30, speed: 560, radius: 460, spread: 3 }, 3),
      modifiers: [makeModifier("lifesteal", { pct: 0.05 })],
    };
    const plain: Equipment = {
      id: 9902,
      level: 3,
      quality: "common",
      name: "脉冲飞刀",
      triggers: [makeTrigger("pulse", { interval: 1.5 })],
      effect: makeEffect("knife", { damage: 24, speed: 520, radius: 420 }, 1),
      modifiers: [],
    };
    expect(equipmentHasThornTrigger(thorn)).toBe(true);
    expect(equipmentHasHeal(thorn)).toBe(true);
    expect(equipmentHasThornTrigger(plain)).toBe(false);
    expect(buildHasThorn([plain])).toBe(false);
    expect(buildHasHeal([plain, thorn])).toBe(true);
    // 有荆棘触发但没回血来源 → 商店补一张回血卡
    const thornOnly: Equipment = {
      id: 9903,
      level: 3,
      quality: "rare",
      name: "荆棘单发",
      triggers: [makeTrigger("hurt", { hpThreshold: 0.8 })],
      effect: makeEffect("nova", { damage: 50, radius: 140 }, 3),
      modifiers: [],
    };
    const pair = thornPairOffer([thornOnly], 3);
    if (pair) expect(equipmentHasHeal(pair)).toBe(true);
  });

  it("已有装备时,三选一包含 1 张强化卡(攻击效果可强化)", () => {
    const owned = [generateEquipment(5, "epic")];
    const choices = generateChoices(5, 3, false, 0, owned);
    const upgrade = choices.find((c) => c.kind === "upgrade");
    expect(upgrade).toBeDefined();
    if (upgrade && upgrade.kind === "upgrade") {
      expect(upgrade.sourceId).toBe(owned[0].id);
      expect(upgrade.eq.level).toBe(owned[0].level + 1); // 预览为强化后等级
    }
  });

  it("定向搜索:首触发器为指定类型", () => {
    const eq = generateEquipmentWithTrigger(5, "move");
    expect(eq.triggers[0].def.type).toBe("move");
  });

  it("词缀重铸:修饰器数量不变且被替换", () => {
    const eq = generateEquipment(5, "epic"); // 史诗 = 2 修饰器
    reforgeEquipment(eq);
    expect(eq.modifiers).toHaveLength(2);
    // 重铸后大概率不是完全相同的一套;只断言数量与名称结构
    expect(eq.name).toContain(eq.effect.def.name);
  });
});

describe("天赋效果接线", () => {
  it("额外武装+槽位扩展I 共 +2 主动槽(R7);槽位扩展II 改成被动槽 +1", () => {
    expect(slotBonusFor([])).toBe(0);
    expect(slotBonusFor(["extra_gear", "slot1", "slot2"])).toBe(2);
    expect(passiveSlotBonusFor([])).toBe(0);
    expect(passiveSlotBonusFor(["slot2"])).toBe(1);
  });

  it("快速启动:首次升级经验 -20%", () => {
    expect(firstXpScaleFor([])).toBe(1);
    expect(firstXpScaleFor(["quick_start"])).toBe(0.8);
  });

  it("定向搜索:三选一中出现指定触发器", () => {
    const choices = generateChoices(5, 3);
    applyTargetedSearch(choices, 5, "move");
    // 口径与 applyTargetedSearch 一致 = 任一触发器;多触发器卡上 move 未必排首位(排首位会让本用例偶发失败)
    expect(choices.some((c) => c.kind === "equip" && c.eq.triggers.some((tr) => tr.def.type === "move"))).toBe(true);
  });

  it("完美蓝图:开局武器使用指定效果", () => {
    const starter = makeStarterEquipment("nova");
    expect(starter.effect.def.type).toBe("nova");
    expect(starter.triggers[0].def.type).toBe("pulse");
    expect(starter.name).toContain("火焰新星");
  });

  it("强化装备:等级+1,伤害按成长比例提升(攻击效果可强化)", () => {
    const eq: Equipment = {
      id: 910,
      level: 3,
      quality: "rare",
      name: "测试飞刀",
      triggers: [makeTrigger("pulse", { interval: 1.5 })],
      effect: makeEffect("knife", { damage: 40, speed: 520, radius: 420 }, 3),
      modifiers: [],
    };
    const before = eq.effect.params.damage ?? 0;
    upgradeEquipment(eq);
    expect(eq.level).toBe(4);
    expect(eq.effect.params.damage ?? 0).toBeGreaterThan(before);
    expect(eq.effect.def.type).toBe("knife"); // 效果身份不变
  });
});

describe("星尘与溢出转化(策划案 5.2)", () => {
  it("天赋树未满:点数正常累计,不产生星尘", () => {
    const save: SaveData = mkSave({ points: 10, ownedTalents: ["extra_gear"] });
    expect(isTreeFull(save.ownedTalents)).toBe(false);
    const r = applyRunRewards(save, 5);
    expect(r.points).toBe(5);
    expect(r.stardust).toBe(0);
    expect(save.points).toBe(15);
  });

  it("天赋树点满(三系):回响点数 1:1 转化为星尘", () => {
    const save: SaveData = mkSave({ points: 0, ownedTalents: ALL_TALENTS.map((n) => n.id) });
    expect(isTreeFull(save.ownedTalents)).toBe(true);
    const r = applyRunRewards(save, 7);
    expect(r.stardust).toBe(7);
    expect(r.points).toBe(0);
    expect(save.stardust).toBe(7);
    expect(save.points).toBe(0);
  });
});
