import { JsonAsset, resources } from "cc";
import { LAB_OVERLAY_DEFAULTS, MENU_PRESENTATION_DEFAULTS, resolveBorder, type LabOverlayParams, type MenuPresentationParams } from "../game/dev/labTable";

/**
 * 表现层参数表。数值型与结构型表现参数一律来自 resources/config/viewTable.json,
 * 代码里只保留回落值(遵循 docs/DESIGN-VALUES-SPEC.md:数据与逻辑有关联都走表配置)。
 * battle/fx/pool/hud 四段的默认值与 Web 基准线 src/game.ts 战斗绘制路径逐项同源。
 */
export interface ViewTable {
    nineSlice: {
        factor: number;
        keys: Record<string, number>;
    };
    battle: {
        /** 地面网格步长(px),对标 Web drawWorld 的 grid=100 */
        gridStep: number;
        /** 地面网格线色,对标 rgba(255,255,255,0.05) */
        gridColor: string;
        /** 主循环单帧 dt 钳制上限(秒),对标 Web loop 的 clamp(dt,0,0.05) */
        maxFrameDt: number;
        /** 敌人贴图边长 = 碰撞半径 × 该系数(Web spr = radius*2.6) */
        enemySpriteScale: number;
        /** 玩家贴图边长 = 半径 × 该系数(Web ps = radius*2.8) */
        playerSpriteScale: number;
        /** 召唤物贴图边长 = 半径 × 该系数(Web ms = radius*2.4) */
        minionSpriteScale: number;
        /** 隐匿敌人整体透明度(Web globalAlpha 0.22) */
        hiddenAlpha: number;
        /** 敌人头顶血条:高(px)/距头顶(px)/底色/填充色 */
        enemyBarH: number;
        enemyBarGap: number;
        enemyBarBg: string;
        enemyBarFill: string;
        /** 护盾卫士正面弧线:色/线宽/半径加量/半角(rad) */
        guardArcColor: string;
        guardArcWidth: number;
        guardArcPad: number;
        /** 闪电射线贴图:长度 = max(radius×rayScale, rayMinPx),宽 = 长 × rayAspect(贴图 66:87) */
        rayScale: number;
        rayMinPx: number;
        rayAspect: number;
        /** 飞刀弹体色 */
        knifeColor: string;
        /** 金币脉冲:基准半径/振幅/角频率 + 就绪色/延迟色 */
        gemPulseBase: number;
        gemPulseAmp: number;
        gemPulseRate: number;
        gemColor: string;
        gemDelayColor: string;
    };
    fx: {
        /** 粒子/冲击环硬上限(满池丢弃),对标 Web fxLayer MAX_PARTICLES/MAX_RINGS */
        maxParticles: number;
        maxRings: number;
        /** 伤害飘字:寿命(秒)/总上浮(px)/同屏上限/字号,对标 Web spawnDmg ttl 0.6 / 18px / 200 / 13px */
        floatTtl: number;
        floatRise: number;
        floatCap: number;
        floatPx: number;
        /** 粒子光晕近似:Web 为加法混合径向渐变,Cocos 侧画外圈半透明圆,alpha = 存活比 × 该系数 */
        haloAlpha: number;
    };
    joystick: {
        /** 底盘半径/旋钮半径(px),对标 Web input.stickRadius=56 与 drawJoystick 24 */
        baseRadius: number;
        knobRadius: number;
        /** 底盘描边色/旋钮填充色/描边宽 */
        baseColor: string;
        knobColor: string;
        lineWidth: number;
        /** 死区(px):位移小于该值不算移动输入 */
        deadZone: number;
    };
    pool: {
        /** 各对象池预热容量(开局即建好的空闲节点数;超出按需增长) */
        enemies: number;
        projectiles: number;
        gems: number;
        clouds: number;
        minions: number;
        fxDecals: number;
        floats: number;
        fields: number;
    };
    hud: {
        /** 顶坞血条/经验条与底坞 Boss 条/章节条几何(px),对标 Web drawTopDock/drawBottomDock */
        hpBarW: number;
        hpBarH: number;
        xpBarW: number;
        xpBarH: number;
        bossBarW: number;
        bossBarH: number;
        chapterBarW: number;
        chapterBarH: number;
        /** 胶囊条四件套颜色(对标 Web ui/skin.ts drawBar) */
        barTrack: string;
        barGloss: string;
        barStroke: string;
        shieldOverlay: string;
        /** 血条颜色:高于/低于 hpLowFrac */
        hpHigh: string;
        hpLow: string;
        hpLowFrac: number;
        xpColor: string;
        chapterColor: string;
        /** Boss 三阶段血条/标题色(P1/P2/P3) */
        bossPhaseColors: string[];
        /** 坞内文字字号(px),与 Web 内联字体串同源 */
        pxMain: number;
        pxSub: number;
        pxTickerBold: number;
        pxTicker: number;
        pxCard: number;
        pxCardSub: number;
        pxCombo: number;
        pxBanner: number;
        /** 近似量字系数:CJK 宽 = 1×px,ASCII 宽 = asciiWidth×px,空格 = spaceWidth×px。
         *  仅用于 Web measureText 驱动的横向排版(量链/截断),文本本体仍是 Label */
        asciiWidth: number;
        spaceWidth: number;
        /** 顶坞/底坞文字与图形颜色(对标 Web 绘制路径内联色) */
        colors: Record<string, string>;
    };
    backdrop: {
        /** 满溢背景贴图的总体透明度(0~1),与 Web 版 globalAlpha 同源 */
        coverAlpha: number;
        /** 贴图之上再压一层的遮罩色,与 Web 版 rgba(...) 遮罩同源 */
        dimColor: string;
    };
    /** 主菜单表驱动视图的表现参数(几何仍由 menuLayoutPure 派生,这里只管"长什么样") */
    menu: MenuPresentationParams;
    /** 布局台浮层自身参数:手柄尺寸/拾取半径/配色/虚拟屏高档位,?lab=1 时消费 */
    lab: LabOverlayParams;
}

