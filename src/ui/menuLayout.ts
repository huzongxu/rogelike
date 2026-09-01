/**
 * 主菜单纯布局(几何单一出口)—— 与 `src/ui/shop.ts` 的 shopLayoutPure 同一范式:
 * 输入设计空间尺寸 + 运行时环境(表快照/关卡 id/套组 id/贴图就绪),输出 draw 与 hit-test **共用**的矩形包。
 *
 * 本模块**无 DOM、无平台依赖**(只 `import type` 资源类型),因此可在 node 侧直接测;
 * 贴图固有尺寸由调用方经环境传入,角深换算与 AssetManager.nineMargin 同一公式(nineMarginPure 为镜像)。
 *
 * 纵向骨架:尾块贴底(说明板 → 套组卡 → 无限关钮),关卡列表 spreadRows 吃满剩余高度。
 */

import { spreadRows } from "./theme";
import type { MenuLayoutTable } from "../data/layoutMenu";
import type { MenuSkinTable } from "../data/menuSkin";
import type { SetId } from "../data/sets";

export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MenuRow extends MenuRect {
  id: number;
}

export interface MenuSetBtn extends MenuRect {
  id: SetId;
}

/** 运行时环境:表以外的可变输入(表管"数",环境管"这次用几个卡、贴图到了没") */
export interface MenuLayoutEnv {
  table: MenuLayoutTable;
  /** 主线关卡 id(顺序即行序) */
  stageIds: number[];
  /** 当前季可出的武器套组 id(顺序即卡序) */
  setIds: SetId[];
  /** 分区标题条 menu_section_strip 是否已就绪(未就绪 → 标题带归零,布局退回无条口径) */
  sectionStripReady: boolean;
  /** 行底板 menu_row_plate 源图固有尺寸(缺图传 null → 角深 0) */
  rowPlateSize: { w: number; h: number } | null;
  /** 皮肤表快照(不传 = 无皮肤):只消费 insets 加性增量,缺省布局逐像素不变 */
  skin?: MenuSkinTable;
}

/** 派生装饰几何(由表中的 deco 数 + 本次绘制尺寸算出;draw 只读不再自算) */
export interface MenuDecoRects {
  /** 标题横幅底板 */
  ban: MenuRect;
  crest: MenuRect;
  titlePos: { x: number; y: number };
  seasonPos: { x: number; y: number };
  /** 体力/钻石行基线 */
  row2Y: number;
  /** 货币底板 */
  strip: MenuRect;
  chipH: number;
  chipY: number;
  /** 三枚货币筹码内容左缘 */
  chipXs: number[];
  /** 筹码最小宽估算基准(iconW + gap + 一位数字宽由 draw 补) */
  chipIconW: number;
  chipIconGap: number;
  chipProbePad: number;
  chipSlide: number;
  chipInnerGap: number;
  chipTailPad: number;
  phChipProbeW: number;
  phChipPadAdd: number;
  phChipPadMin: number;
  /** 幻影筹码右缘 x */
  phRightX: number;
  phBottomY: number;
  /** 关卡行内偏移(基线/列起点/右列避让) */
  rowC1Off: number;
  rowC2Gap: number;
  rowTxOff: number;
  rowRightInset: number;
  rowMakeupReserve: number;
  badgeOffX: number;
  badgeSize: number;
  badgeR: number;
  badgeStroke: number;
  badgeTextOffY: number;
  checkOffX: number;
  checkOffY: number;
  checkSize: number;
  checkAdvance: number;
  starSize: number;
  starGap: number;
  starOffX: number;
  starLift: number;
  descClipPad: number;
  sectionTextPad: number;
  listHintFallbackY: number;
  /** 套组卡内容列 */
  setColPadL: number;
  setColPadR: number;
  setRow1Off: number;
  setRow2Gap: number;
  setIconOffX: number;
  setIconOffY: number;
  setIconW: number;
  setIconH: number;
  setFramePad: number;
  setBadgeInsetX: number;
  setBadgeOffY: number;
  setBadgeSize: number;
  tagPad: number;
  /** 说明板 */
  note: MenuRect;
  noteCap: number;
  noteX: number;
  noteMaxW: number;
  noteRow1Y: number;
  noteRow2Gap: number;
  /** 补星钮尺寸(draw 与 hit-test 共用 makeupRect) */
  makeupW: number;
  makeupH: number;
  makeupRightGap: number;
  /** 入口/徽标红点 */
  dotR: number;
  dotInsetX: number;
  dotInsetY: number;
  /** 红点圆心(贴宿主钮右上角;绘制与布局台同一算法) */
  dotRect(host: MenuRect): { cx: number; cy: number; r: number };
  /** 钻石图标(位置依赖文字测量,只给尺寸与偏移) */
  gemOffX: number;
  gemOffY: number;
  gemW: number;
  gemH: number;
  energyGap: number;
  /** 筹码文字基线盒(缺省 = chipY/chipH;皮肤 chip 面板 tb 在此收缩,基线走 rowTextY(盒)) */
  chipBase: { y: number; h: number };
  /** 分区条文竖直带(缺省 dy=0, h=sectionH;皮肤 section 面板 tb 在此收缩) */
  sectionTextBand: { dy: number; h: number };
}

