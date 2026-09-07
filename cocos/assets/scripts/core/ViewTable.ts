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
    /**
     * Phase 3 三屏(主菜单玩家版 / 章间商店 / 英雄选择)的呈现常量。
     * 项目规则 docs/DESIGN-VALUES-SPEC.md:视图文件里不留裸数字与裸色,凡 Web 侧
     * 写在绘制路径里的内联字面量迁到 Cocos 时一律落这张表(默认值逐项对标 Web)。
     */
    phase3: Phase3Params;
    /**
     * Phase 4 成长系统屏的呈现常量(首屏:幻影榜)。口径同 phase3:Web 绘制路径里的
     * 内联字面量迁到 Cocos 时一律落表,默认值逐项对标 Web。
     */
    phase4: Phase4Params;
}

/** 含义:Phase 4 成长系统屏的呈现参数.单位:尺寸设计 px / 颜色为 CSS 串 */
export interface Phase4Params {
    /** 幻影榜玩家行底(Web drawLeaderboard rgba(255,215,106,0.10)) */
    lbRowPlayer: string;
    /** 幻影榜幽灵行底(rgba(255,255,255,0.05),与 phase3.heroRowIdle 同值,按屏分键便于独立调表) */
    lbRowGhost: string;
    /** 幻影榜幽灵行描边(rgba(255,255,255,0.15)) */
    lbRowGhostStroke: string;
    /** 幽灵行名次文字色(Web #e8e8e8) */
    lbGhostRank: string;
    /** 返回钮缺图回退底 / 描边(Web drawLeaderboard #2a3d55 + rgba(255,255,255,0.3)) */
    lbBackFallbackBg: string;
    lbBackFallbackStroke: string;

    /* ---------- 每日福利屏(Web drawDaily 4815-4937 的内联字面量) ---------- */
    /** 每日屏覆盖底(rgba(8,10,16,0.9);比排行屏的 0.86 更实,按屏分键) */
    dlDim: string;
    /** 宝箱区标签色(#4dffc8)与天赋区标签色(#c06cff) */
    dlBoxLabel: string;
    dlTalentLabel: string;
    /** 资源行文字色(#8f9bb3)与图标缺图时的替代字形(iconText 的 fallbackGlyph「◆」) */
    dlResText: string;
    dlResGlyph: string;
    /** 未领行三段文字:名字(#e8e8e8)/ 描述(#8f9bb3)/ 右文(#ffd76a) */
    dlRowName: string;
    dlRowDesc: string;
    dlRowStatus: string;
    /** 未领行底板缺图回退:底 rgba(255,255,255,0.05) + 描边 rgba(255,255,255,0.15) */
    dlRowFallbackBg: string;
    dlRowFallbackStroke: string;
    /** 宝箱已领:底 rgba(77,255,200,0.08) + 描边 rgba(77,255,200,0.5),名字与右文 #4dffc8 */
    dlBoxClaimedBg: string;
    dlBoxClaimedStroke: string;
    dlBoxClaimedText: string;
    /** 天赋已领:底 rgba(192,108,255,0.1) + 描边 rgba(192,108,255,0.55),名字与右文 #c06cff */
    dlTalentClaimedBg: string;
    dlTalentClaimedStroke: string;
    dlTalentClaimedText: string;
    /** 补领行可补领档:底 rgba(255,215,106,0.08) + 描边 theme.gold,标题 #ffd76a,右文 #ffd76a */
    dlMakeUpOpenBg: string;
    dlMakeUpOpenStroke: string;
    dlMakeUpOpenTitle: string;
    dlMakeUpOpenStatus: string;
    /** 补领行不可补领档(已补领或已首通):底 rgba(255,255,255,0.03) + 描边 rgba(255,255,255,0.12),
     *  标题 #8f9bb3,右文 #4dffc8 */
    dlMakeUpDoneBg: string;
    dlMakeUpDoneStroke: string;
    dlMakeUpDoneTitle: string;
    dlMakeUpDoneStatus: string;
    /** 返回钮(Web drawDaily 是纯色 rect,不走 skinButtonBase):#2a3d55 + rgba(255,255,255,0.3) + #cfcfcf */
    dlBackBg: string;
    dlBackStroke: string;
    dlBackText: string;

    /* ---------- 赛季通行证屏(Web drawPass 2618-2713 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86);排行屏同值,通行证屏再开一键以便独立调表) */
    psDim: string;
    /** 标题横幅文字色(Web skinHeader 的 color 实参 #ffd76a) */
    psTitle: string;
    /** 回响统计行(#e8e8e8) */
    psEcho: string;
    /** 高级轨状态行两档:已激活 #ffd76a / 未激活 #8f9bb3 */
    psPremOn: string;
    psPremOff: string;
    /** 激活行已激活档的状态文字(#8f9bb3;Web 该分支只放文字,不画底板) */
    psActDone: string;
    /** 激活行未激活档:btn_primary 缺图回退底 rgba(255,215,106,0.12) + theme.gold 描边,文字 theme.gold */
    psActFallbackBg: string;
    psActFallbackStroke: string;
    psActText: string;
    /** 档位行底:已领 rgba(77,255,200,0.08) / 未领 rgba(255,255,255,0.05)(Web 本屏行底全是纯代码矩形) */
    psRowClaimedBg: string;
    psRowBg: string;
    /** 档位行边:已解锁 #4dffc8 / 未解锁 rgba(255,255,255,0.15) */
    psRowStrokeUnlocked: string;
    psRowStrokeLocked: string;
    /** 行首行文字两档:已解锁 #4dffc8 / 未解锁 #8f9bb3 */
    psRowNameUnlocked: string;
    psRowNameLocked: string;
    /** 行免费轨文字(#cfcfcf) */
    psRowFree: string;
    /** 行高级轨文字两档:已激活 #ffd76a / 未激活 #8f9bb3 */
    psRowPremOn: string;
    psRowPremOff: string;
    /** 行右列三态:已领取 #4dffc8 / 可领取 #ffd76a / 未解锁 #5a6a80 */
    psStatusClaimed: string;
    psStatusReady: string;
    psStatusLocked: string;
    /** 总进度文字(#8f9bb3) */
    psProgressLabel: string;
    /** 总进度条缺图回退:轨道 rgba(255,255,255,0.12) + 填充 #c06cff */
    psBarFallbackTrack: string;
    psBarFallbackFill: string;
    /** 总进度条有贴图时盖住空缺的暗罩(skinBar 的 dim 默认档 rgba(10,12,18,0.72)) */
    psBarCover: string;
    /** 返回钮底板(skinIconButton 的 drawBaseBg 闭包恒画):#2a3d55 + rgba(255,255,255,0.3),文字 #cfcfcf */
    psBackBg: string;
    psBackStroke: string;
    psBackText: string;

