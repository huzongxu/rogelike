/**
 * Phase 4 第二屏闸门:每日福利屏(广告驱动 + 存档写入)。
 *
 * 延续 cocos-phase3 / cocos-phase4-leaderboard 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `daily/DailyModel.ts` 经相对路径 import 的共享层,
 *     与 Web 侧经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),
 *     于是每日规则不可能出现"两份抄本";
 *  2. **几何与计数钉死**:行数分档 / 三区归属 / 行矩形 / 两行文本基线 / 文本带右界,
 *     全部给固定输入断言固定输出;数量一律写"由什么门控",不钉死数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `DailyModel.ts` 与共享层纯布局,不需要引擎与浏览器。
 *
 * 时间是入参:`todayKey(now)` / `needsDailyReset(d, now)` 都收 ms,所以本文件用一个固定的
 * NOW 派生 TODAY / OTHER_DAY,断言里没有一处依赖真实当天日期。
 *
 * 覆盖派单要求的九条:行数分档(0/1/满额 + 缺失)、两档屏高的行几何、每条文本带落 0..560、
 * 两行文本基线与 l2 不越行底、天赋右文三态与"门控走已领条数"、补领行三态与底板档位、
 * 命中热区、模型纯度(冻结存档 + 写入意图以返回值给出)、cc-free 守卫。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import {
  DAILY_BOXES,
  DAILY_TALENT_COUNT,
  DAILY_TALENT_FREE,
  DAILY_TALENT_POOL,
  dailyBoxOf,
  dailyTalentOf,
  rollDailyTalents,
  todayKey,
} from "@game/data/daily";
import { makeUpReward, splitEcho } from "@game/data/stages";
import { fs as FS, ui as UI } from "@game/ui/theme";
import * as sharedDaily from "@game/data/daily";
import {
  dailyLayout,
  DL_BACK_H,
  DL_BACK_Y,
  DL_BANNER_H,
  DL_BANNER_W,
  DL_BANNER_X,
  DL_BANNER_Y,
  DL_DECO_GAP,
  DL_DECO_H,
  DL_DECO_W,
  DL_LABEL_H,
  DL_LABEL_DY,
  DL_LINE_SPACING,
  DL_LINE1_DY,
  DL_LIST_TOP,
  DL_NAME_DX,
  DL_PAD,
  DL_PANEL_KEY,
  DL_RES_BASE_Y,
  DL_ROW_MAX_H,
  DL_ROW_MIN_H,
  DL_STATUS_INSET,
  DL_TEXT_SLACK,
  DL_TOP_Y,
  evenDown,
  type DailyRowGeom,
  type DailyTextLine,
} from "@game/ui/dailyLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import {
  buildDailyContent,
  dailyClaim,
  dailyScreenLayout,
  hitDaily,
  type DailyAction,
  type DailySaveView,
} from "../cocos/assets/scripts/daily/DailyModel";
import * as cocosDaily from "../cocos/assets/scripts/game/data/daily";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
/** 页边距走本屏 `DL_PAD = 16`(`UI.pad` 是 Web 冻结档 14,本屏已不再读它) */
const PAD = DL_PAD;
/** 内容宽 = 560 − 16×2;右缘基准 544 */
const CONTENT_W = W - PAD * 2;
const RIGHT_EDGE = W - PAD;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/* 固定时钟:所有"今日/非今日"的断言都由它派生,不读真实当天 */
const NOW = 1_700_000_000_000;
const DAY = 24 * 3600_000;
const TODAY = todayKey(NOW);
const OTHER_DAY = todayKey(NOW - 3 * DAY);

/** 确定性天赋三条(取自池子前 N 条;rollDailyTalents 走 Math.random,几何断言里不用它) */
const TALENTS = DAILY_TALENT_POOL.slice(0, DAILY_TALENT_COUNT).map((t) => t.id);

function save(over: Partial<DailySaveView> = {}): DailySaveView {
  return {
    diamond: 0,
    adWatchCount: 0,
    dailyBoxClaimed: [],
    dailyTalentClaimed: [],
    dailyTalents: TALENTS,
    makeUpDate: "",
    dailyClearedDate: "",
    highestStage: 1,
    ...over,
  };
}

/** 文档顺序的全部行(宝箱 → 天赋 → 补领),几何断言统一吃这一份 */
function allRows(L: ReturnType<typeof dailyLayout>): DailyRowGeom[] {
  return [...L.boxRows, ...L.talentRows, L.makeUpRow];
}

/* ==================== 0. 端间同一实现(R1/R9 纪律延续到 Phase 4) ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/data/daily 与 @game 解析到同一批函数引用(不是两份抄本)", () => {
    for (const fn of ["dailyBoxOf", "dailyTalentOf", "rollDailyTalents", "todayKey"] as const) {
      expect(cocosDaily[fn], fn).toBe(sharedDaily[fn]);
    }
    expect(cocosDaily.DAILY_BOXES).toBe(DAILY_BOXES);
    expect(cocosDaily.DAILY_TALENT_FREE).toBe(DAILY_TALENT_FREE);
  });

  it("dailyScreenLayout 就是 dailyLayout(talentIds = save.dailyTalents ?? [])那一份", () => {
    const s = save();
    expect(dailyScreenLayout(W, H_STD, s)).toEqual(dailyLayout(W, H_STD, s.dailyTalents!));
    expect(dailyScreenLayout(W, H_STD, {})).toEqual(dailyLayout(W, H_STD, []));
  });
});

/* ==================== 1. 行数分档:n = DAILY_BOXES.length + talents.length + 1 ==================== */

