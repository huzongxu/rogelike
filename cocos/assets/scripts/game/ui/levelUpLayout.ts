/**
 * 升级三选一弹层纯几何(批次 A · A2 的新界面)—— **本屏没有 Web 基准**,几何从零设计,
 * 唯一硬约束是"不与任何已验收屏抢位置":它是一层覆盖层,弹在战斗屏之上,战斗屏锁 560×996。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。三条纪律与已落地各屏同款:
 *  - **坐标与宽高一律取偶**(像素栅格 module = 2,奇数坐标会让九宫格底板错半格),取偶下界
 *    `evenDown` 住在 `./theme`,本层原样再导出不另写一份;
 *  - **横向落在内容列 `[16, 544]`**:页边距 16、内容宽 528,与 `./shop.ts` 的
 *    `SHOP_PAD` / `CONTENT_W` 同一把尺(16 + 3×168 + 2×12 = 544);
 *  - **纵向不越 `[0, screenH]`**:盒在整屏垂直居中,两档屏高(996 与 1246)各留 ≥222 的上下留白,
 *    于是任何一档都不会顶出画布;盒高恒定,富余全落成上下等分留白(与体力屏的内容块居中同口径)。
 *
 * 盒内纵向地图(单位:设计 px,全部相对各自父盒顶缘且**均为偶数**):
 *  横幅 16..56 → 读数基线 82 → 卡片带 98..510(卡高 412)→ 底提示基线 536 → 盒底 552。
 * 卡内纵向地图:品质档基线 22 → 卡名基线 44 → 八条描述基线 68 + i×18 → 数值差基线 216 →
 *  状态标签基线 238 → 三枚钮 256 / 306 / 356(各高 44 = `ui.touchMin`,钮间缝 6)→ 卡底 412。
 *
 * 文本基线不走 `rowTextY`:那一支 `round(y + h/2 + px/3)` 在 44 高 + 13px 下给 +26(偶)、
 * 在 44 高 + 14px 下给 +25(奇),整行错半格。本屏没有 Web 裸偏移要对标,故一律用**具名偶数档**
 * (`LV_BTN_TEXT_DY` = 26 等),基线与矩形同栅格。
 *
 * 颜色、贴图键这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `lv`);本文件只留几何。
 */

import { evenDown, fs, ui } from "./theme";

/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const LV_PAD = 16;
export const LV_CONTENT_W = 528;
/** 取偶下界住在 `./theme`,这里原样再导出,免得每屏各写一份 */
export { evenDown };

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface LvRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type LvAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 fillText 的锚点与基线,maxW 为限宽 */
export interface LvTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: LvAlign;
  bold: boolean;
}

/** 一枚钮:底板矩形 + 钮内文字位(文字恒居中于钮,基线走具名偶数档) */
export interface LvBtn {
  rect: LvRect;
  text: LvTextLine;
}

/** 一张卡:卡框 + 六族文本 + 三枚钮 */
export interface LvCardLayout {
  idx: number;
  /** 卡框矩形(品质框,走 `ui/PanelKit.qualityBox`) */
  rect: LvRect;
  /** v6 卡中徽记盒 */
  emblem: LvRect;
  /** `史诗 · Lv.5`(卡内左上,fs.micro) */
  quality: LvTextLine;
  /** 卡名(`buildName` 的产出,fs.body 粗) */
  name: LvTextLine;
  /** 词条描述行(恒 `LV_DESC_MAX_LINES` 条槽位,有没有字由内容层给) */
  descLines: LvTextLine[];
  /** 强化数值差一行(`伤害 12 → 13`;非强化卡为空串,槽位仍在) */
  delta: LvTextLine;
  /** 状态标签一行(`新装备` / `强化现有` / `已锁定` / `隐藏词条!`) */
  tag: LvTextLine;
  /** 选它 */
  pick: LvBtn;
  /** 重随(钮上带价) */
  reroll: LvBtn;
  /** 锁定 / 解锁 */
  lock: LvBtn;
}

