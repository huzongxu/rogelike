/**
 * 战斗模拟层(Cocos 宿主适配)—— 战场推进与战斗结算全部走两端共用的共享层
 * game/systems/battleWorld.ts,本文件只做宿主接线:
 *  - 从 core/SaveModel 派生"局外配置"(BattleRunInputs)并负责持久化;
 *  - 把世界层回报的战场事件(章末商店 / 通关 / 阵亡)转成结算屏与回调;
 *  - 屏幕推进闸门、每日重置与赛季翻页、首局引导步骤、体力与委托查询。
 *
 * 实体数组由世界层持有并原地 mutate(词缀引擎 BattleContext 引用同一批数组,不得重新赋值);
 * 视图(BattleWorldView/HudView/FxView)每帧只读这些数组绑定节点。
 * 本文件不 import cc。
 */

import { type Vec2 } from "../game/core/math";
import { BattleWorld, type BattleRunInputs, type BattleWorldHost, type MoveInput } from "../game/systems/battleWorld";
import { Onboarding } from "../game/systems/onboarding";
import { FxLayerData } from "./FxCore";
import type { SaveModel } from "../core/SaveModel";
import { rareBonusFor, type TalentId } from "../game/data/talents";
import type { EnvAffixType } from "../game/data/envAffixes";
import { rollEnvAffixes } from "../game/data/envAffixes";
import { ENDLESS_ENERGY_COST, needsDailyReset, regenEnergy, rollDailyTalents, stageDropCount, stageDropLevel, stageEnergyCost, todayKey } from "../game/data/daily";
import { CHAPTERS_PER_STAGE, CLEAR_REWARD_GROWTH, splitEcho, STAGES, stageEchoReward, stageOf, STAGE_UNLOCK_PROGRESS, type StageDef, type StageRewards } from "../game/data/stages";
import { DUPLICATE_STARDUST } from "../game/data/gacha";
import { generateEquipment, makeStarterEquipment, type Equipment } from "../game/data/equipmentGen";
import { seasonTheme } from "../game/data/seasonSets";
import {
    calcStars,
    DAY_MS,
    FIRST_CLEAR_ECHO_MULT,
    FIRST_CLEAR_TICKET_MULT,
    seasonEnded,
    seasonScore,
    seasonStardust,
    SEASON_DAYS,
    stageUnlocked,
    THREE_STAR_TICKETS,
} from "../game/data/season";
import { phantomBoard, rankAmong } from "../game/data/leaderboard";
import { calcPrestigePoints } from "../game/data/prestige";
import { COMMISSION_READY_HOURS } from "../game/data/commissions";

/** 实体上限(透传共享层;视图做池容量标定时引用) */
export { LIMITS } from "../game/systems/battleWorld";
/** 移动输入通道(宿主 JoystickView 实现) */
export type { MoveInput } from "../game/systems/battleWorld";

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

/** 本局是否已结束由世界层的 over 标记;结算屏交互在 Phase 5 */
export class BattleSim {
    readonly save: SaveModel;
    /** 特效数据层(纯数据:粒子/冲击环/震屏;绘制在 FxView) */
    readonly fxLayer = new FxLayerData();
    /** 战场世界:实体推进与战斗结算的单一事实源(Web 共用同一份) */
    readonly world: BattleWorld<FxLayerData>;
    /** 首局引导(教学横幅;步骤推进归宿主) */
    readonly guide = new Onboarding();

    private wh: number;
    private persistFn: (save: SaveModel) => void;
    private cb: BattleCallbacks;

    /* ---------- 宿主侧结算与展示 ---------- */
    /** 死亡结算挂起(Phase 5 结算屏消费) */
    pendingSettle = false;
    pointsEarnedThisRun = 0;
    rankImprovedTo: number | null = null;

