/**
 * 死亡结算屏（阵亡）—— Web `src/game.ts:drawGameOver`(4015-4113) 的节点化替换（Phase 5 结算屏）。
 *
 * 分工与前九屏同构：几何全部来自共享层 `game/ui/gameOverLayout.ts`（单一出口，横幅盒 / 立绘盒 /
 * 标题与四行读数与名次提示的基线与限宽 / 复活钮与三钮行与双倍钮及其文字位，与 Web 逐项同数），
 * 内容与命中来自 `gameover/GameOverModel.ts`，本文件只把矩形落到节点上：全屏暗底 + 立绘 + 横幅 +
 * 标题 + 四行读数 + 复活钮（可整棵收起） + 三钮行 + 名次提示（可收起） + 贴底双倍钮 + 整屏 Capture。
 *
 * **三处互斥分支都走容器 `active` 整棵起落**（不用透明度也不用位移藏），于是
 * `activeInHierarchy` 就是「这一支在不在画」的判据，探针直接读 `reviveVisible` /
 * `bestVisible` / `rankVisible` 三项：
 *  - 复活钮：Web 的 `if (this.canRevive())`，收起时热区同时消失（命中层按形态位短路）；
 *  - 最佳纪录行：Web 的 `if (this.save.bestRun)`；
 *  - 名次提示：Web 的 `if (this.rankImprovedTo != null)`。
 *
 * 贴图分支与 Web 一一对应（三枚都在 `ASSET_MANIFEST` 里）：横幅 `banner_large_red` 与立绘
 * `player_pose_4` 都是 `assets.draw` 的**整幅拉伸且没有回退分支**（Web 两处都不接返回值，
 * 缺图时两枚都收成零位盒、文字照落位）；立绘那一笔 Web 把 `globalAlpha` 压到 0.5 再复位，
 * 所以这里给它挂一枚 `UIOpacity`（整屏唯一的半透明贴图件）。三枚钮档按 Web 的贴图/代码分派：
 * 复活与双倍走 `btn_primary` 九宫格优先 + 缺图退代码形状，重开走 `btn_minor` 九宫格优先，
 * 而**天赋与菜单两枚在 Web 那里根本没有贴图**（就是 `fillRect` + `strokeRect`），故走 `flatBox`。
 * **本屏没有面板底** —— Web 只画一笔全屏暗底就起内容。
 *
 * 文字落位只有 `ui/PanelKit.placeLine` 一个入口（R5 纪律）：文本节点一律挂在铺满原点的屏根
 * 或各分支容器上，以整屏为 box。
 */

import { Graphics, Label, Node, SpriteFrame, UIOpacity, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { GO_BTN_STROKE_W, GO_POSE_ALPHA, type GoRect, type GameOverLayout, type GoTextLine } from "../game/ui/gameOverLayout";
import { hitGameOver, type GameOverAction, type GameOverContent } from "./GameOverModel";

/** 贴图键（与 Web drawGameOver 的 assets.draw / skinButtonBase 实参逐字对应） */
const KEY_BANNER = "banner_large_red";
const KEY_POSE = "player_pose_4";
const KEY_PRIMARY = "btn_primary";
const KEY_MINOR = "btn_minor";

/** 贴图收起时的零位盒（与 SeasonView / FusionView 的图标位同款处置：缺图就不占位） */
const ZERO: GoRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本：落位只走 `ui/PanelKit.placeLine`（与已落地九屏同款） */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  private lastBold = false;

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(t: GoTextLine, text: string, color: string): void {
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
    placeLine(this.lb.node, t.x, t.baseY, t.maxW, t.px, t.align);
  }

  active(on: boolean): void {
    this.lb.node.active = on;
  }

  get node(): Node {
    return this.lb.node;
  }
}

/** 视图对宿主的最小要求：给我一帧几何，我按这一帧向宿主取内容；动作出口在宿主那一侧 */
export interface GameOverViewHooks {
  layout: () => GameOverLayout;
  content: (L: GameOverLayout) => GameOverContent;
  onAction: (a: GameOverAction) => void;
}

