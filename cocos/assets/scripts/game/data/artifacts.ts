/**
 * 法宝策划规范表 —— 主动法宝(14,= 现效果层)与被动法宝(8 修饰器 + 2 稀有 + 8 遗物)的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 依据 docs/DESIGN-HERO-RHYTHM.md §4 / §5 / §9(D3 道具并入被动池):
 *  - 主动法宝**不写发动条件**,发动由所挂节律决定(见 ./rhythm);每个法宝只挂一条节律;
 *  - 每个主动法宝标 2 条**共鸣节律**(直接取 ./reroll 的 `SKILL_AFFINITY[effect].triggers`,零新数据),
 *    挂在共鸣节律上时**改名 + 变形**(本表 `morph` 列),非共鸣节律只正常发动;
 *  - 被动法宝是**全局**的(对全部主动法宝与独有技能生效),同 id 可叠、第 2 张起按 `PASSIVE_STACK_DECAY` 递减;
 *    修饰器类被动走引擎 `statsOf`,遗物类被动(原 D3 道具)各挂在自己的结算位(见 RELIC_DEFS 备注)。
 */

import type { EffectType, ModifierParams, ModifierType, TriggerType } from "./affixes";
import { modifierDef } from "./affixes";
import type { Quality } from "./quality";
import { SKILL_AFFINITY } from "./reroll";
import type { RhythmId } from "./rhythm";
import { isRhythm } from "./rhythm";

/* ---------- 物品种类 ---------- */

/** 局内物品种类:active = 主动法宝(占主动槽)/ passive = 被动法宝(占被动槽)/ skill = 英雄独有技能(不占槽) */
export type ArtifactKind = "active" | "passive" | "skill";

/* ---------- 主动法宝 ---------- */

/**
 * 共鸣变形补丁:命中共鸣节律(法宝)或拿到共鸣被动(独有技能)时叠在 `statsOf` 之上的一组乘区与开关。
 * 全部是引擎已有的统计字段或一个布尔开关,不新增攻击原语(S1 口径;新原语留给后续赛季)。
 */
export interface MorphPatch {
  /** 伤害倍率 */
  power?: number;
  /** 范围倍率 */
  radiusMult?: number;
  /** 持续倍率 */
  durationMult?: number;
  /** 额外弹幕数 */
  splitExtra?: number;
  /** 额外穿透 */
  pierce?: number;
  /** 额外连锁目标 */
  chainTargets?: number;
  /** 额外召唤数 */
  summonExtra?: number;
  /** 回复倍率 */
  healMult?: number;
  /** 触发间隔缩减(叠入 haste,0-1) */
  haste?: number;
  /** 施放时附带护盾(吸收 = 最大生命 × amountPct,持续 sec 秒) */
  shieldOnCast?: { amountPct: number; sec: number };
  /** 召唤物从最近一次击杀位置起身(而不是玩家脚下) */
  spawnAtKill?: boolean;
  /** 弹幕 / 连锁数随当前连杀数增长:每 `per` 连杀 +1 */
  comboScale?: { per: number; cap: number };
  /** 施放朝向改为"来袭方向反打"(受击节律的射线 / 飞刀) */
  aimAtAttacker?: boolean;
  /** 附带爆炸(半径 / 伤害倍数;与被动「爆裂」同一结算位,已有爆炸时不覆盖) */
  explode?: { radius: number; damageMult: number };
}

export interface ArtifactDef {
  effect: EffectType;
  /** 法宝名(卡面主名;不含发动条件) */
  name: string;
  /** 事件型节律(击杀 / 连杀 / 受击 / 低血 / 移动)的内置冷却(秒);周期节律不读它 */
  innerCd: number;
  /** 共鸣节律(2 条;来源 SKILL_AFFINITY,权重 ×AFFINITY_WEIGHT 自动分配) */
  resonance: readonly RhythmId[];
  /** 命中共鸣时的变形名与一句说明 */
  morphName: string;
  morphDesc: string;
  morph: MorphPatch;
}

/** 从亲和表取共鸣节律(过滤掉隐藏触发器,保证只落在 6 种节律上) */
function resonanceOf(e: EffectType): readonly RhythmId[] {
  return SKILL_AFFINITY[e].triggers.filter(isRhythm);
}

