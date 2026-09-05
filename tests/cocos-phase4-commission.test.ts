/**
 * Phase 4 第七屏闸门:委托挂机屏(双形态互斥 + 派遣 / 领取 / 放弃入档 + 选中态瞬时 + 实时时序)。
 *
 * 延续 cocos-phase4-leaderboard / -daily / -pass / -gearup / -gacha / -prestige 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `commission/CommissionModel.ts` 经相对路径 import 的共享层
 *     (`game/data/commissions` 的区域表 / 难度表 / 衰减曲线 / 结算函数、`game/data/talents` 的
 *     四个加成推导、`game/ui/commissionLayout`),与 Web 侧经 `@game` 别名 import 的是同一个模块
 *     实例(函数引用 `toBe` 相同),于是产出、失败率、券数与解锁门不可能出现"两份抄本";
 *  2. **断言按门控变量分档**:面板条数 = 活动槽位数(0 / 1 / 2)、区域解锁由 `prestiges` 与
 *     `ownedTalents` 决定、兑换钮由 `fragments` 决定、产出分流由区域的 `givesStardust` /
 *     `givesDiamond` 决定 —— 全部由存档与共享层表推出,不钉死随表变动的数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `CommissionModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 本屏的重点是**六格几何矩阵**:`h ∈ {996, 1246} × 分支 ∈ {列表态, 1 个面板, 2 个面板}` 六格各自
 * 钉死 `rowH` / `gap` / 末行底边 / `diffY` / 开始钮底边 / 面板底边 / 各钮 x 与 w,以及横向边界。
 * 这些数字按 `game/ui/theme.ts:spreadRows` 的真实实现算出并由本文件实测(不是推算):每格都同时用
 * `spreadRows` 直算一遍与布局函数对照。矩阵同时锁住一条 Web 既有特性 —— 区域行是**顶边 100 起、
 * 行高被 `maxH = 88` 封顶**,而开始钮与难度行是**底边锚定 h**,所以 1246 档下区域行的矩形与 996 档
 * 逐字相同,多出来的 250px 全部落在末行底边与难度说明基线之间的空档里。
 *
 * 另锁本屏照抄的 Web 口径:双形态互斥(有槽位时列表侧四件一个都不画)、面板态下兑换钮照画却不参与
 * 命中、开始钮与锁定行的三处静默、领取的三种产出分流与券数与失败减半、放弃只清槽、时间与随机源都是
 * 入参、选中的区域与难度是不入档的会话级瞬时态、两条字面量文案。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import {
  COMMISSION_DECAY,
  COMMISSION_MAX_HOURS,
  COMMISSION_READY_HOURS,
  COMMISSION_TICKET_HOURS,
  COMMISSION_TICKET_MIN,
  DIFFICULTIES,
  FRAGMENT_TO_STARDUST,
  REGIONS,
  accruedReward,
  collectReward,
  commissionTickets,
  difficultyOf,
  effectiveHours,
  regionOf,
  regionUnlocked,
  type CommissionState,
  type RegionId,
} from "@game/data/commissions";
import { BUILDER_ROUTE, EFFICIENT_ROUTE, commissionSpeedFor, commissionTimeScaleFor, offlineBonusFor, uncappedCommissionFor, type TalentId } from "@game/data/talents";
import { fs as FS, rowTextY, spreadRows, ui as PAD_ } from "@game/ui/theme";
import {
  CM_BACK_ICON_DX,
  CM_BACK_ICON_SHRINK,
  CM_BACK_TEXT_DY,
  CM_BACK_Y,
  CM_BANNER_H,
  CM_BANNER_TEXT_DY,
  CM_BANNER_W,
  CM_BAR_DY,
  CM_BAR_DX,
  CM_BAR_H,
  CM_BAR_W,
  CM_DIFF_GAP_X,
  CM_DIFF_H,
  CM_DIFF_LABEL_DY,
  CM_DIFF_N,
  CM_DIFF_TEXT_DY1,
  CM_DIFF_TEXT_DY2,
  CM_EXCHANGE_H,
  CM_EXCHANGE_W,
  CM_EXCHANGE_Y,
  CM_ICON_SIZE,
  CM_L1_DY,
  CM_L2_DY,
  CM_NAME_MAX_W,
  CM_PANEL_BTN_GAP,
  CM_PANEL_BTN_H,
  CM_PANEL_BTN_W,
  CM_PANEL_GAP,
  CM_PANEL_H,
  CM_PANEL_LINE1_DY,
  CM_PANEL_LINE2_DY,
  CM_PANEL_LINE3_DY,
  CM_PANEL_NINE,
  CM_PANEL_TOP_Y,
  CM_POSE_H,
  CM_POSE_W,
  CM_POSE_X,
  CM_POSE_Y,
  CM_PRESTIGES_DX,
  CM_RES_BASE_Y,
  CM_ROW_MAX_H,
  CM_ROW_MIN_H,
  CM_ROWS_BOTTOM_DY,
  CM_ROWS_Y0,
  CM_START_H,
  CM_START_HALF_W,
  CM_START_STROKE_W,
  CM_START_UP,
  CM_START_W,
  CM_STARDUST_DX,
  CM_TITLE_BASE_Y,
  commissionBarRects,
  commissionDiffY,
  commissionLayout,
  commissionRowsBottom,
  commissionScreenLayout,
  commissionStartBtn,
  type CmRect,
  type CmTextLine,
  type CommissionLayout,
} from "@game/ui/commissionLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import {
  COMMISSION_DECAY_NOTE,
  COMMISSION_DEFAULT_SELECTION,
  COMMISSION_START_TEXT,
  buildCommissionContent,
  commissionBonus,
  commissionClaim,
  commissionExchangeCount,
  commissionOwns,
  commissionRegionOpen,
  commissionSlots,
  commissionUnlockNote,
  commissionUnit,
  hitCommission,
  type CommissionAction,
  type CommissionSaveView,
  type CommissionSelection,
} from "../cocos/assets/scripts/commission/CommissionModel";
import * as cocosCommissions from "../cocos/assets/scripts/game/data/commissions";
import * as cocosCommissionLayout from "../cocos/assets/scripts/game/ui/commissionLayout";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = PAD_.pad;
/** 钉死的时间源:模型不读 Date.now(),所有涉及时间的断言都拿这一个数 */
const NOW = 1800000000000;
const HOUR = 3600000;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/* ==================== 夹具 ==================== */

/** 三个分支:活动槽位数 0 / 1 / 2 */
const BRANCHES: readonly number[] = [0, 1, 2];

function save(over: Partial<CommissionSaveView> = {}): CommissionSaveView {
  return { fragments: 0, stardust: 0, prestiges: 0, ownedTalents: [], commission: null, commission2: null, ...over };
}

const sel = (over: Partial<CommissionSelection> = {}): CommissionSelection => ({ ...COMMISSION_DEFAULT_SELECTION, ...over });

function comm(region: RegionId = "plains", difficulty = 1, hoursAgo = 0): CommissionState {
  return { region, difficulty, startedAt: NOW - hoursAgo * HOUR };
}

/** 一份带 n 个活动槽位的存档(槽位顺序就是 Web `activeCommissionSlots` 的顺序) */
function withSlots(n: number, over: Partial<CommissionSaveView> = {}): CommissionSaveView {
  const s = save(over);
  if (n > 0) s.commission = comm("plains", 1, 4);
  if (n > 1) s.commission2 = comm("swamp", 3, 1);
  return s;
}

const center = (r: CmRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const bottom = (r: CmRect): number => r.y + r.h;
const right = (r: CmRect): number => r.x + r.w;

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
const direct = (rowsBottom: number) => spreadRows(REGIONS.length, CM_ROWS_Y0, rowsBottom, CM_ROW_MIN_H, CM_ROW_MAX_H);

/** 一帧几何 + 一帧文案(内容层要读同一帧几何,故成对取) */
function frame(slots: number, s: CommissionSaveView = withSlots(slots), selection: CommissionSelection = sel(), h: number = H_STD) {
  const L: CommissionLayout = commissionLayout(W, h, slots);
  return { L, c: buildCommissionContent(s, selection, NOW, L) };
}

/* ==================== 0. 端间同一实现与本屏要用到的表事实 ==================== */

describe("端间共读同一份共享层与本屏要用到的表事实", () => {
  it("commissions 与 commissionLayout 两个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosCommissions.regionOf).toBe(regionOf);
    expect(cocosCommissions.effectiveHours).toBe(effectiveHours);
    expect(cocosCommissions.accruedReward).toBe(accruedReward);
    expect(cocosCommissions.collectReward).toBe(collectReward);
    expect(cocosCommissions.commissionTickets).toBe(commissionTickets);
    expect(cocosCommissions.regionUnlocked).toBe(regionUnlocked);
    expect(cocosCommissionLayout.commissionLayout).toBe(commissionLayout);
    expect(cocosCommissionLayout.commissionScreenLayout).toBe(commissionScreenLayout);
  });

  it("区域表 6 条、难度表 5 档:行与钮的枚数就是这两张表的长度", () => {
    expect(REGIONS).toHaveLength(6);
    expect(DIFFICULTIES).toHaveLength(5);
    expect(REGIONS.map((r) => r.id)).toEqual(["plains", "swamp", "rift", "abyss", "sanctum", "diamond"]);
    expect(DIFFICULTIES.map((d) => d.level)).toEqual([1, 2, 3, 4, 5]);
    const L = commissionLayout(W, H_STD, 0);
    expect(L.rows.map((r) => r.id)).toEqual(REGIONS.map((r) => r.id));
    expect(L.diffs.map((d) => d.level)).toEqual(DIFFICULTIES.map((d) => d.level));
  });

  it("三个产出档各占一条:碎片四区、星尘圣殿、辉钻矿脉(单位名与分流都由这两个标志决定)", () => {
    expect(REGIONS.filter((r) => r.givesStardust).map((r) => r.id)).toEqual(["sanctum"]);
    expect(REGIONS.filter((r) => r.givesDiamond).map((r) => r.id)).toEqual(["diamond"]);
    expect(commissionUnit(regionOf("sanctum"))).toBe("星尘");
    expect(commissionUnit(regionOf("diamond"))).toBe("钻石");
    for (const id of ["plains", "swamp", "rift", "abyss"] as RegionId[]) expect(commissionUnit(regionOf(id))).toBe("碎片");
  });

  it("BUILDER_ROUTE 共 10 枚,全部拥有时「星尘圣殿」的 unlockTreeFull 分支可达", () => {
    expect(BUILDER_ROUTE).toHaveLength(10);
    const all = BUILDER_ROUTE.map((n) => n.id);
    expect(regionUnlocked(regionOf("sanctum"), 0, all)).toBe(true);
    expect(regionUnlocked(regionOf("sanctum"), 99, all.slice(0, 9))).toBe(false);
    // ownedTalents 是一个不设上限的数组字段,所以"点满"在存档模型下可达
    expect(all.every((id) => commissionOwns(all, id))).toBe(true);
  });

  it("兑换比例与四支时长常量的实际值(改表就会撞上下面那条字面量锁)", () => {
    expect(FRAGMENT_TO_STARDUST).toBe(10);
    expect(COMMISSION_DECAY.fullHours).toBe(2);
    expect(COMMISSION_DECAY.decayEndHours).toBe(4);
    expect(COMMISSION_DECAY.floorRate).toBe(0.5);
    expect(COMMISSION_MAX_HOURS).toBe(12);
    expect(COMMISSION_READY_HOURS).toBe(COMMISSION_DECAY.fullHours);
    expect(COMMISSION_TICKET_HOURS).toBe(3);
    expect(COMMISSION_TICKET_MIN).toBe(1);
  });

  it("衰减曲线与券数的三个抽样点(本屏文案与入账都读这两条)", () => {
    expect(effectiveHours(2)).toBe(2);
    expect(effectiveHours(4)).toBeCloseTo(3.5);
    expect(effectiveHours(24)).toBeCloseTo(7.5);
    expect(commissionTickets(0)).toBe(1);
    expect(commissionTickets(3.5)).toBe(1);
    expect(commissionTickets(6)).toBe(2);
  });
});

/* ==================== 1. 分区纵线:顶边锚定的列表 + 底边锚定的难度行与开始钮 ==================== */

