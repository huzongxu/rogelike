/**
 * 升级三选一弹层闸门:levelup(升级时弹哪三张卡 / 每张能干什么 / 点完战斗怎么恢复)。
 * 依据 docs/DESIGN-HERO-RHYTHM.md §3 / §6:这一层卖的是**英雄独有技能**(新技能 / 升阶 / 节律强化),
 * 不花金币;每章 1 次免费重随;锁 1 张跨弹层记忆;分岔二选一成对出现、选中即解锁第 2 节律;
 * 另有首章法宝三选一形态(进第 1 章前免费挑 1 件主动法宝,至少 1 张与本命节律共鸣)。
 *
 * 延续 cocos-phase5-confirm 的四条纪律:
 *  1. **几何单一出口**:盒 / 横幅 / 三张卡 / 每卡三枚钮的矩形全部来自共享层
 *     `game/ui/levelUpLayout.ts`,模型层与宿主都不重算其中任何一个数;
 *  2. **断言按入参分档**:几何只吃 `(w, h)`,两档屏高(996 / 1246)下逐条矩形都是常量表,
 *     且**横向逐位相同**(盒是内容列锚,不是屏心锚)、纵向整体平移同一个 Δ;
 *  3. **视图无关**:本文件只吃 cc-free 的 `levelup/LevelUpModel.ts` 与共享层
 *     `game/ui/levelUpLayout` / `game/data/levelUp` / `game/data/heroSkills`;`LevelUpView.ts` 与
 *     `GameShell.ts` / `ViewTable.ts` 那三侧 import 了 `cc`,node 不能直载,故只读源码文本;
 *  4. **行为优先于源码 grep**:经验入口那一条用真跑 `BattleSim` 来验(升级事件按级数报上来、
 *     级数之和等于等级增量、每级 +hpPerLevel 最大生命),源码 grep 只用来钉"没有第二份成长被顺手施加"。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import {
  LV_BANNER_H,
  LV_BANNER_INSET,
  LV_BANNER_TOP,
  LV_BOX_BOTTOM_INSET,
  LV_BOX_H,
  LV_BOX_TEXT_MAX_W,
  LV_BOX_W,
  LV_BTN_GAP,
  LV_BTN_H,
  LV_BTN_STEP,
  LV_BTN_TEXT_DY,
  LV_BTN_TOP_DY,
  LV_BTN_W,
  LV_CARD_BOTTOM_INSET,
  LV_CARD_GAP,
  LV_CARD_H,
  LV_CARD_INSET,
  LV_CARD_TEXT_MAX_W,
  LV_CARD_W,
  LV_CARDS,
  LV_CARDS_DY,
  LV_CONTENT_W,
  LV_DESC_CHARS,
  LV_DESC_DY,
  LV_DESC_LINE,
  LV_DESC_MAX_LINES,
  LV_DELTA_DY,
  LV_HINT_DY,
  LV_HINT_GAP,
  LV_NAME_DY,
  LV_PAD,
  LV_QUALITY_DY,
  LV_TAG_DY,
  levelUpBox,
  levelUpScreenLayout,
  type LevelUpLayout,
  type LvRect,
} from "@game/ui/levelUpLayout";
import { fs as FS, ui as UI_TOKENS } from "@game/ui/theme";
import {
  FIRST_PICK_COUNT,
  FIRST_PICK_RESONANCE_GUARANTEE,
  LEVELUP_ENSURE_RARE_TALENT,
  LEVELUP_FREE_REROLL_PER_CHAPTER,
  LEVELUP_LOCK_LIMIT,
  LEVELUP_MAIN_LABELS,
  LEVELUP_OFFER_COUNT,
} from "@game/data/levelUp";
import { UPGRADE_MAIN_KEYS, equipmentResonant, generateEquipment, makeSkillEquipment, type Equipment } from "@game/data/equipmentGen";
import {
  BRANCH_GUARANTEE_LEVEL,
  BRANCH_MIN_LEVEL,
  BRANCH_TEASE_LEVEL,
  FALLBACK_OFFERS,
  HERO_SKILLS,
  SKILL_MAX_RANK,
  branchSkillsOf,
  coreSkillOf,
  heroSkills,
  rollSkillOffers,
} from "@game/data/heroSkills";
import { HERO_RHYTHM, RHYTHM_MAX_LEVEL, type RhythmId } from "@game/data/rhythm";
import { qualityDef } from "@game/data/quality";
import { LEVELUP_HEAL_PCT, PLAYER_BASE, xpToNext } from "@game/data/combat";
import { Player } from "@game/entities/player";
import { vec2 } from "@game/core/math";
import type { HeroId } from "@game/data/heroes";

/* ---------- Cocos 宿主侧的被测件(cc-free) ---------- */
import {
  LV_TEXT,
  LevelUpModel,
  hitLevelUp,
  levelUpDeltaText,
  levelUpDescLines,
  type LevelUpAction,
  type LevelUpWorld,
} from "../cocos/assets/scripts/levelup/LevelUpModel";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";

/* ---------- 源码文本工具(视图与宿主那两侧 import 了 cc,node 不能直载) ---------- */

function fileSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

/** 去掉块注释与整行注释(注释里的自陈不算代码事实) */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 一份源码里所有 import 语句拼成的文本(横向扫 import 清单用) */
function importsOf(src: string): string {
  return [...src.matchAll(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm)].map((m) => m[0]).join("\n");
}

/** 去掉全部 import 之后的代码体 */
function bodyOf(src: string): string {
  return src.replace(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm, "");
}

const SHELL = "../cocos/assets/scripts/GameShell.ts";
const VIEW = "../cocos/assets/scripts/levelup/LevelUpView.ts";
const MODEL = "../cocos/assets/scripts/levelup/LevelUpModel.ts";
const LAYOUT = "../cocos/assets/scripts/game/ui/levelUpLayout.ts";
const DATA = "../cocos/assets/scripts/game/data/levelUp.ts";
const BATTLE_WORLD = "../cocos/assets/scripts/game/systems/battleWorld.ts";

/** 两档屏高:标定档与最高档(战场锁 560×996,设计空间高随视口 996→1246 伸展) */
const W = 560;
const H_STD = 996;
const H_TALL = 1246;
/** 内容列 `[16, 544]`:页边距 16、内容宽 528,与 shop / energy / fusion 同一把尺 */
const COL_X0 = LV_PAD;
const COL_X1 = LV_PAD + LV_CONTENT_W;

function laid(h: number): LevelUpLayout {
  return levelUpScreenLayout(W, h);
}

/** 一层里所有矩形(带名字,越界与取偶断言逐条报得出是哪一枚) */
function allRects(L: LevelUpLayout): { name: string; r: LvRect }[] {
  const out: { name: string; r: LvRect }[] = [
    { name: "box", r: L.box },
    { name: "banner", r: L.banner },
  ];
  for (const c of L.cards) {
    out.push({ name: `card${c.idx}`, r: c.rect });
    out.push({ name: `card${c.idx}.pick`, r: c.pick.rect });
    out.push({ name: `card${c.idx}.reroll`, r: c.reroll.rect });
    out.push({ name: `card${c.idx}.lock`, r: c.lock.rect });
  }
  return out;
}

/** 一层里所有文本行(带名字) */
function allLines(L: LevelUpLayout): { name: string; x: number; baseY: number; maxW: number; px: number; align: string; bold: boolean }[] {
  const out = [
    { name: "title", ...L.title },
    { name: "readout", ...L.readout },
    { name: "hint", ...L.hint },
  ];
  for (const c of L.cards) {
    out.push({ name: `card${c.idx}.quality`, ...c.quality });
    out.push({ name: `card${c.idx}.name`, ...c.name });
    c.descLines.forEach((t, i) => out.push({ name: `card${c.idx}.desc${i}`, ...t }));
    out.push({ name: `card${c.idx}.delta`, ...c.delta });
    out.push({ name: `card${c.idx}.tag`, ...c.tag });
    out.push({ name: `card${c.idx}.pickText`, ...c.pick.text });
    out.push({ name: `card${c.idx}.rerollText`, ...c.reroll.text });
    out.push({ name: `card${c.idx}.lockText`, ...c.lock.text });
  }
  return out.map((t) => ({ name: t.name, x: t.x, baseY: t.baseY, maxW: t.maxW, px: t.px, align: t.align, bold: t.bold }));
}

/* ---------- 窄假世界:只留这一屏账本用得着的字段(与 tests/shop-upgrade.test.ts 同形态) ---------- */

interface FakeState {
  equipment: Equipment[];
  skills: Equipment[];
  heroId: HeroId | null;
  level: number;
  rhythms: RhythmId[];
  rhythmLevel: Partial<Record<RhythmId, number>>;
  branchChosen: string | null;
  gold: number;
  hp: number;
  maxHp: number;
  baseSlots: number;
  chapter: number;
  highestStage: number;
  recorded: Equipment[];
}

