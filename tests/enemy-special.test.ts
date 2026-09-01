/**
 * 敌人特化机制测试 —— 策划案 4.3:反射/分裂/隐身/吞噬/护盾/召唤。
 */

import { describe, it, expect } from "vitest";
import {
  spawnEnemy,
  updateSpecial,
  reflectDamage,
  shieldguardDamageMult,
  splitBabies,
  randomEnemyKind,
} from "../src/entities/enemy";
import { vec2 } from "../src/core/math";

describe("反射者(反弹伤害)", () => {
  it("按 25% 比例反弹伤害", () => {
    const e = spawnEnemy("reflector", vec2(0, 0), 1);
    expect(reflectDamage(e, 100)).toBe(25);
    expect(reflectDamage(e, 1)).toBe(1); // 至少 1
  });
  it("普通敌人不反弹", () => {
    const e = spawnEnemy("chaser", vec2(0, 0), 1);
    expect(reflectDamage(e, 100)).toBe(0);
  });
});

describe("分裂体(死亡后分裂)", () => {
  it("死亡后分裂出 2 个分裂幼体", () => {
    const e = spawnEnemy("splitter", vec2(0, 0), 1);
    const babies = splitBabies(e);
    expect(babies).toHaveLength(2);
    expect(babies.every((b) => b.kind === "splitling")).toBe(true);
  });
  it("普通敌人不分裂", () => {
    const e = spawnEnemy("tank", vec2(0, 0), 1);
    expect(splitBabies(e)).toHaveLength(0);
  });
});

describe("隐匿者(周期性隐身)", () => {
  it("周期 5 秒:前 3 秒可见,后 2 秒隐身", () => {
    const e = spawnEnemy("hider", vec2(0, 0), 1);
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) updateSpecial(e, 1, () => {});
    };
    tick(4); // 计时 4s → 4%5=4 ≥ 3:隐身
    expect(e.hidden).toBe(true);
    tick(1); // 5s → 0:可见
    expect(e.hidden).toBe(false);
    tick(3); // 8s → 3:隐身
    expect(e.hidden).toBe(true);
  });
});

describe("护盾卫士(正面免疫)", () => {
  it("正面 60° 内伤害减免 80%", () => {
    const e = spawnEnemy("shieldguard", vec2(0, 0), 1);
    e.facing = vec2(1, 0); // 面向 +x
    expect(shieldguardDamageMult(e, vec2(50, 0))).toBe(0.2); // 正前方
    expect(shieldguardDamageMult(e, vec2(-50, 0))).toBe(1); // 正后方
    expect(shieldguardDamageMult(e, vec2(0, 50))).toBe(1); // 正侧面(90°)
  });
});

describe("召唤师(持续召唤小怪)", () => {
  it("每 4 秒召唤 2 个小怪", () => {
    const e = spawnEnemy("summoner", vec2(0, 0), 1);
    const spawned: string[] = [];
    for (let i = 0; i < 3; i++) updateSpecial(e, 1, (kind) => spawned.push(kind));
    expect(spawned).toHaveLength(0); // 3 秒未到
    updateSpecial(e, 1, (kind) => spawned.push(kind));
    expect(spawned).toHaveLength(2); // 第 4 秒触发
    expect(spawned.every((k) => k === "chaser")).toBe(true);
  });
});

describe("波次登场门槛", () => {
  it("低波次只出现基础敌人(特化敌人需波 3+)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(randomEnemyKind(1));
    expect(seen.has("reflector")).toBe(false);
    expect(seen.has("hider")).toBe(false);
    expect(seen.has("splitter")).toBe(false);
    expect(seen.has("devourer")).toBe(false);
    expect(seen.has("shieldguard")).toBe(false);
    expect(seen.has("summoner")).toBe(false);
    // 高波次可出特化敌人
    const seenHigh = new Set<string>();
    for (let i = 0; i < 3000; i++) seenHigh.add(randomEnemyKind(6));
    expect(seenHigh.has("reflector")).toBe(true);
    expect(seenHigh.has("summoner")).toBe(true);
    expect(seenHigh.has("shieldguard")).toBe(true);
  });
});
