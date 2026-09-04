/**
 * Phase 4 第六屏闸门:转生与天赋屏(三系页签 + 买天赋入档 + 两个条件块压缩行区 + 开局配置瞬时态)。
 *
 * 延续 cocos-phase4-leaderboard / -daily / -pass / -gearup / -gacha 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `prestige/PrestigeModel.ts` 经相对路径 import 的共享层
 *     (`game/data/talents` 的三张路线表与 `isTierUnlocked` / `routeCost`、`game/data/affixes` 的
 *     `TRIGGERS` / `EFFECTS` / `MODIFIERS`、`game/ui/prestigeLayout`),与 Web 侧经 `@game` 别名
 *     import 的是同一个模块实例(函数引用 `toBe` 相同),于是天赋定价、层级门与图鉴分母
 *     不可能出现"两份抄本";
 *  2. **断言按门控变量分档**:行数 = 当前系的条数、两个条件块由 `ownedTalents` 是否含
 *     `blueprint` / `targeted_search` 决定、`affordable` 由 `availablePoints` 与
 *     `isTierUnlocked` 与 `owned` 三者合取 —— 全部由存档与共享层表推出,不钉死随表变动的数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `PrestigeModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 本屏的重点是**六格溢出矩阵**:`h ∈ {996, 1246} × 条件块 ∈ {无, 只有其一, 两者都有}` 六格
 * 各自钉死 `rowH` / `gap` / 末行底边 `rowsEnd` 的精确值、与预算底缘的余量,以及"该格下最多能塞
 * 几行不越界"。这些数字按 `game/ui/theme.ts:spreadRows` 的真实实现算出并由本文件实测(不是推算):
 * 每格都同时用 `spreadRows` 直算一遍与布局函数对照,所以矩阵不是从布局函数里抄回来的同义反复。
 * 三系恒 10 条,六格实测都不越界;最紧的一格是 996 × 两块都在(余量 1px),矩阵也锁住这条。
 *
 * 另锁本屏照抄的 Web 口径:**没有返回路径**(五段热区里没有 backBtn,唯一离开出口是重开一局)、
 * 「开始新轮回」不结算死亡故不产写入意图、`affordable` 三个条件缺一不可、买入守卫用
 * `routeOf(id)` 所属系而非当前页签、页签态与开局配置都是不入档的瞬时态、图鉴四个分母全部取表长、
 * 命中的五段顺序与热区外无兜底、十八条文案逐字。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { EFFECTS, MODIFIERS, TRIGGERS, effectDef, triggerDef, type EffectType, type TriggerType } from "@game/data/affixes";
import { ENEMY_DEFS } from "@game/data/enemies";
import { SEASON_MONSTERS } from "@game/data/seasonMonsters";
import { ALL_TALENTS, BUILDER_ROUTE, CONQUEROR_ROUTE, EFFICIENT_ROUTE, isTierUnlocked, routeCost, routeOf, talentOf, type TalentId } from "@game/data/talents";
import { fs as FS, rowTextY, spreadRows, ui as PAD_ } from "@game/ui/theme";
import * as sharedTalents from "@game/data/talents";
import {
  PT_AVAIL_DX,
  PT_BANNER_H,
  PT_BANNER_TEXT_DY,
  PT_BANNER_W,
  PT_BLOCK_DY,
  PT_BLOCK_H,
  PT_BTN_DY,
  PT_BTN_H,
  PT_COLL_BASE_Y,
  PT_DESC_DX,
  PT_DESC_MAX_DX,
  PT_ECHO_BASE_Y,
  PT_EFFECT_GAP,
  PT_EFFECT_N,
  PT_EFFECT_TYPES,
  PT_L1_DY,
  PT_L2_DY,
  PT_LABEL_DY,
  PT_LIST_Y0,
  PT_MARK_GAP,
  PT_MARK_INSET,
  PT_MARK_SIZE,
  PT_MARK_DY,
  PT_NAME_DX,
  PT_NAME_MAX_W,
  PT_OWNED_TEXT_W,
  PT_PANEL_NINE,
  PT_POSE_H,
  PT_POSE_W,
  PT_POSE_X,
  PT_POSE_Y,
  PT_RIGHT_DX,
  PT_ROW_MAX_H,
  PT_ROW_MIN_H,
  PT_ROUTE_BASE_Y,
  PT_ROWS_BOTTOM_DY,
  PT_START_H,
  PT_START_HALF_W,
  PT_START_STROKE_W,
  PT_START_UP,
  PT_START_W,
  PT_TAB_H,
  PT_TAB_N,
  PT_TAB_Y,
  PT_TITLE_BASE_Y,
  PT_TRIGGER_GAP,
  PT_TRIGGER_N,
  PT_TRIGGER_TYPES,
  prestigeBlockTop,
  prestigeLayout,
  prestigeScreenLayout,
  prestigeStartBtn,
  type PrestigeLayout,
  type PtRect,
  type PtRouteKey,
  type PtTextLine,
} from "@game/ui/prestigeLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import {
  buildPrestigeContent,
  hitPrestige,
  prestigeBlocks,
  prestigeClaim,
  prestigeCollectionTotals,
  prestigeOwns,
  prestigeRouteIds,
  prestigeRouteName,
  prestigeRouteNodes,
  type PrestigeAction,
  type PrestigeRunConfig,
  type PrestigeSaveView,
} from "../cocos-prototype/assets/scripts/prestige/PrestigeModel";
import * as cocosTalents from "../cocos-prototype/assets/scripts/game/data/talents";
import * as cocosPrestigeLayout from "../cocos-prototype/assets/scripts/game/ui/prestigeLayout";
import { availablePoints } from "../cocos-prototype/assets/scripts/core/SaveModel";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos-prototype/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = PAD_.pad;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos-prototype/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/* ==================== 夹具 ==================== */

const ROUTES: readonly PtRouteKey[] = ["builder", "efficient", "conqueror"];
const BLOCKS: readonly [boolean, boolean][] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

/** 一系路线的 id 序列(共享层布局的行键) */
const routeIds = (route: PtRouteKey): TalentId[] => (route === "efficient" ? EFFICIENT_ROUTE : route === "conqueror" ? CONQUEROR_ROUTE : BUILDER_ROUTE).map((n) => n.id);

/** 一个最小图鉴切片(本屏只读四个 length) */
function collection(n = 0, m = 0, k = 0, e = 0) {
  return { triggers: names(n), effects: names(m), modifiers: names(k), enemies: names(e) };
}

function names(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `名${i}`);
}

function save(over: Partial<PrestigeSaveView> = {}): PrestigeSaveView {
  return { points: 0, ownedTalents: [], collection: collection(), ...over };
}

/** 把 n 个字符串换成 PrestigeSaveView 的 collection(测试里逐个计数档要用) */
function coll(n: number): { triggers: string[]; effects: string[]; modifiers: string[]; enemies: string[] } {
  return collection(n, n, n, n);
}

const cfg = (over: PrestigeRunConfig = {}): PrestigeRunConfig => ({ ...over });

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 读 Web 基准源码的一段(逐行对照用) */
function webSource(): string {
  return readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
}

/** 从 PHASE4_DEFAULTS 里抠出一张 `键 → 字面量` 的表(ViewTable 那侧 import 了 cc,node 不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = readFileSync(new URL("../cocos-prototype/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(\w+):\s*"([^"]*)",\s*$/gm)) out[m[1]] = m[2];
  return out;
}

const center = (r: PtRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 末行底边(派单要求的度量):rowsTop + (n−1)×(rowH+gap) + rowH */
function lastRowBottom(L: PrestigeLayout): number {
  return L.rowsTop + (L.rows.length - 1) * L.rowStep + L.rowH;
}

/** spreadRows 直算一遍(矩阵里的数不是从布局函数里抄回来的) */
const direct = (n: number, rowsTop: number, rowsBottom: number) => spreadRows(n, rowsTop, rowsBottom, PT_ROW_MIN_H, PT_ROW_MAX_H);

/** 该格预算内最多能塞几行不越界(n 从 1 起递增;rowH / gap 随 n 现算,与真实调用同式) */
function maxFitRows(rowsTop: number, rowsBottom: number): number {
  let best = 0;
  for (let n = 1; n <= 200; n++) {
    const { rowH, gap } = direct(n, rowsTop, rowsBottom);
    if (rowsTop + (n - 1) * (rowH + gap) + rowH <= rowsBottom) best = n;
  }
  return best;
}

/** 首个越出预算底缘的行数 */
function firstOverflowN(rowsTop: number, rowsBottom: number): number {
  for (let n = 1; n <= 200; n++) {
    const { rowH, gap } = direct(n, rowsTop, rowsBottom);
    if (rowsTop + (n - 1) * (rowH + gap) + rowH > rowsBottom) return n;
  }
  return -1;
}

/* ==================== 0. 端间同一实现与派单要求核实的表事实 ==================== */

describe("端间共读同一份共享层与本屏要用到的表事实", () => {
  it("talents 与 prestigeLayout 两个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosTalents.talentOf).toBe(sharedTalents.talentOf);
    expect(cocosTalents.isTierUnlocked).toBe(sharedTalents.isTierUnlocked);
    expect(cocosTalents.routeCost).toBe(sharedTalents.routeCost);
    expect(cocosTalents.routeOf).toBe(sharedTalents.routeOf);
    expect(cocosPrestigeLayout.prestigeLayout).toBe(prestigeLayout);
    expect(cocosPrestigeLayout.prestigeScreenLayout).toBe(prestigeScreenLayout);
  });

  it("天赋表总条数 30、三系各 10 条(spreadRows 的行数预算就是这个数)", () => {
    expect(ALL_TALENTS.length).toBe(30);
    expect(BUILDER_ROUTE.length).toBe(10);
    expect(EFFICIENT_ROUTE.length).toBe(10);
    expect(CONQUEROR_ROUTE.length).toBe(10);
    for (const r of ROUTES) expect(prestigeRouteIds(r)).toHaveLength(10);
    expect(new Set(ALL_TALENTS.map((n) => n.id)).size).toBe(30);
  });

  it("两枚条件天赋都在构筑师系:定向搜索 3 层、完美蓝图 5 层", () => {
    expect(talentOf("targeted_search").tier).toBe(3);
    expect(talentOf("blueprint").tier).toBe(5);
    expect(routeOf("targeted_search")).toBe(BUILDER_ROUTE);
    expect(routeOf("blueprint")).toBe(BUILDER_ROUTE);
    expect(prestigeRouteIds("efficient")).not.toContain("blueprint" as TalentId);
    expect(prestigeRouteIds("conqueror")).not.toContain("targeted_search" as TalentId);
  });

  it("两枚条件天赋可同时拥有(蓝图要 4 层前置,定向搜索只要 2 层前置,同一条链走得通)", () => {
    const chain: TalentId[] = ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"];
    for (const id of chain) {
      const node = talentOf(id);
      const prefix = chain.slice(0, chain.indexOf(id));
      expect(isTierUnlocked(prefix, node.tier, BUILDER_ROUTE), id).toBe(true);
    }
    const owned = prestigeBlocks(save({ points: 200, ownedTalents: chain }));
    expect(owned).toEqual({ hasBlueprint: true, hasTargetedSearch: true });
    // 这条链的总价就是"两块都在"那一档的最小门槛
    expect(chain.reduce((s, id) => s + talentOf(id).cost, 0)).toBe(45);
  });

  it("图鉴四个分母全部取表长:6 / 14 / 8 / 基线怪 + 赛季变体", () => {
    const t = prestigeCollectionTotalsLocal();
    expect(t.triggers).toBe(TRIGGERS.length);
    expect(t.effects).toBe(EFFECTS.length);
    expect(t.modifiers).toBe(MODIFIERS.length);
    expect(t.enemies).toBe(Object.keys(ENEMY_DEFS).length + SEASON_MONSTERS.length);
    expect(TRIGGERS.length).toBe(6);
    expect(EFFECTS.length).toBe(14);
    expect(MODIFIERS.length).toBe(8);
    expect(Object.keys(ENEMY_DEFS).length).toBe(14);
    expect(SEASON_MONSTERS.length).toBe(120);
    expect(t.enemies).toBe(134);
  });

  it("两个钮序列与页签三系的成员恰好覆盖两张表(不多不少不换序)", () => {
    expect(PT_TRIGGER_TYPES).toEqual(TRIGGERS.map((d) => d.type));
    expect(PT_EFFECT_TYPES).toHaveLength(8);
    expect(new Set(PT_EFFECT_TYPES).size).toBe(8);
    for (const t of PT_EFFECT_TYPES) expect(EFFECTS.some((e) => e.type === t)).toBe(true);
    for (const t of PT_TRIGGER_TYPES) expect(TRIGGERS.some((e) => e.type === t)).toBe(true);
  });
});

