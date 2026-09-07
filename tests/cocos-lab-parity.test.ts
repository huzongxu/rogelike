/**
 * Phase 2 布局台闸门:共享层纯模型的端间平价与 JSON 往返。
 *
 * 三条硬性断言(R9 的验收面):
 *  1. **手柄数与字段数不低于 Web 侧实测的 76 / 128**,且 Cocos 侧读的确实是同一份实现
 *     (模块同一性断言:两端 import 到的是同一个函数引用,不是两份抄本);
 *  2. **导出的 JSON 灌回加载器再导出一次,结果逐字节相同**(幂等)——
 *     这是"导出 → 粘进 balance.json → 刷新后一致"那条验收里唯一能在 node 侧证死的部分;
 *  3. **钳制口径**:编辑器钳到边界 + 吸附步进,加载器越界回退默认,两者故意不同,写死在这里。
 *
 * 纯模型无节点、无 DOM,所以本文件不需要引擎与浏览器。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { menuLayoutPure, type MenuLayoutEnv } from "@game/ui/menuLayout";
import { STAGES } from "@game/data/stages";
import type { SetId } from "@game/data/sets";
import { applyBalance, snapshotMenuLayout } from "@game/data/layoutMenu";
import { applyMenuSkin, snapshotMenuSkin } from "@game/data/menuSkin";
import * as sharedModel from "@game/dev/labModel";
import * as webModel from "../src/dev/labModel";
import * as sharedSkin from "@game/dev/labSkin";
import * as webSkin from "../src/dev/labSkin";
import {
  LAB_OVERLAY_DEFAULTS,
  MENU_NINE_KEYS,
  MENU_PRESENTATION_DEFAULTS,
  NINE_BORDER_RANGE,
  NINE_FACTOR_DEFAULT,
  borderFor,
  clampBorder,
  currentDraft,
  decodeDraft,
  defaultTableState,
  encodeDraft,
  exportBundle,
  exportViewTableJson,
  mergeViewTableDoc,
  resolveBorder,
  restoreDraft,
  tableStateFromDoc,
} from "@game/dev/labTable";

const W = 560;
const ROW_PLATE = { w: 1024, h: 95 };
const SETS_3: SetId[] = ["thorn", "barrage", "ember"];
const STAGE_IDS = STAGES.map((s) => s.id);

/** 与 Web 布局台同一口径的环境:第 2 行显示补星钮,套组选第 2 张 */
function snapshot(h: number, sectionReady: boolean) {
  const env: MenuLayoutEnv = {
    table: snapshotMenuLayout(),
    stageIds: STAGE_IDS,
    setIds: SETS_3,
    sectionStripReady: sectionReady,
    rowPlateSize: ROW_PLATE,
  };
  const L = menuLayoutPure(W, h, env);
  const ctx = { w: W, h, makeupRows: L.rows.map((_, i) => i === 1), selectedSet: "barrage" };
  return { L, ctx, handles: sharedModel.buildHandles(L, ctx), guides: sharedModel.buildGuides(L, ctx) };
}

/** 合成手柄:pickHandle 的判定规则不该依赖真实布局恰好把哪两个锚点叠在一起 */
function mk(axis: "x" | "y", x: number, y: number, key: string): sharedModel.Handle {
  return { id: `origin.${key}`, group: "g", label: key, axis, x, y, bind: { section: "origin", key, sign: 1 } };
}

beforeEach(() => {
  applyBalance({});
  applyMenuSkin({});
});

/* ==================== 1. 端间平价(R9) ==================== */

