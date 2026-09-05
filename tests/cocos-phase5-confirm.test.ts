/**
 * Phase 5 二次确认弹层闸门:confirm(破坏性操作之前弹哪一层 / 层上显示什么 / 点了去哪)。
 *
 * 延续 cocos-phase4-* 与 cocos-phase5-{gameover,victory,energy} 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `confirm/ConfirmModel.ts` 经相对路径 import 的共享层
 *     (`game/ui/theme` 的 `confirmRects` 与那五枚 `CONFIRM_*` 常量)与 Web 侧经 `@game` 别名 import
 *     的是同一个模块实例(函数引用 `toBe` 相同、常量值同数),于是「盒 360×170 居中」「两枚钮
 *     150×44 横排、间距 14、钮行底边距盒底 16」这套几何不可能出现两份抄本;
 *  2. **断言按入参分档**:几何吃 `(w, h)` 与**已折好的正文行**,两档屏高(996 / 1246)下每一条
 *     矩形与基线都是常量表;正文条数(0 / 1 / 2 / 3+)决定基线走哪一档,量字口径由 `measure`
 *     入参注入,故本文件不需要宿主侧那份引了 `cc` 的近似量字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `ConfirmModel.ts` 与共享层 `game/ui/theme`;
 *     `ConfirmView.ts` 与 `GameShell.ts` / `ViewTable.ts` 那三侧 import 了 `cc`,node 不能直载,
 *     故只读源码文本。
 *
 * 本件的几何重点是**「盒与钮整体转调共享层,横幅与基线是 drawConfirm 的内联数」**这条分界:
 *  - 盒 `{100, (h−170)/2, 360, 170}`、确认钮 `{123, by+110, 150, 44}`、取消钮 `{287, by+110, 150, 44}`
 *    三枚矩形**一个数都不在本层算**,全部来自 `confirmRects`;
 *  - 横幅盒 `(b.x+14, b.y+10, b.w−28, 30)`、标题基线 `b.y+30`、正文两行档 `b.y+67`/`b.y+89`
 *    与一行档 `b.y+80`、两枚钮内文字基线 `y+h/2+4`(确认,13px 不粗)与 `y+h/2+5`(取消,14px 粗)
 *    —— 这七处是 Web 写在绘制代码里的裸数,`tests/confirm-layout.test.ts` 那份只管盒与钮;
 *  - 两档屏高之间**每个矩形都整体平移 125 = Δh/2**,横向逐位相同(盒是屏幕居中,不是角锚)。
 *
 * 另锁本件照抄的 Web 口径(只列不改):正文最多画两行(第三行起不画)、一行与两行是两套不同基线
 * 而不是「首行 + 行距」、两枚钮的文字基线走裸偏移而不是 `rowTextY`、确认命中**先清空再执行**、
 * 热区之外一律吞掉(`null` 的语义是「什么都不做」而不是「交给下一层」)、弹层不随切屏消失。
 *
 * 最后两条**跨层纪律**:
 *  - **import 完整性**:视图与宿主用到的每一个模型出口都必须在自己的 import 清单里。
 *    通关屏曾经漏过 `victoryBadgeTextLine`,构建产物的 `error TS` 计数为 0 也照样放过去
 *    (门 3 的 Cocos 构建不做可靠类型检查),只有实机进屏那一刻才炸。这一条把它钉成断言,
 *    并同时钉住已落地的 energy / victory 两侧;
 *  - 视图层不内联魔法数:四枚盒与七处基线只能来自 `confirmScreenLayout` 的那一帧。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import {
  CONFIRM_BTN_GAP,
  CONFIRM_BTN_H,
  CONFIRM_BTN_W,
  CONFIRM_H,
  CONFIRM_W,
  confirmRects,
  fs as FS,
  theme,
} from "@game/ui/theme";

/* ---------- Cocos 宿主侧的被测件(cc-free) ---------- */
import {
  CF_BANNER_H,
  CF_BANNER_INSET,
  CF_BANNER_NINE,
  CF_BANNER_TOP,
  CF_BODY_DY_L1,
  CF_BODY_DY_L2,
  CF_BODY_DY_ONE,
  CF_BODY_INSET,
  CF_BODY_MAX_LINES,
  CF_BODY_PX,
  CF_CANCEL_PX,
  CF_CANCEL_TEXT_DY,
  CF_BTN_GAP,
  CF_BTN_H,
  CF_BTN_STROKE_W,
  CF_BTN_W,
  CF_BOX_H,
  CF_BOX_W,
  CF_OK_PX,
  CF_OK_TEXT_DY,
  CF_PANEL_NINE,
  CF_TITLE_DY,
  CF_TITLE_PX,
  CONFIRM_PROMPT_HOME,
  CONFIRM_PROMPT_RESTART,
  buildConfirmContent,
  buildConfirmLayout,
  confirmBodyMaxW,
  confirmFitLines,
  confirmScreenLayout,
  hitConfirm,
  type CfRect,
  type ConfirmLayout,
} from "../cocos/assets/scripts/confirm/ConfirmModel";
import * as cocosConfirmModel from "../cocos/assets/scripts/confirm/ConfirmModel";
import * as cocosTheme from "../cocos/assets/scripts/game/ui/theme";
import * as cocosEnergyLayout from "../cocos/assets/scripts/game/ui/energyLayout";
import * as cocosEnergyModel from "../cocos/assets/scripts/energy/EnergyModel";
import * as cocosVictoryLayout from "../cocos/assets/scripts/game/ui/victoryLayout";
import * as cocosVictoryModel from "../cocos/assets/scripts/victory/VictoryModel";

/* ==================== 夹具 ==================== */

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
/** Δh/2 = 125:盒是屏幕居中,故两档之间每个矩形都整体平移这么多 */
const DY = (H_TALL - H_STD) / 2;

const ONE = ["确定重开本局?当前章节进度与金币将丢失。"];
const TWO = ["确定重开本局?", "当前章节进度与金币将丢失。"];

function laid(h: number, lines: string[] = ONE): ConfirmLayout {
  return buildConfirmLayout(W, h, lines);
}

