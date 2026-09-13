/**
 * 英雄独有技能策划规范表 —— 每英雄 4 个技能(核心 1 / 分岔 2 互斥 / 进阶 1)、阶数与三选一出卡策略的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 依据 docs/DESIGN-HERO-RHYTHM.md §3:
 *  - 独有技能**只出现在升级三选一**,不花金币、不占法宝槽;
 *  - 核心技能开局自带(= 旧初始武器改写),绑定本命节律;
 *  - 两个分岔互斥,选中一个另一个永久消失,**选中即解锁该分岔的第 2 节律**;
 *  - 进阶技能是改写核心规则的第四个技能;
 *  - 每技能 5 阶,升阶走装备等级成长(`upgradeEquipment`,+12%/阶),本表不另写一份成长系数;
 *  - §5 表 2:每个技能标 1 枚**共鸣被动**,拿到那枚被动法宝时技能改名 + 叠 `resonanceMorph` 补丁。
 *
 * S1 三英雄(荆棘 / 弹幕 / 余烬)+ S2 三英雄(极北 / 冰川 / 白啸)有专属表;其余 6 英雄用**通用职业包**过渡
 * (核心 = 现初始武器,分岔「守势」/「奔袭」,进阶「专注」),后续每季替换 3 个(TODO(R4))。
 *
 * 技能的运行时形态就是一件 `Equipment`(kind = "skill"):效果 / 触发器 / 修饰器三段引擎照常结算,
 * 于是不新增任何攻击原语;需要新原语的技能语义在 desc 里以"近似"标出,留给后续赛季。
 */

import type { EffectParams, EffectType, ModifierType, TriggerParams } from "./affixes";
import type { HeroId } from "./heroes";
import type { MorphPatch } from "./artifacts";
import { RHYTHM_MAX_LEVEL, _bindSecondRhythmSource, rhythmTriggerParams, type RhythmId } from "./rhythm";

export type HeroSkillKind = "core" | "branch" | "advance";

export interface HeroSkillDef {
  id: string;
  heroId: HeroId | "generic";
  kind: HeroSkillKind;
  name: string;
  desc: string;
  /** 这一招在哪条节律上发动;分岔技能 = 选中即解锁这一条 */
  rhythm: RhythmId;
  /** 效果原语与 1 阶参数(引擎照常结算) */
  effect: EffectType;
  params: EffectParams;
  /** 自带修饰器(类型;数值走 modifierParams 那一支) */
  modifiers?: readonly ModifierType[];
  /** 共鸣被动(§5 表 2):拿到这枚被动法宝时技能改名 + 叠补丁 */
  resonancePassive: ModifierType;
  resonanceName: string;
  resonanceDesc: string;
  resonanceMorph: MorphPatch;
  /** 节律调率(R6):只作用于这一招所挂节律的发动参数;缺省 = 节律表原值。核心技能读 CORE_RHYTHM_TUNE */
  rhythmTune?: RhythmTune;
}

/**
 * 节律调率:对 ./rhythm 基础发动参数的倍率(1 = 不动)。
 * interval → 周期间隔;distance → 移动距离;count → 连杀所需数;threshold → 低血阈值;chance → 击杀概率。
 * 节律等级的缩放(引擎按玩家节律等级实时乘)叠在调率之上。
 */
export interface RhythmTune {
  interval?: number;
  distance?: number;
  count?: number;
  threshold?: number;
  chance?: number;
  /** 底拍间隔倍率(只对带底拍的事件节律核心有效;CORE_BASELINE_INTERVAL × 本值) */
  baseline?: number;
}

/**
 * 各英雄核心技能的节律调率(docs/DESIGN-HERO-RHYTHM.md R6,用户裁定 A,2026-09-14)。
 * 依据:节律体系把周期统一成 2.4s、事件节律共用一份阈值,但旧初始武器各有射速
 * (弹幕 1.1s / 界碑 1.2s / 白啸 1.05s / 熔核 1.4s / 极北 1.8s / 余烬 1.6s / 炽牙 1.5s / 瘟薪 1.8s / 幻影 2.5s / 荆棘 2.0s+受击);
 * 12 英雄 × 2 种子复审:kyle 7 / 10 章、loka 15 / 8、doran 11 / 9、sia 11 / 11 明显掉队,同节律对照 nora 11 / 21、rayne 21 / 19、willow 19 / 19、sally 21 / 21。
 * 调率只补"快而薄"那几位的节拍,不动伤害;法宝挂同一节律不受影响。
 */
