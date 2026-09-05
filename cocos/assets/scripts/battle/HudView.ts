/**
 * 双坞 HUD —— Web 版 drawHUD/drawTopDock/drawBottomDock/drawDockPlate/drawHudTicker/
 * drawRestZone/drawGuideBanner + Boss 横幅的节点化替换。
 * 几何全部由共享层 game/ui/hud.ts 驱动(HUD_TOP_H/HUD_BOT_H/HUD_PAD/pickTicker/
 * equipRowLayout/barFillW);坞板走 hud_dock_top/hud_dock_bottom 九宫格(borderOf 推边距);
 * 文本尺寸/条几何/颜色读 viewTable.hud。Web measureText 驱动的横向量链以近似量字
 * (viewTable.hud.asciiWidth/spaceWidth)复现,文本本体一律 bindLabel。
 *
 * 基线换算:canvas fillText 基线 b、字号 px 的文本,视觉中心 ≈ b - 0.35px;
 * Label 节点统一以 baselineRect() 落位(placeRect 单一换算点,左/右/中对齐用锚点表达)。
 */

import { Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity } from "cc";
import { DESIGN_W, logicalH, placeRect, Rect } from "../core/DesignMetrics";
import { viewTable, borderOf } from "../core/ViewTable";
import { bindLabel, hexToColor, label, makeNode, sliced, solidRect } from "../ui/Widgets";
import { HUD_TOP_H, HUD_BOT_H, HUD_PAD, pickTicker, equipRowLayout, barFillW } from "../game/ui/hud";
import { hexA } from "../game/ui/theme";
import { clamp } from "../game/core/math";
import { COMBOS, comboStates } from "../game/data/combos";
import { chapterIntel } from "../game/data/intel";
import { chapterTypeInfo, chapterTypeLabel } from "../game/data/chapters";
import { CHAPTER_SECONDS } from "../game/data/stages";
import { ENERGY_MAX } from "../game/data/daily";
import { qualityDef } from "../game/data/quality";
import { setDef } from "../game/data/sets";
import { envAffixDef } from "../game/data/envAffixes";
import { xpToNext } from "../game/entities/player";
import type { BattleSim } from "./BattleSim";

/** 敌情图标键(与 Web drawHudTicker 的 intelIcon 同源) */
const INTEL_ICON: Record<string, string> = { 尸潮: "intel_horde", 重甲: "intel_armor", 异变: "intel_mutant", 精英: "intel_elite" };

/** 引导横幅几何(对标 Web drawGuideBanner:playing 态 by=300;shop 态属 Phase 3) */
const GUIDE_BW = Math.min(360, DESIGN_W - 24);
const GUIDE_BX = (DESIGN_W - GUIDE_BW) / 2;
const GUIDE_BY = 300;
const GUIDE_BH = 66;

export class HudView {
    readonly root: Node;
    private frames: Map<string, SpriteFrame>;
    private wh: number;

    /* 顶坞 */
    private hpBar: Graphics;
    private hpBarSig = "";
    private shieldBadge!: Node;
    private hpText!: Label;
    private hpTx = -1;
    private comboNodes: { gfx: Graphics; ch: Label; on: boolean }[] = [];
    private comboSig = "";
    private goldText!: Label;
    private killsText!: Label;
    private xpBar: Graphics;
    private xpBarSig = "";
    private lvText!: Label;
    private stageText!: Label;
    private energyText!: Label;
    private echoIcon!: Node;
    private echoText!: Label;
    private dustIcon!: Node;
    private dustText!: Label;
    private tickerIcon!: Node;
    private tickerText!: Label;

    /* 底坞 */
    private bossGroup!: Node;
    private bossBar: Graphics;
    private bossBarSig = "";
    private bossText!: Label;
    private chapterGroup!: Node;
    private chapterText!: Label;
    private chapterBar: Graphics;
    private chapterBarSig = "";
    private cardsRoot!: Node;
    private chipNode!: Node;
    private chipLabel: Label | null = null;
    private cardSig = "";
    private cardCd: Graphics[] = [];
    private cardName: Label[] = [];
    private cardSub: Label[] = [];

    /* 横幅 */
    private bossBanner!: Node;
    private bossBannerText!: Label;
    private guideBanner!: Node;
    private guideBody!: Label;
    private guideSig = "";

    /** 跳过引导回调(壳层接 sim.skipGuide) */
    onSkipGuide: (() => void) | null = null;

    constructor(parent: Node, frames: Map<string, SpriteFrame>, wh: number) {
        this.frames = frames;
        this.wh = wh;
        this.root = makeNode("Hud", parent);
        placeRect(this.root, { x: 0, y: 0, w: DESIGN_W, h: logicalH() });
        this.buildRestZone();
        this.buildTopDock();
        this.buildBottomDock();
        this.buildBossBanner();
        this.buildGuideBanner();
    }

    /* ================= 通用小件 ================= */

    /** 基线 y → 文本节点矩形(视觉中心 ≈ 基线 - 0.35×字号;行高 1.25×,与 label() 同源) */
    private baselineRect(x: number, b: number, px: number, w: number): Rect {
        return { x, y: b - px * 0.975, w, h: px * 1.25 };
    }

