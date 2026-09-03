/**
 * 主菜单可视化布局工作台(**dev-only**)。
 *
 * 入口:`layout-lab.html`(根目录,不是 `vite build` 的输入,也不会被 `src/main.ts` 引用 →
 * 生产包与小包体内都不含本文件;验收用 grep 卡死这一条)。
 *
 * 三条不可让步的设计:
 *  1. **底图就是真游戏**:实例化真实 `Game`,它的 RAF 每帧用 `snapshotMenuLayout()` 重画 `drawMenu`。
 *     浮层几何则读同一个 `game.menuLayout()` —— 所以"看到的框"必然等于"画出来的东西",不存在第二套实现。
 *  2. **只改锚点,不改像素**:拖动写的是规范表字段(见 `labModel.ts` 的手柄设计法则),
 *     派生几何仍由 `menuLayoutPure` 算;这与"拖到绝对坐标"的通用布局编辑器根本不同。
 *  3. **唯一出口是 balance.json**:工作台不落盘、不改源码,导出 `menuLayout` 段粘进
 *     `public/config/balance.json` → 刷新即生效(与策划热调共用同一通道)。
 */

import { Game } from "../game";
import { loadBalanceConfig } from "../platform/balance";
import { canStarMakeup } from "@game/data/season";
import { ASSET_MANIFEST } from "@game/data/assets";
import { menuLayoutWarnings } from "@game/data/layoutMenu";
import { applyMenuSkin, setMenuSkin, snapshotMenuSkin, type MenuPanelId, type MenuSkinTable, type SkinInsets } from "@game/data/menuSkin";
import type { MenuLayout } from "@game/ui/menuLayout";
import {
  ALL_FIELDS,
  applyValue,
  buildFieldRows,
  buildGuides,
  buildHandles,
  derivedReadout,
  dirtyFields,
  dragValue,
  exportJson,
  nudgeValue,
  parseFieldDocs,
  readValues,
  resetAll,
  resetField,
} from "./labModel";
import type { FieldDoc, FieldId, Handle, HandleContext } from "./labModel";
import { SKIN_TREE, applyInsets, applyLayerName, applyRemap, applyToggle, buildSkinTree, exportSkinJson, mergeExport } from "./labSkin";

const PANEL_W = 430;
const DESIGN_W = 560;
const DRAFT_KEY = "lab.menuLayout.draft";
const ASSET_KEYS = [
  "menu_title_plate",
  "menu_strip_plate",
  "menu_chip_plate",
  "menu_section_strip",
  "menu_row_plate",
  "menu_row_plate_current",
  "menu_set_plate",
  "menu_set_plate_selected",
  "menu_note_plate",
];

/** 只用到的游戏内部成员,集中一处收口(避免全文散落 `as any`) */
interface GameInternals {
  logicalW: number;
  logicalH: number;
  scale: number;
  offX: number;
  offY: number;
  viewW: number;
  viewH: number;
  dpr: number;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  state: string;
  seasonSummary: unknown;
  save: { stageStars: number[]; selectedSet: string | null; seasonId: number };
  assets: { loaded: Set<string>; isReady(key: string): boolean; devOverride(key: string, img: unknown): void };
  menuLayout(): MenuLayout;
  stageOpen(id: number): boolean;
}

const internals = (game: Game): GameInternals => game as unknown as GameInternals;

type ElProps = Record<string, string | number | boolean | Record<string, string> | ((ev: Event) => void) | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, ...kids: Node[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === "style") node.setAttribute("style", String(v));
    else if (k === "text") node.textContent = String(v);
    else if (k === "dataset") {
      if (v && typeof v === "object") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (typeof v === "function") {
      // onclick → click(addEventListener 不认 "onclick" 这个名字,直接传会永远收不到)
      node.addEventListener(k.replace(/^on/, "").toLowerCase(), v);
    } else node.setAttribute(k, String(v));
  }
  for (const kid of kids) node.appendChild(kid);
  return node;
}

interface Lab {
  game: Game;
  gv: GameInternals;
  overlay: HTMLCanvasElement;
  octx: CanvasRenderingContext2D;
  logicalH: number;
  selected: FieldId | null;
  hover: FieldId | null;
  drag: { h: Handle; ox: number; oy: number; base: number } | null;
  show: { layout: boolean; hit: boolean; guide: boolean; labels: boolean };
  docs: Map<FieldId, FieldDoc>;
  inputs: Map<FieldId, HTMLInputElement>;
  rows: Map<FieldId, HTMLElement>;
  listEl: HTMLElement;
  readoutEl: HTMLElement;
  statusEl: HTMLElement;
  flashEl: HTMLElement;
  exportEl: HTMLElement;
  valuesDirty: boolean;
  /** 有改动但还没点「保存草稿」:改动实时更新画面,但不落盘,关页即丢 */
  draftDirty: boolean;
  dirtyEl: HTMLElement;
  lastHandles: Handle[];
  lastLayout: MenuLayout | null;
  /** 用户勾选的"模拟缺图"键(与真实未加载区分开,否则面板无法判定该不该禁用) */
  sim: Set<string>;
  assetRows: Map<string, HTMLInputElement>;
  assetSig: string;
  /** 皮肤工作副本:结构树的全部编辑先落到这里,再经 setMenuSkin 写回内存表(游戏下一帧即见) */
  skin: MenuSkinTable;
  /** 本地文件预览生效中的资产键(devOverride 状态;刷新即失,绝不进导出) */
  previews: Set<string>;
  /** 折叠态的面板(结构树) */
  collapsed: Set<MenuPanelId>;
  /** 结构树控件引用:同步时按当前皮肤表刷值,不重建 DOM */
  skinRefs: {
    bodies: Map<MenuPanelId, HTMLElement>;
    vis: Map<string, HTMLInputElement>;
    remap: Map<string, HTMLSelectElement>;
    name: Map<string, HTMLInputElement>;
    insets: Map<string, HTMLInputElement>;
    previewBadge: Map<string, HTMLElement>;
    previewClear: Map<string, HTMLElement>;
  };
}

