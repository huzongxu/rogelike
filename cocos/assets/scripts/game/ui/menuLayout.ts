/**
 * 主菜单纯布局(几何单一出口)—— 与 `src/ui/shop.ts` 的 shopLayoutPure 同一范式:
 * 输入设计空间尺寸 + 运行时环境(表快照/关卡 id/套组 id/贴图就绪),输出 draw 与 hit-test **共用**的矩形包。
 *
 * 本模块**无 DOM、无平台依赖**(只 `import type` 资源类型),因此可在 node 侧直接测;
 * 贴图固有尺寸由调用方经环境传入,角深换算与 AssetManager.nineMargin 同一公式(nineMarginPure 为镜像)。
 *
 * 纵向骨架(像素重排版,七条带自上而下):标题带 → 赛季/筹码带(整带右对齐,右缘 = 屏宽 − pad) →
 * 入口带 → 分区条 → 关卡列表带(吃满剩余高度) → 主 CTA → 尾块英雄带(底缘 = 屏高 − setGapY)。
 * 列表走本文件的 `spreadRowsGrid`:行高与行距一律落偶数(2px 像素模块),富余先加行高、再加行距。
 * 英雄带改为**贴底锚定**(底缘 = 屏高 − setGapY),主 CTA 再贴着它上沿排;说明板与英雄带同一矩形。
 * `setBtns/setBand` 等套组卡几何继续按原式计算(基线锚点),只是不再画。
 */

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
  /**
   * 行底板九宫格边距(逻辑 px,来自 viewTable.nineSlice.keys)。
   * 给了它就以它为准 —— 内容内缩必须等于装饰带厚度,而行高是可变的,按行高等比推角深
   * 会让同一族的行在不同屏高下拿到不同内缩。没给(如 node 侧旧环境)回落 nineMarginPure。
   */
  rowPlateBorder?: number | null;
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
  /** 三枚货币筹码**板**左缘(整带右对齐后落定的绝对 x;右缘恒 ≤ 屏宽 − pad) */
  chipXs: number[];
  /** 货币筹码板宽 / 能量筹码板宽 / 板间距(draw 与 hit-test 共用) */
  chipW: number;
  energyW: number;
  chipGap: number;
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
  /** 套组卡几何 = 基线兼容锚点(布局测试逐字节比对),英雄展示带接管其视觉位置后**算而不画** */
  setBand: number;
  noteBand: number;
  /** 英雄展示带:带高上界(gapAboveSet − heroClearance),heroRise 实际取值 = min(表值, 本值) */
  heroMaxRise: number;
  /** 展示带整块(从未改动的 setY 向上生长,底缘 = setY + setH) */
  heroBand: MenuRect;
  /** 「更换英雄」按钮(带内右侧,垂直居中) */
  heroBtn: MenuRect;
  /** 立绘盒(带内左侧,垂直居中 + heroPortOffY;带高不足时按带高收缩保持正方形) */
  heroPort: MenuRect;
  heroTextX: number;
  heroTextMaxW: number;
  heroRow1Y: number;
  heroRow2Y: number;
  heroRow3Y: number;
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

/** 落偶数:像素模块 module=2,任何行高/行距/坐标都要能被 2 整除 */
export function evenGrid(v: number): number {
  const n = Math.floor(v);
  return n - (n % 2);
}

/**
 * 关卡列表的行分布(偶数网格版)。
 *
 * 与 `theme.spreadRows` 的差别有两处,都是本屏要付的代价:
 *  1. 行高与行距一律落**偶数**(否则九宫格的 16 边距与 2px 模块会错位出软边);
 *  2. 先按"行距取下界 baseGap"解出可行行高,富余先加行高、加到 maxH 才加行距,
 *     剩下的余数(≤ maxGap)落在**末行与主 CTA 之间的缝**里 —— 列表下方不长空洞。
 */