describe("行数分档(三区:宝箱 + 每日天赋 + 1 行补领)", () => {
  const tiers: [string, string[]][] = [
    ["0 条", []],
    ["1 条", TALENTS.slice(0, 1)],
    [`满额 DAILY_TALENT_COUNT=${DAILY_TALENT_COUNT}`, TALENTS],
  ];

  for (const [name, talents] of tiers) {
    it(`天赋 ${name}:行数 = ${DAILY_BOXES.length} 宝箱 + ${talents.length} 天赋 + 1 补领`, () => {
      for (const h of [H_STD, H_TALL]) {
        const L = dailyScreenLayout(W, h, save({ dailyTalents: talents }));
        expect(L.rowCount, `h=${h}`).toBe(DAILY_BOXES.length + talents.length + 1);
        expect(L.boxCount).toBe(DAILY_BOXES.length);
        expect(L.talentCount).toBe(talents.length);
        // 三区归属:宝箱行 id 逐项对上 DAILY_BOXES,天赋行 id 逐项对上存档,补领行恒 1 且不带 id
        expect(L.boxRows.map((r) => r.id)).toEqual(DAILY_BOXES.map((b) => b.id));
        expect(L.talentRows.map((r) => r.id)).toEqual(talents);
        expect(allRows(L)).toHaveLength(L.rowCount);
        expect("id" in L.makeUpRow).toBe(false);
        // 行的 index 是区内下标(命中判定据此回查内容)
        expect(L.boxRows.map((r) => r.index)).toEqual(DAILY_BOXES.map((_, i) => i));
        expect(L.talentRows.map((r) => r.index)).toEqual(talents.map((_, i) => i));
      }
    });
  }

  it("dailyTalents 缺失(undefined)不炸,按 0 条处理(对标 Web `save.dailyTalents ?? []`)", () => {
    const s: DailySaveView = { ...save(), dailyTalents: undefined };
    expect(() => dailyScreenLayout(W, H_STD, s)).not.toThrow();
    const L = dailyScreenLayout(W, H_STD, s);
    expect(L.talentCount).toBe(0);
    expect(L.talentRows).toEqual([]);
    expect(L.rowCount).toBe(DAILY_BOXES.length + 1);
    const c = buildDailyContent(s, NOW);
    expect(c.talents).toEqual([]);
    expect(c.boxes).toHaveLength(DAILY_BOXES.length);
  });

  it("rollDailyTalents 是纯函数形状:条数 = DAILY_TALENT_COUNT、不重复、id 都在池子里", () => {
    const ids = rollDailyTalents();
    expect(ids).toHaveLength(DAILY_TALENT_COUNT);
    expect(new Set(ids).size).toBe(DAILY_TALENT_COUNT);
    for (const id of ids) expect(DAILY_TALENT_POOL.some((t) => t.id === id), id).toBe(true);
    // 布局与内容都能吃这一份随机结果(不依赖具体是哪三条)
    const L = dailyScreenLayout(W, H_STD, save({ dailyTalents: ids }));
    expect(L.talentRows.map((r) => r.id)).toEqual(ids);
    expect(buildDailyContent(save({ dailyTalents: ids }), NOW).talents.map((t) => t.name)).toEqual(ids.map((id) => dailyTalentOf(id).name));
  });
});

/* ==================== 2. 两档屏高:行不重叠 / 末行不越 h − pad / 横向落 0..560 ==================== */

describe("行矩形几何(996 与 1246 两档屏高)", () => {
  for (const h of [H_STD, H_TALL]) {
    for (const talents of [[], TALENTS.slice(0, 1), TALENTS] as string[][]) {
      it(`h=${h} 天赋 ${talents.length} 条:三区行两两不重叠、横向恒 [16, 544]、坐标全偶、补领行贴底`, () => {
        const L = dailyScreenLayout(W, h, save({ dailyTalents: talents }));
        expect(L.rowH).toBeGreaterThanOrEqual(DL_ROW_MIN_H);
        expect(L.rowH).toBeLessThanOrEqual(DL_ROW_MAX_H);
        expect(L.gap).toBeGreaterThanOrEqual(0);
        const rows = allRows(L);
        const bottomLimit = evenDown(h) - PAD;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i].rect;
          // 横向:左沿 = 页边距 16,宽 = 内容宽 528,右沿正落 544
          expect(r.x, `行${i} 左沿`).toBe(PAD);
          expect(r.w, `行${i} 宽`).toBe(CONTENT_W);
          expect(r.x + r.w, `行${i} 右沿`).toBe(RIGHT_EDGE);
          expect(r.x, `行${i} 左界`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `行${i} 不越画布`).toBeLessThanOrEqual(W);
          expect(r.h, `行${i} 高`).toBe(L.rowH);
          // module = 2:坐标与尺寸一律偶数(奇数会让行板九宫边距错半格)
          expect(r.x % 2, `行${i} x 取偶`).toBe(0);
          expect(r.y % 2, `行${i} y 取偶`).toBe(0);
          expect(r.w % 2, `行${i} w 取偶`).toBe(0);
          expect(r.h % 2, `行${i} h 取偶`).toBe(0);
          // 热区下限:每行都是一枚可点区,短边不小于 ui.touchMin
          expect(Math.min(r.w, r.h), `行${i} 热区`).toBeGreaterThanOrEqual(UI.touchMin);
          // 纵向:文档顺序递增且不重叠(三区之间还夹着标签带,所以只卡不重叠)
          if (i > 0) {
            const prev = rows[i - 1].rect;
            expect(r.y, `行${i} 不重叠`).toBeGreaterThanOrEqual(prev.y + prev.h);
          }
        }
        // 首行顶缘 = listTop + labelH;补领行贴底,底边正落 evenDown(h) − pad
        expect(rows[0].rect.y).toBe(DL_LIST_TOP + DL_LABEL_H);
        const last = rows[rows.length - 1].rect;
        expect(last.y + last.h, "补领行底边贴底").toBe(bottomLimit);
      });
    }
  }

  it("逐行递推口径(宝箱区 → 标签带 → 天赋区 → 补领行贴底,富余只进呼吸缝)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = dailyScreenLayout(W, h, save());
      const step = L.rowH + L.gap;
      // 宝箱区:自 listTop + labelH 起,逐行 y += rowH + gap
      L.boxRows.forEach((r, i) => expect(r.rect.y, `宝箱${i}`).toBe(DL_LIST_TOP + DL_LABEL_H + i * step));
      // 天赋组标签 = 宝箱末行之后的 y + 16,随后 y 再吃掉一个 labelH
      const afterBoxes = DL_LIST_TOP + DL_LABEL_H + DAILY_BOXES.length * step;
      expect(L.talentLabelY).toBe(afterBoxes + DL_LABEL_DY);
      expect(L.boxLabelY).toBe(DL_LIST_TOP + DL_LABEL_DY);
      L.talentRows.forEach((r, i) => expect(r.rect.y, `天赋${i}`).toBe(afterBoxes + DL_LABEL_H + i * step));
      // 补领行贴底:底边 = evenDown(h) − pad,顶缘由 rowH 反推
      expect(L.makeUpRow.rect.y).toBe(evenDown(h) - PAD - L.rowH);
      // 呼吸缝 = 天赋末行底边 → 补领行顶缘,是本屏唯一无硬上限的吸余体
      const afterTalents = afterBoxes + DL_LABEL_H + L.talentRows.length * step;
      expect(L.seamAboveMakeUp).toBe(L.makeUpRow.rect.y - afterTalents);
    }
  });

  it("天赋条数长到把行区挤满时:spreadRows 出数再各取一次偶,补领行仍贴底、呼吸缝不被吃穿", () => {
    for (const h of [H_STD, H_TALL]) {
      const crowded = dailyScreenLayout(W, h, save({ dailyTalents: DAILY_TALENT_POOL.map((t) => t.id) }));
      const lean = dailyScreenLayout(W, h, save());
      expect(crowded.talentCount).toBe(DAILY_TALENT_POOL.length);
      // 挤满档的行高与行距都收到下沿,且仍落在 art 网格上(偶数)
      expect(crowded.rowH % 2).toBe(0);
      expect(crowded.gap % 2).toBe(0);
      expect(crowded.rowH).toBeLessThanOrEqual(lean.rowH);
      expect(crowded.makeUpRow.rect.y + crowded.makeUpRow.rect.h).toBe(evenDown(h) - PAD);
      // 富余一分不落进行高行距,全部进呼吸缝;缝恒正且不小于 8
      expect(crowded.seamAboveMakeUp).toBeGreaterThanOrEqual(8);
      expect(crowded.seamAboveMakeUp).toBe(
        crowded.makeUpRow.rect.y - (DL_LIST_TOP + DL_LABEL_H + (DAILY_BOXES.length + crowded.talentCount) * (crowded.rowH + crowded.gap) + DL_LABEL_H)
      );
    }
  });
});

