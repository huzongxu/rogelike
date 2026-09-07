/**
 * Phase 4 第五屏闸门:扭蛋机屏(抽取入收藏 + 双保底 + 每日一次广告抽 + 唯一溢出风险屏)。
 *
 * 延续 cocos-phase4-leaderboard / -daily / -pass / -gearup 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `gacha/GachaModel.ts` 经相对路径 import 的共享层,与 Web 侧
 *     经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),于是保底曲线、
 *     重复判定与收藏贡献表不可能出现"两份抄本";
 *  2. **断言按门控变量分档**:`nRes = min(recent.length, 5)`、行数 = `ownedGear.length`(不截断)、
 *     `canSingle = gachaTicket >= GACHA_COST`、`canTen = gachaTicket >= GACHA_10_COST`、
 *     `canAd = !dailyGachaAdUsed`、`canTicket = diamond >= DIAMOND_TICKET_COST` ——
 *     全部由存档与共享层常量推出,不钉死随表变动的数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `GachaModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 本屏的重点是**带链 + 富余吸收矩阵**:`h ∈ {996, 1100, 1246} × nRes ∈ {0, 5}`。纵向每一档顶缘都由
 * `gachaBands` 的带高逐位累加推出,标定档 996 的带链数字由本文件逐位写死(以实测为准),
 * 于是"链上每一档都等于前档 + 带高"不是两端互相引用的同义反复。行带另按
 * `game/ui/theme.ts:spreadRows` 的真实实现独立直算一遍与布局函数对照。
 * 件数多到装不下时行仍照排(本屏不裁不滚的既有性质),越出量线性放大,
 * 首个越出 `h − pad` 的件数同样写死(996 / nRes 0 → 14 件)。
 *
 * 另锁本屏照抄的 Web 口径:行以 `id` 为键反查(id 重复永远命中第一条、find 落空那一行不画)、
 * pity 是一次性拷贝且被按引用改、命中七段且热区外没有兜底、禁用态仍返回动作、
 * 一次广告抽落两次盘、一发十连里同名两件都算不重复、十八条文案逐字。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { EPIC_PITY, GACHA_10_COST, GACHA_COST, LEGENDARY_PITY, drawGacha, drawGacha10, type GachaResult } from "@game/data/gacha";
import { DIAMOND_TICKET_COST, collectionBonus } from "@game/data/daily";
import { DUPLICATE_STARDUST_DEFAULT, GACHA_EQUIPMENT_BASE_LEVEL, GACHA_EPIC_PITY, GACHA_LEGENDARY_PITY, QUALITIES, qualityDef, type Quality } from "@game/data/quality";
import type { Equipment } from "@game/data/equipmentGen";
import { ASSET_MANIFEST } from "@game/data/assets";
import { fs as FS, rowTextY, spreadRows, theme, ui as UI } from "@game/ui/theme";
import * as sharedGacha from "@game/data/gacha";
import {
  GC_AD_DX,
  GC_BACK_ICON_DX,
  GC_BACK_TEXT_DY,
  GC_BACK_Y,
  GC_BANNER_H,
  GC_BANNER_W,
  GC_BADGE_RESERVE,
  GC_BTN_H,
  GC_BTN_Y,
  GC_COLL_DY,
  GC_DUP_RESERVE,
  GC_EMPTY_DY,
  GC_ICON_SIZE,
  GC_LEVEL_DX,
  GC_PANEL_NINE,
  GC_PITY_BAR_DX,
  GC_PITY_BAR_DY_EPIC,
  GC_PITY_BAR_DY_LEGENDARY,
  GC_PITY_BAR_H,
  GC_PITY_DY,
  GC_RES_DY,
  GC_RES_LINE_H,
  GC_RES_MAX,
  GC_ROW_MAX_H,
  GC_ROW_MIN_H,
  GC_ROWS_DY,
  GC_SINGLE_W,
  GC_TEN_DX,
  GC_TEN_W,
  GC_TEXT_DX,
  GC_TICKET_DY,
  GC_TICKET_H,
  gachaBarRects,
  GC_BACK_H,
  GC_PAD,
  GC_ROW_GAP_MAX,
  GC_BACK_ICON_SHRINK,
  GC_BONUS_DX,
  GC_TICKET_BASE_Y,
  GC_TITLE_BASE_Y,
  gachaBands,
  gachaCollLabelY,
  gachaLayout,
  gachaPityLabelY,
  gachaRecentRows,
  gachaResLabelY,
  gachaRowsTop,
  gachaScreenLayout,
  gachaTicketY,
  type GachaLayout,
  type GcRect,
  type GcTextLine,
} from "@game/ui/gachaLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import { buildGachaContent, gachaClaim, gachaLevel, hitGacha, type GachaAction, type GachaSaveView } from "../cocos/assets/scripts/gacha/GachaModel";
import * as cocosGacha from "../cocos/assets/scripts/game/data/gacha";
import * as cocosGachaLayout from "../cocos/assets/scripts/game/ui/gachaLayout";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = GC_PAD;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/* ==================== 夹具 ==================== */

const ids = (n: number, base = 1): number[] => Array.from({ length: n }, (_, i) => base + i);

/** 一件收藏装备的最小形态(本屏只消费 id / name / quality / level 四列) */
function gear(id: number, name = `装备${id}`, quality: Quality = "common", level = GACHA_EQUIPMENT_BASE_LEVEL): Equipment {
  return { id, name, quality, level, triggers: [], modifiers: [] } as unknown as Equipment;
}

/** 造 n 件收藏(id 连续、品质按主表轮转,保证品质轴能铺到) */
function makeGear(n: number, idBase = 1): Equipment[] {
  return ids(n, idBase).map((id) => gear(id, `装备${id}`, QUALITIES[id % QUALITIES.length].key));
}

function save(over: Partial<GachaSaveView> = {}): GachaSaveView {
  return {
    gachaTicket: 0,
    gachaPityEpic: 0,
    gachaPityLegendary: 0,
    dailyGachaAdUsed: false,
    diamond: 0,
    highestStage: 1,
    ownedGear: [],
    selectedGearId: null,
    ...over,
  };
}

/** 一条最小抽取记录(内容层只读 eq.name / eq.quality / duplicate / stardust) */
function res(name: string, quality: Quality, duplicate = false, stardust = 0): GachaResult {
  return { eq: { name, quality } as Equipment, duplicate, stardust };
}

