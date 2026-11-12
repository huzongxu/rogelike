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
import type { ThornGainMode } from "./combat";
// 只取类型:equipmentGen 运行期反向 import 本文件的 heroSkillDef,`import type` 编译期擦除、不成环
import type { Equipment } from "./equipmentGen";
import { RHYTHM_MAX_LEVEL, _bindSecondRhythmSource, rhythmTriggerParams, type RhythmId } from "./rhythm";
import { buildBranch, hasChapterBuild } from "./heroBuild";

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
  /**
   * 分支技能的**真实载荷**(仅 `kind = "branch"` 使用):把补丁并入本英雄核心的施放形态。
   * 为什么要有这个字段:分岔若只是"再来一发更小的同类弹",选完就被系统遗忘(`branchChosen`
   * 全仓零下游消费者),两条分支的通关差被种子噪声吃掉。改成"核心怎么打"之后,分支一进包
   * 就立刻改变主武器的落点 / 残留,且不需要指定被动法宝才生效(与共鸣的双份依赖正交)。
   * 由 `equipmentEngine.morphOf` 在核心结算时并入。
   */
  coreMorph?: MorphPatch;
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
  // 极北权杖旧 1.8s 常驻 → 低血阈值 0.5 × 1.4 = 0.7(七成血以下就开环);底拍 3.0 × 0.8 = 2.4s
  // (R14 真机口径 3 种子对照:基线 11/18/15 Σ44,阈值 0.8 → Σ55,底拍 2.4s → 19/19/19 Σ57,伤 50 → Σ40;取底拍,阈值不再抬)
  sia: { threshold: 1.4, baseline: 0.8 },
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

/**
 * 白啸霜刃对吞噬者的特効倍率。
 * 含义:洛卡核心的全向霜刃幕命中吞噬者(含吞噬技能载体)时**不被吸收、不喂血**,并按本倍率结算伤害。
 * 单位:倍率(1.5 = 斩得穿且对该种敌人 +50% 伤害)。
 * 取值依据:逐秒剖面(CONTEXT 66)——第 6 章登场的吞噬者吃掉洛卡 25% 的弹体(活下来的种子 7 是 16%),
 *   有效 DPS 从 993/s 掉到 644/s、末 4 秒归零 → 击杀断供 → 连杀节律(需 3 杀)饥饿 → 发射只剩 1.2s 底拍。
 *   先把"被吃掉的 25%"变成有效输出再谈加伤,1.5 是这一档的起点;R14 的刃伤 / 底拍 / 连杀三根杠杆
 *   之所以全在噪声内,正是因为它们只放大被吃掉的那部分。
 * 出处:docs/TODO-HERO-RHYTHM.md §1(杠杆 B)、docs/DESIGN-HERO-RHYTHM.md §3.2。
 */
export const LOKA_SLAY_DEVOURER = 1.5;

/**
 * 穆「缠斗回复」的承伤反哺入池比例。
 * 含义:玩家每次承受伤害时,把其中的这一比例转入反哺池,由灵狼命中抽取追补回血(机制常量见 combat.RETALIATION_HEAL)。
 * 单位:比例(0.6 = 挨 100 下能追回 60 点血,分多次命中发放)。
 * 取值依据:逐秒剖面(CONTEXT 68)——第 10 章死局平均承伤 60/s 对回血 254/s 却仍猝死,因为承伤是单秒尖峰(734)而回血是平滑流(501);
 *   0.6 让一次尖峰在 2.5s 半衰期内被狼群追回约六成,把断点接上,又不改变"不挨打就没有额外奶"的定位。
 * 出处:docs/TODO-HERO-RHYTHM.md §1 穆条(杠杆 A)、docs/DESIGN-HERO-RHYTHM.md §2.3。
 */
