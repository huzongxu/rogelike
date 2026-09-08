/**
 * 赛季通行证屏纯几何 —— 按像素栅格(module = 2)重排后的单一出口。
 *
 * 绘制与命中判定共读这一份矩形,宿主视图不产任何几何。栅格口径:
 *  - 宽恒 560、页边距 `PS_PAD = 16`、内容宽 `PS_CONTENT_W = 528`,所有矩形右缘恒落 544;
 *    纵向锚线一律先 `evenDown(h)` 再算,行高与行距出 `spreadRows` 后各再过一次 `evenDown`,
 *    于是 996 与 1246 两档屏高的每一个坐标与尺寸都是偶数;
 *  - 头部自上而下四带:**A** 标题横幅(左)+ 返回钮(右)、**B** 回响统计、**C** 高级轨状态、
 *    **D** 高级轨激活行。每带给一个具名带高,文字基线走 `rowTextY` 居中于带;
 *  - 标题横幅 `banner_title_gold_b` 固有 110×21 art px,按 module = 2 落在 **220×42** 的整倍档
 *    (不裁不拉),左缘落页边距 —— 于是横幅两端帽保持源图比例,标题压带居中于带心;
 *  - 节点轨道 `bar_pass_nodes` 与总进度条 `bar_progress_purple` 同为固有 264×5 art px,
 *    整倍档 **528×10** 恰好等于内容宽,两带都不需要横向拉伸;
 *  - 高级轨徽标 `badge_pennant_purple` 固有 6×7 art px → **12×14**,已领取对勾
 *    `mark_check_green` 固有 7×7 art px → **14×14**,都取整倍档不缩放;
 *  - 激活行高 `PS_ACT_H = 48`(≥ `ui.touchMin`),档位行高钳在 56..96 —— 两档都高于热区下限,
 *    于是本屏的三类命中矩形(返回钮 / 激活行 / 其余一律 `claimNext`)全部达标;
 *  - 行内三段左对齐文本共读一对基线式:`l1 = evenDown(mid + PS_NAME_DY)`、`l2 = l1 + 18`、
 *    `l3 = l2 + 18`;限宽**由右列状态带与对勾位推导**,不留第二个宽度事实源;
 *  - 末行底缘到总进度条文字带之间那条 `seamAboveProgress` 是本屏**唯一无硬上限的呼吸缝**,
 *    屏高富余只进它;
 *  - 屏底板是 `panel_dark_corners` 的九宫格档(与已重排各屏同一张),矩形与键都在本层给出,
 *    切深由宿主 `core/ViewTable.ts:borderOf` 按 `nineSlice` 表推导。
 *
 * 高级轨状态行与激活行的文字起笔位都取决于"贴图有没有画上":先 `show()` 再按返回值挑一档,
 * 所以这两处各给两档线位(`premTextWithBadge` / `premTextBare`、`actDoneText` / `actBtnText`),
 * 视图不做二次平移。
 *
 * 文本行(`PsTextLine`)沿用 `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 颜色与贴图键这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `ps`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 *
 * 与冻结的 Web 基准(`src/game.ts:drawPass`)的有意分歧:页边距 14→16、横幅左缘从 `pad − 8`
 * 收回页边距内、激活行高 40→48(抬到热区下限)、对勾与徽标取 art 整倍档(13→14、11→12)、
 * 行内文本基线过 `evenDown`、进度条填充与暗罩按栅格取偶后无缝拼接。
 * 判据见 `docs/UI-PIXEL-REFRESH.md` §8(不再做逐项视觉对标)。
 */

import { PASS_TIERS } from "../data/pass";
import { evenDown, fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface PsRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type PsAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 fillText 的锚点与基线,maxW 为限宽 */
export interface PsTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: PsAlign;
}

/**
 * 底板档位:贴图键 + 圆角实参(与 daily 的 `DailyPlate` 同款形状)。
 * 键给宿主视图直接消费;圆角在 Cocos 侧由 `nineSlice` 边距承担,这里保留原值是为了让
 * "激活行走 btn_primary 的 10"这条档位差可被断言。
 */
export interface PsPlate {
  key: string;
  radius: number;
}

