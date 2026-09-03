/**
 * 战斗模拟层 —— Web 版 src/game.ts 战斗路径(update 及其全部私有推进方法)的纯逻辑移植。
 * 本文件不 import cc:宿主能力(存档持久化、移动输入、世界高度、一次性视觉事件)全部构造注入。
 * 实体数组由本类持有并原地 mutate(词缀引擎 BattleContext 引用同一批数组,不得重新赋值);
 * 视图(BattleWorldView/HudView/FxView)每帧只读这些数组绑定节点。
 * 推进顺序与 Web update() 逐项对齐:player → 连杀/反伤预算 → 引擎 → 敌人 → 预警 →
 * 弹道 → 领域云 → 召唤物 → 金币 → 波次 → 章节计时 → Boss/通关 → FX/横幅 → 上限裁剪。
 */

import { type Vec2, vec2, clamp, rand } from "../game/core/math";
import { Player, PLAYER_BASE, xpToNext } from "../game/entities/player";
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
    type EnemyKind,
    type SkillTelegraph,
} from "../game/entities/enemy";
import { type Projectile, updateProjectile, projectileHits, steerHoming } from "../game/entities/projectile";
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
    spawnBurnPool,
    tickObstacleTtl,
    OBSTACLE,
} from "../game/entities/objects";
import { EquipmentEngine, type BattleContext, type Fx } from "../game/systems/equipmentEngine";
import { WaveManager, seasonMonsterDefFor, type ArenaRect } from "../game/systems/waves";
import { Onboarding, type GuideCtx } from "../game/systems/onboarding";
import { BOSS_WEAK_HP_MULT } from "../game/data/enemies";
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
} from "../game/data/combat";
import {
    ENERGY_MAX,
    stageEnergyCost,
    ENDLESS_ENERGY_COST,
    regenEnergy,
    todayKey,
    needsDailyReset,
    rollDailyTalents,
    dailyTalentOf,
    collectionBonus,
    stageDropCount,
    stageDropLevel,
} from "../game/data/daily";
import {
    STAGES,
    stageOf,
    CHAPTER_SECONDS,
    CHAPTERS_PER_STAGE,
    splitEcho,
    stageEchoReward,
    STAGE_UNLOCK_PROGRESS,
    CLEAR_REWARD_GROWTH,
    stageClearedAtFinalChapter,
    type StageDef,
    type StageRewards,
} from "../game/data/stages";
import { chapterTypeInfo } from "../game/data/chapters";
import { chapterIntel } from "../game/data/intel";
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
} from "../game/data/envAffixes";
import { setBonusState, setDef, type SetId } from "../game/data/sets";
import { comboStates } from "../game/data/combos";
import { seasonTheme, setMutation } from "../game/data/seasonSets";
import {
    generateEquipment,
    makeStarterEquipment,
    makeSetStarterEquipment,
    buildHasThorn,
    buildHasHeal,
    equipmentHasThornTrigger,
    type Equipment,
} from "../game/data/equipmentGen";
import { type Quality } from "../game/data/quality";
import { DUPLICATE_STARDUST } from "../game/data/gacha";
import {
    cdrScaleFor,
    critFor,
    globalDamageMultFor,
    desperateMultFor,
    elementalMultFor,
    maxHpMultFor,
    startShieldFor,
    slotBonusFor,
    firstXpScaleFor,
    autoPickupFor,
    rareBonusFor,
    TALENT_VALUES,
    type TalentId,
} from "../game/data/talents";
import {
    SEASON_DAYS,
    DAY_MS,
    seasonEnded,
    stageUnlocked,
    calcStars,
    THREE_STAR_TICKETS,
    FIRST_CLEAR_TICKET_MULT,
    FIRST_CLEAR_ECHO_MULT,
    seasonScore,
    seasonStardust,
} from "../game/data/season";
import { phantomBoard, rankAmong } from "../game/data/leaderboard";
import { calcPrestigePoints } from "../game/data/prestige";
import { COMMISSION_READY_HOURS, type CommissionState } from "../game/data/commissions";
import { applyHeroSelection, heroOfSetOrNull, normalizeHeroId, type HeroId } from "../game/data/heroes";
import { hexA } from "../game/ui/theme";
import { battleBandY } from "../game/ui/hud";
import { FxLayerData } from "./FxCore";

/** 实体上限(与 Web 版 src/game.ts LIMITS 同源;弹幕 420 为组合技分裂子弹标定值) */
export const LIMITS = { enemies: 340, projectiles: 420, clouds: 44, minions: 24, gems: 300 };

/**
 * 原地移除满足条件的元素。
 * 注意:不能用 arr = arr.filter(...) 重新赋值 —— 词缀引擎的 BattleContext 持有数组的
 * 原始引用,重新赋值会让引擎看到陈旧数组(与 Web 版同一约束)。
 */
function removeIf<T>(arr: T[], pred: (x: T) => boolean): void {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (pred(arr[i])) arr.splice(i, 1);
    }
}

/* ================= 存档模型(与 Web 版 src/systems/save.ts 的 SaveData 同构) ================= */

export interface Collection {
    triggers: string[];
    effects: string[];
    modifiers: string[];
    enemies: string[];
}

export interface SaveModel {
    points: number;
    ownedTalents: TalentId[];
    collection: Collection;
    bestRun: { kills: number; seconds: number } | null;
    bestWave: number;
    stardust: number;
    gearLevels: Record<string, number>;
    gachaTicket: number;
    highestStage: number;
    stageFurthest: Record<number, number>;
    ownedGear: Equipment[];
    gachaPityEpic: number;
    gachaPityLegendary: number;
    fusionPity: number;
    selectedGearId: number | null;
    dayEcho: number;
    premiumPass: boolean;
    premiumPassSeason: number;
    passTier: number;
    prestiges: number;
    fragments: number;
    commission: CommissionState | null;
    commission2: CommissionState | null;
    selectedHero: HeroId | null;
    selectedSet: SetId | null;
    tutorialDone: boolean;
    energy: number;
    lastEnergyAt: number;
    diamond: number;
    adWatchCount: number;
    energyAdCount: number;
    dailyDate: string;
    dailyBoxClaimed: string[];
    dailyGachaAdUsed: boolean;
    dailyTalentClaimed: string[];
    dailyTalents: string[];
    shopRefreshCount: number;
    seasonId: number;
    seasonStartAt: number;
    stageStars: number[];
    seasonBest: number;
    dailyClearedDate: string;
    dailyClearedStage: number;
    frames: number[];
    makeUpDate: string;
}

