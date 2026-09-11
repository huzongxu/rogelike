/**
 * 词缀库 —— 装备三件套(触发器 / 效果 / 修饰器)的全部定义。
 * 数据与策划案 3.3 词缀库一一对应;隐藏词缀/彩虹品质由词缀融合系统产生(后续迭代)。
 */

/**
 * 触发器类型。前 6 个是常规池(`randomTriggers` 会发);
 * `crit` / `elite` 是**隐藏触发器**,只从单卡重随的隐藏通道产出(见 ./reroll 的 HIDDEN_TRIGGERS),
 * 不进常规刷卡与三选一,以免与"隐藏品质仅融合产出"的稀有度模型打架。
 */
export type TriggerType = "pulse" | "kill" | "hurt" | "move" | "hit" | "combo" | "crit" | "elite";
export type EffectType =
  | "knife"
  | "nova"
  | "skeleton"
  | "cloud"
  | "ray"
  | "chain"
  | "shield"
  | "drain"
  | "icelance"
  | "frost_ring"
  | "meteor"
  | "magma_trail"
  | "spirit_wolves"
  | "haunt_crown";
/**
 * 修饰器类型。前 8 个是常规池(`randomModifiers` 会发);
 * `echo` / `condemned` 是**隐藏修饰器**,同样只走重随的隐藏通道(见 ./reroll 的 HIDDEN_MODIFIERS)。
 */
export type ModifierType = "chain" | "explode" | "split" | "lifesteal" | "pierce" | "haste" | "power" | "duration" | "echo" | "condemned";

/** 隐藏词缀(策划案 5.3:仅通过词缀融合获得,彩虹品质) */
export type HiddenAffixType = "death_barrage" | "supernova" | "necromancer" | "death_trail";

/** ---------- 触发器 ---------- */

export interface TriggerDef {
  type: TriggerType;
  name: string;
  desc: string;
}

export const TRIGGERS: readonly TriggerDef[] = [
  { type: "pulse", name: "周期脉冲", desc: "每隔 X 秒触发一次" },
  { type: "kill", name: "击杀触发", desc: "击杀敌人时 X% 概率触发" },
  { type: "hurt", name: "受伤反应", desc: "生命值低于 X% 时触发" },
  { type: "move", name: "移动触发", desc: "移动距离超过 X 米后触发" },
  { type: "hit", name: "受击触发", desc: "被敌人击中时触发" },
  { type: "combo", name: "连杀触发", desc: "连续击杀 X 个敌人后触发" },
  // ↓ 隐藏触发器(只走重随,见 ./reroll)
  { type: "crit", name: "暴击触发", desc: "造成暴击时触发" },
  { type: "elite", name: "猎首触发", desc: "击杀精英或首领时触发" },
];

export function triggerDef(type: TriggerType): TriggerDef {
  return TRIGGERS.find((t) => t.type === type)!;
}

/**
 * 隐藏触发器归属(唯一出处):只从单卡重随的隐藏通道产出,见 ./reroll。
 * 不进常规生成池,也不进图鉴与转生屏「定向搜索」—— 否则开局就能白选,稀有度模型直接垮。
 */
export const HIDDEN_TRIGGER_TYPES: readonly TriggerType[] = ["crit", "elite"];

/** 常规触发器定义(图鉴分母、定向搜索钮序列都读这一份) */
export const NORMAL_TRIGGER_DEFS: readonly TriggerDef[] = TRIGGERS.filter((t) => !HIDDEN_TRIGGER_TYPES.includes(t.type));

/** 触发器的数值参数(装备实例持有,由品质/等级随机) */
export interface TriggerParams {
  /** pulse: 触发间隔(秒) */
  interval?: number;
  /** kill: 触发概率 0-1 */
  chance?: number;
  /** hurt: 生命值阈值 0-1 */
  hpThreshold?: number;
  /** move: 移动距离阈值(像素,换算为米:100px=1m) */
  distance?: number;
  /** combo: 需要连杀数量 */
  count?: number;
  /** combo: 连杀判定时间窗(秒) */
  window?: number;
}

/** 触发器实例 = 定义 + 数值 */
export interface TriggerInstance {
  def: TriggerDef;
  params: TriggerParams;
}

export function makeTrigger(type: TriggerType, params: TriggerParams): TriggerInstance {
  return { def: triggerDef(type), params };
}

/** ---------- 效果 ---------- */

export interface EffectDef {
  type: EffectType;
  name: string;
  category: string;
  desc: string;
}

export const EFFECTS: readonly EffectDef[] = [
  { type: "knife", name: "飞刀投射", category: "物理/单体", desc: "向最近敌人投掷飞刀" },
  { type: "nova", name: "火焰新星", category: "火焰/AOE", desc: "以自身为中心爆发火焰" },
  { type: "skeleton", name: "召唤骷髅", category: "召唤", desc: "召唤骷髅战士协助战斗" },
  { type: "cloud", name: "生成毒云", category: "毒素/区域", desc: "在目标位置生成持续伤害区域" },
  { type: "ray", name: "冰霜射线", category: "冰霜/单体", desc: "向最近敌人发射减速射线" },
  { type: "chain", name: "闪电链", category: "闪电/连锁", desc: "向最近敌人释放可弹射的闪电" },
  { type: "shield", name: "护盾生成", category: "防御", desc: "生成吸收伤害的护盾" },
  { type: "drain", name: "生命汲取", category: "恢复", desc: "恢复自身生命值" },
  { type: "icelance", name: "冰锥", category: "冰霜/单体", desc: "追踪冰锥刺穿最近敌人" },
  { type: "frost_ring", name: "霜环", category: "冰霜/扩散", desc: "以自身为中心扩散霜环,扫过的敌人受伤并减速" },
  { type: "meteor", name: "陨星", category: "火焰/落点", desc: "标记敌人密集处,短暂延迟后陨星坠落并留灼烧余烬" },
  { type: "magma_trail", name: "熔岩足迹", category: "火焰/地带", desc: "移动时在身后留下熔岩地带灼烧敌人" },
  { type: "spirit_wolves", name: "灵狼", category: "召唤/协战", desc: "召唤灵狼群扑咬敌人" },
  { type: "haunt_crown", name: "亡灵冠冕", category: "召唤/增殖", desc: "击杀敌人时概率在尸体处唤醒亡影为你作战" },
];