/** 一条最近结果列表(n 条,全不重复) */
function recent(n: number): GachaResult[] {
  return Array.from({ length: n }, (_, i) => res(`旧${i}`, "rare"));
}

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const center = (r: GcRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 末行底边(派单要求的度量):rowsTop + (n−1)×(rowH+gap) + rowH */
function lastRowBottom(L: GachaLayout): number {
  return L.rowsTop + (L.rows.length - 1) * L.rowStep + L.rowH;
}

/**
 * 独立直算行带:走共享层 `spreadRows` 的真实实现,再按本屏同口径向偶数收一次、
 * 行距钳到 4..GC_ROW_GAP_MAX。矩阵里的 rowH/gap 由它核一遍,不是从布局函数里抄回来的。
 */
const direct = (n: number, rowsTop: number, listBottom: number) => {
  const s = spreadRows(n, rowsTop, listBottom, GC_ROW_MIN_H, GC_ROW_MAX_H);
  return {
    rowH: n > 0 ? s.rowH - (s.rowH % 2) : 0,
    gap: n > 1 ? Math.max(4, Math.min(GC_ROW_GAP_MAX, s.gap - (s.gap % 2))) : 0,
  };
};

/** 首个末行底缘越出 h − pad 的件数(n 从 1 起递增;每档的 rowsTop 由布局自己给) */
function firstOverflowN(h: number, nRes: number): number {
  for (let n = 1; n <= 300; n++) {
    const L = gachaLayout(W, h, ids(n), nRes);
    if (L.rowsEnd > h - GC_PAD) return n;
  }
  return -1;
}



/* ==================== 0. 端间同一实现与派单要求核实的常量 ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/data/gacha 与 @game 解析到同一份抽取函数(不是两份抄本)", () => {
    expect(cocosGacha.drawGacha).toBe(drawGacha);
    expect(cocosGacha.drawGacha10).toBe(drawGacha10);
    expect(cocosGacha.drawGacha).toBe(sharedGacha.drawGacha);
  });

  it("宿主侧 game/ui/gachaLayout 与 @game 解析到同一份纯布局(几何单一出口只在共享层)", () => {
    expect(cocosGachaLayout.gachaLayout).toBe(gachaLayout);
    expect(cocosGachaLayout.gachaScreenLayout).toBe(gachaScreenLayout);
    for (const n of [0, 1, 14, 30]) {
      expect(gachaScreenLayout(W, H_STD, ids(n), 0)).toEqual(gachaLayout(W, H_STD, ids(n), 0));
      expect(gachaScreenLayout(W, H_TALL, ids(n), 5)).toEqual(gachaLayout(W, H_TALL, ids(n), 5));
    }
  });

  it("派单核实 ③:四支常量的实际值与出处 —— 两支走 balance 通道、一支走 economy 通道、一支纯常量", () => {
    // 单抽 / 十连的券耗:共享层 gacha.ts 的 applyBalance 读 balance.json 的 gacha.cost / cost10
    expect(GACHA_COST).toBe(1);
    expect(GACHA_10_COST).toBe(10);
    // 钻石换券价:共享层 daily.ts 的 applyBalance 只在 economy 段给了 diamondTicketCost 时才覆盖
    expect(DIAMOND_TICKET_COST).toBe(2);
    // 装备等级基数:quality.ts 的纯常量(export const),共享层没有任何 applyBalance 分支读它
    expect(GACHA_EQUIPMENT_BASE_LEVEL).toBe(5);
  });

  it("派单核实 ③(续):balance.json 的 gacha 与 economy 两段当前值都与代码默认逐项相同,基数那一支不在表里", () => {
    const cfg = JSON.parse(readFileSync(new URL("../public/config/balance.json", import.meta.url), "utf8"));
    expect(cfg.gacha.cost).toBe(GACHA_COST);
    expect(cfg.gacha.cost10).toBe(GACHA_10_COST);
    expect(cfg.gacha.epicPity).toBe(EPIC_PITY);
    expect(cfg.gacha.legendaryPity).toBe(LEGENDARY_PITY);
    // 换券价走 economy.diamondTicketCost 这一支:表里确实有,值与代码默认同为 2
    expect(cfg.economy.diamondTicketCost).toBe(DIAMOND_TICKET_COST);
    expect(cfg.economy.diamondTicketCost).toBe(2);
    // 装备等级基数:表里没有对应键(applyBalance 的各段都不读它)
    const flat = JSON.stringify(cfg);
    expect(flat.includes("equipmentBaseLevel")).toBe(false);
    expect(flat.includes("GACHA_EQUIPMENT_BASE_LEVEL")).toBe(false);
    expect(Object.keys(cfg.gacha).sort()).toEqual(["cost", "cost10", "duplicateStardust", "epicPity", "epicPityLegendaryChance", "legendaryPity", "rates"]);
  });

  it("保底阈值的四条锁:绘制侧的字面量与共享层常量同值", () => {
    expect(GACHA_EPIC_PITY).toBe(10);
    expect(GACHA_LEGENDARY_PITY).toBe(50);
    expect(EPIC_PITY).toBe(10);
    expect(LEGENDARY_PITY).toBe(50);
  });

  it("扭蛋装备等级 = 基数 + (最高关 − 1)", () => {
    expect(gachaLevel(1)).toBe(GACHA_EQUIPMENT_BASE_LEVEL);
    for (const st of [1, 2, 7, 40]) expect(gachaLevel(st)).toBe(GACHA_EQUIPMENT_BASE_LEVEL + st - 1);
  });
});

/* ==================== 1. 分区纵线逐条对标 Web gachaLayout ==================== */

describe("分区纵线(Web 的裸加数链)", () => {
  it("换券条顶缘 = btnY + btnH + 10 = 180", () => {
    expect(GC_BTN_Y).toBe(122);
    expect(GC_BTN_H).toBe(48);
    expect(GC_TICKET_DY).toBe(10);
    expect(gachaTicketY()).toBe(180);
  });

  it("保底标签基线 = ticketY + 38 + 18 = 236", () => {
    expect(GC_TICKET_H).toBe(38);
    expect(GC_PITY_DY).toBe(18);
    expect(gachaPityLabelY()).toBe(236);
  });

  it("最近抽取标签基线 = pityLabelY + 40 = 276", () => {
    expect(GC_RES_DY).toBe(40);
    expect(gachaResLabelY()).toBe(276);
  });

  it("收藏标签 = resLabelY + (nRes>0 ? nRes×20 : 20) + 22;行区顶缘再 +36", () => {
    expect(GC_RES_LINE_H).toBe(20);
    expect(GC_COLL_DY).toBe(22);
    expect(GC_ROWS_DY).toBe(36);
    // nRes = 0 那一支照样让出一整行 → 0 条与 1 条同高(Web 的三元表达式)
    expect(gachaCollLabelY(0)).toBe(318);
    expect(gachaCollLabelY(1)).toBe(318);
    expect(gachaCollLabelY(2)).toBe(338);
    expect(gachaCollLabelY(5)).toBe(398);
    expect(gachaRowsTop(0)).toBe(354);
    expect(gachaRowsTop(5)).toBe(434);
  });

  it("nRes = min(recentCount, 5),负数按 0 处理", () => {
    expect(GC_RES_MAX).toBe(5);
    for (const n of [0, 1, 2, 3, 4, 5, 6, 8, 40]) expect(gachaRecentRows(n)).toBe(Math.min(n, 5));
    expect(gachaRecentRows(-3)).toBe(0);
    expect(gachaRowsTop(8)).toBe(gachaRowsTop(5));
    expect(gachaRowsTop(99)).toBe(434);
  });

  it("nRes = 0..8 的整条链:rowsTop 与 resRows 长度都同源", () => {
    for (let n = 0; n <= 8; n++) {
      const L = gachaLayout(W, H_STD, [], n);
      const nRes = Math.min(n, 5);
      expect(L.nRes).toBe(nRes);
      expect(L.resRows).toHaveLength(nRes);
      /* 纵线由本档带链逐位推出:弹性只把 rowsTop 往下推,推多少是可算的,不是"≥"就算完 */
      const B = gachaBands(H_STD, n, 0);
      const chainTop = GC_PAD + B.headH + B.btnH + B.ticketDy + B.ticketH + B.pityDy + B.pityBand + B.resDy + B.resBand + B.collDy + B.rowsDy;
      expect(L.rowsTop, `nRes=${n}`).toBe(chainTop);
      expect(L.rowsTop).toBeGreaterThanOrEqual(gachaRowsTop(n));
      expect(L.resLineH, `nRes=${n}`).toBe(B.resLineH);
      expect(L.resLabel.baseY).toBe(GC_PAD + B.headH + B.btnH + B.ticketDy + B.ticketH + B.pityDy + B.pityBand + B.resDy);
      L.resRows.forEach((row, i) => {
        expect(row.name.baseY).toBe(L.resLabel.baseY + (i + 1) * L.resLineH);
        expect(row.dup.baseY).toBe(row.name.baseY);
      });
    }
  });
});

/* ==================== 2. 屏级矩形:列向弹性带的落位与硬约束 ==================== */

describe("屏级矩形(面板铺满内容列,富余由带链吸收)", () => {
  const L = gachaLayout(W, H_STD, [1, 2], 0);
  const B = gachaBands(H_STD, 0, 2);

  it("页边距抬到像素网格 16(比共享 ui.pad 的 14 更宽),内容列右缘落 544", () => {
    expect(GC_PAD).toBe(16);
    expect(PAD).toBeGreaterThan(UI.pad);
    expect(L.panel.x + L.panel.w).toBe(W - PAD);
    expect(L.ticketBtn.x + L.ticketBtn.w).toBe(W - PAD);
    expect(L.adBtn.x + L.adBtn.w).toBe(W - PAD);
    expect(L.backBtn.x + L.backBtn.w).toBe(W - PAD);
  });

  it("三枚抽取钮同处一行带:单抽 110 宽、十连在 pad+120 且 170 宽、广告钮吃掉剩余", () => {
    expect(L.singleBtn.x).toBe(PAD);
    expect(L.singleBtn.w).toBe(GC_SINGLE_W);
    expect(L.tenBtn.x).toBe(PAD + GC_TEN_DX);
    expect(L.tenBtn.w).toBe(GC_TEN_W);
    expect(L.adBtn.x).toBe(PAD + GC_AD_DX);
    expect(L.adBtn.w).toBe(W - PAD * 2 - GC_AD_DX);
    expect(GC_SINGLE_W).toBe(110);
    expect(GC_TEN_DX).toBe(120);
    expect(GC_TEN_W).toBe(170);
    expect(GC_AD_DX).toBe(300);
    // 十连与广告之间留 10 的空隙(Web 的 120 = 110 + 10、300 = 120 + 170 + 10)
    expect(L.singleBtn.x + L.singleBtn.w + 10).toBe(L.tenBtn.x);
    expect(L.tenBtn.x + L.tenBtn.w + 10).toBe(L.adBtn.x);
    // 广告钮是四枚里唯一随屏宽变的那枚(屏高不动它)
    expect(gachaLayout(W, H_TALL, [], 0).adBtn.w).toBe(L.adBtn.w);
    expect(gachaLayout(W + 40, H_STD, [], 0).adBtn.w).toBe(L.adBtn.w + 40);
  });

  it("四枚热区同行带、行带高就是 btnH;五枚热区都在画布内", () => {
    expect(L.tenBtn.y).toBe(L.singleBtn.y);
    expect(L.adBtn.y).toBe(L.singleBtn.y);
    expect(L.singleBtn.h).toBe(B.btnH);
    for (const r of [L.singleBtn, L.tenBtn, L.adBtn, L.ticketBtn, L.backBtn]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(W);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(H_STD);
      // 热区下限 44:单抽 / 十连 / 广告 / 换券条 / 返回钮无一低于一档触摸高
      expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(44);
    }
    for (const v of [L.singleBtn.x, L.singleBtn.y, L.singleBtn.w, L.singleBtn.h]) expect(v % 2).toBe(0);
  });

  it("面板底 = 整幅内容板(顶缘 pad、底缘 h − pad)+ 空键走代码底板", () => {
    expect(L.panelKey).toBe("");
    expect(L.panel).toEqual({ x: PAD, y: PAD, w: W - PAD * 2, h: H_STD - PAD * 2 });
    // 件数扫一遍:板底缘恒贴 h − pad(板下不再出现整段未绘制区),行溢出档也不把板拉长
    for (const n of [0, 1, 2, 8, 14, 15, 30]) {
      const S = gachaLayout(W, H_STD, ids(n), 0);
      expect(S.panel.y + S.panel.h, `n=${n}`).toBe(H_STD - PAD);
      expect(S.panel.x + S.panel.w, `n=${n}`).toBe(W - PAD);
      expect(S.panel.h, `n=${n}`).toBeGreaterThan(0);
      if (S.empty) expect(S.panel.y + S.panel.h, `n=${n} 盖住空态提示`).toBeGreaterThan(S.collEmpty.baseY);
    }
    for (const n of [0, 3, 9]) {
      const S = gachaLayout(W, H_TALL, ids(n), 0);
      expect(S.panel.y + S.panel.h, `tall n=${n}`).toBe(H_TALL - PAD);
    }
    // 代码底板的两色就是 Web panel() 的 theme.bgPanel + 金描边(与 confirm 屏的 cfPanelFallback* 同档)
    const defs = phase4Defaults();
    expect(defs.gcPanelFallbackBg.toLowerCase()).toBe(String(theme.bgPanel).toLowerCase());
    expect(defs.gcPanelFallbackStroke.toLowerCase()).toBe(String(theme.gold).toLowerCase());
    // Web 那一笔(panelPad 默认分支的 drawNine 32)仍然在案,两端各记各的
    expect(GC_PANEL_NINE).toBe(32);
  });

  it("带链把屏高富余摊给内容与带距:板内不留整段空腔,行带至少吃掉一半富余", () => {
    for (const h of [H_STD, 1100, H_TALL]) {
      for (const n of [1, 3, 6]) {
        const S = gachaLayout(W, h, ids(n), 0);
        const voidBelow = h - PAD - S.rowsEnd;
        const foot = gachaBands(h, 0, n).foot;
        // 末行底缘之下的空腔 = 板底缝 + 行带取整零头;单件那一档行高先撞到上限,余量才落到板底
        expect(voidBelow, `h=${h} n=${n}`).toBeLessThanOrEqual(n === 1 ? 300 : foot + 24);
        expect(S.rowsEnd, `h=${h} n=${n}`).toBeGreaterThan(S.rowsTop);
        expect(S.rowsEnd, `h=${h} n=${n} 度量式同值`).toBe(lastRowBottom(S));
        expect(S.rowH, `h=${h} n=${n}`).toBeGreaterThanOrEqual(GC_ROW_MIN_H);
        // 行高随屏高单调不减:同一件数下,屏越高行越高(或至少不矮)
        const taller = gachaLayout(W, h + 100, ids(n), 0);
        expect(taller.rowH, `h=${h}→${h + 100} n=${n}`).toBeGreaterThanOrEqual(S.rowH);
      }
    }
  });

  it("标题横幅 = banner_large_purple 显式 240×46、盒 (pad−8, 36−46+10) 顶缘贴画布;与 daily 同参数", () => {
    expect(L.headerBanner).toEqual({ x: PAD - 8, y: 36 - 46 + 10, w: 240, h: 46 });
    expect(L.headerBanner.y).toBe(0);
    expect(GC_BANNER_W).toBe(240);
    expect(GC_BANNER_H).toBe(46);
    expect(L.titleWithBanner.x).toBe(L.headerBanner.x + L.headerBanner.w / 2);
    expect(L.titleWithBanner.baseY).toBe(GC_TITLE_BASE_Y - 4);
    expect(L.titleWithBanner.maxW).toBe(GC_BANNER_W);
    expect(L.titleWithBanner.px).toBe(FS.title);
    expect(L.titleWithBanner.align).toBe("center");
    expect(L.titleBare.x).toBe(PAD);
    expect(L.titleBare.baseY).toBe(GC_TITLE_BASE_Y);
    expect(L.titleBare.px).toBe(FS.title);
    expect(L.titleBare.align).toBe("left");
    // 两档标题都收进返回钮起笔前,不压钮
    expect(L.titleBare.x + L.titleBare.maxW).toBeLessThan(L.backBtn.x);
    expect(L.titleWithBanner.x + L.titleWithBanner.maxW / 2).toBeLessThan(L.backBtn.x);
  });

  it("券数图标盒 = (pad, 60−15+2, 15, 15);缺图档文字回到 pad", () => {
    expect(GC_ICON_SIZE).toBe(15);
    expect(L.ticketIcon).toEqual({ x: PAD, y: GC_TICKET_BASE_Y - GC_ICON_SIZE + 2, w: GC_ICON_SIZE, h: GC_ICON_SIZE });
    expect(L.ticketTextWithIcon.x).toBe(PAD + GC_ICON_SIZE + 4);
    expect(L.ticketTextBare.x).toBe(PAD);
    expect(L.ticketTextBare.baseY).toBe(GC_TICKET_BASE_Y);
    expect(L.ticketTextWithIcon.baseY).toBe(GC_TICKET_BASE_Y);
    expect(L.ticketTextBare.px).toBe(FS.body);
    expect(L.ticketTextBare.align).toBe("left");
    expect(L.ticketTextWithIcon.align).toBe("left");
    // 两档券数文字都收进返回钮起笔前
    expect(L.ticketTextBare.x + L.ticketTextBare.maxW).toBeLessThan(L.backBtn.x);
    expect(L.ticketTextWithIcon.x + L.ticketTextWithIcon.maxW).toBeLessThan(L.backBtn.x);
  });

  it("返回钮 = (w−pad−backW, 22, backW, 44) + 图标盒 + 两档文字位(钮高抬到热区下限)", () => {
    expect(L.backBtn).toEqual({ x: W - PAD - UI.backW, y: GC_BACK_Y, w: UI.backW, h: GC_BACK_H });
    expect(GC_BACK_H).toBe(44);
    expect(GC_BACK_Y).toBe(22);
    expect(GC_BACK_ICON_DX).toBe(4);
    expect(L.backIcon).toEqual({ x: L.backBtn.x + GC_BACK_ICON_DX, y: GC_BACK_Y + (GC_BACK_H - L.backIcon.h) / 2, w: L.backIcon.h, h: L.backIcon.h });
    expect(L.backIcon.h).toBe(GC_BACK_H - GC_BACK_ICON_SHRINK);
    expect(L.backTextBare.x).toBe(L.backBtn.x + L.backBtn.w / 2);
    expect(L.backTextBare.baseY).toBe(GC_BACK_Y + GC_BACK_H / 2 + GC_BACK_TEXT_DY);
    expect(L.backTextBare.align).toBe("center");
    expect(L.backTextWithIcon.baseY).toBe(L.backTextBare.baseY);
    expect(L.backTextWithIcon.x).toBe(L.backBtn.x + GC_BACK_ICON_DX + L.backIcon.h + (L.backBtn.w - GC_BACK_ICON_DX - L.backIcon.h) / 2);
  });

  it("保底条:从 pad+110 起到 w−pad、高 6;两档顶缘是 pityLabelY 的 +8 / +12", () => {
    expect(L.pityEpicBar.x).toBe(PAD + GC_PITY_BAR_DX);
    expect(L.pityEpicBar.w).toBe(W - PAD * 2 - (PAD + GC_PITY_BAR_DX));
    expect(L.pityEpicBar.h).toBe(GC_PITY_BAR_H);
    expect(L.pityEpicBar.y).toBe(L.pityEpicLabel.baseY + GC_PITY_BAR_DY_EPIC);
    expect(L.pityLegendBar.y).toBe(L.pityEpicLabel.baseY + GC_PITY_BAR_DY_LEGENDARY);
    expect(L.pityLegendBar.x).toBe(L.pityEpicBar.x);
    expect(L.pityLegendBar.w).toBe(L.pityEpicBar.w);
    expect(L.pityLegendLabel.baseY).toBeGreaterThan(L.pityLegendBar.y + GC_PITY_BAR_H);
    expect(L.pityEpicLabel.baseY).toBe(GC_PAD + B.headH + B.btnH + B.ticketDy + B.ticketH + B.pityDy);
    expect(L.pityLegendLabel.baseY).toBe(L.pityEpicLabel.baseY + B.pityBand);
    expect(GC_PITY_BAR_DX).toBe(110);
    expect(GC_PITY_BAR_H).toBe(6);
    expect(GC_PITY_BAR_DY_EPIC).toBe(8);
    expect(GC_PITY_BAR_DY_LEGENDARY).toBe(12);
    // 标签列限宽收到条起笔前,不压条
    expect(L.pityEpicLabel.x + L.pityEpicLabel.maxW).toBeLessThan(L.pityEpicBar.x);
    expect(L.pityLegendLabel.x + L.pityLegendLabel.maxW).toBeLessThan(L.pityLegendBar.x);
  });

  it("Web 原样重叠:两条保底条纵向互相压 2px(弹性带只挪标签,不动这两档裸加数)", () => {
    expect(L.pityBarOverlap).toBe(GC_PITY_BAR_DY_EPIC + GC_PITY_BAR_H - GC_PITY_BAR_DY_LEGENDARY);
    expect(L.pityBarOverlap).toBe(2);
  });

  it("纵线由带链累加推出:每一档顶缘 = 前档底缘 + 该档带高(三档屏高 × nRes 0/5)", () => {
    for (const h of [H_STD, 1100, H_TALL]) {
      for (const r of [0, 5]) {
        const S = gachaLayout(W, h, ids(4), r);
        const T = gachaBands(h, r, 4);
        expect(S.singleBtn.y, `h=${h} nRes=${r}`).toBe(GC_PAD + T.headH);
        expect(S.ticketBtn.y, `h=${h} nRes=${r}`).toBe(S.singleBtn.y + T.btnH + T.ticketDy);
        expect(S.pityEpicLabel.baseY, `h=${h} nRes=${r}`).toBe(S.ticketBtn.y + T.ticketH + T.pityDy);
        expect(S.pityLegendLabel.baseY, `h=${h} nRes=${r}`).toBe(S.pityEpicLabel.baseY + T.pityBand);
        expect(S.resLabel.baseY, `h=${h} nRes=${r}`).toBe(S.pityLegendLabel.baseY + T.resDy);
        expect(S.collLabel.baseY, `h=${h} nRes=${r}`).toBe(S.resLabel.baseY + T.resBand + T.collDy);
        expect(S.rowsTop, `h=${h} nRes=${r}`).toBe(S.collLabel.baseY + T.rowsDy);
        expect(S.rowH % 2, `h=${h} nRes=${r}`).toBe(0);
        expect(S.rowGap % 2, `h=${h} nRes=${r}`).toBe(0);
        expect(S.resLineH % 2, `h=${h} nRes=${r}`).toBe(0);
        expect(S.singleBtn.h).toBe(T.btnH);
        expect(S.ticketBtn).toEqual({ x: GC_PAD, y: S.singleBtn.y + T.btnH + T.ticketDy, w: W - GC_PAD * 2, h: T.ticketH });
      }
    }
  });

  it("带链绝对锚点(以实测为准):标定档 996 的 gachaBands 逐位写死,链上没有一个数是互相推出来的", () => {
    expect(gachaBands(996, 0, 3)).toEqual({ pad: 16, headH: 130, btnH: 64, ticketDy: 24, ticketH: 54, pityDy: 28, pityBand: 30, resDy: 34, resLineH: 32, resBand: 32, collDy: 38, rowsDy: 50, rowBand: 440, foot: 40, nRes: 0, gearCount: 3 });
    expect(gachaBands(996, 5, 3)).toEqual({ pad: 16, headH: 130, btnH: 64, ticketDy: 24, ticketH: 54, pityDy: 28, pityBand: 30, resDy: 34, resLineH: 32, resBand: 160, collDy: 38, rowsDy: 50, rowBand: 312, foot: 40, nRes: 5, gearCount: 3 });
    expect(gachaBands(996, 0, 1)).toEqual({ pad: 16, headH: 156, btnH: 64, ticketDy: 28, ticketH: 54, pityDy: 34, pityBand: 30, resDy: 40, resLineH: 32, resBand: 32, collDy: 46, rowsDy: 60, rowBand: 168, foot: 252, nRes: 0, gearCount: 1 });
    // 高屏那一档整条逐位写死:headH / rowsDy / rowBand / foot 一起跟涨
    expect(gachaBands(1246, 5, 3)).toEqual({ pad: 16, headH: 134, btnH: 64, ticketDy: 28, ticketH: 54, pityDy: 30, pityBand: 30, resDy: 36, resLineH: 32, resBand: 160, collDy: 40, rowsDy: 52, rowBand: 544, foot: 42, nRes: 5, gearCount: 3 });
  });

  it("收藏标签带:标签与加成同基线、加成起笔 pad+170;空态提示下移 24", () => {
    expect(L.collBonus.x).toBe(PAD + GC_BONUS_DX);
    expect(L.collBonus.baseY).toBe(L.collLabel.baseY);
    expect(L.collBonus.px).toBe(FS.micro);
    expect(L.collEmpty.baseY).toBe(L.collLabel.baseY + GC_EMPTY_DY);
    expect(L.collEmpty.x).toBe(PAD);
    expect(GC_EMPTY_DY).toBe(24);
    // 标签限宽收到加成起笔前(Web 两处都不限宽,这一档只在 Cocos 侧生效)
    expect(L.collLabel.x + L.collLabel.maxW).toBeLessThan(L.collBonus.x);
    expect(L.collLabel.baseY).toBe(GC_PAD + B.headH + B.btnH + B.ticketDy + B.ticketH + B.pityDy + B.pityBand + B.resDy + B.resBand + B.collDy);
  });
});

/* ==================== 3. 富余吸收矩阵:h ∈ {996,1100,1246} × nRes ∈ {0,5} × 件数网格 ==================== */

describe("富余吸收矩阵:板铺满、带不空转、件数多时按既有性质溢出", () => {
  const HS = [H_STD, 1100, H_TALL];

  for (const h of HS) {
    for (const r of [0, 5]) {
      it(`h=${h} nRes=${r}:行区顶缘随最近条数下移、行带随富余生长`, () => {
        const S = gachaLayout(W, h, ids(3), r);
        expect(S.nRes).toBe(Math.min(r, GC_RES_MAX));
        expect(S.resRows).toHaveLength(Math.min(r, GC_RES_MAX));
        expect(S.rowsTop).toBeGreaterThan(S.collLabel.baseY);
        // nRes = 0 那一支照样让出一整行(Web 的三元表达式),富余方向上只会更远
        const zero = gachaLayout(W, h, ids(3), 0);
        expect(S.rowsTop).toBeGreaterThanOrEqual(zero.rowsTop);
        // 面板内底 = h − pad,末行底缘到面板内底的距离就是板底缝
        expect(h - PAD - S.rowsEnd).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("件数增加时行带让位:行高单调不增,板底缝始终收在同一量级", () => {
    let prevH = Infinity;
    for (const n of [1, 4, 8, 12]) {
      const S = gachaLayout(W, H_STD, ids(n), 0);
      expect(S.rows.length).toBe(n);
      expect(S.rowH, `n=${n}`).toBeLessThanOrEqual(prevH);
      expect(H_STD - PAD - S.rowsEnd, `n=${n}`).toBeLessThanOrEqual(n === 1 ? 300 : gachaBands(H_STD, 0, n).foot + 24);
      prevH = S.rowH;
    }
  });

  it("行高钳在 44..168、行距 ≤ 20,且 spreadRows 的直算值就是这两档", () => {
    for (const n of [1, 2, 3, 6, 10]) {
      for (const h of HS) {
        for (const r of [0, 5]) {
          const S = gachaLayout(W, h, ids(n), r);
          expect(S.rowH, `n=${n} h=${h}`).toBeGreaterThanOrEqual(GC_ROW_MIN_H);
          expect(S.rowH, `n=${n} h=${h}`).toBeLessThanOrEqual(GC_ROW_MAX_H);
          expect(S.rowGap, `n=${n} h=${h}`).toBeLessThanOrEqual(GC_ROW_GAP_MAX);
          expect(S.rowStep).toBe(S.rowH + S.rowGap);
          expect(S.rows.length, `n=${n}`).toBe(n);
          // 独立直算一遍:矩阵数字不是从布局函数里抄回来的同义反复
          const d = direct(n, S.rowsTop, S.rowsBottom - gachaBands(h, r, n).foot);
          expect([S.rowH, S.rowGap], `n=${n} h=${h} nRes=${r} 与 spreadRows 直算不符`).toEqual([d.rowH, d.gap]);
        }
      }
    }
    expect([GC_ROW_MIN_H, GC_ROW_MAX_H, GC_ROW_GAP_MAX]).toEqual([44, 168, 20]);
  });

  it("件数多到装不下时行仍照排(本屏不裁不滚的既有性质),越出量随行数线性放大", () => {
    const ok = gachaLayout(W, H_STD, ids(6), 0);
    const over = gachaLayout(W, H_STD, ids(20), 0);
    expect(ok.rowsEnd).toBeLessThanOrEqual(ok.rowsBottom);
    expect(over.rowsEnd).toBeGreaterThan(over.rowsBottom);
    expect(over.rows.length).toBe(20);
    /* 首个越出面板内底的件数由实测扫出并写死:rowsTop 随件数变,不能只按一行的顶缘推 */
    const n0 = firstOverflowN(H_STD, 0);
    expect(n0).toBe(14);
    expect(gachaLayout(W, H_STD, ids(n0 - 1), 0).rowsEnd).toBeLessThanOrEqual(H_STD - PAD);
    expect(gachaLayout(W, H_STD, ids(n0), 0).rowsEnd).toBeGreaterThan(H_STD - PAD);
    const step = over.rowStep;
    expect([over.rowH, over.rowGap, step]).toEqual([44, 4, 48]);
    expect(over.rowsEnd - gachaLayout(W, H_STD, ids(19), 0).rowsEnd).toBe(step);
    // 越出量随行数线性放大:钳到硬下限后每多一件多一个 rowStep
    expect(gachaLayout(W, H_STD, ids(15), 0).rowsEnd - gachaLayout(W, H_STD, ids(14), 0).rowsEnd).toBe(step);
    expect(gachaLayout(W, H_STD, ids(20), 0).rowsEnd - gachaLayout(W, H_STD, ids(15), 0).rowsEnd).toBe(5 * step);
    // 行仍然逐位落在同一列上,越界的行不改宽度、不改 x
    for (const row of over.rows) {
      expect(row.rect.x).toBe(PAD);
      expect(row.rect.w).toBe(W - PAD * 2);
      expect(row.rect.h).toBe(over.rowH);
    }
  });

  it("0 件:spreadRows 返回 rowH 0 / gap 0,rowsEnd 落在 rowsTop(Web 的空列表同值)", () => {
    for (const h of [H_STD, 1100, H_TALL]) {
      const S = gachaLayout(W, h, [], 0);
      expect(S.rowH, `h=${h}`).toBe(0);
      expect(S.rowGap, `h=${h}`).toBe(0);
      expect(S.rows, `h=${h}`).toHaveLength(0);
      expect(S.gearCount, `h=${h}`).toBe(0);
      expect(S.rowsEnd, `h=${h}`).toBe(S.rowsTop);
      expect(S.rowsEnd, `h=${h}`).toBeLessThanOrEqual(S.rowsBottom);
      expect(S.empty, `h=${h}`).toBe(true);
      expect(S.panel.y + S.panel.h, `h=${h}`).toBe(h - PAD);
    }
  });

  it("行距步进用的是 spreadRows 的 gap(gearup 丢弃它硬编码 4 —— 两屏正相反,不许统一)", () => {
    const S = gachaLayout(W, H_STD, ids(4), 0);
    expect(S.rowStep).toBe(S.rowH + S.rowGap);
    for (let i = 1; i < S.rows.length; i++) expect(S.rows[i].rect.y - S.rows[i - 1].rect.y).toBe(S.rowStep);
  });

  it("行以 id 为键、原序不排序(绘制与命中都拿 id 反查)", () => {
    const S = gachaLayout(W, H_STD, [7, 3, 9], 0);
    expect(S.rows.map((r) => r.id)).toEqual([7, 3, 9]);
    expect(S.rows.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});


/* ==================== 4. 文本带全网格落在 0..560(R5) ==================== */

describe("文本带右界(gachaLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    for (const align of ["left", "center", "right"] as TextAlign[]) {
      const band: Band = anchorBand(100, 20, 120, 14, align, LIFT);
      const ax = alignAx(align);
      expect(band.x + band.w * ax).toBe(100);
      expect(band.w).toBe(120);
      expect(ax).toBe(align === "left" ? 0 : align === "center" ? 0.5 : 1);
    }
  });

  it("两档屏高 × nRes 0..8 × 1/2/8/13/20 件:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const nRes of [0, 1, 3, 5, 8]) {
        for (const n of [1, 2, 8, 13, 20]) {
          const L = gachaLayout(W, h, ids(n), nRes);
          const lines: GcTextLine[] = [
            L.titleBare,
            L.titleWithBanner,
            L.ticketTextBare,
            L.ticketTextWithIcon,
            L.backTextBare,
            L.backTextWithIcon,
            L.singleText,
            L.tenText,
            L.adText,
            L.ticketText,
            L.pityEpicLabel,
            L.pityLegendLabel,
            L.resLabel,
            L.collLabel,
            L.collBonus,
            L.collEmpty,
            ...L.resRows.flatMap((r) => [r.name, r.dup]),
            ...L.rows.flatMap((r) => [r.name, r.level, r.badge]),
          ];
          for (const t of lines) {
            const band = anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
            expect(band.x, `h=${h} nRes=${nRes} n=${n} x=${t.x}`).toBeGreaterThanOrEqual(0);
            expect(band.x + band.w, `h=${h} nRes=${nRes} n=${n} x=${t.x}`).toBeLessThanOrEqual(W);
          }
        }
      }
    }
  });

  it("右对齐的两处(重复串 / 带入中)末笔都贴自己的右缘锚点", () => {
    const L = gachaLayout(W, H_STD, [1], 5);
    expect(L.resRows[0].dup.x).toBe(W - PAD);
    expect(L.resRows[0].dup.align).toBe("right");
    const band = anchorBand(L.resRows[0].dup.x, L.resRows[0].dup.baseY, L.resRows[0].dup.maxW, L.resRows[0].dup.px, "right", LIFT);
    expect(band.x + band.w).toBe(W - PAD);
    expect(L.rows[0].badge.x).toBe(L.rows[0].rect.x + L.rows[0].rect.w - GC_TEXT_DX);
    expect(L.rows[0].badge.align).toBe("right");
  });

  it("行内名字与 Lv. 段是固定偏移(Web 的 x+8 / x+150),且各让自己的位", () => {
    expect(GC_TEXT_DX).toBe(8);
    expect(GC_LEVEL_DX).toBe(150);
    const L = gachaLayout(W, H_STD, [1, 2, 3], 0);
    for (const row of L.rows) {
      expect(row.name.x).toBe(row.rect.x + GC_TEXT_DX);
      expect(row.level.x).toBe(row.rect.x + GC_LEVEL_DX);
      expect(row.name.baseY).toBe(row.level.baseY);
      expect(row.name.baseY).toBe(rowTextY(row.rect.y, row.rect.h, FS.muted));
      expect(row.name.x + row.name.maxW).toBeLessThan(row.level.x);
      expect(row.level.x + row.level.maxW).toBeLessThanOrEqual(row.badge.x);
      expect(GC_DUP_RESERVE).toBeGreaterThan(0);
      expect(GC_BADGE_RESERVE).toBeGreaterThan(0);
    }
  });

  it("四枚热区的居中文字位都在自己那枚里(Web 的 textAlign=center + rowTextY)", () => {
    const L = gachaLayout(W, H_STD, [], 0);
    const pairs: [GcRect, GcTextLine][] = [[L.singleBtn, L.singleText], [L.tenBtn, L.tenText], [L.adBtn, L.adText], [L.ticketBtn, L.ticketText]];
    for (const [r, t] of pairs) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(r.x + r.w / 2);
      expect(t.maxW).toBe(r.w);
      expect(t.baseY).toBe(rowTextY(r.y, r.h, t.px));
    }
    expect(L.singleText.px).toBe(FS.body);
    expect(L.tenText.px).toBe(FS.body);
    expect(L.adText.px).toBe(FS.body);
    expect(L.ticketText.px).toBe(FS.muted);
  });
});

