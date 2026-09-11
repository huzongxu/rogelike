/**
 * 批次 A · A2 升级三选一弹层闸门:levelup(升级时弹哪三张卡 / 每张能干什么 / 点完战斗怎么恢复)。
 * 依据 docs/DESIGN-SEASON-FEEL.md 的「批次 A · A2」节与需求 F9。
 *
 * 延续 cocos-phase5-confirm 的四条纪律:
 *  1. **几何单一出口**:盒 / 横幅 / 三张卡 / 每卡三枚钮的矩形全部来自共享层
 *     `game/ui/levelUpLayout.ts`,模型层与宿主都不重算其中任何一个数;
 *  2. **断言按入参分档**:几何只吃 `(w, h)`,两档屏高(996 / 1246)下逐条矩形都是常量表,
 *     且**横向逐位相同**(盒是内容列锚,不是屏心锚)、纵向整体平移同一个 Δ;
 *  3. **视图无关**:本文件只吃 cc-free 的 `levelup/LevelUpModel.ts` 与共享层
 *     `game/ui/levelUpLayout` / `game/data/levelUp`;`LevelUpView.ts` 与 `GameShell.ts` /
 *     `ViewTable.ts` 那三侧 import 了 `cc`,node 不能直载,故只读源码文本;
 *  4. **行为优先于源码 grep**:经验入口那一条用真跑 `BattleSim` 3000 帧来验(升级事件按级数报上来、
 *     级数之和等于等级增量),源码 grep 只用来钉"没有顺手把 addXp 已经做过的事再做一遍"。
 *
 * 五条玩法口径按设计文钉开:重随价逐位等于 `rerollPrice(本章已重随次数)` 且金币不足时**一个状态都不改**;
 * 隐藏保底第 `REROLL_HIDDEN.pity` 次必出;锁定卡不进重随池且下一轮必再出现;「选它」把卡按引用
 * 原地 `push` 进局内装备数组(词缀引擎持同一引用)并关掉弹层;本屏**没有广告位**。
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
import { LEVELUP_ENSURE_RARE_TALENT, LEVELUP_LOCK_LIMIT, LEVELUP_MAIN_LABELS, LEVELUP_OFFER_COUNT } from "@game/data/levelUp";
import { REROLL_HIDDEN, rerollPrice } from "@game/data/reroll";
import { UPGRADE_MAIN_KEYS, generateEquipment, upgradeEquipment, type Choice, type Equipment } from "@game/data/equipmentGen";
import { QUALITIES, qualityDef } from "@game/data/quality";
import { LEVELUP_HEAL_PCT, PLAYER_BASE, xpToNext } from "@game/data/combat";
import { Player } from "@game/entities/player";
import { vec2 } from "@game/core/math";

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

/** 去掉块注释与整行注释(注释里的"本屏没有 watchAd"这类自陈不算代码事实) */
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
  gold: number;
  baseSlots: number;
  chapter: number;
  highestStage: number;
  recorded: Equipment[];
  setId: null;
}

function makeWorld(over: Partial<FakeState> = {}): { world: LevelUpWorld; st: FakeState } {
  const st: FakeState = {
    equipment: [],
    gold: 100000,
    baseSlots: 6,
    chapter: 1,
    highestStage: 1,
    recorded: [],
    setId: null,
    ...over,
  };
  const world: LevelUpWorld = {
    equipment: st.equipment,
    gold: () => st.gold,
    setGold: (v) => {
      st.gold = v;
    },
    slots: () => st.baseSlots,
    chapter: () => st.chapter,
    highestStage: () => st.highestStage,
    ownedTalents: () => [],
    selectedSet: () => st.setId,
    recordEquipment: (eq) => {
      st.recorded.push(eq);
    },
  };
  return { world, st };
}

/** 一件能拿去当"强化目标"的场上装备:固定 3 级,并塞一个已知的 damage 主数值。
 *  默认给到 100 而不是 10 —— 强化比例随等级档从 ×1.12 收敛到 ×1.03,基数够大才保证任何一档
 *  四舍五入后都真的涨了,于是"数值差那一行有字可写"不是靠运气。 */
