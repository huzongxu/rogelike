/**
 * 英雄选择页纯布局(第 13 屏,可测不碰 Canvas)—— 像素暗黑翻新档。
 * 沿用 theme.confirmRects / ui/shop.ts 的范式:纯函数返回 rect 包,draw 与 hit-test 同读一处。
 *
 * 网格:页边距 16、内容宽 528(右缘恒落 544)、坐标与尺寸一律取偶;返回钮与「不出战」
 * 都抬到热区下限 44。行内立绘 / 套组徽章一律落在行板 `menu_set_plate` 的 16 内缩区里。
 *
 * 纵向骨架(h=996 标定档):
 *   0..46   标题横幅(banner_large_purple 整图 2 倍)
 *   68      副标题基线
 *   84..420 英雄列表视口(12 行 contentH=952 → maxScroll=616)
 *   428..916 详情面板(立绘 + 文案 + 技能 5 行,恒 488 高)
 *   928..980 确定按钮(左同带「不出战」),底留 16
 * 屏高伸展规则:详情与按钮**底锚**,列表吸收全部多余高度(h=1246 时视口高 586)。
 * 因此 rows 只装可视行 → 命中测试天然裁剪,不必另做边界判定。
 */

import type { HeroDef, HeroId } from "../data/heroes";
import { isHeroReleased } from "../data/heroes";
import { contentHeightOf, maxScrollOf, scrollThumb, scrollViewport, SCROLL_TRACK_W } from "./scrollList";
import { ui } from "./theme";
import { heroTreeLayout, type HeroTreeLayout } from "./heroTreeLayout";

/** 设计空间宽(战场锁定值,与 logicalW 同源) */
export const HERO_DESIGN_W = 560;

/** 页边距 16 / 内容宽 528:右缘恒落 544,与像素网格同一把尺 */
export const HERO_PAD = 16;
export const HERO_CONTENT_W = 528;

export const HERO_HEADER_H = ui.headerH; // 64
/** 标题横幅(与扭蛋 / 幻影榜同一档:源图 120×23 的 2 倍整数放大) */
export const HERO_BANNER_X = 8;
export const HERO_BANNER_Y = 0;
export const HERO_BANNER_W = 240;
export const HERO_BANNER_H = 46;
/**
 * 标题基线 / 字号:横幅档带赛季名(「出战英雄 · S4「幽冥潮汐」」这类长串),22px 实渲染约 269,
 * 既装不进带内 208 限宽、也超 240 宽的横幅本身 → 横幅档收到 16(实渲染约 196),
 * 基线按 rowTextY(0, 46, 16) 取 28 落在带内居中;缺图档限宽到返回钮前,仍走 22 左起笔。
 */
export const HERO_TITLE_BASE_Y = 28;
export const HERO_TITLE_PX = 16;
export const HERO_TITLE_BARE_BASE_Y = 36;
export const HERO_TITLE_BARE_PX = 22;
export const HERO_SUB_BASE_Y = 68;
export const HERO_LIST_TOP = 84;
/**
 * 详情板高(设计 px)。含义:立绘带 + 「技能详情」题行 + 技能 5 行的总盒高;单位:px。
 * 依据:488 = 16 内缩 + 168 立绘 + 12 + 22 题行 + 4×42 技能行 + 58 套装行 + 4×6 行距 + 16 内缩(+4 富余,
 *   由 `evenDown` 吸收)。比 440 那一档高出 48,全部由列表视口吸收(996 档 384 → 336,仍可滚)。
 * 换 48 的理由:详情区第 5 行「套装」要把两档共鸣效果写成两行(单行 412px 装不下最长那条),
 *   而立绘 168 = 贴图 84 的 2 倍整数放大,不能缩 → 只能长板子。出处:docs/DESIGN-HERO-PIPELINE.md §1 第 7 步(呈现收口)。
 */
export const HERO_DETAIL_H = 488;
export const HERO_ROW_H = 72;
export const HERO_ROW_GAP = 8;
export const HERO_PORTRAIT = 168;
export const HERO_CONFIRM_W = 260;
export const HERO_CONFIRM_H = 52;
/** 返回钮顶缘 / 钮高(抬到热区下限 44,共享 ui.backH 的 34 不够一档) */
export const HERO_BACK_Y = 16;
export const HERO_BACK_H = 44;

/** 行板 nineMargin 内缩 16:行内立绘 / 文字 / 徽章全部落在这道内缩区里 */
const HERO_ROW_PAD = 16;
const HERO_ROW_PORTRAIT = 40;
const HERO_ROW_TEXT_GAP = 12;
const HERO_BADGE_W = 64;
const HERO_BADGE_H = 40;
const HERO_TEXT_GAP = 16;
const HERO_SKILL_LABEL_H = 22;
const HERO_SKILL_GAP = 6;
/**
 * 详情区行数:核心 / 分岔 / 进阶 / 本命节律 / 套装。
 * 第 5 行是「套装」(docs/DESIGN-HERO-PIPELINE.md §1 第 7 步:出战英雄要能看见自己所持套组与两档联动效果),
 * 它恒为末行 —— 前四行的下标不能动:`HeroSelectModel.hit` 的「本命节律」热区读 `skillRows[3]`。
 */
