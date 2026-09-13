/**
 * 布局台模型单测 —— 手柄锚点的「有限差分」闸门。
 *
 * 为什么值得单独测:布局台是"拖锚点改表",而本项目的几何全是派生的。锚点写错一位、
 * 或忘标雅可比倍率(`endlessW` 居中 → 右缘每移 1px 宽变 2px),表现是"数值改了画面不动"
 * 与"拖 1px 跳 2px" —— 恰好是这把工具要消灭的失败模式(说不清往左一点)。
 * 于是对每个手柄做一次实测:从默认值出发沿绑定轴拖 2 设计 px,断言
 *  ① 字段值真的变化 2·scale·sign(没被取值域悄悄钳掉)
 *  ② 手柄锚点真的同步走 2px(符号与倍率都对)
 *  ③ 该字段在四种环境(标题条就绪/缺 × 996/1246)下始终存在且位置合法
 *
 * 自由轴(手柄沿那条边滑动的坐标)**不**锁死:它跟着所属区块走是特性(标题条变宽时
 * 手柄仍贴在条上),不是误差。
 *
 * 规则:数值不符就停下来报告,不得改期望值。
 */

import { describe, it, expect } from "vitest";
import CONFIG_MD from "../docs/CONFIG-TABLES.md?raw";
import { menuLayoutPure, type MenuLayout, type MenuLayoutEnv } from "@game/ui/menuLayout";
import { MENU_LAYOUT_DEFAULTS, MENU_LAYOUT_RANGE, applyBalance, snapshotMenuLayout } from "@game/data/layoutMenu";
import type { MenuLayoutTable } from "@game/data/layoutMenu";
import { STAGES } from "@game/data/stages";
import type { SetId } from "@game/data/sets";
import {
  ALL_FIELDS,
  DECO_KEYS,
  ORIGIN_KEYS,
  applyValue,
  buildFieldRows,
  buildGuides,
  buildHandles,
  clampValue,
  decoGroupOf,
  defaultValueOf,
  derivedReadout,
  dirtyFields,
  dragValue,
  exportJson,
  listBottomY,
  nudgeValue,
  parseFieldDocs,
  rangeOf,
  readValues,
  resetAll,
  stepOf,
  type Handle,
  type HandleContext,
} from "../src/dev/labModel";

const W = 560;
const ROW_PLATE = { w: 1024, h: 95 };
const SETS_3: SetId[] = ["thorn", "barrage", "ember"];
const STAGE_IDS = STAGES.map((s) => s.id);

/** 每手柄差分的拖动距离(设计 px):取 2 是为了避开 Math.round 的 1px 量化噪声 */
const PX = 2;

function envOf(sectionReady: boolean, table?: MenuLayoutTable): MenuLayoutEnv {
  return {
    table: table ?? snapshotMenuLayout(),
    stageIds: STAGE_IDS,
    setIds: SETS_3,
    sectionStripReady: sectionReady,
    rowPlateSize: ROW_PLATE,
  };
}

/** 与 layoutWorkbench.handleContext 同口径:第 2 行显示补星钮,套组选第 2 张 */
function ctxOf(L: MenuLayout, h: number): HandleContext {
  return {
    w: W,
    h,
    makeupRows: L.rows.map((_, i) => i === 1),
    selectedSet: "barrage",
  };
}

function snapshot(h: number, sectionReady: boolean) {
  const L = menuLayoutPure(W, h, envOf(sectionReady));
  return { L, ctx: ctxOf(L, h), handles: buildHandles(L, ctxOf(L, h)) };
}

const CASES = [
  { name: "996 标题条就绪", h: 996, ready: true },
  { name: "996 缺标题条", h: 996, ready: false },
  { name: "1246 标题条就绪", h: 1246, ready: true },
  { name: "1246 缺标题条", h: 1246, ready: false },
];

/* ==================== 1. 字段清单 ==================== */

