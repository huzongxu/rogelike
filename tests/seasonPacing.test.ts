/**
 * 赛季节奏审计 —— 上线验收项(进度制改版):
 * 1) 解锁规则:通关解锁 + 50% 进度解锁,无天数门控,无限关常开;
 * 2) 两画像推进(轻玩 2 局/天不看广告 / 核心 5 局/天看广告):
 *    体力墙、星数推进、赛季分与幻影榜名次、券经济;
 * 3) 单局时长抽样(balance-sim)与跨赛季新鲜度。
 *
 * 审计口径:只跑纯函数与已标定的模拟器,不改任何生成/成长曲线。
 * 画像参数是审计假设(见 docs/SEASON-PACING-AUDIT.md),不是游戏内数据。
 */

import { describe, it, expect } from "vitest";
import {
  SEASON_DAYS,
  stageUnlocked,
  stageUnlockNeed,
  seasonScore,
  THREE_STAR_TICKETS,
  FIRST_CLEAR_TICKET_MULT,
} from "../src/data/season";
import {
  ENERGY_MAX,
  ENERGY_AD_GAIN,
  ENERGY_AD_LIMIT,
  DIAMOND_AD_DAILY,
  ENDLESS_ENERGY_COST,
  stageEnergyCost,
} from "../src/data/daily";
import { STAGES } from "../src/data/stages";
import { phantomBoard, rankAmong, PHANTOM_COUNT } from "../src/data/leaderboard";
import { spawnEnemy, bossHpMult } from "../src/entities/enemy";
import { vec2 } from "../src/core/math";
import { runSim, measureBossDps, formatReport } from "../scripts/balance-sim";

const UNLOCK_PROGRESS = 0.5;
const CHAPTERS = 20;

/* ---------- 画像模拟 ---------- */

interface Profile {
  name: string;
  runsPerDay: number;
  /** 每日体力广告补充次数(每次 +5,上限 ENERGY_AD_LIMIT) */
  adRefills: number;
  /** 每日看广告总数(钻石收入,上限 DIAMOND_AD_DAILY) */
  adsPerDay: number;
  /** 当日首尝试会失败、重试成功的关卡(数值墙模拟) */
  failOnce: readonly number[];
  /** 该画像当日最好成绩能拿到的星数 */
  starsFor: (stage: number) => number;
  /** 每天打几局无限关 */
  endlessRunsPerDay: number;
  /** 无限关单局最佳波次的推进(逐局爬坡,封顶) */
  endlessBestCap: number;
}

interface SeasonOutcome {
  highestStage: number;
  furthest: Record<number, number>;
  stars: number[];
  tickets: number;
  diamond: number;
  seasonBest: number;
  score: number;
  rank: number;
  runsPlayed: number;
  blockedRuns: number;
  adRefillsUsed: number;
  dailyFirsts: number;
}