const HERO_SKILL_ROWS = 5;
/**
 * 套装行高(设计 px;固定档,不参与等分)。含义:这一行的 desc 要折两行才写得下两档共鸣效果。
 * 依据:24(label 带)+ 2×16(desc 两行)+ 2 = 58。最长那条是荆棘「棘肤 + 反伤回响·极」= 2 行(实测 12 套 × 412 限宽)。
 */
const HERO_SET_ROW_H = 58;
/** desc 行高(设计 px):FS.micro 12 × 1.3 取整 —— 与视图 `Txt.box` 的 lineHeight 同一把尺 */
const HERO_DESC_LINE_H = 16;
/** desc 带上沿到行顶的距离(设计 px):label 带 24 + 底部留白 2,行盒减去它就是可折行数 */
const HERO_DESC_INSET = 26;
/**
 * 详情正文盒高(设计 px)。含义:立绘右侧那条带里给"人物设定"留两行;单位:px。
 * 依据:2 × round(FS.muted 13 × 1.3) = 2 × 17 = 34,取偶到 36 留一道呼吸缝。
 * 出处:12 位英雄的 `HeroDef.lore` 实测最长 26 字 → 312px 限宽下最多两行(`tests/hero-select-layout.test.ts` 有守卫)。
 */
const HERO_LORE_H = 36;
/** 「本套计件」清单盒顶缘相对立绘带顶的偏移(设计 px);正文两行(60+36)之后留一道 4 的缝 */
const HERO_PIECES_TOP = 100;
const HERO_SKILL_CHIP_W = 56;
const HERO_SKILL_CHIP_H = 22;
const HERO_SKILL_TEXT_DX = 68;
const HERO_LIST_GAP = 8;
const HERO_DETAIL_GAP = 12;
const HERO_BOTTOM_PAD = 16;
const HERO_CLEAR_W = 88;
const HERO_CLEAR_H = 44;
const HERO_TRACK_INSET = 16;

/** 取偶:奇数落位会让贴图与文本压在半个像素网格上 */
const evenDown = (v: number): number => Math.floor(v / 2) * 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroRow {
  id: HeroId;
  index: number;
  released: boolean;
  rect: Rect;
  /** 行内小立绘(40 见方,落在行板内缩区) */
  portrait: Rect;
  textX: number;
  /** 行内文本限宽(收到徽章左缘前一道偶数缝) */
  textW: number;
  /** 主名基线 */
  nameY: number;
  /** 副信息基线(称号 · 套组) */
  subY: number;
  /** 套组徽章位(右缘内缩 16) */
  badge: Rect;
}

export interface HeroSkillRow {
  index: number;
  rect: Rect;
  /** 左端 tag 胶囊 */
  chip: Rect;
  /** 词缀名基线 */
  labelY: number;
  /** 说明文字基线 */
  descY: number;
  descW: number;
  /**
   * 本行行盒装得下几行 desc(1 / 2)。含义:视图据此决定折行还是单行截断,不必按 index 猜哪一行是「套装」。
   * 单位:行。依据:`(rect.h − HERO_DESC_INSET) / HERO_DESC_LINE_H` 取整。
   */
  descLines: number;
}

export interface HeroSelectLayout {
  backBtn: Rect;
  /** 屏底板(像素九宫格 panel_dark_corners 的落位矩形) */
  panel: Rect;
  /** 标题横幅 */
  banner: Rect;
  /** 标题两档:横幅档居中落在带内,缺图档左起笔(px 随行,长赛季名标题要收字号才装得进带) */
  titleBand: { x: number; baseY: number; maxW: number; px: number };
  titleBare: { x: number; baseY: number; maxW: number; px: number };
  /** 副标题基线 */
  subBand: { x: number; baseY: number; maxW: number };
  /** 列表视口(裁剪边界:内容行可越出,绘制端 clip) */
  list: Rect;
  rows: HeroRow[];
  first: number;
  last: number;
  contentH: number;
  maxScroll: number;
  track: Rect;
  thumb: Rect | null;
  detail: Rect;
  portrait: Rect;
  textX: number;
  nameY: number;
  titleY: number;
  loreY: number;
  loreW: number;
  /** 详情正文盒(立绘右侧,称号之下,两行档) */
  lore: Rect;
  /**
   * 「本套计件」清单盒:立绘右侧带里、正文之下直到立绘带底缘。
   * 含义:出战英雄要能看见自己那套算件的物品名(docs/DESIGN-HERO-PIPELINE.md §1 第 7 步);单位:设计 px。
   */
  pieces: Rect;
  skillLabelY: number;
  skillRows: HeroSkillRow[];
  confirm: Rect;
  /** 「不出战」= selectedHero 清空,与确定同带 */
  clearBtn: Rect;
  /** V1.1 D03:点击「分岔」行展开的独立技能树面板几何(恒算,视图按模型 treeOpen 决定画不画) */
  tree: HeroTreeLayout;
}

