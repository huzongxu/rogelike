/**
 * 章间商店屏 —— Web `src/game.ts:drawShop` 的节点化替换。
 *
 * 三层分工:几何问共享层 `game/ui/shop.ts:shopLayoutPure()`(顶/底带恒 64/948,与战斗双坞
 * 同源同位),账本与文案问 `shop/ShopModel.ts`,本文件只把两者落到节点上。
 * 顶信息条与底操作条复用 `hud_dock_top` / `hud_dock_bottom` 九宫格(边距走 borderOf),
 * 所以章间商店与战斗屏看上去就是同一块面板 —— 这正是商店骨架重设计的原意。
 *
 * 指针:整屏一个 Capture 节点 + `model.hitTest()`。热区判定与绘制同源于 shopLayoutPure
 * 的产物,不给每块底板挂 touch —— 那样会出现"命中框 ≠ 画面框"的第二套几何。
 *
 * 文本一律挂在屏根上、用**绝对设计矩形**落位(placeText 按对齐取锚点),因此不存在
 * "子局部矩形忘传 box"这一类错位。
 */

import { Graphics, Label, Node, Sprite, SpriteFrame } from "cc";
import { DESIGN_W, coverRect, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, UI, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, approxW, fitOne, flatBox, iconNode, placeText, qualityBox, textBand } from "../ui/PanelKit";
import { HUD_BOT_H, HUD_TOP_H } from "../game/ui/hud";
import { SHOP_BOTTOM } from "../game/ui/shop";
import type { ShopAction, ShopModel } from "./ShopModel";

/** 坞板缺图回退(与 HudView.dockPlate 同一形态:深色板 + 朝战场一侧的紫色细描边) */
const DOCK_FILL = "rgba(12,15,24,0.95)";
const DOCK_STROKE = "rgba(200,182,255,0.28)";
/** 分区标题条缺图回退描边(Web drawSectionHeader 的金色细边) */
const SECTION_STROKE = "rgba(255,215,106,0.25)";

/** 一行可重排的文本:每次给基线 / 限宽 / 字号 / 颜色,内部只在变化时改 Label 状态 */
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
    placeText(this.lb.node, textBand(x, baseY, maxW, px), align);
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
  frame: ReturnType<typeof qualityBox>;
  icon: ReturnType<typeof iconNode>;
  name: Txt;
  sub: Txt;
  destroy: { plate: Plate; text: Txt };
}

interface MergeSlot {
  frame: ReturnType<typeof qualityBox>;
  name: Txt;
  fee: Txt;
}

interface HeaderSlot {
  plate: Plate;
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
  private coverGfx: Graphics;
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
    this.coverGfx = this.cover.addComponent(Graphics);
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
        frame: qualityBox("CardFrame" + i, this.root),
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
    this.weaponHeader = { plate: new Plate("WeaponHeader", this.root, frames), title: new Txt("WeaponHeaderTitle", this.root), right: new Txt("WeaponHeaderRight", this.root) };
    for (let i = 0; i < 8; i++) {
      this.weapons.push({
        frame: qualityBox("WeaponFrame" + i, this.root),
        icon: iconNode("WeaponIcon" + i, this.root, frames, { x: 0, y: 0, w: 24, h: 24 }),
        name: new Txt("WeaponName" + i, this.root),
        sub: new Txt("WeaponSub" + i, this.root),
        destroy: { plate: new Plate("WeaponDestroy" + i, this.root, frames), text: new Txt("WeaponDestroyText" + i, this.root) },
      });
    }
    this.weaponEmpty = new Txt("WeaponEmpty", this.root);
    this.mergeHeader = { plate: new Plate("MergeHeader", this.root, frames), title: new Txt("MergeHeaderTitle", this.root), right: new Txt("MergeHeaderRight", this.root) };
    for (let i = 0; i < 4; i++) this.merges.push({ frame: qualityBox("MergeFrame" + i, this.root), name: new Txt("MergeName" + i, this.root), fee: new Txt("MergeFee" + i, this.root) });
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
        const a = this.model.hitTest(p.x, p.y);
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
    const L = this.model.layout();
    const c = this.model.content();
    const pad = UI.pad;
    const rx = DESIGN_W - pad;

