/**
 * 存档与回响点数结算 —— 策划案 5.2 公式 + 5.4 转生保留项。
 * 持久化走平台适配层的本地存储(浏览器 localStorage / 微信 wx.setStorageSync)。
 */

import { platform } from "../platform/adapter";
import { talentOf, ALL_TALENTS, type TalentId } from "@game/data/talents";
import type { CommissionState } from "@game/data/commissions";
import type { Equipment } from "@game/data/equipmentGen";
import type { SetId } from "@game/data/sets";
import type { HeroId } from "@game/data/heroes";
import { applyHeroSelection, heroOfSetOrNull, normalizeHeroId } from "@game/data/heroes";
import { ENERGY_MAX } from "@game/data/daily";
import { calcPrestigePoints, PRESTIGE_OVERFLOW_STARDUST_RATE } from "@game/data/prestige";

/** 回响点数公式已抽离至策划数值规范表(数值唯一出处),此处转发保持旧导入路径可用 */
export { calcPrestigePoints };

/** 词缀图鉴:转生后保留,用于定向搜索/词缀预览(后续迭代) */
export interface Collection {
  triggers: string[];
  effects: string[];
  modifiers: string[];
  /** 已遭遇过的敌人:基线怪 = Enemy.kind,赛季主题怪 = variantId */
  enemies: string[];
}

export interface SaveData {
  /** 累计回响点数(含已花费) */
  points: number;
  /** 已拥有的天赋节点 */
  ownedTalents: TalentId[];
  collection: Collection;
  bestRun: { kills: number; seconds: number } | null;
  /** 最高波次(无尽模式,策划案 5.2) */
  bestWave: number;
  /** 星尘:词缀融合货币(天赋树点满后溢出点数转化,策划案 5.2) */
  stardust: number;
  /** 收藏装备升级等级(装备系统重构:装备外侧升级;键 = 装备名) */
  gearLevels: Record<string, number>;
  /** 扭蛋券:主线关卡/无限关/委托产出,战场外扭蛋机消耗 */
  gachaTicket: number;
  /** 已解锁的最高主线关卡(通关 N 关解锁 N+1) */
  highestStage: number;
  /** 各关打到过的最远章节(进度制解锁:打到前关 50% 即解锁下一关) */
  stageFurthest: Record<number, number>;
  /** 永久装备收藏(扭蛋产出,开局可带入 1 件) */
  ownedGear: Equipment[];
  /** 扭蛋保底计数(10 抽史诗 / 50 抽传奇) */
  gachaPityEpic: number;
  gachaPityLegendary: number;
  /** 融合保底计数(每 HIDDEN_PITY_N 次融合必出隐藏词缀) */
  fusionPity: number;
  /** 开局带入的收藏装备 id(null = 默认初始武器) */
  selectedGearId: number | null;
  /** 本日临时回响(跨天保留 40%,其余 60% 入本日池,次日清空;需求优化 v2) */
  dayEcho: number;
  /** 赛季高级通行证(双轨通行证的高级轨,未持有则锁定) */
  premiumPass: boolean;
  /** 看广告激活高级轨的赛季 id(0 = 未激活;= 当前 seasonId 时生效,赛季翻页自动失效) */
  premiumPassSeason: number;
  /** 通行证下一个可领取的档位索引 */
  passTier: number;
  /** 转生次数(委托区域解锁条件,策划案 6.1) */
  prestiges: number;
  /** 词缀碎片(委托产出,可兑换星尘) */
  fragments: number;
  /** 进行中的委托(按真实时间结算);双委托天赋可同时派遣 2 个 */
  commission: CommissionState | null;
  commission2: CommissionState | null;
  /** 出战英雄(场外配置的唯一事实源;null = 不出战,通用卡池) */
  selectedHero: HeroId | null;
  /** 出战套组:selectedHero 的派生镜像,唯一写入路径是 applyHeroSelection */
  selectedSet: SetId | null;
  /** 首局引导是否已完成/跳过(true = 不再显示) */
  tutorialDone: boolean;
  /* ---------- 广告驱动商业化(弹壳特攻队思维) ---------- */
  /** 体力(弹壳式硬体力闸门) */
  energy: number;
  /** 体力恢复时间戳(每 6 分钟 1 点) */
  lastEnergyAt: number;
  /** 钻石硬通货(广告/委托产出,买体力/扭蛋券) */
  diamond: number;
  /** 今日已完整观看广告次数(广告钻石日上限 / 每日重置) */
  adWatchCount: number;
  /** 今日广告回体力次数(每日上限 ENERGY_AD_LIMIT) */
  energyAdCount: number;
  /** 每日重置基准日期(YYYY-MM-DD;跨天则重置所有每日计数) */
  dailyDate: string;
  /** 今日已开启的每日宝箱 id */
  dailyBoxClaimed: string[];
  /** 今日扭蛋广告免费抽是否已用 */
  dailyGachaAdUsed: boolean;
  /** 今日已领取的每日天赋 id */
  dailyTalentClaimed: string[];
  /** 今日抽到的每日天赋(当天固定) */
  dailyTalents: string[];
  /** 今日商店广告刷新次数(每日限次) */
  shopRefreshCount: number;
  /* ---------- 赛季壳(策划案 V3 §4) ---------- */
  /** 赛季序号(1 起;到期结算后 +1) */
  seasonId: number;
  /** 赛季开始时间戳(14 天一赛季) */
  seasonStartAt: number;
  /** 各关历史最高星数(索引 1–7;0 = 未通关星数记录) */
  stageStars: number[];
  /** 赛季内无限关最佳波次(赛季分来源;赛季结束清零) */
  seasonBest: number;
  /** 每日首通日期(YYYY-MM-DD;当天首次通关给券×2+回响×1.5) */
  dailyClearedDate: string;
  /** 每日首通领取关卡(仅记录展示用) */
  dailyClearedStage: number;
  /** 已解锁关卡框(首次 3 星解锁,记关卡 id;ART P1 批次前的代码绘制占位) */
  frames: number[];
  /** 补领日期(§4.4:看广告补领当日首通,每日 1 次;领后当日首通视为已消耗) */
  makeUpDate: string;
}

