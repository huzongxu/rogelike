/**
 * 装备升级屏 —— Web `src/game.ts:drawGearUp`(3887-3977)的节点化替换(Phase 4 第四屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/gearUpLayout.ts`(单一出口,按像素栅格 module = 2 重排:
 * 屏底板矩形与贴图键 / 头部两带的标题、副标题与星尘三线 / 空态与截断提示两线 / 每行的品质框
 * 矩形 + 升级钮矩形 + 徽记槽 + 两段文本锚点 / 返回钮与两档文字位),内容与命中来自
 * `gearup/GearUpModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 标题 + 副标题 + 星尘 + 空态提示 + 恒 `GU_ROWS_MAX` 个行槽 +
 * 截断提示 + 右上返回钮 + 整屏 Capture 热区。
 *
 * 贴图分支("贴图优先、缺图回退代码形状"):
 *  - 屏底板走 `panel_dark_corners` 的九宫格档(与已重排各屏同一张,键由共享层 `GU_PANEL_KEY`
 *    给出,切深由 `core/ViewTable.ts:borderOf` 按 `nineSlice` 表推导);两张都没有时 `Plate`
 *    给一层代码底,这一档是 Cocos 侧的保险,与已落地各屏同处置;
 *  - **本屏标题没有横幅贴图**,只有一档左起笔文字(= Web 的直接 fillText);
 *  - 行底板是**品质框**(Web `src/ui/skin.ts:drawQualityFrame` 的 Cocos 等价物
 *    `ui/PanelKit.qualityBox`:圆角 4、暗底 rgba(0,0,0,0.5)、品质色描边 1.5、
 *    内缩 2.5 的内发光 1、无顶栏,线与内缩全部与 Web 实参同数),不是 `skinButtonBase`;
 *  - 徽记 `badge_gear_lv` 走 `iconNode`,缺图退文字星「★」(点亮 theme.stardust /
 *    未点亮 #4a5164);Web 的 `globalAlpha = s < lv ? 1 : 0.22` 同时管着贴图与文字两条分支,
 *    所以这里贴图与替代字形共读同一个节点 opacity(0.22 × 255 ≈ 56,取表值 `guStarDimAlpha`);
 *  - 升级钮两档:`afford` → `btn_minor` 九宫格优先、缺图退 `minorButtonBg` 的平面底
 *    (#2A3D55 + rgba(255,255,255,0.3));否则 → 传空键强制走 `Plate` 的代码形状
 *    (#1A1F2A + rgba(255,255,255,0.15)),与 Web 的 `!afford` 分支同一形状;
 *  - 返回钮挂 `btn_back`,底板恒画,文字 x 随贴图在否换档(Web `skinIconButton`)。
 *    本屏底板描边是 rgba(255,255,255,0.15)(Web 那里的 `strokeRect` 沿用了上一笔禁档按钮
 *    留下的 strokeStyle),与 daily / pass 的 0.3 档不同,取表值 `guBackStroke`。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根、
 * 以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。右上星尘是**右对齐**(末笔 = w − pad),尤其不能把锚点当盒左沿。
 *
 * 头部是两带:A 带「标题(左) + 返回钮(右)」、B 带「副标题(左) + 星尘(右)」,
 * 星尘读数因此与返回钮纵向错开、完整可见;建节点顺序仍是星尘在前、返回钮在后。
 */

import { Graphics, Label, Node, SpriteFrame, UIOpacity, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine, qualityBox } from "../ui/PanelKit";
import { GEAR_UPGRADE_MAX } from "../game/data/daily";
import { GU_ROWS_MAX, type GearUpLayout, type GearUpRowLayout, type GuRect } from "../game/ui/gearUpLayout";
import { hitGearUp, type GearUpAction, type GearUpContent, type GearUpRowContent } from "./GearUpModel";

/** 贴图键(与 Web drawGearUp 的实参逐字对应;面板那两件的键在共享层几何里) */
const KEY_STAR = "badge_gear_lv";
const KEY_BTN_MINOR = "btn_minor";
const KEY_BACK = "btn_back";

/** 贴图收起时的零位盒(与 DailyView / PassView 的图标位同款处置:缺图就不占位) */
const ZERO: GuRect = { x: 0, y: 0, w: 0, h: 0 };

