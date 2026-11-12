/**
 * 英雄技能树详情(V1.1 Work 包 D03):英雄页保留五行,点击「分岔」行展开独立详情。
 * 数据只读 `heroBuild` / `heroSkills` 两张既有表,不另立文案与数值。
 */

import type { HeroId } from "./heroes";
import { buildBranches, nodeOptions, hasChapterBuild, BUILD_NODE_CHAPTERS } from "./heroBuild";
import { branchSkillsOf, heroSkillDef } from "./heroSkills";

export interface HeroTreeOption {
  id: string;
  name: string;
  desc: string;
}

export interface HeroTreeTier {
  chapter: number;
  options: HeroTreeOption[];
}

export interface HeroTreeBranch {
  id: string;
  /** 路线名(荆棘堡垒 / 狼群统帅…) */
  name: string;
  /** 分岔技能名(荆甲 / 棘行者…) */
  skillName: string;
  desc: string;
  tiers: HeroTreeTier[];
}

export interface HeroTree {
  heroId: HeroId;
  /** true = 该英雄仍走 5–8 级升级分岔,没有 4/8/12 节点 */
  legacy: boolean;
  note: string;
  branches: HeroTreeBranch[];
}

export function heroBuildTree(heroId: HeroId): HeroTree {
  if (hasChapterBuild(heroId)) {
    return {
      heroId,
      legacy: false,
      note: "第 2 章开章选支;第 4 / 8 / 12 章各二选一;选择在本局锁定,不占升级 / 商店槽",
      branches: buildBranches(heroId).map((b) => ({
        id: b.id,
        name: b.name,
        skillName: heroSkillDef(b.skillId)?.name ?? b.skillId,
        desc: b.desc,
        tiers: BUILD_NODE_CHAPTERS.map((chapter, i) => ({
          chapter,
          options: nodeOptions(heroId, b.id, (i + 1) as 1 | 2 | 3).map((n) => ({ id: n.id, name: n.name, desc: n.desc })),
        })),
      })),
    };
  }
  return {
    heroId,
    legacy: true,
    note: "该英雄仍走 5–8 级升级分岔(每级三选一);本页只查看两条分岔,不含 4/8/12 节点",
    branches: branchSkillsOf(heroId).map((s) => ({
      id: s.id,
      name: s.name,
      skillName: s.name,
      desc: s.desc,
      tiers: [],
    })),
  };
}
