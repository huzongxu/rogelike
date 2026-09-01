/**
 * 武器套组(需求优化 v2:每赛季 3 套,套组专属卡池 + 2/4 件套联动)。
 * 套组 = 效果派系:装备的效果类型归属哪一套,就计为该套 1 件;
 * 2 件 / 4 件激活套组联动加成。商店刷卡时偏向本套(专属卡池),
 * 主菜单可选套组,选后再进关卡生效(场外配置)。
 */

import type { EffectType, ModifierType, TriggerType } from "./affixes";
import type { Equipment } from "./equipmentGen";

export type SetId = "thorn" | "barrage" | "ember" | "frost" | "magma" | "phantom";

export interface SetDef {
  id: SetId;
  name: string;
  desc: string;
  color: string;
  /** 套组专属效果(装备效果 ∈ 此列表 → 计 1 件) */
  effects: EffectType[];
  /** 套组亲和触发器(商店专属卡池偏向) */
  triggers: TriggerType[];
  /** 套组亲和修饰器(商店专属卡池偏向) */
  modifiers: ModifierType[];
  bonus3: { name: string; desc: string };
  bonus6: { name: string; desc: string };
  /** 赛季限定套组的发布赛季(常驻套缺省;主菜单按 save.seasonId 门控显示) */
  releaseSeason?: number;
}

export const SETS: readonly SetDef[] = [
  {
    id: "thorn",
    name: "荆棘回响",
    desc: "挨打回血,反伤输出",
    color: "#4dffc8",
    effects: ["drain", "shield"],
    triggers: ["hurt", "hit"],
    modifiers: ["lifesteal", "power"],
    bonus3: { name: "棘肤", desc: "每次受击回复 1.5% 最大生命(0.5 秒冷却)" },
    bonus6: { name: "反伤回响·极", desc: "质变:受击/受伤触发的效果伤害翻倍" },
  },
  {
    id: "barrage",
    name: "弹幕风暴",
    desc: "高频弹幕,穿透收割",
    color: "#5ac8fa",
    effects: ["knife", "ray"],
    triggers: ["pulse", "move"],
    modifiers: ["split", "pierce", "haste"],
    bonus3: { name: "齐射", desc: "弹幕 +1,触发间隔 -8%" },
    bonus6: { name: "弹幕风暴·极", desc: "质变:弹幕数量翻倍" },
  },
  {
    id: "ember",
    name: "余烬天灾",
    desc: "范围灼烧,元素连环",
    color: "#ff9d2e",
    effects: ["nova", "cloud", "chain", "skeleton"],
    triggers: ["kill", "combo"],
    modifiers: ["explode", "power", "duration"],
    bonus3: { name: "余烬扩散", desc: "效果范围 +18%,持续 +1 秒" },
    bonus6: { name: "元素天灾·极", desc: "质变:元素效果范围与持续翻倍" },
  },
];

/**
 * 赛季限定套组库(DESIGN-SEASON-SETS L3):S2 起每赛季一套,发布后永久保留可选。
 * releaseSeason = 发布赛季(主菜单按 save.seasonId ≥ releaseSeason 显示)。
 */
export const FEATURED_SETS: readonly SetDef[] = [
  {
    id: "frost",
    name: "极北冰脉",
    desc: "冰锥点杀,霜环控场",
    color: "#5ac8fa",
    effects: ["icelance", "frost_ring"],
    triggers: ["pulse", "kill"],
    modifiers: ["power", "pierce", "haste"],
    bonus3: { name: "锋寒", desc: "效果射程 +12%" },
    bonus6: { name: "极北威压·极", desc: "质变:冰系效果伤害翻倍" },
    releaseSeason: 2,
  },
  {
    id: "magma",
    name: "熔核教团",
    desc: "陨星轰炸,熔岩封路",
    color: "#ff9d2e",
    effects: ["meteor", "magma_trail"],
    triggers: ["pulse", "move"],
    modifiers: ["explode", "duration", "power"],
    bonus3: { name: "地火奔涌", desc: "效果持续 +1 秒" },
    bonus6: { name: "烈焰统治·极", desc: "质变:火系效果伤害翻倍" },
    releaseSeason: 3,
  },
  {
    id: "phantom",
    name: "亡影剧团",
    desc: "灵狼协战,亡者为兵",
    color: "#9b6cff",
    effects: ["spirit_wolves", "haunt_crown"],
    triggers: ["kill", "pulse"],
    modifiers: ["power", "duration", "haste"],
    bonus3: { name: "群影", desc: "召唤物伤害 +20%" },
    bonus6: { name: "亡者行军·极", desc: "质变:召唤数量翻倍,召唤伤害 ×1.5" },
    releaseSeason: 4,
  },
];

