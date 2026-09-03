import { Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from "cc";
import { DESIGN_W, coverRect, fullRect, logicalH, placeRect, Rect } from "../core/DesignMetrics";
import { borderOf, viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { snapshotMenuLayout } from "../game/data/layoutMenu";
import { snapshotMenuSkin } from "../game/data/menuSkin";
import { menuLayoutPure, type MenuLayout, type MenuRect } from "../game/ui/menuLayout";
import { MENU_PRESENTATION_DEFAULTS, type MenuPresentationParams } from "../game/dev/labTable";
import { isSkinHidden, isSkinTextHidden, resolveSkinKey } from "../game/dev/labSkin";
import type { MenuPanelId } from "../game/data/menuSkin";
import type { SetId } from "../game/data/sets";
import { menuChipRects, type MenuRowContent, type MenuTextContent } from "./MenuContentModel";
import { placeText, textBand } from "../ui/PanelKit";

/**
 * 主菜单的**表驱动几何视图**(Phase 2 落地:布局台的"画面";Phase 3 补逐屏内容)。
 *
 * 存在的理由:布局台要"拖手柄 → 画面实时跟随",而跟随的前提是画面由同一张表算出来。
 * 本视图不自己算任何几何——全部矩形来自 `game/ui/menuLayout.ts:menuLayoutPure()`,
 * 皮肤五段(换图 / 四边间距 / 图隐 / 文隐 / 图层名)来自 `game/data/menuSkin.ts`,
 * 与 `game/dev/labModel.ts` 编辑的是同一份内存表。于是"手柄指的那条边"与"节点的那条边"
 * 必然同坐标,布局台不需要第二套实现。
 *
 * 对标口径:贴图形态与 Web `drawMenu` 一致(九宫格 = drawNineUniform,整图 = assets.draw);
 * 缺图与皮肤 `hidden` 走同一条代码回退链路(§4.1.3)。所有 Label 直接挂在 Page 上、
 * 用设计空间绝对矩形定位,因此不存在"子局部矩形忘传 box"这一类错位(R5 的形态在此被绕开)。
 *
 * Phase 3 接上的通道:逐行锁定/通关减淡、实时货币与红点判定、补星文案与委托红点。
 * 文案与状态一律由宿主经 `menu/MenuContentModel.ts:buildMenuContent()` 注入 ——
 * 布局台与玩家版共用同一个构建函数,所以工作台里改表看到的画面就是玩家画面。
 */

/** 文案与状态类型住在 cc-free 的 MenuContentModel 里(纯函数才能被 node 侧测试直接消费) */
export type { MenuAction, MenuRowContent, MenuRowState, MenuTextContent } from "./MenuContentModel";

/** 一个可热换的贴图块:有图走 Sprite,无图走同节点的 Graphics 回退描形 */
interface Plate {
  root: Node;
  sprite: Sprite | null;
  gfx: Graphics | null;
}

interface RowNodes {
  root: Node;
  /** 锁定/通关行的整行减淡档(对标 Web 未解锁行 globalAlpha) */
  op: UIOpacity;
  plate: Plate;
  badge: Plate;
  badgeText: Label | null;
  name: Label;
  desc: Label;
  makeup: Plate;
  makeupText: Label;
}

const CENTER = Label.HorizontalAlign.CENTER;
const RIGHT = Label.HorizontalAlign.RIGHT;

export class MenuLayoutView {
  readonly root: Node;
  private page: Node;
  private frames: Map<string, SpriteFrame>;
  private stageIds: number[] = [];
  private setIds: SetId[] = [];
  private rows = new Map<number, RowNodes>();
  private chips: { plate: Plate; icon: Plate; text: Label }[] = [];
  private entries: { plate: Plate; icon: Plate; text: Label }[] = [];
  private heroLines: Label[] = [];
  private noteLines: Label[] = [];
  private insetCache = new Map<string, SpriteFrame>();
  private cur: MenuLayout | null = null;

  private banner: Plate;
  private crest: Plate;
  private titleText: Label;
  private seasonText: Label;
  private row2Text: Label;
  private strip: Plate;
  private phantom: { plate: Plate; text: Label };
  private section: { plate: Plate; text: Label };
  private endless: { plate: Plate; text: Label };
  private heroBand: Plate;
  private heroPort: Plate;
  private heroBtn: { plate: Plate; text: Label };
  private notePlate: Plate;
  private dot: Plate;
  private dotCommission: Plate;

  constructor(parent: Node, frames: Map<string, SpriteFrame>) {
    this.frames = frames;
    this.root = makeNode("MenuLayoutView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());
    this.backdrop(this.root);
    this.page = makeNode("Page", this.root);

    this.banner = this.plate("ban", this.page);
    this.crest = this.plate("crest", this.page);
    this.titleText = label("TitleText", this.page, "", FS.title, HEX.gold, { bold: true });
    this.seasonText = label("SeasonText", this.page, "", FS.muted, HEX.textSecondary, { hAlign: RIGHT });
    this.row2Text = label("EnergyText", this.page, "", FS.muted, HEX.textSecondary, { hAlign: RIGHT });
    this.strip = this.plate("strip", this.page);
    for (let i = 0; i < 3; i++) {
      this.chips.push({ plate: this.plate(`Chip${i}`, this.page), icon: this.plate(`ChipIcon${i}`, this.page), text: label(`ChipText${i}`, this.page, "", FS.micro, HEX.textSecondary) });
    }
    this.phantom = { plate: this.plate("Phantom", this.page), text: label("PhantomText", this.page, "", FS.micro, HEX.textSecondary) };
    this.section = { plate: this.plate("SectionStrip", this.page), text: label("SectionText", this.page, "", FS.section, HEX.gold, { hAlign: CENTER }) };
    this.endless = { plate: this.plate("Endless", this.page), text: label("EndlessText", this.page, "", FS.section, HEX.textPrimary, { bold: true, hAlign: CENTER }) };
    this.heroBand = this.plate("HeroBand", this.page);
    this.heroPort = this.plate("HeroPort", this.page);
    this.heroBtn = { plate: this.plate("HeroBtn", this.page), text: label("HeroBtnText", this.page, "", FS.body, HEX.textSecondary, { hAlign: CENTER }) };
    for (let i = 0; i < 3; i++) this.heroLines.push(label(`HeroLine${i}`, this.page, "", i === 0 ? FS.body : FS.micro, i === 0 ? HEX.textPrimary : HEX.textSecondary));
    this.notePlate = this.plate("NotePlate", this.page);
    for (let i = 0; i < 2; i++) this.noteLines.push(label(`NoteLine${i}`, this.page, "", FS.micro, HEX.textSecondary));
    this.dot = this.plate("Dot", this.page);
    this.dotCommission = this.plate("DotCommission", this.page);
  }

  /** 资源流式到位后由宿主补调:换图与缺图回退形状随就绪态变化 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 参与布局的环境输入(关卡数/卡数)由宿主给;布局台用主线关卡 + 当季套组 */
  setEnv(stageIds: number[], setIds: SetId[]): void {
    this.stageIds = [...stageIds];
    this.setIds = [...setIds];
    this.insetCache.clear();
  }

  /** 当前一次 refresh 用到的布局产物(布局台读它来放手柄与参考框) */
  layout(): MenuLayout | null {
    return this.cur;
  }

  /* ==================== 贴图块 ==================== */

  /** 满幅立绘 + 压暗:与 GameShell 菜单骨架同一份 backdrop 参数,挂在 Page 之前 */
  private backdrop(parent: Node): void {
    const frame = this.frames.get("bg_menu");
    if (!frame) return;
    const t = viewTable().backdrop;
    const node = makeNode("Cover", parent);
    const sp = node.addComponent(Sprite);
    sp.spriteFrame = frame;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    node.addComponent(UIOpacity).opacity = Math.round(t.coverAlpha * 255);
    placeRect(node, coverRect(fullRect(), frame.width, frame.height));
    const dim = makeNode("Dim", parent);
    const g = dim.addComponent(Graphics);
    const rect = fullRect();
    g.fillColor = hexToColor(t.dimColor);
    g.rect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    g.fill();
    placeRect(dim, rect);
  }

  private plate(name: string, parent: Node): Plate {
    const root = makeNode(name, parent);
    const sprite = root.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    return { root, sprite, gfx: root.addComponent(Graphics) };
  }

  /** 主菜单表现参数:viewTable.json 的 `menu` 段优先,缺字段回落共享层默认 */
  private menuParams(): MenuPresentationParams {
    const m = (viewTable() as unknown as { menu?: Partial<MenuPresentationParams> }).menu;
    return { ...MENU_PRESENTATION_DEFAULTS, ...(m ?? {}) };
  }

  /**
   * 贴一块。`mode`:slice = 九宫格(边距走 viewTable.nineSlice),stretch = 整图拉伸。
   * 皮肤 `hidden` 的键与未加载的键走同一条回退链路(与 Web 语义一致)。
   * 返回是否真用上了贴图。
   */
  private showPlate(p: Plate, rawKey: string, rect: Rect, mode: "slice" | "stretch" | "dot", solidColor?: string): boolean {
    const skin = snapshotMenuSkin();
    const key = resolveSkinKey(skin, rawKey);
    const frame = isSkinHidden(skin, key) ? undefined : this.frames.get(key);
    if (p.sprite) {
      p.sprite.enabled = !!frame;
      if (frame) {
        p.sprite.spriteFrame = mode === "slice" ? this.clonedInsets(key, frame, borderOf(key, frame.width, frame.height)) : frame;
        p.sprite.type = mode === "slice" ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
      }
    }
    if (p.gfx) {
      p.gfx.clear();
      if (!frame) this.drawFallback(p, rect, mode, solidColor);
    }
    placeRect(p.root, rect);
    return !!frame;
  }

  /** 同一张源图按边距克隆一次即缓存,避免每轮 refresh 都 clone 新 SpriteFrame */
  private clonedInsets(key: string, sf: SpriteFrame, border: number): SpriteFrame {
    const id = `${key}:${border}`;
    const hit = this.insetCache.get(id);
    if (hit) return hit;
    const c = sf.clone();
    c.insetLeft = border;
    c.insetRight = border;
    c.insetTop = border;
    c.insetBottom = border;
    this.insetCache.set(id, c);
    return c;
  }

  /** 缺图回退形状:与 Web drawMenu 的 fillRect + strokeRect 同一档(dot 模式画圆) */
  private drawFallback(p: Plate, rect: Rect, mode: "slice" | "stretch" | "dot", solidColor?: string): void {
    const g = p.gfx;
    if (!g) return;
    const m = this.menuParams();
    if (mode === "dot") {
      g.fillColor = hexToColor(solidColor ?? m.dotColor);
      g.circle(0, 0, Math.max(1, rect.w / 2));
      g.fill();
      return;
    }
    g.fillColor = hexToColor(m.fallbackPlate);
    g.rect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    g.fill();
    g.lineWidth = 1;
    g.strokeColor = hexToColor(m.fallbackStroke);
    g.rect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    g.stroke();
  }

  /* ==================== 布局 ==================== */

  /** 与 Web `game.ts:menuLayout()` 同一入口:表快照 + 皮肤快照 + 贴图就绪态 */
  computeLayout(): MenuLayout {
    const skin = snapshotMenuSkin();
    const rowKey = resolveSkinKey(skin, "menu_row_plate");
    const rowFrame = !isSkinHidden(skin, rowKey) ? this.frames.get(rowKey) : undefined;
    const sectionKey = resolveSkinKey(skin, "menu_section_strip");
    const sectionFrame = !isSkinHidden(skin, sectionKey) ? this.frames.get(sectionKey) : undefined;
    return menuLayoutPure(DESIGN_W, logicalH(), {
      table: snapshotMenuLayout(),
      stageIds: this.stageIds,
      setIds: this.setIds,
      sectionStripReady: !!sectionFrame,
      rowPlateSize: rowFrame ? { w: rowFrame.width, h: rowFrame.height } : null,
      skin,
    });
  }

  /** 重算几何并落位:表/皮肤变了就调它,画面即跟随(手柄与节点读的是同一次 menuLayoutPure 产物) */
  refresh(c: MenuTextContent): MenuLayout {
    const L = this.computeLayout();
    this.cur = L;
    const skin = snapshotMenuSkin();
    const m = this.menuParams();
        const textOff = (panel: MenuPanelId) => isSkinTextHidden(skin, panel);
    (this.page.getComponent(UITransform) || this.page.addComponent(UITransform)).setContentSize(DESIGN_W, logicalH());
    this.page.setPosition(0, 0, 0);

    /* --- 标题横幅 --- */
    this.showPlate(this.banner, "menu_title_plate", L.d.ban, "stretch");
    this.showPlate(this.crest, "crest_echo", L.d.crest, "stretch");
    placeText(this.titleText.node, textBand(L.d.titlePos.x, L.d.titlePos.y, L.d.ban.w - 80, m.titlePx));
    this.titleText.fontSize = m.titlePx;
    this.titleText.color = hexToColor(m.titleColor);
    bindLabel(this.titleText, c.title);
    placeText(this.seasonText.node, textBand(L.d.seasonPos.x - m.rightColumnW, L.d.seasonPos.y, m.rightColumnW, m.subPx), "right");
    this.seasonText.fontSize = m.subPx;
    bindLabel(this.seasonText, c.seasonLine);
    placeText(this.row2Text.node, textBand(L.d.seasonPos.x - m.rightColumnW, L.d.row2Y, m.rightColumnW, m.subPx), "right");
    this.row2Text.fontSize = m.subPx;
    bindLabel(this.row2Text, c.energyLine);
    for (const lb of [this.titleText, this.seasonText, this.row2Text]) lb.node.active = !textOff("title");

    /* --- 货币条 + 三枚筹码 + 幻影榜 --- */
    this.showPlate(this.strip, "menu_strip_plate", L.d.strip, "stretch");
    // 筹码矩形走 MenuContentModel 的同一出口:点击热区与画面必然同坐标
    const chipRects = menuChipRects(L);
    L.d.chipXs.forEach((x, i) => {
      const slot = this.chips[i];
      if (!slot) return;
      const icon = c.chips[i];
      const box = chipRects[i];
      slot.plate.root.active = !!icon;
      slot.icon.root.active = !!icon;
      slot.text.node.active = !!icon && !textOff("chip");
      if (!icon) return;
      this.showPlate(slot.plate, "menu_chip_plate", box, "slice");
      const ih = m.chipIconH;
      this.showPlate(slot.icon, icon.iconKey, { x: box.x + L.d.chipSlide, y: L.d.chipBase.y + Math.round((L.d.chipBase.h - ih) / 2), w: L.d.chipIconW, h: ih }, "stretch");
      placeText(slot.text.node, textBand(x + L.d.chipIconW + L.d.chipIconGap, L.d.chipBase.y + L.d.chipBase.h - 2, box.w, m.subPx));
      bindLabel(slot.text, icon.text);
    });
    this.showPlate(this.phantom.plate, "menu_chip_plate", L.phantomBtn, "slice");
    placeText(this.phantom.text.node, textBand(L.phantomBtn.x + 4, L.phantomBtn.y + L.phantomBtn.h - 4, L.phantomBtn.w, m.subPx));
    bindLabel(this.phantom.text, c.phantomText);
    this.phantom.text.node.active = !textOff("chip");

    /* --- 分区标题条 --- */
    const sectionOn = L.sectionH > 0;
    this.section.plate.root.active = sectionOn;
    this.section.text.node.active = sectionOn && !textOff("section");
    if (sectionOn) {
      this.showPlate(this.section.plate, "menu_section_strip", { x: L.sectionX, y: L.stageHdrY, w: L.sectionW, h: L.sectionH }, "stretch");
      const band = L.d.sectionTextBand;
      placeRect(this.section.text.node, { x: L.sectionX, y: L.stageHdrY + band.dy, w: L.sectionW, h: Math.max(8, band.h) });
      bindLabel(this.section.text, c.sectionText);
      this.section.text.color = hexToColor(m.titleColor);
    }

    /* --- 关卡行 --- */
    const seen = new Set<number>();
    const p3 = viewTable().phase3;
    L.rows.forEach((r) => {
      seen.add(r.id);
      const content = c.rows.find((x) => x.id === r.id);
      const n = this.ensureRow(r.id);
      // 逐行状态:未解锁整行减淡(对标 Web 未解锁行 globalAlpha),通关行轻微减淡
      n.op.opacity = !content || content.unlocked ? 255 : content.cleared ? p3.menuRowClearedAlpha : p3.menuRowLockedAlpha;
      this.showPlate(n.plate, content?.current ? m.currentRowPlate : "menu_row_plate", r, "slice");
      const cy = r.y + r.h / 2;
      const badgeBox: Rect = { x: r.x + L.rowMargin + L.d.badgeOffX - L.d.badgeSize / 2, y: cy - L.d.badgeSize / 2, w: L.d.badgeSize, h: L.d.badgeSize };
      this.showPlate(n.badge, content?.badgeKey ?? "", badgeBox, "stretch");
      if (n.badgeText) {
        n.badgeText.node.active = !textOff("row");
        placeRect(n.badgeText.node, { x: badgeBox.x, y: badgeBox.y, w: badgeBox.w, h: badgeBox.h });
        bindLabel(n.badgeText, content?.badgeText ?? "");
      }
      const textX = r.x + L.rowMargin + L.d.rowTxOff;
      const c1 = Math.round(cy - L.d.rowC1Off);
      const rightX = r.x + r.w - L.rowMargin - L.d.rowRightInset - (content?.makeup ? L.d.rowMakeupReserve : 0);
      const tw = Math.max(20, rightX - L.d.descClipPad - textX);
      placeText(n.name.node, textBand(textX, c1, tw, m.bodyPx));
      bindLabel(n.name, content?.name ?? `第 ${r.id} 关`);
      placeText(n.desc.node, textBand(textX, c1 + L.d.rowC2Gap, tw, m.subPx));
      bindLabel(n.desc, content?.desc ?? "");
      n.name.node.active = !textOff("row");
      n.desc.node.active = !textOff("row");
      n.makeup.root.active = !!content?.makeup;
      n.makeupText.node.active = !!content?.makeup && !textOff("row");
      if (content?.makeup) {
        const mk = L.makeupRect(r, L.rowMargin);
        this.showPlate(n.makeup, "btn_minor", mk, "slice");
        placeRect(n.makeupText.node, mk);
        bindLabel(n.makeupText, content.makeupText);
      }
    });
    for (const [id, n] of this.rows) {
      if (seen.has(id)) continue;
      n.root.destroy();
      this.rows.delete(id);
    }

    /* --- 六个场外入口 + 两枚红点 --- */
    [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn].forEach((b, i) => {
      const slot = this.entries[i] ?? this.addEntry();
      const src = c.entries[i];
      this.showPlate(slot.plate, src?.plateKey ?? "btn_minor", b, "slice");
      // 入口图标:左端 h-12 见方(对标 Web skinIconButton 的 ih = h - 12 / x + 4)
      const ih = b.h - 12;
      const iconOn = !!src?.iconKey && ih >= 8;
      slot.icon.root.active = iconOn;
      if (iconOn) this.showPlate(slot.icon, src.iconKey, { x: b.x + 4, y: b.y + (b.h - ih) / 2, w: ih, h: ih }, "stretch");
      placeRect(slot.text.node, { x: b.x, y: b.y, w: b.w, h: b.h });
      slot.text.node.getComponent(Label)!.verticalAlign = Label.VerticalAlign.CENTER;
      slot.text.fontSize = m.bodyPx;
      slot.text.isBold = true;
      bindLabel(slot.text, src?.label ?? "");
    });
    const dailyDot = L.d.dotRect(L.dailyBtn);
    this.dot.root.active = c.showDot;
    if (c.showDot) this.showPlate(this.dot, "", { x: dailyDot.cx - dailyDot.r, y: dailyDot.cy - dailyDot.r, w: dailyDot.r * 2, h: dailyDot.r * 2 }, "dot");
    const commDot = L.d.dotRect(L.commissionBtn);
    this.dotCommission.root.active = c.showCommissionDot;
    if (c.showCommissionDot) this.showPlate(this.dotCommission, "", { x: commDot.cx - commDot.r, y: commDot.cy - commDot.r, w: commDot.r * 2, h: commDot.r * 2 }, "dot");

    /* --- 无限关主按钮 --- */
    this.showPlate(this.endless.plate, "btn_primary", L.endlessBtn, "slice");
    placeRect(this.endless.text.node, L.endlessBtn);
    this.endless.text.node.getComponent(Label)!.verticalAlign = Label.VerticalAlign.CENTER;
    bindLabel(this.endless.text, c.endlessText);

    /* --- 出战英雄展示带(接管套组卡那一行;setBtns 算而不画) --- */
    const bandKey = c.accent ? "menu_set_plate_selected" : "menu_set_plate";
    const bandHasPlate = this.showPlate(this.heroBand, bandKey, L.heroBand, "slice");
    if (!bandHasPlate && this.heroBand.gfx && c.accent) {
      const g = this.heroBand.gfx;
      g.lineWidth = 1;
      g.strokeColor = hexToColor(c.accent);
      g.rect(-L.heroBand.w / 2, -L.heroBand.h / 2, L.heroBand.w, L.heroBand.h);
      g.stroke();
    }
    this.showPlate(this.heroPort, "", L.heroPort, "stretch");
    c.heroLines.forEach((t, i) => {
      const lb = this.heroLines[i];
      if (!lb) return;
      const y = [L.heroRow1Y, L.heroRow2Y, L.heroRow3Y][i];
      placeText(lb.node, textBand(L.heroTextX, y, Math.max(20, L.heroTextMaxW), i === 0 ? m.bodyPx : m.subPx));
      bindLabel(lb, t);
      lb.color = hexToColor(i === 1 && c.accent ? c.accent : i === 0 ? HEX.textPrimary : HEX.textSecondary);
      lb.node.active = !textOff("setCard");
    });
    this.showPlate(this.heroBtn.plate, "btn_minor", L.heroBtn, "slice");
    placeRect(this.heroBtn.text.node, L.heroBtn);
    this.heroBtn.text.node.getComponent(Label)!.verticalAlign = Label.VerticalAlign.CENTER;
    bindLabel(this.heroBtn.text, c.heroBtnText);
    this.heroBtn.text.node.active = !textOff("setCard");

    /* --- 说明板(无内容时整块不画,对标 Web 的 if (hero) 分支) --- */
    const noteOn = c.noteLines.length > 0;
    this.notePlate.root.active = noteOn;
    if (noteOn) this.showPlate(this.notePlate, "menu_note_plate", L.d.note, "slice");
    this.noteLines.forEach((lb, i) => {
      const t = c.noteLines[i];
      lb.node.active = noteOn && t !== undefined && !textOff("note");
      if (!lb.node.active) return;
      placeText(lb.node, textBand(L.d.noteX, L.d.noteRow1Y + i * L.d.noteRow2Gap, Math.max(20, L.d.noteMaxW), m.subPx));
      bindLabel(lb, t ?? "");
      lb.color = hexToColor(i === 1 && c.accent ? c.accent : m.noteColor);
    });
    return L;
  }

  private ensureRow(id: number): RowNodes {
    const hit = this.rows.get(id);
    if (hit) return hit;
    const root = makeNode(`Row#${id}`, this.page);
    const badge = this.plate("Badge", root);
    const n: RowNodes = {
      root,
      op: root.addComponent(UIOpacity),
      plate: this.plate("Plate", root),
      badge,
      badgeText: label("BadgeText", root, "", FS.micro, HEX.textPrimary, { hAlign: CENTER }),
      name: label("RowName", root, "", FS.body, HEX.textPrimary, { bold: true }),
      desc: label("RowDesc", root, "", FS.micro, HEX.textSecondary),
      makeup: this.plate("Makeup", root),
      makeupText: label("MakeupText", root, "补星", FS.micro, HEX.textPrimary, { hAlign: CENTER }),
    };
    (n.makeupText.node.getComponent(UITransform) || n.makeupText.node.addComponent(UITransform)).setAnchorPoint(0.5, 0.5);
    n.makeupText.node.getComponent(Label)!.verticalAlign = Label.VerticalAlign.CENTER;
    this.rows.set(id, n);
    return n;
  }

  private addEntry(): { plate: Plate; icon: Plate; text: Label } {
    const i = this.entries.length;
    const slot = {
      plate: this.plate(`Entry${i}`, this.page),
      icon: this.plate(`EntryIcon${i}`, this.page),
      text: label(`EntryText${i}`, this.page, "", FS.micro, HEX.textPrimary),
    };
    this.entries.push(slot);
    return slot;
  }
}
