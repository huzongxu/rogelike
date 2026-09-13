/**
 * 装备生成 —— 依据品质构成规则(3.1/3.2)随机生成装备。
 * 三选一升级、精英掉落都走这里。
 */

import {
  type EffectInstance,
  type EffectType,
  type HiddenAffixType,
  type ModifierInstance,
  type ModifierType,
  type TriggerInstance,
  type TriggerType,
  NORMAL_MODIFIER_DEFS,
  NORMAL_TRIGGER_DEFS,
  effectDef,
  makeEffect,
  makeModifier,
  makeTrigger,
} from "./affixes";
import {
  type Quality,
  qualityDef,
  qualityWeightsForLevel,
  qualityUpgrade,
  qualityPowerRatio,
  QUALITY_ORDER,
  QUALITY_MAX_LEVEL,
  QUALITY_BASE_PRICE_DEFAULT,
  QUALITY_UPGRADE_COST_GROWTH,
} from "./quality";
// 品质策划数值的对外 API 保持从本模块导出(历史导入路径兼容;数值本体在 ./quality)
export { qualityWeightsForLevel, qualityUpgrade, qualityPowerRatio, QUALITY_MAX_LEVEL };
import { pick, rand, randInt, pickWeighted } from "../core/math";
import { AFFINITY_WEIGHT, HIDDEN_MODIFIERS, HIDDEN_TRIGGERS, REROLL_HIDDEN, SKILL_AFFINITY } from "./reroll";
import { hiddenAffixDef } from "./fusion";
import { setDef, type SetId } from "./sets";
import {
  ARTIFACT_DEFS,
  PASSIVE_NORMAL_TYPES,
  PASSIVE_RARE_CHANCE,
  PASSIVE_RARE_TYPES,
  PASSIVE_RELIC_RATIO,
  RELIC_TYPES,
  SEASON_ECHO_MULT,
  SEASON_FACE_OFFER_CHANCE,
  defaultRhythmFor,
  echoMorph,
  makePassive,
  resonanceRhythmsOf,
  seasonArtifactDef,
  seasonArtifactsAvailable,
  seasonFace,
  seasonPairOf,
  type ArtifactKind,
  type MorphPatch,
  type PassiveArtifact,
  type SeasonArtifactDef,
  type SeasonArtifactId,
} from "./artifacts";
import { isRhythm, rhythmTriggerParams, type RhythmId } from "./rhythm";
import { baselineInterval, heroSkillDef, needsBaseline, skillTriggerParams, type HeroSkillDef } from "./heroSkills";
import { RESONANCE_TIERS, type SetBonusState } from "./sets";

let uid = 0;

/** 仅标定/测试用:重置装备 id 计数(start 可避开预置卡 id 段,防止合并去重撞 id) */
export function _resetEquipmentUid(start = 0): void {
  uid = start;
}

export interface Equipment {
  id: number;
  /** 获得时的玩家等级,决定数值成长 */
  level: number;
  quality: Quality;
  name: string;
  /**
   * 触发器 = 这件挂在哪条节律上(docs/DESIGN-HERO-RHYTHM.md §2):`triggers[0].def.type` 就是所挂节律,
   * 参数由 ./rhythm 的节律表给,不再随机;传奇档(品质 triggers = 2)可同时挂两条已解锁节律。
   */
  triggers: TriggerInstance[];
  effect: EffectInstance;
  modifiers: ModifierInstance[];
  /** 是否由精英怪直接掉落 */
  fromDrop?: boolean;
  /** 隐藏词缀(仅融合产出,彩虹品质) */
  hiddenAffix?: HiddenAffixType;
  /** 物品种类:缺省 = active(主动法宝);skill = 英雄独有技能(不占槽,升级三选一产出) */
  kind?: ArtifactKind;
  /** 独有技能 id(kind = skill 时必填;查 ./heroSkills) */
  skillId?: string;
  /** 赛季法宝变体(R5;查 ./artifacts SEASON_ARTIFACTS):名字 / 内置冷却 / 共鸣节律 / 变形都改读变体表 */
  variant?: SeasonArtifactId;
}

/** 物品种类(缺省视作主动法宝;老存档 / 老测试构造的装备都落到这一档) */
export function equipmentKind(eq: Equipment): ArtifactKind {
  return eq.kind ?? "active";
}

/** 这件当前挂的节律(首条触发器);隐藏触发器不是节律,返回 null */
export function equipmentRhythm(eq: Equipment): RhythmId | null {
  const t = eq.triggers[0]?.def.type;
  return t && t !== "crit" && t !== "elite" ? (t as RhythmId) : null;
}

/** 共鸣来源:base = 基础格(法宝表 / 赛季法宝自带格);season = 当季新格;echo = 过季回响格(补丁减半) */
export type ResonanceKind = "base" | "season" | "echo";

export interface ResonanceInfo {
  /** 变形名(卡面 / HUD 改名) */
  name: string;
  desc: string;
  morph: MorphPatch;
  kind: ResonanceKind;
  /** 赛季格所属赛季(base 无) */
  season?: number;
}

/** 法宝底名:赛季变体读变体表,否则法宝表 */
export function artifactBaseName(eq: Equipment): string {
  return seasonArtifactDef(eq.variant)?.name ?? ARTIFACT_DEFS[eq.effect.def.type].name;
}

/** 事件型节律内置冷却(秒):赛季变体读变体表,否则法宝表 */
export function artifactInnerCd(eq: Equipment): number {
  return seasonArtifactDef(eq.variant)?.innerCd ?? ARTIFACT_DEFS[eq.effect.def.type].innerCd;
}

/** 这件的全部共鸣节律(赛季变体 = 变体表;否则基础 2 格 + 到该赛季为止的赛季格) */
export function artifactResonanceRhythms(eq: Equipment, seasonId?: number): readonly RhythmId[] {
  const v = seasonArtifactDef(eq.variant);
  return v ? v.resonance : resonanceRhythmsOf(eq.effect.def.type, seasonId);
}

/**
 * 这件当前命中的共鸣(docs/DESIGN-HERO-RHYTHM.md §5 表 1 + §5.1 赛季格):按触发器序取第一条命中;
 * 技能与被动不参与;只有显式标了 active 的法宝参与(老档 / 老测试直接构造的装备无 kind → 不变形;开局归一化会补上 kind)。
 * 不给 seasonId = 只看基础格(老宿主 / 老测试口径)。
 */
export function equipmentResonance(eq: Equipment, seasonId?: number): ResonanceInfo | null {
  if (eq.kind !== "active" || eq.hiddenAffix) return null;
  const type = eq.effect.def.type;
  const v = seasonArtifactDef(eq.variant);
  for (const t of eq.triggers) {
    const r = t.def.type;
    if (!isRhythm(r)) continue;
    if (v) {
      if (v.resonance.includes(r)) return { name: v.morphName, desc: v.morphDesc, morph: v.morph, kind: "base" };
      continue;
    }
    const d = ARTIFACT_DEFS[type];
    if (d.resonance.includes(r)) return { name: d.morphName, desc: d.morphDesc, morph: d.morph, kind: "base" };
    const sp = seasonPairOf(type, r, seasonId);
    if (sp) return { name: sp.pair.name, desc: sp.pair.desc, morph: sp.echo ? echoMorph(sp.pair.morph, SEASON_ECHO_MULT) : sp.pair.morph, kind: sp.echo ? "echo" : "season", season: sp.season };
  }
  return null;
}

