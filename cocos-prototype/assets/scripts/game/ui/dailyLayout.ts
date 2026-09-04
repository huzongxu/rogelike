/**
 * 每日福利屏纯几何 —— Web `src/game.ts:dailyLayout`(4786-4813)的 cc-free 抽取。
 *
 * 单一出口:绘制与命中判定共读这一份矩形,宿主视图不产任何几何。三区(宝箱 / 每日天赋 /
 * 1 行补领)整页均分,口径与 Web 逐项同数:
 *  - 行数 `n = DAILY_BOXES.length + 天赋条数 + 1`;
 *  - 行区 `spreadRows(n, 0, h − pad − listTop − labelH×2, 46, 92)`;
 *  - 列表顶缘 `listTop + labelH`,宝箱组标签基线 `listTop + 16`;
 *  - 天赋组标签基线 = 宝箱末行之后的 `y + 16`,随后 y 再吃掉一个 `labelH`;
 *  - 补领行在 `gap > 6` 时多让 12px(gap 收到 6 以下说明行区已经挤满,不再让);
 *  - 返回钮 `(w − pad − backW, 22, backW, backH)`。
 *
 * 每行是**两行文本**:基线 `l1 = round(y + h/2 − 5)`、`l2 = l1 + 18`。这个 18px 是固定
 * 行距、不参与 spreadRows;它连同其余行内偏移与两种行底板档位都是本文件的具名常量而不是
 * 表项 —— 共享层读不到 `core/ViewTable.ts`(那一侧 import 了 `cc`),同一个数放两边就成了
 * 两个事实源。颜色与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段(键前缀 `dl`)。
 *
 * 文本行(`DailyTextLine`)沿用 Web `ctx.textAlign + fillText(t, x, baseY)` 的锚点语义:
 * x 随 align 表示起笔 / 中心 / 末笔,折成盒的那一步只在宿主 `ui/TextBand.ts:anchorBand`。
 * 右侧状态文案是**右对齐**,x 就是末笔位。
 */

import { DAILY_BOXES } from "../data/daily";
import { fs, rowTextY, spreadRows, ui } from "./theme";

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
  /** 名字(Web:x+10, l1,body 加粗) */
  line1: DailyTextLine;
  /** 描述(Web:x+10, l2 = l1+18,micro) */
  line2: DailyTextLine;
  /** 右侧状态(Web:x+w−10, l1,muted 加粗,**右对齐**) */
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
  /** 两组标签的基线(Web boxLabelY / talentLabelY) */
  boxLabelY: number;
  talentLabelY: number;
  boxLabel: DailyTextLine;
  talentLabel: DailyTextLine;
  /** 标题横幅底板(Web skinHeader 的 bx/by/w/h = pad−8, 36−42+8, 244, 42) */
  headerPlate: DailyRect;
  /** 有横幅时的标题:横幅内水平居中,基线 36−4(Web skinHeader 的贴图分支) */
  titleOnBanner: DailyTextLine;
  /** 缺图时的标题:左起笔于 pad,基线 36(Web themePaint.header 的回退分支) */
  titleBare: DailyTextLine;
  /** 装饰立绘位(Web assets.draw("player_pose_2", 252, 4, 38, 60);缺图则不画) */
  deco: DailyRect;
  /** 资源行图标位(Web iconText 的 x, y−size+2, size, size) */
  resIcon: DailyRect;
  /** 资源行文本:有图标时起笔于 pad+size+4(Web iconText 的贴图分支) */
  resText: DailyTextLine;
  /** 资源行文本:缺图时起笔于 pad,由视图前置替代字形(Web iconText 的回退分支) */
  resTextBare: DailyTextLine;
  /** 右上返回钮矩形(Web 是纯色 rect,不走 skinButtonBase) */
  backBtn: DailyRect;
  backText: DailyTextLine;
}

/* Web dailyLayout / drawDaily 的内联几何常量(策划数值纪律:屏专属常量在本文件顶部具名一处) */
/** 行区顶缘(组标签带占它上面 labelH 高) */
export const DL_LIST_TOP = 92;
/** 组标签带高 */
export const DL_LABEL_H = 24;
/** 组标签基线相对其带顶缘的下沉量(boxLabelY = listTop + 16,talentLabelY = y + 16) */
export const DL_LABEL_DY = 16;
/** 行高钳制档(Web spreadRows 的 minH/maxH 实参) */
export const DL_ROW_MIN_H = 46;
export const DL_ROW_MAX_H = 92;
/** 补领行之前的额外让位:仅当 gap 大于阈值时加(Web `y += gap > 6 ? 12 : 0`) */
export const DL_MAKEUP_GAP_THRESHOLD = 6;
export const DL_MAKEUP_EXTRA_GAP = 12;
/** 行内名字/描述起笔偏移与右对齐状态的右缘内缩 */
export const DL_NAME_DX = 10;
export const DL_STATUS_INSET = 10;
/** 两行文本的基线:l1 = round(y + h/2 − 5),l2 = l1 + 18(固定行距,不走 spreadRows) */
export const DL_LINE1_DY = -5;
export const DL_LINE_SPACING = 18;
/** 返回钮顶缘 */
export const DL_BACK_Y = 22;
/** 标题基线 / 横幅宽高 / 横幅相对标题锚点的偏移(Web skinHeader 的 w=244, h=42, bx=x−8, by=y−h+8) */
export const DL_TITLE_BASE_Y = 36;
export const DL_HEADER_W = 244;
export const DL_HEADER_H = 42;
export const DL_HEADER_INSET = 8;
/** 横幅内标题的基线上抬(Web fillText(title, bx+w/2, y−4)) */
export const DL_HEADER_TITLE_DY = 4;
/** 装饰立绘矩形(Web assets.draw(g, "player_pose_2", 252, 4, 38, 60)) */
export const DL_DECO: DailyRect = { x: 252, y: 4, w: 38, h: 60 };
/** 资源行:基线 / 图标边长 / 图标相对基线的上抬(Web iconText 的 y−size+2)/ 图标与文本间距 */
export const DL_RES_BASE_Y = 60;
export const DL_RES_ICON_BOX = 13;
export const DL_RES_ICON_DY = 2;
export const DL_RES_TEXT_GAP = 4;
/** 行底板档位(Web skinButtonBase 的 key 与圆角实参;已领态被 `claimed ||` 短路,不消费贴图) */
export const DL_ROW_PLATE: DailyPlate = { key: "btn_minor", radius: 8 };
export const DL_MAKEUP_PLATE: DailyPlate = { key: "btn_primary", radius: 10 };