function makeOwned(damage = 100): Equipment {
  const eq = generateEquipment(3);
  eq.effect.params.damage = damage;
  return eq;
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
  it("出卡数 / 锁定上限 / 保底稀有天赋都在 game/data/levelUp.ts,且与设计文同数", () => {
    expect(LEVELUP_OFFER_COUNT).toBe(3);
    expect(LEVELUP_LOCK_LIMIT).toBe(1);
    expect(LEVELUP_ENSURE_RARE_TALENT).toBe("affix_taste");
    const talents = fileSource("../cocos/assets/scripts/game/data/talents.ts");
    expect(talents.includes('"affix_taste"')).toBe(true);
    expect(talents.includes("升级时装备选项中至少有1件稀有品质")).toBe(true);
  });

  it("强化数值差的标签表键集派生自 UPGRADE_MAIN_KEYS(不另立第二份键表)", () => {
    expect(Object.keys(LEVELUP_MAIN_LABELS)).toEqual([...UPGRADE_MAIN_KEYS]);
    for (const v of Object.values(LEVELUP_MAIN_LABELS)) expect(v.length).toBeGreaterThan(0);
    const data = fileSource(DATA);
    expect(data.includes('import { UPGRADE_MAIN_KEYS } from "./equipmentGen";')).toBe(true);
    expect(data.includes("Record<(typeof UPGRADE_MAIN_KEYS)[number], string>")).toBe(true);
  });

  it("隐藏档色就是 quality 主表 hidden 档那一支(模型不另写一份 #4dffc8)", () => {
    const hidden = qualityDef("hidden");
    expect(hidden.color).toBe("#4dffc8");
    expect(QUALITIES.map((q) => q.key)).toContain("hidden");
    const { world } = makeWorld();
    const m = new LevelUpModel(world, () => 0); // roll 恒 0 → 首次重随即命中隐藏
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "equip");
    expect(m.reroll(i)).toBe(true);
    expect(m.hiddenHit[i]).toBe(true);
    const card = m.content().cards[i];
    expect(card.hidden).toBe(true);
    expect([card.color, card.frameKey]).toEqual([hidden.color, "frame_hidden"]);
    expect(card.tagText).toBe(LV_TEXT.tagHidden);
    // 模型源码里不出现色值字面量:色一律经 qualityDef 取
    expect(codeOf(fileSource(MODEL)).includes("4dffc8")).toBe(false);
  });

  it("重随价与隐藏概率/保底的唯一出处是 game/data/reroll.ts(模型与视图都不写死价格)", () => {
    expect(rerollPrice(0)).toBe(12);
    const { world } = makeWorld();
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    for (let n = 0; n < 5; n++) {
      expect(m.rerollCost(), `第 ${n} 次`).toBe(rerollPrice(n));
      expect(m.content().readoutText.includes(`重随 ${rerollPrice(n)} 金`)).toBe(true);
      expect(m.content().cards[0].rerollText).toBe(`${LV_TEXT.rerollPrefix}${rerollPrice(n)}${LV_TEXT.rerollSuffix}`);
      expect(m.reroll(0)).toBe(true);
    }
    expect(m.rerolls).toBe(5);
    for (const rel of [MODEL, VIEW, LAYOUT]) {
      const body = codeOf(bodyOf(fileSource(rel)));
      expect(body.includes("12 *")).toBe(false);
      expect(body.includes("1.5")).toBe(false);
      expect(body.includes("0.06")).toBe(false);
    }
  });

  it("卡等级 = max(章节 + 1, 已解锁最高关卡),与商店同一支算式", () => {
    const a = makeWorld({ chapter: 3, highestStage: 1 });
    expect(new LevelUpModel(a.world).cardLevel()).toBe(4);
    const b = makeWorld({ chapter: 1, highestStage: 7 });
    expect(new LevelUpModel(b.world).cardLevel()).toBe(7);
    const shop = fileSource("../cocos/assets/scripts/shop/ShopModel.ts");
    expect(shop.includes("return Math.max(this.w.chapter() + 1, this.w.highestStage());")).toBe(true);
  });
});

/* ==================== 4. 开层:三张卡 ==================== */

