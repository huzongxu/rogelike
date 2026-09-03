/**
 * 通用 FX 数据层 —— Web 版 src/core/fxLayer.ts 的纯数据+推进移植。
 * Particle/Ring/BurstOpts/RingOpts 时间轴与 tick 逐项保留(14 玩家技能 + 10 类敌人机制
 * 特效的既有发射参数不用重做),只有"画"从 Canvas2D 换成了 FxView 的节点渲染。
 * 本文件不 import cc:BattleSim(纯逻辑)持有实例并逐帧 tick,视图只读数组。
 */

import { rand, clamp01 } from "../game/core/math";

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ttl: number;
    life: number;
    size: number;
    /** 末期缩放到 size×endScale */
    endScale: number;
    color: string;
    /** 光晕半径 = size×halo;0 = 只画实心点 */
    halo: number;
    /** 每秒速度衰减比例 */
    drag: number;
    /** 重力 px/s²(向下为正) */
    grav: number;
}

export interface Ring {
    x: number;
    y: number;
    ttl: number;
    life: number;
    r0: number;
    r1: number;
    color: string;
    width: number;
    /** true = 实心闪光(陨星落地白闪),false = 描边冲击环 */
    fill: boolean;
}

export interface BurstOpts {
    x: number;
    y: number;
    /** 发射数量(受池上限约束,不足则少发) */
    count: number;
    color: string;
    /** 初速度区间 px/s */
    speed: [number, number];
    /** 尺寸区间 px */
    size: [number, number];
    /** 寿命区间 s */
    life: [number, number];
    /** 光晕半径系数,默认 3 */
    halo?: number;
    /** 角度区间 rad,默认整圈 */
    angle?: [number, number];
    /** 各向同性速度偏差比例,默认 0.35 */
    spread?: number;
    /** 拖尾(优先于 spread):每秒速度衰减比例 */
    drag?: number;
    /** 重力 px/s² */
    gravity?: number;
    /** 末期尺寸系数,默认 0.2 */
    endScale?: number;
    /** 旋涡:速度改为绕中心的切向(发射点相对中心的垂线方向),用于落点盘旋火屑 */
    orbit?: { cx: number; cy: number };
}

export interface RingOpts {
    x: number;
    y: number;
    r0: number;
    r1: number;
    life: number;
    color: string;
    width?: number;
    fill?: boolean;
}

export class FxLayerData {
    particles: Particle[] = [];
    rings: Ring[] = [];
    /** 累计震动强度(px),tick 中衰减并换算成 shake 偏移 */
    private shakeAmp = 0;
    private shakeTime = 0;
    shake: { x: number; y: number } = { x: 0, y: 0 };

    /** 粒子上限(满池后新请求直接丢弃);默认 = Web 版 MAX_PARTICLES,可由 viewTable.fx 覆盖 */
    maxParticles = 520;
    maxRings = 40;

    setCaps(maxParticles: number, maxRings: number): void {
        this.maxParticles = Math.max(1, Math.floor(maxParticles));
        this.maxRings = Math.max(1, Math.floor(maxRings));
    }

    /** 发射一簇粒子(池满自动丢弃,不排队) */
    burst(o: BurstOpts): void {
        const room = this.maxParticles - this.particles.length;
        const n = Math.min(o.count, room);
        const a0 = o.angle ? o.angle[0] : 0;
        const aSpan = o.angle ? o.angle[1] - o.angle[0] : Math.PI * 2;
        const spread = o.spread ?? 0.35;
        for (let i = 0; i < n; i++) {
            let ang = a0 + rand(0, aSpan);
            if (o.orbit) {
                const ra = Math.atan2(o.y - o.orbit.cy, o.x - o.orbit.cx);
                ang = ra + Math.PI / 2;
            }
            const spd = rand(o.speed[0], o.speed[1]);
            const size = rand(o.size[0], o.size[1]);
            const life = rand(o.life[0], o.life[1]);
            this.particles.push({
                x: o.x,
                y: o.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd * rand(1 - spread, 1 + spread),
                ttl: life,
                life,
                size,
                endScale: o.endScale ?? 0.2,
                color: o.color,
                halo: o.halo ?? 3,
                drag: o.drag ?? 0,
                grav: o.gravity ?? 0,
            });
        }
    }

    /** 追加拖尾粒子(单发,投射物逐帧调用;池满丢弃)。drift = 初速抖动幅度,越小条带越连续 */
    trail(x: number, y: number, color: string, size: number, life: number, halo = 2.5, drift = 6): void {
        if (this.particles.length >= this.maxParticles) return;
        this.particles.push({
            x,
            y,
            vx: rand(-drift, drift),
            vy: rand(-drift, drift),
            ttl: life,
            life,
            size,
            endScale: 0.1,
            color,
            halo,
            drag: 4,
            grav: 0,
        });
    }

    ring(o: RingOpts): void {
        if (this.rings.length >= this.maxRings) return;
        this.rings.push({
            x: o.x,
            y: o.y,
            ttl: o.life,
            life: o.life,
            r0: o.r0,
            r1: o.r1,
            color: o.color,
            width: o.width ?? 3,
            fill: o.fill ?? false,
        });
    }

    /** 叠加镜头震动(上限截断,避免连续爆炸把画面抖吐) */
    addShake(px: number): void {
        this.shakeAmp = Math.min(10, this.shakeAmp + px);
    }

    tick(dt: number): void {
        for (const p of this.particles) {
            if (p.drag) {
                const f = Math.max(0, 1 - p.drag * dt);
                p.vx *= f;
                p.vy *= f;
            }
            if (p.grav) p.vy += p.grav * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.ttl -= dt;
        }
        if (this.particles.length) this.particles = this.particles.filter((p) => p.ttl > 0);
        for (const r of this.rings) r.ttl -= dt;
        if (this.rings.length) this.rings = this.rings.filter((r) => r.ttl > 0);

        this.shakeAmp *= Math.max(0, 1 - 9 * dt);
        if (this.shakeAmp < 0.05) this.shakeAmp = 0;
        this.shakeTime += dt;
        this.shake.x = this.shakeAmp ? Math.sin(this.shakeTime * 61) * this.shakeAmp : 0;
        this.shake.y = this.shakeAmp ? Math.sin(this.shakeTime * 47 + 1.3) * this.shakeAmp * 0.7 : 0;
    }

    reset(): void {
        this.particles.length = 0;
        this.rings.length = 0;
        this.shakeAmp = 0;
        this.shakeTime = 0;
        this.shake.x = 0;
        this.shake.y = 0;
    }
}

/** 冲击环当前半径(ease-out 扩张),视图与数据共用同一插值 */
export function ringRadiusNow(r: Ring): number {
    const t = clamp01(1 - r.ttl / r.life);
    return r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
}

/** 粒子当前尺寸(末期缩放到 size×endScale) */
export function particleSizeNow(p: Particle): number {
    const t = clamp01(1 - p.ttl / p.life);
    return p.size * (1 + (p.endScale - 1) * t);
}
