/**
 * 敌人实体。基础类型:追兵/迅捷/坦克/精英;策划案 4.3 六种特化敌人 + 分裂幼体。
 * 策划数值(基础属性/缩放曲线/机制参数)统一在 ../data/enemies 规范表;本文件只保留运行时状态与 AI 逻辑。
 */

import { type Vec2, vec2, clamp } from "../core/math";
import {
  ENEMY_DEFS,
  waveHpMult,
  waveSpeedMult,
  HIDER_CYCLE,
  HIDER_VISIBLE,
  SUMMONER_INTERVAL,
  SUMMONER_COUNT,
  SUMMON_SPREAD,
  SPLIT_COUNT_DEFAULT,
  SPLIT_COUNT_GOD,
  SPLIT_COUNT_BOSS,
  SPLIT_SPREAD,
  REFLECT_RATE,
  REFLECT_RATE_BOSS,
  FRONT_GUARD_DOT,
  FRONT_GUARD_MULT,
  FRONT_GUARD_MULT_BOSS,
  BOSS_PHASE2_HP,
  BOSS_PHASE3_HP,
  BOSS_SLAM,
  BOSS_SUMMON,
  BOSS_FRENZY_SPEED,
  AURA_MULT_CAP,
  type EnemyKind,
  type EnemyDef,
  type EnemySkill,
} from "../data/enemies";
import { seasonVariantDef } from "../data/seasonMonsters";

// 策划规范表符号经本模块再导出(历史导入路径兼容;唯一出处在 ../data/enemies)
export {
  ENEMY_DEFS,
  waveHpMult,
  waveSpeedMult,
  randomEnemyKind,
  bossHpMult,
  BOSS_HP_CURVE,
  BOSS_SLAM,
  BOSS_SUMMON,
  BOSS_FRENZY_SPEED,
  AURA_MULT_CAP,
} from "../data/enemies";
export type { EnemyKind, EnemyDef, EnemyMech, EnemySkill, SpawnCurveRow } from "../data/enemies";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  /** 冰霜射线减速:剩余时长与系数 */
  slowTimer: number;
  slowFactor: number;
  /** 与玩家的接触伤害冷却(同一敌人不会每帧咬人) */
  hitCooldown: number;
  /** 精英/特殊敌人标记 */
  isElite: boolean;
  /* ---------- 特化机制状态(策划案 4.3) ---------- */
  /** 隐匿者:当前是否隐身(隐身时不可被瞄准/命中) */
  hidden: boolean;
  /** 隐匿者:周期计时 */
  hiddenTimer: number;
  /** 召唤师:召唤倒计时 */
  summonTimer: number;
  summonInterval: number;
  /** 护盾卫士:当前朝向(面向目标) */
  facing: Vec2;
  /** 分裂体:死亡后分裂出的幼体数 */
  splitCount: number;
  /** 还魂体(批 3):是否已复活过一次(每只限一次;缺省 = 未复活)。复活次数是实例状态,不挂在共享的 def.mech 上 */
  revivedOnce?: boolean;
  /** 批 4 技能实例状态(触发倒计时 + 冲锋状态机;首次 updateSkill 时惰性构造,基线怪恒 undefined) */
  skillState?: SkillState;
  /* ---------- Boss 三阶段机制(策划案 V3 §3.2) ---------- */
  /** 深渊领主阶段:1 追击 / 2 震击 / 3 狂暴(单调推进,不回退) */
  bossPhase: 1 | 2 | 3;
  /** Boss 变体:full = 满机制(奇数关);weak = hp×BOSS_WEAK_HP_MULT、无死亡分裂、跳过 P2(偶数关) */
  bossVariant: "full" | "weak";
  /** 地面震击:蓄力剩余时间(>0 = 蓄力中,震点已锁定;归零即引爆) */
  bossSlamCharge: number;
  /** 地面震击锁定位置(蓄力开始时的玩家位置快照,可走位躲避) */
  bossSlamPos: Vec2 | null;
  /** Boss 召唤倒计时(P2 起;P3 减半) */
  bossSummonTimer: number;
  /* ---------- 纯装饰 FX 标记(不参与结算,仅供 game.ts FX 层读) ---------- */
  /** FX 层:上一帧是否隐身(隐匿进出过渡粒子用) */
  fxHidden?: boolean;
  /** FX 层:是否已发射过登场特效 */
  fxSpawned?: boolean;
}

