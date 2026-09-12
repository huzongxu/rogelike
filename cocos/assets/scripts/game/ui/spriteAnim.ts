/**
 * 单位序列帧图集的纯几何:行 = 朝向、列 = 帧,与渲染层无关,可单测。
 *
 * 图集布局(`anim_<key>.png`,由 scripts/pixel-kit.mjs 的 atlas 模式合成):
 *   5 行 = 朝向 S / SE / E / NE / N(屏幕 y 向下为正;朝西的四个方向靠水平镜像东侧行得到,
 *          所以只需画一侧 —— 出图量减半,而且左右对称的角色两侧永远一致);
 *   7 列 = 行走 4 帧 + 攻击 3 帧;
 *   每格边长 = 该单位的贴图边长(export=1,战斗里再按半径缩放)。
 * 图集里没有的单位回退到既有的单帧贴图(按朝向翻转 + 小跳步)。
 */

export const ANIM_ROWS = 5;
export const ANIM_WALK_FRAMES = 4;
export const ANIM_ATTACK_FRAMES = 3;
export const ANIM_COLS = ANIM_WALK_FRAMES + ANIM_ATTACK_FRAMES;

export type AnimState = "idle" | "walk" | "attack";

export interface AnimDir {
  /** 图集行:0 = S,1 = SE,2 = E,3 = NE,4 = N */
  row: number;
  /** 是否水平镜像(朝向落在西侧半圆) */
  flip: boolean;
}

/**
 * 由屏幕坐标系的朝向向量(y 向下为正)选行与镜像。
 * 八个 45° 扇区:E → 行 2;SE → 1;S → 0;N → 4;NE → 3;西侧三向取对应东侧行并镜像。
 * 零向量按朝下(row 0)处理 —— 站立朝向玩家的默认姿态。
 */
export function animDir(dx: number, dy: number): AnimDir {
  if (dx === 0 && dy === 0) return { row: 0, flip: false };
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  switch (sector) {
    case 0: return { row: 2, flip: false };
    case 1: return { row: 1, flip: false };
    case 2: return { row: 0, flip: false };
    case 3: return { row: 1, flip: true };
    case -1: return { row: 3, flip: false };
    case -2: return { row: 4, flip: false };
    case -3: return { row: 3, flip: true };
    default: return { row: 2, flip: true }; // ±4 = W
  }
}

/**
 * 由状态与相位选列。
 * walk:按 `t × fps` 循环 4 帧(调用方把 speed/72 与逐单位错相折进 t);
 * attack:`t` = 攻击起始以来的秒数,3 帧播完停在末帧,调用方按 `attackDuration` 判断是否仍在攻击;
 * idle:行走首帧。
 */
export function animCol(state: AnimState, t: number, fps: number): number {
  if (state === "attack") return ANIM_WALK_FRAMES + Math.min(ANIM_ATTACK_FRAMES - 1, Math.max(0, Math.floor(t * fps)));
  if (state === "walk") return ((Math.floor(t * fps) % ANIM_WALK_FRAMES) + ANIM_WALK_FRAMES) % ANIM_WALK_FRAMES;
  return 0;
}

/** 攻击动画总时长(秒) */
export function attackDuration(fps: number): number {
  return ANIM_ATTACK_FRAMES / fps;
}

/** 图集像素尺寸 → 单格尺寸(整数;图集由管线按整数格合成,除不尽即布局错了) */
export function animCellSize(texW: number, texH: number): { w: number; h: number } | null {
  if (texW % ANIM_COLS !== 0 || texH % ANIM_ROWS !== 0) return null;
  return { w: texW / ANIM_COLS, h: texH / ANIM_ROWS };
}

/** 单行帧带(技能特效 anim_fx_<type>:1 行 × FX_FRAMES 列):按进度 0..1 选帧,末帧停住 */
export const FX_FRAMES = 6;
export function fxFrameIndex(progress: number, count: number = FX_FRAMES): number {
  return Math.max(0, Math.min(count - 1, Math.floor(progress * count)));
}
/** 帧带第 idx 格的像素框;宽不能被 count 整除即布局错了,返回 null */
export function stripCellRect(idx: number, count: number, texW: number, texH: number): { x: number; y: number; w: number; h: number } | null {
  if (texW % count !== 0) return null;
  const w = texW / count;
  return { x: idx * w, y: 0, w, h: texH };
}

/** 第 row 行第 col 列在图集上的像素框(左上原点) */
export function animCellRect(row: number, col: number, cellW: number, cellH: number): { x: number; y: number; w: number; h: number } {
  return { x: col * cellW, y: row * cellH, w: cellW, h: cellH };
}