describe("开层", () => {
  it("恒出 LEVELUP_OFFER_COUNT 张卡,场上有装备时自带 1 张强化卡", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    expect(m.visible).toBe(true);
    expect(m.choices.length).toBe(LEVELUP_OFFER_COUNT);
    expect(m.choices.every((c) => c.kind === "equip")).toBe(true);
    expect(m.content().cards.length).toBe(LEVELUP_OFFER_COUNT);

    st.equipment.push(makeOwned());
    m.open();
    expect(m.choices.length).toBe(LEVELUP_OFFER_COUNT);
    expect(m.choices.filter((c) => c.kind === "upgrade").length).toBe(1);
  });

  it("词缀描述行复用 equipmentDescription(触发器 / 效果 / 修饰器三支都在),视图不自己拼串", () => {
    const { world, st } = makeWorld();
    const owned = makeOwned();
    st.equipment.push(owned);
    const m = new LevelUpModel(world);
    m.open();
    const up = m.choices.findIndex((c) => c.kind === "upgrade");
    const eq = m.choices[up].eq;
    const text = m.content().cards[up].descLines.join("");
    for (const t of eq.triggers) expect(text.includes(t.def.name), `触发器 ${t.def.name}`).toBe(true);
    expect(text.includes(eq.effect.def.name)).toBe(true);
    for (const mod of eq.modifiers) expect(text.includes(mod.def.name), `修饰器 ${mod.def.name}`).toBe(true);
    // 折行条数不越槽位上限,每行不越字符预算
    expect(m.content().cards[up].descLines.length).toBeLessThanOrEqual(LV_DESC_MAX_LINES);
    for (const line of m.content().cards[up].descLines) expect([...line].length).toBeLessThanOrEqual(LV_DESC_CHARS);
    const model = fileSource(MODEL);
    expect(model.includes("equipmentDescription")).toBe(true);
    for (const banned of ["describeTrigger(", "describeModifier(", "describeEffect("]) {
      expect(codeOf(bodyOf(model)).includes(banned), `${banned} 由 equipmentDescription 统一出口`).toBe(false);
    }
  });

  it("强化卡的数值差一行:标签走表、数字来自 UPGRADE_MAIN_KEYS,不碰成长系数", () => {
    const src = makeOwned();
    const base = src.effect.params.damage as number;
    const up = upgradeEquipment(JSON.parse(JSON.stringify(src)) as Equipment);
    const after = up.effect.params.damage as number;
    expect(after).toBeGreaterThan(base);
    expect(levelUpDeltaText(src, up)).toBe(`${LEVELUP_MAIN_LABELS.damage} ${base} → ${after}`);
    // 没有主数值变化 → 空串(槽位仍在,只是不写字)
    const same = JSON.parse(JSON.stringify(src)) as Equipment;
    expect(levelUpDeltaText(src, same)).toBe("");
    expect(levelUpDeltaText(null, same)).toBe("");
    // 非强化卡不写数值差
    const { world } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "equip");
    expect(m.content().cards[i].deltaText).toBe("");
    expect(m.content().cards[i].tagText).toBe(LV_TEXT.tagNew);
  });

  it("折行是纯函数:按字符预算逐段切、超上限截断", () => {
    expect(levelUpDescLines(["abcdefghij"], 4, 8)).toEqual(["abcd", "efgh", "ij"]);
    expect(levelUpDescLines(["abcd", "efgh"], 4, 1)).toEqual(["abcd"]);
    expect(levelUpDescLines([], 4, 8)).toEqual([]);
    expect(levelUpDescLines([""], 4, 8)).toEqual([]);
  });

  it("读数行给三件事:金币 / 下一次重随价 / 隐藏保底进度", () => {
    const { world } = makeWorld({ gold: 1234 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    expect(m.content().readoutText).toBe(`金币 1234 · 重随 ${rerollPrice(0)} 金 · 隐藏保底 0/${REROLL_HIDDEN.pity}`);
    m.reroll(0);
    expect(m.content().readoutText).toBe(`金币 ${1234 - rerollPrice(0)} · 重随 ${rerollPrice(1)} 金 · 隐藏保底 1/${REROLL_HIDDEN.pity}`);
  });
});

/* ==================== 5. 选它:写回局内装备 ==================== */

