/**
 * 章间商店屏 —— Web `src/game.ts:drawShop` 的节点化替换。
 *
 * 三层分工:几何问共享层 `game/ui/shop.ts:shopLayoutPure()`(顶带恒 0..64,底带与全部
 * 内容带贴本帧逻辑屏高,富余摊给行高 / 带距 / 卡高),账本与文案问 `shop/ShopModel.ts`,
 * 本文件只把两者落到节点上。
 * 顶信息条与底操作条复用 `hud_dock_top` / `hud_dock_bottom` 九宫格(边距走 borderOf),
 * 所以章间商店与战斗屏看上去就是同一块面板 —— 这正是商店骨架重设计的原意。
 *
 * 指针:整屏一个 Capture 节点 + `model.hitTest()`。热区判定与绘制同源于 shopLayoutPure
 * 的产物,不给每块底板挂 touch —— 那样会出现"命中框 ≠ 画面框"的第二套几何。
 *
 * 文本一律挂在屏根上,走 `ui/PanelKit.placeLine` 的 Web 口径:x 随对齐就是 `fillText` 的锚点
 * (左起笔 / 中中心 / 右末笔),maxW 传容器内宽,于是限宽与热区同源于 shopLayoutPure 的矩形。
 */

import { Graphics, Label, Node, Sprite, SpriteFrame } from "cc";
import { DESIGN_W, coverRect, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, approxW, fitOne, flatBox, iconNode, placeLine, qualityBox } from "../ui/PanelKit";
import { HUD_BOT_H, HUD_TOP_H } from "../game/ui/hud";
import { SHOP_PAD, cardIconSize, cardRibbon } from "../game/ui/shop";
import type { ShopAction, ShopModel } from "./ShopModel";

/** 坞板缺图回退(与 HudView.dockPlate 同一形态:深色板 + 朝战场一侧的紫色细描边) */
/** v5 卡面宝箱边长(卡高 ≥200 档的 36 图标 + 28) */
const SHOP_CHEST_S = 64;
const ZERO_RECT = { x: 0, y: 0, w: 0, h: 0 };
/** 品质框键 → 宝箱档:传奇/隐藏金箱、史诗紫箱、其余蓝箱 */
function shopChestKey(frameKey: string): string {
  if (/legendary|hidden/.test(frameKey)) return "shop_chest_gold";
  if (/epic/.test(frameKey)) return "shop_chest_purple";
  return "shop_chest_blue";
}
const DOCK_FILL = "rgba(12,15,24,0.95)";
const DOCK_STROKE = "rgba(200,182,255,0.28)";
/** 分区标题条缺图回退描边(Web drawSectionHeader 的金色细边) */
const SECTION_STROKE = "rgba(255,215,106,0.25)";

