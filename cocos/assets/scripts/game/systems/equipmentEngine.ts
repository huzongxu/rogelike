/**
 * 装备词缀引擎 —— 策划案 3.2/3.3 的核心实现。
 *
 * 每件装备 = 触发器(何时) + 效果(做什么) + 修饰器(怎么做)。
 * 引擎负责:
 *  1. 触发器判定:周期脉冲/击杀/受伤/移动/受击/连杀(事件驱动 + 帧驱动)
 *  2. 效果执行:飞刀/新星/骷髅/毒云/射线/闪电链/护盾/汲取
 *  3. 修饰器结算:连锁/爆炸/分裂/吸血/穿透/加速/增幅/持续
 *
 * 引擎不直接触碰渲染与平台 API,只通过 BattleContext 操作世界。
 */

import { type Vec2, vec2 } from "../core/math";
import type { Player } from "../entities/player";
import type { Enemy } from "../entities/enemy";
import type { Projectile } from "../entities/projectile";
import { spawnProjectile } from "../entities/projectile";
import type { Cloud, Minion } from "../entities/objects";
import { spawnCloud, spawnMinion } from "../entities/objects";
import type { Equipment } from "../data/equipmentGen";
import type { EffectInstance, EffectType } from "../data/affixes";
import { qualityDef, QUALITY_HASTE_CAP, QUALITY_BONUS_CONVERSION } from "../data/quality";
import { SET_BONUSES, SET_PIECE_TIERS, type SetBonusState } from "../data/sets";
import { COMBO_VALUES, type ComboStates } from "../data/combos";
import type { SeasonMutation } from "../data/seasonSets";

/** 特效(纯视觉) */
export interface Fx {
  type: "nova" | "explosion" | "lightning" | "heal" | "shield" | "knife";
  pos: Vec2;
  radius?: number;
  ttl: number;
  maxTtl: number;
}

/** 战斗上下文 —— 由 Game 提供,引擎通过它读写世界 */
export interface BattleContext {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  clouds: Cloud[];
  minions: Minion[];
  /** 全局触发间隔倍率(环境词缀"时间膨胀" = 2) */
  globalPulseMult?: number;
  /** 武器套组生效状态(需求优化 v2:2/4 件套联动;由 Game 每帧结算) */
  setBonus?: SetBonusState | null;
  /** 赛季联动词缀(DESIGN-SEASON-SETS L2;选套且 4 件套激活时由 statsOf 折入) */
  seasonMutation?: SeasonMutation | null;
  /** 跨套组合技激活状态(策划案 V3 §5;同 setBonus 实时结算;缺省 = 全部关闭) */
  comboActive?: ComboStates;
  addFx(fx: Fx): void;
  damageEnemy(
    e: Enemy,
    dmg: number,
    opts: { source: Equipment; lifesteal?: number; knockbackPower?: number; from?: Vec2 }
  ): void;
  healPlayer(v: number): void;
  addPlayerShield(amount: number, duration: number): void;
  /** Boss 阶段切换(策划案 V3 §3.2;由 Game 结算阶段后触发,驱动血条变色/阶段横幅) */
  onBossPhase?: (phase: 2 | 3) => void;
}

interface TriggerState {
  pulseTimer: number;
  pulseInterval: number;
  comboCount: number;
  comboWindowTimer: number;
  moveAccum: number;
  hurtCd: number;
  hitCd: number;
}

interface EffStats {
  power: number; // 伤害倍率(1 = 无增幅)
  haste: number; // 0-1,触发器间隔缩减比例
  durationBonus: number; // 秒
  chainTargets: number;
  splitExtra: number;
  explode?: { radius: number; damageMult: number };
  lifesteal: number; // 0-1
  pierce: number;
  radiusMult?: number; // 效果范围倍率(套组/修饰器;缺省 1)
  healMult?: number; // 回复量倍率(赛季联动词缀;缺省 1)
  summonExtra?: number; // 召唤数量加成(品质赠量 + 6件套质变)
  durationMult?: number; // 持续时长倍率(赛季联动词缀;缺省 1)
}

export class EquipmentEngine {
  private states = new Map<number, TriggerState>();
  /** 荆棘套 2 件「棘肤」:受击回血冷却 */
  private thornHealCd = 0;
  /** 最近一次击杀的敌人位置(亡灵冠冕唤出亡影的落点;null = 退化为玩家位置) */
  private lastKillPos: Vec2 | null = null;

  private stateOf(eq: Equipment): TriggerState {
    let s = this.states.get(eq.id);
    if (!s) {
      s = { pulseTimer: 0, pulseInterval: 0, comboCount: 0, comboWindowTimer: 0, moveAccum: 0, hurtCd: 0, hitCd: 0 };
      this.states.set(eq.id, s);
    }
    return s;
  }

  reset(): void {
    this.states.clear();
    this.thornHealCd = 0;
  }

  /** 只读查询:脉冲冷却剩余与当前生效间隔(战斗 HUD 倒计时用);无脉冲状态返 null */
  pulseLeft(eqId: number): { left: number; interval: number } | null {
    const st = this.states.get(eqId);
    if (!st || st.pulseInterval <= 0) return null;
    return { left: Math.max(0, st.pulseInterval - st.pulseTimer), interval: st.pulseInterval };
  }

