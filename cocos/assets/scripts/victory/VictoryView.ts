/**
 * 通关结算屏 —— Web `src/game.ts:drawVictory`(3746-3849) 的节点化替换（Phase 5 通关屏）。
 *
 * 分工与前十屏同构：几何全部来自共享层 `game/ui/victoryLayout.ts`（单一出口，横幅盒 / 立绘盒 /
 * 标题与九行文字与星数行的基线与限宽 / 三枚跟随字宽的前置贴图位 / 双倍钮与返回钮及其文字位，
 * 与 Web 逐项同数），内容与命中来自 `victory/VictoryModel.ts`，本文件只把矩形落到节点上：
 * 全屏暗底 + 屏底板（`panel_dark_corners` 九宫格，缺图退 `Plate` 自己的代码底板）+ 立绘 + 横幅 +
 * 标题（压在绸带带心上 → 走 `setTextOutline` 共享出口）+ 关卡行 + 星数行（三枚 24 见方 + 缺图替代字形） + 首通行 +
 * 奖励三行（各带一枚 16 见方前置图标） + 掉落行 + 名次提示 + 关卡框行（前置框 + 框心数字） +
 * 贴底双倍钮 + 贴底返回钮 + 整屏 Capture。
 *
 * **六处条件分支都走容器 `active` 整棵起落**（不用透明度也不用位移藏），于是
 * `activeInHierarchy` 就是「这一支在不在画」的判据，探针直接读 `stageVisible` / `starsVisible` /
 * `starTextVisible` / `firstVisible` / `rewardVisible` / `stardustVisible` / `dropsVisible` /
 * `rankVisible` / `frameVisible` 九项，与 Web 的九个 `if` 一一对应。
 *
 * 贴图分支与 Web 一一对应（十枚键都在 `ASSET_MANIFEST` 与两端资源目录里）：横幅
 * `banner_large_navy_a` 与立绘 `player_pose_1` 都是 `assets.draw` 的**整幅拉伸且没有回退分支**
 * （Web 两处都不接返回值，缺图时两枚都收成零位盒、文字照落位）；**本屏没有半透明贴图件**
 * （Web 这里一次都不动 `globalAlpha`，与死亡屏那枚 0.5 档立绘不同）。三枚奖励行前置图标与
 * 星数行的 `icon_star_gold` 也同语义：`iconNode.show` 返回 false 就收成零位盒。
 * 关卡框行**没有代码回退形状**：Web 的 `drawAvatarFrame` 缺图时提前 return false 且调用方
 * 不接返回值，所以缺图就是「只剩一行字」，不像幻影榜那样补金圈。
 *
 * **一处 Web 原样的画布状态泄漏**（几何与配色都按它分两档，见 `victoryLayout` 文件头）：
 * `drawAvatarFrame` 成功分支把 `g.textAlign` 复位成 `"left"` 并把 `fillStyle` / `font` 改成
 * 金 / `fs.micro` 粗体，而 `drawVictory` 之后直接 `fillText(fTxt, w/2, a + 210)` 不再重设。
 * 于是关卡框行有两档外观，取哪一档由**框贴图到不到位**决定（两端读同一份资源表，必然同档）：
 *  - `frameLineLeaked`：金色 12px 粗体、以屏心为左起笔（线上实际档）；
 *  - `frameLineFlat`：#c8b6ff 16px、屏心居中（缺图档）。
 * 两档基线同一个 `a + 210`，故这一处泄漏只改配色与字号与对齐，不改行位。
 *
 * 文字落位只有 `ui/PanelKit.placeLine` 一个入口（R5 纪律）：文本节点一律挂在铺满原点的屏根
 * 或各分支容器上，以整屏为 box。跟随字宽的前置贴图位按 Web 的 `measureText` 口径现量
 * （`ui/PanelKit.approxW`，系数走 `viewTable().hud`），与商店屏那两枚同源。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode, setTextOutline } from "../ui/Widgets";
import { Plate, approxW, fitOne, iconNode, placeLine, boxPlace } from "../ui/PanelKit";
import {
  VI_BADGE_PX,
  VI_STAR_MAX,
  victoryBadgeRect,
  victoryBadgeTextLine,
  victoryIconRect,
  type ViLeadRow,
  type ViRect,
  type ViTextLine,
  type VictoryLayout,
} from "../game/ui/victoryLayout";
import { hitVictory, type VictoryAction, type VictoryContent } from "./VictoryModel";

/** 贴图键（与 Web drawVictory 的 assets.draw / skinButtonBase 实参逐字对应） */
const KEY_BANNER = "banner_large_navy_a";
const KEY_POSE = "player_pose_1";
const KEY_PRIMARY = "btn_primary";
const KEY_MINOR = "btn_minor";
const KEY_STAR = "icon_star_gold";
const KEY_TICKET = "icon_ticket";
const KEY_ECHO = "icon_echo";
const KEY_STARDUST = "icon_stardust";