/** 按天推进:体力/进度解锁/首通/三星一次性奖励全部走真实纯函数 */
function simulateSeason(p: Profile, seasonId = 1): SeasonOutcome {
  const stars = [0, 0, 0, 0, 0, 0, 0, 0];
  const furthest: Record<number, number> = {};
  let highestStage = 1; // 第 1 关常开
  let tickets = 0;
  let diamond = 0;
  let seasonBest = 0;
  let runsPlayed = 0;
  let blockedRuns = 0;
  let adRefillsUsed = 0;
  let dailyFirsts = 0;

  const cleared: Record<number, boolean> = {}; // 通关集合(赛季级,不随天重置)
  const board = phantomBoard(seasonId);

  const pay = (energy: number, cost: number, refillsLeft: number): { energy: number; refillsLeft: number; ok: boolean } => {
    let e = energy;
    let r = refillsLeft;
    while (e < cost && r > 0) {
      e += ENERGY_AD_GAIN;
      r -= 1;
    }
    if (e < cost) return { energy: e, refillsLeft: r, ok: false };
    return { energy: e - cost, refillsLeft: r, ok: true };
  };

  for (let day = 1; day <= SEASON_DAYS; day++) {
    let energy = ENERGY_MAX; // 24h 自然恢复远超上限,每日必然满体力开局
    let refills = Math.min(p.adRefills, ENERGY_AD_LIMIT);
    let runs = p.runsPerDay;
    let firstClearToday = false;

    /** 通关一次关卡:解锁下一关 + 首通券奖 + 星数 + 三星一次性券 */
    const clearStage = (s: number) => {
      highestStage = Math.max(highestStage, Math.min(STAGES.length, s + 1));
      furthest[s] = CHAPTERS;
      if (!firstClearToday) {
        firstClearToday = true;
        dailyFirsts += 1;
        tickets += STAGES[s - 1].rewards.tickets * FIRST_CLEAR_TICKET_MULT;
      }
      const ns = Math.max(stars[s], p.starsFor(s));
      if (stars[s] < 3 && ns === 3) tickets += THREE_STAR_TICKETS;
      stars[s] = ns;
    };

    // 主线:优先打尚未通关的最高开放关(进度制,天天都能推新内容);全通后重放最高关吃每日首通
    let failedTodayFor: number | null = null;
    while (runs > 0) {
      const open = STAGES.filter((s) => stageUnlocked(s.id, highestStage, furthest[s.id - 1] ?? 0, CHAPTERS, UNLOCK_PROGRESS));
      const target = [...open].reverse().find((s) => !cleared[s.id]) ?? open[open.length - 1];
      if (!target) break;
      const r = pay(energy, stageEnergyCost(target.id), refills);
      if (!r.ok) {
        blockedRuns += 1;
        break;
      }
      energy = r.energy;
      refills = r.refillsLeft;
      runs -= 1;
      runsPlayed += 1;
      if (!cleared[target.id] && p.failOnce.includes(target.id) && failedTodayFor !== target.id) {
        failedTodayFor = target.id; // 首尝试阵亡:打到末章计入进度(死亡也记进度)
        furthest[target.id] = Math.max(furthest[target.id] ?? 0, CHAPTERS - 1);
        continue;
      }
      cleared[target.id] = true;
      clearStage(target.id);
      // 全通后每天只重放一局(吃每日首通),把剩余体力留给补星/无限关
      if (!STAGES.some((st) => stageUnlocked(st.id, highestStage, furthest[st.id - 1] ?? 0, CHAPTERS, UNLOCK_PROGRESS) && !cleared[st.id])) break;
    }

    // 补星:每天最多把 1 个 2 星关重放到 3 星
    const two = stars.findIndex((n, i) => i >= 1 && n === 2);
    if (two > 0 && two <= highestStage && runs > 0) {
      const r = pay(energy, stageEnergyCost(two), refills);
      if (r.ok) {
        energy = r.energy;
        refills = r.refillsLeft;
        runs -= 1;
        runsPlayed += 1;
        stars[two] = 3;
        tickets += THREE_STAR_TICKETS;
      } else blockedRuns += 1;
    }

    // 无限关:常开,最佳波次逐局爬坡
    let endlessRuns = 0;
    while (runs > 0 && endlessRuns < p.endlessRunsPerDay) {
      const r = pay(energy, ENDLESS_ENERGY_COST, refills);
      if (!r.ok) {
        blockedRuns += 1;
        break;
      }
      energy = r.energy;
      refills = r.refillsLeft;
      runs -= 1;
      runsPlayed += 1;
      endlessRuns += 1;
      seasonBest = Math.min(p.endlessBestCap, seasonBest + 3);
    }

    adRefillsUsed += Math.min(p.adRefills, ENERGY_AD_LIMIT) - refills;
    diamond += Math.min(p.adsPerDay, DIAMOND_AD_DAILY);
  }

  const score = seasonScore(stars, seasonBest);
  return {
    highestStage,
    furthest,
    stars,
    tickets,
    diamond,
    seasonBest,
    score,
    rank: rankAmong(score, board),
    runsPlayed,
    blockedRuns,
    adRefillsUsed,
    dailyFirsts,
  };
}

