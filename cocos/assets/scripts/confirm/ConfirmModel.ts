/**
 * 二次确认弹层的**几何、内容与命中**（纯逻辑，cc-free）—— Web `src/game.ts:drawConfirm`(1208-1240)、
 * `confirmLayout`(1197-1199)、`openConfirm`(1193-1195) 与 `handleTap` 里那一段确认优先分支(555-562)
 * 的抽取。
 *
 * 与已落地十六屏的分工同构，但**本件不是一张屏而是一层覆盖层**，两处因此不同：
 *  ① 它不挂路由（`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 仍是 16 态，一枚键都不加），
 *     而是挂在宿主 `Overlay` 常驻层上 —— Web 的 `if (this.confirm) this.drawConfirm(...)` 是
 *     `render()` 的**最后一步**(1927)，覆盖在所有屏之上，且**不随 `state` 切换消失**；
 *  ② 它没有写入意图（不改存档里的任何一个字段），确认后执行的是**宿主持有的闭包**
 *     （Web 的 `confirm.ok`），本层只把「点在哪一片」翻成 `ConfirmAction`。
 *
 * **盒与两枚钮的矩形一律转调共享层** `game/ui/theme.ts:confirmRects(w, h)`（97 行，
 * `CONFIRM_W 360 / CONFIRM_H 170 / CONFIRM_BTN_W 150 / CONFIRM_BTN_H 44 / CONFIRM_BTN_GAP 14`，
 * `btnY = by + CONFIRM_H − 16 − CONFIRM_BTN_H`）。那一份就是 Web `confirmLayout()` 的返回值本体
 * （Web 侧 `src/game.ts:1198` 也是直接 `return confirmRects(this.logicalW, this.logicalH)`），
 * 所以本文件不重算、也不抄写其中任何一个数；本文件只补 Web `drawConfirm` 里那些**内联在绘制代码中**
 * 的几何：标题横幅盒、四处基线与两处钮内文字基线。
 *
 * 六条 Web 原样口径（照抄，不在本层「修好」）：
 *  1. **正文按 `b.w − 40` 折行，最多画两行**：Web 的 `fitLines(text, b.w - 40)` 之后是
 *     `if (lines.length >= 2) { …67 …89 } else if (lines.length === 1) { …80 }` —— 折出三行以上
 *     时**第三行起根本不画**（不是缩小字号也不是滚动），本层照此截到 `CF_BODY_MAX_LINES = 2`；
 *  2. **两行与一行是两套不同的基线，不是「首行基线 + 行距」**：两行档 `+67` / `+89`（行距 22），
 *     一行档 `+80`（正好落在两行档的中缝上），Web 就是写了两个分支；
 *  3. **两枚钮的文字基线走裸偏移而不是 `rowTextY`**：`dangerButton` 是 `y + h/2 + 4`
 *     （`src/ui/themePaint.ts:56`）、`minorButton` 是 `y + h/2 + 5`（同文件 79 行），
 *     同档实参下 `rowTextY(44)` 会给 `+26`/`+27`，两者差 4px 与 5px —— 与死亡 / 通关屏那两枚
 *     贴底钮同一口径，与体力屏的「四处全走 rowTextY」不同口径；
 *  4. **两枚钮的字号与粗体不对称**：`dangerButton` 用 `F(fs.muted)`（13px，**不粗**），
 *     `minorButton` 用 `F(fs.body, true)`（14px，**粗**），标题用 `F(fs.body, true)`；
 *  5. **确认命中先清空再执行**：Web 是 `const ok = this.confirm.ok; this.confirm = null; ok();`
 *     —— 顺序保证 `ok()` 里再开一次确认（或再切屏）时读到的是已清空的状态；取消只清空；
 *  6. **其余任何点击一律吞掉**：Web 的确认分支末尾是无条件 `return`(562)，不落到下面的屏级分发，
 *     所以「热区之外」在本层返回 `null`，而宿主视图那张整屏 Capture **照样吃掉这一下**
 *     （`null` 的语义是「吞掉、什么都不做」，不是「交给下一层」）。
 *
 * 一处两端差异（比 Web 少一条出口）：Web 的 `onKey`(754-755) 在 `confirm` 非空时只认 Escape →
 * 清空并**整段 return**（弹层期间键盘的其余分支也一并失效）；Cocos 侧没有键盘通路，
 * 这一支不迁，与体力屏同口径。
 *
 * 折行算法（`confirmFitLines`）逐行对标 Web `src/game.ts:5308-5322` 的 `fitLines`：
 * 逐码点试探、只在**已有内容**时才断行（首字符再宽也单独成行，不会死循环）、末尾余行补推。
 * Web 量字用 `ctx.measureText`，Cocos 侧没有 Canvas2D，故量字函数 `measure` 做成**入参**：
 * 宿主注入 `ui/PanelKit.approxW`（近似量字，系数走 `viewTable().hud` 的 `asciiWidth` / `spaceWidth`），
 * 本文件不复制那份系数、也不另写一套量字。
 */

