/**
 * 节律策划规范表 —— 英雄本命节律、节律等级与各节律发动参数的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 依据 docs/DESIGN-HERO-RHYTHM.md §2:触发条件不再是装备卡的随机词条,而是**英雄的本命节律**;
 * 第 2 条节律由独有技能分岔解锁(§3),法宝挂在已解锁的某一条节律上发动(§4.1)。
 *
 * 节律 = 现有 `TriggerType` 的 6 个常规值,引擎的触发判定语义不变;`crit` / `elite` 两个隐藏触发器
 * 退出节律体系,转为稀有被动法宝的附带效果(见 ./artifacts)。
 */

import type { TriggerParams, TriggerType } from "./affixes";
import type { HeroId } from "./heroes";

/** 节律 id(= 常规触发器类型;隐藏触发器不在内) */
export type RhythmId = "hit" | "pulse" | "kill" | "move" | "combo" | "hurt";

/** 六种节律的固定顺序(英雄表、商店切换轮转、图鉴都按这一份) */
export const RHYTHM_IDS: readonly RhythmId[] = ["hit", "pulse", "kill", "move", "combo", "hurt"];

export interface RhythmDef {
  id: RhythmId;
  /** 玩家可读名(卡面「与你的 X 节律共鸣」) */
  name: string;
  /** 一句话打法形状 */
  desc: string;
}

export const RHYTHM_DEFS: Record<RhythmId, RhythmDef> = {
  hit: { id: "hit", name: "受击", desc: "被敌人击中时发动 —— 站桩承伤,怪越多越强" },
  pulse: { id: "pulse", name: "周期", desc: "每隔固定秒数发动 —— 风筝走位,稳定输出" },
  kill: { id: "kill", name: "击杀", desc: "击杀敌人时概率发动 —— 滚雪球,尸潮里爆发" },
  move: { id: "move", name: "移动", desc: "每移动一段距离发动 —— 绕圈拉怪,一路留痕" },
  combo: { id: "combo", name: "连杀", desc: "连续击杀达到数量时发动 —— 越快越猛" },
  hurt: { id: "hurt", name: "低血", desc: "生命低于阈值时发动 —— 绝境反打" },
};

export function rhythmDef(id: RhythmId): RhythmDef {
  return RHYTHM_DEFS[id];
}

/** 一个触发器类型是否是节律(隐藏触发器返回 false) */
export function isRhythm(t: TriggerType): t is RhythmId {
  return (RHYTHM_IDS as readonly string[]).includes(t);
}

/**
 * 十二英雄本命节律(§2.2 初稿):每种节律恰好 2 个英雄,6 种打法在英雄池里都有代表。
 * 依据 = 各英雄现初始武器的手感暗示(荆棘圆环 nova+hit → 受击;寒霜风暴 ray 弹幕 → 周期;……)。
 * TODO(R6): 与各英雄现初始武器手感对一遍后再定稿。
 */
export const HERO_RHYTHM: Record<HeroId, RhythmId> = {
  vera: "hit", // 荆棘回响:挨打即输出
  mu: "hit", // 雾缚噬灵:缠斗回复
  kyle: "pulse", // 弹幕风暴:定时齐射
  nora: "pulse", // 冰川界碑:定时穿射
  bran: "kill", // 余烬天灾:击杀连锁
  oden: "kill", // 镇魂安可:击杀起骷髅
  willow: "move", // 亡影剧团:绕场放狼
  doran: "move", // 熔核教团:走位落星
  loka: "combo", // 白啸霜刃:连杀成幕
  rayne: "combo", // 炽牙雷殛:连杀雷咬
  sia: "hurt", // 极北冰脉:低血霜环护身
  sally: "hurt", // 熔毒瘟薪:低血毒爆
};

/** 未选英雄(通用卡池)时的本命节律:周期 —— 最稳的一条,与旧默认初始武器同口径 */
export const DEFAULT_RHYTHM: RhythmId = "pulse";

export function heroRhythm(heroId: HeroId | null | undefined): RhythmId {
  return heroId ? HERO_RHYTHM[heroId] : DEFAULT_RHYTHM;
}

/**
 * 挂机 AI 档位(§2.3):受击 / 低血英雄需要被打才有输出,挂机 AI 不能一味贴身就躲。
 *  - kite:贴身才躲、平时巡场(现状口径);
 *  - hold:允许被围(躲闪阈值收窄),保证受击节律有触发;
 *  - orbit:持续绕场,保证移动节律有触发。
 */
export type AiProfile = "kite" | "hold" | "orbit";

export const RHYTHM_AI_PROFILE: Record<RhythmId, AiProfile> = {
  hit: "hold",
  hurt: "hold",
  move: "orbit",
  pulse: "kite",
  kill: "kite",
  combo: "kite",
};