/* ==================== 3. 每条文本带落在 0..560(右对齐状态文案尤其) ==================== */

interface TextRequest {
  at: string;
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: TextAlign;
}

const bandOf = (t: TextRequest): Band => anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);

function expectInsideScreen(bands: TextRequest[]): void {
  const bad = bands
    .map((t) => `${t.at} [${t.align}] 锚点${t.x} 限宽${t.maxW} → ${bandOf(t).x}..${bandOf(t).x + bandOf(t).w}`)
    .filter((_, i) => {
      const b = bandOf(bands[i]);
      return b.x < 0 || b.x + b.w > W;
    });
  expect(bad).toEqual([]);
}

const lineReq = (at: string, l: DailyTextLine): TextRequest => ({ at, x: l.x, baseY: l.baseY, maxW: l.maxW, px: l.px, align: l.align });

/** 逐条对应 DailyView.sync 里的 Txt.set 调用(几何来自 dailyLayout) */
function textBands(h: number, talents: string[]): TextRequest[] {
  const L = dailyScreenLayout(W, h, save({ dailyTalents: talents }));
  const out: TextRequest[] = [
    // 标题两档:有横幅 → 横幅内居中;缺图 → 左起笔于 pad
    lineReq("标题(横幅内)", L.titleOnBanner),
    lineReq("标题(缺图回退)", L.titleBare),
    // 资源行一档:钻石图标退役后恒为「替代字形 + 文本」,起笔于 pad
    lineReq("资源行", L.resText),
    lineReq("宝箱区标签", L.boxLabel),
    lineReq("天赋区标签", L.talentLabel),
    lineReq("返回钮", L.backText),
  ];
  for (const [tag, rows] of [
    ["宝箱", L.boxRows],
    ["天赋", L.talentRows],
  ] as const) {
    rows.forEach((r, i) => {
      out.push(lineReq(`${tag}${i}名字`, r.line1), lineReq(`${tag}${i}描述`, r.line2), lineReq(`${tag}${i}状态`, r.status));
    });
  }
  out.push(lineReq("补领标题", L.makeUpRow.line1), lineReq("补领描述", L.makeUpRow.line2), lineReq("补领状态", L.makeUpRow.status));
  return out;
}

describe("文本带右界(dailyLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    expect([alignAx("left"), alignAx("center"), alignAx("right")]).toEqual([0, 0.5, 1]);
    const b = (align: TextAlign) => anchorBand(300, 58, 160, FS.micro, align, LIFT);
    expect(b("left").x).toBe(300);
    expect(b("center").x + b("center").w / 2).toBe(300);
    expect(b("right").x + b("right").w).toBe(300);
  });

  it("两档屏高 × 三档天赋条数:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const talents of [[], TALENTS.slice(0, 1), TALENTS] as string[][]) {
        const bands = textBands(h, talents);
        // 6 屏级 + (宝箱 + 天赋 + 补领)行 × 3 段
        expect(bands.length, `h=${h} 天赋${talents.length}`).toBe(6 + (DAILY_BOXES.length + talents.length + 1) * 3);
        expectInsideScreen(bands);
      }
    }
  });

  it("右对齐状态带末笔贴 x + w − 10,不越右界(Phase 3 的翻车点,逐行两档屏高)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = dailyScreenLayout(W, h, save());
      for (const row of allRows(L)) {
        const r = row.rect;
        expect(row.status.align).toBe("right");
        expect(row.status.x).toBe(r.x + r.w - DL_STATUS_INSET);
        const band = bandOf(lineReq("状态", row.status));
        expect(band.x + band.w, "末笔 = 右界锚点").toBe(row.status.x);
        expect(band.x + band.w).toBeLessThanOrEqual(W);
        expect(band.x).toBeGreaterThanOrEqual(0);
        // 名字/描述左起笔于 x + 10,限宽收到状态起笔前,两段带不互相压
        expect(row.line1.x).toBe(r.x + DL_NAME_DX);
        expect(row.line2.x).toBe(r.x + DL_NAME_DX);
        expect(bandOf(lineReq("名字", row.line1)).x + bandOf(lineReq("名字", row.line1)).w).toBeLessThanOrEqual(row.status.x);
      }
    }
  });
});