/**
 * @param heroes 全量英雄(平铺含未发布,未发布行带锁标)
 * @param seasonId 当前赛季,决定发布门控
 * @param offset 列表滚动位(内容上移 px,可为越界阻尼值)
 */
export function heroSelectLayout(w: number, h: number, heroes: readonly HeroDef[], seasonId: number, offset: number): HeroSelectLayout {
  const count = heroes.length;
  const hh = evenDown(h);
  const PAD = HERO_PAD;
  const contentH = contentHeightOf(count, HERO_ROW_H, HERO_ROW_GAP);

  // 底锚三带:确定 → 详情 → 列表视口(多余高度全部给列表)
  const confirm: Rect = { x: evenDown((w - HERO_CONFIRM_W) / 2), y: hh - HERO_BOTTOM_PAD - HERO_CONFIRM_H, w: HERO_CONFIRM_W, h: HERO_CONFIRM_H };
  const detail: Rect = {
    x: PAD,
    y: confirm.y - HERO_DETAIL_GAP - HERO_DETAIL_H,
    w: HERO_CONTENT_W,
    h: HERO_DETAIL_H,
  };
  const list: Rect = { x: PAD, y: HERO_LIST_TOP, w: HERO_CONTENT_W, h: detail.y - HERO_LIST_GAP - HERO_LIST_TOP };
  const viewportH = Math.max(0, list.h);

  const win = scrollViewport(offset, viewportH, HERO_ROW_H, HERO_ROW_GAP, count);
  const rows: HeroRow[] = [];
  for (let i = win.first; i <= win.last; i++) {
    const hero = heroes[i];
    const ry = list.y + i * (HERO_ROW_H + HERO_ROW_GAP) - offset;
    const rect: Rect = { x: list.x, y: ry, w: list.w, h: HERO_ROW_H };
    const badge: Rect = { x: rect.x + rect.w - HERO_ROW_PAD - HERO_BADGE_W, y: rect.y + evenDown((HERO_ROW_H - HERO_BADGE_H) / 2), w: HERO_BADGE_W, h: HERO_BADGE_H };
    const textX = rect.x + HERO_ROW_PAD + HERO_ROW_PORTRAIT + HERO_ROW_TEXT_GAP;
    rows.push({
      id: hero.id,
      index: i,
      released: isHeroReleased(hero.id, seasonId),
      rect,
      portrait: { x: rect.x + HERO_ROW_PAD, y: rect.y + evenDown((HERO_ROW_H - HERO_ROW_PORTRAIT) / 2), w: HERO_ROW_PORTRAIT, h: HERO_ROW_PORTRAIT },
      textX,
      textW: badge.x - textX - HERO_ROW_TEXT_GAP,
      nameY: rect.y + 30,
      subY: rect.y + 52,
      badge,
    });
  }

  const track: Rect = { x: w - SCROLL_TRACK_W - HERO_TRACK_INSET, y: list.y, w: SCROLL_TRACK_W, h: viewportH };
  const th = scrollThumb(offset, contentH, viewportH, { y: track.y, h: track.h });
  const thumb: Rect | null = th ? { x: track.x, y: th.y, w: track.w, h: th.h } : null;

  // 详情区:左立绘 168 见方,右文案带(名 / 称号 / 正文 / 本套计件清单);下方技能 5 行等分剩余高度(行高取偶)
  const portrait: Rect = { x: detail.x + PAD, y: detail.y + PAD, w: HERO_PORTRAIT, h: HERO_PORTRAIT };
  const textX = portrait.x + portrait.w + HERO_TEXT_GAP;
  const nameY = portrait.y + 34;
  const titleY = portrait.y + 62;
  const loreY = portrait.y + 96;
  const loreW = detail.x + detail.w - PAD - textX;
  // 正文盒与「本套计件」清单盒:两盒都挂在立绘右侧那条 312 宽的带里,合计正好吃到立绘带底缘(60+36 / 100+68 = 168)
  const lore: Rect = { x: textX, y: portrait.y + 60, w: loreW, h: HERO_LORE_H };
  const pieces: Rect = { x: textX, y: portrait.y + HERO_PIECES_TOP, w: loreW, h: HERO_PORTRAIT - HERO_PIECES_TOP };
  const skillLabelY = portrait.y + portrait.h + 12;
  const skillTop = skillLabelY + HERO_SKILL_LABEL_H;
  const skillBottom = detail.y + detail.h - PAD;
  // 末行(套装)恒高 58,余下的高度四行等分(行高取偶)
  const skillRowH = evenDown(Math.floor((skillBottom - skillTop - HERO_SKILL_GAP * (HERO_SKILL_ROWS - 1) - HERO_SET_ROW_H) / (HERO_SKILL_ROWS - 1)));
  const skillRows: HeroSkillRow[] = [];
  let rowY = skillTop;
  for (let i = 0; i < HERO_SKILL_ROWS; i++) {
    const setRow = i === HERO_SKILL_ROWS - 1;
    const h = setRow ? HERO_SET_ROW_H : skillRowH;
    const rect: Rect = { x: detail.x + PAD, y: rowY, w: detail.w - PAD * 2, h };
    rowY += h + HERO_SKILL_GAP;
    skillRows.push({
      index: i,
      rect,
      chip: { x: rect.x, y: rect.y + evenDown((rect.h - HERO_SKILL_CHIP_H) / 2), w: HERO_SKILL_CHIP_W, h: HERO_SKILL_CHIP_H },
      labelY: rect.y + 20,
      descY: rect.y + 38,
      descW: rect.w - HERO_SKILL_TEXT_DX - PAD,
      descLines: Math.max(1, Math.floor((h - HERO_DESC_INSET) / HERO_DESC_LINE_H)),
    });
  }

  const clearBtn: Rect = { x: PAD, y: confirm.y + evenDown((HERO_CONFIRM_H - HERO_CLEAR_H) / 2), w: HERO_CLEAR_W, h: HERO_CLEAR_H };
  const backBtn: Rect = { x: w - PAD - ui.backW, y: HERO_BACK_Y, w: ui.backW, h: HERO_BACK_H };
  const banner: Rect = { x: HERO_BANNER_X, y: HERO_BANNER_Y, w: HERO_BANNER_W, h: HERO_BANNER_H };

  return {
    backBtn,
    panel: { x: PAD, y: PAD, w: HERO_CONTENT_W, h: hh - PAD * 2 },
    banner,
    titleBand: { x: banner.x + banner.w / 2, baseY: HERO_TITLE_BASE_Y, maxW: banner.w - 32, px: HERO_TITLE_PX },
    titleBare: { x: PAD, baseY: HERO_TITLE_BARE_BASE_Y, maxW: backBtn.x - 12 - PAD, px: HERO_TITLE_BARE_PX },
    subBand: { x: PAD + HERO_ROW_PAD, baseY: HERO_SUB_BASE_Y, maxW: HERO_CONTENT_W - HERO_ROW_PAD * 2 },
    list,
    rows,
    first: win.first,
    last: win.last,
    contentH,
    maxScroll: maxScrollOf(contentH, viewportH),
    track,
    thumb,
    detail,
    portrait,
    textX,
    nameY,
    titleY,
    loreY,
    loreW,
    lore,
    pieces,
    skillLabelY,
    skillRows,
    confirm,
    clearBtn,
    tree: heroTreeLayout(w, hh),
  };
}

