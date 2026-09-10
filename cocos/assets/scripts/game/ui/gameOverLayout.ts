/**
 * 死亡结算屏（阵亡）纯几何 —— Web `src/game.ts:drawGameOver`(4015-4113) 与
 * `handleTap` 的 gameover 分支(598-615) 的几何部分抽取，并按 `docs/UI-PIXEL-REFRESH.md`
 * §1/§9 的像素栅格重排。
 *
 * 单一出口：绘制与命中判定共读这一份矩形，宿主视图不产任何几何。
 *
 * **像素栅格档（本屏重排的口径，与 `seasonLayout` 同源）**：
 *  - 页边距 `GO_PAD = 16`、内容宽 `GO_CONTENT_W = 528`、右缘基准 544；Web 的 `ui.pad = 14`
 *    在本屏不再使用，居中文字限宽就是 `GO_CONTENT_W`；
 *  - module = 2（1 art px = 2 逻辑 px）：**坐标与尺寸一律偶数**。屏高先 `evenDown`，锚线
 *    `a = gameOverAnchorY(w, hh)`（内容块居中位，出口末了再 `evenDown` 落回栅格），屏心
 *    `cx = evenDown(w / 2)`，于是任何一档屏高都不掉出栅格；
 *  - 半宽一律**由宽度推导**（`GO_BANNER_DX = evenDown(GO_BANNER_W / 2)`、复活与双倍钮的
 *    `DX = W / 2`），不写第二份事实源；
 *  - **三钮行铺满内容带**：Web 的 `118 × 3 + 8 × 2 = 370` 半宽 185 会把 `bx` 推到奇数 95，
 *    这里改档成 `168 × 3 + 12 × 2 = 528` → `bx = GO_PAD = 16`、右缘 544，与主菜单的横贯带
 *    同一条基准线；
 *  - 热区下限 44：复活钮 32 → 44、双倍钮 34 → 44，钮内文字基线从裸 21 / 22 一并走到
 *    与其它钮同档的 28；三钮行本来就是 44 高，未动；
 *  - **本屏有屏底板**：`panel_dark_corners` 九宫格铺 `[16,16,528,hh−16]`（缺图时由 `Plate`
 *    自己的代码底板兜底，视图不另写形状）；
 *  - **留白等分成块顶与块底两道缝**：十处内容（横幅 / 立绘 / 标题 / 四行读数 / 复活钮 / 三钮行 /
 *    名次提示）是一整块，全挂 `a` 族；块顶 = 块内最高件（立绘顶缘 `a − GO_POSE_DY`），块底 =
 *    最低件（名次提示基线 + 半行距 `a + GO_BLOCK_BOT_DY`）。**块心对齐可落区中线**，可落区就是
 *    面板内缘与贴底双倍钮顶缘之间上下各让一道 `GO_BLOCK_INSET` 的区间，于是屏高富余等分成块顶
 *    与块底两道留白，面板下半部不再空着；`seamAboveButtons` 仍量三钮行底缘到双倍钮顶缘那道缝，
 *    屏内其余偏移全是常量，任何一档屏高都不会把富余挤进行距或钮高。
 *
 * 与 Web 同数的部分（几何族结构）：
 *  - 横幅 `banner_large_red`（art 120×24）绘制盒 **240×48 = 精确 2 倍**，整幅拉伸、没有回退分支；
 *    立绘 `player_pose_4` 同一笔之前把 `globalAlpha` 压到 0.5、之后复位 1（Web 这里唯一的
 *    半透明件，横向锚点是屏心左 196，也就是**压在横幅左侧**，盒区间 `[84, 142]` 与横幅
 *    `[160, 400]` 不相交）；
 *  - 四行读数与名次提示的基线偏移全是偶数常量，`by = a + 180` 是三钮行顶缘；
 *  - 双倍钮底边落 `hh − 72`。
 *
 * 形态位（`canRevive` / `canDouble`）由入参给出，本层不读存档、不查天赋：
 *  - `canRevive` 决定复活钮在不在（Web 的 `if (this.canRevive()) { this.reviveBtn = rb } else
 *    { this.reviveBtn = null }`，钮不在时热区同时消失）；几何层恒算出那一格矩形，
 *    取不取由视图按形态位切容器 `active`、命中按形态位短路；
 *  - `canDouble` **不改任何矩形**（Web 的 `doubleBtn` 无条件赋值，领取后钮还在、只是变灰），
 *    它只影响配色档与命中顺序里的 `!doubleClaimed` 前置。
 *
 * 文本带限宽（`maxW`）是 Cocos 侧的口径：Web 的 `fillText` 不限宽。本屏八处居中文字一律取
 * 内容带宽 `GO_CONTENT_W`，**包括三枚钮与复活 / 双倍钮内的文字** —— Web 那里 `看广告复活(剩余 1 次)`
 * 这一串比 220 的钮还宽、直接压出钮缘，若按钮宽限宽就会被 `fitOne` 补「…」，那是 Web 没有的
 * 裁字。起笔与基线不受 `maxW` 影响。
 *
 * 字号是 Web 写死的字面量：26 / 16 / 16 / 16 / 16 与 15 / 15 / 15 / 15 / 15，其中 26 与 15
 * 两档**不在 `fs` 表里**（`fs` 只有 28 / 22 / 16 / 14 / 13 / 12）。它们留在本层是因为文本行的
 * `px` 是几何签名的一部分，而共享层读不到宿主侧的 ViewTable；`tests/cocos-phase5-gameover.test.ts`
 * 把这两档与 `fs` 全表逐项锁开，防止有人把它们顺手「归到表上」而悄悄改掉与 Web 的像素差。
 *
 * 颜色、贴图键与替代字形这类纯表现项在 `core/ViewTable.ts` 的 `phase4` 段（键前缀 `go`）；
 * 本文件只留几何。
 */

