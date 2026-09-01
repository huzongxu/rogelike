/**
 * 赛季主题怪规范表(DESIGN-MONSTERS-SEASONS 批 1+2+3)—— 每赛季 30 种主题怪。
 *
 * 实现路线:**变体表(换皮)而非 ENEMY_DEFS 扩行**。
 * `Enemy.kind` 承担全部 AI 行为分支(反射/护盾/分裂/隐身/召唤/吞噬),而
 * `ENEMY_DEFS: Record<EnemyKind, EnemyDef>` 是双向穷尽的 —— 直接扩 EnemyKind
 * 会让新怪悄悄落进"无机制"分支,并动摇波次构成测试。故:
 *   行为仍由 kind 决定(零新 AI),外观与三维数值由本表变体决定。
 *
 * 铁律(数值墙不回头):**新怪只换皮不换曲线**。可证实现 =
 *   同(主题, 行为)组的 hp/speed/contactDmg 倍率**均值恒等于 1.0**、单项 |mult-1| ≤ 0.15,
 *   xp 与 radius 一律继承基线怪(金币经济与碰撞/贴图几何完全不动)。
 *   因此"某一组变体的期望威胁"与"该组基线怪"逐轴相等,组内只是强弱重分配。
 *   机制怪/精英/首领的变体倍率钉死 1.0(它们承载机制与 TTK 标定)。
 *   批 2 起机制怪可挂 `mech` 专属机制(见 SEASON_MONSTER_MECHS)——3 个引擎行为标签
 *   (接触减速 / 死亡灼烧池 / 死亡复活),均只加"受击/死亡"结算钩子、零新 AI,倍率照旧钉死 1.0 不抬曲线。
 *   批 4 起精英/首领变体可挂 `skill` 主动技能(见 SEASON_MONSTER_SKILLS)——24 只全部由
 *   11 个原语 + 参数表达,作纯附加层叠加在 kind 行为与首领三阶段之上(三阶段机与全局曲线不动)。
 *   批 4 技能不进 balance-sim(seasonId=0 铁律):模拟从不传 seasonId、也不调 updateSkill,
 *   Boss TTK 守卫天然免疫——后人不得为此放开模拟的 seasonId。
 *
 * 纪律同幻影榜/赛季套组:全部 seasonId → 纯函数,同赛季恒同配置。
 */

import type { EnemyDef, EnemyKind, EnemyMech, EnemySkill } from "../entities/enemy";
import { ENEMY_DEFS } from "./enemies";
import { seasonThemeIndex } from "./seasonSets";

/* ---------- 类型 ---------- */

/** 档位配额(策划案 4.1):基础×8 / 迅捷×5 / 重甲×5 / 特性×6 / 精英×4 / 首领×2 = 30 */
export type SeasonMonsterTier = "basic" | "swift" | "heavy" | "special" | "elite" | "boss";

/** 一行主题怪:行为复用哪个基线 kind + 三维换皮倍率 + 外观与图鉴文案 */
export interface SeasonMonsterRow {
  /** 唯一 id;贴图键 = `monster_<id>`(见 docs/ART-REQUIREMENTS.md §12) */
  id: string;
  /** 显示名(敌情文案/图鉴用) */
  name: string;
  /** 档位(配额统计口径) */
  tier: SeasonMonsterTier;
  /** 复用的 AI 行为 = Enemy.kind(机制分支按此判定,变体不新增机制) */
  behavior: EnemyKind;
  /** 所属主题下标(0-3,与 seasonTheme 4 循环同源;批 1 只实装 0 = S1「回响苏醒」) */
  theme: number;
  /** 回退圆形/贴图染色(缺图时的唯一视觉差异) */
  color: string;
  /** 生命倍率(0.85-1.15;组内均值 = 1.0) */
  hpMult: number;
  /** 移速倍率(0.85-1.15;组内均值 = 1.0) */
  speedMult: number;
  /** 接触伤害倍率(0.85-1.15;组内均值 = 1.0) */
  dmgMult: number;
  /** 图鉴一句话(风味,不参与数值) */
  lore: string;
  /** 专属机制(批 2;引用 SEASON_MONSTER_MECHS 键)。缺省 = 纯换皮,行为与基线怪一致 */
  mech?: SeasonMonsterMechType;
  /** 精英/首领专属技能(批 4;引用 SEASON_MONSTER_SKILLS 键,键 = 变体 id 1:1)。缺省 = 无技能(基础/迅捷等档一律缺省) */
  skill?: SeasonMonsterSkillKey;
}

/* ---------- 出场倾向(策划数值;规范表默认,暂不开放 balance.json 热调) ---------- */

/**
 * 主题怪替换基线外观的触发倾向。
 * 含义:一次刷怪已选定 behavior 后,把它换成当季主题变体的概率
 * 单位:概率 0-1
 * 取值依据:当季要"一眼看出换了赛季"(45% 足够高频又不彻底掩盖老怪);
 *          过季主题怪保留 15% 出场做存量感,低于当季以免冲淡新主题
 * 策划案出处:DESIGN-MONSTERS-SEASONS §4.2 出场加权 / §5 批 1
 */
export const SEASON_MONSTER_TENDENCY = {
  /** 当季主题(本主题有该行为的怪)替换概率 */
  inSeason: 0.45,
  /** 过季主题(仅别的主题有该行为的怪)替换概率 */
  offSeason: 0.15,
  /** 主题怪最早出现的章节:0-1 章是新手区(教学节奏 + 初始武器可随意通),不换皮以免干扰上手认知 */
  minChapter: 2,
} as const;

/* ---------- 专属机制(批 2+3:3 个引擎行为标签的参数化) ---------- */

/** 机制键 = SEASON_MONSTER_MECHS 行 id;变体行以 `mech` 引用,合成时折入 EnemyDef.mech */
export type SeasonMonsterMechType = "slowOnHit" | "deathPool" | "revive";

/** 接触减速(slowOnHit)参数 —— 凝滞之触 */
export interface SlowOnHitMech {
  type: "slowOnHit";
  /** 玩家移速乘数(0-1;受击后 240 → 240×factor) */
  factor: number;
  /** 减速持续(秒;多只叠加快照取最长) */
  duration: number;
}

/** 死亡灼烧池(deathPool)参数 —— 余烬孕体 */
export interface DeathPoolMech {
  type: "deathPool";
  /** 灼烧池半径(px;毒池基线 90,主题池更小 = 威胁集中在"多只叠加"而非单池覆盖面) */
  radius: number;
  /** 存续时长(秒;到期消散,不吃减益延长) */
  duration: number;
  /** 全场灼烧池上限(超出淘汰最早一只;防群体围尸把场地烧成不可站位) */
  cap: number;
}

/** 死亡复活(revive)参数 —— 还魂体 */
export interface ReviveMech {
  type: "revive";
  /** 复活后恢复的生命比例(0-1;基于该敌当前波次缩放后的 maxHp,每只限一次) */
  hpFrac: number;
}

