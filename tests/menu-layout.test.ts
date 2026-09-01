/**
 * 主菜单布局基线 —— 提交1「抽表零画面变化」的验收闸门。
 *
 * 三层证据:
 *  A. 等价性:把重构前的 `Game.menuLayout()` 逐式转录成 legacyMenuLayout(预言机),
 *     与 menuLayoutPure(默认表) 在 [560×996, 560×1246] × 标题条就绪/未就绪 × 套组 3/4/6 × 行底板有/无贴图
 *     的全矩阵上比对重构前就存在的全部 21 个字段(逐字段 toEqual,不做容差)。
 *  B. 锚点:独立手工验算的关键数值(setY/listY/rowH/gap/行 y 序列/无限关钮/幻影钮/入口宽/套组宽/装饰带),
 *     与 A 相互独立 —— A 防"搬错",B 防"两边一起搬错"。
 *  C. 表默认 = 旧字面量:防止日后有人改规范表默认值而悄悄改画面。
 *
 * 规则:数值不符就停下来报告,不得改期望值。
 */

import { describe, it, expect } from "vitest";
import { spreadRows, ui } from "../src/ui/theme";
import { menuLayoutPure, nineMarginPure, type MenuLayoutEnv, type MenuLayout } from "../src/ui/menuLayout";
import { MENU_LAYOUT_DEFAULTS, applyBalance, snapshotMenuLayout, type MenuLayoutTable } from "../src/data/layoutMenu";
import { MENU_SKIN_DEFAULTS, type MenuSkinTable } from "../src/data/menuSkin";
import { STAGES } from "../src/data/stages";
import type { SetId } from "../src/data/sets";

/* ============================ A. 预言机:重构前实现逐式转录 ============================ */
/* 源:.bak-prelayout/game.ts.orig 第 3923..3982 行(private menuLayout),字面量原样保留。 */

/** AssetManager.nineMargin 的公式转录(源图尺寸改显式入参;缺图契约同原实现) */
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
}

function legacyMenuLayout(w: number, h: number, env: LegacyEnv) {
  const pad = ui.pad;
  const entryH = 36;
  const entryY = 100;
  const setH = 50;
  const setDescH = 46;
  const setY = h - setDescH - setH - 1;
  const sectionH = env.sectionReady ? 32 : 0;
  const sectionW = (sectionH * 512) / 73;
  const sectionX = (w - sectionW) / 2;
  const stageHdrY = sectionH > 0 ? 140 : 0;
  const setHdrY = sectionH > 0 ? setY - 13 - sectionH : 0;
  const listY = sectionH > 0 ? stageHdrY + sectionH + 4 : 152;
  const gapAboveSet = sectionH > 0 ? 29 + sectionH + 13 : 34;
  const endlessBtn = { x: w / 2 - 130, y: setY - gapAboveSet - 48, w: 260, h: 48 };
  const { rowH, gap } = spreadRows(env.stageIds.length, listY, endlessBtn.y - 12, 72, 84, 30);
  const rows: { id: number; x: number; y: number; w: number; h: number }[] = [];
  const rowW = w - pad * 2;
  env.stageIds.forEach((id, i) => {
    rows.push({ id, x: pad, y: listY + i * (rowH + gap), w: rowW, h: rowH });
  });
  const phantomBtn = { x: w - 180, y: 64, w: 180 - pad, h: 24 };
  const entryGap = 8;
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
  const rowMargin = legacyNineMargin(env.rowPlate, rowW, rowH);
  const setBand = Math.round(setH * (20 / 124));
  const noteBand = Math.round(setDescH * (8 / 45));
  return {
    rows, endlessBtn, phantomBtn, gachaBtn, talentBtn, passBtn, commissionBtn, dailyBtn, gearupBtn, setBtns,
    setY, setH, setDescH, sectionH, sectionW, sectionX, stageHdrY, setHdrY, rowMargin, setBand, noteBand,
  };
}

/** 重构前就存在的字段名(新增字段由 B/C 与布局台单独约束) */
const LEGACY_KEYS = [
  "rows", "endlessBtn", "phantomBtn", "gachaBtn", "talentBtn", "passBtn", "commissionBtn", "dailyBtn", "gearupBtn",
  "setBtns", "setY", "setH", "setDescH", "sectionH", "sectionW", "sectionX", "stageHdrY", "setHdrY", "rowMargin",
  "setBand", "noteBand",
] as const;

