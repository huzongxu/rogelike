/**
 * 小型实体合集:毒云(cloud)、骷髅召唤物(minion)、经验宝石(gem)。
 * 三者都只有"位置 + 少量状态",合并在一个文件中便于维护。
 * 默认参数与地形规则见 ../data/field 规范表。
 */

import { type Vec2, vec2 } from "../core/math";
import type { Equipment } from "../data/equipmentGen";
import {
  MINION_SPEED_DEFAULT,
  MINION_RADIUS,
  MINION_ATTACK_INTERVAL,
  MINION_COLOR_DEFAULT,
  GEM_PICKUP_DELAY,
  GEM_MAGNET_SPEED,
  OBSTACLE,
  OBSTACLE_PLACEMENT,
} from "../data/field";

// 策划规范表符号经本模块再导出(历史导入路径兼容;唯一出处在 ../data/field)
export { OBSTACLE } from "../data/field";

/* ---------- 毒云:生成毒云效果,区域持续伤害;带爆炸修饰器时消散爆炸 ---------- */

export interface Cloud {
  id: number;
  pos: Vec2;
  radius: number;
  dps: number;
  /** 剩余时长(秒) */
  ttl: number;
  maxTtl: number;
  /** 伤害累积计时(按帧结算) */
  tickAcc: number;
  /** 爆炸修饰器(消散时触发) */
  explode?: { radius: number; damageMult: number };
  /** 回血池(组合技「深渊裂隙」):不伤敌,玩家入圈每 tick 结算治疗 */
  heals?: boolean;
  /** 霜环(冰霜/扩散,DESIGN-SEASON-SETS §3.2):半径按 expandSpeed 增长,
   *  扫到的敌人吃一次 dps 值伤害 + 减速,已命中集合防重复 */
  ring?: { expandSpeed: number; slow: number; slowDuration: number; hits: Set<number> };
  /** 陨星(火焰/落点,DESIGN-SEASON-SETS §3.3):telegraph 倒计时(ttl=delay),
   *  落点引爆 dps 值伤害,并留下灼烧余烬小云(参数在 cast 时按倍率算好) */
  meteor?: { burnDps: number; burnRadius: number; burnDuration: number };
  source: Equipment;
  /** 纯装饰:陨星灼烧余烬标记,渲染层据此画火焰氛围粒子(不参与结算) */
  fxEmber?: boolean;
}

let uidCloud = 0;

export function spawnCloud(opts: {
  pos: Vec2;
  radius: number;
  dps: number;
  duration: number;
  explode?: { radius: number; damageMult: number };
  heals?: boolean;
  ring?: { expandSpeed: number; slow: number; slowDuration: number };
  meteor?: { burnDps: number; burnRadius: number; burnDuration: number };
  source: Equipment;
  /** 纯装饰:灼烧余烬渲染标记 */
  fxEmber?: boolean;
}): Cloud {
  return {
    id: ++uidCloud,
    pos: vec2(opts.pos.x, opts.pos.y),
    radius: opts.radius,
    dps: opts.dps,
    ttl: opts.duration,
    maxTtl: opts.duration,
    tickAcc: 0,
    explode: opts.explode,
    heals: opts.heals,
    ring: opts.ring ? { ...opts.ring, hits: new Set<number>() } : undefined,
    meteor: opts.meteor,
    source: opts.source,
    fxEmber: opts.fxEmber,
  };
}

/* ---------- 骷髅:召唤骷髅效果。跟随玩家,自动攻击最近敌人 ---------- */

export interface Minion {
  id: number;
  pos: Vec2;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  /** 攻击冷却 */
  attackCd: number;
  attackInterval: number;
  /** 剩余存活时长(秒) */
  ttl: number;
  color: string;
  /** 攻击时治疗主人(亡灵契约) */
  healOnHit: boolean;
  /** 亡灵冠冕唤出的亡影(用于场上 4 上限计数,DESIGN-SEASON-SETS §3.4) */
  shade?: boolean;
  source: Equipment;
  /** 纯装饰:召唤出场爆点是否已播(渲染层一次性标记,不参与结算) */
  fxSpawned?: boolean;
}

let uidMinion = 0;

export function spawnMinion(opts: {
  pos: Vec2;
  hp: number;
  damage: number;
  duration: number;
  healOnHit?: boolean;
  /** 移动速度(缺省 210;灵狼 ×1.3) */
  speed?: number;
  /** 亡影标记(亡灵冠冕 4 上限计数) */
  shade?: boolean;
  color?: string;
  source: Equipment;
}): Minion {
  return {
    id: ++uidMinion,
    pos: vec2(opts.pos.x, opts.pos.y),
    hp: opts.hp,
    damage: opts.damage,
    speed: opts.speed ?? MINION_SPEED_DEFAULT,
    radius: MINION_RADIUS,
    attackCd: 0,
    attackInterval: MINION_ATTACK_INTERVAL,
    ttl: opts.duration,
    color: opts.color ?? MINION_COLOR_DEFAULT,
    healOnHit: opts.healOnHit ?? false,
    shade: opts.shade,
    source: opts.source,
  };
}

/* ---------- 经验宝石:击杀掉落,靠近玩家时被吸附 ---------- */

export interface Gem {
  id: number;
  pos: Vec2;
  value: number;
  /** 短暂延迟后开始吸附 */
  delay: number;
  /** 吸附中速度 */
  magnet: number;
  /** 已被拾取(本帧移除) */
  picked: boolean;
}

