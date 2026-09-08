/**
 * 词缀融合屏 —— Web `src/game.ts:drawFusion`(4412-4518)、`drawHiddenChoice`(4519-4555)与
 * `drawTriplePanel`(4566-4613)的节点化替换(Phase 4 第八屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/fusionLayout.ts`(单一出口,面板底与贴图键 / 标题横幅 /
 * 星尘读数 / 返回钮 / 逐行矩形与两行基线与名字两档 / 底部三形态的全部文本线与模式钮与融合钮 /
 * 三选一卡片与弹层两行,与 Web 逐项同数),内容与命中来自 `fusion/FusionModel.ts`,
 * 本文件只把矩形落到节点上:全屏暗底 + 面板底 + 横幅与标题 + 星尘读数 + 返回钮 + 空态提示 +
 * 装备行容器(按需增长)+ **三棵互斥的底部形态子树**(提示 / 双选 / 三重)+ 三选一弹层子树 +
 * 整屏 Capture 热区。
 *
 * **底部三形态整体切换**:Web 装备 < 2 件时只画居中提示一行就 `return`;三重态(fusC 已选且
 * 解锁)画两枚模式钮 + 三行读数 + 融合钮后 `return`,且素材 find 落空时整块不画;未选齐画一行
 * 提示后 `return`;双选态画三行读数 + 融合钮。这里用容器节点的 `active` 整棵切换(不用透明度
 * 也不用位移藏),于是 `activeInHierarchy` 就是"这一支在不在画"的判据。
 *
 * **三选一弹层是叠加层而不是互斥支**:Web 在 `drawFusion` 之后另调 `drawHiddenChoice`,弹层
 * 打开时底下的融合屏照画、被 0.92 的暗底盖住;这里同构 —— `Hidden` 子树按 `content.hidden`
 * 起落,底部形态子树照常按各自的分派显示(素材已移除、选中 id 落空,底下自然是提示支)。
 *
 * 贴图分支与 Web 一一对应(三件都在 `ASSET_MANIFEST` 里,"贴图优先、缺图回退代码形状"):
 *  - 面板底走 `panel_dark_corners`(Web 的 `panelPad(g, w, h)` **不传专属键**,本屏没有专属面板);
 *  - 标题横幅 `banner_mid_blue` 是**整幅拉伸且没有回退分支**的一笔(Web 是裸 `assets.draw`,
 *    不接返回值 —— 不是 skinHeader),缺图时横幅收成零位盒,标题恒左起笔于 pad、基线 36;
 *  - 星尘读数走 `iconText`(`icon_stardust`,size 14):有图时文字起笔右移 `14 + 4`,缺图时
 *    回到 `pad` 并由视图前置替代字形「❋」。
 *
 * 装备行、模式钮、融合钮、三选一卡片与返回钮**全是纯代码矩形**(Web 那里就没有贴图),走
 * `flatBox`;融合钮、卡片与选中行的描边宽度取共享层常量(Web 把 lineWidth 临时设 2 再复位 1,
 * 而 `flatBox` 的 lineWidth 只作用于自己那一份 Graphics,不会泄漏到后续描边)。行名与预览行的
 * 品质色、卡片描边与名字的隐藏词缀色都是**动态色**(来自 `qualityDef` / `hiddenAffixDef`,
 * 经内容层交给视图),不进表;选中三档与禁用档的文字/底色取表(`fu*`)。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根或挂在铺满
 * 原点的形态容器上,以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心),
 * 视图不产任何二次平移。空态提示是 Web 的既有怪癖 —— `textAlign` 停在 left、锚点却在 `w/2`,
 * 这里照抄那一档(align "left"、x = w/2),不做"修正"。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import {
  FU_CARD_STROKE_W,
  FU_FUSE_STROKE_W,
  FU_ROW_SEL_STROKE_W,
  type FuRect,
  type FuTextLine,
  type FusionLayout,
  type FusionRowLayout,
} from "../game/ui/fusionLayout";
import { hitFusion, type FusionAction, type FusionContent, type FusionRowContent } from "./FusionModel";

/** 贴图键(与 Web drawFusion 的实参逐字对应;面板键在共享层几何里) */
const KEY_BANNER = "banner_mid_blue";
const KEY_STARDUST_ICON = "icon_stardust";

