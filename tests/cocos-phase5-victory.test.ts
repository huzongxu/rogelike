/**
 * Phase 5 通关结算屏闸门:victory(通关账目已结,弹哪一屏 / 屏上显示什么 / 点了去哪)。
 *
 * 延续 cocos-phase4-* 与 cocos-phase5-gameover 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `victory/VictoryModel.ts` 经相对路径 import 的共享层
 *     (`game/data/stages` 的 `splitEcho` 与 `stageEchoReward`、`game/data/quality` 的
 *     `frameQualityForStage`、`game/data/season` 的 `starsText`、`game/ui/victoryLayout`)
 *     与 Web 侧经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),
 *     于是「40% 永久 / 60% 本日」「关卡框品质映射」「★/☆ 字形」这几条规则不可能出现两份抄本;
 *  2. **断言按门控变量分档**:几何只吃 `h` 与「星数 + 双倍态」两个入参;文案只吃「通关 payload
 *     的会话态投影」;写入意图只吃「双倍取数 + 是否已领」—— 没有随机源也没有 `Date.now()`,
 *     所以两档屏高 × 四格星数 × 两格双倍都是可复现的;
 *  3. **视图无关**:本文件只吃 cc-free 的 `VictoryModel.ts` 与共享层纯布局;`VictoryView.ts`
 *     与 `GameShell.ts` / `ViewTable.ts` 那三侧 import 了 `cc`,node 不能直载,故只读源码文本。
 *
 * 本屏的几何重点是**两族锚线 + 一族随字宽的前置贴图**:
 *  - `anchorY = h × 0.3` 一族(横幅 / 立绘 / 标题 / 关卡行 / 星数行 / 首通行 / 三行奖励 /
 *    掉落 / 名次 / 关卡框,共十一处基线)与 `h − 116` / `h − 62` 一族(两枚贴底钮);
 *  - 于是两档设计高之间**锚线族整体平移 Δh × 0.3 = 75px、贴底族整体平移 Δh = 250px**,
 *    两族之间的空档一起伸缩,没有任何随屏高摊开的行区(本屏一次都不调 `spreadRows`);
 *  - 三枚奖励行图标与关卡框的横向位置**随文案量宽走**(Web 的 `measureText`),本层把
 *    「行锚 + 边长 + 间距」与「量宽 → 矩形」分成两个出口,于是这两处几何在单测里是纯函数。
 *
 * 另锁本屏照抄的 Web 口径(只列不改):双倍取数的那句 `||` 回落、领取后 `pointsEarnedThisRun`
 * 被 `settleEcho` 改写、关卡框行被 `drawAvatarFrame` 泄漏成金色 12px 粗体左起笔、
 * 星数行只在**第一枚**贴图缺失时才退成 ★/☆ 文本、本屏只有两枚热区且唯一非广告出口是底部条。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { ECHO_RETAIN_RATE, splitEcho, stageEchoReward } from "@game/data/stages";
import { frameQualityForStage } from "@game/data/quality";
import { starsText } from "@game/data/season";
import { fs as FS, theme } from "@game/ui/theme";
import {
  VI_ANCHOR_RATIO,
  VI_BADGE_PX,
  VI_BANNER_DX,
  VI_BANNER_DY,
  VI_BANNER_H,
  VI_BANNER_W,
  VI_BTN_STROKE_W,
  VI_DOUBLE_DX,
  VI_DOUBLE_H,
  VI_DOUBLE_PX,
  VI_DOUBLE_TEXT_DY,
  VI_DOUBLE_UP,
  VI_DOUBLE_W,
  VI_DROP_DY,
  VI_DROP_PX,
  VI_ECHO_DY,
  VI_ECHO_ICON_DY,
  VI_ECHO_PX,
  VI_FIRST_DY,
  VI_FIRST_PX,
  VI_FRAME_BADGE_DY,
  VI_FRAME_BADGE_GAP,
  VI_FRAME_BADGE_SIZE,
  VI_FRAME_BADGE_TEXT_DY,
  VI_FRAME_DY,
  VI_FRAME_LEAK_PX,
  VI_FRAME_PX,
  VI_LEAD_ICON_GAP,
  VI_LEAD_ICON_SIZE,
  VI_MENU_DX,
  VI_MENU_H,
  VI_MENU_PX,
  VI_MENU_TEXT_DY,
  VI_MENU_UP,
  VI_MENU_W,
  VI_POSE_DX,
  VI_POSE_DY,
  VI_POSE_H,
  VI_POSE_W,
  VI_RANK_DY,
  VI_RANK_PX,
  VI_STAGE_DY,
  VI_STAGE_PX,
  VI_STARDUST_DY,
  VI_STARDUST_ICON_DY,
  VI_STARDUST_PX,
  VI_STAR_DY,
  VI_STAR_GAP,
  VI_STAR_MAX,
  VI_STAR_SIZE,
  VI_STAR_TEXT_PX,
  VI_STAR_TOP_NUDGE,
  VI_TICKET_DY,
  VI_TICKET_ICON_DY,
  VI_TICKET_PX,
  VI_TITLE_PX,
  victoryBadgeRect,
  victoryDoubleBtn,
  victoryIconRect,
  victoryLayout,
  victoryMenuBtn,
  victoryScreenLayout,
  victoryStarSlots,
  victoryStarTop,
  type ViRect,
  type VictoryLayout,
} from "@game/ui/victoryLayout";

/* ---------- Cocos 宿主侧的被测件(cc-free) ---------- */
import {
  buildVictoryContent,
  hitVictory,
  victoryEchoClaim,
  victoryEchoTotal,
  victoryForms,
  victoryFrameBadgeKey,
  type VictoryRunView,
} from "../cocos-prototype/assets/scripts/victory/VictoryModel";
import * as cocosVictoryLayout from "../cocos-prototype/assets/scripts/game/ui/victoryLayout";
import * as cocosStagesData from "../cocos-prototype/assets/scripts/game/data/stages";
import * as cocosQualityData from "../cocos-prototype/assets/scripts/game/data/quality";
import * as cocosSeasonData from "../cocos-prototype/assets/scripts/game/data/season";

/* ==================== 夹具 ==================== */

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = 14;
const BAND = W - PAD * 2;

/** 一份「三关、3 星、首通、有掉落、有券有回响有星尘、没解锁框、没名次」的通关 payload */
function run(over: Partial<VictoryRunView> = {}): VictoryRunView {
  return {
    stage: { id: 3, name: "熔核回廊" },
    stars: 3,
    reward: { tickets: 10, points: 88, stardust: 4 },
    drops: 2,
    firstClearBonus: true,
    frameUnlocked: null,
    rankImprovedTo: null,
    pointsEarnedThisRun: 88,
    doubleClaimed: false,
    ...over,
  };
}

function laid(h: number, r: VictoryRunView = run()): VictoryLayout {
  return victoryLayout(W, h, victoryForms(r));
}

/** 一帧几何 + 一屏文案(两个位由 payload 折出,与宿主同一条口) */
function screen(r: VictoryRunView = run(), h: number = H_STD) {
  const L = laid(h, r);
  return { L, c: buildVictoryContent(r, L) };
}

const center = (rect: ViRect): number => rect.x + rect.w / 2;
const bottom = (rect: ViRect): number => rect.y + rect.h;
const mid = (rect: ViRect): [number, number] => [rect.x + rect.w / 2, rect.y + rect.h / 2];

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
  const src = fileSource("../cocos-prototype/assets/scripts/core/ViewTable.ts");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(\w+):\s*"([^"]*)",\s*$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web drawVictory 的源码段(3746-3849 一体) */
function webDrawVictory(): string {
  const web = webSource();
  return web.slice(web.indexOf("private drawVictory("), web.indexOf("private drawSeason("));
}