/** 贴图收起时的零位盒（与 GameOverView / LeaderboardView 的图标位同款处置：缺图就不占位） */
const ZERO: ViRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本：落位只走 `ui/PanelKit.placeLine`（与已落地十屏同款） */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  private lastBold = false;

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(t: ViTextLine, text: string, color: string): void {
    if (this.lastPx !== t.px) {
      this.lastPx = t.px;
      this.lb.fontSize = t.px;
      this.lb.lineHeight = Math.round(t.px * 1.25);
    }
    if (this.lastAlign !== t.align) {
      this.lastAlign = t.align;
      this.lb.horizontalAlign = t.align === "center" ? Label.HorizontalAlign.CENTER : t.align === "right" ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
    }
    if (this.lastColor !== color) {
      this.lastColor = color;
      this.lb.color = hexToColor(color);
    }
    if (this.lastBold !== t.bold) {
      this.lastBold = t.bold;
      this.lb.isBold = t.bold;
    }
    bindLabel(this.lb, fitOne(text, t.maxW, t.px));
    if (viewTable().phase3.restV4) {
      boxPlace(this.lb, t.x, t.baseY, t.maxW, t.px, t.align);
      return;
    }
    placeLine(this.lb.node, t.x, t.baseY, t.maxW, t.px, t.align);
  }

  active(on: boolean): void {
    this.lb.node.active = on;
  }

  get node(): Node {
    return this.lb.node;
  }
}

/** 一行「文字 + 跟随字宽的前置贴图」：贴图位由本行的实际文案量出来，Web 就是这个口径 */
interface LeadSlot {
  text: Txt;
  icon: ReturnType<typeof iconNode>;
}

/** 视图对宿主的最小要求：给我一帧几何，我按这一帧向宿主取内容；动作出口在宿主那一侧 */
export interface VictoryViewHooks {
  layout: () => VictoryLayout;
  content: (L: VictoryLayout) => VictoryContent;
  onAction: (a: VictoryAction) => void;
}