/** 贴图收起时的零位盒(与 CommissionView / GachaView 的图标位同款处置:缺图就不占位) */
const ZERO: FuRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与已落地七屏同款) */
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

/** 一件装备行的一件:纯代码底板 + 选中标记 + 名字 + 摘要行 */
interface RowSlot {
  base: ReturnType<typeof flatBox>;
  selTag: Txt;
  name: Txt;
  sub: Txt;
}

/** 三选一弹层的一张卡片:纯代码底板 + 名字 + 四条描述行 + 「点击选择」 */
interface CardSlot {
  base: ReturnType<typeof flatBox>;
  name: Txt;
  desc: Txt[];
  hint: Txt;
}

/** 底部一个形态子树的公共件(提示 / 双选 / 三重三棵互斥) */
interface BottomSlot {
  readout: Txt;
  preview: Txt;
  note: Txt;
  fuse: ReturnType<typeof flatBox>;
  fuseText: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何,我按这一帧向宿主取内容;动作出口在宿主那一侧 */
export interface FusionViewHooks {
  layout: () => FusionLayout;
  /** 内容要读同一帧几何(行序与卡片序都与 layout 逐位对齐),故由视图把 layout 交回 */
  content: (L: FusionLayout) => FusionContent;
  onAction: (a: FusionAction) => void;
}

/** 弹层卡片槽数(三选一,与 layout.hiddenCards 的长度同源) */
const CARD_SLOTS = 3;
/** 卡片描述行槽数(与共享层 FU_CARD_DESC_MAX_LINES 同数,行数上限由内容层的切分给出) */
const CARD_DESC_LINES = 4;

export class FusionView {
  readonly root: Node;
  /** 整屏唯一的触摸入口(探针据此注入真实触摸) */
  readonly capture: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: FusionViewHooks;