/** 一个档位行的几何:底板 + 三段左对齐文本 + 右列两档基线 + 对勾贴图位 */
export interface PassRowLayout {
  index: number;
  rect: PsRect;
  /** `档位 i · 回响 need`(左对齐于 `rect.x + PS_ROW_TEXT_DX`,基线 l1,body 加粗) */
  name: PsTextLine;
  /** `免费:扭蛋券×n + 星尘×m`(同一起笔位,基线 l2,muted) */
  free: PsTextLine;
  /** `高级:×2`(同一起笔位,基线 l3,muted;文字内容由模型给) */
  premium: PsTextLine;
  /** 右列 `已领取` / `未解锁` 档:muted 字号的垂直居中基线 */
  statusMuted: PsTextLine;
  /** 右列 `可领取` 档:body 字号的垂直居中基线(该分支把字体换成 fs.body) */
  statusBody: PsTextLine;
  /** 已领取对勾贴图位(`mark_check_green`,显示与否由内容层的 claimed 门控) */
  check: PsRect;
}

/** 整屏几何 */
export interface PassLayout {
  /** 行数恒 = PASS_TIERS.length(内容层不增删行) */
  rowCount: number;
  rowH: number;
  gap: number;
  /** 列表顶缘(行循环从它起算) */
  listY0: number;
  /** 行区底缘预算(= 总进度条文字带的顶缘) */
  listBottom: number;
  rows: PassRowLayout[];
  /** 末行底缘到行区底缘的呼吸缝(本屏唯一的留白吸收体) */
  seamAboveProgress: number;
  /** 屏底板矩形(`[pad, evenDown(h) − pad]` 的九宫格内缩区) */
  panel: PsRect;
  /** 屏底板贴图键(九宫格;切深由宿主 `ViewTable.borderOf` 按表推导) */
  panelKey: string;
  /** 标题横幅底板(A 带左侧,取 `banner_title_gold_b` 固有比的 module 整倍档) */
  headerPlate: PsRect;
  /** 有横幅时的标题:横幅内水平居中,基线走 `rowTextY` */
  titleOnBanner: PsTextLine;
  /** 缺图时的标题:左起笔于页边距,基线同一处 */
  titleBare: PsTextLine;
  /** 回响统计行(B 带) */
  echo: PsTextLine;
  /** 高级轨徽标位(C 带;仅 prem 为真时尝试绘制) */
  premBadge: PsRect;
  /** 高级轨状态行:徽标画上时的起笔(徽标右缘 + PS_PREM_TEXT_GAP) */
  premTextWithBadge: PsTextLine;
  /** 高级轨状态行:未激活或徽标缺图时的起笔(页边距) */
  premTextBare: PsTextLine;
  /** 高级轨激活行(D 带;绘制与命中共用的唯一矩形) */
  actRect: PsRect;
  /** 未激活档的按钮底板档位(已激活档只放文字,不消费它) */
  actPlate: PsPlate;
  /** 已激活档文字(左对齐于页边距,基线居中于激活行) */
  actDoneText: PsTextLine;
  /** 未激活档文字(整屏水平居中,基线居中于激活行) */
  actBtnText: PsTextLine;
  /** 列表上方节点轨道(返回值被丢弃,缺图就是不画) */
  nodeTrack: PsRect;
  /** 总进度文字(贴底条之上 PS_PROGRESS_LABEL_GAP) */
  progressLabel: PsTextLine;
  /** 总进度条轨道矩形 */
  progressBar: PsRect;
  /** 右上返回钮矩形 */
  backBtn: PsRect;
  /** 返回钮图标位(边长 = `btn_back` 固有 11×11 art px 的 2 倍档,纵向居中于钮) */
  backIcon: PsRect;
  /** 返回钮文字:有图标时居中于图标右侧剩余空间 */
  backTextWithIcon: PsTextLine;
  /** 返回钮文字:缺图时整体居中 */
  backTextBare: PsTextLine;
}

/* ---------- 屏专属几何常量(具名一处,不散在函数体里;一律偶数) ---------- */

/** 页边距 16 / 内容宽 528:右缘恒落 544(`ui.pad` 是 Web 冻结档 14,本屏不再用) */
export const PS_PAD = 16;
export const PS_CONTENT_W = 528;
export { evenDown };

/** A 带:顶缘 / 标题横幅宽高与落位(`banner_title_gold_b` 固有 110×21 art px × module 2) */
export const PS_TOP_Y = 16;
export const PS_HEADER_W = 220;
export const PS_HEADER_H = 42;
export const PS_HEADER_X = PS_PAD;
export const PS_HEADER_Y = PS_TOP_Y;

/** 返回钮:宽高与图标边长(钮高由图标整倍档推出,恒 ≥ `ui.touchMin`) */
export const PS_BACK_W = ui.backW;
export const PS_BACK_ICON_BOX = 22;
export const PS_BACK_ICON_PAD = 12;
export const PS_BACK_H = Math.max(ui.touchMin, PS_BACK_ICON_BOX + PS_BACK_ICON_PAD * 2);
export const PS_BACK_Y = PS_TOP_Y;
export const PS_BACK_ICON_DX = 4;

