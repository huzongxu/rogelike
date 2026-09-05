/**
 * 赛季通行证屏纯几何 —— Web `src/game.ts:passActRect`(2614-2616)与 `drawPass`(2618-2713)
 * 的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。口径与 Web 逐项同数:
 *  - 激活行 `{ x: pad, y: 92, w: 560 − pad×2, h: 40 }`,与 `onPassClick` 共用同一矩形来源;
 *  - 列表顶缘 `listY0 = act.y + act.h + 14`(= 146),其上方 10px 处是节点轨道贴图带;
 *  - 档位行 `spreadRows(PASS_TIERS.length, listY0, h − 64, 56, 96, 60)` —— **六个实参**,
 *    第六个 `maxGap = 60` 是这一屏特有的宽行距上限(daily 用默认 20),行区底缘收到 `h − 64`
 *    给贴底的总进度条让位,三条都与 Web 的实参逐位对应,不做"顺手统一";
 *  - 行内三段左对齐文本起笔都是 `pad + 8`,基线分别为 `y + rowH/2 − 12` / `+6` / `+24`
 *    (Web 的行内偏移是裸表达式,**不经 `rowTextY`**,于是 rowH 为奇数时基线带 .5,原样保留);
 *  - 右列状态文字是**右对齐**,末笔锚点 `w − pad − 8`;基线随字号分两档
 *    (`已领取` / `未解锁` 用 `fs.muted`,`可领取` 用 `fs.body`),所以这里给两条线而不是共用一条;
 *  - 已领取对勾贴图位 `w − pad − 70, y + rowH/2 − 6, 13, 13`;
 *  - 总进度条 `pbY = h − 44`,高 10,`passProgressRects()` 按 Web `skinBar` 的遮罩法给出
 *    填充矩形与缺图回退档;
 *  - 返回钮 `(w − pad − backW, 22, backW, backH)` 并叠 `btn_back` 图标,文字 x **随图标在否
 *    改变**(Web `skinIconButton` 的 `hasIcon` 分支),于是两档文字线都摆在几何里。
 *
 * 标题横幅走 Web `skinHeader` 的**默认宽度**:`drawPass` 只传到 `color` 就收尾,没有传 `w`/`h`,
 * 所以取 `skin.ts:19-29` 的形参默认 `w = 220, h = 42`(daily 显式传 244,两屏不同),
 * 底板 `bx = pad − 8`、`by = 36 − 42 + 8`,横幅内标题基线 `36 − 4`、水平居中于板心。
 *
 * 高级轨状态行与激活行的文字起笔位都取决于"贴图有没有画上":Web 先 `assets.draw` 再按返回值
 * 决定 `premX`,所以这两处各给两档线位(`premTextWithBadge` / `premTextBare`、
 * `actDoneText` / `actBtnText`),视图按 `iconNode.show()` 的返回值挑一档,不做二次平移。
 *
 * 文本行(`PsTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 颜色与贴图键这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `ps`);
 * 本文件只留几何 —— 共享层读不到 import 了 `cc` 的 ViewTable,同一个数放两边就是两个事实源。
 */

import { PASS_TIERS } from "../data/pass";
import { fs, rowTextY, spreadRows, ui } from "./theme";

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface PsRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type PsAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface PsTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: PsAlign;
}

/**
 * 底板档位:贴图键 + Web `skinButtonBase` 的圆角实参(与 daily 的 `DailyPlate` 同款形状)。
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
  /** `档位 i · 回响 need`(Web:pad+8,`y + rowH/2 − 12`,body 加粗) */
  name: PsTextLine;
  /** `免费:扭蛋券×n + 星尘×m`(Web:pad+8,`y + rowH/2 + 6`,muted) */
  free: PsTextLine;
  /** `高级:×2`(Web:pad+8,`y + rowH/2 + 24`,muted;文字内容由模型给) */
  premium: PsTextLine;
  /** 右列 `已领取` / `未解锁` 档:muted 字号的垂直居中基线 */
  statusMuted: PsTextLine;
  /** 右列 `可领取` 档:body 字号的垂直居中基线(Web 在该分支把字体换成 fs.body) */
  statusBody: PsTextLine;
  /** 已领取对勾贴图位(Web `mark_check_green`,显示与否由内容层的 claimed 门控) */
  check: PsRect;
}

