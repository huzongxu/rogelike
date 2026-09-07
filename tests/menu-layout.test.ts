/**
 * 主菜单布局基线 —— 分带几何的三层证据。
 *
 *  A. 等价性:把分带规范逐式转录成 bandOracle(预言机,字面量直接写死),与 menuLayoutPure(默认表)
 *     在 [560×996, 560×1212, 560×1246] × 分区条就绪/未就绪 × 套组 3/4/6 × 行底板有/无贴图
 *     的全矩阵上比对全部几何字段(逐字段 toEqual,不做容差)。
 *  B. 锚点:独立手工验算的关键数值(七条带的 y 序列/行高行距/筹码带右界/主 CTA/英雄带贴底),
 *     与 A 相互独立 —— A 防"公式写错",B 防"两边一起写错";并锁死三条硬不变量:
 *     热区 ≥ 44、越界 = 0、筹码带右缘 ≤ 屏宽 − pad。
 *  C. 表默认 = 分带规范值:防止日后有人改规范表默认值而悄悄改画面。
 *
 * 规则:数值不符就停下来报告,不得改期望值。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ui } from "@game/ui/theme";
import { menuLayoutPure, nineMarginPure, spreadRowsGrid, type MenuLayoutEnv, type MenuLayout } from "@game/ui/menuLayout";
import { MENU_LAYOUT_DEFAULTS, applyBalance, snapshotMenuLayout, type MenuLayoutTable } from "@game/data/layoutMenu";
import { MENU_SKIN_DEFAULTS, type MenuSkinTable } from "@game/data/menuSkin";
import { STAGES } from "@game/data/stages";
import type { SetId } from "@game/data/sets";

/** 视图与命中两侧的源码:同源性断言只认「同一个出口函数」这一种写法 */
const MENU_VIEW_SRC = readFileSync(new URL("../cocos/assets/scripts/menu/MenuLayoutView.ts", import.meta.url), "utf8");
const MENU_CHIP_MODEL_SRC = readFileSync(new URL("../cocos/assets/scripts/menu/MenuContentModel.ts", import.meta.url), "utf8");

/* ============================ A. 预言机:分带规范逐式转录 ============================ */
/* 事实源:docs/UI-PIXEL-REFRESH.md「主菜单重排」分带表;这里只允许出现字面量,不许读规范表。 */

/** 等比九宫角深预言机(缺图/无边距时的回退口径) */
function legacyNineMargin(img: { w: number; h: number } | null, w: number, h: number): number {
  if (!img || !img.w || !img.h) return 0;
  const sm = Math.max(1, Math.floor(Math.min(img.w, img.h) * 0.35));
  return Math.round(Math.min((h * sm) / img.h, w / 2, h / 2));
}

interface LegacyEnv {
  stageIds: number[];
  setIds: SetId[];
  sectionReady: boolean;
  rowPlate: { w: number; h: number } | null;
  /** 行底板九宫格边距(视图按 viewTable.nineSlice.keys 给;缺省 = 回退角深口径) */
  rowPlateBorder?: number | null;
}