describe("Phase 2 端间平价", () => {
  it("手柄数不低于 Web 侧实测 76", () => {
    const cases = [[996, true], [996, false], [1246, true], [1246, false]] as const;
    const counts = cases.map(([h, ready]) => snapshot(h, ready).handles.length);
    // 分区标题条就绪 = 完整手柄集,与 Web 侧实测同数
    expect(counts[0]).toBe(76);
    expect(counts[2]).toBe(76);
    // 缺标题条那一档少 6 个:stageHdrY / sectionH / sectionTextPad / hdrBand /
    // endlessGapSet / endlessGapSet2 / setHdrGap 这七个手柄按环境退化为 listYNoSection + endlessGapFlat
    expect(counts[1]).toBe(71);
    expect(counts[3]).toBe(71);
    for (const n of counts) expect(n).toBeGreaterThanOrEqual(70);
  });

  it("字段数 = 128(origin 37 + deco 91)", () => {
    expect(sharedModel.ORIGIN_KEYS.length).toBe(37);
    expect(sharedModel.DECO_KEYS.length).toBe(91);
    expect(sharedModel.ALL_FIELDS.length).toBe(128);
  });

  it("Cocos 侧与 Web 侧读到的是同一份实现(不是两份抄本)", () => {
    for (const fn of ["buildHandles", "buildGuides", "pickHandle", "dragValue", "clampValue", "applyValue", "exportJson", "buildFieldRows"] as const) {
      expect(webModel[fn], fn).toBe(sharedModel[fn]);
    }
    for (const fn of ["buildSkinTree", "applyInsets", "applyRemap", "applyToggle", "exportSkinJson", "resolveSkinKey", "mergeExport"] as const) {
      expect(webSkin[fn], fn).toBe(sharedSkin[fn]);
    }
  });

  it("每个可拖字段都在字段清单里,且参考框覆盖全部布局块", () => {
    const { handles, guides } = snapshot(996, true);
    const ids = new Set(sharedModel.ALL_FIELDS.map((f) => f.id));
    for (const h of handles) expect(ids.has(h.id), h.id).toBe(true);
    expect(guides.length).toBeGreaterThan(20);
    expect(new Set(guides.map((g) => g.kind)).size).toBe(3);
  });
});

/* ==================== 2. 钳制与拖动 ==================== */

describe("钳制与拖动", () => {
  it("越界钳到边界并吸附步进(与加载器的「回退默认」口径故意不同)", () => {
    expect(sharedModel.clampValue("origin", "pad", 9999)).toBe(40);
    expect(sharedModel.clampValue("origin", "pad", -9999)).toBe(0);
    expect(sharedModel.clampValue("deco", "banY", 1e6)).toBe(200);
    expect(sharedModel.clampValue("deco", "banY", -1e6)).toBe(-200);
    expect(sharedModel.clampValue("origin", "rowPlateF", 0.37)).toBe(0.35);
  });

  it("非有限输入回退默认,不产生 NaN 落表", () => {
    expect(sharedModel.clampValue("origin", "pad", NaN)).toBe(16);
    expect(sharedModel.clampValue("deco", "chipH", Infinity)).toBe(44);
    sharedModel.applyValue("origin", "pad", NaN);
    expect(Number.isFinite(snapshotMenuLayout().origin.pad)).toBe(true);
  });

  it("applyValue 越界后仍能被加载器接受(钳到边界的数一定在域内)", () => {
    sharedModel.applyValue("origin", "endlessW", 100000);
    const v = snapshotMenuLayout().origin.endlessW;
    applyBalance({ origin: { endlessW: v } });
    expect(snapshotMenuLayout().origin.endlessW).toBe(v);
  });

  it("拖动:沿绑定轴才改值,倍率与符号按手柄声明生效", () => {
    const { handles } = snapshot(996, true);
    const xh = handles.find((h) => h.axis === "x")!;
    const cur = sharedModel.readValues()[xh.bind.section][xh.bind.key];
    expect(sharedModel.dragValue(xh, 0, 50, cur)).toBe(cur);
    const moved = sharedModel.dragValue(xh, 50, 0, cur);
    expect(moved).not.toBe(cur);
    const endless = handles.find((h) => h.bind.key === "endlessW")!;
    expect(sharedModel.dragValue(endless, 10, 0, 260)).toBe(280); // ×2 倍率
  });

  it("方向键微调按 stepOf 走格数,Shift 走 10 格", () => {
    const h = mk("x", 0, 0, "sectionSrcW"); // 整数字段:一格 = 1
    expect(sharedModel.nudgeValue(h, 1, 50)).toBe(51);
    expect(sharedModel.nudgeValue(h, -10, 50)).toBe(40);
  });

  it("pickHandle 只沿绑定轴判定:轴内点得中,越半径与越自由轴容差都不中", () => {
    const grab = LAB_OVERLAY_DEFAULTS.grabPx;
    const off = LAB_OVERLAY_DEFAULTS.offAxisFactor;
    const list = [mk("y", 100, 200, "entryY"), mk("x", 300, 400, "pad")];
    expect(sharedModel.pickHandle(list, 100, 200 + grab - 1, grab, off)?.bind.key).toBe("entryY");
    expect(sharedModel.pickHandle(list, 100, 200 + grab + 1, grab, off)).toBe(null);
    // 自由轴上再近也不算:那是"另一条线上"的手柄
    expect(sharedModel.pickHandle([list[0]], 100 + grab * 2, 200, grab, off)).toBe(null);
    expect(sharedModel.pickHandle([list[1]], 300, 400 + grab - 1, grab, off)?.bind.key).toBe("pad");
  });

  it("重叠手柄取绑定轴上更近的那个", () => {
    const list = [mk("y", 100, 100, "entryY"), mk("y", 100, 104, "setH")];
    expect(sharedModel.pickHandle(list, 100, 101, 9, 1.6)?.bind.key).toBe("entryY");
    expect(sharedModel.pickHandle(list, 100, 103, 9, 1.6)?.bind.key).toBe("setH");
  });
});

