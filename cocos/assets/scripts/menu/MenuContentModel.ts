/**
 * 主菜单的**内容构建与点击判定**(纯逻辑,cc-free)。
 *
 * 存在理由:布局台(?lab=1)与玩家版必须看到同一张画面。几何早已由
 * `game/ui/menuLayout.ts:menuLayoutPure()` 单一出口给出,剩下的"每行写什么、哪行能点、
 * 哪儿亮红点"过去散在 GameShell 里,只在布局台跑过占位数据。本模块把它抽成一份
 * **存档驱动**的纯函数,于是两端调的是同一个 `buildMenuContent()`。
 *
 * 三条纪律:
 *  ① 一切状态判定读共享层既有函数(解锁 = `stageUnlocked`,补星 = `canStarMakeup`,
 *     门槛章 = `stageUnlockNeed`,徽章框 = `frameQualityForStage`),本文件不复制判据;
 *  ② 点击热区与绘制热区同源于 `menuLayoutPure` 产物 —— `hitMenu()` 的分支顺序
 *     对标 Web `onMenuClick`,补星钮在行热区之内优先;
 *  ③ 时间是入参(红点与赛季第几天都吃 `now`),本文件永不读 Date.now()。
 */

import type { SetId } from "../game/data/sets";
import { releasedSets, setDef } from "../game/data/sets";
import type { HeroId } from "../game/data/heroes";
import { showcaseHero } from "../game/data/heroes";
import { SET_STARTERS } from "../game/data/equipmentGen";
import { seasonTheme, setMutation } from "../game/data/seasonSets";
import { CHAPTERS_PER_STAGE, STAGE_UNLOCK_PROGRESS, stageOf } from "../game/data/stages";
import {
  canStarMakeup,
  SEASON_DAYS,
  seasonDay,
  seasonScore,
  STAR_MAKEUP_COST,
  stageUnlockNeed,
  stageUnlocked,
} from "../game/data/season";
import { phantomBoard, rankAmong } from "../game/data/leaderboard";
import { DAILY_BOXES, ENERGY_MAX } from "../game/data/daily";
import { COMMISSION_READY_HOURS, type CommissionState } from "../game/data/commissions";
import { frameQualityForStage } from "../game/data/quality";
import type { MenuLayout, MenuRect } from "../game/ui/menuLayout";

/** 每行需要宿主给的文字与状态;几何仍由视图按表算 */
export interface MenuRowContent {
  id: number;
  name: string;
  /** 副题全串(= sub + tail);Web 与文案对账读这一条 */
  desc: string;
  /** 行中部副题(不含右尾列) */
  sub: string;
  /** 行右尾列:"· N 章 · Boss" 那一段(与 desc 尾部同一字面量,只是换个落位) */
  tail: string;
  /** 头像徽章资产键(品质框);null = 走代码圆/方块回退 */
  badgeKey: string | null;
  badgeText: string;
  /** 当前可挑战（选中指针或未通关的首道解锁关）；只作内容事实，行板高亮读 `unlocked` */
  current: boolean;
  /** 该行是否显示补星钮(决定右列避让与 makeupRect) */
  makeup: boolean;
  /** 补星钮文案(含钻石价);仅 makeup 为真时绘制 */
  makeupText: string;
  /** 未解锁:整行减淡且点击不进入关卡 */
  unlocked: boolean;
  /** 已通关(id < highestStage):行板回落常态板 */
  cleared: boolean;
}