/**
 * 挂机档位参数。
 * hold.maxContacts:贴身(110px 内)敌数达到多少才开始躲(只;4 = 允许被三只围着打);
 * hold.fleeHpPct:血量低于此比例无条件躲(0-1;与「低血」节律阈值 0.5 错开,免得刚触发就跑没了);
 * orbit.dodgeRadius:绕场时敌人贴到多近才改为躲闪(px;小于接触半径 16+enemy 的两倍余量)。
 */
export const AI_PROFILE_PARAMS = {
  hold: { maxContacts: 4, fleeHpPct: 0.35 },
  orbit: { dodgeRadius: 60 },
} as const;

/** 英雄本命节律 → 挂机档位(可传本局实际选用的本命,S2 第二本命时按所选档) */
export function heroAiProfile(heroId: HeroId | null | undefined, chosen?: RhythmId | null): AiProfile {
  return RHYTHM_AI_PROFILE[chosen ?? heroRhythm(heroId)];
}

/**
 * 跨局解锁第二本命后开局可选的节律(docs/DESIGN-HERO-RHYTHM.md Q7 / S2):
 * [表内本命, ...该英雄两个分岔技能的节律](去重、保序)。分岔节律来自技能表,这里不另立一份。
 */
export function heroRhythmOptions(heroId: HeroId): readonly RhythmId[] {
  const out: RhythmId[] = [HERO_RHYTHM[heroId]];
  for (const r of SECOND_RHYTHM_SOURCE(heroId)) if (!out.includes(r)) out.push(r);
  return out;
}

/** 分岔节律取数口(由 ./heroSkills 在模块加载后注入,避免 rhythm → heroSkills → rhythm 的循环 import) */
let SECOND_RHYTHM_SOURCE: (heroId: HeroId) => readonly RhythmId[] = () => [];
export function _bindSecondRhythmSource(fn: (heroId: HeroId) => readonly RhythmId[]): void {
  SECOND_RHYTHM_SOURCE = fn;
}

/* ---------- 节律等级 ---------- */

/** 节律等级上限(级);由升级三选一的「节律强化」卡提升 */
export const RHYTHM_MAX_LEVEL = 5;
/** 每级内置冷却 / 周期间隔缩减比例(0-1;−8%/级) */
export const RHYTHM_CD_PER_LEVEL = 0.08;
/** 每级触发阈值收窄比例(0-1;连杀所需数 / 移动距离 −6%/级,低血阈值 +6%/级) */
export const RHYTHM_THRESHOLD_PER_LEVEL = 0.06;
/** 受击节律同帧齐放窗口(秒):0.5s 内只有一件受击法宝响应,避免所有法宝在同一帧齐放 */
export const HIT_RHYTHM_WINDOW = 0.5;

/** 节律等级 → 间隔倍率(1 级 = 1;每级 −8%) */
export function rhythmIntervalMult(level: number): number {
  return Math.max(0.2, 1 - RHYTHM_CD_PER_LEVEL * (Math.max(1, level) - 1));
}

/** 节律等级 → 阈值倍率(连杀数 / 移动距离用;每级 −6%) */
export function rhythmThresholdMult(level: number): number {
  return Math.max(0.2, 1 - RHYTHM_THRESHOLD_PER_LEVEL * (Math.max(1, level) - 1));
}

/**
 * 各节律的基础发动参数(1 级):**法宝不再自带随机触发参数**,全部读这一份。
 * 取值依据:旧随机池的中位数(pulse 1.2–3.5 → 2.4;kill 0.18+ → 0.35 因为不再叠触发器数;
 * hurt 0.5–0.85 → 0.5;move 300–600 → 240 因为一条节律要撑全部法宝;combo 3–6 → 5 / 窗 3s = COMBO_WINDOW)。
 */
export const RHYTHM_BASE_PARAMS: Record<RhythmId, TriggerParams> = {
  pulse: { interval: 2.4 },
  kill: { chance: 0.35 },
  hurt: { hpThreshold: 0.5 },
  move: { distance: 240 },
  hit: {},
  combo: { count: 5, window: 3 },
};

/** 节律 + 等级 → 触发器实例参数(挂法宝 / 生成技能时写进 `triggers[0].params`) */
export function rhythmTriggerParams(id: RhythmId, level = 1): TriggerParams {
  const base = RHYTHM_BASE_PARAMS[id];
  const m = rhythmThresholdMult(level);
  switch (id) {
    case "pulse":
      return { interval: round1((base.interval ?? 2.4) * rhythmIntervalMult(level)) };
    case "kill":
      return { chance: round2(Math.min(0.9, (base.chance ?? 0.35) * (1 + RHYTHM_THRESHOLD_PER_LEVEL * (Math.max(1, level) - 1)))) };
    case "hurt":
      return { hpThreshold: round2(Math.min(0.9, (base.hpThreshold ?? 0.5) * (1 + RHYTHM_THRESHOLD_PER_LEVEL * (Math.max(1, level) - 1)))) };
    case "move":
      return { distance: Math.round((base.distance ?? 240) * m) };
    case "combo":
      return { count: Math.max(2, Math.round((base.count ?? 5) * m)), window: base.window ?? 3 };
    case "hit":
      return {};
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