/** 归一化存档(与 Web loadSave 同口径;宿主负责读原始 JSON 并注入) */
export function normalizeSave(parsed: any): SaveModel {
    const s: SaveModel = {
        points: Number(parsed?.points) || 0,
        ownedTalents: Array.isArray(parsed?.ownedTalents) ? parsed.ownedTalents : [],
        collection: {
            triggers: parsed?.collection?.triggers ?? [],
            effects: parsed?.collection?.effects ?? [],
            modifiers: parsed?.collection?.modifiers ?? [],
            enemies: parsed?.collection?.enemies ?? [],
        },
        bestRun: parsed?.bestRun ?? null,
        bestWave: Number(parsed?.bestWave) || 0,
        stardust: Number(parsed?.stardust) || 0,
        gearLevels: parsed?.gearLevels && typeof parsed.gearLevels === "object" ? parsed.gearLevels : {},
        gachaTicket: Number(parsed?.gachaTicket) || 0,
        highestStage: Math.max(1, Number(parsed?.highestStage) || 1),
        stageFurthest:
            parsed?.stageFurthest && typeof parsed.stageFurthest === "object" && !Array.isArray(parsed.stageFurthest)
                ? Object.fromEntries(Object.entries(parsed.stageFurthest).map(([k, v]) => [Number(k), Math.max(0, Number(v) || 0)]))
                : {},
        ownedGear: Array.isArray(parsed?.ownedGear) ? parsed.ownedGear : [],
        gachaPityEpic: Number(parsed?.gachaPityEpic) || 0,
        gachaPityLegendary: Number(parsed?.gachaPityLegendary) || 0,
        fusionPity: Number(parsed?.fusionPity) || 0,
        selectedGearId: parsed?.selectedGearId ?? null,
        dayEcho: Number(parsed?.dayEcho) || 0,
        premiumPass: !!parsed?.premiumPass,
        premiumPassSeason: Number(parsed?.premiumPassSeason) || 0,
        passTier: Number(parsed?.passTier) || 0,
        prestiges: Number(parsed?.prestiges) || 0,
        fragments: Number(parsed?.fragments) || 0,
        commission: parsed?.commission ?? null,
        commission2: parsed?.commission2 ?? null,
        selectedHero: normalizeHeroId(parsed?.selectedHero),
        selectedSet: parsed?.selectedSet ?? null,
        tutorialDone: !!parsed?.tutorialDone,
        energy: Number(parsed?.energy) || ENERGY_MAX,
        lastEnergyAt: Number(parsed?.lastEnergyAt) || Date.now(),
        diamond: Number(parsed?.diamond) || 0,
        adWatchCount: Number(parsed?.adWatchCount) || 0,
        energyAdCount: Number(parsed?.energyAdCount) || 0,
        dailyDate: String(parsed?.dailyDate ?? ""),
        dailyBoxClaimed: Array.isArray(parsed?.dailyBoxClaimed) ? parsed.dailyBoxClaimed : [],
        dailyGachaAdUsed: !!parsed?.dailyGachaAdUsed,
        dailyTalentClaimed: Array.isArray(parsed?.dailyTalentClaimed) ? parsed.dailyTalentClaimed : [],
        dailyTalents: Array.isArray(parsed?.dailyTalents) ? parsed.dailyTalents : [],
        shopRefreshCount: Number(parsed?.shopRefreshCount) || 0,
        seasonId: Math.max(1, Number(parsed?.seasonId) || 1),
        seasonStartAt: Number(parsed?.seasonStartAt) || Date.now(),
        stageStars: normalizeStars(parsed?.stageStars),
        seasonBest: Number(parsed?.seasonBest) || 0,
        dailyClearedDate: String(parsed?.dailyClearedDate ?? ""),
        dailyClearedStage: Number(parsed?.dailyClearedStage) || 0,
        frames: Array.isArray(parsed?.frames) ? parsed.frames.filter((n: unknown) => Number(n) >= 1 && Number(n) <= 7).map(Number) : [],
        makeUpDate: String(parsed?.makeUpDate ?? ""),
    };
    // 老档只写 selectedSet → 反查其英雄补齐;镜像恒经唯一写入路径同步
    applyHeroSelection(s, s.selectedHero ?? heroOfSetOrNull(s.selectedSet)?.id ?? null);
    return s;
}

/** 空存档(与 Web EMPTY 同构;体力上限以运行时配置为准) */
export function emptySave(): SaveModel {
    return normalizeSave(null);
}

function normalizeStars(raw: unknown): number[] {
    const arr = Array.isArray(raw) ? raw : [];
    const out = [0];
    for (let i = 1; i <= 7; i++) {
        const n = Math.floor(Number(arr[i]) || 0);
        out.push(Math.min(3, Math.max(0, n)));
    }
    return out;
}

/* ================= 输入与事件(宿主注入) ================= */

/** 移动输入通道(宿主 JoystickView 实现;语义 = Web core/input.ts 的 isMoving/moveDir) */
export interface MoveInput {
    readonly isMoving: boolean;
    readonly moveDir: Vec2;
}

export interface DeathInfo {
    /** 预计算的本局回响(实际入账在放弃复活的结算屏,Phase 5) */
    points: number;
    kills: number;
    chapter: number;
    elapsed: number;
    rankImprovedTo: number | null;
}

export interface VictoryInfo {
    stage: StageDef;
    stars: number;
    reward: StageRewards;
    drops: number;
    firstClearBonus: boolean;
    frameUnlocked: number | null;
    rankImprovedTo: number | null;
}

export interface BattleCallbacks {
    /** 伤害/治疗/暴击飘字(一次性视觉事件;池与动画在 FxView) */
    onDamage(pos: Vec2, text: string, color: string): void;
    onDeath(info: DeathInfo): void;
    onVictory(info: VictoryInfo): void;
    /** 章节打满 → 章间商店(商店屏 Phase 3;宿主可暂时直接 nextChapter 跳过) */
    onChapterShop(): void;
}

export interface BattleSimOptions {
    save: SaveModel;
    input: MoveInput;
    /** 战场标定高(worldH,顶部原点;竞技场带 = battleBandY(wh),宿主从 DesignMetrics 注入) */
    worldH: number;
    persist: (save: SaveModel) => void;
    callbacks: BattleCallbacks;
    /** FX 数据层容量(viewTable.fx 注入;缺省 = Web 硬上限 520/40) */
    fxMaxParticles?: number;
    fxMaxRings?: number;
}

