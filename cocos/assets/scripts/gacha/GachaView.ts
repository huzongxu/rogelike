/**
 * 扭蛋机屏 —— Web `src/game.ts:drawGacha`(3562-3702)的节点化替换(Phase 4 第五屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/gachaLayout.ts`(单一出口,面板矩形与贴图键 / 标题横幅
 * 与券数图标两档线位 / 三枚钮与换券条的底板与居中文字 / 双保底条与两档标签 / 最近抽取逐行 /
 * 收藏行矩形与三段文本锚点 / 返回钮与两档文字位,与 Web 逐项同数),内容与命中来自
 * `gacha/GachaModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 横幅与标题 + 券数 + 三枚钮 + 换券条 + 双保底条 + 最近抽取带 +
 * 收藏标签带 + 收藏行(按需增长的对象池) + 右上返回钮 + 整屏 Capture 热区。
 *
 * 贴图分支与 Web 一一对应(八件都在 `ASSET_MANIFEST` 里,"贴图优先、缺图回退代码形状"):
 *  - 面板底是几何层给的**贴内容矩形**,由 `PanelBase`(纯 Graphics)按 phase4 的
 *    `gcPanelFallbackBg` + `gcPanelFallbackStroke` 画(与 Web `panel()` 同值);几何层给空键时
 *    贴图板 `Panel` 整节点收起,给键时代码底垫在贴图板之下;
 *  - 标题走 `banner_large_purple` **显式 240×46**(与 daily 同参数、与 gearup 的纯文字不同),
 *    缺图时标题从"横幅内居中、基线 32"切到"左起笔于 pad、基线 36"(Web `themePaint.header`);
 *  - 券数走 `icon_ticket`,缺图时文字回到 pad 并前置替代字形「✦」(Web `iconText` 的 fallbackGlyph);
 *  - 单抽钮 `btn_minor`、十连与广告钮 `btn_primary`,都是 Web 的 `can && skinButtonBase(...)`
 *    形状:**禁档传空键**强制走代码底,于是禁档永远拿不到贴图;
 *  - 换券条与收藏行**全是纯代码矩形**(Web 那里就没有贴图),走 `flatBox`;
 *  - 保底条 `bar_progress_blue_b` 走 `iconNode` 的整图拉伸档,有图时用 `gcBarCover` 从
 *    `x + w × frac` 起盖住空缺(= Web `skinBar` 的遮罩法),缺图时换成"暗轨道 + 彩色填充"
 *    两块代码矩形(= Web 的 `!skinBar(...)` 分支),史诗填 `#c8b6ff`、传奇填 `#ffd76a`;
 *  - 返回钮 `btn_back` 叠在恒画的底板之上,文字 x 随贴图在否换档(Web `skinIconButton`)。
 *
 * 一处 Web 原样重叠照抄:两条保底条纵向互相压 2px(史诗条 `pityLabelY + 8` 高 6、传奇条
 * `pityLabelY + 12`),而传奇标签基线 `pityLabelY + 18` 就压在传奇条之下。本文件按 Web 的
 * 绘制顺序建节点(史诗条在前、传奇条在后),于是传奇条盖住史诗条的下沿 —— 与几何层都不做平移。
 *
 * 行区是本屏唯一"件数无上限"的一段:Web 既不截断也不滚动,`spreadRows` 的两个下限
 * (`rowH ≥ 40`、`gap ≥ 4`)在件数多时兜不住,末行底边越出 `h − pad`。本视图**照画所有行**
 * (节点按需增建),不做裁剪,于是溢出与 Web 逐像素同形。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根或挂在铺满
 * 整屏的行容器上,以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 /
 * 右末笔),视图不产任何二次平移。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { GC_RES_MAX, gachaBarRects, type GachaLayout, type GachaRowLayout, type GcRect } from "../game/ui/gachaLayout";
import { hitGacha, type GachaAction, type GachaContent } from "./GachaModel";

/** 贴图键(与 Web drawGacha 的实参逐字对应;八件都在 ASSET_MANIFEST 里) */
const KEY_BANNER = "banner_large_purple";
const KEY_TICKET_ICON = "icon_ticket";
const KEY_SINGLE = "btn_minor";
const KEY_PRIMARY = "btn_primary";
const KEY_BACK = "btn_back";
const KEY_PITY_BAR = "bar_progress_blue_b";