const ROW_PLATE = { w: 1024, h: 95 }; // menu_row_plate.png 固有尺寸(提交1 实测)
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
  };
}

const CASES: { name: string; w: number; h: number; env: LegacyEnv }[] = [];
for (const [w, h] of [[560, 996], [560, 1246]] as const) {
  for (const sectionReady of [true, false]) {
    for (const [label, setIds] of [["3套", SETS_3], ["4套", SETS_4], ["6套", SETS_6]] as const) {
      for (const [plateLabel, rowPlate] of [["有底板", ROW_PLATE], ["缺底板", null]] as const) {
        CASES.push({
          name: `${w}×${h} 标题条${sectionReady ? "就绪" : "缺"} ${label} ${plateLabel}`,
          w,
          h,
          env: { stageIds: STAGE_IDS, setIds, sectionReady, rowPlate },
        });
      }
    }
  }
}

describe("A. 主菜单布局 × 预重构实现等价(全矩阵逐字段)", () => {
  it("矩阵覆盖 2 屏高 × 2 标题条态 × 3 套组数 × 2 底板态 = 24 例", () => {
    expect(CASES.length).toBe(24);
  });

  for (const c of CASES) {
    it(`${c.name}:menuLayoutPure(默认表) ≡ 预重构 menuLayout`, () => {
      const legacy = legacyMenuLayout(c.w, c.h, c.env) as unknown as Record<string, unknown>;
      const next = menuLayoutPure(c.w, c.h, envOf(c.env)) as unknown as Record<string, unknown>;
      for (const key of LEGACY_KEYS) {
        expect(next[key], key).toEqual(legacy[key]);
      }
    });
  }

  it("ui.pad 与表默认 pad 同值(旧实现读 ui.pad,新实现读表 → 不同值即画面变化)", () => {
    expect(MENU_LAYOUT_DEFAULTS.origin.pad).toBe(ui.pad);
  });
});

/* ============================ B. 手工验算锚点 ============================ */

