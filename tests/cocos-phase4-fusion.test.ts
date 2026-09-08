/**
 * Phase 4 第八屏闸门:词缀融合屏(底部三形态互斥 + 保底三选一弹层 + 融合出成品入局内装备)。
 *
 * 延续 cocos-phase4-leaderboard / -daily / -pass / -gearup / -gacha / -prestige / -commission
 * 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `fusion/FusionModel.ts` 经相对路径 import 的共享层
 *     (`game/data/fusion` 的融合执行 / 成本 / 保底候选 / 落词缀、`game/data/quality` 的
 *     成本表与三个常量、`game/ui/fusionLayout`),与 Web 侧经 `@game` 别名 import 的是同一个
 *     模块实例(函数引用 `toBe` 相同),于是必成功口径、继承规则、成本与保底周期不可能出现
 *     "两份抄本";
 *  2. **断言按门控变量分档**:行条数 = 局内装备件数、三重态由 `fusC` 与天赋数(≥6)决定、
 *     弹层由保底触达决定、行名档位由 `hiddenAffix` 决定 —— 全部由入参与共享层表推出;
 *  3. **视图无关**:本文件只吃 cc-free 的 `FusionModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 本屏的重点是**八格几何矩阵**:`h ∈ {996, 1246} × 装备件数 ∈ {2, 6, 7, 8}` 八格各自钉死
 * `rowH` / `gap` / 末行底边 / 空档 / panelY / 融合钮底边,以及横向边界。这些数字按
 * `game/ui/theme.ts:spreadRows` 的真实实现由布局函数实算(每格都同时用 `spreadRows` 直算一遍
 * 对照)。与委托屏不同,这一屏的行区**顶边 92 锚定、预算底缘随屏高走**,`rowH` 被 76 封顶、
 * `gap` 被 20 封顶:件数 ≤ 6 时两档屏高下行矩形逐字相同(差全落在末行与 panelY 之间的空档),
 * 件数 7 / 8 时 996 档的预算开始咬住 `gap`(19)与 `rowH`(75),两档矩形不再相同 —— 矩阵把这个
 * 分界一并锁住。
 *
 * 另锁本屏照抄的 Web 口径:必成功 + 自动继承、保底 +1 到 HIDDEN_PITY_N 归零并转三选一暂存
 * (素材已扣、成品未入场、存档不落)、弹层打开时只响应卡片、隐藏词缀装备可点选不可作素材、
 * 三重未解锁时选满三件仍走双选口径、四处静默 no-op、选中态与三重模式是两种节奏的瞬时态、
 * 随机源是入参(本屏没有 Date.now 消费点)、若干字面量文案与表常量同数。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { makeEffect, makeModifier, makeTrigger } from "@game/data/affixes";
import type { Equipment } from "@game/data/equipmentGen";
import {
  HIDDEN_AFFIXES,
  applyHiddenAffix,
  fusionCost,
  hiddenAffixDef,
  inheritSource,
  performFusion,
  performTripleFusion,
  rollHiddenCandidates,
  tripleFusionCost,
  tripleUnlocked,
  type TripleMode,
} from "@game/data/fusion";
import {
  FUSION_COST_FALLBACK,
  FUSION_COST_TABLE,
  HIDDEN_PITY_N,
  TRIPLE_FUSION_COST_MULT,
  TRIPLE_FUSION_UNLOCK_TALENTS,
  qualityDef,
} from "@game/data/quality";
import { fs as FS, rowTextY, spreadRows, ui as PAD_ } from "@game/ui/theme";
import {
  FU_BACK_Y,
  FU_BANNER_DX,
  FU_BANNER_H,
  FU_BANNER_W,
  FU_BANNER_Y,
  FU_CARD_CY_DY,
  FU_CARD_DESC_DY,
  FU_CARD_DESC_LINE,
  FU_CARD_DESC_MAX_LINES,
  FU_CARD_GAP,
  FU_CARD_H,
  FU_CARD_HINT_DY,
  FU_CARD_NAME_DY,
  FU_CARD_STROKE_W,
  FU_CARD_TEXT_DX,
  FU_CARD_W,
  FU_FUSE_H,
  FU_FUSE_HALF_W,
  FU_FUSE_STROKE_W,
  FU_FUSE_UP,
  FU_FUSE_W,
  FU_HIDDEN_SUB_DY,
  FU_HIDDEN_TITLE_DY,
  FU_HINT_DY,
  FU_ICON_DY,
  FU_ICON_SIZE,
  FU_ICON_TEXT_DX,
  FU_L1_DY,
  FU_L2_DY,
  FU_MODE2_DX,
  FU_MODE_H,
  FU_MODE_W,
  FU_PAIR_NOTE_DY,
  FU_PAIR_PREVIEW_DY,
  FU_PAIR_READOUT_DY,
  FU_PANEL_DY,
  FU_PANEL_NINE,
  FU_ROW_MIN_GAP,
  FU_RES_BASE_Y,
  FU_ROW_MAX_H,
  FU_ROW_MIN_H,
  FU_ROW_SEL_STROKE_W,
  FU_ROW_TEXT_DX,
  FU_ROWS_BOTTOM_DY,
  FU_ROWS_Y0,
  FU_SEL_TAG_DX,
  FU_TITLE_BASE_Y,
  FU_TRIPLE_NOTE_DY,
  FU_TRIPLE_PREVIEW_DY,
  FU_TRIPLE_READOUT_DY,
  fusionFuseBtn,
  fusionLayout,
  fusionPanelY,
  fusionRowsBottom,
  fusionScreenLayout,
  type FuRect,
  type FuTextLine,
  type FusionLayout,
} from "@game/ui/fusionLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import {
  FUSION_CARD_DESC_CHARS,
  FUSION_DEFAULT_SELECTION,
  FUSION_DEFAULT_TRIPLE_MODE,
  TRIPLE_MODES,
  TRIPLE_MODE_LABELS,
  buildFusionContent,
  bumpFusionPity,
  fusionAffixSummary,
  fusionClaim,
  fusionHintText,
  fusionTapSelection,
  fusionTripleArmed,
  fusedPair,
  fusedTriple,
  hiddenCardDescLines,
  hitFusion,
  type FusionAction,
  type FusionPendingHidden,
  type FusionSaveView,
  type FusionSelection,
} from "../cocos/assets/scripts/fusion/FusionModel";
import * as cocosFusionData from "../cocos/assets/scripts/game/data/fusion";
import * as cocosFusionLayout from "../cocos/assets/scripts/game/ui/fusionLayout";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
/** 第六批翻新:本屏走自己的 FU_PAD = 16(偶数栅格、内容宽 528),不再跟 Web 冻结的 ui.pad = 14 */
const PAD = 16;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/* ==================== 夹具 ==================== */

/** 矩阵的行条数分支:最少可融合 / 996 档还顶满封顶的最后件数 / gap 开始收缩 / 槽位上限 */
const BRANCHES: readonly number[] = [2, 6, 7, 8];
const NO_FORMS = { hidden: false, triple: false };

function eq(id: number, over: Partial<Equipment> = {}): Equipment {
  return {
    id,
    level: 3,
    quality: "rare",
    name: "飞刀脉冲",
    triggers: [makeTrigger("pulse", { interval: 2 })],
    effect: makeEffect("knife", { damage: 20, speed: 560, radius: 640 }, 3),
    modifiers: [],
    ...over,
  };
}

/** n 件互不同 id 的稀有装备(id 从 9001 起,与开发键 F4 的夹具同号段) */
function gear(n: number, over: Partial<Equipment> = {}): Equipment[] {
  return Array.from({ length: n }, (_, i) => eq(9001 + i, over));
}

function save(over: Partial<FusionSaveView> = {}): FusionSaveView {
  return { stardust: 0, fusionPity: 0, ownedTalentCount: 0, ...over };
}

const sel = (over: Partial<FusionSelection> = {}): FusionSelection => ({ ...FUSION_DEFAULT_SELECTION, ...over });

/** 一帧几何 + 一帧文案(内容层要读同一帧几何,故成对取) */
function frame(
  equipment: Equipment[],
  s: FusionSaveView = save(),
  selection: FusionSelection = sel(),
  mode: TripleMode = FUSION_DEFAULT_TRIPLE_MODE,
  pending: FusionPendingHidden | null = null,
  h: number = H_STD
) {
  const L: FusionLayout = fusionLayout(W, h, equipment.map((e) => e.id), { hidden: pending !== null, triple: fusionTripleArmed(selection, s.ownedTalentCount) });
  return { L, c: buildFusionContent(s, equipment, selection, mode, pending, L) };
}