    this.paintBackdrop();
    this.topDock.show("hud_dock_top", { x: 0, y: 0, w: DESIGN_W, h: HUD_TOP_H }, "slice", DOCK_FILL, DOCK_STROKE);
    this.bottomDock.show("hud_dock_bottom", { x: 0, y: SHOP_BOTTOM, w: DESIGN_W, h: HUD_BOT_H }, "slice", DOCK_FILL, DOCK_STROKE);
    const zoneY = L.weaponLabelY - 8;
    this.zone.draw({ x: 8, y: zoneY, w: DESIGN_W - 16, h: SHOP_BOTTOM - 4 - zoneY }, p3.listZone);
    const rest = logicalH() - this.wh;
    this.rest.node.active = rest > 0;
    if (rest > 0) this.rest.draw({ x: 0, y: this.wh, w: DESIGN_W, h: rest }, hud.colors.restZoneFill);

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
      if (skinned) slot.plate.show(danger ? "btn_danger" : "btn_minor", b, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
      else slot.flat.draw(b, p3.buttonDisabledBg, p3.buttonDisabledStroke);
      slot.text.bold(true);
      slot.text.set(b.x + b.w / 2, b.y + b.h / 2 + FS.body / 3, b.w - 12, FS.body, v.text, "center", danger ? HEX.actionDanger : v.id === "refresh" ? HEX.gold : v.enabled ? HEX.actionPrimary : HEX.textMuted);
    });

    /* --- 三张可购卡(买后售罄,刷新才有新货) --- */
    this.cards.forEach((slot, i) => {
      const r = L.cards[i];
      const v = c.cards[i];
      slot.frame.node.active = !!r && !!v;
      if (!r || !v) return;
      const icx = r.x + r.w / 2;
      slot.frame.draw(r, v.soldOut ? p3.soldOutFrame : v.color, true);
      const iconOn = !v.soldOut && !!v.iconKey && slot.icon.show(v.iconKey);
      slot.icon.node.active = iconOn;
      if (iconOn) placeRect(slot.icon.node, { x: icx - 18, y: r.y + 14, w: 36, h: 36 });
      slot.iconChar.active(!v.soldOut && !iconOn);
      if (!v.soldOut && !iconOn) slot.iconChar.set(icx, r.y + 38, 40, FS.section, v.name.slice(0, 1), "center", v.color);
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
        slot.soldTitle.set(icx, r.y + r.h / 2 + 6, r.w - 16, FS.section, "售 罄", "center", HEX.textSecondary);
        slot.soldHint.set(icx, r.y + r.h / 2 + 28, r.w - 16, FS.micro, v.sub, "center", HEX.textSecondary);
        return;
      }
      slot.name.bold(true);
      slot.name.set(icx, r.y + 66, r.w - 16, FS.body, v.name, "center", v.color);
      slot.quality.set(icx, r.y + 84, r.w - 16, FS.muted, v.qualityName, "center", v.color);
      slot.sub.set(icx, r.y + 104, r.w - 16, FS.micro, v.sub, "center", "#CFCFCF");
      slot.price.bold(true);
      slot.price.set(icx, r.y + r.h - 14, r.w - 16, FS.body, v.priceText, "center", v.afford ? HEX.gold : HEX.textMuted);
      if (v.setBadge) slot.setTag.set(r.x + r.w - 8, r.y + 19, 44, FS.micro, v.setBadge, "right", v.setBadgeColor ?? HEX.echo);
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
      this.slotBtn.text.set(sl.x + sl.w / 2, sl.y + sl.h / 2 + FS.muted / 3, sl.w - 16, FS.muted, c.slotBtn.text, "center", enabled ? HEX.actionPrimary : HEX.textMuted);
    }

    /* --- 武器管理(≤8 行) --- */
    this.sectionHeader(this.weaponHeader, L.weaponLabelY, c.weaponHeader.title, c.weaponHeader.right);
    this.weapons.forEach((slot, i) => {
      const r = L.weaponRows[i];
      const v = c.weapons[i];
      slot.frame.node.active = !!r && !!v;
      slot.destroy.plate.node.active = !!r && !!v;
      slot.destroy.text.active(!!r && !!v);
      if (!r || !v) return;
      slot.frame.draw(r, v.color);
      const icy = r.y + r.h / 2;
      const iconOn = !!v.iconKey && slot.icon.show(v.iconKey);
      slot.icon.node.active = iconOn;
      if (iconOn) placeRect(slot.icon.node, { x: r.x + 6, y: icy - 12, w: 24, h: 24 });
      slot.name.bold(true);
      slot.name.set(iconOn ? r.x + 38 : r.x + 10, icy + FS.muted / 3, 200, FS.muted, v.name, "left", v.color);
      slot.sub.set(r.x + 246, icy + FS.micro / 3, 130, FS.micro, v.sub, "left", HEX.textSecondary);
      const d = L.destroyRects[i];
      slot.destroy.plate.show("btn_danger", d, "slice", p3.buttonDisabledBg, p3.buttonDisabledStroke);
      slot.destroy.text.set(d.x + d.w / 2, d.y + d.h / 2 + FS.micro / 3, d.w - 6, FS.micro, v.destroyText, "center", HEX.actionDanger);
    });
    this.weaponEmpty.active(!!c.weaponEmpty);
    if (c.weaponEmpty) {
      const ph = L.weaponRows[0];
      this.weaponEmpty.set(ph.x + ph.w / 2, ph.y + ph.h / 2 + FS.muted / 3, ph.w - 16, FS.muted, c.weaponEmpty, "center", HEX.textSecondary);
    }

    /* --- 进化(底锚 942 贴底坞) --- */
    this.sectionHeader(this.mergeHeader, L.mergeLabelY, c.mergeHeaderTitle, "");
    this.merges.forEach((slot, i) => {
      const r = L.merges[i];
      const v = c.merges[i];
      slot.frame.node.active = !!r && !!v;
      slot.name.active(!!r && !!v);
      slot.fee.active(!!r && !!v);
      if (!r || !v) return;
      slot.frame.draw(r, v.color);
      slot.name.bold(true);
      slot.name.set(r.x + 10, r.y + r.h / 2 + FS.muted / 3, 300, FS.muted, v.name, "left", v.color);
      slot.fee.set(r.x + r.w - 10, r.y + r.h / 2 + FS.muted / 3, 160, FS.muted, v.feeText, "right", v.fullSet ? HEX.actionPrimary : HEX.textSecondary);
    });
    this.mergeEmpty.active(!!c.mergeEmpty);
    if (c.mergeEmpty) {
      const ph = L.merges[0];
      this.mergeEmpty.set(ph.x + ph.w / 2, ph.y + ph.h / 2 + FS.muted / 3, ph.w - 16, FS.muted, c.mergeEmpty, "center", HEX.textSecondary);
    }

    /* --- 底操作条:左两行下一章预告 / 右开始下一章 --- */
    this.nextIntel.set(pad, SHOP_BOTTOM + 19, 238, FS.micro, c.nextIntelText, "left", HEX.textSecondary);
    this.nextRec.set(pad, SHOP_BOTTOM + 37, 238, FS.micro, c.nextRecText, "left", c.nextRecColor ?? HEX.textMuted);
    this.nextBtn.plate.show("btn_primary", L.nextBtn, "slice");
    this.nextBtn.text.set(L.nextBtn.x + L.nextBtn.w / 2, L.nextBtn.y + L.nextBtn.h / 2 + FS.body / 3, L.nextBtn.w - 16, FS.body, c.nextText, "center", HEX.textPrimary);
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

  /** 分区标题条:banner_mid_navy 九宫格 + 左标题金字 / 右副信息(条高走表) */
  private sectionHeader(slot: HeaderSlot, y: number, title: string, right: string): void {
    const p3 = viewTable().phase3;
    const bw = DESIGN_W - UI.pad * 2;
    slot.plate.show("banner_mid_navy", { x: UI.pad, y, w: bw, h: p3.sectionBarH }, "slice", p3.sectionFallbackBg, SECTION_STROKE);
    slot.title.bold(true);
    slot.title.set(UI.pad + 10, y + 18, 330, FS.muted, title, "left", HEX.gold);
    slot.right.active(right !== "");
    if (right !== "") slot.right.set(UI.pad + bw - 10, y + 18, 150, FS.micro, right, "right", HEX.textSecondary);
  }

  /** bg_shop 满幅 cover + 单层压暗(对标 Web render() 铺底 + drawShop 的 fillRect 暗底) */
  private paintBackdrop(): void {
    const p3 = viewTable().phase3;
    const frame = this.frames.get("bg_shop");
    this.coverSp.enabled = !!frame;
    this.coverGfx.enabled = !frame;
    const band = { x: 0, y: 0, w: DESIGN_W, h: this.wh };
    if (frame) {
      this.coverSp.spriteFrame = frame;
      this.coverSp.type = Sprite.Type.SIMPLE;
      placeRect(this.cover, coverRect(band, frame.width, frame.height));
    } else {
      placeRect(this.cover, band);
    }
    this.dimGfx.clear();
    this.dimGfx.fillColor = hexToColor(p3.shopDim);
    this.dimGfx.rect(-DESIGN_W / 2, -this.wh / 2, DESIGN_W, this.wh);
    this.dimGfx.fill();
    placeRect(this.dim, band);
  }
}