const mid = (r: CfRect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const bottom = (r: CfRect): number => r.y + r.h;
const right = (r: CfRect): number => r.x + r.w;
/** 两片矩形是否相交(开区间重叠才算,贴边不算) */
const overlap = (a: CfRect, b: CfRect): boolean => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 一份源码里所有 import 语句拼成的文本(横向扫 import 清单用) */
function importsOf(src: string): string {
  return [...src.matchAll(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm)].map((m) => m[0]).join("\n");
}

/** 去掉全部 import 之后的代码体 */
function bodyOf(src: string): string {
  return src.replace(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm, "");
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

/** Web 的弹层绘制段(openConfirm / confirmLayout / panelPad / drawConfirm,1193-1246) */
function webDrawConfirm(): string {
  const web = webSource();
  return web.slice(web.indexOf("private openConfirm("), web.indexOf("private shopLayout("));
}

/** Web 的商店工具钮分发段(两个 openConfirm 调用点就在这里) */
function webShopTools(): string {
  const web = webSource();
  return web.slice(web.indexOf("private onShopClick("), web.indexOf("// 槽位扩展(金币出口)"));
}

/** Web 的点击优先级段(确认弹层优先于一切 state) */
function webHandleTap(): string {
  const web = webSource();
  return web.slice(web.indexOf("// 二次确认弹窗优先"), web.indexOf('if (this.state === "season")'));
}

/**
 * import 完整性检查:`file` 的代码体里凡是引用到 `ns` 的某个导出名,那个名字就必须出现在
 * `file` 的 import 清单里。漏 import 在 Cocos 构建里不是错误(门 3 不做可靠类型检查),
 * 只会以运行期 `ReferenceError` 的形式在进屏那一刻炸出来。
 */
function missingImports(file: string, specs: Array<{ label: string; ns: Record<string, unknown> }>): string[] {
  const src = fileSource(file);
  const imports = importsOf(src);
  const body = codeOf(bodyOf(src));
  const out: string[] = [];
  for (const spec of specs) {
    for (const name of Object.keys(spec.ns)) {
      const re = new RegExp(`(?<![\\w$.])${name}(?![\\w$])`);
      if (re.test(body) && !re.test(imports)) out.push(`${spec.label}::${name}`);
    }
  }
  return out;
}

/**
 * 宿主侧 `ui/PanelKit.ts` 的出口清单(手列):那一份 import 了 `cc`,node 不能直载,
 * 故这里只把**名字**交给同一把尺子 —— 视图与宿主凡用到其中一枚,就必须出现在自己的 import 清单里。
 */
const PANEL_KIT_NS: Record<string, unknown> = {
  Plate: 1,
  QUALITY_FRAME_BG: 1,
  approxW: 1,
  fitLines: 1,
  fitOne: 1,
  flatBox: 1,
  iconNode: 1,
  insetFrame: 1,
  placeLine: 1,
  qualityBox: 1,
};

/* ==================== 0. 端间同一实现 ==================== */

describe("端间共读同一份共享层", () => {
  it("theme 模块在两端是同一实例(confirmRects 函数引用相同)", () => {
    expect(cocosTheme.confirmRects).toBe(confirmRects);
    expect(cocosTheme.CONFIRM_W).toBe(CONFIRM_W);
    expect(cocosTheme.fs).toBe(FS);
  });

  it("模型层的五个转出口就是共享层那五枚常量(转手即同一份,不是抄本)", () => {
    expect(CF_BOX_W).toBe(CONFIRM_W);
    expect(CF_BOX_H).toBe(CONFIRM_H);
    expect(CF_BTN_W).toBe(CONFIRM_BTN_W);
    expect(CF_BTN_H).toBe(CONFIRM_BTN_H);
    expect(CF_BTN_GAP).toBe(CONFIRM_BTN_GAP);
    expect([CONFIRM_W, CONFIRM_H, CONFIRM_BTN_W, CONFIRM_BTN_H, CONFIRM_BTN_GAP]).toEqual([360, 170, 150, 44, 14]);
  });

  it("盒与两枚钮的矩形整体来自 confirmRects:模型层不重算其中任何一个数", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h);
      const R = confirmRects(W, h);
      expect(L.box).toEqual(R.box);
      expect(L.ok).toEqual(R.ok);
      expect(L.cancel).toEqual(R.cancel);
    }
    const model = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    expect(model.includes("confirmRects(w, h)")).toBe(true);
    // 共享层的五个数在模型层只以「转出口」形式出现一次,不参与任何算式
    expect(model.includes("(w - CONFIRM_W) / 2")).toBe(false);
    expect(model.includes("CONFIRM_H - 16")).toBe(false);
    expect(model.includes("CONFIRM_BTN_W * 2")).toBe(false);
  });

  it("模型层不碰存档、不碰节点、不看时间与随机源", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    expect(model.includes('from "cc"')).toBe(false);
    expect(model.includes("Date.now")).toBe(false);
    expect(model.includes("Math.random")).toBe(false);
    expect(model.includes(".persist")).toBe(false);
    expect(model.includes("Node")).toBe(false);
    expect(model.includes("viewTable")).toBe(false);
  });

  it("量字函数是入参:模型层不复制 PanelKit.approxW 的那两个系数", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    expect(model.includes("approxW")).toBe(false);
    expect(model.includes("0.55")).toBe(false);
    expect(model.includes("0.3")).toBe(false);
    expect(model.includes("measure(test, px)")).toBe(true);
  });
});

/* ==================== 1. 996 档几何 ==================== */

