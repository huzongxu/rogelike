/**
 * 赛季结算屏 —— Web `src/game.ts:drawSeason`(3847-3880)的节点化替换(Phase 4 第九屏)。
 *
 * 分工与前八屏同构:几何全部来自共享层 `game/ui/seasonLayout.ts`(单一出口,徽标盒 / 横幅盒 /
 * 标题与四行摘要与贴底钮内文字的基线与限宽 / 钮矩形,与 Web 逐项同数),内容与命中来自
 * `season/SeasonModel.ts`,本文件只把矩形落到节点上:全屏暗底 + 徽标 + 横幅 + 标题 +
 * **摘要容器(四行,互斥形态整棵起落)** + 贴底钮与钮内文字 + 整屏 Capture 热区。
 *
 * **两形态整体切换**:Web 的 `if (s)` 让四行摘要成为整支分支(徽标、横幅、标题与贴底钮恒画)。
 * 这里用 `Summary` 容器的 `active` 整棵切换(不用透明度也不用位移藏),于是
 * `activeInHierarchy` 就是"这一支在不在画"的判据,探针直接读 `view.summaryVisible`。
 *
 * 贴图分支与 Web 一一对应(两枚都在 `ASSET_MANIFEST` 里):徽标 `emblem_flow_gold` 与横幅
 * `banner_mid_bronze` 都是 **`assets.draw` 的整幅拉伸且没有回退分支**(Web 两处都不接返回值,
 * 也就没有缺图时改画代码形状的档),缺图时两枚都收成零位盒、文字照落位。
 * **本屏没有面板底** —— Web 只画一笔全屏暗底就起内容,既不调 `panelPad` 也不用 `drawNine`,
 * 所以这里没有 `Plate`,也不会撞上每日屏行底板与 `panel_gearup` 那两条九宫格切边口径的挂账。
 *
 * 贴底钮是纯代码矩形(fillStyle `#2a3d55` + strokeStyle 金 + 白字),走 `flatBox`;描边宽度取
 * 共享层 `SE_BTN_STROKE_W`。七行文字全部居中,落位只有 `ui/PanelKit.placeLine` 一个入口
 * (R5 纪律):文本节点挂屏根或挂在铺满原点的摘要容器上,以整屏为 box。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { SE_BTN_STROKE_W, type SeRect, type SeasonLayout } from "../game/ui/seasonLayout";
import { hitSeason, type SeasonAction, type SeasonContent } from "./SeasonModel";

/** 贴图键(与 Web drawSeason 的 assets.draw 实参逐字对应) */
const KEY_EMBLEM = "emblem_flow_gold";
const KEY_BANNER = "banner_mid_bronze";

/** 贴图收起时的零位盒(与 FusionView / CommissionView 的图标位同款处置:缺图就不占位) */
const ZERO: SeRect = { x: 0, y: 0, w: 0, h: 0 };

/** 摘要四行的行名(顺序与 layout.summaryDys 逐位对齐) */
const SUMMARY_NAMES = ["SummarySeason", "SummaryScore", "SummaryStardust", "SummaryNote"] as const;

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与已落地八屏同款) */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(x: number, baseY: number, maxW: number, px: number, text: string, bold: boolean, color: string): void {
    if (this.lastPx !== px) {
      this.lastPx = px;
      this.lb.fontSize = px;
      this.lb.lineHeight = Math.round(px * 1.25);
    }
    if (this.lastAlign !== "center") {
      this.lastAlign = "center";
      this.lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    }
    if (this.lastColor !== color) {
      this.lastColor = color;
      this.lb.color = hexToColor(color);
    }
    if (this.lb.isBold !== bold) this.lb.isBold = bold;
    bindLabel(this.lb, fitOne(text, maxW, px));
    placeLine(this.lb.node, x, baseY, maxW, px, "center");
  }

  get node(): Node {
    return this.lb.node;
  }
}

/** 视图对宿主的最小要求:给我一帧几何,我按这一帧向宿主取内容;动作出口在宿主那一侧 */
export interface SeasonViewHooks {
  layout: () => SeasonLayout;
  content: (L: SeasonLayout) => SeasonContent;
  onAction: (a: SeasonAction) => void;
}

export class SeasonView {
  readonly root: Node;
  /** 整屏唯一的触摸入口(探针据此注入真实触摸) */
  readonly capture: Node;
  readonly hooks: SeasonViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  private panel: Plate;
  private emblem: ReturnType<typeof iconNode>;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  /** 四行摘要整棵起落(Web 的 `if (s)`) */
  private summaryNode: Node;
  private summaryLines: Txt[] = [];
  private close: { base: ReturnType<typeof flatBox>; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: SeasonViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("SeasonView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);
    // 节点创建顺序 = Web drawSeason 的绘制顺序(徽标 → 横幅 → 标题 → 摘要四行 → 贴底钮)
    this.emblem = iconNode("Emblem", this.root, frames, ZERO);
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);

    this.summaryNode = makeNode("Summary", this.root);
    for (const name of SUMMARY_NAMES) this.summaryLines.push(new Txt(name, this.summaryNode));

    this.close = { base: flatBox("CloseBtn", this.root), text: new Txt("CloseText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitSeason(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 摘要那一支当前在不在画(探针断言用;就是容器自身的 `active` 位) */
  get summaryVisible(): boolean {
    return this.summaryNode.activeInHierarchy;
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,iconNode 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)、落账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content(L);

    this.paintDim(p4.seDim);
    this.panel.show(L.panelKey, L.panel, "slice", HEX.bgPanel, HEX.bgPanelLight);

    // 徽标与横幅:整幅拉伸、没有缺图回退档(缺图收成零位盒,文字照落位)
    const emblem = this.emblem.show(KEY_EMBLEM);
    placeRect(this.emblem.node, emblem ? L.emblem : ZERO);
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.banner : ZERO);

    // 标题两档:有横幅落在绸带上居中,缺图切左起笔(与其它已翻新屏同一口径)
    const tl = banner ? L.title : L.titleBare;
    this.title.set(tl.x, tl.baseY, tl.maxW, tl.px, c.title, true, banner ? HEX.bgDeep : p4.seTitle);

    this.summaryNode.active = c.hasSummary;
    if (c.hasSummary) {
      const lines = [c.themeLine, c.scoreLine, c.dustLine, c.noteLine];
      const rects = [L.themeLine, L.scoreLine, L.dustLine, L.noteLine];
      const colors = [p4.seSummarySeason, p4.seSummaryScore, p4.seSummaryStardust, p4.seSummaryNote];
      for (let i = 0; i < this.summaryLines.length; i++) this.summaryLines[i].set(rects[i].x, rects[i].baseY, rects[i].maxW, rects[i].px, lines[i], rects[i].bold, colors[i]);
    }

    // 贴底钮:纯代码矩形 + 居中文字(Web 那里没有贴图档)
    this.close.base.draw(L.closeBtn, p4.seBtnFill, p4.seBtnStroke, SE_BTN_STROKE_W);
    this.close.text.set(L.closeText.x, L.closeText.baseY, L.closeText.maxW, L.closeText.px, c.closeText, true, p4.seBtnText);
  }

  /** 全屏暗底(Web 的 rgba(8,10,16,0.92) fillRect;尺寸随屏高一帧一绘) */
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