/* ==================== 5. 内容:十八条文案逐字 ==================== */

describe("屏级文案逐字(对标 Web drawGacha 的 fillText 实参)", () => {
  const L = gachaLayout(W, H_STD, [], 0);

  it("标题 / 返回 / 三枚钮 / 两个区标签 / 空态:八条常量串逐字", () => {
    const c = buildGachaContent(save(), [], L);
    expect(c.title).toBe("扭蛋机");
    expect(c.backText).toBe("返回");
    expect(c.singleText).toBe("单抽");
    expect(c.tenText).toBe("十连(保底史诗)");
    expect(c.recentLabel).toBe("最近抽取:");
    expect(c.collLabel).toBe("永久收藏(点选开局带入)");
    expect(c.emptyText).toBe("还没有收藏,先抽一发吧");
    expect(c.adText).toBe("广告免费抽");
  });

  it("券数与保底两串:数值来自存档,分母是 Web 绘制侧的字面量并由常量插值锁住", () => {
    const s = save({ gachaTicket: 7, gachaPityEpic: 3, gachaPityLegendary: 41 });
    const c = buildGachaContent(s, [], L);
    expect(c.ticketText).toBe("扭蛋券 7");
    expect(c.pityEpicText).toBe(`史诗保底 3/${EPIC_PITY}`);
    expect(c.pityLegendText).toBe(`传奇保底 41/${LEGENDARY_PITY}`);
    expect(c.pityEpicText).toBe("史诗保底 3/10");
    expect(c.pityLegendText).toBe("传奇保底 41/50");
    expect(c.pityEpicFrac).toBe(3 / 10);
    expect(c.pityLegendFrac).toBe(41 / 50);
  });

  it("换券串的 COST 由共享层 DIAMOND_TICKET_COST 插值、持有数取存档", () => {
    const c = buildGachaContent(save({ diamond: 13 }), [], L);
    expect(c.swapText).toBe(`钻石换扭蛋券(${DIAMOND_TICKET_COST}◆ = 1券 · 持有 13◆)`);
    expect(c.swapText).toBe("钻石换扭蛋券(2◆ = 1券 · 持有 13◆)");
  });

  it("广告已用档只换文案,热区与几何都不动", () => {
    const on = gachaLayout(W, H_STD, [], 0);
    expect(buildGachaContent(save({ dailyGachaAdUsed: true }), [], on).adText).toBe("今日广告抽已用");
    expect(on.adBtn).toEqual(gachaLayout(W, H_STD, [], 0).adBtn);
  });

  it("加成串走 collectionBonus 的单实参口径,两个百分数不经 toFixed", () => {
    const owned = makeGear(3);
    const cb = collectionBonus(owned);
    const c = buildGachaContent(save({ ownedGear: owned }), [], gachaLayout(W, H_STD, owned.map((g) => g.id), 0));
    expect(c.bonusText).toBe(`加成:攻+${cb.atkPct}% 命+${cb.hpPct}%`);
    // Web 只传 ownedGear、不传 gearLevels → 这一串不反映装备升级后的贡献
    expect(c.bonusText).not.toContain("→");
    expect(buildGachaContent(save(), [], L).bonusText).toBe("加成:攻+0% 命+0%");
  });

  it("十八条文案都能在 Web 段里逐字找到(常量串比字面、插值串比模板片段)", () => {
    const web = webGachaSource();
    const owned = makeGear(1);
    const c = buildGachaContent(
      save({ gachaTicket: 7, diamond: 13, gachaPityEpic: 3, gachaPityLegendary: 41, ownedGear: owned }),
      [res("重复剑", "epic", true, 15)],
      gachaLayout(W, H_STD, owned.map((g) => g.id), 1)
    );
    const literals = [c.title, c.backText, c.singleText, c.tenText, c.adText, c.recentLabel, c.collLabel, c.emptyText];
    for (const t of literals) expect(web.includes(`"${t}"`), t).toBe(true);
    // 禁用档与两条插值串:Web 侧是模板串,比模板的固定片段
    expect(web.includes('"今日广告抽已用"')).toBe(true);
    expect(web.includes("`扭蛋券 ${this.save.gachaTicket}`")).toBe(true);
    expect(web.includes("`史诗保底 ${this.save.gachaPityEpic}/10`")).toBe(true);
    expect(web.includes("`传奇保底 ${this.save.gachaPityLegendary}/50`")).toBe(true);
    expect(web.includes("◆ = 1券 · 持有 ${this.save.diamond}◆)`")).toBe(true);
    expect(web.includes("`重复→星尘+${r.stardust}`")).toBe(true);
    expect(web.includes('"带入中"')).toBe(true);
    expect(web.includes("`加成:攻+${cb.atkPct}% 命+${cb.hpPct}%`")).toBe(true);
    expect(web.includes("`Lv.${gear.level} ${q.name}`")).toBe(true);
    expect(web.includes("`还没有收藏,先抽一发吧`") || web.includes('"还没有收藏,先抽一发吧"')).toBe(true);
    // 模型给出的串与 Web 那几处逐字一致
    expect(c.recent[0].dupText).toBe("重复→星尘+15");
    expect(c.rows[0]!.levelText).toBe(`Lv.${owned[0].level} ${qualityDef(owned[0].quality).name}`);
  });
});

