/**
 * 布局台的**第二条数据通道**与草稿编解码(dev-only 纯函数层)。
 *
 * 分工:
 *  - `labModel.ts`  → `balance.json` 的 `menuLayout` 段(锚点/装饰字段);
 *  - `labSkin.ts`   → `balance.json` 的 `menuSkin` 段(换图/四边间距/显隐/图层名);
 *  - 本文件         → `viewTable.json` 的段(九宫格边距 + 主菜单表现参数),
 *                     以及布局台自身浮层的参数默认值与"草稿"的编解码。
 *
 * 为什么要写进 viewTable.json:Cocos 侧的九宫格边距是**运行时 inset**(SpriteFrame.clone 后写
 * insetLeft/Right/Top/Bottom),Web 侧则是 `drawNineUniform` 按源图短边自动推导。
 * 自动推导只有一端能用,另一端必须能显式标注 —— 于是布局台新增"边距"这一列,
 * 出口是 viewTable.json 的 `nineSlice` 段,`core/ViewTable.ts:borderOf()` 与这里共用
 * `resolveBorder()` 的同一公式(表内显式值优先,缺省回落短边 × factor)。
 *
 * 本文件不碰 DOM、不碰节点、不碰宿主存储。
 */

import { applyBalance, menuLayoutWarnings } from "../data/layoutMenu";
import { applyMenuSkin, snapshotMenuSkin, type MenuSkinTable } from "../data/menuSkin";
import { exportSkinJson, skinAssetKeys } from "./labSkin";
import { ALL_FIELDS, exportJson, readValues, type FieldValues } from "./labModel";

/**
 * 以九宫格绘制的菜单底板(可标注边距)—— 与 Web `drawMenu` 的 drawNineUniform 调用点逐一对应。
 * crest_echo / menu_title_plate / menu_strip_plate / menu_section_strip 走整图绘制,没有 inset 可标。
 */
export const MENU_NINE_KEYS: readonly string[] = [
  "menu_chip_plate",
  "menu_row_plate",
  "menu_row_plate_current",
  "menu_set_plate",
  "menu_set_plate_selected",
  "menu_note_plate",
];

/** 含义:九宫格边距取值域(越界回退默认).单位:源图 px.依据:菜单底板源图短边 26~146.出处:Phase 2 边距标注 */
export const NINE_BORDER_RANGE: readonly [number, number] = [1, 512];

/** 含义:边距自动推导的短边占比默认值.单位:0-1.依据:与 Web drawNineUniform 同源.出处:viewTable.nineSlice.factor */
export const NINE_FACTOR_DEFAULT = 0.35;

/** 含义:边距自动推导的系数取值域.单位:0-1.依据:drawNineUniform 的可用区间.出处:本表立项 */
export const NINE_FACTOR_RANGE: readonly [number, number] = [0.05, 0.5];

/**
 * 浮层自身参数(手柄尺寸/拾取半径/配色/虚拟屏高档位)。
 * 这些是"数据与画面有关联"的值,按 DESIGN-VALUES-SPEC 进 viewTable.json 的 `lab` 段;
 * 本对象只是**默认值事实源**,Cocos 侧 `core/ViewTable.ts` 的回落值直接引用它。
 */
export interface LabOverlayParams {
  /** 未选中手柄边长.单位:设计 px */
  handleSize: number;
  /** 选中/悬停手柄边长.单位:设计 px */
  handleSizeActive: number;
  /** 拾取半径(沿绑定轴).单位:设计 px */
  grabPx: number;
  /** 自由轴容差 = grabPx × 本值.单位:倍率 */
  offAxisFactor: number;
  /** 浮层标签字号.单位:设计 px */
  labelPx: number;
  /** 描边线宽.单位:设计 px */
  lineWidth: number;
  /** 参考带虚线段长/间隔.单位:设计 px */
  dashOn: number;
  dashOff: number;
  /** 面板宽(宿主侧 DOM 面板用).单位:CSS px */
  panelW: number;
  /** 虚拟屏高快捷档位.单位:设计 px */
  screenHeights: number[];
  /** 虚拟屏高输入域.单位:设计 px */
  minScreenH: number;
  maxScreenH: number;
  /** Shift 拖拽/微调的量化步长.单位:设计 px */
  coarseStep: number;
  /** 布局框/命中框/参考带/标签四路显隐的默认值 */
  showDefault: { layout: boolean; hit: boolean; guide: boolean; labels: boolean };
  /** 浮层配色(hex 字面量,与 Web 布局台同一套) */
  colors: { layout: string; hit: string; guide: string; sel: string; drag: string };
}

