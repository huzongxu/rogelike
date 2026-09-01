/**
 * 数值平衡测试 —— 用 balance-sim 跑长局,检查节奏是否在策划案目标区间。
 * 策划案 4.1:单局 15-30 分钟。断言保持宽松,重点是报告曲线(可读日志查看)。
 */

import { describe, it, expect } from "vitest";
import { runSim, formatReport } from "../scripts/balance-sim";

describe("长局数值平衡", () => {
  it("初始武器(自动风筝):第 1 关前 5 章新手区可随意通过(数值墙台阶在第 5-6 章)", () => {
    const r = runSim({ build: "starter", move: "kite", spawnScale: 0.6, maxSeconds: 600, seed: 1 });
    console.log("[starter/新手区]\n" + formatReport(r));
    // 前 5 章(300s)存活,且第 5 章末(240s)HP 健康
    expect(r.seconds).toBeGreaterThanOrEqual(300);
    const m5 = r.perMinute.find((m) => m.t >= 240);
    expect(m5 ? m5.hp : 0).toBeGreaterThan(50);
  }, 120000);

  it("死亡连锁(挂机):5 分钟内应进入波 4+", () => {
    const r = runSim({ build: "chain", move: "idle", maxSeconds: 300, seed: 2 });
    console.log("[chain/idle]\n" + formatReport(r));
    expect(r.wave).toBeGreaterThanOrEqual(4);
    expect(r.kills).toBeGreaterThan(100);
  }, 90000);

  it("移动炮台(风筝):移动触发器生效,输出稳定", () => {
    const r = runSim({ build: "turret", move: "kite", maxSeconds: 300, seed: 3 });
    console.log("[turret/kite]\n" + formatReport(r));
    expect(r.kills).toBeGreaterThan(50);
  }, 90000);

  it("进阶 Build(挂机):8 分钟内应推进到第 6 章(需求优化 v2 章节制;等级系统已移除)", () => {
    const r = runSim({ build: "godly", move: "idle", maxSeconds: 480, seed: 4 });
    console.log("[godly/idle]\n" + formatReport(r));
    expect(r.wave).toBeGreaterThanOrEqual(6);
  }, 120000);

  it("进阶 Build + 征服者天赋(风筝):应明显强于无天赋(输出与存活)", () => {
    // 击杀数被刷怪/敌人上限封顶、噪声主导,不能用作强度信号;
    // 高压场(场子始终打满)下累计伤害 = 有效 DPS × 时长,是确定性输出信号。
    // 天赋增伤/暴击/元素 → 总伤害与存活都显著更高。
    const base = runSim({ build: "godly", move: "kite", maxSeconds: 900, seed: 5, spawnScale: 3 });
    const boosted = runSim({ build: "godly", move: "kite", maxSeconds: 900, seed: 5, boosted: true, spawnScale: 3 });
    console.log("[godly/kite 高压]\n" + formatReport(base) + `\n  总伤害 ${Math.round(base.totalDamage)}`);
    console.log("[godly/kite+boost 高压]\n" + formatReport(boosted) + `\n  总伤害 ${Math.round(boosted.totalDamage)}`);
    expect(boosted.seconds).toBeGreaterThanOrEqual(base.seconds);
    expect(boosted.totalDamage).toBeGreaterThan(base.totalDamage * 1.03);
  }, 120000);

  it("新手局(初始武器+商店成长):金币出口生效后应推过数值墙到达 20 章", () => {
    const r = runSim({ build: "starter", move: "kite", shopGrowth: true, maxSeconds: 1200, seed: 21 });
    console.log("[starter+shop/新手全程式]\n" + formatReport(r));
    // 金币出口(槽位扩展)应真正参与:槽位明显高于旧基础 4
    expect(r.finalSlots).toBeGreaterThanOrEqual(6);
    // 能走完全程 20 章(不再中途被数值墙压死)
    expect(r.wave).toBeGreaterThanOrEqual(20);
  }, 240000);
});

describe("武器套组数值平衡(需求优化 v2:2/4 件套联动)", () => {
  it("弹幕风暴 4 件套(风筝):第 1 章(60s)内不死且击杀明显高于初始武器", () => {
    const r = runSim({ build: "barrage4", move: "kite", set: "barrage", maxSeconds: 120, seed: 6 });
    console.log("[barrage4/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.kills).toBeGreaterThan(30);
  }, 60000);

  it("余烬天灾 4 件套(风筝):第 1 章内不死,范围输出正常", () => {
    const r = runSim({ build: "ember4", move: "kite", set: "ember", maxSeconds: 120, seed: 7 });
    console.log("[ember4/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.kills).toBeGreaterThan(30);
  }, 60000);

  it("荆棘回响 4 件套(风筝):续航型套组,第 1 章内不死(反伤回响 + 棘肤)", () => {
    const r = runSim({ build: "thorn4", move: "kite", set: "thorn", maxSeconds: 120, seed: 8 });
    console.log("[thorn4/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
  }, 60000);

  it("同 Build 开 4 件套应强于不开套组(套组联动有效)", () => {
    const noSet = runSim({ build: "barrage4", move: "kite", maxSeconds: 120, seed: 9 });
    const withSet = runSim({ build: "barrage4", move: "kite", set: "barrage", maxSeconds: 120, seed: 9 });
    console.log("[barrage4 no-set]\n" + formatReport(noSet));
    console.log("[barrage4 +set]\n" + formatReport(withSet));
    expect(withSet.kills).toBeGreaterThan(noSet.kills);
  }, 60000);
});

describe("套组初始武器平衡(需求:选套组即定本局基调)", () => {
  it("弹幕风暴初始武器「寒霜风暴」:第 1 章(60s)内可清场不死", () => {
    const r = runSim({ build: "set_barrage", move: "kite", set: "barrage", maxSeconds: 60, seed: 11 });
    console.log("[寒霜风暴/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.kills).toBeGreaterThan(25);
  }, 60000);

  it("余烬天灾初始武器「连闪天火」:第 1 章内可清场不死", () => {
    const r = runSim({ build: "set_ember", move: "kite", set: "ember", maxSeconds: 60, seed: 12 });
    console.log("[连闪天火/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.kills).toBeGreaterThan(25);
  }, 60000);

  it("荆棘回响初始武器「荆棘圆环」:受击爆发,第 1 章内可清场不死", () => {
    const r = runSim({ build: "set_thorn", move: "kite", set: "thorn", maxSeconds: 60, seed: 13 });
    console.log("[荆棘圆环/kite]\n" + formatReport(r));
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.kills).toBeGreaterThan(20);
  }, 60000);
});
