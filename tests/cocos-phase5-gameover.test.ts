/**
 * Phase 5 结算屏闸门:死亡结算屏（阵亡 —— 三出口 + 两处广告位，阵亡即弹）。
 *
 * 延续 cocos-phase4-* 的三条纪律：
 *  1. **端间同一实现**：Cocos 宿主侧 `gameover/GameOverModel.ts` 经相对路径 import 的共享层
 *     （`game/data/stages` 的 `splitEcho`、`game/data/daily` 的 `dailyTalentOf`、
 *     `game/ui/gameOverLayout`）与 Web 侧经 `@game` 别名 import 的是同一个模块实例（函数引用
 *     `toBe` 相同），于是「40% 永久 / 60% 本日」「复活上限 = 1 + 不屈 value」这两条规则
 *     不可能出现两份抄本；
 *  2. **断言按门控变量分档**：几何只吃 `h` 与两个形态位；文案只吃「本局读数 + 存档三字段」；
 *     写入意图只吃「本局回响 + 是否已领」—— 没有随机源，也没有 `Date.now()`，
 *     所以八格形态矩阵与每一行文案都是可复现的；
 *  3. **视图无关**：本文件只吃 cc-free 的 `GameOverModel.ts` 与共享层纯布局；`GameOverView.ts`
 *     与 `GameShell.ts` / `ViewTable.ts` 那三侧 import 了 `cc`，node 不能直载，故只读源码文本。
 *
 * 本屏的几何重点是**两族锚线**：`anchorY = h × 0.3` 一族（横幅 / 立绘 / 五行读数 / 复活钮 /
 * 三钮行 / 名次提示，共十处）与 `dbl.y = h − 116` 一族（贴底双倍钮）。于是矩阵锁两条不变量：
 *  - **两个形态位都不改变任何矩形**（Web 的 `reviveBtn` 收起时是「整棵不起」而不是「往上提」，
 *    `doubleBtn` 更是无条件赋值）；
 *  - 两档设计高之间**锚线族整体平移 `Δh × 0.3`（250 → 75px）、贴底族整体平移 `Δh`（250px）**，
 *    两族之间的空档一起伸缩，没有任何随屏高摊开的行区（本屏一次都不调 `spreadRows`）。
 *
 * 另锁本屏照抄的 Web 口径（只列不改）：广告双倍是「把同一笔回响再结一次」（不清 `pendingSettle`、
 * 不改 `pointsEarnedThisRun`）、「星尘 +…」那一行在本屏是死代码、三处钮内文字基线是裸偏移
 * （`+21 / +28 / +22`，同档实参下 `rowTextY` 会给 `+21 / +29 / +22` 中的 `+29` 那一档）、
 * 复活钮文字比钮本身宽（Web 不限宽、压出钮缘）、五个热区严格先后、`天赋` 出口的键盘分支
 * 少了那句 `settlePendingRun`。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层（Web 与 Cocos 共用的单一事实源） ---------- */
import { ECHO_RETAIN_RATE, splitEcho } from "@game/data/stages";
import { DAILY_TALENT_POOL, dailyTalentOf } from "@game/data/daily";
import { fs as FS, rowTextY, theme } from "@game/ui/theme";
import {
  GO_ANCHOR_RATIO,
  GO_BANNER_DY,
  GO_BANNER_H,
  GO_BANNER_W,
  GO_BANNER_DX,
  GO_BEST_DY,
  GO_BEST_PX,
  GO_BTN_DY,
  GO_BTN_GAP,
  GO_BTN_H,
  GO_BTN_PX,
  GO_BTN_STROKE_W,
  GO_BTN_TEXT_DY,
  GO_BTN_W,
  GO_DOUBLE_DX,
  GO_DOUBLE_H,
  GO_DOUBLE_PX,
  GO_DOUBLE_TEXT_DY,
  GO_DOUBLE_UP,
  GO_DOUBLE_W,
  GO_ECHO_DY,
  GO_ECHO_PX,
  GO_POSE_ALPHA,
  GO_POSE_DX,
  GO_POSE_DY,
  GO_POSE_H,
  GO_POSE_W,
  GO_RANK_DY,
  GO_RANK_PX,
  GO_REVIVE_DX,
  GO_REVIVE_DY,
  GO_REVIVE_H,
  GO_REVIVE_PX,
  GO_REVIVE_TEXT_DY,
  GO_REVIVE_W,
  GO_TIME_DY,
  GO_TIME_PX,
  GO_TITLE_PX,
  GO_WAVE_DY,
  GO_WAVE_PX,
  gameOverDoubleBtn,
  gameOverLayout,
  gameOverReviveBtn,
  gameOverRowX,
  gameOverScreenLayout,
  type GameOverLayout,
  type GoRect,
} from "@game/ui/gameOverLayout";

/* ---------- Cocos 宿主侧的被测件（cc-free） ---------- */
import {
  buildGameOverContent,
  gameOverCanRevive,
  gameOverEchoClaim,
  gameOverForms,
  gameOverFormatTime,
  gameOverReviveLimit,
  hitGameOver,
  type GameOverRunView,
  type GameOverSaveView,
} from "../cocos/assets/scripts/gameover/GameOverModel";
import * as cocosGameOverLayout from "../cocos/assets/scripts/game/ui/gameOverLayout";
import * as cocosStagesData from "../cocos/assets/scripts/game/data/stages";
import * as cocosDailyData from "../cocos/assets/scripts/game/data/daily";

/* ==================== 夹具 ==================== */

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = cocosGameOverLayout.GO_PAD;
const BAND = W - PAD * 2;

/** 一份「打过几局、有最佳纪录」的档（本屏只读这三项） */
function save(over: Partial<GameOverSaveView> = {}): GameOverSaveView {
  return { points: 1234, bestRun: { kills: 4321, seconds: 907 }, dailyTalentClaimed: [], ...over };
}

/** 一份「生存 5:07、第 6 波、击杀 1500、预计算回响 88、未复活、双倍未领」的本局读数 */
function run(over: Partial<GameOverRunView> = {}): GameOverRunView {
  return {
    elapsed: 307,
    wave: 6,
    kills: 1500,
    pointsEarnedThisRun: 88,
    stardustEarnedThisRun: 0,
    reviveUsed: 0,
    rankImprovedTo: null,
    doubleClaimed: false,
    ...over,
  };
}

const FORMS_ON = { canRevive: true, canDouble: true };

function laid(h: number, forms: { canRevive: boolean; canDouble: boolean } = FORMS_ON): GameOverLayout {
  return gameOverLayout(W, h, forms);
}

/** 一帧几何 + 一屏文案（形态位由读数与存档折出，与宿主同一条口） */
function screen(r: GameOverRunView, sv: GameOverSaveView = save(), h: number = H_STD) {
  const L = laid(h, gameOverForms(sv, r));
  return { L, c: buildGameOverContent(sv, r, L) };
}

