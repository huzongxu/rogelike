/**
 * 布局台皮肤模型(结构树 + 导出)—— dev-only 的纯函数层,Web 与 Cocos 两端共用。
 *
 * 拓扑固定(绘制序 7 面板;除 strip 无文字层外各 2 层,共 13 层),不随配置变化:
 * 真正的图层增删需重写绘制代码,已在设计边界外。
 *
 * 全部 apply* 为不可变更新(入参不改,返回新表);导出走白名单 ——
 * 只允许 {remap, insets, hidden, textHidden, layers} 五段,脏键/非法值一律滤掉,
 * 本地文件预览(宿主侧的图片覆盖通道)是运行期状态,绝不出现在导出里。
 */

import {
  MENU_PANEL_IDS,
  MENU_SKIN_INSET_RANGE,
  type MenuPanelId,
  type MenuSkinTable,
  type SkinInsets,
} from "../data/menuSkin";

export type { MenuPanelId, MenuSkinTable, SkinInsets } from "../data/menuSkin";

/** 图层种类:图(可换图/隐藏图)/ 文(可隐藏文字) */
export type SkinLayerKind = "image" | "text";

export interface SkinLayerDef {
  /** 图层唯一 id:`<panel>.<kind>` */
  id: string;
  kind: SkinLayerKind;
  /** 默认中文层名(可被 skin.layers[id].name 覆盖) */
  label: string;
  /** 图层的资产键(文字层为空数组;一个面板的图层可含多张图,显隐/换图按层整体作用于全部键) */
  assetKeys: string[];
}

export interface SkinPanelDef {
  id: MenuPanelId;
  /** 面板中文名 */
  label: string;
  /** 绘制序(布局台只读展示,不提供重排) */
  z: number;
  layers: SkinLayerDef[];
}

/** 固定拓扑:键名与主菜单绘制实际使用的资产键一致 */
export const SKIN_TREE: readonly SkinPanelDef[] = [
  { id: "title", label: "标题横幅", z: 0, layers: [
    { id: "title.image", kind: "image", label: "横幅图", assetKeys: ["menu_title_plate", "crest_echo"] },
    { id: "title.text", kind: "text", label: "标题文", assetKeys: [] },
  ] },
  { id: "strip", label: "货币条", z: 1, layers: [
    { id: "strip.image", kind: "image", label: "底板图", assetKeys: ["menu_strip_plate"] },
  ] },
  { id: "chip", label: "筹码", z: 2, layers: [
    { id: "chip.image", kind: "image", label: "筹码底板图", assetKeys: ["menu_chip_plate"] },
    { id: "chip.text", kind: "text", label: "筹码文字", assetKeys: [] },
  ] },
  { id: "section", label: "分区标题条", z: 3, layers: [
    { id: "section.image", kind: "image", label: "条图", assetKeys: ["menu_section_strip"] },
    { id: "section.text", kind: "text", label: "条文", assetKeys: [] },
  ] },
  { id: "row", label: "关卡行", z: 4, layers: [
    { id: "row.image", kind: "image", label: "行板图", assetKeys: ["menu_row_plate", "menu_row_plate_current"] },
    { id: "row.text", kind: "text", label: "行文字", assetKeys: [] },
  ] },
  { id: "setCard", label: "套组卡", z: 5, layers: [
    { id: "setCard.image", kind: "image", label: "卡图", assetKeys: ["menu_set_plate", "menu_set_plate_selected"] },
    { id: "setCard.text", kind: "text", label: "卡文字", assetKeys: [] },
  ] },
  { id: "note", label: "说明板", z: 6, layers: [
    { id: "note.image", kind: "image", label: "板图", assetKeys: ["menu_note_plate"] },
    { id: "note.text", kind: "text", label: "板文字", assetKeys: [] },
  ] },
];

function layerDef(layerId: string): SkinLayerDef | undefined {
  for (const p of SKIN_TREE) for (const l of p.layers) if (l.id === layerId) return l;
  return undefined;
}

/**
 * 换图映射的唯一解析口径(绘制层与结构树共用)。
 * 目标键是否真的存在由宿主资源的就绪判定决定 —— 取不到就走与缺图完全相同的回退形状。
 */
export function resolveSkinKey(skin: MenuSkinTable, fromKey: string): string {
  const to = skin.remap[fromKey];
  return typeof to === "string" && to ? to : fromKey;
}