let uid = 0;

/** 仅标定/测试用:重置敌人 id 计数(移动抖动按 id 取哈希,不归零会导致模拟随上下文漂移) */
export function _resetEnemyUid(): void {
  uid = 0;
}

/** 按波次缩放生成敌人(血量/移速曲线见 ../data/enemies 规范表) */
export function spawnEnemy(kind: EnemyKind, pos: Vec2, wave: number, def: EnemyDef = ENEMY_DEFS[kind]): Enemy {
  const hp = Math.round(def.hp * waveHpMult(wave));
  return {
    id: ++uid,
    kind,
    def,
    pos,
    hp,
    maxHp: hp,
    speed: def.speed * waveSpeedMult(wave),
    slowTimer: 0,
    slowFactor: 1,
    hitCooldown: 0,
    isElite: kind === "elite",
    hidden: false,
    hiddenTimer: 0,
    summonTimer: SUMMONER_INTERVAL,
    summonInterval: SUMMONER_INTERVAL,
    facing: vec2(1, 0),
    splitCount: SPLIT_COUNT_DEFAULT,
    bossPhase: 1,
    bossVariant: "full",
    bossSlamCharge: 0,
    bossSlamPos: null,
    bossSummonTimer: 0,
  };
}

/** 敌人 AI:向目标移动(带一点随机抖动),应用减速。stopRadius 为目标的碰撞半径;
 * speedMult = 光环派生移速乘数(批 4;每帧重算不改写属性,缺省 1 = 基线路径) */
export function updateEnemy(e: Enemy, target: Vec2, stopRadius: number, dt: number, speedMult = 1): void {
  if (e.slowTimer > 0) {
    e.slowTimer -= dt;
    if (e.slowTimer <= 0) e.slowFactor = 1;
  }
  // 冲锋序列(windup 原地蓄力 / dash 直线冲刺):常规移动让位,冲刺位移在 updateSkill 结算
  if (e.skillState?.skillDashing) {
    if (e.hitCooldown > 0) e.hitCooldown -= dt;
    return;
  }
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  // 更新朝向(护盾卫士正面判定用)
  e.facing = vec2(dx / d, dy / d);
  const stop = e.def.radius + stopRadius;
  if (d <= stop) {
    // 已贴身:不再前进,沿切向缓慢漂移,让尸潮围成一圈而不是叠在目标身上
    const side = Math.sin(e.id * 7.31) * 0.5 + 0.5; // 每个敌人固定的左右偏好
    const sp = e.speed * e.slowFactor * 0.35 * (side - 0.5) * speedMult;
    if (d > 1e-3) {
      e.pos.x += (-dy / d) * sp * dt;
      e.pos.y += (dx / d) * sp * dt;
    }
    // 切线漂移可能把敌人挤回目标身上,做一次最小距离校正;
    // 正中心时方向未定义,随机选一个方向弹开
    const dx2 = target.x - e.pos.x;
    const dy2 = target.y - e.pos.y;
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (d2 < stop * 0.7) {
      let nx = dx2 / d2;
      let ny = dy2 / d2;
      if (d2 < 1e-3) {
        const a = Math.random() * Math.PI * 2;
        nx = Math.cos(a);
        ny = Math.sin(a);
      }
      e.pos.x = target.x - nx * stop * 0.8;
      e.pos.y = target.y - ny * stop * 0.8;
    }
    if (e.hitCooldown > 0) e.hitCooldown -= dt;
    return;
  }
  const jitter = 1 + Math.sin(e.id * 12.9898 + e.pos.x * 0.01) * 0.08;
  const sp = e.speed * e.slowFactor * jitter * speedMult;
  e.pos.x += (dx / d) * sp * dt;
  e.pos.y += (dy / d) * sp * dt;
  if (e.hitCooldown > 0) e.hitCooldown -= dt;
}

/**
 * 特化机制每帧更新(策划案 4.3 + 神级敌人复合机制):
 * 隐匿者/神之敌周期性隐身;召唤师定时在自身周围召唤小怪。节奏参数见规范表。
 */
