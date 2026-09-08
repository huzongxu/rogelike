/**
 * 每日福利屏纯几何 —— Web `src/game.ts:dailyLayout`(4786-4813)的 cc-free 抽取，
 * 已按像素暗黑翻新的 art 网格重排（`docs/UI-PIXEL-REFRESH.md` §1 / §8 / §11）。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。三区(宝箱 / 每日天赋 /
 * 1 行补领)的口径:
 *  - 行数 `n = DAILY_BOXES.length + 天赋条数 + 1`;
 *  - 行区 `spreadRows(n, 0, evenDown(h) − pad − listTop − labelH×2, 46, 92)`，出数后
 *    `rowH` 与 `gap` 再各过一次 `evenDown`（module = 2，奇数行距会让行板错半格）;
 *  - 列表顶缘 `listTop + labelH`,宝箱组标签基线 `listTop + 16`;
 *  - 天赋组标签基线 = 宝箱末行之后的 `y + 16`,随后 y 再吃掉一个 `labelH`;
 *  - **补领行贴底**：`y = evenDown(h) − pad − rowH`，底边正落屏底内缩 `pad`，与赛季 / 通关 /
 *    死亡三屏的主 CTA 同一口径（Web 原来是紧跟天赋行 + `gap > 6 ? 12 : 0` 的让位，重排后
 *    那族常量没有消费者）；
 *  - 天赋末行底边到补领行顶缘之间那条 `seamAboveMakeUp` 是本屏**唯一无硬上限的呼吸缝**：
 *    `rowH` 被 92 封顶、`gap` 被 spreadRows 的默认 20 封顶，两档屏高（996 / 1246）之间多出来的
 *    高度全部落进它，行高与行距一律不吃富余；
 *  - 返回钮 `(w − pad − backW, 16, backW, max(touchMin, backH))`。
 *
 * 每行是**两行文本**:基线 `l1 = evenDown(y + h/2 − 4)`、`l2 = l1 + 18`。这个 18px 是固定
 * 行距、不参与 spreadRows;它连同其余行内偏移与两种行底板档位都是本文件的具名常量而不是
 * 表项 —— 共享层读不到 `core/ViewTable.ts`(那一侧 import 了 `cc`),同一个数放两边就成了
 * 两个事实源。颜色与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `dl`)。
 *
 * 行内起笔与右缘内缩一律 16：行底板 `btn_minor` 的九宫切边带厚 16 逻辑 px（§3），文字落在
 * 内缩区里才不会被装饰带压住（§9.1「面板内容必走 nineMargin」）。
 *
 * 文本行(`DailyTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 右侧状态文案是**右对齐**,x 就是末笔位。
 */

import { DAILY_BOXES } from "../data/daily";
import { evenDown, fs, rowTextY, spreadRows, ui } from "./theme";

/** 页边距 16 / 内容宽 528：右缘恒落 544（`ui.pad` 是 Web 冻结档 14，本屏不再用） */
export const DL_PAD = 16;
/** 取偶下界住在共享层 `theme.ts`，这里原样再导出，免得每个屏各写一份 */
export { evenDown };

/** 左上原点设计像素矩形(与 core/DesignMetrics.Rect 同形;共享层不引宿主类型) */
export interface DailyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐,取值与 `ctx.textAlign` 一致 */
export type DailyAlign = "left" | "center" | "right";

/** 一行文本的落位请求:x/baseY 就是 Web fillText 的锚点与基线,maxW 为限宽 */
export interface DailyTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: DailyAlign;
}

/**
 * 一行的几何:底板矩形 + 三段文本(名字 / 描述 / 右对齐状态)。
 * 宝箱行、天赋行与补领行共用这一份形状 —— Web drawDaily 三段的行内偏移逐项相同。
 */
export interface DailyRowGeom {
  rect: DailyRect;
  /** 名字(x + 16, l1,body 加粗) */
  line1: DailyTextLine;
  /** 描述(x + 16, l2 = l1 + 18,micro) */
  line2: DailyTextLine;
  /** 右侧状态(x + w − 16, l1,muted 加粗,**右对齐**) */
  status: DailyTextLine;
}

