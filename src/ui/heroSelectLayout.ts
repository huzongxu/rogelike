/**
 * 英雄选择页纯布局(第 13 屏,可测不碰 Canvas)。
 * 沿用 theme.confirmRects / ui/shop.ts 的范式:纯函数返回 rect 包,draw 与 hit-test 同读一处。
 *
 * 纵向骨架(h=996 标定档,逐像素):
 *   0..64   顶栏(标题 + 返回)
 *   78..470 英雄列表视口(高 392;12 行 contentH=952 → maxScroll=560)
 *   478..918 详情面板(立绘 + 文案 + 技能 4 行,恒 440 高)
 *   930..982 确定按钮(左同带「不出战」),底留 14 呼吸缝
 * 屏高伸展规则:详情与按钮**底锚**,列表吸收全部多余高度(h=1246 时视口高 642)。
 * 因此 rows 只装可视行 → 命中测试天然裁剪,不必另做边界判定。
 */

import type { HeroDef, HeroId } from "../data/heroes";
import { isHeroReleased } from "../data/heroes";
import { contentHeightOf, maxScrollOf, scrollThumb, scrollViewport, SCROLL_TRACK_W } from "./scrollList";
import { ui } from "./theme";

/** 设计空间宽(战场锁定值,与 logicalW 同源) */
export const HERO_DESIGN_W = 560;

export const HERO_HEADER_H = ui.headerH; // 64
export const HERO_LIST_TOP = 78;
export const HERO_DETAIL_H = 440;
export const HERO_ROW_H = 72;
export const HERO_ROW_GAP = 8;
export const HERO_PORTRAIT = 168;
export const HERO_CONFIRM_W = 260;
export const HERO_CONFIRM_H = 52;

const PAD = ui.pad; // 14
const HERO_ROW_PAD = 8;
const HERO_ROW_PORTRAIT = 56;
const HERO_ROW_TEXT_GAP = 10;
const HERO_BADGE = 34;
const HERO_TEXT_GAP = 14;
const HERO_SKILL_LABEL_H = 22;
const HERO_SKILL_GAP = 6;
const HERO_SKILL_ROWS = 4;
const HERO_LIST_GAP = 8;
const HERO_DETAIL_GAP = 12;
const HERO_BOTTOM_PAD = 14;
const HERO_CLEAR_W = 88;
const HERO_CLEAR_H = 36;
const HERO_TRACK_INSET = 6;

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
  /** 行内小立绘(56 见方) */
  portrait: Rect;
  textX: number;
  /** 主名基线 */
  nameY: number;
  /** 副信息基线(称号 · 套组) */
  subY: number;
  /** 套组徽章位(右缘) */
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
}

export interface HeroSelectLayout {
  backBtn: Rect;
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
  skillLabelY: number;
  skillRows: HeroSkillRow[];
  confirm: Rect;
  /** 「不出战」= selectedHero 清空,与确定同带 */
  clearBtn: Rect;
}

/**
 * @param heroes 全量英雄(平铺含未发布,未发布行带锁标)
 * @param seasonId 当前赛季,决定发布门控
 * @param offset 列表滚动位(内容上移 px,可为越界阻尼值)
 */