/** 该资产键当前是否被整图隐藏 */
export function isSkinHidden(skin: MenuSkinTable, assetKey: string): boolean {
  return skin.hidden.includes(assetKey);
}

/** 该面板的文字层是否被隐藏 */
export function isSkinTextHidden(skin: MenuSkinTable, panelId: MenuPanelId): boolean {
  return skin.textHidden.includes(panelId);
}

/** 面板四边间距增量(未配置 = 全零 = 恒等) */
export function skinInsetsOf(skin: MenuSkinTable, panelId: MenuPanelId): SkinInsets {
  return { ...(skin.insets[panelId] ?? { t: 0, r: 0, b: 0, l: 0 }) };
}

/* ============================ 树形行数据 ============================ */

export interface SkinTreeLayerRow {
  layerId: string;
  kind: SkinLayerKind;
  /** 显示名(layers 段自定义名优先,否则默认层名) */
  displayName: string;
  /** 图:全部资产键未被隐藏;文:面板不在 textHidden */
  visible: boolean;
  /** 图层资产键(文字层为空) */
  assetKeys: string[];
  /** 每个资产键当前实际显示的键(经 remap 解析;未换 = 原键) */
  resolved: Record<string, string>;
  /** 所在面板的四边间距(面板级,两层共享同一份) */
  insets: SkinInsets;
}

export interface SkinTreeNode {
  panelId: MenuPanelId;
  panelLabel: string;
  z: number;
  layers: SkinTreeLayerRow[];
}

const ZERO_INSETS: SkinInsets = { t: 0, r: 0, b: 0, l: 0 };

export function buildSkinTree(skin: MenuSkinTable): SkinTreeNode[] {
  return SKIN_TREE.map((p) => ({
    panelId: p.id,
    panelLabel: p.label,
    z: p.z,
    layers: p.layers.map((l) => {
      const resolved: Record<string, string> = {};
      for (const k of l.assetKeys) resolved[k] = resolveSkinKey(skin, k);
      const visible = l.kind === "image" ? l.assetKeys.every((k) => !isSkinHidden(skin, k)) : !isSkinTextHidden(skin, p.id);
      return {
        layerId: l.id,
        kind: l.kind,
        displayName: skin.layers[l.id]?.name ?? l.label,
        visible,
        assetKeys: [...l.assetKeys],
        resolved,
        insets: skinInsetsOf(skin, p.id),
      };
    }),
  }));
}

/* ============================ 不可变更新 ============================ */

function clone(skin: MenuSkinTable): MenuSkinTable {
  return {
    remap: { ...skin.remap },
    insets: Object.fromEntries(Object.entries(skin.insets).map(([k, v]) => [k, { ...v }])),
    hidden: [...skin.hidden],
    textHidden: [...skin.textHidden],
    layers: Object.fromEntries(Object.entries(skin.layers).map(([k, v]) => [k, { ...v }])),
  };
}

/** 图层显隐:图层整体作用于其全部资产键(图)/面板(文) */
export function applyToggle(skin: MenuSkinTable, layerId: string, on: boolean): MenuSkinTable {
  const l = layerDef(layerId);
  if (!l) return skin;
  const next = clone(skin);
  if (l.kind === "image") {
    const set = new Set(next.hidden);
    for (const k of l.assetKeys) {
      if (on) set.delete(k);
      else set.add(k);
    }
    next.hidden = [...set];
  } else {
    const panel = layerId.split(".")[0] as MenuPanelId;
    next.textHidden = on ? next.textHidden.filter((p) => p !== panel) : [...new Set([...next.textHidden, panel])];
  }
  return next;
}

/** 换图映射:toKey 为 null = 还原(删除映射) */
export function applyRemap(skin: MenuSkinTable, fromKey: string, toKey: string | null): MenuSkinTable {
  const next = clone(skin);
  if (toKey === null || toKey === fromKey) delete next.remap[fromKey];
  else next.remap[fromKey] = toKey;
  return next;
}

const clampInset = (v: number) => Math.max(MENU_SKIN_INSET_RANGE[0], Math.min(MENU_SKIN_INSET_RANGE[1], Math.round(v)));