/** 这件是否挂在共鸣节律上(任一触发器共鸣即算;技能与被动不参与) */
export function equipmentResonant(eq: Equipment, seasonId?: number): boolean {
  return equipmentResonance(eq, seasonId) !== null;
}

/** 被动法宝里的「回响」规格(取第一枚;无则 null)—— 与装备自带修饰器的 echoSpecOf 二选一,装备优先 */
export function passiveEchoSpec(passives: readonly PassiveArtifact[]): { sec: number; mult: number } | null {
  const p = passives.find((x) => x.type === "echo");
  return p ? { sec: p.params.echoSec ?? 0, mult: p.params.echoMult ?? 0 } : null;
}

/** 被动法宝里的「送葬」增伤(多枚叠乘;无则 1),与 condemnedMultOf 同语义 */
export function passiveCondemnedMult(passives: readonly PassiveArtifact[], targetHpFrac: number): number {
  let mult = 1;
  for (const p of passives) {
    if (p.type !== "condemned") continue;
    if (targetHpFrac < (p.params.condemnHp ?? 0)) mult *= p.params.condemnMult ?? 1;
  }
  return mult;
}

/**
 * 独有技能是否拿到了共鸣被动(docs/DESIGN-HERO-RHYTHM.md §5 表 2):
 * 技能表标的那一枚被动法宝在玩家被动列里 → 技能改名 + 叠 `resonanceMorph`。
 */
export function skillResonant(eq: Equipment, passives: readonly PassiveArtifact[]): boolean {
  if (eq.kind !== "skill" || !eq.skillId) return false;
  const def = heroSkillDef(eq.skillId);
  return !!def && passives.some((p) => p.type === def.resonancePassive);
}

/**
 * 卡面主名:主动法宝 = 法宝名,共鸣时改走变形名;技能 = 技能名,拿到共鸣被动时改走共鸣名(需给 passives);
 * 其余沿用 name。
 */
export function equipmentDisplayName(eq: Equipment, passives?: readonly PassiveArtifact[], seasonId?: number): string {
  if (eq.kind === "skill") {
    if (passives && eq.skillId && skillResonant(eq, passives)) return heroSkillDef(eq.skillId)!.resonanceName;
    return eq.name;
  }
  if (equipmentKind(eq) !== "active" || eq.hiddenAffix) return eq.name;
  return equipmentResonance(eq, seasonId)?.name ?? artifactBaseName(eq);
}

/** 本局共鸣数(§5):挂在共鸣节律上的主动法宝 + 拿到共鸣被动的独有技能 */
export function resonanceCount(castList: readonly Equipment[], passives: readonly PassiveArtifact[], seasonId?: number): number {
  let n = 0;
  for (const eq of castList) {
    if (eq.kind === "skill" ? skillResonant(eq, passives) : equipmentResonant(eq, seasonId)) n += 1;
  }
  return n;
}

/**
 * 共鸣里程碑版的套组生效状态(替代按效果计件的 `setBonusState`):pieces = 共鸣数,
 * 两档门槛读 ./sets 的 RESONANCE_TIERS;SET_BONUSES 数值原样复用。
 */
export function resonanceBonusState(castList: readonly Equipment[], passives: readonly PassiveArtifact[], id: SetBonusState["id"] | null, seasonId?: number): SetBonusState | null {
  if (!id) return null;
  const pieces = resonanceCount(castList, passives, seasonId);
  return { id, pieces, bonus3: pieces >= RESONANCE_TIERS.tier1, bonus6: pieces >= RESONANCE_TIERS.tier2 };
}

/** 随机品质:按掉落权重曲线(见 ./quality 的 QUALITY_DROP_CURVE);rareBonus 为稀有额外加成(战利品嗅觉) */
export function randomQuality(level: number, rareBonus = 0): Quality {
  return pickWeighted(qualityWeightsForLevel(level, rareBonus));
}

/**
 * 常规触发器池(刷卡 / 三选一 / 套组生成都从这里取),由 ./affixes 的常规定义视图派生。
 * 隐藏触发器 `crit` / `elite` **不在内** —— 它们只走重随通道。
 */
export const NORMAL_TRIGGERS: readonly TriggerType[] = NORMAL_TRIGGER_DEFS.map((d) => d.type);

/** 生成指定触发器的数值参数(供定向搜索等外部使用;节律体系下法宝触发参数改读 ./rhythm,本函数留给重随与定向搜索) */
export function triggerParamsOf(t: TriggerType, level: number): Record<string, number> {
  return triggerParams(t, level);
}

function triggerParams(t: TriggerType, level: number): Record<string, number> {
  switch (t) {
    case "pulse":
      return { interval: round1(rand(1.2, 3.5) * Math.max(0.6, 1 - level * 0.012)) };
    case "kill":
      return { chance: round2(Math.min(0.6, 0.18 + level * 0.008)) };
    case "hurt":
      return { hpThreshold: round2(rand(0.5, 0.85)) };
    case "move":
      return { distance: Math.round(rand(300, 600)) };
    case "hit":
      return {};
    case "combo":
      return { count: randInt(3, 6), window: 2 };
    // 隐藏触发器(只走重随):不带随机参数,节奏由引擎侧冷却控制(见 combat.ts 的 CRIT_TRIGGER_CD)
    case "crit":
      return {};
    case "elite":
      return {};
  }
}

/** 通用卡池可产出的效果(套组专属效果之外的基础 8 种;套组可达性校验的唯一出处) */
export const GENERIC_EFFECT_TYPES: readonly EffectType[] = ["knife", "nova", "skeleton", "cloud", "ray", "chain", "shield", "drain"];

function randomEffect(_q: Quality, level: number): EffectInstance {
  const e = pick(GENERIC_EFFECT_TYPES as EffectType[]);
  return makeEffect(e, effectParams(e, level), level);
}

/** 装备等级成长系数:基础数值(伤害/秒伤/治疗/护盾)每级 +12%(倍率/级;策划案 3.1;生成与强化共用,勿在两处各写一份) */
export const EQUIPMENT_LEVEL_GROWTH = 0.12;