  /** 帧驱动更新:周期脉冲 / 移动累积 */
  update(ctx: BattleContext, dt: number): void {
    for (const eq of ctx.player.equipment) {
      const st = this.stateOf(eq);
      // 连杀窗口
      if (st.comboWindowTimer > 0) {
        st.comboWindowTimer -= dt;
        if (st.comboWindowTimer <= 0) st.comboCount = 0;
      }
      if (st.hurtCd > 0) st.hurtCd -= dt;
      if (st.hitCd > 0) st.hitCd -= dt;
      if (this.thornHealCd > 0) this.thornHealCd -= dt;

      const moveDist = ctx.player.movedThisFrame;
      for (const tr of eq.triggers) {
        const intervalMul = 1 - this.statsOf(eq, ctx).haste;
        if (tr.def.type === "pulse") {
          st.pulseTimer += dt;
          const interval = Math.max(0.2, (tr.params.interval ?? 2) * intervalMul * (ctx.globalPulseMult ?? 1));
          st.pulseInterval = interval;
          if (st.pulseTimer >= interval) {
            st.pulseTimer = 0;
            this.fire(eq, ctx);
          }
        } else if (tr.def.type === "move") {
          st.moveAccum += moveDist;
          const need = (tr.params.distance ?? 500) * intervalMul;
          if (st.moveAccum >= need) {
            st.moveAccum = 0;
            this.fire(eq, ctx);
          }
        }
      }
    }
  }

  /** 事件:击杀敌人 */
  onKill(ctx: BattleContext, enemy: Enemy, opts?: { fromSplit?: boolean; source?: Equipment }): void {
    this.lastKillPos = vec2(enemy.pos.x, enemy.pos.y);
    for (const eq of ctx.player.equipment) {
      const st = this.stateOf(eq);
      for (const tr of eq.triggers) {
        if (tr.def.type === "kill") {
          if (Math.random() < (tr.params.chance ?? 0.2)) this.fire(eq, ctx);
        } else if (tr.def.type === "combo") {
          st.comboWindowTimer = tr.params.window ?? 2;
          st.comboCount += 1;
          if (st.comboCount >= (tr.params.count ?? 5)) {
            st.comboCount = 0;
            this.fire(eq, ctx);
          }
        }
      }
    }
    // 组合技「弹幕风暴」(策划案 V3 §5):击杀时分裂子弹;数值见 ../data/combos 的 COMBO_VALUES.barrage_storm。
    // 子弹 0 穿透 / 0 连锁;分裂子弹造成的击杀不再分裂(fromSplit 防无限递归)。
    if (ctx.comboActive?.barrage_storm && !opts?.fromSplit && opts?.source) {
      const bs = COMBO_VALUES.barrage_storm;
      const src = opts.source;
      const dmg = Math.max(1, Math.round(effDamageOf(src, bs.splitDamageMult)));
      for (let i = 0; i < bs.splitCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const p = spawnProjectile({
          kind: "knife",
          pos: vec2(enemy.pos.x, enemy.pos.y),
          dir: vec2(Math.cos(a), Math.sin(a)),
          speed: bs.splitSpeed,
          damage: dmg,
          pierce: 0,
          chainLeft: 0,
          source: src,
          splitChild: true,
        });
        ctx.projectiles.push(p);
      }
    }
  }

  /** 事件:玩家被击中(dmg 为扣除护盾前伤害;attacker = 攻击者,荆棘光环反弹用) */
  onHurt(ctx: BattleContext, dmg = 0, attacker?: Enemy | null): void {
    const p = ctx.player;
    // 荆棘套一档「棘肤」:受击回血;数值见 ../data/sets 的 SET_BONUSES
    const sb = ctx.setBonus;
    if (sb && sb.id === "thorn" && sb.pieces >= SET_PIECE_TIERS.tier1 && this.thornHealCd <= 0) {
      ctx.healPlayer(p.maxHp * SET_BONUSES.thorn3HealPct);
      this.thornHealCd = SET_BONUSES.thorn3HealCd;
    }
    for (const eq of p.equipment) {
      const st = this.stateOf(eq);
      for (const tr of eq.triggers) {
        if (tr.def.type === "hurt" && st.hurtCd <= 0) {
          if (p.hp / p.maxHp <= (tr.params.hpThreshold ?? 0.6)) {
            st.hurtCd = 1.2;
            this.fire(eq, ctx);
          }
        } else if (tr.def.type === "hit" && st.hitCd <= 0) {
          st.hitCd = 0.7;
          this.fire(eq, ctx);
        }
      }
    }
    // 组合技「荆棘光环」(策划案 V3 §5):反弹所受伤害 30% 给攻击者(无攻击者 → 最近敌人)。
    // 走正常 damageEnemy 管线;来源取首张受击触发卡,与荆棘套 4 件「反伤回响」乘算叠加是设计意图。
    if (ctx.comboActive?.thorn_aura && dmg > 0) {
      const target = attacker && attacker.hp > 0 ? attacker : this.nearest(p.pos, ctx.enemies, 640);
      const src = p.equipment.find((eq) => eq.triggers.some((t) => t.def.type === "hit")) ?? p.equipment[0];
      if (target && src) {
        ctx.damageEnemy(target, Math.max(1, Math.round(dmg * COMBO_VALUES.thorn_aura.reflectPct)), { source: src, from: p.pos });
      }
    }
  }