    /* ---------- 装备升级屏(Web drawGearUp 3887-3977 与 onGearUpClick 3979-4000 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86),与 psDim 同值,按屏分键便于独立调表) */
    guDim: string;
    /** 标题「装备升级」(theme.gold;本屏没有横幅贴图,只有一档文字) */
    guTitle: string;
    /** 副标题(theme.textSecondary) */
    guSubtitle: string;
    /** 右上星尘文字(theme.stardust) */
    guStardust: string;
    /** 空态提示(Web 的字面量 #8f9bb3,与 textSecondary 同值但独立可调) */
    guEmpty: string;
    /** 行描述文字(theme.textSecondary;名字那档走品质色,由内容层从 qualityDef 取,不进表) */
    guDesc: string;
    /** 升级钮文字两档:可升级 theme.actionPrimary / 其余(满级与星尘不足)theme.textMuted */
    guBtnTextAfford: string;
    guBtnTextDisabled: string;
    /** 可升级档的 btn_minor 缺图回退(minorButtonBg 的平面底):#2A3D55 + rgba(255,255,255,0.3) */
    guBtnMinorFallbackBg: string;
    guBtnMinorFallbackStroke: string;
    /** 禁态代码形状底(Web 非 afford 分支的 fillRect + strokeRect):#1A1F2A + rgba(255,255,255,0.15) */
    guBtnDisabledBg: string;
    guBtnDisabledStroke: string;
    /** 徽记缺图回退的文字星两档:点亮 theme.stardust / 未点亮 #4a5164(替代字形「★」) */
    guStarLit: string;
    guStarDim: string;
    guStarGlyph: string;
    /** 未点亮徽记的节点不透明度(Web globalAlpha 0.22 折成 0..255;点亮档恒 255 不占键位) */
    guStarDimAlpha: number;
    /** 截断提示「仅显示前 14 件」(theme.textMuted) */
    guHint: string;
    /**
     * 返回钮底板:Web 的回退闭包只写了 fillRect("#1A1F2A"),strokeRect 沿用上一笔的
     * strokeStyle 与 lineWidth(列表里最后一枚禁档按钮留下的 rgba(255,255,255,0.15) / 1),
     * **与 daily / pass 那两屏的 rgba(255,255,255,0.3) 不同档**;文字色是 theme.echo
     * (daily / pass 是 #cfcfcf)。
     */
    guBackBg: string;
    guBackStroke: string;
    guBackText: string;

    /* ---------- 扭蛋机屏(Web drawGacha 3562-3702 与 onGachaClick 3704-3742 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86),与 psDim / guDim 同值,按屏分键便于独立调表) */
    gcDim: string;
    /** 面板底的代码底板(Web `panel()` 缺图回退同值):theme.bgPanel 填充 + 金描边 */
    gcPanelFallbackBg: string;
    gcPanelFallbackStroke: string;
    /** 标题「扭蛋机」:取主菜单标题同档的金(与 viewTable.menu.titleColor 同值),横幅档与缺图档共用同一色 */
    gcTitle: string;
    /** 券数文字(Web iconText 的 color #ffd76a)与缺图时的替代字形「✦」 */
    gcTicketText: string;
    gcTicketGlyph: string;
    /** 返回钮(Web skinIconButton 的 drawBaseBg):#2a3d55 + rgba(255,255,255,0.3),文字 #cfcfcf */
    gcBackBg: string;
    gcBackStroke: string;
    gcBackText: string;
    /** 单抽钮可抽档代码底(btn_minor 缺图时的回退):#3a2d4d + #c06cff,文字 #c8b6ff */
    gcSingleBg: string;
    gcSingleStroke: string;
    gcSingleText: string;
    /** 十连钮可抽档代码底(btn_primary 缺图时的回退):#c06cff + #ffd76a,文字 #ffd76a */
    gcTenBg: string;
    gcTenStroke: string;
    gcTenText: string;
    /** 广告钮未用档代码底:#1d3d2e + #4dffc8,文字 #4dffc8 */
    gcAdBg: string;
    gcAdStroke: string;
    gcAdText: string;
    /** 三枚钮的禁档代码底(Web 三处都是 #1a1f2a,描边分两档:钮 0.2 / 条 0.15)与文字 #5a6a80 */
    gcBtnDisabledBg: string;
    gcBtnDisabledStroke: string;
    gcPanelDisabledStroke: string;
    gcBtnTextDisabled: string;
    /** 钻石换券条可换档(纯代码矩形,无贴图):#3a3320 + #ffd76a,文字 #ffd76a */
    gcSwapBg: string;
    gcSwapStroke: string;
    gcSwapText: string;
    /** 保底标签两行(史诗 / 传奇同色 #8f9bb3) */
    gcPityLabel: string;
    /** 保底条缺图档:轨道 rgba(255,255,255,0.12);填充两档 史诗 #c8b6ff / 传奇 #ffd76a */
    gcBarFallbackTrack: string;
    gcBarFillEpic: string;
    gcBarFillLegend: string;
    /** 保底条有贴图时盖住空缺的暗罩(skinBar 的 dim 默认档 rgba(10,12,18,0.72)) */
    gcBarCover: string;
    /** 「最近抽取:」标签色(#8f9bb3)与右列「重复→星尘+N」色(#c8b6ff;名字那档走品质色) */
    gcResLabel: string;
    gcDupText: string;
    /** 收藏区三档:标签 #4dffc8 / 加成串 #ffd76a / 空态提示 #8f9bb3 */
    gcCollLabel: string;
    gcCollBonus: string;
    gcEmpty: string;
    /** 收藏行两档纯代码底板:选中 rgba(77,255,200,0.14)+#4dffc8 / 未选 rgba(255,255,255,0.04)+rgba(255,255,255,0.12) */
    gcRowSelFill: string;
    gcRowSelStroke: string;
    gcRowFill: string;
    gcRowStroke: string;
    /** 行内 Lv. 段(#8f9bb3)与「带入中」(#4dffc8);名字那档走品质色,由内容层从 qualityDef 取 */
    gcRowLevel: string;
    gcRowBadge: string;