/**
 * 主动法宝主表(§4.1)。`innerCd` 依据:0.4 = 允许密集尸潮里连放但不至于同帧齐放;
 * 召唤类 1.0 防滚雪球;护盾 / 汲取 1.2 与旧 hurtCd 同口径。
 */
export const ARTIFACT_DEFS: Record<EffectType, ArtifactDef> = {
  knife: { effect: "knife", name: "飞刀符", innerCd: 0.4, resonance: resonanceOf("knife"), morphName: "连杀飞刃", morphDesc: "飞刀数随连杀增长(每 4 连杀 +1)", morph: { comboScale: { per: 4, cap: 8 } } },
  nova: { effect: "nova", name: "新星符", innerCd: 0.6, resonance: resonanceOf("nova"), morphName: "护心新星", morphDesc: "新星爆发时附带 1 秒护盾", morph: { shieldOnCast: { amountPct: 0.08, sec: 1 } } },
  skeleton: { effect: "skeleton", name: "骸骨符", innerCd: 1.0, resonance: resonanceOf("skeleton"), morphName: "尸起骸骨", morphDesc: "骷髅从尸体处起身,数量 +1", morph: { spawnAtKill: true, summonExtra: 1 } },
  cloud: { effect: "cloud", name: "毒云符", innerCd: 0.4, resonance: resonanceOf("cloud"), morphName: "毒径", morphDesc: "毒云收窄成连续毒径,持续翻倍", morph: { radiusMult: 0.7, durationMult: 2 } },
  ray: { effect: "ray", name: "冰射符", innerCd: 0.4, resonance: resonanceOf("ray"), morphName: "反打冰射", morphDesc: "射线朝来袭方向反打,穿透 +1", morph: { aimAtAttacker: true, pierce: 1 } },
  chain: { effect: "chain", name: "雷链符", innerCd: 0.4, resonance: resonanceOf("chain"), morphName: "连杀雷链", morphDesc: "跳数随连杀增长(每 3 连杀 +1)", morph: { comboScale: { per: 3, cap: 8 } } },
  shield: { effect: "shield", name: "护盾符", innerCd: 1.2, resonance: resonanceOf("shield"), morphName: "棘盾", morphDesc: "护盾吸收量 ×1.5,持续 ×1.5", morph: { power: 1.5, durationMult: 1.5 } },
  drain: { effect: "drain", name: "汲取符", innerCd: 1.2, resonance: resonanceOf("drain"), morphName: "绝境汲取", morphDesc: "汲取回复翻倍", morph: { healMult: 2 } },
  icelance: { effect: "icelance", name: "冰锥符", innerCd: 0.4, resonance: resonanceOf("icelance"), morphName: "连冻冰锥", morphDesc: "冰锥 +1 发,穿透 +1", morph: { splitExtra: 1, pierce: 1 } },
  frost_ring: { effect: "frost_ring", name: "霜环符", innerCd: 0.6, resonance: resonanceOf("frost_ring"), morphName: "随行霜环", morphDesc: "霜环范围 ×1.3,持续 ×1.5", morph: { radiusMult: 1.3, durationMult: 1.5 } },
  meteor: { effect: "meteor", name: "陨星符", innerCd: 0.6, resonance: resonanceOf("meteor"), morphName: "连杀陨星", morphDesc: "陨星范围 ×1.25,伤害 ×1.2", morph: { radiusMult: 1.25, power: 1.2 } },
  magma_trail: { effect: "magma_trail", name: "熔迹符", innerCd: 0.3, resonance: resonanceOf("magma_trail"), morphName: "不灭熔迹", morphDesc: "熔迹持续 ×3", morph: { durationMult: 3 } },
  spirit_wolves: { effect: "spirit_wolves", name: "灵狼符", innerCd: 1.0, resonance: resonanceOf("spirit_wolves"), morphName: "食尸灵狼", morphDesc: "灵狼从尸体处扑出,数量 +1", morph: { spawnAtKill: true, summonExtra: 1 } },
  haunt_crown: { effect: "haunt_crown", name: "冠冕符", innerCd: 0.6, resonance: resonanceOf("haunt_crown"), morphName: "连杀冠冕", morphDesc: "亡影伤害 ×1.5,存活 ×1.5", morph: { power: 1.5, durationMult: 1.5 } },
};

