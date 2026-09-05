import { _decorator, Component, Graphics, Label, Node, SpriteFrame, resources } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, refreshDesignResolution, toDesignSpace, worldH } from "./core/DesignMetrics";
import { ScreenRouter, ScreenKey } from "./core/ScreenRouter";
import { loadBalance } from "./core/ConfigChannel";
import { loadViewTable, viewTable } from "./core/ViewTable";
import { readSave, writeSave } from "./core/SaveChannel";
import { showRewardedAd } from "./core/AdChannel";
import { HEX, UI, bindLabel, hexToColor, label, makeNode, solidRect } from "./ui/Widgets";
import { ASSET_MANIFEST } from "./game/data/assets";
import { applyBalance as applyDaily, DIAMOND_AD_DAILY, DIAMOND_PER_AD } from "./game/data/daily";
import { applyBalance as applyStages } from "./game/data/stages";
import { applyBalance as applyWaves } from "./game/systems/waves";
import { applyBalance as applyChapterTypes } from "./game/data/chapters";
import { applyBalance as applyGacha } from "./game/data/gacha";
import { applyBalance as applyEconomy } from "./game/data/equipmentGen";
import { applyBalance as applyMenuLayoutTable } from "./game/data/layoutMenu";
import { applyMenuSkin } from "./game/data/menuSkin";
import { normalizeSave, type SaveModel } from "./core/SaveModel";
import { STAGES } from "./game/data/stages";
import { canStarMakeup, STAR_MAKEUP_COST, THREE_STAR_TICKETS } from "./game/data/season";
import { BattleSim, type VictoryInfo } from "./battle/BattleSim";
import { BattleWorldView } from "./battle/BattleWorldView";
import { HudView } from "./battle/HudView";
import { FxView } from "./battle/FxView";
import { JoystickView } from "./battle/JoystickView";
import { MenuLayoutView } from "./menu/MenuLayoutView";
import { buildMenuContent, hitMenu, menuRowStates, menuSetIds, type MenuAction, type MenuRowState, type MenuTextContent } from "./menu/MenuContentModel";
import { ShopModel, type ShopAction, type ShopWorld } from "./shop/ShopModel";
import { ShopView } from "./shop/ShopView";
import { HeroSelectModel, type HeroAction, type HeroSaveView } from "./heroes/HeroSelectModel";
import { HeroSelectView } from "./heroes/HeroSelectView";
import { LeaderboardView } from "./leaderboard/LeaderboardView";
import { buildLeaderboardContent, leaderboardScreenLayout, type LeaderboardAction, type LeaderboardSaveView } from "./leaderboard/LeaderboardModel";
import { DailyView } from "./daily/DailyView";
import { buildDailyContent, dailyClaim, dailyScreenLayout, type DailyAction, type DailyClaim, type DailySaveView } from "./daily/DailyModel";
import { PassView } from "./pass/PassView";
import { buildPassContent, passClaim, type PassAction, type PassClaim, type PassSaveView } from "./pass/PassModel";
import { passScreenLayout } from "./game/ui/passLayout";
import { GearUpView } from "./gearup/GearUpView";
import { buildGearUpContent, gearUpClaim, type GearUpAction, type GearClaim, type GearUpSaveView } from "./gearup/GearUpModel";
import { gearUpScreenLayout } from "./game/ui/gearUpLayout";
import { GachaView } from "./gacha/GachaView";
import { buildGachaContent, gachaClaim, type GachaAction, type GachaClaim, type GachaSaveView } from "./gacha/GachaModel";
import { gachaScreenLayout } from "./game/ui/gachaLayout";
import { type GachaResult } from "./game/data/gacha";
import { PrestigeView } from "./prestige/PrestigeView";
import { buildPrestigeContent, prestigeBlocks, prestigeClaim, prestigeRouteIds, type PrestigeAction, type PrestigeClaim, type PrestigeRunConfig, type PrestigeSaveView } from "./prestige/PrestigeModel";
import { prestigeScreenLayout, type PtRouteKey } from "./game/ui/prestigeLayout";
import { CommissionView } from "./commission/CommissionView";
import {
    COMMISSION_DEFAULT_SELECTION,
    buildCommissionContent,
    commissionClaim,
    commissionSlots,
    type CommissionAction,
    type CommissionClaim,
    type CommissionSaveView,
    type CommissionSelection,
} from "./commission/CommissionModel";
import { commissionScreenLayout } from "./game/ui/commissionLayout";
import { FusionView } from "./fusion/FusionView";
import {
    FUSION_DEFAULT_SELECTION,
    FUSION_DEFAULT_TRIPLE_MODE,
    buildFusionContent,
    fusionClaim,
    fusionTripleArmed,
    type FusionAction,
    type FusionClaim,
    type FusionPendingHidden,
    type FusionSaveView,
    type FusionSelection,
} from "./fusion/FusionModel";
import { fusionScreenLayout } from "./game/ui/fusionLayout";
import { SeasonView } from "./season/SeasonView";
import { buildSeasonContent, seasonRoll, type SeasonAction, type SeasonRollClaim, type SeasonSaveView, type SeasonSummary } from "./season/SeasonModel";
import { seasonScreenLayout } from "./game/ui/seasonLayout";
import { GameOverView } from "./gameover/GameOverView";
import {
    buildGameOverContent,
    gameOverEchoClaim,
    gameOverForms,
    type GameOverAction,
    type GameOverEchoClaim,
    type GameOverRunView,
    type GameOverSaveView,
} from "./gameover/GameOverModel";
import { gameOverScreenLayout } from "./game/ui/gameOverLayout";
import { VictoryView } from "./victory/VictoryView";
import {
    buildVictoryContent,
    victoryEchoClaim,
    victoryEchoTotal,
    victoryForms,
    type VictoryAction,
    type VictoryEchoClaim,
    type VictoryRunView,
} from "./victory/VictoryModel";
import { victoryScreenLayout } from "./game/ui/victoryLayout";
import { EnergyView } from "./energy/EnergyView";
import {
    buildEnergyContent,
    energyAdClaim,
    energyDiamondClaim,
    type EnergyAction,
    type EnergyDiamondClaim,
    type EnergySaveView,
} from "./energy/EnergyModel";
import { energyScreenLayout } from "./game/ui/energyLayout";
import type { TripleMode } from "./game/data/fusion";
import type { Equipment } from "./game/data/equipmentGen";

const { ccclass } = _decorator;

/** 回响筹码下标:点它走激励视频领回响(三枚筹码 = 券/回响/星尘) */
const ECHO_CHIP_INDEX = 1;

/**
 * 委托面板的刷新节奏(秒):面板上那三行读数与进度条都按 `Date.now()` 现算,
 * 小时读数 `toFixed(1)` 要 6 分钟才跳一档,1 秒一次足够跟上,不必逐帧重排 Label。
 */
const COMMISSION_TICK_SECONDS = 1;


/**
 * HUD 构建期一次性读取的贴图(坞板九宫格 / 徽章 / 横幅 / 14 张装备卡效果图标):
 * 这些在 buildLayers 时定格,不参与每帧热换,必须先到位再建界面;其余(敌人/玩家/
 * 弹道/背景/特效/掉落/召唤物)每帧从 frames 读取,可后台流式加载并自动换上。
 */
const HUD_PRELOAD_KEYS = [
    "hud_dock_top",
    "hud_dock_bottom",
    "badge_shield_bronze",
    "icon_echo",
    "icon_stardust",
    "affix_boss",
    "banner_mid_red",
    "banner_large_navy_b",
    "icon_fx_knife",
    "icon_fx_nova",
    "icon_fx_skeleton",
    "icon_fx_cloud",
    "icon_fx_ray",
    "icon_fx_chain",
    "icon_fx_shield",
    "icon_fx_drain",
    "icon_fx_icelance",
    "icon_fx_frost_ring",
    "icon_fx_meteor",
    "icon_fx_magma_trail",
    "icon_fx_spirit_wolves",
    "icon_fx_haunt_crown",
];

/** 预载集之外的全部清单键(世界美术 + 后续阶段菜单美术,后台流式加载) */
function restFrameKeys(): string[] {
    const pre = new Set(HUD_PRELOAD_KEYS);
    return Object.keys(ASSET_MANIFEST).filter((k) => !pre.has(k));
}

/** balance.json → 共享数值模块(与 Web src/platform/balance.ts 同一分发口径) */
function applySharedBalance(cfg: Record<string, any> | null): void {
    if (!cfg) return;
    const section = (name: string): Record<string, unknown> | undefined => {
        const v = cfg[name];
        return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    };
    applyDaily({ energy: section("energy"), economy: section("economy") });
    const battle = section("battle");
    applyStages(battle);
    // waves.chapterLength 未单独配置时跟随 battle.chapterSeconds(与 Web 加载器同源)
    const wavesCfg = section("waves") ?? (battle && battle.chapterSeconds !== undefined ? { chapterLength: battle.chapterSeconds } : undefined);
    applyWaves(wavesCfg);
    applyChapterTypes(section("chapterTypes"));
    applyGacha(section("gacha"));
    applyEconomy(section("economy"));
    // 布局与皮肤两条通道:balance.json 的 menuLayout / menuSkin 段就是这么进 Cocos 侧内存表的
    applyMenuLayoutTable(section("menuLayout"));
    const skin = cfg.menuSkin;
    if (skin && typeof skin === "object" && !Array.isArray(skin)) applyMenuSkin(skin as Record<string, unknown>);
}

/**
 * 壳层:替代 Web 版 game.ts 的"单 canvas + 主循环 + 屏幕 if-else"。
 * 职责只有四件:搭层级、装载资源、跑路由、把 dt 交给战斗推进。
 */
@ccclass("GameShell")
export class GameShell extends Component {
    private bg!: Node;
    private worldLayer!: Node;
    private screenLayer!: Node;
    private router = new ScreenRouter();
    private frames = new Map<string, SpriteFrame>();
    private ready = false;

    /* 战斗屏四件套 + 模拟层 */
    private sim!: BattleSim;
    private worldView!: BattleWorldView;
    private hudView!: HudView;
    private fxView!: FxView;
    private joystick!: JoystickView;