/* ==================== 视口 ==================== */

function viewSize(): { w: number; h: number } {
  return { w: Math.max(280, window.innerWidth - PANEL_W), h: Math.max(360, window.innerHeight) };
}

/**
 * 虚拟屏高:项目的 logicalH 由窗口比例反推,但要预览 996↔1246 不必去拽浏览器窗口,
 * 所以工作台自己写一次视图字段。**仅在值变化时改画布尺寸**(每帧重建 canvas 会清掉底图)。
 */
function applyViewport(lab: Lab): void {
  const gv = lab.gv;
  const { w: vw, h: vh } = viewSize();
  if (gv.logicalH === lab.logicalH && gv.viewW === vw && gv.viewH === vh && gv.canvas.style.width === `${vw}px`) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(vw / DESIGN_W, vh / lab.logicalH, 2);
  gv.dpr = dpr;
  gv.viewW = vw;
  gv.viewH = vh;
  gv.logicalW = DESIGN_W;
  gv.logicalH = lab.logicalH;
  gv.scale = scale;
  gv.offX = (vw - DESIGN_W * scale) / 2;
  gv.offY = (vh - lab.logicalH * scale) / 2;
  gv.canvas.width = Math.round(vw * dpr);
  gv.canvas.height = Math.round(vh * dpr);
  gv.canvas.style.width = `${vw}px`;
  gv.canvas.style.height = `${vh}px`;
  gv.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  lab.overlay.width = gv.canvas.width;
  lab.overlay.height = gv.canvas.height;
  lab.overlay.style.width = `${vw}px`;
  lab.overlay.style.height = `${vh}px`;
}

function toDesign(lab: Lab, cssX: number, cssY: number): { x: number; y: number } {
  return { x: (cssX - lab.gv.offX) / lab.gv.scale, y: (cssY - lab.gv.offY) / lab.gv.scale };
}

function handleContext(lab: Lab, L: MenuLayout): HandleContext {
  const gv = lab.gv;
  return {
    w: gv.logicalW,
    h: gv.logicalH,
    makeupRows: L.rows.map((r) => {
      const stars = gv.save.stageStars[r.id] ?? 0;
      return gv.stageOpen(r.id) && canStarMakeup(stars);
    }),
    selectedSet: gv.save.selectedSet,
  };
}

/* ==================== 浮层绘制 ==================== */

const COLORS = { layout: "#ffd76a", hit: "#5ac8fa", guide: "#ff5ce1", sel: "#ffffff", drag: "#4dffc8" };

