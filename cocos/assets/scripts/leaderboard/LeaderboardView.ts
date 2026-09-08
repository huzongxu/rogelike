/**
 * 幻影榜屏 —— 像素暗黑翻新档:节点化绘制,几何全部来自共享层 `game/ui/leaderboardLayout.ts`
 * (经 `leaderboardScreenLayout` 单一出口),内容与命中来自 `leaderboard/LeaderboardModel.ts`。
 *
 * 皮与主菜单/扭蛋同一族键,零新贴图:
 *  - 屏底 `panel_dark_corners` 九宫格 + 全屏暗底;
 *  - 标题走 `banner_large_purple` 整图拉伸(缺图退左起笔一档,文字位随之换档);
 *  - 行底板 `menu_row_plate`,玩家行换 `menu_set_plate_selected`(与主菜单「当前行」同语义);
 *  - 玩家行徽标 = `frame_<品质>` 品质框 + `pxnum_*` 像素数字(缺图退代码方框 + 数字,硬边不圆角);
 *  - 返回钮 `btn_minor` 九宫格。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根、
 * 以整屏为 box,layout 给的 x 就是 fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode, setTextOutline } from "../ui/Widgets";
import { Plate, fitOne, placeLine } from "../ui/PanelKit";
import { pixelNumber } from "../ui/PixelNumber";
import { theme } from "../game/ui/theme";
import { hitLeaderboard, type LeaderboardAction, type LeaderboardContent } from "./LeaderboardModel";
import type { LeaderboardLayout } from "../game/ui/leaderboardLayout";

/** 贴图键(全部来自主菜单 / 商店 / 三屏批的既有像素键,本屏不新增) */
const KEY_PANEL = "panel_dark_corners";
const KEY_BANNER = "banner_large_purple";
const KEY_ROW = "menu_row_plate";
const KEY_ROW_PLAYER = "menu_set_plate_selected";
const KEY_BACK = "btn_minor";