/** 整层几何 */
export interface LevelUpLayout {
  /** 盒(内容列宽 528、恒高 552、整屏垂直居中且取偶) */
  box: LvRect;
  /** 盒底垫贴图键(与二次确认弹层同一枚九宫格底板) */
  panelKey: string;
  /** 盒底垫九宫切深(Cocos 侧由 `ViewTable.borderOf` 按图推导,本层只留作断言锚点) */
  panelNine: number;
  /** 标题横幅盒 */
  banner: LvRect;
  /** 标题横幅贴图键 */
  bannerKey: string;
  /** 横幅九宫切深(同上,无消费者) */
  bannerNine: number;
  /** 标题(横幅带内居中,fs.section 粗) */
  title: LvTextLine;
  /** 读数行:金币 / 重随价 / 隐藏保底进度(盒内居中,fs.muted) */
  readout: LvTextLine;
  /** 三张卡(恒 `LV_CARDS` 张,与 layout 逐位对齐) */
  cards: LvCardLayout[];
  /** 底部提示行(盒内居中,fs.muted) */
  hint: LvTextLine;
  /** 卡框描边宽度(与融合屏三选一卡片同档) */
  cardStrokeW: number;
  /** 三枚钮的底板描边宽度(纯代码矩形档,全项目"描边后复位 1"的约定值) */
  btnStrokeW: number;
}

/* ================= 盒与横幅 ================= */

/** 盒宽 = 内容列宽(横向铺满 `[16, 544]`,不再内缩) */
export const LV_BOX_W = LV_CONTENT_W;
/** 盒内文本带的每边内缩(标题 / 读数 / 底提示共读这一档) */
export const LV_BOX_TEXT_INSET = 16;
/** 盒内文本限宽 = 528 − 16×2 = 496 */
export const LV_BOX_TEXT_MAX_W = LV_BOX_W - LV_BOX_TEXT_INSET * 2;
/** 横幅:左右内缩 / 顶缘下沉 / 高 / 九宫切深(与二次确认弹层同一档横幅规格) */
export const LV_BANNER_INSET = LV_BOX_TEXT_INSET;
export const LV_BANNER_TOP = 16;
export const LV_BANNER_H = 40;
export const LV_BANNER_NINE = 13;
/** 盒底垫九宫切深(与二次确认弹层同一档) */
export const LV_PANEL_NINE = 32;
/** 标题基线相对横幅顶缘(横幅高 40、字号 16 → 带内垂直居中偏下一格,取偶) */
export const LV_TITLE_DY = 26;
/** 读数行基线相对盒顶缘(= 横幅底缘 56 之下 26) */
export const LV_READOUT_DY = 82;

/* ================= 卡片带 ================= */

/** 卡片带顶缘相对盒顶缘 */
export const LV_CARDS_DY = 98;
/** 三张卡:等宽 168、间距 12(16 + 3×168 + 2×12 = 544,右缘正好落内容列右界) */
export const LV_CARDS = 3;
export const LV_CARD_W = 168;
export const LV_CARD_GAP = 12;
/** 卡内文本与钮的每边内缩 */
export const LV_CARD_INSET = 12;
/** 卡内文本限宽 = 168 − 12×2 = 144 */
export const LV_CARD_TEXT_MAX_W = LV_CARD_W - LV_CARD_INSET * 2;
/** 卡内各族基线相对卡顶缘(全偶数;描述八行的行距 18 = fs.micro 12 的 1.5 倍) */
export const LV_QUALITY_DY = 22;
export const LV_NAME_DY = 44;
export const LV_DESC_DY = 68;
export const LV_DESC_LINE = 18;
export const LV_DESC_MAX_LINES = 8;
export const LV_DELTA_DY = 216;
export const LV_TAG_DY = 238;
/** v6:卡中徽记水印(96 见方,顶缘落卡顶 104;压在描述文字之下) */
export const LV_EMBLEM_S = 96;
export const LV_EMBLEM_DY = 104;
/** 徽记枚数(素材表给了 3 枚,按卡位循环)与水印不透明度(0..255) */
export const LV_EMBLEM_N = 3;
export const LV_EMBLEM_ALPHA = 120;
/** 卡内每行的折行字符预算:CJK 一字 ≈ 1×px(与 `ui/PanelKit.approxW` 同档),故 = 限宽 / 字号 */
export const LV_DESC_CHARS = Math.floor(LV_CARD_TEXT_MAX_W / fs.micro);