function effectParams(e: EffectType, level: number): Record<string, number> {
  const g = 1 + (level - 1) * EQUIPMENT_LEVEL_GROWTH;
  switch (e) {
    case "knife":
      // 射程 640:覆盖竖屏(720)内全部可见敌人,拒绝"只打屏幕局部"
      return { damage: Math.round(18 * g), speed: 520, radius: 640, spread: randInt(1, 3) };
    case "nova":
      return { damage: Math.round(30 * g), radius: 130 + level * 4, speed: 1 };
    case "skeleton":
      return { count: 1, damage: Math.round(12 * g), duration: 12 };
    case "cloud":
      return { dps: Math.round(10 * g), radius: 110, duration: 4 };
    case "ray":
      return { damage: Math.round(22 * g), speed: 620, radius: 640, slow: 0.45, duration: 2 };
    case "chain":
      return { damage: Math.round(26 * g), jumps: 3, radius: 380 };
    case "shield":
      return { amount: Math.round(40 * g), duration: 6 };
    case "drain":
      return { heal: Math.round(20 * g) };
    case "icelance":
      // 追踪冰锥:精准点杀高价值目标(DESIGN-SEASON-SETS §3.2)
      return { damage: Math.round(55 * g), speed: 700, radius: 640, homing: 4 };
    case "frost_ring":
      // 霜环:自身扩散环,扫过受伤+减速(一次性伤害记在 damage,ttl ≈ 半径/扩张速度)
      return { damage: Math.round(25 * g), radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 };
    case "meteor":
      // 陨星:延迟落点 AOE + 灼烧余烬(DESIGN-SEASON-SETS §3.3)
      return { damage: Math.round(90 * g), radius: 140, delay: 1 };
    case "magma_trail":
      // 熔岩足迹:移动留火(节流 = move 触发器的距离阈值)
      return { dps: Math.round(12 * g), radius: 60, duration: 3 };
    case "spirit_wolves":
      // 灵狼:群体近战协战,移速 ×1.3(cast 内定值;DESIGN-SEASON-SETS §3.4)
      return { count: 2, damage: Math.round(14 * g), duration: 12 };
    case "haunt_crown":
      // 亡灵冠冕:击杀概率在尸体处唤醒亡影(chance 挂触发器;场上亡影上限 4)
      return { count: 1, damage: Math.round(10 * g), duration: 8 };
  }
}

/**
 * 常规修饰器池,由 ./affixes 的常规定义视图派生。隐藏修饰器 `echo` / `condemned` **不在内** —— 只走重随通道。
 */
export const NORMAL_MODIFIERS: readonly ModifierType[] = NORMAL_MODIFIER_DEFS.map((d) => d.type);

function randomModifiers(q: Quality, level: number): ModifierInstance[] {
  const n = qualityDef(q).modifiers;
  const types = shuffle<ModifierType>([...NORMAL_MODIFIERS]);
  const out: ModifierInstance[] = [];
  for (let i = 0; i < n; i++) {
    const t = types[i % types.length];
    out.push(makeModifier(t, modifierParams(t, level)));
  }
  return out;
}

/** 隐藏修饰器数值(只走重随通道;池定义见 ./reroll)—— 单一出处,勿在引擎或视图里另写一份 */
export const HIDDEN_MODIFIER_VALUES = {
  /** 回响:0.35s 后以 50% 伤害再触发一次 */
  echo: { echoSec: 0.35, echoMult: 0.5 },
  /** 送葬:目标生命低于 30% 时伤害 ×1.45 */
  condemned: { condemnHp: 0.3, condemnMult: 1.45 },
} as const;

function modifierParams(m: ModifierType, level: number): Record<string, number> {
  switch (m) {
    case "chain":
      return { targets: randInt(2, 4) };
    case "explode":
      return { radius: 90 + randInt(0, 30), damageMult: 0.8 };
    case "split":
      return { extra: randInt(2, 4) };
    case "lifesteal":
      return { pct: round2(0.04 + level * 0.0015) };
    case "pierce":
      return { count: randInt(1, 3) };
    case "haste":
      return { pct2: round2(0.1 + level * 0.004) };
    case "power":
      return { pct3: round2(0.15 + level * 0.006) };
    case "duration":
      return { sec: randInt(1, 3) };
    case "echo":
      return { ...HIDDEN_MODIFIER_VALUES.echo };
    case "condemned":
      return { ...HIDDEN_MODIFIER_VALUES.condemned };
  }
}

/**
 * 主动法宝的触发器列:第 1 条 = 默认分配的节律(已解锁里的共鸣者,否则本命),品质允许双触发(传奇)
 * 且还有第二条已解锁节律时再挂一条。未给 unlocked(收藏掉落 / 扭蛋 / 融合这类"随身带走"的产物)
 * 时按共鸣表序填满品质件数 —— 开局带入时 `normalizeArtifact` 会按本局已解锁节律重新分配。
 */
function artifactTriggers(effect: EffectType, q: Quality, unlocked?: readonly RhythmId[], rhythmLevels?: Partial<Record<RhythmId, number>>, resonance?: readonly RhythmId[]): TriggerInstance[] {
  const n = Math.max(1, qualityDef(q).triggers);
  const res = resonance ?? ARTIFACT_DEFS[effect].resonance;
  const pool: RhythmId[] = unlocked && unlocked.length > 0 ? [...unlocked] : [...res];
  const first = unlocked && unlocked.length > 0 ? (res.find((r) => unlocked.includes(r)) ?? unlocked[0]) : pool[0];
  const order = [first, ...pool.filter((r) => r !== first)];
  const out: TriggerInstance[] = [];
  for (let i = 0; i < n && i < order.length; i++) {
    const r = order[i];
    out.push(makeTrigger(r, rhythmTriggerParams(r, rhythmLevels?.[r] ?? 1)));
  }
  return out;
}

/**
 * 生成一件主动法宝(docs/DESIGN-HERO-RHYTHM.md §4.1):效果 = 通用池 8 种之一,**不带修饰器**
 * (修饰器层已升格为全局被动法宝,见 ./artifacts),触发器 = 所挂节律(见 artifactTriggers)。
 * `unlocked` = 本局已解锁节律(商店进货给;收藏 / 扭蛋等场外产物不给)。
 */
export function generateEquipment(level: number, quality?: Quality, fromDrop = false, rareBonus = 0, unlocked?: readonly RhythmId[], seasonId?: number): Equipment {
  const q = quality ?? randomQuality(level, rareBonus);
  const v = seasonId === undefined ? null : rollSeasonVariant(seasonId);
  const effect = v ? makeEffect(v.effect, effectParams(v.effect, level), level) : randomEffect(q, level);
  const triggers = artifactTriggers(effect.def.type, q, unlocked, undefined, v ? v.resonance : resonanceRhythmsOf(effect.def.type, seasonId));
  const modifiers: ModifierInstance[] = [];
  const eq: Equipment = { id: ++uid, level, quality: q, name: "", triggers, effect, modifiers, fromDrop, kind: "active" };
  if (v) eq.variant = v.id;
  eq.name = equipmentDisplayName(eq, undefined, seasonId);
  return eq;
}

/**
 * 赛季法宝掷点(R5):当季「脸」先按 SEASON_FACE_OFFER_CHANCE 偏向;不中则已上市的全部赛季法宝与通用池 8 种按件数均摊
 * (n 枚变体 → n / (8 + n));都不中 = 通用池。S1 无赛季法宝 → 恒 null。
 */