export function updateSpecial(e: Enemy, dt: number, spawnChild: (kind: EnemyKind, pos: Vec2) => void): void {
  if (e.kind === "hider" || e.kind === "god") {
    e.hiddenTimer += dt;
    e.hidden = (e.hiddenTimer % HIDER_CYCLE) >= HIDER_VISIBLE;
  }
  if (e.kind === "summoner") {
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      e.summonTimer = e.summonInterval;
      for (let i = 0; i < SUMMONER_COUNT; i++) {
        spawnChild("chaser", vec2(e.pos.x + (Math.random() - 0.5) * SUMMON_SPREAD, e.pos.y + (Math.random() - 0.5) * SUMMON_SPREAD));
      }
    }
  }
}

/** 反射者/神之敌:反弹受到的伤害给目标(按比例,策划案 4.3"反弹伤害");Boss 反弹比例见规范表 */
export function reflectDamage(e: Enemy, dmg: number, reflectRate = REFLECT_RATE): number {
  if (e.kind === "boss") return Math.max(1, Math.round(dmg * REFLECT_RATE_BOSS));
  return e.kind === "reflector" || e.kind === "god" ? Math.max(1, Math.round(dmg * reflectRate)) : 0;
}

/**
 * 护盾卫士/神之敌/Boss:正面免疫伤害 —— 朝向目标,正面弧内伤害减免(策划案 4.3"正面免疫")。
 * 多方向/AOE 攻击可以绕过正面。
 */
export function shieldguardDamageMult(e: Enemy, sourcePos: Vec2): number {
  if (e.kind !== "shieldguard" && e.kind !== "god" && e.kind !== "boss") return 1;
  const dx = sourcePos.x - e.pos.x;
  const dy = sourcePos.y - e.pos.y;
  const dl = Math.hypot(dx, dy) || 1;
  const dot = (dx / dl) * e.facing.x + (dy / dl) * e.facing.y;
  if (dot <= FRONT_GUARD_DOT) return 1; // 正面 60° 弧内视为正面
  return e.kind === "boss" ? FRONT_GUARD_MULT_BOSS : FRONT_GUARD_MULT;
}

/** 分裂体/神之敌/Boss:死亡后分裂出幼体(策划案 4.3"死亡后分裂";偶数关弱化 Boss 不分裂) */
export function splitBabies(e: Enemy): { kind: EnemyKind; pos: Vec2 }[] {
  if (e.kind !== "splitter" && e.kind !== "god" && e.kind !== "boss") return [];
  if (e.kind === "boss" && e.bossVariant === "weak") return [];
  const out: { kind: EnemyKind; pos: Vec2 }[] = [];
  const count = e.kind === "god" ? SPLIT_COUNT_GOD : e.kind === "boss" ? SPLIT_COUNT_BOSS : e.splitCount;
  for (let i = 0; i < count; i++) {
    out.push({ kind: "splitling", pos: vec2(e.pos.x + (Math.random() - 0.5) * SPLIT_SPREAD, e.pos.y + (Math.random() - 0.5) * SPLIT_SPREAD) });
  }
  return out;
}

/**
 * 死亡召唤(批 4,万骸指挥):死亡结算钩子,返回尸体处生成的子怪规格表(生成与门控在 game 层)。
 * 无 deathSummon 技能 = 空表;子怪带 childVariant 折入的变体定义(缺省 = 基线怪)。
 */
export function deathSummonSpecs(e: Enemy): { kind: EnemyKind; pos: Vec2; def?: EnemyDef }[] {
  const ds = e.def.skill?.deathSummon;
  if (!ds) return [];
  const def = ds.childVariant ? seasonVariantDef(ds.childVariant) ?? undefined : undefined;
  const out: { kind: EnemyKind; pos: Vec2; def?: EnemyDef }[] = [];
  for (let i = 0; i < ds.count; i++) {
    out.push({
      kind: ds.kind,
      pos: vec2(e.pos.x + (Math.random() - 0.5) * SUMMON_SPREAD, e.pos.y + (Math.random() - 0.5) * SUMMON_SPREAD),
      def,
    });
  }
  return out;
}

/**
 * 死亡分裂(批 4,覆盖式):携带 deathSplit 技能时取代基线分裂数量。
 * @returns null = 无技能,调用方回落 splitBabies;[] = weak 阀门(弱化首领不分裂,同基线);否则按表内 count 分裂
 */
