/**
 * 通关结算屏的纯几何 —— Web `src/game.ts:drawVictory`(3746-3849) 与 `handleTap` 的 victory
 * 分支(582-596) 的几何部分抽取，并按 `docs/UI-PIXEL-REFRESH.md` §1/§9 的像素栅格重排。
 *
 * 单一出口：绘制与命中判定共读这一份矩形，宿主视图不产任何几何。
 *
 * **像素栅格档（本屏重排的口径，与 `seasonLayout` 同源）**：
 *  - 页边距 `VI_PAD = 16`、内容宽 `VI_CONTENT_W = 528`、右缘基准 544；Web 的 `ui.pad = 14`
 *    在本屏不再使用，居中文字限宽就是 `VI_CONTENT_W`；
 *  - module = 2（1 art px = 2 逻辑 px）：**坐标与尺寸一律偶数**。屏高先 `evenDown`，锚线
 *    `a = evenDown(hh × 0.3)`，屏心 `cx = evenDown(w / 2)`，于是任何一档屏高都不掉出栅格；
 *  - 半宽一律**由宽度推导**（`VI_BANNER_DX = evenDown(VI_BANNER_W / 2)`、两枚钮的 `DX = W / 2`），
 *    不写第二份事实源；钮宽 190 → 220 就是为了让 `cx − DX` 落在偶数上；
 *  - 热区下限 44：双倍钮 34 → 44、钮内文字基线随之从裸 22 走到与其它钮同档的 28；
 *  - **本屏有屏底板**：`panel_dark_corners` 九宫格铺 `[16,16,528,hh−16]`（缺图时由 `Plate`
 *    自己的代码底板兜底，视图不另写形状），返回钮底边就落在这块板的下边 `hh − VI_PAD`；
 *  - **留白只落在一条呼吸缝**：两枚贴底钮是贴底族（随 `hh` 平移）、十一处文字与贴图是锚线族
 *    （随 `a` 平移），两族之间那条缝 `seamAboveButtons` 就是唯一的吸余体，它没有硬上限；
 *    屏内其余偏移全是常量，任何一档屏高都不会把富余挤进行距或钮高。
 *
 * 与 Web 同数的部分（几何族结构）：
 *  - **整屏两条锚线族**：横幅 / 标题 / 关卡行 / 星数行 / 首通行 / 券·回响·星尘三行 / 掉落行 /
 *    名次提示 / 关卡框行十一处从 `a` 加减；双倍钮顶缘 `hh − 116`、返回钮顶缘 `hh − 60`
 *    两枚贴底钮从 `hh` 加减，两钮之间 12 的缝就是列间距档；
 *  - 横幅 `banner_large_navy_a`（art 120×24）绘制盒 **240×48 = 精确 2 倍**，整幅拉伸、
 *    没有回退分支；立绘 `player_pose_1` 挂在屏心**右**侧（`cx + 132`），与死亡屏那枚
 *    挂在左侧方向相反 —— 本层的 `VI_POSE_DX` 因此是**正值表示右挂**，盒区间 `[412, 470]`
 *    与横幅 `[160, 400]` 在两档屏高下都不相交；本屏没有半透明贴图件；
 *  - 星数行是三枚 24×24 的横排（Web 的 22 + 6 步进在偶数栅格上会把整行推成奇数，这里改成
 *    24 + 8 → 步进 32，`totalW ∈ {24,56,88}` 的半宽都是偶数），顶缘 `a + 58 − size + 4`
 *    的公式与 Web 逐字同式（Web 那个 `+4` 是裸微调，原样保留）；这一族的盒数随 `stars` 变，
 *    是**本层唯一一个随内容变的几何**，所以 `stars` 是布局入参而不是形态位；
 *  - 三行奖励文字各带一枚前置图标（`icon_ticket` / `icon_echo` / `icon_stardust`，16×16），
 *    图标的横向位置是 **`屏心 − 量字宽/2 − 20`**：Web 用的是 `g.measureText(该行文案).width`。
 *    量字发生在宿主视图（`ui/PanelKit.approxW`，系数走 `viewTable().hud`），本层只给
 *    「行锚点 + 图标边长 + 间距」，由 `victoryIconRect(row, textW)` 折成矩形，折出来再 `evenDown`；
 *  - 关卡框行同理，但 `drawAvatarFrame` 的锚点是**框心**而不是左上角，且边长 24、间距 18，
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
 * 文本带限宽（`maxW`）是 Cocos 侧的口径：Web 的 `fillText` 不限宽。本屏居中文字一律取内容带宽
 * `VI_CONTENT_W`，**包括两枚钮内的文字**（Web 那里「广告 ×2 回响」按 15px 比 190 的钮窄，
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

/** 页边距 16 / 内容宽 528：右缘恒落 544（`ui.pad` 是 Web 冻结档 14，本屏不再用） */
export const VI_PAD = 16;
export const VI_CONTENT_W = 528;
/** 取偶下界：像素栅格 module = 2，奇数坐标会让贴图错半格 */
export const evenDown = (v: number): number => Math.floor(v / 2) * 2;

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
  /** 屏底板（像素九宫格 panel_dark_corners 的落位矩形） */
  panel: ViRect;
  /** 屏底板贴图键 */
  panelKey: string;
  /** 全屏唯一的纵向锚线（`evenDown(hh × 0.3)`，十一处实参都从它加减） */
  anchorY: number;
  /** 标题横幅盒（`a` 上方 34，240×48 = `banner_large_navy_a` 固有 120×24 的精确 2 倍；整幅拉伸，没有缺图回退档） */
  banner: ViRect;
  /** 通关立绘盒（`a` 上方 44，58×92；挂在屏心**右**侧，本屏没有半透明贴图件） */
  pose: ViRect;
  /** 「通关!」 */
  title: ViTextLine;
  /** `第N关 · 关名`（Web 的 `if (st)` 分支，无尽局没有） */
  stageLine: ViTextLine;
  /** 星数行：每枚一格，长度 = `stars`（Web 的 `if (victoryStars > 0)` 那一支） */
  starSlots: ViRect[];
  /** 星数行的总宽（`stars × step − gap`） */
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
  /** 关卡框行的前置框（框心锚，24 见方，间距 18） */
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
  /** 贴底的返回菜单钮（本屏唯一的非广告出口，底边落 `hh − VI_PAD`） */
  menuBtn: ViRect;
  menuText: ViTextLine;
  /** 双倍钮底边相对屏底的下沉（顶缘 `hh − 116` + 高 44 → 底边 `hh − 72`） */
  doubleBottomGap: number;
  /** 返回钮底边相对屏底的下沉（顶缘 `hh − 60` + 高 44 → 底边 `hh − 16` = 屏底板下缘） */
  menuBottomGap: number;
  /** 两枚贴底钮之间的缝（`menuBtn.y − 双倍钮底缘`，就是列间距档 12） */
  btnStackGap: number;
  /** 呼吸缝：末行文字基线（`a + VI_FRAME_DY`）到双倍钮顶缘的留白，**本屏唯一的吸余体，无硬上限** */
  seamAboveButtons: number;
}