import { CONFIRM_BTN_H, CONFIRM_BTN_W, CONFIRM_H, CONFIRM_W, confirmRects, evenDown, fs } from "../game/ui/theme";

/** 左上原点设计像素矩形（与 core/DesignMetrics.Rect 同形；共享层不引宿主类型） */
export interface CfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐，取值与 `ctx.textAlign` 一致 */
export type CfAlign = "left" | "center" | "right";

/** 一行文本的落位请求：x/baseY 就是 Web fillText 的锚点与基线，maxW 为限宽 */
export interface CfTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: CfAlign;
  bold: boolean;
}

/** 弹层的完整几何（盒与两枚钮来自 `confirmRects`，其余是 `drawConfirm` 的内联几何） */
export interface ConfirmLayout {
  /** 盒 360×170 屏幕居中（= `confirmRects().box`） */
  box: CfRect;
  /** 确认钮（左，= `confirmRects().ok`） */
  ok: CfRect;
  /** 取消钮（右，= `confirmRects().cancel`） */
  cancel: CfRect;
  /** 盒底垫贴图键（Web `drawNine` 的第一实参，缺图回退 `panel()` 的代码底板 + 金描边） */
  panelKey: string;
  /** 盒底垫九宫切深（Web 的实参 32；Cocos 侧由 `ViewTable.borderOf` 按图推导，无消费者） */
  panelNine: number;
  /** 标题横幅盒 `(b.x+14, b.y+10, b.w−28, 30)` */
  banner: CfRect;
  /** 标题横幅贴图键（缺图回退平面底 + 1px 细描边，Web 这一支显式写了回退） */
  bannerKey: string;
  /** 横幅九宫切深（Web 的实参 13；同上无消费者） */
  bannerNine: number;
  /** 标题「确认操作」：粗体 `fs.body`、居中、基线 `b.y + 30` */
  title: CfTextLine;
  /** 正文行（0 / 1 / 2 条，条数 = `min(折行数, CF_BODY_MAX_LINES)`） */
  body: CfTextLine[];
  /** 正文限宽 `b.w − 40`（Web `fitLines` 的第二实参，同时也是每行文本带的 maxW） */
  bodyMaxW: number;
  /** 确认钮贴图键（`dangerButton` 里的 `drawNine("btn_danger", …, 8)`） */
  okKey: string;
  /** 确认钮文字：`fs.muted` **不粗**、基线 `y + h/2 + 4` */
  okText: CfTextLine;
  /** 取消钮贴图键（`minorButtonBg` 里的 `drawNine("btn_minor", …, 8)`） */
  cancelKey: string;
  /** 取消钮文字：`fs.body` **粗体**、基线 `y + h/2 + 5` */
  cancelText: CfTextLine;
  /** 钮内文字限宽（= 钮宽；两枚钮的钮心与盒心同轴，故文本带与整屏居中段一致） */
  btnTextMaxW: number;
  /** 两枚钮底板缺图回退时的描边宽度（Web 两处都是 `lineWidth = 1`） */
  btnStrokeW: number;
}

/** 一屏文案（标题与两枚钮的字面量恒定，正文按折行结果给 0..2 条） */
export interface ConfirmContent {
  title: string;
  body: string[];
  okText: string;
  cancelText: string;
}

/** 几何 + 内容一帧（宿主一次算出，视图的两个钩子各取一半） */
export interface ConfirmFrame {
  layout: ConfirmLayout;
  content: ConfirmContent;
}

/** 宿主的一次确认请求（对标 Web `private confirm: { text: string; ok: () => void } | null`） */
export interface ConfirmRequest {
  text: string;
  ok: () => void;
}

/** 量字函数：宿主注入 `ui/PanelKit.approxW`（本层不复制系数） */
export type ConfirmMeasure = (text: string, px: number) => number;

/* ---------- Web drawConfirm / themePaint 的内联几何常量 ---------- */

