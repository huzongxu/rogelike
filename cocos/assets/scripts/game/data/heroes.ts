/**
 * 英雄(英雄系统批次):武器套组的人物包装。
 * 每个赛季发布 3 个英雄 ≡ 该季 3 个专属套组;到发布赛季后永久保留可选(与套组同纪律)。
 *
 * 纪律一(**英雄无数值**):HeroDef 只有 10 个字段,战斗语义全部来自 setId 一个键。
 * 英雄不产生任何独立数值/被动/主动 —— 强度、件数、词缀一律由套组表与赛季表决定。
 * 纪律二(**派生不手抄**):releaseSeason / themeIndex / accentColor 全部从 sets + seasonSets 派生,
 * 本表只落地"人物文案"(name / title / lore)与 setId 绑定。
 * 纪律三(**双射由类型系统保证**):HERO_PROSE 以 SetId 为键,少写一个套组即编译报错。
 */

import type { SetId } from "./sets";
import { allSets, setReleaseSeason } from "./sets";
import { isSeasonBoosted, seasonThemeIndex } from "./seasonSets";
import { heroSkills } from "./heroSkills";
import { heroRhythm, heroRhythmOptions, rhythmDef, type RhythmId } from "./rhythm";

export type HeroId =
  | "vera"
  | "kyle"
  | "bran"
  | "sia"
  | "nora"
  | "loka"
  | "doran"
  | "sally"
  | "rayne"
  | "willow"
  | "oden"
  | "mu";

export interface HeroDef {
  id: HeroId;
  /** display 名(英雄列表行/主菜单展示带) */
  name: string;
  /** 称号(详情区副标题) */
  title: string;
  /** 一句人物设定(详情区正文) */
  lore: string;
  /** 唯一战斗语义:本英雄 = 该套组 */
  setId: SetId;
  /** 派生自 sets 表(常驻三套视作 S1) */
  releaseSeason: number;
  /** 派生:seasonThemeIndex(releaseSeason),与赛季主题怪表同源 */
  themeIndex: number;
  /** 立绘资源键(本批为代码绘制占位,立绘后补时只改资源不改代码) */
  portraitKey: string;
  /** 套组徽章资源键 */
  iconKey: string;
  /** 派生自 setDef(setId).color */
  accentColor: string;
}

/** 英雄侧唯一的"手写"信息:人物文案 + 与套组的绑定(套组为键 → 双射不可漏) */
const HERO_PROSE: Record<SetId, { id: HeroId; name: string; title: string; lore: string }> = {
  thorn: {
    id: "vera",
    name: "薇拉",
    title: "荆肤者",
    lore: "把挨下的每一下都长成刺,越贴身越不肯倒。",
  },
  barrage: {
    id: "kyle",
    name: "凯尔",
    title: "织雨工匠",
    lore: "在深渊里给每台机子校过准星,落点密得像织雨。",
  },
  ember: {
    id: "bran",
    name: "布兰",
    title: "燎原者",
    lore: "先烧出一条路,再让余烬替他把路口守住。",
  },
  frost: {
    id: "sia",
    name: "希雅",
    title: "霜语者",
    lore: "听得见冰脉低鸣,冰锥落点总是先半步冻住退路。",
  },
  glacier: {
    id: "nora",
    name: "诺拉",
    title: "界碑守卫",
    lore: "在界碑前立过誓:射线穿过去的地方,就是界线。",
  },
  blizzard: {
    id: "loka",
    name: "洛卡",
    title: "白啸猎手",
    lore: "霜刀成幕齐射,一声白啸之后地上只剩冰锥。",
  },
  magma: {
    id: "doran",
    name: "多兰",
    title: "陨星祭司",
    lore: "数着秒等陨星落地,熔岩替他封住不肯退的那条路。",
  },
  plague: {
    id: "sally",
    name: "莎莉",
    title: "薪火疫医",
    lore: "把毒云当药铺在路上,烧起来的才治,退得开的不管。",
  },
  cinderfang: {
    id: "rayne",
    name: "雷恩",
    title: "雷殛佣兵",
    lore: "一份报酬要咬五个目标,陨星只是收钱的尾音。",
  },
  phantom: {
    id: "willow",
    name: "薇洛",
    title: "剧团主哨",
    lore: "一声哨笛,雾里的亡者和灵狼都来替她谢幕。",
  },
  requiem: {
    id: "oden",
    name: "奥登",
    title: "安可指挥",
    lore: "骷髅列阵当前排,他坚持每场都要多演一遍。",
  },
  veil: {
    id: "mu",
    name: "缪",
    title: "噬灵巫祝",
    lore: "不追求一击,只把对手一点点耗死在雾里。",
  },
};

/** 列表顺序 = allSets() 顺序(S1 三套 → S4 三套),不做二次排序 */
const HEROES: readonly HeroDef[] = allSets().map((s) => {
  const prose = HERO_PROSE[s.id];
  const releaseSeason = setReleaseSeason(s.id);
  return {
    id: prose.id,
    name: prose.name,
    title: prose.title,
    lore: prose.lore,
    setId: s.id,
    releaseSeason,
    themeIndex: seasonThemeIndex(releaseSeason),
    portraitKey: `hero_${prose.id}`,
    iconKey: `icon_set_${s.id}`,
    accentColor: s.color,
  };
});

const HERO_BY_ID: Record<HeroId, HeroDef> = HEROES.reduce((acc, h) => {
  acc[h.id] = h;
  return acc;
}, {} as Record<HeroId, HeroDef>);

