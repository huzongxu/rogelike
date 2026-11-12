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
import { applySlow, type Enemy } from "../entities/enemy";
import type { Projectile } from "../entities/projectile";
import { spawnProjectile } from "../entities/projectile";
import type { Cloud, Minion } from "../entities/objects";
import { spawnCloud, spawnMinion } from "../entities/objects";
import { artifactInnerCd, echoSpecOf, equipmentResonance, passiveEchoSpec, skillResonant, type Equipment } from "../data/equipmentGen";
import { CRIT_TRIGGER_CD, THORN_STACK } from "../data/combat";
import type { EffectInstance, EffectType, ModifierType, TriggerType } from "../data/affixes";
import { qualityDef, QUALITY_HASTE_CAP, QUALITY_BONUS_CONVERSION } from "../data/quality";
import { SET_BONUSES, type SetBonusState } from "../data/sets";
import { COMBO_VALUES, type ComboStates } from "../data/combos";
import type { SeasonMutation } from "../data/seasonSets";
import { RELIC_VALUES, isRelicType, passiveStackMult, type MorphPatch, type PassiveType } from "../data/artifacts";
import { heroSkillDef } from "../data/heroSkills";
import { buildBranch, hasChapterBuild, selectedBuildPatch } from "../data/heroBuild";
import { HIT_RHYTHM_WINDOW, isRhythm, rhythmIntervalMult, rhythmThresholdMult, type RhythmId } from "../data/rhythm";

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
  /** 世界层当前连杀数(共鸣变形「连杀飞刃 / 连杀雷链」读它;缺省 0) */
  comboCount?: number;
  /** 赛季序号(R5 赛季共鸣格 / 过季回响的输入;缺省 = 只看基础共鸣格) */
  seasonId?: number;
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
  /** 隐藏触发器「暴击触发」的冷却(秒);常量见 ../data/combat 的 CRIT_TRIGGER_CD */
  critCd: number;
  /** 隐藏修饰器「回响」:剩余延迟秒数(>0 = 有一次二次触发在排队) */
  echoTimer: number;
  /** 隐藏修饰器「回响」:排队那次的伤害系数 */
  echoMult: number;
  /** 主动法宝事件型节律的内置冷却(秒;表值 ARTIFACT_DEFS.innerCd),防同帧齐放 */
  innerCd: number;
  /** 状态型回血的小数累计器(每秒按层数比例给量,攒满 1 才入账,避免 dt 粒度把治疗吹大) */
  sustainAcc: number;
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
  speedMult?: number; // 弹道速度倍率(遗物「稳定器」;飞刀 / 射线 / 冰锥读它;缺省 1)
}

export class EquipmentEngine {
  private states = new Map<number, TriggerState>();
  /** 荆棘套 2 件「棘肤」:受击回血冷却 */
  private thornHealCd = 0;
  /** 最近一次击杀的敌人位置(亡灵冠冕唤出亡影的落点;null = 退化为玩家位置) */
  private lastKillPos: Vec2 | null = null;
  /** 隐藏修饰器「回响」的伤害缩放:`fire` 施放期间置为该次系数、结束复位 1,`statsOf` 读它 */
  private dmgScale = 1;
  /** 受击节律同帧齐放窗口(docs/DESIGN-HERO-RHYTHM.md §2.3):窗口内只放一件受击法宝,轮转取件 */
  private hitWindow = 0;
  private hitRotate = 0;
  /** 最近一次攻击者位置(共鸣变形「反打冰射」的朝向;null = 退化为最近敌人) */
  private lastAttackerPos: Vec2 | null = null;

  private stateOf(eq: Equipment): TriggerState {
    let s = this.states.get(eq.id);
    if (!s) {
      s = { pulseTimer: 0, pulseInterval: 0, comboCount: 0, comboWindowTimer: 0, moveAccum: 0, hurtCd: 0, hitCd: 0, critCd: 0, echoTimer: 0, echoMult: 1, innerCd: 0, sustainAcc: 0 };
      this.states.set(eq.id, s);
    }
    return s;
  }

  reset(): void {
    this.states.clear();
    this.thornHealCd = 0;
    this.hitWindow = 0;
    this.hitRotate = 0;
    this.lastAttackerPos = null;
    this.lastKillPos = null;
  }

  /** 节律等级 → 该触发器类型的间隔 / 阈值倍率(技能与法宝同读玩家的节律等级;隐藏触发器不缩放) */
  private rhythmMult(ctx: BattleContext, t: TriggerType, kind: "interval" | "threshold"): number {
    if (!isRhythm(t)) return 1;
    const lv = ctx.player.rhythmLevelOf ? ctx.player.rhythmLevelOf(t) : 1;
    return kind === "interval" ? rhythmIntervalMult(lv) : rhythmThresholdMult(lv);
  }

  /**
   * 事件型节律(击杀 / 连杀 / 受击 / 低血 / 移动 / 猎首)的内置冷却闸门:主动法宝按表值冷却,
   * 独有技能不设(它们靠自身 hitCd / hurtCd)。返回 true = 放行并已写入冷却。
   */
  private passInnerCd(eq: Equipment, st: TriggerState): boolean {
    if (eq.kind !== "active") return true;
    if (st.innerCd > 0) return false;
    st.innerCd = artifactInnerCd(eq);
    return true;
  }