    constructor(opts: BattleSimOptions) {
        this.save = opts.save;
        this.wh = opts.worldH;
        this.persistFn = opts.persist;
        this.cb = opts.callbacks;
        this.fxLayer.setCaps(opts.fxMaxParticles ?? 520, opts.fxMaxRings ?? 40);
        const sim = this;
        /** 局外配置:全部现取,宿主存档数组被整体替换(每日重置/购天赋)时不会读到陈旧引用 */
        const inputs: BattleRunInputs = {
            ownedTalents: () => sim.save.ownedTalents,
            owns: (id) => sim.owns(id),
            ownedGear: () => sim.save.ownedGear,
            gearLevels: () => sim.save.gearLevels,
            dailyTalentClaimed: () => sim.save.dailyTalentClaimed,
            seasonId: () => sim.save.seasonId,
            selectedSet: () => sim.save.selectedSet ?? null,
            selectedGearForRun: () => {
                const sel = sim.save.ownedGear.find((g) => g.id === sim.save.selectedGearId);
                return sel ? (JSON.parse(JSON.stringify(sel)) as Equipment) : null;
            },
            // 蓝图画布选装在 Cocos 侧尚未接入(场外观装屏 Phase 3):套组走共享表,通用初始武器固定飞刀
            makeStarterEquipment: () => makeStarterEquipment("knife"),
            openingEquipmentOverride: () => null,
            tutorialDone: () => sim.save.tutorialDone,
            onTutorialFinished: () => {
                sim.save.tutorialDone = true;
                sim.persist();
            },
            recordEnemySeen: (id) => {
                const seen = sim.save.collection.enemies;
                if (!seen.includes(id)) seen.push(id);
            },
            recordEquipmentSeen: (eq) => sim.recordEquipment(eq),
            recordStageFurthest: (stageId, chapter) => {
                const furthest = sim.save.stageFurthest[stageId] ?? 0;
                if (chapter > furthest) {
                    sim.save.stageFurthest[stageId] = chapter;
                    sim.persist();
                }
            },
        };
        /** 战场事件回报:入账与转场留在本层 */
        const host: BattleWorldHost = {
            worldHeight: () => sim.wh,
            input: opts.input,
            fx: this.fxLayer,
            onDamage: (d) => this.cb.onDamage(d.pos, d.value, d.color),
            onPlayerDown: () => this.onDeath(),
            onChapterShop: () => this.cb.onChapterShop(),
            onStageCleared: () => this.victory(),
            onStageFailed: () => this.onDeath(),
        };
        this.world = new BattleWorld<FxLayerData>({ inputs, host, fxLayer: this.fxLayer });
    }

    /* ================= 世界状态透传(视图每帧只读绑定;数组身份由世界层原地 mutate 保持) ================= */

    get player() { return this.world.player; }
    get enemies() { return this.world.enemies; }
    get skillTelegraphs() { return this.world.skillTelegraphs; }
    get projectiles() { return this.world.projectiles; }
    get clouds() { return this.world.clouds; }
    get minions() { return this.world.minions; }
    get gems() { return this.world.gems; }
    get fx() { return this.world.fx; }
    get dmgNums() { return this.world.dmgNums; }
    get obstacles() { return this.world.obstacles; }
    get arena() { return this.world.arena; }
    get engine() { return this.world.engine; }
    get waves() { return this.world.waves; }
    get gold() { return this.world.gold; }
    get kills() { return this.world.kills; }
    get elapsed() { return this.world.elapsed; }
    get chapter() { return this.world.chapter; }
    get chapterTimer() { return this.world.chapterTimer; }
    get bossSpawned() { return this.world.bossSpawned; }
    get bossDead() { return this.world.bossDead; }
    get bossBanner() { return this.world.bossBanner; }
    get currentStage() { return this.world.currentStage; }
    get envAffixes() { return this.world.envAffixes; }
    get selectedSet() { return this.world.selectedSet; }
    get autoMove() { return this.world.autoMove; }
    get started() { return this.world.started; }
    get over() { return this.world.over; }
    /** 连杀计数(HUD 行情条) */
    get combo() { return this.world.comboCount; }
    get comboShown() { return this.world.comboCount; }
    get frenzy() { return this.world.frenzyTimer > 0; }

    /* ================= 宿主接线 ================= */

    persist(): void {
        this.persistFn(this.save);
    }

    setWorldHeight(wh: number): void {
        this.wh = wh;
    }