describe("996 档几何(逐项对标 Web drawConfirm 的内联数)", () => {
  const L = laid(H_STD);

  it("盒 360×170 屏幕居中 {100,413},两枚钮 150×44 在 {123,523} 与 {287,523}", () => {
    expect(L.box).toEqual({ x: 100, y: 413, w: 360, h: 170 });
    expect(L.ok).toEqual({ x: 123, y: 523, w: 150, h: 44 });
    expect(L.cancel).toEqual({ x: 287, y: 523, w: 150, h: 44 });
    // 钮行底边距盒底 16、钮行关于盒中轴对称(左右留白各 23)
    expect(bottom(L.ok)).toBe(bottom(L.box) - 16);
    expect(L.ok.x - L.box.x).toBe(23);
    expect(L.box.x + L.box.w - right(L.cancel)).toBe(23);
    expect(right(L.ok) + CONFIRM_BTN_GAP).toBe(L.cancel.x);
  });

  it("标题横幅盒 {114,423,332,30}(b.x+14, b.y+10, b.w−28, 30),九宫切深 13", () => {
    expect(CF_BANNER_INSET).toBe(14);
    expect(CF_BANNER_TOP).toBe(10);
    expect(CF_BANNER_H).toBe(30);
    expect(CF_BANNER_NINE).toBe(13);
    expect(L.banner).toEqual({ x: 114, y: 423, w: 332, h: 30 });
    // 横幅在盒内、左右各留 14
    expect(L.banner.x - L.box.x).toBe(CF_BANNER_INSET);
    expect(L.box.x + L.box.w - right(L.banner)).toBe(CF_BANNER_INSET);
  });

  it("盒底垫切深 32、贴图键 panel_dark_corners;横幅键 banner_mid_navy", () => {
    expect(CF_PANEL_NINE).toBe(32);
    expect(L.panelNine).toBe(CF_PANEL_NINE);
    expect(L.bannerNine).toBe(CF_BANNER_NINE);
    expect(L.panelKey).toBe("panel_dark_corners");
    expect(L.bannerKey).toBe("banner_mid_navy");
    expect(L.okKey).toBe("btn_danger");
    expect(L.cancelKey).toBe("btn_minor");
  });

  it("标题「确认操作」基线 b.y+30 = 443,粗体 fs.body,限宽收到横幅宽 332", () => {
    expect(CF_TITLE_DY).toBe(30);
    expect(L.title).toEqual({ x: 280, baseY: 443, maxW: 332, px: FS.body, align: "center", bold: true });
    expect(L.title.maxW).toBe(L.banner.w);
    expect(CF_TITLE_PX).toBe(FS.body);
  });

  it("正文一行档基线 b.y+80 = 493,限宽 b.w−40 = 320,不粗", () => {
    expect(CF_BODY_DY_ONE).toBe(80);
    expect(CF_BODY_INSET).toBe(20);
    expect(L.body.length).toBe(1);
    expect(L.body[0]).toEqual({ x: 280, baseY: 493, maxW: 320, px: FS.body, align: "center", bold: false });
    expect(L.bodyMaxW).toBe(320);
    expect(confirmBodyMaxW(L.box.w)).toBe(320);
    expect(CF_BODY_PX).toBe(FS.body);
  });

  it("正文两行档基线 b.y+67 = 480 与 b.y+89 = 502(行距 22,不是「首行 + 行距」那一套)", () => {
    const T = laid(H_STD, TWO);
    expect(CF_BODY_DY_L1).toBe(67);
    expect(CF_BODY_DY_L2).toBe(89);
    expect(T.body.length).toBe(2);
    expect(T.body.map((t) => t.baseY)).toEqual([480, 502]);
    expect(T.body[1].baseY - T.body[0].baseY).toBe(22);
    // 一行档那一条正好落在两行档的中缝上(493 = (480+502)/2 + 2,Web 就是写了两个分支)
    expect(L.body[0].baseY).toBe(493);
    expect((T.body[0].baseY + T.body[1].baseY) / 2).toBe(491);
    // 两档的限宽与字号逐位相同,只有基线不同
    expect(T.body.map((t) => t.maxW)).toEqual([320, 320]);
    expect(T.body.map((t) => t.px)).toEqual([FS.body, FS.body]);
  });

  it("确认钮文字基线 y+h/2+4 = 549(13px 不粗),取消钮 y+h/2+5 = 550(14px 粗体)", () => {
    expect(CF_OK_TEXT_DY).toBe(4);
    expect(CF_CANCEL_TEXT_DY).toBe(5);
    expect(CF_OK_PX).toBe(FS.muted);
    expect(CF_CANCEL_PX).toBe(FS.body);
    expect(L.okText).toEqual({ x: 198, baseY: 549, maxW: 150, px: 13, align: "center", bold: false });
    expect(L.cancelText).toEqual({ x: 362, baseY: 550, maxW: 150, px: 14, align: "center", bold: true });
    // 两枚钮的文字锚点就是各自的钮心
    expect(L.okText.x).toBe(mid(L.ok)[0]);
    expect(L.cancelText.x).toBe(mid(L.cancel)[0]);
    expect(L.btnTextMaxW).toBe(CONFIRM_BTN_W);
    expect(L.btnStrokeW).toBe(CF_BTN_STROKE_W);
    expect(CF_BTN_STROKE_W).toBe(1);
  });

  it("四处文字锚点同为盒心 280;两枚钮的矩形互不相交且都在盒内", () => {
    for (const t of [L.title, L.body[0]]) expect(t.x).toBe(280);
    expect(mid(L.box)[0]).toBe(280);
    expect(overlap(L.ok, L.cancel)).toBe(false);
    expect(L.ok.x).toBeGreaterThanOrEqual(L.box.x);
    expect(right(L.cancel)).toBeLessThanOrEqual(right(L.box));
    expect(bottom(L.ok)).toBeLessThanOrEqual(bottom(L.box));
  });

  it("正文基线落在横幅底缘与钮顶缘之间(不可能与两者叠字)", () => {
    expect(L.body[0].baseY).toBeGreaterThan(bottom(L.banner));
    expect(L.body[0].baseY).toBeLessThan(L.ok.y);
    const T = laid(H_STD, TWO);
    expect(T.body[0].baseY).toBeGreaterThan(bottom(T.banner));
    expect(T.body[1].baseY).toBeLessThan(T.ok.y);
  });
});

/* ==================== 2. 1246 档与跨档性质 ==================== */

