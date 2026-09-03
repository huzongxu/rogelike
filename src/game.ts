/**
 * Game 主类 —— 组装一切:画布/渲染、战斗结算、升级三选一、尸潮、状态机。
 * 渲染与逻辑分离;所有平台 API 走 platform 适配层。
 */

import { platform } from "./platform/adapter";
import { AssetManager } from "./platform/assets";
import { ASSET_MANIFEST } from "@game/data/assets";
import { input } from "./core/input";
import { theme, hexA, fs, F, ui, spreadRows, rowTextY, confirmRects } from "@game/ui/theme";
import { panel, primaryButton, dangerButton, minorButton, minorButtonBg } from "./ui/themePaint";
import { skinBar, drawBar, skinHeader, iconText, skinIconButton, skinButtonBase, drawAvatarFrame, drawQualityFrame } from "./ui/skin";
import { HUD_TOP_H, HUD_BOT_H, HUD_PAD, battleBandY, pickTicker, equipRowLayout } from "@game/ui/hud";
import { shopLayoutPure, SHOP_BOTTOM, SHOP_ROW_BOTTOM } from "@game/ui/shop";
import { menuLayoutPure, type MenuLayout } from "@game/ui/menuLayout";
import { heroSelectLayout, HERO_ROW_GAP, HERO_ROW_H, type HeroSelectLayout } from "@game/ui/heroSelectLayout";
import { dragScrollFrom, flickOf, inertiaNext, SCROLL_TAP_SLOP } from "@game/ui/scrollList";
import { drawHeroPortrait } from "./ui/heroPortrait";
import { snapshotMenuLayout } from "@game/data/layoutMenu";
import { menuSkinTable, snapshotMenuSkin } from "@game/data/menuSkin";
import { type Vec2, vec2, clamp, rand } from "@game/core/math";
import { FxLayer } from "./core/fxLayer";
import { Player, xpToNext, PLAYER_BASE } from "@game/entities/player";
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
  ENEMY_DEFS,
  type Enemy,
  type SkillTelegraph,
} from "@game/entities/enemy";
import { type Projectile, updateProjectile, projectileHits, steerHoming } from "@game/entities/projectile";
import { type Cloud, type Minion, spawnCloud, spawnGem, type Gem, type Obstacle, rollChapterObstacles, pushOutOfPillar, isInPool, spawnBurnPool, tickObstacleTtl, OBSTACLE } from "@game/entities/objects";
import {
  EquipmentEngine,
  type BattleContext,
  type Fx,
} from "@game/systems/equipmentEngine";
import { WaveManager, seasonMonsterDefFor, type ArenaRect } from "@game/systems/waves";
import { SEASON_MONSTERS } from "@game/data/seasonMonsters";
import {
  generateEquipment,
  generateSetEquipment,
  qualityUpgrade,
  qualityPowerRatio,
  qualityBasePrice,
  QUALITY_MAX_LEVEL,
  slotExpandCost,
  SHOP_SLOT_CAP,
  makeStarterEquipment,
  makeSetStarterEquipment,
  SET_STARTERS,
  thornPairOffer,
  buildHasThorn,
  buildHasHeal,
  equipmentHasThornTrigger,
  type Equipment,
} from "@game/data/equipmentGen";
import { makeTrigger, makeEffect, makeModifier, effectDef, triggerDef, TRIGGERS, EFFECTS, MODIFIERS } from "@game/data/affixes";
import { qualityDef, GACHA_EQUIPMENT_BASE_LEVEL, type Quality } from "@game/data/quality";
import { shopCardPrice, shopRefreshPrice, MERGE_FEE_MULT, DESTROY_REFUND_RATE, DUPLICATE_OFFER_CHANCE, SET_OFFER_BIAS } from "@game/data/shop";
import { PASS_TIERS, PASS_PREMIUM_MULT, calcPassProgress } from "@game/data/pass";
import { isSetPiece, setDef, setBonusState, releasedSets, type SetId } from "@game/data/sets";
import { seasonTheme, setMutation, isSeasonBoosted } from "@game/data/seasonSets";
import { allHeroes, applyHeroSelection, heroDef, heroSkillLines, releasedHeroes, showcaseHero, type HeroId } from "@game/data/heroes";
import { comboStates, COMBOS } from "@game/data/combos";
import { chapterIntel } from "@game/data/intel";
import { chapterTypeInfo, chapterTypeLabel } from "@game/data/chapters";
import { Onboarding, type GuideCtx } from "@game/systems/onboarding";
import {
  BUILDER_ROUTE,
  EFFICIENT_ROUTE,
  CONQUEROR_ROUTE,
  isTierUnlocked,
  talentOf,
  routeOf,
  routeCost,
  slotBonusFor,
  firstXpScaleFor,
  offlineBonusFor,
  commissionSpeedFor,
  commissionTimeScaleFor,
  uncappedCommissionFor,
  autoPickupFor,
  rareBonusFor,
  maxHpMultFor,
  startShieldFor,
  globalDamageMultFor,
  cdrScaleFor,
  critFor,
  elementalMultFor,
  desperateMultFor,
  TALENT_VALUES,
  type TalentId,
} from "@game/data/talents";
import { loadSave, persistSave, resetSave, calcPrestigePoints, availablePoints, type SaveData } from "./systems/save";
import {
  ENERGY_MAX,
  ENERGY_REGEN_SECONDS,
  ENERGY_AD_GAIN,
  ENERGY_AD_LIMIT,
  ENERGY_DIAMOND_COST,
  stageEnergyCost,
  ENDLESS_ENERGY_COST,
  DIAMOND_PER_AD,
  DIAMOND_AD_DAILY,
  DIAMOND_TICKET_COST,
  DAILY_BOXES,
  dailyBoxOf,
  DAILY_TALENT_FREE,
  dailyTalentOf,
  rollDailyTalents,
  regenEnergy,
  todayKey,
  needsDailyReset,
  collectionBonus,
  gearUpgradeCost,
  GEAR_UPGRADE_STEP,
  GEAR_UPGRADE_MAX,
  COLLECTION_ATK_PCT,
  stageDropCount,
  stageDropLevel,
} from "@game/data/daily";
import {
  SEASON_DAYS,
  DAY_MS,
  seasonDay,
  seasonEnded,
  stageUnlocked,
  stageUnlockNeed,
  calcStars,
  starsText,
  THREE_STAR_TICKETS,
  FIRST_CLEAR_TICKET_MULT,
  FIRST_CLEAR_ECHO_MULT,
  seasonScore,
  seasonStardust,
  STAR_MAKEUP_COST,
  canStarMakeup,
} from "@game/data/season";
import { phantomBoard, rankAmong } from "@game/data/leaderboard";
import {
  fusionCost,
  performFusion,
  performTripleFusion,
  tripleUnlocked,
  tripleFusionCost,
  hiddenAffixDef,
  rollHiddenCandidates,
  applyHiddenAffix,
  inheritSource,
  HIDDEN_PITY_N,
  type TripleMode,
} from "@game/data/fusion";
import type { EffectType, HiddenAffixType, TriggerType } from "@game/data/affixes";
import {
  envAffixDef,
  rollEnvAffixes,
  deathChainDamage,
  REFLECT_FIELD_RATE,
  HEAL_AURA_RATE,
  TIME_DILATION_MULT,
  MIST_CYCLE,
  MIST_VISIBLE,
  DEATH_CHAIN_RADIUS,
  DEATH_CHAIN_KNOCKBACK,
  type EnvAffixType,
} from "@game/data/envAffixes";
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
} from "@game/data/combat";
import { BOSS_WEAK_HP_MULT } from "@game/data/enemies";
import {
  REGIONS,
  DIFFICULTIES,
  regionOf,
  difficultyOf,
  regionUnlocked,
  effectiveHours,
  accruedReward,
  collectReward,
  COMMISSION_READY_HOURS,
  commissionTickets,
  FRAGMENT_TO_STARDUST,
  type RegionId,
  type CommissionBonus,
  type CommissionState,
} from "@game/data/commissions";
import {
  STAGES,
  stageOf,
  CHAPTER_SECONDS,
  CHAPTERS_PER_STAGE,
  CHAPTER_ARENA,
  splitEcho,
  stageEchoReward,
  STAGE_UNLOCK_PROGRESS,
  CLEAR_REWARD_GROWTH,
  stageClearedAtFinalChapter,
  makeUpReward,
  type StageDef,
  type StageRewards,
} from "@game/data/stages";
import {
  GACHA_COST,
  GACHA_10_COST,
  drawGacha,
  drawGacha10,
  DUPLICATE_STARDUST,
  type GachaResult,
} from "@game/data/gacha";

/** 实体上限(保证小游戏性能) */
const LIMITS = { enemies: 340, projectiles: 420, clouds: 44, minions: 24, gems: 300 }; // 弹幕 420:组合技分裂子弹+品质高频下 260 会挤掉存活主弹幕(重构标定)

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

interface DmgNum {
  pos: Vec2;
  value: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

type GameState = "menu" | "playing" | "gameover" | "victory" | "prestige" | "fusion" | "commission" | "gacha" | "shop" | "pass" | "daily" | "energy" | "season" | "leaderboard" | "gearup" | "heroes";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  /** 设计分辨率:560×996(9:16)。全 UI 坐标都在此空间,窗口/手机尺寸只做等比适配 */
  private readonly DESIGN_W = 560;
  private readonly DESIGN_H = 996;
  private logicalW = 560;
  private logicalH = 996;
  /** 视图适配:scale = 设计→屏幕 CSS px 的缩放;offX/Y = 居中留边(信箱) */
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private viewW = 560;
  private viewH = 996;
  private dpr = 1;

  private player = new Player();
  private enemies: Enemy[] = [];
  /** 批 4 技能预警(震击/脉冲/轰炸):实体层触发时生成,本层持有倒计时/渲染/引爆(不占 bossSlamCharge,三阶段机零触碰) */
  private skillTelegraphs: { t: SkillTelegraph; total: number; src: Enemy | null }[] = [];
  /** 技能预警余烬节流(与 Boss 震击余烬同口径:0.05s 共享窗,控粒子预算) */
  private telegraphFxAcc = 0;
  private projectiles: Projectile[] = [];
  private clouds: Cloud[] = [];
  private minions: Minion[] = [];
  private gems: Gem[] = [];
  private fx: Fx[] = [];
  private dmgNums: DmgNum[] = [];
  /** 通用粒子/发光层(纯视觉,只读模拟状态;见 core/fxLayer) */
  private fxLayer = new FxLayer();
  /** 陨星 telegraph 余烬发射节流(全局共享,控住粒子预算) */
  private meteorEmberAcc = 0;
  /** 陨星坠落期(倒计时后 60%)流星本体火尾发射节流 */
  private meteorFallAcc = 0;
  /** 领域云(毒云/灼烧/回血池/霜环)氛围粒子节流(全场共享) */
  private cloudFxAcc = 0;
  /** 召唤物魂火拖影节流(全场共享) */
  private minionFxAcc = 0;
  /** 敌人氛围特效节流(震击预警余烬/狂暴火光,全场共享) */
  private enemyFxAcc = 0;
  /** 批 4 冲锋蓄力火花节流(全场共享;冲刺拖影无节流,同投射物先例) */
  private chargeFxAcc = 0;

  private engine = new EquipmentEngine();
  private waves = new WaveManager();

  /* ---------- 反射伤害预算(防止高爆发 Build 被反伤自毁) ---------- */
  private reflectBudget = 0;
  private reflectTimer = 0;

  /* ---------- 连杀狂潮(战斗爽感:连杀触发全装备加速) ---------- */
  private comboCount = 0;
  private comboTimer = 0;
  private frenzyTimer = 0;

  /* ---------- 主线关卡(赛季关卡式) ---------- */
  /** 当前关卡(null = 无限关) */
  private currentStage: StageDef | null = null;
  private bossSpawned = false;
  private bossDead = false;
  /** Boss 阶段横幅(策划案 V3 §3.2:P2/P3 切换提示) */
  private bossBanner: { text: string; ttl: number } | null = null;
  /** 通关奖励(胜利界面展示) */
  private stageReward: StageRewards | null = null;
  /** 通关掉落的新收藏装备数(胜利界面展示;重复的转为星尘) */
  private stageDrops = 0;
  /** 本局通关星数(胜利界面展示;策划案 V3 §4.2) */
  private victoryStars = 0;
  /** 本局是否触发每日首通加成(胜利界面展示) */
  private firstClearBonus = false;
  /** 赛季结算摘要(赛季到期后进入结算面板展示;策划案 V3 §4.1) */
  private seasonSummary: { id: number; score: number; stardust: number } | null = null;
  /** 开发演示:三重融合素材(URL ?demo=triple) */
  private demoTriple = false;
  /** 自主控制(挂机):角色自动移动/战斗,手动输入可覆盖;F6 切换 */
  private autoMove = true;

  /* ---------- 章节制(需求优化 v2:20 章 × 60 秒,有限竞技场) ---------- */
  private chapter = 1;
  private chapterTimer = 0;
  /** 本章竞技场边界(框定区域) */
  private arena: ArenaRect = { x0: 0, y0: 0, x1: CHAPTER_ARENA.w, y1: CHAPTER_ARENA.h };
  /** 本章地形(策划案 V3 §6 / DESIGN-S4 §3):石柱挡路 + 毒池 DoT;每章重生成 */
  private obstacles: Obstacle[] = [];
  /** 毒池伤害累积计时(0.25s tick;离开毒池清零) */
  private poolTickAcc = 0;

  /* ---------- 场内金币经济(替代经验/升级) ---------- */
  private gold = 0;
  /** 已购买卡数(商店价格递增曲线) */
  private totalBought = 0;
  /** 商店当前三张卡 */
  private shopOffers: (Equipment | null)[] = [];
  /** 商店中选中的武器 id(用于销毁/管理) */
  private selectedWeaponId: number | null = null;
  /** 本次出战武器套组(主菜单选择;null = 无套组,通用卡池) */
  private selectedSet: SetId | null = null;

  /* ---------- 英雄选择页(上列表下详情;出战英雄的事实源在 save.selectedHero) ---------- */
  /** 列表滚动位(内容上移 px;拖出边界时为阻尼显示值) */
  private heroScroll = 0;
  /** 列表惯性速度(px/s,offset 空间;0 = 未甩动) */
  private heroVel = 0;
  /** 详情区预览英雄(点行即换;「确定出战」才写入存档) */
  private heroPreview: HeroId | null = null;
  /** 拖拽手势记录(null = 未在拖) */
  private heroDrag: { startY: number; startOffset: number; lastOffset: number; lastT: number; vel: number; moved: boolean } | null = null;
  /** 首局引导(教学横幅;仅主线第 1 关且未完成时启用) */
  private guide = new Onboarding();
  /** 美术资源(贴图加载;缺图自动回退代码绘制) */
  private assets = new AssetManager(ASSET_MANIFEST, platform.assetRoot());
  /** 引导横幅位置(命中测试,每帧重建) */
  private guideBanner: { x: number; y: number; w: number; h: number; skip: { x: number; y: number; w: number; h: number } } | null = null;

  /** 本章竞技场:宽 560 标定;纵向收窄到上下坞之间(人物/怪物活动范围不越栏) */
  private chapterArena(_ch: number): ArenaRect {
    const band = battleBandY(this.worldH());
    return { x0: 0, y0: band.y0, x1: this.logicalW, y1: band.y1 };
  }

  /* ---------- 扭蛋机(战场外抽卡) ---------- */
  /** 最近一次抽取结果(展示用,保留最近 8 条) */
  private gachaResults: GachaResult[] = [];

  /* ---------- 环境词缀(策划案 4.2:每局随机 1-3 个) ---------- */
  private envAffixes: EnvAffixType[] = [];

  private state: GameState = "menu";
  /** 幻影榜:本局名次提升到的名次(结算面板提示「已超越幻影第 N 名」;null = 无提升) */
  private rankImprovedTo: number | null = null;
  /** 头像框:本局新解锁的关卡框(胜利面板提示;null = 无) */
  private frameUnlockedThisRun: number | null = null;
  private kills = 0;
  private elapsed = 0;
  private last = 0;

  /* ---------- 广告驱动商业化(弹壳特攻队思维) ---------- */
  /** 广告播放中(平台激励视频;播放期间屏蔽输入,world 本就暂停) */
  private adBusy = false;
  /** 死亡结算挂起:死亡后先给"看广告复活"机会,放弃(重开/菜单/天赋)时才结算 */
  private pendingSettle = false;
  /** 本局已用广告复活次数(默认上限 1,每日天赋「不屈」+1) */
  private reviveUsed = 0;
  /** 本局结算是否已领取"广告 ×2 回响" */
  private doubleClaimed = false;
  /** 本章商店免费刷新是否已用(之后刷新走广告/钻石) */
  /** 本章商店已手动刷新次数(刷新金币成本递增的难度轴) */
  private chapterRefreshes = 0;
  /** 体力不足面板的待办动作(体力补足后继续) */
  private energyPending: (() => void) | null = null;

  /* ---------- 转生与天赋(策划案 5.2/5.4) ---------- */
  private save: SaveData = loadSave();
  /** 本局结算所得回响点数(用于结算界面展示) */
  private pointsEarnedThisRun = 0;
  /** 本局结算转化所得星尘(天赋树点满后,用于结算界面展示) */
  private stardustEarnedThisRun = 0;
  /** 开局配置:定向搜索的触发器 / 完美蓝图的效果 */
  private runConfig: { targetTrigger?: TriggerType; blueprintEffect?: EffectType } = {};

  /* ---------- 词缀融合(策划案 5.3 减压改版:自动继承 + 保底三选一 + 必成功) ---------- */
  /** 融合界面选中的装备(id,最多 3 件:两件普通融合,三件三重融合) */
  private fusA: number | null = null;
  private fusB: number | null = null;
  private fusC: number | null = null;
  /** 三重融合模式(双触发器/双修饰器) */
  private tripleMode: TripleMode = "double_trigger";
  /** 隐藏词缀保底三选一(null = 无;base = 未落隐藏词缀的成品,选定后入场) */
  private pendingHidden: { base: Equipment; candidates: HiddenAffixType[] } | null = null;

  /* ---------- 委托挂机(策划案六) ---------- */
  /** 委托界面选中的区域与难度 */
  private commRegion: RegionId = "plains";
  private commDifficulty = 1;
  /** 天赋树当前查看的路线页签 */
  private talentRoute: "builder" | "efficient" | "conqueror" = "builder";
  /** 委托活动面板按钮(命中测试,每帧重建) */
  private commPanelBtns: { slot: "commission" | "commission2"; collect: Rect; abandon: Rect }[] = [];
  /** 融合/委托等覆盖界面从哪进入(返回时回到哪) */
  private overlayFrom: "playing" | "shop" | "menu" = "playing";
  /** 二次确认弹窗(null = 无;重开/返回主页等破坏性操作) */
  private confirm: { text: string; ok: () => void } | null = null;