/** 页边距 16 / 内容宽 528：右缘恒落 544（`ui.pad` 是 Web 冻结档 14，本屏不再用） */
export const GO_PAD = 16;
export const GO_CONTENT_W = 528;
/** 取偶下界：像素栅格 module = 2，奇数坐标会让贴图错半格 */
export const evenDown = (v: number): number => Math.floor(v / 2) * 2;

/** 左上原点设计像素矩形（与 core/DesignMetrics.Rect 同形；共享层不引宿主类型） */
export interface GoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本对齐，取值与 `ctx.textAlign` 一致 */
export type GoAlign = "left" | "center" | "right";

/** 一行文本的落位请求：x/baseY 就是 Web fillText 的锚点与基线，maxW 为限宽 */
export interface GoTextLine {
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: GoAlign;
  bold: boolean;
}

/** 两个形态位（都由宿主投影传入，本层不读存档、不查天赋） */
export interface GameOverForms {
  /** 复活钮在不在（Web 的 `canRevive()`：`reviveUsed < reviveLimit()`） */
  canRevive: boolean;
  /** 双倍还领不领得了（Web 的 `canDouble = !doubleClaimed`；矩形不随它变） */
  canDouble: boolean;
}

/** 整屏几何 */
export interface GameOverLayout extends GameOverForms {
  /** 屏底板（像素九宫格 panel_dark_corners 的落位矩形） */
  panel: GoRect;
  /** 屏底板贴图键 */
  panelKey: string;
  /** 内容块的纵向锚线（`gameOverAnchorY`：块心对可落区中线，十处实参都从它加减） */
  anchorY: number;
  /** 内容块的可落区（面板内缘与贴底双倍钮顶缘之间，上下各让一道 `GO_BLOCK_INSET`） */
  contentBand: GoRect;
  /** 内容块自身矩形（顶 = 立绘顶缘，底 = 名次提示基线 + 半行距） */
  block: GoRect;
  /** 标题横幅盒（`a` 上方 34，240×48 = `banner_large_red` 固有 120×24 的精确 2 倍；整幅拉伸，没有缺图回退档） */
  banner: GoRect;
  /** 阵亡立绘盒（`a` 上方 44，58×92；挂在屏心**左**侧，整屏唯一带半透明的贴图件） */
  pose: GoRect;
  /** 「阵亡」 */
  title: GoTextLine;
  /** 生存 / 波次·击杀 / 回响（或星尘） / 最佳纪录 四行读数 */
  timeLine: GoTextLine;
  waveLine: GoTextLine;
  echoLine: GoTextLine;
  bestLine: GoTextLine;
  /** 广告复活钮（`canRevive` 为假时整棵收起） */
  reviveBtn: GoRect;
  reviveText: GoTextLine;
  /** 三钮行：重开 / 天赋 / 菜单 */
  restartBtn: GoRect;
  prestigeBtn: GoRect;
  menuBtn: GoRect;
  restartText: GoTextLine;
  prestigeText: GoTextLine;
  menuText: GoTextLine;
  /** 幻影榜名次提示（矩形恒算，有没有内容看 `rankImprovedTo`） */
  rankLine: GoTextLine;
  /** 贴底的广告双倍钮（热区恒在，`canDouble` 只改配色与文字） */
  doubleBtn: GoRect;
  doubleText: GoTextLine;
  /** 三钮行步进（`bw + gap`） */
  btnStep: number;
  /** 三钮行总宽（`bw × 3 + gap × 2` = 内容宽 528） */
  btnRowW: number;
  /** 双倍钮底边相对屏底的下沉（顶缘 `hh − 116` + 高 44 → 底边 `hh − 72`） */
  doubleBottomGap: number;
  /** 呼吸缝：三钮行底缘到双倍钮顶缘的留白（内容块居中后它与块顶留白等分，**无硬上限**） */
  seamAboveButtons: number;
}