describe("字段清单", () => {
  it("origin 37 + deco 91 = 128,且 id 唯一", () => {
    expect(ORIGIN_KEYS.length).toBe(37);
    expect(DECO_KEYS.length).toBe(91);
    expect(ALL_FIELDS.length).toBe(128);
    expect(new Set(ALL_FIELDS.map((f) => f.id)).size).toBe(128);
  });

  it("每个字段都有取值域、默认值在域内", () => {
    for (const f of ALL_FIELDS) {
      const [min, max] = rangeOf(f.section, f.key);
      expect(min < max, f.id).toBe(true);
      const def = defaultValueOf(f.section, f.key);
      expect(def >= min && def <= max, `${f.id} 默认 ${def} 越界 ${min}~${max}`).toBe(true);
    }
  });

  it("origin 取值域覆盖全部字段(与加载器同一张表)", () => {
    expect(Object.keys(MENU_LAYOUT_RANGE).sort()).toEqual([...ORIGIN_KEYS].sort());
  });

  it("步进:整数字段 ±1,非整数(角深系数)按 0.05", () => {
    expect(stepOf("origin", "pad")).toBe(1);
    expect(stepOf("origin", "rowPlateF")).toBe(0.05);
    expect(stepOf("deco", "banY")).toBe(1);
  });

  it("兜底分组表覆盖全部 deco 键(文档缺失时面板仍能分组)", () => {
    const orphan = DECO_KEYS.filter((k) => decoGroupOf(k) === "其他");
    expect(orphan).toEqual([]);
  });
});

/* ==================== 2. 手柄集合 ==================== */

describe("手柄集合", () => {
  it("一个字段只一个手柄,且都能落到表里的真实字段", () => {
    for (const c of CASES) {
      const { handles } = snapshot(c.h, c.ready);
      const ids = handles.map((h) => h.id);
      expect(new Set(ids).size, c.name).toBe(ids.length);
      const known = new Set(ALL_FIELDS.map((f) => f.id));
      for (const id of ids) expect(known.has(id), `${c.name} 未知字段 ${id}`).toBe(true);
      for (const h of handles) {
        expect(MENU_LAYOUT_DEFAULTS[h.bind.section]).toHaveProperty(h.bind.key);
      }
    }
  });

  it("同一组同轴的手柄自由轴互不重合(JITTER 生效)", () => {
    for (const c of CASES) {
      const { handles } = snapshot(c.h, c.ready);
      const seen = new Map<string, number[]>();
      for (const h of handles) {
        const free = h.axis === "x" ? h.y : h.x;
        const arr = seen.get(`${h.group}${h.axis}`) ?? [];
        expect(arr.includes(free), `${c.name} ${h.group} ${h.axis} 轴上有手柄重叠在 ${free}`).toBe(false);
        arr.push(free);
        seen.set(`${h.group}${h.axis}`, arr);
      }
    }
  });

  it("手柄都在设计空间内(出界 = 点不中)", () => {
    for (const c of CASES) {
      const { handles } = snapshot(c.h, c.ready);
      for (const h of handles) {
        expect(h.x >= 0 && h.x <= W, `${c.name} ${h.id} x=${h.x} 出界`).toBe(true);
        expect(h.y >= 0 && h.y <= c.h, `${c.name} ${h.id} y=${h.y} 出界`).toBe(true);
      }
    }
  });

  it("锚点依赖文字测量的字段一律不给手柄(法则 4:假锚点比没有更坏)", () => {
    const { handles } = snapshot(1246, true);
    const ids = new Set(handles.map((h) => h.id));
    for (const key of [
      "deco.chipIconW", "deco.chipIconGap", "deco.chipProbePad", "deco.chipInnerGap", "deco.chipTailPad",
      "deco.phChipProbeW", "deco.phChipPadAdd", "deco.phChipPadMin", "deco.checkOffX", "deco.checkOffY",
      "deco.checkSize", "deco.checkAdvance", "deco.starSize", "deco.starGap", "deco.starOffX", "deco.starLift",
      "deco.setBadgeSize", "deco.setIconW", "deco.setIconH", "deco.tagPad", "deco.gemOffX", "deco.gemOffY",
      "deco.gemW", "deco.gemH", "deco.badgeR", "deco.badgeStroke", "deco.badgeTextOffY",
      "deco.listHintFallbackY", "deco.noteCapNum", "deco.noteCapDen", "deco.rowMakeupReserve",
      "origin.entryCount", "origin.rowMinH", "origin.rowMaxH", "origin.rowMaxGap", "origin.rowPlateF",
      "origin.sectionSrcW", "origin.sectionSrcH", "origin.setBandNum", "origin.setBandDen",
      "origin.noteBandNum", "origin.noteBandDen",
    ]) {
      expect(ids.has(key), `${key} 依赖文字测量/条件分支,不该有手柄`).toBe(false);
    }
  });

  it("环境相关手柄:标题条缺失时不给 stageHdrY/sectionH/setHdrGap,改给 listYNoSection/endlessGapFlat", () => {
    const ready = new Set(snapshot(1246, true).handles.map((h) => h.id));
    const flat = new Set(snapshot(1246, false).handles.map((h) => h.id));
    for (const id of ["origin.stageHdrY", "origin.sectionH", "origin.setHdrGap", "origin.hdrBand", "deco.sectionTextPad"]) {
      expect(ready.has(id)).toBe(true);
      expect(flat.has(id)).toBe(false);
    }
    expect(ready.has("origin.endlessGapFlat")).toBe(false);
    expect(ready.has("origin.endlessGapSet")).toBe(true);
    expect(flat.has("origin.endlessGapFlat")).toBe(true);
    expect(flat.has("origin.listYNoSection")).toBe(true);
    expect(ready.has("origin.listYNoSection")).toBe(false);
  });
});

