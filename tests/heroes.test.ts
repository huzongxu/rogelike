/**
 * 英雄数据层测试(英雄系统批次 M0)。
 * 守住三条纪律:英雄无数值(字段不得长出数值)、派生字段不手抄(与 sets/seasonSets 同源)、
 * 英雄 ↔ 套组双射;并锁住发布门控、出战选择的唯一同步点与技能详情四条文案的来源。
 */
import { describe, expect, it } from "vitest";
import {
  allHeroes,
  applyHeroSelection,
  heroDef,
  heroOfSet,
  heroOfSetOrNull,
  heroSkillLines,
  isHeroReleased,
  normalizeHeroId,
  recommendHero,
  releasedHeroes,
  seasonNewHeroes,
  showcaseHero,
  type HeroSelection,
} from "@game/data/heroes";
import { allSets, setDef, setReleaseSeason, SET_PIECE_TIERS } from "@game/data/sets";
import { isSeasonBoosted, seasonThemeIndex, setMutation } from "@game/data/seasonSets";
import { SET_STARTERS } from "@game/data/equipmentGen";

const SEASONS = [1, 2, 3, 4] as const;
const PER_SEASON = 3;

/** 纪律一的可执行形式:字段清单固定,任何人加一个数值字段都会撞这条 */
const HERO_FIELDS = [
  "id",
  "name",
  "title",
  "lore",
  "setId",
  "releaseSeason",
  "themeIndex",
  "portraitKey",
  "iconKey",
  "accentColor",
] as const;

/* ---------- 1. 表完整性与双射(纪律一、三) ---------- */

describe("英雄表完整性", () => {
  it("英雄数 = 赛季数 × 每季 3 个,且 id 全局唯一", () => {
    const heroes = allHeroes();
    expect(heroes.length).toBe(SEASONS.length * PER_SEASON);
    expect(new Set(heroes.map((h) => h.id)).size).toBe(heroes.length);
  });

  it("英雄 ↔ 套组双射:setId 互不重复且恰好覆盖 allSets()", () => {
    expect(allHeroes().map((h) => h.setId)).toEqual(allSets().map((s) => s.id));
    for (const s of allSets()) {
      expect(heroOfSet(s.id).setId).toBe(s.id);
      expect(heroDef(heroOfSet(s.id).id).setId).toBe(s.id);
    }
  });

  it("HeroDef 字段清单恒 10 项(英雄是包装,不产出数值)", () => {
    const hero = heroDef("vera");
    expect(Object.keys(hero).sort()).toEqual([...HERO_FIELDS].sort());
    const nonText = HERO_FIELDS.filter((k) => k !== "releaseSeason" && k !== "themeIndex");
    for (const k of nonText) {
      const v = hero[k];
      expect(typeof v === "string" || typeof v === "number", `${k} 应为字符串或派生序号`).toBe(true);
    }
  });

  it("文案三要素非空且互不重复(名字/称号是列表与展示带的唯一区分)", () => {
    const heroes = allHeroes();
    for (const key of ["name", "title", "lore"] as const) {
      const values = heroes.map((h) => h[key]);
      expect(values.every((v) => v.trim().length > 0), `${key} 有空值`).toBe(true);
      expect(new Set(values).size, `${key} 有重复`).toBe(heroes.length);
    }
  });
});

/* ---------- 2. 派生字段与源表一致(纪律二) ---------- */

describe("派生字段不手抄", () => {
  it("releaseSeason / themeIndex / accentColor 全部等于源表取值", () => {
    for (const h of allHeroes()) {
      expect(h.releaseSeason, `${h.id} releaseSeason 与套组表脱钩`).toBe(setReleaseSeason(h.setId));
      expect(h.themeIndex, `${h.id} themeIndex 与赛季主题表脱钩`).toBe(seasonThemeIndex(h.releaseSeason));
      expect(h.accentColor, `${h.id} 主色与套组配色脱钩`).toBe(setDef(h.setId).color);
    }
  });

  it("资源键按约定派生,且立绘键与套组徽章键互不混用", () => {
    for (const h of allHeroes()) {
      expect(h.portraitKey).toBe(`hero_${h.id}`);
      expect(h.iconKey).toBe(`icon_set_${h.setId}`);
    }
  });

  it("同赛季三英雄的发布赛季与主题一致,主色互不相同(展示带不会撞色)", () => {
    for (const s of SEASONS) {
      const news = seasonNewHeroes(s);
      expect(news.length).toBe(PER_SEASON);
      expect(new Set(news.map((h) => h.themeIndex)).size).toBe(1);
      expect(new Set(news.map((h) => h.accentColor)).size).toBe(PER_SEASON);
    }
  });
});