describe("B. 锚点:560×996 满态(标题条就绪 + 行底板就绪 + 3 套组)", () => {
  const L: MenuLayout = menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE }));

  it("尾块贴底:setY = 996 − 46 − 50 − 1 = 899", () => {
    expect(L.setY).toBe(899);
    expect(L.setH).toBe(50);
    expect(L.setDescH).toBe(46);
  });

  it("标题带:sectionH 32 → sectionW = 32×512/73 ≈ 224.4384 居中,sectionX ≈ 167.7808", () => {
    expect(L.sectionH).toBe(32);
    expect(L.sectionW).toBeCloseTo(224.43835616438356, 9);
    expect(L.sectionX).toBeCloseTo(167.78082191780822, 9);
    expect(L.stageHdrY).toBe(140);
    expect(L.setHdrY).toBe(854); // 899 − 13 − 32
  });

  it("列表:listY 176,行高 78 间距 7,7 行 y = 176..686(步长 85)", () => {
    expect(L.listY).toBe(176);
    expect(L.rowH).toBe(78);
    expect(L.gap).toBe(7);
    expect(L.rows.map((r) => r.y)).toEqual([176, 261, 346, 431, 516, 601, 686]);
    expect(L.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("关卡行:左 14 右 546(通铺),行底缘 764 < 无限关钮顶缘 777", () => {
    expect(L.rowW).toBe(532);
    for (const r of L.rows) {
      expect(r.x).toBe(14);
      expect(r.x + r.w).toBe(546);
    }
    const last = L.rows[L.rows.length - 1];
    expect(last.y + last.h).toBe(764);
    expect(L.endlessBtn.y).toBe(777);
  });

  it("无限关钮:(150, 777, 260, 48) 水平居中;gapAboveSet = 29+32+13 = 74", () => {
    expect(L.endlessBtn).toEqual({ x: 150, y: 777, w: 260, h: 48 });
    expect(L.gapAboveSet).toBe(74);
  });

  it("幻影入口:(380, 64, 166, 24) 右缘贴 546", () => {
    expect(L.phantomBtn).toEqual({ x: 380, y: 64, w: 166, h: 24 });
    expect(L.phantomBtn.x + L.phantomBtn.w).toBe(546);
  });

  it("场外入口 6 枚等宽 82,x = 14/104/194/284/374/464,y 100 高 36", () => {
    expect(L.entryW).toBe(82);
    const xs = [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn].map((b) => b.x);
    expect(xs).toEqual([14, 104, 194, 284, 374, 464]);
    for (const b of [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn]) {
      expect(b.y).toBe(100);
      expect(b.h).toBe(36);
    }
    expect(L.entryGap).toBe(8);
  });

  it("套组卡 3 枚:setW = (532 − 8×2)/3 = 172,x = 14/194/374,末枚右缘 546", () => {
    expect(L.setW).toBe(172);
    expect(L.setBtns.map((b) => b.x)).toEqual([14, 194, 374]);
    expect(L.setBtns.map((b) => b.id)).toEqual(SETS_3);
    const last = L.setBtns[L.setBtns.length - 1];
    expect(last.x + last.w).toBe(546);
    expect(L.setBand).toBe(8); // round(50 × 20/124) = round(8.0645)
    expect(L.noteBand).toBe(8); // round(46 × 8/45) = round(8.1778)
  });

  it("行角深:nineMarginPure ≡ 旧 nineMargin(1024×95 底板 @ 532×78 → 27)", () => {
    expect(L.rowMargin).toBe(27);
    expect(nineMarginPure(1024, 95, 532, 78)).toBe(legacyNineMargin(ROW_PLATE, 532, 78));
    expect(L.rowMargin).toBeLessThan(L.rowH / 2); // 角深必小于半高,否则内容无处可放
  });

  it("补星钮含于所在行(角深内缩,不压行右缘)", () => {
    const r = L.rows[0];
    const mk = L.makeupRect(r, L.rowMargin);
    expect(mk.w).toBe(56);
    expect(mk.h).toBe(26);
    expect(mk.x).toBe(r.x + r.w - 27 - 2 - 56);
    expect(mk.y).toBe(Math.round(r.y + r.h / 2 - 13));
    expect(mk.x + mk.w).toBeLessThan(r.x + r.w);
    expect(mk.y).toBeGreaterThanOrEqual(r.y);
    expect(mk.y + mk.h).toBeLessThanOrEqual(r.y + r.h);
  });
});

describe("B. 锚点:560×1246 高屏(列表吃满剩余高度)", () => {
  const L: MenuLayout = menuLayoutPure(560, 1246, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: true, rowPlate: ROW_PLATE }));

  it("setY 1149 → 无限关钮 y 1027;行高钳到 84、间距钳到 30", () => {
    expect(L.setY).toBe(1149);
    expect(L.endlessBtn).toEqual({ x: 150, y: 1027, w: 260, h: 48 });
    expect(L.listY).toBe(176);
    expect(L.rowH).toBe(84);
    expect(L.gap).toBe(30);
    expect(L.rows[1].y).toBe(290);
    expect(L.rowMargin).toBe(29); // round(84×33/95)
  });

  it("屏高不变量:尾块与列表都不越界(末行底缘 < 无限关钮顶缘 < setY < 说明板底缘 ≤ 屏底)", () => {
    const last = L.rows[L.rows.length - 1];
    expect(last.y + last.h).toBeLessThan(L.endlessBtn.y);
    expect(L.endlessBtn.y + L.endlessBtn.h).toBeLessThan(L.setY);
    expect(L.setY + L.setH + L.setDescH + 1).toBe(1246);
  });
});

describe("B. 锚点:标题条缺贴图(退回无条口径)", () => {
  const L: MenuLayout = menuLayoutPure(560, 996, envOf({ stageIds: STAGE_IDS, setIds: SETS_3, sectionReady: false, rowPlate: ROW_PLATE }));

  it("sectionH/sectionW/sectionX/stageHdrY/setHdrY 归零,listY 152,gapAboveSet 34", () => {
    expect(L.sectionH).toBe(0);
    expect(L.sectionW).toBe(0);
    expect(L.sectionX).toBe(280);
    expect(L.stageHdrY).toBe(0);
    expect(L.setHdrY).toBe(0);
    expect(L.listY).toBe(152);
    expect(L.gapAboveSet).toBe(34);
    expect(L.endlessBtn).toEqual({ x: 150, y: 817, w: 260, h: 48 });
  });
});

