/**
 * 英雄选择屏 —— Web `src/game.ts:drawHeroes` 的节点化替换(12 名英雄 + 详情 + 技能四行)。
 *
 * 分工:几何全走共享层 `heroSelectLayout(w, h, heroes, seasonId, offset)`,
 * 滚动与热区全走 `heroes/HeroSelectModel.ts`(它又只调 `game/ui/scrollList.ts` 那四个函数),
 * 本文件只做三件事:把可视行落到 Mask 裁切容器里的行节点池、把详情区落到固定槽位、
 * 把指针事件换算成设计 px 喂给模型。
 *
 * 两处 Cocos 特有约定:
 *  ① 列表用 `Mask(GRAPHICS_RECT)` 裁切(= Web 的 ctx.clip());行节点因此活在
 *     **列表局部坐标**里,行内文本一律把行尺寸作为 box 交给 `PanelKit.placeLine`,
 *     漏传或按整屏参照换算,文字就会整体偏移一档。
 *  ② 立绘资源(hero_*)尚未出图,行内与详情都退化成"主色方块 + 名字首字",缺图不空板。
 */

import { Graphics, Label, Mask, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, Rect, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, UI, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import type { ViewTable } from "../core/ViewTable";
import { Plate, fitLines, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { hexA, theme } from "../game/ui/theme";
import type { HeroSelectLayout } from "../game/ui/heroSelectLayout";
import type { Phase3Params } from "../core/ViewTable";
import type { HeroAction, HeroRowView, HeroSelectModel } from "./HeroSelectModel";

/** 行池容量:最大屏高下视口 642 / 步长 80 ≈ 9 行可见,缓冲行与甩动高速段留足余量 */
const ROW_POOL = 16;
/** 技能行池(共享层恒 4 行) */
const SKILL_POOL = 4;
/** 详情正文最多三行(与 Web 的 slice(0, 3) 同档) */
const LORE_LINES = 3;
/** 详情立绘缺图时的名字字号 */
const PORTRAIT_CHAR_PX = FS.display;
/** 行内立绘缺图时的方块圆角(与 HUD 装备卡同档) */
const ROW_PORTRAIT_RADIUS = 6;

interface RowSlot {
  node: Node;
  gfx: Graphics;
  portrait: { node: Node; show: (key: string) => boolean };
  char: Txt;
  name: Txt;
  sub: Txt;
  badge: Graphics;
  badgeText: Txt;
}

interface SkillSlot {
  row: ReturnType<typeof flatBox>;
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
  private headerTitle: Txt;
  private headerSub: Txt;
  private listMask: Node;
  private rows: RowSlot[] = [];
  private track: ReturnType<typeof flatBox>;
  private thumb: ReturnType<typeof flatBox>;
  private detail: ReturnType<typeof flatBox>;
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
    this.headerTitle = new Txt("Title", this.root);
    this.headerSub = new Txt("Sub", this.root);

    this.listMask = makeNode("List", this.root);
    this.listMask.addComponent(UITransform);
    (this.listMask.addComponent(Mask) as Mask).type = Mask.Type.GRAPHICS_RECT;
    for (let i = 0; i < ROW_POOL; i++) {
      const node = makeNode("Row" + i, this.listMask);
      node.addComponent(UITransform);
      this.rows.push({
        node,
        gfx: node.addComponent(Graphics),
        portrait: iconNode("Portrait", node, frames, { x: 0, y: 0, w: 1, h: 1 }),
        char: new Txt("PortraitChar", node),
        name: new Txt("Name", node),
        sub: new Txt("Sub", node),
        badge: node.addComponent(Graphics),
        badgeText: new Txt("BadgeText", node),
      });
    }
    this.track = flatBox("Track", this.root);
    this.thumb = flatBox("Thumb", this.root);

    this.detail = flatBox("Detail", this.root);
    this.detailPort = iconNode("DetailPortrait", this.root, frames, { x: 0, y: 0, w: 1, h: 1 });
    this.detailChar = new Txt("DetailChar", this.root);
    this.detailName = new Txt("DetailName", this.root);
    this.detailTitle = new Txt("DetailTitle", this.root);
    this.detailLore = new Txt("DetailLore", this.root);
    this.skillLabel = new Txt("SkillCaption", this.root);
    for (let i = 0; i < SKILL_POOL; i++) {
      this.skills.push({
        row: flatBox("SkillRow" + i, this.root),
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
    this.panel.show("panel_dark_corners", fullRect(), "slice", p3.detailBg, p3.detailStroke);
    const head = this.model.header();
    this.headerTitle.bold(true);
    this.headerTitle.set(UI.pad, 36, DESIGN_W - UI.pad * 2 - UI.backW, FS.title, head.title, "left", HEX.gold, screen);
    this.headerSub.set(UI.pad, 56, DESIGN_W - UI.pad * 2, FS.muted, head.sub, "left", HEX.textSecondary, screen);

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
    this.detail.draw(d, p3.detailBg, p3.detailStroke);
    const det = this.model.detail();
    const port = L.portrait;
    const portOn = !det.empty && this.detailPort.show(`hero_${this.model.preview ?? ""}`);
    this.detailPort.node.active = portOn;
    if (portOn) placeRect(this.detailPort.node, port);
    this.detailChar.active(!portOn);
    if (!portOn) {
      this.detailChar.bold(true);
      const ch = det.empty ? "—" : det.name.slice(0, 1);
      this.detailChar.set(port.x + port.w / 2, port.y + port.h / 2 + PORTRAIT_CHAR_PX / 3, port.w, PORTRAIT_CHAR_PX, ch, "center", det.color, screen);
    }
    const emptyMode = det.empty;
    this.detailName.active(true);
    this.detailTitle.active(true);
    this.detailLore.active(!emptyMode);
    this.skillLabel.active(!emptyMode);
    if (emptyMode) {
      // 「不出战」:详情区只留居中两行(Web drawHeroes 的 !preview 分支)
      this.detailName.bold(true);
      this.detailName.set(d.x + d.w / 2, d.y + 180, d.w - 28, FS.section, det.name, "center", HEX.textSecondary, screen);
      this.detailTitle.set(d.x + d.w / 2, d.y + 206, d.w - 28, FS.muted, det.title, "center", HEX.textSecondary, screen);
    } else {
      this.detailName.bold(true);
      this.detailName.set(L.textX, L.nameY, L.loreW, FS.title, det.name, "left", HEX.textPrimary, screen);
      this.detailTitle.set(L.textX, L.titleY, L.loreW, FS.muted, det.title, "left", det.color, screen);
      const lines = fitLines(det.lore, L.loreW, FS.muted).slice(0, LORE_LINES);
      this.detailLore.lines(lines, L.textX, Math.round(L.loreY - FS.muted * lift), L.loreW, FS.muted, HEX.textSecondary, screen);
    }
    this.skillLabel.bold(true);
    this.skillLabel.set(port.x, L.skillLabelY, 160, FS.micro, "技能详情", "left", HEX.gold, screen);
    this.skills.forEach((slot, i) => {
      const sr = L.skillRows[i];
      const line = det.skills[i];
      const on = !emptyMode && !!sr && !!line;
      slot.row.node.active = on;
      slot.chip.node.active = on;
      slot.tag.active(on);
      slot.label.active(on);
      slot.desc.active(on);
      if (!on || !sr || !line) return;
      slot.row.draw(sr.rect, p3.detailBg);
      slot.chip.draw(sr.chip, hexA(det.color, 0.16));
      slot.tag.bold(true);
      slot.tag.set(sr.chip.x + sr.chip.w / 2, sr.chip.y + sr.chip.h / 2 + FS.micro / 3, sr.chip.w, FS.micro, line.tag, "center", det.color, screen);
      slot.label.bold(true);
      slot.label.set(sr.rect.x + 68, sr.labelY, sr.descW, FS.body, line.label, "left", HEX.textPrimary, screen);
      slot.desc.set(sr.rect.x + 68, sr.descY, sr.descW, FS.micro, line.desc, "left", HEX.textMuted, screen);
    });

    /* --- 右上返回 / 底部确定与不出战 --- */
    const B = L.backBtn;
    this.back.plate.show("btn_minor", B, "slice");
    this.back.text.set(B.x + B.w / 2, B.y + B.h / 2 + FS.muted / 3, B.w, FS.muted, "返回", "center", p3.buttonText, screen);
    const C = L.confirm;
    this.confirm.plate.show("btn_primary", C, "slice");
    this.confirm.text.bold(true);
    this.confirm.text.set(C.x + C.w / 2, C.y + C.h / 2 + FS.body / 3, C.w - 16, FS.body, this.model.confirmText(), "center", HEX.textPrimary, screen);
    const CL = L.clearBtn;
    this.clear.plate.show("btn_minor", CL, "slice");
    this.clear.text.set(CL.x + CL.w / 2, CL.y + CL.h / 2 + FS.muted / 3, CL.w - 8, FS.muted, "不出战", "center", HEX.textSecondary, screen);
  }

  /** 一行的底色 / 描边 / 立绘位 / 双行文字 / 右缘徽标(矩形全部来自 layout) */
  private paintRow(slot: RowSlot, row: HeroRowGeometry, v: HeroRowView, box: { w: number; h: number }, p3: Phase3Params): void {
    const g = slot.gfx;
    g.clear();
    g.fillColor = hexToColor(v.active ? p3.heroRowSel : p3.heroRowIdle);
    g.rect(-box.w / 2, -box.h / 2, box.w, box.h);
    g.fill();
    g.lineWidth = 1;
    g.strokeColor = hexToColor(v.active ? theme.select : p3.heroRowStroke);
    g.rect(-box.w / 2, -box.h / 2, box.w, box.h);
    g.stroke();

    const pb = row.portrait;
    const iconOn = v.released && slot.portrait.show(`hero_${v.id}`);
    slot.portrait.node.active = iconOn;
    if (iconOn) placeRect(slot.portrait.node, local(pb, row.rect), box.w, box.h);
    slot.char.active(!iconOn);
    if (!iconOn) {
      // 缺立绘:主色方块 + 名字首字(未解锁行走灰色档)
      g.fillColor = hexToColor(hexA(v.color, 0.18));
      g.roundRect(-box.w / 2 + pb.x - row.rect.x, box.h / 2 - (pb.y - row.rect.y) - pb.h, pb.w, pb.h, ROW_PORTRAIT_RADIUS);
      g.fill();
      slot.char.set(pb.x - row.rect.x + pb.w / 2, pb.y - row.rect.y + pb.h / 2 + FS.title / 3, pb.w, FS.title, v.name.slice(0, 1), "center", v.color, box);
    }
    const textW = row.badge.x - row.textX - 10;
    slot.name.bold(true);
    slot.name.set(row.textX - row.rect.x, row.nameY - row.rect.y, textW, FS.body, v.name, "left", v.released ? HEX.textPrimary : HEX.textMuted, box);
    slot.sub.set(row.textX - row.rect.x, row.subY - row.rect.y, textW, FS.micro, v.sub, "left", v.released ? HEX.textSecondary : HEX.textMuted, box);

    const b = row.badge;
    const cx = b.x - row.rect.x + b.w / 2 - box.w / 2;
    const cy = box.h / 2 - (b.y - row.rect.y + b.h / 2);
    const bg = slot.badge;
    bg.clear();
    bg.fillColor = hexToColor(hexA(v.color, v.current ? 0.2 : 0.16));
    bg.circle(cx, cy, b.w / 2);
    bg.fill();
    if (v.current) {
      bg.lineWidth = 1;
      bg.strokeColor = hexToColor(theme.gold);
      bg.circle(cx, cy, b.w / 2);
      bg.stroke();
    }
    slot.badgeText.bold(true);
    slot.badgeText.set(b.x - row.rect.x + b.w / 2, b.y - row.rect.y + b.h / 2 + FS.micro / 3, b.w, FS.micro, v.badgeText, "center", v.color, box);
  }
}

/** 行几何(共享层 layout 的行项) */
type HeroRowGeometry = HeroSelectLayout["rows"][number];

/** 绝对矩形 → 所属行矩形里的局部矩形(左上原点) */
function local(r: Rect, origin: Rect): Rect {
  return { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h };
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
