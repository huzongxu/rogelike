/**
 * 每日福利屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawDaily`
 * 的文案侧与 `onDailyClick` 的分支侧抽取。
 *
 * 分工与 Phase 3 三屏、Phase 4 排行屏同构:几何一律问共享层 `game/ui/dailyLayout.ts`,
 * 本文件只产"每行写什么、是领过没领过、右文三态取哪一档",外加命中判定与**写入意图**。
 *
 * 三条纪律:
 *  ① 每日规则一律走共享层既有函数(`dailyBoxOf` / `dailyTalentOf` / `DAILY_TALENT_FREE` /
 *     `todayKey` / `makeUpReward` / `splitEcho`),本文件不复制判据;
 *  ② **本文件不写存档**:`dailyClaim()` 只返回一份增量描述(`DailyClaim`),真正落字段与
 *     `persist()` 由宿主 `GameShell` 做,激励视频也只在宿主那一侧发起;
 *  ③ 时间是入参:`buildDailyContent` / `hitDaily` / `dailyClaim` 都收 `now`(ms),
 *     默认值才落 `Date.now()`,于是跨天与补领三态可以在 node 侧钉死而不依赖真实当天。
 *
 * 天赋右文的门控是**已领条数**(`dailyTalentClaimed.length < DAILY_TALENT_FREE`),
 * 不是这一行在列表里的下标 —— Web drawDaily/onDailyClick 两处都是这个口径,这里保持一致。
 */

import { DAILY_BOXES, DAILY_TALENT_FREE, dailyBoxOf, dailyTalentOf, todayKey } from "../game/data/daily";
import { makeUpReward, splitEcho } from "../game/data/stages";
import { dailyLayout, type DailyLayout, type DailyRect } from "../game/ui/dailyLayout";

/** 本屏要读的存档字段(SaveModel 结构上天然兼容;`dailyTalents` 允许缺失,按 0 条处理) */
export interface DailySaveView {
  diamond: number;
  adWatchCount: number;
  dailyBoxClaimed: readonly string[];
  dailyTalentClaimed: readonly string[];
  dailyTalents?: readonly string[];
  makeUpDate: string;
  dailyClearedDate: string;
  /** 补领奖励的口径基准(Web `makeUpReward(this.save.highestStage)`) */
  highestStage: number;
}

/** 一行内容(宝箱行与天赋行同形):claimed 决定配色档与右文 */
export interface DailyRowContent {
  id: string;
  name: string;
  desc: string;
  statusText: string;
  claimed: boolean;
}

/** 补领行三态:今日已补领 / 今日已首通 / 仍可补领 */
export type DailyMakeUpState = "madeUp" | "cleared" | "open";

export interface DailyMakeUpContent {
  title: string;
  desc: string;
  statusText: string;
  state: DailyMakeUpState;
  /** `!madeUp && !cleared` —— 唯一能发起广告领取的档位 */
  claimable: boolean;
}

/** 一屏文案 */
export interface DailyContent {
  title: string;
  /** 资源行正文(缺图时由视图前置替代字形,与 Web iconText 同分工) */
  resText: string;
  boxLabel: string;
  talentLabel: string;
  boxes: DailyRowContent[];
  talents: DailyRowContent[];
  /** 已领天赋条数(Web 的 `claimedCount`,右文与命中门控共读) */
  talentClaimedCount: number;
  makeUp: DailyMakeUpContent;
  backText: string;
}

/** 一次点击落到的热区(`free` = 这一档天赋不必看广告,由已领条数门控) */
export type DailyAction =
  | { kind: "back" }
  | { kind: "claimBox"; id: string }
  | { kind: "claimTalent"; id: string; free: boolean }
  | { kind: "claimMakeUp" };

/**
 * 写入意图:宿主照着它逐字段落账。模型只描述"该加多少、该追加哪个 id",
 * 不持有存档引用,于是同一份意图可以被测试冻结比对。
 */
export interface DailyClaim {
  /** 是否要先看完一次激励视频(免费档天赋为 false;宝箱与补领恒 true) */
  needsAd: boolean;
  /** 加法式增量(宿主 `save.x += claim.x`) */
  gachaTicket: number;
  stardust: number;
  diamond: number;
  points: number;
  dayEcho: number;
  /** 追加进 `dailyBoxClaimed` 的 id(null = 不追加) */
  boxClaim: string | null;
  /** 追加进 `dailyTalentClaimed` 的 id(null = 不追加) */
  talentClaim: string | null;
  /** 补领:同时写 `dailyClearedDate` / `dailyClearedStage` / `makeUpDate`(其余动作为 null) */
  makeUp: { date: string; stageId: number } | null;
}

