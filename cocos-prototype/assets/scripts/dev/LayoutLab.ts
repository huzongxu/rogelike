import { assetManager, Graphics, ImageAsset, Input, KeyCode, Label, Node, SpriteFrame, sys, UITransform, Vec3, input } from "cc";
import { DESIGN_W, logicalH, placeRect } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { menuLayoutWarnings } from "../game/data/layoutMenu";
import { setMenuSkin, snapshotMenuSkin } from "../game/data/menuSkin";
import type { MenuLayout } from "../game/ui/menuLayout";
import type { MenuPanelId, MenuSkinTable, SkinInsets } from "../game/data/menuSkin";
import type { SetId } from "../game/data/sets";
import { ASSET_MANIFEST } from "../game/data/assets";
import {
  ALL_FIELDS,
  applyValue,
  buildFieldRows,
  buildGuides,
  buildHandles,
  derivedReadout,
  dirtyFields,
  dragValue,
  nudgeValue,
  pickHandle,
  readValues,
  resetAll,
  type Guide,
  type Handle,
  type HandleContext,
} from "../game/dev/labModel";
import { SKIN_TREE, applyInsets, applyLayerName, applyRemap, applyToggle, buildSkinTree } from "../game/dev/labSkin";
import {
  LAB_DRAFT_STORAGE_KEY,
  MENU_NINE_KEYS,
  borderFor,
  clampBorder,
  currentDraft,
  decodeDraft,
  defaultTableState,
  encodeDraft,
  exportBundle,
  restoreDraft,
  tableStateFromDoc,
  type LabTableState,
} from "../game/dev/labTable";
import type { MenuLayoutView, MenuTextContent } from "../menu/MenuLayoutView";

/**
 * 布局台的 Cocos 侧宿主层:`?lab=1` 时在 web-desktop 构建里挂上来。
 *
 * 与 Web 侧 `src/dev/layoutWorkbench.ts` 的分工完全对称 —— 字段/手柄/钳制/拾取/导出全在
 * 共享层 `game/dev/labModel.ts`,本文件只做三件宿主的事:
 *  1. **把浮层画成节点**:手柄是真实节点,尺寸与位置都经 `placeRect()` 走单一换算点;
 *     参考框合并成一个 Graphics 节点(76 个描边框不必 76 个节点)。
 *  2. **把引擎指针事件换算成设计 px**:用 `UITransform.convertToNodeSpaceAR()` 反推,
 *     缩放与信箱由引擎矩阵承担,不再像 Web 那样手写 scale/offX。
 *  3. **面板与落盘出口**:浏览器宿主下用 DOM 侧栏(Cocos 的 web-desktop 构建里 DOM 可用),
 *     草稿走 `sys.localStorage`,最终出口仍是两份 JSON 文本 —— 与 Web 一样"改表不写盘"。
 *
 * 手柄改的是内存表,`MenuLayoutView` 读的也是同一张表 → 拖一下画面即跟随,不需要重启。
 * `Graphics` 不支持虚线,参考带因此画实线(与 Web 的品红虚线是唯一的视觉差异)。
 */

export interface LabOptions {
    /** 屏幕节点(Screen:menu);浮层与视图都挂在它下面 */
    screen: Node;
    /** 被驱动的画面 */
    view: MenuLayoutView;
    /** 资源表(key → SpriteFrame);本地预览只改这张表,不进导出 */
    frames: Map<string, SpriteFrame>;
    /** 画面文案(占位即可,布局台只关心几何) */
    content: () => MenuTextContent;
    stageIds: number[];
    setIds: SetId[];
    /** 该行是否显示补星钮(与视图同一判定,手柄才不会指错行) */
    makeupRows: (L: MenuLayout) => boolean[];
    selectedSet: SetId | null;
}

/** 引擎的触摸事件在本文件里只用到取坐标与原始事件(shift 键) */
interface UiTouchEvent {
    getUILocation(): { x: number; y: number };
    getUIEvent?(): { shiftKey?: boolean } | null;
}

