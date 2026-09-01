/**
 * 敌人移动与碰撞测试 —— 修复"怪物与玩家重合"回归保护。
 */

import { describe, it, expect } from "vitest";
import { spawnEnemy, updateEnemy } from "../src/entities/enemy";
import { vec2 } from "../src/core/math";

describe("敌人不与目标重合", () => {
  it("贴身敌人停在碰撞半径之外,不再穿过目标中心", () => {
    const enemy = spawnEnemy("chaser", vec2(0, 0), 1); // 出生在玩家位置(玩家半径 16)
    const player = vec2(0, 0);
    const stop = enemy.def.radius + 16;

    for (let i = 0; i < 300; i++) {
      updateEnemy(enemy, player, 16, 1 / 60);
    }
    const d = Math.hypot(enemy.pos.x - player.x, enemy.pos.y - player.y);
    // 停在贴身距离附近,且绝不为 0(不重合)
    expect(d).toBeGreaterThanOrEqual(stop * 0.7);
    expect(d).toBeLessThanOrEqual(stop * 1.5);
  });

  it("远处敌人正常追击靠近", () => {
    const enemy = spawnEnemy("chaser", vec2(500, 0), 1);
    const player = vec2(0, 0);
    const d0 = Math.hypot(enemy.pos.x - player.x, enemy.pos.y - player.y);
    updateEnemy(enemy, player, 16, 1);
    const d1 = Math.hypot(enemy.pos.x - player.x, enemy.pos.y - player.y);
    expect(d1).toBeLessThan(d0);
  });

  it("两个贴身敌人会沿切向分开,不会永久叠在同一位置", () => {
    const a = spawnEnemy("chaser", vec2(0, 0), 1);
    const b = spawnEnemy("swift", vec2(0, 0), 1);
    const player = vec2(0, 0);
    for (let i = 0; i < 120; i++) {
      updateEnemy(a, player, 16, 1 / 60);
      updateEnemy(b, player, 16, 1 / 60);
    }
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    expect(d).toBeGreaterThan(2); // 两个敌人不再重合
  });
});
