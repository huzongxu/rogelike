/**
 * 赛季通行证屏 —— Web `src/game.ts:drawPass`(2618-2713)的节点化替换(Phase 4 第三屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/passLayout.ts`(单一出口,激活行矩形 / 档位行三段文本锚点 /
 * 右列两档基线 / 对勾位 / 标题横幅 / 徽标位 / 节点轨道 / 总进度条 / 返回钮与 Web 逐项同数),
 * 内容与命中来自 `pass/PassModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 标题横幅 + 回响统计行 + 高级轨状态行(带徽标位) + 激活行 +
 * 节点轨道 + 恒 `PASS_TIERS.length` 个档位行 + 总进度条 + 右上返回钮 + 整屏 Capture 热区。
 *
 * 贴图分支与 Web 一一对应(七件都在 `ASSET_MANIFEST` 里,"贴图优先、缺图回退代码形状"):
 *  - `banner_title_gold_b`(标题横幅)与 `badge_pennant_purple`(高级轨徽标)走 `iconNode`,
 *    缺图即不画:标题随之从"横幅内居中"切到"左起笔于 pad"(= Web `themePaint.header` 的回退),
 *    高级轨文字随之从 `pad + 15` 切回 `pad`(= Web 的 `premX` 由 `assets.draw` 返回值决定);
 *  - `btn_primary`(激活行)走 `PanelKit.Plate` 的 slice 档,缺图回退暗金底 + 金描边;
 *    **已激活时这一格根本不画底板**(Web 的 prem 分支只 fillText),故整块节点收起;
 *  - 档位行底板 Web 是**纯代码矩形**(本屏没有 skinButtonBase,与 daily 不同),故走 `flatBox`;
 *  - `mark_check_green` 只在已领行显示(内容层 `showCheck` 门控),`bar_pass_nodes` 缺图就是不画
 *    (Web 把 `assets.draw` 的返回值丢弃,没有任何回退形状);
 *  - `bar_progress_purple` 走 `iconNode` 的整图拉伸档,有图时用 `psBarCover` 从
 *    `x + w × frac` 起盖住空缺(= Web `skinBar` 的遮罩法),缺图时换成"暗轨道 + 紫填充"两块
 *    代码矩形(= Web 的 `!skinBar(...)` 分支);
 *  - 返回钮这一屏**挂 `btn_back` 贴图**,与 daily 的纯色 rect 不同:Web `skinIconButton` 的
 *    `drawBaseBg()` 闭包恒画(所以暗底 + 细描边两档都在),图标画上时文字居中于图标右侧的
 *    剩余空间、缺图时整体居中,两条文字线位都在几何里,本文件只按 `show()` 返回值挑一档。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根、
 * 以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。右列状态文案是**右对齐**,尤其不能把锚点当盒左沿;
 * 它的两档基线(`fs.muted` 与 `fs.body`)由 layout 分开给出,本文件按三态挑一档,不自算。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode, setTextOutline } from "../ui/Widgets";
import { TB_ICON, TB_TITLE_DX, TB_TITLE_X } from "../game/ui/titleBand";
import { Plate, fitOne, flatBox, iconNode, placeLine, boxPlace } from "../ui/PanelKit";
import { PASS_TIERS } from "../game/data/pass";
import { passProgressRects, type PassLayout, type PsRect, type PsTextLine } from "../game/ui/passLayout";
import { ROW_ICON_SHIFT, rowIconRect } from "../game/ui/rowIcon";
import { hitPass, type PassAction, type PassContent, type PassRowContent } from "./PassModel";

/** 贴图键(屏底板那一枚由共享层 `PS_PANEL_KEY` 给出,不在视图里重复一份) */
const KEY_HEADER = "banner_title_gold_b";
const KEY_NODE_TRACK = "bar_pass_nodes";
const KEY_CHECK = "mark_check_green";
const KEY_PROGRESS_BAR = "bar_progress_purple";
const KEY_BACK = "btn_back";