export const CORE_RHYTHM_TUNE: Partial<Record<HeroId, RhythmTune>> = {
  // 荆棘圆环旧「周期 2.0s 保底 + 受击爆发」→ 底拍 3.0 × 0.7 = 2.1s
  vera: { baseline: 0.7 },
  // 弹幕风暴旧 1.1s → 2.4 × 0.5 = 1.2s
  kyle: { interval: 0.5 },
  // 冰川界碑旧 1.2s → 1.2s(与 kyle 同拍,保持周期双雄对称)
  nora: { interval: 0.5 },
  // 白啸霜刃旧 1.05s 全向 12 刃 → 连杀所需 5 × 0.6 = 3,底拍 3.0 × 0.4 = 1.2s(全向刃幕命中率低;3 种子对照 1.5s 11/6/21、1.2s 21/17/7、1.05s 6/7/21,取 1.2s 与周期双雄同拍)
  loka: { count: 0.6, baseline: 0.4 },
  // 熔核之心旧 1.4s → 移动 240 × 0.7 = 168 一发
  doran: { distance: 0.7 },
  // 极北权杖旧 1.8s 常驻 → 低血阈值 0.5 × 1.4 = 0.7(七成血以下就开环)
  sia: { threshold: 1.4 },
};

/**
 * 核心技能「底拍」(秒):本命是事件节律(受击 / 击杀 / 移动 / 连杀 / 低血)的英雄,核心技能额外带一条慢周期触发器,
 * 保证冷启动 —— 击杀 / 连杀节律的英雄开局没有任何输出就永远杀不到第一只(真机 BattleSim 复现:bran / loka 13s 阵亡、0 击杀),
 * 低血英雄满血时也得有底拍。3.0s 慢于周期英雄的 2.4 / 1.2s,不抢周期双雄的身份;旧荆棘圆环就是「周期 2s 保底 + 受击爆发」双触发。
 * 依据:docs/DESIGN-HERO-RHYTHM.md R6(2026-09-14)。底拍挂在 triggers[1],triggers[0] 仍是本命节律(图鉴 / HUD / 共鸣都读首条)。
 */
export const CORE_BASELINE_INTERVAL = 3.0;

/** 底拍间隔(秒)= CORE_BASELINE_INTERVAL × 这一招的 baseline 调率 */
export function baselineInterval(def: Pick<HeroSkillDef, "rhythmTune">): number {
  return Math.round(CORE_BASELINE_INTERVAL * (def.rhythmTune?.baseline ?? 1) * 10) / 10;
}

/** 这一招是否需要底拍:核心 + 所挂节律不是周期 */
export function needsBaseline(def: Pick<HeroSkillDef, "kind">, rhythm: RhythmId): boolean {
  return def.kind === "core" && rhythm !== "pulse";
}

/** 技能所挂节律的发动参数 = 节律表(含等级)× 这一招的调率;下限与节律表同口径(连杀 ≥ 2、阈值 / 概率 ≤ 0.9) */
export function skillTriggerParams(def: Pick<HeroSkillDef, "rhythmTune">, rhythm: RhythmId, level = 1): TriggerParams {
  const p = { ...rhythmTriggerParams(rhythm, level) };
  const t = def.rhythmTune;
  if (!t) return p;
  if (p.interval !== undefined && t.interval !== undefined) p.interval = Math.round(p.interval * t.interval * 10) / 10;
  if (p.distance !== undefined && t.distance !== undefined) p.distance = Math.round(p.distance * t.distance);
  if (p.count !== undefined && t.count !== undefined) p.count = Math.max(2, Math.round(p.count * t.count));
  if (p.hpThreshold !== undefined && t.threshold !== undefined) p.hpThreshold = Math.min(0.9, Math.round(p.hpThreshold * t.threshold * 100) / 100);
  if (p.chance !== undefined && t.chance !== undefined) p.chance = Math.min(0.9, Math.round(p.chance * t.chance * 100) / 100);
  return p;
}

/** 技能阶数上限(阶) */
export const SKILL_MAX_RANK = 5;
/**
 * 分岔二选一最早出现的玩家等级(级)。依据:docs/DESIGN-HERO-RHYTHM.md R3(用户裁定「A + 预告」,2026-09-13):
 * 5 级落在第 1 章末至第 2 章中,玩家已拿首章法宝、见过一次商店,再选方向才是有信息的选择;更早法宝与分岔的共鸣关系看不出来。
 */