/** 整屏几何 */
export interface PassLayout {
  /** 行数恒 = PASS_TIERS.length(内容层不增删行) */
  rowCount: number;
  rowH: number;
  gap: number;
  /** 列表顶缘(Web `listY0`,行循环与节点轨道都从它起算) */
  listY0: number;
  rows: PassRowLayout[];
  /** 标题横幅底板(Web skinHeader 的 bx/by/w/h = pad−8, 36−42+8, 220, 42) */
  headerPlate: PsRect;
  /** 有横幅时的标题:横幅内水平居中,基线 36−4 */
  titleOnBanner: PsTextLine;
  /** 缺图时的标题:左起笔于 pad,基线 36(Web themePaint.header 的回退分支) */
  titleBare: PsTextLine;
  /** 回响统计行(Web:(pad, 62),body) */
  echo: PsTextLine;
  /** 高级轨徽标位(Web assets.draw 的实参矩形;仅 prem 为真时尝试绘制) */
  premBadge: PsRect;
  /** 高级轨状态行:徽标画上时的起笔(Web `premX = pad + 15`) */
  premTextWithBadge: PsTextLine;
  /** 高级轨状态行:未激活或徽标缺图时的起笔(Web `premX = pad`) */
  premTextBare: PsTextLine;
  /** 高级轨激活行(绘制与命中共用的唯一矩形) */
  actRect: PsRect;
  /** 未激活档的按钮底板档位(已激活档 Web 只放文字,不消费它) */
  actPlate: PsPlate;
  /** 已激活档文字(Web:(pad, rowTextY(act.y, act.h, fs.muted)),左对齐) */
  actDoneText: PsTextLine;
  /** 未激活档文字(Web 整屏水平居中 x = w/2,基线按 fs.body 居中于钮内) */
  actBtnText: PsTextLine;
  /** 列表上方节点轨道(Web assets.draw 的矩形;返回值被丢弃,缺图就是不画) */
  nodeTrack: PsRect;
  /** 总进度文字(Web:(pad, pbY−6),micro) */
  progressLabel: PsTextLine;
  /** 总进度条轨道矩形(Web skinBar 的 x/y/w/h) */
  progressBar: PsRect;
  /** 右上返回钮矩形 */
  backBtn: PsRect;
  /** 返回钮图标位(Web skinIconButton 的 `x+4, y+(h−ih)/2, ih, ih`,`ih = h − 12`) */
  backIcon: PsRect;
  /** 返回钮文字:有图标时居中于图标右侧剩余空间 */
  backTextWithIcon: PsTextLine;
  /** 返回钮文字:缺图时整体居中 */
  backTextBare: PsTextLine;
}

/* Web passActRect / drawPass 的内联几何常量(屏专属常量在本文件顶部具名一处) */
/** 高级轨激活行(Web passActRect 的 y/h) */
export const PS_ACT_Y = 92;
export const PS_ACT_H = 40;
/** 激活行与列表顶缘的间距(Web `listY0 = act.y + act.h + 14`) */
export const PS_LIST_GAP = 14;
/** 节点轨道:高 10,顶缘在 listY0 之上 10px(Web `assets.draw(..., listY0 - 10, w - pad*2, 10)`) */
export const PS_NODE_TRACK_H = 10;
export const PS_NODE_TRACK_DY = -10;
/** 行区底缘让位(Web spreadRows 的第二实参 `h - 64`) */
export const PS_LIST_BOTTOM_INSET = 64;
/** 行高与行距钳制档(Web spreadRows 的 minH/maxH/maxGap 三实参) */
export const PS_ROW_MIN_H = 56;
export const PS_ROW_MAX_H = 96;
export const PS_ROW_MAX_GAP = 60;
/** 行内三段左对齐文本起笔偏移与右列末笔的右缘内缩 */
export const PS_TEXT_DX = 8;
export const PS_STATUS_INSET = 8;
/** 行内三段文本相对行中的基线偏移(Web 是裸表达式,不做 round) */
export const PS_NAME_DY = -12;
export const PS_FREE_DY = 6;
export const PS_PREMIUM_DY = 24;
/** 已领取对勾贴图:边长 13、相对行中的基线上抬 6、右缘内缩 70 */
export const PS_CHECK_BOX = 13;
export const PS_CHECK_DY = -6;
export const PS_CHECK_INSET = 70;
/** 标题基线 / 横幅宽高 / 横幅相对标题锚点的偏移 / 横幅内标题的基线上抬(Web skinHeader 默认档) */
export const PS_TITLE_BASE_Y = 36;
export const PS_HEADER_W = 220;
export const PS_HEADER_H = 42;
export const PS_HEADER_INSET = 8;
export const PS_HEADER_TITLE_DY = 4;
/** 回响统计行基线 */
export const PS_ECHO_BASE_Y = 62;
/** 高级轨状态行基线 / 徽标矩形 / 徽标与文字的间距(Web `premX += 15`) */
export const PS_PREM_BASE_Y = 88;
export const PS_PREM_BADGE_Y = 76;
export const PS_PREM_BADGE_W = 11;
export const PS_PREM_BADGE_H = 14;
export const PS_PREM_TEXT_GAP = 15;
/** 总进度条:贴底让位 / 条高 / 文字相对条顶缘的上抬 */
export const PS_PROGRESS_BOTTOM_INSET = 44;
export const PS_PROGRESS_H = 10;
export const PS_PROGRESS_LABEL_DY = -6;
/** 返回钮顶缘 / 图标内缩 / 图标高相对钮高的收缩 / 文字基线相对钮中的下沉 */
export const PS_BACK_Y = 22;
export const PS_BACK_ICON_DX = 4;
export const PS_BACK_ICON_SHRINK = 12;
export const PS_BACK_TEXT_DY = 5;