export const MU_RETALIATION_POOL_PCT = 0.6;

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
/** 三选一权重:新技能 / 升阶 / 节律强化(唯一的两类决策:我怎么打、我是谁) */
export const OFFER_WEIGHTS = { skill: 3, rank: 2, rhythm: 1 } as const;
/*
 * 已取消的两类选牌(R20,用户「取消另辟蹊径这种重置以及补给类型所有选牌」):
 *  - 「另辟蹊径 · 重置分岔」(原 `RESET_GUARANTEE_ROUNDS` / `OFFER_WEIGHTS.reset` / `shop.RESET_BRANCH_*`)——
 *    分岔互斥本身就是这一局最重的决策,给一次"反悔"等于把它降级成可回退的选项;
 *  - 「补给」兜底三张(回气 / 赏金 / 壮体,原 `FALLBACK_OFFERS`)—— 它们卖的是金币与生命,
 *    与升级层"只发独有技能"的口径不同宗,池耗尽时该做的是不再出牌,而不是发一张无关的卡。
 * 现在技能池耗尽 → 模型层直接不开弹层(见 `LevelUpModel.open`)。
 */

/* ---------- S1 三英雄专属表(§3.2) ---------- */

/**
 * 荆棘层的作用位(站位资源;积累与衰减规则在 ../data/combat 的 THORN_STACK)。
 * 只挂在她的核心上:其余 11 英雄与她的分岔 / 进阶都不带这两位 → 别人逐帧与加这一层之前一致。
 * 单位:radiusPerStack = 每层半径倍率加成(0.06 = 满 6 层 +36%);powerLossAtZero = 零层的伤害损失(0.15 = 只剩八成五)。
 * 依据:docs/DESIGN-HERO-PIPELINE.md §2「站位有增益」+ §5.5 提案 4 —— 她的身份动词"什么时候站在圈里"
 *   原先没有任何读数,站与走完全等价;这一对给上限也给下限,不是把奶量当闸门。
 * 罚项首版取 0.35,R18 实测后收到 0.15:自动档下她多数时间并不在 110px 接触带内(围数均值 0.2–1.6),
 *   0.35 使这条资源在挂机口径里变成**纯惩罚**(三种子 21/21/19† → 11†/21/21),读起来像"她变弱了"而不是"有节奏"。
 */
export const VERA_STACK_TUNE = { radiusPerStack: 0.06, powerLossAtZero: 0.15 } as const;

/**
 * 荆棘层的**攒法**(站位资源的入口条件;由本局所选分岔决定,未选分岔 = `contact`)。
 * 类型定义在 ./combat(世界层与模拟器都要引用,不反向依赖本文件),这里再导出一次方便技能表使用。
 * 设计意图:回血与半径共用同一个层数,所以"怎么维持层数"就是"怎么保住续航"——
 *   三条路分别对应三种身体:贴着脸站(默认)/ 站定不动(荆甲)/ 边走边拉(棘行者)。
 * 选完分岔后挂机档跟着换(`still → hold`、`move → orbit`),不另设按钮。
 */
export type { ThornGainMode } from "./combat";

/**
 * 薇拉的续航档位(R19:受击回血 → **状态型回血**)。
 * 单位:点/秒(**满层时**的值;实际给量 = 本值 × 层数比例 × dt,小数攒满 1 才入账)。
 * 形状:她的回血只有"荆棘层"这一个来源,两个技能各贡献一档(核心常驻、进阶血棘再加一层);
 *   旧的三条受击型回复(挨打回 2% 最大生命 / 棘肤回 1.5% / 血棘每下 6 点)对她一律停用,改由层数结算。
 * 依据:R18 剖面 —— 每秒承伤 7–30 对回血 60–120、四种敌情全净回血 → 天敌根本不成立;
 *   而旧那两条都按**最大生命比例**给(越肉越奶,总量随等级无限成长),按秒/按层给才钳得住。
 * 出处:docs/DESIGN-HERO-PIPELINE.md §5、docs/TODO-HERO-RHYTHM.md §1 薇拉条。
 */
