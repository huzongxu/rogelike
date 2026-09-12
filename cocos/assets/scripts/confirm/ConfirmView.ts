/**
 * 二次确认弹层 —— Web `src/game.ts:drawConfirm`(1208-1240) 的节点化替换（Phase 5 末件）。
 *
 * **本件是一层覆盖层，不是一张屏**：它不挂 `Screen:<key>`，而是挂在宿主的 `Overlay` 常驻层上
 * （与轻提示 toast 同一条通路）。理由是 Web 的 `if (this.confirm) this.drawConfirm(...)` 排在
 * `render()` 的**最后一步**(1927)，覆盖在所有屏之上，且**不随 `state` 切换消失** —— 挂进任何
 * 一张屏节点都会在切屏那一刻跟着 `active = false` 一起没掉，而 Web 的确认框在 `ok()` 里切屏之后
 * 也照样是被「先清空再执行」显式收掉的，不是被切屏顺带收掉的。
 *
 * 分工与已落地十六屏同构：几何与内容全部来自 cc-free 的 `confirm/ConfirmModel.ts`（盒与两枚钮的
 * 矩形由它转调共享层 `game/ui/theme.ts:confirmRects`，横幅盒与四处基线也在它那里），本文件只把矩形
 * 落到节点上：全屏暗底 + 盒底垫九宫格 + 标题横幅九宫格 + 标题 + 正文两行 + 确认钮 + 取消钮 + 整屏 Capture。
 *
 * 贴图分支与 Web 一一对应（四枚键都在 `ASSET_MANIFEST` 与两端资源目录里）：
 *  - 盒底垫 `panel_dark_corners` 走 `drawNine` 的**九宫格**（`Plate` 的 `"slice"` 档，切边由
 *    `ViewTable.borderOf` 按图推导），Web 缺图时回退 `panel(...)` 的代码底板 + `#ffd76a` 描边，
 *    本件按已落地各屏同款把那一档交给 `Plate.show` 的 fill/stroke 实参；
 *  - 标题横幅 `banner_mid_navy` 同样是 `drawNine`（九宫格，Web 的切深实参 13），且 Web **显式写了
 *    缺图回退**（平面 `rgba(18,24,44,0.88)` + 1px `rgba(255,215,106,0.35)` 描边）—— 与体力屏那枚
 *    「整幅拉伸且不接返回值」的横幅不同档，所以这里用 `Plate` 而不是 `iconNode`；
 *  - 确认钮 `btn_danger`（`dangerButton` 里的 `drawNine(..., 8)`）与取消钮 `btn_minor`
 *    （`minorButtonBg` 里的 `drawNine(..., 8)`）都是贴图优先、缺图退各自的代码底板；
 *    **本件没有任何形态位**，两枚钮恒试贴图（不像体力屏那样按 `canAd` 短路）。
 *
 * 文字落位只有 `ui/PanelKit.placeLine` 一个入口（R5 纪律）：文本节点一律挂在铺满原点的弹层根上，
 * 以整屏为 box；折行也不在这里发生 —— 正文条数会改基线档（一行 `+80` / 两行 `+67`·`+89`），
 * 那条「量字 → 折行 → 基线」的链整个在模型层。
 *
 * 点击：整屏一枚 Capture，`hitConfirm` 给 `ok` / `cancel`，**给 `null` 也照样吃掉这一下**
 * （Web `src/game.ts:562` 那一段末尾是无条件 `return`，不落到下面的屏级分发）；同时显式
 * `propagationStopped`，让引擎的触摸派发在这张 Capture 上就断掉 —— 派发器按兄弟序自上而下
 * 找第一个命中就 `break`（`2d/event/pointer-event-dispatcher.ts` 的 `dispatchEventTouch`），
 * 于是弹层开着时商店的刷新钮、武器行、下一章钮一律收不到 TOUCH_START，也就不会有 TOUCH_END。
 *
 * 三类已知视觉偏差（S3 文字基线 / S4 贴图拉满盒 / `Plate.show` 残余描边）按
 * `docs/COCOS-MIGRATION.md` 的挂账处置：本文件正常调用这些出口，不绕过也不对齐。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, placeLine, boxPlace } from "../ui/PanelKit";
import { CF_BODY_MAX_LINES, hitConfirm, type CfTextLine, type ConfirmAction, type ConfirmContent, type ConfirmLayout } from "./ConfirmModel";

/** 一行可重排的文本：落位只走 `ui/PanelKit.placeLine`（与已落地十六屏同款） */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  private lastBold = false;

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(t: CfTextLine, text: string, color: string): void {
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

/** 视图对宿主的最小要求：给我一帧几何与一帧文案，动作出口在宿主那一侧 */
export interface ConfirmViewHooks {
  layout: () => ConfirmLayout;
  content: () => ConfirmContent;
  onAction: (a: ConfirmAction) => void;
}

export class ConfirmView {
  readonly root: Node;
  /** 整屏唯一的触摸入口（探针据此注入真实触摸） */
  readonly capture: Node;
  readonly hooks: ConfirmViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  private panel: Plate;
  private banner: Plate;
  private title: Txt;
  /** 正文两行（Web 最多画两行；条数不足时整棵收起，`activeInHierarchy` 就是判据） */
  private body: Txt[] = [];
  private ok: { plate: Plate; text: Txt };
  private cancel: { plate: Plate; text: Txt };

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: ConfirmViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("ConfirmView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    // 节点创建顺序 = Web drawConfirm 的绘制顺序（暗底 → 盒底垫 → 横幅 → 标题 → 正文 → 确认钮 → 取消钮）
    this.panel = new Plate("Panel", this.root, frames);
    this.banner = new Plate("Banner", this.root, frames);
    this.title = new Txt("Title", this.root);
    // 正文行数上限来自模型层的 CF_BODY_MAX_LINES(Web 的 lines[0] / lines[1] 两支),视图不写死枚数
    for (let i = 0; i < CF_BODY_MAX_LINES; i++) this.body.push(new Txt("Body" + i, this.root));
    this.ok = { plate: new Plate("OkBtn", this.root, frames), text: new Txt("OkText", this.root) };
    this.cancel = { plate: new Plate("CancelBtn", this.root, frames), text: new Txt("CancelText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number }; propagationStopped?: boolean }) => {
        // 吞掉这一下：弹层开着时屏级热区一律收不到（Web 的确认分支末尾是无条件 return）
        e.propagationStopped = true;
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitConfirm(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,Plate 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:弹层开起来、正文换串与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();

    this.paintDim(p4.cfDim);

    // 盒底垫:Web 的 drawNine("panel_dark_corners", …, 32),缺图回退 panel() 的代码底板 + 金描边
    this.panel.show(L.panelKey, L.box, "slice", p4.cfPanelFallbackBg, p4.cfPanelFallbackStroke);
    // 标题横幅:Web 的 drawNine("banner_mid_navy", …, 13),缺图回退平面底 + 1px 细描边
    // v4「深渊铭刻」:标题带走各屏同族的铁框顶带,确认钮换金面(几何与回退色不变)
    const v4 = viewTable().phase3.restV4;
    this.banner.show(v4 ? "menu_title_plate" : L.bannerKey, L.banner, "slice", p4.cfBannerFallbackBg, p4.cfBannerFallbackStroke);

    this.title.set(L.title, c.title, p4.cfTitle);

    for (let i = 0; i < this.body.length; i++) {
      const t = L.body[i];
      if (!t) {
        this.body[i].active(false);
        continue;
      }
      this.body[i].active(true);
      this.body[i].set(t, c.body[i] ?? "", p4.cfBody);
    }

    // 两枚钮:贴图优先(dangerButton → btn_danger / minorButtonBg → btn_minor),缺图退各自的代码底板
    this.ok.plate.show(v4 ? "btn_gold" : L.okKey, L.ok, "slice", p4.cfOkFallbackBg, p4.cfOkFallbackStroke);
    this.ok.text.set(L.okText, c.okText, p4.cfOkText);
    this.cancel.plate.show(L.cancelKey, L.cancel, "slice", p4.cfCancelFallbackBg, p4.cfCancelFallbackStroke);
    this.cancel.text.set(L.cancelText, c.cancelText, p4.cfCancelText);
  }

  /** 全屏暗底（Web 的 `rgba(0,0,0,0.62)` fillRect;尺寸随屏高一帧一绘） */
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
