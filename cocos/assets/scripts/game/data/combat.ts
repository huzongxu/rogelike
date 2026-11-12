/**
 * 玩家基础与战斗结算策划规范表 —— 策划案 4.2(环境词缀联动)/ V3 §3.2(Boss 战)。
 *
 * 本表是玩家基础属性、成长曲线与战斗内结算常量的唯一出处(数据层);
 * entities/player.ts 与 game.ts 的战斗结算只读数(历史导入路径经各自模块再导出兼容)。
 * 单位约定:半径/距离 = px,生命 = 点,速度 = px/秒,时间 = 秒,比例 = 0–1。
 */

/* ---------- 玩家基础属性 ---------- */

/**
 * 玩家基础属性(无装备/天赋白值):
 * 半径 16 = 与敌人接触判定、拾取判定共用的碰撞圆;
 * 移速 240 = 新手标定:可稳躲震击预警(1.2s 蓄力)与围杀缺口;
 * 生命 100 = 数值墙锚点:新手稳态 75–95(见 BOSS_SLAM 80 伤害标定);
 * 每级 +8 生命 = 温和成长,主成长来自装备/收藏/天赋而非等级;
 * 4 主动法宝槽 = 取舍提前到第 2–3 章(docs/DESIGN-HERO-RHYTHM.md §4.3 / R7,用户裁定 B,2026-09-13):
 *   3 独有技能 + 4 法宝 = 7 个施放源,每件看得清;天赋最多 +2、本局广告 +1,硬顶 SHOP_SLOT_CAP 6。
 */
export const PLAYER_BASE = {
  radius: 16,
  speed: 240,
  maxHp: 100,
  hpPerLevel: 8,
  slots: 4,
};

/* ---------- 等级与经验 ---------- */

/**
 * 升级经验曲线(温和递增):xpToNext = floor(XP_BASE + level×XP_PER_LEVEL + level^XP_POWER_EXP × XP_POWER_COEF)。
 * 战斗内无传统等级成长压力(成长来自装备),曲线只需提供节奏感与升级回血反馈。
 */
export const XP_BASE = 8;
export const XP_PER_LEVEL = 5;
export const XP_POWER_EXP = 1.5;
export const XP_POWER_COEF = 1.0;

export function xpToNext(level: number): number {
  return Math.floor(XP_BASE + level * XP_PER_LEVEL + Math.pow(level, XP_POWER_EXP) * XP_POWER_COEF);
}

/** 升级回复比例:升级时回复 20% 最大生命(小奖励感,不替代治疗手段) */
export const LEVELUP_HEAL_PCT = 0.2;

/* ---------- 受击与连杀 ---------- */

/** 接触伤害判定间隔(秒):同一敌人贴身后每 0.8s 结算一次,防每帧咬人 */
export const CONTACT_HIT_CD = 0.8;

/**
 * 隐藏触发器「暴击触发」的冷却(秒):防高频暴击把效果刷成连发,口径与受击触发一致。
 * 受击触发那条 0.7s 仍内联在引擎里(冻结基准,不在本次改动面),本常量只服务新增的暴击触发。
 */
export const CRIT_TRIGGER_CD = 0.7;

/** 连杀窗口(秒):3 秒无新击杀断连 */
export const COMBO_WINDOW = 3;
/** 每 10 连杀触发一次狂潮 */
export const COMBO_FRENZY_EVERY = 10;
/** 狂潮持续时长(秒) */
export const FRENZY_DURATION = 2;
/** 狂潮期间全装备触发间隔倍率(×0.6 = 弹幕加速反馈) */
export const FRENZY_PULSE_MULT = 0.6;

/**
 * 反射伤害预算:玩家侧反伤(反射者/反伤领域)每秒最多造成 15% 最大生命的伤害,
 * 防止高频弹幕被反射秒杀玩家(惩罚可读,不处刑)。
 */
export const REFLECT_BUDGET_HP_PCT = 0.15;

/** 荆棘反伤回血流:每次挨打回 2% 最大生命(故意挨打 → 回血联动,Build 身份) */
export const THORN_HEAL_PCT = 0.02;

/* ---------- 击杀掉落(场内金币经济;替代经验宝石) ---------- */

/**
 * 金币换算:击杀掉落金币 = 敌人金币基数 × 本值(每日天赋「淘金」另乘倍率)。
 * 2 → 1(A4 重标):出口侧补齐了场内强化与升级重随两个深出口后,产出侧砍半,
 * 让"每章末余额"回到"够买一张卡、但买不光货架"的区间。依据见 docs/DESIGN-SEASON-FEEL.md A4。
 */