/** 与模型同一分母口径的本地取数(测试要独立于模型的返回值再走一遍表长) */
function prestigeCollectionTotalsLocal() {
  return {
    triggers: TRIGGERS.length,
    effects: EFFECTS.length,
    modifiers: MODIFIERS.length,
    enemies: Object.keys(ENEMY_DEFS).length + SEASON_MONSTERS.length,
  };
}

/* ==================== 1. 分区纵线逐条对标 Web prestigeLayout ==================== */

describe("底部锚定的分区纵线(与 Web 同一批裸加数)", () => {
  it("开始新轮回钮:x 居中减半宽、y = h − pad − 52、260×52", () => {
    for (const h of [H_STD, H_TALL]) {
      const r = prestigeStartBtn(W, h);
      expect(r.x).toBe(W / 2 - PT_START_HALF_W);
      expect(r.y).toBe(h - PAD - PT_START_UP);
      expect(r.w).toBe(PT_START_W);
      expect(r.h).toBe(PT_START_H);
      expect(r.x + r.w / 2).toBe(W / 2);
    }
    expect([PT_START_HALF_W, PT_START_W, PT_START_H, PT_START_UP]).toEqual([130, 260, 52, 52]);
  });

  it("blockTop 三档跳:−10 / −56 / −102(蓝图先让位、定向搜索后让位)", () => {
    for (const h of [H_STD, H_TALL]) {
      const y0 = prestigeStartBtn(W, h).y;
      expect(prestigeBlockTop(W, h, false, false)).toBe(y0 - PT_BLOCK_DY);
      expect(prestigeBlockTop(W, h, true, false)).toBe(y0 - PT_BLOCK_DY - PT_BLOCK_H);
      expect(prestigeBlockTop(W, h, false, true)).toBe(y0 - PT_BLOCK_DY - PT_BLOCK_H);
      expect(prestigeBlockTop(W, h, true, true)).toBe(y0 - PT_BLOCK_DY - 2 * PT_BLOCK_H);
      expect([PT_BLOCK_DY, PT_BLOCK_H]).toEqual([10, 46]);
    }
  });

  it("行区上界恒为 156,下界就是 blockTop − 8", () => {
    expect(PT_LIST_Y0).toBe(156);
    expect(PT_ROWS_BOTTOM_DY).toBe(8);
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        const L = prestigeLayout(W, h, routeIds("builder"), bp, ts);
        expect(L.rowsTop).toBe(PT_LIST_Y0);
        expect(L.blockTop).toBe(prestigeBlockTop(W, h, bp, ts));
        expect(L.rowsBottom).toBe(L.blockTop - PT_ROWS_BOTTOM_DY);
        expect(L.rowsTop).toBeLessThan(L.rowsBottom);
      }
    }
  });

  it("三系页签恒三枚、y = 120、h = 30、tabW = (w − pad×2)/3", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.tabs).toHaveLength(PT_TAB_N);
    expect([PT_TAB_Y, PT_TAB_H, PT_TAB_N]).toEqual([120, 30, 3]);
    const tabW = (W - PAD * 2) / 3;
    for (let i = 0; i < L.tabs.length; i++) {
      expect(L.tabs[i].rect).toEqual({ x: PAD + tabW * i, y: PT_TAB_Y, w: tabW, h: PT_TAB_H });
    }
    expect(L.tabs.map((t) => t.route)).toEqual(["builder", "efficient", "conqueror"]);
    expect(L.tabs.map((t) => t.label)).toEqual(["构筑师", "效率专家", "征服者"]);
    // 整条打底盒 = 三枚合并
    expect(L.tabsStrip).toEqual({ x: L.tabs[0].rect.x, y: PT_TAB_Y, w: tabW * 3, h: PT_TAB_H });
    expect(L.tabsStrip.w).toBe(W - PAD * 2);
  });

  it("页签行带压在图鉴行(基线 100)之下、行区(156)之上", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.collLine.baseY).toBeLessThan(PT_TAB_Y);
    expect(L.tabs[0].rect.y + L.tabs[0].rect.h).toBeLessThanOrEqual(L.rowsTop);
  });

  it("面板底是 panelPad 不传专属键的那一档:panel_dark_corners 九宫 (pad,pad,w−2pad,h−2pad)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.panelKey).toBe("panel_dark_corners");
    expect(L.panel).toEqual({ x: PAD, y: PAD, w: W - PAD * 2, h: H_STD - PAD * 2 });
    expect(PT_PANEL_NINE).toBe(32);
  });

  it("本屏没有返回钮:布局里不存在 backBtn 这一项", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true) as unknown as Record<string, unknown>;
    for (const k of ["backBtn", "backIcon", "backTextWithIcon", "backTextBare"]) expect(L[k], k).toBeUndefined();
    expect(prestigeScreenLayout(W, H_STD, routeIds("builder"), true, true).startBtn).toBeTruthy();
  });
});

/* ==================== 2. 六格溢出矩阵(派单要求:以实测为准) ==================== */

describe("六格矩阵:h ∈ {996,1246} × 条件块 ∈ {无,只有其一,两者都有}", () => {
  /** 每格的期望值:`[rowsBottom, rowH, gap, rowsEnd, 余量, 最多可塞行数]` */
  const CELL: Record<string, [number, number, number, number, number, number]> = {
    // 996 × 两块都不在
    "996|00": [912, 64, 12, 904, 8, 17],
    // 996 × 只有完美蓝图 / 只有定向搜索(两格同数,各减 46)
    "996|10": [866, 64, 7, 859, 7, 16],
    "996|01": [866, 64, 7, 859, 7, 16],
    // 996 × 两块都在(最紧的一格:余量只有 1px)
    "996|11": [820, 60, 7, 819, 1, 15],
    // 1246 × 三档,rowH 已顶到 64 上限、gap 顶到 20 上限,故 rowsEnd 恒 976
    "1246|00": [1162, 64, 20, 976, 186, 22],
    "1246|10": [1116, 64, 20, 976, 140, 21],
    "1246|01": [1116, 64, 20, 976, 140, 21],
    "1246|11": [1070, 64, 20, 976, 94, 20],
  };

  const key = (h: number, bp: boolean, ts: boolean) => `${h}|${bp ? 1 : 0}${ts ? 1 : 0}`;

  for (const h of [H_STD, H_TALL]) {
    for (const [bp, ts] of BLOCKS) {
      const k = key(h, bp, ts);
      it(`${k}:${h === H_STD ? "996 档" : "1246 档"} × ${bp && ts ? "两块都在" : bp || ts ? "只有其一" : "两块都不在"} 的 rowH / gap / 末行底边`, () => {
        const L = prestigeLayout(W, h, routeIds("builder"), bp, ts);
        const [rowsBottom, rowH, gap, rowsEnd, margin, maxFit] = CELL[k];
        expect(L.rowsBottom).toBe(rowsBottom);
        expect(L.rowH).toBe(rowH);
        expect(L.rowGap).toBe(gap);
        expect(L.rowStep).toBe(rowH + gap);
        expect(L.rowsEnd).toBe(rowsEnd);
        expect(lastRowBottom(L)).toBe(rowsEnd);
        expect(L.rowsBottom - L.rowsEnd).toBe(margin);
        // 与 spreadRows 直算对照:矩阵不是从布局函数里抄回来的
        const d = direct(10, PT_LIST_Y0, rowsBottom);
        expect([d.rowH, d.gap]).toEqual([rowH, gap]);
        // 末行底边落在预算内(本屏三系恒 10 条,六格都不越界)
        expect(L.rowsEnd).toBeLessThanOrEqual(L.rowsBottom);
        expect(maxFitRows(PT_LIST_Y0, rowsBottom)).toBe(maxFit);
        expect(firstOverflowN(PT_LIST_Y0, rowsBottom)).toBe(maxFit + 1);
      });
    }
  }

  it("只有蓝图与只有定向搜索两格同数(两块各吃 46px,谁在上不影响预算)", () => {
    const only = (h: number) => [prestigeLayout(W, h, routeIds("builder"), true, false), prestigeLayout(W, h, routeIds("builder"), false, true)];
    for (const h of [H_STD, H_TALL]) {
      const [a, b] = only(h);
      expect([a.rowH, a.rowGap, a.rowsEnd, a.rowsBottom]).toEqual([b.rowH, b.rowGap, b.rowsEnd, b.rowsBottom]);
    }
  });

  it("三系在同一格下行数相同:行数恒等于当前系的条数,矩阵六格 × 三系都不越界", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        for (const r of ROUTES) {
          const ids = routeIds(r);
          const L = prestigeLayout(W, h, ids, bp, ts);
          expect(L.rows).toHaveLength(ids.length);
          expect(L.routeLen).toBe(ids.length);
          expect(L.rowsEnd).toBeLessThanOrEqual(L.rowsBottom);
        }
      }
    }
  });

  it("行区越界是线性放大的:超出行数阈值后每多一行末行底边就多 rowH + 4(两下限同时兜住)", () => {
    // 996 × 两块都在:15 行还在线内,16 行越出
    const rowsBottom = prestigeLayout(W, H_STD, routeIds("builder"), true, true).rowsBottom;
    const fit = maxFitRows(PT_LIST_Y0, rowsBottom);
    expect(fit).toBe(15);
    const over = firstOverflowN(PT_LIST_Y0, rowsBottom);
    expect(over).toBe(16);
    const at = (n: number) => {
      const { rowH, gap } = direct(n, PT_LIST_Y0, rowsBottom);
      return PT_LIST_Y0 + (n - 1) * (rowH + gap) + rowH;
    };
    expect(at(fit)).toBeLessThanOrEqual(rowsBottom);
    expect(at(over)).toBeGreaterThan(rowsBottom);
    expect(at(over)).toBe(856);
    expect(at(over) - rowsBottom).toBe(36);
    // 两个下限同时兜住之后,每多一行末行底边就多 rowH + gap = 40 + 4
    expect(at(over + 1) - at(over)).toBe(44);
  });

  it("行 y 就是 rowsTop + i × (rowH + gap)(本屏使用 spreadRows 返回的 gap,与 gearup 丢弃它正相反)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);
    expect(L.rowGap).toBeGreaterThan(4);
    for (let i = 0; i < L.rows.length; i++) {
      expect(L.rows[i].rect.y).toBe(PT_LIST_Y0 + i * L.rowStep);
      expect(L.rows[i].rect.x).toBe(PAD);
      expect(L.rows[i].rect.w).toBe(W - PAD * 2);
      expect(L.rows[i].index).toBe(i);
    }
    // 行与行不相叠
    for (let i = 1; i < L.rows.length; i++) expect(L.rows[i].rect.y).toBeGreaterThan(L.rows[i - 1].rect.y + L.rows[i - 1].rect.h - L.rowGap);
  });

  it("行以天赋 id 为键,顺序就是路线原序(不排序、不去重)", () => {
    for (const r of ROUTES) {
      const ids = routeIds(r);
      const L = prestigeLayout(W, H_STD, ids, false, false);
      expect(L.rows.map((x) => x.id)).toEqual(ids);
    }
    expect(prestigeRouteIds("efficient")).toEqual(EFFICIENT_ROUTE.map((n) => n.id));
    expect(prestigeRouteIds("conqueror")).toEqual(CONQUEROR_ROUTE.map((n) => n.id));
    expect(prestigeRouteNodes("builder")).toBe(BUILDER_ROUTE);
    expect(prestigeRouteNodes("efficient")).toBe(EFFICIENT_ROUTE);
    expect(prestigeRouteNodes("conqueror")).toBe(CONQUEROR_ROUTE);
  });
});

/* ==================== 3. 节点行两行布局 ==================== */