/** 技能行的文字起笔偏移(词缀名 / 说明共用,= 胶囊宽 + 一道偶数缝) */
export const HERO_SKILL_TEXT_X = HERO_SKILL_TEXT_DX;

/** v6:详情面板框内的窗景盒(面板四边各内缩框线厚度 6,景压在面板之上、文字之下) */
export const HERO_DETAIL_FRAME_W = 6;
export function heroDetailInner(d: Rect): Rect {
  return { x: d.x + HERO_DETAIL_FRAME_W, y: d.y + HERO_DETAIL_FRAME_W, w: d.w - HERO_DETAIL_FRAME_W * 2, h: d.h - HERO_DETAIL_FRAME_W * 2 };
}

/**
 * v6 城堡窗景固有尺寸(scene_castle 516×428:源图 516×208 向上扩天 220,城堡贴底居中),
 * 与详情面板框内盒(528×440 内缩 6)同比例;窗景整幅铺满框内盒,城堡落在下方中心。
 */
export const SCENE_CASTLE_W = 516;
export const SCENE_CASTLE_H = 428;
export function heroDetailScene(d: Rect): Rect {
  const inner = heroDetailInner(d);
  const k = Math.min(inner.w / SCENE_CASTLE_W, inner.h / SCENE_CASTLE_H);
  const w = Math.floor((SCENE_CASTLE_W * k) / 2) * 2;
  const h = Math.floor((SCENE_CASTLE_H * k) / 2) * 2;
  return { x: inner.x + Math.floor((inner.w - w) / 2), y: inner.y + inner.h - h, w, h };
}
