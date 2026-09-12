/**
 * 体力不足屏纯几何 —— Web `src/game.ts:drawEnergy`(4674-4745) 与 `energyLayout`(4660-4672)、
 * `onEnergyClick`(4746-4781) 的几何部分抽取。
 *
 * 单一出口：绘制与命中判定共读这一份矩形，宿主视图不产任何几何。
 *  - **内容块在面板可落区里垂直居中**：块 = 横幅 / 标题 / 读数 / 提示的文字族 + 纵排三枚钮，
 *    顶缘是横幅顶(`a − EN_BANNER_DY`)、底缘是关闭钮底缘(`bt + EN_CLOSE_DY + EN_CLOSE_H`)。
 *    块心对齐可落区中线，于是 996 与 1246 两档之间的富余等分成上下两道留白，面板下半部不再
 *    空着。两族之间的族间距仍按两条比例档之差走(`EN_FAMILY_RATIO_GAP = 0.42 − 0.3`)，
 *    居中只整体平移，不改一族的内部结构；**返回钮是屏幕角锚**
 *    `{ x: w − pad − backW, y: 22, w: 72, h: 34 }`，与屏高无关（与已落地各屏的返回钮同一口径，
 *    Web 这里也是裸 22），可落区上缘按它的下缘让位，内容块永不压到返回钮；
 *  - **本屏有面板底**：Web 先一笔全屏暗底 `rgba(8,10,16,0.92)`，再 `panelPad(g, w, h)`
 *    **不传专属键** —— 就是 `panel_dark_corners` 九宫格铺满 `[pad, w − pad] × [pad, h − pad]`
 *    （Web 的切深实参 32 在 Cocos 侧由 `ViewTable.borderOf` 按图推导，`EN_PANEL_NINE` 与已落地
 *    各屏的同类常量一样没有消费者，只是把 Web 的实参留在几何旁边供断言与翻新取用）；
 *  - 标题横幅 `banner_mid_black` 是 `assets.draw` 的**整幅拉伸且没有回退分支**（Web 不接返回值，
 *    缺图时收成零位盒、标题照落位），盒为 `(w/2 − 110, a − 30, 220, 40)`，**本屏没有半透明贴图件**；
 *  - 三枚钮等宽 320、横向同为 `cx − 160`（钮心就是屏心），高度依次 `52 / 46 / 40` 逐档递减，
 *    钮间距依次 `62 − 52 = 10` 与 `118 − 62 − 46 = 10`；钮内文字基线**全走 `rowTextY`**
 *    （与死亡 / 通关屏那两枚贴底钮的裸偏移不同口径 —— Web 本屏四处钮文字实参都是
 *    `rowTextY(r.y, r.h, px)`，于是本层不需要「Web 裸微调」这一族常量）；
 *  - 命中四段依次为返回钮 → 广告钮 → 钻石钮 → 关闭钮，四片矩形互不相交（按钮族三枚纵向
 *    留 10px 缝、返回钮在右上角且横向 `[474, 546]` 与钮列 `[120, 440]` 不相交），
 *    热区之外没有「其余一律」兜底。
 *
 * **本层没有任何随内容变的几何**：`canAd`（今日广告余量）与 `canDiamond`（钻石够不够）只改
 * 配色档与钮内文字，不改一枚矩形 —— 与死亡 / 通关屏的 `canDouble` 同性质。所以本层的入参
 * 只有 `(w, h)`，形态位全部留在模型层。
 *
 * 文本带限宽（`maxW`）是 Cocos 侧的口径：Web 的 `fillText` 不限宽。文字族与三枚钮内的文字
 * 一律取整屏带宽 `w − pad × 2`（三枚钮的钮心就是屏心，居中锚点与整屏一致；Web 那里
 * `▶ 看广告 +5 体力(今日剩 4 次)` 实测 188px、`钻石回满体力(10◆ · 持有 0)` 实测 195px，
 * 都比 320 的钮窄，所以这一档与按钮带宽同结果，只是不会在极端读数下造出 Web 没有的「…」）。
 * 唯一例外是返回钮：它贴在右上角，带宽只能给到钮宽 72，否则折出来的文本盒会探出画布。
 *
 * 字号是 Web 的 `fs` 表档：22 / 14 / 13 / 14 / 13 / 14 / 13（`fs.title` / `fs.body` / `fs.muted`
 * 三档轮流），**本屏没有 `fs` 表外的字面量档**，与死亡（26 / 15）和通关（20 / 15）两屏不同。
 * 它们仍留在本层，因为文本行的 `px` 是几何签名的一部分，而共享层读不到宿主侧的 ViewTable；
 * `tests/cocos-phase5-energy.test.ts` 把七处 `px` 与 `fs` 全表逐项锁开。
 *
 * 颜色、贴图键这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段（键前缀 `en`）；本文件只留几何。
 */

