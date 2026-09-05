/**
 * Phase 4 首屏闸门:幻影榜(排行屏)。
 *
 * 延续 cocos-phase3 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `leaderboard/LeaderboardModel.ts` 经相对路径 import 的
 *     共享层,与 Web 侧经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),
 *     于是名次/插位/几何不可能出现"两份抄本";
 *  2. **几何与计数钉死**:行数 / 玩家行插位 / 行矩形 / 文本带右界,全部给固定输入断言固定输出;
 *  3. **视图无关**:本文件只吃 cc-free 的 `LeaderboardModel.ts` 与共享层纯布局,不需要引擎与浏览器。
 *
 * 覆盖派单要求的六条:行数、玩家行插位、两档屏高行矩形、每条文本带落 0..560、
 * 徽标门控(frames 非空 + top = max)、纯布局 cc-free 守卫。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { PHANTOM_COUNT, phantomBoard, rankAmong } from "@game/data/leaderboard";
import { seasonScore } from "@game/data/season";
import { frameQualityForStage } from "@game/data/quality";
import { fs as FS, ui as UI } from "@game/ui/theme";
import * as sharedLb from "@game/data/leaderboard";
import { leaderboardLayout, LB_BADGE_BOX, LB_ROWS_TOP, LB_ROW_MIN_H, LB_ROW_MAX_H } from "@game/ui/leaderboardLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import { buildLeaderboardContent, hitLeaderboard, leaderboardScreenLayout, type LeaderboardSaveView } from "../cocos/assets/scripts/leaderboard/LeaderboardModel";
import * as cocosLb from "../cocos/assets/scripts/game/data/leaderboard";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = UI.pad;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/** 存档切片构造器:seasonScore = Σ(星数×10,只数 >0)+ seasonBest */
function save(over: Partial<LeaderboardSaveView> = {}): LeaderboardSaveView {
  return { seasonId: 1, stageStars: [0, 0, 0, 0, 0, 0, 0, 0], seasonBest: 0, frames: [], ...over };
}

/* ==================== 0. 端间同一实现(R1/R9 纪律延续到 Phase 4) ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/data/leaderboard 与 @game 解析到同一批函数引用(不是两份抄本)", () => {
    for (const fn of ["phantomBoard", "rankAmong"] as const) {
      expect(cocosLb[fn], fn).toBe(sharedLb[fn]);
    }
    expect(cocosLb.PHANTOM_COUNT).toBe(PHANTOM_COUNT);
  });

  it("leaderboardScreenLayout 就是 leaderboardLayout(rowCount = PHANTOM_COUNT + 1)那一份", () => {
    const a = leaderboardScreenLayout(W, H_STD);
    const b = leaderboardLayout(W, H_STD, PHANTOM_COUNT + 1);
    expect(a).toEqual(b);
    expect(a.rowCount).toBe(PHANTOM_COUNT + 1);
  });
});

/* ==================== 1. 行数 = PHANTOM_COUNT + 1(S1..S4 各赛季) ==================== */

describe("行数恒定(10 幽灵 + 玩家行)", () => {
  it("content.rows 与 layout.rows 都 = PHANTOM_COUNT + 1,四季恒成立", () => {
    for (const seasonId of [1, 2, 3, 4]) {
      const c = buildLeaderboardContent(save({ seasonId }));
      expect(c.rows, `S${seasonId} content`).toHaveLength(PHANTOM_COUNT + 1);
      expect(phantomBoard(seasonId), `S${seasonId} board`).toHaveLength(PHANTOM_COUNT);
      for (const h of [H_STD, H_TALL]) {
        expect(leaderboardScreenLayout(W, h).rows, `S${seasonId} h=${h} layout`).toHaveLength(PHANTOM_COUNT + 1);
      }
    }
  });

  it("标题随赛季主题走,副标题恒定", () => {
    expect(buildLeaderboardContent(save({ seasonId: 1 })).title).toMatch(/^幻影榜 · S1「.+」$/);
    expect(buildLeaderboardContent(save({ seasonId: 3 })).title).toMatch(/^幻影榜 · S3「.+」$/);
    expect(buildLeaderboardContent(save()).sub).toBe("本地幻影 · 非联网数据 · 后端就绪后接入真榜");
  });
});

/* ==================== 2. 玩家行插位 = rankAmong − 1;幽灵不重不漏 ==================== */