export function artifactDef(e: EffectType): ArtifactDef {
  return ARTIFACT_DEFS[e];
}

/** 该效果挂在该触发器上是否共鸣(给赛季则连赛季格 / 过季回响格一起算) */
export function isResonant(e: EffectType, t: TriggerType, seasonId?: number): boolean {
  if (!isRhythm(t)) return false;
  return ARTIFACT_DEFS[e].resonance.includes(t) || seasonPairOf(e, t, seasonId) !== null;
}

/**
 * 默认节律分配(§4.1):已解锁节律里取共鸣者(按 resonance 表序),没有共鸣则取第一条(本命)。
 * 玩家在商店可手动切换,本函数只给"自动分配"那一档。
 */
export function defaultRhythmFor(e: EffectType, unlocked: readonly RhythmId[], seasonId?: number): RhythmId {
  for (const r of resonanceRhythmsOf(e, seasonId)) {
    if (unlocked.includes(r)) return r;
  }
  return unlocked[0] ?? "pulse";
}

/* ---------- 被动法宝 ---------- */

/** 遗物类被动(docs/DESIGN-SEASON-FEEL.md D3 的 8 件道具并入被动池) */
export type RelicId = "dice" | "core" | "hourglass" | "lens" | "stabilizer" | "yoke" | "mirror" | "spare_life";

/** 被动法宝类型 = 修饰器类(走引擎 statsOf)+ 遗物类(各自结算位) */
export type PassiveType = ModifierType | RelicId;

export interface PassiveDef {
  type: PassiveType;
  name: string;
  desc: string;
  /** 稀有被动(旧隐藏修饰器):不进常规刷卡池,只在 `PASSIVE_RARE_CHANCE` 命中时出 */
  rare: boolean;
  /** 遗物类(非修饰器):true = 数值在 RELIC_VALUES,不走 modifierParams */
  relic: boolean;
}

/**
 * 被动法宝主表(§4.2 + D3)。修饰器类数值走现有修饰器参数(`modifierParams` 那一支不变),本表只给身份与稀有度;
 * 遗物类数值见 RELIC_VALUES,结算位逐条备注。
 */
export const PASSIVE_DEFS: Record<PassiveType, PassiveDef> = {
  haste: { type: "haste", name: "冷缩", desc: "全体触发冷却缩短", rare: false, relic: false },
  power: { type: "power", name: "增幅", desc: "全体伤害提升", rare: false, relic: false },
  duration: { type: "duration", name: "恒久", desc: "全体持续时间延长", rare: false, relic: false },
  explode: { type: "explode", name: "爆裂", desc: "命中处产生范围爆炸", rare: false, relic: false },
  split: { type: "split", name: "分裂", desc: "弹体额外发射", rare: false, relic: false },
  pierce: { type: "pierce", name: "穿透", desc: "弹体可穿透敌人", rare: false, relic: false },
  chain: { type: "chain", name: "连锁", desc: "效果额外弹射目标", rare: false, relic: false },
  lifesteal: { type: "lifesteal", name: "吸血", desc: "造成伤害时回复生命", rare: false, relic: false },
  echo: { type: "echo", name: "回响", desc: "效果延迟后以半量再触发一次", rare: true, relic: false },
  condemned: { type: "condemned", name: "送葬", desc: "对残血敌人伤害大幅提升", rare: true, relic: false },
  // ---- 遗物类(D3 道具并入):结算位见 RELIC_VALUES 备注 ----
  dice: { type: "dice", name: "命运骰", desc: "商店出稀有被动的概率提升", rare: false, relic: true },
  core: { type: "core", name: "裂核", desc: "暴击率提升", rare: false, relic: true },
  hourglass: { type: "hourglass", name: "沙漏", desc: "全体触发间隔缩短", rare: false, relic: true },
  lens: { type: "lens", name: "透镜", desc: "效果范围扩大", rare: false, relic: true },
  stabilizer: { type: "stabilizer", name: "稳定器", desc: "弹道速度提升", rare: false, relic: true },
  yoke: { type: "yoke", name: "磁轭", desc: "金币拾取半径扩大", rare: false, relic: true },
  mirror: { type: "mirror", name: "护心镜", desc: "所受接触伤害降低", rare: false, relic: true },
  spare_life: { type: "spare_life", name: "假命", desc: "致死一击有概率免死并回一口血(每局一次)", rare: false, relic: true },
};