export const BRANCH_MIN_LEVEL = 5;
/** 到此等级仍未出现分岔则必出(级):再晚分岔技能只剩 2–3 阶成长、第二节律解锁过晚。依据同 R3 */
export const BRANCH_GUARANTEE_LEVEL = 8;
/**
 * 「分岔预告」起始等级(级):从这一级起升级弹层读数行提示分岔将在 BRANCH_MIN_LEVEL 后出现,
 * 到 BRANCH_MIN_LEVEL 仍未出改提示最迟 BRANCH_GUARANTEE_LEVEL;分岔已选或本轮已出成对则不提示。
 * 依据:R3「A + 预告」—— 让玩家在转折点前两次升级里知道该囤升阶还是节律强化,拿到 B 方案的目标感而不付盲选代价。
 */
export const BRANCH_TEASE_LEVEL = 3;
/** 三选一权重:新技能 / 升阶 / 节律强化 / 重置分岔 */
export const OFFER_WEIGHTS = { skill: 3, rank: 2, rhythm: 1, reset: 1 } as const;
/**
 * 「重置分岔」保底(轮):分岔选定后,若可重置(金币够、本局未用),最迟在之后第 N 轮升级必出现一次;
 * 保底之外仍按 OFFER_WEIGHTS.reset 随机出。依据:docs/DESIGN-HERO-RHYTHM.md R8(用户裁定「A + 第 3 次升级保底」)。
 */
export const RESET_GUARANTEE_ROUNDS = 3;
/** 技能池耗尽后的兜底三张 */
export const FALLBACK_OFFERS = [
  { id: "heal30", name: "回气", desc: "立即回复 30% 最大生命", healPct: 0.3 },
  { id: "gold80", name: "赏金", desc: "获得 80 金币", gold: 80 },
  { id: "hp8", name: "壮体", desc: "最大生命 +8", maxHp: 8 },
] as const;
export type FallbackId = (typeof FALLBACK_OFFERS)[number]["id"];

/* ---------- S1 三英雄专属表(§3.2) ---------- */

const VERA: readonly HeroSkillDef[] = [
  {
    id: "vera_core", heroId: "vera", kind: "core", name: "荆棘圆环", rhythm: "hit", rhythmTune: CORE_RHYTHM_TUNE.vera,
    desc: "受击时向周围爆出荆棘",
    effect: "nova", params: { damage: 50, radius: 200, speed: 1 },
    resonancePassive: "duration", resonanceName: "荆棘领域", resonanceDesc: "荆棘范围 ×1.5,伤害 ×1.2(近似「留下荆棘地」)",
    resonanceMorph: { radiusMult: 1.5, power: 1.2 },
  },
  {
    id: "vera_armor", heroId: "vera", kind: "branch", name: "荆甲", rhythm: "hurt",
    desc: "生命低于一半时获得护盾;解锁【低血】节律",
    effect: "shield", params: { amount: 8, duration: 4 },
    resonancePassive: "duration", resonanceName: "不朽荆甲", resonanceDesc: "护盾持续 ×3、吸收 ×1.5(近似「不消失改为衰减」)",
    resonanceMorph: { durationMult: 3, power: 1.5 },
  },
  {
    id: "vera_walker", heroId: "vera", kind: "branch", name: "棘行者", rhythm: "move",
    desc: "移动时在身后留下荆棘刺地;解锁【移动】节律",
    effect: "magma_trail", params: { dps: 20, radius: 56, duration: 2.5 },
    resonancePassive: "split", resonanceName: "裂棘", resonanceDesc: "刺地范围翻倍",
    resonanceMorph: { radiusMult: 2 },
  },
  {
    id: "vera_blood", heroId: "vera", kind: "advance", name: "血棘", rhythm: "hit",
    desc: "受击时汲取生命(近似:受击回复,冷却 1.2 秒)",
    effect: "drain", params: { heal: 6 },
    resonancePassive: "lifesteal", resonanceName: "饮血荆棘", resonanceDesc: "汲取量翻倍",
    resonanceMorph: { healMult: 2 },
  },
];