function rollSeasonVariant(seasonId: number): SeasonArtifactDef | null {
  const face = seasonFace(seasonId);
  if (face && Math.random() < SEASON_FACE_OFFER_CHANCE) return face;
  const avail = seasonArtifactsAvailable(seasonId);
  if (avail.length === 0) return null;
  if (Math.random() < avail.length / (GENERIC_EFFECT_TYPES.length + avail.length)) return pick(avail as SeasonArtifactDef[]);
  return null;
}

/**
 * 把一件主动法宝挂到指定节律上(商店「切换节律」/ 开局归一化):首条触发器换成该节律,
 * 传奇档的第二条保留为另一条已解锁节律;名字随共鸣与否重算。技能与被动不接受切换(原样返回)。
 */
export function assignRhythm(eq: Equipment, rhythm: RhythmId, unlocked: readonly RhythmId[], rhythmLevels?: Partial<Record<RhythmId, number>>, seasonId?: number): Equipment {
  if (equipmentKind(eq) !== "active" || eq.hiddenAffix) return eq;
  const n = Math.max(1, qualityDef(eq.quality).triggers);
  const others = unlocked.filter((r) => r !== rhythm);
  const order = [rhythm, ...others];
  const triggers: TriggerInstance[] = [];
  for (let i = 0; i < n && i < order.length; i++) {
    const r = order[i];
    triggers.push(makeTrigger(r, rhythmTriggerParams(r, rhythmLevels?.[r] ?? 1)));
  }
  eq.triggers = triggers;
  eq.name = equipmentDisplayName(eq, undefined, seasonId);
  return eq;
}

/** 开局归一化:随身带入的法宝(收藏件 / 扭蛋件)按本局已解锁节律重新分配;已挂在合法节律上的不动 */
export function normalizeArtifact(eq: Equipment, unlocked: readonly RhythmId[], rhythmLevels?: Partial<Record<RhythmId, number>>, seasonId?: number): Equipment {
  if (equipmentKind(eq) !== "active" || eq.hiddenAffix) return eq;
  eq.kind = "active";
  const cur = equipmentRhythm(eq);
  const legal = eq.triggers.length > 0 && eq.triggers.every((t) => (unlocked as readonly string[]).includes(t.def.type));
  if (cur && legal) {
    eq.name = equipmentDisplayName(eq, undefined, seasonId);
    return eq;
  }
  return assignRhythm(eq, defaultRhythmOf(eq, unlocked, seasonId), unlocked, rhythmLevels, seasonId);
}

/** 这件的默认节律:赛季变体按变体共鸣表挑已解锁者,否则走法宝表(含赛季格) */
export function defaultRhythmOf(eq: Equipment, unlocked: readonly RhythmId[], seasonId?: number): RhythmId {
  const v = seasonArtifactDef(eq.variant);
  if (!v) return defaultRhythmFor(eq.effect.def.type, unlocked, seasonId);
  return v.resonance.find((r) => unlocked.includes(r)) ?? unlocked[0] ?? "pulse";
}

/** 商店「切换节律」的下一档:按已解锁顺序轮转到当前节律的下一条 */
export function nextRhythmOf(eq: Equipment, unlocked: readonly RhythmId[]): RhythmId | null {
  if (unlocked.length <= 1) return null;
  const cur = equipmentRhythm(eq);
  const i = cur ? unlocked.indexOf(cur) : -1;
  return unlocked[(i + 1) % unlocked.length];
}

/**
 * 生成一枚被动法宝(§4.2):常规池 8 种按 `rand` 均匀取;`PASSIVE_RARE_CHANCE` 命中时取稀有池(旧隐藏修饰器)。
 * 数值走修饰器参数那一支(`modifierParams`),品质走掉落曲线(与主动法宝同口径)。
 */
export function generatePassive(level: number, rareBonus = 0, rand: () => number = Math.random, quality?: Quality, rareChanceBonus = 0): PassiveArtifact {
  const q = quality ?? randomQuality(level, rareBonus);
  const rare = rand() < PASSIVE_RARE_CHANCE + rareChanceBonus;
  if (rare) {
    const type = PASSIVE_RARE_TYPES[Math.min(PASSIVE_RARE_TYPES.length - 1, Math.floor(rand() * PASSIVE_RARE_TYPES.length))];
    return makePassive(++uid, type, q, level, modifierParams(type, level));
  }
  // 常规池:修饰器类 : 遗物类 = 2 : 1(PASSIVE_RELIC_RATIO);遗物数值读 RELIC_VALUES,实例不带 params
  if (rand() < PASSIVE_RELIC_RATIO) {
    const relic = RELIC_TYPES[Math.min(RELIC_TYPES.length - 1, Math.floor(rand() * RELIC_TYPES.length))];
    return makePassive(++uid, relic, q, level, {});
  }
  const type = PASSIVE_NORMAL_TYPES[Math.min(PASSIVE_NORMAL_TYPES.length - 1, Math.floor(rand() * PASSIVE_NORMAL_TYPES.length))];
  return makePassive(++uid, type, q, level, modifierParams(type, level));
}

/** 英雄独有技能 id 段:9100 起(避开初始武器 9000–9012 与商店负 id) */
let skillUid = 9100;
export function _resetSkillUid(start = 9100): void {
  skillUid = start;
}

/**
 * 把技能定义实例化为一件 kind = "skill" 的装备(§3):效果 / 1 阶参数 / 自带修饰器来自技能表,
 * 触发器 = 技能自己的节律(参数读节律表)。阶数就是 `level`,升阶走 `upgradeEquipment`。
 */
/**
 * 技能的触发器列(R6):首条 = 所挂节律(节律表参数 × 这一招的调率);核心技能挂事件节律时再带一条「底拍」慢周期
 * (CORE_BASELINE_INTERVAL,保证冷启动)。世界层第二本命换节律也走这里,保证两处一致。
 */
export function skillTriggers(def: Pick<HeroSkillDef, "kind" | "rhythmTune">, rhythm: RhythmId, rhythmLevel = 1): TriggerInstance[] {
  const out = [makeTrigger(rhythm, skillTriggerParams(def, rhythm, rhythmLevel))];
  if (needsBaseline(def, rhythm)) out.push(makeTrigger("pulse", { interval: baselineInterval(def) }));
  return out;
}

export function makeSkillEquipment(def: HeroSkillDef, rhythmLevel = 1): Equipment {
  const effect = makeEffect(def.effect, { ...def.params }, 1);
  return {
    id: ++skillUid,
    level: 1,
    quality: "common",
    name: def.name,
    triggers: skillTriggers(def, def.rhythm, rhythmLevel),
    effect,
    modifiers: (def.modifiers ?? []).map((m) => makeModifier(m, modifierParams(m, 1))),
    kind: "skill",
    skillId: def.id,
  };
}

/**
 * 套组专属卡池(需求优化 v2):生成一件效果/触发器/修饰器都来自该套组的卡。
 * 商店刷卡时偏向本套,玩家凑 2/4 件套联动。
 * modBias = 赛季联动词缀的修饰器倾向(DESIGN-SEASON-SETS L2):有修饰器时首件定向为该类型。
 */
