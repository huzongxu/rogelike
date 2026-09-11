/**
 * 重随策划规范表 —— 单卡重随的价格曲线、隐藏词条概率与技能亲和权重的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 依据 docs/DESIGN-SEASON-FEEL.md 批次 A · A2(需求 F9:升级时能选保留哪个 / 重新随机,
 * 重随有概率出隐藏触发器与修饰器,且不同技能适配不一样)。
 *
 * 两条边界:
 *  ① 隐藏触发器/修饰器**只从本表的重随通道产出**,不进 `randomTriggers` / `randomModifiers`
 *     的常规池 —— 否则常规刷卡就能白拿隐藏词条,与"隐藏品质仅融合产出"的既有稀有度模型冲突;
 *  ② 亲和权重只影响重随,不影响商店进货与三选一的常规生成。
 */

import type { EffectType, ModifierType, TriggerType } from "./affixes";

/** 单卡重随价格曲线:成本 = base × growth^本章已重随次数(进下一章清零,与刷新阶梯同构) */
export const REROLL_CURVE = {
  /** 首次重随基础价(金) */
  base: 12,
  /** 本章内每次重随的指数底数(比刷新的 1.6 缓,因为只换一张卡的词条) */
  growth: 1.5,
} as const;

/** 隐藏词条:重随时命中的概率与本局保底周期 */
export const REROLL_HIDDEN = {
  /** 单次重随出隐藏词条的概率 0-1 */
  chance: 0.06,
  /** 本局累计重随未出隐藏 → 第 N 次必出(与融合的 HIDDEN_PITY_N 同思路,两条保底各自计数) */
  pity: 12,
} as const;

/** 亲和权重倍数:命中亲和池的词条,权重乘本值(非亲和项仍可能出,保留构筑意外) */
export const AFFINITY_WEIGHT = 3;

/**
 * 技能 → 亲和词条表(F9「不同技能适配不一样」的落点)。
 * 每个效果给 2 个触发器 + 2 个修饰器;重随时这些词条权重 ×AFFINITY_WEIGHT。
 * 取值依据 = 各效果的既有玩法身份(见 ./affixes 的 EFFECTS 分类与 DESIGN-SEASON-SETS §3)。
 */
export const SKILL_AFFINITY: Record<EffectType, { triggers: readonly TriggerType[]; modifiers: readonly ModifierType[] }> = {
  knife: { triggers: ["pulse", "combo"], modifiers: ["split", "pierce"] }, // 飞刀:齐射与穿透是它的形状
  nova: { triggers: ["pulse", "hurt"], modifiers: ["explode", "power"] }, // 新星:自身 AOE,受伤时反打
  skeleton: { triggers: ["pulse", "kill"], modifiers: ["duration", "power"] }, // 召唤:在场时长即输出
  cloud: { triggers: ["move", "pulse"], modifiers: ["duration", "power"] }, // 毒云:铺地靠走位触发
  ray: { triggers: ["pulse", "hit"], modifiers: ["haste", "pierce"] }, // 射线:射速与穿透
  chain: { triggers: ["kill", "combo"], modifiers: ["chain", "haste"] }, // 闪电链:击杀滚雪球
  shield: { triggers: ["hurt", "hit"], modifiers: ["duration", "power"] }, // 护盾:挨打才需要
  drain: { triggers: ["hurt", "hit"], modifiers: ["duration", "lifesteal"] }, // 汲取:与受伤联动
  icelance: { triggers: ["pulse", "kill"], modifiers: ["pierce", "power"] }, // 冰锥:点杀高价值目标
  frost_ring: { triggers: ["move", "hurt"], modifiers: ["chain", "duration"] }, // 霜环:自身扩散,走位铺开
  meteor: { triggers: ["pulse", "combo"], modifiers: ["explode", "power"] }, // 陨星:延迟落点 AOE
  magma_trail: { triggers: ["move", "pulse"], modifiers: ["duration", "explode"] }, // 熔岩足迹:移动留火
  spirit_wolves: { triggers: ["kill", "pulse"], modifiers: ["duration", "haste"] }, // 灵狼:群体协战
  haunt_crown: { triggers: ["kill", "combo"], modifiers: ["lifesteal", "duration"] }, // 亡灵冠冕:击杀唤醒亡影
};

/** 隐藏触发器 / 修饰器池:归属定义在 ./affixes(类型联合的属主),此处转出供重随通道使用 */
export { HIDDEN_TRIGGER_TYPES as HIDDEN_TRIGGERS, HIDDEN_MODIFIER_TYPES as HIDDEN_MODIFIERS } from "./affixes";

/** 单次重随价格(金):随本章已重随次数指数抬升 */
export function rerollPrice(rerollsThisChapter: number): number {
  const c = REROLL_CURVE;
  return Math.round(c.base * Math.pow(c.growth, Math.max(0, rerollsThisChapter)));
}