/* 内联几何常量（一律偶数；偏移列出处见文件头） */
/** 全屏纵向锚线相对屏高的比例 */
export const VI_ANCHOR_RATIO = 0.3;
/** 横幅：宽 / 高 / 半宽（**由宽推导**）/ 相对锚线的上抬 */
export const VI_BANNER_W = 240;
export const VI_BANNER_H = 48;
export const VI_BANNER_DX = evenDown(VI_BANNER_W / 2);
export const VI_BANNER_DY = 34;
/** 立绘：**正值表示挂在屏心右侧**（Web 的 `w / 2 + 132` 左上角）/ 宽 / 高 / 相对锚线的上抬 */
export const VI_POSE_DX = 132;
export const VI_POSE_W = 58;
export const VI_POSE_H = 92;
export const VI_POSE_DY = 44;
/** 关卡行相对锚线的基线偏移 */
export const VI_STAGE_DY = 34;
/** 星数行：边长 / 间距 / 步进用的行锚 / 贴图盒顶缘的裸微调 / 最多三枚
 *  （24 + 8 而非 Web 的 22 + 6：`totalW` 的半宽必须是偶数，否则整行居中会推出奇数 `x`） */
export const VI_STAR_SIZE = 24;
export const VI_STAR_GAP = 8;
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
export const VI_LEAD_ICON_SIZE = 16;
export const VI_LEAD_ICON_GAP = 20;
/** 掉落行相对锚线的基线偏移 */
export const VI_DROP_DY = 170;
/** 名次提示相对锚线的基线偏移 */
export const VI_RANK_DY = 192;
/** 关卡框行：文字基线偏移 / 框心偏移 / 框边长 / 与文字左缘的间距（Web 的 `- 18`）/ 框心数字下沉 */
export const VI_FRAME_DY = 210;
export const VI_FRAME_BADGE_DY = 204;
export const VI_FRAME_BADGE_SIZE = 24;
export const VI_FRAME_BADGE_GAP = 18;
export const VI_FRAME_BADGE_TEXT_DY = 4;
/** 双倍钮：宽 / 高（= 热区下限 44）/ 半宽（**由宽推导**）/ 顶缘相对屏底的上抬 / 钮内文字相对钮顶的基线 */
export const VI_DOUBLE_W = 220;
export const VI_DOUBLE_H = 44;
export const VI_DOUBLE_DX = evenDown(VI_DOUBLE_W / 2);
export const VI_DOUBLE_UP = 116;
export const VI_DOUBLE_TEXT_DY = 28;
/** 返回钮：宽 / 高 / 半宽（**由宽推导**）/ 顶缘相对屏底的上抬（底边落 `hh − VI_PAD`）/ 钮内文字基线 */
export const VI_MENU_W = 220;
export const VI_MENU_H = 44;
export const VI_MENU_DX = evenDown(VI_MENU_W / 2);
export const VI_MENU_UP = 60;
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
/** 屏底板贴图键（与已落地各屏同一张九宫格） */
export const VI_PANEL_KEY = "panel_dark_corners";