export class GameOverView {
  readonly root: Node;
  /** 整屏唯一的触摸入口（探针据此注入真实触摸） */
  readonly capture: Node;
  readonly hooks: GameOverViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  private pose: ReturnType<typeof iconNode>;
  private poseOpacity: UIOpacity;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  private time: Txt;
  private wave: Txt;
  private echo: Txt;
  /** 最佳纪录行（Web 的 `if (this.save.bestRun)`） */
  private best: Txt;
  /** 复活钮整棵起落（Web 的 `if (this.canRevive())`：钮与文字同进退，热区在命中层同步短路） */
  private reviveNode: Node;
  private revive: { plate: Plate; text: Txt };
  private restart: { plate: Plate; text: Txt };
  private prestige: { base: ReturnType<typeof flatBox>; text: Txt };
  private menu: { base: ReturnType<typeof flatBox>; text: Txt };
  /** 名次提示（Web 的 `if (this.rankImprovedTo != null)`） */
  private rank: Txt;
  private double: { plate: Plate; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: GameOverViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("GameOverView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    // 节点创建顺序 = Web drawGameOver 的绘制顺序（立绘在横幅之前：Web 先画 banner 再画 pose，
    // 但 pose 的横向锚点在屏心左 196、与 banner 的 x 区间 [160,400] 在 996 档重叠 0px，
    // 两档互不遮挡，故这里保持 Web 的笔序：banner → pose）
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.pose = iconNode("Pose", this.root, frames, ZERO);
    this.poseOpacity = this.pose.node.addComponent(UIOpacity);
    this.poseOpacity.opacity = Math.round(GO_POSE_ALPHA * 255);
    this.title = new Txt("Title", this.root);
    this.time = new Txt("TimeLine", this.root);
    this.wave = new Txt("WaveLine", this.root);
    this.echo = new Txt("EchoLine", this.root);
    this.best = new Txt("BestLine", this.root);

    this.reviveNode = makeNode("Revive", this.root);
    this.revive = { plate: new Plate("ReviveBtn", this.reviveNode, frames), text: new Txt("ReviveText", this.reviveNode) };

    this.restart = { plate: new Plate("RestartBtn", this.root, frames), text: new Txt("RestartText", this.root) };
    this.prestige = { base: flatBox("PrestigeBtn", this.root), text: new Txt("PrestigeText", this.root) };
    this.menu = { base: flatBox("MenuBtn", this.root), text: new Txt("MenuText", this.root) };

    this.rank = new Txt("RankLine", this.root);
    this.double = { plate: new Plate("DoubleBtn", this.root, frames), text: new Txt("DoubleText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitGameOver(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 复活钮那一支当前在不在画（探针断言用；就是容器自身的 `active` 位） */
  get reviveVisible(): boolean {
    return this.reviveNode.activeInHierarchy;
  }

  get bestVisible(): boolean {
    return this.best.node.activeInHierarchy;
  }

  get rankVisible(): boolean {
    return this.rank.node.activeInHierarchy;
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

    this.paintDim(p4.goDim);

    // 横幅与立绘：整幅拉伸、没有缺图回退档（缺图收成零位盒，文字照落位）
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.banner : ZERO);
    const pose = this.pose.show(KEY_POSE);
    placeRect(this.pose.node, pose ? L.pose : ZERO);

    this.title.set(L.title, c.title, p4.goTitle);
    this.time.set(L.timeLine, c.timeLine, p4.goStat);
    this.wave.set(L.waveLine, c.waveLine, p4.goStat);
    // 回响与星尘两档在 Web 共用同一笔 fillStyle（金），只差文案
    this.echo.set(L.echoLine, c.echoLine, p4.goEcho);
    this.best.active(c.hasBest);
    if (c.hasBest) this.best.set(L.bestLine, c.bestLine, p4.goBest);

    // 复活钮：btn_primary 九宫格优先，缺图退代码形状（Web 的 skinButtonBase 返回 false 那一支）
    this.reviveNode.active = c.canRevive;
    if (c.canRevive) {
      this.revive.plate.show(KEY_PRIMARY, L.reviveBtn, "slice", p4.goReviveFallbackBg, p4.goReviveFallbackStroke);
      this.revive.text.set(L.reviveText, c.reviveText, p4.goReviveText);
    }

    // 三钮行：重开有贴图档（btn_minor），天赋与菜单两枚 Web 那里就是纯代码矩形
    this.restart.plate.show(KEY_MINOR, L.restartBtn, "slice", p4.goRestartFallbackBg, p4.goRestartFallbackStroke);
    this.restart.text.set(L.restartText, c.restartText, p4.goBtnText);
    this.prestige.base.draw(L.prestigeBtn, p4.goPrestigeBg, p4.goPrestigeStroke, GO_BTN_STROKE_W);
    this.prestige.text.set(L.prestigeText, c.prestigeText, p4.goBtnText);
    this.menu.base.draw(L.menuBtn, p4.goMenuBg, p4.goMenuStroke, GO_BTN_STROKE_W);
    this.menu.text.set(L.menuText, c.menuText, p4.goBtnText);

    this.rank.active(c.hasRank);
    if (c.hasRank) this.rank.set(L.rankLine, c.rankText, p4.goRank);

    // 双倍钮：可领档贴图优先，已领档 Web 是 `canDouble && skinButtonBase(...)` 短路成纯代码形状
    this.double.plate.show(c.canDouble ? KEY_PRIMARY : "", L.doubleBtn, "slice", c.canDouble ? p4.goDoubleBg : p4.goDoubleClaimedBg, c.canDouble ? p4.goDoubleStroke : p4.goDoubleClaimedStroke);
    this.double.text.set(L.doubleText, c.doubleText, c.canDouble ? p4.goDoubleText : p4.goDoubleTextClaimed);
  }

  /** 全屏暗底（Web 的 rgba(0,0,0,0.8) fillRect；尺寸随屏高一帧一绘） */
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
