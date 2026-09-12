/**
 * 体力不足屏 —— Web `src/game.ts:drawEnergy`(4674-4745) 的节点化替换（Phase 5 末屏）。
 *
 * 分工与已落地十五屏同构：几何全部来自共享层 `game/ui/energyLayout.ts`（单一出口，面板盒 /
 * 横幅盒 / 三行文字的基线与限宽 / 三枚钮及其文字位 / 右上角返回钮，与 Web 逐项同数），内容与
 * 命中与写入意图来自 `energy/EnergyModel.ts`，本文件只把矩形落到节点上：全屏暗底 + 九宫格面板底
 * + 横幅 + 标题 + 体力读数行 + 提示行 + 广告钮 + 钻石钮 + 关闭钮 + 返回钮 + 整屏 Capture。
 *
 * **本屏没有条件容器**：Web 的 `drawEnergy` 一次 `if` 都不套在绘制路径上，七处文字恒画、
 * 四枚热区恒在，`canAd` / `canDiamond` 两个位只换**配色档与钮内文案档**（以及贴图档要不要
 * 让位给纯代码形状）。于是本屏的探针断言面是「色档 + 贴图开关 + 读数」，不是别的屏那种
 * `*Visible` 容器起落。
 *
 * 贴图分支与 Web 一一对应（三枚键都在 `ASSET_MANIFEST` 与两端资源目录里）：
 *  - 面板底 `panel_dark_corners` 走 `panelPad` 的**九宫格**（`Plate` 的 `"slice"` 档，切边由
 *    `ViewTable.borderOf` 按图推导），Web 缺图时什么都不画，本屏与已落地各屏同款地保留
 *    `phase3.detailBg / detailStroke` 这一档代码回退（正常路径取不到，贴图在两端都在）；
 *  - 标题横幅 `banner_mid_black` 是**整幅拉伸且没有回退分支**（Web 不接返回值），缺图时收成
 *    零位盒、标题照落位；本屏没有半透明贴图件（Web 这里一次都不动 `globalAlpha`）；
 *  - 广告钮与钻石钮都是 `canX && skinButtonBase(g, "btn_primary", ...)` —— **可用档才试贴图**，
 *    所以禁档一律传空键给 `Plate.show` 强制走代码底，与通关屏那枚双倍钮同一条写法；
 *  - 关闭钮与返回钮 Web 就是纯代码矩形（`fillRect` + `strokeRect`），本屏取 `flatBox` 出口，
 *    没有贴图档也没有缺图档。
 *
 * 文字落位只有 `ui/PanelKit.placeLine` 一个入口（R5 纪律）：文本节点一律挂在铺满原点的屏根上，
 * 以整屏为 box；返回钮那一行同样挂屏根（它的锚点在右上角，几何层已把限宽收到钮宽 72）。
 *
 * 三类已知视觉偏差（S3 文字基线 / S4 贴图拉满盒 / `qualityBox`·`Plate.show` 残余描边）按
 * `docs/COCOS-MIGRATION.md` 的挂账处置：本文件正常调用这些出口，不绕过也不对齐。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine, boxPlace } from "../ui/PanelKit";
import { EN_V4_BAND, EN_V4_ICON, enV4Title, type EnergyLayout, type EnRect, type EnTextLine } from "../game/ui/energyLayout";
import { hitEnergy, type EnergyAction, type EnergyContent } from "./EnergyModel";

/** 贴图键（与 Web drawEnergy 的 assets.draw / skinButtonBase 实参逐字对应；面板底键在几何层的 `panelKey`） */
const KEY_BANNER = "banner_mid_black";
const KEY_PRIMARY = "btn_primary";

/** 贴图收起时的零位盒（与 VictoryView / GameOverView 的图标位同款处置：缺图就不占位） */
const ZERO: EnRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本：落位只走 `ui/PanelKit.placeLine`（与已落地十五屏同款） */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  private lastBold = false;

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(t: EnTextLine, text: string, color: string): void {
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

  get node(): Node {
    return this.lb.node;
  }
}

/** 视图对宿主的最小要求：给我一帧几何，我按这一帧向宿主取内容；动作出口在宿主那一侧 */
export interface EnergyViewHooks {
  layout: () => EnergyLayout;
  content: () => EnergyContent;
  onAction: (a: EnergyAction) => void;
}

