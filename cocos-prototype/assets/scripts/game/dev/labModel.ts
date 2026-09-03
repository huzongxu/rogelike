/**
 * 布局台数据模型(dev-only)—— Web 侧 `src/dev/layoutWorkbench.ts` 与 Cocos 侧
 * `assets/scripts/dev/LayoutLab.ts` **共用**的纯函数层。
 *
 * 本文件**不碰 DOM、不碰节点、不碰游戏实例**:输入 `menuLayoutPure` 的产物,
 * 输出"手柄/参考框/导出 JSON"。之所以把锚点计算独立出来单测:手柄坐标错一位,布局台就会把
 * 用户引向"拖对了字段、摆错了位置",而这正是本项目要消灭的失败模式(说不清往左一点)。
 *
 * Phase 2 起这里是唯一实现:两端各自只留"把浮层画出来 + 把指针事件转成设计 px"的宿主层,
 * 手柄枚举/钳制/拾取/导出全部走本文件,所以"手柄数与字段数"在两端天然相等。
 *
 * 手柄设计法则(与项目布局硬约束一致 —— 几何是派生的,不能拖到绝对坐标):
 *  1. **手柄位置 = 该字段直接决定的那条边/那条线的坐标**(雅可比为 1);
 *  2. 一个字段只给一条边装手柄,选"随该字段单调移动"的那条(底锚块的高度绑**顶缘**,因为底缘恒等);
 *  3. 雅可比 ≠ 1 时在 `bind.scale` 里写明倍率,并显示在手柄标签上(`endlessW` ×2、`setGap` ×n);
 *  4. 锚点依赖**文字测量**的字段(筹码宽/星数/钻石图标/通关勾…)一律不做手柄,只给面板数值框 ——
 *     假锚点比没有锚点更坏。
 */

import {
  MENU_LAYOUT_DEFAULTS,
  MENU_LAYOUT_DECO_RANGE,
  MENU_LAYOUT_RANGE,
  applyBalance,
  setMenuLayoutDeco,
  setMenuLayoutOrigin,
  snapshotMenuLayout,
} from "../data/layoutMenu";
import type { MenuLayoutDeco, MenuLayoutOrigin } from "../data/layoutMenu";
import type { MenuLayout, MenuRect } from "../ui/menuLayout";

export type LayoutSection = "origin" | "deco";
export type FieldId = string; // `origin.pad` / `deco.banY`

export interface FieldValues {
  origin: Record<string, number>;
  deco: Record<string, number>;
}

/** 声明顺序 = 面板顺序 = 导出 JSON 顺序(与规范表逐字段对齐,便于肉眼 diff) */
export const ORIGIN_KEYS = Object.keys(MENU_LAYOUT_DEFAULTS.origin) as (keyof MenuLayoutOrigin)[];
export const DECO_KEYS = Object.keys(MENU_LAYOUT_DEFAULTS.deco) as (keyof MenuLayoutDeco)[];

/** 全字段清单(origin 37 + deco 88 = 125 项),面板按此渲染 */
export const ALL_FIELDS: { id: FieldId; section: LayoutSection; key: string }[] = [
  ...ORIGIN_KEYS.map((key) => ({ id: `origin.${key}`, section: "origin" as LayoutSection, key })),
  ...DECO_KEYS.map((key) => ({ id: `deco.${key}`, section: "deco" as LayoutSection, key })),
];

export function rangeOf(section: LayoutSection, key: string): [number, number] {
  if (section === "origin") return MENU_LAYOUT_RANGE[key as keyof MenuLayoutOrigin] ?? [-1e9, 1e9];
  return MENU_LAYOUT_DECO_RANGE;
}

export function defaultValueOf(section: LayoutSection, key: string): number {
  const src: Record<string, number> = (section === "origin" ? MENU_LAYOUT_DEFAULTS.origin : MENU_LAYOUT_DEFAULTS.deco) as unknown as Record<string, number>;
  return src[key] ?? 0;
}

/**
 * 步进:整数字段 ±1;非整数字段(角深系数)按 0.05 走。
 * 由默认值推导,避免在 dev 层再抄一份字段白名单。
 */
export function stepOf(section: LayoutSection, key: string): number {
  return Number.isInteger(defaultValueOf(section, key)) ? 1 : 0.05;
}

/** 当前生效值(内存表快照 = balance.json 覆盖后的结果) */
export function readValues(): FieldValues {
  const t = snapshotMenuLayout();
  return {
    origin: { ...(t.origin as unknown as Record<string, number>) },
    deco: { ...(t.deco as unknown as Record<string, number>) },
  };
}

