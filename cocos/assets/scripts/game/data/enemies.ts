/**
 * 敌人与 Boss 策划规范表 —— 策划案 4.3(特化敌人)+ V3 §3.1/§3.2(章型/Boss 三阶段)。
 *
 * 本表是敌人侧全部策划数值的唯一出处(数据层);entities/enemy.ts 只保留
 * 运行时状态与 AI 逻辑,并从本表读数(历史导入路径经 entities/enemy 再导出兼容)。
 * 单位约定:半径/距离 = px,生命 = 点,速度 = px/秒,时间 = 秒,比例 = 0–1。
 */

export type EnemyKind =
  | "chaser"
  | "swift"
  | "tank"
  | "elite"
  | "reflector"
  | "splitter"
  | "hider"
  | "devourer"
  | "shieldguard"
  | "summoner"
  | "splitling"
  | "god"
  | "boss"
  | "goldkind";

/**
 * 赛季主题怪专属机制标签(DESIGN-MONSTERS-SEASONS 批 2+3)。
 * 变体行经 seasonMonsters.SEASON_MONSTER_MECHS 折入 EnemyDef.mech;基线怪缺省 undefined = 无机制。
 * AI 行为仍由 kind 决定,mech 只加"受击/死亡"结算钩子(接触减速 / 死亡灼烧池 / 死亡复活,零新 AI)。
 */
export type EnemyMech =
  /** 凝滞之触:接触伤害命中玩家后施加移动减速(factor = 移速乘数 0-1) */
  | { type: "slowOnHit"; factor: number; duration: number }
  /** 余烬孕体:死亡后在尸体处留灼烧池(半径 px/存续秒;cap = 全场灼烧池上限,超出最早一只提前消散);DoT 复用毒池口径 */
  | { type: "deathPool"; radius: number; duration: number; cap: number }
  /** 还魂体(批 3):首次致死时原地复活一次,回到 hpFrac×maxHp 血量;每只限一次,复活后照常可被击杀/分裂 */
  | { type: "revive"; hpFrac: number };

/**
 * 赛季精英/首领专属技能(批 4)。
 * 变体行经 seasonMonsters.SEASON_MONSTER_SKILLS 折入 EnemyDef.skill;基线怪缺省 undefined = 无技能。
 * 与 mech(受击/死亡结算钩子)不同:技能是 updateSkill 驱动的**主动计时行为**(召唤/震击/冲锋/光环…),
 * 作为附加层叠加在 kind 行为与首领三阶段之上——不改 kind、不动三阶段机、不动全局曲线(铁律)。
 * 伤害预算锚点:BOSS_SLAM(80 伤/220px/1.2s 蓄力)、新手 maxHp 100;精英单事件 ≤0.7×、变体首领附加层 ≤0.85×。
 */