describe("1246 档几何与跨档性质", () => {
  const A = laid(H_STD);
  const B = laid(H_TALL);

  it("1246 档逐项目标值:盒 {100,538}、横幅 {114,548}、两枚钮 y 648、标题基线 568、正文一行档 618", () => {
    expect(B.box).toEqual({ x: 100, y: 538, w: 360, h: 170 });
    expect(B.banner).toEqual({ x: 114, y: 548, w: 332, h: 30 });
    expect(B.ok).toEqual({ x: 123, y: 648, w: 150, h: 44 });
    expect(B.cancel).toEqual({ x: 287, y: 648, w: 150, h: 44 });
    expect(B.title.baseY).toBe(568);
    expect(B.body[0].baseY).toBe(618);
    expect(B.okText.baseY).toBe(674);
    expect(B.cancelText.baseY).toBe(675);
  });

  it("两行档在 1246 档同样只平移:605 与 627", () => {
    const T = laid(H_TALL, TWO);
    expect(T.body.map((t) => t.baseY)).toEqual([605, 627]);
    expect(T.body[1].baseY - T.body[0].baseY).toBe(22);
  });

  it("两档之间每个矩形与每处基线都整体平移 Δh/2 = 125,横向与宽高逐位相同", () => {
    expect(DY).toBe(125);
    const pairs: Array<[CfRect, CfRect]> = [
      [A.box, B.box],
      [A.banner, B.banner],
      [A.ok, B.ok],
      [A.cancel, B.cancel],
    ];
    for (const [a, b] of pairs) {
      expect(b.y - a.y).toBe(DY);
      expect(b.x).toBe(a.x);
      expect(b.w).toBe(a.w);
      expect(b.h).toBe(a.h);
    }
    for (const [a, b] of [[A.title, B.title], [A.body[0], B.body[0]], [A.okText, B.okText], [A.cancelText, B.cancelText]]) {
      expect(b.baseY - a.baseY).toBe(DY);
      expect(b.x).toBe(a.x);
      expect(b.maxW).toBe(a.maxW);
      expect(b.px).toBe(a.px);
      expect(b.bold).toBe(a.bold);
    }
  });

  it("盒内相对几何在两档逐位相同(整件跟着盒一起走,盒内没有一条随屏高伸缩的锚线)", () => {
    for (const [L, R] of [
      [A, confirmRects(W, H_STD)],
      [B, confirmRects(W, H_TALL)],
    ] as Array<[ConfirmLayout, ReturnType<typeof confirmRects>]>) {
      expect(L.box).toEqual(R.box);
      expect(L.banner.y - L.box.y).toBe(CF_BANNER_TOP);
      expect(L.title.baseY - L.box.y).toBe(CF_TITLE_DY);
      expect(L.body[0].baseY - L.box.y).toBe(CF_BODY_DY_ONE);
      expect(L.ok.y - L.box.y).toBe(CONFIRM_H - 16 - CONFIRM_BTN_H);
    }
    const layoutSrc = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    expect(layoutSrc.includes("spreadRows")).toBe(false);
    expect(layoutSrc.includes("rowTextY")).toBe(false);
  });

  it("正文条数不改盒与钮:0 / 1 / 2 / 3 行四档下 box·banner·ok·cancel 逐位相同", () => {
    const base = JSON.stringify({ box: A.box, banner: A.banner, ok: A.ok, cancel: A.cancel });
    for (const lines of [[], ONE, TWO, ["一", "二", "三"]]) {
      const L = laid(H_STD, lines);
      expect(JSON.stringify({ box: L.box, banner: L.banner, ok: L.ok, cancel: L.cancel })).toBe(base);
    }
  });
});

/* ==================== 3. 折行与基线档 ==================== */

describe("折行(对标 Web src/game.ts:5308-5322 的 fitLines)", () => {
  /** 一字符一像素的量字桩:断行规则因此可以按字符数直读 */
  const per = (t: string): number => [...t].length;

  it("整串放得下就一行,不产生多余空行", () => {
    expect(confirmFitLines("确定重开本局?", 320, 14, per)).toEqual(["确定重开本局?"]);
    expect(confirmFitLines("", 320, 14, per)).toEqual([]);
  });

  it("逐码点试探:超宽才断,断点后的那个字符另起一行", () => {
    expect(confirmFitLines("abcdefghij", 3, 14, per)).toEqual(["abc", "def", "ghi", "j"]);
    expect(confirmFitLines("abcdef", 6, 14, per)).toEqual(["abcdef"]);
    expect(confirmFitLines("abcdefg", 6, 14, per)).toEqual(["abcdef", "g"]);
  });

  it("首字符再宽也单独成行(不会死循环),CJK 按码点而不是按 UTF-16 单元切", () => {
    expect(confirmFitLines("确定重开", 1, 14, per)).toEqual(["确", "定", "重", "开"]);
    expect(confirmFitLines("𠀀𠀁", 1, 14, per)).toEqual(["𠀀", "𠀁"]);
  });

  it("量字口径由入参决定:同一个串在不同 measure 下折出不同行数", () => {
    const text = "确定重开本局?当前章节进度与金币将丢失。";
    expect(confirmFitLines(text, 320, 14, () => 0)).toEqual([text]);
    expect(confirmFitLines(text, 320, 14, (t, px) => [...t].length * px).length).toBe(1);
    expect(confirmFitLines(text, 100, 14, (t, px) => [...t].length * px).length).toBe(3);
  });

  it("Web 那两条真实文案在最保守的量字口径下都是一行(与 ASCII 系数无关)", () => {
    // 每个字符都按 CJK 全宽(1×px)算是宽度的上界:20 字 × 14 = 280 ≤ 320、16 字 × 14 = 224 ≤ 320
    const upper = (t: string, px: number): number => [...t].length * px;
    expect(confirmFitLines(CONFIRM_PROMPT_RESTART, 320, 14, upper)).toEqual([CONFIRM_PROMPT_RESTART]);
    expect(confirmFitLines(CONFIRM_PROMPT_HOME, 320, 14, upper)).toEqual([CONFIRM_PROMPT_HOME]);
    expect([...CONFIRM_PROMPT_RESTART].length).toBe(20);
    expect([...CONFIRM_PROMPT_HOME].length).toBe(16);
    // 再多 3 个字就会翻到两行档(23 × 14 = 322 > 320):这一档由合成串覆盖
    expect(confirmFitLines(CONFIRM_PROMPT_RESTART + "确定?", 320, 14, upper).length).toBe(2);
  });

  it("正文最多画两行:折出三行以上时第三行起根本不画(Web 的 lines[0]/lines[1] 两支)", () => {
    expect(CF_BODY_MAX_LINES).toBe(2);
    const L = laid(H_STD, ["一", "二", "三", "四"]);
    expect(L.body.length).toBe(2);
    expect(L.body.map((t) => t.baseY)).toEqual([laid(H_STD, TWO).body[0].baseY, laid(H_STD, TWO).body[1].baseY]);
    expect(buildConfirmContent(["一", "二", "三", "四"]).body).toEqual(["一", "二"]);
  });

  it("零行档一条正文都不画(Web 的 else if (lines.length === 1) 之外没有兜底)", () => {
    expect(laid(H_STD, []).body).toEqual([]);
    expect(buildConfirmContent([]).body).toEqual([]);
  });
});

/* ==================== 4. 单一出口 ==================== */

