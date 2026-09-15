/**
 * 场地实体策划规范表 —— 投射物/召唤物/金币/障碍物的默认参数与地形生成规则。
 *
 * 本表是场地实体默认值的唯一出处(数据层);
 * entities/projectile.ts 与 entities/objects.ts 只保留实体结构与运行时逻辑(历史导入路径经再导出兼容)。
 * 单位约定:半径/距离 = px,速度 = px/秒,时间 = 秒,伤害 = 点。
 */

/* ---------- 投射物默认值 ---------- */

/** 弹体碰撞半径:飞刀 5 / 射线 7(射线贴脸覆盖更宽) */
export const PROJECTILE_RADIUS_KNIFE = 5;
export const PROJECTILE_RADIUS_RAY = 7;
/** 连锁检索半径:命中后在 300px 内寻找下一个弹射目标 */
export const CHAIN_RANGE_DEFAULT = 300;
/** 弹体存活时长(秒):2.5 未命中即消失,防场外残留 */
export const PROJECTILE_TTL = 2.5;
/** 追踪弹(冰锥)索敌半径:640 内转向最近未命中活敌 */
export const HOMING_SEARCH_RANGE = 640;

/* ---------- 召唤物默认值(骷髅;灵狼等变体在 cast 时按倍率覆盖) ---------- */

/** 召唤物默认移速(灵狼 ×1.3) */
export const MINION_SPEED_DEFAULT = 210;
/** 召唤物碰撞半径 */
export const MINION_RADIUS = 12;
/** 召唤物攻击间隔(秒) */
export const MINION_ATTACK_INTERVAL = 0.9;
/** 召唤物默认配色(白骨蓝) */
export const MINION_COLOR_DEFAULT = "#b8e6ff";

/* ---------- 金币(原经验宝石) ---------- */

/** 金币掉落后延迟吸附(秒):给击杀反馈留一拍 */
export const GEM_PICKUP_DELAY = 0.4;
/** 金币吸附飞行速度(px/秒) */
export const GEM_MAGNET_SPEED = 340;

/* ---------- 障碍物(策划案 V3 §6 / DESIGN-S4 §3:石柱挡路 + 毒池 DoT) ---------- */

export const OBSTACLE = {
  /** 石柱碰撞半径(阻挡移动,最小位移推出) */
  pillarRadius: 40,
  /** 毒池半径(进入即 DoT,不阻挡移动) */
  poolRadius: 90,
  /** 毒池每秒伤害:6 点/秒(0.25s tick × 1.5,不走受击管线 —— 是地形不是攻击) */
  poolDps: 6,
  /** 毒池结算 tick(秒) */
  poolTick: 0.25,
} as const;

/**
 * 每章障碍摆放规则(DESIGN-S4 §3.1):
 * 数量恒 1 个(R13 真机口径重标,2026-09-15:章首清场后玩家每章回场心,1–2 个时 64 种子均值回落 1.67 章 > 守卫 1;
 *   恒 1 个 → 0.86,距心 ≥240 → 1.23,毒池 4 dps → 1.67 无效;更早的回调:2–3 时石柱挡崩全向弹幕);
 * 竞技场四边内缩 120px 环带内摆放;距中心出生点 ≥180;互相间距 ≥150;
 * 石柱:毒池 = 2:1;单个障碍 30 次采样仍不满足则少放 1 个(不强凑,防出生点被堵)。
 */
export const OBSTACLE_PLACEMENT = {
  countMin: 1,
  countMax: 1,
  inset: 120,
  minCenterDist: 180,
  minSpacing: 150,
  /** 石柱出现概率(2/3;其余为毒池) */
  pillarChance: 2 / 3,
  tries: 30,
  /** 竞技场环带最小可用宽(小于此值放弃摆放) */
  minBandSize: 40,
} as const;