export const FALLBACK: ViewTable = {
    nineSlice: { factor: 0.35, keys: {} },
    battle: {
        gridStep: 100,
        gridColor: "rgba(255,255,255,0.05)",
        maxFrameDt: 0.05,
        enemySpriteScale: 2.6,
        playerSpriteScale: 2.8,
        minionSpriteScale: 2.4,
        hiddenAlpha: 0.22,
        enemyBarH: 3,
        enemyBarGap: 8,
        enemyBarBg: "rgba(0,0,0,0.5)",
        enemyBarFill: "#ff5a5a",
        guardArcColor: "rgba(120,144,156,0.8)",
        guardArcWidth: 2,
        guardArcPad: 5,
        rayScale: 4,
        rayMinPx: 24,
        rayAspect: 0.76,
        knifeColor: "#ffd76a",
        gemPulseBase: 3,
        gemPulseAmp: 1.5,
        gemPulseRate: 6,
        gemColor: "#5ac8fa",
        gemDelayColor: "#3a7bd5",
    },
    fx: {
        maxParticles: 520,
        maxRings: 40,
        floatTtl: 0.6,
        floatRise: 18,
        floatCap: 200,
        floatPx: 13,
        haloAlpha: 0.35,
    },
    joystick: {
        baseRadius: 56,
        knobRadius: 24,
        baseColor: "rgba(255,255,255,0.3)",
        knobColor: "rgba(255,255,255,0.25)",
        lineWidth: 2,
        deadZone: 4,
    },
    pool: {
        enemies: 48,
        projectiles: 64,
        gems: 64,
        clouds: 12,
        minions: 8,
        fxDecals: 12,
        floats: 48,
        fields: 8,
    },
    hud: {
        hpBarW: 150,
        hpBarH: 12,
        xpBarW: 150,
        xpBarH: 5,
        bossBarW: 240,
        bossBarH: 10,
        chapterBarW: 170,
        chapterBarH: 6,
        barTrack: "rgba(6,8,14,0.8)",
        barGloss: "rgba(255,255,255,0.22)",
        barStroke: "rgba(255,255,255,0.14)",
        shieldOverlay: "rgba(90,200,250,0.75)",
        hpHigh: "#ff5a6e",
        hpLow: "#ff2d2d",
        hpLowFrac: 0.3,
        xpColor: "#5ac8fa",
        chapterColor: "#ffd76a",
        bossPhaseColors: ["#ff2d2d", "#ff9d2e", "#ff2d8f"],
        pxMain: 12,
        pxSub: 13,
        pxTickerBold: 13,
        pxTicker: 12,
        pxCard: 12,
        pxCardSub: 10,
        pxCombo: 10,
        pxBanner: 24,
        asciiWidth: 0.55,
        spaceWidth: 0.3,
        colors: {
            hpText: "#ffffff",
            lvText: "#e8e8e8",
            goldText: "#ffd76a",
            killsText: "#b8b8b8",
            stageText: "#c9d1e0",
            stageBossText: "#ff9d2e",
            chapterText: "#8f9bb3",
            energyText: "#5ac8fa",
            echoText: "#ffd76a",
            stardustText: "#c8b6ff",
            comboText: "#ffd76a",
            frenzyText: "#ff2d8f",
            commissionText: "#c8b6ff",
            envText: "#ff9d2e",
            thornText: "#4dffc8",
            intelFallback: "#8f9bb3",
            autoOnText: "#8f9bb3",
            autoOffText: "#5ac8fa",
            cardSubText: "#cfcfcf",
            chipText: "#cfcfcf",
            chipBg: "rgba(0,0,0,0.5)",
            chipStroke: "rgba(255,255,255,0.2)",
            cardBg: "rgba(0,0,0,0.5)",
            cdTrack: "rgba(0,0,0,0.6)",
            cdFill: "#5ac8fa",
            bannerText: "#ff9d2e",
            guideHead: "#4dffc8",
            guideBody: "#e8e8e8",
            guideSkipText: "#ff6b7a",
            guideSkipBg: "rgba(255,107,122,0.16)",
            guideSkipStroke: "rgba(255,107,122,0.5)",
            restZoneFill: "rgba(11,14,20,0.88)",
            restZoneLine: "rgba(255,255,255,0.08)",
            comboOffStroke: "rgba(143,155,179,0.5)",
            comboOffText: "rgba(143,155,179,0.7)",
            comboOnText: "#0b0e14",
        },
    },
    backdrop: { coverAlpha: 0.55, dimColor: "rgba(11,14,20,0.35)" },
    menu: { ...MENU_PRESENTATION_DEFAULTS },
    lab: {
        ...LAB_OVERLAY_DEFAULTS,
        screenHeights: [...LAB_OVERLAY_DEFAULTS.screenHeights],
        showDefault: { ...LAB_OVERLAY_DEFAULTS.showDefault },
        colors: { ...LAB_OVERLAY_DEFAULTS.colors },
    },
};