export interface MenuLayout {
  rows: MenuRow[];
  endlessBtn: MenuRect;
  phantomBtn: MenuRect;
  gachaBtn: MenuRect;
  talentBtn: MenuRect;
  passBtn: MenuRect;
  commissionBtn: MenuRect;
  dailyBtn: MenuRect;
  gearupBtn: MenuRect;
  setBtns: MenuSetBtn[];
  setY: number;
  setH: number;
  setDescH: number;
  sectionH: number;
  sectionW: number;
  sectionX: number;
  stageHdrY: number;
  setHdrY: number;
  rowMargin: number;
  setBand: number;
  noteBand: number;
  /** 以下为原先只住在函数内的中间量(布局台需读) */
  pad: number;
  entryH: number;
  entryY: number;
  entryW: number;
  entryGap: number;
  listY: number;
  gapAboveSet: number;
  rowW: number;
  rowH: number;
  gap: number;
  setW: number;
  d: MenuDecoRects;
  /** 补星钮矩形(draw 与 hit-test 共用;角深/尺寸全走表) */
  makeupRect(r: MenuRect, rowMargin: number): MenuRect;
}

/** 等比九宫角深(镜像 AssetManager.nineMargin,图源尺寸改为显式入参,便于 node 侧计算) */
export function nineMarginPure(imgW: number, imgH: number, w: number, h: number, f = 0.35): number {
  if (!imgW || !imgH) return 0;
  const sm = Math.max(1, Math.floor(Math.min(imgW, imgH) * f));
  return Math.round(Math.min((h * sm) / imgH, w / 2, h / 2));
}