/**
 * 表里的实时字段(布局产物没带出来的那几个)。
 * 手柄倍率与列表下界都依赖它们,写死默认值会让"拖对了字段、算错了力度"。
 */
export function liveOrigin<K extends keyof MenuLayoutOrigin>(key: K): number {
  return snapshotMenuLayout().origin[key];
}

/** 列表可用下界 = spreadRows 的上界(menuLayoutPure 只把它用于求行高,不返回) */
export function listBottomY(L: MenuLayout): number {
  return L.endlessBtn.y - liveOrigin("endlessListGap");
}

/**
 * 编辑器取值钳制:非法输入回退默认,越界**钳到边界**。
 *
 * 注意与加载器 `applyBalance` 的口径**故意不同**:加载器越界回退默认(配置写错不静默生效),
 * 编辑器钳到边界,是为了让"布局台导出的数"永远能被刷新接受,不会出现拖到位、刷新弹回去。
 */
export function clampValue(section: LayoutSection, key: string, v: number): number {
  if (!Number.isFinite(v)) return defaultValueOf(section, key);
  const [min, max] = rangeOf(section, key);
  const step = stepOf(section, key);
  const snapped = Math.round(Math.min(max, Math.max(min, v)) / step) * step;
  return Number(snapped.toFixed(4)) + 0; // 去掉 -0 与浮点尾噪
}

/** 写回内存表(即时生效;视图下一帧重算布局即看到),并记录草稿 */
export function applyValue(section: LayoutSection, key: string, v: number): number {
  const clamped = clampValue(section, key, v);
  if (section === "origin") setMenuLayoutOrigin({ [key]: clamped } as Partial<MenuLayoutOrigin>);
  else setMenuLayoutDeco({ [key]: clamped } as Partial<MenuLayoutDeco>);
  return clamped;
}

/** 单字段复位默认 */
export function resetField(section: LayoutSection, key: string): number {
  return applyValue(section, key, defaultValueOf(section, key));
}

/** 全表复位(走加载器的默认分支,与"删掉 balance.json 里的 menuLayout 段"等价) */
export function resetAll(): void {
  applyBalance({});
}

const EPS = 1e-6;

/** 与规范表默认值不同的字段(= 需要导出/粘进 balance.json 的部分) */
export function dirtyFields(vals: FieldValues): FieldId[] {
  const out: FieldId[] = [];
  for (const f of ALL_FIELDS) {
    if (Math.abs(vals[f.section][f.key] - defaultValueOf(f.section, f.key)) > EPS) out.push(f.id);
  }
  return out;
}

export interface ExportOptions {
  /** true = 连未改动字段一起导出(给"从零建一档配置"用);默认只导 dirty */
  all?: boolean;
}

/** 生成可直接并入 balance.json 的 `menuLayout` 段 */
export function exportJson(vals: FieldValues, opts: ExportOptions = {}): string {
  const dirty = new Set(opts.all ? ALL_FIELDS.map((f) => f.id) : dirtyFields(vals));
  const pick = (section: LayoutSection, keys: string[]): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const key of keys) if (dirty.has(`${section}.${key}`)) o[key] = vals[section][key];
    return o;
  };
  const origin = pick("origin", ORIGIN_KEYS);
  const deco = pick("deco", DECO_KEYS);
  const menuLayout: Record<string, unknown> = {};
  if (Object.keys(origin).length) menuLayout.origin = origin;
  if (Object.keys(deco).length) menuLayout.deco = deco;
  return JSON.stringify({ menuLayout }, null, 2);
}

/* ==================== 手柄与参考框 ==================== */

export interface HandleBind {
  section: LayoutSection;
  key: string;
  /** 1 = 向右/向下拖增大;−1 = 向左/向上拖增大(由 menuLayoutPure 的公式定,单测锁死) */
  sign: 1 | -1;
  /** 倍率:字段变化 = Δpx × scale × sign。≠1 时显示在手柄标签上 */
  scale?: number;
}

export interface Handle {
  id: FieldId;
  group: string;
  label: string;
  /** 设计 px;与 drawMenu 同一套派生坐标 */
  x: number;
  y: number;
  axis: "x" | "y";
  bind: HandleBind;
}

/** 手柄构建上下文:布局本身给不了的信息(存档态、视口高) */
export interface HandleContext {
  /** 设计空间宽(Cocos 与 Web 同为 560) */
  w: number;
  /** 设计空间高 */
  h: number;
  /** 每行当前是否显示补星钮(drawMenu 的 makeup 判定);决定 rightX 与补星手柄 */
  makeupRows: boolean[];
  /** 当前出战套组 id(金星标只画在选中卡上 → 手柄也只挂那张卡) */
  selectedSet: string | null;
}