describe("分区纵线(与 Web commissionLayout 同一批裸加数)", () => {
  it("开始委托钮:x 居中减半宽、y = h − pad − 52、260×52(底边锚定 h)", () => {
    expect(CM_START_HALF_W).toBe(130);
    expect([CM_START_W, CM_START_H, CM_START_UP]).toEqual([260, 52, 52]);
    for (const h of [H_STD, H_TALL]) {
      const b = commissionStartBtn(W, h);
      expect(b).toEqual({ x: W / 2 - 130, y: h - PAD - 52, w: 260, h: 52 });
      expect(bottom(b)).toBe(h - PAD);
    }
  });

  it("难度行顶缘 = 开始钮顶缘 − 30 − 42,预算底缘再让 24", () => {
    for (const h of [H_STD, H_TALL]) {
      expect(commissionDiffY(W, h)).toBe(commissionStartBtn(W, h).y - 72);
      expect(commissionRowsBottom(W, h)).toBe(commissionDiffY(W, h) - CM_ROWS_BOTTOM_DY);
      const L = commissionLayout(W, h, 0);
      expect(L.diffY).toBe(commissionDiffY(W, h));
      expect(L.rowsBottom).toBe(commissionRowsBottom(W, h));
      expect(L.diffLabel.baseY).toBe(L.diffY - CM_DIFF_LABEL_DY);
    }
  });

  it("区域行区顶缘恒 100,行高钳在 52..88、行距上限走 spreadRows 的默认 maxGap 20", () => {
    expect([CM_ROWS_Y0, CM_ROW_MIN_H, CM_ROW_MAX_H]).toEqual([100, 52, 88]);
    const L = commissionLayout(W, H_STD, 0);
    expect(L.rowsTop).toBe(CM_ROWS_Y0);
    // 只传五个实参:第六个 maxGap 走默认 20,显式传 40 会得到另一个 gap
    expect(spreadRows(REGIONS.length, CM_ROWS_Y0, L.rowsBottom, CM_ROW_MIN_H, CM_ROW_MAX_H, 40).gap).toBe(40);
    expect(L.rowGap).toBe(20);
    expect(direct(L.rowsBottom)).toEqual({ rowH: L.rowH, gap: L.rowGap });
  });

  it("难度钮恒五枚、bw = (w − pad×2 − 4×8)/5、间距 8、h = 42", () => {
    expect([CM_DIFF_N, CM_DIFF_GAP_X, CM_DIFF_H]).toEqual([5, 8, 42]);
    const L = commissionLayout(W, H_STD, 0);
    const bw = (W - PAD * 2 - 4 * 8) / 5;
    expect(bw).toBe(100);
    L.diffs.forEach((d, i) => {
      expect(d.rect).toEqual({ x: PAD + i * (bw + 8), y: L.diffY, w: bw, h: 42 });
      expect(d.index).toBe(i);
    });
    expect(right(L.diffs[4].rect)).toBe(W - PAD);
  });

  it("返回钮与兑换钮:右上两处固定矩形", () => {
    const L = commissionLayout(W, H_STD, 0);
    expect(L.backBtn).toEqual({ x: W - PAD - PAD_.backW, y: CM_BACK_Y, w: PAD_.backW, h: PAD_.backH });
    expect(L.exchangeBtn).toEqual({ x: W - PAD - CM_EXCHANGE_W, y: CM_EXCHANGE_Y, w: CM_EXCHANGE_W, h: CM_EXCHANGE_H });
    expect(right(L.backBtn)).toBe(W - PAD);
    expect(right(L.exchangeBtn)).toBe(W - PAD);
  });

  it("面板底是 panelPad 不传专属键的那一档:panel_dark_corners 九宫 (pad,pad,w−2pad,h−2pad)", () => {
    expect(CM_PANEL_NINE).toBe(32);
    for (const h of [H_STD, H_TALL]) {
      const L = commissionLayout(W, h, 0);
      expect(L.panelKey).toBe("panel_dark_corners");
      expect(L.panel).toEqual({ x: PAD, y: PAD, w: W - PAD * 2, h: h - PAD * 2 });
    }
  });
});

/* ==================== 2. 六格矩阵:h ∈ {996,1246} × 分支 ∈ {列表态, 1 面板, 2 面板} ==================== */

describe("六格矩阵:h ∈ {996,1246} × 分支 ∈ {列表态, 1 个面板, 2 个面板}", () => {
  /** 每格的期望值:`[rowsBottom, rowH, gap, rowsEnd, rowsToDiff, diffY, startBtn.y]` */
  const CELL: Record<string, [number, number, number, number, number, number, number]> = {
    "996|0": [834, 88, 20, 728, 124, 858, 930],
    "996|1": [834, 88, 20, 728, 124, 858, 930],
    "996|2": [834, 88, 20, 728, 124, 858, 930],
    "1246|0": [1084, 88, 20, 728, 374, 1108, 1180],
    "1246|1": [1084, 88, 20, 728, 374, 1108, 1180],
    "1246|2": [1084, 88, 20, 728, 374, 1108, 1180],
  };

  for (const h of [H_STD, H_TALL]) {
    for (const slots of BRANCHES) {
      const k = `${h}|${slots}`;
      it(`${k}:${h === H_STD ? "996 档" : "1246 档"} × ${slots === 0 ? "列表态" : `${slots} 个面板`} 的 rowH / gap / 末行底边 / diffY / 开始钮底边`, () => {
        const L = commissionLayout(W, h, slots);
        const [rowsBottom, rowH, gap, rowsEnd, rowsToDiff, diffY, startY] = CELL[k];
        expect(L.rowsBottom).toBe(rowsBottom);
        expect(L.rowH).toBe(rowH);
        expect(L.rowGap).toBe(gap);
        expect(L.rowStep).toBe(rowH + gap);
        expect(L.rowsEnd).toBe(rowsEnd);
        expect(L.rowsToDiff).toBe(rowsToDiff);
        expect(L.diffY).toBe(diffY);
        expect(L.startBtn.y).toBe(startY);
        // 与 spreadRows 直算对照:矩阵不是从布局函数里抄回来的
        expect(direct(rowsBottom)).toEqual({ rowH, gap });
        // 末行底边落在预算内,开始钮底边恰好压在 h − pad 上(不越界)
        expect(L.rowsEnd).toBeLessThanOrEqual(L.rowsBottom);
        expect(bottom(L.startBtn)).toBe(h - PAD);
        expect(bottom(L.startBtn)).toBeLessThanOrEqual(h - PAD);
        expect(L.slotCount).toBe(slots);
        expect(L.panels).toHaveLength(slots);
      });
    }
  }

  it("跨档不变量:区域行顶边锚定 + 行高被 maxH 封顶,于是两档屏高下行矩形逐字相同", () => {
    const a = commissionLayout(W, H_STD, 0);
    const b = commissionLayout(W, H_TALL, 0);
    expect(b.rows.map((r) => r.rect)).toEqual(a.rows.map((r) => r.rect));
    expect([b.rowH, b.rowGap, b.rowStep, b.rowsEnd]).toEqual([a.rowH, a.rowGap, a.rowStep, a.rowsEnd]);
    // 行高就是 maxH 那一档(预算富余被封顶吃掉),两档屏高下都不变
    expect(a.rowH).toBe(CM_ROW_MAX_H);
    expect(b.rowH).toBe(CM_ROW_MAX_H);
  });

  it("跨档不变量:开始钮与难度行底边锚定 h,屏高的差全落在末行与难度说明之间的空档里", () => {
    const a = commissionLayout(W, H_STD, 0);
    const b = commissionLayout(W, H_TALL, 0);
    const dh = H_TALL - H_STD;
    expect(dh).toBe(250);
    expect(b.startBtn.y - a.startBtn.y).toBe(dh);
    expect(b.diffY - a.diffY).toBe(dh);
    expect(b.rowsToDiff - a.rowsToDiff).toBe(dh);
    // 空档就是"难度说明基线 − 末行底边",两档都远大于 0(列表不会被难度行压住)
    expect(a.rowsToDiff).toBe(a.diffY - CM_DIFF_LABEL_DY - a.rowsEnd);
    expect(b.rowsToDiff).toBeGreaterThan(a.rowsToDiff);
  });

  it("面板几何只随槽位数变,与屏高无关:panelH 恒 150、topY 恒 84、面板间距 12", () => {
    expect([CM_PANEL_H, CM_PANEL_TOP_Y, CM_PANEL_GAP]).toEqual([150, 84, 12]);
    for (const h of [H_STD, H_TALL]) {
      const L = commissionLayout(W, h, 2);
      expect(L.panels[0].rect).toEqual({ x: PAD, y: 84, w: W - PAD * 2, h: 150 });
      expect(L.panels[1].rect).toEqual({ x: PAD, y: 246, w: W - PAD * 2, h: 150 });
      expect(bottom(L.panels[1].rect)).toBe(396);
      expect(bottom(L.panels[1].rect)).toBeLessThanOrEqual(h - PAD);
    }
  });

  it("横向边界:六格下所有矩形都不越出 [pad, w − pad](标题横幅除外,它按 skinHeader 的 bx = x − 8 起笔)", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const slots of BRANCHES) {
        const L = commissionLayout(W, h, slots);
        const rects: CmRect[] = [
          L.panel,
          L.backBtn,
          L.exchangeBtn,
          L.startBtn,
          L.diffLabel && { x: PAD, y: 0, w: L.diffLabel.maxW, h: 0 },
          ...L.rows.map((r) => r.rect),
          ...L.diffs.map((d) => d.rect),
          ...L.panels.flatMap((p) => [p.rect, p.bar, p.collect, p.abandon]),
        ].filter(Boolean) as CmRect[];
        for (const r of rects) {
          expect(r.x, `h=${h} slots=${slots} x=${r.x}`).toBeGreaterThanOrEqual(PAD);
          expect(right(r), `h=${h} slots=${slots} right=${right(r)}`).toBeLessThanOrEqual(W - PAD);
        }
        // 横幅是 Web skinHeader 的 `bx = x − 8`,与 prestige / gacha 同性质:故意探出 pad
        expect(L.headerBanner.x).toBe(PAD - 8);
        expect(right(L.headerBanner)).toBeLessThanOrEqual(W - PAD);
      }
    }
  });

  it("纵向次序:面板态两枚面板不互相压,列表态末行不压难度说明、难度行不压开始钮", () => {
    const p = commissionLayout(W, H_STD, 2);
    expect(p.panels[1].rect.y).toBeGreaterThanOrEqual(bottom(p.panels[0].rect));
    for (const h of [H_STD, H_TALL]) {
      const L = commissionLayout(W, h, 0);
      expect(L.diffLabel.baseY).toBeGreaterThan(L.rowsEnd);
      expect(L.diffY).toBeGreaterThan(L.diffLabel.baseY);
      expect(bottom(L.diffs[0].rect)).toBeLessThan(L.startBtn.y);
      expect(L.startBtn.y).toBeLessThan(h);
    }
  });
});

/* ==================== 3. 区域行的两行布局 ==================== */

describe("区域行(两行布局 + 右对齐产出)", () => {
  it("行 y = 100 + i × (rowH + gap)、x = pad、w = w − pad×2、h = rowH", () => {
    const L = commissionLayout(W, H_STD, 0);
    L.rows.forEach((r, i) => {
      expect(r.rect).toEqual({ x: PAD, y: CM_ROWS_Y0 + i * L.rowStep, w: W - PAD * 2, h: L.rowH });
      expect(r.index).toBe(i);
    });
    expect(L.rows[0].rect.y).toBe(100);
    expect(L.rows[5].rect.y).toBe(640);
    expect(bottom(L.rows[5].rect)).toBe(L.rowsEnd);
  });

  it("两行基线 l1 = round(y + h/2 − 5)、l2 = l1 + 18(与每日屏同一批裸加数)", () => {
    expect([CM_L1_DY, CM_L2_DY]).toEqual([5, 18]);
    const L = commissionLayout(W, H_STD, 0);
    for (const r of L.rows) {
      expect(r.l1).toBe(Math.round(r.rect.y + r.rect.h / 2 - CM_L1_DY));
      expect(r.l2).toBe(r.l1 + CM_L2_DY);
      expect(r.name.baseY).toBe(r.l1);
      expect(r.rate.baseY).toBe(r.l1);
      expect(r.sub.baseY).toBe(r.l2);
    }
    expect(L.rows[0].l1).toBe(139);
    expect(L.rows[0].l2).toBe(157);
  });

  it("名字起笔 r.x + 8 限宽 150(fs.body);第二行同一起笔、整幅内宽(fs.micro);产出右对齐末笔 r.x + r.w − 8(fs.muted)", () => {
    expect(CM_NAME_MAX_W).toBe(150);
    const L = commissionLayout(W, H_STD, 0);
    for (const r of L.rows) {
      expect([r.name.x, r.name.maxW, r.name.px, r.name.align]).toEqual([r.rect.x + 8, 150, FS.body, "left"]);
      expect([r.sub.x, r.sub.maxW, r.sub.px, r.sub.align]).toEqual([r.rect.x + 8, r.rect.w - 16, FS.micro, "left"]);
      expect([r.rate.x, r.rate.px, r.rate.align]).toEqual([r.rect.x + r.rect.w - 8, FS.muted, "right"]);
      // 两行都在行矩形之内
      expect(r.l1).toBeGreaterThan(r.rect.y);
      expect(r.l2).toBeLessThan(bottom(r.rect));
    }
  });
});