export function menuLayoutPure(w: number, h: number, env: MenuLayoutEnv): MenuLayout {
  const t = env.table;
  const o = t.origin;
  const dc = t.deco;
  const pad = o.pad;
  const entryH = o.entryH;
  const entryY = o.entryY;
  const setH = o.setH;
  const setDescH = o.setDescH;
  const setY = h - setDescH - setH - o.setGapY;
  const sectionH = env.sectionStripReady ? o.sectionH : 0;
  const sectionW = (sectionH * o.sectionSrcW) / o.sectionSrcH;
  const sectionX = (w - sectionW) / 2;
  const stageHdrY = sectionH > 0 ? o.stageHdrY : 0;
  const setHdrY = sectionH > 0 ? setY - o.setHdrGap - sectionH : 0;
  const listY = sectionH > 0 ? stageHdrY + sectionH + o.hdrBand : o.listYNoSection;
  const gapAboveSet = sectionH > 0 ? o.endlessGapSet + sectionH + o.endlessGapSet2 : o.endlessGapFlat;
  const endlessBtn: MenuRect = { x: w / 2 - o.endlessW / 2, y: setY - gapAboveSet - o.endlessH, w: o.endlessW, h: o.endlessH };
  const { rowH, gap } = spreadRows(env.stageIds.length, listY, endlessBtn.y - o.endlessListGap, o.rowMinH, o.rowMaxH, o.rowMaxGap);
  const rows: MenuRow[] = [];
  const rowW = w - pad * 2;
  env.stageIds.forEach((id, i) => {
    rows.push({ id, x: pad, y: listY + i * (rowH + gap), w: rowW, h: rowH });
  });
  const phantomBtn: MenuRect = { x: w - o.phantomAnchor, y: o.phantomY, w: o.phantomAnchor - pad, h: o.phantomH };
  const entryGap = o.entryGap;
  const entryW = Math.floor((w - pad * 2 - entryGap * (o.entryCount - 1)) / o.entryCount);
  const entryX = (i: number) => pad + i * (entryW + entryGap);
  const commissionBtn: MenuRect = { x: entryX(0), y: entryY, w: entryW, h: entryH };
  const gachaBtn: MenuRect = { x: entryX(1), y: entryY, w: entryW, h: entryH };
  const talentBtn: MenuRect = { x: entryX(2), y: entryY, w: entryW, h: entryH };
  const passBtn: MenuRect = { x: entryX(3), y: entryY, w: entryW, h: entryH };
  const dailyBtn: MenuRect = { x: entryX(4), y: entryY, w: entryW, h: entryH };
  const gearupBtn: MenuRect = { x: entryX(5), y: entryY, w: entryW, h: entryH };
  const setW = (w - pad * 2 - o.setGap * (env.setIds.length - 1)) / env.setIds.length;
  const setBtns: MenuSetBtn[] = env.setIds.map((id, i) => ({ id, x: pad + i * (setW + o.setGap), y: setY, w: setW, h: setH }));
  const rowMargin = nineMarginPure(env.rowPlateSize?.w ?? 0, env.rowPlateSize?.h ?? 0, rowW, rowH, o.rowPlateF);
  const setBand = Math.round(setH * (o.setBandNum / o.setBandDen));
  const noteBand = Math.round(setDescH * (o.noteBandNum / o.noteBandDen));

  const ban: MenuRect = { x: pad - dc.banInset, y: dc.banY, w: w - pad * 2 + dc.banInset * 2, h: dc.banH };
  const noteTop = setY + setH + dc.noteTopOff;
  const noteW = w - pad * 2 + dc.noteInsetX;
  const noteCap = Math.max(noteBand, Math.round(setDescH * (dc.noteCapNum / dc.noteCapDen)));
  const noteX = pad - dc.noteSlide + noteCap;
  const chipY = dc.stripY + (dc.stripH - dc.chipH) / 2;
  const d: MenuDecoRects = {
    ban,
    crest: { x: pad + dc.crestOffX, y: ban.y + dc.crestOffY, w: dc.crestW, h: dc.crestH },
    titlePos: { x: pad + dc.titleOffX, y: ban.y + dc.titleOffY },
    seasonPos: { x: w - pad - dc.seasonInset, y: ban.y + dc.seasonOffY },
    row2Y: ban.y + dc.row2OffY,
    strip: { x: pad, y: dc.stripY, w: w - pad * 2, h: dc.stripH },
    chipH: dc.chipH,
    chipY,
    chipXs: [pad + dc.chipX1, pad + dc.chipX2, pad + dc.chipX3],
    chipIconW: dc.chipIconW,
    chipIconGap: dc.chipIconGap,
    chipProbePad: dc.chipProbePad,
    chipSlide: dc.chipSlide,
    chipInnerGap: dc.chipInnerGap,
    chipTailPad: dc.chipTailPad,
    phChipProbeW: dc.phChipProbeW,
    phChipPadAdd: dc.phChipPadAdd,
    phChipPadMin: dc.phChipPadMin,
    phRightX: w - pad - dc.phRightGap,
    phBottomY: phantomBtn.y,
    rowC1Off: dc.rowC1Off,
    rowC2Gap: dc.rowC2Gap,
    rowTxOff: dc.rowTxOff,
    rowRightInset: dc.rowRightInset,
    rowMakeupReserve: dc.rowMakeupReserve,
    badgeOffX: dc.badgeOffX,
    badgeSize: dc.badgeSize,
    badgeR: dc.badgeR,
    badgeStroke: dc.badgeStroke,
    badgeTextOffY: dc.badgeTextOffY,
    checkOffX: dc.checkOffX,
    checkOffY: dc.checkOffY,
    checkSize: dc.checkSize,
    checkAdvance: dc.checkAdvance,
    starSize: dc.starSize,
    starGap: dc.starGap,
    starOffX: dc.starOffX,
    starLift: dc.starLift,
    descClipPad: dc.descClipPad,
    sectionTextPad: dc.sectionTextPad,
    listHintFallbackY: dc.listHintFallbackY,
    setColPadL: dc.setColPadL,
    setColPadR: dc.setColPadR,
    setRow1Off: dc.setRow1Off,
    setRow2Gap: dc.setRow2Gap,
    setIconOffX: dc.setIconOffX,
    setIconOffY: dc.setIconOffY,
    setIconW: dc.setIconW,
    setIconH: dc.setIconH,
    setFramePad: dc.setFramePad,
    setBadgeInsetX: dc.setBadgeInsetX,
    setBadgeOffY: dc.setBadgeOffY,
    setBadgeSize: dc.setBadgeSize,
    tagPad: dc.tagPad,
    note: { x: pad - dc.noteSlide, y: noteTop, w: noteW, h: setDescH },
    noteCap,
    noteX,
    noteMaxW: noteW - noteCap * 2,
    noteRow1Y: noteTop + noteBand + dc.noteRow1Off,
    noteRow2Gap: dc.noteRow2Gap,
    makeupW: dc.makeupW,
    makeupH: dc.makeupH,
    makeupRightGap: dc.makeupRightGap,
    dotR: dc.dotR,
    dotInsetX: dc.dotInsetX,
    dotInsetY: dc.dotInsetY,
    dotRect: (host: MenuRect) => ({ cx: host.x + host.w - dc.dotInsetX, cy: host.y + dc.dotInsetY, r: dc.dotR }),
    gemOffX: dc.gemOffX,
    gemOffY: dc.gemOffY,
    gemW: dc.gemW,
    gemH: dc.gemH,
    energyGap: dc.energyGap,
    chipBase: { y: chipY, h: dc.chipH },
    sectionTextBand: { dy: 0, h: sectionH },
  };

  // 皮肤 insets:加性增量叠在派生字段上,deco 仍是唯一基准(无皮肤 → 全零,恒等)
  const sk = env.skin;
  if (sk) {
    const Z = { t: 0, r: 0, b: 0, l: 0 };
    const ins = (id: keyof MenuSkinTable["insets"]) => sk.insets[id] ?? Z;
    const ti = ins("title");
    d.crest.x += ti.l;
    d.titlePos.x += ti.l;
    d.seasonPos.x -= ti.r;
    d.titlePos.y += ti.t - ti.b;
    d.seasonPos.y += ti.t - ti.b;
    d.row2Y += ti.t - ti.b;
    const st = ins("strip");
    d.chipXs = d.chipXs.map((x) => x + st.l);
    d.phRightX -= st.r;
    d.chipY += st.t - st.b;
    const ci = ins("chip");
    d.chipInnerGap += ci.l;
    d.chipTailPad += ci.r;
    d.chipBase = { y: d.chipY + ci.t, h: d.chipH - ci.t - ci.b };
    const se = ins("section");
    d.sectionTextPad += se.l + se.r;
    d.sectionTextBand = { dy: se.t, h: sectionH - se.t - se.b };
    const ro = ins("row");
    d.rowTxOff += ro.l;
    d.badgeOffX += ro.l;
    d.rowRightInset += ro.r;
    d.rowC1Off += ro.b - ro.t;
    const sc = ins("setCard");
    d.setColPadL += sc.l;
    d.setIconOffX += sc.l;
    d.setColPadR += sc.r;
    d.setRow1Off += sc.t - sc.b;
    const no = ins("note");
    d.noteX += no.l;
    d.noteMaxW -= no.l + no.r;
    d.noteRow1Y += no.t - no.b;
  }

  const makeupRect = (r: MenuRect, margin: number): MenuRect => ({
    x: r.x + r.w - margin - dc.makeupRightGap - dc.makeupW,
    y: Math.round(r.y + r.h / 2 - dc.makeupH / 2),
    w: dc.makeupW,
    h: dc.makeupH,
  });

  return {
    rows,
    endlessBtn,
    phantomBtn,
    gachaBtn,
    talentBtn,
    passBtn,
    commissionBtn,
    dailyBtn,
    gearupBtn,
    setBtns,
    setY,
    setH,
    setDescH,
    sectionH,
    sectionW,
    sectionX,
    stageHdrY,
    setHdrY,
    rowMargin,
    setBand,
    noteBand,
    pad,
    entryH,
    entryY,
    entryW,
    entryGap,
    listY,
    gapAboveSet,
    rowW,
    rowH,
    gap,
    setW,
    d,
    makeupRect,
  };
}
