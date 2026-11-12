/**
 * 英雄数据层测试(英雄系统批次 M0)。
 * 守住三条纪律:英雄无数值(字段不得长出数值)、派生字段不手抄(与 sets/seasonSets 同源)、
 * 英雄 ↔ 套组双射;并锁住发布门控、出战选择的唯一同步点、技能详情五条文案与「本套计件」清单的来源。
 */
import { describe, expect, it } from "vitest";
import {
  allHeroes,
  applyHeroSelection,
  heroDef,
  heroOfSet,
  heroOfSetOrNull,
  heroSetPieces,
  heroSkillLines,
  isHeroReleased,
  normalizeHeroId,
  recommendHero,
  releasedHeroes,
  seasonNewHeroes,
  showcaseHero,
  type HeroSelection,
} from "@game/data/heroes";
import { RESONANCE_TIERS, allSets, setDef, setReleaseSeason } from "@game/data/sets";
import { ARTIFACT_DEFS } from "@game/data/artifacts";
import { isSeasonBoosted, seasonThemeIndex } from "@game/data/seasonSets";
import { heroSkills } from "@game/data/heroSkills";
import { HERO_RHYTHM, heroRhythmOptions, rhythmDef, rhythmShort } from "@game/data/rhythm";

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

/* ---------- 6. 技能详情:恒 5 条,零自产数值 ---------- */

describe("heroSkillLines", () => {
  const SEASON_RANGE = [0, ...SEASONS, 5, 6];

  it("12 英雄 × 全部赛季恒 5 条,tag 顺序固定(核心 / 分岔 / 进阶 / 本命节律 / 套装)", () => {
    const TAGS = ["核心技能", "分岔", "进阶", "本命节律", "套装"];
    for (const h of allHeroes()) {
      for (const s of SEASON_RANGE) {
        const lines = heroSkillLines(h.id, s);
        expect(lines.length, `${h.id}@S${s}`).toBe(5);
        expect(lines.map((l) => l.tag)).toEqual(TAGS);
      }
    }
  });

  it("五条文案无脏值(NaN / undefined / Infinity / [object)", () => {
    for (const h of allHeroes()) {
      for (const s of SEASON_RANGE) {
        const texts = heroSkillLines(h.id, s).flatMap((l) => [l.label, l.desc]);
        expect(texts.every((t) => t.trim().length > 0), `${h.id}@S${s} 有空文案`).toBe(true);
        const dirty = texts.filter((t) => /NaN|undefined|Infinity|\[object/.test(t));
        expect(dirty, `${h.id}@S${s} 含脏值`).toEqual([]);
      }
    }
  });

  it("核心 / 分岔 / 进阶 / 本命节律 / 套装逐条取自技能表、节律表与套组表,本模块不另立文案", () => {
    for (const h of allHeroes()) {
      const skills = heroSkills(h.id);
      const core = skills.find((s) => s.kind === "core")!;
      const [b1, b2] = skills.filter((s) => s.kind === "branch");
      const adv = skills.find((s) => s.kind === "advance")!;
      const set = setDef(h.setId);
      const [l1, l2, l3, l4, l5] = heroSkillLines(h.id, h.releaseSeason);
      expect(l1.label).toBe(core.name);
      expect(l1.desc).toBe(core.desc);
      expect(l2.label).toBe(`${b1.name} / ${b2.name}`);
      expect(l2.desc).toBe(
        `${b1.desc};${b2.desc} 两岔各解锁:${b1.name}→${rhythmDef(b1.rhythm).name}(${rhythmShort(b1.rhythm)}),${b2.name}→${rhythmDef(b2.rhythm).name}(${rhythmShort(b2.rhythm)})`,
      );
      expect(l3.label).toBe(adv.name);
      expect(l3.desc).toBe(adv.desc);
      expect(l4.label).toBe(`${rhythmDef(HERO_RHYTHM[h.id]).name}节律`);
      expect(l4.desc).toContain("解锁第二本命");
      // 套装行:发动门槛读 RESONANCE_TIERS(共鸣 2 / 4 处,不是退役的 3 / 6 件),正文读 bonus3 / bonus6
      expect(l5.label).toBe(`${set.name} · ${set.desc}`);
      expect(l5.desc).toBe(
        `共鸣 ${RESONANCE_TIERS.tier1} 处「${set.bonus3.name}」${set.bonus3.desc} · ${RESONANCE_TIERS.tier2} 处「${set.bonus6.name}」${set.bonus6.desc}`,
      );
      expect(l5.desc).not.toMatch(/3 件|6 件/);
    }
  });

  it("本命节律行:未解锁提示 3 星解锁;解锁后列出可选节律并标出第二本命;赛季号不影响五行", () => {
    for (const h of allHeroes()) {
      const base = heroSkillLines(h.id, 1);
      for (const s of [2, 3, 4, 5, 6]) expect(heroSkillLines(h.id, s)).toEqual(base);
      const opts = heroRhythmOptions(h.id);
      expect(opts[0]).toBe(HERO_RHYTHM[h.id]);
      expect(opts.length).toBeGreaterThanOrEqual(2);
      const second = opts[1];
      const line = heroSkillLines(h.id, 1, { rhythm: second, unlocked: true })[3];
      expect(line.label).toBe(`${rhythmDef(second).name}节律(第二本命)`);
      for (const r of opts) expect(line.desc).toContain(rhythmDef(r).name);
      // 传了本命自己:不带「第二本命」后缀
      expect(heroSkillLines(h.id, 1, { rhythm: opts[0], unlocked: true })[3].label).toBe(`${rhythmDef(opts[0]).name}节律`);
    }
  });
});

/* ---------- 6b. 「本套计件」清单:套组认领的每种效果 = 一枚主动法宝 ---------- */

describe("heroSetPieces", () => {
  it("12 英雄逐项等于「该套 effects → ARTIFACT_DEFS 同名法宝」,顺序随表、本模块不另立文案", () => {
    for (const h of allHeroes()) {
      const set = setDef(h.setId);
      expect(heroSetPieces(h.id), h.id).toEqual(set.effects.map((e) => ARTIFACT_DEFS[e].name));
    }
  });

  it("每套至少两枚、至多四枚,名字互不重复且非空", () => {
    for (const h of allHeroes()) {
      const names = heroSetPieces(h.id);
      expect(names.length, h.id).toBeGreaterThanOrEqual(2);
      expect(names.length, h.id).toBeLessThanOrEqual(4);
      expect(new Set(names).size, h.id).toBe(names.length);
      expect(names.every((n) => n.trim().length > 0), h.id).toBe(true);
    }
  });
});