const KYLE: readonly HeroSkillDef[] = [
  {
    id: "kyle_core", heroId: "kyle", kind: "core", name: "寒霜齐射", rhythm: "pulse", rhythmTune: CORE_RHYTHM_TUNE.kyle,
    // R6 复审:8 束 × 2.4s 比旧弹幕风暴(16 束 × 1.1s)少了 3/4 弹幕密度,64 种子地形聚合失败谷过半;束数回到 16,节拍 1.2s
    desc: "每 1.2 秒向全向齐射 16 束冰弹",
    effect: "ray", params: { damage: 30, speed: 620, radius: 640, spread: 16, pierce: 1, slow: 0.45, duration: 2 },
    resonancePassive: "haste", resonanceName: "寒霜连射", resonanceDesc: "齐射间隔减半,改为持续连射",
    resonanceMorph: { haste: 0.5 },
  },
  {
    id: "kyle_overload", heroId: "kyle", kind: "branch", name: "连杀过载", rhythm: "combo",
    desc: "连杀达标时追加一轮双倍伤害齐射;解锁【连杀】节律",
    effect: "ray", params: { damage: 60, speed: 620, radius: 640, spread: 8, pierce: 1, slow: 0.45, duration: 2 },
    resonancePassive: "power", resonanceName: "过载不熄", resonanceDesc: "过载齐射伤害再 ×1.5",
    resonanceMorph: { power: 1.5 },
  },
  {
    id: "kyle_hunter", heroId: "kyle", kind: "branch", name: "猎手步伐", rhythm: "move",
    desc: "移动时向前方扇形收拢齐射,伤害 ×1.4;解锁【移动】节律",
    effect: "ray", params: { damage: 42, speed: 620, radius: 640, spread: 3, pierce: 1, slow: 0.45, duration: 2 },
    resonancePassive: "pierce", resonanceName: "贯穿猎步", resonanceDesc: "扇形弹穿透 +2",
    resonanceMorph: { pierce: 2 },
  },
  {
    id: "kyle_shard", heroId: "kyle", kind: "advance", name: "冰晶穿刺", rhythm: "pulse",
    desc: "每 3.2 秒追加一束高减速冰锥",
    effect: "icelance", params: { damage: 40, speed: 700, radius: 640, homing: 4 },
    resonancePassive: "chain", resonanceName: "冰晶弹射", resonanceDesc: "冰锥在减速目标间弹射(连锁 +2)",
    resonanceMorph: { chainTargets: 2 },
  },
];

const BRAN: readonly HeroSkillDef[] = [
  {
    id: "bran_core", heroId: "bran", kind: "core", name: "连闪天火", rhythm: "kill",
    desc: "击杀时从尸体引出 4 跳闪电链",
    effect: "chain", params: { damage: 50, jumps: 4, radius: 380 },
    resonancePassive: "chain", resonanceName: "跨屏天火", resonanceDesc: "闪电跳跃距离翻倍",
    resonanceMorph: { radiusMult: 2 },
  },
  {
    id: "bran_pulse", heroId: "bran", kind: "branch", name: "余烬脉冲", rhythm: "pulse",
    desc: "每 3 秒在敌人密集处引燃一个火圈;解锁【周期】节律",
    effect: "nova", params: { damage: 36, radius: 150, speed: 1 },
    resonancePassive: "duration", resonanceName: "余烬不熄", resonanceDesc: "火圈范围 ×1.4、伤害 ×1.2(近似「留下燃烧地」)",
    resonanceMorph: { radiusMult: 1.4, power: 1.2 },
  },
  {
    id: "bran_wildfire", heroId: "bran", kind: "branch", name: "燎原怒火", rhythm: "hurt",
    desc: "生命低于四成时引发全屏火浪;解锁【低血】节律",
    effect: "nova", params: { damage: 60, radius: 420, speed: 1 },
    resonancePassive: "explode", resonanceName: "燎原余爆", resonanceDesc: "火浪命中处再爆一次",
    resonanceMorph: { explode: { radius: 120, damageMult: 0.8 } },
  },
  {
    id: "bran_ignite", heroId: "bran", kind: "advance", name: "引燃", rhythm: "kill",
    desc: "击杀时在尸体处留下 3 秒燃烧地",
    effect: "cloud", params: { dps: 12, radius: 90, duration: 3 },
    resonancePassive: "power", resonanceName: "叠燃", resonanceDesc: "燃烧伤害 ×1.5",
    resonanceMorph: { power: 1.5 },
  },
];

/* ---------- S2 三英雄专属表(极北 / 冰川 / 白啸) ---------- */

