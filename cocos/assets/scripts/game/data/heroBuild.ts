/**
 * 英雄 Build V1.1｜章节节点层 —— 三原型(薇拉 / 凯尔 / 薇洛)的唯一数据出处。
 *
 * 设计合同见 docs/DESIGN-HERO-BUILD.md:
 *  - 第 2 章开章二选一分岔;第 4 / 8 / 12 章开章各二选一节点;开章冻结世界,选完才开打;
 *  - 分岔技能 = 这条路的主动件,分岔的 `coreMorph` 承载路线主循环,节点 patch 改主循环;
 *  - 每支 2³ = 8 种组合;分岔与节点不占升级槽 / 商店槽 / 共鸣计数,不花金币,不登记图鉴;
 *  - 全部选择是本局态,不落存档;换章清临时资源,重开全清。
 *
 * 数值纪律(docs/DESIGN-VALUES-SPEC.md):所有系数住本表,单位 / 依据 / 代价写在行内注释;
 * 引擎与模拟器只读表,不内联第二份。所有初值均为待验证(见 DESIGN-HERO-BUILD §7)。
 */

import type { HeroId } from "./heroes";

export type BuildTier = 1 | 2 | 3;
export type BuildSide = "a" | "b";

/** 章节点:第 4 / 8 / 12 章(与现有精英章同位;选择发生在挑战之前)。 */
export const BUILD_NODE_CHAPTERS: readonly [number, number, number] = [4, 8, 12];
/** 开章选支:第 2 章。 */
export const BUILD_BRANCH_CHAPTER = 2;

/* ---------- 路线主循环(分岔 coreMorph 的 BuildPatch.loop) ---------- */

/**
 * 薇拉 A「荆棘堡垒」:满层付 3,追加向内收缩的刺圈。
 * 单位:层 = `THORN_STACK.cap` 的层;damageMult = 本次圆环基伤倍率;radiusMult = 本次半径倍率。
 * 依据:DESIGN-HERO-BUILD §3.1;只在基础拍消费,同帧受击只刷新盾(R22 的层数规则不变)。
 */
export interface StackConsumeLoop {
  atStacks: number;
  consume: number;
  damageMult: number;
  radiusMult: number;
  maxTargets: number;
}

/**
 * 薇拉 B「血棘行者」:踏迹印 → 3 印爆种。
 * 单位:markPerSec = 每靶每秒首次踏迹的印数;detonateRadius = 设计 px;detonateMaxPerSec = 滚动 1s 次数上限。
 * 依据:DESIGN-HERO-BUILD §3.1;两类地面合池 4 块,未满印时只播种不结算。
 */
export interface TrailImprintLoop {
  markPerSec: number;
  maxMarks: number;
  clearAfter: number;
  maxTargets: number;
  detonateAt: number;
  /** 爆种基础伤 = 本值 × detonateDamageMult(表值 50 = 核心单发面板;不读实时装备,避免双乘) */
  detonateBaseDamage: number;
  detonateDamageMult: number;
  detonateRadius: number;
  detonateMaxTargets: number;
  detonateMaxPerSec: number;
  trailMax: number;
  moveTrailEvery: number;
  moveTrailDps: number;
  moveTrailRadius: number;
  moveTrailDuration: number;
}

/**
 * 凯尔 A「弹幕风暴」:有效命中合并窗蓄过载,满 100 卸 8 束扇射。
 * 单位:windowSec = 秒;perRoundMax = 单轮合并上限;cap = 过载上限;icd = 秒。
 * 依据:DESIGN-HERO-BUILD §3.2;额外齐射不积过载,派生事件 depth = 1 不匹配本规则。
 */
export interface OverloadLoop {
  windowSec: number;
  base: number;
  perTarget: number;
  perRoundMax: number;
  cap: number;
  burstSpread: number;
  burstDamageMult: number;
  icd: number;
  fanDeg: number;
}

/**
 * 凯尔 B「冰晶狙猎」:基础轮 3 束同向,同轮同靶一次印,6 印冰锥。
 * 单位:firstMark / backMark = 印数;expireSec = 秒;detonateDamageMult = 冰锥基础伤倍率。
 * 依据:DESIGN-HERO-BUILD §3.2;满印最多 1 次/轮,原靶死亡不追打尸体。
 */
export interface MarkLoop {
  firstMark: number;
  backMark: number;
  cap: number;
  expireSec: number;
  detonateAt: number;
  detonateProjectiles: number;
  detonateDamageMult: number;
  baseSpread: number;
  targetMax: number;
}