/** 造一个"薇拉开局"的假世界:核心技能在场、本命受击、玩家 1 级 */
function makeWorld(over: Partial<FakeState> = {}): { world: LevelUpWorld; st: FakeState } {
  const hero = over.heroId === undefined ? "vera" : over.heroId;
  const st: FakeState = {
    equipment: [],
    skills: [makeSkillEquipment(coreSkillOf(hero))],
    heroId: hero,
    level: 1,
    rhythms: [HERO_RHYTHM[hero ?? "kyle"]],
    rhythmLevel: {},
    branchChosen: null,
    gold: 100,
    hp: 60,
    maxHp: 100,
    baseSlots: 6,
    chapter: 1,
    highestStage: 1,
    recorded: [],
    ...over,
  };
  if (hero === null && over.rhythms === undefined) st.rhythms = ["pulse"];
  const world: LevelUpWorld = {
    equipment: st.equipment,
    skills: st.skills,
    heroId: () => st.heroId,
    playerLevel: () => st.level,
    rhythms: () => st.rhythms,
    unlockRhythm: (r) => {
      if (!st.rhythms.includes(r)) st.rhythms.push(r);
    },
    rhythmLevel: (r) => st.rhythmLevel[r] ?? 1,
    rhythmLevelUp: (r) => {
      const cur = st.rhythmLevel[r] ?? 1;
      if (cur >= RHYTHM_MAX_LEVEL) return false;
      st.rhythmLevel[r] = cur + 1;
      return true;
    },
    branchChosen: () => st.branchChosen,
    setBranchChosen: (id) => {
      st.branchChosen = id;
    },
    gold: () => st.gold,
    setGold: (v) => {
      st.gold = v;
    },
    healPct: (pct) => {
      st.hp = Math.min(st.maxHp, st.hp + Math.round(st.maxHp * pct));
    },
    addMaxHp: (v) => {
      st.maxHp += v;
      st.hp += v;
    },
    slots: () => st.baseSlots,
    chapter: () => st.chapter,
    highestStage: () => st.highestStage,
    ownedTalents: () => [],
    recordEquipment: (eq) => {
      st.recorded.push(eq);
    },
  };
  return { world, st };
}

/** 假世界 + 模型(随机源缺省恒 0.99:分岔在保底线前不出、抽卡取权重末位,便于断言) */
function makeModel(over: Partial<FakeState> = {}, rand: () => number = () => 0.99): { m: LevelUpModel; st: FakeState } {
  const { world, st } = makeWorld(over);
  return { m: new LevelUpModel(world, rand), st };
}

/* ==================== 1. 几何:两档屏高、取偶、内容列 ==================== */

describe("共享层几何(两档屏高)", () => {
  it("盒横向铺满内容列 [16, 544],纵向整屏居中且取偶", () => {
    for (const h of [H_STD, H_TALL]) {
      const b = levelUpBox(W, h);
      expect([b.x, b.w]).toEqual([COL_X0, LV_CONTENT_W]);
      expect(b.x + b.w).toBe(COL_X1);
      expect(b.y % 2).toBe(0);
      expect(b.h).toBe(LV_BOX_H);
      // 居中(取偶后与理想居中位相差 < 2)
      expect(Math.abs(b.y - (h - LV_BOX_H) / 2)).toBeLessThan(2);
    }
    expect(levelUpBox(W, H_STD).y).toBe(222);
    expect(levelUpBox(W, H_TALL).y).toBe(346);
  });

  it("两档屏高下越界 0 条:每一枚矩形都落在 [16,544] × [0,screenH] 内", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h);
      const bad = allRects(L).filter(({ r }) => r.x < COL_X0 || r.x + r.w > COL_X1 || r.y < 0 || r.y + r.h > h);
      expect(bad.map((b) => b.name)).toEqual([]);
      expect(allRects(L).length).toBe(2 + LV_CARDS * 4);
    }
  });

  it("坐标与宽高一律取偶(盒 / 横幅 / 三张卡 / 每卡三枚钮,共 14 枚矩形 × 4 个数)", () => {
    for (const h of [H_STD, H_TALL]) {
      const odd: string[] = [];
      for (const { name, r } of allRects(laid(h))) {
        for (const [k, v] of Object.entries(r)) if (v % 2 !== 0) odd.push(`${name}.${k}=${v}`);
      }
      expect(odd).toEqual([]);
    }
  });

  it("文本行也取偶,且横向不探出内容列、纵向不越屏", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = laid(h);
      const bad: string[] = [];
      for (const t of allLines(L)) {
        if (t.baseY % 2 !== 0) bad.push(`${t.name}.baseY=${t.baseY}`);
        if (t.x % 2 !== 0) bad.push(`${t.name}.x=${t.x}`);
        if (t.maxW % 2 !== 0) bad.push(`${t.name}.maxW=${t.maxW}`);
        const x0 = t.align === "center" ? t.x - t.maxW / 2 : t.x;
        const x1 = t.align === "center" ? t.x + t.maxW / 2 : t.x + t.maxW;
        if (x0 < COL_X0 || x1 > COL_X1) bad.push(`${t.name}.span=${x0}..${x1}`);
        if (t.baseY < 0 || t.baseY > h) bad.push(`${t.name}.out=${t.baseY}`);
      }
      expect(bad).toEqual([]);
    }
  });

  it("两档之间横向逐位相同、纵向整体平移同一个 Δ(盒是内容列锚,不是屏心锚)", () => {
    const a = laid(H_STD);
    const b = laid(H_TALL);
    const dy = b.box.y - a.box.y;
    expect(dy).toBeGreaterThan(0);
    const ra = allRects(a);
    const rb = allRects(b);
    expect(rb.map((x) => x.name)).toEqual(ra.map((x) => x.name));
    ra.forEach((x, i) => {
      expect([rb[i].r.x, rb[i].r.w, rb[i].r.h], x.name).toEqual([x.r.x, x.r.w, x.r.h]);
      expect(rb[i].r.y - x.r.y, x.name).toBe(dy);
    });
    const la = allLines(a);
    const lb = allLines(b);
    la.forEach((x, i) => {
      expect([lb[i].x, lb[i].maxW, lb[i].px, lb[i].align, lb[i].bold], x.name).toEqual([x.x, x.maxW, x.px, x.align, x.bold]);
      expect(lb[i].baseY - x.baseY, x.name).toBe(dy);
    });
  });

  it("盒内纵向地图逐档对上:横幅 → 读数 → 卡片带 → 底提示 → 盒底", () => {
    const L = laid(H_STD);
    const b = L.box;
    expect([L.banner.x, L.banner.y - b.y, L.banner.w, L.banner.h]).toEqual([b.x + LV_BANNER_INSET, LV_BANNER_TOP, LV_BOX_W - LV_BANNER_INSET * 2, LV_BANNER_H]);
    expect(L.title.baseY - b.y).toBe(LV_BANNER_TOP + 26);
    expect(L.readout.baseY - b.y).toBe(82);
    expect(L.hint.baseY - b.y).toBe(LV_HINT_DY);
    // 盒高由内容推导,不留裸数
    expect(LV_HINT_DY).toBe(LV_CARDS_DY + LV_CARD_H + LV_HINT_GAP);
    expect(LV_BOX_H).toBe(LV_HINT_DY + LV_BOX_BOTTOM_INSET);
    expect(LV_BOX_TEXT_MAX_W).toBe(LV_BOX_W - LV_BANNER_INSET * 2);
    // 卡片带底缘与底提示之间留出那道缝,底提示不压卡
    expect(b.y + LV_CARDS_DY + LV_CARD_H).toBeLessThan(L.hint.baseY);
  });

  it("三张卡等宽 168、间距 12,右缘正好落 544;卡内文本与钮同一条内缩尺", () => {
    expect(LV_CARDS * LV_CARD_W + (LV_CARDS - 1) * LV_CARD_GAP).toBe(LV_CONTENT_W);
    const L = laid(H_STD);
    expect(L.cards.map((c) => c.rect.x)).toEqual([16, 196, 376]);
    expect(L.cards[L.cards.length - 1].rect.x + LV_CARD_W).toBe(COL_X1);
    expect(L.cards.map((c) => c.rect.y)).toEqual(L.cards.map(() => L.box.y + LV_CARDS_DY));
    for (const c of L.cards) {
      expect([c.rect.w, c.rect.h]).toEqual([LV_CARD_W, LV_CARD_H]);
      expect(LV_CARD_TEXT_MAX_W).toBe(LV_CARD_W - LV_CARD_INSET * 2);
      expect(LV_BTN_W).toBe(LV_CARD_W - LV_CARD_INSET * 2);
      for (const t of [c.quality, c.name, c.delta, c.tag, ...c.descLines]) expect(t.x).toBe(c.rect.x + LV_CARD_INSET);
      for (const btn of [c.pick, c.reroll, c.lock]) expect(btn.rect.x).toBe(c.rect.x + LV_CARD_INSET);
    }
  });

  it("卡内三枚钮竖排:各高 ui.touchMin、缝 6,末枚钮底缘到卡底留 12", () => {
    expect(LV_BTN_H).toBe(UI_TOKENS.touchMin);
    expect(LV_BTN_STEP).toBe(LV_BTN_H + LV_BTN_GAP);
    const L = laid(H_STD);
    for (const c of L.cards) {
      const ys = [c.pick.rect.y, c.reroll.rect.y, c.lock.rect.y].map((y) => y - c.rect.y);
      expect(ys).toEqual([LV_BTN_TOP_DY, LV_BTN_TOP_DY + LV_BTN_STEP, LV_BTN_TOP_DY + LV_BTN_STEP * 2]);
      expect(LV_BTN_TOP_DY + LV_BTN_STEP * 2 + LV_BTN_H + LV_CARD_BOTTOM_INSET).toBe(LV_CARD_H);
      // 三枚钮互不相交,且都含于所在卡
      expect(c.pick.rect.y + LV_BTN_H).toBeLessThanOrEqual(c.reroll.rect.y);
      expect(c.reroll.rect.y + LV_BTN_H).toBeLessThanOrEqual(c.lock.rect.y);
      expect(c.lock.rect.y + LV_BTN_H).toBeLessThanOrEqual(c.rect.y + c.rect.h);
      // 钮内文字基线在钮内、且与钮同栅格
      for (const btn of [c.pick, c.reroll, c.lock]) {
        expect(btn.text.baseY - btn.rect.y).toBe(LV_BTN_TEXT_DY);
        expect(btn.text.baseY).toBeGreaterThan(btn.rect.y);
        expect(btn.text.baseY).toBeLessThan(btn.rect.y + btn.rect.h);
        expect(btn.text.x).toBe(btn.rect.x + btn.rect.w / 2);
      }
    }
  });

  it("卡内六族文本的基线互不重叠,描述八行都落在卡内且在钮列之上", () => {
    const L = laid(H_STD);
    const c = L.cards[0];
    expect(c.descLines.length).toBe(LV_DESC_MAX_LINES);
    expect(c.quality.baseY - c.rect.y).toBe(LV_QUALITY_DY);
    expect(c.name.baseY - c.rect.y).toBe(LV_NAME_DY);
    c.descLines.forEach((t, i) => expect(t.baseY - c.rect.y).toBe(LV_DESC_DY + i * LV_DESC_LINE));
    expect(c.delta.baseY - c.rect.y).toBe(LV_DELTA_DY);
    expect(c.tag.baseY - c.rect.y).toBe(LV_TAG_DY);
    const bases = [c.quality, c.name, ...c.descLines, c.delta, c.tag].map((t) => t.baseY);
    expect(new Set(bases).size).toBe(bases.length);
    expect(c.descLines[LV_DESC_MAX_LINES - 1].baseY).toBeLessThan(c.delta.baseY);
    expect(c.tag.baseY).toBeLessThan(c.pick.rect.y);
    expect(LV_DESC_CHARS).toBe(Math.floor(LV_CARD_TEXT_MAX_W / FS.micro));
  });

  it("字号九处全在 fs 表内(本屏没有表外字号)", () => {
    const inFs: number[] = [FS.display, FS.title, FS.section, FS.body, FS.muted, FS.micro];
    const L = laid(H_STD);
    for (const t of allLines(L)) expect(inFs.includes(t.px), `${t.name}=${t.px}`).toBe(true);
    expect(L.title.px).toBe(FS.section);
    expect(L.cards[0].name.px).toBe(FS.body);
    expect(L.cards[0].descLines[0].px).toBe(FS.micro);
  });

  it("贴图键与九宫切深:盒底垫与横幅与二次确认弹层同一档(本屏没有专属皮)", () => {
    const L = laid(H_STD);
    expect([L.panelKey, L.bannerKey]).toEqual(["panel_dark_corners", "banner_mid_navy"]);
    expect([L.panelNine, L.bannerNine]).toEqual([32, 13]);
    expect([L.cardStrokeW, L.btnStrokeW]).toEqual([2, 1]);
  });
});