export const VERA_SUSTAIN = {
  /** 核心「荆棘圆环」那一档:满层 6 血/秒 */
  coreHealPerSec: 6,
  /** 进阶「血棘」那一档:满层再 +4 血/秒(拿到共鸣「饮血荆棘」翻倍) */
  advanceHealPerSec: 4,
} as const;

/**
 * 薇拉两枚分岔各自的**代价**(选完就痛;docs/DESIGN-HERO-PIPELINE.md §5.3 与 §7 纪律「分岔必须关一扇门」)。
 * 依据:R18 基线剖面(.probe/r18-vera-baseline.json,真机口径三种子)—— 默认口径恒取分岔对首张(荆甲),
 *   荆甲 21 / 21 / 19† 且 HP 波动带只 0.118(全程满血)、棘行者 21 / 17† / 21 但带宽 0.756;
 *   两条在**深度**上只差 0.7 章(噪声内),在**形状**上差一个数量级 —— 缺的正是"选了要放弃什么"。
 * 单位:倍率(0.8 = 圆环半径 −20%;0.75 = 圆环爆发伤害 −25%)。
 * 注:荆甲的半径代价与共鸣档位(半径 ×1.5)同键,共鸣到手会覆盖它 —— 质变是更高一层的报酬,不叠加惩罚。
 */
export const VERA_BRANCH_COST = { armorRadiusMult: 0.8, walkerPowerMult: 0.75 } as const;

/** 局首姿势二选一里的一张卡 */
export interface ThornStance {
  mode: ThornGainMode;
  /** 卡面名 */
  name: string;
  /** 卡面正文:发动条件 + 报酬(R19 纪律「状态标签必须写清怎么发动」) */
  desc: string;
  /** 挂机档说明(自动走位跟着姿势走,写在卡面上免得玩家以为这档要手动维持) */
  aiNote: string;
}

/**
 * 薇拉的两种姿势(R22:姿势从分岔摘出来,改成**局首二选一** —— 每局开局选一副、两态开局即可用)。
 * 依据:反伤角色的乐趣在"这一局我站桩吃伤害,还是绕场养层",这该是开局的一次身份选择,
 *   而不是打到 12 级才摸到的分岔奖励。分岔因此只剩"核心怎么打"(`coreMorph` 的几何差)+ 数值代价,
 *   分支差要按新形状复量(docs/DESIGN-HERO-PIPELINE.md §5.5)。
 * 两态共有的前提:**贴身 110px 内有敌才涨层**(`combat.THORN_STACK.contactRadius`),姿势只决定还要不要"停"或"走"。
 * 这条前提带**接触记忆**(`THORN_STACK.contactEchoDecayPerSec`):怪刚在圈里被清掉也算这一拍,
 * 否则稀怪章的怪进闸半秒就死、层永远养不起来(R22 试玩实测,两态同享)。
 * 顺序 = 局首弹层里的卡序,首项同时是"没走到这一层"的兜底档(模拟器 / 机器人局读它)。
 */
export const VERA_STANCES: readonly ThornStance[] = [
  {
    mode: "still",
    name: "站定",
    desc: "停下不动才攒荆棘层:站进怪群里养层再爆,半径与威力按层数给;怪刚在圈里被清掉也算这一拍。代价是要挪位置时层数会断",
    aiNote: "挂机档自动站住不打围",
  },
  {
    mode: "move",
    name: "绕场",
    desc: "边走边贴身才攒荆棘层:绕着怪圈转就能不断养层,刺地也留在身后;怪刚在圈里被清掉也算这一拍。代价是站下不动就不涨",
    aiNote: "挂机档自动绕场巡逻",
  },
];

/** 哪些英雄有哪几副姿势(只有走荆棘层的英雄需要选;其余返回空表 = 局首不弹这一层) */
const HERO_STANCES: Partial<Record<HeroId, readonly ThornStance[]>> = { vera: VERA_STANCES };

/** 该英雄的姿势表(空表 = 这一局没有姿势可选) */
export function heroStances(id: HeroId | null | undefined): readonly ThornStance[] {
  return (id && HERO_STANCES[id]) || [];
}