function bandOracle(w: number, h: number, env: LegacyEnv) {
  const pad = 16;
  const entryH = 44;
  const entryY = 148;
  const setH = 34;
  const setDescH = 46;
  const setGapY = 16;
  const setY = h - setDescH - setH - setGapY;
  const sectionH = env.sectionReady ? 32 : 0;
  const sectionW = (sectionH * 528) / 32;
  const sectionX = (w - sectionW) / 2;
  const stageHdrY = sectionH > 0 ? 200 : 0;
  const setHdrY = sectionH > 0 ? setY - 13 - sectionH : 0;
  const listY = sectionH > 0 ? stageHdrY + sectionH + 8 : 240;
  const gapAboveSet = sectionH > 0 ? 4 + 4 : 8;
  // 尾块英雄带贴底:高 = heroRise + setH + setDescH = 88,底缘 = 屏高 − setGapY
  const bandH = 8 + setH + setDescH;
  const heroBand = { x: pad, y: h - setGapY - bandH, w: w - pad * 2, h: bandH };
  const endlessBtn = { x: w / 2 - 264, y: heroBand.y - gapAboveSet - 56, w: 528, h: 56 };
  const listBottom = endlessBtn.y - 8;
  // 偶数网格行分布:先按行距 8 解行高,夹到 72~96,再把余量给行距(上限 28)
  const n = env.stageIds.length;
  const avail = Math.max(0, listBottom - listY);
  const even = (v: number) => Math.floor(v) - (Math.floor(v) % 2);
  const rowH = Math.max(72, Math.min(96, even((avail - (n - 1) * 8) / n)));
  const gap = n > 1 ? Math.max(0, Math.min(28, even((avail - n * rowH) / (n - 1)))) : 0;
  const rows: { id: number; x: number; y: number; w: number; h: number }[] = [];
  const rowW = w - pad * 2;
  env.stageIds.forEach((id, i) => {
    rows.push({ id, x: pad, y: listY + i * (rowH + gap), w: rowW, h: rowH });
  });
  const phantomBtn = { x: w - 124, y: 96, w: 124 - pad, h: 44 };
  const strip = { x: phantomBtn.x - 12 - 84, y: 96, w: 84, h: 44 };
  const chipXs = [0, 1, 2].map((i) => strip.x - 12 - 96 * (3 - i) - 12 * (2 - i));
  const entryGap = 12;
  const entryW = Math.floor((w - pad * 2 - entryGap * 5) / 6);
  const entryX = (i: number) => pad + i * (entryW + entryGap);
  const commissionBtn = { x: entryX(0), y: entryY, w: entryW, h: entryH };
  const gachaBtn = { x: entryX(1), y: entryY, w: entryW, h: entryH };
  const talentBtn = { x: entryX(2), y: entryY, w: entryW, h: entryH };
  const passBtn = { x: entryX(3), y: entryY, w: entryW, h: entryH };
  const dailyBtn = { x: entryX(4), y: entryY, w: entryW, h: entryH };
  const gearupBtn = { x: entryX(5), y: entryY, w: entryW, h: entryH };
  const setW = (w - pad * 2 - 8 * (env.setIds.length - 1)) / env.setIds.length;
  const setBtns = env.setIds.map((id, i) => ({ id, x: pad + i * (setW + 8), y: setY, w: setW, h: setH }));
  const nine = legacyNineMargin(env.rowPlate, rowW, rowH);
  const rowMargin = env.rowPlateBorder && env.rowPlateBorder > 0 ? Math.min(env.rowPlateBorder, rowH / 2, rowW / 2) : nine;
  const setBand = Math.round(setH * (20 / 124));
  const noteBand = Math.round(setDescH * (8 / 45));
  const heroBtn = { x: heroBand.x + heroBand.w - 16 - 96, y: Math.round(heroBand.y + heroBand.h / 2 - 22), w: 96, h: 44 };
  return {
    rows, endlessBtn, phantomBtn, strip, chipXs, gachaBtn, talentBtn, passBtn, commissionBtn, dailyBtn, gearupBtn,
    setBtns, setY, setH, setDescH, sectionH, sectionW, sectionX, stageHdrY, setHdrY, rowMargin, setBand, noteBand,
    heroBand, heroBtn, listY, gapAboveSet, rowW, rowH, gap, entryW, entryGap, setW, pad, entryH, entryY,
  };
}

/** 预言机覆盖的字段名(新增字段由 B 的锚点与不变量单独约束) */
const LEGACY_KEYS = [
  "rows", "endlessBtn", "phantomBtn", "strip", "chipXs", "gachaBtn", "talentBtn", "passBtn", "commissionBtn", "dailyBtn",
  "gearupBtn", "setBtns", "setY", "setH", "setDescH", "sectionH", "sectionW", "sectionX", "stageHdrY", "setHdrY",
  "rowMargin", "setBand", "noteBand", "heroBand", "heroBtn", "listY", "gapAboveSet", "rowW", "rowH", "gap",
  "entryW", "entryGap", "setW", "pad", "entryH", "entryY",
] as const;

const ROW_PLATE = { w: 74, h: 48 }; // menu_row_plate.png 固有尺寸(export=2 烘格后)
const ROW_BORDER = 16; // viewTable.nineSlice.keys.menu_row_plate
const SETS_3: SetId[] = ["thorn", "barrage", "ember"];
const SETS_4: SetId[] = ["thorn", "barrage", "ember", "frost"];
const SETS_6: SetId[] = ["thorn", "barrage", "ember", "frost", "magma", "phantom"];
const STAGE_IDS = STAGES.map((s) => s.id);

function envOf(env: LegacyEnv, table?: MenuLayoutTable): MenuLayoutEnv {
  return {
    table: table ?? snapshotMenuLayout(),
    stageIds: env.stageIds,
    setIds: env.setIds,
    sectionStripReady: env.sectionReady,
    rowPlateSize: env.rowPlate,
    rowPlateBorder: env.rowPlateBorder ?? null,
  };
}