/**
 * 薇洛 A「狼群统帅」:两狼同靶配对 3 记,头狼扑击。
 * 单位:pairWindow = 秒;alphaSec = 秒;pounceMult = 狼伤倍率。
 * 依据:DESIGN-HERO-BUILD §3.3;每狼命中只用一次,刷新寿命不重置攻击计时。
 */
export interface WolfPairLoop {
  pairWindow: number;
  marksToAlpha: number;
  alphaSec: number;
  pounceMult: number;
  markDecayDelay: number;
  markDecayPerSec: number;
}

/**
 * 薇洛 B「亡影剧团」:亡影替代狼槽,4 幕谢幕。
 * 单位:interval = 秒;curtainRadius = 设计 px;curtainDamageMult = 影入场伤倍率。
 * 依据:DESIGN-HERO-BUILD §3.3;强制淘汰无退场收益,谢幕不消耗实体、不触发退场。
 */
export interface ShadeTroupeLoop {
  interval: number;
  maxShades: number;
  actsToCurtain: number;
  curtainIcd: number;
  curtainRadius: number;
  /** 谢幕基础伤 = 本值 × curtainDamageMult(42 = 3×14,与影入场同源) */
  curtainBaseDamage: number;
  curtainDamageMult: number;
  curtainMaxTargets: number;
  shadeTtl: number;
  shadeDamageMult: number;
  shadeMaxTargets: number;
}

export interface BranchLoopPatch {
  stackConsume?: StackConsumeLoop;
  trailImprint?: TrailImprintLoop;
  overload?: OverloadLoop;
  marksB?: MarkLoop;
  wolfPair?: WolfPairLoop;
  shadeTroupe?: ShadeTroupeLoop;
}

/* ---------- 节点 patch(按主循环分组;所有字段可选) ---------- */

export interface NovaNodePatch {
  /** 强化圈给自身盾:amount = 点数;amountPct = 最大生命比例(二者取大);sec = 秒 */
  shield?: { amount?: number; amountPct?: number; sec: number };
  /** 强化圈改为直线:length / width = 设计 px;damageMult = 基伤倍率;maxTargets = 靶数 */
  line?: { length: number; width: number; damageMult: number; maxTargets: number };
  /** 收拢后反向再结算:delay = 秒;damageMult = 原预算份额;radiusMult = 半径倍率 */
  echo?: { delay: number; damageMult: number; radiusMult: number; maxTargets: number };
  /** 截阵:把刺圈放到下一名逼近者脚下,window 秒未出现回当前靶 */
  anchorNext?: { window: number };
  /** 城垣:duration = 秒;damageMult = 首次越界伤害份额;follow = 跟随自身 */
  wall?: { duration: number; radiusMult: number; damageMult: number; follow?: boolean; followRadiusMult?: number };
}

export interface TrailNodePatch {
  /** 扎根:无邻敌时续迹跟靶 seconds 秒 */
  follow?: { seconds: number };
  /** 播种:向最近邻敌送 marks 印,radius = 设计 px */
  seed?: { radius: number; marks: number };
  /** 接续棘径:最近两块迹连成窄带,width = 设计 px,maxLength = 设计 px */
  link?: { width: number; maxLength: number };
  /** 折枝:把最老轨迹移到当前被标目标脚下,保留剩余时长 */
  moveOldest?: true;
  /** 花圃:满印时把相连地面合并为一次花开 */
  bloom?: { radius: number; damageMult: number; maxTargets: number };
  /** 孤花:对当前目标两次延迟花开,各 damageShare,死亡取消余击 */
  doubleBloom?: { delay: number; damageShare: number };
}

export interface FanNodePatch {
  /** 折返:过载扇区末端折回,去回共享每束一次伤害额度 */
  return?: true;
  /** 交织:8 束均分到 split 个扇区(当前只取 2) */
  split?: number;
  /** 交替扇轴:每次过载后扇区旋转 rotateDeg 度 */
  rotateDeg?: number;
  /** 拦网:优先朝近身威胁扇射,单靶归中 */
  intercept?: true;
  /** 风暴轮毂:8 束分两波,间隔 delay 秒,第二波追踪存活密群 */
  twoWave?: { delay: number; damageShare: number };
  /** 环卫轮毂:以自身为轴先后扫前后半圆,各 4 束 */
  frontBack?: true;
}