/* ================= 卡内三枚钮 ================= */

/** 钮宽 = 卡内限宽(与文本同一条内缩尺) */
export const LV_BTN_W = LV_CARD_W - LV_CARD_INSET * 2;
/** 钮高取全项目最小触控高档,不留第二份"钮该多高"的口径 */
export const LV_BTN_H = ui.touchMin;
/** 钮间缝(三枚竖排:256 / 306 / 356) */
export const LV_BTN_GAP = 6;
/** 首枚钮(选它)顶缘相对卡顶缘 */
export const LV_BTN_TOP_DY = 256;
/** 钮内文字基线相对钮顶缘(钮高 44、字号 13 → 带内居中,取偶) */
export const LV_BTN_TEXT_DY = 26;
/** 三枚钮的纵向步进 = 钮高 + 钮间缝 */
export const LV_BTN_STEP = LV_BTN_H + LV_BTN_GAP;

/* ================= 盒高与底提示 ================= */

/** 末枚钮底缘到卡底缘的内缩(与卡内文本/钮的每边内缩不同轴,纵向单立一档) */
export const LV_CARD_BOTTOM_INSET = 12;
/** 卡高 = 钮列顶缘 + 两道步进 + 末枚钮高 + 卡底内缩 = 256 + 50×2 + 44 + 12 = 412 */
export const LV_CARD_H = LV_BTN_TOP_DY + LV_BTN_STEP * 2 + LV_BTN_H + LV_CARD_BOTTOM_INSET;
/** 底提示基线与卡片带底缘之间的缝(= 标题带与读数行之间那道 26,同一把尺) */
export const LV_HINT_GAP = 26;
/** 底提示基线相对盒顶缘 */
export const LV_HINT_DY = LV_CARDS_DY + LV_CARD_H + LV_HINT_GAP;
/** 盒底内缩(底提示基线到盒底缘) */
export const LV_BOX_BOTTOM_INSET = 16;
/** 盒高(恒定,不随屏高生长;两档屏高的富余全落成上下等分留白) */
export const LV_BOX_H = LV_HINT_DY + LV_BOX_BOTTOM_INSET;

/* ================= 字号与描边 ================= */

/** 字号七档,全在 `fs` 表内(本屏没有表外字号) */
export const LV_TITLE_PX = fs.section;
export const LV_READOUT_PX = fs.muted;
export const LV_QUALITY_PX = fs.micro;
export const LV_NAME_PX = fs.body;
export const LV_DESC_PX = fs.micro;
export const LV_DELTA_PX = fs.muted;
export const LV_TAG_PX = fs.micro;
export const LV_BTN_PX = fs.muted;
export const LV_HINT_PX = fs.muted;
/** 卡框描边(与融合屏三选一卡片的 `FU_CARD_STROKE_W` 同档) */
export const LV_CARD_STROKE_W = 2;
/** 钮底板描边(纯代码矩形档) */
export const LV_BTN_STROKE_W = 1;

/* ================= 派生几何 ================= */

/** 盒矩形:横向铺满内容列,纵向整屏居中并取偶(996 → 222、1246 → 346,两档都不越界) */
export function levelUpBox(w: number, h: number): LvRect {
  return { x: LV_PAD, y: evenDown((evenDown(h) - LV_BOX_H) / 2), w: w - LV_PAD * 2, h: LV_BOX_H };
}

/** 第 i 张卡的框矩形(i 从 0 起;16 / 196 / 376,右缘 544) */
export function levelUpCardRect(b: LvRect, i: number): LvRect {
  return { x: b.x + i * (LV_CARD_W + LV_CARD_GAP), y: b.y + LV_CARDS_DY, w: LV_CARD_W, h: LV_CARD_H };
}

/** 卡内一枚钮的矩形(第 k 枚,0 = 选它 / 1 = 重随 / 2 = 锁定) */
export function levelUpCardBtnRect(c: LvRect, k: number): LvRect {
  return { x: c.x + LV_CARD_INSET, y: c.y + LV_BTN_TOP_DY + k * LV_BTN_STEP, w: LV_BTN_W, h: LV_BTN_H };
}

