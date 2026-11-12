/**
 * V1.1 Work 包 D03:英雄页五行不变,点击「分岔」行展开独立技能树。
 * 本文件只测数据、纯几何与模型交互;真实 Canvas 画面由 Cocos 探针覆盖。
 */

import { describe, it, expect } from "vitest";
import { heroSelectLayout } from "@game/ui/heroSelectLayout";
import { allHeroes } from "@game/data/heroes";
import { heroBuildTree } from "@game/data/heroTree";
import { HeroSelectModel, type HeroSaveView } from "../cocos/assets/scripts/heroes/HeroSelectModel";

const W = 560;
const H = 996;

function saveOf(hero: "vera" | "bran" | null): HeroSaveView {
  return { selectedHero: hero, selectedSet: hero === "vera" ? "thorn" : hero === "bran" ? "ember" : null, seasonId: 1 };
}

describe("技能树数据", () => {
  it("三原型各 2 条路线 × 3 层 × 2 选项;legacy 只有 2 条分岔、无节点", () => {
    for (const h of ["vera", "kyle", "willow"] as const) {
      const t = heroBuildTree(h);
      expect(t.legacy, h).toBe(false);
      expect(t.branches, h).toHaveLength(2);
      for (const b of t.branches) {
        expect(b.tiers, `${h}/${b.id}`).toHaveLength(3);
        expect(b.tiers.map((x) => x.chapter)).toEqual([4, 8, 12]);
        for (const tier of b.tiers) expect(tier.options, `${h}/${b.id}/${tier.chapter}`).toHaveLength(2);
      }
    }
    const legacy = heroBuildTree("bran");
    expect(legacy.legacy).toBe(true);
    expect(legacy.branches).toHaveLength(2);
    for (const b of legacy.branches) expect(b.tiers).toHaveLength(0);
  });
});

describe("技能树面板几何", () => {
  const L = heroSelectLayout(W, H, allHeroes(), 4, 0);

  it("面板落在屏内;标题/关闭钮不重叠;两列不越界、不互压", () => {
    const T = L.tree;
    expect(T.panel.x).toBeGreaterThanOrEqual(16);
    expect(T.panel.x + T.panel.w).toBeLessThanOrEqual(W - 16);
    expect(T.panel.y).toBeGreaterThanOrEqual(0);
    expect(T.panel.y + T.panel.h).toBeLessThanOrEqual(H);
    expect(T.close.x).toBeGreaterThan(T.title.x);
    expect(T.close.x + T.close.w).toBeLessThanOrEqual(T.panel.x + T.panel.w);
    expect(T.close.h).toBeGreaterThanOrEqual(44);
    const [a, b] = T.columns;
    expect(a.rect.x + a.rect.w).toBeLessThan(b.rect.x);
    expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(T.panel.x + T.panel.w);
    for (const col of T.columns) {
      expect(col.header.y).toBe(col.rect.y);
      for (let i = 0; i < col.rows.length; i++) {
        const r = col.rows[i];
        expect(r.y).toBeGreaterThan(col.header.y);
        expect(r.x).toBe(col.header.x);
        expect(r.w).toBe(col.header.w);
        if (i > 0) expect(r.y).toBeGreaterThanOrEqual(col.rows[i - 1].y + col.rows[i - 1].h);
      }
      expect(col.rows[col.rows.length - 1].y + col.rows[col.rows.length - 1].h).toBeLessThanOrEqual(T.panel.y + T.panel.h - 32);
    }
  });

  it("996 / 1246 两档都取偶且不越界", () => {
    for (const h of [996, 1100, 1246]) {
      const T = heroSelectLayout(W, h, allHeroes(), 4, 0).tree;
      const rects = [T.panel, T.close, ...T.columns.flatMap((c) => [c.header, ...c.rows])];
      for (const r of rects) {
        expect(r.x % 2, JSON.stringify(r)).toBe(0);
        expect(r.y % 2, JSON.stringify(r)).toBe(0);
        expect(r.w % 2, JSON.stringify(r)).toBe(0);
        expect(r.h % 2, JSON.stringify(r)).toBe(0);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
    }
  });
});

describe("技能树交互", () => {
  it("点分岔行开层;开层时只认关闭/返回;关闭后回到五行详情", () => {
    const m = new HeroSelectModel();
    m.open(saveOf("vera"), W, H);
    const L = m.layout(saveOf("vera"), W, H);
    const row = L.skillRows[1].rect;
    const a = m.hit(L, row.x + 20, row.y + 20);
    expect(a).toEqual({ kind: "tree" });
    expect(m.apply(a!)).toBe(true);
    expect(m.treeOpen).toBe(true);
    expect(m.hit(L, L.list.x + 20, L.list.y + 20)).toBeNull();
    const close = m.hit(L, L.tree.close.x + 20, L.tree.close.y + 20);
    expect(close).toEqual({ kind: "treeClose" });
    expect(m.apply(close!)).toBe(true);
    expect(m.treeOpen).toBe(false);
  });

  it("不出战时不产树热区;技能树数据为空", () => {
    const m = new HeroSelectModel();
    m.open(saveOf(null), W, H);
    const L = m.layout(saveOf(null), W, H);
    const row = L.skillRows[1].rect;
    expect(m.hit(L, row.x + 20, row.y + 20)).toBeNull();
    expect(m.tree()).toBeNull();
  });

  it("legacy 英雄可查看两条分岔,但没有 4/8/12 层", () => {
    const m = new HeroSelectModel();
    m.open(saveOf("bran"), W, H);
    const t = m.tree();
    expect(t?.legacy).toBe(true);
    expect(t?.branches).toHaveLength(2);
    expect(t?.branches.every((b) => b.tiers.length === 0)).toBe(true);
  });
});