function drawOverlay(lab: Lab): void {
  const gv = lab.gv;
  const ctx = lab.octx;
  const { w: vw, h: vh } = viewSize();
  ctx.setTransform(gv.dpr, 0, 0, gv.dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  const L = gv.menuLayout();
  const s = gv.scale;
  ctx.setTransform(gv.dpr * s, 0, 0, gv.dpr * s, gv.dpr * gv.offX, gv.dpr * gv.offY);
  ctx.lineWidth = 1 / s;
  ctx.font = `${11 / s}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const px = (n: number) => n / s; // 屏幕定尺寸 → 设计空间换算

  const ctxH = handleContext(lab, L);
  lab.lastLayout = L;
  lab.lastHandles = buildHandles(L, ctxH);
  const guides = buildGuides(L, ctxH);

  for (const g of guides) {
    if (g.kind === "layout" && !lab.show.layout) continue;
    if (g.kind === "hit" && !lab.show.hit) continue;
    if (g.kind === "guide" && !lab.show.guide) continue;
    const r = g.rect;
    ctx.strokeStyle = COLORS[g.kind];
    ctx.globalAlpha = g.kind === "guide" ? 0.7 : 0.9;
    ctx.setLineDash(g.kind === "guide" ? [px(4), px(3)] : []);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    if (lab.show.labels && r.w > 1 && r.h > 1) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(8,10,16,0.72)";
      const tw = ctx.measureText(g.label).width + px(4);
      ctx.fillRect(r.x, r.y - px(6), tw, px(12));
      ctx.fillStyle = COLORS[g.kind];
      ctx.fillText(g.label, r.x + px(2), r.y);
    }
    ctx.globalAlpha = 1;
  }

  for (const h of lab.lastHandles) {
    const on = lab.selected === h.id || lab.drag?.h.id === h.id;
    const hov = lab.hover === h.id;
    const sz = px(on || hov ? 11 : 8);
    ctx.fillStyle = on ? COLORS.sel : hov ? COLORS.drag : "rgba(255,255,255,0.28)";
    ctx.fillRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
    ctx.strokeStyle = on ? COLORS.drag : "rgba(0,0,0,0.6)";
    ctx.lineWidth = px(1);
    ctx.strokeRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
    ctx.lineWidth = 1 / s;
    if (on || hov) {
      const vals = readValues();
      const txt = `${h.label} = ${vals[h.bind.section][h.bind.key]}`;
      ctx.fillStyle = "rgba(8,10,16,0.85)";
      const tw = ctx.measureText(txt).width + px(6);
      ctx.fillRect(h.x + px(8), h.y - px(7), tw, px(14));
      ctx.fillStyle = on ? COLORS.drag : "#ffffff";
      ctx.fillText(txt, h.x + px(11), h.y);
    }
  }

  if (lab.drag) {
    const d = lab.drag;
    ctx.strokeStyle = COLORS.drag;
    ctx.setLineDash([px(3), px(3)]);
    ctx.beginPath();
    ctx.moveTo(d.ox, d.oy);
    const cur = toDesign(lab, ...pointerNow(lab));
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 拖拽中的最新指针位置(设计空间);没有活动拖拽时返回中心 */
const pointer = { x: 0, y: 0 };
function pointerNow(_lab: Lab): [number, number] {
  return [pointer.x, pointer.y];
}

/* ==================== 交互 ==================== */

function pickHandle(lab: Lab, x: number, y: number): Handle | null {
  const grab = 9 / lab.gv.scale;
  let best: Handle | null = null;
  let bestD = grab;
  for (const h of lab.lastHandles) {
    const dx = Math.abs(h.x - x);
    const dy = Math.abs(h.y - y);
    // 只沿绑定轴判定:手柄在自由轴上的错开不代表"更接近该字段"
    const d = h.axis === "x" ? dx : dy;
    const off = h.axis === "x" ? dy : dx;
    if (d <= bestD && off <= grab * 1.6) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

function bindPointer(lab: Lab): void {
  const ov = lab.overlay;
  const local = (e: PointerEvent) => {
    const r = ov.getBoundingClientRect();
    return toDesign(lab, e.clientX - r.left, e.clientY - r.top);
  };
  ov.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = local(e);
    pointer.x = p.x;
    pointer.y = p.y;
    const h = pickHandle(lab, p.x, p.y);
    if (!h) {
      lab.selected = null;
      lab.valuesDirty = true;
      return;
    }
    lab.selected = h.id;
    const vals = readValues();
    lab.drag = { h, ox: p.x, oy: p.y, base: vals[h.bind.section][h.bind.key] };
    ov.setPointerCapture?.(e.pointerId);
    lab.valuesDirty = true;
  });
  ov.addEventListener("pointermove", (e) => {
    const p = local(e);
    pointer.x = p.x;
    pointer.y = p.y;
    if (lab.drag) {
      const step = e.shiftKey ? 10 : 1;
      const dx = Math.round((p.x - lab.drag.ox) / step) * step;
      const dy = Math.round((p.y - lab.drag.oy) / step) * step;
      const h = lab.drag.h;
      applyValue(h.bind.section, h.bind.key, dragValue(h, dx, dy, lab.drag.base));
      lab.valuesDirty = true;
    } else {
      const hit = pickHandle(lab, p.x, p.y);
      const id = hit?.id ?? null;
      if (id !== lab.hover) {
        lab.hover = id;
        ov.style.cursor = hit ? (hit.axis === "x" ? "ew-resize" : "ns-resize") : "crosshair";
      }
    }
  });
  const end = () => {
    if (!lab.drag) return;
    lab.drag = null;
    lab.draftDirty = true;
    lab.valuesDirty = true;
  };
  ov.addEventListener("pointerup", end);
  ov.addEventListener("pointercancel", end);
  ov.addEventListener("pointerleave", () => {
    lab.hover = null;
  });
}

/**
 * 键盘:捕获阶段吃掉事件,防止菜单热键(1-9/e/g/t/p/c/b/u)在布局台里乱跳界面。
 * 面板输入框内同样拦下(否则打字 "t" 会切到天赋面板),但不 preventDefault,不影响输入。
 */
function bindKeys(lab: Lab): void {
  window.addEventListener(
    "keydown",
    (e) => {
      const inField = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      e.stopPropagation();
      if (inField) return;
      const h = lab.lastHandles.find((x) => x.id === lab.selected);
      const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
      const dir = map[e.key];
      if (!h || !dir) {
        if (e.key === "Escape") {
          lab.selected = null;
          lab.valuesDirty = true;
        }
        return;
      }
      e.preventDefault();
      const vals = readValues();
      const steps = dir * (e.shiftKey ? 10 : 1);
      applyValue(h.bind.section, h.bind.key, nudgeValue(h, steps, vals[h.bind.section][h.bind.key]));
      lab.draftDirty = true;
      lab.valuesDirty = true;
    },
    true
  );
}

/* ==================== 草稿 / 导出 ==================== */

function saveDraft(lab: Lab): void {
  const vals = readValues();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ logicalH: lab.logicalH, vals, skin: lab.skin }));
  } catch {
    /* 隐私模式下忽略 */
  }
}

function loadDraft(): { logicalH?: number; vals?: { origin: Record<string, number>; deco: Record<string, number> }; skin?: Record<string, unknown> } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreDraft(lab: Lab): number {
  const draft = loadDraft();
  if (!draft?.vals) return 0;
  let n = 0;
  for (const f of ALL_FIELDS) {
    const v = draft.vals[f.section]?.[f.key];
    if (typeof v === "number") {
      applyValue(f.section, f.key, v);
      n++;
    }
  }
  if (typeof draft.logicalH === "number") lab.logicalH = draft.logicalH;
  if (draft.skin && typeof draft.skin === "object") {
    applyMenuSkin(draft.skin); // 复用加载器校验:脏值告警回退,不静默生效
    lab.skin = snapshotMenuSkin();
    n++;
  }
  return n;
}

function refreshExport(lab: Lab): void {
  const all = lab.exportEl.querySelector("input[data-all]") instanceof HTMLInputElement && (lab.exportEl.querySelector("input[data-all]") as HTMLInputElement).checked;
  // menuLayout 段(只导 dirty / 全部)+ menuSkin 段(白名单)合并成最终粘贴文本
  const layoutJson = exportJson(readValues(), { all });
  const inner = (JSON.parse(layoutJson) as { menuLayout?: unknown }).menuLayout ?? {};
  let text: string;
  try {
    text = mergeExport(JSON.stringify(inner), exportSkinJson(lab.skin));
  } catch {
    text = layoutJson; // 两侧都是自产 JSON,理论不可达;兜底仍给出布局段
  }
  const pre = lab.exportEl.querySelector("pre");
  if (pre) pre.textContent = text;
}

/* ==================== 面板 ==================== */

function checkbox(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = on;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { style: "display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;color:#c8c2b1" }, input, document.createTextNode(label));
}

/**
 * 贴图就绪状态是异步的:面板建早了会把"当时还没加载完"的图永久标成不可模拟。
 * 于是每帧比对一次签名(缺图/被皮肤 hidden/本地预览),只在变化时刷 DOM
 * (每帧写 disabled/checked 会打断用户勾选)。
 */
function syncAssetToggles(lab: Lab): void {
  const assets = lab.gv.assets;
  let sig = "";
  for (const key of ASSET_KEYS) {
    sig += !assets.isReady(key) && !lab.sim.has(key) ? "1" : "0";
    sig += lab.skin.hidden.includes(key) ? "H" : "-";
    sig += lab.previews.has(key) ? "P" : "-";
  }
  if (sig === lab.assetSig) return;
  lab.assetSig = sig;
  let i = 0;
  for (const key of ASSET_KEYS) {
    const trulyMissing = sig[i] === "1";
    const skinHidden = sig[i + 1] === "H";
    const preview = sig[i + 2] === "P";
    i += 3;
    const input = lab.assetRows.get(key);
    if (!input) continue;
    input.disabled = trulyMissing || skinHidden || preview;
    input.checked = trulyMissing || skinHidden || lab.sim.has(key);
    input.title = skinHidden
      ? "已被结构树隐藏(menuSkin.hidden,与缺图同效)"
      : preview
        ? "本地预览生效中(结构树 📁)"
        : trulyMissing
          ? "该贴图未加载(现在就是缺图状态),无法再模拟"
          : "";
  }
}

/* ==================== 结构树 · 皮肤 ==================== */

/** 皮肤编辑的统一出口:工作副本 → 内存表(游戏下一帧即见)→ 未保存标记 → 面板同步 */
function commitSkin(lab: Lab, next: MenuSkinTable): void {
  lab.skin = next;
  setMenuSkin(next);
  lab.draftDirty = true;
  lab.valuesDirty = true;
}

const INSET_SIDES = ["t", "r", "b", "l"] as const;

/**
 * 结构树面板:7 面板按绘制序折叠组(序只读,不提供重排 —— 真重排需重写 drawMenu)。
 * 每层:显隐勾选(图→hidden / 文→textHidden)、图层名(→layers 段,仅透传);
 * 图层层下按资产键给双通道换图:下拉选键→remap(运行时真生效),
 * 文件按钮→devOverride(仅布局台预览,刷新即失,绝不进导出)。
 * 面板级四边间距(±1,Shift±10)→ insets(加性叠在 deco 派生字段上)。
 */
function buildSkinTreePanel(lab: Lab): HTMLElement {
  const box = el("div", { style: "margin-top:10px;font-size:12px;color:#c8c2b1" },
    el("div", { style: "margin-bottom:2px", text: "结构树 · 皮肤(显隐 / 换图 / 四边间距 → 导出 menuSkin 段)" }),
    el("div", { style: "font-size:11px;color:#5a6a80;line-height:1.5;margin-bottom:4px", text: "📁 本地文件预览只在布局台可见,刷新即失、不进导出;绘制序为只读。" })
  );

  // 共享的文件选择器:点任一 📁 记住目标键再弹框
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" }) as HTMLInputElement;
  box.appendChild(fileInput);
  let fileTarget: string | null = null;
  fileInput.addEventListener("change", () => {
    const key = fileTarget;
    fileTarget = null;
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!key || !file) return;
    const img = new Image();
    img.onload = () => {
      lab.gv.assets.devOverride(key, img);
      lab.previews.add(key);
      lab.valuesDirty = true;
      flash(lab, `${key} 本地预览中(刷新即失,不进导出)`);
    };
    img.onerror = () => flash(lab, `无法读取图片:${file.name}`);
    img.src = URL.createObjectURL(file);
  });

  const INSET_STYLE = "width:46px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d";
  const ALL_KEYS = Object.keys(ASSET_MANIFEST);

  for (const p of SKIN_TREE) {
    const body = el("div", { style: "padding:2px 0 4px" });
    lab.skinRefs.bodies.set(p.id, body);

    // 面板级四边间距(两层共享同一份;加性增量叠在 deco 派生字段上)
    const insetRow = el("div", { style: "display:flex;align-items:center;gap:4px;margin:2px 0 4px 18px;font-size:11px;color:#8f9bb3" }, document.createTextNode("四边间距"));
    for (const side of INSET_SIDES) {
      const input = el("input", { type: "number", min: "-100", max: "100", step: "1", title: `${p.label} ${side} 边间距增量 [-100,100]`, style: INSET_STYLE }) as HTMLInputElement;
      lab.skinRefs.insets.set(`${p.id}.${side}`, input);
      const commit = () => {
        const patch: Partial<SkinInsets> = {};
        patch[side] = Number(input.value) || 0;
        commitSkin(lab, applyInsets(lab.skin, p.id, patch));
      };
      input.addEventListener("change", commit);
      // Shift+方向键 ±10(与主面板键盘口径一致);普通方向键交给原生 step=1
      input.addEventListener("keydown", (e) => {
        if (!e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        input.value = String((Number(input.value) || 0) + (e.key === "ArrowUp" ? 10 : -10));
        commit();
      });
      insetRow.appendChild(el("label", { style: "display:inline-flex;align-items:center;gap:2px" }, document.createTextNode(side), input));
    }
    body.appendChild(insetRow);

    for (const l of p.layers) {
      const vis = el("input", { type: "checkbox", title: l.kind === "image" ? "图层显隐(→ hidden,走缺图回退)" : "文字层显隐(→ textHidden,图照画)" }) as HTMLInputElement;
      lab.skinRefs.vis.set(l.id, vis);
      vis.addEventListener("change", () => commitSkin(lab, applyToggle(lab.skin, l.id, vis.checked)));
      const nameInput = el("input", { type: "text", placeholder: l.label, title: "图层名(空 = 默认名;只随配置透传,运行时不消费)", style: "width:88px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" }) as HTMLInputElement;
      lab.skinRefs.name.set(l.id, nameInput);
      nameInput.addEventListener("change", () => commitSkin(lab, applyLayerName(lab.skin, l.id, nameInput.value)));
      body.appendChild(
        el("div", { style: "display:flex;align-items:center;gap:6px;margin:2px 0 2px 10px" },
          vis,
          el("span", { style: `font-size:11px;color:${l.kind === "image" ? "#ffd76a" : "#9fb4d0"}`, text: l.kind === "image" ? "图" : "文" }),
          nameInput
        )
      );

      // 图层的每个资产键一行:双通道换图(下拉 = remap 真生效;📁 = 本地预览)
      for (const key of l.assetKeys) {
        const select = el("select", { title: `换图:${key} → 目标资产键(写进 remap,运行时真生效)`, style: "max-width:170px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" }) as HTMLSelectElement;
        for (const k of ALL_KEYS) select.appendChild(el("option", { value: k, text: k === key ? `${k}(默认)` : k }));
        lab.skinRefs.remap.set(key, select);
        select.addEventListener("change", () => commitSkin(lab, applyRemap(lab.skin, key, select.value === key ? null : select.value)));
        const fileBtn = el("button", { style: "font-size:11px;padding:0 4px", text: "📁", title: "本地任意图预览(仅布局台,刷新即失)", onclick: () => { fileTarget = key; fileInput.click(); } });
        const badge = el("span", { style: "display:none;font-size:10px;color:#ff9d2e", text: "仅预览" });
        lab.skinRefs.previewBadge.set(key, badge);
        const clearBtn = el("button", {
          style: "display:none;font-size:11px;padding:0 4px;color:#ff5a6e", text: "×", title: "撤销本地预览",
          onclick: () => { lab.gv.assets.devOverride(key, null); lab.previews.delete(key); lab.valuesDirty = true; },
        });
        lab.skinRefs.previewClear.set(key, clearBtn);
        body.appendChild(
          el("div", { style: "display:flex;align-items:center;gap:4px;margin:1px 0 1px 30px" },
            el("span", { style: "font-size:10px;color:#5a6a80;width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", title: key, text: key }),
            el("span", { style: "font-size:10px;color:#5a6a80", text: "→" }),
            select, fileBtn, badge, clearBtn
          )
        );
      }
    }

    const chevron = el("span", { style: "display:inline-block;width:12px;color:#8f9bb3", text: "▾" });
    const header = el("div", { style: "margin-top:6px;padding:3px 6px;background:#0b0e14;border:1px solid #1b2233;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none" },
      chevron,
      el("span", { style: "color:#e6e6e6;font-weight:600;font-size:12px", text: p.label }),
      el("span", { style: "font-size:10px;color:#5a6a80", text: `绘制序 ${p.z} · 只读` })
    );
    header.addEventListener("click", () => {
      const opening = lab.collapsed.has(p.id);
      if (opening) lab.collapsed.delete(p.id);
      else lab.collapsed.add(p.id);
      body.style.display = opening ? "" : "none";
      chevron.textContent = opening ? "▾" : "▸";
    });
    box.appendChild(header);
    box.appendChild(body);
  }
  return box;
}

/** 按当前皮肤表刷结构树控件值(不重建 DOM,不打断输入焦点);外部变化(重读/复位/草稿)后同样走这里 */
function syncSkinTree(lab: Lab): void {
  const tree = buildSkinTree(lab.skin);
  for (const node of tree) {
    const ins = lab.skin.insets[node.panelId] ?? { t: 0, r: 0, b: 0, l: 0 };
    for (const side of INSET_SIDES) {
      const input = lab.skinRefs.insets.get(`${node.panelId}.${side}`);
      if (input && document.activeElement !== input) input.value = String(ins[side]);
    }
    for (const row of node.layers) {
      const vis = lab.skinRefs.vis.get(row.layerId);
      if (vis) vis.checked = row.visible;
      const nameInput = lab.skinRefs.name.get(row.layerId);
      if (nameInput && document.activeElement !== nameInput) nameInput.value = lab.skin.layers[row.layerId]?.name ?? "";
      for (const key of row.assetKeys) {
        const select = lab.skinRefs.remap.get(key);
        if (select && document.activeElement !== select) select.value = row.resolved[key];
        const previewing = lab.previews.has(key);
        const badge = lab.skinRefs.previewBadge.get(key);
        if (badge) badge.style.display = previewing ? "" : "none";
        const clearBtn = lab.skinRefs.previewClear.get(key);
        if (clearBtn) clearBtn.style.display = previewing ? "" : "none";
      }
    }
  }
}

function buildPanel(lab: Lab): HTMLElement {
  const head = el("div", { style: "padding:10px 12px;border-bottom:1px solid #232a3d" },
    el("div", { style: "font-size:14px;color:#ffd76a;font-weight:700", text: "主菜单布局工作台(dev)" }),
    el("div", { style: "font-size:11px;color:#8f9bb3;margin-top:4px;line-height:1.5", text: "拖白点 = 改锚点字段;方向键 ±1px(Shift ±10)。改动实时更新画面,点「保存草稿」才保留,不保存关掉页面即丢。改完点「导出 JSON」粘进 public/config/balance.json 的 menuLayout / menuSkin 段,刷新即生效。" })
  );

  /* 视图 */
  const hInput = el("input", { type: "number", min: "700", max: "1400", step: "1", value: String(lab.logicalH), style: "width:70px" }) as HTMLInputElement;
  hInput.addEventListener("change", () => {
    lab.logicalH = Math.max(700, Math.min(1400, Number(hInput.value) || 996));
    hInput.value = String(lab.logicalH);
    lab.draftDirty = true;
    lab.valuesDirty = true;
  });
  const quick = (n: number) =>
    el("button", { style: "margin-right:4px", text: String(n), onclick: () => { lab.logicalH = n; hInput.value = String(n); lab.draftDirty = true; lab.valuesDirty = true; } });
  const viewRow = el("div", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#c8c2b1" }, document.createTextNode("虚拟屏高 "), hInput, quick(996), quick(1246));

  /* 图层开关 */
  const layerRow = el("div", { style: "margin-top:8px" },
    checkbox("布局框", true, (v) => (lab.show.layout = v)),
    checkbox("命中框", true, (v) => (lab.show.hit = v)),
    checkbox("参考带", true, (v) => (lab.show.guide = v)),
    checkbox("标签", true, (v) => (lab.show.labels = v))
  );

  /* 缺图模拟 */
  const assetBox = el("div", { style: "margin-top:8px;font-size:12px;color:#c8c2b1" }, document.createTextNode("模拟缺图(布局每帧重算,勾选即时生效)"));
  for (const key of ASSET_KEYS) {
    const input = el("input", { type: "checkbox" }) as HTMLInputElement;
    input.addEventListener("change", () => {
      const loaded = lab.gv.assets.loaded;
      if (input.checked) {
        if (!loaded.has(key)) return; // 真没加载 → 没图可卸
        lab.sim.add(key);
        loaded.delete(key);
      } else {
        if (!lab.sim.delete(key)) return; // 只加回自己卸掉的键,别伪造 loaded
        loaded.add(key);
      }
      lab.valuesDirty = true;
    });
    lab.assetRows.set(key, input);
    assetBox.appendChild(el("label", { style: "display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px" }, input, document.createTextNode(key.replace("menu_", ""))));
  }

  /* 结构树 · 皮肤(显隐/换图/四边间距;导出 menuSkin 段) */
  const skinBox = buildSkinTreePanel(lab);

  /* 派生量 */
  lab.readoutEl = el("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:2px 8px;font-size:11px;color:#9fb4d0" });
  const readoutBox = el("div", { style: "margin-top:10px" }, el("div", { style: "font-size:12px;color:#c8c2b1;margin-bottom:4px", text: "派生量(不可直接编辑 —— 改锚点看这里)" }), lab.readoutEl);

  /* 已知偏差(提交3 已拍板:补星命中与绘制同源,仅剩幻影榜宽热区,直接摆在台面上) */
  const known = el("div", { style: "margin-top:10px;font-size:11px;color:#ff9d2e;line-height:1.5" },
    el("div", { text: "已知偏差(浮层里用青色命中框画出):" }),
    el("div", { text: "· 幻影榜:热区宽 = phantomAnchor,可见筹码宽由文字测量定——已拍板保留宽热区(有意的大触控区)" })
  );

  /* 字段列表 */
  const search = el("input", { type: "search", placeholder: "按字段名或区块筛选(set / band / gap …)", style: "width:100%;box-sizing:border-box;margin-top:10px;font-size:12px" }) as HTMLInputElement;
  search.addEventListener("input", () => {
    lab.listEl.dataset.q = search.value.trim().toLowerCase();
    applyFilter(lab);
  });
  lab.listEl = el("div", { style: "margin-top:6px" });
  const rows = buildFieldRows(lab.docs, lab.lastHandles);
  let lastGroup = "";
  for (const r of rows) {
    if (r.group !== lastGroup) {
      lastGroup = r.group;
      lab.listEl.appendChild(el("div", { dataset: { group: r.group }, style: "font-size:11px;color:#5a6a80;margin:8px 0 2px;border-bottom:1px solid #1b2233", text: r.group }));
    }
    lab.listEl.appendChild(fieldRow(lab, r.id, r.key, r.def, r.range, r.step, r.desc, r.draggable));
  }

  /* 导出 */
  const ta = el("pre", { style: "white-space:pre-wrap;font-size:11px;color:#4dffc8;background:#0b0e14;padding:8px;border:1px solid #1b2233;max-height:180px;overflow:auto" });
  const allBox = checkbox("导出全部字段", false, () => refreshExport(lab));
  allBox.querySelector("input")!.setAttribute("data-all", "1");
  const copyBtn = el("button", { style: "margin-left:6px", text: "复制", onclick: () => copyText(ta.textContent ?? "", copyBtn) });
  const saveBtn = el("button", { text: "保存草稿", title: "把当前改动写进本地草稿(localStorage),下次打开还在;不点则关页即丢", onclick: () => { saveDraft(lab); lab.draftDirty = false; lab.valuesDirty = true; flash(lab, "草稿已保存(下次打开自动恢复)"); } });
  lab.dirtyEl.textContent = "● 有未保存的改动";
  lab.dirtyEl.style.cssText = "margin-left:6px;color:#ff9d2e;font-size:11px;display:none";
  const reloadBtn = el("button", { style: "margin-left:6px", text: "重读 balance.json", onclick: async () => { const r = await loadBalanceConfig(); lab.skin = snapshotMenuSkin(); lab.draftDirty = true; lab.valuesDirty = true; flash(lab, r.ok ? `已读取配置(warnings ${r.warnings.length})` : `读取失败:${r.error ?? "?"} → 用规范表默认`); } });
  const resetBtn = el("button", { style: "margin-left:6px", text: "全部复位", onclick: () => { resetAll(); lab.skin = { remap: {}, insets: {}, hidden: [], textHidden: [], layers: {} }; setMenuSkin(lab.skin); lab.draftDirty = true; lab.valuesDirty = true; flash(lab, "内存值已回到规范表默认(布局+皮肤)——未保存;点「保存草稿」才持久,否则重进页面仍恢复旧草稿"); } });
  const discardBtn = el("button", { style: "margin-left:6px", text: "丢弃草稿", onclick: () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } lab.valuesDirty = true; flash(lab, "已丢弃草稿(内存值不变,重进页面生效)"); } });
  lab.exportEl = el("div", { style: "margin-top:10px" }, el("div", { style: "font-size:12px;color:#c8c2b1;margin-bottom:4px" }, document.createTextNode("导出(并入 balance.json)"), allBox, copyBtn, saveBtn, lab.dirtyEl, reloadBtn, resetBtn, discardBtn), ta);

  lab.statusEl = el("div", { style: "margin-top:8px;font-size:11px;color:#8f9bb3;min-height:16px" });
  lab.flashEl = el("div", { style: "font-size:11px;color:#4dffc8;min-height:14px" });

  return el("div", { style: `position:fixed;right:0;top:0;width:${PANEL_W}px;min-width:${PANEL_W}px;height:100vh;overflow:auto;background:#111725;color:#e6e6e6;border-left:1px solid #232a3d;font-family:system-ui,"Microsoft YaHei",sans-serif;z-index:10` },
    head,
    el("div", { style: "padding:10px 12px" }, viewRow, layerRow, assetBox, skinBox, readoutBox, known, search, lab.listEl, lab.exportEl, lab.statusEl, lab.flashEl)
  );
}