function left(x: number, baseY: number, maxW: number, px: number, bold: boolean): LvTextLine {
  return { x, baseY, maxW, px, align: "left", bold };
}

function mid(cx: number, baseY: number, maxW: number, px: number, bold: boolean): LvTextLine {
  return { x: cx, baseY, maxW, px, align: "center", bold };
}

function btn(rect: LvRect): LvBtn {
  return { rect, text: mid(rect.x + rect.w / 2, rect.y + LV_BTN_TEXT_DY, rect.w, LV_BTN_PX, true) };
}

/** 一张卡的完整几何(六族文本 + 三枚钮,全部锚在卡框左上) */
export function levelUpCardLayout(b: LvRect, idx: number): LvCardLayout {
  const rect = levelUpCardRect(b, idx);
  const tx = rect.x + LV_CARD_INSET;
  const descLines: LvTextLine[] = [];
  for (let i = 0; i < LV_DESC_MAX_LINES; i++) {
    descLines.push(left(tx, rect.y + LV_DESC_DY + i * LV_DESC_LINE, LV_CARD_TEXT_MAX_W, LV_DESC_PX, false));
  }
  return {
    idx,
    rect,
    emblem: { x: rect.x + evenDown((LV_CARD_W - LV_EMBLEM_S) / 2), y: rect.y + LV_EMBLEM_DY, w: LV_EMBLEM_S, h: LV_EMBLEM_S },
    quality: left(tx, rect.y + LV_QUALITY_DY, LV_CARD_TEXT_MAX_W, LV_QUALITY_PX, false),
    name: left(tx, rect.y + LV_NAME_DY, LV_CARD_TEXT_MAX_W, LV_NAME_PX, true),
    descLines,
    delta: left(tx, rect.y + LV_DELTA_DY, LV_CARD_TEXT_MAX_W, LV_DELTA_PX, true),
    tag: left(tx, rect.y + LV_TAG_DY, LV_CARD_TEXT_MAX_W, LV_TAG_PX, false),
    pick: btn(levelUpCardBtnRect(rect, 0)),
    reroll: btn(levelUpCardBtnRect(rect, 1)),
    lock: btn(levelUpCardBtnRect(rect, 2)),
  };
}

/**
 * 整层几何。本层不读存档、不看金币、不管锁定态 —— 那些只改配色档与文案档,不改一枚矩形
 * (与体力屏的两个形态位、死亡屏的 `canDouble` 同性质),故入参只有 `(w, h)`。
 */
export function levelUpLayout(w: number, h: number): LevelUpLayout {
  const b = levelUpBox(w, h);
  const cx = b.x + b.w / 2;
  const cards: LvCardLayout[] = [];
  for (let i = 0; i < LV_CARDS; i++) cards.push(levelUpCardLayout(b, i));
  return {
    box: b,
    panelKey: "panel_dark_corners",
    panelNine: LV_PANEL_NINE,
    banner: { x: b.x + LV_BANNER_INSET, y: b.y + LV_BANNER_TOP, w: b.w - LV_BANNER_INSET * 2, h: LV_BANNER_H },
    bannerKey: "banner_mid_navy",
    bannerNine: LV_BANNER_NINE,
    title: mid(cx, b.y + LV_BANNER_TOP + LV_TITLE_DY, LV_BOX_TEXT_MAX_W, LV_TITLE_PX, true),
    readout: mid(cx, b.y + LV_READOUT_DY, LV_BOX_TEXT_MAX_W, LV_READOUT_PX, false),
    cards,
    hint: mid(cx, b.y + LV_HINT_DY, LV_BOX_TEXT_MAX_W, LV_HINT_PX, false),
    cardStrokeW: LV_CARD_STROKE_W,
    btnStrokeW: LV_BTN_STROKE_W,
  };
}

/** 整层几何的单一出口(宿主 `syncLevelUp` 只调这一发) */
export function levelUpScreenLayout(w: number, h: number): LevelUpLayout {
  return levelUpLayout(w, h);
}