  /* ---------- 效果执行 ---------- */

  private fire(eq: Equipment, ctx: BattleContext): void {
    // 隐藏词缀(仅融合产出):替换常规效果执行
    if (eq.hiddenAffix) {
      this.castHidden(eq, ctx);
      return;
    }
    const s = this.statsOf(eq, ctx);
    const eff = eq.effect;
    switch (eff.def.type) {
      case "knife":
        this.castKnife(eq, eff, s, ctx);
        break;
      case "nova":
        this.castNova(eq, eff, s, ctx);
        break;
      case "skeleton":
        this.castSkeleton(eq, eff, s, ctx);
        break;
      case "cloud":
        this.castCloud(eq, eff, s, ctx);
        break;
      case "ray":
        this.castKnife(eq, eff, s, ctx, "ray");
        break;
      case "chain":
        this.castChain(eq, eff, s, ctx);
        break;
      case "shield":
        this.castShield(eff, s, ctx);
        break;
      case "drain":
        this.castDrain(eff, s, ctx);
        break;
      case "icelance":
        this.castIcelance(eq, eff, s, ctx);
        break;
      case "frost_ring":
        this.castFrostRing(eq, eff, s, ctx);
        break;
      case "meteor":
        this.castMeteor(eq, eff, s, ctx);
        break;
      case "magma_trail":
        this.castMagmaTrail(eq, eff, s, ctx);
        break;
      case "spirit_wolves":
        this.castSpiritWolves(eq, eff, s, ctx);
        break;
      case "haunt_crown":
        this.castHauntCrown(eq, eff, s, ctx);
        break;
    }
  }

  /** 冰锥(极北冰脉):追踪高伤单体,转向率 params.homing(rad/s);分裂修饰器加发数 */
  private castIcelance(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const range = (eff.params.radius ?? 640) * (s.radiusMult ?? 1);
    const target = this.nearest(ctx.player.pos, ctx.enemies, range);
    if (!target) return;
    const origin = vec2(ctx.player.pos.x, ctx.player.pos.y);
    const baseAngle = Math.atan2(target.pos.y - origin.y, target.pos.x - origin.x);
    const total = 1 + s.splitExtra;
    for (let i = 0; i < total; i++) {
      const angle = baseAngle + (i - (total - 1) / 2) * 0.35;
      const p = spawnProjectile({
        kind: "knife",
        pos: origin,
        dir: vec2(Math.cos(angle), Math.sin(angle)),
        speed: eff.params.speed ?? 700,
        damage: Math.round((eff.params.damage ?? 55) * s.power),
        radius: 6,
        pierce: s.pierce,
        chainLeft: s.chainTargets,
        chainRange: eff.params.radius ?? 640,
        explode: s.explode,
        lifesteal: s.lifesteal,
        homing: eff.params.homing ?? 4,
        source: eq,
      });
      ctx.projectiles.push(p);
    }
    ctx.addFx({ type: "knife", pos: origin, ttl: 0.12, maxTtl: 0.12 });
  }

  /** 霜环(极北冰脉):自身扩散环,扫过一次性伤害 + 减速;半径增长由 cloud tick 承担 */
  private castFrostRing(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const maxRadius = (eff.params.radius ?? 240) * (s.radiusMult ?? 1);
    const expandSpeed = eff.params.expandSpeed ?? 260;
    const p = ctx.player;
    const duration = ((eff.params.duration ?? 1) + s.durationBonus) * (s.durationMult ?? 1);
    const c = spawnCloud({
      pos: vec2(p.pos.x, p.pos.y),
      radius: 20,
      // 一次性伤害记在 dps 字段(ring tick 不按周期结算,扫到即吃一次)
      dps: Math.round((eff.params.damage ?? 25) * s.power),
      duration,
      explode: s.explode,
      ring: {
        expandSpeed,
        slow: eff.params.slow ?? 0.35,
        slowDuration: duration + 1,
      },
      source: eq,
    });
    // 环扩到 maxRadius 即可消散(ttl 兜底防漂浮环)
    c.ttl = Math.min(duration, maxRadius / expandSpeed);
    c.maxTtl = c.ttl;
    ctx.clouds.push(c);
    ctx.addFx({ type: "nova", pos: vec2(p.pos.x, p.pos.y), radius: 24, ttl: 0.25, maxTtl: 0.25 });
  }