const SIA: readonly HeroSkillDef[] = [
  {
    id: "sia_core", heroId: "sia", kind: "core", name: "极北权杖", rhythm: "hurt", rhythmTune: CORE_RHYTHM_TUNE.sia,
    desc: "生命低于七成时以自身为中心扩散霜环,扫过减速",
    effect: "frost_ring", params: { damage: 40, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 },
    resonancePassive: "duration", resonanceName: "永冻权杖", resonanceDesc: "霜环持续 ×2、范围 ×1.3",
    resonanceMorph: { durationMult: 2, radiusMult: 1.3 },
  },
  {
    id: "sia_ward", heroId: "sia", kind: "branch", name: "冰壁", rhythm: "hit",
    desc: "受击时凝出冰盾;解锁【受击】节律",
    effect: "shield", params: { amount: 12, duration: 4 },
    resonancePassive: "power", resonanceName: "玄冰壁", resonanceDesc: "冰盾吸收 ×2",
    resonanceMorph: { power: 2 },
  },
  {
    id: "sia_glide", heroId: "sia", kind: "branch", name: "霜行", rhythm: "move",
    desc: "移动时在身后留下霜环;解锁【移动】节律",
    effect: "frost_ring", params: { damage: 25, radius: 180, expandSpeed: 260, slow: 0.35, duration: 1 },
    resonancePassive: "chain", resonanceName: "连环霜行", resonanceDesc: "霜环范围 ×1.5",
    resonanceMorph: { radiusMult: 1.5 },
  },
  {
    id: "sia_lance", heroId: "sia", kind: "advance", name: "极北冰锥", rhythm: "hurt",
    desc: "低血时向最近敌人射出追踪冰锥",
    effect: "icelance", params: { damage: 55, speed: 700, radius: 640, homing: 4 },
    resonancePassive: "pierce", resonanceName: "贯北冰锥", resonanceDesc: "冰锥 +1 发、穿透 +1",
    resonanceMorph: { splitExtra: 1, pierce: 1 },
  },
];

const NORA: readonly HeroSkillDef[] = [
  {
    id: "nora_core", heroId: "nora", kind: "core", name: "界碑冰棱", rhythm: "pulse", rhythmTune: CORE_RHYTHM_TUNE.nora,
    desc: "每 1.2 秒射出 5 束贯穿冰棱",
    effect: "ray", params: { damage: 30, speed: 620, radius: 640, spread: 5, pierce: 3, slow: 0.5, duration: 2.4 },
    resonancePassive: "pierce", resonanceName: "界线冰棱", resonanceDesc: "冰棱穿透 +3",
    resonanceMorph: { pierce: 3 },
  },
  {
    id: "nora_bulwark", heroId: "nora", kind: "branch", name: "界碑守誓", rhythm: "hit",
    desc: "受击时立起冰盾;解锁【受击】节律",
    effect: "shield", params: { amount: 10, duration: 5 },
    resonancePassive: "duration", resonanceName: "不倒界碑", resonanceDesc: "冰盾持续 ×2",
    resonanceMorph: { durationMult: 2 },
  },
  {
    id: "nora_reap", heroId: "nora", kind: "branch", name: "碑前收割", rhythm: "kill",
    desc: "击杀时向最近敌人补一束冰棱;解锁【击杀】节律",
    effect: "ray", params: { damage: 36, speed: 620, radius: 640, spread: 1, pierce: 2, slow: 0.5, duration: 2 },
    resonancePassive: "split", resonanceName: "分光收割", resonanceDesc: "补射 +2 束",
    resonanceMorph: { splitExtra: 2 },
  },
  {
    id: "nora_frost", heroId: "nora", kind: "advance", name: "界碑霜环", rhythm: "pulse",
    desc: "每 3.6 秒扩散一道霜环",
    effect: "frost_ring", params: { damage: 30, radius: 220, expandSpeed: 260, slow: 0.4, duration: 1 },
    resonancePassive: "haste", resonanceName: "疾霜界碑", resonanceDesc: "霜环间隔 −30%",
    resonanceMorph: { haste: 0.3 },
  },
];