export interface EnemySkill {
  /** 光环:半径内友军获得移速或伤害乘数(每帧派生,不改写目标属性) */
  aura?: {
    /** 生效半径(px) */
    radius: number;
    /** 友军移速乘数(>1;如 1.10 = 领鸣者 +10% 速) */
    speedMult?: number;
    /** 友军接触伤害乘数(>1;如 1.15 = 百鬼统领 +15% 伤) */
    dmgMult?: number;
  };
  /** 周期震击:触发瞬间快照玩家位置 → 蓄力预警 → 引爆范围伤害(可走位躲避) */
  slam?: {
    /** 入场后首次触发(秒) */
    first: number;
    /** 触发间隔(秒) */
    interval: number;
    /** 蓄力预警时长(秒;≥0.9 保证可躲) */
    charge: number;
    /** 引爆半径(px) */
    radius: number;
    /** 引爆伤害(点) */
    damage: number;
  };
  /** 脉冲:蓄力 → 区域伤害 + 减速;global = 全场雾(无伤害,仅减速) */
  pulse?: {
    first: number;
    interval: number;
    charge: number;
    /** 区域型生效半径(px;global 时忽略) */
    radius: number;
    /** 引爆伤害(点;global 雾型 = 0) */
    damage: number;
    /** 命中玩家施加的减速(走 Player.applySlow 共享快照;与凝滞之触同口径) */
    slow?: { factor: number; duration: number };
    /** 全场雾:引爆不查半径,渲染全屏 tint(深渊冰髓冰雾/幽冥潮主潮雾) */
    global?: boolean;
  };
  /** 多点轰炸(陨星齐射/全场火雨):一次生成 count 条 telegraph,与单发震击同管线 */
  barrage?: {
    first: number;
    interval: number;
    /** 落点数量 */
    count: number;
    charge: number;
    /** 单点引爆半径(px) */
    radius: number;
    /** 单点伤害(点) */
    damage: number;
    /** aroundPlayer = 散布在玩家快照周围;field = 均布竞技场 */
    aim: "aroundPlayer" | "field";
    /** aroundPlayer 模式的散布半径全宽(px) */
    spread: number;
  };
  /** 周期召唤(childVariant = 同季小怪变体 id,经 seasonMonsterDef 折入子怪定义) */
  summon?: {
    first: number;
    interval: number;
    /** 每次召唤数量 */
    count: number;
    /** 子怪行为(须与 childVariant 行的 behavior 一致) */
    kind: EnemyKind;
    /** 子怪变体 id(同季基础/迅捷档;缺省 = 基线小怪) */
    childVariant?: string;
    /** 落点散布全宽(px) */
    spread?: number;
  };
  /** 死亡召唤:死亡时在尸体处生成子怪(万骸指挥) */
  deathSummon?: {
    count: number;
    kind: EnemyKind;
    childVariant?: string;
    spread?: number;
  };
  /** 死亡分裂(覆盖式):取代 splitBabies 的数量;weak 变体不分裂(同基线阀门) */
  deathSplit?: { count: number };
  /** 冲锋:windup 原地蓄力 → 锁定方向 dash → 单次撞击(命中可附减速/点燃) */
  charge?: {
    first: number;
    interval: number;
    /** 蓄力时长(秒;原地不动,方向未锁定) */
    windup: number;
    /** 冲锋时长(秒) */
    duration: number;
    /** 冲锋移速倍率(×自身移速) */
    speedMult: number;
    /** 撞击伤害(点;仅结算一次) */
    damage: number;
    /** 撞击命中玩家施加的减速(霜咬巨狼) */
    slow?: { factor: number; duration: number };
    /** 撞击点落小灼烧池(燎原狼王;DoT 复用毒池口径) */
    ignite?: { radius: number; duration: number };
  };
  /** 隐身周期(同隐匿者语义:隐身时不可被命中);占比 ≤0.2 防 TTK 漂移 */
  hideCycle?: {
    /** 完整周期(秒) */
    cycle: number;
    /** 每周期可见时长(秒;其余时间隐身) */
    visible: number;
  };
  /** 行进火带:周期性在自身位置落灼烧池(熔核之心本体;cap 上限驱逐最早一池) */
  fireTrail?: {
    first: number;
    interval: number;
    radius: number;
    duration: number;
    cap: number;
  };
  /** 吞噬投射(被动):被投射物命中时吸收回血而非受伤(极渊之颚;与吞噬者同通道) */
  devour?: {
    /** 吸收比例(投射物伤害 × healRate = 回血量) */
    healRate: number;
  };
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  color: string;
  /** 碰撞半径(px) */
  radius: number;
  /** 基础生命(点;波次在 spawn 时按 waveHpMult 缩放) */
  hp: number;
  /** 基础移速(px/秒;波次在 spawn 时按 waveSpeedMult 缩放) */
  speed: number;
  /** 接触伤害(点/次,受击间隔见 combat.CONTACT_HIT_CD) */
  contactDmg: number;
  /** 击杀掉落金币的基数(金币 = xp × GOLD_PER_XP;战斗内无经验系统后沿用该字段作金币基数) */
  xp: number;
  /** 特化描述(策划案 4.3) */
  special?: string;
  /** 赛季主题怪标记(= data/seasonMonsters 行 id;缺省 = 基线怪)。贴图键 monster_<variantId>,缺图回退 enemy_<kind> */
  variantId?: string;
  /** 主题怪专属机制(批 2;仅变体行携带,基线怪与未挂机制的变体 = undefined) */
  mech?: EnemyMech;
  /** 赛季精英/首领专属技能(批 4;仅变体行携带,基线怪 = undefined)。行为由 data/seasonMonsters 的 SEASON_MONSTER_SKILLS 折入 */
  skill?: EnemySkill;
}