/** 徽标缺图回退:硬边方框的线宽(像素档不画圆,圆边在 2px 网格上会抖糊) */
const RING_LINE_W = 2;
/** 像素数字档(与主菜单序号牌同一档:scale 2 → 字形 16 逻辑 px) */
const PXNUM_OPTS = { scale: 2, advance: 18 } as const;

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
  plate: Plate;
  rank: Txt;
  name: Txt;
  score: Txt;
  badge: Plate;
  ring: Graphics;
  badgeNum: ReturnType<typeof pixelNumber>;
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
  private banner: Plate;
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
    this.banner = new Plate("Banner", this.root, frames);
    this.title = new Txt("Title", this.root);
    this.sub = new Txt("Sub", this.root);

    // 行数恒定(PHANTOM_COUNT + 1),行槽一次建满,不做池化
    const slots = this.hooks.layout().rows.length;
    for (let i = 0; i < slots; i++) {
      const badge = new Plate("Badge" + i, this.root, frames);
      this.rows.push({
        plate: new Plate("Row" + i, this.root, frames),
        rank: new Txt("Rank" + i, this.root),
        name: new Txt("Name" + i, this.root),
        score: new Txt("Score" + i, this.root),
        badge,
        ring: this.makeRing(i),
        badgeNum: pixelNumber("BadgeNum" + i, this.root, frames, { ...PXNUM_OPTS, align: "center", tint: HEX.gold }),
        badgeText: new Txt("BadgeText" + i, this.root),
      });
    }

    this.back = { plate: new Plate("BackBtn", this.root, frames), text: new Txt("BackText", this.root) };

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

  /** 徽标缺图回退的硬边方框:单独一个 Graphics 节点(行板每轮重贴,框要独立留存) */
  private makeRing(i: number): Graphics {
    const node = makeNode("Ring" + i, this.root);
    const g = node.addComponent(Graphics);
    g.lineWidth = RING_LINE_W;
    g.strokeColor = hexToColor(theme.gold);
    return g;
  }

  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
    for (const slot of this.rows) {
      slot.badgeNum.setFrames(frames);
    }
  }

  /** 一帧重排:切屏(refresh)与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();

    // 覆盖底:全屏暗底 + 屏底板(九宫格内缩落 LB_PAD)
    this.paintDim(p3.panelDim);
    this.panel.show(KEY_PANEL, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 标题横幅:整图拉伸(源图 2 倍),缺图退左起笔一档
    const bannerOn = this.banner.show(KEY_BANNER, L.banner, "stretch", p3.detailBg, p3.detailStroke);
    this.banner.setActive(bannerOn);
    this.title.bold(true);
    const tt = bannerOn ? L.title : L.titleBare;
    this.title.set(tt.x, tt.baseY, tt.maxW, tt.px, c.title, tt.align, HEX.gold);
    setTextOutline(this.title.lb, bannerOn ? p4.bannerTitleOutlineW : 0, HEX.bgDeep);
    this.sub.set(L.sub.x, L.sub.baseY, L.sub.maxW, L.sub.px, c.sub, "left", HEX.textSecondary);

    L.rows.forEach((row, i) => {
      const slot = this.rows[i];
      const rc = c.rows[i];
      if (!slot || !rc) return;
      slot.plate.show(rc.isPlayer ? KEY_ROW_PLAYER : KEY_ROW, row.rect, "slice", rc.isPlayer ? p4.lbRowPlayer : p4.lbRowGhost, rc.isPlayer ? theme.gold : p4.lbRowGhostStroke);

      const gold = HEX.gold;
      // 名次与名字共用一档色:玩家金 / 幽灵取表值;名字只把字号降到 muted、不加粗
      const rankColor = rc.isPlayer ? gold : p4.lbGhostRank;
      slot.rank.bold(true);
      slot.rank.set(row.rank.x, row.rank.baseY, row.rank.maxW, row.rank.px, rc.rankText, "left", rankColor);
      slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.nameText, "left", rankColor);
      // 分数:玩家金 / 幽灵 textSecondary,body 加粗,右对齐
      slot.score.bold(true);
      slot.score.set(row.score.x, row.score.baseY, row.score.maxW, row.score.px, rc.scoreText, "right", rc.isPlayer ? gold : HEX.textSecondary);

      // 徽标:仅玩家行且有成绩;品质框优先 + 像素数字,缺图退硬边方框(两分支都叠框心数字)
      const b = row.badge;
      const on = !!rc.badge;
      slot.badge.setActive(on);
      slot.ring.node.active = false;
      slot.badgeNum.setActive(false);
      slot.badgeText.active(false);
      if (on && rc.badge) {
        const textured = slot.badge.show(rc.badge.textureKey, b, "slice", p4.lbBackFallbackBg, theme.gold);
        if (!textured) {
          // 缺图回退:暗底 + 金描边的硬边方框(形状即 Web 的缺图分支,圆改方以贴像素网格)
          const g = slot.ring;
          g.clear();
          g.fillColor = hexToColor(p4.lbBackFallbackBg);
          g.rect(-b.w / 2, -b.h / 2, b.w, b.h);
          g.fill();
          g.lineWidth = RING_LINE_W;
          g.strokeColor = hexToColor(theme.gold);
          g.rect(-b.w / 2, -b.h / 2, b.w, b.h);
          g.stroke();
          placeRect(slot.ring.node, b);
          slot.ring.node.active = true;
        }
        // 框心数字:整串都能用字形表表达 → 像素数字,否则回落 Label(文案一字不改)
        const pixel = slot.badgeNum.setText(rc.badge.text);
        slot.badgeNum.place(b);
        slot.badgeNum.setActive(pixel);
        if (!pixel) {
          slot.badgeText.bold(true);
          slot.badgeText.active(true);
          slot.badgeText.set(b.x + b.w / 2, b.y + b.h / 2 + FS.micro / 3, b.w, FS.micro, rc.badge.text, "center", gold);
        }
      }
    });

    const B = L.backBtn;
    this.back.plate.show(KEY_BACK, B, "slice", p4.lbBackFallbackBg, p4.lbBackFallbackStroke);
    this.back.text.set(L.backText.x, L.backText.baseY, L.backText.maxW, L.backText.px, "返回", "center", p3.buttonText);
  }

  /** 全屏暗底(尺寸随屏高一帧一绘) */
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