  /**
   * 变形补丁汇总:① 主动法宝挂在共鸣节律上 → 法宝表补丁;② 独有技能拿到共鸣被动 → 技能表补丁;
   * ③ **本英雄已装备分支给核心的形态补丁**(`coreMorph`,选中即生效、不需要指定被动法宝)。
   * 同键以后入的覆盖前者 —— 共鸣补丁排在分支补丁之后,它是"再上一层"的报酬。
   */
  private morphOf(eq: Equipment, ctx: BattleContext): MorphPatch | null {
    const parts: MorphPatch[] = [];
    if (eq.kind === "skill") {
      const def = eq.skillId ? heroSkillDef(eq.skillId) : null;
      if (def && def.kind === "core") {
        for (const s of ctx.player.skills) {
          const b = s.skillId ? heroSkillDef(s.skillId) : null;
          if (b && b.kind === "branch" && b.heroId === def.heroId && b.coreMorph) parts.push(b.coreMorph);
        }
      }
      // 分岔主动件自己的 coreMorph(薇洛 B 的 `haunt_crown` 读 loop.shadeTroupe;薇拉 / 凯尔同)
      if (def && def.kind === "branch" && def.coreMorph) parts.push(def.coreMorph);
      if (def && eq.skillId && skillResonant(eq, ctx.player.passives ?? [])) parts.push(def.resonanceMorph);
      // 章节节点层(V1.1):本局已选节点并入该英雄的每一次技能施放(三原型;legacy 恒 null)
      if (def && def.heroId !== "generic" && hasChapterBuild(def.heroId)) {
        const nodePatch = selectedBuildPatch(ctx.player.buildNodes);
        if (nodePatch) parts.push({ node: nodePatch });
      }
    } else {
      const m = equipmentResonance(eq, ctx.seasonId)?.morph;
      if (m) parts.push(m);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : Object.assign({}, ...parts);
  }

  /**
   * 只读查询(R15,HUD 节律进度条):首条触发器所挂节律攒到几成(0–1)。
   * 连杀 = 已攒 / 所需;移动 = 已走 / 所需;低血 = 已失血 / 到阈值需失血;
   * 受击 = 带荆棘层的技能(薇拉核心)读层数比例,其余与击杀同为内置冷却走完即 1;周期 null。
   * 公式与 update / onHurt 里的判定同一套。
   */
  rhythmProgress(eq: Equipment, ctx: BattleContext): { frac: number; kind: RhythmId } | null {
    const tr = eq.triggers[0];
    if (!tr || !isRhythm(tr.def.type)) return null;
    const t = tr.def.type;
    const st = this.states.get(eq.id);
    switch (t) {
      case "pulse":
        return null;
      case "combo": {
        const need = Math.max(2, Math.round((tr.params.count ?? 5) * this.rhythmMult(ctx, "combo", "threshold")));
        return { frac: Math.min(1, (st?.comboCount ?? 0) / need), kind: t };
      }
      case "move": {
        const need = (tr.params.distance ?? 500) * (1 - this.statsOf(eq, ctx).haste) * this.rhythmMult(ctx, "move", "threshold");
        return { frac: need > 0 ? Math.min(1, (st?.moveAccum ?? 0) / need) : 0, kind: t };
      }
      case "hurt": {
        const threshold = Math.min(0.95, (tr.params.hpThreshold ?? 0.6) * (2 - this.rhythmMult(ctx, "hurt", "threshold")));
        const p = ctx.player;
        const lost = 1 - p.hp / Math.max(1, p.maxHp);
        return { frac: threshold >= 1 ? 1 : Math.max(0, Math.min(1, lost / (1 - threshold))), kind: t };
      }
      case "hit": {
        // 带荆棘层的技能(薇拉核心):这条条画的是**层数**(贴身攒、脱战掉),不是"冷却走完即满"
        const sk = eq.effect.params;
        if (eq.kind === "skill" && ((sk.stackRadiusPer ?? 0) > 0 || (sk.stackPowerLoss ?? 0) > 0)) {
          return { frac: ctx.player.thornStackFrac, kind: t };
        }
        return this.innerCdFrac(eq, st, t);
      }
      case "kill":
        return this.innerCdFrac(eq, st, t);
    }
  }

  /** 受击 / 击杀节律的通用读数:内置冷却走完即满(技能无内置冷却 → 恒 1) */
  private innerCdFrac(eq: Equipment, st: TriggerState | undefined, kind: RhythmId): { frac: number; kind: RhythmId } {
    const cdMax = eq.kind === "active" ? artifactInnerCd(eq) : 0;
    const cd = st?.innerCd ?? 0;
    return { frac: cdMax > 0 && cd > 0 ? Math.max(0, 1 - cd / cdMax) : 1, kind };
  }

  /** 只读查询:脉冲冷却剩余与当前生效间隔(战斗 HUD 倒计时用);无脉冲状态返 null */
  pulseLeft(eqId: number): { left: number; interval: number } | null {
    const st = this.states.get(eqId);
    if (!st || st.pulseInterval <= 0) return null;
    return { left: Math.max(0, st.pulseInterval - st.pulseTimer), interval: st.pulseInterval };
  }

  /** 帧驱动更新:周期脉冲 / 移动累积 / 暴击冷却 / 回响延迟 */
  update(ctx: BattleContext, dt: number): void {
    // 章节节点层(V1.1):过载合并窗 / 印记到期 / 踏迹 / 幕计时 / 延迟段统一在这里推进,
    // 世界层与 balance-sim 共用同一份(`tickBuild` 不读 Canvas / 平台)。
    this.tickBuild(ctx, dt);
    if (this.hitWindow > 0) this.hitWindow -= dt;
    for (const eq of this.castList(ctx)) {
      const st = this.stateOf(eq);
      // 连杀窗口
      if (st.comboWindowTimer > 0) {
        st.comboWindowTimer -= dt;
        if (st.comboWindowTimer <= 0) st.comboCount = 0;
      }
      if (st.hurtCd > 0) st.hurtCd -= dt;
      if (st.hitCd > 0) st.hitCd -= dt;
      if (st.critCd > 0) st.critCd -= dt;
      if (st.innerCd > 0) st.innerCd -= dt;
      if (this.thornHealCd > 0) this.thornHealCd -= dt;

      // 隐藏修饰器「回响」:延迟到期后按排队系数再放一次;isEcho=true 使其不再排队,防无限回响
      if (st.echoTimer > 0) {
        st.echoTimer -= dt;
        if (st.echoTimer <= 0) {
          const m = st.echoMult;
          st.echoMult = 1;
          this.fire(eq, ctx, m, true);
        }
      }

      const moveDist = ctx.player.movedThisFrame;
      // 状态型回血(R19:她的续航只认荆棘层):按层数比例逐帧给量,小数攒满 1 才入账
      const sustain = eq.effect.params.sustainHeal ?? 0;
      if (sustain > 0) {
        const frac = ctx.player.thornStackFrac;
        if (frac > 0) {
          st.sustainAcc += sustain * frac * (this.statsOf(eq, ctx).healMult ?? 1) * dt;
          const whole = Math.floor(st.sustainAcc);
          if (whole > 0) {
            st.sustainAcc -= whole;
            ctx.healPlayer(whole);
          }
        } else {
          st.sustainAcc = 0;
        }
      }
      for (const tr of eq.triggers) {
        const intervalMul = (1 - this.statsOf(eq, ctx).haste) * this.rhythmMult(ctx, tr.def.type, "interval");
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
          const need = (tr.params.distance ?? 500) * (1 - this.statsOf(eq, ctx).haste) * this.rhythmMult(ctx, "move", "threshold");
          if (st.moveAccum >= need) {
            st.moveAccum = 0;
            if (this.passInnerCd(eq, st)) this.fire(eq, ctx);
          }
        }
      }
    }
  }

  /** 结算列:独有技能 + 主动法宝(Player.castList;老测试的裸 Player 没有 skills 时退化为 equipment) */
  private castList(ctx: BattleContext): readonly Equipment[] {
    const p = ctx.player;
    return p.castList ?? p.equipment;
  }

