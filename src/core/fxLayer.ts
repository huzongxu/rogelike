/**
 * 通用 FX 层 —— 粒子拖尾/发光/冲击环/镜头震动(纯视觉,不参与任何结算)。
 *
 * 定位:本层只**观察**模拟状态(投射物、云、Fx 事件),绝不反向写入,
 * 因此标定/模拟管线(DPS 平衡)不受这里任何改动影响。
 * 随机性只用 core/math 的 rand()(纯装饰),不碰注入式 rng。
 *
 * 渲染:一次 save/restore 内切 "lighter" 加法混合,光晕走缓存的径向渐变
 * (渐变在原点构建,绘制时 translate 到粒子位置 —— 避免逐粒子建渐变)。
 * 未使用离屏画布:platform.createCanvas() 返回的是主画布,不能用于烘焙。
 */

import { rand, clamp01 } from "@game/core/math";

/** 粒子硬上限:满池后新请求直接丢弃(尸潮 420 投射物 + 340 敌人下仍需稳帧) */
const MAX_PARTICLES = 520;
const MAX_RINGS = 40;

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

export class FxLayer {
  particles: Particle[] = [];
  rings: Ring[] = [];
  /** 累计震动强度(px),tick 中衰减并换算成 shake 偏移 */
  private shakeAmp = 0;
  private shakeTime = 0;
  shake: { x: number; y: number } = { x: 0, y: 0 };
  /** 渐变缓存按颜色+光晕系数复用;键足够小,不需要淘汰 */
  private glowCache = new Map<string, CanvasGradient | null>();
  private glowTarget: CanvasRenderingContext2D | null = null;

  /** 发射一簇粒子(池满自动丢弃,不排队) */
  burst(o: BurstOpts): void {
    const room = MAX_PARTICLES - this.particles.length;
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
    if (this.particles.length >= MAX_PARTICLES) return;
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
    if (this.rings.length >= MAX_RINGS) return;
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

  /** 在世界坐标系绘制(调用方已 translate(-cam)) */
  draw(g: CanvasRenderingContext2D): void {
    if (this.glowTarget !== g) {
      this.glowTarget = g;
      this.glowCache.clear();
    }
    if (!this.particles.length && !this.rings.length) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of this.particles) this.drawParticle(g, p);
    for (const r of this.rings) this.drawRing(g, r);
    g.restore();
  }

  private drawParticle(g: CanvasRenderingContext2D, p: Particle): void {
    const t = clamp01(1 - p.ttl / p.life);
    const size = p.size * (1 + (p.endScale - 1) * t);
    if (size <= 0) return;
    g.translate(p.x, p.y);
    if (p.halo > 0) {
      const r = size * p.halo;
      const grad = this.glow(g, p.color, r);
      if (grad) {
        g.globalAlpha = clamp01(p.ttl / p.life) * 0.85;
        g.fillStyle = grad;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = clamp01(p.ttl / p.life);
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(0, 0, size, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.translate(-p.x, -p.y);
  }

  private drawRing(g: CanvasRenderingContext2D, r: Ring): void {
    const t = clamp01(1 - r.ttl / r.life);
    const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t)); // ease-out 扩张
    g.globalAlpha = clamp01(r.ttl / r.life);
    if (r.fill) {
      const grad = this.glow(g, r.color, rad);
      if (grad) {
        // 渐变缓存以原点为中心,绘制前平移到环心(与 drawParticle 同一套几何)
        g.translate(r.x, r.y);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(0, 0, rad, 0, Math.PI * 2);
        g.fill();
        g.translate(-r.x, -r.y);
      }
    } else {
      g.strokeStyle = r.color;
      g.lineWidth = Math.max(0.5, r.width * (1 - t));
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** 以原点为中心的径向渐变(配合 translate 使用);微信端 createRadialGradient 失败时返回 null 走实心点 */
  private glow(g: CanvasRenderingContext2D, color: string, r: number): CanvasGradient | null {
    const key = color + "|" + Math.round(r);
    const hit = this.glowCache.get(key);
    if (hit !== undefined) return hit;
    let grad: CanvasGradient | null = null;
    try {
      grad = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, r));
      grad.addColorStop(0, color);
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
    } catch {
      grad = null;
    }
    if (this.glowCache.size > 96) this.glowCache.clear();
    this.glowCache.set(key, grad);
    return grad;
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