/** 贴图收起时的零位盒(与 DailyView / GearUpView 的图标位同款处置:缺图就不占位) */
const ZERO: GcRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 DailyView / PassView / GearUpView 同款) */
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

/** 一枚保底条的四件:贴图整图 + 盖空缺的暗罩 + 缺图档的轨道与填充 */
interface BarSlot {
  icon: ReturnType<typeof iconNode>;
  cover: ReturnType<typeof flatBox>;
  track: ReturnType<typeof flatBox>;
  fill: ReturnType<typeof flatBox>;
}

/** 最近抽取的一行:左起笔的名字 + 右对齐的「重复→星尘+N」 */
interface RecentSlot {
  name: Txt;
  dup: Txt;
}

/** 收藏行的一件:纯代码底板 + 名字 + `Lv.` 段 + 「带入中」 */
interface RowSlot {
  base: ReturnType<typeof flatBox>;
  name: Txt;
  level: Txt;
  badge: Txt;
}

/** 视图对宿主的最小要求:给我一帧几何,我按这一帧向宿主取内容;动作出口在宿主那一侧 */
export interface GachaViewHooks {
  layout: () => GachaLayout;
  /** 内容要读同一帧几何(收藏行以 id 为键反查、行序与几何逐位对齐),故由视图把 layout 交回 */
  content: (L: GachaLayout) => GachaContent;
  onAction: (a: GachaAction) => void;
}