/* ---------- 1. 解锁规则(进度制) ---------- */

describe("关卡解锁 · 进度制(不再卡天数)", () => {
  it("通关第 N 关解锁第 N+1 关;打到前关 50% 章节也解锁", () => {
    expect(stageUnlocked(1, 1, 0, 20, 0.5)).toBe(true);
    expect(stageUnlocked(2, 1, 9, 20, 0.5)).toBe(false);
    expect(stageUnlocked(2, 1, 10, 20, 0.5)).toBe(true); // 阵亡在第 10 章+也解锁
    expect(stageUnlocked(2, 2, 0, 20, 0.5)).toBe(true); // 通关口径不变
    expect(stageUnlockNeed(20, 0.5)).toBe(10);
  });

  it("天天有推进感:任意一天都不存在『关卡开放但天数未到』的空窗", () => {
    // 进度制下,玩家总能挑战当前最高解锁关:解锁只由进度决定
    for (let highest = 1; highest <= 7; highest++) {
      expect(stageUnlocked(highest, highest, 0, CHAPTERS, UNLOCK_PROGRESS)).toBe(true);
      expect(stageUnlocked(highest + 1, highest, 0, CHAPTERS, UNLOCK_PROGRESS)).toBe(false);
      expect(stageUnlocked(highest + 1, highest, 10, CHAPTERS, UNLOCK_PROGRESS)).toBe(true);
    }
  });
});

/* ---------- 2. 两画像推进 ---------- */

const LIGHT: Profile = {
  name: "轻玩",
  runsPerDay: 2,
  adRefills: 0,
  adsPerDay: 0,
  failOnce: [6, 7], // 5-6 章台阶后段:当日首尝试阵亡,第二局过
  starsFor: (s) => (s <= 4 ? 3 : 2), // 前 4 关顺手 3 星,后 3 关只能 2 星
  endlessRunsPerDay: 0, // 不冲无限关
  endlessBestCap: 0,
};

const CORE: Profile = {
  name: "核心",
  runsPerDay: 5,
  adRefills: 5, // 拉满每日体力广告
  adsPerDay: 10,
  failOnce: [], // 商店成长 + 每日天赋,墙不构成卡点
  starsFor: () => 3,
  endlessRunsPerDay: 4,
  endlessBestCap: 24, // 无限关最佳波次爬坡上限(实测完整 Build 波 31 是天花板)
};