export interface Guide {
  label: string;
  rect: MenuRect;
  /** layout = 布局块矩形(黄);hit = 命中矩形(青);guide = 派生参考线/带(品红虚线) */
  kind: "layout" | "hit" | "guide";
  /** 需要人工关注的偏差说明(渲染成角标) */
  warn?: string;
}

/** 同一 group 同轴的手柄在"自由轴"上错开,叠在一条线上的锚点才点得中(绑定轴坐标绝不动) */
const JITTER = 13;

export function buildHandles(L: MenuLayout, ctx: HandleContext): Handle[] {
  const d = L.d;
  const out: Handle[] = [];
  const counters = new Map<string, number>();
  const add = (group: string, axis: "x" | "y", anchor: number, marker: number, bind: HandleBind): void => {
    const n = counters.get(`${group}${axis}`) ?? 0;
    counters.set(`${group}${axis}`, n + 1);
    const free = marker + n * JITTER;
    const scaleTag = bind.scale && bind.scale !== 1 ? ` ×${bind.scale}` : "";
    out.push({
      id: `${bind.section}.${bind.key}`,
      group,
      axis,
      x: axis === "y" ? free : anchor,
      y: axis === "y" ? anchor : free,
      label: `${axis === "x" ? "↔" : "↕"}${bind.key}${scaleTag}`,
      bind,
    });
  };
  const origin = (key: keyof MenuLayoutOrigin, sign: 1 | -1, scale?: number): HandleBind => ({ section: "origin", key, sign, scale });
  const deco = (key: keyof MenuLayoutDeco, sign: 1 | -1, scale?: number): HandleBind => ({ section: "deco", key, sign, scale });

  const rows = L.rows;
  const row0 = rows[0];
  const m = L.rowMargin;

  /* --- 全局边距:行左缘 = pad --- */
  if (row0) add("全局边距", "x", L.pad, row0.y + L.rowH / 2, origin("pad", 1));

  /* --- 标题横幅 --- */
  add("标题横幅", "y", d.ban.y, d.ban.x + 40, deco("banY", 1));
  add("标题横幅", "y", d.ban.y + d.ban.h, d.ban.x + 60, deco("banH", 1));
  add("标题横幅", "x", d.ban.x, d.ban.y + d.ban.h / 2, deco("banInset", -1));
  add("纹章", "x", d.crest.x, d.crest.y + d.crest.h / 2, deco("crestOffX", 1));
  add("纹章", "y", d.crest.y, d.crest.x + d.crest.w / 2, deco("crestOffY", 1));
  add("纹章", "x", d.crest.x + d.crest.w, d.crest.y + d.crest.h / 2 + 8, deco("crestW", 1));
  add("纹章", "y", d.crest.y + d.crest.h, d.crest.x + d.crest.w / 2 + 8, deco("crestH", 1));
  add("标题文字", "x", d.titlePos.x, d.titlePos.y, deco("titleOffX", 1));
  add("标题文字", "y", d.titlePos.y, d.titlePos.x + 24, deco("titleOffY", 1));
  add("赛季行", "x", d.seasonPos.x, d.seasonPos.y, deco("seasonInset", -1));
  add("赛季行", "y", d.seasonPos.y, d.seasonPos.x - 30, deco("seasonOffY", 1));
  add("体力钻石行", "y", d.row2Y, d.seasonPos.x - 12, deco("row2OffY", 1));

  /* --- 货币条 --- */
  add("货币条", "y", d.strip.y, d.strip.x + 30, deco("stripY", 1));
  add("货币条", "y", d.strip.y + d.strip.h, d.strip.x + 50, deco("stripH", 1));
  // chipY = stripY + (stripH − chipH)/2 → 下缘对 chipH 的雅可比是 ½,手柄须 ×2 才跟手
  add("筹码", "y", d.chipY + d.chipH, d.strip.x + 70, deco("chipH", 1, 2)); // 筹码中心恒等 → 绑下缘
  d.chipXs.forEach((x, i) => add("筹码", "x", x, d.chipY + d.chipH / 2 + i * 2, deco(`chipX${i + 1}` as keyof MenuLayoutDeco, 1)));
  add("筹码", "x", d.chipXs[0] - d.chipSlide, d.chipY - 4, deco("chipSlide", -1));
  add("幻影筹码", "x", d.phRightX, d.chipY + d.chipH / 2, deco("phRightGap", -1));

  /* --- 幻影榜入口(顶缘/高/右锚宽) --- */
  add("幻影榜", "y", L.phantomBtn.y, L.phantomBtn.x + 20, origin("phantomY", 1));
  add("幻影榜", "y", L.phantomBtn.y + L.phantomBtn.h, L.phantomBtn.x + 40, origin("phantomH", 1));
  add("幻影榜", "x", L.phantomBtn.x, L.phantomBtn.y + L.phantomBtn.h / 2, origin("phantomAnchor", -1));

  /* --- 入口行 --- */
  const entryBtns = [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn];
  add("入口行", "y", L.entryY, entryBtns[0].x + entryBtns[0].w / 2, origin("entryY", 1));
  add("入口行", "y", L.entryY + L.entryH, entryBtns[0].x + entryBtns[0].w / 2 + 16, origin("entryH", 1));
  if (entryBtns[1]) {
    // x₁ = pad + entryW + entryGap,而 entryW 自身随 gap 缩小 → d x₁ / d gap = 1/n
    add("入口行", "x", entryBtns[1].x, L.entryY + L.entryH / 2, origin("entryGap", 1, liveOrigin("entryCount")));
  }

  /* --- 分区标题条 + 列表 --- */
  if (L.sectionH > 0) {
    add("分区标题", "y", L.stageHdrY, L.sectionX + 20, origin("stageHdrY", 1));
    add("分区标题", "y", L.stageHdrY + L.sectionH, L.sectionX + 40, origin("sectionH", 1));
    // 居中标题的裁切左缘 = (屏宽 − (条宽 − pad)) / 2,随 sectionTextPad 各半外扩 → ×2
    add("分区标题", "x", (ctx.w - (L.sectionW - d.sectionTextPad)) / 2, L.stageHdrY + L.sectionH / 2, deco("sectionTextPad", 1, 2));
    // hdrBand 只进"有标题条"那条 listY 公式:缺条时列表顶缘由 listYNoSection 决定,拖它画面不动
    add("关卡列表", "y", L.listY, L.pad + 44, origin("hdrBand", 1));
  } else {
    add("关卡列表", "y", L.listY, L.pad + 20, origin("listYNoSection", 1));
  }
  add("关卡列表", "y", listBottomY(L), L.pad + 68, origin("endlessListGap", -1));

  /* --- 关卡行内部 --- */
  if (row0) {
    const cy = row0.y + row0.h / 2;
    const c1 = Math.round(cy - d.rowC1Off);
    add("关卡行", "y", c1, row0.x + m + 20, deco("rowC1Off", -1));
    add("关卡行", "y", c1 + d.rowC2Gap, row0.x + m + 36, deco("rowC2Gap", 1));
    add("关卡行", "x", row0.x + m + d.rowTxOff, c1, deco("rowTxOff", 1));
    const noMakeupIdx = ctx.makeupRows.findIndex((v) => !v);
    const anchorRow = rows[Math.max(0, noMakeupIdx)] ?? row0;
    const reserve = noMakeupIdx >= 0 ? 0 : d.rowMakeupReserve;
    const rightX = anchorRow.x + anchorRow.w - m - d.rowRightInset - reserve;
    add("关卡行", "x", rightX, anchorRow.y + anchorRow.h / 2, deco("rowRightInset", -1));
    add("关卡行", "x", rightX - d.descClipPad, anchorRow.y + anchorRow.h / 2 + 12, deco("descClipPad", -1));
    add("头像徽章", "x", anchorRow.x + m + d.badgeOffX, cy - 6, deco("badgeOffX", 1));
    // 徽章垂直居中 → 下缘对 badgeSize 的雅可比是 ½
    add("头像徽章", "y", cy + d.badgeSize / 2, anchorRow.x + m + d.badgeOffX, deco("badgeSize", 1, 2));
  }
  const makeupIdx = ctx.makeupRows.findIndex((v) => v);
  if (makeupIdx >= 0) {
    const mk = L.makeupRect(rows[makeupIdx], m);
    add("补星钮", "x", mk.x, mk.y + mk.h / 2, deco("makeupW", -1)); // 右缘恒等(相对避让量)→ 绑左缘
    // makeupRect 垂直居中于行 → 下缘对 makeupH 的雅可比是 ½
    add("补星钮", "y", mk.y + mk.h, mk.x + mk.w / 2, deco("makeupH", 1, 2));
    add("补星钮", "x", mk.x + mk.w, mk.y + mk.h / 2 + 10, deco("makeupRightGap", -1));
  }
  /* --- 红点(圆心 = 宿主钮右上角内缩;宿主固定用"每日"入口) --- */
  {
    const host = L.dailyBtn;
    const dot = d.dotRect(host);
    add("红点", "x", dot.cx, dot.cy, deco("dotInsetX", -1));
    add("红点", "y", dot.cy, dot.cx - 10, deco("dotInsetY", 1));
    add("红点", "x", dot.cx + dot.r, dot.cy + 10, deco("dotR", 1));
  }

  /* --- 无限关主按钮 --- */
  {
    const b = L.endlessBtn;
    add("无限关钮", "y", b.y, b.x + 20, origin("endlessH", -1));
    if (L.sectionH > 0) {
      add("无限关钮", "y", b.y, b.x + 40, origin("endlessGapSet", -1));
      add("无限关钮", "y", b.y, b.x + 60, origin("endlessGapSet2", -1));
      add("套组区", "y", L.setHdrY, L.sectionX + 20, origin("setHdrGap", -1));
    } else {
      add("无限关钮", "y", b.y, b.x + 40, origin("endlessGapFlat", -1));
    }
    add("无限关钮", "x", b.x + b.w, b.y + b.h / 2, origin("endlessW", 1, 2)); // 居中 → 右缘每移 1px 宽变 2px
  }

  /* --- 尾块(贴底):套组卡 + 说明板 --- */
  {
    const setRowMarker = L.pad + 30;
    add("套组区", "y", L.setY, setRowMarker, origin("setH", -1)); // 卡底缘恒等 → 绑顶缘
    add("套组区", "y", L.setY + L.setH, setRowMarker + 16, origin("setGapY", -1));
    add("说明板", "y", d.note.y, setRowMarker + 32, origin("setDescH", -1)); // 说明板下缘恒等 → 绑顶缘
    add("说明板", "y", d.note.y, setRowMarker + 48, deco("noteTopOff", 1));
    add("说明板", "x", d.note.x, d.note.y + 12, deco("noteSlide", -1));
    add("说明板", "x", d.note.x + d.note.w, d.note.y + 12, deco("noteInsetX", 1));
    add("说明板", "y", d.noteRow1Y, d.noteX + 20, deco("noteRow1Off", 1));
    add("说明板", "y", d.noteRow1Y + d.noteRow2Gap, d.noteX + 36, deco("noteRow2Gap", 1));
    const c0 = L.setBtns[0];
    if (c0) {
      const bandTop = c0.y + L.setBand + d.setRow1Off; // 首行基线(drawMenu 同式)
      add("套组卡", "y", bandTop, c0.x + 20, deco("setRow1Off", 1));
      add("套组卡", "y", bandTop + d.setRow2Gap, c0.x + 36, deco("setRow2Gap", 1));
      add("套组卡", "x", c0.x + d.setColPadL, bandTop + 6, deco("setColPadL", 1));
      add("套组卡", "x", c0.x + c0.w - d.setColPadR, bandTop + 6, deco("setColPadR", -1));
      add("套组卡", "x", c0.x + d.setIconOffX, c0.y + c0.h / 2, deco("setIconOffX", 1));
      add("套组卡", "y", c0.y + c0.h / 2 - d.setIconOffY, c0.x + d.setIconOffX + 6, deco("setIconOffY", -1));
      const sel = L.setBtns.find((b) => b.id === ctx.selectedSet) ?? L.setBtns[L.setBtns.length - 1];
      if (sel) {
        add("套组卡", "x", sel.x + sel.w - d.setBadgeInsetX, sel.y + 4, deco("setBadgeInsetX", -1));
        add("套组卡", "y", sel.y - d.setBadgeOffY, sel.x + sel.w - d.setBadgeInsetX + 6, deco("setBadgeOffY", -1));
      }
    }
    const c1btn = L.setBtns[1];
    if (c1btn) {
      // x₁ = pad + setW + setGap,而 setW 随 gap 缩小 → d x₁ / d gap = 1/n
      add("套组区", "x", c1btn.x, L.setY + L.setH / 2, origin("setGap", 1, L.setBtns.length));
    }
  }

  /* --- 英雄展示带(接管原套组卡那一带;setBtns 几何仍是基线锚点,只是不再画卡) --- */
  {
    const band = L.heroBand;
    const port = L.heroPort;
    const btn = L.heroBtn;
    // 带高被 heroClearance 夹紧时拖 heroRise 画面不动 → 与 stageHdrY 同一口径:环境相关手柄
    if (band.h - L.setH < L.heroMaxRise) add("英雄展示带", "y", band.y, band.x + 30, origin("heroRise", -1));
    add("英雄展示带", "x", port.x, band.y + 10, deco("heroPadX", 1));
    add("英雄展示带", "x", port.x, band.y + 26, deco("heroPortOffX", 1));
    add("英雄展示带", "y", port.y, port.x + 42, deco("heroPortOffY", 1));
    add("更换英雄按钮", "x", btn.x, btn.y + 10, origin("heroBtnW", -1));
    // 按钮在带内垂直居中 → 顶缘对 btnH 的雅可比是 −½
    add("更换英雄按钮", "y", btn.y, btn.x + 20, origin("heroBtnH", -1, 2));
    add("英雄图文列", "y", L.heroRow1Y, L.heroTextX + 8, deco("heroNameOffY", 1));
    add("英雄图文列", "y", L.heroRow2Y, L.heroTextX + 24, deco("heroRow2Gap", 1));
    add("英雄图文列", "y", L.heroRow3Y, L.heroTextX + 40, deco("heroRow3Gap", 1));
  }

  return out;
}