export function effectDef(type: EffectType): EffectDef {
  return EFFECTS.find((e) => e.type === type)!;
}

/** 效果的数值参数 */
export interface EffectParams {
  /** 基础伤害 */
  damage?: number;
  /** 弹道/射线速度(px/s) */
  speed?: number;
  /** 半径/射程(px) */
  radius?: number;
  /** 扇形多发数量(飞刀/射线基础弹幕数) */
  spread?: number;
  /** 效果自带穿透次数(初始武器全向弹幕用;与修饰器穿透叠加) */
  pierce?: number;
  /** 召唤数量 */
  count?: number;
  /** 持续伤害:每秒伤害 */
  dps?: number;
  /** 持续时长(秒) */
  duration?: number;
  /** 减速比例 0-1(冰霜射线) */
  slow?: number;
  /** 闪电链跳数 */
  jumps?: number;
  /** 护盾吸收量 */
  amount?: number;
  /** 生命汲取:恢复量 */
  heal?: number;
  /** 冰锥:追踪转向率(rad/s) */
  homing?: number;
  /** 霜环:扩张速度(px/s) */
  expandSpeed?: number;
  /** 陨星:落点延迟(秒);熔岩足迹等地面效果复用为持续时长 */
  delay?: number;
}

export interface EffectInstance {
  def: EffectDef;
  params: EffectParams;
  /** 装备等级 → 基础数值的成长系数 */
  level: number;
}

export function makeEffect(type: EffectType, params: EffectParams, level: number): EffectInstance {
  return { def: effectDef(type), params, level };
}

/** ---------- 修饰器 ---------- */

export interface ModifierDef {
  type: ModifierType;
  name: string;
  desc: string;
}

export const MODIFIERS: readonly ModifierDef[] = [
  { type: "chain", name: "连锁", desc: "效果额外弹射 X 个目标" },
  { type: "explode", name: "爆炸", desc: "效果命中时产生范围爆炸" },
  { type: "split", name: "分裂", desc: "效果额外发射 X 个" },
  { type: "lifesteal", name: "吸血", desc: "造成伤害时恢复生命值" },
  { type: "pierce", name: "穿透", desc: "效果可穿透敌人" },
  { type: "haste", name: "加速", desc: "触发器间隔缩短 X%" },
  { type: "power", name: "增幅", desc: "效果伤害提升 X%" },
  { type: "duration", name: "持续", desc: "效果持续时间延长 X 秒" },
  // ↓ 隐藏修饰器(只走重随,见 ./reroll)
  { type: "echo", name: "回响", desc: "效果在 X 秒后以 Y% 伤害再触发一次" },
  { type: "condemned", name: "送葬", desc: "对生命低于 X% 的敌人伤害提升 Y%" },
];

export function modifierDef(type: ModifierType): ModifierDef {
  return MODIFIERS.find((m) => m.type === type)!;
}

/** 隐藏修饰器归属(唯一出处):同隐藏触发器,只走重随通道,不进图鉴 */
export const HIDDEN_MODIFIER_TYPES: readonly ModifierType[] = ["echo", "condemned"];

/** 常规修饰器定义(图鉴分母读这一份) */
export const NORMAL_MODIFIER_DEFS: readonly ModifierDef[] = MODIFIERS.filter((m) => !HIDDEN_MODIFIER_TYPES.includes(m.type));

export interface ModifierParams {
  /** chain: 额外弹射目标数 */
  targets?: number;
  /** explode: 爆炸半径 */
  radius?: number;
  /** explode: 爆炸伤害 = 原伤害的倍数 */
  damageMult?: number;
  /** split: 额外发射数量 */
  extra?: number;
  /** lifesteal: 吸血比例 0-1 */
  pct?: number;
  /** pierce: 穿透次数 */
  count?: number;
  /** haste: 间隔缩短比例 0-1 */
  pct2?: number;
  /** power: 伤害提升比例 0-1 */
  pct3?: number;
  /** duration: 延长秒数 */
  sec?: number;
  /** echo(隐藏): 二次触发的延迟秒数 */
  echoSec?: number;
  /** echo(隐藏): 二次触发的伤害系数(0-1,乘在原效果伤害上) */
  echoMult?: number;
  /** condemned(隐藏): 残血阈值 0-1(目标 hp/maxHp 低于此值才增伤) */
  condemnHp?: number;
  /** condemned(隐藏): 增伤倍率(1.45 = +45%) */
  condemnMult?: number;
}

export interface ModifierInstance {
  def: ModifierDef;
  params: ModifierParams;
}

export function makeModifier(type: ModifierType, params: ModifierParams): ModifierInstance {
  return { def: modifierDef(type), params };
}

// 品质定义已抽离至策划数值规范表,见 ./quality(全项目品质数值唯一出处)。