import { TB_ICON, TB_TITLE_DX, TB_TITLE_X } from "./titleBand";
import { evenDown, fs, rowTextY, ui } from "./theme";

/** 页边距 16 / 内容宽 528：右缘恒落 544（`ui.pad` 是 Web 冻结档 14，本屏不再用） */
export const EN_PAD = 16;
export const EN_CONTENT_W = 528;
/** 取偶下界住在共享层 `theme.ts`，这里原样再导出，免得每个屏各写一份 */
export { evenDown };

/** 左上原点设计像素矩形（与 core/DesignMetrics.Rect 同形；共享层不引宿主类型） */
export interface EnRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐，取值与 `ctx.textAlign` 一致 */
export type EnAlign = "left" | "center" | "right";

/** 一行文本的落位请求：x/baseY 就是 Web fillText 的锚点与基线，maxW 为限宽 */
export interface EnTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: EnAlign;
  bold: boolean;
}

/** 整屏几何 */
export interface EnergyLayout {
  /** 文字族纵向锚线（内容块居中位；横幅与三行文字都从它加减） */
  anchorY: number;
  /** 按钮族纵向锚线（= 广告钮顶缘；与 `anchorY` 同属一个内容块，整体平移，族间距走 `energyFamilyGap`） */
  btnAnchorY: number;
  /** 内容块的可落区（面板内缘之间，上缘再让开右上角返回钮） */
  contentBand: EnRect;
  /** 内容块自身矩形（顶 = 横幅顶缘，底 = 关闭钮底缘） */
  block: EnRect;
  /** 面板底盒（Web `panelPad` 的 `[pad, w − pad] × [pad, h − pad]`） */
  panel: EnRect;
  /** 面板底贴图键（Web 不传专属键，恒为 `panel_dark_corners`） */
  panelKey: string;
  /** 九宫切深（Web 的实参 32；Cocos 侧由 `ViewTable.borderOf` 按图推导，本层只留作断言锚点） */
  panelNine: number;
  /** 标题横幅盒（`a` 上方 30，220×40；整幅拉伸，没有缺图回退档） */
  banner: EnRect;
  /** v4 大徽记盒(energy_emblem) */
  emblem: EnRect;
  /** 「体力不足」 */
  title: EnTextLine;
  /** `体力 N/MAX · 每 X 分钟恢复 1 点` */
  statLine: EnTextLine;
  /** `补充体力继续闯关,或关闭回到主菜单` */
  hint: EnTextLine;
  /** 广告钮（贴图优先，`canAd` 为假时 Web 短路成纯代码形状；矩形不随形态位变） */
  adBtn: EnRect;
  adText: EnTextLine;
  /** 钻石回满钮（同上，`canDiamond` 只改配色档） */
  diamondBtn: EnRect;
  diamondText: EnTextLine;
  /** 关闭钮（纯代码矩形，Web 这里没有贴图） */
  closeBtn: EnRect;
  closeText: EnTextLine;
  /** 返回钮（纯代码矩形，屏幕右上角；Web 的放弃出口之一） */
  backBtn: EnRect;
  backText: EnTextLine;
  /** 三枚钮的横向公共锚点（`cx − 160`，钮心仍是屏心） */
  btnX: number;
  /** 钮列宽（三枚同宽） */
  btnW: number;
  /** 广告钮顶缘 → 钻石钮顶缘的步进（`EN_DIA_DY`） */
  adToDiamondStep: number;
  /** 钻石钮顶缘 → 关闭钮顶缘的步进（`EN_CLOSE_DY − EN_DIA_DY`） */
  diamondToCloseStep: number;
  /** 钮列底缘相对屏底的下沉（关闭钮底边到 `h` 的距离；内容块居中后它与块顶留白等分，不再随屏高线性走） */
  btnColumnBottomGap: number;
}

/* Web energyLayout / drawEnergy 的内联几何常量 */
/** 文字族与按钮族的**间距**比例档(含义:两族之比之差;绝对落位不再由它决定,见 `energyAnchorY`) */
export const EN_ANCHOR_RATIO = 0.3;
/** 按钮族相对屏高的比例(含义同上,本层只取 `EN_BTN_ANCHOR_RATIO − EN_ANCHOR_RATIO` 这一道差) */
export const EN_BTN_ANCHOR_RATIO = 0.42;
/** 内容块可落区上下各让出的呼吸位(含义:块缘到面板内缘 / 到返回钮下缘的最小留白;
 *  单位:设计 px;依据:与本屏页边距同一把尺,不引入第二个间距事实源;出处:`EN_PAD`) */
