/**
 * 武器套组(英雄系统批次:每赛季 3 套专属,4 季共 12 套 + 套组专属卡池 + 3/6 件套联动)。
 * 套组 = 效果派系:装备的效果类型归属哪一套,就计为该套 1 件;
 * 3 件 / 6 件激活套组联动加成。商店刷卡时偏向本套(专属卡池),
 * 主菜单选英雄即选套组(英雄是套组的人物包装),选后再进关卡生效(场外配置)。
 *
 * 归属规则:效果 → 套组是**多对一**(14 个效果各被恰好 2 套认领 = 28 条归属链接)。
 * 新套组复用既有效果、不新增攻击手段,凑件概率因此略升,故共享套的质变档强度降档补偿。
 */

import type { EffectType, ModifierType, TriggerType } from "./affixes";
import type { Equipment } from "./equipmentGen";

export type SetId =
  | "thorn"
  | "barrage"
  | "ember"
  | "frost"
  | "glacier"
  | "blizzard"
  | "magma"
  | "plague"
  | "cinderfang"
  | "phantom"
  | "requiem"
  | "veil";

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
 * 赛季限定套组库(DESIGN-SEASON-SETS L3 + 英雄系统批次):S2 起每赛季 3 套,发布后永久保留可选。
 * releaseSeason = 发布赛季(主菜单/英雄页按 save.seasonId ≥ releaseSeason 显示)。
 * 新套组的 effects 全部复用既有 14 效果(与其他套共享归属),因此引擎侧零新增攻击手段;
 * effects[0] 必须是通用卡池可产出的效果,保证凑件可行(通用池只产 8 个基础效果)。
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
    id: "glacier",
    name: "冰川界碑",
    desc: "射线点穿,冰盾护身",
    color: "#7fd8ff",
    effects: ["ray", "frost_ring", "shield"],
    triggers: ["hit", "move"],
    modifiers: ["pierce", "duration", "power"],
    bonus3: { name: "界碑铭刻", desc: "效果射程 +10%" },
    bonus6: { name: "冰川裁断·极", desc: "质变:冰霜射线与霜环伤害 ×1.6" },
    releaseSeason: 2,
  },
  {
    id: "blizzard",
    name: "白啸霜刃",
    desc: "霜刀成幕,冰锥收割",
    color: "#cfeeff",
    effects: ["knife", "icelance"],
    triggers: ["pulse", "kill"],
    modifiers: ["split", "pierce", "haste"],
    bonus3: { name: "白啸", desc: "弹幕 +1,穿透 +1" },
    bonus6: { name: "白啸霜刃·极", desc: "质变:飞刀与冰锥伤害 ×1.6" },
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
    id: "plague",
    name: "熔毒瘟薪",
    desc: "毒云铺地,新星引燃",
    color: "#9ede4f",
    effects: ["cloud", "nova", "magma_trail"],
    triggers: ["kill", "move"],
    modifiers: ["explode", "duration", "power"],
    bonus3: { name: "瘟薪蔓延", desc: "效果范围 +12%" },
    bonus6: { name: "熔毒瘟薪·极", desc: "质变:毒云/新星/熔岩伤害 ×1.6" },
    releaseSeason: 3,
  },
  {
    id: "cinderfang",
    name: "炽牙雷殛",
    desc: "陨星落点,闪电撕咬",
    color: "#ff6b5a",
    effects: ["chain", "meteor"],
    triggers: ["combo", "hit"],
    modifiers: ["chain", "explode", "power"],
    bonus3: { name: "炽牙", desc: "连锁 +1 目标" },
    bonus6: { name: "雷殛·极", desc: "质变:闪电链与陨星伤害 ×1.5" },
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
  {
    id: "requiem",
    name: "镇魂安可",
    desc: "骷髅列阵,亡影返场",
    color: "#c3a6ff",
    effects: ["skeleton", "haunt_crown"],
    triggers: ["kill", "combo"],
    modifiers: ["duration", "power", "split"],
    bonus3: { name: "安可", desc: "召唤数量 +1" },
    bonus6: { name: "镇魂安可·极", desc: "质变:召唤物伤害 ×1.5" },
    releaseSeason: 4,
  },
  {
    id: "veil",
    name: "雾缚噬灵",
    desc: "狼群缠斗,噬魂回元",
    color: "#6fe0b8",
    effects: ["drain", "spirit_wolves"],
    triggers: ["hurt", "pulse"],
    modifiers: ["lifesteal", "duration", "haste"],
    bonus3: { name: "雾噬", desc: "回复量 +25%" },
    bonus6: { name: "雾缚噬灵·极", desc: "质变:回复量翻倍,并附带 5% 吸血" },
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

  /* ---- 英雄系统批次新增 6 套(效果共享归属 → 凑件略易,质变档强度降档补偿) ---- */

  /** 冰川 3 件「界碑铭刻」:效果射程倍率(×1.1 = +10%) */
  glacier3RangeMult: 1.1,
  /** 冰川 6 件「冰川裁断·极」:ray/frost_ring 伤害倍率(共享套降档,不到翻倍) */
  glacier6PowerMult: 1.6,
  /** 白啸 3 件「白啸」:额外弹幕数(发) */
  blizzard3SplitExtra: 1,
  /** 白啸 3 件「白啸」:额外穿透数(次) */
  blizzard3PierceExtra: 1,
  /** 白啸 6 件「白啸霜刃·极」:knife/icelance 伤害倍率(共享套降档) */
  blizzard6PowerMult: 1.6,
  /** 瘟薪 3 件「瘟薪蔓延」:效果范围倍率(×1.12 = +12%;新套一律相乘,不沿用 ember3 赋值语义) */
  plague3RadiusMult: 1.12,
  /** 瘟薪 6 件「熔毒瘟薪·极」:cloud/nova/magma_trail 伤害倍率(共享套降档) */
  plague6PowerMult: 1.6,
  /** 炽牙 3 件「炽牙」:连锁额外目标数(个) */
  cinderfang3ChainExtra: 1,
  /** 炽牙 6 件「雷殛·极」:chain/meteor 伤害倍率(共享套降档) */
  cinderfang6PowerMult: 1.5,
  /** 镇魂 3 件「安可」:召唤额外数量(只) */
  requiem3SummonExtra: 1,
  /** 镇魂 6 件「镇魂安可·极」:召唤物伤害倍率(只动伤害轴,数量轴留给 3 件) */
  requiem6SummonPower: 1.5,
  /** 雾缚 3 件「雾噬」:回复量倍率(×1.25 = +25%) */
  veil3HealMult: 1.25,
  /** 雾缚 6 件「雾缚噬灵·极」:回复量倍率(翻倍;数量/回复轴允许翻倍) */
  veil6HealMult: 2,
  /** 雾缚 6 件「雾缚噬灵·极」:附带吸血比例(伤害 × 该值回血;5%) */
  veil6Lifesteal: 0.05,
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

/** 效果归属的全部套组(多对一:14 效果各被 2 套认领) */
export function setsOfEffect(e: EffectType): SetId[] {
  const out: SetId[] = [];
  for (const s of allSets()) {
    if (s.effects.includes(e)) out.push(s.id);
  }
  return out;
}

/** 效果的首个认领套(仅展示/兜底用;件数统计走 isSetPiece) */
export function setOfEffect(e: EffectType): SetId | null {
  return setsOfEffect(e)[0] ?? null;
}

/** 套组发布赛季(常驻三套视作 S1 发布,与赛季套同构) */
export function setReleaseSeason(id: SetId): number {
  return setDef(id).releaseSeason ?? 1;
}

/** 当季新发布套组(= 当季 3 套专属;S5 起排期外,返回空表) */
export function seasonNewSets(seasonId: number): SetId[] {
  return allSets().filter((s) => setReleaseSeason(s.id) === Math.max(1, Math.floor(seasonId))).map((s) => s.id);
}

/** 装备是否属于该套组(看效果类型是否被本套认领;同一件可同时计入多个派系) */
export function isSetPiece(eq: Equipment, id: SetId): boolean {
  return setDef(id).effects.includes(eq.effect.def.type);
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