/* ==================== 3. 每手柄有限差分(核心) ==================== */

describe.each(CASES)("手柄锚点差分 · $name", ({ h, ready }) => {
  it("沿绑定轴拖 2px → 值变 2·scale·sign,锚点同步走 2px", () => {
    const base = snapshot(h, ready);
    expect(base.handles.length).toBeGreaterThan(40);
    const failed: string[] = [];
    for (const handle of base.handles) {
      const { section, key, sign, scale } = handle.bind;
      const cur = readValues()[section][key];
      const delta = (scale ?? 1) * PX;
      resetAll();
      const applied = applyValue(section, key, cur + delta);
      if (Math.abs(applied - (cur + delta)) > 1e-9) {
        failed.push(`${handle.id}: 目标 ${cur + delta} 被钳到 ${applied}(默认值贴近取值上界)`);
        continue;
      }
      const after = snapshot(h, ready).handles.find((v) => v.id === handle.id);
      if (!after) {
        failed.push(`${handle.id}: 改动后手柄消失`);
        continue;
      }
      const move = after[handle.axis] - handle[handle.axis];
      if (Math.abs(move - sign * PX) > 1e-4) {
        failed.push(`${handle.id}: 拖 ${PX}px 期望锚点 ${sign * PX >= 0 ? "+" : ""}${sign * PX},实际 ${move.toFixed(4)}(scale=${scale ?? 1})`);
      }
    }
    resetAll();
    expect(failed).toEqual([]);
  });
});

/* ==================== 4. 拖动/微调纯函数 ==================== */

describe("dragValue / nudgeValue", () => {
  const handle = (partial: Partial<Handle>): Handle => ({
    id: "deco.crestOffX",
    group: "纹章",
    label: "↔crestOffX",
    x: 100,
    y: 100,
    axis: "x",
    bind: { section: "deco", key: "crestOffX", sign: 1 },
    ...partial,
  });

  it("x 轴手柄只吃 dpx,y 轴手柄只吃 dpy", () => {
    resetAll();
    expect(dragValue(handle({}), 5, -999, 2)).toBe(7);
    expect(dragValue(handle({ axis: "y", bind: { section: "deco", key: "crestOffY", sign: 1 } }), -999, 5, 16)).toBe(21);
  });

  it("sign=-1 反向;scale 放大力度", () => {
    expect(dragValue(handle({ bind: { section: "deco", key: "banInset", sign: -1 } }), 3, 0, 6)).toBe(3);
    expect(dragValue(handle({ bind: { section: "origin", key: "endlessW", sign: 1, scale: 2 } }), 3, 0, 260)).toBe(266);
  });

  it("钳到边界而非回退默认(与加载器口径故意不同),且随拖距单调", () => {
    const prev = readValues().deco.crestOffX;
    expect(clampValue("deco", "crestOffX", 9999)).toBe(200);
    expect(clampValue("deco", "crestOffX", -9999)).toBe(-200);
    expect(clampValue("origin", "entryGap", 9999)).toBe(32);
    expect(clampValue("origin", "pad", NaN)).toBe(16);
    expect(clampValue("origin", "rowPlateF", 0.37)).toBeCloseTo(0.35, 6);
    let last = -9999;
    for (let d = -300; d <= 300; d += 7) {
      const v = dragValue(handle({}), d, 0, prev);
      expect(v >= last).toBe(true);
      last = v;
    }
  });

  it("方向键按 step 走格,负格数反向", () => {
    expect(nudgeValue(handle({}), 1, 2)).toBe(3);
    expect(nudgeValue(handle({}), -2, 2)).toBe(0);
    const f = handle({ id: "origin.rowPlateF", bind: { section: "origin", key: "rowPlateF", sign: 1 } });
    expect(nudgeValue(f, 1, 0.35)).toBeCloseTo(0.4, 6);
  });
});

