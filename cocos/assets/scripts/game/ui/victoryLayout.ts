/**
 * 通关结算屏的纯几何 —— Web `src/game.ts:drawVictory`(3746-3849) 与 `handleTap` 的 victory
 * 分支(582-596) 的几何部分抽取。
 *
 * 单一出口：绘制与命中判定共读这一份矩形，宿主视图不产任何几何。口径与 Web 逐项同数：
 *  - **整屏只有一条纵向锚线 `a = h × 0.3`**（与死亡屏同一条），横幅 / 标题 / 关卡行 / 星数行 /
 *    首通行 / 券·回响·星尘三行 / 掉落行 / 名次提示 / 关卡框行十一处都从它加减；另有**两枚贴底钮**
 *    按 `h` 平移：双倍钮顶缘 `h − 116`（底边 `h − 82`）、返回钮顶缘 `h − 62`（底边 `h − 18`）；
 *  - **本屏没有面板**：Web 只画一笔全屏暗底 `rgba(8,10,16,0.86)` 就起内容，既不调 `panelPad`
 *    也不画九宫格，所以这里没有 `panel` / `panelKey` 两项；
 *  - 横幅 `banner_large_navy_a` 与立绘 `player_pose_1` 都是 `assets.draw` 的**整幅拉伸且没有
 *    回退分支**（Web 两处都不接返回值）。**立绘挂在屏心右侧**（`w/2 + 132`），与死亡屏那枚
 *    挂在左侧（`w/2 − 196`）方向相反 —— 本层的 `VI_POSE_DX` 因此是**正值表示右挂**，
 *    盒区间 `[412, 470]` 与横幅 `[160, 400]` 在两档屏高下都不相交；本屏没有半透明贴图件
 *    （Web 这里一次都不动 `globalAlpha`）；
 *  - 星数行是三枚 22×22 的横排，步进 `22 + 6 = 28`、总宽 `stars × 28 − 6`、**整行居中**，
 *    顶缘落在 `a + 58 − 22 + 4`（Web 写的是 `h*0.3 + 58 - size + 4`，那个 `+4` 是 Web 的
 *    裸微调，本层原样保留）；这一族的盒数随 `stars` 变，是**本层唯一一个随内容变的几何**，
 *    所以 `stars` 是布局入参而不是形态位；
 *  - 三行奖励文字各带一枚前置图标（`icon_ticket` / `icon_echo` / `icon_stardust`，14×14），
 *    图标的横向位置是 **`屏心 − 量字宽/2 − 20`**：Web 用的是 `g.measureText(该行文案).width`。
 *    量字发生在宿主视图（`ui/PanelKit.approxW`，系数走 `viewTable().hud`），本层只给
 *    「行锚点 + 图标边长 + 间距」，由 `victoryIconRect(row, textW)` 折成矩形；
 *  - 关卡框行同理，但 `drawAvatarFrame` 的锚点是**框心**而不是左上角，且边长 22、间距 18，
 *    折成矩形走 `victoryBadgeRect(row, textW)`；框心数字的基线是框心 `+4`（Web `y + 4`）。
 *
 * **一处 Web 原样的画布状态泄漏（照抄，不在本层「修好」）**：Web 的 `drawAvatarFrame`
 * 成功分支结尾把 `g.textAlign` 复位成 `"left"` 并在框心那一笔里改掉了 `fillStyle` 与 `font`，
 * 而 `drawVictory` 在调用它**之前**就设好了关卡框行的 `#c8b6ff / 16px`，之后直接
 * `fillText(fTxt, w/2, a + 210)` 且不再重设。于是那一行的实际外观取决于框贴图在不在：
 *  - 有图（`avatar_common/rare/epic/legendary/hidden` 五档在两端资源里都在，这就是线上实际档）：
 *    行文字被继承成 **金色 12px 粗体、以 `x = 屏心` 为左起笔**；
 *  - 缺图（`assets.draw` 返回 false 时函数提前 return，不改任何状态）：**#c8b6ff 16px、屏心居中**。
 * 本层把两档都算出来（`frameLineFlat` 与 `frameLineLeaked`），由视图按贴图到位与否取一档 ——
 * 两端在同一份资源表下必然取同一档。行锚点 `a + 210` 两档相同，故几何族不受影响。
 *
 * 形态位（`canDouble`）与内容位（`stars`）都由入参给出，本层不读存档、不查世界：
 *  - `canDouble` **不改变任何矩形**（Web 的 `doubleBtn = dbl` 无条件赋值，领取后钮还在、只是变灰），
 *    它只影响配色档与命中顺序里的 `!doubleClaimed` 前置；
 *  - Web 的两枚钮都不设 `lineWidth`（取全项目「描边后复位 1」的约定档），返回钮走
 *    `skinButtonBase(..., radius 10)`，双倍钮同一档，故 `VI_BTN_STROKE_W = 1`。
 *
 * 文本带限宽（`maxW`）是 Cocos 侧的口径：Web 的 `fillText` 不限宽。本屏居中文字一律取整屏带宽
 * `w − pad×2`，**包括两枚钮内的文字**（Web 那里「广告 ×2 回响」按 15px 比 190 的钮窄，
 * 但限宽口径与死亡屏保持同源，避免 `fitOne` 造出 Web 没有的「…」）。
 * 唯一例外是 `frameLineLeaked`：它的起笔在屏心，带宽只能给到 `w − 屏心`。
 *
 * 字号是 Web 写死的字面量：28 / 16 / 20 / 16 / 16 / 16 / 16 / 16 / 15 / 12 / 15 / 15，其中
 * 20 与 15 两档**不在 `fs` 表里**（`fs` 只有 28 / 22 / 16 / 14 / 13 / 12），12 就是 `fs.micro`。
 * 它们留在本层是因为文本行的 `px` 是几何签名的一部分，而共享层读不到宿主侧的 ViewTable；
 * `tests/cocos-phase5-victory.test.ts` 把 20 与 15 两档与 `fs` 全表逐项锁开，防止有人把它们
 * 顺手「归到表上」而悄悄改掉与 Web 的像素差。
 *
 * 颜色、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段（键前缀 `vi`）；
 * 本文件只留几何。
 */