/** 贴图收起时的零位盒(与 DailyView 的 deco/header 同款处置:缺图就不占位) */
const ZERO: PsRect = { x: 0, y: 0, w: 0, h: 0 };

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 DailyView/LeaderboardView 同款) */
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
    if (viewTable().phase3.restV4) {
      boxPlace(this.lb, x, baseY, maxW, px, align);
      return;
    }
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

/** 一个档位行的节点槽:代码底板 + 三段左对齐文本 + 右列状态 + 已领取对勾 */
interface RowSlot {
  base: ReturnType<typeof flatBox>;
  /** v4:铁框行板(可领 → 金框) */
  plate: Plate;
  /** v5:行左侧档位盾图标(pass_tier_N) */
  icon: Plate;
  name: Txt;
  free: Txt;
  premium: Txt;
  status: Txt;
  check: ReturnType<typeof iconNode>;
}

/** 视图对宿主的最小要求:给我一帧几何与内容,外加动作出口(写入与广告都在宿主那一侧) */
export interface PassViewHooks {
  layout: () => PassLayout;
  content: () => PassContent;
  onAction: (a: PassAction) => void;
}

export class PassView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: PassViewHooks;

  private dim: Node;
  private panel: Plate;
  /** v4:通栏 64 高的顶带(menu_title_plate,随赛季主色铁框),压在面板与横幅之上 */
  private band: Plate;
  /** v5:顶带左端的圆徽记(素材表 emblem_a_N) */
  private bandIcon: Plate;
  private header: ReturnType<typeof iconNode>;
  private title: Txt;
  private echo: Txt;
  private premBadge: ReturnType<typeof iconNode>;
  private premText: Txt;
  private actPlate: Plate;
  private actText: Txt;
  private nodeTrack: ReturnType<typeof iconNode>;
  private rowSlots: RowSlot[] = [];
  private progressLabel: Txt;
  private progressBar: ReturnType<typeof iconNode>;
  private barCover: ReturnType<typeof flatBox>;
  private barTrack: ReturnType<typeof flatBox>;
  private barFill: ReturnType<typeof flatBox>;
  private back: { base: ReturnType<typeof flatBox>; icon: ReturnType<typeof iconNode>; text: Txt };
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: PassViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("PassView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);
    this.band = new Plate("BandV4", this.root, frames);
    this.bandIcon = new Plate("BandIconV5", this.root, frames);
    this.header = iconNode("Header", this.root, frames, ZERO);
    this.title = new Txt("Title", this.root);
    this.echo = new Txt("Echo", this.root);
    this.premBadge = iconNode("PremBadge", this.root, frames, ZERO);
    this.premText = new Txt("PremText", this.root);
    this.actPlate = new Plate("ActPlate", this.root, frames);
    this.actText = new Txt("ActText", this.root);
    this.nodeTrack = iconNode("NodeTrack", this.root, frames, ZERO);

    // 行槽一次建满(PASS_TIERS 是常量表,行数不随存档变),不做池化:晚建的节点会排到
    // Capture 之后成为它的兄节点,而 Capture 是整屏唯一的触摸入口。
    for (let i = 0; i < PASS_TIERS.length; i++) this.rowSlots.push(this.makeRowSlot("Tier" + i));

    this.progressLabel = new Txt("ProgressLabel", this.root);
    this.progressBar = iconNode("ProgressBar", this.root, frames, ZERO);
    this.barCover = flatBox("BarCover", this.root);
    this.barTrack = flatBox("BarTrack", this.root);
    this.barFill = flatBox("BarFill", this.root);

    this.back = { base: flatBox("Back", this.root), icon: iconNode("BackIcon", this.root, frames, ZERO), text: new Txt("BackText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitPass(this.hooks.layout(), this.hooks.content(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeRowSlot(name: string): RowSlot {
    return {
      base: flatBox(name + "Bg", this.root),
      plate: new Plate(name + "Plate", this.root, this.frames),
      icon: new Plate(name + "Icon", this.root, this.frames),
      name: new Txt(name + "Name", this.root),
      free: new Txt(name + "Free", this.root),
      premium: new Txt(name + "Premium", this.root),
      status: new Txt(name + "Status", this.root),
      check: iconNode(name + "Check", this.root, this.frames, ZERO),
    };
  }

  /** 晚到贴图流到位后由宿主调用:frames 是同一个 Map 引用,iconNode/Plate 在 sync 时自会读到新键 */
  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)、入账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();
    /** 高级轨是否生效的唯一门控(内容层的 actButton 就是它的反面) */
    const prem = !c.actButton;

    // 覆盖底:全屏暗底 + 屏底板(九宫格档,贴图键与矩形都来自共享层)
    this.paintDim(p4.psDim);
    this.panel.show(L.panelKey, L.panel, "slice", p3.detailBg, p3.detailStroke);

    // 标题横幅:贴图优先,缺图不画底板、标题切到左起笔那一档(Web skinHeader 的两支)
    const banner = this.header.show(KEY_HEADER);
    placeRect(this.header.node, banner ? L.headerPlate : ZERO);
    this.title.bold(true);
    if (banner) this.title.set(L.titleOnBanner.x, L.titleOnBanner.baseY, L.titleOnBanner.maxW, L.titleOnBanner.px, c.title, "center", p4.psTitle);
    else this.title.set(L.titleBare.x, L.titleBare.baseY, L.titleBare.maxW, L.titleBare.px, c.title, "left", p4.psTitle);
    setTextOutline(this.title.lb, banner ? p4.bannerTitleOutlineW : 0, HEX.bgDeep);
    // v4 顶带:通栏 64 高,标题金 16 左起;横幅收起
    this.band.setActive(p3.restV4);
    this.bandIcon.setActive(p3.restV4);
    if (p3.restV4) {
      this.band.show("menu_title_plate", { x: 0, y: 0, w: DESIGN_W, h: 64 }, "slice", p3.detailBg, p3.detailStroke);
      this.bandIcon.show("emblem_a_3", TB_ICON, "stretch");
      this.header.show("");
      placeRect(this.header.node, ZERO);
      setTextOutline(this.title.lb, 0, HEX.bgDeep);
      this.title.bold(true);
      this.title.set(TB_TITLE_X, 26, L.backBtn.x - 28 - TB_TITLE_DX, 16, c.title, "left", HEX.gold);
    }

    // 回响统计行(Web 单行 body 左对齐)
    this.echo.set(L.echo.x, L.echo.baseY, L.echo.maxW, L.echo.px, c.echoText, "left", p4.psEcho);

    // 高级轨状态行:徽标只在已激活档尝试绘制,画没画上决定文字起笔位(Web 的 premX 两条分支)
    const badge = c.premBadgeKey ? this.premBadge.show(c.premBadgeKey) : false;
    placeRect(this.premBadge.node, badge ? L.premBadge : ZERO);
    const premColor = prem ? p4.psPremOn : p4.psPremOff;
    if (badge) this.premText.set(L.premTextWithBadge.x, L.premTextWithBadge.baseY, L.premTextWithBadge.maxW, L.premTextWithBadge.px, c.premText, "left", premColor);
    else this.premText.set(L.premTextBare.x, L.premTextBare.baseY, L.premTextBare.maxW, L.premTextBare.px, c.premText, "left", premColor);

    // 激活行:未激活是按钮(btn_primary 优先,缺图回退暗金底 + 金描边,文字整屏水平居中),
    //         已激活只剩一行左对齐状态文字,底板整块收起(Web 的 prem 分支不画任何底)
    this.actPlate.setActive(!prem);
    this.actText.bold(false);
    if (!prem) {
      // v5:激活行换箭头横幅(pass_progress_banner 整图拉伸)
      if (p3.restV4) this.actPlate.show("pass_progress_banner", L.actRect, "stretch", p4.psActFallbackBg, p4.psActFallbackStroke);
      else this.actPlate.show(L.actPlate.key, L.actRect, "slice", p4.psActFallbackBg, p4.psActFallbackStroke);
      this.actText.set(L.actBtnText.x, L.actBtnText.baseY, L.actBtnText.maxW, L.actBtnText.px, c.actText, "center", p4.psActText);
    } else {
      this.actText.set(L.actDoneText.x, L.actDoneText.baseY, L.actDoneText.maxW, L.actDoneText.px, c.actText, "left", p4.psActDone);
    }

    // 节点轨道:缺图就是不画(Web 把 assets.draw 的返回值丢弃,没有回退形状)
    const track = this.nodeTrack.show(KEY_NODE_TRACK);
    placeRect(this.nodeTrack.node, track ? L.nodeTrack : ZERO);

    // 档位行(Web 的行底/行边/三段左文本 + 右列三态,逐档色卡都在 phase4 表里)
    const rowPremColor = prem ? p4.psRowPremOn : p4.psRowPremOff;
    L.rows.forEach((row, i) => {
      const rc = c.rows[i];
      const slot = this.rowSlots[i];
      if (!rc || !slot) return;
      slot.base.draw(row.rect, rc.claimed ? p4.psRowClaimedBg : p4.psRowBg, rc.unlocked ? p4.psRowStrokeUnlocked : p4.psRowStrokeLocked);
      slot.plate.setActive(p3.restV4);
      if (p3.restV4) slot.plate.show(rc.status === "ready" ? "menu_row_plate_current" : "menu_row_plate", row.rect, "slice");
      // v5:左侧档位盾图标,文字整体右移(几何来自共享层 rowIcon)
      slot.icon.setActive(p3.restV4);
      if (p3.restV4) slot.icon.show(`pass_tier_${i + 1}`, rowIconRect(row.rect), "stretch");
      const dx = p3.restV4 ? ROW_ICON_SHIFT : 0;
      slot.name.bold(true);
      slot.name.set(row.name.x + dx, row.name.baseY, row.name.maxW - dx, row.name.px, rc.nameText, "left", rc.unlocked ? p4.psRowNameUnlocked : p4.psRowNameLocked);
      slot.free.set(row.free.x + dx, row.free.baseY, row.free.maxW - dx, row.free.px, rc.freeText, "left", p4.psRowFree);
      slot.premium.set(row.premium.x + dx, row.premium.baseY, row.premium.maxW - dx, row.premium.px, rc.premiumText, "left", rowPremColor);
      const ready = rc.status === "ready";
      const line = ready ? row.statusBody : row.statusMuted;
      slot.status.bold(ready);
      slot.status.set(line.x, line.baseY, line.maxW, line.px, rc.statusText, "right", ready ? p4.psStatusReady : rc.status === "claimed" ? p4.psStatusClaimed : p4.psStatusLocked);
      slot.check.node.active = rc.showCheck;
      if (rc.showCheck) placeRect(slot.check.node, slot.check.show(KEY_CHECK) ? row.check : ZERO);
    });

    // 总进度条:贴图档整图拉伸 + 暗罩盖空缺;缺图档暗轨道 + 紫填充(两块矩形的算法都在共享层)
    this.progressLabel.set(L.progressLabel.x, L.progressLabel.baseY, L.progressLabel.maxW, L.progressLabel.px, c.progressText, "left", p4.psProgressLabel);
    const rects = passProgressRects(L, c.progressFrac);
    const barOn = this.progressBar.show(KEY_PROGRESS_BAR);
    this.progressBar.node.active = barOn;
    this.barTrack.node.active = !barOn;
    this.barFill.node.active = !barOn;
    if (barOn) {
      placeRect(this.progressBar.node, L.progressBar);
      this.barCover.node.active = !!rects.cover;
      if (rects.cover) this.barCover.draw(rects.cover, p4.psBarCover);
    } else {
      this.barCover.node.active = false;
      this.barTrack.draw(L.progressBar, p4.psBarFallbackTrack);
      this.barFill.draw(rects.fill, p4.psBarFallbackFill);
    }

    // 返回钮:底板闭包恒画,贴图叠在上面,文字 x 随贴图在否换档(Web skinIconButton)
    this.back.base.draw(L.backBtn, p4.psBackBg, p4.psBackStroke);
    const backIcon = this.back.icon.show(KEY_BACK);
    placeRect(this.back.icon.node, backIcon ? L.backIcon : ZERO);
    const bt: PsTextLine = backIcon ? L.backTextWithIcon : L.backTextBare;
    this.back.text.bold(true);
    this.back.text.set(bt.x, bt.baseY, bt.maxW, bt.px, c.backText, "center", p4.psBackText);
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