/* ==================== 2. 命中判定 ==================== */

describe("命中判定", () => {
  const L = laid(H_STD);

  it("九片钮各命中自己那一片(卡序 × 钮序)", () => {
    const kinds: LevelUpAction["kind"][] = ["pick", "reroll", "lock"];
    for (const c of L.cards) {
      kinds.forEach((k, i) => {
        const r = i === 0 ? c.pick.rect : i === 1 ? c.reroll.rect : c.lock.rect;
        expect(hitLevelUp(L, r.x + r.w / 2, r.y + r.h / 2)).toEqual({ kind: k, index: c.idx });
        // 四角也算命中(闭区间)
        expect(hitLevelUp(L, r.x, r.y)).toEqual({ kind: k, index: c.idx });
        expect(hitLevelUp(L, r.x + r.w, r.y + r.h)).toEqual({ kind: k, index: c.idx });
      });
    }
  });

  it("九片之外一律 null(盒内空白、横幅、盒外都吞掉),语义是「什么都不做」而不是「交给下一层」", () => {
    expect(hitLevelUp(L, L.box.x + 4, L.box.y + 4)).toBeNull();
    expect(hitLevelUp(L, L.banner.x + L.banner.w / 2, L.banner.y + L.banner.h / 2)).toBeNull();
    expect(hitLevelUp(L, L.readout.x, L.readout.baseY)).toBeNull();
    expect(hitLevelUp(L, L.cards[0].rect.x + LV_CARD_INSET, L.cards[0].rect.y + LV_NAME_DY)).toBeNull();
    expect(hitLevelUp(L, 0, 0)).toBeNull();
    expect(hitLevelUp(L, W, H_STD)).toBeNull();
    // 卡与卡之间那道 12 的缝
    expect(hitLevelUp(L, L.cards[0].rect.x + LV_CARD_W + LV_CARD_GAP / 2, L.cards[0].pick.rect.y + 20)).toBeNull();
  });
});

/* ==================== 3. 表:策略数值一律入表 ==================== */

describe("策略数值入表", () => {
  it("出卡数 / 锁定上限 / 免费重随 / 首章张数与保底都在 game/data/levelUp.ts,且与设计文同数", () => {
    expect(LEVELUP_OFFER_COUNT).toBe(3);
    expect(LEVELUP_LOCK_LIMIT).toBe(1);
    expect(LEVELUP_FREE_REROLL_PER_CHAPTER).toBe(1);
    expect(FIRST_PICK_COUNT).toBe(3);
    expect(FIRST_PICK_RESONANCE_GUARANTEE).toBe(1);
    expect(LEVELUP_ENSURE_RARE_TALENT).toBe("affix_taste");
    const data = fileSource(DATA);
    for (const k of ["LEVELUP_FREE_REROLL_PER_CHAPTER", "FIRST_PICK_COUNT", "FIRST_PICK_RESONANCE_GUARANTEE"]) expect(data.includes(`export const ${k}`), k).toBe(true);
  });

  it("升阶数值差的标签表键集派生自 UPGRADE_MAIN_KEYS(不另立第二份键表)", () => {
    expect(Object.keys(LEVELUP_MAIN_LABELS)).toEqual([...UPGRADE_MAIN_KEYS]);
    for (const v of Object.values(LEVELUP_MAIN_LABELS)) expect(v.length).toBeGreaterThan(0);
    const data = fileSource(DATA);
    expect(data.includes('import { UPGRADE_MAIN_KEYS } from "./equipmentGen";')).toBe(true);
    expect(data.includes("Record<(typeof UPGRADE_MAIN_KEYS)[number], string>")).toBe(true);
  });

  it("出卡权重 / 分岔时机 / 阶数上限 / 兜底三张都在 game/data/heroSkills.ts;模型与视图不写死任何一个", () => {
    expect(SKILL_MAX_RANK).toBe(5);
    expect(BRANCH_MIN_LEVEL).toBe(5);
    expect(BRANCH_GUARANTEE_LEVEL).toBe(8);
    expect(FALLBACK_OFFERS.map((f) => f.id)).toEqual(["heal30", "gold80", "hp8"]);
    for (const rel of [MODEL, VIEW, LAYOUT]) {
      const body = codeOf(bodyOf(fileSource(rel)));
      expect(body.includes("12 *"), rel).toBe(false);
      expect(body.includes("0.06"), rel).toBe(false);
      expect(body.includes("4dffc8"), rel).toBe(false);
    }
  });

  it("每英雄恰 4 个技能:核心 1 / 分岔 2 / 进阶 1,id 全局唯一,分岔节律 ≠ 本命", () => {
    const ids = new Set<string>();
    for (const [hero, list] of Object.entries(HERO_SKILLS) as [HeroId, readonly (typeof HERO_SKILLS)[HeroId][number][]][]) {
      expect(list.length, hero).toBe(4);
      expect(list.filter((s) => s.kind === "core").length, hero).toBe(1);
      expect(list.filter((s) => s.kind === "branch").length, hero).toBe(2);
      expect(list.filter((s) => s.kind === "advance").length, hero).toBe(1);
      for (const s of list) {
        expect(ids.has(s.id), s.id).toBe(false);
        ids.add(s.id);
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.desc.length).toBeGreaterThan(0);
      }
      expect(coreSkillOf(hero).rhythm, `${hero} 核心绑本命节律`).toBe(HERO_RHYTHM[hero]);
      for (const b of branchSkillsOf(hero)) expect(b.rhythm, `${hero} 分岔解锁的是另一条节律`).not.toBe(HERO_RHYTHM[hero]);
    }
    expect(heroSkills(null).length, "未选英雄走通用职业包").toBe(4);
  });

  it("法宝等级 = max(章节 + 1, 已解锁最高关卡),与商店同一支算式", () => {
    const a = makeWorld({ chapter: 3, highestStage: 1 });
    expect(new LevelUpModel(a.world).cardLevel()).toBe(4);
    const b = makeWorld({ chapter: 1, highestStage: 7 });
    expect(new LevelUpModel(b.world).cardLevel()).toBe(7);
    const shop = fileSource("../cocos/assets/scripts/shop/ShopModel.ts");
    expect(shop.includes("return Math.max(this.w.chapter() + 1, this.w.highestStage());")).toBe(true);
  });
});