const center = (r: GoRect): number => r.x + r.w / 2;
const bottom = (r: GoRect): number => r.y + r.h;
const mid = (r: GoRect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

/** 去掉注释后的代码体：源码纪律断言只该看代码，不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 读 Web 基准源码（仓库里是 CRLF，统一换行后再比对字面量） */
function webSource(): string {
  return readFileSync(new URL("../src/game.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function fileSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

/** 从 PHASE4_DEFAULTS 里抠出一张 `键 → 字面量` 的表（ViewTable 那侧 import 了 cc，node 不能直载） */
function phase4Defaults(): Record<string, string> {
  const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(\w+):\s*"([^"]*)",\s*$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web drawGameOver 的源码段（4015-4113 一体） */
function webDrawGameOver(): string {
  const web = webSource();
  return web.slice(web.indexOf("private drawGameOver("), web.indexOf("private drawJoystick("));
}

/** Web handleTap 的 gameover 分支（含五支命中的先后） */
function webGameOverTap(): string {
  const web = webSource();
  return web.slice(web.indexOf('if (this.state === "gameover") {\n      // 广告复活'), web.indexOf('} else if (this.state === "prestige")'));
}

/* ==================== 0. 端间同一实现 ==================== */

describe("端间共读同一份共享层", () => {
  it("gameOverLayout、stages 与 daily 三个模块在两端是同一实例（函数引用相同）", () => {
    expect(cocosGameOverLayout.gameOverLayout).toBe(gameOverLayout);
    expect(cocosGameOverLayout.gameOverReviveBtn).toBe(gameOverReviveBtn);
    expect(cocosStagesData.splitEcho).toBe(splitEcho);
    expect(cocosDailyData.dailyTalentOf).toBe(dailyTalentOf);
  });

  it("本屏用到的两条规则都没有宿主侧抄本：模型里不出现回响比例与复活上限的字面量", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/gameover/GameOverModel.ts"));
    expect(model.includes("0.4")).toBe(false);
    expect(model.includes("ECHO_RETAIN_RATE")).toBe(false);
    // 上限只写「1 + 不屈的 value」，那个 value 从 DAILY_TALENT_POOL 现取
    expect(model.includes("dailyTalentOf(")).toBe(true);
    expect(model.includes("extra_revive")).toBe(true);
    expect(model.includes("Math.random")).toBe(false);
    expect(model.includes("Date.now")).toBe(false);
    expect(model.includes("localStorage")).toBe(false);
    expect(model.includes("writeSave")).toBe(false);
    expect(model.includes("persist(")).toBe(false);
  });

  it("不屈确实存在且 value 就是复活次数加值（表被人改掉时本屏跟着变，不是宿主写死）", () => {
    const t = DAILY_TALENT_POOL.find((x) => x.id === "extra_revive");
    expect(t).toBeTruthy();
    expect(gameOverReviveLimit([])).toBe(1);
    expect(gameOverReviveLimit(["extra_revive"])).toBe(1 + (t as { value: number }).value);
    expect(gameOverReviveLimit(["dmg20", "extra_revive"])).toBe(2);
  });
});

/* ==================== 1. 几何矩阵：两档屏高 × 四种形态 ==================== */

describe("屏级矩形（与 Web drawGameOver 的内联字面量逐位对应）", () => {
  const FORM_CELLS: Array<{ name: string; forms: { canRevive: boolean; canDouble: boolean } }> = [
    { name: "复活可点 + 双倍可领", forms: { canRevive: true, canDouble: true } },
    { name: "复活已尽 + 双倍可领", forms: { canRevive: false, canDouble: true } },
    { name: "复活可点 + 双倍已领", forms: { canRevive: true, canDouble: false } },
    { name: "复活已尽 + 双倍已领", forms: { canRevive: false, canDouble: false } },
  ];

  it("996 档逐项同 Web：a = 298，横幅 {160,264,240,48}，立绘 {84,254,58,92}", () => {
    const L = laid(H_STD);
    expect(L.anchorY).toBe(298);
    expect(L.banner).toEqual({ x: 160, y: 264, w: 240, h: 48 });
    expect(L.pose).toEqual({ x: 84, y: 254, w: 58, h: 92 });
    expect(L.banner.y).toBe(L.anchorY - GO_BANNER_DY);
    expect(L.pose.y).toBe(L.anchorY - GO_POSE_DY);
  });

  it("996 档三处钮位：复活 {170,422,220,44}、三钮行 {16,478,168,44} 步进 180、双倍 {170,880,220,44}", () => {
    const L = laid(H_STD);
    expect(L.reviveBtn).toEqual({ x: 170, y: 422, w: 220, h: 44 });
    expect(L.restartBtn).toEqual({ x: 16, y: 478, w: 168, h: 44 });
    expect(L.prestigeBtn).toEqual({ x: 196, y: 478, w: 168, h: 44 });
    expect(L.menuBtn).toEqual({ x: 376, y: 478, w: 168, h: 44 });
    expect(L.doubleBtn).toEqual({ x: 170, y: 880, w: 220, h: 44 });
    expect(L.btnStep).toBe(GO_BTN_W + GO_BTN_GAP);
    expect(L.btnRowW).toBe(528);
    // 三钮行整体居中且左右都留得下 pad
    expect(gameOverRowX(W)).toBe(cocosGameOverLayout.GO_PAD);
    expect(L.menuBtn.x + L.menuBtn.w).toBeLessThanOrEqual(W - PAD);
    expect(L.restartBtn.x).toBeGreaterThanOrEqual(PAD);
  });

  it("文字基线是三处裸偏移（+28 / +28 / +28），三钮行那一档与 rowTextY 不同源属 Web 原样", () => {
    const L = laid(H_STD);
    expect(L.reviveText.baseY).toBe(422 + 28);
    expect(L.restartText.baseY).toBe(478 + 28);
    expect(L.doubleText.baseY).toBe(880 + 28);
    // Web 这里没走 rowTextY：同档实参下它给 496（= by + 27.2 取整），Web 的裸 +28 落在 496.8
    expect(rowTextY(L.restartBtn.y, GO_BTN_H, GO_BTN_PX)).toBe(505);
    expect(L.restartText.baseY).toBe(478 + 28);
    // 钮内文字的 x 是三枚各自的水平中心，不是屏心
    expect([L.restartText.x, L.prestigeText.x, L.menuText.x]).toEqual([100, 280, 460]);
    expect([L.reviveText.x, L.doubleText.x, L.title.x]).toEqual([280, 280, 280]);
  });

  it("五行读数的基线 = a + 34/56/80/100 与 a + 240（名次提示落在三钮行之下 16px）", () => {
    const L = laid(H_STD);
    const a = Math.floor((H_STD * GO_ANCHOR_RATIO) / 2) * 2;
    expect([L.timeLine.baseY, L.waveLine.baseY, L.echoLine.baseY, L.bestLine.baseY]).toEqual([a + 34, a + 56, a + 80, a + 100]);
    expect(L.rankLine.baseY).toBe(a + GO_RANK_DY);
    expect(L.rankLine.baseY - bottom(L.restartBtn)).toBe(16);
    // 名次提示与贴底双倍钮之间在两档屏高下都留得开
    expect(L.rankLine.baseY).toBeLessThan(L.doubleBtn.y);
  });

  it("字号是 Web 的字面量档 26 / 16×4 / 15×4，其中 26 与 15 两档不在 fs 表里", () => {
    const L = laid(H_STD);
    const px = [L.title.px, L.timeLine.px, L.waveLine.px, L.echoLine.px, L.bestLine.px, L.reviveText.px, L.restartText.px, L.rankLine.px, L.doubleText.px];
    expect(px.join(",")).toBe("26,16,16,16,16,15,15,15,15");
    const table = Object.values(FS) as number[];
    expect(table).not.toContain(26);
    expect(table).not.toContain(15);
    expect(table).toContain(16);
    expect(GO_TITLE_PX).toBe(26);
    expect(GO_BTN_PX).toBe(15);
  });

  it("八处居中文字全部落在屏心、限宽收成整屏带宽（钮内文字不按钮宽裁，Web 那里就不限宽）", () => {
    const L = laid(H_STD);
    const lines = [L.title, L.timeLine, L.waveLine, L.echoLine, L.bestLine, L.reviveText, L.restartText, L.prestigeText, L.menuText, L.rankLine, L.doubleText];
    for (const t of lines) {
      expect(t.maxW, t.px + "@" + t.baseY).toBe(BAND);
      expect(t.align).toBe("center");
    }
    // 「看广告复活(剩余 1 次)」按 15px 量出来比 220 的钮宽，Web 就是让它压出钮缘
    expect(BAND).toBeGreaterThan(GO_REVIVE_W);
  });

  it("两档 × 四形态八格：形态位不改变任何矩形", () => {
    for (const h of [H_STD, H_TALL]) {
      const base = laid(h, FORM_CELLS[0].forms);
      for (const cell of FORM_CELLS) {
        const L = laid(h, cell.forms);
        expect(JSON.stringify(L), cell.name + " @ " + h).toBe(JSON.stringify({ ...base, canRevive: cell.forms.canRevive, canDouble: cell.forms.canDouble }));
      }
    }
  });

  it("两档之间：锚线族整体平移 Δh × 0.3 = 74px（取偶档），贴底族整体平移 Δh = 250px", () => {
    const A = laid(H_STD);
    const B = laid(H_TALL);
    const dh = H_TALL - H_STD;
    const dAnchor = Math.floor((H_TALL * GO_ANCHOR_RATIO) / 2) * 2 - Math.floor((H_STD * GO_ANCHOR_RATIO) / 2) * 2;
    for (const key of ["banner", "pose", "reviveBtn", "restartBtn", "prestigeBtn", "menuBtn", "doubleBtn"] as const) {
      const dy = B[key].y - A[key].y;
      expect(dy, key + " Δy").toBe(key === "doubleBtn" ? dh : dAnchor);
      expect(B[key].x).toBe(A[key].x);
      expect(B[key].w).toBe(A[key].w);
      expect(B[key].h).toBe(A[key].h);
    }
    expect(B.anchorY - A.anchorY).toBe(dAnchor);
    expect(B.doubleBtn.y - A.doubleBtn.y).toBe(dh);
    // 两族之间的空档一起伸缩：三钮行底到双倍钮顶
    expect(bottom(B.restartBtn)).toBeLessThan(B.doubleBtn.y);
    expect(B.doubleBtn.y - bottom(B.restartBtn) - (A.doubleBtn.y - bottom(A.restartBtn))).toBe(dh - dAnchor);
  });

  it("1246 档双倍钮底边落在 h − 72（贴底族让位给呼吸缝），屏内不越界", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h);
      expect(L.doubleBottomGap).toBe(GO_DOUBLE_UP - GO_DOUBLE_H);
      expect(bottom(L.doubleBtn)).toBe(h - 72);
      expect(bottom(L.doubleBtn)).toBeLessThan(h);
      // 屏心族的两端极值都在横向 560 之内
      for (const r of [L.banner, L.pose, L.reviveBtn, L.restartBtn, L.prestigeBtn, L.menuBtn, L.doubleBtn]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W);
      }
      // 横向全部与屏高无关
      expect(L.pose.x).toBe(84);
      expect(L.banner.x).toBe(160);
      expect(L.menuBtn.x + L.menuBtn.w).toBe(W - PAD);
    }
    expect(gameOverReviveBtn(W, H_TALL)).toEqual({ x: 170, y: 496, w: 220, h: 44 });
    expect(gameOverDoubleBtn(W, H_TALL)).toEqual({ x: 170, y: 1130, w: 220, h: 44 });
    expect(laid(H_TALL).restartBtn.y).toBe(552);
  });

  it("五枚热区两两不重叠（复活钮与三钮行之间留 12px，三钮行与双倍钮之间留一整段空白）", () => {
    const L = laid(H_STD);
    const rects = [L.reviveBtn, L.doubleBtn, L.restartBtn, L.prestigeBtn, L.menuBtn];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, a.x + "," + b.x + " 重叠").toBe(false);
      }
    }
    expect(L.restartBtn.y - bottom(L.reviveBtn)).toBe(12);
  });

  it("单一出口：screenLayout 与 layout 同数；描边宽与立绘透明度留在共享层", () => {
    expect(gameOverScreenLayout(W, H_STD, FORMS_ON)).toEqual(gameOverLayout(W, H_STD, FORMS_ON));
    expect(GO_BTN_STROKE_W).toBe(1);
    expect(GO_POSE_ALPHA).toBe(0.5);
    // Web 本屏一次都不设 lineWidth（取全项目「描边后复位 1」档），也不出现第二档 alpha
    const seg = webDrawGameOver();
    expect(seg.includes("lineWidth")).toBe(false);
    expect(seg.match(/globalAlpha = ([\d.]+)/g)?.join("|")).toBe("globalAlpha = 0.5|globalAlpha = 1");
  });

  it("共享层不引 cc、不读存档：本层只有一个 import（theme）", () => {
    const src = codeOf(fileSource("../cocos/assets/scripts/game/ui/gameOverLayout.ts"));
    expect(src.includes('from "cc"')).toBe(false);
    expect(src.includes("save.")).toBe(false);
    expect(src.includes("localStorage")).toBe(false);
    expect((src.match(/^import .+$/gm) ?? []).length).toBe(0);
  });
});

