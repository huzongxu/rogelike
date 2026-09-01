/**
 * 章节波次 —— 需求优化 v2:每章 60 秒限时,框定有限竞技场。
 * 章节 = floor(经过秒数 / 60) + 1;怪物生成密度随章节曲线递增,带来紧张刺激感。
 */

import { type Enemy, type EnemyDef, type EnemyKind, spawnEnemy, randomEnemyKind, ENEMY_DEFS } from "../entities/enemy";
import { rollSeasonMonster, seasonMonsterDef } from "../data/seasonMonsters";
import { type Vec2, vec2, rand, randInt } from "../core/math";

/**
 * 已选定行为 kind → 当季主题怪属性行(DESIGN-MONSTERS-SEASONS 批 1)。
 * 只换外观与三维倍率,不改 kind(机制分支/波次构成/金币经济全不受影响);
 * 未启用赛季(seasonId < 1)、新手区章节、未命中出场倾向 → undefined = 保持基线怪。
 * 波次与章节开局 burst 共用本入口,门控只写一处。
 */
export function seasonMonsterDefFor(
  kind: EnemyKind,
  seasonId: number,
  chapter: number,
  rnd: () => number = Math.random
): EnemyDef | undefined {
  const row = rollSeasonMonster(kind, seasonId, chapter, rnd);
  return row ? seasonMonsterDef(row, ENEMY_DEFS[kind]) : undefined;
}

export interface ArenaRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 章节敌情倾向(需求优化 v2 克制导向):主力敌种 + 血量加成,不针对就压力陡增 */
export interface SpawnIntel {
  prefer: EnemyKind | null;
  /** 主力敌种的血量加成(0-1) */
  hpBuff: number;
  /** 主力敌种生成倾向概率(0-1) */
  bias: number;
}

/** 每章时长(秒)(运行时与 stages.CHAPTER_SECONDS 同步,由 balance 加载器写入) */
export let CHAPTER_LENGTH = 60;

/* ---------- 生成节奏曲线(策划可配:balance.json → waves 段) ----------
 * 第 1..earlyChapters 章: interval = base × earlyDecay^(wave-1)
 * 之后:                 interval = base × earlyDecay^(earlyChapters-1) × lateDecay^(wave-earlyChapters)
 * 设计意图:前期 -10%/章紧凑施压,第 6 章起放缓为 -4%/章,避免生成加速度长期甩开商店成长 */
export let SPAWN_BASE = 0.9;
export let SPAWN_EARLY_DECAY = 0.9;
export let SPAWN_EARLY_CHAPTERS = 5;
export let SPAWN_LATE_DECAY = 0.96;
export let SPAWN_INTERVAL_MIN = 0.18;
/** 第 multiSpawnFrom 章起一波多只(1 + floor(wave / multiSpawnFrom)) */
export let SPAWN_MULTI_FROM = 6;

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** 应用配置表覆盖(balance.json → waves 段);非法字段回退默认 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const wv = cfg ?? {};
  CHAPTER_LENGTH = num(wv.chapterLength, 5, 3600, 60);
  SPAWN_BASE = num(wv.spawnBase, 0.05, 30, 0.9);
  SPAWN_EARLY_DECAY = num(wv.spawnEarlyDecay, 0.3, 1, 0.9);
  SPAWN_EARLY_CHAPTERS = num(wv.spawnEarlyChapters, 1, 50, 5);
  SPAWN_LATE_DECAY = num(wv.spawnLateDecay, 0.3, 1, 0.96);
  SPAWN_INTERVAL_MIN = num(wv.spawnIntervalMin, 0.02, 5, 0.18);
  SPAWN_MULTI_FROM = num(wv.spawnMultiFrom, 1, 100, 6);
}

export class WaveManager {
  elapsed = 0;
  /** 当前章节(= 波次) */
  wave = 1;
  /** 下一章倒计时 */
  waveCountdown = CHAPTER_LENGTH;

  private spawnTimer = 0;

  get progress(): number {
    return 1 - this.waveCountdown / CHAPTER_LENGTH;
  }