/** 带 id 的行(宝箱 id 来自 DAILY_BOXES,天赋 id 来自存档 dailyTalents) */
export interface DailyRowLayout extends DailyRowGeom {
  index: number;
  id: string;
}

/**
 * 行底板档位:贴图键 + Web `skinButtonBase` 的圆角实参。
 * 键给宿主视图直接消费;圆角在 Cocos 侧由 `nineSlice` 边距承担(见 §4.1.2),这里保留原值
 * 是为了让"补领行走 btn_primary 的 10、普通行走 btn_minor 的 8"这条档位差可被断言。
 */
export interface DailyPlate {
  key: string;
  radius: number;
}

/** 整屏几何 */
export interface DailyLayout {
  /** 行数 = DAILY_BOXES.length + talentIds.length + 1(补领行恒 1) */
  rowCount: number;
  boxCount: number;
  talentCount: number;
  rowH: number;
  gap: number;
  boxRows: DailyRowLayout[];
  talentRows: DailyRowLayout[];
  makeUpRow: DailyRowGeom;
  /** 宝箱行与天赋行未领态的底板档位(已领态走代码形状,不消费它) */
  rowPlate: DailyPlate;
  /** 补领行可补领态的底板档位(不可补领走代码形状,不消费它) */
  makeUpPlate: DailyPlate;
  /** 两组标签的基线(boxLabelY / talentLabelY) */
  boxLabelY: number;
  talentLabelY: number;
  boxLabel: DailyTextLine;
  talentLabel: DailyTextLine;
  /** 屏底板矩形(`[pad, evenDown(h) − pad]` 的九宫格内缩区) */
  panel: DailyRect;
  /** 屏底板贴图键(本屏没有专属面板,恒 `panel_dark_corners`) */
  panelKey: DailyPlate["key"];
  /** 标题横幅底板(`banner_title_gold_c` 固有 122×21 → 244×42 整数倍,不裁不拉) */
  headerPlate: DailyRect;
  /** 有横幅时的标题:横幅内水平居中,基线走 `rowTextY`(带内垂直居中) */
  titleOnBanner: DailyTextLine;
  /** 缺图时的标题:左起笔于 pad,基线同一处 */
  titleBare: DailyTextLine;
  /** 装饰立绘位(`player_pose_2`;缺图则不画) */
  deco: DailyRect;
  /** 资源行图标位(`badge_gem_purple`) */
  resIcon: DailyRect;
  /** 资源行文本:有图标时起笔于 pad + size + gap */
  resText: DailyTextLine;
  /** 资源行文本:缺图时起笔于 pad,由视图前置替代字形 */
  resTextBare: DailyTextLine;
  /** 右上返回钮矩形(热区与绘制框逐位同一) */
  backBtn: DailyRect;
  backText: DailyTextLine;
  /** 天赋末行底边 → 补领行顶缘的空档(本屏唯一的无上限呼吸缝) */
  seamAboveMakeUp: number;
}

