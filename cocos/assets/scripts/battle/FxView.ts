/**
 * FX 视图 —— Web 版 fxLayer.draw + drawSlamWarn + 伤害飘字的节点化替换。
 * 数据与推进(tick)留在 FxCore/BattleSim(纯逻辑),本类只做三件绘制:
 *   1. 粒子/冲击环:两个每帧重绘的 Graphics(Web 为加法混合径向渐变,这里以
 *      "外圈半透明光晕 + 实心核"近似,系数读 viewTable.fx.haloAlpha);
 *   2. 震击预警圈:Boss 三阶段 + 批 4 技能预警(圈色 = 载体色,全场雾型 = 战场 tint);
 *   3. 伤害飘字池:cc.NodePool + tween 上浮淡出(时长/位移/上限读 viewTable.fx)。
 */

import { Color, Graphics, Label, Node, NodePool, Tween, UIOpacity, Vec3, tween } from "cc";
import { DESIGN_W, placeRect } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { bindLabel, hexToColor, makeNode } from "../ui/Widgets";
import { HUD_TOP_H } from "../game/ui/hud";
import { hexA } from "../game/ui/theme";
import { clamp, clamp01 } from "../game/core/math";
import { BOSS_SLAM } from "../game/data/enemies";
import { particleSizeNow, ringRadiusNow } from "./FxCore";
import type { BattleSim } from "./BattleSim";

/** Web 相机 y 恒等于竞技场顶(= 顶坞高),与 BattleWorldView 同一推导 */
const CAM_Y = HUD_TOP_H;

/** 颜色 × alpha 系数(hexToColor 返回克隆,可安全改写) */
function shaded(color: string, mul: number): Color {
    const c = hexToColor(color);
    c.a = Math.round(clamp01((c.a / 255) * mul) * 255);
    return c;
}

export class FxView {
    private particles: Graphics;
    private telegraphs: Graphics;
    private floatLayer: Node;
    private floatPool = new NodePool();
    private activeFloats: Node[] = [];
    private wh: number;

    constructor(opts: { particles: Node; telegraphs: Node; floats: Node; wh: number }) {
        this.wh = opts.wh;
        this.particles = opts.particles.getComponent(Graphics) || opts.particles.addComponent(Graphics);
        this.telegraphs = opts.telegraphs.getComponent(Graphics) || opts.telegraphs.addComponent(Graphics);
        this.floatLayer = opts.floats;
        const p = viewTable().pool;
        for (let i = 0; i < p.floats; i++) this.floatPool.put(this.makeFloatNode());
    }

    setWorldHeight(wh: number): void {
        this.wh = wh;
    }

    private localX(x: number): number {
        return x - DESIGN_W / 2;
    }

    private localY(y: number): number {
        return this.wh / 2 - (y - CAM_Y);
    }

    /** 每帧重绘粒子/冲击环与预警圈(数据全部来自 sim,只读) */
    sync(sim: BattleSim): void {
        const fx = viewTable().fx;
        const g = this.particles;
        g.clear();
        for (const p of sim.fxLayer.particles) {
            const a = clamp01(p.ttl / p.life);
            const size = particleSizeNow(p);
            if (size <= 0 || a <= 0) continue;
            const lx = this.localX(p.x);
            const ly = this.localY(p.y);
            if (p.halo > 0) {
                g.fillColor = shaded(p.color, a * 0.85 * fx.haloAlpha);
                g.circle(lx, ly, size * p.halo);
                g.fill();
            }
            g.fillColor = shaded(p.color, a);
            g.circle(lx, ly, size);
            g.fill();
        }
        for (const r of sim.fxLayer.rings) {
            const a = clamp01(r.ttl / r.life);
            const t = clamp01(1 - r.ttl / r.life);
            const rad = ringRadiusNow(r);
            if (r.fill) {
                g.fillColor = shaded(r.color, a);
                g.circle(this.localX(r.x), this.localY(r.y), rad);
                g.fill();
            } else {
                g.lineWidth = Math.max(0.5, r.width * (1 - t));
                g.strokeColor = shaded(r.color, a);
                g.circle(this.localX(r.x), this.localY(r.y), rad);
                g.stroke();
            }
        }
        this.drawTelegraphs(sim);
    }