/**
 * 主题怪机制参数表(策划数值;单位 px/秒/0-1 比例)。
 *
 * - slowOnHit factor 0.7:玩家基础移速 240 → 168,仍可走位但躲不开连续围杀;
 *   再低(≤0.6)等于硬控,违背"惩罚可读不处刑"(combat.ts 反射预算同源思路)。
 * - slowOnHit duration 1.5s:小于 CONTACT_HIT_CD(0.8s)的两倍 —— 单体贴脸最多
 *   叠两段减速快照,不会永续;凝滞之触走基线 72px/s,玩家脱身 2s 内可拉开。
 * - deathPool 复用毒池 DoT 口径(OBSTACLE.poolDps 6/秒 × poolTick 0.25,地形级惩罚)。
 * - deathPool radius 60:毒池基线 90 的 2/3,单池可绕,围杀靠数量。
 * - deathPool duration 4s:4s × 6dps = 24 点 ≈ 新手血墙 100 的四分之一, readable 惩罚。
 * - deathPool cap 6:场地同时最多 6 池(≈ 毒池章障碍密度的 3 倍封顶),防烧穿全场。
 * - revive hpFrac 0.5:还魂体首次致死以半血起身(总有效血量 1.5×,仅该特性怪独享,不动基础曲线);
 *   不给满血 = 它本就是分裂行为(最终死亡仍分裂幼体),满血+分裂会双重惩罚,半血是"二次起身"的可读惩罚。
 * 策划案出处:DESIGN-MONSTERS-SEASONS §2/§3/§4(机制定义)+ §5 批 2/批 3(tag 参数化)。
 */
export const SEASON_MONSTER_MECHS = {
  slowOnHit: { type: "slowOnHit", factor: 0.7, duration: 1.5 } as SlowOnHitMech,
  deathPool: { type: "deathPool", radius: 60, duration: 4, cap: 6 } as DeathPoolMech,
  revive: { type: "revive", hpFrac: 0.5 } as ReviveMech,
} as const satisfies Record<SeasonMonsterMechType, EnemyMech>;

/* ---------- 精英/首领专属技能(批 4:键 = 变体 id 1:1;11 原语 + 参数,无单只特例) ----------
 * 数值纪律同文件头铁律:技能是纯附加层,不抬基础曲线。
 * 伤害预算锚点 = BOSS_SLAM(80 伤/220px/1.2s 蓄力,enemies 规范表)+ 新手 maxHp 100:
 *   精英单事件 ≤ 0.7×;变体首领附加层 ≤ 0.85×;蓄力 ≥ 0.9s(可躲);触发间隔 ≥ 6s;
 *   池伤 duration×poolDps ≤ 25;隐身占比 ≤ 0.2;软控 factor > 0.6。
 * 测试按上述阈值断言,越线即红。
 */

/** 技能表键 = 携带技能的 24 个变体 id(四季 × 精英4/首领2;全集固定,新增须同步本联合) */
export type SeasonMonsterSkillKey =
  // S1「回响苏醒」
  | "tone_leader" | "abyss_herald" | "myriad_bone_marshal" | "first_echo" | "primeval_echo" | "empty_valley_lord"
  // S2「永冻深渊」
  | "farnorth_guard" | "permafrost_priest" | "icevein_broodmother" | "frostfang_wolf" | "abyss_icemarrow" | "polarabyss_jaw"
  // S3「熔火回响」
  | "moltencore_priest" | "firevein_broodmother" | "skyburn_colossus" | "wildfire_wolf" | "molten_heart_core" | "cult_flame"
  // S4「幽冥潮汐」
  | "troupe_ringmaster" | "darktide_priest" | "tide_gravewarden" | "hundred_ghost_commander" | "troupe_master" | "nether_tidelord";

/**
 * 主题怪技能参数表(策划数值;单位 px/秒/点)。
 * 按里程碑填表:批 4-M1 震击系 6 只 → M2 召唤家族 8 只 → M3 控制与区域 → M4 冲锋与光环;
 * 24 键全部落满由覆盖测试守门(键集合 === 表键,且仅精英/首领档携带)。
 */
export const SEASON_MONSTER_SKILLS: { readonly [K in SeasonMonsterSkillKey]?: EnemySkill } = {
  /* ---------- M1 震击系(6 只;其中 4 只带 M3 混合槽) ----------
   * 伤害预算:锚点 BOSS_SLAM.damage = 80(新手 maxHp 100)——精英单事件 ≤ 0.7×(≤56)、
   * 变体首领附加层 ≤ 0.85×(≤68);蓄力 ≥ 0.9s(可走位躲避)、间隔 ≥ 6s。
   * first = 入场缓冲;radius 精英 110 / 变体首领 140(基线 Boss 震击 220 的半分档)。
   * 混合槽(批 4-M3 增补):潮汐墓守 +隐身周期(计划稿 7/4.5 隐身占比 0.357 越「≤0.2」预算,
   *   收为 7/5.6 = 恰 0.2);初代回响 +周期召唤;极渊之颚 +吞噬投射;熔核之心 +行进火带。 */
  abyss_herald: { slam: { first: 3, interval: 8, charge: 1.0, radius: 110, damage: 50 } },
  farnorth_guard: { slam: { first: 3, interval: 8, charge: 1.0, radius: 110, damage: 55 } },
  tide_gravewarden: { slam: { first: 3, interval: 8, charge: 1.0, radius: 110, damage: 50 }, hideCycle: { cycle: 7, visible: 5.6 } },
  primeval_echo: { slam: { first: 3, interval: 8, charge: 1.1, radius: 140, damage: 60 }, summon: { first: 4, interval: 9, count: 2, kind: "chaser", childVariant: "echo_walker" } },
  polarabyss_jaw: { slam: { first: 3, interval: 8, charge: 1.1, radius: 140, damage: 65 }, devour: { healRate: 0.5 } },
  molten_heart_core: { slam: { first: 3, interval: 8, charge: 1.1, radius: 140, damage: 60 }, fireTrail: { first: 3, interval: 7, radius: 70, duration: 4, cap: 4 } },
  /* ---------- M2 召唤家族(8 只) ----------
   * 节奏预算:基线召唤师 2只/4s、Boss P2 2只/6s —— 技能是纯附加层只慢不快:
   *   精英 2只/9s、变体首领 2-4只/8s(触发间隔 ≥ 6s 铁律;first = 入场缓冲)。
   * childVariant 一律取同季基础/迅捷档(风味对题、组内均值 1.0 不抬曲线),
   *   子怪经 seasonVariantDef 记忆化解析折入变体数值;测试断言 childVariant.behavior === kind。
   * deathSplit 为覆盖式数量(取代基线 splitBabies);weak 阀门遵循基线(弱化首领不分裂)。
   * 幽冥潮主的 global 脉冲已在 M3 块接入预算断言。 */
  myriad_bone_marshal: { deathSummon: { count: 4, kind: "chaser", childVariant: "echo_walker" } },
  empty_valley_lord: { deathSplit: { count: 3 } },
  icevein_broodmother: { summon: { first: 4, interval: 9, count: 2, kind: "chaser", childVariant: "icevein_worm" } },
  firevein_broodmother: { summon: { first: 4, interval: 9, count: 2, kind: "chaser", childVariant: "firevein_corpse" } },
  troupe_ringmaster: { summon: { first: 4, interval: 9, count: 2, kind: "swift", childVariant: "tide_shadeimp" } },
  cult_flame: { summon: { first: 4, interval: 9, count: 2, kind: "chaser", childVariant: "firevein_corpse" }, deathSplit: { count: 2 } },
  troupe_master: { summon: { first: 4, interval: 8, count: 4, kind: "chaser", childVariant: "darktide_floatcorpse" } },
  nether_tidelord: {
    pulse: { first: 5, interval: 10, charge: 1.2, radius: 0, damage: 0, slow: { factor: 0.8, duration: 2 }, global: true },
    summon: { first: 4, interval: 8, count: 3, kind: "chaser", childVariant: "returntide_skeleton" },
    deathSplit: { count: 2 },
  },
  /* ---------- M3 控制与区域(5 只新挂载 + 4 只混合槽见 M1 块) ----------
   * 脉冲:区域型快照玩家位置(同震击管线)+ 引爆减速;伤害锚点同档(精英 ≤56 / 首领 ≤68),
   *   软控 factor > 0.6(惩罚可读不处刑,同凝滞之触 0.7 口径);global 雾型伤害恒 0、只上减速,
   *   隐身占比与雾节奏靠「间隔 ≥ 6s + 占比 ≤ 0.2」兜底。
   * 轰炸:单点伤害按档封顶(落点可躲,期望命中 < 1 点/轮);aroundPlayer 散布全宽 260 = 玩家
   *   两个身位内必有空档;field 均布战场(560×996),6 点 × 70px 覆盖 ≈ 全场 3%,躲位充足。
   * 隐身周期:深渊冰髓 10/8 = 占比恰 0.2(铁律上限),防 TTK 漂移。 */
  permafrost_priest: { pulse: { first: 5, interval: 9, charge: 1.0, radius: 130, damage: 22, slow: { factor: 0.65, duration: 2 } } },
  darktide_priest: { pulse: { first: 5, interval: 9, charge: 1.0, radius: 130, damage: 28, slow: { factor: 0.75, duration: 2 } } },
  abyss_icemarrow: {
    hideCycle: { cycle: 10, visible: 8 },
    pulse: { first: 5, interval: 10, charge: 1.2, radius: 0, damage: 0, slow: { factor: 0.85, duration: 2 }, global: true },
  },
  moltencore_priest: { barrage: { first: 5, interval: 9, count: 3, charge: 1.0, radius: 80, damage: 36, aim: "aroundPlayer", spread: 260 } },
  skyburn_colossus: { barrage: { first: 5, interval: 10, count: 6, charge: 1.2, radius: 70, damage: 32, aim: "field", spread: 0 } },
  /* ---------- M4 冲锋与光环(5 只新挂载) ----------
   * 冲锋:windup 1.0s 原地蓄力(skillDashing 期间 updateEnemy 让位),锁玩家快照方向直线冲刺 0.6s
   *   (精英速度 52 × 6 ≈ 312px/s,位移 ≈ 187px ≈ 战场宽 1/3,可侧移躲);单次撞击/每轮,
   *   伤害 30-34 ≤ 精英档 56 封顶;霜咬减速 factor 0.7 > 0.6(软控线),燎原点燃 3s × poolDps 6
   *   = 18 ≤ 25(池伤上限);冲刺位置在 updateSkill charge 分支内钳制战场 ± 半径。
   * 光环:每帧区域扫描派生乘数(auraMultAt),不改写目标字段;单轴 1.10/1.15,连乘封顶
   *   AURA_MULT_CAP 1.5(安全阀,现表单载体无双载体叠乘越线)。 */
  first_echo: { charge: { first: 5, interval: 9, windup: 1.0, duration: 0.6, speedMult: 6, damage: 34 } },
  frostfang_wolf: { charge: { first: 5, interval: 9, windup: 1.0, duration: 0.6, speedMult: 6, damage: 30, slow: { factor: 0.7, duration: 2 } } },
  wildfire_wolf: { charge: { first: 5, interval: 9, windup: 1.0, duration: 0.6, speedMult: 6, damage: 30, ignite: { radius: 55, duration: 3 } } },
  tone_leader: { aura: { radius: 130, speedMult: 1.1 } },
  hundred_ghost_commander: { aura: { radius: 130, dmgMult: 1.15 } },
};