export const EN_BLOCK_INSET = EN_PAD;
/** 横幅：宽 / 高 / 半宽 / 相对文字锚线的上抬（半宽由宽度推导，不留第二个事实源） */
/** v4「深渊铭刻」顶带:通栏 64 高(与其它屏同档);标题金 16 左起、限宽到返回钮前 */
export const EN_V4_BAND: EnRect = { x: 0, y: 0, w: 560, h: 64 };
export function enV4Title(backX: number): EnTextLine {
  return { x: TB_TITLE_X, baseY: 26, maxW: backX - 28 - TB_TITLE_DX, px: 16, align: "left", bold: true };
}

/** v5 顶带徽记盒(与其余七屏同一份共享几何) */
export const EN_V4_ICON: EnRect = { ...TB_ICON };

/** v4 大徽记(energy_emblem 200×212):居中压在标题之上,底缘与标题横幅顶缘留 8 */
export const EN_V4_EMBLEM_W = 200;
export const EN_V4_EMBLEM_H = 212;
export function enV4Emblem(cx: number, bannerTop: number): EnRect {
  return { x: cx - evenDown(EN_V4_EMBLEM_W / 2), y: bannerTop - 8 - EN_V4_EMBLEM_H, w: EN_V4_EMBLEM_W, h: EN_V4_EMBLEM_H };
}

export const EN_BANNER_W = 220;
export const EN_BANNER_H = 40;
export const EN_BANNER_DX = evenDown(EN_BANNER_W / 2);
export const EN_BANNER_DY = 30;
/** 读数行与提示行相对文字锚线的基线偏移 */
export const EN_STAT_DY = 34;
export const EN_HINT_DY = 58;
/** 钮列：半宽 / 宽 / 三枚各自的高（关闭钮原档 40 低于热区下限，抬到 `ui.touchMin`） */
export const EN_BTN_W = 320;
export const EN_BTN_DX = evenDown(EN_BTN_W / 2);
export const EN_AD_H = 52;
export const EN_DIA_H = 46;
export const EN_CLOSE_H = Math.max(ui.touchMin, 40);
/** 钻石钮与关闭钮顶缘相对广告钮顶缘的下沉（Web 写的是裸 `+ 62` 与 `+ 118`） */
export const EN_DIA_DY = 62;
export const EN_CLOSE_DY = 118;
/** 返回钮顶缘（Web 的裸 22，与屏高无关） */
export const EN_BACK_Y = 22;
/** 面板九宫切深（Web `panelPad` → `drawNine(..., 32)` 的实参；无消费者，见文件头） */
export const EN_PANEL_NINE = 32;
/** 字号：Web 本屏七处 `g.font` 的档位，全在 `fs` 表内 */
export const EN_TITLE_PX = fs.title;
export const EN_STAT_PX = fs.body;
export const EN_HINT_PX = fs.muted;
export const EN_AD_PX = fs.body;
export const EN_DIA_PX = fs.muted;
export const EN_CLOSE_PX = fs.body;
export const EN_BACK_PX = fs.muted;
/** 钮底板描边宽度（Web 本屏四处都不设 lineWidth，取全项目「描边后复位 1」的约定档） */
export const EN_BTN_STROKE_W = 1;

/** 族间距（含义：文字族锚线 → 按钮族顶缘；单位：设计 px；依据：Web 两族的比例之差随屏高线性走，
 *  取偶是为了两档屏高都不掉出 2px 栅格；出处：`EN_ANCHOR_RATIO` 与 `EN_BTN_ANCHOR_RATIO`） */
export function energyFamilyGap(h: number): number {
  const hh = evenDown(h);
  return evenDown(hh * EN_BTN_ANCHOR_RATIO) - evenDown(hh * EN_ANCHOR_RATIO);
}

/** 内容块的可落区（含义：面板内缘之间、上下各让一道呼吸位，上缘再让开右上角返回钮的下缘；
 *  单位：设计 px；依据：块只能落在这道区间里，富余才会读成留白而不是没画完；
 *  出处：`EN_PAD` / `EN_BLOCK_INSET` 与 `energyBackBtn`） */
export function energyContentBand(w: number, h: number): EnRect {
  const hh = evenDown(h);
  const back = energyBackBtn(w);
  const top = Math.max(EN_PAD + EN_BLOCK_INSET, back.y + back.h + EN_BLOCK_INSET);
  const bottom = hh - EN_PAD - EN_BLOCK_INSET;
  return { x: EN_PAD, y: top, w: w - EN_PAD * 2, h: Math.max(0, bottom - top) };
}

/** 内容块高（顶 = 横幅上抬，底 = 族间距 + 关闭钮顶缘下沉 + 关闭钮高） */
export function energyBlockHeight(h: number): number {
  return EN_BANNER_DY + energyFamilyGap(h) + EN_CLOSE_DY + EN_CLOSE_H;
}

