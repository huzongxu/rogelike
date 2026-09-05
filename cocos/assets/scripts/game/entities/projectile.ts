/**
 * 投射物:飞刀(knife)与冰霜射线(ray)共用。
 * 支持穿透(pierce)、连锁(chain)、爆炸(explode)、吸血(lifesteal)修饰器行为。
 */

import { type Vec2, vec2 } from "../core/math";
import type { Equipment } from "../data/equipmentGen";
import {
  PROJECTILE_RADIUS_KNIFE,
  PROJECTILE_RADIUS_RAY,
  CHAIN_RANGE_DEFAULT,
  PROJECTILE_TTL,
  HOMING_SEARCH_RANGE,
} from "../data/field";

export interface Projectile {
  id: number;
  kind: "knife" | "ray";
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  /** 剩余穿透次数 */
  pierce: number;
  /** 剩余连锁目标数(命中后弹向最近的其他敌人) */
  chainLeft: number;
  /** 连锁检索半径 */
  chainRange: number;
  /** 爆炸修饰器参数(若有) */
  explode?: { radius: number; damageMult: number };
  /** 吸血比例 0-1 */
  lifesteal: number;
  /** 减速(射线专用) */
  slow?: number;
  slowDuration?: number;
  /** 追踪转向率 rad/s(冰锥 icelance 专用;0/缺省 = 直线弹道) */
  homing?: number;
  ttl: number;
  /** 已命中的敌人 id,避免重复伤害 */
  hit: Set<number>;
  /** 上一帧位置(高速弹道线段-圆碰撞检测用,防止弹道"跳过"小目标) */
  prevPos: Vec2;
  source: Equipment;
  /** 组合技「弹幕风暴」的分裂子弹:其击杀不再触发分裂(防无限递归,策划案 V3 §5) */
  splitChild?: boolean;
  /** 纯装饰:FX 层拖尾的发射累计距离,不参与任何结算/标定 */
  trailAcc?: number;
  /** 命中目标后的回调(链式命中需要返回新目标用于继续弹射) */
  onHit?: (p: Projectile, target: EnemyRef) => void;
}

/** 最小化依赖:引擎层用结构体重写该字段 */
export interface EnemyRef {
  id: number;
  pos: Vec2;
  hp: number;
}

let uid = 0;

/** 仅标定/测试用:重置投射物 id 计数(保证模拟确定性) */
export function _resetProjectileUid(): void {
  uid = 0;
}

export function spawnProjectile(opts: {
  kind: "knife" | "ray";
  pos: Vec2;
  dir: Vec2;
  speed: number;
  damage: number;
  radius?: number;
  pierce?: number;
  chainLeft?: number;
  chainRange?: number;
  explode?: { radius: number; damageMult: number };
  lifesteal?: number;
  slow?: number;
  slowDuration?: number;
  homing?: number;
  source: Equipment;
  splitChild?: boolean;
}): Projectile {
  return {
    id: ++uid,
    kind: opts.kind,
    pos: vec2(opts.pos.x, opts.pos.y),
    prevPos: vec2(opts.pos.x, opts.pos.y),
    vel: vec2(opts.dir.x * opts.speed, opts.dir.y * opts.speed),
    radius: opts.radius ?? (opts.kind === "ray" ? PROJECTILE_RADIUS_RAY : PROJECTILE_RADIUS_KNIFE),
    damage: opts.damage,
    pierce: opts.pierce ?? 0,
    chainLeft: opts.chainLeft ?? 0,
    chainRange: opts.chainRange ?? CHAIN_RANGE_DEFAULT,
    explode: opts.explode,
    lifesteal: opts.lifesteal ?? 0,
    slow: opts.slow,
    slowDuration: opts.slowDuration,
    homing: opts.homing,
    ttl: PROJECTILE_TTL,
    hit: new Set(),
    source: opts.source,
    splitChild: opts.splitChild,
  };
}

/**
 * 追踪转向(冰锥 icelance):把弹道速度以 homing(rad/s)上限转向最近的未命中活敌。
 * 保速度大小只转方向;无目标/超出检索半径则保持直线。由持敌表的更新方逐帧调用。
 */
export function steerHoming(p: Projectile, targets: readonly EnemyRef[], dt: number, searchRange = HOMING_SEARCH_RANGE): void {
  const turn = p.homing;
  if (!turn) return;
  let best: EnemyRef | null = null;
  let bestD = searchRange;
  for (const e of targets) {
    if (e.hp <= 0 || p.hit.has(e.id)) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  const speed = Math.hypot(p.vel.x, p.vel.y) || 1;
  const cur = Math.atan2(p.vel.y, p.vel.x);
  const want = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
  let delta = want - cur;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = turn * dt;
  const ang = cur + Math.max(-maxTurn, Math.min(maxTurn, delta));
  p.vel.x = Math.cos(ang) * speed;
  p.vel.y = Math.sin(ang) * speed;
}

export function updateProjectile(p: Projectile, dt: number): void {
  // 记录移动前位置(高速弹道碰撞用线段检测,避免每帧步长 > 碰撞半径时"跳过"目标)
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y;
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.ttl -= dt;
}

/**
 * 投影弹碰撞检测:线段(prevPos → pos)与目标圆的相交检测。
 * 修复:高速弹道(每帧步长 26px)对小球目标(碰撞半径 19px)的点检测会穿透跳过,
 * 密集扇形被掩盖、全向弹幕(初始武器)会大量脱靶。
 */
export function projectileHits(p: Projectile, target: { pos: Vec2; radius: number }): boolean {
  const rr = p.radius + target.radius;
  const dx = p.pos.x - p.prevPos.x;
  const dy = p.pos.y - p.prevPos.y;
  const fx = p.prevPos.x - target.pos.x;
  const fy = p.prevPos.y - target.pos.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= rr * rr; // 未移动:退化点检测
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - rr * rr;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1;
}