export function generateSetEquipment(setId: SetId, level: number, rareBonus = 0, _modBias?: ModifierType, unlocked?: readonly RhythmId[]): Equipment {
  const s = setDef(setId);
  const q = randomQuality(level, rareBonus);
  const effectType = pick(s.effects);
  const effect = makeEffect(effectType, effectParams(effectType, level), level);
  // 套组卡池只决定"出哪个效果";触发器 = 所挂节律、修饰器层已升格为被动法宝(docs/DESIGN-HERO-RHYTHM.md §4)
  const triggers = artifactTriggers(effectType, q, unlocked);
  const eq: Equipment = { id: ++uid, level, quality: q, name: "", triggers, effect, modifiers: [], kind: "active" };
  eq.name = equipmentDisplayName(eq);
  return eq;
}

/** 等级放大的主数值键(强化与商店预览共用一份;勿在视图层再抄一遍) */
export const UPGRADE_MAIN_KEYS = ["damage", "dps", "heal", "amount"] as const;

/**
 * 强化已有装备:等级 +1,伤害/秒伤/治疗/护盾按成长比例提升,范围小幅成长。
 * 这是"攻击效果拿得到强化"的核心:让玩家现有的攻击持续变强,而不是只给新装备。
 */
export function upgradeEquipment(eq: Equipment): Equipment {
  const gOld = 1 + (eq.level - 1) * EQUIPMENT_LEVEL_GROWTH;
  const gNew = 1 + eq.level * EQUIPMENT_LEVEL_GROWTH;
  const ratio = gNew / gOld;
  const p = eq.effect.params;
  for (const k of UPGRADE_MAIN_KEYS) {
    if (typeof p[k] === "number") p[k] = Math.round(p[k] * ratio);
  }
  if (typeof p.radius === "number") p.radius = Math.round(p.radius * 1.03);
  eq.level += 1;
  return eq;
}

function cloneEq(eq: Equipment): Equipment {
  return JSON.parse(JSON.stringify(eq)) as Equipment;
}

/* ---------- 荆棘反伤回血流(需求优化:受击类配合吸血/汲取/护盾) ---------- */

/** 装备是否提供回血来源(生命汲取/护盾生成效果,或吸血修饰器) */
export function equipmentHasHeal(eq: Equipment): boolean {
  return (
    eq.effect.def.type === "drain" ||
    eq.effect.def.type === "shield" ||
    eq.modifiers.some((m) => m.def.type === "lifesteal")
  );
}

/** 装备是否有荆棘触发(受击/受伤) */
export function equipmentHasThornTrigger(eq: Equipment): boolean {
  return eq.triggers.some((t) => t.def.type === "hurt" || t.def.type === "hit");
}

/**
 * 隐藏修饰器「送葬」:目标生命比例低于阈值时增伤(多条叠乘);无此修饰器 → 1。
 * 之所以放在结算侧而不是 `statsOf`:它依赖**目标当前血量**,而 statsOf 拿不到目标。
 */
export function condemnedMultOf(eq: Equipment, targetHpFrac: number): number {
  let mult = 1;
  for (const m of eq.modifiers) {
    if (m.def.type !== "condemned") continue;
    if (targetHpFrac < (m.params.condemnHp ?? 0)) mult *= m.params.condemnMult ?? 1;
  }
  return mult;
}

/** 隐藏修饰器「回响」:延迟二次触发的规格(秒 + 伤害系数);无此修饰器 → null */
export function echoSpecOf(eq: Equipment): { sec: number; mult: number } | null {
  for (const m of eq.modifiers) {
    if (m.def.type === "echo") return { sec: m.params.echoSec ?? 0, mult: m.params.echoMult ?? 0 };
  }
  return null;
}

export function buildHasHeal(list: readonly Equipment[]): boolean {
  return list.some(equipmentHasHeal);
}

export function buildHasThorn(list: readonly Equipment[]): boolean {
  return list.some(equipmentHasThornTrigger);
}

/**
 * 商店配对:有荆棘没回血 → 补一张回血卡;有回血没荆棘 → 补一张荆棘触发卡。
 * 引导玩家凑齐"反伤回血流"(受击/受伤 + 吸血/汲取/护盾)。
 */
export function thornPairOffer(equipment: readonly Equipment[], level: number): Equipment | null {
  const hasThorn = buildHasThorn(equipment);
  const hasHeal = buildHasHeal(equipment);
  if (hasThorn && !hasHeal) {
    for (let i = 0; i < 30; i++) {
      const eq = generateEquipment(level);
      if (equipmentHasHeal(eq)) return eq;
    }
  }
  if (hasHeal && !hasThorn) {
    for (let i = 0; i < 30; i++) {
      const eq = generateEquipment(level);
      if (equipmentHasThornTrigger(eq)) return eq;
    }
  }
  return null;
}

/** 升级三选一的卡片类型:新装备 或 强化已有装备 */
export type Choice =
  | { kind: "equip"; eq: Equipment }
  | { kind: "upgrade"; eq: Equipment; sourceId: number };

/**
 * 生成三选一的三个选项:已有装备时固定 1 张"强化卡"(随机强化一件现有装备,预览强化后数值),
 * 其余为新装备。ensureRare:至少 1 件稀有及以上(词缀鉴赏);rareBonus:稀有概率加成(战利品嗅觉)。
 */
export function generateChoices(level: number, count = 3, ensureRare = false, rareBonus = 0, owned: Equipment[] = []): Choice[] {
  const out: Choice[] = [];
  if (owned.length > 0) {
    const src = owned[Math.floor(Math.random() * owned.length)];
    out.push({ kind: "upgrade", eq: upgradeEquipment(cloneEq(src)), sourceId: src.id });
  }
  const equipCount = count - out.length;
  for (let i = 0; i < equipCount; i++) {
    let eq = generateEquipment(level, undefined, false, rareBonus);
    // 避免三选一出现三个完全一样的(同触发器+同效果+同品质)
    for (let tries = 0; tries < 8; tries++) {
      if (out.every((o) => o.kind !== "equip" || o.eq.name !== eq.name)) break;
      eq = generateEquipment(level, undefined, false, rareBonus);
    }
    out.push({ kind: "equip", eq });
  }
  if (ensureRare && !out.some((c) => c.kind === "equip" && c.eq.quality !== "common")) {
    const idx = out.findIndex((c) => c.kind === "equip");
    if (idx >= 0) out[idx] = { kind: "equip", eq: generateEquipment(level, "rare") };
  }
  return out;
}

/** 定向搜索:生成一件首个触发器为指定类型的装备 */
export function generateEquipmentWithTrigger(level: number, triggerType: TriggerType, quality?: Quality, rareBonus = 0): Equipment {
  const eq = generateEquipment(level, quality, false, rareBonus);
  eq.triggers[0] = makeTrigger(triggerType, triggerParams(triggerType, level));
  eq.name = buildName(eq.triggers, eq.effect, eq.modifiers);
  return eq;
}