export const GOLD_PER_XP = 1;
/** Boss 击杀固定掉 45 金(不走上式,bosses 是主要金币节点);A4 由 60 下调,与产出侧同比例 */
export const BOSS_GOLD = 45;
/** 精英死亡掉落的金币堆数(普通敌人 1 堆);A4 由 8 下调 —— 精英章原本是单章产出的尖峰 */
export const ELITE_GEM_COUNT = 6;
/** 金币掉落散布半径(±px,围绕尸体) */
export const DROP_SCATTER = 10;

/** 金币拾取:距离玩家半径 + 8px 内拾取;无自动拾取天赋时 420px 内开始吸附 */
export const GEM_PICK_RADIUS_BONUS = 8;
export const GEM_MAGNET_RADIUS = 420;

/* ---------- 召唤物(骷髅/灵狼)行为参数 ---------- */

/** 召唤物索敌视野(px):320 内找最近敌人 */
export const MINION_SIGHT = 320;
/** 召唤物攻击距离(px):100 内出手,否则追击 */
export const MINION_ATTACK_RANGE = 100;
/** 召唤物攻击附带的击退力度 */
export const MINION_HIT_KNOCKBACK = 20;
/** 亡灵契约:召唤物攻击时治疗主人,量为本次伤害的 30% */
export const MINION_HEAL_ON_HIT_PCT = 0.3;

/**
 * 承伤反哺池的结构常量(「缠斗回复」身份项的机制参数;入池比例是身份数值,在 ./heroSkills 的 MU_RETALIATION_POOL_PCT)。
 * 机理:玩家承受伤害时按比例转入池,召唤物命中时从池里抽取追加回血 —— **反哺总量恒 ≤ 承伤 × 比例,与召唤物数量无关**
 * (否则上百只灵狼会把每次承伤放大成无限奶,是这一档最容易踩的坑)。
 */
export const RETALIATION_HEAL = {
  /** 含义:池的半衰期,超时不用则流失。单位:秒。依据:精英尖峰是 1–2 秒的脉冲,2.5s 足够把一次尖峰摊到多次狼命中上;出处:CONTEXT 68 剖面 */
  halfLifeSec: 2.5,
  /** 含义:池上限占最大生命的比例(防单次超大尖峰囤出超额奶)。单位:比例。依据:0.5 = 一次尖峰最多换来半条血的缓冲;出处:同上 */
  capMaxHpPct: 0.5,
  /**
   * 含义:每次召唤物命中最多抽取 = 该次基础回血 × 本值。单位:倍率。
   * 取值依据:参数 sweep 表明卡点在**释放速率**而不是池子大小——1.5 时每次命中最多退 6 点、
   *   约 90 次命中/s 也只有 ≈540/s,追不上精英章单秒 734–1005 的承伤尖峰(穆三种子全档不动);
   *   提到 8(单次最多退 32)后 seed 123 的第 15 章从阵亡转为打满 20 章,而 seed 21 的第 10 章
   *   仍不动(章首第 16 秒的第一波精英脉冲早于任何可退的存量)。
   * 出处:docs/TODO-HERO-RHYTHM.md §1 穆条(杠杆 A)、CONTEXT 68。
   * 注:反哺**总量**始终由入池比例(heroSkills.MU_RETALIATION_POOL_PCT)与池上限 capMaxHpPct 双重钳住,
   *   本值只决定退得多快,不决定退得多。
   */
  perHitMult: 8,
} as const;

/**
 * 荆棘层的攒法(站位资源的入口条件)。放在本表是为了让 `entities/player` / `systems/battleWorld` /
 * 模拟器都能引用,不反向依赖 ./heroSkills。
 *
 * **两态**(R22,用户「土豆兄弟的反伤角色设计的更好玩,角色两种状态…」):姿势在**局首二选一**
 * (见 `heroSkills.HERO_STANCES`),不再挂在分岔上;两态共有的前提是
 * **贴身距离闸内有敌才涨**(`THORN_STACK.contactRadius`),姿势只决定这一层还要不要"停"或"走"。
 *  - `still`:站定不动且贴身才涨(挂机档跟着走 hold);
 *  - `move`:边走边贴身才涨(挂机档跟着走 orbit)。
 * 没有"什么都不约束"的第三档 —— 两态各有代价,开局就得选一副面孔。
 * 贴身这一前提带**短接触记忆**(`contactEchoDecayPerSec`,两态同享):怪刚在闸里被清掉也算这一拍,
 * 治的是"稀怪章怪进闸半秒就死、层永远养不起来"(R22 试玩实测:站定档 45 秒里 64% 的秒数层数为 0)。
 */
export type ThornGainMode = "still" | "move";