/** 姿势的兜底档:没走到局首弹层时(模拟器 / 机器人 / 老档)按表首项跑,保证可复现 */
export const DEFAULT_THORN_MODE: ThornGainMode = VERA_STANCES[0].mode;

/** 分岔主循环:值住 heroBuild.ts,这里只按路线 id 取引用,不另抄一份系数 */
function loopOf(branchId: string) {
  return buildBranch(branchId)?.loop ?? {};
}

const VERA: readonly HeroSkillDef[] = [
  {
    id: "vera_core", heroId: "vera", kind: "core", name: "荆棘圆环", rhythm: "hit", rhythmTune: CORE_RHYTHM_TUNE.vera,
    desc: "受击时向周围爆出荆棘;贴身才攒荆棘层(满 6 层半径 +36%、每秒回 6 血),层数掉了威力与血都跟着掉",
    effect: "nova",
    params: {
      damage: 50, radius: 200, speed: 1,
      stackRadiusPer: VERA_STACK_TUNE.radiusPerStack,
      stackPowerLoss: VERA_STACK_TUNE.powerLossAtZero,
      sustainHeal: VERA_SUSTAIN.coreHealPerSec,
    },
    resonancePassive: "duration", resonanceName: "荆棘领域", resonanceDesc: "荆棘范围 ×1.5,伤害 ×1.2(近似「留下荆棘地」)",
    resonanceMorph: { radiusMult: 1.5, power: 1.2 },
  },
  {
    id: "vera_armor", heroId: "vera", kind: "branch", name: "荆甲", rhythm: "hurt",
    desc: "生命低于一半时获得护盾;荆棘圆环改为在打你的敌人脚下爆出(绕开盾面);解锁【低血】节律;代价:圆环半径 −20%",
    effect: "shield", params: { amount: 8, duration: 4 },
    resonancePassive: "duration", resonanceName: "不朽荆甲", resonanceDesc: "护盾持续 ×3、吸收 ×1.5(近似「不消失改为衰减」)",
    resonanceMorph: { durationMult: 3, power: 1.5 },
    // 低血反噬身份落到形态上:爆发不再以自身为中心,而是搬到最近一次打我的人脚下
    // (半径 −20% = 这扇门:换来"只打得到刚打我的人",换来的是落点不再永远撞在盾卫/Boss 的正面弧里)
    coreMorph: { castAtAttacker: true, radiusMult: VERA_BRANCH_COST.armorRadiusMult, loop: loopOf("vera.a") },
  },
  {
    id: "vera_walker", heroId: "vera", kind: "branch", name: "棘行者", rhythm: "move",
    desc: "移动时在身后留下荆棘刺地;荆棘圆环爆完在落点长出荆棘带;解锁【移动】节律;代价:圆环爆发 −25%",
    effect: "magma_trail", params: { dps: 20, radius: 56, duration: 2.5 },
    resonancePassive: "split", resonanceName: "裂棘", resonanceDesc: "刺地范围翻倍",
    resonanceMorph: { radiusMult: 2 },
    /**
     * 生棘身份落到核心上:圆环结算后留一片荆棘带。
     * 取值:dps = 新星单发 50 × 0.12 = 6/s、持续 3 秒 ≈ 新星单发的 36%(分支级报酬,不抢核心的清场位);
     * 半径 = 新星 200 × 0.6 = 120px(小于爆发圈,读得出"残留"而不是"再来一圈")。
     * 伤害 −25% = 这扇门:即时爆发换延迟结算的地面(地面不吃正面减伤,但要求把敌人留在地上)。
     */
    coreMorph: { afterCastGround: { radiusMult: 0.6, duration: 3, dpsPerDamage: 0.12 }, power: VERA_BRANCH_COST.walkerPowerMult, loop: loopOf("vera.b") },
  },
  {
    id: "vera_blood", heroId: "vera", kind: "advance", name: "血棘", rhythm: "hit",
    // R19:从"受击回 6 点"改成续航的第二档 —— 回血只认层数,不认挨了几下(总量按秒钳住,不随最大生命成长)
    desc: "荆棘再养你一层:满层时每秒再多回 4 血(与圆环同一套层数,层空了两边都停)",
    effect: "drain", params: { sustainHeal: VERA_SUSTAIN.advanceHealPerSec },
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
    // V1.1 弹幕风暴:分岔技能 = 连杀节律的额外齐射;核心主循环 = 有效命中蓄过载,满 100 卸 8 束
    id: "kyle_overload", heroId: "kyle", kind: "branch", name: "弹幕风暴", rhythm: "combo",
    desc: "连杀达标时追加一轮齐射;核心每轮按不同命中目标蓄过载,满 100 卸 8 束扇射(3.6s ICD);解锁【连杀】节律",
    effect: "ray", params: { damage: 60, speed: 620, radius: 640, spread: 8, pierce: 1, slow: 0.45, duration: 2 },
    resonancePassive: "power", resonanceName: "过载不熄", resonanceDesc: "过载齐射伤害再 ×1.5",
    resonanceMorph: { power: 1.5 },
    coreMorph: { loop: loopOf("kyle.a") },
  },
  {
    // V1.1 冰晶狙猎:分岔技能 = 移动节律的三束聚束;核心基础轮改 3 束同向,6 印剥离冰锥
    id: "kyle_hunter", heroId: "kyle", kind: "branch", name: "冰晶狙猎", rhythm: "move",
    desc: "移动时向前方三束聚束齐射;核心基础轮改 3 束同向,同轮同靶叠印,满 6 印发单靶冰锥;解锁【移动】节律",
    effect: "ray", params: { damage: 42, speed: 620, radius: 640, spread: 3, pierce: 1, slow: 0.45, duration: 2 },
    resonancePassive: "pierce", resonanceName: "贯穿猎步", resonanceDesc: "扇形弹穿透 +2",
    resonanceMorph: { pierce: 2 },
    coreMorph: { loop: loopOf("kyle.b") },
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
    desc: "每 3 连杀掷出 12 发霜刃幕;霜刃斩得穿吞噬者(不被吸收、对其伤害 ×" + LOKA_SLAY_DEVOURER + ")",
    effect: "knife", params: { damage: 34, speed: 560, radius: 640, spread: 12, pierce: 1, slayDevourer: LOKA_SLAY_DEVOURER },
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

/* ---------- 薇洛:V1.1 专属表(狼群统帅 / 亡影剧团) ---------- */

/**
 * 薇洛的四技能底子(核心 + 两分岔 + 进阶),主循环由分岔 `coreMorph.loop` 承载:
 *  - A 狼群统帅:核心两狼同靶配对 3 记 → 头狼扑击;分岔主动件 = 受击时的头狼突袭;
 *  - B 亡影剧团:核心狼槽被亡影替代(3s 定拍),分岔主动件 = 亡影入场;四幕谢幕。
 * 数值初值见 docs/DESIGN-HERO-BUILD.md §3.3;均为待验证。
 */
const WILLOW: readonly HeroSkillDef[] = [
  {
    id: "willow_core", heroId: "willow", kind: "core", name: "影群哨笛", rhythm: "move",
    desc: "移动时唤出两狼协战;A 路线同靶配对 3 记放头狼,B 路线改由亡影按 3 秒定拍入场",
    effect: "spirit_wolves", params: { count: 2, damage: 14, duration: 12 },
    resonancePassive: "power", resonanceName: "影群哨笛·极", resonanceDesc: "召唤物伤害 ×1.3",
    resonanceMorph: { power: 1.3 },
  },
  {
    id: "willow_wolves", heroId: "willow", kind: "branch", name: "狼群统帅", rhythm: "hurt",
    desc: "受击时头狼突袭最近敌(2×14);两狼同靶交替咬出 3 道猎记后,下一拍头狼扑击;解锁【低血】节律",
    effect: "icelance", params: { damage: 28, speed: 700, radius: 640, homing: 4 },
    resonancePassive: "power", resonanceName: "头狼锋", resonanceDesc: "头狼突袭伤害 ×1.5",
    resonanceMorph: { power: 1.5 },
    coreMorph: { loop: loopOf("willow.a") },
  },
  {
    id: "willow_shades", heroId: "willow", kind: "branch", name: "亡影剧团", rhythm: "pulse",
    // 3.0s 定拍 = 周期 2.4 × 1.25;与 DESIGN-HERO-BUILD §3.3 的 0/3/6s 同拍
    rhythmTune: { interval: 1.25 },
    desc: "亡影替代职业狼槽:每 3 秒在靶前召一影横扫(14 伤/3 靶);入场与自然退场攒幕,满 4 幕谢幕;解锁【周期】节律",
    effect: "haunt_crown", params: { damage: 14, duration: 4 },
    resonancePassive: "split", resonanceName: "幕间加演", resonanceDesc: "谢幕额外落点 +1(近似分裂)",
    resonanceMorph: { splitExtra: 1 },
    coreMorph: { loop: loopOf("willow.b") },
  },
  {
    id: "willow_focus", heroId: "willow", kind: "advance", name: "哨刃回响", rhythm: "pulse",
    desc: "周期追发一轮四散哨刃(30 伤/4 发),两路线共用",
    effect: "knife", params: { damage: 30, speed: 560, radius: 640, spread: 4, pierce: 1 },
    resonancePassive: "split", resonanceName: "双哨", resonanceDesc: "哨刃 +3 发",
    resonanceMorph: { splitExtra: 3 },
  },
];

/* ---------- 通用职业包(其余 5 英雄与未选英雄的过渡表) ---------- */

/** 各套组现初始武器的效果与参数(与 equipmentGen.makeSetStarterEquipment 同数;通用包核心技能读这里) */
const GENERIC_CORE: Record<Exclude<HeroId, "vera" | "kyle" | "bran" | "sia" | "nora" | "loka" | "willow">, { name: string; effect: EffectType; params: EffectParams }> = {
  doran: { name: "熔核之心", effect: "meteor", params: { damage: 65, radius: 160, delay: 0.6 } },
  sally: { name: "瘟薪熔炉", effect: "cloud", params: { dps: 15, radius: 150, duration: 4.5 } },
  rayne: { name: "炽牙雷殛", effect: "chain", params: { damage: 44, jumps: 5, radius: 400 } },
  oden: { name: "镇魂安可", effect: "skeleton", params: { count: 2, damage: 13, duration: 14 } },
  // R6 数值 pass:狼伤 11 → 14 与幻影剧团(willow)同款对齐;3 种子 10/10/5 → 10/10/21,第 10 章召唤流之墙仍在(TODO 下一轮看 wolves 生存 / 章型)
  // healOnHit:狼每次命中回玩家血(伤害 × 30%)—— 节律表备注里的「缠斗回复」身份;3 种子对照下狼存活 / 狼数都过不了第 10 / 15 章精英开场的爆发,回血是唯一对症项
  // 承伤反哺(杠杆 A):逐秒剖面 CONTEXT 68 显示穆死于"承伤是尖峰(第 10 章单秒 734)、回血是平滑流(同秒 501)"的错配,
  //   而不是围数或命中率;把承伤按比例转入反哺池、由狼群命中抽取,让拉锯在尖峰拍也追得平。
  mu: { name: "雾缚噬灵", effect: "spirit_wolves", params: { count: 3, damage: 14, duration: 10, healOnHit: 1, retaliationHeal: MU_RETALIATION_POOL_PCT } },
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
  willow: WILLOW,
  oden: genericPack("oden", GENERIC_CORE.oden, "kill"),
  mu: genericPack("mu", GENERIC_CORE.mu, "hit"),
};

/** 有专属表(非通用职业包)的英雄 */
export const BESPOKE_HEROES: readonly HeroId[] = ["vera", "kyle", "bran", "sia", "nora", "loka", "willow"];

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

/**
 * 该英雄本局**可达**的独有技能件数上限(件)。
 * 分岔互斥:同一对里选一个、另一个永久消失,故 N 条分岔只贡献 N/2 件。
 * 件套门槛必须按本值标定 —— 现 4 条表(1 核心 + 2 互斥分岔 + 1 进阶)上限只有 3 件,
 * 直接套 `SET_PIECE_TIERS.tier2 = 6` 会让质变档永远打不开;6 件要等独有技能 4→6 落地才可达。
 */
export function heroSkillCapacity(heroId: HeroId | null | undefined): number {
  const list = heroSkills(heroId);
  const branch = list.filter((s) => s.kind === "branch").length;
  return list.length - branch + Math.floor(branch / 2);
}

/**
 * 件套线计数源:本局已装备的**本英雄**独有技能数(件)。
 * 与共鸣线正交 —— 这里只看技能在不在身上,不看它有没有配到那一枚指定被动法宝,
 * 因此不存在「技能 + 指定被动都要凑齐」的双份隐藏依赖(那条只决定单技能自己的 `resonanceMorph`)。
 */
export function heroSkillPieces(list: readonly Equipment[], heroId: HeroId | null | undefined): number {
  const ids = new Set(heroSkills(heroId).map((d) => d.id));
  let n = 0;
  for (const eq of list) if (eq.kind === "skill" && eq.skillId && ids.has(eq.skillId)) n += 1;
  return n;
}

/* ---------- 升级三选一的出卡策略(纯函数,LevelUpModel 只调用) ---------- */

/** 一张待选卡的"身份"(不含运行时实例;实例化由模型层做) */
export type SkillOffer =
  | { kind: "skill"; def: HeroSkillDef }
  | { kind: "rank"; skillId: string }
  | { kind: "rhythm"; rhythm: RhythmId };

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
  /**
   * 这一局是否走章节节点层(V1.1)。缺省 = true;legacy 夹具可显式传 false,
   * 用来单独验证 5–8 级成对分岔的老路径。
   */
  chapterBuild?: boolean;
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
  }
}