/** 广告复活的清场半径等常量从 data/combat 读取;本类只推进战斗,结算屏交互在 Phase 5 */
export class BattleSim {
    /* ---------- 世界状态(视图每帧只读绑定) ---------- */
    player = new Player();
    readonly enemies: Enemy[] = [];
    readonly skillTelegraphs: { t: SkillTelegraph; total: number; src: Enemy | null }[] = [];
    readonly projectiles: Projectile[] = [];
    readonly clouds: Cloud[] = [];
    readonly minions: Minion[] = [];
    readonly gems: Gem[] = [];
    /** 特效贴花时间轴(nova/explosion/... 由引擎与击杀事件入队,ttl 推进) */
    readonly fx: Fx[] = [];
    /** 粒子/冲击环/震屏纯数据层(tick 在本类,绘制在 FxView) */
    readonly fxLayer = new FxLayerData();
    obstacles: Obstacle[] = [];
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
    bossBanner: { text: string; ttl: number } | null = null;
    currentStage: StageDef | null = null;
    envAffixes: EnvAffixType[] = [];
    selectedSet: SetId | null = null;
    autoMove = true;
    /** 一局是否已开始(startStage/startEndless 之后为 true) */
    started = false;
    /** 本局是否已结束(死亡/通关;update 停止推进) */
    over = false;
    /** 死亡结算挂起(Phase 5 结算屏消费) */
    pendingSettle = false;
    pointsEarnedThisRun = 0;
    rankImprovedTo: number | null = null;
    reviveUsed = 0;
    readonly guide = new Onboarding();

    /* ---------- 连杀/反伤/毒池计时 ---------- */
    private comboCount = 0;
    private comboTimer = 0;
    private frenzyTimer = 0;
    private reflectBudget = 0;
    private reflectTimer = 0;
    private poolTickAcc = 0;

    /* ---------- FX 发射节流(全场共享,与 Web 同名同值) ---------- */
    private telegraphFxAcc = 0;
    private meteorEmberAcc = 0;
    private meteorFallAcc = 0;
    private cloudFxAcc = 0;
    private minionFxAcc = 0;
    private enemyFxAcc = 0;
    private chargeFxAcc = 0;

    readonly save: SaveModel;
    private input: MoveInput;
    private wh: number;
    private persistFn: (s: SaveModel) => void;
    private cb: BattleCallbacks;

    /** HUD 行情条读取(与 Web drawHudTicker 同口径) */
    comboShown = 0;

    private ctx: BattleContext;

    constructor(opts: BattleSimOptions) {
        this.save = opts.save;
        this.input = opts.input;
        this.wh = opts.worldH;
        this.persistFn = opts.persist;
        this.cb = opts.callbacks;
        this.fxLayer.setCaps(opts.fxMaxParticles ?? 520, opts.fxMaxRings ?? 40);
        this.arena = this.chapterArena();
        const sim = this;
        this.ctx = {
            player: sim.player,
            enemies: sim.enemies,
            projectiles: sim.projectiles,
            clouds: sim.clouds,
            minions: sim.minions,
            globalPulseMult: 1,
            get setBonus() {
                return setBonusState(sim.player.equipment, sim.selectedSet);
            },
            get seasonMutation() {
                return setMutation(sim.save.seasonId, sim.selectedSet);
            },
            get comboActive() {
                return comboStates(sim.player.equipment);
            },
            addFx: (f) => sim.emitFx(f),
            damageEnemy: (e, dmg, o) => sim.damageEnemy(e, dmg, o.source, o.lifesteal ?? 0, o.knockbackPower ?? 0, o.from),
            healPlayer: (v) => sim.player.heal(v),
            addPlayerShield: (a, d) => sim.player.addShield(a, d),
            onBossPhase: (ph) => sim.showBossPhase(ph),
        };
    }

    persist(): void {
        this.persistFn(this.save);
    }

    setWorldHeight(wh: number): void {
        this.wh = wh;
    }

    toggleAuto(): void {
        this.autoMove = !this.autoMove;
    }

    skipGuide(): void {
        this.guide.skipAll();
        if (!this.save.tutorialDone) {
            this.save.tutorialDone = true;
            this.persist();
        }
    }

    /** 体力自然恢复结算(时间戳口径,与 Web syncEnergy 同源;HUD ⚡ 显示前调用) */
    syncEnergy(): void {
        const r = regenEnergy(this.save.energy, this.save.lastEnergyAt, Date.now());
        this.save.energy = r.energy;
        this.save.lastEnergyAt = r.lastEnergyAt;
    }

    /** 委托是否已完成待领取(顶坞行情条用) */
    commissionReady(): boolean {
        const now = Date.now();
        return [this.save.commission, this.save.commission2].some((c) => !!c && (now - c.startedAt) / 3600000 >= COMMISSION_READY_HOURS);
    }

    get combo(): number {
        return this.comboCount;
    }

    get frenzy(): boolean {
        return this.frenzyTimer > 0;
    }

    isThornBuild(): boolean {
        return buildHasThorn(this.player.equipment) && buildHasHeal(this.player.equipment);
    }

    hasEnv(t: EnvAffixType): boolean {
        return this.envAffixes.includes(t);
    }

    owns(id: TalentId): boolean {
        return this.save.ownedTalents.includes(id);
    }

    /* ================= 开局 ================= */

    /** 本章竞技场:宽 560 标定;纵向收窄到上下坞之间(与 Web chapterArena 同源,坞高读共享 hud 常量) */
    private chapterArena(): ArenaRect {
        const band = battleBandY(this.wh);
        return { x0: 0, y0: band.y0, x1: 560, y1: band.y1 };
    }

    private stageOpen(id: number): boolean {
        if (id <= 1) return true;
        const furthestPrev = this.save.stageFurthest[id - 1] ?? 0;
        return stageUnlocked(id, this.save.highestStage, furthestPrev, CHAPTERS_PER_STAGE, STAGE_UNLOCK_PROGRESS);
    }

    /** 开始主线关卡;体力不足返回 false(体力面板 Phase 4,宿主可提示后重试) */
    startStage(id: number, bypassGate = false): boolean {
        if (!bypassGate && !this.stageOpen(id)) return false;
        this.syncEnergy();
        const cost = stageEnergyCost(id);
        if (this.save.energy < cost) return false;
        this.save.energy -= cost;
        this.persist();
        this.currentStage = stageOf(id);
        this.envAffixes = [...this.currentStage.envAffixes];
        this.startRun();
        return true;
    }

    /** 开始无限关(随机环境词缀;体力口径同 Web) */
    startEndless(): boolean {
        this.syncEnergy();
        if (this.save.energy < ENDLESS_ENERGY_COST) return false;
        this.save.energy -= ENDLESS_ENERGY_COST;
        this.persist();
        this.currentStage = null;
        this.envAffixes = rollEnvAffixes(seasonTheme(this.save.seasonId).envBias);
        this.startRun();
        return true;
    }