/** 布局块矩形 + 派生参考线(全给渲染层;青色命中框与黄色布局框的差 = 项目的偏差账) */
export function buildGuides(L: MenuLayout, ctx: HandleContext): Guide[] {
  const d = L.d;
  const g: Guide[] = [];
  const rect = (label: string, kind: Guide["kind"], r: MenuRect, warn?: string): Guide => ({ label, kind, rect: r, warn });
  g.push(rect("ban 标题横幅", "layout", d.ban));
  g.push(rect("crest 纹章", "layout", d.crest));
  g.push(rect("strip 货币底板", "layout", d.strip));
  if (L.sectionH > 0) g.push(rect("分区标题条(整图等比)", "layout", { x: L.sectionX, y: L.stageHdrY, w: L.sectionW, h: L.sectionH }));
  g.push(rect("endless 主按钮", "layout", L.endlessBtn));
  g.push(
    rect(
      "phantom 热区",
      "hit",
      L.phantomBtn,
      "命中宽 = phantomAnchor,可见筹码宽由文字测量定——已拍板保留宽热区(有意的大触控区)"
    )
  );
  const entryNames: [string, MenuRect][] = [
    ["入口 委托", L.commissionBtn],
    ["入口 扭蛋", L.gachaBtn],
    ["入口 天赋", L.talentBtn],
    ["入口 通行证", L.passBtn],
    ["入口 每日", L.dailyBtn],
    ["入口 升级", L.gearupBtn],
  ];
  for (const [name, r] of entryNames) g.push(rect(name, "layout", r));
  for (const r of L.rows) g.push(rect(`行 #${r.id}`, "layout", r));
  for (const b of L.setBtns) g.push(rect(`套组 ${b.id}`, "layout", b));
  g.push(rect("note 说明板", "layout", d.note));
  g.push(rect("heroBand 英雄展示带", "layout", L.heroBand));
  g.push(rect("heroPort 立绘盒", "layout", L.heroPort));
  g.push(rect("heroBtn 更换英雄按钮", "hit", L.heroBtn));
  /* 派生参考 */
  g.push(rect("列表顶缘 listY", "guide", { x: 0, y: L.listY, w: ctx.w, h: 0 }));
  g.push(rect("列表可用下界", "guide", { x: 0, y: listBottomY(L), w: ctx.w, h: 0 }));
  const row0 = L.rows[0];
  if (row0) {
    g.push(
      rect(`行净空带 rowMargin=${L.rowMargin}`, "guide", {
        x: row0.x + L.rowMargin,
        y: row0.y,
        w: row0.w - L.rowMargin * 2,
        h: row0.h,
      })
    );
  }
  if (L.sectionH > 0) g.push(rect("setHdrY 套组标题带", "guide", { x: 0, y: L.setHdrY, w: ctx.w, h: L.sectionH }));
  const set0 = L.setBtns[0];
  if (set0) {
    g.push(rect(`setBand=${L.setBand}(卡贴边上带)`, "guide", { x: set0.x, y: set0.y, w: set0.w, h: L.setBand }));
    g.push(rect("卡贴边下带", "guide", { x: set0.x, y: set0.y + set0.h - L.setBand, w: set0.w, h: L.setBand }));
  }
  g.push(rect(`noteBand=${L.noteBand}`, "guide", { x: d.note.x, y: d.note.y, w: d.note.w, h: L.noteBand }));
  g.push(rect(`noteX=${d.noteX} noteMaxW=${Math.round(d.noteMaxW)}`, "guide", { x: d.noteX, y: d.note.y, w: d.noteMaxW, h: d.note.h }));
  g.push(rect(`noteCap=${d.noteCap}(带厚下限)`, "guide", { x: d.note.x, y: d.note.y, w: d.noteCap * 2, h: d.note.h }));
  const makeupIdx = ctx.makeupRows.findIndex((v) => v);
  if (makeupIdx >= 0) {
    const r = L.rows[makeupIdx];
    // 命中与绘制同源:补星命中读 L.makeupRect(提交3a 已拍板统一)
    g.push(rect("makeupRect 补星钮", "guide", L.makeupRect(r, L.rowMargin)));
  }
  return g;
}