/* ==================== 5. 导出/回读(热调通道闭环) ==================== */

describe("exportJson 闭环", () => {
  it("干净状态导不出任何字段", () => {
    resetAll();
    expect(dirtyFields(readValues())).toEqual([]);
    expect(JSON.parse(exportJson(readValues())).menuLayout).toEqual({});
  });

  it("只导 dirty,粘回 applyBalance 后逐字段复现", () => {
    resetAll();
    applyValue("origin", "pad", 22);
    applyValue("deco", "banY", 9);
    const vals = readValues();
    expect(dirtyFields(vals)).toEqual(["origin.pad", "deco.banY"]);
    const payload = JSON.parse(exportJson(vals)) as { menuLayout: Record<string, Record<string, number>> };
    expect(payload.menuLayout.origin.pad).toBe(22);
    expect(payload.menuLayout.deco.banY).toBe(9);
    expect(Object.keys(payload.menuLayout.origin).length).toBe(1);

    resetAll();
    expect(readValues().origin.pad).toBe(16);
    applyBalance(payload.menuLayout);
    const back = readValues();
    expect(back.origin.pad).toBe(22);
    expect(back.deco.banY).toBe(9);
    expect(dirtyFields(back)).toEqual(["origin.pad", "deco.banY"]);
  });

  it("all=true 导出完整 128 字段", () => {
    resetAll();
    const payload = JSON.parse(exportJson(readValues(), { all: true })) as { menuLayout: Record<string, Record<string, number>> };
    expect(Object.keys(payload.menuLayout.origin).length).toBe(37);
    expect(Object.keys(payload.menuLayout.deco).length).toBe(91);
  });

  it("拖到取值上界也能被加载器接受(编辑器钳到边界的意义)", () => {
    resetAll();
    applyValue("origin", "endlessW", 10_000);
    applyValue("deco", "noteSlide", -10_000);
    const payload = JSON.parse(exportJson(readValues())) as { menuLayout: Record<string, Record<string, number>> };
    applyBalance({});
    applyBalance(payload.menuLayout);
    expect(readValues().origin.endlessW).toBe(560);
    expect(readValues().deco.noteSlide).toBe(-200);
  });

  it("resetAll 等价于删掉 balance.json 的 menuLayout 段", () => {
    applyValue("origin", "entryY", 120);
    resetAll();
    const v = readValues();
    for (const f of ALL_FIELDS) expect(v[f.section][f.key]).toBe(defaultValueOf(f.section, f.key));
  });
});

/* ==================== 6. 文档零重复 ==================== */