/** 含义:浮层默认参数.单位:见各字段.依据:Web 布局台实测值原样搬.出处:Phase 2 */
export const LAB_OVERLAY_DEFAULTS: LabOverlayParams = {
  handleSize: 8,
  handleSizeActive: 11,
  grabPx: 9,
  offAxisFactor: 1.6,
  labelPx: 11,
  lineWidth: 1,
  dashOn: 4,
  dashOff: 3,
  panelW: 430,
  screenHeights: [996, 1246],
  minScreenH: 700,
  maxScreenH: 1400,
  coarseStep: 10,
  showDefault: { layout: true, hit: true, guide: true, labels: true },
  colors: { layout: "#ffd76a", hit: "#5ac8fa", guide: "#ff5ce1", sel: "#ffffff", drag: "#4dffc8" },
};

/**
 * 主菜单视图的表现参数(Cocos 侧 MenuLayoutView 读;几何仍由 menuLayoutPure 派生)。
 * 单位:字号 = 设计 px,透明度/系数 = 无量纲,颜色 = hex/rgba 字面量。
 */
export interface MenuPresentationParams {
  /** 标题横幅描金文字色 */
  titleColor: string;
  /** 次要文字色(赛季行/筹码/条文) */
  subColor: string;
  /** 说明板正文色 */
  noteColor: string;
  /** 标题字号 / 次级字号 / 正文号.单位:设计 px */
  titlePx: number;
  subPx: number;
  bodyPx: number;
  /** 含义:Label 盒顶相对 Web 基线的上抬系数(盒高 = 字号 × 1.25).单位:倍率.依据:系统字体基线近似.出处:Phase 2 表驱动视图 */
  baselineLift: number;
  /** 含义:标题横幅右侧右对齐文字列的盒宽.单位:设计 px.依据:赛季行与体力行同宽.出处:Phase 2 表驱动视图 */
  rightColumnW: number;
  /** 含义:筹码图标绘制高(宽走 deco.chipIconW).单位:设计 px.依据:icon_gold 32 方图.出处:Phase 2 表驱动视图 */
  chipIconH: number;
  /** 无贴图时的代码底板填充色(缺图回退形状,与 Web 描形同源) */
  fallbackPlate: string;
  /** 无贴图时的代码底板描边色 */
  fallbackStroke: string;
  /** 选中行/选中卡的高亮描边 alpha(0-255) */
  highlightAlpha: number;
  /** 红点填充色 */
  dotColor: string;
  /** 关卡行"当前章"用高亮行板 */
  currentRowPlate: string;
}

/** 含义:主菜单表现默认值.单位:见各字段.依据:Web drawMenu 内联色与字阶.出处:Phase 2 */
export const MENU_PRESENTATION_DEFAULTS: MenuPresentationParams = {
  titleColor: "#FFD76A",
  subColor: "#8F9BB3",
  noteColor: "#C8C2B1",
  titlePx: 22,
  subPx: 13,
  bodyPx: 14,
  baselineLift: 0.82,
  rightColumnW: 200,
  chipIconH: 15,
  fallbackPlate: "rgba(19,24,38,0.92)",
  fallbackStroke: "rgba(255,255,255,0.14)",
  highlightAlpha: 180,
  dotColor: "#FF5A6E",
  currentRowPlate: "menu_row_plate_current",
};

/** 布局台在 viewTable 通道里可编辑的状态(全部对齐默认值,只导 dirty) */
export interface LabTableState {
  factor: number;
  /** 资产键 → 九宫格边距(未编辑的键不入表) */
  borders: Record<string, number>;
  /** 主菜单表现参数里被编辑过的标量(数值项) */
  menu: Record<string, number>;
}

export function defaultTableState(): LabTableState {
  return { factor: NINE_FACTOR_DEFAULT, borders: {}, menu: {} };
}