/** 词缀重铸:只重随修饰器(数量/品质不变)。商店侧的单卡重随走下面的 `rerollCard`,本函数留给"只换修饰器"的窄口径 */
export function reforgeEquipment(eq: Equipment): Equipment {
  eq.modifiers = randomModifiers(eq.quality, eq.level);
  eq.name = buildName(eq.triggers, eq.effect, eq.modifiers);
  return eq;
}

/** 重随结果:命中隐藏与否、以及命中了哪几条(供 UI 高亮与测试断言) */
export interface RerollResult {
  eq: Equipment;
  hidden: boolean;
  hiddenTriggers: TriggerType[];
  hiddenModifiers: ModifierType[];
}

export interface RerollOpts {
  /** 注入随机源(缺省 Math.random);概率与保底都靠它复现 */
  roll?: () => number;
  /** 本局连续未出隐藏的重随次数(出货后调用方清零);达 REROLL_HIDDEN.pity 必出 */
  hiddenDryStreak?: number;
  /** 出战套组:其声明的触发器/修饰器一并进亲和池(英雄特色) */
  setId?: SetId | null;
}

/** 亲和加权抽一条并移出池(不放回,避免同卡出现两条相同词条) */
function drawAffine<T>(pool: T[], affine: ReadonlySet<T>, roll: () => number): T {
  const chosen = pickWeighted(
    pool.map((value) => ({ value, weight: affine.has(value) ? AFFINITY_WEIGHT : 1 })),
    roll
  );
  pool.splice(pool.indexOf(chosen), 1);
  return chosen;
}

/**
 * 单卡重随(需求 F9):重随触发器与修饰器,**效果 / 品质 / 等级都不变** ——
 * 玩家点的是"这张卡的词条",效果若跟着变会让人觉得点错了卡。
 *
 * 亲和:效果自身的 `SKILL_AFFINITY` 与出战套组声明的词条,权重 ×`AFFINITY_WEIGHT`;非亲和项仍可能出,保留构筑意外。
 * 隐藏:`REROLL_HIDDEN.chance` 命中,或本局连续未出达 `pity` 次必出;命中时首条触发器取自 `HIDDEN_TRIGGERS`、
 * 首条修饰器取自 `HIDDEN_MODIFIERS`(该品质没有修饰器槽时只给触发器)。
 */
export function rerollCard(eq: Equipment, opts: RerollOpts = {}): RerollResult {
  const roll = opts.roll ?? Math.random;
  const q = qualityDef(eq.quality);
  const aff = SKILL_AFFINITY[eq.effect.def.type];
  const set = opts.setId ? setDef(opts.setId) : null;
  const affTriggers = new Set<TriggerType>([...aff.triggers, ...(set?.triggers ?? [])]);
  const affModifiers = new Set<ModifierType>([...aff.modifiers, ...(set?.modifiers ?? [])]);

  const streak = Math.max(0, opts.hiddenDryStreak ?? 0);
  const hidden = roll() < REROLL_HIDDEN.chance || streak + 1 >= REROLL_HIDDEN.pity;

  const hiddenTriggers: TriggerType[] = [];
  const hiddenModifiers: ModifierType[] = [];
  const tPool = [...NORMAL_TRIGGERS];
  const mPool = [...NORMAL_MODIFIERS];

  const triggers: TriggerInstance[] = [];
  for (let i = 0; i < q.triggers; i++) {
    const t = hidden && i === 0 ? pickWeighted(HIDDEN_TRIGGERS.map((value) => ({ value, weight: 1 })), roll) : drawAffine(tPool, affTriggers, roll);
    if (hidden && i === 0) hiddenTriggers.push(t);
    triggers.push(makeTrigger(t, triggerParams(t, eq.level)));
  }
  const modifiers: ModifierInstance[] = [];
  for (let i = 0; i < q.modifiers; i++) {
    const m = hidden && i === 0 ? pickWeighted(HIDDEN_MODIFIERS.map((value) => ({ value, weight: 1 })), roll) : drawAffine(mPool, affModifiers, roll);
    if (hidden && i === 0) hiddenModifiers.push(m);
    modifiers.push(makeModifier(m, modifierParams(m, eq.level)));
  }

  eq.triggers = triggers;
  eq.modifiers = modifiers;
  eq.name = buildName(eq.triggers, eq.effect, eq.modifiers);
  return { eq, hidden, hiddenTriggers, hiddenModifiers };
}

/** 按类型与等级构造效果实例(完美蓝图/初始武器用) */
export function makeEffectFor(type: EffectType, level: number): EffectInstance {
  return makeEffect(type, effectParams(type, level), level);
}

/** 定向搜索:若三选一中没有指定触发器,则把其中一张装备卡替换为指定触发器装备 */
export function applyTargetedSearch(choices: Choice[], level: number, triggerType: TriggerType, rareBonus = 0): Choice[] {
  if (choices.some((c) => c.kind === "equip" && c.eq.triggers.some((tr) => tr.def.type === triggerType))) return choices;
  const idx = choices.findIndex((c) => c.kind === "equip");
  if (idx >= 0) {
    choices[idx] = { kind: "equip", eq: generateEquipmentWithTrigger(level, triggerType, undefined, rareBonus) };
  }
  return choices;
}

/** 开局武器(完美蓝图可指定效果;触发器固定为周期脉冲以保证开局可破局) */
export function makeStarterEquipment(effectType: EffectType): Equipment {
  const effect = makeEffectFor(effectType, 1);
  if (effectType === "knife") {
    // 开局全向 8 发 × 40 伤 + 穿透 1:前 5 章新手区(怪血 30-39)一发秒且弹道穿透补命中,
    // 挂机可随意通过;第 5 章后怪血跨过 40 需 2 发,穿透收益归零 → 数值台阶(顿感)。
    effect.params.spread = 16; // 全向弹幕(引擎 spread≥6 时 360° 等分)
    effect.params.pierce = 1;
    effect.params.damage = 40;
  }
  return {
    id: 9000,
    level: 1,
    quality: "common",
    name: `周期脉冲·${effectDef(effectType).name}`,
    triggers: [makeTrigger("pulse", { interval: 1.2 })],
    effect,
    modifiers: [],
  };
}

/* ---------- 套组初始武器(需求:武器套组影响初始武器,给本局走势定调) ---------- */