/* ==================== 3. 导出 → 回灌 → 再导出(幂等) ==================== */

describe("导出与回灌的幂等", () => {
  /** 造一组有代表性的改动:整数/小数/负值/边界/皮肤三段 */
  function edit(): void {
    sharedModel.applyValue("origin", "pad", 18);
    sharedModel.applyValue("origin", "entryH", 41);
    sharedModel.applyValue("origin", "rowPlateF", 0.4);
    sharedModel.applyValue("origin", "endlessW", 560);
    sharedModel.applyValue("deco", "banY", -3);
    sharedModel.applyValue("deco", "chipX2", 96);
    sharedModel.applyValue("deco", "heroPortOffY", 7);
    const skin = sharedSkin.applyRemap(sharedSkin.applyToggle(snapshotMenuSkin(), "note.image", false), "menu_row_plate", "menu_row_plate_current");
    applyMenuSkin(sharedSkin.applyInsets(skin, "row", { t: 2, b: -2 }) as unknown as Record<string, unknown>);
  }

  it("menuLayout + menuSkin 段:导出 → 灌回加载器 → 再导出,逐字节相同", () => {
    edit();
    const first = exportBundle(sharedModel.readValues(), snapshotMenuSkin(), defaultTableState()).balanceText;
    const doc = JSON.parse(first) as Record<string, unknown>;
    applyBalance(doc.menuLayout as Record<string, unknown>);
    applyMenuSkin(doc.menuSkin as Record<string, unknown>);
    const second = exportBundle(sharedModel.readValues(), snapshotMenuSkin(), defaultTableState()).balanceText;
    expect(second).toBe(first);
    // 回灌后画面几何不变(读的是同一份表)
    expect(snapshotMenuLayout().origin.pad).toBe(18);
    expect(snapshotMenuSkin().remap.menu_row_plate).toBe("menu_row_plate_current");
    expect(snapshotMenuSkin().insets.row).toEqual({ t: 2, r: 0, b: -2, l: 0 });
  });

  it("只导 dirty;all=true 导出完整 128 字段", () => {
    edit();
    const dirty = exportBundle(sharedModel.readValues(), snapshotMenuSkin(), defaultTableState()).balanceText;
    const parsed = JSON.parse(dirty) as { menuLayout: { origin: Record<string, number>; deco: Record<string, number> } };
    expect(Object.keys(parsed.menuLayout.origin).length).toBeLessThan(37);
    const all = exportBundle(sharedModel.readValues(), snapshotMenuSkin(), defaultTableState(), { all: true }).balanceText;
    const allParsed = JSON.parse(all) as { menuLayout: { origin: Record<string, number>; deco: Record<string, number> } };
    expect(Object.keys(allParsed.menuLayout.origin).length).toBe(37);
    expect(Object.keys(allParsed.menuLayout.deco).length).toBe(91);
  });

  it("空改动 → menuLayout 内空段、menuSkin 段省略;viewTable 段为 '{}'", () => {
    const b = exportBundle(sharedModel.readValues(), snapshotMenuSkin(), defaultTableState());
    expect(JSON.parse(b.balanceText)).toEqual({ menuLayout: {} });
    expect(b.viewTableText).toBe("{}");
  });

  it("viewTable 段:边距与系数只导改过的,回灌水合后再导出仍相同", () => {
    const st = defaultTableState();
    st.factor = 0.4;
    st.borders.menu_row_plate = 40;
    st.borders.menu_note_plate = 9;
    st.menu.titlePx = 26;
    const text = exportViewTableJson(st);
    expect(text).toContain("\"menu_row_plate\": 40");
    expect(text).not.toContain("menu_chip_plate");
    const back = tableStateFromDoc(JSON.parse(text) as Record<string, unknown>);
    expect(exportViewTableJson(back)).toBe(text);
    expect(back.borders.menu_row_plate).toBe(40);
    expect(back.menu.titlePx).toBe(26);
    expect(back.factor).toBeCloseTo(0.4, 6);
  });

  it("viewTable 段并入既有文档时保留未知段,且重复合并幂等", () => {
    const base = JSON.stringify({ nineSlice: { factor: NINE_FACTOR_DEFAULT, keys: { hud_dock_top: 44 } }, battle: { gridStep: 100 } }, null, 4);
    const patch = exportViewTableJson({ ...defaultTableState(), borders: { menu_chip_plate: 12 } });
    const once = mergeViewTableDoc(base, patch);
    const twice = mergeViewTableDoc(once, patch);
    expect(twice).toBe(once);
    const doc = JSON.parse(once) as { nineSlice: { keys: Record<string, number> }; battle: { gridStep: number } };
    expect(doc.nineSlice.keys.hud_dock_top).toBe(44); // 战斗段既有边距不被覆盖掉
    expect(doc.nineSlice.keys.menu_chip_plate).toBe(12);
    expect(doc.battle.gridStep).toBe(100);
  });

  it("草稿编码 → 解码 → 回灌 → 再编码,文本一致且字段全活", () => {
    edit();
    const table = { ...defaultTableState(), borders: { menu_note_plate: 7 } };
    const text = encodeDraft(currentDraft(1246, snapshotMenuSkin(), table));
    const d = decodeDraft(text);
    expect(d).not.toBe(null);
    expect(restoreDraft(d)).toBe(sharedModel.ALL_FIELDS.length);
    expect(snapshotMenuLayout().origin.pad).toBe(18);
    expect(snapshotMenuLayout().deco.heroPortOffY).toBe(7);
    expect(snapshotMenuSkin().hidden).toContain("menu_note_plate");
    const again = encodeDraft(currentDraft(d!.logicalH, snapshotMenuSkin(), d!.table));
    expect(decodeDraft(again)).toEqual(d);
  });

  it("坏草稿一律判空:非 JSON / 版本不符 / 缺 vals 都不回灌", () => {
    expect(decodeDraft("{")).toBe(null);
    expect(decodeDraft(JSON.stringify({ v: 99, logicalH: 996, vals: { origin: {}, deco: {} } }))).toBe(null);
    expect(decodeDraft(JSON.stringify({ v: 1, logicalH: 996 }))).toBe(null);
    expect(restoreDraft(null)).toBe(0);
  });

  it("回灌走加载器校验:越界数不静默生效", () => {
    const d = decodeDraft(encodeDraft({ logicalH: 996, vals: { origin: { pad: 9999 }, deco: { banY: 0 } }, skin: snapshotMenuSkin(), table: defaultTableState() }));
    restoreDraft(d!);
    // applyBalance 对越界回退默认(与编辑器的钳到边界相对)
    expect(snapshotMenuLayout().origin.pad).toBe(16);
  });
});

