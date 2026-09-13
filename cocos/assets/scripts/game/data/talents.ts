/**
 * 回响天赋树 —— 策划案 5.2 三系全量定义:构筑师(91)/效率专家(91)/征服者。
 * 跨局永久增益。层级解锁规则:1 层无前置;N 层需要已拥有至少 1 个同路线 N-1 层节点。
 */

export type TalentId =
  /* 构筑师 */
  | "extra_gear"
  | "quick_start"
  | "affix_taste"
  | "slot1"
  | "targeted_search"
  | "affix_preview"
  | "reforge"
  | "slot2"
  | "universal"
  | "blueprint"
  /* 效率专家 */
  | "offline1"
  | "exp_gain"
  | "offline2"
  | "commission_speed"
  | "auto_pick"
  | "loot_sense"
  | "offline3"
  | "double_commission"
  | "time_compress"
  | "eternal_factory"
  /* 征服者 */
  | "start_shield"
  | "vitality"
  | "dmg1"
  | "cdr"
  | "crit"
  | "elemental"
  | "dmg2"
  | "desperate"
  | "endless"
  | "god_challenge";

export interface TalentNode {
  id: TalentId;
  name: string;
  /** 解锁所需回响点数(点;策划案 5.2 天赋树定价表,路线合计见 *_ROUTE_COST) */
  cost: number;
  tier: number;
  desc: string;
}

export const BUILDER_ROUTE: readonly TalentNode[] = [
  { id: "extra_gear", name: "额外武装", cost: 3, tier: 1, desc: "开局可多携带1件装备(槽位+1)" },
  { id: "quick_start", name: "快速启动", cost: 2, tier: 1, desc: "首次升级所需经验-20%" },
  { id: "affix_taste", name: "词缀鉴赏", cost: 5, tier: 2, desc: "升级时装备选项中至少有1件稀有品质" },
  { id: "slot1", name: "槽位扩展I", cost: 6, tier: 2, desc: "装备槽上限+1" },
  { id: "targeted_search", name: "定向搜索", cost: 8, tier: 3, desc: "开局指定1种触发器,首次升级必定出现" },
  { id: "affix_preview", name: "词缀预览", cost: 7, tier: 3, desc: "升级选装备时显示词缀图鉴收录标记" },
  { id: "reforge", name: "词缀重铸", cost: 12, tier: 4, desc: "每局1次,重铸一张装备卡的修饰器" },
  { id: "slot2", name: "被动槽扩展", cost: 10, tier: 4, desc: "被动法宝槽上限+1(4 → 5)" },
  { id: "universal", name: "万能适配", cost: 20, tier: 5, desc: "装备槽满时新装备不再受同触发器类型冲突限制" },
  { id: "blueprint", name: "完美蓝图", cost: 18, tier: 5, desc: "开局可从已解锁词缀中选择1个效果作为初始武器" },
];

export const EFFICIENT_ROUTE: readonly TalentNode[] = [
  { id: "offline1", name: "离线增效I", cost: 2, tier: 1, desc: "委托收益+15%" },
  { id: "exp_gain", name: "经验加成", cost: 3, tier: 1, desc: "全局经验获取+10%" },
  { id: "offline2", name: "离线增效II", cost: 5, tier: 2, desc: "委托收益额外+15%(累计+30%)" },
  { id: "commission_speed", name: "委托加速", cost: 4, tier: 2, desc: "委托收益结算速度+20%" },
  { id: "auto_pick", name: "自动拾取", cost: 7, tier: 3, desc: "全屏自动拾取经验宝石,无需走位" },
  { id: "loot_sense", name: "战利品嗅觉", cost: 8, tier: 3, desc: "稀有装备掉落概率+5%" },
  { id: "offline3", name: "离线增效III", cost: 10, tier: 4, desc: "委托收益额外+20%(累计+50%)" },
  { id: "double_commission", name: "双委托", cost: 12, tier: 4, desc: "可同时派遣2个委托任务" },
  { id: "time_compress", name: "时间压缩", cost: 18, tier: 5, desc: "委托实际耗时缩短30%" },
  { id: "eternal_factory", name: "永恒工厂", cost: 22, tier: 5, desc: "委托不受12小时封顶限制,持续积累" },
];