    /* ---------- 转生与天赋屏(Web drawPrestige 4224-4353 与 onPrestigeClick 4355-4385 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86),与 psDim / guDim / gcDim 同值,按屏分键便于独立调表) */
    ptDim: string;
    /** 标题「转生与天赋」—— Web skinHeader 的 color 实参,横幅档与缺图档共用同一色 */
    ptTitle: string;
    /** 头部「回响点数 …」行(#e8e8e8)与「可支配 …」行(#ffd76a) */
    ptEcho: string;
    ptAvail: string;
    /** 头部后两行(路线行与图鉴行):Web 只设一次 fillStyle,两行同取此档 */
    ptMeta: string;
    /** 三系页签两档:选中 rgba(192,108,255,0.25) + #c06cff / 未选 rgba(255,255,255,0.04) + rgba(255,255,255,0.15) */
    ptTabSelFill: string;
    ptTabSelStroke: string;
    ptTabFill: string;
    ptTabStroke: string;
    /** 页签标题两档字色:选中 #c06cff / 未选 #8f9bb3 */
    ptTabTextSel: string;
    ptTabText: string;
    /** 节点行两档底板:已拥有 rgba(77,255,200,0.10) + #4dffc8 / 未拥有 rgba(255,255,255,0.04) + rgba(255,255,255,0.12) */
    ptRowOwnedFill: string;
    ptRowOwnedStroke: string;
    ptRowFill: string;
    ptRowStroke: string;
    /** 行名两档:已拥有 #4dffc8 / 未拥有 #e8e8e8(两档都加粗) */
    ptRowNameOwned: string;
    ptRowName: string;
    /** 右列「已拥有」文字色(#4dffc8);价格串两档 可负担 #ffd76a / 其余 #5a6a80 */
    ptOwnedText: string;
    ptCostAfford: string;
    ptCostLocked: string;
    /** 行描述(#9aa7bd) */
    ptDesc: string;
    /** 两个配置块的标签行(#8f9bb3)与钮的未选档三件(#2a3d55 + rgba(255,255,255,0.2) + #cfcfcf) */
    ptChoiceLabel: string;
    ptChoiceBg: string;
    ptChoiceStroke: string;
    ptChoiceText: string;
    /** 选中档的文字色两块同取 #0b0e14;底色与描边分两档:定向搜索 #ffd76a / 完美蓝图 #4dffc8 */
    ptChoiceTextSel: string;
    ptTriggerSelBg: string;
    ptTriggerSelStroke: string;
    ptEffectSelBg: string;
    ptEffectSelStroke: string;
    /** 开始新轮回钮(纯代码矩形,无贴图):#2a3d55 + #5ac8fa + #fff;描边宽度见共享层 PT_START_STROKE_W */
    ptStartBg: string;
    ptStartStroke: string;
    ptStartText: string;

    /* ---------- 委托挂机屏(Web drawCommission 5088-5200 与 drawCommissionPanel 5034-5086 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86),与 psDim / guDim / gcDim / ptDim 同值,按屏分键便于独立调表) */
    cmDim: string;
    /** 标题「委托挂机」—— Web skinHeader 的 color 实参,横幅档与缺图档共用同一色 */
    cmTitle: string;
    /** 词缀碎片读数(iconText 的 color #c8b6ff)与缺图时的替代字形「✧」 */
    cmFragmentText: string;
    cmFragmentGlyph: string;
    /** 星尘读数(iconText 的 color theme.stardust)与缺图时的替代字形「❋」 */
    cmStardustText: string;
    cmStardustGlyph: string;
    /** 「转生 N 次」行(#8f9bb3) */
    cmPrestiges: string;
    /** 兑换钮(纯代码矩形,无贴图):#3a2d4d + #c06cff,文字 #c8b6ff */
    cmExchangeBg: string;
    cmExchangeStroke: string;
    cmExchangeText: string;
    /** 返回钮(Web skinIconButton 的 drawBaseBg):#2a3d55 + rgba(255,255,255,0.3),文字 #cfcfcf */
    cmBackBg: string;
    cmBackStroke: string;
    cmBackText: string;
    /** 羊皮纸面板缺图回退:rgba(255,255,255,0.05) 填充 + rgba(200,182,255,0.35) 描边 */
    cmPanelFallbackBg: string;
    cmPanelFallbackStroke: string;
    /**
     * 面板三行文字的两档色 —— Web 注释点明的"唯一改文字色处":羊皮纸贴图命中时切深色
     * (第一行 #2a2a33、后两行 #4a4a55),缺图回退时才用亮色(#e8e8e8 / #8f9bb3)。
     */
    cmPanelLine1OnParch: string;
    cmPanelLine1Bare: string;
    cmPanelSubOnParch: string;
    cmPanelSubBare: string;
    /** 进度条缺图档:轨道 rgba(255,255,255,0.12) + 填充 #4dffc8 */
    cmBarFallbackTrack: string;
    cmBarFallbackFill: string;
    /** 进度条有贴图时盖住空缺的暗罩(skinBar 的 dim 默认档 rgba(10,12,18,0.72)) */
    cmBarCover: string;
    /** 领取钮(纯代码矩形):#1d3d2e + #4dffc8,文字 #4dffc8 */
    cmCollectBg: string;
    cmCollectStroke: string;
    cmCollectText: string;
    /** 放弃钮(纯代码矩形):#2a1d1d + rgba(255,90,90,0.4),文字 #ff8a8a */
    cmAbandonBg: string;
    cmAbandonStroke: string;
    cmAbandonText: string;
    /** 区域行两档底板:选中 rgba(200,182,255,0.14) + #c8b6ff / 未选 rgba(255,255,255,0.04) + rgba(255,255,255,0.12) */
    cmRowSelFill: string;
    cmRowSelStroke: string;
    cmRowFill: string;
    cmRowStroke: string;
    /** 行名三档:解锁且选中 #c8b6ff / 解锁未选中 #e8e8e8 / 锁定 #5a6a80(三档都加粗) */
    cmRowNameSel: string;
    cmRowName: string;
    cmRowNameLocked: string;
    /** 行第二行(#8f9bb3)与右对齐产出(#c8b6ff,仅解锁档绘制) */
    cmRowSub: string;
    cmRowRate: string;
    /** 难度说明行(#8f9bb3) */
    cmDiffLabel: string;
    /** 难度钮两档底板:选中 #ffd76a + #ffd76a / 未选 #2a3d55 + rgba(255,255,255,0.2) */
    cmDiffSelFill: string;
    cmDiffSelStroke: string;
    cmDiffFill: string;
    cmDiffStroke: string;
    /** 难度钮文字两档:选中 #0b0e14 / 未选 #cfcfcf(两行同取一档) */
    cmDiffSelText: string;
    cmDiffText: string;
    /** 开始委托钮(纯代码矩形):#2a3d55 + #5ac8fa + #fff;描边宽度见共享层 CM_START_STROKE_W */
    cmStartBg: string;
    cmStartStroke: string;
    cmStartText: string;