const inRect = (r: DailyRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 天赋右文三态(Web drawDaily:已领 → ✓,否则按已领条数分免费/广告) */
function talentStatus(claimed: boolean, claimedCount: number): string {
  if (claimed) return "✓ 已领取";
  return claimedCount < DAILY_TALENT_FREE ? "免费领取" : "▶ 广告解锁";
}

/** 存档 → 一屏文案。行数由 `dailyTalents` 决定(缺失按 0 条),与 layout 同源 */
export function buildDailyContent(save: DailySaveView, now: number = Date.now()): DailyContent {
  const talents = save.dailyTalents ?? [];
  const claimedCount = save.dailyTalentClaimed.length;
  const today = todayKey(now);
  const madeUp = save.makeUpDate === today;
  const cleared = save.dailyClearedDate === today;
  return {
    title: "每日福利(广告驱动)",
    resText: `钻石 ${save.diamond} · 今日广告 ${save.adWatchCount} 次`,
    boxLabel: "每日宝箱(各看广告开启)",
    talentLabel: "每日天赋(数值墙工具 · 当日有效)",
    boxes: DAILY_BOXES.map((b) => {
      const claimed = save.dailyBoxClaimed.includes(b.id);
      return { id: b.id, name: b.name, desc: b.desc, statusText: claimed ? "✓ 已领取" : "▶ 广告开启", claimed };
    }),
    talents: talents.map((id) => {
      const t = dailyTalentOf(id);
      const claimed = save.dailyTalentClaimed.includes(id);
      return { id, name: t.name, desc: t.desc, statusText: talentStatus(claimed, claimedCount), claimed };
    }),
    talentClaimedCount: claimedCount,
    makeUp: {
      title: "首通补领",
      desc: "今日没空打首通 · 看广告领同口径奖励(每日 1 次)",
      statusText: madeUp ? "✓ 已补领" : cleared ? "✓ 已首通" : "▶ 看广告领取",
      state: madeUp ? "madeUp" : cleared ? "cleared" : "open",
      claimable: !madeUp && !cleared,
    },
    backText: "返回",
  };
}

/**
 * 命中判定(对标 Web onDailyClick 的四段顺序:返回钮 → 补领行 → 宝箱行 → 天赋行)。
 * 已领取的行不产动作(Web 在那里直接 return),于是"点了没反应"与 Web 同语义。
 */
export function hitDaily(L: DailyLayout, c: DailyContent, x: number, y: number): DailyAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  if (inRect(L.makeUpRow.rect, x, y)) return c.makeUp.claimable ? { kind: "claimMakeUp" } : null;
  for (const row of L.boxRows) {
    if (!inRect(row.rect, x, y)) continue;
    const rc = c.boxes[row.index];
    return rc && !rc.claimed ? { kind: "claimBox", id: row.id } : null;
  }
  for (const row of L.talentRows) {
    if (!inRect(row.rect, x, y)) continue;
    const rc = c.talents[row.index];
    return rc && !rc.claimed ? { kind: "claimTalent", id: row.id, free: c.talentClaimedCount < DAILY_TALENT_FREE } : null;
  }
  return null;
}

/**
 * 动作 → 写入意图(纯)。已领取 / 不可补领一律 null,与 `hitDaily` 的静默同口径。
 * 补领的奖励口径与 Web 完全一致:`makeUpReward(highestStage)` 的券照发,回响按
 * `splitEcho` 拆成永久与当日两份,并把当日首通标记一起写上(当日首通视为已消耗)。
 */
export function dailyClaim(save: DailySaveView, a: DailyAction, now: number = Date.now()): DailyClaim | null {
  const none = { gachaTicket: 0, stardust: 0, diamond: 0, points: 0, dayEcho: 0, boxClaim: null, talentClaim: null, makeUp: null };
  switch (a.kind) {
    case "back":
      return null;
    case "claimBox": {
      if (save.dailyBoxClaimed.includes(a.id)) return null;
      const box = dailyBoxOf(a.id);
      return { ...none, needsAd: true, gachaTicket: box.tickets, stardust: box.stardust, diamond: box.diamond, boxClaim: box.id };
    }
    case "claimTalent": {
      if (save.dailyTalentClaimed.includes(a.id)) return null;
      return { ...none, needsAd: save.dailyTalentClaimed.length >= DAILY_TALENT_FREE, talentClaim: a.id };
    }
    case "claimMakeUp": {
      const today = todayKey(now);
      if (save.makeUpDate === today || save.dailyClearedDate === today) return null;
      const rw = makeUpReward(save.highestStage);
      const { permanent, day } = splitEcho(rw.echo);
      return { ...none, needsAd: true, gachaTicket: rw.tickets, points: permanent, dayEcho: day, makeUp: { date: today, stageId: rw.stageId } };
    }
  }
}

/** 整屏几何的单一出口(视图经宿主钩子调它;天赋条数取存档,缺失按 0 条) */
export function dailyScreenLayout(w: number, h: number, save: Pick<DailySaveView, "dailyTalents">): DailyLayout {
  return dailyLayout(w, h, save.dailyTalents ?? []);
}