/** 技能对象克隆:折入时逐槽浅拷贝(嵌套 slow/ignite 再深一层),保证各变体 def 持有独立实例 */
function cloneSkill(s: EnemySkill): EnemySkill {
  return {
    aura: s.aura ? { ...s.aura } : undefined,
    slam: s.slam ? { ...s.slam } : undefined,
    pulse: s.pulse ? { ...s.pulse, slow: s.pulse.slow ? { ...s.pulse.slow } : undefined } : undefined,
    barrage: s.barrage ? { ...s.barrage } : undefined,
    summon: s.summon ? { ...s.summon } : undefined,
    deathSummon: s.deathSummon ? { ...s.deathSummon } : undefined,
    deathSplit: s.deathSplit ? { ...s.deathSplit } : undefined,
    charge: s.charge
      ? { ...s.charge, slow: s.charge.slow ? { ...s.charge.slow } : undefined, ignite: s.charge.ignite ? { ...s.charge.ignite } : undefined }
      : undefined,
    hideCycle: s.hideCycle ? { ...s.hideCycle } : undefined,
    fireTrail: s.fireTrail ? { ...s.fireTrail } : undefined,
    devour: s.devour ? { ...s.devour } : undefined,
  };
}

/* ---------- S1「回响苏醒」30 种(批 1) ----------
 * 名单严格照 DESIGN-MONSTERS-SEASONS §4.1;lore 为该怪的风味注解。
 * 倍率按组配平(见文件头铁律),逐组手工核对:每轴求和 = 行数。 */