/**
 * 敌人基础属性表(策划案 4.3 六种特化敌人 + 基础四件 + 分裂幼体/神之敌/ Boss/金怪)。
 * 取值为新手局标定基线:血量曲线铁律 —— 新怪只加行为多样性,不抬基础曲线(见 docs/CONTEXT.md)。
 */
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  chaser: { kind: "chaser", name: "腐尸", color: "#b06a4a", radius: 14, hp: 30, speed: 72, contactDmg: 8, xp: 1 },
  swift: { kind: "swift", name: "迅捷鬼", color: "#8fbf3f", radius: 11, hp: 18, speed: 150, contactDmg: 5, xp: 2 },
  tank: { kind: "tank", name: "石巨", color: "#7d6b8f", radius: 24, hp: 140, speed: 40, contactDmg: 16, xp: 4 },
  elite: { kind: "elite", name: "精英", color: "#e05040", radius: 34, hp: 520, speed: 52, contactDmg: 26, xp: 12 },
  reflector: { kind: "reflector", name: "反射者", color: "#4fc3f7", radius: 14, hp: 42, speed: 62, contactDmg: 10, xp: 3, special: "反弹伤害" },
  splitter: { kind: "splitter", name: "分裂体", color: "#c0ca33", radius: 16, hp: 56, speed: 76, contactDmg: 8, xp: 4, special: "死亡后分裂" },
  hider: { kind: "hider", name: "隐匿者", color: "#b388ff", radius: 12, hp: 32, speed: 92, contactDmg: 6, xp: 3, special: "周期性隐身" },
  devourer: { kind: "devourer", name: "吞噬者", color: "#26a69a", radius: 16, hp: 62, speed: 56, contactDmg: 9, xp: 4, special: "吸收投射物回血" },
  shieldguard: { kind: "shieldguard", name: "护盾卫士", color: "#78909c", radius: 18, hp: 82, speed: 46, contactDmg: 10, xp: 5, special: "正面免疫伤害" },
  summoner: { kind: "summoner", name: "召唤师", color: "#ff8a65", radius: 18, hp: 52, speed: 52, contactDmg: 8, xp: 5, special: "持续召唤小怪" },
  splitling: { kind: "splitling", name: "分裂幼体", color: "#c0ca33", radius: 10, hp: 16, speed: 92, contactDmg: 4, xp: 1 },
  god: { kind: "god", name: "神之敌", color: "#ff2d8f", radius: 40, hp: 2600, speed: 46, contactDmg: 40, xp: 80, special: "多重机制超级精英(反射/隐身/护盾/分裂)" },
  boss: { kind: "boss", name: "深渊领主", color: "#ff2d2d", radius: 48, hp: 220, speed: 95, contactDmg: 36, xp: 120, special: "关卡 Boss(反射/正面减伤/死亡分裂)" },
  goldkind: { kind: "goldkind", name: "金怪", color: "#ffd54a", radius: 13, hp: 20, speed: 110, contactDmg: 4, xp: 8, special: "掉 16 金(宝箱章,8 倍腐尸)" },
};

/* ---------- 波次缩放曲线(数值墙形状:新手区 + 台阶) ---------- */

/** 章节生命缩放分段点:前 earlyChapters 章为新手区(缓升),之后进入台阶段(陡升) */
export const WAVE_HP_EARLY_CHAPTERS = 5;
/** 新手区每章生命增幅(+2%/章,第 5 章 ≈1.10 —— 初始武器+挂机可随意通过) */
export const WAVE_HP_EARLY_RATE = 0.02;
/** 台阶段起点倍率(第 5 章末的连续值,保证曲线不断层) */
export const WAVE_HP_LATE_BASE = 1.1;
/** 台阶段每章生命增幅(+7%/章,第 20 章 ≈2.15 —— 数值台阶,刷装备/强化破墙) */
export const WAVE_HP_LATE_RATE = 0.07;

/**
 * 章节生命缩放(数值墙形状:新手区 + 台阶):
 * 前 5 章缓升(+2%/章,第 5 章 ≈1.10)——初始武器+挂机可随意通过(新手区);
 * 第 5 章后陡升(+7%/章,第 20 章 ≈2.15)——数值台阶(顿感),刷装备/强化破墙。
 */
export function waveHpMult(wave: number): number {
  if (wave <= WAVE_HP_EARLY_CHAPTERS) return 1 + wave * WAVE_HP_EARLY_RATE;
  return WAVE_HP_LATE_BASE + (wave - WAVE_HP_EARLY_CHAPTERS) * WAVE_HP_LATE_RATE;
}