export interface MarkNodePatch {
  /** 接印:换靶时允许携带至多 carry 印 */
  carry?: number;
  /** 侧晶:爆破向侧翼补一枚无印冰屑,damageMult = 爆伤倍率 */
  sideShard?: { damageMult: number; targets: number };
  /** 折射棱镜:贯穿到第二靶时把末束折向最近未命中靶 */
  refract?: true;
  /** 定焦镜:后排印改存首靶一次备用印,单轮最多 +spare */
  spare?: number;
  /** 冰晶裁决:冰锥改为延迟贯线,pierce = 穿透靶数,falloff = 后段伤害份额 */
  pierceLine?: { delay: number; pierce: number; falloff: number };
  /** 封晶裁决:冰锥驻留 delay 秒后击中同靶,不存在则落点半额 */
  stationary?: { delay: number; halfIfMoved: boolean };
}

export interface WolfNodePatch {
  /** 夹猎:两狼从敌人左右 flank px 夹击 */
  flank?: number;
  /** 护主:一狼先守主人 guard px */
  guard?: number;
  /** 头狼接令:扑击后 seconds 秒共享焦点,原靶死则接最近精英 */
  focus?: { seconds: number; retargetElite: boolean };
  /** 护卫接令:头狼从主人向外截击第一个近敌 */
  intercept?: true;
  /** 合围猎场:两狼之间生成猎线,穿线敌分摊 damage 点,最多 maxTargets 靶 */
  huntLine?: { width: number; damage: number; maxTargets: number };
  /** 逐猎终形:头狼扑向下一个活靶;仅一靶则原地返扑 */
  repounce?: true;
}

export interface ShadeNodePatch {
  /** 巡演:入场改在最远可见敌前方 */
  tour?: true;
  /** 定场:新影在上一个舞台附近落位,索敌 radius */
  stage?: { radius: number };
  /** 双舞台:谢幕点之间出现宽 width 连线,与圆圈共享命中集合 */
  link?: { width: number; damageShare: number };
  /** 压轴独奏:合并舞台到精英位置 */
  focus?: true;
  /** 终场返照:两幕间隔 delay 秒,各 damageShare,第二幕重选存活敌 */
  doubleAct?: { delay: number; damageShare: number };
  /** 终场定格:一次结算,落点留 duration 秒减速,免控 Boss 仅受原伤 */
  slow?: { duration: number; factor: number };
}

export interface BuildPatch {
  nova?: NovaNodePatch;
  trail?: TrailNodePatch;
  fan?: FanNodePatch;
  mark?: MarkNodePatch;
  wolf?: WolfNodePatch;
  shade?: ShadeNodePatch;
  loop?: BranchLoopPatch;
}

/* ---------- 表对象 ---------- */

export interface HeroBuildProfile {
  heroId: HeroId;
  branchChapter: number;
  nodeChapters: readonly [number, number, number];
}

export interface BuildBranchDef {
  id: string;
  heroId: HeroId;
  side: BuildSide;
  /** 对应的分岔技能 id(必须存在于 heroSkills 表) */
  skillId: string;
  name: string;
  desc: string;
  loop: BranchLoopPatch;
}

export interface BuildNodeDef {
  id: string;
  heroId: HeroId;
  branchId: string;
  tier: BuildTier;
  option: 1 | 2;
  name: string;
  desc: string;
  patch: BuildPatch;
}

/** 一张开章二选一的卡(模型层只读,不重新拼文案) */
export interface BuildOption {
  id: string;
  name: string;
  desc: string;
  tag: string;
  branchId: string;
  tier?: BuildTier;
}

export type BuildStep =
  | { kind: "branch"; options: readonly BuildOption[] }
  | { kind: "node"; tier: BuildTier; options: readonly BuildOption[] };

/* ---------- 本局运行时(只存本局,不落存档) ---------- */

export interface BuildMarkState {
  stacks: number;
  /** 最后一次有效命中的局内时间(秒,`Player.buildTime`) */
  lastAt: number;
  /** 定焦镜存下的备用印(0 / 1) */
  spare: number;
}

export interface BuildTrailMarkState {
  stacks: number;
  /** 最后一次在迹上的时间 */
  lastAt: number;
}

export interface BuildWolfState {
  targetId: number;
  /** 左右狼各自最后一次未配对命中时间(-1 = 无) */
  lAt: number;
  rAt: number;
  /** 已成对猎记(0–3) */
  marks: number;
  /** 最后一次成对时间(脱战衰减的起点) */
  lastPairAt: number;
  /** 头狼到期时间 */
  alphaUntil: number;
  /** 头狼共享焦点到期时间与目标 */
  focusUntil: number;
  focusTargetId: number;
}

export interface BuildShadeState {
  acts: number;
  /** 下一次定拍倒计时(秒) */
  timer: number;
  /** 谢幕 ICD 剩余 */
  cd: number;
  /** 上一次舞台落点(定场用) */
  lastX: number;
  lastY: number;
  hasStage: boolean;
}