const center = (r: FuRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const bottom = (r: FuRect): number => r.y + r.h;
const right = (r: FuRect): number => r.x + r.w;

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 读 Web 基准源码(仓库里是 CRLF,统一换行后再比对字面量) */
function webSource(): string {
  return readFileSync(new URL("../src/game.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function fileSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

/** 从 PHASE4_DEFAULTS 里抠出一张 `键 → 字面量` 的表(ViewTable 那侧 import 了 cc,node 不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(\w+):\s*"([^"]*)",\s*$/gm)) out[m[1]] = m[2];
  return out;
}

/** spreadRows 直算一遍(矩阵里的数不是从布局函数里抄回来的) */
/** 取偶下界:module = 2 的栅格上奇数 rowH / gap 会让贴图错半格 */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;

const direct = (n: number, rowsBottom: number) => {
  const s = spreadRows(n, FU_ROWS_Y0, rowsBottom, FU_ROW_MIN_H, FU_ROW_MAX_H);
  const rowH = Math.max(FU_ROW_MIN_H, evenDown(s.rowH));
  return { rowH, gap: n > 1 ? Math.max(FU_ROW_MIN_GAP, evenDown(s.gap)) : s.gap };
};

/** 钉死 roll 的两种:恒 0(逐轮取池首)与恒 0.99(逐轮取池尾) */
const ROLL_HEAD = () => 0;
const ROLL_TAIL = () => 0.99;

/* ==================== 0. 端间同一实现与本屏要用到的表事实 ==================== */

describe("端间共读同一份共享层与本屏要用到的表事实", () => {
  it("fusion 数据与 fusionLayout 两个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosFusionData.performFusion).toBe(performFusion);
    expect(cocosFusionData.performTripleFusion).toBe(performTripleFusion);
    expect(cocosFusionData.rollHiddenCandidates).toBe(rollHiddenCandidates);
    expect(cocosFusionData.applyHiddenAffix).toBe(applyHiddenAffix);
    expect(cocosFusionData.inheritSource).toBe(inheritSource);
    expect(cocosFusionData.tripleUnlocked).toBe(tripleUnlocked);
    expect(cocosFusionLayout.fusionLayout).toBe(fusionLayout);
    expect(cocosFusionLayout.fusionScreenLayout).toBe(fusionScreenLayout);
  });

  it("四个常量就是本屏全部数据门(改表就会撞上后面那几条字面量锁)", () => {
    expect(HIDDEN_PITY_N).toBe(10);
    expect(TRIPLE_FUSION_UNLOCK_TALENTS).toBe(6);
    expect(TRIPLE_FUSION_COST_MULT).toBe(2);
    expect(FUSION_COST_FALLBACK).toBe(60);
    expect(tripleUnlocked(5)).toBe(false);
    expect(tripleUnlocked(6)).toBe(true);
  });

  it("成本表按品质组合查表且对称(rare+rare 15、rare+legendary 30、legendary+legendary 60、common+common 0)", () => {
    expect(FUSION_COST_TABLE["commonxcommon"]).toBe(0);
    expect(fusionCost("rare", "rare")).toBe(15);
    expect(fusionCost("rare", "legendary")).toBe(30);
    expect(fusionCost("legendary", "rare")).toBe(fusionCost("rare", "legendary"));
    expect(fusionCost("legendary", "legendary")).toBe(60);
    expect(fusionCost("common", "epic")).toBe(10);
  });

  it("三重成本 = 两两组合最高成本 × 倍率(三件稀有 → 15 × 2 = 30;混传奇 → 30 × 2 = 60)", () => {
    const [a, b, c] = gear(3);
    expect(tripleFusionCost(a, b, c)).toBe(30);
    const legend = eq(9101, { quality: "legendary" });
    expect(tripleFusionCost(a, b, legend)).toBe(60);
    expect(TRIPLE_FUSION_COST_MULT).toBe(2);
  });

  it("隐藏词缀池 4 条(三选一的候选从这里抽,彩虹品质不入扭蛋池)", () => {
    expect(HIDDEN_AFFIXES).toHaveLength(4);
    expect(HIDDEN_AFFIXES.map((h) => h.type)).toEqual(["death_barrage", "supernova", "necromancer", "death_trail"]);
    expect(qualityDef("hidden").name).toBe("隐藏");
    for (const h of HIDDEN_AFFIXES) expect(hiddenAffixDef(h.type)).toBe(h);
  });

  it("rollHiddenCandidates 抽 3 个互不重复;注入的 roll 钉死两种极端序列", () => {
    expect(rollHiddenCandidates(ROLL_HEAD)).toEqual(["death_barrage", "supernova", "necromancer"]);
    expect(rollHiddenCandidates(ROLL_TAIL)).toEqual(["death_trail", "necromancer", "supernova"]);
    const seen = new Set(rollHiddenCandidates(ROLL_HEAD));
    expect(seen.size).toBe(3);
  });

  it("applyHiddenAffix 落上彩虹品质与词缀名,其余字段原样带走", () => {
    const base = eq(9001, { level: 7 });
    const out = applyHiddenAffix(base, "supernova");
    expect(out.quality).toBe("hidden");
    expect(out.name).toBe("超新星");
    expect(out.hiddenAffix).toBe("supernova");
    expect(out.level).toBe(7);
    expect(out.id).toBe(9001);
  });
});

/* ==================== 1. 分区纵线:顶边锚定的列表 + 底边锚定的融合钮与面板区 ==================== */

describe("分区纵线(与 Web fusionLayout 同一批裸加数)", () => {
  it("融合钮:x 居中减半宽、y = h − pad − 48、220×48(底边锚定 h)", () => {
    expect([FU_FUSE_HALF_W, FU_FUSE_W, FU_FUSE_H, FU_FUSE_UP]).toEqual([110, 220, 48, 48]);
    for (const h of [H_STD, H_TALL]) {
      const b = fusionFuseBtn(W, h);
      expect(b).toEqual({ x: W / 2 - 110, y: h - PAD - 48, w: 220, h: 48 });
      expect(bottom(b)).toBe(h - PAD);
    }
  });

  it("面板区顶缘 = 融合钮顶缘 − 196,行区预算底缘再让 12", () => {
    expect([FU_PANEL_DY, FU_ROWS_BOTTOM_DY]).toEqual([196, 12]);
    for (const h of [H_STD, H_TALL]) {
      expect(fusionPanelY(W, h)).toBe(fusionFuseBtn(W, h).y - 196);
      expect(fusionRowsBottom(W, h)).toBe(fusionPanelY(W, h) - 12);
      const L = fusionLayout(W, h, [], NO_FORMS);
      expect(L.bottom.panelY).toBe(fusionPanelY(W, h));
      expect(L.rowsBottom).toBe(fusionRowsBottom(W, h));
    }
    expect(fusionPanelY(W, H_STD)).toBe(736);
    expect(fusionPanelY(W, H_TALL)).toBe(986);
  });

  it("行区顶缘恒 100,行高钳在 44..76、行距上限走 spreadRows 的默认 maxGap 20", () => {
    expect([FU_ROWS_Y0, FU_ROW_MIN_H, FU_ROW_MAX_H]).toEqual([100, 44, 76]);
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), NO_FORMS);
    expect(L.rowsTop).toBe(FU_ROWS_Y0);
    // 只传五个实参:第六个 maxGap 走默认 20,显式传 40 会得到另一个 gap
    expect(spreadRows(3, FU_ROWS_Y0, L.rowsBottom, FU_ROW_MIN_H, FU_ROW_MAX_H, 40).gap).toBe(40);
    expect(L.rowGap).toBe(20);
    expect(direct(3, L.rowsBottom)).toEqual({ rowH: L.rowH, gap: L.rowGap });
  });

  it("返回钮 / 标题横幅 / 面板底:三处固定矩形(横幅是 assets.draw 的整幅拉伸实参)", () => {
    expect([FU_BACK_Y, FU_BANNER_DX, FU_BANNER_Y, FU_BANNER_W, FU_BANNER_H]).toEqual([18, 6, 18, 322, 40]);
    const L = fusionLayout(W, H_STD, [], NO_FORMS);
    expect(L.backBtn).toEqual({ x: W - PAD - PAD_.backW, y: 18, w: PAD_.backW, h: 44 });
    expect(L.headerBanner).toEqual({ x: PAD - 6, y: 18, w: 322, h: 40 });
    expect(right(L.backBtn)).toBe(W - PAD);
    expect(FU_PANEL_NINE).toBe(32);
    for (const h of [H_STD, H_TALL]) {
      const P = fusionLayout(W, h, [], NO_FORMS);
      expect(P.panelKey).toBe("panel_dark_corners");
      expect(P.panel).toEqual({ x: PAD, y: PAD, w: W - PAD * 2, h: h - PAD * 2 });
    }
  });

  it("三选一卡片一行三张:150×128、间距 16、cx 取偶 38、cy = evenDown(h)/2 − 64 + 10(纵向随屏高走)", () => {
    expect([FU_CARD_W, FU_CARD_H, FU_CARD_GAP, FU_CARD_CY_DY]).toEqual([150, 128, 16, 10]);
    const a = fusionLayout(W, H_STD, [], { hidden: true, triple: false });
    expect(a.hiddenCards.map((c) => c.rect)).toEqual([
      { x: 38, y: 444, w: 150, h: 128 },
      { x: 204, y: 444, w: 150, h: 128 },
      { x: 370, y: 444, w: 150, h: 128 },
    ]);
    const b = fusionLayout(W, H_TALL, [], { hidden: true, triple: false });
    expect(b.hiddenCards.map((c) => c.rect.y)).toEqual([568, 568, 568]);
    expect(right(b.hiddenCards[2].rect)).toBe(520);
  });
});

/* ==================== 2. 八格矩阵:h ∈ {996,1246} × 件数 ∈ {2,6,7,8} ==================== */

describe("八格矩阵:h ∈ {996,1246} × 装备件数 ∈ {2,6,7,8}", () => {
  /** 每格的期望值:`[rowsBottom, rowH, gap, rowsEnd, rowsToPanel, fuseBtn.y, panelY]`(布局函数实算后写死) */
  const CELL: Record<string, [number, number, number, number, number, number, number]> = {
    "996|2": [724, 76, 20, 272, 464, 932, 736],
    "996|6": [724, 76, 20, 656, 80, 932, 736],
    "996|7": [724, 76, 14, 716, 20, 932, 736],
    "996|8": [724, 72, 6, 718, 18, 932, 736],
    "1246|2": [974, 76, 20, 272, 714, 1182, 986],
    "1246|6": [974, 76, 20, 656, 330, 1182, 986],
    "1246|7": [974, 76, 20, 752, 234, 1182, 986],
    "1246|8": [974, 76, 20, 848, 138, 1182, 986],
  };

  for (const h of [H_STD, H_TALL]) {
    for (const n of BRANCHES) {
      const k = `${h}|${n}`;
      it(`${k}:${h === H_STD ? "996 档" : "1246 档"} × ${n} 件的 rowH / gap / 末行底边 / 空档 / panelY / 融合钮`, () => {
        const ids = gear(n).map((e) => e.id);
        const L = fusionLayout(W, h, ids, NO_FORMS);
        const [rowsBottom, rowH, gap, rowsEnd, rowsToPanel, fuseY, panelY] = CELL[k];
        expect(L.rowsBottom).toBe(rowsBottom);
        expect(L.rowH).toBe(rowH);
        expect(L.rowGap).toBe(gap);
        expect(L.rowStep).toBe(rowH + gap);
        expect(L.rowsEnd).toBe(rowsEnd);
        expect(L.rowsToPanel).toBe(rowsToPanel);
        expect(L.bottom.fuseBtn.y).toBe(fuseY);
        expect(L.bottom.panelY).toBe(panelY);
        expect(L.eqCount).toBe(n);
        expect(L.rows).toHaveLength(n);
        // 与 spreadRows 直算对照:矩阵不是从布局函数里抄回来的
        expect(direct(n, rowsBottom)).toEqual({ rowH, gap });
        // 末行底边落在预算内,融合钮底边恰好压在 h − pad 上(不越界)
        expect(L.rowsEnd).toBeLessThanOrEqual(L.rowsBottom);
        expect(bottom(L.bottom.fuseBtn)).toBe(h - PAD);
        // 行矩形:y = 92 + i × step、x = pad、w = w − pad×2
        L.rows.forEach((r, i) => {
          expect(r.rect).toEqual({ x: PAD, y: FU_ROWS_Y0 + i * (rowH + gap), w: W - PAD * 2, h: rowH });
          expect(r.index).toBe(i);
        });
        expect(bottom(L.rows[n - 1].rect)).toBe(rowsEnd);
      });
    }
  }

  it("跨档不变量:件数 ≤ 6 时 rowH 与 gap 同时顶到封顶,两档屏高下行矩形逐字相同", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ids = gear(n).map((e) => e.id);
      const a = fusionLayout(W, H_STD, ids, NO_FORMS);
      const b = fusionLayout(W, H_TALL, ids, NO_FORMS);
      expect(b.rows.map((r) => r.rect), `n=${n}`).toEqual(a.rows.map((r) => r.rect));
      expect(a.rowH, `n=${n}`).toBe(FU_ROW_MAX_H);
      expect(a.rowGap, `n=${n}`).toBe(20);
    }
  });

  it("跨档分界:件数 7 / 8 时 996 档的预算咬住 gap 与 rowH,两档矩形不再相同", () => {
    const ids7 = gear(7).map((e) => e.id);
    const a7 = fusionLayout(W, H_STD, ids7, NO_FORMS);
    const b7 = fusionLayout(W, H_TALL, ids7, NO_FORMS);
    expect([a7.rowH, a7.rowGap]).toEqual([76, 14]);
    expect([b7.rowH, b7.rowGap]).toEqual([76, 20]);
    expect(a7.rowsEnd).toBe(716);
    expect(b7.rowsEnd).toBe(752);
    const ids8 = gear(8).map((e) => e.id);
    const a8 = fusionLayout(W, H_STD, ids8, NO_FORMS);
    const b8 = fusionLayout(W, H_TALL, ids8, NO_FORMS);
    expect([a8.rowH, a8.rowGap]).toEqual([72, 6]);
    expect([b8.rowH, b8.rowGap]).toEqual([76, 20]);
    expect(a8.rowsEnd).toBeLessThanOrEqual(a8.rowsBottom);
    expect(b8.rowsEnd).toBeLessThanOrEqual(b8.rowsBottom);
  });

  it("屏高的差落在哪:融合钮与面板区底边锚定 h,件数少时空档全吃在末行与 panelY 之间", () => {
    const ids = gear(2).map((e) => e.id);
    const a = fusionLayout(W, H_STD, ids, NO_FORMS);
    const b = fusionLayout(W, H_TALL, ids, NO_FORMS);
    const dh = H_TALL - H_STD;
    expect(dh).toBe(250);
    expect(b.bottom.fuseBtn.y - a.bottom.fuseBtn.y).toBe(dh);
    expect(b.bottom.panelY - a.bottom.panelY).toBe(dh);
    expect(b.rowsToPanel - a.rowsToPanel).toBe(dh);
    expect(a.rowsToPanel).toBe(a.bottom.panelY - a.rowsEnd);
  });

  it("横向边界:八格下所有矩形都不越出 [pad, w − pad](标题横幅除外,它按 Web assets.draw 的 pad − 6 起笔)", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const n of BRANCHES) {
        const L = fusionLayout(W, h, gear(n).map((e) => e.id), { hidden: true, triple: true });
        const rects: FuRect[] = [
          L.panel,
          L.backBtn,
          L.bottom.fuseBtn,
          ...L.rows.map((r) => r.rect),
          ...L.bottom.modeBtns.map((m) => m.rect),
          ...L.hiddenCards.map((c) => c.rect),
        ];
        for (const r of rects) {
          expect(r.x, `h=${h} n=${n} x=${r.x}`).toBeGreaterThanOrEqual(PAD);
          expect(right(r), `h=${h} n=${n} right=${right(r)}`).toBeLessThanOrEqual(W - PAD);
        }
        // 横幅是 Web `assets.draw(…, pad − 6, 8, 190, 40)` 的实参,与其它屏 skinHeader 的
        // `bx = x − 8` 同性质:故意探出 pad
        expect(L.headerBanner.x).toBe(PAD - FU_BANNER_DX);
        expect(right(L.headerBanner)).toBeLessThanOrEqual(W - PAD);
      }
    }
  });

  it("纵向次序:末行不压面板区、模式钮不压融合钮、三张卡片不互相压", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = fusionLayout(W, h, gear(8).map((e) => e.id), { hidden: true, triple: true });
      expect(L.rowsEnd).toBeLessThan(L.bottom.panelY);
      expect(bottom(L.bottom.modeBtns[0].rect)).toBeLessThan(L.bottom.fuseBtn.y);
      expect(L.bottom.modeBtns[0].rect.y).toBe(L.bottom.panelY);
      expect(L.hiddenCards[1].rect.x).toBeGreaterThanOrEqual(right(L.hiddenCards[0].rect));
      expect(L.hiddenCards[2].rect.x).toBeGreaterThanOrEqual(right(L.hiddenCards[1].rect));
      expect(bottom(L.hiddenCards[0].rect)).toBeLessThanOrEqual(h);
    }
  });
});