/* ==================== 4. 开层:三张独有技能卡 ==================== */

describe("开层", () => {
  it("恒出 LEVELUP_OFFER_COUNT 张;薇拉 1 级(分岔未到期)的候选正好三种身份:进阶技能 / 核心升阶 / 本命节律强化", () => {
    const { m } = makeModel();
    m.open();
    expect(m.visible).toBe(true);
    expect(m.mode).toBe("levelup");
    expect(m.choices).toHaveLength(LEVELUP_OFFER_COUNT);
    const kinds = m.choices.map((c) => c.kind).sort();
    expect(kinds).toEqual(["rank", "rhythm", "skill"]);
    const skill = m.choices.find((c) => c.kind === "skill");
    expect(skill && skill.kind === "skill" && skill.def.id).toBe("vera_blood");
    const rank = m.choices.find((c) => c.kind === "rank");
    expect(rank && rank.kind === "rank" && rank.skillId).toBe("vera_core");
    const rhythm = m.choices.find((c) => c.kind === "rhythm");
    expect(rhythm && rhythm.kind === "rhythm" && rhythm.rhythm).toBe("hit");
    // 没有兜底、没有法宝卡
    expect(m.choices.some((c) => c.kind === "fallback" || c.kind === "equip")).toBe(false);
  });

  it("分岔二选一:BRANCH_MIN_LEVEL 之前恒不出;到期后随机源 < 0.5 才出;BRANCH_GUARANTEE_LEVEL 起必出,且成对占前两格", () => {
    const never = makeModel({ level: BRANCH_MIN_LEVEL - 1 }, () => 0);
    never.m.open();
    expect(never.m.choices.filter((c) => c.kind === "skill" && c.def.kind === "branch")).toHaveLength(0);

    const due = makeModel({ level: BRANCH_MIN_LEVEL }, () => 0.1);
    due.m.open();
    const pair = due.m.choices.filter((c) => c.kind === "skill" && c.def.kind === "branch");
    expect(pair).toHaveLength(2);
    expect(due.m.choices[0].kind === "skill" && due.m.choices[0].def.kind).toBe("branch");
    expect(due.m.choices[1].kind === "skill" && due.m.choices[1].def.kind).toBe("branch");

    const notYet = makeModel({ level: BRANCH_MIN_LEVEL }, () => 0.9);
    notYet.m.open();
    expect(notYet.m.choices.filter((c) => c.kind === "skill" && c.def.kind === "branch")).toHaveLength(0);

    const forced = makeModel({ level: BRANCH_GUARANTEE_LEVEL }, () => 0.99);
    forced.m.open();
    expect(forced.m.choices.filter((c) => c.kind === "skill" && c.def.kind === "branch")).toHaveLength(2);
  });

  it("选中分岔:技能入场、解锁其节律、记下选择;另一分岔从此在 50 轮里一次都不再出", () => {
    const { m, st } = makeModel({ level: BRANCH_GUARANTEE_LEVEL });
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "skill" && c.def.id === "vera_walker");
    expect(i).toBeGreaterThanOrEqual(0);
    const r = m.pick(i);
    expect(r).toEqual({ ok: true, kind: "skill" });
    expect(m.visible).toBe(false);
    expect(st.skills.map((s) => s.skillId)).toEqual(["vera_core", "vera_walker"]);
    expect(st.rhythms).toEqual(["hit", "move"]);
    expect(st.branchChosen).toBe("vera_walker");
    expect(st.recorded.map((e) => e.skillId)).toEqual(["vera_walker"]);
    for (let k = 0; k < 50; k++) {
      m.open();
      expect(m.choices.some((c) => c.kind === "skill" && c.def.id === "vera_armor"), `第 ${k} 轮`).toBe(false);
      m.resetRun();
      st.chapter = 1;
    }
  });

  it("升阶:原地升场上那件(等级 +1、主数值按共享层倍率放大),不重复登记图鉴;5 阶后不再出现升阶卡", () => {
    const { m, st } = makeModel();
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "rank");
    const before = st.skills[0].effect.params.damage!;
    expect(m.pick(i)).toEqual({ ok: true, kind: "rank" });
    expect(st.skills[0].level).toBe(2);
    expect(st.skills[0].effect.params.damage).toBeGreaterThan(before);
    expect(st.recorded).toHaveLength(0);
    st.skills[0].level = SKILL_MAX_RANK;
    m.open();
    expect(m.choices.some((c) => c.kind === "rank" && c.skillId === "vera_core")).toBe(false);
  });

  it("节律强化:回写等级 +1;满级不再出现;满级那格若已在卡上则不可选", () => {
    const { m, st } = makeModel();
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "rhythm");
    expect(m.pick(i)).toEqual({ ok: true, kind: "rhythm" });
    expect(st.rhythmLevel.hit).toBe(2);
    st.rhythmLevel.hit = RHYTHM_MAX_LEVEL;
    m.open();
    expect(m.choices.some((c) => c.kind === "rhythm")).toBe(false);
  });

  it("技能池耗尽 → 兜底三张(回气 / 赏金 / 壮体),各自结算到玩家身上", () => {
    const { m, st } = makeModel({ level: 30, branchChosen: "vera_armor" });
    st.skills.push(makeSkillEquipment(heroSkills("vera")[1]), makeSkillEquipment(heroSkills("vera")[3]));
    for (const s of st.skills) s.level = SKILL_MAX_RANK;
    st.rhythms = ["hit", "hurt"];
    st.rhythmLevel = { hit: RHYTHM_MAX_LEVEL, hurt: RHYTHM_MAX_LEVEL };
    m.open();
    expect(m.choices.map((c) => c.kind)).toEqual(["fallback", "fallback", "fallback"]);
    expect(m.choices.map((c) => (c.kind === "fallback" ? c.id : ""))).toEqual(["heal30", "gold80", "hp8"]);
    expect(m.pick(0)).toEqual({ ok: true, kind: "fallback" });
    expect(st.hp).toBe(90);
    m.open();
    m.pick(1);
    expect(st.gold).toBe(180);
    m.open();
    m.pick(2);
    expect([st.maxHp, st.hp]).toEqual([108, 98]);
  });

  it("文案:技能卡走技能表的名与说明,分岔标出解锁的节律,升阶卡有数值差一行,节律卡写等级变化", () => {
    const { m, st } = makeModel({ level: BRANCH_GUARANTEE_LEVEL });
    m.open();
    const c = m.content();
    expect(c.title).toBe(LV_TEXT.title);
    expect(c.readoutText.includes("Lv.8")).toBe(true);
    expect(c.readoutText.includes("受击 Lv.1")).toBe(true);
    expect(c.readoutText.includes(`本章免费重随 ${LEVELUP_FREE_REROLL_PER_CHAPTER}`)).toBe(true);
    const branch = c.cards[0];
    expect(branch.kind).toBe("skill");
    expect(branch.tagText.startsWith(LV_TEXT.tagBranch)).toBe(true);
    expect(branch.qualityText).toBe(`${LV_TEXT.kindBranch} · 1 阶`);
    expect(branch.descLines[0].length).toBeGreaterThan(0);
    expect(branch.pickEnabled).toBe(true);
    expect(branch.lockEnabled).toBe(true);
    expect(branch.rerollText).toBe(`${LV_TEXT.rerollPrefix}${LEVELUP_FREE_REROLL_PER_CHAPTER}${LV_TEXT.rerollSuffix}`);
    // 升阶卡
    m.resetRun();
    const { m: m2, st: st2 } = makeModel();
    m2.open();
    const ri = m2.choices.findIndex((x) => x.kind === "rank");
    const rank = m2.content().cards[ri];
    expect(rank.kind).toBe("rank");
    expect(rank.tagText).toBe(LV_TEXT.tagRank);
    expect(rank.deltaText.startsWith(`${LEVELUP_MAIN_LABELS.damage} `)).toBe(true);
    expect(rank.qualityText.includes("1 → 2 阶")).toBe(true);
    void st2;
    // 节律卡
    const yi = m2.choices.findIndex((x) => x.kind === "rhythm");
    const rhythm = m2.content().cards[yi];
    expect(rhythm.tagText).toBe(LV_TEXT.tagRhythm);
    expect(rhythm.nameText).toBe("受击节律");
    expect(rhythm.qualityText).toBe("节律 · Lv.1 → 2");
    expect(rhythm.deltaText).toBe("");
    void st;
  });

  it("折行是纯函数:按字符预算逐段切、超上限截断", () => {
    expect(levelUpDescLines(["一二三四五六", "七八"], 4, 8)).toEqual(["一二三四", "五六", "七八"]);
    expect(levelUpDescLines(["一二三四五六七八九十"], 3, 2)).toEqual(["一二三", "四五六"]);
    expect(levelUpDeltaText(null, generateEquipment(1))).toBe("");
  });
});