export interface BuildRuntime {
  /** 凯尔 A:过载 0–100 */
  overload: number;
  /** 合并窗开启时间(-1 = 未开) */
  overloadWindowAt: number;
  /** 合并窗内命中的不同目标 id */
  overloadWindowTargets: number[];
  /** 过载包 ICD 剩余(秒) */
  overloadCd: number;
  /** 凯尔 B:每靶冰印 */
  marks: Record<number, BuildMarkState>;
  /** 薇拉 B:每靶踏迹印 */
  trailMarks: Record<number, BuildTrailMarkState>;
  /** 薇拉 B:爆种滚动窗(最近 1s 的时间戳) */
  trailBoomAt: number[];
  /** 薇洛 A:双狼配对 */
  wolf: BuildWolfState | null;
  /** 薇洛 B:亡影幕 */
  shade: BuildShadeState | null;
  /** 凯尔 B:满印后待发的冰锥(landing = 封晶裁决的驻留点) */
  pendingIcicle: { targetId: number; at: number; x: number; y: number } | null;
  /** 薇拉 A:双向反刺 / 延迟段的待结算新星 */
  pendingNova: { at: number; x: number; y: number; radius: number; damage: number; sourceId: string; maxTargets: number }[];
  /** 凯尔 A:折返 / 两波 / 后段扇射 */
  pendingFan: { at: number; x: number; y: number; angle: number; count: number; damage: number; speed: number; pierce: number; arc: number; sourceId: string; kind: "ray" | "knife" }[];
  /** 薇洛 B:终场返照的第二幕 */
  pendingShade: { at: number; x: number; y: number; damage: number; radius: number; maxTargets: number; slow: boolean }[];
  /** 凯尔 A:过载扇区累计旋转角(交替扇轴) */
  overloadSpin: number;
  /** 凯尔 B:本轮已记印的目标(同轮同靶只记一次) */
  markRound: number[];
  /** 薇洛 A:合围猎线到期时间(0 = 无) */
  huntLineUntil: number;
  /** 薇拉 B:移动铺迹的余程累计(px) */
  moveAccum: number;
}

export function createBuildRuntime(): BuildRuntime {
  return {
    overload: 0,
    overloadWindowAt: -1,
    overloadWindowTargets: [],
    overloadCd: 0,
    marks: {},
    trailMarks: {},
    trailBoomAt: [],
    wolf: null,
    shade: null,
    pendingIcicle: null,
    pendingNova: [],
    pendingFan: [],
    pendingShade: [],
    overloadSpin: 0,
    markRound: [],
    huntLineUntil: 0,
    moveAccum: 0,
  };
}

/* ---------- 三原型 profile ---------- */

const PROFILES: readonly HeroBuildProfile[] = [
  { heroId: "vera", branchChapter: BUILD_BRANCH_CHAPTER, nodeChapters: BUILD_NODE_CHAPTERS },
  { heroId: "kyle", branchChapter: BUILD_BRANCH_CHAPTER, nodeChapters: BUILD_NODE_CHAPTERS },
  { heroId: "willow", branchChapter: BUILD_BRANCH_CHAPTER, nodeChapters: BUILD_NODE_CHAPTERS },
];

const PROFILE_BY_HERO = new Map<HeroId, HeroBuildProfile>(PROFILES.map((p) => [p.heroId, p]));

export function buildProfile(heroId: HeroId | null | undefined): HeroBuildProfile | null {
  return heroId ? PROFILE_BY_HERO.get(heroId) ?? null : null;
}

/** 该英雄是否走章节节点层(9 位 legacy 英雄 = false,继续 5–8 级升级分岔) */
export function hasChapterBuild(heroId: HeroId | null | undefined): boolean {
  return buildProfile(heroId) !== null;
}

/* ---------- 六条路线 ---------- */