/** 波次移速缩放:每章 +1%(轻微压迫感,不破坏走位空间) */
export const WAVE_SPEED_RATE = 0.01;

export function waveSpeedMult(wave: number): number {
  return 1 + wave * WAVE_SPEED_RATE;
}

/* ---------- 登场曲线(randomEnemyKind 的权重表;数值墙形状) ---------- */

export interface SpawnCurveRow {
  kind: EnemyKind;
  /** 最早登场章节(之前不进入判定) */
  minWave: number;
  /** 随机数累计阈值上界(按表序依次判定;命中即返回) */
  rBelow: number;
  /** 仅「神之挑战」天赋解锁后参与判定(策划案 5.2) */
  godOnly?: boolean;
}

/**
 * 敌人登场曲线(数值墙形状):
 * 前 2 章纯基础怪(腐尸 55% + 迅捷 45%)——新手区随意通;
 * 第 3 章起石巨压场 50%(收入锚点),迅捷回补 5%(保基础怪多样性,主题怪迅捷档波 3+ 可达);
 * 第 5 章起机制怪(分裂/隐匿)试水;第 6 章起全面台阶(召唤/护盾/反射/吞噬);
 * 反射者(反伤克高频)与吞噬者(吸收投射)特意推迟到台阶章,避免新手死于自己的弹幕。
 * 阈值为累计上界:命中区间 = [上一行阈值, 本行阈值)。
 * 迅捷拆两行(2026-09-01 独立平衡调整,实测口径 = 全套门槛模拟):
 * - 迅捷不可提到 tank 前:3-4 章石巨 50%→5% 曾致新手模拟 12 章崩(收入+接触压双输);
 * - 波段宽度锯齿敏感:2%/4%/6%/7%/8% 在两道新手门槛交替崩(贴种子波动),5% 是唯一
 *   双门槛全过且满程(22 章)的稳定岛;
 * - tank 扩带让位(0.65)虽过新手两门槛,但章型模拟卡死第 5 章、地形聚合回落超标,已弃。
 * minWave=1 行仅波 1-2 生效(波 3+ 被前一行遮蔽)。
 */
export const SPAWN_CURVE: readonly SpawnCurveRow[] = [
  { kind: "god", minWave: 8, rBelow: 0.04, godOnly: true },
  { kind: "summoner", minWave: 6, rBelow: 0.08 },
  { kind: "shieldguard", minWave: 6, rBelow: 0.13 },
  { kind: "reflector", minWave: 6, rBelow: 0.19 },
  { kind: "devourer", minWave: 6, rBelow: 0.25 },
  { kind: "splitter", minWave: 5, rBelow: 0.32 },
  { kind: "hider", minWave: 5, rBelow: 0.4 },
  { kind: "tank", minWave: 3, rBelow: 0.5 },
  { kind: "swift", minWave: 3, rBelow: 0.55 },
  { kind: "swift", minWave: 1, rBelow: 0.45 },
];

/** 登场表全部未命中时的兜底敌种(新手区主力) */
export const SPAWN_FALLBACK_KIND: EnemyKind = "chaser";

/**
 * 根据波次随机选一个敌人(登场曲线见 SPAWN_CURVE)。
 * godAllowed = 「神之挑战」天赋已解锁(策划案 5.2);未解锁时神之敌不出现。
 */
export function randomEnemyKind(wave: number, godAllowed = false): EnemyKind {
  const r = Math.random();
  for (const row of SPAWN_CURVE) {
    if (row.godOnly && !godAllowed) continue;
    if (wave >= row.minWave && r < row.rBelow) return row.kind;
  }
  return SPAWN_FALLBACK_KIND;
}

/* ---------- 特化机制参数(策划案 4.3) ---------- */

/** 隐匿者/神之敌/迷雾的隐身节奏:周期 5 秒,前 3 秒可见、后 2 秒隐身(不可被瞄准) */
export const HIDER_CYCLE = 5;
export const HIDER_VISIBLE = 3;

/** 召唤师:每 4 秒召唤一次,每次 2 只腐尸;落点偏移 = (rand-0.5)×全宽,即 ±20px */
export const SUMMONER_INTERVAL = 4;
export const SUMMONER_COUNT = 2;
export const SUMMON_SPREAD = 40;