/** Web handleTap 的 victory 分支(含两支命中的先后) */
function webVictoryTap(): string {
  const web = webSource();
  return web.slice(web.indexOf('if (this.state === "victory") {'), web.indexOf('if (this.state === "gameover") {'));
}

/* ==================== 0. 端间同一实现 ==================== */

describe("端间共读同一份共享层", () => {
  it("victoryLayout 与 stages / quality / season 四个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosVictoryLayout.victoryLayout).toBe(victoryLayout);
    expect(cocosVictoryLayout.victoryStarSlots).toBe(victoryStarSlots);
    expect(cocosStagesData.splitEcho).toBe(splitEcho);
    expect(cocosStagesData.stageEchoReward).toBe(stageEchoReward);
    expect(cocosQualityData.frameQualityForStage).toBe(frameQualityForStage);
    expect(cocosSeasonData.starsText).toBe(starsText);
  });

  it("本屏用到的四条规则都没有宿主侧抄本:比例 / 关卡公式 / 品质映射 / 星字形都不在模型里", () => {
    const model = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryModel.ts"));
    expect(model.includes("0.4")).toBe(false);
    expect(model.includes("ECHO_RETAIN_RATE")).toBe(false);
    expect(model.includes("Math.pow")).toBe(false);
    expect(model.includes("STAGE_FRAME_QUALITY")).toBe(false);
    expect(model.includes('"★"')).toBe(false);
    expect(model.includes("stageEchoReward(")).toBe(true);
    expect(model.includes("frameQualityForStage(")).toBe(true);
    expect(model.includes("starsText(")).toBe(true);
  });

  it("模型没有随机源、不取时间、不碰存档与 DOM:纯输入输出", () => {
    const model = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryModel.ts"));
    for (const bad of ["Math.random", "Date.now", "localStorage", "writeSave", "persist(", "document", "canvas"]) {
      expect(model.includes(bad), bad).toBe(false);
    }
    // 同一份入参永远同一屏(逐字段深比较,连对象身份都稳定)
    const r = run();
    const L = laid(H_STD, r);
    expect(buildVictoryContent(r, L)).toEqual(buildVictoryContent(r, L));
  });

  it("通关账目不在本屏:模型与视图里都不出现星数判据、成长倍率与掉落表", () => {
    const model = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryModel.ts"));
    const view = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts"));
    for (const seg of [model, view]) {
      for (const bad of ["calcStars", "CLEAR_REWARD_GROWTH", "FIRST_CLEAR", "stageDropCount", "generateEquipment", "DUPLICATE_STARDUST", "settleThreeStarOnce", "highestStage"]) {
        expect(seg.includes(bad), bad).toBe(false);
      }
    }
    // 战斗层才是那笔账的唯一事实源,并且它把结果一次性抛给宿主
    const sim = codeOf(fileSource("../cocos-prototype/assets/scripts/battle/BattleSim.ts"));
    const vseg = sim.slice(sim.indexOf("private victory(): void"), sim.indexOf("private recordEquipment("));
    expect(vseg.includes("this.cb.onVictory(")).toBe(true);
    expect(vseg.includes("this.world.over = true;")).toBe(true);
    expect(vseg.includes("this.pointsEarnedThisRun = echo;")).toBe(true);
    expect(vseg.includes("this.persist();")).toBe(true);
    expect(vseg.includes("doubleClaimed")).toBe(false);
  });
});

/* ==================== 1. 几何矩阵:两档屏高 × 四格星数 × 两格双倍 ==================== */