/** B 带(回响统计)与 C 带(高级轨状态):各 24 高,紧接上一带底缘 */
export const PS_ECHO_BAND_H = 24;
export const PS_PREM_BAND_H = 24;
/** 高级轨徽标:`badge_pennant_purple` 固有 6×7 art px × module 2 */
export const PS_PREM_BADGE_W = 12;
export const PS_PREM_BADGE_H = 14;
export const PS_PREM_TEXT_GAP = 4;

/** D 带(高级轨激活行):顶缘相对 C 带底缘的缝 / 行高(≥ `ui.touchMin`) */
export const PS_ACT_GAP = 6;
export const PS_ACT_H = 48;

/** 激活行底缘到列表顶缘的缝 */
export const PS_LIST_GAP = 24;
/** 节点轨道:`bar_pass_nodes` 固有 264×5 art px × module 2 → 528×10,与列表顶缘留一条缝 */
export const PS_NODE_TRACK_H = 10;
export const PS_NODE_TRACK_GAP = 6;
/** 行高与行距钳制档(spreadRows 的 minH/maxH/maxGap 三实参;maxGap 60 是本屏特有的宽行距上限) */
export const PS_ROW_MIN_H = 56;
export const PS_ROW_MAX_H = 96;
export const PS_ROW_MAX_GAP = 60;

/** 行内三段文本的起笔偏移、右列内缩与三段基线式 */
export const PS_ROW_TEXT_DX = 16;
export const PS_STATUS_INSET = 16;
export const PS_NAME_DY = -12;
export const PS_LINE_SPACING = 18;
/** 右列状态文字带的预留宽(限宽由它与对勾位推导,不留第二个宽度事实源) */
export const PS_STATUS_BAND_W = 64;
/** 已领取对勾:`mark_check_green` 固有 7×7 art px × module 2,纵向居中于行 */
export const PS_CHECK_BOX = 14;
export const PS_CHECK_GAP = 8;
/** 文本带与相邻元素之间的余量 */
export const PS_TEXT_SLACK = 10;

/** 贴底总进度条:`bar_progress_purple` 固有 264×5 art px × module 2 → 528×10 */
export const PS_PROGRESS_H = 10;
/** 条底缘到内容底缘(`evenDown(h) − pad`)的让位 */
export const PS_PROGRESS_BOTTOM_GAP = 16;
/** 进度文字基线到条顶缘的让位,以及该文字带占的行区预算 */
export const PS_PROGRESS_LABEL_GAP = 8;
export const PS_PROGRESS_LABEL_BAND = 24;

/** 字号档(文本行的 px 是几何签名的一部分) */
export const PS_TITLE_PX = fs.title;
export const PS_ECHO_PX = fs.body;
export const PS_PREM_PX = fs.muted;
export const PS_NAME_PX = fs.body;
export const PS_FREE_PX = fs.muted;
export const PS_PREMIUM_PX = fs.muted;
export const PS_STATUS_READY_PX = fs.body;
export const PS_STATUS_MUTED_PX = fs.muted;
export const PS_ACT_DONE_PX = fs.muted;
export const PS_ACT_BTN_PX = fs.body;
export const PS_PROGRESS_PX = fs.micro;
export const PS_BACK_PX = fs.body;

/** 屏底板与激活行底板的贴图键 */
export const PS_PANEL_KEY = "panel_dark_corners";
export const PS_ACT_PLATE: PsPlate = { key: "btn_primary", radius: 10 };

/** 返回钮矩形(右缘恒落 `w − PS_PAD`;热区 ≥ `ui.touchMin`) */
export function passBackBtn(w: number): PsRect {
  return { x: w - PS_PAD - PS_BACK_W, y: PS_BACK_Y, w: PS_BACK_W, h: PS_BACK_H };
}

/** 标题横幅矩形(左缘落页边距,不裁不拉,取 `banner_title_gold_b` 固有比的 module 整倍档) */
export function passHeaderPlate(): PsRect {
  return { x: PS_HEADER_X, y: PS_HEADER_Y, w: PS_HEADER_W, h: PS_HEADER_H };
}

/** B 带(回响统计)矩形 */
export function passEchoBand(): PsRect {
  const hp = passHeaderPlate();
  return { x: PS_PAD, y: hp.y + hp.h, w: PS_CONTENT_W, h: PS_ECHO_BAND_H };
}

/** C 带(高级轨状态)矩形 */
export function passPremBand(): PsRect {
  const b = passEchoBand();
  return { x: PS_PAD, y: b.y + b.h, w: PS_CONTENT_W, h: PS_PREM_BAND_H };
}

