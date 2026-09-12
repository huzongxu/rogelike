/**
 * 英雄选择屏 —— 像素暗黑翻新档:12 名英雄 + 详情 + 技能四行。
 *
 * 分工:几何全走共享层 `heroSelectLayout(w, h, heroes, seasonId, offset)`(单一出口,
 * 绘制与命中判定共读同一份矩形),滚动与热区全走 `heroes/HeroSelectModel.ts`
 * (它又只调 `game/ui/scrollList.ts` 那四个函数),本文件只做三件事:把可视行落到
 * Mask 裁切容器里的行节点池、把详情区落到固定槽位、把指针事件换算成设计 px 喂给模型。
 *
 * 皮与主菜单 / 幻影榜 / 扭蛋同一族键,零新贴图:
 *  - 屏底与详情板 `panel_dark_corners` 九宫格 + 全屏暗底;
 *  - 标题走 `banner_large_purple` 整图拉伸(缺图退左起笔一档,文字位随之换档);
 *  - 行板 `menu_row_plate`,预览行换 `menu_set_plate_selected`(与幻影榜玩家行同语义);
 *  - 套组徽章 `menu_chip_plate`(缺图退硬边方框);徽章文案恒为「出战」/「S1」..「S4」的
 *    混排,像素数字字形表表达不了,故仍走 Label —— 文案一字不改优先于字形通路;
 *  - 技能行板 `menu_row_plate`,胶囊仍走代码硬边块(22 高撑不起九宫格的可拉伸带);
 *  - 返回 / 不出战 `btn_minor`,确定 `btn_primary`。
 *
 * 三处 Cocos 特有约定:
 *  ① 列表用 `Mask(GRAPHICS_RECT)` 裁切(= Web 的 ctx.clip());行节点因此活在
 *     **列表局部坐标**里,行内文本一律把行尺寸作为 box 交给 `PanelKit.placeLine`。
 *     `Plate.show` 的落位参照恒为整屏,行内底板贴完还要按行盒重落一次(`rebaseInRow`)。
 *  ② 2D 批处理每个节点只收一个 UIRenderer(`batcher-2d.walk` 取 `node._uiProps.uiComp`),
 *     所以行板与徽章各自成子节点,兜底形状由 `Plate` 挂在自己的子节点上。
 *  ③ 立绘资源(hero_*)尚未出图,行内与详情都退化成"硬边主色方块 + 名字首字",
 *     缺图不空板;像素档不画圆,圆角一律收成直角。
 */