/** 断言:恰好一行 isPlayer 且落在 wantIndex,其余行把 board 的 10 个名次各覆盖一次 */
function expectInsertion(s: LeaderboardSaveView): void {
  const board = phantomBoard(s.seasonId);
  const myScore = seasonScore(s.stageStars, s.seasonBest);
  const myRank = rankAmong(myScore, board);
  const c = buildLeaderboardContent(s);
  expect(c.myRank).toBe(myRank);
  expect(c.myScore).toBe(myScore);

  const playerIdx = c.rows.map((r) => r.isPlayer).indexOf(true);
  expect(playerIdx, `插位索引 score=${myScore}`).toBe(myRank - 1);
  expect(c.rows.filter((r) => r.isPlayer)).toHaveLength(1);

  // 玩家行:名次/文案/分数
  const me = c.rows[playerIdx];
  expect(me.rank).toBe(myRank);
  expect(me.rankText).toBe(`No.${myRank}`);
  expect(me.nameText).toBe("你");
  expect(me.scoreText).toBe(`${myScore} 分`);
  expect(me.ghost).toBe(null);

  // 幽灵行:每个 board 名次恰好出现一次,不重不漏
  const ghostRanks = c.rows.filter((r) => !r.isPlayer).map((r) => r.ghost!.rank);
  expect(ghostRanks.slice().sort((a, b) => a - b)).toEqual(board.map((e) => e.rank));
  expect(new Set(ghostRanks).size).toBe(PHANTOM_COUNT);
  // 幽灵行文案与分数逐项对上 board
  for (const r of c.rows.filter((x) => !x.isPlayer)) {
    expect(r.rankText).toBe(`No.${r.ghost!.rank}`);
    expect(r.nameText).toBe(`幻影 ${r.ghost!.rank}`);
    expect(r.scoreText).toBe(`${r.ghost!.score} 分`);
    expect(r.badge).toBe(null); // 徽标只在玩家行
  }
}

describe("玩家行插位(对标 Web drawLeaderboard 的循环插位)", () => {
  it("score=0(全 0 星)未入榜 → 玩家行落在末尾(index = PHANTOM_COUNT)", () => {
    const s = save({ stageStars: [0, 0, 0, 0, 0, 0, 0, 0], seasonBest: 0 });
    expect(seasonScore(s.stageStars, s.seasonBest)).toBe(0);
    expect(rankAmong(0, phantomBoard(1))).toBe(PHANTOM_COUNT + 1);
    expectInsertion(s);
  });

  it("score=1(新手 1 星首通档以下)仍未入榜", () => {
    const s = save({ seasonBest: 1 });
    expect(seasonScore(s.stageStars, s.seasonBest)).toBe(1);
    expectInsertion(s);
  });

  it("极大值(99999)登顶 → 玩家行落在 index 0", () => {
    const s = save({ seasonBest: 99999 });
    expect(rankAmong(seasonScore(s.stageStars, s.seasonBest), phantomBoard(1))).toBe(1);
    expectInsertion(s);
  });

  it("与某幽灵同分:并列名次口径(共享该名次),插位仍 = rankAmong − 1", () => {
    const board = phantomBoard(1);
    for (const e of [board[0], board[4], board[PHANTOM_COUNT - 1]]) {
      const s = save({ seasonBest: e.score });
      expect(seasonScore(s.stageStars, s.seasonBest)).toBe(e.score);
      expect(rankAmong(e.score, board)).toBe(e.rank);
      expectInsertion(s);
    }
  });

  it("略高于末位:恰好超过第 10 名一档 → rank = PHANTOM_COUNT", () => {
    const board = phantomBoard(1);
    const last = board[PHANTOM_COUNT - 1].score;
    const s = save({ seasonBest: last + 1 });
    expect(rankAmong(last + 1, board)).toBe(PHANTOM_COUNT);
    expectInsertion(s);
  });

  it("中段分数(星数 + 无限关)落在榜中,插位与 rankAmong 同数(四季扫描)", () => {
    for (const seasonId of [1, 2, 3, 4]) {
      const s = save({ seasonId, stageStars: [0, 3, 2, 1, 0, 0, 0, 0], seasonBest: 40 });
      expectInsertion(s);
    }
  });
});

/* ==================== 3. 行矩形:两档屏高不重叠 / 不越横界 / 不越底缘 ==================== */