  private dim: Node;
  private panel: Plate;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  private stardustIcon: ReturnType<typeof iconNode>;
  private stardustText: Txt;
  private back: { base: ReturnType<typeof flatBox>; text: Txt };
  private emptyText: Txt;
  /** 装备行容器(条数 = 局内装备件数,槽位按需增长) */
  private rowsNode: Node;
  private rowSlots: RowSlot[] = [];
  /** 三棵互斥的底部形态子树 */
  private hintNode: Node;
  private hintText: Txt;
  private pairNode: Node;
  private pair: BottomSlot;
  private tripleNode: Node;
  private triple: BottomSlot;
  private modeSlots: { base: ReturnType<typeof flatBox>; text: Txt }[] = [];
  /** 三选一弹层子树(叠加层,盖在整屏之上) */
  private hiddenNode: Node;
  private hiddenDim: ReturnType<typeof flatBox>;
  private hiddenTitle: Txt;
  private hiddenSub: Txt;
  private cardSlots: CardSlot[] = [];

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: FusionViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("FusionView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);

    // 节点创建顺序 = Web drawFusion 的绘制顺序(横幅 → 标题 → 星尘 → 返回钮 → 行 → 底部),弹层最后
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.stardustIcon = iconNode("StardustIcon", this.root, frames, ZERO);
    this.stardustText = new Txt("StardustText", this.root);
    this.back = { base: flatBox("Back", this.root), text: new Txt("BackText", this.root) };
    this.emptyText = new Txt("EmptyText", this.root);

    this.rowsNode = makeNode("Rows", this.root);

    this.hintNode = makeNode("HintForm", this.root);
    this.hintText = new Txt("HintText", this.hintNode);

    this.pairNode = makeNode("PairForm", this.root);
    this.pair = this.makeBottomSlot("Pair", this.pairNode);

    this.tripleNode = makeNode("TripleForm", this.root);
    this.triple = this.makeBottomSlot("Triple", this.tripleNode);
    for (let i = 0; i < 2; i++) this.modeSlots.push({ base: flatBox("TripleMode" + i, this.tripleNode), text: new Txt("TripleMode" + i + "Text", this.tripleNode) });

    this.hiddenNode = makeNode("Hidden", this.root);
    this.hiddenDim = flatBox("HiddenDim", this.hiddenNode);
    this.hiddenTitle = new Txt("HiddenTitle", this.hiddenNode);
    this.hiddenSub = new Txt("HiddenSub", this.hiddenNode);
    for (let i = 0; i < CARD_SLOTS; i++) this.cardSlots.push(this.makeCardSlot("Card" + i));

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitFusion(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeBottomSlot(name: string, parent: Node): BottomSlot {
    return {
      readout: new Txt(name + "Readout", parent),
      preview: new Txt(name + "Preview", parent),
      note: new Txt(name + "Note", parent),
      fuse: flatBox(name + "FuseBtn", parent),
      fuseText: new Txt(name + "FuseText", parent),
    };
  }

  private makeCardSlot(name: string): CardSlot {
    const desc: Txt[] = [];
    for (let i = 0; i < CARD_DESC_LINES; i++) desc.push(new Txt(name + "Desc" + i, this.hiddenNode));
    return { base: flatBox(name + "Base", this.hiddenNode), name: new Txt(name + "Name", this.hiddenNode), desc, hint: new Txt(name + "Hint", this.hiddenNode) };
  }

  private makeRowSlot(name: string): RowSlot {
    return { base: flatBox(name + "Base", this.rowsNode), selTag: new Txt(name + "SelTag", this.rowsNode), name: new Txt(name + "Name", this.rowsNode), sub: new Txt(name + "Sub", this.rowsNode) };
  }

  /** 行槽按需增长(件数 = 局内装备列表长度,Web 不截断;只增不减,多余的槽收起) */
  private ensureRowSlots(n: number): void {
    while (this.rowSlots.length < n) this.rowSlots.push(this.makeRowSlot("Row" + this.rowSlots.length));
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
    this.paintDim(p4.fuDim);
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 标题:横幅两档 —— 有图居中落在绸带内,缺图切左起笔(与其它已翻新屏同一口径)
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.headerBanner : ZERO);
    this.title.bold(true);
    const tl = banner ? L.titleOnBanner : L.title;
    this.title.set(tl.x, tl.baseY, tl.maxW, tl.px, c.title, tl.align, p4.fuTitle);

    // 星尘读数:iconText 两档(有图右移、缺图前置替代字形),不加粗(Web 只设一次 F(fs.body))
    this.paintIconText(L, c, p4);

    // 返回钮:纯代码矩形 + 居中文字(Web 那里没有贴图,也没有 skinIconButton)
    this.back.base.draw(L.backBtn, p4.fuBackBg, p4.fuBackStroke);
    this.back.text.bold(false);
    this.back.text.set(L.backText.x, L.backText.baseY, L.backText.maxW, L.backText.px, c.backText, "center", p4.fuBackText);

    // 空态:装备 < 2 件时只有这一行正文(Web 在行循环之前 return)
    const empty = c.bottomKind === "empty";
    this.emptyText.active(empty);
    if (empty) {
      this.emptyText.bold(false);
      this.emptyText.set(L.emptyText.x, L.emptyText.baseY, L.emptyText.maxW, L.emptyText.px, c.emptyText, "left", p4.fuEmpty);
    }

    // 装备行与底部三形态(互斥子树整体切换)
    this.rowsNode.active = !empty;
    if (!empty) {
      this.ensureRowSlots(L.rows.length);
      for (let i = 0; i < this.rowSlots.length; i++) {
        const row = L.rows[i];
        const rc = c.rows[i];
        if (!row || !rc) this.hideRow(this.rowSlots[i]);
        else this.paintRow(this.rowSlots[i], row, rc);
      }
    }
    this.hintNode.active = c.bottomKind === "hint";
    this.pairNode.active = c.bottomKind === "pair";
    this.tripleNode.active = c.bottomKind === "triple";
    if (c.bottomKind === "hint") this.paintHint(L, c, p4.fuHint);
    if (c.bottomKind === "pair") this.paintBottom(this.pair, L.bottom.pairReadout, L.bottom.pairPreview, L.bottom.pairNote, L, c);
    if (c.bottomKind === "triple") {
      this.paintBottom(this.triple, L.bottom.tripleReadout, L.bottom.triplePreview, L.bottom.tripleNote, L, c);
      for (let i = 0; i < this.modeSlots.length; i++) {
        const m = L.bottom.modeBtns[i];
        const mc = c.modes[i];
        if (!m || !mc) continue;
        this.modeSlots[i].base.draw(m.rect, mc.sel ? p4.fuModeSelFill : p4.fuModeFill, mc.sel ? p4.fuModeSelStroke : p4.fuModeStroke);
        this.modeSlots[i].text.bold(true);
        this.modeSlots[i].text.set(m.text.x, m.text.baseY, m.text.maxW, m.text.px, mc.label, "center", mc.sel ? p4.fuModeSelText : p4.fuModeText);
      }
    }

    // 三选一弹层:叠加在整屏之上(Web 在 drawFusion 之后另调 drawHiddenChoice)
    this.hiddenNode.active = !!c.hidden;
    if (c.hidden) this.paintHidden(L, c, p4);
  }

  /** 星尘读数(iconText 的两档:图标优先、缺图回到 pad 并前置「❋」) */
  private paintIconText(L: FusionLayout, c: FusionContent, p4: ReturnType<typeof viewTable>["phase4"]): void {
    const drawn = this.stardustIcon.show(KEY_STARDUST_ICON);
    placeRect(this.stardustIcon.node, drawn ? L.stardustIcon : ZERO);
    this.stardustText.bold(false);
    if (drawn) this.stardustText.set(L.stardustTextWithIcon.x, L.stardustTextWithIcon.baseY, L.stardustTextWithIcon.maxW, L.stardustTextWithIcon.px, c.stardustText, "left", p4.fuStardustText);
    else this.stardustText.set(L.stardustTextBare.x, L.stardustTextBare.baseY, L.stardustTextBare.maxW, L.stardustTextBare.px, `${p4.fuStardustGlyph} ${c.stardustText}`, "left", p4.fuStardustText);
  }

  /** 一件装备行:底板两档(选中描边走品质色、宽 2)+ 选中标记 + 名字三档色 + 摘要行 */
  private paintRow(slot: RowSlot, row: FusionRowLayout, rc: FusionRowContent): void {
    const p4 = viewTable().phase4;
    const selColor = rc.sel === "A" ? p4.fuRowSelAText : rc.sel === "B" ? p4.fuRowSelBText : p4.fuRowSelCText;
    const selFill = rc.sel === "A" ? p4.fuRowSelAFill : rc.sel === "B" ? p4.fuRowSelBFill : p4.fuRowSelCFill;
    slot.base.node.active = true;
    slot.base.draw(row.rect, rc.sel ? selFill : p4.fuRowFill, rc.sel ? rc.qualityColor : p4.fuRowStroke, rc.sel ? FU_ROW_SEL_STROKE_W : 1);
    slot.selTag.active(!!rc.sel);
    if (rc.sel) {
      slot.selTag.bold(true);
      slot.selTag.set(row.selTag.x, row.selTag.baseY, row.selTag.maxW, row.selTag.px, `[${rc.sel}] `, "left", selColor);
    }
    const name = rc.sel ? row.nameWithTag : row.nameBare;
    slot.name.active(true);
    slot.name.bold(true);
    slot.name.set(name.x, name.baseY, name.maxW, name.px, rc.nameText, "left", rc.sel ? selColor : rc.disabled ? p4.fuRowNameDisabled : rc.qualityColor);
    slot.sub.active(true);
    slot.sub.bold(false);
    slot.sub.set(row.sub.x, row.sub.baseY, row.sub.maxW, row.sub.px, rc.subText, "left", p4.fuRowSub);
  }

  private hideRow(slot: RowSlot): void {
    slot.base.node.active = false;
    slot.selTag.active(false);
    slot.name.active(false);
    slot.sub.active(false);
  }

  private paintHint(L: FusionLayout, c: FusionContent, color: string): void {
    this.hintText.bold(false);
    this.hintText.set(L.bottom.hint.x, L.bottom.hint.baseY, L.bottom.hint.maxW, L.bottom.hint.px, c.hintText, "center", color);
  }

  /** 双选 / 三重共用的一支:三行读数 + 融合钮(两态各自的基线由 layout 分派) */
  private paintBottom(slot: BottomSlot, readout: FuTextLine, preview: FuTextLine, note: FuTextLine, L: FusionLayout, c: FusionContent): void {
    const p4 = viewTable().phase4;
    slot.readout.bold(false);
    slot.readout.set(readout.x, readout.baseY, readout.maxW, readout.px, c.readoutText, "left", p4.fuReadout);
    slot.preview.bold(true);
    slot.preview.set(preview.x, preview.baseY, preview.maxW, preview.px, c.previewText, "left", c.previewColor);
    slot.note.bold(false);
    slot.note.set(note.x, note.baseY, note.maxW, note.px, c.noteText, "left", p4.fuNote);
    slot.fuse.draw(L.bottom.fuseBtn, c.canFuse ? p4.fuFuseBg : p4.fuFuseDisabledBg, c.canFuse ? p4.fuFuseStroke : p4.fuFuseDisabledStroke, FU_FUSE_STROKE_W);
    slot.fuseText.bold(true);
    slot.fuseText.set(L.bottom.fuseText.x, L.bottom.fuseText.baseY, L.bottom.fuseText.maxW, L.bottom.fuseText.px, c.fuseText, "center", c.canFuse ? p4.fuFuseText : p4.fuFuseTextDisabled);
  }

  /** 三选一弹层:整屏暗底 + 两行标题 + 三张卡片(描边与名字走隐藏词缀的动态色) */
  private paintHidden(L: FusionLayout, c: FusionContent, p4: ReturnType<typeof viewTable>["phase4"]): void {
    const hc = c.hidden!;
    this.hiddenDim.draw(fullRect(), p4.fuHiddenDim);
    this.hiddenTitle.bold(true);
    this.hiddenTitle.set(L.hiddenTitle.x, L.hiddenTitle.baseY, L.hiddenTitle.maxW, L.hiddenTitle.px, hc.title, "center", p4.fuHiddenTitle);
    this.hiddenSub.bold(false);
    this.hiddenSub.set(L.hiddenSub.x, L.hiddenSub.baseY, L.hiddenSub.maxW, L.hiddenSub.px, hc.subText, "center", p4.fuHiddenSub);
    for (let i = 0; i < this.cardSlots.length; i++) {
      const slot = this.cardSlots[i];
      const card = L.hiddenCards[i];
      const cc = hc.cards[i];
      if (!card || !cc) {
        slot.base.node.active = false;
        slot.name.active(false);
        slot.desc.forEach((t) => t.active(false));
        slot.hint.active(false);
        continue;
      }
      slot.base.node.active = true;
      slot.base.draw(card.rect, p4.fuHiddenCardFill, cc.color, FU_CARD_STROKE_W);
      slot.name.active(true);
      slot.name.bold(true);
      slot.name.set(card.name.x, card.name.baseY, card.name.maxW, card.name.px, cc.name, "left", cc.color);
      for (let d = 0; d < slot.desc.length; d++) {
        const line = cc.descLines[d];
        slot.desc[d].active(!!line);
        if (line) {
          slot.desc[d].bold(false);
          slot.desc[d].set(card.descLines[d].x, card.descLines[d].baseY, card.descLines[d].maxW, card.descLines[d].px, line, "left", p4.fuHiddenCardDesc);
        }
      }
      slot.hint.active(true);
      slot.hint.bold(false);
      slot.hint.set(card.hint.x, card.hint.baseY, card.hint.maxW, card.hint.px, hc.cardHint, "left", p4.fuHiddenCardHint);
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