/* ==================== 5. 免费重随 ==================== */

describe("分岔预告(R3:A + 预告)", () => {
  const tease = (m: LevelUpModel) => {
    const t = m.content().readoutText;
    return t.includes("分岔将在") ? "before" : t.includes("分岔最迟") ? "due" : "";
  };

  it("表值:预告起始 3 级,早于分岔起始 5 级、保底 8 级", () => {
    expect(BRANCH_TEASE_LEVEL).toBe(3);
    expect(BRANCH_TEASE_LEVEL).toBeLessThan(BRANCH_MIN_LEVEL);
    expect(BRANCH_MIN_LEVEL).toBeLessThan(BRANCH_GUARANTEE_LEVEL);
  });

  it("等级轴:< 3 不提;3–4「将在 Lv.5 后出现」;5–7 未出成对「最迟 Lv.8」;成对在场或 ≥ 8 不提", () => {
    const lv2 = makeModel({ level: BRANCH_TEASE_LEVEL - 1 }).m;
    lv2.open();
    expect(tease(lv2)).toBe("");
    const lv3 = makeModel({ level: BRANCH_TEASE_LEVEL }).m;
    lv3.open();
    expect(tease(lv3)).toBe("before");
    expect(lv3.content().readoutText.includes(`Lv.${BRANCH_MIN_LEVEL} 后出现`)).toBe(true);
    // 5 级、随机源 0.9 → 这一轮不出成对 → 「最迟」
    const due = makeModel({ level: BRANCH_MIN_LEVEL }, () => 0.9).m;
    due.open();
    expect(due.choices.some((c) => c.kind === "skill" && c.def.kind === "branch")).toBe(false);
    expect(tease(due)).toBe("due");
    expect(due.content().readoutText.includes(`最迟 Lv.${BRANCH_GUARANTEE_LEVEL}`)).toBe(true);
    // 5 级、随机源 0.1 → 成对在场 → 不再预告
    const pair = makeModel({ level: BRANCH_MIN_LEVEL }, () => 0.1).m;
    pair.open();
    expect(pair.choices.some((c) => c.kind === "skill" && c.def.kind === "branch")).toBe(true);
    expect(tease(pair)).toBe("");
    const guaranteed = makeModel({ level: BRANCH_GUARANTEE_LEVEL }).m;
    guaranteed.open();
    expect(tease(guaranteed)).toBe("");
  });

  it("分岔已选不提;首章三选一形态不提", () => {
    const { m, st } = makeModel({ level: BRANCH_GUARANTEE_LEVEL });
    m.open();
    m.pick(m.choices.findIndex((c) => c.kind === "skill" && c.def.id === "vera_walker"));
    expect(st.branchChosen).toBe("vera_walker");
    st.level = BRANCH_TEASE_LEVEL;
    m.open();
    expect(tease(m)).toBe("");
    const first = makeModel({ level: BRANCH_TEASE_LEVEL }).m;
    first.openFirstPick();
    expect(tease(first)).toBe("");
  });
});

describe("免费重随", () => {
  it("每章 LEVELUP_FREE_REROLL_PER_CHAPTER 次;用完后那一格重随恒拒且一个状态都不改;进下一章清零", () => {
    const { m, st } = makeModel();
    m.open();
    expect(m.rerollsLeft()).toBe(LEVELUP_FREE_REROLL_PER_CHAPTER);
    expect(m.canReroll(0)).toBe(true);
    expect(m.reroll(0)).toBe(true);
    expect(m.rerollsLeft()).toBe(0);
    const snapshot = JSON.stringify(m.choices.map((c) => (c.kind === "rhythm" ? c.rhythm : c.kind === "fallback" ? c.id : c.kind === "reset" ? "reset" : c.kind === "passive" ? c.p.name : c.eq.name)));
    expect(m.reroll(1)).toBe(false);
    expect(m.canReroll(1)).toBe(false);
    expect(JSON.stringify(m.choices.map((c) => (c.kind === "rhythm" ? c.rhythm : c.kind === "fallback" ? c.id : c.kind === "reset" ? "reset" : c.kind === "passive" ? c.p.name : c.eq.name)))).toBe(snapshot);
    expect(m.content().cards[1].rerollEnabled).toBe(false);
    expect(st.gold, "重随不花金币").toBe(100);
    // 换章
    m.pick(0);
    st.chapter = 2;
    m.open();
    expect(m.rerollsLeft()).toBe(LEVELUP_FREE_REROLL_PER_CHAPTER);
  });

  it("重随后的那一格不与本轮其余两格重复(身份键排除)", () => {
    for (let seed = 0; seed < 20; seed++) {
      const { m } = makeModel({ level: BRANCH_GUARANTEE_LEVEL }, () => ((seed * 37) % 100) / 100);
      m.open();
      const others = m.choices.filter((_, k) => k !== 2).map((c) => JSON.stringify(c.kind === "rhythm" ? c.rhythm : c.kind === "fallback" ? c.id : c.kind === "rank" ? c.skillId : c.kind === "reset" ? "reset" : c.kind === "passive" ? c.p.name : c.eq.name));
      expect(m.reroll(2)).toBe(true);
      const now = m.choices[2];
      const key = JSON.stringify(now.kind === "rhythm" ? now.rhythm : now.kind === "fallback" ? now.id : now.kind === "rank" ? now.skillId : now.kind === "reset" ? "reset" : now.kind === "passive" ? now.p.name : now.eq.name);
      expect(others.includes(key), `seed ${seed}`).toBe(false);
    }
  });
});

/* ==================== 6. 锁定 ==================== */

describe("锁定", () => {
  it("最多锁 LEVELUP_LOCK_LIMIT 张:换锁就是把上一格释放掉", () => {
    const { m } = makeModel();
    m.open();
    expect(m.lockLeft()).toBe(LEVELUP_LOCK_LIMIT);
    expect(m.toggleLock(0)).toBe(true);
    expect([m.lockedIndex, m.lockLeft()]).toEqual([0, 0]);
    expect(m.content().cards[0].locked).toBe(true);
    expect(m.content().cards[0].lockText).toBe(LV_TEXT.lockOff);
    expect(m.content().cards[1].lockEnabled).toBe(true);
    expect(m.toggleLock(1)).toBe(true);
    expect(m.lockedIndex).toBe(1);
    expect(m.content().cards[0].locked).toBe(false);
    expect(m.toggleLock(1)).toBe(true);
    expect(m.lockedIndex).toBe(-1);
  });

  it("锁定卡不进重随池:那一格重随恒拒", () => {
    const { m } = makeModel();
    m.open();
    m.toggleLock(0);
    expect(m.canReroll(0)).toBe(false);
    expect(m.reroll(0)).toBe(false);
    expect(m.rerollsLeft()).toBe(LEVELUP_FREE_REROLL_PER_CHAPTER);
  });

  it("被锁的卡下一轮必再出现且恒落第 0 格;带走它 → 锁定兑现并清掉;resetRun 后不再带", () => {
    const { m } = makeModel();
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "skill");
    m.toggleLock(i);
    const picked = m.choices[i];
    // 选走另一张,弹层关掉
    const other = m.choices.findIndex((c) => c.kind === "rhythm");
    expect(m.pick(other).ok).toBe(true);
    m.open();
    expect(m.choices[0]).toBe(picked);
    expect(m.lockedIndex).toBe(0);
    expect(m.choices).toHaveLength(LEVELUP_OFFER_COUNT);
    expect(m.content().cards[0].tagText).toBe(LV_TEXT.tagLocked);
    // 带走锁定卡
    expect(m.pick(0).ok).toBe(true);
    m.open();
    expect(m.lockedIndex).toBe(-1);
    // 锁定不跨局
    m.toggleLock(0);
    m.resetRun();
    m.open();
    expect(m.lockedIndex).toBe(-1);
  });

  it("锁定的升阶卡下一轮按场上现阶重新预览;目标已满阶则锁定失效", () => {
    const { m, st } = makeModel();
    m.open();
    const ri = m.choices.findIndex((c) => c.kind === "rank");
    m.toggleLock(ri);
    const yi = m.choices.findIndex((c) => c.kind === "rhythm");
    m.pick(yi);
    st.skills[0].level = 3; // 场上那件在两轮之间升过阶
    m.open();
    expect(m.choices[0].kind).toBe("rank");
    expect(m.choices[0].kind === "rank" && m.choices[0].eq.level).toBe(4);
    m.toggleLock(0); // 保持锁定
    m.pick(1);
    st.skills[0].level = SKILL_MAX_RANK;
    m.open();
    expect(m.lockedIndex).toBe(-1);
    expect(m.choices.some((c) => c.kind === "rank")).toBe(false);
  });
});

/* ==================== 7. 首章法宝三选一 ==================== */

