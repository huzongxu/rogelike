/**
 * Phase 4 第九屏闸门:赛季结算屏(到期翻页入账 + 摘要四行互斥 + 无手动入口)。
 *
 * 延续 cocos-phase4-leaderboard / -daily / -pass / -gearup / -gacha / -prestige / -commission
 * / -fusion 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `season/SeasonModel.ts` 经相对路径 import 的共享层
 *     (`game/data/season` 的到期判据与赛季分与折算、`game/data/seasonSets` 的主题名、
 *     `game/ui/seasonLayout`),与 Web 侧经 `@game` 别名 import 的是同一个模块实例
 *     (函数引用 `toBe` 相同),于是"14 天整即翻页""赛季分 = Σ星×10 + 赛季最佳""1 分 = 1 星尘"
 *     这三条规则不可能出现两份抄本;
 *  2. **断言按门控变量分档**:几何只吃 `h` 与摘要形态位;翻页只吃 `seasonStartAt` 与入参 `now`;
 *     文案只吃摘要三字段与当前 `seasonId` —— 时间与随机源都是入参,三种赛季时态全部钉死;
 *  3. **视图无关**:本文件只吃 cc-free 的 `SeasonModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 本屏的几何重点是**四格矩阵**:`h ∈ {996, 1246} × 摘要形态 ∈ {上屏, 收起}`。与已落地八屏不同,
 * 这一屏**一次都不调 `spreadRows`**(内容条数恒为徽标 + 横幅 + 标题 + 四行摘要 + 一枚钮),
 * 纵向只有两条锚线:`anchorY = h × 0.28` 与 `by = h − 78`。于是两档屏高之间**每个矩形都按 h 线性
 * 位移**,而形态位不改变任何矩形(四行摘要的矩形恒算,只是整支 `active` 起落)—— 矩阵把这两条
 * 不变量都锁住。贴底钮底边落在 `h − 34` 而非 `h − pad`,钮内文字基线是裸偏移 `+28`
 * (同档实参下 `rowTextY` 会给 `+27`),两处都是 Web 原样。
 *
 * 另锁本屏照抄的 Web 口径:写入发生在进屏前(贴底钮那一下不落盘)、离线跨多赛季只留最近一次
 * 摘要且那一轮分数与星尘都是 0、摘要形态位在 Web 侧恒真(绘制层的防御分支)、整屏只有
 * 一枚热区、`tickSeason` 必须排在路由闸门之前(停在非战斗屏跨赛季也要翻页并重排当前屏)。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { DAY_MS, SEASON_DAYS, SEASON_STARDUST_RATE, seasonDay, seasonEnded, seasonScore, seasonStardust } from "@game/data/season";
import { seasonTheme } from "@game/data/seasonSets";
import { STAGES } from "@game/data/stages";
import { fs as FS, rowTextY, ui as THEME_UI } from "@game/ui/theme";
import {
  SE_ANCHOR_RATIO,
  SE_BANNER_DY,
  SE_BANNER_H,
  SE_BANNER_W,
  SE_BANNER_DX,
  SE_BTN_H,
  SE_BTN_HALF_W,
  SE_BTN_PX,
  SE_BTN_STROKE_W,
  SE_BTN_TEXT_DY,
  SE_BTN_UP,
  SE_BTN_W,
  SE_DUST_DY,
  SE_DUST_PX,
  SE_EMBLEM_DX,
  SE_EMBLEM_DY,
  SE_EMBLEM_SIZE,
  SE_NOTE_DY,
  SE_NOTE_PX,
  SE_SCORE_DY,
  SE_SCORE_PX,
  SE_STARS_RESET,
  SE_SUMMARY_LINES,
  SE_THEME_DY,
  SE_THEME_PX,
  SE_TITLE_PX,
  seasonCloseBtn,
  seasonLayout,
  seasonScreenLayout,
  type SeasonLayout,
  type SeRect,
} from "@game/ui/seasonLayout";

/* ---------- Cocos 宿主侧的被测件(cc-free) ---------- */
import {
  buildSeasonContent,
  hitSeason,
  seasonRoll,
  type SeasonSaveView,
  type SeasonSummary,
} from "../cocos/assets/scripts/season/SeasonModel";
import * as cocosSeasonLayout from "../cocos/assets/scripts/game/ui/seasonLayout";
import * as cocosSeasonData from "../cocos/assets/scripts/game/data/season";
import * as cocosSeasonSets from "../cocos/assets/scripts/game/data/seasonSets";

/* ==================== 夹具 ==================== */

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = THEME_UI.pad;

/** 一个可复现的时间基准(14 天整 = 1_209_600_000 ms,与 Date 无关) */
const START = 1_700_000_000_000;
const SEASON_MS = SEASON_DAYS * DAY_MS;

/** 一份"S3 进行中、有通关星数与赛季最佳"的档;stageStars 索引 0 不用 */
function save(over: Partial<SeasonSaveView> = {}): SeasonSaveView {
  return { seasonId: 3, seasonStartAt: START, stageStars: [0, 3, 3, 2, 0, 0, 0, 0], seasonBest: 27, stardust: 500, ...over };
}

function summary(over: Partial<SeasonSummary> = {}): SeasonSummary {
  return { id: 3, score: 107, stardust: 107, ...over };
}

function laid(h: number, s: boolean): SeasonLayout {
  return seasonLayout(W, h, s);
}

/** 一帧几何 + 一屏文案(形态位由摘要是否存在折出,与宿主同一条口) */
function screen(s: SeasonSummary | null, h: number = H_STD, sv: SeasonSaveView = save()) {
  const L = laid(h, !!s);
  return { L, c: buildSeasonContent(sv, s, L) };
}

const center = (r: SeRect): number => r.x + r.w / 2;
const bottom = (r: SeRect): number => r.y + r.h;
const right = (r: SeRect): number => r.x + r.w;

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

/** Web drawSeason 的源码段(3847-3880 一体,含 onSeasonClick 与 closeSeason 的分支) */
function webDrawSeason(): string {
  const web = webSource();
  return web.slice(web.indexOf("private drawSeason("), web.indexOf("/* ---------- 装备升级"));
}