/** 盒底垫九宫切深（`src/game.ts:1214` 的实参 32） */
export const CF_PANEL_NINE = 32;
/** 钮底缘到盒底缘的下抬（共享层 `confirmRects` 里是同一个 16 的内联实参） */
export const CF_BTN_BOTTOM_INSET = 16;
/** 标题横幅：左右内缩 / 顶缘下沉 / 高 / 九宫切深（`src/game.ts:1217` 的 `b.x+14, b.y+10, b.w−28, 30, 13`） */
export const CF_BANNER_INSET = 14;
export const CF_BANNER_TOP = 10;
export const CF_BANNER_H = 30;
export const CF_BANNER_NINE = 13;
/** 标题基线相对盒顶（`src/game.ts:1227`） */
export const CF_TITLE_DY = 30;
/** 正文基线：两行档两行（`src/game.ts:1232-1233`）与一行档那一行（`src/game.ts:1235`） */
export const CF_BODY_DY_L1 = 67;
export const CF_BODY_DY_L2 = 89;
export const CF_BODY_DY_ONE = 80;
/** 正文限宽的每边内缩（Web 写的是 `b.w - 40`，即每边 20） */
export const CF_BODY_INSET = 20;
/** 正文最多画几行（Web 的 `lines[0]` / `lines[1]` 两支，第三行起不画） */
export const CF_BODY_MAX_LINES = 2;
/** 两枚钮内文字的裸基线偏移（`src/ui/themePaint.ts:56` 的 `+4` 与 79 行的 `+5`） */
export const CF_OK_TEXT_DY = 4;
export const CF_CANCEL_TEXT_DY = 5;
/** 字号四档，全在 `fs` 表内（Web 本件没有表外字号） */
export const CF_TITLE_PX = fs.body;
export const CF_BODY_PX = fs.body;
export const CF_OK_PX = fs.muted;
export const CF_CANCEL_PX = fs.body;
/** 缺图回退时的描边宽度（横幅那一笔 Web 显式写 `lineWidth = 1`，两枚钮沿用同一约定档） */
export const CF_BTN_STROKE_W = 1;

/**
 * 商店「重开」钮的确认文案（Web `src/game.ts:1567` 的 `openConfirm` 第一实参，逐字照抄：
 * 问号是半角 `?`、句号是全角 `。`）。
 */
export const CONFIRM_PROMPT_RESTART = "确定重开本局?当前章节进度与金币将丢失。";

/** 商店「主页」钮的确认文案（Web `src/game.ts:1569`，同上逐字照抄） */
export const CONFIRM_PROMPT_HOME = "确定返回主菜单?本局进度将丢失。";

function center(x: number, baseY: number, maxW: number, px: number, bold: boolean): CfTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/** 正文限宽（= Web `fitLines(text, b.w - 40)` 的第二实参） */
export function confirmBodyMaxW(boxW: number): number {
  return boxW - CF_BODY_INSET * 2;
}

/**
 * 按像素宽度折行 —— 逐行对标 Web `src/game.ts:5308-5322` 的 `fitLines`。
 * 量字口径由 `measure` 注入（宿主给 `ui/PanelKit.approxW`），本函数只负责断行规则：
 * 逐码点试探、`line` 非空且试探超宽才断行（首字符再宽也单独成行）、末尾余行补推。
 */