    toggleAuto(): void {
        this.world.autoMove = !this.world.autoMove;
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

    owns(id: TalentId): boolean {
        return this.save.ownedTalents.includes(id);
    }

    hasEnv(t: EnvAffixType): boolean {
        return this.world.envAffixes.includes(t);
    }

    isThornBuild(): boolean {
        return this.world.isThornBuild();
    }

    /* ================= 开局 ================= */

    /** 开始主线关卡;体力不足返回 false(体力面板 Phase 4,宿主可提示后重试) */
    startStage(id: number, bypassGate = false): boolean {
        if (!bypassGate && !this.stageOpen(id)) return false;
        this.syncEnergy();
        const cost = stageEnergyCost(id);
        if (this.save.energy < cost) return false;
        this.save.energy -= cost;
        this.persist();
        this.world.currentStage = stageOf(id);
        this.world.envAffixes = [...this.world.currentStage.envAffixes];
        this.startRun();
        return true;
    }

    /** 开始无限关(随机环境词缀;体力口径同 Web) */
    startEndless(): boolean {
        this.syncEnergy();
        if (this.save.energy < ENDLESS_ENERGY_COST) return false;
        this.save.energy -= ENDLESS_ENERGY_COST;
        this.persist();
        this.world.currentStage = null;
        this.world.envAffixes = rollEnvAffixes(seasonTheme(this.save.seasonId).envBias);
        this.startRun();
        return true;
    }

    /** 关卡是否解锁(进度制:通关前关,或前关打到规定比例章节) */
    private stageOpen(id: number): boolean {
        if (id <= 1) return true;
        const furthestPrev = this.save.stageFurthest[id - 1] ?? 0;
        return stageUnlocked(id, this.save.highestStage, furthestPrev, CHAPTERS_PER_STAGE, STAGE_UNLOCK_PROGRESS);
    }

    /** 开始一局:世界准备走共享层,本层只做结算/展示复位与引导启用 */
    private startRun(): void {
        this.world.startRun();
        this.pendingSettle = false;
        this.pointsEarnedThisRun = 0;
        this.rankImprovedTo = null;
        // 首局引导:仅主线第 1 关且未完成时启用
        this.guide.enabled = !this.save.tutorialDone && this.world.currentStage?.id === 1;
        this.guide.reset();
    }

    /** 开始下一章(清场、换竞技场、回中心、开局 burst;战场部分在共享层) */
    nextChapter(): void {
        this.world.nextChapter();
    }

    /* ================= 主循环推进 ================= */

    update(dt: number): void {
        if (!this.world.started || this.world.over) return;
        this.world.beginFrame(dt);
        // 每日重置与赛季翻页(任何推进帧都执行,与 Web 同口径)
        this.checkDailyReset();
        this.syncSeason();
        // 首局引导
        if (this.guide.enabled) {
            this.guide.update(this.world.guideCtx(true, false), dt);
            if (this.guide.finished && !this.save.tutorialDone) {
                this.save.tutorialDone = true;
                this.persist();
            }
        }
        this.world.advance(dt);
    }

    /** 每日重置:跨天清零每日计数并抽取今日天赋(入账与持久化归宿主) */
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

    /** 赛季到期结算翻页:赛季分→星尘,重置星数/赛季最佳,赛季 +1(循环处理离线跨多赛季) */
    private syncSeason(): void {
        const now = Date.now();
        if (!seasonEnded(this.save.seasonStartAt, now)) return;
        let rolled = false;
        while (seasonEnded(this.save.seasonStartAt, now)) {
            const score = seasonScore(this.save.stageStars, this.save.seasonBest);
            this.save.stardust += seasonStardust(score);
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

    /** 广告复活(结算屏调用):战场部分走共享层,本层解除结算挂起 */
    revive(): void {
        this.world.revive();
        this.pendingSettle = false;
        this.rankImprovedTo = null;
    }

    /* ================= 结算(死亡 / 通关) ================= */

    /** 死亡:预计算所得并挂起入账(结算屏与广告复活在 Phase 5;此处只停世界 + 抛事件) */
    private onDeath(): void {
        if (this.world.over) return;
        this.world.over = true;
        this.pendingSettle = true;
        const gained = calcPrestigePoints(this.world.elapsed, this.world.kills, 1);
        this.pointsEarnedThisRun = gained;
        const board = phantomBoard(this.save.seasonId);
        const before = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), board);
        const projectedBest = Math.max(this.save.seasonBest, this.world.chapter);
        const after = rankAmong(seasonScore(this.save.stageStars, projectedBest), board);
        this.rankImprovedTo = after < before ? after : null;
        this.cb.onDeath({
            points: gained,
            kills: this.world.kills,
            chapter: this.world.chapter,
            elapsed: this.world.elapsed,
            rankImprovedTo: this.rankImprovedTo,
        });
    }

    /** 首次 3 星一次性奖励(券 + 关卡框);框已存在时券照发,与 Web settleThreeStarOnce 同口径 */
    private settleThreeStarOnce(stageId: number): { tickets: number; frameNew: boolean } {
        let frameNew = false;
        if (!this.save.frames.includes(stageId)) {
            this.save.frames.push(stageId);
            frameNew = true;
        }
        return { tickets: THREE_STAR_TICKETS, frameNew };
    }

    /** 通关结算:星数/首通/成长奖励 + 装备掉落 + 解锁下一关(与 Web victory 同源) */
    private victory(): void {
        const st = this.world.currentStage;
        if (!st || this.world.over) return;
        this.world.over = true;
        const r = st.rewards;
        const lbBoard = phantomBoard(this.save.seasonId);
        const lbBefore = rankAmong(seasonScore(this.save.stageStars, this.save.seasonBest), lbBoard);
        const stars = calcStars(this.world.player.hp / this.world.player.maxHp, this.world.reviveUsed);
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
        if (stars === 3 && prevStars < 3) {
            const once = this.settleThreeStarOnce(st.id);
            tickets += once.tickets;
            if (once.frameNew) frameUnlocked = st.id;
        }
        this.save.gachaTicket += tickets;
        this.save.stardust += stardustGain;
        // 回响 = 40% 跨天保留 + 60% 本日
        const split = splitEcho(echo);
        this.save.points += split.permanent;
        this.save.dayEcho += split.day;
        // 通关刷装备:新收藏入图鉴(当场入档,后续 roll 的重复判定看得到),重复转星尘
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

    private recordEquipment(eq: Equipment): void {
        const col = this.save.collection;
        for (const t of eq.triggers) this.recordAffix(col.triggers, t.def.name);
        this.recordAffix(col.effects, eq.effect.def.name);
        for (const m of eq.modifiers) this.recordAffix(col.modifiers, m.def.name);
    }

    private recordAffix(list: string[], name: string): void {
        if (!list.includes(name)) list.push(name);
    }
}