/* ==================== 3. 装备行的两行布局 ==================== */

describe("装备行(两行布局 + 名字两档起笔)", () => {
  it("两行基线 l1 = evenDown(y + h/2 − 6)、l2 = l1 + 20", () => {
    expect([FU_L1_DY, FU_L2_DY]).toEqual([6, 20]);
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), NO_FORMS);
    for (const r of L.rows) {
      expect(r.l1).toBe(evenDown(r.rect.y + r.rect.h / 2 - FU_L1_DY));
      expect(r.l2).toBe(r.l1 + FU_L2_DY);
      expect(r.selTag.baseY).toBe(r.l1);
      expect(r.nameWithTag.baseY).toBe(r.l1);
      expect(r.nameBare.baseY).toBe(r.l1);
      expect(r.sub.baseY).toBe(r.l2);
      // 两行都在行矩形之内
      expect(r.l1).toBeGreaterThan(r.rect.y);
      expect(r.l2).toBeLessThan(bottom(r.rect));
    }
    expect(L.rows[0].l1).toBe(132);
    expect(L.rows[0].l2).toBe(152);
  });

  it("三处起笔:标记与摘要在 r.x + 16,名字选中档右移固定 24(不是量字)", () => {
    expect([FU_ROW_TEXT_DX, FU_SEL_TAG_DX]).toEqual([16, 24]);
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), NO_FORMS);
    for (const r of L.rows) {
      expect([r.selTag.x, r.sub.x, r.nameBare.x]).toEqual([r.rect.x + 16, r.rect.x + 16, r.rect.x + 16]);
      expect(r.nameWithTag.x).toBe(r.rect.x + 16 + 24);
      expect([r.selTag.px, r.nameWithTag.px, r.nameBare.px, r.sub.px]).toEqual([FS.body, FS.body, FS.body, FS.micro]);
      expect([r.selTag.align, r.nameWithTag.align, r.nameBare.align, r.sub.align]).toEqual(["left", "left", "left", "left"]);
    }
  });
});

/* ==================== 4. 底部三形态的几何 ==================== */

describe("底部三形态(提示 / 双选 / 三重)与融合钮的几何", () => {
  it("双选态三行基线 panelY + 20 / +42 / +62,起笔 pad、整幅内宽", () => {
    expect([FU_PAIR_READOUT_DY, FU_PAIR_PREVIEW_DY, FU_PAIR_NOTE_DY, FU_HINT_DY]).toEqual([20, 42, 62, 20]);
    for (const h of [H_STD, H_TALL]) {
      const L = fusionLayout(W, h, gear(2).map((e) => e.id), NO_FORMS);
      const py = L.bottom.panelY;
      expect([L.bottom.pairReadout.baseY, L.bottom.pairPreview.baseY, L.bottom.pairNote.baseY]).toEqual([py + 20, py + 42, py + 62]);
      expect([L.bottom.pairReadout.px, L.bottom.pairPreview.px, L.bottom.pairNote.px]).toEqual([FS.muted, FS.body, FS.micro]);
      for (const t of [L.bottom.pairReadout, L.bottom.pairPreview, L.bottom.pairNote]) {
        expect([t.x, t.maxW, t.align]).toEqual([PAD, W - PAD * 2 - 10, "left"]);
      }
      // 996 档的绝对基线
      if (h === H_STD) expect([L.bottom.pairReadout.baseY, L.bottom.pairPreview.baseY, L.bottom.pairNote.baseY]).toEqual([756, 778, 798]);
    }
  });

  it("三重态三行基线 panelY + 54 / +76 / +96(与双选态错开,两态互斥不共用)", () => {
    expect([FU_TRIPLE_READOUT_DY, FU_TRIPLE_PREVIEW_DY, FU_TRIPLE_NOTE_DY]).toEqual([56, 80, 104]);
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), { hidden: false, triple: true });
    expect([L.bottom.tripleReadout.baseY, L.bottom.triplePreview.baseY, L.bottom.tripleNote.baseY]).toEqual([792, 816, 840]);
    const T = fusionLayout(W, H_TALL, gear(3).map((e) => e.id), { hidden: false, triple: true });
    expect([T.bottom.tripleReadout.baseY, T.bottom.triplePreview.baseY, T.bottom.tripleNote.baseY]).toEqual([1042, 1066, 1090]);
  });

  it("模式钮两枚:(pad, panelY, 128, 44) 与 (pad + 136, …);文字居中走 rowTextY(fs.muted)", () => {
    expect([FU_MODE_W, FU_MODE_H, FU_MODE2_DX]).toEqual([128, 44, 136]);
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), { hidden: false, triple: true });
    expect(L.bottom.modeBtns.map((m) => m.rect)).toEqual([
      { x: PAD, y: 736, w: 128, h: 44 },
      { x: PAD + 136, y: 736, w: 128, h: 44 },
    ]);
    for (const m of L.bottom.modeBtns) {
      expect([m.text.x, m.text.baseY, m.text.maxW, m.text.px, m.text.align]).toEqual([m.rect.x + 64, rowTextY(m.rect.y, m.rect.h, FS.muted), 128, FS.muted, "center"]);
    }
    expect(L.bottom.modeBtns[0].text.baseY).toBe(762);
  });

  it("未选齐提示居中于 w/2、基线 panelY + 20;空态提示左对齐锚在 w/2(Web 的 textAlign 停在 left)", () => {
    const L = fusionLayout(W, H_STD, gear(2).map((e) => e.id), NO_FORMS);
    expect([L.bottom.hint.x, L.bottom.hint.baseY, L.bottom.hint.px, L.bottom.hint.align]).toEqual([W / 2, 756, FS.muted, "center"]);
    expect([L.emptyText.x, L.emptyText.baseY, L.emptyText.px, L.emptyText.align]).toEqual([W / 2, evenDown(H_STD / 2), FS.body, "left"]);
    expect(fusionLayout(W, H_TALL, [], NO_FORMS).emptyText.baseY).toBe(evenDown(H_TALL / 2));
  });

  it("融合钮文字居中走 rowTextY(fs.section),描边宽度取共享层的 2", () => {
    expect(FU_FUSE_STROKE_W).toBe(2);
    expect(FU_ROW_SEL_STROKE_W).toBe(2);
    for (const h of [H_STD, H_TALL]) {
      const L = fusionLayout(W, h, gear(2).map((e) => e.id), NO_FORMS);
      expect([L.bottom.fuseText.x, L.bottom.fuseText.maxW, L.bottom.fuseText.px, L.bottom.fuseText.align]).toEqual([W / 2, FU_FUSE_W, FS.section, "center"]);
      expect(L.bottom.fuseText.baseY).toBe(rowTextY(L.bottom.fuseBtn.y, FU_FUSE_H, FS.section));
    }
    expect(fusionLayout(W, H_STD, [], NO_FORMS).bottom.fuseText.baseY).toBe(961);
    expect(fusionLayout(W, H_TALL, [], NO_FORMS).bottom.fuseText.baseY).toBe(1211);
  });
});

/* ==================== 5. 三选一弹层的几何 ==================== */

describe("三选一弹层(卡片内四件与两行标题)", () => {
  it("卡内:名字 y+30(fs.body)、描述四行 y+56+i×16(fs.micro)、点击选择 y+h−12,起笔一律 x+12", () => {
    expect([FU_CARD_TEXT_DX, FU_CARD_NAME_DY, FU_CARD_DESC_DY, FU_CARD_DESC_LINE, FU_CARD_HINT_DY, FU_CARD_DESC_MAX_LINES, FU_CARD_STROKE_W]).toEqual([12, 30, 56, 16, 12, 4, 2]);
    for (const h of [H_STD, H_TALL]) {
      const L = fusionLayout(W, h, [], { hidden: true, triple: false });
      for (const card of L.hiddenCards) {
        const y = card.rect.y;
        expect([card.name.x, card.name.baseY, card.name.px]).toEqual([card.rect.x + 12, y + 30, FS.body]);
        expect(card.descLines).toHaveLength(4);
        card.descLines.forEach((d, i) => {
          expect([d.x, d.baseY, d.px]).toEqual([card.rect.x + 12, y + 56 + i * 16, FS.micro]);
        });
        expect([card.hint.x, card.hint.baseY, card.hint.px]).toEqual([card.rect.x + 12, y + FU_CARD_H - 12, FS.micro]);
        expect(card.hint.baseY).toBeLessThan(bottom(card.rect));
      }
      if (h === H_STD) expect(L.hiddenCards[0].descLines.map((d) => d.baseY)).toEqual([500, 516, 532, 548]);
    }
  });

  it("弹层两行:标题基线 h/2 − 110(fs.title 居中)、副行 h/2 − 78(fs.body 居中)", () => {
    expect([FU_HIDDEN_TITLE_DY, FU_HIDDEN_SUB_DY]).toEqual([110, 78]);
    const L = fusionLayout(W, H_STD, [], { hidden: true, triple: false });
    expect([L.hiddenTitle.x, L.hiddenTitle.baseY, L.hiddenTitle.px, L.hiddenTitle.align]).toEqual([W / 2, 388, FS.title, "center"]);
    expect([L.hiddenSub.x, L.hiddenSub.baseY, L.hiddenSub.px, L.hiddenSub.align]).toEqual([W / 2, 420, FS.body, "center"]);
    const T = fusionLayout(W, H_TALL, [], { hidden: true, triple: false });
    expect([T.hiddenTitle.baseY, T.hiddenSub.baseY]).toEqual([512, 544]);
    // 标题两行都压在卡片顶缘之上
    expect(L.hiddenSub.baseY).toBeLessThan(L.hiddenCards[0].rect.y);
  });
});

/* ==================== 6. 头部几何(裸 assets.draw 横幅 / iconText / 纯代码返回钮) ==================== */

describe("头部几何(对标 Web 的裸横幅、iconText 与纯代码返回钮)", () => {
  it("标题两档:缺图左起笔于 pad、有横幅居中于绸带,同一基线 44、fs.title", () => {
    expect(FU_TITLE_BASE_Y).toBe(44);
    for (const h of [H_STD, H_TALL]) {
      const L = fusionLayout(W, h, [], NO_FORMS);
      expect([L.title.x, L.title.baseY, L.title.px, L.title.align]).toEqual([PAD, 44, FS.title, "left"]);
      expect([L.titleOnBanner.baseY, L.titleOnBanner.px, L.titleOnBanner.align]).toEqual([44, FS.title, "center"]);
      expect(L.titleOnBanner.x).toBe(evenDown(L.headerBanner.x + L.headerBanner.w / 2));
      expect(L.titleOnBanner.maxW).toBe(L.headerBanner.w - FU_BANNER_DX * 2);
      // 让位 10px:标题末笔压在返回钮起笔之前(限宽在布局里 evenDown 过)
      expect(right({ x: L.title.x, y: 0, w: L.title.maxW, h: 0 })).toBe(L.backBtn.x - 10);
    }
  });

  it("星尘读数走 iconText(size 28 = 自然尺寸):图标盒 (pad, 88 − 28 + 2, 28, 28),有图时文字右移 28 + 8、缺图时回到 pad", () => {
    expect([FU_ICON_SIZE, FU_ICON_DY, FU_ICON_TEXT_DX, FU_RES_BASE_Y]).toEqual([28, 2, 8, 88]);
    const L = fusionLayout(W, H_STD, [], NO_FORMS);
    expect(L.stardustIcon).toEqual({ x: PAD, y: 62, w: 28, h: 28 });
    expect([L.stardustTextWithIcon.x, L.stardustTextBare.x]).toEqual([PAD + 28 + 8, PAD]);
    for (const t of [L.stardustTextWithIcon, L.stardustTextBare]) {
      expect([t.baseY, t.px, t.align]).toEqual([88, FS.body, "left"]);
      expect(right({ x: t.x, y: 0, w: t.maxW, h: 0 })).toBe(W - PAD - 10);
      expect(t.maxW % 2).toBe(0);
    }
  });

  it("返回钮是纯代码矩形:文字居中、基线 rowTextY(18, 44, fs.muted) = 44(fs.muted,不是 skinIconButton 的 fs.body)", () => {
    const L = fusionLayout(W, H_STD, [], NO_FORMS);
    expect([L.backText.x, L.backText.baseY, L.backText.maxW, L.backText.px, L.backText.align]).toEqual([L.backBtn.x + 36, 44, PAD_.backW, FS.muted, "center"]);
    expect(L.backText.baseY).toBe(rowTextY(FU_BACK_Y, 44, FS.muted));
  });
});

