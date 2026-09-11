/**
 * 升级三选一弹层 —— 批次 A · A2 的新屏(需求 F9:升级时能选保留哪个 / 重新随机)。
 *
 * **本件是一层覆盖层,不是一张屏**,与二次确认弹层同款两处:它不挂 `Screen:<key>`,而是挂在宿主的
 * `Overlay` 常驻层上(与轻提示 toast 同一条通路),开层时由宿主顶到末位压过懒建的 toast;
 * 它开着时战斗由宿主在主循环里另设一道闸门停住(弹层不挂路由,`router.blocksPlay()` 看不到它)。
 *
 * 分工与已落地各屏同构:几何全部来自共享层 `game/ui/levelUpLayout.ts`(盒 / 横幅 / 三张卡 /
 * 每卡六族文本 / 每卡三枚钮),内容与形态位来自 cc-free 的 `levelup/LevelUpModel.ts`,
 * 本文件只把矩形落到节点上:全屏暗底 + 盒底垫九宫格 + 标题横幅九宫格 + 标题 + 读数行 +
 * 三张品质卡框(每卡:品质档 / 卡名 / 八条描述槽 / 数值差 / 状态标签 / 三枚钮)+ 底提示 + 整屏 Capture。
 *
 * 贴图分支("贴图优先、缺图回退代码形状",四枚键都在 `ASSET_MANIFEST` 与两端资源目录里):
 *  - 盒底垫 `panel_dark_corners` 与标题横幅 `banner_mid_navy` 都走 `Plate` 的九宫格档,
 *    切边由 `ViewTable.borderOf` 按图推导,缺图退各自的代码底板(键在共享层几何里,本文件不写死);
 *  - 卡框走 `ui/PanelKit.qualityBox`:有 `frame_<品质>` 贴图且四条边留得下可拉伸带就走 `SLICED`,
 *    否则退圆角暗底 + 品质色描边 + 内缩内发光 + 顶部品质色条。**命中隐藏词条时卡框改走隐藏档**
 *    (`frame_hidden` 与 `quality.ts` hidden 档的 `#4dffc8`),色与键都由模型层给,视图不判隐藏;
 *  - 三枚钮是纯代码矩形(`flatBox`):本屏没有对应的钮贴图形态位,禁态只换配色档不换矩形
 *    (与体力屏两枚钮同性质)。
 *
 * 文字落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂在铺满原点的弹层根上,
 * 以整屏为 box,layout 给的 x 就是 fillText 的锚点(卡内左起笔 / 盒内居中)。折行也不在这里发生 ——
 * 描述行的条数与字符预算在模型层(`levelUpDescLines` 读共享层的 `LV_DESC_CHARS`),视图只按结果落节点。
 *
 * 点击:整屏一枚 Capture,`hitLevelUp` 给九片钮之一,给 `null` 也照样吃掉这一下(语义是"吞掉、
 * 什么都不做",不是"交给下一层"),同时显式 `propagationStopped` —— 派发器按兄弟序自上而下找第一个
 * 命中就 break,于是弹层开着时战斗屏的摇杆与 HUD 一律收不到 TOUCH_START。
 *
 * **本屏没有广告位**:重随走局内金币,所以本文件不 import 任何广告出口,也没有屏级 pending 闸门
 * (广告闸门全仓只有 `GameShell.watchAd` 首行那一道)。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, placeLine, qualityBox } from "../ui/PanelKit";
import { LV_CARDS, LV_DESC_MAX_LINES, LV_BTN_STROKE_W, type LvTextLine } from "../game/ui/levelUpLayout";
import type { LevelUpLayout } from "../game/ui/levelUpLayout";
import { hitLevelUp, type LevelUpAction, type LevelUpCardContent, type LevelUpContent } from "./LevelUpModel";

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与已落地各屏同款) */
class Txt {
  readonly lb: Label;
  private lastPx = -1;
  private lastAlign = "";
  private lastColor = "";
  private lastBold = false;

  constructor(name: string, parent: Node) {
    this.lb = label(name, parent, "", FS.muted, HEX.textSecondary, {});
  }