describe("屏级矩形(与 Web drawVictory 的内联字面量逐位对应)", () => {
  it("996 档逐项同 Web:a = 298.8,横幅 {160,264.8,240,48},立绘 {412,254.8,58,92}(挂在屏心右侧)", () => {
    const L = laid(H_STD);
    expect(L.anchorY).toBeCloseTo(298.8, 6);
    expect(L.banner).toEqual({ x: 160, y: 264.8, w: 240, h: 48 });
    expect(L.pose).toEqual({ x: 412, y: 254.8, w: 58, h: 92 });
    expect(Math.abs(L.banner.y - (H_STD * 0.3 - 34))).toBeLessThan(1e-9);
    expect(Math.abs(L.pose.x - (W / 2 + 132))).toBeLessThan(1e-9);
    // 立绘在横幅右外侧,两档屏高下都不相交
    expect(L.pose.x).toBeGreaterThan(L.banner.x + L.banner.w);
  });

  it("996 档两枚贴底钮:双倍 {185,880,190,34}、返回 {185,934,190,44},底边分别落 h−82 与 h−18", () => {
    const L = laid(H_STD);
    expect(L.doubleBtn).toEqual({ x: 185, y: 880, w: 190, h: 34 });
    expect(L.menuBtn).toEqual({ x: 185, y: 934, w: 190, h: 44 });
    expect(L.doubleBottomGap).toBe(82);
    expect(L.menuBottomGap).toBe(18);
    // Web 命中区写的是 y ∈ [h−62, h−18],与绘制框逐位同一
    expect(L.menuBtn.y).toBe(H_STD - 62);
    expect(bottom(L.menuBtn)).toBe(H_STD - 18);
    expect(L.doubleBtn.x).toBe(L.menuBtn.x);
    expect(L.doubleBtn.w).toBe(L.menuBtn.w);
  });

  it("星数行:3 枚 {241|269|297,338.8,22,22} 整行居中,步进 28、总宽 78", () => {
    const L = screen(run(), H_STD).L;
    expect(L.starSlots.map((s) => s.x)).toEqual([241, 269, 297]);
    expect(L.starSlots[0].y).toBeCloseTo(338.8, 6);
    expect(L.starSlots.every((s) => s.w === 22 && s.h === 22)).toBe(true);
    expect(L.starStep).toBe(28);
    expect(L.starRowW).toBe(78);
    expect(center({ x: 241, y: 0, w: 78, h: 0 })).toBe(W / 2);
    expect(L.starSlots.length).toBe(3);
  });

  it("星数行枚数就是星数:0 枚给空表,1 枚与 2 枚都整行居中(随内容变的唯一一族)", () => {
    for (const n of [0, 1, 2, 3]) {
      const L = screen(run({ stars: n }), H_STD).L;
      expect(L.starSlots.length).toBe(n);
      expect(L.stars).toBe(n);
      if (n > 0) {
        const rowX0 = L.starSlots[0].x;
        const rowXn = L.starSlots[n - 1].x + VI_STAR_SIZE;
        expect(rowX0 + rowXn).toBeCloseTo(W, 6);
        expect(L.starRowW).toBe(n * 28 - 6);
      } else {
        expect(L.starRowW).toBe(0);
      }
    }
    // 负数与超上限的星数都先落地为整数(Web 的循环按 victoryStars 走,calcStars 只会给 1~3)
    expect(screen(run({ stars: -2 }), H_STD).L.starSlots).toEqual([]);
    expect(victoryStarSlots(W, H_STD, 2.9).length).toBe(2);
  });

  it("基线族:标题 a、关卡 a+34、星数文本 a+58、首通 a+78、三行奖励 a+104/126/148、掉落 a+170、名次 a+192、框 a+210", () => {
    const L = laid(H_STD);
    const a = H_STD * VI_ANCHOR_RATIO;
    expect([L.title.baseY, L.stageLine.baseY, L.starText.baseY, L.firstLine.baseY]).toEqual([a, a + 34, a + 58, a + 78]);
    expect([L.ticketLine.baseY, L.echoLine.baseY, L.stardustLine.baseY]).toEqual([a + 104, a + 126, a + 148]);
    expect([L.dropLine.baseY, L.rankLine.baseY, L.frameLineFlat.baseY, L.frameLineLeaked.baseY]).toEqual([a + 170, a + 192, a + 210, a + 210]);
    // 图标顶缘恒比本行基线高 12(三行同一节奏)
    expect([L.ticketIcon.y, L.echoIcon.y, L.stardustIcon.y]).toEqual([a + 92, a + 114, a + 136]);
    expect(L.frameBadge.y).toBeCloseTo(a + 204, 6);
    expect(L.starSlots[0].y).toBeCloseTo(a + 58 - 22 + 4, 6);
  });

  it("两枚钮内文字基线是裸偏移:双倍 dbl.y+22、返回 h−34(= btn.y+28)", () => {
    const L = laid(H_STD);
    expect(L.doubleText.baseY).toBeCloseTo(880 + 22, 6);
    expect(L.menuText.baseY).toBe(H_STD - 34);
    expect(L.menuText.baseY).toBeCloseTo(L.menuBtn.y + 28, 6);
    expect(L.doubleText.x).toBe(center(L.doubleBtn));
    expect(L.menuText.x).toBe(center(L.menuBtn));
  });

  it("字号是 Web 的字面量档 28 / 16×5 / 20 / 15 / 12,其中 20 与 15 两档不在 fs 表里", () => {
    const L = laid(H_STD);
    const px = [L.title.px, L.stageLine.px, L.starText.px, L.firstLine.px, L.ticketLine.px, L.echoLine.px, L.stardustLine.px, L.dropLine.px, L.rankLine.px, L.frameLineFlat.px, L.frameLineLeaked.px, L.menuText.px, L.doubleText.px];
    expect(px.join(",")).toBe("28,16,20,16,16,16,16,16,15,16,12,15,15");
    const table = Object.values(FS) as number[];
    expect(table).not.toContain(20);
    expect(table).not.toContain(15);
    expect(table).toContain(28);
    expect(table).toContain(16);
    expect(VI_FRAME_LEAK_PX).toBe(FS.micro);
    expect(VI_BADGE_PX).toBe(FS.micro);
    expect(VI_TITLE_PX).toBe(FS.display);
  });

  it("居中文字限宽收成整屏带宽;唯一例外是被泄漏成左起笔的那一档(带宽只给到右半屏)", () => {
    const L = laid(H_STD);
    const lines = [L.title, L.stageLine, L.starText, L.firstLine, L.ticketLine, L.echoLine, L.stardustLine, L.dropLine, L.rankLine, L.frameLineFlat, L.doubleText, L.menuText];
    for (const t of lines) {
      expect(t.maxW, t.px + "@" + t.baseY).toBe(BAND);
      expect(t.align).toBe("center");
    }
    expect(L.frameLineLeaked.maxW).toBe(W - W / 2);
    expect(L.frameLineLeaked.align).toBe("left");
    expect(L.frameLineLeaked.bold).toBe(true);
    expect(L.frameLineLeaked.x).toBe(W / 2);
    expect(L.starText.bold).toBe(true);
  });

  it("两档 × 四格星数 × 两格双倍:双倍态不改变任何矩形,星数只改变星数行那一族", () => {
    for (const h of [H_STD, H_TALL]) {
      const base = laid(h, run());
      for (const claimed of [false, true]) {
        const L = laid(h, run({ doubleClaimed: claimed }));
        expect(JSON.stringify(L), "doubleClaimed=" + claimed + " @ " + h).toBe(JSON.stringify({ ...base, canDouble: !claimed }));
      }
      for (const n of [0, 1, 2, 3]) {
        const L = laid(h, run({ stars: n }));
        // 星数只改变星数行那一族;把这一族挖掉后,整帧几何必须与基准逐位相同
        const mask = (x: VictoryLayout) => JSON.stringify({ ...x, starSlots: null, starRowW: null, stars: null });
        expect(mask(L), "stars=" + n + " 非星数族 @ " + h).toBe(mask(base));
      }
    }
  });

  it("两档之间:锚线族整体平移 Δh × 0.3 = 75px,贴底族整体平移 Δh = 250px", () => {
    const A = laid(H_STD);
    const B = laid(H_TALL);
    const dh = H_TALL - H_STD;
    for (const key of ["banner", "pose", "doubleBtn", "menuBtn"] as const) {
      const dy = B[key].y - A[key].y;
      expect(dy, key + " Δy").toBeCloseTo(key === "doubleBtn" || key === "menuBtn" ? dh : dh * VI_ANCHOR_RATIO, 6);
      expect(B[key].x).toBe(A[key].x);
      expect(B[key].w).toBe(A[key].w);
      expect(B[key].h).toBe(A[key].h);
    }
    expect(B.anchorY - A.anchorY).toBeCloseTo(dh * VI_ANCHOR_RATIO, 6);
    for (const line of ["stageLine", "starText", "firstLine", "ticketLine", "echoLine", "stardustLine", "dropLine", "rankLine", "frameLineFlat"] as const) {
      expect(B[line].baseY - A[line].baseY, line).toBeCloseTo(dh * VI_ANCHOR_RATIO, 6);
    }
    expect(B.menuText.baseY - A.menuText.baseY).toBe(dh);
    expect(B.doubleText.baseY - A.doubleText.baseY).toBe(dh);
    // 两族之间的空档一起伸缩:关卡框行到双倍钮顶
    expect(B.doubleBtn.y - B.frameLineFlat.baseY - (A.doubleBtn.y - A.frameLineFlat.baseY)).toBeCloseTo(dh * (1 - VI_ANCHOR_RATIO), 6);
  });

  it("1246 档两枚贴底钮底边仍落 h−82 与 h−18,屏内不越界", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h);
      expect(bottom(L.doubleBtn)).toBe(h - 82);
      expect(bottom(L.menuBtn)).toBe(h - 18);
      expect(bottom(L.menuBtn)).toBeLessThan(h);
      for (const rect of [L.banner, L.pose, L.doubleBtn, L.menuBtn, ...L.starSlots]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(W);
      }
      // 横向全部与屏高无关
      expect(L.pose.x).toBe(412);
      expect(L.banner.x).toBe(160);
    }
    expect(victoryDoubleBtn(W, H_TALL)).toEqual({ x: 185, y: 1130, w: 190, h: 34 });
    expect(victoryMenuBtn(W, H_TALL)).toEqual({ x: 185, y: 1184, w: 190, h: 44 });
    expect(laid(H_TALL).frameLineFlat.baseY).toBeCloseTo(583.8, 6);
  });

  it("两枚热区两两不重叠,且与整屏文字行都不相交(双倍底 914 → 返回顶 934 留 20px 缝)", () => {
    const L = laid(H_STD);
    const rects = [L.doubleBtn, L.menuBtn];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, "重叠").toBe(false);
      }
    }
    expect(L.menuBtn.y - bottom(L.doubleBtn)).toBeCloseTo(20, 6);
    expect(L.menuBtn.y).toBeGreaterThan(bottom(L.doubleBtn));
    expect(L.frameLineFlat.baseY).toBeLessThan(L.doubleBtn.y);
  });

  it("跟随字宽的前置贴图:图标是左上角锚 − 量宽/2 − 20,关卡框是框心锚 − 量宽/2 − 18 再退半边", () => {
    const L = laid(H_STD);
    expect(victoryIconRect(L.ticketIcon, 60)).toEqual({ x: 280 - 30 - 20, y: L.ticketIcon.y, w: 14, h: 14 });
    expect(victoryIconRect(L.echoIcon, 100)).toEqual({ x: 280 - 50 - 20, y: L.echoIcon.y, w: 14, h: 14 });
    expect(victoryIconRect(L.stardustIcon, 0)).toEqual({ x: 280 - 20, y: L.stardustIcon.y, w: 14, h: 14 });
    const badge = victoryBadgeRect(L.frameBadge, 100);
    expect(badge).toEqual({ x: 280 - 50 - 18 - 11, y: L.frameBadge.y - 11, w: 22, h: 22 });
    // Web 的那个 18 量在「文字左缘 ←→ 框心」之间(不是框右缘),所以框右缘会再往里收半个边长
    expect(badge.x + badge.w / 2).toBeCloseTo(280 - 100 / 2 - VI_FRAME_BADGE_GAP, 6);
    // 图标左上角 x = 文字左缘 − 20(Web 的 `w/2 - tw/2 - 20` 就是 draw 的左上角实参),且随量宽单调左移
    const t120 = victoryIconRect(L.ticketIcon, 120);
    expect(t120.x).toBeCloseTo(280 - 120 / 2 - VI_LEAD_ICON_GAP, 6);
    expect(t120.x).toBeLessThan(victoryIconRect(L.ticketIcon, 60).x);
    expect(t120.y).toBe(L.ticketLine.baseY - 12);
    expect(L.badgeTextDy).toBe(4);
  });

  it("单一出口:screenLayout 与 layout 同数;描边宽与星数上限留在共享层", () => {
    expect(victoryScreenLayout(W, H_STD, victoryForms(run()))).toEqual(victoryLayout(W, H_STD, victoryForms(run())));
    expect(VI_BTN_STROKE_W).toBe(1);
    expect(VI_STAR_MAX).toBe(3);
    expect(victoryStarTop(H_STD)).toBeCloseTo(H_STD * 0.3 + 58 - 22 + 4, 6);
    // Web 本屏一次都不设 lineWidth,也不动 globalAlpha(与死亡屏那枚半透明立绘不同)
    const seg = webDrawVictory();
    expect(seg.includes("lineWidth")).toBe(false);
    expect(seg.includes("globalAlpha")).toBe(false);
  });

  it("共享层不引 cc、不读存档、不查关卡:本层只有一个 import(theme)", () => {
    const src = codeOf(fileSource("../cocos-prototype/assets/scripts/game/ui/victoryLayout.ts"));
    expect(src.includes('from "cc"')).toBe(false);
    expect(src.includes("save.")).toBe(false);
    expect(src.includes("localStorage")).toBe(false);
    expect(src.includes("STAGES")).toBe(false);
    expect((src.match(/^import .+$/gm) ?? []).length).toBe(1);
  });
});

