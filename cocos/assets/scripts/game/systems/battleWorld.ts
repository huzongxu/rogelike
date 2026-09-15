/**
 * 战斗世界 —— 平台无关的战场推进与战斗结算层(Web 与 Cocos 共用单一事实源)。
 *
 * 职责:持有战场实体数组并按固定顺序推进一帧,并完成命中/击杀/掉落/章节节奏的结算。
 * 不职责:存档读写与持久化、屏幕状态机、商店货品生成、通关/死亡入账、广告闸门、
 *         引导步骤推进、以及一切"画"的动作 —— 这些留在宿主。
 *
 * 宿主能力全部构造注入(见 BattleRunInputs / BattleWorldHost):
 *  - 局外配置走 BattleRunInputs 的取值函数(宿主从各自存档派生,数组会被整体替换,
 *    所以必须现取而非传引用);
 *  - 世界边界事件(玩家倒下 / 章间商店 / 通关 / 判负)通过 BattleWorldHost 回报,
 *    由宿主完成入账与转场。
 *
 * 实体数组一律原地 mutate(词缀引擎 BattleContext 捕获的是数组引用,重新赋值会让引擎
 * 看到陈旧数组);本文件不 import cc,也不触碰任何 DOM / Canvas 类型。
 *
 * 一帧顺序(与宿主 update 的战斗路径逐项对齐):
 * player → 连杀/狂潮/反伤预算计时 → globalPulseMult → 引擎 → 敌人 → 预警 → 弹道 →
 * 领域云 → 召唤物 → 金币 → 波次 → 章节计时 → Boss 生成与通关判定 → fx/dmgNum 衰减 →
 * 敌人上限裁剪。
 */

import { type Vec2, vec2, clamp, rand } from "../core/math";
import { Player, PLAYER_BASE } from "../entities/player";
import {
  spawnEnemy,
  randomEnemyKind,
  updateEnemy,
  updateSpecial,
  updateBoss,
  updateSkill,
  applySlow,
  knockback,
  reflectDamage,
  shieldguardDamageMult,
  splitBabies,
  skillSplitBabies,
  deathSummonSpecs,
  auraMultAt,
  tryRevive,
  BOSS_SLAM,
  bossHpMult,
  type Enemy,
  type SkillTelegraph,
} from "../entities/enemy";
import { type Projectile, updateProjectile, projectileHits, steerHoming } from "../entities/projectile";
import {
  type Cloud,
  type Minion,
  type Gem,
  type Obstacle,
  spawnCloud,
  spawnGem,
  rollChapterObstacles,
  pushOutOfPillar,
  isInPool,
  mergeGemOverflow,
  spawnBurnPool,
  tickObstacleTtl,
  OBSTACLE,
} from "../entities/objects";
import { EquipmentEngine, type BattleContext, type Fx } from "./equipmentEngine";
import { WaveManager, seasonMonsterDefFor, type ArenaRect } from "./waves";
import type { GuideCtx } from "./onboarding";
import { BOSS_WEAK_HP_MULT } from "../data/enemies";
import {
  CONTACT_HIT_CD,
  COMBO_WINDOW,
  COMBO_FRENZY_EVERY,
  FRENZY_DURATION,
  FRENZY_PULSE_MULT,
  REFLECT_BUDGET_HP_PCT,
  THORN_HEAL_PCT,
  GOLD_PER_XP,
  BOSS_GOLD,
  ELITE_GEM_COUNT,
  DROP_SCATTER,
  GEM_PICK_RADIUS_BONUS,
  GEM_MAGNET_RADIUS,
  MINION_SIGHT,
  MINION_ATTACK_RANGE,
  MINION_HIT_KNOCKBACK,
  MINION_HEAL_ON_HIT_PCT,
  MINION_FOLLOW_LEASH,
  REVIVE_SHIELD_SECONDS,
  REVIVE_CLEAR_RADIUS,
  BOSS_SPAWN_OFFSET_X,
  BOSS_SPAWN_OFFSET_Y,
  BOSS_SPAWN_INSET,
} from "../data/combat";
import { collectionBonus, dailyTalentOf } from "../data/daily";
import { CHAPTER_SECONDS, CHAPTERS_PER_STAGE, stageClearedAtFinalChapter, type StageDef } from "../data/stages";
import { chapterTypeInfo, chapterTypeOf, ELITE_ENTER_BANNER, ELITE_INTEL_DELAY_SEC } from "../data/chapters";
import { chapterIntel } from "../data/intel";
import {
  deathChainDamage,
  REFLECT_FIELD_RATE,
  HEAL_AURA_RATE,
  TIME_DILATION_MULT,
  MIST_CYCLE,
  MIST_VISIBLE,
  DEATH_CHAIN_RADIUS,
  DEATH_CHAIN_KNOCKBACK,
  type EnvAffixType,
} from "../data/envAffixes";
import { setDef, type SetId } from "../data/sets";
import { comboStates } from "../data/combos";
import { setMutation } from "../data/seasonSets";
import {
  buildHasThorn,
  buildHasHeal,
  condemnedMultOf,
  equipmentDisplayName,
  equipmentHasThornTrigger,
  equipmentResonance,
  makeSkillEquipment,
  normalizeArtifact,
  skillTriggers,
  passiveCondemnedMult,
  resonanceBonusState,
  skillResonant,
  type Equipment,
} from "../data/equipmentGen";
import { coreSkillOf, heroSkillDef } from "../data/heroSkills";
import { AI_PROFILE_PARAMS, heroAiProfile, heroRhythm, heroRhythmOptions, rhythmDef, type AiProfile, type RhythmId } from "../data/rhythm";
import { heroOfSetOrNull, type HeroId } from "../data/heroes";
import { DISCOVERY, RELIC_VALUES, isSeasonFeatured, relicStack } from "../data/artifacts";
import { qualityUpgrade, type Quality } from "../data/quality";
import {
  cdrScaleFor,
  critFor,
  globalDamageMultFor,
  desperateMultFor,
  elementalMultFor,
  maxHpMultFor,
  startShieldFor,
  slotBonusFor,
  passiveSlotBonusFor,
  firstXpScaleFor,
  autoPickupFor,
  TALENT_VALUES,
  type TalentId,
} from "../data/talents";
import { hexA } from "../ui/theme";
import { HUD_BOT_H, battleBandY } from "../ui/hud";

/** 实体上限(保证小游戏性能;弹幕 420 = 组合技分裂子弹 + 品质高频标定值;金币堆 420 与"溢出不丢钱"的并入逻辑配套) */
export const LIMITS = { enemies: 340, projectiles: 420, clouds: 44, minions: 24, gems: 420 };
/** 换章时召唤物在玩家周围的散布边长(px):跟主人回场心,不叠在一点上;依据 R11 章首保留召唤物 */
export const MINION_CARRY_SPREAD = 80;

/** 伤害飘字上限(同屏超出即淘汰最早一枚) */
const DMG_NUM_CAP = 200;

/**
 * 原地移除满足条件的元素。
 * 注意:不能用 arr = arr.filter(...) 重新赋值 —— 词缀引擎的 BattleContext 持有数组的
 * 原始引用,重新赋值会让引擎看到陈旧数组(飞刀打不进新数组、引擎看不到新敌人)。
 */
function removeIf<T>(arr: T[], pred: (x: T) => boolean): void {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) arr.splice(i, 1);
  }
}

/** 伤害/治疗/暴击飘字记录(pos 已含抖动偏移;ttl 由 tickDmg 推进) */
export interface DmgNum {
  pos: Vec2;
  value: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

/* ================= 特效原语桥 ================= */

/** 粒子簇发射参数(与宿主 fxLayer.burst 同形;数值见各发射点) */
export interface FxBurstOpts {
  x: number;
  y: number;
  count: number;
  color: string;
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  halo?: number;
  angle?: [number, number];
  spread?: number;
  drag?: number;
  gravity?: number;
  endScale?: number;
  orbit?: { cx: number; cy: number };
}

/** 冲击环发射参数 */
export interface FxRingOpts {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  color: string;
  width?: number;
  fill?: boolean;
}

/**
 * 特效发射桥 —— 宿主把自己的 fxLayer 实例注入即可:
 * Web = src/core/fxLayer.ts 的 FxLayer(内含 Canvas2D 绘制),Cocos = battle/FxCore.ts 的 FxLayerData(纯数据)。
 * 本层只发请求并逐帧 tick,绝不读取绘制结果。
 */
export interface FxBridge {
  burst(o: FxBurstOpts): void;
  ring(o: FxRingOpts): void;
  trail(x: number, y: number, color: string, size: number, life: number, halo?: number, drift?: number): void;
  addShake(px: number): void;
  tick(dt: number): void;
  reset(): void;
}

/* ================= 移动输入 ================= */

/** 移动输入通道(宿主摇杆/键盘实现;语义 = isMoving + 归一化 moveDir) */
export interface MoveInput {
  readonly isMoving: boolean;
  readonly moveDir: Vec2;
}

/* ================= 局外配置(宿主从各自存档派生) ================= */

/**
 * 出战一局所需的全部局外输入。全部为取值函数:宿主存档里的数组/对象在每日重置、
 * 赛季翻页、天赋购买时会被整体替换,传引用会读到陈旧值,必须每帧现取。
 * 本接口只声明世界推进实际读取/回写的字段,不复制存档结构。
 */
export interface BattleRunInputs {
  /** 已拥有天赋(增伤/暴击/CDR/元素精通/绝境/槽位/首级经验/开局护盾/自动拾取 的输入) */
  ownedTalents(): TalentId[]
  /** 天赋是否已拥有 */
  owns(id: TalentId): boolean
  /** 收藏装备清单(图鉴基础数值输入) */
  ownedGear(): Equipment[]
  /** 收藏装备外侧强化等级(键 = 装备名) */
  gearLevels(): Record<string, number>
  /** 今日已领取的每日天赋 id */
  dailyTalentClaimed(): string[]
  /** 赛季序号(主题怪/本章敌情/套组联动的输入) */
  seasonId(): number
  /** 本局出战套组(null = 通用卡池) */
  selectedSet(): SetId | null
  /**
   * 本局出战英雄(docs/DESIGN-HERO-RHYTHM.md:本命节律与独有技能池的键)。可选:老宿主 / 老测试不给时
   * 由 selectedSet 反查(英雄 ≡ 套组双射),都没有 = 未选英雄(通用职业包 + 周期节律)。
   */
  selectedHero?(): HeroId | null
  /** 本局选用的本命节律(S2 第二本命;null / 不给 = 表内本命;不在该英雄可选集里的值被忽略) */
  startRhythm?(): RhythmId | null
  /** 首次达成某条共鸣 → 图鉴(键 `art:<效果>:<节律>` / `skill:<技能 id>`) */
  recordResonanceSeen?(key: string): void
  /** 开局带入的收藏装备(宿主按 selectedGearId 查表并深拷贝;null = 用初始武器) */
  selectedGearForRun(): Equipment | null
  /** 初始武器(宿主决定蓝图画布效果;无收藏件时使用) */
  makeStarterEquipment(): Equipment
  /** 开局装备覆盖:非 null 时世界直接用该清单,跳过 收藏件 > 套组初始 > 默认初始 优先级(宿主开发演示通道) */
  openingEquipmentOverride(): Equipment[] | null
  /** 首局引导是否已完成/跳过 */
  tutorialDone(): boolean
  /** 引导走完或跳过:宿主标记 tutorialDone 并持久化 */
  onTutorialFinished(): void
  /** 遭遇过某敌人 → 图鉴(基线怪 = kind,赛季主题怪 = variantId) */
  recordEnemySeen(id: string): void
  /** 新装备入图鉴(触发器/效果/修饰器名) */
  recordEquipmentSeen(eq: Equipment): void
  /** 本关打到过的最远章节(进度制解锁依据) */
  recordStageFurthest(stageId: number, chapter: number): void
}

/* ================= 宿主能力与事件回报 ================= */

export interface BattleWorldHost {
  /** 战场标定高(竞技场带 = battleBandY(wh)) */
  worldHeight(): number
  /** 底坞高(可选;v4 双排坞 96,缺省 HUD_BOT_H):竞技场带下缘随之上收 */
  bottomDockH?(): number
  /** 移动输入 */
  readonly input: MoveInput
  /** 特效原语桥(宿主持有实例;本层只发请求 + tick) */
  readonly fx: FxBridge
  /** 一条飘字已生成(记录已入 dmgNums;宿主据此驱动一次性视觉) */
  onDamage(d: DmgNum): void
  /** 玩家倒下:死亡结算、复活屏、广告闸门全部归宿主 */
  onPlayerDown(): void
  /** 章节时间到 → 章间商店(进度已记;宿主决定停等或直接 nextChapter) */
  onChapterShop(): void
  /** 末章且关底结算达成 → 通关(奖励入账归宿主) */
  onStageCleared(): void
  /** 有 Boss 的关末章超时未击杀 → 判负(玩家已被置死,宿主走死亡结算) */
  onStageFailed(): void
  /** Boss 已登场(纯通知,不影响结算) */
  onBossSpawned?(): void
  /** Boss 已被击杀(纯通知) */
  onBossDead?(): void
  /**
   * 玩家升级(纯通知):`levels` 是这一下连升的级数 —— `Player.addXp` 内部是 while 循环,
   * 一次击杀吃下一大笔经验时可能跨多级,而它只返回一个 boolean,故级数由调用侧比对前后等级得出。
   * 升级三选一弹层、弹层的开关与"弹层开着就停住战斗"那道闸门全部归宿主(世界层不暂停自己)。
   */
  onLevelUp?(levels: number): void
}

export interface BattleWorldOptions<F extends FxBridge> {
  inputs: BattleRunInputs;
  host: BattleWorldHost;
  /** 特效原语桥(Web = FxLayer,Cocos = FxLayerData) */
  fxLayer: F;
}

/* ================= 战斗世界 ================= */

export class BattleWorld<F extends FxBridge = FxBridge> {
  /* ---------- 世界状态(宿主视图每帧只读绑定) ---------- */
  player = new Player();
  readonly enemies: Enemy[] = [];
  /** 批 4 技能预警(震击/脉冲/轰炸):实体层触发时生成,本层持有倒计时与引爆 */
  readonly skillTelegraphs: { t: SkillTelegraph; total: number; src: Enemy | null }[] = [];
  readonly projectiles: Projectile[] = [];
  readonly clouds: Cloud[] = [];
  readonly minions: Minion[] = [];
  readonly gems: Gem[] = [];
  /** 特效贴花时间轴(nova/explosion/... 由引擎与击杀事件入队,ttl 推进) */
  readonly fx: Fx[] = [];
  /** 伤害飘字记录 */
  readonly dmgNums: DmgNum[] = [];
  readonly fxLayer: F;
  /** 本章地形:石柱挡路 + 毒/灼烧池 DoT;每章重生成 */
  obstacles: Obstacle[] = [];
  /** 本章竞技场边界 */
  arena: ArenaRect = { x0: 0, y0: 0, x1: 560, y1: 884 };

