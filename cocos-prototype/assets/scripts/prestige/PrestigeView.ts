/**
 * 转生与天赋屏 —— Web `src/game.ts:drawPrestige`(4224-4353)的节点化替换(Phase 4 第六屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/prestigeLayout.ts`(单一出口,面板矩形与贴图键 / 横幅与
 * 标题两档线位 / 头部小立绘盒 / 头部四行 / 页签整条打底盒与逐签矩形与居中文字位 / 节点行矩形与
 * 两行基线与右列两档锚点与勾选标记盒 / 两个配置块的标签与逐钮 / 开始新轮回钮与居中文字位,
 * 与 Web 逐项同数),内容与命中来自 `prestige/PrestigeModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 横幅与标题 + 小立绘 + 头部四行 + 页签带 + 节点行(按需增长的对象池) +
 * 定向搜索块 + 完美蓝图块 + 开始新轮回钮 + 整屏 Capture 热区。
 *
 * 贴图分支与 Web 一一对应(四件都在 `ASSET_MANIFEST` 里,"贴图优先、缺图回退代码形状"):
 *  - 面板底走 `panel_dark_corners`(Web 的 `panelPad(g, w, h)` **不传专属键**,本屏没有专属面板);
 *  - 标题走 `banner_purple_cosmic` **显式 240×46**(与 gacha 同参数、与 gearup 的纯文字不同),
 *    缺图时标题从"横幅内居中、基线 36−4"切到"左起笔于 pad、基线 36"(Web `themePaint.header`);
 *  - 头部小立绘 `player_pose_5` 与页签整条打底 `tabs_talent_three` 都是**没有回退分支**的一笔
 *    (Web 那里不接 `assets.draw` 的返回值),缺图时收成零位盒、不占位,逐签的代码底板与描边照画;
 *  - 已拥有行的勾选标记 `mark_check_green` 同样无回退分支,缺图时那一档只剩「已拥有」文字
 *    (标记盒收成零位,文字位置不动 —— Web 的文字位置本来也不依赖图在不在);
 *  - 节点行、页签覆盖层、两个配置块的钮与开始新轮回钮**全是纯代码矩形**(Web 那里就没有贴图),
 *    走 `flatBox`;开始新轮回钮的描边宽度取共享层 `PT_START_STROKE_W`(Web 把 lineWidth 临时设 2)。
 *
 * **本屏没有返回钮**:热区只有页签 / 行 / 两枚配置块 / 开始新轮回五段,屏内唯一的离开出口是
 * "开始新轮回"(它重开一局,不回主菜单)。这条是 Web 原样,本文件不补钮、不补热区。
 *
 * 一处 Web 原样覆盖照抄:头部第二行「可支配 N」从 `pad + 210` 起笔,而小立绘落在
 * `(252, 4, 38, 60)` —— 两者纵向同带。Web 先画立绘后画四行文字,于是文字压在立绘之上;
 * 本视图按同一节点顺序复现,几何与视图都不做平移。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根或挂在铺满
 * 整屏的容器上,以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 /
 * 右末笔),视图不产任何二次平移。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { PT_START_STROKE_W, type PrestigeChoiceLayout, type PrestigeLayout, type PrestigeRowLayout, type PtRect, type PtTextLine } from "../game/ui/prestigeLayout";
import { hitPrestige, type PrestigeAction, type PrestigeChoiceContent, type PrestigeContent, type PrestigeRowContent } from "./PrestigeModel";

/** 贴图键(与 Web drawPrestige 的实参逐字对应) */
const KEY_BANNER = "banner_purple_cosmic";
const KEY_POSE = "player_pose_5";
const KEY_TABS_STRIP = "tabs_talent_three";
const KEY_CHECK = "mark_check_green";

/** 贴图收起时的零位盒(与 GachaView / GearUpView 的图标位同款处置:缺图就不占位) */
const ZERO: PtRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 DailyView / PassView / GearUpView / GachaView 同款) */
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