/** 套组联动件数激活档位(需求优化 v2 落地口径:3 件小增 / 6 件质变;策划案原文 2/4 件,实现以本表为唯一事实源) */
export const SET_PIECE_TIERS = {
  /** 一档(小增档)所需件数(件) */
  tier1: 3,
  /** 二档(质变档)所需件数(件) */
  tier2: 6,
} as const;

/**
 * 套组联动效果数值(唯一事实源;消费方:装备引擎结算/受击回血)。
 * SETS/FEATURED_SETS 里的 desc 为玩家展示文案,与本表同源;改数值只改这里。
 * 出处:需求优化 v2(常驻三套)+ DESIGN-SEASON-SETS(赛季套);单位/依据逐项备注。
 */
export const SET_BONUSES = {
  /** 荆棘 3 件「棘肤」:每次受击回复的最大生命比例(比例 0-1;1.5%,挨打流续航基准) */
  thorn3HealPct: 0.015,
  /** 荆棘 3 件「棘肤」:受击回血冷却(秒;防高频受击超额回复) */
  thorn3HealCd: 0.5,
  /** 弹幕 3 件「齐射」:额外弹幕数(发) */
  barrage3SplitExtra: 1,
  /** 弹幕 3 件「齐射」:触发间隔缩短(比例 0-1,叠入 haste;8%) */
  barrage3Haste: 0.08,
  /** 余烬 3 件「余烬扩散」:效果持续延长(秒) */
  ember3DurationSec: 1,
  /** 余烬 3 件「余烬扩散」:效果范围倍率(×1.18 = +18%) */
  ember3RadiusMult: 1.18,
  /** 极北 3 件「锋寒」:效果射程倍率(×1.12 = +12%) */
  frost3RangeMult: 1.12,
  /** 熔核 3 件「地火奔涌」:效果持续延长(秒) */
  magma3DurationSec: 1,
  /** 亡影 3 件「群影」:召唤物伤害倍率(×1.2 = +20%;仅召唤系效果) */
  phantom3SummonPower: 1.2,
  /** 荆棘 6 件「反伤回响·极」:受击/受伤触发系效果伤害倍率(翻倍) */
  thorn6PowerMult: 2,
  /** 余烬 6 件「元素天灾·极」:元素效果范围与持续倍率(双双翻倍) */
  ember6Mult: 2,
  /** 极北 6 件「极北威压·极」:冰系效果伤害倍率(翻倍) */
  frost6PowerMult: 2,
  /** 熔核 6 件「烈焰统治·极」:火系效果伤害倍率(翻倍) */
  magma6PowerMult: 2,
  /** 亡影 6 件「亡者行军·极」:召唤伤害倍率(×1.5);召唤数量另行翻倍再 +1 保底(引擎侧规则) */
  phantom6SummonPower: 1.5,
} as const;

export function setDef(id: SetId): SetDef {
  return allSets().find((s) => s.id === id)!;
}

/** 常驻三套(商店偏向卡池/敌情推荐等旧消费点保持稳定;赛季套组走 allSets/releasedSets) */
export function baseSets(): readonly SetDef[] {
  return SETS;
}

/**
 * 全套组库 = 常驻三套 + 已定义的赛季套组(frost/magma/phantom…)。
 * featuredSetId 的存在性守卫、setDef 全量查找都走这里;新增套组只需追加进 FEATURED_SETS。
 */
export function allSets(): readonly SetDef[] {
  return [...SETS, ...FEATURED_SETS];
}

/** 当前赛季主菜单可选列表:常驻三套 + 已到发布赛季的赛季套组(S1 = 恒三套,行为冻结) */
export function releasedSets(seasonId: number): readonly SetDef[] {
  return allSets().filter((s) => !s.releaseSeason || seasonId >= s.releaseSeason);
}

/** 效果归属的套组(每个效果恰好归属一套;无归属返回 null) */
export function setOfEffect(e: EffectType): SetId | null {
  for (const s of allSets()) {
    if (s.effects.includes(e)) return s.id;
  }
  return null;
}

/** 装备是否属于该套组(看效果类型归属) */
export function isSetPiece(eq: Equipment, id: SetId): boolean {
  return setOfEffect(eq.effect.def.type) === id;
}

/** 一套已装备的件数(0-8,按效果类型计数) */
export function setPieces(equipment: readonly Equipment[], id: SetId): number {
  let n = 0;
  for (const eq of equipment) {
    if (isSetPiece(eq, id)) n += 1;
  }
  return n;
}

/** 套组生效状态:由件数推出激活档位(2 件 / 4 件) */
export interface SetBonusState {
  id: SetId;
  pieces: number;
  bonus3: boolean;
  bonus6: boolean;
}

export function setBonusState(equipment: readonly Equipment[], id: SetId | null): SetBonusState | null {
  if (!id) return null;
  const pieces = setPieces(equipment, id);
  return { id, pieces, bonus3: pieces >= SET_PIECE_TIERS.tier1, bonus6: pieces >= SET_PIECE_TIERS.tier2 };
}
