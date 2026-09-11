/**
 * A4 · 场内金币经济重标 —— 依据 docs/DESIGN-SEASON-FEEL.md 批次 A · A4(需求 F5)。
 *
 * 守三件事:
 *  ① 产出侧与价格侧的表值就是重标后的那一组(改表即改行为,别处不再有第二份数字);
 *  ② 金币堆溢出**金额守恒**(旧行为是 splice 掉最早的堆 = 玩家看不见的钱静默蒸发);
 *  ③ 取舍变紧:同一套刷怪节奏下"单章产出 / 一轮出口"的比值重标后严格下降,
 *     且深出口(场内强化)的总容量足以吃掉满场后的金币 —— F5 的"零出口"不再成立。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BOSS_GOLD, ELITE_GEM_COUNT, GOLD_PER_XP } from "@game/data/combat";
import { SHOP_PRICE_CURVE, shopCardPrice } from "@game/data/shop";
import { rerollPrice } from "@game/data/reroll";
import { QUALITY_MAX_LEVEL, QUALITY_ORDER } from "@game/data/quality";
import { upgradeCost, type Equipment } from "@game/data/equipmentGen";
import { LIMITS } from "@game/systems/battleWorld";
import { mergeGemOverflow, spawnGem, type Gem } from "@game/entities/objects";
import { ENEMY_DEFS } from "@game/data/enemies";
import { vec2 } from "@game/core/math";

/** 刷怪节奏读随仓配置,不在测试里另抄一份常量 */
const WAVES = JSON.parse(readFileSync("cocos/assets/resources/config/balance.json", "utf8")).waves as {
  chapterLength: number;
  spawnBase: number;
  spawnEarlyDecay: number;
  spawnEarlyChapters: number;
  spawnLateDecay: number;
  spawnIntervalMin: number;
  spawnMultiFrom: number;
};

/** 卡价公式(与 game/data/shop.ts 的 shopCardPrice 同形,但系数可传入,用于与重标前的旧口径对照) */
function priceWith(base: number, bought: number, chapter: number, perPurchase: number, perChapter: number): number {
  return Math.round(base * (1 + bought * perPurchase) * (1 + chapter * perChapter));
}

/**
 * 单章击杀数(下限口径):按 waves 的生成公式算 tick 数 × 每 tick 只数。
 * 公式见 game/systems/waves.ts:46-47 与 :120(count = 1 + floor(章 / spawnMultiFrom))。
 */
function chapterKills(chapter: number): number {
  const w = WAVES;
  const raw =
    chapter <= w.spawnEarlyChapters
      ? w.spawnBase * Math.pow(w.spawnEarlyDecay, chapter - 1)
      : w.spawnBase * Math.pow(w.spawnEarlyDecay, w.spawnEarlyChapters - 1) * Math.pow(w.spawnLateDecay, chapter - w.spawnEarlyChapters);
  const interval = Math.max(w.spawnIntervalMin, raw);
  return (w.chapterLength / interval) * (1 + Math.floor(chapter / w.spawnMultiFrom));
}

describe("A4 产出侧表值", () => {
  it("三个常量就是重标后的值(2→1 / 60→45 / 8→6)", () => {
    expect(GOLD_PER_XP).toBe(1);
    expect(BOSS_GOLD).toBe(45);
    expect(ELITE_GEM_COUNT).toBe(6);
  });

  it("普通怪单杀掉落 = 金币基数 × GOLD_PER_XP(重标后即等于基数本身)", () => {
    for (const [kind, def] of Object.entries(ENEMY_DEFS)) {
      if (kind === "boss") continue; // Boss 走固定额,不走上式
      expect(Math.round(def.xp * GOLD_PER_XP), `${kind} xp=${def.xp}`).toBe(def.xp);
    }
  });

  it("精英掉落 = 单杀额 × 堆数;Boss 走固定额(两条都是重标后的数)", () => {
    const elite = ENEMY_DEFS.elite;
    expect(Math.round(elite.xp * GOLD_PER_XP) * ELITE_GEM_COUNT).toBe(elite.xp * ELITE_GEM_COUNT);
    expect(ENEMY_DEFS.boss).toBeTruthy();
    expect(BOSS_GOLD).toBe(45);
  });

  it("金币堆上限提到 420(与溢出并入配套)", () => {
    expect(LIMITS.gems).toBe(420);
  });
});

