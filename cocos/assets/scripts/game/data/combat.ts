/**
 * 玩家基础与战斗结算策划规范表 —— 策划案 4.2(环境词缀联动)/ V3 §3.2(Boss 战)。
 *
 * 本表是玩家基础属性、成长曲线与战斗内结算常量的唯一出处(数据层);
 * entities/player.ts 与 game.ts 的战斗结算只读数(历史导入路径经各自模块再导出兼容)。
 * 单位约定:半径/距离 = px,生命 = 点,速度 = px/秒,时间 = 秒,比例 = 0–1。
 */

/* ---------- 玩家基础属性 ---------- */

/**
 * 玩家基础属性(无装备/天赋白值):
 * 半径 16 = 与敌人接触判定、拾取判定共用的碰撞圆;
 * 移速 240 = 新手标定:可稳躲震击预警(1.2s 蓄力)与围杀缺口;
 * 生命 100 = 数值墙锚点:新手稳态 75–95(见 BOSS_SLAM 80 伤害标定);
 * 每级 +8 生命 = 温和成长,主成长来自装备/收藏/天赋而非等级;
 * 4 主动法宝槽 = 取舍提前到第 2–3 章(docs/DESIGN-HERO-RHYTHM.md §4.3 / R7,用户裁定 B,2026-09-13):
 *   3 独有技能 + 4 法宝 = 7 个施放源,每件看得清;天赋最多 +2、本局广告 +1,硬顶 SHOP_SLOT_CAP 6。
 */
export const PLAYER_BASE = {
  radius: 16,
  speed: 240,
  maxHp: 100,
  hpPerLevel: 8,
  slots: 4,
};

/* ---------- 等级与经验 ---------- */

/**
 * 升级经验曲线(温和递增):xpToNext = floor(XP_BASE + level×XP_PER_LEVEL + level^XP_POWER_EXP × XP_POWER_COEF)。
 * 战斗内无传统等级成长压力(成长来自装备),曲线只需提供节奏感与升级回血反馈。
 */
export const XP_BASE = 8;
export const XP_PER_LEVEL = 5;
export const XP_POWER_EXP = 1.5;
export const XP_POWER_COEF = 1.0;

export function xpToNext(level: number): number {
  return Math.floor(XP_BASE + level * XP_PER_LEVEL + Math.pow(level, XP_POWER_EXP) * XP_POWER_COEF);
}

/** 升级回复比例:升级时回复 20% 最大生命(小奖励感,不替代治疗手段) */
export const LEVELUP_HEAL_PCT = 0.2;

/* ---------- 受击与连杀 ---------- */

/** 接触伤害判定间隔(秒):同一敌人贴身后每 0.8s 结算一次,防每帧咬人 */
export const CONTACT_HIT_CD = 0.8;

/**
 * 隐藏触发器「暴击触发」的冷却(秒):防高频暴击把效果刷成连发,口径与受击触发一致。
 * 受击触发那条 0.7s 仍内联在引擎里(冻结基准,不在本次改动面),本常量只服务新增的暴击触发。
 */
export const CRIT_TRIGGER_CD = 0.7;

/** 连杀窗口(秒):3 秒无新击杀断连 */
export const COMBO_WINDOW = 3;
/** 每 10 连杀触发一次狂潮 */
export const COMBO_FRENZY_EVERY = 10;
/** 狂潮持续时长(秒) */
export const FRENZY_DURATION = 2;
/** 狂潮期间全装备触发间隔倍率(×0.6 = 弹幕加速反馈) */
export const FRENZY_PULSE_MULT = 0.6;

/**
 * 反射伤害预算:玩家侧反伤(反射者/反伤领域)每秒最多造成 15% 最大生命的伤害,
 * 防止高频弹幕被反射秒杀玩家(惩罚可读,不处刑)。
 */
export const REFLECT_BUDGET_HP_PCT = 0.15;

/** 荆棘反伤回血流:每次挨打回 2% 最大生命(故意挨打 → 回血联动,Build 身份) */
export const THORN_HEAL_PCT = 0.02;

/* ---------- 击杀掉落(场内金币经济;替代经验宝石) ---------- */

/**
 * 金币换算:击杀掉落金币 = 敌人金币基数 × 本值(每日天赋「淘金」另乘倍率)。
 * 2 → 1(A4 重标):出口侧补齐了场内强化与升级重随两个深出口后,产出侧砍半,
 * 让"每章末余额"回到"够买一张卡、但买不光货架"的区间。依据见 docs/DESIGN-SEASON-FEEL.md A4。
 */
export const GOLD_PER_XP = 1;
/** Boss 击杀固定掉 45 金(不走上式,bosses 是主要金币节点);A4 由 60 下调,与产出侧同比例 */
export const BOSS_GOLD = 45;
/** 精英死亡掉落的金币堆数(普通敌人 1 堆);A4 由 8 下调 —— 精英章原本是单章产出的尖峰 */
export const ELITE_GEM_COUNT = 6;
/** 金币掉落散布半径(±px,围绕尸体) */
export const DROP_SCATTER = 10;

/** 金币拾取:距离玩家半径 + 8px 内拾取;无自动拾取天赋时 420px 内开始吸附 */
export const GEM_PICK_RADIUS_BONUS = 8;
export const GEM_MAGNET_RADIUS = 420;

/* ---------- 召唤物(骷髅/灵狼)行为参数 ---------- */

/** 召唤物索敌视野(px):320 内找最近敌人 */
export const MINION_SIGHT = 320;
/** 召唤物攻击距离(px):100 内出手,否则追击 */
export const MINION_ATTACK_RANGE = 100;
/** 召唤物攻击附带的击退力度 */
export const MINION_HIT_KNOCKBACK = 20;
/** 亡灵契约:召唤物攻击时治疗主人,量为本次伤害的 30% */
export const MINION_HEAL_ON_HIT_PCT = 0.3;
/** 无目标时跟随玩家:距离 > 60px 才移动(贴身环绕不打扰) */
export const MINION_FOLLOW_LEASH = 60;

/* ---------- 复活(广告复活;弹壳式) ---------- */

/** 复活后 2 秒无敌盾:避免复活瞬间被贴身围杀 */
export const REVIVE_SHIELD_SECONDS = 2;
/** 复活时清空玩家周围 70px 内的敌人(喘息空间) */
export const REVIVE_CLEAR_RADIUS = 70;

/* ---------- Boss 出场(策划案 V3 §3.1) ---------- */

/** Boss 出场位置:玩家右侧 260px、下方 60px,并被竞技场边界收进 60px(保证完整登场) */
export const BOSS_SPAWN_OFFSET_X = 260;
export const BOSS_SPAWN_OFFSET_Y = 60;
export const BOSS_SPAWN_INSET = 60;