import { Graphics, Label, Mask, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, Rect, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import type { ViewTable } from "../core/ViewTable";
import { Plate, fitLines, fitOne, flatBox, iconNode, placeLine, strokeRing } from "../ui/PanelKit";
import { evenDown, hexA, theme } from "../game/ui/theme";
import { HERO_SKILL_TEXT_X, heroDetailScene } from "../game/ui/heroSelectLayout";
import type { HeroSelectLayout } from "../game/ui/heroSelectLayout";
import type { Phase3Params } from "../core/ViewTable";
import type { HeroAction, HeroRowView, HeroSelectModel } from "./HeroSelectModel";

/** 贴图键(全部来自主菜单 / 商店 / 三屏批的既有像素键,本屏不新增) */
const KEY_PANEL = "panel_dark_corners";
const KEY_BANNER = "banner_large_purple";
const KEY_ROW = "menu_row_plate";
const KEY_ROW_ACTIVE = "menu_set_plate_selected";
const KEY_BADGE = "menu_chip_plate";
const KEY_SKILL_ROW = "menu_row_plate";
const KEY_BACK = "btn_minor";
const KEY_PRIMARY = "btn_primary";
const KEY_CLEAR = "btn_minor";
/** v4:顶带走主菜单标题板(随赛季主色的铁框),预览行走金框 */
const KEY_BAND_V4 = "menu_title_plate";
const KEY_ROW_ACTIVE_V4 = "menu_row_plate_current";
/** v4 行 / 技能行的暗石面与空槽描边(与商店同一口径) */
const V4_FACE = "rgba(11,14,20,0.78)";
const V4_BONE = "#a9b4c4";

/** 行池容量:最大屏高下视口 634 / 步长 80 ≈ 9 行可见,缓冲行与甩动高速段留足余量 */
const ROW_POOL = 16;
/** 技能行池(共享层恒 4 行) */
const SKILL_POOL = 4;
/** 详情正文最多三行(与 Web 的 slice(0, 3) 同档) */
const LORE_LINES = 3;
/** 详情立绘缺图时的名字字号 */
const PORTRAIT_CHAR_PX = FS.display;
/** 缺图回退的硬边方框线宽(像素档不画圆角,圆边在 2px 网格上会抖糊) */
const RING_LINE_W = 2;
/**
 * 「不出战」空态那两行的基线步进(含义:详情板里主名 → 副题两行的行距;单位:设计 px;
 * 依据:沿用本屏翻新前的既有行距档,只换纵向落位、不改行距,于是两行块在 440 高的详情板里
 * 上下对称;出处:`FS.section` 16 + 一道 10 的偶数缝)。Cocos 侧专属,不进与 Web 共读的
 * `game/ui/heroSelectLayout.ts`(处置同 `confirm/ConfirmModel.ts`)。
 */
const EMPTY_LINE_PITCH = 26;

interface RowSlot {
  node: Node;
  /** v4:行板之下的暗石面 / 行板之上的英雄主色竖条 */
  face: ReturnType<typeof flatBox>;
  accent: ReturnType<typeof flatBox>;
  /** 行板(子节点:贴图优先,缺图走 Plate 自带的硬边兜底) */
  plate: Plate;
  portrait: { node: Node; show: (key: string) => boolean };
  /** 立绘缺图时的硬边主色方块(独立子节点,不与行板抢 UIRenderer 槽位) */
  portBox: Node;
  char: Txt;
  name: Txt;
  sub: Txt;
  /** 套组徽章底板 */
  badge: Plate;
  /** 徽章缺图回退的硬边方框 */
  badgeRing: Node;
  badgeText: Txt;
}

interface SkillSlot {
  /** v4:技能行板之下的暗石面 */
  face: ReturnType<typeof flatBox>;
  /** 技能行板(九宫格贴图,缺图走 Plate 自带的硬边兜底) */
  row: Plate;
  /** 左端 tag 胶囊:22 高撑不起九宫格的可拉伸带,仍走代码硬边块 */
  chip: ReturnType<typeof flatBox>;
  tag: Txt;
  label: Txt;
  desc: Txt;
}

/**
 * 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(Web 的 fillText 口径 —— x 随对齐
 * 表示起笔 / 中心 / 末笔)。给 `box` 时按**子局部矩形**落位(父节点尺寸),否则按整屏参照。
 */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(x: number, baseY: number, maxW: number, px: number, text: string, align: "left" | "center" | "right" = "left", color?: string, box?: { w: number; h: number }): void {
    this.font(px, align, color);
    bindLabel(this.lb, fitOne(text, maxW, px));
    placeLine(this.lb.node, x, baseY, maxW, px, align, box);
  }

  /**
   * 盒内对齐档(v4):节点 = 盒,Overflow.CLAMP,水平随 align、垂直居中(wrap 时顶对齐 + 自动换行,
   * 超出盒高的行被裁掉)。给 `box` 时按行局部坐标落位。与 set() 的基线估算不同,文字视觉中线严格对齐盒中线。
   */
  box(r: Rect, px: number, text: string, align: "left" | "center" | "right", color?: string, box?: { w: number; h: number }, wrap = false): void {
    this.font(px, align, color);
    this.lb.lineHeight = Math.round(px * 1.3);
    if (this.lb.overflow !== Label.Overflow.CLAMP) this.lb.overflow = Label.Overflow.CLAMP;
    if (this.lb.enableWrapText !== wrap) this.lb.enableWrapText = wrap;
    const va = wrap ? Label.VerticalAlign.TOP : Label.VerticalAlign.CENTER;
    if (this.lb.verticalAlign !== va) this.lb.verticalAlign = va;
    bindLabel(this.lb, wrap ? text : fitOne(text, r.w, px));
    placeRect(this.lb.node, r, box?.w ?? DESIGN_W, box?.h ?? logicalH());
  }

  /** 多行正文:整块按行高 × 行数占位,顶锚(与 Web 逐行 fillText 的堆叠一致) */
  lines(list: string[], x: number, topY: number, maxW: number, px: number, color: string, box?: { w: number; h: number }): void {
    this.font(px, "left", color);
    this.lb.lineHeight = Math.round(px * 1.25);
    bindLabel(this.lb, list.join("\n"));
    placeLine(this.lb.node, x, topY, maxW, px, "left", box);
  }

  private font(px: number, align: "left" | "center" | "right", color?: string): void {
    if (this.lastPx !== px) {
      this.lastPx = px;
      this.lb.fontSize = px;
      this.lb.lineHeight = Math.round(px * 1.25);
    }
    if (this.lastAlign !== align) {
      this.lastAlign = align;
      this.lb.horizontalAlign = align === "center" ? Label.HorizontalAlign.CENTER : align === "right" ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
    }
    if (color && this.lastColor !== color) {
      this.lastColor = color;
      this.lb.color = hexToColor(color);
    }
  }

  get node(): Node {
    return this.lb.node;
  }
  active(on: boolean): void {
    this.lb.node.active = on;
  }
  bold(on: boolean): void {
    if (this.lb.isBold !== on) this.lb.isBold = on;
  }
}