export function spreadRowsGrid(
  n: number,
  y0: number,
  y1: number,
  minH: number,
  maxH: number,
  maxGap: number,
  baseGap = 8
): { rowH: number; gap: number } {
  if (n <= 0) return { rowH: 0, gap: 0 };
  const avail = Math.max(0, y1 - y0);
  const rowH = Math.max(evenGrid(minH), Math.min(evenGrid(maxH), evenGrid((avail - (n - 1) * baseGap) / n)));
  const gap = n > 1 ? Math.max(0, Math.min(evenGrid(maxGap), evenGrid((avail - n * rowH) / (n - 1)))) : 0;
  return { rowH, gap };
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
  /** 套组卡基线锚点(尾块贴底改造后只服务 setBtns/setHdrY 这类"算而不画"的历史出口) */
  const setY = h - setDescH - setH - o.setGapY;
  const sectionH = env.sectionStripReady ? o.sectionH : 0;
  const sectionW = (sectionH * o.sectionSrcW) / o.sectionSrcH;
  const sectionX = (w - sectionW) / 2;
  const stageHdrY = sectionH > 0 ? o.stageHdrY : 0;
  const setHdrY = sectionH > 0 ? setY - o.setHdrGap - sectionH : 0;
  const listY = sectionH > 0 ? stageHdrY + sectionH + o.hdrBand : o.listYNoSection;
  const gapAboveSet = sectionH > 0 ? o.endlessGapSet + o.endlessGapSet2 : o.endlessGapFlat;
  const rowW = w - pad * 2;

  /* --- 尾块英雄带:贴底锚定,底缘 = 屏高 − setGapY;说明板与它同一矩形(一族板,不再叠两层) --- */
  const heroBandH = o.heroRise + setH + setDescH;
  const heroBand: MenuRect = {
    x: pad - dc.noteSlide,
    y: h - o.setGapY - heroBandH + dc.noteTopOff,
    w: rowW + dc.noteSlide + dc.noteInsetX,
    h: heroBandH,
  };
  const endlessBtn: MenuRect = { x: w / 2 - o.endlessW / 2, y: heroBand.y - gapAboveSet - o.endlessH, w: o.endlessW, h: o.endlessH };
  const listBottom = endlessBtn.y - o.endlessListGap;
  const { rowH, gap } = spreadRowsGrid(env.stageIds.length, listY, listBottom, o.rowMinH, o.rowMaxH, o.rowMaxGap);
  const rows: MenuRow[] = [];
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
  const nineMargin = nineMarginPure(env.rowPlateSize?.w ?? 0, env.rowPlateSize?.h ?? 0, rowW, rowH, o.rowPlateF);
  const rowMargin = env.rowPlateBorder && env.rowPlateBorder > 0 ? Math.min(env.rowPlateBorder, rowH / 2, rowW / 2) : nineMargin;
  const setBand = Math.round(setH * (o.setBandNum / o.setBandDen));
  const noteBand = Math.round(setDescH * (o.noteBandNum / o.noteBandDen));

  /* 英雄带还能向上长多少:列表被压到行高下界之前的那点富余(布局台据此决定 heroRise 手柄给不给) */
  const rowsFloor = env.stageIds.length * evenGrid(o.rowMinH) + Math.max(0, env.stageIds.length - 1) * 8;
  const heroMaxRise = Math.max(0, o.heroRise + (listBottom - listY - rowsFloor));
  const heroPortH = Math.min(dc.heroPortH, heroBand.h);
  const heroPort: MenuRect = {
    x: heroBand.x + dc.heroPadX + dc.heroPortOffX,
    y: heroBand.y + Math.round((heroBand.h - heroPortH) / 2) + dc.heroPortOffY,
    w: Math.min(dc.heroPortW, heroPortH),
    h: heroPortH,
  };
  const heroBtn: MenuRect = {
    x: heroBand.x + heroBand.w - dc.heroPadX - o.heroBtnW,
    y: Math.round(heroBand.y + heroBand.h / 2 - o.heroBtnH / 2),
    w: o.heroBtnW,
    h: o.heroBtnH,
  };
  const heroTextX = heroPort.x + heroPort.w + dc.heroPadX;
  const heroTextMaxW = heroBtn.x - dc.heroPadX - heroTextX;
  const heroRow1Y = heroBand.y + dc.heroNameOffY;
  const heroRow2Y = heroRow1Y + dc.heroRow2Gap;
  const heroRow3Y = heroRow2Y + dc.heroRow3Gap;

  const ban: MenuRect = { x: pad - dc.banInset, y: dc.banY, w: w - pad * 2 + dc.banInset * 2, h: dc.banH };
  const noteTop = heroBand.y;
  const noteW = heroBand.w;
  const noteCap = Math.max(noteBand, Math.round(setDescH * (dc.noteCapNum / dc.noteCapDen)));
  const noteX = heroBand.x + noteCap;
  /* 筹码带:整带右对齐,由右界(屏宽 − pad)反推 —— 幻影榜 → 能量 → 三枚货币,依次左挂。
     deco.chipX1~3 只是"把某一枚挪开一点"的微调量(默认 0),带位本身全由 chipW/chipGap/energyW 算出。 */
  const energyX = phantomBtn.x - dc.chipGap - dc.energyW;
  const chipSlots = [0, 1, 2].map((i) => energyX - dc.chipGap - dc.chipW * (3 - i) - dc.chipGap * (2 - i));
  const chipY = dc.stripY + (dc.stripH - dc.chipH) / 2;
  const d: MenuDecoRects = {
    ban,
    crest: { x: pad + dc.crestOffX, y: ban.y + dc.crestOffY, w: dc.crestW, h: dc.crestH },
    titlePos: { x: pad + dc.titleOffX, y: ban.y + dc.titleOffY },
    seasonPos: { x: w - pad - dc.seasonInset, y: ban.y + dc.seasonOffY },
    row2Y: ban.y + dc.row2OffY,
    /** 能量筹码板:整带右对齐,左挂在幻影榜筹码的 chipGap 之外 */
    strip: { x: energyX, y: dc.stripY, w: dc.energyW, h: dc.stripH },
    chipH: dc.chipH,
    chipY,
    chipXs: [chipSlots[0] + dc.chipX1, chipSlots[1] + dc.chipX2, chipSlots[2] + dc.chipX3],
    chipW: dc.chipW,
    energyW: dc.energyW,
    chipGap: dc.chipGap,
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
    note: heroBand,
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
    heroMaxRise,
    heroBand,
    heroBtn,
    heroPort,
    heroTextX,
    heroTextMaxW,
    heroRow1Y,
    heroRow2Y,
    heroRow3Y,
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
