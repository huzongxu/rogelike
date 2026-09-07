/**
 * 英雄选择页纯布局测试(英雄系统批次 M2)。
 * 守住四件事:① h=996 标定档四带逐像素锚点(顶栏/列表/详情/按钮);② 屏高伸展时
 * 详情与按钮底锚、列表吸收全部多余高度;③ rows 只装可视行且与 first/last 严格一致
 * (命中测试天然裁剪的前提);④ 发布门控只读 heroes 表,布局不复制判据。
 */

import { describe, it, expect } from "vitest";
import {
  heroSelectLayout,
  HERO_BACK_H,
  HERO_BACK_Y,
  HERO_CONFIRM_H,
  HERO_CONFIRM_W,
  HERO_DETAIL_H,
  HERO_HEADER_H,
  HERO_LIST_TOP,
  HERO_PAD,
  HERO_PORTRAIT,
  HERO_ROW_GAP,
  HERO_ROW_H,
  HERO_SKILL_TEXT_X,
  type HeroSelectLayout,
  type Rect,
} from "@game/ui/heroSelectLayout";
import { allHeroes, isHeroReleased, releasedHeroes } from "@game/data/heroes";
import { SCROLL_TRACK_W } from "@game/ui/scrollList";
import { ui } from "@game/ui/theme";

const W = 560;
const H0 = 996; // 标定档
const H1 = 1246; // 伸展上限
const HEROES = allHeroes();
const MAX_SWEEP = 568; // 996 档滚程(内容 952 − 视口 384)
const PAD = HERO_PAD; // 屏内页边距 16(英雄屏走自己的网格,不是全局 ui.pad 的 14)

const right = (r: Rect): number => r.x + r.w;
const bottom = (r: Rect): number => r.y + r.h;
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** 扫描档位:996 标定 + 中间档 + 1246 上限 */
const HEIGHTS = [H0, 1000, 1080, 1155, H1];

function layoutAt(h: number, offset = 0): HeroSelectLayout {
  return heroSelectLayout(W, h, HEROES, 4, offset);
}

/* ---------- 1. 常量与顶栏 ---------- */

describe("英雄页常量", () => {
  it("顶栏高与全局面板头部同源;行/详情/按钮尺寸锁死", () => {
    expect(HERO_HEADER_H).toBe(ui.headerH);
    expect(HERO_HEADER_H).toBe(64);
    expect(HERO_LIST_TOP).toBe(84);
    expect(HERO_ROW_H).toBe(72);
    expect(HERO_ROW_GAP).toBe(8);
    expect(HERO_DETAIL_H).toBe(440);
    expect(HERO_PORTRAIT).toBe(168);
    expect(HERO_CONFIRM_W).toBe(260);
    expect(HERO_CONFIRM_H).toBe(52);
  });

  it("返回钮贴右缘留屏内页边距 16,抬到热区下限 44 且不出顶栏", () => {
    const L = layoutAt(H0);
    expect(L.backBtn).toEqual({ x: W - PAD - ui.backW, y: HERO_BACK_Y, w: ui.backW, h: HERO_BACK_H });
    expect(L.backBtn.h).toBeGreaterThanOrEqual(44); // 热区下限
    expect(L.backBtn.y).toBeGreaterThanOrEqual(0);
    expect(bottom(L.backBtn)).toBeLessThanOrEqual(HERO_HEADER_H);
    expect(L.backBtn.x + L.backBtn.w).toBeLessThanOrEqual(W - PAD);
  });
});

/* ---------- 2. h=996 逐像素锚点 ---------- */