/* ==================== 1b. 共享层常量逐项(与 Web 内联字面量比对) ==================== */

describe("共享层几何常量逐项", () => {
  it("锚线 / 横幅 / 立绘 / 星数 / 三行奖励 / 两枚钮的每个偏移与字号都与 Web 同数", () => {
    expect([VI_ANCHOR_RATIO, VI_BANNER_DX, VI_BANNER_W, VI_BANNER_H, VI_BANNER_DY]).toEqual([0.3, 120, 240, 48, 34]);
    expect([VI_POSE_DX, VI_POSE_W, VI_POSE_H, VI_POSE_DY]).toEqual([132, 58, 92, 44]);
    expect([VI_STAGE_DY, VI_STAGE_PX]).toEqual([34, 16]);
    expect([VI_STAR_SIZE, VI_STAR_GAP, VI_STAR_DY, VI_STAR_TOP_NUDGE, VI_STAR_TEXT_PX]).toEqual([22, 6, 58, 4, 20]);
    expect([VI_FIRST_DY, VI_FIRST_PX]).toEqual([78, 16]);
    expect([VI_TICKET_ICON_DY, VI_TICKET_DY, VI_TICKET_PX]).toEqual([92, 104, 16]);
    expect([VI_ECHO_ICON_DY, VI_ECHO_DY, VI_ECHO_PX]).toEqual([114, 126, 16]);
    expect([VI_STARDUST_ICON_DY, VI_STARDUST_DY, VI_STARDUST_PX]).toEqual([136, 148, 16]);
    expect([VI_LEAD_ICON_SIZE, VI_LEAD_ICON_GAP]).toEqual([14, 20]);
    expect([VI_DROP_DY, VI_DROP_PX]).toEqual([170, 16]);
    expect([VI_RANK_DY, VI_RANK_PX]).toEqual([192, 15]);
    expect([VI_FRAME_DY, VI_FRAME_BADGE_DY, VI_FRAME_BADGE_SIZE, VI_FRAME_BADGE_GAP, VI_FRAME_BADGE_TEXT_DY]).toEqual([210, 204, 22, 18, 4]);
    expect([VI_FRAME_PX, VI_FRAME_LEAK_PX]).toEqual([16, 12]);
    expect([VI_DOUBLE_DX, VI_DOUBLE_W, VI_DOUBLE_H, VI_DOUBLE_UP, VI_DOUBLE_TEXT_DY, VI_DOUBLE_PX]).toEqual([95, 190, 34, 116, 22, 15]);
    expect([VI_MENU_DX, VI_MENU_W, VI_MENU_H, VI_MENU_UP, VI_MENU_TEXT_DY, VI_MENU_PX]).toEqual([95, 190, 44, 62, 28, 15]);
    expect([VI_TITLE_PX]).toEqual([28]);
    const web = webDrawVictory();
    for (const lit of [
      "h * 0.3",
      'assets.draw(g, "banner_large_navy_a", w / 2 - 120, h * 0.3 - 34, 240, 48)',
      'assets.draw(g, "player_pose_1", w / 2 + 132, h * 0.3 - 44, 58, 92)',
      '"通关!", w / 2, h * 0.3',
      "h * 0.3 + 34",
      "const size = 22;",
      "const step = size + 6;",
      "this.victoryStars * step - 6",
      "w / 2 - totalW / 2 + i * step, h * 0.3 + 58 - size + 4, size, size",
      "starsText(this.victoryStars), w / 2, h * 0.3 + 58",
      '每日首通!奖励 ×2 / 回响 ×1.5", w / 2, h * 0.3 + 78',
      "h * 0.3 + 92",
      "h * 0.3 + 104",
      "h * 0.3 + 114",
      "h * 0.3 + 126",
      "h * 0.3 + 136",
      "h * 0.3 + 148",
      "h * 0.3 + 170",
      "h * 0.3 + 192",
      "h * 0.3 + 204",
      "h * 0.3 + 210",
      "{ x: w / 2 - 95, y: h - 116, w: 190, h: 34 }",
      "btn_minor", "w / 2 - 95, h - 62, 190, 44, 10",
      "dbl.y + 22",
      '"返回菜单 (R)", w / 2, h - 34',
    ]) {
      expect(web.includes(lit), lit).toBe(true);
    }
  });

  it("三枚前置图标与关卡框的间距实参就是 Web 那两笔的裸字面量(20 与 18)", () => {
    const web = webDrawVictory();
    expect((web.match(/g\.measureText\(\w+\)\.width \/ 2 - 20/g) ?? []).length).toBe(3);
    expect(web.includes("g.measureText(fTxt).width / 2 - 18")).toBe(true);
    expect(web.includes("drawAvatarFrame(g, this.assets, this.frameUnlockedThisRun,")).toBe(true);
  });
});

/* ==================== 2. 命中面:两枚热区 + 区外吞掉 ==================== */