/** 视图对宿主的最小要求:给我一个布局帧(滚动位是唯一变量),外加动作与脏标记 */
export interface HeroViewHooks {
  layout: () => HeroSelectLayout;
  onAction: (a: HeroAction) => void;
  changed: () => void;
}

export class HeroSelectView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private model: HeroSelectModel;
  private hooks: HeroViewHooks;

  private panel: Plate;
  private dim: ReturnType<typeof flatBox>;
  private banner: Plate;
  private headerTitle: Txt;
  private headerSub: Txt;
  private listMask: Node;
  private rows: RowSlot[] = [];
  private track: ReturnType<typeof flatBox>;
  private thumb: ReturnType<typeof flatBox>;
  /** v6:详情面板框内的城堡窗景(压在面板之上、文字之下) */
  private detailScene: Plate;
  private detail: Plate;
  /** 详情立绘缺图时的硬边主色方块(独立子节点,不与详情板抢 UIRenderer 槽位) */
  private detailPortBox: Node;
  private detailPort: ReturnType<typeof iconNode>;
  private detailChar: Txt;
  private detailName: Txt;
  private detailTitle: Txt;
  private detailLore: Txt;
  private skillLabel: Txt;
  private skills: SkillSlot[] = [];
  private back: { plate: Plate; text: Txt };
  private confirm: { plate: Plate; text: Txt };
  private clear: { plate: Plate; text: Txt };
  private capture: Node;
  private touchId = -1;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, model: HeroSelectModel, hooks: HeroViewHooks) {
    this.frames = frames;
    this.model = model;
    this.hooks = hooks;
    this.root = makeNode("HeroSelectView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = flatBox("Dim", this.root);
    this.panel = new Plate("Panel", this.root, frames);
    this.banner = new Plate("Banner", this.root, frames);
    this.headerTitle = new Txt("Title", this.root);
    this.headerSub = new Txt("Sub", this.root);

    this.listMask = makeNode("List", this.root);
    this.listMask.addComponent(UITransform);
    (this.listMask.addComponent(Mask) as Mask).type = Mask.Type.GRAPHICS_RECT;
    for (let i = 0; i < ROW_POOL; i++) {
      const node = makeNode("Row" + i, this.listMask);
      node.addComponent(UITransform);
      // 兄弟次序 = 渲染次序:暗面 → 行板 → 主色竖条 → 立绘兜底块 → 立绘贴图 → 首字 → 名字 → 副信息 → 徽章板 → 徽章兜底框 → 徽章字
      const face = flatBox("RowFace", node);
      const plate = new Plate("RowPlate", node, frames);
      const accent = flatBox("RowAccent", node);
      const portBox = makeNode("PortraitBox", node);
      portBox.addComponent(Graphics);
      const portrait = iconNode("Portrait", node, frames, { x: 0, y: 0, w: 1, h: 1 });
      const char = new Txt("PortraitChar", node);
      const name = new Txt("Name", node);
      const sub = new Txt("Sub", node);
      const badge = new Plate("BadgePlate", node, frames);
      const badgeRing = makeNode("BadgeRing", node);
      badgeRing.addComponent(Graphics);
      const badgeText = new Txt("BadgeText", node);
      this.rows.push({ node, face, accent, plate, portrait, portBox, char, name, sub, badge, badgeRing, badgeText });
    }
    this.track = flatBox("Track", this.root);
    this.thumb = flatBox("Thumb", this.root);

    this.detail = new Plate("Detail", this.root, frames);
    this.detailScene = new Plate("DetailScene", this.root, frames);
    this.detailPortBox = makeNode("DetailPortraitBox", this.root);
    this.detailPortBox.addComponent(Graphics);
    this.detailPort = iconNode("DetailPortrait", this.root, frames, { x: 0, y: 0, w: 1, h: 1 });
    this.detailChar = new Txt("DetailChar", this.root);
    this.detailName = new Txt("DetailName", this.root);
    this.detailTitle = new Txt("DetailTitle", this.root);
    this.detailLore = new Txt("DetailLore", this.root);
    this.skillLabel = new Txt("SkillCaption", this.root);
    for (let i = 0; i < SKILL_POOL; i++) {
      this.skills.push({
        face: flatBox("SkillFace" + i, this.root),
        row: new Plate("SkillRow" + i, this.root, frames),
        chip: flatBox("SkillChip" + i, this.root),
        tag: new Txt("SkillTag" + i, this.root),
        label: new Txt("SkillName" + i, this.root),
        desc: new Txt("SkillDesc" + i, this.root),
      });
    }

    this.back = { plate: new Plate("Back", this.root, frames), text: new Txt("BackText", this.root) };
    this.confirm = { plate: new Plate("Confirm", this.root, frames), text: new Txt("ConfirmText", this.root) };
    this.clear = { plate: new Plate("Clear", this.root, frames), text: new Txt("ClearText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.bindPointer();
  }

  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /* ================= 指针 → 模型 ================= */

  private bindPointer(): void {
    const at = (e: { getUILocation(): { x: number; y: number } }) => toDesignSpace(this.capture, e.getUILocation());
    const scroll = this.model.scroll;
    this.capture.on(
      Node.EventType.TOUCH_START,
      (e: { getUILocation(): { x: number; y: number }; getID(): number }) => {
        if (this.touchId >= 0) return;
        const p = at(e);
        this.touchId = e.getID();
        // 只有落在列表视口内的按下才接管为滚动手势(与 Web beginHeroDrag 同一闸门)
        if (inRect(this.hooks.layout().list, p.x, p.y)) scroll.begin(p.y, this.now());
      },
      this
    );
    this.capture.on(
      Node.EventType.TOUCH_MOVE,
      (e: { getUILocation(): { x: number; y: number }; getID(): number }) => {
        if (e.getID() !== this.touchId) return;
        const p = at(e);
        scroll.move(p.y, this.now(), scroll.geometry(this.hooks.layout()));
        this.hooks.changed();
      },
      this
    );
    const finish = (consume: boolean) => (e: { getUILocation(): { x: number; y: number }; getID(): number }) => {
      if (e.getID() !== this.touchId) return;
      this.touchId = -1;
      const tapped = consume ? scroll.end(scroll.geometry(this.hooks.layout())) : (scroll.cancel(), true);
      this.hooks.changed();
      if (!tapped) return; // 手势已被拖拽消费,放弃点击判定
      const p = at(e);
      const a = this.model.hit(this.hooks.layout(), p.x, p.y);
      if (a) this.hooks.onAction(a);
    };
    this.capture.on(Node.EventType.TOUCH_END, finish(true), this);
    this.capture.on(Node.EventType.TOUCH_CANCEL, finish(false), this);
  }

  /** 时间戳:宿主没有 performance.now 时回落 Date.now(毫秒分辨率足够算甩动速度) */
  private now(): number {
    const g = globalThis as Record<string, any>;
    return typeof g.performance?.now === "function" ? g.performance.now() : Date.now();
  }

  /* ================= 同步 ================= */

  sync(): void {
    const p3 = viewTable().phase3;
    const lift = viewTable().menu.baselineLift;
    const L = this.hooks.layout();
    const screen = { w: DESIGN_W, h: logicalH() };

    this.dim.draw(fullRect(), p3.panelDim);
    // 屏底板:九宫格内缩落屏内页边距(整幅铺满会让角块没有可拉伸带)
    this.panel.show(KEY_PANEL, L.panel, "slice", p3.detailBg, p3.detailStroke);

    const head = this.model.header();
    const v4 = p3.heroesV4;
    const bandV4: Rect = { x: 0, y: 0, w: DESIGN_W, h: 64 };
    this.headerTitle.bold(true);
    if (v4) {
      /* v4 顶带:通栏 64 高的标题板(随赛季主色铁框),标题金 16 | 返回钮;次行 副题 12 灰 */
      this.banner.show(KEY_BAND_V4, bandV4, "slice", p3.detailBg, p3.detailStroke);
      this.banner.setActive(true);
      const tw = L.backBtn.x - 12 - 16;
      this.headerTitle.box({ x: 16, y: 6, w: tw, h: 28 }, 16, head.title, "left", HEX.gold);
      this.headerSub.box({ x: 16, y: 36, w: tw, h: 22 }, FS.micro, head.sub, "left", HEX.textSecondary);
    } else {
    // 标题横幅:整图拉伸(源图 2 倍),缺图退左起笔一档
    const bannerOn = this.banner.show(KEY_BANNER, L.banner, "stretch", p3.detailBg, p3.detailStroke);
    this.banner.setActive(bannerOn);
    if (bannerOn) {
      const t = L.titleBand;
      this.headerTitle.set(t.x, t.baseY, t.maxW, t.px, head.title, "center", HEX.gold, screen);
    } else {
      const t = L.titleBare;
      this.headerTitle.set(t.x, t.baseY, t.maxW, t.px, head.title, "left", HEX.gold, screen);
    }
    this.headerSub.set(L.subBand.x, L.subBand.baseY, L.subBand.maxW, FS.muted, head.sub, "left", HEX.textSecondary, screen);
    }

    /* --- 列表:Mask 容器 + 行池(行节点在列表局部坐标里) --- */
    const list = L.list;
    placeRect(this.listMask, list);
    this.listMask.getComponent(UITransform)!.setContentSize(list.w, list.h);
    const views = this.model.rows(L);
    this.rows.forEach((slot, i) => {
      const row = L.rows[i];
      const v = views[i];
      const on = !!row && !!v;
      slot.node.active = on;
      if (!on || !row) return;
      const box = { w: row.rect.w, h: row.rect.h };
      slot.node.setPosition(row.rect.x + row.rect.w / 2 - (list.x + list.w / 2), list.y + list.h / 2 - (row.rect.y + row.rect.h / 2), 0);
      (slot.node.getComponent(UITransform) || slot.node.addComponent(UITransform)).setContentSize(box.w, box.h);
      this.paintRow(slot, row, v, box, p3);
    });

    /* --- 滚动条:轨道恒画,滑块由 layout 给(null = 内容不超出视口) --- */
    this.track.draw(L.track, p3.scrollTrack);
    this.thumb.node.active = !!L.thumb;
    if (L.thumb) this.thumb.draw(L.thumb, p3.scrollThumb);

    /* --- 详情面板 --- */
    const d = L.detail;
    this.detail.show(KEY_PANEL, d, "slice", p3.detailBg, p3.detailStroke);
    this.detailScene.setActive(p3.heroesV4);
    if (p3.heroesV4) this.detailScene.show("scene_castle", heroDetailScene(d), "stretch");
    const det = this.model.detail();
    const port = L.portrait;
    const portOn = !det.empty && this.detailPort.show(`hero_${this.model.preview ?? ""}`);
    this.detailPort.node.active = portOn;
    if (portOn) placeRect(this.detailPort.node, port);
    // 立绘缺图:硬边主色方块垫底 + 名字首字(像素档不画圆角,圆边在 2px 网格上会抖糊)
    // v4:有立绘也画一圈骸骨白像框(暗底 + 2px 环),与主菜单英雄带同款
    this.detailPortBox.active = (!portOn || v4) && !det.empty;
    if (this.detailPortBox.active) {
      const g = this.detailPortBox.getComponent(Graphics)!;
      g.clear();
      g.fillColor = hexToColor(v4 ? V4_FACE : hexA(det.color, 0.18));
      g.rect(-port.w / 2, -port.h / 2, port.w, port.h);
      g.fill();
      g.fillColor = hexToColor(v4 && portOn ? V4_BONE : hexA(det.color, 0.55));
      strokeRing(g, port.w, port.h, RING_LINE_W);
      placeRect(this.detailPortBox, port);
    }
    // 立绘缺图档的首字只在**有预览英雄**时上屏：「不出战」既没有立绘也没有兜底方块，
    // 那一枚替代字形没有承载体，落在那里只会读成残留占位。
    this.detailChar.active(!portOn && !det.empty);
    if (!portOn && !det.empty) {
      this.detailChar.bold(true);
      const ch = det.name.slice(0, 1);
      this.detailChar.set(port.x + port.w / 2, port.y + port.h / 2 + PORTRAIT_CHAR_PX / 3, port.w, PORTRAIT_CHAR_PX, ch, "center", det.color, screen);
    }
    const emptyMode = det.empty;
    this.detailName.active(true);
    this.detailTitle.active(true);
    this.detailLore.active(!emptyMode);
    this.skillLabel.active(!emptyMode);
    if (emptyMode && v4) {
      const blockH = FS.section + EMPTY_LINE_PITCH;
      const blockTop = d.y + evenDown((d.h - blockH) / 2);
      this.detailName.bold(true);
      this.detailName.box({ x: d.x + 16, y: blockTop - 4, w: d.w - 32, h: FS.section + 8 }, FS.section, det.name, "center", HEX.textSecondary);
      this.detailTitle.box({ x: d.x + 16, y: blockTop + FS.section + 6, w: d.w - 32, h: FS.muted + 8 }, FS.muted, det.title, "center", HEX.textSecondary);
    } else if (emptyMode) {
      // 「不出战」:详情板里只有这两行,把它们作为一个块纵向居中(板心上下对称)。
      // 块高 = 主名行高 + 行步进,行步进沿用原档的 26,只换纵向落位、不改行距。
      const blockH = FS.section + EMPTY_LINE_PITCH;
      const blockTop = d.y + evenDown((d.h - blockH) / 2);
      this.detailName.bold(true);
      this.detailName.set(d.x + d.w / 2, blockTop + FS.section, d.w - 32, FS.section, det.name, "center", HEX.textSecondary, screen);
      this.detailTitle.set(d.x + d.w / 2, blockTop + blockH, d.w - 32, FS.muted, det.title, "center", HEX.textSecondary, screen);
    } else if (v4) {
      /* v4:名 22 金 / 称号 13 主色 / 正文 13 灰自动换行(盒高到立绘底,超出裁掉) */
      this.detailName.bold(true);
      this.detailName.box({ x: L.textX, y: port.y, w: L.loreW, h: 30 }, FS.title, det.name, "left", HEX.gold);
      this.detailTitle.box({ x: L.textX, y: port.y + 32, w: L.loreW, h: 22 }, FS.muted, det.title, "left", det.color);
      this.detailLore.box({ x: L.textX, y: port.y + 60, w: L.loreW, h: Math.max(FS.muted * 2, port.h - 60) }, FS.muted, det.lore, "left", HEX.textSecondary, undefined, true);
    } else {
      this.detailName.bold(true);
      this.detailName.set(L.textX, L.nameY, L.loreW, FS.title, det.name, "left", HEX.textPrimary, screen);
      this.detailTitle.set(L.textX, L.titleY, L.loreW, FS.muted, det.title, "left", det.color, screen);
      const lines = fitLines(det.lore, L.loreW, FS.muted).slice(0, LORE_LINES);
      this.detailLore.lines(lines, L.textX, Math.round(L.loreY - FS.muted * lift), L.loreW, FS.muted, HEX.textSecondary, screen);
    }
    this.skillLabel.bold(true);
    if (v4) this.skillLabel.box({ x: port.x, y: L.skillLabelY, w: 200, h: 22 }, FS.micro, "技能详情", "left", HEX.gold);
    else this.skillLabel.set(port.x, L.skillLabelY, 160, FS.micro, "技能详情", "left", HEX.gold, screen);
    this.skills.forEach((slot, i) => {
      const sr = L.skillRows[i];
      const line = det.skills[i];
      const on = !emptyMode && !!sr && !!line;
      slot.face.node.active = on && v4;
      slot.row.node.active = on;
      slot.chip.node.active = on;
      slot.tag.active(on);
      slot.label.active(on);
      slot.desc.active(on);
      if (!on || !sr || !line) return;
      if (v4) {
        slot.face.draw(sr.rect, V4_FACE);
        slot.row.show(KEY_SKILL_ROW, sr.rect, "slice", p3.detailBg, p3.detailStroke);
        slot.chip.draw(sr.chip, hexA(det.color, 0.16), hexA(det.color, 0.55), RING_LINE_W);
        slot.tag.bold(true);
        slot.tag.box(sr.chip, FS.micro, line.tag, "center", det.color);
        slot.label.bold(true);
        const tx = sr.rect.x + HERO_SKILL_TEXT_X;
        slot.label.box({ x: tx, y: sr.rect.y + 2, w: sr.descW, h: 22 }, FS.body, line.label, "left", HEX.textPrimary);
        slot.desc.box({ x: tx, y: sr.rect.y + 24, w: sr.descW, h: Math.max(16, sr.rect.h - 28) }, FS.micro, line.desc, "left", HEX.textMuted);
        return;
      }
      slot.row.show(KEY_SKILL_ROW, sr.rect, "slice", p3.detailBg, p3.detailStroke);
      // 胶囊:22 高撑不起九宫格的可拉伸带 → 代码硬边块(主色 16% 底 + 主色 55% 描边)
      slot.chip.draw(sr.chip, hexA(det.color, 0.16), hexA(det.color, 0.55), RING_LINE_W);
      slot.tag.bold(true);
      slot.tag.set(sr.chip.x + sr.chip.w / 2, sr.chip.y + sr.chip.h / 2 + FS.micro / 3, sr.chip.w, FS.micro, line.tag, "center", det.color, screen);
      slot.label.bold(true);
      slot.label.set(sr.rect.x + HERO_SKILL_TEXT_X, sr.labelY, sr.descW, FS.body, line.label, "left", HEX.textPrimary, screen);
      slot.desc.set(sr.rect.x + HERO_SKILL_TEXT_X, sr.descY, sr.descW, FS.micro, line.desc, "left", HEX.textMuted, screen);
    });

    /* --- 右上返回 / 底部确定与不出战 --- */
    const B = L.backBtn;
    this.back.plate.show(KEY_BACK, B, "slice", p3.detailBg, p3.detailStroke);
    const C = L.confirm;
    this.confirm.plate.show(KEY_PRIMARY, C, "slice", p3.heroRowSel, theme.gold);
    this.confirm.text.bold(true);
    const CL = L.clearBtn;
    this.clear.plate.show(KEY_CLEAR, CL, "slice", p3.detailBg, p3.detailStroke);
    if (v4) {
      this.back.text.box(B, FS.muted, "返回", "center", p3.buttonText);
      this.confirm.text.box(C, 15, this.model.confirmText(), "center", HEX.actionPrimary);
      this.clear.text.box(CL, FS.muted, "不出战", "center", HEX.textSecondary);
    } else {
      this.back.text.set(B.x + B.w / 2, B.y + B.h / 2 + FS.muted / 3, B.w, FS.muted, "返回", "center", p3.buttonText, screen);
      this.confirm.text.set(C.x + C.w / 2, C.y + C.h / 2 + FS.body / 3, C.w - 16, FS.body, this.model.confirmText(), "center", HEX.textPrimary, screen);
      this.clear.text.set(CL.x + CL.w / 2, CL.y + CL.h / 2 + FS.muted / 3, CL.w - 8, FS.muted, "不出战", "center", HEX.textSecondary, screen);
    }
  }

  /** 一行的行板 / 立绘位 / 双行文字 / 右缘徽章(矩形全部来自 layout,行内一律走列表局部坐标) */
  private paintRow(slot: RowSlot, row: HeroRowGeometry, v: HeroRowView, box: { w: number; h: number }, p3: Phase3Params): void {
    // 行板:预览行换「当前行」语义那张贴图。Plate 的落位参照恒为整屏,而行节点活在列表
    // 局部坐标里 → 贴完按行盒重落一次(行板恰好铺满行节点自身,局部矩形就是 0,0,box)
    const full: Rect = { x: 0, y: 0, w: box.w, h: box.h };
    const v4 = p3.heroesV4;
    // v4:暗石面垫底,预览行金框,已解锁行左侧一条英雄主色竖条(与商店武器行同款)
    slot.face.node.active = v4;
    if (v4) {
      slot.face.draw(full, V4_FACE);
      placeRect(slot.face.node, full, box.w, box.h);
    }
    slot.plate.show(v.active ? (v4 ? KEY_ROW_ACTIVE_V4 : KEY_ROW_ACTIVE) : KEY_ROW, row.rect, "slice", v.active ? p3.heroRowSel : p3.heroRowIdle, v.active ? theme.select : p3.heroRowStroke);
    placeRect(slot.plate.node, full, box.w, box.h);
    slot.accent.node.active = v4 && v.released;
    if (v4 && v.released) {
      const bar: Rect = { x: 4, y: 6, w: 4, h: box.h - 12 };
      slot.accent.draw(bar, v.color);
      placeRect(slot.accent.node, bar, box.w, box.h);
    }

    // 立绘:贴图优先,缺图退硬边主色方块 + 名字首字(未解锁行走灰色档)
    const lp = local(row.portrait, row.rect);
    const iconOn = v.released && slot.portrait.show(`hero_${v.id}`);
    slot.portrait.node.active = iconOn;
    if (iconOn) placeRect(slot.portrait.node, lp, box.w, box.h);
    slot.portBox.active = !iconOn;
    slot.char.active(!iconOn);
    if (!iconOn) {
      const g = slot.portBox.getComponent(Graphics)!;
      g.clear();
      g.fillColor = hexToColor(hexA(v.color, 0.18));
      g.rect(-lp.w / 2, -lp.h / 2, lp.w, lp.h);
      g.fill();
      g.fillColor = hexToColor(hexA(v.color, 0.55));
      strokeRing(g, lp.w, lp.h, RING_LINE_W);
      placeRect(slot.portBox, lp, box.w, box.h);
      slot.char.bold(true);
      slot.char.set(lp.x + lp.w / 2, lp.y + lp.h / 2 + FS.title / 3, lp.w, FS.title, v.name.slice(0, 1), "center", v.color, box);
    }

    // 双行文字:限宽由 layout 给到「徽章左缘前一道偶数缝」,视图不另算一份
    slot.name.bold(true);
    if (v4) {
      const tx = row.textX - row.rect.x;
      slot.name.box({ x: tx, y: 12, w: row.textW, h: 26 }, 15, v.name, "left", v.released ? HEX.textPrimary : HEX.textMuted, box);
      slot.sub.box({ x: tx, y: 38, w: row.textW, h: 22 }, FS.micro, v.sub, "left", v.released ? HEX.textSecondary : HEX.textMuted, box);
    } else {
    slot.name.set(row.textX - row.rect.x, row.nameY - row.rect.y, row.textW, FS.body, v.name, "left", v.released ? HEX.textPrimary : HEX.textMuted, box);
    slot.sub.set(row.textX - row.rect.x, row.subY - row.rect.y, row.textW, FS.micro, v.sub, "left", v.released ? HEX.textSecondary : HEX.textMuted, box);
    }

    // 套组徽章:九宫格底板优先,缺图退硬边方框(当前出战 = 金描边,语义色不丢)
    const lb = local(row.badge, row.rect);
    const badgeFill = hexA(v.color, v.current ? 0.2 : 0.16);
    const badgeStroke = v.current ? theme.gold : hexA(v.color, 0.55);
    const textured = slot.badge.show(KEY_BADGE, row.badge, "slice", badgeFill, badgeStroke);
    placeRect(slot.badge.node, lb, box.w, box.h);
    slot.badgeRing.active = !textured;
    if (!textured) {
      const g = slot.badgeRing.getComponent(Graphics)!;
      g.clear();
      g.fillColor = hexToColor(badgeFill);
      g.rect(-lb.w / 2, -lb.h / 2, lb.w, lb.h);
      g.fill();
      g.fillColor = hexToColor(badgeStroke);
      strokeRing(g, lb.w, lb.h, RING_LINE_W);
      placeRect(slot.badgeRing, lb, box.w, box.h);
    }
    slot.badgeText.bold(true);
    if (v4) slot.badgeText.box(lb, FS.micro, v.badgeText, "center", v.color, box);
    else slot.badgeText.set(lb.x + lb.w / 2, lb.y + lb.h / 2 + FS.micro / 3, lb.w, FS.micro, v.badgeText, "center", v.color, box);
  }
}

/** 行几何(共享层 layout 的行项) */
type HeroRowGeometry = HeroSelectLayout["rows"][number];

/** 绝对矩形 → 所属行矩形里的局部矩形(左上原点) */
function local(r: Rect, origin: Rect): Rect {
  return { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h };
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
