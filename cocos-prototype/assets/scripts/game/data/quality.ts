/**
 * 品质策划规范表 —— 全项目"品质"相关策划数值的唯一出处(单一事实源)。
 *
 * 开发准则(详见 docs/DESIGN-VALUES-SPEC.md):
 *  1. 品质数值一律改本文件,禁止在逻辑代码里内联魔法数;
 *  2. 每个数值必须带备注:含义 / 单位 / 取值依据(策划案出处);
 *  3. 改完跑 `npm test`(含平衡模拟),确认行为符合预期;
 *  4. 可热调字段(商店基础价/扭蛋概率等)另有 balance.json 覆盖层,
 *     本文件中的值是"内置默认值",覆盖规则见 docs/CONFIG-TABLES.md。
 *
 * 品质体系概要(策划案 3.1/3.2 + 装备系统重构):
 *  - 品质决定"形态":部件构成(触发器/效果/修饰器数量)、射速、赠量、强化上限;
 *  - 等级决定"数值":伤害/治疗/护盾走装备等级成长,品质不直接放大伤害;
 *  - 隐藏品质仅由词缀融合产出(彩虹品质),不进入任何掉落/抽取权重。
 */

/** 品质枚举(升品顺序 = common → rare → epic → legendary → hidden) */
export type Quality = "common" | "rare" | "epic" | "legendary" | "hidden";

/** 品质档位完整规格:每一档的全部策划数值集中于此 */
export interface QualityTierSpec {
  key: Quality;
  /** 显示名(商店/卡框/描述文案) */
  name: string;
  /** 品质色:品质框描边、文字、图标底色 */
  color: string;
  /** 品质等级 0-4(越高越稀有):部件继承比较、升品顺序、融合成本键排序都用它 */
  rank: number;
  /** 部件构成:触发器数量(策划案 3.1/3.2) */
  triggers: number;
  /** 部件构成:效果数量(恒定 1,品质不加效果数) */
  effects: number;
  /** 部件构成:修饰器数量 */
  modifiers: number;
  /** 强化等级上限:品质决定"形态上限",强化决定"数值";达上限后只能升品 */
  maxLevel: number;
  /** 基础价(金):商店卡价 / 销毁回收(×0.5) / 进化费用(×2) 的共用基数;可被 balance.json → economy.basePrice 覆盖 */
  basePrice: number;
  /** 品质新轴·射速:触发间隔缩减比例 0-1(装备系统重构:品质不再直接放大伤害) */
  rateHaste: number;
  /** 品质新轴·赠量点数:按技能类别折算(弹幕+点数 / 连锁+点数 / 范围+6%每点 / 召唤+⌈点数/2⌉) */
  bonusPoints: number;
  /** 品质新轴·数值系数:对基础数值的乘算(升品三重跃迁之一) */
  powerMult: number;
  /** 扭蛋重复补偿(星尘/件);可被 balance.json → gacha.duplicateStardust 覆盖 */
  duplicateStardust: number;
  /** 收藏图鉴:每件该品质收藏装备提供的全局攻击加成(%) */
  collectionAtkPct: number;
  /** 收藏图鉴:每件该品质收藏装备提供的全局生命加成(%) */
  collectionHpPct: number;
}

/**
 * 品质主表 —— 唯一一份"每档品质是什么"的数据。
 * 备注:数值出处 = 策划案 3.1/3.2(部件构成) + 装备系统重构(新轴/上限/经济)。
 */