describe("选它", () => {
  it("新卡按引用原地 push 进局内装备数组、登记图鉴、弹层关闭", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    const arr = st.equipment;
    const i = m.choices.findIndex((c) => c.kind === "equip");
    const eq = m.choices[i].eq;
    const r = m.pick(i);
    expect(r.ok).toBe(true);
    expect(st.equipment).toBe(arr); // 数组身份不变(词缀引擎持同一引用)
    expect(st.equipment.length).toBe(1);
    expect(st.equipment[0]).toBe(eq); // 就是那一张,不是克隆
    expect(st.recorded).toEqual([eq]);
    expect(m.visible).toBe(false);
    expect(m.choices).toEqual([]);
    expect(m.canPick(0)).toBe(false);
  });

  it("强化卡原地升级场上那件,且不重复登记图鉴(与商店强化钮同口径)", () => {
    const { world, st } = makeWorld();
    const owned = makeOwned();
    const base = owned.effect.params.damage as number;
    st.equipment.push(owned);
    const m = new LevelUpModel(world);
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "upgrade");
    const lvBefore = owned.level;
    const r = m.pick(i);
    expect(r.ok).toBe(true);
    expect(st.equipment.length).toBe(1);
    expect(st.equipment[0]).toBe(owned);
    expect(owned.level).toBe(lvBefore + 1);
    expect(owned.effect.params.damage).toBeGreaterThan(base);
    expect(st.recorded).toEqual([]);
    expect(m.visible).toBe(false);
  });

  it("空槽不够时选不了新卡:一个状态都不改、弹层不关", () => {
    const { world, st } = makeWorld({ baseSlots: 1 });
    st.equipment.push(makeOwned());
    const m = new LevelUpModel(world);
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "equip");
    expect(m.canPick(i)).toBe(false);
    expect(m.content().cards[i].pickEnabled).toBe(false);
    const r = m.pick(i);
    expect(r).toEqual({ ok: false, reason: "slots" });
    expect(st.equipment.length).toBe(1);
    expect(st.recorded).toEqual([]);
    expect(m.visible).toBe(true);
  });

  it("强化目标已不在场上 → missing,弹层不关", () => {
    const { world, st } = makeWorld();
    const owned = makeOwned();
    st.equipment.push(owned);
    const m = new LevelUpModel(world);
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "upgrade");
    st.equipment.length = 0;
    expect(m.canPick(i)).toBe(false);
    expect(m.pick(i)).toEqual({ ok: false, reason: "missing" });
    expect(m.visible).toBe(true);
  });

  it("弹层没开时三个动作一律不生效", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world);
    expect(m.visible).toBe(false);
    expect(m.pick(0)).toEqual({ ok: false, reason: "missing" });
    expect(m.reroll(0)).toBe(false);
    expect(m.toggleLock(0)).toBe(false);
    expect(st.gold).toBe(100000);
    expect(st.equipment).toEqual([]);
  });
});

/* ==================== 6. 重随:扣金币、价格逐位、守卫 ==================== */