/** 分岔二选一这一轮要不要出:两分岔都未拥有、未做过选择,且等级过线(到保底线必出,否则五成) */
export function branchPairDue(input: SkillOfferInput, rand: () => number): readonly HeroSkillDef[] | null {
  // 三原型(V1.1)的分岔改到第 2 章开章二选一,不再走 5–8 级升级发牌;9 位 legacy 英雄不变
  if (input.chapterBuild !== false && hasChapterBuild(input.heroId)) return null;
  if (input.branchChosen) return null;
  const pair = branchSkillsOf(input.heroId).filter((b) => !input.owned.has(b.id));
  if (pair.length !== 2) return null;
  if (input.exclude && pair.some((b) => input.exclude!.has(`skill:${b.id}`))) return null;
  if (input.playerLevel < BRANCH_MIN_LEVEL) return null;
  if (input.playerLevel >= BRANCH_GUARANTEE_LEVEL) return pair;
  return rand() < 0.5 ? pair : null;
}

/** 除分岔外的全部候选(新进阶技能 / 升阶 / 节律强化),带权重 */
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
  return out;
}

/**
 * 出 `count` 张:分岔到期时先占两格(左右并排),其余按权重不放回抽。
 * 候选抽空就少出几张(R20:不再有「补给」兜底卡)—— 一张都不剩时返回空数组,由模型层决定不开这一轮弹层。
 * `rand` 注入以便复现。
 */
export function rollSkillOffers(input: SkillOfferInput, count: number, rand: () => number = Math.random): SkillOffer[] {
  const out: SkillOffer[] = [];
  const pair = branchPairDue(input, rand);
  if (pair && count >= 2) for (const def of pair) out.push({ kind: "skill", def });
  const pool = offerCandidates(input);
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
  return out.slice(0, count);
}