describe("A4 价格侧表值", () => {
  it("卡价曲线两条系数就是重标后的值(12%→18% / 3%→5%)", () => {
    expect(SHOP_PRICE_CURVE.perPurchase).toBe(0.18);
    expect(SHOP_PRICE_CURVE.perChapter).toBe(0.05);
    // 表与函数同源:函数算出来的就是这两条系数
    expect(shopCardPrice(100, 1, 2)).toBe(priceWith(100, 1, 2, SHOP_PRICE_CURVE.perPurchase, SHOP_PRICE_CURVE.perChapter));
  });

  it("深出口容量:单件从 1 级强到品质满级的总花费(F5「零出口」的反证)", () => {
    const totals: Record<string, number> = {};
    for (const q of QUALITY_ORDER) {
      let sum = 0;
      for (let lv = 1; lv < QUALITY_MAX_LEVEL[q]; lv++) {
        sum += upgradeCost({ quality: q, level: lv } as unknown as Equipment);
      }
      totals[q] = sum;
    }
    expect(totals.common).toBe(114);
    expect(totals.rare).toBe(588);
    expect(totals.epic).toBe(2640);
    expect(totals.legendary).toBe(9360);
    expect(totals.hidden).toBe(24320);
    // 八件满场后仍有万金级去处:这正是 A1 接上强化钮才有的出口
    expect(totals.legendary * 8).toBeGreaterThan(10000);
  });

  it("卡价与强化价都不在逻辑代码里另写一份(只读表)", () => {
    for (const f of ["cocos/assets/scripts/shop/ShopModel.ts", "cocos/assets/scripts/levelup/LevelUpModel.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("0.18"), `${f} 不该内联卡价系数`).toBe(false);
      expect(src.includes("0.05"), `${f} 不该内联章节系数`).toBe(false);
      expect(src.includes("QUALITY_UPGRADE_COST_GROWTH"), `${f} 不该内联强化递增系数`).toBe(false);
    }
  });
});

describe("A4 溢出金额守恒", () => {
  it("超额堆并入最近的一堆:总额不变、堆数封顶、并入目标是离玩家最近那堆", () => {
    const player = vec2(100, 100);
    const cap = 5;
    const gems: Gem[] = [];
    // 6 堆:越晚生成的离玩家越近(玩家在 x=100);超额时最先被挤出的是最早、也是最远那堆
    for (let i = 0; i < 6; i++) gems.push(spawnGem(vec2(150 - i * 10, 100), 7));
    const totalBefore = gems.reduce((s, g) => s + g.value, 0);
    const nearest = gems[gems.length - 1];
    mergeGemOverflow(gems, cap, player);
    expect(gems).toHaveLength(cap);
    expect(gems.reduce((s, g) => s + g.value, 0), "金额必须守恒").toBe(totalBefore);
    expect(nearest.value, "并入的是最近那堆").toBe(14);
  });

  it("未超额时一枚不动(不误伤正常掉落)", () => {
    const gems: Gem[] = [spawnGem(vec2(0, 0), 3), spawnGem(vec2(10, 0), 4)];
    mergeGemOverflow(gems, LIMITS.gems, vec2(0, 0));
    expect(gems).toHaveLength(2);
    expect(gems.map((g) => g.value)).toEqual([3, 4]);
  });
});

describe("A4 取舍是否真的变紧", () => {
  /** 一轮出口 = 三张史诗卡 + 一次史诗强化 + 一次重随(强化价取 5 级那一档) */
  function sinks(chapter: number, perPurchase: number, perChapter: number, withReroll: boolean): number {
    const cards = [0, 1, 2].reduce((s, b) => s + priceWith(60, b, chapter, perPurchase, perChapter), 0);
    return cards + 204 + (withReroll ? rerollPrice(0) : 0);
  }

  it("同一刷怪节奏下,产出/出口 比值重标后严格下降(平均经验 1..4 全档成立)", () => {
    const rows: string[] = [];
    for (const chapter of [1, 5, 10, 15, 20]) {
      const kills = chapterKills(chapter);
      const oldSinks = sinks(chapter, 0.12, 0.03, false); // 重标前:无重随出口
      const newSinks = sinks(chapter, SHOP_PRICE_CURVE.perPurchase, SHOP_PRICE_CURVE.perChapter, true);
      for (const avgXp of [1, 2, 3, 4]) {
        const oldRatio = (kills * avgXp * 2) / oldSinks; // 重标前 GOLD_PER_XP = 2
        const newRatio = (kills * avgXp * GOLD_PER_XP) / newSinks;
        expect(newRatio, `第${chapter}章 avgXp=${avgXp}`).toBeLessThan(oldRatio);
        if (avgXp === 2) {
          rows.push(
            `第${String(chapter).padStart(2)}章 击杀≈${Math.round(kills)} 产出≈${Math.round(kills * 2 * GOLD_PER_XP)} 一轮出口≈${Math.round(newSinks)} 比值 ${oldRatio.toFixed(2)}→${newRatio.toFixed(2)}`
          );
        }
      }
    }
    // 标定输出:供 docs/DESIGN-SEASON-FEEL.md A4 节引用(下限口径 = 全腐尸,真实敌种混编更高)
    for (const r of rows) console.log(`[金币经济] ${r}`);
  });

  it("第 10 章下限口径:单章产出买不光一轮出口(F5 的没有抉择被堵上)", () => {
    const income = chapterKills(10) * 1 * GOLD_PER_XP; // 全腐尸下限
    const out = sinks(10, SHOP_PRICE_CURVE.perPurchase, SHOP_PRICE_CURVE.perChapter, true);
    console.log(`[金币经济] 第10章 下限产出 ${Math.round(income)} vs 一轮出口 ${Math.round(out)}`);
    expect(income).toBeLessThan(out);
  });
});