    /* 主菜单:表驱动视图 + 玩家版指针热区 */
    private menuView: MenuLayoutView | null = null;
    /** 玩家版的指针热区(整屏一个捕获节点,菜单屏唯一的触摸入口) */
    private menuPointer: Node | null = null;
    /** 激励视频在途标记(= Web 的 `adBusy`):一次未看完前不接受第二次点击,期间本屏点击全吞 */
    private adPending = false;
    /** 章间商店:账本与视图(战场状态经 ShopWorld 切片接入) */
    private shopModel: ShopModel | null = null;
    private shopView: ShopView | null = null;
    /** 英雄选择屏:账本(滚动位/预览/热区)与视图;出战只经 model.commit 写回 sim.save */
    private heroesModel: HeroSelectModel | null = null;
    private heroesView: HeroSelectView | null = null;
    /** 幻影榜屏:纯只读,视图直读存档派生的 content(无常驻模型实例) */
    private leaderboardView: LeaderboardView | null = null;
    /** 每日福利屏:内容与写入意图由 cc-free 模型给,视图与排行屏同构(无常驻模型实例) */
    private dailyView: DailyView | null = null;
    /** 赛季通行证屏:同上,内容与写入意图来自 cc-free 的 pass/PassModel.ts */
    private passView: PassView | null = null;
    /** 装备升级屏:同上,内容与写入意图来自 cc-free 的 gearup/GearUpModel.ts(本屏没有广告位) */
    private gearUpView: GearUpView | null = null;
    /** 扭蛋机屏:同上,内容与写入意图来自 cc-free 的 gacha/GachaModel.ts(本屏有每日 1 次的广告抽) */
    private gachaView: GachaView | null = null;
    /**
     * 最近抽取结果 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private gachaResults`)。
     * 每次进屏清空;抽取与广告抽都把它 `[...本次, ...旧].slice(0, 8)`,绘制只取前 5 条。
     */
    private gachaResults: GachaResult[] = [];
    /** 转生与天赋屏:同上,内容与写入意图来自 cc-free 的 prestige/PrestigeModel.ts(本屏没有广告位,也没有返回钮) */
    private prestigeView: PrestigeView | null = null;
    /**
     * 当前显示的天赋系 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private talentRoute`,
     * `SaveData` 里没有这一项)。切页签只改它,重开应用回到默认那一系。
     */
    private talentRoute: PtRouteKey = "builder";
    /**
     * 开局配置两枚开关 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private runConfig`)。
     * `blueprintEffect` 经 `buildBattle()` 注入 BattleSim 的 `starterEffect`,每次开局现取,
     * 整局会话内不清零;`targetTrigger` 在 Web 侧本身就没有消费方(「首次升级必定出现的触发器」
     * 这条玩法未实装),两端都只管开关本身。
     */
    private runConfig: PrestigeRunConfig = {};
    /** 委托挂机屏:同上,内容与写入意图来自 cc-free 的 commission/CommissionModel.ts(本屏没有广告位) */
    private commissionView: CommissionView | null = null;
    /**
     * 委托屏选中的区域与难度 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private commRegion`
     * 与 `private commDifficulty`,`SaveData` 里没有这两项)。整局会话内跨开屏 / 关屏保留。
     */
    private commSel: CommissionSelection = { ...COMMISSION_DEFAULT_SELECTION };
    /** 委托面板的刷新计时(秒;只在面板态走,见 tickCommission) */
    private commTick = 0;
    /** 词缀融合屏:同上,内容与写入意图来自 cc-free 的 fusion/FusionModel.ts(本屏没有广告位) */
    private fusionView: FusionView | null = null;
    /**
     * 融合屏选中的三件装备 id 与保底三选一暂存 —— **宿主持有的瞬时态,不入档**(对标 Web 的
     * `private fusA/fusB/fusC` 与 `private pendingHidden`,`SaveData` 里没有这四项)。
     * 每次开屏清空;暂存只在保底触达那一发存在,选定后收尾。
     */
    private fusSel: FusionSelection = { ...FUSION_DEFAULT_SELECTION };
    private fusPending: FusionPendingHidden | null = null;
    /**
     * 三重融合模式 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private tripleMode`)。
     * 开屏**不**清空:整局会话内跨开屏 / 关屏保留,与选中三件的节奏不同。
     */
    private fusMode: TripleMode = FUSION_DEFAULT_TRIPLE_MODE;
    /** 赛季结算屏:内容与翻页意图来自 cc-free 的 season/SeasonModel.ts(本屏没有广告位,也没有手动入口) */
    private seasonView: SeasonView | null = null;
    /**
     * 最近一次到期翻页的摘要 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private seasonSummary`,
     * `SaveData` 里没有这一项)。翻页那一刻算出,贴底钮收起它;离线跨多赛季只留最后一轮。
     */
    private seasonSummary: SeasonSummary | null = null;
    /** 死亡结算屏:内容与命中与写入意图来自 cc-free 的 gameover/GameOverModel.ts(本屏有两处广告位,都走 watchAd) */
    private gameOverView: GameOverView | null = null;
    /** 通关结算屏:内容与命中与写入意图来自 cc-free 的 victory/VictoryModel.ts(本屏有一处广告位,走 watchAd) */
    private victoryView: VictoryView | null = null;
    /**
     * 最近一次通关的 payload —— **宿主持有的瞬时态,不入档**(对标 Web 的 `stageReward` /
     * `victoryStars` / `stageDrops` / `firstClearBonus` / `frameUnlockedThisRun` 五个私有字段:
     * Web 把它们摊在实例上,Cocos 侧收成一枚 `VictoryInfo`,因为战斗层已经把六件事算完并
     * 一次性抛给 `cb.onVictory`)。通关那一刻写入,每个开局点清空,回主菜单后不再被读。
     */
    private victoryInfo: VictoryInfo | null = null;
    /**
     * 本局星尘所得 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private stardustEarnedThisRun`)。
     * Web 只在 `victory()` 里写非零值,死亡路径与每次开局都写 0,于是**死亡**屏上「星尘 +…」
     * 那一支在两端都是死分支;本层原样保留这一项与那个判断,不在这里"修好"。
     * 通关屏上那一行星尘读的是 `stageReward.stardust`(与本源同数),本字段由 onVictory 回调
     * 按 Web 同位写入,只为让两端的那一份会话态真的同源,不再被其它屏读到。
     */
    private stardustEarnedThisRun = 0;
    /**
     * 本局双倍是否已领 —— **宿主持有的瞬时态,不入档**(对标 Web 的 `private doubleClaimed`,
     * `SaveData` 里没有这一项)。Web 在两处清零:每次开局(`startRun`)与通关(`victory`);
     * Cocos 侧同两笔 —— 四个开局点走 `resetGameOverTransients`,通关点走 `openVictory` 首行。
     */
    private doubleClaimed = false;
    /** 体力不足屏:内容与命中与写入意图来自 cc-free 的 energy/EnergyModel.ts(本屏有一处广告位,走 watchAd) */
    private energyView: EnergyView | null = null;
    /**
     * 被体力挡住的那次开局 —— **宿主持有的瞬时闭包,不入档**(对标 Web 的 `private energyPending`,
     * `SaveData` 里没有这一项)。Web 在 `startStage` / `startEndless` 的体力闸门那一支写下它
     * (`() => this.startStage(id, bypassGate)` 或 `() => this.startEndless()`),本屏的出口就是
     * 这一枚闭包:领到体力就调它续上开局,关闭 / 返回就把它清掉再回主菜单。
     */
    private energyPending: (() => void) | null = null;
    /** 复用的存档切片:每轮布局覆写它,滚动期间不再逐帧分配对象 */
    private heroSlice: HeroSaveView = { selectedHero: null, selectedSet: null, seasonId: 1 };
    /** 赛季切片同样被 `tickSeason` 逐帧读,故与 heroSlice 同性质地复用同一枚对象 */
    private seasonSlice: SeasonSaveView = { seasonId: 1, seasonStartAt: 0, stageStars: [], seasonBest: 0, stardust: 0 };
    private overlay: Node | null = null;
    private toastNode: Node | null = null;
    private toastLabel: Label | null = null;
    private toastLeft = 0;

    onLoad(): void {
        refreshDesignResolution();
        this.bg = solidRect("Background", this.node, fullRect(), HEX.bgDeep);
        this.worldLayer = makeNode("World", this.node);
        this.screenLayer = makeNode("Screen", this.worldLayer);
        void this.boot();
    }

    /* ================= 启动 ================= */

    private loadFrames(keys: string[] = Object.keys(ASSET_MANIFEST)): Promise<void> {
        return new Promise((resolve) => {
            if (keys.length === 0) {
                resolve();
                return;
            }
            let pending = keys.length;
            const done = () => {
                pending -= 1;
                if (pending <= 0) resolve();
            };
            keys.forEach((key) => {
                resources.load("textures/" + key + "/spriteFrame", SpriteFrame, (err, asset) => {
                    if (!err && asset) this.frames.set(key, asset as SpriteFrame);
                    done();
                });
            });
        });
    }

    private async boot(): Promise<void> {
        // 数值表先行(ENERGY_MAX/章节时长等常量影响 HUD 与开局)
        const balance = await loadBalance();
        applySharedBalance(balance);
        await loadViewTable();
        // HUD 构建期一次性贴图先到位(坞板/图标/横幅/装备卡图标),再建界面
        await this.loadFrames(HUD_PRELOAD_KEYS);
        this.buildLayers();
        this.ready = true;
        this.router.show("battle");
        // 其余世界美术后台流式加载:每帧从 frames 读取,到位即自动换上(语义 = Web assets.beginLoad())
        this.loadFrames(restFrameKeys()).then(() => {
            // 背景与视图贴图就绪态都是一次性读取,流到位后补刷一次
            if (!this.ready) return;
            this.refreshBackdrop();
            this.menuView?.setFrames(this.frames);
            // 商店与英雄屏的图标/立绘在 sync 时才换上:换引用 + 当前屏补排一次
            this.shopView?.setFrames(this.frames);
            this.heroesView?.setFrames(this.frames);
            this.leaderboardView?.setFrames(this.frames);
            this.dailyView?.setFrames(this.frames);
            this.passView?.setFrames(this.frames);
            this.gearUpView?.setFrames(this.frames);
            this.gachaView?.setFrames(this.frames);
            this.prestigeView?.setFrames(this.frames);
            this.commissionView?.setFrames(this.frames);
            this.fusionView?.setFrames(this.frames);
            this.seasonView?.setFrames(this.frames);
            this.gameOverView?.setFrames(this.frames);
            this.victoryView?.setFrames(this.frames);
            this.energyView?.setFrames(this.frames);
            if (this.router.current === "heroes") this.heroesView?.sync();
            if (this.router.current === "leaderboard") this.leaderboardView?.sync();
            if (this.router.current === "daily") this.dailyView?.sync();
            if (this.router.current === "pass") this.passView?.sync();
            if (this.router.current === "gearup") this.gearUpView?.sync();
            if (this.router.current === "gacha") this.gachaView?.sync();
            if (this.router.current === "prestige") this.prestigeView?.sync();
            if (this.router.current === "commission") this.commissionView?.sync();
            if (this.router.current === "fusion") this.fusionView?.sync();
            if (this.router.current === "season") this.seasonView?.sync();
            if (this.router.current === "gameover") this.gameOverView?.sync();
            if (this.router.current === "victory") this.victoryView?.sync();
            if (this.router.current === "energy") this.energyView?.sync();
            this.refreshMenu();
        });
    }

    private buildLayers(): void {
        this.buildScreens();
        this.buildBattle();
        this.buildMenuScreen();
        this.buildShopScreen();
        this.buildHeroesContent();
        this.buildLeaderboardScreen();
        this.buildDailyScreen();
        this.buildPassScreen();
        this.buildGearUpScreen();
        this.buildGachaScreen();
        this.buildPrestigeScreen();
        this.buildCommissionScreen();
        this.buildFusionScreen();
        this.buildSeasonScreen();
        this.buildGameOverScreen();
        this.buildVictoryScreen();
        this.buildEnergyScreen();
        this.overlay = makeNode("Overlay", this.worldLayer);
    }

    /** 屏幕注册表:每屏一个节点 + 一个 refresh 回调(路由切屏时即刷新实时数值) */
    private buildScreens(): void {
        const hooks: Partial<Record<ScreenKey, () => void>> = {
            menu: () => this.refreshMenu(),
            shop: () => this.shopView?.sync(),
            heroes: () => this.syncHeroes(),
            leaderboard: () => this.syncLeaderboard(),
            daily: () => this.syncDaily(),
            pass: () => this.syncPass(),
            gearup: () => this.syncGearUp(),
            gacha: () => this.syncGacha(),
            prestige: () => this.syncPrestige(),
            commission: () => this.syncCommission(),
            fusion: () => this.syncFusion(),
            season: () => this.syncSeason(),
            gameover: () => this.syncGameOver(),
            victory: () => this.syncVictory(),
            energy: () => this.syncEnergy(),
        };
        (["battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover", "victory", "energy"] as ScreenKey[]).forEach((key) => {
            const node = makeNode("Screen:" + key, this.screenLayer);
            node.active = false;
            const refresh = hooks[key];
            this.router.register(key, {
                active: false,
                onShow: () => {
                    node.active = true;
                },
                onHide: () => {
                    node.active = false;
                },
                refresh: () => {
                    if (refresh) refresh();
                },
            });
        });
    }

    /* ================= 战斗屏 ================= */

    private buildBattle(): void {
        const battleScreen = this.screenLayer.getChildByName("Screen:battle")!;
        const wh = worldH();
        const fx = viewTable().fx;
        // 层级顺序 = Web render():背景 → 世界(网格…飘字)→ HUD 双坞 → 摇杆最上
        this.worldView = new BattleWorldView(battleScreen, this.frames, wh);
        this.hudView = new HudView(battleScreen, this.frames, wh);
        this.joystick = new JoystickView(battleScreen);
        this.fxView = new FxView({
            particles: this.worldView.fxParticlesNode,
            telegraphs: this.worldView.telegraphNode,
            floats: this.worldView.floatTextNode,
            wh,
        });

        const save = normalizeSave(readSave());
        this.sim = new BattleSim({
            save,
            input: this.joystick,
            worldH: wh,
            persist: (s) => {
                writeSave(s);
            },
            fxMaxParticles: fx.maxParticles,
            fxMaxRings: fx.maxRings,
            // 转生屏「完美蓝图」的选装:每次开局现取,未选则由战斗层回落飞刀(对标 Web makeStarter)
            starterEffect: () => this.runConfig.blueprintEffect,
            callbacks: {
                onDamage: (pos, text, color) => this.fxView.popDamage(pos, text, color),
                // 死亡与通关 → 弹两张结算屏(Phase 5):判据都在战斗层(onPlayerDown / onStageFailed
                // 两条都汇到 BattleSim.onDeath,那里已把 over / pendingSettle / 预计算回响 / 名次提示
                // 四件事做完;打过关底则进 BattleSim.victory,那里已把星数 / 首通 / 券 / 回响 / 星尘 /
                // 掉落 / 解锁下一关 / 名次提示 / 双倍复位九件事算完并落盘)。
                // 宿主回调只负责把屏切过去并把 payload 存成会话态,一张屏都不重算第二遍账。
                onDeath: () => this.openGameOver(),
                onVictory: (info) => this.openVictory(info),
                // 章末 → 弹章间商店屏(买完/关闭后回到战斗并继续下一章)
                onChapterShop: () => this.openShop(),
            },
        });
        this.joystick.onToggleAuto = () => this.sim.toggleAuto();
        this.hudView.onSkipGuide = () => this.sim.skipGuide();
        // 开局:主线第 1 关(体力不足回落无限关),背景随模式切换
        if (!this.sim.startStage(1)) this.sim.startEndless();
        this.resetGameOverTransients();
        this.refreshBackdrop();
    }

    /** 战斗背景 = bg_stage_<关卡>(无限关 bg_outside),对标 Web render() 的 bgCoverKey/bgKey */
    private refreshBackdrop(): void {
        const key = this.sim && this.sim.currentStage ? `bg_stage_${this.sim.currentStage.id}` : "bg_outside";
        this.worldView.setBackdrop(this.frames.has(key) ? key : "bg_outside");
    }

    /* ================= 主菜单屏(表驱动:几何来自 menuLayoutPure,文案来自存档) ================= */

    /**
     * 菜单屏装配。两条纪律:
     *  ① 画面只由 `MenuLayoutView` 画(几何全部来自 `menuLayoutPure`),一份视图一处真相;
     *  ② 文案与状态只由 `buildMenuContent` 给(存档驱动),所以屏幕上看到的
     *     行/筹码/红点就是玩家真实进度下的那一套。
     */
    private buildMenuScreen(): void {
        const menu = this.screenLayer.getChildByName("Screen:menu");
        if (!menu) return;
        menu.removeAllChildren();
        this.menuPointer = null;
        const save = this.save();
        this.menuView = new MenuLayoutView(menu, this.frames);
        this.menuView.setEnv(STAGES.map((s) => s.id), menuSetIds(save));
        this.menuView.refresh(this.menuContent());
        this.bindMenuPointer(menu);
    }