export function skillSplitBabies(e: Enemy): { kind: EnemyKind; pos: Vec2 }[] | null {
  const ds = e.def.skill?.deathSplit;
  if (!ds) return null;
  if (e.kind === "boss" && e.bossVariant === "weak") return [];
  const out: { kind: EnemyKind; pos: Vec2 }[] = [];
  for (let i = 0; i < ds.count; i++) {
    out.push({ kind: "splitling", pos: vec2(e.pos.x + (Math.random() - 0.5) * SPLIT_SPREAD, e.pos.y + (Math.random() - 0.5) * SPLIT_SPREAD) });
  }
  return out;
}

export function applySlow(e: Enemy, factor: number, duration: number): void {
  e.slowFactor = Math.min(e.slowFactor, factor);
  e.slowTimer = Math.max(e.slowTimer, duration);
}

/**
 * 还魂体(批 3):首次致死时原地复活一次,回到 hpFrac×maxHp。
 * 仅当携带 revive 机制、尚未复活、且当前血量 ≤0 时触发;复活后照常可被击杀/分裂。
 * 纯"死亡"结算钩子(与 slowOnHit 的"受击"钩子、deathPool 的"死亡落池"钩子并列),不改 kind、零新 AI。
 * @returns 是否复活成功(false = 调用方应走正常击杀)
 */
export function tryRevive(e: Enemy): boolean {
  const mech = e.def.mech;
  if (!mech || mech.type !== "revive" || e.revivedOnce || e.hp > 0) return false;
  e.revivedOnce = true;
  e.hp = Math.max(1, Math.round(e.maxHp * mech.hpFrac));
  return true;
}

/* ---------- 批 4:精英/首领专属技能(驱动入口;参数表在 data/seasonMonsters) ---------- */

/** 技能实例状态:各原语触发倒计时 + 冲锋状态机(首次 updateSkill 惰性构造,基线怪不分配) */
export interface SkillState {
  /* 各原语下次触发倒计时(秒;初值 = 表内 first;无该槽位的技能恒 0 不使用) */
  slamT: number;
  summonT: number;
  pulseT: number;
  barrageT: number;
  /** fireTrail 下次落池倒计时 */
  trailT: number;
  /** charge 下次可用倒计时(仅 chargePhase = 0 时递减) */
  chargeT: number;
  /** hideCycle 累计计时(秒;e.hidden = (hideT % cycle) >= visible,与隐匿者同语义) */
  hideT: number;
  /* 冲锋状态机 */
  /** 0 = 待命(等 chargeT)/ 1 = windup 原地蓄力 / 2 = dash 沿 chargeDir 冲刺 */
  chargePhase: 0 | 1 | 2;
  /** 当前冲锋阶段剩余时长(秒;阶段 1 = windup、阶段 2 = duration) */
  chargePhaseT: number;
  /** dash 方向(单位向量;windup 结束瞬间锁定为当时指向玩家的方向) */
  chargeDir: Vec2 | null;
  /** 本次 dash 是否已撞击玩家(单次冲锋只结算一次) */
  chargeHit: boolean;
  /** 冲锋序列进行中(阶段 ≥ 1:windup 原地蓄力 / dash 直线冲刺;updateEnemy 常规移动让位) */
  skillDashing: boolean;
}

/**
 * 技能预警(telegraph)实体:震击/脉冲/轰炸触发瞬间快照玩家位置生成,
 * 由 game.ts 持有(倒计时/渲染/引爆),不占用 bossSlamCharge —— 三阶段机零触碰。
 */
export interface SkillTelegraph {
  pos: Vec2;
  /** 引爆判定半径(px;global 雾型忽略) */
  radius: number;
  /** 蓄力剩余时长(秒;归零引爆) */
  charge: number;
  /** 引爆伤害(点;global 雾型 = 0,只上减速) */
  damage: number;
  /** 命中玩家施加的减速(走 Player.applySlow 共享快照) */
  slow?: { factor: number; duration: number };
  /** 全场雾型:引爆不查半径,渲染全屏 tint */
  global?: boolean;
  /** 预警圈颜色(= 载体 def.color,区分来源) */
  color: string;
}

/** 技能世界效果回调(复刻 BossEvents 模式:实体层纯判定,生成/伤害/落池在 game.ts) */
export interface SkillEvents {
  /** 召唤子怪(def = childVariant 折入的变体定义;缺省 = 基线怪) */
  spawnChild(kind: EnemyKind, pos: Vec2, def?: EnemyDef): void;
  /** 生成预警实体(震击/脉冲/轰炸共用管线) */
  onTelegraph(t: SkillTelegraph): void;
  /** 冲锋撞击命中玩家(伤害 + 可选减速/落灼烧池;pos = 撞击点) */
  onChargeHit(damage: number, pos: Vec2, slow?: { factor: number; duration: number }, ignite?: { radius: number; duration: number }): void;
  /** 落灼烧池(fireTrail;DoT 口径复用毒池) */
  onDropPool(pos: Vec2, radius: number, duration: number): void;
}