    /* ---------- 词缀融合屏(Web drawFusion 4412-4518 / drawHiddenChoice 4519-4555 / drawTriplePanel 4566-4613 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.86),与 psDim / guDim / gcDim / ptDim / cmDim 同值,按屏分键便于独立调表) */
    fuDim: string;
    /** 标题「装备融合」(Web 的直接 fillText 色 #4dffc8;横幅是裸 assets.draw,没有缺图回退档) */
    fuTitle: string;
    /** 星尘读数(iconText 的 color #c8b6ff)与缺图时的替代字形「❋」 */
    fuStardustText: string;
    fuStardustGlyph: string;
    /** 返回钮(纯代码矩形,无贴图):#2a3d55 + rgba(255,255,255,0.3),文字 #cfcfcf */
    fuBackBg: string;
    fuBackStroke: string;
    fuBackText: string;
    /** 装备不足 2 件与未选齐提示(两处同为 #8f9bb3,按用途分键) */
    fuEmpty: string;
    fuHint: string;
    /** 装备行底板四档:选中 A rgba(90,200,250,0.16) / B rgba(192,108,255,0.16) / C rgba(255,215,106,0.16) / 未选 rgba(255,255,255,0.04) */
    fuRowSelAFill: string;
    fuRowSelBFill: string;
    fuRowSelCFill: string;
    fuRowFill: string;
    /** 行描边未选档(rgba(255,255,255,0.12);选中档走品质色,由内容层从 qualityDef 取,不进表) */
    fuRowStroke: string;
    /** 行名与选中标记三档:选中 A #5ac8fa / B #c06cff / C #ffd76a(未选且可用那档走品质色) */
    fuRowSelAText: string;
    fuRowSelBText: string;
    fuRowSelCText: string;
    /** 隐藏词缀装备的行名档(#5a6a80,「不可作素材」) */
    fuRowNameDisabled: string;
    /** 行摘要(#cfcfcf) */
    fuRowSub: string;
    /** 成本与保底读数行(#e8e8e8)与规则说明行(#8f9bb3;预览行走品质色) */
    fuReadout: string;
    fuNote: string;
    /** 融合钮两档:可融合 #1d3d2e + #4dffc8 + #4dffc8 / 星尘不足 #1a1f2a + rgba(255,255,255,0.2) + #5a6a80 */
    fuFuseBg: string;
    fuFuseStroke: string;
    fuFuseText: string;
    fuFuseDisabledBg: string;
    fuFuseDisabledStroke: string;
    fuFuseTextDisabled: string;
    /** 三重模式钮两档:选中 rgba(255,215,106,0.22) + #ffd76a + #ffd76a / 未选 #2a3d55 + rgba(255,255,255,0.2) + #cfcfcf */
    fuModeSelFill: string;
    fuModeSelStroke: string;
    fuModeSelText: string;
    fuModeFill: string;
    fuModeStroke: string;
    fuModeText: string;
    /** 三选一弹层:覆盖底 rgba(4,6,10,0.92)、标题 #ffd76a、副行 #cfcfcf */
    fuHiddenDim: string;
    fuHiddenTitle: string;
    fuHiddenSub: string;
    /** 卡片底 rgba(255,215,106,0.08)(描边与名字走 hiddenAffixDef 的动态色)、描述 #cfcfcf、「点击选择」#8f9bb3 */
    fuHiddenCardFill: string;
    fuHiddenCardDesc: string;
    fuHiddenCardHint: string;

    /* ---------- 赛季结算屏(Web drawSeason 3847-3880 的内联字面量) ---------- */
    /** 全屏覆盖底(rgba(8,10,16,0.92);本屏没有面板底,这一笔就是全部背景) */
    seDim: string;
    /** 标题「赛季结算」(theme.gold) */
    seTitle: string;
    /** 摘要四行:赛季与主题名(#e8e8e8,与 textPrimary #E8ECF4 不同值,照 Web 字面量) */
    seSummarySeason: string;
    /** 赛季分行(theme.echo) */
    seSummaryScore: string;
    /** 星尘行(theme.stardust) */
    seSummaryStardust: string;
    /** 重置说明行(#8f9bb3,与 textSecondary 同值但 Web 写的是小写字面量) */
    seSummaryNote: string;
    /** 贴底钮(纯代码矩形):#2a3d55 + theme.gold 描边 + 白字(Web 写的是 `#fff`,本表色键一律 6 位档,故记作 #FFFFFF);描边宽度见共享层 SE_BTN_STROKE_W */
    seBtnFill: string;
    seBtnStroke: string;
    seBtnText: string;

    /* ---------- 死亡结算屏(Phase 5;Web drawGameOver 4015-4113 的内联字面量) ---------- */
    /** 全屏覆盖底 rgba(0,0,0,0.8)(本屏没有面板底,这一笔就是全部背景) */
    goDim: string;
    /** 标题「阵亡」(theme.hp 的近似值,Web 写的是 #ff5a5a,与 theme.hp #FF5A6E 不同值,照 Web 字面量) */
    goTitle: string;
    /** 生存行与波次·击杀行同为 #e8e8e8(与 textPrimary #E8ECF4 不同值,照 Web 字面量) */
    goStat: string;
    /** 回响行与星尘行共用同一笔金(Web 在 if 之前就把 fillStyle 定成 theme.gold,两档只差文案) */
    goEcho: string;
    /** 最佳纪录行 #8f9bb3(与 textSecondary 同值但 Web 写的是小写字面量) */
    goBest: string;
    /** 复活钮:btn_primary 九宫格优先,缺图退 #1d3d2e + #4dffc8(= theme.actionPrimaryBg / actionPrimary);描边宽度见共享层 GO_BTN_STROKE_W */
    goReviveFallbackBg: string;
    goReviveFallbackStroke: string;
    /** 复活钮文字 #4dffc8(theme.actionPrimary) */
    goReviveText: string;
    /** 重开钮:btn_minor 九宫格优先,缺图退 #2a3d55 + #5ac8fa(= theme.select) */
    goRestartFallbackBg: string;
    goRestartFallbackStroke: string;
    /** 三钮行文字一律白色(Web 三处都写 `#fff`,本表色键一律 6 位档) */
    goBtnText: string;
    /** 天赋钮(Web 这里没有贴图,纯代码矩形):#3a2d4d + #c06cff */
    goPrestigeBg: string;
    goPrestigeStroke: string;
    /** 菜单钮(Web 这里没有贴图,纯代码矩形):#1d2a3a + #8f9bb3 */
    goMenuBg: string;
    goMenuStroke: string;
    /** 幻影榜名次提示行(theme.gold) */
    goRank: string;
    /** 双倍钮可领档:btn_primary 优先,缺图退 #3a3320 + theme.gold */
    goDoubleBg: string;
    goDoubleStroke: string;
    /** 双倍钮文字可领档 theme.gold */
    goDoubleText: string;
    /** 双倍钮已领档:Web 的 `canDouble && skinButtonBase(...)` 短路成纯代码形状 #1a1f2a + rgba(255,255,255,0.15),文字 #5a6a80(= theme.textMuted) */
    goDoubleClaimedBg: string;
    goDoubleClaimedStroke: string;
    goDoubleTextClaimed: string;