const CASES: { name: string; w: number; h: number; env: LegacyEnv }[] = [];
for (const [w, h] of [[560, 996], [560, 1212], [560, 1246]] as const) {
  for (const sectionReady of [true, false]) {
    for (const [label, setIds] of [["3套", SETS_3], ["4套", SETS_4], ["6套", SETS_6]] as const) {
      for (const [plateLabel, rowPlate] of [["有底板", ROW_PLATE], ["缺底板", null]] as const) {
        CASES.push({
          name: `${w}×${h} 分区条${sectionReady ? "就绪" : "缺"} ${label} ${plateLabel}`,
          w,
          h,
          env: { stageIds: STAGE_IDS, setIds, sectionReady, rowPlate, rowPlateBorder: rowPlate ? ROW_BORDER : null },
        });
      }
    }
  }
}

describe("A. 主菜单分带几何 × 独立手工转录等价(全矩阵逐字段)", () => {
  it("矩阵覆盖 3 屏高 × 2 分区条态 × 3 套组数 × 2 底板态 = 36 例", () => {
    expect(CASES.length).toBe(36);
  });

  for (const c of CASES) {
    it(`${c.name}:menuLayoutPure(默认表) ≡ 分带预言机`, () => {
      const legacy = bandOracle(c.w, c.h, c.env) as unknown as Record<string, unknown>;
      const laid = menuLayoutPure(c.w, c.h, envOf(c.env)) as unknown as Record<string, unknown>;
      const deco = laid.d as unknown as { strip: unknown; chipXs: unknown };
      const next: Record<string, unknown> = { ...laid, strip: deco.strip, chipXs: deco.chipXs };
      for (const key of LEGACY_KEYS) {
        expect(next[key], key).toEqual(legacy[key]);
      }
    });

    /* 硬不变量逐组合扫一遍:这三条只在某一档屏高上成立等于没成立 */
    it(`${c.name}:热区 ≥ 44 / 越界 = 0 / 右缘 ≤ ${c.w - 16} / 坐标落偶数`, () => {
      const L = menuLayoutPure(c.w, c.h, envOf(c.env));
      const clickable = [...menuEntryRectsOf(L), ...L.rows, L.endlessBtn, L.phantomBtn, L.heroBtn, ...menuChipRectsOf(L), L.makeupRect(L.rows[0], L.rowMargin)];
      for (const r of clickable) {
        expect(r.x >= 0 && r.y >= 0, `${c.name} ${JSON.stringify(r)} 越左上`).toBe(true);
        expect(r.x + r.w, `${c.name} 右缘 ${JSON.stringify(r)}`).toBeLessThanOrEqual(c.w - L.pad);
        expect(r.y + r.h, `${c.name} 下缘 ${JSON.stringify(r)}`).toBeLessThanOrEqual(c.h);
        expect(Math.min(r.w, r.h), `${c.name} 热区 ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(44);
        expect(r.x % 2 + r.y % 2 + r.w % 2 + r.h % 2, `${c.name} 奇数坐标 ${JSON.stringify(r)}`).toBe(0);
      }
      for (const r of [L.d.ban, L.d.crest, L.d.strip, L.heroBand, L.heroPort, { x: L.stageHdrY, y: 0, w: L.sectionW, h: L.sectionH }, ...L.rows]) {
        expect(r.w % 2 + r.h % 2, `${c.name} 绘制矩形奇数 ${JSON.stringify(r)}`).toBe(0);
      }
      /* setBtns 是"算而不画"的历史锚点(尾块已由英雄带接管),不进热区扫描,但必须真的没人画它 */
      expect(MENU_VIEW_SRC.includes("setBtns"), c.name).toBe(false);
      expect(L.setBtns.length).toBe(c.env.setIds.length);
    });
  }

  it("draw / hit-test 同源:筹码与补星钮各只有一个矩形出口,视图与点击判定读同一支", () => {
    expect(MENU_CHIP_MODEL_SRC.includes("export function menuChipRects("), "筹码矩形由 MenuContentModel 单点导出").toBe(true);
    expect(MENU_VIEW_SRC.includes("menuChipRects(L)"), "视图画筹码走同一支").toBe(true);
    expect(MENU_CHIP_MODEL_SRC.includes("inRect(chips[i], x, y)"), "点击判定筹码走同一支").toBe(true);
    expect(MENU_VIEW_SRC.includes("L.makeupRect(r, L.rowMargin)"), "视图画补星钮走 makeupRect").toBe(true);
    expect(MENU_CHIP_MODEL_SRC.includes("L.makeupRect(r, L.rowMargin)"), "点击判定补星钮走 makeupRect").toBe(true);
    expect((MENU_VIEW_SRC.match(/makeupRect\(/g) ?? []).length).toBe(1);
    expect((MENU_CHIP_MODEL_SRC.match(/makeupRect\(/g) ?? []).length).toBe(1);
  });

  it("页边距走像素网格档 16(有意偏离共享层的 ui.pad,其余屏仍读 ui.pad 不受牵连)", () => {
    expect(MENU_LAYOUT_DEFAULTS.origin.pad).toBe(16);
    expect(MENU_LAYOUT_DEFAULTS.origin.pad).not.toBe(ui.pad);
  });

  it("spreadRowsGrid ≡ 预言机的行分布(偶数档,末段余数不落进矩形)", () => {
    for (const [avail, wantH, wantGap] of [[580, 76, 8], [830, 96, 26], [552, 72, 8]] as const) {
      const r = spreadRowsGrid(7, 0, avail, 72, 96, 28);
      expect(r, `avail=${avail}`).toEqual({ rowH: wantH, gap: wantGap });
      expect(r.rowH % 2, `avail=${avail} rowH`).toBe(0);
      expect(r.gap % 2, `avail=${avail} gap`).toBe(0);
    }
  });
});

/* ============================ B. 手工验算锚点 ============================ */

describe("B. 锚点:560×996 满态(七条带逐带走查表验算)", () => {
  const L: MenuLayout = menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE, rowPlateBorder: ROW_BORDER }));

  it("① 标题带:板 (16,8,528,56),纹章 40×40 落在内缩界,标题基线 (80,44)", () => {
    expect(L.d.ban).toEqual({ x: 16, y: 8, w: 528, h: 56 });
    expect(L.d.crest).toEqual({ x: 32, y: 16, w: 40, h: 40 });
    expect(L.d.titlePos).toEqual({ x: 80, y: 44 });
  });

  it("② 筹码带整带右对齐:货币 16/124/232(宽 96)· 能量 340(宽 84)· 幻影 436(宽 108)→ 最右元素右缘 544", () => {
    expect(L.d.chipXs).toEqual([16, 124, 232]);
    expect({ w: L.d.chipW, h: L.d.chipH, y: L.d.chipY }).toEqual({ w: 96, h: 44, y: 96 });
    expect(L.d.strip).toEqual({ x: 340, y: 96, w: 84, h: 44 });
    expect(L.phantomBtn).toEqual({ x: 436, y: 96, w: 108, h: 44 });
    expect(L.d.seasonPos.x).toBe(536);
    expect(L.d.phRightX).toBe(544);
    for (const r of [L.d.strip, L.phantomBtn, ...menuChipRectsOf(L)]) expect(r.x + r.w).toBeLessThanOrEqual(544);
    expect(L.d.seasonPos).toEqual({ x: 536, y: 84 });
  });

  it("③ 入口带:6 枚 78×44 @148,x = 16/106/196/286/376/466,末枚右缘 544(6×78+5×12=528)", () => {
    expect({ w: L.entryW, h: L.entryH, y: L.entryY, gap: L.entryGap }).toEqual({ w: 78, h: 44, y: 148, gap: 12 });
    const btns = [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn];
    expect(btns.map((b) => b.x)).toEqual([16, 106, 196, 286, 376, 466]);
    for (const b of btns) expect(b.x + b.w).toBeLessThanOrEqual(544);
  });

  it("④ 分区条:通栏 (16,200,528,32),列表起于 240", () => {
    expect({ h: L.sectionH, w: L.sectionW, x: L.sectionX, y: L.stageHdrY }).toEqual({ h: 32, w: 528, x: 16, y: 200 });
    expect(L.listY).toBe(240);
  });

  it("⑤ 列表带:行高 76 行距 8,7 行 240→820 正好吃满(末行底缘 = 可用下界,无空洞)", () => {
    expect({ rowH: L.rowH, gap: L.gap, rowW: L.rowW, margin: L.rowMargin }).toEqual({ rowH: 76, gap: 8, rowW: 528, margin: 16 });
    expect(L.rows.map((r) => r.y)).toEqual([240, 324, 408, 492, 576, 660, 744]);
    const last = L.rows[L.rows.length - 1];
    expect(last.y + last.h).toBe(L.endlessBtn.y - MENU_LAYOUT_DEFAULTS.origin.endlessListGap);
  });

  it("⑥ 主 CTA:(16,828,528,56) 通栏,gapAboveSet = 4+4 = 8", () => {
    expect(L.endlessBtn).toEqual({ x: 16, y: 828, w: 528, h: 56 });
    expect(L.gapAboveSet).toBe(8);
  });

  it("⑦ 英雄带:贴底 (16,892,528,88),底缘 = 996 − 16;立绘盒 56×56、按钮右锚 432..528", () => {
    expect(L.heroBand).toEqual({ x: 16, y: 892, w: 528, h: 88 });
    expect(L.heroBand.y + L.heroBand.h).toBe(996 - MENU_LAYOUT_DEFAULTS.origin.setGapY);
    expect(L.heroPort).toEqual({ x: 32, y: 908, w: 56, h: 56 });
    expect(L.heroBtn).toEqual({ x: 432, y: 914, w: 96, h: 44 });
    expect({ x: L.heroTextX, maxW: L.heroTextMaxW, ys: [L.heroRow1Y, L.heroRow2Y, L.heroRow3Y] }).toEqual({
      x: 104, maxW: 312, ys: [922, 940, 956],
    });
    expect(L.d.note).toEqual(L.heroBand); // 说明板与英雄带同一矩形,不再叠第二块板
  });

  it("行角深走九宫格边距(16),缺图时回退等比角深口径", () => {
    expect(L.rowMargin).toBe(16);
    const noBorder = menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE }));
    expect(noBorder.rowMargin).toBe(nineMarginPure(ROW_PLATE.w, ROW_PLATE.h, 528, noBorder.rowH));
    expect(menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: null })).rowMargin).toBe(0);
  });

  it("补星钮 72×44 含于所在行(内缩 16,不压行右缘)", () => {
    const r = L.rows[0];
    const mk = L.makeupRect(r, L.rowMargin);
    expect(mk).toEqual({ x: 16 + 528 - 16 - 0 - 72, y: r.y + 38 - 22, w: 72, h: 44 });
    expect(mk.x + mk.w).toBeLessThanOrEqual(r.x + r.w - 16);
    expect(mk.y).toBeGreaterThanOrEqual(r.y);
    expect(mk.y + mk.h).toBeLessThanOrEqual(r.y + r.h);
  });

  it("套组卡一带算而不画:setY = 996 − 46 − 34 − 16 = 900", () => {
    expect(L.setY).toBe(900);
    expect(L.setH).toBe(34);
    expect(L.setDescH).toBe(46);
    expect(L.setBand).toBe(5); // round(34 × 20/124)
    expect(L.noteBand).toBe(8); // round(46 × 8/45)
    expect(L.setW).toBeCloseTo((528 - 16) / 3, 9);
  });

  it("不变量:全部可点矩形在设计空间内、热区 ≥ 44、几何一律落偶数", () => {
    const h = 996;
    const clickable = [
      ...menuEntryRectsOf(L),
      ...L.rows, L.endlessBtn, L.phantomBtn, L.heroBtn, ...menuChipRectsOf(L), L.makeupRect(L.rows[0], L.rowMargin),
    ];
    for (const r of clickable) {
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 560 && r.y + r.h <= h, JSON.stringify(r)).toBe(true);
      expect(Math.min(r.w, r.h), JSON.stringify(r)).toBeGreaterThanOrEqual(44);
    }
    const drawn = [L.d.ban, L.d.crest, L.d.strip, L.heroBand, L.heroPort, { x: L.stageHdrY, y: 0, w: L.sectionW, h: L.sectionH }, ...L.rows];
    for (const r of drawn) expect(r.w % 2 + r.h % 2, JSON.stringify(r)).toBe(0);
    for (const b of [...menuEntryRectsOf(L), L.endlessBtn, L.phantomBtn, L.heroBtn]) {
      expect(b.x % 2 + b.y % 2 + b.w % 2 + b.h % 2, JSON.stringify(b)).toBe(0);
    }
  });
});

/** 货币筹码热区(与视图、点击判定同一出口) */
function menuChipRectsOf(L: MenuLayout) {
  return L.d.chipXs.map((x) => ({ x, y: L.d.chipY, w: L.d.chipW, h: L.d.chipH }));
}

/** 六个场外入口热区(顺序与 MenuContentModel.menuEntryRects 一致) */
function menuEntryRectsOf(L: MenuLayout) {
  return [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn];
}

describe("B. 锚点:560×1246 高屏(富余全给列表带,列表下方不长空洞)", () => {
  const L: MenuLayout = menuLayoutPure(560, 1246, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE, rowPlateBorder: ROW_BORDER }));

  it("行高钳到 96、行距涨到 26,末行底缘 1068 与主 CTA 顶缘 1078 只差 10", () => {
    expect({ listY: L.listY, rowH: L.rowH, gap: L.gap, rowMargin: L.rowMargin }).toEqual({ listY: 240, rowH: 96, gap: 26, rowMargin: 16 });
    expect(L.rows.map((r) => r.y)).toEqual([240, 362, 484, 606, 728, 850, 972]);
    expect(L.endlessBtn).toEqual({ x: 16, y: 1078, w: 528, h: 56 });
    expect(L.heroBand).toEqual({ x: 16, y: 1142, w: 528, h: 88 });
    const slack = L.endlessBtn.y - MENU_LAYOUT_DEFAULTS.origin.endlessListGap - (L.rows[L.rows.length - 1].y + L.rowH);
    expect(slack).toBeLessThanOrEqual(L.gap); // 余量不超过一档行距 → 不成长为空洞
  });

  it("屏高不变量:末行底缘 < 主 CTA 顶缘 < 主 CTA 底缘 < 英雄带顶缘,英雄带底缘 = 屏高 − 16", () => {
    const last = L.rows[L.rows.length - 1];
    expect(last.y + last.h).toBeLessThan(L.endlessBtn.y);
    expect(L.endlessBtn.y + L.endlessBtn.h).toBeLessThan(L.heroBand.y);
    expect(L.heroBand.y + L.heroBand.h).toBe(1246 - 16);
  });
});

describe("B. 锚点:分区条缺贴图(退回无条口径)", () => {
  const L: MenuLayout = menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: false, rowPlate: ROW_PLATE, rowPlateBorder: ROW_BORDER }));

  it("sectionH/sectionW/stageHdrY/setHdrY 归零,listY 走 listYNoSection 240,gapAboveSet 8", () => {
    expect(L.sectionH).toBe(0);
    expect(L.sectionW).toBe(0);
    expect(L.sectionX).toBe(280);
    expect(L.stageHdrY).toBe(0);
    expect(L.setHdrY).toBe(0);
    expect(L.listY).toBe(240);
    expect(L.gapAboveSet).toBe(8);
    expect(L.endlessBtn).toEqual({ x: 16, y: 828, w: 528, h: 56 });
    expect(L.rowH).toBe(76);
  });
});

/* ============================ C. 规范表默认 = 分带规范值 ============================ */

describe("C. 规范表默认值即分带规范值(改默认 = 改画面,须走锚点评审)", () => {
  const o = MENU_LAYOUT_DEFAULTS.origin;
  const dc = MENU_LAYOUT_DEFAULTS.deco;
  it("页边距与入口带(44 高、间距 12、6 枚铺满 528)", () => {
    expect({ pad: o.pad, entryH: o.entryH, entryY: o.entryY, entryGap: o.entryGap, entryCount: o.entryCount }).toEqual({
      pad: 16, entryH: 44, entryY: 148, entryGap: 12, entryCount: 6,
    });
  });

  it("分区条(高 32、通栏比例 528/32,stageHdrY 200,条下 8)", () => {
    expect({ sectionH: o.sectionH, sectionSrcW: o.sectionSrcW, sectionSrcH: o.sectionSrcH, stageHdrY: o.stageHdrY, hdrBand: o.hdrBand, listYNoSection: o.listYNoSection, setHdrGap: o.setHdrGap }).toEqual({
      sectionH: 32, sectionSrcW: 528, sectionSrcH: 32, stageHdrY: 200, hdrBand: 8, listYNoSection: 240, setHdrGap: 13,
    });
  });

  it("主 CTA 528×56 与英雄带间隙(4+4 / 8)+ 列表留缝 8", () => {
    expect({ endlessGapSet: o.endlessGapSet, endlessGapSet2: o.endlessGapSet2, endlessGapFlat: o.endlessGapFlat, endlessW: o.endlessW, endlessH: o.endlessH, endlessListGap: o.endlessListGap }).toEqual({
      endlessGapSet: 4, endlessGapSet2: 4, endlessGapFlat: 8, endlessW: 528, endlessH: 56, endlessListGap: 8,
    });
  });

  it("行展开 72/96/28(偶数网格档)+ 尾块英雄带 8+34+46 = 88、下留白 16", () => {
    expect({ rowMinH: o.rowMinH, rowMaxH: o.rowMaxH, rowMaxGap: o.rowMaxGap, rowPlateF: o.rowPlateF, heroRise: o.heroRise, setH: o.setH, setDescH: o.setDescH, setGapY: o.setGapY }).toEqual({
      rowMinH: 72, rowMaxH: 96, rowMaxGap: 28, rowPlateF: 0.35, heroRise: 8, setH: 34, setDescH: 46, setGapY: 16,
    });
  });

  it("筹码带锚点(幻影 124/96/44)+ 板宽 96/84/间隙 12 + 套组卡间距 8", () => {
    expect({ phantomAnchor: o.phantomAnchor, phantomY: o.phantomY, phantomH: o.phantomH, setGap: o.setGap, chipW: dc.chipW, energyW: dc.energyW, chipGap: dc.chipGap, chipH: dc.chipH, stripY: dc.stripY, phRightGap: dc.phRightGap, seasonInset: dc.seasonInset }).toEqual({
      phantomAnchor: 124, phantomY: 96, phantomH: 44, setGap: 8, chipW: 96, energyW: 84, chipGap: 12, chipH: 44, stripY: 96, phRightGap: 0, seasonInset: 8,
    });
  });

  it("行内几何:40 序号牌、文字列 52、右界内缩 16、尾列预留 88、补星钮 72×44", () => {
    expect({ badgeSize: dc.badgeSize, badgeOffX: dc.badgeOffX, rowTxOff: dc.rowTxOff, rowRightInset: dc.rowRightInset, descClipPad: dc.descClipPad, makeupW: dc.makeupW, makeupH: dc.makeupH, rowC1Off: dc.rowC1Off, rowC2Gap: dc.rowC2Gap }).toEqual({
      badgeSize: 40, badgeOffX: 20, rowTxOff: 52, rowRightInset: 16, descClipPad: 88, makeupW: 72, makeupH: 44, rowC1Off: 8, rowC2Gap: 18,
    });
  });

  it("装饰带比例:套组 20/124、说明板 8/45", () => {
    expect({ setBandNum: o.setBandNum, setBandDen: o.setBandDen, noteBandNum: o.noteBandNum, noteBandDen: o.noteBandDen }).toEqual({
      setBandNum: 20, setBandDen: 124, noteBandNum: 8, noteBandDen: 45,
    });
  });

  it("分带表每一个纵向锚点都落偶数(module=2)", () => {
    const ys = [dc.banY, dc.banH, o.entryY, o.entryH, o.stageHdrY, o.sectionH, o.hdrBand, o.listYNoSection, o.endlessW, o.endlessH, o.endlessListGap, o.phantomY, o.phantomH, dc.stripY, dc.stripH, dc.chipH];
    expect(ys.filter((v) => v % 2 !== 0)).toEqual([]);
  });
});

describe("规范表 → balance.json 覆盖通道", () => {
  it("越界字段回退默认并告警;合法字段生效;非法结构整体忽略", () => {
    applyBalance({ origin: { entryY: 120, pad: 999 }, deco: { banH: 70 } });
    let t = snapshotMenuLayout();
    expect(t.origin.entryY).toBe(120);
    expect(t.origin.pad).toBe(16); // 越界 [0,40] → 回退
    expect(t.deco.banH).toBe(70);
    applyBalance({ origin: 42 }); // 非对象 → 忽略
    t = snapshotMenuLayout();
    expect(t.origin.entryY).toBe(148);
    expect(t.origin.pad).toBe(16);
    expect(t.deco.banH).toBe(56);
    applyBalance({}); // 复位到默认表
  });

  it("rowMinH > rowMaxH 时自动互换(否则 spreadRows 语义反转)", () => {
    applyBalance({ origin: { rowMinH: 90, rowMaxH: 60 } });
    const t = snapshotMenuLayout();
    expect(t.origin.rowMinH).toBe(60);
    expect(t.origin.rowMaxH).toBe(90);
    applyBalance({});
  });
});

/* ============================ D. 皮肤 insets 消费(加性增量,默认 = 恒等) ============================ */

describe("D. 皮肤 insets 由 menuLayoutPure 消费(叠加在 deco 基准上)", () => {
  const BASE_ENV = { stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE };
  const base = () => menuLayoutPure(560, 996, envOf(BASE_ENV));
  const withSkin = (insets: MenuSkinTable["insets"]) =>
    menuLayoutPure(560, 996, { ...envOf(BASE_ENV), skin: { ...MENU_SKIN_DEFAULTS, insets } });

  it("默认皮肤(全空) ≡ 无皮肤:整布局逐字段恒等", () => {
    // 函数闭包(makeupRect/dotRect)每次调用新建,按数据字段比对
    expect(JSON.stringify(menuLayoutPure(560, 996, { ...envOf(BASE_ENV), skin: MENU_SKIN_DEFAULTS }))).toBe(JSON.stringify(base()));
  });

  it("title:l → 纹章/标题右移、r → 赛季行左收、t−b → 三行文字整体升降", () => {
    const a = base().d, b = withSkin({ title: { t: 2, r: 5, b: 1, l: 3 } }).d;
    expect(b.crest.x - a.crest.x).toBe(3);
    expect(b.titlePos.x - a.titlePos.x).toBe(3);
    expect(b.seasonPos.x - a.seasonPos.x).toBe(-5);
    expect(b.titlePos.y - a.titlePos.y).toBe(1);
    expect(b.seasonPos.y - a.seasonPos.y).toBe(1);
    expect(b.row2Y - a.row2Y).toBe(1);
  });

  it("strip:l → 筹码列右移、r → 幻影右缘左收、t−b → 筹码行升降(基线盒随行)", () => {
    const a = base().d, b = withSkin({ strip: { t: 3, r: 6, b: 2, l: 4 } }).d;
    for (let i = 0; i < 3; i++) expect(b.chipXs[i] - a.chipXs[i]).toBe(4);
    expect(b.phRightX - a.phRightX).toBe(-6);
    expect(b.chipY - a.chipY).toBe(1);
    expect(b.chipBase.y - a.chipBase.y).toBe(1);
  });

  it("chip:l → 内容左隙、r → 尾隙、tb → 基线盒收缩(筹码板不动)", () => {
    const a = base().d, b = withSkin({ chip: { t: 4, r: 3, b: 1, l: 2 } }).d;
    expect(b.chipInnerGap - a.chipInnerGap).toBe(2);
    expect(b.chipTailPad - a.chipTailPad).toBe(3);
    expect(b.chipBase.y - a.chipBase.y).toBe(4);
    expect(b.chipBase.h - a.chipBase.h).toBe(-5);
    expect(b.chipY).toBe(a.chipY); // 板位置不变
  });

  it("section:lr → 条文左右内缩加宽、tb → 条文竖直带收缩", () => {
    const a = base().d, b = withSkin({ section: { t: 3, r: 2, b: 4, l: 1 } }).d;
    expect(b.sectionTextPad - a.sectionTextPad).toBe(3);
    expect(b.sectionTextBand).toEqual({ dy: 3, h: base().sectionH - 7 });
  });

  it("row:l → 文字列/徽章右移、r → 右列内缩、b−t → 行内文字下沉", () => {
    const a = base().d, b = withSkin({ row: { t: 2, r: 7, b: 6, l: 5 } }).d;
    expect(b.rowTxOff - a.rowTxOff).toBe(5);
    expect(b.badgeOffX - a.badgeOffX).toBe(5);
    expect(b.rowRightInset - a.rowRightInset).toBe(7);
    expect(b.rowC1Off - a.rowC1Off).toBe(4);
  });

  it("setCard:l → 图标/文字列右移、r → 右隙加宽、t−b → 首行升降", () => {
    const a = base().d, b = withSkin({ setCard: { t: 5, r: 4, b: 2, l: 2 } }).d;
    expect(b.setColPadL - a.setColPadL).toBe(2);
    expect(b.setIconOffX - a.setIconOffX).toBe(2);
    expect(b.setColPadR - a.setColPadR).toBe(4);
    expect(b.setRow1Off - a.setRow1Off).toBe(3);
  });

  it("note:l → 起点右移且最大宽收窄、r → 最大宽收窄、t−b → 首行升降", () => {
    const a = base().d, b = withSkin({ note: { t: 4, r: 5, b: 1, l: 3 } }).d;
    expect(b.noteX - a.noteX).toBe(3);
    expect(b.noteMaxW - a.noteMaxW).toBe(-8);
    expect(b.noteRow1Y - a.noteRow1Y).toBe(3);
  });

  it("叠加:strip 位移先落,chip 基线盒在位移后的板上收缩", () => {
    const a = base().d;
    const b = withSkin({ strip: { t: 3, r: 0, b: 2, l: 0 }, chip: { t: 4, r: 0, b: 1, l: 0 } }).d;
    expect(b.chipY - a.chipY).toBe(1);
    expect(b.chipBase.y).toBe(a.chipBase.y + 1 + 4);
    expect(b.chipBase.h).toBe(a.chipBase.h - 5);
  });

  it("未涉及的派生字段不受影响(命中几何/行列表/套组矩形不动)", () => {
    const a = base(), b = withSkin({ title: { t: 9, r: 9, b: 9, l: 9 }, row: { t: 1, r: 1, b: 1, l: 1 } });
    expect(b.rows).toEqual(a.rows);
    expect(b.endlessBtn).toEqual(a.endlessBtn);
    expect(b.phantomBtn).toEqual(a.phantomBtn);
    expect(b.setBtns).toEqual(a.setBtns);
    expect(b.rowMargin).toBe(a.rowMargin);
  });
});