/* ==================== 0. 端间同一实现与本屏要用到的表事实 ==================== */

describe("端间共读同一份共享层与本屏要用到的表事实", () => {
  it("season 数据、seasonSets 与 seasonLayout 三个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosSeasonData.seasonEnded).toBe(seasonEnded);
    expect(cocosSeasonData.seasonScore).toBe(seasonScore);
    expect(cocosSeasonData.seasonStardust).toBe(seasonStardust);
    expect(cocosSeasonData.seasonDay).toBe(seasonDay);
    expect(cocosSeasonSets.seasonTheme).toBe(seasonTheme);
    expect(cocosSeasonLayout.seasonLayout).toBe(seasonLayout);
    expect(cocosSeasonLayout.seasonScreenLayout).toBe(seasonScreenLayout);
    expect(cocosSeasonLayout.seasonCloseBtn).toBe(seasonCloseBtn);
  });

  it("本屏用到的三个周期常量:14 天 / 一天毫秒 / 1 分兑 1 星尘", () => {
    expect(SEASON_DAYS).toBe(14);
    expect(DAY_MS).toBe(86_400_000);
    expect(SEASON_STARDUST_RATE).toBe(1);
    expect(SEASON_MS).toBe(1_209_600_000);
  });

  it("seasonScore 的本屏实参:八格星数里三格非零(3+3+2 → 80)+ 赛季最佳 27 = 107", () => {
    expect(seasonScore([0, 3, 3, 2, 0, 0, 0, 0], 27)).toBe(107);
    expect(seasonStardust(107)).toBe(107);
  });

  it("四季主题按 (id − 1) 取模轮换,S5 回到 S1 的名字", () => {
    expect(seasonTheme(1).name).toBe("回响苏醒");
    expect(seasonTheme(2).name).toBe("永冻深渊");
    expect(seasonTheme(3).name).toBe("熔火回响");
    expect(seasonTheme(4).name).toBe("幽冥潮汐");
    expect(seasonTheme(5).name).toBe(seasonTheme(1).name);
    expect(seasonTheme(3).name).not.toBe(seasonTheme(4).name);
  });
});

/* ==================== 1. 四格几何矩阵 ==================== */