describe("confirmScreenLayout:几何与文案一次算完", () => {
  it("与「先折行再分别建几何与内容」逐位同结果", () => {
    const measure = (t: string, px: number): number => [...t].length * px;
    const f = confirmScreenLayout(W, H_STD, CONFIRM_PROMPT_RESTART, measure);
    const lines = confirmFitLines(CONFIRM_PROMPT_RESTART, confirmBodyMaxW(CONFIRM_W), CF_BODY_PX, measure);
    expect(f.layout).toEqual(buildConfirmLayout(W, H_STD, lines));
    expect(f.content).toEqual(buildConfirmContent(lines));
    expect(f.content.body).toEqual([CONFIRM_PROMPT_RESTART]);
    expect(f.layout.body.length).toBe(1);
  });

  it("窄量字口径下走两行档,几何与内容同步换档", () => {
    const measure = (t: string): number => [...t].length * 30;
    const f = confirmScreenLayout(W, H_STD, CONFIRM_PROMPT_RESTART, measure);
    expect(f.content.body.length).toBe(2);
    expect(f.layout.body.map((t) => t.baseY - f.layout.box.y)).toEqual([CF_BODY_DY_L1, CF_BODY_DY_L2]);
    expect(f.content.body.join("")).toBe(CONFIRM_PROMPT_RESTART);
  });

  it("空串也出一帧完整几何(盒与两枚钮恒在,只是没有正文)", () => {
    const f = confirmScreenLayout(W, H_STD, "", () => 0);
    expect(f.layout.box).toEqual(confirmRects(W, H_STD).box);
    expect(f.layout.body).toEqual([]);
    expect(f.content.body).toEqual([]);
    expect(f.content.title).toBe("确认操作");
  });

  it("同一份入参永远同一帧(没有随机源、没有时钟)", () => {
    const m = (t: string, px: number): number => [...t].length * px;
    expect(JSON.stringify(confirmScreenLayout(W, H_STD, CONFIRM_PROMPT_HOME, m))).toBe(JSON.stringify(confirmScreenLayout(W, H_STD, CONFIRM_PROMPT_HOME, m)));
  });
});

/* ==================== 5. 内容 ==================== */

describe("一屏文案(逐字对标 Web drawConfirm 的 fillText 实参)", () => {
  it("标题与两枚钮的字面量恒定:确认操作 / 确认 / 取消", () => {
    const c = buildConfirmContent(ONE);
    expect(c.title).toBe("确认操作");
    expect(c.okText).toBe("确认");
    expect(c.cancelText).toBe("取消");
  });

  it("正文就是折好的那几行,不由模型改写一个字", () => {
    expect(buildConfirmContent(ONE).body).toEqual(ONE);
    expect(buildConfirmContent(TWO).body).toEqual(TWO);
  });

  it("两条真实文案逐字对上 Web 的 openConfirm 实参(问号半角、句号全角)", () => {
    expect(CONFIRM_PROMPT_RESTART).toBe("确定重开本局?当前章节进度与金币将丢失。");
    expect(CONFIRM_PROMPT_HOME).toBe("确定返回主菜单?本局进度将丢失。");
    expect(CONFIRM_PROMPT_RESTART.includes("?")).toBe(true);
    expect(CONFIRM_PROMPT_RESTART.includes("？")).toBe(false);
    expect(CONFIRM_PROMPT_HOME.includes("?")).toBe(true);
    expect(CONFIRM_PROMPT_HOME.includes("？")).toBe(false);
    for (const t of [CONFIRM_PROMPT_RESTART, CONFIRM_PROMPT_HOME]) {
      expect(t.endsWith("。")).toBe(true);
      expect(webShopTools().includes(t)).toBe(true);
    }
  });
});

/* ==================== 6. 命中 ==================== */

describe("两片热区(顺序与 Web handleTap 的确认优先分支逐条对应)", () => {
  const L = laid(H_STD);

  it("两片各自的中点命中自己", () => {
    expect(hitConfirm(L, ...mid(L.ok))).toEqual({ kind: "ok" });
    expect(hitConfirm(L, ...mid(L.cancel))).toEqual({ kind: "cancel" });
  });

  it("边界 inclusive:四条边的端点都算命中(Web 的 >= 与 <=)", () => {
    for (const [r, kind] of [
      [L.ok, "ok"],
      [L.cancel, "cancel"],
    ] as Array<[CfRect, string]>) {
      expect(hitConfirm(L, r.x, r.y)?.kind).toBe(kind);
      expect(hitConfirm(L, right(r), r.y)?.kind).toBe(kind);
      expect(hitConfirm(L, r.x, bottom(r))?.kind).toBe(kind);
      expect(hitConfirm(L, right(r), bottom(r))?.kind).toBe(kind);
    }
  });

  it("钮缝、盒内空白、横幅、标题与正文一律 null(= 吞掉,不是「交给下一层」)", () => {
    expect(hitConfirm(L, 280, 545)).toBeNull(); // 两枚钮之间那 14px 缝
    expect(hitConfirm(L, 280, 443)).toBeNull(); // 标题基线
    expect(hitConfirm(L, 280, 493)).toBeNull(); // 正文基线
    expect(hitConfirm(L, 280, 423)).toBeNull(); // 横幅顶缘
    expect(hitConfirm(L, 101, 414)).toBeNull(); // 盒内左上角
    expect(hitConfirm(L, 280, bottom(L.box) - 8)).toBeNull(); // 钮行下方那 16px
    expect(hitConfirm(L, 0, 0)).toBeNull(); // 屏角(暗底之上、盒之外)
    expect(hitConfirm(L, 280, 995)).toBeNull();
  });

  it("盒外一整圈都 null:暗底铺满全屏但不是一片热区", () => {
    for (const [x, y] of [
      [99, 545],
      [461, 545],
      [280, 412],
      [280, 584],
      [122, 522],
      [438, 568],
    ]) {
      expect(hitConfirm(L, x, y)).toBeNull();
    }
    expect(L.ok.x - 1).toBe(122);
    expect(right(L.cancel) + 1).toBe(438);
  });

  it("命中顺序与 Web 一致:确认 → 取消(两片互不相交故顺序不产生差别)", () => {
    expect(overlap(L.ok, L.cancel)).toBe(false);
    const src = webHandleTap();
    const okAt = src.indexOf("p.x >= L.ok.x");
    const cancelAt = src.indexOf("p.x >= L.cancel.x");
    expect(okAt).toBeGreaterThan(0);
    expect(cancelAt).toBeGreaterThan(okAt);
    // Web 那一段末尾是无条件 return:热区之外也吞掉,不落到下面的屏级分发
    const blk = src.slice(src.indexOf("if (this.confirm) {"));
    expect(blk.trimEnd().endsWith("return;\n    }")).toBe(true);
  });

  it("两行档不改命中:正文条数只动基线,两片矩形逐位相同", () => {
    const T = laid(H_STD, TWO);
    expect(hitConfirm(T, ...mid(T.ok))).toEqual({ kind: "ok" });
    expect(T.ok).toEqual(L.ok);
    expect(T.cancel).toEqual(L.cancel);
  });
});