/** 从已加载的 viewTable.json 文档水合布局台状态(只认 MENU_NINE_KEYS,其余键原样保留在文档里) */
export function tableStateFromDoc(doc: Record<string, unknown> | null): LabTableState {
  const st = defaultTableState();
  const nine = doc && (doc.nineSlice as Record<string, unknown> | undefined);
  if (nine && typeof nine === "object") {
    const f = Number((nine as Record<string, unknown>).factor);
    if (Number.isFinite(f) && f >= NINE_FACTOR_RANGE[0] && f <= NINE_FACTOR_RANGE[1]) st.factor = f;
    const keys = (nine as Record<string, unknown>).keys;
    if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      for (const k of MENU_NINE_KEYS) {
        const v = Number((keys as Record<string, unknown>)[k]);
        if (Number.isFinite(v) && v > 0) st.borders[k] = Math.floor(clampRange(v, NINE_BORDER_RANGE));
      }
    }
  }
  const menu = doc && (doc.menu as Record<string, unknown> | undefined);
  if (menu && typeof menu === "object" && !Array.isArray(menu)) {
    for (const [k, def] of Object.entries(MENU_PRESENTATION_DEFAULTS as unknown as Record<string, number | string>)) {
      if (typeof def !== "number") continue;
      const v = Number((menu as Record<string, unknown>)[k]);
      if (Number.isFinite(v)) st.menu[k] = v;
    }
  }
  return st;
}

const clampRange = (v: number, [min, max]: readonly [number, number]): number => Math.min(max, Math.max(min, v));

/** 编辑器输入钳制:非法回退默认(自动推导 = 0 表示"不入表"),越界钳到边界 */
export function clampBorder(st: LabTableState, key: string, v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return autoBorder(st, key, 0, 0);
  return Math.floor(clampRange(n, NINE_BORDER_RANGE));
}

/**
 * 边距解析的**唯一公式**(与 `core/ViewTable.ts:borderOf()` 同一实现):
 * 表内显式值优先,缺省回落 `floor(min(srcW,srcH) × factor)`;源图尺寸未知则 0 = 不入表。
 */
export function resolveBorder(explicit: number, srcW: number, srcH: number, factor: number): number {
  const v = Number(explicit);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  if (!(srcW > 0) || !(srcH > 0) || !(factor > 0)) return 0;
  return Math.floor(Math.min(srcW, srcH) * factor);
}

export function borderFor(st: LabTableState, key: string, srcW: number, srcH: number): number {
  return resolveBorder(Number(st.borders[key]), srcW, srcH, st.factor);
}

/** 短边 × factor 的自动推导(srcW/srcH 未知时返回 0 = 不入表) */
export function autoBorder(st: LabTableState, _key: string, srcW: number, srcH: number): number {
  return resolveBorder(0, srcW, srcH, st.factor);
}

/** viewTable 段的白名单导出:只带 dirty,空段省略;全空 → "{}" */
export function exportViewTableJson(st: LabTableState): string {
  const out: Record<string, unknown> = {};
  const nine: Record<string, unknown> = {};
  if (Math.abs(st.factor - NINE_FACTOR_DEFAULT) > 1e-9) nine.factor = Number(st.factor.toFixed(4));
  const keys: Record<string, number> = {};
  for (const k of MENU_NINE_KEYS) {
    const v = Number(st.borders[k]);
    if (Number.isFinite(v) && v > 0) keys[k] = Math.floor(v);
  }
  if (Object.keys(keys).length) nine.keys = keys;
  if (Object.keys(nine).length) out.nineSlice = nine;

  const menu: Record<string, number> = {};
  for (const [k, v] of Object.entries(st.menu)) {
    const def = (MENU_PRESENTATION_DEFAULTS as unknown as Record<string, number | string>)[k];
    if (typeof def !== "number" || !Number.isFinite(v)) continue;
    if (Math.abs(v - def) > 1e-9) menu[k] = Number(v.toFixed(4));
  }
  if (Object.keys(menu).length) out.menu = menu;

  return JSON.stringify(out, null, 2);
}

/** 把布局台导出的段并进现有 viewTable.json 文本(未知段原样保留;坏 JSON 抛出给宿主提示) */
export function mergeViewTableDoc(baseText: string | null, patchText: string): string {
  const base = baseText ? (JSON.parse(baseText) as Record<string, unknown>) : {};
  const patch = JSON.parse(patchText) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [section, raw] of Object.entries(patch)) {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && out[section] && typeof out[section] === "object" && !Array.isArray(out[section])) {
      const cur = out[section] as Record<string, unknown>;
      const next = { ...cur };
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        // nineSlice.keys 这类"键→数"的子表按键合并,其余段整字段覆盖
        if (v && typeof v === "object" && !Array.isArray(v) && cur[k] && typeof cur[k] === "object" && !Array.isArray(cur[k])) {
          next[k] = { ...(cur[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
        } else next[k] = v;
      }
      out[section] = next;
    } else out[section] = raw;
  }
  return JSON.stringify(out, null, 4);
}