/** 星数行的顶缘（Web 的 `h * 0.3 + 58 - size + 4`，那个 `+4` 是裸微调） */
export function victoryStarTop(h: number): number {
  return h * VI_ANCHOR_RATIO + VI_STAR_DY - VI_STAR_SIZE + VI_STAR_TOP_NUDGE;
}

/**
 * 星数行矩形表（Web 的 `for (let i = 0; i < victoryStars; i++) draw(w/2 - totalW/2 + i*step, ...)`）。
 * 枚数就是 `stars`，整行居中；`stars <= 0` 时给出空表（Web 那一支整个 `if` 不进）。
 * 屏心先 `evenDown`，`totalW` 的半宽在 `VI_STAR_SIZE / VI_STAR_GAP` 这一档下恒为偶数，
 * 所以每一枚的 `x` 都落在 2px 栅格上。
 */
export function victoryStarSlots(w: number, h: number, stars: number): ViRect[] {
  const n = Math.max(0, Math.floor(stars));
  const step = VI_STAR_SIZE + VI_STAR_GAP;
  const totalW = n * step - VI_STAR_GAP;
  const top = evenDown(victoryStarTop(evenDown(h)));
  const cx = evenDown(w / 2);
  const out: ViRect[] = [];
  for (let i = 0; i < n; i++) out.push({ x: cx - totalW / 2 + i * step, y: top, w: VI_STAR_SIZE, h: VI_STAR_SIZE });
  return out;
}

/** 广告双倍钮矩形（`{ x: evenDown(w/2) − 110, y: evenDown(h) − 116, w: 220, h: 44 }`） */
export function victoryDoubleBtn(w: number, h: number): ViRect {
  return { x: evenDown(w / 2) - VI_DOUBLE_DX, y: evenDown(h) - VI_DOUBLE_UP, w: VI_DOUBLE_W, h: VI_DOUBLE_H };
}