export class LayoutLab {
    private o: LabOptions;
    private root!: Node;
    private capture!: Node;
    private guideNode!: Node;
    private guideGfx!: Graphics;
    private handleNodes: { node: Node; gfx: Graphics }[] = [];
    private selTag!: Label;
    private hovTag!: Label;
    private handles: Handle[] = [];
    private selected: string | null = null;
    private hover: string | null = null;
    private drag: { h: Handle; ox: number; oy: number; base: number } | null = null;
    private show: { layout: boolean; hit: boolean; guide: boolean; labels: boolean };
    private skin: MenuSkinTable;
    private table: LabTableState;
    private screenH: number;
    private dirty = true;
    private draftDirty = false;
    private previews = new Set<string>();
    private previewBackup = new Map<string, SpriteFrame | null>();
    private bundle = { balanceText: "{}", viewTableText: "{}" };
    private panel: HTMLElement | null = null;
    private refs = {
        inputs: new Map<string, HTMLInputElement>(),
        rows: new Map<string, HTMLElement>(),
        vis: new Map<string, HTMLInputElement>(),
        names: new Map<string, HTMLInputElement>(),
        remap: new Map<string, HTMLSelectElement>(),
        badge: new Map<string, HTMLElement>(),
        clear: new Map<string, HTMLElement>(),
        insets: new Map<string, HTMLInputElement>(),
        status: null as HTMLElement | null,
        readout: null as HTMLElement | null,
        list: null as HTMLElement | null,
        bal: null as HTMLElement | null,
        vt: null as HTMLElement | null,
    };

    constructor(opts: LabOptions) {
        this.o = opts;
        const lab = viewTable().lab;
        this.show = { ...lab.showDefault };
        this.skin = snapshotMenuSkin();
        this.table = tableStateFromDoc(viewTable() as unknown as Record<string, unknown>);
        this.screenH = logicalH();
    }

    /* ==================== 装配 ==================== */