  set(t: LvTextLine, text: string, color: string): void {
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

/** 一枚纯代码钮(禁态只换配色档,不换矩形) */
interface BtnSlot {
  flat: ReturnType<typeof flatBox>;
  text: Txt;
}

/** 一张卡的品质框 + 六族文本 + 三枚钮 */
interface CardSlot {
  frame: ReturnType<typeof qualityBox>;
  quality: Txt;
  name: Txt;
  /** 描述行槽位数 = 共享层 `LV_DESC_MAX_LINES`,视图不写死枚数 */
  desc: Txt[];
  delta: Txt;
  tag: Txt;
  pick: BtnSlot;
  reroll: BtnSlot;
  lock: BtnSlot;
}

/** 视图对宿主的最小要求:给我一帧几何与一帧文案,动作出口在宿主那一侧 */
export interface LevelUpViewHooks {
  layout: () => LevelUpLayout;
  content: () => LevelUpContent;
  onAction: (a: LevelUpAction) => void;
}

export class LevelUpView {
  readonly root: Node;
  /** 整屏唯一的触摸入口(探针据此注入真实触摸) */
  readonly capture: Node;
  readonly hooks: LevelUpViewHooks;
  private frames: Map<string, SpriteFrame>;

  private dim: Node;
  private panel: Plate;
  private banner: Plate;
  private title: Txt;
  private readout: Txt;
  private cards: CardSlot[] = [];
  private hint: Txt;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: LevelUpViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("LevelUpView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    // 节点创建顺序 = 绘制顺序(暗底 → 盒底垫 → 横幅 → 标题 → 读数 → 三张卡 → 底提示)
    this.panel = new Plate("Panel", this.root, frames);
    this.banner = new Plate("Banner", this.root, frames);
    this.title = new Txt("Title", this.root);
    this.readout = new Txt("Readout", this.root);
    // 卡槽枚数来自共享层 LV_CARDS,视图不写死"三张"
    for (let i = 0; i < LV_CARDS; i++) this.cards.push(this.makeCardSlot("Card" + i));
    this.hint = new Txt("Hint", this.root);

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number }; propagationStopped?: boolean }) => {
        // 吞掉这一下:弹层开着时战斗屏的摇杆与 HUD 一律收不到(命中为 null 也照样吃掉)
        e.propagationStopped = true;
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitLevelUp(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeCardSlot(name: string): CardSlot {
    const desc: Txt[] = [];
    for (let i = 0; i < LV_DESC_MAX_LINES; i++) desc.push(new Txt(name + "Desc" + i, this.root));
    const btn = (k: string): BtnSlot => ({ flat: flatBox(name + k + "Btn", this.root), text: new Txt(name + k + "Text", this.root) });
    return {
      frame: qualityBox(name + "Frame", this.root, this.frames),
      quality: new Txt(name + "Quality", this.root),
      name: new Txt(name + "Name", this.root),
      desc,
      delta: new Txt(name + "Delta", this.root),
      tag: new Txt(name + "Tag", this.root),
      pick: btn("Pick"),
      reroll: btn("Reroll"),
      lock: btn("Lock"),
    };
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,Plate/qualityBox 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:弹层开起来、重随/锁定换卡面与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();

    this.paintDim(p4.lvDim);
    this.panel.show(L.panelKey, L.box, "slice", p4.lvPanelFallbackBg, p4.lvPanelFallbackStroke);
    this.banner.show(L.bannerKey, L.banner, "slice", p4.lvBannerFallbackBg, p4.lvBannerFallbackStroke);
    this.title.set(L.title, c.title, p4.lvTitle);
    this.readout.set(L.readout, c.readoutText, p4.lvReadout);
    for (let i = 0; i < this.cards.length; i++) this.paintCard(i, L, c.cards[i], p4);
    this.hint.set(L.hint, c.hint, p4.lvHint);
  }

  /** 一张卡:品质框(隐藏档改色改键)+ 六族文本 + 三枚钮(禁态只换配色档) */
  private paintCard(i: number, L: LevelUpLayout, v: LevelUpCardContent | undefined, p4: ReturnType<typeof viewTable>["phase4"]): void {
    const slot = this.cards[i];
    const g = L.cards[i];
    if (!g || !v) {
      slot.frame.node.active = false;
      slot.quality.active(false);
      slot.name.active(false);
      slot.desc.forEach((t) => t.active(false));
      slot.delta.active(false);
      slot.tag.active(false);
      for (const b of [slot.pick, slot.reroll, slot.lock]) {
        b.flat.node.active = false;
        b.text.active(false);
      }
      return;
    }
    slot.frame.node.active = true;
    // 品质框:命中隐藏词条时模型层已把色与键换成隐藏档,视图不判隐藏
    slot.frame.draw(g.rect, v.color, true, v.frameKey);

    slot.quality.active(true);
    slot.quality.set(g.quality, v.qualityText, p4.lvCardTag);
    slot.name.active(true);
    slot.name.set(g.name, v.nameText, v.color);
    for (let d = 0; d < slot.desc.length; d++) {
      const line = v.descLines[d];
      slot.desc[d].active(!!line);
      if (line) slot.desc[d].set(g.descLines[d], line, p4.lvCardDesc);
    }
    slot.delta.active(!!v.deltaText);
    if (v.deltaText) slot.delta.set(g.delta, v.deltaText, p4.lvCardDelta);
    slot.tag.active(true);
    slot.tag.set(g.tag, v.tagText, v.hidden ? p4.lvCardTagHidden : v.locked ? p4.lvCardTagLocked : p4.lvCardTag);

    this.paintBtn(slot.pick, g.pick, v.pickText, v.pickEnabled, p4.lvPickBg, p4.lvPickStroke, p4.lvPickText, p4);
    this.paintBtn(slot.reroll, g.reroll, v.rerollText, v.rerollEnabled, p4.lvRerollBg, p4.lvRerollStroke, p4.lvRerollText, p4);
    this.paintBtn(slot.lock, g.lock, v.lockText, v.lockEnabled, p4.lvLockBg, p4.lvLockStroke, p4.lvLockText, p4);
  }

  /** 一枚钮:可用档走各自那套配色,禁态三枚共用一套(矩形不变,与体力屏两枚钮同性质) */
  private paintBtn(
    slot: BtnSlot,
    g: { rect: { x: number; y: number; w: number; h: number }; text: LvTextLine },
    text: string,
    enabled: boolean,
    bg: string,
    stroke: string,
    fg: string,
    p4: ReturnType<typeof viewTable>["phase4"]
  ): void {
    slot.flat.node.active = true;
    slot.flat.draw(g.rect, enabled ? bg : p4.lvBtnOffBg, enabled ? stroke : p4.lvBtnOffStroke, LV_BTN_STROKE_W);
    slot.text.active(true);
    slot.text.set(g.text, text, enabled ? fg : p4.lvBtnTextOff);
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
