/**
 * 赛季套组轮换(DESIGN-SEASON-SETS.md)—— 给玩家每个赛季的新鲜感。
 * L1 主题层:每赛季一个主题(名称/主色/环境词缀倾向),纯风味,零引擎;
 * L2 套组赛季词缀:每赛季三套常驻套组各得一条确定性「赛季联动」加成(stat 级 ±15% 内,
 *   4 件套激活时生效)+ 商店刷本套卡时的修饰器倾向;
 * L3 赛季限定套组:featuredSetId 按 seasonId 给出当季套组(P2 起实装新套组后生效,
 *   实装前由 allSets 存在性守卫返回 null,保证 S1 行为冻结)。
 *
 * 铁律:全部 seasonId → 纯函数,同赛季恒同配置(与幻影榜同纪律);
 *       所有 patch 只作用于玩家侧,绝不折入怪物曲线(数值墙不回头)。
 */

import type { ModifierType } from "./affixes";
import type { SetId } from "./sets";
import { allSets } from "./sets";

/* ---------- L1 赛季主题 ---------- */

export interface SeasonTheme {
  name: string;
  color: string;
  /** 一句 flavor 文案(菜单/结算展示) */
  flavor: string;
  /** 环境词缀加权(权重 1 = 平权;>1 提升出现倾向;缺省不动) */
  envBias?: Partial<Record<"reflect_field" | "heal_aura" | "space_warp" | "time_dilation" | "death_chain" | "mist", number>>;
}

const THEMES: readonly SeasonTheme[] = [
  {
    name: "回响苏醒",
    color: "#7a5cff",
    flavor: "深渊的第一声回响,唤醒了沉睡的武器套组",
  },
  {
    name: "永冻深渊",
    color: "#5ac8fa",
    flavor: "寒雾凝成迷障,冰脉在冻土下低鸣",
    envBias: { mist: 2, space_warp: 2 },
  },
  {
    name: "熔火回响",
    color: "#ff9d2e",
    flavor: "余烬未冷,熔核教团在地底重燃炉火",
    envBias: { death_chain: 2 },
  },
  {
    name: "幽冥潮汐",
    color: "#9b6cff",
    flavor: "亡者在雾中列队,应和亡影剧团的哨音",
    envBias: { mist: 2 },
  },
];

/** 赛季 → 主题下标(4 主题循环;seasonId ≥ 1)。主题怪表等按主题分组的内容共用本函数,勿另写循环 */
export function seasonThemeIndex(seasonId: number): number {
  const n = Math.max(0, Math.floor(seasonId) - 1);
  return n % THEMES.length;
}

/** 赛季主题(4 主题循环;seasonId ≥ 1) */
export function seasonTheme(seasonId: number): SeasonTheme {
  return THEMES[seasonThemeIndex(seasonId)];
}

/* ---------- L2 套组赛季词缀 ---------- */

/** stat 级补丁:全部是 statsOf 已有通路,|mult - 1| ≤ 0.15(数值墙不回头) */
export interface SeasonMutationPatch {
  /** 效果伤害倍率 */
  dmgMult?: number;
  /** 触发间隔倍率(<1 = 更快) */
  intervalMult?: number;
  /** 效果范围/射程倍率 */
  rangeMult?: number;
  /** 回复量倍率 */
  healMult?: number;
  /** 持续时长倍率 */
  durationMult?: number;
  /** 召唤物伤害倍率(只作用于召唤系效果,亡影谢幕用) */
  summonMult?: number;
}

export interface SeasonMutation {
  name: string;
  desc: string;
  patch: SeasonMutationPatch;
  /** 商店刷本套卡时,第一个修饰器定向为此类型(卡池倾向) */
  modifierBias?: ModifierType;
}

type BaseSetId = "thorn" | "barrage" | "ember";

/**
 * 三常驻套的 mutation 池:每套 5 条,seasonId 轮换 pool[(seasonId-1) % 5]。
 * 池下标 0-3 = S1-S4(见设计文档 §3.1),下标 4 = S5 起轮换复用期的第五条。
 */