describe("命中判定(对标 Web handleTap 的 victory 两支与先后)", () => {
  const L = laid(H_STD);

  it("两枚热区各归其主:双倍与返回菜单", () => {
    expect(hitVictory(L, ...mid(L.doubleBtn))).toEqual({ kind: "double" });
    expect(hitVictory(L, ...mid(L.menuBtn))).toEqual({ kind: "menu" });
  });

  it("每枚热区四条边都是闭区间(压边命中、外 1px 不命中)", () => {
    for (const rect of [L.doubleBtn, L.menuBtn]) {
      expect(hitVictory(L, rect.x, rect.y)).toBeTruthy();
      expect(hitVictory(L, rect.x + rect.w, rect.y + rect.h)).toBeTruthy();
      expect(hitVictory(L, rect.x - 1, rect.y - 1)).toBeFalsy();
      expect(hitVictory(L, rect.x + rect.w + 1, rect.y + rect.h + 1)).toBeFalsy();
    }
  });

  it("区外一律吞掉:标题 / 星数行 / 三行奖励 / 钮缝 / 底部条之下 / 屏角 / 屏外", () => {
    const outside: Array<[number, number]> = [
      [280, 298.8], // 标题基线(通关!)
      [412, 254.8], // 立绘左上角
      [241, 338.8], // 第一枚星数图标
      [280, 402.8], // 券行
      [280, 424.8], // 回响行
      [280, 446.8], // 星尘行
      [280, 468.8], // 掉落行
      [280, 490.8], // 名次提示
      [280, 508.8], // 关卡框行
      [280, 879], // 双倍钮上缘外 1px
      [184, 897], // 双倍钮左缘外 1px
      [280, 924], // 两枚钮之间那 20px 缝
      [280, 979], // 底部条下缘外 1px
      [5, 5], // 左上角
      [W - 1, H_STD - 1], // 右下角
      [W / 2, H_STD + 40], // 屏外
    ];
    for (const [x, y] of outside) expect(hitVictory(L, x, y), x + "," + y).toBe(null);
  });

  it("双倍已领时那一片不再是热区,而返回钮与领取态无关(Web 的 !doubleClaimed 前置)", () => {
    const off = laid(H_STD, run({ doubleClaimed: true }));
    expect(off.canDouble).toBe(false);
    expect(hitVictory(off, ...mid(off.doubleBtn))).toBe(null);
    expect(hitVictory(off, ...mid(off.menuBtn))).toEqual({ kind: "menu" });
    // 矩形本身不因领取而变
    expect(off.doubleBtn).toEqual(L.doubleBtn);
  });

  it("热区层读的是几何里的双倍位,与内容层给的是同一份判据", () => {
    const r = run({ doubleClaimed: true });
    const forms = victoryForms(r);
    expect(forms.canDouble).toBe(false);
    const L2 = laid(H_STD, r);
    expect(hitVictory(L2, ...mid(L2.doubleBtn))).toBe(null);
    expect(buildVictoryContent(r, L2).canDouble).toBe(false);
    expect(buildVictoryContent(r, L2).doubleText).toBe("已领双倍");
  });

  it("星数不参与命中:0 星与 3 星的两帧几何里热区逐位相同", () => {
    const a = laid(H_STD, run({ stars: 0 }));
    const b = laid(H_STD, run({ stars: 3 }));
    expect(a.doubleBtn).toEqual(b.doubleBtn);
    expect(a.menuBtn).toEqual(b.menuBtn);
    expect(hitVictory(a, ...mid(a.menuBtn))).toEqual(hitVictory(b, ...mid(b.menuBtn)));
  });
});

/* ==================== 3. 文案逐字(与 Web drawVictory 的 fillText 实参比对) ==================== */

describe("屏级文案逐字", () => {
  it("标题 / 关卡行 / 三行奖励 / 掉落 / 名次 / 关卡框 / 两枚钮的字面量与 Web 完全一致", () => {
    const { c } = screen(run({ rankImprovedTo: 2, frameUnlocked: 3 }));
    expect(c.title).toBe("通关!");
    expect(c.stageLine).toBe("第3关 · 熔核回廊");
    expect(c.starText).toBe("★★★");
    expect(c.firstClearText).toBe("每日首通!奖励 ×2 / 回响 ×1.5");
    expect(c.ticketText).toBe("扭蛋券 +10");
    expect(c.echoText).toBe("回响点数 +88");
    expect(c.stardustText).toBe("星尘 +4");
    expect(c.dropText).toBe("掉落装备 ×2(已入收藏 · 提供基础数值)");
    expect(c.rankText).toBe("已超越幻影第 2 名");
    expect(c.frameText).toBe("解锁关卡框 · 第 3 关");
    expect(c.doubleText).toBe("广告 ×2 回响");
    expect(c.menuText).toBe("返回菜单 (R)");
    const web = webDrawVictory();
    for (const lit of ['"通关!"', "第${st.id}关 · ${st.name}", "每日首通!奖励 ×2 / 回响 ×1.5", "扭蛋券 +${r.tickets}", "回响点数 +${r.points}", "星尘 +${r.stardust}", "掉落装备 ×${this.stageDrops}(已入收藏 · 提供基础数值)", "已超越幻影第 ${this.rankImprovedTo} 名", "解锁关卡框 · 第 ${this.frameUnlockedThisRun} 关", '"广告 ×2 回响"', '"已领双倍"', '"返回菜单 (R)"']) {
      expect(web.includes(lit), lit).toBe(true);
    }
  });

  it("无尽局(currentStage 为 null):关卡行整棵收起,其余十处照落", () => {
    const { c, L } = screen(run({ stage: null }));
    expect(c.hasStage).toBe(false);
    expect(c.stageLine).toBe("");
    expect(L.stageLine.baseY).toBeCloseTo(H_STD * 0.3 + 34, 6);
    expect(c.hasStars && c.hasReward && c.hasDrops && c.hasFirstClear).toBe(true);
    const web = webDrawVictory();
    expect(web.includes("if (st) {")).toBe(true);
  });

  it("八个 has* 位逐一对应 Web 的八个 if:0 星 / 无 payload / 0 星尘 / 全重复掉落 / 无名次 / 无新框", () => {
    expect(screen(run({ stars: 0 })).c.hasStars).toBe(false);
    const empty = screen(run({ reward: null, drops: 0, firstClearBonus: false, stars: 0 }));
    expect([empty.c.hasReward, empty.c.hasDrops, empty.c.hasFirstClear, empty.c.hasStardust]).toEqual([false, false, false, false]);
    expect([empty.c.ticketText, empty.c.echoText, empty.c.stardustText, empty.c.dropText]).toEqual(["", "", "", ""]);
    expect(screen(run({ reward: { tickets: 5, points: 20, stardust: 0 } })).c.hasStardust).toBe(false);
    expect(screen(run({ reward: { tickets: 5, points: 20, stardust: 1 } })).c.hasStardust).toBe(true);
    expect(screen(run({ rankImprovedTo: null })).c.hasRank).toBe(false);
    expect(screen(run({ frameUnlocked: null })).c.hasFrame).toBe(false);
    const web = webDrawVictory();
    for (const guard of ["if (this.victoryStars > 0)", "if (this.firstClearBonus)", "if (r) {", "if (r.stardust > 0)", "if (this.stageDrops > 0)", "if (this.rankImprovedTo != null)", "if (this.frameUnlockedThisRun != null)"]) {
      expect(web.includes(guard), guard).toBe(true);
    }
  });

  it("名次提示 0 也要出(Web 判的是 != null,不是真值)", () => {
    const zero = screen(run({ rankImprovedTo: 0 }));
    expect(zero.c.hasRank).toBe(true);
    expect(zero.c.rankText).toBe("已超越幻影第 0 名");
  });

  it("全重复掉落那一局掉落行为空,但星尘已折进存档(屏上只读 payload 里的件数)", () => {
    expect(screen(run({ drops: 0 })).c.hasDrops).toBe(false);
    expect(screen(run({ drops: 14 })).c.dropText).toBe("掉落装备 ×14(已入收藏 · 提供基础数值)");
  });

  it("关卡框贴图键走 frameQualityForStage 同一映射,框心数字就是关卡号", () => {
    expect(victoryFrameBadgeKey(1)).toBe(`avatar_${frameQualityForStage(1)}`);
    expect(victoryFrameBadgeKey(2)).toBe("avatar_common");
    expect(victoryFrameBadgeKey(3)).toBe("avatar_rare");
    expect(victoryFrameBadgeKey(5)).toBe("avatar_epic");
    expect(victoryFrameBadgeKey(6)).toBe("avatar_legendary");
    expect(victoryFrameBadgeKey(7)).toBe("avatar_hidden");
    const f = screen(run({ frameUnlocked: 3 }));
    expect(f.c.frameBadgeKey).toBe("avatar_rare");
    expect(f.c.frameBadgeText).toBe("3");
    expect(screen(run({ frameUnlocked: 7 })).c.frameBadgeKey).toBe("avatar_hidden");
    // 没有新框时两格都空,视图那一支整棵不起
    const none = screen(run({ frameUnlocked: null }));
    expect([none.c.hasFrame, none.c.frameBadgeKey, none.c.frameBadgeText]).toEqual([false, "", ""]);
  });

  it("★/☆ 替代字形走 starsText,与星数行的贴图档互斥由视图判(本层只两档都给)", () => {
    for (const n of [0, 1, 2, 3]) {
      expect(screen(run({ stars: n })).c.starText).toBe(starsText(n));
    }
    expect(screen(run({ stars: 2 })).c.starText).toBe("★★☆");
    expect(webDrawVictory().includes("if (drawn === 0) {")).toBe(true);
  });

  it("领取双倍后文案转「已领双倍」而三行读数纹丝不动(它们念的是 payload 里的 reward)", () => {
    const before = screen(run());
    const after = screen(run({ doubleClaimed: true }));
    expect(after.c.doubleText).toBe("已领双倍");
    expect(after.c.canDouble).toBe(false);
    expect(after.c.ticketText).toBe(before.c.ticketText);
    expect(after.c.echoText).toBe(before.c.echoText);
    expect(after.c.stardustText).toBe(before.c.stardustText);
    expect(after.L.doubleBtn).toEqual(before.L.doubleBtn);
  });

  it("payload 缺席(尚未通关)时屏上只有标题与两枚钮:与 Web 的 stageReward = null 同档", () => {
    const c = screen(run({ reward: null, stars: 0, drops: 0, firstClearBonus: false })).c;
    expect([c.hasReward, c.hasStars, c.hasDrops, c.hasFirstClear, c.hasRank, c.hasFrame]).toEqual([false, false, false, false, false, false]);
    expect([c.title, c.menuText, c.doubleText]).toEqual(["通关!", "返回菜单 (R)", "广告 ×2 回响"]);
  });
});