export function heroSelectLayout(w: number, h: number, heroes: readonly HeroDef[], seasonId: number, offset: number): HeroSelectLayout {
  const count = heroes.length;
  const contentH = contentHeightOf(count, HERO_ROW_H, HERO_ROW_GAP);

  // 底锚三带:确定 → 详情 → 列表视口(多余高度全部给列表)
  const confirm: Rect = { x: Math.round((w - HERO_CONFIRM_W) / 2), y: h - HERO_BOTTOM_PAD - HERO_CONFIRM_H, w: HERO_CONFIRM_W, h: HERO_CONFIRM_H };
  const detail: Rect = {
    x: PAD,
    y: confirm.y - HERO_DETAIL_GAP - HERO_DETAIL_H,
    w: w - PAD * 2,
    h: HERO_DETAIL_H,
  };
  const list: Rect = { x: PAD, y: HERO_LIST_TOP, w: w - PAD * 2, h: detail.y - HERO_LIST_GAP - HERO_LIST_TOP };
  const viewportH = Math.max(0, list.h);

  const win = scrollViewport(offset, viewportH, HERO_ROW_H, HERO_ROW_GAP, count);
  const rows: HeroRow[] = [];
  for (let i = win.first; i <= win.last; i++) {
    const hero = heroes[i];
    const ry = list.y + i * (HERO_ROW_H + HERO_ROW_GAP) - offset;
    const rect: Rect = { x: list.x, y: ry, w: list.w, h: HERO_ROW_H };
    rows.push({
      id: hero.id,
      index: i,
      released: isHeroReleased(hero.id, seasonId),
      rect,
      portrait: { x: rect.x + HERO_ROW_PAD, y: rect.y + HERO_ROW_PAD, w: HERO_ROW_PORTRAIT, h: HERO_ROW_PORTRAIT },
      textX: rect.x + HERO_ROW_PAD + HERO_ROW_PORTRAIT + HERO_ROW_TEXT_GAP,
      nameY: Math.round(rect.y + 30),
      subY: Math.round(rect.y + 52),
      badge: { x: rect.x + rect.w - HERO_ROW_PAD - HERO_BADGE, y: rect.y + Math.round((HERO_ROW_H - HERO_BADGE) / 2), w: HERO_BADGE, h: HERO_BADGE },
    });
  }

  const track: Rect = { x: w - SCROLL_TRACK_W - HERO_TRACK_INSET, y: list.y, w: SCROLL_TRACK_W, h: viewportH };
  const th = scrollThumb(offset, contentH, viewportH, { y: track.y, h: track.h });
  const thumb: Rect | null = th ? { x: track.x, y: th.y, w: track.w, h: th.h } : null;

  // 详情区:左立绘 168 见方,右文案带;下方技能 4 行等分剩余高度
  const portrait: Rect = { x: detail.x + PAD, y: detail.y + PAD, w: HERO_PORTRAIT, h: HERO_PORTRAIT };
  const textX = portrait.x + portrait.w + HERO_TEXT_GAP;
  const nameY = Math.round(portrait.y + 34);
  const titleY = Math.round(portrait.y + 62);
  const loreY = Math.round(portrait.y + 96);
  const loreW = detail.x + detail.w - PAD - textX;
  const skillLabelY = Math.round(portrait.y + portrait.h + 12);
  const skillTop = skillLabelY + HERO_SKILL_LABEL_H;
  const skillBottom = detail.y + detail.h - PAD;
  const skillRowH = Math.floor((skillBottom - skillTop - HERO_SKILL_GAP * (HERO_SKILL_ROWS - 1)) / HERO_SKILL_ROWS);
  const skillRows: HeroSkillRow[] = [];
  for (let i = 0; i < HERO_SKILL_ROWS; i++) {
    const rect: Rect = { x: detail.x + PAD, y: skillTop + i * (skillRowH + HERO_SKILL_GAP), w: detail.w - PAD * 2, h: skillRowH };
    skillRows.push({
      index: i,
      rect,
      chip: { x: rect.x, y: rect.y + Math.round((rect.h - 20) / 2), w: 60, h: 20 },
      labelY: Math.round(rect.y + (rect.h - 15) / 2 + 5),
      descY: Math.round(rect.y + (rect.h - 15) / 2 + 22),
      descW: rect.w - 68,
    });
  }

  const clearBtn: Rect = { x: PAD, y: confirm.y + Math.round((HERO_CONFIRM_H - HERO_CLEAR_H) / 2), w: HERO_CLEAR_W, h: HERO_CLEAR_H };
  const backBtn: Rect = { x: w - PAD - ui.backW, y: Math.round((HERO_HEADER_H - ui.backH) / 2), w: ui.backW, h: ui.backH };

  return {
    backBtn,
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
    skillLabelY,
    skillRows,
    confirm,
    clearBtn,
  };
}