const LOKA: readonly HeroSkillDef[] = [
  {
    id: "loka_core", heroId: "loka", kind: "core", name: "白啸霜刃", rhythm: "combo", rhythmTune: CORE_RHYTHM_TUNE.loka,
    desc: "每 3 连杀掷出 12 发霜刃幕",
    effect: "knife", params: { damage: 34, speed: 560, radius: 640, spread: 12, pierce: 1 },
    resonancePassive: "split", resonanceName: "白啸刃雨", resonanceDesc: "霜刃 +4 发",
    resonanceMorph: { splitExtra: 4 },
  },
  {
    id: "loka_pulse", heroId: "loka", kind: "branch", name: "猎息", rhythm: "pulse",
    desc: "每 2.4 秒向最近敌人掷 3 发霜刃;解锁【周期】节律",
    effect: "knife", params: { damage: 28, speed: 560, radius: 640, spread: 3, pierce: 1 },
    resonancePassive: "haste", resonanceName: "疾猎息", resonanceDesc: "间隔 −30%",
    resonanceMorph: { haste: 0.3 },
  },
  {
    id: "loka_dash", heroId: "loka", kind: "branch", name: "白啸疾奔", rhythm: "move",
    desc: "移动时向前掷出霜刃;解锁【移动】节律",
    effect: "knife", params: { damage: 30, speed: 560, radius: 640, spread: 2, pierce: 1 },
    resonancePassive: "pierce", resonanceName: "贯奔霜刃", resonanceDesc: "穿透 +2",
    resonanceMorph: { pierce: 2 },
  },
  {
    id: "loka_lance", heroId: "loka", kind: "advance", name: "白啸冰锥", rhythm: "combo",
    desc: "连杀达标时追加一发追踪冰锥",
    effect: "icelance", params: { damage: 60, speed: 700, radius: 640, homing: 4 },
    resonancePassive: "power", resonanceName: "破霜冰锥", resonanceDesc: "冰锥伤害 ×1.5",
    resonanceMorph: { power: 1.5 },
  },
];

/* ---------- 通用职业包(其余 6 英雄与未选英雄的过渡表) ---------- */

/** 各套组现初始武器的效果与参数(与 equipmentGen.makeSetStarterEquipment 同数;通用包核心技能读这里) */
const GENERIC_CORE: Record<Exclude<HeroId, "vera" | "kyle" | "bran" | "sia" | "nora" | "loka">, { name: string; effect: EffectType; params: EffectParams }> = {
  doran: { name: "熔核之心", effect: "meteor", params: { damage: 65, radius: 160, delay: 0.6 } },
  sally: { name: "瘟薪熔炉", effect: "cloud", params: { dps: 15, radius: 150, duration: 4.5 } },
  rayne: { name: "炽牙雷殛", effect: "chain", params: { damage: 44, jumps: 5, radius: 400 } },
  willow: { name: "影群哨笛", effect: "spirit_wolves", params: { count: 2, damage: 14, duration: 12 } },
  oden: { name: "镇魂安可", effect: "skeleton", params: { count: 2, damage: 13, duration: 14 } },
  // R6 数值 pass:狼伤 11 → 14 与幻影剧团(willow)同款对齐;3 种子 10/10/5 → 10/10/21,第 10 章召唤流之墙仍在(TODO 下一轮看 wolves 生存 / 章型)
  mu: { name: "雾缚噬灵", effect: "spirit_wolves", params: { count: 3, damage: 14, duration: 10 } },
};

/** 未选英雄的核心:旧默认初始武器(全向 16 发飞刀) */
const DEFAULT_CORE = { name: "飞刀阵", effect: "knife" as EffectType, params: { damage: 40, speed: 520, radius: 640, spread: 16, pierce: 1 } as EffectParams };

/**
 * 通用职业包:核心 = 该英雄现初始武器(挂本命节律);分岔「守势」(低血护盾,解锁低血)/「奔袭」(移动飞刀,解锁移动);
 * 进阶「专注」= 核心效果的第二发(周期节律,数值 0.6×)。本命节律本身是低血 / 移动 / 周期时,对应分岔改挂另一条节律。
 */