describe("两画像推进(进度制 14 天)", () => {
  const light = simulateSeason(LIGHT);
  const core = simulateSeason(CORE);
  const board = phantomBoard(1);
  console.log(`[幻影榜 S1] ${board.map((e) => `#${e.rank}=${e.score}`).join(" ")}`);
  console.log(`[轻玩] ${JSON.stringify(light)}`);
  console.log(`[核心] ${JSON.stringify(core)}`);

  it("轻玩(2 局/天、零广告):全程无体力墙——每日体力足够推进", () => {
    expect(light.blockedRuns).toBe(0);
    expect(light.adRefillsUsed).toBe(0);
    expect(light.highestStage).toBe(7); // 14 天内推完全线
  });

  it("核心(5 局/天):广告补充有真实消耗场景,同样推完全线", () => {
    expect(core.blockedRuns).toBe(0);
    expect(core.adRefillsUsed).toBeGreaterThan(0);
    expect(core.highestStage).toBe(7);
    expect(core.dailyFirsts).toBe(14); // 每日首通 14/14(留存钩子全触达)
  });

  it("轻玩星数推进:补星机制把 2 星关补到全 3 星", () => {
    expect(light.stars.slice(1, 8)).toEqual([3, 3, 3, 3, 3, 3, 3]);
  });

  it("赛季分与名次:星数全 3 星 ×10 + 无限关波次,轻玩/核心名次分化", () => {
    expect(light.score).toBe(210); // 7 关全 3 星 ×10,不打无限关
    expect(core.score).toBe(210 + 24);
    expect(light.rank).toBe(3);
    expect(core.rank).toBe(2);
  });

  it("榜首可达性:榜首 235 ≤ 现实上限 241(全 3 星 210 + 无限关波 31)", () => {
    expect(board[0].score).toBe(235);
    expect(board[0].score).toBeLessThanOrEqual(210 + 31);
    expect(rankAmong(241, board)).toBe(1);
  });

  it("失败不毁当天:首尝试阵亡计入 50% 进度,第二局仍可通关(甚至已提前解锁下一关)", () => {
    // 轻玩第 6/7 关首尝试阵亡 → 进度已到 19 章(>50%),当日/次日重试成功
    expect(light.highestStage).toBe(7);
  });
});

/* ---------- 3. 单局时长与跨赛季新鲜度 ---------- */

describe("赛季节奏审计 · 单局时长与新鲜度", () => {
  it("单局时长:新手武器全程模拟 20 章存活 ≈ 1200s 战斗 + 商店间隔 → 单局 20-30 分钟", () => {
    const r = runSim({
      build: "set_barrage",
      move: "kite",
      set: "barrage",
      spawnScale: 0.6,
      chapterTypes: true,
      shopGrowth: true,
      maxSeconds: 1300,
      seed: 7,
    });
    console.log("[单局时长/新手全程]\n" + formatReport(r));
    expect(r.died).toBe(false);
    expect(r.wave).toBeGreaterThanOrEqual(20); // 20 章 = 1200s 战斗时长下限成立
    // 策划案目标:单局 15–30 分钟。战斗 1200s + 19 次商店(每次 ~15-40s)≈ 20-32 分钟
  }, 180000);

  it("Boss 战时长(同 boss.test 标定口径):首关新手到场装备、末关终局装备,均 < 60s 章超时线", () => {
    const bossBase = spawnEnemy("boss", vec2(0, 0), 20).maxHp;
    // 首关:新手武器到场(无天赋)
    const arrival = runSim({ build: "starter", move: "kite", shopGrowth: true, maxSeconds: 1200, seed: 21 });
    const dps1 = measureBossDps(arrival.finalEquipment, { seconds: 45, seed: 21 }).dps;
    const t1 = (bossBase * bossHpMult(1)) / dps1;
    // 末关:打到第 7 关的玩家(进阶 Build + 征服者天赋)
    const endgame = runSim({ build: "godly", move: "kite", shopGrowth: true, boosted: true, maxSeconds: 1200, seed: 21 });
    const dps7 = measureBossDps(endgame.finalEquipment, { boosted: true, seconds: 45, seed: 21 }).dps;
    const t7 = (bossBase * bossHpMult(7)) / dps7;
    console.log(`[Boss 时长] 关1 dps=${dps1.toFixed(0)} TTK ${t1.toFixed(1)}s · 关7 dps=${dps7.toFixed(0)} TTK ${t7.toFixed(1)}s`);
    expect(t1).toBeLessThan(60);
    expect(t7).toBeLessThan(60);
  }, 240000);

  it("跨赛季新鲜度:幻影榜随 seasonId 换榜;关卡/章型/套组为赛季无关(已知局限,记录在案)", () => {
    const b1 = phantomBoard(1);
    const b2 = phantomBoard(2);
    expect(b1.map((e) => e.score)).not.toEqual(b2.map((e) => e.score));
    expect(b1).toHaveLength(PHANTOM_COUNT);
    // 局限:除榜外,赛季间无新关卡/新套组/新敌人——内容变体依赖美术,列入后续迭代路线
    expect(STAGES).toHaveLength(7);
  });
});