    /** 近似量字:CJK = 1×px,ASCII = asciiWidth×px,空格 = spaceWidth×px(viewTable 可调) */
    private approxW(text: string, px: number): number {
        const h = viewTable().hud;
        let w = 0;
        for (const ch of text) {
            if (ch === " ") w += px * h.spaceWidth;
            else if (ch.charCodeAt(0) > 0x2e7f) w += px;
            else w += px * h.asciiWidth;
        }
        return w;
    }

    /** 单行限宽(对标 Web fitOne:超宽逐字截断补「…」) */
    private fitOne(text: string, maxW: number, px: number): string {
        if (this.approxW(text, px) <= maxW) return text;
        const chars = [...text];
        while (chars.length > 1 && this.approxW(chars.join("") + "…", px) > maxW) chars.pop();
        return chars.join("") + "…";
    }

    /** 按像素宽度折行(对标 Web fitLines) */
    private fitLines(text: string, maxW: number, px: number): string[] {
        const out: string[] = [];
        let line = "";
        for (const c of [...text]) {
            const test = line + c;
            if (line && this.approxW(test, px) > maxW) {
                out.push(line);
                line = c;
            }
        }
        if (line) out.push(line);
        return out;
    }

    private mkLabelIn(parent: Node, name: string, x: number, baselineY: number, px: number, color: string, maxW: number, ax: number, bold = false): Label {
        const lb = label(name, parent, "", px, color, { bold });
        placeRect(lb.node, this.baselineRect(x, baselineY, px, maxW), DESIGN_W, logicalH(), ax, 0.5);
        return lb;
    }

    private mkLabel(name: string, x: number, baselineY: number, px: number, color: string, maxW: number, ax: number, bold = false): Label {
        return this.mkLabelIn(this.root, name, x, baselineY, px, color, maxW, ax, bold);
    }