describe("重随", () => {
  it("扣金币,且每一手的价逐位等于 rerollPrice(本章已重随次数)", () => {
    const { world, st } = makeWorld({ gold: 100000 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    let paid = 0;
    for (let n = 0; n < 8; n++) {
      const price = rerollPrice(n);
      expect(m.rerollCost()).toBe(price);
      expect(m.reroll(0)).toBe(true);
      paid += price;
      expect(st.gold).toBe(100000 - paid);
      expect(m.rerolls).toBe(n + 1);
    }
    expect(paid).toBe([0, 1, 2, 3, 4, 5, 6, 7].reduce((a, n) => a + rerollPrice(n), 0));
  });

  it("金币不足时一个状态都不改:不扣钱、不重随、不动阶梯与保底计数、卡面不变", () => {
    const { world, st } = makeWorld({ gold: rerollPrice(0) - 1 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    const before = {
      gold: st.gold,
      rerolls: m.rerolls,
      dry: m.hiddenDry,
      name: m.choices[0].eq.name,
      triggers: m.choices[0].eq.triggers.map((t) => t.def.type),
      modifiers: m.choices[0].eq.modifiers.map((x) => x.def.type),
      face: JSON.stringify(m.content().cards[0]),
    };
    expect(m.canReroll(0)).toBe(false);
    expect(m.content().cards[0].rerollEnabled).toBe(false);
    expect(m.reroll(0)).toBe(false);
    expect(st.gold).toBe(before.gold);
    expect(m.rerolls).toBe(before.rerolls);
    expect(m.hiddenDry).toBe(before.dry);
    expect(m.choices[0].eq.name).toBe(before.name);
    expect(m.choices[0].eq.triggers.map((t) => t.def.type)).toEqual(before.triggers);
    expect(m.choices[0].eq.modifiers.map((x) => x.def.type)).toEqual(before.modifiers);
    expect(JSON.stringify(m.content().cards[0])).toBe(before.face);
    expect(m.visible).toBe(true);
  });

  it("价格正好够时放行(边界:>= 而不是 >)", () => {
    const { world, st } = makeWorld({ gold: rerollPrice(0) });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    expect(m.canReroll(0)).toBe(true);
    expect(m.reroll(0)).toBe(true);
    expect(st.gold).toBe(0);
    // 下一手涨到 rerollPrice(1),0 金自然按不动
    expect(m.rerollCost()).toBe(rerollPrice(1));
    expect(m.reroll(0)).toBe(false);
  });

  it("重随只换触发器与修饰器:效果 / 品质 / 等级 / id 都不变", () => {
    const { world } = makeWorld();
    const m = new LevelUpModel(world, () => 0.5);
    m.open();
    const i = m.choices.findIndex((c) => c.kind === "equip");
    const eq = m.choices[i].eq;
    const before = { effect: eq.effect.def.type, quality: eq.quality, level: eq.level, id: eq.id };
    expect(m.reroll(i)).toBe(true);
    expect(m.choices[i].eq).toBe(eq); // 原地改,不是换新对象
    expect({ effect: eq.effect.def.type, quality: eq.quality, level: eq.level, id: eq.id }).toEqual(before);
  });

  it("重随阶梯按章分段:进下一章清零;隐藏保底计数跨章不清", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    m.reroll(0);
    m.reroll(0);
    expect([m.rerolls, m.hiddenDry]).toEqual([2, 2]);
    st.chapter = 2;
    m.open();
    expect(m.rerolls).toBe(0);
    expect(m.hiddenDry).toBe(2);
    expect(m.rerollCost()).toBe(rerollPrice(0));
  });
});

/* ==================== 7. 隐藏保底 ==================== */

describe("隐藏词条与保底", () => {
  it("概率档:roll 恒 0 → 首次重随即命中;卡面改走隐藏档", () => {
    const { world } = makeWorld();
    const m = new LevelUpModel(world, () => 0);
    m.open();
    expect(m.reroll(0)).toBe(true);
    expect(m.hiddenHit[0]).toBe(true);
    expect(m.hiddenDry).toBe(0);
    expect(m.content().cards[0].hidden).toBe(true);
  });

  it("roll 恒不出概率时,第 REROLL_HIDDEN.pity 次必出隐藏(前 11 次一律不出)", () => {
    const { world } = makeWorld({ gold: 1e9 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    const seen: boolean[] = [];
    for (let n = 0; n < REROLL_HIDDEN.pity; n++) {
      expect(m.reroll(0), `第 ${n + 1} 次`).toBe(true);
      seen.push(m.hiddenHit[0]);
    }
    expect(seen.length).toBe(REROLL_HIDDEN.pity);
    expect(seen.slice(0, REROLL_HIDDEN.pity - 1).every((x) => !x)).toBe(true);
    expect(seen[REROLL_HIDDEN.pity - 1]).toBe(true);
    expect(m.hiddenDry).toBe(0); // 出货即清零
    expect(m.content().readoutText.includes(`隐藏保底 0/${REROLL_HIDDEN.pity}`)).toBe(true);
  });

  it("出货之后重新起算:再连不出 pity−1 次才又到保底", () => {
    const { world } = makeWorld({ gold: 1e9 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    for (let n = 0; n < REROLL_HIDDEN.pity; n++) m.reroll(0);
    expect(m.hiddenHit[0]).toBe(true);
    const second: boolean[] = [];
    for (let n = 0; n < REROLL_HIDDEN.pity; n++) {
      m.reroll(0);
      second.push(m.hiddenHit[0]);
    }
    expect(second.slice(0, REROLL_HIDDEN.pity - 1).every((x) => !x)).toBe(true);
    expect(second[REROLL_HIDDEN.pity - 1]).toBe(true);
  });

  it("隐藏保底计数是本局累计:重开一局归零", () => {
    const { world } = makeWorld({ gold: 1e9 });
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    m.reroll(0);
    m.reroll(0);
    expect(m.hiddenDry).toBe(2);
    m.resetRun();
    expect([m.hiddenDry, m.rerolls, m.visible, m.choices.length]).toEqual([0, 0, false, 0]);
  });
});

/* ==================== 8. 锁定 ==================== */

describe("锁定", () => {
  it("最多锁 LEVELUP_LOCK_LIMIT 张:换锁就是把上一格释放掉", () => {
    const { world } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    expect(m.lockLeft()).toBe(LEVELUP_LOCK_LIMIT);
    expect(m.toggleLock(1)).toBe(true);
    expect([m.lockedIndex, m.lockLeft()]).toEqual([1, 0]);
    expect(m.content().cards[1].locked).toBe(true);
    expect(m.content().cards[1].lockText).toBe(LV_TEXT.lockOff);
    // 上限已到:别的格按不动
    expect(m.canLock(0)).toBe(false);
    expect(m.toggleLock(0)).toBe(false);
    expect(m.lockedIndex).toBe(1);
    // 已锁那格恒可按 → 换锁
    expect(m.canLock(2)).toBe(false);
    expect(m.toggleLock(1)).toBe(true);
    expect([m.lockedIndex, m.lockLeft()]).toEqual([-1, LEVELUP_LOCK_LIMIT]);
    expect(m.content().cards[1].locked).toBe(false);
  });

  it("锁定卡不进重随池:那一格重随恒拒,卡面一个字段都不动", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world, () => 0.999);
    m.open();
    m.toggleLock(0);
    const gold = st.gold;
    const face = JSON.stringify(m.content().cards[0]);
    const name = m.choices[0].eq.name;
    expect(m.canReroll(0)).toBe(false);
    expect(m.content().cards[0].rerollEnabled).toBe(false);
    expect(m.reroll(0)).toBe(false);
    expect(st.gold).toBe(gold);
    expect(m.rerolls).toBe(0);
    expect(m.choices[0].eq.name).toBe(name);
    expect(JSON.stringify(m.content().cards[0])).toBe(face);
    // 没锁的那格照随
    expect(m.canReroll(1)).toBe(true);
    expect(m.reroll(1)).toBe(true);
    expect(m.rerolls).toBe(1);
  });

  it("被锁的卡下一轮必再出现,且仍落在锁定态、仍不进重随池", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    m.toggleLock(2);
    const locked: Choice = m.choices[2];
    // 选走另一张 → 本轮关闭,锁定留住
    const other = m.choices.findIndex((c, i) => i !== 2 && c.kind === "equip");
    expect(m.pick(other).ok).toBe(true);
    expect(st.equipment.length).toBe(1);
    expect(m.visible).toBe(false);
    // 下一轮
    m.open();
    expect(m.choices.length).toBe(LEVELUP_OFFER_COUNT);
    expect(m.choices[0]).toBe(locked); // 同一枚对象,不是重生成
    expect(m.lockedIndex).toBe(0);
    expect(m.content().cards[0].locked).toBe(true);
    expect(m.canReroll(0)).toBe(false);
    expect(m.canReroll(1)).toBe(true);
  });

  it("带走锁定卡本身 → 锁定兑现并清掉,下一轮三张全是新卡", () => {
    const { world, st } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    m.toggleLock(1);
    const locked = m.choices[1];
    expect(locked.kind).toBe("equip");
    expect(m.pick(1).ok).toBe(true);
    expect(st.equipment[0]).toBe(locked.eq);
    m.open();
    expect(m.lockedIndex).toBe(-1);
    expect(m.choices.includes(locked)).toBe(false);
    expect(m.choices.length).toBe(LEVELUP_OFFER_COUNT);
  });

  it("锁定不跨局:resetRun 之后下一轮不再带那张", () => {
    const { world } = makeWorld();
    const m = new LevelUpModel(world);
    m.open();
    m.toggleLock(0);
    const locked = m.choices[0];
    m.resetRun();
    m.open();
    expect(m.lockedIndex).toBe(-1);
    expect(m.choices.includes(locked)).toBe(false);
  });

  it("有锁定卡时仍恒出 LEVELUP_OFFER_COUNT 张(锁定占一格,其余现生)", () => {
    const { world, st } = makeWorld();
    st.equipment.push(makeOwned());
    const m = new LevelUpModel(world);
    m.open();
    m.toggleLock(0);
    const locked = m.choices[0];
    m.open();
    expect(m.choices.length).toBe(LEVELUP_OFFER_COUNT);
    expect(m.choices[0]).toBe(locked);
    expect(m.lockedIndex).toBe(0);
    expect(m.content().cards.length).toBe(LEVELUP_OFFER_COUNT);
    // 锁定占掉一格,现生的只剩 OFFER_COUNT − LOCK_LIMIT 张
    expect(LEVELUP_OFFER_COUNT - LEVELUP_LOCK_LIMIT).toBe(2);
  });
});

/* ==================== 9. 经验入口(行为断言) ==================== */

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
    // maxHp 的成长在 levelUpGrowth 里,addXp 不碰(本批不接,B2 才接)
    expect(p.maxHp).toBe(maxHp);
    expect(p.hp).toBe(Math.min(maxHp, Math.floor(maxHp / 2) + Math.floor(maxHp * LEVELUP_HEAL_PCT)));
    // 满血时回血是空操作
    const q = new Player();
    q.hp = q.maxHp;
    q.addXp(xpToNext(1));
    expect(q.hp).toBe(q.maxHp);
  });

  it("真跑 BattleSim:killEnemy 接了 addXp,升级按级数报上来,级数之和 = 等级增量", () => {
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
    // addXp 之外没有第二份成长/回血被顺手施加:maxHp 仍是开局那一档
    expect(sim.player.maxHp).toBe(PLAYER_BASE.maxHp);
  });

  it("世界层只做加法:killEnemy 里那一句 addXp,且不重复调 levelUpGrowth / 另写回血", () => {
    const src = fileSource(BATTLE_WORLD);
    const kill = codeOf(src.slice(src.indexOf("private killEnemy("), src.indexOf("/* ================= 引导与商店辅助")));
    expect(kill.includes("this.player.addXp(e.def.xp)")).toBe(true);
    expect(kill.includes("this.host.onLevelUp?.(")).toBe(true);
    // addXp 已经回过血、levelUpGrowth 才是 maxHp 成长(本批不接):两者都不得在这里再施加一遍
    expect(kill.includes("levelUpGrowth")).toBe(false);
    expect(kill.includes("LEVELUP_HEAL_PCT")).toBe(false);
    expect((codeOf(src).match(/levelUpGrowth/g) ?? []).length).toBe(0);
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
    // 唯一一条 import 就是同层的 theme
    expect(imps.split("\n").filter((l) => l.length > 0)).toEqual(['import { evenDown, fs, ui } from "./theme";']);
  });

  it("视图层不内联任何一枚盒与基线:几何只能来自模型层那一帧", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    // 视图里出现的数字只允许是缓存哨兵(-1 的 1)、lineHeight 系数(1.25)、循环起点(0)
    // 与暗底折中心锚点的除数(2)
    const nums = [...body.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    expect(nums.filter((n) => ![0, 1, 1.25, 2].includes(n))).toEqual([]);
    for (const k of ["L.box", "L.banner", "L.title", "L.readout", "L.hint", "L.cards", "L.panelKey", "L.bannerKey", "g.rect", "g.quality", "g.name", "g.descLines", "g.delta", "g.tag", "g.pick", "g.reroll", "g.lock"]) {
      expect(body.includes(k), k).toBe(true);
    }
    // 卡槽与描述行槽的枚数都来自共享层常量,不写死
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
    for (const k of ["LEVELUP_ENSURE_RARE_TALENT", "LEVELUP_LOCK_LIMIT", "LEVELUP_MAIN_LABELS", "LEVELUP_OFFER_COUNT", "rerollPrice", "REROLL_HIDDEN", "UPGRADE_MAIN_KEYS", "equipmentDescription", "generateChoices", "rerollCard", "upgradeEquipment", "qualityDef", "rareBonusFor", "LV_DESC_CHARS", "LV_DESC_MAX_LINES", "levelUpScreenLayout"]) {
      expect(mi.includes(k), k).toBe(true);
    }
  });

  it("视图只摆节点:所有落位走 placeLine / placeRect / Plate.show / qualityBox.draw / flatBox.draw", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    expect((body.match(/placeLine\(/g) ?? []).length).toBe(1);
    expect(body.includes("placeRect(this.capture, fullRect())")).toBe(true);
    expect(body.includes("placeRect(this.dim, r)")).toBe(true);
    expect((body.match(/\.set\(g\./g) ?? []).length).toBeGreaterThanOrEqual(6);
    // 没有第二套落位出口
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

  it("隐藏高亮档与 quality 主表 hidden 档同值(同一支色,两处同数)", () => {
    expect(defs.lvCardTagHidden).toBe(qualityDef("hidden").color.toUpperCase());
  });

  it("视图消费的每一个 lv* 键都在表里(不漏键 → 不会静默 undefined)", () => {
    const body = bodyOf(codeOf(fileSource(VIEW)));
    const used = [...body.matchAll(/p4\.(lv\w+)/g)].map((m) => m[1]);
    expect(new Set(used).size).toBeGreaterThanOrEqual(20);
    for (const k of new Set(used)) expect(Object.keys(defs).includes(k), k).toBe(true);
    // 接口声明与默认值逐键对齐
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
    // 队列自愈排在停战闸门之前:被章末转场打断的那一轮,回到战斗屏的下一帧自己接着弹
    expect(at("if (this.levelUpPending > 0 && !this.levelUpModel?.visible) this.openLevelUp();")).toBeGreaterThan(0);
    expect(at("if (this.levelUpPending > 0 && !this.levelUpModel?.visible) this.openLevelUp();")).toBeLessThan(at("if (this.levelUpModel?.visible) return;"));
  });

  it("世界层事件 → 排队 → 开层:连升多级按级数一轮一弹,选完还有余量就接着弹", () => {
    expect(section.includes("this.levelUpPending += levels;")).toBe(true);
    expect(section.includes("if (!this.levelUpModel?.visible) this.openLevelUp();")).toBe(true);
    expect(section.includes("this.levelUpPending = Math.max(0, this.levelUpPending - 1);")).toBe(true);
    expect(section.includes("if (this.levelUpPending > 0) this.openLevelUp();")).toBe(true);
    expect(section.includes('if (this.router.current !== "battle" || this.confirm) return;')).toBe(true);
    expect(body.includes("onLevelUp: (levels) => this.onLevelUp(levels),")).toBe(true);
  });

  it("写回局内态而不是存档:装备数组走 getter 取活引用,金币与商店屏同一份账", () => {
    expect(section.includes("return sim.player.equipment;")).toBe(true);
    expect(section.includes("gold: () => sim.gold,")).toBe(true);
    expect(section.includes("sim.world.gold = v;")).toBe(true);
    expect(section.includes("recordEquipment: (eq) => sim.world.recordEquipment(eq),")).toBe(true);
    expect(section.includes("this.levelUpModel = model;")).toBe(true);
    expect(section.includes("layout: () => model.layout(DESIGN_W, logicalH())")).toBe(true);
    // 一个存档字段都不落
    for (const banned of [".persist(", "writeSave", "commit"]) expect(section.includes(banned), banned).toBe(false);
  });

  it("本局复位挂在开局漏斗上:enterBattleRun 里清队列与模型态", () => {
    const enter = codeOf(src.slice(src.indexOf("private enterBattleRun()"), src.indexOf("private requestStage(")));
    expect(enter.includes("this.levelUpPending = 0;")).toBe(true);
    expect(enter.includes("this.levelUpModel?.resetRun();")).toBe(true);
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
    // 新目录也要有目录 meta
    const dir = "../cocos/assets/scripts/levelup.meta";
    expect(existsSync(new URL(dir, import.meta.url))).toBe(true);
    const dj = JSON.parse(readFileSync(new URL(dir, import.meta.url), "utf8")) as { ver: string; importer: string };
    expect([dj.ver, dj.importer]).toEqual(["1.2.0", "directory"]);
  });

  it("五枚新 uuid 与全仓既有 uuid 一枚都不撞", () => {
    const fresh = [...metas.map((m) => m[1]), "../cocos/assets/scripts/levelup.meta"].map(
      (p) => (JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as { uuid: string }).uuid
    );
    expect(new Set(fresh).size).toBe(fresh.length);
    // 全仓递归扫描:同一枚 uuid 只允许出现一次(贴图类 meta 的 subMetas 各带一枚,故逐份收全部)
    const root = new URL("../cocos/assets/", import.meta.url);
    const seen = new Map<string, number>();
    for (const rel of readdirSync(root, { recursive: true })) {
      const p = String(rel).replace(/\\/g, "/");
      if (!p.endsWith(".meta")) continue;
      for (const m of readFileSync(new URL(p, root), "utf8").matchAll(/"uuid":\s*"([^"]+)"/g)) {
        seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
      }
    }
    expect(seen.size).toBeGreaterThan(600);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
    expect(fresh.every((u) => seen.get(u) === 1)).toBe(true);
  });
});