/* ==================== 1b. 共享层常量逐项（与 Web 内联字面量比对） ==================== */

describe("共享层几何常量逐项", () => {
  it("锚线 / 横幅 / 立绘 / 四行读数 / 三处钮的每个偏移与字号都与 Web 同数", () => {
    expect([GO_ANCHOR_RATIO, GO_BANNER_DX, GO_BANNER_W, GO_BANNER_H, GO_BANNER_DY]).toEqual([0.3, 120, 240, 48, 34]);
    expect([GO_POSE_DX, GO_POSE_W, GO_POSE_H, GO_POSE_DY]).toEqual([196, 58, 92, 44]);
    expect([GO_TIME_DY, GO_WAVE_DY, GO_ECHO_DY, GO_BEST_DY]).toEqual([34, 56, 80, 100]);
    expect([GO_REVIVE_DX, GO_REVIVE_W, GO_REVIVE_H, GO_REVIVE_DY, GO_REVIVE_TEXT_DY]).toEqual([110, 220, 44, 124, 28]);
    expect([GO_BTN_W, GO_BTN_H, GO_BTN_GAP, GO_BTN_DY, GO_BTN_TEXT_DY, GO_BTN_PX]).toEqual([168, 44, 12, 180, 28, 15]);
    expect([GO_RANK_DY, GO_RANK_PX]).toEqual([240, 15]);
    expect([GO_DOUBLE_DX, GO_DOUBLE_W, GO_DOUBLE_H, GO_DOUBLE_UP, GO_DOUBLE_TEXT_DY, GO_DOUBLE_PX]).toEqual([110, 220, 44, 116, 28, 15]);
    expect([GO_TITLE_PX, GO_TIME_PX, GO_WAVE_PX, GO_ECHO_PX, GO_BEST_PX, GO_REVIVE_PX]).toEqual([26, 16, 16, 16, 16, 15]);
    const web = webDrawGameOver();
    for (const lit of ["h * 0.3", "w / 2 - 120", "240, 48", "w / 2 - 196", "58, 92", "h * 0.3 + 34", "h * 0.3 + 56", "h * 0.3 + 80", "h * 0.3 + 100", "{ x: w / 2 - 110, y: h * 0.3 + 124, w: 220, h: 32 }", "const bw = 118;", "const bh = 44;", "const gap = 8;", "const by = h * 0.3 + 170;", "h * 0.3 + 232", "{ x: w / 2 - 95, y: h - 116, w: 190, h: 34 }", "rb.y + 21", "by + 28", "dbl.y + 22"]) {
      expect(web.includes(lit), lit).toBe(true);
    }
  });

  it("复活钮文字横向中心就是钮自身的中心（三枚横排钮同理，Web 都写 bx + bw / 2）", () => {
    const L = laid(H_STD);
    expect(L.reviveText.x).toBe(center(L.reviveBtn));
    expect(L.restartText.x).toBe(center(L.restartBtn));
    expect(L.prestigeText.x).toBe(center(L.prestigeBtn));
    expect(L.menuText.x).toBe(center(L.menuBtn));
    expect(L.doubleText.x).toBe(center(L.doubleBtn));
  });

  it("canRevive 与模型里的判据同一条：reviveUsed < 1 + 不屈", () => {
    expect(gameOverCanRevive([], 0)).toBe(true);
    expect(gameOverCanRevive([], 1)).toBe(false);
    expect(gameOverCanRevive(["extra_revive"], 1)).toBe(true);
    expect(gameOverCanRevive(["extra_revive"], 2)).toBe(false);
    const web = webSource();
    expect(web.includes("return this.reviveUsed < this.reviveLimit();")).toBe(true);
    expect(web.includes('return 1 + (this.hasDailyTalent("extra_revive") ? dailyTalentOf("extra_revive").value : 0);')).toBe(true);
  });
});