/** 行文本带的横向余量:限宽收到右对齐状态起笔前 10px(与 Web 各段互不重叠的间距同档) */
const TEXT_SLACK = 10;

function rowLayout(index: number, rect: PsRect): PassRowLayout {
  const mid = rect.y + rect.h / 2;
  const nameX = rect.x + PS_TEXT_DX;
  const statusX = rect.x + rect.w - PS_STATUS_INSET;
  const bodyW = statusX - TEXT_SLACK - nameX;
  const bare = { x: statusX, maxW: statusX - rect.x - PS_STATUS_INSET, align: "right" as PsAlign };
  return {
    index,
    rect,
    name: { x: nameX, baseY: mid + PS_NAME_DY, maxW: bodyW, px: fs.body, align: "left" },
    free: { x: nameX, baseY: mid + PS_FREE_DY, maxW: bodyW, px: fs.muted, align: "left" },
    premium: { x: nameX, baseY: mid + PS_PREMIUM_DY, maxW: bodyW, px: fs.muted, align: "left" },
    statusMuted: { ...bare, baseY: rowTextY(rect.y, rect.h, fs.muted), px: fs.muted },
    statusBody: { ...bare, baseY: rowTextY(rect.y, rect.h, fs.body), px: fs.body },
    check: { x: rect.x + rect.w - PS_CHECK_INSET, y: mid + PS_CHECK_DY, w: PS_CHECK_BOX, h: PS_CHECK_BOX },
  };
}

/**
 * 整屏几何。行数恒 = `PASS_TIERS.length`,屏高收 `h`(行区在 `[146, h − 64]` 内摊开,
 * 996 与 1246 两档都不越界,且末行底边落在总进度条之上)。
 */