export const QUALITIES: readonly QualityTierSpec[] = [
  {
    key: "common", name: "普通", color: "#c8c8c8", rank: 0,
    triggers: 1, effects: 1, modifiers: 0,
    maxLevel: 5, basePrice: 15,
    rateHaste: 0, bonusPoints: 0, powerMult: 1,
    duplicateStardust: 2, collectionAtkPct: 2, collectionHpPct: 1,
  },
  {
    key: "rare", name: "稀有", color: "#4aa3ff", rank: 1,
    triggers: 1, effects: 1, modifiers: 1,
    maxLevel: 8, basePrice: 30,
    rateHaste: 0.06, bonusPoints: 1, powerMult: 1.1,
    duplicateStardust: 5, collectionAtkPct: 4, collectionHpPct: 2,
  },
  {
    key: "epic", name: "史诗", color: "#c06cff", rank: 2,
    triggers: 1, effects: 1, modifiers: 2,
    maxLevel: 12, basePrice: 60,
    rateHaste: 0.12, bonusPoints: 2, powerMult: 1.2,
    duplicateStardust: 15, collectionAtkPct: 6, collectionHpPct: 3,
  },
  {
    key: "legendary", name: "传奇", color: "#ff9d2e", rank: 3,
    // 双触发器是传奇档的形态特征(策划案 3.2:传奇 = 两条触发轴)
    triggers: 2, effects: 1, modifiers: 2,
    maxLevel: 16, basePrice: 120,
    rateHaste: 0.18, bonusPoints: 3, powerMult: 1.3,
    duplicateStardust: 40, collectionAtkPct: 9, collectionHpPct: 5,
  },
  {
    key: "hidden", name: "隐藏", color: "#4dffc8", rank: 4,
    // 三修饰器是隐藏档的形态特征;仅词缀融合产出,不进掉落/扭蛋权重
    triggers: 1, effects: 1, modifiers: 3,
    maxLevel: 20, basePrice: 200,
    rateHaste: 0.25, bonusPoints: 4, powerMult: 1.4,
    duplicateStardust: 60, collectionAtkPct: 15, collectionHpPct: 8,
  },
];

export function qualityDef(q: Quality): QualityTierSpec {
  return QUALITIES.find((x) => x.key === q)!;
}

/* ---------- 派生工具(全部由主表推导,禁止另写第二份顺序/等级定义) ---------- */

/** 品质升序序列(按主表顺序) */
export const QUALITY_ORDER: readonly Quality[] = QUALITIES.map((t) => t.key);

/** 品质等级(rank):越高越稀有 */
export function qualityRank(q: Quality): number {
  return qualityDef(q).rank;
}

/** 升品:下一档品质;隐藏已是最高返回 null(三合一升品用) */
export function qualityUpgrade(q: Quality): Quality | null {
  const next = QUALITIES.find((t) => t.rank === qualityDef(q).rank + 1);
  return next ? next.key : null;
}

/** 每档品质数值字段 → Record<Quality, number> 映射(保证各轴与主表同源) */
type NumericTierField = {
  [K in keyof QualityTierSpec]: QualityTierSpec[K] extends number ? K : never;
}[keyof QualityTierSpec];

function tierFieldMap(field: NumericTierField): Record<Quality, number> {
  return Object.fromEntries(QUALITIES.map((t) => [t.key, t[field]])) as Record<Quality, number>;
}

/** 强化等级上限(按品质) */
export const QUALITY_MAX_LEVEL: Record<Quality, number> = tierFieldMap("maxLevel");
/** 品质基础价默认值(商店卡价/销毁回收/进化费共用基数;运行期可被 balance.json 覆盖) */
export const QUALITY_BASE_PRICE_DEFAULT: Record<Quality, number> = tierFieldMap("basePrice");
/** 扭蛋重复装备转星尘默认值(运行期可被 balance.json 覆盖) */
export const DUPLICATE_STARDUST_DEFAULT: Record<Quality, number> = tierFieldMap("duplicateStardust");
/** 收藏图鉴:每件收藏装备提供的全局攻击加成 %(按品质) */
export const COLLECTION_ATK_PCT: Record<Quality, number> = tierFieldMap("collectionAtkPct");
/** 收藏图鉴:每件收藏装备提供的全局生命加成 %(按品质) */
export const COLLECTION_HP_PCT: Record<Quality, number> = tierFieldMap("collectionHpPct");