/* ==================== 2. 命中面：五枚热区 + 区外吞掉 ==================== */

describe("命中判定（对标 Web handleTap 的 gameover 五支与先后）", () => {
  const L = laid(H_STD);

  it("三钮行逐枚各归其主：重开 / 天赋 / 菜单", () => {
    expect(hitGameOver(L, ...mid(L.restartBtn))).toEqual({ kind: "restart" });
    expect(hitGameOver(L, ...mid(L.prestigeBtn))).toEqual({ kind: "prestige" });
    expect(hitGameOver(L, ...mid(L.menuBtn))).toEqual({ kind: "menu" });
  });

  it("复活钮与双倍钮各归其主（双倍钮是贴底锚，不在三钮行那一族里）", () => {
    expect(hitGameOver(L, ...mid(L.reviveBtn))).toEqual({ kind: "revive" });
    expect(hitGameOver(L, ...mid(L.doubleBtn))).toEqual({ kind: "double" });
  });

  it("每枚热区四条边都是闭区间（压边命中、外 1px 不命中）", () => {
    for (const r of [L.reviveBtn, L.doubleBtn, L.restartBtn, L.prestigeBtn, L.menuBtn]) {
      expect(hitGameOver(L, r.x, r.y)).toBeTruthy();
      expect(hitGameOver(L, r.x + r.w, r.y + r.h)).toBeTruthy();
      expect(hitGameOver(L, r.x - 1, r.y - 1)).toBeFalsy();
      expect(hitGameOver(L, r.x + r.w + 1, r.y + r.h + 1)).toBeFalsy();
    }
  });

  it("区外一律吞掉：横幅 / 立绘 / 五行读数 / 钮缝 / 屏角 / 屏外", () => {
    const outside: Array<[number, number]> = [
      [280, 298], // 标题基线（阵亡）
      [84, 254], // 立绘左上角
      [280, 332], // 生存行
      [280, 398], // 最佳纪录行
      [280, 472], // 复活钮与三钮行之间那 12px 缝
      [280, 525], // 三钮行下方
      [280, 538], // 名次提示那一行
      [280, 700], // 屏中大空白
      [280, 879], // 双倍钮上缘外 1px
      [169, 897], // 双倍钮左缘外 1px
      [5, 5], // 左上角
      [W - 1, H_STD - 1], // 右下角
      [W / 2, H_STD + 40], // 屏外
    ];
    for (const [x, y] of outside) expect(hitGameOver(L, x, y), x + "," + y).toBe(null);
  });

  it("形态位关闭时那一片不再是热区：复活钮落空、双倍钮落空（Web 是 if 前置没进去）", () => {
    const off = laid(H_STD, { canRevive: false, canDouble: false });
    expect(hitGameOver(off, ...mid(off.reviveBtn))).toBe(null);
    expect(hitGameOver(off, ...mid(off.doubleBtn))).toBe(null);
    // 三钮行与两个形态位无关，关掉后照样命中
    expect(hitGameOver(off, ...mid(off.restartBtn))).toEqual({ kind: "restart" });
    expect(hitGameOver(off, ...mid(off.prestigeBtn))).toEqual({ kind: "prestige" });
    expect(hitGameOver(off, ...mid(off.menuBtn))).toEqual({ kind: "menu" });
    // 只关双倍：复活仍然可点
    const onlyRevive = laid(H_STD, { canRevive: true, canDouble: false });
    expect(hitGameOver(onlyRevive, ...mid(onlyRevive.reviveBtn))).toEqual({ kind: "revive" });
    expect(hitGameOver(onlyRevive, ...mid(onlyRevive.doubleBtn))).toBe(null);
  });

  it("先后：复活与双倍的判定排在三钮行之前（Web 同序；两者矩形本就不与三钮行相交）", () => {
    const order = ["revive", "double", "restart", "prestige", "menu"];
    const rects = [L.reviveBtn, L.doubleBtn, L.restartBtn, L.prestigeBtn, L.menuBtn];
    expect(rects.map((r) => hitGameOver(L, ...mid(r))?.kind).join(",")).toBe(order.join(","));
    // 复活钮的纵向区间排在三钮行之前
    expect(bottom(L.reviveBtn)).toBeLessThan(L.restartBtn.y);
    expect(bottom(L.restartBtn)).toBeLessThan(L.doubleBtn.y);
  });

  it("热区层读的是几何里的形态位，与内容层给的是同一份判据", () => {
    const r = run({ reviveUsed: 1 });
    const forms = gameOverForms(save(), r);
    expect(forms.canRevive).toBe(false);
    const L2 = laid(H_STD, forms);
    expect(hitGameOver(L2, ...mid(L2.reviveBtn))).toBe(null);
    // 当日天赋里有不屈 → 第 2 次复活仍可点
    const r2 = run({ reviveUsed: 1 });
    expect(gameOverForms(save({ dailyTalentClaimed: ["extra_revive"] }), r2).canRevive).toBe(true);
  });
});

/* ==================== 3. 文案逐字（与 Web drawGameOver 的 fillText 实参比对） ==================== */