import { ui } from "./theme";

/** 左上原点设计像素矩形（与 core/DesignMetrics.Rect 同形；共享层不引宿主类型） */
export interface ViRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐，取值与 `ctx.textAlign` 一致 */
export type ViAlign = "left" | "center" | "right";

/** 一行文本的落位请求：x/baseY 就是 Web fillText 的锚点与基线，maxW 为限宽 */
export interface ViTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: ViAlign;
  bold: boolean;
}

/**
 * 一处「跟随文字宽度的前置贴图」的行锚点。
 * `x` 恒为屏心；`y` 在图标档是**贴图盒顶缘**，在关卡框档是**框心**（两档分别由
 * `victoryIconRect` 与 `victoryBadgeRect` 解释，本层不出现第三种锚法）。
 */
export interface ViLeadRow {
  x: number;
  y: number;
  size: number;
  gap: number;
}

/** 布局入参：星数（0~3，决定星数行的枚数与总宽）与双倍可领态 */
export interface VictoryForms {
  stars: number;
  canDouble: boolean;
}

/** 整屏几何 */
export interface VictoryLayout extends VictoryForms {
  /** 全屏唯一的纵向锚线（Web 的 `h * 0.3`，十一处实参都从它加减） */
  anchorY: number;
  /** 标题横幅盒（`a` 上方 34，240×48；整幅拉伸，没有缺图回退档） */
  banner: ViRect;
  /** 通关立绘盒（`a` 上方 44，58×92；挂在屏心**右**侧，本屏没有半透明贴图件） */
  pose: ViRect;
  /** 「通关!」 */
  title: ViTextLine;
  /** `第N关 · 关名`（Web 的 `if (st)` 分支，无尽局没有） */
  stageLine: ViTextLine;
  /** 星数行：每枚一格，长度 = `stars`（Web 的 `if (victoryStars > 0)` 那一支） */
  starSlots: ViRect[];
  /** 星数行的总宽（`stars × step − (step − size)`，Web 写的是 `stars*step - 6`） */
  starRowW: number;
  /** 星数行步进（`size + gap`） */
  starStep: number;
  /** 星数行整幅缺图时的替代字形（Web 的 `drawn === 0` 分支：★/☆ 文本） */
  starText: ViTextLine;
  /** `每日首通!奖励 ×2 / 回响 ×1.5` */
  firstLine: ViTextLine;
  /** 奖励三行：图标行锚 + 文字基线 */
  ticketIcon: ViLeadRow;
  ticketLine: ViTextLine;
  echoIcon: ViLeadRow;
  echoLine: ViTextLine;
  stardustIcon: ViLeadRow;
  stardustLine: ViTextLine;
  /** `掉落装备 ×N(已入收藏 · 提供基础数值)` */
  dropLine: ViTextLine;
  /** `已超越幻影第 N 名` */
  rankLine: ViTextLine;
  /** 关卡框行的前置框（框心锚，22 见方，间距 18） */
  frameBadge: ViLeadRow;
  /** `解锁关卡框 · 第 N 关` —— 缺图档：#c8b6ff 16px 屏心居中 */
  frameLineFlat: ViTextLine;
  /** `解锁关卡框 · 第 N 关` —— 有图档：被 `drawAvatarFrame` 泄漏成金色 12px 粗体、屏心左起笔 */
  frameLineLeaked: ViTextLine;
  /** 框心数字相对框心的基线下沉（Web `fillText(String(stageId), x, y + 4)`） */
  badgeTextDy: number;
  /** 贴底的广告双倍钮（热区恒在，`canDouble` 只改配色与文字） */
  doubleBtn: ViRect;
  doubleText: ViTextLine;
  /** 贴底的返回菜单钮（本屏唯一的非广告出口） */
  menuBtn: ViRect;
  menuText: ViTextLine;
  /** 双倍钮底边相对屏底的下沉（Web 的裸 116 顶缘 → 底边 `h − 82`） */
  doubleBottomGap: number;
  /** 返回钮底边相对屏底的下沉（Web 的裸 62 顶缘 + 44 高 → 底边 `h − 18`，就是命中区的下界） */
  menuBottomGap: number;
}