  constructor() {
    // 硬重置:访问 http://host/#reset-save 清空存档(开发工具,键盘失效时的兜底)
    if (typeof window !== "undefined" && window.location.hash === "#reset-save") {
      this.save = resetSave();
      window.location.hash = "";
    }
    // 开发赠送:http://host/?give=1 加载时 +1000 点数/星尘/扭蛋券(验证天赋/融合/扭蛋流程用)
    if (typeof window !== "undefined" && /[?&]give=1/.test(window.location.search)) {
      this.save.points += 1000;
      this.save.stardust += 1000;
      this.save.gachaTicket += 100;
      persistSave(this.save);
    }
    this.canvas = platform.createCanvas();
    this.g = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    // 美术贴图异步加载(缺图自动回退,不阻塞启动)
    this.assets.beginLoad();
    // 皮肤通道:换键/隐藏按当前皮肤表每次现查(不缓存);空表 = 原行为
    this.assets.setSkinSource({
      remapKey: (k) => menuSkinTable.remap[k],
      isHidden: (k) => menuSkinTable.hidden.includes(k),
    });

    // 初始装备:开局一件确定性的"周期脉冲 + 飞刀投射"(策划案 4.5 开局脆弱,
    // 触发器必须不依赖击杀即可生效,否则开局无法破局;实际由 startRun 装配)
    // 开发演示:http://host/?demo=triple 标记 3 件三重融合素材(击杀+飞刀+连锁 / 脉冲+飞刀 / 移动+新星)
    if (typeof window !== "undefined" && /[?&]demo=triple/.test(window.location.search)) {
      this.demoTriple = true;
      // 三重融合需 ≥6 个天赋节点:演示模式标记 6 个基础节点已拥有
      this.save.ownedTalents = ["extra_gear", "quick_start", "affix_taste", "slot1", "offline1", "exp_gain"];
      persistSave(this.save);
    }
    if (typeof window !== "undefined" && /[?&]bot=1/.test(window.location.search)) {
      this.autoMove = true; // 强制挂机(默认已开)
    }
    // 菜单入口:选择主线关卡或无限关后开始一局
    this.state = "menu";

    this.canvas.addEventListener?.("pointerdown", (e) => this.beginHeroDrag(this.toLogical(e.clientX, e.clientY)));
    this.canvas.addEventListener?.("pointermove", (e) => this.moveHeroDrag(this.toLogical(e.clientX, e.clientY)));
    this.canvas.addEventListener?.("pointercancel", () => this.cancelHeroDrag());
    this.canvas.addEventListener?.("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("keydown", (e) => this.onKey(e));
    // 微信小游戏没有 PointerEvent:用触摸模拟点击(短按且无明显位移视为点击)
    if (typeof (window as any).PointerEvent === "undefined") {
      let tapX = 0;
      let tapY = 0;
      let tapT = 0;
      platform.onTouchStart((ts) => {
        if (ts.length) {
          tapX = ts[0].x;
          tapY = ts[0].y;
          tapT = Date.now();
          this.beginHeroDrag(this.screenToContent(ts[0].x, ts[0].y));
        }
      });
      platform.onTouchMove((ts) => {
        if (ts.length) this.moveHeroDrag(this.screenToContent(ts[0].x, ts[0].y));
      });
      platform.onTouchEnd((ts) => {
        // 空触摸列表 = touchcancel(浏览器适配层复用同一回调)
        if (!ts.length) {
          this.cancelHeroDrag();
          return;
        }
        const p = this.screenToContent(ts[0].x, ts[0].y);
        // 拖拽已消费本次手势时不再判定点击:短按位移阈值是屏幕 px,列表行是设计 px,两者不同源
        const consumed = !this.endHeroDrag();
        const d = Math.hypot(ts[0].x - tapX, ts[0].y - tapY);
        if (!consumed && Date.now() - tapT < 400 && d < 24) this.handleTap(p.x, p.y);
      });
    }

    this.last = performance.now();
    const loop = (t: number) => {
      const dt = clamp((t - this.last) / 1000, 0, 0.05);
      this.last = t;
      this.update(dt);
      this.render();
      platform.requestAnimationFrame(loop);
    };
    platform.requestAnimationFrame(loop);
  }

  /* ================= 画布与坐标 ================= */

  /**
   * 视图适配(竖屏全量翻版 v2):画布铺满窗口,宽恒 560 设计 px,
   * 设计高随视口比例伸展:logicalH = clamp(round(560·winH/winW), 996, 1246)——
   * 手机 1080×2340 → 1213 顶满无信箱;16:9 桌面 → 996 居中列。
   * 战场/竞技场锁 worldH()=996 标定高(顶对齐),多余高度是 HUD 坞,不稀释刷怪密度。
   * 触摸/点击经 screenToContent 换算,命中与绘制严格一致。
   */
  private resize(): void {
    const winW = window.innerWidth || this.DESIGN_W;
    const winH = window.innerHeight || this.DESIGN_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.viewW = winW;
    this.viewH = winH;
    this.logicalW = this.DESIGN_W;
    this.logicalH = Math.max(this.DESIGN_H, Math.min(1246, Math.round((this.DESIGN_W * winH) / winW)));
    const s = Math.min(winW / this.logicalW, winH / this.logicalH, 2);
    this.scale = s;
    this.offX = (winW - this.logicalW * s) / 2;
    this.offY = (winH - this.logicalH * s) / 2;
    this.canvas.width = Math.round(winW * dpr);
    this.canvas.height = Math.round(winH * dpr);
    this.canvas.style.width = `${winW}px`;
    this.canvas.style.height = `${winH}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 摇杆等触摸消费方拿到的坐标是"屏幕 CSS px",统一换算到设计空间再判定
    input.xform = (x, y) => this.screenToContent(x, y);
    input.contentW = this.logicalW;
  }

  /** 战场高:恒 996 标定基线(逻辑高伸展只扩面板/HUD 坞,不动战场面积) */
  private worldH(): number {
    return Math.min(this.logicalH, this.DESIGN_H);
  }

  /** 屏幕 CSS px(画布/窗口相对坐标)→ 设计分辨率逻辑坐标 */
  private screenToContent(x: number, y: number): Vec2 {
    return vec2((x - this.offX) / this.scale, (y - this.offY) / this.scale);
  }

  private toLogical(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return this.screenToContent(clientX - rect.left, clientY - rect.top);
  }

  /* ================= 输入 ================= */

  private onPointerUp(e: PointerEvent): void {
    const p = this.toLogical(e.clientX, e.clientY);
    if (!this.endHeroDrag()) return;
    this.handleTap(p.x, p.y);
  }

  /** 统一 UI 点击处理(x,y 为画布相对坐标;桌面端 pointerup / 微信端触摸模拟都会走到这里) */
  private handleTap(x: number, y: number): void {
    const p = vec2(x, y);
    // 广告播放中:屏蔽一切点击
    if (this.adBusy) return;
    // 引导「跳过」按钮优先(playing/shop)
    if ((this.state === "playing" || this.state === "shop") && this.guideBanner && this.guide.current) {
      const s = this.guideBanner.skip;
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
        this.guide.skipAll();
        this.save.tutorialDone = true;
        persistSave(this.save);
        return;
      }
    }
    // 二次确认弹窗优先(任何状态;重开/返回主页等破坏性操作)
    if (this.confirm) {
      const L = this.confirmLayout();
      if (p.x >= L.ok.x && p.x <= L.ok.x + L.ok.w && p.y >= L.ok.y && p.y <= L.ok.y + L.ok.h) {
        const ok = this.confirm.ok;
        this.confirm = null;
        ok();
      } else if (p.x >= L.cancel.x && p.x <= L.cancel.x + L.cancel.w && p.y >= L.cancel.y && p.y <= L.cancel.y + L.cancel.h) {
        this.confirm = null;
      }
      return;
    }
    if (this.state === "season") {
      this.onSeasonClick(p);
      return;
    }
    if (this.state === "menu") {
      this.onMenuClick(p);
      return;
    }
    if (this.state === "shop") {
      this.onShopClick(p);
      return;
    }
    if (this.state === "pass") {
      this.onPassClick(p);
      return;
    }
    if (this.state === "victory") {
      // 广告双倍回响(每局 1 次)
      if (!this.doubleClaimed && this.hitDoubleBtn(p)) {
        this.watchAd(() => {
          const echo = this.pointsEarnedThisRun || stageEchoReward(this.currentStage?.id ?? 1);
          this.settleEcho(echo);
          this.doubleClaimed = true;
          persistSave(this.save);
        });
        return;
      }
      if (p.x >= this.logicalW / 2 - 95 && p.x <= this.logicalW / 2 + 95 && p.y >= this.logicalH - 62 && p.y <= this.logicalH - 18) {
        this.backToMenu();
      }
      return;
    }
    if (this.state === "gameover") {
      // 广告复活(每局限次,复活成功不结算死亡)
      if (this.canRevive() && this.hitReviveBtn(p)) {
        this.watchAd(() => this.revive());
        return;
      }
      // 广告双倍回响(死亡结算的收益翻倍)
      if (!this.doubleClaimed && this.hitDoubleBtn(p)) {
        this.watchAd(() => {
          this.settleEcho(this.pointsEarnedThisRun);
          this.doubleClaimed = true;
          persistSave(this.save);
        });
        return;
      }
      if (this.hitRestart(p)) this.restart();
      else if (this.hitTalentsBtn(p)) { this.settlePendingRun(); this.state = "prestige"; }
      else if (this.hitMenuBtn(p)) this.backToMenu();
    } else if (this.state === "prestige") {
      this.onPrestigeClick(p);
    } else if (this.state === "fusion") {
      this.onFusionClick(p);
    } else if (this.state === "commission") {
      this.onCommissionClick(p);
    } else if (this.state === "gacha") {
      this.onGachaClick(p);
    } else if (this.state === "daily") {
      this.onDailyClick(p);
    } else if (this.state === "gearup") {
      this.onGearUpClick(p);
    } else if (this.state === "leaderboard") {
      this.onLeaderboardClick(p);
    } else if (this.state === "heroes") {
      this.onHeroesClick(p);
    } else if (this.state === "energy") {
      this.onEnergyClick(p);
    } else if (this.state === "playing") {
      // 战场内无操作按钮(融合/委托已移至商店与主菜单)
    }
  }

  /* ================= 词缀融合(策划案 5.3) ================= */

  private openFusion(from: "playing" | "shop" = "playing"): void {
    if (this.player.equipment.length < 2) return;
    this.overlayFrom = from;
    this.fusA = null;
    this.fusB = null;
    this.fusC = null;
    this.pendingHidden = null;
    this.state = "fusion";
  }

  private onFusionEquipmentTap(id: number): void {
    if (this.fusA === id) {
      this.fusA = null;
      return;
    }
    if (this.fusB === id) {
      this.fusB = null;
      return;
    }
    if (this.fusC === id) {
      this.fusC = null;
      return;
    }
    if (this.fusA === null) this.fusA = id;
    else if (this.fusB === null) this.fusB = id;
    else if (this.fusC === null) this.fusC = id;
    else {
      // 已选 3 件:换成当前点击的
      this.fusA = id;
      this.fusB = null;
      this.fusC = null;
    }
  }

  private fusedPair(): [Equipment | undefined, Equipment | undefined] {
    return [
      this.player.equipment.find((e) => e.id === this.fusA),
      this.player.equipment.find((e) => e.id === this.fusB),
    ];
  }

  private fusedTriple(): [Equipment | undefined, Equipment | undefined, Equipment | undefined] {
    return [
      this.player.equipment.find((e) => e.id === this.fusA),
      this.player.equipment.find((e) => e.id === this.fusB),
      this.player.equipment.find((e) => e.id === this.fusC),
    ];
  }

  /** 融合保底推进:+1 并返回是否触达保底(触达即归零) */
  private bumpFusionPity(): boolean {
    this.save.fusionPity += 1;
    if (this.save.fusionPity >= HIDDEN_PITY_N) {
      this.save.fusionPity = 0;
      return true;
    }
    return false;
  }

  private doFusion(): void {
    const triple = this.fusC !== null && tripleUnlocked(this.save.ownedTalents.length);
    if (triple) {
      const mats = this.fusedTriple().filter((e): e is Equipment => !!e);
      if (mats.length < 3 || mats.some((e) => e.hiddenAffix)) return;
      const cost = tripleFusionCost(mats[0], mats[1], mats[2]);
      if (this.save.stardust < cost) return;
      this.save.stardust -= cost;
      const hitsPity = this.bumpFusionPity();
      const outcome = performTripleFusion(mats[0], mats[1], mats[2], this.tripleMode);
      this.afterFusionRoll(outcome, hitsPity, mats);
      return;
    }
    const [a, b] = this.fusedPair();
    if (!a || !b || a.hiddenAffix || b.hiddenAffix) return;
    const cost = fusionCost(a.quality, b.quality);
    if (this.save.stardust < cost) return;
    this.save.stardust -= cost;
    const hitsPity = this.bumpFusionPity();
    const outcome = performFusion(a, b);
    this.afterFusionRoll(outcome, hitsPity, [a, b]);
  }

  /** 保底触达:成品暂存,弹出三选一;未触达:直接入场并落档 */
  private afterFusionRoll(outcome: { result: Equipment; cost: number }, hitsPity: boolean, mats: Equipment[]): void {
    this.player.equipment = this.player.equipment.filter((e) => !mats.some((m) => m.id === e.id));
    if (hitsPity) {
      // 素材已移除但成品未入场、存档未落:三选一完成(或放弃前重开)都不会出现"扣了星尘没拿到货"的中间态
      this.pendingHidden = { base: outcome.result, candidates: rollHiddenCandidates() };
      return;
    }
    this.player.equipment.push(outcome.result);
    this.recordEquipment(outcome.result);
    persistSave(this.save);
    this.fusA = null;
    this.fusB = null;
    this.fusC = null;
  }

  /** 隐藏词缀三选一:落词缀入场并落档 */
  private pickHiddenAffix(hidden: HiddenAffixType): void {
    if (!this.pendingHidden) return;
    const result = applyHiddenAffix(this.pendingHidden.base, hidden);
    this.pendingHidden = null;
    this.player.equipment.push(result);
    this.recordEquipment(result);
    persistSave(this.save);
    this.fusA = null;
    this.fusB = null;
    this.fusC = null;
  }

  private onKey(e: KeyboardEvent): void {
    // 二次确认弹窗:Escape 取消
    if (this.confirm) {
      if (e.key === "Escape") this.confirm = null;
      return;
    }
    if (this.state === "shop") {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 3) this.buyCard(n - 1);
      else if (e.key === "Enter" || e.key === " ") this.nextChapter();
    } else if (this.state === "menu") {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= STAGES.length && this.stageOpen(n)) this.startStage(n);
      else if (e.key.toLowerCase() === "e") this.startEndless();
      else if (e.key.toLowerCase() === "g") this.openGacha();
      else if (e.key.toLowerCase() === "t") this.state = "prestige";
      else if (e.key.toLowerCase() === "p") this.state = "pass";
      else if (e.key.toLowerCase() === "c") this.openCommission("menu");
      else if (e.key.toLowerCase() === "b") this.state = "daily";
      else if (e.key.toLowerCase() === "u") this.state = "gearup";
    } else if (this.state === "daily" || this.state === "energy" || this.state === "gearup") {
      if (e.key === "Escape") this.state = "menu";
    } else if (this.state === "season") {
      if (e.key === "Escape") this.closeSeason();
    } else if (this.state === "gameover") {
      if (e.key.toLowerCase() === "r") this.restart();
      else if (e.key.toLowerCase() === "t") this.state = "prestige";
      else if (e.key.toLowerCase() === "m") this.backToMenu();
    } else if (this.state === "victory") {
      if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "m") this.backToMenu();
    } else if (this.state === "prestige") {
      if (e.key.toLowerCase() === "r") this.startNewRun();
    } else if (this.state === "fusion" || this.state === "commission") {
      // 隐藏词缀三选一必须先选定(素材已消耗,成品待入场),Escape 不放行
      if (e.key === "Escape" && !(this.state === "fusion" && this.pendingHidden)) {
        this.state = this.overlayFrom === "playing" ? "playing" : this.overlayFrom;
      }
    } else if (this.state === "playing") {
      // 开发调试:直接装备策划案 3.4 的三个示例 Build
      if (e.key === "F1") this.debugEquipThorn();
      else if (e.key === "F2") this.debugEquipChain();
      else if (e.key === "F3") this.debugEquipTurret();
      else if (e.key === "F4") this.debugEquipFusionDemo();
    }
    // 开发调试:F5 模拟次日(本日回响清空)/ F6 切换挂机 / F7 委托快进 4 小时 / F8 星尘 / F9 回响点数 / F10 重置存档
    if (e.key === "F5") {
      this.save.dayEcho = 0; // 次日:本日临时回响清零(跨天保留 40% 已在结算时入永久池)
      persistSave(this.save);
    } else if (e.key === "F6") {
      this.autoMove = !this.autoMove; // 自主控制(挂机)开关
    } else if (e.key === "F7") {
      if (this.save.commission) {
        this.save.commission.startedAt -= 4 * 3600000;
        persistSave(this.save);
      }
    } else if (e.key === "F8") {
      this.save.stardust += 100;
      persistSave(this.save);
    } else if (e.key === "F9") {
      this.save.points += 100;
      persistSave(this.save);
    } else if (e.key === "F10") {
      // 重置存档
      this.save = resetSave();
      persistSave(this.save);
    }
  }

  /* ================= 战斗上下文(词缀引擎 → 世界) ================= */

  private ctx: BattleContext = (() => {
    const game = this; // 捕获 Game 实例(对象字面量 getter 的 this 指向字面量自身)
    return {
      player: game.player,
      enemies: game.enemies,
      projectiles: game.projectiles,
      clouds: game.clouds,
      minions: game.minions,
      globalPulseMult: 1,
      // 套组生效状态实时结算(买卡/升品/销毁后自动更新)
      get setBonus() {
        return setBonusState(game.player.equipment, game.selectedSet);
      },
      // 赛季联动词缀(DESIGN-SEASON-SETS L2):同 setBonus 口径实时结算
      get seasonMutation() {
        return setMutation(game.save.seasonId, game.selectedSet);
      },
      // 跨套组合技激活状态(策划案 V3 §5):同 setBonus 口径实时结算
      get comboActive() {
        return comboStates(game.player.equipment);
      },
      addFx: (f) => game.emitFx(f),
      damageEnemy: (e, dmg, o) => game.damageEnemy(e, dmg, o.source, o.lifesteal ?? 0, o.knockbackPower ?? 0, o.from),
      healPlayer: (v) => game.player.heal(v),
      addPlayerShield: (a, d) => game.player.addShield(a, d),
      onBossPhase: (ph) => game.showBossPhase(ph),
    };
  })();

  private hasEnv(t: EnvAffixType): boolean {
    return this.envAffixes.includes(t);
  }

  /** 元素类效果(元素精通加成:火焰新星/冰霜射线/生成毒云/闪电链) */
  private isElementalEffect(eq: Equipment): boolean {
    const t = eq.effect.def.type;
    return t === "nova" || t === "ray" || t === "cloud" || t === "chain";
  }

  /** 荆棘反伤回血流:同时拥有 受击/受伤触发 + 吸血/汲取/护盾 时激活 */
  private isThornBuild(): boolean {
    return buildHasThorn(this.player.equipment) && buildHasHeal(this.player.equipment);
  }

  /** 施加反射伤害(每秒上限 = 最大生命 15%,防止高爆发 Build 自毁) */
  private applyReflect(dmg: number): void {
    const taken = Math.max(0, Math.min(dmg, this.reflectBudget));
    this.reflectBudget -= taken;
    if (taken > 0) {
      this.player.takeDamage(taken);
      this.spawnDmg(this.player.pos, taken, "#4fc3f7");
    }
  }

  private damageEnemy(
    e: Enemy,
    dmg: number,
    source: Equipment,
    lifesteal: number,
    knockbackPower: number,
    from?: Vec2,
    fromSplit = false
  ): void {
    // 隐匿者:隐身时不可被命中(策划案 4.3)
    if (e.hidden) return;
    // 护盾卫士:正面免疫(正面 60° 内伤害减免 80%,多方向/AOE 可绕过)
    if (from) {
      const fm = shieldguardDamageMult(e, from);
      dmg = Math.round(dmg * fm);
      if (fm < 1) this.emitShieldBlock(e); // 正面被挡:盾面金属火花(纯装饰)
    }
    if (dmg <= 0) return;
    // 征服者天赋:全局增伤 / 绝境爆发(生命<20% +50%)/ 暴击 / 元素精通(火冰毒电 +15%)
    let mult = globalDamageMultFor(this.save.ownedTalents);
    // 收藏图鉴攻击加成(通关刷装备 → 永久基础数值)× 每日天赋「战意」
    const cb = collectionBonus(this.save.ownedGear, this.save.gearLevels);
    mult *= (1 + cb.atkPct / 100) * this.dailyDmgMult();
    if (this.owns("desperate") && this.player.hp / this.player.maxHp < TALENT_VALUES.desperateHpThreshold) {
      mult *= desperateMultFor(this.save.ownedTalents);
    }
    const crit = critFor(this.save.ownedTalents);
    const critRate = crit.rate + (this.hasDailyTalent("crit10") ? dailyTalentOf("crit10").value : 0);
    if (critRate > 0 && Math.random() < critRate) {
      mult *= crit.mult;
      this.spawnDmg(e.pos, 0, "#ff2d8f"); // 暴击标记(伤害数字上方)
    }
    if (this.owns("elemental") && this.isElementalEffect(source)) {
      mult *= elementalMultFor(this.save.ownedTalents);
    }
    // 荆棘反伤回血流:受击/受伤触发的效果伤害 +50%(故意挨打 → 反伤输出,高风险高回报)
    if (this.isThornBuild() && equipmentHasThornTrigger(source)) {
      mult *= 1.5;
    }
    dmg = Math.round(dmg * mult);
    if (dmg <= 0) return;
    // 反伤领域:所有敌人受击时反弹 12% 伤害(策划案 4.2;反射者自带 25% 不叠加)
    if (this.hasEnv("reflect_field") && e.kind !== "reflector") {
      const reflected = Math.max(1, Math.round(dmg * REFLECT_FIELD_RATE));
      this.applyReflect(reflected);
    }
    // 反射者:反弹部分伤害给目标(策划案 4.3;受每秒预算限制)
    const reflected = reflectDamage(e, dmg);
    if (reflected > 0) {
      this.applyReflect(reflected);
      // 镜片碎屑:提示"打我会还手"(Boss 15% 反每击触发,过密不出;纯装饰)
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
        // 还魂体(批 3):首次致死原地复活(回半血),不记击杀不掉落;魂火重燃(纯装饰)
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

  private killEnemy(e: Enemy, source: Equipment, fromSplit = false): void {
    this.kills += 1;
    // 图鉴:记录遭遇过的敌人(主题怪记 variantId,基线怪记 kind)
    const seen = this.save.collection.enemies;
    const enemyId = e.def.variantId ?? e.kind;
    if (!seen.includes(enemyId)) seen.push(enemyId);
    // Boss 死亡标记(通关判定)
    if (e.kind === "boss") this.bossDead = true;
    // 连杀狂潮:累计连杀,每 10 连杀触发 2 秒狂潮(击杀反馈 + 弹幕加速)
    this.comboCount += 1;
    this.comboTimer = COMBO_WINDOW;
    if (this.comboCount % COMBO_FRENZY_EVERY === 0) this.frenzyTimer = FRENZY_DURATION;
    this.emitFx({ type: "explosion", pos: vec2(e.pos.x, e.pos.y), radius: e.isElite ? 40 : 22, ttl: 0.22, maxTtl: 0.22 });
    // 死亡连锁:敌人死亡时爆炸,波及周围敌人(策划案 4.2,鼓励 AOE)
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
    // 分裂体:死亡后分裂出幼体(策划案 4.3);批 4 deathSplit 覆盖式优先(无技能 = 回落基线)
    const babies = skillSplitBabies(e) ?? splitBabies(e);
    for (const baby of babies) {
      if (this.enemies.length < LIMITS.enemies) {
        this.enemies.push(spawnEnemy(baby.kind, baby.pos, this.waves.wave));
      }
    }
    // 分裂飞溅:尸体裂开的黄绿体液 + 冲击环(纯装饰)
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
    // 主题怪机制(批 2):余烬孕体死亡后在尸体处留灼烧池(与批 4 火带同通道:超上限先消散最早一只)
    const mech = e.def.mech;
    if (mech?.type === "deathPool") {
      this.dropBurnPool(e.pos, mech.radius, mech.duration, mech.cap, e.def.radius);
    }
    // 掉落金币(场内货币,替代经验宝石;每日天赋「淘金」+50%)
    const gemCount = e.isElite ? ELITE_GEM_COUNT : 1;
    const goldValue = Math.round((e.kind === "boss" ? BOSS_GOLD : e.def.xp * GOLD_PER_XP) * this.dailyGoldMult());
    for (let i = 0; i < gemCount; i++) {
      this.gems.push(spawnGem(vec2(e.pos.x + rand(-DROP_SCATTER, DROP_SCATTER), e.pos.y + rand(-DROP_SCATTER, DROP_SCATTER)), goldValue));
    }
    if (this.gems.length > LIMITS.gems) this.gems.splice(0, this.gems.length - LIMITS.gems);
    this.engine.onKill(this.ctx, e, { fromSplit, source });
  }

  /* ================= 主循环更新 ================= */

  private update(dt: number): void {
    input.update();
    this.elapsed += dt;

    // 每日重置(跨天清零每日广告/宝箱/天赋计数;任何状态下都执行)
    this.checkDailyReset();
    // 赛季同步(策划案 V3 §4.1:到期结算翻页;任何状态下都执行,面板仅菜单态弹出)
    this.syncSeason();
    if (this.seasonSummary && this.state === "menu") this.state = "season";
    // 广告播放中:世界暂停,等待平台回调
    if (this.adBusy) return;

    // 首局引导(教学横幅;playing/shop 状态下驱动,暂停态不推进)
    if ((this.state === "playing" || this.state === "shop") && this.guide.enabled) {
      this.guide.update(this.guideCtx(), dt);
      // 引导全部走完 → 存档永久关闭
      if (this.guide.finished && !this.save.tutorialDone) {
        this.save.tutorialDone = true;
        persistSave(this.save);
      }
    }

    // 英雄选择页:暂停态但列表惯性仍需逐帧推进(与 draw 同读一个 layout 源)
    if (this.state === "heroes") this.updateHeroScroll(dt);

    // gameover / victory / prestige / fusion / commission / gacha / shop / menu / season / daily / leaderboard / energy / heroes 均为暂停态,世界停止更新
    if (
      this.state === "gameover" ||
      this.state === "victory" ||
      this.state === "prestige" ||
      this.state === "fusion" ||
      this.state === "commission" ||
      this.state === "gacha" ||
      this.state === "shop" ||
      this.state === "pass" ||
      this.state === "season" ||
      this.state === "daily" ||
      this.state === "gearup" ||
      this.state === "leaderboard" ||
      this.state === "energy" ||
      this.state === "heroes" ||
      this.state === "menu"
    ) {
      return;
    }

    this.updatePlayer(dt);
    // 连杀狂潮:连杀 3 秒无新击杀则断连;每 10 连杀触发 2 秒狂潮(全装备触发加速)
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboCount = 0;
    if (this.frenzyTimer > 0) this.frenzyTimer -= dt;
    // 反射伤害预算每秒重置(上限 = 最大生命 15%)
    this.reflectTimer -= dt;
    if (this.reflectTimer <= 0) {
      this.reflectTimer = 1;
      this.reflectBudget = Math.round(this.player.maxHp * REFLECT_BUDGET_HP_PCT);
    }
    // 时间膨胀(环境词缀)×2 × 冷却缩减(天赋)×0.9 × 狂潮×0.6 × 每日天赋「疾咒」×0.85 合成全局脉冲间隔倍率
    this.ctx.globalPulseMult =
      (this.hasEnv("time_dilation") ? TIME_DILATION_MULT : 1) * cdrScaleFor(this.save.ownedTalents) * (this.frenzyTimer > 0 ? FRENZY_PULSE_MULT : 1) * this.dailyCdrMult();
    this.engine.update(this.ctx, dt);
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
    // 章型差异化(策划案 V3 §3.1):本章生成密度倍率 + 金怪混入,仅主线关卡生效(无限关保持原样)
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    const baseScale = bossActive ? 0 : this.currentStage?.spawnScale ?? 1;
    const spawnScale = baseScale * (ct?.spawnScaleMult ?? 1);
    this.waves.update(dt, this.enemies, this.player.pos, spawnScale, this.arena, this.spawnIntel(), this.owns("god_challenge"), ct?.goldMix ?? 0, this.save.seasonId);

    // 章节计时:每章 60 秒结束 → 章间商店(玩家手动开始下一章)
    this.chapterTimer += dt;
    if (this.chapterTimer >= CHAPTER_SECONDS) {
      this.chapterEnd();
      return;
    }

    // 主线关卡:Boss 生成与通关判定(第 bossChapter 章)
    if (this.currentStage) {
      if (!this.bossSpawned && this.waves.wave >= (this.currentStage.bossChapter ?? 9999)) {
        this.bossSpawned = true;
        const p = this.player.pos;
        const bossPos = vec2(clamp(p.x + BOSS_SPAWN_OFFSET_X, this.arena.x0 + BOSS_SPAWN_INSET, this.arena.x1 - BOSS_SPAWN_INSET), clamp(p.y + BOSS_SPAWN_OFFSET_Y, this.arena.y0 + BOSS_SPAWN_INSET, this.arena.y1 - BOSS_SPAWN_INSET));
        const boss = spawnEnemy("boss", bossPos, this.waves.wave, seasonMonsterDefFor("boss", this.save.seasonId, this.waves.wave));
        // Boss 独立血量曲线:随关卡增长对标玩家输出成长(标定:第 1 关 ≈20s、第 7 关 ≈40s 击杀)
        boss.maxHp = boss.hp = Math.round(boss.maxHp * bossHpMult(this.currentStage.id));
        // 偶数关弱化变体(策划案 V3 §3.1):hp×0.7、跳过 P2、无死亡分裂
        if (this.currentStage.id % 2 === 0) {
          boss.bossVariant = "weak";
          boss.maxHp = boss.hp = Math.round(boss.maxHp * BOSS_WEAK_HP_MULT);
        }
        this.enemies.push(boss);
        this.emitFx({ type: "nova", pos: vec2(bossPos.x, bossPos.y), radius: 140, ttl: 0.5, maxTtl: 0.5 });
      }
      if (this.currentStage.bossChapter && this.bossDead) {
        this.victory();
        return;
      }
    }

    this.tickFx(dt);
    this.tickDmg(dt);
    if (this.bossBanner) {
      this.bossBanner.ttl -= dt;
      if (this.bossBanner.ttl <= 0) this.bossBanner = null;
    }

    // 限制敌人数量
    if (this.enemies.length > LIMITS.enemies) {
      this.enemies.splice(0, this.enemies.length - LIMITS.enemies);
    }
  }

  /** 章节结束 → 章间商店(无限关不设上限);末章按关底结算规则判定通关/判负 */
  private chapterEnd(): void {
    this.chapterTimer = 0;
    const st = this.currentStage;
    if (st && this.chapter >= CHAPTERS_PER_STAGE) {
      if (!stageClearedAtFinalChapter(st, this.bossDead)) {
        // 有 Boss 的关第 20 章超时未杀 Boss → 阵亡结算(挑战失败;复活机会同死亡)
        this.player.hp = 0;
        this.player.alive = false;
        this.onDeath();
        return;
      }
      // 无 Boss 关撑过末章(或有 Boss 关已击杀但结算落在本章末尾)→ 通关
      this.victory();
      return;
    }
    this.openShop();
  }

  /** 商店卡等级:局内章节 + 已解锁最高关卡(数值墙:通关越后面,解锁越高级装备) */
  private shopCardLevel(): number {
    return Math.max(this.chapter + 1, this.save.highestStage);
  }

  /** 生成章间商店三张卡(品质曲线随章节提升;词缀鉴赏保证至少一张稀有;荆棘配对;有概率刷你已有卡的同款便于凑 3 张合成) */
  private refreshShopOffers(): void {
    const rareBonus = rareBonusFor(this.save.ownedTalents);
    const level = this.shopCardLevel();
    // 赛季联动词缀的修饰器倾向(DESIGN-SEASON-SETS L2):刷本套卡时首修饰器定向
    const modBias = setMutation(this.save.seasonId, this.selectedSet)?.modifierBias;
    // 赛季限定套组当季强化:本套卡偏向 60% → 70%(赛后回落;数值见 data/shop 规范表)
    const setBias = this.selectedSet && isSeasonBoosted(this.save.seasonId, this.selectedSet)
      ? SET_OFFER_BIAS.seasonBoosted
      : SET_OFFER_BIAS.normal;
    const offers: Equipment[] = [];
    for (let i = 0; i < 3; i++) {
      // 套组专属卡池:选套组后按偏向刷本套卡(凑 2/4 件套联动),其余通用池
      if (this.selectedSet && Math.random() < setBias) {
        offers.push(generateSetEquipment(this.selectedSet, level, rareBonus, modBias));
      } else {
        offers.push(generateEquipment(level, undefined, false, rareBonus));
      }
    }
    // 词缀鉴赏:至少一张稀有
    if (this.owns("affix_taste") && !offers.some((o) => o.quality !== "common")) {
      offers[0] = generateEquipment(level, "rare");
    }
    // 荆棘反伤回血流配对:补一张互补卡(引导凑齐受击+回血)
    const pair = thornPairOffer(this.player.equipment, level);
    if (pair) offers[0] = pair;
    // 合成可达成:按概率把一张商店卡替换为你已拥有卡的同款(同效果+同品质),便于凑 3 张升品
    if (this.player.equipment.length > 0 && Math.random() < DUPLICATE_OFFER_CHANCE) {
      const src = this.player.equipment[Math.floor(Math.random() * this.player.equipment.length)];
      offers[1] = {
        id: -(this.chapter * 100 + 1),
        level: src.level,
        quality: src.quality,
        name: src.name,
        triggers: src.triggers.map((t) => ({ def: t.def, params: { ...t.params } })),
        effect: { def: src.effect.def, params: { ...src.effect.params }, level: src.effect.level },
        modifiers: src.modifiers.map((m) => ({ def: m.def, params: { ...m.params } })),
      };
    }
    this.shopOffers = offers;
  }

  /** 进入章间商店 */
  private openShop(): void {
    this.recordStageProgress();
    this.refreshShopOffers();
    this.chapterRefreshes = 0; // 进店重置刷新成本阶梯
    this.state = "shop";
  }

  /** 记录本关打到过的最远章节(进度制解锁依据;商店/通关/阵亡结算三处调用) */
  private recordStageProgress(): void {
    const st = this.currentStage;
    if (!st) return;
    const furthest = this.save.stageFurthest[st.id] ?? 0;
    if (this.chapter > furthest) {
      this.save.stageFurthest[st.id] = this.chapter;
      persistSave(this.save);
    }
  }

  /** 商店卡价格:基础价 × (1 + 已购递增) × (1 + 章节递增);曲线系数见 data/shop 规范表 */
  private shopPrice(eq: Equipment): number {
    return shopCardPrice(qualityBasePrice(eq.quality), this.totalBought, this.chapter);
  }

  /** 购买卡牌:金币扣减,嵌入槽位(槽满不可买,需三合一升品/取舍) */
  private buyCard(idx: number): void {
    const eq = this.shopOffers[idx];
    if (!eq) return;
    const price = this.shopPrice(eq);
    if (this.gold < price) return;
    if (this.player.freeSlots <= 0) return; // 槽位已满
    this.gold -= price;
    this.player.equipment.push(eq);
    this.totalBought += 1;
    this.recordEquipment(eq);
    // 装备系统重构:买后不补卡,该卡位售罄(手动刷新才有新货)
    this.shopOffers[idx] = null;
  }

  /** 手动刷新价格(装备系统重构):随章节与本 chapter 已刷次数递增(系数见 data/shop 规范表)—— 金币出口兼难度策略 */
  private shopRefreshCost(): number {
    return shopRefreshPrice(this.chapter, this.chapterRefreshes);
  }

  /** 手动刷新(售罄制):花金币换 3 张新卡;无免费/广告刷新 */
  private refreshShopForGold(): void {
    const cost = this.shopRefreshCost();
    if (this.gold < cost) return;
    this.gold -= cost;
    this.chapterRefreshes += 1;
    this.refreshShopOffers();
  }

  /** 槽位扩展价格:本局已购槽位数决定(递增) */
  private slotExpandPrice(): number {
    return slotExpandCost(this.player.runSlotBonus);
  }

  /** 槽位扩展(金币出口):未达总上限且金币足够才可购 */
  private buySlot(): void {
    if (this.player.slots >= SHOP_SLOT_CAP) return;
    const price = this.slotExpandPrice();
    if (this.gold < price) return;
    this.gold -= price;
    this.player.runSlotBonus += 1;
  }

  /** 进化(形态变化):2 张同效果同品质卡 → 升一档品质(保留词条最多的 1 张,品质新轴:射速/赠量跃迁)。
   *  2 张需支付金币补位(基础价×2);3 张免费 —— 场内强化已移除,成长 = 买卡凑套 + 进化升品。 */
  private mergeCards(eq: Equipment): void {
    const pool = this.player.equipment;
    const key = this.cardTypeKey(eq);
    const same = pool.filter((x) => this.cardTypeKey(x) === key);
    if (same.length < 2) return;
    const upgrade = qualityUpgrade(eq.quality);
    if (!upgrade) return; // 隐藏已是最高
    const fullSet = same.length >= 3;
    // 2 张(非满组)需支付金币补位;3 张免费(保留"凑满"的奖励感)
    if (!fullSet) {
      const fee = qualityBasePrice(eq.quality) * MERGE_FEE_MULT;
      if (this.gold < fee) return;
      this.gold -= fee;
    }
    // 保留修饰器最多的 1 张,移除其余(2 张模式移 1,3 张模式移 2)
    const keep = [...same].sort((a, b) => b.modifiers.length - a.modifiers.length)[0];
    const removeCount = fullSet ? 2 : 1;
    const removeIds = new Set(same.filter((x) => x.id !== keep.id).slice(0, removeCount).map((x) => x.id));
    keep.quality = upgrade;
    // 数值提升:按品质成长系数重算(形态跃迁)
    const ratio = qualityPowerRatio(eq.quality, upgrade);
    const p = keep.effect.params;
    for (const k of ["damage", "dps", "heal", "amount"] as const) {
      if (typeof p[k] === "number") p[k] = Math.round(p[k] * ratio);
    }
    this.player.equipment = pool.filter((x) => !removeIds.has(x.id));
    this.recordEquipment(keep);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    if (!p.alive) {
      // 死亡:先给"看广告复活"机会,入账延后到放弃(重开/菜单/天赋)时
      this.onDeath();
      return;
    }
    p.movedThisFrame = 0;
    const before = vec2(p.pos.x, p.pos.y);
    const a = this.arena;
    // 纵向空气墙顶到上下坞边(按半径钳制:身体贴栏不越栏);坞高变化时 arena 随之变化
    const yMin = a.y0 + PLAYER_BASE.radius, yMax = a.y1 - PLAYER_BASE.radius;
    if (input.isMoving) {
      // 手动输入覆盖自动控制
      const mv = input.moveDir;
      p.pos.x = clamp(p.pos.x + mv.x * PLAYER_BASE.speed * p.speedMult * dt, a.x0 + 30, a.x1 - 30);
      p.pos.y = clamp(p.pos.y + mv.y * PLAYER_BASE.speed * p.speedMult * dt, yMin, yMax);
    } else if (this.autoMove) {
      // 自主控制(挂机):贴身才躲(避免小竞技场里自陷包围),平时顺时针巡场
      const nearest = this.nearestEnemy(p.pos, 110);
      let mvx = 0;
      let mvy = 0;
      if (nearest) {
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
    // 毒池/灼烧池 DoT:6 点/秒(0.25s tick × 1.5),不走受击管线(是地形不是攻击,不触发受击类装备)
    if (isInPool(p.pos, this.obstacles)) {
      this.poolTickAcc += dt;
      while (this.poolTickAcc >= OBSTACLE.poolTick) {
        this.poolTickAcc -= OBSTACLE.poolTick;
        p.takeDamage(OBSTACLE.poolDps * OBSTACLE.poolTick);
      }
    } else {
      this.poolTickAcc = 0;
    }
    p.movedThisFrame = Math.hypot(p.pos.x - before.x, p.pos.y - before.y);
    p.update(dt);
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    // 光环载体预筛(批 4):每帧一次,圈内派生乘数见 auraMultAt(现表 ≤ 2 载体,扫描成本可忽略)
    const auraCarriers = this.enemies.filter((a) => a.hp > 0 && a.def.skill?.aura !== undefined);
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      // 治疗光环:敌人每秒回复 2% 生命(策划案 4.2)
      if (this.hasEnv("heal_aura")) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_AURA_RATE * dt);
      }
      // 隐匿迷雾:所有敌人周期性隐身(策划案 4.2)
      if (this.hasEnv("mist")) {
        e.hiddenTimer += dt;
        const t = e.hiddenTimer % MIST_CYCLE;
        e.hidden = t >= MIST_VISIBLE;
      }
      // 光环派生乘数(批 4):速度入移动尾参,伤害乘接触伤害;无载体 = undefined,基线路径零开销
      const aura = auraCarriers.length > 0 ? auraMultAt(e, auraCarriers) : undefined;
      // 批 4 精英/首领技能(附加层:先技能后 kind 移动)。
      // 预警入 skillTelegraphs 由本层倒计时/渲染/引爆;火带落池走 dropBurnPool(cap 取载体表值)
      updateSkill(e, dt, p.pos, PLAYER_BASE.radius, this.arena, {
        spawnChild: (kind, pos, def) => {
          if (this.enemies.length < LIMITS.enemies) {
            this.enemies.push(spawnEnemy(kind, pos, this.waves.wave, def));
            this.emitSummonFx(pos, def?.color ?? "#ff8a65"); // 技能召唤:传送门色 = 子怪皮色
          }
        },
        onTelegraph: (t) => this.skillTelegraphs.push({ t, total: t.charge, src: e }),
        // 冲锋单次撞击:走受击管线(触发受击类装备)+ 可选减速/落点燃池(撞击点快照)
        onChargeHit: (dmg, pos, slow, ignite) => {
          this.player.takeDamage(dmg);
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
      // 特化机制:隐匿者隐身 / 召唤师召怪(策划案 4.3)
      updateSpecial(e, dt, (kind, pos) => {
        if (this.enemies.length < LIMITS.enemies) {
          this.enemies.push(spawnEnemy(kind, pos, this.waves.wave));
          this.emitSummonFx(pos, "#ff8a65"); // 召唤师:橙色传送门
        }
      });
      // Boss 三阶段(策划案 V3 §3.2):阶段推进 + 召唤 + 地面震击
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
      // 敌人机制装饰特效(隐身进出/登场/震击预警余烬/狂暴火光;纯视觉)
      this.emitEnemyFx(e, dt);
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
      const rr = e.def.radius + PLAYER_BASE.radius;
      if (d <= rr && e.hitCooldown <= 0) {
        e.hitCooldown = CONTACT_HIT_CD;
        // 光环伤害派生乘数(批 4):乘数 = 1 时与基线字节一致
        const cdmg = Math.max(1, Math.round(e.def.contactDmg * (aura?.dmg ?? 1)));
        this.player.takeDamage(cdmg);
        this.engine.onHurt(this.ctx, cdmg, e);
        this.spawnDmg(p.pos, cdmg, "#ff6b6b");
        // 撕咬反馈:玩家身边红色血屑 + 轻震屏(纯装饰)
        this.fxLayer.burst({
          x: p.pos.x, y: p.pos.y, count: 5, color: "#ff6b6b",
          speed: [60, 190], size: [1.2, 2.6], life: [0.15, 0.35], halo: 2.6, drag: 4,
        });
        this.fxLayer.addShake(1.4);
        // 主题怪机制(批 2):凝滞之触命中即冻结玩家脚步(冰蓝碎屑 = 减速可读反馈)
        if (e.def.mech?.type === "slowOnHit") {
          this.player.applySlow(e.def.mech.factor, e.def.mech.duration);
          this.fxLayer.burst({
            x: p.pos.x, y: p.pos.y, count: 6, color: "#9be8ff",
            speed: [40, 130], size: [1.4, 2.8], life: [0.25, 0.5], halo: 2.4, drag: 3,
          });
        }
        // 荆棘反伤回血流:每次挨打回 2% 最大生命(故意挨打 → 回血联动)
        if (this.isThornBuild()) {
          this.player.heal(Math.max(1, Math.round(this.player.maxHp * THORN_HEAL_PCT)));
        }
      }
    }
    // 石柱统一推挤 pass(DESIGN-S4 §3.2):敌人不寻路,最小位移推出石柱
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      for (const ob of this.obstacles) pushOutOfPillar(e.pos, e.def.radius, ob);
    }
    removeIf(this.enemies, (e) => e.hp <= 0);
  }

  /** Boss 阶段切换(策划案 V3 §3.2):阶段横幅 + Boss 身上预警波特效 */
  private showBossPhase(phase: 2 | 3): void {
    this.bossBanner = { text: phase === 2 ? "阶段二 · 地面震击" : "阶段三 · 狂暴", ttl: 2 };
    const boss = this.enemies.find((e) => e.kind === "boss" && e.hp > 0);
    if (boss) this.emitFx({ type: "nova", pos: vec2(boss.pos.x, boss.pos.y), radius: 120, ttl: 0.5, maxTtl: 0.5 });
  }

  /** 通用震击引爆:冲击波 + 碎屑 + 震屏,半径内玩家走受击管线(触发受击类装备)。Boss 三阶段与批 4 技能预警共用 */
  private detonateSlam(pos: Vec2, radius: number, dmg: number, src: Enemy | null, burstColor: string): void {
    this.emitFx({ type: "nova", pos: vec2(pos.x, pos.y), radius, ttl: 0.4, maxTtl: 0.4 });
    // 引爆强化反馈:碎屑飞溅 + 强震屏(纯装饰)
    this.fxLayer.burst({
      x: pos.x, y: pos.y, count: 18, color: burstColor,
      speed: [120, 380], size: [1.6, 3.6], life: [0.3, 0.6], halo: 3, drag: 1.6, gravity: 160,
    });
    this.fxLayer.addShake(6);
    const p = this.player;
    if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) <= radius + PLAYER_BASE.radius) {
      p.takeDamage(dmg);
      this.engine.onHurt(this.ctx, dmg, src);
      this.spawnDmg(p.pos, dmg, "#ff6b6b");
      if (this.isThornBuild()) p.heal(Math.max(1, Math.round(p.maxHp * THORN_HEAL_PCT)));
    }
  }

  /** Boss 地面震击引爆(策划案 V3 §3.2 P2):震点半径内玩家受伤(走受击管线,触发受击类装备) */
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

  /** 震击预警圈渲染:基线 Boss 红圈(字节级保留)+ 批 4 技能预警(圈色 = 载体色;全场雾型 = 战场 tint) */
  private drawSlamWarn(g: CanvasRenderingContext2D): void {
    // Boss 地面震击预警(策划案 V3 §3.2 P2):震点红圈,随蓄力进度变亮(可走位躲避)
    const bossWarn = this.enemies.find((e) => e.kind === "boss" && e.hp > 0 && e.bossSlamCharge > 0 && e.bossSlamPos);
    if (bossWarn && bossWarn.bossSlamPos) {
      const prog = 1 - bossWarn.bossSlamCharge / BOSS_SLAM.charge;
      g.strokeStyle = `rgba(255,60,60,${0.35 + 0.55 * prog})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(bossWarn.bossSlamPos.x, bossWarn.bossSlamPos.y, BOSS_SLAM.radius, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = `rgba(255,60,60,${0.06 + 0.14 * prog})`;
      g.fill();
    }
    // 批 4 技能预警:同口径随蓄力进度变亮;圈色 = 载体 def.color(区分来源)
    for (const st of this.skillTelegraphs) {
      const t = st.t;
      const prog = clamp(1 - t.charge / st.total, 0, 1);
      if (t.global) {
        g.fillStyle = hexA(t.color, 0.04 + 0.1 * prog);
        g.fillRect(this.arena.x0, this.arena.y0, this.arena.x1 - this.arena.x0, this.arena.y1 - this.arena.y0);
        continue;
      }
      g.strokeStyle = hexA(t.color, 0.35 + 0.55 * prog);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(t.pos.x, t.pos.y, t.radius, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = hexA(t.color, 0.06 + 0.14 * prog);
      g.fill();
    }
  }

  private updateProjectiles(dt: number): void {
    for (const proj of this.projectiles) {
      updateProjectile(proj, dt);
      // 追踪转向(冰锥 icelance):朝最近未命中活敌转 homing rad/s
      if (proj.homing) steerHoming(proj, this.enemies, dt);
      if (proj.ttl <= 0) continue;
      // 空间扭曲:投射物轨迹正弦弯曲,难以命中(策划案 4.2)
      if (this.hasEnv("space_warp")) {
        const sp = Math.hypot(proj.vel.x, proj.vel.y) || 1;
        const wobble = Math.sin((this.elapsed + proj.id * 1.7) * 4) * 110 * dt;
        proj.pos.x += (-proj.vel.y / sp) * wobble;
        proj.pos.y += (proj.vel.x / sp) * wobble;
      }
      // FX 拖尾:位置定稿(含空间扭曲偏移)后按距离补粒子
      this.emitProjTrail(proj);
      // 石柱阻挡(DESIGN-S4 §3.2):命中即消亡,连锁/穿透/爆炸不触发
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
          // 吞噬投射:基线吞噬者(策划案 4.3)+ 批 4 技能载体(极渊之颚);吸收比例 = 表值,基线 0.5
          if (e.kind === "devourer" || e.def.skill?.devour) {
            const healRate = e.def.skill?.devour?.healRate ?? 0.5;
            const healed = Math.round(proj.damage * healRate);
            e.hp = Math.min(e.maxHp, e.hp + healed);
            this.spawnDmg(e.pos, healed, "#26a69a");
            // 吞噬吸收:投射物在命中点被吞没(载体色内收),纯装饰
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
          if (proj.explode) this.engine.explode(proj.source, this.ctx, proj.pos, proj.explode, {
            power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: proj.lifesteal, pierce: 0,
          });
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
        // 陨星 telegraph:倒计时由消散通路引爆,不做周期 tick;此处只补落点余烬(纯装饰)
        this.emitMeteorTelegraph(c, dt);
        continue;
      }
      if (c.ring) {
        // 霜环(极北冰脉):半径逐帧扩张,扫到的敌人一次性伤害 + 减速(每敌一次)
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
          // 回血池(组合技「深渊裂隙」):只治疗玩家,不伤敌
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
        // 陨星落点引爆(熔核教团):AOE 伤害 + 留灼烧余烬小云(爆炸修饰器走下方通用消散通路)
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

  /** 金币吸附与拾取(替代经验宝石;场内金币 → 商店买卡) */
  private updateGems(dt: number): void {
    const p = this.player;
    const autoPick = autoPickupFor(this.save.ownedTalents); // 自动拾取:全屏吸附
    const magnetR = autoPick ? 99999 : GEM_MAGNET_RADIUS;
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
        this.gold += gem.value; // 金币
      }
    }
    removeIf(this.gems, (g) => g.picked);
  }

  private nearestEnemy(from: Vec2, range: number, exclude?: Set<number>): Enemy | null {
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

  /** 开始下一章(章间商店 → 新一章:清场、换竞技场、回到中心) */
  /** 开始下一章(章间商店 → 新一章:清场、换竞技场、回到中心,章节开局刷一波怪) */
  private nextChapter(): void {
    this.chapter += 1;
    this.chapterTimer = 0;
    this.arena = this.chapterArena(this.chapter);
    this.enemies.length = 0;
    this.skillTelegraphs.length = 0;
    this.projectiles.length = 0;
    this.clouds.length = 0;
    this.minions.length = 0;
    this.gems.length = 0;
    this.fxLayer.reset();
    this.bossSpawned = false;
    this.bossBanner = null;
    this.player.pos = vec2((this.arena.x0 + this.arena.x1) / 2, (this.arena.y0 + this.arena.y1) / 2);
    // 地形重生成(策划案 V3 §6):与"清场换章"同节奏;第 1 章与 Boss 章净空
    this.obstacles = rollChapterObstacles(this.chapter, this.arena, Math.random, this.currentStage?.bossChapter);
    this.poolTickAcc = 0;
    // 章节开局先刷一波怪,避免开局空场(密集度反馈;本章主力敌种加权 + 血量加成)
    // 章型差异化(策划案 V3 §3.1):精英章密度/burst 提升、宝箱章混入金怪;仅主线关卡生效
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    const burst = Math.round((6 + Math.floor(this.chapter / 3)) * (ct?.burstMult ?? 1));
    const intel = this.spawnIntel();
    for (let i = 0; i < burst; i++) {
      let kind = randomEnemyKind(this.chapter, this.owns("god_challenge"));
      if (intel.prefer && Math.random() < intel.bias) kind = intel.prefer;
      if (ct && ct.goldMix > 0 && Math.random() < ct.goldMix) kind = "goldkind";
      const e = spawnEnemy(kind, this.chapterEdgePos(), this.chapter, seasonMonsterDefFor(kind, this.save.seasonId, this.chapter));
      if (intel.hpBuff > 0 && kind === intel.prefer) {
        const buffed = Math.round(e.maxHp * (1 + intel.hpBuff));
        e.maxHp = buffed;
        e.hp = buffed;
      }
      this.enemies.push(e);
    }
    this.state = "playing";
  }

  /** 本章敌情(克制导向):主力敌种 +40% 血量、45% 生成倾向;精英章强制主力为精英(策划案 V3 §3.1) */
  private spawnIntel() {
    const i = chapterIntel(this.chapter, this.save.seasonId);
    const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
    const forced = ct?.intelPrefer ?? null;
    return { prefer: forced ?? i.prefer, hpBuff: 0.4, bias: forced ? ct!.intelBias : 0.45 };
  }

  /** 首局引导上下文(每帧组装,供教学步骤条件判断) */
  private guideCtx(): GuideCtx {
    return {
      playing: this.state === "playing",
      shop: this.state === "shop",
      elapsed: this.elapsed,
      chapter: this.chapter,
      kills: this.kills,
      equipmentCount: this.player.equipment.length,
      hasSet: !!this.selectedSet,
      setInfo: this.selectedSet ? setDef(this.selectedSet).name : "",
      mergesAvailable: this.mergeGroups().length,
    };
  }

  /** 委托是否已完成待领取(有效收益窗口 ≥2h 提醒;0/双委托任一满足) */
  private commissionReady(): boolean {
    const now = Date.now();
    return [this.save.commission, this.save.commission2].some((c) => !!c && (now - c.startedAt) / 3600000 >= COMMISSION_READY_HOURS);
  }

  /* ---------- 广告驱动商业化核心(弹壳特攻队思维 + 数值墙成长) ---------- */

  /** 每日重置:跨天清零每日计数(广告/宝箱/天赋/体力广告),并抽取今日天赋 */
  private checkDailyReset(): void {
    if (needsDailyReset(this.save.dailyDate)) {
      this.save.dailyDate = todayKey();
      this.save.adWatchCount = 0;
      this.save.energyAdCount = 0;
      this.save.dailyBoxClaimed = [];
      this.save.dailyGachaAdUsed = false;
      this.save.dailyTalentClaimed = [];
      this.save.dailyTalents = rollDailyTalents();
      persistSave(this.save);
    }
    // 每日天赋初始化(新存档/首次进入)
    if (this.save.dailyTalents.length === 0) {
      this.save.dailyTalents = rollDailyTalents();
      persistSave(this.save);
    }
  }

  /* ---------- 赛季壳(策划案 V3 §4.1:14 天赛季 + 门控 + 结算) ---------- */

  /** 当前赛季第几天(1–14) */
  private currentSeasonDay(): number {
    return seasonDay(this.save.seasonStartAt, Date.now());
  }

  /** 关卡是否解锁(进度制:通关前关,或前关打到 STAGE_UNLOCK_PROGRESS 比例章节) */
  private stageOpen(id: number): boolean {
    if (id <= 1) return true;
    const furthestPrev = this.save.stageFurthest[id - 1] ?? 0;
    return stageUnlocked(id, this.save.highestStage, furthestPrev, CHAPTERS_PER_STAGE, STAGE_UNLOCK_PROGRESS);
  }

  /**
   * 赛季到期结算翻页:赛季分→星尘,重置星数/赛季最佳,赛季 +1。
   * 循环处理离线跨多个赛季的情况;只在真正翻页时持久化一次。
   */
  private syncSeason(): void {
    const now = Date.now();
    if (!seasonEnded(this.save.seasonStartAt, now)) return;
    let rolled = false;
    while (seasonEnded(this.save.seasonStartAt, now)) {
      const score = seasonScore(this.save.stageStars, this.save.seasonBest);
      const dust = seasonStardust(score);
      this.save.stardust += dust;
      // 只保留最近一次翻页的摘要展示(离线跨多赛季时前面赛季已空转)
      this.seasonSummary = { id: this.save.seasonId, score, stardust: dust };
      this.save.seasonId += 1;
      this.save.seasonStartAt += SEASON_DAYS * DAY_MS;
      this.save.stageStars = [0, 0, 0, 0, 0, 0, 0, 0];
      this.save.seasonBest = 0;
      rolled = true;
    }
    if (rolled) {
      this.rankImprovedTo = null; // 赛季翻页换榜,旧名次提示作废
      persistSave(this.save);
    }
  }

  /** 应用体力自然恢复(时间戳结算,与委托同模式;无需持久化,时间戳天然跨会话) */
  private syncEnergy(): void {
    const r = regenEnergy(this.save.energy, this.save.lastEnergyAt, Date.now());
    this.save.energy = r.energy;
    this.save.lastEnergyAt = r.lastEnergyAt;
  }

  /** 是否已领取某个每日天赋 */
  private hasDailyTalent(id: string): boolean {
    return this.save.dailyTalentClaimed.includes(id);
  }

  /** 本局每日天赋全局伤害倍率(战意 +20%) */
  private dailyDmgMult(): number {
    return this.hasDailyTalent("dmg20") ? 1 + dailyTalentOf("dmg20").value : 1;
  }

  /** 本局每日天赋全局脉冲间隔(疾咒 -15%) */
  private dailyCdrMult(): number {
    return this.hasDailyTalent("cd15") ? 1 - dailyTalentOf("cd15").value : 1;
  }

  /** 本局每日天赋金币掉落倍率(淘金 +50%) */
  private dailyGoldMult(): number {
    return this.hasDailyTalent("gold50") ? 1 + dailyTalentOf("gold50").value : 1;
  }

  /** 本局广告复活次数上限(默认 1 次;每日天赋「不屈」额外 +1) */
  private reviveLimit(): number {
    return 1 + (this.hasDailyTalent("extra_revive") ? dailyTalentOf("extra_revive").value : 0);
  }

  /**
   * 看广告统一入口:播放激励视频,完整观看发放奖励并回调 onOk。
   * 每次完整观看 +1 钻石(每日上限内)——广告 → 钻石 → 体力/扭蛋券 的硬通货闭环。
   * 中途关闭/不可用时回调 onFail(可空),不发奖励。
   */
  private watchAd(onOk: () => void, onFail?: () => void): void {
    if (this.adBusy) return;
    this.adBusy = true;
    platform.showRewardedAd((ok) => {
      this.adBusy = false;
      if (ok) {
        this.save.adWatchCount += 1;
        if (this.save.adWatchCount <= DIAMOND_AD_DAILY) {
          this.save.diamond += DIAMOND_PER_AD;
        }
        persistSave(this.save);
        onOk();
      } else if (onFail) {
        onFail();
      }
    });
  }

  /** 广告复活:满血复活回战斗(本局限次;复活成功不触发死亡结算) */
  private revive(): void {
    const p = this.player;
    p.alive = true;
    p.hp = p.maxHp;
    p.shield = 0;
    p.shieldTtl = 0;
    p.addShield(p.maxHp, REVIVE_SHIELD_SECONDS); // 2 秒无敌盾,避免复活被贴身围杀
    // 清掉贴身的敌人,给喘息空间
    removeIf(this.enemies, (e) => Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) < REVIVE_CLEAR_RADIUS);
    this.reviveUsed += 1;
    this.pendingSettle = false;
    this.rankImprovedTo = null; // 复活后死亡结算取消,幻影名次提示作废(下次死亡重算)
    this.state = "playing";
  }

  /** 死亡:进入结算界面并挂起入账(给"看广告复活"机会;放弃时才真正结算) */
  private onDeath(): void {
    this.state = "gameover";
    this.pendingSettle = true;
    // 预计算本局所得(展示用;实际入账在放弃时 settleRun)
    const gained = calcPrestigePoints(this.elapsed, this.kills, 1);
    this.pointsEarnedThisRun = gained;
    this.stardustEarnedThisRun = 0;
    // 幻影榜名次提示(§4.3):死亡结算挂起到放弃才入账,此处按预期 seasonBest 预先比较名次。
    // 玩家看广告复活则清掉(未真正入账,下次死亡重算)。
    const board = phantomBoard(this.save.seasonId);
    const before = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), board);
    const projectedBest = Math.max(this.save.seasonBest, this.chapter);
    const after = rankAmong(seasonScore(this.save.stageStars, projectedBest), board);
    this.rankImprovedTo = after < before ? after : null;
  }

  /** 放弃本局时才结算死亡(复活成功不结算) */
  private settlePendingRun(): void {
    if (!this.pendingSettle) return;
    this.recordStageProgress(); // 阵亡也记进度:打到第 X 章即计入解锁条件
    this.settleRun();
  }

  /* ---------- 二次确认弹窗(重开/返回主页等破坏性操作) ---------- */

  private openConfirm(text: string, ok: () => void): void {
    this.confirm = { text, ok };
  }

  private confirmLayout() {
    return confirmRects(this.logicalW, this.logicalH);
  }

  /** 全屏面板底垫(美术翻新):默认 panel_dark_corners 九宫格;可指定专属面板键,缺图回退通用底 */
  private panelPad(g: CanvasRenderingContext2D, w: number, h: number, key?: string): void {
    const pad = ui.pad;
    if (key && this.assets.drawNine(g, key, pad, pad, w - pad * 2, h - pad * 2, 32)) return;
    this.assets.drawNine(g, "panel_dark_corners", pad, pad, w - pad * 2, h - pad * 2, 32);
  }

  private drawConfirm(g: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.confirm) return;
    g.fillStyle = "rgba(0,0,0,0.62)";
    g.fillRect(0, 0, w, h);
    const L = this.confirmLayout();
    const b = L.box;
    if (!this.assets.drawNine(g, "panel_dark_corners", b.x, b.y, b.w, b.h, 32)) {
      panel(g, b.x, b.y, b.w, b.h, { stroke: "#ffd76a" });
    }
    if (!this.assets.drawNine(g, "banner_mid_navy", b.x + 14, b.y + 10, b.w - 28, 30, 13)) {
      g.fillStyle = "rgba(18,24,44,0.88)";
      g.fillRect(b.x + 14, b.y + 10, b.w - 28, 30);
      g.strokeStyle = "rgba(255,215,106,0.35)";
      g.lineWidth = 1;
      g.strokeRect(b.x + 14, b.y + 10, b.w - 28, 30);
    }
    g.fillStyle = "#ffd76a";
    g.font = F(fs.body, true);
    g.textAlign = "center";
    g.fillText("确认操作", b.x + b.w / 2, b.y + 30);
    g.fillStyle = "#cfd6e2";
    g.font = F(fs.body);
    const lines = this.fitLines(this.confirm.text, b.w - 40);
    if (lines.length >= 2) {
      g.fillText(lines[0], b.x + b.w / 2, b.y + 67);
      g.fillText(lines[1], b.x + b.w / 2, b.y + 89);
    } else if (lines.length === 1) {
      g.fillText(lines[0], b.x + b.w / 2, b.y + 80);
    }
    dangerButton(g, L.ok.x, L.ok.y, L.ok.w, L.ok.h, "确认", this.assets);
    minorButton(g, L.cancel.x, L.cancel.y, L.cancel.w, L.cancel.h, "取消", undefined, this.assets);
    g.textAlign = "left";
  }

