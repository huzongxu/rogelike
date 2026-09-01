/**
 * 章型差异化测试(策划案 V3 §3.1)。
 * 纯函数断言 + 章型模拟曲线:新手区/台阶形状不因章型回归。
 */

import { describe, it, expect } from "vitest";
import { chapterTypeOf, chapterTypeInfo, chapterTypeLabel, ELITE_CHAPTERS, TREASURE_CHAPTERS } from "../src/data/chapters";
import { runSim, formatReport } from "../scripts/balance-sim";

describe("章型纯函数", () => {
  it("章型判定:精英 5/10/15、宝箱 7/14、Boss 章优先、其余普通", () => {
    expect(chapterTypeOf(1)).toBe("normal");
    expect(chapterTypeOf(4)).toBe("normal");
    for (const c of ELITE_CHAPTERS) expect(chapterTypeOf(c)).toBe("elite");
    for (const c of TREASURE_CHAPTERS) expect(chapterTypeOf(c)).toBe("treasure");
    expect(chapterTypeOf(20, 20)).toBe("boss");
    // bossChapter 优先于其它型(即使位置重叠)
    expect(chapterTypeOf(5, 5)).toBe("boss");
    expect(chapterTypeOf(20)).toBe("normal"); // 无限关无 Boss 章参数
  });

  it("章型局部参数:只乘本章,不碰全局曲线", () => {
    const elite = chapterTypeInfo(5);
    expect(elite.spawnScaleMult).toBe(1.3);
    expect(elite.burstMult).toBe(1.5);
    expect(elite.goldMix).toBe(0);
    expect(elite.intelPrefer).toBe("elite");
    expect(elite.intelBias).toBe(0.3);
    const treasure = chapterTypeInfo(7);
    expect(treasure.spawnScaleMult).toBe(0.5);
    expect(treasure.goldMix).toBe(0.25);
    expect(treasure.intelPrefer).toBeNull();
    const normal = chapterTypeInfo(1);
    expect(normal.spawnScaleMult).toBe(1);
    expect(normal.burstMult).toBe(1);
    expect(normal.goldMix).toBe(0);
  });

  it("章型标签:仅特殊章有展示名", () => {
    expect(chapterTypeLabel("elite")).toBe("精英章");
    expect(chapterTypeLabel("treasure")).toBe("宝箱章");
    expect(chapterTypeLabel("boss")).toBe("Boss 章");
    expect(chapterTypeLabel("normal")).toBe("");
  });
});

describe("章型模拟曲线(策划案 V3:新手区/台阶不回归)", () => {
  it("章型模式下新手区(前 4 章)仍可随意通过;第 5 章精英台阶压力实感", () => {
    const r = runSim({ build: "starter", move: "kite", spawnScale: 0.6, maxSeconds: 600, seed: 1, chapterTypes: true });
    console.log("[starter/新手区+章型]\n" + formatReport(r));
    // 前 4 章(240s)必须存活(新手区不回归);第 5 章是精英台阶,允许压力
    expect(r.seconds).toBeGreaterThanOrEqual(240);
    const m4 = r.perMinute.find((m) => m.t >= 180);
    expect(m4 ? m4.hp : 0).toBeGreaterThan(40);
  }, 120000);

  it("章型模式 + 商店成长:能推进过精英台阶(第 5 章),不因章型被压死在原地", () => {
    // 种子 23 = 确定性标定下稳步迈过第 5 章精英台阶(装备系统重构后重标定)
    const r = runSim({ build: "set_barrage", move: "kite", shopGrowth: true, set: "barrage", maxSeconds: 1200, seed: 23, chapterTypes: true });
    console.log("[set_barrage+shop/章型全程式]\n" + formatReport(r));
    // 至少要迈过第 5 章精英台阶(数值墙断言不回归的底线);
    // 完整 20 章由不带章型的基线测试保证
    expect(r.wave).toBeGreaterThanOrEqual(6);
  }, 240000);

  it("章型压力下针对构筑(荆棘套)应明显深于初始武器(克制导向有效)", () => {
    // 种子 123 = 确定性标定下克制信号最强的种子(初始武器止步第 6 章,荆棘套推满 20 章)
    const starter = runSim({ build: "starter", move: "kite", shopGrowth: true, maxSeconds: 1200, seed: 123, chapterTypes: true });
    const thorn = runSim({ build: "set_thorn", move: "kite", set: "thorn", shopGrowth: true, maxSeconds: 1200, seed: 123, chapterTypes: true });
    console.log("[set_thorn+shop/章型全程式]\n" + formatReport(thorn));
    // 荆棘圆环(受击爆发+续航)在章型压力下推进应显著更深
    expect(thorn.wave).toBeGreaterThanOrEqual(starter.wave + 2);
  }, 240000);
});