/**
 * 指针 → 手柄拾取(纯函数;Web 浮层与 Cocos 节点热区共用)。
 * 只沿**绑定轴**判定:手柄在自由轴上的错开不代表"更接近该字段"。
 * `grab` = 绑定轴抓取半径(设计 px),`offAxisFactor` = 自由轴容差倍率,两者都来自 viewTable 的 `lab` 段。
 */
export function pickHandle(handles: Handle[], x: number, y: number, grab: number, offAxisFactor = 1.6): Handle | null {
  const offLimit = grab * offAxisFactor;
  let best: Handle | null = null;
  let bestD = grab;
  for (const h of handles) {
    const dx = Math.abs(h.x - x);
    const dy = Math.abs(h.y - y);
    const d = h.axis === "x" ? dx : dy;
    const off = h.axis === "x" ? dy : dx;
    if (d <= bestD && off <= offLimit) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** 拖动 → 新字段值(纯函数;钳到取值域并吸附步进) */
export function dragValue(h: Handle, dpx: number, dpy: number, cur: number): number {
  const along = h.axis === "x" ? dpx : dpy;
  return clampValue(h.bind.section, h.bind.key, cur + along * h.bind.sign * (h.bind.scale ?? 1));
}

/** 方向键微调:steps 为"格数"(一格 = stepOf) */
export function nudgeValue(h: Handle, steps: number, cur: number): number {
  const step = stepOf(h.bind.section, h.bind.key);
  return dragValue(h, steps * step, steps * step, cur);
}

/* ==================== 文档说明(零重复:直接从 CONFIG-TABLES.md 解析) ==================== */

export interface FieldDoc {
  def: string;
  range: string;
  desc: string;
  group: string;
}

/** deco 前缀 → 区块名:文档缺失/改版时的兜底分组 */
const DECO_GROUP_PREFIXES: [string, string][] = [
  ["ban", "标题横幅"],
  ["crest", "标题横幅 · 纹章"],
  ["title", "标题横幅 · 标题"],
  ["season", "标题横幅 · 赛季行"],
  ["row2", "标题横幅 · 体力钻石行"],
  ["gem", "标题横幅 · 钻石图标"],
  ["energy", "标题横幅 · 体力钻石行"],
  ["strip", "货币条"],
  ["chip", "货币条 · 筹码"],
  ["ph", "货币条 · 幻影筹码"],
  ["row", "关卡行"],
  ["makeup", "关卡行 · 补星钮"],
  ["badge", "关卡行 · 徽章"],
  ["check", "关卡行 · 通关勾"],
  ["star", "关卡行 · 星数"],
  ["desc", "关卡行"],
  ["dot", "红点"],
  ["section", "分区标题"],
  ["list", "分区标题"],
  ["set", "套组卡"],
  ["tag", "套组卡 · 赛季标记"],
  ["note", "说明板"],
  ["hero", "英雄展示带"],
];

/** 按声明顺序的最长前缀匹配(故 chipX* 归"筹码"、chipSlide 亦同;row2OffY 必须排在 row* 前) */
export function decoGroupOf(key: string): string {
  for (const [prefix, group] of DECO_GROUP_PREFIXES) if (key.startsWith(prefix)) return group;
  return "其他";
}

const TOKEN_SRC = /`(\w+)`\s*=\s*(-?[\d.]+)/;

/** deco 表单元格 → 逐字段说明;每次新建带 g 的正则,避免共享 lastIndex 状态 */
function decoTokens(cell: string): { key: string; label: string }[] {
  const re = new RegExp(TOKEN_SRC.source, "g");
  const keys = [...cell.matchAll(re)].map((mt) => mt[1]);
  const label = cell.replace(re, "").trim();
  return keys.map((key) => ({ key, label }));
}

/**
 * 解析 `docs/CONFIG-TABLES.md` 的 menuLayout 两张表 → 逐字段说明(默认/范围/备注/区块)。
 *
 * 布局台的 tooltip 直接吃文档,不再抄第三份数;解析失败(文档改结构/取不到)返回空表,
 * 面板会退化成"只有默认值与取值域",不报错、不阻塞。
 */
export function parseFieldDocs(md: string): Map<FieldId, FieldDoc> {
  const map = new Map<FieldId, FieldDoc>();
  const start = md.indexOf("## menuLayout");
  if (start < 0) return map;
  const block = md.slice(start, md.indexOf("\n## ", start + 1) > 0 ? md.indexOf("\n## ", start + 1) : md.length);
  const rows = block.split("\n").filter((line) => line.trim().startsWith("|") && !line.includes("---|"));
  for (const line of rows) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2 || cells[0] === "字段" || cells[0] === "区块") continue;
    if (cells.length >= 4 && !cells[1].includes("`")) {
      // origin 表:| 字段 | 默认 | 范围 | 说明 |,一行可并排多字段("entryH / entryY")
      const keys = cells[0].split("/").map((s) => s.trim()).filter(Boolean);
      const defs = cells[1].split("/").map((s) => s.trim());
      const ranges = cells[2].split("/").map((s) => s.trim());
      const descs = cells[3].split("/").map((s) => s.trim());
      keys.forEach((k, i) => {
        if (!(ORIGIN_KEYS as string[]).includes(k)) return;
        map.set(`origin.${k}`, {
          def: defs[i] ?? defs[0] ?? "",
          range: ranges[i] ?? ranges[0] ?? "",
          desc: descs.length === keys.length ? descs[i] : cells[3],
          group: "origin · 锚点",
        });
      });
      continue;
    }
    // deco 表:| 区块 | `key`=默认 … |(整段文案同时充当 tooltip)
    const group = cells[0];
    const body = cells.slice(1).join(" ");
    for (const chunk of body.split("·")) {
      const tokens = decoTokens(chunk);
      if (!tokens.length) continue;
      const sub = tokens[0].label;
      for (const { key: k } of tokens) {
        if (!(DECO_KEYS as string[]).includes(k)) continue;
        map.set(`deco.${k}`, {
          def: MENU_LAYOUT_DEFAULTS.deco[k as keyof MenuLayoutDeco].toString(),
          range: `${MENU_LAYOUT_DECO_RANGE[0]}~${MENU_LAYOUT_DECO_RANGE[1]}`,
          desc: sub ? `${group} · ${sub}` : group,
          group: `${group}${sub ? ` · ${sub}` : ""}`,
        });
      }
    }
  }
  return map;
}