/** 文字族锚线 = 内容块居中位（块心对可落区中线，再补回横幅的上抬；屏高不够容纳块时贴可落区顶缘） */
export function energyAnchorY(w: number, h: number): number {
  const band = energyContentBand(w, h);
  const centered = band.y + Math.max(0, band.h - energyBlockHeight(h)) / 2 + EN_BANNER_DY;
  return evenDown(centered);
}

/** 按钮族顶缘（广告钮顶缘 = 内容块居中位 + 族间距） */
export function energyBtnTop(w: number, h: number): number {
  return energyAnchorY(w, h) + energyFamilyGap(h);
}

/** 广告钮矩形（`{ x: cx − 160, y: 按钮族顶缘, w: 320, h: 52 }`） */
export function energyAdBtn(w: number, h: number): EnRect {
  return { x: w / 2 - EN_BTN_DX, y: energyBtnTop(w, h), w: EN_BTN_W, h: EN_AD_H };
}

/** 钻石钮矩形（顶缘 = 广告钮顶缘 + 62） */
export function energyDiamondBtn(w: number, h: number): EnRect {
  return { x: w / 2 - EN_BTN_DX, y: energyBtnTop(w, h) + EN_DIA_DY, w: EN_BTN_W, h: EN_DIA_H };
}

/** 关闭钮矩形（顶缘 = 广告钮顶缘 + 118） */
export function energyCloseBtn(w: number, h: number): EnRect {
  return { x: w / 2 - EN_BTN_DX, y: energyBtnTop(w, h) + EN_CLOSE_DY, w: EN_BTN_W, h: EN_CLOSE_H };
}

/** 返回钮矩形（页边距走本屏 `EN_PAD`，热区抬到 `ui.touchMin`；命中区与绘制框逐位同一） */
export function energyBackBtn(w: number): EnRect {
  return { x: w - EN_PAD - ui.backW, y: EN_BACK_Y, w: ui.backW, h: Math.max(ui.touchMin, ui.backH) };
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): EnTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。本层不读存档、不查体力表、不看广告余量 —— 四个形态位（今日广告剩几次、钻石够不够）
 * 只改配色与文案，由 `energy/EnergyModel.ts` 按同一份存档算，不改这里任何一枚矩形。
 */
export function energyLayout(w: number, h: number): EnergyLayout {
  const pad = EN_PAD;
  const maxW = w - pad * 2;
  const a = energyAnchorY(w, h);
  const cx = w / 2;
  const ad = energyAdBtn(w, h);
  const dia = energyDiamondBtn(w, h);
  const close = energyCloseBtn(w, h);
  const back = energyBackBtn(w);
  const band = energyContentBand(w, h);
  return {
    anchorY: a,
    btnAnchorY: ad.y,
    contentBand: band,
    block: { x: band.x, y: a - EN_BANNER_DY, w: band.w, h: energyBlockHeight(h) },
    panel: { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 },
    panelKey: "panel_dark_corners",
    panelNine: EN_PANEL_NINE,
    banner: { x: cx - EN_BANNER_DX, y: a - EN_BANNER_DY, w: EN_BANNER_W, h: EN_BANNER_H },
    emblem: enV4Emblem(cx, a - EN_BANNER_DY),
    title: line(cx, a, maxW, EN_TITLE_PX, true),
    statLine: line(cx, a + EN_STAT_DY, maxW, EN_STAT_PX, false),
    hint: line(cx, a + EN_HINT_DY, maxW, EN_HINT_PX, false),
    adBtn: ad,
    adText: line(cx, rowTextY(ad.y, ad.h, EN_AD_PX), maxW, EN_AD_PX, true),
    diamondBtn: dia,
    diamondText: line(cx, rowTextY(dia.y, dia.h, EN_DIA_PX), maxW, EN_DIA_PX, true),
    closeBtn: close,
    closeText: line(cx, rowTextY(close.y, close.h, EN_CLOSE_PX), maxW, EN_CLOSE_PX, false),
    backBtn: back,
    backText: line(back.x + back.w / 2, rowTextY(back.y, back.h, EN_BACK_PX), back.w, EN_BACK_PX, false),
    btnX: ad.x,
    btnW: EN_BTN_W,
    adToDiamondStep: EN_DIA_DY,
    diamondToCloseStep: EN_CLOSE_DY - EN_DIA_DY,
    btnColumnBottomGap: h - (close.y + close.h),
  };
}

/** 整屏几何的单一出口（视图经宿主钩子调它；本层不读存档，故无形态位入参） */
export function energyScreenLayout(w: number, h: number): EnergyLayout {
  return energyLayout(w, h);
}