    /* ---------- 通关结算屏(Phase 5;Web drawVictory 3746-3849 的内联字面量) ---------- */
    /** 全屏覆盖底 rgba(8,10,16,0.86)(本屏没有面板底,这一笔就是全部背景;与死亡屏那档不同值) */
    viDim: string;
    /** 标题「通关!」(theme.gold) */
    viTitle: string;
    /** 关卡行「第N关 · 关名」(#e8e8e8,与 textPrimary #E8ECF4 不同值,照 Web 字面量) */
    viStage: string;
    /** 星数行的替代字形档(星数贴图整幅缺图时才落这一行):theme.gold */
    viStarText: string;
    /** 每日首通行与扭蛋券行同为 #4dffc8(= theme.actionPrimary;Web 两处都写这个字面量,按用途分键) */
    viFirst: string;
    viTicket: string;
    /** 回响点数行(theme.gold) */
    viEcho: string;
    /** 星尘行与掉落行同为 #c8b6ff(= theme.echo;Web 两处都写这个字面量,按用途分键) */
    viStardust: string;
    viDrop: string;
    /** 幻影榜名次提示行(theme.gold) */
    viRank: string;
    /** 关卡框行两档:缺图档 #c8b6ff(= theme.echo);有图档被 Web 的 drawAvatarFrame 泄漏成金色 12px 粗体屏心左起笔 */
    viFrameText: string;
    viFrameTextGold: string;
    /** 框心关卡号(Web drawAvatarFrame 内部那一笔,固定 theme.gold) */
    viFrameBadgeText: string;
    /** 双倍钮可领档:btn_primary 优先,缺图退 #3a3320 + theme.gold(与死亡屏那两档同值,按屏分键) */
    viDoubleBg: string;
    viDoubleStroke: string;
    viDoubleText: string;
    /** 双倍钮已领档:`canDouble && skinButtonBase(...)` 短路成纯代码形状 #1a1f2a + rgba(255,255,255,0.15),文字 #5a6a80 */
    viDoubleClaimedBg: string;
    viDoubleClaimedStroke: string;
    viDoubleTextClaimed: string;
    /** 返回钮:btn_minor 九宫格优先,缺图退 #2a3d55 + #5ac8fa(= theme.select),文字白色 */
    viMenuFallbackBg: string;
    viMenuFallbackStroke: string;
    viMenuText: string;

    /* ---------- 体力不足屏(Phase 5;Web drawEnergy 4674-4745 的内联字面量) ---------- */
    /** 全屏覆盖底 rgba(8,10,16,0.92)(与赛季屏同值;本屏在它之上再铺一层 panelPad 九宫格面板底) */
    enDim: string;
    /** 标题「体力不足」#5ac8fa(= theme.select;Web 写的是小写字面量) */
    enTitle: string;
    /** 体力读数行「体力 N/MAX · 每 X 分钟恢复 1 点」(#e8e8e8,与 textPrimary #E8ECF4 不同值,照 Web 字面量) */
    enStat: string;
    /** 提示行「补充体力继续闯关,或关闭回到主菜单」(#8f9bb3,与 textSecondary 同值但 Web 写的是小写字面量) */
    enHint: string;
    /** 广告钮可用档:btn_primary 九宫格优先,缺图退 #1d3d2e + #4dffc8(= theme.actionPrimaryBg / actionPrimary);描边宽度见共享层 EN_BTN_STROKE_W */
    enAdFallbackBg: string;
    enAdFallbackStroke: string;
    /** 广告钮文字可用档 #4dffc8(theme.actionPrimary) */
    enAdText: string;
    /** 广告钮今日已用尽档:Web 的 `canAd && skinButtonBase(...)` 短路成纯代码形状 #1a1f2a + rgba(255,255,255,0.15),文字 #5a6a80(= theme.textMuted) */
    enAdOffBg: string;
    enAdOffStroke: string;
    enAdTextOff: string;
    /** 钻石钮充足档:btn_primary 优先,缺图退 #3a3320 + #ffd76a(= theme.gold) */
    enDiamondFallbackBg: string;
    enDiamondFallbackStroke: string;
    /** 钻石钮文字充足档 theme.gold */
    enDiamondText: string;
    /** 钻石不足档:与广告用尽档同一套禁态配色(按用途分键,便于整屏翻新时单独换档) */
    enDiamondOffBg: string;
    enDiamondOffStroke: string;
    enDiamondTextOff: string;
    /** 关闭钮(纯代码矩形,Web 这里没有贴图):#2a3d55 + #8f9bb3,文字 #cfcfcf */
    enCloseBg: string;
    enCloseStroke: string;
    enCloseText: string;
    /** 返回钮(纯代码矩形,屏幕右上角):#2a3d55 + rgba(255,255,255,0.3),文字 #cfcfcf */
    enBackBg: string;
    enBackStroke: string;
    enBackText: string;

    /* ---------- 二次确认弹层(Phase 5;Web drawConfirm 1208-1240 与 themePaint 的 panel/dangerButton/minorButton 内联字面量) ---------- */
    /** 全屏暗底 rgba(0,0,0,0.62)(与十六屏的覆盖底都不同值:本件是纯黑而不是深蓝,且不透明度最低) */
    cfDim: string;
    /** 盒底垫 panel_dark_corners 缺图回退(Web `panel(...)` 的 theme.bgPanel 填充 + `{ stroke: "#ffd76a" }`) */
    cfPanelFallbackBg: string;
    cfPanelFallbackStroke: string;
    /** 标题横幅 banner_mid_navy 缺图回退(Web 显式写了这一支:平面 rgba(18,24,44,0.88) + 1px rgba(255,215,106,0.35)) */
    cfBannerFallbackBg: string;
    cfBannerFallbackStroke: string;
    /** 标题「确认操作」#ffd76a(= theme.gold;粗体 fs.body) */
    cfTitle: string;
    /** 正文 #cfd6e2(Web 的字面量,与 textPrimary #E8ECF4 不同值) */
    cfBody: string;
    /** 确认钮 btn_danger 缺图回退(dangerButton 的 theme.actionDangerBg 填充 + rgba(255,107,122,0.4) 描边),文字 theme.actionDanger */
    cfOkFallbackBg: string;
    cfOkFallbackStroke: string;
    cfOkText: string;
    /** 取消钮 btn_minor 缺图回退(minorButtonBg 的 #2A3D55 填充 + rgba(255,255,255,0.3) 描边),文字 theme.textSecondary(Web 传的 color 是 undefined) */
    cfCancelFallbackBg: string;
    cfCancelFallbackStroke: string;
    cfCancelText: string;
}