describe("首章法宝三选一", () => {
  it("FIRST_PICK_COUNT 张主动法宝,效果互不相同,至少 FIRST_PICK_RESONANCE_GUARANTEE 张与本命共鸣;不可锁、可免费重随", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { m } = makeModel({}, () => ((seed * 53 + 7) % 100) / 100);
      m.openFirstPick();
      expect(m.mode).toBe("first");
      expect(m.visible).toBe(true);
      expect(m.choices).toHaveLength(FIRST_PICK_COUNT);
      expect(m.choices.every((c) => c.kind === "equip" && c.eq.kind === "active")).toBe(true);
      const types = m.choices.map((c) => (c.kind === "equip" ? c.eq.effect.def.type : ""));
      expect(new Set(types).size).toBe(FIRST_PICK_COUNT);
      const resonant = m.choices.filter((c) => c.kind === "equip" && equipmentResonant(c.eq)).length;
      expect(resonant, `seed ${seed}`).toBeGreaterThanOrEqual(FIRST_PICK_RESONANCE_GUARANTEE);
      for (const c of m.choices) if (c.kind === "equip") expect(c.eq.triggers.every((t) => t.def.type === "hit")).toBe(true);
      expect(m.canLock(0)).toBe(false);
      expect(m.toggleLock(0)).toBe(false);
      expect(m.canReroll(0)).toBe(true);
      const cards = m.content().cards;
      expect(m.content().title).toBe(LV_TEXT.titleFirst);
      for (const card of cards) {
        expect(card.kind).toBe("equip");
        expect(card.lockEnabled).toBe(false);
        expect(([LV_TEXT.tagResonant, LV_TEXT.tagEquip] as string[]).includes(card.tagText)).toBe(true);
      }
      const hi = cards.find((card) => card.hidden);
      expect(hi?.tagText).toBe(LV_TEXT.tagResonant);
      expect(hi?.color).toBe(qualityDef("hidden").color);
    }
  });

  it("选它:法宝按引用 push 进主动槽并登记图鉴,弹层关掉,不扣金币;空槽不够时选不了", () => {
    const { m, st } = makeModel();
    m.openFirstPick();
    const eq = (m.choices[1] as { kind: "equip"; eq: Equipment }).eq;
    expect(m.pick(1)).toEqual({ ok: true, kind: "equip" });
    expect(st.equipment[0]).toBe(eq);
    expect(st.recorded[0]).toBe(eq);
    expect(st.gold).toBe(100);
    expect(m.visible).toBe(false);
    const full = makeModel({ baseSlots: 0 });
    full.m.openFirstPick();
    expect(full.m.canPick(0)).toBe(false);
    expect(full.m.pick(0)).toEqual({ ok: false, reason: "slots" });
    expect(full.m.visible).toBe(true);
  });

  it("首章重随换一张不同效果的法宝,占用本章那一次免费重随", () => {
    const { m } = makeModel();
    m.openFirstPick();
    const before = m.choices.map((c) => (c.kind === "equip" ? c.eq.effect.def.type : ""));
    expect(m.reroll(0)).toBe(true);
    const after = m.choices.map((c) => (c.kind === "equip" ? c.eq.effect.def.type : ""));
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after.includes(after[0]) && new Set(after).size).toBe(3);
    expect(m.rerollsLeft()).toBe(0);
  });
});

/* ==================== 8. 经验入口 ==================== */

describe("经验入口", () => {
  it("Player.addXp 做了三件事:扣经验 / 抬等级 / 按 LEVELUP_HEAL_PCT 回一口血(封顶 maxHp),不动 maxHp", () => {
    const p = new Player();
    expect([p.level, p.xp, p.maxHp]).toEqual([1, 0, PLAYER_BASE.maxHp]);
    const maxHp = p.maxHp;
    p.hp = Math.floor(maxHp / 2);
    const need = xpToNext(1);
    expect(p.addXp(need - 1)).toBe(false);
    expect([p.level, p.hp]).toEqual([1, Math.floor(maxHp / 2)]);
    expect(p.addXp(1)).toBe(true);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(0);
    // maxHp 的成长在 levelUpGrowth 里(世界层 killEnemy 按级数调),addXp 不碰
    expect(p.maxHp).toBe(maxHp);
    expect(p.hp).toBe(Math.min(maxHp, Math.floor(maxHp / 2) + Math.floor(maxHp * LEVELUP_HEAL_PCT)));
    const q = new Player();
    q.hp = q.maxHp;
    q.addXp(xpToNext(1));
    expect(q.hp).toBe(q.maxHp);
  });

  it("真跑 BattleSim:killEnemy 接了 addXp,升级按级数报上来,级数之和 = 等级增量,每级 +hpPerLevel 最大生命", () => {
    const save = emptySave();
    save.energy = 99;
    const levels: number[] = [];
    const sim = new BattleSim({
      save,
      input: { isMoving: false, moveDir: vec2(0, 0) },
      worldH: 996,
      persist: () => {},
      callbacks: {
        onDamage: () => {},
        onDeath: () => {},
        onVictory: () => {},
        onChapterShop: () => {},
        onLevelUp: (n) => levels.push(n),
      },
    });
    expect(sim.startStage(1)).toBe(true);
    expect(sim.player.level).toBe(1);
    let f = 0;
    while (sim.player.level < 3 && f < 4000) {
      sim.update(1 / 60);
      f += 1;
    }
    expect(f, "4000 帧内应至少升到 3 级").toBeLessThan(4000);
    expect(sim.player.level).toBeGreaterThanOrEqual(3);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.reduce((a, b) => a + b, 0)).toBe(sim.player.level - 1);
    expect(levels.every((n) => n >= 1)).toBe(true);
    // B2 等级收益:每级 +hpPerLevel(docs/DESIGN-SEASON-FEEL.md)
    expect(sim.player.maxHp).toBe(PLAYER_BASE.maxHp + PLAYER_BASE.hpPerLevel * (sim.player.level - 1));
  });

  it("世界层 killEnemy:一句 addXp + 按级数 levelUpGrowth,不另写回血", () => {
    const src = fileSource(BATTLE_WORLD);
    const kill = codeOf(src.slice(src.indexOf("private killEnemy("), src.indexOf("/* ================= 引导与商店辅助")));
    expect(kill.includes("this.player.addXp(e.def.xp)")).toBe(true);
    expect(kill.includes("this.host.onLevelUp?.(")).toBe(true);
    expect(kill.includes("this.player.levelUpGrowth()")).toBe(true);
    expect(kill.includes("LEVELUP_HEAL_PCT")).toBe(false);
    expect((codeOf(src).match(/levelUpGrowth/g) ?? []).length).toBe(1);
    expect((src.match(/this\.player\.addXp\(/g) ?? []).length).toBe(1);
  });

  it("宿主事件是**可选**成员:Web 冻结基准 src/game.ts 的 battleHost 不必实现它", () => {
    const bw = fileSource(BATTLE_WORLD);
    const host = bw.slice(bw.indexOf("export interface BattleWorldHost"), bw.indexOf("export interface BattleWorldOptions"));
    expect(host.includes("onLevelUp?(levels: number): void")).toBe(true);
    expect(host.includes("onBossSpawned?(): void")).toBe(true);
    const sim = fileSource("../cocos/assets/scripts/battle/BattleSim.ts");
    expect(sim.includes("onLevelUp?(levels: number): void;")).toBe(true);
    expect(sim.includes("onLevelUp: (levels) => this.cb.onLevelUp?.(levels),")).toBe(true);
    expect(fileSource("../src/game.ts").includes("onLevelUp")).toBe(false);
  });
});

/* ==================== 9. 出卡策略纯函数 ==================== */

describe("出卡策略 rollSkillOffers(纯函数)", () => {
  const base = () => ({
    heroId: "vera" as HeroId,
    owned: new Map<string, number>([["vera_core", 1]]),
    branchChosen: null as string | null,
    playerLevel: 1,
    rhythms: new Map<RhythmId, number>([["hit", 1]]),
  });

  it("候选耗尽时用兜底补齐到 count,且兜底互不重复", () => {
    const input = { ...base(), owned: new Map<string, number>([["vera_core", 5], ["vera_blood", 5], ["vera_armor", 5]]), branchChosen: "vera_armor", rhythms: new Map<RhythmId, number>([["hit", 5], ["hurt", 5]]) };
    const out = rollSkillOffers(input, 3, () => 0.5);
    expect(out.map((o) => o.kind)).toEqual(["fallback", "fallback", "fallback"]);
    expect(new Set(out.map((o) => (o.kind === "fallback" ? o.id : ""))).size).toBe(3);
  });

  it("排除集生效:被排除的身份不再出", () => {
    const input = { ...base(), exclude: new Set(["skill:vera_blood", "rank:vera_core"]) };
    const out = rollSkillOffers(input, 3, () => 0.5);
    expect(out.some((o) => o.kind === "skill" && o.def.id === "vera_blood")).toBe(false);
    expect(out.some((o) => o.kind === "rank")).toBe(false);
    expect(out[0]).toEqual({ kind: "rhythm", rhythm: "hit" });
  });

  it("权重抽样不放回:同一身份在一轮里只出一次;count = 1 时分岔不占位", () => {
    for (let s = 0; s < 40; s++) {
      const out = rollSkillOffers({ ...base(), playerLevel: BRANCH_GUARANTEE_LEVEL }, 3, () => (s % 10) / 10);
      const keys = out.map((o) => JSON.stringify(o.kind === "skill" ? o.def.id : o.kind === "rank" ? o.skillId : o.kind === "rhythm" ? o.rhythm : o.kind === "reset" ? "reset" : o.id));
      expect(new Set(keys).size).toBe(keys.length);
    }
    const one = rollSkillOffers({ ...base(), playerLevel: BRANCH_GUARANTEE_LEVEL }, 1, () => 0);
    expect(one).toHaveLength(1);
    expect(one[0].kind === "skill" && one[0].def.kind).not.toBe("branch");
  });
});