    /** 实时重算一屏:切回菜单、广告入账、补星后都走它 */
    private refreshMenu(): void {
        if (!this.menuView) return;
        this.menuView.refresh(this.menuContent());
    }

    /** 本屏读的是战斗层持有的同一份内存存档;sim 未就绪时回落 localStorage 归一化结果 */
    private save(): SaveModel {
        return this.sim ? this.sim.save : normalizeSave(readSave());
    }

    /** 逐行状态(解锁/通关/星数/补星):画面与点击判定共读这一份 */
    private menuRows(): MenuRowState[] {
        return menuRowStates(this.save(), STAGES.map((s) => s.id));
    }

    private menuContent(): MenuTextContent {
        if (this.sim) this.sim.syncEnergy();
        return buildMenuContent({
            save: this.save(),
            now: Date.now(),
            currentStageId: this.sim && this.sim.currentStage ? this.sim.currentStage.id : null,
            stageIds: STAGES.map((s) => s.id),
        });
    }

    /** 玩家版的整屏热区:一次 hitMenu 判定,宿主只把动作翻译成玩法,不在这里重算几何 */
    private bindMenuPointer(menu: Node): void {
        const cap = makeNode("MenuPointer", menu);
        placeRect(cap, fullRect());
        cap.on(Node.EventType.TOUCH_END, (e: { getUILocation(): { x: number; y: number } }) => {
            const L = this.menuView ? this.menuView.layout() : null;
            if (!L) return;
            const p = toDesignSpace(cap, e.getUILocation());
            const act = hitMenu(L, this.menuRows(), p.x, p.y);
            if (act) this.onMenuAction(act);
        }, this);
        this.menuPointer = cap;
    }

    private onMenuAction(a: MenuAction): void {
        const sim = this.sim;
        if (!sim) return;
        switch (a.kind) {
            case "stage": {
                const row = this.menuRows().find((r) => r.id === a.id);
                if (!row) return;
                if (!row.unlocked) {
                    this.toast(`第${a.id}关尚未解锁`);
                    return;
                }
                // 死亡后放弃本局改打别关:先结算死亡(必须排在 startStage 之前,否则挂起的账被 startRun 清掉)
                sim.settlePendingRun();
                this.requestStage(a.id);
                return;
            }
            case "makeup":
                this.starMakeup(a.id);
                return;
            case "endless":
                // 同上:放弃死亡局改打无限关也要先结算
                sim.settlePendingRun();
                this.requestEndless();
                return;
            case "hero":
                this.openHeroes();
                return;
            case "chip":
                // 三枚筹码 = 券/回响/星尘,只有回响筹码挂激励视频入口
                if (a.index === ECHO_CHIP_INDEX) this.watchAdForEcho();
                return;
            case "phantom":
                this.openLeaderboard();
                return;
            // 六个入口就是 MenuEntryId 的全集,逐个换成真实开屏(商店的融合工具钮走 onShopAction)
            case "entry":
                if (a.entry === "daily") {
                    this.openDaily();
                    return;
                }
                if (a.entry === "pass") {
                    this.openPass();
                    return;
                }
                if (a.entry === "gearup") {
                    this.openGearUp();
                    return;
                }
                if (a.entry === "gacha") {
                    this.openGacha();
                    return;
                }
                if (a.entry === "talent") {
                    this.openPrestige();
                    return;
                }
                if (a.entry === "commission") {
                    this.openCommission();
                    return;
                }
                return;
        }
    }

    /** 补星(钻石出口):5◆ 直接记 3 星 + 一次性 3 星券与关卡框,与 Web starMakeup 同一入账口径 */
    private starMakeup(id: number): void {
        const save = this.save();
        if (!canStarMakeup(save.stageStars[id] ?? 0)) return;
        if (save.diamond < STAR_MAKEUP_COST) {
            this.toast("钻石不足,补星需要 " + STAR_MAKEUP_COST + "◆");
            return;
        }
        save.diamond -= STAR_MAKEUP_COST;
        save.stageStars[id] = 3;
        save.gachaTicket += THREE_STAR_TICKETS;
        if (!save.frames.includes(id)) save.frames.push(id);
        this.sim.persist();
        this.refreshMenu();
        this.toast(`补星完成 · 扭蛋券 +${THREE_STAR_TICKETS}`);
    }

    /**
     * 激励视频的唯一入口(语义逐项对标 Web `game.ts:watchAd`):
     * 在途期间不接受第二次点击;看完先记一次 `adWatchCount` 并在每日上限内发钻石、落一次盘,
     * 再调 `onOk` 发本屏奖励(于是"今日广告 N 次"与各屏入账共用同一条通道);没看完走 `onFail`。
     * 平台分流全在 `core/AdChannel.showRewardedAd`,这里不碰 wx API。
     */
    private watchAd(onOk: () => void, onFail?: () => void): void {
        // 广告闸门只有这一道(对标 Web watchAd 首行的 adBusy):在途期间挡第二次看广告,同步领取照常执行
        if (this.adPending) return;
        this.adPending = true;
        showRewardedAd((ok) => {
            this.adPending = false;
            if (ok) {
                const save = this.save();
                save.adWatchCount += 1;
                if (save.adWatchCount <= DIAMOND_AD_DAILY) save.diamond += DIAMOND_PER_AD;
                this.sim?.persist();
                onOk();
            } else if (onFail) onFail();
        });
    }

    /** 激励视频领回响:非微信宿主按模拟时长判定完整观看;入账走存档唯一写路径 */
    private watchAdForEcho(): void {
        const gain = viewTable().phase3.echoAdGain;
        this.watchAd(
            () => {
                this.save().points += gain;
                this.sim?.persist();
                this.refreshMenu();
                this.toast(`回响 +${gain}`);
            },
            () => this.toast("广告未看完,回响未入账")
        );
    }

    /* ---------- 轻提示:Overlay 上一条暗底胶囊,ttl 到点收起(未接入屏幕的兜底反馈) ---------- */

    private toast(text: string): void {
        const t = viewTable().phase3;
        const w = DESIGN_W - UI.pad * 2;
        if (!this.toastNode || !this.toastNode.isValid) {
            const node = makeNode("Toast", this.overlay ?? this.worldLayer);
            node.addComponent(Graphics);
            const g = node.getComponent(Graphics)!;
            g.fillColor = hexToColor(t.hintBg);
            g.roundRect(-w / 2, -t.hintH / 2, w, t.hintH, t.hintH / 2);
            g.fill();
            placeRect(node, { x: UI.pad, y: t.hintY, w, h: t.hintH });
            const lb = label("ToastText", node, "", t.hintPx, t.hintFg, {
                bold: true,
                hAlign: Label.HorizontalAlign.CENTER,
                rect: { x: 0, y: 0, w, h: t.hintH },
                box: { w, h: t.hintH },
            });
            lb.verticalAlign = Label.VerticalAlign.CENTER;
            this.toastNode = node;
            this.toastLabel = lb;
        }
        bindLabel(this.toastLabel!, text);
        this.toastNode.active = true;
        this.toastLeft = t.hintTtl;
    }

    /** 提示条计时:壳层在路由闸门之前调用,保证非战斗屏上也会自己收起 */
    private tickToast(dt: number): void {
        if (this.toastLeft <= 0) return;
        this.toastLeft -= dt;
        if (this.toastLeft <= 0 && this.toastNode && this.toastNode.isValid) this.toastNode.active = false;
    }

    /* ================= 章间商店屏 ================= */