/* Web drawVictory 的内联几何常量 */
/** 全屏纵向锚线相对屏高的比例 */
export const VI_ANCHOR_RATIO = 0.3;
/** 横幅：半宽 / 宽 / 高 / 相对锚线的上抬 */
export const VI_BANNER_DX = 120;
export const VI_BANNER_W = 240;
export const VI_BANNER_H = 48;
export const VI_BANNER_DY = 34;
/** 立绘：**正值表示挂在屏心右侧**（Web 的 `w / 2 + 132` 左上角）/ 宽 / 高 / 相对锚线的上抬 */
export const VI_POSE_DX = 132;
export const VI_POSE_W = 58;
export const VI_POSE_H = 92;
export const VI_POSE_DY = 44;
/** 关卡行相对锚线的基线偏移 */
export const VI_STAGE_DY = 34;
/** 星数行：边长 / 间距 / 步进 / 行的基线锚 / 贴图盒顶缘的裸微调 / 最多三枚 */
export const VI_STAR_SIZE = 22;
export const VI_STAR_GAP = 6;
export const VI_STAR_DY = 58;
export const VI_STAR_TOP_NUDGE = 4;
export const VI_STAR_MAX = 3;
/** 缺图替代字形的基线偏移与字号（与星数行同一档基线，Web 两处都写 `h * 0.3 + 58`） */
export const VI_STAR_TEXT_PX = 20;
/** 首通提示相对锚线的基线偏移 */
export const VI_FIRST_DY = 78;
/** 奖励三行：图标顶缘与文字基线相对锚线的偏移，三行的行距都是 22 */
export const VI_TICKET_ICON_DY = 92;
export const VI_TICKET_DY = 104;
export const VI_ECHO_ICON_DY = 114;
export const VI_ECHO_DY = 126;
export const VI_STARDUST_ICON_DY = 136;
export const VI_STARDUST_DY = 148;
/** 奖励行前置图标：边长 / 与文字左缘的间距（Web 的 `- 20`） */
export const VI_LEAD_ICON_SIZE = 14;
export const VI_LEAD_ICON_GAP = 20;
/** 掉落行相对锚线的基线偏移 */
export const VI_DROP_DY = 170;
/** 名次提示相对锚线的基线偏移 */
export const VI_RANK_DY = 192;
/** 关卡框行：文字基线偏移 / 框心偏移 / 框边长 / 与文字左缘的间距（Web 的 `- 18`）/ 框心数字下沉 */
export const VI_FRAME_DY = 210;
export const VI_FRAME_BADGE_DY = 204;
export const VI_FRAME_BADGE_SIZE = 22;
export const VI_FRAME_BADGE_GAP = 18;
export const VI_FRAME_BADGE_TEXT_DY = 4;
/** 双倍钮：半宽 / 宽 / 高 / 顶缘相对屏底的上抬 / 钮内文字相对钮顶的基线 */
export const VI_DOUBLE_DX = 95;
export const VI_DOUBLE_W = 190;
export const VI_DOUBLE_H = 34;
export const VI_DOUBLE_UP = 116;
export const VI_DOUBLE_TEXT_DY = 22;
/** 返回钮：半宽 / 宽 / 高 / 顶缘相对屏底的上抬 / 钮内文字相对钮顶的基线（Web 写的是裸 `h − 34`） */
export const VI_MENU_DX = 95;
export const VI_MENU_W = 190;
export const VI_MENU_H = 44;
export const VI_MENU_UP = 62;
export const VI_MENU_TEXT_DY = 28;
/** 钮底板描边宽度（Web 本屏一处都不设 lineWidth，取全项目「描边后复位 1」的约定档） */
export const VI_BTN_STROKE_W = 1;
/** 字号：Web 本屏每一笔 `g.font` 的字面量档位（20 与 15 两档不在 `fs` 表内） */
export const VI_TITLE_PX = 28;
export const VI_STAGE_PX = 16;
export const VI_FIRST_PX = 16;
export const VI_TICKET_PX = 16;
export const VI_ECHO_PX = 16;
export const VI_STARDUST_PX = 16;
export const VI_DROP_PX = 16;
export const VI_RANK_PX = 15;
export const VI_FRAME_PX = 16;
export const VI_FRAME_LEAK_PX = 12;
export const VI_BADGE_PX = 12;
export const VI_DOUBLE_PX = 15;
export const VI_MENU_PX = 15;