/** 各套组初始武器的展示信息(主菜单提示用) */
export const SET_STARTERS: Record<SetId, { name: string; desc: string }> = {
  thorn: { name: "荆棘圆环", desc: "受击触发荆棘爆发,挨打即输出" },
  barrage: { name: "寒霜风暴", desc: "全屏冰霜弹幕,减速控场" },
  ember: { name: "连闪天火", desc: "闪电链式连锁清群" },
  frost: { name: "极北权杖", desc: "霜环扩散控场,扫过减速收割" },
  glacier: { name: "界碑冰棱", desc: "单束贯穿冰射线,点穿 + 护盾" },
  blizzard: { name: "白啸霜刃", desc: "霜刀成幕齐射,冰锥补刀" },
  magma: { name: "熔核之心", desc: "陨星轰炸落点,余烬灼烧封路" },
  plague: { name: "瘟薪熔炉", desc: "毒云铺地持续灼伤" },
  cinderfang: { name: "炽牙雷殛", desc: "闪电链多咬,陨星收尾" },
  phantom: { name: "影群哨笛", desc: "灵狼成群协战,越战越多" },
  requiem: { name: "镇魂安可", desc: "骷髅列阵前排,替玩家挡线" },
  veil: { name: "雾缚噬灵", desc: "狼群缠斗,靠回复续航耗死对手" },
};

/**
 * 套组初始武器:按所选套组给专属开局武器,第 1 章可清且强化套组身份——
 * 荆棘(挨打爆发,逼你贴近怪群) / 弹幕(全屏减速弹幕) / 余烬(闪电连锁)。
 */
export function makeSetStarterEquipment(setId: SetId): Equipment {
  switch (setId) {
    case "thorn":
      return {
        id: 9001,
        level: 1,
        quality: "common",
        name: "荆棘圆环",
        // 双触发:周期脉冲保证保底输出,受击触发追加荆棘爆发(挨打越多越猛)
        triggers: [makeTrigger("pulse", { interval: 2 }), makeTrigger("hit", {})],
        // 新星 50 伤 × 半径 200:前 5 章新手区 AOE 秒怪,挨打流也能站场
        effect: makeEffect("nova", { damage: 50, radius: 200, speed: 1 }, 1),
        modifiers: [],
      };
    case "barrage":
      return {
        id: 9002,
        level: 1,
        quality: "common",
        name: "寒霜风暴",
        triggers: [makeTrigger("pulse", { interval: 1.1 })],
        // 全屏 16 发全向冰霜弹幕 + 穿透:新手区不被围(与默认初始武器同构),减速控场
        effect: makeEffect("ray", { damage: 30, speed: 620, radius: 640, spread: 16, pierce: 1, slow: 0.45, duration: 2 }, 1),
        modifiers: [],
      };
    case "ember":
      return {
        id: 9003,
        level: 1,
        quality: "common",
        name: "连闪天火",
        triggers: [makeTrigger("pulse", { interval: 1.6 })],
        // 闪电链 50 伤 4 跳:前 5 章一发秒,链式清群
        effect: makeEffect("chain", { damage: 50, jumps: 4, radius: 380 }, 1),
        modifiers: [],
      };
    case "frost":
      return {
        id: 9004,
        level: 1,
        quality: "common",
        name: "极北权杖",
        triggers: [makeTrigger("pulse", { interval: 1.8 })],
        // 霜环 40 伤扩至 240 + 减速 35%:对标荆棘圆环(新星 50/200)的第 1 章 60s 清场基准
        effect: makeEffect("frost_ring", { damage: 40, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 }, 1),
        modifiers: [],
      };
    case "magma":
      return {
        id: 9005,
        level: 1,
        quality: "common",
        name: "熔核之心",
        triggers: [makeTrigger("pulse", { interval: 1.4 })],
        // 陨星 65 伤/160 半径/0.6s 延迟:延迟换高单发,频率补清场(首版 2.0s/140 只活 153-207s,未达标)
        effect: makeEffect("meteor", { damage: 65, radius: 160, delay: 0.6 }, 1),
        modifiers: [],
      };
    case "phantom":
      return {
        id: 9006,
        level: 1,
        quality: "common",
        name: "影群哨笛",
        triggers: [makeTrigger("pulse", { interval: 2.5 })],
        // 双灵狼 14 伤协战:召唤流开局最慢,靠狼群积累 + 12s 存活补偿(标定进 309-356s 带)
        effect: makeEffect("spirit_wolves", { count: 2, damage: 14, duration: 12 }, 1),
        modifiers: [],
      };
    case "glacier":
      return {
        id: 9007,
        level: 1,
        quality: "common",
        name: "界碑冰棱",
        triggers: [makeTrigger("pulse", { interval: 1.2 })],
        // 5 束贯穿冰棱(穿 3):与寒霜风暴(16 发帘幕)错位走"少发高伤成排点穿"
        // 首版单束(34 伤/穿 1)第 1 章 50s 阵亡,清场宽度不足
        effect: makeEffect("ray", { damage: 30, speed: 620, radius: 640, spread: 5, pierce: 3, slow: 0.5, duration: 2.4 }, 1),
        modifiers: [],
      };
    case "blizzard":
      return {
        id: 9008,
        level: 1,
        quality: "common",
        name: "白啸霜刃",
        triggers: [makeTrigger("pulse", { interval: 1.05 })],
        // 12 发飞刀幕 × 34 伤:第 1 章怪血 30-39 一发秒,频率略高于荆棘圆环以补 AOE 缺失
        effect: makeEffect("knife", { damage: 34, speed: 560, radius: 640, spread: 12, pierce: 1 }, 1),
        modifiers: [],
      };
    case "plague":
      return {
        id: 9009,
        level: 1,
        quality: "common",
        name: "瘟薪熔炉",
        triggers: [makeTrigger("pulse", { interval: 1.8 })],
        // 毒云 15 dps × 4.5s = 67 伤/朵,半径 150 铺路:区域持续伤害流,清场靠地面
        effect: makeEffect("cloud", { dps: 15, radius: 150, duration: 4.5 }, 1),
        modifiers: [],
      };
    case "cinderfang":
      return {
        id: 9010,
        level: 1,
        quality: "common",
        name: "炽牙雷殛",
        triggers: [makeTrigger("pulse", { interval: 1.5 })],
        // 闪电链 44 伤 5 跳:比连闪天火(50 伤 4 跳)多咬一目标、少一分单发
        effect: makeEffect("chain", { damage: 44, jumps: 5, radius: 400 }, 1),
        modifiers: [],
      };
    case "requiem":
      return {
        id: 9011,
        level: 1,
        quality: "common",
        name: "镇魂安可",
        triggers: [makeTrigger("pulse", { interval: 2.6 })],
        // 双骷髅 13 伤 + 14s 存活:前排常驻,输出靠召唤物累积(与影群哨笛同为召唤档基准)
        effect: makeEffect("skeleton", { count: 2, damage: 13, duration: 14 }, 1),
        modifiers: [],
      };
    case "veil":
      return {
        id: 9012,
        level: 1,
        quality: "common",
        name: "雾缚噬灵",
        triggers: [makeTrigger("pulse", { interval: 2.8 })],
        // 三狼 11 伤群围:数量换单发,配合本套回复轴打"耗死对手"
        effect: makeEffect("spirit_wolves", { count: 3, damage: 11, duration: 10 }, 1),
        modifiers: [],
      };
  }
}

function buildName(
  triggers: TriggerInstance[],
  effect: EffectInstance,
  modifiers: ModifierInstance[]
): string {
  const parts = [triggers.map((t) => t.def.name).join("/"), effect.def.name];
  if (modifiers.length > 0) parts.push(modifiers.map((m) => m.def.name).join("/"));
  return parts.join("·");
}