/* 内联几何常量（一律偶数；偏移列出处见文件头） */
/** 内容块可落区上下各让出的呼吸位（含义：块缘到面板内缘 / 到贴底双倍钮顶缘的最小留白；
 *  单位：设计 px；依据：与本屏页边距同一把尺，不引入第二个间距事实源；
 *  出处：`GO_PAD` 与 `gameOverDoubleBtn` 的 `hh − GO_DOUBLE_UP`） */
export const GO_BLOCK_INSET = GO_PAD;
/** 横幅：宽 / 高 / 半宽（**由宽推导**）/ 相对锚线的上抬 */
export const GO_BANNER_W = 240;
export const GO_BANNER_H = 48;
export const GO_BANNER_DX = evenDown(GO_BANNER_W / 2);
export const GO_BANNER_DY = 34;
/** 立绘：屏心左偏移（**正值表示挂在屏心左**，Web 的 `w / 2 − 196` 左上角）/ 宽 / 高 / 相对锚线的上抬 */
export const GO_POSE_DX = 196;
export const GO_POSE_W = 58;
export const GO_POSE_H = 92;
export const GO_POSE_DY = 44;
/** 四行读数相对锚线的基线偏移 */
export const GO_TIME_DY = 34;
export const GO_WAVE_DY = 56;
export const GO_ECHO_DY = 80;
export const GO_BEST_DY = 100;
/** 复活钮：宽（= 半宽推导的基准）/ 高（= 热区下限 44）/ 半宽 / 相对锚线的下沉 / 钮内文字基线 */
export const GO_REVIVE_W = 220;
export const GO_REVIVE_H = 44;
export const GO_REVIVE_DX = evenDown(GO_REVIVE_W / 2);
export const GO_REVIVE_DY = 124;
export const GO_REVIVE_TEXT_DY = 28;
/** 三钮行：宽 / 高 / 间距 / 相对锚线的下沉 / 钮内文字相对钮顶的基线
 *  （`168 × 3 + 12 × 2 = 528` 恰好铺满内容带，`bx` 因此落在页边距 16 上） */
