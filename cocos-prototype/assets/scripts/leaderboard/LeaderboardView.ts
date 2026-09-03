/**
 * 幻影榜屏 —— Web `src/game.ts:drawLeaderboard` 的节点化替换(Phase 4 首屏,纯只读)。
 *
 * 分工:几何全部来自共享层 `game/ui/leaderboardLayout.ts`(经 `leaderboardScreenLayout`
 * 单一出口,行区 / 三段文本锚点 / 徽标盒 / 返回钮与 Web 逐项同数),内容与命中来自
 * `leaderboard/LeaderboardModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 标题两行 + 恒 11 行(底/描边 + 名次/名字/分数三段文本)+
 * 玩家行徽标 + 右上返回钮 + 整屏 Capture 热区。
 *
 * 徽标与 Web `drawAvatarFrame` 同语义:`avatar_<品质>` 贴图优先(框心叠关卡数),
 * 缺图回退代码金圈(r=10 / lineWidth=2)+ 居中数字 —— 回退形状就是 Web 的缺图分支。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根、
 * 以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, iconNode, placeLine } from "../ui/PanelKit";
import { theme, ui } from "../game/ui/theme";
import { LB_BADGE_BOX } from "../game/ui/leaderboardLayout";
import { hitLeaderboard, type LeaderboardAction, type LeaderboardContent } from "./LeaderboardModel";
import type { LeaderboardLayout } from "../game/ui/leaderboardLayout";

/** 徽标缺图回退:金圈半径 / 线宽(Web drawLeaderboard 的 arc r=10 lineWidth=2) */
const RING_R = 10;
const RING_LINE_W = 2;
/** 框心数字的基线偏移(Web fillText(String(top), fx, fy + 4),贴图与回退两分支同式) */
const BADGE_TEXT_DY = 4;

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 ShopView/HeroSelectView 同款) */
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

interface RowSlot {
  node: Node;
  gfx: Graphics;
  rank: Txt;
  name: Txt;
  score: Txt;
  badge: ReturnType<typeof iconNode>;
  ring: Graphics;
  badgeText: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何与内容(纯只读屏,状态全在存档侧),外加动作出口 */
export interface LeaderboardViewHooks {
  layout: () => LeaderboardLayout;
  content: () => LeaderboardContent;
  onAction: (a: LeaderboardAction) => void;
}

export class LeaderboardView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: LeaderboardViewHooks;

