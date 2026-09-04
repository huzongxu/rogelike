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
import { BattleSim } from "./battle/BattleSim";
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

const { ccclass } = _decorator;

/** 后续阶段才落地的屏幕(键 = 尚未接入的菜单入口 id + fusion):点下去先给一条轻提示,不做假动作 */
const PENDING_SCREEN: Record<string, string> = {
    commission: "委托尚未开放",
    fusion: "融合尚未开放",
};

/** 回响筹码下标:点它走激励视频领回响(三枚筹码 = 券/回响/星尘) */
const ECHO_CHIP_INDEX = 1;


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
     * Web 侧 `blueprintEffect` 由下一次开局的 `makeStarter()` 消费、`targetTrigger` 在 Web 侧
     * 本身就没有消费方;Cocos 侧的开局武器通道尚未接入(见 `battle/BattleSim.ts` 的
     * `makeStarterEquipment`),故这里只管开关本身。
     */
    private runConfig: PrestigeRunConfig = {};
    /** 复用的存档切片:每轮布局覆写它,滚动期间不再逐帧分配对象 */
    private heroSlice: HeroSaveView = { selectedHero: null, selectedSet: null, seasonId: 1 };
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
            if (this.router.current === "heroes") this.heroesView?.sync();
            if (this.router.current === "leaderboard") this.leaderboardView?.sync();
            if (this.router.current === "daily") this.dailyView?.sync();
            if (this.router.current === "pass") this.passView?.sync();
            if (this.router.current === "gearup") this.gearUpView?.sync();
            if (this.router.current === "gacha") this.gachaView?.sync();
            if (this.router.current === "prestige") this.prestigeView?.sync();
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
        };
        (["battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige"] as ScreenKey[]).forEach((key) => {
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
            callbacks: {
                onDamage: (pos, text, color) => this.fxView.popDamage(pos, text, color),
                // 死亡/通关结算屏属 Phase 5:先停住世界推进(sim.over),不做入账交互
                onDeath: () => {},
                onVictory: () => {},
                // 章末 → 弹章间商店屏(买完/关闭后回到战斗并继续下一章)
                onChapterShop: () => this.openShop(),
            },
        });
        this.joystick.onToggleAuto = () => this.sim.toggleAuto();
        this.hudView.onSkipGuide = () => this.sim.skipGuide();
        // 开局:主线第 1 关(体力不足回落无限关),背景随模式切换
        if (!this.sim.startStage(1)) this.sim.startEndless();
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
                if (!sim.startStage(a.id)) {
                    this.toast("体力不足,稍后再试或改打无限关");
                    return;
                }
                this.refreshBackdrop();
                this.router.show("battle");
                return;
            }
            case "makeup":
                this.starMakeup(a.id);
                return;
            case "endless":
                // 同上:放弃死亡局改打无限关也要先结算
                sim.settlePendingRun();
                if (!sim.startEndless()) {
                    this.toast("体力不足,无法进入无限关");
                    return;
                }
                this.refreshBackdrop();
                this.router.show("battle");
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
                this.toast(PENDING_SCREEN[a.entry]);
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
                    this.toast(PENDING_SCREEN.fusion);
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
     * 重开本局(商店「重开」钮 / 转生屏「开始新轮回」):与 Web `restart()` 同一口径 ——
     * 首行先结算挂起的死亡局,再当前关带门控豁免重开、无限关重掷词缀。
     */
    private restartRun(): void {
        const sim = this.sim;
        if (!sim) return;
        sim.settlePendingRun(); // Web restart() 首行同位:死亡后放弃重开,先结算死亡
        const ok = sim.currentStage ? sim.startStage(sim.currentStage.id, true) : sim.startEndless();
        if (!ok) {
            this.toast("体力不足,无法重开");
            return;
        }
        this.refreshBackdrop();
        this.router.show("battle");
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
     * 热区 → 玩法(对标 Web onDailyClick 的四段)。广告在途先吞掉整屏点击;
     * 免费档天赋直接落账,宝箱与补领要先看完一次激励视频。模型返回 null 就是
     * "已领取 / 今日不可补领",与 Web 在那里直接 return 同一语义(点了没反应)。
     */
    private onDailyAction(a: DailyAction): void {
        if (this.adPending) return;
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
     * 广告在途先吞掉整屏点击;领取不要看广告,激活要先看完一次激励视频。
     * 模型返回 null 就是"档位不存在 / 进度不够 / 高级轨已生效",与 Web 在那里直接 return
     * 同一语义(点了没反应)。
     */
    private onPassAction(a: PassAction): void {
        if (this.adPending) return;
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
     * 同一语义(点了没反应);广告在途先吞掉整屏点击,与已落地两屏的 shell 侧口径一致。
     */
    private onGearUpAction(a: GearUpAction): void {
        if (this.adPending) return;
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
     * 逐行切换带入 → 热区外什么都不做)。广告在途先吞掉整屏点击,与已落地三屏同口径。
     * 模型返回 null 就是"券不足 / 广告已用 / 钻石不足",与 Web 在扣费前 `return` 同一语义。
     */
    private onGachaAction(a: GachaAction): void {
        if (this.adPending) return;
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
        if (this.adPending) return;
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

    /* ================= 主循环 ================= */

    update(dt: number): void {
        // 轻提示与英雄列表惯性都工作在非战斗屏上(blocksPlay 为真),所以排在推进世界之前
        this.tickToast(dt);
        this.tickHeroScroll(dt);
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
        if (this.router.blocksPlay()) return;
        const step = Math.min(dt, viewTable().battle.maxFrameDt);
        this.joystick.update();
        this.sim.update(step);
        this.worldView.sync(this.sim);
        this.fxView.sync(this.sim);
        this.hudView.sync(this.sim);
    }
}