/* ==================== 10. 层职责与接线纪律(源码) ==================== */

describe("三层分工的源码纪律", () => {
  it("模型层不引 cc、不引宿主侧 ViewTable;几何一律转调共享层", () => {
    const model = fileSource(MODEL);
    expect(model.includes('from "cc"')).toBe(false);
    expect(model.includes("ViewTable")).toBe(false);
    expect(model.includes('from "../game/ui/levelUpLayout"')).toBe(true);
    expect(model.includes("levelUpScreenLayout(w, screenH)")).toBe(true);
    // 一枚坐标都不在模型里算
    for (const banned of ["evenDown", "levelUpBox", "levelUpCardRect", "LV_BOX_H", "LV_CARD_H", "LV_BTN_TOP_DY"]) {
      expect(codeOf(bodyOf(model)).includes(banned), banned).toBe(false);
    }
  });

  it("共享层几何模块不引 cc、不引宿主类型", () => {
    const layout = fileSource(LAYOUT);
    const imps = importsOf(layout);
    expect(imps.includes('"cc"')).toBe(false);
    expect(imps.includes("DesignMetrics")).toBe(false);
    expect(imps.includes("ViewTable")).toBe(false);
    expect(imps.includes('from "./theme"')).toBe(true);
    expect(imps.split("\n").filter((l) => l.length > 0)).toEqual(['import { evenDown, fs, ui } from "./theme";']);
  });

  it("视图层不内联任何一枚盒与基线:几何只能来自模型层那一帧", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    const nums = [...body.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    expect(nums.filter((n) => ![0, 1, 1.25, 2].includes(n))).toEqual([]);
    for (const k of ["L.box", "L.banner", "L.title", "L.readout", "L.hint", "L.cards", "L.panelKey", "L.bannerKey", "g.rect", "g.quality", "g.name", "g.descLines", "g.delta", "g.tag", "g.pick", "g.reroll", "g.lock"]) {
      expect(body.includes(k), k).toBe(true);
    }
    expect(body.includes("i < LV_CARDS")).toBe(true);
    expect(body.includes("i < LV_DESC_MAX_LINES")).toBe(true);
    expect(body.includes('"Card1"')).toBe(false);
    expect(body.includes('"Card0Desc7"')).toBe(false);
  });

  it("视图层不算几何:evenDown / levelUpBox / rowTextY / LV_* 的宽高常量一个都不出现", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    for (const banned of ["evenDown", "levelUpBox", "levelUpLayout", "levelUpScreenLayout", "rowTextY", "LV_BOX_H", "LV_CARD_W", "LV_CARD_H", "LV_BTN_H", "LV_BTN_TOP_DY", "LV_PAD"]) {
      expect(body.includes(banned), banned).toBe(false);
    }
    expect(body.includes("hitLevelUp(this.hooks.layout(), p.x, p.y)")).toBe(true);
    expect(body.includes("e.propagationStopped = true")).toBe(true);
  });

  it("import 完整性:视图与宿主用到的每一个模型/共享层出口都在自己的 import 清单里", () => {
    const view = fileSource(VIEW);
    const vi = importsOf(view);
    for (const k of ["hitLevelUp", "LevelUpAction", "LevelUpCardContent", "LevelUpContent", "LV_CARDS", "LV_DESC_MAX_LINES", "LV_BTN_STROKE_W", "LvTextLine", "LevelUpLayout", "Plate", "fitOne", "flatBox", "placeLine", "qualityBox", "DESIGN_W", "fullRect", "logicalH", "placeRect", "toDesignSpace", "viewTable", "Graphics", "Label", "Node", "SpriteFrame", "UITransform"]) {
      expect(vi.includes(k), k).toBe(true);
    }
    const shell = fileSource(SHELL);
    const si = importsOf(shell);
    for (const k of ["LevelUpView", "LevelUpModel", "LevelUpAction", "LevelUpWorld"]) {
      expect(si.includes(k), k).toBe(true);
    }
    const model = fileSource(MODEL);
    const mi = importsOf(model);
    for (const k of ["LEVELUP_FREE_REROLL_PER_CHAPTER", "LEVELUP_LOCK_LIMIT", "LEVELUP_MAIN_LABELS", "LEVELUP_OFFER_COUNT", "FIRST_PICK_COUNT", "FIRST_PICK_RESONANCE_GUARANTEE", "UPGRADE_MAIN_KEYS", "equipmentDescription", "makeSkillEquipment", "upgradeEquipment", "rollSkillOffers", "FALLBACK_OFFERS", "SKILL_MAX_RANK", "RHYTHM_MAX_LEVEL", "qualityDef", "rareBonusFor", "LV_DESC_CHARS", "LV_DESC_MAX_LINES", "levelUpScreenLayout"]) {
      expect(mi.includes(k), k).toBe(true);
    }
    // 金币重随与隐藏词条通道已退出本屏
    for (const gone of ["rerollPrice", "REROLL_HIDDEN", "rerollCard", "generateChoices"]) expect(mi.includes(gone), gone).toBe(false);
  });

  it("视图只摆节点:所有落位走 placeLine / placeRect / Plate.show / qualityBox.draw / flatBox.draw", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    expect((body.match(/placeLine\(/g) ?? []).length).toBe(1);
    expect(body.includes("placeRect(this.capture, fullRect())")).toBe(true);
    expect(body.includes("placeRect(this.dim, r)")).toBe(true);
    expect((body.match(/\.set\(g\./g) ?? []).length).toBeGreaterThanOrEqual(6);
    for (const banned of ["setPosition", "contentSize =", "anchorX", "anchorY"]) expect(body.includes(banned), banned).toBe(false);
  });
});

describe("配色入表", () => {
  const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const defs: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(lv\w+):\s*"([^"]*)",$/gm)) defs[m[1]] = m[2];

  it("lv* 段 25 键齐全,色值一律 6 位大写十六进制或 rgba 串", () => {
    expect(Object.keys(defs).length).toBe(25);
    for (const [k, v] of Object.entries(defs)) {
      expect(v.startsWith("rgba(") || /^#[0-9A-F]{6}$/.test(v), `${k}=${v}`).toBe(true);
    }
  });

  it("共鸣高亮档与 quality 主表 hidden 档同值(同一支色,两处同数)", () => {
    expect(defs.lvCardTagHidden).toBe(qualityDef("hidden").color.toUpperCase());
  });

  it("视图消费的每一个 lv* 键都在表里(不漏键 → 不会静默 undefined)", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    const used = [...body.matchAll(/p4\.(lv\w+)/g)].map((m) => m[1]);
    expect(new Set(used).size).toBeGreaterThanOrEqual(20);
    for (const k of new Set(used)) expect(Object.keys(defs).includes(k), k).toBe(true);
    const iface = src.slice(src.indexOf("/* ---------- 升级三选一弹层"), src.indexOf("export const PHASE4_DEFAULTS"));
    for (const k of Object.keys(defs)) expect(iface.includes(`${k}: string;`), k).toBe(true);
  });

  it("已有键一枚都没动:cf* 段仍是 13 键、en* 段仍是 22 键", () => {
    const cf = [...block.matchAll(/^\s{4}(cf\w+):/gm)].map((m) => m[1]);
    expect(cf.length).toBe(13);
    const en = [...block.matchAll(/^\s{4}(en\w+):/gm)].map((m) => m[1]);
    expect(en.length).toBe(22);
  });
});