describe("节点行的两行布局(l1 / l2 / 右列两档 / 勾选标记)", () => {
  it("l1 = round(r.y + r.h/2 − 6)、l2 = l1 + 19", () => {
    expect([PT_L1_DY, PT_L2_DY]).toEqual([6, 19]);
    for (const [bp, ts] of BLOCKS) {
      const L = prestigeLayout(W, H_STD, routeIds("builder"), bp, ts);
      for (const row of L.rows) {
        expect(row.l1).toBe(Math.round(row.rect.y + row.rect.h / 2 - PT_L1_DY));
        expect(row.l2).toBe(row.l1 + PT_L2_DY);
        expect(row.name.baseY).toBe(row.l1);
        expect(row.cost.baseY).toBe(row.l1);
        expect(row.ownedText.baseY).toBe(row.l1);
        expect(row.desc.baseY).toBe(row.l2);
      }
    }
  });

  it("名称起笔 r.x + 8、限宽 150(fs.body);描述起笔 r.x + 8、限宽 r.w − 24(fs.micro)", () => {
    expect([PT_NAME_DX, PT_NAME_MAX_W, PT_DESC_DX, PT_DESC_MAX_DX]).toEqual([8, 150, 8, 24]);
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    for (const row of L.rows) {
      expect(row.name.x).toBe(row.rect.x + PT_NAME_DX);
      expect(row.name.maxW).toBe(PT_NAME_MAX_W);
      expect(row.name.px).toBe(FS.body);
      expect(row.desc.x).toBe(row.rect.x + PT_DESC_DX);
      expect(row.desc.maxW).toBe(row.rect.w - PT_DESC_MAX_DX);
      expect(row.desc.px).toBe(FS.micro);
      expect(row.name.x + row.name.maxW).toBeLessThan(row.rect.x + row.rect.w);
    }
  });

  it("右列两档共用同一末笔 r.x + r.w − 8 与同一基线,都是右对齐 fs.muted", () => {
    expect(PT_RIGHT_DX).toBe(8);
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    for (const row of L.rows) {
      const rightX = row.rect.x + row.rect.w - PT_RIGHT_DX;
      expect(row.cost.x).toBe(rightX);
      expect(row.ownedText.x).toBe(rightX);
      expect([row.cost.align, row.ownedText.align]).toEqual(["right", "right"]);
      expect([row.cost.px, row.ownedText.px]).toEqual([FS.muted, FS.muted]);
      expect(row.cost.maxW).toBe(row.rect.w - PT_NAME_DX - PT_NAME_MAX_W - 10);
    }
  });

  it("勾选标记:13×13 落在 (右缘 − 12 − 量字宽 − 17, l1 − 12),量字宽是 Cocos 侧近似值", () => {
    expect([PT_MARK_SIZE, PT_MARK_INSET, PT_MARK_GAP, PT_MARK_DY]).toEqual([13, 12, 17, 12]);
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    for (const row of L.rows) {
      expect(row.ownedMark.w).toBe(PT_MARK_SIZE);
      expect(row.ownedMark.h).toBe(PT_MARK_SIZE);
      expect(row.ownedMark.x).toBe(row.rect.x + row.rect.w - PT_MARK_INSET - PT_OWNED_TEXT_W - PT_MARK_GAP - PT_MARK_SIZE);
      expect(row.ownedMark.y).toBe(row.l1 - PT_MARK_DY);
      // 标记与名称不重叠,且标记在「已拥有」文字左侧
      expect(row.ownedMark.x).toBeGreaterThan(row.name.x + row.name.maxW);
      const ownedBandRight = row.ownedText.x;
      expect(row.ownedMark.x + row.ownedMark.w + PT_MARK_GAP).toBeLessThanOrEqual(ownedBandRight - PT_OWNED_TEXT_W);
    }
  });

  it("「已拥有」的量字宽按 Cocos 侧近似系数(CJK = 1×px)——这一档与 Web 的 measureText 不同源", () => {
    expect(PT_OWNED_TEXT_W).toBe(3 * FS.muted);
    expect(PT_OWNED_TEXT_W).toBe(39);
  });

  it("两行布局的 l2 恒在行矩形之内(描述不会被挤出本行)", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        const L = prestigeLayout(W, h, routeIds("builder"), bp, ts);
        for (const row of L.rows) {
          expect(row.l2).toBeLessThanOrEqual(row.rect.y + row.rect.h);
          expect(row.l1).toBeGreaterThan(row.rect.y);
        }
      }
    }
  });
});

/* ==================== 4. 两个开局配置块 ==================== */

describe("开局配置块:定向搜索 6 枚 / 完美蓝图 8 枚", () => {
  it("块不在时钮数组为空、标签为 null(几何与绘制同源,没有侧信道)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.triggerBtns).toEqual([]);
    expect(L.effectBtns).toEqual([]);
    expect(L.triggerLabel).toBeNull();
    expect(L.effectLabel).toBeNull();
    expect(L.hasBlueprint).toBe(false);
    expect(L.hasTargetedSearch).toBe(false);
  });

  it("定向搜索:6 枚、bw = (w − pad×2 − 5×6)/6、间距 6、y = blockTop + 18、h = 28", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, true);
    expect(PT_TRIGGER_N).toBe(6);
    expect(PT_TRIGGER_GAP).toBe(6);
    expect(L.triggerBtns).toHaveLength(6);
    const bw = (W - PAD * 2 - 5 * 6) / 6;
    for (let i = 0; i < 6; i++) {
      expect(L.triggerBtns[i].rect).toEqual({ x: PAD + i * (bw + 6), y: L.blockTop + PT_BTN_DY, w: bw, h: PT_BTN_H });
      expect(L.triggerBtns[i].type).toBe(PT_TRIGGER_TYPES[i]);
    }
    expect(bw).toBeCloseTo(83.66666666666667, 10);
  });

  it("完美蓝图:8 枚、bw = (w − pad×2 − 7×4)/8 = 63、间距 4", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, false);
    expect(PT_EFFECT_N).toBe(8);
    expect(PT_EFFECT_GAP).toBe(4);
    expect(L.effectBtns).toHaveLength(8);
    const bw = (W - PAD * 2 - 7 * 4) / 8;
    expect(bw).toBe(63);
    for (let i = 0; i < 8; i++) {
      expect(L.effectBtns[i].rect).toEqual({ x: PAD + i * (bw + 4), y: L.blockTop + PT_BTN_DY, w: bw, h: PT_BTN_H });
      expect(L.effectBtns[i].type).toBe(PT_EFFECT_TYPES[i]);
    }
    // 末枚右缘贴面板右缘
    const last = L.effectBtns[7].rect;
    expect(last.x + last.w).toBeCloseTo(W - PAD, 10);
  });

  it("两块都在时定向搜索压在完美蓝图之上(Web 的 blockTop 递减次序)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);
    expect(L.triggerBtns[0].rect.y).toBeLessThan(L.effectBtns[0].rect.y);
    expect(L.triggerLabel!.baseY).toBeLessThan(L.effectLabel!.baseY);
    expect(L.effectLabel!.baseY).toBe(884);
    expect(L.triggerLabel!.baseY).toBe(838);
    expect(PT_LABEL_DY).toBe(10);
    expect(L.triggerLabel!.baseY - L.triggerBtns[0].rect.y).toBe(-PT_BTN_DY + PT_LABEL_DY);
  });

  it("标签行左起笔于 pad、fs.micro;钮文居中并用 rowTextY(fs.micro)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);
    for (const lab of [L.triggerLabel!, L.effectLabel!]) {
      expect(lab.x).toBe(PAD);
      expect(lab.px).toBe(FS.micro);
      expect(lab.align).toBe("left");
    }
    for (const b of [...L.triggerBtns, ...L.effectBtns]) {
      expect(b.text.align).toBe("center");
      expect(b.text.x).toBe(b.rect.x + b.rect.w / 2);
      expect(b.text.maxW).toBe(b.rect.w);
      expect(b.text.baseY).toBe(rowTextY(b.rect.y, b.rect.h, FS.micro));
    }
  });

  it("两块都在时行区预算底缘仍在开始新轮回钮之上、且两块互不相叠", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = prestigeLayout(W, h, routeIds("builder"), true, true);
      expect(L.rowsEnd).toBeLessThan(L.triggerBtns[0].rect.y);
      expect(L.triggerBtns[0].rect.y + PT_BTN_H).toBeLessThan(L.effectLabel!.baseY);
      expect(L.effectBtns[0].rect.y + PT_BTN_H).toBeLessThan(L.startBtn.y);
    }
  });
});

/* ==================== 5. 头部:横幅两档 + 立绘 + 四行信息 ==================== */

describe("头部几何(对标 Web skinHeader 与四行 fillText)", () => {
  it("横幅盒 = (pad − 8, 36 − 46 + 8, 240, 46);有图时标题居中于横幅、基线 36 − 4", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect([PT_BANNER_W, PT_BANNER_H, PT_TITLE_BASE_Y]).toEqual([240, 46, 36]);
    expect(L.headerBanner).toEqual({ x: PAD - 8, y: 36 - PT_BANNER_H + 8, w: PT_BANNER_W, h: PT_BANNER_H });
    expect(L.titleWithBanner.x).toBe(L.headerBanner.x + L.headerBanner.w / 2);
    expect(L.titleWithBanner.baseY).toBe(PT_TITLE_BASE_Y - PT_BANNER_TEXT_DY);
    expect(L.titleWithBanner.align).toBe("center");
    expect(L.titleWithBanner.px).toBe(FS.title);
  });

  it("缺图时标题左起笔于 pad、基线 36,并且收在小立绘起笔前", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.titleBare.x).toBe(PAD);
    expect(L.titleBare.baseY).toBe(PT_TITLE_BASE_Y);
    expect(L.titleBare.align).toBe("left");
    expect(L.titleBare.x + L.titleBare.maxW).toBeLessThanOrEqual(PT_POSE_X);
  });

  it("小立绘的固定坐标逐字照搬 Web:(252, 4, 38, 60)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.pose).toEqual({ x: PT_POSE_X, y: PT_POSE_Y, w: PT_POSE_W, h: PT_POSE_H });
    expect([PT_POSE_X, PT_POSE_Y, PT_POSE_W, PT_POSE_H]).toEqual([252, 4, 38, 60]);
  });

  it("四行信息的基线 60 / 60 / 82 / 100,「可支配」从 pad + 210 起笔", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect([PT_ECHO_BASE_Y, PT_AVAIL_DX, PT_ROUTE_BASE_Y, PT_COLL_BASE_Y]).toEqual([60, 210, 82, 100]);
    expect(L.echoLine.x).toBe(PAD);
    expect(L.echoLine.baseY).toBe(60);
    expect(L.echoLine.px).toBe(FS.body);
    expect(L.availLine.x).toBe(PAD + PT_AVAIL_DX);
    expect(L.availLine.baseY).toBe(60);
    expect(L.availLine.px).toBe(FS.body);
    expect(L.routeLine.baseY).toBe(82);
    expect(L.routeLine.px).toBe(FS.micro);
    expect(L.collLine.baseY).toBe(100);
    expect(L.collLine.px).toBe(FS.micro);
  });

  it("回响行收到「可支配」起笔前;两行让位互不重叠", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(L.echoLine.x + L.echoLine.maxW).toBeLessThanOrEqual(L.availLine.x);
    expect(L.routeLine.maxW).toBe(W - PAD * 2);
    expect(L.collLine.maxW).toBe(W - PAD * 2);
  });
});

/* ==================== 6. 文本带全网格落在 0..560(R5) ==================== */