describe("屏级文案逐字", () => {
  it("标题、两行读数与回响行的字面量与 Web 完全一致", () => {
    const { c } = screen(run());
    expect(c.title).toBe("阵亡");
    expect(c.timeLine).toBe("生存 5:07");
    expect(c.waveLine).toBe("波次 6 · 击杀 1500");
    expect(c.echoLine).toBe("回响点数 +88(累计 1234)");
    expect(c.bestLine).toBe("最佳纪录:击杀 4321 · 15:07");
    expect(c.reviveText).toBe("看广告复活(剩余 1 次)");
    expect([c.restartText, c.prestigeText, c.menuText]).toEqual(["重开 (R)", "天赋 (T)", "菜单 (M)"]);
    expect(c.doubleText).toBe("广告 ×2 回响");
    const web = webDrawGameOver();
    for (const lit of ['"阵亡"', "生存 ${", "波次 ${", " · 击杀 ${", "回响点数 +${", "(累计 ${", "最佳纪录:击杀 ${", "看广告复活(剩余 ${", '"重开 (R)"', '"天赋 (T)"', '"菜单 (M)"', "已超越幻影第 ${", '"广告 ×2 回响"', '"已领双倍"', "星尘 +${", "(天赋已满,回响点数转化为星尘)"]) {
      expect(web.includes(lit), lit).toBe(true);
    }
  });

  it("mm:ss 复刻 Web formatTime：分钟不补零、秒补零、向下取整（含 0 秒与 59.999 秒两个边界）", () => {
    expect(gameOverFormatTime(0)).toBe("0:00");
    expect(gameOverFormatTime(59.999)).toBe("0:59");
    expect(gameOverFormatTime(60)).toBe("1:00");
    expect(gameOverFormatTime(307)).toBe("5:07");
    expect(gameOverFormatTime(907)).toBe("15:07");
    expect(gameOverFormatTime(3600)).toBe("60:00");
    const web = webSource();
    expect(web.includes('return `${m}:${String(s).padStart(2, "0")}`;')).toBe(true);
  });

  it("没有最佳纪录时该行收起，但矩形仍算出来（形态位不改几何）", () => {
    const { L, c } = screen(run(), save({ bestRun: null }));
    expect(c.hasBest).toBe(false);
    expect(c.bestLine).toBe("");
    expect(L.bestLine.baseY).toBe(L.anchorY + GO_BEST_DY);
  });

  it("名次提示只在 rankImprovedTo 非 null 时有；0 也要出（Web 判的是 != null，不是真值）", () => {
    expect(screen(run({ rankImprovedTo: 3 })).c.rankText).toBe("已超越幻影第 3 名");
    const zero = screen(run({ rankImprovedTo: 0 }));
    expect(zero.c.hasRank).toBe(true);
    expect(zero.c.rankText).toBe("已超越幻影第 0 名");
    expect(screen(run()).c.hasRank).toBe(false);
    const web = webDrawGameOver();
    expect(web.includes("if (this.rankImprovedTo != null)")).toBe(true);
  });

  it("领取双倍后文案转「已领双倍」、钮仍占同一格（Web 的 doubleBtn 无条件赋值）", () => {
    const claimed = screen(run({ doubleClaimed: true }));
    expect(claimed.c.doubleText).toBe("已领双倍");
    expect(claimed.c.canDouble).toBe(false);
    expect(claimed.L.doubleBtn).toEqual(laid(H_STD).doubleBtn);
  });

  it("复活剩余次数是「上限 − 已用」，用完即为 0 且整棵收起", () => {
    expect(screen(run({ reviveUsed: 0 })).c.reviveRemain).toBe(1);
    expect(screen(run({ reviveUsed: 1 })).c.canRevive).toBe(false);
    const talent = save({ dailyTalentClaimed: ["extra_revive"] });
    expect(screen(run({ reviveUsed: 1 }), talent).c.reviveText).toBe("看广告复活(剩余 1 次)");
    expect(screen(run({ reviveUsed: 1 }), talent).c.canRevive).toBe(true);
    expect(screen(run({ reviveUsed: 2 }), talent).c.canRevive).toBe(false);
  });

  it("星尘那一行在本屏是死分支：Web 与两端都在死亡时写 0，只有 victory 写非零", () => {
    const web = webSource();
    // onDeath 与 startRun 各写一次 0，victory 是唯一非零写入
    expect((web.match(/this\.stardustEarnedThisRun = 0;/g) ?? []).length).toBe(2);
    expect(web.includes("this.stardustEarnedThisRun = stardustGain;")).toBe(true);
    expect(web.slice(web.indexOf("private onDeath("), web.indexOf("private settlePendingRun(")).includes("this.stardustEarnedThisRun = 0;")).toBe(true);
    // 本层原样：给非零才出那一档，且颜色仍是同一笔金
    const up = screen(run({ stardustEarnedThisRun: 30 }));
    expect(up.c.echoIsStardust).toBe(true);
    expect(up.c.echoLine).toBe("星尘 +30(天赋已满,回响点数转化为星尘)");
    expect(screen(run()).c.echoIsStardust).toBe(false);
  });
});

/* ==================== 4. 写入意图逐字段与 Web 对齐 ==================== */

describe("写入意图（gameOverEchoClaim ↔ Web settleEcho + handleTap 的 double 支）", () => {
  it("翻倍那一笔就是 splitEcho 的两半：permanent 进 points、day 进 dayEcho", () => {
    const claim = gameOverEchoClaim(88, false);
    const { permanent, day } = splitEcho(88);
    expect(claim).toEqual({ kind: "echo", persists: true, permanent, day, total: 88 });
    expect(permanent).toBe(Math.floor(88 * ECHO_RETAIN_RATE));
    expect(permanent + day).toBe(88);
  });

  it("0 / 负数 / 1 这三种边界都仍然给意图（Web 没有 `if (total > 0)` 前置）", () => {
    expect(gameOverEchoClaim(0, false)?.permanent).toBe(0);
    expect(gameOverEchoClaim(0, false)?.day).toBe(0);
    const one = gameOverEchoClaim(1, false);
    expect(one?.permanent).toBe(0);
    expect(one?.day).toBe(1);
    expect(one?.total).toBe(1);
  });

  it("已领即拒：claimed 为真时没有意图（Web 的 !doubleClaimed 前置）", () => {
    expect(gameOverEchoClaim(88, true)).toBe(null);
  });

  it("Web 的 double 支不写 pointsEarnedThisRun、不清 pendingSettle、不换 state（翻倍=同一笔结两次）", () => {
    const tap = webGameOverTap();
    const seg = tap.slice(tap.indexOf("hitDoubleBtn"), tap.indexOf("hitRestart"));
    expect(seg.includes("settleEcho(this.pointsEarnedThisRun)")).toBe(true);
    expect(seg.includes("this.doubleClaimed = true")).toBe(true);
    expect(seg.includes("persistSave(this.save)")).toBe(true);
    expect(seg.includes("pendingSettle = false")).toBe(false);
    expect(seg.includes("this.state =")).toBe(false);
    // 三笔「放弃」出口才结死亡本账：settlePendingRun → settleRun 用的仍是同一个 pointsEarnedThisRun
    const settle = webSource().slice(webSource().indexOf("private settleRun()"), webSource().indexOf("private recordEquipment("));
    expect(settle.includes("const gained = this.pointsEarnedThisRun || calcPrestigePoints")).toBe(true);
    expect(settle.includes("this.save.prestiges += 1;")).toBe(true);
  });

  it("复活那一支不产生写入意图：Web 的 watchAd(() => this.revive()) 里没有 persistSave", () => {
    const tap = webGameOverTap();
    const seg = tap.slice(0, tap.indexOf("hitDoubleBtn"));
    expect(seg.includes("this.watchAd(() => this.revive())")).toBe(true);
    expect(seg.includes("persistSave")).toBe(false);
    expect(seg.includes("onFail")).toBe(false);
    // 复活只解挂起 + 作废名次提示 + 回 playing，战场部分在世界层
    const web = webSource();
    const revive = web.slice(web.indexOf("private revive(): void"), web.indexOf("private onDeath("));
    expect(revive.includes("this.pendingSettle = false;")).toBe(true);
    expect(revive.includes("this.rankImprovedTo = null;")).toBe(true);
    expect(revive.includes('this.state = "playing";')).toBe(true);
    expect((revive.match(/persist/g) ?? []).length).toBe(0);
  });

  it("三个放弃出口的落点与写档逐条对齐（重开=结算+开局、天赋=结算+切屏、菜单=结算+切屏）", () => {
    const tap = webGameOverTap();
    expect(tap.includes("if (this.hitRestart(p)) this.restart();")).toBe(true);
    expect(tap.includes('else if (this.hitTalentsBtn(p)) { this.settlePendingRun(); this.state = "prestige"; }')).toBe(true);
    expect(tap.includes('else if (this.hitMenuBtn(p)) this.backToMenu();')).toBe(true);
    const web = webSource();
    expect(web.slice(web.indexOf("private restart(): void"), web.indexOf("private backToMenu(): void")).includes("this.settlePendingRun();")).toBe(true);
    const back = web.slice(web.indexOf("private backToMenu(): void"), web.indexOf("private victory(): void"));
    expect(back.includes("this.settlePendingRun();")).toBe(true);
    expect(back.includes('this.state = "menu";')).toBe(true);
  });
});

/* ==================== 5. 表键与 Web 源码字面量比对 ==================== */

