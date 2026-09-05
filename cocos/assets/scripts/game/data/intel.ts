/**
 * 章节敌情(需求优化 v2:章节克制导向)。
 * 每章按 4 类敌情轮转(尸潮/重甲/异变/精英),给玩家"本章威胁 + 推荐构筑"压力:
 * - HUD/商店展示本章敌情与推荐套组,引导针对性重构;
 * - 波次生成倾向刷本章主力敌种(且主力敌种获得血量加成),不针对就压力陡增。
 */

import type { EnemyKind } from "../entities/enemy";
import type { SetId } from "./sets";
import { seasonMonsterNames } from "./seasonMonsters";

export interface ChapterIntel {
  /** 敌情标题 */
  title: string;
  /** 本章威胁描述 */
  desc: string;
  /** 本章主力敌种(波次生成倾向,并获得血量加成;null = 无倾向) */
  prefer: EnemyKind | null;
  /** 克制本章的推荐套组(null = 无明确克制) */
  recommended: SetId | null;
  /** 推荐语 */
  hint: string;
}

const INTELS: readonly Omit<ChapterIntel, "desc">[] = [
  { title: "尸潮", prefer: "chaser", recommended: "ember", hint: "范围清群,推荐余烬天灾" },
  { title: "重甲", prefer: "tank", recommended: "barrage", hint: "高伤穿透,推荐弹幕风暴" },
  { title: "异变", prefer: null, recommended: "thorn", hint: "扛伤回血,推荐荆棘回响" },
  { title: "精英", prefer: "swift", recommended: null, hint: "随机应变" },
];

const DESCS: Record<string, string> = {
  尸潮: "大量腐尸与迅捷鬼涌入",
  重甲: "石巨与护盾卫士列阵",
  异变: "分裂体与反射者出没",
  精英: "精英怪潜伏,小心应对",
};

/** 按章节取敌情(4 类轮转,确定性:同一章永远同一敌情)。seasonId ≥ 1 且本章主力敌种有当季主题怪时,威胁描述改报主题怪名 */
export function chapterIntel(chapter: number, seasonId = 0): ChapterIntel {
  const base = INTELS[(chapter - 1 + INTELS.length * 1000) % INTELS.length];
  return { ...base, desc: intelDesc(base, seasonId) };
}

/** 主题怪名与 rollSeasonMonster 共用候选池,敌情文案不会承诺刷不出的怪 */
function intelDesc(base: Omit<ChapterIntel, "desc">, seasonId: number): string {
  const names = base.prefer ? seasonMonsterNames(seasonId, base.prefer) : [];
  if (names.length === 1) return `${names[0]} 单独出没`;
  if (names.length >= 2) return `${names[0]}、${names[1]} 等 ${names.length} 种`;
  return DESCS[base.title];
}