  private dim: Node;
  private panel: Plate;
  private title: Txt;
  private sub: Txt;
  private rows: RowSlot[] = [];
  private back: { plate: Plate; text: Txt };
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: LeaderboardViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("LeaderboardView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);
    this.title = new Txt("Title", this.root);
    this.sub = new Txt("Sub", this.root);

    // 行数恒定(PHANTOM_COUNT + 1),行槽一次建满,不做池化
    const slots = this.hooks.layout().rows.length;
    for (let i = 0; i < slots; i++) {
      const node = makeNode("Row" + i, this.root);
      node.addComponent(UITransform);
      this.rows.push({
        node,
        gfx: node.addComponent(Graphics),
        rank: new Txt("Rank" + i, this.root),
        name: new Txt("Name" + i, this.root),
        score: new Txt("Score" + i, this.root),
        badge: iconNode("Badge" + i, this.root, frames, { x: 0, y: 0, w: LB_BADGE_BOX, h: LB_BADGE_BOX }),
        ring: this.makeRing(i),
        badgeText: new Txt("BadgeText" + i, this.root),
      });
    }

    this.back = { plate: new Plate("Back", this.root, frames), text: new Txt("BackText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitLeaderboard(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 缺图回退的金圈:单独一个 Graphics 节点(行底板 Graphics 每轮 clear,圈要独立留存) */
  private makeRing(i: number): Graphics {
    const node = makeNode("Ring" + i, this.root);
    const g = node.addComponent(Graphics);
    g.lineWidth = RING_LINE_W;
    g.strokeColor = hexToColor(theme.gold);
    g.circle(0, 0, RING_R);
    g.stroke();
    return g;
  }

  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();

    // 覆盖底:全屏暗底 + 面板底。面板对标 Web panelPad —— panel_dark_corners 九宫格内缩 pad
    this.paintDim(p3.panelDim);
    const pad = ui.pad;
    this.panel.show("panel_dark_corners", { x: pad, y: pad, w: DESIGN_W - pad * 2, h: logicalH() - pad * 2 }, "slice", p3.detailBg, p3.detailStroke);

    this.title.bold(true);
    this.title.set(L.title.x, L.title.baseY, L.title.maxW, L.title.px, c.title, "left", HEX.gold);
    this.sub.set(L.sub.x, L.sub.baseY, L.sub.maxW, L.sub.px, c.sub, "left", HEX.textSecondary);

    L.rows.forEach((row, i) => {
      const slot = this.rows[i];
      const rc = c.rows[i];
      if (!slot || !rc) return;
      placeRect(slot.node, row.rect);
      const g = slot.gfx;
      g.clear();
      g.fillColor = hexToColor(rc.isPlayer ? p4.lbRowPlayer : p4.lbRowGhost);
      g.rect(-row.rect.w / 2, -row.rect.h / 2, row.rect.w, row.rect.h);
      g.fill();
      g.lineWidth = 1;
      g.strokeColor = hexToColor(rc.isPlayer ? theme.gold : p4.lbRowGhostStroke);
      g.rect(-row.rect.w / 2, -row.rect.h / 2, row.rect.w, row.rect.h);
      g.stroke();

      const gold = HEX.gold;
      // 名次与名字共用一档色(Web 在两段之间没有重置 fillStyle):玩家金 / 幽灵 #e8e8e8;名字只把字号降到 muted、不加粗
      const rankColor = rc.isPlayer ? gold : p4.lbGhostRank;
      slot.rank.bold(true);
      slot.rank.set(row.rank.x, row.rank.baseY, row.rank.maxW, row.rank.px, rc.rankText, "left", rankColor);
      slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.nameText, "left", rankColor);
      // 分数:玩家金 / 幽灵 #8f9bb3(textSecondary),body 加粗,右对齐
      slot.score.bold(true);
      slot.score.set(row.score.x, row.score.baseY, row.score.maxW, row.score.px, rc.scoreText, "right", rc.isPlayer ? gold : HEX.textSecondary);

      // 徽标:仅玩家行且 save.frames 非空;贴图优先,缺图回退金圈(两分支都叠框心数字)
      const b = row.badge;
      const on = !!rc.badge;
      slot.badge.node.active = on;
      slot.ring.node.active = false;
      slot.badgeText.active(on);
      if (on && rc.badge) {
        const textured = slot.badge.show(rc.badge.textureKey);
        if (textured) placeRect(slot.badge.node, b);
        slot.ring.node.active = !textured;
        if (!textured) placeRect(slot.ring.node, { x: b.x + b.w / 2 - RING_R, y: b.y + b.h / 2 - RING_R, w: RING_R * 2, h: RING_R * 2 });
        slot.badgeText.bold(true);
        slot.badgeText.set(b.x + b.w / 2, b.y + b.h / 2 + BADGE_TEXT_DY, b.w, FS.micro, rc.badge.text, "center", gold);
      }
    });

    const B = L.backBtn;
    this.back.plate.show("btn_minor", B, "slice", p4.lbBackFallbackBg, p4.lbBackFallbackStroke);
    this.back.text.set(L.backText.x, L.backText.baseY, L.backText.maxW, L.backText.px, "返回", "center", p3.buttonText);
  }

  /** 全屏暗底(Web 的 fillStyle rgba(8,10,16,0.86) + fillRect;尺寸随屏高一帧一绘) */
  private paintDim(color: string): void {
    const r = fullRect();
    const g = this.dim.getComponent(Graphics)!;
    g.clear();
    g.fillColor = hexToColor(color);
    g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
    g.fill();
    placeRect(this.dim, r);
  }
}
