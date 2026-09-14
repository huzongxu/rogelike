/**
 * 战斗态双坞 HUD 纯逻辑(可测):几何常量 + 单选行情条 + 装备横排布局。
 * 顶坞 64 全宽信息坞 + 底坞 48(装备横排 + 章节/BOSS 进度);
 * 人物/怪物活动区(战场)收窄到两坞之间,实体不越上下栏。
 */

export const HUD_TOP_H = 64;
export const HUD_BOT_H = 48;
/** v4 底坞:高度翻倍,装备卡两排(平时 2×4、Boss 2×3),超出仍收 +N 芯片 */
export const HUD_BOT_H_V4 = 96;
export const HUD_PAD = 10;

/** 坞板资产比例 == 显示比例(560/64、560/48),绘制端直接等比拉伸,零变形 */
export const DOCK_TOP_ASPECT = 1120 / 128; // 8.75
export const DOCK_BOT_ASPECT = 1120 / 96; // ≈11.667

/** 战场活动带:两坞之间的纵向区间(实体钳制边界,不得越上下栏) */
export function battleBandY(wh: number, botH: number = HUD_BOT_H): { y0: number; y1: number } {
  return { y0: HUD_TOP_H, y1: wh - botH };
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

/** 底坞一排(两列表之一):kind 区分技能 / 法宝;start = 该排首张在 castList 中的下标 */
export interface DockRowLayout {
  kind: "skill" | "artifact";
  start: number;
  shown: number;
  hidden: number;
  chip: boolean;
  cardW: number;
  gap: number;
  chipW: number;
}

export interface CastDockLayout {
  rows: DockRowLayout[];
  cardH: number;
  rowGap: number;
  /** 首排顶缘相对坞顶的偏移(网格整体在坞内垂直居中,偶数) */
  y0: number;
  /** 两排都在时在排间画 1px 分隔线 */
  divider: boolean;
}

/**
 * 底坞两列表(docs/DESIGN-HERO-RHYTHM.md §6 / R10,用户裁定 C):上排**独有技能**(≤3 张:核心 / 分岔 / 进阶,不占槽),
 * 下排**主动法宝**(平时 4 / Boss 3 张,多的收 +N 芯片);只有一类时单排。两排各自算卡宽(技能 3 张更宽),
 * 排距 8、两排之间 1px 分隔线,整体在坞内垂直居中。技能与法宝在 castList 里本就技能在前,start 直接给下标。
 */
export function castDockLayout(skillCount: number, artifactCount: number, boss: boolean, zoneW: number, dockH: number): CastDockLayout {
  const gap = 6;
  const chipW = 30;
  const cardH = 36;
  const mk = (kind: DockRowLayout["kind"], start: number, count: number, perRow: number): DockRowLayout => {
    const shown = Math.min(Math.max(0, count), perRow);
    const chip = count > perRow;
    const hidden = count - shown;
    const avail = zoneW - (chip ? chipW + gap : 0) - gap * Math.max(0, shown - 1);
    const cardW = shown > 0 ? Math.min(168, Math.max(64, Math.floor(avail / shown))) : 0;
    return { kind, start, shown, hidden, chip, cardW, gap, chipW };
  };
  const rows: DockRowLayout[] = [];
  if (skillCount > 0) rows.push(mk("skill", 0, skillCount, 3));
  if (artifactCount > 0) rows.push(mk("artifact", Math.max(0, skillCount), artifactCount, boss ? 3 : 4));
  const rowGap = 8;
  const gridH = rows.length * cardH + Math.max(0, rows.length - 1) * rowGap;
  const y0 = Math.max(0, Math.floor((dockH - gridH) / 4) * 2);
  return { rows, cardH, rowGap, y0, divider: rows.length === 2 };
}

export interface EquipGridLayout extends EquipRowLayout {
  /** 每排列数(单排档 = 实画张数,双排档 = 满列数) */
  cols: number;
  /** 排数(1 或 2) */
  rows: number;
  /** 排间距 */
  rowGap: number;
  /** 首排顶缘相对坞顶的偏移(网格整体在坞内垂直居中,偶数) */
  y0: number;
}

/**
 * 底坞装备网格(v4):张数 ≤ 每排上限(平时 4 / Boss 3)时单排,多于上限时两排;
 * 两排满(8 / 6)之外的收进 +N 芯片(芯片跟在末排末张之后,占位计入该排宽度)。
 * `rowsMax = 1` 时退化成 equipRowLayout 的口径(旧坞 48 高:y0 = 6)。
 */
export function equipGridLayout(n: number, boss: boolean, zoneW: number, dockH: number, rowsMax: number = 2): EquipGridLayout {
  const perRow = boss ? 3 : 4;
  const gap = 6;
  const rowGap = 6;
  const chipW = 30;
  const cardH = 36;
  const count = Math.max(0, n);
  const rows = count <= perRow ? 1 : Math.max(1, Math.min(rowsMax, 2));
  const cap = perRow * rows;
  const shown = Math.min(count, cap);
  const chip = count > cap;
  const hidden = count - shown;
  const cols = rows === 1 ? shown : perRow;
  const avail = zoneW - (chip ? chipW + gap : 0) - gap * Math.max(0, cols - 1);
  const cardW = cols > 0 ? Math.min(168, Math.max(64, Math.floor(avail / cols))) : 0;
  const gridH = rows * cardH + (rows - 1) * rowGap;
  const y0 = Math.max(0, Math.floor((dockH - gridH) / 4) * 2);
  return { shown, hidden, cardW, cardH, gap, chip, chipW, cols, rows, rowGap, y0 };
}

/** 胶囊条填充宽:frac 钳制 0..1;>0 时最小宽 = h 保胶囊头完整 */
export function barFillW(w: number, h: number, frac: number): number {
  const f = Math.min(1, Math.max(0, frac));
  return f <= 0 ? 0 : Math.max(h, w * f);
}