export function genericPack(heroId: HeroId | "generic", core: { name: string; effect: EffectType; params: EffectParams }, native: RhythmId): readonly HeroSkillDef[] {
  const guardRhythm: RhythmId = native === "hurt" ? "hit" : "hurt";
  const dashRhythm: RhythmId = native === "move" ? "combo" : "move";
  const focusRhythm: RhythmId = native === "pulse" ? "kill" : "pulse";
  const scaled: EffectParams = { ...core.params };
  for (const k of ["damage", "dps", "heal", "amount"] as const) {
    if (typeof scaled[k] === "number") scaled[k] = Math.round((scaled[k] as number) * 0.6);
  }
  return [
    {
      id: `${heroId}_core`, heroId, kind: "core", name: core.name, rhythm: native, rhythmTune: heroId === "generic" ? undefined : CORE_RHYTHM_TUNE[heroId],
      desc: "本命之技,开局自带",
      effect: core.effect, params: { ...core.params },
      resonancePassive: "power", resonanceName: `${core.name}·极`, resonanceDesc: "核心伤害 ×1.3",
      resonanceMorph: { power: 1.3 },
    },
    {
      id: `${heroId}_guard`, heroId, kind: "branch", name: "守势", rhythm: guardRhythm,
      desc: `危急时获得护盾;解锁【${guardRhythm === "hurt" ? "低血" : "受击"}】节律`,
      effect: "shield", params: { amount: 30, duration: 5 },
      resonancePassive: "duration", resonanceName: "铁壁", resonanceDesc: "护盾持续翻倍",
      resonanceMorph: { durationMult: 2 },
    },
    {
      id: `${heroId}_dash`, heroId, kind: "branch", name: "奔袭", rhythm: dashRhythm,
      desc: `奔走间向最近敌人掷出飞刀;解锁【${dashRhythm === "move" ? "移动" : "连杀"}】节律`,
      effect: "knife", params: { damage: 24, speed: 560, radius: 640, spread: 3 },
      resonancePassive: "split", resonanceName: "疾奔刃雨", resonanceDesc: "飞刀 +3 发",
      resonanceMorph: { splitExtra: 3 },
    },
    {
      id: `${heroId}_focus`, heroId, kind: "advance", name: "专注", rhythm: focusRhythm,
      desc: "本命之技再发一轮(六成威力)",
      effect: core.effect, params: scaled,
      resonancePassive: "haste", resonanceName: "心流", resonanceDesc: "专注间隔减半",
      resonanceMorph: { haste: 0.5 },
    },
  ];
}

/** 12 英雄技能表(专属表优先,其余走通用包);未选英雄用 `GENERIC_HERO_SKILLS` */
export const HERO_SKILLS: Record<HeroId, readonly HeroSkillDef[]> = {
  vera: VERA,
  kyle: KYLE,
  bran: BRAN,
  sia: SIA,
  nora: NORA,
  loka: LOKA,
  doran: genericPack("doran", GENERIC_CORE.doran, "move"),
  sally: genericPack("sally", GENERIC_CORE.sally, "hurt"),
  rayne: genericPack("rayne", GENERIC_CORE.rayne, "combo"),
  willow: genericPack("willow", GENERIC_CORE.willow, "move"),
  oden: genericPack("oden", GENERIC_CORE.oden, "kill"),
  mu: genericPack("mu", GENERIC_CORE.mu, "hit"),
};

/** 有专属表(非通用职业包)的英雄 */
export const BESPOKE_HEROES: readonly HeroId[] = ["vera", "kyle", "bran", "sia", "nora", "loka"];

export const GENERIC_HERO_SKILLS: readonly HeroSkillDef[] = genericPack("generic", DEFAULT_CORE, "pulse");

export function heroSkills(heroId: HeroId | null | undefined): readonly HeroSkillDef[] {
  return heroId ? HERO_SKILLS[heroId] : GENERIC_HERO_SKILLS;
}

export function heroSkillDef(id: string): HeroSkillDef | null {
  for (const list of Object.values(HERO_SKILLS)) {
    const d = list.find((s) => s.id === id);
    if (d) return d;
  }
  return GENERIC_HERO_SKILLS.find((s) => s.id === id) ?? null;
}

export function coreSkillOf(heroId: HeroId | null | undefined): HeroSkillDef {
  return heroSkills(heroId).find((s) => s.kind === "core")!;
}

export function branchSkillsOf(heroId: HeroId | null | undefined): readonly HeroSkillDef[] {
  return heroSkills(heroId).filter((s) => s.kind === "branch");
}

// 第二本命候选 = 两个分岔技能的节律(./rhythm 的 heroRhythmOptions 读这里,注入避免循环 import)
_bindSecondRhythmSource((heroId) => branchSkillsOf(heroId).map((b) => b.rhythm));

/* ---------- 升级三选一的出卡策略(纯函数,LevelUpModel 只调用) ---------- */

/** 一张待选卡的"身份"(不含运行时实例;实例化由模型层做) */
export type SkillOffer =
  | { kind: "skill"; def: HeroSkillDef }
  | { kind: "rank"; skillId: string }
  | { kind: "rhythm"; rhythm: RhythmId }
  /** 重置分岔(花金币撤掉已选分岔,分岔二选一重来;docs/DESIGN-HERO-RHYTHM.md §6) */
  | { kind: "reset" }
  | { kind: "fallback"; id: FallbackId };