/* 屏专属几何常量(像素暗黑翻新档:具名一处;坐标与尺寸一律偶数) */
/** 头部带顶缘(与页边距同档) */
export const DL_TOP_Y = 16;
/** 标题横幅:宽 / 高 / 左上角(`banner_title_gold_c` 固有 122×21 → ×2 整数倍) */
export const DL_BANNER_W = 244;
export const DL_BANNER_H = 42;
export const DL_BANNER_X = DL_PAD;
export const DL_BANNER_Y = DL_TOP_Y;
/** 返回钮:顶缘 / 宽 / 高(高抬到热区下限 44,共享 `ui.backH` 的 34 不够一档) */
export const DL_BACK_Y = DL_TOP_Y;
export const DL_BACK_W = ui.backW;
export const DL_BACK_H = Math.max(ui.touchMin, ui.backH);
/** 装饰立绘:相对横幅右缘的让位 / 宽 / 高 / 顶缘 */
export const DL_DECO_GAP = 4;
export const DL_DECO_W = 38;
export const DL_DECO_H = 60;
export const DL_DECO_Y = DL_TOP_Y;
/** 资源行:基线 / 图标边长(原档 13 是奇数,取偶到 14)/ 图标相对基线的上抬 / 图标与文本间距 */
export const DL_RES_BASE_Y = 92;
export const DL_RES_ICON_BOX = 14;
export const DL_RES_ICON_DY = 2;
export const DL_RES_TEXT_GAP = 4;
/** 行区顶缘(组标签带占它上面 labelH 高) */
export const DL_LIST_TOP = 104;
/** 组标签带高 */
export const DL_LABEL_H = 24;
/** 组标签基线相对其带顶缘的下沉量(boxLabelY = listTop + 16,talentLabelY = y + 16) */
export const DL_LABEL_DY = 16;
/** 行高钳制档(spreadRows 的 minH/maxH 实参;两档都是偶数) */
export const DL_ROW_MIN_H = 46;
export const DL_ROW_MAX_H = 92;
/** 行内名字/描述起笔偏移与右对齐状态的右缘内缩(= `btn_minor` 的九宫切边带厚 16) */
export const DL_NAME_DX = 16;
export const DL_STATUS_INSET = 16;
/** 两行文本的基线:l1 = evenDown(y + h/2 − 4),l2 = l1 + 18(固定行距,不走 spreadRows) */
export const DL_LINE1_DY = 4;
export const DL_LINE_SPACING = 18;
/** 字号档(全在 `fs` 表内) */
export const DL_TITLE_PX = fs.title;
export const DL_LABEL_PX = fs.body;
export const DL_NAME_PX = fs.body;
export const DL_DESC_PX = fs.micro;
export const DL_STATUS_PX = fs.muted;
export const DL_RES_PX = fs.muted;
export const DL_BACK_PX = fs.muted;
/** 行底板档位(已领态被 `claimed ||` 短路,不消费贴图) */
export const DL_ROW_PLATE: DailyPlate = { key: "btn_minor", radius: 8 };
export const DL_MAKEUP_PLATE: DailyPlate = { key: "btn_primary", radius: 10 };
/** 屏底板贴图键(与已落地各屏同一张九宫格) */
export const DL_PANEL_KEY = "panel_dark_corners";

/** 行文本带的横向余量:限宽收到右对齐状态起笔前 10px(两段互不重叠的间距档) */
export const DL_TEXT_SLACK = 10;

/** 返回钮矩形(右缘恒落 `w − DL_PAD`;热区抬到 `ui.touchMin`) */
export function dailyBackBtn(w: number): DailyRect {
  return { x: w - DL_PAD - DL_BACK_W, y: DL_BACK_Y, w: DL_BACK_W, h: DL_BACK_H };
}

/** 标题横幅矩形(左缘落页边距,不裁不拉,取 `banner_title_gold_c` 固有比的整数倍) */
export function dailyHeaderPlate(): DailyRect {
  return { x: DL_BANNER_X, y: DL_BANNER_Y, w: DL_BANNER_W, h: DL_BANNER_H };
}

function rowGeom(rect: DailyRect): DailyRowGeom {
  const l1 = evenDown(rect.y + rect.h / 2 - DL_LINE1_DY);
  const l2 = l1 + DL_LINE_SPACING;
  const nameX = rect.x + DL_NAME_DX;
  const statusX = rect.x + rect.w - DL_STATUS_INSET;
  const bodyW = statusX - DL_TEXT_SLACK - nameX;
  return {
    rect,
    line1: { x: nameX, baseY: l1, maxW: bodyW, px: DL_NAME_PX, align: "left" },
    line2: { x: nameX, baseY: l2, maxW: bodyW, px: DL_DESC_PX, align: "left" },
    status: { x: statusX, baseY: l1, maxW: statusX - rect.x - DL_STATUS_INSET, px: DL_STATUS_PX, align: "right" },
  };
}

/**
 * 整屏几何。天赋条数由 `talentIds` 决定(存档 `dailyTalents`,每日从 6 池 roll 3;
 * 缺失/空数组即 0 条,行数随之变成 `DAILY_BOXES.length + 1`),
 * 屏高收 `h`(行区在 `[listTop + labelH, evenDown(h) − pad]` 内摊开,996 与 1246 两档都成立)。
 */