    mount(): void {
        this.root = makeNode("LayoutLab", this.o.screen);
        this.root.addComponent(UITransform).setContentSize(DESIGN_W, this.screenH);
        this.guideNode = makeNode("Guides", this.root);
        this.guideGfx = this.guideNode.addComponent(Graphics);
        this.capture = makeNode("Capture", this.root);
        placeRect(this.capture, { x: 0, y: 0, w: DESIGN_W, h: this.screenH });
        this.bindPointer();
        const px = viewTable().lab.labelPx;
        this.selTag = label("TagSel", this.root, "", px, HEX.textPrimary);
        this.hovTag = label("TagHover", this.root, "", px, HEX.textSecondary);
        this.selTag.node.active = false;
        this.hovTag.node.active = false;
        this.restoreDraftOnce();
        this.sync();
        if (this.hasDom()) this.buildPanel();
        if (sys.isBrowser) input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    /** 方向键微调选中手柄;没选中手柄时不吃事件(交给宿主) */
    private onKey(e: { keyCode: KeyCode; shiftKey?: boolean }): void {
        const map: Partial<Record<KeyCode, "left" | "right" | "up" | "down">> = {
            [KeyCode.ARROW_LEFT]: "left",
            [KeyCode.ARROW_RIGHT]: "right",
            [KeyCode.ARROW_UP]: "up",
            [KeyCode.ARROW_DOWN]: "down",
        };
        const dir = map[e.keyCode];
        if (!dir) return;
        this.nudge(dir, !!e.shiftKey);
    }

    destroy(): void {
        if (sys.isBrowser) input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        if (this.capture) {
            this.capture.off(Node.EventType.TOUCH_START);
            this.capture.off(Node.EventType.TOUCH_MOVE);
            this.capture.off(Node.EventType.TOUCH_END);
            this.capture.off(Node.EventType.TOUCH_CANCEL);
        }
        if (this.root) this.root.destroy();
        this.panel?.remove();
        this.panel = null;
    }

    private hasDom(): boolean {
        return sys.isBrowser && typeof (globalThis as Record<string, unknown>).document === "object";
    }

    /** 每帧由 GameShell 调用:值脏了才重排(松手与拖动中都会脏一次) */
    tick(): void {
        if (!this.dirty) return;
        this.dirty = false;
        this.sync();
    }

    private markDirty(): void {
        this.dirty = true;
    }

    /** 改完值/皮肤/边距都要让视图重克隆带 inset 的帧 */
    private invalidateInsets(): void {
        this.o.view.setEnv(this.o.stageIds, this.o.setIds);
    }

    /* ==================== 画面与浮层 ==================== */

    private handleContext(L: MenuLayout): HandleContext {
        return { w: DESIGN_W, h: this.screenH, makeupRows: this.o.makeupRows(L), selectedSet: this.o.selectedSet };
    }

    sync(): void {
        this.o.view.setEnv(this.o.stageIds, this.o.setIds);
        const L = this.o.view.refresh(this.o.content());
        this.handles = buildHandles(L, this.handleContext(L));
        this.drawGuides(buildGuides(L, this.handleContext(L)));
        this.syncHandles();
        this.refreshExport();
        this.syncPanel(L);
    }

    /** 参考框:一个 Graphics 节点描完所有矩形(设计 px → 节点局部 px 只在 placeRect 那一处换算) */
    private drawGuides(guides: Guide[]): void {
        const g = this.guideGfx;
        const lab = viewTable().lab;
        const H = this.screenH;
        g.clear();
        g.lineWidth = lab.lineWidth;
        for (const gd of guides) {
            if (!this.show[gd.kind]) continue;
            const r = gd.rect;
            g.strokeColor = hexToColor(lab.colors[gd.kind]);
            g.rect(r.x - DESIGN_W / 2, H / 2 - r.y - r.h, r.w, r.h);
            g.stroke();
        }
        placeRect(this.guideNode, { x: 0, y: 0, w: DESIGN_W, h: H });
    }

    /** 一个手柄 = 一个节点:尺寸与位置都经 placeRect,和画面同一套换算点 */
    private syncHandles(): void {
        const lab = viewTable().lab;
        while (this.handleNodes.length > this.handles.length) this.handleNodes.pop()?.node.destroy();
        while (this.handleNodes.length < this.handles.length) {
            const node = makeNode("Handle", this.root);
            this.handleNodes.push({ node, gfx: node.addComponent(Graphics) });
        }
        this.handles.forEach((h, i) => {
            const slot = this.handleNodes[i];
            const on = this.selected === h.id || this.drag?.h.id === h.id;
            const hov = this.hover === h.id;
            const size = on || hov ? lab.handleSizeActive : lab.handleSize;
            const g = slot.gfx;
            g.clear();
            g.fillColor = hexToColor(on ? lab.colors.sel : hov ? lab.colors.drag : "rgba(255,255,255,0.28)");
            g.rect(-size / 2, -size / 2, size, size);
            g.fill();
            g.lineWidth = lab.lineWidth;
            g.strokeColor = hexToColor(on ? lab.colors.drag : "rgba(0,0,0,0.6)");
            g.rect(-size / 2, -size / 2, size, size);
            g.stroke();
            placeRect(slot.node, { x: h.x - size / 2, y: h.y - size / 2, w: size, h: size });
        });
        const vals = readValues();
        const sel = this.handles.find((h) => h.id === this.selected);
        this.selTag.node.active = !!sel && this.show.labels;
        if (sel) {
            bindLabel(this.selTag, `${sel.label} = ${vals[sel.bind.section][sel.bind.key]}`);
            placeRect(this.selTag.node, { x: sel.x + 10, y: sel.y - 7, w: 180, h: 14 });
        }
        const hovH = this.handles.find((h) => h.id === this.hover);
        this.hovTag.node.active = !!hovH && !sel && this.show.labels;
        if (hovH) {
            bindLabel(this.hovTag, `${hovH.label} = ${vals[hovH.bind.section][hovH.bind.key]}`);
            placeRect(this.hovTag.node, { x: hovH.x + 10, y: hovH.y - 7, w: 180, h: 14 });
        }
    }

    /* ==================== 指针 → 设计 px ==================== */

    /** 引擎给的是 UI 空间坐标;经 capture 的 UITransform 反推到设计空间(左上原点) */
    private toDesign(e: UiTouchEvent): { x: number; y: number } {
        const ui = this.capture.getComponent(UITransform)!;
        const loc = e.getUILocation();
        const local = ui.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        return { x: local.x + DESIGN_W / 2, y: this.screenH / 2 - local.y };
    }

    private bindPointer(): void {
        const pick = (p: { x: number; y: number }) => {
            const lab = viewTable().lab;
            return pickHandle(this.handles, p.x, p.y, lab.grabPx, lab.offAxisFactor);
        };
        this.capture.on(Node.EventType.TOUCH_START, (e: UiTouchEvent) => {
            const p = this.toDesign(e);
            const h = pick(p);
            if (!h) {
                this.selected = null;
                this.markDirty();
                return;
            }
            const vals = readValues();
            this.selected = h.id;
            this.drag = { h, ox: p.x, oy: p.y, base: vals[h.bind.section][h.bind.key] };
            this.markDirty();
        });
        this.capture.on(Node.EventType.TOUCH_MOVE, (e: UiTouchEvent) => {
            const p = this.toDesign(e);
            if (!this.drag) {
                const id = pick(p)?.id ?? null;
                if (id !== this.hover) {
                    this.hover = id;
                    this.markDirty();
                }
                return;
            }
            const step = e.getUIEvent?.()?.shiftKey ? viewTable().lab.coarseStep : 1;
            const dx = Math.round((p.x - this.drag.ox) / step) * step;
            const dy = Math.round((p.y - this.drag.oy) / step) * step;
            const h = this.drag.h;
            applyValue(h.bind.section, h.bind.key, dragValue(h, dx, dy, this.drag.base));
            this.draftDirty = true;
            this.markDirty();
        });
        const end = () => {
            if (!this.drag) return;
            this.drag = null;
            this.draftDirty = true;
            this.markDirty();
        };
        this.capture.on(Node.EventType.TOUCH_END, end);
        this.capture.on(Node.EventType.TOUCH_CANCEL, end);
    }

    /** 键盘微调(由 GameShell 转发):方向键 ±1 格,Shift ±10 格 */
    nudge(dir: "left" | "right" | "up" | "down", coarse: boolean): boolean {
        const h = this.handles.find((x) => x.id === this.selected);
        if (!h) return false;
        const sign = dir === "left" || dir === "up" ? -1 : 1;
        const vals = readValues();
        applyValue(h.bind.section, h.bind.key, nudgeValue(h, sign * (coarse ? viewTable().lab.coarseStep : 1), vals[h.bind.section][h.bind.key]));
        this.draftDirty = true;
        this.markDirty();
        return true;
    }

    /** 探针/自动化入口:按字段名直接设值 */
    setValue(section: "origin" | "deco", key: string, v: number): number {
        const got = applyValue(section, key, v);
        this.draftDirty = true;
        this.markDirty();
        return got;
    }

    /** 探针可读:手柄/字段计数与两份导出文本 */
    probe(): { handles: number; fields: number; dirty: number; balanceText: string; viewTableText: string } {
        const b = this.exportText();
        return { handles: this.handles.length, fields: ALL_FIELDS.length, dirty: dirtyFields(readValues()).length, balanceText: b.balanceText, viewTableText: b.viewTableText };
    }

    /* ==================== 草稿 / 导出 ==================== */

    private restoreDraftOnce(): void {
        const d = decodeDraft(sys.localStorage.getItem(LAB_DRAFT_STORAGE_KEY));
        if (!d) return;
        restoreDraft(d);
        this.skin = d.skin;
        setMenuSkin(d.skin);
        this.table = d.table;
        this.screenH = d.logicalH;
    }

    saveDraft(): void {
        sys.localStorage.setItem(LAB_DRAFT_STORAGE_KEY, encodeDraft(currentDraft(this.screenH, this.skin, this.table)));
        this.draftDirty = false;
        this.markDirty();
    }

    discardDraft(): void {
        sys.localStorage.removeItem(LAB_DRAFT_STORAGE_KEY);
        this.draftDirty = false;
        this.markDirty();
    }

    private refreshExport(): void {
        this.bundle = exportBundle(readValues(), this.skin, this.table);
        if (this.refs.bal) this.refs.bal.textContent = this.bundle.balanceText;
        if (this.refs.vt) this.refs.vt.textContent = this.bundle.viewTableText;
        (globalThis as Record<string, unknown>).__labExport = this.bundle;
    }

    /** 最终粘贴文本(与面板显示同源);宿主/控制台可直接取 */
    exportText(): { balanceText: string; viewTableText: string } {
        this.bundle = exportBundle(readValues(), this.skin, this.table);
        return this.bundle;
    }

    /* ==================== DOM 侧栏(仅浏览器宿主) ==================== */

    private doc(): any {
        return (globalThis as Record<string, unknown>).document;
    }

    private el(tag: string, props: Record<string, any> = {}, ...kids: any[]): any {
        const node = this.doc().createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v === undefined || v === null) continue;
            if (k === "text") node.textContent = String(v);
            else if (typeof v === "function") node.addEventListener(k.replace(/^on/, "").toLowerCase(), v);
            else node.setAttribute(k, String(v));
        }
        for (const kid of kids) node.appendChild(kid);
        return node;
    }

    private text(t: string): any {
        return this.doc().createTextNode(t);
    }

    buildPanel(): void {
        if (!this.hasDom()) return;
        const lab = viewTable().lab;
        const NUM = "width:56px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d";
        const box = this.el("div", {
            style: `position:fixed;right:0;top:0;width:${lab.panelW}px;min-width:${lab.panelW}px;height:100vh;overflow:auto;background:#111725;color:#e6e6e6;border-left:1px solid #232a3d;font-family:system-ui,"Microsoft YaHei",sans-serif;z-index:10`,
        });
        box.appendChild(
            this.el(
                "div",
                { style: "padding:10px 12px;border-bottom:1px solid #232a3d" },
                this.el("div", { style: "font-size:14px;color:#ffd76a;font-weight:700", text: "主菜单布局工作台 · Cocos(dev)" }),
                this.el("div", {
                    style: "font-size:11px;color:#8f9bb3;margin-top:4px;line-height:1.5",
                    text: "拖白点 = 改锚点字段;方向键 ±1(Shift ±10)。浮层与画面同读 menuLayoutPure,松手即所见。导出两段:balance.json 的 {menuLayout,menuSkin} 与 viewTable.json 的 {nineSlice,menu};粘进文件后刷新即生效。",
                })
            )
        );
        const body = this.el("div", { style: "padding:10px 12px" });
        box.appendChild(body);

        /* 虚拟屏高 */
        const hInput = this.el("input", { type: "number", min: String(lab.minScreenH), max: String(lab.maxScreenH), step: "1", value: String(this.screenH), style: NUM }) as HTMLInputElement;
        hInput.addEventListener("change", () => {
            const v = Number(hInput.value) || this.screenH;
            this.screenH = Math.min(lab.maxScreenH, Math.max(lab.minScreenH, v));
            hInput.value = String(this.screenH);
            this.draftDirty = true;
            this.markDirty();
        });
        const viewRow = this.el("div", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#c8c2b1" }, this.text("虚拟屏高 "), hInput);
        for (const n of lab.screenHeights) {
            viewRow.appendChild(this.el("button", { text: String(n), onclick: () => { this.screenH = n; hInput.value = String(n); this.draftDirty = true; this.markDirty(); } }));
        }
        body.appendChild(viewRow);

        /* 浮层开关 */
        const toggleRow = this.el("div", { style: "margin-top:8px" });
        for (const item of [["layout", "布局框"], ["hit", "命中框"], ["guide", "参考带"], ["labels", "标签"]] as const) {
            const cb = this.el("input", { type: "checkbox" });
            cb.checked = this.show[item[0]];
            cb.addEventListener("change", () => {
                this.show[item[0]] = cb.checked;
                this.markDirty();
            });
            toggleRow.appendChild(this.el("label", { style: "display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;color:#c8c2b1" }, cb, this.text(item[1])));
        }
        body.appendChild(toggleRow);

        /* 派生量 */
        this.refs.readout = this.el("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:2px 8px;font-size:11px;color:#9fb4d0;margin-top:6px" });
        body.appendChild(this.el("div", { style: "margin-top:10px;font-size:12px;color:#c8c2b1", text: "派生量(不可直接编辑 —— 改锚点看这里)" }));
        body.appendChild(this.refs.readout);

        /* 九宫格边距 → viewTable.nineSlice.keys */
        const nine = this.el("div", { style: "margin-top:10px;font-size:11px;color:#c8c2b1" }, this.el("div", { text: "九宫格边距(→ viewTable.json 的 nineSlice.keys;留空 = 按源图短边 × factor 自动推导)" }));
        for (const key of MENU_NINE_KEYS) {
            const input = this.el("input", { type: "number", min: "0", step: "1", style: NUM, title: `${key} 边距,0 = 自动` }) as HTMLInputElement;
            input.value = this.table.borders[key] ? String(this.table.borders[key]) : "";
            input.placeholder = `自动 ${borderFor(this.table, key, 0, 0) || "?"}`;
            input.addEventListener("change", () => {
                const n = Number(input.value);
                if (!Number.isFinite(n) || n <= 0) delete this.table.borders[key];
                else this.table.borders[key] = clampBorder(this.table, key, n);
                this.draftDirty = true;
                this.invalidateInsets();
                this.markDirty();
            });
            nine.appendChild(this.el("div", { style: "display:flex;align-items:center;gap:6px;margin:2px 0" }, this.el("span", { style: "font-size:10px;width:170px;color:#5a6a80", text: key }), input));
        }
        body.appendChild(nine);

        body.appendChild(this.buildSkinPanel());

        /* 字段表 */
        const search = this.el("input", { type: "search", placeholder: "按字段名或区块筛选(set / band / gap …)", style: "width:100%;box-sizing:border-box;margin-top:10px;font-size:12px" });
        search.addEventListener("input", () => this.applyFilter(String(search.value ?? "").trim().toLowerCase()));
        body.appendChild(search);
        this.refs.list = this.el("div", { style: "margin-top:6px" });
        body.appendChild(this.refs.list);
        let lastGroup = "";
        for (const r of buildFieldRows(new Map(), this.handles)) {
            if (r.group !== lastGroup) {
                lastGroup = r.group;
                this.refs.list.appendChild(this.el("div", { dataset: { group: r.group }, style: "font-size:11px;color:#5a6a80;margin:8px 0 2px;border-bottom:1px solid #1b2233", text: r.group }));
            }
            this.refs.list.appendChild(this.fieldRow(r.id, r.key, r.step, r.range[0], r.range[1], r.def, r.draggable, r.group));
        }

        /* 导出 */
        this.refs.bal = this.el("pre", { style: "white-space:pre-wrap;font-size:11px;color:#4dffc8;background:#0b0e14;padding:8px;border:1px solid #1b2233;max-height:180px;overflow:auto" });
        this.refs.vt = this.el("pre", { style: "white-space:pre-wrap;font-size:11px;color:#ffd76a;background:#0b0e14;padding:8px;border:1px solid #1b2233;max-height:140px;overflow:auto" });
        const btnRow = this.el(
            "div",
            { style: "margin-top:10px;font-size:12px;color:#c8c2b1" },
            this.text("导出 · balance.json "),
            this.el("button", { text: "保存草稿", title: "写进本地草稿,重进页面自动恢复;不点则关页即丢", onclick: () => this.saveDraft() }),
            this.el("button", { style: "margin-left:6px", text: "丢弃草稿", onclick: () => this.discardDraft() }),
            this.el("button", {
                style: "margin-left:6px",
                text: "全部复位",
                onclick: () => {
                    resetAll();
                    this.skin = { remap: {}, insets: {}, hidden: [], textHidden: [], layers: {} };
                    setMenuSkin(this.skin);
                    this.table = defaultTableState();
                    this.draftDirty = true;
                    this.invalidateInsets();
                    this.markDirty();
                },
            })
        );
        body.appendChild(btnRow);
        body.appendChild(this.refs.bal);
        body.appendChild(this.el("div", { style: "margin-top:8px;font-size:12px;color:#c8c2b1", text: "导出 · viewTable.json" }));
        body.appendChild(this.refs.vt);
        this.refs.status = this.el("div", { style: "margin-top:8px;font-size:11px;color:#8f9bb3;min-height:16px" });
        body.appendChild(this.refs.status);
        this.doc().body.appendChild(box);
        this.panel = box;
    }

    /** 结构树:7 面板按绘制序;四边间距 / 图层显隐 / 图层名 / 双通道换图 */
    private buildSkinPanel(): any {
        const fileInput = this.el("input", { type: "file", accept: "image/*", style: "display:none" });
        let target: string | null = null;
        fileInput.addEventListener("change", () => {
            const key = target;
            target = null;
            const f = fileInput.files && fileInput.files[0];
            fileInput.value = "";
            if (key && f) void this.previewLocal(key, f);
        });
        const box = this.el("div", { style: "margin-top:10px;font-size:12px;color:#c8c2b1" }, this.el("div", { text: "结构树 · 皮肤(显隐 / 换图 / 四边间距 → 导出 menuSkin 段)" }), fileInput);
        const ALL_KEYS = Object.keys(ASSET_MANIFEST);
        for (const p of SKIN_TREE) {
            const insetRow = this.el("div", { style: "display:flex;align-items:center;gap:4px;margin:4px 0 4px 6px;font-size:11px;color:#8f9bb3" }, this.text(`${p.label} 四边间距`));
            for (const side of ["t", "r", "b", "l"] as const) {
                const input = this.el("input", { type: "number", min: "-100", max: "100", step: "1", style: "width:44px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d", title: `${p.label} ${side} 边间距增量` }) as HTMLInputElement;
                this.refs.insets.set(`${p.id}.${side}`, input);
                input.addEventListener("change", () => {
                    const patch = {} as Partial<SkinInsets>;
                    (patch as Record<string, number>)[side] = Number(input.value) || 0;
                    this.commitSkin(applyInsets(this.skin, p.id, patch));
                });
                insetRow.appendChild(this.el("label", { style: "display:inline-flex;align-items:center;gap:2px" }, this.text(side), input));
            }
            box.appendChild(insetRow);
            for (const l of p.layers) {
                const vis = this.el("input", { type: "checkbox", title: l.kind === "image" ? "图层显隐(→ hidden,走缺图回退)" : "文字层显隐(→ textHidden,图照画)" });
                this.refs.vis.set(l.id, vis);
                vis.addEventListener("change", () => this.commitSkin(applyToggle(this.skin, l.id, !!vis.checked)));
                const nameInput = this.el("input", { type: "text", placeholder: l.label, title: "图层名(空 = 默认名;仅随配置透传)", style: "width:88px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" });
                this.refs.names.set(l.id, nameInput);
                nameInput.addEventListener("change", () => this.commitSkin(applyLayerName(this.skin, l.id, String(nameInput.value ?? ""))));
                box.appendChild(
                    this.el("div", { style: "display:flex;align-items:center;gap:6px;margin:2px 0 2px 10px" }, vis, this.el("span", { style: `font-size:11px;color:${l.kind === "image" ? "#ffd76a" : "#9fb4d0"}`, text: l.kind === "image" ? "图" : "文" }), nameInput)
                );
                for (const key of l.assetKeys) {
                    const select = this.el("select", { title: `换图:${key} → 目标资产键(写进 remap,运行时真生效)`, style: "max-width:170px;font-size:11px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" });
                    for (const k of ALL_KEYS) select.appendChild(this.el("option", { value: k, text: k === key ? `${k}(默认)` : k }));
                    this.refs.remap.set(key, select);
                    select.addEventListener("change", () => this.commitSkin(applyRemap(this.skin, key, select.value === key ? null : String(select.value))));
                    const badge = this.el("span", { style: "display:none;font-size:10px;color:#ff9d2e", text: "仅预览" });
                    this.refs.badge.set(key, badge);
                    const clear = this.el("button", {
                        style: "display:none;font-size:11px;padding:0 4px;color:#ff5a6e",
                        text: "×",
                        title: "撤销本地预览",
                        onclick: () => {
                            this.previews.delete(key);
                            this.restoreFrame(key);
                            this.markDirty();
                        },
                    });
                    this.refs.clear.set(key, clear);
                    box.appendChild(
                        this.el("div", { style: "display:flex;align-items:center;gap:4px;margin:1px 0 1px 26px" }, this.el("span", { style: "font-size:10px;color:#5a6a80;width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", title: key, text: key }), select, badge, clear)
                    );
                }
            }
        }
        return box;
    }

    private fieldRow(id: string, key: string, step: number, min: number, max: number, def: number, draggable: boolean, group: string): any {
        const [section, field] = id.split(".");
        const input = this.el("input", { type: "number", step: String(step), min: String(min), max: String(max), style: "width:62px;font-size:12px;background:#0b0e14;color:#e6e6e6;border:1px solid #232a3d" }) as HTMLInputElement;
        this.refs.inputs.set(id, input);
        const commit = (v: number) => {
            applyValue(section as "origin" | "deco", field, v);
            this.draftDirty = true;
            this.markDirty();
        };
        input.addEventListener("change", () => commit(Number(input.value)));
        const bump = (dir: number) =>
            this.el("button", {
                style: "width:22px;font-size:12px;padding:0",
                text: dir > 0 ? "+" : "−",
                onclick: () => commit(readValues()[section as "origin" | "deco"][field] + dir * step),
            });
        const reset = this.el("button", {
            style: "width:22px;font-size:11px;padding:0;display:none",
            text: "↺",
            title: `恢复默认 ${def}`,
            onclick: () => {
                applyValue(section as "origin" | "deco", field, def);
                this.draftDirty = true;
                this.markDirty();
            },
        });
        const row = this.el(
            "div",
            {
                dataset: { id, group },
                title: `${key} · 默认 ${def} · 范围 ${min}~${max}`,
                style: "display:flex;align-items:center;gap:4px;padding:1px 2px;border-left:2px solid transparent",
                onclick: () => {
                    if (!draggable) return;
                    this.selected = id;
                    this.markDirty();
                },
            },
            this.el("span", { style: "flex:1;font-size:12px;color:#c8c2b1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: `${draggable ? "◆" : "·"} ${key}` }),
            bump(-1),
            input,
            bump(1),
            reset
        );
        this.refs.rows.set(id, row);
        return row;
    }

    private applyFilter(q: string): void {
        const list = this.refs.list;
        if (!list) return;
        const kids = Array.from(list.children) as HTMLElement[];
        const shown: boolean[] = [];
        for (const node of kids) {
            const id = node.getAttribute("data-id");
            if (id) shown.push(!q || id.toLowerCase().includes(q) || (node.getAttribute("data-group") ?? "").toLowerCase().includes(q));
            else shown.push(true);
        }
        let any = false;
        for (let i = kids.length - 1; i >= 0; i--) {
            const isField = !!kids[i].getAttribute("data-id");
            if (isField) {
                kids[i].style.display = shown[i] ? "" : "none";
                any = any || shown[i];
            } else {
                kids[i].style.display = any ? "" : "none";
                any = false;
            }
        }
    }

    private syncPanel(L: MenuLayout): void {
        if (!this.panel) return;
        const active = this.doc().activeElement;
        const vals = readValues();
        const dirty = new Set(dirtyFields(vals));
        for (const f of ALL_FIELDS) {
            const input = this.refs.inputs.get(f.id);
            const row = this.refs.rows.get(f.id);
            if (!input || !row) continue;
            if (active !== input) input.value = String(vals[f.section][f.key]);
            const isDirty = dirty.has(f.id);
            row.style.background = isDirty ? "rgba(255,215,106,0.08)" : "";
            row.style.borderLeftColor = this.selected === f.id ? viewTable().lab.colors.drag : "transparent";
            const reset = row.lastElementChild as HTMLElement | null;
            if (reset) reset.style.display = isDirty ? "" : "none";
        }
        for (const node of buildSkinTree(this.skin)) {
            const ins = this.skin.insets[node.panelId as MenuPanelId] ?? { t: 0, r: 0, b: 0, l: 0 };
            for (const side of ["t", "r", "b", "l"] as const) {
                const input = this.refs.insets.get(`${node.panelId}.${side}`);
                if (input && active !== input) input.value = String((ins as unknown as Record<string, number>)[side]);
            }
            for (const row of node.layers) {
                const vis = this.refs.vis.get(row.layerId);
                if (vis) vis.checked = row.visible;
                const nameInput = this.refs.names.get(row.layerId);
                if (nameInput && active !== nameInput) nameInput.value = this.skin.layers[row.layerId]?.name ?? "";
                for (const key of row.assetKeys) {
                    const select = this.refs.remap.get(key);
                    if (select && active !== select) select.value = row.resolved[key];
                    const on = this.previews.has(key);
                    const badge = this.refs.badge.get(key);
                    if (badge) badge.style.display = on ? "" : "none";
                    const clear = this.refs.clear.get(key);
                    if (clear) clear.style.display = on ? "" : "none";
                }
            }
        }
        if (this.refs.readout) {
            this.refs.readout.textContent = "";
            for (const d of derivedReadout(L)) {
                this.refs.readout.appendChild(this.el("span", { style: "color:#5a6a80", text: d.label }));
                this.refs.readout.appendChild(this.el("span", { text: d.value }));
            }
        }
        if (this.refs.status) {
            this.refs.status.textContent =
                `dirty ${dirty.size}/${ALL_FIELDS.length} 字段 · 手柄 ${this.handles.length}` +
                (this.draftDirty ? " ● 有未保存的改动" : "") +
                (menuLayoutWarnings.length ? ` · ⚠ ${menuLayoutWarnings.slice(0, 2).join(";")}` : "");
        }
    }

    private commitSkin(next: MenuSkinTable): void {
        this.skin = next;
        setMenuSkin(next);
        this.draftDirty = true;
        this.invalidateInsets();
        this.markDirty();
    }

    /* ==================== 双通道换图 · 通道二:本地预览 ==================== */

    /** 选一张本地图顶掉某个资产键:只改内存帧表,刷新即失,绝不进导出 */
    private async previewLocal(key: string, file: File): Promise<void> {
        const url = (globalThis as Record<string, any>).URL.createObjectURL(file);
        const ext = /\.(\w+)$/.exec(file.name)?.[1] ?? "png";
        const frame = await new Promise<SpriteFrame | null>((resolve) => {
            assetManager.loadRemote<ImageAsset>(url, { ext: `.${ext}` }, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }
                const tex = (asset as any).texture; // ImageAsset 的 texture 访问器在 3.8.8 的 d.ts 未声明,运行时存在
                if (!tex) {
                    resolve(null);
                    return;
                }
                const sf = new SpriteFrame();
                sf.texture = tex;
                resolve(sf);
            });
        });
        (globalThis as Record<string, any>).URL.revokeObjectURL(url);
        if (!frame) return;
        this.previewBackup.set(key, this.o.frames.get(key) ?? null);
        this.o.frames.set(key, frame);
        this.previews.add(key);
        this.invalidateInsets();
        this.markDirty();
    }

    private restoreFrame(key: string): void {
        const bak = this.previewBackup.get(key);
        if (bak) this.o.frames.set(key, bak);
        else this.o.frames.delete(key);
        this.previewBackup.delete(key);
        this.invalidateInsets();
    }
}