describe("行矩形几何(996 与 1246 两档屏高)", () => {
  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:11 行两两不重叠、恒在 0..560 内、末行底边 ≤ h − pad`, () => {
      const L = leaderboardScreenLayout(W, h);
      expect(L.rows).toHaveLength(PHANTOM_COUNT + 1);
      expect(L.rowH).toBeGreaterThanOrEqual(LB_ROW_MIN_H);
      expect(L.rowH).toBeLessThanOrEqual(LB_ROW_MAX_H);
      const bottomLimit = h - PAD;
      for (let i = 0; i < L.rows.length; i++) {
        const r = L.rows[i].rect;
        // 横向:左沿 = pad,右沿 = w − pad,恒在 0..560 内
        expect(r.x, `行${i} 左沿`).toBe(PAD);
        expect(r.w, `行${i} 宽`).toBe(W - PAD * 2);
        expect(r.x + r.w, `行${i} 右沿`).toBeLessThanOrEqual(W);
        expect(r.x, `行${i} 左界`).toBeGreaterThanOrEqual(0);
        // 纵向:顶缘从 LB_ROWS_TOP 起,按 rowH + gap 递推
        expect(r.y, `行${i} 顶缘`).toBe(LB_ROWS_TOP + i * (L.rowH + L.gap));
        expect(r.h, `行${i} 高`).toBe(L.rowH);
        // 不重叠:后一行顶缘 ≥ 前一行底缘(有 gap 时严格大于)
        if (i > 0) {
          const prev = L.rows[i - 1].rect;
          expect(r.y, `行${i} 不重叠`).toBeGreaterThanOrEqual(prev.y + prev.h);
        }
      }
      // 末行底边不越过 h − pad
      const last = L.rows[L.rows.length - 1].rect;
      expect(last.y + last.h, "末行底边").toBeLessThanOrEqual(bottomLimit);
      expect(L.gap).toBeGreaterThanOrEqual(0);
    });
  }

  it("屏高变大只把富余摊进 gap(≤20),行高钳在 44..72 不被拉伸", () => {
    const a = leaderboardScreenLayout(W, H_STD);
    const b = leaderboardScreenLayout(W, H_TALL);
    expect(a.rowH).toBe(b.rowH); // 两档都够高 → 行高都取上限 72
    expect(b.gap).toBeGreaterThanOrEqual(a.gap); // 多出的高度进间距
    expect(b.gap).toBeLessThanOrEqual(20);
  });
});

/* ==================== 4. 每条文本带落在 0..560(右对齐那段尤其) ==================== */

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

/** 逐条对应 LeaderboardView.sync 里的 Txt.set 调用(几何来自 leaderboardLayout) */
function textBands(h: number): TextRequest[] {
  const L = leaderboardScreenLayout(W, h);
  const out: TextRequest[] = [
    { at: "标题", x: L.title.x, baseY: L.title.baseY, maxW: L.title.maxW, px: L.title.px, align: L.title.align },
    { at: "副标题", x: L.sub.x, baseY: L.sub.baseY, maxW: L.sub.maxW, px: L.sub.px, align: L.sub.align },
    { at: "返回钮", x: L.backText.x, baseY: L.backText.baseY, maxW: L.backText.maxW, px: L.backText.px, align: L.backText.align },
  ];
  for (const [i, row] of L.rows.entries()) {
    out.push(
      { at: `行${i}名次`, x: row.rank.x, baseY: row.rank.baseY, maxW: row.rank.maxW, px: row.rank.px, align: row.rank.align },
      { at: `行${i}名字`, x: row.name.x, baseY: row.name.baseY, maxW: row.name.maxW, px: row.name.px, align: row.name.align },
      // 右对齐那段(上次翻车的地方):末笔锚点在 w − pad − 10
      { at: `行${i}分数`, x: row.score.x, baseY: row.score.baseY, maxW: row.score.maxW, px: row.score.px, align: row.score.align },
      { at: `行${i}徽标数`, x: row.badge.x + row.badge.w / 2, baseY: row.badge.y + row.badge.h / 2 + 4, maxW: row.badge.w, px: FS.micro, align: "center" }
    );
  }
  return out;
}

describe("文本带右界(leaderboardLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    expect([alignAx("left"), alignAx("center"), alignAx("right")]).toEqual([0, 0.5, 1]);
    const b = (align: TextAlign) => anchorBand(300, 58, 160, FS.micro, align, LIFT);
    expect(b("left").x).toBe(300);
    expect(b("center").x + b("center").w / 2).toBe(300);
    expect(b("right").x + b("right").w).toBe(300);
  });

  it("两档屏高 × 全 11 行:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      const bands = textBands(h);
      // 3 屏级 + 11 行 × 4 段 = 47 条
      expect(bands.length).toBe(3 + (PHANTOM_COUNT + 1) * 4);
      expectInsideScreen(bands);
    }
  });

  it("右对齐分数带末笔贴 w − pad − 10,不越右界(逐行)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = leaderboardScreenLayout(W, h);
      for (const row of L.rows) {
        const band = bandOf({ at: "分数", x: row.score.x, baseY: row.score.baseY, maxW: row.score.maxW, px: row.score.px, align: "right" });
        expect(row.score.x).toBe(W - PAD - 10);
        expect(band.x + band.w).toBe(row.score.x); // 末笔 = 右界锚点
        expect(band.x + band.w).toBeLessThanOrEqual(W);
        expect(band.x).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/* ==================== 5. 徽标门控:仅 frames 非空 + top = max ==================== */

describe("关卡框徽标门控(对标 Web drawAvatarFrame)", () => {
  it("frames 为空 → 所有行都无徽标", () => {
    const c = buildLeaderboardContent(save({ frames: [], seasonBest: 99999 }));
    expect(c.rows.every((r) => r.badge === null)).toBe(true);
  });

  it("frames 非空 → 仅玩家行有徽标,top = Math.max(...frames),贴图键 = avatar_<品质>", () => {
    const frames = [2, 5, 3];
    const top = Math.max(...frames);
    const c = buildLeaderboardContent(save({ frames, seasonBest: 99999 }));
    const badges = c.rows.filter((r) => r.badge !== null);
    expect(badges).toHaveLength(1);
    const me = badges[0];
    expect(me.isPlayer).toBe(true);
    expect(me.badge!.text).toBe(String(top));
    expect(me.badge!.textureKey).toBe(`avatar_${frameQualityForStage(top)}`);
  });

  it("徽标品质随 top 走(1→common,3→rare,5→epic,6→legendary,7→hidden)", () => {
    for (const [top, quality] of [
      [1, "common"],
      [3, "rare"],
      [5, "epic"],
      [6, "legendary"],
      [7, "hidden"],
    ] as const) {
      const c = buildLeaderboardContent(save({ frames: [top], seasonBest: 99999 }));
      const me = c.rows.find((r) => r.isPlayer)!;
      expect(me.badge!.textureKey, `top=${top}`).toBe(`avatar_${quality}`);
      expect(me.badge!.text).toBe(String(top));
    }
  });

  it("徽标盒几何恒定(圆心 pad+118 / 行中心,边长 24),与显示与否无关", () => {
    const L = leaderboardScreenLayout(W, H_STD);
    for (const row of L.rows) {
      const r = row.rect;
      expect(row.badge.w).toBe(LB_BADGE_BOX);
      expect(row.badge.h).toBe(LB_BADGE_BOX);
      expect(row.badge.x + row.badge.w / 2).toBe(r.x + 118);
      expect(row.badge.y + row.badge.h / 2).toBe(r.y + r.h / 2);
    }
  });
});

/* ==================== 6. 命中判定:纯只读屏只有返回钮一个热区 ==================== */

describe("命中判定(对标 Web onLeaderboardClick → hitPanelBack)", () => {
  it("返回钮内命中 back,其余(行/标题/空白)一律 null", () => {
    const L = leaderboardScreenLayout(W, H_STD);
    const B = L.backBtn;
    expect(hitLeaderboard(L, B.x + 2, B.y + 2)).toEqual({ kind: "back" });
    expect(hitLeaderboard(L, B.x + B.w / 2, B.y + B.h / 2)).toEqual({ kind: "back" });
    // 行、标题、屏中央都不产动作
    expect(hitLeaderboard(L, L.rows[0].rect.x + 40, L.rows[0].rect.y + 10)).toBe(null);
    expect(hitLeaderboard(L, UI.pad + 4, L.title.baseY)).toBe(null);
    expect(hitLeaderboard(L, W / 2, H_STD / 2)).toBe(null);
    // 返回钮右/下缘外一点
    expect(hitLeaderboard(L, B.x - 1, B.y + B.h / 2)).toBe(null);
    expect(hitLeaderboard(L, B.x + B.w / 2, B.y + B.h + 1)).toBe(null);
  });

  it("返回钮矩形与 Web skinButtonBase 同几何(w − pad − backW, 22, backW, backH)", () => {
    const L = leaderboardScreenLayout(W, H_STD);
    expect(L.backBtn).toEqual({ x: W - PAD - UI.backW, y: 22, w: UI.backW, h: UI.backH });
  });
});

/* ==================== 7. 纯布局 cc-free 守卫(补 shared-purity 未覆盖的宿主模型) ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

/** 共享层新文件由 tests/shared-purity.test.ts 自动覆盖(game/** 递归);这里显式复核并补宿主 cc-free 模型 */
const PURE_FILES = [
  "../cocos/assets/scripts/game/ui/leaderboardLayout.ts",
  "../cocos/assets/scripts/leaderboard/LeaderboardModel.ts",
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