export function dailyLayout(w: number, h: number, talentIds: readonly string[] = []): DailyLayout {
  const hh = evenDown(h);
  const pad = DL_PAD;
  const rowW = w - pad * 2;
  const rowCount = DAILY_BOXES.length + talentIds.length + 1;
  const spread = spreadRows(rowCount, 0, hh - pad - DL_LIST_TOP - DL_LABEL_H * 2, DL_ROW_MIN_H, DL_ROW_MAX_H);
  const rowH = evenDown(spread.rowH);
  const gap = evenDown(spread.gap);
  let y = DL_LIST_TOP + DL_LABEL_H;
  const boxLabelY = DL_LIST_TOP + DL_LABEL_DY;

  const boxRows: DailyRowLayout[] = DAILY_BOXES.map((b, index) => {
    const row = { index, id: b.id, ...rowGeom({ x: pad, y, w: rowW, h: rowH }) };
    y += rowH + gap;
    return row;
  });

  const talentLabelY = y + DL_LABEL_DY;
  y += DL_LABEL_H;
  const talentRows: DailyRowLayout[] = talentIds.map((id, index) => {
    const row = { index, id, ...rowGeom({ x: pad, y, w: rowW, h: rowH }) };
    y += rowH + gap;
    return row;
  });

  /* 补领行贴底：底边落 `hh − pad`，与天赋末行之间那条缝就是本屏唯一的吸余体 */
  const makeUpRow = rowGeom({ x: pad, y: hh - pad - rowH, w: rowW, h: rowH });
  const seamAboveMakeUp = makeUpRow.rect.y - y;

  const backBtn = dailyBackBtn(w);
  const headerPlate = dailyHeaderPlate();
  const resIconX = pad;
  const resTextX = pad + DL_RES_ICON_BOX + DL_RES_TEXT_GAP;
  return {
    rowCount,
    boxCount: DAILY_BOXES.length,
    talentCount: talentIds.length,
    rowH,
    gap,
    boxRows,
    talentRows,
    makeUpRow,
    rowPlate: { ...DL_ROW_PLATE },
    makeUpPlate: { ...DL_MAKEUP_PLATE },
    boxLabelY,
    talentLabelY,
    boxLabel: { x: pad, baseY: boxLabelY, maxW: rowW, px: DL_LABEL_PX, align: "left" },
    talentLabel: { x: pad, baseY: talentLabelY, maxW: rowW, px: DL_LABEL_PX, align: "left" },
    panel: { x: pad, y: pad, w: rowW, h: hh - pad * 2 },
    panelKey: DL_PANEL_KEY,
    headerPlate,
    titleOnBanner: {
      x: evenDown(headerPlate.x + headerPlate.w / 2),
      baseY: evenDown(rowTextY(headerPlate.y, headerPlate.h, DL_TITLE_PX)),
      maxW: evenDown(headerPlate.w),
      px: DL_TITLE_PX,
      align: "center",
    },
    titleBare: { x: pad, baseY: evenDown(rowTextY(headerPlate.y, headerPlate.h, DL_TITLE_PX)), maxW: evenDown(backBtn.x - DL_TEXT_SLACK - pad), px: DL_TITLE_PX, align: "left" },
    deco: { x: headerPlate.x + headerPlate.w + DL_DECO_GAP, y: DL_DECO_Y, w: DL_DECO_W, h: DL_DECO_H },
    resIcon: { x: resIconX, y: DL_RES_BASE_Y - DL_RES_ICON_BOX + DL_RES_ICON_DY, w: DL_RES_ICON_BOX, h: DL_RES_ICON_BOX },
    resText: { x: resTextX, baseY: DL_RES_BASE_Y, maxW: evenDown(w - pad - resTextX), px: DL_RES_PX, align: "left" },
    resTextBare: { x: pad, baseY: DL_RES_BASE_Y, maxW: rowW, px: DL_RES_PX, align: "left" },
    backBtn,
    backText: {
      x: evenDown(backBtn.x + backBtn.w / 2),
      baseY: evenDown(rowTextY(backBtn.y, backBtn.h, DL_BACK_PX)),
      maxW: backBtn.w,
      px: DL_BACK_PX,
      align: "center",
    },
    seamAboveMakeUp,
  };
}