export const GO_BTN_W = 168;
export const GO_BTN_H = 44;
export const GO_BTN_GAP = 12;
export const GO_BTN_DY = 180;
export const GO_BTN_TEXT_DY = 28;
/** 名次提示相对锚线的基线偏移（三钮行底缘 `a + 224` 之下，留 16 的行缝） */
export const GO_RANK_DY = 240;
/** 双倍钮：宽 / 高（= 热区下限 44）/ 半宽（**由宽推导**）/ 顶缘相对屏底的上抬 / 钮内文字基线 */
export const GO_DOUBLE_W = 220;
export const GO_DOUBLE_H = 44;
export const GO_DOUBLE_DX = evenDown(GO_DOUBLE_W / 2);
export const GO_DOUBLE_UP = 116;
export const GO_DOUBLE_TEXT_DY = 28;
/** 钮底板描边宽度（Web 本屏一处都不设 lineWidth，取全项目「描边后复位 1」的约定档） */
export const GO_BTN_STROKE_W = 1;
/** 字号：Web 十处 `g.font` 的字面量档位（26 / 15 两档不在 `fs` 表内） */
export const GO_TITLE_PX = 26;
export const GO_TIME_PX = 16;
export const GO_WAVE_PX = 16;
export const GO_ECHO_PX = 16;
export const GO_BEST_PX = 16;
export const GO_REVIVE_PX = 15;
export const GO_BTN_PX = 15;
export const GO_RANK_PX = 15;
export const GO_DOUBLE_PX = 15;
/** 立绘的透明度（Web 的 `g.globalAlpha = 0.5`；是几何签名的一部分故留在本层，视图按它设节点透明度） */
export const GO_POSE_ALPHA = 0.5;
/** 屏底板贴图键（与已落地各屏同一张九宫格） */
export const GO_PANEL_KEY = "panel_dark_corners";

/** 文本末行的半行距（与视图 `Txt` 的 `lineHeight = round(px × 1.25)` 同一档，取偶落回栅格） */
export const GO_LINE_HALF_DY = evenDown(Math.ceil((GO_RANK_PX * 1.25) / 2));
/** 内容块顶缘相对锚线的上抬（块内最高件 = 立绘顶缘，比横幅更高） */
export const GO_BLOCK_TOP_DY = Math.max(GO_BANNER_DY, GO_POSE_DY);
/** 内容块底缘相对锚线的下抬（块内最低件 = 名次提示基线 + 半行距） */
export const GO_BLOCK_BOT_DY = GO_RANK_DY + GO_LINE_HALF_DY;
/** 内容块高（本屏内容条数恒定，块高与屏高无关） */
export const GO_BLOCK_H = GO_BLOCK_TOP_DY + GO_BLOCK_BOT_DY;

/** 三钮行的左起笔（`evenDown(w/2) − btnRowW/2`，本档下就是页边距 16） */
export function gameOverRowX(w: number): number {
  return evenDown(w / 2) - (GO_BTN_W * 3 + GO_BTN_GAP * 2) / 2;
}

/** 广告复活钮矩形（`{ x: evenDown(w/2) − 110, y: 内容块锚线 + 124, w: 220, h: 44 }`） */
export function gameOverReviveBtn(w: number, h: number): GoRect {
  return { x: evenDown(w / 2) - GO_REVIVE_DX, y: gameOverAnchorY(w, h) + GO_REVIVE_DY, w: GO_REVIVE_W, h: GO_REVIVE_H };
}

/** 贴底的广告双倍钮（`{ x: evenDown(w/2) − 110, y: evenDown(h) − 116, w: 220, h: 44 }`） */
export function gameOverDoubleBtn(w: number, h: number): GoRect {
  return { x: evenDown(w / 2) - GO_DOUBLE_DX, y: evenDown(h) - GO_DOUBLE_UP, w: GO_DOUBLE_W, h: GO_DOUBLE_H };
}

/** 内容块的可落区（含义：屏底板内缘与贴底双倍钮顶缘之间、上下各让一道呼吸位的纵向区间；
 *  单位：设计 px；依据：块只能落在这道区间里，富余才会读成留白而不是没画完；
 *  出处：`GO_PAD` / `GO_BLOCK_INSET` 与 `gameOverDoubleBtn`） */
export function gameOverContentBand(w: number, h: number): GoRect {
  const hh = evenDown(h);
  const top = GO_PAD + GO_BLOCK_INSET;
  const bottom = gameOverDoubleBtn(w, hh).y - GO_BLOCK_INSET;
  return { x: GO_PAD, y: top, w: GO_CONTENT_W, h: Math.max(0, bottom - top) };
}

/** 内容块的纵向居中位（块心对可落区中线，再补回块顶抬量；屏高不够容纳块时贴可落区顶缘） */
export function gameOverAnchorY(w: number, h: number): number {
  const band = gameOverContentBand(w, h);
  return evenDown(band.y + Math.max(0, band.h - GO_BLOCK_H) / 2 + GO_BLOCK_TOP_DY);
}