/** 返回菜单钮矩形（顶缘 `evenDown(h) − 60`、高 44 → 底边落 `evenDown(h) − 16`；命中区与绘制框逐位同一） */
export function victoryMenuBtn(w: number, h: number): ViRect {
  return { x: evenDown(w / 2) - VI_MENU_DX, y: evenDown(h) - VI_MENU_UP, w: VI_MENU_W, h: VI_MENU_H };
}

/**
 * 跟随文字宽度的前置图标（左上角锚）：Web 的
 * `w/2 - g.measureText(tTxt).width/2 - 20`，16×16。`textW` 由视图按**该行文案**量出，
 * 量出来的是任意实数，故折出的 `x` 再 `evenDown` 收一次（贴图不能错半格）。
 */
export function victoryIconRect(row: ViLeadRow, textW: number): ViRect {
  return { x: evenDown(row.x - textW / 2 - row.gap), y: row.y, w: row.size, h: row.size };
}

/**
 * 跟随文字宽度的关卡框（**框心锚**）：Web 的 `drawAvatarFrame(g, assets, id, w/2 - tw/2 - 18, a + 204, 22)`，
 * 那个函数的 `(x, y)` 是框心、`box` 是边长，所以左上角要再减半个边长。
 * 框心先 `evenDown`，边长为偶数 → 左上角与框心数字的落位都仍在栅格上。
 */
export function victoryBadgeRect(row: ViLeadRow, textW: number): ViRect {
  const cx = evenDown(row.x - textW / 2 - row.gap);
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
 *
 * 纵向全靠三条线：`a = evenDown(hh × 0.3)` 的锚线族、`hh − 116` / `hh − 60` 的贴底族，
 * 以及屏底板 `[16, hh − 16]`。两族之间那条 `seamAboveButtons` 是唯一的吸余体，
 * 于是 996 与 1246 两档之间所有矩形尺寸恒定、位置按族平移，不会掉出 2px 栅格。
 */
export function victoryLayout(w: number, h: number, forms: VictoryForms): VictoryLayout {
  const hh = evenDown(h);
  const pad = VI_PAD;
  const maxW = VI_CONTENT_W;
  const a = evenDown(hh * VI_ANCHOR_RATIO);
  const cx = evenDown(w / 2);
  const dbl = victoryDoubleBtn(w, hh);
  const mb = victoryMenuBtn(w, hh);
  const stars = Math.max(0, Math.floor(forms.stars));
  const step = VI_STAR_SIZE + VI_STAR_GAP;
  return {
    panel: { x: pad, y: pad, w: VI_CONTENT_W, h: hh - pad * 2 },
    panelKey: VI_PANEL_KEY,
    anchorY: a,
    banner: { x: cx - VI_BANNER_DX, y: a - VI_BANNER_DY, w: VI_BANNER_W, h: VI_BANNER_H },
    pose: { x: cx + VI_POSE_DX, y: a - VI_POSE_DY, w: VI_POSE_W, h: VI_POSE_H },
    title: line(cx, a, maxW, VI_TITLE_PX, true),
    stageLine: line(cx, a + VI_STAGE_DY, maxW, VI_STAGE_PX, false),
    starSlots: victoryStarSlots(w, hh, stars),
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
    doubleBottomGap: hh - (dbl.y + dbl.h),
    menuBottomGap: hh - (mb.y + mb.h),
    btnStackGap: mb.y - (dbl.y + dbl.h),
    seamAboveButtons: dbl.y - (a + VI_FRAME_DY),
    stars,
    canDouble: forms.canDouble,
  };
}

/** 整屏几何的单一出口（视图经宿主钩子调它；星数与双倍态由入参给出，本层不读存档） */
export function victoryScreenLayout(w: number, h: number, forms: VictoryForms): VictoryLayout {
  return victoryLayout(w, h, forms);
}
