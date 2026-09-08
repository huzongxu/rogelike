/**
 * 每日福利屏 —— Web `src/game.ts:drawDaily`(4815-4937)的节点化替换(Phase 4 第二屏)。
 *
 * 分工:几何全部来自共享层 `game/ui/dailyLayout.ts`(经 `dailyScreenLayout` 单一出口,
 * 三区行矩形 / 每行三段文本锚点 / 标题横幅 / 装饰立绘 / 资源行图标 / 返回钮与 Web 逐项同数),
 * 内容与命中来自 `daily/DailyModel.ts`,本文件只把矩形落到节点上:
 * 全屏暗底 + 面板底 + 标题横幅 + 装饰立绘 + 资源行 + 两组标签 + 宝箱行 + 天赋行 +
 * 补领行 + 右上返回钮 + 整屏 Capture 热区。
 *
 * 贴图三件(`banner_title_gold_c` / `player_pose_2` / `badge_gem_purple`)与两种底板
 * (`btn_minor` / `btn_primary`)都在 `ASSET_MANIFEST` 里,走"贴图优先、缺图回退代码形状":
 *  - 横幅与图标用 `PanelKit.iconNode`,缺图即不画(= Web `assets.draw` 返回 false 那一支),
 *    标题随之从"横幅内居中"切到"左起笔于 pad"(= Web `themePaint.header` 的回退);
 *  - 行底板用 `PanelKit.Plate`。**已领行恒走代码形状**:Web 的 `claimed || skinButtonBase(...)`
 *    短路掉了贴图分支,所以已领态是"底 + 描边"两笔矩形,这里给 Plate 传空键得到同一结果。
 *  - 返回钮在 Web 是纯色 rect(不是 skinButtonBase),故这里走 `flatBox`,不挂贴图。
 *
 * 文本落位只有 `ui/PanelKit.placeLine` 一个入口(R5 纪律):文本节点一律挂屏根、
 * 以整屏为 box,layout 给的 x 就是 Web fillText 的锚点(左起笔 / 中中心 / 右末笔),
 * 视图不产任何二次平移。右侧状态文案是右对齐,尤其不能把锚点当盒左沿。
 */

import { Graphics, Label, Node, SpriteFrame, UITransform } from "cc";
import { DESIGN_W, fullRect, logicalH, placeRect, toDesignSpace } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { FS, HEX, bindLabel, hexToColor, label, makeNode } from "../ui/Widgets";
import { Plate, fitOne, flatBox, iconNode, placeLine } from "../ui/PanelKit";
import { ui } from "../game/ui/theme";
import { DAILY_BOXES, DAILY_TALENT_POOL } from "../game/data/daily";
import { hitDaily, type DailyAction, type DailyContent } from "./DailyModel";
import type { DailyLayout, DailyRowGeom, DailyRowLayout } from "../game/ui/dailyLayout";

/** 贴图键(与 Web drawDaily 的实参逐字对应;四件都在 ASSET_MANIFEST 里。
 *  两种行底板的键由共享层布局给出:`L.rowPlate.key` / `L.makeUpPlate.key`) */
const KEY_HEADER = "banner_title_gold_c";
const KEY_DECO = "player_pose_2";
const KEY_RES_ICON = "badge_gem_purple";
const KEY_PANEL = "panel_dark_corners";

/** 一行可重排的文本:落位只走 `ui/PanelKit.placeLine`(与 ShopView/HeroSelectView/LeaderboardView 同款) */
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

/** 一行的节点槽:底板 + 三段文本(名字 / 描述 / 右对齐状态) */
interface RowSlot {
  plate: Plate;
  name: Txt;
  desc: Txt;
  status: Txt;
}

/** 一行的配色与底板档位(全部来自 `core/ViewTable.ts` 的 phase4 段,键前缀 `dl`) */
interface RowTone {
  /** 底板贴图键;空串 = 直接走代码回退形状(Web 已领态短路掉 skinButtonBase 的那一支) */
  plateKey: string;
  fill: string;
  stroke: string;
  nameColor: string;
  descColor: string;
  statusColor: string;
}

/** 视图对宿主的最小要求:给我一帧几何与内容,外加动作出口(写入与广告都在宿主那一侧) */
export interface DailyViewHooks {
  layout: () => DailyLayout;
  content: () => DailyContent;
  onAction: (a: DailyAction) => void;
}

export class DailyView {
  readonly root: Node;
  private frames: Map<string, SpriteFrame>;
  private hooks: DailyViewHooks;

  private dim: Node;
  private panel: Plate;
  private header: ReturnType<typeof iconNode>;
  private title: Txt;
  private deco: ReturnType<typeof iconNode>;
  private resIcon: ReturnType<typeof iconNode>;
  private resText: Txt;
  private boxLabel: Txt;
  private talentLabel: Txt;
  private boxSlots: RowSlot[] = [];
  private talentSlots: RowSlot[] = [];
  private makeUp: RowSlot;
  private back: { flat: ReturnType<typeof flatBox>; text: Txt };
  private capture: Node;