export const BUILD_BRANCHES: readonly BuildBranchDef[] = [
  {
    id: "vera.a", heroId: "vera", side: "a", skillId: "vera_armor", name: "荆棘堡垒",
    desc: "荆甲:满 6 层付 3,追加一次向内收缩的刺圈;护盾与圆环都改成在来袭者脚下",
    loop: { stackConsume: { atStacks: 6, consume: 3, damageMult: 0.45, radiusMult: 0.6, maxTargets: 6 } },
  },
  {
    id: "vera.b", heroId: "vera", side: "b", skillId: "vera_walker", name: "血棘行者",
    desc: "棘行者:圆环落点留迹,踏迹叠 3 印;满印爆种,移动每 120px 再铺一块旧轨迹",
    loop: {
      trailImprint: {
        markPerSec: 1, maxMarks: 3, clearAfter: 4, maxTargets: 8,
        detonateAt: 3, detonateBaseDamage: 50, detonateDamageMult: 0.6, detonateRadius: 75, detonateMaxTargets: 4, detonateMaxPerSec: 2,
        trailMax: 4, moveTrailEvery: 120, moveTrailDps: 20, moveTrailRadius: 56, moveTrailDuration: 2.5,
      },
    },
  },
  {
    id: "kyle.a", heroId: "kyle", side: "a", skillId: "kyle_overload", name: "弹幕风暴",
    desc: "连杀节律;每轮有效命中开合并窗蓄过载,满 100 卸 8 束扇射;额外齐射不积过载",
    loop: { overload: { windowSec: 0.12, base: 8, perTarget: 3, perRoundMax: 20, cap: 100, burstSpread: 8, burstDamageMult: 0.5, icd: 3.6, fanDeg: 60 } },
  },
  {
    id: "kyle.b", heroId: "kyle", side: "b", skillId: "kyle_hunter", name: "冰晶狙猎",
    desc: "移动节律;基础轮 3 束同向,同轮同靶一次印,6 印剥离成单靶冰锥",
    loop: { marksB: { firstMark: 2, backMark: 1, cap: 6, expireSec: 4, detonateAt: 6, detonateProjectiles: 1, detonateDamageMult: 2, baseSpread: 3, targetMax: 3 } },
  },
  {
    id: "willow.a", heroId: "willow", side: "a", skillId: "willow_wolves", name: "狼群统帅",
    desc: "两狼同靶配对 3 记,头狼突袭;目标死亡清未配对命中,已成记保留",
    loop: { wolfPair: { pairWindow: 1.2, marksToAlpha: 3, alphaSec: 3, pounceMult: 2, markDecayDelay: 5, markDecayPerSec: 1 } },
  },
  {
    id: "willow.b", heroId: "willow", side: "b", skillId: "willow_shades", name: "亡影剧团",
    desc: "亡影替代职业狼槽;定拍入场与自然退场攒四幕,满幕谢幕",
    loop: { shadeTroupe: { interval: 3, maxShades: 2, actsToCurtain: 4, curtainIcd: 6, curtainRadius: 90, curtainBaseDamage: 42, curtainDamageMult: 1, curtainMaxTargets: 6, shadeTtl: 4, shadeDamageMult: 1, shadeMaxTargets: 3 } },
  },
];

const BRANCH_BY_ID = new Map(BUILD_BRANCHES.map((b) => [b.id, b]));

export function buildBranch(id: string | null | undefined): BuildBranchDef | null {
  return id ? BRANCH_BY_ID.get(id) ?? null : null;
}

export function buildBranches(heroId: HeroId | null | undefined): readonly BuildBranchDef[] {
  return BUILD_BRANCHES.filter((b) => b.heroId === heroId);
}

/** 分岔技能 id → 路线(Armor/Walker 等 legacy 选支也能反查) */
export function buildBranchOfSkill(skillId: string | null | undefined): BuildBranchDef | null {
  if (!skillId) return null;
  for (const b of BUILD_BRANCHES) if (b.skillId === skillId) return b;
  return null;
}

/* ---------- 36 个节点 ---------- */