/** 宿主注入的文案与开关;布局台与玩家版共用同一份构建结果 */
export interface MenuTextContent {
  title: string;
  seasonLine: string;
  energyLine: string;
  /** 三枚货币筹码:图标键 + 文案 */
  chips: { iconKey: string; text: string }[];
  phantomText: string;
  sectionText: string;
  rows: MenuRowContent[];
  /** 六个场外入口:底板键 + 图标键 + 文案(顺序即列序,同 MENU_ENTRY_IDS) */
  entries: { plateKey: string; iconKey: string; label: string }[];
  endlessText: string;
  heroLines: string[];
  heroBtnText: string;
  /** 出战英雄主色(展示带描边/强调文字);null = 未选出战 */
  accent: string | null;
  noteLines: string[];
  /** 每日入口是否亮红点(还有未领的宝箱) */
  showDot: boolean;
  /** 委托入口是否亮红点(委托已完成待领取) */
  showCommissionDot: boolean;
  /** 当前出战套组(金星标只画在这张卡上) */
  selectedSet: SetId | null;
}

/** 存档侧本模块只读这些字段(SaveModel 结构上天然兼容) */
export interface MenuSaveView {
  points: number;
  stardust: number;
  diamond: number;
  energy: number;
  gachaTicket: number;
  highestStage: number;
  stageFurthest: Record<number, number>;
  stageStars: number[];
  seasonId: number;
  seasonStartAt: number;
  seasonBest: number;
  selectedHero: HeroId | null;
  selectedSet: SetId | null;
  dailyBoxClaimed: string[];
  commission: CommissionState | null;
  commission2: CommissionState | null;
  premiumPass: boolean;
  premiumPassSeason: number;
}

/** buildMenuContent 的输入:存档 + 时钟 + 战场上那一关(高亮当前行用) */
export interface MenuContentInput {
  save: MenuSaveView;
  /** 毫秒时间戳(红点、赛季第几天都读它) */
  now: number;
  /** 战斗屏当前关卡 id;null = 无限关或未开局 */
  currentStageId: number | null;
  /** 参与排布的关卡 id(与视图 setEnv 同一份,行序即此序) */
  stageIds: number[];
}

/** 场外入口身份(顺序与 menuLayoutPure 的六钮一致) */
export type MenuEntryId = "commission" | "gacha" | "talent" | "pass" | "daily" | "gearup";

/** 一次点击落到的热区;宿主只负责把它翻译成动作,判定几何不在宿主重算 */
export type MenuAction =
  | { kind: "stage"; id: number }
  | { kind: "makeup"; id: number }
  | { kind: "endless" }
  | { kind: "hero" }
  | { kind: "phantom" }
  | { kind: "entry"; entry: MenuEntryId }
  | { kind: "chip"; index: number };

/** 关卡行的一行状态:视图与点击判定共读,避免"画的能点、显示的不一样" */
export interface MenuRowState {
  id: number;
  unlocked: boolean;
  cleared: boolean;
  stars: number;
  makeup: boolean;
}