/* ==================== 7. phase4 表的 cf* 段 ==================== */

describe("phase4 表的 cf* 段(默认值逐项对标 Web drawConfirm 与 themePaint)", () => {
  const D = phase4Defaults();

  it("全屏暗底是纯黑 0.62(与十六屏的深蓝覆盖底都不同值)", () => {
    expect(D.cfDim).toBe("rgba(0,0,0,0.62)");
  });

  it("盒底垫缺图回退 = Web panel() 的 theme.bgPanel 填充 + #ffd76a 描边", () => {
    expect(D.cfPanelFallbackBg).toBe(theme.bgPanel);
    expect(D.cfPanelFallbackBg).toBe("rgba(19,24,38,0.92)");
    expect(D.cfPanelFallbackStroke).toBe("#FFD76A");
    expect(D.cfPanelFallbackStroke).toBe(theme.gold);
  });

  it("横幅缺图回退 = 平面 rgba(18,24,44,0.88) + 1px rgba(255,215,106,0.35)(Web 显式写了这一支)", () => {
    expect(D.cfBannerFallbackBg).toBe("rgba(18,24,44,0.88)");
    expect(D.cfBannerFallbackStroke).toBe("rgba(255,215,106,0.35)");
  });

  it("标题 #ffd76a、正文 #cfd6e2(与 textPrimary #E8ECF4 不同值,照 Web 字面量)", () => {
    expect(D.cfTitle).toBe("#FFD76A");
    expect(D.cfBody).toBe("#CFD6E2");
    expect(D.cfBody).not.toBe(theme.textPrimary.toUpperCase());
  });

  it("确认钮缺图回退 = dangerButton 的 actionDangerBg + rgba(255,107,122,0.4),文字 actionDanger", () => {
    expect(D.cfOkFallbackBg).toBe(theme.actionDangerBg);
    expect(D.cfOkFallbackBg).toBe("#3A2222");
    expect(D.cfOkFallbackStroke).toBe("rgba(255,107,122,0.4)");
    expect(D.cfOkText).toBe(theme.actionDanger);
    expect(D.cfOkText).toBe("#FF6B7A");
  });

  it("取消钮缺图回退 = minorButtonBg 的 #2A3D55 + rgba(255,255,255,0.3),文字 textSecondary", () => {
    expect(D.cfCancelFallbackBg).toBe("#2A3D55");
    expect(D.cfCancelFallbackStroke).toBe("rgba(255,255,255,0.3)");
    expect(D.cfCancelText).toBe(theme.textSecondary);
    expect(D.cfCancelText).toBe("#8F9BB3");
  });

  it("本件 13 个键全部存在且都被视图层取用(没有孤儿键)", () => {
    const keys = Object.keys(D).filter((k) => /^cf[A-Z]/.test(k));
    expect(keys.length).toBe(13);
    expect(keys.sort()).toEqual(
      [
        "cfBannerFallbackBg",
        "cfBannerFallbackStroke",
        "cfBody",
        "cfCancelFallbackBg",
        "cfCancelFallbackStroke",
        "cfCancelText",
        "cfDim",
        "cfOkFallbackBg",
        "cfOkFallbackStroke",
        "cfOkText",
        "cfPanelFallbackBg",
        "cfPanelFallbackStroke",
        "cfTitle",
      ].sort()
    );
    const view = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts"));
    for (const k of keys) expect(view.includes(`p4.${k}`)).toBe(true);
  });

  it("色值一律是 6 位大写十六进制或 rgba 串(与全表同档)", () => {
    for (const [k, v] of Object.entries(D)) {
      if (!/^cf[A-Z]/.test(k)) continue;
      expect(v.startsWith("rgba(") || /^#[0-9A-F]{6}$/.test(v)).toBe(true);
    }
  });

  it("已有键一枚都没动:en* 段仍是 22 键、vi* 段与 go* 段原样", () => {
    expect(Object.keys(D).filter((k) => /^en[A-Z]/.test(k)).length).toBe(22);
    expect(D.enDim).toBe("rgba(8,10,16,0.92)");
    expect(D.enBackText).toBe("#CFCFCF");
  });
});

/* ==================== 8. 层职责纪律 ==================== */

describe("三层分工的源码纪律", () => {
  it("视图层不内联任何一枚盒与基线:几何只能来自模型层那一帧", () => {
    const view = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts"));
    const body = bodyOf(view);
    // 视图里出现的数字只允许是缓存哨兵(-1 的 1)、lineHeight 系数(1.25)、循环起点(0)
    // 与暗底折中心锚点的除数(2)
    const nums = [...body.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    const allowed = new Set([0, 1, 1.25, 2]);
    expect(nums.filter((n) => !allowed.has(n))).toEqual([]);
    expect((body.match(/-r\.w \/ 2|-r\.h \/ 2/g) || []).length).toBe(2);
    for (const k of ["L.box", "L.banner", "L.ok", "L.cancel", "L.title", "L.body", "L.okText", "L.cancelText", "L.panelKey", "L.bannerKey", "L.okKey", "L.cancelKey"]) {
      expect(body.includes(k), k).toBe(true);
    }
  });

  it("折行与量字都不在视图里:视图只有 fitOne 那一道截断", () => {
    const body = bodyOf(codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts")));
    expect(body.includes("fitLines")).toBe(false);
    expect(body.includes("approxW")).toBe(false);
    expect(body.includes("confirmFitLines")).toBe(false);
    expect(body.includes("fitOne(text, t.maxW, t.px)")).toBe(true);
  });

  it("视图层不算几何:rowTextY / confirmRects / CONFIRM_* 一个都不出现", () => {
    const body = bodyOf(codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts")));
    for (const banned of ["rowTextY", "confirmRects", "CONFIRM_W", "CONFIRM_H", "CONFIRM_BTN_W", "CONFIRM_BTN_H", "CONFIRM_BTN_GAP", "buildConfirmLayout", "confirmScreenLayout"]) {
      expect(body.includes(banned), banned).toBe(false);
    }
  });

  it("正文行数上限单一事实源:视图从 CF_BODY_MAX_LINES 建节点,不写死枚数", () => {
    const body = bodyOf(codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts")));
    expect(body.includes("i < CF_BODY_MAX_LINES")).toBe(true);
    expect(body.includes('"Body1"')).toBe(false);
  });

  it("模型层不引 cc、不引宿主侧 ViewTable,也不复制共享层的几何常量", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    expect(model.includes('from "cc"')).toBe(false);
    expect(model.includes("ViewTable")).toBe(false);
    expect(model.includes('from "../game/ui/theme"')).toBe(true);
    for (const banned of ["(w - CONFIRM_W)", "(h - CONFIRM_H)", "CONFIRM_H - 16", "CONFIRM_BTN_W * 2", "CONFIRM_BTN_W + CONFIRM_BTN_GAP"]) {
      expect(model.includes(banned), banned).toBe(false);
    }
  });

  it("字号四档全在 fs 表内(本件没有 Web 写死的表外档)", () => {
    const L = laid(H_STD, TWO);
    const inFs: number[] = [FS.display, FS.title, FS.section, FS.body, FS.muted, FS.micro];
    for (const px of [L.title.px, L.body[0].px, L.body[1].px, L.okText.px, L.cancelText.px]) expect(inFs.includes(px)).toBe(true);
    expect([L.title.px, L.body[0].px, L.okText.px, L.cancelText.px]).toEqual([14, 14, 13, 14]);
    expect([L.title.bold, L.body[0].bold, L.okText.bold, L.cancelText.bold]).toEqual([true, false, false, true]);
  });

  it("四枚贴图键与 Web drawConfirm / themePaint 的实参逐字对应", () => {
    const web = webDrawConfirm();
    const paint = fileSource("../src/ui/themePaint.ts");
    expect(web.includes('drawNine(g, "panel_dark_corners", b.x, b.y, b.w, b.h, 32)')).toBe(true);
    expect(web.includes('drawNine(g, "banner_mid_navy", b.x + 14, b.y + 10, b.w - 28, 30, 13)')).toBe(true);
    expect(paint.includes('assets.drawNine(g, "btn_danger", x, y, w, h, 8)')).toBe(true);
    expect(paint.includes('assets.drawNine(g, "btn_minor", x, y, w, h, 8)')).toBe(true);
    const L = laid(H_STD);
    expect([L.panelKey, L.bannerKey, L.okKey, L.cancelKey]).toEqual(["panel_dark_corners", "banner_mid_navy", "btn_danger", "btn_minor"]);
  });

  it("模型里出现的每一段中文字面量都能在 Web 的弹层段或商店工具钮段里找到", () => {
    const code = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmModel.ts"));
    const web = webDrawConfirm() + webShopTools();
    const lits = [...code.matchAll(/"([^"\n]*[㐀-鿿][^"\n]*)"/g)].map((m) => m[1]);
    expect(lits.length).toBeGreaterThanOrEqual(5);
    for (const lit of lits) expect(web.includes(lit), lit).toBe(true);
  });

  it("Web 的七处内联几何数在基准源码里逐字成对(横幅 / 标题 / 三处正文基线 / 两处钮内基线)", () => {
    const web = webDrawConfirm();
    for (const frag of ["b.x + 14, b.y + 10, b.w - 28, 30", "b.x + b.w / 2, b.y + 30", "b.x + b.w / 2, b.y + 67", "b.x + b.w / 2, b.y + 89", "b.x + b.w / 2, b.y + 80", "this.fitLines(this.confirm.text, b.w - 40)"]) {
      expect(web.includes(frag), frag).toBe(true);
    }
    const paint = fileSource("../src/ui/themePaint.ts");
    expect(paint.includes("x + w / 2, y + h / 2 + 4")).toBe(true);
    expect(paint.includes("x + w / 2, y + h / 2 + 5")).toBe(true);
  });
});

/* ==================== 9. 接线计数守卫 ==================== */

describe("GameShell 接线计数守卫", () => {
  const src = fileSource("../cocos/assets/scripts/GameShell.ts");
  const body = codeOf(src);
  const section = codeOf(src.slice(src.indexOf("/* ================= 二次确认弹层"), src.indexOf("/* ================= 主循环")));

  it("弹层不挂路由:SCREEN_KEYS 仍是 16 态、注册列表里没有 confirm、sync 钩子仍是 13 条", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keys = [...router.slice(router.indexOf("export const SCREEN_KEYS"), router.indexOf("] as const")).matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(keys.length).toBe(16);
    expect(keys.includes("confirm")).toBe(false);
    const list = body.slice(body.indexOf('(["battle", "menu"'), body.indexOf("] as ScreenKey[])"));
    expect((list.match(/"/g) || []).length / 2).toBe(16);
    expect(list.includes("confirm")).toBe(false);
    const hooks = body.slice(body.indexOf("const hooks: Partial<Record<ScreenKey"), body.indexOf("] as ScreenKey[])"));
    expect((hooks.match(/: \(\) => this\.sync\w+\(\)/g) || []).length).toBe(13);
    expect(hooks.includes("confirm")).toBe(false);
  });

  it("弹层挂在 Overlay 常驻层上,与 toast 同一条通路,且不落进任何 Screen:<key>", () => {
    expect(section.includes("this.overlay ?? this.worldLayer")).toBe(true);
    expect(section.includes("screenLayer")).toBe(false);
    expect(section.includes("Screen:")).toBe(false);
    // 装配点在 Overlay 建出之后(Overlay 是 World 的末子节点,晚于所有 build*Screen)
    const layers = body.slice(body.indexOf("private buildLayers()"), body.indexOf("private buildScreens()"));
    expect(layers.indexOf("this.overlay = makeNode(\"Overlay\", this.worldLayer);")).toBeGreaterThan(0);
    expect(layers.indexOf("this.buildConfirmLayer();")).toBeGreaterThan(layers.indexOf("this.overlay = makeNode(\"Overlay\", this.worldLayer);"));
    expect(layers.match(/this\.build\w+Screen\(\);/g)?.length).toBe(14);
    // toast 也挂在同一层
    expect(body.includes('makeNode("Toast", this.overlay ?? this.worldLayer)')).toBe(true);
  });

  it("广告闸门:全文件仍只有 watchAd 首行那一道,弹层分节里一个 adPending 都没有", () => {
    expect((body.match(/if \(this\.adPending\) return;/g) || []).length).toBe(1);
    expect(section.includes("adPending")).toBe(false);
    expect(section.includes("watchAd")).toBe(false);
    expect(section.includes("showRewardedAd")).toBe(false);
  });

  it("弹层不改存档:分节里没有 persist / writeSave / commit*", () => {
    for (const banned of [".persist", "writeSave", "commit", "save."]) expect(section.includes(banned), banned).toBe(false);
  });

  it("openConfirm 全仓两个调用点,都在商店右上角工具钮里(Web 同数)", () => {
    const calls = body.match(/this\.openConfirm\(/g) || [];
    // 一处是定义体外的调用计数:定义那一行是 `private openConfirm(`,不匹配 `this.openConfirm(`
    expect(calls.length).toBe(2);
    const shop = body.slice(body.indexOf("private onShopAction("), body.indexOf("private restartRun()"));
    expect((shop.match(/this\.openConfirm\(/g) || []).length).toBe(2);
    expect(shop.includes('this.openConfirm(CONFIRM_PROMPT_RESTART, () => this.restartRun());')).toBe(true);
    expect(shop.includes('this.openConfirm(CONFIRM_PROMPT_HOME, () => this.closeShop(false));')).toBe(true);
    // 确认后执行的仍是原来那两个调用,且工具钮那两支不再直接执行
    expect(shop.includes("this.restartRun();\n")).toBe(false);
    expect(webShopTools().match(/this\.openConfirm\(/g)?.length).toBe(2);
  });

  it("确认命中先清空再执行(Web 的 const ok = …; this.confirm = null; ok() 同序)", () => {
    const act = body.slice(body.indexOf("private onConfirmAction("), body.indexOf("/* ================= 主循环"));
    const clearAt = act.indexOf("this.confirm = null;");
    const runAt = act.indexOf("req.ok();");
    expect(clearAt).toBeGreaterThan(0);
    expect(runAt).toBeGreaterThan(clearAt);
    expect(act.includes('if (a.kind === "ok") req.ok();')).toBe(true);
    // 取消那一支不执行任何闭包:ok() 只出现在 kind === "ok" 的守卫之后
    expect((act.match(/req\.ok\(\)/g) || []).length).toBe(1);
    // 弹层自己不切屏:切屏发生在闭包里(restartRun / closeShop)
    expect(act.includes("router.show")).toBe(false);
  });

  it("弹层开着时每次 sync 都重排,并且视图根节点随 confirm 起落", () => {
    expect(section.includes("v.root.active = !!this.confirm;")).toBe(true);
    expect(section.includes("confirmScreenLayout(DESIGN_W, logicalH(), this.confirm ? this.confirm.text : \"\", approxW)")).toBe(true);
    expect(section.includes("v.sync();")).toBe(true);
    // 晚到贴图流:换引用 + 开着就补排一次(弹层不挂路由,故没有 router.current 那一道)
    expect(body.includes("this.confirmView?.setFrames(this.frames);")).toBe(true);
    expect(body.includes("if (this.confirm) this.syncConfirm();")).toBe(true);
  });

  it("点击拦截靠 Overlay 的兄弟序 + Capture 的 propagationStopped,不在屏级 action 里加早退", () => {
    const view = codeOf(fileSource("../cocos/assets/scripts/confirm/ConfirmView.ts"));
    expect(view.includes("e.propagationStopped = true;")).toBe(true);
    expect(view.includes("placeRect(this.capture, fullRect())")).toBe(true);
    // 屏级 action 段一律没有被塞进「弹层开着就 return」这类早退
    for (const name of ["onShopAction", "onMenuAction", "onEnergyAction"]) {
      const at = body.indexOf(`private ${name}(`);
      expect(at, name).toBeGreaterThan(0);
    }
    const shop = body.slice(body.indexOf("private onShopAction("), body.indexOf("private restartRun()"));
    expect(shop.includes("this.confirm")).toBe(false);
  });

  it("Web 的绘制顺序基准:drawConfirm 是 render 的最后一步,排在所有屏之后", () => {
    const web = webSource();
    const at0 = web.indexOf("private render(): void");
    expect(at0).toBeGreaterThan(0);
    const nextAt = web.indexOf("\n  private ", at0 + 10);
    const render = web.slice(at0, nextAt > 0 ? nextAt : web.length);
    const at = render.indexOf("if (this.confirm) this.drawConfirm(g, w, h);");
    expect(at).toBeGreaterThan(0);
    for (const frag of ['this.state === "shop") this.drawShop', 'this.state === "energy") this.drawEnergy', "this.drawJoystick(g);"]) {
      expect(render.indexOf(frag)).toBeGreaterThan(0);
      expect(render.indexOf(frag)).toBeLessThan(at);
    }
  });
});

/* ==================== 10. import 完整性(门 3 抓不到的那一类) ==================== */

describe("import 完整性:每一个用到的出口都必须在 import 清单里", () => {
  const modelSpec = { label: "ConfirmModel", ns: cocosConfirmModel as unknown as Record<string, unknown> };
  const themeSpec = { label: "theme", ns: cocosTheme as unknown as Record<string, unknown> };
  const panelKitSpec = { label: "PanelKit", ns: PANEL_KIT_NS };

  it("ConfirmModel 用到的共享层出口全部在它的 import 清单里", () => {
    expect(missingImports("../cocos/assets/scripts/confirm/ConfirmModel.ts", [themeSpec])).toEqual([]);
  });

  it("ConfirmView 用到的模型出口与 PanelKit 出口全部在它的 import 清单里", () => {
    expect(missingImports("../cocos/assets/scripts/confirm/ConfirmView.ts", [modelSpec, panelKitSpec])).toEqual([]);
  });

  it("GameShell 用到的 confirm 模型出口与 approxW 全部在它的 import 清单里", () => {
    expect(missingImports("../cocos/assets/scripts/GameShell.ts", [modelSpec, panelKitSpec])).toEqual([]);
  });

  it("同一把尺子量已落地的两侧:energy 与 victory 的历史缺陷仍在清单里", () => {
    expect(
      missingImports("../cocos/assets/scripts/energy/EnergyView.ts", [
        { label: "energyLayout", ns: cocosEnergyLayout as unknown as Record<string, unknown> },
        { label: "EnergyModel", ns: cocosEnergyModel as unknown as Record<string, unknown> },
      ])
    ).toEqual([]);
    expect(
      missingImports("../cocos/assets/scripts/victory/VictoryView.ts", [
        { label: "victoryLayout", ns: cocosVictoryLayout as unknown as Record<string, unknown> },
        { label: "VictoryModel", ns: cocosVictoryModel as unknown as Record<string, unknown> },
      ])
    ).toEqual([]);
    expect(missingImports("../cocos/assets/scripts/GameShell.ts", [{ label: "EnergyModel", ns: cocosEnergyModel as unknown as Record<string, unknown> }])).toEqual([]);
  });
});