/* ==================== 4. 难度钮:两行固定偏移(不是 rowTextY) ==================== */

describe("难度钮的两行文字是固定偏移", () => {
  it("第一行 d.y + 17(fs.muted 加粗)、第二行 d.y + 33(fs.micro),都水平居中", () => {
    expect([CM_DIFF_TEXT_DY1, CM_DIFF_TEXT_DY2]).toEqual([17, 33]);
    const L = commissionLayout(W, H_STD, 0);
    for (const d of L.diffs) {
      expect([d.mult.baseY, d.mult.px, d.mult.align, d.mult.maxW]).toEqual([d.rect.y + 17, FS.muted, "center", d.rect.w]);
      expect([d.fail.baseY, d.fail.px, d.fail.align, d.fail.maxW]).toEqual([d.rect.y + 33, FS.micro, "center", d.rect.w]);
      expect(d.mult.x).toBe(d.rect.x + d.rect.w / 2);
      expect(d.fail.x).toBe(d.rect.x + d.rect.w / 2);
      // 这两条不是 rowTextY:同一矩形按 rowTextY 会得到别的基线
      expect(d.mult.baseY).not.toBe(rowTextY(d.rect.y, d.rect.h, FS.muted));
      expect(bottom(d.rect)).toBeGreaterThan(d.fail.baseY);
    }
  });

  it("难度说明左起笔于 pad、基线 diffY − 6、fs.micro", () => {
    const L = commissionLayout(W, H_TALL, 0);
    expect([L.diffLabel.x, L.diffLabel.baseY, L.diffLabel.px, L.diffLabel.align]).toEqual([PAD, L.diffY - 6, FS.micro, "left"]);
    expect(L.diffLabel.maxW).toBe(W - PAD * 2);
  });
});

/* ==================== 5. 面板内的三行 / 进度条 / 两枚钮 ==================== */

describe("进行中面板的几何(1 与 2 个槽位)", () => {
  it("三行基线 y+24 / y+48 / y+68,起笔 pad + 8,字号依次 body / muted / micro", () => {
    expect([CM_PANEL_LINE1_DY, CM_PANEL_LINE2_DY, CM_PANEL_LINE3_DY]).toEqual([24, 48, 68]);
    const L = commissionLayout(W, H_STD, 2);
    L.panels.forEach((p, i) => {
      const y = CM_PANEL_TOP_Y + i * (CM_PANEL_H + CM_PANEL_GAP);
      expect([p.line1.baseY, p.line2.baseY, p.line3.baseY]).toEqual([y + 24, y + 48, y + 68]);
      for (const t of [p.line1, p.line2, p.line3]) {
        expect(t.x).toBe(PAD + 8);
        expect(t.maxW).toBe(p.rect.w - 16);
        expect(t.align).toBe("left");
      }
      expect([p.line1.px, p.line2.px, p.line3.px]).toEqual([FS.body, FS.muted, FS.micro]);
      expect(p.index).toBe(i);
    });
  });

  it("进度条 (pad + 8, y + h − 58, 200, 8);两枚钮 (w − pad − 2×112 − 8 / w − pad − 112, y + h − 44, 112, 36)", () => {
    expect([CM_BAR_DY, CM_BAR_DX, CM_BAR_W, CM_BAR_H]).toEqual([58, 8, 200, 8]);
    expect([CM_PANEL_BTN_W, CM_PANEL_BTN_H, CM_PANEL_BTN_GAP]).toEqual([112, 36, 8]);
    const L = commissionLayout(W, H_STD, 2);
    L.panels.forEach((p, i) => {
      const y = CM_PANEL_TOP_Y + i * (CM_PANEL_H + CM_PANEL_GAP);
      expect(p.bar).toEqual({ x: PAD + 8, y: y + CM_PANEL_H - 58, w: 200, h: 8 });
      expect(p.collect).toEqual({ x: W - PAD - 2 * 112 - 8, y: y + CM_PANEL_H - 44, w: 112, h: 36 });
      expect(p.abandon).toEqual({ x: W - PAD - 112, y: y + CM_PANEL_H - 44, w: 112, h: 36 });
      expect(p.collect.x).toBe(314);
      expect(p.abandon.x).toBe(434);
      expect(right(p.abandon)).toBe(W - PAD);
      // 进度条在两枚钮之上,三者互不相叠
      expect(bottom(p.bar)).toBeLessThan(p.collect.y);
      expect(p.collect.y).toBe(p.abandon.y);
      expect(bottom(p.collect)).toBeLessThanOrEqual(bottom(p.rect));
    });
  });

  it("两枚钮的文字居中并用 rowTextY(fs.body)", () => {
    const L = commissionLayout(W, H_STD, 1);
    for (const [r, t] of [
      [L.panels[0].collect, L.panels[0].collectText],
      [L.panels[0].abandon, L.panels[0].abandonText],
    ] as [CmRect, CmTextLine][]) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(r.x + r.w / 2);
      expect(t.maxW).toBe(r.w);
      expect(t.px).toBe(FS.body);
      expect(t.baseY).toBe(rowTextY(r.y, r.h, FS.body));
    }
    expect(L.panels[0].collectText.baseY).toBe(213);
  });

  it("进度条两档钳制:贴图档盖空缺(frac ≥ 1 时不盖)、缺图档从左画 min(1, frac)", () => {
    const track: CmRect = { x: 22, y: 176, w: 200, h: 8 };
    const half = commissionBarRects(track, 0.5);
    expect(half.fill).toEqual({ x: 22, y: 176, w: 100, h: 8 });
    expect(half.cover).toEqual({ x: 122, y: 176, w: 100, h: 8 });
    // 超过 2h(frac > 1)那一档:填充整条、不再盖暗罩
    const full = commissionBarRects(track, 3);
    expect(full.fill.w).toBe(200);
    expect(full.cover).toBeNull();
    // 未到 1 帧的极小值:填充宽度按比例,不留最小宽
    expect(commissionBarRects(track, 0.01).fill.w).toBeCloseTo(2);
  });
});

/* ==================== 6. 头部几何(skinHeader 默认档 / iconText / 返回钮) ==================== */

describe("头部几何(对标 Web skinHeader 的默认宽高、iconText 与 skinIconButton)", () => {
  it("横幅盒 = (pad − 8, 36 − 42 + 8, 220, 42) —— 本屏不传宽高,走 skin.ts 的默认档", () => {
    expect([CM_BANNER_W, CM_BANNER_H]).toEqual([220, 42]);
    const L = commissionLayout(W, H_STD, 0);
    expect(L.headerBanner).toEqual({ x: PAD - 8, y: CM_TITLE_BASE_Y - CM_BANNER_H + 8, w: 220, h: 42 });
    expect(L.headerBanner.y).toBe(2);
    expect([L.titleWithBanner.x, L.titleWithBanner.baseY, L.titleWithBanner.px, L.titleWithBanner.align]).toEqual([116, 32, FS.title, "center"]);
    expect(L.titleWithBanner.baseY).toBe(CM_TITLE_BASE_Y - CM_BANNER_TEXT_DY);
    expect([L.titleBare.x, L.titleBare.baseY, L.titleBare.px, L.titleBare.align]).toEqual([PAD, 36, FS.title, "left"]);
    // 与 prestige / gacha 的显式 240×46 不同档
    expect(L.headerBanner.w).not.toBe(240);
  });

  it("小立绘的固定坐标逐字照搬 Web:(252, 4, 38, 60)", () => {
    expect([CM_POSE_X, CM_POSE_Y, CM_POSE_W, CM_POSE_H]).toEqual([252, 4, 38, 60]);
    expect(commissionLayout(W, H_STD, 0).pose).toEqual({ x: 252, y: 4, w: 38, h: 60 });
    expect(commissionLayout(W, H_TALL, 2).pose).toEqual({ x: 252, y: 4, w: 38, h: 60 });
  });

  it("两项读数走 iconText(size 13):图标盒 (x, 60 − 13 + 2, 13, 13),有图时文字右移 13 + 4、缺图时回到 x", () => {
    expect(CM_ICON_SIZE).toBe(13);
    const L = commissionLayout(W, H_STD, 0);
    expect(L.fragmentIcon).toEqual({ x: PAD, y: CM_RES_BASE_Y - 13 + 2, w: 13, h: 13 });
    expect(L.stardustIcon).toEqual({ x: PAD + CM_STARDUST_DX, y: 49, w: 13, h: 13 });
    expect([L.fragmentTextWithIcon.x, L.fragmentTextBare.x]).toEqual([PAD + 13 + 4, PAD]);
    expect([L.stardustTextWithIcon.x, L.stardustTextBare.x]).toEqual([PAD + 130 + 13 + 4, PAD + 130]);
    for (const t of [L.fragmentTextWithIcon, L.fragmentTextBare, L.stardustTextWithIcon, L.stardustTextBare, L.prestigesText]) {
      expect([t.baseY, t.px, t.align]).toEqual([60, FS.muted, "left"]);
    }
    // 三段让位互不重叠:碎片收到星尘图标前、星尘收到「转生」起笔前
    expect(right({ x: L.fragmentTextWithIcon.x, y: 0, w: L.fragmentTextWithIcon.maxW, h: 0 })).toBeLessThanOrEqual(L.stardustIcon.x);
    expect(right({ x: L.stardustTextWithIcon.x, y: 0, w: L.stardustTextWithIcon.maxW, h: 0 })).toBeLessThanOrEqual(L.prestigesText.x);
  });

  it("「转生 N 次」起笔 pad + 250、与两项读数同基线,限宽收到面板右缘", () => {
    expect(CM_PRESTIGES_DX).toBe(250);
    const L = commissionLayout(W, H_STD, 0);
    expect([L.prestigesText.x, L.prestigesText.baseY]).toEqual([PAD + 250, 60]);
    expect(right({ x: L.prestigesText.x, y: 0, w: L.prestigesText.maxW, h: 0 })).toBe(W - PAD);
  });

  it("返回钮的图标位与两档文字位(Web skinIconButton:ih = h − 12、文字基线 y + h/2 + 5)", () => {
    expect([CM_BACK_ICON_DX, CM_BACK_ICON_SHRINK, CM_BACK_TEXT_DY]).toEqual([4, 12, 5]);
    const L = commissionLayout(W, H_STD, 0);
    const ih = L.backBtn.h - 12;
    expect(L.backIcon).toEqual({ x: L.backBtn.x + 4, y: L.backBtn.y + (L.backBtn.h - ih) / 2, w: ih, h: ih });
    expect(L.backIcon).toEqual({ x: 478, y: 28, w: 22, h: 22 });
    const baseY = L.backBtn.y + L.backBtn.h / 2 + 5;
    expect(baseY).toBe(44);
    expect([L.backTextWithIcon.baseY, L.backTextBare.baseY]).toEqual([baseY, baseY]);
    expect(L.backTextWithIcon.x).toBe(L.backBtn.x + 4 + ih + (L.backBtn.w - 4 - ih) / 2);
    expect(L.backTextBare.x).toBe(L.backBtn.x + L.backBtn.w / 2);
    expect([L.backTextWithIcon.px, L.backTextBare.px]).toEqual([FS.body, FS.body]);
  });

  it("兑换钮与开始钮的居中文字位都用 rowTextY", () => {
    const L = commissionLayout(W, H_STD, 0);
    expect([L.exchangeText.x, L.exchangeText.baseY, L.exchangeText.maxW, L.exchangeText.px, L.exchangeText.align]).toEqual([
      L.exchangeBtn.x + L.exchangeBtn.w / 2,
      rowTextY(CM_EXCHANGE_Y, CM_EXCHANGE_H, FS.muted),
      CM_EXCHANGE_W,
      FS.muted,
      "center",
    ]);
    expect(L.exchangeText.baseY).toBe(78);
    expect([L.startText.x, L.startText.maxW, L.startText.px, L.startText.align]).toEqual([L.startBtn.x + 130, CM_START_W, FS.section, "center"]);
    expect(L.startText.baseY).toBe(rowTextY(L.startBtn.y, CM_START_H, FS.section));
    expect(L.startText.baseY).toBe(961);
    expect(commissionLayout(W, H_TALL, 0).startText.baseY).toBe(1211);
    expect(CM_START_STROKE_W).toBe(2);
  });
});

/* ==================== 7. 文本带右界(commissionLayout 全网格) ==================== */