const inRect = (r: MenuRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 入口顺序:与 menuEntryRects /视图 entries 三者同序 */
export const MENU_ENTRY_IDS: readonly MenuEntryId[] = ["commission", "gacha", "talent", "pass", "daily", "gearup"];

/** 关卡是否解锁(进度制:通关前关,或前关打到 STAGE_UNLOCK_PROGRESS 比例章节) */
export function menuStageOpen(save: MenuSaveView, id: number): boolean {
  if (id <= 1) return true;
  const furthestPrev = save.stageFurthest[id - 1] ?? 0;
  return stageUnlocked(id, save.highestStage, furthestPrev, CHAPTERS_PER_STAGE, STAGE_UNLOCK_PROGRESS);
}

/** 逐行状态:解锁门控 + 通关 + 星数 + 补星(补星只在已解锁行出现,与 Web 同一判据) */
export function menuRowStates(save: MenuSaveView, stageIds: readonly number[]): MenuRowState[] {
  return stageIds.map((id) => {
    const unlocked = menuStageOpen(save, id);
    const stars = save.stageStars[id] ?? 0;
    return { id, unlocked, cleared: id < save.highestStage, stars, makeup: unlocked && canStarMakeup(stars) };
  });
}

/** 委托是否已完成待领取(与顶坞行情条同一判据) */
export function menuCommissionReady(save: MenuSaveView, now: number): boolean {
  return [save.commission, save.commission2].some((c) => !!c && (now - c.startedAt) / 3600000 >= COMMISSION_READY_HOURS);
}

/** 每日宝箱红点:今日还有未领的箱子 */
export function menuDailyDot(save: MenuSaveView): boolean {
  return save.dailyBoxClaimed.length < DAILY_BOXES.length;
}

/** ★★★☆☆ 式星串(替代 Web 的逐颗 icon_star_gold 贴图;星数与存档一致) */
export function starsGlyphs(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.floor(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** 锁定行的门槛文案:打到第 N-1 关第 K 章解锁(判据与数字全部来自共享表) */
export function lockHint(stageId: number, chaptersPerStage: number, save: MenuSaveView): string {
  const need = stageUnlockNeed(chaptersPerStage, STAGE_UNLOCK_PROGRESS);
  const furthest = save.stageFurthest[stageId - 1] ?? 0;
  const prog = furthest > 0 ? `已到第${furthest}章` : "";
  return [`打到第${stageId - 1}关第${need}章解锁`, prog].filter(Boolean).join(" · ");
}

/** 筹码矩形:视图绘制与点击判定同读一处(板宽由规范表 chipW 给,不再由间距反推) */
export function menuChipRects(L: MenuLayout): MenuRect[] {
  const d = L.d;
  return d.chipXs.map((x) => ({ x, y: d.chipY, w: d.chipW, h: d.chipH }));
}

/** 六个场外入口矩形(顺序即 entries 数组顺序,与视图一致) */
export function menuEntryRects(L: MenuLayout): MenuRect[] {
  return [L.commissionBtn, L.gachaBtn, L.talentBtn, L.passBtn, L.dailyBtn, L.gearupBtn];
}

/**
 * 点击判定。分支顺序对标 Web `onMenuClick`:入口先于关卡行(两者不相交,顺序只为对齐),
 * 行内补星钮先于整行;返回 null = 空白处,宿主不响应。
 * 未解锁行仍返回 stage 动作,由宿主决定提示(锁定行不可进关)。
 */
export function hitMenu(L: MenuLayout, states: readonly MenuRowState[], x: number, y: number): MenuAction | null {
  if (inRect(L.phantomBtn, x, y)) return { kind: "phantom" };
  const rects = menuEntryRects(L);
  for (let i = 0; i < rects.length; i++) {
    if (inRect(rects[i], x, y)) return { kind: "entry", entry: MENU_ENTRY_IDS[i] };
  }
  const chips = menuChipRects(L);
  for (let i = 0; i < chips.length; i++) {
    if (inRect(chips[i], x, y)) return { kind: "chip", index: i };
  }
  for (const r of L.rows) {
    if (!inRect(r, x, y)) continue;
    const st = states.find((s) => s.id === r.id);
    if (st && st.makeup) {
      const mk = L.makeupRect(r, L.rowMargin);
      if (inRect(mk, x, y)) return { kind: "makeup", id: r.id };
    }
    return { kind: "stage", id: r.id };
  }
  if (inRect(L.endlessBtn, x, y)) return { kind: "endless" };
  if (inRect(L.heroBtn, x, y)) return { kind: "hero" };
  return null;
}

/** releasedSets 的当季卡 id(视图 setEnv 用同一份,免得两端环境不同步) */
export function menuSetIds(save: MenuSaveView): SetId[] {
  return releasedSets(save.seasonId).map((s) => s.id);
}

/**
 * 存档 → 一屏文案。布局台与玩家版调这一个函数,所以工作台里看到的行/筹码/说明板
 * 就是玩家真实进度下的那一套。
 */
export function buildMenuContent(o: MenuContentInput): MenuTextContent {
  const { save, now } = o;
  const hero = showcaseHero(save);
  const set = hero ? setDef(hero.setId) : null;
  const starter = set ? SET_STARTERS[set.id] : null;
  const mut = set ? setMutation(save.seasonId, set.id) : null;
  const theme = seasonTheme(save.seasonId);
  const states = menuRowStates(save, o.stageIds);

  const rows: MenuRowContent[] = states.map((st) => {
    const stage = stageOf(st.id);
    const tail = ` · ${stage.chapters} 章${stage.bossChapter ? " · Boss" : ""}`;
    const sub = st.unlocked ? stage.desc : lockHint(st.id, stage.chapters, save);
    return {
      id: st.id,
      name: `第${st.id}关 · ${stage.name}${st.cleared ? " ✓" : ""}${st.stars > 0 ? ` ${starsGlyphs(st.stars)}` : ""}`,
      desc: sub + tail,
      sub,
      tail,
      badgeKey: `avatar_${frameQualityForStage(st.id)}`,
      badgeText: String(st.id),
      current: o.currentStageId === st.id || (st.unlocked && !st.cleared),
      makeup: st.makeup,
      makeupText: `${STAR_MAKEUP_COST}◆ 补星`,
      unlocked: st.unlocked,
      cleared: st.cleared,
    };
  });

  return {
    title: "回响深渊",
    seasonLine: `赛季 S${save.seasonId}「${theme.name}」· 第 ${seasonDay(save.seasonStartAt, now)}/${SEASON_DAYS} 天 · 赛季分 ${seasonScore(save.stageStars, save.seasonBest)}`,
    energyLine: `⚡ ${Math.max(0, Math.round(save.energy))}/${ENERGY_MAX} ◆ ${Math.max(0, Math.round(save.diamond))}`,
    chips: [
      { iconKey: "icon_ticket", text: String(Math.round(save.gachaTicket)) },
      { iconKey: "icon_echo", text: String(Math.round(save.points)) },
      { iconKey: "icon_stardust", text: String(Math.round(save.stardust)) },
    ],
    phantomText: `幻影榜 · No.${rankAmong(seasonScore(save.stageStars, save.seasonBest), phantomBoard(save.seasonId))}`,
    sectionText: "主线关卡 · 通关解锁",
    rows,
    entries: MENU_ENTRY_IDS.map((id, i) => ({
      plateKey: "btn_minor",
      iconKey: ENTRY_ICON_KEYS[i],
      label: id === "pass" && premiumActive(save) ? "通行证★" : ENTRY_LABELS[i],
    })),
    endlessText: "♾ 无限关 · 爽模式",
    heroLines: [
      hero ? `${hero.name} · ${hero.title}` : "未选出战英雄",
      set ? `${set.name} · ${set.desc}` : "点右侧「更换英雄」,套组构筑随英雄出战",
      starter ? `初始武器:${starter.name}${mut ? ` · 赛季联动:${mut.name}` : ""}` : "初始武器:随机通用卡池",
    ],
    heroBtnText: hero ? "更换英雄" : "选择英雄",
    accent: hero ? hero.accentColor : null,
    noteLines:
      hero && set && starter
        ? [
            `出战「${hero.name}」· 商店偏向刷「${set.name}」卡 · 3 件:${set.bonus3.name} / 6 件:${set.bonus6.name}${mut ? ` · 赛季联动:${mut.name}(${mut.desc})` : ""}`,
            `初始武器:${starter.name} — ${starter.desc}`,
          ]
        : [],
    showDot: menuDailyDot(save),
    showCommissionDot: menuCommissionReady(save, now),
    selectedSet: (save.selectedSet ?? null) as SetId | null,
  };
}

/** 六个入口的图标键与文案(顺序同 MENU_ENTRY_IDS;缺图走视图的代码回退底板) */
const ENTRY_ICON_KEYS = ["entry_quests", "entry_gacha", "entry_talents", "entry_pass", "entry_forge", "entry_gearup"] as const;
const ENTRY_LABELS = ["委托", "扭蛋", "天赋", "通行证", "每日", "升级"] as const;

/** 通行证高级轨是否生效(存档字段,与 Web premiumActive 同判据) */
function premiumActive(save: MenuSaveView): boolean {
  return save.premiumPass || save.premiumPassSeason === save.seasonId;
}