const HERO_BY_SET: Record<SetId, HeroDef> = HEROES.reduce((acc, h) => {
  acc[h.setId] = h;
  return acc;
}, {} as Record<SetId, HeroDef>);

export function allHeroes(): readonly HeroDef[] {
  return HEROES;
}

export function heroDef(id: HeroId): HeroDef {
  return HERO_BY_ID[id];
}

/** 该套组对应的英雄(双射,恒存在) */
export function heroOfSet(setId: SetId): HeroDef {
  return HERO_BY_SET[setId];
}

/** 存档迁移用:老档只有 selectedSet,反查其英雄;查不到(脏值)返回 null 而不抛错 */
export function heroOfSetOrNull(setId: SetId | null | undefined): HeroDef | null {
  if (!setId) return null;
  return HERO_BY_SET[setId] ?? null;
}

/** 当前赛季可选英雄(= 已到发布赛季,永久保留;S1 = 恒三个) */
export function releasedHeroes(seasonId: number): readonly HeroDef[] {
  return HEROES.filter((h) => seasonId >= h.releaseSeason);
}

/** 当季新发布英雄(每季 3 个;排期外的赛季返回空表) */
export function seasonNewHeroes(seasonId: number): readonly HeroDef[] {
  const s = Math.max(1, Math.floor(seasonId));
  return HEROES.filter((h) => h.releaseSeason === s);
}

/** 该英雄在当前赛季是否已解锁(列表未发布行显示锁标) */
export function isHeroReleased(id: HeroId, seasonId: number): boolean {
  return seasonId >= heroDef(id).releaseSeason;
}

/**
 * 主菜单/英雄页的推荐出战英雄:当季新英雄中被强化者优先 → 当季首发 → 常驻首发。
 * 判据与 setMutation 的赛季门控同源(releaseSeason === seasonId),不另立规则。
 */
export function recommendHero(seasonId: number): HeroDef {
  const s = Math.max(1, Math.floor(seasonId));
  const news = seasonNewHeroes(s);
  return news.find((h) => isSeasonBoosted(s, h.setId)) ?? news[0] ?? HEROES[0];
}

/** 脏值归一(存档字段用):非英雄 id / null / undefined → null */
export function normalizeHeroId(v: unknown): HeroId | null {
  if (typeof v !== "string") return null;
  return v in HERO_BY_ID ? (v as HeroId) : null;
}

/** 出战选择字段(存档里的最小子集;SaveData 结构上兼容本接口) */
export interface HeroSelection {
  selectedHero: HeroId | null;
  selectedSet: SetId | null;
}

/**
 * selectedHero 的唯一写入路径:同时刷新派生镜像 selectedSet。
 * 下游(初始武器 / setBonus / 商店卡池偏向)继续读 selectedSet,因此本函数是两处唯一的同步点。
 */
export function applyHeroSelection(save: HeroSelection, heroId: HeroId | null): void {
  save.selectedHero = heroId;
  save.selectedSet = heroId ? heroDef(heroId).setId : null;
}

/** 主菜单展示带该摆谁:已选英雄优先;老档只有 selectedSet 时反查;都没选 → null */
export function showcaseHero(save: HeroSelection): HeroDef | null {
  const direct = save.selectedHero ? HERO_BY_ID[save.selectedHero] : null;
  if (direct) return direct;
  return heroOfSetOrNull(save.selectedSet);
}

/* ---------- 技能详情(英雄页下半区,恒 4 条) ---------- */

export type HeroSkillTag = "核心技能" | "分岔" | "进阶" | "本命节律";

export interface HeroSkillLine {
  tag: HeroSkillTag;
  label: string;
  desc: string;
}

/** 英雄页第 4 行的可选输入:本局选用的本命(S2 第二本命)与是否已解锁第二本命 */
export interface HeroSkillLineOpts {
  rhythm?: RhythmId;
  unlocked?: boolean;
}

/**
 * 英雄的四条技能说明(docs/DESIGN-HERO-RHYTHM.md §3):核心 / 两个互斥分岔 / 进阶 / 本命节律。
 * 全部从 heroSkills 与 rhythm 两张表读,本函数不落地任何数值。第 4 行在已解锁第二本命时提示可点行轮转。
 */
export function heroSkillLines(id: HeroId, _seasonId: number, opts: HeroSkillLineOpts = {}): readonly HeroSkillLine[] {
  const skills = heroSkills(id);
  const core = skills.find((s) => s.kind === "core")!;
  const branches = skills.filter((s) => s.kind === "branch");
  const advance = skills.find((s) => s.kind === "advance")!;
  const native = heroRhythm(id);
  const chosen = opts.rhythm ?? native;
  const options = heroRhythmOptions(id);
  const rhythmDesc = opts.unlocked
    ? `可选:${options.map((r) => rhythmDef(r).name).join(" / ")} · 点此行切换`
    : `${rhythmDef(native).desc} · 任一关 3 星通关解锁第二本命`;
  return [
    { tag: "核心技能", label: core.name, desc: core.desc },
    { tag: "分岔", label: `${branches[0].name} / ${branches[1].name}`, desc: `${branches[0].desc};${branches[1].desc}` },
    { tag: "进阶", label: advance.name, desc: advance.desc },
    { tag: "本命节律", label: `${rhythmDef(chosen).name}节律${chosen !== native ? "(第二本命)" : ""}`, desc: rhythmDesc },
  ];
}