/* ---------- 3. 发布门控:后面的赛季可以用之前赛季的英雄 ---------- */

describe("发布门控", () => {
  it("可选英雄数按赛季累加:S1=3 / S2=6 / S3=9 / S4=12,过季只增不减", () => {
    let prev = 0;
    for (const s of SEASONS) {
      const n = releasedHeroes(s).length;
      expect(n, `S${s} 可选英雄数`).toBe(prev + PER_SEASON);
      prev = n;
    }
    expect(releasedHeroes(1).length).toBe(3);
    expect(releasedHeroes(4).length).toBe(12);
  });

  it("S5 及以后保留全 12 个,当季无新英雄(排期外赛季返回空表)", () => {
    expect(releasedHeroes(5).length).toBe(12);
    expect(releasedHeroes(9).length).toBe(12);
    expect(seasonNewHeroes(5)).toEqual([]);
  });

  it("seasonNewHeroes 归一脏赛季值(0/负数/小数一律落到 S1 首发三英雄)", () => {
    const first = seasonNewHeroes(1).map((h) => h.id);
    for (const dirty of [0, -3, 1.7]) {
      expect(seasonNewHeroes(dirty).map((h) => h.id)).toEqual(first);
    }
  });

  it("isHeroReleased 与 releasedHeroes 同判据(未发布行在列表显示锁标)", () => {
    for (const s of SEASONS) {
      for (const h of allHeroes()) {
        expect(isHeroReleased(h.id, s)).toBe(releasedHeroes(s).some((r) => r.id === h.id));
      }
    }
  });
});

/* ---------- 4. 推荐出战英雄 ---------- */

describe("recommendHero", () => {
  it("恒推荐当季新英雄;S5+ 无新英雄时回落首发英雄", () => {
    for (const s of SEASONS) {
      expect(recommendHero(s).releaseSeason).toBe(s);
    }
    expect(recommendHero(9).id).toBe(allHeroes()[0].id);
    expect(recommendHero(0).id).toBe(allHeroes()[0].id);
  });

  it("推荐判据与 setMutation 的赛季门控同源(被强化者优先)", () => {
    for (const s of SEASONS) {
      const rec = recommendHero(s);
      const boosted = seasonNewHeroes(s).filter((h) => isSeasonBoosted(s, h.setId));
      if (boosted.length > 0) {
        expect(isSeasonBoosted(s, rec.setId), `S${s} 推荐了未强化英雄`).toBe(true);
      }
    }
  });
});

/* ---------- 5. 出战选择:selectedHero 是唯一事实源,selectedSet 是派生镜像 ---------- */

describe("applyHeroSelection / showcaseHero / normalizeHeroId", () => {
  it("选择英雄后 selectedSet 同步为该英雄套组;换英雄只改这两处", () => {
    const save: HeroSelection = { selectedHero: null, selectedSet: null };
    applyHeroSelection(save, "nora");
    expect(save.selectedHero).toBe("nora");
    expect(save.selectedSet).toBe("glacier");
    applyHeroSelection(save, "mu");
    expect(save).toEqual({ selectedHero: "mu", selectedSet: "veil" });
  });

  it("清空出战:两字段同时归 null(不出战没有半选状态)", () => {
    const save: HeroSelection = { selectedHero: "vera", selectedSet: "thorn" };
    applyHeroSelection(save, null);
    expect(save).toEqual({ selectedHero: null, selectedSet: null });
  });

  it("normalizeHeroId 只认表内 id,脏值一律归 null", () => {
    expect(normalizeHeroId("vera")).toBe("vera");
    for (const dirty of ["vamp", "", "THORN", null, undefined, 7, {}, ["vera"]]) {
      expect(normalizeHeroId(dirty), `脏值 ${JSON.stringify(dirty)} 未归 null`).toBeNull();
    }
  });

  it("showcaseHero:已选英雄优先 → 老档只有 selectedSet 时反查 → 无/脏值给 null", () => {
    expect(showcaseHero({ selectedHero: "loka", selectedSet: "thorn" })!.id).toBe("loka");
    expect(showcaseHero({ selectedHero: null, selectedSet: "cinderfang" })!.id).toBe("rayne");
    expect(showcaseHero({ selectedHero: null, selectedSet: null })).toBeNull();
    expect(heroOfSetOrNull("nope" as never)).toBeNull();
    expect(heroOfSetOrNull(undefined)).toBeNull();
  });
});