/* ---------- 掉落权重曲线(升级三选一 / 精英掉落 / 商店刷卡共用) ---------- */

/**
 * 品质掉落权重曲线参数(随玩家等级整体上移:普通减少,高级增多)。
 * 公式:权重 = base + min(level, shiftCap) × perLevel,再按下限/上限钳制;
 * 隐藏品质不参与掉落(仅融合产出)。数值出处:装备生成标定(需求优化 v2)。
 */
export const QUALITY_DROP_CURVE = {
  /** 等级位移封顶:超过该等级后权重不再上移(防后期全传说) */
  shiftCap: 30,
  /** 天赋「战利品嗅觉」:每点 rareBonus 给稀有权重加多少 */
  rareBonusWeight: 100,
  common: { base: 70, perLevel: -1.6, min: 10 }, // 普通:70 起步每级 -1.6,最低 10(保底出货)
  rare: { base: 30, perLevel: 0.9 }, // 稀有:30 起步每级 +0.9(另加战利品嗅觉)
  epic: { base: 8, perLevel: 0.7 }, // 史诗:8 起步每级 +0.7
  legendary: { base: 1, perLevel: 0.25, max: 12 }, // 传奇:1 起步每级 +0.25,封顶 12(防碾压)
} as const;

/** 按玩家等级计算各品质掉落权重(隐藏不参与) */
export function qualityWeightsForLevel(level: number, rareBonus = 0): { value: Quality; weight: number }[] {
  const c = QUALITY_DROP_CURVE;
  const shift = Math.min(level, c.shiftCap);
  return [
    { value: "common", weight: Math.max(c.common.min, c.common.base + shift * c.common.perLevel) },
    { value: "rare", weight: c.rare.base + shift * c.rare.perLevel + rareBonus * c.rareBonusWeight },
    { value: "epic", weight: c.epic.base + shift * c.epic.perLevel },
    { value: "legendary", weight: Math.min(c.legendary.max, c.legendary.base + shift * c.legendary.perLevel) },
  ];
}

/* ---------- 升品 / 强化经济(场内金币出口) ---------- */

/** 升品数值成长比:每升一档 ×1.35(进化是场内数值成长的主出口;装备系统重构) */
export const QUALITY_EVOLVE_POWER_STEP = 1.35;
/** 强化价格等级递增系数:价格 = 基础价 × (1 + (等级-1) × 本值) */
export const QUALITY_UPGRADE_COST_GROWTH = 0.6;

/** 升品数值成长比(跨档 = 每档系数的幂) */
export function qualityPowerRatio(from: Quality, to: Quality): number {
  return Math.pow(QUALITY_EVOLVE_POWER_STEP, qualityRank(to) - qualityRank(from));
}

/* ---------- 品质新轴·赠量折算(装备系统重构) ---------- */

/** 射速(触发间隔缩减)总上限:修饰器/品质/套组/组合技的 haste 叠加后不超过本值 */
export const QUALITY_HASTE_CAP = 0.7;

/** 赠量点数按技能类别的折算系数(点数 = 主表 bonusPoints) */
export const QUALITY_BONUS_CONVERSION = {
  /** AOE 系(新星/毒云/霜环/陨星/熔岩):每点赠量 → 范围 +6% */
  radiusPerPoint: 0.06,
  /** 召唤系(骷髅/灵狼/亡影):每 2 点赠量 → 召唤 +1(向上取整) */
  summonPointsPerExtra: 2,
  /** 无数量轴的效果(护盾/汲取):每点赠量 → 数值 +5%(补偿) */
  fallbackPowerPerPoint: 0.05,
} as const;

/* ---------- 词缀融合(策划案 5.3 减压改版) ---------- */

/**
 * 融合成本表(星尘):键 = "低品质x高品质"(按 rank 排序,保证 a+b 与 b+a 同键)。
 * 数值沿用策划案 5.3;未列出的组合按趋势补齐。
 */