    private startRun(): void {
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
        this.fxLayer.reset();
        this.ctx.player = this.player;
        this.engine.reset();
        this.waves = new WaveManager();
        this.kills = 0;
        this.elapsed = 0;
        this.pointsEarnedThisRun = 0;
        this.rankImprovedTo = null;
        this.reviveUsed = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.frenzyTimer = 0;
        this.bossSpawned = false;
        this.bossDead = false;
        this.bossBanner = null;
        this.over = false;
        this.pendingSettle = false;
        this.chapter = 1;
        this.chapterTimer = 0;
        this.gold = 0;
        this.totalBought = 0;
        this.arena = this.chapterArena();
        this.obstacles = rollChapterObstacles(1, this.arena, Math.random, this.currentStage?.bossChapter);
        this.poolTickAcc = 0;
        this.selectedSet = this.save.selectedSet ?? null;
        // 首局引导:仅主线第 1 关且未完成时启用
        this.guide.enabled = !this.save.tutorialDone && this.currentStage?.id === 1;
        this.guide.reset();
        // 开局装备:收藏选中件 > 套组初始武器 > 默认初始武器
        const sel = this.save.ownedGear.find((g) => g.id === this.save.selectedGearId);
        if (sel) {
            const gear = JSON.parse(JSON.stringify(sel)) as Equipment;
            this.player.equipment.push(gear);
            this.recordEquipment(gear);
        } else {
            const starter = this.selectedSet ? makeSetStarterEquipment(this.selectedSet) : makeStarterEquipment("knife");
            this.player.equipment.push(starter);
            this.recordEquipment(starter);
        }
        this.started = true;
    }

    /** 天赋/图鉴/每日天赋的开局加成(与 Web applyTalentBonuses 同源) */
    private applyTalentBonuses(): void {
        this.player.slotBonus = slotBonusFor(this.save.ownedTalents);
        this.player.firstXpScale = firstXpScaleFor(this.save.ownedTalents);
        const cb = collectionBonus(this.save.ownedGear);
        let hpMult = maxHpMultFor(this.save.ownedTalents) * (1 + cb.hpPct / 100);
        if (this.hasDailyTalent("hp30")) hpMult *= 1 + dailyTalentOf("hp30").value;
        this.player.maxHp = Math.round(PLAYER_BASE.maxHp * hpMult);
        this.player.hp = this.player.maxHp;
        const shield = startShieldFor(this.save.ownedTalents);
        if (shield > 0) this.player.addShield(shield, 9999);
    }

    /** 开始下一章(清场、换竞技场、回中心、开局 burst;与 Web nextChapter 同源) */
    nextChapter(): void {
        this.chapter += 1;
        this.chapterTimer = 0;
        this.arena = this.chapterArena();
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
        this.obstacles = rollChapterObstacles(this.chapter, this.arena, Math.random, this.currentStage?.bossChapter);
        this.poolTickAcc = 0;
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
    }