  /** 本章竞技场边缘随机出生点(开局刷怪用) */
  private chapterEdgePos(): Vec2 {
    const a = this.arena;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y0 + 40);
    if (side === 1) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y1 - 40);
    if (side === 2) return vec2(a.x0 + 40, rand(a.y0 + 40, a.y1 - 40));
    return vec2(a.x1 - 40, rand(a.y0 + 40, a.y1 - 40));
  }

  /** 商店三合一升品:可合并的卡组(同名同品质 ≥2;2 张保底 + 金币,3 张免费) */
  /** 卡牌类型键(效果+品质)——"2 张同效果同品质即可进化",触发器不再参与判定 */
  private cardTypeKey(eq: Equipment): string {
    return eq.effect.def.type + "|" + eq.quality;
  }

  private mergeGroups(): { name: string; quality: Quality; count: number; sample: Equipment }[] {
    const map = new Map<string, { name: string; quality: Quality; count: number; sample: Equipment }>();
    for (const eq of this.player.equipment) {
      const key = this.cardTypeKey(eq);
      const g = map.get(key);
      if (g) g.count += 1;
      else map.set(key, { name: eq.effect.def.name, quality: eq.quality, count: 1, sample: eq });
    }
    return [...map.values()].filter((g) => g.count >= 2).slice(0, 4);
  }

  /**
   * 章间商店布局(重设计):纯几何来自 src/ui/shop.ts(固定几何,与屏高无关),
   * 此层只附业务身份(武器行/强化/销毁附 id,进化行附 group)。
   * 空态占位行不产命中矩形;绘制与命中同源于此。
   */
  private shopLayout() {
    const eqs = this.player.equipment.slice(0, 8);
    const groups = this.mergeGroups();
    const P = shopLayoutPure(eqs.length, groups.length);
    const weaponRows = P.weaponRows.slice(0, eqs.length).map((r, i) => ({ ...r, id: eqs[i].id }));
    return {
      ...P,
      /** 纯几何(含空态占位行),仅绘制用;命中走附身份数组 */
      geom: P,
      weaponRows,
      destroyRects: P.destroyRects.slice(0, eqs.length).map((r, i) => ({ ...r, id: eqs[i].id })),
      merges: P.merges.slice(0, groups.length).map((r, i) => ({ ...r, group: groups[i] })),
    };
  }

  /** 分区标题条:banner_mid_navy 九宫格 + 金字(左标题/右副信息);缺图回退平面暗条。高 26 */
  private drawSectionHeader(g: CanvasRenderingContext2D, title: string, y: number, right: string): void {
    const x = ui.pad;
    const bw = this.logicalW - ui.pad * 2;
    if (!this.assets.drawNine(g, "banner_mid_navy", x, y, bw, 26, 13)) {
      g.fillStyle = "rgba(11,14,20,0.85)";
      g.fillRect(x, y, bw, 26);
      g.strokeStyle = "rgba(255,215,106,0.25)";
      g.lineWidth = 1;
      g.strokeRect(x, y, bw, 26);
    }
    g.fillStyle = theme.gold as string;
    g.font = F(fs.muted, true);
    g.textAlign = "left";
    g.fillText(this.fitOne(title, 330), x + 10, y + 18);
    g.fillStyle = theme.textSecondary as string;
    g.font = F(fs.micro);
    g.textAlign = "right";
    g.fillText(this.fitOne(right, 150), x + bw - 10, y + 18);
    g.textAlign = "left";
  }

  /**
   * 章间商店(重设计):自绘顶信息条(0..64)+ 底操作条(948..996),与战斗双坞同源同位;
   * 内容区 (64,948) 固定骨架——工具钮→三卡→槽位→武器管理→进化,进化区底锚贴底坞。
   * 按钮全走主题皮(禁态平面),卡框走代码品质框;文本全经 fitOne/fitLines 限位。
   */
  private drawShop(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.shopLayout();
    const pad = ui.pad;
    // 单层覆盖压暗(bg_shop cover 已在 render 铺;旧双重叠层与 panelPad 已删)
    g.fillStyle = "rgba(8,10,16,0.82)";
    g.fillRect(0, 0, w, this.worldH());
    this.drawRestZone(g, w, h);
    g.textAlign = "left";

    /* ---------- 顶信息条 0..64:战斗顶坞同骨架(三行基线 19/39/58) ---------- */
    this.drawDockPlate(g, "hud_dock_top", 0, 0, w, HUD_TOP_H, false);
    const intel = chapterIntel(this.chapter, this.save.seasonId);
    const shopIntelIcon: Record<string, string> = { 尸潮: "intel_horde", 重甲: "intel_armor", 异变: "intel_mutant", 精英: "intel_elite" };
    // R1:左标题 / 右金币链
    g.fillStyle = theme.gold as string;
    g.font = F(fs.micro, true);
    g.fillText("章间商店", pad, 19);
    const goldTxt = String(this.gold);
    const goldW = g.measureText(goldTxt).width + 16;
    iconText(g, this.assets, "icon_gold", "✦", goldTxt, w - pad - goldW, 19, theme.gold, 12);
    // R2:左本章敌情 / 右槽位数
    let ix = pad;
    const sIk = shopIntelIcon[intel.title];
    if (sIk && this.assets.draw(g, sIk, ix, 29, 12, 12)) ix += 16;
    g.fillStyle = "#c9d1e0";
    g.font = F(fs.micro);
    g.fillText(this.fitOne(`第 ${this.chapter} 章 · 敌情:${intel.title}(${intel.desc})`, 330), ix, 39);
    g.fillStyle = theme.textSecondary as string;
    g.textAlign = "right";
    g.fillText(this.fitOne(`槽位 ${this.player.equipment.length}/${this.player.slots}`, 120), w - pad, 39);
    g.textAlign = "left";
    // R3:左套组链(胶囊进度)/ 推荐;右卡价提示
    const sb = setBonusState(this.player.equipment, this.selectedSet);
    if (sb) {
      const s = setDef(sb.id);
      g.fillStyle = s.color;
      g.font = F(fs.micro, true);
      const setTxt = `套组:${s.name} ${sb.pieces}/4`;
      g.fillText(setTxt, pad, 58);
      const bx = pad + Math.min(150, g.measureText(setTxt).width) + 8;
      drawBar(g, bx, 52, 90, 6, sb.pieces / 6, s.color);
      g.fillStyle = theme.textSecondary as string;
      g.font = F(fs.micro);
      // 赛季联动词缀(DESIGN-SEASON-SETS L2):3 件激活时替换 3 件段展示(门槛随 3/6 档位制)
      const mut = setMutation(this.save.seasonId, this.selectedSet);
      const bonusTxt =
        sb.pieces >= 3 && mut
          ? `✓3件·${s.bonus3.name} · 联动:${mut.name}`
          : `${sb.bonus3 ? "✓" : "·"}3件·${s.bonus3.name} ${sb.bonus6 ? "✓" : "·"}6件·${s.bonus6.name}`;
      g.fillText(this.fitOne(bonusTxt, 190), bx + 98, 58);
    } else {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      let recTxt = "未选套组(通用卡池)";
      if (intel.recommended) recTxt += ` · 推荐:${setDef(intel.recommended).name}`;
      g.fillText(this.fitOne(recTxt, 330), pad, 58);
    }
    g.fillStyle = theme.textMuted as string;
    g.font = F(fs.micro);
    g.textAlign = "right";
    g.fillText("卡价随购买递增", w - pad, 58);
    g.textAlign = "left";

    /* ---------- 内容区 64..948:固定骨架 ---------- */
    // 列表垫底:细暗底吸收行数富余(底部恒止于 942,贴底坞留 6px 呼吸缝)
    const zoneY = L.weaponLabelY - 8;
    g.fillStyle = "rgba(255,255,255,0.03)";
    g.fillRect(8, zoneY, w - 16, SHOP_ROW_BOTTOM + 2 - zoneY);

    // 工具钮行:刷新/融合(次级皮)/ 重开/主页(危险皮);禁态保持平面
    for (const b of L.toolBtns) {
      const isRefresh = b.id === "refresh";
      const refreshAvail = isRefresh ? this.gold >= this.shopRefreshCost() : true;
      const enabled = b.id === "fusion" ? this.player.equipment.length >= 2 : isRefresh ? refreshAvail : true;
      if (b.id === "restart" || b.id === "home") {
        dangerButton(g, b.x, b.y, b.w, b.h, b.label, this.assets);
        continue;
      }
      if (enabled) {
        minorButtonBg(g, b.x, b.y, b.w, b.h, this.assets);
        g.fillStyle = (isRefresh ? theme.gold : theme.actionPrimary) as string;
      } else {
        g.fillStyle = "#1A1F2A";
        g.fillRect(b.x, b.y, b.w, b.h);
        g.strokeStyle = "rgba(255,255,255,0.15)";
        g.lineWidth = 1;
        g.strokeRect(b.x, b.y, b.w, b.h);
        g.fillStyle = theme.textMuted as string;
      }
      g.font = F(fs.body, true);
      g.textAlign = "center";
      g.fillText(b.id === "refresh" ? `刷新 ${this.shopRefreshCost()}金` : b.label, b.x + b.w / 2, rowTextY(b.y, b.h, fs.body));
      g.textAlign = "left";
    }

    // 三张可购卡(买后售罄:购买不补卡,刷新才有新货):代码品质框 + 效果图标(竖卡框贴图畸变问题连根拔除)
    this.shopOffers.forEach((eqOrNull, i) => {
      const r = L.cards[i];
      if (!eqOrNull) {
        drawQualityFrame(g, r.x, r.y, r.w, r.h, "#3a465c", { topBar: true });
        const seal = Math.min(r.w, r.h) - 16;
        g.globalAlpha = 0.9;
        this.assets.draw(g, "card_soldout", r.x + (r.w - seal) / 2, r.y + (r.h - seal) / 2, seal, seal);
        g.globalAlpha = 1;
        g.fillStyle = "#8f9bb3";
        g.font = F(fs.section, true);
        g.textAlign = "center";
        g.fillText("售 罄", r.x + r.w / 2, r.y + r.h / 2 + 6);
        g.font = F(fs.micro);
        g.fillText("点「刷新」补货", r.x + r.w / 2, r.y + r.h / 2 + 28);
        g.textAlign = "left";
        return;
      }
      const eq = eqOrNull;
      const q = qualityDef(eq.quality);
      const price = this.shopPrice(eq);
      const afford = this.gold >= price && this.player.freeSlots > 0;
      drawQualityFrame(g, r.x, r.y, r.w, r.h, q.color, { topBar: true });
      const icx = r.x + r.w / 2;
      if (!this.assets.draw(g, `icon_fx_${eq.effect.def.type}`, icx - 18, r.y + 14, 36, 36)) {
        g.fillStyle = hexA(q.color, 0.22);
        g.beginPath();
        g.arc(icx, r.y + 32, 16, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = hexA(q.color, 0.7);
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = q.color;
        g.font = F(fs.section, true);
        g.textAlign = "center";
        g.fillText(eq.effect.def.name[0], icx, r.y + 38);
        g.textAlign = "left";
      }
      g.textAlign = "center";
      g.fillStyle = q.color;
      g.font = F(fs.body, true);
      g.fillText(this.fitOne(eq.effect.def.name, 156), icx, r.y + 66);
      g.font = F(fs.muted);
      g.fillText(q.name, icx, r.y + 84);
      g.fillStyle = "#cfcfcf";
      g.font = F(fs.micro);
      const trig = eq.triggers.map((t) => t.def.name).join("/");
      const mod = eq.modifiers.map((m) => m.def.name).join("/");
      const descLines = this.fitLines(`${trig}${mod ? "·" + mod : ""}`, r.w - 16);
      g.fillText(descLines[0] ?? "", icx, r.y + 104);
      if (descLines[1]) g.fillText(descLines[1], icx, r.y + 120);
      g.fillStyle = (afford ? theme.gold : theme.textMuted) as string;
      g.font = F(fs.body, true);
      g.fillText(afford ? `购买 ${price}金` : `¥${price}`, icx, r.y + r.h - 14);
      g.textAlign = "left";
      // 套组专属卡标记(属于当前出战套组)
      if (this.selectedSet && isSetPiece(eq, this.selectedSet)) {
        const s = setDef(this.selectedSet);
        g.fillStyle = hexA(s.color, 0.18);
        g.fillRect(r.x + r.w - 40, r.y + 8, 34, 15);
        g.strokeStyle = s.color;
        g.lineWidth = 1;
        g.strokeRect(r.x + r.w - 40, r.y + 8, 34, 15);
        g.fillStyle = s.color;
        g.font = F(fs.micro, true);
        g.textAlign = "center";
        g.fillText(s.name.slice(0, 3), r.x + r.w - 23, r.y + 19);
        g.textAlign = "left";
      }
    });

    // 槽位+1(金币出口):次级皮;禁态平面
    {
      const sl = L.slotBtn;
      const slotMaxed = this.player.slots >= SHOP_SLOT_CAP;
      const sp = this.slotExpandPrice();
      const canSlot = !slotMaxed && this.gold >= sp;
      const label = slotMaxed ? `槽位已满 ${this.player.slots}/${SHOP_SLOT_CAP}` : `槽位+1 → ${this.player.slots + 1} · ${sp}金`;
      if (canSlot) {
        minorButtonBg(g, sl.x, sl.y, sl.w, sl.h, this.assets);
        g.fillStyle = theme.actionPrimary as string;
      } else {
        g.fillStyle = "#1A1F2A";
        g.fillRect(sl.x, sl.y, sl.w, sl.h);
        g.strokeStyle = "rgba(255,255,255,0.15)";
        g.lineWidth = 1;
        g.strokeRect(sl.x, sl.y, sl.w, sl.h);
        g.fillStyle = theme.textMuted as string;
      }
      g.font = F(fs.muted, true);
      g.textAlign = "center";
      g.fillText(this.fitOne(label, sl.w - 16), sl.x + sl.w / 2, rowTextY(sl.y, sl.h, fs.muted));
      g.textAlign = "left";
    }

    // 武器管理(≤8 行,修复旧 slice(0,7) 导致第 8 件不可见/不可操作)
    this.drawSectionHeader(g, "武器管理(点选 · 销毁)", L.weaponLabelY, this.player.freeSlots > 0 ? `空槽 ${this.player.freeSlots}` : "槽已满,销毁武器腾槽");
    L.weaponRows.forEach((r, i) => {
      const eq = this.player.equipment[i];
      const q = qualityDef(eq.quality);
      const sel = this.selectedWeaponId === eq.id;
      drawQualityFrame(g, r.x, r.y, r.w, r.h, sel ? (theme.select as string) : q.color);
      const icy = r.y + r.h / 2;
      if (!this.assets.draw(g, `icon_fx_${eq.effect.def.type}`, r.x + 6, icy - 12, 24, 24)) {
        g.fillStyle = hexA(q.color, 0.22);
        g.beginPath();
        g.arc(r.x + 18, icy, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = q.color;
        g.font = F(fs.micro, true);
        g.textAlign = "center";
        g.fillText(eq.effect.def.name[0], r.x + 18, icy + 4);
        g.textAlign = "left";
      }
      g.fillStyle = q.color;
      g.font = F(fs.muted, true);
      g.fillText(this.fitOne(eq.effect.def.name + (sel ? " ✓" : ""), 200), r.x + 38, rowTextY(r.y, r.h, fs.muted));
      g.fillStyle = theme.textSecondary as string;
      g.font = F(fs.micro);
      const maxLv = QUALITY_MAX_LEVEL[eq.quality];
      const lvLabel = eq.level >= maxLv ? `Lv.${eq.level} 满` : `Lv.${eq.level}/${maxLv}`;
      g.fillText(this.fitOne(`${q.name} · ${lvLabel}`, 130), r.x + 246, rowTextY(r.y, r.h, fs.micro));
      // 销毁(危险按钮)
      dangerButton(g, L.destroyRects[i].x, L.destroyRects[i].y, L.destroyRects[i].w, L.destroyRects[i].h, "销毁", this.assets);
    });
    if (L.weaponRows.length === 0) {
      const ph = L.geom.weaponRows[0];
      g.fillStyle = theme.textSecondary as string;
      g.font = F(fs.muted);
      g.textAlign = "center";
      g.fillText("还没有武器,先从商店购买吧", ph.x + ph.w / 2, rowTextY(ph.y, ph.h, fs.muted));
      g.textAlign = "left";
    }

    // 进化(底锚 942 贴底坞;2 张同款保底,3 张免费)
    this.drawSectionHeader(g, "进化(2 张同款 → 升档;3 张免费)", L.mergeLabelY, "");
    if (L.merges.length === 0) {
      const ph = L.geom.merges[0];
      g.fillStyle = theme.textSecondary as string;
      g.font = F(fs.muted);
      g.textAlign = "center";
      g.fillText("暂无可进化的卡(需 2 张同效果同品质)", ph.x + ph.w / 2, rowTextY(ph.y, ph.h, fs.muted));
      g.textAlign = "left";
    }
    L.merges.forEach((m) => {
      const q = qualityDef(m.group.quality);
      const fullSet = m.group.count >= 3;
      drawQualityFrame(g, m.x, m.y, m.w, m.h, q.color);
      g.fillStyle = q.color;
      g.font = F(fs.muted, true);
      g.fillText(this.fitOne(`${m.group.name} ×${m.group.count}`, 300), m.x + 10, rowTextY(m.y, m.h, fs.muted));
      const fee = fullSet ? 0 : qualityBasePrice(m.group.quality) * 2;
      g.fillStyle = theme.actionPrimary as string;
      g.textAlign = "right";
      g.fillText(this.fitOne(fullSet ? "免费升品" : `升品 ${fee}金`, 160), m.x + m.w - 10, rowTextY(m.y, m.h, fs.muted));
      g.textAlign = "left";
    });

    /* ---------- 底操作条 948..996:战斗底坞同骨架 ---------- */
    this.drawDockPlate(g, "hud_dock_bottom", 0, SHOP_BOTTOM, w, HUD_BOT_H, true);
    // 左区:下一章预告两行
    const nx = chapterIntel(this.chapter + 1, this.save.seasonId);
    g.font = F(fs.micro);
    g.fillStyle = theme.textSecondary as string;
    g.fillText(this.fitOne(`下一章敌情:${nx.title}(${nx.desc})`, 238), pad, SHOP_BOTTOM + 19);
    const rec = nx.recommended ? setDef(nx.recommended) : null;
    g.fillStyle = (rec ? rec.color : theme.textMuted) as string;
    g.fillText(this.fitOne(rec ? `推荐套组:${rec.name}(${rec.desc})` : "无特别克制,通用构筑即可", 238), pad, SHOP_BOTTOM + 37);
    // 右:开始下一章(主按钮,点击/绘制同源)
    primaryButton(g, L.nextBtn.x, L.nextBtn.y, L.nextBtn.w, L.nextBtn.h, this.fitOne(`▶ 开始第 ${this.chapter + 1} 章 (Enter)`, L.nextBtn.w - 16), true, this.assets);
  }

  private onShopClick(p: Vec2): void {
    const L = this.shopLayout();
    // 右上角工具按钮:融合 / 重开(确认)/ 主页(确认)
    for (const b of L.toolBtns) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (b.id === "refresh") {
          // 售罄制:刷新走金币(成本随章节与本章已刷次数递增)
          this.refreshShopForGold();
        } else if (b.id === "fusion") {
          if (this.player.equipment.length >= 2) this.openFusion("shop");
        } else if (b.id === "restart") {
          this.openConfirm("确定重开本局?当前章节进度与金币将丢失。", () => this.restart());
        } else if (b.id === "home") {
          this.openConfirm("确定返回主菜单?本局进度将丢失。", () => this.backToMenu());
        }
        return;
      }
    }
    // 槽位扩展(金币出口)
    const sb = L.slotBtn;
    if (p.x >= sb.x && p.x <= sb.x + sb.w && p.y >= sb.y && p.y <= sb.y + sb.h) {
      this.buySlot();
      return;
    }
    // 购买三张卡
    for (let i = 0; i < 3; i++) {
      const r = L.cards[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        this.buyCard(i);
        return;
      }
    }
    // 武器管理:点行选择,点销毁按钮操作
    for (let i = 0; i < L.weaponRows.length; i++) {
      const r = L.weaponRows[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        // 销毁按钮优先
        const d = L.destroyRects[i];
        if (p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h) {
          this.destroyCard(L.weaponRows[i].id);
          return;
        }
        this.selectedWeaponId = this.selectedWeaponId === L.weaponRows[i].id ? null : L.weaponRows[i].id;
        return;
      }
    }
    // 升品
    for (const m of L.merges) {
      if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
        this.mergeCards(m.group.sample);
        return;
      }
    }
    // 开始下一章
    if (p.x >= L.nextBtn.x && p.x <= L.nextBtn.x + L.nextBtn.w && p.y >= L.nextBtn.y && p.y <= L.nextBtn.y + L.nextBtn.h) {
      this.nextChapter();
    }
  }

  /** 销毁武器:释放槽位,回收 50% 金币(按品质基础价) */
  private destroyCard(id: number): void {
    const idx = this.player.equipment.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const eq = this.player.equipment[idx];
    this.gold += Math.round(qualityBasePrice(eq.quality) * DESTROY_REFUND_RATE);
    this.player.equipment.splice(idx, 1);
    if (this.selectedWeaponId === id) this.selectedWeaponId = null;
  }

  /** 开始一局(关卡/无限关共用;调用方先设置 currentStage 与 envAffixes) */
  private startRun(): void {
    this.player = new Player();
    this.applyTalentBonuses();
    // 原地清空(保持数组的身份),否则 BattleContext 会继续持有旧数组
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

    this.pointsEarnedThisRun = 0;
    this.stardustEarnedThisRun = 0;
    this.rankImprovedTo = null; // 幻影榜提示每局重置
    this.frameUnlockedThisRun = null;
    // 广告驱动:局内广告状态重置(复活/双倍/商店免费刷新)
    this.reviveUsed = 0;
    this.doubleClaimed = false;
    this.chapterRefreshes = 0;
    this.pendingSettle = false;
    this.fusA = null;
    this.fusB = null;
    this.fusC = null;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.bossSpawned = false;
    this.bossDead = false;
    this.bossBanner = null;
    this.stageReward = null;
    // 章节制与金币经济初始化
    this.chapter = 1;
    this.chapterTimer = 0;
    this.gold = 0;
    this.totalBought = 0;
    this.shopOffers = [];
    this.arena = this.chapterArena(1);
    // 地形:第 1 章新手区净空(规则返回空);显式重置保证重开局一致
    this.obstacles = rollChapterObstacles(1, this.arena, Math.random, this.currentStage?.bossChapter);
    this.poolTickAcc = 0;
    // 出战套组(主菜单选择,场外配置带入)
    this.selectedSet = this.save.selectedSet ?? null;
    // 首局引导:仅主线第 1 关且未完成时启用(前 5 分钟教学;死亡重打会重新引导)
    this.guide.enabled = !this.save.tutorialDone && this.currentStage?.id === 1;
    this.guide.reset();
    if (this.demoTriple) {
      // 开发演示:三重融合素材(击杀+飞刀+连锁 / 脉冲+飞刀 / 移动+新星)+ 续航件(验证关卡通关用)
      this.player.equipment.push(
        { id: 9101, level: 5, quality: "epic" as Quality, name: "连锁飞刀", triggers: [makeTrigger("kill", { chance: 0.5 })], effect: makeEffect("knife", { damage: 40, speed: 600, radius: 640 }, 5), modifiers: [makeModifier("chain", { targets: 3 })] },
        { id: 9102, level: 5, quality: "rare" as Quality, name: "脉冲飞刀", triggers: [makeTrigger("pulse", { interval: 1.5 })], effect: makeEffect("knife", { damage: 28, speed: 560, radius: 640 }, 5), modifiers: [] },
        { id: 9103, level: 5, quality: "rare" as Quality, name: "移动新星", triggers: [makeTrigger("move", { distance: 400 })], effect: makeEffect("nova", { damage: 50, radius: 140 }, 5), modifiers: [] },
        { id: 9104, level: 5, quality: "rare" as Quality, name: "汲取脉冲", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("drain", { heal: 40 }, 5), modifiers: [] }
      );
      for (const e of this.player.equipment) this.recordEquipment(e);
    } else {
      // 开局带入收藏装备(永久收藏,扭蛋产出);否则默认初始武器
      const sel = this.save.ownedGear.find((g) => g.id === this.save.selectedGearId);
      if (sel) {
        const gear = JSON.parse(JSON.stringify(sel)) as Equipment;
        this.player.equipment.push(gear);
        this.recordEquipment(gear);
      } else {
        // 套组初始武器(需求:选套组即定本局基调);无套组用默认/蓝图初始武器
        const starter = this.selectedSet ? makeSetStarterEquipment(this.selectedSet) : this.makeStarter();
        this.player.equipment.push(starter);
        this.recordEquipment(starter);
      }
    }
    // 开发预览:http://host/?fxdemo=meteor 开局追加飞刀+陨星演示件,直观预览 FX 层样板(不动存档)
    if (typeof window !== "undefined" && /[?&]fxdemo=meteor/.test(window.location.search)) {
      const demoGear: Equipment[] = [
        { id: 9901, level: 5, quality: "epic" as Quality, name: "飞刀演示", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 40, speed: 600, radius: 640 }, 5), modifiers: [] },
        { id: 9902, level: 5, quality: "epic" as Quality, name: "陨星演示", triggers: [makeTrigger("pulse", { interval: 2.5 })], effect: makeEffect("meteor", { damage: 90, radius: 160, delay: 0.8 }, 5), modifiers: [] },
      ];
      for (const e of demoGear) {
        this.player.equipment.push(e);
        this.recordEquipment(e);
      }
    }
    this.state = "playing";
  }

  /** 开始主线关卡(赛季关卡式:配置波次/Boss/环境词缀,通关有目标) */
  private startStage(id: number, bypassGate = false): void {
    if (!bypassGate && !this.stageOpen(id)) return; // 赛季门控:未开放关卡不可进入(策划案 V3 §4.1)
    this.syncEnergy();
    const cost = stageEnergyCost(id);
    if (this.save.energy < cost) {
      this.energyPending = () => this.startStage(id, bypassGate);
      this.state = "energy";
      return;
    }
    this.save.energy -= cost;
    persistSave(this.save);
    this.currentStage = stageOf(id);
    this.envAffixes = [...this.currentStage.envAffixes];
    this.startRun();
  }

  /** 开始无限关(爽模式:无尽生存,随机环境词缀;常开无门控) */
  private startEndless(): void {
    this.syncEnergy();
    if (this.save.energy < ENDLESS_ENERGY_COST) {
      this.energyPending = () => this.startEndless();
      this.state = "energy";
      return;
    }
    this.save.energy -= ENDLESS_ENERGY_COST;
    persistSave(this.save);
    this.currentStage = null;
    this.envAffixes = rollEnvAffixes(seasonTheme(this.save.seasonId).envBias); // 每局随机 1-3 个环境词缀(策划案 4.2;赛季主题倾向 DESIGN-SEASON-SETS L1)
    this.startRun();
  }

  /** 重试当前模式(关卡重打 / 无限关重开;主线绕门控以便重打当前局) */
  private restart(): void {
    this.settlePendingRun(); // 死亡后放弃重开:先结算死亡
    if (this.currentStage) this.startStage(this.currentStage.id, true);
    else this.startEndless();
  }

  /** 返回关卡选择菜单 */
  private backToMenu(): void {
    this.settlePendingRun(); // 死亡后放弃回菜单:先结算死亡
    this.state = "menu";
  }

  /** 通关结算:星数/每日首通 + 扭蛋券/回响点数/星尘 + 装备掉落 + 解锁下一关(策划案 V3 §4.2) */
  private victory(): void {
    const st = this.currentStage;
    if (!st) return;
    const r = st.rewards;
    // 幻影榜名次快照(§4.3):星数入账前记名次,入账后比较
    const lbBoard = phantomBoard(this.save.seasonId);
    const lbBefore = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), lbBoard);
    // 星数判定:通关 ★ + 剩余生命 ≥50% ★ + 未使用广告复活 ★
    const stars = calcStars(this.player.hp / this.player.maxHp, this.reviveUsed);
    const prevStars = this.save.stageStars[st.id] ?? 0;
    this.save.stageStars[st.id] = Math.max(prevStars, stars);
    this.victoryStars = stars;
    // 每日首通:当天首次通关 → 券 ×2 + 回响 ×1.5
    // 通关越多奖励越好:乘成长系数(按解锁前最高关计,本关解锁不计入)
    const rewardGrowth = 1 + CLEAR_REWARD_GROWTH * Math.max(0, this.save.highestStage - 1);
    let tickets = Math.round(r.tickets * rewardGrowth);
    let echo = Math.round((r.points > 0 ? r.points : stageEchoReward(st.id)) * rewardGrowth);
    const stardustGain = Math.round(r.stardust * rewardGrowth);
    const today = todayKey();
    this.firstClearBonus = this.save.dailyClearedDate !== today;
    if (this.firstClearBonus) {
      this.save.dailyClearedDate = today;
      this.save.dailyClearedStage = st.id;
      tickets *= FIRST_CLEAR_TICKET_MULT;
      echo = Math.round(echo * FIRST_CLEAR_ECHO_MULT);
    }
    // 首次 3 星一次性奖励:券 ×5 + 关卡框(§4.4 共享结算,含补星路径)
    if (stars === 3 && prevStars < 3) {
      const once = this.settleThreeStarOnce(st.id);
      tickets += once.tickets;
      if (once.frameNew) this.frameUnlockedThisRun = st.id;
    }
    this.save.gachaTicket += tickets;
    this.save.stardust += stardustGain;
    // 回响奖励 = 关卡公式(10×N^1.5),按 40% 跨天保留结算
    this.settleEcho(echo);
    // 通关刷装备(数值墙成长:第 N 关掉 level N 装备,越后面关卡数值越高)
    // 新收藏 → 永久基础数值(图鉴);重复 → 星尘
    this.stageDrops = 0;
    const drops = stageDropCount(st.id);
    for (let i = 0; i < drops; i++) {
      const eq = generateEquipment(stageDropLevel(st.id), undefined, true, rareBonusFor(this.save.ownedTalents));
      const dup = this.save.ownedGear.some((g) => g.name === eq.name && g.quality === eq.quality);
      if (dup) {
        this.save.stardust += DUPLICATE_STARDUST[eq.quality];
      } else {
        this.save.ownedGear.push(eq);
        this.recordEquipment(eq);
        this.stageDrops += 1;
      }
    }
    if (st.id >= this.save.highestStage) {
      this.save.highestStage = Math.min(STAGES.length, st.id + 1);
    }
    this.stageReward = { ...r, tickets, points: echo, stardust: stardustGain };
    this.pointsEarnedThisRun = echo;
    this.stardustEarnedThisRun = stardustGain;
    this.doubleClaimed = false; // 每局通关可领一次广告双倍
    persistSave(this.save);
    const lbAfter = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), lbBoard);
    this.rankImprovedTo = lbAfter < lbBefore ? lbAfter : null;
    this.state = "victory";
  }

  /** 首次 3 星一次性结算(胜利与补星共享,§4.2/§4.4):券 ×5 + 关卡框解锁;调用方负责持久化 */
  private settleThreeStarOnce(stageId: number): { tickets: number; frameNew: boolean } {
    let frameNew = false;
    if (!this.save.frames.includes(stageId)) {
      this.save.frames.push(stageId);
      frameNew = true;
    }
    return { tickets: THREE_STAR_TICKETS, frameNew };
  }

  /** 补星(§4.4):2★ 关卡花 5 钻补成 3★(纯自愿),拿满 3 星一次性奖励;名次变化见菜单幻影榜入口 */
  private starMakeup(id: number): void {
    if (!canStarMakeup(this.save.stageStars[id] ?? 0)) return;
    if (this.save.diamond < STAR_MAKEUP_COST) return;
    this.save.diamond -= STAR_MAKEUP_COST;
    this.save.stageStars[id] = 3;
    const once = this.settleThreeStarOnce(id);
    this.save.gachaTicket += once.tickets;
    persistSave(this.save);
  }

  /* ================= 转生与天赋(策划案 5.2/5.4) ================= */

  private owns(id: TalentId): boolean {
    return this.save.ownedTalents.includes(id);
  }

  /** 把天赋效果应用到新轮回的玩家身上(征服者:生命/护盾;构筑师:槽位/首级经验;收藏基础数值 + 每日天赋) */
  private applyTalentBonuses(): void {
    this.player.slotBonus = slotBonusFor(this.save.ownedTalents);
    this.player.firstXpScale = firstXpScaleFor(this.save.ownedTalents);
    // 基础生命 = 基础 × 生命强化天赋 × 收藏图鉴(通关刷装备的永久基础数值)× 每日天赋「坚韧」
    const cb = collectionBonus(this.save.ownedGear);
    let hpMult = maxHpMultFor(this.save.ownedTalents) * (1 + cb.hpPct / 100);
    if (this.hasDailyTalent("hp30")) hpMult *= 1 + dailyTalentOf("hp30").value;
    this.player.maxHp = Math.round(PLAYER_BASE.maxHp * hpMult);
    this.player.hp = this.player.maxHp;
    const shield = startShieldFor(this.save.ownedTalents);
    if (shield > 0) this.player.addShield(shield, 9999);
  }

  /** 回响点结算(需求优化 v2:跨天保留 40% 永久,60% 入本日池,次日清空) */
  private settleEcho(total: number): void {
    const { permanent, day } = splitEcho(total);
    this.save.points += permanent;
    this.save.dayEcho += day;
    this.pointsEarnedThisRun = total; // 展示本局获得
  }

  /** 死亡结算:回响(40% 跨天) + 最佳纪录 + 词缀图鉴 + 转生次数,并持久化 */
  private settleRun(): void {
    const gained = this.pointsEarnedThisRun || calcPrestigePoints(this.elapsed, this.kills, 1);
    this.settleEcho(gained);
    if (!this.save.bestRun || this.kills > this.save.bestRun.kills) {
      this.save.bestRun = { kills: this.kills, seconds: Math.floor(this.elapsed) };
    }
    if (this.chapter > this.save.bestWave) this.save.bestWave = this.chapter; // 最高章节
    if (this.chapter > this.save.seasonBest) this.save.seasonBest = this.chapter; // 赛季最佳(赛季分来源)
    this.save.prestiges += 1; // 每次转生计 1 次(委托区域解锁条件)
    this.pendingSettle = false;
    persistSave(this.save);
  }

  private recordEquipment(eq: Equipment): void {
    for (const t of eq.triggers) this.recordAffix("triggers", t.def.name);
    this.recordAffix("effects", eq.effect.def.name);
    for (const m of eq.modifiers) this.recordAffix("modifiers", m.def.name);
  }

  private recordAffix(kind: "triggers" | "effects" | "modifiers", name: string): void {
    const col = this.save.collection[kind];
    if (!col.includes(name)) col.push(name);
  }

  private buyTalent(id: TalentId): void {
    const node = talentOf(id);
    if (this.owns(id)) return;
    if (availablePoints(this.save) < node.cost) return;
    if (!isTierUnlocked(this.save.ownedTalents, node.tier, routeOf(id))) return;
    this.save.ownedTalents.push(id);
    this.applyTalentBonuses();
    persistSave(this.save);
  }

  private startNewRun(): void {
    this.restart();
  }

  /* ================= 特效与伤害数字 ================= */

  private tickFx(dt: number): void {
    for (const f of this.fx) f.ttl -= dt;
    removeIf(this.fx, (f) => f.ttl <= 0);
    this.fxLayer.tick(dt);
  }

  /**
   * Fx 事件唯一入口:入队 + 按类型补粒子/冲击环(纯视觉,不回写模拟状态)。
   * 粒子池满时 fxLayer 直接丢弃新请求,尸潮峰值不会拖帧。
   */
  private emitFx(f: Fx): void {
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
   * 本体纯装饰:模拟里没有飞行物,这里只是按 progress 插值出一条光迹。
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
   * 领域云氛围粒子(纯装饰):霜环沿扩张外沿洒冰点;
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
      // 霜环:粒子贴在当前外沿,随环扩张向外飘
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

  /**
   * 召唤物 FX(纯装饰):出场一次性爆点 + 冲击环(骨白/幽紫/灰蓝按来源区分),
   * 亡影与灵狼额外留奔跑魂火拖影(共享 minionFxAcc 节流)。
   */
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

  /** 召唤传送门(纯装饰):小怪落点一次性环 + 上浮粒子;召唤师橙、Boss 血红 */
  private emitSummonFx(pos: Vec2, color: string): void {
    this.fxLayer.ring({ x: pos.x, y: pos.y, r0: 4, r1: 22, life: 0.35, color, width: 2 });
    this.fxLayer.burst({
      x: pos.x, y: pos.y, count: 6, color, speed: [20, 90],
      size: [1.4, 2.8], life: [0.3, 0.6], halo: 2.8, gravity: -50, drag: 1,
    });
  }

  /** 护盾卫士正面格挡(纯装饰):盾面朝向一侧溅出金属火花 */
  private emitShieldBlock(e: Enemy): void {
    const sx = e.pos.x + e.facing.x * (e.def.radius + 3);
    const sy = e.pos.y + e.facing.y * (e.def.radius + 3);
    const back = Math.atan2(e.facing.y, e.facing.x);
    this.fxLayer.burst({
      x: sx, y: sy, count: 4, color: "#cfd8dc", speed: [90, 260],
      size: [1, 2.2], life: [0.1, 0.26], halo: 2.4, angle: [back - 0.9, back + 0.9], drag: 5, gravity: 240,
    });
  }

  /**
   * 敌人机制装饰特效(纯视觉,不参与结算):
   * 精英/神/Boss/召唤师登场爆点;隐匿者与神之敌隐身进出紫色烟雾过渡;
   * Boss 震击蓄力期预警区余烬(过半后外沿加窜火星)、P3 狂暴周身火光。
   * 氛围类共享 enemyFxAcc 节流。
   */
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
    // 隐匿者/神之敌/批 4 隐身周期载体:隐身进出过渡(紫烟)
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
    // 批 4 冲锋:windup 原地蓄力火花(共享节流)/ 冲刺拖影(无节流,同投射物先例)
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
    // Boss 氛围:震击预警余烬 / 狂暴火光(全场共享节流)
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

  private tickDmg(dt: number): void {
    for (const d of this.dmgNums) d.ttl -= dt;
    removeIf(this.dmgNums, (d) => d.ttl <= 0);
  }

  private spawnDmg(pos: Vec2, value: number, color: string): void {
    this.dmgNums.push({ pos: vec2(pos.x + rand(-6, 6), pos.y - 6), value: String(value), color, ttl: 0.6, maxTtl: 0.6 });
    if (this.dmgNums.length > 200) this.dmgNums.splice(0, this.dmgNums.length - 200);
  }

  /* ================= 渲染 ================= */

  private render(): void {
    const g = this.g;
    const w = this.logicalW;
    const h = this.logicalH;
    // 信箱底色:先在屏幕空间铺满整窗(手机高屏比/桌面宽屏的多余区域),再切到设计空间绘制内容
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#0b0e14";
    g.fillRect(0, 0, this.viewW, this.viewH);
    // 信箱区满溢背景:把当前场景背景贴图按 cover 铺满整窗并压暗,居中内容条不再是"孤岛"(界面凌乱修复)
    const bgCoverKey =
      this.state === "menu"
        ? "bg_menu"
        : this.state === "shop"
          ? "bg_shop"
          : this.state === "playing"
            ? this.currentStage
              ? `bg_stage_${this.currentStage.id}`
              : "bg_outside"
            : "bg_outside";
    g.globalAlpha = 0.55;
    if (this.assets.draw(g, bgCoverKey, 0, 0, this.viewW, this.viewH, "cover")) {
      g.globalAlpha = 1;
      g.fillStyle = "rgba(11,14,20,0.35)";
      g.fillRect(0, 0, this.viewW, this.viewH);
    } else {
      g.globalAlpha = 1;
    }
    g.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.offX, this.dpr * this.offY);
    g.clearRect(0, 0, w, h);
    // 背景贴图(菜单/战斗按关卡/场外;缺图回退纯色)
    const bgKey =
      this.state === "menu"
        ? "bg_menu"
        : this.state === "shop"
          ? "bg_shop"
          : this.state === "playing"
            ? this.currentStage
              ? `bg_stage_${this.currentStage.id}`
              : "bg_outside"
            : "bg_outside";
    if (!this.assets.draw(g, bgKey, 0, 0, w, h, "cover")) {
      g.fillStyle = "#0b0e14";
      g.fillRect(0, 0, w, h);
    }

    const cam = vec2(
      clamp(this.player.pos.x - w / 2, this.arena.x0, Math.max(this.arena.x0, this.arena.x1 - w)),
      clamp(this.player.pos.y - h / 2, this.arena.y0, Math.max(this.arena.y0, this.arena.y1 - h))
    );

    g.save();
    // 镜头震动(重型特效申请,如陨星引爆;仅战场生效,UI 不跟着抖)
    const shaking = this.state === "playing";
    g.translate(-cam.x + (shaking ? this.fxLayer.shake.x : 0), -cam.y + (shaking ? this.fxLayer.shake.y : 0));
    // 战场世界仅战斗中绘制(否则透过半透明界面背景叠到其他屏幕)
    if (this.state === "playing") this.drawWorld(g, cam);
    g.restore();

    // 战场 HUD 仅战斗中绘制(修复:主菜单等界面不再叠出战场 UI)
    if (this.state === "playing") this.drawHUD(g, w, h);
    if (this.state === "menu") this.drawMenu(g, w, h);
    if (this.state === "shop") this.drawShop(g, w, h);
    if (this.state === "gameover") this.drawGameOver(g, w, h);
    if (this.state === "victory") this.drawVictory(g, w, h);
    if (this.state === "prestige") this.drawPrestige(g, w, h);
    if (this.state === "fusion") {
      this.drawFusion(g, w, h);
      this.drawHiddenChoice(g, w, h);
    }
    if (this.state === "commission") this.drawCommission(g, w, h);
    if (this.state === "gacha") this.drawGacha(g, w, h);
    if (this.state === "pass") this.drawPass(g, w, h);
    if (this.state === "daily") this.drawDaily(g, w, h);
    if (this.state === "gearup") this.drawGearUp(g, w, h);
    if (this.state === "energy") this.drawEnergy(g, w, h);
    if (this.state === "season") this.drawSeason(g, w, h);
    if (this.state === "leaderboard") this.drawLeaderboard(g, w, h);
    if (this.state === "heroes") this.drawHeroes(g, w, h);
    // 教学横幅浮在所有界面之上(playing/shop 都有教学提示)
    this.drawGuideBanner(g, w);
    this.drawJoystick(g);
    if (this.confirm) this.drawConfirm(g, w, h);
    // 广告播放遮罩(平台激励视频播放中,任何状态最顶层)
    if (this.adBusy) {
      g.fillStyle = "rgba(0,0,0,0.82)";
      g.fillRect(0, 0, w, h);
      g.textAlign = "center";
      g.fillStyle = "#ffd76a";
      g.font = "bold 18px system-ui, sans-serif";
      g.fillText("广告播放中…", w / 2, h / 2 - 12);
      g.fillStyle = "#8f9bb3";
      g.font = "12px system-ui, sans-serif";
      g.fillText("完整观看即可获得奖励", w / 2, h / 2 + 16);
      g.textAlign = "left";
    }
  }

  private drawWorld(g: CanvasRenderingContext2D, cam: Vec2): void {
    // 地面网格
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    const grid = 100;
    const x0 = Math.max(this.arena.x0, Math.floor(cam.x / grid) * grid);
    const y0 = Math.max(this.arena.y0, Math.floor(cam.y / grid) * grid);
    g.beginPath();
    for (let x = x0; x <= cam.x + this.logicalW + grid; x += grid) {
      g.moveTo(x, Math.max(this.arena.y0, cam.y));
      g.lineTo(x, Math.min(this.arena.y1, cam.y + this.logicalH));
    }
    for (let y = y0; y <= cam.y + this.logicalH + grid; y += grid) {
      g.moveTo(Math.max(this.arena.x0, cam.x), y);
      g.lineTo(Math.min(this.arena.x1, cam.x + this.logicalW), y);
    }
    g.stroke();

    // 地形(策划案 V3 §6 / DESIGN-S4 §3.3):毒池 = 半透明紫绿 + 冒泡;石柱 = 灰圆 + 深色描边 + 顶面高光
    for (const ob of this.obstacles) {
      if (ob.kind !== "pool") continue;
      const burn = ob.burn === true;
      // 美术垫图(缺失返回 false 即跳过,下方代码绘制不变);灼烧池无专属垫图,直接代码绘制
      if (!burn) this.assets.draw(g, "fx_poison", ob.pos.x - ob.radius, ob.pos.y - ob.radius, ob.radius * 2, ob.radius * 2);
      g.fillStyle = burn ? "rgba(255,120,40,0.24)" : "rgba(140,90,220,0.22)";
      g.beginPath();
      g.arc(ob.pos.x, ob.pos.y, ob.radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = burn ? "rgba(255,157,46,0.5)" : "rgba(180,120,255,0.4)";
      g.stroke();
      // 冒泡:固定相位的代码绘制气泡,上浮渐隐(0 新增图;灼烧池 = 暖橙火星)
      for (let i = 0; i < 4; i++) {
        const ph = (this.elapsed * 0.5 + i * 0.25 + ob.id * 0.37) % 1;
        const bx = ob.pos.x + Math.sin((i + ob.id) * 2.1) * ob.radius * 0.6;
        const by = ob.pos.y + Math.cos((i + ob.id) * 1.7) * ob.radius * 0.6 - ph * 14;
        g.fillStyle = burn ? `rgba(255,170,90,${0.4 * (1 - ph)})` : `rgba(190,140,255,${0.35 * (1 - ph)})`;
        g.beginPath();
        g.arc(bx, by, 3 + ph * 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const ob of this.obstacles) {
      if (ob.kind !== "pillar") continue;
      g.fillStyle = "#5c6672";
      g.beginPath();
      g.arc(ob.pos.x, ob.pos.y, ob.radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#39404a";
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.beginPath();
      g.ellipse(ob.pos.x - ob.radius * 0.25, ob.pos.y - ob.radius * 0.3, ob.radius * 0.5, ob.radius * 0.32, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 1;

    // 毒云
    for (const c of this.clouds) {
      const alpha = clamp(c.ttl / c.maxTtl, 0.15, 0.5);
      if (c.meteor) {
        // 陨星落点 telegraph(熔核教团):橙色警示环,填充随倒计时推进收拢
        const progress = 1 - clamp(c.ttl / c.maxTtl, 0, 1);
        g.fillStyle = `rgba(255,120,40,${0.10 + progress * 0.18})`;
        g.beginPath();
        g.arc(c.pos.x, c.pos.y, c.radius * (1 - progress * 0.5), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `rgba(255,157,46,${0.5 + progress * 0.4})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 1;
        continue;
      }
      if (c.ring) {
        // 霜环(极北冰脉):冰蓝描边环,不填充(区别于毒云面)
        g.strokeStyle = `rgba(140,220,255,${Math.min(0.85, alpha + 0.25)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = `rgba(90,200,250,${alpha * 0.5})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(c.pos.x, c.pos.y, Math.max(1, c.radius - 5), 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      // 底盘着色:回血池青绿 / 灼烧余烬与熔岩足迹暖橙 / 其余毒云绿
      const warm = c.fxEmber || c.source?.effect.def.type === "magma_trail";
      g.fillStyle = c.heals
        ? `rgba(90,230,210,${alpha})`
        : warm
          ? `rgba(255,130,50,${alpha})`
          : `rgba(120,220,90,${alpha})`;
      g.beginPath();
      g.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = c.heals ? "rgba(140,255,235,0.35)" : warm ? "rgba(255,180,90,0.35)" : "rgba(160,255,120,0.3)";
      g.stroke();
    }

    // 经验宝石
    for (const gem of this.gems) {
      const pulse = 3 + Math.sin(this.elapsed * 6 + gem.id) * 1.5;
      g.fillStyle = gem.delay > 0 ? "#3a7bd5" : "#5ac8fa";
      g.beginPath();
      g.arc(gem.pos.x, gem.pos.y, pulse, 0, Math.PI * 2);
      g.fill();
    }

    // 敌人
    for (const e of this.enemies) {
      const alpha = e.hidden ? 0.22 : 1; // 隐匿者:隐身时半透明
      g.globalAlpha = alpha;
      // 美术贴图优先,缺失回退圆形
      const spr = e.def.radius * 2.6;
      const vkey = e.def.variantId ? `monster_${e.def.variantId}` : "";
      const drawn =
        (vkey !== "" && this.assets.draw(g, vkey, e.pos.x - spr / 2, e.pos.y - spr / 2, spr, spr)) ||
        this.assets.draw(g, `enemy_${e.kind}`, e.pos.x - spr / 2, e.pos.y - spr / 2, spr, spr);
      if (!drawn) {
        g.fillStyle = e.def.color;
        g.beginPath();
        g.arc(e.pos.x, e.pos.y, e.def.radius, 0, Math.PI * 2);
        g.fill();
      }
      // 护盾卫士:正面护盾弧线提示
      if (e.kind === "shieldguard") {
        g.strokeStyle = "rgba(120,144,156,0.8)";
        g.lineWidth = 2;
        const a = Math.atan2(e.facing.y, e.facing.x);
        g.beginPath();
        g.arc(e.pos.x, e.pos.y, e.def.radius + 5, a - Math.PI / 3, a + Math.PI / 3);
        g.stroke();
      }
      // 血条(受伤时显示)
      if (e.hp < e.maxHp && !e.isElite) {
        const bw = e.def.radius * 2;
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(e.pos.x - e.def.radius, e.pos.y - e.def.radius - 8, bw, 3);
        g.fillStyle = "#ff5a5a";
        g.fillRect(e.pos.x - e.def.radius, e.pos.y - e.def.radius - 8, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
      }
    }
    g.globalAlpha = 1;

    // 骷髅(美术贴图优先,缺失回退代码圆点)
    for (const m of this.minions) {
      const ms = m.radius * 2.4;
      if (!this.assets.draw(g, "fx_summon", m.pos.x - ms / 2, m.pos.y - ms / 2, ms, ms)) {
        g.fillStyle = m.color;
        g.beginPath();
        g.arc(m.pos.x, m.pos.y, m.radius, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#2a2f3a";
        g.fillRect(m.pos.x - 5, m.pos.y - 8, 3, 3);
        g.fillRect(m.pos.x + 2, m.pos.y - 8, 3, 3);
      }
    }

    // 玩家
    const p = this.player;
    if (p.alive) {
      if (p.shield > 0) {
        g.strokeStyle = "rgba(90,200,250,0.7)";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(p.pos.x, p.pos.y, PLAYER_BASE.radius + 7, 0, Math.PI * 2);
        g.stroke();
      }
      // 美术贴图优先,缺失回退圆形
      const ps = PLAYER_BASE.radius * 2.8;
      if (!this.assets.draw(g, "player", p.pos.x - ps / 2, p.pos.y - ps / 2, ps, ps)) {
        g.fillStyle = "#5ac8fa";
        g.beginPath();
        g.arc(p.pos.x, p.pos.y, PLAYER_BASE.radius, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0b0e14";
        g.beginPath();
        g.arc(p.pos.x, p.pos.y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 投射物(射线类用闪电贴图,按速度方向旋转;缺失回退圆点)
    for (const proj of this.projectiles) {
      if (proj.kind === "ray") {
        const ang = Math.atan2(proj.vel.y, proj.vel.x);
        const s = Math.max(proj.radius * 4, 24);
        g.save();
        g.translate(proj.pos.x, proj.pos.y);
        g.rotate(ang + Math.PI / 2);
        const dw = s * 0.76; // 保持贴图 66:87 原比例
        if (!this.assets.draw(g, "proj_lightning", -dw / 2, -s / 2, dw, s)) {
          g.fillStyle = "#7fd8ff";
          g.beginPath();
          g.arc(0, 0, proj.radius, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      } else {
        g.fillStyle = "#ffd76a";
        g.beginPath();
        g.arc(proj.pos.x, proj.pos.y, proj.radius, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 特效(美术贴图优先,保留生命周期淡出;缺失回退代码圆环)
    const fxTex: Record<string, { key: string; r: number }> = {
      nova: { key: "fx_nova", r: 100 },
      explosion: { key: "fx_blast", r: 100 },
      lightning: { key: "fx_chain", r: 34 },
      shield: { key: "fx_shield", r: 22 },
      heal: { key: "fx_drain", r: 34 },
    };
    for (const f of this.fx) {
      const t = 1 - f.ttl / f.maxTtl;
      const tex = fxTex[f.type];
      if (tex) {
        let r = tex.r;
        if (f.type === "nova" || f.type === "explosion") {
          r = (f.radius ?? tex.r) * (f.type === "nova" ? t : 1 - 0.4 * t);
        }
        r = Math.max(r, 8);
        g.globalAlpha = 1 - t;
        const ok = this.assets.draw(g, tex.key, f.pos.x - r, f.pos.y - r, r * 2, r * 2);
        g.globalAlpha = 1;
        if (ok) continue;
      }
      if (f.type === "nova" || f.type === "explosion") {
        const r = (f.radius ?? 100) * (f.type === "nova" ? t : 1 - 0.4 * t);
        g.strokeStyle = f.type === "nova" ? `rgba(255,140,60,${0.7 * (1 - t)})` : `rgba(255,180,80,${0.8 * (1 - t)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(f.pos.x, f.pos.y, r, 0, Math.PI * 2);
        g.stroke();
      } else if (f.type === "lightning") {
        g.strokeStyle = `rgba(140,220,255,${0.9 * (1 - t)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(f.pos.x, f.pos.y, 18 + t * 20, 0, Math.PI * 2);
        g.stroke();
      } else if (f.type === "heal") {
        g.fillStyle = `rgba(120,255,160,${0.5 * (1 - t)})`;
        g.beginPath();
        g.arc(f.pos.x, f.pos.y, 16 + t * 18, 0, Math.PI * 2);
        g.fill();
      } else if (f.type === "shield") {
        g.strokeStyle = `rgba(90,200,250,${0.8 * (1 - t)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(f.pos.x, f.pos.y, 22, 0, Math.PI * 2);
        g.stroke();
      } else if (f.type === "knife") {
        g.strokeStyle = `rgba(255,215,106,${0.8 * (1 - t)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(f.pos.x, f.pos.y, 14, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // 粒子/发光层:叠在特效之上、震击预警圈之下(预警圈必须可读)
    this.fxLayer.draw(g);

    // 震击预警:基线 Boss 三阶段 + 批 4 技能预警(圈色区分来源,可走位躲避)
    this.drawSlamWarn(g);

    // 伤害数字
    g.textAlign = "center";
    g.font = "13px system-ui, sans-serif";
    for (const d of this.dmgNums) {
      const a = clamp(d.ttl / d.maxTtl, 0, 1);
      g.fillStyle = d.color;
      g.globalAlpha = a;
      g.fillText(d.value, d.pos.x, d.pos.y - (1 - a) * 18);
    }
    g.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */

  private drawHUD(g: CanvasRenderingContext2D, w: number, h: number): void {
    // 高屏手机:底坞恒定锚定 worldH,996 之下的伸展区仅铺半透底色作歇指区
    this.drawRestZone(g, w, h);
    const wh = this.worldH();
    this.drawTopDock(g, w);
    this.drawBottomDock(g, w, wh);

    // Boss 出场横幅(改锚战场高度,不受高屏歇指区影响)
    if (this.bossBanner && this.bossBanner.ttl > 0) {
      const ba = clamp(this.bossBanner.ttl, 0, 1);
      g.globalAlpha = ba;
      this.assets.draw(g, "banner_mid_red", w / 2 - 110, wh * 0.28 - 30, 220, 40);
      g.globalAlpha = 1;
      g.textAlign = "center";
      g.fillStyle = `rgba(255,157,46,${ba})`;
      g.font = "bold 24px system-ui, sans-serif";
      g.fillText(this.bossBanner.text, w / 2, wh * 0.28);
      g.textAlign = "left";
    }
  }

  /** 歇指区:高屏 worldH 之下仅铺半透暗底 + 分隔线(战斗/商店共用) */
  private drawRestZone(g: CanvasRenderingContext2D, w: number, h: number): void {
    const wh = this.worldH();
    if (h <= wh) return;
    g.fillStyle = "rgba(11,14,20,0.88)";
    g.fillRect(0, wh, w, h - wh);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, wh + 0.5);
    g.lineTo(w, wh + 0.5);
    g.stroke();
  }

  /** 坞底板:美术图按显示比例直接拉伸(零变形);缺图回退深色渐变 + 1px 朝战场一侧的紫色描边 */
  private drawDockPlate(g: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, dockH: number, accentTop: boolean): void {
    if (this.assets.draw(g, key, x, y, w, dockH)) return;
    const grad = g.createLinearGradient(0, y, 0, y + dockH);
    grad.addColorStop(0, "rgba(16,20,30,0.95)");
    grad.addColorStop(1, "rgba(9,12,18,0.95)");
    g.fillStyle = grad;
    g.fillRect(x, y, w, dockH);
    g.strokeStyle = "rgba(200,182,255,0.28)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, accentTop ? y + 0.5 : y + dockH - 0.5);
    g.lineTo(x + w, accentTop ? y + 0.5 : y + dockH - 0.5);
    g.stroke();
  }

  /** 顶坞 (0,0,560,64,贴边):R1 血条+组合技圆钮+金币击杀;R2 经验条+关卡行;R3 单选 ticker+⚡回响星尘 */
  private drawTopDock(g: CanvasRenderingContext2D, w: number): void {
    const p = this.player;
    const lx = HUD_PAD;
    const rx = w - HUD_PAD;
    this.drawDockPlate(g, "hud_dock_top", 0, 0, w, HUD_TOP_H, false);
    g.textAlign = "left";

    // R1 左:血条(胶囊渐变)+ 盾覆层 + HP 数值
    const hpFrac = p.hp / p.maxHp;
    drawBar(
      g, lx, 8, 150, 12, hpFrac,
      hpFrac > 0.3 ? "#ff5a6e" : "#ff2d2d",
      p.shield > 0 ? { overlayFrac: clamp(p.shield / (p.maxHp * 0.6), 0, 1) } : undefined
    );
    let hpTx = lx + 150 + 6;
    if (p.shield > 0) {
      this.assets.draw(g, "badge_shield_bronze", lx + 150 + 4, 5, 14, 17);
      hpTx = lx + 150 + 22;
    }
    g.fillStyle = "#fff";
    g.font = "12px system-ui, sans-serif";
    g.fillText(this.fitOne(`${Math.ceil(p.hp)} / ${p.maxHp}`, 96), hpTx, 19);

    // R1 中:跨套组合技圆钮(纯展示)
    const cs = comboStates(p.equipment);
    COMBOS.forEach((c, i) => {
      const x = 300 + i * 26;
      const on = cs[c.id];
      g.beginPath();
      g.arc(x, 14.5, 8, 0, Math.PI * 2);
      if (on) {
        g.fillStyle = c.color;
        g.fill();
        g.fillStyle = "#0b0e14";
      } else {
        g.strokeStyle = "rgba(143,155,179,0.5)";
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = "rgba(143,155,179,0.7)";
      }
      g.font = "bold 10px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(c.name[0], x, 18);
      g.textAlign = "left";
    });

    // R1 右:量链 金币 + 击杀(逐段测量向左推)
    g.font = "12px system-ui, sans-serif";
    const goldTxt = `金币 ${this.gold}`;
    const killsTxt = `击杀 ${this.kills}`;
    const goldW = g.measureText(goldTxt).width;
    g.textAlign = "right";
    g.fillStyle = "#ffd76a";
    g.fillText(this.fitOne(goldTxt, 110), rx, 19);
    g.fillStyle = "#b8b8b8";
    g.fillText(this.fitOne(killsTxt, 110), rx - goldW - 12, 19);
    g.textAlign = "left";

    // R2 左:经验条(胶囊)+ 等级
    const need = xpToNext(p.level);
    drawBar(g, lx, 31, 150, 5, p.xp / need, "#5ac8fa");
    g.fillStyle = "#e8e8e8";
    g.font = "13px system-ui, sans-serif";
    g.fillText(this.fitOne(`Lv.${p.level}`, 70), lx + 156, 39);

    // R2 右:关卡行(名称 · 章型 · 第 N/M 章 · Boss · 倒计时)
    const st = this.currentStage;
    if (st) {
      const bossCh = st.bossChapter === this.chapter && this.bossSpawned && !this.bossDead;
      const ctLabel = chapterTypeLabel(chapterTypeInfo(this.chapter, st.bossChapter).type);
      const stTxt = `${st.name} · ${ctLabel} · 第 ${this.chapter}/${st.chapters} 章${bossCh ? " · Boss!" : ""} · 剩余 ${Math.ceil(CHAPTER_SECONDS - this.chapterTimer)}s`;
      g.font = "bold 13px system-ui, sans-serif";
      g.textAlign = "right";
      g.fillStyle = bossCh ? "#ff9d2e" : "#c9d1e0";
      g.fillText(this.fitOne(stTxt, 325), rx, 39);
      g.textAlign = "left";
    }

    // R3 右:量链 ⚡ + 回响 + 星尘(逐段测量向左推)
    this.syncEnergy();
    g.font = "12px system-ui, sans-serif";
    const eTxt = this.fitOne(`⚡ ${this.save.energy}/${ENERGY_MAX}`, 100);
    const echoTxt = this.fitOne(`回响 ${this.save.points}`, 110);
    const dustTxt = this.fitOne(`星尘 ${this.save.stardust}`, 110);
    const icW = 13 + 4;
    const chainW = g.measureText(eTxt).width + 12 + icW + g.measureText(echoTxt).width + 12 + icW + g.measureText(dustTxt).width;
    const cx0 = rx - chainW;
    g.fillStyle = "#5ac8fa";
    g.fillText(eTxt, cx0, 58);
    iconText(g, this.assets, "icon_echo", "◈", echoTxt, cx0 + g.measureText(eTxt).width + 12, 58, "#ffd76a", 13);
    iconText(g, this.assets, "icon_stardust", "❋", dustTxt, cx0 + g.measureText(eTxt).width + 12 + icW + g.measureText(echoTxt).width + 12, 58, "#c8b6ff", 13);

    // R3 左:单选行情条(与量链互不侵占)
    const tickW = Math.max(80, cx0 - 16 - lx);
    this.drawHudTicker(g, lx, 58, tickW);
  }

  /** 顶坞 R3 左:单选行情。优先级 连杀>委托>敌情>环境>荆棘>挂机(兜底必显),全部走 fitOne 限位 */
  private drawHudTicker(g: CanvasRenderingContext2D, x: number, y: number, maxW: number): void {
    const kind = pickTicker({
      combo: this.comboCount >= 2,
      commission: this.commissionReady(),
      intel: true,
      env: this.envAffixes.length > 0,
      thorn: this.isThornBuild(),
    });
    g.textAlign = "left";
    if (kind === "combo") {
      g.fillStyle = this.frenzyTimer > 0 ? "#ff2d8f" : "#ffd76a";
      g.font = "bold 13px system-ui, sans-serif";
      g.fillText(this.fitOne(this.frenzyTimer > 0 ? `狂潮!连杀 ×${this.comboCount}` : `连杀 ×${this.comboCount}`, maxW), x, y);
    } else if (kind === "commission") {
      g.fillStyle = "#c8b6ff";
      g.font = "bold 13px system-ui, sans-serif";
      g.fillText(this.fitOne("委托已完成!主菜单可领取", maxW), x, y);
    } else if (kind === "env") {
      g.fillStyle = "#ff9d2e";
      g.font = "12px system-ui, sans-serif";
      const head = "环境:";
      g.fillText(head, x, y);
      let ax = x + g.measureText(head).width;
      let left = maxW - (ax - x);
      const total = this.envAffixes.length;
      for (let i = 0; i < total; i++) {
        const t = this.envAffixes[i];
        const name = envAffixDef(t).name;
        const segTxt = name + (i < total - 1 ? " / " : "");
        const iconSlot = this.assets.isReady(`affix_${t}`) ? 14 : 0;
        const tw = g.measureText(segTxt).width;
        if (iconSlot + tw > left) {
          g.fillText(this.fitOne(`+${total - i}`, left), ax, y);
          break;
        }
        if (iconSlot) {
          this.assets.draw(g, `affix_${t}`, ax, y - 11, 12, 12);
          ax += 14;
          left -= 14;
        }
        g.fillText(segTxt, ax, y);
        ax += tw;
        left -= tw;
      }
    } else if (kind === "thorn") {
      g.fillStyle = "#4dffc8";
      g.font = "bold 13px system-ui, sans-serif";
      g.fillText(this.fitOne("荆棘回血:挨打回血,受击伤害+50%", maxW), x, y);
    } else if (kind === "intel") {
      const intel = chapterIntel(this.chapter, this.save.seasonId);
      const intelIcon: Record<string, string> = { 尸潮: "intel_horde", 重甲: "intel_armor", 异变: "intel_mutant", 精英: "intel_elite" };
      let ix = x;
      const ik = intelIcon[intel.title];
      if (ik && this.assets.draw(g, ik, ix, y - 11, 12, 12)) ix += 15;
      g.fillStyle = intel.recommended ? setDef(intel.recommended).color : "#8f9bb3";
      g.font = "12px system-ui, sans-serif";
      g.fillText(this.fitOne(`敌情:${intel.title}(${intel.desc})${intel.recommended ? "→推荐" + setDef(intel.recommended).name : ""}`, maxW - (ix - x)), ix, y);
    } else {
      g.fillStyle = this.autoMove ? "#8f9bb3" : "#5ac8fa";
      g.font = "12px system-ui, sans-serif";
      g.fillText(this.fitOne(this.autoMove ? "挂机中(F6 切换)" : "手动(F6 挂机)", maxW), x, y);
    }
  }

  /** 底坞 (0,wh-48,560,48,贴边):左侧装备横排(图标卡+品质框+脉冲CD)+ 右侧章节进度簇 / Boss 血条 */
  private drawBottomDock(g: CanvasRenderingContext2D, w: number, wh: number): void {
    const dy = wh - HUD_BOT_H;
    this.drawDockPlate(g, "hud_dock_bottom", 0, dy, w, HUD_BOT_H, true);
    const bossEnt = this.enemies.find((e) => e.kind === "boss" && e.hp > 0);
    const boss = !!bossEnt;
    const lx = HUD_PAD;
    const rx = w - HUD_PAD;

    // 右侧:Boss = 头像标 + 血条 + 阶段名;平时 = 章节文字 + 金色进度条(不重复倒计时)
    const rightW = boss ? 260 : 190;
    if (bossEnt) {
      const phaseColor = bossEnt.bossPhase === 3 ? "#ff2d8f" : bossEnt.bossPhase === 2 ? "#ff9d2e" : "#ff2d2d";
      const bx = rx - 240;
      const by = dy + 23;
      this.assets.draw(g, "affix_boss", bx - 24, by - 4, 18, 18);
      drawBar(g, bx, by, 240, 10, bossEnt.hp / bossEnt.maxHp, phaseColor);
      g.font = "bold 12px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillStyle = phaseColor;
      g.fillText(this.fitOne(`深渊领主 · P${bossEnt.bossPhase}${bossEnt.bossVariant === "weak" ? "(弱化)" : ""}`, 240), bx + 120, dy + 16);
      g.textAlign = "left";
    } else if (this.currentStage) {
      g.font = "12px system-ui, sans-serif";
      g.textAlign = "right";
      g.fillStyle = "#8f9bb3";
      g.fillText(this.fitOne(`第 ${this.chapter}/${this.currentStage.chapters} 章`, 120), rx, dy + 17);
      g.textAlign = "left";
      drawBar(g, rx - 170, dy + 27, 170, 6, this.chapterTimer / CHAPTER_SECONDS, "#ffd76a");
    }

    // 左侧:装备横排(图标 + 代码品质框;Boss 时收窄为仅名单行)
    const zoneW = w - HUD_PAD * 2 - rightW - 8;
    const eqs = this.player.equipment;
    const L = equipRowLayout(eqs.length, boss, zoneW);
    const cy = dy + 6;
    let ex = lx;
    for (let i = 0; i < L.shown; i++) {
      const eq = eqs[i];
      const q = qualityDef(eq.quality);
      // 品质框:圆角暗底 + 品质色描边 + 内发光(代码绘制,竖卡框贴图不适用 36px 横卡)
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.beginPath();
      g.moveTo(ex + 4, cy);
      g.arcTo(ex + L.cardW, cy, ex + L.cardW, cy + L.cardH, 4);
      g.arcTo(ex + L.cardW, cy + L.cardH, ex, cy + L.cardH, 4);
      g.arcTo(ex, cy + L.cardH, ex, cy, 4);
      g.arcTo(ex, cy, ex + L.cardW, cy, 4);
      g.closePath();
      g.fill();
      g.strokeStyle = q.color;
      g.lineWidth = 1.5;
      g.stroke();
      g.strokeStyle = hexA(q.color, 0.35);
      g.lineWidth = 1;
      g.strokeRect(ex + 2.5, cy + 2.5, L.cardW - 5, L.cardH - 5);
      // 效果图标(缺图回退:品质色圆底 + 效果名首字)
      const iconKey = `icon_fx_${eq.effect.def.type}`;
      if (!this.assets.draw(g, iconKey, ex + 5, cy + 6, 24, 24)) {
        g.fillStyle = hexA(q.color, 0.22);
        g.beginPath();
        g.arc(ex + 17, cy + 18, 11, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = hexA(q.color, 0.7);
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = q.color;
        g.font = "bold 12px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(eq.effect.def.name[0], ex + 17, cy + 22);
        g.textAlign = "left";
      }
      // 脉冲冷却:卡底充能条 + 第 2 行尾秒数(非脉冲卡无)
      const cd = this.engine.pulseLeft(eq.id);
      let cdTxt = "";
      if (cd) {
        const frac = 1 - cd.left / cd.interval;
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(ex + 3, cy + L.cardH - 5, L.cardW - 6, 3);
        g.fillStyle = "#5ac8fa";
        g.fillRect(ex + 3, cy + L.cardH - 5, (L.cardW - 6) * frac, 3);
        cdTxt = ` · ${cd.left.toFixed(1)}s`;
      }
      g.textAlign = "left";
      const name = eq.hiddenAffix ? `【隐藏】${eq.effect.def.name}` : eq.effect.def.name;
      if (boss) {
        g.fillStyle = q.color;
        g.font = "bold 12px system-ui, sans-serif";
        g.fillText(this.fitOne(name + cdTxt, L.cardW - 38), ex + 33, cy + 22);
      } else {
        g.fillStyle = q.color;
        g.font = "bold 12px system-ui, sans-serif";
        g.fillText(this.fitOne(name, L.cardW - 38), ex + 33, cy + 15);
        g.fillStyle = "#cfcfcf";
        g.font = "10px system-ui, sans-serif";
        const trig = eq.triggers.map((t) => t.def.name).join("/");
        const mod = eq.modifiers.map((m) => m.def.name).join("/");
        g.fillText(this.fitOne(`${trig}${mod ? " · " + mod : ""}${cdTxt}`, L.cardW - 38), ex + 33, cy + 30);
      }
      ex += L.cardW + L.gap;
    }
    if (L.chip) {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(ex, cy, L.chipW, L.cardH);
      g.strokeStyle = "rgba(255,255,255,0.2)";
      g.lineWidth = 1;
      g.strokeRect(ex, cy, L.chipW, L.cardH);
      g.fillStyle = "#cfcfcf";
      g.font = "bold 12px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(this.fitOne(`+${L.hidden}`, L.chipW - 4), ex + L.chipW / 2, cy + 22);
      g.textAlign = "left";
    }
  }

  /** 首局引导横幅(教学提示,居中悬浮;浮在所有界面之上,playing/shop 显示,点「跳过」终止) */
  private drawGuideBanner(g: CanvasRenderingContext2D, w: number): void {
    this.guideBanner = null;
    if (!(this.state === "playing" || this.state === "shop")) return;
    if (!this.guide.enabled || !this.guide.current) return;
    const bw = Math.min(360, w - 24);
    const bx = (w - bw) / 2;
    const by = this.state === "shop" ? 874 : 300;
    const bh = 66;
    const skip = { x: bx + bw - 54, y: by + 4, w: 48, h: 18 };
    this.guideBanner = { x: bx, y: by, w: bw, h: bh, skip };
    if (!this.assets.draw(g, "banner_large_navy_b", bx, by, bw, bh)) {
      g.fillStyle = "rgba(10,13,20,0.94)";
      g.fillRect(bx, by, bw, bh);
      g.strokeStyle = theme.actionPrimary;
      g.lineWidth = 1.5;
      g.strokeRect(bx, by, bw, bh);
    }
    g.fillStyle = theme.actionPrimary;
    g.font = "bold 11px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText("新手提示", bx + 8, by + 14);
    g.fillStyle = "rgba(255,107,122,0.16)";
    g.fillRect(skip.x, skip.y, skip.w, skip.h);
    g.strokeStyle = "rgba(255,107,122,0.5)";
    g.strokeRect(skip.x, skip.y, skip.w, skip.h);
    g.fillStyle = "#ff6b7a";
    g.font = "bold 10px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("跳过", skip.x + skip.w / 2, skip.y + 13);
    g.textAlign = "left";
    const lines = this.fitLines(this.guide.current.text, bw - 16);
    g.fillStyle = "#e8e8e8";
    g.font = "12px system-ui, sans-serif";
    lines.slice(0, 2).forEach((ln, i) => {
      g.fillText(ln, bx + 8, by + 32 + i * 16);
    });
    if (lines.length > 2) {
      g.fillStyle = "#8f9bb3";
      g.font = "9px system-ui, sans-serif";
      g.fillText("…", bx + 8, by + bh - 6);
    }
  }

  /* ---------- 赛季通行证(双轨:免费 + 高级,需求优化 v2;档位/进度系数见 data/pass 规范表) ---------- */

  private passProgress(): number {
    // 累计回响 + 关卡星数加权(策划案 V3 §4.2:星数叠加通行证进度)
    const stars = this.save.stageStars.reduce((s, n) => s + n, 0);
    return calcPassProgress(this.save.points, this.save.dayEcho, stars);
  }

  /** 高级轨是否生效:遗留布尔(调试/发放)或本赛季看广告激活(赛季翻页自动失效) */
  private premiumActive(): boolean {
    return this.save.premiumPass || this.save.premiumPassSeason === this.save.seasonId;
  }

  /** 通行证高级轨激活行(绘制与命中同一矩形来源) */
  private passActRect(): { x: number; y: number; w: number; h: number } {
    return { x: ui.pad, y: 92, w: this.logicalW - ui.pad * 2, h: 40 };
  }

  private drawPass(g: CanvasRenderingContext2D, w: number, h: number): void {
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    g.textAlign = "left";
    this.panelPad(g, w, h);
    skinHeader(g, this.assets, "banner_title_gold_b", "赛季通行证", pad, 36, "#ffd76a");
    g.fillStyle = "#e8e8e8";
    g.font = F(fs.body);
    const prog = this.passProgress();
    g.fillText(`累计回响 ${prog} · 本日 ${this.save.dayEcho} · 永久 ${this.save.points}`, pad, 62);
    const prem = this.premiumActive();
    g.fillStyle = prem ? "#ffd76a" : "#8f9bb3";
    g.font = F(fs.muted);
    let premX = pad;
    if (prem && this.assets.draw(g, "badge_pennant_purple", pad, 76, 11, 14)) premX += 15;
    g.fillText(prem ? "高级轨已激活(奖励翻倍)" : "高级轨未激活", premX, 88);

    // 高级轨激活行(§8 遗留决策落地·用户拍板:看广告解锁;本赛季有效,赛季翻页自动失效)
    const act = this.passActRect();
    g.font = F(fs.body);
    if (prem) {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.muted);
      g.fillText(this.save.premiumPass ? "✓ 已激活 · 档位奖励 ×2" : "✓ 本赛季已看广告激活 · 档位奖励 ×2(下赛季需重新激活)", pad, rowTextY(act.y, act.h, fs.muted));
    } else {
      if (!skinButtonBase(g, this.assets, "btn_primary", act.x, act.y, act.w, act.h, 10)) {
        g.fillStyle = "rgba(255,215,106,0.12)";
        g.fillRect(act.x, act.y, act.w, act.h);
        g.strokeStyle = theme.gold;
        g.strokeRect(act.x, act.y, act.w, act.h);
      }
      g.fillStyle = theme.gold;
      g.textAlign = "center";
      g.fillText("▶ 看广告激活高级轨(奖励×2 · 本赛季有效)", w / 2, rowTextY(act.y, act.h, fs.body));
      g.textAlign = "left";
    }

    const listY0 = act.y + act.h + 14;
    this.assets.draw(g, "bar_pass_nodes", pad, listY0 - 10, w - pad * 2, 10);
    const { rowH, gap } = spreadRows(PASS_TIERS.length, listY0, h - 64, 56, 96, 60);
    g.font = F(fs.muted);
    PASS_TIERS.forEach((tier, i) => {
      const y = listY0 + i * (rowH + gap);
      const unlocked = prog >= tier.need;
      const claimed = i < this.save.passTier;
      g.fillStyle = claimed ? "rgba(77,255,200,0.08)" : "rgba(255,255,255,0.05)";
      g.fillRect(pad, y, w - pad * 2, rowH);
      g.strokeStyle = unlocked ? "#4dffc8" : "rgba(255,255,255,0.15)";
      g.strokeRect(pad, y, w - pad * 2, rowH);
      g.fillStyle = unlocked ? "#4dffc8" : "#8f9bb3";
      g.font = F(fs.body, true);
      g.fillText(`档位 ${i + 1} · 回响 ${tier.need}`, pad + 8, y + rowH / 2 - 12);
      g.fillStyle = "#cfcfcf";
      g.font = F(fs.muted);
      g.fillText(`免费:扭蛋券×${tier.tickets} + 星尘×${tier.stardust}`, pad + 8, y + rowH / 2 + 6);
      g.fillStyle = prem ? "#ffd76a" : "#8f9bb3";
      g.fillText(`高级:×2`, pad + 8, y + rowH / 2 + 24);
      g.textAlign = "right";
      if (claimed) {
        g.fillStyle = "#4dffc8";
        this.assets.draw(g, "mark_check_green", w - pad - 70, y + rowH / 2 - 6, 13, 13);
        g.fillText("已领取", w - pad - 8, rowTextY(y, rowH, fs.muted));
      } else if (unlocked) {
        g.fillStyle = "#ffd76a";
        g.font = F(fs.body, true);
        g.fillText("可领取", w - pad - 8, rowTextY(y, rowH, fs.body));
      } else {
        g.fillStyle = "#5a6a80";
        g.fillText("未解锁", w - pad - 8, rowTextY(y, rowH, fs.muted));
      }
      g.textAlign = "left";
      g.font = F(fs.muted);
    });

    // 总进度(以最高档需求为分母;贴底)
    const maxNeed = PASS_TIERS[PASS_TIERS.length - 1]?.need ?? 1;
    const pbY = h - 44;
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText(`总进度 ${Math.min(prog, maxNeed)}/${maxNeed}`, pad, pbY - 6);
    if (!skinBar(g, this.assets, "bar_progress_purple", pad, pbY, w - pad * 2, 10, prog / maxNeed)) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(pad, pbY, w - pad * 2, 10);
      g.fillStyle = "#c06cff";
      g.fillRect(pad, pbY, (w - pad * 2) * Math.min(1, prog / maxNeed), 10);
    }

    // 返回按钮(底板由闭包绘制,文字由 skinIconButton 单绘)
    skinIconButton(g, this.assets, "btn_back", w - pad - ui.backW, 22, ui.backW, ui.backH, "返回", () => {
      g.fillStyle = "#2a3d55";
      g.fillRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.strokeRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
    }, "#cfcfcf");
  }

  private onPassClick(p: Vec2): void {
    const pad = ui.pad;
    const w = this.logicalW;
    // 返回
    if (p.x >= w - pad - ui.backW && p.x <= w - pad && p.y >= 22 && p.y <= 22 + ui.backH) {
      this.state = "menu";
      return;
    }
    // 高级轨激活行(未激活→看广告激活,本赛季有效;已激活则空文案,点击不穿透到领取)
    const act = this.passActRect();
    if (p.x >= act.x && p.x <= act.x + act.w && p.y >= act.y && p.y <= act.y + act.h) {
      if (!this.premiumActive()) {
        this.watchAd(() => {
          this.save.premiumPassSeason = this.save.seasonId;
          persistSave(this.save);
        });
      }
      return;
    }
    // 领取下一档(顺序领取;整行点击 = 领取)
    const tier = PASS_TIERS[this.save.passTier];
    if (!tier) return;
    if (this.passProgress() < tier.need) return;
    const mult = this.premiumActive() ? PASS_PREMIUM_MULT : 1;
    this.save.gachaTicket += tier.tickets * mult;
    this.save.stardust += tier.stardust * mult;
    this.save.passTier += 1;
    persistSave(this.save);
  }

  /* ---------- 幻影榜(策划案 V3 §4.3:本地幻影,诚实展示,后端就绪可直插) ---------- */

  /** 当前赛季分对照幻影榜的名次(1–11;11 = 未入榜) */
  private currentPhantomRank(): number {
    return rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), phantomBoard(this.save.seasonId));
  }

  private drawLeaderboard(g: CanvasRenderingContext2D, w: number, h: number): void {
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);
    g.textAlign = "left";
    g.fillStyle = theme.gold;
    g.font = F(fs.title, true);
    g.fillText(`幻影榜 · S${this.save.seasonId}「${seasonTheme(this.save.seasonId).name}」`, pad, 36);
    g.fillStyle = theme.textSecondary;
    g.font = F(fs.muted);
    g.fillText("本地幻影 · 非联网数据 · 后端就绪后接入真榜", pad, 56);

    const board = phantomBoard(this.save.seasonId);
    const myScore = seasonScore(this.save.stageStars, this.save.seasonBest);
    const myRank = rankAmong(myScore, board);
    const y0 = 78;
    const { rowH, gap } = spreadRows(board.length + 1, y0, h - pad, 44, 72);
    // 10 幽灵 + 玩家行插入其名次位(第 11 名 = 未入榜,列末尾)
    for (let i = 0; i <= board.length; i++) {
      const isPlayer = i === myRank - 1;
      const ghost = isPlayer ? null : board[i < myRank - 1 ? i : i - 1];
      const y = y0 + i * (rowH + gap);
      const ty = rowTextY(y, rowH, fs.body);
      g.fillStyle = isPlayer ? "rgba(255,215,106,0.10)" : "rgba(255,255,255,0.05)";
      g.fillRect(pad, y, w - pad * 2, rowH);
      g.strokeStyle = isPlayer ? "#ffd76a" : "rgba(255,255,255,0.15)";
      g.strokeRect(pad, y, w - pad * 2, rowH);
      g.fillStyle = isPlayer ? "#ffd76a" : "#e8e8e8";
      g.font = F(fs.body, true);
      g.fillText(`No.${isPlayer ? myRank : ghost!.rank}`, pad + 10, ty);
      g.font = F(fs.muted);
      g.fillText(isPlayer ? "你" : `幻影 ${ghost!.rank}`, pad + 78, ty);
      // 关卡框徽标(§4.2 一次性奖励):框贴图优先,缺图回退代码金圈
      if (isPlayer && this.save.frames.length > 0) {
        const fx = pad + 118, fy = y + rowH / 2;
        const top = Math.max(...this.save.frames);
        if (!drawAvatarFrame(g, this.assets, top, fx, fy, 24)) {
          g.strokeStyle = "#ffd76a";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(fx, fy, 10, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 1;
          g.fillStyle = "#ffd76a";
          g.font = F(fs.micro, true);
          g.textAlign = "center";
          g.fillText(String(top), fx, fy + 4);
          g.textAlign = "left";
        }
      }
      g.textAlign = "right";
      g.fillStyle = isPlayer ? "#ffd76a" : "#8f9bb3";
      g.font = F(fs.body, true);
      g.fillText(`${isPlayer ? myScore : ghost!.score} 分`, w - pad - 10, ty);
      g.textAlign = "left";
    }

    // 返回按钮(与其他面板同款右上角)
    if (!skinButtonBase(g, this.assets, "btn_minor", w - pad - ui.backW, 22, ui.backW, ui.backH, 8)) {
      g.fillStyle = "#2a3d55";
      g.fillRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.strokeRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
    }
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText("返回", w - pad - ui.backW / 2, rowTextY(22, ui.backH, fs.muted));
    g.textAlign = "left";
  }

  /** 面板右上返回按钮命中(与绘制同几何):x 在 [logicalW-pad-backW, logicalW-pad],y 22..22+backH */
  private hitPanelBack(p: Vec2): boolean {
    const x0 = this.logicalW - ui.pad - ui.backW;
    return p.x >= x0 && p.x <= this.logicalW - ui.pad && p.y >= 22 && p.y <= 22 + ui.backH;
  }

  private onLeaderboardClick(p: Vec2): void {
    if (this.hitPanelBack(p)) {
      this.state = "menu";
      return;
    }
  }

  /* ---------- 出战英雄选择页(上列表下详情;第 13 屏) ---------- */

  /** 英雄页几何单一出口:draw、命中测试与惯性都读这一个源(滚动位为唯一变量) */
  private heroLayout(): HeroSelectLayout {
    return heroSelectLayout(this.logicalW, this.logicalH, allHeroes(), this.save.seasonId, this.heroScroll);
  }

  private heroIn(p: Vec2, r: { x: number; y: number; w: number; h: number }): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /** 进入英雄页:预览对齐存档,并把已出战那行滚进视口居中 */
  private openHeroes(): void {
    this.heroVel = 0;
    this.heroDrag = null;
    this.heroPreview = this.save.selectedHero;
    this.state = "heroes";
    const id = this.save.selectedHero;
    if (!id) return;
    const L = this.heroLayout();
    const idx = allHeroes().findIndex((hh) => hh.id === id);
    const step = HERO_ROW_H + HERO_ROW_GAP;
    this.heroScroll = clamp(idx * step - (L.list.h - step) / 2, 0, L.maxScroll);
  }

  /** 只有落在列表视口内的按下才接管为滚动手势 */
  private beginHeroDrag(p: Vec2): void {
    if (this.state !== "heroes") return;
    if (!this.heroIn(p, this.heroLayout().list)) return;
    this.heroVel = 0;
    this.heroDrag = {
      startY: p.y,
      startOffset: this.heroScroll,
      lastOffset: this.heroScroll,
      lastT: performance.now(),
      vel: 0,
      moved: false,
    };
  }

  private moveHeroDrag(p: Vec2): void {
    const d = this.heroDrag;
    if (!d || this.state !== "heroes") return;
    const L = this.heroLayout();
    const now = performance.now();
    const { display, settled } = dragScrollFrom(d.startOffset, p.y - d.startY, L.contentH, L.list.h);
    const inst = ((settled - d.lastOffset) / Math.max(1, now - d.lastT)) * 1000;
    d.vel = d.vel * 0.5 + inst * 0.5;
    d.lastOffset = settled;
    d.lastT = now;
    if (Math.abs(p.y - d.startY) > SCROLL_TAP_SLOP) d.moved = true;
    this.heroScroll = display;
  }

  /**
   * 松手:硬钳回边界并决定是否甩惯性。返回 false = 手势已被拖拽消费,调用方必须放弃点击判定
   * (微信端的位移阈值算的是屏幕 px,列表行算的是设计 px,两者不同源,不能只靠那边兜)。
   */
  private endHeroDrag(): boolean {
    const d = this.heroDrag;
    this.heroDrag = null;
    if (!d || this.state !== "heroes") return true;
    this.heroScroll = d.lastOffset;
    this.heroVel = flickOf(d.vel);
    return !d.moved;
  }

  private cancelHeroDrag(): void {
    const d = this.heroDrag;
    this.heroDrag = null;
    if (!d || this.state !== "heroes") return;
    this.heroScroll = d.lastOffset;
    this.heroVel = 0;
  }

  /** 逐帧推进惯性(拖拽期间由手势接管,不叠加) */
  private updateHeroScroll(dt: number): void {
    if (this.heroDrag || this.heroVel === 0) return;
    const L = this.heroLayout();
    const next = inertiaNext({ offset: this.heroScroll, vel: this.heroVel }, dt, L.contentH, L.list.h);
    this.heroScroll = next.offset;
    this.heroVel = next.vel;
  }

  private onHeroesClick(p: Vec2): void {
    const L = this.heroLayout();
    if (this.heroIn(p, L.backBtn)) {
      this.state = "menu";
      return;
    }
    if (this.heroIn(p, L.list)) {
      for (const row of L.rows) {
        if (!row.released || !this.heroIn(p, row.rect)) continue;
        this.heroPreview = row.id;
        return;
      }
      return; // 行间距/缓冲行:落在列表内就不往下走
    }
    if (this.heroIn(p, L.clearBtn)) {
      this.commitHero(null);
    } else if (this.heroIn(p, L.confirm)) {
      this.commitHero(this.heroPreview);
    }
  }

  /** 出战英雄唯一落盘路径(派生镜像 selectedSet 由 applyHeroSelection 同步) */
  private commitHero(id: HeroId | null): void {
    applyHeroSelection(this.save, id);
    persistSave(this.save);
    this.heroVel = 0;
    this.heroDrag = null;
    this.state = "menu";
  }

  private drawHeroes(g: CanvasRenderingContext2D, w: number, h: number): void {
    const pad = ui.pad;
    const now = performance.now();
    const L = this.heroLayout();
    const seasonId = this.save.seasonId;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);
    g.textAlign = "left";
    g.fillStyle = theme.gold;
    g.font = F(fs.title, true);
    g.fillText(`出战英雄 · S${seasonId}「${seasonTheme(seasonId).name}」`, pad, 36);
    g.fillStyle = theme.textSecondary;
    g.font = F(fs.muted);
    g.fillText(`已解锁 ${releasedHeroes(seasonId).length}/${allHeroes().length} · 后面赛季的英雄解锁后可继续出战`, pad, 56);

    // 列表(裁剪到视口:缓冲行不越界可见,也不可点)
    g.save();
    g.beginPath();
    g.rect(L.list.x, L.list.y, L.list.w, L.list.h);
    g.clip();
    for (const row of L.rows) {
      const hero = heroDef(row.id);
      const active = row.id === this.heroPreview;
      const current = row.id === this.save.selectedHero;
      g.fillStyle = active ? "rgba(90,200,250,0.14)" : "rgba(255,255,255,0.05)";
      g.fillRect(row.rect.x, row.rect.y, row.rect.w, row.rect.h);
      g.strokeStyle = active ? theme.select : "rgba(255,255,255,0.15)";
      g.strokeRect(row.rect.x, row.rect.y, row.rect.w, row.rect.h);
      drawHeroPortrait(this.assets, g, hero, row.portrait, { now, locked: !row.released });
      g.font = F(fs.body, true);
      g.fillStyle = row.released ? theme.textPrimary : theme.textMuted;
      g.fillText(hero.name, row.textX, row.nameY);
      g.font = F(fs.micro);
      g.fillStyle = row.released ? theme.textSecondary : theme.textMuted;
      const sub = row.released ? `${hero.title} · ${setDef(hero.setId).name}` : `S${hero.releaseSeason} 解锁`;
      g.fillText(this.fitOne(sub, row.badge.x - row.textX - 10), row.textX, row.subY);
      // 右缘徽标:当前出战者标「出战」,其余标首发赛季
      const b = row.badge;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      g.fillStyle = current ? hexA(theme.gold, 0.2) : row.released ? hexA(hero.accentColor, 0.16) : "rgba(255,255,255,0.05)";
      g.beginPath();
      g.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
      g.fill();
      if (current) {
        g.strokeStyle = theme.gold;
        g.beginPath();
        g.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = current ? theme.gold : row.released ? hero.accentColor : theme.textMuted;
      g.font = F(fs.micro, true);
      g.textAlign = "center";
      g.fillText(current ? "出战" : `S${hero.releaseSeason}`, cx, rowTextY(b.y, b.h, fs.micro));
      g.textAlign = "left";
    }
    g.restore();

    // 滚动条
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(L.track.x, L.track.y, L.track.w, L.track.h);
    if (L.thumb) {
      g.fillStyle = hexA(theme.select, 0.6);
      g.fillRect(L.thumb.x, L.thumb.y, L.thumb.w, L.thumb.h);
    }

    // 详情面板
    const d = L.detail;
    g.fillStyle = "rgba(255,255,255,0.04)";
    g.fillRect(d.x, d.y, d.w, d.h);
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.strokeRect(d.x, d.y, d.w, d.h);
    const preview = this.heroPreview ? heroDef(this.heroPreview) : null;
    if (!preview) {
      g.textAlign = "center";
      g.fillStyle = theme.textSecondary;
      g.font = F(fs.section, true);
      g.fillText("不出战", d.x + d.w / 2, d.y + 180);
      g.font = F(fs.muted);
      g.fillText("通用卡池 · 无套组加成", d.x + d.w / 2, d.y + 206);
      g.textAlign = "left";
    } else {
      drawHeroPortrait(this.assets, g, preview, L.portrait, { now });
      g.fillStyle = theme.textPrimary;
      g.font = F(fs.title, true);
      g.fillText(this.fitOne(preview.name, L.loreW), L.textX, L.nameY);
      g.fillStyle = preview.accentColor;
      g.font = F(fs.muted);
      g.fillText(this.fitOne(`${preview.title} · ${setDef(preview.setId).name}`, L.loreW), L.textX, L.titleY);
      g.fillStyle = theme.textSecondary;
      g.font = F(fs.muted);
      const lore = this.fitLines(preview.lore, L.loreW).slice(0, 3);
      for (let i = 0; i < lore.length; i++) g.fillText(lore[i], L.textX, L.loreY + i * 18);
      g.fillStyle = theme.gold;
      g.font = F(fs.micro, true);
      g.fillText("技能详情", L.portrait.x, L.skillLabelY);
      const lines = heroSkillLines(preview.id, seasonId);
      for (let i = 0; i < L.skillRows.length; i++) {
        const sr = L.skillRows[i];
        const line = lines[i];
        if (!line) continue;
        g.fillStyle = "rgba(255,255,255,0.04)";
        g.fillRect(sr.rect.x, sr.rect.y, sr.rect.w, sr.rect.h);
        g.fillStyle = hexA(preview.accentColor, 0.16);
        g.fillRect(sr.chip.x, sr.chip.y, sr.chip.w, sr.chip.h);
        g.fillStyle = preview.accentColor;
        g.font = F(fs.micro, true);
        g.textAlign = "center";
        g.fillText(line.tag, sr.chip.x + sr.chip.w / 2, rowTextY(sr.chip.y, sr.chip.h, fs.micro));
        g.textAlign = "left";
        const tx = sr.rect.x + 68;
        g.font = F(fs.body, true);
        g.fillStyle = theme.textPrimary;
        g.fillText(this.fitOne(line.label, sr.descW), tx, sr.labelY);
        g.font = F(fs.micro);
        g.fillStyle = theme.textMuted;
        g.fillText(this.fitOne(line.desc, sr.descW), tx, sr.descY);
      }
    }

    // 右上返回(与命中测试同读 L.backBtn)
    const B = L.backBtn;
    if (!skinButtonBase(g, this.assets, "btn_minor", B.x, B.y, B.w, B.h, 8)) {
      g.fillStyle = "#2a3d55";
      g.fillRect(B.x, B.y, B.w, B.h);
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.strokeRect(B.x, B.y, B.w, B.h);
    }
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText("返回", B.x + B.w / 2, rowTextY(B.y, B.h, fs.muted));
    g.textAlign = "left";

    primaryButton(g, L.confirm.x, L.confirm.y, L.confirm.w, L.confirm.h, preview ? "确定出战" : "确认不出战", true, this.assets);
    minorButton(g, L.clearBtn.x, L.clearBtn.y, L.clearBtn.w, L.clearBtn.h, "不出战", theme.textSecondary, this.assets);
  }

  /**
   * 主菜单布局(几何单一出口,见 src/ui/menuLayout.ts):本方法只供给运行时环境 ——
   * 表快照 + 本次参与排布的关卡/套组数量 + 贴图就绪状态;draw 与 hit-test 共用同一返回值。
   */
  private menuLayout(): MenuLayout {
    return menuLayoutPure(this.logicalW, this.logicalH, {
      table: snapshotMenuLayout(),
      stageIds: STAGES.map((s) => s.id),
      setIds: releasedSets(this.save.seasonId).map((s) => s.id),
      sectionStripReady: this.assets.isReady("menu_section_strip"),
      rowPlateSize: this.assets.sizeOf("menu_row_plate"),
      skin: snapshotMenuSkin(),
    });
  }

  private drawMenu(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.menuLayout();
    const D = L.d;
    const pad = L.pad;
    g.fillStyle = "rgba(11,14,20,0.68)";
    g.fillRect(0, 0, w, h);
    g.textAlign = "left";
    // 皮肤 textHidden:按面板隐藏文字层(图与热区不受影响;见 src/data/menuSkin.ts)
    const hiddenText = snapshotMenuSkin().textHidden;

    // 分区标题条:整图 512:73 等比绘制(端柱 + 中央菱形纹九宫格必裂),缺图退回纯文字
    const sectionHeader = (bandY: number, fallbackY: number, text: string, color: string): void => {
      if (L.sectionH <= 0) {
        if (hiddenText.includes("section")) return;
        g.fillStyle = theme.textSecondary;
        g.font = F(fs.body);
        g.fillText(text, pad, fallbackY);
        return;
      }
      this.assets.draw(g, "menu_section_strip", L.sectionX, bandY, L.sectionW, L.sectionH);
      if (hiddenText.includes("section")) return;
      g.fillStyle = color;
      g.font = F(fs.body, true);
      g.textAlign = "center";
      g.fillText(this.fitOne(text, L.sectionW - D.sectionTextPad), w / 2, rowTextY(bandY + D.sectionTextBand.dy, D.sectionTextBand.h, fs.body));
      g.textAlign = "left";
    };

    // 标题栏(新 UI:全宽自适应横幅;左纹章 + 标题,右侧两行右对齐,任意长度不溢出)
    const banX = D.ban.x, banY = D.ban.y, banW = D.ban.w, banH = D.ban.h;
    if (!this.assets.draw(g, "menu_title_plate", banX, banY, banW, banH)) {
      g.fillStyle = "rgba(45,26,64,0.92)";
      g.fillRect(banX, banY, banW, banH);
      g.strokeStyle = "rgba(200,182,255,0.35)";
      g.lineWidth = 1;
      g.strokeRect(banX, banY, banW, banH);
    }
    this.assets.draw(g, "crest_echo", D.crest.x, D.crest.y, D.crest.w, D.crest.h);
    // 横幅右下:体力 + 钻石(右对齐,钻石图标缺失回退字形)
    this.syncEnergy();
    if (!hiddenText.includes("title")) {
      g.fillStyle = theme.gold;
      g.font = F(fs.title, true);
      g.fillText("回响深渊", D.titlePos.x, D.titlePos.y);
      const sday = this.currentSeasonDay();
      const sScore = seasonScore(this.save.stageStars, this.save.seasonBest);
      g.fillStyle = theme.textSecondary;
      g.font = F(fs.muted);
      g.textAlign = "right";
      g.fillText(`赛季 S${this.save.seasonId} · ${seasonTheme(this.save.seasonId).name} · 第 ${sday}/${SEASON_DAYS} 天 · 赛季分 ${sScore}`, D.seasonPos.x, D.seasonPos.y);
      g.font = F(fs.muted, true);
      const eTxt = `⚡ ${this.save.energy}/${ENERGY_MAX}`;
      const dTxt = String(this.save.diamond);
      const dNumW = g.measureText(dTxt).width;
      const dBlockW = Math.max(dNumW + 22, g.measureText(`◆ ${dTxt}`).width);
      const dRight = D.seasonPos.x;
      const row2Y = D.row2Y;
      g.fillStyle = theme.diamond;
      if (!this.assets.draw(g, "badge_gem_purple", dRight - dNumW - D.gemOffX, row2Y - D.gemOffY, D.gemW, D.gemH)) {
        g.fillText(`◆ ${dTxt}`, dRight, row2Y);
      } else {
        g.fillText(dTxt, dRight, row2Y);
      }
      g.fillStyle = "#5ac8fa";
      g.fillText(eTxt, dRight - dBlockW - D.energyGap, row2Y);
      g.textAlign = "left";
    }
    // 货币行 + 幻影榜入口(底板 + 深色筹码:底图上保证可读;命中矩形见 menuLayout)
    // 底板两侧内缩到 pad、幻影筹码右缘再留 8,避免贴屏边(图2 反馈:右侧留空)
    const stripY = D.strip.y, stripH = D.strip.h;
    const stripX = D.strip.x, stripW = D.strip.w;
    if (!this.assets.draw(g, "menu_strip_plate", stripX, stripY, stripW, stripH)) {
      g.fillStyle = "rgba(18,24,44,0.88)";
      g.fillRect(stripX, stripY, stripW, stripH);
      g.strokeStyle = "rgba(255,215,106,0.28)";
      g.lineWidth = 1;
      g.strokeRect(stripX, stripY, stripW, stripH);
    }
    g.font = F(fs.body, true);
    const chipH = D.chipH, chipY = D.chipY;
    const chip = (x: number, cw: number, strokeC = "rgba(255,255,255,0.12)") => {
      if (this.assets.drawNineUniform(g, "menu_chip_plate", x, chipY, cw, chipH)) return;
      g.fillStyle = "rgba(8,10,16,0.55)";
      g.fillRect(x, chipY, cw, chipH);
      g.strokeStyle = strokeC;
      g.lineWidth = 1;
      g.strokeRect(x, chipY, cw, chipH);
    };
    // 筹码角饰按 nineMargin 等比内缩,图标/文字再留 3px 缓冲,不再压在金边上(贴边反馈)
    const currencies = [
      { key: "icon_ticket", gl: "✦", val: String(this.save.gachaTicket), x: D.chipXs[0], color: theme.gold },
      { key: "icon_echo", gl: "◈", val: String(this.save.points), x: D.chipXs[1], color: theme.echo },
      { key: "icon_stardust", gl: "❋", val: String(this.save.stardust), x: D.chipXs[2], color: theme.stardust },
    ];
    const cw0 = D.chipIconW + D.chipIconGap + g.measureText("0").width;
    const cm = this.assets.nineMargin("menu_chip_plate", cw0 + D.chipProbePad, chipH);
    // 内容在筹码内垂直居中(上下间隔一致):基线走 rowTextY,不再硬编码 82;皮肤 chip 面板 tb 在此收缩
    const chipBase = rowTextY(D.chipBase.y, D.chipBase.h, fs.body);
    for (const c of currencies) {
      const vw = g.measureText(c.val).width;
      chip(c.x - D.chipSlide, cm + D.chipInnerGap + cw0 + vw - g.measureText("0").width + D.chipTailPad);
      if (!hiddenText.includes("chip")) iconText(g, this.assets, c.key, c.gl, c.val, c.x - D.chipSlide + cm + D.chipInnerGap, chipBase, c.color, D.chipIconW);
    }
    const pTxt = `幻影榜 · No.${this.currentPhantomRank()}`;
    const pw = g.measureText(pTxt).width;
    const pPad = Math.max(this.assets.nineMargin("menu_chip_plate", pw + D.phChipProbeW, chipH) + D.phChipPadAdd, D.phChipPadMin);
    const p2 = D.phRightX, p1 = p2 - (pw + pPad * 2);
    chip(p1, pw + pPad * 2, "rgba(255,215,106,0.5)");
    if (!hiddenText.includes("chip")) {
      g.fillStyle = theme.gold;
      g.textAlign = "center";
      g.fillText(pTxt, (p1 + p2) / 2, chipBase);
      g.textAlign = "left";
    }
    const listHint = "主线关卡 · 通关解锁";
    sectionHeader(L.stageHdrY, D.listHintFallbackY, listHint, theme.textPrimary);

    // 关卡列表(赛季门控 + 星数;左头像框徽章 + 状态色条,行随可用高度伸展)
    for (const r of L.rows) {
      const st = stageOf(r.id);
      const unlocked = this.stageOpen(r.id);
      const cleared = r.id < this.save.highestStage;
      const stars = this.save.stageStars[r.id] ?? 0;
      const cy = r.y + r.h / 2;
      const c1 = Math.round(cy - D.rowC1Off); // 首行基线
      const c2 = c1 + D.rowC2Gap; // 次行基线
      // 行底板角饰/中央凸饰占用的宽度由 nineMargin 给出,内容整体内缩,文字不再压在金边上
      const m = L.rowMargin;
      const tx = r.x + m + D.rowTxOff; // 文字列起点(左侧徽章区)
      const makeup = unlocked && canStarMakeup(stars);
      // 右列再内缩,避开行底板右侧凸饰(图3 反馈:文字压底图图案)
      const rightX = r.x + r.w - m - D.rowRightInset - (makeup ? D.rowMakeupReserve : 0);
      // 关卡行底板:当前可挑战金边 / 其余常态板(锁定整板减淡);缺图回退原平面绘制
      if (!unlocked) g.globalAlpha = 0.55;
      const rowPlate = unlocked && !cleared ? "menu_row_plate_current" : "menu_row_plate";
      if (!this.assets.drawNineUniform(g, rowPlate, r.x, r.y, r.w, r.h)) {
        g.fillStyle = unlocked ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = unlocked ? (cleared ? "rgba(77,255,200,0.4)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.06)";
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
      g.globalAlpha = 1;
      // 头像框徽章(按关卡品质 1-2 普通/3-4 稀有/5 史诗/6 传说/7 隐藏;锁定减淡;缺图回退代码圆)
      const badgeX = r.x + m + D.badgeOffX;
      if (!unlocked) g.globalAlpha = 0.45;
      if (!drawAvatarFrame(g, this.assets, st.id, badgeX, cy, D.badgeSize)) {
        g.beginPath();
        g.arc(badgeX, cy, D.badgeR, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fill();
        g.strokeStyle = cleared ? "rgba(77,255,200,0.5)" : "rgba(255,215,106,0.5)";
        g.lineWidth = D.badgeStroke;
        g.stroke();
        if (!hiddenText.includes("row")) {
          g.fillStyle = "#ffd76a";
          g.font = F(fs.section, true);
          g.textAlign = "center";
          g.fillText(String(st.id), badgeX, cy + D.badgeTextOffY);
          g.textAlign = "left";
        }
      }
      g.globalAlpha = 1;
      if (!hiddenText.includes("row")) {
        g.fillStyle = unlocked ? "#e8e8e8" : "#5a6a80";
        g.font = F(fs.section, true);
        const baseName = `第${st.id}关 · ${st.name}`;
        g.fillText(baseName, tx, c1);
        let nameW = g.measureText(baseName).width;
        if (cleared) {
          const cw = this.assets.draw(g, "mark_check_green", tx + D.checkOffX + nameW, c1 - D.checkOffY, D.checkSize, D.checkSize) ? D.checkAdvance : 0;
          if (!cw) {
            g.fillText(baseName + " ✓", tx, c1);
            nameW = g.measureText(baseName + " ✓").width;
          }
          nameW += cw;
        }
        // 星数(通关后按表现 1–3 星;贴图优先,缺图回退字形)
        if (stars > 0) {
          const sx = tx + D.starOffX + nameW;
          const size = D.starSize;
          let drawn = 0;
          for (let i = 0; i < stars; i++) {
            if (this.assets.draw(g, "icon_star_gold", sx + i * (size + D.starGap), c1 - size + D.starLift, size, size)) drawn++;
            else break;
          }
          if (drawn === 0) {
            g.fillStyle = "#ffd76a";
            g.font = F(fs.body);
            g.fillText(starsText(stars), sx, c1);
          }
        }
        g.fillStyle = unlocked ? "#8f9bb3" : "#5a6a80";
        g.font = F(fs.muted);
        g.fillText(this.fitOne(st.desc, rightX - tx - D.descClipPad), tx, c2);
        g.fillStyle = st.bossChapter ? "#ff9d2e" : "#8f9bb3";
        g.font = F(fs.muted);
        g.textAlign = "right";
        g.fillText(`${st.chapters} 章${st.bossChapter ? " · Boss" : ""}${unlocked ? "" : " 🔒"}`, rightX, c1);
        // 第二行右列:解锁提示与奖励合并;赛季第一阶段显示"第 N 天开放"
        g.fillStyle = unlocked ? "#c8b6ff" : "#8f9bb3";
        let lockHint: string;
        if (unlocked) lockHint = `扭蛋券×${st.rewards.tickets}`;
        else {
          // 进度制解锁:显示门槛与当前进度
          const need = stageUnlockNeed(st.chapters, STAGE_UNLOCK_PROGRESS);
          const furthest = this.save.stageFurthest[st.id - 1] ?? 0;
          const prog = furthest > 0 ? `已到第${furthest}章 · ` : "";
          lockHint = `打到第${st.id - 1}关第${need}章解锁 · ${prog}券×${st.rewards.tickets}`;
        }
        g.fillText(lockHint, rightX, c2);
        g.textAlign = "left";
      }
      if (makeup) {
        const mk = L.makeupRect(r, m);
        const bw = mk.w, bh = mk.h;
        const bx = mk.x, by = mk.y;
        const afford = this.save.diamond >= STAR_MAKEUP_COST;
        g.fillStyle = afford ? "rgba(255,215,106,0.12)" : "rgba(255,255,255,0.03)";
        g.fillRect(bx, by, bw, bh);
        g.strokeStyle = afford ? theme.gold : "rgba(255,255,255,0.12)";
        g.strokeRect(bx, by, bw, bh);
        if (!hiddenText.includes("row")) {
          g.fillStyle = afford ? theme.gold : "#5a6a80";
          g.font = F(fs.muted);
          g.textAlign = "center";
          g.fillText("5◆ 补星", bx + bw / 2, rowTextY(by, bh, fs.muted));
          g.textAlign = "left";
        }
      }
    }

    // 主按钮(无限关)+ 场外入口(扭蛋/天赋/通行证/委托),统一用主题组件(UI 设计 v1)
    primaryButton(g, L.endlessBtn.x, L.endlessBtn.y, L.endlessBtn.w, L.endlessBtn.h, "♾ 无限关 · 爽模式", true, this.assets);
    skinIconButton(g, this.assets, "entry_gacha", L.gachaBtn.x, L.gachaBtn.y, L.gachaBtn.w, L.gachaBtn.h, "扭蛋", () => minorButtonBg(g, L.gachaBtn.x, L.gachaBtn.y, L.gachaBtn.w, L.gachaBtn.h, this.assets), theme.echo);
    skinIconButton(g, this.assets, "entry_talents", L.talentBtn.x, L.talentBtn.y, L.talentBtn.w, L.talentBtn.h, "天赋", () => minorButtonBg(g, L.talentBtn.x, L.talentBtn.y, L.talentBtn.w, L.talentBtn.h, this.assets), theme.echo);
    skinIconButton(g, this.assets, "entry_pass", L.passBtn.x, L.passBtn.y, L.passBtn.w, L.passBtn.h, this.premiumActive() ? "通行证★" : "通行证", () => minorButtonBg(g, L.passBtn.x, L.passBtn.y, L.passBtn.w, L.passBtn.h, this.assets), this.premiumActive() ? theme.gold : theme.echo);
    // 委托入口(场外;完成时红点提示)
    skinIconButton(g, this.assets, "entry_quests", L.commissionBtn.x, L.commissionBtn.y, L.commissionBtn.w, L.commissionBtn.h, "委托", () => minorButtonBg(g, L.commissionBtn.x, L.commissionBtn.y, L.commissionBtn.w, L.commissionBtn.h, this.assets), "#c8b6ff");
    if (this.commissionReady()) {
      g.fillStyle = "#ff5a6e";
      const dot = D.dotRect(L.commissionBtn);
      g.beginPath();
      g.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
      g.fill();
    }
    // 每日福利入口(广告驱动:宝箱 + 每日天赋);entry_forge 图标为权宜复用(无专属"每日"件)
    skinIconButton(g, this.assets, "entry_forge", L.dailyBtn.x, L.dailyBtn.y, L.dailyBtn.w, L.dailyBtn.h, "每日", () => minorButtonBg(g, L.dailyBtn.x, L.dailyBtn.y, L.dailyBtn.w, L.dailyBtn.h, this.assets), "#ffd76a");
    skinIconButton(g, this.assets, "entry_gearup", L.gearupBtn.x, L.gearupBtn.y, L.gearupBtn.w, L.gearupBtn.h, "升级", () => minorButtonBg(g, L.gearupBtn.x, L.gearupBtn.y, L.gearupBtn.w, L.gearupBtn.h, this.assets), theme.gold);
    // 每日宝箱红点(还有未领的宝箱)
    if (this.save.dailyBoxClaimed.length < DAILY_BOXES.length) {
      g.fillStyle = "#ffd76a";
      const dot = D.dotRect(L.dailyBtn);
      g.beginPath();
      g.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
      g.fill();
    }

    // 出战英雄展示带:接管原套组卡那一行(L.setBtns 仍按原式算 = 基线兼容锚点,算而不画)
    sectionHeader(L.setHdrY, L.setY - 12, "出战英雄", theme.textPrimary);
    const hero = showcaseHero(this.save);
    const band = L.heroBand;
    if (!this.assets.drawNineUniform(g, hero ? "menu_set_plate_selected" : "menu_set_plate", band.x, band.y, band.w, band.h)) {
      g.fillStyle = hero ? hexA(hero.accentColor, 0.14) : "rgba(255,255,255,0.05)";
      g.fillRect(band.x, band.y, band.w, band.h);
      g.strokeStyle = hero ? hexA(hero.accentColor, 0.55) : "rgba(255,255,255,0.16)";
      g.lineWidth = 1;
      g.strokeRect(band.x, band.y, band.w, band.h);
    }
    if (hero) {
      drawHeroPortrait(this.assets, g, hero, L.heroPort, { now: performance.now() });
    } else {
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.lineWidth = 1;
      g.strokeRect(L.heroPort.x, L.heroPort.y, L.heroPort.w, L.heroPort.h);
    }
    // 文字层沿用 setCard 面板开关(皮肤拓扑本批不新增面板)
    if (!hiddenText.includes("setCard")) {
      const set = hero ? setDef(hero.setId) : null;
      const starter = set ? SET_STARTERS[set.id] : null;
      const mut = set ? setMutation(this.save.seasonId, set.id) : null;
      g.font = F(fs.body, true);
      g.fillStyle = hero ? theme.textPrimary : theme.textMuted;
      g.fillText(this.fitOne(hero ? `${hero.name} · ${hero.title}` : "未选出战英雄", L.heroTextMaxW), L.heroTextX, L.heroRow1Y);
      g.font = F(fs.micro);
      g.fillStyle = hero ? hero.accentColor : theme.textMuted;
      g.fillText(
        this.fitOne(set ? `${set.name} · ${set.desc}` : "点右侧「更换英雄」,套组构筑随英雄出战", L.heroTextMaxW),
        L.heroTextX,
        L.heroRow2Y
      );
      g.fillStyle = theme.textSecondary;
      g.fillText(
        this.fitOne(starter ? `初始武器:${starter.name}${mut ? ` · 赛季联动:${mut.name}` : ""}` : "初始武器:随机通用卡池", L.heroTextMaxW),
        L.heroTextX,
        L.heroRow3Y
      );
    }
    minorButton(g, L.heroBtn.x, L.heroBtn.y, L.heroBtn.w, L.heroBtn.h, hero ? "更换英雄" : "选择英雄", hero ? hero.accentColor : theme.textSecondary, this.assets);
    if (hero) {
      const s = setDef(hero.setId);
      const st = SET_STARTERS[hero.setId];
      const mut = setMutation(this.save.seasonId, hero.setId);
      // 说明板:贴屏底通铺(高 = setDescH);文字左右对称内缩避开两端紫色端饰(图5 反馈:左右间距相等)
      this.assets.drawNineUniform(g, "menu_note_plate", D.note.x, D.note.y, D.note.w, D.note.h);
      if (!hiddenText.includes("note")) {
        const n1 = D.noteRow1Y;
        g.fillStyle = "#8f9bb3";
        g.font = F(fs.micro);
        g.fillText(
          this.fitOne(`出战「${hero.name}」· 商店偏向刷「${s.name}」卡 · 3 件:${s.bonus3.name} / 6 件:${s.bonus6.name}${mut ? ` · 赛季联动:${mut.name}(${mut.desc})` : ""}`, D.noteMaxW),
          D.noteX,
          n1
        );
        g.fillStyle = s.color;
        g.fillText(this.fitOne(`初始武器:${st.name} — ${st.desc}`, D.noteMaxW), D.noteX, n1 + D.noteRow2Gap);
      }
    }
  }

  private onMenuClick(p: Vec2): void {
    const L = this.menuLayout();
    // 幻影榜入口(货币行右侧;命中与绘制共用 layout 矩形)
    if (p.x >= L.phantomBtn.x && p.x <= L.phantomBtn.x + L.phantomBtn.w && p.y >= L.phantomBtn.y && p.y <= L.phantomBtn.y + L.phantomBtn.h) {
      this.state = "leaderboard";
      return;
    }
    if (p.x >= L.gearupBtn.x && p.x <= L.gearupBtn.x + L.gearupBtn.w && p.y >= L.gearupBtn.y && p.y <= L.gearupBtn.y + L.gearupBtn.h) {
      this.state = "gearup";
      return;
    }
    if (p.x >= L.gachaBtn.x && p.x <= L.gachaBtn.x + L.gachaBtn.w && p.y >= L.gachaBtn.y && p.y <= L.gachaBtn.y + L.gachaBtn.h) {
      this.openGacha();
      return;
    }
    if (p.x >= L.talentBtn.x && p.x <= L.talentBtn.x + L.talentBtn.w && p.y >= L.talentBtn.y && p.y <= L.talentBtn.y + L.talentBtn.h) {
      this.state = "prestige";
      return;
    }
    if (p.x >= L.passBtn.x && p.x <= L.passBtn.x + L.passBtn.w && p.y >= L.passBtn.y && p.y <= L.passBtn.y + L.passBtn.h) {
      this.state = "pass";
      return;
    }
    if (p.x >= L.commissionBtn.x && p.x <= L.commissionBtn.x + L.commissionBtn.w && p.y >= L.commissionBtn.y && p.y <= L.commissionBtn.y + L.commissionBtn.h) {
      this.openCommission("menu");
      return;
    }
    if (p.x >= L.dailyBtn.x && p.x <= L.dailyBtn.x + L.dailyBtn.w && p.y >= L.dailyBtn.y && p.y <= L.dailyBtn.y + L.dailyBtn.h) {
      this.state = "daily";
      return;
    }
    for (const r of L.rows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        // 补星按钮优先(§4.4):命中与绘制同源读 L.makeupRect,热调三个字段不脱节
        const stars = this.save.stageStars[r.id] ?? 0;
        const mk = L.makeupRect(r, L.rowMargin);
        if (this.stageOpen(r.id) && canStarMakeup(stars) && p.x >= mk.x && p.x <= mk.x + mk.w && p.y >= mk.y && p.y <= mk.y + mk.h) {
          this.starMakeup(r.id);
          return;
        }
        if (this.stageOpen(r.id)) this.startStage(r.id);
        return;
      }
    }
    if (p.x >= L.endlessBtn.x && p.x <= L.endlessBtn.x + L.endlessBtn.w && p.y >= L.endlessBtn.y && p.y <= L.endlessBtn.y + L.endlessBtn.h) {
      this.startEndless();
      return;
    }
    // 出战英雄展示带:「更换英雄」→ 英雄选择页(L.setBtns 仍算但不画 = 基线兼容锚点)
    if (p.x >= L.heroBtn.x && p.x <= L.heroBtn.x + L.heroBtn.w && p.y >= L.heroBtn.y && p.y <= L.heroBtn.y + L.heroBtn.h) {
      this.openHeroes();
      return;
    }
  }

  /* ---------- 扭蛋机(战场外抽卡) ---------- */

  private openGacha(): void {
    this.gachaResults = [];
    this.state = "gacha";
  }

  private gachaLevel(): number {
    return GACHA_EQUIPMENT_BASE_LEVEL + (this.save.highestStage - 1); // 扭蛋装备等级随关卡进度成长
  }

  private doGacha(count: number): void {
    const cost = count === 10 ? GACHA_10_COST : GACHA_COST;
    if (this.save.gachaTicket < cost) return;
    this.save.gachaTicket -= cost;
    const pity = { pityEpic: this.save.gachaPityEpic, pityLegendary: this.save.gachaPityLegendary };
    const results = count === 10 ? drawGacha10(this.gachaLevel(), pity, this.save.ownedGear) : [drawGacha(this.gachaLevel(), pity, this.save.ownedGear)];
    this.save.gachaPityEpic = pity.pityEpic;
    this.save.gachaPityLegendary = pity.pityLegendary;
    for (const r of results) {
      if (r.duplicate) {
        this.save.stardust += r.stardust;
      } else {
        this.save.ownedGear.push(r.eq);
        this.recordEquipment(r.eq);
      }
    }
    this.gachaResults = [...results, ...this.gachaResults].slice(0, 8);
    persistSave(this.save);
  }

  /** 广告免费抽 1 次(每日 1 次;不扣扭蛋券,保底推进正常) */
  private doGachaAd(): void {
    const pity = { pityEpic: this.save.gachaPityEpic, pityLegendary: this.save.gachaPityLegendary };
    const results = drawGacha(this.gachaLevel(), pity, this.save.ownedGear);
    this.save.gachaPityEpic = pity.pityEpic;
    this.save.gachaPityLegendary = pity.pityLegendary;
    if (results.duplicate) {
      this.save.stardust += results.stardust;
    } else {
      this.save.ownedGear.push(results.eq);
      this.recordEquipment(results.eq);
    }
    this.gachaResults = [results, ...this.gachaResults].slice(0, 8);
    persistSave(this.save);
  }

  /** 扭蛋机纵向分区(竖屏翻版 v2):主按钮行→钻石换券→保底条→最近抽取→收藏列表吃剩余高 */
  private gachaLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    const btnY = 122;
    const btnH = 48;
    const ticketY = btnY + btnH + 10;
    const pityLabelY = ticketY + 38 + 18;
    const resLabelY = pityLabelY + 40; // 传奇保底行(+18 基线、条至 +18)之下留足间距,避免与"最近抽取"压字
    const resLineH = 20;
    const nRes = Math.min(this.gachaResults.length, 5);
    const collLabelY = resLabelY + (nRes > 0 ? nRes * resLineH : resLineH) + 22;
    const rowsTop = collLabelY + 36;
    const { rowH, gap } = spreadRows(this.save.ownedGear.length, rowsTop, h - pad, 40, 64);
    return {
      backBtn: { x: w - pad - ui.backW, y: 22, w: ui.backW, h: ui.backH },
      singleBtn: { x: pad, y: btnY, w: 110, h: btnH },
      tenBtn: { x: pad + 120, y: btnY, w: 170, h: btnH },
      adBtn: { x: pad + 300, y: btnY, w: w - pad * 2 - 300, h: btnH },
      ticketBtn: { x: pad, y: ticketY, w: w - pad * 2, h: 38 },
      pityLabelY,
      pityBarY: pityLabelY + 8,
      resLabelY,
      resLineH,
      collLabelY,
      rows: this.save.ownedGear.map((g, i) => ({
        id: g.id,
        x: pad,
        y: rowsTop + i * (rowH + gap),
        w: w - pad * 2,
        h: rowH,
      })),
    };
  }

  private drawGacha(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.gachaLayout();
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    g.textAlign = "left";
    this.panelPad(g, w, h);
    skinHeader(g, this.assets, "banner_large_purple", "扭蛋机", pad, 36, "#c06cff", 240, 46);
    g.font = F(fs.body, true);
    iconText(g, this.assets, "icon_ticket", "✦", `扭蛋券 ${this.save.gachaTicket}`, pad, 60, "#ffd76a", 15);

    // 返回
    skinIconButton(g, this.assets, "btn_back", L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h, "返回", () => {
      g.fillStyle = "#2a3d55";
      g.fillRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.strokeRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    }, "#cfcfcf");

    // 抽取按钮
    const canSingle = this.save.gachaTicket >= GACHA_COST;
    const canTen = this.save.gachaTicket >= GACHA_10_COST;
    if (!(canSingle && skinButtonBase(g, this.assets, "btn_minor", L.singleBtn.x, L.singleBtn.y, L.singleBtn.w, L.singleBtn.h, 8))) {
      g.fillStyle = canSingle ? "#3a2d4d" : "#1a1f2a";
      g.fillRect(L.singleBtn.x, L.singleBtn.y, L.singleBtn.w, L.singleBtn.h);
      g.strokeStyle = canSingle ? "#c06cff" : "rgba(255,255,255,0.2)";
      g.strokeRect(L.singleBtn.x, L.singleBtn.y, L.singleBtn.w, L.singleBtn.h);
    }
    g.fillStyle = canSingle ? "#c8b6ff" : "#5a6a80";
    g.font = F(fs.body, true);
    g.textAlign = "center";
    g.fillText("单抽", L.singleBtn.x + L.singleBtn.w / 2, rowTextY(L.singleBtn.y, L.singleBtn.h, fs.body));
    if (!(canTen && skinButtonBase(g, this.assets, "btn_primary", L.tenBtn.x, L.tenBtn.y, L.tenBtn.w, L.tenBtn.h, 8))) {
      g.fillStyle = canTen ? "#c06cff" : "#1a1f2a";
      g.fillRect(L.tenBtn.x, L.tenBtn.y, L.tenBtn.w, L.tenBtn.h);
      g.strokeStyle = canTen ? "#ffd76a" : "rgba(255,255,255,0.2)";
      g.strokeRect(L.tenBtn.x, L.tenBtn.y, L.tenBtn.w, L.tenBtn.h);
    }
    g.fillStyle = canTen ? "#ffd76a" : "#5a6a80";
    g.fillText("十连(保底史诗)", L.tenBtn.x + L.tenBtn.w / 2, rowTextY(L.tenBtn.y, L.tenBtn.h, fs.body));
    g.textAlign = "left";

    // 看广告免费抽 1 次(每日 1 次,广告驱动)
    const canAdGacha = !this.save.dailyGachaAdUsed;
    if (!(canAdGacha && skinButtonBase(g, this.assets, "btn_primary", L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h, 8))) {
      g.fillStyle = canAdGacha ? "#1d3d2e" : "#1a1f2a";
      g.fillRect(L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h);
      g.strokeStyle = canAdGacha ? "#4dffc8" : "rgba(255,255,255,0.15)";
      g.strokeRect(L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h);
    }
    g.fillStyle = canAdGacha ? "#4dffc8" : "#5a6a80";
    g.font = F(fs.body, true);
    g.textAlign = "center";
    g.fillText(canAdGacha ? "广告免费抽" : "今日广告抽已用", L.adBtn.x + L.adBtn.w / 2, rowTextY(L.adBtn.y, L.adBtn.h, fs.body));
    g.textAlign = "left";

    // 钻石换扭蛋券(硬通货消费:广告 → 钻石 → 券)
    const canTicket = this.save.diamond >= DIAMOND_TICKET_COST;
    g.fillStyle = canTicket ? "#3a3320" : "#1a1f2a";
    g.fillRect(L.ticketBtn.x, L.ticketBtn.y, L.ticketBtn.w, L.ticketBtn.h);
    g.strokeStyle = canTicket ? "#ffd76a" : "rgba(255,255,255,0.15)";
    g.strokeRect(L.ticketBtn.x, L.ticketBtn.y, L.ticketBtn.w, L.ticketBtn.h);
    g.fillStyle = canTicket ? "#ffd76a" : "#5a6a80";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText(`钻石换扭蛋券(${DIAMOND_TICKET_COST}◆ = 1券 · 持有 ${this.save.diamond}◆)`, L.ticketBtn.x + L.ticketBtn.w / 2, rowTextY(L.ticketBtn.y, L.ticketBtn.h, fs.muted));
    g.textAlign = "left";

    // 保底进度(两行对齐:标签+计数在左,进度条从 pad+110 起,互不碰撞)
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText(`史诗保底 ${this.save.gachaPityEpic}/10`, pad, L.pityLabelY);
    const barX = pad + 110;
    const barW2 = w - pad * 2 - barX;
    if (!skinBar(g, this.assets, "bar_progress_blue_b", barX, L.pityBarY, barW2, 6, this.save.gachaPityEpic / 10)) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(barX, L.pityBarY, barW2, 6);
      g.fillStyle = "#c8b6ff";
      g.fillRect(barX, L.pityBarY, barW2 * Math.min(1, this.save.gachaPityEpic / 10), 6);
    }
    g.fillText(`传奇保底 ${this.save.gachaPityLegendary}/50`, pad, L.pityLabelY + 18);
    if (!skinBar(g, this.assets, "bar_progress_blue_b", barX, L.pityLabelY + 12, barW2, 6, this.save.gachaPityLegendary / 50)) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(barX, L.pityLabelY + 12, barW2, 6);
      g.fillStyle = "#ffd76a";
      g.fillRect(barX, L.pityLabelY + 12, barW2 * Math.min(1, this.save.gachaPityLegendary / 50), 6);
    }

    // 最近结果
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.muted);
    g.fillText("最近抽取:", pad, L.resLabelY);
    g.font = F(fs.muted);
    this.gachaResults.slice(0, 5).forEach((r, i) => {
      const q = qualityDef(r.eq.quality);
      const ly = L.resLabelY + (i + 1) * L.resLineH;
      g.fillStyle = q.color;
      g.fillText(`${r.eq.name}`, pad + 8, ly);
      if (r.duplicate) {
        g.fillStyle = "#c8b6ff";
        g.textAlign = "right";
        g.fillText(`重复→星尘+${r.stardust}`, w - pad, ly);
        g.textAlign = "left";
      }
    });

    // 收藏装备(开局带入)+ 收藏基础数值(通关刷装备的永久成长)
    g.fillStyle = "#4dffc8";
    g.font = F(fs.body, true);
    g.fillText("永久收藏(点选开局带入)", pad, L.collLabelY);
    const cb = collectionBonus(this.save.ownedGear);
    g.fillStyle = "#ffd76a";
    g.font = F(fs.micro);
    g.fillText(`加成:攻+${cb.atkPct}% 命+${cb.hpPct}%`, pad + 170, L.collLabelY);
    g.font = F(fs.muted);
    if (this.save.ownedGear.length === 0) {
      g.fillStyle = "#8f9bb3";
      g.fillText("还没有收藏,先抽一发吧", pad, L.collLabelY + 24);
    }
    for (const r of L.rows) {
      const gear = this.save.ownedGear.find((x) => x.id === r.id);
      if (!gear) continue;
      const q = qualityDef(gear.quality);
      const sel = this.save.selectedGearId === gear.id;
      g.fillStyle = sel ? "rgba(77,255,200,0.14)" : "rgba(255,255,255,0.04)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? "#4dffc8" : "rgba(255,255,255,0.12)";
      g.strokeRect(r.x, r.y, r.w, r.h);
      const ty = rowTextY(r.y, r.h, fs.muted);
      g.fillStyle = q.color;
      g.fillText(gear.name, r.x + 8, ty);
      g.fillStyle = "#8f9bb3";
      g.fillText(`Lv.${gear.level} ${q.name}`, r.x + 150, ty);
      if (sel) {
        g.fillStyle = "#4dffc8";
        g.textAlign = "right";
        g.fillText("带入中", r.x + r.w - 8, ty);
        g.textAlign = "left";
      }
    }
  }

  private onGachaClick(p: Vec2): void {
    const L = this.gachaLayout();
    if (p.x >= L.backBtn.x && p.x <= L.backBtn.x + L.backBtn.w && p.y >= L.backBtn.y && p.y <= L.backBtn.y + L.backBtn.h) {
      this.state = "menu";
      return;
    }
    if (p.x >= L.singleBtn.x && p.x <= L.singleBtn.x + L.singleBtn.w && p.y >= L.singleBtn.y && p.y <= L.singleBtn.y + L.singleBtn.h) {
      this.doGacha(1);
      return;
    }
    if (p.x >= L.tenBtn.x && p.x <= L.tenBtn.x + L.tenBtn.w && p.y >= L.tenBtn.y && p.y <= L.tenBtn.y + L.tenBtn.h) {
      this.doGacha(10);
      return;
    }
    if (p.x >= L.adBtn.x && p.x <= L.adBtn.x + L.adBtn.w && p.y >= L.adBtn.y && p.y <= L.adBtn.y + L.adBtn.h) {
      if (this.save.dailyGachaAdUsed) return;
      this.watchAd(() => {
        this.doGachaAd();
        this.save.dailyGachaAdUsed = true;
        persistSave(this.save);
      });
      return;
    }
    if (p.x >= L.ticketBtn.x && p.x <= L.ticketBtn.x + L.ticketBtn.w && p.y >= L.ticketBtn.y && p.y <= L.ticketBtn.y + L.ticketBtn.h) {
      if (this.save.diamond < DIAMOND_TICKET_COST) return;
      this.save.diamond -= DIAMOND_TICKET_COST;
      this.save.gachaTicket += 1;
      persistSave(this.save);
      return;
    }
    for (const r of L.rows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        // 点选/取消开局带入
        this.save.selectedGearId = this.save.selectedGearId === r.id ? null : r.id;
        persistSave(this.save);
        return;
      }
    }
  }

  /* ---------- 胜利结算 ---------- */

  private drawVictory(g: CanvasRenderingContext2D, w: number, h: number): void {
    const st = this.currentStage;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.assets.draw(g, "banner_large_navy_a", w / 2 - 120, h * 0.3 - 34, 240, 48);
    this.assets.draw(g, "player_pose_1", w / 2 + 132, h * 0.3 - 44, 58, 92);
    g.textAlign = "center";
    g.fillStyle = "#ffd76a";
    g.font = "bold 28px system-ui, sans-serif";
    g.fillText("通关!", w / 2, h * 0.3);
    if (st) {
      g.fillStyle = "#e8e8e8";
      g.font = "16px system-ui, sans-serif";
      g.fillText(`第${st.id}关 · ${st.name}`, w / 2, h * 0.3 + 34);
    }
    // 通关星数(策划案 V3 §4.2)与每日首通提示
    if (this.victoryStars > 0) {
      const size = 22;
      const step = size + 6;
      const totalW = this.victoryStars * step - 6;
      let drawn = 0;
      for (let i = 0; i < this.victoryStars; i++) {
        if (this.assets.draw(g, "icon_star_gold", w / 2 - totalW / 2 + i * step, h * 0.3 + 58 - size + 4, size, size)) drawn++;
        else break;
      }
      if (drawn === 0) {
        g.fillStyle = "#ffd76a";
        g.font = "bold 20px system-ui, sans-serif";
        g.fillText(starsText(this.victoryStars), w / 2, h * 0.3 + 58);
      }
    }
    if (this.firstClearBonus) {
      g.fillStyle = "#4dffc8";
      g.font = "16px system-ui, sans-serif";
      g.fillText("每日首通!奖励 ×2 / 回响 ×1.5", w / 2, h * 0.3 + 78);
    }
    const r = this.stageReward;
    if (r) {
      g.fillStyle = "#4dffc8";
      g.font = "16px system-ui, sans-serif";
      const tTxt = `扭蛋券 +${r.tickets}`;
      this.assets.draw(g, "icon_ticket", w / 2 - g.measureText(tTxt).width / 2 - 20, h * 0.3 + 92, 14, 14);
      g.fillText(tTxt, w / 2, h * 0.3 + 104);
      g.fillStyle = "#ffd76a";
      const pTxt = `回响点数 +${r.points}`;
      this.assets.draw(g, "icon_echo", w / 2 - g.measureText(pTxt).width / 2 - 20, h * 0.3 + 114, 14, 14);
      g.fillText(pTxt, w / 2, h * 0.3 + 126);
      if (r.stardust > 0) {
        g.fillStyle = "#c8b6ff";
        const sTxt = `星尘 +${r.stardust}`;
        this.assets.draw(g, "icon_stardust", w / 2 - g.measureText(sTxt).width / 2 - 20, h * 0.3 + 136, 14, 14);
        g.fillText(sTxt, w / 2, h * 0.3 + 148);
      }
    }
    // 通关装备掉落(进收藏,提供永久基础数值;重复的转星尘)
    if (this.stageDrops > 0) {
      g.fillStyle = "#c8b6ff";
      g.font = "16px system-ui, sans-serif";
      g.fillText(`掉落装备 ×${this.stageDrops}(已入收藏 · 提供基础数值)`, w / 2, h * 0.3 + 170);
    }
    // 幻影榜名次提升(§4.3)
    if (this.rankImprovedTo != null) {
      g.fillStyle = "#ffd76a";
      g.font = "bold 15px system-ui, sans-serif";
      g.fillText(`已超越幻影第 ${this.rankImprovedTo} 名`, w / 2, h * 0.3 + 192);
    }
    // 关卡框解锁(§4.2 一次性奖励):框贴图优先,缺图仅留文字
    if (this.frameUnlockedThisRun != null) {
      g.fillStyle = "#c8b6ff";
      g.font = "16px system-ui, sans-serif";
      const fTxt = `解锁关卡框 · 第 ${this.frameUnlockedThisRun} 关`;
      drawAvatarFrame(g, this.assets, this.frameUnlockedThisRun, w / 2 - g.measureText(fTxt).width / 2 - 18, h * 0.3 + 204, 22);
      g.fillText(fTxt, w / 2, h * 0.3 + 210);
    }
    // 广告双倍回响(每局 1 次)
    const dbl = { x: w / 2 - 95, y: h - 116, w: 190, h: 34 };
    this.doubleBtn = dbl;
    const canDouble = !this.doubleClaimed;
    if (!(canDouble && skinButtonBase(g, this.assets, "btn_primary", dbl.x, dbl.y, dbl.w, dbl.h, 10))) {
      g.fillStyle = canDouble ? "#3a3320" : "#1a1f2a";
      g.fillRect(dbl.x, dbl.y, dbl.w, dbl.h);
      g.strokeStyle = canDouble ? "#ffd76a" : "rgba(255,255,255,0.15)";
      g.strokeRect(dbl.x, dbl.y, dbl.w, dbl.h);
    }
    g.fillStyle = canDouble ? "#ffd76a" : "#5a6a80";
    g.font = "bold 15px system-ui, sans-serif";
    g.fillText(canDouble ? "广告 ×2 回响" : "已领双倍", dbl.x + dbl.w / 2, dbl.y + 22);
    // 返回菜单按钮
    if (!skinButtonBase(g, this.assets, "btn_minor", w / 2 - 95, h - 62, 190, 44, 10)) {
      g.fillStyle = "#2a3d55";
      g.fillRect(w / 2 - 95, h - 62, 190, 44);
      g.strokeStyle = "#5ac8fa";
      g.strokeRect(w / 2 - 95, h - 62, 190, 44);
    }
    g.fillStyle = "#fff";
    g.font = "bold 15px system-ui, sans-serif";
    g.fillText("返回菜单 (R)", w / 2, h - 34);
  }

  /** 赛季结算面板(策划案 V3 §4.1:到期翻页,赛季分→星尘) */
  private seasonBtn: Rect | null = null;
  private drawSeason(g: CanvasRenderingContext2D, w: number, h: number): void {
    const s = this.seasonSummary;
    g.fillStyle = "rgba(8,10,16,0.92)";
    g.fillRect(0, 0, w, h);
    this.assets.draw(g, "emblem_flow_gold", w / 2 - 24, h * 0.28 - 96, 48, 48);
    this.assets.draw(g, "banner_mid_bronze", w / 2 - 120, h * 0.28 - 32, 240, 44);
    g.textAlign = "center";
    g.fillStyle = theme.gold;
    g.font = "bold 24px system-ui, sans-serif";
    g.fillText("赛季结算", w / 2, h * 0.28);
    if (s) {
      g.fillStyle = "#e8e8e8";
      g.font = "16px system-ui, sans-serif";
      g.fillText(`赛季 S${s.id}「${seasonTheme(s.id).name}」结束`, w / 2, h * 0.28 + 34);
      g.fillStyle = theme.echo;
      g.font = "bold 17px system-ui, sans-serif";
      g.fillText(`赛季分 ${s.score}`, w / 2, h * 0.28 + 62);
      g.fillStyle = theme.stardust;
      g.fillText(`星尘 +${s.stardust}`, w / 2, h * 0.28 + 86);
      g.fillStyle = "#8f9bb3";
      g.font = "16px system-ui, sans-serif";
      g.fillText("星数与赛季最佳已重置 · 关卡/收藏/天赋永久保留", w / 2, h * 0.28 + 114);
    }
    g.fillStyle = "#2a3d55";
    const bw = 190, bh = 44;
    const bx = w / 2 - bw / 2, by = h - 78;
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = theme.gold;
    g.strokeRect(bx, by, bw, bh);
    g.fillStyle = "#fff";
    g.font = "bold 15px system-ui, sans-serif";
    g.fillText(`进入赛季 S${this.save.seasonId}`, w / 2, by + 28);
    this.seasonBtn = { x: bx, y: by, w: bw, h: bh };
  }

  /* ---------- 装备升级(装备系统重构:收藏装备外侧升级) ---------- */

  /** 升级面板行命中矩形(draw 与 click 同源) */
  private gearRows: { rect: { x: number; y: number; w: number; h: number }; btn: { x: number; y: number; w: number; h: number }; idx: number }[] = [];

  private drawGearUp(g: CanvasRenderingContext2D, w: number, h: number): void {
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h, "panel_gearup");
    g.textAlign = "left";
    g.fillStyle = theme.gold;
    g.font = F(fs.title, true);
    g.fillText("装备升级", pad, 36);
    g.fillStyle = theme.textSecondary;
    g.font = F(fs.muted);
    g.fillText("收藏装备 · 永久基础数值(每级 +25% 贡献,上限 5 级)", pad, 56);
    g.textAlign = "right";
    g.fillStyle = theme.stardust as string;
    g.font = F(fs.body, true);
    g.fillText(`❋ ${this.save.stardust}`, w - pad, 36);
    g.textAlign = "left";

    const gear = this.save.ownedGear;
    this.gearRows = [];
    if (gear.length === 0) {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.body);
      g.fillText("收藏还空着 —— 通关掉落的装备会进入收藏,可在此外侧升级", pad, h / 2);
    } else {
      const y0 = 78;
      const list = gear.slice(0, 14);
      const { rowH } = spreadRows(list.length, y0, h - pad - 8, 40, 56);
      list.forEach((eq, idx) => {
        const y = y0 + idx * (rowH + 4);
        const rect = { x: pad, y, w: w - pad * 2, h: rowH };
        const q = qualityDef(eq.quality);
        drawQualityFrame(g, rect.x, rect.y, rect.w, rect.h, q.color);
        const lv = this.save.gearLevels[eq.name] ?? 0;
        g.fillStyle = q.color;
        g.font = F(fs.body, true);
        g.fillText(this.fitOne(eq.name, 230), rect.x + 10, rowTextY(rect.y, rect.h, fs.body));
        g.fillStyle = theme.textSecondary as string;
        g.font = F(fs.micro);
        g.fillText(
          this.fitOne(`Lv.${lv}/${GEAR_UPGRADE_MAX} · 收藏贡献 攻+${(COLLECTION_ATK_PCT[eq.quality] * (1 + GEAR_UPGRADE_STEP * lv)).toFixed(0)}% → ${(COLLECTION_ATK_PCT[eq.quality] * (1 + GEAR_UPGRADE_STEP * (lv + 1))).toFixed(0)}%`, 320),
          rect.x + 10,
          rowTextY(rect.y, rect.h, fs.micro) + 14
        );
        const btn = { x: rect.x + rect.w - 100, y: rect.y + (rect.h - Math.min(rowH - 8, 30)) / 2, w: 90, h: Math.min(rowH - 8, 30) };
        // 等级星级徽记(美术翻新):5 颗逐级点亮,缺图回退文字星
        const starS = 12;
        const starGap = 3;
        const sx0 = btn.x - (GEAR_UPGRADE_MAX * starS + (GEAR_UPGRADE_MAX - 1) * starGap) - 10;
        const sy0 = rect.y + (rect.h - starS) / 2;
        for (let s = 0; s < GEAR_UPGRADE_MAX; s++) {
          g.globalAlpha = s < lv ? 1 : 0.22;
          if (!this.assets.draw(g, "badge_gear_lv", sx0 + s * (starS + starGap), sy0, starS, starS)) {
            g.fillStyle = s < lv ? (theme.stardust as string) : "#4a5164";
            g.font = F(fs.micro);
            g.fillText("★", sx0 + s * (starS + starGap), sy0 + starS - 2);
          }
          g.globalAlpha = 1;
        }
        const maxed = lv >= GEAR_UPGRADE_MAX;
        const cost = gearUpgradeCost(lv);
        const afford = !maxed && this.save.stardust >= cost;
        if (afford) {
          minorButtonBg(g, btn.x, btn.y, btn.w, btn.h, this.assets);
          g.fillStyle = theme.actionPrimary as string;
        } else {
          g.fillStyle = "#1A1F2A";
          g.fillRect(btn.x, btn.y, btn.w, btn.h);
          g.strokeStyle = "rgba(255,255,255,0.15)";
          g.lineWidth = 1;
          g.strokeRect(btn.x, btn.y, btn.w, btn.h);
          g.fillStyle = theme.textMuted as string;
        }
        g.font = F(fs.micro, true);
        g.textAlign = "center";
        g.fillText(maxed ? "已满级" : `${cost} ❋`, btn.x + btn.w / 2, rowTextY(btn.y, btn.h, fs.micro));
        g.textAlign = "left";
        this.gearRows.push({ rect, btn, idx });
      });
      if (gear.length > 14) {
        g.fillStyle = theme.textMuted as string;
        g.font = F(fs.micro);
        g.fillText(`仅显示前 14 件(共 ${gear.length} 件)`, pad, h - pad - 10);
      }
    }
    skinIconButton(g, this.assets, "btn_back", w - pad - ui.backW, 22, ui.backW, ui.backH, "返回", () => {
      g.fillStyle = "#1A1F2A";
      g.fillRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
      g.strokeRect(w - pad - ui.backW, 22, ui.backW, ui.backH);
    }, theme.echo);
  }

  private onGearUpClick(p: Vec2): void {
    const w = this.logicalW;
    const pad = ui.pad;
    if (p.x >= w - pad - ui.backW && p.x <= w - pad && p.y >= 22 && p.y <= 22 + ui.backH) {
      this.state = "menu";
      return;
    }
    for (const row of this.gearRows) {
      if (p.x >= row.btn.x && p.x <= row.btn.x + row.btn.w && p.y >= row.btn.y && p.y <= row.btn.y + row.btn.h) {
        const eq = this.save.ownedGear[row.idx];
        if (!eq) return;
        const lv = this.save.gearLevels[eq.name] ?? 0;
        if (lv >= GEAR_UPGRADE_MAX) return;
        const cost = gearUpgradeCost(lv);
        if (this.save.stardust < cost) return;
        this.save.stardust -= cost;
        this.save.gearLevels[eq.name] = lv + 1;
        persistSave(this.save);
        return;
      }
    }
  }

  private onSeasonClick(p: Vec2): void {
    const b = this.seasonBtn;
    if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      this.closeSeason();
    }
  }

  private closeSeason(): void {
    this.seasonSummary = null;
    this.seasonBtn = null;
    this.state = "menu";
  }

  private drawGameOver(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.fillStyle = "rgba(0,0,0,0.8)";
    g.fillRect(0, 0, w, h);
    this.assets.draw(g, "banner_large_red", w / 2 - 120, h * 0.3 - 34, 240, 48);
    g.globalAlpha = 0.5;
    this.assets.draw(g, "player_pose_4", w / 2 - 196, h * 0.3 - 44, 58, 92);
    g.globalAlpha = 1;
    g.textAlign = "center";
    g.fillStyle = "#ff5a5a";
    g.font = "bold 26px system-ui, sans-serif";
    g.fillText("阵亡", w / 2, h * 0.3);
    g.fillStyle = "#e8e8e8";
    g.font = "16px system-ui, sans-serif";
    g.fillText(`生存 ${this.formatTime(this.elapsed)}`, w / 2, h * 0.3 + 34);
    g.fillText(`波次 ${this.waves.wave} · 击杀 ${this.kills}`, w / 2, h * 0.3 + 56);
    g.fillStyle = "#ffd76a";
    if (this.stardustEarnedThisRun > 0) {
      g.fillText(`星尘 +${this.stardustEarnedThisRun}(天赋已满,回响点数转化为星尘)`, w / 2, h * 0.3 + 80);
    } else {
      g.fillText(`回响点数 +${this.pointsEarnedThisRun}(累计 ${this.save.points})`, w / 2, h * 0.3 + 80);
    }
    if (this.save.bestRun) {
      g.fillStyle = "#8f9bb3";
      g.font = "16px system-ui, sans-serif";
      g.fillText(`最佳纪录:击杀 ${this.save.bestRun.kills} · ${this.formatTime(this.save.bestRun.seconds)}`, w / 2, h * 0.3 + 100);
    }

    // 广告复活按钮(本局限次;复活成功不结算死亡)
    if (this.canRevive()) {
      const rb = { x: w / 2 - 110, y: h * 0.3 + 124, w: 220, h: 32 };
      this.reviveBtn = rb;
      if (!skinButtonBase(g, this.assets, "btn_primary", rb.x, rb.y, rb.w, rb.h, 10)) {
        g.fillStyle = "#1d3d2e";
        g.fillRect(rb.x, rb.y, rb.w, rb.h);
        g.strokeStyle = "#4dffc8";
        g.strokeRect(rb.x, rb.y, rb.w, rb.h);
      }
      g.fillStyle = "#4dffc8";
      g.font = "bold 15px system-ui, sans-serif";
      g.fillText(`看广告复活(剩余 ${this.reviveLimit() - this.reviveUsed} 次)`, rb.x + rb.w / 2, rb.y + 21);
    } else {
      this.reviveBtn = null;
    }

    // 三个按钮:重新开始 / 天赋树 / 返回菜单
    const bw = 118;
    const bh = 44;
    const gap = 8;
    const total = bw * 3 + gap * 2;
    const bx = w / 2 - total / 2;
    const by = h * 0.3 + 170;
    this.restartBtn = { x: bx, y: by, w: bw, h: bh };
    if (!skinButtonBase(g, this.assets, "btn_minor", bx, by, bw, bh, 8)) {
      g.fillStyle = "#2a3d55";
      g.fillRect(bx, by, bw, bh);
      g.strokeStyle = "#5ac8fa";
      g.strokeRect(bx, by, bw, bh);
    }
    g.fillStyle = "#fff";
    g.font = "bold 15px system-ui, sans-serif";
    g.fillText("重开 (R)", bx + bw / 2, by + 28);

    this.talentsBtn = { x: bx + bw + gap, y: by, w: bw, h: bh };
    g.fillStyle = "#3a2d4d";
    g.fillRect(bx + bw + gap, by, bw, bh);
    g.strokeStyle = "#c06cff";
    g.strokeRect(bx + bw + gap, by, bw, bh);
    g.fillStyle = "#fff";
    g.fillText("天赋 (T)", bx + bw + gap + bw / 2, by + 28);

    this.menuBtn = { x: bx + (bw + gap) * 2, y: by, w: bw, h: bh };
    g.fillStyle = "#1d2a3a";
    g.fillRect(bx + (bw + gap) * 2, by, bw, bh);
    g.strokeStyle = "#8f9bb3";
    g.strokeRect(bx + (bw + gap) * 2, by, bw, bh);
    g.fillStyle = "#fff";
    g.fillText("菜单 (M)", bx + (bw + gap) * 2 + bw / 2, by + 28);

    // 幻影榜名次提升(§4.3;死亡入账是预期值,放弃时才真正生效)
    if (this.rankImprovedTo != null) {
      g.fillStyle = "#ffd76a";
      g.font = "bold 15px system-ui, sans-serif";
      g.fillText(`已超越幻影第 ${this.rankImprovedTo} 名`, w / 2, h * 0.3 + 232);
    }

    // 广告双倍回响(死亡结算收益翻倍,每局 1 次)
    const dbl = { x: w / 2 - 95, y: h - 116, w: 190, h: 34 };
    this.doubleBtn = dbl;
    const canDouble = !this.doubleClaimed;
    if (!(canDouble && skinButtonBase(g, this.assets, "btn_primary", dbl.x, dbl.y, dbl.w, dbl.h, 10))) {
      g.fillStyle = canDouble ? "#3a3320" : "#1a1f2a";
      g.fillRect(dbl.x, dbl.y, dbl.w, dbl.h);
      g.strokeStyle = canDouble ? "#ffd76a" : "rgba(255,255,255,0.15)";
      g.strokeRect(dbl.x, dbl.y, dbl.w, dbl.h);
    }
    g.fillStyle = canDouble ? "#ffd76a" : "#5a6a80";
    g.font = "bold 15px system-ui, sans-serif";
    g.fillText(canDouble ? "广告 ×2 回响" : "已领双倍", dbl.x + dbl.w / 2, dbl.y + 22);
  }

  private drawJoystick(g: CanvasRenderingContext2D): void {
    if (!input.joystickVisible) return;
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(input.joystickOrigin.x, input.joystickOrigin.y, 56, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.beginPath();
    g.arc(input.joystickKnob.x, input.joystickKnob.y, 24, 0, Math.PI * 2);
    g.fill();
  }

  /* ---------- UI 命中测试 ---------- */

  private restartBtn: { x: number; y: number; w: number; h: number } | null = null;
  private talentsBtn: { x: number; y: number; w: number; h: number } | null = null;
  private menuBtn: { x: number; y: number; w: number; h: number } | null = null;
  private reviveBtn: { x: number; y: number; w: number; h: number } | null = null;
  private doubleBtn: { x: number; y: number; w: number; h: number } | null = null;


  private canRevive(): boolean {
    return this.reviveUsed < this.reviveLimit();
  }

  private hitRestart(p: Vec2): boolean {
    const b = this.restartBtn;
    if (!b) return false;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private hitTalentsBtn(p: Vec2): boolean {
    const b = this.talentsBtn;
    if (!b) return false;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private hitMenuBtn(p: Vec2): boolean {
    const b = this.menuBtn;
    if (!b) return false;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private hitReviveBtn(p: Vec2): boolean {
    const b = this.reviveBtn;
    if (!b) return false;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private hitDoubleBtn(p: Vec2): boolean {
    const b = this.doubleBtn;
    if (!b) return false;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }


  /* ---------- 转生与天赋界面(策划案 5.2) ---------- */

  private currentTalentRoute(): readonly { id: TalentId; name: string; cost: number; tier: number; desc: string }[] {
    return this.talentRoute === "efficient" ? EFFICIENT_ROUTE : this.talentRoute === "conqueror" ? CONQUEROR_ROUTE : BUILDER_ROUTE;
  }

  private prestigeLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    const route = this.currentTalentRoute();
    // 底部锚定:开始新轮回 → 蓝图配置 → 定向搜索 → 节点列表吃剩余
    const startBtn = { x: w / 2 - 130, y: h - pad - 52, w: 260, h: 52 };
    let blockTop = startBtn.y - 10;
    const effectBtns: { type: EffectType; x: number; y: number; w: number; h: number }[] = [];
    let effectLabelY = 0;
    if (this.owns("blueprint")) {
      const names: EffectType[] = ["knife", "nova", "skeleton", "cloud", "ray", "chain", "shield", "drain"];
      blockTop -= 46;
      effectLabelY = blockTop;
      const bw = (w - pad * 2 - 7 * 4) / 8;
      for (let i = 0; i < names.length; i++) {
        effectBtns.push({ type: names[i], x: pad + i * (bw + 4), y: blockTop + 18, w: bw, h: 28 });
      }
    }
    const triggerBtns: { type: TriggerType; x: number; y: number; w: number; h: number }[] = [];
    let triggerLabelY = 0;
    if (this.owns("targeted_search")) {
      const names: TriggerType[] = ["pulse", "kill", "hurt", "move", "hit", "combo"];
      blockTop -= 46;
      triggerLabelY = blockTop;
      const bw = (w - pad * 2 - 5 * 6) / 6;
      for (let i = 0; i < names.length; i++) {
        triggerBtns.push({ type: names[i], x: pad + i * (bw + 6), y: blockTop + 18, w: bw, h: 28 });
      }
    }
    const listY0 = 156;
    const { rowH, gap } = spreadRows(route.length, listY0, blockTop - 8, 40, 64);
    const rows: { id: TalentId; x: number; y: number; w: number; h: number }[] = [];
    route.forEach((n, i) => {
      rows.push({ id: n.id, x: pad, y: listY0 + i * (rowH + gap), w: w - pad * 2, h: rowH });
    });
    // 三系页签
    const tabW = (w - pad * 2) / 3;
    const tabs = [
      { route: "builder" as const, label: "构筑师", x: pad, y: 120, w: tabW, h: 30 },
      { route: "efficient" as const, label: "效率专家", x: pad + tabW, y: 120, w: tabW, h: 30 },
      { route: "conqueror" as const, label: "征服者", x: pad + tabW * 2, y: 120, w: tabW, h: 30 },
    ];
    return { rows, triggerBtns, effectBtns, startBtn, triggerLabelY, effectLabelY, tabs };
  }

  private drawPrestige(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.prestigeLayout();
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    g.textAlign = "left";
    this.panelPad(g, w, h);

    skinHeader(g, this.assets, "banner_purple_cosmic", "转生与天赋", ui.pad, 36, "#c06cff", 240, 46);
    this.assets.draw(g, "player_pose_5", 252, 4, 38, 60);
    g.fillStyle = "#e8e8e8";
    g.font = F(fs.body);
    const avail = availablePoints(this.save);
    g.fillText(`回响点数 ${this.save.points}(已用 ${this.save.points - avail})`, ui.pad, 60);
    g.fillStyle = "#ffd76a";
    g.font = F(fs.body, true);
    g.fillText(`可支配 ${avail}`, ui.pad + 210, 60);
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    const route = this.currentTalentRoute();
    const routeName = this.talentRoute === "efficient" ? "效率专家" : this.talentRoute === "conqueror" ? "征服者" : "构筑师";
    g.fillText(`${routeName}路线(${routeCost(route)}点)· 击败更多敌人获得回响点数`, ui.pad, 82);
    const col = this.save.collection;
    g.fillText(
      `图鉴:触发器 ${col.triggers.length}/${TRIGGERS.length} · 效果 ${col.effects.length}/${EFFECTS.length} · 修饰器 ${col.modifiers.length}/${MODIFIERS.length} · 敌方 ${col.enemies.length}/${Object.keys(ENEMY_DEFS).length + SEASON_MONSTERS.length}`,
      ui.pad,
      100,
    );

    // 三系页签(整条贴图打底,标签与选中态覆盖保留)
    this.assets.draw(g, "tabs_talent_three", L.tabs[0].x, L.tabs[0].y, L.tabs[0].w * 3, L.tabs[0].h);
    for (const t of L.tabs) {
      const sel = this.talentRoute === t.route;
      g.fillStyle = sel ? "rgba(192,108,255,0.25)" : "rgba(255,255,255,0.04)";
      g.fillRect(t.x, t.y, t.w, t.h);
      g.strokeStyle = sel ? "#c06cff" : "rgba(255,255,255,0.15)";
      g.strokeRect(t.x, t.y, t.w, t.h);
      g.fillStyle = sel ? "#c06cff" : "#8f9bb3";
      g.font = F(fs.muted, true);
      g.textAlign = "center";
      g.fillText(t.label, t.x + t.w / 2, rowTextY(t.y, t.h, fs.muted));
      g.textAlign = "left";
    }

    // 节点列表(两行布局:名称+价格 上行,描述 下行;行随高度伸展垂直居中)
    for (const r of L.rows) {
      const n = talentOf(r.id);
      const owned = this.owns(n.id);
      const affordable = !owned && avail >= n.cost && isTierUnlocked(this.save.ownedTalents, n.tier, this.currentTalentRoute());
      const l1 = Math.round(r.y + r.h / 2 - 6);
      const l2 = l1 + 19;
      // 行背景
      g.fillStyle = owned ? "rgba(77,255,200,0.10)" : "rgba(255,255,255,0.04)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = owned ? "#4dffc8" : "rgba(255,255,255,0.12)";
      g.strokeRect(r.x, r.y, r.w, r.h);
      // 名称(限宽,避免与右侧文本重叠)
      g.fillStyle = owned ? "#4dffc8" : "#e8e8e8";
      g.font = F(fs.body, true);
      g.fillText(this.fitLines(n.name, 150)[0] ?? n.name, r.x + 8, l1);
      // 层级徽标(名称下方一行左侧改右侧跟随)
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      // 价格/状态(右侧)
      g.font = F(fs.muted, true);
      g.textAlign = "right";
      if (owned) {
        g.fillStyle = "#4dffc8";
        const ow = g.measureText("已拥有").width;
        this.assets.draw(g, "mark_check_green", r.x + r.w - 12 - ow - 17, l1 - 12, 13, 13);
        g.fillText("已拥有", r.x + r.w - 8, l1);
      } else {
        g.fillStyle = affordable ? "#ffd76a" : "#5a6a80";
        g.fillText(`${n.cost}点 · Lv.${n.tier}`, r.x + r.w - 8, l1);
      }
      g.textAlign = "left";
      // 描述(整行宽)
      g.fillStyle = "#9aa7bd";
      g.font = F(fs.micro);
      g.fillText(this.fitLines(n.desc, r.w - 24)[0] ?? "", r.x + 8, l2);
    }

    // 开局配置
    if (L.triggerBtns.length > 0) {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      g.fillText("定向搜索:首次升级必定出现的触发器(再点一次取消)", ui.pad, L.triggerLabelY + 10);
      for (const b of L.triggerBtns) {
        const sel = this.runConfig.targetTrigger === b.type;
        g.fillStyle = sel ? "#ffd76a" : "#2a3d55";
        g.fillRect(b.x, b.y, b.w, b.h);
        g.strokeStyle = sel ? "#ffd76a" : "rgba(255,255,255,0.2)";
        g.strokeRect(b.x, b.y, b.w, b.h);
        g.fillStyle = sel ? "#0b0e14" : "#cfcfcf";
        g.font = F(fs.micro);
        g.textAlign = "center";
        g.fillText(triggerDef(b.type).name, b.x + b.w / 2, rowTextY(b.y, b.h, fs.micro));
        g.textAlign = "left";
      }
    }
    if (L.effectBtns.length > 0) {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      g.fillText("完美蓝图:开局武器效果(再点一次取消)", ui.pad, L.effectLabelY + 10);
      for (const b of L.effectBtns) {
        const sel = this.runConfig.blueprintEffect === b.type;
        g.fillStyle = sel ? "#4dffc8" : "#2a3d55";
        g.fillRect(b.x, b.y, b.w, b.h);
        g.strokeStyle = sel ? "#4dffc8" : "rgba(255,255,255,0.2)";
        g.strokeRect(b.x, b.y, b.w, b.h);
        g.fillStyle = sel ? "#0b0e14" : "#cfcfcf";
        g.font = F(fs.micro);
        g.textAlign = "center";
        g.fillText(effectDef(b.type).name, b.x + b.w / 2, rowTextY(b.y, b.h, fs.micro));
        g.textAlign = "left";
      }
    }

    // 开始新轮回按钮
    g.fillStyle = "#2a3d55";
    g.fillRect(L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h);
    g.strokeStyle = "#5ac8fa";
    g.lineWidth = 2;
    g.strokeRect(L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h);
    g.lineWidth = 1;
    g.fillStyle = "#fff";
    g.font = F(fs.section, true);
    g.textAlign = "center";
    g.fillText("开始新轮回 (R)", L.startBtn.x + L.startBtn.w / 2, rowTextY(L.startBtn.y, L.startBtn.h, fs.section));
    g.textAlign = "left";
  }

  private onPrestigeClick(p: Vec2): void {
    const L = this.prestigeLayout();
    // 页签切换
    for (const t of L.tabs) {
      if (p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h) {
        this.talentRoute = t.route;
        return;
      }
    }
    for (const r of L.rows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        this.buyTalent(r.id);
        return;
      }
    }
    for (const b of L.triggerBtns) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.runConfig.targetTrigger = this.runConfig.targetTrigger === b.type ? undefined : b.type;
        return;
      }
    }
    for (const b of L.effectBtns) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.runConfig.blueprintEffect = this.runConfig.blueprintEffect === b.type ? undefined : b.type;
        return;
      }
    }
    if (p.x >= L.startBtn.x && p.x <= L.startBtn.x + L.startBtn.w && p.y >= L.startBtn.y && p.y <= L.startBtn.y + L.startBtn.h) {
      this.startNewRun();
    }
  }

  /* ---------- 融合界面(策划案 5.3) ---------- */

  private fusionLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    const rows: { id: number; x: number; y: number; w: number; h: number }[] = [];
    const eqs = this.player.equipment;
    // 自底向上:融合钮 → 下方面板块(高 156)→ 装备列表吃剩余
    const fuseBtn = { x: w / 2 - 110, y: h - pad - 48, w: 220, h: 48 };
    const panelY = fuseBtn.y - 180;
    const { rowH, gap } = spreadRows(eqs.length, 92, panelY - 12, 44, 76);
    eqs.forEach((_, i) => {
      rows.push({ id: eqs[i].id, x: pad, y: 92 + i * (rowH + gap), w: w - pad * 2, h: rowH });
    });
    const backBtn = { x: w - pad - ui.backW, y: 22, w: ui.backW, h: ui.backH };
    // 隐藏词缀三选一卡片(一行三张)
    const cw = 150;
    const ch = 128;
    const cx = (w - cw * 3 - 16 * 2) / 2;
    const cy = h / 2 - ch / 2 + 10;
    const hiddenCards = [0, 1, 2].map((i) => ({ idx: i, x: cx + i * (cw + 16), y: cy, w: cw, h: ch }));
    return { rows, panelY, backBtn, fuseBtn, hiddenCards };
  }

  private drawFusion(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.fusionLayout();
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);

    g.textAlign = "left";
    this.assets.draw(g, "banner_mid_blue", pad - 6, 8, 190, 40);
    g.fillStyle = "#4dffc8";
    g.font = F(fs.title, true);
    g.fillText("装备融合", pad, 36);
    g.font = F(fs.body);
    iconText(g, this.assets, "icon_stardust", "❋", `星尘 ${this.save.stardust}`, pad, 62, "#c8b6ff", 14);

    // 返回按钮
    g.fillStyle = "#2a3d55";
    g.fillRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.strokeRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText("返回", L.backBtn.x + L.backBtn.w / 2, rowTextY(L.backBtn.y, L.backBtn.h, fs.muted));
    g.textAlign = "left";

    // 装备列表
    const eqs = this.player.equipment;
    if (eqs.length < 2) {
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.body);
      g.fillText("至少需要 2 件装备才能融合", w / 2, h / 2);
      return;
    }
    for (const r of L.rows) {
      const eq = eqs.find((e) => e.id === r.id)!;
      const q = qualityDef(eq.quality);
      const sel = this.fusA === eq.id ? "A" : this.fusB === eq.id ? "B" : this.fusC === eq.id ? "C" : null;
      const disabled = !!eq.hiddenAffix;
      const l1 = Math.round(r.y + r.h / 2 - 6);
      const l2 = l1 + 19;
      g.fillStyle = sel === "A" ? "rgba(90,200,250,0.16)" : sel === "B" ? "rgba(192,108,255,0.16)" : sel === "C" ? "rgba(255,215,106,0.16)" : "rgba(255,255,255,0.04)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? q.color : "rgba(255,255,255,0.12)";
      g.lineWidth = sel ? 2 : 1;
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.lineWidth = 1;
      g.fillStyle = sel === "A" ? "#5ac8fa" : sel === "B" ? "#c06cff" : sel === "C" ? "#ffd76a" : disabled ? "#5a6a80" : q.color;
      g.font = F(fs.body, true);
      g.fillText(sel ? `[${sel}] ` : "", r.x + 6, l1);
      g.fillText(eq.hiddenAffix ? `【隐藏·${eq.name}】` : eq.name, r.x + 6 + (sel ? 24 : 0), l1);
      g.fillStyle = "#cfcfcf";
      g.font = F(fs.micro);
      // 词缀摘要:让"自动继承品质更高一方"的规则有据可依
      const affixSummary = `${eq.triggers.map((t) => t.def.name).join("/")}/${eq.effect.def.name}${eq.modifiers.length ? "·" + eq.modifiers.map((m) => m.def.name).join("/") : ""}`;
      g.fillText(`Lv.${eq.level} ${q.name} · ${affixSummary}${disabled ? " · 不可作素材" : ""}`, r.x + 6, l2);
    }

    // 底部操作区
    const triple = this.fusC !== null && tripleUnlocked(this.save.ownedTalents.length);
    const [a, b] = this.fusedPair();
    if (triple) {
      this.drawTriplePanel(g, w, L);
      return;
    }
    if (!a || !b) {
      const hint = tripleUnlocked(this.save.ownedTalents.length)
        ? "选择两件(融合)或三件(三重融合·双触发器/双修饰器)"
        : "选择两件装备进行融合(A/B);三重融合需解锁 ≥6 个天赋节点";
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.muted);
      g.textAlign = "center";
      g.fillText(hint, w / 2, L.panelY + 20);
      g.textAlign = "left";
      return;
    }
    const cost = fusionCost(a.quality, b.quality);
    g.fillStyle = "#e8e8e8";
    g.font = F(fs.muted);
    g.fillText(`星尘成本 ${cost} · 隐藏词缀保底 ${this.save.fusionPity}/${HIDDEN_PITY_N}`, pad, L.panelY + 20);
    // 成品预览:部件自动继承品质更高一方(同品质取 A)
    const src = inheritSource(a, b);
    const previewParts = `${src.triggers.map((t) => t.def.name).join("/")}/${src.effect.def.name}${src.modifiers.length ? "·" + src.modifiers.map((m) => m.def.name).join("/") : ""}`;
    const pq = qualityDef(src.quality);
    g.fillStyle = pq.color;
    g.font = F(fs.body, true);
    g.fillText(`融合预览:融合·${previewParts}(${pq.name})`, pad, L.panelY + 42);
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText("部件自动继承品质更高一方(同品质取 A);必成功", pad, L.panelY + 62);

    // 融合按钮
    const canFuse = this.save.stardust >= cost;
    g.fillStyle = canFuse ? "#1d3d2e" : "#1a1f2a";
    g.fillRect(L.fuseBtn.x, L.fuseBtn.y, L.fuseBtn.w, L.fuseBtn.h);
    g.strokeStyle = canFuse ? "#4dffc8" : "rgba(255,255,255,0.2)";
    g.lineWidth = 2;
    g.strokeRect(L.fuseBtn.x, L.fuseBtn.y, L.fuseBtn.w, L.fuseBtn.h);
    g.lineWidth = 1;
    g.fillStyle = canFuse ? "#4dffc8" : "#5a6a80";
    g.font = F(fs.section, true);
    g.textAlign = "center";
    g.fillText(canFuse ? "融合" : `星尘不足(${cost})`, L.fuseBtn.x + L.fuseBtn.w / 2, rowTextY(L.fuseBtn.y, L.fuseBtn.h, fs.section));
    g.textAlign = "left";
  }

  /** 隐藏词缀保底三选一弹层(素材已消耗,必须三选一) */
  private drawHiddenChoice(g: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.pendingHidden) return;
    const L = this.fusionLayout();
    g.fillStyle = "rgba(4,6,10,0.92)";
    g.fillRect(0, 0, w, h);
    g.textAlign = "center";
    g.fillStyle = "#ffd76a";
    g.font = F(fs.title, true);
    g.fillText("隐藏词缀保底!", w / 2, h / 2 - 110);
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.body);
    g.fillText(`选择 1 / 3(每 ${HIDDEN_PITY_N} 次融合必出)`, w / 2, h / 2 - 78);
    g.textAlign = "left";
    for (const c of L.hiddenCards) {
      const hd = hiddenAffixDef(this.pendingHidden.candidates[c.idx]);
      g.fillStyle = "rgba(255,215,106,0.08)";
      g.fillRect(c.x, c.y, c.w, c.h);
      g.strokeStyle = hd.color;
      g.lineWidth = 2;
      g.strokeRect(c.x, c.y, c.w, c.h);
      g.lineWidth = 1;
      g.fillStyle = hd.color;
      g.font = F(fs.body, true);
      g.fillText(hd.name, c.x + 12, c.y + 30);
      // 描述折行(卡宽内每行约 10 个全角字符)
      g.fillStyle = "#cfcfcf";
      g.font = F(fs.micro);
      const chars = hd.desc.split("");
      for (let line = 0; line * 10 < chars.length && line < 4; line++) {
        g.fillText(chars.slice(line * 10, line * 10 + 10).join(""), c.x + 12, c.y + 56 + line * 16);
      }
      g.fillStyle = "#8f9bb3";
      g.fillText("点击选择", c.x + 12, c.y + c.h - 12);
    }
  }

  /** 三重融合面板(减压改版:模式二选一,部件自动继承) */
  private triplePanelRects(panelY: number) {
    const pad = ui.pad;
    return {
      mode: [
        { mode: "double_trigger" as TripleMode, label: "双触发器", x: pad, y: panelY, w: 124, h: 36 },
        { mode: "double_modifier" as TripleMode, label: "双修饰器", x: pad + 132, y: panelY, w: 124, h: 36 },
      ],
    };
  }

  private drawTriplePanel(g: CanvasRenderingContext2D, _w: number, L: ReturnType<typeof this.fusionLayout>): void {
    const [a, b, c] = this.fusedTriple();
    if (!a || !b || !c) return;
    const R = this.triplePanelRects(L.panelY);
    const cost = tripleFusionCost(a, b, c);

    // 模式切换
    for (const m of R.mode) {
      const sel = this.tripleMode === m.mode;
      g.fillStyle = sel ? "rgba(255,215,106,0.22)" : "#2a3d55";
      g.fillRect(m.x, m.y, m.w, m.h);
      g.strokeStyle = sel ? "#ffd76a" : "rgba(255,255,255,0.2)";
      g.strokeRect(m.x, m.y, m.w, m.h);
      g.fillStyle = sel ? "#ffd76a" : "#cfcfcf";
      g.font = F(fs.muted, true);
      g.textAlign = "center";
      g.fillText(m.label, m.x + m.w / 2, rowTextY(m.y, m.h, fs.muted));
      g.textAlign = "left";
    }
    g.fillStyle = "#e8e8e8";
    g.font = F(fs.muted);
    g.fillText(`三重融合 · 星尘 ${cost} · 隐藏词缀保底 ${this.save.fusionPity}/${HIDDEN_PITY_N}`, ui.pad, L.panelY + 54);

    // 成品预览:部件自动继承品质最高一方(同品质按 A/B/C 取先)
    const main = inheritSource(inheritSource(a, b), c);
    const previewParts = `${main.triggers.map((t) => t.def.name).join("/")}/${main.effect.def.name}${main.modifiers.length ? "·" + main.modifiers.map((m) => m.def.name).join("/") : ""}`;
    const pq = qualityDef(main.quality);
    g.fillStyle = pq.color;
    g.font = F(fs.body, true);
    g.fillText(`三重预览:三重·${previewParts}(${pq.name})`, ui.pad, L.panelY + 76);
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText(this.tripleMode === "double_trigger" ? "额外保留:其余装备首个触发器" : "额外保留:其余装备首个修饰器", ui.pad, L.panelY + 96);

    // 融合按钮
    const canFuse = this.save.stardust >= cost;
    g.fillStyle = canFuse ? "#1d3d2e" : "#1a1f2a";
    g.fillRect(L.fuseBtn.x, L.fuseBtn.y, L.fuseBtn.w, L.fuseBtn.h);
    g.strokeStyle = canFuse ? "#4dffc8" : "rgba(255,255,255,0.2)";
    g.lineWidth = 2;
    g.strokeRect(L.fuseBtn.x, L.fuseBtn.y, L.fuseBtn.w, L.fuseBtn.h);
    g.lineWidth = 1;
    g.fillStyle = canFuse ? "#4dffc8" : "#5a6a80";
    g.font = F(fs.section, true);
    g.textAlign = "center";
    g.fillText(canFuse ? "三重融合" : `星尘不足(${cost})`, L.fuseBtn.x + L.fuseBtn.w / 2, rowTextY(L.fuseBtn.y, L.fuseBtn.h, fs.section));
    g.textAlign = "left";
  }

  private onFusionClick(p: Vec2): void {
    const L = this.fusionLayout();
    // 隐藏词缀三选一:弹层打开时只响应卡片点击
    if (this.pendingHidden) {
      for (const c of L.hiddenCards) {
        if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
          this.pickHiddenAffix(this.pendingHidden.candidates[c.idx]);
          return;
        }
      }
      return;
    }
    // 返回(回到进入前的界面:战斗已移除入口,现为章间商店)
    if (p.x >= L.backBtn.x && p.x <= L.backBtn.x + L.backBtn.w && p.y >= L.backBtn.y && p.y <= L.backBtn.y + L.backBtn.h) {
      this.state = this.overlayFrom === "playing" ? "playing" : this.overlayFrom;
      return;
    }
    // 装备行
    for (const r of L.rows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        this.onFusionEquipmentTap(r.id);
        return;
      }
    }
    // 三重融合模式切换(3 件已选且已解锁)
    if (this.fusC !== null && tripleUnlocked(this.save.ownedTalents.length)) {
      const R = this.triplePanelRects(L.panelY);
      for (const m of R.mode) {
        if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
          this.tripleMode = m.mode;
          return;
        }
      }
      if (p.x >= L.fuseBtn.x && p.x <= L.fuseBtn.x + L.fuseBtn.w && p.y >= L.fuseBtn.y && p.y <= L.fuseBtn.y + L.fuseBtn.h) {
        this.doFusion();
      }
      return;
    }
    // 融合
    if (p.x >= L.fuseBtn.x && p.x <= L.fuseBtn.x + L.fuseBtn.w && p.y >= L.fuseBtn.y && p.y <= L.fuseBtn.y + L.fuseBtn.h) {
      this.doFusion();
    }
  }

  /* ---------- 体力不足面板(弹壳式硬体力:广告/钻石回体力) ---------- */

  private energyLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    const cx = w / 2;
    return {
      adBtn: { x: cx - 160, y: h * 0.42, w: 320, h: 52 },
      diamondBtn: { x: cx - 160, y: h * 0.42 + 62, w: 320, h: 46 },
      closeBtn: { x: cx - 160, y: h * 0.42 + 118, w: 320, h: 40 },
      backBtn: { x: w - pad - ui.backW, y: 22, w: ui.backW, h: ui.backH },
    };
  }

  private drawEnergy(g: CanvasRenderingContext2D, w: number, h: number): void {
    this.syncEnergy();
    const L = this.energyLayout();
    g.fillStyle = "rgba(8,10,16,0.92)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);
    g.textAlign = "center";
    this.assets.draw(g, "banner_mid_black", w / 2 - 110, h * 0.3 - 30, 220, 40);
    g.fillStyle = "#5ac8fa";
    g.font = F(fs.title, true);
    g.fillText("体力不足", w / 2, h * 0.3);
    g.fillStyle = "#e8e8e8";
    g.font = F(fs.body);
    g.fillText(`体力 ${this.save.energy}/${ENERGY_MAX} · 每 ${ENERGY_REGEN_SECONDS / 60} 分钟恢复 1 点`, w / 2, h * 0.3 + 34);
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.muted);
    g.fillText("补充体力继续闯关,或关闭回到主菜单", w / 2, h * 0.3 + 58);
    g.textAlign = "left";

    // 看广告 +5(每日限次)
    const adLeft = ENERGY_AD_LIMIT - this.save.energyAdCount;
    const canAd = adLeft > 0;
    if (!(canAd && skinButtonBase(g, this.assets, "btn_primary", L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h, 10))) {
      g.fillStyle = canAd ? "#1d3d2e" : "#1a1f2a";
      g.fillRect(L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h);
      g.strokeStyle = canAd ? "#4dffc8" : "rgba(255,255,255,0.15)";
      g.strokeRect(L.adBtn.x, L.adBtn.y, L.adBtn.w, L.adBtn.h);
    }
    g.fillStyle = canAd ? "#4dffc8" : "#5a6a80";
    g.font = F(fs.body, true);
    g.textAlign = "center";
    g.fillText(canAd ? `▶ 看广告 +${ENERGY_AD_GAIN} 体力(今日剩 ${adLeft} 次)` : "今日广告回体力已用尽", L.adBtn.x + L.adBtn.w / 2, rowTextY(L.adBtn.y, L.adBtn.h, fs.body));
    g.textAlign = "left";

    // 钻石回满
    const canDia = this.save.diamond >= ENERGY_DIAMOND_COST;
    if (!(canDia && skinButtonBase(g, this.assets, "btn_primary", L.diamondBtn.x, L.diamondBtn.y, L.diamondBtn.w, L.diamondBtn.h, 10))) {
      g.fillStyle = canDia ? "#3a3320" : "#1a1f2a";
      g.fillRect(L.diamondBtn.x, L.diamondBtn.y, L.diamondBtn.w, L.diamondBtn.h);
      g.strokeStyle = canDia ? "#ffd76a" : "rgba(255,255,255,0.15)";
      g.strokeRect(L.diamondBtn.x, L.diamondBtn.y, L.diamondBtn.w, L.diamondBtn.h);
    }
    g.fillStyle = canDia ? "#ffd76a" : "#5a6a80";
    g.font = F(fs.muted, true);
    g.textAlign = "center";
    g.fillText(`钻石回满体力(${ENERGY_DIAMOND_COST}◆ · 持有 ${this.save.diamond})`, L.diamondBtn.x + L.diamondBtn.w / 2, rowTextY(L.diamondBtn.y, L.diamondBtn.h, fs.muted));
    g.textAlign = "left";

    // 关闭
    g.fillStyle = "#2a3d55";
    g.fillRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h);
    g.strokeStyle = "#8f9bb3";
    g.strokeRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h);
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.body);
    g.textAlign = "center";
    g.fillText("关闭", L.closeBtn.x + L.closeBtn.w / 2, rowTextY(L.closeBtn.y, L.closeBtn.h, fs.body));
    g.textAlign = "left";

    // 返回(与 backBtn 命中同源)
    g.fillStyle = "#2a3d55";
    g.fillRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.strokeRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText("返回", L.backBtn.x + L.backBtn.w / 2, rowTextY(L.backBtn.y, L.backBtn.h, fs.muted));
    g.textAlign = "left";
  }

  private onEnergyClick(p: Vec2): void {
    const L = this.energyLayout();
    if (p.x >= L.backBtn.x && p.x <= L.backBtn.x + L.backBtn.w && p.y >= L.backBtn.y && p.y <= L.backBtn.y + L.backBtn.h) {
      this.energyPending = null;
      this.state = "menu";
      return;
    }
    if (p.x >= L.adBtn.x && p.x <= L.adBtn.x + L.adBtn.w && p.y >= L.adBtn.y && p.y <= L.adBtn.y + L.adBtn.h) {
      if (this.save.energyAdCount >= ENERGY_AD_LIMIT) return;
      this.watchAd(() => {
        this.syncEnergy();
        this.save.energy = Math.min(ENERGY_MAX, this.save.energy + ENERGY_AD_GAIN);
        this.save.energyAdCount += 1;
        persistSave(this.save);
        const act = this.energyPending;
        this.energyPending = null;
        if (act) act();
        else this.state = "menu";
      });
      return;
    }
    if (p.x >= L.diamondBtn.x && p.x <= L.diamondBtn.x + L.diamondBtn.w && p.y >= L.diamondBtn.y && p.y <= L.diamondBtn.y + L.diamondBtn.h) {
      if (this.save.diamond < ENERGY_DIAMOND_COST) return;
      this.save.diamond -= ENERGY_DIAMOND_COST;
      this.syncEnergy();
      this.save.energy = ENERGY_MAX;
      persistSave(this.save);
      const act = this.energyPending;
      this.energyPending = null;
      if (act) act();
      else this.state = "menu";
      return;
    }
    if (p.x >= L.closeBtn.x && p.x <= L.closeBtn.x + L.closeBtn.w && p.y >= L.closeBtn.y && p.y <= L.closeBtn.y + L.closeBtn.h) {
      this.energyPending = null;
      this.state = "menu";
    }
  }

  /* ---------- 每日福利(广告驱动:每日宝箱 + 每日天赋,跨天重置) ---------- */

  private dailyLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    // 三区(宝箱 3 行 + 天赋 3 行 + 补领 1 行)整页均分:组标签固定 22 高,行高走 spreadRows
    const talents = this.save.dailyTalents ?? [];
    const n = DAILY_BOXES.length + talents.length + 1;
    const listTop = 92;
    const labelH = 24;
    const { rowH, gap } = spreadRows(n, 0, h - pad - listTop - labelH * 2, 46, 92);
    let y = listTop + labelH;
    const boxLabelY = listTop + 16;
    const boxRows = DAILY_BOXES.map((b) => {
      const r = { id: b.id, x: pad, y, w: w - pad * 2, h: rowH };
      y += rowH + gap;
      return r;
    });
    const talentLabelY = y + 16;
    y += labelH;
    const talentRows = talents.map((t) => {
      const r = { id: t, x: pad, y, w: w - pad * 2, h: rowH };
      y += rowH + gap;
      return r;
    });
    y += gap > 6 ? 12 : 0;
    const makeUpRow = { x: pad, y, w: w - pad * 2, h: rowH };
    return { boxRows, talentRows, boxLabelY, talentLabelY, makeUpRow, rowH, backBtn: { x: w - pad - ui.backW, y: 22, w: ui.backW, h: ui.backH } };
  }

  private drawDaily(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.dailyLayout();
    const pad = ui.pad;
    g.fillStyle = "rgba(8,10,16,0.9)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);
    g.textAlign = "left";
    skinHeader(g, this.assets, "banner_title_gold_c", "每日福利(广告驱动)", pad, 36, "#ffd76a", 244);
    this.assets.draw(g, "player_pose_2", 252, 4, 38, 60);
    g.font = F(fs.muted);
    iconText(g, this.assets, "badge_gem_purple", "◆", `钻石 ${this.save.diamond} · 今日广告 ${this.save.adWatchCount} 次`, pad, 60, "#8f9bb3", 13);

    g.fillStyle = "#4dffc8";
    g.font = F(fs.body, true);
    g.fillText("每日宝箱(各看广告开启)", pad, L.boxLabelY);
    for (const r of L.boxRows) {
      const box = dailyBoxOf(r.id);
      const claimed = this.save.dailyBoxClaimed.includes(box.id);
      const l1 = Math.round(r.y + r.h / 2 - 5);
      const l2 = l1 + 18;
      if (!(claimed || skinButtonBase(g, this.assets, "btn_minor", r.x, r.y, r.w, r.h, 8))) {
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = "rgba(255,255,255,0.15)";
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
      if (claimed) {
        g.fillStyle = "rgba(77,255,200,0.08)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = "rgba(77,255,200,0.5)";
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
      g.fillStyle = claimed ? "#4dffc8" : "#e8e8e8";
      g.font = F(fs.body, true);
      g.fillText(box.name, r.x + 10, l1);
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      g.fillText(box.desc, r.x + 10, l2);
      g.textAlign = "right";
      g.fillStyle = claimed ? "#4dffc8" : "#ffd76a";
      g.font = F(fs.muted, true);
      g.fillText(claimed ? "✓ 已领取" : "▶ 广告开启", r.x + r.w - 10, l1);
      g.textAlign = "left";
    }

    g.fillStyle = "#c06cff";
    g.font = F(fs.body, true);
    g.fillText("每日天赋(数值墙工具 · 当日有效)", pad, L.talentLabelY);
    for (const r of L.talentRows) {
      const t = dailyTalentOf(r.id);
      const claimed = this.save.dailyTalentClaimed.includes(r.id);
      const l1 = Math.round(r.y + r.h / 2 - 5);
      const l2 = l1 + 18;
      if (!(claimed || skinButtonBase(g, this.assets, "btn_minor", r.x, r.y, r.w, r.h, 8))) {
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = "rgba(255,255,255,0.15)";
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
      if (claimed) {
        g.fillStyle = "rgba(192,108,255,0.1)";
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = "rgba(192,108,255,0.55)";
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
      g.fillStyle = claimed ? "#c06cff" : "#e8e8e8";
      g.font = F(fs.body, true);
      g.fillText(t.name, r.x + 10, l1);
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      g.fillText(t.desc, r.x + 10, l2);
      g.textAlign = "right";
      g.fillStyle = claimed ? "#c06cff" : "#ffd76a";
      g.font = F(fs.muted, true);
      const claimedCount = this.save.dailyTalentClaimed.length;
      g.fillText(claimed ? "✓ 已领取" : claimedCount < DAILY_TALENT_FREE ? "免费领取" : "▶ 广告解锁", r.x + r.w - 10, l1);
      g.textAlign = "left";
    }

    // 补领行(§4.4):今日未首通可看广告领首通同口径奖励;状态诚实展示
    const today = todayKey();
    const madeUp = this.save.makeUpDate === today;
    const cleared = this.save.dailyClearedDate === today;
    const m = L.makeUpRow;
    const m1 = Math.round(m.y + m.h / 2 - 5);
    const m2 = m1 + 18;
    if (!((!madeUp && !cleared) && skinButtonBase(g, this.assets, "btn_primary", m.x, m.y, m.w, m.h, 10))) {
      g.fillStyle = madeUp || cleared ? "rgba(255,255,255,0.03)" : "rgba(255,215,106,0.08)";
      g.fillRect(m.x, m.y, m.w, m.h);
      g.strokeStyle = madeUp || cleared ? "rgba(255,255,255,0.12)" : theme.gold;
      g.strokeRect(m.x, m.y, m.w, m.h);
    }
    g.fillStyle = madeUp || cleared ? "#8f9bb3" : "#ffd76a";
    g.font = F(fs.body, true);
    g.fillText("首通补领", m.x + 10, m1);
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText("今日没空打首通 · 看广告领同口径奖励(每日 1 次)", m.x + 10, m2);
    g.textAlign = "right";
    g.font = F(fs.muted, true);
    if (madeUp) {
      g.fillStyle = "#4dffc8";
      g.fillText("✓ 已补领", m.x + m.w - 10, m1);
    } else if (cleared) {
      g.fillStyle = "#4dffc8";
      g.fillText("✓ 已首通", m.x + m.w - 10, m1);
    } else {
      g.fillStyle = "#ffd76a";
      g.fillText("▶ 看广告领取", m.x + m.w - 10, m1);
    }
    g.textAlign = "left";

    // 返回
    g.fillStyle = "#2a3d55";
    g.fillRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.strokeRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    g.fillStyle = "#cfcfcf";
    g.font = F(fs.muted);
    g.textAlign = "center";
    g.fillText("返回", L.backBtn.x + L.backBtn.w / 2, rowTextY(L.backBtn.y, L.backBtn.h, fs.muted));
    g.textAlign = "left";
  }

  private onDailyClick(p: Vec2): void {
    const L = this.dailyLayout();
    if (p.x >= L.backBtn.x && p.x <= L.backBtn.x + L.backBtn.w && p.y >= L.backBtn.y && p.y <= L.backBtn.y + L.backBtn.h) {
      this.state = "menu";
      return;
    }
    // 补领(§4.4):今日未首通且未补领 → 看广告领首通同口径奖励(当日首通视为已消耗)
    const m = L.makeUpRow;
    if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
      const today = todayKey();
      if (this.save.dailyClearedDate === today || this.save.makeUpDate === today) return;
      this.watchAd(() => {
        const rw = makeUpReward(this.save.highestStage);
        this.save.gachaTicket += rw.tickets;
        const { permanent, day } = splitEcho(rw.echo);
        this.save.points += permanent;
        this.save.dayEcho += day;
        this.save.dailyClearedDate = today;
        this.save.dailyClearedStage = rw.stageId;
        this.save.makeUpDate = today;
        persistSave(this.save);
      });
      return;
    }
    // 宝箱:看广告开启
    for (const r of L.boxRows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        if (this.save.dailyBoxClaimed.includes(r.id)) return;
        this.watchAd(() => {
          const box = dailyBoxOf(r.id);
          this.save.gachaTicket += box.tickets;
          this.save.stardust += box.stardust;
          this.save.diamond += box.diamond;
          this.save.dailyBoxClaimed.push(box.id);
          persistSave(this.save);
        });
        return;
      }
    }
    // 每日天赋:前 DAILY_TALENT_FREE 个免费,其余看广告
    for (const r of L.talentRows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        if (this.save.dailyTalentClaimed.includes(r.id)) return;
        const claimedCount = this.save.dailyTalentClaimed.length;
        const apply = () => {
          this.save.dailyTalentClaimed.push(r.id);
          persistSave(this.save);
        };
        if (claimedCount < DAILY_TALENT_FREE) apply();
        else this.watchAd(apply);
        return;
      }
    }
  }

  /* ---------- 委托挂机界面(策划案六) ---------- */

  private openCommission(from: "playing" | "menu" = "playing"): void {
    this.overlayFrom = from;
    this.state = "commission";
  }

  private commissionLayout() {
    const w = this.logicalW;
    const h = this.logicalH;
    const pad = ui.pad;
    // 区域行:自底向上(开始钮→难度行→区域列表吃剩余)
    const rows: { id: RegionId; x: number; y: number; w: number; h: number }[] = [];
    const startBtn = { x: w / 2 - 130, y: h - pad - 52, w: 260, h: 52 };
    const diffY = startBtn.y - 30 - 42;
    const { rowH, gap } = spreadRows(REGIONS.length, 100, diffY - 24, 52, 88);
    REGIONS.forEach((r, i) => {
      rows.push({ id: r.id, x: pad, y: 100 + i * (rowH + gap), w: w - pad * 2, h: rowH });
    });
    const diffs: { level: number; x: number; y: number; w: number; h: number }[] = [];
    const bw = (w - pad * 2 - 4 * 8) / 5;
    DIFFICULTIES.forEach((d, i) => {
      diffs.push({ level: d.level, x: pad + i * (bw + 8), y: diffY, w: bw, h: 42 });
    });
    const backBtn = { x: w - pad - ui.backW, y: 22, w: ui.backW, h: ui.backH };
    const collectBtn = { x: 0, y: 0, w: 0, h: 0 };
    const abandonBtn = { x: 0, y: 0, w: 0, h: 0 };
    const exchangeBtn = { x: w - pad - 150, y: 58, w: 150, h: 32 };
    return { rows, diffs, backBtn, startBtn, collectBtn, abandonBtn, exchangeBtn, diffY };
  }

  /** 进行中的委托槽位(双委托天赋可同时 2 个) */
  private activeCommissionSlots(): { slot: "commission" | "commission2"; state: CommissionState }[] {
    const out: { slot: "commission" | "commission2"; state: CommissionState }[] = [];
    if (this.save.commission) out.push({ slot: "commission", state: this.save.commission });
    if (this.save.commission2) out.push({ slot: "commission2", state: this.save.commission2 });
    return out;
  }

  /** 绘制单个进行中的委托面板 */
  private drawCommissionPanel(g: CanvasRenderingContext2D, w: number, c: CommissionState, y: number, h: number): void {
    const region = regionOf(c.region);
    const hours = (Date.now() - c.startedAt) / 3600000;
    const bonus = this.commissionBonus();
    const eff = effectiveHours(hours, bonus);
    const reward = accruedReward(c, Date.now(), bonus);
    const diff = difficultyOf(c.difficulty);

    const parch = this.assets.draw(g, "panel_parchment", ui.pad, y, w - ui.pad * 2, h);
    if (!parch) {
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.fillRect(ui.pad, y, w - ui.pad * 2, h);
      g.strokeStyle = "rgba(200,182,255,0.35)";
      g.strokeRect(ui.pad, y, w - ui.pad * 2, h);
    }
    // 羊皮纸贴图上文字切深色(唯一改文字色处)
    g.fillStyle = parch ? "#2a2a33" : "#e8e8e8";
    g.font = F(fs.body, true);
    g.textAlign = "left";
    g.fillText(`委托中:${region.name} · 难度${c.difficulty}`, ui.pad + 8, y + 24);
    g.fillStyle = parch ? "#4a4a55" : "#8f9bb3";
    g.font = F(fs.muted);
    g.fillText(`已进行 ${hours.toFixed(1)}h · 有效时长 ${eff.toFixed(2)}h · 预计 ${reward} ${region.givesStardust ? "星尘" : region.givesDiamond ? "钻石" : "碎片"}`, ui.pad + 8, y + 48);
    g.font = F(fs.micro);
    g.fillText(`成功率 ${Math.round((1 - diff.fail) * 100)}% · 收益前2h 100%,之后降至 50%`, ui.pad + 8, y + 68);
    // 全额收益窗口进度(前 2h)
    if (!skinBar(g, this.assets, "bar_progress_teal", ui.pad + 8, y + h - 58, 200, 8, hours / 2)) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(ui.pad + 8, y + h - 58, 200, 8);
      g.fillStyle = "#4dffc8";
      g.fillRect(ui.pad + 8, y + h - 58, 200 * Math.min(1, hours / 2), 8);
    }

    const slot: "commission" | "commission2" = c === this.save.commission ? "commission" : "commission2";
    const collect = { x: w - ui.pad - 2 * 112 - 8, y: y + h - 44, w: 112, h: 36 };
    const abandon = { x: w - ui.pad - 112, y: y + h - 44, w: 112, h: 36 };
    g.fillStyle = "#1d3d2e";
    g.fillRect(collect.x, collect.y, collect.w, collect.h);
    g.strokeStyle = "#4dffc8";
    g.strokeRect(collect.x, collect.y, collect.w, collect.h);
    g.fillStyle = "#4dffc8";
    g.font = F(fs.body, true);
    g.textAlign = "center";
    g.fillText("领取", collect.x + collect.w / 2, rowTextY(collect.y, collect.h, fs.body));
    g.fillStyle = "#2a1d1d";
    g.fillRect(abandon.x, abandon.y, abandon.w, abandon.h);
    g.strokeStyle = "rgba(255,90,90,0.4)";
    g.strokeRect(abandon.x, abandon.y, abandon.w, abandon.h);
    g.fillStyle = "#ff8a8a";
    g.fillText("放弃", abandon.x + abandon.w / 2, rowTextY(abandon.y, abandon.h, fs.body));
    g.textAlign = "left";
    this.commPanelBtns.push({ slot, collect, abandon });
  }

  private drawCommission(g: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.commissionLayout();
    const pad = ui.pad;
    this.commPanelBtns = [];
    g.fillStyle = "rgba(8,10,16,0.86)";
    g.fillRect(0, 0, w, h);
    this.panelPad(g, w, h);
    g.textAlign = "left";

    skinHeader(g, this.assets, "banner_title_iron", "委托挂机", pad, 36, "#c8b6ff");
    this.assets.draw(g, "player_pose_6", 252, 4, 38, 60);
    g.font = F(fs.muted);
    iconText(g, this.assets, "icon_fragment", "✧", `词缀碎片 ${this.save.fragments}`, pad, 60, "#c8b6ff", 13);
    iconText(g, this.assets, "icon_stardust", "❋", `星尘 ${this.save.stardust}`, pad + 130, 60, theme.stardust, 13);
    g.fillStyle = "#8f9bb3";
    g.fillText(`转生 ${this.save.prestiges} 次`, pad + 250, 60);

    // 碎片兑换星尘(比例见 commissions 规范表)
    if (this.save.fragments >= FRAGMENT_TO_STARDUST) {
      g.fillStyle = "#3a2d4d";
      g.fillRect(L.exchangeBtn.x, L.exchangeBtn.y, L.exchangeBtn.w, L.exchangeBtn.h);
      g.strokeStyle = "#c06cff";
      g.strokeRect(L.exchangeBtn.x, L.exchangeBtn.y, L.exchangeBtn.w, L.exchangeBtn.h);
      g.fillStyle = "#c8b6ff";
      g.font = F(fs.muted);
      g.textAlign = "center";
      g.fillText(`兑换星尘 ×${Math.floor(this.save.fragments / FRAGMENT_TO_STARDUST)}`, L.exchangeBtn.x + L.exchangeBtn.w / 2, rowTextY(L.exchangeBtn.y, L.exchangeBtn.h, fs.muted));
      g.textAlign = "left";
    }

    // 返回按钮
    skinIconButton(g, this.assets, "btn_back", L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h, "返回", () => {
      g.fillStyle = "#2a3d55";
      g.fillRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.strokeRect(L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h);
    }, "#cfcfcf");

    // 进行中的委托(双委托天赋可同时进行 2 个)
    const slots = this.activeCommissionSlots();
    if (slots.length > 0) {
      const panelH = 150;
      const topY = 84;
      slots.forEach((slot, i) => {
        this.drawCommissionPanel(g, w, slot.state, topY + i * (panelH + 12), panelH);
      });
      return;
    }

    // 区域列表
    for (const r of L.rows) {
      const region = regionOf(r.id);
      const unlocked = regionUnlocked(region, this.save.prestiges, this.save.ownedTalents);
      const sel = this.commRegion === r.id;
      const l1 = Math.round(r.y + r.h / 2 - 5);
      const l2 = l1 + 18;
      g.fillStyle = sel ? "rgba(200,182,255,0.14)" : "rgba(255,255,255,0.04)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? "#c8b6ff" : "rgba(255,255,255,0.12)";
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle = unlocked ? (sel ? "#c8b6ff" : "#e8e8e8") : "#5a6a80";
      g.font = F(fs.body, true);
      g.fillText(region.name, r.x + 8, l1);
      g.fillStyle = "#8f9bb3";
      g.font = F(fs.micro);
      const unlockNote = region.unlockTreeFull
        ? "需天赋树点满"
        : region.unlockPrestiges > 0
          ? `需转生 ${region.unlockPrestiges} 次`
          : "初始解锁";
      g.fillText(`${region.output} · ${unlockNote}`, r.x + 8, l2);
      if (unlocked) {
        g.fillStyle = "#c8b6ff";
        g.font = F(fs.muted);
        g.textAlign = "right";
        g.fillText(`产出 ${region.baseRate}/h`, r.x + r.w - 8, l1);
        g.textAlign = "left";
      }
    }

    // 难度选择
    g.fillStyle = "#8f9bb3";
    g.font = F(fs.micro);
    g.fillText("难度(产出倍率/失败率)", pad, L.diffY - 6);
    for (const d of L.diffs) {
      const sel = this.commDifficulty === d.level;
      const dd = difficultyOf(d.level);
      g.fillStyle = sel ? "#ffd76a" : "#2a3d55";
      g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = sel ? "#ffd76a" : "rgba(255,255,255,0.2)";
      g.strokeRect(d.x, d.y, d.w, d.h);
      g.fillStyle = sel ? "#0b0e14" : "#cfcfcf";
      g.font = F(fs.muted, true);
      g.textAlign = "center";
      g.fillText(`×${dd.mult}`, d.x + d.w / 2, d.y + 17);
      g.font = F(fs.micro);
      g.fillText(`${Math.round(dd.fail * 100)}%败`, d.x + d.w / 2, d.y + 33);
      g.textAlign = "left";
    }

    // 开始委托按钮
    g.fillStyle = "#2a3d55";
    g.fillRect(L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h);
    g.strokeStyle = "#5ac8fa";
    g.lineWidth = 2;
    g.strokeRect(L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h);
    g.lineWidth = 1;
    g.fillStyle = "#fff";
    g.font = F(fs.section, true);
    g.textAlign = "center";
    g.fillText(`开始委托(4h)`, L.startBtn.x + L.startBtn.w / 2, rowTextY(L.startBtn.y, L.startBtn.h, fs.section));
    g.textAlign = "left";
  }

  private onCommissionClick(p: Vec2): void {
    const L = this.commissionLayout();
    if (p.x >= L.backBtn.x && p.x <= L.backBtn.x + L.backBtn.w && p.y >= L.backBtn.y && p.y <= L.backBtn.y + L.backBtn.h) {
      this.state = this.overlayFrom === "playing" ? "playing" : this.overlayFrom;
      return;
    }
    // 进行中(可能 2 个槽位):按面板按钮领取 / 放弃
    if (this.activeCommissionSlots().length > 0) {
      for (const b of this.commPanelBtns) {
        if (p.x >= b.collect.x && p.x <= b.collect.x + b.collect.w && p.y >= b.collect.y && p.y <= b.collect.y + b.collect.h) {
          this.collectCommission(b.slot);
          return;
        }
        if (p.x >= b.abandon.x && p.x <= b.abandon.x + b.abandon.w && p.y >= b.abandon.y && p.y <= b.abandon.y + b.abandon.h) {
          this.save[b.slot] = null;
          persistSave(this.save);
          return;
        }
      }
      return;
    }
    // 区域选择
    for (const r of L.rows) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        const region = regionOf(r.id);
        if (regionUnlocked(region, this.save.prestiges, this.save.ownedTalents)) {
          this.commRegion = r.id;
        }
        return;
      }
    }
    // 难度选择
    for (const d of L.diffs) {
      if (p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h) {
        this.commDifficulty = d.level;
        return;
      }
    }
    // 开始委托
    if (p.x >= L.startBtn.x && p.x <= L.startBtn.x + L.startBtn.w && p.y >= L.startBtn.y && p.y <= L.startBtn.y + L.startBtn.h) {
      this.startCommission();
      return;
    }
    // 碎片兑换星尘
    if (this.save.fragments >= FRAGMENT_TO_STARDUST && p.x >= L.exchangeBtn.x && p.x <= L.exchangeBtn.x + L.exchangeBtn.w && p.y >= L.exchangeBtn.y && p.y <= L.exchangeBtn.y + L.exchangeBtn.h) {
      const n = Math.floor(this.save.fragments / FRAGMENT_TO_STARDUST);
      this.save.fragments -= n * FRAGMENT_TO_STARDUST;
      this.save.stardust += n;
      persistSave(this.save);
    }
  }

  /** 委托天赋加成(效率专家路线,策划案 5.2) */
  private commissionBonus(): CommissionBonus {
    const owned = this.save.ownedTalents;
    return {
      rewardMult: offlineBonusFor(owned),
      speedMult: commissionSpeedFor(owned),
      timeScale: commissionTimeScaleFor(owned),
      uncapped: uncappedCommissionFor(owned),
    };
  }

  private startCommission(): void {
    const region = regionOf(this.commRegion);
    if (!regionUnlocked(region, this.save.prestiges, this.save.ownedTalents)) return;
    const c: CommissionState = { region: this.commRegion, difficulty: this.commDifficulty, startedAt: Date.now() };
    if (!this.save.commission) {
      this.save.commission = c;
    } else if (!this.save.commission2 && this.owns("double_commission")) {
      this.save.commission2 = c;
    } else {
      return; // 无空槽位
    }
    persistSave(this.save);
  }

  private collectCommission(slot: "commission" | "commission2"): void {
    const c = this.save[slot];
    if (!c) return;
    const region = regionOf(c.region);
    const { reward, failed } = collectReward(c, Date.now(), undefined, this.commissionBonus());
    if (region.givesStardust) {
      this.save.stardust += reward;
    } else if (region.givesDiamond) {
      this.save.diamond += reward;
    } else {
      this.save.fragments += reward;
    }
    // 委托产出扭蛋券(战场外抽卡资源)
    const hours = (Date.now() - c.startedAt) / 3600000;
    this.save.gachaTicket += commissionTickets(effectiveHours(hours, this.commissionBonus()));
    this.save[slot] = null;
    persistSave(this.save);
    void failed; // 失败已在奖励中体现(减半)
  }

  /* ---------- 工具 ---------- */

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /** 按像素宽度折行,返回多行文本 */
  private fitLines(text: string, maxW: number): string[] {
    const out: string[] = [];
    let line = "";
    for (const c of [...text]) {
      const test = line + c;
      if (line && this.g.measureText(test).width > maxW) {
        out.push(line);
        line = c;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out;
  }

  /** 单行限宽:超宽逐字截断并补「…」(按当前字体测量) */
  private fitOne(text: string, maxW: number): string {
    if (this.g.measureText(text).width <= maxW) return text;
    const chars = [...text];
    while (chars.length > 1 && this.g.measureText(chars.join("") + "…").width > maxW) chars.pop();
    return chars.join("") + "…";
  }

  /* ---------- 调试:装备三个示例 Build(策划案 3.4) ---------- */

  /** 开局武器:周期脉冲 + 指定效果(确定性,保证开局可破局)。完美蓝图可自定义效果 */
  private makeStarter(): Equipment {
    return makeStarterEquipment(this.runConfig.blueprintEffect ?? "knife");
  }

  /** 荆棘反伤流:受伤反应(HP<80%) + 火焰新星 */
  debugEquipThorn(): void {
    this.player.equipment = [
      {
        id: 9001,
        level: 3,
        quality: "epic" as Quality,
        name: "荆棘反伤",
        triggers: [makeTrigger("hurt", { hpThreshold: 0.8 })],
        effect: makeEffect("nova", { damage: 50, radius: 140 }, 3),
        modifiers: [makeModifier("power", { pct3: 0.2 })],
      },
    ];
  }

  /** 死亡连锁流:击杀触发+飞刀+连锁(3);周期脉冲(2s)+召唤骷髅 */
  debugEquipChain(): void {
    this.player.equipment = [
      {
        id: 9002,
        level: 3,
        quality: "legendary" as Quality,
        name: "死亡连锁",
        triggers: [makeTrigger("kill", { chance: 0.4 })],
        effect: makeEffect("knife", { damage: 28, speed: 540, radius: 640 }, 3),
        modifiers: [makeModifier("chain", { targets: 3 })],
      },
      {
        id: 9003,
        level: 3,
        quality: "rare" as Quality,
        name: "骷髅前排",
        triggers: [makeTrigger("pulse", { interval: 2 })],
        effect: makeEffect("skeleton", { count: 1, damage: 18, duration: 12 }, 3),
        modifiers: [],
      },
    ];
  }

  /** 移动炮台流:移动触发(5m)+毒云+爆炸;周期脉冲(1s)+飞刀+分裂(4) */
  debugEquipTurret(): void {
    this.player.equipment = [
      {
        id: 9004,
        level: 3,
        quality: "epic" as Quality,
        name: "移动炮台·毒云",
        triggers: [makeTrigger("move", { distance: 500 })],
        effect: makeEffect("cloud", { dps: 16, radius: 120, duration: 4 }, 3),
        modifiers: [makeModifier("explode", { radius: 120, damageMult: 1.2 })],
      },
      {
        id: 9005,
        level: 3,
        quality: "rare" as Quality,
        name: "移动炮台·飞刀",
        triggers: [makeTrigger("pulse", { interval: 1 })],
        effect: makeEffect("knife", { damage: 20, speed: 560, radius: 640 }, 3),
        modifiers: [makeModifier("split", { extra: 4 })],
      },
    ];
  }

  /** 融合演示:F4 装备"新星脉冲(史诗)"与"飞刀脉冲(稀有)",并把保底推到临门一次(下次融合触发隐藏词缀三选一) */
  debugEquipFusionDemo(): void {
    this.player.equipment = [
      {
        id: 9006,
        level: 3,
        quality: "epic" as Quality,
        name: "新星脉冲",
        triggers: [makeTrigger("pulse", { interval: 2 })],
        effect: makeEffect("nova", { damage: 40, radius: 130 }, 3),
        modifiers: [makeModifier("explode", { radius: 120, damageMult: 1.0 })],
      },
      {
        id: 9007,
        level: 3,
        quality: "rare" as Quality,
        name: "飞刀脉冲",
        triggers: [makeTrigger("pulse", { interval: 1.5 })],
        effect: makeEffect("knife", { damage: 20, speed: 560, radius: 640 }, 3),
        modifiers: [],
      },
    ];
    this.save.fusionPity = HIDDEN_PITY_N - 1; // 下次融合触发保底三选一
  }
}