/** 星数行的顶缘（Web 的 `h * 0.3 + 58 - size + 4`，那个 `+4` 是裸微调） */
export function victoryStarTop(h: number): number {
  return h * VI_ANCHOR_RATIO + VI_STAR_DY - VI_STAR_SIZE + VI_STAR_TOP_NUDGE;
}

/**
 * 星数行矩形表（Web 的 `for (let i = 0; i < victoryStars; i++) draw(w/2 - totalW/2 + i*step, ...)`）。
 * 枚数就是 `stars`，整行居中；`stars <= 0` 时给出空表（Web 那一支整个 `if` 不进）。
 */
export function victoryStarSlots(w: number, h: number, stars: number): ViRect[] {
  const n = Math.max(0, Math.floor(stars));
  const step = VI_STAR_SIZE + VI_STAR_GAP;
  const totalW = n * step - VI_STAR_GAP;
  const top = victoryStarTop(h);
  const out: ViRect[] = [];
  for (let i = 0; i < n; i++) out.push({ x: w / 2 - totalW / 2 + i * step, y: top, w: VI_STAR_SIZE, h: VI_STAR_SIZE });
  return out;
}

/** 广告双倍钮矩形（Web 的 `{ x: w/2 − 95, y: h − 116, w: 190, h: 34 }`） */
export function victoryDoubleBtn(w: number, h: number): ViRect {
  return { x: w / 2 - VI_DOUBLE_DX, y: h - VI_DOUBLE_UP, w: VI_DOUBLE_W, h: VI_DOUBLE_H };
}

/** 返回菜单钮矩形（Web 的 `w/2 − 95, h − 62, 190, 44`；命中区与绘制框逐位同一） */
export function victoryMenuBtn(w: number, h: number): ViRect {
  return { x: w / 2 - VI_MENU_DX, y: h - VI_MENU_UP, w: VI_MENU_W, h: VI_MENU_H };
}

/**
 * 跟随文字宽度的前置图标（左上角锚）：Web 的
 * `w/2 - g.measureText(tTxt).width/2 - 20`，14×14。`textW` 由视图按**该行文案**量出。
 */
export function victoryIconRect(row: ViLeadRow, textW: number): ViRect {
  return { x: row.x - textW / 2 - row.gap, y: row.y, w: row.size, h: row.size };
}

/**
 * 跟随文字宽度的关卡框（**框心锚**）：Web 的 `drawAvatarFrame(g, assets, id, w/2 - tw/2 - 18, a + 204, 22)`，
 * 那个函数的 `(x, y)` 是框心、`box` 是边长，所以左上角要再减半个边长。
 */
export function victoryBadgeRect(row: ViLeadRow, textW: number): ViRect {
  const cx = row.x - textW / 2 - row.gap;
  return { x: cx - row.size / 2, y: row.y - row.size / 2, w: row.size, h: row.size };
}

/**
 * 框心那一行关卡号（Web `drawAvatarFrame` 内部的 `fillText(String(stageId), x, y + 4)`）：
 * 以框心为水平中心、基线在框心下方 `VI_FRAME_BADGE_TEXT_DY`，字号固定 `VI_BADGE_PX` 粗体
 * （Web 那里就是 `F(fs.micro, true)`）。入参是 `victoryBadgeRect` 折出来的框盒，故本出口
 * 仍然只吃几何，视图不产任何数字。
 */