    private makeIconIn(parent: Node, name: string, key: string, rect: Rect): Node {
        const n = makeNode(name, parent);
        const frame = this.frames.get(key);
        if (frame) {
            const sp = n.addComponent(Sprite);
            sp.spriteFrame = frame;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        placeRect(n, rect, DESIGN_W, logicalH(), 0, 1);
        return n;
    }

    private setIcon(n: Node, key: string): void {
        const sp = n.getComponent(Sprite);
        const frame = this.frames.get(key);
        if (!sp) {
            if (frame) {
                const added = n.addComponent(Sprite);
                added.spriteFrame = frame;
                added.sizeMode = Sprite.SizeMode.CUSTOM;
            }
            return;
        }
        if (frame && sp.spriteFrame !== frame) sp.spriteFrame = frame;
        sp.enabled = !!frame;
    }

    private makeBarNodeIn(parent: Node, name: string, rect: Rect): Graphics {
        const n = makeNode(name, parent);
        const g = n.addComponent(Graphics);
        placeRect(n, rect, DESIGN_W, logicalH());
        return g;
    }

    /**
     * 胶囊条(对标 Web ui/skin.ts drawBar):暗轨道 + 填充(最小宽 = h 保胶囊头)+
     * 上半叠光 + 盾覆层 + 细描边。填充宽走共享 barFillW。
     */
    private drawCapsuleBar(g: Graphics, w: number, hh: number, frac: number, color: string, overlayFrac = 0): void {
        const h = viewTable().hud;
        const r = hh / 2;
        g.clear();
        g.fillColor = hexToColor(h.barTrack);
        g.roundRect(-w / 2, -r, w, hh, r);
        g.fill();
        const fw = barFillW(w, hh, frac);
        if (fw > 0) {
            g.fillColor = hexToColor(color);
            g.roundRect(-w / 2, -r, fw, hh, r);
            g.fill();
            // 上半白色叠光(Web 为 clip 后 fillRect;此处以半高圆角矩形近似)
            g.fillColor = hexToColor(h.barGloss);
            g.roundRect(-w / 2, 0, fw, hh / 2, Math.min(r, hh / 4));
            g.fill();
        }
        if (overlayFrac > 0) {
            const ow = barFillW(w, hh, overlayFrac);
            g.fillColor = hexToColor(h.shieldOverlay);
            g.roundRect(-w / 2, -r, ow, hh, r);
            g.fill();
        }
        g.lineWidth = 1;
        g.strokeColor = hexToColor(h.barStroke);
        g.roundRect(-w / 2, -r, w, hh, r);
        g.stroke();
    }

    /* ================= 构建 ================= */

    private buildRestZone(): void {
        const h = viewTable().hud;
        const rest = logicalH() - this.wh;
        if (rest <= 0) return;
        solidRect("RestZone", this.root, { x: 0, y: this.wh, w: DESIGN_W, h: rest }, h.colors.restZoneFill);
        const line = makeNode("RestLine", this.root);
        const g = line.addComponent(Graphics);
        g.lineWidth = 1;
        g.strokeColor = hexToColor(h.colors.restZoneLine);
        g.moveTo(-DESIGN_W / 2, 0);
        g.lineTo(DESIGN_W / 2, 0);
        g.stroke();
        placeRect(line, { x: 0, y: this.wh, w: DESIGN_W, h: 1 });
    }

    /** 坞底板:贴图九宫格;缺图回退深色底 + 朝战场一侧的紫色描边(对标 drawDockPlate) */
    private dockPlate(name: string, key: string, rect: Rect, accentTop: boolean): void {
        const frame = this.frames.get(key);
        if (frame) {
            sliced(name, this.root, frame, rect, borderOf(key, frame.width, frame.height));
            return;
        }
        const n = solidRect(name, this.root, rect, "rgba(12,15,24,0.95)");
        const g = n.addComponent(Graphics);
        g.lineWidth = 1;
        g.strokeColor = hexToColor("rgba(200,182,255,0.28)");
        const y = accentTop ? rect.h / 2 - 0.5 : -rect.h / 2 + 0.5;
        g.moveTo(-rect.w / 2, y);
        g.lineTo(rect.w / 2, y);
        g.stroke();
    }

    private buildTopDock(): void {
        const h = viewTable().hud;
        const lx = HUD_PAD;
        const rx = DESIGN_W - HUD_PAD;
        this.dockPlate("TopDock", "hud_dock_top", { x: 0, y: 0, w: DESIGN_W, h: HUD_TOP_H }, false);

        // R1 左:血条 + 盾徽章 + HP 数值
        this.hpBar = this.makeBarNodeIn(this.root, "HpBar", { x: lx, y: 8, w: h.hpBarW, h: h.hpBarH });
        this.shieldBadge = this.makeIconIn(this.root, "ShieldBadge", "badge_shield_bronze", { x: lx + h.hpBarW + 4, y: 5, w: 14, h: 17 });
        this.shieldBadge.active = false;
        this.hpText = this.mkLabel("HpText", lx + h.hpBarW + 6, 19, h.pxMain, h.colors.hpText, 96, 0);

        // R1 中:跨套组合技圆钮(纯展示;字符基线 18 → 圆心 14.5,恰好文本中心 = 圆心)
        COMBOS.forEach((c, i) => {
            const x = 300 + i * 26;
            const node = makeNode("Combo" + i, this.root);
            placeRect(node, { x: x - 8, y: 14.5 - 8, w: 16, h: 16 });
            const gfx = node.addComponent(Graphics);
            const ch = label("Ch", node, c.name[0], h.pxCombo, h.colors.comboOffText, { bold: true, hAlign: Label.HorizontalAlign.CENTER });
            this.comboNodes.push({ gfx, ch, on: false });
        });

        // R1 右:金币 + 击杀(击杀右缘 = rx - 金币宽 - 12,近似量字)
        this.goldText = this.mkLabel("GoldText", rx - 110, 19, h.pxMain, h.colors.goldText, 110, 1);
        this.killsText = this.mkLabel("KillsText", rx - 110, 19, h.pxMain, h.colors.killsText, 110, 1);

        // R2 左:经验条 + 等级
        this.xpBar = this.makeBarNodeIn(this.root, "XpBar", { x: lx, y: 31, w: h.xpBarW, h: h.xpBarH });
        this.lvText = this.mkLabel("LvText", lx + h.hpBarW + 6, 39, h.pxSub, h.colors.lvText, 70, 0);

        // R2 右:关卡行
        this.stageText = this.mkLabel("StageText", rx - 325, 39, h.pxSub, h.colors.stageText, 325, 1, true);

        // R3 右:⚡ + 回响 + 星尘 量链(逐段近似量字向左推)
        this.energyText = this.mkLabel("EnergyText", 0, 58, h.pxMain, h.colors.energyText, 100, 0);
        this.echoIcon = this.makeIconIn(this.root, "EchoIcon", "icon_echo", { x: 0, y: 47, w: 13, h: 13 });
        this.echoText = this.mkLabel("EchoText", 0, 58, h.pxMain, h.colors.echoText, 110, 0);
        this.dustIcon = this.makeIconIn(this.root, "DustIcon", "icon_stardust", { x: 0, y: 47, w: 13, h: 13 });
        this.dustText = this.mkLabel("DustText", 0, 58, h.pxMain, h.colors.stardustText, 110, 0);

        // R3 左:单选行情条(敌情图标 + 文本)
        this.tickerIcon = this.makeIconIn(this.root, "TickerIcon", "intel_horde", { x: lx, y: 47, w: 12, h: 12 });
        this.tickerIcon.active = false;
        this.tickerText = this.mkLabel("TickerText", lx, 58, h.pxTicker, h.colors.autoOnText, 200, 0);
    }

    private buildBottomDock(): void {
        const h = viewTable().hud;
        const dy = this.wh - HUD_BOT_H;
        const rx = DESIGN_W - HUD_PAD;
        this.dockPlate("BottomDock", "hud_dock_bottom", { x: 0, y: dy, w: DESIGN_W, h: HUD_BOT_H }, true);

        // 右簇:Boss 血条组
        const bx = rx - h.bossBarW;
        const by = dy + 23;
        this.bossGroup = makeNode("BossGroup", this.root);
        this.bossGroup.active = false;
        this.makeIconIn(this.bossGroup, "BossIcon", "affix_boss", { x: bx - 24, y: by - 4, w: 18, h: 18 });
        this.bossBar = this.makeBarNodeIn(this.bossGroup, "BossBar", { x: bx, y: by, w: h.bossBarW, h: h.bossBarH });
        this.bossText = this.mkLabelIn(this.bossGroup, "BossText", bx, dy + 16, h.pxMain, h.bossPhaseColors[0], h.bossBarW, 0.5, true);

        // 右簇:章节进度组
        this.chapterGroup = makeNode("ChapterGroup", this.root);
        this.chapterText = this.mkLabelIn(this.chapterGroup, "ChapterText", rx - 120, dy + 17, h.pxMain, h.colors.chapterText, 120, 1);
        this.chapterBar = this.makeBarNodeIn(this.chapterGroup, "ChapterBar", { x: rx - h.chapterBarW, y: dy + 27, w: h.chapterBarW, h: h.chapterBarH });

        // 左簇容器:装备横排(最多 4 卡)+ 折叠芯片
        this.cardsRoot = makeNode("Cards", this.root);
        this.chipNode = makeNode("Chip", this.root);
        this.chipNode.active = false;
        this.chipNode.addComponent(Graphics);
    }

    private buildBossBanner(): void {
        const h = viewTable().hud;
        this.bossBanner = makeNode("BossBanner", this.root);
        this.bossBanner.active = false;
        placeRect(this.bossBanner, { x: 0, y: 0, w: DESIGN_W, h: logicalH() });
        this.bossBanner.addComponent(UIOpacity);
        const frame = this.frames.get("banner_mid_red");
        if (frame) {
            const spr = makeNode("BannerBg", this.bossBanner);
            const sp = spr.addComponent(Sprite);
            sp.spriteFrame = frame;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            placeRect(spr, { x: DESIGN_W / 2 - 110, y: this.wh * 0.28 - 30, w: 220, h: 40 });
        }
        this.bossBannerText = label("BannerText", this.bossBanner, "", h.pxBanner, h.colors.bannerText, {
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
        });
        placeRect(this.bossBannerText.node, this.baselineRect(DESIGN_W / 2 - 180, this.wh * 0.28, h.pxBanner, 360), DESIGN_W, logicalH(), 0.5, 0.5);
    }

    private buildGuideBanner(): void {
        const h = viewTable().hud;
        this.guideBanner = makeNode("GuideBanner", this.root);
        this.guideBanner.active = false;
        placeRect(this.guideBanner, { x: GUIDE_BX, y: GUIDE_BY, w: GUIDE_BW, h: GUIDE_BH });
        const frame = this.frames.get("banner_large_navy_b");
        if (frame) {
            const spr = makeNode("Bg", this.guideBanner);
            const sp = spr.addComponent(Sprite);
            sp.spriteFrame = frame;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            placeRect(spr, { x: 0, y: 0, w: GUIDE_BW, h: GUIDE_BH }, GUIDE_BW, GUIDE_BH);
        } else {
            const bg = makeNode("Bg", this.guideBanner);
            const g = bg.addComponent(Graphics);
            g.fillColor = hexToColor("rgba(10,13,20,0.94)");
            g.rect(-GUIDE_BW / 2, -GUIDE_BH / 2, GUIDE_BW, GUIDE_BH);
            g.fill();
            g.lineWidth = 1.5;
            g.strokeColor = hexToColor("#4dffc8");
            g.rect(-GUIDE_BW / 2, -GUIDE_BH / 2, GUIDE_BW, GUIDE_BH);
            g.stroke();
        }
        const head = label("Head", this.guideBanner, "新手提示", 11, h.colors.guideHead, { bold: true });
        placeRect(head.node, this.baselineRect(8, 14, 11, 120), GUIDE_BW, GUIDE_BH, 0, 0.5);

        // 跳过按钮(热区 = 视觉底板;右半屏,摇杆不拦截)
        const skip = makeNode("Skip", this.guideBanner);
        placeRect(skip, { x: GUIDE_BW - 54, y: 4, w: 48, h: 18 }, GUIDE_BW, GUIDE_BH);
        const sg = skip.addComponent(Graphics);
        sg.fillColor = hexToColor(h.colors.guideSkipBg);
        sg.rect(-24, -9, 48, 18);
        sg.fill();
        sg.lineWidth = 1;
        sg.strokeColor = hexToColor(h.colors.guideSkipStroke);
        sg.rect(-24, -9, 48, 18);
        sg.stroke();
        const skipText = label("SkipText", skip, "跳过", 10, h.colors.guideSkipText, { bold: true, hAlign: Label.HorizontalAlign.CENTER });
        skipText.node.setPosition(0, 13 - 10 * 0.35 - 9, 0); // 基线 skip.y+13 → 按钮中心(9)上方
        skip.on(Node.EventType.TOUCH_END, () => {
            if (this.onSkipGuide) this.onSkipGuide();
        }, this);

        // 正文(≤2 行,行高 16;首行基线 by+32 → 文本块在 sync 中按行数落位)
        this.guideBody = label("Body", this.guideBanner, "", 12, h.colors.guideBody, {});
        this.guideBody.lineHeight = 16;
        this.guideBody.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.guideBody.verticalAlign = Label.VerticalAlign.TOP;
        this.guideBody.overflow = Label.Overflow.NONE;
    }

    /* ================= 每帧绑定 ================= */

    sync(sim: BattleSim): void {
        this.syncTopDock(sim);
        this.syncBottomDock(sim);
        this.syncBanners(sim);
    }

    private syncTopDock(sim: BattleSim): void {
        const h = viewTable().hud;
        const p = sim.player;
        const lx = HUD_PAD;
        const rx = DESIGN_W - HUD_PAD;

        // R1:血条 + 盾 + HP 数值
        const hpFrac = p.hp / p.maxHp;
        const shieldFrac = p.shield > 0 ? clamp(p.shield / (p.maxHp * 0.6), 0, 1) : 0;
        const hpColor = hpFrac > h.hpLowFrac ? h.hpHigh : h.hpLow;
        const hpSig = `${hpFrac.toFixed(3)}|${hpColor}|${shieldFrac.toFixed(3)}`;
        if (hpSig !== this.hpBarSig) {
            this.hpBarSig = hpSig;
            this.drawCapsuleBar(this.hpBar, h.hpBarW, h.hpBarH, hpFrac, hpColor, shieldFrac);
        }
        this.shieldBadge.active = p.shield > 0;
        const hpTx = lx + h.hpBarW + (p.shield > 0 ? 22 : 6);
        if (hpTx !== this.hpTx) {
            this.hpTx = hpTx;
            placeRect(this.hpText.node, this.baselineRect(hpTx, 19, h.pxMain, 96), DESIGN_W, logicalH(), 0, 0.5);
        }
        bindLabel(this.hpText, this.fitOne(`${Math.ceil(p.hp)} / ${p.maxHp}`, 96, h.pxMain));

        // R1 中:组合技圆钮
        const cs = comboStates(p.equipment);
        const comboSig = COMBOS.map((c) => (cs[c.id] ? 1 : 0)).join("");
        if (comboSig !== this.comboSig) {
            this.comboSig = comboSig;
            COMBOS.forEach((c, i) => {
                const on = !!cs[c.id];
                const slot = this.comboNodes[i];
                if (slot.on === on) return;
                slot.on = on;
                const g = slot.gfx;
                g.clear();
                if (on) {
                    g.fillColor = hexToColor(c.color);
                    g.circle(0, 0, 8);
                    g.fill();
                    slot.ch.color = hexToColor(h.colors.comboOnText);
                } else {
                    g.lineWidth = 1.5;
                    g.strokeColor = hexToColor(h.colors.comboOffStroke);
                    g.circle(0, 0, 8);
                    g.stroke();
                    slot.ch.color = hexToColor(h.colors.comboOffText);
                }
            });
        }

        // R1 右:金币 + 击杀(击杀右缘随金币实宽左推)
        const goldTxt = this.fitOne(`金币 ${sim.gold}`, 110, h.pxMain);
        bindLabel(this.goldText, goldTxt);
        bindLabel(this.killsText, this.fitOne(`击杀 ${sim.kills}`, 110, h.pxMain));
        const goldW = this.approxW(goldTxt, h.pxMain);
        placeRect(this.killsText.node, this.baselineRect(rx - goldW - 12 - 110, 19, h.pxMain, 110), DESIGN_W, logicalH(), 1, 0.5);

        // R2:经验条 + 等级 + 关卡行
        const need = xpToNext(p.level);
        const xpFrac = p.xp / need;
        const xpSig = xpFrac.toFixed(3);
        if (xpSig !== this.xpBarSig) {
            this.xpBarSig = xpSig;
            this.drawCapsuleBar(this.xpBar, h.xpBarW, h.xpBarH, xpFrac, h.xpColor);
        }
        bindLabel(this.lvText, this.fitOne(`Lv.${p.level}`, 70, h.pxSub));
        const st = sim.currentStage;
        this.stageText.node.active = !!st;
        if (st) {
            const bossCh = st.bossChapter === sim.chapter && sim.bossSpawned && !sim.bossDead;
            const ctLabel = chapterTypeLabel(chapterTypeInfo(sim.chapter, st.bossChapter).type);
            const stTxt = `${st.name} · ${ctLabel} · 第 ${sim.chapter}/${st.chapters} 章${bossCh ? " · Boss!" : ""} · 剩余 ${Math.ceil(CHAPTER_SECONDS - sim.chapterTimer)}s`;
            bindLabel(this.stageText, this.fitOne(stTxt, 325, h.pxSub));
            this.stageText.color = hexToColor(bossCh ? h.colors.stageBossText : h.colors.stageText);
        }

        // R3 右:⚡ + 回响 + 星尘(icW = 13 + 4,与 Web iconText 同口径)
        sim.syncEnergy();
        const eTxt = this.fitOne(`⚡ ${sim.save.energy}/${ENERGY_MAX}`, 100, h.pxMain);
        const echoTxt = this.fitOne(`回响 ${sim.save.points}`, 110, h.pxMain);
        const dustTxt = this.fitOne(`星尘 ${sim.save.stardust}`, 110, h.pxMain);
        const icW = 13 + 4;
        const wE = this.approxW(eTxt, h.pxMain);
        const wEcho = this.approxW(echoTxt, h.pxMain);
        const chainW = wE + 12 + icW + wEcho + 12 + icW + this.approxW(dustTxt, h.pxMain);
        const cx0 = rx - chainW;
        bindLabel(this.energyText, eTxt);
        placeRect(this.energyText.node, this.baselineRect(cx0, 58, h.pxMain, 100), DESIGN_W, logicalH(), 0, 0.5);
        bindLabel(this.echoText, echoTxt);
        placeRect(this.echoIcon, { x: cx0 + wE + 12, y: 47, w: 13, h: 13 }, DESIGN_W, logicalH(), 0, 1);
        placeRect(this.echoText.node, this.baselineRect(cx0 + wE + 12 + icW, 58, h.pxMain, 110), DESIGN_W, logicalH(), 0, 0.5);
        bindLabel(this.dustText, dustTxt);
        const dustX = cx0 + wE + 12 + icW + wEcho + 12;
        placeRect(this.dustIcon, { x: dustX, y: 47, w: 13, h: 13 }, DESIGN_W, logicalH(), 0, 1);
        placeRect(this.dustText.node, this.baselineRect(dustX + icW, 58, h.pxMain, 110), DESIGN_W, logicalH(), 0, 0.5);

        // R3 左:单选行情条
        const tickW = Math.max(80, cx0 - 16 - lx);
        this.syncTicker(sim, tickW);
    }

    private syncTicker(sim: BattleSim, maxW: number): void {
        const h = viewTable().hud;
        const lx = HUD_PAD;
        const kind = pickTicker({
            combo: sim.combo >= 2,
            commission: sim.commissionReady(),
            intel: true,
            env: sim.envAffixes.length > 0,
            thorn: sim.isThornBuild(),
        });
        let text = "";
        let color = h.colors.autoOnText;
        let px = h.pxTicker;
        let bold = false;
        let iconKey = "";
        let textX = lx;
        if (kind === "combo") {
            bold = true;
            px = h.pxTickerBold;
            color = sim.frenzy ? h.colors.frenzyText : h.colors.comboText;
            text = sim.frenzy ? `狂潮!连杀 ×${sim.combo}` : `连杀 ×${sim.combo}`;
        } else if (kind === "commission") {
            bold = true;
            px = h.pxTickerBold;
            color = h.colors.commissionText;
            text = "委托已完成!主菜单可领取";
        } else if (kind === "env") {
            color = h.colors.envText;
            text = "环境:" + sim.envAffixes.map((t) => envAffixDef(t).name).join(" / ");
        } else if (kind === "thorn") {
            bold = true;
            px = h.pxTickerBold;
            color = h.colors.thornText;
            text = "荆棘回血:挨打回血,受击伤害+50%";
        } else if (kind === "intel") {
            const intel = chapterIntel(sim.chapter, sim.save.seasonId);
            iconKey = INTEL_ICON[intel.title] ?? "";
            if (iconKey && this.frames.has(iconKey)) textX = lx + 15;
            color = intel.recommended ? setDef(intel.recommended).color : h.colors.intelFallback;
            text = `敌情:${intel.title}(${intel.desc})${intel.recommended ? "→推荐" + setDef(intel.recommended).name : ""}`;
        } else {
            color = sim.autoMove ? h.colors.autoOnText : h.colors.autoOffText;
            text = sim.autoMove ? "挂机中(F6 切换)" : "手动(F6 挂机)";
        }
        text = this.fitOne(text, maxW - (textX - lx), px);
        const t = this.tickerText;
        if (t.fontSize !== px) t.fontSize = px;
        if (t.isBold !== bold) t.isBold = bold;
        t.color = hexToColor(color);
        bindLabel(t, text);
        placeRect(t.node, this.baselineRect(textX, 58, px, maxW), DESIGN_W, logicalH(), 0, 0.5);
        const showIcon = iconKey !== "" && this.frames.has(iconKey);
        this.tickerIcon.active = showIcon;
        if (showIcon) {
            this.setIcon(this.tickerIcon, iconKey);
            placeRect(this.tickerIcon, { x: lx, y: 47, w: 12, h: 12 }, DESIGN_W, logicalH(), 0, 1);
        }
    }

    private syncBottomDock(sim: BattleSim): void {
        const h = viewTable().hud;
        const dy = this.wh - HUD_BOT_H;
        const bossEnt = sim.enemies.find((e) => e.kind === "boss" && e.hp > 0);
        const boss = !!bossEnt;
        this.bossGroup.active = boss;
        this.chapterGroup.active = !boss && !!sim.currentStage;

        if (bossEnt) {
            const phaseColor = h.bossPhaseColors[bossEnt.bossPhase - 1] ?? h.bossPhaseColors[0];
            const sig = `${(bossEnt.hp / bossEnt.maxHp).toFixed(3)}|${phaseColor}`;
            if (sig !== this.bossBarSig) {
                this.bossBarSig = sig;
                this.drawCapsuleBar(this.bossBar, h.bossBarW, h.bossBarH, bossEnt.hp / bossEnt.maxHp, phaseColor);
            }
            this.bossText.color = hexToColor(phaseColor);
            bindLabel(this.bossText, this.fitOne(`深渊领主 · P${bossEnt.bossPhase}${bossEnt.bossVariant === "weak" ? "(弱化)" : ""}`, h.bossBarW, h.pxMain));
        } else if (sim.currentStage) {
            bindLabel(this.chapterText, this.fitOne(`第 ${sim.chapter}/${sim.currentStage.chapters} 章`, 120, h.pxMain));
            const frac = sim.chapterTimer / CHAPTER_SECONDS;
            const sig = frac.toFixed(3);
            if (sig !== this.chapterBarSig) {
                this.chapterBarSig = sig;
                this.drawCapsuleBar(this.chapterBar, h.chapterBarW, h.chapterBarH, frac, h.chapterColor);
            }
        }

        // 装备横排:布局签名变化时整体重建;每帧只刷 CD 条与文字
        const rightW = boss ? 260 : 190;
        const zoneW = DESIGN_W - HUD_PAD * 2 - rightW - 8;
        const eqs = sim.player.equipment;
        const L = equipRowLayout(eqs.length, boss, zoneW);
        const sig =
            `${boss ? 1 : 0}|${L.shown}|${L.cardW}|${L.chip ? L.hidden : 0}|` +
            eqs.slice(0, L.shown).map((e) => `${e.id}:${e.quality}:${e.effect.def.type}`).join(",");
        if (sig !== this.cardSig) {
            this.cardSig = sig;
            this.rebuildCards(sim, boss, dy);
        }
        for (let i = 0; i < this.cardName.length; i++) {
            const eq = eqs[i];
            if (!eq) continue;
            const cd = sim.engine.pulseLeft(eq.id);
            const cdG = this.cardCd[i];
            if (cdG) {
                cdG.clear();
                if (cd) {
                    const frac = 1 - cd.left / cd.interval;
                    const w = L.cardW - 6;
                    cdG.fillColor = hexToColor(h.colors.cdTrack);
                    cdG.rect(-L.cardW / 2 + 3, -16, w, 3);
                    cdG.fill();
                    cdG.fillColor = hexToColor(h.colors.cdFill);
                    cdG.rect(-L.cardW / 2 + 3, -16, w * frac, 3);
                    cdG.fill();
                }
            }
            const cdTxt = cd ? ` · ${cd.left.toFixed(1)}s` : "";
            const name = eq.hiddenAffix ? `【隐藏】${eq.effect.def.name}` : eq.effect.def.name;
            if (boss) {
                bindLabel(this.cardName[i], this.fitOne(name + cdTxt, L.cardW - 38, h.pxCard));
            } else {
                bindLabel(this.cardName[i], this.fitOne(name, L.cardW - 38, h.pxCard));
                const trig = eq.triggers.map((t) => t.def.name).join("/");
                const mod = eq.modifiers.map((m) => m.def.name).join("/");
                bindLabel(this.cardSub[i], this.fitOne(`${trig}${mod ? " · " + mod : ""}${cdTxt}`, L.cardW - 38, h.pxCardSub));
            }
        }
    }

    /** 装备卡重建(布局签名变化时):品质框 + 图标 + 双行文字 + 折叠芯片 */
    private rebuildCards(sim: BattleSim, boss: boolean, dy: number): void {
        const h = viewTable().hud;
        const lx = HUD_PAD;
        const cy = dy + 6;
        const cardH = 36;
        const rightW = boss ? 260 : 190;
        const zoneW = DESIGN_W - HUD_PAD * 2 - rightW - 8;
        const eqs = sim.player.equipment;
        const L = equipRowLayout(eqs.length, boss, zoneW);
        this.cardsRoot.removeAllChildren();
        this.cardCd = [];
        this.cardName = [];
        this.cardSub = [];
        let ex = lx;
        for (let i = 0; i < L.shown; i++) {
            const eq = eqs[i];
            if (!eq) break;
            const q = qualityDef(eq.quality);
            const card = makeNode("Card" + i, this.cardsRoot);
            placeRect(card, { x: ex, y: cy, w: L.cardW, h: cardH }, DESIGN_W, logicalH());
            // 品质框:圆角暗底 + 品质色描边 + 内发光描边(卡片局部坐标 = 中心原点)
            const bg = makeNode("Bg", card);
            const g = bg.addComponent(Graphics);
            g.fillColor = hexToColor(h.colors.cardBg);
            g.roundRect(-L.cardW / 2, -cardH / 2, L.cardW, cardH, 4);
            g.fill();
            g.lineWidth = 1.5;
            g.strokeColor = hexToColor(q.color);
            g.roundRect(-L.cardW / 2, -cardH / 2, L.cardW, cardH, 4);
            g.stroke();
            g.lineWidth = 1;
            g.strokeColor = hexToColor(hexA(q.color, 0.35));
            g.rect(-L.cardW / 2 + 2.5, -cardH / 2 + 2.5, L.cardW - 5, cardH - 5);
            g.stroke();
            // 效果图标(缺图回退:品质色圆底 + 效果名首字)
            const frame = this.frames.get(`icon_fx_${eq.effect.def.type}`);
            if (frame) {
                const icon = makeNode("Icon", card);
                const sp = icon.addComponent(Sprite);
                sp.spriteFrame = frame;
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                placeRect(icon, { x: 5, y: 6, w: 24, h: 24 }, L.cardW, cardH);
            } else {
                const icon = makeNode("IconFill", card);
                const ig = icon.addComponent(Graphics);
                ig.fillColor = hexToColor(hexA(q.color, 0.22));
                ig.circle(0, 0, 11);
                ig.fill();
                ig.lineWidth = 1;
                ig.strokeColor = hexToColor(hexA(q.color, 0.7));
                ig.circle(0, 0, 11);
                ig.stroke();
                placeRect(icon, { x: 17, y: 18, w: 0, h: 0 }, L.cardW, cardH);
                const ch = label("IconChar", card, eq.effect.def.name[0], 12, q.color, { bold: true, hAlign: Label.HorizontalAlign.CENTER });
                ch.node.setPosition(17 - L.cardW / 2, cardH / 2 - (22 - 12 * 0.35), 0); // 基线 cy+22
            }
            // 名称/副行(boss 收拢为仅名单行,基线 cy+22;平时 cy+15 / cy+30)
            const name = label("Name", card, "", h.pxCard, q.color, { bold: true });
            placeRect(name.node, this.baselineRect(33, boss ? 22 : 15, h.pxCard, L.cardW - 38), L.cardW, cardH, 0, 0.5);
            this.cardName.push(name);
            if (boss) {
                this.cardSub.push(name); // boss 单行:副行指向名称,bindLabel 幂等
            } else {
                const sub = label("Sub", card, "", h.pxCardSub, h.colors.cardSubText, {});
                placeRect(sub.node, this.baselineRect(33, 30, h.pxCardSub, L.cardW - 38), L.cardW, cardH, 0, 0.5);
                this.cardSub.push(sub);
            }
            // 脉冲 CD 条(每帧重绘;槽位 = 卡底 3px)
            const cdNode = makeNode("Cd", card);
            this.cardCd.push(cdNode.addComponent(Graphics));
            ex += L.cardW + L.gap;
        }
        // 折叠芯片(+N)
        this.chipNode.active = L.chip;
        if (L.chip) {
            placeRect(this.chipNode, { x: ex, y: cy, w: L.chipW, h: cardH }, DESIGN_W, logicalH());
            const g = this.chipNode.getComponent(Graphics)!;
            g.clear();
            g.fillColor = hexToColor(h.colors.chipBg);
            g.rect(-L.chipW / 2, -cardH / 2, L.chipW, cardH);
            g.fill();
            g.lineWidth = 1;
            g.strokeColor = hexToColor(h.colors.chipStroke);
            g.rect(-L.chipW / 2, -cardH / 2, L.chipW, cardH);
            g.stroke();
            if (!this.chipLabel || !this.chipLabel.isValid) {
                this.chipLabel = label("ChipText", this.chipNode, "", h.pxCard, h.colors.chipText, { bold: true, hAlign: Label.HorizontalAlign.CENTER });
            }
            this.chipLabel.node.setPosition(0, cardH / 2 - (22 - h.pxCard * 0.35), 0); // 基线 cy+22
            bindLabel(this.chipLabel, this.fitOne(`+${L.hidden}`, L.chipW - 4, h.pxCard));
        }
    }

    private syncBanners(sim: BattleSim): void {
        // Boss 阶段横幅
        const bb = sim.bossBanner;
        this.bossBanner.active = !!bb && bb.ttl > 0;
        if (bb) {
            this.bossBanner.getComponent(UIOpacity)!.opacity = Math.round(clamp(bb.ttl, 0, 1) * 255);
            bindLabel(this.bossBannerText, bb.text);
        }
        // 首局引导横幅
        const show = sim.started && !sim.over && sim.guide.enabled && !!sim.guide.current;
        this.guideBanner.active = show;
        if (show && sim.guide.current) {
            const text = sim.guide.current.text;
            if (text !== this.guideSig) {
                this.guideSig = text;
                const lines = this.fitLines(text, GUIDE_BW - 16, 12);
                bindLabel(this.guideBody, lines.slice(0, 2).join("\n"));
                const shown = Math.min(2, lines.length);
                // 首行基线 by+32 → 块顶 = 32 - 12*0.8;块高 = 行数 × 16(横幅局部,左上原点)
                const blockH = shown * 16;
                placeRect(this.guideBody.node, { x: 8, y: 32 - 12 * 0.8, w: GUIDE_BW - 16, h: blockH }, GUIDE_BW, GUIDE_BH, 0, 1);
            }
        } else if (!show && this.guideSig !== "") {
            this.guideSig = "";
        }
    }
}