function line(x: number, baseY: number, maxW: number, px: number, bold: boolean): GoTextLine {
  return { x, baseY, maxW, px, align: "center", bold };
}

/**
 * 整屏几何。`forms` 是两个形态位（= Web 的 `canRevive()` 与 `!doubleClaimed`），
 * 本层不读存档、不查天赋。
 *
 * 纵向全靠两条线：内容块的居中位 `a = gameOverAnchorY(w, hh)` 与贴底族的 `hh − 116`，
 * 以及屏底板 `[16, hh − 16]`。块高 `GO_BLOCK_H` 与屏高无关，屏高富余等分成块顶与块底两道
 * 留白（`seamAboveButtons` 量的是块底那道），于是 996 与 1246 两档之间所有矩形尺寸恒定、
 * 位置按族平移，不会掉出 2px 栅格。
 */
export function gameOverLayout(w: number, h: number, forms: GameOverForms): GameOverLayout {
  const hh = evenDown(h);
  const pad = GO_PAD;
  const maxW = GO_CONTENT_W;
  const a = gameOverAnchorY(w, hh);
  const cx = evenDown(w / 2);
  const rb = gameOverReviveBtn(w, hh);
  const dbl = gameOverDoubleBtn(w, hh);
  const bx = gameOverRowX(w);
  const by = a + GO_BTN_DY;
  const step = GO_BTN_W + GO_BTN_GAP;
  const band = gameOverContentBand(w, hh);
  return {
    panel: { x: pad, y: pad, w: GO_CONTENT_W, h: hh - pad * 2 },
    panelKey: GO_PANEL_KEY,
    anchorY: a,
    contentBand: band,
    block: { x: band.x, y: a - GO_BLOCK_TOP_DY, w: band.w, h: GO_BLOCK_H },
    banner: { x: cx - GO_BANNER_DX, y: a - GO_BANNER_DY, w: GO_BANNER_W, h: GO_BANNER_H },
    pose: { x: cx - GO_POSE_DX, y: a - GO_POSE_DY, w: GO_POSE_W, h: GO_POSE_H },
    title: line(cx, a, maxW, GO_TITLE_PX, true),
    timeLine: line(cx, a + GO_TIME_DY, maxW, GO_TIME_PX, false),
    waveLine: line(cx, a + GO_WAVE_DY, maxW, GO_WAVE_PX, false),
    // Web 这一行与星尘那一档共用同一笔 fillStyle 与 font，两档只差文案
    echoLine: line(cx, a + GO_ECHO_DY, maxW, GO_ECHO_PX, false),
    bestLine: line(cx, a + GO_BEST_DY, maxW, GO_BEST_PX, false),
    reviveBtn: rb,
    reviveText: line(cx, rb.y + GO_REVIVE_TEXT_DY, maxW, GO_REVIVE_PX, true),
    restartBtn: { x: bx, y: by, w: GO_BTN_W, h: GO_BTN_H },
    prestigeBtn: { x: bx + step, y: by, w: GO_BTN_W, h: GO_BTN_H },
    menuBtn: { x: bx + step * 2, y: by, w: GO_BTN_W, h: GO_BTN_H },
    restartText: line(bx + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    prestigeText: line(bx + step + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    menuText: line(bx + step * 2 + GO_BTN_W / 2, by + GO_BTN_TEXT_DY, maxW, GO_BTN_PX, true),
    rankLine: line(cx, a + GO_RANK_DY, maxW, GO_RANK_PX, true),
    doubleBtn: dbl,
    doubleText: line(cx, dbl.y + GO_DOUBLE_TEXT_DY, maxW, GO_DOUBLE_PX, true),
    btnStep: step,
    btnRowW: GO_BTN_W * 3 + GO_BTN_GAP * 2,
    doubleBottomGap: hh - (dbl.y + dbl.h),
    seamAboveButtons: dbl.y - (by + GO_BTN_H),
    canRevive: forms.canRevive,
    canDouble: forms.canDouble,
  };
}

/** 整屏几何的单一出口（视图经宿主钩子调它；形态位由入参给出，本层不读存档） */
export function gameOverScreenLayout(w: number, h: number, forms: GameOverForms): GameOverLayout {
  return gameOverLayout(w, h, forms);
}