    /** 震击预警圈(对标 Web drawSlamWarn:Boss 红圈 + 批 4 技能预警,随蓄力进度变亮) */
    private drawTelegraphs(sim: BattleSim): void {
        const g = this.telegraphs;
        g.clear();
        const bossWarn = sim.enemies.find((e) => e.kind === "boss" && e.hp > 0 && e.bossSlamCharge > 0 && e.bossSlamPos);
        if (bossWarn && bossWarn.bossSlamPos) {
            const prog = 1 - bossWarn.bossSlamCharge / BOSS_SLAM.charge;
            const lx = this.localX(bossWarn.bossSlamPos.x);
            const ly = this.localY(bossWarn.bossSlamPos.y);
            g.lineWidth = 3;
            g.strokeColor = hexToColor(`rgba(255,60,60,${0.35 + 0.55 * prog})`);
            g.circle(lx, ly, BOSS_SLAM.radius);
            g.stroke();
            g.fillColor = hexToColor(`rgba(255,60,60,${0.06 + 0.14 * prog})`);
            g.circle(lx, ly, BOSS_SLAM.radius);
            g.fill();
        }
        for (const st of sim.skillTelegraphs) {
            const t = st.t;
            const prog = clamp(1 - t.charge / st.total, 0, 1);
            if (t.global) {
                // 全场雾型:战场 tint(arena 世界坐标 → 局部矩形)
                g.fillColor = hexToColor(hexA(t.color, 0.04 + 0.1 * prog));
                const x0 = this.localX(sim.arena.x0);
                const x1 = this.localX(sim.arena.x1);
                const y0 = this.localY(sim.arena.y0);
                const y1 = this.localY(sim.arena.y1);
                g.rect(x0, y1, x1 - x0, y0 - y1);
                g.fill();
                continue;
            }
            const lx = this.localX(t.pos.x);
            const ly = this.localY(t.pos.y);
            g.lineWidth = 3;
            g.strokeColor = hexToColor(hexA(t.color, 0.35 + 0.55 * prog));
            g.circle(lx, ly, t.radius);
            g.stroke();
            g.fillColor = hexToColor(hexA(t.color, 0.06 + 0.14 * prog));
            g.circle(lx, ly, t.radius);
            g.fill();
        }
    }

    /* ---------- 伤害飘字池 ---------- */

    private makeFloatNode(): Node {
        const fx = viewTable().fx;
        const n = makeNode("Damage");
        const lb = n.addComponent(Label);
        lb.fontSize = fx.floatPx;
        lb.lineHeight = Math.round(fx.floatPx * 1.25);
        lb.useSystemFont = true;
        lb.fontFamily = "system-ui, sans-serif";
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        n.addComponent(UIOpacity);
        n.active = false;
        return n;
    }

    /**
     * 伤害飘字(事件驱动):出池 → 线性上浮 floatRise + 淡出 floatTtl → 回池。
     * Web 基线:a = ttl/maxTtl,画在 (x, y-(1-a)*18),alpha = a —— 线性同源。
     */
    popDamage(pos: { x: number; y: number }, text: string, color: string): void {
        const fx = viewTable().fx;
        // 同屏上限(对标 Web dmgNums 200 上限):超限先回收最老一枚
        while (this.activeFloats.length >= fx.floatCap) this.recycleFloat(this.activeFloats[0], true);
        const n = this.floatPool.get() || this.makeFloatNode();
        if (!n.parent) this.floatLayer.addChild(n);
        n.active = true;
        const lb = n.getComponent(Label)!;
        bindLabel(lb, text);
        lb.color = hexToColor(color);
        const op = n.getComponent(UIOpacity)!;
        op.opacity = 255;
        // canvas 基线 y → 节点中心:上移约 0.35 字号,视觉与 fillText 基线对齐;落位走单一换算点
        placeRect(n, { x: pos.x, y: pos.y - CAM_Y - fx.floatPx * 0.35, w: 0, h: 0 }, DESIGN_W, this.wh);
        this.activeFloats.push(n);
        tween(n)
            .by(fx.floatTtl, { position: new Vec3(0, fx.floatRise, 0) })
            .call(() => this.recycleFloat(n, false))
            .start();
        tween(op)
            .to(fx.floatTtl, { opacity: 0 })
            .start();
    }

    private recycleFloat(n: Node, force: boolean): void {
        const idx = this.activeFloats.indexOf(n);
        if (idx >= 0) this.activeFloats.splice(idx, 1);
        if (force) {
            Tween.stopAllByTarget(n);
            Tween.stopAllByTarget(n.getComponent(UIOpacity)!);
        }
        n.active = false;
        this.floatPool.put(n);
    }

    /** 清场(换章/重开):停掉全部在飞飘字 */
    reset(): void {
        for (const n of [...this.activeFloats]) this.recycleFloat(n, true);
        this.particles.clear();
        this.telegraphs.clear();
    }
}