/* ---------- 6. 技能详情:恒 4 条,零自产数值 ---------- */

describe("heroSkillLines", () => {
  const SEASON_RANGE = [0, ...SEASONS, 5, 6];

  it("12 英雄 × 全部赛季恒 4 条,tag 顺序固定", () => {
    const TAGS = ["初始武器", "三件套", "六件套", "赛季联动"];
    for (const h of allHeroes()) {
      for (const s of SEASON_RANGE) {
        const lines = heroSkillLines(h.id, s);
        expect(lines.length, `${h.id}@S${s}`).toBe(4);
        expect(lines.map((l) => l.tag)).toEqual(TAGS);
      }
    }
  });

  it("四条文案无脏值(NaN / undefined / Infinity / [object)", () => {
    for (const h of allHeroes()) {
      for (const s of SEASON_RANGE) {
        const texts = heroSkillLines(h.id, s).flatMap((l) => [l.label, l.desc]);
        expect(texts.every((t) => t.trim().length > 0), `${h.id}@S${s} 有空文案`).toBe(true);
        const dirty = texts.filter((t) => /NaN|undefined|Infinity|\[object/.test(t));
        expect(dirty, `${h.id}@S${s} 含脏值`).toEqual([]);
      }
    }
  });

  it("初始武器/件数档/联动名逐条取自源表,本模块不另立文案", () => {
    for (const h of allHeroes()) {
      const set = setDef(h.setId);
      const starter = SET_STARTERS[h.setId];
      const [l1, l2, l3, l4] = heroSkillLines(h.id, h.releaseSeason);
      expect(l1.label).toBe(starter.name);
      expect(l1.desc).toBe(starter.desc);
      expect(l2.label).toBe(set.bonus3.name);
      expect(l2.desc).toBe(`${SET_PIECE_TIERS.tier1} 件 · ${set.bonus3.desc}`);
      expect(l3.label).toBe(set.bonus6.name);
      expect(l3.desc).toBe(`${SET_PIECE_TIERS.tier2} 件 · ${set.bonus6.desc}`);
      expect(l4.label).not.toBe(l2.label);
    }
  });

  it("赛季联动:常驻三套逐季轮换恒有词缀,赛季新套仅发布当季有词缀、过季回落", () => {
    for (const h of allHeroes()) {
      const inSeason = heroSkillLines(h.id, h.releaseSeason)[3];
      const mut = setMutation(h.releaseSeason, h.setId);
      expect(inSeason.label).toBe(mut ? mut.name : "当季无联动");
      if (h.releaseSeason === 1) {
        // 常驻三套走 MUTATION_POOLS 逐季轮换 → 第 4 条任何赛季都不空转
        const names = new Set<string>();
        for (const s of [1, 2, 3, 4, 5, 6]) {
          const line = heroSkillLines(h.id, s)[3];
          expect(line.label, `${h.id} S${s} 常驻套应恒有轮换词缀`).not.toBe("当季无联动");
          expect(line.desc).toBe(setMutation(s, h.setId)!.desc);
          names.add(line.label);
        }
        expect(names.size, `${h.id} 词缀未随赛季轮换`).toBeGreaterThan(1);
      } else {
        // S2~S4 每季三个新套全部带当季专属词缀 → 英雄页第 4 条不会整季空转
        expect(mut, `${h.id} 发布当季应有赛季词缀`).not.toBeNull();
        // 过季:该套组不再受益,第 4 条回落为"当季无联动"
        expect(heroSkillLines(h.id, h.releaseSeason + 1)[3].label, `${h.id} 过季后联动未回落`).toBe("当季无联动");
      }
    }
  });
});
