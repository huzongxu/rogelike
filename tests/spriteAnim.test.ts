import { describe, expect, it } from "vitest";
import {
  ANIM_ATTACK_FRAMES, ANIM_COLS, ANIM_ROWS, ANIM_WALK_FRAMES,
  animCellRect, animCellSize, animCol, animDir, attackDuration,
} from "../cocos/assets/scripts/game/ui/spriteAnim";

describe("spriteAnim:朝向选行", () => {
  it("八个主方向落到 5 行 + 镜像(屏幕 y 向下)", () => {
    expect(animDir(1, 0)).toEqual({ row: 2, flip: false }); // E
    expect(animDir(1, 1)).toEqual({ row: 1, flip: false }); // SE
    expect(animDir(0, 1)).toEqual({ row: 0, flip: false }); // S
    expect(animDir(-1, 1)).toEqual({ row: 1, flip: true }); // SW
    expect(animDir(-1, 0)).toEqual({ row: 2, flip: true }); // W
    expect(animDir(-1, -1)).toEqual({ row: 3, flip: true }); // NW
    expect(animDir(0, -1)).toEqual({ row: 4, flip: false }); // N
    expect(animDir(1, -1)).toEqual({ row: 3, flip: false }); // NE
  });
  it("扇区边界与零向量", () => {
    expect(animDir(0, 0)).toEqual({ row: 0, flip: false });
    // 22.5° 以内仍算 E;略过 22.5° 进 SE
    expect(animDir(Math.cos(0.3), Math.sin(0.3))).toEqual({ row: 2, flip: false });
    expect(animDir(Math.cos(0.5), Math.sin(0.5))).toEqual({ row: 1, flip: false });
    // 正西两侧(±180°)都镜像 E 行
    expect(animDir(-1, 1e-9)).toEqual({ row: 2, flip: true });
    expect(animDir(-1, -1e-9)).toEqual({ row: 2, flip: true });
  });
});

describe("spriteAnim:状态选列", () => {
  it("行走 4 帧循环、攻击 3 帧停末帧、待机首帧", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 2; t += 1 / 60) seen.add(animCol("walk", t, 8));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(animCol("walk", 0, 8)).toBe(0);
    expect(animCol("walk", -0.01, 8)).toBeGreaterThanOrEqual(0);
    expect(animCol("attack", 0, 10)).toBe(ANIM_WALK_FRAMES);
    expect(animCol("attack", 0.15, 10)).toBe(ANIM_WALK_FRAMES + 1);
    expect(animCol("attack", 10, 10)).toBe(ANIM_COLS - 1);
    expect(animCol("idle", 5, 8)).toBe(0);
    expect(attackDuration(10)).toBeCloseTo(ANIM_ATTACK_FRAMES / 10);
  });
});

describe("spriteAnim:图集几何", () => {
  it("格尺寸按 7×5 整除,除不尽返回 null;格框按行列定位", () => {
    expect(animCellSize(44 * ANIM_COLS, 44 * ANIM_ROWS)).toEqual({ w: 44, h: 44 });
    expect(animCellSize(300, 220)).toBeNull();
    expect(animCellRect(4, 6, 44, 44)).toEqual({ x: 264, y: 176, w: 44, h: 44 });
  });
});