export class EnergyView {
  readonly root: Node;
  /** 整屏唯一的触摸入口（探针据此注入真实触摸） */
  readonly capture: Node;
  readonly hooks: EnergyViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  private panel: Plate;
  /** v4:通栏 64 高的顶带(menu_title_plate,随赛季主色铁框),压在面板与横幅之上 */
  private band: Plate;
  /** v5:顶带左端的圆徽记 */
  private bandIcon: Plate;
  private banner: ReturnType<typeof iconNode>;
  /** v5:大徽记(energy_emblem) */
  private emblem: ReturnType<typeof iconNode>;
  /** v5:关闭钮的金面板(旧档是纯代码矩形) */
  private closePlate: Plate;
  private title: Txt;
  /** `体力 N/MAX · 每 X 分钟恢复 1 点`（宿主 syncEnergy 后重排即跟着往上跳） */
  private stat: Txt;
  private hint: Txt;
  private ad: { plate: Plate; text: Txt };
  private diamond: { plate: Plate; text: Txt };
  private close: { base: ReturnType<typeof flatBox>; text: Txt };
  private back: { base: ReturnType<typeof flatBox>; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: EnergyViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("EnergyView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    // 节点创建顺序 = Web drawEnergy 的绘制顺序（暗底 → 面板九宫 → 横幅 → 三行文字 → 三枚钮 → 返回钮）
    this.panel = new Plate("Panel", this.root, frames);
    this.band = new Plate("BandV4", this.root, frames);
    this.bandIcon = new Plate("BandIconV5", this.root, frames);
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.emblem = iconNode("Emblem", this.root, frames, ZERO);
    this.closePlate = new Plate("ClosePlate", this.root, frames);
    this.title = new Txt("Title", this.root);
    this.stat = new Txt("StatLine", this.root);
    this.hint = new Txt("Hint", this.root);
    this.ad = { plate: new Plate("AdBtn", this.root, frames), text: new Txt("AdText", this.root) };
    this.diamond = { plate: new Plate("DiamondBtn", this.root, frames), text: new Txt("DiamondText", this.root) };
    this.close = { base: flatBox("CloseBtn", this.root), text: new Txt("CloseText", this.root) };
    this.back = { base: flatBox("BackBtn", this.root), text: new Txt("BackText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitEnergy(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,iconNode / Plate 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏（refresh）、领完体力落账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();

    this.paintDim(p4.enDim);

    // 面板底:Web panelPad 不传专属键,就是 panel_dark_corners 九宫格(键由几何层单一出口给)
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 横幅:整幅拉伸、没有缺图回退档（缺图收成零位盒,标题照落位）
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.banner : ZERO);

    this.title.set(L.title, c.title, p4.enTitle);
    // v4 顶带:通栏 64 高,标题金 16 左起;横幅收起
    this.band.setActive(p3.restV4);
    this.bandIcon.setActive(p3.restV4);
    if (p3.restV4) {
      this.band.show("menu_title_plate", EN_V4_BAND, "slice", p3.detailBg, p3.detailStroke);
      this.bandIcon.show("emblem_a_2", EN_V4_ICON, "stretch");
      this.banner.show("");
      placeRect(this.banner.node, ZERO);
      this.title.set(enV4Title(L.backBtn.x), c.title, HEX.gold);
    }
    // v5:标题之上的大徽记
    const emblemOn = p3.restV4 && this.emblem.show("energy_emblem");
    placeRect(this.emblem.node, emblemOn ? L.emblem : ZERO);
    if (!p3.restV4) this.emblem.show("");
    this.stat.set(L.statLine, c.statLine, p4.enStat);
    this.hint.set(L.hint, c.hint, p4.enHint);

    // 广告钮:可用档才试贴图（Web 的 `canAd && skinButtonBase(...)`,禁档短路成纯代码形状）
    this.ad.plate.show(c.canAd ? (p3.restV4 ? "btn_purple" : KEY_PRIMARY) : "", L.adBtn, "slice", c.canAd ? p4.enAdFallbackBg : p4.enAdOffBg, c.canAd ? p4.enAdFallbackStroke : p4.enAdOffStroke);
    this.ad.text.set(L.adText, c.adText, c.canAd ? p4.enAdText : p4.enAdTextOff);

    // 钻石钮:同一档写法,禁档只看钻石够不够价
    this.diamond.plate.show(c.canDiamond ? (p3.restV4 ? "btn_blue" : KEY_PRIMARY) : "", L.diamondBtn, "slice", c.canDiamond ? p4.enDiamondFallbackBg : p4.enDiamondOffBg, c.canDiamond ? p4.enDiamondFallbackStroke : p4.enDiamondOffStroke);
    this.diamond.text.set(L.diamondText, c.diamondText, c.canDiamond ? p4.enDiamondText : p4.enDiamondTextOff);

    // 关闭钮与返回钮:Web 两处都是纯代码矩形,没有贴图档
    // v5:关闭钮换金面板(btn_gold 九宫格),旧档保留纯代码矩形
    this.closePlate.setActive(p3.restV4);
    if (p3.restV4) this.closePlate.show("btn_gold", L.closeBtn, "slice");
    this.close.base.node.active = !p3.restV4;
    this.close.base.draw(L.closeBtn, p4.enCloseBg, p4.enCloseStroke);
    this.close.text.set(L.closeText, c.closeText, p4.enCloseText);
    this.back.base.draw(L.backBtn, p4.enBackBg, p4.enBackStroke);
    this.back.text.set(L.backText, c.backText, p4.enBackText);
  }

  /** 全屏暗底（Web 的 rgba(8,10,16,0.92) fillRect;尺寸随屏高一帧一绘） */
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
