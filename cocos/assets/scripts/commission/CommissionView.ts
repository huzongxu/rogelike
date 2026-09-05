/**
 * 委托挂机屏 —— Web `src/game.ts:drawCommission`(5088-5200)与 `drawCommissionPanel`
 * (5034-5086)的节点化替换(Phase 4 第七屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/commissionLayout.ts`(单一出口,面板底与贴图键 / 横幅与
 * 标题两档线位 / 头部小立绘与三项读数 / 兑换钮 / 返回钮与两档文字位 / 逐面板的三行基线与进度条
 * 与两枚钮 / 区域行矩形与两行基线与右对齐产出 / 难度说明与逐钮两行 / 开始钮,与 Web 逐项同数),
 * 内容与命中来自 `commission/CommissionModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 横幅与标题 + 小立绘 + 三项读数 + 兑换钮 + 返回钮 + **两棵互斥子树**
 * (面板组 / 列表组) + 整屏 Capture 热区。
 *
 * **两个分支整体切换**:Web 在有活动槽位时于 5134 直接 `return`,只画表头 + 三项读数 + 兑换钮 +
 * 返回钮 + 面板,区域行、难度说明、难度钮与开始钮一个都不画;无槽位时反之。这里用两个容器节点的
 * `active` 整棵切换(不用透明度也不用位移藏),于是 `activeInHierarchy` 就是"这一支在不在画"的判据。
 *
 * 贴图分支与 Web 一一对应(七件都在 `ASSET_MANIFEST` 里,"贴图优先、缺图回退代码形状"):
 *  - 面板底走 `panel_dark_corners`(Web 的 `panelPad(g, w, h)` **不传专属键**,本屏没有专属面板);
 *  - 标题走 `banner_title_iron`,**不传宽高**于是用 `skinHeader` 的默认 220×42(与 gacha / prestige
 *    显式 240×46 不同),缺图时标题从"横幅内居中、基线 36−4"切到"左起笔于 pad、基线 36";
 *  - 头部小立绘 `player_pose_6` 是**没有回退分支**的一笔(Web 那里不接 `assets.draw` 的返回值),
 *    缺图时收成零位盒、不占位;
 *  - 两项读数走 `iconText`(`icon_fragment` / `icon_stardust`,size 13):有图时文字起笔右移
 *    `13 + 4`,缺图时回到 `pad` / `pad + 130` 并由视图前置替代字形「✧」/「❋」;
 *  - 面板底 `panel_parchment` 走**整幅拉伸**(Web 是 `assets.draw`,不是 `drawNine`),
 *    缺图时回退 `rgba(255,255,255,0.05)` 填充 + `rgba(200,182,255,0.35)` 描边;
 *    **命中贴图时面板三行文字切深色**(第一行 `#2a2a33`、后两行 `#4a4a55`),缺图回退才用亮色
 *    (`#e8e8e8` / `#8f9bb3`)—— Web 注释点明的"唯一改文字色处",两档色都取表;
 *  - 进度条走 `bar_progress_teal` 的整图拉伸档,有图时用暗罩从 `x + w × frac` 起盖住空缺
 *    (= Web `skinBar` 的遮罩法),缺图时换成"轨道 `rgba(255,255,255,0.12)` + 填充 `#4dffc8`"
 *    两块代码矩形;两档的钳制都由共享层 `commissionBarRects` 给出;
 *  - 返回钮 `btn_back` 叠在恒画的底板之上,文字 x 随贴图在否换档(Web `skinIconButton`)。
 *
 * 区域行、难度钮、开始钮、兑换钮、面板两枚钮与进度条回退块**全是纯代码矩形**(Web 那里就没有
 * 贴图),走 `flatBox`;开始钮的描边宽度取共享层 `CM_START_STROKE_W`(Web 把 lineWidth 临时设 2
 * 再复位 1,而 `flatBox` 的 lineWidth 只作用于自己那一份 Graphics,不会泄漏到后续描边)。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根或挂在铺满整屏的
 * 两个容器上,以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。区域行的 `产出 N/h` 是**右对齐**(末笔 = `r.x + r.w − 8`),尤其不能把
 * 锚点当盒左沿。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { CM_START_STROKE_W, commissionBarRects, type CmRect, type CommissionLayout, type CommissionPanelLayout, type CommissionRowLayout } from "../game/ui/commissionLayout";
import { DIFFICULTIES, REGIONS } from "../game/data/commissions";
import { hitCommission, type CommissionAction, type CommissionContent, type CommissionPanelContent, type CommissionRowContent } from "./CommissionModel";

/** 贴图键(与 Web drawCommission / drawCommissionPanel 的实参逐字对应) */
const KEY_BANNER = "banner_title_iron";
const KEY_POSE = "player_pose_6";
const KEY_FRAGMENT_ICON = "icon_fragment";
const KEY_STARDUST_ICON = "icon_stardust";
const KEY_BACK = "btn_back";
const KEY_PARCHMENT = "panel_parchment";
const KEY_PROGRESS_BAR = "bar_progress_teal";