/* ============================ C. 规范表默认 = 旧字面量 ============================ */

describe("C. 规范表默认值即重构前字面量(改默认 = 改画面,须走锚点评审)", () => {
  const o = MENU_LAYOUT_DEFAULTS.origin;
  it("纵向骨架与尾块", () => {
    expect({ pad: o.pad, entryH: o.entryH, entryY: o.entryY, setH: o.setH, setDescH: o.setDescH, setGapY: o.setGapY }).toEqual({
      pad: 14, entryH: 36, entryY: 100, setH: 50, setDescH: 46, setGapY: 1,
    });
  });

  it("分区标题条(源图 512×73,高 32,stageHdrY 140,条下 4)", () => {
    expect({ sectionH: o.sectionH, sectionSrcW: o.sectionSrcW, sectionSrcH: o.sectionSrcH, stageHdrY: o.stageHdrY, hdrBand: o.hdrBand, setHdrGap: o.setHdrGap, listYNoSection: o.listYNoSection }).toEqual({
      sectionH: 32, sectionSrcW: 512, sectionSrcH: 73, stageHdrY: 140, hdrBand: 4, setHdrGap: 13, listYNoSection: 152,
    });
  });

  it("无限关钮 260×48 与套组区间隙(29/13/34)+ 列表留缝 12", () => {
    expect({ endlessGapSet: o.endlessGapSet, endlessGapSet2: o.endlessGapSet2, endlessGapFlat: o.endlessGapFlat, endlessW: o.endlessW, endlessH: o.endlessH, endlessListGap: o.endlessListGap }).toEqual({
      endlessGapSet: 29, endlessGapSet2: 13, endlessGapFlat: 34, endlessW: 260, endlessH: 48, endlessListGap: 12,
    });
  });

  it("行展开 72/84/30 + 行底板角深系数 0.35", () => {
    expect({ rowMinH: o.rowMinH, rowMaxH: o.rowMaxH, rowMaxGap: o.rowMaxGap, rowPlateF: o.rowPlateF }).toEqual({
      rowMinH: 72, rowMaxH: 84, rowMaxGap: 30, rowPlateF: 0.35,
    });
  });

  it("幻影入口锚点(宽 180,y 64,h 24)+ 入口横排(间距 8,6 枚)+ 套组卡间距 8", () => {
    expect({ phantomAnchor: o.phantomAnchor, phantomY: o.phantomY, phantomH: o.phantomH, entryGap: o.entryGap, entryCount: o.entryCount, setGap: o.setGap }).toEqual({
      phantomAnchor: 180, phantomY: 64, phantomH: 24, entryGap: 8, entryCount: 6, setGap: 8,
    });
  });

  it("装饰带比例:套组 20/124、说明板 8/45", () => {
    expect({ setBandNum: o.setBandNum, setBandDen: o.setBandDen, noteBandNum: o.noteBandNum, noteBandDen: o.noteBandDen }).toEqual({
      setBandNum: 20, setBandDen: 124, noteBandNum: 8, noteBandDen: 45,
    });
  });
});

describe("规范表 → balance.json 覆盖通道", () => {
  it("越界字段回退默认并告警;合法字段生效;非法结构整体忽略", () => {
    applyBalance({ origin: { entryY: 120, pad: 999 }, deco: { banH: 70 } });
    let t = snapshotMenuLayout();
    expect(t.origin.entryY).toBe(120);
    expect(t.origin.pad).toBe(14); // 越界 [0,40] → 回退
    expect(t.deco.banH).toBe(70);
    applyBalance({ origin: 42 }); // 非对象 → 忽略
    t = snapshotMenuLayout();
    expect(t.origin.entryY).toBe(100);
    expect(t.origin.pad).toBe(14);
    expect(t.deco.banH).toBe(58);
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