describe("phase4 表的死亡结算屏配色档（键前缀 go）", () => {
  const t = phase4Defaults();
  const web = webDrawGameOver();

  it("每一档都与 Web 那一笔字面量同值（大小写按表侧 6 位档，字面量按 Web 小写档逐字比对）", () => {
    const PAIRS: Array<[string, string]> = [
      ["goDim", "rgba(0,0,0,0.8)"],
      ["goStat", "#e8e8e8"],
      ["goEcho", "#ffd76a"],
      ["goBest", "#8f9bb3"],
      ["goReviveFallbackBg", "#1d3d2e"],
      ["goReviveFallbackStroke", "#4dffc8"],
      ["goRestartFallbackBg", "#2a3d55"],
      ["goRestartFallbackStroke", "#5ac8fa"],
      ["goPrestigeBg", "#3a2d4d"],
      ["goPrestigeStroke", "#c06cff"],
      ["goMenuBg", "#1d2a3a"],
      ["goMenuStroke", "#8f9bb3"],
      ["goDoubleBg", "#3a3320"],
      ["goDoubleClaimedBg", "#1a1f2a"],
      ["goDoubleClaimedStroke", "rgba(255,255,255,0.15)"],
      ["goDoubleTextClaimed", "#5a6a80"],
    ];
    for (const [key, lit] of PAIRS) {
      expect(web.includes(`"${lit}"`), key + " 的 Web 字面量").toBe(true);
      expect(t[key]?.toLowerCase(), key).toBe(lit.toLowerCase());
    }
  });

  it("goTitle 端间已分档：Web 仍是红，Cocos 侧按 §11.1 换近白（基准字面量仍在位）", () => {
    // Web 那一笔没动，冻结基准照旧断言
    expect(web.includes('"#ff5a5a"'), 'Web 的 goTitle 字面量').toBe(true);
    // 分档依据：banner_large_red 带心只有 #3a1218→#7a1f2a 两档暗红，红字直接对比仅 3.34，
    // 而深色描边在同为暗色的带面上不起作用（见 docs/UI-PIXEL-REFRESH.md §11.1）→ 直接选亮字
    expect(t.goTitle).toBe("#E8ECF4");
    expect(t.goTitle.toLowerCase()).toBe(theme.textPrimary.toLowerCase());
  });

  it("白色与 theme.* 三档：Web 写的是 `#fff` 与 theme.gold，表侧一律 6 位档", () => {
    expect(web.includes('g.fillStyle = "#fff";')).toBe(true);
    expect(t.goBtnText).toBe("#FFFFFF");
    // theme.gold / theme.echo 之类在 Web 那侧是变量，展开后与表值同字面
    expect(t.goEcho.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.goRank.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.goDoubleText.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.goReviveText.toLowerCase()).toBe(theme.actionPrimary.toLowerCase());
    expect(t.goMenuStroke.toLowerCase()).toBe(theme.textSecondary.toLowerCase());
  });

  it("接口声明与默认值一一对应，且本屏没有任何一档走内联字面量", () => {
    const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
    const iface = src.slice(src.indexOf("export interface Phase4Params"), src.indexOf("export const PHASE4_DEFAULTS"));
    const keys = [...src.slice(src.indexOf("/* ---------- 死亡结算屏"), src.indexOf("}\n\nexport const PHASE4_DEFAULTS")).matchAll(/^\s{4}(go\w+): string;$/gm)].map((m) => m[1]);
    expect(keys.length).toBe(22);
    for (const k of keys) {
      expect(iface.includes(k + ": string;"), k).toBe(true);
      expect(t[k], k).toBeTruthy();
    }
    const view = codeOf(fileSource("../cocos/assets/scripts/gameover/GameOverView.ts"));
    expect((view.match(/p4\.go\w+/g) ?? []).length).toBeGreaterThan(15);
    // 视图里不出现任何内联颜色字面量（除零位盒与 alpha 这类几何档）
    expect(view.includes('"#')).toBe(false);
  });

  it("三枚钮的贴图档与 Web 的 skinButtonBase 实参逐字对应，且天赋/菜单两枚没有贴图", () => {
    expect(web.includes('skinButtonBase(g, this.assets, "btn_primary", rb.x, rb.y, rb.w, rb.h, 10)')).toBe(true);
    expect(web.includes('skinButtonBase(g, this.assets, "btn_minor", bx, by, bw, bh, 8)')).toBe(true);
    expect(web.includes('skinButtonBase(g, this.assets, "btn_primary", dbl.x, dbl.y, dbl.w, dbl.h, 10)')).toBe(true);
    expect(web.includes("banner_large_red")).toBe(true);
    expect(web.includes("player_pose_4")).toBe(true);
    const view = fileSource("../cocos/assets/scripts/gameover/GameOverView.ts");
    for (const k of ['const KEY_BANNER = "banner_large_red";', 'const KEY_POSE = "player_pose_4";', 'const KEY_PRIMARY = "btn_primary";', 'const KEY_MINOR = "btn_minor";']) {
      expect(view.includes(k), k).toBe(true);
    }
    expect(web.match(/assets\.draw\(g, "(banner_large_red|player_pose_4)"/g)?.length).toBe(2);
    // Web 这两枚没有贴图分支（天赋 / 菜单），视图也就不会给它们挂 Plate
    expect(web.slice(web.indexOf("this.talentsBtn ="), web.indexOf("this.menuBtn =")).includes("skinButtonBase")).toBe(false);
  });
});

/* ==================== 6. 宿主接线与源码守卫 ==================== */

describe("GameShell 的死亡结算屏接线", () => {
  const src = fileSource("../cocos/assets/scripts/GameShell.ts");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildGameOverScreen", "gameOverSave", "gameOverRun", "openGameOver", "syncGameOver", "onGameOverAction", "commitGameOverEcho", "resetGameOverTransients"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildGameOverScreen();")).toBe(true);
    expect(src.indexOf("this.buildGameOverScreen();")).toBeGreaterThan(src.indexOf("this.buildSeasonScreen();"));
    expect(src.includes("gameover: () => this.syncGameOver(),")).toBe(true);
    expect(src.includes('"commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("路由实际注册十六屏（SCREEN_KEYS 仍是 16 态全量）", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    expect(keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean)).toHaveLength(16);
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(13);
  });

  it("进屏判据只有一处：战斗层死亡回调直连 openGameOver，没有第二个弹屏点", () => {
    expect(src.includes("onDeath: () => this.openGameOver(),")).toBe(true);
    expect(src.includes("onVictory: (info) => this.openVictory(info),"), "通关回调已接线").toBe(true);
    expect((src.match(/this\.openGameOver\(\)/g) ?? []).length).toBe(1);
    expect((src.match(/this\.router\.show\("gameover"\)/g) ?? []).length).toBe(1);
    // Web 侧同样只有一个入口：onDeath 里那一句 state = "gameover"
    const web = webSource();
    expect((web.match(/this\.state = "gameover"/g) ?? []).length).toBe(1);
    expect(web.slice(web.indexOf("private onDeath("), web.indexOf("private settlePendingRun(")).includes('this.state = "gameover";')).toBe(true);
  });

  it("死亡那一刻的预计算在战斗层，宿主不重算一遍（pointsEarnedThisRun / pendingSettle / over）", () => {
    const sim = codeOf(fileSource("../cocos/assets/scripts/battle/BattleSim.ts"));
    const seg = sim.slice(sim.indexOf("private onDeath(): void"), sim.indexOf("settlePendingRun(): void"));
    expect(seg.includes("this.world.over = true;")).toBe(true);
    expect(seg.includes("this.pendingSettle = true;")).toBe(true);
    expect(seg.includes("calcPrestigePoints(this.world.elapsed, this.world.kills, 1)")).toBe(true);
    expect(seg.includes("this.cb.onDeath(")).toBe(true);
    // Web 的 onDeath 里没有的那笔「星尘写 0」由宿主在 openGameOver 同位补上
    expect(src.slice(src.indexOf("private openGameOver()"), src.indexOf("private syncGameOver()")).includes("this.stardustEarnedThisRun = 0;")).toBe(true);
    expect(src.includes("this.stardustEarnedThisRun = 0;")).toBe(true);
  });

  it("三个放弃出口都排在结算之后：天赋与菜单就地 settlePendingRun，重开复用 restartRun 首行那一句", () => {
    const seg = codeOf(src.slice(src.indexOf("private onGameOverAction"), src.indexOf("private commitGameOverEcho")));
    expect((seg.match(/sim\.settlePendingRun\(\);/g) ?? []).length).toBe(2);
    expect(seg.includes("this.restartRun();")).toBe(true);
    expect(seg.includes('this.router.show("menu");')).toBe(true);
    expect(seg.includes('this.openPrestige();')).toBe(true);
    expect(seg.includes("sim.revive();")).toBe(true);
    // restartRun 自己的首行就是那句结算（与 Web restart 同位）
    const restart = codeOf(src.slice(src.indexOf("private restartRun()"), src.indexOf("/**\n     * 英雄选择屏装配")));
    expect(restart.includes("sim.settlePendingRun();")).toBe(true);
    expect(restart.indexOf("sim.settlePendingRun();")).toBeLessThan(restart.indexOf("this.requestStage("));
  });

  it("两个广告位都只经 watchAd 唯一入口；本屏 action 段不含屏级广告闸门", () => {
    const seg = codeOf(src.slice(src.indexOf("private onGameOverAction"), src.indexOf("private commitGameOverEcho")));
    expect((seg.match(/this\.watchAd\(/g) ?? []).length).toBe(2);
    expect(seg.includes("adPending"), "结算屏 action 里不该有屏级广告闸门").toBe(false);
    expect(seg.includes("showRewardedAd"), "不绕过壳层直调平台广告").toBe(false);
    const body = codeOf(src);
    expect((body.match(/if \(this\.adPending\) return;/g) ?? []).length).toBe(1);
  });

  it("存档写入只发生在 commitGameOverEcho；本屏分节里没有第二处写点", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 死亡结算屏"), src.indexOf("/* ================= 通关结算屏")));
    const commit = seg.slice(seg.indexOf("private commitGameOverEcho"));
    expect(commit.includes("save.points += claim.permanent;")).toBe(true);
    expect(commit.includes("save.dayEcho += claim.day;")).toBe(true);
    expect(commit.includes("this.doubleClaimed = true;")).toBe(true);
    expect(commit.includes("this.refreshMenu();")).toBe(true);
    expect((seg.match(/persist\(\)/g) ?? []).length).toBe(1);
    const outside = seg.replace(commit, "");
    expect(outside.includes("save.")).toBe(false);
    expect(outside.includes("persist(")).toBe(false);
  });

  it("两项会话态不入档：宿主字段存在、SaveModel 里没有这两项", () => {
    expect(src.includes("private doubleClaimed = false;")).toBe(true);
    expect(src.includes("private stardustEarnedThisRun = 0;")).toBe(true);
    const saveModel = fileSource("../cocos/assets/scripts/core/SaveModel.ts");
    expect(saveModel.includes("doubleClaimed")).toBe(false);
    expect(saveModel.includes("stardustEarnedThisRun")).toBe(false);
    for (const f of ["points:", "dayEcho:", "bestRun:", "dailyTalentClaimed:"]) {
      expect(saveModel.includes(f), f).toBe(true);
    }
    // 开局复位收进宿主漏斗:文本上只剩 boot 与 enterBattleRun 两处,逻辑上仍覆盖四个开局点
    // (boot / 菜单选关 / 菜单无限关 / restartRun),且只在开局成功时跑(体力不足进 energy 屏时不复位)
    expect((src.match(/this\.resetGameOverTransients\(\);/g) ?? []).length).toBe(2);
    const enter = codeOf(src.slice(src.indexOf("private enterBattleRun()"), src.indexOf("private requestStage(")));
    expect(enter.includes("this.resetGameOverTransients();")).toBe(true);
    const menuStage = src.slice(src.indexOf('case "stage"'), src.indexOf('case "makeup"'));
    expect(menuStage.includes("this.requestStage(a.id);"), "菜单选关走开局漏斗").toBe(true);
    expect(menuStage.includes('this.toast("体力不足'), "体力不足不再是留在菜单的轻提示").toBe(false);
  });

  it("晚到贴图流到位后本屏也换引用并在当前屏时补排一次", () => {
    expect(src.includes("this.gameOverView?.setFrames(this.frames);")).toBe(true);
    expect(src.includes('if (this.router.current === "gameover") this.gameOverView?.sync();')).toBe(true);
  });
});

/* ==================== 7. Web 基准的反直觉口径（照抄，只列不改） ==================== */

describe("Web 基准的六条反直觉口径已原样带上", () => {
  const web = webSource();
  const tap = webGameOverTap();

  it("键盘 T 走的是「不结算直接切天赋屏」，与点击 T 那一支不同（点击先 settlePendingRun）", () => {
    expect(web.slice(web.indexOf('} else if (this.state === "gameover") {'), web.indexOf('} else if (this.state === "victory") {')).includes('if (e.key.toLowerCase() === "t") this.state = "prestige";')).toBe(true);
    expect(tap.includes('this.settlePendingRun(); this.state = "prestige";')).toBe(true);
  });

  it("gameover 状态没有 Escape 出口（三钮行就是返回出口）", () => {
    const seg = web.slice(web.indexOf('} else if (this.state === "gameover") {'), web.indexOf('} else if (this.state === "victory") {'));
    expect(seg.includes("Escape")).toBe(false);
  });

  it("热区矩形由上一帧的绘制写入（Web 的 restartBtn / reviveBtn 都是 draw 里赋值的私有字段）", () => {
    expect(web.includes("private restartBtn: { x: number; y: number; w: number; h: number } | null = null;")).toBe(true);
    expect(web.includes("this.reviveBtn = null;")).toBe(true);
    const seg = webDrawGameOver();
    expect((seg.match(/this\.(restartBtn|talentsBtn|menuBtn|reviveBtn|doubleBtn) =/g) ?? []).length).toBe(6);
  });

  it("双倍钮的命中热区在已领后仍然存在，只是那一支进不去", () => {
    expect(webDrawGameOver().includes("this.doubleBtn = dbl;")).toBe(true);
    expect(tap.includes("if (!this.doubleClaimed && this.hitDoubleBtn(p))")).toBe(true);
  });

  it("阵亡时战场与 HUD 都不画（render 把两者都门控在 playing），所以本屏背景就是暗底压住 bg", () => {
    const render = web.slice(web.indexOf("private render("), web.indexOf("private drawWorld("));
    expect(render.includes('if (this.state === "playing") this.drawWorld(g, cam);')).toBe(true);
    expect(render.includes('if (this.state === "playing") this.drawHUD(g, w, h);')).toBe(true);
    expect(render.includes('if (this.state === "gameover") this.drawGameOver(g, w, h);')).toBe(true);
  });

  it("复活上限、双倍、名次提示三件事在每次开局都会复位（Web startRun 的四笔）", () => {
    const startRun = web.slice(web.indexOf("private startRun(): void"), web.indexOf("private startStage("));
    expect(startRun.includes("this.doubleClaimed = false;")).toBe(true);
    expect(startRun.includes("this.pendingSettle = false;")).toBe(true);
    expect(startRun.includes("this.pointsEarnedThisRun = 0;")).toBe(true);
    expect(startRun.includes("this.stardustEarnedThisRun = 0;")).toBe(true);
    expect(startRun.includes("this.rankImprovedTo = null;")).toBe(true);
  });
});
/* ==================== 批 7 像素栅格闸:死亡结算屏 ==================== */

describe("死亡屏的像素栅格重排闸(module=2 / pad 16 / 热区 ≥44 / 呼吸缝)", () => {
  const L996 = gameOverScreenLayout(W, H_STD, FORMS_ON);
  const L1246 = gameOverScreenLayout(W, H_TALL, FORMS_ON);
  const evenDownOf = (v: number) => Math.floor(v / 2) * 2;
  /** 四格形态(本块自带一份,不跨 describe 取几何块里的 FORM_CELLS) */
  const FORM_QUAD = [
    { name: "双开", forms: { canRevive: true, canDouble: true } },
    { name: "复活已尽", forms: { canRevive: false, canDouble: true } },
    { name: "双倍已领", forms: { canRevive: true, canDouble: false } },
    { name: "复活已尽 + 双倍已领", forms: { canRevive: false, canDouble: false } },
  ] as const;
  /** 锚线族的推导式(屏高先取偶,再对 hh×0.3 取偶) */
  const anchorOf = (h: number) => evenDownOf(evenDownOf(h) * GO_ANCHOR_RATIO);

  it("页边距与内容宽是具名常量,共享层不再引 theme.ui.pad", () => {
    expect([cocosGameOverLayout.GO_PAD, cocosGameOverLayout.GO_CONTENT_W]).toEqual([16, 528]);
    expect(W - cocosGameOverLayout.GO_PAD * 2).toBe(cocosGameOverLayout.GO_CONTENT_W);
    expect(BAND).toBe(cocosGameOverLayout.GO_CONTENT_W);
    const src = codeOf(fileSource("../cocos/assets/scripts/game/ui/gameOverLayout.ts"));
    expect(src.includes("ui.pad")).toBe(false);
    expect(src.includes('from "./theme"')).toBe(false);
  });

  it("横幅与复活 / 双倍钮的半宽都由宽度推导;三钮行铺满内容带,行首就是页边距", () => {
    expect(cocosGameOverLayout.GO_BANNER_DX).toBe(evenDownOf(GO_BANNER_W / 2));
    expect(cocosGameOverLayout.GO_REVIVE_DX).toBe(evenDownOf(GO_REVIVE_W / 2));
    expect(cocosGameOverLayout.GO_DOUBLE_DX).toBe(evenDownOf(GO_DOUBLE_W / 2));
    expect(cocosGameOverLayout.GO_BANNER_DX * 2).toBe(GO_BANNER_W);
    // 绘制盒就是 art 的精确 2 倍(banner_large_red art 120×24)
    expect([GO_BANNER_W / 2, GO_BANNER_H / 2]).toEqual([120, 24]);
    // 三钮行:bw×3 + gap×2 恒等于内容宽 → bx 落 pad、右缘落 544,半宽不会再推出奇数
    expect(GO_BTN_W * 3 + GO_BTN_GAP * 2).toBe(cocosGameOverLayout.GO_CONTENT_W);
    expect((GO_BTN_W * 3 + GO_BTN_GAP * 2) % 4).toBe(0);
    expect(gameOverRowX(W)).toBe(cocosGameOverLayout.GO_PAD);
    expect(L996.btnRowW).toBe(528);
  });

  it("坐标与尺寸全落 2px 栅格:两档屏高 + 两档奇数屏高 × 四形态逐位为偶", () => {
    const odd: string[] = [];
    for (const h of [H_STD, H_TALL, 997, 1245]) {
      for (const cell of FORM_QUAD) {
        const L = gameOverScreenLayout(W, h, cell.forms);
        const rects = [L.panel, L.banner, L.pose, L.reviveBtn, L.restartBtn, L.prestigeBtn, L.menuBtn, L.doubleBtn];
        for (const r of rects) for (const v of [r.x, r.y, r.w, r.h]) if (v % 2 !== 0) odd.push(h + "/" + cell.name + "/rect " + v);
        const texts = [L.title, L.timeLine, L.waveLine, L.echoLine, L.bestLine, L.reviveText, L.restartText, L.prestigeText, L.menuText, L.rankLine, L.doubleText];
        for (const t of texts) if (t.x % 2 !== 0 || t.baseY % 2 !== 0) odd.push(h + "/" + cell.name + "/text " + t.x + "," + t.baseY);
        if (L.anchorY % 2 !== 0) odd.push(h + "/anchor " + L.anchorY);
      }
    }
    expect(odd).toEqual([]);
  });

  it("五枚热区都在 44 下限之上,且恒落在屏底板内", () => {
    for (const rect of [L996.reviveBtn, L996.restartBtn, L996.prestigeBtn, L996.menuBtn, L996.doubleBtn]) {
      expect(rect.w >= 44 && rect.h >= 44, JSON.stringify(rect)).toBe(true);
    }
    expect(L996.panel).toEqual({ x: 16, y: 16, w: 528, h: 964 });
    expect(L1246.panel).toEqual({ x: 16, y: 16, w: 528, h: 1214 });
    expect(L996.panelKey).toBe(cocosGameOverLayout.GO_PANEL_KEY);
    expect(L996.panelKey).toBe("panel_dark_corners");
    for (const L of [L996, L1246]) {
      for (const rect of [L.banner, L.pose, L.reviveBtn, L.restartBtn, L.prestigeBtn, L.menuBtn, L.doubleBtn]) {
        expect(rect.x).toBeGreaterThanOrEqual(L.panel.x);
        expect(rect.x + rect.w).toBeLessThanOrEqual(L.panel.x + L.panel.w);
        expect(rect.y).toBeGreaterThanOrEqual(L.panel.y);
        expect(bottom(rect)).toBeLessThanOrEqual(bottom(L.panel));
      }
    }
  });

  it("留白只落在呼吸缝:缝长随屏高走,其余偏移恒为常量", () => {
    expect(L996.seamAboveButtons).toBe(L996.doubleBtn.y - (L996.restartBtn.y + GO_BTN_H));
    expect(L996.seamAboveButtons).toBe(358);
    expect(L1246.seamAboveButtons).toBe(534);
    expect(L1246.seamAboveButtons - L996.seamAboveButtons).toBe(H_TALL - H_STD - (anchorOf(H_TALL) - anchorOf(H_STD)));
    expect(L996.doubleBottomGap).toBe(L1246.doubleBottomGap);
    expect(L996.restartBtn.y - bottom(L996.reviveBtn)).toBe(12);
    expect(L1246.restartBtn.y - bottom(L1246.reviveBtn)).toBe(12);
    // 屏高再涨也只加缝:钮高与行距这一族全都有上限,一律不跟着长
    const L1500 = gameOverScreenLayout(W, 1500, FORMS_ON);
    expect(L1500.doubleBtn.h).toBe(L996.doubleBtn.h);
    expect(L1500.restartBtn.w).toBe(L996.restartBtn.w);
    expect(L1500.seamAboveButtons).toBeGreaterThan(L1246.seamAboveButtons);
  });

  it("压带标题描边闸:视图必须走共享出口、宽度读表、屏底板走 Plate", () => {
    const view = codeOf(fileSource("../cocos/assets/scripts/gameover/GameOverView.ts"));
    expect(view.includes("setTextOutline(this.title.lb")).toBe(true);
    expect(view.includes("bannerTitleOutlineW")).toBe(true);
    expect(view.includes("outlineWidth =")).toBe(false);
    expect(view.includes('new Plate("Panel", this.root, frames)')).toBe(true);
    expect(view.includes("this.panel.show(L.panelKey, L.panel")).toBe(true);
  });
});

/* ==================== 三钮行同族闸 ==================== */

describe("死亡屏三钮行必须同族（都是 btn_minor 九宫格优先 + 缺图退代码底）", () => {
  const view = codeOf(fileSource("../cocos/assets/scripts/gameover/GameOverView.ts"));

  it("重开 / 天赋 / 菜单三枚都走 plate.show(KEY_MINOR…)，不得退回纯代码矩形", () => {
    for (const name of ["restart", "prestige", "menu"]) {
      expect(view.includes(`this.${name}.plate.show(KEY_MINOR, L.${name}Btn`), name).toBe(true);
      expect(view.includes(`this.${name}.base.draw(`), `${name} 不得退回 base.draw`).toBe(false);
    }
    // 复活与双倍仍走 btn_primary（它们是可行动作钮，与三钮行不是一族）
    expect(view.includes("this.revive.plate.show(KEY_PRIMARY")).toBe(true);
    expect(view.includes("this.double.plate.show(c.canDouble ? KEY_PRIMARY")).toBe(true);
  });
});