/* ==================== 7. 文本带右界(fusionLayout 全网格) ==================== */

describe("文本带右界(fusionLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    for (const align of ["left", "center", "right"] as TextAlign[]) {
      const band: Band = anchorBand(100, 20, 120, 14, align, LIFT);
      expect(band.x + band.w * alignAx(align)).toBe(100);
      expect(band.w).toBe(120);
    }
  });

  it("两档屏高 × 两个件数档:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const n of [2, 8]) {
        const L = fusionLayout(W, h, gear(n).map((e) => e.id), { hidden: true, triple: true });
        const lines: FuTextLine[] = [
          L.title,
          L.stardustTextWithIcon,
          L.stardustTextBare,
          L.backText,
          L.emptyText,
          L.bottom.hint,
          L.bottom.pairReadout,
          L.bottom.pairPreview,
          L.bottom.pairNote,
          L.bottom.tripleReadout,
          L.bottom.triplePreview,
          L.bottom.tripleNote,
          L.bottom.fuseText,
          L.hiddenTitle,
          L.hiddenSub,
          ...L.bottom.modeBtns.map((m) => m.text),
          ...L.rows.flatMap((r) => [r.selTag, r.nameWithTag, r.nameBare, r.sub]),
          ...L.hiddenCards.flatMap((c) => [c.name, ...c.descLines, c.hint]),
        ];
        for (const t of lines) {
          const band = anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
          expect(band.x, `h=${h} n=${n} x=${t.x}`).toBeGreaterThanOrEqual(0);
          expect(band.x + band.w, `h=${h} n=${n} x=${t.x}`).toBeLessThanOrEqual(W);
        }
      }
    }
  });

  it("居中文字位都在自己那个矩形里(模式钮与融合钮)", () => {
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), { hidden: false, triple: true });
    const pairs: [FuRect, FuTextLine][] = [...L.bottom.modeBtns.map((m): [FuRect, FuTextLine] => [m.rect, m.text]), [L.bottom.fuseBtn, L.bottom.fuseText]];
    for (const [r, t] of pairs) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(r.x + r.w / 2);
      expect(t.maxW).toBe(r.w);
      expect(center(r).x).toBe(t.x);
    }
  });
});

/* ==================== 8. 屏级文案逐字 ==================== */

describe("屏级文案逐字(对标 Web drawFusion / drawHiddenChoice / drawTriplePanel 的 fillText 实参)", () => {
  it("标题、返回、空态三串逐字(标点不许改)", () => {
    const { c } = frame(gear(2));
    expect(c.title).toBe("装备融合");
    expect(c.backText).toBe("返回");
    expect(c.emptyText).toBe("至少需要 2 件装备才能融合");
  });

  it("星尘读数与保底读数的插值同 Web 原样(HIDDEN_PITY_N 是从常量插值,不是字面量)", () => {
    const two = gear(2);
    const { c } = frame(two, save({ stardust: 77, fusionPity: 3 }), sel({ a: two[0].id, b: two[1].id }));
    expect(c.stardustText).toBe("星尘 77");
    expect(c.readoutText).toBe("星尘成本 15 · 隐藏词缀保底 3/10");
    expect(c.readoutText).toBe(`星尘成本 ${fusionCost("rare", "rare")} · 隐藏词缀保底 3/${HIDDEN_PITY_N}`);
  });

  it("未选齐提示两档由 tripleUnlocked 分派(第二档的 6 是 Web 的字面量)", () => {
    expect(fusionHintText(5)).toBe("选择两件装备进行融合(A/B);三重融合需解锁 ≥6 个天赋节点");
    expect(fusionHintText(6)).toBe("选择两件(融合)或三件(三重融合·双触发器/双修饰器)");
    expect(frame(gear(2)).c.hintText).toBe(fusionHintText(0));
    expect(frame(gear(2), save({ ownedTalentCount: 6 })).c.hintText).toBe(fusionHintText(6));
  });

  it("双选态预览行 = `融合预览:` + performFusion 的成品名 + 继承源品质名(必成功注记是字面量)", () => {
    const [a, b] = gear(2);
    const { c } = frame([a, b], save({ stardust: 99 }), sel({ a: a.id, b: b.id }));
    expect(c.bottomKind).toBe("pair");
    const outcome = performFusion(a, b);
    const src = inheritSource(a, b);
    expect(c.previewText).toBe(`融合预览:${outcome.result.name}(${qualityDef(src.quality).name})`);
    expect(c.previewText).toBe(`融合预览:融合·${fusionAffixSummary(src)}(${qualityDef(src.quality).name})`);
    expect(c.previewColor).toBe(qualityDef(src.quality).color);
    expect(c.noteText).toBe("部件自动继承品质更高一方(同品质取 A);必成功");
    expect(c.canFuse).toBe(true);
    expect(c.fuseText).toBe("融合");
  });

  it("继承源是品质更高一方(同品质取 A):rare + legendary 的预览走 legendary", () => {
    const a = eq(9001);
    const b = eq(9002, { quality: "legendary", name: "传奇样本", level: 9 });
    const { c } = frame([a, b], save({ stardust: 999 }), sel({ a: a.id, b: b.id }));
    expect(c.cost).toBe(fusionCost("rare", "legendary"));
    expect(c.cost).toBe(30);
    expect(c.previewText.endsWith(`(${qualityDef("legendary").name})`)).toBe(true);
    expect(c.previewColor).toBe(qualityDef("legendary").color);
  });

  it("星尘不足时钮文案换成 `星尘不足(cost)`,canFuse 为假(点击仍返回动作,静默在 claim)", () => {
    const two = gear(2);
    const { c } = frame(two, save({ stardust: 14 }), sel({ a: two[0].id, b: two[1].id }));
    expect([c.canFuse, c.fuseText]).toEqual([false, "星尘不足(15)"]);
  });

  it("三重态读数行、预览行与两档保留说明(模式跟随)", () => {
    const three = gear(3, { modifiers: [makeModifier("explode", { radius: 120, damageMult: 1 })] });
    const s3 = sel({ a: three[0].id, b: three[1].id, c: three[2].id });
    const on = save({ stardust: 999, ownedTalentCount: 6 });
    const t = frame(three, on, s3, "double_trigger").c;
    expect(t.bottomKind).toBe("triple");
    expect(t.readoutText).toBe(`三重融合 · 星尘 30 · 隐藏词缀保底 0/${HIDDEN_PITY_N}`);
    const main = inheritSource(inheritSource(three[0], three[1]), three[2]);
    expect(t.previewText).toBe(`三重预览:三重·${fusionAffixSummary(main)}(${qualityDef(main.quality).name})`);
    expect(t.noteText).toBe("额外保留:其余装备首个触发器");
    expect(t.fuseText).toBe("三重融合");
    const t2 = frame(three, on, s3, "double_modifier").c;
    expect(t2.noteText).toBe("额外保留:其余装备首个修饰器");
    expect(t2.modes.map((m) => [m.mode, m.label, m.sel])).toEqual([
      ["double_trigger", "双触发器", false],
      ["double_modifier", "双修饰器", true],
    ]);
  });

  it("行文案:名字 / 摘要 / 隐藏档三件(摘要串与预览串是同一个内联模板)", () => {
    const a = eq(9001, { level: 5, quality: "epic", modifiers: [makeModifier("explode", { radius: 120, damageMult: 1 })] });
    const b = eq(9002, { hiddenAffix: "supernova", name: "超新星", quality: "hidden" });
    const { c } = frame([a, b]);
    expect(c.rows).toHaveLength(2);
    expect(c.rows[0].nameText).toBe(a.name);
    expect(c.rows[0].subText).toBe(`Lv.5 ${qualityDef("epic").name} · ${fusionAffixSummary(a)}`);
    expect(c.rows[0].subText).toBe(`Lv.5 史诗 · 周期脉冲/飞刀投射·爆炸`);
    expect(c.rows[0].qualityColor).toBe(qualityDef("epic").color);
    expect(c.rows[0].disabled).toBe(false);
    expect(c.rows[1].nameText).toBe("【隐藏·超新星】");
    expect(c.rows[1].subText.endsWith(" · 不可作素材")).toBe(true);
    expect(c.rows[1].disabled).toBe(true);
  });

  it("弹层文案:标题、副行(HIDDEN_PITY_N 插值)、卡片名与「点击选择」", () => {
    const base = eq(9001);
    const pending: FusionPendingHidden = { base, candidates: rollHiddenCandidates(ROLL_HEAD) };
    const { c } = frame([base, eq(9002)], save(), sel(), FUSION_DEFAULT_TRIPLE_MODE, pending);
    expect(c.hidden).not.toBeNull();
    expect(c.hidden!.title).toBe("隐藏词缀保底!");
    expect(c.hidden!.subText).toBe(`选择 1 / 3(每 ${HIDDEN_PITY_N} 次融合必出)`);
    expect(c.hidden!.subText).toBe("选择 1 / 3(每 10 次融合必出)");
    expect(c.hidden!.cardHint).toBe("点击选择");
    expect(c.hidden!.cards.map((x) => x.name)).toEqual(["死亡弹幕", "超新星", "亡灵契约"]);
    expect(c.hidden!.cards.map((x) => x.color)).toEqual(HIDDEN_AFFIXES.slice(0, 3).map((x) => x.color));
    expect(c.hidden!.cards[0].descLines).toEqual(["击杀时向所有方向发射", "8把飞刀"]);
  });

  it("bottomKind 的五档分派:empty / hint / pair / triple / silent(三重态素材落空整块不画)", () => {
    expect(frame(gear(1)).c.bottomKind).toBe("empty");
    expect(frame([]).c.bottomKind).toBe("empty");
    expect(frame(gear(2)).c.bottomKind).toBe("hint");
    const two = gear(2);
    expect(frame(two, save(), sel({ a: two[0].id })).c.bottomKind).toBe("hint");
    expect(frame(two, save(), sel({ a: two[0].id, b: two[1].id })).c.bottomKind).toBe("pair");
    const three = gear(3);
    const s3 = sel({ a: three[0].id, b: three[1].id, c: three[2].id });
    expect(frame(three, save({ ownedTalentCount: 6 }), s3).c.bottomKind).toBe("triple");
    // 三重态成立但 id 落空(Web drawTriplePanel 首行 return):底部整块不画
    expect(frame(three, save({ ownedTalentCount: 6 }), sel({ a: three[0].id, b: three[1].id, c: 404 })).c.bottomKind).toBe("silent");
    // empty 档行不产内容(Web 在行循环之前 return)
    expect(frame(gear(1)).c.rows).toEqual([]);
  });
});

/* ==================== 9. 选中态流转(Web onFusionEquipmentTap 逐字) ==================== */

