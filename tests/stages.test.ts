/**
 * 主线关卡(Boss/奖励/解锁)测试 —— 赛季关卡式结构。
 */

import { describe, it, expect } from "vitest";
import { STAGES, stageOf, splitEcho, stageEchoReward, chapterMonsterCount, stageClearedAtFinalChapter, CHAPTER_SECONDS, makeUpReward } from "@game/data/stages";
import { spawnEnemy, updateSpecial, reflectDamage, shieldguardDamageMult, splitBabies } from "@game/entities/enemy";
import { vec2 } from "@game/core/math";

describe("主线关卡定义", () => {
  it("7 个关卡,id 连续,每关 20 章且通关奖励递增", () => {
    expect(STAGES).toHaveLength(7);
    STAGES.forEach((s, i) => {
      expect(s.id).toBe(i + 1);
      expect(s.chapters).toBe(20);
      expect(s.rewards.tickets).toBeGreaterThan(0);
      expect(s.rewards.points).toBeGreaterThan(0);
    });
  });

  it("第 1/3/5/7 关为 Boss 关(第 20 章),难度与奖励逐关递增", () => {
    expect(STAGES[0].bossChapter).toBeDefined();
    expect(STAGES[2].bossChapter).toBeDefined();
    expect(STAGES[4].bossChapter).toBeDefined();
    expect(STAGES[6].bossChapter).toBeDefined();
    expect(STAGES[6].rewards.tickets).toBeGreaterThan(STAGES[0].rewards.tickets);
    expect(stageOf(7).name).toContain("王座");
  });

  it("不变式:每一关都存在可达的通关路径(防止无 Boss 关被末章判负锁死)", () => {
    for (const s of STAGES) {
      if (s.bossChapter) {
        expect(s.bossChapter, `关 ${s.id} 的 Boss 章必须落在最后一章`).toBe(s.chapters);
        // 有 Boss 关:未杀 Boss 判负,杀了才通关
        expect(stageClearedAtFinalChapter(s, false)).toBe(false);
        expect(stageClearedAtFinalChapter(s, true)).toBe(true);
      } else {
        // 无 Boss 关:撑过最后一章即通关,不得依赖 bossDead
        expect(stageClearedAtFinalChapter(s, false)).toBe(true);
      }
    }
  });

  it("环境词缀随关卡变难", () => {
    expect(STAGES[0].envAffixes).toHaveLength(0);
    expect(STAGES[6].envAffixes.length).toBeGreaterThanOrEqual(3);
  });

  it("回响跨天拆分:40% 永久,60% 本日(需求优化 v2)", () => {
    expect(splitEcho(10)).toEqual({ permanent: 4, day: 6 });
    expect(splitEcho(2)).toEqual({ permanent: 0, day: 2 }); // 小数向下取整
    expect(splitEcho(0)).toEqual({ permanent: 0, day: 0 });
  });

  it("每章 60 秒;怪物密度曲线递增;回响奖励随关卡递增", () => {
    expect(CHAPTER_SECONDS).toBe(60);
    expect(chapterMonsterCount(20)).toBeGreaterThan(chapterMonsterCount(1));
    expect(stageEchoReward(7)).toBeGreaterThan(stageEchoReward(1));
  });
});

describe("关卡 Boss(深渊领主)", () => {
  it("反射 15%(弱于反射者 25%,避免 Boss 战自毁)", () => {
    const boss = spawnEnemy("boss", vec2(0, 0), 6);
    expect(reflectDamage(boss, 100)).toBe(15);
  });

  it("正面减伤 40%(0.6 倍),侧面全额", () => {
    const boss = spawnEnemy("boss", vec2(0, 0), 6);
    boss.facing = vec2(1, 0);
    expect(shieldguardDamageMult(boss, vec2(50, 0))).toBe(0.6);
    expect(shieldguardDamageMult(boss, vec2(0, 50))).toBe(1);
  });

  it("不隐身(与神之敌区分),死亡分裂 2 个幼体", () => {
    const boss = spawnEnemy("boss", vec2(0, 0), 6);
    updateSpecial(boss, 4, () => {});
    expect(boss.hidden).toBe(false);
    expect(splitBabies(boss)).toHaveLength(2);
  });
});

describe("补领(策划案 V3 §4.4)", () => {
  it("首通同口径:券 ×2 + 回响 ×1.5,基准 = 最高关卡", () => {
    expect(makeUpReward(1)).toEqual({ stageId: 1, tickets: 2, echo: 15 });
    expect(makeUpReward(7)).toEqual({ stageId: 7, tickets: 10, echo: 278 });
  });

  it("基准关卡钳制在 1–7", () => {
    expect(makeUpReward(0).stageId).toBe(1);
    expect(makeUpReward(99).stageId).toBe(7);
  });
});