export function confirmFitLines(text: string, maxW: number, px: number, measure: ConfirmMeasure): string[] {
  const out: string[] = [];
  let line = "";
  for (const c of [...text]) {
    const test = line + c;
    if (line && measure(test, px) > maxW) {
      out.push(line);
      line = c;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * 弹层几何。盒与两枚钮**整体来自共享层 `confirmRects`**（本函数一枚数都不重算），
 * 其余是 Web `drawConfirm` 内联的横幅盒与四处基线。
 * `lines` 是**已折好**的正文行（由 `confirmFitLines` 产出），条数决定正文基线走哪一档：
 * ≥2 → `+67` / `+89`（只取前两行）、1 → `+80`、0 → 一条都不画。
 */
export function buildConfirmLayout(w: number, h: number, lines: string[]): ConfirmLayout {
  const R = confirmRects(w, h);
  // 共享层的盒顶是原始居中除法（996 档算出 413 的奇数），九宫格底板会错半格 → Cocos 侧取偶
  const b = { x: R.box.x, y: evenDown(R.box.y), w: R.box.w, h: R.box.h };
  const btnY = b.y + CONFIRM_H - CF_BTN_BOTTOM_INSET - CONFIRM_BTN_H;
  const left = b.x + evenDown((CONFIRM_W - (CONFIRM_BTN_W * 2 + CF_BTN_GAP)) / 2);
  const ok = { x: left, y: btnY, w: CONFIRM_BTN_W, h: CONFIRM_BTN_H };
  const cancel = { x: left + CONFIRM_BTN_W + CF_BTN_GAP, y: btnY, w: CONFIRM_BTN_W, h: CONFIRM_BTN_H };
  const cx = b.x + b.w / 2;
  const body = lines.slice(0, CF_BODY_MAX_LINES);
  const two = body.length >= CF_BODY_MAX_LINES;
  const bodyMaxW = confirmBodyMaxW(b.w);
  const btnTextMaxW = CONFIRM_BTN_W;
  return {
    box: b,
    ok,
    cancel,
    panelKey: "panel_dark_corners",
    panelNine: CF_PANEL_NINE,
    banner: { x: b.x + CF_BANNER_INSET, y: b.y + CF_BANNER_TOP, w: b.w - CF_BANNER_INSET * 2, h: CF_BANNER_H },
    bannerKey: "banner_mid_navy",
    bannerNine: CF_BANNER_NINE,
    title: center(cx, b.y + CF_TITLE_DY, b.w - CF_BANNER_INSET * 2, CF_TITLE_PX, true),
    body: body.map((_, i) => center(cx, b.y + (two ? (i === 0 ? CF_BODY_DY_L1 : CF_BODY_DY_L2) : CF_BODY_DY_ONE), bodyMaxW, CF_BODY_PX, false)),
    bodyMaxW,
    okKey: "btn_danger",
    okText: center(ok.x + ok.w / 2, ok.y + ok.h / 2 + CF_OK_TEXT_DY, btnTextMaxW, CF_OK_PX, false),
    cancelKey: "btn_minor",
    cancelText: center(cancel.x + cancel.w / 2, cancel.y + cancel.h / 2 + CF_CANCEL_TEXT_DY, btnTextMaxW, CF_CANCEL_PX, true),
    btnTextMaxW,
    btnStrokeW: CF_BTN_STROKE_W,
  };
}

/** 一屏文案：标题与两枚钮的字面量恒定，正文取折行结果的前两行（与几何同一把尺子） */
export function buildConfirmContent(lines: string[]): ConfirmContent {
  return {
    title: "确认操作",
    body: lines.slice(0, CF_BODY_MAX_LINES),
    okText: "确认",
    cancelText: "取消",
  };
}

/**
 * 一帧几何 + 一屏文案的单一出口（宿主 `syncConfirm` 只调这一发）。
 * 折行发生在**这里**而不是视图里：正文条数会改基线档（一行 `+80` / 两行 `+67`·`+89`），
 * 于是「量字 → 折行 → 基线」是一条几何链，视图只按结果落节点。
 */
export function confirmScreenLayout(w: number, h: number, text: string, measure: ConfirmMeasure): ConfirmFrame {
  const lines = confirmFitLines(text, confirmBodyMaxW(CONFIRM_W), CF_BODY_PX, measure);
  return { layout: buildConfirmLayout(w, h, lines), content: buildConfirmContent(lines) };
}

/**
 * 命中判定（对标 Web `handleTap` 的确认优先分支，`src/game.ts:555-562`）：
 * 先确认钮、再取消钮，**两段之外一律 `null`**。
 * `null` 在本件的语义不是「交给下一层」而是「吞掉、什么都不做」—— Web 那一段末尾是无条件
 * `return`，宿主视图那张整屏 Capture 也因此对每一下都停止事件传播。
 */
export type ConfirmAction = { kind: "ok" } | { kind: "cancel" };

export function hitConfirm(L: ConfirmLayout, x: number, y: number): ConfirmAction | null {
  const inRect = (r: CfRect): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inRect(L.ok)) return { kind: "ok" };
  if (inRect(L.cancel)) return { kind: "cancel" };
  return null;
}

/* ---------- 只供断言取用的共享层常量转出口（本层不重算，转手即同一份） ---------- */

/** 盒与钮的五个共享层常量（`game/ui/theme.ts:91-95`），转出口只为测试不必两头 import */
export const CF_BOX_W = CONFIRM_W;
export const CF_BOX_H = CONFIRM_H;
export const CF_BTN_W = CONFIRM_BTN_W;
export const CF_BTN_H = CONFIRM_BTN_H;
/**
 * 钮间距：Cocos 侧分档为 16。共享层 `CONFIRM_BTN_GAP` 是 14 且被 Web 共读，不能动；
 * 而 14 会让「双钮列在盒内居中」的半余量算出奇数 23，整行错半格，故在 Cocos 层另立一档。
 */
export const CF_BTN_GAP = 16;