/**
 * 荆棘层(薇拉的**站位资源**;docs/DESIGN-HERO-PIPELINE.md §2 站位语义 / §5.5 提案 4)。
 * 形状:贴身 `contactRadius` 内有敌时按**围数**积累层数,脱离接触则线性掉层;层数只放大
 * 带 `stackRadiusPer` / `stackPowerLoss` 参数的施放源(目前只有她的核心「荆棘圆环」)。
 * 设计意图:把"什么时候站在圈里"变成一条玩家读得出的曲线 —— 贴进去换半径与威力,退出来保命。
 * 挂机 hold 档照样能攒(全自动仍可通),手动的报酬是"贴脸养层再爆"这一拍更陡。
 * 反哺类 runaway 的防线在这里 = 层数封顶 + 零层有罚,不是靠奶量。
 */
export const THORN_STACK = {
  /** 含义:层数上限。单位:层。依据:满层给半径 +36% / 补回罚项,与共鸣档位(半径 ×1.5)同量级且不越它 */
  cap: 6,
  /**
   * 含义:每只贴身敌每秒积累的层数。单位:层/(只·秒)。
   * 取值依据:R18 实测 —— 自动档下她的 110px 围数均值只有 0.2–1.6(圆环清得快,怪多半没进到身),
   *   首版 0.5 层/(只·秒) 跑出来层均 0.02–0.46、满层时间 0%,等于**只吃到零层罚项**、没有报酬曲线;
   *   提到 3 = 一只贴身敌 2 秒攒满,贴身这一动作在手感上"立刻看得见"。
   * 出处:docs/DESIGN-HERO-PIPELINE.md §5.5 提案 4、.probe/r18-after.json。
   */
  perContactPerSec: 3,
  /** 含义:无贴身敌时每秒掉层。单位:层/秒。依据:0.8 = 满层后脱离接触约 7.5 秒清零,一条"退出去"的可见尾迹 */
  decayPerSec: 0.8,
  /** 含义:算"贴身"的距离闸。单位:像素。依据:与挂机 hold 档的围数统计同源(`rhythm.AI_PROFILE_PARAMS` 用的 110),两条线不各说一套 */
  contactRadius: 110,
  /**
   * 含义:**接触记忆**的衰减率 —— 怪从贴身闸里消失(多半是被自己的圆环清掉)后,它的围数还按这个速率
   *   留在记忆里继续喂层。单位:围数/秒 → 记忆窗口与围数成正比:1 只 ≈ 0.17 秒、3 只 ≈ 0.5 秒、6 只 ≈ 1 秒。
   * 取值依据:R22 候选① 扫描(120 局/格 = 60 种子 × 2 分岔,真机口径;`.probe/r22b-echo.test.ts`)。
   *   站定档随记忆变长单调吃到报酬 —— 层均 1.62(无记忆)/ 2.13(6)/ 2.94(1),
   *   "层数为 0 的秒占比"41.0% / 32.8% / 25.8%,满层占比 2.5% / 5.5% / 18.8%;
   *   但绕场档同时被推成"层数常驻满格":满层占比 41.7% / 54.6% / **81.7%**(1 那一档曲线基本消失),
   *   而站位资源的全部意义就是那条读得出的涨落曲线 → 取 6:站定的饿死率砍掉 8 个百分点,
   *   绕场还留着 45% 的非满层时间。生存率两侧都没被本值推动(站定 38/43/38%、绕场 12/13/15%,120 局的噪声带 ±4pt)。
   * 边界:记忆只放宽两态**共有**的贴身前提,不碰姿势那一条(`still` 仍要求不动、`move` 仍要求在动);
   *   层数上限 `cap` 与掉层 `decayPerSec` 都不变,总量仍被封顶夹住。
   * 出处:docs/TODO-HERO-RHYTHM.md §1 薇拉条候选 ①(用户 2026-10-01 裁定)、docs/CONTEXT.md 73。
   */
  contactEchoDecayPerSec: 6,
} as const;
/** 无目标时跟随玩家:距离 > 60px 才移动(贴身环绕不打扰) */
export const MINION_FOLLOW_LEASH = 60;

/* ---------- 复活(广告复活;弹壳式) ---------- */

/** 复活后 2 秒无敌盾:避免复活瞬间被贴身围杀 */
export const REVIVE_SHIELD_SECONDS = 2;
/** 复活时清空玩家周围 70px 内的敌人(喘息空间) */
export const REVIVE_CLEAR_RADIUS = 70;

/* ---------- Boss 出场(策划案 V3 §3.1) ---------- */

/** Boss 出场位置:玩家右侧 260px、下方 60px,并被竞技场边界收进 60px(保证完整登场) */
export const BOSS_SPAWN_OFFSET_X = 260;
export const BOSS_SPAWN_OFFSET_Y = 60;
export const BOSS_SPAWN_INSET = 60;