function fieldRow(lab: Lab, id: FieldId, key: string, def: number, range: [number, number], step: number, desc: string, draggable: boolean): HTMLElement {
  const input = el("input", { type: "number", step: String(step), style: "width:62px;font-size:12px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" }) as HTMLInputElement;
  lab.inputs.set(id, input);
  const commit = (v: number) => {
    const [section, k] = id.split(".");
    applyValue(section as "origin" | "deco", k, v);
    lab.draftDirty = true;
    lab.valuesDirty = true;
  };
  input.addEventListener("change", () => commit(Number(input.value)));
  const bump = (dir: number) =>
    el("button", { style: "width:22px;font-size:12px;padding:0", text: dir > 0 ? "+" : "−", onclick: () => {
      const [section, k] = id.split(".");
      const cur = readValues()[section as "origin" | "deco"][k];
      commit(cur + dir * step);
    } });
  const resetBtn = el("button", { style: "width:22px;font-size:11px;padding:0;display:none", text: "↺", title: `恢复默认 ${def}`, onclick: () => { const [section, k] = id.split("."); resetField(section as "origin" | "deco", k); lab.draftDirty = true; lab.valuesDirty = true; } });
  const label = el("span", { style: "flex:1;font-size:12px;color:#c8c2b1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: `${draggable ? "◆" : "·"} ${key}` });
  const row = el("div", {
    dataset: { id },
    title: `${key} · 默认 ${def} · 范围 ${range[0]}~${range[1]}${desc ? ` · ${desc}` : " · (文档未覆盖该字段)"}`,
    style: "display:flex;align-items:center;gap:4px;padding:1px 2px;border-left:2px solid transparent",
    onclick: () => { if (draggable) { lab.selected = id; lab.valuesDirty = true; } },
  }, label, bump(-1), input, bump(1), resetBtn);
  lab.rows.set(id, row);
  return row;
}

function applyFilter(lab: Lab): void {
  const q = lab.listEl.dataset.q ?? "";
  const kids = Array.from(lab.listEl.children) as HTMLElement[];
  // 第一遍:字段行按 id 或所属区块标题命中;区块标题先一律留待第二遍回收
  let group = "";
  const shown: boolean[] = [];
  for (const node of kids) {
    if (node.dataset.id) {
      shown.push(!q || node.dataset.id.toLowerCase().includes(q) || group.toLowerCase().includes(q));
    } else {
      group = node.dataset.group ?? "";
      shown.push(true);
    }
  }
  // 第二遍(自后向前):标题只在它之后、下一个标题之前存在可见行时显示
  let anyVisible = false;
  for (let i = kids.length - 1; i >= 0; i--) {
    const node = kids[i];
    if (node.dataset.id) {
      node.style.display = shown[i] ? "" : "none";
      anyVisible = anyVisible || shown[i];
    } else {
      node.style.display = anyVisible ? "" : "none";
      anyVisible = false;
    }
  }
}

function syncPanel(lab: Lab): void {
  const vals = readValues();
  const dirty = new Set(dirtyFields(vals));
  for (const f of ALL_FIELDS) {
    const input = lab.inputs.get(f.id);
    const row = lab.rows.get(f.id);
    if (!input || !row) continue;
    const v = vals[f.section][f.key];
    if (document.activeElement !== input) input.value = String(v);
    const isDirty = dirty.has(f.id);
    row.style.background = isDirty ? "rgba(255,215,106,0.08)" : "";
    row.style.borderLeftColor = lab.selected === f.id ? COLORS.drag : "transparent";
    const resetBtn = row.lastElementChild as HTMLElement | null;
    if (resetBtn) resetBtn.style.display = isDirty ? "" : "none";
  }
  if (lab.lastLayout) {
    lab.readoutEl.textContent = "";
    for (const r of derivedReadout(lab.lastLayout)) {
      lab.readoutEl.appendChild(el("span", { style: "color:#5a6a80", text: r.label }));
      lab.readoutEl.appendChild(el("span", { text: r.value }));
    }
  }
  lab.dirtyEl.style.display = lab.draftDirty ? "" : "none";
  lab.statusEl.textContent = `dirty ${dirty.size}/${ALL_FIELDS.length} 字段` + (menuLayoutWarnings.length ? ` · ⚠ ${menuLayoutWarnings.slice(0, 2).join(";")}` : "");
  syncSkinTree(lab);
  refreshExport(lab);
}

function flash(lab: Lab, msg: string): void {
  lab.flashEl.textContent = msg;
}

function copyText(text: string, btn: HTMLElement): void {
  const done = () => {
    btn.textContent = "已复制";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallback());
    return;
  }
  fallback();
  function fallback(): void {
    const ta = el("textarea", { style: "position:fixed;left:-9999px" }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      btn.textContent = "复制失败";
    }
    ta.remove();
  }
}

/* ==================== 启动 ==================== */

async function boot(): Promise<void> {
  await loadBalanceConfig().catch(() => undefined);
  const game = new Game();
  (window as unknown as { game: Game }).game = game;
  const gv = internals(game);

  const overlay = el("canvas", { id: "lab-overlay", style: "position:fixed;left:0;top:0;z-index:5;touch-action:none;cursor:crosshair" }) as HTMLCanvasElement;
  const lab: Lab = {
    game,
    gv,
    overlay,
    octx: overlay.getContext("2d")!,
    logicalH: gv.logicalH,
    selected: null,
    hover: null,
    drag: null,
    show: { layout: true, hit: true, guide: true, labels: true },
    docs: new Map(),
    inputs: new Map(),
    rows: new Map(),
    listEl: el("div"),
    readoutEl: el("div"),
    statusEl: el("div"),
    flashEl: el("div"),
    exportEl: el("div"),
    valuesDirty: true,
    draftDirty: false,
    dirtyEl: el("span"),
    lastHandles: [],
    lastLayout: null,
    sim: new Set(),
    assetRows: new Map(),
    assetSig: "\u0000",
    skin: snapshotMenuSkin(),
    previews: new Set(),
    collapsed: new Set(),
    skinRefs: { bodies: new Map(), vis: new Map(), remap: new Map(), name: new Map(), insets: new Map(), previewBadge: new Map(), previewClear: new Map() },
  };
  (window as unknown as { lab: Lab }).lab = lab; // dev-only:控制台/自动化检查读手柄、驱动拖拽

  try {
    const md = await fetch("docs/CONFIG-TABLES.md").then((r) => (r.ok ? r.text() : ""));
    lab.docs = md ? parseFieldDocs(md) : new Map();
  } catch {
    lab.docs = new Map();
  }

  const gameCanvas = gv.canvas;
  gameCanvas.style.position = "fixed";
  gameCanvas.style.left = "0";
  gameCanvas.style.top = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "#05070c";

  const draftN = restoreDraft(lab);
  // 手柄要先建好:面板用它判定每个字段是否可拖(◆),建晚一轮就全成了纯数值框
  applyViewport(lab);
  lab.lastLayout = gv.menuLayout();
  lab.lastHandles = buildHandles(lab.lastLayout, handleContext(lab, lab.lastLayout));
  document.body.appendChild(overlay);
  document.body.appendChild(buildPanel(lab));

  bindPointer(lab);
  bindKeys(lab);
  window.addEventListener("resize", () => applyViewport(lab));
  if (draftN) flash(lab, `已恢复上次草稿(${draftN} 项内存值)`);

  const frame = (): void => {
    // 布局台只服务主菜单:任何热键/点击把界面切走,下一帧按回来
    if (gv.state !== "menu") {
      gv.seasonSummary = null;
      gv.state = "menu";
    }
    applyViewport(lab);
    drawOverlay(lab);
    syncAssetToggles(lab);
    if (lab.valuesDirty) {
      lab.valuesDirty = false;
      syncPanel(lab);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="color:#ff5a6e;padding:16px;font:12px monospace">布局台启动失败:${String(e)}</pre>`;
});