const MUTATION_POOLS: Record<BaseSetId, readonly SeasonMutation[]> = {
  thorn: [
    { name: "棘刺过载", desc: "效果射程 +15%", patch: { rangeMult: 1.15 }, modifierBias: "explode" },
    { name: "冰鳞棘甲", desc: "生命回复 +15%", patch: { healMult: 1.15 }, modifierBias: "lifesteal" },
    { name: "熔核心搏", desc: "触发间隔 -10%", patch: { intervalMult: 0.9 }, modifierBias: "haste" },
    { name: "蚀骨之棘", desc: "效果伤害 +12%", patch: { dmgMult: 1.12 }, modifierBias: "power" },
    { name: "回响缠绕", desc: "效果持续 +10%", patch: { durationMult: 1.1 }, modifierBias: "duration" },
  ],
  barrage: [
    { name: "过载装填", desc: "触发间隔 -8%", patch: { intervalMult: 0.92 }, modifierBias: "haste" },
    { name: "贯穿寒潮", desc: "效果伤害 +10%", patch: { dmgMult: 1.1 }, modifierBias: "pierce" },
    { name: "爆裂风暴", desc: "效果伤害 +12%", patch: { dmgMult: 1.12 }, modifierBias: "explode" },
    { name: "影刃齐射", desc: "触发间隔 -10%", patch: { intervalMult: 0.9 }, modifierBias: "split" },
    { name: "弹幕延展", desc: "效果射程 +12%", patch: { rangeMult: 1.12 }, modifierBias: "split" },
  ],
  ember: [
    { name: "余烬滋养", desc: "效果持续 +15%", patch: { durationMult: 1.15 }, modifierBias: "duration" },
    { name: "余烬封霜", desc: "效果射程 +10%", patch: { rangeMult: 1.1 }, modifierBias: "split" },
    { name: "燎原之势", desc: "效果范围 +15%", patch: { rangeMult: 1.15 }, modifierBias: "duration" },
    { name: "群影盛宴", desc: "效果持续 +12%", patch: { durationMult: 1.12 }, modifierBias: "chain" },
    { name: "星火燎原", desc: "效果伤害 +10%", patch: { dmgMult: 1.1 }, modifierBias: "power" },
  ],
};

/**
 * 赛季限定套组的当季专属词缀(比常驻套稍强:双 patch,强化"本赛季玩新套"动机)。
 * 仅当该套组是当季 featured(featuredSetId 命中)时生效,赛季翻页后自动回落 null。
 */
const FEATURED_MUTATIONS: Partial<Record<SetId, SeasonMutation>> = {
  frost: {
    name: "凛冬已至",
    desc: "效果伤害 +10%,触发间隔 -8%",
    patch: { dmgMult: 1.1, intervalMult: 0.92 },
    modifierBias: "haste",
  },
  magma: {
    name: "过热地脉",
    desc: "效果持续 +15%",
    patch: { durationMult: 1.15 },
    modifierBias: "duration",
  },
  phantom: {
    name: "亡影谢幕",
    desc: "召唤物伤害 +25%",
    patch: { summonMult: 1.25 },
    modifierBias: "power",
  },
};

/**
 * 当前赛季某套组的「赛季联动」词缀(常驻三套按池轮换;赛季套组仅当季有专属词缀)。
 * 同赛季恒同一条;未选套组 / 赛季套组过季 → null。
 */
export function setMutation(seasonId: number, setId: SetId | null): SeasonMutation | null {
  if (!setId) return null;
  const pool = MUTATION_POOLS[setId as BaseSetId];
  if (pool) return pool[(Math.max(1, Math.floor(seasonId)) - 1) % pool.length];
  const fm = FEATURED_MUTATIONS[setId];
  if (fm && featuredSetId(seasonId) === setId) return fm;
  return null;
}

/* ---------- L3 赛季限定套组 ---------- */

/**
 * 赛季 → 当季限定套组排期(全部实装后此表即为轮换依据;排期外赛季 = null)。
 */
const FEATURED_BY_SEASON: Record<number, SetId> = { 2: "frost", 3: "magma", 4: "phantom" };

/** 当季限定套组(S1 = null;套组未实装 = null;实装后赛季内恒定) */
export function featuredSetId(seasonId: number): SetId | null {
  const id = FEATURED_BY_SEASON[Math.max(1, Math.floor(seasonId))];
  if (!id) return null;
  return allSets().some((s) => s.id === id) ? id : null;
}

/** 赛季套组当季是否被强化(商店偏向 60%→70% + 专属词缀) */
export function isSeasonBoosted(seasonId: number, setId: SetId): boolean {
  return featuredSetId(seasonId) === setId;
}
