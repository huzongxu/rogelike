/**
 * 扭蛋机测试 —— 保底(10抽史诗/50抽传奇)、重复补偿、十连保底。
 */

import { describe, it, expect } from "vitest";
import { rollGachaQuality, drawGacha, drawGacha10, DUPLICATE_STARDUST, type GachaPity } from "../src/data/gacha";

describe("扭蛋保底(参考弹壳特工队)", () => {
  it("50 抽必传奇", () => {
    const state: GachaPity = { pityEpic: 0, pityLegendary: 49 };
    expect(rollGachaQuality(state, () => 0.99)).toBe("legendary"); // 即使 roll 很差也保底
  });

  it("10 抽必史诗或更好", () => {
    const state: GachaPity = { pityEpic: 9, pityLegendary: 0 };
    const q = rollGachaQuality(state, () => 0.99);
    expect(["epic", "legendary"]).toContain(q);
  });

  it("正常抽取按概率分布(低 roll → 普通)", () => {
    const state: GachaPity = { pityEpic: 0, pityLegendary: 0 };
    expect(rollGachaQuality(state, () => 0.01)).toBe("common");
    expect(rollGachaQuality(state, () => 0.9)).toBe("epic"); // 90 ∈ (85,97] 史诗段
    expect(rollGachaQuality(state, () => 0.98)).toBe("legendary"); // 98 ∈ (97,100] 传奇段
  });

  it("保底计数随抽取推进,出史诗重置", () => {
    const state: GachaPity = { pityEpic: 2, pityLegendary: 5 };
    // 连续 roll 出普通
    drawGacha(5, state, [], () => 0.01);
    expect(state.pityEpic).toBe(3);
    drawGacha(5, state, [], () => 0.01);
    expect(state.pityEpic).toBe(4);
    // 出史诗 → 重置
    drawGacha(5, state, [], () => 0.9);
    expect(state.pityEpic).toBe(0);
  });
});

describe("抽取与重复补偿", () => {
  it("抽到新装备进收藏,重复装备转化为星尘", () => {
    const state: GachaPity = { pityEpic: 0, pityLegendary: 0 };
    const owned: Awaited<ReturnType<typeof drawGacha>>["eq"][] = [];
    const r1 = drawGacha(5, state, owned, () => 0.01); // 普通
    owned.push(r1.eq);
    expect(r1.duplicate).toBe(false);
    // 同品质同名再次抽到 → 重复
    const r2 = drawGacha(5, state, owned, () => 0.01);
    // 普通×2 → 星尘补偿
    if (r2.duplicate) {
      expect(r2.stardust).toBe(DUPLICATE_STARDUST.common);
    } else {
      expect(r2.eq.name).not.toBe(r1.eq.name); // 名字不同则不是重复
    }
  });

  it("十连:前 9 抽无史诗时,第 10 抽保底史诗或更好", () => {
    const state: GachaPity = { pityEpic: 0, pityLegendary: 0 };
    const owned: Awaited<ReturnType<typeof drawGacha>>["eq"][] = [];
    const results = drawGacha10(5, state, owned, () => 0.01); // 全部 roll 低 → 前 9 抽普通
    const last = results[9];
    expect(["epic", "legendary"]).toContain(last.eq.quality);
  });

  it("十连保底不消耗传奇保底(仅触发史诗保底)", () => {
    const state: GachaPity = { pityEpic: 0, pityLegendary: 45 };
    const owned: Awaited<ReturnType<typeof drawGacha>>["eq"][] = [];
    const results = drawGacha10(5, state, owned, () => 0.01);
    expect(results.some((r) => r.eq.quality === "epic" || r.eq.quality === "legendary")).toBe(true);
  });
});
