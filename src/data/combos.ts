/**
 * 跨套组合技(策划案 V3 §5 / DESIGN-S4 §2):三条"三词缀同时在场"的跨套组合。
 * 纯函数层:只读装备数组、无状态,引擎/商店界面均可复用。
 * 条件判定按词缀类型精确匹配(跨装备、跨套组,各 1 处即算):
 * - 弹幕风暴 = 修饰器 连锁+分裂+穿透;
 * - 深渊裂隙 = 效果 新星+毒云+汲取;
 * - 荆棘光环 = 效果 护盾 + 修饰器 吸血 + 触发器 hit(受击触发;⚠️ 不是 hurt 受伤反应)。
 */

import type { Equipment } from "./equipmentGen";
import type { EffectType, ModifierType, TriggerType } from "./affixes";

export type ComboId = "barrage_storm" | "abyss_rift" | "thorn_aura";

export interface ComboDef {
  id: ComboId;
  name: string;
  desc: string;
  /** HUD 图标色(复用现有主题色) */
  color: string;
  check(list: readonly Equipment[]): boolean;
}

function hasModifier(list: readonly Equipment[], type: ModifierType): boolean {
  return list.some((eq) => eq.modifiers.some((m) => m.def.type === type));
}

function hasEffect(list: readonly Equipment[], type: EffectType): boolean {
  return list.some((eq) => eq.effect.def.type === type);
}

function hasTrigger(list: readonly Equipment[], type: TriggerType): boolean {
  return list.some((eq) => eq.triggers.some((t) => t.def.type === type));
}

export const COMBOS: readonly ComboDef[] = [
  {
    id: "barrage_storm",
    name: "弹幕风暴",
    desc: "击杀分裂 3 发×30% 伤害,全装备触发间隔 -20%",
    color: "#4aa3ff",
    check: (l) => hasModifier(l, "chain") && hasModifier(l, "split") && hasModifier(l, "pierce"),
  },
  {
    id: "abyss_rift",
    name: "深渊裂隙",
    desc: "新星落点留回血池,效果持续 +2 秒",
    color: "#c06cff",
    check: (l) => hasEffect(l, "nova") && hasEffect(l, "cloud") && hasEffect(l, "drain"),
  },
  {
    id: "thorn_aura",
    name: "荆棘光环",
    desc: "受击时反弹所受伤害 30%",
    color: "#4dffc8",
    check: (l) => hasEffect(l, "shield") && hasModifier(l, "lifesteal") && hasTrigger(l, "hit"),
  },
];

export type ComboStates = Record<ComboId, boolean>;

export const COMBO_OFF: ComboStates = Object.freeze({
  barrage_storm: false,
  abyss_rift: false,
  thorn_aura: false,
}) as ComboStates;

/**
 * 跨套组合技效果数值(策划案 V3 §5;唯一事实源,消费方:装备引擎)。
 * COMBOS 里的 desc 为玩家展示文案,与本表同源;改数值只改这里。
 */
export const COMBO_VALUES = {
  barrage_storm: {
    /** 击杀分裂子弹数(发) */
    splitCount: 3,
    /** 分裂子弹伤害 = 击杀卡基础伤害 × 本值(倍率;30%) */
    splitDamageMult: 0.3,
    /** 分裂子弹弹速(px/s;与飞刀基础弹速同口径) */
    splitSpeed: 520,
    /** 全装备触发间隔缩短(比例 0-1,叠入 haste;质变级 -20%) */
    haste: 0.2,
  },
  abyss_rift: {
    /** 效果持续延长(秒) */
    durationSec: 2,
    /** 新星落点回血池持续时长(秒;总治疗 = 新星伤害 × healRatio 按时长均摊) */
    poolDuration: 3,
    /** 回血池总治疗 = 新星伤害 × 本值(倍率;40%) */
    healRatio: 0.4,
    /** 场上回血池数量上限(个;超出移除最旧) */
    poolCap: 3,
  },
  thorn_aura: {
    /** 受击反弹伤害比例(比例 0-1;反弹所受伤害的 30% 给攻击者/最近敌人) */
    reflectPct: 0.3,
    /** 回复量倍率(×1.3) */
    healMult: 1.3,
  },
} as const;

/** 一次遍历出三条激活状态(装备变动后即时生效,同 setBonus 口径) */
export function comboStates(list: readonly Equipment[]): ComboStates {
  return {
    barrage_storm: hasModifier(list, "chain") && hasModifier(list, "split") && hasModifier(list, "pierce"),
    abyss_rift: hasEffect(list, "nova") && hasEffect(list, "cloud") && hasEffect(list, "drain"),
    thorn_aura: hasEffect(list, "shield") && hasModifier(list, "lifesteal") && hasTrigger(list, "hit"),
  };
}