/** 死亡分裂数量:分裂体 2 只 / 神之敌 4 只 / Boss 2 只(弱化变体不分裂,见 BOSS_WEAK_HP_MULT) */
export const SPLIT_COUNT_DEFAULT = 2;
export const SPLIT_COUNT_GOD = 4;
export const SPLIT_COUNT_BOSS = 2;
/** 分裂幼体落点散布全宽(px;落点偏移 = (rand-0.5)×本值,即 ±15px) */
export const SPLIT_SPREAD = 30;

/** 反弹伤害比例:反射者/神之敌 25%;Boss 15%(比例更低,机制重在牵制而非惩罚) */
export const REFLECT_RATE = 0.25;
export const REFLECT_RATE_BOSS = 0.15;

/**
 * 正面防御判定:来源方向与朝向夹角余弦 > 0.5(即正面 60° 弧内)视为正面;
 * 正面伤害减免后倍率:护盾卫士/神之敌 ×0.2(近免疫),Boss ×0.6(保留打击感)。
 */
export const FRONT_GUARD_DOT = 0.5;
export const FRONT_GUARD_MULT = 0.2;
export const FRONT_GUARD_MULT_BOSS = 0.6;

/* ---------- Boss:深渊领主(策划案 V3 §3.1/§3.2) ---------- */

/**
 * Boss 独立血量曲线(关卡维度,与波次缩放分离):
 * 标定依据 = 单目标木桩 DPS 锚点(measureBossDps,确定性口径,tests/boss.test.ts 守窗口):
 * 第 1 关到达态(凯尔核心 16 束 × 1.2s 齐射 + 20 章商店成长 + 强化,真机口径:章首清场 + 章型)≈163 dps、终局态(神装 + 成长 + 天赋)≈448 dps
 * (R7 / R6 重标,2026-09-14:主动槽 4 起步 / 6 硬顶后金币出口转到强化与进化,sim 补「每章最多 3 次最便宜强化」;
 *  R6 起 sim 的核心技能与真机同口径由技能表实例化,不再拿套组旧初始武器当核心;R7 前锚点为 ≈65 / ≈384 dps、base 2.0)。
 * 旧版所有关卡统一 473hp → 到达态 ~10s、终局 ~2.5s 击杀,三阶段机制毫无存在感。
 * 目标:第 1 关 TTK ≈15s(×5.0 → 2365hp)、第 7 关 ≈42s(×40 → 18920hp),第 20 章 60s 超时判负留足裕量;
 * (R13 重锚,2026-09-15:标定口径切到真机同款 chapterReset + chapterTypes,宝箱章攒金 + 精英章掉落让到达态品质上移,base 3.5 → 5.0)
 * 中间关卡每关 ×√2(+41%)几何增长 —— 玩家战力随局内商店/跨局成长近似乘性增长,
 * 相对难度平滑爬坡。
 */
export const BOSS_HP_CURVE = { base: 5.0, growth: Math.SQRT2 } as const;

export function bossHpMult(stageId: number): number {
  const s = Math.max(1, Math.floor(stageId));
  return BOSS_HP_CURVE.base * Math.pow(BOSS_HP_CURVE.growth, s - 1);
}

/**
 * 三阶段血量阈值(单调推进,不回退):
 * P1(100%–60%)追击+反射;P2(60%–25%)召唤+地面震击;P3(<25%)狂暴。
 * 单发大伤害可跳过 P2 直达 P3(两次阶段回调都会触发)。
 */
export const BOSS_PHASE2_HP = 0.6;
export const BOSS_PHASE3_HP = 0.25;

/** 偶数关弱化变体(策划案 V3 §3.1):hp×0.7、跳过 P2、无死亡分裂(节奏阀门,避免连关高压) */
export const BOSS_WEAK_HP_MULT = 0.7;

/** 地面震击(P2):蓄力 1.2s 红色预警 → 220px 新星 80 伤害(对标墙标定:新手稳态 HP 75-95,可躲) */
export const BOSS_SLAM = { charge: 1.2, radius: 220, damage: 80 } as const;
/** 召唤节奏:入场 3s 后首次事件,此后 P2 每 6s / P3 每 3s,每次 2 只 */
export const BOSS_SUMMON = { first: 3, p2: 6, p3: 3, count: 2 } as const;
/** P3 狂暴移速倍率 */
export const BOSS_FRENZY_SPEED = 1.4;

/** 光环连乘钳制(批 4):多载体圈重叠时,每轴派生乘数封顶 1.5(安全阀;现表最大单轴 = 1.15) */
export const AURA_MULT_CAP = 1.5;