/** 技能状态初值:各倒计时取表内 first(hideCycle 从可见段起步) */
export function makeSkillState(skill: EnemySkill): SkillState {
  return {
    slamT: skill.slam?.first ?? 0,
    summonT: skill.summon?.first ?? 0,
    pulseT: skill.pulse?.first ?? 0,
    barrageT: skill.barrage?.first ?? 0,
    trailT: skill.fireTrail?.first ?? 0,
    chargeT: skill.charge?.first ?? 0,
    hideT: 0,
    chargePhase: 0,
    chargePhaseT: 0,
    chargeDir: null,
    chargeHit: false,
    skillDashing: false,
  };
}

/**
 * 批 4 技能每帧驱动(主动计时行为):`e.def.skill` 为空或已死亡首行 return。
 * 行为仍由 kind 决定、首领三阶段照旧 —— 技能是纯附加层(铁律:不抬曲线)。
 * arena = 战场矩形(轰炸 field 落点均布、冲锋钳制用;与 waves.ArenaRect 同构)。
 * 11 原语分支已全部实装:震击/召唤家族/脉冲/轰炸/隐身/火带 → 冲锋/光环(见 auraMultAt)。
 */
export function updateSkill(
  e: Enemy,
  dt: number,
  playerPos: Vec2,
  playerRadius: number,
  arena: { x0: number; y0: number; x1: number; y1: number },
  ev: SkillEvents
): void {
  const skill = e.def.skill;
  if (!skill || e.hp <= 0) return;
  if (!e.skillState) e.skillState = makeSkillState(skill);
  const st = e.skillState;
  // 震击:周期蓄力,触发瞬间快照玩家位置出 telegraph(倒计时/引爆在 game 层,走位可躲)
  if (skill.slam) {
    st.slamT -= dt;
    if (st.slamT <= 0) {
      st.slamT += skill.slam.interval;
      ev.onTelegraph({
        pos: vec2(playerPos.x, playerPos.y),
        radius: skill.slam.radius,
        charge: skill.slam.charge,
        damage: skill.slam.damage,
        color: e.def.color,
      });
    }
  }
  // 周期召唤:子怪落点在载体身旁(同召唤师口径);childVariant 记忆化解析为变体定义,缺省 = 基线小怪
  if (skill.summon) {
    st.summonT -= dt;
    if (st.summonT <= 0) {
      st.summonT += skill.summon.interval;
      const childDef = skill.summon.childVariant ? seasonVariantDef(skill.summon.childVariant) ?? undefined : undefined;
      for (let i = 0; i < skill.summon.count; i++) {
        ev.spawnChild(
          skill.summon.kind,
          vec2(e.pos.x + (Math.random() - 0.5) * SUMMON_SPREAD, e.pos.y + (Math.random() - 0.5) * SUMMON_SPREAD),
          childDef
        );
      }
    }
  }
  // 脉冲:区域型快照玩家位置(与震击同管线,附加减速);全场雾型不查半径,引爆全体减速 + 全屏 tint
  if (skill.pulse) {
    st.pulseT -= dt;
    if (st.pulseT <= 0) {
      st.pulseT += skill.pulse.interval;
      ev.onTelegraph({
        pos: vec2(playerPos.x, playerPos.y),
        radius: skill.pulse.radius,
        charge: skill.pulse.charge,
        damage: skill.pulse.damage,
        slow: skill.pulse.slow ? { ...skill.pulse.slow } : undefined,
        global: skill.pulse.global,
        color: e.def.color,
      });
    }
  }
  // 多点轰炸:一次生成 count 条 telegraph(aroundPlayer = 玩家快照周围散布;field = 均布战场),同震击管线
  if (skill.barrage) {
    st.barrageT -= dt;
    if (st.barrageT <= 0) {
      st.barrageT += skill.barrage.interval;
      for (let i = 0; i < skill.barrage.count; i++) {
        const pos =
          skill.barrage.aim === "aroundPlayer"
            ? vec2(playerPos.x + (Math.random() - 0.5) * skill.barrage.spread, playerPos.y + (Math.random() - 0.5) * skill.barrage.spread)
            : vec2(arena.x0 + Math.random() * (arena.x1 - arena.x0), arena.y0 + Math.random() * (arena.y1 - arena.y0));
        ev.onTelegraph({ pos, radius: skill.barrage.radius, charge: skill.barrage.charge, damage: skill.barrage.damage, color: e.def.color });
      }
    }
  }
  // 隐身周期(同隐匿者语义:周期前段可见、后段隐身;隐身时不可被命中,占比 ≤0.2 由表预算守门)
  if (skill.hideCycle) {
    st.hideT += dt;
    e.hidden = (st.hideT % skill.hideCycle.cycle) >= skill.hideCycle.visible;
  }
  // 行进火带:周期在自身位置落灼烧池(位置快照拷贝;DoT 口径复用毒池,场上上限驱逐在 game 层)
  if (skill.fireTrail) {
    st.trailT -= dt;
    if (st.trailT <= 0) {
      st.trailT += skill.fireTrail.interval;
      ev.onDropPool(vec2(e.pos.x, e.pos.y), skill.fireTrail.radius, skill.fireTrail.duration);
    }
  }
  // 冲锋:三段状态机(待命 → windup 原地蓄力 → dash 直线冲刺)。
  // 方向在 windup 结束瞬间锁定(玩家位置快照,走位可躲);撞击只结算一次;
  // dash 位移在本处结算(常规移动让位 skillDashing),落点钳制在战场矩形内。
  if (skill.charge) {
    const c = skill.charge;
    if (st.chargePhase === 0) {
      st.chargeT -= dt;
      if (st.chargeT <= 0) {
        st.chargePhase = 1;
        st.chargePhaseT = c.windup;
        st.skillDashing = true; // windup 起原地蓄力,不再走常规移动
      }
    } else if (st.chargePhase === 1) {
      st.chargePhaseT -= dt;
      if (st.chargePhaseT <= 0) {
        st.chargePhase = 2;
        st.chargePhaseT = c.duration;
        st.chargeHit = false;
        const dx = playerPos.x - e.pos.x;
        const dy = playerPos.y - e.pos.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        st.chargeDir = vec2(dx / d, dy / d);
      }
    } else {
      st.chargePhaseT -= dt;
      const dir = st.chargeDir!;
      const sp = e.speed * c.speedMult;
      e.pos.x = clamp(e.pos.x + dir.x * sp * dt, arena.x0 + e.def.radius, arena.x1 - e.def.radius);
      e.pos.y = clamp(e.pos.y + dir.y * sp * dt, arena.y0 + e.def.radius, arena.y1 - e.def.radius);
      if (!st.chargeHit) {
        const dx = playerPos.x - e.pos.x;
        const dy = playerPos.y - e.pos.y;
        const rr = e.def.radius + playerRadius;
        if (dx * dx + dy * dy <= rr * rr) {
          st.chargeHit = true;
          ev.onChargeHit(
            c.damage,
            vec2(e.pos.x, e.pos.y),
            c.slow ? { ...c.slow } : undefined,
            c.ignite ? { ...c.ignite } : undefined
          );
        }
      }
      if (st.chargePhaseT <= 0) {
        st.chargePhase = 0;
        st.chargePhaseT = 0;
        st.chargeDir = null;
        st.skillDashing = false;
        st.chargeT = c.interval;
      }
    }
  }
}