describe("GameShell 接线", () => {
  const src = fileSource(SHELL);
  const body = codeOf(src);
  const section = codeOf(src.slice(src.indexOf("/* ================= 升级三选一弹层"), src.indexOf("/* ================= 二次确认弹层")));

  it("弹层不挂路由:SCREEN_KEYS 仍是 16 态、注册列表里没有 levelup、sync 钩子仍是 13 条", () => {
    const router = fileSource("../cocos/assets/scripts/core/ScreenRouter.ts");
    const keys = [...router.slice(router.indexOf("export const SCREEN_KEYS"), router.indexOf("] as const")).matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(keys.length).toBe(16);
    expect(keys.some((k) => k.includes("level"))).toBe(false);
    const list = body.slice(body.indexOf('(["battle", "menu"'), body.indexOf("] as ScreenKey[])"));
    expect((list.match(/"/g) || []).length / 2).toBe(16);
    expect(list.toLowerCase().includes("levelup")).toBe(false);
    const hooks = body.slice(body.indexOf("const hooks: Partial<Record<ScreenKey"), body.indexOf("] as ScreenKey[])"));
    expect((hooks.match(/: \(\) => this\.sync\w+\(\)/g) || []).length).toBe(13);
    expect(hooks.toLowerCase().includes("levelup")).toBe(false);
  });

  it("弹层挂在 Overlay 常驻层上,装配点排在 Overlay 建出与二次确认弹层之后", () => {
    expect(section.includes("this.overlay ?? this.worldLayer")).toBe(true);
    expect(section.includes("screenLayer")).toBe(false);
    expect(section.includes("Screen:")).toBe(false);
    const layers = body.slice(body.indexOf("private buildLayers()"), body.indexOf("private buildScreens()"));
    const at = (s: string) => layers.indexOf(s);
    expect(at('this.overlay = makeNode("Overlay", this.worldLayer);')).toBeGreaterThan(0);
    expect(at("this.buildConfirmLayer();")).toBeGreaterThan(at('this.overlay = makeNode("Overlay", this.worldLayer);'));
    expect(at("this.buildLevelUpLayer();")).toBeGreaterThan(at("this.buildConfirmLayer();"));
    expect(layers.match(/this\.build\w+Screen\(\);/g)?.length).toBe(14);
  });

  it("开着就顶到 Overlay 末位压过懒建的 toast(与二次确认弹层同一处置)", () => {
    expect(section.includes("v.root.setSiblingIndex(parent.children.length - 1)")).toBe(true);
    expect(section.includes("v.root.active = m.visible;")).toBe(true);
  });

  it("弹层开着就把战斗停住:闸门排在路由闸门之前、每日重置与赛季翻页之后", () => {
    const loop = codeOf(src.slice(src.indexOf("    update(dt: number): void {"), src.lastIndexOf("}")));
    const at = (s: string) => loop.indexOf(s);
    expect(at("if (this.levelUpModel?.visible) return;")).toBeGreaterThan(0);
    expect(at("if (this.levelUpModel?.visible) return;")).toBeLessThan(at("if (this.router.blocksPlay()) return;"));
    expect(at("if (this.levelUpModel?.visible) return;")).toBeGreaterThan(at("this.tickSeason();"));
    expect(at("if (this.levelUpModel?.visible) return;")).toBeGreaterThan(at("if (this.sim.syncDaily())"));
    expect(at("this.sim.update(step)")).toBeGreaterThan(at("if (this.router.blocksPlay()) return;"));
    expect(at("if (this.levelUpPending > 0 && !this.levelUpModel?.visible) this.openLevelUp();")).toBeGreaterThan(0);
    expect(at("if (this.levelUpPending > 0 && !this.levelUpModel?.visible) this.openLevelUp();")).toBeLessThan(at("if (this.levelUpModel?.visible) return;"));
  });

  it("世界层事件 → 排队 → 开层:连升多级按级数一轮一弹,选完还有余量就接着弹;首章三选一不占队列", () => {
    expect(section.includes("this.levelUpPending += levels;")).toBe(true);
    expect(section.includes("if (!this.levelUpModel?.visible) this.openLevelUp();")).toBe(true);
    expect(section.includes("if (!first) this.levelUpPending = Math.max(0, this.levelUpPending - 1);")).toBe(true);
    expect(section.includes("if (this.levelUpPending > 0) this.openLevelUp();")).toBe(true);
    expect(section.includes('if (this.router.current !== "battle" || this.confirm) return;')).toBe(true);
    expect(body.includes("onLevelUp: (levels) => this.onLevelUp(levels),")).toBe(true);
  });

  it("写回局内态而不是存档:技能 / 法宝数组走 getter 取活引用,节律与分岔回写玩家,金币与商店屏同一份账", () => {
    expect(section.includes("return sim.player.equipment;")).toBe(true);
    expect(section.includes("return sim.player.skills;")).toBe(true);
    expect(section.includes("heroId: () => sim.world.heroId(),")).toBe(true);
    expect(section.includes("rhythms: () => sim.player.rhythms,")).toBe(true);
    expect(section.includes("sim.player.unlockRhythm(r);")).toBe(true);
    expect(section.includes("sim.player.branchChosen = id;")).toBe(true);
    expect(section.includes("gold: () => sim.gold,")).toBe(true);
    expect(section.includes("sim.world.gold = v;")).toBe(true);
    expect(section.includes("recordEquipment: (eq) => sim.world.recordEquipment(eq),")).toBe(true);
    expect(section.includes("this.levelUpModel = model;")).toBe(true);
    expect(section.includes("layout: () => model.layout(DESIGN_W, logicalH())")).toBe(true);
    for (const banned of [".persist(", "writeSave", "commit"]) expect(section.includes(banned), banned).toBe(false);
  });

  it("本局复位挂在开局漏斗上:enterBattleRun 里清队列与模型态,并在主动槽为空时弹首章法宝三选一", () => {
    const enter = codeOf(src.slice(src.indexOf("private enterBattleRun()"), src.indexOf("private requestStage(")));
    expect(enter.includes("this.levelUpPending = 0;")).toBe(true);
    expect(enter.includes("this.levelUpModel?.resetRun();")).toBe(true);
    expect(enter.includes("this.levelUpModel.openFirstPick();")).toBe(true);
    expect(enter.includes("this.sim.player.equipment.length === 0")).toBe(true);
    expect(enter.includes("this.syncLevelUp();")).toBe(true);
    expect(enter.includes("this.resetGameOverTransients();")).toBe(true);
  });

  it("晚到贴图流到位后本层也换引用,且开着就补排一次", () => {
    expect(body.includes("this.levelUpView?.setFrames(this.frames);")).toBe(true);
    expect(body.includes("if (this.levelUpModel?.visible) this.syncLevelUp();")).toBe(true);
  });

  it("本屏不走广告入口:分节里没有 watchAd / adPending / showRewardedAd,全仓闸门仍只 1 道", () => {
    for (const banned of ["watchAd", "adPending", "showRewardedAd", "AdChannel"]) {
      expect(section.includes(banned), `GameShell 分节里的 ${banned}`).toBe(false);
    }
    expect((body.match(/if \(this\.adPending\) return;/g) || []).length).toBe(1);
    for (const rel of [MODEL, VIEW, LAYOUT, DATA]) {
      const code = codeOf(fileSource(rel));
      for (const banned of ["watchAd", "adPending", "showRewardedAd", "AdChannel"]) {
        expect(code.includes(banned), `${rel} 里的 ${banned}`).toBe(false);
      }
    }
  });
});

/* ==================== 11. 资源与 meta ==================== */

describe("资源登记", () => {
  const metas = [
    ["../cocos/assets/scripts/game/data/levelUp.ts", "../cocos/assets/scripts/game/data/levelUp.ts.meta", "typescript"],
    ["../cocos/assets/scripts/game/data/rhythm.ts", "../cocos/assets/scripts/game/data/rhythm.ts.meta", "typescript"],
    ["../cocos/assets/scripts/game/data/artifacts.ts", "../cocos/assets/scripts/game/data/artifacts.ts.meta", "typescript"],
    ["../cocos/assets/scripts/game/data/heroSkills.ts", "../cocos/assets/scripts/game/data/heroSkills.ts.meta", "typescript"],
    ["../cocos/assets/scripts/game/ui/levelUpLayout.ts", "../cocos/assets/scripts/game/ui/levelUpLayout.ts.meta", "typescript"],
    ["../cocos/assets/scripts/levelup/LevelUpModel.ts", "../cocos/assets/scripts/levelup/LevelUpModel.ts.meta", "typescript"],
    ["../cocos/assets/scripts/levelup/LevelUpView.ts", "../cocos/assets/scripts/levelup/LevelUpView.ts.meta", "typescript"],
  ] as const;

  it("每个新 .ts 都配了 .meta,importer 与 ver 与既有 .ts.meta 同档", () => {
    for (const [ts, meta, importer] of metas) {
      expect(existsSync(new URL(ts, import.meta.url)), ts).toBe(true);
      expect(existsSync(new URL(meta, import.meta.url)), meta).toBe(true);
      const j = JSON.parse(readFileSync(new URL(meta, import.meta.url), "utf8")) as { ver: string; importer: string; imported: boolean; uuid: string };
      expect([j.ver, j.importer, j.imported]).toEqual(["4.0.24", importer, true]);
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(j.uuid)).toBe(true);
    }
    const dir = "../cocos/assets/scripts/levelup.meta";
    expect(existsSync(new URL(dir, import.meta.url))).toBe(true);
    const dj = JSON.parse(readFileSync(new URL(dir, import.meta.url), "utf8")) as { ver: string; importer: string };
    expect([dj.ver, dj.importer]).toEqual(["1.2.0", "directory"]);
  });

  it("新 uuid 与全仓既有 uuid 一枚都不撞", () => {
    const fresh = [...metas.map((m) => m[1]), "../cocos/assets/scripts/levelup.meta"].map(
      (p) => (JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as { uuid: string }).uuid
    );
    expect(new Set(fresh).size).toBe(fresh.length);
    const root = new URL("../cocos/assets/", import.meta.url);
    const seen = new Map<string, number>();
    for (const rel of readdirSync(root, { recursive: true })) {
      const p = String(rel).replace(/\\/g, "/");
      if (!p.endsWith(".meta")) continue;
      for (const m of readFileSync(new URL(p, root), "utf8").matchAll(/"uuid":\s*"([^"]+)"/g)) {
        seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
      }
    }
    for (const u of fresh) expect(seen.get(u), u).toBe(1);
  });
});