export const BUILD_NODES: readonly BuildNodeDef[] = [
  /* 薇拉 A:荆棘堡垒 */
  {
    id: "vera_a_4_guard", heroId: "vera", branchId: "vera.a", tier: 1, option: 1, name: "回护",
    desc: "强化圈结算时给自身 8 点盾,持续 4 秒;同源取大刷新",
    patch: { nova: { shield: { amount: 8, sec: 4 } } },
  },
  {
    id: "vera_a_4_line", heroId: "vera", branchId: "vera.a", tier: 1, option: 2, name: "穿棘",
    desc: "强化圈改成朝来袭者刺出的 160px 直线,最多 3 靶",
    patch: { nova: { line: { length: 160, width: 40, damageMult: 1, maxTargets: 3 } } },
  },
  {
    id: "vera_a_8_echo", heroId: "vera", branchId: "vera.a", tier: 2, option: 1, name: "双向反刺",
    desc: "强化圈收拢后反向再结算一次,两段平分原预算",
    patch: { nova: { echo: { delay: 0.25, damageMult: 0.5, radiusMult: 1, maxTargets: 6 } } },
  },
  {
    id: "vera_a_8_anchor", heroId: "vera", branchId: "vera.a", tier: 2, option: 2, name: "截阵",
    desc: "把刺圈放在下一名逼近者脚下;1 秒内没出现则回到当前靶",
    patch: { nova: { anchorNext: { window: 1 } } },
  },
  {
    id: "vera_a_12_wall", heroId: "vera", branchId: "vera.a", tier: 3, option: 1, name: "城垣合围",
    desc: "强化圈留下 2 秒城垣,首次越界者承受余刺",
    patch: { nova: { wall: { duration: 2, radiusMult: 1, damageMult: 0.5 } } },
  },
  {
    id: "vera_a_12_move_wall", heroId: "vera", branchId: "vera.a", tier: 3, option: 2, name: "移动城垣",
    desc: "同预算城垣跟随自身,半径为固定城垣的 0.7 倍",
    patch: { nova: { wall: { duration: 2, radiusMult: 0.7, damageMult: 0.5, follow: true, followRadiusMult: 0.7 } } },
  },

  /* 薇拉 B:血棘行者 */
  {
    id: "vera_b_4_root", heroId: "vera", branchId: "vera.b", tier: 1, option: 1, name: "扎根",
    desc: "无邻敌时,续迹改为跟靶 1 秒",
    patch: { trail: { follow: { seconds: 1 } } },
  },
  {
    id: "vera_b_4_seed", heroId: "vera", branchId: "vera.b", tier: 1, option: 2, name: "播种",
    desc: "有邻敌的爆种向最近一靶送 1 印(100px),不触发当拍结算",
    patch: { trail: { seed: { radius: 100, marks: 1 } } },
  },
  {
    id: "vera_b_8_link", heroId: "vera", branchId: "vera.b", tier: 2, option: 1, name: "接续棘径",
    desc: "最近两块迹连成一条可叠印窄带:宽 24px、长 ≤160px",
    patch: { trail: { link: { width: 24, maxLength: 160 } } },
  },
  {
    id: "vera_b_8_move", heroId: "vera", branchId: "vera.b", tier: 2, option: 2, name: "折枝",
    desc: "把最老轨迹移到当前被标目标脚下,保留原剩余时长",
    patch: { trail: { moveOldest: true } },
  },
  {
    id: "vera_b_12_bloom", heroId: "vera", branchId: "vera.b", tier: 3, option: 1, name: "血棘花圃",
    desc: "满印时把相连地面合并为一次花开:120px,共享爆种伤害预算",
    patch: { trail: { bloom: { radius: 120, damageMult: 1, maxTargets: 4 } } },
  },
  {
    id: "vera_b_12_double", heroId: "vera", branchId: "vera.b", tier: 3, option: 2, name: "孤花",
    desc: "改为对当前目标两次延迟 0.3 秒的花开,各半额;死亡取消余击",
    patch: { trail: { doubleBloom: { delay: 0.3, damageShare: 0.5 } } },
  },

  /* 凯尔 A:弹幕风暴 */
  {
    id: "kyle_a_4_return", heroId: "kyle", branchId: "kyle.a", tier: 1, option: 1, name: "折返",
    desc: "过载扇区末端折回,去回共享每束一次伤害额度",
    patch: { fan: { return: true } },
  },
  {
    id: "kyle_a_4_weave", heroId: "kyle", branchId: "kyle.a", tier: 1, option: 2, name: "交织",
    desc: "8 束均分到左右两个扇区",
    patch: { fan: { split: 2 } },
  },
  {
    id: "kyle_a_8_rotate", heroId: "kyle", branchId: "kyle.a", tier: 2, option: 1, name: "交替扇轴",
    desc: "每次过载后扇区旋转 45 度,基础轮补扫原扇区",
    patch: { fan: { rotateDeg: 45 } },
  },
  {
    id: "kyle_a_8_intercept", heroId: "kyle", branchId: "kyle.a", tier: 2, option: 2, name: "拦网",
    desc: "优先朝近身威胁扇射;单靶时归中",
    patch: { fan: { intercept: true } },
  },
  {
    id: "kyle_a_12_two_wave", heroId: "kyle", branchId: "kyle.a", tier: 3, option: 1, name: "风暴轮毂",
    desc: "8 束分两波,间隔 0.25 秒;第二波追踪存活密群",
    patch: { fan: { twoWave: { delay: 0.25, damageShare: 0.5 } } },
  },
  {
    id: "kyle_a_12_front_back", heroId: "kyle", branchId: "kyle.a", tier: 3, option: 2, name: "环卫轮毂",
    desc: "以自身为轴先后扫前后半圆,各 4 束",
    patch: { fan: { frontBack: true } },
  },

  /* 凯尔 B:冰晶狙猎 */
  {
    id: "kyle_b_4_carry", heroId: "kyle", branchId: "kyle.b", tier: 1, option: 1, name: "接印",
    desc: "换靶时允许携带至多 2 印;自然死亡不重复转",
    patch: { mark: { carry: 2 } },
  },
  {
    id: "kyle_b_4_side", heroId: "kyle", branchId: "kyle.b", tier: 1, option: 2, name: "侧晶",
    desc: "爆破将一枚无印冰屑射向侧翼:0.25×爆破伤、1 靶",
    patch: { mark: { sideShard: { damageMult: 0.25, targets: 1 } } },
  },
  {
    id: "kyle_b_8_refract", heroId: "kyle", branchId: "kyle.b", tier: 2, option: 1, name: "折射棱镜",
    desc: "贯穿到第二靶时,把末束折向最近未命中靶",
    patch: { mark: { refract: true } },
  },
  {
    id: "kyle_b_8_spare", heroId: "kyle", branchId: "kyle.b", tier: 2, option: 2, name: "定焦镜",
    desc: "后排印改存首靶一次备用印,单轮最多 +1;满印结算后才能用",
    patch: { mark: { spare: 1 } },
  },
  {
    id: "kyle_b_12_pierce", heroId: "kyle", branchId: "kyle.b", tier: 3, option: 1, name: "冰晶裁决",
    desc: "冰锥改为延迟 0.4 秒的贯线,可穿 3 靶;首靶全额、后两靶各 1/4",
    patch: { mark: { pierceLine: { delay: 0.4, pierce: 3, falloff: 0.25 } } },
  },
  {
    id: "kyle_b_12_stationary", heroId: "kyle", branchId: "kyle.b", tier: 3, option: 2, name: "封晶裁决",
    desc: "冰锥驻留原位 0.8 秒后击中同靶;不存在则落点半额一次",
    patch: { mark: { stationary: { delay: 0.8, halfIfMoved: true } } },
  },

  /* 薇洛 A:狼群统帅 */
  {
    id: "willow_a_4_flank", heroId: "willow", branchId: "willow.a", tier: 1, option: 1, name: "夹猎",
    desc: "两狼从敌人左右 50px 夹击;遇障碍则走近侧",
    patch: { wolf: { flank: 50 } },
  },
  {
    id: "willow_a_4_guard", heroId: "willow", branchId: "willow.a", tier: 1, option: 2, name: "护主",
    desc: "一狼先守主人 60px;敌人进入 100px 仍与另一狼配对",
    patch: { wolf: { guard: 60 } },
  },
  {
    id: "willow_a_8_focus", heroId: "willow", branchId: "willow.a", tier: 2, option: 1, name: "头狼接令",
    desc: "扑击后 3 秒共享焦点;原靶死则接最近精英",
    patch: { wolf: { focus: { seconds: 3, retargetElite: true } } },
  },
  {
    id: "willow_a_8_intercept", heroId: "willow", branchId: "willow.a", tier: 2, option: 2, name: "护卫接令",
    desc: "头狼改从主人向外截击第一个近敌",
    patch: { wolf: { intercept: true } },
  },
  {
    id: "willow_a_12_hunt_line", heroId: "willow", branchId: "willow.a", tier: 3, option: 1, name: "合围猎场",
    desc: "两狼之间生成 2 秒猎线;穿线敌分摊 28 点追加伤,最多 3 靶",
    patch: { wolf: { huntLine: { width: 24, damage: 28, maxTargets: 3 } } },
  },
  {
    id: "willow_a_12_repounce", heroId: "willow", branchId: "willow.a", tier: 3, option: 2, name: "逐猎终形",
    desc: "头狼扑向下一个活靶;仅一靶则原地返扑,两段各 14 点",
    patch: { wolf: { repounce: true } },
  },

  /* 薇洛 B:亡影剧团 */
  {
    id: "willow_b_4_tour", heroId: "willow", branchId: "willow.b", tier: 1, option: 1, name: "巡演",
    desc: "每次入场改在最远可见敌前方",
    patch: { shade: { tour: true } },
  },
  {
    id: "willow_b_4_stage", heroId: "willow", branchId: "willow.b", tier: 1, option: 2, name: "定场",
    desc: "新影在上一个舞台附近落位,索敌半径 120px",
    patch: { shade: { stage: { radius: 120 } } },
  },
  {
    id: "willow_b_8_link", heroId: "willow", branchId: "willow.b", tier: 2, option: 1, name: "双舞台",
    desc: "谢幕点之间出现宽 24px 连接线,与圆圈共享命中集合",
    patch: { shade: { link: { width: 24, damageShare: 0.5 } } },
  },
  {
    id: "willow_b_8_focus", heroId: "willow", branchId: "willow.b", tier: 2, option: 2, name: "压轴独奏",
    desc: "合并舞台到精英位置,牺牲连线换定向落点",
    patch: { shade: { focus: true } },
  },
  {
    id: "willow_b_12_replay", heroId: "willow", branchId: "willow.b", tier: 3, option: 1, name: "终场返照",
    desc: "两幕间隔 0.4 秒结算,各半额;第二幕重选存活敌",
    patch: { shade: { doubleAct: { delay: 0.4, damageShare: 0.5 } } },
  },
  {
    id: "willow_b_12_freeze", heroId: "willow", branchId: "willow.b", tier: 3, option: 2, name: "终场定格",
    desc: "一次结算,落点留 1 秒减速帷幕;免控 Boss 仅受原伤",
    patch: { shade: { slow: { duration: 1, factor: 0.5 } } },
  },
];