export const CONQUEROR_ROUTE: readonly TalentNode[] = [
  { id: "start_shield", name: "初始护盾", cost: 2, tier: 1, desc: "开局获得一层可吸收50点伤害的护盾" },
  { id: "vitality", name: "生命强化", cost: 3, tier: 1, desc: "最大生命值+15%" },
  { id: "dmg1", name: "伤害强化I", cost: 5, tier: 2, desc: "全局伤害+10%" },
  { id: "cdr", name: "冷却缩减", cost: 6, tier: 2, desc: "所有周期脉冲触发器的间隔-10%" },
  { id: "crit", name: "暴击精通", cost: 8, tier: 3, desc: "暴击率+10%,暴击伤害+25%" },
  { id: "elemental", name: "元素精通", cost: 7, tier: 3, desc: "火焰/冰霜/毒素/闪电伤害+15%" },
  { id: "dmg2", name: "伤害强化II", cost: 10, tier: 4, desc: "全局伤害额外+15%(累计+25%)" },
  { id: "desperate", name: "绝境爆发", cost: 12, tier: 4, desc: "生命值低于20%时,伤害+50%" },
  { id: "endless", name: "无尽模式", cost: 20, tier: 5, desc: "解锁无尽挑战,波次无限递增,记录最高波次" },
  { id: "god_challenge", name: "神之挑战", cost: 25, tier: 5, desc: "波8起出现神级敌人——多重特殊机制的超级精英" },
];

export const ALL_ROUTES: readonly (readonly TalentNode[])[] = [BUILDER_ROUTE, EFFICIENT_ROUTE, CONQUEROR_ROUTE];

export const ALL_TALENTS: readonly TalentNode[] = ALL_ROUTES.flat();

export function talentOf(id: TalentId): TalentNode {
  return ALL_TALENTS.find((n) => n.id === id)!;
}

export function routeOf(id: TalentId): readonly TalentNode[] {
  return ALL_ROUTES.find((r) => r.some((n) => n.id === id))!;
}

/** 层级解锁:N 层需要同路线至少一个 N-1 层节点 */
export function isTierUnlocked(owned: readonly TalentId[], tier: number, route: readonly TalentNode[]): boolean {
  if (tier <= 1) return true;
  return route.some((n) => n.tier === tier - 1 && owned.includes(n.id));
}

export function routeCost(route: readonly TalentNode[]): number {
  return route.reduce((s, n) => s + n.cost, 0);
}

export const BUILDER_ROUTE_COST = routeCost(BUILDER_ROUTE);
export const EFFICIENT_ROUTE_COST = routeCost(EFFICIENT_ROUTE);
export const CONQUEROR_ROUTE_COST = routeCost(CONQUEROR_ROUTE);

/**
 * 天赋效果数值(策划案 5.2;唯一事实源,下方推导函数全部读此表;与各节点 desc 文案同源)。
 * 改数值只改这里:含义/单位/取值依据逐项备注。
 */
export const TALENT_VALUES = {
  /** 快速启动:首次升级所需经验倍率(倍率;×0.8 = -20%) */
  firstXpScale: 0.8,
  /** 经验加成:全局经验获取倍率(倍率;×1.1 = +10%) */
  globalXpMult: 1.1,
  /** 离线增效I:委托收益增量(比例;+15%) */
  offline1Bonus: 0.15,
  /** 离线增效II:委托收益增量(比例;+15%,累计 +30%) */
  offline2Bonus: 0.15,
  /** 离线增效III:委托收益增量(比例;+20%,累计 +50%) */
  offline3Bonus: 0.2,
  /** 委托加速:委托结算速度倍率(倍率;×1.2 = +20%) */
  commissionSpeedMult: 1.2,
  /** 时间压缩:委托实际耗时缩放(倍率;耗时 ×0.7 = -30%) */
  timeCompressScale: 0.7,
  /** 战利品嗅觉:稀有装备掉落概率增量(比例;+5%) */
  rareBonus: 0.05,
  /** 生命强化:最大生命倍率(倍率;×1.15 = +15%) */
  maxHpMult: 1.15,
  /** 初始护盾:开局护盾吸收量(生命点) */
  startShield: 50,
  /** 伤害强化I:全局伤害增量(比例;+10%) */
  dmg1Bonus: 0.1,
  /** 伤害强化II:全局伤害增量(比例;+15%,累计 +25%) */
  dmg2Bonus: 0.15,
  /** 冷却缩减:周期脉冲触发间隔倍率(倍率;×0.9 = -10%) */
  cdrScale: 0.9,
  /** 暴击精通:暴击率增量(比例;+10%) */
  critRate: 0.1,
  /** 暴击精通:暴击伤害倍率(倍率;×1.25 = +25%) */
  critMult: 1.25,
  /** 元素精通:火/冰/毒/电伤害倍率(倍率;×1.15 = +15%) */
  elementalMult: 1.15,
  /** 绝境爆发:低于阈值时伤害倍率(倍率;×1.5 = +50%) */
  desperateMult: 1.5,
  /** 绝境爆发:生效生命阈值(剩余生命比例 0-1;低于 20%) */
  desperateHpThreshold: 0.2,
} as const;