export const PHASE4_DEFAULTS: Phase4Params = {
    lbRowPlayer: "rgba(255,215,106,0.10)",
    lbRowGhost: "rgba(255,255,255,0.05)",
    lbRowGhostStroke: "rgba(255,255,255,0.15)",
    lbGhostRank: "#E8E8E8",
    lbBackFallbackBg: "#2A3D55",
    lbBackFallbackStroke: "rgba(255,255,255,0.3)",
    dlDim: "rgba(8,10,16,0.9)",
    dlBoxLabel: "#4DFFC8",
    dlTalentLabel: "#C06CFF",
    dlResText: "#8F9BB3",
    dlResGlyph: "◆",
    dlRowName: "#E8E8E8",
    dlRowDesc: "#8F9BB3",
    dlRowStatus: "#FFD76A",
    dlRowFallbackBg: "rgba(255,255,255,0.05)",
    dlRowFallbackStroke: "rgba(255,255,255,0.15)",
    dlBoxClaimedBg: "rgba(77,255,200,0.08)",
    dlBoxClaimedStroke: "rgba(77,255,200,0.5)",
    dlBoxClaimedText: "#4DFFC8",
    dlTalentClaimedBg: "rgba(192,108,255,0.1)",
    dlTalentClaimedStroke: "rgba(192,108,255,0.55)",
    dlTalentClaimedText: "#C06CFF",
    dlMakeUpOpenBg: "rgba(255,215,106,0.08)",
    dlMakeUpOpenStroke: "#FFD76A",
    dlMakeUpOpenTitle: "#FFD76A",
    dlMakeUpOpenStatus: "#FFD76A",
    dlMakeUpDoneBg: "rgba(255,255,255,0.03)",
    dlMakeUpDoneStroke: "rgba(255,255,255,0.12)",
    dlMakeUpDoneTitle: "#8F9BB3",
    dlMakeUpDoneStatus: "#4DFFC8",
    dlBackBg: "#2A3D55",
    dlBackStroke: "rgba(255,255,255,0.3)",
    dlBackText: "#CFCFCF",

    /* 赛季通行证屏(逐项对标 Web drawPass) */
    psDim: "rgba(8,10,16,0.86)",
    psTitle: "#FFD76A",
    psEcho: "#E8E8E8",
    psPremOn: "#FFD76A",
    psPremOff: "#8F9BB3",
    psActDone: "#8F9BB3",
    psActFallbackBg: "rgba(255,215,106,0.12)",
    psActFallbackStroke: "#FFD76A",
    psActText: "#FFD76A",
    psRowClaimedBg: "rgba(77,255,200,0.08)",
    psRowBg: "rgba(255,255,255,0.05)",
    psRowStrokeUnlocked: "#4DFFC8",
    psRowStrokeLocked: "rgba(255,255,255,0.15)",
    psRowNameUnlocked: "#4DFFC8",
    psRowNameLocked: "#8F9BB3",
    psRowFree: "#CFCFCF",
    psRowPremOn: "#FFD76A",
    psRowPremOff: "#8F9BB3",
    psStatusClaimed: "#4DFFC8",
    psStatusReady: "#FFD76A",
    psStatusLocked: "#5A6A80",
    psProgressLabel: "#8F9BB3",
    psBarFallbackTrack: "rgba(255,255,255,0.12)",
    psBarFallbackFill: "#C06CFF",
    psBarCover: "rgba(10,12,18,0.72)",
    psBackBg: "#2A3D55",
    psBackStroke: "rgba(255,255,255,0.3)",
    psBackText: "#CFCFCF",

    /* 装备升级屏(逐项对标 Web drawGearUp / onGearUpClick) */
    guDim: "rgba(8,10,16,0.86)",
    guTitle: "#FFD76A",
    guSubtitle: "#8F9BB3",
    guStardust: "#7FD8FF",
    guEmpty: "#8F9BB3",
    guDesc: "#8F9BB3",
    guBtnTextAfford: "#4DFFC8",
    guBtnTextDisabled: "#5A6A80",
    guBtnMinorFallbackBg: "#2A3D55",
    guBtnMinorFallbackStroke: "rgba(255,255,255,0.3)",
    guBtnDisabledBg: "#1A1F2A",
    guBtnDisabledStroke: "rgba(255,255,255,0.15)",
    guStarLit: "#7FD8FF",
    guStarDim: "#4A5164",
    guStarGlyph: "★",
    guStarDimAlpha: 56,
    guHint: "#5A6A80",
    guBackBg: "#1A1F2A",
    guBackStroke: "rgba(255,255,255,0.15)",
    guBackText: "#C8B6FF",

    /* 扭蛋机屏(逐项对标 Web drawGacha / onGachaClick) */
    gcDim: "rgba(8,10,16,0.86)",
    gcPanelFallbackBg: "rgba(19,24,38,0.92)",
    gcPanelFallbackStroke: "#FFD76A",
    /** 像素暗黑批:本键对齐主菜单标题那一档(menu.titleColor),横幅上的字与标题同色同值 */
    gcTitle: "#FFD76A",
    gcTicketText: "#FFD76A",
    gcTicketGlyph: "✦",
    gcBackBg: "#2A3D55",
    gcBackStroke: "rgba(255,255,255,0.3)",
    gcBackText: "#CFCFCF",
    gcSingleBg: "#3A2D4D",
    gcSingleStroke: "#C06CFF",
    gcSingleText: "#C8B6FF",
    gcTenBg: "#C06CFF",
    gcTenStroke: "#FFD76A",
    gcTenText: "#FFD76A",
    gcAdBg: "#1D3D2E",
    gcAdStroke: "#4DFFC8",
    gcAdText: "#4DFFC8",
    gcBtnDisabledBg: "#1A1F2A",
    gcBtnDisabledStroke: "rgba(255,255,255,0.2)",
    gcPanelDisabledStroke: "rgba(255,255,255,0.15)",
    gcBtnTextDisabled: "#5A6A80",
    gcSwapBg: "#3A3320",
    gcSwapStroke: "#FFD76A",
    gcSwapText: "#FFD76A",
    gcPityLabel: "#8F9BB3",
    gcBarFallbackTrack: "rgba(255,255,255,0.12)",
    gcBarFillEpic: "#C8B6FF",
    gcBarFillLegend: "#FFD76A",
    gcBarCover: "rgba(10,12,18,0.72)",
    gcResLabel: "#8F9BB3",
    gcDupText: "#C8B6FF",
    gcCollLabel: "#4DFFC8",
    gcCollBonus: "#FFD76A",
    gcEmpty: "#8F9BB3",
    gcRowSelFill: "rgba(77,255,200,0.14)",
    gcRowSelStroke: "#4DFFC8",
    gcRowFill: "rgba(255,255,255,0.04)",
    gcRowStroke: "rgba(255,255,255,0.12)",
    gcRowLevel: "#8F9BB3",
    gcRowBadge: "#4DFFC8",

    /* 转生与天赋屏(逐项对标 Web drawPrestige / onPrestigeClick) */
    ptDim: "rgba(8,10,16,0.86)",
    ptTitle: "#C06CFF",
    ptEcho: "#E8E8E8",
    ptAvail: "#FFD76A",
    ptMeta: "#8F9BB3",
    ptTabSelFill: "rgba(192,108,255,0.25)",
    ptTabSelStroke: "#C06CFF",
    ptTabFill: "rgba(255,255,255,0.04)",
    ptTabStroke: "rgba(255,255,255,0.15)",
    ptTabTextSel: "#C06CFF",
    ptTabText: "#8F9BB3",
    ptRowOwnedFill: "rgba(77,255,200,0.10)",
    ptRowOwnedStroke: "#4DFFC8",
    ptRowFill: "rgba(255,255,255,0.04)",
    ptRowStroke: "rgba(255,255,255,0.12)",
    ptRowNameOwned: "#4DFFC8",
    ptRowName: "#E8E8E8",
    ptOwnedText: "#4DFFC8",
    ptCostAfford: "#FFD76A",
    ptCostLocked: "#5A6A80",
    ptDesc: "#9AA7BD",
    ptChoiceLabel: "#8F9BB3",
    ptChoiceBg: "#2A3D55",
    ptChoiceStroke: "rgba(255,255,255,0.2)",
    ptChoiceText: "#CFCFCF",
    ptChoiceTextSel: "#0B0E14",
    ptTriggerSelBg: "#FFD76A",
    ptTriggerSelStroke: "#FFD76A",
    ptEffectSelBg: "#4DFFC8",
    ptEffectSelStroke: "#4DFFC8",
    ptStartBg: "#2A3D55",
    ptStartStroke: "#5AC8FA",
    ptStartText: "#FFFFFF",

    /* 委托挂机屏(逐项对标 Web drawCommission / drawCommissionPanel) */
    cmDim: "rgba(8,10,16,0.86)",
    cmTitle: "#C8B6FF",
    cmFragmentText: "#C8B6FF",
    cmFragmentGlyph: "✧",
    cmStardustText: "#7FD8FF",
    cmStardustGlyph: "❋",
    cmPrestiges: "#8F9BB3",
    cmExchangeBg: "#3A2D4D",
    cmExchangeStroke: "#C06CFF",
    cmExchangeText: "#C8B6FF",
    cmBackBg: "#2A3D55",
    cmBackStroke: "rgba(255,255,255,0.3)",
    cmBackText: "#CFCFCF",
    cmPanelFallbackBg: "rgba(255,255,255,0.05)",
    cmPanelFallbackStroke: "rgba(200,182,255,0.35)",
    cmPanelLine1OnParch: "#2A2A33",
    cmPanelLine1Bare: "#E8E8E8",
    cmPanelSubOnParch: "#4A4A55",
    cmPanelSubBare: "#8F9BB3",
    cmBarFallbackTrack: "rgba(255,255,255,0.12)",
    cmBarFallbackFill: "#4DFFC8",
    cmBarCover: "rgba(10,12,18,0.72)",
    cmCollectBg: "#1D3D2E",
    cmCollectStroke: "#4DFFC8",
    cmCollectText: "#4DFFC8",
    cmAbandonBg: "#2A1D1D",
    cmAbandonStroke: "rgba(255,90,90,0.4)",
    cmAbandonText: "#FF8A8A",
    cmRowSelFill: "rgba(200,182,255,0.14)",
    cmRowSelStroke: "#C8B6FF",
    cmRowFill: "rgba(255,255,255,0.04)",
    cmRowStroke: "rgba(255,255,255,0.12)",
    cmRowNameSel: "#C8B6FF",
    cmRowName: "#E8E8E8",
    cmRowNameLocked: "#5A6A80",
    cmRowSub: "#8F9BB3",
    cmRowRate: "#C8B6FF",
    cmDiffLabel: "#8F9BB3",
    cmDiffSelFill: "#FFD76A",
    cmDiffSelStroke: "#FFD76A",
    cmDiffFill: "#2A3D55",
    cmDiffStroke: "rgba(255,255,255,0.2)",
    cmDiffSelText: "#0B0E14",
    cmDiffText: "#CFCFCF",
    cmStartBg: "#2A3D55",
    cmStartStroke: "#5AC8FA",
    cmStartText: "#FFFFFF",

    /* 词缀融合屏(逐项对标 Web drawFusion / drawHiddenChoice / drawTriplePanel) */
    fuDim: "rgba(8,10,16,0.86)",
    fuTitle: "#4DFFC8",
    fuStardustText: "#C8B6FF",
    fuStardustGlyph: "❋",
    fuBackBg: "#2A3D55",
    fuBackStroke: "rgba(255,255,255,0.3)",
    fuBackText: "#CFCFCF",
    fuEmpty: "#8F9BB3",
    fuHint: "#8F9BB3",
    fuRowSelAFill: "rgba(90,200,250,0.16)",
    fuRowSelBFill: "rgba(192,108,255,0.16)",
    fuRowSelCFill: "rgba(255,215,106,0.16)",
    fuRowFill: "rgba(255,255,255,0.04)",
    fuRowStroke: "rgba(255,255,255,0.12)",
    fuRowSelAText: "#5AC8FA",
    fuRowSelBText: "#C06CFF",
    fuRowSelCText: "#FFD76A",
    fuRowNameDisabled: "#5A6A80",
    fuRowSub: "#CFCFCF",
    fuReadout: "#E8E8E8",
    fuNote: "#8F9BB3",
    fuFuseBg: "#1D3D2E",
    fuFuseStroke: "#4DFFC8",
    fuFuseText: "#4DFFC8",
    fuFuseDisabledBg: "#1A1F2A",
    fuFuseDisabledStroke: "rgba(255,255,255,0.2)",
    fuFuseTextDisabled: "#5A6A80",
    fuModeSelFill: "rgba(255,215,106,0.22)",
    fuModeSelStroke: "#FFD76A",
    fuModeSelText: "#FFD76A",
    fuModeFill: "#2A3D55",
    fuModeStroke: "rgba(255,255,255,0.2)",
    fuModeText: "#CFCFCF",
    fuHiddenDim: "rgba(4,6,10,0.92)",
    fuHiddenTitle: "#FFD76A",
    fuHiddenSub: "#CFCFCF",
    fuHiddenCardFill: "rgba(255,215,106,0.08)",
    fuHiddenCardDesc: "#CFCFCF",
    fuHiddenCardHint: "#8F9BB3",

    /* 赛季结算屏(逐项对标 Web drawSeason) */
    seDim: "rgba(8,10,16,0.92)",
    seTitle: "#FFD76A",
    seSummarySeason: "#E8E8E8",
    seSummaryScore: "#C8B6FF",
    seSummaryStardust: "#7FD8FF",
    seSummaryNote: "#8F9BB3",
    seBtnFill: "#2A3D55",
    seBtnStroke: "#FFD76A",
    seBtnText: "#FFFFFF",
    goDim: "rgba(0,0,0,0.8)",
    goTitle: "#FF5A5A",
    goStat: "#E8E8E8",
    goEcho: "#FFD76A",
    goBest: "#8F9BB3",
    goReviveFallbackBg: "#1D3D2E",
    goReviveFallbackStroke: "#4DFFC8",
    goReviveText: "#4DFFC8",
    goRestartFallbackBg: "#2A3D55",
    goRestartFallbackStroke: "#5AC8FA",
    goBtnText: "#FFFFFF",
    goPrestigeBg: "#3A2D4D",
    goPrestigeStroke: "#C06CFF",
    goMenuBg: "#1D2A3A",
    goMenuStroke: "#8F9BB3",
    goRank: "#FFD76A",
    goDoubleBg: "#3A3320",
    goDoubleStroke: "#FFD76A",
    goDoubleText: "#FFD76A",
    goDoubleClaimedBg: "#1A1F2A",
    goDoubleClaimedStroke: "rgba(255,255,255,0.15)",
    goDoubleTextClaimed: "#5A6A80",

    /* 通关结算屏(逐项对标 Web drawVictory) */
    viDim: "rgba(8,10,16,0.86)",
    viTitle: "#FFD76A",
    viStage: "#E8E8E8",
    viStarText: "#FFD76A",
    viFirst: "#4DFFC8",
    viTicket: "#4DFFC8",
    viEcho: "#FFD76A",
    viStardust: "#C8B6FF",
    viDrop: "#C8B6FF",
    viRank: "#FFD76A",
    viFrameText: "#C8B6FF",
    viFrameTextGold: "#FFD76A",
    viFrameBadgeText: "#FFD76A",
    viDoubleBg: "#3A3320",
    viDoubleStroke: "#FFD76A",
    viDoubleText: "#FFD76A",
    viDoubleClaimedBg: "#1A1F2A",
    viDoubleClaimedStroke: "rgba(255,255,255,0.15)",
    viDoubleTextClaimed: "#5A6A80",
    viMenuFallbackBg: "#2A3D55",
    viMenuFallbackStroke: "#5AC8FA",
    viMenuText: "#FFFFFF",

    /* 体力不足屏(逐项对标 Web drawEnergy) */
    enDim: "rgba(8,10,16,0.92)",
    enTitle: "#5AC8FA",
    enStat: "#E8E8E8",
    enHint: "#8F9BB3",
    enAdFallbackBg: "#1D3D2E",
    enAdFallbackStroke: "#4DFFC8",
    enAdText: "#4DFFC8",
    enAdOffBg: "#1A1F2A",
    enAdOffStroke: "rgba(255,255,255,0.15)",
    enAdTextOff: "#5A6A80",
    enDiamondFallbackBg: "#3A3320",
    enDiamondFallbackStroke: "#FFD76A",
    enDiamondText: "#FFD76A",
    enDiamondOffBg: "#1A1F2A",
    enDiamondOffStroke: "rgba(255,255,255,0.15)",
    enDiamondTextOff: "#5A6A80",
    enCloseBg: "#2A3D55",
    enCloseStroke: "#8F9BB3",
    enCloseText: "#CFCFCF",
    enBackBg: "#2A3D55",
    enBackStroke: "rgba(255,255,255,0.3)",
    enBackText: "#CFCFCF",

    /* 二次确认弹层(逐项对标 Web drawConfirm 与 themePaint 的 panel / dangerButton / minorButton) */
    cfDim: "rgba(0,0,0,0.62)",
    cfPanelFallbackBg: "rgba(19,24,38,0.92)",
    cfPanelFallbackStroke: "#FFD76A",
    cfBannerFallbackBg: "rgba(18,24,44,0.88)",
    cfBannerFallbackStroke: "rgba(255,215,106,0.35)",
    cfTitle: "#FFD76A",
    cfBody: "#CFD6E2",
    cfOkFallbackBg: "#3A2222",
    cfOkFallbackStroke: "rgba(255,107,122,0.4)",
    cfOkText: "#FF6B7A",
    cfCancelFallbackBg: "#2A3D55",
    cfCancelFallbackStroke: "rgba(255,255,255,0.3)",
    cfCancelText: "#8F9BB3",
};