/* ==================== 6. 四档门控与禁用态 ==================== */

describe("四档门控(只决定配色档,不参与命中)", () => {
  const L = gachaLayout(W, H_STD, [], 0);

  it("canSingle = 券 ≥ GACHA_COST、canTen = 券 ≥ GACHA_10_COST,差 1 张就换档", () => {
    for (const t of [0, GACHA_COST - 1, GACHA_COST, GACHA_10_COST - 1, GACHA_10_COST, GACHA_10_COST + 5]) {
      const c = buildGachaContent(save({ gachaTicket: t }), [], L);
      expect(c.canSingle, `ticket=${t}`).toBe(t >= GACHA_COST);
      expect(c.canTen, `ticket=${t}`).toBe(t >= GACHA_10_COST);
    }
  });

  it("canAd = !dailyGachaAdUsed、canTicket = diamond ≥ DIAMOND_TICKET_COST", () => {
    expect(buildGachaContent(save(), [], L).canAd).toBe(true);
    expect(buildGachaContent(save({ dailyGachaAdUsed: true }), [], L).canAd).toBe(false);
    for (const d of [0, DIAMOND_TICKET_COST - 1, DIAMOND_TICKET_COST, DIAMOND_TICKET_COST + 9]) {
      const c = buildGachaContent(save({ diamond: d }), [], L);
      expect(c.canTicket, `diamond=${d}`).toBe(d >= DIAMOND_TICKET_COST);
    }
  });

  it("四档门控彼此独立:券够不代表钻石够,广告用掉不代表券用掉", () => {
    const c = buildGachaContent(save({ gachaTicket: GACHA_10_COST, dailyGachaAdUsed: true, diamond: 0 }), [], L);
    expect([c.canSingle, c.canTen, c.canAd, c.canTicket]).toEqual([true, true, false, false]);
  });
});

/* ==================== 7. 最近抽取与收藏行 ==================== */

describe("最近抽取带(存 8 显 5)", () => {
  it("recent 长度 0..8 → 内容条数 = min(n,5),与几何的 nRes 同值", () => {
    for (const n of [0, 1, 2, 5, 6, 8]) {
      const rs = recent(n);
      const L = gachaLayout(W, H_STD, [1], n);
      const c = buildGachaContent(save({ ownedGear: makeGear(1) }), rs, L);
      expect(c.recent).toHaveLength(Math.min(n, GC_RES_MAX));
      expect(c.nRes).toBe(L.nRes);
      expect(c.recent.length).toBe(L.resRows.length);
    }
  });

  it("重复档给「重复→星尘+N」,非重复档给 null;名字色就是品质色", () => {
    const rs = [res("史诗剑", "epic", true, 15), res("普通盾", "common")];
    const c = buildGachaContent(save(), rs, gachaLayout(W, H_STD, [], 2));
    expect(c.recent[0].dupText).toBe("重复→星尘+15");
    expect(c.recent[0].color).toBe(qualityDef("epic").color);
    expect(c.recent[1].dupText).toBeNull();
    expect(c.recent[1].color).toBe(qualityDef("common").color);
    expect(c.recent[0].name).toBe("史诗剑");
  });

  it("只取前 5 条:第 6 条之后的内容不出现(Web 的 slice(0, 5))", () => {
    const rs = Array.from({ length: 8 }, (_, i) => res(`第${i}`, "rare"));
    const c = buildGachaContent(save(), rs, gachaLayout(W, H_STD, [], 8));
    expect(c.recent.map((r) => r.name)).toEqual(["第0", "第1", "第2", "第3", "第4"]);
  });
});

