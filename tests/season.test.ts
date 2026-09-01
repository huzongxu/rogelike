/**
 * 赛季壳测试 —— 策划案 V3 §4:
 * 14 天赛季天数/门控(§4.1)、通关星数/每日首通常量(§4.2)、赛季分结算、存档迁移默认值。
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
  SEASON_DAYS,
  seasonDay,
  seasonEnded,
  stageUnlocked,
  stageUnlockNeed,
  endlessOpen,
  calcStars,
  starsText,
  seasonScore,
  seasonStardust,
  THREE_STAR_TICKETS,
  FIRST_CLEAR_TICKET_MULT,
  FIRST_CLEAR_ECHO_MULT,
  STAR_MAKEUP_COST,
  canStarMakeup,
} from "../src/data/season";
import { loadSave } from "../src/systems/save";

const DAY = 86400000;
const T0 = 1_750_000_000_000; // 固定基准,避免依赖真实时间

describe("赛季天数(§4.1)", () => {
  it("基础常量:14 天赛季", () => {
    expect(SEASON_DAYS).toBe(14);
  });

  it("seasonDay:第 1/7/8/14 天边界与钳制", () => {
    expect(seasonDay(T0, T0)).toBe(1); // 开赛瞬间算第 1 天
    expect(seasonDay(T0, T0 - 5000)).toBe(1); // 时钟回拨也兜底第 1 天
    expect(seasonDay(T0, T0 + 6 * DAY + DAY - 1)).toBe(7);
    expect(seasonDay(T0, T0 + 7 * DAY)).toBe(8); // 满 7 天整进第 8 天
    expect(seasonDay(T0, T0 + 13 * DAY + 1000)).toBe(14);
    expect(seasonDay(T0, T0 + 30 * DAY)).toBe(14); // 超过赛季时长钳制在 14
  });

  it("seasonEnded:满 14 天整判定结束", () => {
    expect(seasonEnded(T0, T0 + 14 * DAY - 1)).toBe(false);
    expect(seasonEnded(T0, T0 + 14 * DAY)).toBe(true);
    expect(seasonEnded(T0, T0 + 40 * DAY)).toBe(true);
  });
});

describe("关卡解锁(进度制,不看天数)", () => {
  it("第 1 关常开;通关第 N-1 关解锁第 N 关", () => {
    expect(stageUnlocked(1, 1, 0, 20, 0.5)).toBe(true);
    expect(stageUnlocked(2, 1, 0, 20, 0.5)).toBe(false); // 前关没进度没通关 → 锁
    expect(stageUnlocked(2, 2, 0, 20, 0.5)).toBe(true); // 通关第 1 关(highestStage=2)
    expect(stageUnlocked(7, 7, 0, 20, 0.5)).toBe(true);
  });

  it("50% 进度解锁:打到前关第 10/20 章即解锁下一关", () => {
    expect(stageUnlocked(3, 2, 9, 20, 0.5)).toBe(false); // 9/20 差一点
    expect(stageUnlocked(3, 2, 10, 20, 0.5)).toBe(true); // 恰好 50%
    expect(stageUnlocked(3, 2, 15, 20, 0.5)).toBe(true);
    expect(stageUnlockNeed(20, 0.5)).toBe(10);
    expect(stageUnlockNeed(20, 0.3)).toBe(6);
  });

  it("进度门槛可调:0.3 → 第 6 章解锁", () => {
    expect(stageUnlocked(4, 3, 6, 20, 0.3)).toBe(true);
    expect(stageUnlocked(4, 3, 5, 20, 0.3)).toBe(false);
  });

  it("无限关:常开(不再按天门控)", () => {
    expect(endlessOpen()).toBe(true);
  });
});

describe("通关星数与每日首通(§4.2)", () => {
  it("calcStars:通关 ★1 + 生命 ≥50% ★1 + 未用复活 ★1", () => {
    expect(calcStars(1, 0)).toBe(3);
    expect(calcStars(0.5, 0)).toBe(3); // 50% 恰好达标
    expect(calcStars(0.49, 0)).toBe(2);
    expect(calcStars(0.5, 1)).toBe(2);
    expect(calcStars(0.3, 3)).toBe(1); // 保底 1 星
  });

  it("starsText:★/☆ 显示与钳制", () => {
    expect(starsText(0)).toBe("☆☆☆");
    expect(starsText(2)).toBe("★★☆");
    expect(starsText(3)).toBe("★★★");
    expect(starsText(5)).toBe("★★★");
    expect(starsText(-1)).toBe("☆☆☆");
  });

  it("数值常量:3 星券奖、首通倍率", () => {
    expect(THREE_STAR_TICKETS).toBe(5);
    expect(FIRST_CLEAR_TICKET_MULT).toBe(2);
    expect(FIRST_CLEAR_ECHO_MULT).toBe(1.5);
  });
});

describe("补星(§4.4)", () => {
  it("只有恰好 2 星(差最后一颗)的关卡可补", () => {
    expect(canStarMakeup(2)).toBe(true);
    expect(canStarMakeup(0)).toBe(false);
    expect(canStarMakeup(1)).toBe(false);
    expect(canStarMakeup(3)).toBe(false);
  });

  it("补星价格 5 钻(策划案口径)", () => {
    expect(STAR_MAKEUP_COST).toBe(5);
  });
});

describe("赛季分结算(§4.1)", () => {
  it("赛季分 = Σ(星数×10) + 无限关最佳波次", () => {
    // stageStars 下标 = 关卡 id(0 号位占位)
    expect(seasonScore([0, 3, 2, 0, 0, 0, 0, 1], 25)).toBe(30 + 20 + 10 + 25);
    expect(seasonScore([0, 0, 0, 0, 0, 0, 0, 0], 0)).toBe(0);
  });

  it("赛季分 → 星尘 1:1 向下取整", () => {
    expect(seasonStardust(85)).toBe(85);
    expect(seasonStardust(0)).toBe(0);
  });
});

describe("存档迁移(旧存档无赛季字段)", () => {
  it("旧存档载入:赛季字段取默认值", () => {
    store["echo-abyss-save-v1"] = JSON.stringify({ points: 10, highestStage: 4 });
    const s = loadSave();
    expect(s.seasonId).toBe(1);
    expect(typeof s.seasonStartAt).toBe("number");
    expect(s.seasonStartAt).toBeGreaterThan(0);
    expect(s.stageStars).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.seasonBest).toBe(0);
    expect(s.dailyClearedDate).toBe("");
    expect(s.dailyClearedStage).toBe(0);
    expect(s.frames).toEqual([]);
    expect(s.makeUpDate).toBe("");
    // 原有字段不受影响
    expect(s.points).toBe(10);
    expect(s.highestStage).toBe(4);
  });

  it("stageStars 脏数据:钳制到 0–3 且始终 8 位", () => {
    store["echo-abyss-save-v1"] = JSON.stringify({
      stageStars: [9, 5, -2, "abc", 3, 2.7],
    });
    const s = loadSave();
    expect(s.stageStars).toHaveLength(8);
    expect(s.stageStars[0]).toBe(0); // 0 号位恒为占位
    expect(s.stageStars[1]).toBe(3); // 5 → 钳 3
    expect(s.stageStars[2]).toBe(0); // 负数 → 0
    expect(s.stageStars[3]).toBe(0); // 非数字 → 0
    expect(s.stageStars[4]).toBe(3);
    expect(s.stageStars[5]).toBe(2); // 小数向下取整
    expect(s.stageStars[6]).toBe(0);
    expect(s.stageStars[7]).toBe(0);
  });
});