describe("文本带右界(commissionLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    for (const align of ["left", "center", "right"] as TextAlign[]) {
      const band: Band = anchorBand(100, 20, 120, 14, align, LIFT);
      expect(band.x + band.w * alignAx(align)).toBe(100);
      expect(band.w).toBe(120);
    }
  });

  it("两档屏高 × 三个分支:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const slots of BRANCHES) {
        const L = commissionLayout(W, h, slots);
        const lines: CmTextLine[] = [
          L.titleBare,
          L.titleWithBanner,
          L.fragmentTextWithIcon,
          L.fragmentTextBare,
          L.stardustTextWithIcon,
          L.stardustTextBare,
          L.prestigesText,
          L.exchangeText,
          L.backTextWithIcon,
          L.backTextBare,
          L.diffLabel,
          L.startText,
          ...L.rows.flatMap((r) => [r.name, r.sub, r.rate]),
          ...L.diffs.flatMap((d) => [d.mult, d.fail]),
          ...L.panels.flatMap((p) => [p.line1, p.line2, p.line3, p.collectText, p.abandonText]),
        ];
        for (const t of lines) {
          const band = anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
          expect(band.x, `h=${h} slots=${slots} x=${t.x}`).toBeGreaterThanOrEqual(0);
          expect(band.x + band.w, `h=${h} slots=${slots} x=${t.x}`).toBeLessThanOrEqual(W);
        }
      }
    }
  });

  it("右对齐的产出串末笔贴行右缘内缩 8;居中文字位都在自己那个矩形里", () => {
    const L = commissionLayout(W, H_TALL, 2);
    for (const row of L.rows) {
      const band = anchorBand(row.rate.x, row.rate.baseY, row.rate.maxW, row.rate.px, "right", LIFT);
      expect(band.x + band.w).toBe(row.rect.x + row.rect.w - 8);
      expect(band.x + band.w).toBe(W - PAD - 8);
    }
    const pairs: [CmRect, CmTextLine][] = [
      ...L.diffs.flatMap((d): [CmRect, CmTextLine][] => [
        [d.rect, d.mult],
        [d.rect, d.fail],
      ]),
      [L.exchangeBtn, L.exchangeText],
      [L.startBtn, L.startText],
      ...L.panels.flatMap((p): [CmRect, CmTextLine][] => [
        [p.collect, p.collectText],
        [p.abandon, p.abandonText],
      ]),
    ];
    for (const [r, t] of pairs) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(r.x + r.w / 2);
      expect(t.maxW).toBe(r.w);
      expect(center(r).x).toBe(t.x);
    }
  });
});

/* ==================== 8. 屏级文案逐字 ==================== */

describe("屏级文案逐字(对标 Web drawCommission / drawCommissionPanel 的 fillText 实参)", () => {
  it("标题、返回钮、难度说明、开始钮四串逐字(标点不许改)", () => {
    const { c } = frame(0);
    expect(c.title).toBe("委托挂机");
    expect(c.backText).toBe("返回");
    expect(c.diffLabel).toBe("难度(产出倍率/失败率)");
    expect(c.startText).toBe("开始委托(4h)");
    expect(COMMISSION_START_TEXT).toBe("开始委托(4h)");
  });

  it("三项读数与兑换钮文案的插值同 Web 原样", () => {
    const s = save({ fragments: 25, stardust: 7, prestiges: 3 });
    const { c } = frame(0, s);
    expect(c.fragmentsText).toBe("词缀碎片 25");
    expect(c.stardustText).toBe("星尘 7");
    expect(c.prestigesText).toBe("转生 3 次");
    expect(c.exchangeText).toBe("兑换星尘 ×2");
    expect(c.showExchange).toBe(true);
  });

  it("兑换钮只在 fragments ≥ FRAGMENT_TO_STARDUST 时存在(绘制与命中同一个前置条件)", () => {
    expect(FRAGMENT_TO_STARDUST).toBe(10);
    expect(frame(0, save({ fragments: 9 })).c.showExchange).toBe(false);
    expect(frame(0, save({ fragments: 10 })).c.showExchange).toBe(true);
    expect(commissionExchangeCount(9)).toBe(0);
    expect(commissionExchangeCount(25)).toBe(2);
    expect(commissionExchangeCount(0)).toBe(0);
  });

  it("区域行第二行是 `${output} · ${unlockNote}`,unlockNote 走 Web 的三元链", () => {
    const { c } = frame(0);
    expect(c.rows.map((r) => r.subText)).toEqual([
      "基础材料 · 初始解锁",
      "毒素系词缀碎片 · 需转生 1 次",
      "火焰系词缀碎片 · 需转生 3 次",
      "全类型词缀碎片 · 需转生 5 次",
      "星尘结晶 · 需天赋树点满",
      "钻石结晶 · 需转生 7 次",
    ]);
    // 三元链的优先级:星尘圣殿 unlockPrestiges 是 0,但 unlockTreeFull 先命中
    expect(regionOf("sanctum").unlockPrestiges).toBe(0);
    expect(commissionUnlockNote(regionOf("sanctum"))).toBe("需天赋树点满");
    expect(commissionUnlockNote(regionOf("plains"))).toBe("初始解锁");
    expect(commissionUnlockNote(regionOf("abyss"))).toBe("需转生 5 次");
  });

  it("右对齐产出串 `产出 ${baseRate}/h` 由表里的 baseRate 插值(六个区域各一档)", () => {
    const { c } = frame(0);
    expect(c.rows.map((r) => r.rateText)).toEqual(REGIONS.map((r) => `产出 ${r.baseRate}/h`));
    expect(c.rows[0].rateText).toBe("产出 30/h");
    expect(c.rows[5].rateText).toBe("产出 2/h");
  });

  it("难度钮两行:`×${mult}`(倍率原样拼接)与 `${round(fail×100)}%败`", () => {
    const { c } = frame(0);
    expect(c.diffs.map((d) => d.multText)).toEqual(["×1", "×1.5", "×2.2", "×3", "×4"]);
    expect(c.diffs.map((d) => d.failText)).toEqual(["0%败", "2%败", "5%败", "12%败", "20%败"]);
    expect(c.diffs.map((d) => d.multText)).toEqual(DIFFICULTIES.map((d) => `×${difficultyOf(d.level).mult}`));
    expect(c.diffs.map((d) => d.failText)).toEqual(DIFFICULTIES.map((d) => `${Math.round(d.fail * 100)}%败`));
  });

  it("面板三行逐字:难度是数字本身、时数两档定点、单位随区域、成功率后半句是 Web 的字面量", () => {
    const s = withSlots(2);
    const { c } = frame(2, s);
    expect(c.panels).toHaveLength(2);
    expect(c.panels[0].slot).toBe("commission");
    expect(c.panels[1].slot).toBe("commission2");
    expect(c.panels[0].line1).toBe("委托中:枯萎平原 · 难度1");
    expect(c.panels[0].line2).toBe("已进行 4.0h · 有效时长 3.50h · 预计 105 碎片");
    expect(c.panels[0].line3).toBe("成功率 100% · 收益前2h 100%,之后降至 50%");
    expect(c.panels[1].line1).toBe("委托中:腐蚀沼泽 · 难度3");
    expect(c.panels[1].line3).toBe("成功率 95% · 收益前2h 100%,之后降至 50%");
    expect([c.panels[0].collectText, c.panels[0].abandonText]).toEqual(["领取", "放弃"]);
  });

  it("面板第二行的三个数各走一条既有函数:原始 hours / effectiveHours / accruedReward", () => {
    const s = save({ commission: comm("plains", 1, 4), ownedTalents: ["offline1"] });
    const { c } = frame(1, s);
    const bonus = commissionBonus(s);
    expect(bonus.rewardMult).toBeCloseTo(1.15);
    expect(c.panels[0].hours).toBeCloseTo(4);
    expect(c.panels[0].effHours).toBeCloseTo(effectiveHours(4, bonus));
    expect(c.panels[0].reward).toBe(accruedReward(s.commission!, NOW, bonus));
    expect(c.panels[0].reward).toBe(Math.floor(30 * 1 * 3.5 * 1.15));
    expect(c.panels[0].line2).toBe(`已进行 4.0h · 有效时长 ${effectiveHours(4, bonus).toFixed(2)}h · 预计 ${c.panels[0].reward} 碎片`);
  });

  it("单位名随区域三档分流:星尘圣殿 → 星尘、辉钻矿脉 → 钻石、其余 → 碎片", () => {
    expect(frame(1, save({ commission: comm("sanctum", 1, 4) })).c.panels[0].line2).toMatch(/预计 \d+ 星尘$/);
    expect(frame(1, save({ commission: comm("diamond", 1, 4) })).c.panels[0].line2).toMatch(/预计 \d+ 钻石$/);
    expect(frame(1, save({ commission: comm("abyss", 1, 4) })).c.panels[0].line2).toMatch(/预计 \d+ 碎片$/);
  });

  it("进度条比例是未钳制的 hours / 2(2h 之前小于 1、超过 2h 大于 1)", () => {
    expect(frame(1, save({ commission: comm("plains", 1, 1) })).c.panels[0].barFrac).toBeCloseTo(0.5);
    expect(frame(1, save({ commission: comm("plains", 1, 4) })).c.panels[0].barFrac).toBeCloseTo(2);
    expect(frame(1, save({ commission: comm("plains", 1, 12) })).c.panels[0].barFrac).toBeCloseTo(6);
  });
});

/* ==================== 9. 区域解锁与三档态 ==================== */

describe("区域解锁门(prestiges 与 ownedTalents 的合取)", () => {
  it("prestiges = 0 时只有枯萎平原解锁,星尘圣殿因 unlockTreeFull 也锁着", () => {
    const { c } = frame(0);
    expect(c.rows.map((r) => r.unlocked)).toEqual([true, false, false, false, false, false]);
    expect(commissionRegionOpen(regionOf("sanctum"), save({ prestiges: 99 }))).toBe(false);
    expect(commissionRegionOpen(regionOf("sanctum"), save({ prestiges: 99, ownedTalents: BUILDER_ROUTE.map((n) => n.id) }))).toBe(true);
  });

  it("转生次数逐档开门:1 / 3 / 5 / 7 各开一区(星尘圣殿不看次数)", () => {
    const openAt = (p: number) => frame(0, save({ prestiges: p })).c.rows.map((r) => r.unlocked);
    expect(openAt(0)).toEqual([true, false, false, false, false, false]);
    expect(openAt(1)).toEqual([true, true, false, false, false, false]);
    expect(openAt(3)).toEqual([true, true, true, false, false, false]);
    expect(openAt(5)).toEqual([true, true, true, true, false, false]);
    expect(openAt(7)).toEqual([true, true, true, true, false, true]);
    const all = BUILDER_ROUTE.map((n) => n.id);
    expect(frame(0, save({ prestiges: 7, ownedTalents: all })).c.rows.map((r) => r.unlocked)).toEqual([true, true, true, true, true, true]);
  });

  it("选中态只有一枚为真,且随入参切换;锁定行也能算选中(绘制侧不看解锁)", () => {
    expect(frame(0).c.rows.filter((r) => r.sel).map((r) => r.id)).toEqual(["plains"]);
    expect(frame(0, save(), sel({ region: "abyss" })).c.rows.filter((r) => r.sel).map((r) => r.id)).toEqual(["abyss"]);
    expect(frame(0, save({ prestiges: 0 }), sel({ region: "abyss" })).c.rows.find((r) => r.id === "abyss")!).toEqual(
      expect.objectContaining({ sel: true, unlocked: false })
    );
  });

  it("难度选中态只有一枚为真,且随入参切换", () => {
    expect(frame(0).c.diffs.filter((d) => d.sel).map((d) => d.level)).toEqual([1]);
    expect(frame(0, save(), sel({ difficulty: 5 })).c.diffs.filter((d) => d.sel).map((d) => d.level)).toEqual([5]);
  });

  it("panelMode 就是「有活动槽位」:0 个为假、1 与 2 个为真", () => {
    expect(frame(0).c.panelMode).toBe(false);
    expect(frame(1).c.panelMode).toBe(true);
    expect(frame(2).c.panelMode).toBe(true);
  });
});

/* ==================== 10. 槽位顺序与天赋加成 ==================== */