const NODE_BY_ID = new Map(BUILD_NODES.map((n) => [n.id, n]));

export function buildNode(id: string | null | undefined): BuildNodeDef | null {
  return id ? NODE_BY_ID.get(id) ?? null : null;
}

export function buildNodes(heroId: HeroId | null | undefined): readonly BuildNodeDef[] {
  return BUILD_NODES.filter((n) => n.heroId === heroId);
}

export function nodeOptions(heroId: HeroId | null | undefined, branchId: string, tier: BuildTier): readonly BuildNodeDef[] {
  return BUILD_NODES.filter((n) => n.heroId === heroId && n.branchId === branchId && n.tier === tier);
}

/* ---------- 开章挂起(纯函数;世界层与测试共用) ---------- */

function branchOptions(heroId: HeroId): BuildOption[] {
  return buildBranches(heroId).map((b) => ({
    id: b.id, name: b.name, desc: b.desc, tag: "本局锁定", branchId: b.id,
  }));
}

function nodeBuildOptions(heroId: HeroId, branchId: string, tier: BuildTier): BuildOption[] {
  return nodeOptions(heroId, branchId, tier).map((n) => ({
    id: n.id, name: n.name, desc: n.desc, tag: "本层锁定", branchId, tier,
  }));
}

/**
 * 当前章该挂起哪一步:
 *  - 未选路线且已到第 2 章 → 分岔(错过会在后续章补);
 *  - 已选路线且有未选的层(按 4/8/12 顺序)→ 节点;
 *  - 否则 null。
 * 纯函数:世界层只在 `nextChapter` 调一次,不逐帧重算。
 */