  /**
   * @param arena 本章有限竞技场边界(框定区域,非无限)
   * @param intel 本章敌情(主力敌种加权 + 血量加成;null = 无倾向)
   * @param godAllowed 是否允许刷出神级敌人(由「神之挑战」天赋决定)
   * @param goldMix 金怪混入概率(宝箱章 >0;策划案 V3 章型差异化)
   * @param seasonId 当前赛季(≥1 才启用主题怪换皮;0 = 关闭,行为与旧版一致)
   */
  update(
    dt: number,
    enemies: Enemy[],
    playerPos: Vec2,
    spawnScale = 1,
    arena: ArenaRect = { x0: 0, y0: 0, x1: 1100, y1: 1100 },
    intel?: SpawnIntel,
    godAllowed = false,
    /** 金怪混入概率(0-1;宝箱章 >0,生成时按此概率把敌人替换为金怪) */
    goldMix = 0,
    /** 当前赛季(DESIGN-MONSTERS-SEASONS:当季主题怪换皮;0 = 未启用) */
    seasonId = 0
  ): void {
    this.elapsed += dt;
    this.wave = Math.floor(this.elapsed / CHAPTER_LENGTH) + 1;
    this.waveCountdown = CHAPTER_LENGTH - (this.elapsed % CHAPTER_LENGTH);

    // 生成节奏:见文件头 SPAWN_* 曲线说明(策划可配)
    const base =
      this.wave <= SPAWN_EARLY_CHAPTERS
        ? SPAWN_BASE * Math.pow(SPAWN_EARLY_DECAY, this.wave - 1)
        : SPAWN_BASE * Math.pow(SPAWN_EARLY_DECAY, SPAWN_EARLY_CHAPTERS - 1) * Math.pow(SPAWN_LATE_DECAY, this.wave - SPAWN_EARLY_CHAPTERS);
    const interval = Math.max(SPAWN_INTERVAL_MIN, base / spawnScale);
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += interval;
      const count = 1 + Math.floor(this.wave / SPAWN_MULTI_FROM); // 多只一波(章节数门槛可配)
      for (let i = 0; i < count; i++) {
        const pos = this.edgePos(playerPos, arena);
        let kind = randomEnemyKind(this.wave, godAllowed);
        if (intel?.prefer && Math.random() < (intel.bias ?? 0.4)) kind = intel.prefer;
        // 宝箱章:按 goldMix 概率替换为金怪(掉 5 倍金币,鼓励集火)
        if (goldMix > 0 && Math.random() < goldMix) kind = "goldkind";
        const e = spawnEnemy(kind, pos, this.wave, seasonMonsterDefFor(kind, seasonId, this.wave));
        // 本章主力敌种获得血量加成(敌情威胁实感)
        if (intel && intel.hpBuff > 0 && kind === intel.prefer) {
          const buffed = Math.round(e.maxHp * (1 + intel.hpBuff));
          e.maxHp = buffed;
          e.hp = buffed;
        }
        enemies.push(e);
      }
    }
  }

  /** 在竞技场边缘随机出生,且与玩家保持至少 260px 距离 */
  private edgePos(playerPos: Vec2, arena: ArenaRect): Vec2 {
    const pad = 40;
    for (let tries = 0; tries < 8; tries++) {
      const side = randInt(0, 3);
      let p: Vec2;
      if (side === 0) p = vec2(rand(arena.x0 + pad, arena.x1 - pad), arena.y0 + pad);
      else if (side === 1) p = vec2(rand(arena.x0 + pad, arena.x1 - pad), arena.y1 - pad);
      else if (side === 2) p = vec2(arena.x0 + pad, rand(arena.y0 + pad, arena.y1 - pad));
      else p = vec2(arena.x1 - pad, rand(arena.y0 + pad, arena.y1 - pad));
      const d = Math.hypot(p.x - playerPos.x, p.y - playerPos.y);
      if (d > 260) return p;
    }
    return vec2(rand(arena.x0 + pad, arena.x1 - pad), rand(arena.y0 + pad, arena.y1 - pad));
  }
}