describe("槽位顺序与 commissionBonus 的四项", () => {
  it("槽位顺序恒为 commission 先、commission2 后(只列非空的那几个)", () => {
    expect(commissionSlots(save())).toEqual([]);
    expect(commissionSlots(save({ commission: comm() })).map((x) => x.slot)).toEqual(["commission"]);
    expect(commissionSlots(save({ commission2: comm() })).map((x) => x.slot)).toEqual(["commission2"]);
    expect(commissionSlots(save({ commission: comm(), commission2: comm("swamp") })).map((x) => x.slot)).toEqual(["commission", "commission2"]);
    // 只有第二槽时面板序号 0 指的是 commission2
    const only2 = save({ commission2: comm("rift", 2, 3) });
    expect(commissionSlots(only2)[0].state).toBe(only2.commission2);
    expect(frame(1, only2).c.panels[0].slot).toBe("commission2");
  });

  it("几何给的面板数多于活动槽位时,内容层按槽位数截断且逐位对齐(读不到 undefined)", () => {
    const s = save({ commission: comm("plains", 1, 4) });
    const L = commissionLayout(W, H_STD, 2);
    const c = buildCommissionContent(s, sel(), NOW, L);
    expect(L.panels).toHaveLength(2);
    expect(c.panels).toHaveLength(1);
    expect(c.panels[0].slot).toBe("commission");
    expect(c.panels[0].line1).toBe("委托中:枯萎平原 · 难度1");
    expect(c.panelMode).toBe(true);
  });

  it("空档四项全是默认值(倍率 1、时间缩放 1、不解除封顶)", () => {
    expect(commissionBonus(save())).toEqual({ rewardMult: 1, speedMult: 1, timeScale: 1, uncapped: false });
  });

  it("收益倍率 = 离线增效 I/II/III 累计(+15% / +30% / +50%)", () => {
    expect(commissionBonus(save({ ownedTalents: ["offline1"] })).rewardMult).toBeCloseTo(1.15);
    expect(commissionBonus(save({ ownedTalents: ["offline1", "offline2"] })).rewardMult).toBeCloseTo(1.3);
    expect(commissionBonus(save({ ownedTalents: ["offline1", "offline2", "offline3"] })).rewardMult).toBeCloseTo(1.5);
    expect(commissionBonus(save({ ownedTalents: ["offline1", "offline2", "offline3"] })).rewardMult).toBe(offlineBonusFor(["offline1", "offline2", "offline3"]));
  });

  it("结算速度 = 委托加速 ×1.2;时间缩放 = 时间压缩 1/0.7;封顶 = 永恒工厂", () => {
    expect(commissionBonus(save({ ownedTalents: ["commission_speed"] })).speedMult).toBe(commissionSpeedFor(["commission_speed"]));
    expect(commissionBonus(save({ ownedTalents: ["commission_speed"] })).speedMult).toBeCloseTo(1.2);
    expect(commissionBonus(save({ ownedTalents: ["time_compress"] })).timeScale).toBe(commissionTimeScaleFor(["time_compress"]));
    expect(commissionBonus(save({ ownedTalents: ["time_compress"] })).timeScale).toBeCloseTo(1 / 0.7);
    expect(commissionBonus(save({ ownedTalents: ["eternal_factory"] })).uncapped).toBe(true);
    expect(commissionBonus(save({ ownedTalents: ["eternal_factory"] })).uncapped).toBe(uncappedCommissionFor(["eternal_factory"]));
    expect(commissionBonus(save({ ownedTalents: ["double_commission"] })).uncapped).toBe(false);
  });

  it("整条效率专家路线点满:四项同时到位,而双委托只影响槽位分配、不进这四项", () => {
    const all = EFFICIENT_ROUTE.map((n) => n.id);
    const b = commissionBonus(save({ ownedTalents: all }));
    expect(b.rewardMult).toBeCloseTo(1.5);
    expect(b.speedMult).toBeCloseTo(1.2);
    expect(b.timeScale).toBeCloseTo(1 / 0.7);
    expect(b.uncapped).toBe(true);
    const withDouble = commissionBonus(save({ ownedTalents: [...all, "double_commission" as TalentId] }));
    expect(withDouble).toEqual(b);
  });

  it("解除封顶后 24h 仍在积累(12h 封顶那条被 eternal_factory 摘掉)", () => {
    const capped = effectiveHours(24, commissionBonus(save()));
    const uncapped = effectiveHours(24, commissionBonus(save({ ownedTalents: ["eternal_factory"] })));
    expect(capped).toBeCloseTo(7.5);
    expect(uncapped).toBeCloseTo(13.5);
    expect(COMMISSION_MAX_HOURS).toBe(12);
  });
});

/* ==================== 11. hitCommission(对标 Web onCommissionClick 的六段) ==================== */

describe("hitCommission(对标 Web onCommissionClick 的六段)", () => {
  it("列表态:区域行 → 难度钮 → 开始钮 → 兑换钮,各自中心都命中自己", () => {
    const L = commissionLayout(W, H_STD, 0);
    L.rows.forEach((r) => {
      const p = center(r.rect);
      expect(hitCommission(L, p.x, p.y)).toEqual({ kind: "region", id: r.id });
    });
    L.diffs.forEach((d) => {
      const p = center(d.rect);
      expect(hitCommission(L, p.x, p.y)).toEqual({ kind: "difficulty", level: d.level });
    });
    const s = center(L.startBtn);
    expect(hitCommission(L, s.x, s.y)).toEqual({ kind: "start" });
    const e = center(L.exchangeBtn);
    expect(hitCommission(L, e.x, e.y)).toEqual({ kind: "exchange" });
    const b = center(L.backBtn);
    expect(hitCommission(L, b.x, b.y)).toEqual({ kind: "back" });
  });

  it("面板态:逐面板的领取 / 放弃命中,序号就是面板序号", () => {
    const L = commissionLayout(W, H_STD, 2);
    L.panels.forEach((p) => {
      const col = center(p.collect);
      expect(hitCommission(L, col.x, col.y)).toEqual({ kind: "collect", index: p.index });
      const ab = center(p.abandon);
      expect(hitCommission(L, ab.x, ab.y)).toEqual({ kind: "abandon", index: p.index });
    });
    const b = center(L.backBtn);
    expect(hitCommission(L, b.x, b.y)).toEqual({ kind: "back" });
  });

  it("面板态下区域行 / 难度钮 / 开始钮 / 兑换钮都不参与命中(Web 在面板循环之后直接 return)", () => {
    const L = commissionLayout(W, H_STD, 1);
    for (const r of L.rows) {
      const p = center(r.rect);
      expect(hitCommission(L, p.x, p.y)).toBeNull();
    }
    for (const d of L.diffs) {
      const p = center(d.rect);
      expect(hitCommission(L, p.x, p.y)).toBeNull();
    }
    const s = center(L.startBtn);
    expect(hitCommission(L, s.x, s.y)).toBeNull();
    // 兑换钮在面板态照画(content.showExchange 仍可为真),却吞掉点击
    const e = center(L.exchangeBtn);
    expect(hitCommission(L, e.x, e.y)).toBeNull();
    const c = buildCommissionContent(withSlots(1, { fragments: 25 }), sel(), NOW, L);
    expect(c.showExchange).toBe(true);
  });

  it("矩形四角与边线都算命中(Web 的 >= x && <= x + w 闭区间)", () => {
    const L = commissionLayout(W, H_STD, 0);
    const r = L.rows[2].rect;
    for (const [x, y] of [
      [r.x, r.y],
      [right(r), r.y],
      [r.x, bottom(r)],
      [right(r), bottom(r)],
    ]) {
      expect(hitCommission(L, x, y)).toEqual({ kind: "region", id: L.rows[2].id });
    }
  });

  it("热区之外的空白不产任何动作(没有'其余一律'兜底)", () => {
    const L = commissionLayout(W, H_STD, 0);
    for (const [x, y] of [
      [0, 0],
      [W / 2, 80],
      [PAD + 1, bottom(L.rows[5].rect) + 5],
      [W - 1, H_STD - 1],
      [L.startBtn.x - 1, center(L.startBtn).y],
    ]) {
      expect(hitCommission(L, x, y), `(${x},${y})`).toBeNull();
    }
  });

  it("返回钮优先于其余热区(Web 的第一段判定),两态下都成立", () => {
    for (const slots of BRANCHES) {
      const L = commissionLayout(W, H_STD, slots);
      const b = center(L.backBtn);
      expect(hitCommission(L, b.x, b.y)).toEqual({ kind: "back" });
    }
  });

  it("命中层不看状态:锁定行与不够兑换都照样返回动作,静默留给 commissionClaim", () => {
    const L = commissionLayout(W, H_STD, 0);
    const locked = center(L.rows[5].rect);
    expect(hitCommission(L, locked.x, locked.y)).toEqual({ kind: "region", id: "diamond" });
    const e = center(L.exchangeBtn);
    expect(hitCommission(L, e.x, e.y)).toEqual({ kind: "exchange" });
    const s = save({ prestiges: 0, fragments: 0 });
    expect(commissionClaim(s, sel(), { kind: "region", id: "diamond" }, NOW)).toBeNull();
    expect(commissionClaim(s, sel(), { kind: "exchange" }, NOW)).toBeNull();
  });
});

/* ==================== 12. commissionClaim(动作 → 写入意图) ==================== */