describe("选中态流转(fusionTapSelection)", () => {
  it("补位顺序 A → B → C;再点已选中的那一格取消", () => {
    let s = FUSION_DEFAULT_SELECTION;
    s = fusionTapSelection(s, 1);
    expect(s).toEqual({ a: 1, b: null, c: null });
    s = fusionTapSelection(s, 2);
    expect(s).toEqual({ a: 1, b: 2, c: null });
    s = fusionTapSelection(s, 3);
    expect(s).toEqual({ a: 1, b: 2, c: 3 });
    expect(fusionTapSelection(s, 2)).toEqual({ a: 1, b: null, c: 3 });
    expect(fusionTapSelection(s, 1)).toEqual({ a: null, b: 2, c: 3 });
    expect(fusionTapSelection(s, 3)).toEqual({ a: 1, b: 2, c: null });
  });

  it("三件都占了再点第四件:换成当前点击的那一件(B/C 清空)", () => {
    const s = sel({ a: 1, b: 2, c: 3 });
    expect(fusionTapSelection(s, 4)).toEqual({ a: 4, b: null, c: null });
  });

  it("空位优先补靠前的格:A 取消后再点是回到 A,不是补 B", () => {
    const s = sel({ a: null, b: 2, c: null });
    expect(fusionTapSelection(s, 5)).toEqual({ a: 5, b: 2, c: null });
  });

  it("隐藏词缀装备照样能点选(拦截在 doFusion 的素材守卫,不在点选)", () => {
    const claim = fusionClaim(save(), [eq(9001, { hiddenAffix: "supernova" }), eq(9002)], sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "tap", id: 9001 });
    expect(claim).toEqual({ kind: "select", persists: false, sel: { a: 9001, b: null, c: null } });
  });

  it("三重态判据 = fusC 已选 且 天赋数 ≥ 6(两个条件缺一不可)", () => {
    expect(fusionTripleArmed(sel({ c: 3 }), 6)).toBe(true);
    expect(fusionTripleArmed(sel({ c: 3 }), 5)).toBe(false);
    expect(fusionTripleArmed(sel({ a: 1, b: 2 }), 6)).toBe(false);
    expect(fusionTripleArmed(sel({ a: 1, b: 2, c: null }), 99)).toBe(false);
    expect(TRIPLE_MODES).toEqual(["double_trigger", "double_modifier"]);
    expect(TRIPLE_MODE_LABELS).toEqual(["双触发器", "双修饰器"]);
    expect(FUSION_DEFAULT_TRIPLE_MODE).toBe("double_trigger");
  });

  it("fusedPair / fusedTriple 按 id 回列表 find(与 Web 同一条口径)", () => {
    const [a, b, c] = gear(3);
    expect(fusedPair([a, b, c], sel({ a: a.id, b: c.id }))).toEqual([a, c]);
    expect(fusedTriple([a, b, c], sel({ a: a.id, b: b.id, c: 404 }))).toEqual([a, b, undefined]);
  });
});

/* ==================== 10. hitFusion(对标 Web onFusionClick 的五段) ==================== */