/* ==================== 4. 写入意图逐字段与 Web 对齐 ==================== */

describe("写入意图(victoryEchoTotal + victoryEchoClaim ↔ Web victory 分支)", () => {
  it("取数走 || 回落:本局回响非零时用本局,为 0 时按关卡表基础值", () => {
    expect(victoryEchoTotal(88, 3)).toBe(88);
    expect(victoryEchoTotal(0, 3)).toBe(stageEchoReward(3));
    expect(stageEchoReward(3)).toBeGreaterThan(0);
    const web = webVictoryTap();
    expect(web.includes("const echo = this.pointsEarnedThisRun || stageEchoReward(this.currentStage?.id ?? 1);")).toBe(true);
  });

  it("无尽局没有 currentStage 时回落按第 1 关(Web 的 ?? 1 纯防御)", () => {
    expect(victoryEchoTotal(0, null)).toBe(stageEchoReward(1));
    expect(victoryEchoTotal(0, null)).toBe(stageEchoReward(1));
  });

  it("翻倍那一笔就是 splitEcho 的两半:permanent 进 points、day 进 dayEcho,total 顺手写回会话态", () => {
    const claim = victoryEchoClaim(victoryEchoTotal(88, 3), false);
    const { permanent, day } = splitEcho(88);
    expect(claim).toEqual({ kind: "echo", persists: true, permanent, day, total: 88 });
    expect(permanent).toBe(Math.floor(88 * ECHO_RETAIN_RATE));
    expect(permanent + day).toBe(88);
  });

  it("0 / 负数 / 1 三种边界都仍然给意图(Web 没有 if (total > 0) 前置)", () => {
    expect(victoryEchoClaim(0, false)?.permanent).toBe(0);
    expect(victoryEchoClaim(0, false)?.day).toBe(0);
    const one = victoryEchoClaim(1, false);
    expect(one?.permanent).toBe(0);
    expect(one?.day).toBe(1);
    expect(victoryEchoClaim(-5, false)?.total).toBe(-5);
  });

  it("已领即拒:claimed 为真时没有意图(Web 的 !doubleClaimed 前置)", () => {
    expect(victoryEchoClaim(88, true)).toBe(null);
  });

  it("Web 的 victory double 支:结同一笔 + 置 doubleClaimed + 落一次盘,不换 state、不置 pendingSettle", () => {
    const tap = webVictoryTap();
    expect(tap.includes("this.settleEcho(echo);")).toBe(true);
    expect(tap.includes("this.doubleClaimed = true;")).toBe(true);
    expect(tap.includes("persistSave(this.save);")).toBe(true);
    expect(tap.includes('this.state = "')).toBe(false);
    expect(tap.includes("pendingSettle")).toBe(false);
    // settleEcho 内部那三笔(40/60 分账 + 把 total 写回 pointsEarnedThisRun)
    const web = webSource();
    const settle = web.slice(web.indexOf("private settleEcho("), web.indexOf("private settleRun("));
    expect(settle.includes("this.pointsEarnedThisRun = total;")).toBe(true);
    expect(settle.includes("this.save.points += permanent;")).toBe(true);
    expect(settle.includes("this.save.dayEcho += day;")).toBe(true);
  });

  it("通关屏的双倍与死亡屏的双倍取数不同源:通关读会话回落的 echo、死亡只读本局", () => {
    const vic = webVictoryTap();
    const go = webSource().slice(webSource().indexOf('if (this.state === "gameover") {'), webSource().indexOf('} else if (this.state === "prestige")'));
    expect(vic.includes("this.pointsEarnedThisRun || stageEchoReward")).toBe(true);
    expect(go.includes("settleEcho(this.pointsEarnedThisRun)")).toBe(true);
    expect(vic.includes("canRevive")).toBe(false);
  });
});

/* ==================== 5. 表键与 Web 源码字面量比对 ==================== */