/** 行文本带的横向余量:限宽收到右对齐状态起笔前 10px(与 Web 两段互不重叠的间距同档) */
const TEXT_SLACK = 10;

function rowGeom(rect: DailyRect): DailyRowGeom {
  const l1 = Math.round(rect.y + rect.h / 2 + DL_LINE1_DY);
  const l2 = l1 + DL_LINE_SPACING;
  const nameX = rect.x + DL_NAME_DX;
  const statusX = rect.x + rect.w - DL_STATUS_INSET;
  const bodyW = statusX - TEXT_SLACK - nameX;
  return {
    rect,
    line1: { x: nameX, baseY: l1, maxW: bodyW, px: fs.body, align: "left" },
    line2: { x: nameX, baseY: l2, maxW: bodyW, px: fs.micro, align: "left" },
    status: { x: statusX, baseY: l1, maxW: statusX - rect.x - DL_STATUS_INSET, px: fs.muted, align: "right" },
  };
}

/**
 * 整屏几何。天赋条数由 `talentIds` 决定(存档 `dailyTalents`,每日从 6 池 roll 3;
 * 缺失/空数组即 0 条,行数随之变成 `DAILY_BOXES.length + 1`),
 * 屏高收 `h`(行区在 `[listTop + labelH, h − pad]` 内摊开,996 与 1246 两档都成立)。
 */
export function dailyLayout(w: number, h: number, talentIds: readonly string[] = []): DailyLayout {
  const pad = ui.pad;
  const rowCount = DAILY_BOXES.length + talentIds.length + 1;
  const { rowH, gap } = spreadRows(rowCount, 0, h - pad - DL_LIST_TOP - DL_LABEL_H * 2, DL_ROW_MIN_H, DL_ROW_MAX_H);
  const rowW = w - pad * 2;
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

  y += gap > DL_MAKEUP_GAP_THRESHOLD ? DL_MAKEUP_EXTRA_GAP : 0;
  const makeUpRow = rowGeom({ x: pad, y, w: rowW, h: rowH });

  const backBtn: DailyRect = { x: w - pad - ui.backW, y: DL_BACK_Y, w: ui.backW, h: ui.backH };
  const headerPlate: DailyRect = {
    x: pad - DL_HEADER_INSET,
    y: DL_TITLE_BASE_Y - DL_HEADER_H + DL_HEADER_INSET,
    w: DL_HEADER_W,
    h: DL_HEADER_H,
  };
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
    boxLabel: { x: pad, baseY: boxLabelY, maxW: rowW, px: fs.body, align: "left" },
    talentLabel: { x: pad, baseY: talentLabelY, maxW: rowW, px: fs.body, align: "left" },
    headerPlate,
    titleOnBanner: {
      x: headerPlate.x + headerPlate.w / 2,
      baseY: DL_TITLE_BASE_Y - DL_HEADER_TITLE_DY,
      maxW: headerPlate.w,
      px: fs.title,
      align: "center",
    },
    titleBare: { x: pad, baseY: DL_TITLE_BASE_Y, maxW: backBtn.x - TEXT_SLACK - pad, px: fs.title, align: "left" },
    deco: { ...DL_DECO },
    resIcon: { x: resIconX, y: DL_RES_BASE_Y - DL_RES_ICON_BOX + DL_RES_ICON_DY, w: DL_RES_ICON_BOX, h: DL_RES_ICON_BOX },
    resText: { x: resTextX, baseY: DL_RES_BASE_Y, maxW: w - pad - resTextX, px: fs.muted, align: "left" },
    resTextBare: { x: pad, baseY: DL_RES_BASE_Y, maxW: rowW, px: fs.muted, align: "left" },
    backBtn,
    backText: {
      x: backBtn.x + backBtn.w / 2,
      baseY: rowTextY(backBtn.y, backBtn.h, fs.muted),
      maxW: backBtn.w,
      px: fs.muted,
      align: "center",
    },
  };
}