/** 一行可重排的文本:每次给锚点 x(随对齐 = Web fillText 的 x)/ 基线 / 容器内宽 / 字号 / 颜色,内部只在变化时改 Label 状态 */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }
  set(x: number, baseY: number, maxW: number, px: number, text: string, align: "left" | "center" | "right" = "left", color?: string): void {
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
    bindLabel(this.lb, fitOne(text, maxW, px));
    placeLine(this.lb.node, x, baseY, maxW, px, align);
  }
  /**
   * 盒内对齐档(v4):节点 = 盒,Overflow.CLAMP,水平对齐随 align,垂直居中;超宽走 fitOne 截断。
   * 与 set() 的基线估算不同,这里的文字视觉中线严格对齐盒中线(主菜单 §15.5 同一修法)。
   */
  box(r: { x: number; y: number; w: number; h: number }, px: number, text: string, align: "left" | "center" | "right" = "left", color?: string): void {
    if (this.lastPx !== px) {
      this.lastPx = px;
      this.lb.fontSize = px;
      this.lb.lineHeight = Math.round(px * 1.3);
    }
    const key = "box-" + align;
    if (this.lastAlign !== key) {
      this.lastAlign = key;
      this.lb.horizontalAlign = align === "center" ? Label.HorizontalAlign.CENTER : align === "right" ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
    }
    if (this.lb.overflow !== Label.Overflow.CLAMP) this.lb.overflow = Label.Overflow.CLAMP;
    // 单行语义:关掉自动换行,否则超宽串会在盒内折成两行再被 CLAMP 裁掉上半截
    if (this.lb.enableWrapText) this.lb.enableWrapText = false;
    if (this.lb.verticalAlign !== Label.VerticalAlign.CENTER) this.lb.verticalAlign = Label.VerticalAlign.CENTER;
    if (color && this.lastColor !== color) {
      this.lastColor = color;
      this.lb.color = hexToColor(color);
    }
    bindLabel(this.lb, fitOne(text, r.w, px));
    placeRect(this.lb.node, r);
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

interface ToolSlot {
  plate: Plate;
  flat: ReturnType<typeof flatBox>;
  text: Txt;
}

interface CardSlot {
  frame: ReturnType<typeof qualityBox>;
  /** v5:卡面宝箱(shop_chest_gold/purple/blue,按品质框分档;v4 版式下替掉小图标) */
  chest: ReturnType<typeof iconNode>;
  icon: ReturnType<typeof iconNode>;
  iconChar: Txt;
  name: Txt;
  quality: Txt;
  sub: Txt;
  price: Txt;
  setTag: Txt;
  seal: ReturnType<typeof iconNode>;
  soldTitle: Txt;
  soldHint: Txt;
}

interface WeaponSlot {
  /** v4:暗石面 / 品质竖条 / 铁框(选中金框)/ 空槽占位文字 */
  face: ReturnType<typeof flatBox>;
  accent: ReturnType<typeof flatBox>;
  plate: Plate;
  empty: Txt;
  frame: ReturnType<typeof qualityBox>;
  icon: ReturnType<typeof iconNode>;
  name: Txt;
  sub: Txt;
  upgrade: { plate: Plate; text: Txt };
  destroy: { plate: Plate; text: Txt };
}

/** 独有技能只读行(R10):暗石面 + 节律色竖条 + 图标 + 名 / 副标;无钮无热区 */
interface SkillSlot {
  face: ReturnType<typeof flatBox>;
  accent: ReturnType<typeof flatBox>;
  icon: ReturnType<typeof iconNode>;
  name: Txt;
  sub: Txt;
}

interface MergeSlot {
  face: ReturnType<typeof flatBox>;
  plate: Plate;
  frame: ReturnType<typeof qualityBox>;
  name: Txt;
  fee: Txt;
}

interface HeaderSlot {
  plate: Plate;
  /** v4:标题行底下的 1px 分隔线(v4 不画板) */
  line: ReturnType<typeof flatBox>;
  title: Txt;
  right: Txt;
}

export class ShopView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private model: ShopModel;
  private onAction: (a: ShopAction) => void;
  /** 战场标定高(996):底坞与内容带恒锚它,多余屏高归 restZone(与 Web drawRestZone 同口径) */
  private wh: number;

  private cover: Node;
  private coverSp: Sprite;
  private dim: Node;
  private dimGfx: Graphics;
  private zone: ReturnType<typeof flatBox>;
  private rest: ReturnType<typeof flatBox>;
  private topDock: Plate;
  private bottomDock: Plate;

  private title: Txt;
  private slots: Txt;
  private goldIcon: ReturnType<typeof iconNode>;
  private goldText: Txt;
  private intelIcon: ReturnType<typeof iconNode>;
  private intelText: Txt;
  private setText: Txt;
  private setBar: { node: Node; draw: (r: { x: number; y: number; w: number; h: number }, ratio: number, color: string) => void };
  private bonusText: Txt;
  private recText: Txt;
  private priceHint: Txt;

  private tools: ToolSlot[] = [];
  private cards: CardSlot[] = [];
  private slotBtn: ToolSlot;
  private skillHeader: HeaderSlot;
  private skills: SkillSlot[] = [];
  private weaponHeader: HeaderSlot;
  private weapons: WeaponSlot[] = [];
  private weaponEmpty: Txt;
  private mergeHeader: HeaderSlot;
  private merges: MergeSlot[] = [];
  private mergeEmpty: Txt;
  private nextIntel: Txt;
  private nextRec: Txt;
  private nextBtn: ToolSlot;
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, model: ShopModel, wh: number, onAction: (a: ShopAction) => void) {
    this.frames = frames;
    this.model = model;
    this.onAction = onAction;
    this.wh = wh;
    this.root = makeNode("ShopView", parent);

    this.cover = makeNode("Cover", this.root);
    this.coverSp = this.cover.addComponent(Sprite);
    this.coverSp.sizeMode = Sprite.SizeMode.CUSTOM;
    this.dim = makeNode("Dim", this.root);
    this.dimGfx = this.dim.addComponent(Graphics);
    this.zone = flatBox("Zone", this.root);
    this.rest = flatBox("RestZone", this.root);
    this.topDock = new Plate("TopDock", this.root, frames);
    this.bottomDock = new Plate("BottomDock", this.root, frames);

    this.title = new Txt("Title", this.root);
    this.goldIcon = iconNode("GoldIcon", this.root, frames, { x: 0, y: 0, w: 13, h: 13 });
    this.goldText = new Txt("GoldText", this.root);
    this.intelIcon = iconNode("IntelIcon", this.root, frames, { x: 0, y: 0, w: 12, h: 12 });
    this.intelText = new Txt("IntelText", this.root);
    this.slots = new Txt("Slots", this.root);
    this.setText = new Txt("SetText", this.root);
    this.setBar = this.makeBar("SetBar");
    this.bonusText = new Txt("BonusText", this.root);
    this.recText = new Txt("RecText", this.root);
    this.priceHint = new Txt("PriceHint", this.root);

    for (let i = 0; i < 4; i++) this.tools.push({ plate: new Plate("Tool" + i, this.root, frames), flat: flatBox("ToolFlat" + i, this.root), text: new Txt("ToolText" + i, this.root) });
    for (let i = 0; i < 3; i++) {
      this.cards.push({
        frame: qualityBox("CardFrame" + i, this.root, frames),
        chest: iconNode("CardChest" + i, this.root, frames, ZERO_RECT),
        icon: iconNode("CardIcon" + i, this.root, frames, { x: 0, y: 0, w: 36, h: 36 }),
        iconChar: new Txt("CardIconChar" + i, this.root),
        name: new Txt("CardName" + i, this.root),
        quality: new Txt("CardQuality" + i, this.root),
        sub: new Txt("CardSub" + i, this.root),
        price: new Txt("CardPrice" + i, this.root),
        setTag: new Txt("CardSet" + i, this.root),
        seal: iconNode("CardSeal" + i, this.root, frames, { x: 0, y: 0, w: 40, h: 40 }),
        soldTitle: new Txt("CardSold" + i, this.root),
        soldHint: new Txt("CardSoldHint" + i, this.root),
      });
    }
    this.slotBtn = { plate: new Plate("SlotBtn", this.root, frames), flat: flatBox("SlotFlat", this.root), text: new Txt("SlotBtnText", this.root) };
    this.skillHeader = { plate: new Plate("SkillHeader", this.root, frames), line: flatBox("SkillHeaderLine", this.root), title: new Txt("SkillHeaderTitle", this.root), right: new Txt("SkillHeaderRight", this.root) };
    for (let i = 0; i < 3; i++) {
      this.skills.push({
        face: flatBox("SkillFace" + i, this.root),
        accent: flatBox("SkillAccent" + i, this.root),
        icon: iconNode("SkillIcon" + i, this.root, frames, { x: 0, y: 0, w: 24, h: 24 }),
        name: new Txt("SkillName" + i, this.root),
        sub: new Txt("SkillSub" + i, this.root),
      });
    }
    this.weaponHeader = { plate: new Plate("WeaponHeader", this.root, frames), line: flatBox("WeaponHeaderLine", this.root), title: new Txt("WeaponHeaderTitle", this.root), right: new Txt("WeaponHeaderRight", this.root) };
    for (let i = 0; i < 8; i++) {
      this.weapons.push({
        face: flatBox("WeaponFace" + i, this.root),
        accent: flatBox("WeaponAccent" + i, this.root),
        plate: new Plate("WeaponPlate" + i, this.root, frames),
        empty: new Txt("WeaponEmptyRow" + i, this.root),
        frame: qualityBox("WeaponFrame" + i, this.root, frames),
        icon: iconNode("WeaponIcon" + i, this.root, frames, { x: 0, y: 0, w: 24, h: 24 }),
        name: new Txt("WeaponName" + i, this.root),
        sub: new Txt("WeaponSub" + i, this.root),
        upgrade: { plate: new Plate("WeaponUpgrade" + i, this.root, frames), text: new Txt("WeaponUpgradeText" + i, this.root) },
        destroy: { plate: new Plate("WeaponDestroy" + i, this.root, frames), text: new Txt("WeaponDestroyText" + i, this.root) },
      });
    }
    this.weaponEmpty = new Txt("WeaponEmpty", this.root);
    this.mergeHeader = { plate: new Plate("MergeHeader", this.root, frames), line: flatBox("MergeHeaderLine", this.root), title: new Txt("MergeHeaderTitle", this.root), right: new Txt("MergeHeaderRight", this.root) };
    for (let i = 0; i < 4; i++) this.merges.push({ face: flatBox("MergeFace" + i, this.root), plate: new Plate("MergePlate" + i, this.root, frames), frame: qualityBox("MergeFrame" + i, this.root, frames), name: new Txt("MergeName" + i, this.root), fee: new Txt("MergeFee" + i, this.root) });
    this.mergeEmpty = new Txt("MergeEmpty", this.root);
    this.nextIntel = new Txt("NextIntel", this.root);
    this.nextRec = new Txt("NextRec", this.root);
    this.nextBtn = { plate: new Plate("NextBtn", this.root, frames), flat: flatBox("NextFlat", this.root), text: new Txt("NextText", this.root) };
    this.nextBtn.flat.node.active = false;
    this.slotBtn.flat.node.active = true;

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = this.model.hitTest(p.x, p.y, logicalH());
        if (a) this.onAction(a);
      },
      this
    );
  }

  /** 资源流到位后补一次(底图与图标的就绪态会随之变化) */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /* ================= 每轮同步 ================= */

  sync(): void {
    const p3 = viewTable().phase3;
    const hud = viewTable().hud;
    const h = logicalH();
    const L = this.model.layout(h);
    const c = this.model.content();
    const pad = SHOP_PAD;
    const rx = DESIGN_W - pad;

    this.paintBackdrop();
    this.topDock.show("hud_dock_top", { x: 0, y: 0, w: DESIGN_W, h: HUD_TOP_H }, "slice", DOCK_FILL, DOCK_STROKE);
    this.bottomDock.show("hud_dock_bottom", { x: 0, y: L.dockTop, w: DESIGN_W, h: HUD_BOT_H }, "slice", DOCK_FILL, DOCK_STROKE);
    const v4 = p3.shopV4;
    const zoneY = L.weaponLabelY - 8;
    this.zone.node.active = !v4;
    if (!v4) this.zone.draw({ x: 8, y: zoneY, w: DESIGN_W - 16, h: L.dockTop - 4 - zoneY }, p3.listZone);
    /** 底坞贴本帧屏高、内容带吃满富余 → 标定高以下那条平色带不再有落点;
     *  仍按 `this.wh`(战场标定高 996)兜一层:几何少盖一格,这条带立刻补上,不留背景断口。 */
    const covered = Math.max(L.dockTop + HUD_BOT_H, this.wh);
    const rest = Math.max(0, h - covered);
    this.rest.node.active = rest > 0;
    if (rest > 0) this.rest.draw({ x: 0, y: covered, w: DESIGN_W, h: rest }, hud.colors.restZoneFill);

    if (v4) {
      /* --- v4 顶信息条:首行 标题(金 16)| 金币图标 + 数字(金 16);次行 敌情(12)| 槽位(12) --- */
      this.title.bold(true);
      this.title.box({ x: pad, y: 6, w: 240, h: 28 }, 16, c.titleText, "left", HEX.gold);
      const gw = Math.ceil(approxW(c.goldText, 16)) + 6;
      this.goldIcon.show("icon_gold");
      placeRect(this.goldIcon.node, { x: rx - gw - 26, y: 10, w: 20, h: 20 });
      this.goldText.bold(true);
      this.goldText.box({ x: rx - gw, y: 6, w: gw, h: 28 }, 16, c.goldText, "right", HEX.gold);
      const intelOn2 = !!c.intelIconKey && this.intelIcon.show(c.intelIconKey);
      this.intelIcon.node.active = intelOn2;
      if (intelOn2) placeRect(this.intelIcon.node, { x: pad, y: 41, w: 12, h: 12 });
      this.intelText.box({ x: intelOn2 ? pad + 16 : pad, y: 36, w: 340, h: 22 }, FS.micro, c.intelText, "left", HEX.textSecondary);
      this.slots.box({ x: rx - 120, y: 36, w: 120, h: 22 }, FS.micro, c.slotText, "right", HEX.textSecondary);
      /* 套组链 / 推荐 / 卡价提示:说明行(卡带与槽位钮之间) */
      const cy = L.captionY ?? L.slotBtn.y - 20;
      const setOn2 = !!c.setText;
      this.setText.active(setOn2);
      this.setBar.node.active = false;
      this.bonusText.active(setOn2);
      this.recText.active(!setOn2);
      if (setOn2 && c.setText) {
        this.setText.bold(true);
        this.setText.box({ x: pad, y: cy, w: 150, h: 16 }, FS.micro, c.setText, "left", c.setColor ?? HEX.echo);
        const tw2 = Math.min(150, approxW(c.setText, FS.micro));
        this.bonusText.box({ x: pad + tw2 + 8, y: cy, w: 210, h: 16 }, FS.micro, c.bonusText ?? "", "left", HEX.textSecondary);
      } else {
        this.recText.box({ x: pad, y: cy, w: 340, h: 16 }, FS.micro, c.recText, "left", HEX.textSecondary);
      }
      this.priceHint.box({ x: rx - 160, y: cy, w: 160, h: 16 }, FS.micro, c.priceHint, "right", HEX.textMuted);
    } else {
    /* --- 顶信息条:三行基线 19/39/58,与战斗顶坞同骨架 --- */
    this.title.bold(true);
    this.title.set(pad, 19, 160, FS.micro, c.titleText, "left", HEX.gold);
    const gw = approxW(c.goldText, FS.micro);
    this.goldIcon.show("icon_gold");
    placeRect(this.goldIcon.node, { x: rx - 18 - gw - 16, y: 19 - 13, w: 13, h: 13 });
    this.goldText.set(rx, 19, 120, FS.micro, c.goldText, "right", HEX.gold);
    const intelOn = !!c.intelIconKey && this.intelIcon.show(c.intelIconKey);
    this.intelIcon.node.active = intelOn;
    if (intelOn) placeRect(this.intelIcon.node, { x: pad, y: 29, w: 12, h: 12 });
    this.intelText.set(intelOn ? pad + 16 : pad, 39, 330, FS.micro, c.intelText, "left", hud.colors.stageText);
    this.slots.set(rx, 39, 120, FS.micro, c.slotText, "right", HEX.textSecondary);

    const setOn = !!c.setText;
    this.setText.active(setOn);
    this.setBar.node.active = setOn;
    this.bonusText.active(setOn);
    this.recText.active(!setOn);
    if (setOn && c.setText) {
      this.setText.bold(true);
      this.setText.set(pad, 58, 150, FS.micro, c.setText, "left", c.setColor ?? HEX.echo);
      const tw = Math.min(150, approxW(c.setText, FS.micro));
      const bx = pad + tw + 8;
      this.setBar.draw({ x: bx, y: 52, w: p3.setBarW, h: p3.setBarH }, c.setProgress, c.setColor ?? HEX.echo);
      this.bonusText.set(bx + p3.setBarW + 8, 58, 190, FS.micro, c.bonusText ?? "");
      this.recText.set(pad, 58, 330, FS.micro, "");
    } else {
      this.recText.set(pad, 58, 330, FS.micro, c.recText, "left", HEX.textSecondary);
    }
    this.priceHint.set(rx, 58, 160, FS.micro, c.priceHint, "right", HEX.textMuted);
    }

    /* --- 工具钮行:刷新/融合走次级皮(禁态平面),重开/主页走危险皮 --- */
    this.tools.forEach((slot, i) => {
      const b = L.toolBtns[i];
      const v = c.tools[i];
      const on = !!b && !!v;
      slot.plate.node.active = on;
      slot.text.active(on);
      if (!on) return;
      const danger = v.kind === "danger";
      const skinned = danger || v.enabled;
      slot.flat.node.active = !skinned;
      if (skinned) slot.plate.show(danger ? "btn_danger" : v4 ? "btn_iron" : "btn_minor", b, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
      else slot.flat.draw(b, p3.buttonDisabledBg, p3.buttonDisabledStroke);
      slot.text.bold(true);
      const toolColor = danger ? HEX.actionDanger : v.id === "refresh" ? HEX.gold : v.enabled ? HEX.actionPrimary : HEX.textMuted;
      if (v4) slot.text.box(b, FS.body, v.text, "center", toolColor);
      else slot.text.set(b.x + b.w / 2, b.y + b.h / 2 + FS.body / 3, b.w - 12, FS.body, v.text, "center", toolColor);
    });

    /* --- 三张可购卡(买后售罄,刷新才有新货) --- */
    this.cards.forEach((slot, i) => {
      const r = L.cards[i];
      const v = c.cards[i];
      slot.frame.node.active = !!r && !!v;
      if (!r || !v) return;
      const icx = r.x + r.w / 2;
      // 卡框走 frame_<品质> 贴图时按九宫格边距吃进一圈,行位与限宽随之内让;回退画描边时占位为 0,行位不变
      const ib = slot.frame.draw(r, v.soldOut ? p3.soldOutFrame : v.color, true, v.frameKey);
      const dy = Math.max(0, ib - 7);
      // 价格行贴卡底:Label 文本盒在基线以下还有 ≈12 逻辑 px 降部,让出量取「既有 14」与「切边带 + 降部」的较大者
      const dyb = Math.max(14, ib + 12);
      const inner = r.w - Math.max(8, ib) * 2;
      /**
       * 卡框源图第 42..67 行是一条横贯卡面的装饰带,它落在九宫格的可拉伸带内,
       * 屏上行位随卡高缩放。图标此前钉在卡顶缘下 14 + dy 处,于是这条带从图标腰上
       * 横穿过去;改为把带换算成逻辑行后让图标**居中压在带上**,带子读作图标的底座。
       */
      const rb = cardRibbon(r.h, ib, viewTable().cardFrame);
      const iconS = cardIconSize(r.h);
      const iconTop = r.y + Math.round((rb.center - iconS / 2) / 2) * 2;
      const iconBottom = iconTop + iconS;
      // v5:v4 版式的卡面是一只宝箱(示意图的三只金/紫/蓝箱),底缘对齐原图标底缘;小图标与首字回退都让位
      // v6:卡面按槽位取示意图三件道具(水晶球 / 十字 / 魔典),缺图退品质宝箱
      const chestOn = viewTable().phase3.shopV4 && !v.soldOut && (slot.chest.show(`shop_art_${i + 1}`) || slot.chest.show(shopChestKey(v.frameKey)));
      slot.chest.node.active = chestOn;
      if (chestOn) placeRect(slot.chest.node, { x: icx - SHOP_CHEST_S / 2, y: iconBottom - SHOP_CHEST_S, w: SHOP_CHEST_S, h: SHOP_CHEST_S });
      const iconOn = !chestOn && !v.soldOut && !!v.iconKey && slot.icon.show(v.iconKey);
      slot.icon.node.active = iconOn;
      if (iconOn) placeRect(slot.icon.node, { x: icx - iconS / 2, y: iconTop, w: iconS, h: iconS });
      slot.iconChar.active(!chestOn && !v.soldOut && !iconOn);
      if (!chestOn && !v.soldOut && !iconOn) slot.iconChar.set(icx, iconTop + Math.round(iconS / 2) + Math.round(FS.section / 3), 40, FS.section, v.name.slice(0, 1), "center", v.color);
      const sold = v.soldOut;
      slot.name.active(!sold);
      slot.quality.active(!sold);
      slot.sub.active(!sold);
      slot.price.active(!sold);
      slot.setTag.active(!sold && !!v.setBadge);
      slot.seal.node.active = sold;
      slot.soldTitle.active(sold);
      slot.soldHint.active(sold);
      if (sold) {
        const seal = Math.min(r.w, r.h) - 16;
        slot.seal.show("card_soldout");
        placeRect(slot.seal.node, { x: icx - seal / 2, y: r.y + (r.h - seal) / 2, w: seal, h: seal });
        slot.soldTitle.bold(true);
        slot.soldTitle.set(icx, r.y + r.h / 2 + 6, inner, FS.section, "售 罄", "center", HEX.textSecondary);
        slot.soldHint.set(icx, r.y + r.h / 2 + 28, inner, FS.micro, v.sub, "center", HEX.textSecondary);
        return;
      }
      slot.name.bold(true);
      slot.name.set(icx, iconBottom + FS.body, inner, FS.body, v.name, "center", v.color);
      slot.quality.set(icx, iconBottom + FS.body + 18, inner, FS.muted, v.qualityName, "center", v.color);
      slot.sub.set(icx, iconBottom + FS.body + 38, inner, FS.micro, v.sub, "center", "#CFCFCF");
      slot.price.bold(true);
      slot.price.set(icx, r.y + r.h - dyb, inner, FS.body, v.priceText, "center", v.afford ? HEX.gold : HEX.textMuted);
      if (v.setBadge) slot.setTag.set(r.x + r.w - 8 - dy, r.y + 19 + dy, 44, FS.micro, v.setBadge, "right", v.setBadgeColor ?? HEX.echo);
    });

    /* --- 槽位 +1(金币出口) --- */
    {
      const sl = L.slotBtn;
      const enabled = c.slotBtn.enabled;
      this.slotBtn.plate.node.active = enabled;
      this.slotBtn.flat.node.active = !enabled;
      if (enabled) this.slotBtn.plate.show("btn_minor", sl, "slice");
      else this.slotBtn.flat.draw(sl, p3.buttonDisabledBg, p3.buttonDisabledStroke);
      this.slotBtn.text.bold(true);
      if (v4) this.slotBtn.text.box(sl, FS.muted, c.slotBtn.text, "center", enabled ? HEX.actionPrimary : HEX.textMuted);
      else this.slotBtn.text.set(sl.x + sl.w / 2, sl.y + sl.h / 2 + FS.muted / 3, sl.w - 16, FS.muted, c.slotBtn.text, "center", enabled ? HEX.actionPrimary : HEX.textMuted);
    }

    /* --- 独有技能只读段(R10 两列表;v4 且有技能时才画) --- */
    const skillOn = v4 && L.skillLabelY !== null && c.skills.length > 0;
    this.skillHeader.plate.node.active = false;
    this.skillHeader.line.node.active = skillOn;
    this.skillHeader.title.active(skillOn);
    this.skillHeader.right.active(skillOn);
    if (skillOn && L.skillLabelY !== null) this.sectionHeader(this.skillHeader, L.skillLabelY, L.headerH, c.skillHeader.title, c.skillHeader.right);
    this.skills.forEach((slot, i) => {
      const r = L.skillRows[i];
      const v = c.skills[i];
      const on = skillOn && !!r && !!v;
      slot.face.node.active = on;
      slot.accent.node.active = on;
      slot.icon.node.active = on;
      slot.name.active(on);
      slot.sub.active(on);
      if (!on || !r || !v) return;
      slot.face.draw(r, "rgba(11,14,20,0.62)", "#233246");
      slot.accent.draw({ x: r.x + 4, y: r.y + 5, w: 4, h: r.h - 10 }, v.color);
      const iconOn = slot.icon.show(v.iconKey);
      slot.icon.node.active = iconOn;
      if (iconOn) placeRect(slot.icon.node, { x: r.x + 14, y: r.y + r.h / 2 - 12, w: 24, h: 24 });
      const nx = iconOn ? r.x + 46 : r.x + 16;
      slot.name.bold(true);
      slot.name.box({ x: nx, y: r.y, w: Math.max(40, r.x + 236 - nx), h: r.h }, FS.micro, v.name, "left", v.color);
      slot.sub.box({ x: r.x + 240, y: r.y, w: r.x + r.w - 8 - (r.x + 240), h: r.h }, FS.micro, v.sub, "left", HEX.textSecondary);
    });

    /* --- 武器管理(≤8 行) --- */
    this.sectionHeader(this.weaponHeader, L.weaponLabelY, L.headerH, c.weaponHeader.title, c.weaponHeader.right);
    this.weapons.forEach((slot, i) => {
      const r = L.weaponRows[i];
      const v = c.weapons[i];
      /** 八槽固定复用：本槽没有位就把**全部七件**一起收起，否则从多变少时旧行会叠在进化区与空态占位上 */
      const on = !!r && !!v;
      /* v4:有几何位却没有武器 = 空槽占位行(暗面 + 细描边 + 居中提示),不产热区 */
      const emptyRow = v4 && !!r && !v;
      slot.face.node.active = v4 && !!r;
      slot.accent.node.active = v4 && on;
      slot.plate.node.active = v4 && on;
      slot.empty.active(emptyRow);
      if (emptyRow && r) {
        slot.face.draw(r, "rgba(11,14,20,0.45)", "#232e44");
        slot.empty.box(r, FS.micro, "空槽 · 买卡填入", "center", HEX.textMuted);
      }
      slot.frame.node.active = on && !v4;
      slot.icon.node.active = on;
      slot.name.active(on);
      slot.sub.active(on);
      slot.upgrade.plate.node.active = on;
      slot.upgrade.text.active(on);
      slot.destroy.plate.node.active = on;
      slot.destroy.text.active(on);
      if (!r || !v) return;
      const icy = r.y + r.h / 2;
      const u = L.upgradeRects[i];
      const d = L.destroyRects[i];
      if (v4) {
        /* v4:暗石面 + 铁框(选中 = 金框)+ 左侧品质竖条;名 14 品质色,副标 12 灰;两钮文字盒内居中 */
        slot.face.draw(r, "rgba(11,14,20,0.78)");
        slot.plate.show(v.selected ? "menu_row_plate_current" : "menu_row_plate", r, "slice");
        slot.accent.draw({ x: r.x + 4, y: r.y + 6, w: 4, h: r.h - 12 }, v.color);
        const iconOn4 = !!v.iconKey && slot.icon.show(v.iconKey);
        slot.icon.node.active = iconOn4;
        if (iconOn4) placeRect(slot.icon.node, { x: r.x + 14, y: icy - 12, w: 24, h: 24 });
        const nx = iconOn4 ? r.x + 46 : r.x + 16;
        slot.name.bold(true);
        slot.name.box({ x: nx, y: r.y, w: Math.max(40, r.x + 236 - nx), h: r.h }, FS.body, v.name, "left", v.color);
        slot.sub.box({ x: r.x + 240, y: r.y, w: Math.max(40, u.x - 6 - (r.x + 240)), h: r.h }, FS.micro, v.sub, "left", HEX.textSecondary);
        slot.upgrade.plate.show("btn_minor", u, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
        slot.upgrade.text.box(u, FS.micro, v.upgradeText, "center", v.affordUpgrade ? HEX.actionPrimary : HEX.textMuted);
        slot.destroy.plate.show("btn_danger", d, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
        slot.destroy.text.box(d, FS.micro, v.destroyText, "center", HEX.actionDanger);
        return;
      }
      slot.frame.draw(r, v.color);
      const iconOn = !!v.iconKey && slot.icon.show(v.iconKey);
      slot.icon.node.active = iconOn;
      if (iconOn) placeRect(slot.icon.node, { x: r.x + 6, y: icy - 12, w: 24, h: 24 });
      slot.name.bold(true);
      slot.name.set(iconOn ? r.x + 38 : r.x + 10, icy + FS.muted / 3, 200, FS.muted, v.name, "left", v.color);
      /* 副标列宽 106:右缘 368,与强化钮左缘 372 留 4px 缝 */
      slot.sub.set(r.x + 246, icy + FS.micro / 3, 106, FS.micro, v.sub, "left", HEX.textSecondary);
      slot.upgrade.plate.show("btn_minor", u, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
      slot.upgrade.text.set(u.x + u.w / 2, u.y + u.h / 2 + FS.micro / 3, u.w - 6, FS.micro, v.upgradeText, "center", v.affordUpgrade ? HEX.actionPrimary : HEX.textMuted);
      slot.destroy.plate.show("btn_danger", d, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
      slot.destroy.text.set(d.x + d.w / 2, d.y + d.h / 2 + FS.micro / 3, d.w - 6, FS.micro, v.destroyText, "center", HEX.actionDanger);
    });
    /* v4:0 件时的空态由空槽占位行承担,不再另画一行文字 */
    this.weaponEmpty.active(!!c.weaponEmpty && !v4);
    if (c.weaponEmpty) {
      const ph = L.weaponRows[0];
      this.weaponEmpty.set(ph.x + ph.w / 2, ph.y + ph.h / 2 + FS.muted / 3, ph.w - 16, FS.muted, c.weaponEmpty, "center", HEX.textSecondary);
    }

    /* --- 进化(底锚 942 贴底坞) --- */
    this.sectionHeader(this.mergeHeader, L.mergeLabelY, L.headerH, c.mergeHeaderTitle, "");
    this.merges.forEach((slot, i) => {
      const r = L.merges[i];
      const v = c.merges[i];
      const on = !!r && !!v;
      slot.frame.node.active = on && !v4;
      slot.face.node.active = v4 && on;
      slot.plate.node.active = v4 && on;
      slot.name.active(on);
      slot.fee.active(on);
      if (!r || !v) return;
      if (v4) {
        slot.face.draw(r, "rgba(11,14,20,0.78)");
        slot.plate.show("menu_row_plate", r, "slice");
        slot.name.bold(true);
        slot.name.box({ x: r.x + 16, y: r.y, w: 300, h: r.h }, FS.muted, v.name, "left", v.color);
        slot.fee.box({ x: r.x + r.w - 176, y: r.y, w: 160, h: r.h }, FS.micro, v.feeText, "right", v.fullSet ? HEX.actionPrimary : HEX.textSecondary);
        return;
      }
      slot.frame.draw(r, v.color);
      slot.name.bold(true);
      slot.name.set(r.x + 10, r.y + r.h / 2 + FS.muted / 3, 300, FS.muted, v.name, "left", v.color);
      slot.fee.set(r.x + r.w - 10, r.y + r.h / 2 + FS.muted / 3, 160, FS.muted, v.feeText, "right", v.fullSet ? HEX.actionPrimary : HEX.textSecondary);
    });
    this.mergeEmpty.active(!!c.mergeEmpty);
    if (c.mergeEmpty) {
      const ph = L.merges[0];
      if (v4) {
        /* v4:空态也是一行占位(暗面 + 细描边),与武器空槽同款 */
        const es = this.merges[0];
        es.face.node.active = true;
        es.face.draw(ph, "rgba(11,14,20,0.45)", "#232e44");
        this.mergeEmpty.box(ph, FS.micro, c.mergeEmpty, "center", HEX.textMuted);
      } else this.mergeEmpty.set(ph.x + ph.w / 2, ph.y + ph.h / 2 + FS.muted / 3, ph.w - 16, FS.muted, c.mergeEmpty, "center", HEX.textSecondary);
    }

    /* --- 底操作条:左两行下一章预告 / 右开始下一章(整条贴本帧 dockTop) --- */
    if (v4) {
      this.nextIntel.box({ x: pad, y: L.dockTop + 4, w: 238, h: 20 }, FS.micro, c.nextIntelText, "left", HEX.textSecondary);
      this.nextRec.box({ x: pad, y: L.dockTop + 24, w: 238, h: 20 }, FS.micro, c.nextRecText, "left", c.nextRecColor ?? HEX.textMuted);
      this.nextBtn.plate.show("btn_primary", L.nextBtn, "slice");
      this.nextBtn.text.bold(true);
      this.nextBtn.text.box(L.nextBtn, 15, c.nextText, "center", HEX.actionPrimary);
    } else {
    this.nextIntel.set(pad, L.dockTop + 19, 238, FS.micro, c.nextIntelText, "left", HEX.textSecondary);
    this.nextRec.set(pad, L.dockTop + 37, 238, FS.micro, c.nextRecText, "left", c.nextRecColor ?? HEX.textMuted);
    this.nextBtn.plate.show("btn_primary", L.nextBtn, "slice");
    this.nextBtn.text.set(L.nextBtn.x + L.nextBtn.w / 2, L.nextBtn.y + L.nextBtn.h / 2 + FS.body / 3, L.nextBtn.w - 16, FS.body, c.nextText, "center", HEX.textPrimary);
    }
  }

  /** 套组进度胶囊:暗轨道 + 按比例填充(与 HUD 胶囊条同一形态,只是尺寸走 phase3 表) */
  private makeBar(name: string): { node: Node; draw: (r: { x: number; y: number; w: number; h: number }, ratio: number, color: string) => void } {
    const node = makeNode(name, this.root);
    const g = node.addComponent(Graphics);
    return {
      node,
      draw: (r, ratio, color) => {
        const rad = r.h / 2;
        g.clear();
        g.fillColor = hexToColor(viewTable().hud.barTrack);
        g.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, rad);
        g.fill();
        const f = Math.max(0, Math.min(1, ratio));
        if (f > 0) {
          g.fillColor = hexToColor(color);
          g.roundRect(-r.w / 2, -r.h / 2, Math.max(r.h, r.w * f), r.h, rad);
          g.fill();
        }
        placeRect(node, r);
      },
    };
  }

  /** 分区标题条:banner_mid_navy 九宫格铺满整带 + 左标题金字 / 右副信息(带高由列向弹性给) */
  private sectionHeader(slot: HeaderSlot, y: number, bandH: number, title: string, right: string): void {
    const p3 = viewTable().phase3;
    const bw = DESIGN_W - SHOP_PAD * 2;
    if (p3.shopV4) {
      slot.plate.node.active = false;
      slot.line.node.active = true;
      slot.line.draw({ x: SHOP_PAD, y: y + bandH - 2, w: bw, h: 1 }, "#38465e");
      slot.title.bold(true);
      slot.title.box({ x: SHOP_PAD, y, w: 330, h: bandH - 2 }, FS.muted, title, "left", HEX.gold);
      slot.right.active(right !== "");
      if (right !== "") slot.right.box({ x: SHOP_PAD + bw - 200, y, w: 200, h: bandH - 2 }, FS.micro, right, "right", HEX.textSecondary);
      return;
    }
    slot.plate.node.active = true;
    slot.line.node.active = false;
    const baseY = y + bandH / 2 + FS.muted / 3;
    slot.plate.show("banner_mid_navy", { x: SHOP_PAD, y, w: bw, h: bandH }, "slice", p3.sectionFallbackBg, SECTION_STROKE);
    slot.title.bold(true);
    slot.title.set(SHOP_PAD + 10, baseY, 330, FS.muted, title, "left", HEX.gold);
    slot.right.active(right !== "");
    if (right !== "") slot.right.set(SHOP_PAD + bw - 10, y + bandH / 2 + FS.micro / 3, 150, FS.micro, right, "right", HEX.textSecondary);
  }

  /**
   * bg_shop 满幅 cover + 单层压暗。参照系与主菜单 `MenuLayoutView.backdrop()` 同一口径:
   * cover 与暗层都铺满**整个逻辑屏**(高度随视口在 996~1246 之间变),这样高视口下不会
   * 在 996 以下露出一条没有背景的平色带 —— 那条带子是内容带与 restZone 的锚点
   * (`this.wh` = 战场标定高 996)所在,底坞与货架区仍锚它,与背景铺不铺满无关。
   */
  private paintBackdrop(): void {
    const p3 = viewTable().phase3;
    const frame = this.frames.get("bg_shop");
    this.coverSp.enabled = !!frame;
    const band = fullRect();
    if (frame) {
      this.coverSp.spriteFrame = frame;
      this.coverSp.type = Sprite.Type.SIMPLE;
      placeRect(this.cover, coverRect(band, frame.width, frame.height));
    } else {
      placeRect(this.cover, band);
    }
    this.dimGfx.clear();
    this.dimGfx.fillColor = hexToColor(p3.shopDim);
    this.dimGfx.rect(-band.w / 2, -band.h / 2, band.w, band.h);
    this.dimGfx.fill();
    placeRect(this.dim, band);
  }
}