    /**
     * 商店屏装配。账本(货品/价目/购买/刷新/槽位/销毁/进化)在 `shop/ShopModel.ts`,
     * 节点摆在 `shop/ShopView.ts`;这里只做两件事:把 BattleSim 的战场状态投影成
     * ShopWorld 切片,以及把模型回报的热区动作翻译成玩法。
     */
    private buildShopScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:shop");
        const sim = this.sim;
        if (!node || !sim) return;
        node.removeAllChildren();
        const world: ShopWorld = {
            // getter 而非引用:开局时世界层会换掉装备数组的实例,取到的一直是活的那一份
            get equipment() {
                return sim.player.equipment;
            },
            gold: () => sim.gold,
            setGold: (v) => {
                sim.world.gold = v;
            },
            slots: () => sim.player.slots,
            runSlotBonus: () => sim.player.runSlotBonus,
            addRunSlot: () => {
                sim.player.runSlotBonus += 1;
            },
            chapter: () => sim.chapter,
            seasonId: () => sim.save.seasonId,
            highestStage: () => sim.save.highestStage,
            selectedSet: () => sim.save.selectedSet ?? null,
            ownedTalents: () => sim.save.ownedTalents,
            totalBought: () => sim.world.totalBought,
            addTotalBought: () => {
                sim.world.totalBought += 1;
            },
            recordEquipment: (eq) => sim.world.recordEquipment(eq),
            cardTypeKey: (eq) => sim.world.cardTypeKey(eq),
            mergeGroups: () => sim.world.mergeGroups(),
        };
        this.shopModel = new ShopModel(world);
        this.shopView = new ShopView(node, this.frames, this.shopModel, worldH(), (a) => this.onShopAction(a));
        this.shopView.sync();
    }

    /** 章末进商店:刷三张货 + 复位本章刷新阶梯,再切屏(战斗推进由路由闸门自然暂停) */
    private openShop(): void {
        if (!this.shopModel) return;
        this.shopModel.open();
        this.router.show("shop");
    }

    /** 离开商店:next = 继续下一章,否则回主菜单(本局金币与章节进度按 Web 口径留在场内) */
    private closeShop(next: boolean): void {
        if (next && this.sim) this.sim.nextChapter();
        this.refreshBackdrop();
        this.router.show(next ? "battle" : "menu");
    }

    private onShopAction(a: ShopAction): void {
        const m = this.shopModel;
        const sim = this.sim;
        if (!m || !sim) return;
        switch (a.kind) {
            case "tool":
                if (a.id === "refresh") {
                    if (!m.refresh()) this.toast("金币不足,刷新不了");
                } else if (a.id === "fusion") {
                    this.openFusion();
                } else if (a.id === "restart") {
                    this.restartRun();
                    return;
                } else {
                    this.closeShop(false);
                    return;
                }
                break;
            case "slot":
                if (!m.buySlot()) this.toast("金币不足或槽位已满");
                break;
            case "card":
                if (!m.buy(a.index)) this.toast(sim && m.freeSlots() <= 0 ? "槽位已满,先销毁一件" : "金币不足");
                break;
            case "weapon":
                m.selectWeapon(a.id);
                break;
            case "destroy":
                m.destroy(a.id);
                break;
            case "merge":
                if (!m.merge(a.sample)) this.toast("金币不足,升不了品");
                break;
            case "next":
                this.closeShop(true);
                return;
        }
        this.shopView?.sync();
    }

    /**
     * 重开本局(商店「重开」钮 / 转生屏「开始新轮回」/ 死亡屏「重开」):与 Web `restart()` 同一
     * 口径 —— 首行先结算挂起的死亡局,再当前关带门控豁免重开、无限关重掷词缀。两条都汇到
     * 开局漏斗,所以体力不够时是**挂起这次重开并弹体力不足屏**(Web 同一条口),不再是留原屏轻提示。
     */
    private restartRun(): void {
        const sim = this.sim;
        if (!sim) return;
        sim.settlePendingRun(); // Web restart() 首行同位:死亡后放弃重开,先结算死亡
        if (sim.currentStage) this.requestStage(sim.currentStage.id, true);
        else this.requestEndless();
    }

    /**
     * 英雄选择屏装配。三层分工与商店屏同构:
     *  ① 几何全部来自共享层 `game/ui/heroSelectLayout()`(经 `model.layout` 单一出口),
     *     顶/底锚用整屏高 `logicalH()`,与 `HeroSelectView` 内 `placeRect` 的默认 H 同源;
     *  ② 滚动位、预览、热区判定全在 `heroes/HeroSelectModel.ts`,本文件不碰 offset;
     *  ③ 出战写回只经 `model.commit()` → `applyHeroSelection` 这一条路径,存档通道与
     *     菜单/商店一致(读写 `this.sim.save` + `sim.persist()`,不另起第二份存档)。
     */
    private buildHeroesContent(): void {
        const node = this.screenLayer.getChildByName("Screen:heroes");
        if (!node) return;
        node.removeAllChildren();
        const model = new HeroSelectModel();
        this.heroesModel = model;
        this.heroesView = new HeroSelectView(node, this.frames, model, {
            layout: () => model.layout(this.heroSave(), DESIGN_W, logicalH()),
            onAction: (a) => this.onHeroAction(a),
            changed: () => this.syncHeroes(),
        });
        this.heroesView.sync();
    }

    /** 本屏要读的存档字段就这三项;切片对象复用,滚动期间不逐帧分配 */
    private heroSave(): HeroSaveView {
        const s = this.save();
        this.heroSlice.selectedHero = s.selectedHero;
        this.heroSlice.selectedSet = s.selectedSet;
        this.heroSlice.seasonId = s.seasonId;
        return this.heroSlice;
    }

    /** 进屏:预览对齐存档 + 把当前出战那行滚到视口居中,再切屏(路由顺带 refresh 一次) */
    private openHeroes(): void {
        if (!this.heroesModel) return;
        this.heroesModel.open(this.heroSave(), DESIGN_W, logicalH());
        this.router.show("heroes");
    }

    private syncHeroes(): void {
        this.heroesView?.sync();
    }

    /**
     * 热区 → 玩法。与 Web `onHeroesClick` 有一处刻意的差别:「不出战」在 Web 是即刻落盘
     * 回菜单,这里先落到预览位,由「确定」一次性写入,于是误触可撤销(四个热区共用同一条 confirm 出口)。
     */
    private onHeroAction(a: HeroAction): void {
        const m = this.heroesModel;
        if (!m) return;
        switch (a.kind) {
            case "back":
                this.router.show("menu");
                return;
            case "row":
            case "clear":
                if (m.apply(a)) this.syncHeroes();
                return;
            case "confirm":
                m.commit(this.save());
                this.sim?.persist();
                this.router.show("menu");
                return;
        }
    }

    /**
     * 逐帧驱动列表惯性(共享层的纪律是「时间是入参」,视图不会自己推进)。
     * dt 不钳:惯性是解析积分 + 触界即停,长帧只会一次走完,不会穿过边界。
     */
    private tickHeroScroll(dt: number): void {
        const m = this.heroesModel;
        const view = this.heroesView;
        if (!m || !view || this.router.current !== "heroes") return;
        const g = m.scroll.geometry(m.layout(this.heroSave(), DESIGN_W, logicalH()));
        const moved = m.scroll.tick(dt, g);
        // 阻尼位(拖出边界显示的 offset)恒在此收回:与 Web 松手即硬钳同一结果
        const snapped = m.scroll.snap(g);
        if (moved || snapped) view.sync();
    }

    /* ================= 幻影榜屏(Phase 4 首屏:纯只读,零写入) ================= */

    /**
     * 幻影榜屏装配。三层分工与商店/英雄同构:
     *  ① 几何全部来自共享层 `game/ui/leaderboardLayout()`(经 `leaderboardScreenLayout` 单一出口),
     *     顶/底锚用整屏高 `logicalH()`,与视图内 `placeRect` 的默认 H 同源;
     *  ② 文案与命中来自 cc-free 的 `leaderboard/LeaderboardModel.ts`,直读存档派生;
     *  ③ 本屏纯只读:没有任何写回存档的路径,`onLeaderboardAction` 只有「返回」一个出口。
     * 无常驻模型实例(状态全在存档侧),视图每轮 sync 现算 content。
     */
    private buildLeaderboardScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:leaderboard");
        if (!node) return;
        node.removeAllChildren();
        this.leaderboardView = new LeaderboardView(node, this.frames, {
            layout: () => leaderboardScreenLayout(DESIGN_W, logicalH()),
            content: () => buildLeaderboardContent(this.leaderboardSave()),
            onAction: (a) => this.onLeaderboardAction(a),
        });
        this.leaderboardView.sync();
    }

    /** 本屏要读的存档字段就这四项;投影成窄切片交给纯函数 */
    private leaderboardSave(): LeaderboardSaveView {
        const s = this.save();
        return { seasonId: s.seasonId, stageStars: s.stageStars, seasonBest: s.seasonBest, frames: s.frames };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncLeaderboard(现算一帧几何与文案) */
    private openLeaderboard(): void {
        this.router.show("leaderboard");
    }

    private syncLeaderboard(): void {
        this.leaderboardView?.sync();
    }

    /** 热区 → 玩法。纯只读屏只有返回一个动作(对标 Web onLeaderboardClick 的 hitPanelBack) */
    private onLeaderboardAction(a: LeaderboardAction): void {
        if (a.kind === "back") this.router.show("menu");
    }

    /* ================= 每日福利屏(Phase 4 第二屏:广告驱动 + 存档写入) ================= */

    /**
     * 每日福利屏装配。三层分工与排行屏同构:
     *  ① 几何全部来自共享层 `game/ui/dailyLayout.ts`(经 `dailyScreenLayout` 单一出口,
     *     三区行矩形 / 每行两行文本基线 / 标题横幅 / 资源行图标 / 返回钮与 Web 逐项同数),
     *     顶/底锚用整屏高 `logicalH()`,与视图内 `placeRect` 的默认 H 同源;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `daily/DailyModel.ts`;
     *  ③ 模型不碰存档:落字段、`persist()` 与激励视频全在本文件(`commitDailyClaim` / `watchAd`)。
     * 无常驻模型实例(状态全在存档侧),视图每轮 sync 现算 content。
     */
    private buildDailyScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:daily");
        if (!node) return;
        node.removeAllChildren();
        this.dailyView = new DailyView(node, this.frames, {
            layout: () => dailyScreenLayout(DESIGN_W, logicalH(), this.dailySave()),
            content: () => buildDailyContent(this.dailySave()),
            onAction: (a) => this.onDailyAction(a),
        });
        this.dailyView.sync();
    }

    /** 本屏要读的存档字段就这八项;投影成窄切片交给纯函数(时间是入参,不藏在模型里) */
    private dailySave(): DailySaveView {
        const s = this.save();
        return {
            diamond: s.diamond,
            adWatchCount: s.adWatchCount,
            dailyBoxClaimed: s.dailyBoxClaimed,
            dailyTalentClaimed: s.dailyTalentClaimed,
            dailyTalents: s.dailyTalents,
            makeUpDate: s.makeUpDate,
            dailyClearedDate: s.dailyClearedDate,
            highestStage: s.highestStage,
        };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncDaily(现算一帧几何与文案) */
    private openDaily(): void {
        this.router.show("daily");
    }

    private syncDaily(): void {
        this.dailyView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onDailyClick 的四段)。免费档天赋直接落账,宝箱与补领要先看完一次激励视频。
     * 广告闸门只有 `watchAd` 那一道:在途期间同步领取照常执行。模型返回 null 就是
     * "已领取 / 今日不可补领",与 Web 在那里直接 return 同一语义(点了没反应)。
     */
    private onDailyAction(a: DailyAction): void {
        if (a.kind === "back") {
            this.router.show("menu");
            return;
        }
        const claim = dailyClaim(this.dailySave(), a);
        if (!claim) return;
        if (!claim.needsAd) {
            this.commitDailyClaim(claim);
            return;
        }
        this.watchAd(
            () => this.commitDailyClaim(claim),
            () => this.toast("广告未看完,奖励未入账")
        );
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。补领那一档同时写上
     * `dailyClearedDate` / `dailyClearedStage` / `makeUpDate` —— 与 Web 同口径:
     * 看广告补领等于把当日首通视为已消耗,所以当日再通关不再发首通奖励。
     */
    private commitDailyClaim(claim: DailyClaim): void {
        const save = this.save();
        save.gachaTicket += claim.gachaTicket;
        save.stardust += claim.stardust;
        save.diamond += claim.diamond;
        save.points += claim.points;
        save.dayEcho += claim.dayEcho;
        if (claim.boxClaim) save.dailyBoxClaimed.push(claim.boxClaim);
        if (claim.talentClaim) save.dailyTalentClaimed.push(claim.talentClaim);
        if (claim.makeUp) {
            save.dailyClearedDate = claim.makeUp.date;
            save.dailyClearedStage = claim.makeUp.stageId;
            save.makeUpDate = claim.makeUp.date;
        }
        this.sim?.persist();
        this.syncDaily();
        // 主菜单「每日」入口的红点读 dailyBoxClaimed,入账后一并重算
        this.refreshMenu();
    }

    /* ================= 赛季通行证屏(Phase 4 第三屏:双轨领取 + 广告激活) ================= */

    /**
     * 通行证屏装配。三层分工与每日屏同构:
     *  ① 几何全部来自共享层 `game/ui/passLayout.ts`(经 `passScreenLayout` 单一出口,激活行矩形 /
     *     档位行三段文本与右列两档基线 / 总进度条 / 返回钮与 Web 逐项同数),这一屏行数恒定,
     *     几何不依赖存档,故宿主直接调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `pass/PassModel.ts`;
     *  ③ 模型不碰存档:落字段、`persist()` 与激励视频全在本文件(`commitPassClaim` / `watchAd`)。
     * 无常驻模型实例(状态全在存档侧),视图每轮 sync 现算 content。
     */
    private buildPassScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:pass");
        if (!node) return;
        node.removeAllChildren();
        this.passView = new PassView(node, this.frames, {
            layout: () => passScreenLayout(DESIGN_W, logicalH()),
            content: () => buildPassContent(this.passSave()),
            onAction: (a) => this.onPassAction(a),
        });
        this.passView.sync();
    }

    /** 本屏要读的存档字段就这七项(`stageStars` 是累计回响的星数加权项);投影成窄切片交给纯函数 */
    private passSave(): PassSaveView {
        const s = this.save();
        return {
            points: s.points,
            dayEcho: s.dayEcho,
            stageStars: s.stageStars,
            seasonId: s.seasonId,
            premiumPass: s.premiumPass,
            premiumPassSeason: s.premiumPassSeason,
            passTier: s.passTier,
        };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncPass(现算一帧几何与文案) */
    private openPass(): void {
        this.router.show("pass");
    }

    private syncPass(): void {
        this.passView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onPassClick 的三段:返回钮 → 激活行 → 其余一律领下一档)。
     * 领取不要看广告,激活要先看完一次激励视频(广告闸门只有 `watchAd` 那一道)。
     * 模型返回 null 就是"档位不存在 / 进度不够 / 高级轨已生效",与 Web 在那里直接 return
     * 同一语义(点了没反应)。
     */
    private onPassAction(a: PassAction): void {
        if (a.kind === "back") {
            this.router.show("menu");
            return;
        }
        const claim = passClaim(this.passSave(), a);
        if (!claim) return;
        if (!claim.needsAd) {
            this.commitPassClaim(claim);
            return;
        }
        this.watchAd(
            () => this.commitPassClaim(claim),
            () => this.toast("广告未看完,奖励未入账")
        );
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。激活只写 `premiumPassSeason = seasonId`
     * (赛季翻页只递增 seasonId,比较自然转假,不需要任何重置代码);领取按倍率加券与星尘
     * 并把 `passTier` 推进一档 —— 与 Web 的 `+= tier.tickets * mult` 逐字段同式。
     */
    private commitPassClaim(claim: PassClaim): void {
        const save = this.save();
        save.gachaTicket += claim.gachaTicket;
        save.stardust += claim.stardust;
        save.passTier += claim.passTierDelta;
        if (claim.premiumPassSeason !== null) save.premiumPassSeason = claim.premiumPassSeason;
        this.sim?.persist();
        this.syncPass();
        // 主菜单「通行证」入口的文字按 premiumActive() 决定要不要带 ★,激活后一并重算
        this.refreshMenu();
    }

    /* ================= 装备升级屏(Phase 4 第四屏:星尘消费 + 无广告位) ================= */

    /**
     * 装备升级屏装配。三层分工与前三屏同构:
     *  ① 几何全部来自共享层 `game/ui/gearUpLayout.ts`(经 `gearUpScreenLayout` 单一出口,面板键与
     *     矩形 / 头部三线 / 每行的品质框与升级钮与徽记槽 / 空态与截断提示 / 返回钮与 Web 逐项同数)。
     *     这一屏的几何要按 `ownedGear.length` 现算(行数与截断提示都由它推出),故与每日屏一样
     *     经宿主投影出存档切片再调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `gearup/GearUpModel.ts`;
     *  ③ 模型不碰存档:落字段与 `persist()` 全在本文件(`commitGearUpClaim`)。
     *     **本屏没有广告位**,所以不走 `watchAd`,也就没有 `adPending` 之外的广告分支。
     * 无常驻模型实例(状态全在存档侧),视图每轮 sync 现算 content。
     */
    private buildGearUpScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:gearup");
        if (!node) return;
        node.removeAllChildren();
        this.gearUpView = new GearUpView(node, this.frames, {
            layout: () => gearUpScreenLayout(DESIGN_W, logicalH(), this.gearUpSave().ownedGear.length),
            content: () => buildGearUpContent(this.gearUpSave()),
            onAction: (a) => this.onGearUpAction(a),
        });
        this.gearUpView.sync();
    }

    /** 本屏要读的存档字段就这三项;投影成窄切片交给纯函数(等级字典按装备名索引) */
    private gearUpSave(): GearUpSaveView {
        const s = this.save();
        return {
            stardust: s.stardust,
            gearLevels: s.gearLevels,
            ownedGear: s.ownedGear,
        };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncGearUp(现算一帧几何与文案) */
    private openGearUp(): void {
        this.router.show("gearup");
    }

    private syncGearUp(): void {
        this.gearUpView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onGearUpClick 的两段:返回钮 → 逐行只比升级钮矩形)。
     * 行矩形不参与命中,点行内非按钮区与屏内空白都拿不到动作。
     * 模型返回 null 就是"取不到装备 / 已满级 / 星尘不足",与 Web 在扣费前直接 return
     * 同一语义(点了没反应)。
     */
    private onGearUpAction(a: GearUpAction): void {
        if (a.kind === "back") {
            this.router.show("menu");
            return;
        }
        const claim = gearUpClaim(this.gearUpSave(), a);
        if (!claim) return;
        this.commitGearUpClaim(claim);
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方):扣 `stardust`、把 `gearLevels[装备名]`
     * 写成 lv + 1 —— 与 Web 的 `save.stardust -= cost; save.gearLevels[eq.name] = lv + 1;
     * persistSave(save)` 逐字段同式。收藏加成由 `collectionBonus` 在读取侧现算,这里不动它。
     */
    private commitGearUpClaim(claim: GearClaim): void {
        const save = this.save();
        save.stardust -= claim.stardustCost;
        save.gearLevels[claim.gearLevelKey] = claim.gearLevelTo;
        this.sim?.persist();
        this.syncGearUp();
        // 主菜单顶栏的星尘读数直接读 save.stardust,扣费后一并重算
        this.refreshMenu();
    }

    /* ================= 扭蛋机屏(Phase 4 第五屏:抽取入收藏 + 每日一次广告抽) ================= */

    /**
     * 扭蛋机屏装配。三层分工与前四屏同构:
     *  ① 几何全部来自共享层 `game/ui/gachaLayout.ts`(经 `gachaScreenLayout` 单一出口,面板底 /
     *     横幅与标题两档 / 券数图标两档 / 三枚钮与换券条 / 双保底条 / 最近抽取逐行 / 收藏行 /
     *     返回钮与 Web 逐项同数)。这一屏的几何要按 `ownedGear` 的 id 列表与瞬时最近结果条数
     *     现算(行区顶缘随后者在 354 与 434 之间跳),故与每日屏一样经宿主投影出切片再调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `gacha/GachaModel.ts`(抽取本身在共享层
     *     `game/data/gacha.ts` 的 `drawGacha` / `drawGacha10` 里,模型只是带着一次性拷贝的 pity 调它);
     *  ③ 模型不碰存档:落字段、`persist()` 与激励视频全在本文件(`commitGachaClaim` / `watchAd`)。
     * 无常驻模型实例(收藏与保底全在存档侧),唯一的屏内瞬时态是 `this.gachaResults`(不入档)。
     */
    private buildGachaScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:gacha");
        if (!node) return;
        node.removeAllChildren();
        this.gachaView = new GachaView(node, this.frames, {
            layout: () => gachaScreenLayout(DESIGN_W, logicalH(), this.gachaSave().ownedGear.map((g) => g.id), this.gachaResults.length),
            content: (L) => buildGachaContent(this.gachaSave(), this.gachaResults, L),
            onAction: (a) => this.onGachaAction(a),
        });
        this.gachaView.sync();
    }

    /** 本屏要读的存档字段就这八项;投影成窄切片交给纯函数(收藏加成与品质名都由共享层现算) */
    private gachaSave(): GachaSaveView {
        const s = this.save();
        return {
            gachaTicket: s.gachaTicket,
            gachaPityEpic: s.gachaPityEpic,
            gachaPityLegendary: s.gachaPityLegendary,
            dailyGachaAdUsed: s.dailyGachaAdUsed,
            diamond: s.diamond,
            highestStage: s.highestStage,
            ownedGear: s.ownedGear,
            selectedGearId: s.selectedGearId,
        };
    }

    /** 进屏:先清掉上一次的最近结果(Web `openGacha` 就是 `gachaResults = []` 再切屏),再触发路由 refresh */
    private openGacha(): void {
        this.gachaResults = [];
        this.router.show("gacha");
    }

    private syncGacha(): void {
        this.gachaView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onGachaClick 的七段:返回 → 单抽 → 十连 → 广告抽 → 钻石换券 →
     * 逐行切换带入 → 热区外什么都不做)。广告闸门只有 `watchAd` 那一道,在途期间同步动作照常执行。
     * 模型返回 null 就是"券不足 / 广告已用 / 钻石不足",与 Web 在扣费前 `return` 同一语义。
     */
    private onGachaAction(a: GachaAction): void {
        if (a.kind === "back") {
            this.router.show("menu");
            return;
        }
        const claim = gachaClaim(this.gachaSave(), this.gachaResults, a);
        if (!claim) return;
        if (!claim.needsAd) {
            this.commitGachaClaim(claim);
            return;
        }
        this.watchAd(
            () => this.commitGachaClaim(claim),
            () => this.toast("广告未看完,奖励未入账")
        );
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。三档各自的账面:
     *  - `draw`:扣 `gachaTicket`(广告抽为 0)、把两个保底计数写成模型给的目标值、按序 push
     *    新装备并逐件登记词缀图鉴(= Web 的 `recordEquipment`,经 `sim.world.recordEquipment`
     *    这条已落地口走)、累加重复折算的 `stardust`、覆写瞬时态 `gachaResults`;广告抽还要
     *    置上 `dailyGachaAdUsed` 并**再落一次盘**(Web 的 `doGachaAd` 自己 persist 一次,
     *    回调里又 persist 一次,一次广告抽共落两次盘 —— 照抄,不合并);
     *  - `ticket`:扣 `diamond`、`gachaTicket` +1;
     *  - `select`:只改 `selectedGearId`(同 id 再点就是取消带入)。
     * 收藏加成由 `collectionBonus` 在读取侧现算,这里不动它。
     */
    private commitGachaClaim(claim: GachaClaim): void {
        const save = this.save();
        if (claim.kind === "draw") {
            save.gachaTicket -= claim.ticketCost;
            save.gachaPityEpic = claim.pityEpic;
            save.gachaPityLegendary = claim.pityLegendary;
            save.stardust += claim.stardustGain;
            for (const eq of claim.newGear) {
                save.ownedGear.push(eq);
                this.sim?.world.recordEquipment(eq);
            }
            this.gachaResults = claim.recent;
            this.sim?.persist();
            if (claim.markAdUsed) {
                save.dailyGachaAdUsed = true;
                this.sim?.persist();
            }
        } else if (claim.kind === "ticket") {
            save.diamond -= claim.diamondCost;
            save.gachaTicket += claim.ticketGain;
            this.sim?.persist();
        } else {
            save.selectedGearId = claim.selectedGearId;
            this.sim?.persist();
        }
        this.syncGacha();
        // 主菜单顶栏的券数与钻石读数直接读这两个字段,消费后一并重算
        this.refreshMenu();
    }

    /* ================= 转生与天赋屏(Phase 4 第六屏:买天赋入档 + 开局配置瞬时态) ================= */

    /**
     * 转生与天赋屏装配。三层分工与前五屏同构:
     *  ① 几何全部来自共享层 `game/ui/prestigeLayout.ts`(经 `prestigeScreenLayout` 单一出口,面板底 /
     *     横幅与标题两档 / 头部小立绘与四行信息 / 页签整条打底与逐签覆盖层 / 节点行两行基线与右列两档
     *     与勾选标记盒 / 两个开局配置块 / 开始新轮回钮与 Web 逐项同数)。这一屏的几何要按**当前系的
     *     id 序列**与**两个条件块在不在**现算(行区预算底缘随后者在三档之间跳),故与每日 / 扭蛋屏一样
     *     经宿主投影出存档切片再调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `prestige/PrestigeModel.ts`(可支配点数、层级门、
     *     路线总价与图鉴四个分母全部走既有函数,本文件不复制判据);
     *  ③ 模型不碰存档:落字段、`persist()` 与开局加成全在本文件(`commitPrestigeClaim`)。
     *     **本屏没有广告位**,也就没有 `watchAd` 分支。
     * 无常驻模型实例(拥有的天赋与回响都在存档侧),屏内两份瞬时态是 `this.talentRoute` 与
     * `this.runConfig`(都不入档,与 Web 同形)。
     */
    private buildPrestigeScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:prestige");
        if (!node) return;
        node.removeAllChildren();
        this.prestigeView = new PrestigeView(node, this.frames, {
            layout: () => {
                const s = this.prestigeSave();
                return prestigeScreenLayout(DESIGN_W, logicalH(), prestigeRouteIds(this.talentRoute), s.hasBlueprint, s.hasTargetedSearch);
            },
            content: (L) => buildPrestigeContent(this.prestigeSave(), this.talentRoute, this.runConfig, L),
            onAction: (a) => this.onPrestigeAction(a),
        });
        this.prestigeView.sync();
    }

    /** 本屏要读的存档字段就三项,外加共享层算出的两个条件块标志;投影成窄切片交给纯函数 */
    private prestigeSave(): PrestigeSaveView & { hasBlueprint: boolean; hasTargetedSearch: boolean } {
        const s = this.save();
        const blocks = prestigeBlocks(s);
        return { points: s.points, ownedTalents: s.ownedTalents, collection: s.collection, ...blocks };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncPrestige(现算一帧几何与文案) */
    private openPrestige(): void {
        this.router.show("prestige");
    }

    private syncPrestige(): void {
        this.prestigeView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onPrestigeClick 的五段:页签 → 逐行买天赋 → 触发器钮 → 效果钮 →
     * 开始新轮回钮;热区外什么都不做)。广告在途先吞掉整屏点击,与已落地四屏同口径。
     * **本屏没有返回钮**:屏内唯一的离开出口是"开始新轮回",而它重开一局、不回主菜单 ——
     * 这条是 Web 原样(见 `docs/COCOS-MIGRATION.md` §8)。
     * `prestigeClaim` 返回 null 就是"已拥有 / 点数不够 / 层级未解锁 / 那一下是开始新轮回",
     * 与 Web 在守卫处直接 `return` 同一语义(点了没反应)。
     */
    private onPrestigeAction(a: PrestigeAction): void {
        if (a.kind === "start") {
            // Web 的 startNewRun() 就是 restart():只重开一局。restartRun 首行会 settlePendingRun()
            // (与 Web restart() 同位),而它有 `if (!pendingSettle) return` 守在前头 —— 从主菜单的
            // 「天赋」入口进本屏时挂起标记是假的,于是点这个钮**不会**使 prestiges +1,与 Web 同一结果。
            // 只有带着未结算的死亡局进本屏时才会结一次,那正是 Web 在进屏那一步(hitTalentsBtn)结掉的同一笔。
            this.restartRun();
            return;
        }
        const claim = prestigeClaim(this.prestigeSave(), this.runConfig, a);
        if (!claim) return;
        this.commitPrestigeClaim(claim);
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。三档各自的账面:
     *  - `talent`:唯一入档的一档 —— `ownedTalents.push(id)` 后调 `world.applyTalentBonuses()`
     *    (与 Web `buyTalent` 同序),再落一次盘;回响点数**不扣减**(可支配是派生量);
     *  - `tab` / `trigger` / `effect`:只改宿主持有的瞬时态,`persists === false`,不落盘。
     */
    private commitPrestigeClaim(claim: PrestigeClaim): void {
        if (claim.kind === "talent") {
            const save = this.save();
            save.ownedTalents.push(claim.id);
            this.sim?.world.applyTalentBonuses();
            this.sim?.persist();
        } else if (claim.kind === "tab") {
            this.talentRoute = claim.route;
        } else if (claim.kind === "trigger") {
            this.runConfig.targetTrigger = claim.targetTrigger;
        } else {
            this.runConfig.blueprintEffect = claim.blueprintEffect;
        }
        this.syncPrestige();
        // 主菜单顶栏的回响读数直接读 points,而它的"已用"由 ownedTalents 派生,买完一并重算
        this.refreshMenu();
    }

    /* ================= 委托挂机屏(Phase 4 第七屏:派遣 / 领取 / 放弃入档 + 选中态瞬时) ================= */

    /**
     * 委托挂机屏装配。三层分工与前六屏同构:
     *  ① 几何全部来自共享层 `game/ui/commissionLayout.ts`(经 `commissionScreenLayout` 单一出口,
     *     面板底 / 横幅与标题两档 / 头部小立绘与三项读数 / 兑换钮 / 返回钮与两档文字位 /
     *     逐面板的三行基线与进度条与两枚钮 / 区域行与难度钮与开始钮,与 Web 逐项同数)。
     *     这一屏的几何要按**活动槽位数**现算(面板条数 0 / 1 / 2,两个分支的矩形互斥),
     *     故与每日 / 扭蛋 / 转生屏一样经宿主投影出存档切片再调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `commission/CommissionModel.ts`(区域与难度查表、
     *     解锁门、天赋加成四项、衰减曲线与产出、券数全部走既有函数,本文件不复制判据);
     *  ③ 模型不碰存档:落字段与 `persist()` 全在本文件(`commitCommissionClaim`)。
     *     **本屏没有广告位**,也就没有 `watchAd` 分支。
     * 时间与随机源都在这一层注入:内容按 `Date.now()` 现算,领取的失败 roll 走模型默认形参。
     * 无常驻模型实例(委托与碎片都在存档侧),屏内一份瞬时态是 `this.commSel`(不入档,与 Web 同形)。
     */
    private buildCommissionScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:commission");
        if (!node) return;
        node.removeAllChildren();
        this.commissionView = new CommissionView(node, this.frames, {
            layout: () => commissionScreenLayout(DESIGN_W, logicalH(), commissionSlots(this.commissionSave()).length),
            content: (L) => buildCommissionContent(this.commissionSave(), this.commSel, Date.now(), L),
            onAction: (a) => this.onCommissionAction(a),
        });
        this.commissionView.sync();
    }

    /** 本屏要读的存档字段就这六项;投影成窄切片交给纯函数(`diamond` / `gachaTicket` 只写不读) */
    private commissionSave(): CommissionSaveView {
        const s = this.save();
        return {
            fragments: s.fragments,
            stardust: s.stardust,
            prestiges: s.prestiges,
            ownedTalents: s.ownedTalents,
            commission: s.commission,
            commission2: s.commission2,
        };
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncCommission(现算一帧几何与文案) */
    private openCommission(): void {
        this.commTick = 0;
        this.router.show("commission");
    }

    private syncCommission(): void {
        this.commissionView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onCommissionClick 的六段:返回钮 → 逐面板领取 / 放弃 → 区域行 →
     * 难度钮 → 开始钮 → 兑换钮;面板态在面板循环之后直接收口,兑换钮虽然照画却不参与命中)。
     * 广告在途先吞掉整屏点击,与已落地五屏同口径。
     * 返回钮回主菜单:Cocos 侧本屏只从主菜单进入,Web 的 `overlayFrom` 三态在这里恒为 `"menu"`。
     * `commissionClaim` 返回 null 就是"区域锁定 / 槽位已满且没有双委托 / 碎片不够兑换",
     * 与 Web 在那里直接 `return` 同一语义(点了没反应,全程无提示)。
     */
    private onCommissionAction(a: CommissionAction): void {
        if (a.kind === "back") {
            this.router.show("menu");
            return;
        }
        const claim = commissionClaim(this.commissionSave(), this.commSel, a, Date.now());
        if (!claim) return;
        this.commitCommissionClaim(claim);
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。六档各自的账面:
     *  - `start`:把模型给的那一枚 `CommissionState` 写进它选定的槽位(`commission` 优先,
     *    否则 `commission2`),`startedAt` 就是动作发生时的 `Date.now()`;
     *  - `collect`:产出按区域分流到 `fragments` / `stardust` / `diamond` 三个字段之一,
     *    再加 `gachaTicket`,随后清空该槽 —— 与 Web `collectCommission` 逐字段同式,
     *    失败只体现在产出减半,不额外扣分;
     *  - `abandon`:只清空该槽,不发奖、无确认弹窗;
     *  - `exchange`:扣 `n × FRAGMENT_TO_STARDUST` 碎片、加 `n` 星尘;
     *  - `region` / `difficulty`:只改宿主持有的瞬时态,`persists === false`,不落盘。
     */
    private commitCommissionClaim(claim: CommissionClaim): void {
        if (claim.kind === "region") {
            this.commSel.region = claim.region;
        } else if (claim.kind === "difficulty") {
            this.commSel.difficulty = claim.difficulty;
        } else {
            const save = this.save();
            if (claim.kind === "start") {
                save[claim.slot] = { ...claim.state };
            } else if (claim.kind === "collect") {
                save.fragments += claim.fragments;
                save.stardust += claim.stardust;
                save.diamond += claim.diamond;
                save.gachaTicket += claim.gachaTicket;
                save[claim.slot] = null;
            } else if (claim.kind === "abandon") {
                save[claim.slot] = null;
            } else {
                save.fragments -= claim.fragmentsCost;
                save.stardust += claim.stardustGain;
            }
            this.sim?.persist();
        }
        this.commTick = 0;
        this.syncCommission();
        // 主菜单委托钮的红点读两个槽位的 startedAt,顶栏的碎片与星尘读数直接读这两个字段
        this.refreshMenu();
    }

    /**
     * 委托面板的实时读数(Web 逐帧重绘,时数文本与进度条一直在走)。只有面板态需要:
     * 列表态没有任何随时间变的文案。节奏见 `COMMISSION_TICK_SECONDS`。
     */
    private tickCommission(dt: number): void {
        const view = this.commissionView;
        if (!view || this.router.current !== "commission") return;
        this.commTick += dt;
        if (this.commTick < COMMISSION_TICK_SECONDS) return;
        this.commTick = 0;
        // 只有面板态有随时间变的读数:列表态跳过这一次重排
        if (commissionSlots(this.commissionSave()).length === 0) return;
        view.sync();
    }

    /* ================= 词缀融合屏(Phase 4 第八屏:融合出成品入局内装备 + 保底三选一暂存) ================= */

    /**
     * 词缀融合屏装配。三层分工与前七屏同构:
     *  ① 几何全部来自共享层 `game/ui/fusionLayout.ts`(经 `fusionScreenLayout` 单一出口,面板底 /
     *     标题横幅 / 星尘读数 / 返回钮 / 逐行矩形与两行基线与名字两档 / 底部三形态的全部文本线
     *     与模式钮与融合钮 / 三选一卡片与弹层两行,与 Web 逐项同数)。这一屏的几何要按**局内装备
     *     的 id 序列**与**弹层 / 三重态两个形态位**现算(行条数随前者变,命中分派随后者变),
     *     故与每日 / 扭蛋 / 转生 / 委托屏一样经宿主投影出切片再调共享层出口;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `fusion/FusionModel.ts`(成本、解锁门、融合执行、
     *     继承源、保底推进、候选抽取与落词缀全部走共享层既有函数,本文件不复制判据);
     *  ③ 模型不碰存档也不碰局内装备:扣星尘、写 `fusionPity`、增删装备、`recordEquipment` 与
     *     `persist()` 全在本文件(`commitFusionClaim`)。**本屏没有广告位**,也就没有 `watchAd` 分支。
     * 本屏没有 `Date.now()` 消费点(无实时读数),随机源只有保底三选一的候选抽取,走模型默认形参。
     * 无常驻模型实例(星尘与保底计数在存档侧、装备列表在局内侧),屏内三份瞬时态是
     * `this.fusSel` / `this.fusMode` / `this.fusPending`(都不入档,与 Web 同形)。
     */
    private buildFusionScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:fusion");
        if (!node) return;
        node.removeAllChildren();
        this.fusionView = new FusionView(node, this.frames, {
            layout: () =>
                fusionScreenLayout(DESIGN_W, logicalH(), this.fusionEquipment().map((e) => e.id), {
                    hidden: this.fusPending !== null,
                    triple: fusionTripleArmed(this.fusSel, this.fusionSave().ownedTalentCount),
                }),
            content: (L) => buildFusionContent(this.fusionSave(), this.fusionEquipment(), this.fusSel, this.fusMode, this.fusPending, L),
            onAction: (a) => this.onFusionAction(a),
        });
        this.fusionView.sync();
    }

    /** 本屏要读的存档字段就这三项(`ownedTalents` 只取长度:三重解锁门的唯一消费口径) */
    private fusionSave(): FusionSaveView {
        const s = this.save();
        return { stardust: s.stardust, fusionPity: s.fusionPity, ownedTalentCount: s.ownedTalents.length };
    }

    /**
     * 本屏操作的装备列表是**局内态**(Web 的 `this.player.equipment`,战斗层持有),
     * 不是存档里的永久收藏 `ownedGear`;getter 现取,与商店屏的 ShopWorld 同一条口。
     */
    private fusionEquipment(): Equipment[] {
        return this.sim ? this.sim.player.equipment : [];
    }

    /** 进屏:清空选中与三选一暂存再切屏(Web openFusion 同序;tripleMode 不清,跨开屏保留) */
    private openFusion(): void {
        const sim = this.sim;
        // Web openFusion 首行守卫:不足 2 件装备不开屏,全程静默
        if (!sim || sim.player.equipment.length < 2) return;
        this.fusSel = { ...FUSION_DEFAULT_SELECTION };
        this.fusPending = null;
        this.router.show("fusion");
    }

    private syncFusion(): void {
        this.fusionView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onFusionClick 的五段:三选一卡片 → 返回钮 → 装备行 → (三重态)模式钮 →
     * 融合钮;弹层打开时只响应卡片,其余一律吞掉)。**本屏没有广告位**,action 里也没有
     * `adPending` 闸门 —— 闸门只有 `watchAd` 首行那一道,与已落地各屏同口径。
     * 返回钮回章间商店:Web 的 `overlayFrom` 两态里本屏唯一活着的入口是商店工具钮
     * (`openFusion("shop")`,战斗内入口已移除),那一态恒为 `"shop"`。
     * `fusionClaim` 返回 null 就是"素材带隐藏词缀 / 素材落空 / 星尘不足 / 暂存落空",
     * 与 Web 在那里直接 `return` 同一语义(点了没反应,全程无提示)。
     */
    private onFusionAction(a: FusionAction): void {
        if (a.kind === "back") {
            this.router.show("shop");
            return;
        }
        const claim = fusionClaim(this.fusionSave(), this.fusionEquipment(), this.fusSel, this.fusMode, this.fusPending, a);
        if (!claim) return;
        this.commitFusionClaim(claim);
    }

    /**
     * 照着模型给的意图落账(壳层是唯一的写入方)。四档各自的账面:
     *  - `fuse`:扣 `stardust`、把 `fusionPity` 写成模型给的目标值(触达即归零)、按 `removeIds`
     *    从局内装备**原地**移除素材(数组身份由世界层持有,与 Web 的 filter 重赋同结果);
     *    未触达保底 → 成品 push 入场、`recordEquipment` 登记词缀图鉴、落一次盘、清选中态;
     *    触达保底 → 成品暂存 `this.fusPending`、**不落盘也不清选中**(Web afterFusionRoll 的
     *    hitsPity 分支:素材已移除但成品未入场、存档未落,等三选一收尾);
     *  - `pickHidden`:`applyHiddenAffix` 后的成品入场、登记图鉴、落盘(星尘与保底那两笔在
     *    `fuse` 档已经改过内存,这一发 `persist()` 一起落 —— 与 Web 的落盘节奏同数),
     *    随后清暂存与选中态;
     *  - `select` / `mode`:只改宿主持有的瞬时态,`persists === false`,不落盘。
     */
    private commitFusionClaim(claim: FusionClaim): void {
        if (claim.kind === "select") {
            this.fusSel = claim.sel;
        } else if (claim.kind === "mode") {
            this.fusMode = claim.mode;
        } else if (claim.kind === "fuse") {
            const save = this.save();
            save.stardust -= claim.stardustCost;
            save.fusionPity = claim.fusionPityTo;
            const eq = this.fusionEquipment();
            for (let i = eq.length - 1; i >= 0; i--) if (claim.removeIds.includes(eq[i].id)) eq.splice(i, 1);
            if (claim.pending) {
                this.fusPending = claim.pending;
            } else if (claim.result) {
                eq.push(claim.result);
                this.sim?.world.recordEquipment(claim.result);
                this.sim?.persist();
            }
            if (claim.clearSelection) this.fusSel = { ...FUSION_DEFAULT_SELECTION };
        } else {
            const eq = this.fusionEquipment();
            eq.push(claim.result);
            this.sim?.world.recordEquipment(claim.result);
            this.sim?.persist();
            this.fusPending = null;
            this.fusSel = { ...FUSION_DEFAULT_SELECTION };
        }
        this.syncFusion();
        // 主菜单顶栏的星尘读数直接读 save.stardust,扣费后一并重算
        this.refreshMenu();
    }

    /* ================= 赛季结算屏(Phase 4 第九屏:到期翻页入账 + 无手动入口) ================= */

    /**
     * 赛季结算屏装配。三层分工与前八屏同构:
     *  ① 几何全部来自共享层 `game/ui/seasonLayout.ts`(经 `seasonScreenLayout` 单一出口,徽标盒 /
     *     横幅盒 / 标题与摘要四行与贴底钮及其文字位,与 Web 逐项同数)。本屏内容条数不随存档变
     *     (恒为徽标 + 横幅 + 标题 + 四行摘要 + 一枚钮),几何入参只有一个摘要形态位,
     *     所以不像每日 / 扭蛋 / 融合屏那样把条数传进去;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `season/SeasonModel.ts`(到期判据、赛季分、
     *     星尘折算与主题名全部走共享层既有函数,本文件不复制任何一条规则);
     *  ③ 模型不碰存档:落 `stardust` / `seasonId` / `seasonStartAt` / `stageStars` / `seasonBest`
     *     与 `persist()` 全在本文件(`commitSeasonRoll`)。**本屏没有广告位**,也就没有 `watchAd` 分支。
     * **本屏没有手动入口**:Web 侧唯一的进屏路径是翻页判定写下摘要后那句
     * `if (seasonSummary && state === "menu") state = "season"`(主菜单、HUD、任何钮都不指向它),
     * Cocos 侧同构 —— `tickSeason` 每帧跑在路由闸门之前,真翻页时先落账、再按同一条件自动弹屏。
     * 复核要构造触发条件:把存档的 `seasonStartAt` 往前推过 `SEASON_DAYS × DAY_MS` 整,
     * 或直接调 `openSeason()`(它就是把屏切过去,不产生任何写入)。
     */
    private buildSeasonScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:season");
        if (!node) return;
        node.removeAllChildren();
        this.seasonView = new SeasonView(node, this.frames, {
            layout: () => seasonScreenLayout(DESIGN_W, logicalH(), this.seasonSummary !== null),
            content: (L) => buildSeasonContent(this.seasonSave(), this.seasonSummary, L),
            onAction: (a) => this.onSeasonAction(a),
        });
        this.seasonView.sync();
    }

    /** 本屏要读的存档字段就这五项(五项也都在这一屏被写,摘要是会话态、不在存档里);`tickSeason` 逐帧调它,故覆写复用切片 */
    private seasonSave(): SeasonSaveView {
        const s = this.save();
        const slice = this.seasonSlice;
        slice.seasonId = s.seasonId;
        slice.seasonStartAt = s.seasonStartAt;
        slice.stageStars = s.stageStars;
        slice.seasonBest = s.seasonBest;
        slice.stardust = s.stardust;
        return slice;
    }

    /** 进屏:切屏即触发路由 refresh 钩子 → syncSeason(现算一帧几何与文案)。没有第二个调用方(本屏无手动入口) */
    private openSeason(): void {
        this.router.show("season");
    }

    /**
     * 到期翻页的每帧判定,排在路由闸门之前 —— Web 的 `syncSeason` 在 `update()` 里任何状态下都跑,
     * 所以停在菜单 / 通行证 / 排行这类非战斗屏跨了赛季也要照常翻页(与 `syncDaily` 同一条口)。
     * 真翻页时先落账,再按 Web 那句 `seasonSummary && state === "menu"` 自动弹屏;
     * 弹屏之后 `commitSeasonRoll` 留在档上的账就是既成事实,贴底钮那一下只收起摘要。
     */
    private tickSeason(): void {
        const claim = seasonRoll(this.seasonSave(), Date.now());
        if (!claim) return;
        this.commitSeasonRoll(claim);
        // 赛季字段被多张只读屏直接消费(排行榜号与分数、通行证高级轨的归属赛季、英雄解锁季、
        // 主菜单赛季行):Web 靠逐帧重绘自然跟上,Cocos 侧翻页这一帧必须显式重排当前屏,
        // 否则读数会停在已结算的那个赛季(与 syncDaily 之后重排 daily / gacha 同一理由)
        this.router.refresh();
        if (this.seasonSummary && this.router.current === "menu") this.openSeason();
    }

    private syncSeason(): void {
        this.seasonView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web onSeasonClick + closeSeason:整屏只有贴底那一枚钮,钮外一律吞掉)。
     * 收起摘要与切回主菜单都不写存档,所以这一支不产写入意图;返回落点恒为主菜单 ——
     * Web 的 `closeSeason` 写的就是 `state = "menu"`,本屏没有 `overlayFrom` 这一档。
     * **本屏没有广告位**,action 里也没有 `adPending` 闸门 —— 闸门只有 `watchAd` 首行那一道。
     */
    private onSeasonAction(a: SeasonAction): void {
        if (a.kind !== "close") return;
        this.seasonSummary = null;
        this.router.show("menu");
    }

    /**
     * 照着翻页意图落账(壳层是唯一的写入方)。五笔账面与 Web `syncSeason` 循环体的收尾段
     * 逐字段对应:`stardust` 累加、`seasonId` 与 `seasonStartAt` 各推进 `rolls` 格、
     * `stageStars` 换成八格全零、`seasonBest` 归零;随后作废幻影榜的名次提示
     * (`rankImprovedTo`,赛季翻页换榜,旧提示不再成立)、落一次盘、记下摘要。
     * 摘要与"当前显示哪张屏"都不入档,所以 `seasonSummary` 只在内存里。
     */
    private commitSeasonRoll(claim: SeasonRollClaim): void {
        const save = this.save();
        save.stardust += claim.stardustGain;
        save.seasonId = claim.seasonIdTo;
        save.seasonStartAt = claim.seasonStartAtTo;
        save.stageStars = claim.starsTo;
        save.seasonBest = claim.seasonBestTo;
        this.sim.rankImprovedTo = null;
        this.sim.persist();
        this.seasonSummary = claim.summary;
        this.syncSeason();
        // 主菜单顶栏的星尘读数与赛季行(S{id} · 主题 · 第 N/14 天 · 赛季分)都直接读这几个字段
        this.refreshMenu();
    }

    /* ================= 死亡结算屏(Phase 5:三出口 + 两处广告位,阵亡即弹) ================= */

    /**
     * 死亡结算屏装配。三层分工与前九屏同构:
     *  ① 几何全部来自共享层 `game/ui/gameOverLayout.ts`(经 `gameOverScreenLayout` 单一出口,横幅盒 /
     *     立绘盒 / 标题与四行读数 / 复活钮与三钮行与贴底双倍钮及其文字位,与 Web 逐项同数)。
     *     本屏内容条数不随存档变(只有「最佳纪录」与「名次提示」两行有没档),几何入参是两个形态位;
     *  ② 文案、命中与**写入意图**来自 cc-free 的 `gameover/GameOverModel.ts`(复活上限、回响折算、
     *     mm:ss 格式全部走既有函数,本文件不复制判据);
     *  ③ 模型不碰存档:落 `points` / `dayEcho` 与 `persist()` 在本文件(`commitGameOverEcho`),
     *     死亡本账那一笔在战斗层(`sim.settlePendingRun`,54dc2a6 已落),宿主只在三个出口前调它。
     * **进屏判据不在本屏也不在宿主**:Web 是 `onDeath()` 里那句 `state = "gameover"`,Cocos 侧同位
     * —— 战斗层的 `BattleSim.onDeath`(由共享世界层的 `onPlayerDown` 与 `onStageFailed` 两条事件汇流)
     * 抛 `cb.onDeath` 时已把 `world.over` / `pendingSettle` / 预计算回响 / 名次提示四件事做完,
     * 宿主回调只有一句 `openGameOver()`,所以「什么时候该弹屏」这一条两端同一事实源。
     * **本屏有两个广告位**(复活 / 双倍),都走 `watchAd` 唯一入口;闸门只有它首行那一道。
     */
    private buildGameOverScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:gameover");
        if (!node) return;
        node.removeAllChildren();
        this.gameOverView = new GameOverView(node, this.frames, {
            layout: () => gameOverScreenLayout(DESIGN_W, logicalH(), gameOverForms(this.gameOverSave(), this.gameOverRun())),
            content: (L) => buildGameOverContent(this.gameOverSave(), this.gameOverRun(), L),
            onAction: (a) => this.onGameOverAction(a),
        });
        this.gameOverView.sync();
    }

    /** 本屏要读的存档字段就这三项(累计回响 / 最佳纪录 / 当日已领的每日天赋);本屏一个存档字段都不写死在这里 */
    private gameOverSave(): GameOverSaveView {
        const s = this.save();
        return { points: s.points, bestRun: s.bestRun, dailyTalentClaimed: s.dailyTalentClaimed };
    }

    /**
     * 本局读数切片 —— **全部是会话态**(世界在 `over` 后停止推进,故这一份就是死亡那一刻的定格;
     * 与 Web 一样没有一个进 `localStorage`)。`stardustEarnedThisRun` 与 `doubleClaimed` 两项
     * 在宿主字段上,其余六项从战斗层现取。
     */
    private gameOverRun(): GameOverRunView {
        const sim = this.sim;
        return {
            elapsed: sim.elapsed,
            wave: sim.waves.wave,
            kills: sim.kills,
            pointsEarnedThisRun: sim.pointsEarnedThisRun,
            stardustEarnedThisRun: this.stardustEarnedThisRun,
            reviveUsed: sim.world.reviveUsed,
            rankImprovedTo: sim.rankImprovedTo,
            doubleClaimed: this.doubleClaimed,
        };
    }

    /**
     * 开局复位两张结算屏的三项会话态(对标 Web `startRun` 里同段的 `doubleClaimed = false` /
     * `stardustEarnedThisRun = 0` / `stageReward = null`);四个开局点(自举首局 / 菜单选关 /
     * 菜单无限关 / `restartRun`)都调它,后者同时是商店重开与转生「开始新轮回」的共用出口。
     * 名字沿用 GameOver 是因为它就是 Web 那一段的对应物,而 Web 那一段在 `startRun` 里只有一份。
     */
    private resetGameOverTransients(): void {
        this.doubleClaimed = false;
        this.stardustEarnedThisRun = 0;
        this.victoryInfo = null;
    }

    /**
     * 进屏:死亡那一刻由战斗层回调弹进来。先按 Web `onDeath` 同位把本局星尘所得写 0
     * (于是「星尘 +…」那一支在两端都取不到),再切屏(切屏即触发路由 refresh → syncGameOver)。
     */
    private openGameOver(): void {
        this.stardustEarnedThisRun = 0;
        this.router.show("gameover");
    }

    private syncGameOver(): void {
        this.gameOverView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web handleTap 的 gameover 分支五支:复活 → 双倍 → 重开 → 天赋 → 菜单)。
     * 广告闸门只有 `watchAd` 首行那一道,这一层不加 `adPending`;失败分支各走 `watchAd` 的 `onFail`。
     * 三个「放弃本局」出口的首行都是 `sim.settlePendingRun()`(必须排在任何开局调用之前 ——
     * `startRun()` 会把 `pendingSettle` 清零,顺序错了这一笔就静默丢掉),`restartRun` 已把这一句
     * 放在自己的首行,故重开那一支只调它。复活与双倍都不离开本屏以外的状态机:复活成功才回战斗。
     */
    private onGameOverAction(a: GameOverAction): void {
        const sim = this.sim;
        if (!sim) return;
        if (a.kind === "revive") {
            // Web: watchAd(() => this.revive()) —— 复活那一下不写任何账,落盘的只有广告钻石那一笔
            this.watchAd(
                () => {
                    sim.revive();
                    this.router.show("battle");
                },
                () => this.toast("广告未看完,未能复活")
            );
            return;
        }
        if (a.kind === "double") {
            const claim = gameOverEchoClaim(sim.pointsEarnedThisRun, this.doubleClaimed);
            if (!claim) return;
            this.watchAd(() => this.commitGameOverEcho(claim), () => this.toast("广告未看完,双倍未入账"));
            return;
        }
        if (a.kind === "restart") {
            this.restartRun();
            return;
        }
        if (a.kind === "prestige") {
            sim.settlePendingRun();
            this.openPrestige();
            return;
        }
        // 菜单:Web 的 backToMenu 就是「先结算挂起的死亡局,再切主菜单」
        sim.settlePendingRun();
        this.router.show("menu");
    }

    /**
     * 照着双倍回响的意图落账(壳层是唯一的写入方)。两笔账面与 Web `settleEcho` 逐字段对应:
     * `permanent → points`、`day → dayEcho`,外加把会话态 `doubleClaimed` 置真并落一次盘。
     * **这一笔不清 `pendingSettle`、也不改 `pointsEarnedThisRun`**(Web 同口径),于是离开本屏时
     * `settleRun()` 会把同一数额再结一次 —— 两笔相加就是「翻倍」。
     */
    private commitGameOverEcho(claim: GameOverEchoClaim): void {
        const save = this.save();
        save.points += claim.permanent;
        save.dayEcho += claim.day;
        this.doubleClaimed = true;
        this.sim.persist();
        this.syncGameOver();
        // 主菜单顶栏的回响读数与转生屏的可支配点数都直接读 points / dayEcho
        this.refreshMenu();
    }

    /* ================= 通关结算屏(Phase 5 第二屏) ================= */

    /**
     * 通关结算屏装配 —— Web `drawVictory`(3746-3849) 与 `handleTap` 的 victory 分支(582-596)
     * 的三层替换:`game/ui/victoryLayout.ts`(纯几何,cc-free)+ `victory/VictoryModel.ts`
     * (内容与命中与写入意图,cc-free)+ `victory/VictoryView.ts`(唯一节点层),本文件只接线。
     * 三条纪律与前十屏同构:
     *  ① 几何单一出口 = `victoryScreenLayout(DESIGN_W, logicalH(), forms)`,视图内零硬编码;
     *  ② 模型不重算通关账:星数 / 首通翻倍 / 成长奖励 / 券 / 回响 / 星尘 / 装备掉落 /
     *     解锁下一关 / 回响结算这九件事全在战斗层 `BattleSim.victory()`(与 Web `victory()`
     *     同源同数,已对齐并落盘),屏上读的就是它抛出的那一份 payload;
     *  ③ 模型不碰存档:落 `points` / `dayEcho` / `pointsEarnedThisRun` 与 `persist()` 在本文件
     *     (`commitVictoryEcho`),宿主只在返回出口前调一次 `sim.settlePendingRun()`。
     * **进屏判据不在本屏也不在宿主**:Web 是 `victory()` 尾部那句 `state = "victory"`,Cocos 侧
     * 同位 —— 战斗层算完账后抛 `cb.onVictory(info)`,宿主回调只有一句 `openVictory(info)`,
     * 所以「什么时候该弹屏」这一条两端同一事实源。
     * **本屏只有一个广告位**(双倍回响),走 `watchAd` 唯一入口;闸门只有它首行那一道。
     */
    private buildVictoryScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:victory");
        if (!node) return;
        node.removeAllChildren();
        this.victoryView = new VictoryView(node, this.frames, {
            layout: () => victoryScreenLayout(DESIGN_W, logicalH(), victoryForms(this.victoryRun())),
            content: (L) => buildVictoryContent(this.victoryRun(), L),
            onAction: (a) => this.onVictoryAction(a),
        });
        this.victoryView.sync();
    }

    /**
     * 本屏读数 —— **全部是会话态**,没有一个进 `localStorage`(与 Web 摊在实例上的那九个私有
     * 字段同性质)。六项冻结自战斗层通关那一刻抛出的 payload;三项按 Web 同位现取:
     * 关卡行读 `sim.world.currentStage`(Web 的 `this.currentStage`,无尽局为 null 故那一行不出)、
     * 名次提示读 `sim.rankImprovedTo`、双倍取数读 `sim.pointsEarnedThisRun`。
     * 世界在 `over` 之后停止推进,所以这一份就是通关那一刻的定格快照。
     */
    private victoryRun(): VictoryRunView {
        const sim = this.sim;
        const info = this.victoryInfo;
        const st = sim ? sim.world.currentStage : null;
        return {
            stage: st ? { id: st.id, name: st.name } : null,
            stars: info ? info.stars : 0,
            reward: info ? { tickets: info.reward.tickets, points: info.reward.points, stardust: info.reward.stardust } : null,
            drops: info ? info.drops : 0,
            firstClearBonus: info ? info.firstClearBonus : false,
            frameUnlocked: info ? info.frameUnlocked : null,
            rankImprovedTo: sim ? sim.rankImprovedTo : null,
            pointsEarnedThisRun: sim ? sim.pointsEarnedThisRun : 0,
            doubleClaimed: this.doubleClaimed,
        };
    }

    /**
     * 进屏:通关那一刻由战斗层回调弹进来。前三行是 Web `victory()` 尾部对会话态的三笔写入
     * (`stageReward` 摊成 payload、`stardustEarnedThisRun = stardustGain`、`doubleClaimed = false`),
     * 第四行切屏(切屏即触发路由 refresh → syncVictory)。**本屏是唯一会读到非零本局星尘的屏**
     * —— 通关与阵亡互斥,死亡屏上那一支因此恒为死分支。
     */
    private openVictory(info: VictoryInfo): void {
        this.victoryInfo = info;
        this.stardustEarnedThisRun = info.reward.stardust;
        this.doubleClaimed = false;
        this.router.show("victory");
    }

    private syncVictory(): void {
        this.victoryView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web handleTap 的 victory 分支两支:双倍 → 底部条;除此之外本屏不响应点击)。
     * 广告闸门只有 `watchAd` 首行那一道,这一层不加 `adPending`;失败分支走 `watchAd` 的 `onFail`。
     * **返回落点是 `menu`,不是 `battle`**:Web 本屏唯一的非广告出口就是底部条 → `backToMenu()`,
     * 那里那句 `settlePendingRun()` 在本屏是恒空的守卫(通关路径从不置 `pendingSettle`,
     * 战斗层 `victory()` 只写 `world.over`),按同位带上,不产生第二笔账。
     */
    private onVictoryAction(a: VictoryAction): void {
        const sim = this.sim;
        if (!sim) return;
        if (a.kind === "double") {
            // Web: watchAd(() => { const echo = pointsEarnedThisRun || stageEchoReward(currentStage?.id ?? 1); ... })
            const total = victoryEchoTotal(sim.pointsEarnedThisRun, sim.world.currentStage ? sim.world.currentStage.id : null);
            const claim = victoryEchoClaim(total, this.doubleClaimed);
            if (!claim) return;
            this.watchAd(() => this.commitVictoryEcho(claim), () => this.toast("广告未看完,双倍未入账"));
            return;
        }
        // 菜单:Web 的 backToMenu 就是「先结算挂起的那笔,再切主菜单」;通关路径从不置 pendingSettle
        sim.settlePendingRun();
        this.router.show("menu");
    }

    /**
     * 照着双倍回响的意图落账(壳层是唯一的写入方)。三笔账面与 Web `settleEcho(echo)` 逐字段对应:
     * `permanent → points`、`day → dayEcho`、`total → pointsEarnedThisRun`,外加把会话态
     * `doubleClaimed` 置真并落一次盘。与死亡屏那一笔的实质差别:通关账已在战斗层结清且
     * **没有 `pendingSettle` 会被再结一次**,所以本屏的双倍就是干净的「同一笔再结一次」,
     * 屏上那三行读数(念的是 payload 里的 `reward`)领取前后纹丝不动,只有钮的配色与文字会动。
     */
    private commitVictoryEcho(claim: VictoryEchoClaim): void {
        const save = this.save();
        save.points += claim.permanent;
        save.dayEcho += claim.day;
        if (this.sim) this.sim.pointsEarnedThisRun = claim.total;
        this.doubleClaimed = true;
        this.sim.persist();
        this.syncVictory();
        // 主菜单顶栏的回响读数与转生屏的可支配点数都直接读 points / dayEcho
        this.refreshMenu();
    }

    /* ================= 体力不足屏(Phase 5 末屏) ================= */

    /**
     * 体力不足屏装配 —— Web `drawEnergy`(4674-4745) 与 `onEnergyClick`(4746-4781) 的三层替换:
     * `game/ui/energyLayout.ts`(纯几何,cc-free)+ `energy/EnergyModel.ts`(内容与命中与写入意图,
     * cc-free)+ `energy/EnergyView.ts`(唯一节点层),本文件只接线。三条纪律与前十几屏同构:
     *  ① 几何单一出口 = `energyScreenLayout(DESIGN_W, logicalH())`,**本层没有形态位入参**
     *     (两个位只换配色档与文案档,不换矩形),视图内零硬编码;
     *  ② 模型不碰存档也不碰节点:体力口径的五支常量(`ENERGY_MAX` / `ENERGY_REGEN_SECONDS` /
     *     `ENERGY_AD_GAIN` / `ENERGY_AD_LIMIT` / `ENERGY_DIAMOND_COST`)全在共享层
     *     `game/data/daily.ts`(可被 `balance.json` 的 `energy` 段覆盖,与 Web 同表同源);
     *  ③ 落 `energy` / `energyAdCount` / `diamond` 与 `persist()` 在本文件
     *     (`commitEnergyAd` / `commitEnergyDiamond`),自然恢复那一步走战斗层同位出口
     *     `sim.syncEnergy()`(= Web `syncEnergy`,同一支 `regenEnergy` )。
     * **进屏判据不在本屏**:Web 是 `startStage` / `startEndless` 里那句
     * `if (this.save.energy < cost) { this.energyPending = ...; this.state = "energy"; return; }`,
     * Cocos 侧同位在 `requestStage` / `requestEndless` 这一对漏斗里 —— 全工程只有这两处会
     * `router.show("energy")`,而它们就是三个开局入口(菜单关卡行 / 菜单无限关 / `restartRun`)
     * 的唯一出口,所以「什么时候该弹屏」两端同一事实源。
     * **本屏只有一个广告位**(看广告换体力),走 `watchAd` 唯一入口;闸门只有它首行那一道。
     */
    private buildEnergyScreen(): void {
        const node = this.screenLayer.getChildByName("Screen:energy");
        if (!node) return;
        node.removeAllChildren();
        this.energyView = new EnergyView(node, this.frames, {
            layout: () => energyScreenLayout(DESIGN_W, logicalH()),
            content: () => buildEnergyContent(this.energySave()),
            onAction: (a) => this.onEnergyAction(a),
        });
        this.energyView.sync();
    }

    /**
     * 本屏读数 —— 三个数,且 `energy` 必须先过自然恢复那一步(Web `drawEnergy` 首行就是
     * `this.syncEnergy()`,与主菜单顶栏的 `⚡` 同一口径)。返回的是每轮现算的新对象,
     * 本屏没有需要跨帧复用的切片。
     */
    private energySave(): EnergySaveView {
        if (this.sim) this.sim.syncEnergy();
        const save = this.save();
        return { energy: save.energy, energyAdCount: save.energyAdCount, diamond: save.diamond };
    }

    /**
     * 一次开局的完整宿主动作 —— 对标 Web `startRun()` 尾部那句 `this.state = "playing"`:
     * 清死亡屏会话态、随模式换背景、切战斗屏。三个开局入口与「续上挂起的那次开局」都走它。
     */
    private enterBattleRun(): void {
        this.resetGameOverTransients();
        this.refreshBackdrop();
        this.router.show("battle");
    }

    /**
     * 开局请求(主线关卡)。顺序逐项对标 Web `startStage`:门控 → 体力闸门。**结算挂起的死亡局**
     * 那一笔留在三个调用点同位(菜单选关 / 菜单无限关 / `restartRun`),与 Web 一样不在 `startStage`
     * 里;所以本函数挂起的闭包重跑时也只重跑「门控 + 体力 + 开局」那一段,不多结一次。
     * 门控判据取 `menuRows()` 里那一行的 `unlocked`(与 `menuStageOpen` 与战斗层 `stageOpen`
     * 同一支共享层 `stageUnlocked`,不新起第二份口径),于是「未开放」是静默 return、
     * 「体力不足」才会弹本屏 —— 两支不会混成一谈。
     */
    private requestStage(id: number, bypassGate = false): void {
        const sim = this.sim;
        if (!sim) return;
        if (!bypassGate) {
            const row = this.menuRows().find((r) => r.id === id);
            if (!row || !row.unlocked) return;
        }
        if (sim.startStage(id, bypassGate)) {
            this.enterBattleRun();
            return;
        }
        this.energyPending = () => this.requestStage(id, bypassGate);
        this.openEnergy();
    }

    /** 开局请求(无限关)。常开无门控,其余与 requestStage 同构(对标 Web `startEndless`)。 */
    private requestEndless(): void {
        const sim = this.sim;
        if (!sim) return;
        if (sim.startEndless()) {
            this.enterBattleRun();
            return;
        }
        this.energyPending = () => this.requestEndless();
        this.openEnergy();
    }

    /** 进屏:由两个开局漏斗在体力不足那一刻弹进来(切屏即触发路由 refresh → syncEnergy) */
    private openEnergy(): void {
        this.router.show("energy");
    }

    private syncEnergy(): void {
        this.energyView?.sync();
    }

    /**
     * 热区 → 玩法(对标 Web `onEnergyClick` 四支:返回 → 广告 → 钻石 → 关闭)。
     * **屏级不加「广告在途就吞点击」的守卫** —— 闸门只有 `watchAd` 首行那一道;用尽与钻石不足
     * 两支的静默都发生在写入意图的守卫里(与 Web「命中之后再 return」同分层)。
     * 两支放弃出口(返回 / 关闭)在 Web 完全同效:清掉挂起的那次开局再回主菜单。
     */
    private onEnergyAction(a: EnergyAction): void {
        const sim = this.sim;
        if (!sim) return;
        const save = this.save();
        if (a.kind === "ad") {
            // Web: if (this.save.energyAdCount >= ENERGY_AD_LIMIT) return; —— 守卫在发起广告之前
            if (!energyAdClaim(save.energy, save.energyAdCount)) return;
            this.watchAd(() => this.commitEnergyAd(), () => this.toast("广告未看完,体力未入账"));
            return;
        }
        if (a.kind === "diamond") {
            const claim = energyDiamondClaim(save.energy, save.diamond);
            if (!claim) return;
            this.commitEnergyDiamond(claim);
            return;
        }
        this.energyPending = null;
        this.router.show("menu");
    }

    /**
     * 广告回体力的那笔落账(壳层是唯一的写入方)。三行顺序逐项对标 Web 的 `watchAd` 回调:
     * 先 `syncEnergy()` 把自然恢复结清、再按 `Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN)`
     * 累加(与钻石那支的「直接置满」不同口径)、`energyAdCount += 1`、落一次盘,最后续上开局。
     * 入账时刻重算意图(而不是沿用点击那一刻那一份),于是广告在途跨过的时间里长出来的那点体力
     * 不会丢 —— Web 就是回调里现读 `this.save.energy`。上限之上仍会 `return`(Web 的守卫
     * 在点击时查一次,这里再查一次只为不越过 `energyAdCount` 的口径,正常路径同结果)。
     */
    private commitEnergyAd(): void {
        const sim = this.sim;
        if (!sim) return;
        const save = this.save();
        sim.syncEnergy();
        const claim = energyAdClaim(save.energy, save.energyAdCount);
        if (!claim) return;
        save.energy = claim.energyAfter;
        save.energyAdCount = claim.adCountAfter;
        sim.persist();
        this.continueEnergyPending();
    }

    /**
     * 钻石回满体力的那笔落账(无广告,即时结算)。顺序对标 Web:先扣费、再 `syncEnergy()`、
     * 最后 `energy = ENERGY_MAX`,一次落盘,然后续上被挡住的那次开局。
     */
    private commitEnergyDiamond(claim: EnergyDiamondClaim): void {
        const sim = this.sim;
        if (!sim) return;
        const save = this.save();
        save.diamond = claim.diamondAfter;
        sim.syncEnergy();
        save.energy = claim.energyAfter;
        sim.persist();
        this.continueEnergyPending();
    }

    /**
     * 续上被体力挡住的那次开局(对标 Web 的 `const act = this.energyPending; this.energyPending = null;
     * if (act) act(); else this.state = "menu"`)。闭包本身就是 `requestStage` / `requestEndless`,
     * 所以「续上」与「第一次点」在结算挂起局、清会话态、换背景、切屏这四件事上没有第二份实现;
     * 体力仍然不够时它会再次落回本屏(读数已更新),就是 Web 的那个递归分支。
     * `pending` 为空只剩一种可能:别的代码路径清过它(关闭 / 返回),那时回主菜单。
     */
    private continueEnergyPending(): void {
        const act = this.energyPending;
        this.energyPending = null;
        if (act) act();
        else this.router.show("menu");
    }

    /**
     * 体力读数跟进(对标 Web `drawEnergy` 首行的 `syncEnergy()` 配上逐帧重绘):本屏停着不动时,
     * 自然恢复每 `ENERGY_REGEN_SECONDS`(表值 360 秒 = 6 分钟)才跳一档,所以只在该屏现取、
     * 只在真的多了一点时重排一次,不逐帧刷 Label。挂账的「本屏没有倒计时读数」见
     * `energy/EnergyModel.ts` 文件头口径 1。
     */
    private tickEnergy(): void {
        if (this.router.current !== "energy" || !this.sim || !this.energyView) return;
        const before = this.save().energy;
        this.sim.syncEnergy();
        if (this.save().energy !== before) this.syncEnergy();
    }

    /* ================= 主循环 ================= */

    update(dt: number): void {
        // 轻提示、英雄列表惯性、委托面板与体力读数都工作在非战斗屏上(blocksPlay 为真),所以排在推进世界之前
        this.tickToast(dt);
        this.tickHeroScroll(dt);
        this.tickCommission(dt);
        this.tickEnergy();
        if (!this.ready) return;
        // 每日重置:Web 是"任何状态下都执行",所以必须排在路由闸门之前 —— 否则停在
        // 菜单/每日屏跨天就永远不清零,本屏会一直显示「已领取」(静默失效)
        if (this.sim.syncDaily()) {
            if (this.router.current === "daily") this.syncDaily();
            // 广告免费抽的可用态读 dailyGachaAdUsed,而这一句把它清零:Web 逐帧重绘自然跟上,
            // Cocos 侧停在扭蛋屏跨天时必须显式重排一次,否则钮会一直停在「今日广告抽已用」
            if (this.router.current === "gacha") this.syncGacha();
            this.refreshMenu();
        }
        // 赛季到期翻页:与每日重置同一条口,任何状态下都跑,所以同样排在路由闸门之前
        this.tickSeason();
        if (this.router.blocksPlay()) return;
        const step = Math.min(dt, viewTable().battle.maxFrameDt);
        this.joystick.update();
        this.sim.update(step);
        this.worldView.sync(this.sim);
        this.fxView.sync(this.sim);
        this.hudView.sync(this.sim);
    }
}