  /** 陨星(熔核教团):敌人密集处 telegraph 倒计时,落点引爆 AOE + 留灼烧余烬;
   *  引爆在 cloud tick(ttl≤0)侧结算(game/balance-sim 镜像),爆炸修饰器走 cloud 消散通路自动引爆 */
  private castMeteor(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const impactRadius = (eff.params.radius ?? 140) * (s.radiusMult ?? 1);
    const target = this.nearest(ctx.player.pos, ctx.enemies, 640);
    const pos = target ? vec2(target.pos.x, target.pos.y) : vec2(ctx.player.pos.x, ctx.player.pos.y);
    const delay = ((eff.params.delay ?? 1) + s.durationBonus * 0.3) * (s.durationMult ?? 1);
    const burnDuration = 3 * (s.durationMult ?? 1);
    const c = spawnCloud({
      pos,
      radius: impactRadius,
      // 一次性引爆伤害记在 dps 字段(与霜环同款复用)
      dps: Math.round((eff.params.damage ?? 90) * s.power),
      duration: delay,
      explode: s.explode,
      meteor: {
        burnDps: Math.round((eff.params.damage ?? 90) * 0.09 * s.power), // 设计口径:dps 8g vs 伤害 90g
        burnRadius: 80 * (s.radiusMult ?? 1),
        burnDuration,
      },
      source: eq,
    });
    ctx.clouds.push(c);
    ctx.addFx({ type: "explosion", pos, radius: 12, ttl: 0.3, maxTtl: 0.3 });
  }

  /** 熔岩足迹(熔核教团):移动触发时在身后留灼烧小云;节流 = move 触发器的距离阈值 */
  private castMagmaTrail(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const p = ctx.player;
    const c = spawnCloud({
      pos: vec2(p.pos.x, p.pos.y),
      radius: (eff.params.radius ?? 60) * (s.radiusMult ?? 1),
      dps: Math.round((eff.params.dps ?? 12) * s.power),
      duration: ((eff.params.duration ?? 3) + s.durationBonus) * (s.durationMult ?? 1),
      explode: s.explode,
      source: eq,
    });
    ctx.clouds.push(c);
  }

  /** 灵狼(亡影剧团):群体近战协战;复用骷髅 AI,移速 ×1.3 */
  private castSpiritWolves(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const count = (eff.params.count ?? 2) + (s.summonExtra ?? 0);
    const damage = Math.round((eff.params.damage ?? 14) * s.power);
    const duration = ((eff.params.duration ?? 12) + s.durationBonus) * (s.durationMult ?? 1);
    const p = ctx.player;
    for (let i = 0; i < count; i++) {
      const m = spawnMinion({
        pos: vec2(p.pos.x + (Math.random() - 0.5) * 40, p.pos.y + (Math.random() - 0.5) * 40),
        hp: 40 + ctx.player.level * 6,
        damage,
        duration,
        speed: 273,
        color: "#c9a6ff",
        source: eq,
      });
      ctx.minions.push(m);
    }
    ctx.addFx({ type: "heal", pos: vec2(p.pos.x, p.pos.y), ttl: 0.25, maxTtl: 0.25 });
  }

  /** 亡灵冠冕(亡影剧团):击杀触发时在尸体处唤醒亡影;场上亡影上限 4(防滚雪球) */
  private castHauntCrown(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const shades = ctx.minions.filter((m) => m.shade);
    if (shades.length >= 4) return;
    const at = this.lastKillPos ?? vec2(ctx.player.pos.x, ctx.player.pos.y);
    const spawnCount = 1 + (s.summonExtra ?? 0);
    for (let i = 0; i < spawnCount && shades.length + i < 4; i++) {
      const m = spawnMinion({
        pos: vec2(at.x + (Math.random() - 0.5) * 30, at.y + (Math.random() - 0.5) * 30),
        hp: 30 + ctx.player.level * 5,
        damage: Math.round((eff.params.damage ?? 10) * s.power),
        duration: ((eff.params.duration ?? 8) + s.durationBonus) * (s.durationMult ?? 1),
        color: "#8f9bb3",
        shade: true,
        source: eq,
      });
      ctx.minions.push(m);
    }
  }

  private castKnife(
    eq: Equipment,
    eff: EffectInstance,
    s: EffStats,
    ctx: BattleContext,
    kind: "knife" | "ray" = "knife"
  ): void {
    const range = (eff.params.radius ?? 420)  * (s.radiusMult ?? 1);
    const enemies = ctx.enemies.filter((e) => e.hp > 0);
    if (enemies.length === 0) return;
    const origin = vec2(ctx.player.pos.x, ctx.player.pos.y);
    // 基础扇形多发(spread) + 分裂修饰器叠加,形成弹幕
    const total = (eff.params.spread ?? 1) + s.splitExtra;
    const base = this.nearest(origin, enemies, range);
    // 初始武器全向弹幕:spread ≥ 6 时均匀环绕 360°(前 5 章新手区不被围死,
    // 单侧扇形会被四边刷怪从背后包抄;商店随机卡 spread 1-3 不受影响)
    let baseAngle = base ? Math.atan2(base.pos.y - origin.y, base.pos.x - origin.x) : 0;
    let spreadAngle = Math.PI / 9; // 每发 20° 散布
    if ((eff.params.spread ?? 1) >= 6) {
      baseAngle = 0;
      spreadAngle = (Math.PI * 2) / total; // 360° 等分
    }

    for (let i = 0; i < total; i++) {
      const angle = baseAngle + (i - (total - 1) / 2) * spreadAngle;
      const p = spawnProjectile({
        kind,
        pos: origin,
        dir: vec2(Math.cos(angle), Math.sin(angle)),
        speed: eff.params.speed ?? 520,
        damage: Math.round((eff.params.damage ?? 18) * s.power),
        radius: kind === "ray" ? 7 : 5,
        pierce: s.pierce,
        chainLeft: s.chainTargets,
        chainRange: eff.params.radius ?? 300,
        explode: s.explode,
        lifesteal: s.lifesteal,
        slow: eff.params.slow,
        slowDuration: ((eff.params.duration ?? 2) + s.durationBonus) * (s.durationMult ?? 1),
        source: eq,
      });
      ctx.projectiles.push(p);
      if (i === 0) {
        ctx.addFx({ type: "knife", pos: vec2(origin.x, origin.y), ttl: 0.12, maxTtl: 0.12 });
      }
    }
  }