const KEY = "echo-abyss-save-v1";

const EMPTY: SaveData = {
  points: 0,
  ownedTalents: [],
  collection: { triggers: [], effects: [], modifiers: [], enemies: [] },
  bestRun: null,
  bestWave: 0,
  stardust: 0,
  gearLevels: {},
  gachaTicket: 0,
  highestStage: 1,
  stageFurthest: {},
  ownedGear: [],
  gachaPityEpic: 0,
  gachaPityLegendary: 0,
  fusionPity: 0,
  selectedGearId: null,
  dayEcho: 0,
  premiumPass: false,
  premiumPassSeason: 0,
  passTier: 0,
  prestiges: 0,
  fragments: 0,
  commission: null,
  commission2: null,
  selectedHero: null,
  selectedSet: null,
  tutorialDone: false,
  energy: ENERGY_MAX,
  lastEnergyAt: Date.now(),
  diamond: 0,
  adWatchCount: 0,
  energyAdCount: 0,
  dailyDate: "",
  dailyBoxClaimed: [],
  dailyGachaAdUsed: false,
  dailyTalentClaimed: [],
  dailyTalents: [],
  shopRefreshCount: 0,
  seasonId: 1,
  seasonStartAt: Date.now(),
  stageStars: [0, 0, 0, 0, 0, 0, 0, 0],
  seasonBest: 0,
  dailyClearedDate: "",
  dailyClearedStage: 0,
  frames: [],
  makeUpDate: "",
};

function clone<T>(o: T): T {
  // 微信小游戏引擎可能没有 structuredClone,用 JSON 深拷贝兜底
  return JSON.parse(JSON.stringify(o));
}

/** 关卡星数归一化:固定 8 元素(索引 1–7),每格钳制为 0–3 整数 */
function normalizeStars(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [0];
  for (let i = 1; i <= 7; i++) {
    const n = Math.floor(Number(arr[i]) || 0);
    out.push(Math.max(0, Math.min(3, n)));
  }
  return out;
}