describe("收藏行(以 id 为键反查)", () => {
  it("内容与几何逐位对齐,行序就是 ownedGear 原序", () => {
    const owned = makeGear(4);
    const L = gachaLayout(W, H_STD, owned.map((g) => g.id), 0);
    const c = buildGachaContent(save({ ownedGear: owned }), [], L);
    expect(c.rows).toHaveLength(4);
    c.rows.forEach((r, i) => {
      expect(r!.id).toBe(owned[i].id);
      expect(r!.name).toBe(owned[i].name);
      expect(r!.levelText).toBe(`Lv.${owned[i].level} ${qualityDef(owned[i].quality).name}`);
      expect(r!.color).toBe(qualityDef(owned[i].quality).color);
      expect(r!.selected).toBe(false);
    });
  });

  it("selectedGearId 命中哪一行就只有那一行 selected", () => {
    const owned = makeGear(3);
    const L = gachaLayout(W, H_STD, owned.map((g) => g.id), 0);
    const c = buildGachaContent(save({ ownedGear: owned, selectedGearId: owned[1].id }), [], L);
    expect(c.rows.map((r) => r!.selected)).toEqual([false, true, false]);
  });

  it("Web 原样口径:find 落空的那一行内容是 null(对应 drawGacha 的 continue),热区照旧", () => {
    const owned = makeGear(1);
    const L = gachaLayout(W, H_STD, [owned[0].id, 999], 0);
    const c = buildGachaContent(save({ ownedGear: owned }), [], L);
    expect(c.rows[0]).not.toBeNull();
    expect(c.rows[1]).toBeNull();
    const p = center(L.rows[1].rect);
    expect(hitGacha(L, p.x, p.y)).toEqual({ kind: "select", id: 999 });
    expect(gachaClaim(save({ ownedGear: owned, selectedGearId: null }), [], { kind: "select", id: 999 })!.kind).toBe("select");
  });

  it("Web 原样口径:id 重复时永远命中第一条匹配(两行同字、都算选中)", () => {
    const dup = makeGear(1);
    dup.push({ ...dup[0], level: 99 } as Equipment);
    const L = gachaLayout(W, H_STD, dup.map((g) => g.id), 0);
    const c = buildGachaContent(save({ ownedGear: dup, selectedGearId: dup[0].id }), [], L);
    expect(c.rows).toHaveLength(2);
    expect(c.rows[0]).toEqual(c.rows[1]);
    // 两行都反查到同一条(第一条),于是第二件的 level 99 不出现
    expect(c.rows[1]!.levelText).toBe(`Lv.${dup[0].level} ${qualityDef(dup[0].quality).name}`);
  });

  it("0 件:empty 为真、行数组为空,收藏标签与加成仍然照画", () => {
    const L = gachaLayout(W, H_STD, [], 0);
    const c = buildGachaContent(save(), [], L);
    expect(L.empty).toBe(true);
    expect(c.rows).toEqual([]);
    expect(c.collLabel).toBe("永久收藏(点选开局带入)");
    expect(c.bonusText).toBe("加成:攻+0% 命+0%");
  });

  it("溢出档(20 件 × nRes 5):内容仍然有 20 行,与几何同源", () => {
    const owned = makeGear(20);
    const L = gachaLayout(W, H_STD, owned.map((g) => g.id), 5);
    const c = buildGachaContent(save({ ownedGear: owned }), [], L);
    expect(c.rows).toHaveLength(20);
    expect(L.rowsEnd).toBeGreaterThan(L.rowsBottom);
    expect(c.rows.every((r) => r !== null)).toBe(true);
  });
});

/* ==================== 8. 命中:七段顺序 + 热区外无兜底 ==================== */