  readonly engine = new EquipmentEngine();
  waves = new WaveManager();

  /* ---------- 局内统计与标记 ---------- */
  gold = 0;
  kills = 0;
  elapsed = 0;
  chapter = 1;
  chapterTimer = 0;
  totalBought = 0;
  bossSpawned = false;
  bossDead = false;
  /** Boss 阶段横幅(P2/P3 切换提示) */
  bossBanner: { text: string; ttl: number } | null = null;
  /** 共鸣发现横幅(docs/DESIGN-HERO-RHYTHM.md §5:首次达成某条共鸣) */
  discoveryBanner: { text: string; ttl: number } | null = null;
  /** 本章是否已报过「精英入场」横幅(R15;每章一次,nextChapter 复位) */
  private eliteBannerShown = false;
  /** 时停剩余(秒):发现共鸣时战斗停 DISCOVERY.hitStop */
  hitStop = 0;
  /** 本局已达成的共鸣键(横幅只在首次) */
  private resonancesSeen = new Set<string>();
  /** 当前关卡(null = 无限关) */
  currentStage: StageDef | null = null;
  /** 本局环境词缀 */
  envAffixes: EnvAffixType[] = [];
  /** 本局出战套组(开局时从局外配置带入) */
  selectedSet: SetId | null = null;
  /** 自主控制(挂机):手动输入可覆盖 */
  autoMove = true;
  /** 挂机档位(按本命节律,开局写入;见 ../data/rhythm 的 RHYTHM_AI_PROFILE) */
  aiProfile: AiProfile = "kite";
  /** 一局是否已开始 */
  started = false;
  /** 本局是否已结束(宿主在死亡/通关结算时置位;宿主推进闸门) */
  over = false;
  /** 本局已用复活次数(通关星数判定输入) */
  reviveUsed = 0;

  /* ---------- 连杀/反伤/毒池计时 ---------- */
  comboCount = 0;
  comboTimer = 0;
  frenzyTimer = 0;
  private reflectBudget = 0;
  private reflectTimer = 0;
  private poolTickAcc = 0;

  /* ---------- FX 发射节流(全场共享) ---------- */
  private telegraphFxAcc = 0;
  private meteorEmberAcc = 0;
  private meteorFallAcc = 0;
  private cloudFxAcc = 0;
  private minionFxAcc = 0;
  private enemyFxAcc = 0;
  private chargeFxAcc = 0;

  protected readonly inputs: BattleRunInputs;
  protected readonly host: BattleWorldHost;
  private ctx: BattleContext;

  constructor(opts: BattleWorldOptions<F>) {
    this.inputs = opts.inputs;
    this.host = opts.host;
    this.fxLayer = opts.fxLayer;
    this.arena = this.chapterArena();
    const world = this;
    this.ctx = {
      player: world.player,
      enemies: world.enemies,
      projectiles: world.projectiles,
      clouds: world.clouds,
      minions: world.minions,
      globalPulseMult: 1,
      // 联动加成实时结算:套装件数退役 → 本局共鸣数(docs/DESIGN-HERO-RHYTHM.md §5),买卡 / 切节律 / 买被动后自动更新
      get setBonus() {
        return resonanceBonusState(world.player.castList, world.player.passives, world.selectedSet, world.inputs.seasonId());
      },
      // 赛季序号:赛季共鸣格 / 过季回响(R5)
      get seasonId() {
        return world.inputs.seasonId();
      },
      // 赛季联动词缀:同 setBonus 口径实时结算
      get seasonMutation() {
        return setMutation(world.inputs.seasonId(), world.selectedSet);
      },
      // 跨套组合技激活状态:同 setBonus 口径实时结算(技能与法宝同列)
      get comboActive() {
        return comboStates(world.player.castList);
      },
      // 世界层连杀数:共鸣变形「连杀飞刃 / 连杀雷链」的输入
      get comboCount() {
        return world.comboCount;
      },
      addFx: (f) => world.emitFx(f),
      damageEnemy: (e, dmg, o) => world.damageEnemy(e, dmg, o.source, o.lifesteal ?? 0, o.knockbackPower ?? 0, o.from),
      healPlayer: (v) => world.player.heal(v),
      addPlayerShield: (a, d) => world.player.addShield(a, d),
      onBossPhase: (ph) => world.showBossPhase(ph),
    };
  }

  /* ================= 环境查询 ================= */

  hasEnv(t: EnvAffixType): boolean {
    return this.envAffixes.includes(t);
  }

  owns(id: TalentId): boolean {
    return this.inputs.owns(id);
  }

  /** 是否已领取某个每日天赋 */
  hasDailyTalent(id: string): boolean {
    return this.inputs.dailyTalentClaimed().includes(id);
  }

  /** 本局每日天赋全局伤害倍率(战意) */
  dailyDmgMult(): number {
    return this.hasDailyTalent("dmg20") ? 1 + dailyTalentOf("dmg20").value : 1;
  }

  /** 本局每日天赋全局脉冲间隔(疾咒) */
  dailyCdrMult(): number {
    return this.hasDailyTalent("cd15") ? 1 - dailyTalentOf("cd15").value : 1;
  }

  /** 本局每日天赋金币掉落倍率(淘金) */
  dailyGoldMult(): number {
    return this.hasDailyTalent("gold50") ? 1 + dailyTalentOf("gold50").value : 1;
  }

  /** 荆棘反伤回血流:同时拥有 受击/受伤触发 + 吸血/汲取/护盾 时激活 */
  isThornBuild(): boolean {
    const list = this.player.castList;
    return buildHasThorn(list) && buildHasHeal(list);
  }

  /** 本局出战英雄:宿主直给 > 由套组反查(双射) > null(未选英雄) */
  heroId(): HeroId | null {
    return this.inputs.selectedHero?.() ?? heroOfSetOrNull(this.selectedSet)?.id ?? null;
  }

  /* ================= 竞技场与几何 ================= */

  /** 本章竞技场:宽 560 标定;纵向收窄到上下坞之间(战场高每章现取宿主,坞高变化时 arena 随之变化) */
  chapterArena(): ArenaRect {
    const band = battleBandY(this.host.worldHeight(), this.host.bottomDockH ? this.host.bottomDockH() : HUD_BOT_H);
    return { x0: 0, y0: band.y0, x1: 560, y1: band.y1 };
  }