/** 贴图收起时的零位盒(与 GachaView / PrestigeView 的图标位同款处置:缺图就不占位) */
const ZERO: CmRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与已落地六屏同款) */
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

/** 一个进行中面板的一件:羊皮纸底 + 三行文字 + 进度条四件 + 领取 / 放弃两枚钮 */
interface PanelSlot {
  parch: Plate;
  line1: Txt;
  line2: Txt;
  line3: Txt;
  barSkin: ReturnType<typeof iconNode>;
  barCover: ReturnType<typeof flatBox>;
  barTrack: ReturnType<typeof flatBox>;
  barFill: ReturnType<typeof flatBox>;
  collect: ReturnType<typeof flatBox>;
  collectText: Txt;
  abandon: ReturnType<typeof flatBox>;
  abandonText: Txt;
}

/** 区域行的一件:纯代码底板 + 名字 + 第二行 + 右对齐产出(仅解锁档) */
interface RowSlot {
  base: ReturnType<typeof flatBox>;
  name: Txt;
  sub: Txt;
  rate: Txt;
}

/** 难度钮的一件:纯代码底板 + 两行居中文字 */
interface DiffSlot {
  base: ReturnType<typeof flatBox>;
  mult: Txt;
  fail: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何,我按这一帧向宿主取内容;动作出口在宿主那一侧 */
export interface CommissionViewHooks {
  layout: () => CommissionLayout;
  /** 内容要读同一帧几何(面板序与行序都与 layout 逐位对齐)与当前时间,故由视图把 layout 交回 */
  content: (L: CommissionLayout) => CommissionContent;
  onAction: (a: CommissionAction) => void;
}

/** 面板条数上限(Web 的两个槽位 `commission` / `commission2`) */
const PANEL_SLOTS = 2;

export class CommissionView {
  readonly root: Node;
  /** 整屏唯一的触摸入口(探针据此注入真实触摸) */
  readonly capture: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: CommissionViewHooks;