export const FUSION_COST_TABLE: Record<string, number> = {
  "commonxcommon": 0,
  "commonxrare": 5,
  "rarexrare": 15,
  "rarexlegendary": 30,
  "legendaryxlegendary": 60,
  // 未在策划案中列出的组合(按趋势补齐)
  "commonxepic": 10,
  "rarexepic": 20,
  "epicxepic": 30,
  "epicxlegendary": 45,
  "commonxlegendary": 20,
};

/** 融合成本兜底:表里没匹配到的组合用此值(保留旧行为,理论上不会出现) */
export const FUSION_COST_FALLBACK = 60;
/** 隐藏词缀保底周期:每 N 次融合必出一次(出货时三选一,彩虹品质) */
export const HIDDEN_PITY_N = 10;
/** 三重融合解锁条件:已拥有天赋节点数 ≥ 本值(策划案 5.3) */
export const TRIPLE_FUSION_UNLOCK_TALENTS = 6;
/** 三重融合成本 = 三件原材料两两组合中最高融合成本 × 本值 */
export const TRIPLE_FUSION_COST_MULT = 2;

/** 融合成本键:按品质等级排序,保证 rare+legendary 与 legendary+rare 命中同一行 */
function fusionQualityKey(a: Quality, b: Quality): string {
  const [lo, hi] = qualityRank(a) <= qualityRank(b) ? [a, b] : [b, a];
  return `${lo}x${hi}`;
}

/** 基本融合成本(星尘):按品质组合查表 */
export function fusionCost(a: Quality, b: Quality): number {
  return FUSION_COST_TABLE[fusionQualityKey(a, b)] ?? FUSION_COST_FALLBACK;
}

/* ---------- 扭蛋默认概率(运行期可被 balance.json → gacha 覆盖) ---------- */

/** 扭蛋品质权重默认值(隐藏不入池:仅融合产出) */
export const GACHA_QUALITY_WEIGHTS: readonly { value: Quality; weight: number }[] = [
  { value: "common", weight: 55 },
  { value: "rare", weight: 30 },
  { value: "epic", weight: 12 },
  { value: "legendary", weight: 3 },
];
/** 史诗保底:第 N 抽必出史诗及以上 */
export const GACHA_EPIC_PITY = 10;
/** 传奇保底:第 N 抽必出传奇(须 ≥ 史诗保底) */
export const GACHA_LEGENDARY_PITY = 50;
/** 史诗保底触发时升格为传奇的概率 */
export const GACHA_EPIC_PITY_LEGENDARY_CHANCE = 0.3;
/** 扭蛋装备等级基数:等级 = 本值 + (已解锁最高关 - 1),随关卡进度成长 */
export const GACHA_EQUIPMENT_BASE_LEVEL = 5;

/* ---------- 关卡头像框(§4.4:关卡数 → 展示品质) ---------- */

/** 关卡头像框品质映射:关卡号 ≤ maxStage → 对应品质;按序命中第一条 */
export const STAGE_FRAME_QUALITY: readonly { maxStage: number; quality: Quality }[] = [
  { maxStage: 2, quality: "common" }, // 1-2 关:普通
  { maxStage: 4, quality: "rare" }, // 3-4 关:稀有
  { maxStage: 5, quality: "epic" }, // 5 关:史诗
  { maxStage: 6, quality: "legendary" }, // 6 关:传奇
];
/** 超出映射表最高关卡后使用的品质 */
export const STAGE_FRAME_OVERFLOW_QUALITY: Quality = "hidden"; // 7+ 关:隐藏

/** 关卡号 → 头像框品质 */
export function frameQualityForStage(stageId: number): Quality {
  for (const row of STAGE_FRAME_QUALITY) {
    if (stageId <= row.maxStage) return row.quality;
  }
  return STAGE_FRAME_OVERFLOW_QUALITY;
}