  private castNova(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const radius = (eff.params.radius ?? 130)  * (s.radiusMult ?? 1);
    const damage = Math.round((eff.params.damage ?? 30) * s.power);
    const p = ctx.player;
    ctx.addFx({ type: "nova", pos: vec2(p.pos.x, p.pos.y), radius, ttl: 0.35, maxTtl: 0.35 });
    for (const e of ctx.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
      if (d <= radius + e.def.radius) {
        ctx.damageEnemy(e, damage, {
          source: eq,
          lifesteal: s.lifesteal,
          knockbackPower: 120,
          from: p.pos,
        });
      }
    }
    // 组合技「深渊裂隙」(策划案 V3 §5):新星落点(= 玩家位置)留 3s 回血池,
    // 总治疗 = 新星伤害 ×40% 分 3 秒(0.25s tick);场上回血池上限 3 个,超出移除最旧。
    const ar = COMBO_VALUES.abyss_rift;
    if (ctx.comboActive?.abyss_rift) {
      const healClouds = ctx.clouds.filter((c) => c.heals);
      if (healClouds.length >= ar.poolCap) {
        const idx = ctx.clouds.indexOf(healClouds[0]); // clouds 按生成顺序入列,首个即最旧
        if (idx >= 0) ctx.clouds.splice(idx, 1);
      }
      const c = spawnCloud({
        pos: vec2(p.pos.x, p.pos.y),
        radius,
        dps: (damage * ar.healRatio) / ar.poolDuration,
        duration: ar.poolDuration,
        heals: true,
        source: eq,
      });
      ctx.clouds.push(c);
    }
  }

  private castSkeleton(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const count = (eff.params.count ?? 1) + (s.summonExtra ?? 0);
    const damage = Math.round((eff.params.damage ?? 12) * s.power);
    const duration = ((eff.params.duration ?? 12) + s.durationBonus) * (s.durationMult ?? 1);
    const p = ctx.player;
    for (let i = 0; i < count; i++) {
      const m = spawnMinion({
        pos: vec2(p.pos.x + (Math.random() - 0.5) * 40, p.pos.y + (Math.random() - 0.5) * 40),
        hp: 40 + ctx.player.level * 6,
        damage,
        duration,
        source: eq,
      });
      ctx.minions.push(m);
    }
    ctx.addFx({ type: "shield", pos: vec2(p.pos.x, p.pos.y), ttl: 0.25, maxTtl: 0.25 });
  }

  private castCloud(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const range = (eff.params.radius ?? 110)  * (s.radiusMult ?? 1);
    const nearest = this.nearest(ctx.player.pos, ctx.enemies, 640);
    const pos = nearest ? vec2(nearest.pos.x, nearest.pos.y) : vec2(ctx.player.pos.x, ctx.player.pos.y);
    const c = spawnCloud({
      pos,
      radius: range,
      dps: (eff.params.dps ?? 10) * s.power,
      duration: ((eff.params.duration ?? 4) + s.durationBonus) * (s.durationMult ?? 1),
      explode: s.explode,
      source: eq,
    });
    ctx.clouds.push(c);
  }