/** 四边间距(面板级):与现值合并、钳位;四边归零则删除该面板段 */
export function applyInsets(skin: MenuSkinTable, panelId: MenuPanelId, patch: Partial<SkinInsets>): MenuSkinTable {
  const next = clone(skin);
  const cur = next.insets[panelId] ?? { ...ZERO_INSETS };
  const merged: SkinInsets = {
    t: clampInset(patch.t ?? cur.t),
    r: clampInset(patch.r ?? cur.r),
    b: clampInset(patch.b ?? cur.b),
    l: clampInset(patch.l ?? cur.l),
  };
  if (merged.t === 0 && merged.r === 0 && merged.b === 0 && merged.l === 0) delete next.insets[panelId];
  else next.insets[panelId] = merged;
  return next;
}

/** 图层改名:name 为空 = 恢复默认名(删除条目) */
export function applyLayerName(skin: MenuSkinTable, layerId: string, name: string | null): MenuSkinTable {
  if (!layerDef(layerId)) return skin;
  const next = clone(skin);
  if (name === null || name.trim() === "") delete next.layers[layerId];
  else next.layers[layerId] = { name: name.trim() };
  return next;
}

/* ============================ 白名单导出 ============================ */

const SIDES = ["t", "r", "b", "l"] as const;

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 白名单序列化:输出 ⊆ {remap, insets, hidden, textHidden, layers},空段省略。
 * 入参即使带脏键/非法值也会被滤净(导出直接给 balance.json 用)。
 * 全空返回 "{}" —— 配合"空皮肤 = 恒等"即零画面变化。
 */
export function exportSkinJson(skin: MenuSkinTable): string {
  const raw = skin as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const remap: Record<string, string> = {};
  if (raw.remap && typeof raw.remap === "object") {
    for (const [k, v] of Object.entries(raw.remap as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && v !== k) remap[k] = v;
    }
  }
  if (Object.keys(remap).length) out.remap = remap;

  const insets: Record<string, SkinInsets> = {};
  if (raw.insets && typeof raw.insets === "object") {
    for (const pid of MENU_PANEL_IDS) {
      const p = (raw.insets as Record<string, unknown>)[pid];
      if (!p || typeof p !== "object") continue;
      const rec = p as Record<string, unknown>;
      const ins: SkinInsets = { t: 0, r: 0, b: 0, l: 0 };
      for (const s of SIDES) if (isNum(rec[s])) ins[s] = clampInset(rec[s] as number);
      if (ins.t || ins.r || ins.b || ins.l) insets[pid] = ins;
    }
  }
  if (Object.keys(insets).length) out.insets = insets;

  if (Array.isArray(raw.hidden)) {
    const hidden = (raw.hidden as unknown[]).filter((v): v is string => typeof v === "string");
    if (hidden.length) out.hidden = [...new Set(hidden)];
  }

  if (Array.isArray(raw.textHidden)) {
    const textHidden = (raw.textHidden as unknown[]).filter((v): v is MenuPanelId => MENU_PANEL_IDS.includes(v as MenuPanelId));
    if (textHidden.length) out.textHidden = [...new Set(textHidden)];
  }

  const layers: Record<string, { name: string }> = {};
  if (raw.layers && typeof raw.layers === "object") {
    for (const [id, v] of Object.entries(raw.layers as Record<string, unknown>)) {
      if (!layerDef(id)) continue;
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).name === "string") {
        const name = ((v as Record<string, unknown>).name as string).trim();
        if (name) layers[id] = { name };
      }
    }
  }
  if (Object.keys(layers).length) out.layers = layers;

  return JSON.stringify(out, null, 2);
}

/** 结构树的全部资产键(九宫格边距表与换图下拉共用) */
export function skinAssetKeys(): string[] {
  const out: string[] = [];
  for (const p of SKIN_TREE) for (const l of p.layers) for (const k of l.assetKeys) if (!out.includes(k)) out.push(k);
  return out;
}

/**
 * 合并导出:布局台最终粘贴文本 = {menuLayout?, menuSkin?}。
 * 任一段为 null 或皮肤段为 "{}" 时省略;两段都无 → "{}"。
 * JSON 解析失败直接抛出(布局台侧提示,不放行坏配置)。
 */
export function mergeExport(menuLayoutJson: string | null, skinJson: string | null): string {
  const merged: Record<string, unknown> = {};
  if (menuLayoutJson !== null) merged.menuLayout = JSON.parse(menuLayoutJson);
  if (skinJson !== null && skinJson.trim() !== "{}") merged.menuSkin = JSON.parse(skinJson);
  return JSON.stringify(merged, null, 2);
}