describe("文本带右界(prestigeLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    for (const align of ["left", "center", "right"] as TextAlign[]) {
      const band: Band = anchorBand(100, 20, 120, 14, align, LIFT);
      const ax = alignAx(align);
      expect(band.x + band.w * ax).toBe(100);
      expect(band.w).toBe(120);
      expect(ax).toBe(align === "left" ? 0 : align === "center" ? 0.5 : 1);
    }
  });

  it("两档屏高 × 条件块四档 × 三系:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        for (const r of ROUTES) {
          const L = prestigeLayout(W, h, routeIds(r), bp, ts);
          const lines: PtTextLine[] = [
            L.titleBare,
            L.titleWithBanner,
            L.echoLine,
            L.availLine,
            L.routeLine,
            L.collLine,
            ...L.tabs.map((t) => t.text),
            ...L.rows.flatMap((x) => [x.name, x.cost, x.ownedText, x.desc]),
            ...[L.triggerLabel, L.effectLabel].filter((x): x is PtTextLine => !!x),
            ...[...L.triggerBtns, ...L.effectBtns].map((b) => b.text),
            L.startText,
          ];
          for (const t of lines) {
            const band = anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
            expect(band.x, `h=${h} bp=${bp} ts=${ts} route=${r} x=${t.x}`).toBeGreaterThanOrEqual(0);
            expect(band.x + band.w, `h=${h} bp=${bp} ts=${ts} route=${r} x=${t.x}`).toBeLessThanOrEqual(W);
          }
        }
      }
    }
  });

  it("两处右对齐(价格串 / 已拥有)末笔都贴面板右缘内缩 8", () => {
    const L = prestigeLayout(W, H_TALL, routeIds("conqueror"), true, true);
    for (const row of L.rows) {
      const band = anchorBand(row.cost.x, row.cost.baseY, row.cost.maxW, row.cost.px, "right", LIFT);
      expect(band.x + band.w).toBe(row.rect.x + row.rect.w - PT_RIGHT_DX);
      expect(band.x + band.w).toBe(W - PAD - PT_RIGHT_DX);
    }
  });

  it("居中文字位(三枚页签 / 十四枚配置钮 / 开始新轮回钮)都在自己那个矩形里", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);
    const pairs: [PtRect, PtTextLine][] = [
      ...L.tabs.map((t): [PtRect, PtTextLine] => [t.rect, t.text]),
      ...[...L.triggerBtns, ...L.effectBtns].map((b): [PtRect, PtTextLine] => [b.rect, b.text]),
      [L.startBtn, L.startText],
    ];
    for (const [r, t] of pairs) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(r.x + r.w / 2);
      expect(t.maxW).toBe(r.w);
      expect(t.baseY).toBe(rowTextY(r.y, r.h, t.px));
      expect(center(r).x).toBe(t.x);
    }
    expect(L.startText.px).toBe(FS.section);
    expect(L.tabs[0].text.px).toBe(FS.muted);
  });
});

/* ==================== 7. 内容:十八条文案逐字 ==================== */