/** 节点不透明度(替代 Web 的 globalAlpha:点亮档 255、未点亮档取表值) */
function setOpacity(node: Node, alpha: number): void {
  const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
  if (op.opacity !== alpha) op.opacity = alpha;
}

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 DailyView / PassView 同款) */
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

/** 一颗徽记的节点槽:贴图优先 + 缺图退文字星,两条分支共用同一个 opacity 档 */
interface StarSlot {
  icon: ReturnType<typeof iconNode>;
  glyph: Txt;
}

/** 一个装备行的节点槽:品质框 + 两行左对齐文本 + GEAR_UPGRADE_MAX 颗徽记 + 升级钮与钮文 */
interface RowSlot {
  frame: ReturnType<typeof qualityBox>;
  name: Txt;
  desc: Txt;
  stars: StarSlot[];
  btn: Plate;
  btnText: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何与内容,外加动作出口(落字段与 persist 都在宿主那一侧) */
export interface GearUpViewHooks {
  layout: () => GearUpLayout;
  content: () => GearUpContent;
  onAction: (a: GearUpAction) => void;
}

export class GearUpView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: GearUpViewHooks;

  private dim: Node;
  private panel: Plate;
  private title: Txt;
  private subtitle: Txt;
  private stardust: Txt;
  private empty: Txt;
  private rowSlots: RowSlot[] = [];
  private hint: Txt;
  private back: { base: ReturnType<typeof flatBox>; icon: ReturnType<typeof iconNode>; text: Txt };
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: GearUpViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("GearUpView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);
    // 头部两带的三条文本按 A 带→B 带顺序建节点(星尘在返回钮之前,两带纵向错开故互不遮挡)
    this.title = new Txt("Title", this.root);
    this.subtitle = new Txt("Subtitle", this.root);
    this.stardust = new Txt("Stardust", this.root);
    this.empty = new Txt("Empty", this.root);

    // 行槽一次建满(行数上限就是共享层的 GU_ROWS_MAX,只可能更少不会更多),不做池化:
    // 晚建的节点会排到 Capture 之后成为它的兄节点,而 Capture 是整屏唯一的触摸入口。
    for (let i = 0; i < GU_ROWS_MAX; i++) this.rowSlots.push(this.makeRowSlot("Gear" + i));

    this.hint = new Txt("Hint", this.root);
    this.back = { base: flatBox("Back", this.root), icon: iconNode("BackIcon", this.root, frames, ZERO), text: new Txt("BackText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitGearUp(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeRowSlot(name: string): RowSlot {
    const stars: StarSlot[] = [];
    // 徽记槽数 = GEAR_UPGRADE_MAX,与共享层 row.stars 的长度同一来源(颗数由该常量门控)
    for (let s = 0; s < GEAR_UPGRADE_MAX; s++) stars.push({ icon: iconNode(name + "Star" + s, this.root, this.frames, ZERO), glyph: new Txt(name + "StarGlyph" + s, this.root) });
    return {
      frame: qualityBox(name + "Frame", this.root, this.frames),
      name: new Txt(name + "Name", this.root),
      desc: new Txt(name + "Desc", this.root),
      stars,
      btn: new Plate(name + "Btn", this.root, this.frames),
      btnText: new Txt(name + "BtnText", this.root),
    };
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
    const c = this.hooks.content();

    // 覆盖底 + 屏底板(panel_dark_corners 的九宫格档,键与矩形都来自共享层)
    this.paintDim(p4.guDim);
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 头部三线:标题加粗 gold / 副标题 muted / 星尘右对齐 stardust(本屏没有横幅贴图)
    this.title.bold(true);
    this.title.set(L.title.x, L.title.baseY, L.title.maxW, L.title.px, c.title, "left", p4.guTitle);
    this.subtitle.bold(false);
    this.subtitle.set(L.subtitle.x, L.subtitle.baseY, L.subtitle.maxW, L.subtitle.px, c.subtitle, "left", p4.guSubtitle);
    this.stardust.bold(true);
    this.stardust.set(L.stardust.x, L.stardust.baseY, L.stardust.maxW, L.stardust.px, c.stardustText, "right", p4.guStardust);

    // 空态:ownedGear 为空时只有这一行,行槽整批收起(Web 那一支既不画行也不画截断提示)
    this.empty.active(L.empty);
    if (L.empty) this.empty.set(L.emptyText.x, L.emptyText.baseY, L.emptyText.maxW, L.emptyText.px, c.emptyText, "left", p4.guEmpty);

    for (let i = 0; i < this.rowSlots.length; i++) {
      const slot = this.rowSlots[i];
      const row = L.rows[i];
      const rc = c.rows[i];
      if (!row || !rc) this.hideRow(slot);
      else this.paintRow(slot, row, rc);
    }

    // 截断提示(仅 gearCount > GU_ROWS_MAX 那一档存在)
    this.hint.active(L.showHint);
    if (L.showHint) this.hint.set(L.hint.x, L.hint.baseY, L.hint.maxW, L.hint.px, c.hintText, "left", p4.guHint);

    // 返回钮:底板恒画,贴图叠在上面,文字 x 随贴图在否换档(Web skinIconButton)
    this.back.base.draw(L.backBtn, p4.guBackBg, p4.guBackStroke);
    const backIcon = this.back.icon.show(KEY_BACK);
    placeRect(this.back.icon.node, backIcon ? L.backIcon : ZERO);
    const bt = backIcon ? L.backTextWithIcon : L.backTextBare;
    this.back.text.bold(true);
    this.back.text.set(bt.x, bt.baseY, bt.maxW, bt.px, c.backText, "center", p4.guBackText);
  }

  /** 一行:品质框 + 名字(品质色加粗)/ 描述 + 徽记带 + 升级钮两档 + 钮文 */
  private paintRow(slot: RowSlot, row: GearUpRowLayout, rc: GearUpRowContent): void {
    const p4 = viewTable().phase4;
    const dimAlpha = p4.guStarDimAlpha;

    slot.frame.node.active = true;
    // Web 的 drawQualityFrame 本屏不传 topBar(那一项只有商店卡用)
    slot.frame.draw(row.rect, rc.color);

    slot.name.active(true);
    slot.name.bold(true);
    slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.name, "left", rc.color);
    slot.desc.active(true);
    slot.desc.bold(false);
    slot.desc.set(row.desc.x, row.desc.baseY, row.desc.maxW, row.desc.px, rc.descText, "left", p4.guDesc);

    // 徽记带(在按钮左侧):槽数与点亮门控都由内容层给,贴图缺失的那一颗才退文字星
    row.stars.forEach((star, s) => {
      const st = slot.stars[s];
      if (!st) return;
      const on = s < rc.litStars;
      const drawn = st.icon.show(KEY_STAR);
      st.icon.node.active = drawn;
      if (drawn) placeRect(st.icon.node, star);
      setOpacity(st.icon.node, on ? 255 : dimAlpha);
      st.glyph.active(!drawn);
      if (!drawn) {
        st.glyph.bold(false);
        st.glyph.set(star.x, row.starGlyphBaseY, star.w, row.starGlyphPx, p4.guStarGlyph, "left", on ? p4.guStarLit : p4.guStarDim);
        setOpacity(st.glyph.node, on ? 255 : dimAlpha);
      }
    });

    // 升级钮两档:afford → btn_minor 优先(缺图退 minorButtonBg 的平面底),
    //            否则 → 空键强制走代码形状 #1A1F2A + rgba(255,255,255,0.15)
    slot.btn.setActive(true);
    slot.btn.show(rc.afford ? KEY_BTN_MINOR : "", row.btn, "slice", rc.afford ? p4.guBtnMinorFallbackBg : p4.guBtnDisabledBg, rc.afford ? p4.guBtnMinorFallbackStroke : p4.guBtnDisabledStroke);
    slot.btnText.active(true);
    slot.btnText.bold(true);
    slot.btnText.set(row.btnText.x, row.btnText.baseY, row.btnText.maxW, row.btnText.px, rc.btnText, "center", rc.afford ? p4.guBtnTextAfford : p4.guBtnTextDisabled);
  }

  /** 收起一行(行数少于 GU_ROWS_MAX 的那些槽,以及空态下的全部槽):含五颗徽记的两条分支 */
  private hideRow(slot: RowSlot): void {
    slot.frame.node.active = false;
    slot.name.active(false);
    slot.desc.active(false);
    slot.btn.setActive(false);
    slot.btnText.active(false);
    for (const st of slot.stars) {
      st.icon.node.active = false;
      st.glyph.active(false);
    }
  }

  /** 全屏暗底(Web 的 fillStyle + fillRect;尺寸随屏高一帧一绘) */
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
