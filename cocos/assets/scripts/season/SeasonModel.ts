/**
 * 赛季结算屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawSeason`
 * 的文案侧(3847-3880)、`onSeasonClick`(4002-4007)、`closeSeason`(4009-4013)与
 * `syncSeason`(1096-1116)的分支侧抽取。
 *
 * 分工与前八屏同构:几何一律问共享层 `game/ui/seasonLayout.ts`,本文件只产"每处写什么文本、
 * 这一下该往存档写什么"。颜色档不在这里 —— 取表(`core/ViewTable.ts` 的 `phase4` 段,键前缀 `se`)。
 *
 * 三条纪律:
 *  ① 数值与判据一律走既有函数:到期判据走 `seasonEnded`、赛季分走 `seasonScore`、折算走
 *     `seasonStardust`、主题名走 `seasonTheme`、周期走 `SEASON_DAYS × DAY_MS`。本文件不重写
 *     任何一条规则,也不复制任何一张表;
 *  ② **本文件不写存档**:`seasonRoll()` 只返回一份增量描述,落 `stardust` / `seasonId` /
 *     `seasonStartAt` / `stageStars` / `seasonBest` 与 `persist()` 全在宿主 `GameShell`
 *     (`commitSeasonRoll`);
 *  ③ **时间是入参**:翻页判据的 `now` 形参默认 `Date.now()`,于是"赛季进行中 / 临近结束 /
 *     已翻页"三种时态都能钉死。本屏没有随机源,故签名里没有 `roll`。
 *
 * 四条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **写入发生在进屏前**:摘要由翻页那一笔算出,屏本身只是把已经落账的结果念一遍。
 *     贴底钮那一下(`closeSeason`)**不产生任何存档写入**,只清摘要并回主菜单;
 *  2. **离线跨多赛季只留最近一次摘要**:Web 的 `while` 循环每轮都覆写 `seasonSummary`,
 *     于是跨 N 个赛季时展示的是**最后一个已结束赛季**的摘要,而该轮的 `stageStars` 与
 *     `seasonBest` 在第一轮就被清零,所以那一笔分数与星尘都是 0(循环里 `stardustGain`
 *     逐轮累加,但除首轮外每轮加的都是 0);
 *  3. **摘要形态位在 Web 侧恒真**:Web 的进屏判据就是 `seasonSummary && state === "menu"`,
 *     `drawSeason` 里的 `if (s)` 是绘制层的防御分支。本层同样保留这一支(四行摘要整支收起),
 *     视图按 `content.hasSummary` 切容器 `active`;
 *  4. **屏上没有倒计时**:四行摘要念的是"已结算的账",没有任何随时间变的读数 —— 本屏
 *     不需要逐帧重排,也不挂在 `update` 的计时器上。
 */

import { DAY_MS, SEASON_DAYS, seasonEnded, seasonScore, seasonStardust } from "../game/data/season";
import { seasonTheme } from "../game/data/seasonSets";
import { SE_STARS_RESET, type SeasonLayout, type SeRect } from "../game/ui/seasonLayout";

/** 本屏要读与要写的存档字段(五项全部入档;摘要是会话态,不在这张表里) */
export interface SeasonSaveView {
  seasonId: number;
  seasonStartAt: number;
  stageStars: readonly number[];
  seasonBest: number;
  stardust: number;
}

/** 翻页摘要(= Web 的 `private seasonSummary`:**宿主持有的瞬时态,不入档**) */
export interface SeasonSummary {
  id: number;
  score: number;
  stardust: number;
}

/**
 * 一次到期翻页的写入意图。字段与 Web `syncSeason` 循环体的五笔一一对应:
 *  - `stardustGain` 累加到 `stardust`(跨多轮时首轮之外每轮加 0);
 *  - `seasonIdTo` / `seasonStartAtTo` 是循环结束后的终值(各推进 `rolls` 格);
 *  - `starsTo` 恒为共享层 `SE_STARS_RESET` 的一份拷贝、`seasonBestTo` 恒为 0;
 *  - `summary` 是最后一轮的摘要(Web 的"只保留最近一次")。
 */