/** 含义:Phase 3 三屏的呈现参数.单位:不透明度 0~255 / 尺寸设计 px / 颜色为 CSS 串 */
export interface Phase3Params {
    /** 主菜单锁定关卡行整体不透明度(Web drawMenu 未解锁行 globalAlpha 0.55) */
    menuRowLockedAlpha: number;
    /** 主菜单已通关关卡行不透明度(通关只换常态板,减淡档留给"看得见但不在焦点") */
    menuRowClearedAlpha: number;
    /** 点回响筹码看一次激励视频入账的回响 */
    echoAdGain: number;
    /** 屏幕尚未接入时的提示条停留时长(秒) */
    hintTtl: number;
    /** 提示条字号 / 条高 / 底槽距顶缘 */
    hintPx: number;
    hintH: number;
    hintY: number;
    /** 提示条底色 / 文字色 */
    hintBg: string;
    hintFg: string;
    /** 商店与英雄屏的全屏暗底(Web drawShop rgba(8,10,16,0.82) / drawHeroes 0.86) */
    shopDim: string;
    panelDim: string;
    /** 禁态按钮底 / 描边(Web 商店刷新钮禁态 #1A1F2A + rgba(255,255,255,0.15)) */
    buttonDisabledBg: string;
    buttonDisabledStroke: string;
    /** 商店列表垫底带色(Web rgba(255,255,255,0.03)) 与分区条高(drawSectionHeader 26) */
    listZone: string;
    sectionBarH: number;
    /** 分区条缺图回退底 / 描边(Web rgba(11,14,20,0.85) + rgba(255,215,106,0.25)) */
    sectionFallbackBg: string;
    sectionFallbackStroke: string;
    /** 英雄列表行:预览高亮底 / 常态底 / 描边 / 未解锁底 */
    heroRowSel: string;
    heroRowIdle: string;
    heroRowStroke: string;
    /** 滚动条轨道与滑块(Web rgba(255,255,255,0.08) / hexA(select,0.6)) */
    scrollTrack: string;
    scrollThumb: string;
    /** 英雄详情面板底 / 描边 */
    detailBg: string;
    detailStroke: string;
    /** 行内小立绘与详情立绘缺图时的占位底(alpha 分量已含在色串里) */
    portraitFallback: string;
    /** 次级按钮正文色(Web 各处 skinButton 的 #cfcfcf) */
    buttonText: string;
    /** 商店售罄卡框的描边色(Web drawShop 的 #3a465c) */
    /** 顶信息条套组进度胶囊:宽 / 高(Web drawBar(g,bx,52,90,6)) */
    setBarW: number;
    setBarH: number;
    soldOutFrame: string;
}