/**
 * 遗物类被动数值(D3 表值;叠加第 n 枚按 PASSIVE_STACK_DECAY 衰减,`spare_life` 不叠)。
 * dice.rareChance:每枚给商店稀有被动概率 +15%(挂 `generatePassive` 的 rareChance 加成);
 * core.critRate:暴击率 +8%(挂 `battleWorld.damageEnemy` 的暴击判定);
 * hourglass.haste:触发间隔 −10%(叠入 `statsOf` 的 haste,受 QUALITY_HASTE_CAP);
 * lens.radiusMult:效果范围 ×1.12(`statsOf` radiusMult);
 * stabilizer.speedMult:弹道速度 ×1.25(`statsOf` speedMult,飞刀 / 射线 / 冰锥读它);
 * yoke.magnetMult:拾取半径 ×1.4(`battleWorld.updateGems`);
 * mirror.contactMult:接触伤害 ×0.85(`battleWorld` 接触 / 震击 / 冲锋三处受击口);
 * spare_life.chance:致死时 20% 免死,回复 healPct 最大生命;每局 1 次(`battleWorld.afterPlayerDamage`)。
 */
export const RELIC_VALUES = {
  dice: { rareChance: 0.15 },
  core: { critRate: 0.08 },
  hourglass: { haste: 0.1 },
  lens: { radiusMult: 1.12 },
  stabilizer: { speedMult: 1.25 },
  yoke: { magnetMult: 1.4 },
  mirror: { contactMult: 0.85 },
  spare_life: { chance: 0.2, healPct: 0.2 },
} as const;

export const RELIC_TYPES: readonly RelicId[] = ["dice", "core", "hourglass", "lens", "stabilizer", "yoke", "mirror", "spare_life"];

export function isRelicType(t: PassiveType): t is RelicId {
  return PASSIVE_DEFS[t].relic;
}

/** 常规修饰器类被动池(商店刷卡从这里取) */
export const PASSIVE_NORMAL_TYPES: readonly ModifierType[] = (Object.keys(PASSIVE_DEFS) as PassiveType[]).filter((t): t is ModifierType => !PASSIVE_DEFS[t].rare && !PASSIVE_DEFS[t].relic);
/** 稀有被动池(旧隐藏修饰器 echo / condemned) */
export const PASSIVE_RARE_TYPES: readonly ModifierType[] = (Object.keys(PASSIVE_DEFS) as PassiveType[]).filter((t): t is ModifierType => PASSIVE_DEFS[t].rare);

/** 商店刷出被动法宝时命中稀有池的概率(0-1;与旧重随隐藏概率 6% 同口径) */
export const PASSIVE_RARE_CHANCE = 0.06;
/** 常规被动里遗物类的占比(0-1;修饰器 : 遗物 = 2 : 1,修饰器仍是构筑主轴) */
export const PASSIVE_RELIC_RATIO = 1 / 3;

/** 同 id 被动叠加:第 n 张(n 从 0 起)效果 × decay^n */
export const PASSIVE_STACK_DECAY = 0.6;
/** 同 id 被动最多叠几张 */
export const PASSIVE_STACK_CAP = 3;
/** 被动法宝槽位(件;不扩) */
export const PASSIVE_SLOTS = 4;
/**
 * 商店三卡位里固定给被动法宝的格数(张):第三格恒为被动(R1 裁定:每章都能看到一张被动,取舍稳定;
 * 刷新时它跟着换)。主动 : 被动 = 2 : 1 由此成为定数而不是概率。
 */
export const SHOP_PASSIVE_SLOTS = 1;

/** 被动法宝实例(全局生效;修饰器类 `params` 与修饰器实例同形,遗物类 params 为空、数值读 RELIC_VALUES) */
export interface PassiveArtifact {
  id: number;
  kind: "passive";
  type: PassiveType;
  name: string;
  quality: Quality;
  level: number;
  params: ModifierParams;
}

export function makePassive(id: number, type: PassiveType, quality: Quality, level: number, params: ModifierParams): PassiveArtifact {
  return { id, kind: "passive", type, name: PASSIVE_DEFS[type].name, quality, level, params };
}