/** D 带(高级轨激活行)矩形 */
export function passActRect(): PsRect {
  const c = passPremBand();
  return { x: PS_PAD, y: c.y + c.h + PS_ACT_GAP, w: PS_CONTENT_W, h: PS_ACT_H };
}

/** 贴底总进度条轨道矩形(底缘落 `evenDown(h) − pad − PS_PROGRESS_BOTTOM_GAP`) */
export function passProgressBar(h: number): PsRect {
  const hh = evenDown(h);
  return { x: PS_PAD, y: hh - PS_PAD - PS_PROGRESS_H - PS_PROGRESS_BOTTOM_GAP, w: PS_CONTENT_W, h: PS_PROGRESS_H };
}

function rowLayout(index: number, rect: PsRect): PassRowLayout {
  const mid = rect.y + rect.h / 2;
  const nameX = rect.x + PS_ROW_TEXT_DX;
  const statusX = rect.x + rect.w - PS_STATUS_INSET;
  const check: PsRect = {
    x: evenDown(statusX - PS_STATUS_BAND_W - PS_CHECK_GAP - PS_CHECK_BOX),
    y: evenDown(rect.y + (rect.h - PS_CHECK_BOX) / 2),
    w: PS_CHECK_BOX,
    h: PS_CHECK_BOX,
  };
  // 三段左文本的限宽收到对勾左缘之前;右列限宽收到对勾右缘之后 —— 两段都由最近的邻居推导
  const bodyW = evenDown(check.x - PS_TEXT_SLACK - nameX);
  const statusW = evenDown(statusX - check.x - check.w - PS_TEXT_SLACK);
  const l1 = evenDown(mid + PS_NAME_DY);
  const l2 = l1 + PS_LINE_SPACING;
  const l3 = l2 + PS_LINE_SPACING;
  return {
    index,
    rect,
    name: { x: nameX, baseY: l1, maxW: bodyW, px: PS_NAME_PX, align: "left" },
    free: { x: nameX, baseY: l2, maxW: bodyW, px: PS_FREE_PX, align: "left" },
    premium: { x: nameX, baseY: l3, maxW: bodyW, px: PS_PREMIUM_PX, align: "left" },
    statusMuted: { x: statusX, baseY: evenDown(rowTextY(rect.y, rect.h, PS_STATUS_MUTED_PX)), maxW: statusW, px: PS_STATUS_MUTED_PX, align: "right" },
    statusBody: { x: statusX, baseY: evenDown(rowTextY(rect.y, rect.h, PS_STATUS_READY_PX)), maxW: statusW, px: PS_STATUS_READY_PX, align: "right" },
    check,
  };
}

/**
 * 整屏几何。行数恒 = `PASS_TIERS.length`,屏高收 `h`(行区在
 * `[listY0, 进度条文字带顶缘]` 内摊开,996 与 1246 两档都不越界,且末行底边落在进度文字之上)。
 */