/* ---------- 天赋效果推导(纯函数,便于单测;数值一律读 TALENT_VALUES) ---------- */

/** 主动法宝槽加成(R7:基础 4,天赋最多 +2 = 额外武装 + 槽位扩展 I;硬顶 SHOP_SLOT_CAP 6 由商店侧钳) */
export function slotBonusFor(owned: readonly TalentId[]): number {
  let b = 0;
  if (owned.includes("extra_gear")) b += 1;
  if (owned.includes("slot1")) b += 1;
  return b;
}

/** 被动法宝槽加成(R7:原「槽位扩展 II」改为被动槽 +1,天赋 id 不变以兼容存档) */
export function passiveSlotBonusFor(owned: readonly TalentId[]): number {
  return owned.includes("slot2") ? 1 : 0;
}

export function firstXpScaleFor(owned: readonly TalentId[]): number {
  return owned.includes("quick_start") ? TALENT_VALUES.firstXpScale : 1;
}

export function globalXpMultFor(owned: readonly TalentId[]): number {
  return owned.includes("exp_gain") ? TALENT_VALUES.globalXpMult : 1;
}

/** 委托收益倍率:离线增效 I/II/III 累计 +15%/+30%/+50% */
export function offlineBonusFor(owned: readonly TalentId[]): number {
  let b = 0;
  if (owned.includes("offline1")) b += TALENT_VALUES.offline1Bonus;
  if (owned.includes("offline2")) b += TALENT_VALUES.offline2Bonus;
  if (owned.includes("offline3")) b += TALENT_VALUES.offline3Bonus;
  return 1 + b;
}

/** 委托收益结算速度(委托加速:+20%) */
export function commissionSpeedFor(owned: readonly TalentId[]): number {
  return owned.includes("commission_speed") ? TALENT_VALUES.commissionSpeedMult : 1;
}

/** 委托实际耗时缩放(时间压缩:-30% 耗时 → 速度 +43%) */
export function commissionTimeScaleFor(owned: readonly TalentId[]): number {
  return owned.includes("time_compress") ? 1 / TALENT_VALUES.timeCompressScale : 1;
}

export function uncappedCommissionFor(owned: readonly TalentId[]): boolean {
  return owned.includes("eternal_factory");
}

export function autoPickupFor(owned: readonly TalentId[]): boolean {
  return owned.includes("auto_pick");
}

export function rareBonusFor(owned: readonly TalentId[]): number {
  return owned.includes("loot_sense") ? TALENT_VALUES.rareBonus : 0;
}

export function maxHpMultFor(owned: readonly TalentId[]): number {
  return owned.includes("vitality") ? TALENT_VALUES.maxHpMult : 1;
}

export function startShieldFor(owned: readonly TalentId[]): number {
  return owned.includes("start_shield") ? TALENT_VALUES.startShield : 0;
}

export function globalDamageMultFor(owned: readonly TalentId[]): number {
  let m = 1;
  if (owned.includes("dmg1")) m += TALENT_VALUES.dmg1Bonus;
  if (owned.includes("dmg2")) m += TALENT_VALUES.dmg2Bonus;
  return m;
}

/** 周期脉冲间隔缩放(冷却缩减:-10%) */
export function cdrScaleFor(owned: readonly TalentId[]): number {
  return owned.includes("cdr") ? TALENT_VALUES.cdrScale : 1;
}

export interface CritSpec {
  rate: number;
  mult: number;
}

export function critFor(owned: readonly TalentId[]): CritSpec {
  return owned.includes("crit") ? { rate: TALENT_VALUES.critRate, mult: TALENT_VALUES.critMult } : { rate: 0, mult: 1 };
}

export function elementalMultFor(owned: readonly TalentId[]): number {
  return owned.includes("elemental") ? TALENT_VALUES.elementalMult : 1;
}

/** 绝境爆发:生命低于 20% 时伤害 +50% */
export function desperateMultFor(owned: readonly TalentId[]): number {
  return owned.includes("desperate") ? TALENT_VALUES.desperateMult : 1;
}