export const SEASON_MONSTERS: readonly SeasonMonsterRow[] = [
  /* 基础 ×8:行为 = chaser(腐尸,追兵直线 AI) */
  { id: "echo_walker", name: "回响行尸", tier: "basic", behavior: "chaser", theme: 0, color: "#8a6ea8", hpMult: 1.08, speedMult: 0.92, dmgMult: 0.95, lore: "被第一声回响唤醒,走得慢却更难倒下" },
  { id: "resonance_body", name: "共鸣尸", tier: "basic", behavior: "chaser", theme: 0, color: "#a06fb0", hpMult: 0.94, speedMult: 1.06, dmgMult: 1.05, lore: "与同伴同频,靠前而非靠厚" },
  { id: "hollow_hum", name: "空鸣骸", tier: "basic", behavior: "chaser", theme: 0, color: "#6f7bb0", hpMult: 1.12, speedMult: 0.96, dmgMult: 0.9, lore: "胸腔空鸣,骨架比腐肉更耐打" },
  { id: "whisper_rot", name: "低语腐尸", tier: "basic", behavior: "chaser", theme: 0, color: "#9d7ab8", hpMult: 0.9, speedMult: 1.1, dmgMult: 1.1, lore: "贴着耳朵低语,扑得最快也咬得最疼" },
  { id: "tremor_body", name: "震颤尸", tier: "basic", behavior: "chaser", theme: 0, color: "#7a6bc0", hpMult: 1.02, speedMult: 1.0, dmgMult: 1.0, lore: "标准的当季杂兵,三维居中" },
  { id: "echo_shell", name: "回响壳", tier: "basic", behavior: "chaser", theme: 0, color: "#b07ac0", hpMult: 1.13, speedMult: 0.9, dmgMult: 1.15, lore: "壳里封着一次未散的余响" },
  { id: "after_tone", name: "余音骸骨", tier: "basic", behavior: "chaser", theme: 0, color: "#6b86b0", hpMult: 0.96, speedMult: 1.04, dmgMult: 0.95, lore: "回响退去后剩下的骨头" },
  { id: "first_awake", name: "初醒尸群", tier: "basic", behavior: "chaser", theme: 0, color: "#9a6f9e", hpMult: 0.85, speedMult: 1.02, dmgMult: 0.9, lore: "最先苏醒的一批,脆而多" },

  /* 迅捷 ×5:行为 = swift(迅捷鬼,高速低血) */
  { id: "vibrant_cadaver", name: "颤音疾骸", tier: "swift", behavior: "swift", theme: 0, color: "#7fd6c0", hpMult: 1.1, speedMult: 0.92, dmgMult: 1.04, lore: "颤音压住脚步,慢了半拍却更结实" },
  { id: "afterimage_echo", name: "残响掠影", tier: "swift", behavior: "swift", theme: 0, color: "#6fc0d6", hpMult: 0.95, speedMult: 1.06, dmgMult: 0.92, lore: "掠过时留下的残影比本体更碍事" },
  { id: "harmonics_ghost", name: "谐振鬼", tier: "swift", behavior: "swift", theme: 0, color: "#8ad6a8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.1, lore: "与玩家武器同频谐振,咬人更疼" },
  { id: "rapid_hum", name: "速鸣骸", tier: "swift", behavior: "swift", theme: 0, color: "#6fb0d6", hpMult: 1.1, speedMult: 1.12, dmgMult: 0.96, lore: "当季最快的一档,又吵又硬" },
  { id: "echo_lurker", name: "回声追猎者", tier: "swift", behavior: "swift", theme: 0, color: "#a0d68a", hpMult: 0.85, speedMult: 0.9, dmgMult: 0.98, lore: "靠回声定位,慢但极脆" },

  /* 重甲 ×5:行为 = tank(石巨,慢速肉墙) */
  { id: "resonant_carapace", name: "共鸣甲壳", tier: "heavy", behavior: "tank", theme: 0, color: "#8f7d9f", hpMult: 1.08, speedMult: 0.94, dmgMult: 1.0, lore: "甲壳把撞击声共鸣成护甲" },
  { id: "reverb_rockmail", name: "混响岩铠", tier: "heavy", behavior: "tank", theme: 0, color: "#7d6b8f", hpMult: 0.96, speedMult: 1.06, dmgMult: 1.1, lore: "岩缝里的混响让它比同类灵活" },
  { id: "huming_shieldwalker", name: "鸣盾行尸", tier: "heavy", behavior: "tank", theme: 0, color: "#6b5f8f", hpMult: 1.14, speedMult: 0.88, dmgMult: 0.92, lore: "盾面嗡鸣,推进最慢的一档" },
  { id: "echo_giantshell", name: "回音巨壳", tier: "heavy", behavior: "tank", theme: 0, color: "#9f8faf", hpMult: 0.9, speedMult: 1.1, dmgMult: 1.04, lore: "壳薄但滚得快,靠动量压人" },
  { id: "standing_wave_hulk", name: "驻波重尸", tier: "heavy", behavior: "tank", theme: 0, color: "#7a7099", hpMult: 0.92, speedMult: 1.02, dmgMult: 0.94, lore: "体内驻波未消,一碰就响" },

  /* 特性 ×6:行为 = 六种机制怪(批 1 纯换皮;批 2 起机制怪可挂 mech) */
  { id: "splitting_tone", name: "裂鸣体", tier: "special", behavior: "splitter", theme: 0, color: "#a8c25a", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "裂开时发出鸣响,幼体随之苏醒" },
  { id: "mute_hider", name: "消音隐者", tier: "special", behavior: "hider", theme: 0, color: "#9a8aff", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "把回响吞进静音里,你也看不见它" },
  { id: "wound_reflector", name: "鸣伤反射者", tier: "special", behavior: "reflector", theme: 0, color: "#5ab8e8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "受伤即鸣,鸣即反弹" },
  { id: "sound_devourer", name: "吸声者", tier: "special", behavior: "devourer", theme: 0, color: "#33b8a8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "吞掉投射物的声音,也吞掉它的伤" },
  { id: "hum_wallguard", name: "驻鸣护壁", tier: "special", behavior: "shieldguard", theme: 0, color: "#8296a8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "嗡鸣凝成壁,正面滴水不进" },
  { id: "echo_seed", name: "回响之种", tier: "special", behavior: "summoner", theme: 0, color: "#f0906f", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "播下回响,长出一整片尸群" },

  /* 精英 ×4:行为 = elite */
  { id: "tone_leader", name: "领鸣者", tier: "elite", behavior: "elite", theme: 0, color: "#d05a6a", hpMult: 1.1, speedMult: 0.9, dmgMult: 1.06, lore: "第一个开口的精英,尸群听它号令", skill: "tone_leader" },
  { id: "abyss_herald", name: "深渊传声者", tier: "elite", behavior: "elite", theme: 0, color: "#c04a7a", hpMult: 0.92, speedMult: 1.08, dmgMult: 0.94, lore: "把深渊的话传下来,跑得比谁都快", skill: "abyss_herald" },
  { id: "myriad_bone_marshal", name: "万骸指挥", tier: "elite", behavior: "elite", theme: 0, color: "#e0605a", hpMult: 1.04, speedMult: 0.96, dmgMult: 1.12, lore: "万具骸骨列成阵列,指挥棒最沉", skill: "myriad_bone_marshal" },
  { id: "first_echo", name: "第一回音", tier: "elite", behavior: "elite", theme: 0, color: "#b84a5a", hpMult: 0.94, speedMult: 1.06, dmgMult: 0.88, lore: "最初那道回音的残躯,轻但难缠", skill: "first_echo" },

  /* 首领 ×2:行为 = boss(倍率钉死 1.0,TTK 标定锚点不可动) */
  { id: "primeval_echo", name: "初代回响", tier: "boss", behavior: "boss", theme: 0, color: "#ff4a6a", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "深渊第一声回响的本体", skill: "primeval_echo" },
  { id: "empty_valley_lord", name: "空谷之主", tier: "boss", behavior: "boss", theme: 0, color: "#e03a4a", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "空谷里所有回声的主人", skill: "empty_valley_lord" },

  /* ---------- S2「永冻深渊」30 种(批 2;主题下标 1) ----------
   * 名单严格照 DESIGN-MONSTERS-SEASONS §2;色系 = 冰蓝冷调(主题色 #5ac8fa)。
   * 倍率逐组手工核对:每轴求和 = 行数(chaser 组 9 行含凝滞之触 1.0)。 */

  /* 基础 ×8:行为 = chaser(腐尸) */
  { id: "frozen_cadaver", name: "冻殍", tier: "basic", behavior: "chaser", theme: 1, color: "#5ac8fa", hpMult: 1.1, speedMult: 0.9, dmgMult: 0.95, lore: "冻透的尸身又硬又慢,呵气成霜" },
  { id: "frostshell_corpse", name: "霜壳尸", tier: "basic", behavior: "chaser", theme: 1, color: "#7adfff", hpMult: 0.96, speedMult: 1.05, dmgMult: 1.08, lore: "壳上结霜,一碰就簌簌掉冰碴" },
  { id: "icevein_worm", name: "冰脉蠕体", tier: "basic", behavior: "chaser", theme: 1, color: "#4fb8e0", hpMult: 1.04, speedMult: 0.98, dmgMult: 1.02, lore: "体内冰脉蠕动,不快不慢的标准冻奴" },
  { id: "chillcrystal_bone", name: "寒晶骨", tier: "basic", behavior: "chaser", theme: 1, color: "#9be8ff", hpMult: 0.88, speedMult: 1.12, dmgMult: 0.9, lore: "晶化后轻得像冰花,飘得比谁都快" },
  { id: "rime_walker", name: "凝霜行尸", tier: "basic", behavior: "chaser", theme: 1, color: "#69c2e8", hpMult: 1.15, speedMult: 0.86, dmgMult: 1.1, lore: "每一步都在身后留下一道白霜" },
  { id: "icechunk_puppet", name: "冰碴傀儡", tier: "basic", behavior: "chaser", theme: 1, color: "#82d6f0", hpMult: 0.92, speedMult: 1.1, dmgMult: 1.05, lore: "碎冰拼成的躯壳,散得快也扑得快" },
  { id: "permafrost_husk", name: "永冻躯壳", tier: "basic", behavior: "chaser", theme: 1, color: "#3f9ec8", hpMult: 1.02, speedMult: 1.0, dmgMult: 0.92, lore: "冻了千年的空壳,冻土本身替它挨伤" },
  { id: "frost_pattern_corpse", name: "霜纹尸", tier: "basic", behavior: "chaser", theme: 1, color: "#a8e4ff", hpMult: 0.93, speedMult: 0.99, dmgMult: 0.98, lore: "体表霜纹是它唯一的体温" },

  /* 迅捷 ×5:行为 = swift(迅捷鬼) */
  { id: "ice_skater", name: "冰面掠者", tier: "swift", behavior: "swift", theme: 1, color: "#6fe0d6", hpMult: 1.06, speedMult: 0.9, dmgMult: 1.02, lore: "贴着冰面滑行,慢半拍但撞上来更疼" },
  { id: "frostblade_ghost", name: "霜刃鬼", tier: "swift", behavior: "swift", theme: 1, color: "#5ad0e8", hpMult: 0.94, speedMult: 1.08, dmgMult: 1.1, lore: "霜结成刃,出手比脚步声快" },
  { id: "coldwind_dash", name: "寒风疾影", tier: "swift", behavior: "swift", theme: 1, color: "#8fe8f8", hpMult: 1.1, speedMult: 0.96, dmgMult: 0.94, lore: "寒风裹着的一团影子,吹不散却挡得住" },
  { id: "icebreak_sprint", name: "裂冰疾行", tier: "swift", behavior: "swift", theme: 1, color: "#4fc4dc", hpMult: 0.88, speedMult: 1.12, dmgMult: 0.96, lore: "踩碎冰面前进,当季最快也最脆" },
  { id: "winter_hound", name: "凛冬猎犬", tier: "swift", behavior: "swift", theme: 1, color: "#7ad8c8", hpMult: 1.02, speedMult: 0.94, dmgMult: 0.98, lore: "凛冬放出来的猎犬,咬住就不松口" },

  /* 重甲 ×5:行为 = tank(石巨) */
  { id: "blackice_colossus", name: "玄冰巨像", tier: "heavy", behavior: "tank", theme: 1, color: "#3a7fa8", hpMult: 1.1, speedMult: 0.92, dmgMult: 1.0, lore: "千年玄冰雕成的巨物,一步一震" },
  { id: "millennium_frostplate", name: "千年冻甲", tier: "heavy", behavior: "tank", theme: 1, color: "#5590b8", hpMult: 0.94, speedMult: 1.04, dmgMult: 0.96, lore: "甲是冻的,穿甲的人是千年前冻僵的" },
  { id: "icecrystal_bulwark", name: "冰晶壁垒", tier: "heavy", behavior: "tank", theme: 1, color: "#6ba8cc", hpMult: 0.88, speedMult: 1.1, dmgMult: 1.12, lore: "壁垒也会滚,冰晶推着冰晶碾过来" },
  { id: "frostmail_wormking", name: "霜铠蠕王", tier: "heavy", behavior: "tank", theme: 1, color: "#4a86a8", hpMult: 1.06, speedMult: 0.98, dmgMult: 1.04, lore: "蠕群之王,霜铠下层层叠叠" },
  { id: "polar_shell", name: "极寒壳", tier: "heavy", behavior: "tank", theme: 1, color: "#7fb4d0", hpMult: 1.02, speedMult: 0.96, dmgMult: 0.88, lore: "壳极寒,碰一下比挨一刀还慢半拍" },

  /* 特性 ×6:行为 = 六种机制怪;凝滞之触 = 批 2 新机制 slowOnHit */
  { id: "stagnation_touch", name: "凝滞之触", tier: "special", behavior: "chaser", theme: 1, color: "#48d0e8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "被它碰到,血都会冻得变慢", mech: "slowOnHit" },
  { id: "icefog_hider", name: "冰雾隐者", tier: "special", behavior: "hider", theme: 1, color: "#a8dcf0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "隐进冰雾,你只会觉得越来越冷" },
  { id: "icebreak_reflector", name: "碎冰反射", tier: "special", behavior: "reflector", theme: 1, color: "#60e0e8", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "打碎它的冰甲,碎片原路奉还" },
  { id: "meltwater_spawn", name: "融冰孳生", tier: "special", behavior: "splitter", theme: 1, color: "#78c8dc", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "融化即分裂,一滩冰水成一群水尸" },
  { id: "coldabyss_devourer", name: "寒渊吞噬者", tier: "special", behavior: "devourer", theme: 1, color: "#38708f", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "寒渊张口,吞掉飞来的弹幕" },
  { id: "icevein_guardian", name: "冰脉护卫", tier: "special", behavior: "shieldguard", theme: 1, color: "#8cc8e0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "冰脉撑起盾,正面冻成一面墙" },

  /* 精英 ×4:行为 = elite(震击/脉冲/召唤/冲锋技能 = 批 4 挂载,见 SEASON_MONSTER_SKILLS) */
  { id: "farnorth_guard", name: "极北守卫", tier: "elite", behavior: "elite", theme: 1, color: "#3f8fbf", hpMult: 1.08, speedMult: 0.9, dmgMult: 1.1, lore: "极北的门卫,精英里的寒铁", skill: "farnorth_guard" },
  { id: "permafrost_priest", name: "永冻祭司", tier: "elite", behavior: "elite", theme: 1, color: "#5a9fd0", hpMult: 0.94, speedMult: 1.1, dmgMult: 0.94, lore: "主持冻结仪式,仪式完了它还在跑", skill: "permafrost_priest" },
  { id: "icevein_broodmother", name: "冰脉母巢", tier: "elite", behavior: "elite", theme: 1, color: "#6fb0d8", hpMult: 1.02, speedMult: 1.04, dmgMult: 0.98, lore: "母巢一胀,冰脉里全是冰虫", skill: "icevein_broodmother" },
  { id: "frostfang_wolf", name: "霜咬巨狼", tier: "elite", behavior: "elite", theme: 1, color: "#88c0e0", hpMult: 0.96, speedMult: 0.96, dmgMult: 0.98, lore: "霜牙一口,连血都冻住", skill: "frostfang_wolf" },

  /* 首领 ×2:行为 = boss(倍率钉死 1.0;隐身雾/吞噬震击技能 = 批 4 附加层,三阶段机不动) */
  { id: "abyss_icemarrow", name: "深渊冰髓", tier: "boss", behavior: "boss", theme: 1, color: "#2e6f9e", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "深渊冻到最硬的那一截骨髓", skill: "abyss_icemarrow" },
  { id: "polarabyss_jaw", name: "极渊之颚", tier: "boss", behavior: "boss", theme: 1, color: "#1f5f8f", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "极渊张开的下颌,咬住不放", skill: "polarabyss_jaw" },

  /* ---------- S3「熔火回响」30 种(批 2;主题下标 2) ----------
   * 名单严格照 DESIGN-MONSTERS-SEASONS §3;色系 = 熔火暖调(主题色 #ff9d2e)。
   * 爆裂孕体的死亡爆炸语义由批 3 机制表承接(分裂行为已是最近机制)。 */

  /* 基础 ×8:行为 = chaser(腐尸) */
  { id: "slag_walker", name: "熔渣行尸", tier: "basic", behavior: "chaser", theme: 2, color: "#ff9d2e", hpMult: 1.12, speedMult: 0.92, dmgMult: 1.04, lore: "踩着熔渣往前走,掉渣也掉血条" },
  { id: "flame_shell_corpse", name: "焰壳尸", tier: "basic", behavior: "chaser", theme: 2, color: "#e8703a", hpMult: 0.9, speedMult: 1.08, dmgMult: 0.96, lore: "壳是烧红的,碰一下烫手" },
  { id: "ash_worm", name: "灰烬蠕体", tier: "basic", behavior: "chaser", theme: 2, color: "#b8622e", hpMult: 1.05, speedMult: 1.0, dmgMult: 0.9, lore: "一烧就散,散了又蠕回来" },
  { id: "charred_bone", name: "焦骨", tier: "basic", behavior: "chaser", theme: 2, color: "#8f4a26", hpMult: 1.08, speedMult: 0.88, dmgMult: 1.12, lore: "烧焦的骨头最脆也最烫" },
  { id: "smoldering_puppet", name: "燃烬傀儡", tier: "basic", behavior: "chaser", theme: 2, color: "#d05a2a", hpMult: 0.94, speedMult: 1.12, dmgMult: 1.02, lore: "引线未熄,提线的手早已烧成灰" },
  { id: "firevein_corpse", name: "火脉尸", tier: "basic", behavior: "chaser", theme: 2, color: "#ff8a50", hpMult: 1.0, speedMult: 1.05, dmgMult: 0.88, lore: "血管里流的是火脉" },
  { id: "moltencore_remain", name: "熔核残躯", tier: "basic", behavior: "chaser", theme: 2, color: "#c8341f", hpMult: 0.85, speedMult: 0.96, dmgMult: 1.15, lore: "只剩半截残躯,烧得最疼" },
  { id: "cinder_crawler", name: "烬灰爬行者", tier: "basic", behavior: "chaser", theme: 2, color: "#e8a05a", hpMult: 1.06, speedMult: 0.99, dmgMult: 0.93, lore: "贴着灰爬行,灰就是它的火种" },

  /* 迅捷 ×5:行为 = swift(迅捷鬼) */
  { id: "fireline_raider", name: "火线掠者", tier: "swift", behavior: "swift", theme: 2, color: "#ff6a3a", hpMult: 1.08, speedMult: 1.05, dmgMult: 0.9, lore: "沿火线突袭,扑完就退" },
  { id: "blaze_djinn", name: "烈焰疾鬼", tier: "swift", behavior: "swift", theme: 2, color: "#ffb347", hpMult: 0.92, speedMult: 1.1, dmgMult: 1.04, lore: "火苗窜成的鬼,看见残影就看见它" },
  { id: "flashburn_sprint", name: "爆燃疾行", tier: "swift", behavior: "swift", theme: 2, color: "#ff5533", hpMult: 1.0, speedMult: 0.93, dmgMult: 1.12, lore: "每一步点小一片爆燃" },
  { id: "firetongue_hunt", name: "火舌追猎", tier: "swift", behavior: "swift", theme: 2, color: "#e8641f", hpMult: 1.14, speedMult: 0.9, dmgMult: 1.02, lore: "火舌舔过的方向,就是它追的方向" },
  { id: "scorchwind_shade", name: "焚风影", tier: "swift", behavior: "swift", theme: 2, color: "#d0402a", hpMult: 0.86, speedMult: 1.02, dmgMult: 0.92, lore: "焚风卷走影子,也卷走你的血皮" },

  /* 重甲 ×5:行为 = tank(石巨) */
  { id: "lava_colossus", name: "熔岩巨像", tier: "heavy", behavior: "tank", theme: 2, color: "#a8322a", hpMult: 0.9, speedMult: 0.94, dmgMult: 1.05, lore: "熔岩浇的巨像,裂缝里全是火" },
  { id: "obsidian_carapace", name: "黑曜甲壳", tier: "heavy", behavior: "tank", theme: 2, color: "#4a3a4f", hpMult: 1.12, speedMult: 1.1, dmgMult: 0.9, lore: "黑曜轻而硬,滚动时火星四溅" },
  { id: "igneous_mail", name: "火成岩铠", tier: "heavy", behavior: "tank", theme: 2, color: "#6f4a3a", hpMult: 0.94, speedMult: 0.96, dmgMult: 0.98, lore: "岩浆冷成岩,岩里还封着火" },
  { id: "moltencore_bulwark", name: "熔核壁垒", tier: "heavy", behavior: "tank", theme: 2, color: "#8f2f1f", hpMult: 0.96, speedMult: 1.06, dmgMult: 1.1, lore: "壁垒推进,地面跟着熔穿" },
  { id: "scorched_heavyshell", name: "焦土重壳", tier: "heavy", behavior: "tank", theme: 2, color: "#b0562e", hpMult: 1.08, speedMult: 0.94, dmgMult: 0.97, lore: "壳过之处,寸草成焦" },

  /* 特性 ×6:行为 = 六种机制怪;余烬孕体 = 批 2 新机制 deathPool */
  { id: "ember_broodmother", name: "余烬孕体", tier: "special", behavior: "chaser", theme: 2, color: "#ff7a2e", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "死后剖开孕体,淌出一地余烬", mech: "deathPool" },
  { id: "smokescreen_hider", name: "烟幕隐者", tier: "special", behavior: "hider", theme: 2, color: "#9a8a80", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "躲进烟幕,只余两点火光" },
  { id: "flameplate_reflector", name: "焰甲反射", tier: "special", behavior: "reflector", theme: 2, color: "#ff5a2a", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "焰甲反烧,打它等于打自己" },
  { id: "rupture_broodmother", name: "爆裂孕体", tier: "special", behavior: "splitter", theme: 2, color: "#e04a20", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "围杀时别贴得太近,它随时会炸" },
  { id: "smeltmouth_devourer", name: "熔口吞噬者", tier: "special", behavior: "devourer", theme: 2, color: "#b8860b", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "熔炉张口,把弹幕熔成铁水" },
  { id: "fireshield_guardian", name: "火盾护卫", tier: "special", behavior: "shieldguard", theme: 2, color: "#ff4000", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "火盾一立,正面就是火墙" },

  /* 精英 ×4:行为 = elite(轰炸/召唤/冲锋点燃技能 = 批 4 挂载,见 SEASON_MONSTER_SKILLS) */
  { id: "moltencore_priest", name: "熔核祭司", tier: "elite", behavior: "elite", theme: 2, color: "#c8481f", hpMult: 0.94, speedMult: 1.06, dmgMult: 0.96, lore: "祭司诵毕,天上就该掉陨星了", skill: "moltencore_priest" },
  { id: "firevein_broodmother", name: "火脉母巢", tier: "elite", behavior: "elite", theme: 2, color: "#e06a2e", hpMult: 1.1, speedMult: 0.92, dmgMult: 1.02, lore: "母巢一裂,火虫倾巢而出", skill: "firevein_broodmother" },
  { id: "skyburn_colossus", name: "焚天巨像", tier: "elite", behavior: "elite", theme: 2, color: "#ff6030", hpMult: 1.06, speedMult: 0.96, dmgMult: 1.1, lore: "它举手,整片天空开始烧", skill: "skyburn_colossus" },
  { id: "wildfire_wolf", name: "燎原狼王", tier: "elite", behavior: "elite", theme: 2, color: "#d84a1f", hpMult: 0.9, speedMult: 1.06, dmgMult: 0.92, lore: "狼王冲锋之处,星火成燎原", skill: "wildfire_wolf" },

  /* 首领 ×2:行为 = boss(倍率钉死 1.0;火带/召唤分裂技能 = 批 4 附加层,三阶段机不动) */
  { id: "molten_heart_core", name: "熔核之心本体", tier: "boss", behavior: "boss", theme: 2, color: "#ff3300", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "整座火山跳动的那颗心脏", skill: "molten_heart_core" },
  { id: "cult_flame", name: "教团之焰", tier: "boss", behavior: "boss", theme: 2, color: "#e83a10", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "教团供奉的火,烧的是入侵者", skill: "cult_flame" },

  /* ---------- S4「幽冥潮汐」30 种(批 3;主题下标 3) ----------
   * 名单严格照 DESIGN-MONSTERS-SEASONS §4;色系 = 幽冥紫冷调(主题色 #9b6cff)。
   * 还魂体的死亡复活 = 批 3 新机制 revive(分裂行为 + 首次致死回半血)。
   * 精英/首领的召唤/脉冲/震击/光环等技能 = 批 4 挂载(见 §5 与 SEASON_MONSTER_SKILLS)。 */

  /* 基础 ×8:行为 = chaser(腐尸) */
  { id: "darktide_floatcorpse", name: "冥潮浮尸", tier: "basic", behavior: "chaser", theme: 3, color: "#9b6cff", hpMult: 1.1, speedMult: 0.9, dmgMult: 0.95, lore: "随幽冥潮汐浮起,身上还挂着上一季的海藻" },
  { id: "shade_shellhusk", name: "幽影壳", tier: "basic", behavior: "chaser", theme: 3, color: "#b08aff", hpMult: 0.92, speedMult: 1.06, dmgMult: 1.08, lore: "壳里没肉,只有一团不肯散的幽影" },
  { id: "deathspeak_bones", name: "亡语骸", tier: "basic", behavior: "chaser", theme: 3, color: "#8a7fd6", hpMult: 1.05, speedMult: 0.98, dmgMult: 1.02, lore: "骨头缝里塞满了没说完的遗言" },
  { id: "tidewail_rotter", name: "潮鸣腐尸", tier: "basic", behavior: "chaser", theme: 3, color: "#a06fe0", hpMult: 0.88, speedMult: 1.12, dmgMult: 0.9, lore: "潮声一响,它就跟着涨起来" },
  { id: "soulbound_husk", name: "缚魂躯", tier: "basic", behavior: "chaser", theme: 3, color: "#7f5ce0", hpMult: 1.15, speedMult: 0.86, dmgMult: 1.1, lore: "魂被缚在躯壳里,挣不脱也停不下" },
  { id: "nether_crawler", name: "幽冥爬行者", tier: "basic", behavior: "chaser", theme: 3, color: "#6f5ab8", hpMult: 0.94, speedMult: 1.1, dmgMult: 0.96, lore: "贴着冥潮爬,爬过的地方留下一道湿痕" },
  { id: "tideling_wisp", name: "汐灵", tier: "basic", behavior: "chaser", theme: 3, color: "#c0a0ff", hpMult: 1.02, speedMult: 1.0, dmgMult: 0.92, lore: "潮汐退去时落下的那一点灵" },
  { id: "returntide_skeleton", name: "归潮骸", tier: "basic", behavior: "chaser", theme: 3, color: "#8f6fd0", hpMult: 0.94, speedMult: 0.98, dmgMult: 1.07, lore: "退潮时归去,涨潮时归来,从不少一只" },

  /* 迅捷 ×5:行为 = swift(迅捷鬼) */
  { id: "tide_shadeimp", name: "潮影疾鬼", tier: "swift", behavior: "swift", theme: 3, color: "#9f8aff", hpMult: 1.06, speedMult: 0.92, dmgMult: 1.02, lore: "踩着潮影突袭,退潮前必咬上一口" },
  { id: "nether_glideshade", name: "幽冥掠影", tier: "swift", behavior: "swift", theme: 3, color: "#7fb8e8", hpMult: 0.94, speedMult: 1.1, dmgMult: 0.96, lore: "掠过去的不是它,是它的影子" },
  { id: "wraith_stalker", name: "亡魂追猎", tier: "swift", behavior: "swift", theme: 3, color: "#b89aff", hpMult: 1.0, speedMult: 1.04, dmgMult: 1.08, lore: "被它盯上的,潮水也救不了" },
  { id: "tideflash_wraith", name: "汐闪影", tier: "swift", behavior: "swift", theme: 3, color: "#6fa8d6", hpMult: 0.9, speedMult: 1.06, dmgMult: 0.98, lore: "汐光一闪,它已到你身后" },
  { id: "darktide_sprinter", name: "冥潮疾行者", tier: "swift", behavior: "swift", theme: 3, color: "#a87fe0", hpMult: 1.1, speedMult: 0.88, dmgMult: 0.96, lore: "冥潮里跑得最快的信使" },

  /* 重甲 ×5:行为 = tank(石巨) */
  { id: "nether_colossus", name: "幽冥巨像", tier: "heavy", behavior: "tank", theme: 3, color: "#5a4a9f", hpMult: 1.1, speedMult: 0.92, dmgMult: 1.0, lore: "潮底捞起的巨像,眼里还燃着磷火" },
  { id: "deadplate_armor", name: "亡者重铠", tier: "heavy", behavior: "tank", theme: 3, color: "#6b5fb0", hpMult: 0.94, speedMult: 1.04, dmgMult: 0.96, lore: "铠是亡者铸的,穿铠的也是亡者" },
  { id: "tide_bulwark", name: "潮汐壁垒", tier: "heavy", behavior: "tank", theme: 3, color: "#7a6fc8", hpMult: 0.88, speedMult: 1.1, dmgMult: 1.12, lore: "壁垒随潮起落,推不倒也绕不开" },
  { id: "soulbound_carapace", name: "缚魂甲壳", tier: "heavy", behavior: "tank", theme: 3, color: "#4f4590", hpMult: 1.06, speedMult: 0.98, dmgMult: 1.04, lore: "甲壳里缚着一整支沉船的水手" },
  { id: "darkabyss_heavyshell", name: "冥渊重壳", tier: "heavy", behavior: "tank", theme: 3, color: "#8374cc", hpMult: 1.02, speedMult: 0.96, dmgMult: 0.88, lore: "冥渊最深处的那枚壳,压得住潮" },

  /* 特性 ×6:行为 = 六种机制怪;还魂体 = 批 3 新机制 revive(分裂行为 + 首次致死回半血) */
  { id: "returning_soul", name: "还魂体", tier: "special", behavior: "splitter", theme: 3, color: "#c8a0ff", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "第一次倒下只是歇脚,魂回来了就还得再打一场", mech: "revive" },
  { id: "misttide_hider", name: "雾潮隐者", tier: "special", behavior: "hider", theme: 3, color: "#a890e0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "隐进雾潮,只留下一片湿冷" },
  { id: "grudgeplate_reflector", name: "怨甲反射", tier: "special", behavior: "reflector", theme: 3, color: "#9b6cff", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "怨念凝甲,打它即是打自己" },
  { id: "soul_devourer", name: "噬魂者", tier: "special", behavior: "devourer", theme: 3, color: "#7050b0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "张口噬魂,飞来的弹幕也被吞进腹中" },
  { id: "deathspeak_tombguard", name: "亡语护冢", tier: "special", behavior: "shieldguard", theme: 3, color: "#8070c0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "亡语护住坟冢,也护住冢边的亡影" },
  { id: "tide_broodmother", name: "引潮孕母", tier: "special", behavior: "summoner", theme: 3, color: "#b070e0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "孕母一沉,冥虫随潮涌出" },

  /* 精英 ×4:行为 = elite(召唤/脉冲/震击/光环技能 = 批 4 挂载,见 SEASON_MONSTER_SKILLS) */
  { id: "troupe_ringmaster", name: "剧团班主", tier: "elite", behavior: "elite", theme: 3, color: "#c05ae0", hpMult: 1.08, speedMult: 0.92, dmgMult: 1.06, lore: "亡影剧团的班主,哨一响,群鬼就位", skill: "troupe_ringmaster" },
  { id: "darktide_priest", name: "冥潮祭司", tier: "elite", behavior: "elite", theme: 3, color: "#a04ad0", hpMult: 0.94, speedMult: 1.08, dmgMult: 0.96, lore: "主持引魂仪式,潮水里全是它的回音", skill: "darktide_priest" },
  { id: "tide_gravewarden", name: "潮汐墓守", tier: "elite", behavior: "elite", theme: 3, color: "#d060b0", hpMult: 1.04, speedMult: 0.96, dmgMult: 1.1, lore: "守着潮汐墓园,震退一切闯入者", skill: "tide_gravewarden" },
  { id: "hundred_ghost_commander", name: "百鬼统领", tier: "elite", behavior: "elite", theme: 3, color: "#b04aa0", hpMult: 0.94, speedMult: 1.04, dmgMult: 0.88, lore: "百鬼听令,它的旗一抬,潮水都涨三分", skill: "hundred_ghost_commander" },

  /* 首领 ×2:行为 = boss(倍率钉死 1.0;召唤协战/潮雾分裂技能 = 批 4 附加层,三阶段机不动) */
  { id: "troupe_master", name: "剧团之主", tier: "boss", behavior: "boss", theme: 3, color: "#e040d0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "亡影剧团的真正主人,帷幕后操着所有提线", skill: "troupe_master" },
  { id: "nether_tidelord", name: "幽冥潮主", tier: "boss", behavior: "boss", theme: 3, color: "#c030e0", hpMult: 1.0, speedMult: 1.0, dmgMult: 1.0, lore: "整片幽冥潮汐都听它涨落", skill: "nether_tidelord" },
];

/* ---------- 派生索引(单一事实源 = SEASON_MONSTERS) ---------- */

let byBehavior: Map<EnemyKind, SeasonMonsterRow[]> | null = null;

/** 按行为取全部已实装变体(跨主题;派生自 SEASON_MONSTERS) */
export function seasonMonsterRowsOfBehavior(behavior: EnemyKind): readonly SeasonMonsterRow[] {
  if (!byBehavior) {
    byBehavior = new Map();
    for (const row of SEASON_MONSTERS) {
      const list = byBehavior.get(row.behavior);
      if (list) list.push(row);
      else byBehavior.set(row.behavior, [row]);
    }
  }
  return byBehavior.get(behavior) ?? [];
}

/** 按 id 取变体行(图鉴/存档回填用;未实装 id = null) */
export function seasonMonster(id: string): SeasonMonsterRow | null {
  return SEASON_MONSTERS.find((r) => r.id === id) ?? null;
}

/** 某赛季的主题下标(seasonTheme 的 4 循环同源) */
export function seasonMonsterThemeIndex(seasonId: number): number {
  return seasonThemeIndex(seasonId);
}

/** 该行为在当前主题下的候选池:当季主题有 → 只用当季;没有 → 回退其它已实装主题(过季存量) */
function poolFor(behavior: EnemyKind, seasonId: number): readonly SeasonMonsterRow[] {
  const rows = seasonMonsterRowsOfBehavior(behavior);
  if (rows.length === 0) return [];
  const theme = seasonMonsterThemeIndex(seasonId);
  const current = rows.filter((r) => r.theme === theme);
  return current.length > 0 ? current : rows.filter((r) => r.theme !== theme);
}

/** 该行为当前是当季(高倾向)还是过季(低倾向)出场 */
function tendencyOf(behavior: EnemyKind, seasonId: number): number {
  const theme = seasonMonsterThemeIndex(seasonId);
  return seasonMonsterRowsOfBehavior(behavior).some((r) => r.theme === theme)
    ? SEASON_MONSTER_TENDENCY.inSeason
    : SEASON_MONSTER_TENDENCY.offSeason;
}

/**
 * 掷一次主题怪替换。
 * @param behavior 波次已选定的 AI 行为(决定候选池,不改变 kind 分布)
 * @param seasonId 当前赛季;< 1 = 未启用(返回 null,行为与旧版逐帧一致)
 * @param chapter 当前章节(新手区门控)
 * @returns 命中的变体行,或 null(保持基线怪外观)
 */
export function rollSeasonMonster(
  behavior: EnemyKind,
  seasonId: number,
  chapter: number,
  rnd: () => number = Math.random
): SeasonMonsterRow | null {
  if (seasonId < 1 || chapter < SEASON_MONSTER_TENDENCY.minChapter) return null;
  const pool = poolFor(behavior, seasonId);
  if (pool.length === 0 || rnd() >= tendencyOf(behavior, seasonId)) return null;
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

/* ---------- 变体 EnemyDef 合成(记忆化:同 id 恒返回同一对象引用) ---------- */

const defCache = new Map<string, EnemyDef>();

/**
 * 把变体倍率折进基线 EnemyDef。
 * xp 与 radius 原样继承 —— 金币经济与碰撞/贴图几何不受主题怪影响(铁律)。
 * mech 从 SEASON_MONSTER_MECHS 取参数浅拷贝(纯换皮行 = 继承基线怪的 undefined)。
 * skill(批 4)从 SEASON_MONSTER_SKILLS 逐槽克隆(无技能行 = 继承基线怪的 undefined)。
 * 缓存返回同一引用,Enemy.def 与 ENEMY_DEFS[kind] 一样是共享只读行。
 */
export function seasonMonsterDef(row: SeasonMonsterRow, base: EnemyDef): EnemyDef {
  const hit = defCache.get(row.id);
  if (hit) return hit;
  const def: EnemyDef = {
    ...base,
    name: row.name,
    color: row.color,
    hp: Math.round(base.hp * row.hpMult),
    speed: base.speed * row.speedMult,
    contactDmg: Math.round(base.contactDmg * row.dmgMult),
    variantId: row.id,
    mech: row.mech ? { ...SEASON_MONSTER_MECHS[row.mech] } : base.mech,
    skill: row.skill ? cloneSkill(SEASON_MONSTER_SKILLS[row.skill]!) : base.skill,
  };
  defCache.set(row.id, def);
  return def;
}

/** 按变体 id 解析变体定义(批 4 技能召唤/死亡召唤的子怪用;与 seasonMonsterDef 同缓存,同 id 恒同引用)。未实装 id = null */
export function seasonVariantDef(id: string): EnemyDef | null {
  const row = seasonMonster(id);
  return row ? seasonMonsterDef(row, ENEMY_DEFS[row.behavior]) : null;
}

/**
 * 敌情文案素材:该行为当前实际会刷出的主题怪名(与 rollSeasonMonster 同一个候选池)。
 * 空数组 = 该赛季该行为没有主题怪,调用方回退基线文案。
 */
export function seasonMonsterNames(seasonId: number, behavior: EnemyKind): string[] {
  if (seasonId < 1) return [];
  return poolFor(behavior, seasonId).map((r) => r.name);
}