/** 三系页签的一件:整条贴图之下的一枚代码覆盖层 + 居中题字 */
interface TabSlot {
  base: ReturnType<typeof flatBox>;
  text: Txt;
}

/** 开局配置块:一枚标签 + n 钮(纯代码底板两档 + 居中钮文) */
interface ChoiceSlot {
  base: ReturnType<typeof flatBox>;
  text: Txt;
}

interface ChoiceGroup {
  label: Txt;
  slots: ChoiceSlot[];
}

/** 节点行的一件:纯代码底板 + 名称 + 右列两档(价格串 / 「已拥有」文字 + 勾选标记) + 描述 */
interface RowSlot {
  base: ReturnType<typeof flatBox>;
  name: Txt;
  cost: Txt;
  ownedText: Txt;
  mark: ReturnType<typeof iconNode>;
  desc: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何,我按这一帧向宿主取内容;动作出口在宿主那一侧 */
export interface PrestigeViewHooks {
  layout: () => PrestigeLayout;
  /** 内容要读同一帧几何(行序与限宽都与 layout 逐位对齐),故由视图把 layout 交回 */
  content: (L: PrestigeLayout) => PrestigeContent;
  onAction: (a: PrestigeAction) => void;
}

export class PrestigeView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: PrestigeViewHooks;