describe("四格几何矩阵(h ∈ {996,1246} × 摘要形态 ∈ {上屏,收起})", () => {
  /* 期望值由 seasonLayout(560, h, summary) 实算得出后写死 */
  const MATRIX: Record<number, { anchor: number; emblemY: number; bannerY: number; base: number[]; btnY: number; btnText: number }> = {
    996: {
      anchor: 278.88000000000005,
      emblemY: 182.88000000000005,
      bannerY: 246.88000000000005,
      base: [312.88000000000005, 340.88000000000005, 364.88000000000005, 392.88000000000005],
      btnY: 918,
      btnText: 946,
    },
    1246: {
      anchor: 348.88000000000005,
      emblemY: 252.88000000000005,
      bannerY: 316.88000000000005,
      base: [382.88000000000005, 410.88000000000005, 434.88000000000005, 462.88000000000005],
      btnY: 1168,
      btnText: 1196,
    },
  };

  for (const h of [H_STD, H_TALL]) {
    const M = MATRIX[h];
    it(`h=${h}:锚线与五处盒位逐字对标 Web 的 h × 0.28 / h − 78`, () => {
      for (const s of [true, false]) {
        const L = laid(h, s);
        expect(L.anchorY).toBeCloseTo(M.anchor, 10);
        expect(L.anchorY).toBeCloseTo(h * SE_ANCHOR_RATIO, 10);
        expect(L.emblem).toEqual({ x: 256, y: M.emblemY, w: 48, h: 48 });
        expect(L.banner).toEqual({ x: 160, y: M.bannerY, w: SE_BANNER_W, h: SE_BANNER_H });
        expect(L.closeBtn).toEqual({ x: 185, y: M.btnY, w: SE_BTN_W, h: SE_BTN_H });
        expect(L.title.baseY).toBeCloseTo(M.anchor, 10);
        expect([L.themeLine.baseY, L.scoreLine.baseY, L.dustLine.baseY, L.noteLine.baseY].map((n) => +n.toFixed(10))).toEqual(M.base.map((n) => +n.toFixed(10)));
        expect(L.closeText.baseY).toBe(M.btnText);
      }
    });

    it(`h=${h}:横向盒位与屏高无关(半宽常量就是唯一实参)`, () => {
      const L = laid(h, true);
      expect(L.emblem.x).toBe(W / 2 - SE_EMBLEM_DX);
      expect(center(L.emblem)).toBe(280);
      expect(L.banner.x).toBe(W / 2 - SE_BANNER_DX);
      expect(center(L.banner)).toBe(280);
      expect(L.closeBtn.x).toBe(W / 2 - SE_BTN_HALF_W);
      expect(center(L.closeBtn)).toBe(280);
      expect(L.title.x).toBe(280);
      expect(bottom(L.closeBtn)).toBe(h - 34);
      expect(L.btnBottomGap).toBe(34);
    });
  }

  it("两档之间每个矩形都按 h 线性位移(本屏没有随屏高摊开的行区)", () => {
    const a = laid(H_STD, true);
    const b = laid(H_TALL, true);
    const dH = H_TALL - H_STD;
    expect(b.anchorY - a.anchorY).toBeCloseTo(dH * SE_ANCHOR_RATIO, 10);
    expect(b.emblem.y - a.emblem.y).toBeCloseTo(dH * SE_ANCHOR_RATIO, 10);
    expect(b.banner.y - a.banner.y).toBeCloseTo(dH * SE_ANCHOR_RATIO, 10);
    expect(b.themeLine.baseY - a.themeLine.baseY).toBeCloseTo(dH * SE_ANCHOR_RATIO, 10);
    expect(b.noteLine.baseY - a.noteLine.baseY).toBeCloseTo(dH * SE_ANCHOR_RATIO, 10);
    expect(b.closeBtn.y - a.closeBtn.y).toBe(dH);
    expect(b.closeText.baseY - a.closeText.baseY).toBe(dH);
    expect(bottom(b.closeBtn) - bottom(a.closeBtn)).toBe(dH);
  });

  it("摘要形态位不改变任何矩形:四行恒算,只有整支 active 起落", () => {
    const on = laid(H_STD, true);
    const off = laid(H_STD, false);
    expect(on.summary).toBe(true);
    expect(off.summary).toBe(false);
    for (const k of ["emblem", "banner", "closeBtn", "title", "themeLine", "scoreLine", "dustLine", "noteLine", "closeText"] as const) {
      expect(off[k]).toEqual(on[k]);
    }
    expect(on.summaryDys).toEqual([SE_THEME_DY, SE_SCORE_DY, SE_DUST_DY, SE_NOTE_DY]);
    expect(on.summaryDys).toHaveLength(SE_SUMMARY_LINES);
  });

  it("七行全部居中、限宽收成 [pad, w − pad],字号是 Web 的六档字面量", () => {
    const L = laid(H_STD, true);
    const lines = [L.title, L.themeLine, L.scoreLine, L.dustLine, L.noteLine, L.closeText];
    for (const t of lines) {
      expect(t.align).toBe("center");
      expect(t.x).toBe(280);
      expect(t.maxW).toBe(W - PAD * 2);
      expect(t.x - t.maxW / 2).toBe(PAD);
      expect(t.x + t.maxW / 2).toBe(W - PAD);
    }
    expect([L.title.px, L.themeLine.px, L.scoreLine.px, L.dustLine.px, L.noteLine.px, L.closeText.px]).toEqual([SE_TITLE_PX, SE_THEME_PX, SE_SCORE_PX, SE_DUST_PX, SE_NOTE_PX, SE_BTN_PX]);
    expect([L.title.px, L.themeLine.px, L.scoreLine.px, L.dustLine.px, L.noteLine.px, L.closeText.px]).toEqual([24, 16, 17, 17, 16, 15]);
    expect([L.title.bold, L.themeLine.bold, L.scoreLine.bold, L.dustLine.bold, L.noteLine.bold, L.closeText.bold]).toEqual([true, false, true, true, false, true]);
  });

  it("三档字号不在 fs 表里(24 / 17 / 15):Web 那三笔是写死的字面量,不是表常量插值", () => {
    const table: number[] = Object.values(FS);
    expect(table.sort((a, b) => a - b)).toEqual([12, 13, 14, 16, 22, 28]);
    for (const px of [SE_TITLE_PX, SE_SCORE_PX, SE_DUST_PX, SE_BTN_PX]) {
      expect(table.includes(px), String(px)).toBe(false);
    }
    // 16 那一档确实等于 fs.section,所以不能整屏一律按"表里没有"处理
    expect(SE_THEME_PX).toBe(FS.section);
    expect(SE_NOTE_PX).toBe(FS.section);
  });

  it("钮内文字基线是裸偏移 +28,与 rowTextY 同档实参的 27 差 1(Web 原样,不在本层修正)", () => {
    const L = laid(H_STD, true);
    expect(SE_BTN_TEXT_DY).toBe(28);
    expect(L.closeText.baseY - L.closeBtn.y).toBe(SE_BTN_TEXT_DY);
    expect(rowTextY(L.closeBtn.y, SE_BTN_H, SE_BTN_PX)).toBe(L.closeText.baseY - 1);
    const web = webDrawSeason();
    expect(web.includes("g.fillText(`进入赛季 S${this.save.seasonId}`, w / 2, by + 28);")).toBe(true);
  });

  it("贴底钮底边压在 h − 34 而不是 h − pad(Web 写的是裸 78,与其它屏的贴底口径不同)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h, true);
      expect(L.closeBtn.y).toBe(h - SE_BTN_UP);
      expect(bottom(L.closeBtn)).not.toBe(h - PAD);
      expect(SE_BTN_UP).toBe(SE_BTN_H + 34);
    }
  });

  it("本屏一次都不调 spreadRows:共享层里没有它的引用,几何也不随存档条数变", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/game/ui/seasonLayout.ts"));
    expect(src.includes("spreadRows")).toBe(false);
    expect(src.includes("rowTextY")).toBe(false);
    // 只 import ui.pad
    expect(fileSource("../cocos/assets/scripts/game/ui/seasonLayout.ts")).toContain('import { ui } from "./theme";');
  });

  it("四格全部矩形与七行文本带都不越出横向 [pad, w − pad],也不越出纵向 [0, h]", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const s of [true, false]) {
        const L = laid(h, s);
        const rects = [L.emblem, L.banner, L.closeBtn];
        for (const r of rects) {
          expect(r.x, `${h}/${s}/${r.w}`).toBeGreaterThanOrEqual(PAD);
          expect(right(r), `${h}/${s}/${r.w}`).toBeLessThanOrEqual(W - PAD);
        }
        for (const t of [L.title, L.themeLine, L.scoreLine, L.dustLine, L.noteLine, L.closeText]) {
          expect(t.x - t.maxW / 2).toBe(PAD);
          expect(t.x + t.maxW / 2).toBe(W - PAD);
          expect(t.baseY).toBeGreaterThan(0);
          expect(t.baseY).toBeLessThan(h);
        }
        for (const r of rects) {
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(bottom(r)).toBeLessThanOrEqual(h);
        }
        // 摘要末行与贴底钮之间不得叠在一起
        expect(L.noteLine.baseY).toBeLessThan(L.closeBtn.y);
      }
    }
  });

  it("单一出口与直算同数(seasonScreenLayout 就是 seasonLayout 的转发)", () => {
    expect(seasonScreenLayout(W, H_STD, true)).toEqual(laid(H_STD, true));
    expect(seasonCloseBtn(W, H_STD)).toEqual(laid(H_STD, true).closeBtn);
  });
});

/* ==================== 2. 三种赛季时态与翻页 ==================== */