export interface SeasonRollClaim {
  kind: "roll";
  persists: true;
  rolls: number;
  stardustGain: number;
  seasonIdTo: number;
  seasonStartAtTo: number;
  starsTo: number[];
  seasonBestTo: number;
  summary: SeasonSummary;
}

/**
 * 赛季到期结算翻页(纯)。未到 `SEASON_DAYS × DAY_MS` 整点返回 null;
 * 循环处理离线跨多个赛季的情况,与 Web 的 `while (seasonEnded(...))` 同构。
 */
export function seasonRoll(save: SeasonSaveView, now: number = Date.now()): SeasonRollClaim | null {
  if (!seasonEnded(save.seasonStartAt, now)) return null;
  let seasonId = save.seasonId;
  let startAt = save.seasonStartAt;
  let stars: readonly number[] = save.stageStars;
  let best = save.seasonBest;
  let stardustGain = 0;
  let rolls = 0;
  let summary: SeasonSummary = { id: seasonId, score: 0, stardust: 0 };
  while (seasonEnded(startAt, now)) {
    const score = seasonScore(stars, best);
    const dust = seasonStardust(score);
    stardustGain += dust;
    summary = { id: seasonId, score, stardust: dust };
    seasonId += 1;
    startAt += SEASON_DAYS * DAY_MS;
    stars = SE_STARS_RESET;
    best = 0;
    rolls += 1;
  }
  return {
    kind: "roll",
    persists: true,
    rolls,
    stardustGain,
    seasonIdTo: seasonId,
    seasonStartAtTo: startAt,
    starsTo: SE_STARS_RESET.slice(),
    seasonBestTo: 0,
    summary,
  };
}

/** 一屏文案(四行摘要在 `hasSummary` 为假时整支不上屏,字段仍给空串) */
export interface SeasonContent {
  title: string;
  hasSummary: boolean;
  /** `赛季 S{已完成赛季 id}「{主题名}」结束` */
  themeLine: string;
  /** `赛季分 {score}` */
  scoreLine: string;
  /** `星尘 +{dust}` */
  dustLine: string;
  noteLine: string;
  /** `进入赛季 {当前赛季 id}` —— 翻页后的那一号 */
  closeText: string;
}

/** 摘要 + 存档 → 一屏文案;摘要是唯一的内容源,本函数不查时间 */
export function buildSeasonContent(save: SeasonSaveView, summary: SeasonSummary | null, L: SeasonLayout): SeasonContent {
  return {
    title: "赛季结算",
    hasSummary: !!summary && L.summary,
    themeLine: summary ? `赛季 S${summary.id}「${seasonTheme(summary.id).name}」结束` : "",
    scoreLine: summary ? `赛季分 ${summary.score}` : "",
    dustLine: summary ? `星尘 +${summary.stardust}` : "",
    noteLine: "星数与赛季最佳已重置 · 关卡/收藏/天赋永久保留",
    closeText: `进入赛季 S${save.seasonId}`,
  };
}

/**
 * 热区:整屏只有贴底那一枚钮(Web onSeasonClick 只有 `seasonBtn` 一段,钮外一律吞掉,
 * 与"停在赛季屏时主菜单点击不会漏下去"同语义)。
 * 命中的那一下对应 Web `closeSeason`:清摘要 + 回主菜单,**不产生任何存档写入意图**,
 * 所以本文件不给它建 claim 类型 —— 唯一的写入意图是 `seasonRoll` 那一支。
 */
export type SeasonAction = { kind: "close" };

const inRect = (r: SeRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 命中判定(对标 Web onSeasonClick:钮外无热区) */
export function hitSeason(L: SeasonLayout, x: number, y: number): SeasonAction | null {
  if (inRect(L.closeBtn, x, y)) return { kind: "close" };
  return null;
}