describe("屏级文案逐字(对标 Web drawPrestige 的 fillText 实参)", () => {
  const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);

  it("标题与开始新轮回钮与两个块标签逐字(标点不许改)", () => {
    const c = buildPrestigeContent(save({ points: 10 }), "builder", cfg(), L);
    expect(c.title).toBe("转生与天赋");
    expect(c.startText).toBe("开始新轮回 (R)");
    expect(c.triggerLabel).toBe("定向搜索:首次升级必定出现的触发器(再点一次取消)");
    expect(c.effectLabel).toBe("完美蓝图:开局武器效果(再点一次取消)");
    expect(c.ownedText).toBe("已拥有");
  });

  it("回响点数 / 已用 / 可支配三处插值同 Web 原样", () => {
    const s = save({ points: 10, ownedTalents: ["extra_gear"] });
    const c = buildPrestigeContent(s, "builder", cfg(), L);
    expect(availablePoints(s)).toBe(7);
    expect(c.echoText).toBe("回响点数 10(已用 3)");
    expect(c.availText).toBe("可支配 7");
  });

  it("路线行三系各一档,括号里的总价就是 routeCost(该系)", () => {
    for (const r of ROUTES) {
      const c = buildPrestigeContent(save(), r, cfg(), L);
      const nodes = prestigeRouteNodes(r);
      expect(c.routeText).toBe(`${prestigeRouteName(r)}路线(${routeCost(nodes)}点)· 击败更多敌人获得回响点数`);
    }
    expect(buildPrestigeContent(save(), "builder", cfg(), L).routeText).toBe(`构筑师路线(${routeCost(BUILDER_ROUTE)}点)· 击败更多敌人获得回响点数`);
    expect(routeCost(BUILDER_ROUTE)).toBe(91);
    expect(routeCost(EFFICIENT_ROUTE)).toBe(91);
    expect(routeCost(CONQUEROR_ROUTE)).toBe(98);
    expect(buildPrestigeContent(save(), "efficient", cfg(), L).routeText.startsWith("效率专家路线(")).toBe(true);
    expect(buildPrestigeContent(save(), "conqueror", cfg(), L).routeText.startsWith("征服者路线(")).toBe(true);
  });

  it("图鉴行四个计数全部由存档 length 与表长插值", () => {
    const c0 = buildPrestigeContent(save({ collection: coll(1) }), "builder", cfg(), L);
    expect(c0.collText).toBe("图鉴:触发器 1/6 · 效果 1/14 · 修饰器 1/8 · 敌方 1/134");
    const c1 = buildPrestigeContent(save({ collection: collection(6, 14, 8, 134) }), "builder", cfg(), L);
    expect(c1.collText).toBe("图鉴:触发器 6/6 · 效果 14/14 · 修饰器 8/8 · 敌方 134/134");
    const c2 = buildPrestigeContent(save({ collection: collection(0, 3, 5, 9) }), "builder", cfg(), L);
    expect(c2.collText).toBe("图鉴:触发器 0/6 · 效果 3/14 · 修饰器 5/8 · 敌方 9/134");
  });

  it("页签标签与路线名同源:PT_TAB_DEFS 那三串就是 Web 用的三串", () => {
    const c = buildPrestigeContent(save(), "conqueror", cfg(), L);
    expect(c.tabs.map((t) => t.label)).toEqual(["构筑师", "效率专家", "征服者"]);
    expect(c.tabs.map((t) => t.selected)).toEqual([false, false, true]);
  });

  it("钮文取 triggerDef / effectDef 的 name(Web 的两处 def 调用)", () => {
    const c = buildPrestigeContent(save({ points: 200, ownedTalents: ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"] }), "builder", cfg(), L);
    expect(c.triggerBtns.map((b) => b.type)).toEqual([...PT_TRIGGER_TYPES]);
    expect(c.triggerBtns.map((b) => b.label)).toEqual(PT_TRIGGER_TYPES.map((t) => triggerDef(t).name));
    expect(c.effectBtns.map((b) => b.label)).toEqual(PT_EFFECT_TYPES.map((t) => effectDef(t).name));
    expect(c.triggerBtns.length).toBe(6);
    expect(c.effectBtns.length).toBe(8);
  });

  it("行文案:价格串是 `${cost}点 · Lv.${tier}`,名字与描述取表", () => {
    const c = buildPrestigeContent(save(), "builder", cfg(), L);
    const first = c.rows[0];
    const node = talentOf(first.id);
    expect(first.costText).toBe(`${node.cost}点 · Lv.${node.tier}`);
    expect(first.name).toBe(node.name);
    expect(first.desc).toBe(node.desc);
    expect(c.rows.map((r) => r.id)).toEqual(L.rows.map((r) => r.id));
    expect(c.rows.every((r) => r.owned === false)).toBe(true);
  });
});

/* ==================== 8. 三档态矩阵(已拥有 / 可负担 / 层级锁)× 三系 ==================== */

describe("行三档态(availablePoints 与 isTierUnlocked 的合取)", () => {
  const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
  const tiers = [1, 2, 3, 4, 5];

  /** 该行的三档态:与模型同式,但在这里独立走一遍 availablePoints / isTierUnlocked */
  function expected(s: PrestigeSaveView, route: PtRouteKey) {
    const avail = availablePoints(s);
    const nodes = prestigeRouteNodes(route);
    return nodes.map((n) => ({
      owned: s.ownedTalents.includes(n.id),
      affordable: !s.ownedTalents.includes(n.id) && avail >= n.cost && isTierUnlocked(s.ownedTalents, n.tier, nodes),
    }));
  }

  it("空档:全未拥有,1 层两枚在点数够时可负担、2 层以上全被层级门锁住", () => {
    const c = buildPrestigeContent(save({ points: 50 }), "builder", cfg(), L);
    const exp = expected(save({ points: 50 }), "builder");
    for (let i = 0; i < c.rows.length; i++) {
      expect(c.rows[i].owned).toBe(exp[i].owned);
      expect(c.rows[i].affordable).toBe(exp[i].affordable);
      expect(talentOf(c.rows[i].id).tier === 1 ? c.rows[i].affordable : true).toBe(true);
    }
    expect(c.rows.filter((r) => r.affordable).map((r) => r.id)).toEqual(["extra_gear", "quick_start"]);
  });

  it("点数不足那一档:owned 与 affordable 同假,右列走 #5a6a80", () => {
    const c = buildPrestigeContent(save({ points: 1 }), "builder", cfg(), L);
    expect(c.rows.every((r) => !r.owned && !r.affordable)).toBe(true);
  });

  it("已拥有那一档:owned 真则 affordable 必假(三个条件里第一个就把后两个短路)", () => {
    const s = save({ points: 50, ownedTalents: ["quick_start"] });
    const c = buildPrestigeContent(s, "builder", cfg(), L);
    const row = c.rows.find((r) => r.id === "quick_start")!;
    expect(row.owned).toBe(true);
    expect(row.affordable).toBe(false);
    // 已花掉的点数从可支配里扣掉:50 − 2 = 48
    expect(c.availText).toBe("可支配 48");
  });

  it("层级解锁链:买下同系 1 层后 2 层才可负担,以此推到 5 层", () => {
    let owned: TalentId[] = [];
    for (const t of tiers) {
      const s = save({ points: 500, ownedTalents: owned });
      const c = buildPrestigeContent(s, "builder", cfg(), L);
      const open = c.rows.filter((r) => r.affordable).map((r) => talentOf(r.id).tier);
      // 低层里没买掉的行始终可负担,所以这条链的度量是"可负担行的最高层"
      expect(Math.max(...open)).toBe(t);
      expect(Math.min(...open)).toBe(1);
      expect(open.filter((x) => x === t).length).toBeGreaterThan(0);
      const next = BUILDER_ROUTE.find((n) => n.tier === t && !owned.includes(n.id))!;
      owned = [...owned, next.id];
    }
    // 那条链每层只买掉一枚:收尾时五个层各剩一枚未买的行仍可负担
    const last = buildPrestigeContent(save({ points: 500, ownedTalents: owned }), "builder", cfg(), L);
    const openIds = last.rows.filter((r) => r.affordable).map((r) => r.id);
    expect(openIds).toEqual(["quick_start", "slot1", "affix_preview", "slot2", "blueprint"]);
    expect(openIds.map((id) => talentOf(id).tier)).toEqual([1, 2, 3, 4, 5]);
  });

  it("切系即换行:同一份存档下三系各出自己的 10 条,三档态互不串台", () => {
    const s = save({ points: 300, ownedTalents: ["quick_start", "exp_gain", "crit"] });
    for (const r of ROUTES) {
      const L2 = prestigeLayout(W, H_STD, routeIds(r), false, false);
      const c = buildPrestigeContent(s, r, cfg(), L2);
      expect(c.rows.map((x) => x.id)).toEqual(routeIds(r));
      expect(c.rows.filter((x) => x.owned).map((x) => x.id)).toEqual(s.ownedTalents.filter((id) => routeIds(r).includes(id)));
      const exp = expected(s, r);
      for (let i = 0; i < c.rows.length; i++) expect(c.rows[i].affordable).toBe(exp[i].affordable);
    }
  });

  it("已拥有与层级锁同时存在:1 层买了但 3 层的前置不在,3 层仍锁", () => {
    const s = save({ points: 300, ownedTalents: ["quick_start"] });
    const c = buildPrestigeContent(s, "builder", cfg(), L);
    const t2 = c.rows.find((r) => r.id === "affix_taste")!;
    const t3 = c.rows.find((r) => r.id === "targeted_search")!;
    expect(t2.affordable).toBe(true);
    expect(t3.affordable).toBe(false);
    expect(t3.owned).toBe(false);
  });

  it("两个条件块的存在性只由 ownedTalents 决定(与当前系、与点数无关)", () => {
    const chain: TalentId[] = ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"];
    expect(prestigeBlocks(save({ ownedTalents: chain }))).toEqual({ hasBlueprint: true, hasTargetedSearch: true });
    expect(prestigeBlocks(save({ ownedTalents: ["blueprint"] }))).toEqual({ hasBlueprint: true, hasTargetedSearch: false });
    expect(prestigeBlocks(save({ ownedTalents: ["targeted_search"] }))).toEqual({ hasBlueprint: false, hasTargetedSearch: true });
    expect(prestigeBlocks(save())).toEqual({ hasBlueprint: false, hasTargetedSearch: false });
    expect(prestigeOwns(chain, "blueprint")).toBe(true);
    expect(prestigeOwns(chain, "extra_gear")).toBe(false);
  });

  it("内容层的两个块标志就是几何层入参回读(视图不会拿到两套真值)", () => {
    for (const [bp, ts] of BLOCKS) {
      const L2 = prestigeLayout(W, H_STD, routeIds("builder"), bp, ts);
      const c = buildPrestigeContent(save(), "builder", cfg(), L2);
      expect(c.hasBlueprint).toBe(L2.hasBlueprint);
      expect(c.hasTargetedSearch).toBe(L2.hasTargetedSearch);
      expect(c.effectBtns).toHaveLength(L2.effectBtns.length);
      expect(c.triggerBtns).toHaveLength(L2.triggerBtns.length);
    }
  });
});

/* ==================== 9. 页签切换与开局配置往返开关 ==================== */

describe("页签与两枚开局配置开关的选中态", () => {
  const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);

  it("页签选中档只有一枚为真,且随 route 入参切换", () => {
    for (const r of ROUTES) {
      const c = buildPrestigeContent(save(), r, cfg(), L);
      expect(c.tabs.filter((t) => t.selected)).toHaveLength(1);
      expect(c.tabs.find((t) => t.selected)!.route).toBe(r);
    }
  });

  it("定向搜索与完美蓝图各自只有一枚钮算选中,且互不串台", () => {
    const c = buildPrestigeContent(save({ points: 200, ownedTalents: ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"] }), "builder", cfg({ targetTrigger: "kill", blueprintEffect: "nova" }), L);
    expect(c.triggerBtns.filter((b) => b.selected).map((b) => b.type)).toEqual(["kill"]);
    expect(c.effectBtns.filter((b) => b.selected).map((b) => b.type)).toEqual(["nova"]);
  });

  it("未选任何开关时两块的钮全不选中(而不是全选)", () => {
    const c = buildPrestigeContent(save(), "builder", cfg(), L);
    expect(c.triggerBtns.some((b) => b.selected)).toBe(false);
    expect(c.effectBtns.some((b) => b.selected)).toBe(false);
  });

  it("开关值不在本块钮序列里时全部不选中(Web 的 === 比较同一结果)", () => {
    const c = buildPrestigeContent(save(), "builder", cfg({ blueprintEffect: "knife" }), L);
    expect(c.triggerBtns.some((b) => b.selected)).toBe(false);
    expect(c.effectBtns.filter((b) => b.selected).map((b) => b.type)).toEqual(["knife"]);
  });
});

/* ==================== 10. 命中:五段顺序 + 热区外无兜底 + 没有返回钮 ==================== */

describe("hitPrestige(对标 Web onPrestigeClick 的五段)", () => {
  const owned: TalentId[] = ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"];
  const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);

  it("页签 → 逐行 → 触发器钮 → 效果钮 → 开始新轮回,各自中心都命中自己", () => {
    for (const t of L.tabs) expect(hitPrestige(L, center(t.rect).x, center(t.rect).y)).toEqual({ kind: "tab", route: t.route });
    for (const r of L.rows) expect(hitPrestige(L, center(r.rect).x, center(r.rect).y)).toEqual({ kind: "buy", id: r.id });
    for (const b of L.triggerBtns) expect(hitPrestige(L, center(b.rect).x, center(b.rect).y)).toEqual({ kind: "trigger", type: b.type });
    for (const b of L.effectBtns) expect(hitPrestige(L, center(b.rect).x, center(b.rect).y)).toEqual({ kind: "effect", type: b.type });
    expect(hitPrestige(L, center(L.startBtn).x, center(L.startBtn).y)).toEqual({ kind: "start" });
  });

  it("矩形四角与边线都算命中(Web 的 >= x && <= x + w 闭区间)", () => {
    const r = L.rows[0].rect;
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      expect(hitPrestige(L, x, y)).toEqual({ kind: "buy", id: L.rows[0].id });
    }
  });

  it("热区之外的空白不产任何动作(没有'其余一律'兜底)", () => {
    expect(hitPrestige(L, W / 2, 3)).toBeNull();
    expect(hitPrestige(L, 3, H_STD - 3)).toBeNull();
    // 行与行之间的那道 gap 正中(行步进减行高)不属于任何行
    const mid = L.rows[0].rect.y + L.rowH + Math.floor(L.rowGap / 2);
    expect(hitPrestige(L, W / 2, mid)).toBeNull();
  });

  it("页签优先于行:同一屏上先比页签(Web 的循环次序)", () => {
    // 页签带与行区不重叠,但命中次序本身是可断言的事实:命中页签矩形时不会落到行
    const t = L.tabs[0];
    expect(hitPrestige(L, center(t.rect).x, center(t.rect).y)!.kind).toBe("tab");
    const firstRowY = L.rows[0].rect.y;
    expect(firstRowY).toBeGreaterThan(t.rect.y + t.rect.h);
  });

  it("两块都不在时那一档热区根本不存在,点下去拿不到任何动作", () => {
    const bare = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    expect(bare.triggerBtns).toEqual([]);
    expect(bare.effectBtns).toEqual([]);
    // 两块都不在时,末行底边与开始新轮回钮顶缘之间就是那条没有热区的空带
    const blank = Math.round((bare.rowsEnd + bare.startBtn.y) / 2);
    expect(blank).toBeGreaterThan(bare.rowsEnd);
    expect(blank).toBeLessThan(bare.startBtn.y);
    expect(hitPrestige(bare, W / 2, blank)).toBeNull();
  });

  it("禁用态仍返回动作:已拥有与买不起的行都照样回 buy", () => {
    const s = save({ points: 0, ownedTalents: ["quick_start"] });
    for (const row of L.rows) {
      const a = hitPrestige(L, center(row.rect).x, center(row.rect).y)!;
      expect(a.kind).toBe("buy");
      const claim = prestigeClaim(s, cfg(), a);
      if (row.id === "quick_start") {
        expect(claim).toBeNull(); // 已拥有
      } else {
        expect(claim).toBeNull(); // 点数不够(全档都是)
      }
    }
  });

  it("同一份几何下把整屏行命中一遍:只有过得了三道守卫的五行返回意图(其余五行被挡住)", () => {
    // 链是每层各买一枚:剩下未购的五行(五个层各一枚)全都门已开、点也够
    const s = save({ points: 500, ownedTalents: owned });
    const claims = L.rows.map((row) => prestigeClaim(s, cfg(), hitPrestige(L, center(row.rect).x, center(row.rect).y)!));
    expect(claims.filter((c) => c !== null).map((c) => (c as { id?: TalentId }).id)).toEqual(["extra_gear", "slot1", "affix_preview", "slot2", "universal"]);
    const blocked = L.rows.filter((_, i) => claims[i] === null).map((r) => r.id);
    expect(blocked).toEqual(owned);
    expect(blocked.length).toBe(5);
    expect(claims.every((c) => c === null || c.persists === true)).toBe(true);
  });

  it("本屏没有 back 动作:五段之外的 kind 都构造不出来", () => {
    for (const p of [[W / 2, 3], [W - 2, 3], [PAD, PAD], [W - PAD, H_STD - PAD]]) {
      const a = hitPrestige(L, p[0], p[1]);
      if (a) expect(["tab", "buy", "trigger", "effect", "start"]).toContain(a.kind);
    }
  });
});

/* ==================== 11. 写入意图 ==================== */

describe("prestigeClaim(唯一入档的一档是买天赋;其余都是瞬时态)", () => {
  const L = prestigeLayout(W, H_STD, routeIds("builder"), true, true);

  it("三道守卫逐条:已拥有 / 点数不够 / 层级未解锁,都返回 null", () => {
    // 本节的行键都取自这份几何:当前系就是构筑师
    expect(L.rows.map((r) => r.id)).toEqual(BUILDER_ROUTE.map((n) => n.id));
    expect(prestigeClaim(save({ points: 500, ownedTalents: ["quick_start"] }), cfg(), { kind: "buy", id: "quick_start" })).toBeNull();
    expect(prestigeClaim(save({ points: 1 }), cfg(), { kind: "buy", id: "quick_start" })).toBeNull();
    expect(prestigeClaim(save({ points: 500 }), cfg(), { kind: "buy", id: "affix_taste" })).toBeNull();
    expect(prestigeClaim(save({ points: 500, ownedTalents: ["quick_start"] }), cfg(), { kind: "buy", id: "affix_taste" })).toEqual({ kind: "talent", persists: true, id: "affix_taste" });
  });

  it("买入意图只带 id:点数不扣减(可支配是派生量),意图里也就没有 points 增量", () => {
    const claim = prestigeClaim(save({ points: 500 }), cfg(), { kind: "buy", id: "quick_start" })!;
    expect(Object.keys(claim).sort()).toEqual(["id", "kind", "persists"]);
    expect(claim.kind).toBe("talent");
    expect(claim.persists).toBe(true);
  });

  it("守卫用的是 routeOf(id) 所属系而非当前页签(Web buyTalent 同式)", () => {
    // 只买了构筑师 1 层:构筑师 2 层的门过得去,别的系的 2 层过不去(门查的是各自所属系)
    const s = save({ points: 500, ownedTalents: ["quick_start"] });
    expect(prestigeClaim(s, cfg(), { kind: "buy", id: "affix_taste" })!.kind).toBe("talent");
    expect(prestigeClaim(s, cfg(), { kind: "buy", id: "affix_taste" })!.persists).toBe(true);
    expect(prestigeClaim(s, cfg(), { kind: "buy", id: "commission_speed" })).toBeNull();
    expect(prestigeClaim(s, cfg(), { kind: "buy", id: "dmg1" })).toBeNull();
    // 补上效率专家 1 层后,那一系的 2 层才开
    const s2 = save({ points: 500, ownedTalents: ["exp_gain"] });
    expect(prestigeClaim(s2, cfg(), { kind: "buy", id: "commission_speed" })!.kind).toBe("talent");
    expect(prestigeClaim(s2, cfg(), { kind: "buy", id: "affix_taste" })).toBeNull();
    // 本函数的形参里没有页签,守卫不可能读到"当前显示哪一系"
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    const fn = src.slice(src.indexOf("export function prestigeClaim"), src.indexOf("case \"start\""));
    expect(fn.includes("route: PtRouteKey")).toBe(false);
  });

  it("切页签产 tab 意图且 persists 为假(对标 Web 只改 this.talentRoute)", () => {
    expect(prestigeClaim(save(), cfg(), { kind: "tab", route: "conqueror" })).toEqual({ kind: "tab", persists: false, route: "conqueror" });
  });

  it("定向搜索开关往返:同值取消、异值改设(Web 4372 的那个三元)", () => {
    expect(prestigeClaim(save(), cfg({ targetTrigger: "kill" }), { kind: "trigger", type: "kill" })).toEqual({ kind: "trigger", persists: false, targetTrigger: undefined });
    expect(prestigeClaim(save(), cfg({ targetTrigger: "kill" }), { kind: "trigger", type: "pulse" })).toEqual({ kind: "trigger", persists: false, targetTrigger: "pulse" });
    expect(prestigeClaim(save(), cfg(), { kind: "trigger", type: "pulse" })).toEqual({ kind: "trigger", persists: false, targetTrigger: "pulse" });
  });

  it("完美蓝图开关往返:同值取消、异值改设(Web 4378 的那个三元)", () => {
    expect(prestigeClaim(save(), cfg({ blueprintEffect: "nova" }), { kind: "effect", type: "nova" })).toEqual({ kind: "effect", persists: false, blueprintEffect: undefined });
    expect(prestigeClaim(save(), cfg({ blueprintEffect: "nova" }), { kind: "effect", type: "knife" })).toEqual({ kind: "effect", persists: false, blueprintEffect: "knife" });
    expect(prestigeClaim(save(), cfg(), { kind: "effect", type: "drain" })).toEqual({ kind: "effect", persists: false, blueprintEffect: "drain" });
  });

  it("两枚开关的意图都不落盘:四个动作里只有 talent 那一档 persists 为真", () => {
    const acts: PrestigeAction[] = [
      { kind: "tab", route: "efficient" },
      { kind: "trigger", type: "hit" },
      { kind: "effect", type: "ray" },
      { kind: "buy", id: "quick_start" },
    ];
    const flags = acts.map((a) => prestigeClaim(save({ points: 50 }), cfg(), a)!.persists);
    expect(flags).toEqual([false, false, false, true]);
  });

  it("「开始新轮回」不产任何写入意图(本屏不结算死亡,故不会使 prestiges +1)", () => {
    expect(prestigeClaim(save({ points: 500 }), cfg(), { kind: "start" })).toBeNull();
    // 连"未结算的死亡"这一档也不补结算:模型侧压根没有 pendingSettle / settleRun 的形参与返回
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    for (const bad of ["settleRun", "pendingSettle", "prestiges", "recordStageProgress", "calcPrestigePoints"]) expect(src.includes(bad), bad).toBe(false);
  });

  it("意图是纯增量描述:不携带存档、不携带价格、不携带路线表", () => {
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    for (const bad of ["save.ownedTalents.push", "points -=", "points +=", "persist(", "persistSave", "writeSave", "localStorage", "applyTalentBonuses"]) {
      expect(src.includes(bad), bad).toBe(false);
    }
  });
});

/* ==================== 12. 存档形态 ==================== */

describe("本屏读的存档切片与 availablePoints 的落点", () => {
  const src = readFileSync(new URL("../cocos-prototype/assets/scripts/core/SaveModel.ts", import.meta.url), "utf8");

  it("points / ownedTalents / collection 三项都在 SaveModel 上声明", () => {
    for (const f of ["points", "ownedTalents", "collection"]) expect(new RegExp(`^\\s+${f}:`, "m").test(src), f).toBe(true);
  });

  it("availablePoints 住在 core/SaveModel.ts(Web 同名函数的 Cocos 侧对应物)并走共享层 talentOf 取价", () => {
    expect(src.includes("export function availablePoints")).toBe(true);
    const fn = src.slice(src.indexOf("export function availablePoints"));
    expect(fn.includes("talentOf(id).cost")).toBe(true);
    expect(fn.includes("s.points -")).toBe(true);
  });

  it("页签态与开局配置都不在 SaveModel 上(Web 的 SaveData 也没有这两项)", () => {
    for (const bad of ["talentRoute", "runConfig", "targetTrigger", "blueprintEffect"]) expect(src.includes(bad), bad).toBe(false);
  });

  it("模型窄切片能直接吃 SaveModel 形状(结构兼容,宿主不需要补字段)", () => {
    const s = { points: 10, ownedTalents: ["quick_start" as TalentId], collection: { triggers: [] as string[], effects: [] as string[], modifiers: [] as string[], enemies: [] as string[] } };
    expect(() => buildPrestigeContent(s, "builder", cfg(), L_FULL())).not.toThrow();
    expect(availablePoints(s)).toBe(8);
  });

  it("Web 侧的 availablePoints 与 Cocos 侧同一判据(逐点对照五个用例)", () => {
    for (const [points, ids] of [[0, []], [10, ["extra_gear"]], [500, ["quick_start", "affix_taste"]], [3, []], [91, BUILDER_ROUTE.map((n) => n.id)]] as [number, TalentId[]][]) {
      const s = save({ points, ownedTalents: ids });
      expect(availablePoints(s)).toBe(points - ids.reduce((x, id) => x + talentOf(id).cost, 0));
    }
  });
});

function L_FULL(): PrestigeLayout {
  return prestigeLayout(W, H_STD, routeIds("builder"), false, false);
}

/* ==================== 13. 配色档:phase4 表的 pt* 默认值逐项对上 Web ==================== */

describe("phase4 表的 pt* 段(默认值逐项对标 Web drawPrestige)", () => {
  const D = phase4Defaults();
  const web = webSource();
  const draw = web.slice(web.indexOf("private drawPrestige("), web.indexOf("private onPrestigeClick("));

  it("本屏一共 33 键,且都以 pt 开头", () => {
    const keys = Object.keys(D).filter((k) => k.startsWith("pt"));
    expect(keys.length).toBe(33);
    expect(keys.every((k) => /^pt[A-Z]/.test(k))).toBe(true);
  });

  it("覆盖底与标题色与 Web 一致", () => {
    expect(D.ptDim).toBe("rgba(8,10,16,0.86)");
    expect(D.ptTitle).toBe("#C06CFF");
    expect(draw.includes('"#c06cff"')).toBe(true);
    expect(draw.includes("rgba(8,10,16,0.86)")).toBe(true);
  });

  it("头部四行三档色:#e8e8e8 / #ffd76a / #8f9bb3(后两行同取一档)", () => {
    expect([D.ptEcho, D.ptAvail, D.ptMeta]).toEqual(["#E8E8E8", "#FFD76A", "#8F9BB3"]);
    expect(draw.includes('g.fillStyle = "#e8e8e8"')).toBe(true);
    expect(draw.includes('g.fillStyle = "#ffd76a"')).toBe(true);
    expect(draw.includes('g.fillStyle = "#8f9bb3"')).toBe(true);
  });

  it("页签两档四件 + 两档字色与 Web 同串", () => {
    expect(D.ptTabSelFill).toBe("rgba(192,108,255,0.25)");
    expect(D.ptTabSelStroke).toBe("#C06CFF");
    expect(D.ptTabFill).toBe("rgba(255,255,255,0.04)");
    expect(D.ptTabStroke).toBe("rgba(255,255,255,0.15)");
    expect(D.ptTabTextSel).toBe("#C06CFF");
    expect(D.ptTabText).toBe("#8F9BB3");
    expect(draw.includes('sel ? "rgba(192,108,255,0.25)" : "rgba(255,255,255,0.04)"')).toBe(true);
    expect(draw.includes('sel ? "#c06cff" : "rgba(255,255,255,0.15)"')).toBe(true);
    expect(draw.includes('sel ? "#c06cff" : "#8f9bb3"')).toBe(true);
  });

  it("节点行两档底板与名字两档与右列三档与描述一档", () => {
    expect(D.ptRowOwnedFill).toBe("rgba(77,255,200,0.10)");
    expect(D.ptRowOwnedStroke).toBe("#4DFFC8");
    expect(D.ptRowFill).toBe("rgba(255,255,255,0.04)");
    expect(D.ptRowStroke).toBe("rgba(255,255,255,0.12)");
    expect(D.ptRowNameOwned).toBe("#4DFFC8");
    expect(D.ptRowName).toBe("#E8E8E8");
    expect(D.ptOwnedText).toBe("#4DFFC8");
    expect(D.ptCostAfford).toBe("#FFD76A");
    expect(D.ptCostLocked).toBe("#5A6A80");
    expect(D.ptDesc).toBe("#9AA7BD");
    expect(draw.includes('owned ? "rgba(77,255,200,0.10)" : "rgba(255,255,255,0.04)"')).toBe(true);
    expect(draw.includes('owned ? "#4dffc8" : "rgba(255,255,255,0.12)"')).toBe(true);
    expect(draw.includes('owned ? "#4dffc8" : "#e8e8e8"')).toBe(true);
    expect(draw.includes('affordable ? "#ffd76a" : "#5a6a80"')).toBe(true);
    expect(draw.includes('g.fillStyle = "#9aa7bd"')).toBe(true);
  });

  it("开局配置块:未选档三件两块共用,选中档底与描边分两色、文字同为 #0b0e14", () => {
    expect([D.ptChoiceBg, D.ptChoiceStroke, D.ptChoiceText, D.ptChoiceTextSel]).toEqual(["#2A3D55", "rgba(255,255,255,0.2)", "#CFCFCF", "#0B0E14"]);
    expect(D.ptTriggerSelBg).toBe("#FFD76A");
    expect(D.ptTriggerSelStroke).toBe("#FFD76A");
    expect(D.ptEffectSelBg).toBe("#4DFFC8");
    expect(D.ptEffectSelStroke).toBe("#4DFFC8");
    expect(D.ptChoiceLabel).toBe("#8F9BB3");
    expect(draw.includes('sel ? "#ffd76a" : "#2a3d55"')).toBe(true);
    expect(draw.includes('sel ? "#4dffc8" : "#2a3d55"')).toBe(true);
    expect(draw.includes('sel ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.2)"') || draw.includes('sel ? "#ffd76a" : "rgba(255,255,255,0.2)"')).toBe(true);
    expect(draw.includes('g.fillStyle = sel ? "#0b0e14" : "#cfcfcf"')).toBe(true);
  });

  it("开始新轮回钮三件:#2a3d55 底 + #5ac8fa 描边 + 白字,描边宽度 2 在共享层", () => {
    expect([D.ptStartBg, D.ptStartStroke, D.ptStartText]).toEqual(["#2A3D55", "#5AC8FA", "#FFFFFF"]);
    expect(PT_START_STROKE_W).toBe(2);
    expect(draw.includes('g.fillStyle = "#2a3d55"')).toBe(true);
    expect(draw.includes('g.strokeStyle = "#5ac8fa"')).toBe(true);
    expect(draw.includes("g.lineWidth = 2;")).toBe(true);
    expect(draw.includes("g.lineWidth = 1;")).toBe(true);
  });

  it("表里只有色与字形,不含几何数:33 键全以 # 或 rgba 起头", () => {
    for (const [k, v] of Object.entries(D)) {
      if (!k.startsWith("pt")) continue;
      expect(/^#[0-9A-Fa-f]{6}$|^rgba?\(/.test(v), k).toBe(true);
    }
  });
});

/* ==================== 14. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = ["../cocos-prototype/assets/scripts/game/ui/prestigeLayout.ts", "../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts"];

describe("纯布局与宿主模型 cc-free", () => {
  for (const rel of PURE_FILES) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    it(`${rel.split("/").pop()}:无 cc / 无 Canvas2D / 无 DOM 全局 / 无 @game 别名`, () => {
      expect(CC_IMPORT.test(src), "不得 import cc").toBe(false);
      expect(CTX_TYPE.test(src), "不得用 CanvasRenderingContext2D").toBe(false);
      expect(DOM_GLOBAL.test(src), "不得用 DOM/宿主全局").toBe(false);
      expect(ABSOLUTE_GAME.test(src), "内部不得用 @game/ 别名").toBe(false);
    });
  }

  it("共享层不读存档:路线 id 序列与两个块标志都是入参", () => {
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/game/ui/prestigeLayout.ts", import.meta.url), "utf8"));
    for (const bad of ["save.", "ownedTalents", "persistSave", "this.save", "talentOf(", "currentTalentRoute"]) expect(src.includes(bad), bad).toBe(false);
  });

  it("共享层不查拥有态:两个块标志只出现在入参与回读里", () => {
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/game/ui/prestigeLayout.ts", import.meta.url), "utf8"));
    expect(src.includes("owns(")).toBe(false);
    expect(src.includes("includes(\"blueprint\")")).toBe(false);
    expect(src.includes("includes(\"targeted_search\")")).toBe(false);
  });

  it("模型不写存档、不碰广告通道、不碰路由", () => {
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    for (const bad of ["ownedTalents.push", "points -=", "persist(", "persistSave", "writeSave", "watchAd", "showRewardedAd", "localStorage", "router.show", "restart("]) {
      expect(src.includes(bad), bad).toBe(false);
    }
  });

  it("模型不复制判据:定价、层级门、图鉴分母全部转调既有函数", () => {
    const src = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    expect(src.includes("availablePoints(")).toBe(true);
    expect(src.includes("isTierUnlocked(")).toBe(true);
    expect(src.includes("routeCost(")).toBe(true);
    expect(src.includes("routeOf(")).toBe(true);
    expect(src.includes("talentOf(")).toBe(true);
    // 没有任何一处把定价或分母写成字面量(插值串除外)
    expect(src.includes("cost: ")).toBe(false);
    expect(src.includes("/ 6 ")).toBe(false);
    expect(src.includes("/ 14 ")).toBe(false);
    expect(src.includes("/ 8 ")).toBe(false);
    expect(src.includes("/ 134")).toBe(false);
  });
});

/* ==================== 15. 视图层纪律 ==================== */

describe("PrestigeView 的纪律:几何全来自共享层、文本只走 placeLine、没有返回钮", () => {
  const src = readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeView.ts", import.meta.url), "utf8");
  const code = codeOf(src);

  it("视图不产几何:不自算 startBtn / blockTop / tabW,一律读 layout", () => {
    for (const bad of ["blockTop", "startBtn.y = ", "h - ui.pad", "tabW =", "(w - pad"]) expect(code.includes(bad), bad).toBe(false);
    for (const good of ["L.startBtn", "L.rows", "L.tabs", "L.triggerBtns", "L.effectBtns", "L.startText", "L.pose", "L.tabsStrip"]) expect(code.includes(good), good).toBe(true);
  });

  it("文本只有 placeLine 一个入口,贴图键都收在常量里", () => {
    expect(code.includes("placeLine(")).toBe(true);
    expect(code.includes("new Label(")).toBe(false);
    for (const k of ["banner_purple_cosmic", "player_pose_5", "tabs_talent_three", "mark_check_green"]) expect(src.includes(`"${k}"`), k).toBe(true);
  });

  it("开始新轮回钮的描边宽度取共享层那一档(不在视图里写 2)", () => {
    expect(code.includes("PT_START_STROKE_W")).toBe(true);
    expect(code.includes(", 2)")).toBe(false);
  });

  it("本屏没有返回钮与 back 动作", () => {
    expect(code.includes("backBtn")).toBe(false);
    expect(code.includes('"back"')).toBe(false);
    expect(code.includes("btn_back")).toBe(false);
  });

  it("命中判定转调模型,视图不自己比矩形", () => {
    expect(code.includes("hitPrestige(")).toBe(true);
    expect(code.includes("x >= ")).toBe(false);
  });

  it("Capture 建在最后,行池与两块钮都在它之前(节点次序决定热区不被盖住)", () => {
    expect(code.indexOf("this.rowsNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.makeGroup(\"Trigger\"")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.start = ")).toBeLessThan(code.indexOf("this.capture = makeNode"));
  });
});

/* ==================== 16. 宿主接线:五件套 + 路由注册 + 占位提示下线 ==================== */

describe("GameShell 的转生与天赋屏接线", () => {
  const src = readFileSync(new URL("../cocos-prototype/assets/scripts/GameShell.ts", import.meta.url), "utf8");
  const pending = src.slice(src.indexOf("const PENDING_SCREEN"), src.indexOf("/** 回响筹码下标"));

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildPrestigeScreen", "prestigeSave", "openPrestige", "syncPrestige", "onPrestigeAction", "commitPrestigeClaim"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildPrestigeScreen();")).toBe(true);
    expect(src.indexOf("this.buildPrestigeScreen();")).toBeGreaterThan(src.indexOf("this.buildGachaScreen();"));
    expect(src.includes("prestige: () => this.syncPrestige(),")).toBe(true);
    expect(src.includes('"gacha", "prestige", "commission"]')).toBe(true);
  });

  it("路由实际注册十一屏(SCREEN_KEYS 仍是 16 态全量)", () => {
    const router = readFileSync(new URL("../cocos-prototype/assets/scripts/core/ScreenRouter.ts", import.meta.url), "utf8");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    // 八个屏走 sync*(heroes 除外:它走 syncHeroes;这里数的是箭头里直接调 syncX 的那八条)
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(8);
    expect(hooks.includes("menu: () => this.refreshMenu(),")).toBe(true);
    expect(hooks.includes("shop: () => this.shopView?.sync(),")).toBe(true);
  });

  it("入口从占位轻提示换成 openPrestige,PENDING_SCREEN 里不再有 talent 键", () => {
    expect(src.includes('if (a.entry === "talent")')).toBe(true);
    expect(src.includes("this.openPrestige();")).toBe(true);
    expect(src.includes("天赋尚未开放")).toBe(false);
    expect(pending.includes("talent:")).toBe(false);
    expect(pending.includes("fusion:")).toBe(true);
    expect(pending.split("\n").filter((l) => /: "/.test(l))).toHaveLength(1);
  });

  it("几何与内容都经宿主投影现算(视图不读存档)", () => {
    const seg = src.slice(src.indexOf("private buildPrestigeScreen"), src.indexOf("private prestigeSave"));
    expect(seg.includes("prestigeScreenLayout(DESIGN_W, logicalH()")).toBe(true);
    expect(seg.includes("prestigeRouteIds(this.talentRoute)")).toBe(true);
    expect(seg.includes("s.hasBlueprint, s.hasTargetedSearch")).toBe(true);
    expect(seg.includes("buildPrestigeContent(this.prestigeSave(), this.talentRoute, this.runConfig, L)")).toBe(true);
    const slice = src.slice(src.indexOf("private prestigeSave"), src.indexOf("private openPrestige"));
    for (const f of ["points: s.points", "ownedTalents: s.ownedTalents", "collection: s.collection"]) expect(slice.includes(f), f).toBe(true);
    expect(slice.includes("prestigeBlocks(s)")).toBe(true);
  });

  it("两份瞬时态都挂在宿主上且不入档", () => {
    expect(src.includes('private talentRoute: PtRouteKey = "builder";')).toBe(true);
    expect(src.includes("private runConfig: PrestigeRunConfig = {};")).toBe(true);
    expect(src.includes("private prestigeView: PrestigeView | null = null;")).toBe(true);
    // 落盘只发生在买天赋那一档(切到下一屏的分节标题为止,这一段就是本屏的 commit 函数)
    const commit = src.slice(src.indexOf("private commitPrestigeClaim"), src.indexOf("/* ================= 委托挂机屏"));
    expect(commit.includes("this.sim?.persist();")).toBe(true);
    expect(commit.includes("save.ownedTalents.push(claim.id);")).toBe(true);
    expect(commit.includes("this.sim?.world.applyTalentBonuses();")).toBe(true);
    expect(commit.includes("save.points")).toBe(false);
    expect(commit.includes("prestiges")).toBe(false);
  });

  it("本屏不走广告入口(没有为它新增 watchAd 调用)", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 转生与天赋屏"), src.indexOf("/* ================= 委托挂机屏")));
    expect(seg.includes("watchAd")).toBe(false);
    expect(seg.includes("this.commitPrestigeClaim(claim)")).toBe(true);
  });

  it("开始新轮回走既有的 restartRun;结算只发生在 restartRun 首行(Web restart() 同位)且排在开新局之前", () => {
    const seg = src.slice(src.indexOf("private onPrestigeAction"), src.indexOf("private commitPrestigeClaim"));
    expect(seg.includes("this.restartRun();")).toBe(true);
    // 屏层自己不结这笔账、也不直接写 prestiges —— 账由 restartRun 首行那一处统一结
    expect(seg.includes("settlePendingRun();"), "onPrestigeAction 里没有结算调用(注释里提到这个词不算)").toBe(false);
    expect(seg.includes("prestiges +=")).toBe(false);
    expect(seg.includes("prestiges -=")).toBe(false);
    const restart = src.slice(src.indexOf("private restartRun()"), src.indexOf("private restartRun()") + 900);
    expect(restart.includes("sim.settlePendingRun();"), "restartRun 首行结算,与 Web restart() 同位").toBe(true);
    expect(restart.indexOf("settlePendingRun"), "结算必须排在 startStage 之前,否则 startRun 会清掉挂起标记").toBeLessThan(restart.indexOf("startStage"));
    const shell = src.slice(src.indexOf("private openPrestige"), src.indexOf("private syncPrestige"));
    expect(shell.includes("settle")).toBe(false);
  });
});

/* ==================== 17. 与 Web 的对照:反直觉口径 ==================== */

describe("Web 基准的几条反直觉口径已原样带上", () => {
  const web = webSource();
  const layout = web.slice(web.indexOf("private prestigeLayout()"), web.indexOf("private drawPrestige("));
  const draw = web.slice(web.indexOf("private drawPrestige("), web.indexOf("private onPrestigeClick("));
  const click = web.slice(web.indexOf("private onPrestigeClick("), web.indexOf("/* ---------- 融合界面"));

  it("Web 的 onPrestigeClick 里没有 backBtn、也没有 Escape 分支:本屏确实没有返回路径", () => {
    expect(click.includes("back")).toBe(false);
    expect(click.includes("hitPanelBack")).toBe(false);
    expect(click.includes("overlayFrom")).toBe(false);
    const occ: number[] = [];
    for (let i = web.indexOf('this.state === "prestige"'); i >= 0; i = web.indexOf('this.state === "prestige"', i + 1)) occ.push(i);
    expect(occ.length).toBe(4);
    // 四处出现里只有键盘分发那一支的正文里带 e.key
    const branches = occ.map((i) => web.slice(i, web.indexOf("} else if", i)));
    const kb = branches.filter((s) => s.includes("e.key"));
    expect(kb).toHaveLength(1);
    expect(kb[0].includes('e.key.toLowerCase() === "r"')).toBe(true);
    expect(kb[0].includes("Escape")).toBe(false);
    expect(kb[0].includes("startNewRun")).toBe(true);
    // 点击分发那一支只有一句 onPrestigeClick,没有任何返回出口
    expect(branches[0].includes("onPrestigeClick")).toBe(true);
    expect(branches[0].includes("back")).toBe(false);
  });

  it("Web 的两个条件块各吃 46px,并且 blockTop 只减不返回", () => {
    expect(layout.includes('let blockTop = startBtn.y - 10;')).toBe(true);
    expect((layout.match(/blockTop -= 46;/g) ?? []).length).toBe(2);
    expect(layout.includes('if (this.owns("blueprint"))')).toBe(true);
    expect(layout.includes('if (this.owns("targeted_search"))')).toBe(true);
  });

  it("Web 的 spreadRows 只传五个实参(maxGap 走默认 20)", () => {
    expect(layout.includes("spreadRows(route.length, listY0, blockTop - 8, 40, 64)")).toBe(true);
    const call = /spreadRows\(([^)]*)\)/.exec(layout.slice(layout.indexOf("spreadRows(route.length")))!;
    expect(call[1].split(",").map((s) => s.trim())).toEqual(["route.length", "listY0", "blockTop - 8", "40", "64"]);
  });

  it("Web 的 affordable 是三个条件的合取", () => {
    expect(draw.includes("const affordable = !owned && avail >= n.cost && isTierUnlocked(this.save.ownedTalents, n.tier, this.currentTalentRoute());")).toBe(true);
  });

  it("Web 的 buyTalent 用 routeOf(id) 而非当前系作为层级门的实参", () => {
    const buy = web.slice(web.indexOf("private buyTalent("), web.indexOf("private startNewRun("));
    expect(buy.includes("isTierUnlocked(this.save.ownedTalents, node.tier, routeOf(id))")).toBe(true);
    expect(buy.includes("this.world.applyTalentBonuses();")).toBe(true);
    expect(buy.includes("this.save.points -=")).toBe(false);
    expect(buy.includes("prestiges")).toBe(false);
  });

  it("Web 的 startNewRun 就是 restart,而 restart 的结算有 pendingSettle 守在前头", () => {
    const s = web.slice(web.indexOf("private startNewRun("), web.indexOf("/* ================= 渲染"));
    expect(s.includes("this.restart();")).toBe(true);
    const r = web.slice(web.indexOf("private restart(): void {"), web.indexOf("private restart(): void {") + 260);
    expect(r.includes("this.settlePendingRun();")).toBe(true);
    const sp = web.slice(web.indexOf("private settlePendingRun()"), web.indexOf("private settlePendingRun()") + 220);
    expect(sp.includes("if (!this.pendingSettle) return;")).toBe(true);
    const sr = web.slice(web.indexOf("private settleRun(): void {"), web.indexOf("private recordEquipment("));
    expect(sr.includes("this.save.prestiges += 1;")).toBe(true);
    expect(sr.includes("this.pendingSettle = false;")).toBe(true);
  });

  it("Web 的 runConfig 与 talentRoute 都是 Game 的 private 字段,不在 SaveData 里", () => {
    expect(web.includes('private runConfig: { targetTrigger?: TriggerType; blueprintEffect?: EffectType } = {};')).toBe(true);
    expect(web.includes('private talentRoute: "builder" | "efficient" | "conqueror" = "builder";')).toBe(true);
    const saveSrc = readFileSync(new URL("../src/systems/save.ts", import.meta.url), "utf8");
    for (const bad of ["runConfig", "talentRoute", "targetTrigger", "blueprintEffect"]) expect(saveSrc.includes(bad), bad).toBe(false);
  });

  it("Web 的 targetTrigger 只有声明 / 绘制 / 点击三处,没有任何玩法消费方", () => {
    // targetTrigger 4 次:声明 1 + 绘制选中态 1 + 点击那一行 2(同值比较与赋值)
    expect((web.match(/targetTrigger/g) ?? []).length).toBe(4);
    // blueprintEffect 5 次:上述 4 次之外,makeStarter 还有一处真消费
    expect((web.match(/blueprintEffect/g) ?? []).length).toBe(5);
    expect(web.includes("makeStarterEquipment(this.runConfig.blueprintEffect ?? \"knife\")")).toBe(true);
    expect(web.includes("makeStarterEquipment(this.runConfig.targetTrigger")).toBe(false);
  });

  it("Web 的勾选标记位置依赖 measureText,Cocos 侧用近似量字(两端不同源,已在文档挂账)", () => {
    expect(draw.includes('const ow = g.measureText("已拥有").width;')).toBe(true);
    expect(draw.includes("r.x + r.w - 12 - ow - 17")).toBe(true);
    expect(draw.includes("l1 - 12")).toBe(true);
  });

  it("Web 4284-4285 那一处 fillStyle + font 设完立刻被下一行覆盖(死状态,不复现)", () => {
    const dead = draw.slice(draw.indexOf("// 层级徽标"), draw.indexOf("// 价格/状态"));
    expect(dead.includes('g.fillStyle = "#8f9bb3"')).toBe(true);
    expect(dead.includes("F(fs.micro)")).toBe(true);
    // 两个死赋值之后紧接着又设一次 font,而 fillStyle 到下一笔之前没有 fillText
    expect(dead.includes("fillText")).toBe(false);
    const model = codeOf(readFileSync(new URL("../cocos-prototype/assets/scripts/prestige/PrestigeModel.ts", import.meta.url), "utf8"));
    expect(model.includes("层级徽标")).toBe(false);
  });

  it("Web 的头部立绘压在头部区、且画在四行文字之前(覆盖次序)", () => {
    expect(draw.indexOf('this.assets.draw(g, "player_pose_5", 252, 4, 38, 60)')).toBeLessThan(draw.indexOf("回响点数"));
    expect(draw.indexOf('g.fillText(`可支配')).toBeGreaterThan(draw.indexOf("player_pose_5"));
  });
});

/* ==================== 18. 几何常量的出处(逐项钉住 Web 的那批裸加数) ==================== */

describe("共享层导出的几何常量逐项对上 Web", () => {
  const web = webSource();
  const layout = web.slice(web.indexOf("private prestigeLayout()"), web.indexOf("private drawPrestige("));

  it("Web 的实参串里能找到每一个数", () => {
    expect(layout.includes("{ x: w / 2 - 130, y: h - pad - 52, w: 260, h: 52 }")).toBe(true);
    expect(layout.includes("const listY0 = 156;")).toBe(true);
    expect(layout.includes("y: 120, w: tabW, h: 30")).toBe(true);
    expect(layout.includes("const tabW = (w - pad * 2) / 3;")).toBe(true);
    expect(layout.includes("const bw = (w - pad * 2 - 7 * 4) / 8;")).toBe(true);
    expect(layout.includes("const bw = (w - pad * 2 - 5 * 6) / 6;")).toBe(true);
    expect(layout.includes("y: blockTop + 18, w: bw, h: 28")).toBe(true);
    expect(layout.includes("y: listY0 + i * (rowH + gap)")).toBe(true);
  });

  it("共享层常量的值就是那一批裸加数", () => {
    expect([PT_LIST_Y0, PT_ROWS_BOTTOM_DY, PT_ROW_MIN_H, PT_ROW_MAX_H]).toEqual([156, 8, 40, 64]);
    expect([PT_BTN_DY, PT_BTN_H, PT_EFFECT_GAP, PT_TRIGGER_GAP]).toEqual([18, 28, 4, 6]);
    expect([PT_NAME_DX, PT_NAME_MAX_W, PT_RIGHT_DX, PT_DESC_DX, PT_DESC_MAX_DX]).toEqual([8, 150, 8, 8, 24]);
    expect([PT_MARK_SIZE, PT_MARK_INSET, PT_MARK_GAP]).toEqual([13, 12, 17]);
    expect(PT_AVAIL_DX).toBe(210);
    expect([PT_ECHO_BASE_Y, PT_ROUTE_BASE_Y, PT_COLL_BASE_Y]).toEqual([60, 82, 100]);
  });

  it("共享层出口就是 prestigeLayout 本身(视图没有第二个几何源)", () => {
    const a = prestigeLayout(W, H_STD, routeIds("builder"), true, true);
    const b = prestigeScreenLayout(W, H_STD, routeIds("builder"), true, true);
    expect(b).toEqual(a);
  });
});

/* ==================== 19. 状态维度的联动矩阵(本屏比前五屏多出的那几轴) ==================== */

describe("页签 × 两个条件块 × 开局配置开关的联动", () => {
  /** 五节点全买:两块都在的那一份存档 */
  const CHAIN: TalentId[] = ["quick_start", "affix_taste", "targeted_search", "reforge", "blueprint"];

  it("切系不改两个条件块在不在:两块只由 ownedTalents 决定", () => {
    const s = save({ points: 300, ownedTalents: CHAIN });
    for (const r of ROUTES) {
      const ids = prestigeRouteIds(r);
      const L = prestigeLayout(W, H_STD, ids, prestigeBlocks(s).hasBlueprint, prestigeBlocks(s).hasTargetedSearch);
      expect(L.hasBlueprint).toBe(true);
      expect(L.hasTargetedSearch).toBe(true);
      expect(L.triggerBtns).toHaveLength(6);
      expect(L.effectBtns).toHaveLength(8);
      expect(L.rowsBottom).toBe(prestigeLayout(W, H_STD, routeIds("builder"), true, true).rowsBottom);
    }
  });

  it("行区几何随系长但三系同长:切系只换行的 id 序列,不换 rowH / gap", () => {
    const s = save({ points: 300, ownedTalents: CHAIN });
    const base = prestigeLayout(W, H_STD, prestigeRouteIds("builder"), true, true);
    for (const r of ROUTES) {
      const L = prestigeLayout(W, H_STD, prestigeRouteIds(r), prestigeBlocks(s).hasBlueprint, prestigeBlocks(s).hasTargetedSearch);
      expect([L.rowH, L.rowGap, L.rowsEnd]).toEqual([base.rowH, base.rowGap, base.rowsEnd]);
    }
  });

  it("六格 × 三系共 24 个组合下,内容行数恒等于几何行数、且逐位同 id", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        for (const r of ROUTES) {
          const ids = routeIds(r);
          const L = prestigeLayout(W, h, ids, bp, ts);
          const c = buildPrestigeContent(save({ points: 400, ownedTalents: bp || ts ? CHAIN : [] }), r, cfg(), L);
          expect(c.rows).toHaveLength(L.rows.length);
          expect(c.rows.map((x) => x.id)).toEqual(L.rows.map((x) => x.id));
          expect(c.tabs).toHaveLength(L.tabs.length);
          expect(c.triggerBtns).toHaveLength(L.triggerBtns.length);
          expect(c.effectBtns).toHaveLength(L.effectBtns.length);
        }
      }
    }
  });

  it("两枚开关各自往返:点同一枚第二次取消、再点一次选回,且不动另一枚", () => {
    let c = cfg({ targetTrigger: "pulse", blueprintEffect: "knife" }) as PrestigeRunConfig;
    // 第一次点已选中的那一枚 = 取消
    const off = prestigeClaim(save(), c, { kind: "trigger", type: "pulse" })!;
    expect(off).toEqual({ kind: "trigger", persists: false, targetTrigger: undefined });
    expect(off.persists).toBe(false);
    c = { ...c, targetTrigger: (off as { targetTrigger?: TriggerType }).targetTrigger };
    expect(c).toEqual({ targetTrigger: undefined, blueprintEffect: "knife" });
    // 第二次点同一枚 = 选回来
    const on = prestigeClaim(save(), c, { kind: "trigger", type: "pulse" })!;
    expect((on as { targetTrigger?: TriggerType }).targetTrigger).toBe("pulse");
    // 效果钮的往返独立:取消蓝图不影响刚选回的触发器
    const eff = prestigeClaim(save(), { ...c, targetTrigger: "pulse" }, { kind: "effect", type: "knife" })!;
    expect(eff).toEqual({ kind: "effect", persists: false, blueprintEffect: undefined });
    const eff2 = prestigeClaim(save(), { targetTrigger: "pulse" }, { kind: "effect", type: "ray" })!;
    expect((eff2 as { blueprintEffect?: EffectType }).blueprintEffect).toBe("ray");
    expect(eff2).toEqual({ kind: "effect", persists: false, blueprintEffect: "ray" });
  });

  it("选中态由开关值决定,与拥有态无关:没买蓝图也不会有人画那八枚(几何侧为空)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    const c = buildPrestigeContent(save(), "builder", cfg({ blueprintEffect: "nova" }), L);
    expect(c.effectBtns).toEqual([]);
    expect(c.hasBlueprint).toBe(false);
    // 值还在,只是这一档没有承载它的钮
    expect(c.startText).toBe("开始新轮回 (R)");
  });

  it("图鉴四个分母的导出口与内容串同数:模型给的四个分母就是四个表长", () => {
    const t = prestigeCollectionTotalsExported();
    const s = save({ collection: collection(2, 3, 4, 5) });
    const c = buildPrestigeContent(s, "builder", cfg(), prestigeLayout(W, H_STD, routeIds("builder"), false, false));
    expect(c.collText).toBe(`图鉴:触发器 2/${t.triggers} · 效果 3/${t.effects} · 修饰器 4/${t.modifiers} · 敌方 5/${t.enemies}`);
    for (const n of [0, 1, 5]) {
      const c2 = buildPrestigeContent(save({ collection: collection(n, n, n, n) }), "builder", cfg(), prestigeLayout(W, H_STD, routeIds("builder"), false, false));
      expect(c2.collText).toBe(`图鉴:触发器 ${n}/${t.triggers} · 效果 ${n}/${t.effects} · 修饰器 ${n}/${t.modifiers} · 敌方 ${n}/${t.enemies}`);
    }
  });

  it("行区预算随屏高单调放宽:1246 档的末行底边不晚于、预算底缘不早于 996 档", () => {
    for (const [bp, ts] of BLOCKS) {
      const a = prestigeLayout(W, H_STD, routeIds("builder"), bp, ts);
      const b = prestigeLayout(W, H_TALL, routeIds("builder"), bp, ts);
      expect(b.rowsBottom).toBeGreaterThan(a.rowsBottom);
      expect(b.rowH).toBeGreaterThanOrEqual(a.rowH);
      expect(b.rowGap).toBeGreaterThanOrEqual(a.rowGap);
      expect(b.rowsEnd).toBeGreaterThanOrEqual(a.rowsEnd);
    }
  });

  it("开始新轮回钮永远在行区与两块之下、且与屏底留 pad 的让位", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const [bp, ts] of BLOCKS) {
        const L = prestigeLayout(W, h, routeIds("builder"), bp, ts);
        expect(L.startBtn.y).toBeGreaterThan(L.rowsEnd);
        expect(L.startBtn.y).toBe(L.rowsBottom + PT_ROWS_BOTTOM_DY + PT_BLOCK_DY + PT_BLOCK_H * (bp ? 1 : 0) + PT_BLOCK_H * (ts ? 1 : 0));
        expect(L.startBtn.y + L.startBtn.h).toBe(h - PAD);
        expect(L.startText.x).toBe(W / 2);
      }
    }
  });

  it("行右列两档互斥:owned 真时 affordable 必假(模型不会给出两档同真的行)", () => {
    const L = prestigeLayout(W, H_STD, routeIds("builder"), false, false);
    const s = save({ points: 400, ownedTalents: ["quick_start", "affix_taste"] });
    const c = buildPrestigeContent(s, "builder", cfg(), L);
    for (const r of c.rows) expect(r.owned && r.affordable).toBe(false);
    expect(c.rows.filter((r) => r.owned).map((r) => r.id)).toEqual(["quick_start", "affix_taste"]);
    expect(c.rows.filter((r) => r.affordable).length).toBeGreaterThan(0);
  });

  it("路由与几何同源的最后一条保证:命中一行的 id 与该行内容给出的 id 相同", () => {
    const L = prestigeLayout(W, H_TALL, routeIds("conqueror"), true, true);
    const c = buildPrestigeContent(save({ points: 400 }), "conqueror", cfg(), L);
    for (let i = 0; i < L.rows.length; i++) {
      const a = hitPrestige(L, center(L.rows[i].rect).x, center(L.rows[i].rect).y)!;
      expect(a.kind === "buy" && a.id).toBe(c.rows[i].id);
    }
  });
});

/** 直接引模型那份导出口(与本地表长取数对照,锁住"分母不写死") */
function prestigeCollectionTotalsExported() {
  return prestigeCollectionTotals();
}