export function passLayout(w: number, h: number): PassLayout {
  const hh = evenDown(h);
  const pad = PS_PAD;
  const rowW = w - pad * 2;

  const headerPlate = passHeaderPlate();
  const echoBand = passEchoBand();
  const premBand = passPremBand();
  const actRect = passActRect();
  const listY0 = actRect.y + actRect.h + PS_LIST_GAP;

  const progressBar = passProgressBar(hh);
  const progressBaseY = evenDown(progressBar.y - PS_PROGRESS_LABEL_GAP);
  const listBottom = progressBaseY - PS_PROGRESS_LABEL_BAND;

  const spread = spreadRows(PASS_TIERS.length, listY0, listBottom, PS_ROW_MIN_H, PS_ROW_MAX_H, PS_ROW_MAX_GAP);
  const rowH = evenDown(spread.rowH);
  const gap = evenDown(spread.gap);
  const rows: PassRowLayout[] = PASS_TIERS.map((_, i) => rowLayout(i, { x: pad, y: listY0 + i * (rowH + gap), w: rowW, h: rowH }));
  const lastBottom = rows.length > 0 ? rows[rows.length - 1].rect.y + rowH : listY0;
  const seamAboveProgress = listBottom - lastBottom;

  const premBadgeX = pad;
  const premXWithBadge = premBadgeX + PS_PREM_BADGE_W + PS_PREM_TEXT_GAP;
  const titleBaseY = evenDown(rowTextY(headerPlate.y, headerPlate.h, PS_TITLE_PX));
  const backBtn = passBackBtn(w);
  const iconY = evenDown(backBtn.y + (backBtn.h - PS_BACK_ICON_BOX) / 2);
  const backIcon: PsRect = { x: backBtn.x + PS_BACK_ICON_DX, y: iconY, w: PS_BACK_ICON_BOX, h: PS_BACK_ICON_BOX };
  const backBaseY = evenDown(rowTextY(backBtn.y, backBtn.h, PS_BACK_PX));
  const backRemainW = backBtn.w - PS_BACK_ICON_DX - PS_BACK_ICON_BOX;

  return {
    rowCount: PASS_TIERS.length,
    rowH,
    gap,
    listY0,
    listBottom,
    rows,
    seamAboveProgress,
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: PS_PANEL_KEY,
    headerPlate,
    titleOnBanner: {
      x: evenDown(headerPlate.x + headerPlate.w / 2),
      baseY: titleBaseY,
      maxW: evenDown(headerPlate.w),
      px: PS_TITLE_PX,
      align: "center",
    },
    titleBare: { x: pad, baseY: titleBaseY, maxW: evenDown(backBtn.x - PS_TEXT_SLACK - pad), px: PS_TITLE_PX, align: "left" },
    echo: { x: pad, baseY: evenDown(rowTextY(echoBand.y, echoBand.h, PS_ECHO_PX)), maxW: rowW, px: PS_ECHO_PX, align: "left" },
    premBadge: { x: premBadgeX, y: evenDown(premBand.y + (premBand.h - PS_PREM_BADGE_H) / 2), w: PS_PREM_BADGE_W, h: PS_PREM_BADGE_H },
    premTextWithBadge: { x: premXWithBadge, baseY: evenDown(rowTextY(premBand.y, premBand.h, PS_PREM_PX)), maxW: evenDown(w - pad - premXWithBadge), px: PS_PREM_PX, align: "left" },
    premTextBare: { x: pad, baseY: evenDown(rowTextY(premBand.y, premBand.h, PS_PREM_PX)), maxW: rowW, px: PS_PREM_PX, align: "left" },
    actRect,
    actPlate: { ...PS_ACT_PLATE },
    actDoneText: { x: pad, baseY: evenDown(rowTextY(actRect.y, actRect.h, PS_ACT_DONE_PX)), maxW: rowW, px: PS_ACT_DONE_PX, align: "left" },
    actBtnText: { x: evenDown(w / 2), baseY: evenDown(rowTextY(actRect.y, actRect.h, PS_ACT_BTN_PX)), maxW: rowW, px: PS_ACT_BTN_PX, align: "center" },
    nodeTrack: { x: pad, y: listY0 - PS_NODE_TRACK_H - PS_NODE_TRACK_GAP, w: rowW, h: PS_NODE_TRACK_H },
    progressLabel: { x: pad, baseY: progressBaseY, maxW: rowW, px: PS_PROGRESS_PX, align: "left" },
    progressBar,
    backBtn,
    backIcon,
    backTextWithIcon: { x: evenDown(backIcon.x + PS_BACK_ICON_BOX + backRemainW / 2), baseY: backBaseY, maxW: backRemainW, px: PS_BACK_PX, align: "center" },
    backTextBare: { x: evenDown(backBtn.x + backBtn.w / 2), baseY: backBaseY, maxW: backBtn.w, px: PS_BACK_PX, align: "center" },
  };
}

/** 总进度条按 frac 给出的两块矩形:fill = 缺图回退的代码填充,cover = 有贴图时盖住空缺的暗罩 */
export interface PassBarRects {
  fill: PsRect;
  /** frac ≥ 1 时为 null(只有未满档才画暗罩) */
  cover: PsRect | null;
}

/**
 * 进度条的两档口径:
 *  - 贴图档:整图拉伸进轨道矩形,再用暗罩从填充末缘起盖住剩余部分;
 *  - 缺图档:整条轨道铺暗底,再从左起画填充。
 * 两块矩形按栅格取偶后**首尾相接、正好铺满轨道**(填充末缘 = 暗罩左缘),
 * 于是任何 frac 都不会在接缝处留半格亮线。frac 是内容量(进度 / 最高档需求),不进几何,
 * 故由本函数在绘制帧按当前存档现算。
 */
export function passProgressRects(L: PassLayout, frac: number): PassBarRects {
  const t = L.progressBar;
  const f = Math.min(1, Math.max(0, frac));
  const fx = evenDown(t.x + t.w * f);
  return {
    fill: { x: t.x, y: t.y, w: fx - t.x, h: t.h },
    cover: f < 1 ? { x: fx, y: t.y, w: t.x + t.w - fx, h: t.h } : null,
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数由 PASS_TIERS 表长决定) */
export function passScreenLayout(w: number, h: number): PassLayout {
  return passLayout(w, h);
}