describe("phase4 表的通关结算屏配色档(键前缀 vi)", () => {
  const t = phase4Defaults();
  const web = webDrawVictory();

  it("每一档都与 Web 那一笔字面量同值(大小写按表侧 6 位档,字面量按 Web 小写档逐字比对)", () => {
    const PAIRS: Array<[string, string]> = [
      ["viDim", "rgba(8,10,16,0.86)"],
      ["viTitle", "#ffd76a"],
      ["viStage", "#e8e8e8"],
      ["viStarText", "#ffd76a"],
      ["viFirst", "#4dffc8"],
      ["viTicket", "#4dffc8"],
      ["viEcho", "#ffd76a"],
      ["viStardust", "#c8b6ff"],
      ["viDrop", "#c8b6ff"],
      ["viRank", "#ffd76a"],
      ["viFrameText", "#c8b6ff"],
      ["viFrameBadgeText", "#ffd76a"],
      ["viDoubleBg", "#3a3320"],
      ["viDoubleClaimedBg", "#1a1f2a"],
      ["viDoubleClaimedStroke", "rgba(255,255,255,0.15)"],
      ["viDoubleTextClaimed", "#5a6a80"],
      ["viMenuFallbackBg", "#2a3d55"],
      ["viMenuFallbackStroke", "#5ac8fa"],
    ];
    for (const [key, lit] of PAIRS) {
      expect(web.includes(`"${lit}"`) || fileSource("../src/ui/skin.ts").includes(`"${lit}"`), key + " 的 Web 字面量").toBe(true);
      expect(t[key]?.toLowerCase(), key).toBe(lit.toLowerCase());
    }
  });

  it("白色与 theme.* 档:Web 写的是 `#fff` 与 theme.gold,表侧一律 6 位档", () => {
    expect(web.includes('g.fillStyle = "#fff";')).toBe(true);
    expect(t.viMenuText).toBe("#FFFFFF");
    expect(t.viTitle.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.viEcho.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.viRank.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.viDoubleText.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.viFirst.toLowerCase()).toBe(theme.actionPrimary.toLowerCase());
    expect(t.viStardust.toLowerCase()).toBe(theme.echo.toLowerCase());
    expect(t.viMenuFallbackStroke.toLowerCase()).toBe(theme.select.toLowerCase());
    // 关卡框行的两档:缺图走 theme.echo(#c8b6ff)、有图被泄漏成 theme.gold
    expect(t.viFrameText.toLowerCase()).toBe(theme.echo.toLowerCase());
    expect(t.viFrameTextGold.toLowerCase()).toBe(theme.gold.toLowerCase());
    expect(t.viDrop.toLowerCase()).toBe(theme.echo.toLowerCase());
    expect(t.viTicket.toLowerCase()).toBe(theme.actionPrimary.toLowerCase());
  });

  it("接口声明与默认值一一对应,且本屏没有任何一档走内联字面量", () => {
    const src = fileSource("../cocos-prototype/assets/scripts/core/ViewTable.ts");
    const iface = src.slice(src.indexOf("export interface Phase4Params"), src.indexOf("export const PHASE4_DEFAULTS"));
    const keys = [...src.slice(src.indexOf("/* ---------- 通关结算屏"), src.indexOf("}\n\nexport const PHASE4_DEFAULTS")).matchAll(/^\s{4}(vi\w+): string;$/gm)].map((m) => m[1]);
    expect(keys.length).toBe(22);
    for (const k of keys) {
      expect(iface.includes(k + ": string;"), k).toBe(true);
      expect(t[k], k).toBeTruthy();
    }
    const view = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts"));
    expect((view.match(/p4\.vi\w+/g) ?? []).length).toBeGreaterThan(18);
    expect(view.includes('"#')).toBe(false);
  });

  it("十枚贴图键与 Web drawVictory 的实参逐字对应", () => {
    const view = fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts");
    for (const k of [
      'const KEY_BANNER = "banner_large_navy_a";',
      'const KEY_POSE = "player_pose_1";',
      'const KEY_PRIMARY = "btn_primary";',
      'const KEY_MINOR = "btn_minor";',
      'const KEY_STAR = "icon_star_gold";',
      'const KEY_TICKET = "icon_ticket";',
      'const KEY_ECHO = "icon_echo";',
      'const KEY_STARDUST = "icon_stardust";',
    ]) {
      expect(view.includes(k), k).toBe(true);
    }
    const web = webDrawVictory();
    for (const k of ["banner_large_navy_a", "player_pose_1", "icon_star_gold", "icon_ticket", "icon_echo", "icon_stardust", "btn_primary", "btn_minor"]) {
      expect(web.includes(k), k).toBe(true);
    }
  });
});

/* ==================== 6. 宿主接线与源码守卫 ==================== */