/** 被动法宝的一行说明(名 + 表内说明;修饰器类的数值行由调用方按 params 另拼) */
export function passiveDesc(p: PassiveArtifact): string {
  const name = isRelicType(p.type) ? PASSIVE_DEFS[p.type].name : modifierDef(p.type).name;
  return `【${name}】${PASSIVE_DEFS[p.type].desc}`;
}

/** 同 type 的第 n 张(n 从 0 起)的效果倍率 */
export function passiveStackMult(n: number): number {
  return n >= PASSIVE_STACK_CAP ? 0 : Math.pow(PASSIVE_STACK_DECAY, n);
}

/** 某遗物在被动列里的叠加总倍率:Σ decay^n(0 = 没有) */
export function relicStack(passives: readonly PassiveArtifact[], id: RelicId): number {
  let n = 0;
  let sum = 0;
  for (const p of passives) {
    if (p.type !== id) continue;
    sum += passiveStackMult(n);
    n += 1;
  }
  return sum;
}

/* ---------- 共鸣发现(§5:首次达成任一共鸣的横幅 + 时停 + 图鉴) ---------- */

export const DISCOVERY = {
  /** 时停(秒):战斗停 0.4s 让横幅被看见 */
  hitStop: 0.4,
  /** 横幅停留(秒) */
  bannerSec: 2,
  /** 赛季角标(R5):当季新格 / 过季回响格 / 本季首发基础格 */
  seasonNew: "本季新共鸣",
  seasonEcho: "回响共鸣",
  seasonFeatured: "本季首发",
} as const;
/* ---------- 赛季共鸣(R5:每季换共鸣格,不换法宝池) ---------- */

/**
 * 赛季新共鸣格:法宝 × 节律一格,只填在基础表(SKILL_AFFINITY 派生的 2 格/行)之外的空格上,
 * 与基础格互不重叠(测试守卫)。当季命中 = 改名 + 全量补丁;过季变「回响共鸣」= 改名保留、补丁按 SEASON_ECHO_MULT 减半。
 */
export interface SeasonPairDef {
  effect: EffectType;
  rhythm: RhythmId;
  /** 命中时的变形名与一句说明 */
  name: string;
  desc: string;
  morph: MorphPatch;
}

/** 赛季法宝 id(每季 1 枚「脸」;S1 无) */
export type SeasonArtifactId = "s2_frost_jail" | "s3_magma_core" | "s4_soul_call";

/**
 * 赛季法宝:现效果原语的变体(数值走该效果的等级成长),自带 1 条共鸣节律与专属变形,与本季 3 对新共鸣里的一对同节律。
 * 上市赛季商店按 SEASON_FACE_OFFER_CHANCE 偏向出现;过季进通用池按件数均摊、不再偏向(常驻可收藏)。
 */
export interface SeasonArtifactDef {
  id: SeasonArtifactId;
  season: number;
  effect: EffectType;
  name: string;
  /** 事件型节律内置冷却(秒),口径同 ArtifactDef.innerCd */
  innerCd: number;
  resonance: readonly RhythmId[];
  morphName: string;
  morphDesc: string;
  morph: MorphPatch;
}

export interface SeasonResonanceSet {
  season: number;
  /** 本季 3 对新共鸣(S1 为空:首季只标 3 对基础格为「首发」) */
  pairs: readonly SeasonPairDef[];
  /** 本季赛季法宝(S1 无) */
  face: SeasonArtifactId | null;
  /** 本季「首发」角标的基础共鸣格(只影响发现横幅角标) */
  featured: readonly (readonly [EffectType, RhythmId])[];
}

/**
 * 赛季共鸣表(docs/DESIGN-HERO-RHYTHM.md §5.1,用户裁定 R5「B+」,2026-09-13)。
 * 词面跟 ./seasonSets 的 4 主题走:S2 永冻 / S3 熔火 / S4 幽冥;seasonId ≥ 5 目前无表(= 只剩回响共鸣),TODO 第 2 轮主题循环时补。
 * 数值全是初值:乘区不超过基础表同类格(基础格最高 ×2 / 持续 ×3),整数项 ≤ 2。
 */
