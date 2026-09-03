/**
 * 战斗态双坞 HUD 纯逻辑(可测):几何常量 + 单选行情条 + 装备横排布局。
 * 顶坞 64 全宽信息坞 + 底坞 48(装备横排 + 章节/BOSS 进度);
 * 人物/怪物活动区(战场)收窄到两坞之间,实体不越上下栏。
 */

export const HUD_TOP_H = 64;
export const HUD_BOT_H = 48;
export const HUD_PAD = 10;

/** 坞板资产比例 == 显示比例(560/64、560/48),绘制端直接等比拉伸,零变形 */
export const DOCK_TOP_ASPECT = 1120 / 128; // 8.75
export const DOCK_BOT_ASPECT = 1120 / 96; // ≈11.667

/** 战场活动带:两坞之间的纵向区间(实体钳制边界,不得越上下栏) */
export function battleBandY(wh: number): { y0: number; y1: number } {
  return { y0: HUD_TOP_H, y1: wh - HUD_BOT_H };
}

export type TickerKind = "combo" | "commission" | "intel" | "env" | "thorn" | "auto";

export interface TickerFlags {
  combo: boolean; // 连杀 ≥2
  commission: boolean; // 委托已完成待领取
  intel: boolean; // 本章敌情
  env: boolean; // 环境词缀
  thorn: boolean; // 荆棘反伤流
}

/** 底坞行情单选:优先级 连杀>委托>敌情>环境>荆棘>挂机(兜底必显) */
export function pickTicker(f: TickerFlags): TickerKind {
  if (f.combo) return "combo";
  if (f.commission) return "commission";
  if (f.intel) return "intel";
  if (f.env) return "env";
  if (f.thorn) return "thorn";
  return "auto";
}

export interface EquipRowLayout {
  shown: number; // 实画卡片数
  hidden: number; // 被折叠数(+N 芯片展示)
  cardW: number;
  cardH: number;
  gap: number;
  chip: boolean;
  chipW: number;
}

/** 底坞装备横排:Boss 时上限 3 张,平时 4 张;超出收进 +N 芯片(30px);卡宽 clamp 64..168 */
export function equipRowLayout(n: number, boss: boolean, zoneW: number): EquipRowLayout {
  const limit = boss ? 3 : 4;
  const gap = 6;
  const chipW = 30;
  const shown = Math.min(Math.max(0, n), limit);
  const chip = n > limit;
  const hidden = n - shown;
  const avail = zoneW - (chip ? chipW + gap : 0) - gap * Math.max(0, shown - 1);
  const cardW = shown > 0 ? Math.min(168, Math.max(64, Math.floor(avail / shown))) : 0;
  return { shown, hidden, cardW, cardH: 36, gap, chip, chipW };
}

/** 胶囊条填充宽:frac 钳制 0..1;>0 时最小宽 = h 保胶囊头完整 */
export function barFillW(w: number, h: number, frac: number): number {
  const f = Math.min(1, Math.max(0, frac));
  return f <= 0 ? 0 : Math.max(h, w * f);
}