describe("hitFusion(对标 Web onFusionClick 的五段)", () => {
  it("普通态:返回钮 → 装备行 → 融合钮,各自中心都命中自己", () => {
    const ids = gear(3).map((e) => e.id);
    const L = fusionLayout(W, H_STD, ids, NO_FORMS);
    const b = center(L.backBtn);
    expect(hitFusion(L, b.x, b.y)).toEqual({ kind: "back" });
    L.rows.forEach((r) => {
      const p = center(r.rect);
      expect(hitFusion(L, p.x, p.y)).toEqual({ kind: "tap", id: r.id });
    });
    const f = center(L.bottom.fuseBtn);
    expect(hitFusion(L, f.x, f.y)).toEqual({ kind: "fuse" });
  });

  it("三重态:模式钮两枚各命中自己的下标,融合钮照旧", () => {
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), { hidden: false, triple: true });
    L.bottom.modeBtns.forEach((m) => {
      const p = center(m.rect);
      expect(hitFusion(L, p.x, p.y)).toEqual({ kind: "mode", index: m.index });
    });
    const f = center(L.bottom.fuseBtn);
    expect(hitFusion(L, f.x, f.y)).toEqual({ kind: "fuse" });
  });

  it("非三重态下模式钮矩形不参与命中(Web 的模式钮判定包在 triple 分支里)", () => {
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), NO_FORMS);
    for (const m of L.bottom.modeBtns) {
      const p = center(m.rect);
      expect(hitFusion(L, p.x, p.y)).toBeNull();
    }
  });

  it("弹层态:只有三张卡片是热区,返回钮 / 装备行 / 融合钮 / 模式钮全部吞掉", () => {
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), { hidden: true, triple: true });
    L.hiddenCards.forEach((card) => {
      const p = center(card.rect);
      expect(hitFusion(L, p.x, p.y)).toEqual({ kind: "pickHidden", index: card.idx });
    });
    const b = center(L.backBtn);
    expect(hitFusion(L, b.x, b.y)).toBeNull();
    const r = center(L.rows[0].rect);
    expect(hitFusion(L, r.x, r.y)).toBeNull();
    const f = center(L.bottom.fuseBtn);
    expect(hitFusion(L, f.x, f.y)).toBeNull();
    const m = center(L.bottom.modeBtns[0].rect);
    expect(hitFusion(L, m.x, m.y)).toBeNull();
  });

  it("矩形四角与边线都算命中(Web 的 >= x && <= x + w 闭区间)", () => {
    const L = fusionLayout(W, H_STD, gear(2).map((e) => e.id), NO_FORMS);
    const r = L.rows[1].rect;
    for (const [x, y] of [
      [r.x, r.y],
      [right(r), r.y],
      [r.x, bottom(r)],
      [right(r), bottom(r)],
    ]) {
      expect(hitFusion(L, x, y)).toEqual({ kind: "tap", id: L.rows[1].id });
    }
  });

  it("热区之外的空白不产任何动作(没有'其余一律'兜底)", () => {
    const L = fusionLayout(W, H_STD, gear(3).map((e) => e.id), NO_FORMS);
    for (const [x, y] of [
      [0, 0],
      [W / 2, 80],
      [PAD + 1, L.rowsEnd + 5],
      [W - 1, H_STD - 1],
      [L.bottom.fuseBtn.x - 1, center(L.bottom.fuseBtn).y],
    ]) {
      expect(hitFusion(L, x, y), `(${x},${y})`).toBeNull();
    }
  });

  it("命中层不看状态:星尘不足与素材带隐藏词缀都照样返回 fuse 动作,静默留给 fusionClaim", () => {
    const two = gear(2);
    const L = fusionLayout(W, H_STD, two.map((e) => e.id), NO_FORMS);
    const f = center(L.bottom.fuseBtn);
    expect(hitFusion(L, f.x, f.y)).toEqual({ kind: "fuse" });
    const s = sel({ a: two[0].id, b: two[1].id });
    expect(fusionClaim(save({ stardust: 0 }), two, s, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    const hiddenMats = [eq(9001, { hiddenAffix: "supernova" }), eq(9002)];
    expect(fusionClaim(save({ stardust: 999 }), hiddenMats, sel({ a: 9001, b: 9002 }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
  });
});

/* ==================== 11. fusionClaim(动作 → 写入意图) ==================== */

describe("fusionClaim(融合与三选一两档入帐;选中态与模式两档是瞬时态)", () => {
  it("双选融合(未触达保底):扣 15、保底 +1、素材移除、成品直接入场并落盘、选中清空", () => {
    const [a, b] = gear(2);
    const claim = fusionClaim(save({ stardust: 100 }), [a, b], sel({ a: a.id, b: b.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })!;
    expect(claim.kind).toBe("fuse");
    if (claim.kind !== "fuse") return;
    expect([claim.persists, claim.stardustCost, claim.fusionPityTo]).toEqual([true, 15, 1]);
    expect(claim.removeIds).toEqual([a.id, b.id]);
    expect(claim.pending).toBeNull();
    expect(claim.clearSelection).toBe(true);
    expect(claim.result).not.toBeNull();
    // 必成功 + 自动继承:成品就是 performFusion 的同一份(id 保留 A 的、等级取 max、名字 融合·…)
    expect(claim.result).toEqual(performFusion(a, b).result);
    expect(claim.result!.id).toBe(a.id);
    expect(claim.result!.name.startsWith("融合·")).toBe(true);
  });

  it("保底推进:+1 递增、到 HIDDEN_PITY_N 归零并触达(bumpFusionPity 与 Web 逐字同式)", () => {
    expect(HIDDEN_PITY_N).toBe(10);
    expect(bumpFusionPity(0)).toEqual({ pityTo: 1, hitsPity: false });
    expect(bumpFusionPity(7)).toEqual({ pityTo: 8, hitsPity: false });
    expect(bumpFusionPity(8)).toEqual({ pityTo: 9, hitsPity: false });
    expect(bumpFusionPity(9)).toEqual({ pityTo: 0, hitsPity: true });
    // 开发键把计数摆到 HIDDEN_PITY_N − 1,下一发就触达(Web F4 的同款造条件方式)
    expect(bumpFusionPity(HIDDEN_PITY_N - 1).hitsPity).toBe(true);
  });

  it("保底触达那一发:素材照扣、成品转三选一暂存、**不落盘也不清选中**", () => {
    const [a, b] = gear(2);
    const claim = fusionClaim(save({ stardust: 100, fusionPity: 9 }), [a, b], sel({ a: a.id, b: b.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" }, ROLL_HEAD)!;
    if (claim.kind !== "fuse") throw new Error("unreachable");
    expect([claim.persists, claim.fusionPityTo, claim.clearSelection]).toEqual([false, 0, false]);
    expect(claim.result).toBeNull();
    expect(claim.removeIds).toEqual([a.id, b.id]);
    expect(claim.pending).not.toBeNull();
    expect(claim.pending!.candidates).toEqual(["death_barrage", "supernova", "necromancer"]);
    // 暂存的 base 就是未落隐藏词缀的成品(选定后经 applyHiddenAffix 落上)
    expect(claim.pending!.base).toEqual(performFusion(a, b).result);
    expect(claim.pending!.base.hiddenAffix).toBeUndefined();
  });

  it("三选一落定:成品带上彩虹品质与词缀名入场并落盘;暂存落空 / 下标越界都静默", () => {
    const base = eq(9001);
    const pending: FusionPendingHidden = { base, candidates: rollHiddenCandidates(ROLL_HEAD) };
    const claim = fusionClaim(save(), [eq(9003)], sel(), FUSION_DEFAULT_TRIPLE_MODE, pending, { kind: "pickHidden", index: 1 })!;
    expect(claim).toEqual({ kind: "pickHidden", persists: true, result: applyHiddenAffix(base, "supernova") });
    if (claim.kind !== "pickHidden") return;
    expect([claim.result.quality, claim.result.name, claim.result.hiddenAffix]).toEqual(["hidden", "超新星", "supernova"]);
    expect(fusionClaim(save(), [], sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "pickHidden", index: 0 })).toBeNull();
    expect(fusionClaim(save(), [], sel(), FUSION_DEFAULT_TRIPLE_MODE, pending, { kind: "pickHidden", index: 3 })).toBeNull();
  });

  it("三重融合(解锁 + 选满三件):成本 = 两两最高 × 2,主源取品质最高,模式追加第二个部件", () => {
    const a = eq(9001);
    const b = eq(9002, { triggers: [makeTrigger("kill", { chance: 0.2 })], modifiers: [makeModifier("explode", { radius: 120, damageMult: 1 })] });
    const c = eq(9003, { quality: "legendary", level: 9, modifiers: [makeModifier("chain", { targets: 2 })] });
    const s3 = sel({ a: a.id, b: b.id, c: c.id });
    const claim = fusionClaim(save({ stardust: 999, ownedTalentCount: 6 }), [a, b, c], s3, "double_trigger", null, { kind: "fuse" })!;
    if (claim.kind !== "fuse") throw new Error("unreachable");
    expect(claim.stardustCost).toBe(60);
    expect(claim.stardustCost).toBe(tripleFusionCost(a, b, c));
    expect(claim.removeIds).toEqual([a.id, b.id, c.id]);
    expect(claim.result).toEqual(performTripleFusion(a, b, c, "double_trigger").result);
    // 主源是传奇的 c:品质跟 c;double_trigger 再补其余装备的首个触发器(a 的脉冲)
    expect(claim.result!.quality).toBe("legendary");
    expect(claim.result!.level).toBe(9);
    expect(claim.result!.name.startsWith("三重·")).toBe(true);
    expect(claim.result!.triggers).toHaveLength(2);
    expect(claim.result!.modifiers).toHaveLength(1);
    const mod = fusionClaim(save({ stardust: 999, ownedTalentCount: 6 }), [a, b, c], s3, "double_modifier", null, { kind: "fuse" })!;
    if (mod.kind !== "fuse") throw new Error("unreachable");
    expect(mod.result).toEqual(performTripleFusion(a, b, c, "double_modifier").result);
    // double_modifier:触发器只有主源的一份,修饰器补上其余装备的首个(b 的爆炸)
    expect(mod.result!.triggers).toHaveLength(1);
    expect(mod.result!.modifiers).toHaveLength(2);
  });

  it("三重未解锁(天赋 < 6)时选满三件仍走双选口径:只吃 A/B,C 原样留在列表里", () => {
    const [a, b, c] = gear(3);
    const s3 = sel({ a: a.id, b: b.id, c: c.id });
    const claim = fusionClaim(save({ stardust: 999, ownedTalentCount: 5 }), [a, b, c], s3, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })!;
    if (claim.kind !== "fuse") throw new Error("unreachable");
    expect(claim.stardustCost).toBe(fusionCost("rare", "rare"));
    expect(claim.removeIds).toEqual([a.id, b.id]);
    expect(claim.result).toEqual(performFusion(a, b).result);
  });

  it("doFusion 的静默守卫逐条:素材不足 / 素材带隐藏词缀 / 星尘不足 / 三重素材缺件", () => {
    const [a, b, c] = gear(3);
    const s2 = sel({ a: a.id, b: b.id });
    // 只选了一件(find 落空)
    expect(fusionClaim(save({ stardust: 999 }), [a, b], sel({ a: a.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 选中的 id 不在列表里
    expect(fusionClaim(save({ stardust: 999 }), [a, b], sel({ a: 404, b: b.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 素材带隐藏词缀(双选)
    const hid = eq(9003, { hiddenAffix: "necromancer" });
    expect(fusionClaim(save({ stardust: 999 }), [a, hid], sel({ a: a.id, b: hid.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 星尘不足(恰好差 1)
    expect(fusionClaim(save({ stardust: 14 }), [a, b], s2, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 恰好够(边界)
    expect(fusionClaim(save({ stardust: 15 }), [a, b], s2, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })!.kind).toBe("fuse");
    // 三重态素材带隐藏词缀
    const on6 = save({ stardust: 999, ownedTalentCount: 6 });
    expect(fusionClaim(on6, [a, b, hid], sel({ a: a.id, b: b.id, c: hid.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 三重态 find 落空(mats.length < 3)
    expect(fusionClaim(on6, [a, b], sel({ a: a.id, b: b.id, c: 404 }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
    // 三重星尘不足
    expect(fusionClaim(save({ stardust: 29, ownedTalentCount: 6 }), [a, b, c], sel({ a: a.id, b: b.id, c: c.id }), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })).toBeNull();
  });

  it("back 不产写入意图(Web 是 `state = overlayFrom`,本屏唯一入口是商店 → 由宿主回 shop)", () => {
    expect(fusionClaim(save(), gear(2), sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "back" })).toBeNull();
  });

  it("mode 动作:下标 0 / 1 各改一档模式,越界静默;两类瞬时态 persists 都是 false", () => {
    expect(fusionClaim(save(), gear(2), sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "mode", index: 1 })).toEqual({ kind: "mode", persists: false, mode: "double_modifier" });
    expect(fusionClaim(save(), gear(2), sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "mode", index: 0 })).toEqual({ kind: "mode", persists: false, mode: "double_trigger" });
    expect(fusionClaim(save(), gear(2), sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "mode", index: 2 })).toBeNull();
    expect(fusionClaim(save(), gear(2), sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "tap", id: 9001 })!.persists).toBe(false);
  });

  it("四个动作里只有两档 persists 为真(融合未触达与三选一落定),触达档与瞬时档都不落盘", () => {
    const [a, b] = gear(2);
    const s2 = sel({ a: a.id, b: b.id });
    const persisting: boolean[] = [
      fusionClaim(save({ stardust: 99 }), [a, b], s2, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" })!.persists,
      fusionClaim(save(), [eq(9003)], sel(), FUSION_DEFAULT_TRIPLE_MODE, { base: a, candidates: ["supernova"] }, { kind: "pickHidden", index: 0 })!.persists,
    ];
    const transient: boolean[] = [
      fusionClaim(save({ stardust: 99, fusionPity: 9 }), [a, b], s2, FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "fuse" }, ROLL_HEAD)!.persists,
      fusionClaim(save(), [a, b], sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "tap", id: a.id })!.persists,
      fusionClaim(save(), [a, b], sel(), FUSION_DEFAULT_TRIPLE_MODE, null, { kind: "mode", index: 0 })!.persists,
    ];
    expect(persisting).toEqual([true, true]);
    expect(transient).toEqual([false, false, false]);
  });

  it("模型不改传入的存档 / 局内装备 / 选中态 / 暂存(deepFreeze 守:全部动作跑一遍也不抛)", () => {
    const [a, b, c] = gear(3);
    const equipment = [a, b, c];
    const s = save({ stardust: 999, fusionPity: 9, ownedTalentCount: 6 });
    const pending: FusionPendingHidden = { base: a, candidates: rollHiddenCandidates(ROLL_HEAD) };
    Object.freeze(s);
    Object.freeze(equipment);
    for (const e of equipment) Object.freeze(e);
    Object.freeze(pending);
    Object.freeze(pending.candidates);
    const s3 = sel({ a: a.id, b: b.id, c: c.id });
    Object.freeze(s3);
    const actions: FusionAction[] = [
      { kind: "back" },
      { kind: "tap", id: a.id },
      { kind: "mode", index: 1 },
      { kind: "fuse" },
      { kind: "pickHidden", index: 0 },
    ];
    for (const act of actions) expect(() => fusionClaim(s, equipment, s3, FUSION_DEFAULT_TRIPLE_MODE, pending, act, ROLL_HEAD), act.kind).not.toThrow();
    buildFusionContent(s, equipment, s3, FUSION_DEFAULT_TRIPLE_MODE, pending, fusionLayout(W, H_STD, equipment.map((e) => e.id), { hidden: true, triple: true }));
    expect(s.stardust).toBe(999);
    expect(equipment).toHaveLength(3);
  });
});

/* ==================== 12. 字面量锁:Web 文案与表里的同源常量 ==================== */

describe("字面量锁(Web 基准里确实有这些串,且表常量与它同数)", () => {
  const web = webSource();
  const draw = web.slice(web.indexOf("private fusionLayout()"), web.indexOf("/* ---------- 体力不足面板"));
  const play = web.slice(web.indexOf("private openFusion("), web.indexOf("private onKey("));

  it("Web 基准 src/game.ts 的融合段里逐字存在这一批文案", () => {
    for (const t of [
      "至少需要 2 件装备才能融合",
      "选择两件(融合)或三件(三重融合·双触发器/双修饰器)",
      "选择两件装备进行融合(A/B);三重融合需解锁 ≥6 个天赋节点",
      "部件自动继承品质更高一方(同品质取 A);必成功",
      "额外保留:其余装备首个触发器",
      "额外保留:其余装备首个修饰器",
      "隐藏词缀保底!",
      "点击选择",
      "双触发器",
      "双修饰器",
      "融合预览:融合·",
      "三重预览:三重·",
      "三重融合 · 星尘 ",
      "星尘成本 ",
    ]) {
      expect(draw.includes(t), t).toBe(true);
    }
  });

  it("「≥6 个天赋节点」的 6 是裸字面量:与 TRIPLE_FUSION_UNLOCK_TALENTS 同数(改表就会撞上这条)", () => {
    expect(TRIPLE_FUSION_UNLOCK_TALENTS).toBe(6);
    expect(draw.includes("≥6 个天赋节点")).toBe(true);
    expect(draw.includes("≥${")).toBe(false);
    expect(fusionHintText(0)).toBe(`选择两件装备进行融合(A/B);三重融合需解锁 ≥${TRIPLE_FUSION_UNLOCK_TALENTS} 个天赋节点`);
  });

  it("卡片描述的折行两档(每行 10 字、最多 4 行)是 Web 的裸字面量,模型常量与它同数", () => {
    expect(FUSION_CARD_DESC_CHARS).toBe(10);
    expect(FU_CARD_DESC_MAX_LINES).toBe(4);
    expect(draw.includes("line * 10 < chars.length && line < 4")).toBe(true);
    expect(draw.includes("chars.slice(line * 10, line * 10 + 10)")).toBe(true);
    // 四条词缀的描述都短于 40 字,折行还原后与原串逐字相同
    for (const h of HIDDEN_AFFIXES) {
      const lines = hiddenCardDescLines(h.desc);
      expect(lines.length).toBe(Math.ceil(h.desc.length / 10));
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(lines.join("")).toBe(h.desc);
      expect(lines.every((l, i) => l.length === (i === lines.length - 1 ? h.desc.length - 10 * i : 10))).toBe(true);
    }
    expect(hiddenCardDescLines("击杀时向所有方向发射8把飞刀")).toEqual(["击杀时向所有方向发射", "8把飞刀"]);
  });

  it("两条读数行与弹层副行里的保底上限是从 HIDDEN_PITY_N 插值(不是字面量 10)", () => {
    expect((draw.match(/\$\{HIDDEN_PITY_N\}/g) ?? []).length).toBe(3);
    expect(draw.includes("保底 10")).toBe(false);
    const two = gear(2);
    const { c } = frame(two, save({ fusionPity: 4 }), sel({ a: two[0].id, b: two[1].id }));
    expect(c.readoutText).toBe("星尘成本 15 · 隐藏词缀保底 4/10");
  });

  it("玩法段的账目字面量:保底 +1 / 归零 / 星尘扣费与守卫都在 Web 的 doFusion 与 bumpFusionPity 里", () => {
    expect(play.includes("this.save.fusionPity += 1;")).toBe(true);
    expect(play.includes("if (this.save.fusionPity >= HIDDEN_PITY_N) {")).toBe(true);
    expect(play.includes("this.save.fusionPity = 0;")).toBe(true);
    expect((play.match(/if \(this\.save\.stardust < cost\) return;/g) ?? []).length).toBe(2);
    expect((play.match(/this\.save\.stardust -= cost;/g) ?? []).length).toBe(2);
    expect(play.includes("this.save.fusionPity = HIDDEN_PITY_N - 1;")).toBe(false); // 开发键在 onKey 段,不在玩法段
  });
});

/* ==================== 13. phase4 表的 fu* 段 ==================== */

describe("phase4 表的 fu* 段(默认值逐项对标 Web drawFusion / drawHiddenChoice / drawTriplePanel)", () => {
  const D = phase4Defaults();
  const FU_KEYS = Object.keys(D).filter((k) => k.startsWith("fu"));
  const web = webSource();
  const draw = web.slice(web.indexOf("private fusionLayout()"), web.indexOf("/* ---------- 体力不足面板"));

  it("本屏一共 39 键,且都以 fu 开头", () => {
    expect(FU_KEYS).toHaveLength(39);
    expect(FU_KEYS.every((k) => /^fu[A-Z]/.test(k))).toBe(true);
  });

  it("覆盖底、标题、星尘读数与返回钮与 Web 一致(标题色就是那笔直接 fillText 的实参)", () => {
    expect(D.fuDim).toBe("rgba(8,10,16,0.86)");
    expect(D.fuTitle).toBe("#4DFFC8");
    expect(D.fuStardustText).toBe("#C8B6FF");
    expect(D.fuStardustGlyph).toBe("❋");
    expect([D.fuBackBg, D.fuBackStroke, D.fuBackText]).toEqual(["#2A3D55", "rgba(255,255,255,0.3)", "#CFCFCF"]);
    expect(draw.includes('this.assets.draw(g, "banner_mid_blue", pad - 6, 8, 190, 40)')).toBe(true);
    expect(draw.includes('g.fillStyle = "#4dffc8"')).toBe(true);
    expect(draw.includes('"icon_stardust", "❋"')).toBe(true);
    expect(draw.includes('iconText(g, this.assets, "icon_stardust", "❋", `星尘 ${this.save.stardust}`, pad, 62, "#c8b6ff", 14)')).toBe(true);
  });

  it("装备行:底板四档 + 未选描边 + 选中三档文字 + 禁用与摘要", () => {
    expect([D.fuRowSelAFill, D.fuRowSelBFill, D.fuRowSelCFill, D.fuRowFill]).toEqual(["rgba(90,200,250,0.16)", "rgba(192,108,255,0.16)", "rgba(255,215,106,0.16)", "rgba(255,255,255,0.04)"]);
    expect(D.fuRowStroke).toBe("rgba(255,255,255,0.12)");
    expect([D.fuRowSelAText, D.fuRowSelBText, D.fuRowSelCText]).toEqual(["#5AC8FA", "#C06CFF", "#FFD76A"]);
    expect([D.fuRowNameDisabled, D.fuRowSub]).toEqual(["#5A6A80", "#CFCFCF"]);
    expect(draw.includes('sel === "A" ? "rgba(90,200,250,0.16)" : sel === "B" ? "rgba(192,108,255,0.16)" : sel === "C" ? "rgba(255,215,106,0.16)" : "rgba(255,255,255,0.04)"')).toBe(true);
    expect(draw.includes('sel === "A" ? "#5ac8fa" : sel === "B" ? "#c06cff" : sel === "C" ? "#ffd76a" : disabled ? "#5a6a80" : q.color')).toBe(true);
  });

  it("读数 / 说明 / 提示三件与融合钮两档三件(禁档描边是 0.2 那一档)", () => {
    expect([D.fuReadout, D.fuNote, D.fuHint, D.fuEmpty]).toEqual(["#E8E8E8", "#8F9BB3", "#8F9BB3", "#8F9BB3"]);
    expect([D.fuFuseBg, D.fuFuseStroke, D.fuFuseText]).toEqual(["#1D3D2E", "#4DFFC8", "#4DFFC8"]);
    expect([D.fuFuseDisabledBg, D.fuFuseDisabledStroke, D.fuFuseTextDisabled]).toEqual(["#1A1F2A", "rgba(255,255,255,0.2)", "#5A6A80"]);
    expect(draw.includes('canFuse ? "#1d3d2e" : "#1a1f2a"')).toBe(true);
    expect(draw.includes('canFuse ? "#4dffc8" : "rgba(255,255,255,0.2)"')).toBe(true);
    expect(draw.includes('canFuse ? "#4dffc8" : "#5a6a80"')).toBe(true);
  });

  it("模式钮两档三件与弹层六件(卡片描边与名字走 hiddenAffixDef 的动态色,不进表)", () => {
    expect([D.fuModeSelFill, D.fuModeSelStroke, D.fuModeSelText]).toEqual(["rgba(255,215,106,0.22)", "#FFD76A", "#FFD76A"]);
    expect([D.fuModeFill, D.fuModeStroke, D.fuModeText]).toEqual(["#2A3D55", "rgba(255,255,255,0.2)", "#CFCFCF"]);
    expect([D.fuHiddenDim, D.fuHiddenTitle, D.fuHiddenSub]).toEqual(["rgba(4,6,10,0.92)", "#FFD76A", "#CFCFCF"]);
    expect([D.fuHiddenCardFill, D.fuHiddenCardDesc, D.fuHiddenCardHint]).toEqual(["rgba(255,215,106,0.08)", "#CFCFCF", "#8F9BB3"]);
    expect(draw.includes('sel ? "rgba(255,215,106,0.22)" : "#2a3d55"')).toBe(true);
    expect(draw.includes('g.fillStyle = "rgba(4,6,10,0.92)"')).toBe(true);
    expect(draw.includes('g.fillStyle = "rgba(255,215,106,0.08)"')).toBe(true);
    expect(draw.includes("g.strokeStyle = hd.color;")).toBe(true);
  });

  it("表里只有色与字形,不含几何数:38 个色键全以 # 或 rgba 起头(替代字形键除外)", () => {
    const glyphs = ["fuStardustGlyph"];
    expect(FU_KEYS.filter((k) => glyphs.includes(k))).toHaveLength(1);
    for (const k of FU_KEYS) {
      if (glyphs.includes(k)) continue;
      expect(/^#[0-9A-Fa-f]{6}$|^rgba?\(/.test(D[k]), k).toBe(true);
    }
  });
});

/* ==================== 14. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = ["../cocos/assets/scripts/game/ui/fusionLayout.ts", "../cocos/assets/scripts/fusion/FusionModel.ts"];

describe("纯布局与宿主模型 cc-free", () => {
  for (const rel of PURE_FILES) {
    const src = fileSource(rel);
    it(`${rel.split("/").pop()}:无 cc / 无 Canvas2D / 无 DOM 全局 / 无 @game 别名`, () => {
      expect(CC_IMPORT.test(src), "不得 import cc").toBe(false);
      expect(CTX_TYPE.test(src), "不得用 CanvasRenderingContext2D").toBe(false);
      expect(DOM_GLOBAL.test(src), "不得用 DOM/宿主全局").toBe(false);
      expect(ABSOLUTE_GAME.test(src), "内部不得用 @game/ 别名").toBe(false);
    });
  }

  it("共享层不读存档也不查玩法表:件数与形态位是入参,解锁门一概不查", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/game/ui/fusionLayout.ts"));
    for (const bad of ["save.", "stardust -=", "stardust >=", "fusionPity", "ownedTalents", "tripleUnlocked", "performFusion", "qualityDef", "hiddenAffix", "persistSave", "Equipment"]) {
      expect(src.includes(bad), bad).toBe(false);
    }
    // 行数直接吃入参序列的长度,不复制条数上限
    expect(src.includes("eqIds.length")).toBe(true);
  });

  it("模型不写存档、不碰广告通道、不碰路由、不自己取时间,随机源是形参", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/fusion/FusionModel.ts"));
    for (const bad of ["persist(", "persistSave", "writeSave", "watchAd", "showRewardedAd", "localStorage", "router.show", "Date.now(", "save.stardust -=", "save.fusionPity ="]) {
      expect(src.includes(bad), bad).toBe(false);
    }
    expect(src.includes("roll: () => number = Math.random")).toBe(true);
  });

  it("模型不复制判据:成本、解锁门、融合执行、继承、保底候选、落词缀、品质表全部转调既有函数", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/fusion/FusionModel.ts"));
    for (const good of ["fusionCost(", "tripleFusionCost(", "tripleUnlocked(", "performFusion(", "performTripleFusion(", "inheritSource(", "rollHiddenCandidates(", "applyHiddenAffix(", "hiddenAffixDef(", "qualityDef(", "HIDDEN_PITY_N"]) {
      expect(src.includes(good), good).toBe(true);
    }
    // 成本表的数字一个都没抄进模型(15/30/60 只住在 quality.ts 的表里)
    expect(src.includes("FUSION_COST_TABLE")).toBe(false);
    expect(/[^.\w]15[^.\w]/.test(src.replace(/\/\*[\s\S]*?\*\//g, ""))).toBe(false);
  });
});

/* ==================== 15. 视图层纪律 ==================== */

describe("FusionView 的纪律:几何全来自共享层、文本只走 placeLine、三棵底部子树整体切换", () => {
  const src = fileSource("../cocos/assets/scripts/fusion/FusionView.ts");
  const code = codeOf(src);

  it("视图不产几何:不自算 panelY / 行步进 / 卡片位,一律读 layout", () => {
    for (const bad of ["panelY =", "h - ui.pad", "(w - pad", "spreadRows(", "rowTextY(", "w / 2 - 110"]) expect(code.includes(bad), bad).toBe(false);
    for (const good of ["L.bottom.fuseBtn", "L.rows", "L.bottom.modeBtns", "L.hiddenCards", "L.backBtn", "L.headerBanner", "L.bottom.hint"]) expect(code.includes(good), good).toBe(true);
  });

  it("文本只有 placeLine 一个入口,两个贴图键都收在常量里", () => {
    expect(code.includes("placeLine(")).toBe(true);
    expect(code.includes("new Label(")).toBe(false);
    for (const k of ["banner_mid_blue", "icon_stardust"]) {
      expect(src.includes(`"${k}"`), k).toBe(true);
    }
    // 面板键在共享层几何里,视图经 L.panelKey 取
    expect(code.includes("L.panelKey")).toBe(true);
  });

  it("底部三形态与行区用节点 active 整棵切换(不用透明度也不用位移藏),弹层是叠加支", () => {
    expect(code.includes("this.rowsNode.active = !empty;")).toBe(true);
    expect(code.includes('this.hintNode.active = c.bottomKind === "hint";')).toBe(true);
    expect(code.includes('this.pairNode.active = c.bottomKind === "pair";')).toBe(true);
    expect(code.includes('this.tripleNode.active = c.bottomKind === "triple";')).toBe(true);
    expect(code.includes("this.hiddenNode.active = !!c.hidden;")).toBe(true);
    expect(code.includes("UIOpacity")).toBe(false);
  });

  it("描边宽度取共享层的三档常量(不在视图里写 2)", () => {
    expect(code.includes("FU_FUSE_STROKE_W")).toBe(true);
    expect(code.includes("FU_CARD_STROKE_W")).toBe(true);
    expect(code.includes("FU_ROW_SEL_STROKE_W")).toBe(true);
    expect(code.includes(", 2)")).toBe(false);
  });

  it("命中判定转调模型,视图不自己比矩形", () => {
    expect(code.includes("hitFusion(")).toBe(true);
    expect(code.includes("x >= ")).toBe(false);
  });

  it("Capture 建在最后,行区 / 三棵形态子树 / 弹层都在它之前(节点次序决定热区不被盖住)", () => {
    expect(code.indexOf("this.rowsNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.hintNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.pairNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.tripleNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.hiddenNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
  });

  it("行槽按需增长、卡片槽数与三选一同数(池长不会与玩法脱钩)", () => {
    expect(code.includes("ensureRowSlots(")).toBe(true);
    expect(code.includes("const CARD_SLOTS = 3;")).toBe(true);
    expect(code.includes("i < CARD_SLOTS")).toBe(true);
    expect(code.includes("i < CARD_DESC_LINES")).toBe(true);
  });
});

/* ==================== 16. 宿主接线:五件套 + 路由注册 + 占位表下线 ==================== */

describe("GameShell 的词缀融合屏接线", () => {
  const src = fileSource("../cocos/assets/scripts/GameShell.ts");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildFusionScreen", "fusionSave", "fusionEquipment", "openFusion", "syncFusion", "onFusionAction", "commitFusionClaim"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildFusionScreen();")).toBe(true);
    expect(src.indexOf("this.buildFusionScreen();")).toBeGreaterThan(src.indexOf("this.buildCommissionScreen();"));
    expect(src.includes("fusion: () => this.syncFusion(),")).toBe(true);
    expect(src.includes('"gacha", "prestige", "commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("路由实际注册十六屏(SCREEN_KEYS 仍是 16 态全量)", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(keysBlock[1].includes('"fusion"')).toBe(true);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(13);
  });

  it("占位轻提示整表下线:PENDING_SCREEN 与它的文案在 GameShell 里都不存在了", () => {
    expect(src.includes("PENDING_SCREEN")).toBe(false);
    expect(src.includes("融合尚未开放")).toBe(false);
    expect(src.includes("尚未开放")).toBe(false);
    // 商店工具钮的 fusion 分支换成真实开屏
    const shop = src.slice(src.indexOf("private onShopAction"), src.indexOf("private restartRun"));
    expect(shop.includes('} else if (a.id === "fusion") {')).toBe(true);
    expect(shop.includes("this.openFusion();")).toBe(true);
    expect(shop.includes("this.toast(PENDING")).toBe(false);
  });

  it("晚到贴图流到位后本屏也换引用并在当前屏时补排一次", () => {
    expect(src.includes("this.fusionView?.setFrames(this.frames);")).toBe(true);
    expect(src.includes('if (this.router.current === "fusion") this.fusionView?.sync();')).toBe(true);
  });

  it("几何与内容都经宿主投影现算(视图不读存档),形态位在这一层折出", () => {
    const seg = src.slice(src.indexOf("private buildFusionScreen"), src.indexOf("private fusionSave"));
    expect(seg.includes("fusionScreenLayout(DESIGN_W, logicalH(), this.fusionEquipment().map((e) => e.id)")).toBe(true);
    expect(seg.includes("hidden: this.fusPending !== null,")).toBe(true);
    expect(seg.includes("triple: fusionTripleArmed(this.fusSel, this.fusionSave().ownedTalentCount),")).toBe(true);
    expect(seg.includes("buildFusionContent(this.fusionSave(), this.fusionEquipment(), this.fusSel, this.fusMode, this.fusPending, L)")).toBe(true);
    const slice = src.slice(src.indexOf("private fusionSave"), src.indexOf("private fusionEquipment"));
    for (const f of ["stardust: s.stardust", "fusionPity: s.fusionPity", "ownedTalentCount: s.ownedTalents.length"]) {
      expect(slice.includes(f), f).toBe(true);
    }
    // 装备列表读的是战斗层的局内态(与商店屏 ShopWorld 同一条 getter 口径)
    const eqSeg = src.slice(src.indexOf("private fusionEquipment"), src.indexOf("private openFusion"));
    expect(eqSeg.includes("this.sim.player.equipment")).toBe(true);
  });

  it("三份瞬时态挂在宿主上且不入档;入档的只有 fusionPity(读档兜底已在 SaveModel)", () => {
    expect(src.includes("private fusionView: FusionView | null = null;")).toBe(true);
    expect(src.includes("private fusSel: FusionSelection = { ...FUSION_DEFAULT_SELECTION };")).toBe(true);
    expect(src.includes("private fusPending: FusionPendingHidden | null = null;")).toBe(true);
    expect(src.includes("private fusMode: TripleMode = FUSION_DEFAULT_TRIPLE_MODE;")).toBe(true);
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    expect(saveModel.includes("fusionPity: Number(parsed?.fusionPity) || 0,")).toBe(true);
    for (const bad of ["fusSel", "fusMode", "fusPending", "tripleMode", "pendingHidden"]) {
      expect(saveModel.includes(bad), bad).toBe(false);
    }
  });

  it("进屏守卫与两份瞬时态的重置节奏(Web openFusion 同序:清选中与暂存,tripleMode 不清)", () => {
    const seg = src.slice(src.indexOf("private openFusion"), src.indexOf("private syncFusion"));
    expect(seg.includes("if (!sim || sim.player.equipment.length < 2) return;")).toBe(true);
    expect(seg.includes("this.fusSel = { ...FUSION_DEFAULT_SELECTION };")).toBe(true);
    expect(seg.includes("this.fusPending = null;")).toBe(true);
    expect(seg.includes("fusMode")).toBe(false);
    expect(seg.includes('this.router.show("fusion")')).toBe(true);
  });

  it("动作处理里不直接改存档字段:写入全集中在 commit 函数里,返回钮回商店", () => {
    const act = codeOf(src.slice(src.indexOf("private onFusionAction"), src.indexOf("private commitFusionClaim")));
    for (const bad of ["save.stardust", "save.fusionPity", "this.save()", "persist(", "recordEquipment", ".splice(", ".push("]) {
      expect(act.includes(bad), bad).toBe(false);
    }
    expect(act.includes("fusionClaim(this.fusionSave(), this.fusionEquipment(), this.fusSel, this.fusMode, this.fusPending, a)")).toBe(true);
    expect(act.includes("this.commitFusionClaim(claim)")).toBe(true);
    expect(act.includes('this.router.show("shop")')).toBe(true);
    const commit = codeOf(src.slice(src.indexOf("private commitFusionClaim"), src.indexOf("/* ================= 赛季结算屏")));
    expect(commit.includes("save.stardust -= claim.stardustCost;")).toBe(true);
    expect(commit.includes("save.fusionPity = claim.fusionPityTo;")).toBe(true);
    expect(commit.includes("eq.splice(i, 1);")).toBe(true);
    expect(commit.includes("eq.push(claim.result);")).toBe(true);
    expect(commit.includes("this.sim?.world.recordEquipment(claim.result);")).toBe(true);
    expect(commit.includes("this.sim?.persist();")).toBe(true);
    expect(commit.includes("this.fusPending = claim.pending;")).toBe(true);
    expect(commit.includes("this.fusPending = null;")).toBe(true);
    expect(commit.includes("this.refreshMenu();")).toBe(true);
    // 落盘只跟着未触达档与三选一档走:触达档(pending)那一段没有 persist
    const pendingBranch = commit.slice(commit.indexOf("if (claim.pending) {"), commit.indexOf("} else if (claim.result) {"));
    expect(pendingBranch.includes("this.fusPending = claim.pending;")).toBe(true);
    expect(pendingBranch.includes("persist()")).toBe(false);
  });

  it("本屏不走广告入口,action 里也没有屏级 adPending 闸门(闸门只有 watchAd 首行那一道)", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 词缀融合屏"), src.indexOf("/* ================= 赛季结算屏")));
    expect(seg.includes("watchAd(")).toBe(false);
    expect(seg.includes("showRewardedAd")).toBe(false);
    expect(seg.includes("adPending")).toBe(false);
    expect(src.split("if (this.adPending) return;").length - 1).toBe(1);
  });
});

/* ==================== 17. 与 Web 的对照:反直觉口径 ==================== */

describe("Web 基准的几条反直觉口径已原样带上", () => {
  const web = webSource();
  const play = web.slice(web.indexOf("private openFusion("), web.indexOf("private onKey("));
  const draw = web.slice(web.indexOf("private fusionLayout()"), web.indexOf("/* ---------- 体力不足面板"));
  const click = web.slice(web.indexOf("private onFusionClick("), web.indexOf("/* ---------- 体力不足面板"));

  it("openFusion 首行拦不足 2 件、清三份选中与暂存,但 tripleMode 不在重置名单里", () => {
    expect(play.includes("if (this.player.equipment.length < 2) return;")).toBe(true);
    const open = play.slice(play.indexOf("private openFusion("), play.indexOf("private onFusionEquipmentTap("));
    expect(open.includes("this.fusA = null;")).toBe(true);
    expect(open.includes("this.fusB = null;")).toBe(true);
    expect(open.includes("this.fusC = null;")).toBe(true);
    expect(open.includes("this.pendingHidden = null;")).toBe(true);
    expect(open.includes("tripleMode")).toBe(false);
    expect(open.includes('this.state = "fusion";')).toBe(true);
  });

  it("bumpFusionPity 先 +1 再判归零;doFusion 里扣费在推进保底之前(两条路径同序)", () => {
    const bump = play.slice(play.indexOf("private bumpFusionPity("), play.indexOf("private doFusion("));
    expect(bump.includes("this.save.fusionPity += 1;")).toBe(true);
    expect(bump.indexOf("this.save.fusionPity += 1;")).toBeLessThan(bump.indexOf(">= HIDDEN_PITY_N"));
    const fuse = play.slice(play.indexOf("private doFusion("), play.indexOf("private afterFusionRoll("));
    expect(fuse.indexOf("this.save.stardust -= cost;")).toBeLessThan(fuse.indexOf("this.bumpFusionPity()"));
    expect(fuse.includes("const triple = this.fusC !== null && tripleUnlocked(this.save.ownedTalents.length);")).toBe(true);
    expect(fuse.includes("if (mats.length < 3 || mats.some((e) => e.hiddenAffix)) return;")).toBe(true);
    expect(fuse.includes("if (!a || !b || a.hiddenAffix || b.hiddenAffix) return;")).toBe(true);
  });

  it("afterFusionRoll:素材先移除;触达档只暂存三选一(不 push、不落盘、不清选中),未触达档四件事全做", () => {
    const after = play.slice(play.indexOf("private afterFusionRoll("), play.indexOf("private pickHiddenAffix("));
    expect(after.includes("this.player.equipment = this.player.equipment.filter((e) => !mats.some((m) => m.id === e.id));")).toBe(true);
    expect(after.indexOf("filter((e) => !mats.some")).toBeLessThan(after.indexOf("if (hitsPity) {"));
    const pityBranch = after.slice(after.indexOf("if (hitsPity) {"), after.indexOf("this.player.equipment.push(outcome.result);"));
    expect(pityBranch.includes("this.pendingHidden = { base: outcome.result, candidates: rollHiddenCandidates() };")).toBe(true);
    expect(pityBranch.includes("return;")).toBe(true);
    expect(pityBranch.includes("persistSave")).toBe(false);
    expect(after.includes("this.recordEquipment(outcome.result);")).toBe(true);
    expect(after.includes("persistSave(this.save);")).toBe(true);
  });

  it("pickHiddenAffix:落词缀 → 入场 → 记图鉴 → 落盘 → 清选中(暂存落空首行 return)", () => {
    const pick = play.slice(play.indexOf("private pickHiddenAffix("), play.indexOf("private onKey("));
    expect(pick.includes("if (!this.pendingHidden) return;")).toBe(true);
    expect(pick.includes("const result = applyHiddenAffix(this.pendingHidden.base, hidden);")).toBe(true);
    expect(pick.indexOf("this.player.equipment.push(result);")).toBeLessThan(pick.indexOf("this.recordEquipment(result);"));
    expect(pick.indexOf("this.recordEquipment(result);")).toBeLessThan(pick.indexOf("persistSave(this.save);"));
    // 融合段里 recordEquipment 恰好两处(未触达档与三选一档各一)
    expect((play.match(/this\.recordEquipment\(/g) ?? []).length).toBe(2);
  });

  it("onFusionClick 的判定顺序:弹层卡片(排他 return)→ 返回钮 → 装备行 → 三重态(模式钮 → 融合钮 → return)→ 融合钮", () => {
    expect(click.indexOf("if (this.pendingHidden) {")).toBeLessThan(click.indexOf("// 返回(回到进入前的界面"));
    const hiddenBranch = click.slice(click.indexOf("if (this.pendingHidden) {"), click.indexOf("// 返回(回到进入前的界面"));
    expect(hiddenBranch.trim().endsWith("return;\n    }")).toBe(true);
    expect(hiddenBranch.includes("this.pickHiddenAffix(this.pendingHidden.candidates[c.idx]);")).toBe(true);
    expect(click.indexOf("// 装备行")).toBeLessThan(click.indexOf("if (this.fusC !== null && tripleUnlocked(this.save.ownedTalents.length)) {"));
    const tripleBranch = click.slice(click.indexOf("if (this.fusC !== null && tripleUnlocked"), click.indexOf("// 融合\n"));
    expect(tripleBranch.includes("this.tripleMode = m.mode;")).toBe(true);
    expect(tripleBranch.trim().endsWith("return;\n    }")).toBe(true);
    expect(click.includes("this.doFusion();")).toBe(true);
  });

  it("返回语义:overlayFrom 两态里活着的入口只有商店(openFusion(\"shop\") 全文件仅一处调用)", () => {
    expect(web.includes('private openFusion(from: "playing" | "shop" = "playing"): void {')).toBe(true);
    expect((web.match(/this\.openFusion\(/g) ?? []).length).toBe(1);
    expect(web.includes('if (this.player.equipment.length >= 2) this.openFusion("shop");')).toBe(true);
    expect(click.includes('this.state = this.overlayFrom === "playing" ? "playing" : this.overlayFrom;')).toBe(true);
    // 战斗内入口已移除(点击分发处的注释就是这条事实)
    expect(web.includes("// 战场内无操作按钮(融合/委托已移至商店与主菜单)")).toBe(true);
  });

  it("Esc 在弹层打开时被禁(三选一必须选定);开发键把保底摆到 N − 1 造触发条件", () => {
    expect(web.includes('if (e.key === "Escape" && !(this.state === "fusion" && this.pendingHidden)) {')).toBe(true);
    expect(web.includes("this.save.fusionPity = HIDDEN_PITY_N - 1; // 下次融合触发保底三选一")).toBe(true);
  });

  it("绘制侧的对齐口径:标题与行是左对齐、提示与弹层两行是居中、空态提示停在 left(Web 原样的怪癖)", () => {
    expect(draw.includes('g.fillText("装备融合", pad, 36);')).toBe(true);
    expect(draw.includes('g.fillText("至少需要 2 件装备才能融合", w / 2, h / 2);')).toBe(true);
    // 空态那一句之前最后一次设对齐是 left(返回钮那段收尾)
    const beforeEmpty = draw.slice(0, draw.indexOf('g.fillText("至少需要 2 件装备才能融合"'));
    expect(beforeEmpty.lastIndexOf('g.textAlign = "left";')).toBeGreaterThan(beforeEmpty.lastIndexOf('g.textAlign = "center";'));
    expect(draw.includes('g.fillText(hint, w / 2, L.panelY + 20);')).toBe(true);
    expect(draw.includes('g.fillText("隐藏词缀保底!", w / 2, h / 2 - 110);')).toBe(true);
    expect(draw.includes("g.fillText(`选择 1 / 3(每 ${HIDDEN_PITY_N} 次融合必出)`, w / 2, h / 2 - 78);")).toBe(true);
  });

  it("两条读数行是两个不同分支的画点:双选态 panelY + 20、三重态 panelY + 54(不是同一条改文案)", () => {
    expect(draw.includes("g.fillText(`星尘成本 ${cost} · 隐藏词缀保底 ${this.save.fusionPity}/${HIDDEN_PITY_N}`, pad, L.panelY + 20);")).toBe(true);
    expect(draw.includes("g.fillText(`三重融合 · 星尘 ${cost} · 隐藏词缀保底 ${this.save.fusionPity}/${HIDDEN_PITY_N}`, ui.pad, L.panelY + 54);")).toBe(true);
    // 双选那条在 drawFusion 里、三重那条在 drawTriplePanel 里
    const main = draw.slice(draw.indexOf("private drawFusion("), draw.indexOf("private drawHiddenChoice("));
    const triple = draw.slice(draw.indexOf("private drawTriplePanel("), draw.indexOf("private onFusionClick("));
    expect(main.includes("星尘成本 ${cost}")).toBe(true);
    expect(triple.includes("三重融合 · 星尘 ${cost}")).toBe(true);
  });

  it("成品入的是局内装备列表、图鉴记的是词缀名:成品不进 save.ownedGear(Web 融合段没有 ownedGear)", () => {
    expect(play.includes("this.player.equipment.push(outcome.result);")).toBe(true);
    expect(play.includes("this.player.equipment.push(result);")).toBe(true);
    expect(play.includes("ownedGear")).toBe(false);
    // recordEquipment 的账本(触发器/效果/修饰器三个名字列表)在 Web 的私有实现里
    const rec = web.slice(web.indexOf("private recordEquipment(eq: Equipment): void {"), web.indexOf("private recordAffix("));
    expect(rec.includes("for (const t of eq.triggers) this.recordAffix(\"triggers\", t.def.name);")).toBe(true);
  });
});