export interface SkillOfferInput {
  heroId: HeroId | null;
  /** 已拥有技能:id → 当前阶数 */
  owned: ReadonlyMap<string, number>;
  branchChosen: string | null;
  playerLevel: number;
  /** 已解锁节律 → 等级 */
  rhythms: ReadonlyMap<RhythmId, number>;
  /** 本轮不该再出的身份键(锁定卡 / 重随时的其余两格) */
  exclude?: ReadonlySet<string>;
  /** 「重置分岔」这一轮可出(已选分岔、次数未用完、金币够;由模型层判) */
  resetAvailable?: boolean;
  /** 「重置分岔」保底到期:这一轮必出(占一格,排在分岔对之后、随机抽之前) */
  resetGuaranteed?: boolean;
}

/** 身份键(去重与排除用) */
export function offerKey(o: SkillOffer): string {
  switch (o.kind) {
    case "skill":
      return `skill:${o.def.id}`;
    case "rank":
      return `rank:${o.skillId}`;
    case "rhythm":
      return `rhythm:${o.rhythm}`;
    case "reset":
      return "reset";
    case "fallback":
      return `fallback:${o.id}`;
  }
}

/** 分岔二选一这一轮要不要出:两分岔都未拥有、未做过选择,且等级过线(到保底线必出,否则五成) */
export function branchPairDue(input: SkillOfferInput, rand: () => number): readonly HeroSkillDef[] | null {
  if (input.branchChosen) return null;
  const pair = branchSkillsOf(input.heroId).filter((b) => !input.owned.has(b.id));
  if (pair.length !== 2) return null;
  if (input.exclude && pair.some((b) => input.exclude!.has(`skill:${b.id}`))) return null;
  if (input.playerLevel < BRANCH_MIN_LEVEL) return null;
  if (input.playerLevel >= BRANCH_GUARANTEE_LEVEL) return pair;
  return rand() < 0.5 ? pair : null;
}

/** 除分岔外的全部候选(新进阶技能 / 升阶 / 节律强化 / 重置分岔),带权重 */
export function offerCandidates(input: SkillOfferInput): { offer: SkillOffer; weight: number }[] {
  const out: { offer: SkillOffer; weight: number }[] = [];
  const ex = input.exclude ?? new Set<string>();
  for (const def of heroSkills(input.heroId)) {
    if (def.kind === "branch" || def.kind === "core") continue;
    if (input.owned.has(def.id)) continue;
    const o: SkillOffer = { kind: "skill", def };
    if (!ex.has(offerKey(o))) out.push({ offer: o, weight: OFFER_WEIGHTS.skill });
  }
  for (const [id, rank] of input.owned) {
    if (rank >= SKILL_MAX_RANK) continue;
    const o: SkillOffer = { kind: "rank", skillId: id };
    if (!ex.has(offerKey(o))) out.push({ offer: o, weight: OFFER_WEIGHTS.rank });
  }
  for (const [r, lv] of input.rhythms) {
    if (lv >= RHYTHM_MAX_LEVEL) continue;
    const o: SkillOffer = { kind: "rhythm", rhythm: r };
    if (!ex.has(offerKey(o))) out.push({ offer: o, weight: OFFER_WEIGHTS.rhythm });
  }
  if (input.resetAvailable && input.branchChosen && !ex.has("reset")) out.push({ offer: { kind: "reset" }, weight: OFFER_WEIGHTS.reset });
  return out;
}

/**
 * 出 `count` 张:分岔到期时先占两格(左右并排),其余按权重不放回抽;候选不够用兜底三张补齐。
 * `rand` 注入以便复现。
 */
export function rollSkillOffers(input: SkillOfferInput, count: number, rand: () => number = Math.random): SkillOffer[] {
  const out: SkillOffer[] = [];
  const pair = branchPairDue(input, rand);
  if (pair && count >= 2) for (const def of pair) out.push({ kind: "skill", def });
  const pool = offerCandidates(input);
  // 重置保底:到期且可出 → 先占一格,再从池里把它摘掉(免得重复)
  if (input.resetGuaranteed && input.resetAvailable && input.branchChosen && out.length < count && !(input.exclude?.has("reset"))) {
    out.push({ kind: "reset" });
    const i = pool.findIndex((c) => c.offer.kind === "reset");
    if (i >= 0) pool.splice(i, 1);
  }
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let x = rand() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      x -= pool[idx].weight;
      if (x < 0) break;
    }
    out.push(pool[idx].offer);
    pool.splice(idx, 1);
  }
  const used = new Set(out.map(offerKey));
  for (const fb of FALLBACK_OFFERS) {
    if (out.length >= count) break;
    const o: SkillOffer = { kind: "fallback", id: fb.id };
    if (!used.has(offerKey(o)) && !(input.exclude?.has(offerKey(o)))) out.push(o);
  }
  return out.slice(0, count);
}