  /** 事件:击杀敌人 */
  onKill(ctx: BattleContext, enemy: Enemy, opts?: { fromSplit?: boolean; source?: Equipment }): void {
    this.lastKillPos = vec2(enemy.pos.x, enemy.pos.y);
    for (const eq of this.castList(ctx)) {
      const st = this.stateOf(eq);
      for (const tr of eq.triggers) {
        if (tr.def.type === "kill") {
          // 节律等级抬概率(阈值倍率的反向:−6%/级 → 概率 ×(1 + 6%×级差))
          const chance = Math.min(0.95, (tr.params.chance ?? 0.2) * (2 - this.rhythmMult(ctx, "kill", "threshold")));
          if (Math.random() < chance && this.passInnerCd(eq, st)) this.fire(eq, ctx);
        } else if (tr.def.type === "combo") {
          st.comboWindowTimer = tr.params.window ?? 2;
          st.comboCount += 1;
          const need = Math.max(2, Math.round((tr.params.count ?? 5) * this.rhythmMult(ctx, "combo", "threshold")));
          if (st.comboCount >= need) {
            st.comboCount = 0;
            if (this.passInnerCd(eq, st)) this.fire(eq, ctx);
          }
        } else if (tr.def.type === "elite" && (enemy.isElite || enemy.kind === "boss")) {
          // 隐藏触发器「猎首」:精英与首领稀少,故不给概率也不给冷却
          this.fire(eq, ctx);
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

  /**
   * 事件:玩家造成暴击(隐藏触发器「暴击触发」)。
   * 冷却走 `CRIT_TRIGGER_CD`,与受击触发同口径 —— 高频暴击下不刷屏,但每次暴击都有反馈机会。
   */
  onCrit(ctx: BattleContext): void {
    for (const eq of this.castList(ctx)) {
      if (!eq.triggers.some((tr) => tr.def.type === "crit")) continue;
      const st = this.stateOf(eq);
      if (st.critCd > 0) continue;
      st.critCd = CRIT_TRIGGER_CD;
      this.fire(eq, ctx);
    }
  }

  /** 事件:玩家被击中(dmg 为扣除护盾前伤害;attacker = 攻击者,荆棘光环反弹用) */
  onHurt(ctx: BattleContext, dmg = 0, attacker?: Enemy | null): void {
    const p = ctx.player;
    // 荆棘套一档「棘肤」:受击回血;数值见 ../data/sets 的 SET_BONUSES
    const sb = ctx.setBonus;
    if (sb && sb.id === "thorn" && sb.bonus3 && !p.stackDriven && this.thornHealCd <= 0) {
      ctx.healPlayer(p.maxHp * SET_BONUSES.thorn3HealPct);
      this.thornHealCd = SET_BONUSES.thorn3HealCd;
    }
    if (attacker) this.lastAttackerPos = vec2(attacker.pos.x, attacker.pos.y);
    const list = this.castList(ctx);
    // 受击节律齐放窗口:窗口内只放一件**主动法宝**(轮转取件),独有技能不受窗口约束(靠自身 hitCd)
    const hitArtifacts = list.filter((eq) => eq.kind === "active" && eq.triggers.some((t) => t.def.type === "hit"));
    let hitPick: Equipment | null = null;
    if (hitArtifacts.length > 0 && this.hitWindow <= 0) {
      hitPick = hitArtifacts[this.hitRotate % hitArtifacts.length];
      this.hitRotate = (this.hitRotate + 1) % Math.max(1, hitArtifacts.length);
    }
    for (const eq of list) {
      const st = this.stateOf(eq);
      for (const tr of eq.triggers) {
        if (tr.def.type === "hurt" && st.hurtCd <= 0) {
          // 节律等级抬阈值(低血线上浮 6%/级)
          const threshold = Math.min(0.95, (tr.params.hpThreshold ?? 0.6) * (2 - this.rhythmMult(ctx, "hurt", "threshold")));
          if (p.hp / p.maxHp <= threshold && this.passInnerCd(eq, st)) {
            st.hurtCd = 1.2;
            this.fire(eq, ctx);
          }
        } else if (tr.def.type === "hit" && st.hitCd <= 0) {
          if (eq.kind === "active") {
            if (eq !== hitPick || !this.passInnerCd(eq, st)) continue;
            this.hitWindow = HIT_RHYTHM_WINDOW;
          }
          st.hitCd = 0.7;
          this.fire(eq, ctx);
        }
      }
    }
    // 组合技「荆棘光环」(策划案 V3 §5):反弹所受伤害 30% 给攻击者(无攻击者 → 最近敌人)。
    // 走正常 damageEnemy 管线;来源取首张受击触发卡,与荆棘套 4 件「反伤回响」乘算叠加是设计意图。
    if (ctx.comboActive?.thorn_aura && dmg > 0) {
      const target = attacker && attacker.hp > 0 ? attacker : this.nearest(p.pos, ctx.enemies, 640);
      const src = list.find((eq) => eq.triggers.some((t) => t.def.type === "hit")) ?? list[0];
      if (target && src) {
        ctx.damageEnemy(target, Math.max(1, Math.round(dmg * COMBO_VALUES.thorn_aura.reflectPct)), { source: src, from: p.pos });
      }
    }
  }

  /* ---------- 效果执行 ---------- */

  private fire(eq: Equipment, ctx: BattleContext, dmgScale = 1, isEcho = false): void {
    // 隐藏修饰器「回响」:本次施放排队一次延迟二次触发(isEcho 的那次不再排队,防无限回响)
    if (!isEcho) {
      // 装备自带回响优先;没有则看全局被动法宝里的「回响」
      const spec = echoSpecOf(eq) ?? passiveEchoSpec(ctx.player.passives ?? []);
      if (spec && spec.sec > 0) {
        const st = this.stateOf(eq);
        st.echoTimer = spec.sec;
        st.echoMult = spec.mult;
      }
    }
    // 回响那次的伤害缩放:经 statsOf 作用于本次施放的全部伤害出口,施放结束即复位
    this.dmgScale = dmgScale;
    // 隐藏词缀(仅融合产出):替换常规效果执行
    if (eq.hiddenAffix) {
      this.castHidden(eq, ctx);
      this.dmgScale = 1;
      return;
    }
    const s = this.statsOf(eq, ctx);
    const eff = eq.effect;
    // 共鸣变形「护心新星」等:施放附带护盾(吸收 = 最大生命 × 比例)
    const morph = this.morphOf(eq, ctx);
    if (morph?.shieldOnCast) {
      ctx.addPlayerShield(Math.max(1, Math.round(ctx.player.maxHp * morph.shieldOnCast.amountPct)), morph.shieldOnCast.sec);
    }
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
    this.dmgScale = 1;
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
        speed: (eff.params.speed ?? 700) * (s.speedMult ?? 1),
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
    const morph = this.morphOf(eq, ctx);
    // 薇洛 B:核心狼槽被亡影替代(定拍走分岔主动件 `haunt_crown`),核心施放直接吞掉
    if (morph?.loop?.shadeTroupe && eq.skillId === "willow_core") return;
    const damage = Math.round((eff.params.damage ?? 14) * s.power);
    const duration = ((eff.params.duration ?? 12) + s.durationBonus) * (s.durationMult ?? 1);
    const p = ctx.player;
    const at = this.summonOrigin(eq, ctx);
    // 薇洛 A:两个职业狼槽 L/R;后拍刷新寿命,不重置攻击计时,也不新增第三只
    const wolfLoop = morph?.loop?.wolfPair;
    if (wolfLoop && eq.skillId === "willow_core") {
      const wolfNode = morph?.node?.wolf;
      for (const side of ["l", "r"] as const) {
        const live = ctx.minions.find((m) => m.wolfSide === side);
        if (live) {
          live.ttl = Math.max(live.ttl, duration);
          if (wolfNode?.flank) live.flank = wolfNode.flank;
          if (wolfNode?.guard) live.guardRadius = wolfNode.guard;
          continue;
        }
        const m = spawnMinion({
          pos: vec2(at.x + (side === "l" ? -24 : 24) + (Math.random() - 0.5) * 20, at.y + (Math.random() - 0.5) * 20),
          hp: 40 + ctx.player.level * 6,
          damage,
          duration,
          speed: 273,
          color: "#c9a6ff",
          wolfSide: side,
          flank: wolfNode?.flank,
          guardRadius: wolfNode?.guard,
          source: eq,
        });
        ctx.minions.push(m);
      }
      ctx.addFx({ type: "heal", pos: vec2(p.pos.x, p.pos.y), ttl: 0.25, maxTtl: 0.25 });
      return;
    }
    const count = (eff.params.count ?? 2) + (s.summonExtra ?? 0);
    for (let i = 0; i < count; i++) {
      const m = spawnMinion({
        pos: vec2(at.x + (Math.random() - 0.5) * 40, at.y + (Math.random() - 0.5) * 40),
        hp: 40 + ctx.player.level * 6,
        damage,
        duration,
        speed: 273,
        color: "#c9a6ff",
        source: eq,
        // 召唤物命中回血(穆核心「雾缚噬灵」:缠斗回复;与隐藏词缀「亡灵大军」同一结算位)
        healOnHit: (eff.params.healOnHit ?? 0) > 0,
      });
      ctx.minions.push(m);
    }
    ctx.addFx({ type: "heal", pos: vec2(p.pos.x, p.pos.y), ttl: 0.25, maxTtl: 0.25 });
  }

  /** 亡灵冠冕(亡影剧团):击杀触发时在尸体处唤醒亡影;场上亡影上限 4(防滚雪球) */
  private castHauntCrown(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const morph = this.morphOf(eq, ctx);
    const troupe = morph?.loop?.shadeTroupe;
    // 薇洛 B:分岔主动件每 3 秒召一影(基础入场),幕数 / 谢幕由本段结算
    if (troupe && eq.skillId === "willow_shades") {
      this.castShadeEntry(eq, eff, s, ctx, troupe, morph?.node?.shade);
      return;
    }
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

  /** 薇洛 B:一次定拍入场(靶前召影 → 横扫 → +1 幕 → 满 4 幕谢幕) */
  private castShadeEntry(
    eq: Equipment,
    eff: EffectInstance,
    s: EffStats,
    ctx: BattleContext,
    loop: import("../data/heroBuild").ShadeTroupeLoop,
    node: import("../data/heroBuild").ShadeNodePatch | undefined,
  ): void {
    const alive = ctx.enemies.filter((e) => e.hp > 0);
    if (alive.length === 0) return;
    const p = ctx.player;
    const br = p.buildRes;
    if (!br.shade) br.shade = { acts: 0, timer: 0, cd: 0, lastX: p.pos.x, lastY: p.pos.y, hasStage: false };
    const shade = br.shade;
    let target = this.nearest(p.pos, alive, 640);
    if (node?.focus) {
      const elite = alive.find((e) => e.isElite);
      if (elite) target = elite;
    }
    if (node?.tour) {
      let far = alive[0];
      for (const e of alive) {
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > Math.hypot(far.pos.x - p.pos.x, far.pos.y - p.pos.y)) far = e;
      }
      target = far;
    }
    if (!target) return;
    let pos = vec2(target.pos.x, target.pos.y);
    if (node?.stage && shade.hasStage) {
      const nearStage = alive.filter((e) => Math.hypot(e.pos.x - shade.lastX, e.pos.y - shade.lastY) <= node.stage!.radius);
      const pick = nearStage[0] ?? target;
      pos = vec2(pick.pos.x, pick.pos.y);
    } else {
      // 靶前 = 玩家到目标连线上、目标身前一档
      const dx = p.pos.x - target.pos.x;
      const dy = p.pos.y - target.pos.y;
      const l = Math.hypot(dx, dy) || 1;
      pos = vec2(target.pos.x + (dx / l) * 30, target.pos.y + (dy / l) * 30);
    }
    const shades = ctx.minions.filter((m) => m.shade);
    while (shades.length >= loop.maxShades) {
      const old = shades.shift()!;
      const idx = ctx.minions.indexOf(old);
      if (idx >= 0) ctx.minions.splice(idx, 1);
    }
    ctx.minions.push(spawnMinion({
      pos, hp: 30 + p.level * 5, damage: Math.round((eff.params.damage ?? 14) * s.power),
      duration: loop.shadeTtl, color: "#8f9bb3", shade: true, source: eq,
    }));
    this.damageArea(ctx, eq, pos, 80, Math.round(14 * loop.shadeDamageMult), { maxTargets: loop.shadeMaxTargets, from: pos });
    shade.acts += 1;
    shade.lastX = pos.x;
    shade.lastY = pos.y;
    shade.hasStage = true;
    if (shade.acts >= loop.actsToCurtain) this.castCurtain(ctx, eq, loop, node);
  }

  /** 薇洛 B 谢幕:两个 90px 圈共享命中集合;谢幕不消耗实体、不触发退场 */
  private castCurtain(
    ctx: BattleContext,
    eq: Equipment,
    loop: import("../data/heroBuild").ShadeTroupeLoop,
    node: import("../data/heroBuild").ShadeNodePatch | undefined,
  ): void {
    const p = ctx.player;
    const br = p.buildRes;
    const sh = br.shade;
    if (!sh || sh.cd > 0 || sh.acts < loop.actsToCurtain) return;
    sh.acts -= loop.actsToCurtain;
    sh.cd = loop.curtainIcd;
    const centers: Vec2[] = [];
    if (node?.focus) {
      const elite = ctx.enemies.find((e) => e.hp > 0 && e.isElite);
      if (elite) centers.push(vec2(elite.pos.x, elite.pos.y));
    }
    if (centers.length === 0) centers.push(vec2(sh.lastX, sh.lastY));
    const otherShade = ctx.minions.find((m) => m.shade);
    if (otherShade && centers.length < 2) centers.push(vec2(otherShade.pos.x, otherShade.pos.y));
    const damage = Math.round(loop.curtainBaseDamage * loop.curtainDamageMult);
    const hit = new Set<number>();
    const picks: Enemy[] = [];
    for (const c of centers) {
      for (const e of ctx.enemies) {
        if (e.hp <= 0 || hit.has(e.id)) continue;
        if (Math.hypot(e.pos.x - c.x, e.pos.y - c.y) <= loop.curtainRadius + e.def.radius) {
          hit.add(e.id);
          picks.push(e);
        }
      }
    }
    // 双舞台:两圈之间连线,共享每靶一次谢幕命中
    if (node?.link && centers.length >= 2) {
      for (const e of ctx.enemies) {
        if (e.hp <= 0 || hit.has(e.id)) continue;
        if (this.pointSegmentDist(e.pos, centers[0], centers[1]) <= node.link.width / 2 + e.def.radius) {
          hit.add(e.id);
          picks.push(e);
        }
      }
    }
    for (const e of picks.slice(0, loop.curtainMaxTargets)) {
      ctx.damageEnemy(e, damage, { source: eq, from: centers[0] });
      if (node?.slow) applySlow(e, node.slow.factor, node.slow.duration);
    }
    if (node?.doubleAct) {
      br.pendingShade.push({
        at: p.buildTime + node.doubleAct.delay, x: centers[0].x, y: centers[0].y,
        damage: Math.round(damage * node.doubleAct.damageShare), radius: loop.curtainRadius,
        maxTargets: loop.curtainMaxTargets, slow: !!node.slow,
      });
    }
  }

  /** 薇洛 B:亡影自然到期 +1 幕(强制淘汰 / 刷新不给幕;调用方只对 ttl 自然归零的实体调) */
  onShadeExpire(_m: Minion, ctx: BattleContext): void {
    const branch = buildBranch(ctx.player.buildBranchId);
    const loop = branch?.loop.shadeTroupe;
    if (!loop) return;
    const sh = ctx.player.buildRes.shade;
    if (!sh) return;
    sh.acts = Math.min(loop.actsToCurtain + 1, sh.acts + 1);
  }

  /**
   * 薇洛 A 双狼命中回调(世界层与模拟器在狼咬中后调用):
   * 同靶 1.2s 内 L/R 各一次未使用命中 → +1 猎记;3 记 → 头狼 3s + 扑击 2×14。
   */
  onMinionHit(m: Minion, target: Enemy, ctx: BattleContext): void {
    if (!m.wolfSide) return;
    const branch = buildBranch(ctx.player.buildBranchId);
    const loop = branch?.loop.wolfPair;
    if (!loop) return;
    const p = ctx.player;
    const br = p.buildRes;
    const node = selectedBuildPatch(p.buildNodes)?.wolf;
    const now = p.buildTime;
    if (!br.wolf) br.wolf = { targetId: 0, lAt: -1, rAt: -1, marks: 0, lastPairAt: -1, alphaUntil: 0, focusUntil: 0, focusTargetId: 0 };
    const w = br.wolf;
    if (w.targetId !== target.id) {
      w.targetId = target.id;
      w.lAt = -1;
      w.rAt = -1;
    }
    if (m.wolfSide === "l") w.lAt = now;
    else w.rAt = now;
    if (w.lAt < 0 || w.rAt < 0 || Math.abs(w.lAt - w.rAt) > loop.pairWindow) return;
    w.lAt = -1;
    w.rAt = -1;
    w.marks += 1;
    w.lastPairAt = now;
    if (w.marks < loop.marksToAlpha) return;
    w.marks = 0;
    w.alphaUntil = now + loop.alphaSec;
    const pounce = Math.round(m.damage * loop.pounceMult);
    ctx.damageEnemy(target, pounce, { source: m.source, from: m.pos });
    if (node?.repounce) {
      const next = this.nearest(target.pos, ctx.enemies.filter((e) => e.hp > 0 && e.id !== target.id), 320) ?? target;
      ctx.damageEnemy(next, Math.round(m.damage * loop.pounceMult * 0.5), { source: m.source, from: m.pos });
    }
    if (node?.focus) {
      w.focusUntil = now + node.focus.seconds;
      const elite = ctx.enemies.find((e) => e.hp > 0 && e.isElite);
      w.focusTargetId = node.focus.retargetElite && elite ? elite.id : target.id;
    }
    if (node?.huntLine) {
      const wolves = ctx.minions.filter((x) => x.wolfSide);
      if (wolves.length >= 2) {
        const a = wolves[0];
        const b = wolves[1];
        let n = 0;
        for (const e of ctx.enemies) {
          if (e.hp <= 0 || n >= node.huntLine.maxTargets) continue;
          if (this.pointSegmentDist(e.pos, a.pos, b.pos) <= node.huntLine.width / 2 + e.def.radius) {
            ctx.damageEnemy(e, node.huntLine.damage, { source: m.source, from: m.pos });
            n += 1;
          }
        }
        br.huntLineUntil = now + 2;
      }
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
    // 基础扇形多发(spread) + 分裂修饰器叠加,形成弹幕;共鸣变形「连杀飞刃」再按世界层连杀数加发
    const morph = this.morphOf(eq, ctx);
    // 章节节点层(V1.1):凯尔 A 过载 / 凯尔 B 三束同向 + 冰印
    const overload = morph?.loop?.overload;
    const marksB = morph?.loop?.marksB;
    const fanNode = morph?.node?.fan;
    const br = ctx.player.buildRes;
    if (marksB && eq.skillId === "kyle_core") br.markRound = [];
    const total = marksB && eq.skillId === "kyle_core"
      ? marksB.baseSpread + s.splitExtra
      : (eff.params.spread ?? 1) + s.splitExtra + this.comboExtra(ctx, morph);
    const base = this.nearest(origin, enemies, range);
    // 初始武器全向弹幕:spread ≥ 6 时均匀环绕 360°(前 5 章新手区不被围死,
    // 单侧扇形会被四边刷怪从背后包抄;商店随机卡 spread 1-3 不受影响)
    let baseAngle = base ? Math.atan2(base.pos.y - origin.y, base.pos.x - origin.x) : 0;
    // 共鸣变形「反打冰射」:朝最近一次来袭方向打(没有记录时退化为最近敌人)
    if (morph?.aimAtAttacker && this.lastAttackerPos) {
      baseAngle = Math.atan2(this.lastAttackerPos.y - origin.y, this.lastAttackerPos.x - origin.x);
    }
    let spreadAngle = Math.PI / 9; // 每发 20° 散布
    if ((eff.params.spread ?? 1) >= 6 && !(marksB && eq.skillId === "kyle_core")) {
      baseAngle = 0;
      spreadAngle = (Math.PI * 2) / total; // 360° 等分(凯尔 B 的基础轮改 3 束同向,不走这一支)
    }
    if (marksB && eq.skillId === "kyle_core") spreadAngle = 0;

    // 凯尔 A「满 100 卸载」:先扣资源再射 8 束;额外齐射不积过载(本段只发弹,不开窗)
    if (overload && eq.skillId === "kyle_core" && br.overload >= overload.cap && br.overloadCd <= 0) {
      br.overload -= overload.cap;
      br.overloadCd = overload.icd;
      let burstAngle = fanNode?.intercept && base
        ? Math.atan2(base.pos.y - origin.y, base.pos.x - origin.x)
        : this.denseAngle(origin, enemies);
      const arc = (overload.fanDeg * Math.PI) / 180;
      if (fanNode?.rotateDeg) {
        burstAngle += (br.overloadSpin * Math.PI) / 180;
        br.overloadSpin = (br.overloadSpin + fanNode.rotateDeg) % 360;
      }
      const bdmg = Math.round(60 * s.power * overload.burstDamageMult);
      const sourceId = eq.skillId ?? "";
      const speed = (eff.params.speed ?? 620) * (s.speedMult ?? 1);
      if (fanNode?.frontBack) {
        this.fireFan(ctx, eq, origin.x, origin.y, burstAngle, Math.ceil(overload.burstSpread / 2), bdmg, speed, s.pierce, kind, arc);
        this.fireFan(ctx, eq, origin.x, origin.y, burstAngle + Math.PI, Math.floor(overload.burstSpread / 2), bdmg, speed, s.pierce, kind, arc);
      } else if (fanNode?.split && fanNode.split > 1) {
        const n = fanNode.split;
        for (let k = 0; k < n; k++) {
          this.fireFan(ctx, eq, origin.x, origin.y, burstAngle + (k - (n - 1) / 2) * arc, Math.ceil(overload.burstSpread / n), bdmg, speed, s.pierce, kind, arc);
        }
      } else if (fanNode?.twoWave) {
        const first = Math.ceil(overload.burstSpread / 2);
        this.fireFan(ctx, eq, origin.x, origin.y, burstAngle, first, bdmg, speed, s.pierce, kind, arc);
        br.pendingFan.push({
          at: ctx.player.buildTime + fanNode.twoWave.delay, x: origin.x, y: origin.y, angle: burstAngle,
          count: overload.burstSpread - first, damage: Math.round(bdmg * fanNode.twoWave.damageShare), speed,
          pierce: s.pierce, arc, sourceId, kind,
        });
      } else {
        this.fireFan(ctx, eq, origin.x, origin.y, burstAngle, overload.burstSpread, bdmg, speed, s.pierce, kind, arc);
        if (fanNode?.return) {
          br.pendingFan.push({
            at: ctx.player.buildTime + 0.2, x: origin.x, y: origin.y, angle: burstAngle + Math.PI,
            count: overload.burstSpread, damage: Math.round(bdmg * 0.5), speed, pierce: s.pierce, arc, sourceId, kind,
          });
        }
      }
    }

    for (let i = 0; i < total; i++) {
      const angle = baseAngle + (i - (total - 1) / 2) * spreadAngle;
      const p = spawnProjectile({
        kind,
        pos: origin,
        dir: vec2(Math.cos(angle), Math.sin(angle)),
        speed: (eff.params.speed ?? 520) * (s.speedMult ?? 1),
        damage: Math.round((eff.params.damage ?? 18) * s.power),
        radius: kind === "ray" ? 7 : 5,
        pierce: s.pierce,
        chainLeft: s.chainTargets,
        chainRange: eff.params.radius ?? 300,
        explode: s.explode,
        lifesteal: s.lifesteal,
        slow: eff.params.slow,
        slowDuration: ((eff.params.duration ?? 2) + s.durationBonus) * (s.durationMult ?? 1),
        slayDevourer: eff.params.slayDevourer,
        source: eq,
      });
      ctx.projectiles.push(p);
      if (i === 0) {
        ctx.addFx({ type: "knife", pos: vec2(origin.x, origin.y), ttl: 0.12, maxTtl: 0.12 });
      }
    }
    // 凯尔 A:基础轮首命中后开 0.12s 合并窗(命中由世界层 `recordBuildHit` 记入)
    if (overload && eq.skillId === "kyle_core") {
      br.overloadWindowAt = ctx.player.buildTime;
      br.overloadWindowTargets = [];
    }
  }

  /** 密集扇区角度:最近 8 只按 1/(距离) 加权平均方向 */
  private denseAngle(origin: Vec2, enemies: Enemy[]): number {
    const near = enemies
      .filter((e) => e.hp > 0)
      .map((e) => ({ e, d: Math.hypot(e.pos.x - origin.x, e.pos.y - origin.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    if (near.length === 0) return 0;
    let sx = 0;
    let sy = 0;
    for (const { e, d } of near) {
      const w = 1 / (d + 1);
      sx += ((e.pos.x - origin.x) / (d || 1)) * w;
      sy += ((e.pos.y - origin.y) / (d || 1)) * w;
    }
    return Math.atan2(sy, sx);
  }

  /** 凯尔技能命中回调(世界层与模拟器在弹体命中后调用;只记弹体,不记地面 DoT) */
  recordBuildHit(eq: Equipment, target: Enemy, ctx: BattleContext): void {
    const p = ctx.player;
    const branch = buildBranch(p.buildBranchId);
    if (!branch) return;
    const now = p.buildTime;
    if (branch.loop.overload) {
      if (eq.skillId === "kyle_core" && p.buildRes.overloadWindowAt >= 0) {
        if (!p.buildRes.overloadWindowTargets.includes(target.id)) p.buildRes.overloadWindowTargets.push(target.id);
      }
      return;
    }
    const loop = branch.loop.marksB;
    if (!loop) return;
    if (p.buildRes.markRound.includes(target.id)) return;
    p.buildRes.markRound.push(target.id);
    const node = selectedBuildPatch(p.buildNodes);
    const st = p.buildRes.marks[target.id] ?? { stacks: 0, lastAt: now, spare: 0 };
    const nearest = this.nearest(p.pos, ctx.enemies, 640);
    const add = nearest?.id === target.id ? loop.firstMark : loop.backMark;
    st.stacks += add;
    st.lastAt = now;
    if (st.stacks > loop.cap) {
      st.stacks = loop.cap;
      if (node?.mark?.spare) st.spare = Math.min(node.mark.spare, st.spare + 1);
    }
    p.buildRes.marks[target.id] = st;
    if (st.stacks >= loop.detonateAt && !p.buildRes.pendingIcicle) {
      st.stacks -= loop.detonateAt;
      if (st.stacks <= 0) delete p.buildRes.marks[target.id];
      p.buildRes.pendingIcicle = { targetId: target.id, at: now + 0.05, x: target.pos.x, y: target.pos.y };
    }
  }

  private castNova(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const p = ctx.player;
    // 荆棘层(docs/DESIGN-HERO-PIPELINE.md §2 站位语义):只有带 stack 参数的施放源读层数 ——
    // 半径按层线性放大,伤害按"离满层还差多少"线性折损;没带这两位的人 stack 恒 0,乘 1 / 折 0 逐帧不变。
    const stackPer = eff.params.stackRadiusPer ?? 0;
    const stackLoss = eff.params.stackPowerLoss ?? 0;
    const stack = stackPer > 0 || stackLoss > 0 ? p.thornStack : 0;
    const radius = (eff.params.radius ?? 130) * (s.radiusMult ?? 1) * (1 + stackPer * stack);
    const damage = Math.round((eff.params.damage ?? 30) * s.power * (1 - stackLoss * (1 - Math.min(1, stack / THORN_STACK.cap))));
    const morph = this.morphOf(eq, ctx);
    // 分支形态「敌下开花」:落点搬到最近一次来袭者所在位置;无来袭记录仍以自身为中心(行为不变)
    const at = morph?.castAtAttacker && this.lastAttackerPos ? this.lastAttackerPos : p.pos;
    ctx.addFx({ type: "nova", pos: vec2(at.x, at.y), radius, ttl: 0.35, maxTtl: 0.35 });
    this.damageArea(ctx, eq, at, radius, damage, { lifesteal: s.lifesteal, knockbackPower: 120, from: at });
    // 薇拉 A「荆棘堡垒」:满 6 层付 3,追加一次向内收缩的刺圈(只认基础拍;派生事件不再消费)
    const loop = morph?.loop?.stackConsume;
    const nodeNova = morph?.node?.nova;
    if (loop && stack >= loop.atStacks) {
      p.thornStack = Math.max(0, p.thornStack - loop.consume);
      const extraDamage = Math.round(damage * loop.damageMult);
      const extraRadius = radius * loop.radiusMult;
      // 截阵:落点改到下一名逼近者脚下(近似 = 除当前落点外最近的一只);1s 内没有就回当前靶
      let anchor = at;
      if (nodeNova?.anchorNext) {
        const next = this.nearest(p.pos, ctx.enemies.filter((e) => e.hp > 0), 320);
        if (next) anchor = next.pos;
      }
      if (nodeNova?.line) {
        const dirPos = this.lastAttackerPos ?? anchor;
        const ang = Math.atan2(dirPos.y - p.pos.y, dirPos.x - p.pos.x);
        this.damageLine(ctx, eq, p.pos, ang, nodeNova.line.length, nodeNova.line.width, Math.round(damage * nodeNova.line.damageMult), nodeNova.line.maxTargets, { lifesteal: s.lifesteal });
      } else {
        this.damageArea(ctx, eq, anchor, extraRadius, extraDamage, { maxTargets: loop.maxTargets, lifesteal: s.lifesteal, knockbackPower: 80, from: anchor });
      }
      if (nodeNova?.shield) {
        const amount = Math.max(nodeNova.shield.amount ?? 0, Math.round(p.maxHp * (nodeNova.shield.amountPct ?? 0)));
        if (amount > 0) ctx.addPlayerShield(amount, nodeNova.shield.sec);
      }
      if (nodeNova?.echo) {
        p.buildRes.pendingNova.push({
          at: p.buildTime + nodeNova.echo.delay,
          x: anchor.x, y: anchor.y,
          radius: extraRadius * nodeNova.echo.radiusMult,
          damage: Math.round(extraDamage * nodeNova.echo.damageMult),
          sourceId: eq.skillId ?? "",
          maxTargets: nodeNova.echo.maxTargets,
        });
      }
      if (nodeNova?.wall) {
        ctx.clouds.push(spawnCloud({
          pos: vec2(anchor.x, anchor.y),
          radius: extraRadius * nodeNova.wall.radiusMult,
          dps: 0,
          duration: nodeNova.wall.duration,
          wall: { damage: Math.round(extraDamage * nodeNova.wall.damageMult), follow: !!nodeNova.wall.follow },
          source: eq,
        }));
      }
    }
    // 分支形态「爆完留地」:落点长出一片持续伤害地面(dps = 新星单发伤害 × dpsPerDamage)
    const g = morph?.afterCastGround;
    if (g) {
      const imprint = morph?.loop?.trailImprint;
      if (imprint) {
        // 两类地面合池 4 块:超出时原地移除最旧一块(保持数组身份)
        const trails = ctx.clouds.filter((c) => c.trail);
        while (trails.length >= imprint.trailMax) {
          const oldest = trails.shift()!;
          const idx = ctx.clouds.indexOf(oldest);
          if (idx >= 0) ctx.clouds.splice(idx, 1);
        }
      }
      ctx.clouds.push(spawnCloud({
        pos: vec2(at.x, at.y),
        radius: radius * g.radiusMult,
        dps: damage * g.dpsPerDamage,
        duration: g.duration,
        trail: !!imprint,
        source: eq,
      }));
    }
    // 组合技「深渊裂隙」(策划案 V3 §5):新星落点留 3s 回血池(落点与上面同一处 at),
    // 总治疗 = 新星伤害 ×40% 分 3 秒(0.25s tick);场上回血池上限 3 个,超出移除最旧。
    const ar = COMBO_VALUES.abyss_rift;
    if (ctx.comboActive?.abyss_rift) {
      const healClouds = ctx.clouds.filter((c) => c.heals);
      if (healClouds.length >= ar.poolCap) {
        const idx = ctx.clouds.indexOf(healClouds[0]); // clouds 按生成顺序入列,首个即最旧
        if (idx >= 0) ctx.clouds.splice(idx, 1);
      }
      const c = spawnCloud({
        pos: vec2(at.x, at.y),
        radius,
        dps: (damage * ar.healRatio) / ar.poolDuration,
        duration: ar.poolDuration,
        heals: true,
        source: eq,
      });
      ctx.clouds.push(c);
    }
  }

  /** 圆形范围伤害(按距离排序,最多 maxTargets 靶;缺省 = 不限) */
  private damageArea(
    ctx: BattleContext,
    eq: Equipment,
    at: Vec2,
    radius: number,
    damage: number,
    opts: { lifesteal?: number; knockbackPower?: number; from?: Vec2; maxTargets?: number } = {},
  ): number {
    const hit: { e: Enemy; d: number }[] = [];
    for (const e of ctx.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.pos.x - at.x, e.pos.y - at.y);
      if (d <= radius + e.def.radius) hit.push({ e, d });
    }
    hit.sort((a, b) => a.d - b.d);
    const list = opts.maxTargets ? hit.slice(0, opts.maxTargets) : hit;
    for (const { e } of list) {
      ctx.damageEnemy(e, damage, { source: eq, lifesteal: opts.lifesteal, knockbackPower: opts.knockbackPower, from: opts.from });
    }
    return list.length;
  }

  /** 矩形范围伤害(沿 angle 的直线;length / width = 设计 px) */
  private damageLine(
    ctx: BattleContext,
    eq: Equipment,
    origin: Vec2,
    angle: number,
    length: number,
    width: number,
    damage: number,
    maxTargets: number,
    opts: { lifesteal?: number } = {},
  ): number {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit: { e: Enemy; t: number }[] = [];
    for (const e of ctx.enemies) {
      if (e.hp <= 0) continue;
      const rx = e.pos.x - origin.x;
      const ry = e.pos.y - origin.y;
      const t = rx * dx + ry * dy;
      if (t < 0 || t > length) continue;
      const perp = Math.abs(-rx * dy + ry * dx);
      if (perp > width / 2 + e.def.radius) continue;
      hit.push({ e, t });
    }
    hit.sort((a, b) => a.t - b.t);
    const list = hit.slice(0, maxTargets);
    for (const { e } of list) ctx.damageEnemy(e, damage, { source: eq, lifesteal: opts.lifesteal, from: origin });
    return list.length;
  }

  /** 按 skillId 找玩家身上的技能实例(延迟段结算用;找不到返回 null) */
  private equipmentBySkillId(ctx: BattleContext, id: string): Equipment | null {
    if (!id) return null;
    for (const eq of ctx.player.castList) if (eq.skillId === id) return eq;
    return null;
  }

  /** 共鸣变形「连杀 ×」:每 per 连杀 +1(封顶 cap);无变形或无连杀数 → 0 */
  private comboExtra(ctx: BattleContext, morph: MorphPatch | null): number {
    if (!morph?.comboScale) return 0;
    return Math.min(morph.comboScale.cap, Math.floor((ctx.comboCount ?? 0) / morph.comboScale.per));
  }

  /** 召唤落点:共鸣变形「尸起 / 食尸」从最近一次击杀位置起身,否则玩家脚下 */
  private summonOrigin(eq: Equipment, ctx: BattleContext): Vec2 {
    const p = ctx.player.pos;
    if (this.morphOf(eq, ctx)?.spawnAtKill && this.lastKillPos) return this.lastKillPos;
    return p;
  }

  private castSkeleton(eq: Equipment, eff: EffectInstance, s: EffStats, ctx: BattleContext): void {
    const count = (eff.params.count ?? 1) + (s.summonExtra ?? 0);
    const damage = Math.round((eff.params.damage ?? 12) * s.power);
    const duration = ((eff.params.duration ?? 12) + s.durationBonus) * (s.durationMult ?? 1);
    const p = ctx.player;
    const at = this.summonOrigin(eq, ctx);
    for (let i = 0; i < count; i++) {
      const m = spawnMinion({
        pos: vec2(at.x + (Math.random() - 0.5) * 40, at.y + (Math.random() - 0.5) * 40),
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
    // 共鸣变形「连杀雷链」:跳数随世界层连杀数增长
    const jumps = (eff.params.jumps ?? 3) + s.chainTargets + this.comboExtra(ctx, this.morphOf(eq, ctx));
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
    for (const m of eq.modifiers) this.applyModifier(s, m.def.type, m.params, 1);
    // 全局被动法宝(docs/DESIGN-HERO-RHYTHM.md §4.2):对每件技能与法宝生效;同 type 第 n 枚按表衰减。
    // 修饰器类走 applyModifier;遗物类(D3 并入)里作用于施放统计的三枚在这里折:沙漏 → haste、透镜 → 范围、稳定器 → 弹速
    const seen = new Map<PassiveType, number>();
    for (const pa of ctx.player.passives ?? []) {
      const n = seen.get(pa.type) ?? 0;
      seen.set(pa.type, n + 1);
      const mult = passiveStackMult(n);
      if (mult <= 0) continue;
      if (isRelicType(pa.type)) {
        if (pa.type === "hourglass") s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + RELIC_VALUES.hourglass.haste * mult);
        else if (pa.type === "lens") s.radiusMult = (s.radiusMult ?? 1) * (1 + (RELIC_VALUES.lens.radiusMult - 1) * mult);
        else if (pa.type === "stabilizer") s.speedMult = (s.speedMult ?? 1) * (1 + (RELIC_VALUES.stabilizer.speedMult - 1) * mult);
        continue;
      }
      this.applyModifier(s, pa.type, pa.params, mult);
    }
    // 共鸣变形(§5 表 1 法宝 × 节律 / 表 2 被动 × 技能):叠一层乘区;开关类(护盾 / 落点 / 连杀 / 朝向)在各 cast 内读
    const morph = this.morphOf(eq, ctx);
    if (morph) {
      if (morph.power) s.power *= morph.power;
      if (morph.radiusMult) s.radiusMult = (s.radiusMult ?? 1) * morph.radiusMult;
      if (morph.durationMult) s.durationMult = (s.durationMult ?? 1) * morph.durationMult;
      if (morph.splitExtra) s.splitExtra += morph.splitExtra;
      if (morph.pierce) s.pierce += morph.pierce;
      if (morph.chainTargets) s.chainTargets += morph.chainTargets;
      if (morph.summonExtra) s.summonExtra = (s.summonExtra ?? 0) + morph.summonExtra;
      if (morph.healMult) s.healMult = (s.healMult ?? 1) * morph.healMult;
      if (morph.haste) s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + morph.haste);
      if (morph.explode && !s.explode) s.explode = { ...morph.explode };
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
    // 一档加成(套组 3 件 / 共鸣 2 处,由 SetBonusState 的档位标志给出);数值见 ../data/sets 的 SET_BONUSES
    if (sb && sb.bonus3) {
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
    if (sb && sb.bonus6) {
      // 二档质变(套组 6 件 / 共鸣 4 处):翻倍类,与品质射速/赠量乘算才是收益最大化;数值见 SET_BONUSES
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
    if (mut && sb && sb.bonus3) {
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
    // 隐藏修饰器「回响」:二次触发那一次整体按系数缩放(放在最后,覆盖上面所有乘区)
    if (this.dmgScale !== 1) s.power *= this.dmgScale;
    return s;
  }

  /**
   * 一条修饰器(装备自带或全局被动)折入统计;`mult` = 被动叠加衰减(装备自带恒 1)。
   * 计数类(连锁 / 分裂 / 穿透)按衰减取整、首枚至少 1;爆炸只取首枚,衰减乘在伤害倍数上。
   */
  private applyModifier(s: EffStats, type: ModifierType, p: { targets?: number; radius?: number; damageMult?: number; extra?: number; pct?: number; count?: number; pct2?: number; pct3?: number; sec?: number }, mult: number): void {
    const cnt = (v: number) => (mult >= 1 ? v : Math.max(1, Math.round(v * mult)));
    switch (type) {
      case "chain":
        s.chainTargets += cnt(p.targets ?? 0);
        break;
      case "explode":
        if (!s.explode) s.explode = { radius: p.radius ?? 100, damageMult: (p.damageMult ?? 0.8) * mult };
        break;
      case "split":
        s.splitExtra += cnt(p.extra ?? 0);
        break;
      case "lifesteal":
        s.lifesteal += (p.pct ?? 0) * mult;
        break;
      case "pierce":
        s.pierce += cnt(p.count ?? 0);
        break;
      case "haste":
        s.haste = Math.min(QUALITY_HASTE_CAP, s.haste + (p.pct2 ?? 0) * mult);
        break;
      case "power":
        s.power *= 1 + (p.pct3 ?? 0) * mult;
        break;
      case "duration":
        s.durationBonus += (p.sec ?? 0) * mult;
        break;
      // echo / condemned:结算位在 fire(回响排队)与 damageEnemy(送葬乘区),不入 statsOf
    }
  }

  /**
   * 章节节点层(V1.1)的共享 tick:延迟新星 / 延迟扇射 / 延迟谢幕 / 城垣 / 过载合并窗 /
   * 冰印到期 / 踏迹印与爆种 / 双狼配对 / 亡影幕。世界层与 balance-sim 都经 `update()` 调到这里,
   * 不另写第二份。
   */
  private tickBuild(ctx: BattleContext, dt: number): void {
    const p = ctx.player;
    const br = p.buildRes;
    const now = p.buildTime;
    const branch = buildBranch(p.buildBranchId);
    const node = selectedBuildPatch(p.buildNodes);

    // 延迟新星(双向反刺 / 孤花第二段)
    for (let i = br.pendingNova.length - 1; i >= 0; i--) {
      const n = br.pendingNova[i];
      if (now < n.at) continue;
      const eq = this.equipmentBySkillId(ctx, n.sourceId);
      if (eq) this.damageArea(ctx, eq, vec2(n.x, n.y), n.radius, n.damage, { maxTargets: n.maxTargets, from: vec2(n.x, n.y) });
      br.pendingNova.splice(i, 1);
    }
    // 延迟扇射(折返 / 两波)
    for (let i = br.pendingFan.length - 1; i >= 0; i--) {
      const f = br.pendingFan[i];
      if (now < f.at) continue;
      const eq = this.equipmentBySkillId(ctx, f.sourceId);
      if (eq) this.fireFan(ctx, eq, f.x, f.y, f.angle, f.count, f.damage, f.speed, f.pierce, f.kind, f.arc);
      br.pendingFan.splice(i, 1);
    }
    // 延迟谢幕(终场返照)
    for (let i = br.pendingShade.length - 1; i >= 0; i--) {
      const s = br.pendingShade[i];
      if (now < s.at) continue;
      const eq = this.equipmentBySkillId(ctx, "willow_core");
      if (eq) {
        this.damageArea(ctx, eq, vec2(s.x, s.y), s.radius, s.damage, { maxTargets: s.maxTargets, from: vec2(s.x, s.y) });
        if (s.slow) this.applyBuildSlow(ctx, vec2(s.x, s.y), s.radius, node?.shade?.slow);
      }
      br.pendingShade.splice(i, 1);
    }
    // 城垣:跟随 / 首次越界
    for (const c of ctx.clouds) {
      if (!c.wall) continue;
      if (c.wall.follow) {
        c.pos.x = p.pos.x;
        c.pos.y = p.pos.y;
      }
      for (const e of ctx.enemies) {
        if (e.hp <= 0 || c.wall.hit.has(e.id)) continue;
        if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
          c.wall.hit.add(e.id);
          ctx.damageEnemy(e, c.wall.damage, { source: c.source, from: c.pos });
        }
      }
    }

    // 凯尔 A:过载合并窗到期 → 结算本窗过载;额外齐射不积过载
    const overload = branch?.loop.overload;
    if (overload) {
      if (br.overloadCd > 0) br.overloadCd = Math.max(0, br.overloadCd - dt);
      if (br.overloadWindowAt >= 0 && now - br.overloadWindowAt >= overload.windowSec) {
        const q = Math.min(overload.perRoundMax, overload.base + overload.perTarget * br.overloadWindowTargets.length);
        br.overload = Math.min(overload.cap, br.overload + q);
        br.overloadWindowAt = -1;
        br.overloadWindowTargets = [];
      }
    }

    // 凯尔 B:冰印到期 / 携印 / 待发冰锥
    const marksB = branch?.loop.marksB;
    if (marksB) {
      for (const key of Object.keys(br.marks)) {
        const id = Number(key);
        const st = br.marks[id];
        const target = ctx.enemies.find((e) => e.id === id && e.hp > 0);
        if (!target) {
          const carry = node?.mark?.carry ?? 0;
          if (carry > 0 && st.stacks > 0) {
            const next = this.nearest(p.pos, ctx.enemies, 640);
            if (next) {
              const nx = br.marks[next.id] ?? { stacks: 0, lastAt: now, spare: 0 };
              nx.stacks = Math.min(marksB.cap, nx.stacks + Math.min(carry, st.stacks));
              nx.lastAt = now;
              br.marks[next.id] = nx;
            }
          }
          delete br.marks[id];
        } else if (now - st.lastAt > marksB.expireSec && st.stacks > 0) {
          delete br.marks[id];
        }
      }
      if (br.pendingIcicle && now >= br.pendingIcicle.at) {
        const pi = br.pendingIcicle;
        br.pendingIcicle = null;
        this.fireIcicle(ctx, pi, node, marksB);
      }
    }

    // 薇拉 B:移动铺迹 / 踏迹印 / 3 印爆种
    const imprint = branch?.loop.trailImprint;
    if (imprint) {
      if (p.movedThisFrame > 0) {
        br.moveAccum += p.movedThisFrame;
        while (br.moveAccum >= imprint.moveTrailEvery) {
          br.moveAccum -= imprint.moveTrailEvery;
          const eq = this.equipmentBySkillId(ctx, "vera_core");
          if (!eq) break;
          const trails = ctx.clouds.filter((c) => c.trail);
          while (trails.length >= imprint.trailMax) {
            const old = trails.shift()!;
            const idx = ctx.clouds.indexOf(old);
            if (idx >= 0) ctx.clouds.splice(idx, 1);
          }
          ctx.clouds.push(spawnCloud({
            pos: vec2(p.pos.x, p.pos.y), radius: imprint.moveTrailRadius, dps: imprint.moveTrailDps,
            duration: imprint.moveTrailDuration, trail: true, source: eq,
          }));
        }
      }
      const trails = ctx.clouds.filter((c) => c.trail);
      // 接续棘径:最近两块迹之间形成可叠印窄带
      const link = node?.trail?.link;
      if (link && trails.length >= 2) {
        const a = trails[trails.length - 2];
        const b = trails[trails.length - 1];
        for (const e of ctx.enemies) {
          if (e.hp <= 0 || this.pointSegmentDist(e.pos, a.pos, b.pos) > link.width / 2 + e.def.radius) continue;
          if (Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > link.maxLength) continue;
          this.addTrailMark(ctx, e, imprint, now);
        }
      }
      if (trails.length > 0) {
        for (const e of ctx.enemies) {
          if (e.hp <= 0) continue;
          const onTrail = trails.some((c) => Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius);
          if (!onTrail) continue;
          const st = this.addTrailMark(ctx, e, imprint, now);
          if (st && st.stacks >= imprint.detonateAt) {
            br.trailBoomAt = br.trailBoomAt.filter((t) => now - t < 1);
            if (br.trailBoomAt.length >= imprint.detonateMaxPerSec) continue;
            br.trailBoomAt.push(now);
            st.stacks -= imprint.detonateAt;
            if (st.stacks <= 0) delete br.trailMarks[e.id];
            const eq = this.equipmentBySkillId(ctx, "vera_core");
            if (!eq) continue;
            const dmg = Math.round(imprint.detonateBaseDamage * imprint.detonateDamageMult);
            if (node?.trail?.doubleBloom) {
              const delay = node.trail.doubleBloom.delay;
              const share = node.trail.doubleBloom.damageShare;
              for (const k of [1, 2]) {
                br.pendingNova.push({
                  at: now + delay * k, x: e.pos.x, y: e.pos.y, radius: 80,
                  damage: Math.round(dmg * share), sourceId: "vera_core", maxTargets: 1,
                });
              }
            } else if (node?.trail?.bloom) {
              this.damageArea(ctx, eq, e.pos, node.trail.bloom.radius, Math.round(dmg * node.trail.bloom.damageMult), { maxTargets: node.trail.bloom.maxTargets, from: e.pos });
            } else {
              this.damageArea(ctx, eq, e.pos, imprint.detonateRadius, dmg, { maxTargets: imprint.detonateMaxTargets, from: e.pos });
            }
            if (node?.trail?.seed) {
              const other = this.nearest(e.pos, ctx.enemies.filter((x) => x.hp > 0 && x.id !== e.id), node.trail.seed.radius);
              if (other) {
                const os = br.trailMarks[other.id] ?? { stacks: 0, lastAt: now };
                os.stacks = Math.min(imprint.maxMarks, os.stacks + node.trail.seed.marks);
                os.lastAt = now;
                br.trailMarks[other.id] = os;
              }
            }
            if (node?.trail?.moveOldest && trails.length > 0) {
              trails[0].pos.x = e.pos.x;
              trails[0].pos.y = e.pos.y;
            }
          }
        }
      }
      // 扎根:场上无敌人时,最新棘迹跟玩家 1 秒
      if (node?.trail?.follow && ctx.enemies.every((e) => e.hp <= 0) && trails.length > 0) {
        const newest = trails[trails.length - 1];
        newest.pos.x = p.pos.x;
        newest.pos.y = p.pos.y;
        newest.ttl = Math.max(newest.ttl, node.trail.follow.seconds);
      }
    }

    // 薇洛 A:头狼 / 焦点到期,猎记脱战逐秒掉
    const wolfPair = branch?.loop.wolfPair;
    if (wolfPair && br.wolf) {
      const w = br.wolf;
      if (w.alphaUntil > 0 && now > w.alphaUntil) w.alphaUntil = 0;
      if (w.focusUntil > 0 && now > w.focusUntil) {
        w.focusUntil = 0;
        w.focusTargetId = 0;
      }
      if (w.marks > 0) {
        const last = Math.max(w.lastPairAt, w.lAt, w.rAt);
        if (now - last > wolfPair.markDecayDelay) {
          w.marks = Math.max(0, w.marks - wolfPair.markDecayPerSec * dt);
        }
      }
    }

    // 薇洛 B:谢幕 ICD 与自然到期攒满后的结算
    const troupe = branch?.loop.shadeTroupe;
    if (troupe && br.shade) {
      if (br.shade.cd > 0) br.shade.cd = Math.max(0, br.shade.cd - dt);
      if (br.shade.acts >= troupe.actsToCurtain) {
        const eq = this.equipmentBySkillId(ctx, "willow_shades");
        if (eq) this.castCurtain(ctx, eq, troupe, node?.shade);
      }
    }
  }

  /** 踏迹印:每靶每秒首次踏迹 +1(上限 / 最多靶数读表);返回该靶印记 */
  private addTrailMark(
    ctx: BattleContext,
    e: Enemy,
    imprint: { markPerSec: number; maxMarks: number; maxTargets: number },
    now: number,
  ): { stacks: number; lastAt: number } | null {
    const br = ctx.player.buildRes;
    let st = br.trailMarks[e.id];
    if (!st) {
      if (Object.keys(br.trailMarks).length >= imprint.maxTargets) return null;
      st = { stacks: 0, lastAt: -99 };
      br.trailMarks[e.id] = st;
    }
    if (now - st.lastAt >= 1 / imprint.markPerSec) {
      st.stacks = Math.min(imprint.maxMarks, st.stacks + 1);
      st.lastAt = now;
    }
    return st;
  }

  /** 点到线段距离(接续棘径 / 合围猎线共用) */
  private pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }

  /** 凯尔 B 冰锥结算(单靶 2×40;裁决节点改写为贯线 / 驻留 / 折射 / 侧晶) */
  private fireIcicle(
    ctx: BattleContext,
    pi: { targetId: number; at: number; x: number; y: number },
    node: import("../data/heroBuild").BuildPatch | null,
    loop: { detonateDamageMult: number },
  ): void {
    const eq = this.equipmentBySkillId(ctx, "kyle_core");
    if (!eq) return;
    const damage = Math.round(40 * loop.detonateDamageMult);
    const target = ctx.enemies.find((e) => e.id === pi.targetId && e.hp > 0);
    if (node?.mark?.pierceLine) {
      const origin = target ? target.pos : vec2(pi.x, pi.y);
      const dir = target ? Math.atan2(target.pos.y - ctx.player.pos.y, target.pos.x - ctx.player.pos.x) : 0;
      this.damageLine(ctx, eq, origin, dir, 320, 40, damage, node.mark.pierceLine.pierce, {});
      const behind = this.nearest(origin, ctx.enemies.filter((e) => e.hp > 0 && e.id !== target?.id), 320);
      if (behind) ctx.damageEnemy(behind, Math.round(damage * node.mark.pierceLine.falloff), { source: eq });
    } else if (node?.mark?.stationary) {
      if (target) ctx.damageEnemy(target, damage, { source: eq });
      else this.damageArea(ctx, eq, vec2(pi.x, pi.y), 60, Math.round(damage / 2), { maxTargets: 1 });
    } else if (target) {
      ctx.damageEnemy(target, damage, { source: eq });
      if (node?.mark?.refract) {
        const other = this.nearest(target.pos, ctx.enemies.filter((e) => e.hp > 0 && e.id !== target.id), 320);
        if (other) ctx.damageEnemy(other, Math.round(damage / 2), { source: eq });
      }
    }
    if (node?.mark?.sideShard && target) {
      const ang = Math.atan2(target.pos.y - ctx.player.pos.y, target.pos.x - ctx.player.pos.x) + Math.PI / 2;
      const dir = vec2(Math.cos(ang), Math.sin(ang));
      const proj = spawnProjectile({
        kind: "knife", pos: vec2(ctx.player.pos.x, ctx.player.pos.y), dir, speed: 560,
        damage: Math.round(damage * node.mark.sideShard.damageMult), radius: 5,
        pierce: 0, chainLeft: 0, chainRange: 0, source: eq,
      });
      ctx.projectiles.push(proj);
    }
  }

  /** 亡影 / 终场定格的减速(免控 Boss 只受原伤,不减速) */
  private applyBuildSlow(ctx: BattleContext, at: Vec2, radius: number, slow: { duration: number; factor: number } | undefined): void {
    if (!slow) return;
    for (const e of ctx.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.pos.x - at.x, e.pos.y - at.y) > radius + e.def.radius) continue;
      applySlow(e, slow.factor, slow.duration);
    }
  }

  /** 一条扇射(延迟段 / 额外齐射共用;不读触发器、不积资源) */
  private fireFan(
    ctx: BattleContext,
    eq: Equipment,
    x: number, y: number,
    angle: number,
    count: number,
    damage: number,
    speed: number,
    pierce: number,
    kind: "ray" | "knife",
    arc = Math.PI * 2,
  ): void {
    const spread = arc / Math.max(1, count);
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * spread;
      ctx.projectiles.push(spawnProjectile({
        kind,
        pos: vec2(x, y),
        dir: vec2(Math.cos(a), Math.sin(a)),
        speed,
        damage,
        radius: kind === "ray" ? 7 : 5,
        pierce,
        chainLeft: 0,
        chainRange: 300,
        source: eq,
      }));
    }
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