describe("三种赛季时态(时间全走 now 形参)", () => {
  it("进行中:第 4 天,不翻页、不产摘要、也不弹屏", () => {
    const now = START + 3 * DAY_MS + 1;
    expect(seasonDay(START, now)).toBe(4);
    expect(seasonEnded(START, now)).toBe(false);
    expect(seasonRoll(save(), now)).toBeNull();
  });

  it("临近结束:第 14 天最后一天仍不翻页,差 1 ms 都不翻", () => {
    const now = START + SEASON_MS - 1;
    expect(seasonDay(START, now)).toBe(SEASON_DAYS);
    expect(seasonEnded(START, now)).toBe(false);
    expect(seasonRoll(save(), now)).toBeNull();
  });

  it("到点即翻:seasonEnded 是 ≥ 判据,14 天整那一毫秒就结算", () => {
    const now = START + SEASON_MS;
    expect(seasonEnded(START, now)).toBe(true);
    const claim = seasonRoll(save(), now)!;
    expect(claim).toEqual({
      kind: "roll",
      persists: true,
      rolls: 1,
      stardustGain: 107,
      seasonIdTo: 4,
      seasonStartAtTo: START + SEASON_MS,
      starsTo: [0, 0, 0, 0, 0, 0, 0, 0],
      seasonBestTo: 0,
      summary: { id: 3, score: 107, stardust: 107 },
    });
  });

  it("已翻页:摘要记的是刚结束那一号,按钮文案是新一号(S3 结束 → 进入赛季 S4)", () => {
    const claim = seasonRoll(save(), START + SEASON_MS)!;
    const s: SeasonSaveView = { ...save(), seasonId: claim.seasonIdTo, seasonStartAt: claim.seasonStartAtTo, stageStars: claim.starsTo, seasonBest: 0 };
    const { L, c } = screen(claim.summary, H_STD, s);
    expect(c.hasSummary).toBe(true);
    expect(c.themeLine).toBe("赛季 S3「熔火回响」结束");
    expect(c.closeText).toBe("进入赛季 S4");
    expect(s.seasonId).toBe(4);
    // 翻页后这一号自己重新计时,当天是第 1 天
    expect(seasonDay(s.seasonStartAt, START + SEASON_MS)).toBe(1);
    expect(seasonRoll(s, START + SEASON_MS)).toBeNull();
    expect(L.summary).toBe(true);
  });

  it("离线跨两季:只留最近一次摘要,而那一轮的星数与最佳已在首轮清零 → 分数与星尘都是 0", () => {
    const claim = seasonRoll(save(), START + 2 * SEASON_MS)!;
    expect(claim.rolls).toBe(2);
    expect(claim.seasonIdTo).toBe(5);
    expect(claim.seasonStartAtTo).toBe(START + 2 * SEASON_MS);
    expect(claim.stardustGain).toBe(107);
    expect(claim.summary).toEqual({ id: 4, score: 0, stardust: 0 });
    const { c } = screen(claim.summary, H_STD, { ...save(), seasonId: claim.seasonIdTo });
    expect(c.themeLine).toBe("赛季 S4「幽冥潮汐」结束");
    expect(c.scoreLine).toBe("赛季分 0");
    expect(c.dustLine).toBe("星尘 +0");
    expect(c.closeText).toBe("进入赛季 S5");
  });

  it("离线跨三季:seasonStartAt 与 seasonId 各推进三格,累加的星尘仍只有首轮那一笔", () => {
    const claim = seasonRoll(save(), START + 3 * SEASON_MS + 5)!;
    expect(claim.rolls).toBe(3);
    expect(claim.seasonIdTo).toBe(6);
    expect(claim.seasonStartAtTo).toBe(START + 3 * SEASON_MS);
    expect(claim.stardustGain).toBe(107);
    expect(claim.summary).toEqual({ id: 5, score: 0, stardust: 0 });
  });

  it("零档(全空存档)到点也翻一页,发放 0 星尘", () => {
    const claim = seasonRoll({ seasonId: 1, seasonStartAt: START, stageStars: [0, 0, 0, 0, 0, 0, 0, 0], seasonBest: 0, stardust: 0 }, START + SEASON_MS)!;
    expect(claim.rolls).toBe(1);
    expect(claim.stardustGain).toBe(0);
    expect(claim.seasonIdTo).toBe(2);
    expect(claim.summary).toEqual({ id: 1, score: 0, stardust: 0 });
  });

  it("now 形参缺省即 Date.now(Web 同口径),且本函数不改动入参存档", () => {
    const s = save();
    const frozen = JSON.parse(JSON.stringify(s));
    Object.freeze(s);
    Object.freeze(s.stageStars);
    expect(seasonRoll(s, START + SEASON_MS)!.rolls).toBe(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(frozen);
    // 缺省实参那一发:新鲜存档(START 是过去的时间点)必然已到期,至少翻一页
    const fresh = seasonRoll({ ...s, seasonStartAt: Date.now() });
    expect(fresh).toBeNull();
  });

  it("翻页意图的五笔账面恰好覆盖本屏要写的五个存档字段,且 starsTo 每次是新数组", () => {
    const a = seasonRoll(save(), START + SEASON_MS)!;
    const b = seasonRoll(save(), START + SEASON_MS)!;
    expect(Object.keys(a).sort()).toEqual(["kind", "persists", "rolls", "seasonBestTo", "seasonIdTo", "seasonStartAtTo", "stardustGain", "starsTo", "summary"]);
    expect(a.starsTo).not.toBe(b.starsTo);
    expect(a.starsTo).toEqual(SE_STARS_RESET);
    expect(a.summary).not.toBe(b.summary);
  });
});

/* ==================== 3. 内容 ==================== */

describe("一屏文案(buildSeasonContent)", () => {
  it("摘要有 → 标题 + 四行 + 钮文案六件齐全;摘要是空 → 四行整支收起、只剩标题与钮", () => {
    const on = screen(summary());
    expect(on.c.hasSummary).toBe(true);
    expect(on.c.title).toBe("赛季结算");
    expect([on.c.themeLine, on.c.scoreLine, on.c.dustLine, on.c.noteLine]).toEqual(["赛季 S3「熔火回响」结束", "赛季分 107", "星尘 +107", "星数与赛季最佳已重置 · 关卡/收藏/天赋永久保留"]);
    expect(on.c.closeText).toBe("进入赛季 S3");

    const off = screen(null);
    expect(off.c.hasSummary).toBe(false);
    expect(off.c.themeLine).toBe("");
    expect(off.c.scoreLine).toBe("");
    expect(off.c.dustLine).toBe("");
    // 说明行与标题、钮文案都不依赖摘要
    expect(off.c.noteLine).toBe("星数与赛季最佳已重置 · 关卡/收藏/天赋永久保留");
    expect(off.c.title).toBe("赛季结算");
    expect(off.c.closeText).toBe("进入赛季 S3");
  });

  it("L.summary 为假时即使给了摘要也不上屏(形态位由宿主按摘要是否存在折出,内容层不越权)", () => {
    const L = laid(H_STD, false);
    expect(buildSeasonContent(save(), summary(), L).hasSummary).toBe(false);
  });

  it("星尘行与赛季分行同数:折算率是 1(改这一档就会撞上,回头就得处理两行文案)", () => {
    const s = summary({ score: 233, stardust: seasonStardust(233) });
    const { c } = screen(s);
    expect(SEASON_STARDUST_RATE).toBe(1);
    expect(c.scoreLine).toBe("赛季分 233");
    expect(c.dustLine).toBe("星尘 +233");
    expect(c.scoreLine.slice(4)).toBe(c.dustLine.slice(4));
  });

  it("翻页摘要的 score 与 stardust 由 seasonScore / seasonStardust 现算,与两行文案同数", () => {
    const s = save({ stageStars: [0, 3, 3, 3, 3, 3, 3, 3], seasonBest: 41 });
    const claim = seasonRoll(s, START + SEASON_MS)!;
    expect(claim.summary.score).toBe(3 * 10 * 7 + 41);
    expect(claim.summary.stardust).toBe(claim.summary.score * SEASON_STARDUST_RATE);
    const { c } = screen(claim.summary);
    expect(c.scoreLine).toBe(`赛季分 ${claim.summary.score}`);
    expect(c.dustLine).toBe(`星尘 +${claim.summary.stardust}`);
  });

  it("摘要主题名走的是摘要里那一号,不是当前赛季那一号(S3 结束、当前 S4)", () => {
    const { c } = screen(summary({ id: 2 }), H_STD);
    expect(c.themeLine).toBe("赛季 S2「永冻深渊」结束");
    expect(seasonTheme(2).name).toBe("永冻深渊");
  });
});

/* ==================== 4. 命中 ==================== */

describe("命中(hitSeason:整屏只有一枚热区)", () => {
  it("钮内四角与中心都命中,钮外一律 null", () => {
    const L = laid(H_STD, true);
    const b = L.closeBtn;
    for (const p of [
      [b.x, b.y],
      [right(b), b.y],
      [b.x, bottom(b)],
      [right(b), bottom(b)],
      [center(b), b.y + SE_BTN_H / 2],
    ]) {
      expect(hitSeason(L, p[0], p[1]), JSON.stringify(p)).toEqual({ kind: "close" });
    }
    expect(hitSeason(L, b.x - 1, b.y + 1)).toBeNull();
    expect(hitSeason(L, b.x + 1, b.y - 1)).toBeNull();
    expect(hitSeason(L, center(b), bottom(b) + 1)).toBeNull();
  });

  it("标题、四行摘要、徽标与横幅都不是热区(Web onSeasonClick 只认 seasonBtn)", () => {
    const L = laid(H_STD, true);
    for (const r of [L.emblem, L.banner]) {
      expect(hitSeason(L, center(r), r.y + r.h / 2)).toBeNull();
    }
    for (const t of [L.title, L.themeLine, L.scoreLine, L.dustLine, L.noteLine]) {
      expect(hitSeason(L, t.x, t.baseY - 4)).toBeNull();
    }
    // 屏上任一点(钮除外)都不命中
    expect(hitSeason(L, 280, 500)).toBeNull();
    expect(hitSeason(L, 10, 10)).toBeNull();
    expect(hitSeason(L, 280, 990)).toBeNull();
  });

  it("摘要收起那一支的命中面与上屏那一支完全一致(形态位不进命中)", () => {
    const on = laid(H_STD, true);
    const off = laid(H_STD, false);
    expect(hitSeason(off, 280, 940)).toEqual(hitSeason(on, 280, 940));
    expect(hitSeason(off, 280, 320)).toBeNull();
  });
});

/* ==================== 5. phase4 表的 se* 段 ==================== */

describe("phase4 表的 se* 段(默认值逐项对标 Web drawSeason)", () => {
  const D = phase4Defaults();
  const SE_KEYS = Object.keys(D).filter((k) => k.startsWith("se"));
  const web = webDrawSeason();

  it("本屏一共 9 键,且都以 se 开头", () => {
    expect(SE_KEYS).toHaveLength(9);
    expect(SE_KEYS.every((k) => /^se[A-Z]/.test(k))).toBe(true);
    expect(SE_KEYS).toEqual(["seDim", "seTitle", "seSummarySeason", "seSummaryScore", "seSummaryStardust", "seSummaryNote", "seBtnFill", "seBtnStroke", "seBtnText"]);
  });

  it("覆盖底、标题与摘要四行的色与 Web 的 fillStyle 逐笔一致", () => {
    expect(D.seDim).toBe("rgba(8,10,16,0.92)");
    expect(D.seTitle).toBe("#FFD76A");
    expect(D.seSummarySeason).toBe("#E8E8E8");
    expect(D.seSummaryScore).toBe("#C8B6FF");
    expect(D.seSummaryStardust).toBe("#7FD8FF");
    expect(D.seSummaryNote).toBe("#8F9BB3");
    expect(web.includes('g.fillStyle = "rgba(8,10,16,0.92)";')).toBe(true);
    expect(web.includes('g.fillStyle = theme.gold;')).toBe(true);
    expect(web.includes('g.fillStyle = "#e8e8e8";')).toBe(true);
    expect(web.includes("g.fillStyle = theme.echo;")).toBe(true);
    expect(web.includes("g.fillStyle = theme.stardust;")).toBe(true);
    expect(web.includes('g.fillStyle = "#8f9bb3";')).toBe(true);
  });

  it("贴底钮三件(钮文字 Web 写的是 #fff,表内一律记 6 位档)", () => {
    expect([D.seBtnFill, D.seBtnStroke, D.seBtnText]).toEqual(["#2A3D55", "#FFD76A", "#FFFFFF"]);
    expect(web.includes('g.fillStyle = "#2a3d55";')).toBe(true);
    expect(web.includes("g.strokeStyle = theme.gold;")).toBe(true);
    expect(web.includes('g.fillStyle = "#fff";')).toBe(true);
    expect("#fff".replace("#", "").split("").map((c) => c + c).join("").toUpperCase()).toBe(D.seBtnText.slice(1));
  });

  it("表里只有颜色,不含几何数与字号:九键全以 # 或 rgba 起头", () => {
    for (const k of SE_KEYS) expect(/^#[0-9A-Fa-f]{6}$|^rgba?\(/.test(D[k]), k).toBe(true);
  });

  it("theme 令牌同值性:三行走令牌、两行走 Web 字面量(#e8e8e8 与 textPrimary 不同值)", () => {
    const hex = fileSource("../cocos/assets/scripts/ui/Widgets.ts");
    expect(hex.includes('gold: "#FFD76A"')).toBe(true);
    expect(hex.includes('echo: "#C8B6FF"')).toBe(true);
    expect(hex.includes('stardust: "#7FD8FF"')).toBe(true);
    expect(hex.includes('textSecondary: "#8F9BB3"')).toBe(true);
    expect(hex.includes('textPrimary: "#E8ECF4"')).toBe(true);
    // 摘要首行 Web 写的是 #e8e8e8,不是 textPrimary —— 两者不同值,不能顺手归到令牌上
    expect(D.seSummarySeason.toLowerCase()).not.toBe("#E8ECF4".toLowerCase());
    // 说明行与 textSecondary 同值(Web 写的是小写字面量)
    expect(D.seSummaryNote.toLowerCase()).toBe("#8f9bb3");
  });

  it("本屏没有面板底,所以表里不存在 se 前缀的面板键与九宫格切深", () => {
    expect(SE_KEYS.filter((k) => /panel|nine/i.test(k))).toEqual([]);
    expect(web.includes("panelPad")).toBe(false);
    expect(web.includes("drawNine")).toBe(false);
    expect(web.includes("this.assets.draw")).toBe(true);
  });
});

/* ==================== 6. 字面量锁 ==================== */

describe("Web 字面量与本屏表常量的同数关系", () => {
  it("翻页清零的星数槽宽是 Web 的字面量 8,等于关卡数 + 1(索引 0 不用)", () => {
    expect(SE_STARS_RESET).toHaveLength(8);
    expect(SE_STARS_RESET.every((n) => n === 0)).toBe(true);
    expect(SE_STARS_RESET.length).toBe(STAGES.length + 1);
    const web = webSource();
    expect(web.includes("this.save.stageStars = [0, 0, 0, 0, 0, 0, 0, 0];")).toBe(true);
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    expect(saveModel.includes("for (let i = 1; i <= 7; i++)")).toBe(true);
  });

  it("说明行里的三样永久保留物(关卡/收藏/天赋)是 Web 字面量,文案与存档字段各自对得上", () => {
    const web = webDrawSeason();
    const note = "星数与赛季最佳已重置 · 关卡/收藏/天赋永久保留";
    expect(web.includes(note)).toBe(true);
    expect(screen(summary()).c.noteLine).toBe(note);
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    for (const f of ["highestStage", "ownedGear", "ownedTalents"]) expect(saveModel.includes(f), f).toBe(true);
    // 被重置的那两项确实也在档上,且正是本屏写掉的两个字段
    for (const f of ["stageStars", "seasonBest"]) expect(saveModel.includes(f + ":"), f).toBe(true);
  });

  it("五处 g.font 的字面量与共享层六档 px 逐字对应(24/16/17/17/16/15)", () => {
    const web = webDrawSeason();
    const fonts = [...web.matchAll(/g\.font = "(bold )?(\d+)px system-ui, sans-serif";/g)].map((m) => `${m[1] ? "b" : ""}${m[2]}`);
    expect(fonts).toEqual(["b24", "16", "b17", "16", "b15"]);
    // 五处 g.font 对六处 fillText:星尘行没重设字体,继承上一行的 bold 17
    expect([...web.matchAll(/g\.fillText\(/g)].length).toBe(6);
    expect([SE_TITLE_PX, SE_THEME_PX, SE_SCORE_PX, SE_DUST_PX, SE_NOTE_PX, SE_BTN_PX]).toEqual([24, 16, 17, 17, 16, 15]);
  });

  it("两处贴图盒的字面量与共享层常量同数(48 / 240×44 / 上抬 96 与 32)", () => {
    const web = webDrawSeason();
    expect(web.includes('this.assets.draw(g, "emblem_flow_gold", w / 2 - 24, h * 0.28 - 96, 48, 48);')).toBe(true);
    expect(web.includes('this.assets.draw(g, "banner_mid_bronze", w / 2 - 120, h * 0.28 - 32, 240, 44);')).toBe(true);
    expect([SE_EMBLEM_DX, SE_EMBLEM_DY, SE_EMBLEM_SIZE]).toEqual([24, 96, 48]);
    expect([SE_BANNER_DX, SE_BANNER_DY, SE_BANNER_W, SE_BANNER_H]).toEqual([120, 32, 240, 44]);
    expect(SE_BTN_W).toBe(190);
    expect(SE_BTN_UP).toBe(78);
    // Web 这一笔 strokeRect 没有显式设 lineWidth,取全项目"描边后复位 1"的约定档
    expect(SE_BTN_STROKE_W).toBe(1);
  });

  it("四行摘要的基线偏移是 Web 的裸加数 34 / 62 / 86 / 114", () => {
    const web = webDrawSeason();
    for (const dy of [SE_THEME_DY, SE_SCORE_DY, SE_DUST_DY, SE_NOTE_DY]) {
      expect(web.includes(`h * 0.28 + ${dy})`), String(dy)).toBe(true);
    }
    expect([SE_THEME_DY, SE_SCORE_DY, SE_DUST_DY, SE_NOTE_DY]).toEqual([34, 62, 86, 114]);
    expect(SE_ANCHOR_RATIO).toBe(0.28);
  });

  it("本屏没有任何 Date.now / 随机源消费点(时序全在宿主那一层)", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/season/SeasonModel.ts"));
    expect(model.includes("Math.random")).toBe(false);
    expect((model.match(/Date\.now\(\)/g) ?? []).length).toBe(1); // 只有 now 形参的默认值
    const view = codeOf(fileSource("../cocos/assets/scripts/season/SeasonView.ts"));
    expect(view.includes("Date.now")).toBe(false);
    expect(view.includes("Math.random")).toBe(false);
  });
});

/* ==================== 7. 宿主接线 ==================== */

describe("GameShell 的赛季结算屏接线", () => {
  const src = fileSource("../cocos/assets/scripts/GameShell.ts");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildSeasonScreen", "seasonSave", "openSeason", "tickSeason", "syncSeason", "onSeasonAction", "commitSeasonRoll"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildSeasonScreen();")).toBe(true);
    expect(src.indexOf("this.buildSeasonScreen();")).toBeGreaterThan(src.indexOf("this.buildFusionScreen();"));
    expect(src.includes("season: () => this.syncSeason(),")).toBe(true);
    expect(src.includes('"commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("路由实际注册十六屏(SCREEN_KEYS 仍是 16 态全量)", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(keysBlock[1].includes('"season"')).toBe(true);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(13);
  });

  it("晚到贴图流到位后本屏也换引用并在当前屏时补排一次", () => {
    expect(src.includes("this.seasonView?.setFrames(this.frames);")).toBe(true);
    expect(src.includes('if (this.router.current === "season") this.seasonView?.sync();')).toBe(true);
  });

  it("几何与内容都经宿主投影现算(视图不读存档),摘要形态位在这一层折出", () => {
    const seg = src.slice(src.indexOf("private buildSeasonScreen"), src.indexOf("private seasonSave"));
    expect(seg.includes("seasonScreenLayout(DESIGN_W, logicalH(), this.seasonSummary !== null)")).toBe(true);
    expect(seg.includes("buildSeasonContent(this.seasonSave(), this.seasonSummary, L)")).toBe(true);
    const slice = src.slice(src.indexOf("private seasonSave"), src.indexOf("private openSeason"));
    for (const f of ["slice.seasonId = s.seasonId", "slice.seasonStartAt = s.seasonStartAt", "slice.stageStars = s.stageStars", "slice.seasonBest = s.seasonBest", "slice.stardust = s.stardust", "return slice;"]) {
      expect(slice.includes(f), f).toBe(true);
    }
    // 到期判定逐帧读这一发,故切片是复用对象而不是新建(与 heroSlice 同性质)
    expect(src.includes("private seasonSlice: SeasonSaveView =")).toBe(true);
    expect(slice.includes("const slice = this.seasonSlice;")).toBe(true);
  });

  it("摘要挂在宿主上且不入档;入档的是那五个赛季字段(SaveModel 里已有归一化)", () => {
    expect(src.includes("private seasonView: SeasonView | null = null;")).toBe(true);
    expect(src.includes("private seasonSummary: SeasonSummary | null = null;")).toBe(true);
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    for (const f of ["seasonId", "seasonStartAt", "stageStars", "seasonBest"]) {
      expect(saveModel.includes(f + ":"), f).toBe(true);
    }
    expect(saveModel.includes("seasonSummary")).toBe(false);
    expect(saveModel.includes("seasonScore")).toBe(false);
  });

  it("翻页判定排在路由闸门之前,与每日重置同一条口(停在非战斗屏也会翻页)", () => {
    const loop = src.slice(src.indexOf("update(dt: number): void"));
    const tick = loop.indexOf("this.tickSeason();");
    const gate = loop.indexOf("if (this.router.blocksPlay()) return;");
    const daily = loop.indexOf("if (this.sim.syncDaily())");
    expect(tick).toBeGreaterThan(-1);
    expect(daily).toBeGreaterThan(-1);
    expect(tick).toBeGreaterThan(daily);
    expect(tick).toBeLessThan(gate);
  });

  it("翻页落账后当前屏显式重排(router.refresh),再按 Web 的条件自动弹屏", () => {
    const seg = src.slice(src.indexOf("private tickSeason"), src.indexOf("private syncSeason"));
    expect(seg.includes("this.commitSeasonRoll(claim);")).toBe(true);
    expect(seg.includes("this.router.refresh();")).toBe(true);
    expect(seg.includes('if (this.seasonSummary && this.router.current === "menu") this.openSeason();')).toBe(true);
    // 本屏没有手动入口:除 tickSeason 与探针外没有任何 UI 指向 openSeason
    const callers = [...src.matchAll(/this\.openSeason\(\)/g)].length;
    expect(callers).toBe(1);
    expect(src.includes('this.router.show("season")')).toBe(true);
    expect(src.includes('router.show("season")')).toBe(true);
  });

  it("存档写入只发生在 commitSeasonRoll;本屏分节里没有第二处写点", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 赛季结算屏"), src.indexOf("/* ================= 死亡结算屏")));
    expect(seg.includes("private commitSeasonRoll(claim: SeasonRollClaim): void")).toBe(true);
    // 落账段:五笔字段 + persist + 名次提示作废 + 记摘要 + 两次重排
    const commit = seg.slice(seg.indexOf("private commitSeasonRoll"));
    for (const f of ["save.stardust += claim.stardustGain", "save.seasonId = claim.seasonIdTo", "save.seasonStartAt = claim.seasonStartAtTo", "save.stageStars = claim.starsTo", "save.seasonBest = claim.seasonBestTo"]) {
      expect(commit.includes(f), f).toBe(true);
    }
    expect(commit.includes("this.sim.rankImprovedTo = null;")).toBe(true);
    expect(commit.includes("this.sim.persist();")).toBe(true);
    expect(commit.includes("this.refreshMenu();")).toBe(true);
    // commit 之外没有存档字段写入,也没有第二次落盘
    const outside = seg.replace(commit, "");
    expect(outside.includes("save.")).toBe(false);
    expect(outside.includes("persist(")).toBe(false);
    expect((seg.match(/persist\(\)/g) ?? []).length).toBe(1);
  });

  it("onSeasonAction 不含屏级广告闸门;全文件的 adPending 闸门仍然只有一道", () => {
    const seg = codeOf(src.slice(src.indexOf("private onSeasonAction"), src.indexOf("private commitSeasonRoll")));
    expect(seg.includes("adPending"), "赛季屏 action 里不该有屏级广告闸门").toBe(false);
    expect(seg.includes("watchAd"), "本屏没有广告位").toBe(false);
    const body = codeOf(src);
    expect((body.match(/if \(this\.adPending\) return;/g) ?? []).length).toBe(1);
  });

  it("翻页账本已从战斗层上移到宿主:BattleSim 里不再有一份抄本", () => {
    const sim = codeOf(fileSource("../cocos/assets/scripts/battle/BattleSim.ts"));
    expect(sim.includes("syncSeason")).toBe(false);
    expect(sim.includes("seasonStardust")).toBe(false);
    expect(sim.includes("seasonEnded")).toBe(false);
    // 赛季分仍是战斗结算要用的(阵亡与通关两处),那一条判据没有被牵连
    expect(sim.includes("seasonScore")).toBe(true);
    expect((sim.match(/this\.checkDailyReset\(\)/g) ?? []).length).toBe(2);
  });

  it("视图侧:两形态走容器 active 整棵切换,贴图键与 Web 逐字对应", () => {
    const view = fileSource("../cocos/assets/scripts/season/SeasonView.ts");
    expect(view.includes('const KEY_EMBLEM = "emblem_flow_gold";')).toBe(true);
    expect(view.includes('const KEY_BANNER = "banner_mid_bronze";')).toBe(true);
    expect(view.includes("this.summaryNode.active = c.hasSummary;")).toBe(true);
    expect(view.includes("get summaryVisible(): boolean")).toBe(true);
    // 本屏没有面板,所以不引 Plate、也不画九宫格
    const viewCode = codeOf(view);
    expect(viewCode.includes("Plate")).toBe(false);
    expect(viewCode.includes('"slice"')).toBe(false);
    expect(viewCode.includes("panel_dark_corners")).toBe(false);
  });

  it("Web 侧本屏的全部入口与出口:只有一个进屏条件、一个钮与一个 Esc", () => {
    const web = webSource();
    expect(web.includes('if (this.seasonSummary && this.state === "menu") this.state = "season";')).toBe(true);
    expect((web.match(/this.state = "season"/g) ?? []).length).toBe(1);
    expect((web.match(/this.state === "season"/g) ?? []).length).toBe(4);
    expect(web.includes('this.state === "season") this.drawSeason')).toBe(true);
    expect(web.includes("if (b && p.x >= b.x")).toBe(true);
    expect(web.includes('if (e.key === "Escape") this.closeSeason();')).toBe(true);
    expect(web.includes('this.state = "menu";')).toBe(true);
  });
});

/* ==================== 8. 跨屏事实 ==================== */

describe("跨屏事实:翻页时机与各屏读数", () => {
  it("Web 的翻页是每帧跑且不受状态门控(与每日重置同位),Cocos 侧同一条口", () => {
    const web = webSource();
    const loop = web.slice(web.indexOf("private update(dt: number): void"), web.indexOf("/** 商店卡等级"));
    const daily = loop.indexOf("this.checkDailyReset();");
    const season = loop.indexOf("this.syncSeason();");
    const gate = loop.indexOf("this.state === \"gameover\"");
    expect(daily).toBeGreaterThan(-1);
    expect(season).toBeGreaterThan(daily);
    // 翻页与弹屏两句都在暂停态闸门之前,所以停在任何一张屏都会翻
    expect(season).toBeLessThan(gate);
  });

  it("高级轨的归属赛季读 seasonId:翻页前后各算一次,判据即时翻转(不依赖屏内代码)", () => {
    const s = save({ seasonId: 3 });
    const premium = (cur: number, passSeason: number): boolean => passSeason === cur;
    expect(premium(s.seasonId, s.seasonId)).toBe(true);
    const claim = seasonRoll(s, START + SEASON_MS)!;
    expect(premium(claim.seasonIdTo, s.seasonId)).toBe(false);
    const web = webSource();
    expect(web.includes("this.save.premiumPassSeason === this.save.seasonId")).toBe(true);
  });

  it("排行屏的分数由 seasonScore 现算:翻页清零后同一名次判据立刻改变(屏侧只需重排一次)", () => {
    const s = save();
    expect(seasonScore(s.stageStars, s.seasonBest)).toBe(107);
    const claim = seasonRoll(s, START + SEASON_MS)!;
    expect(seasonScore(claim.starsTo, claim.seasonBestTo)).toBe(0);
    // 摘要里念的是清零前那一号的分,不是清零后的
    expect(claim.summary.score).toBe(107);
  });

  it("翻页后停在非战斗屏时,当前屏靠 router.refresh 立刻跟上(Web 靠逐帧重绘)", () => {
    const src = fileSource("../cocos/assets/scripts/GameShell.ts");
    const seg = src.slice(src.indexOf("private tickSeason"), src.indexOf("private syncSeason"));
    expect(seg.includes("this.router.refresh();")).toBe(true);
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    expect(router.includes("refresh(): void")).toBe(true);
    // 闸门之后的战斗屏推进路径没有被本屏改动:season 的账不再挂在 sim.update 上
    expect(seg.includes("this.sim.update")).toBe(false);
  });
});