describe("996 标定档锚点", () => {
  const L = layoutAt(H0);

  it("四带:顶栏 0..64 / 列表 84..468 / 详情 476..916 / 按钮 928..980", () => {
    expect(L.list).toEqual({ x: 16, y: 84, w: 528, h: 384 });
    expect(L.detail).toEqual({ x: 16, y: 476, w: 528, h: 440 });
    expect(L.confirm).toEqual({ x: 150, y: 928, w: 260, h: 52 });
    expect(L.clearBtn).toEqual({ x: 16, y: 932, w: 88, h: 44 });
    expect(L.track).toEqual({ x: 540, y: 84, w: SCROLL_TRACK_W, h: 384 });
    // 右缘恒落 544:内容列与滚动轨同一把尺
    expect(L.list.x + L.list.w).toBe(544);
    expect(L.detail.x + L.detail.w).toBe(544);
    expect(L.track.x + L.track.w).toBe(544);
    expect(L.clearBtn.h).toBeGreaterThanOrEqual(44); // 热区下限
  });

  it("12 行内容 952 高 → 视口 384 → 滚程 568(全量平铺必须滚动)", () => {
    expect(HEROES.length).toBe(12);
    expect(L.contentH).toBe(952);
    expect(L.maxScroll).toBe(568);
  });

  it("详情区:立绘 168 见方,文案带右移不重叠,技能 4 行铺满剩余", () => {
    expect(L.portrait).toEqual({ x: 32, y: 492, w: 168, h: 168 });
    expect(L.textX).toBe(216);
    expect(L.nameY).toBe(526);
    expect(L.titleY).toBe(554);
    expect(L.loreY).toBe(588);
    expect(L.loreW).toBe(312);
    expect(L.skillRows.length).toBe(4);
    expect(L.skillRows[0].rect).toEqual({ x: 32, y: 694, w: 496, h: 46 });
    expect(bottom(L.skillRows[3].rect)).toBe(896);
    expect(right(L.portrait)).toBeLessThan(L.textX);
    expect(L.textX + L.loreW).toBe(L.detail.x + L.detail.w - PAD);
  });

  it("行内几何:小立绘/文本起点/基线/徽章位逐像素", () => {
    const r = L.rows[0];
    expect(r.rect).toEqual({ x: 16, y: 84, w: 528, h: HERO_ROW_H });
    expect(r.portrait).toEqual({ x: 32, y: 100, w: 40, h: 40 });
    expect(r.textX).toBe(84);
    expect(r.nameY).toBe(114);
    expect(r.subY).toBe(136);
    expect(r.badge).toEqual({ x: 464, y: 100, w: 64, h: 40 });
    expect(r.nameY).toBeGreaterThan(r.rect.y);
    expect(r.subY).toBeLessThan(bottom(r.rect));
    expect(r.badge.x).toBeGreaterThan(r.textX);
    expect(bottom(r.badge)).toBeLessThanOrEqual(bottom(r.rect));
    // 行内四件全部落在行板 nineMargin 内缩 16 的区域里
    expect(r.portrait.x).toBe(r.rect.x + 16);
    expect(r.badge.x + r.badge.w).toBe(r.rect.x + r.rect.w - 16);
    expect(r.portrait.y).toBeGreaterThanOrEqual(r.rect.y + 16);
    expect(bottom(r.portrait)).toBeLessThanOrEqual(bottom(r.rect) - 16);
    expect(bottom(r.badge)).toBeLessThanOrEqual(bottom(r.rect) - 16);
  });

  it("技能行基线与胶囊落在行内", () => {
    expect(L.skillRows.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    for (const s of L.skillRows) {
      expect(s.rect.h % 2).toBe(0); // 行高取偶
      expect(s.chip.y).toBeGreaterThanOrEqual(s.rect.y);
      expect(bottom(s.chip)).toBeLessThanOrEqual(bottom(s.rect));
      expect(s.labelY).toBeGreaterThan(s.rect.y);
      expect(s.descY).toBeGreaterThan(s.labelY);
      expect(s.descY).toBeLessThan(bottom(s.rect));
      expect(s.descW).toBe(s.rect.w - HERO_SKILL_TEXT_X - PAD);
    }
  });
});

/* ---------- 3. 屏高伸展:详情与按钮底锚,列表吸收全部余高 ---------- */

/** 奇数视口先 evenDown(与 heroSelectLayout 出口同式):1155 档底锚跟 1154 比 */
const hh = (v: number): number => Math.floor(v / 2) * 2;

describe("屏高伸展规则", () => {
  it("列表视口高 = 384 + (evenDown(h) − 996),其余带高恒定", () => {
    for (const h of HEIGHTS) {
      const L = layoutAt(h);
      expect(L.list.y).toBe(HERO_LIST_TOP);
      expect(L.list.h).toBe(384 + (hh(h) - H0));
      expect(L.detail.h).toBe(HERO_DETAIL_H);
      expect(L.confirm.h).toBe(HERO_CONFIRM_H);
      expect(L.portrait.w).toBe(HERO_PORTRAIT);
      expect(L.skillRows.length).toBe(4);
    }
  });

  it("底锚链条逐级相接:按钮底 = evenDown(h)−16,详情底接按钮顶,列表底接详情顶", () => {
    for (const h of HEIGHTS) {
      const L = layoutAt(h);
      expect(bottom(L.confirm)).toBe(hh(h) - PAD);
      expect(L.detail.y).toBe(L.confirm.y - 12 - HERO_DETAIL_H);
      expect(L.list.y + L.list.h).toBe(L.detail.y - 8);
      expect(bottom(L.detail)).toBeLessThan(L.confirm.y);
    }
  });

  it("视口越高滚程越短;1246 档 12 行仍超出 → 仍要滚", () => {
    expect(layoutAt(H1).maxScroll).toBe(952 - 634);
    expect(layoutAt(H1).maxScroll).toBeGreaterThan(0);
  });

  it("三行矮列表在 1246 档完全放得下 → 无滚程、无滑块", () => {
    const L = heroSelectLayout(W, H1, HEROES.slice(0, 3), 4, 0);
    expect(L.contentH).toBe(3 * 72 + 2 * 8);
    expect(L.maxScroll).toBe(0);
    expect(L.thumb).toBeNull();
    expect(L.rows.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("横向包含:内容矩形 ⊆ [16, 544];滚动条按轨道贴右缘(比内容边距更外)", () => {
    for (const h of HEIGHTS) {
      const L = layoutAt(h);
      const boxes: { name: string; r: Rect }[] = [
        { name: "list", r: L.list },
        { name: "detail", r: L.detail },
        { name: "portrait", r: L.portrait },
        { name: "confirm", r: L.confirm },
        { name: "clearBtn", r: L.clearBtn },
        { name: "backBtn", r: L.backBtn },
        ...L.rows.map((row, i) => ({ name: `row${i}`, r: row.rect })),
        ...L.rows.map((row, i) => ({ name: `rowBadge${i}`, r: row.badge })),
        ...L.skillRows.map((s, i) => ({ name: `skill${i}`, r: s.rect })),
      ];
      for (const { name, r } of boxes) {
        expect(r.x, `${name} 左缘`).toBeGreaterThanOrEqual(PAD);
        expect(right(r), `${name} 右缘`).toBeLessThanOrEqual(W - PAD + 1e-9);
        expect(r.x % 2, `${name} 左缘取偶`).toBe(0);
        expect(r.w % 2, `${name} 宽取偶`).toBe(0);
      }
      expect(L.list.x + L.list.w).toBe(544);
      expect(L.track.x + L.track.w).toBe(544);
      expect(L.track.x + L.track.w).toBeLessThanOrEqual(W);
      if (L.thumb) {
        expect(L.thumb.x).toBe(L.track.x);
        expect(L.thumb.x + L.thumb.w).toBe(L.track.x + L.track.w);
      }
    }
  });

  it("纵向不重叠:顶栏 < 列表 < 详情 < 按钮,且技能带在详情内", () => {
    for (const h of HEIGHTS) {
      const L = layoutAt(h);
      expect(HERO_HEADER_H).toBeLessThan(L.list.y);
      expect(bottom(L.list)).toBeLessThan(L.detail.y);
      expect(bottom(L.detail)).toBeLessThan(L.confirm.y);
      expect(bottom(L.confirm)).toBeLessThanOrEqual(h);
      expect(L.skillLabelY).toBeGreaterThan(bottom(L.portrait));
      expect(L.skillLabelY).toBeLessThan(L.skillRows[0].rect.y);
      expect(bottom(L.skillRows[3].rect)).toBeLessThanOrEqual(bottom(L.detail) - PAD);
    }
  });
});

/* ---------- 4. rows 只装可视行 ---------- */

describe("可视行窗口", () => {
  it("rows 与 [first,last] 严格一致,下标连续、id 对得上表、行位随 offset 平移", () => {
    for (const offset of [0, 120, MAX_SWEEP]) {
      const L = layoutAt(H0, offset);
      expect(L.rows.map((r) => r.index)).toEqual(range(L.first, L.last));
      for (const r of L.rows) {
        expect(r.id).toBe(HEROES[r.index].id);
        expect(r.rect.y).toBeCloseTo(L.list.y + r.index * (HERO_ROW_H + HERO_ROW_GAP) - offset, 9);
        expect(r.rect.w).toBe(L.list.w);
      }
    }
  });

  it("逐 offset 扫描:12 行全部至少出现一次(滚动可达,没有被裁死的数据)", () => {
    const seen = new Set<number>();
    for (let o = 0; o <= MAX_SWEEP; o += 40) for (const r of layoutAt(H0, o).rows) seen.add(r.index);
    expect([...seen].sort((a, b) => a - b)).toEqual(range(0, 11));
  });

  it("窗口行数有界(远小于全量,证明是裁剪而非全造)", () => {
    for (let o = 0; o <= MAX_SWEEP; o += 13) expect(layoutAt(H0, o).rows.length).toBeLessThanOrEqual(8);
  });

  it("顶格不露白;滚到底末行底缘恰贴视口底", () => {
    const top = layoutAt(H0, 0);
    expect(top.rows[0].rect.y).toBe(top.list.y);
    const end = layoutAt(H0, MAX_SWEEP);
    expect(end.last).toBe(11);
    const lastRow = end.rows.find((r) => r.index === 11)!;
    expect(bottom(lastRow.rect)).toBeCloseTo(bottom(end.list), 9);
  });

  it("越界阻尼值(负 / 超 max)不崩:带数照常,内容整体平移", () => {
    for (const o of [-35, 595]) {
      const L = layoutAt(H0, o);
      expect(L.contentH).toBe(952);
      expect(L.maxScroll).toBe(MAX_SWEEP);
      expect(L.rows.length).toBeGreaterThan(0);
    }
    expect(layoutAt(H0, -35).rows[0].rect.y).toBe(HERO_LIST_TOP + 35);
    expect(layoutAt(H0, MAX_SWEEP + 35).rows.find((r) => r.index === 11)!.rect.y).toBe(HERO_LIST_TOP + 11 * 80 - MAX_SWEEP - 35);
  });
});

/* ---------- 5. 发布门控来自表,不在布局里复制判据 ---------- */

describe("发布门控", () => {
  /** 扫遍滚程收集全部行的 released 标记 */
  function releasedFlags(h: number, seasonId: number): boolean[] {
    const out: boolean[] = [];
    const max = layoutAt(h).maxScroll;
    for (let o = 0; o <= max; o += 8) {
      for (const r of heroSelectLayout(W, h, HEROES, seasonId, o).rows) out[r.index] = r.released;
    }
    return out;
  }

  for (const season of [1, 2, 3, 4]) {
    it(`S${season}:已发布 ${releasedHeroes(season).length} 行解锁,其余带锁`, () => {
      const flags = releasedFlags(H0, season);
      expect(flags.length).toBe(12);
      expect(flags.filter(Boolean).length).toBe(releasedHeroes(season).length);
      for (let i = 0; i < HEROES.length; i++) {
        expect(flags[i], `第 ${i} 行 ${HEROES[i].id}`).toBe(isHeroReleased(HEROES[i].id, season));
      }
    });
  }

  it("S4 全 12 行解锁;S1 只前 3 行;脏赛季仍可渲染", () => {
    expect(releasedFlags(H0, 4).every(Boolean)).toBe(true);
    expect(releasedFlags(H0, 1)).toEqual([true, true, true, false, false, false, false, false, false, false, false, false]);
    expect(releasedFlags(H0, 0).length).toBe(12);
  });

  it("未发布不影响几何(行高/位置与赛季无关)", () => {
    const s1 = heroSelectLayout(W, H0, HEROES, 1, 240);
    const s4 = heroSelectLayout(W, H0, HEROES, 4, 240);
    expect(s1.rows.map((r) => r.rect)).toEqual(s4.rows.map((r) => r.rect));
    expect(s1.rows.map((r) => r.id)).toEqual(s4.rows.map((r) => r.id));
  });
});

/* ---------- 6. 行序 = 表序(平铺不重排,按季自然成组) ---------- */

describe("列表顺序与数据源", () => {
  it("行按 allHeroes() 原序铺开,布局不自行排序或过滤未发布", () => {
    const seen: string[] = [];
    for (let o = 0; o <= MAX_SWEEP; o += 40) {
      for (const r of heroSelectLayout(W, H0, HEROES, 1, o).rows) seen[r.index] = r.id;
    }
    expect(seen).toEqual(HEROES.map((h) => h.id));
  });

  it("平铺顺序天然按发布季分组(3×3×3×3),无需 Tab 也能读到「新英雄在前」的层次", () => {
    expect(HEROES.map((h) => h.releaseSeason)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  });
});