export function buildStepFor(
  heroId: HeroId | null | undefined,
  chapter: number,
  branchId: string | null,
  nodes: readonly (string | null)[],
): BuildStep | null {
  const p = buildProfile(heroId);
  if (!p || !heroId) return null;
  if (!branchId) {
    if (chapter >= p.branchChapter) return { kind: "branch", options: branchOptions(heroId) };
    return null;
  }
  const branch = buildBranch(branchId);
  if (!branch) return null;
  for (let i = 0; i < p.nodeChapters.length; i++) {
    const tier = (i + 1) as BuildTier;
    if (chapter >= p.nodeChapters[i] && !nodes[i]) {
      return { kind: "node", tier, options: nodeBuildOptions(heroId, branchId, tier) };
    }
  }
  return null;
}

/* ---------- 合并(分支 loop → 节点 patch → 共鸣由调用方追加) ---------- */

function mergeGroup<T extends object>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

/** 本局已选节点的合并 patch(按 4 → 8 → 12 顺序;未选层跳过) */
export function selectedBuildPatch(nodes: readonly (string | null)[]): BuildPatch | null {
  let out: BuildPatch | null = null;
  for (const id of nodes) {
    const n = buildNode(id);
    if (n) out = mergeBuildPatch(out, n.patch);
  }
  return out;
}

/** 节点 patch 深合并(组内后写覆盖);不修改入参 */
export function mergeBuildPatch(a: BuildPatch | null | undefined, b: BuildPatch | null | undefined): BuildPatch | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    nova: mergeGroup(a.nova, b.nova),
    trail: mergeGroup(a.trail, b.trail),
    fan: mergeGroup(a.fan, b.fan),
    mark: mergeGroup(a.mark, b.mark),
    wolf: mergeGroup(a.wolf, b.wolf),
    shade: mergeGroup(a.shade, b.shade),
    loop: mergeGroup(a.loop, b.loop),
  };
}