export const SEASON_RESONANCES: Record<number, SeasonResonanceSet> = {
  1: {
    season: 1,
    pairs: [],
    face: null,
    // 首季首发:三条最常见本命上的共鸣格(毒径 / 反打冰射 / 连杀雷链)
    featured: [["cloud", "move"], ["ray", "hit"], ["chain", "kill"]],
  },
  2: {
    season: 2,
    pairs: [
      { effect: "frost_ring", rhythm: "hit", name: "霜甲环", desc: "受击起霜环,范围 ×1.2、持续 ×1.3", morph: { radiusMult: 1.2, durationMult: 1.3 } },
      { effect: "icelance", rhythm: "hurt", name: "绝境冰雨", desc: "低血时冰锥 +2 发,单发伤害 ×0.85", morph: { splitExtra: 2, power: 0.85 } },
      { effect: "ray", rhythm: "combo", name: "连杀冰束", desc: "连杀触发的射线穿透 +2,伤害 ×1.2", morph: { pierce: 2, power: 1.2 } },
    ],
    face: "s2_frost_jail",
    featured: [],
  },
  3: {
    season: 3,
    pairs: [
      { effect: "meteor", rhythm: "hit", name: "反击陨星", desc: "受击召陨星,伤害 ×1.3、范围 ×1.1", morph: { power: 1.3, radiusMult: 1.1 } },
      { effect: "magma_trail", rhythm: "kill", name: "尸焰熔迹", desc: "击杀处留熔迹,持续 ×1.5 并附带小爆炸", morph: { durationMult: 1.5, explode: { radius: 60, damageMult: 0.4 } } },
      { effect: "nova", rhythm: "kill", name: "连爆新星", desc: "击杀引爆新星,伤害 ×1.2 并附带爆炸", morph: { power: 1.2, explode: { radius: 70, damageMult: 0.5 } } },
    ],
    face: "s3_magma_core",
    featured: [],
  },
  4: {
    season: 4,
    pairs: [
      { effect: "skeleton", rhythm: "hurt", name: "绝境亡军", desc: "低血时骷髅 +2,存活 ×1.2", morph: { summonExtra: 2, durationMult: 1.2 } },
      { effect: "haunt_crown", rhythm: "hurt", name: "濒死冠冕", desc: "低血时亡影伤害 ×1.6", morph: { power: 1.6 } },
      { effect: "spirit_wolves", rhythm: "move", name: "随行狼群", desc: "移动召狼 +1,触发间隔 −10%", morph: { summonExtra: 1, haste: 0.1 } },
    ],
    face: "s4_soul_call",
    featured: [],
  },
};

/** 赛季法宝主表(每季 1 枚;innerCd 口径同 ARTIFACT_DEFS:弹幕类 0.5、AOE 0.6) */
export const SEASON_ARTIFACTS: Record<SeasonArtifactId, SeasonArtifactDef> = {
  s2_frost_jail: { id: "s2_frost_jail", season: 2, effect: "icelance", name: "霜牢符", innerCd: 0.5, resonance: ["hit"], morphName: "冰牢", morphDesc: "受击起冰牢:冰锥 +2 发,穿透 +1", morph: { splitExtra: 2, pierce: 1 } },
  s3_magma_core: { id: "s3_magma_core", season: 3, effect: "meteor", name: "熔核符", innerCd: 0.6, resonance: ["hit"], morphName: "熔核反击", morphDesc: "受击召熔核:伤害 ×1.4 并附带爆炸", morph: { power: 1.4, explode: { radius: 80, damageMult: 0.5 } } },
  s4_soul_call: { id: "s4_soul_call", season: 4, effect: "haunt_crown", name: "招魂符", innerCd: 0.6, resonance: ["hurt"], morphName: "招魂", morphDesc: "低血招魂:亡影 +1,伤害 ×1.5", morph: { power: 1.5, summonExtra: 1 } },
};

/** 过季共鸣补丁保留比例:乘区向 1 收一半、整数项取上整的一半(+1 仍是 +1、+2 → +1)。依据 R5「老组合回落成回响共鸣」 */
export const SEASON_ECHO_MULT = 0.5;
/** 当季赛季法宝在商店主动货位的偏向概率:每张主动卡先掷这一下。依据 R5「当季偏向出现」;25% ≈ 每章至少见一次 */
export const SEASON_FACE_OFFER_CHANCE = 0.25;

export function seasonArtifactDef(id: SeasonArtifactId | undefined | null): SeasonArtifactDef | null {
  return id ? SEASON_ARTIFACTS[id] ?? null : null;
}