export function passLayout(w: number, h: number): PassLayout {
  const pad = ui.pad;
  const rowW = w - pad * 2;
  const actY0 = PS_ACT_Y;
  const listY0 = actY0 + PS_ACT_H + PS_LIST_GAP;
  const { rowH, gap } = spreadRows(PASS_TIERS.length, listY0, h - PS_LIST_BOTTOM_INSET, PS_ROW_MIN_H, PS_ROW_MAX_H, PS_ROW_MAX_GAP);

  const rows: PassRowLayout[] = PASS_TIERS.map((_, i) => rowLayout(i, { x: pad, y: listY0 + i * (rowH + gap), w: rowW, h: rowH }));

  const headerPlate: PsRect = {
    x: pad - PS_HEADER_INSET,
    y: PS_TITLE_BASE_Y - PS_HEADER_H + PS_HEADER_INSET,
    w: PS_HEADER_W,
    h: PS_HEADER_H,
  };
  const premBadgeX = pad;
  const premXWithBadge = premBadgeX + PS_PREM_TEXT_GAP;
  const backBtn: PsRect = { x: w - pad - ui.backW, y: PS_BACK_Y, w: ui.backW, h: ui.backH };
  const iconH = backBtn.h - PS_BACK_ICON_SHRINK;
  const backIcon: PsRect = { x: backBtn.x + PS_BACK_ICON_DX, y: backBtn.y + (backBtn.h - iconH) / 2, w: iconH, h: iconH };
  const backBaseY = backBtn.y + backBtn.h / 2 + PS_BACK_TEXT_DY;
  const backRemainW = backBtn.w - PS_BACK_ICON_DX - iconH;
  const pbY = h - PS_PROGRESS_BOTTOM_INSET;
  return {
    rowCount: PASS_TIERS.length,
    rowH,
    gap,
    listY0,
    rows,
    headerPlate,
    titleOnBanner: {
      x: headerPlate.x + headerPlate.w / 2,
      baseY: PS_TITLE_BASE_Y - PS_HEADER_TITLE_DY,
      maxW: headerPlate.w,
      px: fs.title,
      align: "center",
    },
    titleBare: { x: pad, baseY: PS_TITLE_BASE_Y, maxW: backBtn.x - TEXT_SLACK - pad, px: fs.title, align: "left" },
    echo: { x: pad, baseY: PS_ECHO_BASE_Y, maxW: rowW, px: fs.body, align: "left" },
    premBadge: { x: premBadgeX, y: PS_PREM_BADGE_Y, w: PS_PREM_BADGE_W, h: PS_PREM_BADGE_H },
    premTextWithBadge: { x: premXWithBadge, baseY: PS_PREM_BASE_Y, maxW: w - pad - premXWithBadge, px: fs.muted, align: "left" },
    premTextBare: { x: pad, baseY: PS_PREM_BASE_Y, maxW: rowW, px: fs.muted, align: "left" },
    actRect: { x: pad, y: actY0, w: rowW, h: PS_ACT_H },
    actPlate: { key: "btn_primary", radius: 10 },
    actDoneText: { x: pad, baseY: rowTextY(actY0, PS_ACT_H, fs.muted), maxW: rowW, px: fs.muted, align: "left" },
    actBtnText: { x: w / 2, baseY: rowTextY(actY0, PS_ACT_H, fs.body), maxW: rowW, px: fs.body, align: "center" },
    nodeTrack: { x: pad, y: listY0 + PS_NODE_TRACK_DY, w: rowW, h: PS_NODE_TRACK_H },
    progressLabel: { x: pad, baseY: pbY + PS_PROGRESS_LABEL_DY, maxW: rowW, px: fs.micro, align: "left" },
    progressBar: { x: pad, y: pbY, w: rowW, h: PS_PROGRESS_H },
    backBtn,
    backIcon,
    backTextWithIcon: { x: backBtn.x + PS_BACK_ICON_DX + iconH + backRemainW / 2, baseY: backBaseY, maxW: backRemainW, px: fs.body, align: "center" },
    backTextBare: { x: backBtn.x + backBtn.w / 2, baseY: backBaseY, maxW: backBtn.w, px: fs.body, align: "center" },
  };
}

/** 总进度条按 frac 给出的两块矩形:fill = 缺图回退的代码填充,cover = 有贴图时盖住空缺的暗罩 */
export interface PassBarRects {
  fill: PsRect;
  /** frac ≥ 1 时为 null(Web skinBar 的 `if (f < 1)` 才画遮罩) */
  cover: PsRect | null;
}

/**
 * 进度条的两档口径逐项对标 Web:
 *  - 贴图档 `skinBar`:整图拉伸进轨道矩形,再用 `dim`(默认 rgba(10,12,18,0.72))从
 *    `x + w × f` 起盖住剩余部分;
 *  - 缺图档:整条轨道铺 `rgba(255,255,255,0.12)`,再从左起画 `w × min(1, frac)` 的紫色填充。
 * frac 是内容量(进度 / 最高档需求),不进几何,故由本函数在绘制帧按当前存档现算。
 */
export function passProgressRects(L: PassLayout, frac: number): PassBarRects {
  const t = L.progressBar;
  const f = Math.min(1, Math.max(0, frac));
  return {
    fill: { x: t.x, y: t.y, w: t.w * Math.min(1, frac), h: t.h },
    cover: f < 1 ? { x: t.x + t.w * f, y: t.y, w: t.w * (1 - f), h: t.h } : null,
  };
}

/** 整屏几何的单一出口(视图经宿主钩子调它;行数由 PASS_TIERS 表长决定) */
export function passScreenLayout(w: number, h: number): PassLayout {
  return passLayout(w, h);
}