/* ==================== 草稿(布局台工作态) ==================== */

export const LAB_DRAFT_VERSION = 1;

/** 草稿在宿主本地存储里的键(Web 侧 localStorage 与 Cocos 侧 sys.localStorage 同名) */
export const LAB_DRAFT_STORAGE_KEY = "lab.menuLayout.draft";

export interface LabDraft {
  v: number;
  logicalH: number;
  vals: FieldValues;
  skin: MenuSkinTable;
  table: LabTableState;
}

/** 编码草稿:三段配置 + 虚拟屏高;文本可直接落宿主存储 */
export function encodeDraft(d: Omit<LabDraft, "v">): string {
  return JSON.stringify({ v: LAB_DRAFT_VERSION, ...d });
}

/** 解码草稿:坏文本/版本不符/字段缺失一律返回 null(宿主按"无草稿"处理) */
export function decodeDraft(text: string | null): Omit<LabDraft, "v"> | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Number(o.v) !== LAB_DRAFT_VERSION) return null;
  const vals = o.vals as Partial<FieldValues> | undefined;
  if (!vals || typeof vals.origin !== "object" || typeof vals.deco !== "object") return null;
  const out: Omit<LabDraft, "v"> = {
    logicalH: Number.isFinite(Number(o.logicalH)) ? Number(o.logicalH) : 996,
    vals: { origin: { ...(vals.origin as Record<string, number>) }, deco: { ...(vals.deco as Record<string, number>) } },
    skin: (o.skin && typeof o.skin === "object" ? (o.skin as MenuSkinTable) : snapshotMenuSkin()),
    table: (o.table && typeof o.table === "object" ? (o.table as LabTableState) : defaultTableState()),
  };
  return out;
}

/**
 * 草稿回灌:走**加载器**通道(applyBalance / applyMenuSkin),所以脏值与越界值同样告警回落,
 * 不会出现"草稿里存了个坏数、刷新后画面与导出对不上"。返回被接受的字段数。
 */
export function restoreDraft(d: Omit<LabDraft, "v"> | null): number {
  if (!d) return 0;
  const cfg: Record<string, unknown> = { origin: d.vals.origin, deco: d.vals.deco };
  applyBalance(cfg);
  applyMenuSkin(d.skin as unknown as Record<string, unknown>);
  return ALL_FIELDS.length;
}

/** 当前完整工作态(布局字段 + 皮肤 + viewTable 段 + 虚拟屏高),供宿主落草稿 */
export function currentDraft(logicalH: number, skin: MenuSkinTable, table: LabTableState): Omit<LabDraft, "v"> {
  return { logicalH, vals: readValues(), skin, table };
}

/* ==================== 三通道合并导出 ==================== */

export interface BundleOptions {
  /** true = 连未改动字段一起导(从零建一档配置) */
  all?: boolean;
}

/**
 * 两个文件的最终粘贴文本:
 *  - `balanceText`  = { menuLayout?, menuSkin? }
 *  - `viewTableText` = { nineSlice?, menu? }
 * 皮肤段为 "{}" 时省略(空皮肤 = 恒等)。坏 JSON 抛出。
 */
export function exportBundle(vals: FieldValues, skin: MenuSkinTable, table: LabTableState, opts: BundleOptions = {}): { balanceText: string; viewTableText: string } {
  const layout = JSON.parse(exportJson(vals, opts)) as { menuLayout?: unknown };
  const merged: Record<string, unknown> = {};
  if (layout.menuLayout) merged.menuLayout = layout.menuLayout;
  const skinJson = exportSkinJson(skin);
  if (skinJson.trim() !== "{}") merged.menuSkin = JSON.parse(skinJson);
  return {
    balanceText: JSON.stringify(merged, null, 2),
    viewTableText: exportViewTableJson(table),
  };
}

/** 复位后的实时快照(供"全部复位"按钮回显):加载器累计的越界告警一并给出 */
export function liveSnapshots(): { vals: FieldValues; skin: MenuSkinTable; warnings: string[] } {
  return { vals: readValues(), skin: snapshotMenuSkin(), warnings: [...menuLayoutWarnings] };
}

/** 结构树里出现过的全部资产键(换图下拉与边距列共用同一份清单) */
export function labAssetKeys(): string[] {
  return skinAssetKeys();
}