describe("commissionClaim(唯一入档的四档;选中态两档是瞬时态)", () => {
  it("start 的槽位分配三分支:空槽 → commission;有 commission 且有双委托 → commission2;没有该天赋 → no-op", () => {
    const state = { region: "plains" as RegionId, difficulty: 1 };
    const a: CommissionAction = { kind: "start" };
    const first = commissionClaim(save(), sel(state), a, NOW);
    expect(first).toEqual({ kind: "start", persists: true, slot: "commission", state: { ...state, startedAt: NOW } });
    const busy = save({ commission: comm(), ownedTalents: ["double_commission"] });
    expect(commissionClaim(busy, sel(state), a, NOW)).toEqual({ kind: "start", persists: true, slot: "commission2", state: { ...state, startedAt: NOW } });
    const noTalent = save({ commission: comm() });
    expect(commissionClaim(noTalent, sel(state), a, NOW)).toBeNull();
    const bothFull = save({ commission: comm(), commission2: comm(), ownedTalents: ["double_commission"] });
    expect(commissionClaim(bothFull, sel(state), a, NOW)).toBeNull();
  });

  it("start 用选中态的区域与难度,startedAt 就是入参 now;区域锁定时直接 no-op", () => {
    const claim = commissionClaim(save({ prestiges: 5 }), sel({ region: "abyss", difficulty: 4 }), { kind: "start" }, NOW)!;
    expect(claim.kind).toBe("start");
    if (claim.kind !== "start") return;
    expect(claim.state).toEqual({ region: "abyss", difficulty: 4, startedAt: NOW });
    // 选中的区域锁着(存档没跟上)时不派遣,也不给任何提示
    expect(commissionClaim(save({ prestiges: 0 }), sel({ region: "abyss" }), { kind: "start" }, NOW)).toBeNull();
  });

  it("collect 的三种产出分流:碎片 / 星尘 / 钻石各加到一个字段,另两个恒 0", () => {
    const cases: [RegionId, "fragments" | "stardust" | "diamond", number][] = [
      ["plains", "fragments", Math.floor(30 * 1 * 3.5)],
      ["sanctum", "stardust", Math.floor(25 * 1 * 3.5)],
      ["diamond", "diamond", Math.floor(2 * 1 * 3.5)],
    ];
    for (const [region, field, reward] of cases) {
      const claim = commissionClaim(save({ commission: comm(region, 1, 4) }), sel(), { kind: "collect", index: 0 }, NOW, () => 0.99)!;
      expect(claim.kind).toBe("collect");
      if (claim.kind !== "collect") continue;
      expect(claim.slot).toBe("commission");
      expect([claim.fragments, claim.stardust, claim.diamond]).toEqual(
        field === "fragments" ? [reward, 0, 0] : field === "stardust" ? [0, reward, 0] : [0, 0, reward]
      );
      expect(claim.reward).toBe(reward);
      expect(claim.failed).toBe(false);
    }
  });

  it("collect 的券数 = commissionTickets(effectiveHours(hours, bonus)),hours 用同一个 now 重新算", () => {
    const plain = commissionClaim(save({ commission: comm("plains", 1, 4) }), sel(), { kind: "collect", index: 0 }, NOW, () => 0.99)!;
    if (plain.kind !== "collect") throw new Error("unreachable");
    expect(plain.gachaTicket).toBe(commissionTickets(effectiveHours(4)));
    expect(plain.gachaTicket).toBe(1);
    // 6h → 有效 4.5h → 1 张;9h → 有效 6h → 2 张
    expect((commissionClaim(save({ commission: comm("plains", 1, 9) }), sel(), { kind: "collect", index: 0 }, NOW, () => 0.99) as { gachaTicket: number }).gachaTicket).toBe(2);
    // 保底:刚开始就领也有 1 张
    expect((commissionClaim(save({ commission: comm("plains", 1, 0) }), sel(), { kind: "collect", index: 0 }, NOW, () => 0.99) as { gachaTicket: number }).gachaTicket).toBe(COMMISSION_TICKET_MIN);
    // 天赋把有效时长推过一档:4h × (1.2 × 1/0.7) 的券数按同一条公式走
    const boosted = save({ commission: comm("plains", 1, 4), ownedTalents: ["commission_speed", "time_compress"] });
    const b = commissionBonus(boosted);
    const claim = commissionClaim(boosted, sel(), { kind: "collect", index: 0 }, NOW, () => 0.99)!;
    if (claim.kind !== "collect") throw new Error("unreachable");
    expect(claim.gachaTicket).toBe(commissionTickets(effectiveHours(4, b)));
  });

  it("失败只把产出减半,不额外扣分:注入的 roll 分别钉死成功与失败两条", () => {
    const s = save({ commission: comm("plains", 5, 2) });
    const full = accruedReward(s.commission!, NOW, commissionBonus(s));
    expect(full).toBe(Math.floor(30 * 4 * 2));
    const ok = commissionClaim(s, sel(), { kind: "collect", index: 0 }, NOW, () => 0.99)!;
    const bad = commissionClaim(s, sel(), { kind: "collect", index: 0 }, NOW, () => 0)!;
    if (ok.kind !== "collect" || bad.kind !== "collect") throw new Error("unreachable");
    expect([ok.failed, ok.reward, ok.fragments]).toEqual([false, full, full]);
    expect([bad.failed, bad.reward, bad.fragments]).toEqual([true, Math.floor(full / 2), Math.floor(full / 2)]);
    // 与共享层同一结果(模型只是转调)
    expect(collectReward(s.commission!, NOW, () => 0, commissionBonus(s))).toEqual({ reward: Math.floor(full / 2), failed: true });
    // 难度 1 的失败率是 0,任何 roll 都算成功
    const easy = commissionClaim(save({ commission: comm("plains", 1, 2) }), sel(), { kind: "collect", index: 0 }, NOW, () => 0)!;
    if (easy.kind !== "collect") throw new Error("unreachable");
    expect(easy.failed).toBe(false);
  });

  it("collect 的槽位序号照面板序:第二枚面板领的是 commission2", () => {
    const s = withSlots(2);
    const claim = commissionClaim(s, sel(), { kind: "collect", index: 1 }, NOW, () => 0.99)!;
    if (claim.kind !== "collect") throw new Error("unreachable");
    expect(claim.slot).toBe("commission2");
    // 第二槽是腐蚀沼泽 · 难度 3 · 1h:走碎片那一路,另两个字段恒 0
    expect(claim.fragments).toBe(accruedReward(s.commission2!, NOW, commissionBonus(s)));
    expect(claim.fragments).toBe(Math.floor(45 * 2.2 * 1));
    expect([claim.stardust, claim.diamond]).toEqual([0, 0]);
    // 序号越界拿不到槽位 → null
    expect(commissionClaim(s, sel(), { kind: "collect", index: 2 }, NOW)).toBeNull();
    expect(commissionClaim(save(), sel(), { kind: "collect", index: 0 }, NOW)).toBeNull();
  });

  it("abandon 只清槽不发奖:三个产出字段与券数都不在意图里", () => {
    const claim = commissionClaim(withSlots(2), sel(), { kind: "abandon", index: 0 }, NOW)!;
    expect(claim).toEqual({ kind: "abandon", persists: true, slot: "commission" });
    expect(Object.keys(claim as object).sort()).toEqual(["kind", "persists", "slot"]);
    expect(commissionClaim(withSlots(2), sel(), { kind: "abandon", index: 1 }, NOW)).toEqual({ kind: "abandon", persists: true, slot: "commission2" });
    expect(commissionClaim(save(), sel(), { kind: "abandon", index: 0 }, NOW)).toBeNull();
  });

  it("exchange:n = floor(fragments / 10),扣 n×10 碎片、加 n 星尘;不够 10 时不可用", () => {
    expect(commissionClaim(save({ fragments: 9 }), sel(), { kind: "exchange" }, NOW)).toBeNull();
    expect(commissionClaim(save({ fragments: 0 }), sel(), { kind: "exchange" }, NOW)).toBeNull();
    const claim = commissionClaim(save({ fragments: 25 }), sel(), { kind: "exchange" }, NOW)!;
    expect(claim).toEqual({ kind: "exchange", persists: true, count: 2, fragmentsCost: 20, stardustGain: 2 });
    // 恰好 10 的那一档换 1 个、剩 0
    expect(commissionClaim(save({ fragments: 10 }), sel(), { kind: "exchange" }, NOW)).toEqual({ kind: "exchange", persists: true, count: 1, fragmentsCost: 10, stardustGain: 1 });
  });

  it("selectRegion 只有解锁的区域才改选中;selectDifficulty 无条件改", () => {
    const locked = save({ prestiges: 0 });
    expect(commissionClaim(locked, sel(), { kind: "region", id: "plains" }, NOW)).toEqual({ kind: "region", persists: false, region: "plains" });
    for (const id of ["swamp", "rift", "abyss", "sanctum", "diamond"] as RegionId[]) {
      expect(commissionClaim(locked, sel(), { kind: "region", id }, NOW), id).toBeNull();
    }
    // 转生够次之后同一枚区域就能改选中
    expect(commissionClaim(save({ prestiges: 7 }), sel(), { kind: "region", id: "diamond" }, NOW)).toEqual({ kind: "region", persists: false, region: "diamond" });
    for (const level of [1, 2, 3, 4, 5]) {
      expect(commissionClaim(locked, sel(), { kind: "difficulty", level }, NOW)).toEqual({ kind: "difficulty", persists: false, difficulty: level });
    }
  });

  it("back 不产写入意图(Web 是 `state = overlayFrom`,Cocos 侧由宿主回主菜单)", () => {
    expect(commissionClaim(save(), sel(), { kind: "back" }, NOW)).toBeNull();
  });

  it("六个动作里只有四档 persists 为真;选中态两档是瞬时态", () => {
    const s = save({ prestiges: 7, fragments: 25, commission: comm() , ownedTalents: ["double_commission"] });
    const persisting: boolean[] = [
      commissionClaim(s, sel(), { kind: "start" }, NOW)!.persists,
      commissionClaim(s, sel(), { kind: "collect", index: 0 }, NOW)!.persists,
      commissionClaim(s, sel(), { kind: "abandon", index: 0 }, NOW)!.persists,
      commissionClaim(s, sel(), { kind: "exchange" }, NOW)!.persists,
    ];
    const transient: boolean[] = [
      commissionClaim(s, sel(), { kind: "region", id: "diamond" }, NOW)!.persists,
      commissionClaim(s, sel(), { kind: "difficulty", level: 3 }, NOW)!.persists,
    ];
    expect(persisting).toEqual([true, true, true, true]);
    expect(transient).toEqual([false, false]);
  });

  it("意图是纯增量描述:不携带存档、不携带区域表、不携带难度表", () => {
    const claim = commissionClaim(save({ commission: comm() }), sel(), { kind: "collect", index: 0 }, NOW, () => 0.99)!;
    const keys = Object.keys(claim as object).sort();
    expect(keys).toEqual(["diamond", "failed", "fragments", "gachaTicket", "kind", "persists", "reward", "slot", "stardust"]);
    for (const k of keys) expect(typeof (claim as unknown as Record<string, unknown>)[k]).not.toBe("object");
  });

  it("模型不改传入的存档(deepFreeze 守:六个动作全跑一遍也不抛)", () => {
    const s = save({ prestiges: 7, fragments: 25, ownedTalents: ["double_commission"], commission: comm(), commission2: comm("swamp", 2, 1) });
    Object.freeze(s);
    Object.freeze(s.ownedTalents);
    Object.freeze(s.commission);
    Object.freeze(s.commission2);
    const actions: CommissionAction[] = [
      { kind: "back" },
      { kind: "region", id: "diamond" },
      { kind: "difficulty", level: 5 },
      { kind: "start" },
      { kind: "collect", index: 0 },
      { kind: "abandon", index: 1 },
      { kind: "exchange" },
    ];
    for (const a of actions) expect(() => commissionClaim(s, sel(), a, NOW, () => 0.5), a.kind).not.toThrow();
    buildCommissionContent(s, sel(), NOW, commissionLayout(W, H_STD, 2));
    expect(s.fragments).toBe(25);
  });
});

/* ==================== 13. 字面量锁:两条 Web 文案与表里的同源常量 ==================== */

describe("字面量锁(Web 基准里确实有这两串,且表里的两个常量与它同数)", () => {
  const web = webSource();

  it("Web 基准 src/game.ts 里逐字存在 `开始委托(4h)` 与 `收益前2h 100%,之后降至 50%`", () => {
    expect(web.includes("开始委托(4h)")).toBe(true);
    expect(web.includes("收益前2h 100%,之后降至 50%")).toBe(true);
    // 两串都在委托屏那一段里(drawCommission / drawCommissionPanel)
    const seg = web.slice(web.indexOf("private drawCommissionPanel("), web.indexOf("private onCommissionClick("));
    expect(seg.includes("收益前2h 100%,之后降至 50%")).toBe(true);
    expect(seg.includes("开始委托(4h)")).toBe(true);
  });

  it("本屏两串与 Web 逐字相同,且第三行后半句是照抄的字面量而不是从 COMMISSION_DECAY 插值", () => {
    expect(COMMISSION_START_TEXT).toBe("开始委托(4h)");
    expect(COMMISSION_DECAY_NOTE).toBe("收益前2h 100%,之后降至 50%");
    expect(frame(0).c.startText).toBe("开始委托(4h)");
    expect(frame(1).c.panels[0].line3.endsWith(COMMISSION_DECAY_NOTE)).toBe(true);
    const model = fileSource("../cocos/assets/scripts/commission/CommissionModel.ts");
    expect(model.includes('= "收益前2h 100%,之后降至 50%"')).toBe(true);
    expect(model.includes("收益前${")).toBe(false);
  });

  it("表里的两个常量与那串文案同数:fullHours === 2、floorRate === 0.5(改表就会撞上这条,被迫回头处理文案)", () => {
    expect(COMMISSION_DECAY.fullHours).toBe(2);
    expect(COMMISSION_DECAY.floorRate).toBe(0.5);
    expect(COMMISSION_DECAY_NOTE).toBe(`收益前${COMMISSION_DECAY.fullHours}h 100%,之后降至 ${Math.round(COMMISSION_DECAY.floorRate * 100)}%`);
  });

  it("`开始委托(4h)` 里的 4 在表里没有对应常量:封顶是 12、提醒门槛是 2、衰减终点才是 4", () => {
    expect(COMMISSION_MAX_HOURS).toBe(12);
    expect(COMMISSION_READY_HOURS).toBe(2);
    expect(COMMISSION_DECAY.decayEndHours).toBe(4);
    // Web 基准里那串就是裸字面量,不由任何常量插值
    expect(web.includes("`开始委托(4h)`")).toBe(true);
    expect(web.includes("开始委托(${")).toBe(false);
  });
});

/* ==================== 14. phase4 表的 cm* 段 ==================== */