/**
 * 光环(批 4):每帧派生乘数。扫描载体圆(距离平方比较),自身在圈内同样受益;
 * 连乘结果按 AURA_MULT_CAP 钳制 —— 派生值只影响当帧移速/接触伤害,不改写目标属性。
 * carriers = game 层预筛的存活光环载体(现实 ≤ 10 只,最坏扫描量可忽略)。
 */
export function auraMultAt(self: Enemy, carriers: readonly Enemy[]): { speed: number; dmg: number } {
  let speed = 1;
  let dmg = 1;
  for (const a of carriers) {
    const aura = a.def.skill?.aura;
    if (!aura || a.hp <= 0) continue;
    const dx = self.pos.x - a.pos.x;
    const dy = self.pos.y - a.pos.y;
    if (dx * dx + dy * dy > aura.radius * aura.radius) continue;
    if (aura.speedMult) speed *= aura.speedMult;
    if (aura.dmgMult) dmg *= aura.dmgMult;
  }
  return { speed: Math.min(speed, AURA_MULT_CAP), dmg: Math.min(dmg, AURA_MULT_CAP) };
}

/* ---------- Boss 三阶段(策划案 V3 §3.2;数值见 ../data/enemies 规范表) ---------- */

export interface BossEvents {
  spawnChild(kind: EnemyKind, pos: Vec2): void;
  onPhaseChange(phase: 2 | 3): void;
  /** 震击引爆(伤害方自行判定命中与结算) */
  onSlam(pos: Vec2, radius: number, damage: number): void;
}