  private castChain(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const range = (eff.params.radius ?? 260)  * (s.radiusMult ?? 1);
    const damage = Math.round((eff.params.damage ?? 26) * s.power);
    const jumps = (eff.params.jumps ?? 3) + s.chainTargets;
    const visited = new Set<number>();
    let cur = this.nearest(ctx.player.pos, ctx.enemies, 640);
    for (let i = 0; i <= jumps && cur; i++) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      ctx.damageEnemy(cur, damage, {
        source: eq,
        lifesteal: s.lifesteal,
        knockbackPower: 40,
        from: ctx.player.pos,
      });
      ctx.addFx({ type: "lightning", pos: vec2(cur.pos.x, cur.pos.y), radius: 26, ttl: 0.2, maxTtl: 0.2 });
      if (s.explode) {
        this.explode(eq, ctx, cur.pos, s.explode, s);
      }
      cur = this.nearest(cur.pos, ctx.enemies, range, visited);
    }
  }

  private castShield(eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    ctx.addPlayerShield(eff.params.amount ?? 40, ((eff.params.duration ?? 6) + s.durationBonus) * (s.durationMult ?? 1));
    ctx.addFx({ type: "shield", pos: vec2(ctx.player.pos.x, ctx.player.pos.y), ttl: 0.3, maxTtl: 0.3 });
  }

  private castDrain(eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    ctx.healPlayer((eff.params.heal ?? 20) * s.power * (s.healMult ?? 1));
    ctx.addFx({ type: "heal", pos: vec2(ctx.player.pos.x, ctx.player.pos.y), ttl: 0.3, maxTtl: 0.3 });
  }

  /** 隐藏词缀执行(策划案 5.3):死亡弹幕 / 超新星 / 亡灵契约 / 死亡轨迹 */
  private castHidden(eq: Equipment, ctx: BattleContext): void {
    const eff = eq.effect;
    const origin = vec2(ctx.player.pos.x, ctx.player.pos.y);
    switch (eq.hiddenAffix) {
      case "death_barrage": {
        // 击杀时向所有方向发射 8 把飞刀
        const damage = Math.round((eff.params.damage ?? 18) * this.statsOf(eq, ctx).power);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const p = spawnProjectile({
            kind: "knife",
            pos: origin,
            dir: vec2(Math.cos(a), Math.sin(a)),
            speed: 620,
            damage,
            pierce: 1,
            lifesteal: this.statsOf(eq, ctx).lifesteal,
            source: eq,
          });
          ctx.projectiles.push(p);
        }
        break;
      }
      case "supernova": {
        // 范围+300%,每次触发后间隔+1秒(可叠加)
        const radius = (eff.params.radius ?? 130) * 4;
        const damage = Math.round((eff.params.damage ?? 30) * this.statsOf(eq, ctx).power);
        ctx.addFx({ type: "nova", pos: origin, radius, ttl: 0.5, maxTtl: 0.5 });
        for (const e of ctx.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(e.pos.x - origin.x, e.pos.y - origin.y);
          if (d <= radius + e.def.radius) {
            ctx.damageEnemy(e, damage, { source: eq, lifesteal: this.statsOf(eq, ctx).lifesteal, knockbackPower: 200, from: origin });
          }
        }
        for (const t of eq.triggers) {
          if (t.def.type === "pulse") t.params.interval = (t.params.interval ?? 2) + 1;
        }
        break;
      }
      case "necromancer": {
        // 受伤时召唤的骷髅数量翻倍,且骷髅攻击为角色回血
        const count = (eff.params.count ?? 1) * 2;
        const damage = Math.round((eff.params.damage ?? 12) * this.statsOf(eq, ctx).power);
        const st = this.statsOf(eq, ctx);
        const duration = ((eff.params.duration ?? 12) + st.durationBonus) * (st.durationMult ?? 1);
        for (let i = 0; i < count; i++) {
          const m = spawnMinion({
            pos: vec2(origin.x + (Math.random() - 0.5) * 40, origin.y + (Math.random() - 0.5) * 40),
            hp: 40 + ctx.player.level * 6,
            damage,
            duration,
            healOnHit: true,
            source: eq,
          });
          ctx.minions.push(m);
        }
        ctx.addFx({ type: "shield", pos: origin, ttl: 0.25, maxTtl: 0.25 });
        break;
      }
      case "death_trail": {
        // 毒云不再消散,永久留在地图上(上限10个)
        const nearest = this.nearest(origin, ctx.enemies, 640);
        const pos = nearest ? vec2(nearest.pos.x, nearest.pos.y) : origin;
        const c = spawnCloud({
          pos,
          radius: eff.params.radius ?? 110,
          dps: (eff.params.dps ?? 10) * this.statsOf(eq, ctx).power,
          duration: 99999,
          source: eq,
        });
        ctx.clouds.push(c);
        // 永久毒云上限 10 个,超出移除最旧的
        if (ctx.clouds.length > 10) ctx.clouds.splice(0, ctx.clouds.length - 10);
        break;
      }
    }
  }

  /** 爆炸修饰器:以 pos 为中心的范围伤害 */
  explode(
    eq: Equipment,
    ctx: BattleContext,
    pos: Vec2,
    x: { radius: number; damageMult: number },
    s: EffStats
  ): void {
    ctx.addFx({ type: "explosion", pos: vec2(pos.x, pos.y), radius: x.radius, ttl: 0.3, maxTtl: 0.3 });
    for (const e of ctx.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y);
      if (d <= x.radius + e.def.radius) {
        const dmg = Math.max(1, Math.round(effDamageOf(eq, x.damageMult)));
        ctx.damageEnemy(e, dmg, { source: eq, lifesteal: s.lifesteal, knockbackPower: 90, from: pos });
      }
    }
  }

  /** 从修饰器统计效果:连锁/爆炸/分裂/吸血/穿透/加速/增幅/持续 + 武器套组联动(需求优化 v2) */
  private statsOf(eq: Equipment, ctx: BattleContext): EffStats {
    const s: EffStats = { power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: 0, pierce: 0, radiusMult: 1, healMult: 1, durationMult: 1 };
    // 效果自带穿透(初始武器全向弹幕:params.pierce),与修饰器穿透叠加
    s.pierce += eq.effect.params.pierce ?? 0;
    for (const m of eq.modifiers) {
      switch (m.def.type) {
        case "chain":
          s.chainTargets += m.params.targets ?? 0;
          break;
        case "explode":
          s.explode = { radius: m.params.radius ?? 100, damageMult: m.params.damageMult ?? 0.8 };
          break;
        case "split":
          s.splitExtra += m.params.extra ?? 0;
          break;
        case "lifesteal":
          s.lifesteal += m.params.pct ?? 0;
          break;
        case "pierce":
          s.pierce += m.params.count ?? 0;
          break;
        case "haste":
          s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + (m.params.pct2 ?? 0));
          break;
        case "power":
          s.power *= 1 + (m.params.pct3 ?? 0);
          break;
        case "duration":
          s.durationBonus += m.params.sec ?? 0;
          break;
      }
    }
    // 品质新轴(装备系统重构):品质决定射速(触发间隔缩减)与赠量(按技能类别的数量/半径加成);
    // 数值成长(伤害/治疗/护盾)仍走装备等级 +12%/级。品质不再直接放大伤害。
    // 各档数值定义见 ../data/quality 品质规范表(唯一出处)。
    const qd = qualityDef(eq.quality);
    const qn = qd.bonusPoints;
    s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + qd.rateHaste);
    s.power *= qd.powerMult;
    const t = eq.effect.def.type;
    if (qn > 0) {
      if (t === "knife" || t === "ray" || t === "icelance") {
        s.splitExtra += qn; // 赠量:弹幕 +N
      } else if (t === "chain") {
        s.chainTargets += qn; // 赠量:连锁 +N 目标
      } else if (t === "nova" || t === "cloud" || t === "frost_ring" || t === "meteor" || t === "magma_trail") {
        s.radiusMult = (s.radiusMult ?? 1) * (1 + QUALITY_BONUS_CONVERSION.radiusPerPoint * qn); // 赠量:范围按点加成
      } else if (isSummonType(t)) {
        s.summonExtra = (s.summonExtra ?? 0) + Math.ceil(qn / QUALITY_BONUS_CONVERSION.summonPointsPerExtra); // 赠量:召唤按点折算
      } else {
        s.power *= 1 + QUALITY_BONUS_CONVERSION.fallbackPowerPerPoint * qn; // 护盾/汲取:数值补偿
      }
    }
    const sb = ctx.setBonus;
    // 3 件套一档加成;数值见 ../data/sets 的 SET_BONUSES
    if (sb && sb.pieces >= SET_PIECE_TIERS.tier1) {
      if (sb.id === "barrage") {
        s.splitExtra += SET_BONUSES.barrage3SplitExtra; // 齐射:弹幕 +1
        s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + SET_BONUSES.barrage3Haste); // 齐射:触发间隔 -8%
      } else if (sb.id === "ember") {
        s.durationBonus += SET_BONUSES.ember3DurationSec; // 余烬扩散:持续 +1 秒
        s.radiusMult = SET_BONUSES.ember3RadiusMult; // 余烬扩散:效果范围 +18%
      } else if (sb.id === "frost") {
        s.radiusMult = (s.radiusMult ?? 1) * SET_BONUSES.frost3RangeMult; // 锋寒:效果射程 +12%
      } else if (sb.id === "magma") {
        s.durationBonus += SET_BONUSES.magma3DurationSec; // 地火奔涌:持续 +1 秒
      } else if (sb.id === "phantom" && isSummonType(t)) {
        s.power *= SET_BONUSES.phantom3SummonPower; // 群影:召唤物伤害 +20%
      } else if (sb.id === "glacier") {
        s.radiusMult = (s.radiusMult ?? 1) * SET_BONUSES.glacier3RangeMult; // 界碑铭刻:效果射程 +10%
      } else if (sb.id === "blizzard") {
        s.splitExtra += SET_BONUSES.blizzard3SplitExtra; // 白啸:弹幕 +1
        s.pierce += SET_BONUSES.blizzard3PierceExtra; // 白啸:穿透 +1
      } else if (sb.id === "plague") {
        s.radiusMult = (s.radiusMult ?? 1) * SET_BONUSES.plague3RadiusMult; // 瘟薪蔓延:效果范围 +12%
      } else if (sb.id === "cinderfang") {
        s.chainTargets += SET_BONUSES.cinderfang3ChainExtra; // 炽牙:连锁 +1 目标
      } else if (sb.id === "requiem") {
        s.summonExtra = (s.summonExtra ?? 0) + SET_BONUSES.requiem3SummonExtra; // 安可:召唤数量 +1
      } else if (sb.id === "veil") {
        s.healMult = (s.healMult ?? 1) * SET_BONUSES.veil3HealMult; // 雾噬:回复量 +25%
      }
    }
    if (sb && sb.pieces >= SET_PIECE_TIERS.tier2) {
      // 6 件套质变(装备系统重构):翻倍类,与品质射速/赠量乘算才是收益最大化;数值见 SET_BONUSES
      if (sb.id === "thorn") {
        if (eq.triggers.some((tr) => tr.def.type === "hit" || tr.def.type === "hurt")) s.power *= SET_BONUSES.thorn6PowerMult; // 反伤回响·极:受击系伤害翻倍
      } else if (sb.id === "barrage") {
        if (t === "knife" || t === "ray" || t === "icelance") s.splitExtra += Math.max(1, s.splitExtra); // 弹幕风暴·极:弹幕翻倍(在品质/修饰器赠量之上再加一份)
      } else if (sb.id === "ember") {
        if (t === "nova" || t === "cloud" || t === "chain") {
          s.radiusMult = (s.radiusMult ?? 1) * SET_BONUSES.ember6Mult; // 元素天灾·极:范围翻倍
          s.durationMult = (s.durationMult ?? 1) * SET_BONUSES.ember6Mult; // 持续翻倍
        }
      } else if (sb.id === "frost") {
        if (t === "icelance" || t === "frost_ring") s.power *= SET_BONUSES.frost6PowerMult; // 极北威压·极:冰系伤害翻倍
      } else if (sb.id === "magma") {
        if (t === "meteor" || t === "magma_trail") s.power *= SET_BONUSES.magma6PowerMult; // 烈焰统治·极:火系伤害翻倍
      } else if (sb.id === "phantom" && isSummonType(t)) {
        s.power *= SET_BONUSES.phantom6SummonPower; // 亡者行军·极:召唤伤害 ×1.5
        s.summonExtra = (s.summonExtra ?? 0) + (s.summonExtra ?? 0) + 1; // 召唤数量翻倍(赠量翻倍再+1 保底)
      } else if (sb.id === "glacier") {
        if (t === "ray" || t === "frost_ring") s.power *= SET_BONUSES.glacier6PowerMult; // 冰川裁断·极:射线与霜环 ×1.6
      } else if (sb.id === "blizzard") {
        if (t === "knife" || t === "icelance") s.power *= SET_BONUSES.blizzard6PowerMult; // 白啸霜刃·极:飞刀与冰锥 ×1.6
      } else if (sb.id === "plague") {
        if (t === "cloud" || t === "nova" || t === "magma_trail") s.power *= SET_BONUSES.plague6PowerMult; // 熔毒瘟薪·极:三种地面伤害 ×1.6
      } else if (sb.id === "cinderfang") {
        if (t === "chain" || t === "meteor") s.power *= SET_BONUSES.cinderfang6PowerMult; // 雷殛·极:闪电链与陨星 ×1.5
      } else if (sb.id === "requiem" && isSummonType(t)) {
        s.power *= SET_BONUSES.requiem6SummonPower; // 镇魂安可·极:召唤物伤害 ×1.5
      } else if (sb.id === "veil") {
        s.healMult = (s.healMult ?? 1) * SET_BONUSES.veil6HealMult; // 雾缚噬灵·极:回复量翻倍
        s.lifesteal += SET_BONUSES.veil6Lifesteal; // 并附带吸血
      }
    }
    // 赛季联动词缀(DESIGN-SEASON-SETS L2):选套且 3 件套激活时叠放(门槛随 3/6 档位制),stat 级 ±15% 内
    const mut = ctx.seasonMutation;
    if (mut && sb && sb.pieces >= SET_PIECE_TIERS.tier1) {
      if (mut.patch.dmgMult) s.power *= mut.patch.dmgMult;
      if (mut.patch.intervalMult) s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + (1 - mut.patch.intervalMult));
      if (mut.patch.rangeMult) s.radiusMult = (s.radiusMult ?? 1) * mut.patch.rangeMult;
      if (mut.patch.healMult) s.healMult = (s.healMult ?? 1) * mut.patch.healMult;
      if (mut.patch.durationMult) s.durationMult = (s.durationMult ?? 1) * mut.patch.durationMult;
      // 亡影谢幕等召唤专属词缀:只对召唤系效果生效
      if (mut.patch.summonMult && isSummonType(eq.effect.def.type)) s.power *= mut.patch.summonMult;
    }
    // 跨套组合技(策划案 V3 §5;装备系统重构后重做:质变级 stat 加成,与品质射速/赠量互补不重叠——
    // 旧信号(连锁/分裂/穿透修饰器集)被品质赠量部分替代,组合技改为时间轴/资源轴质变)
    // 数值见 ../data/combos 的 COMBO_VALUES
    const co = ctx.comboActive;
    if (co?.barrage_storm) s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + COMBO_VALUES.barrage_storm.haste); // 弹幕风暴:全装备触发间隔 -20%(质变级,乘算品质射速)
    if (co?.abyss_rift) s.durationBonus += COMBO_VALUES.abyss_rift.durationSec; // 深渊裂隙:效果持续 +2 秒(落点回血池机制保留)
    if (co?.thorn_aura) s.healMult = (s.healMult ?? 1) * COMBO_VALUES.thorn_aura.healMult; // 荆棘光环:回复量 ×1.3(30% 反弹机制保留)
    return s;
  }

  private nearest(origin: Vec2, enemies: Enemy[], range: number, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (e.hidden) continue; // 隐匿者:隐身时不可被瞄准
      if (exclude?.has(e.id)) continue;
      const d = Math.hypot(e.pos.x - origin.x, e.pos.y - origin.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }
}

/** 供爆炸伤害计算:取装备效果的基础伤害 × 倍数(近似,不含增幅修正) */
function effDamageOf(eq: Equipment, mult: number): number {
  const dmg = eq.effect.params.damage ?? eq.effect.params.dps ?? 10;
  return dmg * mult;
}

/** 召唤系效果(亡影剧团套组「群影/亡者行军」与 summonMult 词缀的作用范围) */
function isSummonType(t: EffectType): boolean {
  return t === "skeleton" || t === "spirit_wolves" || t === "haunt_crown";
}