  /** 本章竞技场边缘随机出生点(开局刷怪用) */
  chapterEdgePos(): Vec2 {
    const a = this.arena;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y0 + 40);
    if (side === 1) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y1 - 40);
    if (side === 2) return vec2(a.x0 + 40, rand(a.y0 + 40, a.y1 - 40));
    return vec2(a.x1 - 40, rand(a.y0 + 40, a.y1 - 40));
  }

  /** 本章敌情(克制导向):主力敌种 +40% 血量、45% 生成倾向;精英章强制主力为精英 */
  spawnIntel() {
    const i = chapterIntel(this.chapter, this.inputs.seasonId());
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    // 精英章章首 ELITE_INTEL_DELAY_SEC 秒内不强制精英敌情(开局 burst 与前几拍只有密度),之后按章型偏向入场
    const forced = ct?.intelPrefer && this.chapterTimer >= ELITE_INTEL_DELAY_SEC ? ct.intelPrefer : null;
    return { prefer: forced ?? i.prefer, hpBuff: 0.4, bias: forced ? ct!.intelBias : 0.45 };
  }

  /* ================= 开局 ================= */

  /** 天赋/图鉴/每日天赋的开局加成(作用到刚 new 出来的 Player 上) */
  applyTalentBonuses(): void {
    const talents = this.inputs.ownedTalents();
    this.player.slotBonus = slotBonusFor(talents);
    this.player.passiveSlotBonus = passiveSlotBonusFor(talents);
    this.player.firstXpScale = firstXpScaleFor(talents);
    // 基础生命 = 基础 × 生命强化天赋 × 收藏图鉴 × 每日天赋「坚韧」
    const cb = collectionBonus(this.inputs.ownedGear());
    let hpMult = maxHpMultFor(talents) * (1 + cb.hpPct / 100);
    if (this.hasDailyTalent("hp30")) hpMult *= 1 + dailyTalentOf("hp30").value;
    this.player.maxHp = Math.round(PLAYER_BASE.maxHp * hpMult);
    this.player.hp = this.player.maxHp;
    const shield = startShieldFor(talents);
    if (shield > 0) this.player.addShield(shield, 9999);
  }

  /**
   * 开始一局的世界准备(关卡/无限关共用;调用方先设置 currentStage 与 envAffixes)。
   * 引导启用、商店清空、屏幕状态与宿主展示字段由宿主在本方法之后自行处理。
   */
  startRun(): void {
    this.player = new Player();
    this.applyTalentBonuses();
    // 原地清空(保持数组身份),否则 BattleContext 会继续持有旧数组
    this.enemies.length = 0;
    this.skillTelegraphs.length = 0;
    this.projectiles.length = 0;
    this.clouds.length = 0;
    this.minions.length = 0;
    this.gems.length = 0;
    this.fx.length = 0;
    this.dmgNums.length = 0;
    this.fxLayer.reset();
    this.ctx.player = this.player; // 同步 ctx 中的 player 引用
    this.engine.reset();
    this.waves = new WaveManager();
    this.kills = 0;
    this.elapsed = 0;
    this.reviveUsed = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.bossSpawned = false;
    this.bossDead = false;
    this.bossBanner = null;
    this.over = false;
    // 章节制与金币经济初始化
    this.chapter = 1;
    this.chapterTimer = 0;
    this.gold = 0;
    this.totalBought = 0;
    this.arena = this.chapterArena();
    // 地形:第 1 章新手区净空(规则返回空);显式重置保证重开局一致
    this.obstacles = rollChapterObstacles(1, this.arena, Math.random, this.currentStage?.bossChapter);
    this.poolTickAcc = 0;
    // 出战套组(主菜单选择,场外配置带入)
    this.selectedSet = this.inputs.selectedSet();
    // 本命节律(docs/DESIGN-HERO-RHYTHM.md §2):选英雄那一下就定了;第 2 条由分岔技能解锁。
    // S2 第二本命:宿主给的 startRhythm 落在该英雄可选集里才生效(未解锁 / 脏值 → 表内本命)
    const hero = this.heroId();
    const wanted = this.inputs.startRhythm?.() ?? null;
    const start: RhythmId = hero && wanted && heroRhythmOptions(hero).includes(wanted) ? wanted : heroRhythm(hero);
    this.player.rhythms = [start];
    this.aiProfile = heroAiProfile(hero, start);
    this.discoveryBanner = null;
    this.hitStop = 0;
    this.resonancesSeen.clear();
    // 开局装备:开发演示覆盖 > (核心技能 + 收藏选中件) > 核心技能
    const override = this.inputs.openingEquipmentOverride();
    if (override) {
      // 开发演示通道:世界直接用该清单,不发核心技能(标定 / 演示要的就是这份清单本身)
      for (const eq of override) {
        this.player.equipment.push(eq);
        this.recordEquipment(eq);
      }
    } else {
      // 核心技能(§3):英雄有专属 / 通用职业包时实例化技能表;未选英雄走宿主初始武器(蓝图画布可定向)并标为技能
      const core: Equipment = hero
        ? makeSkillEquipment(coreSkillOf(hero))
        : { ...this.inputs.makeStarterEquipment(), kind: "skill", skillId: coreSkillOf(null).id };
      // 选了第二本命:核心技能跟着挂到所选节律上(核心永远在本命上发动)
      // 调率跟着核心走(R6):第二本命上也按这一招的节拍发动
      if (core.triggers[0]?.def.type !== start) core.triggers = skillTriggers(coreSkillOf(hero), start);
      this.player.skills.push(core);
      this.recordEquipment(core);
      // 收藏选中件随身带入主动槽,按本局已解锁节律归一化
      const sel = this.inputs.selectedGearForRun();
      if (sel) {
        this.player.equipment.push(normalizeArtifact(sel, this.player.rhythms, undefined, this.inputs.seasonId()));
        this.recordEquipment(sel);
      }
    }
    this.started = true;
  }

  /**
   * 开始下一章:清场、换竞技场、回中心、重生成地形、章节开局刷一波怪。
   * 召唤物**不清**(docs/DESIGN-HERO-RHYTHM.md R11,用户裁定 A):骷髅 / 狼 / 亡影是召唤流上一章攒下的军队,跟着玩家回到场心,
   * 剩余存活照常倒数、上限仍走 LIMITS.minions;精英章开场那 10s 里有它们顶住,补的正是穆那道墙的机理。
   */
  nextChapter(): void {
    this.chapter += 1;
    this.chapterTimer = 0;
    this.arena = this.chapterArena();
    this.enemies.length = 0;
    this.skillTelegraphs.length = 0;
    this.projectiles.length = 0;
    this.clouds.length = 0;
    this.gems.length = 0;
    this.fxLayer.reset();
    this.bossSpawned = false;
    this.bossBanner = null;
    this.eliteBannerShown = false;
    this.player.pos = vec2((this.arena.x0 + this.arena.x1) / 2, (this.arena.y0 + this.arena.y1) / 2);
    // 召唤物随主人回到场心(散在 MINION_CARRY_SPREAD 内),不留在上一章的位置
    for (const m of this.minions) {
      m.pos.x = this.player.pos.x + (Math.random() - 0.5) * MINION_CARRY_SPREAD;
      m.pos.y = this.player.pos.y + (Math.random() - 0.5) * MINION_CARRY_SPREAD;
    }
    // 地形重生成:与"清场换章"同节奏;第 1 章与 Boss 章净空
    this.obstacles = rollChapterObstacles(this.chapter, this.arena, Math.random, this.currentStage?.bossChapter);
    this.poolTickAcc = 0;
    // 章节开局先刷一波怪,避免开局空场;章型差异化:精英章密度/burst 提升、宝箱章混入金怪(仅主线关卡生效)
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    const burst = Math.round((6 + Math.floor(this.chapter / 3)) * (ct?.burstMult ?? 1));
    const intel = this.spawnIntel();
    for (let i = 0; i < burst; i++) {
      let kind = randomEnemyKind(this.chapter, this.owns("god_challenge"));
      if (intel.prefer && Math.random() < intel.bias) kind = intel.prefer;
      if (ct && ct.goldMix > 0 && Math.random() < ct.goldMix) kind = "goldkind";
      const e = spawnEnemy(kind, this.chapterEdgePos(), this.chapter, seasonMonsterDefFor(kind, this.inputs.seasonId(), this.chapter));
      if (intel.hpBuff > 0 && kind === intel.prefer) {
        const buffed = Math.round(e.maxHp * (1 + intel.hpBuff));
        e.maxHp = buffed;
        e.hp = buffed;
      }
      this.enemies.push(e);
    }
  }

  /** 广告复活的战场部分:满血 + 短无敌盾 + 清掉贴身敌人给喘息空间 */
  revive(): void {
    const p = this.player;
    p.alive = true;
    p.hp = p.maxHp;
    p.shield = 0;
    p.shieldTtl = 0;
    p.addShield(p.maxHp, REVIVE_SHIELD_SECONDS);
    removeIf(this.enemies, (e) => Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) < REVIVE_CLEAR_RADIUS);
    this.reviveUsed += 1;
    this.over = false;
  }

  /* ================= 一帧推进 ================= */

  /** 帧首:本局已进行秒数累加(宿主在此之前跑每日重置/赛季同步/引导推进) */
  beginFrame(dt: number): void {
    this.elapsed += dt;
  }

  /**
   * 推进战斗一帧。前置闸门(屏幕状态、广告暂停、每日/赛季、引导)由宿主负责,
   * 与本方法同序出现在宿主 update 中。
   */
  advance(dt: number): void {
    // 共鸣发现时停(§5):战斗整体停住,只让横幅倒计时
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.tickBanners(dt);
      return;
    }
    this.updatePlayer(dt);
    // 连杀狂潮:连杀 3 秒无新击杀则断连;每 10 连杀触发 2 秒狂潮(全装备触发加速)
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboCount = 0;
    if (this.frenzyTimer > 0) this.frenzyTimer -= dt;
    // 反射伤害预算每秒重置(上限 = 最大生命 15%,防止高爆发 Build 自毁)
    this.reflectTimer -= dt;
    if (this.reflectTimer <= 0) {
      this.reflectTimer = 1;
      this.reflectBudget = Math.round(this.player.maxHp * REFLECT_BUDGET_HP_PCT);
    }
    // 时间膨胀(环境词缀)× 冷却缩减(天赋)× 狂潮 × 每日天赋「疾咒」 合成全局脉冲间隔倍率
    this.ctx.globalPulseMult =
      (this.hasEnv("time_dilation") ? TIME_DILATION_MULT : 1) *
      cdrScaleFor(this.inputs.ownedTalents()) *
      (this.frenzyTimer > 0 ? FRENZY_PULSE_MULT : 1) *
      this.dailyCdrMult();
    this.engine.update(this.ctx, dt);
    this.detectResonance();
    this.updateEnemies(dt);
    // 批 4 技能预警:倒计时/引爆/余烬(独立于 Boss 三阶段的附加层管线)
    this.tickTelegraphs(dt);
    this.emitTelegraphFx(dt);
    this.updateProjectiles(dt);
    this.updateClouds(dt);
    this.updateMinions(dt);
    this.updateGems(dt);

    // Boss 战期间(已生成未击杀)停止生成新怪,聚焦 Boss 单挑
    const bossActive = this.bossSpawned && !this.bossDead;
    // 章型差异化:本章生成密度倍率 + 金怪混入,仅主线关卡生效(无限关保持原样)
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    const baseScale = bossActive ? 0 : this.currentStage?.spawnScale ?? 1;
    const spawnScale = baseScale * (ct?.spawnScaleMult ?? 1);
    this.waves.update(dt, this.enemies, this.player.pos, spawnScale, this.arena, this.spawnIntel(), this.owns("god_challenge"), ct?.goldMix ?? 0, this.inputs.seasonId());

    // 章节计时:每章时长结束 → 章间商店(玩家手动开始下一章)
    this.chapterTimer += dt;
    // 精英入场横幅(R15):精英章到 ELITE_INTEL_DELAY_SEC 那一拍复用发现横幅节点报一次(不时停、不入图鉴),把 R12 的预告说出来
    if (!this.eliteBannerShown && this.currentStage && ELITE_INTEL_DELAY_SEC > 0 && this.chapterTimer >= ELITE_INTEL_DELAY_SEC) {
      this.eliteBannerShown = true;
      if (chapterTypeOf(this.chapter, this.currentStage.bossChapter) === "elite") this.discoveryBanner = { text: `${ELITE_ENTER_BANNER} · 第 ${this.chapter} 章`, ttl: DISCOVERY.bannerSec };
    }
    if (this.chapterTimer >= CHAPTER_SECONDS) {
      this.chapterEnd();
      return;
    }

    // 主线关卡:Boss 生成与通关判定(第 bossChapter 章)
    if (this.currentStage) {
      if (!this.bossSpawned && this.waves.wave >= (this.currentStage.bossChapter ?? 9999)) {
        this.bossSpawned = true;
        const p = this.player.pos;
        const bossPos = vec2(
          clamp(p.x + BOSS_SPAWN_OFFSET_X, this.arena.x0 + BOSS_SPAWN_INSET, this.arena.x1 - BOSS_SPAWN_INSET),
          clamp(p.y + BOSS_SPAWN_OFFSET_Y, this.arena.y0 + BOSS_SPAWN_INSET, this.arena.y1 - BOSS_SPAWN_INSET)
        );
        const boss = spawnEnemy("boss", bossPos, this.waves.wave, seasonMonsterDefFor("boss", this.inputs.seasonId(), this.waves.wave));
        // Boss 独立血量曲线:随关卡增长对标玩家输出成长
        boss.maxHp = boss.hp = Math.round(boss.maxHp * bossHpMult(this.currentStage.id));
        // 偶数关弱化变体:hp×弱化系数、跳过 P2、无死亡分裂
        if (this.currentStage.id % 2 === 0) {
          boss.bossVariant = "weak";
          boss.maxHp = boss.hp = Math.round(boss.maxHp * BOSS_WEAK_HP_MULT);
        }
        this.enemies.push(boss);
        this.emitFx({ type: "nova", pos: vec2(bossPos.x, bossPos.y), radius: 140, ttl: 0.5, maxTtl: 0.5 });
        this.host.onBossSpawned?.();
      }
      if (this.currentStage.bossChapter && this.bossDead) {
        this.host.onStageCleared();
        return;
      }
    }

    this.tickFx(dt);
    this.tickDmg(dt);
    this.tickBanners(dt);

    // 限制敌人数量
    if (this.enemies.length > LIMITS.enemies) {
      this.enemies.splice(0, this.enemies.length - LIMITS.enemies);
    }
  }

  /** 两条横幅倒计时(Boss 阶段 / 共鸣发现) */
  private tickBanners(dt: number): void {
    if (this.bossBanner) {
      this.bossBanner.ttl -= dt;
      if (this.bossBanner.ttl <= 0) this.bossBanner = null;
    }
    if (this.discoveryBanner) {
      this.discoveryBanner.ttl -= dt;
      if (this.discoveryBanner.ttl <= 0) this.discoveryBanner = null;
    }
  }

  /**
   * 共鸣发现(docs/DESIGN-HERO-RHYTHM.md §5):每帧扫一遍技能 + 法宝,首次达成的共鸣 → 横幅 + 时停 + 图鉴。
   * 键:法宝 `art:<效果>:<节律>`(切节律再挂回同一条不重复报);技能 `skill:<技能 id>`。
   */
  private detectResonance(): void {
    const p = this.player;
    const season = this.inputs.seasonId();
    for (const eq of p.castList) {
      let key: string | null = null;
      // 赛季角标(R5):当季新格 / 过季回响格 / 本季首发基础格;图鉴键变体法宝用变体 id
      let tag = "";
      if (eq.kind === "skill") {
        if (eq.skillId && skillResonant(eq, p.passives)) key = `skill:${eq.skillId}`;
      } else {
        const info = equipmentResonance(eq, season);
        if (info) {
          const r = eq.triggers[0]?.def.type ?? "";
          key = `art:${eq.variant ?? eq.effect.def.type}:${r}`;
          tag = info.kind === "season" ? DISCOVERY.seasonNew : info.kind === "echo" ? DISCOVERY.seasonEcho : !eq.variant && r && isSeasonFeatured(eq.effect.def.type, r, season) ? DISCOVERY.seasonFeatured : "";
        }
      }
      if (!key || this.resonancesSeen.has(key)) continue;
      this.resonancesSeen.add(key);
      const name = eq.kind === "skill" ? heroSkillDef(eq.skillId!)?.resonanceName ?? equipmentDisplayName(eq, p.passives) : equipmentDisplayName(eq, undefined, season);
      const rhythm = eq.triggers[0] ? rhythmDef(eq.triggers[0].def.type as RhythmId)?.name ?? "" : "";
      this.discoveryBanner = { text: `共鸣 · ${name}${rhythm && eq.kind !== "skill" ? `(${rhythm}节律)` : ""}${tag ? ` · ${tag}` : ""}`, ttl: DISCOVERY.bannerSec };
      this.hitStop = DISCOVERY.hitStop;
      this.emitFx({ type: "nova", pos: vec2(p.pos.x, p.pos.y), radius: 90, ttl: 0.5, maxTtl: 0.5 });
      this.inputs.recordResonanceSeen?.(key);
    }
  }

  /** HUD 节律进度条(R15):转发引擎只读查询,ctx 不外泄 */
  rhythmProgress(eq: Equipment): { frac: number; kind: RhythmId } | null {
    return this.engine.rhythmProgress(eq, this.ctx);
  }

  /**
   * 重置分岔(§6):撤掉已选分岔技能与它解锁的节律,挂在那条节律上的法宝按剩余已解锁节律重挂。
   * 次数与价由升级弹层管(表在 ../data/shop);返回 false = 没有分岔可撤。
   */
  resetBranch(): boolean {
    const r = this.player.resetBranch();
    if (!r) return false;
    for (const eq of this.player.equipment) normalizeArtifact(eq, this.player.rhythms, undefined, this.inputs.seasonId());
    return true;
  }

  /* ---------- 玩家受伤统一入口(遗物「护心镜」/「假命」的结算位) ---------- */

  /** 接触类伤害倍率:护心镜 ×0.85(叠加按表衰减) */
  private contactMult(): number {
    const k = relicStack(this.player.passives, "mirror");
    return k > 0 ? 1 - (1 - RELIC_VALUES.mirror.contactMult) * k : 1;
  }

  /** 玩家受伤:走 Player.takeDamage,致死时给「假命」一次机会 */
  private hurtPlayer(dmg: number): number {
    const dealt = this.player.takeDamage(dmg);
    if (!this.player.alive) this.trySpareLife();
    return dealt;
  }

  private trySpareLife(): void {
    const p = this.player;
    if (p.spareLifeUsed || relicStack(p.passives, "spare_life") <= 0) return;
    if (Math.random() >= RELIC_VALUES.spare_life.chance) return;
    p.spareLifeUsed = true;
    p.alive = true;
    p.hp = Math.max(1, Math.round(p.maxHp * RELIC_VALUES.spare_life.healPct));
    p.addShield(Math.round(p.maxHp * 0.1), 1);
    this.discoveryBanner = { text: "假命 · 免死一次", ttl: DISCOVERY.bannerSec };
    this.emitFx({ type: "heal", pos: vec2(p.pos.x, p.pos.y), radius: 60, ttl: 0.5, maxTtl: 0.5 });
  }

  /** 章节结束条件判定:末章按关底规则判通关/判负,其余记进度后进章间商店 */
  private chapterEnd(): void {
    this.chapterTimer = 0;
    const st = this.currentStage;
    if (st && this.chapter >= CHAPTERS_PER_STAGE) {
      if (!stageClearedAtFinalChapter(st, this.bossDead)) {
        // 有 Boss 的关末章超时未杀 Boss → 置死交宿主走阵亡结算(复活机会同死亡)
        this.player.hp = 0;
        this.player.alive = false;
        this.host.onStageFailed();
        return;
      }
      // 无 Boss 关撑过末章(或有 Boss 关已击杀但结算落在本章末尾)→ 通关
      this.host.onStageCleared();
      return;
    }
    this.recordStageProgress();
    this.host.onChapterShop();
  }

  /** 记录本关打到过的最远章节(进度制解锁依据);除章末推进外,死亡结算也要调它,故对外可见 */
  recordStageProgress(): void {
    const st = this.currentStage;
    if (!st) return;
    this.inputs.recordStageFurthest(st.id, this.chapter);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    if (!p.alive) {
      // 死亡:交给宿主(复活机会与入账延后由宿主决定)
      this.host.onPlayerDown();
      return;
    }
    p.movedThisFrame = 0;
    const before = vec2(p.pos.x, p.pos.y);
    const a = this.arena;
    // 纵向空气墙顶到上下坞边(按半径钳制:身体贴栏不越栏);坞高变化时 arena 随之变化
    const yMin = a.y0 + PLAYER_BASE.radius, yMax = a.y1 - PLAYER_BASE.radius;
    const input = this.host.input;
    if (input.isMoving) {
      // 手动输入覆盖自动控制
      const mv = input.moveDir;
      p.pos.x = clamp(p.pos.x + mv.x * PLAYER_BASE.speed * p.speedMult * dt, a.x0 + 30, a.x1 - 30);
      p.pos.y = clamp(p.pos.y + mv.y * PLAYER_BASE.speed * p.speedMult * dt, yMin, yMax);
    } else if (this.autoMove) {
      // 自主控制(挂机):按本命节律取档位(docs/DESIGN-HERO-RHYTHM.md §2.3)——
      // kite:贴身才躲(避免小竞技场里自陷包围),平时顺时针巡场;
      // hold:允许被围(受击 / 低血节律要挨打才有输出),围数过多或血量过低才躲;
      // orbit:持续绕场(移动节律靠走位触发),敌人贴到很近才躲
      const nearest = this.nearestEnemy(p.pos, 110);
      let dodge = !!nearest;
      if (nearest && this.aiProfile === "hold") {
        let around = 0;
        for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) <= 110) around += 1;
        dodge = around >= AI_PROFILE_PARAMS.hold.maxContacts || p.hp / p.maxHp < AI_PROFILE_PARAMS.hold.fleeHpPct;
      } else if (nearest && this.aiProfile === "orbit") {
        dodge = Math.hypot(nearest.pos.x - p.pos.x, nearest.pos.y - p.pos.y) <= AI_PROFILE_PARAMS.orbit.dodgeRadius;
      }
      let mvx = 0;
      let mvy = 0;
      if (nearest && !dodge && this.aiProfile === "hold") {
        // 站桩承伤:原地不动
      } else if (nearest && dodge) {
        const dx = p.pos.x - nearest.pos.x;
        const dy = p.pos.y - nearest.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        mvx = dx / d;
        mvy = dy / d;
        // 切向漂移,避免直线后退被包围
        const side = Math.sin(this.elapsed * 2.3) > 0 ? 1 : -1;
        mvx += (-dy / d) * side * 0.6;
        mvy += (dx / d) * side * 0.6;
        const l = Math.hypot(mvx, mvy) || 1;
        mvx /= l;
        mvy /= l;
      } else {
        // 无近敌:顺时针巡场,保持覆盖全屏清怪
        const ang = this.elapsed * 0.4;
        mvx = Math.cos(ang);
        mvy = Math.sin(ang);
      }
      p.pos.x = clamp(p.pos.x + mvx * PLAYER_BASE.speed * p.speedMult * dt, a.x0 + 30, a.x1 - 30);
      p.pos.y = clamp(p.pos.y + mvy * PLAYER_BASE.speed * p.speedMult * dt, yMin, yMax);
    }
    p.pos.x = clamp(p.pos.x, a.x0 + 30, a.x1 - 30);
    p.pos.y = clamp(p.pos.y, yMin, yMax);
    // 临时障碍(批 2 灼烧池)倒计时:到期消散;地形障碍(无 ttl)不受影响
    tickObstacleTtl(this.obstacles, dt);
    // 石柱推挤(地形占位不挡路:最小位移推出)
    for (const ob of this.obstacles) pushOutOfPillar(p.pos, PLAYER_BASE.radius, ob);
    // 毒池/灼烧池 DoT:不走受击管线(是地形不是攻击,不触发受击类装备)
    if (isInPool(p.pos, this.obstacles)) {
      this.poolTickAcc += dt;
      while (this.poolTickAcc >= OBSTACLE.poolTick) {
        this.poolTickAcc -= OBSTACLE.poolTick;
        this.hurtPlayer(OBSTACLE.poolDps * OBSTACLE.poolTick);
      }
    } else {
      this.poolTickAcc = 0;
    }
    p.movedThisFrame = Math.hypot(p.pos.x - before.x, p.pos.y - before.y);
    p.update(dt);
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    // 光环载体预筛(批 4):每帧一次,圈内派生乘数见 auraMultAt
    const auraCarriers = this.enemies.filter((a) => a.hp > 0 && a.def.skill?.aura !== undefined);
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      // 治疗光环:敌人每秒回复固定比例生命
      if (this.hasEnv("heal_aura")) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_AURA_RATE * dt);
      }
      // 隐匿迷雾:所有敌人周期性隐身
      if (this.hasEnv("mist")) {
        e.hiddenTimer += dt;
        const t = e.hiddenTimer % MIST_CYCLE;
        e.hidden = t >= MIST_VISIBLE;
      }
      // 光环派生乘数:速度入移动尾参,伤害乘接触伤害;无载体 = undefined,基线路径零开销
      const aura = auraCarriers.length > 0 ? auraMultAt(e, auraCarriers) : undefined;
      // 批 4 精英/首领技能(附加层:先技能后 kind 移动)。
      // 预警入 skillTelegraphs 由本层倒计时与引爆;火带落池走 dropBurnPool(cap 取载体表值)
      updateSkill(e, dt, p.pos, PLAYER_BASE.radius, this.arena, {
        spawnChild: (kind, pos, def) => {
          if (this.enemies.length < LIMITS.enemies) {
            this.enemies.push(spawnEnemy(kind, pos, this.waves.wave, def));
            this.emitSummonFx(pos, def?.color ?? "#ff8a65"); // 技能召唤:传送门色 = 子怪皮色
          }
        },
        onTelegraph: (t) => this.skillTelegraphs.push({ t, total: t.charge, src: e }),
        // 冲锋单次撞击:走受击管线(触发受击类装备)+ 可选减速/落点燃池(撞击点快照)
        onChargeHit: (raw, pos, slow, ignite) => {
          const dmg = Math.max(1, Math.round(raw * this.contactMult()));
          this.hurtPlayer(dmg);
          this.engine.onHurt(this.ctx, dmg, e);
          this.spawnDmg(p.pos, dmg, e.def.color);
          if (slow) this.player.applySlow(slow.factor, slow.duration);
          if (ignite) this.dropBurnPool(pos, ignite.radius, ignite.duration, 6, e.def.radius);
          this.fxLayer.burst({
            x: pos.x, y: pos.y, count: 10, color: e.def.color,
            speed: [80, 260], size: [1.4, 3], life: [0.2, 0.45], halo: 2.8, drag: 2.2,
          });
          this.fxLayer.addShake(3);
        },
        onDropPool: (pos, radius, duration) => this.dropBurnPool(pos, radius, duration, e.def.skill?.fireTrail?.cap ?? 6, e.def.radius),
      });
      updateEnemy(e, p.pos, PLAYER_BASE.radius, dt, aura?.speed ?? 1);
      // 特化机制:隐匿者隐身 / 召唤师召怪
      updateSpecial(e, dt, (kind, pos) => {
        if (this.enemies.length < LIMITS.enemies) {
          this.enemies.push(spawnEnemy(kind, pos, this.waves.wave));
          this.emitSummonFx(pos, "#ff8a65"); // 召唤师:橙色传送门
        }
      });
      // Boss 三阶段:阶段推进 + 召唤 + 地面震击
      updateBoss(e, dt, p.pos, {
        spawnChild: (kind, cpos) => {
          if (this.enemies.length < LIMITS.enemies) {
            this.enemies.push(spawnEnemy(kind, cpos, this.waves.wave));
            this.emitSummonFx(cpos, "#ff5050"); // Boss 召唤:血红传送门
          }
        },
        onPhaseChange: (phase) => this.ctx.onBossPhase?.(phase),
        onSlam: (pos, radius, damage) => this.bossSlam(pos, radius, damage),
      });
      // 敌人机制装饰特效(隐身进出/登场/震击预警余烬/狂暴火光)
      this.emitEnemyFx(e, dt);
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
      const rr = e.def.radius + PLAYER_BASE.radius;
      if (d <= rr && e.hitCooldown <= 0) {
        e.hitCooldown = CONTACT_HIT_CD;
        // 光环伤害派生乘数:乘数 = 1 时与基线一致
        const cdmg = Math.max(1, Math.round(e.def.contactDmg * (aura?.dmg ?? 1) * this.contactMult()));
        this.hurtPlayer(cdmg);
        this.engine.onHurt(this.ctx, cdmg, e);
        this.spawnDmg(p.pos, cdmg, "#ff6b6b");
        // 撕咬反馈:玩家身边红色血屑 + 轻震屏
        this.fxLayer.burst({
          x: p.pos.x, y: p.pos.y, count: 5, color: "#ff6b6b",
          speed: [60, 190], size: [1.2, 2.6], life: [0.15, 0.35], halo: 2.6, drag: 4,
        });
        this.fxLayer.addShake(1.4);
        // 主题怪机制:凝滞之触命中即冻结玩家脚步(冰蓝碎屑 = 减速可读反馈)
        if (e.def.mech?.type === "slowOnHit") {
          this.player.applySlow(e.def.mech.factor, e.def.mech.duration);
          this.fxLayer.burst({
            x: p.pos.x, y: p.pos.y, count: 6, color: "#9be8ff",
            speed: [40, 130], size: [1.4, 2.8], life: [0.25, 0.5], halo: 2.4, drag: 3,
          });
        }
        // 荆棘反伤回血流:每次挨打回固定比例最大生命
        if (this.isThornBuild()) {
          this.player.heal(Math.max(1, Math.round(this.player.maxHp * THORN_HEAL_PCT)));
        }
      }
    }
    // 石柱统一推挤 pass:敌人不寻路,最小位移推出石柱
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      for (const ob of this.obstacles) pushOutOfPillar(e.pos, e.def.radius, ob);
    }
    removeIf(this.enemies, (e) => e.hp <= 0);
  }

  /** Boss 阶段切换:阶段横幅 + Boss 身上预警波特效 */
  private showBossPhase(phase: 2 | 3): void {
    this.bossBanner = { text: phase === 2 ? "阶段二 · 地面震击" : "阶段三 · 狂暴", ttl: 2 };
    const boss = this.enemies.find((e) => e.kind === "boss" && e.hp > 0);
    if (boss) this.emitFx({ type: "nova", pos: vec2(boss.pos.x, boss.pos.y), radius: 120, ttl: 0.5, maxTtl: 0.5 });
  }

  /** 通用震击引爆:冲击波 + 碎屑 + 震屏,半径内玩家走受击管线(触发受击类装备)。Boss 三阶段与批 4 技能预警共用 */
  private detonateSlam(pos: Vec2, radius: number, rawDmg: number, src: Enemy | null, burstColor: string): void {
    const dmg = Math.max(1, Math.round(rawDmg * this.contactMult()));
    this.emitFx({ type: "nova", pos: vec2(pos.x, pos.y), radius, ttl: 0.4, maxTtl: 0.4 });
    this.fxLayer.burst({
      x: pos.x, y: pos.y, count: 18, color: burstColor,
      speed: [120, 380], size: [1.6, 3.6], life: [0.3, 0.6], halo: 3, drag: 1.6, gravity: 160,
    });
    this.fxLayer.addShake(6);
    const p = this.player;
    if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) <= radius + PLAYER_BASE.radius) {
      this.hurtPlayer(dmg);
      this.engine.onHurt(this.ctx, dmg, src);
      this.spawnDmg(p.pos, dmg, "#ff6b6b");
      if (this.isThornBuild()) p.heal(Math.max(1, Math.round(p.maxHp * THORN_HEAL_PCT)));
    }
  }

  /** Boss 地面震击引爆:震点半径内玩家受伤 */
  private bossSlam(pos: Vec2, radius: number, dmg: number): void {
    this.detonateSlam(pos, radius, dmg, this.enemies.find((e) => e.kind === "boss" && e.hp > 0) ?? null, "#ff5050");
  }

  /** 灼烧池落位(批 2 余烬孕体死亡池 / 批 4 火带共用通道):超上限先消散最早一只;DoT 复用毒池口径 */
  private dropBurnPool(pos: Vec2, radius: number, duration: number, cap: number, ringR0: number): void {
    const burns = this.obstacles.filter((o) => o.burn);
    if (burns.length >= cap) {
      const idx = this.obstacles.indexOf(burns[0]);
      if (idx >= 0) this.obstacles.splice(idx, 1);
    }
    this.obstacles.push(spawnBurnPool(pos, radius, duration));
    this.fxLayer.burst({
      x: pos.x, y: pos.y, count: 12, color: "#ff9d2e",
      speed: [40, 160], size: [1.6, 3.2], life: [0.3, 0.6], halo: 2.6, drag: 2.5, gravity: -40,
    });
    this.fxLayer.ring({ x: pos.x, y: pos.y, r0: ringR0, r1: radius, life: 0.45, color: "rgba(255,157,46,0.7)", width: 2 });
  }

  /** 批 4 技能预警倒计时与引爆(震击/脉冲/轰炸共用管线;归零即结算后移除) */
  private tickTelegraphs(dt: number): void {
    for (const st of this.skillTelegraphs) {
      st.t.charge -= dt;
      if (st.t.charge > 0) continue;
      const t = st.t;
      const src = st.src && st.src.hp > 0 ? st.src : null;
      if (t.global) {
        // 全场雾型:无半径判定,全体上减速(伤害 = 0)
        if (t.slow) this.player.applySlow(t.slow.factor, t.slow.duration);
      } else {
        this.detonateSlam(t.pos, t.radius, t.damage, src, t.color);
        if (t.slow) {
          const p = this.player;
          if (Math.hypot(p.pos.x - t.pos.x, p.pos.y - t.pos.y) <= t.radius + PLAYER_BASE.radius) {
            p.applySlow(t.slow.factor, t.slow.duration);
          }
        }
      }
    }
    removeIf(this.skillTelegraphs, (st) => st.t.charge <= 0);
  }

  /** 技能预警余烬(蓄力过半后外沿加窜火星;与 Boss 震击余烬同风格,独立节流窗) */
  private emitTelegraphFx(dt: number): void {
    if (this.skillTelegraphs.length === 0) return;
    const gap = 0.05;
    this.telegraphFxAcc = Math.min(gap * 6, this.telegraphFxAcc + dt);
    while (this.telegraphFxAcc >= gap) {
      this.telegraphFxAcc -= gap;
      for (const st of this.skillTelegraphs) {
        const t = st.t;
        if (t.global) continue;
        const prog = 1 - t.charge / st.total;
        const a = rand(0, Math.PI * 2);
        const rr = Math.sqrt(rand(0, 1)) * t.radius;
        this.fxLayer.burst({
          x: t.pos.x + Math.cos(a) * rr, y: t.pos.y + Math.sin(a) * rr, count: 1,
          color: t.color, speed: [8, 30], size: [1.4, 2.8], life: [0.35, 0.7], halo: 3, gravity: -50, drag: 0.6,
        });
        if (prog > 0.55) {
          const a2 = rand(0, Math.PI * 2);
          this.fxLayer.burst({
            x: t.pos.x + Math.cos(a2) * t.radius, y: t.pos.y + Math.sin(a2) * t.radius, count: 1,
            color: "#ff8a3c", speed: [12, 40], size: [1.2, 2.2], life: [0.25, 0.5], halo: 2.8, gravity: -70, drag: 0.8,
          });
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const proj of this.projectiles) {
      updateProjectile(proj, dt);
      // 追踪转向(冰锥 icelance):朝最近未命中活敌转 homing rad/s
      if (proj.homing) steerHoming(proj, this.enemies, dt);
      if (proj.ttl <= 0) continue;
      // 空间扭曲:投射物轨迹正弦弯曲,难以命中
      if (this.hasEnv("space_warp")) {
        const sp = Math.hypot(proj.vel.x, proj.vel.y) || 1;
        const wobble = Math.sin((this.elapsed + proj.id * 1.7) * 4) * 110 * dt;
        proj.pos.x += (-proj.vel.y / sp) * wobble;
        proj.pos.y += (proj.vel.x / sp) * wobble;
      }
      // 拖尾:位置定稿(含空间扭曲偏移)后按距离补粒子
      this.emitProjTrail(proj);
      // 石柱阻挡:命中即消亡,连锁/穿透/爆炸不触发
      if (this.obstacles.length > 0) {
        let blocked = false;
        for (const ob of this.obstacles) {
          if (ob.kind === "pillar" && projectileHits(proj, { pos: ob.pos, radius: ob.radius })) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          proj.ttl = -1;
          continue;
        }
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || proj.hit.has(e.id)) continue;
        if (projectileHits(proj, { pos: e.pos, radius: e.def.radius })) {
          proj.hit.add(e.id);
          // 吞噬投射:基线吞噬者 + 批 4 技能载体(极渊之颚);吸收比例 = 表值,基线回落 0.5
          if (e.kind === "devourer" || e.def.skill?.devour) {
            const healRate = e.def.skill?.devour?.healRate ?? 0.5;
            const healed = Math.round(proj.damage * healRate);
            e.hp = Math.min(e.maxHp, e.hp + healed);
            this.spawnDmg(e.pos, healed, "#26a69a");
            this.fxLayer.burst({
              x: proj.pos.x, y: proj.pos.y, count: 5, color: e.def.color,
              speed: [30, 110], size: [1.2, 2.4], life: [0.2, 0.4], halo: 2.6, drag: 3,
            });
            this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: e.def.radius + 14, r1: e.def.radius * 0.5, life: 0.3, color: hexA(e.def.color, 0.8), width: 2 });
            proj.ttl = -1;
            break;
          }
          this.damageEnemy(e, proj.damage, proj.source, proj.lifesteal, 30, proj.pos, proj.splitChild === true);
          this.emitHitSpark(proj);
          if (proj.kind === "ray" && proj.slow) applySlow(e, proj.slow, proj.slowDuration ?? 2);
          if (proj.explode) {
            this.engine.explode(proj.source, this.ctx, proj.pos, proj.explode, {
              power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: proj.lifesteal, pierce: 0,
            });
          }
          // 连锁:弹向最近的其他敌人
          if (proj.chainLeft > 0) {
            const next = this.nearestEnemy(proj.pos, 300, proj.hit);
            if (next) {
              proj.chainLeft -= 1;
              const dx = next.pos.x - proj.pos.x;
              const dy = next.pos.y - proj.pos.y;
              const l = Math.hypot(dx, dy) || 1;
              const sp = Math.hypot(proj.vel.x, proj.vel.y);
              proj.vel.x = (dx / l) * sp;
              proj.vel.y = (dy / l) * sp;
            }
          } else if (proj.pierce > 0) {
            proj.pierce -= 1;
          } else {
            proj.ttl = -1;
            break;
          }
        }
      }
    }
    removeIf(this.projectiles, (p) => p.ttl <= 0);
    if (this.projectiles.length > LIMITS.projectiles) {
      this.projectiles.splice(0, this.projectiles.length - LIMITS.projectiles);
    }
  }

  private updateClouds(dt: number): void {
    for (const c of this.clouds) {
      c.ttl -= dt;
      c.tickAcc += dt;
      if (c.meteor) {
        // 陨星 telegraph:倒计时由消散通路引爆,不做周期 tick;此处只补落点余烬
        this.emitMeteorTelegraph(c, dt);
        continue;
      }
      if (c.ring) {
        // 霜环:半径逐帧扩张,扫到的敌人一次性伤害 + 减速(每敌一次)
        c.radius += c.ring.expandSpeed * dt;
        for (const e of this.enemies) {
          if (e.hp <= 0 || c.ring.hits.has(e.id)) continue;
          if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
            c.ring.hits.add(e.id);
            this.damageEnemy(e, Math.round(c.dps), c.source, 0, 0);
            if (c.ring.slow) applySlow(e, c.ring.slow, c.ring.slowDuration);
          }
        }
        this.emitCloudAmbient(c, dt);
        continue;
      }
      this.emitCloudAmbient(c, dt);
      if (c.tickAcc >= 0.25) {
        c.tickAcc = 0;
        if (c.heals) {
          // 回血池(组合技):只治疗玩家,不伤敌
          const p = this.player;
          if (p.alive && Math.hypot(p.pos.x - c.pos.x, p.pos.y - c.pos.y) <= c.radius + PLAYER_BASE.radius) {
            p.heal(c.dps * 0.25);
          }
          continue;
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y);
          if (d <= c.radius + e.def.radius) {
            this.damageEnemy(e, Math.round(c.dps * 0.25), c.source, 0, 0);
          }
        }
      }
    }
    for (const c of this.clouds) {
      if (c.ttl <= 0 && c.meteor) {
        // 陨星落点引爆:AOE 伤害 + 留灼烧余烬小云(爆炸修饰器走下方通用消散通路)
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
            this.damageEnemy(e, Math.round(c.dps), c.source, 0, 60, c.pos);
          }
        }
        const burn = spawnCloud({
          pos: vec2(c.pos.x, c.pos.y),
          radius: c.meteor.burnRadius,
          dps: c.meteor.burnDps,
          duration: c.meteor.burnDuration,
          source: c.source,
          fxEmber: true,
        });
        this.clouds.push(burn);
        this.emitFx({ type: "explosion", pos: vec2(c.pos.x, c.pos.y), radius: c.radius, ttl: 0.3, maxTtl: 0.3 });
        this.emitMeteorImpact(c);
      }
    }
    for (const c of this.clouds) {
      if (c.ttl <= 0 && c.explode) {
        this.engine.explode(c.source, this.ctx, c.pos, c.explode, {
          power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: 0, pierce: 0,
        });
      }
    }
    removeIf(this.clouds, (c) => c.ttl <= 0);
  }

  private updateMinions(dt: number): void {
    const p = this.player;
    for (const m of this.minions) {
      m.ttl -= dt;
      m.attackCd -= dt;
      this.emitMinionFx(m, dt);
      const target = this.nearestEnemy(m.pos, MINION_SIGHT);
      if (target && m.attackCd <= 0) {
        const d = Math.hypot(target.pos.x - m.pos.x, target.pos.y - m.pos.y);
        if (d <= MINION_ATTACK_RANGE) {
          m.attackCd = m.attackInterval;
          this.damageEnemy(target, m.damage, m.source, 0, MINION_HIT_KNOCKBACK, m.pos);
          if (m.healOnHit) this.player.heal(Math.round(m.damage * MINION_HEAL_ON_HIT_PCT));
        } else {
          // 追击目标
          const dx = target.pos.x - m.pos.x;
          const dy = target.pos.y - m.pos.y;
          const l = Math.hypot(dx, dy) || 1;
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      } else if (!target) {
        // 跟随玩家
        const dx = p.pos.x - m.pos.x;
        const dy = p.pos.y - m.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (l > MINION_FOLLOW_LEASH) {
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      }
    }
    removeIf(this.minions, (m) => m.ttl <= 0);
    if (this.minions.length > LIMITS.minions) {
      this.minions.splice(0, this.minions.length - LIMITS.minions);
    }
  }

  /** 金币吸附与拾取(场内金币 → 商店买卡) */
  private updateGems(dt: number): void {
    const p = this.player;
    const autoPick = autoPickupFor(this.inputs.ownedTalents()); // 自动拾取:全屏吸附
    // 遗物「磁轭」:拾取半径 ×1.4(叠加按表衰减)
    const yoke = relicStack(p.passives, "yoke");
    const magnetR = autoPick ? 99999 : GEM_MAGNET_RADIUS * (1 + (RELIC_VALUES.yoke.magnetMult - 1) * yoke);
    for (const gem of this.gems) {
      if (gem.delay > 0) {
        gem.delay -= dt;
        continue;
      }
      const d = Math.hypot(gem.pos.x - p.pos.x, gem.pos.y - p.pos.y);
      if (d < magnetR && d > 1) {
        gem.pos.x += ((p.pos.x - gem.pos.x) / d) * gem.magnet * dt;
        gem.pos.y += ((p.pos.y - gem.pos.y) / d) * gem.magnet * dt;
      }
      if (d <= PLAYER_BASE.radius + GEM_PICK_RADIUS_BONUS) {
        gem.picked = true;
        this.gold += gem.value;
      }
    }
    removeIf(this.gems, (g) => g.picked);
  }

  nearestEnemy(from: Vec2, range: number, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.hidden) continue; // 隐匿者:隐身时不可被瞄准
      if (exclude?.has(e.id)) continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /* ================= 伤害与击杀 ================= */

  /** 施加反射伤害(受每秒预算限制) */
  private applyReflect(dmg: number): void {
    const taken = Math.max(0, Math.min(dmg, this.reflectBudget));
    this.reflectBudget -= taken;
    if (taken > 0) {
      this.hurtPlayer(taken);
      this.spawnDmg(this.player.pos, taken, "#4fc3f7");
    }
  }

  damageEnemy(e: Enemy, dmg: number, source: Equipment, lifesteal: number, knockbackPower: number, from?: Vec2, fromSplit = false): void {
    // 隐匿者:隐身时不可被命中
    if (e.hidden) return;
    // 护盾卫士:正面免疫(正面扇形内伤害减免,多方向/AOE 可绕过)
    if (from) {
      const fm = shieldguardDamageMult(e, from);
      dmg = Math.round(dmg * fm);
      if (fm < 1) this.emitShieldBlock(e); // 正面被挡:盾面金属火花
    }
    if (dmg <= 0) return;
    // 征服者天赋:全局增伤 / 绝境爆发 / 暴击 / 元素精通
    let mult = globalDamageMultFor(this.inputs.ownedTalents());
    // 收藏图鉴攻击加成(通关刷装备 → 永久基础数值)× 每日天赋「战意」
    const cb = collectionBonus(this.inputs.ownedGear(), this.inputs.gearLevels());
    mult *= (1 + cb.atkPct / 100) * this.dailyDmgMult();
    if (this.owns("desperate") && this.player.hp / this.player.maxHp < TALENT_VALUES.desperateHpThreshold) {
      mult *= desperateMultFor(this.inputs.ownedTalents());
    }
    const crit = critFor(this.inputs.ownedTalents());
    // 暴击率 = 天赋 + 每日天赋「暴击」+ 遗物「裂核」(叠加按表衰减)
    const critRate = crit.rate + (this.hasDailyTalent("crit10") ? dailyTalentOf("crit10").value : 0) + RELIC_VALUES.core.critRate * relicStack(this.player.passives, "core");
    if (critRate > 0 && Math.random() < critRate) {
      mult *= crit.mult;
      this.spawnDmg(e.pos, 0, "#ff2d8f"); // 暴击标记(伤害数字上方)
      this.engine.onCrit(this.ctx); // 隐藏触发器「暴击触发」
    }
    if (this.owns("elemental") && this.isElementalEffect(source)) {
      mult *= elementalMultFor(this.inputs.ownedTalents());
    }
    // 荆棘反伤回血流:受击/受伤触发的效果增伤(故意挨打 → 反伤输出)
    if (this.isThornBuild() && equipmentHasThornTrigger(source)) {
      mult *= 1.5;
    }
    // 隐藏修饰器「送葬」:对残血目标增伤;依赖目标当前血量,故只能在结算侧乘(引擎的 statsOf 拿不到目标)
    mult *= condemnedMultOf(source, e.hp / e.maxHp) * passiveCondemnedMult(this.player.passives, e.hp / e.maxHp);
    dmg = Math.round(dmg * mult);
    if (dmg <= 0) return;
    // 反伤领域:敌人受击时反弹固定比例伤害(反射者自带比例不叠加)
    if (this.hasEnv("reflect_field") && e.kind !== "reflector") {
      const reflected = Math.max(1, Math.round(dmg * REFLECT_FIELD_RATE));
      this.applyReflect(reflected);
    }
    // 反射者:反弹部分伤害给目标;受每秒预算限制
    const reflected = reflectDamage(e, dmg);
    if (reflected > 0) {
      this.applyReflect(reflected);
      // 镜片碎屑:提示"打我会还手"(Boss 反伤每击触发,过密不出)
      if (e.kind !== "boss") {
        this.fxLayer.burst({
          x: e.pos.x, y: e.pos.y, count: 4, color: "#4fc3f7",
          speed: [80, 240], size: [1, 2.2], life: [0.12, 0.3], halo: 2.6, drag: 4,
        });
      }
    }
    e.hp -= dmg;
    this.spawnDmg(e.pos, Math.round(dmg), "#ffd7a0");
    if (lifesteal > 0) this.player.heal(dmg * lifesteal);
    if (knockbackPower > 0 && from) knockback(e, from, knockbackPower);
    if (e.hp <= 0) {
      if (tryRevive(e)) {
        // 还魂体:首次致死原地复活,不记击杀不掉落
        this.fxLayer.burst({
          x: e.pos.x, y: e.pos.y, count: 14, color: "#9b6cff",
          speed: [60, 200], size: [1.6, 3.4], life: [0.3, 0.6], halo: 2.6, drag: 2, gravity: -60,
        });
        this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: e.def.radius, r1: e.def.radius + 30, life: 0.4, color: "rgba(155,108,255,0.8)", width: 2.5 });
        return;
      }
      this.killEnemy(e, source, fromSplit);
    }
  }

  /** 元素类效果(元素精通加成:火焰新星/冰霜射线/生成毒云/闪电链) */
  private isElementalEffect(eq: Equipment): boolean {
    const t = eq.effect.def.type;
    return t === "nova" || t === "ray" || t === "cloud" || t === "chain";
  }

  private killEnemy(e: Enemy, source: Equipment, fromSplit = false): void {
    this.kills += 1;
    // 图鉴:记录遭遇过的敌人(主题怪记 variantId,基线怪记 kind)
    this.inputs.recordEnemySeen(e.def.variantId ?? e.kind);
    // Boss 死亡标记(通关判定)
    if (e.kind === "boss") {
      this.bossDead = true;
      this.host.onBossDead?.();
    }
    // 连杀狂潮:累计连杀,每 N 连杀触发狂潮(击杀反馈 + 弹幕加速)
    this.comboCount += 1;
    this.comboTimer = COMBO_WINDOW;
    if (this.comboCount % COMBO_FRENZY_EVERY === 0) this.frenzyTimer = FRENZY_DURATION;
    this.emitFx({ type: "explosion", pos: vec2(e.pos.x, e.pos.y), radius: e.isElite ? 40 : 22, ttl: 0.22, maxTtl: 0.22 });
    // 死亡连锁:敌人死亡时爆炸,波及周围敌人(鼓励 AOE)
    if (this.hasEnv("death_chain")) {
      const dmg = deathChainDamage(e);
      for (const other of this.enemies) {
        if (other === e || other.hp <= 0 || other.hidden) continue;
        const d = Math.hypot(other.pos.x - e.pos.x, other.pos.y - e.pos.y);
        if (d <= DEATH_CHAIN_RADIUS + other.def.radius) {
          this.damageEnemy(other, dmg, source, 0, DEATH_CHAIN_KNOCKBACK, e.pos);
        }
      }
      this.emitFx({ type: "explosion", pos: vec2(e.pos.x, e.pos.y), radius: DEATH_CHAIN_RADIUS, ttl: 0.3, maxTtl: 0.3 });
    }
    // 分裂体:死亡后分裂出幼体;批 4 deathSplit 覆盖式优先(无技能 = 回落基线)
    const babies = skillSplitBabies(e) ?? splitBabies(e);
    for (const baby of babies) {
      if (this.enemies.length < LIMITS.enemies) {
        this.enemies.push(spawnEnemy(baby.kind, baby.pos, this.waves.wave));
      }
    }
    // 分裂飞溅:尸体裂开的黄绿体液 + 冲击环
    if (babies.length > 0) {
      this.fxLayer.burst({
        x: e.pos.x, y: e.pos.y, count: 10, color: "#c0ca33",
        speed: [60, 200], size: [1.6, 3.4], life: [0.25, 0.5], halo: 2.6, drag: 2, gravity: 120,
      });
      this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: e.def.radius, r1: e.def.radius + 26, life: 0.3, color: "rgba(192,202,51,0.8)", width: 2 });
    }
    // 批 4 死亡召唤(万骸指挥):尸体处生成子怪(与周期召唤同通道:LIMITS 门 + 传送门)
    for (const spec of deathSummonSpecs(e)) {
      if (this.enemies.length >= LIMITS.enemies) break;
      this.enemies.push(spawnEnemy(spec.kind, spec.pos, this.waves.wave, spec.def));
      this.emitSummonFx(spec.pos, spec.def?.color ?? "#ff8a65");
    }
    // 主题怪机制:余烬孕体死亡后在尸体处留灼烧池(与批 4 火带同通道:超上限先消散最早一只)
    const mech = e.def.mech;
    if (mech?.type === "deathPool") {
      this.dropBurnPool(e.pos, mech.radius, mech.duration, mech.cap, e.def.radius);
    }
    // 掉落金币(场内货币,替代经验宝石;每日天赋「淘金」加成已在 dailyGoldMult)
    const gemCount = e.isElite ? ELITE_GEM_COUNT : 1;
    const goldValue = Math.round((e.kind === "boss" ? BOSS_GOLD : e.def.xp * GOLD_PER_XP) * this.dailyGoldMult());
    for (let i = 0; i < gemCount; i++) {
      this.gems.push(spawnGem(vec2(e.pos.x + rand(-DROP_SCATTER, DROP_SCATTER), e.pos.y + rand(-DROP_SCATTER, DROP_SCATTER)), goldValue));
    }
    // 溢出不再丢钱:超额堆并入离玩家最近的一堆(金额守恒),逻辑见 entities/objects 的 mergeGemOverflow
    mergeGemOverflow(this.gems, LIMITS.gems, this.player.pos);
    // 经验入口(A 批自带最小版):击杀即入账,升级 → 宿主弹三选一。经验曲线参数原样不动。
    // addXp 自己会扣经验、抬等级、并按 LEVELUP_HEAL_PCT 回一口血(封顶 maxHp),故这里不重复施加
    // 任何成长或回血;它内部是 while 循环却只返回 boolean,连升级数由前后等级之差得出。
    const lvBefore = this.player.level;
    if (this.player.addXp(e.def.xp)) {
      // B2 等级收益(docs/DESIGN-SEASON-FEEL.md):每级 +hpPerLevel 最大生命;三选一由宿主弹
      for (let i = lvBefore; i < this.player.level; i++) this.player.levelUpGrowth();
      this.host.onLevelUp?.(this.player.level - lvBefore);
    }
    this.engine.onKill(this.ctx, e, { fromSplit, source });
  }

  /* ================= 引导与商店辅助(只读派生,不推进状态) ================= */

  /** 首局引导上下文(每帧由宿主组装后交给 Onboarding;playing/shop 由宿主状态机给出) */
  guideCtx(playing: boolean, shop: boolean): GuideCtx {
    return {
      playing,
      shop,
      elapsed: this.elapsed,
      chapter: this.chapter,
      kills: this.kills,
      equipmentCount: this.player.equipment.length,
      hasSet: !!this.selectedSet,
      setInfo: this.selectedSet ? setDef(this.selectedSet).name : "",
      mergesAvailable: this.mergeGroups().length,
    };
  }

  /** 卡牌类型键(效果+品质)——"2 张同效果同品质即可进化",触发器不再参与判定 */
  cardTypeKey(eq: Equipment): string {
    return eq.effect.def.type + "|" + eq.quality;
  }

  /** 商店三合一升品:可合并的卡组(同名同品质 ≥2;2 张保底 + 金币,3 张免费)。
   *  还有上一档可升才算组:隐藏是终止档,挂出来就是一行点不动的死点击。 */
  mergeGroups(): { name: string; quality: Quality; count: number; sample: Equipment }[] {
    const map = new Map<string, { name: string; quality: Quality; count: number; sample: Equipment }>();
    for (const eq of this.player.equipment) {
      const key = this.cardTypeKey(eq);
      const g = map.get(key);
      if (g) g.count += 1;
      else map.set(key, { name: eq.effect.def.name, quality: eq.quality, count: 1, sample: eq });
    }
    return Array.from(map.values()).filter((g) => g.count >= 2 && qualityUpgrade(g.quality) !== null).slice(0, 4);
  }

  /** 新装备入图鉴 */
  recordEquipment(eq: Equipment): void {
    this.inputs.recordEquipmentSeen(eq);
  }

  /* ================= 特效与伤害数字 ================= */

  private tickFx(dt: number): void {
    for (const f of this.fx) f.ttl -= dt;
    removeIf(this.fx, (f) => f.ttl <= 0);
    this.fxLayer.tick(dt);
  }

  private tickDmg(dt: number): void {
    for (const d of this.dmgNums) d.ttl -= dt;
    removeIf(this.dmgNums, (d) => d.ttl <= 0);
  }

  /**
   * Fx 事件唯一入口:入队 + 按类型补粒子/冲击环(纯视觉,不回写模拟状态)。
   * 粒子池满时宿主 fxLayer 直接丢弃新请求,尸潮峰值不会拖帧。
   */
  emitFx(f: Fx): void {
    this.fx.push(f);
    const { x, y } = f.pos;
    const r = f.radius ?? 40;
    switch (f.type) {
      case "explosion":
        this.fxLayer.burst({
          x, y, count: Math.round(clamp(r * 0.3, 5, 14)), color: "#ffb040",
          speed: [70, 240], size: [1.4, 3.2], life: [0.22, 0.45], drag: 2.4, gravity: 140,
        });
        this.fxLayer.ring({ x, y, r0: r * 0.3, r1: r, life: 0.24, color: "rgba(255,180,80,0.85)", width: 2.5 });
        break;
      case "nova":
        this.fxLayer.ring({ x, y, r0: r * 0.15, r1: r, life: 0.42, color: "rgba(255,140,60,0.9)", width: 4 });
        this.fxLayer.burst({
          x, y, count: 12, color: "#ff7a3c", speed: [120, 320],
          size: [1.6, 3.6], life: [0.3, 0.6], drag: 1.8, gravity: 90,
        });
        this.fxLayer.addShake(3);
        break;
      case "lightning":
        this.fxLayer.burst({
          x, y, count: 8, color: "#bfeaff", speed: [140, 340],
          size: [1, 2.2], life: [0.12, 0.28], halo: 2.6, drag: 5,
        });
        break;
      case "heal":
        this.fxLayer.burst({
          x, y, count: 6, color: "#8dffc0", speed: [10, 60],
          size: [1.4, 2.8], life: [0.5, 0.9], halo: 3, drag: 0.6, gravity: -110,
        });
        break;
      case "shield":
        this.fxLayer.ring({ x, y, r0: 16, r1: 30, life: 0.3, color: "rgba(90,200,250,0.9)", width: 2.5 });
        break;
      case "knife":
        this.fxLayer.burst({
          x, y, count: 3, color: "#fff0b8", speed: [60, 190],
          size: [1, 2.2], life: [0.08, 0.18], halo: 2.4, drag: 7,
        });
        break;
    }
  }

  /** 生成一条伤害飘字:入 dmgNums(宿主渲染读取)+ 即时通知宿主(一次性视觉) */
  spawnDmg(pos: Vec2, value: number, color: string): void {
    const d: DmgNum = { pos: vec2(pos.x + rand(-6, 6), pos.y - 6), value: String(value), color, ttl: 0.6, maxTtl: 0.6 };
    this.dmgNums.push(d);
    if (this.dmgNums.length > DMG_NUM_CAP) this.dmgNums.splice(0, this.dmgNums.length - DMG_NUM_CAP);
    this.host.onDamage(d);
  }

  /* ================= 装饰特效发射(节流窗口全场共享) ================= */

  /** 投射物拖尾:每移动固定像素补一个发光粒子,与帧率无关 */
  private emitProjTrail(p: Projectile): void {
    // 冰锥是 kind="knife" 的追踪弹,按来源效果区分(否则会误用金色飞刀条带)
    const icelance = p.source?.effect.def.type === "icelance";
    const gap = p.kind === "ray" ? 8 : 6;
    const acc = (p.trailAcc ?? 0) + Math.hypot(p.pos.x - p.prevPos.x, p.pos.y - p.prevPos.y);
    if (acc < gap) {
      p.trailAcc = acc;
      return;
    }
    p.trailAcc = acc - gap;
    if (icelance) this.fxLayer.trail(p.pos.x, p.pos.y, "#a5e8ff", p.radius * 0.8, 0.32, 3.0, 2);
    // 飞刀:小间距 + 低抖动 + 大光晕,粒子互相叠成连续软条带
    else if (p.kind === "knife") this.fxLayer.trail(p.pos.x, p.pos.y, "#ffd76a", p.radius * 0.7, 0.3, 3.0, 2);
    else this.fxLayer.trail(p.pos.x, p.pos.y, "#7fd8ff", p.radius * 0.9, 0.26, 2.2);
  }

  /** 弹道命中火花:朝来向反方向扇形迸溅 */
  private emitHitSpark(p: Projectile): void {
    const back = Math.atan2(-p.vel.y, -p.vel.x);
    this.fxLayer.burst({
      x: p.pos.x, y: p.pos.y, count: p.kind === "knife" ? 5 : 3,
      color: p.kind === "knife" ? "#fff2c0" : "#cdf2ff",
      speed: [110, 300], size: [1, 2.4], life: [0.1, 0.24], halo: 2.6,
      angle: [back - 1.1, back + 1.1], spread: 0.5, drag: 5, gravity: 220,
    });
  }

  /**
   * 陨星 telegraph:落点内热余烬上冒 + 环内旋涡火屑;倒计时后 60% 开始
   * 从右上方斜坠一颗流星本体(短命亮核 + 沿轨迹反向的粗火尾),让"要砸了"提前可读。
   */
  private emitMeteorTelegraph(c: Cloud, dt: number): void {
    const progress = 1 - clamp(c.ttl / c.maxTtl, 0, 1);
    const gap = 0.03;
    this.meteorEmberAcc = Math.min(gap * 8, this.meteorEmberAcc + dt);
    const n = Math.floor(this.meteorEmberAcc / gap);
    if (n > 0) {
      this.meteorEmberAcc -= n * gap;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const rr = Math.sqrt(rand(0, 1)) * c.radius;
        this.fxLayer.burst({
          x: c.pos.x + Math.cos(a) * rr, y: c.pos.y + Math.sin(a) * rr, count: 1,
          color: "#ff8a3c", speed: [8, 42], size: [1.2, 2.8], life: [0.5, 1],
          halo: 3.2, drag: 1.1, gravity: -76,
        });
        // 环内旋涡火屑(隔一发补一颗,控预算)
        if (i % 2 === 0) {
          const sa = rand(0, Math.PI * 2);
          const srr = c.radius * rand(0.55, 0.95);
          this.fxLayer.burst({
            x: c.pos.x + Math.cos(sa) * srr, y: c.pos.y + Math.sin(sa) * srr, count: 1,
            color: "#ffb040", speed: [70, 150], size: [1.4, 3], life: [0.3, 0.55],
            halo: 2.8, drag: 1.6, orbit: { cx: c.pos.x, cy: c.pos.y },
          });
        }
      }
    }
    // 坠落期:彗头 + 粗火尾
    if (progress >= 0.4) {
      const t = (progress - 0.4) / 0.6;
      const e = t * t; // 越接近落点越快
      const mx = c.pos.x + 170 * (1 - e);
      const my = c.pos.y - 520 * (1 - e);
      const fGap = 0.016;
      this.meteorFallAcc = Math.min(fGap * 4, this.meteorFallAcc + dt);
      const fn = Math.floor(this.meteorFallAcc / fGap);
      if (fn > 0) {
        this.meteorFallAcc -= fn * fGap;
        for (let i = 0; i < fn; i++) {
          this.fxLayer.burst({
            x: mx, y: my, count: 1, color: "#ffd9a0",
            speed: [0, 14], size: [10, 15], life: [0.05, 0.09], halo: 2.6, drag: 2,
          });
          // 火尾指向起飞点方向(轨迹反向),散开拖长
          const back = Math.atan2(-520, 170);
          this.fxLayer.burst({
            x: mx, y: my, count: 2, color: "#ff8a3c",
            speed: [50, 170], size: [3, 7], life: [0.22, 0.5], halo: 3.2,
            angle: [back - 0.5, back + 0.5], spread: 0.4, drag: 1.2,
          });
        }
      }
    }
  }

  /** 陨星引爆:白闪 + 双层火环 + 火星抛射 + 短镜头震动 */
  private emitMeteorImpact(c: Cloud): void {
    const { x, y } = c.pos;
    this.fxLayer.burst({
      x, y, count: 26, color: "#ff9a3c", speed: [140, 480],
      size: [2, 5], life: [0.32, 0.8], halo: 3.4, drag: 1.5, gravity: 320,
    });
    this.fxLayer.burst({
      x, y, count: 12, color: "#fff2c8", speed: [60, 220],
      size: [2.5, 5], life: [0.16, 0.32], halo: 4,
    });
    this.fxLayer.ring({ x, y, r0: 0, r1: c.radius * 0.9, life: 0.18, color: "rgba(255,240,200,0.85)", fill: true });
    this.fxLayer.ring({ x, y, r0: c.radius * 0.2, r1: c.radius * 1.15, life: 0.36, color: "rgba(255,170,70,0.95)", width: 5 });
    this.fxLayer.addShake(5);
  }

  /**
   * 领域云氛围粒子:霜环沿扩张外沿洒冰点;
   * 普通云按来源分三类 —— 回血池柔绿光点缓升、灼烧/熔岩火苗上窜、毒云绿雾缓升膨胀。
   * 全场共享 cloudFxAcc 节流,多云叠加也不会爆粒子预算。
   */
  private emitCloudAmbient(c: Cloud, dt: number): void {
    const gap = 0.05;
    this.cloudFxAcc = Math.min(gap * 6, this.cloudFxAcc + dt);
    if (this.cloudFxAcc < gap) return;
    this.cloudFxAcc -= gap;
    const a = rand(0, Math.PI * 2);
    if (c.ring) {
      this.fxLayer.burst({
        x: c.pos.x + Math.cos(a) * c.radius, y: c.pos.y + Math.sin(a) * c.radius, count: 1,
        color: "#bfeaff", speed: [4, 20], size: [1.2, 2.4], life: [0.3, 0.55], halo: 2.6, drag: 1,
      });
      return;
    }
    const rr = Math.sqrt(rand(0, 1)) * c.radius;
    const x = c.pos.x + Math.cos(a) * rr;
    const y = c.pos.y + Math.sin(a) * rr;
    if (c.heals) {
      this.fxLayer.burst({ x, y, count: 1, color: "#8dffc0", speed: [6, 26], size: [1.2, 2.2], life: [0.6, 1], halo: 3, gravity: -46, drag: 0.5 });
    } else if (c.fxEmber || c.source?.effect.def.type === "magma_trail") {
      this.fxLayer.burst({ x, y, count: 1, color: "#ff8a3c", speed: [10, 36], size: [1.2, 2.6], life: [0.4, 0.8], halo: 3.2, gravity: -60, drag: 0.8 });
    } else {
      this.fxLayer.burst({ x, y, count: 1, color: "#7ee877", speed: [4, 18], size: [2.4, 5], life: [0.7, 1.2], halo: 2.2, gravity: -26, drag: 0.6, endScale: 1.5 });
    }
  }

  /** 召唤物魂火:登场一簇 + 阴影/狼魂持续拖影 */
  private emitMinionFx(m: Minion, dt: number): void {
    if (!m.fxSpawned) {
      m.fxSpawned = true;
      const color = m.shade ? "#9fb0cc" : m.source?.effect.def.type === "spirit_wolves" ? "#c9a6ff" : "#e8f4ff";
      const count = m.source?.effect.def.type === "spirit_wolves" ? 10 : 8;
      this.fxLayer.burst({
        x: m.pos.x, y: m.pos.y, count, color, speed: [16, 110],
        size: [1.4, 3], life: [0.3, 0.6], halo: 2.8, drag: 2, gravity: -30,
      });
      this.fxLayer.ring({ x: m.pos.x, y: m.pos.y, r0: 6, r1: 20, life: 0.25, color, width: 2 });
      return;
    }
    if (m.shade || m.source?.effect.def.type === "spirit_wolves") {
      const gap = 0.22;
      this.minionFxAcc = Math.min(gap * 4, this.minionFxAcc + dt);
      if (this.minionFxAcc < gap) return;
      this.minionFxAcc -= gap;
      this.fxLayer.trail(m.pos.x, m.pos.y, m.shade ? "#8f9bb3" : "#c9a6ff", 2.2, 0.35, 2.6, 4);
    }
  }

  /** 召唤传送门:外扩环 + 上窜火星 */
  private emitSummonFx(pos: Vec2, color: string): void {
    this.fxLayer.ring({ x: pos.x, y: pos.y, r0: 4, r1: 22, life: 0.35, color, width: 2 });
    this.fxLayer.burst({
      x: pos.x, y: pos.y, count: 6, color, speed: [20, 90],
      size: [1.4, 2.8], life: [0.3, 0.6], halo: 2.8, gravity: -50, drag: 1,
    });
  }

  /** 盾面被正面挡住:金属火花沿盾面向外迸溅 */
  private emitShieldBlock(e: Enemy): void {
    const sx = e.pos.x + e.facing.x * (e.def.radius + 3);
    const sy = e.pos.y + e.facing.y * (e.def.radius + 3);
    const back = Math.atan2(e.facing.y, e.facing.x);
    this.fxLayer.burst({
      x: sx, y: sy, count: 4, color: "#cfd8dc", speed: [90, 260],
      size: [1, 2.2], life: [0.1, 0.26], halo: 2.4, angle: [back - 0.9, back + 0.9], drag: 5, gravity: 240,
    });
  }

  /** 敌人机制氛围特效:登场爆尘 / 隐身进出 / 冲锋蓄力与冲刺 / Boss 震击预警与狂暴火光 */
  private emitEnemyFx(e: Enemy, dt: number): void {
    if (!e.fxSpawned) {
      e.fxSpawned = true;
      if (e.isElite || e.kind === "god" || e.kind === "boss" || e.kind === "summoner") {
        const color = e.kind === "god" ? "#ff2d8f" : e.kind === "boss" ? "#ff2d2d" : e.kind === "summoner" ? "#ff8a65" : "#e05040";
        const big = e.kind === "god" || e.kind === "boss";
        this.fxLayer.burst({
          x: e.pos.x, y: e.pos.y, count: big ? 16 : 8, color,
          speed: big ? [40, 180] : [20, 100], size: [1.6, 3.4], life: [0.3, 0.7], halo: 3, drag: 1.6, gravity: -40,
        });
        this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: e.def.radius * 0.4, r1: e.def.radius + (big ? 30 : 14), life: 0.35, color, width: 2 });
        if (big) this.fxLayer.addShake(3);
      }
    }
    if ((e.kind === "hider" || e.kind === "god" || e.def.skill?.hideCycle) && e.hidden !== e.fxHidden) {
      e.fxHidden = e.hidden;
      if (e.hidden) {
        this.fxLayer.burst({
          x: e.pos.x, y: e.pos.y, count: 6, color: "#b388ff", speed: [6, 26],
          size: [2.2, 4.6], life: [0.5, 0.9], halo: 2.4, drag: 1.2, endScale: 1.6,
        });
      } else {
        this.fxLayer.burst({
          x: e.pos.x, y: e.pos.y, count: 7, color: "#d1b3ff", speed: [16, 70],
          size: [1.6, 3.2], life: [0.3, 0.6], halo: 2.8, drag: 1.6,
        });
        this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: 6, r1: e.def.radius + 10, life: 0.3, color: "rgba(209,179,255,0.8)", width: 2 });
      }
    }
    const cst = e.skillState;
    if (e.def.skill?.charge && cst?.skillDashing) {
      if (cst.chargePhase === 2) {
        this.fxLayer.trail(e.pos.x, e.pos.y, e.def.color, e.def.radius * 0.5, 0.3, 2.6, 3);
      } else if (cst.chargePhase === 1) {
        const gap = 0.05;
        this.chargeFxAcc = Math.min(gap * 6, this.chargeFxAcc + dt);
        while (this.chargeFxAcc >= gap) {
          this.chargeFxAcc -= gap;
          const a = rand(0, Math.PI * 2);
          const rr = e.def.radius * rand(0.5, 1.0);
          this.fxLayer.burst({
            x: e.pos.x + Math.cos(a) * rr, y: e.pos.y + Math.sin(a) * rr, count: 1,
            color: e.def.color, speed: [6, 24], size: [1.3, 2.6], life: [0.25, 0.5], halo: 2.8, gravity: -55, drag: 0.8,
          });
        }
      }
    }
    if (e.kind !== "boss") return;
    const telegraphing = e.bossSlamCharge > 0 && e.bossSlamPos !== null;
    const frenzy = e.bossPhase === 3;
    if (!telegraphing && !frenzy) return;
    const gap = 0.05;
    this.enemyFxAcc = Math.min(gap * 6, this.enemyFxAcc + dt);
    while (this.enemyFxAcc >= gap) {
      this.enemyFxAcc -= gap;
      if (telegraphing && e.bossSlamPos) {
        const prog = 1 - e.bossSlamCharge / BOSS_SLAM.charge;
        const a = rand(0, Math.PI * 2);
        const rr = Math.sqrt(rand(0, 1)) * BOSS_SLAM.radius;
        this.fxLayer.burst({
          x: e.bossSlamPos.x + Math.cos(a) * rr, y: e.bossSlamPos.y + Math.sin(a) * rr, count: 1,
          color: "#ff5050", speed: [8, 30], size: [1.4, 2.8], life: [0.35, 0.7], halo: 3, gravity: -50, drag: 0.6,
        });
        if (prog > 0.55) {
          const a2 = rand(0, Math.PI * 2);
          this.fxLayer.burst({
            x: e.bossSlamPos.x + Math.cos(a2) * BOSS_SLAM.radius, y: e.bossSlamPos.y + Math.sin(a2) * BOSS_SLAM.radius, count: 1,
            color: "#ff8a3c", speed: [12, 40], size: [1.2, 2.2], life: [0.25, 0.5], halo: 2.8, gravity: -70, drag: 0.8,
          });
        }
      } else if (frenzy) {
        const a = rand(0, Math.PI * 2);
        const rr = e.def.radius * rand(0.6, 1.1);
        this.fxLayer.burst({
          x: e.pos.x + Math.cos(a) * rr, y: e.pos.y + Math.sin(a) * rr, count: 1,
          color: "#ff2d8f", speed: [10, 40], size: [1.4, 2.8], life: [0.3, 0.6], halo: 3.2, gravity: -60, drag: 0.8,
        });
      }
    }
  }
}