export function loadSave(): SaveData {
  try {
    const raw = platform.getStorage(KEY);
    if (!raw) return { ...clone(EMPTY), energy: ENERGY_MAX }; // EMPTY 是导入期快照,体力上限以运行时配置为准
    const parsed = JSON.parse(raw);
    const s: SaveData = {
      points: Number(parsed.points) || 0,
      ownedTalents: Array.isArray(parsed.ownedTalents) ? parsed.ownedTalents : [],
      collection: {
        triggers: parsed.collection?.triggers ?? [],
        effects: parsed.collection?.effects ?? [],
        modifiers: parsed.collection?.modifiers ?? [],
        enemies: parsed.collection?.enemies ?? [],
      },
      bestRun: parsed.bestRun ?? null,
      bestWave: Number(parsed.bestWave) || 0,
      stardust: Number(parsed.stardust) || 0,
      gearLevels: parsed.gearLevels && typeof parsed.gearLevels === "object" ? parsed.gearLevels : {},
      gachaTicket: Number(parsed.gachaTicket) || 0,
      highestStage: Math.max(1, Number(parsed.highestStage) || 1),
      stageFurthest: parsed.stageFurthest && typeof parsed.stageFurthest === "object" && !Array.isArray(parsed.stageFurthest)
        ? Object.fromEntries(Object.entries(parsed.stageFurthest).map(([k, v]) => [Number(k), Math.max(0, Number(v) || 0)]))
        : {},
      ownedGear: Array.isArray(parsed.ownedGear) ? parsed.ownedGear : [],
      gachaPityEpic: Number(parsed.gachaPityEpic) || 0,
      gachaPityLegendary: Number(parsed.gachaPityLegendary) || 0,
      fusionPity: Number(parsed.fusionPity) || 0,
      selectedGearId: parsed.selectedGearId ?? null,
      dayEcho: Number(parsed.dayEcho) || 0,
      premiumPass: !!parsed.premiumPass,
      premiumPassSeason: Number(parsed.premiumPassSeason) || 0,
      passTier: Number(parsed.passTier) || 0,
      prestiges: Number(parsed.prestiges) || 0,
      fragments: Number(parsed.fragments) || 0,
      commission: parsed.commission ?? null,
      commission2: parsed.commission2 ?? null,
      selectedHero: normalizeHeroId(parsed.selectedHero),
      selectedSet: parsed.selectedSet ?? null,
      tutorialDone: !!parsed.tutorialDone,
      energy: Number(parsed.energy) || ENERGY_MAX,
      lastEnergyAt: Number(parsed.lastEnergyAt) || Date.now(),
      diamond: Number(parsed.diamond) || 0,
      adWatchCount: Number(parsed.adWatchCount) || 0,
      energyAdCount: Number(parsed.energyAdCount) || 0,
      dailyDate: String(parsed.dailyDate ?? ""),
      dailyBoxClaimed: Array.isArray(parsed.dailyBoxClaimed) ? parsed.dailyBoxClaimed : [],
      dailyGachaAdUsed: !!parsed.dailyGachaAdUsed,
      dailyTalentClaimed: Array.isArray(parsed.dailyTalentClaimed) ? parsed.dailyTalentClaimed : [],
      dailyTalents: Array.isArray(parsed.dailyTalents) ? parsed.dailyTalents : [],
      shopRefreshCount: Number(parsed.shopRefreshCount) || 0,
      seasonId: Math.max(1, Number(parsed.seasonId) || 1),
      seasonStartAt: Number(parsed.seasonStartAt) || Date.now(),
      stageStars: normalizeStars(parsed.stageStars),
      seasonBest: Number(parsed.seasonBest) || 0,
      dailyClearedDate: String(parsed.dailyClearedDate ?? ""),
      dailyClearedStage: Number(parsed.dailyClearedStage) || 0,
      frames: Array.isArray(parsed.frames) ? parsed.frames.filter((n: unknown) => Number(n) >= 1 && Number(n) <= 7).map(Number) : [],
      makeUpDate: String(parsed.makeUpDate ?? ""),
    };
    // 老档只写 selectedSet → 反查其英雄补齐;镜像恒经唯一写入路径同步(脏值在此归零)
    applyHeroSelection(s, s.selectedHero ?? heroOfSetOrNull(s.selectedSet)?.id ?? null);
    return s;
  } catch {
    return clone(EMPTY);
  }
}

export function persistSave(s: SaveData): void {
  platform.setStorage(KEY, JSON.stringify(s));
}

export function resetSave(): SaveData {
  const fresh = clone(EMPTY);
  persistSave(fresh);
  return fresh;
}

/** 可支配点数(未花费的) */
export function availablePoints(s: SaveData): number {
  const spent = s.ownedTalents.reduce((sum, id) => sum + talentOf(id).cost, 0);
  return s.points - spent;
}

/** 天赋树是否全部点满(三系所有节点,策划案 5.2 溢出转星尘条件) */
export function isTreeFull(owned: readonly TalentId[]): boolean {
  return ALL_TALENTS.every((n) => owned.includes(n.id));
}

/**
 * 转生结算:天赋树点满后,回响点数溢出转化为星尘(1:1,策划案 5.2)。
 * 返回本局实际获得的回响点数(满树时为 0)与转化的星尘。
 */
export function applyRunRewards(s: SaveData, gained: number): { points: number; stardust: number } {
  if (isTreeFull(s.ownedTalents)) {
    const dust = gained * PRESTIGE_OVERFLOW_STARDUST_RATE;
    s.stardust += dust;
    return { points: 0, stardust: dust };
  }
  s.points += gained;
  return { points: gained, stardust: 0 };
}