  private dim: Node;
  private panel: Plate;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  private pose: ReturnType<typeof iconNode>;
  private echoLine: Txt;
  private availLine: Txt;
  private routeLine: Txt;
  private collLine: Txt;
  private tabsStrip: ReturnType<typeof iconNode>;
  private tabs: TabSlot[] = [];
  /** 行的父节点:建在 Capture 之前,于是行池增建永不会排到热区之后 */
  private rowsNode: Node;
  private rowSlots: RowSlot[] = [];
  private triggerGroup: ChoiceGroup;
  private effectGroup: ChoiceGroup;
  private start: { base: ReturnType<typeof flatBox>; text: Txt };
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: PrestigeViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("PrestigeView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);

    // 节点创建顺序 = Web drawPrestige 的绘制顺序(横幅 → 标题 → 立绘 → 四行 → 页签 → 行 → 配置块 → 开始钮)
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.pose = iconNode("Pose", this.root, frames, ZERO);
    this.echoLine = new Txt("EchoLine", this.root);
    this.availLine = new Txt("AvailLine", this.root);
    this.routeLine = new Txt("RouteLine", this.root);
    this.collLine = new Txt("CollLine", this.root);
    this.tabsStrip = iconNode("TabsStrip", this.root, frames, ZERO);
    for (let i = 0; i < 3; i++) this.tabs.push({ base: flatBox("Tab" + i, this.root), text: new Txt("Tab" + i + "Text", this.root) });

    this.rowsNode = makeNode("Rows", this.root);

    // 定向搜索块在完美蓝图块**之上**(Web 的 blockTop 两次 −46 决定了这个纵向次序),
    // 但 Web 的绘制顺序是先触发器后效果,故节点顺序也按绘制顺序排
    this.triggerGroup = this.makeGroup("Trigger", 6);
    this.effectGroup = this.makeGroup("Effect", 8);

    this.start = { base: flatBox("StartBtn", this.root), text: new Txt("StartText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitPrestige(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeGroup(name: string, n: number): ChoiceGroup {
    const slots: ChoiceSlot[] = [];
    for (let i = 0; i < n; i++) slots.push({ base: flatBox(name + "Btn" + i, this.root), text: new Txt(name + "Text" + i, this.root) });
    return { label: new Txt(name + "Label", this.root), slots };
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
    this.paintDim(p4.ptDim);
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 标题:横幅优先(两档文字位),缺图回到 themePaint.header 那一档
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.headerBanner : ZERO);
    this.title.bold(true);
    const tt = banner ? L.titleWithBanner : L.titleBare;
    this.title.set(tt.x, tt.baseY, tt.maxW, tt.px, c.title, tt.align, p4.ptTitle);

    // 头部小立绘:固定坐标的一笔,无回退分支;画在四行文字之前(Web 的覆盖顺序)
    const pose = this.pose.show(KEY_POSE);
    placeRect(this.pose.node, pose ? L.pose : ZERO);

    // 头部四行:回响点数 / 可支配 / 路线 / 图鉴
    this.echoLine.bold(false);
    this.echoLine.set(L.echoLine.x, L.echoLine.baseY, L.echoLine.maxW, L.echoLine.px, c.echoText, "left", p4.ptEcho);
    this.availLine.bold(true);
    this.availLine.set(L.availLine.x, L.availLine.baseY, L.availLine.maxW, L.availLine.px, c.availText, "left", p4.ptAvail);
    this.routeLine.bold(false);
    this.routeLine.set(L.routeLine.x, L.routeLine.baseY, L.routeLine.maxW, L.routeLine.px, c.routeText, "left", p4.ptMeta);
    this.collLine.bold(false);
    this.collLine.set(L.collLine.x, L.collLine.baseY, L.collLine.maxW, L.collLine.px, c.collText, "left", p4.ptMeta);

    // 页签:整条贴图打底,再逐签画覆盖层(选中档与未选档两档色)
    const strip = this.tabsStrip.show(KEY_TABS_STRIP);
    placeRect(this.tabsStrip.node, strip ? L.tabsStrip : ZERO);
    for (let i = 0; i < this.tabs.length; i++) {
      const slot = this.tabs[i];
      const tab = L.tabs[i];
      const tc = c.tabs[i];
      if (!tab || !tc) continue;
      const sel = tc.selected;
      slot.base.draw(tab.rect, sel ? p4.ptTabSelFill : p4.ptTabFill, sel ? p4.ptTabSelStroke : p4.ptTabStroke);
      slot.text.bold(true);
      slot.text.set(tab.text.x, tab.text.baseY, tab.text.maxW, tab.text.px, tc.label, "center", sel ? p4.ptTabTextSel : p4.ptTabText);
    }

    // 节点行(三系恒 10 条,池按需增建)
    this.ensureRows(L.rows.length);
    for (let i = 0; i < this.rowSlots.length; i++) {
      const slot = this.rowSlots[i];
      const row = L.rows[i];
      const rc = c.rows[i];
      if (!row || !rc) this.hideRow(slot);
      else this.paintRow(slot, row, rc, c.ownedText);
    }

    // 两个配置块:标签行 + 逐钮(整块不在时布局给的是空数组与 null 标签,这里一并收起)
    this.paintGroup(this.triggerGroup, L.triggerBtns, L.triggerLabel, c.hasTargetedSearch ? c.triggerLabel : null, c.triggerBtns, p4.ptTriggerSelBg, p4.ptTriggerSelStroke);
    this.paintGroup(this.effectGroup, L.effectBtns, L.effectLabel, c.hasBlueprint ? c.effectLabel : null, c.effectBtns, p4.ptEffectSelBg, p4.ptEffectSelStroke);

    // 开始新轮回钮:纯代码矩形,描边宽度取共享层那一档(Web 的 lineWidth = 2)
    this.start.base.draw(L.startBtn, p4.ptStartBg, p4.ptStartStroke, PT_START_STROKE_W);
    this.start.text.bold(true);
    this.start.text.set(L.startText.x, L.startText.baseY, L.startText.maxW, L.startText.px, c.startText, "center", p4.ptStartText);
  }

  /** 一个开局配置块:标签行 + n 枚钮(选中档换底与描边,钮文两档色) */
  private paintGroup(group: ChoiceGroup, btns: PrestigeChoiceLayout[], labelLine: PtTextLine | null, labelText: string | null, contents: PrestigeChoiceContent[], selBg: string, selStroke: string): void {
    const p4 = viewTable().phase4;
    group.label.active(!!labelLine && !!labelText);
    if (labelLine && labelText) {
      group.label.bold(false);
      group.label.set(labelLine.x, labelLine.baseY, labelLine.maxW, labelLine.px, labelText, "left", p4.ptChoiceLabel);
    }
    for (let i = 0; i < group.slots.length; i++) {
      const slot = group.slots[i];
      const b = btns[i];
      const cc = contents[i];
      if (!b || !cc) {
        slot.base.node.active = false;
        slot.text.active(false);
        continue;
      }
      slot.base.node.active = true;
      slot.base.draw(b.rect, cc.selected ? selBg : p4.ptChoiceBg, cc.selected ? selStroke : p4.ptChoiceStroke);
      slot.text.active(true);
      slot.text.bold(false);
      slot.text.set(b.text.x, b.text.baseY, b.text.maxW, b.text.px, cc.label, "center", cc.selected ? p4.ptChoiceTextSel : p4.ptChoiceText);
    }
  }

  /** 一行节点:纯代码底板两档 + 名称 + 右列两档 + 描述 */
  private paintRow(slot: RowSlot, row: PrestigeRowLayout, rc: PrestigeRowContent, ownedLabel: string): void {
    const p4 = viewTable().phase4;
    slot.base.node.active = true;
    slot.base.draw(row.rect, rc.owned ? p4.ptRowOwnedFill : p4.ptRowFill, rc.owned ? p4.ptRowOwnedStroke : p4.ptRowStroke);
    slot.name.active(true);
    slot.name.bold(true);
    slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.name, "left", rc.owned ? p4.ptRowNameOwned : p4.ptRowName);
    // 右列两档互斥:已拥有走「勾选标记 + 已拥有」,否则走价格串
    slot.ownedText.active(rc.owned);
    slot.cost.active(!rc.owned);
    slot.mark.node.active = rc.owned;
    if (rc.owned) {
      const drawn = slot.mark.show(KEY_CHECK);
      placeRect(slot.mark.node, drawn ? row.ownedMark : ZERO);
      slot.ownedText.bold(true);
      slot.ownedText.set(row.ownedText.x, row.ownedText.baseY, row.ownedText.maxW, row.ownedText.px, ownedLabel, "right", p4.ptOwnedText);
    } else {
      slot.cost.bold(true);
      slot.cost.set(row.cost.x, row.cost.baseY, row.cost.maxW, row.cost.px, rc.costText, "right", rc.affordable ? p4.ptCostAfford : p4.ptCostLocked);
    }
    slot.desc.active(true);
    slot.desc.bold(false);
    slot.desc.set(row.desc.x, row.desc.baseY, row.desc.maxW, row.desc.px, rc.desc, "left", p4.ptDesc);
  }

  /** 收起一行(池长超过当前系行数的空槽) */
  private hideRow(slot: RowSlot): void {
    slot.base.node.active = false;
    slot.name.active(false);
    slot.cost.active(false);
    slot.ownedText.active(false);
    slot.mark.node.active = false;
    slot.desc.active(false);
  }

  /** 行池按需增建(行数 = 当前系的天赋条数) */
  private ensureRows(n: number): void {
    while (this.rowSlots.length < n) {
      const i = this.rowSlots.length;
      this.rowSlots.push({
        base: flatBox("Node" + i + "Base", this.rowsNode),
        name: new Txt("Node" + i + "Name", this.rowsNode),
        cost: new Txt("Node" + i + "Cost", this.rowsNode),
        ownedText: new Txt("Node" + i + "Owned", this.rowsNode),
        mark: iconNode("Node" + i + "Mark", this.rowsNode, this.frames, ZERO),
        desc: new Txt("Node" + i + "Desc", this.rowsNode),
      });
    }
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