export const PHASE3_DEFAULTS: Phase3Params = {
    menuRowLockedAlpha: 140,
    menuRowClearedAlpha: 235,
    echoAdGain: 100,
    hintTtl: 1.6,
    hintPx: 13,
    hintH: 34,
    hintY: 40,
    hintBg: "rgba(10,13,20,0.94)",
    hintFg: "#FFD76A",
    shopDim: "rgba(8,10,16,0.82)",
    panelDim: "rgba(8,10,16,0.86)",
    buttonDisabledBg: "#1A1F2A",
    buttonDisabledStroke: "rgba(255,255,255,0.15)",
    listZone: "rgba(255,255,255,0.03)",
    sectionBarH: 26,
    sectionFallbackBg: "rgba(11,14,20,0.85)",
    sectionFallbackStroke: "rgba(255,215,106,0.25)",
    heroRowSel: "rgba(90,200,250,0.14)",
    heroRowIdle: "rgba(255,255,255,0.05)",
    heroRowStroke: "rgba(255,255,255,0.15)",
    scrollTrack: "rgba(255,255,255,0.08)",
    scrollThumb: "rgba(90,200,250,0.6)",
    detailBg: "rgba(255,255,255,0.04)",
    detailStroke: "rgba(255,255,255,0.12)",
    portraitFallback: "rgba(255,255,255,0.06)",
    buttonText: "#CFCFCF",
    soldOutFrame: "#3A465C",
    setBarW: 90,
    setBarH: 6,
};


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
    phase3: { ...PHASE3_DEFAULTS },
    phase4: { ...PHASE4_DEFAULTS },
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
                phase3: typedMerge(FALLBACK.phase3, raw.phase3),
                phase4: typedMerge(FALLBACK.phase4, raw.phase4),
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