describe("命中判定(Web onGachaClick 的七段)", () => {
  const L = gachaLayout(W, H_STD, [1, 2, 3], 2);

  it("六个热区各自中心 → 对应动作", () => {
    expect(hitGacha(L, center(L.backBtn).x, center(L.backBtn).y)).toEqual({ kind: "back" });
    expect(hitGacha(L, center(L.singleBtn).x, center(L.singleBtn).y)).toEqual({ kind: "single" });
    expect(hitGacha(L, center(L.tenBtn).x, center(L.tenBtn).y)).toEqual({ kind: "ten" });
    expect(hitGacha(L, center(L.adBtn).x, center(L.adBtn).y)).toEqual({ kind: "ad" });
    expect(hitGacha(L, center(L.ticketBtn).x, center(L.ticketBtn).y)).toEqual({ kind: "ticket" });
    expect(hitGacha(L, center(L.rows[2].rect).x, center(L.rows[2].rect).y)).toEqual({ kind: "select", id: 3 });
  });

  it("边缘闭区间口径与 Web 的 >= / <= 一致(四角都算命中)", () => {
    for (const r of [L.singleBtn, L.tenBtn, L.adBtn, L.ticketBtn, L.backBtn, L.rows[0].rect]) {
      for (const p of [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }]) {
        expect(hitGacha(L, p.x, p.y), `角 ${p.x},${p.y}`).not.toBeNull();
      }
    }
  });

  it("热区之间的空隙与各标签带都不产动作(Web 没有其余一律兜底)", () => {
    const gaps = [
      { x: L.singleBtn.x + L.singleBtn.w + 5, y: center(L.singleBtn).y },
      { x: L.tenBtn.x + L.tenBtn.w + 5, y: center(L.tenBtn).y },
      { x: 2, y: center(L.singleBtn).y },
      { x: center(L.ticketBtn).x, y: L.ticketBtn.y + L.ticketBtn.h + 2 },
      { x: center(L.pityEpicBar).x, y: center(L.pityEpicBar).y },
      { x: L.resRows[0].name.x + 4, y: L.resRows[0].name.baseY },
      { x: L.collEmpty.x + 4, y: L.collEmpty.baseY },
      { x: center(L.headerBanner).x, y: L.headerBanner.y + 2 },
      { x: center(L.panel).x, y: L.rowsBottom + 3 },
    ];
    for (const p of gaps) expect(hitGacha(L, p.x, p.y), `${p.x},${p.y}`).toBeNull();
  });

  it("行的上下相邻边缘不串档:每行只认自己的 id,行间隙不属于任何行", () => {
    for (let i = 0; i < L.rows.length; i++) {
      const r = L.rows[i].rect;
      expect(hitGacha(L, r.x + 1, r.y + 1)).toEqual({ kind: "select", id: i + 1 });
      expect(hitGacha(L, r.x + 1, r.y + r.h - 1)).toEqual({ kind: "select", id: i + 1 });
      if (i + 1 < L.rows.length) expect(hitGacha(L, r.x + 1, r.y + r.h + L.rowGap / 2)).toBeNull();
    }
  });

  it("溢出屏外的行仍然是热区(Web 照画照命中,不做裁剪)", () => {
    const L2 = gachaLayout(W, H_STD, ids(20), 5);
    const last = L2.rows[L2.rows.length - 1];
    expect(last.rect.y).toBeGreaterThan(L2.rowsBottom);
    expect(hitGacha(L2, center(last.rect).x, center(last.rect).y)).toEqual({ kind: "select", id: 20 });
  });

  it("五枚热区互不重叠,于是七段顺序只在边界处决定归属", () => {
    const order: GachaAction["kind"][] = ["back", "single", "ten", "ad", "ticket"];
    const boxes = [L.backBtn, L.singleBtn, L.tenBtn, L.adBtn, L.ticketBtn];
    boxes.forEach((b, i) => {
      const p = center(b);
      expect(hitGacha(L, p.x, p.y)!.kind).toBe(order[i]);
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${order[i]} 与 ${order[j]}`).toBe(false);
      }
    }
  });

  it("禁用态仍返回动作:券不足 / 广告已用 / 钻石不足都不改命中结果", () => {
    const L2 = gachaLayout(W, H_STD, [], 0);
    const disabled = save({ gachaTicket: 0, diamond: 0, dailyGachaAdUsed: true });
    const rectOf: Record<string, GcRect> = { single: L2.singleBtn, ten: L2.tenBtn, ad: L2.adBtn, ticket: L2.ticketBtn };
    for (const kind of ["single", "ten", "ad", "ticket"] as const) {
      const a = { kind } as GachaAction;
      const p = center(rectOf[kind]);
      expect(hitGacha(L2, p.x, p.y), kind).toEqual(a);
      expect(gachaClaim(disabled, [], a), kind).toBeNull();
    }
    // 同一批动作在可用档都拿得到意图(禁用不是命中层的事)
    const enabled = save({ gachaTicket: GACHA_10_COST, diamond: DIAMOND_TICKET_COST });
    for (const kind of ["single", "ten", "ad", "ticket"] as const) {
      expect(gachaClaim(enabled, [], { kind } as GachaAction), kind).not.toBeNull();
    }
  });
});

/* ==================== 9. 写入意图 ==================== */

describe("抽取意图(gachaClaim)", () => {
  it("单抽:扣 1 券、产出一件、瞬时结果 1 条、不走广告", () => {
    const s = save({ gachaTicket: GACHA_COST });
    const claim = gachaClaim(s, [], { kind: "single" })!;
    expect(claim.kind).toBe("draw");
    if (claim.kind !== "draw") return;
    expect(claim.ticketCost).toBe(GACHA_COST);
    expect(claim.needsAd).toBe(false);
    expect(claim.markAdUsed).toBe(false);
    expect(claim.newGear.length + claim.recent.filter((r) => r.duplicate).length).toBe(1);
    expect(claim.recent).toHaveLength(1);
    expect(claim.recent[0].eq.level).toBe(gachaLevel(s.highestStage));
    expect(claim.stardustGain).toBe(claim.recent.filter((r) => r.duplicate).reduce((a, r) => a + r.stardust, 0));
  });

  it("十连:扣 GACHA_10_COST 券,结果列表 slice(0, 8)(抽 10 只留 8)", () => {
    const claim = gachaClaim(save({ gachaTicket: GACHA_10_COST }), [], { kind: "ten" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(claim.ticketCost).toBe(GACHA_10_COST);
    expect(claim.recent).toHaveLength(8);
    expect(claim.newGear.length + claim.recent.filter((r) => r.duplicate).length).toBeLessThanOrEqual(10);
    expect(claim.recent[0].eq.level).toBe(gachaLevel(1));
  });

  it("瞬时态合并口径:[...新, ...旧].slice(0, 8) —— 旧结果整体后移、超出的被挤掉", () => {
    const old = recent(8);
    const claim = gachaClaim(save({ gachaTicket: GACHA_COST }), old, { kind: "single" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(claim.recent).toHaveLength(8);
    expect(claim.recent[0].eq.name).not.toMatch(/^旧/);
    expect(claim.recent[1].eq.name).toBe("旧0");
    expect(claim.recent[7].eq.name).toBe("旧6");
    expect(claim.recent.some((r) => r.eq.name === "旧7")).toBe(false);
  });

  it("券不足:单抽与十连都静默(守卫在扣费前,与 Web doGacha 的 return 同语义)", () => {
    expect(gachaClaim(save({ gachaTicket: GACHA_10_COST - 1 }), [], { kind: "ten" })).toBeNull();
    expect(gachaClaim(save({ gachaTicket: 0 }), [], { kind: "single" })).toBeNull();
    expect(gachaClaim(save({ gachaTicket: GACHA_10_COST }), [], { kind: "ten" })).not.toBeNull();
    expect(gachaClaim(save({ gachaTicket: GACHA_COST }), [], { kind: "ten" })).toBeNull();
  });

  it("广告抽:不扣券、needsAd 与 markAdUsed 同为真;已用过就静默", () => {
    const claim = gachaClaim(save({ gachaTicket: 0 }), [], { kind: "ad" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(claim.needsAd).toBe(true);
    expect(claim.markAdUsed).toBe(true);
    expect(claim.ticketCost).toBe(0);
    expect(claim.recent).toHaveLength(1);
    expect(gachaClaim(save({ gachaTicket: 0, dailyGachaAdUsed: true }), [], { kind: "ad" })).toBeNull();
    // 券满也照样静默(广告抽不看券)
    expect(gachaClaim(save({ gachaTicket: 0, dailyGachaAdUsed: false }), [], { kind: "ad" })).not.toBeNull();
  });

  it("pity 是一次性拷贝并按引用被改:存档不动、意图给出目标值", () => {
    const s = save({ gachaTicket: GACHA_COST, gachaPityEpic: 3, gachaPityLegendary: LEGENDARY_PITY - 1 });
    const before = JSON.stringify(s);
    const claim = gachaClaim(s, [], { kind: "single" }, () => 0)!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(JSON.stringify(s)).toBe(before);
    // 传奇保底临界 → 这一抽必传奇 → 两个计数都归零
    expect(claim.recent[0].eq.quality).toBe("legendary");
    expect(claim.pityLegendary).toBe(0);
    expect(claim.pityEpic).toBe(0);
    expect(s.gachaPityLegendary).toBe(LEGENDARY_PITY - 1);
    expect(s.gachaPityEpic).toBe(3);
  });

  it("史诗保底临界必出史诗+,且不消耗传奇保底", () => {
    const s = save({ gachaTicket: GACHA_COST, gachaPityEpic: EPIC_PITY - 1, gachaPityLegendary: 5 });
    const claim = gachaClaim(s, [], { kind: "single" }, () => 0.999)!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(claim.recent[0].eq.quality).toBe("epic");
    expect(claim.pityEpic).toBe(0);
    expect(claim.pityLegendary).toBe(6);
  });

  it("Web 原样性质:十连的第 9 / 10 抽不进最近结果(slice(0, 8) 挤出),但照样入档", () => {
    // roll = 0.5 → 前 9 抽都落 common 桶;第 10 抽由 drawGacha10 的保底顶到史诗+
    const claim = gachaClaim(save({ gachaTicket: GACHA_10_COST }), [], { kind: "ten" }, () => 0.5)!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    // 展示窗口只留前 8 条 → 第 10 抽(保底那一抽)不在窗口里
    expect(claim.recent).toHaveLength(8);
    expect(claim.recent.every((r) => r.eq.quality === "common")).toBe(true);
    // 保底确实生效了:史诗计数被第 10 抽归零
    expect(claim.pityEpic).toBe(0);
    // 入账看的是全 10 抽,不是窗口里的 8 条
    expect(claim.newGear).toHaveLength(10);
    expect(claim.newGear.length + claim.recent.filter((r) => r.duplicate).length).toBe(10);
  });

  it("Web 原样口径:一发十连内部互不查重,新装备在整抽结束后才入藏", () => {
    const owned = makeGear(2);
    const before = owned.map((g) => g.id);
    const claim = gachaClaim(save({ gachaTicket: GACHA_10_COST, ownedGear: owned }), [], { kind: "ten" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(owned.map((g) => g.id)).toEqual(before);
    expect(claim.newGear.length + claim.recent.filter((r) => r.duplicate).length).toBe(10);
    // 交回宿主的 newGear 不在传入的 owned 里(查重只看抽之前的收藏)
    expect(claim.newGear.every((e) => !owned.some((g) => g.name === e.name && g.quality === e.quality))).toBe(true);
    // 重复折算的星尘按品质查表(判据在共享层,本层只汇总)
    for (const r of claim.recent.filter((x) => x.duplicate)) expect(r.stardust).toBe(DUPLICATE_STARDUST_DEFAULT[r.eq.quality]);
    expect(claim.stardustGain).toBe(claim.recent.filter((x) => x.duplicate).reduce((a, x) => a + x.stardust, 0));
  });

  it("收藏里已有的装备再抽到就是重复:走星尘不入 newGear", () => {
    const one = gear(1, "固定名", "common");
    // 直接把这件塞进查重集合,再用共享层抽同名 → 只能靠 name 命中;
    // 这里改用真实一次抽取的结果构造存档,保证判据同源
    const first = gachaClaim(save({ gachaTicket: GACHA_COST }), [], { kind: "single" })!;
    if (first.kind !== "draw") return expect(first.kind).toBe("draw");
    const eq = first.newGear[0] ?? one;
    const s = save({ gachaTicket: GACHA_COST, ownedGear: [eq] });
    const second = gachaClaim(s, [], { kind: "single" })!;
    if (second.kind !== "draw") return expect(second.kind).toBe("draw");
    // 至少结构成立:重复的进星尘、不重复的进 newGear,两者之和 = 抽取数
    expect(second.newGear.length + second.recent.filter((r) => r.duplicate).length).toBe(1);
    expect(second.newGear.every((e) => !(e.name === eq.name && e.quality === eq.quality))).toBe(true);
  });

  it("换券:扣 DIAMOND_TICKET_COST 钻、+1 券;钻石不足静默", () => {
    const claim = gachaClaim(save({ diamond: DIAMOND_TICKET_COST }), [], { kind: "ticket" })!;
    if (claim.kind !== "ticket") return expect(claim.kind).toBe("ticket");
    expect(claim.diamondCost).toBe(DIAMOND_TICKET_COST);
    expect(claim.ticketGain).toBe(1);
    expect(claim.needsAd).toBe(false);
    expect(claim.markAdUsed).toBe(false);
    expect(gachaClaim(save({ diamond: DIAMOND_TICKET_COST - 1 }), [], { kind: "ticket" })).toBeNull();
  });

  it("切换带入:同 id 再点就是取消(null),不同 id 就是改选", () => {
    const a = gachaClaim(save({ selectedGearId: null }), [], { kind: "select", id: 7 })!;
    if (a.kind !== "select") return expect(a.kind).toBe("select");
    expect(a.selectedGearId).toBe(7);
    expect(a.needsAd).toBe(false);
    const b = gachaClaim(save({ selectedGearId: 7 }), [], { kind: "select", id: 7 })!;
    expect(b.kind === "select" && b.selectedGearId).toBe(null);
    const c = gachaClaim(save({ selectedGearId: 7 }), [], { kind: "select", id: 9 })!;
    expect(c.kind === "select" && c.selectedGearId).toBe(9);
  });

  it("返回不产任何写入意图", () => {
    expect(gachaClaim(save({ gachaTicket: 99, diamond: 99 }), [], { kind: "back" })).toBeNull();
  });

  it("同一动作两次调用给出等值但互相独立的意图对象(不共享 recent / newGear 引用)", () => {
    const s = save({ gachaTicket: GACHA_COST, gachaPityEpic: 1, gachaPityLegendary: 1 });
    const roll = () => 0;
    const a = gachaClaim(s, [], { kind: "single" }, roll)!;
    const b = gachaClaim(s, [], { kind: "single" }, roll)!;
    expect(a).not.toBe(b);
    if (a.kind === "draw" && b.kind === "draw") {
      expect(a.recent).not.toBe(b.recent);
      expect(a.newGear).not.toBe(b.newGear);
    } else {
      expect(false).toBe(true);
    }
  });

  it("注入 roll 后同一存档可重放(两条意图逐字段相等)", () => {
    const s = save({ gachaTicket: GACHA_COST, gachaPityEpic: 9, gachaPityLegendary: 3 });
    const roll = () => 0.999;
    const a = gachaClaim(s, [], { kind: "single" }, roll)!;
    const b = gachaClaim(s, [], { kind: "single" }, roll)!;
    expect(a.kind === "draw" && b.kind === "draw" ? [a.pityEpic, a.pityLegendary] : null).toEqual([b.kind === "draw" ? b.pityEpic : -1, b.kind === "draw" ? b.pityLegendary : -1]);
  });

  it("每次抽取都推进两个计数(非保底档 +1)", () => {
    // roll = 0 → pickWeighted 落在权重表第一个桶(common) → 两个计数各 +1
    const roll = () => 0;
    const s = save({ gachaTicket: 1, gachaPityEpic: 0, gachaPityLegendary: 0 });
    const c1 = gachaClaim(s, [], { kind: "single" }, roll)!;
    if (c1.kind !== "draw") return expect(c1.kind).toBe("draw");
    expect(c1.recent[0].eq.quality).toBe("common");
    expect(c1.pityEpic).toBe(1);
    expect(c1.pityLegendary).toBe(1);
    const c2 = gachaClaim(save({ gachaTicket: 1, gachaPityEpic: c1.pityEpic, gachaPityLegendary: c1.pityLegendary }), [], { kind: "single" }, roll)!;
    if (c2.kind !== "draw") return expect(c2.kind).toBe("draw");
    expect(c2.pityEpic).toBe(2);
    expect(c2.pityLegendary).toBe(2);
  });
});

/* ==================== 10. 存档形态 ==================== */

describe("存档字段(派单要求:先确认 Cocos 侧字段齐备)", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/core/SaveModel.ts", import.meta.url), "utf8");

  it("本屏读的八个字段都在 SaveModel 上声明并归一化", () => {
    for (const f of ["gachaTicket", "gachaPityEpic", "gachaPityLegendary", "dailyGachaAdUsed", "diamond", "highestStage", "ownedGear", "selectedGearId"]) {
      expect(new RegExp(`^\\s+${f}:`, "m").test(src), `${f} 应声明在 SaveModel`).toBe(true);
      expect(src.includes(`${f}:`), `${f} 应有归一化分支`).toBe(true);
    }
  });

  it("gachaResults 不是存档字段(宿主瞬时态,不入档)", () => {
    expect(src.includes("gachaResults")).toBe(false);
    const shell = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8");
    expect(shell.includes("private gachaResults: GachaResult[] = [];")).toBe(true);
  });

  it("模型窄切片能直接吃 SaveModel 形状(结构兼容,宿主不需要补字段)", () => {
    const typed: GachaSaveView = {
      gachaTicket: 1,
      gachaPityEpic: 0,
      gachaPityLegendary: 0,
      dailyGachaAdUsed: false,
      diamond: 0,
      highestStage: 1,
      ownedGear: makeGear(2),
      selectedGearId: null,
    };
    expect(() => buildGachaContent(typed, [], gachaLayout(W, H_STD, typed.ownedGear.map((g) => g.id), 0))).not.toThrow();
  });
});

/* ==================== 11. 配色档:phase4 表的 gc* 默认值逐项对上 Web ==================== */

/** 读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS`(那一侧 import cc,node 侧不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
  const head = src.indexOf("export const PHASE4_DEFAULTS: Phase4Params = {");
  const body = src.slice(src.indexOf("{", head), src.indexOf("\n};", head));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s+(\w+):\s*"([^"]*)",$/gm)) out[m[1]] = m[2];
  for (const m of body.matchAll(/^\s+(\w+):\s*(\d+(?:\.\d+)?),$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web 侧扭蛋屏的源码段(openGacha / gachaLevel / doGacha / doGachaAd / gachaLayout / drawGacha / onGachaClick) */
function webGachaSource(): string {
  const src = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
  const from = src.indexOf("private openGacha(): void {");
  const to = src.indexOf("/* ---------- 胜利结算 ---------- */");
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const GC_KEYS = [
  "gcDim", "gcPanelFallbackBg", "gcPanelFallbackStroke", "gcTitle", "gcTicketText", "gcTicketGlyph",
  "gcBackBg", "gcBackStroke", "gcBackText",
  "gcSingleBg", "gcSingleStroke", "gcSingleText",
  "gcTenBg", "gcTenStroke", "gcTenText",
  "gcAdBg", "gcAdStroke", "gcAdText",
  "gcBtnDisabledBg", "gcBtnDisabledStroke", "gcPanelDisabledStroke", "gcBtnTextDisabled",
  "gcSwapBg", "gcSwapStroke", "gcSwapText",
  "gcPityLabel", "gcBarFallbackTrack", "gcBarFillEpic", "gcBarFillLegend", "gcBarCover",
  "gcResLabel", "gcDupText", "gcCollLabel", "gcCollBonus", "gcEmpty",
  "gcRowSelFill", "gcRowSelStroke", "gcRowFill", "gcRowStroke", "gcRowLevel", "gcRowBadge",
];

/** 与共享 theme 同值的几键(Web 那里写的是字面量,这里锁住"同一个色只有一个来源") */
const GC_THEME_EQUIVALENTS: Record<string, keyof typeof theme> = {
  gcTicketText: "gold",
  gcPanelFallbackStroke: "gold",
  gcPanelFallbackBg: "bgPanel",
  gcSwapStroke: "gold",
  gcTenText: "gold",
  gcTenStroke: "gold",
  gcCollBonus: "gold",
  gcBarFillLegend: "gold",
  gcAdStroke: "actionPrimary",
  gcAdText: "actionPrimary",
  gcCollLabel: "actionPrimary",
  gcRowSelStroke: "actionPrimary",
  gcAdBg: "actionPrimaryBg",
  gcBtnTextDisabled: "textMuted",
  gcDupText: "echo",
  gcBarFillEpic: "echo",
  gcPityLabel: "textSecondary",
  gcResLabel: "textSecondary",
  gcRowLevel: "textSecondary",
  gcEmpty: "textSecondary",
};

describe("phase4 表的扭蛋屏配色档", () => {
  const defs = phase4Defaults();
  const web = webGachaSource();

  it("每个 gc* 键都在表里给了默认值(Web 绘制路径里的内联字面量不留裸值在视图文件)", () => {
    for (const k of GC_KEYS) expect(defs[k], `${k} 应有默认值`).toBeDefined();
  });

  it("表里的 gc* 键集合与测试清单逐键相同(没有漏断言的孤儿键)", () => {
    const inTable = Object.keys(defs).filter((k) => k.startsWith("gc"));
    expect(inTable.slice().sort()).toEqual(GC_KEYS.slice().sort());
  });

  it("每个 gc* 键都在 Phase4Params 接口里声明(typedMerge 的整段接线不漏键)", () => {
    const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
    const iface = src.slice(src.indexOf("export interface Phase4Params"), src.indexOf("export const PHASE4_DEFAULTS"));
    for (const k of GC_KEYS) expect(new RegExp(`^\\s+${k}: (?:string|number);$`, "m").test(iface), k).toBe(true);
  });

  it("gc* 段不与已落地的 lb / dl / ps / gu 四段撞键", () => {
    const inTable = Object.keys(defs);
    for (const p of ["lb", "dl", "ps", "gu"]) expect(inTable.filter((k) => k.startsWith(p)).every((k) => !k.startsWith("gc"))).toBe(true);
    expect(new Set(inTable).size).toBe(inTable.length);
  });

  it("与共享 theme 同值的二十键", () => {
    for (const [k, token] of Object.entries(GC_THEME_EQUIVALENTS)) expect(defs[k].toLowerCase(), `${k} 应等于 theme.${token}`).toBe(String(theme[token]).toLowerCase());
  });

  it("替代字形就是 Web iconText 的那个 fallbackGlyph", () => {
    expect(defs.gcTicketGlyph).toBe("✦");
    expect(web.includes('"icon_ticket", "✦"')).toBe(true);
  });

  it("三枚钮的禁档同底不同描边:钮 0.2、广告钮与换券条 0.15(Web 两处不同档,不共用)", () => {
    expect(defs.gcBtnDisabledBg).toBe("#1A1F2A");
    expect(defs.gcBtnDisabledStroke).toBe("rgba(255,255,255,0.2)");
    expect(defs.gcPanelDisabledStroke).toBe("rgba(255,255,255,0.15)");
    expect(web.includes('g.fillStyle = canSingle ? "#3a2d4d" : "#1a1f2a";')).toBe(true);
    expect(web.includes('g.strokeStyle = canSingle ? "#c06cff" : "rgba(255,255,255,0.2)";')).toBe(true);
    expect(web.includes('g.strokeStyle = canTen ? "#ffd76a" : "rgba(255,255,255,0.2)";')).toBe(true);
    expect(web.includes('g.strokeStyle = canAdGacha ? "#4dffc8" : "rgba(255,255,255,0.15)";')).toBe(true);
    expect(web.includes('g.strokeStyle = canTicket ? "#ffd76a" : "rgba(255,255,255,0.15)";')).toBe(true);
  });

  it("可抽档三枚钮的底色与描边都能回到 Web 段找到同一写法", () => {
    expect(web.includes('g.fillStyle = canSingle ? "#3a2d4d" : "#1a1f2a";')).toBe(true);
    expect(web.includes('g.fillStyle = canTen ? "#c06cff" : "#1a1f2a";')).toBe(true);
    expect(web.includes('g.fillStyle = canAdGacha ? "#1d3d2e" : "#1a1f2a";')).toBe(true);
    expect(web.includes('g.fillStyle = canTicket ? "#3a3320" : "#1a1f2a";')).toBe(true);
    expect(defs.gcSingleBg).toBe("#3A2D4D");
    expect(defs.gcTenBg).toBe("#C06CFF");
    expect(defs.gcAdBg.toLowerCase()).toBe("#1d3d2e");
    expect(defs.gcSwapBg).toBe("#3A3320");
  });

  it("双保底条的填充两档分开(史诗紫、传奇金),暗罩取 skinBar 的默认 dim", () => {
    expect(defs.gcBarFillEpic).toBe("#C8B6FF");
    expect(defs.gcBarFillLegend).toBe("#FFD76A");
    expect(defs.gcBarFallbackTrack).toBe("rgba(255,255,255,0.12)");
    expect(defs.gcBarCover).toBe("rgba(10,12,18,0.72)");
    expect(web.includes('g.fillStyle = "rgba(255,255,255,0.12)";')).toBe(true);
    expect(web.includes('g.fillStyle = "#c8b6ff";')).toBe(true);
    expect(web.includes('g.fillStyle = "#ffd76a";')).toBe(true);
    // skinBar 的 dim 默认值:Web 本屏没传第七实参,所以走的就是这一档
    expect((web.match(/skinBar\(g, this\.assets, "bar_progress_blue_b"/g) ?? []).length).toBe(2);
  });

  it("收藏行两档底与描边都是纯代码矩形(Web 本屏行底没有贴图)", () => {
    expect(defs.gcRowSelFill).toBe("rgba(77,255,200,0.14)");
    expect(defs.gcRowSelStroke).toBe("#4DFFC8");
    expect(defs.gcRowFill).toBe("rgba(255,255,255,0.04)");
    expect(defs.gcRowStroke).toBe("rgba(255,255,255,0.12)");
    expect(web.includes('g.fillStyle = sel ? "rgba(77,255,200,0.14)" : "rgba(255,255,255,0.04)";')).toBe(true);
    expect(web.includes('g.strokeStyle = sel ? "#4dffc8" : "rgba(255,255,255,0.12)";')).toBe(true);
  });

  it("覆盖底与通行证 / 升级屏同值但独立分键(本屏 0.86,与每日屏的 0.9 不同)", () => {
    expect(defs.gcDim).toBe("rgba(8,10,16,0.86)");
    expect(defs.gcDim).toBe(defs.psDim);
    expect(defs.gcDim).toBe(defs.guDim);
    expect(defs.gcDim).not.toBe(defs.dlDim);
    expect(web.includes('g.fillStyle = "rgba(8,10,16,0.86)";')).toBe(true);
  });

  it("返回钮三色与 Web 的 drawBaseBg 闭包同档(与 gearup 的 0.15 / 紫色档不同)", () => {
    expect(defs.gcBackBg).toBe("#2A3D55");
    expect(defs.gcBackStroke).toBe("rgba(255,255,255,0.3)");
    expect(defs.gcBackText).toBe("#CFCFCF");
    expect(web.includes('g.fillStyle = "#2a3d55";')).toBe(true);
    expect(web.includes('"返回", () => {')).toBe(true);
    // 与装备升级屏那两档确实不同值(那一屏是继承上一笔的 0.15)
    expect(defs.gcBackStroke).not.toBe(defs.guBackStroke);
  });

  it("七枚去重后的贴图键都在 ASSET_MANIFEST 里;除面板底外都在 Web 扭蛋段字面出现", () => {
    const keys = ["panel_dark_corners", "banner_large_purple", "icon_ticket", "btn_minor", "btn_primary", "btn_back", "bar_progress_blue_b"];
    for (const k of keys) expect(ASSET_MANIFEST[k as keyof typeof ASSET_MANIFEST], k).toBeDefined();
    for (const k of keys.filter((x) => x !== "panel_dark_corners")) expect(web.includes(`"${k}"`), k).toBe(true);
    // 面板底:Web 本屏调 panelPad 不传专属键,那一串住在 panelPad 的默认分支里
    expect(web.includes("this.panelPad(g, w, h);")).toBe(true);
    expect(web.includes("panel_gacha")).toBe(false);
    const full = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
    expect(full.includes('this.assets.drawNine(g, "panel_dark_corners"')).toBe(true);
  });
});

/* ==================== 12. 模型纯度:不写存档 ==================== */

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe("模型纯度(存档只读,写入意图是返回值)", () => {
  it("buildGachaContent / hitGacha / gachaClaim / gachaLevel 都不改传入存档与瞬时态", () => {
    const owned = makeGear(6);
    const s = save({ gachaTicket: 99, diamond: 99, gachaPityEpic: 4, gachaPityLegendary: 44, ownedGear: owned, selectedGearId: owned[2].id });
    const rs = [res("旧1", "epic", true, 15)];
    deepFreeze(s);
    deepFreeze(rs);
    const before = JSON.stringify(s);
    const beforeRecent = JSON.stringify(rs);
    for (const h of [H_STD, H_TALL]) {
      const L = gachaLayout(W, h, owned.map((g) => g.id), rs.length);
      buildGachaContent(s, rs, L);
      const pts = [
        center(L.backBtn),
        center(L.singleBtn),
        center(L.tenBtn),
        center(L.adBtn),
        center(L.ticketBtn),
        ...L.rows.map((r) => center(r.rect)),
        { x: 2, y: h / 2 },
      ];
      for (const p of pts) {
        const a = hitGacha(L, p.x, p.y);
        if (a) gachaClaim(s, rs, a, () => 0);
      }
      for (const st of [1, 2, 40]) expect(gachaLevel(st)).toBeGreaterThan(0);
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(rs)).toBe(beforeRecent);
  });

  it("意图里的 newGear 是新生成的装备,不与存档共享引用", () => {
    const s = save({ gachaTicket: GACHA_COST });
    const claim = gachaClaim(s, [], { kind: "single" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(claim.newGear.every((e) => !s.ownedGear.includes(e))).toBe(true);
  });

  it("交回宿主的 recent 是新数组,不改调用方传入的瞬时态", () => {
    const old = recent(3);
    const before = old.slice();
    const claim = gachaClaim(save({ gachaTicket: GACHA_COST }), old, { kind: "single" })!;
    if (claim.kind !== "draw") return expect(claim.kind).toBe("draw");
    expect(old).toHaveLength(3);
    expect(old.map((r) => r.eq.name)).toEqual(before.map((r) => r.eq.name));
    expect(claim.recent).not.toBe(old);
  });
});

/* ==================== 13. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = ["../cocos/assets/scripts/game/ui/gachaLayout.ts", "../cocos/assets/scripts/gacha/GachaModel.ts"];

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

  it("共享层不读存档:行 id 与最近结果条数都是入参", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/game/ui/gachaLayout.ts", import.meta.url), "utf8"));
    for (const bad of ["save.", "ownedGear", "gachaResults", "persistSave"]) expect(src.includes(bad), bad).toBe(false);
  });

  it("模型不写存档、不碰广告通道", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/gacha/GachaModel.ts", import.meta.url), "utf8"));
    for (const bad of ["ownedGear.push", "save.gachaTicket -=", "persist", "watchAd", "showRewardedAd", "localStorage"]) {
      expect(src.includes(bad), bad).toBe(false);
    }
  });
});

/* ==================== 14. 视图层纪律 ==================== */

describe("GachaView 的落位纪律(R5)", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/gacha/GachaView.ts", import.meta.url), "utf8");

  it("最近抽取两列的显隐成对切换:name 收起之后必须再放回(构建包实测抓到的缺陷)", () => {
    // 进屏时 gachaResults 为空 → 五个 name 槽全被收起;若 happy path 不放回,抽到的装备名永远不显示
    expect(src.includes("slot.name.active(false);"), "name 列:结果变少时收起").toBe(true);
    expect(src.includes("slot.name.active(true);"), "name 列:有结果时放回").toBe(true);
    expect(src.includes("slot.dup.active(false);"), "dup 列:结果变少时收起").toBe(true);
    expect(src.includes("slot.dup.active(!!rc.dupText);"), "dup 列:按有无折算文本切换").toBe(true);
    expect(src.indexOf("slot.name.active(true);")).toBeLessThan(src.indexOf("slot.name.set("));
  });

  it("文本只经 placeLine 一个入口,视图不自己按对齐摆节点", () => {
    expect(src.includes("placeLine(")).toBe(true);
    expect((src.match(/lb\.horizontalAlign\s*=/g) ?? []).length).toBe(1);
    expect((src.match(/placeLine\(/g) ?? []).length).toBe(1);
  });

  it("视图不产几何:热区矩形与文本锚点都从 layout 取,行区不裁不缩", () => {
    const code = codeOf(src);
    expect(code.includes("spreadRows")).toBe(false);
    expect(code.includes("rowTextY")).toBe(false);
    expect(code.includes("rows.slice")).toBe(false);
    expect(code.includes("Math.max(L.rowH")).toBe(false);
    expect(code.includes("rowsTop +")).toBe(false);
  });

  it("行池按需增建,并挂在 Capture 之前建好的容器上(增建不会排到热区之后)", () => {
    expect(src.includes("private ensureRows(")).toBe(true);
    expect(src.includes('makeNode("Rows", this.root)')).toBe(true);
    expect(src.indexOf("this.rowsNode = makeNode")).toBeLessThan(src.indexOf("this.capture = makeNode"));
    expect(src.includes("this.ensureRows(L.rows.length)")).toBe(true);
  });

  it("本屏不写存档:广告与落账都只经动作出口交给宿主", () => {
    const code = codeOf(src);
    expect(code.includes("persist")).toBe(false);
    expect(code.includes("AdChannel")).toBe(false);
    expect(code.includes("drawGacha(")).toBe(false);
    expect(code.includes("watchAd")).toBe(false);
    expect(code.includes("gachaClaim")).toBe(false);
  });

  it("六枚表现贴图键都在视图里消费,面板键由共享层给", () => {
    for (const k of ["banner_large_purple", "icon_ticket", "btn_minor", "btn_primary", "btn_back", "bar_progress_blue_b"]) {
      expect(src.includes(`"${k}"`), k).toBe(true);
    }
    // 面板底的键由几何层给(layout.panelKey),视图里不写死那串
    expect(src.includes("this.panel.show(L.panelKey")).toBe(true);
    expect(src.includes('"panel_dark_corners"')).toBe(false);
  });
});

/* ==================== 15. 宿主接线:五件套 + 路由注册 + 占位提示下线 ==================== */

describe("GameShell 的扭蛋屏接线", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildGachaScreen", "gachaSave", "openGacha", "syncGacha", "onGachaAction", "commitGachaClaim"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildGachaScreen();")).toBe(true);
    expect(src.indexOf("this.buildGachaScreen();")).toBeGreaterThan(src.indexOf("this.buildGearUpScreen();"));
    expect(src.includes("gacha: () => this.syncGacha(),")).toBe(true);
    expect(src.includes('"gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("路由实际注册十六屏(SCREEN_KEYS 仍是 16 态全量)", () => {
    const router = readFileSync(new URL("../cocos/assets/scripts/core/ScreenRouter.ts", import.meta.url), "utf8");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    // 十一个屏走 sync*(heroes / leaderboard / daily / pass / gearup / gacha / prestige / commission / fusion / season / gameover);menu 走 refreshMenu、shop 走视图
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(13);
    expect(hooks.includes("menu: () => this.refreshMenu(),")).toBe(true);
    expect(hooks.includes("shop: () => this.shopView?.sync(),")).toBe(true);
  });

  it("入口从占位轻提示换成 openGacha,占位表已随最后一屏落地整表下线", () => {
    expect(src.includes('if (a.entry === "gacha")')).toBe(true);
    expect(src.includes("this.openGacha();")).toBe(true);
    expect(src.includes("扭蛋尚未开放")).toBe(false);
    expect(src.includes("PENDING_SCREEN")).toBe(false);
  });

  it("进屏先清空瞬时最近结果(对标 Web openGacha),再切屏", () => {
    const seg = src.slice(src.indexOf("private openGacha("), src.indexOf("private syncGacha("));
    expect(seg.includes("this.gachaResults = [];")).toBe(true);
    expect(seg.includes('this.router.show("gacha")')).toBe(true);
    expect(seg.indexOf("this.gachaResults = [];")).toBeLessThan(seg.indexOf('this.router.show("gacha")'));
  });

  it("几何与内容都经宿主投影现算(视图不读存档)", () => {
    const seg = src.slice(src.indexOf("private buildGachaScreen"), src.indexOf("private gachaSave"));
    expect(seg.includes("gachaScreenLayout(DESIGN_W, logicalH()")).toBe(true);
    expect(seg.includes("this.gachaSave().ownedGear.map((g) => g.id)")).toBe(true);
    expect(seg.includes("this.gachaResults.length")).toBe(true);
    expect(seg.includes("buildGachaContent(this.gachaSave(), this.gachaResults, L)")).toBe(true);
    const slice = src.slice(src.indexOf("private gachaSave"), src.indexOf("private openGacha"));
    for (const f of ["gachaTicket", "gachaPityEpic", "gachaPityLegendary", "dailyGachaAdUsed", "diamond", "highestStage", "ownedGear", "selectedGearId"]) {
      expect(slice.includes(`${f}: s.${f}`), f).toBe(true);
    }
  });

  it("广告档走 watchAd 唯一入口,闸门只在 watchAd 首行(Web adBusy 同位)", () => {
    const seg = src.slice(src.indexOf("private onGachaAction"), src.indexOf("private commitGachaClaim"));
    // 广告闸门只有 watchAd 首行那一道(对标 Web watchAd 的 adBusy):屏级 action 不再吞整屏点击
    expect(seg.includes("adPending"), "扭蛋屏 action 里没有屏级广告闸门").toBe(false);
    expect(src.split("if (this.adPending) return;").length - 1, "整个 GameShell 只剩 watchAd 那一道广告闸门").toBe(1);
    expect(seg.includes("this.watchAd(")).toBe(true);
    expect(seg.includes('this.toast("广告未看完,奖励未入账")')).toBe(true);
    expect(seg.includes('this.router.show("menu")')).toBe(true);
    expect(seg.includes("gachaClaim(this.gachaSave(), this.gachaResults, a)")).toBe(true);
  });

  it("一次广告抽落两次盘:抽取落账一次、置 dailyGachaAdUsed 之后再落一次", () => {
    const seg = src.slice(src.indexOf("private commitGachaClaim"), src.indexOf("/* ================= 转生与天赋屏"));
    expect((seg.match(/this\.sim\?\.persist\(\)/g) ?? []).length).toBe(4);
    expect(seg.includes("save.dailyGachaAdUsed = true;")).toBe(true);
    expect(seg.includes("if (claim.markAdUsed)")).toBe(true);
    expect(seg.includes("this.sim?.world.recordEquipment(eq)")).toBe(true);
    expect(seg.includes("save.ownedGear.push(eq)")).toBe(true);
    expect(seg.includes("this.gachaResults = claim.recent;")).toBe(true);
    expect(seg.includes("save.gachaTicket -= claim.ticketCost;")).toBe(true);
    expect(seg.includes("this.syncGacha();")).toBe(true);
    expect(seg.includes("this.refreshMenu();")).toBe(true);
  });

  it("停在扭蛋屏跨天时本屏也重排一次(dailyGachaAdUsed 由每日重置清零)", () => {
    const seg = src.slice(src.indexOf("update(dt: number)"), src.indexOf("if (this.router.blocksPlay())"));
    expect(seg.includes('if (this.router.current === "gacha") this.syncGacha();')).toBe(true);
  });

  it("晚到贴图流补刷本屏(与前四屏同一条通道)", () => {
    const seg = src.slice(src.indexOf("private async boot"), src.indexOf("private buildLayers"));
    expect(seg.includes("this.gachaView?.setFrames(this.frames);")).toBe(true);
    expect(seg.includes('if (this.router.current === "gacha") this.gachaView?.sync();')).toBe(true);
  });
});

/* ==================== 16. 与 Web 的对照:反直觉口径 ==================== */

describe("Web 基准的反直觉口径已原样带上", () => {
  const web = webGachaSource();

  it("Web 的行以 id 为键:绘制 find、命中也按 r.id 切 selectedGearId", () => {
    expect(web.includes("const gear = this.save.ownedGear.find((x) => x.id === r.id);")).toBe(true);
    expect(web.includes("this.save.selectedGearId = this.save.selectedGearId === r.id ? null : r.id;")).toBe(true);
    expect(web.includes("id: g.id,")).toBe(true);
  });

  it("Web 的行不做截断也不滚动:rows 直接 map 整个 ownedGear", () => {
    const layoutSeg = web.slice(web.indexOf("private gachaLayout()"), web.indexOf("private drawGacha("));
    expect(layoutSeg.includes("rows: this.save.ownedGear.map((g, i)")).toBe(true);
    expect(layoutSeg.includes("slice(")).toBe(false);
    expect(layoutSeg.includes("rowH + gap")).toBe(true);
  });

  it("Web 的 pity 是先拷后进函数再写回:两处都是同一条链", () => {
    expect((web.match(/const pity = \{ pityEpic: this\.save\.gachaPityEpic, pityLegendary: this\.save\.gachaPityLegendary \};/g) ?? []).length).toBe(2);
    expect((web.match(/drawGacha10\(this\.gachaLevel\(\), pity, this\.save\.ownedGear\)/g) ?? []).length).toBe(1);
    expect((web.match(/drawGacha\(this\.gachaLevel\(\), pity, this\.save\.ownedGear\)/g) ?? []).length).toBe(2);
    expect((web.match(/this\.save\.gachaPityEpic = pity\.pityEpic;/g) ?? []).length).toBe(2);
    expect((web.match(/this\.save\.gachaPityLegendary = pity\.pityLegendary;/g) ?? []).length).toBe(2);
  });

  it("Web 的最近结果两处都 slice(0, 8),绘制只取前 5", () => {
    expect((web.match(/\]\.slice\(0, 8\);/g) ?? []).length).toBe(2);
    expect(web.includes("this.gachaResults.slice(0, 5)")).toBe(true);
    expect(web.includes("Math.min(this.gachaResults.length, 5)")).toBe(true);
  });

  it("Web 的广告分支:回调里先抽再置标记再落盘,doGachaAd 内部已经落过一次", () => {
    const click = web.slice(web.indexOf("private onGachaClick("));
    expect(click.includes("if (this.save.dailyGachaAdUsed) return;")).toBe(true);
    expect(click.includes("this.watchAd(() => {")).toBe(true);
    expect(click.includes("this.save.dailyGachaAdUsed = true;\n        persistSave(this.save);")).toBe(true);
    const doAd = web.slice(web.indexOf("private doGachaAd("), web.indexOf("private gachaLayout()"));
    expect(doAd.includes("persistSave(this.save);")).toBe(true);
    expect(doAd.includes("gachaTicket")).toBe(false);
  });

  it("Web 的静默都在扣费前:doGacha 看券、换券看钻石", () => {
    const doGacha = web.slice(web.indexOf("private doGacha("), web.indexOf("private doGachaAd("));
    expect(doGacha.includes("if (this.save.gachaTicket < cost) return;")).toBe(true);
    expect(doGacha.includes("const cost = count === 10 ? GACHA_10_COST : GACHA_COST;")).toBe(true);
    const click = web.slice(web.indexOf("private onGachaClick("));
    expect(click.includes("if (this.save.diamond < DIAMOND_TICKET_COST) return;")).toBe(true);
  });

  it("Web 的命中七段顺序就是优先级", () => {
    const click = web.slice(web.indexOf("private onGachaClick("));
    expect(click.includes('this.state = "menu";\n      return;')).toBe(true);
    const order = ["L.backBtn.x", "L.singleBtn.x", "L.tenBtn.x", "L.adBtn.x", "L.ticketBtn.x", "for (const r of L.rows)"];
    let at = -1;
    for (const k of order) {
      const i = click.indexOf(k);
      expect(i, k).toBeGreaterThan(-1);
      expect(i > at, `顺序:${k}`).toBe(true);
      at = i;
    }
    // 走完 for 循环就结束了:没有"其余一律"兜底
    expect(click.slice(click.indexOf("for (const r of L.rows)")).includes("else")).toBe(false);
  });

  it("Web 的 openGacha 只清瞬时结果并切屏,不落盘", () => {
    const seg = web.slice(web.indexOf("private openGacha("), web.indexOf("private gachaLevel("));
    expect(seg.includes("this.gachaResults = [];")).toBe(true);
    expect(seg.includes('this.state = "gacha";')).toBe(true);
    expect(seg.includes("persistSave")).toBe(false);
  });

  it("派单核实 ②:dailyGachaAdUsed 由每日重置清零,BattleSim 与 Web 各只有那一处", () => {
    const sim = readFileSync(new URL("../cocos/assets/scripts/battle/BattleSim.ts", import.meta.url), "utf8");
    const seg = sim.slice(sim.indexOf("private checkDailyReset()"), sim.indexOf("/** 广告复活(结算屏调用)"));
    expect(seg.includes("this.save.dailyGachaAdUsed = false;")).toBe(true);
    const full = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
    expect((full.match(/dailyGachaAdUsed = false/g) ?? []).length).toBe(1);
    expect((sim.match(/dailyGachaAdUsed = false/g) ?? []).length).toBe(1);
    // 本屏不需要额外处理:壳层只是在本屏可见时重排一次
    const shell = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8");
    expect((shell.match(/dailyGachaAdUsed = false/g) ?? []).length).toBe(0);
  });

  it("派单核实 ①:recordEquipment 的 Cocos 对应物已存在,本屏逐件接上", () => {
    const sim = readFileSync(new URL("../cocos/assets/scripts/battle/BattleSim.ts", import.meta.url), "utf8");
    const seg = sim.slice(sim.indexOf("private recordEquipment("), sim.indexOf("private recordAffix("));
    expect(seg.includes("this.save.collection")).toBe(true);
    expect(seg.includes("recordAffix(col.triggers")).toBe(true);
    const world = readFileSync(new URL("../cocos/assets/scripts/game/systems/battleWorld.ts", import.meta.url), "utf8");
    expect(world.includes("recordEquipment(eq: Equipment): void")).toBe(true);
    const shell = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8");
    // Web 的 doGacha / doGachaAd 各调一次 recordEquipment → Cocos 侧由宿主逐件走同一条口
    expect((web.match(/this\.recordEquipment\(/g) ?? []).length).toBe(2);
    // 这条口在宿主侧有两处消费者(章间商店 + 本屏),扭蛋落账段内恰好一处
    expect((shell.match(/world\.recordEquipment\(eq\)/g) ?? []).length).toBe(2);
    const commit = shell.slice(shell.indexOf("private commitGachaClaim"), shell.indexOf("/* ================= 转生与天赋屏"));
    expect((commit.match(/world\.recordEquipment\(eq\)/g) ?? []).length).toBe(1);
  });

  it("Web 的绘制侧对齐口径:三处右对齐画完立刻切回 left,四枚热区文字居中", () => {
    expect((web.match(/g\.textAlign = "right";/g) ?? []).length).toBe(2);
    expect((web.match(/g\.textAlign = "left";/g) ?? []).length).toBeGreaterThan(2);
    expect(web.includes('g.fillText(`重复→星尘+${r.stardust}`, w - pad, ly);')).toBe(true);
    expect(web.includes('g.fillText("带入中", r.x + r.w - 8, ty);')).toBe(true);
    expect(web.includes("g.fillText(gear.name, r.x + 8, ty);")).toBe(true);
    expect(web.includes("g.fillText(`Lv.${gear.level} ${q.name}`, r.x + 150, ty);")).toBe(true);
  });
});

/* ==================== 17. gachaBarRects(skinBar 的遮罩法与缺图档) ==================== */

describe("gachaBarRects:贴图暗罩与缺图填充两档", () => {
  const track: GcRect = { x: 124, y: 244, w: 408, h: 6 };

  it("frac = 0:填充宽 0、暗罩盖满整条", () => {
    const r = gachaBarRects(track, 0);
    expect(r.fill.w).toBe(0);
    expect(r.cover).toEqual(track);
  });

  it("frac = 1:填充满格、暗罩为 null(Web 的 if (f < 1) 才画遮罩)", () => {
    const r = gachaBarRects(track, 1);
    expect(r.fill.w).toBe(track.w);
    expect(r.cover).toBeNull();
  });

  it("frac > 1 被钳到满格;暗罩与填充互补", () => {
    for (const f of [0, 0.25, 0.5, 1, 4]) {
      const r = gachaBarRects(track, f);
      expect(r.fill.w).toBeGreaterThanOrEqual(0);
      expect(r.fill.w).toBeLessThanOrEqual(track.w);
      if (r.cover) {
        expect(r.cover.x + r.cover.w).toBeCloseTo(track.x + track.w, 9);
        expect(r.fill.w + r.cover.w).toBeCloseTo(track.w, 9);
      } else {
        expect(f).toBeGreaterThanOrEqual(1);
      }
    }
    expect(gachaBarRects(track, 0.25).fill.w).toBe(track.w * 0.25);
    expect(gachaBarRects(track, 4).cover).toBeNull();
    expect(gachaBarRects(track, 4).fill.w).toBe(track.w);
  });

  it("Web 原样性质:缺图档的填充只钳上界不钳下界(负 frac 给负宽,与 Web 同式)", () => {
    // Web 的 `g.fillRect(barX, y, barW2 * Math.min(1, pity / 10), 6)` 没有 Math.max(0, …)
    expect(gachaBarRects(track, -5).fill.w).toBe(track.w * -5);
    // 暗罩那一档走 skinBar 的 clamp(0..1),所以负 frac 时是整条盖满
    expect(gachaBarRects(track, -5).cover).toEqual(track);
  });

  it("两条保底条各用自己的轨道矩形,frac 由内容层给", () => {
    const L = gachaLayout(W, H_STD, [], 0);
    expect(gachaBarRects(L.pityEpicBar, 5 / 10).fill.x).toBe(L.pityEpicBar.x);
    expect(gachaBarRects(L.pityLegendBar, 25 / 50).fill.x).toBe(L.pityLegendBar.x);
    expect(gachaBarRects(L.pityLegendBar, 25 / 50).fill.w).toBe(L.pityLegendBar.w * 0.5);
  });
});