let current: ViewTable = FALLBACK;

/** 数值字段兜底合并:表内字段整体覆盖回落值(缺失字段保留 FALLBACK) */
function merge<T extends Record<string, any>>(base: T, raw: unknown): T {
    return Object.assign({}, base, (raw && typeof raw === "object" ? raw : {}) as Partial<T>) as T;
}

/**
 * 逐字段按类型合并:只有与回落值同类型且有限的字段才被接受。
 * 表里写错一个数(字符串混进数值位)不能把绘制路径带崩,回落档必须保住。
 */
function typedMerge<T extends Record<string, any>>(base: T, raw: unknown): T {
    const out = { ...base };
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    for (const k of Object.keys(base) as (keyof T)[]) {
        const want = base[k];
        const got = src[k as string];
        if (typeof want === "number" && typeof got === "number" && Number.isFinite(got)) (out as Record<string, unknown>)[k as string] = got;
        else if (typeof want === "string" && typeof got === "string" && got) (out as Record<string, unknown>)[k as string] = got;
        else if (typeof want === "boolean" && typeof got === "boolean") (out as Record<string, unknown>)[k as string] = got;
        else if (Array.isArray(want) && Array.isArray(got) && got.length === want.length && got.every((v) => typeof v === "number"))
            (out as Record<string, unknown>)[k as string] = [...got];
    }
    return out;
}

export function loadViewTable(): Promise<ViewTable> {
    return new Promise((resolve) => {
        resources.load("config/viewTable", JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                current = FALLBACK;
                resolve(current);
                return;
            }
            const raw = asset.json as Partial<ViewTable>;
            const hud = merge(FALLBACK.hud, raw.hud);
            hud.colors = merge(FALLBACK.hud.colors, raw.hud ? raw.hud.colors : undefined);
            hud.bossPhaseColors =
                Array.isArray(raw.hud?.bossPhaseColors) && raw.hud!.bossPhaseColors.length === 3
                    ? [...raw.hud!.bossPhaseColors]
                    : [...FALLBACK.hud.bossPhaseColors];
            current = {
                nineSlice: {
                    factor:
                        Number(raw.nineSlice && raw.nineSlice.factor) > 0
                            ? Number(raw.nineSlice!.factor)
                            : FALLBACK.nineSlice.factor,
                    keys: (raw.nineSlice && raw.nineSlice.keys) || {},
                },
                battle: merge(FALLBACK.battle, raw.battle),
                fx: merge(FALLBACK.fx, raw.fx),
                joystick: merge(FALLBACK.joystick, raw.joystick),
                pool: merge(FALLBACK.pool, raw.pool),
                hud,
                backdrop: {
                    coverAlpha:
                        Number(raw.backdrop && raw.backdrop.coverAlpha) > 0
                            ? Math.min(1, Number(raw.backdrop!.coverAlpha))
                            : FALLBACK.backdrop.coverAlpha,
                    dimColor:
                        raw.backdrop && typeof raw.backdrop.dimColor === "string"
                            ? raw.backdrop.dimColor
                            : FALLBACK.backdrop.dimColor,
                },
                menu: typedMerge(FALLBACK.menu, raw.menu),
                lab: (() => {
                    const lab = typedMerge(FALLBACK.lab, raw.lab);
                    const src = (raw.lab && typeof raw.lab === "object" ? raw.lab : {}) as Record<string, unknown>;
                    if (src.colors && typeof src.colors === "object") lab.colors = { ...FALLBACK.lab.colors, ...(src.colors as Record<string, string>) };
                    if (src.showDefault && typeof src.showDefault === "object") lab.showDefault = { ...FALLBACK.lab.showDefault, ...(src.showDefault as Record<string, boolean>) };
                    return lab;
                })(),
            };
            resolve(current);
        });
    });
}

export function viewTable(): ViewTable {
    return current;
}

/**
 * 九宫格边距:表内显式值优先,否则按源图短边 × factor 自动推导。
 * 公式住在共享层 `game/dev/labTable.ts:resolveBorder()`,与布局台的边距列同一实现(单一事实源)。
 */
export function borderOf(key: string, srcW: number, srcH: number): number {
    return resolveBorder(Number(current.nineSlice.keys ? current.nineSlice.keys[key] : undefined), srcW, srcH, current.nineSlice.factor);
}