  constructor(parent: Node, frames: Map<string, SpriteFrame>, hooks: DailyViewHooks) {
    this.frames = frames;
    this.hooks = hooks;
    this.root = makeNode("DailyView", parent);
    this.root.addComponent(UITransform).setContentSize(DESIGN_W, logicalH());

    this.dim = makeNode("Dim", this.root);
    this.dim.addComponent(Graphics);
    this.panel = new Plate("Panel", this.root, frames);
    this.header = iconNode("Header", this.root, frames, { x: 0, y: 0, w: 1, h: 1 });
    this.title = new Txt("Title", this.root);
    this.deco = iconNode("Deco", this.root, frames, { x: 0, y: 0, w: 1, h: 1 });
    this.resIcon = iconNode("ResIcon", this.root, frames, { x: 0, y: 0, w: 1, h: 1 });
    this.resText = new Txt("ResText", this.root);
    this.boxLabel = new Txt("BoxLabel", this.root);
    this.talentLabel = new Txt("TalentLabel", this.root);

    // 行槽一次建满,不做池化:宝箱行数恒 = DAILY_BOXES.length,天赋行数随存档 dailyTalents 变、
    // 上限就是天赋池大小(rollDailyTalents 不可能返回更多)。建满而不是按需增建,是因为晚建的
    // 节点会排到 Capture 之后成为它的兄节点,而 Capture 是整屏唯一的触摸入口。
    for (let i = 0; i < DAILY_BOXES.length; i++) this.boxSlots.push(this.makeRowSlot("Box" + i));
    for (let i = 0; i < DAILY_TALENT_POOL.length; i++) this.talentSlots.push(this.makeRowSlot("Talent" + i));
    this.makeUp = this.makeRowSlot("MakeUp");
    this.back = { flat: flatBox("Back", this.root), text: new Txt("BackText", this.root) };

    this.capture = makeNode("Capture", this.root);
    placeRect(this.capture, fullRect());
    this.capture.on(
      Node.EventType.TOUCH_END,
      (e: { getUILocation(): { x: number; y: number } }) => {
        const L = this.hooks.layout();
        const p = toDesignSpace(this.capture, e.getUILocation());
        const a = hitDaily(L, this.hooks.content(), p.x, p.y);
        if (a) this.hooks.onAction(a);
      },
      this
    );
  }

  private makeRowSlot(name: string): RowSlot {
    return { plate: new Plate(name + "Plate", this.root, this.frames), name: new Txt(name + "Name", this.root), desc: new Txt(name + "Desc", this.root), status: new Txt(name + "Status", this.root) };
  }

  /** 天赋行槽(建屏时已按池子大小建满;存档里多出来的条数越界即跳过,不会让视图崩) */
  private talentSlot(i: number): RowSlot | null {
    return this.talentSlots[i] ?? null;
  }

  setFrames(frames: Map<string, SpriteFrame>): void {
    this.frames = frames;
  }

