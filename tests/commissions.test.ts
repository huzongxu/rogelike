/**
 * 委托挂机系统测试 —— 策划案六 + 4.4 离线收益规则:
 * 收益衰减曲线、区域解锁、难度倍率/失败率、奖励结算。
 */

import { describe, it, expect } from "vitest";
import {
  effectiveHours,
  accruedReward,
  collectReward,
  regionUnlocked,
  regionOf,
  difficultyOf,
  COMMISSION_MAX_HOURS,
  type CommissionState,
} from "../src/data/commissions";
import { BUILDER_ROUTE } from "../src/data/talents";

describe("离线收益衰减曲线(策划案 4.4)", () => {
  it("前 2 小时 100% 收益", () => {
    expect(effectiveHours(0)).toBe(0);
    expect(effectiveHours(1)).toBe(1);
    expect(effectiveHours(2)).toBe(2);
  });

  it("2→4 小时线性衰减至 50%", () => {
    expect(effectiveHours(3)).toBeCloseTo(2.75); // 2 + 平均0.75 × 1
    expect(effectiveHours(4)).toBeCloseTo(3.5); // 2 + 1.5
  });

  it("4 小时后保持 50%,12 小时封顶", () => {
    expect(effectiveHours(8)).toBeCloseTo(5.5); // 2 + 1.5 + 0.5×4
    expect(effectiveHours(24)).toBeCloseTo(7.5); // 封顶 12h
    expect(effectiveHours(COMMISSION_MAX_HOURS)).toBe(7.5);
  });
});

describe("委托奖励结算", () => {
  const comm: CommissionState = { region: "plains", difficulty: 1, startedAt: 0 };

  it("枯萎平原·难度1:4 小时可得 30×1×3.5 = 105", () => {
    const reward = accruedReward({ ...comm, startedAt: Date.now() - 4 * 3600000 }, Date.now());
    expect(reward).toBe(105);
  });

  it("难度倍率与失败率生效(难度3:×2.2 / 5%)", () => {
    const d = difficultyOf(3);
    expect(d.mult).toBe(2.2);
    expect(d.fail).toBe(0.05);
    const c = { region: "plains" as const, difficulty: 3, startedAt: Date.now() - 2 * 3600000 };
    expect(accruedReward(c, Date.now())).toBe(Math.floor(30 * 2.2 * 2));
  });

  it("失败时收益减半(离线玩法避免全损)", () => {
    const c = { region: "plains" as const, difficulty: 5, startedAt: Date.now() - 2 * 3600000 };
    const full = accruedReward(c, Date.now());
    const failed = collectReward(c, Date.now(), () => 0); // roll 0 < 0.2 → 失败
    expect(failed.failed).toBe(true);
    expect(failed.reward).toBe(Math.floor(full / 2));
  });

  it("成功时全额发放", () => {
    const c = { region: "plains" as const, difficulty: 1, startedAt: Date.now() - 2 * 3600000 };
    const ok = collectReward(c, Date.now(), () => 0.99);
    expect(ok.failed).toBe(false);
    expect(ok.reward).toBe(60);
  });
});

describe("委托区域解锁(策划案 6.1)", () => {
  it("枯萎平原初始解锁", () => {
    expect(regionUnlocked(regionOf("plains"), 0, [])).toBe(true);
  });
  it("腐蚀沼泽需转生 1 次", () => {
    expect(regionUnlocked(regionOf("swamp"), 0, [])).toBe(false);
    expect(regionUnlocked(regionOf("swamp"), 1, [])).toBe(true);
  });
  it("虚空深渊需转生 5 次", () => {
    expect(regionUnlocked(regionOf("abyss"), 4, [])).toBe(false);
    expect(regionUnlocked(regionOf("abyss"), 5, [])).toBe(true);
  });
  it("星尘圣殿需天赋树点满", () => {
    expect(regionUnlocked(regionOf("sanctum"), 99, [])).toBe(false);
    expect(regionUnlocked(regionOf("sanctum"), 99, BUILDER_ROUTE.map((n) => n.id))).toBe(true);
  });
});