/** 当季赛季法宝(无表 / S1 → null) */
export function seasonFace(seasonId: number): SeasonArtifactDef | null {
  const set = SEASON_RESONANCES[Math.max(1, Math.floor(seasonId))];
  return set?.face ? SEASON_ARTIFACTS[set.face] : null;
}

/** 到该赛季为止已上市的全部赛季法宝(含当季),按上市序 */
export function seasonArtifactsAvailable(seasonId: number): readonly SeasonArtifactDef[] {
  const s = Math.max(1, Math.floor(seasonId));
  return (Object.values(SEASON_ARTIFACTS) as SeasonArtifactDef[]).filter((d) => d.season <= s);
}

/** 该效果 × 节律是否命中某季新共鸣格(季 ≤ 当前):当季 = 全量,过季 = 回响(echo) */
export function seasonPairOf(effect: EffectType, rhythm: TriggerType, seasonId?: number): { pair: SeasonPairDef; season: number; echo: boolean } | null {
  if (seasonId === undefined || !isRhythm(rhythm)) return null;
  const cur = Math.max(1, Math.floor(seasonId));
  for (const set of Object.values(SEASON_RESONANCES)) {
    if (set.season > cur) continue;
    const pair = set.pairs.find((p) => p.effect === effect && p.rhythm === rhythm);
    if (pair) return { pair, season: set.season, echo: set.season < cur };
  }
  return null;
}

/** 该效果 × 节律是否为本季「首发」基础格(只用于横幅角标) */
export function isSeasonFeatured(effect: EffectType, rhythm: TriggerType, seasonId: number): boolean {
  const set = SEASON_RESONANCES[Math.max(1, Math.floor(seasonId))];
  return !!set && set.featured.some(([e, r]) => e === effect && r === rhythm);
}

/** 补丁按比例回落(过季回响):乘区 1 + (v − 1)·k,整数项 ceil(v·k),haste / 护盾量 / 爆炸倍数 ×k,开关项与连杀步长原样 */
export function echoMorph(m: MorphPatch, k: number): MorphPatch {
  const mul = (v: number) => 1 + (v - 1) * k;
  const int = (v: number) => Math.ceil(v * k);
  const out: MorphPatch = {};
  if (m.power !== undefined) out.power = mul(m.power);
  if (m.radiusMult !== undefined) out.radiusMult = mul(m.radiusMult);
  if (m.durationMult !== undefined) out.durationMult = mul(m.durationMult);
  if (m.healMult !== undefined) out.healMult = mul(m.healMult);
  if (m.splitExtra !== undefined) out.splitExtra = int(m.splitExtra);
  if (m.pierce !== undefined) out.pierce = int(m.pierce);
  if (m.chainTargets !== undefined) out.chainTargets = int(m.chainTargets);
  if (m.summonExtra !== undefined) out.summonExtra = int(m.summonExtra);
  if (m.haste !== undefined) out.haste = m.haste * k;
  if (m.shieldOnCast) out.shieldOnCast = { amountPct: m.shieldOnCast.amountPct * k, sec: m.shieldOnCast.sec };
  if (m.spawnAtKill) out.spawnAtKill = true;
  if (m.aimAtAttacker) out.aimAtAttacker = true;
  if (m.comboScale) out.comboScale = { per: m.comboScale.per, cap: Math.max(1, Math.ceil(m.comboScale.cap * k)) };
  if (m.explode) out.explode = { radius: m.explode.radius, damageMult: m.explode.damageMult * k };
  return out;
}

/** 该效果到该赛季为止的全部共鸣节律:基础 2 格在前,赛季格按上市序在后(赛季不给 = 只基础) */
export function resonanceRhythmsOf(effect: EffectType, seasonId?: number): readonly RhythmId[] {
  const out: RhythmId[] = [...ARTIFACT_DEFS[effect].resonance];
  if (seasonId !== undefined) {
    const cur = Math.max(1, Math.floor(seasonId));
    for (const set of Object.values(SEASON_RESONANCES)) {
      if (set.season > cur) continue;
      for (const p of set.pairs) if (p.effect === effect && !out.includes(p.rhythm)) out.push(p.rhythm);
    }
  }
  return out;
}