describe("GameShell 的通关结算屏接线", () => {
  const src = fileSource("../cocos-prototype/assets/scripts/GameShell.ts");

  it("六件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildVictoryScreen", "victoryRun", "openVictory", "syncVictory", "onVictoryAction", "commitVictoryEcho"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildVictoryScreen();")).toBe(true);
    expect(src.indexOf("this.buildVictoryScreen();")).toBeGreaterThan(src.indexOf("this.buildGameOverScreen();"));
    expect(src.includes("victory: () => this.syncVictory(),")).toBe(true);
    expect(src.includes('"season", "gameover", "victory"]')).toBe(true);
  });

  it("路由实际注册十五屏(SCREEN_KEYS 仍是 16 态全量,energy 仍留空)", () => {
    const router = fileSource("../cocos-prototype/assets/scripts/core/ScreenRouter.ts");
    const keysBlock = /\[\s*([\s\S]*?)\]\s*as const/.exec(router.slice(router.indexOf("export const SCREEN_KEYS")))!;
    const all = keysBlock[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    expect(all).toHaveLength(16);
    expect(all).toContain("victory");
    expect(all).toContain("energy");
    expect(src.includes('"battle", "menu", "shop", "heroes", "leaderboard", "daily", "pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover", "victory"')).toBe(true);
    const hooks = src.slice(src.indexOf("const hooks: Partial<Record<ScreenKey"), src.indexOf("as ScreenKey[]"));
    expect((hooks.match(/\(\) => this\.sync[A-Z]\w*\(\),/g) ?? []).length).toBe(12);
    // 本单不做 energy 屏:它仍是没注册的键
    expect(src.includes("energy: () =>")).toBe(false);
    expect(src.includes('"energy"]')).toBe(false);
  });

  it("进屏判据只有一处:战斗层通关回调直连 openVictory,没有第二个弹屏点", () => {
    expect(src.includes("onVictory: (info) => this.openVictory(info),")).toBe(true);
    expect(src.includes("onVictory: () => {}")).toBe(false);
    expect((src.match(/this\.openVictory\(/g) ?? []).length).toBe(1);
    expect((src.match(/this\.router\.show\("victory"\)/g) ?? []).length).toBe(1);
    // Web 侧同样只有一个入口:victory() 尾部那一句 state = "victory"
    const web = webSource();
    expect((web.match(/this\.state = "victory"/g) ?? []).length).toBe(1);
    expect(web.slice(web.indexOf("private victory(): void"), web.indexOf("private settleThreeStarOnce(")).includes('this.state = "victory";')).toBe(true);
  });

  it("通关那一刻的账在战斗层,宿主不重算第二遍:openVictory 首三行只写会话态", () => {
    const seg = codeOf(src.slice(src.indexOf("private openVictory("), src.indexOf("private syncVictory()")));
    expect(seg.includes("this.victoryInfo = info;")).toBe(true);
    expect(seg.includes("this.stardustEarnedThisRun = info.reward.stardust;")).toBe(true);
    expect(seg.includes("this.doubleClaimed = false;")).toBe(true);
    expect(seg.includes("this.router.show(")).toBe(true);
    for (const bad of ["calcStars", "splitEcho", "stageEchoReward", "save.", "persist("]) {
      expect(seg.includes(bad), bad).toBe(false);
    }
    // Web 同位:victory() 尾部也写这三笔
    const web = webSource();
    const wv = web.slice(web.indexOf("private victory(): void"), web.indexOf("private settleThreeStarOnce("));
    expect(wv.includes("this.stardustEarnedThisRun = stardustGain;")).toBe(true);
    expect(wv.includes("this.doubleClaimed = false;")).toBe(true);
    expect(wv.includes("this.stageReward = { ...r, tickets, points: echo, stardust: stardustGain };")).toBe(true);
  });

  it("返回落点是 menu 且排在结算守卫之后(不是回 battle,也不是回重开)", () => {
    const seg = codeOf(src.slice(src.indexOf("private onVictoryAction"), src.indexOf("private commitVictoryEcho")));
    expect(seg.includes('this.router.show("menu");')).toBe(true);
    expect(seg.includes('this.router.show("battle")')).toBe(false);
    expect(seg.includes("this.restartRun(")).toBe(false);
    expect(seg.includes("sim.settlePendingRun();")).toBe(true);
    // Web 的底部条就是 backToMenu(先 settlePendingRun 再 state = "menu")
    const web = webSource();
    const back = web.slice(web.indexOf("private backToMenu(): void"), web.indexOf("private victory(): void"));
    expect(back.includes("this.settlePendingRun();")).toBe(true);
    expect(back.includes('this.state = "menu";')).toBe(true);
  });

  it("只有一个广告位且只经 watchAd 唯一入口;本屏 action 段不含屏级广告闸门", () => {
    const seg = codeOf(src.slice(src.indexOf("private onVictoryAction"), src.indexOf("private commitVictoryEcho")));
    expect((seg.match(/this\.watchAd\(/g) ?? []).length).toBe(1);
    expect(seg.includes("adPending"), "通关屏 action 里不该有屏级广告闸门").toBe(false);
    expect(seg.includes("showRewardedAd"), "不绕过壳层直调平台广告").toBe(false);
    const body = codeOf(src);
    expect((body.match(/if \(this\.adPending\) return;/g) ?? []).length).toBe(1);
  });

  it("存档写入只发生在 commitVictoryEcho;本屏分节里没有第二处写点", () => {
    const seg = codeOf(src.slice(src.indexOf("/* ================= 通关结算屏"), src.indexOf("/* ================= 主循环")));
    const commit = seg.slice(seg.indexOf("private commitVictoryEcho"));
    expect(commit.includes("save.points += claim.permanent;")).toBe(true);
    expect(commit.includes("save.dayEcho += claim.day;")).toBe(true);
    expect(commit.includes("this.sim.pointsEarnedThisRun = claim.total;")).toBe(true);
    expect(commit.includes("this.doubleClaimed = true;")).toBe(true);
    expect(commit.includes("this.refreshMenu();")).toBe(true);
    expect((seg.match(/persist\(\)/g) ?? []).length).toBe(1);
    const outside = seg.replace(commit, "");
    expect(outside.includes("save.")).toBe(false);
    expect(outside.includes("persist(")).toBe(false);
  });

  it("三项会话态不入档:宿主字段存在、SaveModel 里都没有", () => {
    expect(src.includes("private doubleClaimed = false;")).toBe(true);
    expect(src.includes("private stardustEarnedThisRun = 0;")).toBe(true);
    expect(src.includes("private victoryInfo: VictoryInfo | null = null;")).toBe(true);
    const saveModel = fileSource("../cocos-prototype/assets/scripts/core/SaveModel.ts");
    for (const f of ["doubleClaimed", "stardustEarnedThisRun", "victoryInfo"]) {
      expect(saveModel.includes(f), f).toBe(false);
    }
    // 开局复位仍是四个开局点,并且现在一并清掉通关 payload(= Web startRun 同段的三笔)
    const reset = codeOf(src.slice(src.indexOf("private resetGameOverTransients()"), src.indexOf("private openGameOver()")));
    expect(reset.includes("this.victoryInfo = null;")).toBe(true);
    expect(reset.includes("this.doubleClaimed = false;")).toBe(true);
    expect(reset.includes("this.stardustEarnedThisRun = 0;")).toBe(true);
    expect((src.match(/this\.resetGameOverTransients\(\);/g) ?? []).length).toBe(4);
    const web = webSource();
    const startRun = web.slice(web.indexOf("private startRun(): void"), web.indexOf("private startStage("));
    expect(startRun.includes("this.stageReward = null;")).toBe(true);
  });

  it("晚到贴图流到位后本屏也换引用并在当前屏时补排一次", () => {
    expect(src.includes("this.victoryView?.setFrames(this.frames);")).toBe(true);
    expect(src.includes('if (this.router.current === "victory") this.victoryView?.sync();')).toBe(true);
  });

  it("视图层零硬编码:几何全走 layout 出口,文字落位只有 placeLine 一个入口", () => {
    const view = codeOf(fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts"));
    expect((view.match(/L\.\w+/g) ?? []).length).toBeGreaterThan(20);
    expect((view.match(/placeLine\(/g) ?? []).length).toBe(1);
    expect((view.match(/approxW\(/g) ?? []).length).toBe(2);
    expect(view.includes("from \"cc\"")).toBe(true);
    expect(view.includes("innerHTML")).toBe(false);
    expect(view.includes("document.")).toBe(false);
  });
});

/* ==================== 7. Web 基准的反直觉口径(照抄,只列不改) ==================== */

describe("Web 基准的六条反直觉口径已原样带上", () => {
  const web = webSource();
  const tap = webVictoryTap();

  it("关卡框行被 drawAvatarFrame 泄漏成金色 12px 粗体左起笔,缺图那档才回到 16px 居中的紫", () => {
    const skin = fileSource("../src/ui/skin.ts");
    const fn = skin.slice(skin.indexOf("export function drawAvatarFrame("), skin.indexOf("/**\n * 代码品质框"));
    expect(fn.includes('g.textAlign = "left";')).toBe(true);
    expect(fn.includes('g.fillStyle = "#ffd76a";')).toBe(true);
    expect(fn.includes("return false;")).toBe(true);
    // 调用方不接返回值、也不再重设 fillStyle / font / textAlign,直接落那一笔(区间只取这两行之间)
    const wv = webDrawVictory();
    const seg = wv.slice(wv.indexOf("drawAvatarFrame(g, this.assets, this.frameUnlockedThisRun"), wv.indexOf("g.fillText(fTxt"));
    expect(seg.match(/g\.fillStyle|g\.font|g\.textAlign/g)).toBe(null);
    expect(seg.includes("w / 2 - g.measureText(fTxt).width / 2 - 18, h * 0.3 + 204, 22);")).toBe(true);
    expect(wv.includes('g.fillText(fTxt, w / 2, h * 0.3 + 210);')).toBe(true);
    // 本层两档都给,视图按贴图到位与否取一档
    const view = fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts");
    expect(view.includes("L.frameLineLeaked")).toBe(true);
    expect(view.includes("L.frameLineFlat")).toBe(true);
  });

  it("关卡框没有代码回退形状:Web 本屏不接 drawAvatarFrame 的返回值(与幻影榜那处的金圈分支不同)", () => {
    expect(webDrawVictory().includes("if (!drawAvatarFrame")).toBe(false);
    const menu = web.slice(web.indexOf("private drawLeaderboard("), web.indexOf("private drawDaily("));
    expect(menu.includes("if (!drawAvatarFrame")).toBe(true);
  });

  it("本屏不响应键盘以外的任何东西,而键盘那两支(r / m)都只回菜单", () => {
    const kbAt = web.indexOf('} else if (this.state === "victory") {');
    const kb = web.slice(kbAt, web.indexOf('} else if (this.state === "prestige") {', kbAt));
    expect(kb.includes('if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "m") this.backToMenu();')).toBe(true);
    expect(kb.includes("Escape")).toBe(false);
    expect(tap.includes("restart(")).toBe(false);
    expect(tap.includes("prestige")).toBe(false);
  });

  it("victory 是暂停态:主循环闸门与 render 分发都单独列它", () => {
    const gate = web.slice(web.indexOf("// gameover / victory / prestige"), web.indexOf("this.world.advance(dt);"));
    expect(gate.includes('this.state === "victory" ||')).toBe(true);
    expect(web.includes('if (this.state === "victory") this.drawVictory(g, w, h);')).toBe(true);
    // 战场与 HUD 都门控在 playing,所以本屏背景就是暗底压住 bg_outside
    const render = web.slice(web.indexOf("private render("), web.indexOf("private drawWorld("));
    expect(render.includes('if (this.state === "playing") this.drawWorld(g, cam);')).toBe(true);
    expect(render.includes('if (this.state === "playing") this.drawHUD(g, w, h);')).toBe(true);
  });

  it("通关与阵亡互斥,所以本局星尘只会在本屏非零", () => {
    expect((web.match(/this\.stardustEarnedThisRun = 0;/g) ?? []).length).toBe(2);
    expect(web.includes("this.stardustEarnedThisRun = stardustGain;")).toBe(true);
    // 通关屏的星尘行读 stageReward.stardust,与那个会话字段同源同数
    expect(webDrawVictory().includes("星尘 +${r.stardust}")).toBe(true);
    expect(webDrawVictory().includes("stardustEarnedThisRun")).toBe(false);
  });

  it("热区矩形在 Web 由上一帧绘制写入,Cocos 侧是纯函数没有这个时序", () => {
    expect(web.includes("this.doubleBtn = dbl;")).toBe(true);
    expect(web.includes('this.state === "victory"')).toBe(true);
    const view = fileSource("../cocos-prototype/assets/scripts/victory/VictoryView.ts");
    expect(view.includes("hitVictory(this.hooks.layout()")).toBe(true);
  });
});