/* ==================== 4. 边距通道 ==================== */

describe("九宫格边距通道", () => {
  it("显式值优先,缺省回落短边 × factor", () => {
    expect(resolveBorder(40, 1024, 95, 0.35)).toBe(40);
    expect(resolveBorder(0, 1024, 95, 0.35)).toBe(33);
    expect(resolveBorder(NaN, 384, 124, 0.35)).toBe(43);
    expect(resolveBorder(0, 0, 0, 0.35)).toBe(0);
  });

  it("边距列与视图共用同一数:菜单行板默认 33(源图 1024×95)", () => {
    const st = defaultTableState();
    expect(borderFor(st, "menu_row_plate", 1024, 95)).toBe(33);
    st.borders.menu_row_plate = 40;
    expect(borderFor(st, "menu_row_plate", 1024, 95)).toBe(40);
  });

  it("边距钳到取值域;0/非数 = 交回自动推导", () => {
    const st = defaultTableState();
    expect(clampBorder(st, "menu_row_plate", 99999)).toBe(NINE_BORDER_RANGE[1]);
    expect(clampBorder(st, "menu_row_plate", -5)).toBe(0);
    expect(clampBorder(st, "menu_row_plate", NaN)).toBe(0);
  });

  it("可标注的键都是结构树里真会画的九宫格底板", () => {
    for (const k of MENU_NINE_KEYS) expect(sharedSkin.skinAssetKeys().concat(["menu_set_plate", "menu_row_plate"])).toContain(k);
    expect(MENU_NINE_KEYS).not.toContain("menu_section_strip");
    expect(MENU_NINE_KEYS).not.toContain("crest_echo");
  });

  it("主菜单表现段的每个数都有默认值(视图不留内联魔法数)", () => {
    for (const [k, v] of Object.entries(MENU_PRESENTATION_DEFAULTS)) {
      expect(v, k).not.toBe(null);
      expect(typeof v === "number" || typeof v === "string", k).toBe(true);
    }
  });
});