  /** 一帧重排:切屏(refresh)、入账之后与晚到贴图流式加载后各调一次 */
  sync(): void {
    const p3 = viewTable().phase3;
    const p4 = viewTable().phase4;
    const L = this.hooks.layout();
    const c = this.hooks.content();
    const pad = ui.pad;

    // 覆盖底:全屏暗底(Web rgba(8,10,16,0.9))+ 面板底(对标 panelPad 的九宫格内缩 pad)
    this.paintDim(p4.dlDim);
    this.panel.show(KEY_PANEL, { x: pad, y: pad, w: DESIGN_W - pad * 2, h: logicalH() - pad * 2 }, "slice", p3.detailBg, p3.detailStroke);

    // 标题横幅:贴图优先,缺图不画底板、标题切到左起笔那一档(Web skinHeader 的两支)
    const banner = this.header.show(KEY_HEADER);
    placeRect(this.header.node, banner ? L.headerPlate : { x: 0, y: 0, w: 0, h: 0 });
    this.title.bold(true);
    if (banner) this.title.set(L.titleOnBanner.x, L.titleOnBanner.baseY, L.titleOnBanner.maxW, L.titleOnBanner.px, c.title, "center", HEX.bgDeep);
    else this.title.set(L.titleBare.x, L.titleBare.baseY, L.titleBare.maxW, L.titleBare.px, c.title, "left", HEX.gold);

    // 装饰立绘:缺图即不画(Web assets.draw 的返回值直接被丢掉)
    const deco = this.deco.show(KEY_DECO);
    placeRect(this.deco.node, deco ? L.deco : { x: 0, y: 0, w: 0, h: 0 });

    // 资源行:图标就位则文本右移 size+4,否则文本回到 pad 并前置替代字形(Web iconText 的两支)
    const icon = this.resIcon.show(KEY_RES_ICON);
    placeRect(this.resIcon.node, icon ? L.resIcon : { x: 0, y: 0, w: 0, h: 0 });
    if (icon) this.resText.set(L.resText.x, L.resText.baseY, L.resText.maxW, L.resText.px, c.resText, "left", p4.dlResText);
    else this.resText.set(L.resTextBare.x, L.resTextBare.baseY, L.resTextBare.maxW, L.resTextBare.px, `${p4.dlResGlyph} ${c.resText}`, "left", p4.dlResText);

    this.boxLabel.bold(true);
    this.boxLabel.set(L.boxLabel.x, L.boxLabel.baseY, L.boxLabel.maxW, L.boxLabel.px, c.boxLabel, "left", p4.dlBoxLabel);
    this.talentLabel.bold(true);
    this.talentLabel.set(L.talentLabel.x, L.talentLabel.baseY, L.talentLabel.maxW, L.talentLabel.px, c.talentLabel, "left", p4.dlTalentLabel);

    L.boxRows.forEach((row, i) => {
      const rc = c.boxes[i];
      if (!rc) return;
      // 已领:代码形状(青底 + 青描边),名字与右文同色;未领:btn_minor 九宫格优先,缺图走白底细边
      this.paintRow(this.boxSlots[i], row, rc, {
        plateKey: rc.claimed ? "" : L.rowPlate.key,
        fill: rc.claimed ? p4.dlBoxClaimedBg : p4.dlRowFallbackBg,
        stroke: rc.claimed ? p4.dlBoxClaimedStroke : p4.dlRowFallbackStroke,
        nameColor: rc.claimed ? p4.dlBoxClaimedText : p4.dlRowName,
        descColor: p4.dlRowDesc,
        statusColor: rc.claimed ? p4.dlBoxClaimedText : p4.dlRowStatus,
      });
    });

    L.talentRows.forEach((row, i) => {
      const rc = c.talents[i];
      const slot = this.talentSlot(i);
      if (!rc || !slot) return;
      this.paintRow(slot, row, rc, {
        plateKey: rc.claimed ? "" : L.rowPlate.key,
        fill: rc.claimed ? p4.dlTalentClaimedBg : p4.dlRowFallbackBg,
        stroke: rc.claimed ? p4.dlTalentClaimedStroke : p4.dlRowFallbackStroke,
        nameColor: rc.claimed ? p4.dlTalentClaimedText : p4.dlRowName,
        descColor: p4.dlRowDesc,
        statusColor: rc.claimed ? p4.dlTalentClaimedText : p4.dlRowStatus,
      });
    });

    // 天赋行槽多于本轮行数时收起(存档 dailyTalents 跨天变短的那一帧)
    for (let i = L.talentRows.length; i < this.talentSlots.length; i++) this.hideRow(this.talentSlots[i]);

    // 补领行:可补领走主按钮底板(Web 的 btn_primary + 圆角 10,由九宫格贴图承担),不可补领走代码形状
    const open = c.makeUp.claimable;
    this.paintRow(this.makeUp, L.makeUpRow, { name: c.makeUp.title, desc: c.makeUp.desc, statusText: c.makeUp.statusText }, {
      plateKey: open ? L.makeUpPlate.key : "",
      fill: open ? p4.dlMakeUpOpenBg : p4.dlMakeUpDoneBg,
      stroke: open ? p4.dlMakeUpOpenStroke : p4.dlMakeUpDoneStroke,
      nameColor: open ? p4.dlMakeUpOpenTitle : p4.dlMakeUpDoneTitle,
      descColor: p4.dlRowDesc,
      statusColor: open ? p4.dlMakeUpOpenStatus : p4.dlMakeUpDoneStatus,
    });

    // 返回钮:Web 是纯色 rect + 细描边,不挂贴图
    this.back.flat.draw(L.backBtn, p4.dlBackBg, p4.dlBackStroke);
    this.back.text.set(L.backText.x, L.backText.baseY, L.backText.maxW, L.backText.px, c.backText, "center", p4.dlBackText);
  }

  /** 一行:底板 + 名字(body 加粗)/ 描述(micro)/ 右对齐状态(muted 加粗) */
  private paintRow(slot: RowSlot, row: DailyRowGeom | DailyRowLayout, text: { name: string; desc: string; statusText: string }, tone: RowTone): void {
    slot.plate.setActive(true);
    slot.plate.show(tone.plateKey, row.rect, "slice", tone.fill, tone.stroke);
    slot.name.active(true);
    slot.name.bold(true);
    slot.name.set(row.line1.x, row.line1.baseY, row.line1.maxW, row.line1.px, text.name, "left", tone.nameColor);
    slot.desc.active(true);
    slot.desc.set(row.line2.x, row.line2.baseY, row.line2.maxW, row.line2.px, text.desc, "left", tone.descColor);
    slot.status.active(true);
    slot.status.bold(true);
    slot.status.set(row.status.x, row.status.baseY, row.status.maxW, row.status.px, text.statusText, "right", tone.statusColor);
  }

  private hideRow(slot: RowSlot): void {
    slot.plate.setActive(false);
    slot.name.active(false);
    slot.desc.active(false);
    slot.status.active(false);
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