export function victoryBadgeTextLine(badge: ViRect): ViTextLine {
  return { x: badge.x + badge.w / 2, baseY: badge.y + badge.h / 2 + VI_FRAME_BADGE_TEXT_DY, maxW: badge.w, px: VI_BADGE_PX, align: "center", bold: true };
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): ViTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。`forms` 是星数与双倍态两个入参（= Web 的 `victoryStars` 与 `!doubleClaimed`），
 * 本层不读存档、不查世界、不查关卡表。
 */
export function victoryLayout(w: number, h: number, forms: VictoryForms): VictoryLayout {
  const pad = ui.pad;
  const maxW = w - pad * 2;
  const a = h * VI_ANCHOR_RATIO;
  const cx = w / 2;
  const dbl = victoryDoubleBtn(w, h);
  const mb = victoryMenuBtn(w, h);
  const stars = Math.max(0, Math.floor(forms.stars));
  const step = VI_STAR_SIZE + VI_STAR_GAP;
  return {
    anchorY: a,
    banner: { x: cx - VI_BANNER_DX, y: a - VI_BANNER_DY, w: VI_BANNER_W, h: VI_BANNER_H },
    pose: { x: cx + VI_POSE_DX, y: a - VI_POSE_DY, w: VI_POSE_W, h: VI_POSE_H },
    title: line(cx, a, maxW, VI_TITLE_PX, true),
    stageLine: line(cx, a + VI_STAGE_DY, maxW, VI_STAGE_PX, false),
    starSlots: victoryStarSlots(w, h, stars),
    starRowW: stars > 0 ? stars * step - VI_STAR_GAP : 0,
    starStep: step,
    starText: line(cx, a + VI_STAR_DY, maxW, VI_STAR_TEXT_PX, true),
    firstLine: line(cx, a + VI_FIRST_DY, maxW, VI_FIRST_PX, false),
    ticketIcon: { x: cx, y: a + VI_TICKET_ICON_DY, size: VI_LEAD_ICON_SIZE, gap: VI_LEAD_ICON_GAP },
    ticketLine: line(cx, a + VI_TICKET_DY, maxW, VI_TICKET_PX, false),
    echoIcon: { x: cx, y: a + VI_ECHO_ICON_DY, size: VI_LEAD_ICON_SIZE, gap: VI_LEAD_ICON_GAP },
    echoLine: line(cx, a + VI_ECHO_DY, maxW, VI_ECHO_PX, false),
    stardustIcon: { x: cx, y: a + VI_STARDUST_ICON_DY, size: VI_LEAD_ICON_SIZE, gap: VI_LEAD_ICON_GAP },
    stardustLine: line(cx, a + VI_STARDUST_DY, maxW, VI_STARDUST_PX, false),
    dropLine: line(cx, a + VI_DROP_DY, maxW, VI_DROP_PX, false),
    rankLine: line(cx, a + VI_RANK_DY, maxW, VI_RANK_PX, true),
    frameBadge: { x: cx, y: a + VI_FRAME_BADGE_DY, size: VI_FRAME_BADGE_SIZE, gap: VI_FRAME_BADGE_GAP },
    frameLineFlat: line(cx, a + VI_FRAME_DY, maxW, VI_FRAME_PX, false),
    // 有图档：textAlign 被 drawAvatarFrame 复位成 left 后没再改回来，起笔就是屏心
    frameLineLeaked: { x: cx, baseY: a + VI_FRAME_DY, maxW: w - cx, px: VI_FRAME_LEAK_PX, align: "left", bold: true },
    badgeTextDy: VI_FRAME_BADGE_TEXT_DY,
    doubleBtn: dbl,
    doubleText: line(cx, dbl.y + VI_DOUBLE_TEXT_DY, maxW, VI_DOUBLE_PX, true),
    menuBtn: mb,
    menuText: line(cx, mb.y + VI_MENU_TEXT_DY, maxW, VI_MENU_PX, true),
    doubleBottomGap: h - (dbl.y + dbl.h),
    menuBottomGap: h - (mb.y + mb.h),
    stars,
    canDouble: forms.canDouble,
  };
}

/** 整屏几何的单一出口（视图经宿主钩子调它；星数与双倍态由入参给出，本层不读存档） */
export function victoryScreenLayout(w: number, h: number, forms: VictoryForms): VictoryLayout {
  return victoryLayout(w, h, forms);
}