/**
 * 深渊领主三阶段(单调推进):
 * P1(100%-60%)追击+反射(现状,在伤害/移动层);
 * P2(60%-25%)召唤 + 地面震击(蓄力锁定玩家位置 → 引爆,走位可躲);
 * P3(<25%)狂暴:移速 ×BOSS_FRENZY_SPEED、召唤间隔减半(震击停止,贴身肉搏)。
 * 偶数关弱化变体:跳过 P2(60%-25% 仍是追击),无死亡分裂(见 splitBabies)。
 */
export function updateBoss(e: Enemy, dt: number, playerPos: Vec2, ev: BossEvents): void {
  if (e.kind !== "boss" || e.hp <= 0) return;
  const ratio = e.hp / e.maxHp;
  // 阶段推进(单发大伤害可跳过 P2 直达 P3,两次回调都会触发)
  if (e.bossPhase === 1 && e.bossVariant === "full" && ratio <= BOSS_PHASE2_HP) {
    e.bossPhase = 2;
    e.bossSummonTimer = BOSS_SUMMON.first;
    ev.onPhaseChange(2);
  }
  if ((e.bossPhase === 2 || (e.bossPhase === 1 && e.bossVariant === "weak")) && ratio <= BOSS_PHASE3_HP) {
    e.bossPhase = 3;
    e.bossSlamCharge = 0;
    e.bossSlamPos = null; // 狂暴打断进行中的蓄力
    e.speed *= BOSS_FRENZY_SPEED;
    // P2→P3:保留剩余计时(压到 ≤3s);P1→P3(弱化变体):给入场缓冲
    if (e.bossSummonTimer <= 0) e.bossSummonTimer = BOSS_SUMMON.first;
    else e.bossSummonTimer = Math.min(e.bossSummonTimer, BOSS_SUMMON.p3);
    ev.onPhaseChange(3);
  }
  // P2 蓄力中的震击(震点已在蓄力开始时锁定)
  if (e.bossPhase === 2 && e.bossSlamCharge > 0) {
    e.bossSlamCharge -= dt;
    if (e.bossSlamCharge <= 0) {
      if (e.bossSlamPos) ev.onSlam(e.bossSlamPos, BOSS_SLAM.radius, BOSS_SLAM.damage);
      e.bossSlamCharge = 0;
      e.bossSlamPos = null;
    }
  }
  // 召唤(P2 起;弱化变体仅 P3)
  const summoning = e.bossPhase === 3 || e.bossPhase === 2;
  if (summoning) {
    e.bossSummonTimer -= dt;
    if (e.bossSummonTimer <= 0) {
      e.bossSummonTimer += e.bossPhase === 3 ? BOSS_SUMMON.p3 : BOSS_SUMMON.p2;
      for (let i = 0; i < BOSS_SUMMON.count; i++) {
        ev.spawnChild("chaser", vec2(e.pos.x + (Math.random() - 0.5) * SUMMON_SPREAD, e.pos.y + (Math.random() - 0.5) * SUMMON_SPREAD));
      }
      // P2 每次召唤事件附带一次震击蓄力(锁定玩家当前位置)
      if (e.bossPhase === 2 && e.bossSlamCharge <= 0 && !e.bossSlamPos) {
        e.bossSlamCharge = BOSS_SLAM.charge;
        e.bossSlamPos = vec2(playerPos.x, playerPos.y);
      }
    }
  }
}

/** 敌人被击退(爆炸等) */
export function knockback(e: Enemy, from: Vec2, power: number): void {
  const dx = e.pos.x - from.x;
  const dy = e.pos.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const k = power / d;
  e.pos.x += dx * k;
  e.pos.y += dy * k;
}