/** 字段完整清单 + 兜底分组/默认值(面板用;doc 只在取到文档时补 desc) */
export interface FieldRow {
  id: FieldId;
  section: LayoutSection;
  key: string;
  group: string;
  def: number;
  range: [number, number];
  step: number;
  desc: string;
  draggable: boolean;
}

export function buildFieldRows(docs: Map<FieldId, FieldDoc>, handles: Handle[]): FieldRow[] {
  const draggable = new Set(handles.map((h) => h.id));
  return ALL_FIELDS.map((f) => {
    const doc = docs.get(f.id);
    return {
      id: f.id,
      section: f.section,
      key: f.key,
      group: doc?.group ?? (f.section === "origin" ? "origin · 锚点" : decoGroupOf(f.key)),
      def: defaultValueOf(f.section, f.key),
      range: rangeOf(f.section, f.key),
      step: stepOf(f.section, f.key),
      desc: doc?.desc ?? "",
      draggable: draggable.has(f.id),
    };
  });
}

/** 派生量速览(改 origin 时最先想看的数:行高/行距/角深/列宽) */
export function derivedReadout(L: MenuLayout): { label: string; value: string }[] {
  return [
    { label: "rowH × gap", value: `${L.rowH} × ${L.gap}` },
    { label: "rowMargin(角深)", value: `${L.rowMargin}` },
    { label: "listY / 下界", value: `${L.listY} / ${Math.round(listBottomY(L))}` },
    { label: "entryW(入口等宽)", value: `${L.entryW}` },
    { label: "setW", value: `${Math.round(L.setW * 100) / 100}` },
    { label: "sectionW", value: `${Math.round(L.sectionW * 100) / 100}` },
    { label: "setBand / noteBand", value: `${L.setBand} / ${L.noteBand}` },
    { label: "noteCap / noteMaxW", value: `${L.d.noteCap} / ${Math.round(L.d.noteMaxW)}` },
    { label: "setY / 卡底 / 屏底", value: `${Math.round(L.setY)} / ${Math.round(L.setY + L.setH)} / ${Math.round(L.d.note.y + L.d.note.h)}` },
    { label: "heroBand 高 / 夹紧上界", value: `${L.heroBand.h} / ${L.heroMaxRise + L.setH}` },
    { label: "heroTextMaxW(图文列可用宽)", value: `${Math.round(L.heroTextMaxW)}` },
  ];
}