export class VictoryView {
  readonly root: Node;
  /** 整屏唯一的触摸入口（探针据此注入真实触摸） */
  readonly capture: Node;
  readonly hooks: VictoryViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  /** 屏底板：`panel_dark_corners` 九宫格，缺图退代码底板（`ui/PanelKit.Plate` 自带兜底子节点） */
  private panel: Plate;
  private pose: ReturnType<typeof iconNode>;
  /** v5:绸带之上的场景立绘 */
  private scene: ReturnType<typeof iconNode>;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  /** 关卡行（Web 的 `if (st)`，无尽局没有） */
  private stage: Txt;
  /** 星数行：整棵随 `stars > 0` 起落，三枚槽位随枚数起落 */
  private starRow: Node;
  private starSlots: Array<ReturnType<typeof iconNode>>;
  /** 星数贴图整幅缺图时的替代字形（Web 的 `drawn === 0` 分支） */
  private starText: Txt;
  /** 每日首通行（Web 的 `if (this.firstClearBonus)`） */
  private first: Txt;
  /** 奖励三行整棵随 `stageReward` 起落（Web 的 `if (r)`），星尘行再各自随 `stardust > 0` 起落 */
  private rewardRow: Node;
  private ticket: LeadSlot;
  private echo: LeadSlot;
  private stardustRow: Node;
  private stardust: LeadSlot;
  /** 掉落行（Web 的 `if (this.stageDrops > 0)`；全重复的那一局件数为 0，这一行不出） */
  private drops: Txt;
  /** 名次提示（Web 的 `if (this.rankImprovedTo != null)`） */
  private rank: Txt;
  /** 关卡框行（Web 的 `if (this.frameUnlockedThisRun != null)`）：前置框 + 框心数字 + 行文字 */
  private frameRow: Node;
  private frameBadge: ReturnType<typeof iconNode>;
  private frameBadgeText: Txt;
  private frameText: Txt;
  private double: { plate: Plate; text: Txt };
  private menu: { plate: Plate; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: VictoryViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("VictoryView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    // 屏底板压在暗底之上、一切内容之下（节点创建顺序就是 z 序）
    this.panel = new Plate("Panel", this.root, frames);
    // 节点创建顺序 = Web drawVictory 的绘制顺序（先 banner 再 pose，与死亡屏同笔序；
    // 本屏立绘挂在屏心右侧 [412,470]，与横幅 [160,400] 两档屏高下都不相交）
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.scene = iconNode("Scene", this.root, frames, ZERO);
    this.pose = iconNode("Pose", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.stage = new Txt("StageLine", this.root);

    this.starRow = makeNode("Stars", this.root);
    this.starSlots = [];
    for (let i = 0; i < VI_STAR_MAX; i++) this.starSlots.push(iconNode("Star" + i, this.starRow, frames, ZERO));
    this.starText = new Txt("StarText", this.root);

    this.first = new Txt("FirstClearLine", this.root);

    this.rewardRow = makeNode("Rewards", this.root);
    this.ticket = { text: new Txt("TicketLine", this.rewardRow), icon: iconNode("TicketIcon", this.rewardRow, frames, ZERO) };
    this.echo = { text: new Txt("EchoLine", this.rewardRow), icon: iconNode("EchoIcon", this.rewardRow, frames, ZERO) };
    this.stardustRow = makeNode("StardustRow", this.rewardRow);
    this.stardust = { text: new Txt("StardustLine", this.stardustRow), icon: iconNode("StardustIcon", this.stardustRow, frames, ZERO) };

    this.drops = new Txt("DropLine", this.root);
    this.rank = new Txt("RankLine", this.root);

    this.frameRow = makeNode("FrameRow", this.root);
    this.frameBadge = iconNode("FrameBadge", this.frameRow, frames, ZERO);
    this.frameBadgeText = new Txt("FrameBadgeText", this.frameRow);
    this.frameText = new Txt("FrameLine", this.frameRow);

    this.double = { plate: new Plate("DoubleBtn", this.root, frames), text: new Txt("DoubleText", this.root) };
    this.menu = { plate: new Plate("MenuBtn", this.root, frames), text: new Txt("MenuText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitVictory(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 九处条件分支当前在不在画（探针断言用；就是容器自身的 `activeInHierarchy`） */
  get stageVisible(): boolean {
    return this.stage.node.activeInHierarchy;
  }

  get starsVisible(): boolean {
    return this.starRow.activeInHierarchy;
  }

  get starTextVisible(): boolean {
    return this.starText.node.activeInHierarchy;
  }

  get firstVisible(): boolean {
    return this.first.node.activeInHierarchy;
  }

  get rewardVisible(): boolean {
    return this.rewardRow.activeInHierarchy;
  }

  get stardustVisible(): boolean {
    return this.stardustRow.activeInHierarchy;
  }

  get dropsVisible(): boolean {
    return this.drops.node.activeInHierarchy;
  }

  get rankVisible(): boolean {
    return this.rank.node.activeInHierarchy;
  }

  get frameVisible(): boolean {
    return this.frameRow.activeInHierarchy;
  }

  /** 晚到贴图流到位后由宿主调用：frames 是同一个 Map 引用，iconNode 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排：切屏（refresh）、落账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content(L);

    this.paintDim(p4.viDim);
    this.panel.show(L.panelKey, L.panel, "slice", HEX.bgPanel, HEX.bgPanelLight);

    // 横幅与立绘：整幅拉伸、没有缺图回退档（缺图收成零位盒，文字照落位）
    const v4 = viewTable().phase3.restV4;
    const banner = this.banner.show(v4 ? "ribbon_dark" : KEY_BANNER);
    placeRect(this.banner.node, banner ? (v4 ? L.ribbon : L.banner) : ZERO);
    // v5:场景立绘压在绸带之上,小立绘收起(场景已含人物与场地)
    const scene = v4 && this.scene.show("victory_scene");
    placeRect(this.scene.node, scene ? L.scene : ZERO);
    if (!v4) this.scene.show("");
    const pose = !v4 && this.pose.show(KEY_POSE);
    if (v4) this.pose.show("");
    placeRect(this.pose.node, pose ? L.pose : ZERO);

    // 标题压在绸带带心上：带心亮度跨 5~6 档，单色字到不了对比 → 走共享描边出口，缺图那一档关掉
    this.title.set(L.title, c.title, p4.viTitle);
    setTextOutline(this.title.lb, banner ? p4.bannerTitleOutlineW : 0, HEX.bgDeep);
    this.stage.active(c.hasStage);
    if (c.hasStage) this.stage.set(L.stageLine, c.stageLine, p4.viStage);

    // 星数行：三枚 24 见方居中横排；整幅缺图时改落 ★/☆ 文本档（Web 的 drawn === 0 分支）
    this.starRow.active = c.hasStars;
    let starTextured = false;
    for (let i = 0; i < this.starSlots.length; i++) {
      const on = c.hasStars && i < L.starSlots.length;
      const slot = this.starSlots[i];
      slot.node.active = on;
      if (!on) continue;
      const ok = slot.show(KEY_STAR);
      if (ok) placeRect(slot.node, L.starSlots[i]);
      else placeRect(slot.node, ZERO);
      // Web 的循环在第一次失败处 break，所以 drawn === 0 等价于「第一枚就没有这张图」
      if (i === 0) starTextured = ok;
    }
    const showStarText = c.hasStars && !starTextured;
    this.starText.active(showStarText);
    if (showStarText) this.starText.set(L.starText, c.starText, p4.viStarText);

    this.first.active(c.hasFirstClear);
    if (c.hasFirstClear) this.first.set(L.firstLine, c.firstClearText, p4.viFirst);

    // 奖励三行：整棵随 stageReward 起落，图标位随本行文案的实际量宽走
    this.rewardRow.active = c.hasReward;
    if (c.hasReward) {
      this.placeLead(this.ticket, L.ticketIcon, L.ticketLine, c.ticketText, p4.viTicket, KEY_TICKET);
      this.placeLead(this.echo, L.echoIcon, L.echoLine, c.echoText, p4.viEcho, KEY_ECHO);
      this.stardustRow.active = c.hasStardust;
      if (c.hasStardust) this.placeLead(this.stardust, L.stardustIcon, L.stardustLine, c.stardustText, p4.viStardust, KEY_STARDUST);
    }

    this.drops.active(c.hasDrops);
    if (c.hasDrops) this.drops.set(L.dropLine, c.dropText, p4.viDrop);

    this.rank.active(c.hasRank);
    if (c.hasRank) this.rank.set(L.rankLine, c.rankText, p4.viRank);

    // 关卡框行：前置框无代码回退（Web 的 drawAvatarFrame 缺图时什么都不画、调用方不接返回值）；
    // 框心数字只在贴图到位那一档画（Web 那一笔在 return false 之后），行文字两档见文件头
    this.frameRow.active = c.hasFrame;
    if (c.hasFrame) {
      const badgeW = approxW(c.frameText, L.frameLineFlat.px);
      const badge = victoryBadgeRect(L.frameBadge, badgeW);
      const textured = this.frameBadge.show(c.frameBadgeKey);
      this.frameBadge.node.active = textured;
      if (textured) placeRect(this.frameBadge.node, badge);
      else placeRect(this.frameBadge.node, ZERO);
      this.frameBadgeText.active(textured);
      if (textured) this.frameBadgeText.set(victoryBadgeTextLine(badge), c.frameBadgeText, p4.viFrameBadgeText);
      if (textured) this.frameText.set(L.frameLineLeaked, c.frameText, p4.viFrameTextGold);
      else this.frameText.set(L.frameLineFlat, c.frameText, p4.viFrameText);
    }

    // 双倍钮：可领档贴图优先，已领档 Web 是 `canDouble && skinButtonBase(...)` 短路成纯代码形状
    this.double.plate.show(c.canDouble ? KEY_PRIMARY : "", L.doubleBtn, "slice", c.canDouble ? p4.viDoubleBg : p4.viDoubleClaimedBg, c.canDouble ? p4.viDoubleStroke : p4.viDoubleClaimedStroke);
    this.double.text.set(L.doubleText, c.doubleText, c.canDouble ? p4.viDoubleText : p4.viDoubleTextClaimed);
    // 返回钮：Web 本屏唯一贴图档是 btn_minor，缺图退 #2a3d55 + #5ac8fa
    this.menu.plate.show(KEY_MINOR, L.menuBtn, "slice", p4.viMenuFallbackBg, p4.viMenuFallbackStroke);
    this.menu.text.set(L.menuText, c.menuText, p4.viMenuText);
  }

  /** 一行「文字 + 前置图标」：图标横向位 = 屏心 − 量宽/2 − 间距（Web 的 measureText 口径） */
  private placeLead(slot: LeadSlot, row: ViLeadRow, line: ViTextLine, text: string, color: string, key: string): void {
    slot.text.set(line, text, color);
    const textured = slot.icon.show(key);
    slot.icon.node.active = textured;
    if (textured) placeRect(slot.icon.node, victoryIconRect(row, approxW(text, line.px)));
    else placeRect(slot.icon.node, ZERO);
  }

  /** 全屏暗底（Web 的 rgba(8,10,16,0.86) fillRect；尺寸随屏高一帧一绘） */
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
