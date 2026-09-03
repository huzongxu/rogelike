import { _decorator, Component, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, resources } from "cc";
import { DESIGN_W, coverRect, fullRect, placeRect, refreshDesignResolution, worldH } from "./core/DesignMetrics";
import { ScreenRouter, ScreenKey } from "./core/ScreenRouter";
import { loadBalance } from "./core/ConfigChannel";
import { loadViewTable, viewTable, borderOf } from "./core/ViewTable";
import { readSave, writeSave } from "./core/SaveChannel";
import { showRewardedAd } from "./core/AdChannel";
import { FS, HEX, UI, label, makeNode, sliced, solidRect } from "./ui/Widgets";
import { ASSET_MANIFEST } from "./game/data/assets";
import { applyBalance as applyDaily } from "./game/data/daily";
import { applyBalance as applyStages } from "./game/data/stages";
import { applyBalance as applyWaves } from "./game/systems/waves";
import { applyBalance as applyChapterTypes } from "./game/data/chapters";
import { applyBalance as applyGacha } from "./game/data/gacha";
import { applyBalance as applyEconomy } from "./game/data/equipmentGen";
import { normalizeSave } from "./core/SaveModel";
import { BattleSim } from "./battle/BattleSim";
import { BattleWorldView } from "./battle/BattleWorldView";
import { HudView } from "./battle/HudView";
import { FxView } from "./battle/FxView";
import { JoystickView } from "./battle/JoystickView";

const { ccclass } = _decorator;

/** 主菜单三行:验证贴图九宫格、字阶、点击路由三条链路(菜单屏 Phase 3 前的骨架内容) */
const MENU_ROWS: { text: string; to: ScreenKey | null }[] = [
    { text: "继续冒险", to: "battle" },
    { text: "英雄", to: "heroes" },
    { text: "看广告领回响", to: null },
];

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
            // 背景是一次性设置,贴图流到位后补刷一次
            if (this.ready) this.refreshBackdrop();
        });
    }

    private buildLayers(): void {
        this.buildScreens();
        this.buildBattle();
        this.buildMenuContent();
        this.buildHeroesContent();
        makeNode("Overlay", this.worldLayer);
    }

    private buildScreens(): void {
        (["battle", "menu", "heroes"] as ScreenKey[]).forEach((key) => {
            const node = makeNode("Screen:" + key, this.screenLayer);
            node.active = false;
            this.router.register(key, {
                active: false,
                onShow: () => {
                    node.active = true;
                },
                onHide: () => {
                    node.active = false;
                },
                refresh: () => {},
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
                // 章间商店屏属 Phase 3:暂直接开下一章,不中断战斗节奏
                onChapterShop: () => this.sim.nextChapter(),
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

    /* ================= 菜单/英雄(骨架内容,Phase 3 重写) ================= */

    private buildMenuContent(): void {
        const menu = this.screenLayer.getChildByName("Screen:menu");
        if (!menu) return;
        // 菜单屏自己的满幅立绘 + 压暗(每个屏幕的背景挂在 Screen:<key> 下,不跨屏漏画)
        const bgFrame = this.frames.get("bg_menu");
        if (bgFrame) {
            const node = makeNode("Cover", menu);
            const sp = node.addComponent(Sprite);
            sp.spriteFrame = bgFrame;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const op = node.addComponent(UIOpacity);
            const t = viewTable().backdrop;
            op.opacity = Math.round(t.coverAlpha * 255);
            placeRect(node, coverRect(fullRect(), bgFrame.width, bgFrame.height));
            solidRect("Dim", menu, fullRect(), t.dimColor);
        }
        label("Title", menu, "回响深渊", FS.display, HEX.gold, {
            bold: true,
            rect: { x: 0, y: 140, w: DESIGN_W, h: FS.display + 12 },
            hAlign: Label.HorizontalAlign.CENTER,
        });
        MENU_ROWS.forEach((row, i) => {
            const y = 260 + i * (UI.rowMax + 12);
            const w = DESIGN_W - UI.pad * 2;
            const node = this.rowNode(menu, { x: UI.pad, y, w, h: UI.rowMax }, "menu_row_plate");
            label("RowText", node, row.text, FS.title, HEX.textPrimary, {
                bold: true,
                rect: { x: 20, y: Math.round(UI.rowMax / 2 - FS.title / 2) - 4, w: w - 40, h: FS.title + 12 },
                box: { w, h: UI.rowMax },
            });
            node.on(Node.EventType.TOUCH_END, () => {
                if (row.to) {
                    this.router.show(row.to);
                    return;
                }
                showRewardedAd((ok) => {
                    if (ok && this.sim) {
                        this.sim.save.points += 100;
                        this.sim.persist();
                    }
                });
            }, this);
        });
    }

    private rowNode(parent: Node, rect: { x: number; y: number; w: number; h: number }, frameKey: string): Node {
        const frame = this.frames.get(frameKey);
        if (frame) {
            return sliced("Row", parent, frame, rect, borderOf(frameKey, frame.width, frame.height)).node;
        }
        const node = makeNode("Row", parent);
        node.addComponent(UITransform).setContentSize(rect.w, rect.h);
        placeRect(node, rect);
        return node;
    }

    private buildHeroesContent(): void {
        const heroes = this.screenLayer.getChildByName("Screen:heroes");
        if (!heroes) return;
        label("Title", heroes, "英雄", FS.title, HEX.textPrimary, {
            bold: true,
            rect: { x: 0, y: 64, w: DESIGN_W, h: FS.title + 12 },
            hAlign: Label.HorizontalAlign.CENTER,
        });
        label("Hint", heroes, "12 名英雄 · 12 套武器套组(待接入)", FS.muted, HEX.textMuted, {
            rect: { x: 0, y: 110, w: DESIGN_W, h: FS.muted + 12 },
            hAlign: Label.HorizontalAlign.CENTER,
        });
        const back = makeNode("Back", heroes);
        back.addComponent(UITransform).setContentSize(UI.backW, UI.backH);
        placeRect(back, { x: UI.pad, y: 16, w: UI.backW, h: UI.backH });
        label("BackText", back, "返回", FS.body, HEX.textSecondary, {
            rect: { x: 0, y: 8, w: UI.backW, h: FS.body + 12 },
            box: { w: UI.backW, h: UI.backH },
            hAlign: Label.HorizontalAlign.CENTER,
        });
        back.on(Node.EventType.TOUCH_END, () => this.router.show("menu"), this);
    }

    /* ================= 主循环 ================= */

    update(dt: number): void {
        if (!this.ready || this.router.blocksPlay()) return;
        const step = Math.min(dt, viewTable().battle.maxFrameDt);
        this.joystick.update();
        this.sim.update(step);
        this.worldView.sync(this.sim);
        this.fxView.sync(this.sim);
        this.hudView.sync(this.sim);
    }
}