/* ==================== 4. 两行文本基线:l1 = evenDown(y + h/2 − 4),l2 = l1 + 18 ==================== */

describe("行内两行文本基线(18px 固定行距,不走 spreadRows)", () => {
  it("固定行距就是 18,首行下沉就是 −4(取偶档,让基线落在 art 网格上)", () => {
    expect(DL_LINE_SPACING).toBe(18);
    expect(DL_LINE1_DY).toBe(4);
    expect(DL_LINE_SPACING % 2).toBe(0);
    expect(DL_LINE1_DY % 2).toBe(0);
  });

  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:每行 l1 = evenDown(y + h/2 − 4)、l2 = l1 + 18,l2 不越出行底,状态与 l1 同基线`, () => {
      const L = dailyScreenLayout(W, h, save());
      for (const row of allRows(L)) {
        const r = row.rect;
        const l1 = evenDown(r.y + r.h / 2 - DL_LINE1_DY);
        expect(row.line1.baseY).toBe(l1);
        expect(row.line2.baseY).toBe(l1 + DL_LINE_SPACING);
        expect(row.status.baseY).toBe(l1);
        expect(row.line1.baseY % 2, "l1 取偶").toBe(0);
        expect(row.line2.baseY % 2, "l2 取偶").toBe(0);
        expect(row.line2.baseY, "l2 不越行底").toBeLessThanOrEqual(r.y + r.h);
        expect(row.line1.baseY, "l1 在行内").toBeGreaterThanOrEqual(r.y);
        // 字号档位:名字 body、描述 micro、状态 muted
        expect(row.line1.px).toBe(FS.body);
        expect(row.line2.px).toBe(FS.micro);
        expect(row.status.px).toBe(FS.muted);
        expect(row.line1.align).toBe("left");
        expect(row.line2.align).toBe("left");
        // 行内起笔与右缘内缩一律走行板 btn_minor 的九宫边距 16,装饰带里不压字
        expect(row.line1.x).toBe(r.x + DL_NAME_DX);
        expect(row.line2.x).toBe(r.x + DL_NAME_DX);
        expect(row.status.x).toBe(r.x + r.w - DL_STATUS_INSET);
        expect(DL_NAME_DX).toBe(16);
        expect(DL_STATUS_INSET).toBe(16);
      }
    });
  }
});

/* ==================== 5. 天赋右文三态:门控走"已领条数",不是行下标 ==================== */

describe("天赋右文三态(免费领取 / ▶ 广告解锁 / ✓ 已领取)", () => {
  it("一条都没领:全部行都是「免费领取」(Web 按同一个 claimedCount 逐行算,不看下标)", () => {
    const c = buildDailyContent(save({ dailyTalentClaimed: [] }), NOW);
    expect(c.talentClaimedCount).toBe(0);
    expect(DAILY_TALENT_FREE).toBeGreaterThan(0);
    expect(c.talents.map((t) => t.statusText)).toEqual(c.talents.map(() => "免费领取"));
    expect(c.talents.every((t) => !t.claimed)).toBe(true);
  });

  it("已领条数达到上限、但领的不是今日这三条:全部行都是「▶ 广告解锁」——门控是条数不是下标", () => {
    // 关键判别式:claimedCount = DAILY_TALENT_FREE 而今日行一条都没领。
    // 若门控误用行下标,第 0 行会显示「免费领取」;Web 的口径是它同样显示「▶ 广告解锁」。
    const notToday = DAILY_TALENT_POOL.filter((t) => !TALENTS.includes(t.id))
      .slice(0, DAILY_TALENT_FREE)
      .map((t) => t.id);
    expect(notToday).toHaveLength(DAILY_TALENT_FREE);
    const c = buildDailyContent(save({ dailyTalentClaimed: notToday }), NOW);
    expect(c.talentClaimedCount).toBe(DAILY_TALENT_FREE);
    expect(c.talents.every((t) => !t.claimed), "今日行都没领").toBe(true);
    expect(c.talents.map((t) => t.statusText)).toEqual(c.talents.map(() => "▶ 广告解锁"));
  });

  it("领了今日第 0 条:该行「✓ 已领取」,其余行因条数已达上限变成「▶ 广告解锁」", () => {
    const c = buildDailyContent(save({ dailyTalentClaimed: [TALENTS[0]] }), NOW);
    expect(c.talentClaimedCount).toBe(1);
    expect(c.talents[0]).toMatchObject({ id: TALENTS[0], claimed: true, statusText: "✓ 已领取" });
    for (const t of c.talents.slice(1)) {
      expect(t.claimed).toBe(false);
      expect(t.statusText).toBe("▶ 广告解锁");
    }
  });

  it("三条全领:全部「✓ 已领取」", () => {
    const c = buildDailyContent(save({ dailyTalentClaimed: [...TALENTS] }), NOW);
    expect(c.talents.map((t) => t.statusText)).toEqual(c.talents.map(() => "✓ 已领取"));
    expect(c.talents.every((t) => t.claimed)).toBe(true);
  });

  it("名字与描述取自共享层天赋表,不是本屏另抄一份", () => {
    const c = buildDailyContent(save(), NOW);
    c.talents.forEach((t, i) => {
      const def = dailyTalentOf(TALENTS[i]);
      expect(t.name).toBe(def.name);
      expect(t.desc).toBe(def.desc);
    });
  });

  it("宝箱右文两态:未领「▶ 广告开启」/ 已领「✓ 已领取」", () => {
    const c = buildDailyContent(save({ dailyBoxClaimed: [DAILY_BOXES[1].id] }), NOW);
    expect(c.boxes.map((b) => b.statusText)).toEqual(["▶ 广告开启", "✓ 已领取", "▶ 广告开启"]);
    expect(c.boxes.map((b) => b.claimed)).toEqual([false, true, false]);
    c.boxes.forEach((b, i) => {
      expect(b.name).toBe(DAILY_BOXES[i].name);
      expect(b.desc).toBe(DAILY_BOXES[i].desc);
    });
  });
});

/* ==================== 6. 补领行三态与底板档位 ==================== */

describe("补领行三态(可补领 / 已补领 / 已首通)与底板档位", () => {
  it("两者皆否 → 可补领档:state=open、右文「▶ 看广告领取」", () => {
    const c = buildDailyContent(save({ makeUpDate: OTHER_DAY, dailyClearedDate: OTHER_DAY }), NOW);
    expect(c.makeUp).toMatchObject({ state: "open", claimable: true, statusText: "▶ 看广告领取" });
    expect(c.makeUp.title).toBe("首通补领");
    expect(c.makeUp.desc).toBe("今日没空打首通 · 看广告领同口径奖励(每日 1 次)");
  });

  it("makeUpDate = 今日 → 不可补领档:state=madeUp、右文「✓ 已补领」", () => {
    const c = buildDailyContent(save({ makeUpDate: TODAY, dailyClearedDate: OTHER_DAY }), NOW);
    expect(c.makeUp).toMatchObject({ state: "madeUp", claimable: false, statusText: "✓ 已补领" });
  });

  it("dailyClearedDate = 今日 → 不可补领档:state=cleared、右文「✓ 已首通」", () => {
    const c = buildDailyContent(save({ makeUpDate: OTHER_DAY, dailyClearedDate: TODAY }), NOW);
    expect(c.makeUp).toMatchObject({ state: "cleared", claimable: false, statusText: "✓ 已首通" });
  });

  it("两者都是今日:madeUp 优先(Web 的 `if (madeUp) … else if (cleared)`)", () => {
    const c = buildDailyContent(save({ makeUpDate: TODAY, dailyClearedDate: TODAY }), NOW);
    expect(c.makeUp).toMatchObject({ state: "madeUp", claimable: false, statusText: "✓ 已补领" });
  });

  it("空字符串日期(新存档)不等于今日 → 可补领档", () => {
    const c = buildDailyContent(save({ makeUpDate: "", dailyClearedDate: "" }), NOW);
    expect(c.makeUp.claimable).toBe(true);
    expect(TODAY).not.toBe("");
  });

  it("底板档位:补领行走 btn_primary + 圆角 10,宝箱/天赋行走 btn_minor + 圆角 8", () => {
    const L = dailyScreenLayout(W, H_STD, save());
    expect(L.makeUpPlate).toEqual({ key: "btn_primary", radius: 10 });
    expect(L.rowPlate).toEqual({ key: "btn_minor", radius: 8 });
    expect(L.makeUpPlate.key).not.toBe(L.rowPlate.key);
    // 档位与屏高、天赋条数无关(恒常量)
    expect(dailyScreenLayout(W, H_TALL, save({ dailyTalents: [] })).makeUpPlate).toEqual(L.makeUpPlate);
  });

  it("补领行与三区行同形(两行文本 + 右对齐状态),只是底板档位不同", () => {
    const L = dailyScreenLayout(W, H_STD, save());
    const m = L.makeUpRow;
    expect(m.rect.w).toBe(L.boxRows[0].rect.w);
    expect(m.rect.h).toBe(L.rowH);
    expect(m.line1.baseY).toBe(evenDown(m.rect.y + m.rect.h / 2 - DL_LINE1_DY));
    expect(m.line2.baseY).toBe(m.line1.baseY + DL_LINE_SPACING);
    expect(m.status.align).toBe("right");
    expect(m.line1.x).toBe(m.rect.x + DL_NAME_DX);
    expect(m.status.x).toBe(m.rect.x + m.rect.w - DL_STATUS_INSET);
  });
});

/* ==================== 7. 命中:每行热区 = 该行矩形,返回钮独立 ==================== */

describe("命中判定(对标 Web onDailyClick 的四段顺序)", () => {
  const L = dailyScreenLayout(W, H_STD, save());
  const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it("返回钮热区独立:命中 back,且不落到任何行", () => {
    const c = buildDailyContent(save(), NOW);
    const B = L.backBtn;
    expect(B).toEqual({ x: W - PAD - UI.backW, y: DL_BACK_Y, w: UI.backW, h: DL_BACK_H });
    // 热区抬到下限:共享档 ui.backH = 34 不够一枚 44 的点击区
    expect(DL_BACK_H).toBe(Math.max(UI.touchMin, UI.backH));
    expect(Math.min(B.w, B.h)).toBeGreaterThanOrEqual(UI.touchMin);
    // 页边距与右缘基准:左缘 ≥ 16、右缘正落 544、坐标尺寸全偶
    expect(B.x).toBeGreaterThanOrEqual(PAD);
    expect(B.x + B.w).toBe(RIGHT_EDGE);
    for (const v of [B.x, B.y, B.w, B.h]) expect(v % 2).toBe(0);
    const bc = center(B);
    expect(hitDaily(L, c, B.x + 2, B.y + 2)).toEqual({ kind: "back" });
    expect(hitDaily(L, c, bc.x, bc.y)).toEqual({ kind: "back" });
    // 返回钮与首行不重叠,钮下方一行也不误判
    expect(B.y + B.h).toBeLessThan(L.boxRows[0].rect.y);
    expect(hitDaily(L, c, B.x - 1, B.y + B.h / 2)).toBe(null);
    expect(hitDaily(L, c, B.x + B.w / 2, B.y + B.h + 1)).toBe(null);
  });

  it("每个宝箱行热区 = 该行矩形,产 claimBox + 该行 id", () => {
    const c = buildDailyContent(save(), NOW);
    L.boxRows.forEach((row) => {
      const p = center(row.rect);
      expect(hitDaily(L, c, p.x, p.y)).toEqual({ kind: "claimBox", id: row.id });
      // 四角内缩一点仍在热区里
      expect(hitDaily(L, c, row.rect.x + 1, row.rect.y + 1)).toEqual({ kind: "claimBox", id: row.id });
      expect(hitDaily(L, c, row.rect.x + row.rect.w - 1, row.rect.y + row.rect.h - 1)).toEqual({ kind: "claimBox", id: row.id });
    });
  });

  it("每个天赋行热区 = 该行矩形,产 claimTalent + 该行 id + 免费档标记", () => {
    const free = buildDailyContent(save({ dailyTalentClaimed: [] }), NOW);
    L.talentRows.forEach((row) => {
      const p = center(row.rect);
      expect(hitDaily(L, free, p.x, p.y)).toEqual({ kind: "claimTalent", id: row.id, free: true });
    });
    // 已领条数达上限 → free 翻 false(门控仍是条数)
    const paid = buildDailyContent(save({ dailyTalentClaimed: [DAILY_TALENT_POOL[DAILY_TALENT_COUNT].id] }), NOW);
    expect(paid.talentClaimedCount).toBe(DAILY_TALENT_FREE);
    L.talentRows.forEach((row) => {
      const p = center(row.rect);
      expect(hitDaily(L, paid, p.x, p.y)).toEqual({ kind: "claimTalent", id: row.id, free: false });
    });
  });

  it("点补领行不落到天赋行(补领行在天赋区之后,热区互斥)", () => {
    const c = buildDailyContent(save(), NOW);
    const m = L.makeUpRow.rect;
    const lastTalent = L.talentRows[L.talentRows.length - 1].rect;
    expect(m.y).toBeGreaterThan(lastTalent.y + lastTalent.h);
    const mc = center(m);
    expect(hitDaily(L, c, mc.x, mc.y)).toEqual({ kind: "claimMakeUp" });
    expect(hitDaily(L, c, m.x + 1, m.y + 1)).toEqual({ kind: "claimMakeUp" });
    expect(hitDaily(L, c, m.x + m.w - 1, m.y + m.h - 1)).toEqual({ kind: "claimMakeUp" });
    // 天赋末行底边那一点仍是天赋行
    expect(hitDaily(L, c, lastTalent.x + 20, lastTalent.y + lastTalent.h - 1)).toEqual({ kind: "claimTalent", id: L.talentRows[L.talentRows.length - 1].id, free: true });
  });

  it("不可补领时点补领行不产动作(与 Web 在那里直接 return 同语义)", () => {
    const made = buildDailyContent(save({ makeUpDate: TODAY }), NOW);
    const cleared = buildDailyContent(save({ dailyClearedDate: TODAY }), NOW);
    const p = center(L.makeUpRow.rect);
    expect(hitDaily(L, made, p.x, p.y)).toBe(null);
    expect(hitDaily(L, cleared, p.x, p.y)).toBe(null);
  });

  it("已领取的行点了不产动作(宝箱与天赋同口径)", () => {
    const c = buildDailyContent(save({ dailyBoxClaimed: [DAILY_BOXES[0].id], dailyTalentClaimed: [TALENTS[1]] }), NOW);
    const b0 = center(L.boxRows[0].rect);
    expect(hitDaily(L, c, b0.x, b0.y)).toBe(null);
    const t1 = center(L.talentRows[1].rect);
    expect(hitDaily(L, c, t1.x, t1.y)).toBe(null);
    // 同区其余行照常可点
    const b1 = center(L.boxRows[1].rect);
    expect(hitDaily(L, c, b1.x, b1.y)).toEqual({ kind: "claimBox", id: DAILY_BOXES[1].id });
  });

  it("行间空隙、两组标签带与屏中央空白都不产动作", () => {
    const c = buildDailyContent(save(), NOW);
    const gapY = (L.boxRows[0].rect.y + L.boxRows[0].rect.h + L.boxRows[1].rect.y) / 2;
    if (L.gap > 0) expect(hitDaily(L, c, W / 2, gapY)).toBe(null);
    expect(hitDaily(L, c, PAD + 4, L.boxLabelY)).toBe(null);
    expect(hitDaily(L, c, PAD + 4, L.talentLabelY)).toBe(null);
    expect(hitDaily(L, c, PAD - 4, H_STD / 2)).toBe(null);
    expect(hitDaily(L, c, W - PAD + 4, H_STD / 2)).toBe(null);
    expect(hitDaily(L, c, W / 2, L.makeUpRow.rect.y + L.makeUpRow.rect.h + 4)).toBe(null);
  });
});

/* ==================== 8. 模型纯度:不写存档,写入意图以返回值给出 ==================== */

/** 递归冻结 + JSON 快照:任何一次就地修改都会在断言里显形 */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe("模型纯度(存档只读,写入意图是返回值)", () => {
  it("buildDailyContent / hitDaily / dailyClaim 都不改传入的存档(冻结对象 + 快照双证)", () => {
    const s = deepFreeze(save({ diamond: 12, adWatchCount: 3, dailyBoxClaimed: [DAILY_BOXES[0].id] }));
    const before = JSON.stringify(s);
    const L = dailyScreenLayout(W, H_STD, s);
    const c = buildDailyContent(s, NOW);
    const acts: DailyAction[] = [
      { kind: "back" },
      { kind: "claimBox", id: DAILY_BOXES[1].id },
      { kind: "claimTalent", id: TALENTS[0], free: false },
      { kind: "claimMakeUp" },
    ];
    for (const a of acts) {
      const p = { x: W / 2, y: H_STD / 2 };
      hitDaily(L, c, p.x, p.y);
      dailyClaim(s, a, NOW);
    }
    // 每一行热区都点一遍,顺带覆盖 hit 的全部分支
    for (const row of allRows(L)) {
      hitDaily(L, c, row.rect.x + row.rect.w / 2, row.rect.y + row.rect.h / 2);
    }
    hitDaily(L, c, L.backBtn.x + 2, L.backBtn.y + 2);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("宝箱意图 = 共享层宝箱表的三项产出 + 追加 id,且必须看完广告", () => {
    const s = save();
    for (const box of DAILY_BOXES) {
      const claim = dailyClaim(s, { kind: "claimBox", id: box.id }, NOW)!;
      expect(claim, box.id).not.toBe(null);
      expect(claim.needsAd).toBe(true);
      expect(claim.gachaTicket).toBe(box.tickets);
      expect(claim.stardust).toBe(box.stardust);
      expect(claim.diamond).toBe(box.diamond);
      expect(claim.points).toBe(0);
      expect(claim.dayEcho).toBe(0);
      expect(claim.boxClaim).toBe(box.id);
      expect(claim.talentClaim).toBe(null);
      expect(claim.makeUp).toBe(null);
      expect(dailyBoxOf(box.id)).toBe(box);
    }
  });

  it("天赋意图 = 只追加 id、零产出;免费档不看广告,超出免费档才看广告", () => {
    const free = dailyClaim(save({ dailyTalentClaimed: [] }), { kind: "claimTalent", id: TALENTS[0], free: true }, NOW)!;
    expect(free.needsAd).toBe(false);
    expect(free.talentClaim).toBe(TALENTS[0]);
    expect([free.gachaTicket, free.stardust, free.diamond, free.points, free.dayEcho]).toEqual([0, 0, 0, 0, 0]);
    expect(free.boxClaim).toBe(null);
    expect(free.makeUp).toBe(null);

    const paid = dailyClaim(save({ dailyTalentClaimed: [TALENTS[0]] }), { kind: "claimTalent", id: TALENTS[1], free: false }, NOW)!;
    expect(paid.needsAd).toBe(true);
    expect(paid.talentClaim).toBe(TALENTS[1]);
  });

  it("补领意图 = makeUpReward 的券 + splitEcho 拆开的回响 + 当日首通标记三件一起写", () => {
    for (const highestStage of [1, 3, 7]) {
      const s = save({ highestStage, makeUpDate: OTHER_DAY, dailyClearedDate: OTHER_DAY });
      const claim = dailyClaim(s, { kind: "claimMakeUp" }, NOW)!;
      const rw = makeUpReward(highestStage);
      const { permanent, day } = splitEcho(rw.echo);
      expect(claim.needsAd, `关${highestStage}`).toBe(true);
      expect(claim.gachaTicket).toBe(rw.tickets);
      expect(claim.points).toBe(permanent);
      expect(claim.dayEcho).toBe(day);
      expect(claim.stardust).toBe(0);
      expect(claim.diamond).toBe(0);
      expect(claim.boxClaim).toBe(null);
      expect(claim.talentClaim).toBe(null);
      expect(claim.makeUp).toEqual({ date: TODAY, stageId: rw.stageId });
      expect(permanent + day).toBe(rw.echo);
    }
  });

  it("已领取 / 不可补领的意图是 null(壳层据此什么都不做)", () => {
    expect(dailyClaim(save(), { kind: "back" }, NOW)).toBe(null);
    expect(dailyClaim(save({ dailyBoxClaimed: [DAILY_BOXES[2].id] }), { kind: "claimBox", id: DAILY_BOXES[2].id }, NOW)).toBe(null);
    expect(dailyClaim(save({ dailyTalentClaimed: [TALENTS[0]] }), { kind: "claimTalent", id: TALENTS[0], free: false }, NOW)).toBe(null);
    expect(dailyClaim(save({ makeUpDate: TODAY }), { kind: "claimMakeUp" }, NOW)).toBe(null);
    expect(dailyClaim(save({ dailyClearedDate: TODAY }), { kind: "claimMakeUp" }, NOW)).toBe(null);
  });

  it("屏级文案:标题 / 两组标签 / 资源行 / 返回钮逐项对上 Web drawDaily 的字面量", () => {
    const c = buildDailyContent(save({ diamond: 42, adWatchCount: 7 }), NOW);
    expect(c.title).toBe("每日福利(广告驱动)");
    expect(c.boxLabel).toBe("每日宝箱(各看广告开启)");
    expect(c.talentLabel).toBe("每日天赋(数值墙工具 · 当日有效)");
    expect(c.resText).toBe("钻石 42 · 今日广告 7 次");
    expect(c.backText).toBe("返回");
  });
});

/* ==================== 8.5 头部与屏底板几何(像素栅格:页边距 16 / 内容宽 528 / 坐标全偶) ==================== */

type Box = { x: number; y: number; w: number; h: number };

describe("头部与屏底板几何(art 网格)", () => {
  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:屏底板就是九宫格内缩区 [16, evenDown(h) − 16],贴图键与已落地各屏同一张`, () => {
      const L = dailyScreenLayout(W, h, save());
      expect(L.panel).toEqual({ x: PAD, y: PAD, w: CONTENT_W, h: evenDown(h) - PAD * 2 });
      expect(L.panelKey).toBe(DL_PANEL_KEY);
      expect(L.panel.x + L.panel.w).toBe(RIGHT_EDGE);
      expect(L.panel.y + L.panel.h).toBe(evenDown(h) - PAD);
    });

    it(`h=${h}:标题横幅取 banner_title_gold_c 固有 122×21 的 2 倍,左缘落页边距、标题在带内`, () => {
      const L = dailyScreenLayout(W, h, save());
      expect(L.headerPlate).toEqual({ x: DL_BANNER_X, y: DL_BANNER_Y, w: DL_BANNER_W, h: DL_BANNER_H });
      expect([DL_BANNER_W, DL_BANNER_H]).toEqual([244, 42]);
      expect(L.headerPlate.x).toBe(PAD);
      expect(L.headerPlate.y).toBe(DL_TOP_Y);
      expect(L.headerPlate.x + L.headerPlate.w).toBeLessThanOrEqual(RIGHT_EDGE);
      // 标题在带内:居中锚点就是带心,基线落在带的上下缘之间
      expect(L.titleOnBanner.x).toBe(evenDown(L.headerPlate.x + DL_BANNER_W / 2));
      expect(L.titleOnBanner.baseY).toBeGreaterThan(L.headerPlate.y);
      expect(L.titleOnBanner.baseY).toBeLessThan(L.headerPlate.y + DL_BANNER_H);
      expect(L.titleOnBanner.align).toBe("center");
      // 缺图那一档:左起笔于页边距、同一基线、限宽收到返回钮左缘之前
      expect(L.titleBare.x).toBe(PAD);
      expect(L.titleBare.baseY).toBe(L.titleOnBanner.baseY);
      expect(L.titleBare.align).toBe("left");
      expect(L.titleBare.x + L.titleBare.maxW + DL_TEXT_SLACK).toBeLessThanOrEqual(L.backBtn.x);
    });

    it(`h=${h}:装饰立绘让开横幅右缘、资源行只剩字形 + 文本一档,两件都不越右缘`, () => {
      const L = dailyScreenLayout(W, h, save());
      expect(L.deco).toEqual({ x: DL_BANNER_X + DL_BANNER_W + DL_DECO_GAP, y: DL_TOP_Y, w: DL_DECO_W, h: DL_DECO_H });
      expect(L.deco.x).toBeGreaterThanOrEqual(L.headerPlate.x + L.headerPlate.w);
      expect(L.deco.x + L.deco.w).toBeLessThanOrEqual(L.backBtn.x);
      // 钻石图标退役:资源行回到「替代字形 + 文本」一档,起笔于页边距、限宽吃满内容宽
      expect(L.resText.x).toBe(PAD);
      expect(L.resText.baseY).toBe(DL_RES_BASE_Y);
      expect(L.resText.maxW).toBe(CONTENT_W);
      expect(L.resText.align).toBe("left");
      expect(L.resText.x + L.resText.maxW).toBeLessThanOrEqual(RIGHT_EDGE);
      // 立绘底边压在资源行文本带顶缘之上,两件不抢同一条带
      expect(L.deco.y + L.deco.h).toBeLessThanOrEqual(bandOf(lineReq("资源行", L.resText)).y);
    });

    it(`h=${h}:全部矩形坐标尺寸取偶、左缘 ≥16、右缘 ≤544,非底板件两两不相交`, () => {
      const L = dailyScreenLayout(W, h, save());
      const boxes: [string, Box][] = [
        ["屏底板", L.panel],
        ["标题横幅", L.headerPlate],
        ["装饰立绘", L.deco],
        ["返回钮", L.backBtn],
        ...L.boxRows.map((r, i) => [`宝箱${i}`, r.rect] as [string, Box]),
        ...L.talentRows.map((r, i) => [`天赋${i}`, r.rect] as [string, Box]),
        ["补领行", L.makeUpRow.rect],
      ];
      for (const [tag, r] of boxes) {
        expect(r.x % 2, `${tag} x 取偶`).toBe(0);
        expect(r.y % 2, `${tag} y 取偶`).toBe(0);
        expect(r.w % 2, `${tag} w 取偶`).toBe(0);
        expect(r.h % 2, `${tag} h 取偶`).toBe(0);
        expect(r.x, `${tag} 左缘`).toBeGreaterThanOrEqual(PAD);
        expect(r.x + r.w, `${tag} 右缘`).toBeLessThanOrEqual(RIGHT_EDGE);
        expect(r.y, `${tag} 顶缘`).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h, `${tag} 底缘`).toBeLessThanOrEqual(evenDown(h));
      }
      // 屏底板是容器(其余件都画在它上面),两两不相交只比内容件
      const inner = boxes.filter(([tag]) => tag !== "屏底板");
      for (let i = 0; i < inner.length; i++) {
        for (let j = i + 1; j < inner.length; j++) {
          const a = inner[i][1];
          const b = inner[j][1];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ox > 0 && oy > 0, `${inner[i][0]} × ${inner[j][0]} 不相交`).toBe(false);
        }
      }
    });
  }

  it("源码闸:本屏布局与视图都不再读 Web 冻结档 ui.pad,页边距只有 DL_PAD 一个事实源", () => {
    /** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
    const codeOf = (rel: string): string =>
      readFileSync(new URL(rel, import.meta.url), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const layout = codeOf("../cocos/assets/scripts/game/ui/dailyLayout.ts");
    const view = codeOf("../cocos/assets/scripts/daily/DailyView.ts");
    expect(layout.includes("ui.pad")).toBe(false);
    expect(view.includes("ui.pad")).toBe(false);
    expect(view.includes("game/ui/theme")).toBe(false);
    // 视图不产几何:屏底板矩形与贴图键都问布局模块
    expect(view.includes("this.panel.show(L.panelKey, L.panel")).toBe(true);
    expect(DL_PAD).toBe(16);
  });
});

/* ==================== 9. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

/** 共享层新文件由 tests/shared-purity.test.ts 自动覆盖(game/** 递归);这里显式复核并补宿主 cc-free 模型 */
const PURE_FILES = [
  "../cocos/assets/scripts/game/ui/dailyLayout.ts",
  "../cocos/assets/scripts/daily/DailyModel.ts",
];

describe("纯布局与宿主模型 cc-free", () => {
  for (const rel of PURE_FILES) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    it(`${rel.split("/").pop()}:无 cc / 无 Canvas2D / 无 DOM 全局 / 无 @game 别名`, () => {
      expect(CC_IMPORT.test(src), "不得 import cc").toBe(false);
      expect(CTX_TYPE.test(src), "不得用 CanvasRenderingContext2D").toBe(false);
      expect(DOM_GLOBAL.test(src), "不得用 DOM/宿主全局").toBe(false);
      // 共享层与宿主模型内部一律相对路径 import,别名只在 Web 侧有效
      expect(ABSOLUTE_GAME.test(src), "内部不得用 @game/ 别名").toBe(false);
    });
  }
});