export function equipmentDescription(eq: Equipment): string[] {
  const lines: string[] = [];
  if (eq.hiddenAffix) {
    const h = hiddenAffixDef(eq.hiddenAffix);
    lines.push(`【隐藏·${h.name}】${h.desc}`);
  }
  for (const t of eq.triggers) {
    lines.push(`【${t.def.name}】${describeTrigger(t)}`);
  }
  const eff = eq.effect;
  lines.push(`【${eff.def.name}】${describeEffect(eff)}`);
  for (const m of eq.modifiers) {
    lines.push(`【${m.def.name}】${describeModifier(m)}`);
  }
  return lines;
}

export function describeTrigger(t: TriggerInstance): string {
  const p = t.params;
  switch (t.def.type) {
    case "pulse":
      return `每 ${p.interval}s 触发`;
    case "kill":
      return `击杀时 ${Math.round((p.chance ?? 0) * 100)}% 概率触发`;
    case "hurt":
      return `生命低于 ${Math.round((p.hpThreshold ?? 0) * 100)}% 时触发`;
    case "move":
      return `每移动 ${(p.distance ?? 0) / 100} 米触发`;
    case "hit":
      return `被敌人击中时触发`;
    case "combo":
      return `连杀 ${p.count} 个后触发`;
    case "crit":
      return `造成暴击时触发`;
    case "elite":
      return `击杀精英或首领时触发`;
  }
}

export function describeEffect(e: EffectInstance): string {
  const p = e.params;
  switch (e.def.type) {
    case "knife":
      return `向最近敌人投掷飞刀(伤害 ${p.damage})`;
    case "nova":
      return `火焰爆发(伤害 ${p.damage},半径 ${p.radius}px)`;
    case "skeleton":
      return `召唤骷髅(攻击 ${p.damage})`;
    case "cloud":
      return `毒云(每秒 ${p.dps} 伤害,${p.duration}s)`;
    case "ray":
      return `冰霜射线(伤害 ${p.damage},减速 ${Math.round((p.slow ?? 0) * 100)}%)`;
    case "chain":
      return `闪电链(伤害 ${p.damage},弹射 ${p.jumps} 次)`;
    case "shield":
      return `护盾(吸收 ${p.amount})`;
    case "drain":
      return `恢复 ${p.heal} 生命`;
    case "icelance":
      return `追踪冰锥(伤害 ${p.damage})`;
    case "frost_ring":
      return `霜环扩散(伤害 ${p.damage},减速 ${Math.round((p.slow ?? 0) * 100)}%)`;
    case "meteor":
      return `陨星坠落(伤害 ${p.damage},半径 ${p.radius}px)`;
    case "magma_trail":
      return `熔岩地带(每秒 ${p.dps} 伤害)`;
    case "spirit_wolves":
      return `召唤 ${p.count} 只灵狼(攻击 ${p.damage})`;
    case "haunt_crown":
      return `击杀唤醒亡影(攻击 ${p.damage})`;
  }
}

export function describeModifier(m: ModifierInstance): string {
  const p = m.params;
  switch (m.def.type) {
    case "chain":
      return `弹射 +${p.targets} 目标`;
    case "explode":
      return `命中爆炸(半径 ${p.radius}px)`;
    case "split":
      return `额外发射 +${p.extra} 个`;
    case "lifesteal":
      return `吸血 ${Math.round((p.pct ?? 0) * 100)}%`;
    case "pierce":
      return `穿透 +${p.count} 次`;
    case "haste":
      return `触发间隔 -${Math.round((p.pct2 ?? 0) * 100)}%`;
    case "power":
      return `伤害 +${Math.round((p.pct3 ?? 0) * 100)}%`;
    case "duration":
      return `持续 +${p.sec}s`;
    case "echo":
      return `${p.echoSec}s 后回响一次(${Math.round((p.echoMult ?? 0) * 100)}% 伤害)`;
    case "condemned":
      return `对生命低于 ${Math.round((p.condemnHp ?? 0) * 100)}% 的敌人伤害 +${Math.round(((p.condemnMult ?? 1) - 1) * 100)}%`;
  }
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ---------- 场内成长(数值增长 = 强化;形态变化 = 进化,2 张保底) ---------- */

/* ---------- 商店价格(可配 balance.json → economy 段;默认值出自 ./quality 品质规范表) ---------- */
export let QUALITY_BASE_PRICE: Record<Quality, number> = { ...QUALITY_BASE_PRICE_DEFAULT };
/** 槽位扩展价格:第 n 次购买 = base × growth^n */
export let SLOT_EXPAND_BASE = 100;
export let SLOT_EXPAND_GROWTH = 2.3;
/** 场内主动法宝槽硬顶(基础 4 + 天赋 ≤2 + 本局广告 1,合计钳到此值;docs/DESIGN-HERO-RHYTHM.md §4.3 / R7:4 起步、6 封顶) */
export let SHOP_SLOT_CAP = 6;

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** 应用配置表覆盖(balance.json → economy 段);非法字段回退默认 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const c = cfg ?? {};
  QUALITY_BASE_PRICE = { ...QUALITY_BASE_PRICE_DEFAULT };
  const bp = c.basePrice;
  if (bp && typeof bp === "object") {
    for (const q of QUALITY_ORDER) {
      QUALITY_BASE_PRICE[q] = num((bp as Record<string, unknown>)[q], 0, 999999, QUALITY_BASE_PRICE[q]);
    }
  }
  SLOT_EXPAND_BASE = num(c.slotExpandBase, 0, 999999, 100);
  SLOT_EXPAND_GROWTH = num(c.slotExpandGrowth, 1, 10, 2.3);
  SHOP_SLOT_CAP = num(c.slotCap, 4, 32, 6);
}

/** 品质基础价(商店卡价/销毁回收/进化费用共用) */
export function qualityBasePrice(q: Quality): number {
  return QUALITY_BASE_PRICE[q];
}

/** 是否可强化(未达品质上限;上限表见 ./quality 的 QUALITY_MAX_LEVEL) */
export function canUpgrade(eq: Equipment): boolean {
  return eq.level < QUALITY_MAX_LEVEL[eq.quality];
}

/** 强化价格:品质基础价 × (1 + (等级-1)×递增系数),随等级递增(场内金币出口) */
export function upgradeCost(eq: Equipment): number {
  return Math.round(qualityBasePrice(eq.quality) * (1 + (eq.level - 1) * QUALITY_UPGRADE_COST_GROWTH));
}

/** 场内装备槽总数上限(基础 4 + 天赋 + 商店槽位购买,合计不超过此值;设计目标 6-8 槽) */
/** 槽位扩展价格(金币出口):本局第 n 次购买(0 起)递增,把花不完的金币换成构筑空间 */
export function slotExpandCost(n: number): number {
  return Math.round(SLOT_EXPAND_BASE * Math.pow(SLOT_EXPAND_GROWTH, n));
}