describe("phase4 表的 cm* 段(默认值逐项对标 Web drawCommission / drawCommissionPanel)", () => {
  const D = phase4Defaults();
  const CM_KEYS = Object.keys(D).filter((k) => k.startsWith("cm"));
  const web = webSource();
  const draw = web.slice(web.indexOf("private drawCommission("), web.indexOf("private onCommissionClick("));
  const panel = web.slice(web.indexOf("private drawCommissionPanel("), web.indexOf("private drawCommission("));

  it("本屏一共 47 键,且都以 cm 开头", () => {
    expect(CM_KEYS).toHaveLength(47);
    expect(CM_KEYS.every((k) => /^cm[A-Z]/.test(k))).toBe(true);
  });

  it("覆盖底、标题与三项读数与 Web 一致(标题色就是 skinHeader 的 color 实参)", () => {
    expect(D.cmDim).toBe("rgba(8,10,16,0.86)");
    expect(D.cmTitle).toBe("#C8B6FF");
    expect(D.cmFragmentText).toBe("#C8B6FF");
    expect(D.cmFragmentGlyph).toBe("✧");
    expect(D.cmStardustText).toBe("#7FD8FF");
    expect(D.cmStardustGlyph).toBe("❋");
    expect(D.cmPrestiges).toBe("#8F9BB3");
    expect(draw.includes('"banner_title_iron", "委托挂机", pad, 36, "#c8b6ff"')).toBe(true);
    expect(draw.includes('"icon_fragment", "✧"')).toBe(true);
    expect(draw.includes('"icon_stardust", "❋"')).toBe(true);
  });

  it("兑换钮与返回钮各三件", () => {
    expect([D.cmExchangeBg, D.cmExchangeStroke, D.cmExchangeText]).toEqual(["#3A2D4D", "#C06CFF", "#C8B6FF"]);
    expect([D.cmBackBg, D.cmBackStroke, D.cmBackText]).toEqual(["#2A3D55", "rgba(255,255,255,0.3)", "#CFCFCF"]);
    expect(draw.includes('g.fillStyle = "#3a2d4d"')).toBe(true);
    expect(draw.includes('g.strokeStyle = "#c06cff"')).toBe(true);
    expect(draw.includes('"btn_back"')).toBe(true);
    expect(draw.includes('g.strokeStyle = "rgba(255,255,255,0.3)"')).toBe(true);
  });

  it("羊皮纸面板:缺图回退两件 + 文字两档四件(命中贴图切深色,这是 Web 点明的唯一改文字色处)", () => {
    expect([D.cmPanelFallbackBg, D.cmPanelFallbackStroke]).toEqual(["rgba(255,255,255,0.05)", "rgba(200,182,255,0.35)"]);
    expect([D.cmPanelLine1OnParch, D.cmPanelLine1Bare]).toEqual(["#2A2A33", "#E8E8E8"]);
    expect([D.cmPanelSubOnParch, D.cmPanelSubBare]).toEqual(["#4A4A55", "#8F9BB3"]);
    expect(panel.includes('g.fillStyle = parch ? "#2a2a33" : "#e8e8e8"')).toBe(true);
    expect(panel.includes('g.fillStyle = parch ? "#4a4a55" : "#8f9bb3"')).toBe(true);
    expect(panel.includes('"panel_parchment"')).toBe(true);
    expect(panel.includes('g.fillStyle = "rgba(255,255,255,0.05)"')).toBe(true);
    expect(panel.includes('g.strokeStyle = "rgba(200,182,255,0.35)"')).toBe(true);
  });

  it("进度条三件(缺图档轨道与填充 + 贴图档暗罩)与两枚面板钮各三件", () => {
    expect([D.cmBarFallbackTrack, D.cmBarFallbackFill, D.cmBarCover]).toEqual(["rgba(255,255,255,0.12)", "#4DFFC8", "rgba(10,12,18,0.72)"]);
    expect([D.cmCollectBg, D.cmCollectStroke, D.cmCollectText]).toEqual(["#1D3D2E", "#4DFFC8", "#4DFFC8"]);
    expect([D.cmAbandonBg, D.cmAbandonStroke, D.cmAbandonText]).toEqual(["#2A1D1D", "rgba(255,90,90,0.4)", "#FF8A8A"]);
    expect(panel.includes('"bar_progress_teal"')).toBe(true);
    expect(panel.includes('g.fillStyle = "#1d3d2e"')).toBe(true);
    expect(panel.includes('g.strokeStyle = "#4dffc8"')).toBe(true);
    expect(panel.includes('g.fillStyle = "#2a1d1d"')).toBe(true);
    expect(panel.includes('g.strokeStyle = "rgba(255,90,90,0.4)"')).toBe(true);
    expect(panel.includes('g.fillStyle = "#ff8a8a"')).toBe(true);
  });

  it("区域行:两档底板四件 + 名字三档 + 第二行与右对齐产出各一件", () => {
    expect([D.cmRowSelFill, D.cmRowSelStroke, D.cmRowFill, D.cmRowStroke]).toEqual(["rgba(200,182,255,0.14)", "#C8B6FF", "rgba(255,255,255,0.04)", "rgba(255,255,255,0.12)"]);
    expect([D.cmRowNameSel, D.cmRowName, D.cmRowNameLocked]).toEqual(["#C8B6FF", "#E8E8E8", "#5A6A80"]);
    expect([D.cmRowSub, D.cmRowRate]).toEqual(["#8F9BB3", "#C8B6FF"]);
    expect(draw.includes('sel ? "rgba(200,182,255,0.14)" : "rgba(255,255,255,0.04)"')).toBe(true);
    expect(draw.includes('sel ? "#c8b6ff" : "rgba(255,255,255,0.12)"')).toBe(true);
    expect(draw.includes('unlocked ? (sel ? "#c8b6ff" : "#e8e8e8") : "#5a6a80"')).toBe(true);
  });

  it("难度钮两档四件 + 文字两档 + 说明一件;开始钮三件(描边宽度 2 在共享层)", () => {
    expect([D.cmDiffSelFill, D.cmDiffSelStroke, D.cmDiffFill, D.cmDiffStroke]).toEqual(["#FFD76A", "#FFD76A", "#2A3D55", "rgba(255,255,255,0.2)"]);
    expect([D.cmDiffSelText, D.cmDiffText, D.cmDiffLabel]).toEqual(["#0B0E14", "#CFCFCF", "#8F9BB3"]);
    expect([D.cmStartBg, D.cmStartStroke, D.cmStartText]).toEqual(["#2A3D55", "#5AC8FA", "#FFFFFF"]);
    expect(CM_START_STROKE_W).toBe(2);
    expect(draw.includes('sel ? "#ffd76a" : "#2a3d55"')).toBe(true);
    expect(draw.includes('sel ? "#ffd76a" : "rgba(255,255,255,0.2)"')).toBe(true);
    expect(draw.includes('g.fillStyle = sel ? "#0b0e14" : "#cfcfcf"')).toBe(true);
    expect(draw.includes('g.strokeStyle = "#5ac8fa"')).toBe(true);
    expect(draw.includes("g.lineWidth = 2;")).toBe(true);
    expect(draw.includes("g.lineWidth = 1;")).toBe(true);
  });

  it("表里只有色与字形,不含几何数:45 个色键全以 # 或 rgba 起头(两个替代字形键除外)", () => {
    const glyphs = ["cmFragmentGlyph", "cmStardustGlyph"];
    expect(CM_KEYS.filter((k) => glyphs.includes(k))).toHaveLength(2);
    for (const k of CM_KEYS) {
      if (glyphs.includes(k)) continue;
      expect(/^#[0-9A-Fa-f]{6}$|^rgba?\(/.test(D[k]), k).toBe(true);
    }
  });

  it("hud 段那条 commissionText 不在本屏重复定义(cm* 段里没有同名键)", () => {
    expect(CM_KEYS.includes("commissionText")).toBe(false);
    const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
    expect((src.match(/commissionText:/g) ?? []).length).toBe(1);
  });
});

/* ==================== 15. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = ["../cocos/assets/scripts/game/ui/commissionLayout.ts", "../cocos/assets/scripts/commission/CommissionModel.ts"];

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

  it("共享层不读存档:面板条数是入参,解锁与拥有态一概不查", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/game/ui/commissionLayout.ts"));
    for (const bad of ["save.", "this.save", "s.prestiges", "ownedTalents", "commission2", "regionUnlocked", "owns(", "persistSave", "difficultyOf(", "accruedReward(", "effectiveHours(", "CommissionState"]) {
      expect(src.includes(bad), bad).toBe(false);
    }
    // 行数与钮数直接读两张表,不复制条数
    expect(src.includes("REGIONS.length")).toBe(true);
    expect(src.includes("DIFFICULTIES.length")).toBe(true);
  });

  it("模型不写存档、不碰广告通道、不碰路由、不自己取时间", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/commission/CommissionModel.ts"));
    for (const bad of ["persist(", "persistSave", "writeSave", "watchAd", "showRewardedAd", "localStorage", "router.show", "Date.now(", "save.fragments +=", "save.stardust +=", "save.commission ="]) {
      expect(src.includes(bad), bad).toBe(false);
    }
    // 时间与随机源都是形参
    expect(src.includes("now: number")).toBe(true);
    expect(src.includes("roll: () => number = Math.random")).toBe(true);
  });

  it("模型不复制判据:查表、解锁门、加成、衰减、券数全部转调既有函数", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/commission/CommissionModel.ts"));
    for (const good of ["regionOf(", "difficultyOf(", "regionUnlocked(", "offlineBonusFor(", "commissionSpeedFor(", "commissionTimeScaleFor(", "uncappedCommissionFor(", "effectiveHours(", "accruedReward(", "collectReward(", "commissionTickets(", "FRAGMENT_TO_STARDUST"]) {
      expect(src.includes(good), good).toBe(true);
    }
    // 没有任何一处把衰减曲线、券数或失败减半写成字面量(三条都住在共享层表函数里)
    expect(src.includes("0.75")).toBe(false);
    expect(src.includes("COMMISSION_TICKET_HOURS")).toBe(false);
    expect(src.includes("COMMISSION_DECAY.")).toBe(false);
    expect(src.includes("reward / 2")).toBe(false);
  });
});

/* ==================== 16. 视图层纪律 ==================== */

describe("CommissionView 的纪律:几何全来自共享层、文本只走 placeLine、两棵子树整体切换", () => {
  const src = fileSource("../cocos/assets/scripts/commission/CommissionView.ts");
  const code = codeOf(src);

  it("视图不产几何:不自算 diffY / bw / 面板 y,一律读 layout", () => {
    for (const bad of ["diffY =", "h - ui.pad", "(w - pad", "bw =", "topY +", "panelH"]) expect(code.includes(bad), bad).toBe(false);
    for (const good of ["L.startBtn", "L.rows", "L.diffs", "L.panels", "L.exchangeBtn", "L.backBtn", "L.headerBanner", "L.pose", "L.diffLabel"]) expect(code.includes(good), good).toBe(true);
  });

  it("文本只有 placeLine 一个入口,七个贴图键都收在常量里", () => {
    expect(code.includes("placeLine(")).toBe(true);
    expect(code.includes("new Label(")).toBe(false);
    for (const k of ["banner_title_iron", "player_pose_6", "icon_fragment", "icon_stardust", "btn_back", "panel_parchment", "bar_progress_teal"]) {
      expect(src.includes(`"${k}"`), k).toBe(true);
    }
  });

  it("两个分支用节点 active 整棵切换(不用透明度也不用位移藏)", () => {
    expect(code.includes("this.panelsNode.active = c.panelMode;")).toBe(true);
    expect(code.includes("this.listNode.active = !c.panelMode;")).toBe(true);
    expect(code.includes("UIOpacity")).toBe(false);
  });

  it("羊皮纸命中与否决定文字色档(Plate.show 的返回值就是 Web 的 parch)", () => {
    expect(code.includes('"stretch"')).toBe(true);
    expect(code.includes("parch ? p4.cmPanelLine1OnParch : p4.cmPanelLine1Bare")).toBe(true);
    expect(code.includes("parch ? p4.cmPanelSubOnParch : p4.cmPanelSubBare")).toBe(true);
  });

  it("开始钮的描边宽度取共享层那一档(不在视图里写 2)", () => {
    expect(code.includes("CM_START_STROKE_W")).toBe(true);
    expect(code.includes(", 2)")).toBe(false);
  });

  it("命中判定转调模型,视图不自己比矩形", () => {
    expect(code.includes("hitCommission(")).toBe(true);
    expect(code.includes("x >= ")).toBe(false);
  });

  it("Capture 建在最后,两棵子树都在它之前(节点次序决定热区不被盖住)", () => {
    expect(code.indexOf("this.panelsNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.listNode = makeNode")).toBeLessThan(code.indexOf("this.capture = makeNode"));
    expect(code.indexOf("this.start = ")).toBeLessThan(code.indexOf("this.capture = makeNode"));
  });

  it("行与钮的槽数取两张表的长度(池长不会与表脱钩)", () => {
    expect(code.includes("i < REGIONS.length")).toBe(true);
    expect(code.includes("i < DIFFICULTIES.length")).toBe(true);
  });
});

/* ==================== 17. 宿主接线:五件套 + 路由注册 + 占位提示下线 ==================== */

describe("GameShell 的委托挂机屏接线", () => {
  const src = fileSource("../cocos/assets/scripts/GameShell.ts");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildCommissionScreen", "commissionSave", "openCommission", "syncCommission", "onCommissionAction", "commitCommissionClaim"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildCommissionScreen();")).toBe(true);
    expect(src.indexOf("this.buildCommissionScreen();")).toBeGreaterThan(src.indexOf("this.buildPrestigeScreen();"));
    expect(src.includes("commission: () => this.syncCommission(),")).toBe(true);
    expect(src.includes('"gacha", "prestige", "commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("路由实际注册十六屏(SCREEN_KEYS 仍是 16 态全量)", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(keysBlock[1].includes('"commission"')).toBe(true);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(13);
  });

  it("入口从占位轻提示换成 openCommission,占位表已随最后一屏落地整表下线", () => {
    expect(src.includes('if (a.entry === "commission")')).toBe(true);
    expect(src.includes("this.openCommission();")).toBe(true);
    expect(src.includes("委托尚未开放")).toBe(false);
    expect(src.includes("PENDING_SCREEN")).toBe(false);
  });

  it("晚到贴图流到位后本屏也换引用并在当前屏时补排一次", () => {
    expect(src.includes("this.commissionView?.setFrames(this.frames);")).toBe(true);
    expect(src.includes('if (this.router.current === "commission") this.commissionView?.sync();')).toBe(true);
  });

  it("几何与内容都经宿主投影现算(视图不读存档),时间在这一层注入", () => {
    const seg = src.slice(src.indexOf("private buildCommissionScreen"), src.indexOf("private commissionSave"));
    expect(seg.includes("commissionScreenLayout(DESIGN_W, logicalH(), commissionSlots(this.commissionSave()).length)")).toBe(true);
    expect(seg.includes("buildCommissionContent(this.commissionSave(), this.commSel, Date.now(), L)")).toBe(true);
    const slice = src.slice(src.indexOf("private commissionSave"), src.indexOf("private openCommission"));
    for (const f of ["fragments: s.fragments", "stardust: s.stardust", "prestiges: s.prestiges", "ownedTalents: s.ownedTalents", "commission: s.commission", "commission2: s.commission2"]) {
      expect(slice.includes(f), f).toBe(true);
    }
  });

  it("选中态挂在宿主上且不入档(对标 Web 的 commRegion / commDifficulty 两个实例字段)", () => {
    expect(src.includes("private commissionView: CommissionView | null = null;")).toBe(true);
    expect(src.includes("private commSel: CommissionSelection = { ...COMMISSION_DEFAULT_SELECTION };")).toBe(true);
    expect(COMMISSION_DEFAULT_SELECTION).toEqual({ region: "plains", difficulty: 1 });
    // 存档模型里没有这两个字段:选中态永远读不到盘上
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    expect(saveModel.includes("commRegion")).toBe(false);
    expect(saveModel.includes("commDifficulty")).toBe(false);
    expect(saveModel.includes("commSel")).toBe(false);
  });

  it("动作处理里不直接改存档字段:写入全集中在 commit 函数里", () => {
    const act = codeOf(src.slice(src.indexOf("private onCommissionAction"), src.indexOf("private commitCommissionClaim")));
    for (const bad of ["save.", "persist(", "this.save()", "fragments", "stardust", "diamond", "gachaTicket", "commission =", "commission2 ="]) {
      expect(act.includes(bad), bad).toBe(false);
    }
    expect(act.includes("commissionClaim(this.commissionSave(), this.commSel, a, Date.now())")).toBe(true);
    expect(act.includes("this.commitCommissionClaim(claim)")).toBe(true);
    expect(act.includes('this.router.show("menu")')).toBe(true);
    const commit = codeOf(src.slice(src.indexOf("private commitCommissionClaim"), src.indexOf("private tickCommission")));
    expect(commit.includes("this.sim?.persist();")).toBe(true);
    expect(commit.includes("save.fragments += claim.fragments;")).toBe(true);
    expect(commit.includes("save.stardust += claim.stardust;")).toBe(true);
    expect(commit.includes("save.diamond += claim.diamond;")).toBe(true);
    expect(commit.includes("save.gachaTicket += claim.gachaTicket;")).toBe(true);
    expect(commit.includes("save[claim.slot] = null;")).toBe(true);
    expect(commit.includes("save[claim.slot] = { ...claim.state };")).toBe(true);
    expect(commit.includes("save.fragments -= claim.fragmentsCost;")).toBe(true);
    expect(commit.includes("this.commSel.region = claim.region;")).toBe(true);
    expect(commit.includes("this.commSel.difficulty = claim.difficulty;")).toBe(true);
    expect(commit.includes("this.refreshMenu();")).toBe(true);
  });

  it("本屏不走广告入口(没有为它新增 watchAd 调用)", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 委托挂机屏"), src.indexOf("/* ================= 词缀融合屏")));
    expect(seg.includes("watchAd(")).toBe(false);
    expect(seg.includes("showRewardedAd")).toBe(false);
  });

  it("面板态的实时读数由 tickCommission 周期重排,并挂在主循环的路由闸门之前", () => {
    expect(src.includes("private tickCommission(dt: number): void")).toBe(true);
    const tick = src.slice(src.indexOf("private tickCommission"), src.indexOf("/* ================= 词缀融合屏"));
    expect(tick.includes('this.router.current !== "commission"')).toBe(true);
    expect(tick.includes("COMMISSION_TICK_SECONDS")).toBe(true);
    const upd = src.slice(src.indexOf("update(dt: number): void"));
    expect(upd.indexOf("this.tickCommission(dt);")).toBeGreaterThan(0);
    expect(upd.indexOf("this.tickCommission(dt);")).toBeLessThan(upd.indexOf("if (this.router.blocksPlay()) return;"));
  });
});

/* ==================== 18. 与 Web 的对照:反直觉口径 ==================== */

describe("Web 基准的几条反直觉口径已原样带上", () => {
  const web = webSource();
  const layout = web.slice(web.indexOf("private commissionLayout()"), web.indexOf("/** 进行中的委托槽位"));
  const panel = web.slice(web.indexOf("private drawCommissionPanel("), web.indexOf("private drawCommission("));
  const draw = web.slice(web.indexOf("private drawCommission("), web.indexOf("private onCommissionClick("));
  const click = web.slice(web.indexOf("private onCommissionClick("), web.indexOf("/** 委托天赋加成"));

  it("Web 的 commissionLayout 里 collectBtn / abandonBtn 是四零占位,真矩形在 drawCommissionPanel 里逐面板重建", () => {
    expect(layout.includes("const collectBtn = { x: 0, y: 0, w: 0, h: 0 };")).toBe(true);
    expect(layout.includes("const abandonBtn = { x: 0, y: 0, w: 0, h: 0 };")).toBe(true);
    expect(panel.includes("const collect = { x: w - ui.pad - 2 * 112 - 8, y: y + h - 44, w: 112, h: 36 };")).toBe(true);
    expect(panel.includes("const abandon = { x: w - ui.pad - 112, y: y + h - 44, w: 112, h: 36 };")).toBe(true);
  });

  it("有活动槽位时 Web 在面板循环之后直接 return:区域列表 / 难度 / 开始钮全都不画", () => {
    expect(draw.includes("const slots = this.activeCommissionSlots();")).toBe(true);
    expect(draw.includes("if (slots.length > 0) {")).toBe(true);
    expect(draw.includes("const panelH = 150;")).toBe(true);
    expect(draw.includes("const topY = 84;")).toBe(true);
    expect(draw.includes("topY + i * (panelH + 12)")).toBe(true);
    // 那个 return 在区域列表之前
    expect(draw.indexOf("return;")).toBeLessThan(draw.indexOf("// 区域列表"));
    // 兑换钮与返回钮在 return 之前绘制,于是两态都画
    expect(draw.indexOf("FRAGMENT_TO_STARDUST")).toBeLessThan(draw.indexOf("if (slots.length > 0)"));
    expect(draw.indexOf("skinIconButton")).toBeLessThan(draw.indexOf("if (slots.length > 0)"));
  });

  it("面板态下兑换钮的命中判定在 return 之后:照画却点不动", () => {
    expect(click.indexOf("if (this.activeCommissionSlots().length > 0) {")).toBeLessThan(click.indexOf("if (this.save.fragments >= FRAGMENT_TO_STARDUST &&"));
    const panelBranch = click.slice(click.indexOf("if (this.activeCommissionSlots().length > 0) {"), click.indexOf("// 区域选择"));
    expect(panelBranch.trim().endsWith("return;\n    }")).toBe(true);
    expect(panelBranch.includes("FRAGMENT_TO_STARDUST")).toBe(false);
  });

  it("进度条:Web 传给 skinBar 的是未钳制的 hours / 2,只有缺图回退分支自己写了 Math.min", () => {
    expect(panel.includes('"bar_progress_teal", ui.pad + 8, y + h - 58, 200, 8, hours / 2')).toBe(true);
    expect(panel.includes("200 * Math.min(1, hours / 2)")).toBe(true);
    expect((panel.match(/Math\.min\(1, hours \/ 2\)/g) ?? []).length).toBe(1);
  });

  it("选中态是实例字段、从不落盘:Web 的 persistSave 只跟在这四处之后", () => {
    expect(web.includes('private commRegion: RegionId = "plains";')).toBe(true);
    expect(web.includes("private commDifficulty = 1;")).toBe(true);
    // 改选中态那一支只写字段,不调 persistSave
    const regionHit = click.slice(click.indexOf("// 区域选择"), click.indexOf("// 难度选择"));
    expect(regionHit.includes("this.commRegion = r.id;")).toBe(true);
    expect(regionHit.includes("persistSave")).toBe(false);
    const diffHit = click.slice(click.indexOf("// 难度选择"), click.indexOf("// 开始委托"));
    expect(diffHit.includes("this.commDifficulty = d.level;")).toBe(true);
    expect(diffHit.includes("persistSave")).toBe(false);
  });

  it("锁定行吞掉点击:Web 在命中之后才查解锁,不解锁就什么都不写", () => {
    const regionHit = click.slice(click.indexOf("// 区域选择"), click.indexOf("// 难度选择"));
    expect(regionHit.includes("if (regionUnlocked(region, this.save.prestiges, this.save.ownedTalents)) {")).toBe(true);
    expect(regionHit.indexOf("regionUnlocked")).toBeGreaterThan(regionHit.indexOf("p.x >= r.x"));
  });

  it("startCommission 的三处静默:区域锁定 / 无空槽 / 没有双委托,全程不提示", () => {
    const start = web.slice(web.indexOf("private startCommission()"), web.indexOf("private collectCommission("));
    expect(start.includes("if (!regionUnlocked(region, this.save.prestiges, this.save.ownedTalents)) return;")).toBe(true);
    expect(start.includes("if (!this.save.commission) {")).toBe(true);
    expect(start.includes('} else if (!this.save.commission2 && this.owns("double_commission")) {')).toBe(true);
    expect(start.includes("return; // 无空槽位")).toBe(true);
    expect(start.includes("toast")).toBe(false);
    expect(start.includes("startedAt: Date.now()")).toBe(true);
  });

  it("collectCommission 的产出分流与券数:hours 用同一个 now 重新算,失败不额外扣分", () => {
    const collect = web.slice(web.indexOf("private collectCommission("), web.indexOf("/* ---------- 工具 ----------"));
    expect(collect.includes("if (region.givesStardust) {")).toBe(true);
    expect(collect.includes("} else if (region.givesDiamond) {")).toBe(true);
    expect(collect.includes("this.save.fragments += reward;")).toBe(true);
    expect(collect.includes("const hours = (Date.now() - c.startedAt) / 3600000;")).toBe(true);
    expect(collect.includes("this.save.gachaTicket += commissionTickets(effectiveHours(hours, this.commissionBonus()));")).toBe(true);
    expect(collect.includes("this.save[slot] = null;")).toBe(true);
    expect(collect.includes("void failed; // 失败已在奖励中体现(减半)")).toBe(true);
  });

  it("放弃没有二次确认:Web 在命中处直接把槽位写成 null 并落盘", () => {
    expect(click.includes("this.save[b.slot] = null;")).toBe(true);
    expect(click.includes("this.confirm")).toBe(false);
  });

  it("overlayFrom 三态与两个入口:主菜单委托钮走 openCommission(\"menu\")", () => {
    expect(web.includes('private overlayFrom: "playing" | "shop" | "menu" = "playing";')).toBe(true);
    expect(web.includes('private openCommission(from: "playing" | "menu" = "playing"): void {')).toBe(true);
    expect(web.includes('this.openCommission("menu");')).toBe(true);
    expect((web.match(/this\.openCommission\(/g) ?? []).length).toBe(2);
    // 返回时 playing 那一档回到 playing,其余回到 overlayFrom 本身
    expect(click.includes('this.state = this.overlayFrom === "playing" ? "playing" : this.overlayFrom;')).toBe(true);
  });

  it("commissionReady 是主菜单红点与战场顶坞行情条共用的判据(读两个槽位的 startedAt)", () => {
    const ready = web.slice(web.indexOf("private commissionReady()"), web.indexOf("private commissionReady()") + 400);
    expect(ready.includes("[this.save.commission, this.save.commission2].some(")).toBe(true);
    expect(ready.includes(">= COMMISSION_READY_HOURS")).toBe(true);
    // Cocos 侧同一判据已在 MenuContentModel 里,宿主落账后重算主菜单
    const menu = fileSource("../cocos/assets/scripts/menu/MenuContentModel.ts");
    expect(menu.includes("[save.commission, save.commission2].some(")).toBe(true);
    expect(menu.includes("COMMISSION_READY_HOURS")).toBe(true);
  });
});