let uidGem = 0;

export function spawnGem(pos: Vec2, value: number): Gem {
  return {
    id: ++uidGem,
    pos: vec2(pos.x, pos.y),
    value,
    delay: GEM_PICKUP_DELAY,
    magnet: GEM_MAGNET_SPEED,
    picked: false,
  };
}

/* ---------- 障碍物(策划案 V3 §6 / DESIGN-S4 §3):石柱挡路 + 毒池 DoT ---------- */

export interface Obstacle {
  id: number;
  kind: "pillar" | "pool";
  pos: Vec2;
  radius: number;
  /** 剩余存续时长(秒;批 2 主题怪灼烧池用。地形障碍 = undefined,永不过期) */
  ttl?: number;
  /** 灼烧池标记(批 2 余烬孕体;渲染层据此画火色,DoT 仍走毒池口径) */
  burn?: boolean;
}

// 障碍数值表唯一出处在 ../data/field(上方已再导出)

let uidObstacle = 0;

/**
 * 每章障碍生成(纯函数 + 可注入 rng → 单测 & sim 确定性)。
 * 规则(DESIGN-S4 §3.1):每章 2–4 个;第 1 章与 Boss 章返回空;
 * 位置在竞技场内缩 120px 环带、距中心出生点 ≥180、互相间距 ≥150;
 * 单个障碍 30 次采样仍不满足则少放 1 个(不强凑,防出生点被堵)。
 */
export function rollChapterObstacles(
  chapter: number,
  arena: { x0: number; y0: number; x1: number; y1: number },
  rng: () => number,
  bossChapter?: number
): Obstacle[] {
  if (chapter <= 1) return [];
  if (bossChapter !== undefined && chapter === bossChapter) return [];
  const P = OBSTACLE_PLACEMENT;
  const inset = P.inset;
  const minX = arena.x0 + inset;
  const maxX = arena.x1 - inset;
  const minY = arena.y0 + inset;
  const maxY = arena.y1 - inset;
  if (maxX - minX < P.minBandSize || maxY - minY < P.minBandSize) return []; // 竞技场过小,放不下环带
  const cx = (arena.x0 + arena.x1) / 2;
  const cy = (arena.y0 + arena.y1) / 2;
  const want = P.countMin + Math.floor(rng() * (P.countMax - P.countMin + 1)); // 1–2 个(标定回调:2–3 时石柱挡崩全向弹幕,新手局回落超 1 章)
  const placed: Obstacle[] = [];
  for (let i = 0; i < want; i++) {
    const kind: Obstacle["kind"] = rng() < P.pillarChance ? "pillar" : "pool";
    for (let s = 0; s < P.tries; s++) {
      const x = minX + rng() * (maxX - minX);
      const y = minY + rng() * (maxY - minY);
      if (Math.hypot(x - cx, y - cy) < P.minCenterDist) continue;
      if (placed.some((o) => Math.hypot(x - o.pos.x, y - o.pos.y) < P.minSpacing)) continue;
      placed.push({
        id: ++uidObstacle,
        kind,
        pos: vec2(x, y),
        radius: kind === "pillar" ? OBSTACLE.pillarRadius : OBSTACLE.poolRadius,
      });
      break;
    }
    // 放不下即放弃该个(少放 1 个,不强凑)
  }
  return placed;
}

/**
 * 灼烧池(批 2 余烬孕体死亡遗留):kind 仍为 pool → isInPool/DoT 逐帧复用毒池口径,
 * 只多挂 ttl 与 burn 标记(渲染火色、到期移除)。
 */
export function spawnBurnPool(pos: Vec2, radius: number, duration: number): Obstacle {
  return { id: ++uidObstacle, kind: "pool", pos: vec2(pos.x, pos.y), radius, ttl: duration, burn: true };
}

/** 临时障碍倒计时(就地):带 ttl 的障碍到期移除;地形障碍(无 ttl)不受影响 */
export function tickObstacleTtl(obstacles: Obstacle[], dt: number): void {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.ttl === undefined) continue;
    o.ttl -= dt;
    if (o.ttl <= 0) obstacles.splice(i, 1);
  }
}

/** 石柱推挤:把圆最小位移推出石柱外,返回是否发生推挤(仅石柱;毒池不阻挡移动) */
export function pushOutOfPillar(pos: Vec2, radius: number, ob: Obstacle): boolean {
  if (ob.kind !== "pillar") return false;
  const rr = ob.radius + radius;
  const dx = pos.x - ob.pos.x;
  const dy = pos.y - ob.pos.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-3) {
    // 正中心方向未定义:定向推 +x(与 enemy.ts 贴身校正同款退化处理)
    pos.x = ob.pos.x + rr;
    return true;
  }
  pos.x = ob.pos.x + (dx / d) * rr;
  pos.y = ob.pos.y + (dy / d) * rr;
  return true;
}

/** 中心点是否位于任一毒池内(地形 DoT 判定;游戏与 sim 同口径) */
export function isInPool(pos: Vec2, obstacles: readonly Obstacle[]): boolean {
  return obstacles.some((o) => o.kind === "pool" && Math.hypot(pos.x - o.pos.x, pos.y - o.pos.y) <= o.radius);
}

/** 仅标定/测试用:重置毒云/骷髅/宝石/障碍 id 计数(保证模拟确定性) */
export function _resetObjectUids(): void {
  uidCloud = 0;
  uidMinion = 0;
  uidGem = 0;
  uidObstacle = 0;
}