    private chapterEdgePos(): Vec2 {
        const a = this.arena;
        const side = Math.floor(Math.random() * 4);
        if (side === 0) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y0 + 40);
        if (side === 1) return vec2(rand(a.x0 + 40, a.x1 - 40), a.y1 - 40);
        if (side === 2) return vec2(a.x0 + 40, rand(a.y0 + 40, a.y1 - 40));
        return vec2(a.x1 - 40, rand(a.y0 + 40, a.y1 - 40));
    }

    private spawnIntel() {
        const i = chapterIntel(this.chapter, this.save.seasonId);
        const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
        const forced = ct?.intelPrefer ?? null;
        return { prefer: forced ?? i.prefer, hpBuff: 0.4, bias: forced ? ct!.intelBias : 0.45 };
    }

    /* ================= 主循环推进(与 Web update 的战斗路径逐项对齐) ================= */

    update(dt: number): void {
        if (!this.started || this.over) return;
        // 每日重置与赛季翻页(任何推进帧都执行,与 Web 同口径)
        this.checkDailyReset();
        this.syncSeason();
        // 首局引导
        if (this.guide.enabled) {
            this.guide.update(this.guideCtx(), dt);
            if (this.guide.finished && !this.save.tutorialDone) {
                this.save.tutorialDone = true;
                this.persist();
            }
        }

        this.elapsed += dt;
        this.updatePlayer(dt);
        // 连杀狂潮:3 秒无新击杀断连;每 10 连杀触发 2 秒狂潮
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 0;
        if (this.frenzyTimer > 0) this.frenzyTimer -= dt;
        // 反射伤害预算每秒重置(上限 = 最大生命 15%)
        this.reflectTimer -= dt;
        if (this.reflectTimer <= 0) {
            this.reflectTimer = 1;
            this.reflectBudget = Math.round(this.player.maxHp * REFLECT_BUDGET_HP_PCT);
        }
        // 时间膨胀 ×2 × 冷却缩减 × 狂潮 ×0.6 × 每日疾咒 合成全局脉冲间隔倍率
        this.ctx.globalPulseMult =
            (this.hasEnv("time_dilation") ? TIME_DILATION_MULT : 1) *
            cdrScaleFor(this.save.ownedTalents) *
            (this.frenzyTimer > 0 ? FRENZY_PULSE_MULT : 1) *
            this.dailyCdrMult();
        this.engine.update(this.ctx, dt);
        this.updateEnemies(dt);
        this.tickTelegraphs(dt);
        this.emitTelegraphFx(dt);
        this.updateProjectiles(dt);
        this.updateClouds(dt);
        this.updateMinions(dt);
        this.updateGems(dt);

        // Boss 战期间停止生成新怪
        const bossActive = this.bossSpawned && !this.bossDead;
        const ct = this.currentStage ? chapterTypeInfo(this.chapter, this.currentStage.bossChapter) : null;
        const baseScale = bossActive ? 0 : this.currentStage?.spawnScale ?? 1;
        const spawnScale = baseScale * (ct?.spawnScaleMult ?? 1);
        this.waves.update(dt, this.enemies, this.player.pos, spawnScale, this.arena, this.spawnIntel(), this.owns("god_challenge"), ct?.goldMix ?? 0, this.save.seasonId);

        // 章节计时:每章 60 秒 → 章间商店/关底结算
        this.chapterTimer += dt;
        if (this.chapterTimer >= CHAPTER_SECONDS) {
            this.chapterEnd();
            return;
        }

        // Boss 生成与通关判定
        if (this.currentStage) {
            if (!this.bossSpawned && this.waves.wave >= (this.currentStage.bossChapter ?? 9999)) {
                this.bossSpawned = true;
                const p = this.player.pos;
                const bossPos = vec2(
                    clamp(p.x + BOSS_SPAWN_OFFSET_X, this.arena.x0 + BOSS_SPAWN_INSET, this.arena.x1 - BOSS_SPAWN_INSET),
                    clamp(p.y + BOSS_SPAWN_OFFSET_Y, this.arena.y0 + BOSS_SPAWN_INSET, this.arena.y1 - BOSS_SPAWN_INSET)
                );
                const boss = spawnEnemy("boss", bossPos, this.waves.wave, seasonMonsterDefFor("boss", this.save.seasonId, this.waves.wave));
                boss.maxHp = boss.hp = Math.round(boss.maxHp * bossHpMult(this.currentStage.id));
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
        if (this.bossBanner) {
            this.bossBanner.ttl -= dt;
            if (this.bossBanner.ttl <= 0) this.bossBanner = null;
        }
        if (this.enemies.length > LIMITS.enemies) {
            this.enemies.splice(0, this.enemies.length - LIMITS.enemies);
        }
        this.comboShown = this.comboCount;
    }

    /** 章节结束:末章按关底规则判定通关/判负;其余进章间商店(宿主决定跳过或停等) */
    private chapterEnd(): void {
        this.chapterTimer = 0;
        const st = this.currentStage;
        if (st && this.chapter >= CHAPTERS_PER_STAGE) {
            if (!stageClearedAtFinalChapter(st, this.bossDead)) {
                this.player.hp = 0;
                this.player.alive = false;
                this.onDeath();
                return;
            }
            this.victory();
            return;
        }
        this.recordStageProgress();
        this.cb.onChapterShop();
    }

    private recordStageProgress(): void {
        const st = this.currentStage;
        if (!st) return;
        const furthest = this.save.stageFurthest[st.id] ?? 0;
        if (this.chapter > furthest) {
            this.save.stageFurthest[st.id] = this.chapter;
            this.persist();
        }
    }

    private updatePlayer(dt: number): void {
        const p = this.player;
        if (!p.alive) {
            this.onDeath();
            return;
        }
        p.movedThisFrame = 0;
        const before = vec2(p.pos.x, p.pos.y);
        const a = this.arena;
        // 纵向空气墙顶到上下坞边(按半径钳制);坞高变化时 arena 随之变化
        const yMin = a.y0 + PLAYER_BASE.radius;
        const yMax = a.y1 - PLAYER_BASE.radius;
        if (this.input.isMoving) {
            const mv = this.input.moveDir;
            p.pos.x = clamp(p.pos.x + mv.x * PLAYER_BASE.speed * p.speedMult * dt, a.x0 + 30, a.x1 - 30);
            p.pos.y = clamp(p.pos.y + mv.y * PLAYER_BASE.speed * p.speedMult * dt, yMin, yMax);
        } else if (this.autoMove) {
            // 自主控制(挂机):贴身才躲,平时顺时针巡场
            const nearest = this.nearestEnemy(p.pos, 110);
            let mvx = 0;
            let mvy = 0;
            if (nearest) {
                const dx = p.pos.x - nearest.pos.x;
                const dy = p.pos.y - nearest.pos.y;
                const d = Math.hypot(dx, dy) || 1;
                mvx = dx / d;
                mvy = dy / d;
                const side = Math.sin(this.elapsed * 2.3) > 0 ? 1 : -1;
                mvx += (-dy / d) * side * 0.6;
                mvy += (dx / d) * side * 0.6;
                const l = Math.hypot(mvx, mvy) || 1;
                mvx /= l;
                mvy /= l;
            } else {
                const ang = this.elapsed * 0.4;
                mvx = Math.cos(ang);
                mvy = Math.sin(ang);
            }
            p.pos.x = clamp(p.pos.x + mvx * PLAYER_BASE.speed * p.speedMult * dt, a.x0 + 30, a.x1 - 30);
            p.pos.y = clamp(p.pos.y + mvy * PLAYER_BASE.speed * p.speedMult * dt, yMin, yMax);
        }
        p.pos.x = clamp(p.pos.x, a.x0 + 30, a.x1 - 30);
        p.pos.y = clamp(p.pos.y, yMin, yMax);
        // 临时障碍(灼烧池)倒计时;石柱推挤;毒池 DoT
        tickObstacleTtl(this.obstacles, dt);
        for (const ob of this.obstacles) pushOutOfPillar(p.pos, PLAYER_BASE.radius, ob);
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
        const auraCarriers = this.enemies.filter((a) => a.hp > 0 && a.def.skill?.aura !== undefined);
        for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            if (this.hasEnv("heal_aura")) {
                e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_AURA_RATE * dt);
            }
            if (this.hasEnv("mist")) {
                e.hiddenTimer += dt;
                const t = e.hiddenTimer % MIST_CYCLE;
                e.hidden = t >= MIST_VISIBLE;
            }
            const aura = auraCarriers.length > 0 ? auraMultAt(e, auraCarriers) : undefined;
            updateSkill(e, dt, p.pos, PLAYER_BASE.radius, this.arena, {
                spawnChild: (kind, pos, def) => {
                    if (this.enemies.length < LIMITS.enemies) {
                        this.enemies.push(spawnEnemy(kind, pos, this.waves.wave, def));
                        this.emitSummonFx(pos, def?.color ?? "#ff8a65");
                    }
                },
                onTelegraph: (t) => this.skillTelegraphs.push({ t, total: t.charge, src: e }),
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
            updateSpecial(e, dt, (kind, pos) => {
                if (this.enemies.length < LIMITS.enemies) {
                    this.enemies.push(spawnEnemy(kind, pos, this.waves.wave));
                    this.emitSummonFx(pos, "#ff8a65");
                }
            });
            updateBoss(e, dt, p.pos, {
                spawnChild: (kind, cpos) => {
                    if (this.enemies.length < LIMITS.enemies) {
                        this.enemies.push(spawnEnemy(kind, cpos, this.waves.wave));
                        this.emitSummonFx(cpos, "#ff5050");
                    }
                },
                onPhaseChange: (phase) => this.ctx.onBossPhase?.(phase),
                onSlam: (pos, radius, damage) => this.bossSlam(pos, radius, damage),
            });
            this.emitEnemyFx(e, dt);
            const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
            const rr = e.def.radius + PLAYER_BASE.radius;
            if (d <= rr && e.hitCooldown <= 0) {
                e.hitCooldown = CONTACT_HIT_CD;
                const cdmg = Math.max(1, Math.round(e.def.contactDmg * (aura?.dmg ?? 1)));
                this.player.takeDamage(cdmg);
                this.engine.onHurt(this.ctx, cdmg, e);
                this.spawnDmg(p.pos, cdmg, "#ff6b6b");
                // 撕咬反馈:红色血屑 + 轻震屏
                this.fxLayer.burst({
                    x: p.pos.x, y: p.pos.y, count: 5, color: "#ff6b6b",
                    speed: [60, 190], size: [1.2, 2.6], life: [0.15, 0.35], halo: 2.6, drag: 4,
                });
                this.fxLayer.addShake(1.4);
                if (e.def.mech?.type === "slowOnHit") {
                    this.player.applySlow(e.def.mech.factor, e.def.mech.duration);
                    this.fxLayer.burst({
                        x: p.pos.x, y: p.pos.y, count: 6, color: "#9be8ff",
                        speed: [40, 130], size: [1.4, 2.8], life: [0.25, 0.5], halo: 2.4, drag: 3,
                    });
                }
                if (this.isThornBuild()) {
                    this.player.heal(Math.max(1, Math.round(this.player.maxHp * THORN_HEAL_PCT)));
                }
            }
        }
        // 石柱统一推挤 pass:敌人不寻路,最小位移推出
        for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            for (const ob of this.obstacles) pushOutOfPillar(e.pos, e.def.radius, ob);
        }
        removeIf(this.enemies, (e) => e.hp <= 0);
    }

    private showBossPhase(phase: 2 | 3): void {
        this.bossBanner = { text: phase === 2 ? "阶段二 · 地面震击" : "阶段三 · 狂暴", ttl: 2 };
        const boss = this.enemies.find((e) => e.kind === "boss" && e.hp > 0);
        if (boss) this.emitFx({ type: "nova", pos: vec2(boss.pos.x, boss.pos.y), radius: 120, ttl: 0.5, maxTtl: 0.5 });
    }

    private detonateSlam(pos: Vec2, radius: number, dmg: number, src: Enemy | null, burstColor: string): void {
        this.emitFx({ type: "nova", pos: vec2(pos.x, pos.y), radius, ttl: 0.4, maxTtl: 0.4 });
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

    private bossSlam(pos: Vec2, radius: number, dmg: number): void {
        this.detonateSlam(pos, radius, dmg, this.enemies.find((e) => e.kind === "boss" && e.hp > 0) ?? null, "#ff5050");
    }

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

    private tickTelegraphs(dt: number): void {
        for (const st of this.skillTelegraphs) {
            st.t.charge -= dt;
            if (st.t.charge > 0) continue;
            const t = st.t;
            const src = st.src && st.src.hp > 0 ? st.src : null;
            if (t.global) {
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
            if (proj.homing) steerHoming(proj, this.enemies, dt);
            if (proj.ttl <= 0) continue;
            // 空间扭曲:投射物轨迹正弦弯曲
            if (this.hasEnv("space_warp")) {
                const sp = Math.hypot(proj.vel.x, proj.vel.y) || 1;
                const wobble = Math.sin((this.elapsed + proj.id * 1.7) * 4) * 110 * dt;
                proj.pos.x += (-proj.vel.y / sp) * wobble;
                proj.pos.y += (proj.vel.x / sp) * wobble;
            }
            this.emitProjTrail(proj);
            // 石柱阻挡:命中即消亡
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
                    // 吞噬投射:基线吞噬者 + 批 4 技能载体
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
                this.emitMeteorTelegraph(c, dt);
                continue;
            }
            if (c.ring) {
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
                    const dx = target.pos.x - m.pos.x;
                    const dy = target.pos.y - m.pos.y;
                    const l = Math.hypot(dx, dy) || 1;
                    m.pos.x += (dx / l) * m.speed * dt;
                    m.pos.y += (dy / l) * m.speed * dt;
                }
            } else if (!target) {
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

    private updateGems(dt: number): void {
        const p = this.player;
        const autoPick = autoPickupFor(this.save.ownedTalents);
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
                this.gold += gem.value;
            }
        }
        removeIf(this.gems, (g) => g.picked);
    }

    nearestEnemy(from: Vec2, range: number, exclude?: Set<number>): Enemy | null {
        let best: Enemy | null = null;
        let bestD = range * range;
        for (const e of this.enemies) {
            if (e.hp <= 0 || e.hidden) continue;
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

    private applyReflect(dmg: number): void {
        const taken = Math.max(0, Math.min(dmg, this.reflectBudget));
        this.reflectBudget -= taken;
        if (taken > 0) {
            this.player.takeDamage(taken);
            this.spawnDmg(this.player.pos, taken, "#4fc3f7");
        }
    }

    damageEnemy(e: Enemy, dmg: number, source: Equipment, lifesteal: number, knockbackPower: number, from?: Vec2, fromSplit = false): void {
        if (e.hidden) return;
        if (from) {
            const fm = shieldguardDamageMult(e, from);
            dmg = Math.round(dmg * fm);
            if (fm < 1) this.emitShieldBlock(e);
        }
        if (dmg <= 0) return;
        // 征服者天赋 / 收藏图鉴 / 每日战意 / 绝境 / 暴击 / 元素精通 / 荆棘
        let mult = globalDamageMultFor(this.save.ownedTalents);
        const cb = collectionBonus(this.save.ownedGear, this.save.gearLevels);
        mult *= (1 + cb.atkPct / 100) * this.dailyDmgMult();
        if (this.owns("desperate") && this.player.hp / this.player.maxHp < TALENT_VALUES.desperateHpThreshold) {
            mult *= desperateMultFor(this.save.ownedTalents);
        }
        const crit = critFor(this.save.ownedTalents);
        const critRate = crit.rate + (this.hasDailyTalent("crit10") ? dailyTalentOf("crit10").value : 0);
        if (critRate > 0 && Math.random() < critRate) {
            mult *= crit.mult;
            this.spawnDmg(e.pos, 0, "#ff2d8f"); // 暴击标记
        }
        if (this.owns("elemental") && this.isElementalEffect(source)) {
            mult *= elementalMultFor(this.save.ownedTalents);
        }
        if (this.isThornBuild() && equipmentHasThornTrigger(source)) {
            mult *= 1.5;
        }
        dmg = Math.round(dmg * mult);
        if (dmg <= 0) return;
        if (this.hasEnv("reflect_field") && e.kind !== "reflector") {
            const reflected = Math.max(1, Math.round(dmg * REFLECT_FIELD_RATE));
            this.applyReflect(reflected);
        }
        const reflected = reflectDamage(e, dmg);
        if (reflected > 0) {
            this.applyReflect(reflected);
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

    private isElementalEffect(eq: Equipment): boolean {
        const t = eq.effect.def.type;
        return t === "nova" || t === "ray" || t === "cloud" || t === "chain";
    }

    private killEnemy(e: Enemy, source: Equipment, fromSplit = false): void {
        this.kills += 1;
        const seen = this.save.collection.enemies;
        const enemyId = e.def.variantId ?? e.kind;
        if (!seen.includes(enemyId)) seen.push(enemyId);
        if (e.kind === "boss") this.bossDead = true;
        this.comboCount += 1;
        this.comboTimer = COMBO_WINDOW;
        if (this.comboCount % COMBO_FRENZY_EVERY === 0) this.frenzyTimer = FRENZY_DURATION;
        this.emitFx({ type: "explosion", pos: vec2(e.pos.x, e.pos.y), radius: e.isElite ? 40 : 22, ttl: 0.22, maxTtl: 0.22 });
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
        const babies = skillSplitBabies(e) ?? splitBabies(e);
        for (const baby of babies) {
            if (this.enemies.length < LIMITS.enemies) {
                this.enemies.push(spawnEnemy(baby.kind, baby.pos, this.waves.wave));
            }
        }
        if (babies.length > 0) {
            this.fxLayer.burst({
                x: e.pos.x, y: e.pos.y, count: 10, color: "#c0ca33",
                speed: [60, 200], size: [1.6, 3.4], life: [0.25, 0.5], halo: 2.6, drag: 2, gravity: 120,
            });
            this.fxLayer.ring({ x: e.pos.x, y: e.pos.y, r0: e.def.radius, r1: e.def.radius + 26, life: 0.3, color: "rgba(192,202,51,0.8)", width: 2 });
        }
        for (const spec of deathSummonSpecs(e)) {
            if (this.enemies.length >= LIMITS.enemies) break;
            this.enemies.push(spawnEnemy(spec.kind, spec.pos, this.waves.wave, spec.def));
            this.emitSummonFx(spec.pos, spec.def?.color ?? "#ff8a65");
        }
        const mech = e.def.mech;
        if (mech?.type === "deathPool") {
            this.dropBurnPool(e.pos, mech.radius, mech.duration, mech.cap, e.def.radius);
        }
        const gemCount = e.isElite ? ELITE_GEM_COUNT : 1;
        const goldValue = Math.round((e.kind === "boss" ? BOSS_GOLD : e.def.xp * GOLD_PER_XP) * this.dailyGoldMult());
        for (let i = 0; i < gemCount; i++) {
            this.gems.push(spawnGem(vec2(e.pos.x + rand(-DROP_SCATTER, DROP_SCATTER), e.pos.y + rand(-DROP_SCATTER, DROP_SCATTER)), goldValue));
        }
        if (this.gems.length > LIMITS.gems) this.gems.splice(0, this.gems.length - LIMITS.gems);
        this.engine.onKill(this.ctx, e, { fromSplit, source });
    }

    /* ================= 结算(死亡 / 通关) ================= */

    /** 死亡:预计算所得并挂起入账(结算屏与广告复活在 Phase 5;此处只停世界 + 抛事件) */
    private onDeath(): void {
        if (this.over) return;
        this.over = true;
        this.pendingSettle = true;
        const gained = calcPrestigePoints(this.elapsed, this.kills, 1);
        this.pointsEarnedThisRun = gained;
        const board = phantomBoard(this.save.seasonId);
        const before = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), board);
        const projectedBest = Math.max(this.save.seasonBest, this.chapter);
        const after = rankAmong(seasonScore(this.save.stageStars, projectedBest), board);
        this.rankImprovedTo = after < before ? after : null;
        this.cb.onDeath({
            points: gained,
            kills: this.kills,
            chapter: this.chapter,
            elapsed: this.elapsed,
            rankImprovedTo: this.rankImprovedTo,
        });
    }

    /** 广告复活(结算屏调用;与 Web revive 同源) */
    revive(): void {
        const p = this.player;
        p.alive = true;
        p.hp = p.maxHp;
        p.shield = 0;
        p.shieldTtl = 0;
        p.addShield(p.maxHp, REVIVE_SHIELD_SECONDS);
        removeIf(this.enemies, (e) => Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) < REVIVE_CLEAR_RADIUS);
        this.reviveUsed += 1;
        this.pendingSettle = false;
        this.rankImprovedTo = null;
        this.over = false;
    }

    /** 通关结算:星数/首通/成长奖励 + 装备掉落 + 解锁下一关(与 Web victory 同源) */
    private victory(): void {
        const st = this.currentStage;
        if (!st || this.over) return;
        this.over = true;
        const r = st.rewards;
        const lbBoard = phantomBoard(this.save.seasonId);
        const lbBefore = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), lbBoard);
        const stars = calcStars(this.player.hp / this.player.maxHp, this.reviveUsed);
        const prevStars = this.save.stageStars[st.id] ?? 0;
        this.save.stageStars[st.id] = Math.max(prevStars, stars);
        const rewardGrowth = 1 + CLEAR_REWARD_GROWTH * Math.max(0, this.save.highestStage - 1);
        let tickets = Math.round(r.tickets * rewardGrowth);
        let echo = Math.round((r.points > 0 ? r.points : stageEchoReward(st.id)) * rewardGrowth);
        const stardustGain = Math.round(r.stardust * rewardGrowth);
        const today = todayKey();
        const firstClearBonus = this.save.dailyClearedDate !== today;
        if (firstClearBonus) {
            this.save.dailyClearedDate = today;
            this.save.dailyClearedStage = st.id;
            tickets *= FIRST_CLEAR_TICKET_MULT;
            echo = Math.round(echo * FIRST_CLEAR_ECHO_MULT);
        }
        let frameUnlocked: number | null = null;
        if (stars === 3 && prevStars < 3 && !this.save.frames.includes(st.id)) {
            this.save.frames.push(st.id);
            tickets += THREE_STAR_TICKETS;
            frameUnlocked = st.id;
        }
        this.save.gachaTicket += tickets;
        this.save.stardust += stardustGain;
        // 回响 = 40% 跨天保留 + 60% 本日
        const split = splitEcho(echo);
        this.save.points += split.permanent;
        this.save.dayEcho += split.day;
        // 通关刷装备:新收藏入图鉴,重复转星尘
        let drops = 0;
        const dropCount = stageDropCount(st.id);
        for (let i = 0; i < dropCount; i++) {
            const eq = generateEquipment(stageDropLevel(st.id), undefined, true, rareBonusFor(this.save.ownedTalents));
            const dup = this.save.ownedGear.some((g) => g.name === eq.name && g.quality === eq.quality);
            if (dup) {
                this.save.stardust += DUPLICATE_STARDUST[eq.quality];
            } else {
                this.save.ownedGear.push(eq);
                this.recordEquipment(eq);
                drops += 1;
            }
        }
        if (st.id >= this.save.highestStage) {
            this.save.highestStage = Math.min(STAGES.length, st.id + 1);
        }
        this.pointsEarnedThisRun = echo;
        this.persist();
        const lbAfter = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), lbBoard);
        this.rankImprovedTo = lbAfter < lbBefore ? lbAfter : null;
        this.cb.onVictory({
            stage: st,
            stars,
            reward: { ...r, tickets, points: echo, stardust: stardustGain },
            drops,
            firstClearBonus,
            frameUnlocked,
            rankImprovedTo: this.rankImprovedTo,
        });
    }

    /* ================= 每日/赛季/图鉴 ================= */

    private checkDailyReset(): void {
        if (needsDailyReset(this.save.dailyDate)) {
            this.save.dailyDate = todayKey();
            this.save.adWatchCount = 0;
            this.save.energyAdCount = 0;
            this.save.dailyBoxClaimed = [];
            this.save.dailyGachaAdUsed = false;
            this.save.dailyTalentClaimed = [];
            this.save.dailyTalents = rollDailyTalents();
            this.persist();
        }
        if (this.save.dailyTalents.length === 0) {
            this.save.dailyTalents = rollDailyTalents();
            this.persist();
        }
    }

    private syncSeason(): void {
        const now = Date.now();
        if (!seasonEnded(this.save.seasonStartAt, now)) return;
        let rolled = false;
        while (seasonEnded(this.save.seasonStartAt, now)) {
            const score = seasonScore(this.save.stageStars, this.save.seasonBest);
            const dust = seasonStardust(score);
            this.save.stardust += dust;
            this.save.seasonId += 1;
            this.save.seasonStartAt += SEASON_DAYS * DAY_MS;
            this.save.stageStars = [0, 0, 0, 0, 0, 0, 0, 0];
            this.save.seasonBest = 0;
            rolled = true;
        }
        if (rolled) {
            this.rankImprovedTo = null;
            this.persist();
        }
    }

    private hasDailyTalent(id: string): boolean {
        return this.save.dailyTalentClaimed.includes(id);
    }

    private dailyDmgMult(): number {
        return this.hasDailyTalent("dmg20") ? 1 + dailyTalentOf("dmg20").value : 1;
    }

    private dailyCdrMult(): number {
        return this.hasDailyTalent("cd15") ? 1 - dailyTalentOf("cd15").value : 1;
    }

    private dailyGoldMult(): number {
        return this.hasDailyTalent("gold50") ? 1 + dailyTalentOf("gold50").value : 1;
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

    private guideCtx(): GuideCtx {
        return {
            playing: this.started && !this.over,
            shop: false,
            elapsed: this.elapsed,
            chapter: this.chapter,
            kills: this.kills,
            equipmentCount: this.player.equipment.length,
            hasSet: !!this.selectedSet,
            setInfo: this.selectedSet ? setDef(this.selectedSet).name : "",
            mergesAvailable: this.mergeGroups().length,
        };
    }

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

    /* ================= FX 时间轴(与 Web 同名方法逐项对齐) ================= */

    private tickFx(dt: number): void {
        for (const f of this.fx) f.ttl -= dt;
        removeIf(this.fx, (f) => f.ttl <= 0);
        this.fxLayer.tick(dt);
    }

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

    private spawnDmg(pos: Vec2, value: number, color: string): void {
        this.cb.onDamage(vec2(pos.x + rand(-6, 6), pos.y - 6), String(value), color);
    }

    private emitProjTrail(p: Projectile): void {
        const icelance = p.source?.effect.def.type === "icelance";
        const gap = p.kind === "ray" ? 8 : 6;
        const acc = (p.trailAcc ?? 0) + Math.hypot(p.pos.x - p.prevPos.x, p.pos.y - p.prevPos.y);
        if (acc < gap) {
            p.trailAcc = acc;
            return;
        }
        p.trailAcc = acc - gap;
        if (icelance) this.fxLayer.trail(p.pos.x, p.pos.y, "#a5e8ff", p.radius * 0.8, 0.32, 3.0, 2);
        else if (p.kind === "knife") this.fxLayer.trail(p.pos.x, p.pos.y, "#ffd76a", p.radius * 0.7, 0.3, 3.0, 2);
        else this.fxLayer.trail(p.pos.x, p.pos.y, "#7fd8ff", p.radius * 0.9, 0.26, 2.2);
    }

    private emitHitSpark(p: Projectile): void {
        const back = Math.atan2(-p.vel.y, -p.vel.x);
        this.fxLayer.burst({
            x: p.pos.x, y: p.pos.y, count: p.kind === "knife" ? 5 : 3,
            color: p.kind === "knife" ? "#fff2c0" : "#cdf2ff",
            speed: [110, 300], size: [1, 2.4], life: [0.1, 0.24], halo: 2.6,
            angle: [back - 1.1, back + 1.1], spread: 0.5, drag: 5, gravity: 220,
        });
    }

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
        if (progress >= 0.4) {
            const t = (progress - 0.4) / 0.6;
            const e = t * t;
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

    private emitSummonFx(pos: Vec2, color: string): void {
        this.fxLayer.ring({ x: pos.x, y: pos.y, r0: 4, r1: 22, life: 0.35, color, width: 2 });
        this.fxLayer.burst({
            x: pos.x, y: pos.y, count: 6, color, speed: [20, 90],
            size: [1.4, 2.8], life: [0.3, 0.6], halo: 2.8, gravity: -50, drag: 1,
        });
    }

    private emitShieldBlock(e: Enemy): void {
        const sx = e.pos.x + e.facing.x * (e.def.radius + 3);
        const sy = e.pos.y + e.facing.y * (e.def.radius + 3);
        const back = Math.atan2(e.facing.y, e.facing.x);
        this.fxLayer.burst({
            x: sx, y: sy, count: 4, color: "#cfd8dc", speed: [90, 260],
            size: [1, 2.2], life: [0.1, 0.26], halo: 2.4, angle: [back - 0.9, back + 0.9], drag: 5, gravity: 240,
        });
    }

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