export class GachaView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: GachaViewHooks;

  private dim: Node;
  /** 板底(纯 Graphics):几何层给空键时这一档就是屏的面板底,给键时垫在贴图板之下 */
  private panelBase: ReturnType<typeof flatBox>;
  private panel: Plate;
  private banner: ReturnType<typeof iconNode>;
  private title: Txt;
  private ticketIcon: ReturnType<typeof iconNode>;
  private ticketText: Txt;
  private back: { base: ReturnType<typeof flatBox>; icon: ReturnType<typeof iconNode>; text: Txt };
  private single: { base: Plate; text: Txt };
  private ten: { base: Plate; text: Txt };
  private ad: { base: Plate; text: Txt };
  private swap: { base: ReturnType<typeof flatBox>; text: Txt };
  private pityEpicLabel: Txt;
  private pityLegendLabel: Txt;
  private pityEpicBar: BarSlot;
  private pityLegendBar: BarSlot;
  private resLabel: Txt;
  private recentSlots: RecentSlot[] = [];
  private collLabel: Txt;
  private collBonus: Txt;
  private collEmpty: Txt;
  /** 收藏行的父节点:建在 Capture 之前,于是行池增建永不会排到热区之后 */
  private rowsNode: Node;
  private rowSlots: RowSlot[] = [];
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: GachaViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("GachaView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panelBase = flatBox("PanelBase", this.root);
    this.panel = new Plate("Panel", this.root, frames);

    // 节点创建顺序 = Web drawGacha 的绘制顺序(横幅 → 标题 → 券数 → 返回 → 三枚钮 → 换券条 → 保底 → 最近 → 收藏)
    this.banner = iconNode("HeaderBanner", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.ticketIcon = iconNode("TicketIcon", this.root, frames, ZERO);
    this.ticketText = new Txt("TicketText", this.root);
    this.back = { base: flatBox("Back", this.root), icon: iconNode("BackIcon", this.root, frames, ZERO), text: new Txt("BackText", this.root) };
    this.single = { base: new Plate("SingleBtn", this.root, frames), text: new Txt("SingleText", this.root) };
    this.ten = { base: new Plate("TenBtn", this.root, frames), text: new Txt("TenText", this.root) };
    this.ad = { base: new Plate("AdBtn", this.root, frames), text: new Txt("AdText", this.root) };
    this.swap = { base: flatBox("SwapStrip", this.root), text: new Txt("SwapText", this.root) };
    this.pityEpicLabel = new Txt("PityEpicLabel", this.root);
    this.pityEpicBar = this.makeBar("PityEpic");
    this.pityLegendLabel = new Txt("PityLegendLabel", this.root);
    this.pityLegendBar = this.makeBar("PityLegend");
    this.resLabel = new Txt("RecentLabel", this.root);
    for (let i = 0; i < GC_RES_MAX; i++) this.recentSlots.push({ name: new Txt("Recent" + i + "Name", this.root), dup: new Txt("Recent" + i + "Dup", this.root) });
    this.collLabel = new Txt("CollLabel", this.root);
    this.collBonus = new Txt("CollBonus", this.root);
    this.collEmpty = new Txt("CollEmpty", this.root);

    this.rowsNode = makeNode("Rows", this.root);
    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitGacha(this.hooks.layout(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeBar(name: string): BarSlot {
    return {
      icon: iconNode(name + "Skin", this.root, this.frames, ZERO),
      cover: flatBox(name + "Cover", this.root),
      track: flatBox(name + "Track", this.root),
      fill: flatBox(name + "Fill", this.root),
    };
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,iconNode/Plate 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)、落账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content(L);

    // 覆盖底(整屏) + 面板底(贴内容矩形;空键 = 只画代码底板,有键时代码底垫在贴图板之下)
    this.paintDim(p4.gcDim);
    this.panelBase.draw(L.panel, p4.gcPanelFallbackBg, p4.gcPanelFallbackStroke);
    this.panel.node.active = !!L.panelKey;
    if (L.panelKey) this.panel.show(L.panelKey, L.panel, "slice", p4.gcPanelFallbackBg, p4.gcPanelFallbackStroke);

    // 标题:横幅优先(两档文字位),缺图回到 themePaint.header 那一档
    const banner = this.banner.show(KEY_BANNER);
    placeRect(this.banner.node, banner ? L.headerBanner : ZERO);
    this.title.bold(true);
    const tt = banner ? L.titleWithBanner : L.titleBare;
    this.title.set(tt.x, tt.baseY, tt.maxW, tt.px, c.title, tt.align, p4.gcTitle);

    // 券数:图标优先(文字起笔右移一枚图标宽),缺图时前置替代字形「✦」
    const ticketIcon = this.ticketIcon.show(KEY_TICKET_ICON);
    placeRect(this.ticketIcon.node, ticketIcon ? L.ticketIcon : ZERO);
    this.ticketText.bold(true);
    if (ticketIcon) this.ticketText.set(L.ticketTextWithIcon.x, L.ticketTextWithIcon.baseY, L.ticketTextWithIcon.maxW, L.ticketTextWithIcon.px, c.ticketText, "left", p4.gcTicketText);
    else this.ticketText.set(L.ticketTextBare.x, L.ticketTextBare.baseY, L.ticketTextBare.maxW, L.ticketTextBare.px, `${p4.gcTicketGlyph} ${c.ticketText}`, "left", p4.gcTicketText);

    // 返回钮:底板恒画(Web skinIconButton 的 drawBaseBg),贴图叠在上面,文字 x 随贴图在否换档
    this.back.base.draw(L.backBtn, p4.gcBackBg, p4.gcBackStroke);
    const backIcon = this.back.icon.show(KEY_BACK);
    placeRect(this.back.icon.node, backIcon ? L.backIcon : ZERO);
    const bt = backIcon ? L.backTextWithIcon : L.backTextBare;
    this.back.text.bold(true);
    this.back.text.set(bt.x, bt.baseY, bt.maxW, bt.px, c.backText, "center", p4.gcBackText);

    // 三枚钮:可点档贴图优先、缺图退代码形状;禁档传空键强制走代码形状(Web 的 `can && skinButtonBase`)
    this.single.base.show(c.canSingle ? KEY_SINGLE : "", L.singleBtn, "slice", c.canSingle ? p4.gcSingleBg : p4.gcBtnDisabledBg, c.canSingle ? p4.gcSingleStroke : p4.gcBtnDisabledStroke);
    this.paintBtnText(this.single.text, L.singleText, c.singleText, c.canSingle, p4.gcSingleText, p4.gcBtnTextDisabled);
    this.ten.base.show(c.canTen ? KEY_PRIMARY : "", L.tenBtn, "slice", c.canTen ? p4.gcTenBg : p4.gcBtnDisabledBg, c.canTen ? p4.gcTenStroke : p4.gcBtnDisabledStroke);
    this.paintBtnText(this.ten.text, L.tenText, c.tenText, c.canTen, p4.gcTenText, p4.gcBtnTextDisabled);
    this.ad.base.show(c.canAd ? KEY_PRIMARY : "", L.adBtn, "slice", c.canAd ? p4.gcAdBg : p4.gcBtnDisabledBg, c.canAd ? p4.gcAdStroke : p4.gcPanelDisabledStroke);
    this.paintBtnText(this.ad.text, L.adText, c.adText, c.canAd, p4.gcAdText, p4.gcBtnTextDisabled);

    // 换券条:纯代码矩形(Web 那里没有贴图),文字居中 fs.muted
    this.swap.base.draw(L.ticketBtn, c.canTicket ? p4.gcSwapBg : p4.gcBtnDisabledBg, c.canTicket ? p4.gcSwapStroke : p4.gcPanelDisabledStroke);
    this.swap.text.bold(false);
    this.swap.text.set(L.ticketText.x, L.ticketText.baseY, L.ticketText.maxW, L.ticketText.px, c.swapText, "center", c.canTicket ? p4.gcSwapText : p4.gcBtnTextDisabled);

    // 双保底条:标签左起笔 + 条从 pad + 110 起(两条互相压 2px 是 Web 原样)
    this.pityEpicLabel.bold(false);
    this.pityEpicLabel.set(L.pityEpicLabel.x, L.pityEpicLabel.baseY, L.pityEpicLabel.maxW, L.pityEpicLabel.px, c.pityEpicText, "left", p4.gcPityLabel);
    this.pityLegendLabel.bold(false);
    this.pityLegendLabel.set(L.pityLegendLabel.x, L.pityLegendLabel.baseY, L.pityLegendLabel.maxW, L.pityLegendLabel.px, c.pityLegendText, "left", p4.gcPityLabel);
    this.paintBar(this.pityEpicBar, L.pityEpicBar, c.pityEpicFrac, p4.gcBarFillEpic);
    this.paintBar(this.pityLegendBar, L.pityLegendBar, c.pityLegendFrac, p4.gcBarFillLegend);

    // 最近抽取:标签 + 最多 5 行(名字走品质色,重复那一档右对齐)
    this.resLabel.bold(false);
    this.resLabel.set(L.resLabel.x, L.resLabel.baseY, L.resLabel.maxW, L.resLabel.px, c.recentLabel, "left", p4.gcResLabel);
    for (let i = 0; i < this.recentSlots.length; i++) {
      const slot = this.recentSlots[i];
      const line = L.resRows[i];
      const rc = c.recent[i];
      if (!line || !rc) {
        slot.name.active(false);
        slot.dup.active(false);
        continue;
      }
      slot.name.active(true);
      slot.name.bold(false);
      slot.name.set(line.name.x, line.name.baseY, line.name.maxW, line.name.px, rc.name, "left", rc.color);
      slot.dup.active(!!rc.dupText);
      if (rc.dupText) {
        slot.dup.bold(false);
        slot.dup.set(line.dup.x, line.dup.baseY, line.dup.maxW, line.dup.px, rc.dupText, "right", p4.gcDupText);
      }
    }

    // 收藏标签带:标签与加成恒画,空态提示只在 0 件那一档出现(Web 那一支不画行)
    this.collLabel.bold(true);
    this.collLabel.set(L.collLabel.x, L.collLabel.baseY, L.collLabel.maxW, L.collLabel.px, c.collLabel, "left", p4.gcCollLabel);
    this.collBonus.bold(false);
    this.collBonus.set(L.collBonus.x, L.collBonus.baseY, L.collBonus.maxW, L.collBonus.px, c.bonusText, "left", p4.gcCollBonus);
    this.collEmpty.active(L.empty);
    if (L.empty) this.collEmpty.set(L.collEmpty.x, L.collEmpty.baseY, L.collEmpty.maxW, L.collEmpty.px, c.emptyText, "left", p4.gcEmpty);

    // 收藏行(件数无上限):池按需增建,多出来的槽整批收起
    this.ensureRows(L.rows.length);
    for (let i = 0; i < this.rowSlots.length; i++) {
      const slot = this.rowSlots[i];
      const row = L.rows[i];
      const rc = c.rows[i];
      if (!row || !rc) this.hideRow(slot);
      else this.paintRow(slot, row, rc);
    }
  }

  /** 一枚钮文的两个色档(Web 的 enabled / #5a6a80 两档) */
  private paintBtnText(t: Txt, line: { x: number; baseY: number; maxW: number; px: number }, text: string, on: boolean, onColor: string, offColor: string): void {
    t.bold(true);
    t.set(line.x, line.baseY, line.maxW, line.px, text, "center", on ? onColor : offColor);
  }

  /** 一枚保底条:贴图档画整图 + 盖空缺,缺图档画轨道 + 填充(Web skinBar 的 if / else) */
  private paintBar(bar: BarSlot, track: GcRect, frac: number, fillColor: string): void {
    const p4 = viewTable().phase4;
    const rects = gachaBarRects(track, frac);
    const drawn = bar.icon.show(KEY_PITY_BAR);
    bar.icon.node.active = drawn;
    bar.track.node.active = !drawn;
    bar.fill.node.active = !drawn;
    if (drawn) {
      placeRect(bar.icon.node, track);
      bar.cover.node.active = !!rects.cover;
      if (rects.cover) bar.cover.draw(rects.cover, p4.gcBarCover);
    } else {
      bar.cover.node.active = false;
      bar.track.draw(track, p4.gcBarFallbackTrack);
      bar.fill.draw(rects.fill, fillColor);
    }
  }

  /** 一行收藏:纯代码底板两档 + 名字(品质色)/ Lv. 段 / 带入中 */
  private paintRow(slot: RowSlot, row: GachaRowLayout, rc: { id: number; name: string; color: string; levelText: string; selected: boolean }): void {
    const p4 = viewTable().phase4;
    slot.base.node.active = true;
    slot.base.draw(row.rect, rc.selected ? p4.gcRowSelFill : p4.gcRowFill, rc.selected ? p4.gcRowSelStroke : p4.gcRowStroke);
    slot.name.active(true);
    slot.name.bold(false);
    slot.name.set(row.name.x, row.name.baseY, row.name.maxW, row.name.px, rc.name, "left", rc.color);
    slot.level.active(true);
    slot.level.bold(false);
    slot.level.set(row.level.x, row.level.baseY, row.level.maxW, row.level.px, rc.levelText, "left", p4.gcRowLevel);
    slot.badge.active(rc.selected);
    if (rc.selected) {
      slot.badge.bold(false);
      slot.badge.set(row.badge.x, row.badge.baseY, row.badge.maxW, row.badge.px, "带入中", "right", p4.gcRowBadge);
    }
  }

  /** 收起一行(反查落空的那一行,与件数少于池长的空槽) */
  private hideRow(slot: RowSlot): void {
    slot.base.node.active = false;
    slot.name.active(false);
    slot.level.active(false);
    slot.badge.active(false);
  }

  /** 行池按需增建(Web 本屏既不截断也不滚动,故行数只有下限没有上限) */
  private ensureRows(n: number): void {
    while (this.rowSlots.length < n) {
      const i = this.rowSlots.length;
      this.rowSlots.push({
        base: flatBox("Gear" + i + "Base", this.rowsNode),
        name: new Txt("Gear" + i + "Name", this.rowsNode),
        level: new Txt("Gear" + i + "Level", this.rowsNode),
        badge: new Txt("Gear" + i + "Badge", this.rowsNode),
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