  private dim: Node;
  private panel: Plate;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  private pose: ReturnType<typeof iconNode>;
  private fragmentIcon: ReturnType<typeof iconNode>;
  private fragmentText: Txt;
  private stardustIcon: ReturnType<typeof iconNode>;
  private stardustText: Txt;
  private prestigesText: Txt;
  private exchange: { base: ReturnType<typeof flatBox>; text: Txt };
  private back: { base: ReturnType<typeof flatBox>; icon: ReturnType<typeof iconNode>; text: Txt };
  /** 面板态子树(有活动槽位时唯一在画的一支) */
  private panelsNode: Node;
  private panelSlots: PanelSlot[] = [];
  /** 列表态子树(无活动槽位时唯一在画的一支) */
  private listNode: Node;
  private rowSlots: RowSlot[] = [];
  private diffLabel: Txt;
  private diffSlots: DiffSlot[] = [];
  private start: { base: ReturnType<typeof flatBox>; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: CommissionViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("CommissionView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);

    // 节点创建顺序 = Web drawCommission 的绘制顺序(横幅 → 标题 → 立绘 → 三项读数 → 兑换钮 → 返回钮 → 面板 / 列表)
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.pose = iconNode("Pose", this.root, frames, ZERO);
    this.fragmentIcon = iconNode("FragmentIcon", this.root, frames, ZERO);
    this.fragmentText = new Txt("FragmentText", this.root);
    this.stardustIcon = iconNode("StardustIcon", this.root, frames, ZERO);
    this.stardustText = new Txt("StardustText", this.root);
    this.prestigesText = new Txt("PrestigesText", this.root);
    this.exchange = { base: flatBox("ExchangeBtn", this.root), text: new Txt("ExchangeText", this.root) };
    this.back = { base: flatBox("Back", this.root), icon: iconNode("BackIcon", this.root, frames, ZERO), text: new Txt("BackText", this.root) };

    this.panelsNode = makeNode("Panels", this.root);
    for (let i = 0; i < PANEL_SLOTS; i++) this.panelSlots.push(this.makePanelSlot("Panel" + i));

    this.listNode = makeNode("List", this.root);
    for (let i = 0; i < REGIONS.length; i++) this.rowSlots.push(this.makeRowSlot("Region" + i));
    this.diffLabel = new Txt("DiffLabel", this.listNode);
    for (let i = 0; i < DIFFICULTIES.length; i++) this.diffSlots.push(this.makeDiffSlot("Diff" + i));
    this.start = { base: flatBox("StartBtn", this.listNode), text: new Txt("StartText", this.listNode) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitCommission(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makePanelSlot(name: string): PanelSlot {
    return {
      parch: new Plate(name + "Parch", this.panelsNode, this.frames),
      line1: new Txt(name + "Line1", this.panelsNode),
      line2: new Txt(name + "Line2", this.panelsNode),
      line3: new Txt(name + "Line3", this.panelsNode),
      barSkin: iconNode(name + "BarSkin", this.panelsNode, this.frames, ZERO),
      barCover: flatBox(name + "BarCover", this.panelsNode),
      barTrack: flatBox(name + "BarTrack", this.panelsNode),
      barFill: flatBox(name + "BarFill", this.panelsNode),
      collect: flatBox(name + "Collect", this.panelsNode),
      collectText: new Txt(name + "CollectText", this.panelsNode),
      abandon: flatBox(name + "Abandon", this.panelsNode),
      abandonText: new Txt(name + "AbandonText", this.panelsNode),
    };
  }

  private makeRowSlot(name: string): RowSlot {
    return { base: flatBox(name + "Base", this.listNode), name: new Txt(name + "Name", this.listNode), sub: new Txt(name + "Sub", this.listNode), rate: new Txt(name + "Rate", this.listNode) };
  }

  private makeDiffSlot(name: string): DiffSlot {
    return { base: flatBox(name + "Base", this.listNode), mult: new Txt(name + "Mult", this.listNode), fail: new Txt(name + "Fail", this.listNode) };
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,iconNode/Plate 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)、落账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content(L);

    // 覆盖底 + 面板底(Web panelPad 不传专属键,那一笔就是 panel_dark_corners 九宫格)
    this.paintDim(p4.cmDim);
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 标题:横幅优先(两档文字位),缺图回到 themePaint.header 那一档
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.headerBanner : ZERO);
    this.title.bold(true);
    const tt = banner ? L.titleWithBanner : L.titleBare;
    this.title.set(tt.x, tt.baseY, tt.maxW, tt.px, c.title, tt.align, p4.cmTitle);

    // 头部小立绘:固定坐标的一笔,无回退分支;画在三项读数之前(Web 的覆盖顺序)
    const pose = this.pose.show(KEY_POSE);
    placeRect(this.pose.node, pose ? L.pose : ZERO);

    // 三项读数:两项走 iconText(有图右移、缺图前置替代字形),第三项是裸文字
    this.paintIconText(this.fragmentIcon, this.fragmentText, KEY_FRAGMENT_ICON, L.fragmentIcon, L.fragmentTextWithIcon, L.fragmentTextBare, c.fragmentsText, p4.cmFragmentGlyph, p4.cmFragmentText);
    this.paintIconText(this.stardustIcon, this.stardustText, KEY_STARDUST_ICON, L.stardustIcon, L.stardustTextWithIcon, L.stardustTextBare, c.stardustText, p4.cmStardustGlyph, p4.cmStardustText);
    this.prestigesText.bold(false);
    this.prestigesText.set(L.prestigesText.x, L.prestigesText.baseY, L.prestigesText.maxW, L.prestigesText.px, c.prestigesText, "left", p4.cmPrestiges);

    // 兑换钮:碎片够才存在(绘制与命中同一个前置条件),不够时整件收起
    this.exchange.base.node.active = c.showExchange;
    this.exchange.text.active(c.showExchange);
    if (c.showExchange) {
      this.exchange.base.draw(L.exchangeBtn, p4.cmExchangeBg, p4.cmExchangeStroke);
      this.exchange.text.bold(false);
      this.exchange.text.set(L.exchangeText.x, L.exchangeText.baseY, L.exchangeText.maxW, L.exchangeText.px, c.exchangeText, "center", p4.cmExchangeText);
    }

    // 返回钮:底板恒画(Web skinIconButton 的 drawBaseBg),贴图叠在上面,文字 x 随贴图在否换档
    this.back.base.draw(L.backBtn, p4.cmBackBg, p4.cmBackStroke);
    const backIcon = this.back.icon.show(KEY_BACK);
    placeRect(this.back.icon.node, backIcon ? L.backIcon : ZERO);
    const bt = backIcon ? L.backTextWithIcon : L.backTextBare;
    this.back.text.bold(true);
    this.back.text.set(bt.x, bt.baseY, bt.maxW, bt.px, c.backText, "center", p4.cmBackText);

    // 两个分支整体切换:面板态只留面板组,列表态只留列表组(Web 5134 的 return)
    this.panelsNode.active = c.panelMode;
    this.listNode.active = !c.panelMode;
    if (c.panelMode) this.paintPanels(L, c);
    else this.paintList(L, c);
  }

  /** 面板态:逐面板画羊皮纸底 + 三行 + 进度条 + 两枚钮(条数 = 活动槽位数) */
  private paintPanels(L: CommissionLayout, c: CommissionContent): void {
    for (let i = 0; i < this.panelSlots.length; i++) {
      const slot = this.panelSlots[i];
      const p = L.panels[i];
      const pc = c.panels[i];
      if (!p || !pc) {
        this.hidePanel(slot);
        continue;
      }
      this.paintPanel(slot, p, pc);
    }
  }

  /** 一个面板:羊皮纸命中与否决定三行文字走深色档还是亮色档(Web 的"唯一改文字色处") */
  private paintPanel(slot: PanelSlot, p: CommissionPanelLayout, pc: CommissionPanelContent): void {
    const p4 = viewTable().phase4;
    slot.parch.setActive(true);
    const parch = slot.parch.show(KEY_PARCHMENT, p.rect, "stretch", p4.cmPanelFallbackBg, p4.cmPanelFallbackStroke);

    slot.line1.active(true);
    slot.line1.bold(true);
    slot.line1.set(p.line1.x, p.line1.baseY, p.line1.maxW, p.line1.px, pc.line1, "left", parch ? p4.cmPanelLine1OnParch : p4.cmPanelLine1Bare);
    slot.line2.active(true);
    slot.line2.bold(false);
    slot.line2.set(p.line2.x, p.line2.baseY, p.line2.maxW, p.line2.px, pc.line2, "left", parch ? p4.cmPanelSubOnParch : p4.cmPanelSubBare);
    slot.line3.active(true);
    slot.line3.bold(false);
    slot.line3.set(p.line3.x, p.line3.baseY, p.line3.maxW, p.line3.px, pc.line3, "left", parch ? p4.cmPanelSubOnParch : p4.cmPanelSubBare);

    // 进度条:贴图档画整图 + 盖空缺,缺图档画轨道 + 填充(Web skinBar 的 if / else)
    const rects = commissionBarRects(p.bar, pc.barFrac);
    const drawn = slot.barSkin.show(KEY_PROGRESS_BAR);
    slot.barSkin.node.active = drawn;
    slot.barTrack.node.active = !drawn;
    slot.barFill.node.active = !drawn;
    if (drawn) {
      placeRect(slot.barSkin.node, p.bar);
      slot.barCover.node.active = !!rects.cover;
      if (rects.cover) slot.barCover.draw(rects.cover, p4.cmBarCover);
    } else {
      slot.barCover.node.active = false;
      slot.barTrack.draw(p.bar, p4.cmBarFallbackTrack);
      slot.barFill.draw(rects.fill, p4.cmBarFallbackFill);
    }

    slot.collect.node.active = true;
    slot.collect.draw(p.collect, p4.cmCollectBg, p4.cmCollectStroke);
    slot.collectText.active(true);
    slot.collectText.bold(true);
    slot.collectText.set(p.collectText.x, p.collectText.baseY, p.collectText.maxW, p.collectText.px, pc.collectText, "center", p4.cmCollectText);
    slot.abandon.node.active = true;
    slot.abandon.draw(p.abandon, p4.cmAbandonBg, p4.cmAbandonStroke);
    slot.abandonText.active(true);
    slot.abandonText.bold(true);
    slot.abandonText.set(p.abandonText.x, p.abandonText.baseY, p.abandonText.maxW, p.abandonText.px, pc.abandonText, "center", p4.cmAbandonText);
  }

  private hidePanel(slot: PanelSlot): void {
    slot.parch.setActive(false);
    slot.line1.active(false);
    slot.line2.active(false);
    slot.line3.active(false);
    slot.barSkin.node.active = false;
    slot.barCover.node.active = false;
    slot.barTrack.node.active = false;
    slot.barFill.node.active = false;
    slot.collect.node.active = false;
    slot.collectText.active(false);
    slot.abandon.node.active = false;
    slot.abandonText.active(false);
  }

  /** 列表态:区域行(恒 6 条)+ 难度说明 + 难度钮(恒 5 枚)+ 开始钮 */
  private paintList(L: CommissionLayout, c: CommissionContent): void {
    const p4 = viewTable().phase4;
    for (let i = 0; i < this.rowSlots.length; i++) {
      const slot = this.rowSlots[i];
      const row = L.rows[i];
      const rc = c.rows[i];
      if (!row || !rc) this.hideRow(slot);
      else this.paintRow(slot, row, rc);
    }

    this.diffLabel.bold(false);
    this.diffLabel.set(L.diffLabel.x, L.diffLabel.baseY, L.diffLabel.maxW, L.diffLabel.px, c.diffLabel, "left", p4.cmDiffLabel);

    for (let i = 0; i < this.diffSlots.length; i++) {
      const slot = this.diffSlots[i];
      const d = L.diffs[i];
      const dc = c.diffs[i];
      if (!d || !dc) continue;
      slot.base.draw(d.rect, dc.sel ? p4.cmDiffSelFill : p4.cmDiffFill, dc.sel ? p4.cmDiffSelStroke : p4.cmDiffStroke);
      slot.mult.bold(true);
      slot.mult.set(d.mult.x, d.mult.baseY, d.mult.maxW, d.mult.px, dc.multText, "center", dc.sel ? p4.cmDiffSelText : p4.cmDiffText);
      slot.fail.bold(false);
      slot.fail.set(d.fail.x, d.fail.baseY, d.fail.maxW, d.fail.px, dc.failText, "center", dc.sel ? p4.cmDiffSelText : p4.cmDiffText);
    }

    this.start.base.draw(L.startBtn, p4.cmStartBg, p4.cmStartStroke, CM_START_STROKE_W);
    this.start.text.bold(true);
    this.start.text.set(L.startText.x, L.startText.baseY, L.startText.maxW, L.startText.px, c.startText, "center", p4.cmStartText);
  }

  /** 一行区域:底板两档 + 名字三档色 + 第二行 + 右对齐产出(仅解锁档) */
  private paintRow(slot: RowSlot, row: CommissionRowLayout, rc: CommissionRowContent): void {
    const p4 = viewTable().phase4;
    slot.base.node.active = true;
    slot.base.draw(row.rect, rc.sel ? p4.cmRowSelFill : p4.cmRowFill, rc.sel ? p4.cmRowSelStroke : p4.cmRowStroke);
    slot.name.active(true);
    slot.name.bold(true);
    slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.name, "left", rc.unlocked ? (rc.sel ? p4.cmRowNameSel : p4.cmRowName) : p4.cmRowNameLocked);
    slot.sub.active(true);
    slot.sub.bold(false);
    slot.sub.set(row.sub.x, row.sub.baseY, row.sub.maxW, row.sub.px, rc.subText, "left", p4.cmRowSub);
    slot.rate.active(rc.unlocked);
    if (rc.unlocked) {
      slot.rate.bold(false);
      slot.rate.set(row.rate.x, row.rate.baseY, row.rate.maxW, row.rate.px, rc.rateText, "right", p4.cmRowRate);
    }
  }

  private hideRow(slot: RowSlot): void {
    slot.base.node.active = false;
    slot.name.active(false);
    slot.sub.active(false);
    slot.rate.active(false);
  }

  /** 一项 iconText:图标优先(文字起笔右移),缺图时回到原位并前置替代字形;两项都不加粗(Web 只设一次 F(fs.muted)) */
  private paintIconText(
    icon: ReturnType<typeof iconNode>,
    text: Txt,
    key: string,
    iconRect: CmRect,
    withIcon: { x: number; baseY: number; maxW: number; px: number },
    bare: { x: number; baseY: number; maxW: number; px: number },
    value: string,
    glyph: string,
    color: string
  ): void {
    const drawn = icon.show(key);
    placeRect(icon.node, drawn ? iconRect : ZERO);
    text.bold(false);
    if (drawn) text.set(withIcon.x, withIcon.baseY, withIcon.maxW, withIcon.px, value, "left", color);
    else text.set(bare.x, bare.baseY, bare.maxW, bare.px, `${glyph} ${value}`, "left", color);
  }

  /** 全屏暗底(Web 的 rgba(8,10,16,0.86) fillRect;尺寸随屏高一帧一绘) */
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