describe("parseFieldDocs(直接吃 docs/CONFIG-TABLES.md)", () => {
  const docs = parseFieldDocs(CONFIG_MD);

  it("128 字段全部拿到说明,且带区块", () => {
    const missing = ALL_FIELDS.filter((f) => !docs.has(f.id)).map((f) => f.id);
    expect(missing).toEqual([]);
    for (const f of ALL_FIELDS) {
      const doc = docs.get(f.id)!;
      expect(doc.desc.length, f.id).toBeGreaterThan(0);
      expect(doc.group.length, f.id).toBeGreaterThan(0);
    }
  });

  it("origin 文档默认值与规范表一致(防文档与代码两张皮)", () => {
    for (const key of ORIGIN_KEYS) {
      const doc = docs.get(`origin.${key}`)!;
      expect(Number(doc.def), `origin.${key} 文档默认 ${doc.def}`).toBe(MENU_LAYOUT_DEFAULTS.origin[key]);
    }
  });

  it("文档里没有的键不会混进来", () => {
    for (const id of docs.keys()) expect(ALL_FIELDS.some((f) => f.id === id)).toBe(true);
  });

  it("文档结构被改坏时退化成空表(不抛异常、面板靠兜底分组)", () => {
    expect(parseFieldDocs("").size).toBe(0);
    expect(parseFieldDocs("## 别的章节\n| pad | 1 | 0~2 | x |").size).toBe(0);
    expect(parseFieldDocs("## menuLayout · 主菜单布局\n本节表格还没补上。\n").size).toBe(0);
    // 表里有、规范表里没有的键一律不认(防文档与代码两张皮)
    expect(parseFieldDocs("## menuLayout\n| 字段 | 默认 | 范围 | 说明 |\n|---|---|---|---|\n| nopeField | 1 | 0~2 | x |\n").size).toBe(0);
    // 只剩 deco 表时也只出 deco
    const only = parseFieldDocs("## menuLayout\n| 区块 | 字段 = 默认 |\n|---|---|\n| 测试 | `banY`=6 `banH`=58 |\n");
    expect([...only.keys()].sort()).toEqual(["deco.banH", "deco.banY"]);
    expect(only.get("deco.banY")!.group).toContain("测试");
  });

  it("buildFieldRows:128 行,可拖集合与手柄集合完全一致", () => {
    const { handles } = snapshot(1246, true);
    const rows = buildFieldRows(docs, handles);
    expect(rows.length).toBe(128);
    const draggable = new Set(rows.filter((r) => r.draggable).map((r) => r.id));
    expect([...draggable].sort()).toEqual([...new Set(handles.map((h) => h.id))].sort());
    for (const r of rows) {
      expect(r.group.length).toBeGreaterThan(0);
      expect(r.range[0] < r.range[1]).toBe(true);
      expect(r.step).toBe(stepOf(r.section, r.key));
    }
  });
});

/* ==================== 7. 派生量与参考框 ==================== */

describe("派生量/参考框", () => {
  it("listBottomY 恒 ≥ 末行底缘(spreadRows 的契约)", () => {
    for (const c of CASES) {
      const { L } = snapshot(c.h, c.ready);
      const last = L.rows[L.rows.length - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(listBottomY(L) + 1e-9);
    }
  });

  it("derivedReadout 全字段可读、无 NaN", () => {
    const { L } = snapshot(1246, true);
    const out = derivedReadout(L);
    expect(out.length).toBeGreaterThanOrEqual(9);
    for (const item of out) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.value.includes("NaN")).toBe(false);
    }
  });

  it("buildGuides 覆盖每个关卡行与每张套组卡,偏差账仅幻影榜一处", () => {
    const { L, ctx } = snapshot(1246, true);
    const g = buildGuides(L, ctx);
    expect(g.filter((v) => v.label.startsWith("行 #")).length).toBe(STAGE_IDS.length);
    expect(g.filter((v) => v.label.startsWith("套组 ")).length).toBe(SETS_3.length);
    const warned = g.filter((v) => v.warn).map((v) => v.label);
    expect(warned).toEqual(["phantom 热区"]);
    // 补星钮命中与绘制同源读 L.makeupRect(提交3a 拍板),guide 仍在但不算偏差
    expect(g.some((v) => v.label === "makeupRect 补星钮")).toBe(true);
    for (const v of g) {
      expect(["layout", "hit", "guide"]).toContain(v.kind);
      expect(Number.isFinite(v.rect.x + v.rect.y + v.rect.w + v.rect.h)).toBe(true);
    }
  });

  it("缺图环境下不崩(makeupRows 全 false、rowPlate 缺失)", () => {
    const L = menuLayoutPure(W, 996, { ...envOf(false), rowPlateSize: null });
    const ctx: HandleContext = { w: W, h: 996, makeupRows: L.rows.map(() => false), selectedSet: null };
    const handles = buildHandles(L, ctx);
    expect(handles.some((v) => v.id === "deco.makeupW")).toBe(false);
    expect(handles.some((v) => v.id === "origin.pad")).toBe(true);
    expect(() => buildGuides(L, ctx)).not.toThrow();
    expect(L.rowMargin).toBe(0);
  });
});
