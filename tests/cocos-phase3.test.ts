/**
 * Phase 3 三屏闸门:英雄选择屏 / 章间商店 / 主菜单内容模型。
 *
 * 三条硬性断言(延续 cocos-lab-parity 的纪律):
 *  1. **端间同一实现**:Cocos 宿主侧模块经相对路径 import 的共享层,与 Web 侧经 `@game`
 *     别名 import 的是同一个模块实例(函数引用 `toBe` 相同),于是滚动数学与出战镜像
 *     不可能出现"两份抄本";
 *  2. **几何与计数钉死**:列表行数 / 视口高 / maxScroll / 商店行带缘 / 菜单逐行状态与文案,
 *     全部给固定输入断言固定输出(改表即改测试,不接受静默漂移);
 *  3. **视图无关**:本文件只吃 cc-free 的三个 `*Model.ts` 与 `core/SaveModel.ts`,
 *     不需要引擎与浏览器 —— 实机面板未开启时,这些就是能在 node 侧证死的那部分。
 */

import { describe, it, expect, vi } from "vitest";

// Web 存档层依赖平台存储,这里 mock 掉 platform(与 hero-save / prestige 测试一致)
const store = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock("../src/platform/adapter", () => ({
  platform: {
    isWeChat: false,
    createCanvas: () => ({}) as HTMLCanvasElement,
    requestAnimationFrame: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    getStorage: (k: string) => store[k] ?? null,
    setStorage: (k: string, v: string) => {
      store[k] = v;
    },
  },
}));

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { HERO_LIST_TOP, HERO_ROW_GAP, HERO_ROW_H, heroSelectLayout } from "@game/ui/heroSelectLayout";
import * as sharedScroll from "@game/ui/scrollList";
import { allHeroes, applyHeroSelection, heroDef, isHeroReleased, releasedHeroes, type HeroId, type HeroSelection } from "@game/data/heroes";
import { setDef, type SetId } from "@game/data/sets";
import { SHOP_BOTTOM, SHOP_CALIBRATION_H, SHOP_ROW_BOTTOM, SHOP_TOP, shopLayoutPure } from "@game/ui/shop";
import { SHOP_SLOT_CAP, generateEquipment, qualityBasePrice, slotExpandCost, type Equipment } from "@game/data/equipmentGen";
import { shopCardPrice, shopRefreshPrice } from "@game/data/shop";
import { DAILY_BOXES, ENERGY_MAX } from "@game/data/daily";
import { COMMISSION_READY_HOURS, type CommissionState } from "@game/data/commissions";
import { STAGES } from "@game/data/stages";
import { fs as FS, ui as UI } from "@game/ui/theme";
import type { TalentId } from "@game/data/talents";
import { theme } from "@game/ui/theme";

/* ---------- Web 侧存档层(出战镜像的对标物) ---------- */
import { loadSave } from "../src/systems/save";

/* ---------- Cocos 宿主侧(本文件的被测物) ---------- */
import { HeroSelectModel, type HeroSaveView, type ScrollGeometry } from "../cocos/assets/scripts/heroes/HeroSelectModel";
import { ShopModel, SHOP_CARD_SLOTS, SHOP_CONTENT_BOTTOM, type MergeGroup, type ShopWorld } from "../cocos/assets/scripts/shop/ShopModel";
import { buildMenuContent, menuCommissionReady, menuDailyDot, menuRowStates, menuStageOpen, starsGlyphs, type MenuSaveView } from "../cocos/assets/scripts/menu/MenuContentModel";
import { normalizeSave as cocosNormalizeSave } from "../cocos/assets/scripts/core/SaveModel";
import * as cocosScroll from "../cocos/assets/scripts/game/ui/scrollList";
import * as cocosHeroes from "../cocos/assets/scripts/game/data/heroes";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";
import { readFileSync } from "node:fs";

/* ==================== 0. 端间同一实现(R9 纪律延续到 Phase 3) ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/ 与 @game 解析到同一批函数引用(不是两份抄本)", () => {
    for (const fn of ["dragScrollFrom", "flickOf", "inertiaNext", "scrollViewport", "scrollThumb", "clampScroll", "maxScrollOf", "contentHeightOf"] as const) {
      expect(cocosScroll[fn], fn).toBe(sharedScroll[fn]);
    }
    expect(cocosScroll.SCROLL_TAP_SLOP).toBe(sharedScroll.SCROLL_TAP_SLOP);
    expect(cocosScroll.SCROLL_EDGE_RUBBER).toBe(sharedScroll.SCROLL_EDGE_RUBBER);
    expect(cocosHeroes.applyHeroSelection).toBe(applyHeroSelection);
    expect(cocosHeroes.allHeroes).toBe(allHeroes);
    expect(cocosScroll.scrollViewport).toBe(sharedScroll.scrollViewport);
  });

  it("宿主侧英雄布局就是共享层那一份(行数与矩形同源)", () => {
    const L1 = heroSelectLayout(560, 996, allHeroes(), 1, 0);
    const L2 = new HeroSelectModel().layout({ selectedHero: null, selectedSet: null, seasonId: 1 }, 560, 996);
    expect(L2.rows.map((r) => [r.id, r.rect.y, r.released])).toEqual(L1.rows.map((r) => [r.id, r.rect.y, r.released]));
    expect(L2.maxScroll).toBe(L1.maxScroll);
  });
});

/* ==================== 1. 英雄列表:赛季门控 + 视口行数 ==================== */

const W = 560;
const HERO_N = 12;
const STEP = HERO_ROW_H + HERO_ROW_GAP; // 80
const CONTENT_H = HERO_N * HERO_ROW_H + (HERO_N - 1) * HERO_ROW_GAP; // 952

/** 996 标定档:视口 384 / maxScroll 568(= game/ui/heroSelectLayout 文件头的逐像素标定) */
const VIEW_996 = 384;
const MAX_996 = CONTENT_H - VIEW_996; // 568
/** 1246 伸展档:详情与按钮底锚不动,多余高度全部给列表 */
const H_TALL = 1246;
const VIEW_TALL = VIEW_996 + (H_TALL - 996); // 634
const MAX_TALL = CONTENT_H - VIEW_TALL; // 318

function heroLayoutAt(seasonId: number, h: number, offset = 0, selected: HeroId | null = null) {
  const m = new HeroSelectModel();
  m.scroll.offset = offset;
  const save: HeroSaveView = { selectedHero: selected, selectedSet: selected ? heroDef(selected).setId : null, seasonId };
  return { m, L: m.layout(save, W, h) };
}

const crossesViewport = (r: { y: number; h: number }, list: { y: number; h: number }) => r.y < list.y + list.h && r.y + r.h > list.y;

describe("英雄列表几何(赛季门控 + 两档屏高)", () => {
  it("内容高恒 952:12 行全列出,门控走 released 标记而不是删行", () => {
    for (const seasonId of [1, 2, 3, 4]) {
      const { L } = heroLayoutAt(seasonId, 996);
      expect(L.contentH).toBe(CONTENT_H);
      expect(allHeroes()).toHaveLength(HERO_N);
      expect(L.rows.map((r) => r.released)).toEqual(L.rows.map((r) => isHeroReleased(r.id, seasonId)));
    }
  });

  it("996 档 offset=0 出 6 行,1246 档出 9 行;maxScroll 568 / 318", () => {
    const a = heroLayoutAt(1, 996).L;
    expect(a.list).toEqual({ x: 16, y: HERO_LIST_TOP, w: 528, h: VIEW_996 });
    expect(a.maxScroll).toBe(MAX_996);
    expect(a.first).toBe(0);
    expect(a.last).toBe(5);
    expect(a.rows).toHaveLength(6);
    expect(a.rows.map((r) => r.id)).toEqual(allHeroes().slice(0, 6).map((hh) => hh.id));
    expect(a.track).toEqual({ x: 540, y: HERO_LIST_TOP, w: 4, h: VIEW_996 });
    expect(a.thumb).not.toBe(null);
    expect(a.thumb!.x).toBe(540);
    expect(a.thumb!.y).toBe(HERO_LIST_TOP); // offset=0 → 滑块贴轨道顶
    expect(a.thumb!.h).toBeCloseTo((VIEW_996 * VIEW_996) / CONTENT_H, 6);
    // 右缘恒落 544:内容列与滚动轨同一把尺
    expect(a.list.x + a.list.w).toBe(544);
    expect(a.track.x + a.track.w).toBe(544);

    const b = heroLayoutAt(1, H_TALL).L;
    expect(b.list.h).toBe(VIEW_TALL);
    expect(b.maxScroll).toBe(MAX_TALL);
    expect(b.first).toBe(0);
    expect(b.last).toBe(8); // ceil(634/80) = 8 → 0..8 共 9 行(上界多带一行缓冲)
    expect(b.rows).toHaveLength(9);
  });

  it("两档屏高 × offset 0…maxScroll 逐档:行矩形两两不重叠,缓冲行不越界且一律点不中", () => {
    for (const h of [996, H_TALL]) {
      const max = heroLayoutAt(1, h).L.maxScroll;
      for (let off = 0; off <= max; off += 7) {
        const { m, L } = heroLayoutAt(1, h, off);
        expect(L.rows.length, `h=${h} off=${off}`).toBeGreaterThan(0);
        expect(L.rows.length).toBeLessThanOrEqual(16); // = HeroSelectView 的行池容量
        for (const r of L.rows) {
          expect(r.rect.x).toBe(L.list.x);
          expect(r.rect.w).toBe(L.list.w);
          expect(r.rect.h).toBe(HERO_ROW_H);
          // 行矩形不得飞出列表带(上下各允许一步长的缓冲)
          expect(r.rect.y).toBeGreaterThanOrEqual(L.list.y - 2 * STEP);
          expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(L.list.y + L.list.h + 2 * STEP);
        }
        for (let i = 1; i < L.rows.length; i++) {
          expect(L.rows[i].rect.y).toBeGreaterThanOrEqual(L.rows[i - 1].rect.y + HERO_ROW_H + HERO_ROW_GAP);
        }
        const outside = L.rows.filter((r) => !crossesViewport(r.rect, L.list));
        // 行之间有 8px 间隙 → 跨视口边缘那一行可以整体出界(上缘甚至连着两条),所以缓冲至多三条
        expect(outside.length, `h=${h} off=${off} 缓冲行数`).toBeLessThanOrEqual(3);
        // 列表闸门优先:整条出界的缓冲行点不中(与 Web clip + heroIn(list) 同一结果)
        for (const r of outside) expect(m.hit(L, r.rect.x + 40, r.rect.y + r.rect.h / 2)).toBe(null);
      }
    }
  });

  it("S1 只有 3 行可点(未发布行在视口内也不产热区),四季递增 3/6/9/12", () => {
    for (const [seasonId, want] of [
      [1, 3],
      [2, 6],
      [3, 9],
      [4, 12],
    ] as const) {
      let hittable = 0;
      for (let i = 0; i < HERO_N; i++) {
        const { m, L } = heroLayoutAt(seasonId, 996, Math.max(0, Math.min(MAX_996, i * STEP - 200)));
        const row = L.rows.find((r) => r.index === i);
        expect(row, `season=${seasonId} index=${i} 未进可视窗`).toBeTruthy();
        if (!row) continue;
        const a = m.hit(L, row.rect.x + 40, row.rect.y + row.rect.h / 2);
        if (isHeroReleased(row.id, seasonId)) {
          expect(a).toEqual({ kind: "row", id: row.id });
          hittable++;
        } else {
          expect(a).toBe(null);
        }
      }
      expect(hittable, `season=${seasonId}`).toBe(want);
      expect(releasedHeroes(seasonId)).toHaveLength(want);
    }
  });

  it("表头文案随赛季走(Phase 1 的「12 名英雄 · 12 套武器套组」占位已被这份产物取代)", () => {
    expect(heroLayoutAt(1, 996).m.header().sub).toBe("已解锁 3/12 · 后面赛季的英雄解锁后可继续出战");
    expect(heroLayoutAt(4, 996).m.header().sub).toBe("已解锁 12/12 · 后面赛季的英雄解锁后可继续出战");
    expect(heroLayoutAt(1, 996).m.header().title).toMatch(/^出战英雄 · S1「.+」$/);
  });

  it("进屏定位:open() 把当前出战那行滚到视口居中(996 档 index6 → offset 328)", () => {
    const m = new HeroSelectModel();
    const save: HeroSaveView = { selectedHero: "doran", selectedSet: heroDef("doran").setId, seasonId: 3 };
    m.open(save, W, 996);
    expect(m.scroll.offset).toBe(328); // 6×80 − (384−80)/2
    expect(m.scroll.vel).toBe(0);
    expect(m.preview).toBe("doran");
    const L = m.layout(save, W, 996);
    const views = m.rows(L);
    expect(views.filter((v) => v.current).map((v) => v.id)).toEqual(["doran"]);
    expect(views.filter((v) => v.active).map((v) => v.id)).toEqual(["doran"]);
    const me = views.find((v) => v.id === "doran");
    expect(me?.badgeText).toBe("出战");
    expect(me?.color).toBe(theme.gold);
    expect(views.find((v) => v.id === "willow")?.sub).toBe("S4 解锁"); // index 9 在 3..9 窗内
    expect(views.find((v) => v.id === "doran")?.sub).toBe(`${heroDef("doran").title} · ${setDef("magma").name}`);
  });

  it("热区四个出口互不串门:返回 / 行 / 不出战 / 确定各归其位", () => {
    const { m, L } = heroLayoutAt(1, 996);
    expect(m.hit(L, L.backBtn.x + 2, L.backBtn.y + 2)).toEqual({ kind: "back" });
    expect(m.hit(L, L.confirm.x + 2, L.confirm.y + 2)).toEqual({ kind: "confirm" });
    expect(m.hit(L, L.clearBtn.x + 2, L.clearBtn.y + 2)).toEqual({ kind: "clear" });
    expect(m.hit(L, L.detail.x + 2, L.detail.y + 2)).toBe(null);
    // 列表内未命中之处(行间距)不往下穿透到详情区
    const gap = L.rows[0].rect.y + L.rows[0].rect.h + HERO_ROW_GAP / 2;
    expect(m.hit(L, L.list.x + 40, gap)).toBe(null);
  });
});

/* ==================== 2. 滚动数学:与共享层逐点等价 ==================== */

const G: ScrollGeometry = { contentH: CONTENT_H, viewportH: VIEW_996, maxScroll: MAX_996 };

/** 用共享函数逐点复算 ScrollModel 的手势链(拖拽位 / 松手位 / 松手速度) */
function parityDrag(startOffset: number, moves: [number, number][], g: ScrollGeometry) {
  const s = new HeroSelectModel().scroll;
  s.offset = startOffset;
  s.begin(moves[0][0], moves[0][1]);
  let lastOffset = startOffset;
  let lastT = moves[0][1];
  let vel = 0;
  const seen: number[] = [];
  for (const [y, t] of moves) {
    const { display, settled } = sharedScroll.dragScrollFrom(startOffset, y - moves[0][0], g.contentH, g.viewportH);
    const inst = ((settled - lastOffset) / Math.max(1, t - lastT)) * 1000;
    vel = vel * 0.5 + inst * 0.5;
    lastOffset = settled;
    lastT = t;
    s.move(y, t, g);
    expect(s.offset).toBe(display);
    seen.push(s.offset);
  }
  const tapped = s.end(g);
  expect(s.offset).toBe(lastOffset); // 松手即硬钳到 settled 位
  expect(s.vel).toBe(sharedScroll.flickOf(vel));
  return { s, tapped, seen };
}

describe("ScrollModel 与共享层 scrollList 逐点等价", () => {
  it("拖拽链同数:快甩起手惯性、慢拖就地停住、位移过容差吞掉点击", () => {
    const fast = parityDrag(200, [[500, 1000], [440, 1016], [380, 1032], [330, 1048]], G);
    expect(fast.seen).toEqual([200, 260, 320, 370]);
    expect(fast.tapped).toBe(false); // 位移 170 > SCROLL_TAP_SLOP → 手势消费,宿主不得再判点击
    expect(fast.s.vel).toBe(2968.75); // (3750,3750,3125) 三步 EMA 后过 flickOf 门槛 → 甩出去

    const slow = parityDrag(200, [[500, 1000], [510, 1050]], G);
    expect(slow.tapped).toBe(true); // 10px 未过容差 → 仍按点击处理
    expect(slow.s.offset).toBe(190);
    expect(slow.s.vel).toBe(0); // 速度不足 SCROLL_FLICK_MIN_V → flickOf 归零
  });

  it("惯性:逐帧 offset/vel 与 inertiaNext 链完全相同,且单调衰减", () => {
    const s = new HeroSelectModel().scroll;
    s.offset = 100;
    s.vel = 2400;
    const dt = 1 / 60;
    let ref = { offset: 100, vel: 2400 };
    let prevAbs = 2400;
    for (let i = 0; i < 240; i++) {
      const moved = s.tick(dt, G);
      ref = sharedScroll.inertiaNext(ref, dt, G.contentH, G.viewportH);
      expect(s.offset).toBe(ref.offset);
      expect(s.vel).toBe(ref.vel);
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(G.maxScroll);
      if (moved && ref.vel !== 0) {
        expect(Math.abs(s.vel)).toBeLessThan(prevAbs);
        prevAbs = Math.abs(s.vel);
      }
    }
    expect(s.vel).toBe(0); // 一定停得下来,不留永不下落的渐近尾巴
    expect(s.offset).toBe(G.maxScroll); // 2400px/s 甩到底
  });

  it("触界即停:越界的下一步被钳到边界并把速度清零", () => {
    const s = new HeroSelectModel().scroll;
    s.offset = G.maxScroll - 4;
    s.vel = 5000;
    s.tick(0.2, G);
    expect(s.offset).toBe(G.maxScroll);
    expect(s.vel).toBe(0);
    expect(s.tick(0.016, G)).toBe(false);
  });

  it("拖出边界只按阻尼显示,松手与 snap 都硬钳回 [0, maxScroll]", () => {
    const s = new HeroSelectModel().scroll;
    s.begin(400, 1000);
    s.move(1000, 1020, G); // 往回拽 600px → 目标 offset −600
    expect(s.offset).toBeCloseTo(-600 * sharedScroll.SCROLL_EDGE_RUBBER, 6);
    expect(s.offset).toBeLessThan(0);
    expect(s.end(G)).toBe(false);
    expect(s.offset).toBe(0);
    expect(s.vel).toBe(0);
    s.offset = -50;
    expect(s.snap(G)).toBe(true);
    expect(s.offset).toBe(0);
    s.offset = 900;
    expect(s.snap(G)).toBe(true);
    expect(s.offset).toBe(G.maxScroll);
    s.offset = 120;
    expect(s.snap(G)).toBe(false); // 界内不动、不报脏
  });

  it("cancel() 回到硬钳位且不甩惯性;geometry 三元组来自 layout", () => {
    const m = new HeroSelectModel();
    const L = m.layout({ selectedHero: null, selectedSet: null, seasonId: 1 }, W, 996);
    expect(m.scroll.geometry(L)).toEqual({ contentH: L.contentH, viewportH: L.list.h, maxScroll: L.maxScroll });
    const s = m.scroll;
    s.begin(400, 1000);
    s.move(200, 1016, G);
    s.cancel();
    expect(s.dragging).toBe(false);
    expect(s.offset).toBe(200);
    expect(s.vel).toBe(0);
    expect(s.tick(0.016, G)).toBe(false); // 无速度 → 不推进,视图不必重排
  });
});

/* ==================== 3. applyHeroSelection 镜像语义 ==================== */

describe("出战写入:selectedHero → selectedSet 的唯一同步点", () => {
  it("commit 换人 → 镜像跟随该英雄 setId;与直接调共享函数的结果逐字段相同", () => {
    const m = new HeroSelectModel();
    for (const hh of allHeroes()) {
      const viaModel: HeroSelection = { selectedHero: "vera", selectedSet: "thorn" };
      m.preview = hh.id;
      expect(m.commit(viaModel)).toBe(hh.id);
      const viaShared: HeroSelection = { selectedHero: "vera", selectedSet: "thorn" };
      applyHeroSelection(viaShared, hh.id);
      expect(viaModel).toEqual(viaShared);
      expect(viaModel.selectedSet).toBe(heroDef(hh.id).setId);
    }
  });

  it("commit 清英雄 → 两字段同时归 null(不留孤儿镜像)", () => {
    const m = new HeroSelectModel();
    const sel: HeroSelection = { selectedHero: "sia", selectedSet: "frost" };
    m.preview = null;
    expect(m.commit(sel)).toBe(null);
    expect(sel).toEqual({ selectedHero: null, selectedSet: null });
  });

  it("apply(row/clear) 只动预览、不落盘;重复点同一行不报脏", () => {
    const m = new HeroSelectModel();
    const sel: HeroSelection = { selectedHero: "vera", selectedSet: "thorn" };
    m.open({ selectedHero: "vera", selectedSet: "thorn", seasonId: 1 }, W, 996);
    expect(m.apply({ kind: "row", id: "kyle" })).toBe(true);
    expect(m.apply({ kind: "row", id: "kyle" })).toBe(false); // 同一行重复点 → 不重排
    expect(m.confirmText()).toBe("确定出战");
    expect(m.apply({ kind: "clear" })).toBe(true);
    expect(m.detail().empty).toBe(true);
    expect(m.confirmText()).toBe("确认不出战");
    expect(m.apply({ kind: "back" })).toBe(false);
    expect(m.apply({ kind: "confirm" })).toBe(false);
    expect(sel).toEqual({ selectedHero: "vera", selectedSet: "thorn" }); // 未 commit 前存档字段不动
    m.commit(sel);
    expect(sel).toEqual({ selectedHero: null, selectedSet: null });
  });

  it("详情区四行技能恒在,且只读共享表(英雄自身不产生数值)", () => {
    const m = new HeroSelectModel();
    m.preview = "vera";
    const d = m.detail();
    expect(d.empty).toBe(false);
    expect(d.skills.map((s) => s.tag)).toEqual(["初始武器", "三件套", "六件套", "赛季联动"]);
    expect(d.color).toBe(setDef("thorn").color);
    m.preview = "mu";
    expect(m.detail().skills[3].label).toBe("当季无联动"); // S1 下 S4 英雄无当季联动
    const m4 = new HeroSelectModel();
    m4.preview = "mu";
    m4.layout({ selectedHero: "mu", selectedSet: "veil", seasonId: 4 }, W, 996);
    expect(m4.detail().skills[3].label).not.toBe("当季无联动");
  });

  it("两端归一化同一份老档 → 得到同一对镜像字段", () => {
    const KEY = "echo-abyss-save-v1";
    const legacy: Record<string, unknown> = { ...cocosNormalizeSave(null), selectedSet: "glacier" };
    delete legacy.selectedHero;
    store[KEY] = JSON.stringify(legacy);
    const web = loadSave();
    const cocos = cocosNormalizeSave(legacy);
    expect(web.selectedHero).toBe("nora");
    expect(cocos.selectedHero).toBe("nora");
    expect(cocos.selectedSet).toBe(web.selectedSet);
    expect(cocos.selectedSet).toBe("glacier");
    // 脏值:非英雄 id 归 null 后按 selectedSet 反查补齐(两端同一函数、同一结果)
    expect(cocosNormalizeSave({ selectedHero: "bogus", selectedSet: "thorn" })).toMatchObject({ selectedHero: "vera", selectedSet: "thorn" });
    store[KEY] = JSON.stringify({ ...cocosNormalizeSave(null), selectedHero: "bogus", selectedSet: "thorn" });
    expect(loadSave().selectedHero).toBe("vera");
  });
});

/* ==================== 4. 商店:账本 + 几何不变量 ==================== */

interface FakeWorld {
  equipment: Equipment[];
  gold: number;
  baseSlots: number;
  runSlotBonus: number;
  totalBought: number;
  recorded: Equipment[];
  merges: MergeGroup[];
  chapter: number;
  seasonId: number;
  highestStage: number;
  selectedSet: SetId | null;
  ownedTalents: TalentId[];
}

/** ShopWorld 的测试替身:账本字段原地可改,槽位数 = 基础 + 本局扩容(与 BattleSim 同一算式) */
function makeWorld(over: Partial<FakeWorld> = {}): { world: ShopWorld; st: FakeWorld } {
  const st: FakeWorld = {
    equipment: [],
    gold: 100000,
    baseSlots: 6,
    runSlotBonus: 0,
    totalBought: 0,
    recorded: [],
    merges: [],
    chapter: 1,
    seasonId: 1,
    highestStage: 1,
    selectedSet: null,
    ownedTalents: [],
    ...over,
  };
  const world: ShopWorld = {
    equipment: st.equipment,
    gold: () => st.gold,
    setGold: (v) => {
      st.gold = v;
    },
    slots: () => st.baseSlots + st.runSlotBonus,
    runSlotBonus: () => st.runSlotBonus,
    addRunSlot: () => {
      st.runSlotBonus += 1;
    },
    chapter: () => st.chapter,
    seasonId: () => st.seasonId,
    highestStage: () => st.highestStage,
    selectedSet: () => st.selectedSet,
    ownedTalents: () => st.ownedTalents,
    totalBought: () => st.totalBought,
    addTotalBought: () => {
      st.totalBought += 1;
    },
    recordEquipment: (eq) => st.recorded.push(eq),
    cardTypeKey: (eq) => `${eq.effect.def.type}:${eq.quality}`,
    mergeGroups: () => st.merges,
  };
  return { world, st };
}

/** 同款卡(同效果 + 同品质):只换 id,用于验证进化分组 */
function cloneAs(src: Equipment, id: number): Equipment {
  return {
    ...src,
    id,
    triggers: src.triggers.map((t) => ({ ...t, params: { ...t.params } })),
    modifiers: src.modifiers.map((m) => ({ ...m, params: { ...m.params } })),
    effect: { ...src.effect, params: { ...src.effect.params } },
  };
}

describe("商店账本(纯逻辑输入 → 输出)", () => {
  it("卡价随本局已购递增:15 → 17 → 19(章节 1、common 基础价 15)", () => {
    const { world, st } = makeWorld({ gold: 100000 });
    const m = new ShopModel(world, () => 0.99);
    const prices: number[] = [];
    for (let i = 0; i < 3; i++) {
      const card = generateEquipment(3, "common");
      m.offers = [card, null, null];
      prices.push(m.priceOf(card));
      expect(m.buy(0)).toBe(true);
    }
    expect(prices).toEqual([15, 17, 19]);
    expect(st.totalBought).toBe(3);
    expect(st.gold).toBe(100000 - 15 - 17 - 19);
    expect(st.equipment).toHaveLength(3);
    expect(st.recorded).toHaveLength(3);
    expect(m.priceOf(generateEquipment(3, "common"))).toBe(shopCardPrice(qualityBasePrice("common"), 3, 1));
  });

  it("买后售罄:该位不再产货,重复买返回 false 且不掉金币", () => {
    const { world, st } = makeWorld({ gold: 500 });
    const m = new ShopModel(world, () => 0.99);
    m.offers = [generateEquipment(3, "rare"), generateEquipment(3, "rare"), generateEquipment(3, "rare")];
    const price = m.priceOf(m.offers[1] as Equipment);
    expect(m.buy(1)).toBe(true);
    expect(m.offers[1]).toBe(null);
    const before = st.gold;
    expect(m.buy(1)).toBe(false);
    expect(st.gold).toBe(before);
    expect(before).toBe(500 - price);
    const c = m.content();
    expect(c.cards[1].soldOut).toBe(true);
    expect(c.cards[1].priceText).toBe("");
    expect(c.cards[1].sub).toBe("点「刷新」补货");
    expect(c.cards.filter((x) => !x.soldOut)).toHaveLength(2);
  });

  it("槽位闸门与扩容:满槽买不了卡;槽位价 100 → 230 → 529 → 1217,到 8 封顶", () => {
    const eqs = Array.from({ length: 6 }, () => generateEquipment(3, "common"));
    const { world, st } = makeWorld({ gold: 100000, baseSlots: 4, equipment: eqs });
    const m = new ShopModel(world, () => 0.99);
    m.offers = [generateEquipment(3, "common"), null, null];
    expect(m.freeSlots()).toBe(0);
    expect(m.buy(0)).toBe(false);
    expect(m.content().cards[0].afford).toBe(false);
    expect(m.content().weaponHeader.right).toBe("槽已满,销毁武器腾槽");
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(m.slotPrice());
      expect(m.buySlot()).toBe(true);
    }
    expect(seen).toEqual([100, 230, 529, 1217]);
    expect(seen).toEqual([0, 1, 2, 3].map((n) => slotExpandCost(n)));
    expect(st.gold).toBe(100000 - 100 - 230 - 529 - 1217);
    expect(st.runSlotBonus).toBe(4);
    expect(m.freeSlots()).toBe(SHOP_SLOT_CAP - 6);
    expect(m.buy(0)).toBe(true);
    expect(m.buySlot()).toBe(false); // 4 + 4 = 8 = 总上限,不再可售
    expect(m.content().slotBtn).toEqual({ text: `槽位已满 ${SHOP_SLOT_CAP}/${SHOP_SLOT_CAP}`, enabled: false });
  });

  it("刷新:第 1 章阶梯 10 → 16 → 26 金;金币不足则整条操作不改状态", () => {
    const { world, st } = makeWorld({ gold: 30 });
    const m = new ShopModel(world, () => 0.99);
    m.open();
    expect(m.refreshes).toBe(0);
    expect(m.offers.filter((o) => !!o)).toHaveLength(SHOP_CARD_SLOTS);
    const costs = [m.refreshCost(), (m.refresh(), m.refreshCost()), (m.refresh(), m.refreshCost())];
    expect(costs).toEqual([shopRefreshPrice(1, 0), shopRefreshPrice(1, 1), shopRefreshPrice(1, 2)]);
    expect(costs).toEqual([10, 16, 26]);
    expect(st.gold).toBe(30 - 10 - 16);
    const before = { gold: st.gold, refreshes: m.refreshes };
    expect(m.refresh()).toBe(false);
    expect({ gold: st.gold, refreshes: m.refreshes }).toEqual(before);
    expect(m.refreshCost()).toBe(26); // 失败的那一次不抬阶梯
    m.open(); // 进店复位本章阶梯
    expect(m.refreshes).toBe(0);
    expect(m.refreshCost()).toBe(10);
    expect(m.content().tools[0].text).toBe("刷新 10金");
    expect(m.content().tools[0].enabled).toBe(false); // 只剩 4 金,10 金的刷新买不起
  });

  it("进化与销毁:2 张付补位费(基础价 ×2)、3 张免费;销毁返还基础价一半", () => {
    const a = generateEquipment(3, "common");
    const { world, st } = makeWorld({ gold: 1000, equipment: [a, cloneAs(a, a.id + 1), cloneAs(a, a.id + 2)] });
    st.merges = [{ name: a.effect.def.name, quality: "common", count: 3, sample: a }];
    const m = new ShopModel(world, () => 0.99);
    expect(m.layout().merges).toHaveLength(1);
    expect(m.content().merges[0]).toMatchObject({ name: `${a.effect.def.name} ×3`, fee: 0, fullSet: true, feeText: "免费升品" });
    expect(m.merge(a)).toBe(true);
    expect(st.gold).toBe(1000); // 满 3 张 → 不收费
    expect(st.equipment).toHaveLength(1);
    expect(st.equipment[0].quality).toBe("rare");

    const b = generateEquipment(3, "common");
    const st2 = makeWorld({ gold: 1000, equipment: [b, cloneAs(b, b.id + 1)] });
    st2.st.merges = [{ name: b.effect.def.name, quality: "common", count: 2, sample: b }];
    const m2 = new ShopModel(st2.world, () => 0.99);
    expect(m2.content().merges[0].feeText).toBe("升品 30金");
    expect(m2.merge(b)).toBe(true);
    expect(st2.st.gold).toBe(1000 - qualityBasePrice("common") * 2);
    expect(st2.st.equipment).toHaveLength(1);

    const keep = st.equipment[0];
    expect(m.destroy(keep.id)).toBe(true);
    expect(st.gold).toBe(1000 + Math.round(qualityBasePrice("rare") * 0.5));
    expect(m.destroy(keep.id)).toBe(false);
    expect(m.content().weaponEmpty).toBe("还没有武器,先从商店购买吧");
  });

  it("shopLayoutPure 行数 = 实际持有量;底部带 948..996 与卡区不相交;几何不收屏高", () => {
    for (let nw = 0; nw <= 8; nw++) {
      for (let nm = 0; nm <= 4; nm++) {
        const eqs = Array.from({ length: nw }, () => generateEquipment(3, "common"));
        const merges: MergeGroup[] = Array.from({ length: nm }, (_, i) => ({
          name: `组${i}`,
          quality: "common",
          count: 2,
          sample: eqs[0] ?? generateEquipment(3, "common"),
        }));
        const m = new ShopModel(makeWorld({ equipment: eqs, merges }).world, () => 0.99);
        const L = m.layout();
        const wantW = Math.max(1, Math.min(nw, 8));
        const wantM = Math.max(1, Math.min(nm, 4));
        expect(L.weaponRows, `nw=${nw}`).toHaveLength(wantW);
        expect(L.merges, `nm=${nm}`).toHaveLength(wantM);
        expect(L.destroyRects).toHaveLength(wantW);
        expect([L.nW, L.nM]).toEqual([wantW, wantM]);
        const rects = [...L.toolBtns, ...L.cards, L.slotBtn, ...L.weaponRows, ...L.destroyRects, ...L.merges];
        for (const r of rects) {
          expect(r.y, `nw=${nw} nm=${nm}`).toBeGreaterThanOrEqual(SHOP_TOP);
          expect(r.y + r.h, `nw=${nw} nm=${nm}`).toBeLessThanOrEqual(SHOP_ROW_BOTTOM);
        }
        expect(L.nextBtn).toEqual({ x: 264, y: 950, w: 280, h: 44 });
        expect(L.nextBtn.y).toBeGreaterThanOrEqual(SHOP_BOTTOM);
        expect(L.nextBtn.y + L.nextBtn.h).toBeLessThanOrEqual(996);
        const last = L.merges[L.merges.length - 1];
        /* 末行底缘贴底坞,只剩不足一行的呼吸缝(列向弹性把富余摊给了行高与带距) */
        expect(last.y + last.h).toBeLessThanOrEqual(SHOP_ROW_BOTTOM);
        expect(SHOP_ROW_BOTTOM - (last.y + last.h)).toBeLessThan(last.h);
      }
    }
    // 底部带常量与宿主出口同数;缺省屏高 = 标定档 → 宿主不传第三实参时拿到的就是 996 那一档
    expect(SHOP_CONTENT_BOTTOM).toBe(SHOP_ROW_BOTTOM);
    expect([SHOP_TOP, SHOP_BOTTOM, SHOP_ROW_BOTTOM]).toEqual([64, 948, 942]);
    expect([SHOP_CALIBRATION_H, shopLayoutPure.length]).toEqual([996, 2]);
    expect(shopLayoutPure(3, 2)).toEqual(shopLayoutPure(3, 2, SHOP_CALIBRATION_H));
    // 行带随屏高生长,卡带不随屏高走
    expect(shopLayoutPure(3, 2, 1246).contentBottom).toBeGreaterThan(shopLayoutPure(3, 2).contentBottom);
    expect(shopLayoutPure(3, 2, 1246).cardH).toBe(shopLayoutPure(3, 2).cardH);
    // 纯函数 + 行数封顶:超上限的行数并到 8 / 4 档
    expect(shopLayoutPure(9, 5)).toEqual(shopLayoutPure(8, 4));
    expect([shopLayoutPure(0, 0).nW, shopLayoutPure(0, 0).nM]).toEqual([1, 1]);
  });

  it("hitTest 顺序对标 Web onShopClick:工具钮 → 槽位 → 卡 → 武器行(销毁优先) → 进化 → 下一章", () => {
    const eqs = [generateEquipment(3, "common"), generateEquipment(3, "common")];
    const { world } = makeWorld({ equipment: eqs });
    const m = new ShopModel(world, () => 0.99);
    m.offers = [eqs[0], eqs[1], null];
    const L = m.layout();
    expect(m.hitTest(L.toolBtns[0].x + 1, L.toolBtns[0].y + 1)).toEqual({ kind: "tool", id: "refresh" });
    expect(m.hitTest(L.slotBtn.x + 1, L.slotBtn.y + 1)).toEqual({ kind: "slot" });
    expect(m.hitTest(L.cards[2].x + 1, L.cards[2].y + 1)).toEqual({ kind: "card", index: 2 });
    const wr = L.weaponRows[0];
    const dr = L.destroyRects[0];
    expect(m.hitTest(wr.x + 1, wr.y + wr.h / 2)).toEqual({ kind: "weapon", id: eqs[0].id });
    expect(m.hitTest(dr.x + 1, dr.y + dr.h / 2)).toEqual({ kind: "destroy", id: eqs[0].id });
    expect(m.hitTest(L.nextBtn.x + 1, L.nextBtn.y + 1)).toEqual({ kind: "next" });
    expect(m.hitTest(5, 5)).toBe(null);
    m.selectWeapon(eqs[1].id);
    expect(m.content().weapons[1].selected).toBe(true);
    expect(m.content().weapons[0].selected).toBe(false);
    m.selectWeapon(eqs[1].id); // 再点取消
    expect(m.content().weapons[1].selected).toBe(false);
  });
});

/* ==================== 5. 主菜单内容模型:固定存档 → 固定输出 ==================== */

const T0 = 1700000000000;
const NOW = T0 + 3 * 86400000 + 1000; // 赛季第 4 天
const STAGE_IDS = STAGES.map((s) => s.id);

function menuSave(over: Partial<MenuSaveView> = {}): MenuSaveView {
  return {
    points: 1234,
    stardust: 77,
    diamond: 5,
    energy: 7.6,
    gachaTicket: 3,
    highestStage: 3,
    stageFurthest: { 1: 20, 2: 20, 3: 9 },
    stageStars: [0, 3, 2, 1, 0, 0, 0, 0],
    seasonId: 1,
    seasonStartAt: T0,
    seasonBest: 40,
    selectedHero: "vera",
    selectedSet: "thorn",
    dailyBoxClaimed: ["wood"],
    commission: null,
    commission2: null,
    premiumPass: false,
    premiumPassSeason: 0,
    ...over,
  };
}

const content = (s: MenuSaveView, currentStageId: number | null = null) => buildMenuContent({ save: s, now: NOW, currentStageId, stageIds: STAGE_IDS });

describe("主菜单内容模型(解锁 / 减淡档位 / 红点 / 实时数值)", () => {
  it("解锁门控:highestStage=3 开三关;第 4 关要前关打到第 10 章(现 9 章 → 锁)", () => {
    const s = menuSave();
    expect(STAGE_IDS.map((id) => menuStageOpen(s, id))).toEqual([true, true, true, false, false, false, false]);
    expect(STAGE_IDS.map((id) => menuStageOpen({ ...s, stageFurthest: { 3: 10 } }, id))).toEqual([true, true, true, true, false, false, false]);
  });

  it("逐行状态:通关档与补星档各归其位(补星只在已解锁且恰好 2 星那行)", () => {
    const rows = menuRowStates(menuSave(), STAGE_IDS);
    expect(rows.map((r) => r.unlocked)).toEqual([true, true, true, false, false, false, false]);
    expect(rows.map((r) => r.cleared)).toEqual([true, true, false, false, false, false, false]); // cleared = id < highestStage
    expect(rows.map((r) => r.stars)).toEqual([3, 2, 1, 0, 0, 0, 0]);
    expect(rows.map((r) => r.makeup)).toEqual([false, true, false, false, false, false, false]);
    // 锁定行即便有 2 星也不给补星钮
    // 第 2 关只打到 5 章 → 第 3 关锁着,但它有 2 星:锁定行不给补星钮
    expect(menuRowStates(menuSave({ highestStage: 1, stageFurthest: { 1: 20, 2: 5 }, stageStars: [0, 3, 2, 2, 0, 0, 0, 0] }), STAGE_IDS).map((r) => r.makeup)).toEqual([false, true, false, false, false, false, false]);
  });

  it("行文案与减淡判定源:锁定行给门槛章文案,通关行打勾,星标只数到 3", () => {
    const c = content(menuSave());
    expect(c.rows.map((r) => r.current)).toEqual([false, false, true, false, false, false, false]);
    expect(c.rows[1].name).toBe("第2关 · 荒野求生 ✓ ★★☆");
    expect(c.rows[1].makeupText).toBe("5◆ 补星");
    expect(c.rows[1].badgeKey).toBe("avatar_common");
    expect(c.rows[3].badgeKey).toBe("avatar_rare");
    expect(c.rows[3].unlocked).toBe(false);
    expect(c.rows[3].desc).toBe("打到第3关第10章解锁 · 已到第9章 · 20 章 · Boss");
    expect(c.rows[0].desc).toBe("第一次直面尸潮 · 20 章 · Boss");
    expect(starsGlyphs(0)).toBe("☆☆☆");
    expect(starsGlyphs(9)).toBe("★★★");
    expect(c.rows[0].badgeText).toBe("1");
  });

  it("红点判定:每日宝箱 1/3 → 亮、领满 → 灭;委托满 2 小时 → 亮", () => {
    expect(DAILY_BOXES).toHaveLength(3);
    expect(menuDailyDot(menuSave())).toBe(true);
    expect(menuDailyDot(menuSave({ dailyBoxClaimed: ["wood", "silver", "gold"] }))).toBe(false);
    expect(content(menuSave()).showDot).toBe(true);
    expect(content(menuSave({ dailyBoxClaimed: ["wood", "silver", "gold"] })).showDot).toBe(false);
    const ready: CommissionState = { region: "plains", difficulty: 1, startedAt: NOW - COMMISSION_READY_HOURS * 3600000 };
    const fresh: CommissionState = { region: "plains", difficulty: 1, startedAt: NOW - (COMMISSION_READY_HOURS * 3600000 - 60000) };
    expect(menuCommissionReady(menuSave({ commission: ready }), NOW)).toBe(true);
    expect(menuCommissionReady(menuSave({ commission: fresh }), NOW)).toBe(false);
    expect(content(menuSave({ commission2: ready })).showCommissionDot).toBe(true);
    expect(content(menuSave({ commission: fresh })).showCommissionDot).toBe(false);
    expect(content(menuSave()).showCommissionDot).toBe(false);
  });

  it("实时数值口径:体力四舍五入、负数钳 0、三枚筹码 = 券/回响/星尘", () => {
    expect(ENERGY_MAX).toBe(20);
    expect(content(menuSave()).energyLine).toBe("⚡ 8/20 ◆ 5");
    expect(content(menuSave({ energy: -3, diamond: -1 })).energyLine).toBe("⚡ 0/20 ◆ 0");
    expect(content(menuSave({ energy: ENERGY_MAX })).energyLine).toBe(`⚡ ${ENERGY_MAX}/20 ◆ 5`);
    expect(content(menuSave()).chips).toEqual([
      { iconKey: "icon_ticket", text: "3" },
      { iconKey: "icon_echo", text: "1234" },
      { iconKey: "icon_stardust", text: "77" },
    ]);
    expect(content(menuSave({ points: 99.6, stardust: 0.4, gachaTicket: 2.5 })).chips.map((c) => c.text)).toEqual(["3", "100", "0"]);
    expect(content(menuSave(), 2).rows[1].current).toBe(true); // 战场上那一关恒为 current
    expect(content(menuSave(), 4).rows[3].current).toBe(true); // 未解锁行也可成为 current(高亮由宿主另判)
  });

  it("赛季行 / 展示带 / 入口标签随存档走", () => {
    const c = content(menuSave());
    expect(c.title).toBe("回响深渊");
    expect(c.sectionText).toBe("主线关卡 · 通关解锁");
    expect(c.endlessText).toBe("♾ 无限关 · 爽模式");
    expect(c.seasonLine.startsWith("赛季 S1")).toBe(true);
    expect(c.seasonLine).toContain("第 4/14 天");
    expect(c.seasonLine).toContain("赛季分 100"); // Σ(星数×10)=60 + seasonBest 40
    expect(c.phantomText).toMatch(/^幻影榜 · No\.\d+$/);
    expect(content(menuSave({ seasonBest: 99999 })).phantomText).toBe("幻影榜 · No.1");
    expect(c.selectedSet).toBe("thorn");
    expect(c.accent).toBe(setDef("thorn").color);
    expect(c.heroBtnText).toBe("更换英雄");
    expect(c.heroLines[0]).toBe(`${heroDef("vera").name} · ${heroDef("vera").title}`);
    expect(c.heroLines[2].startsWith("初始武器:")).toBe(true);
    expect(c.noteLines).toHaveLength(2);
    expect(c.noteLines[0]).toContain("商店偏向刷");
    const none = content(menuSave({ selectedHero: null, selectedSet: null }));
    expect(none.heroBtnText).toBe("选择英雄");
    expect(none.accent).toBe(null);
    expect(none.heroLines[1]).toBe("点右侧「更换英雄」,套组构筑随英雄出战");
    expect(none.noteLines).toEqual([]);
    expect(content(menuSave()).entries.map((e) => e.label)).toEqual(["委托", "扭蛋", "天赋", "通行证", "每日", "升级"]);
    expect(content(menuSave({ premiumPassSeason: 1 })).entries.map((e) => e.label)).toContain("通行证★");
  });
});

/* ==================== 7. 文本带右界(真机越界的 node 侧防线) ==================== */

/**
 * 这一节守的是真机实测暴露的那一类错位:一行文本的 x **随对齐换语义**(Web 的
 * ctx.textAlign + fillText —— left 起笔 / center 中心 / right 末笔),而 Cocos 的
 * placeRect 吃的是**盒**。折盒那一步在宿主侧 `ui/TextBand.ts:anchorBand`,折错一档的
 * 表现就是"右对齐与居中的标签整体右移半个盒宽":商店屏 9 条标签越出 560 右界,
 * 英雄页行内首字压住名字。
 *
 * 下面两张表逐条对应 `shop/ShopView.ts` 与 `heroes/HeroSelectView.ts` 的 Txt.set 调用
 * (容器矩形来自共享层布局函数,内缩与限宽同数),视图增减一行文本就要同步这里;
 * 于是没有真机面板时,同类回归在 node 侧一样会被拦下。
 */

const H_STD = 996;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

interface TextRequest {
  /** 出问题时的定位:指回视图里的那一行 */
  at: string;
  /** Web fillText 口径的对齐锚点(绝对设计 px) */
  x: number;
  baseY: number;
  /** 容器内宽(已扣内缩)= 这条文本的限宽 */
  maxW: number;
  px: number;
  align: TextAlign;
  /** 该文本所在容器的 nineMargin 内缩区;给出即受「落在内缩区内」这条断言约束 */
  box?: { x: number; y: number; w: number; h: number };
}

const bandOf = (t: TextRequest): Band => anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);

/** 越界判定:整条文本带(按限宽的最宽一档)落在 0..560 内;违规项连标签名一起列出 */
function expectInsideScreen(bands: TextRequest[]): void {
  const bad = bands
    .map((t) => `${t.at} [${t.align}] 锚点${t.x} 限宽${t.maxW} → ${bandOf(t).x}..${bandOf(t).x + bandOf(t).w}`)
    .filter((_, i) => {
      const b = bandOf(bands[i]);
      return b.x < 0 || b.x + b.w > W;
    });
  expect(bad).toEqual([]);
}

/**
 * nineMargin 内缩判定:登记了 `box`(贴图卡框按九宫格边距吃进来的一块内缩区)的那些文本带,
 * 整条带必须落在内缩区内 —— 切边带是画框的,压上去就是"文字啃框"。
 * 违规项连四边各自的超出量一起列出,便于直接指回视图里的那一行。
 */
function expectInsideNineMargin(bands: TextRequest[]): void {
  const bad = bands
    .filter((t) => t.box)
    .map((t) => {
      const b = bandOf(t);
      const box = t.box as NonNullable<TextRequest["box"]>;
      const over = {
        左: box.x - b.x,
        右: b.x + b.w - (box.x + box.w),
        上: box.y - b.y,
        下: b.y + b.h - (box.y + box.h),
      };
      const hits = Object.entries(over).filter(([, v]) => v > 0);
      return hits.length ? `${t.at} 越内缩区 ${hits.map(([k, v]) => `${k}+${v}`).join(" ")}` : "";
    })
    .filter((s) => s !== "");
  expect(bad).toEqual([]);
}

/** 商店屏的文本带:顶信息条 8 行 / 工具钮 / 三卡 / 槽位+1 / 两个分区条 / 武器行 / 进化行 / 底操作条 */
function shopTextBands(L: ReturnType<typeof shopLayoutPure>): TextRequest[] {
  const pad = UI.pad;
  const rx = W - pad;
  const out: TextRequest[] = [
    { at: "顶栏标题", x: pad, baseY: 19, maxW: 160, px: FS.micro, align: "left" },
    { at: "顶栏金币", x: rx, baseY: 19, maxW: 120, px: FS.micro, align: "right" },
    { at: "顶栏敌情", x: pad + 16, baseY: 39, maxW: 330, px: FS.micro, align: "left" },
    { at: "顶栏槽位", x: rx, baseY: 39, maxW: 120, px: FS.micro, align: "right" },
    { at: "顶栏套组链", x: pad, baseY: 58, maxW: 150, px: FS.micro, align: "left" },
    // 进度胶囊后的加成串:套组链取满限宽 150 才是这条的最右位(胶囊宽 90 + 两段 8 缝)
    { at: "顶栏套组加成", x: pad + 150 + 8 + 90 + 8, baseY: 58, maxW: 190, px: FS.micro, align: "left" },
    { at: "顶栏推荐", x: pad, baseY: 58, maxW: 330, px: FS.micro, align: "left" },
    { at: "顶栏卡价提示", x: rx, baseY: 58, maxW: 160, px: FS.micro, align: "right" },
    { at: "槽位+1 钮", x: L.slotBtn.x + L.slotBtn.w / 2, baseY: L.slotBtn.y + 18, maxW: L.slotBtn.w - 16, px: FS.muted, align: "center" },
    { at: "底栏开始钮", x: L.nextBtn.x + L.nextBtn.w / 2, baseY: L.nextBtn.y + 29, maxW: L.nextBtn.w - 16, px: FS.body, align: "center" },
    { at: "底栏敌情", x: pad, baseY: SHOP_BOTTOM + 19, maxW: 238, px: FS.micro, align: "left" },
    { at: "底栏推荐", x: pad, baseY: SHOP_BOTTOM + 37, maxW: 238, px: FS.micro, align: "left" },
  ];
  for (const [i, b] of L.toolBtns.entries()) out.push({ at: `工具钮${i}`, x: b.x + b.w / 2, baseY: b.y + 18, maxW: b.w - 12, px: FS.body, align: "center" });
  /** 卡框走 frame_<品质> 九宫格时吃进的内缩量(viewTable.nineSlice.keys.frame_* = slice × module) */
  const CARD_BORDER = 16;
  for (const [i, r] of L.cards.entries()) {
    const icx = r.x + r.w / 2;
    // 与 shop/ShopView.ts 同一口径:行位让出 dy,限宽按内缩量的两倍(内缩量不足 7 时退到 8 的既有一圈)
    const dy = Math.max(0, CARD_BORDER - 7);
    const dyb = Math.max(14, CARD_BORDER + 12);
    const inner = r.w - Math.max(8, CARD_BORDER) * 2;
    const box = { x: r.x + CARD_BORDER, y: r.y + CARD_BORDER, w: inner, h: r.h - CARD_BORDER * 2 };
    out.push(
      { at: `卡${i}图标首字`, x: icx, baseY: r.y + 38 + dy, maxW: 40, px: FS.section, align: "center", box },
      { at: `卡${i}名`, x: icx, baseY: r.y + 66 + dy, maxW: inner, px: FS.body, align: "center", box },
      { at: `卡${i}品质`, x: icx, baseY: r.y + 84 + dy, maxW: inner, px: FS.muted, align: "center", box },
      { at: `卡${i}效果行`, x: icx, baseY: r.y + 104 + dy, maxW: inner, px: FS.micro, align: "center", box },
      { at: `卡${i}价格`, x: icx, baseY: r.y + r.h - dyb, maxW: inner, px: FS.body, align: "center", box },
      { at: `卡${i}套组角标`, x: r.x + r.w - 8 - dy, baseY: r.y + 19 + dy, maxW: 44, px: FS.micro, align: "right", box },
      { at: `卡${i}售罄主行`, x: icx, baseY: r.y + r.h / 2 + 6, maxW: inner, px: FS.section, align: "center", box },
      { at: `卡${i}售罄副行`, x: icx, baseY: r.y + r.h / 2 + 28, maxW: inner, px: FS.micro, align: "center", box }
    );
  }
  for (const [i, y] of [L.weaponLabelY, L.mergeLabelY].entries()) {
    out.push({ at: `分区${i}标题`, x: pad + 10, baseY: y + 18, maxW: 330, px: FS.muted, align: "left" });
    out.push({ at: `分区${i}右注`, x: W - pad - 10, baseY: y + 18, maxW: 150, px: FS.micro, align: "right" });
  }
  for (const [i, r] of L.weaponRows.entries()) {
    const icy = r.y + r.h / 2;
    const d = L.destroyRects[i];
    out.push(
      // 有图标时名从 r.x+38 起笔,缺图标退到 r.x+10:取更宽的那一档
      { at: `武器${i}名`, x: r.x + 10, baseY: icy, maxW: 200, px: FS.muted, align: "left" },
      { at: `武器${i}副`, x: r.x + 246, baseY: icy, maxW: 130, px: FS.micro, align: "left" },
      { at: `武器${i}销毁`, x: d.x + d.w / 2, baseY: d.y + d.h / 2, maxW: d.w - 6, px: FS.micro, align: "center" }
    );
  }
  const wph = L.weaponRows[0];
  out.push({ at: "武器空态", x: wph.x + wph.w / 2, baseY: wph.y + wph.h / 2, maxW: wph.w - 16, px: FS.muted, align: "center" });
  for (const [i, r] of L.merges.entries()) {
    const mcy = r.y + r.h / 2;
    out.push({ at: `进化${i}名`, x: r.x + 10, baseY: mcy, maxW: 300, px: FS.muted, align: "left" });
    out.push({ at: `进化${i}费用`, x: r.x + r.w - 10, baseY: mcy, maxW: 160, px: FS.muted, align: "right" });
  }
  const mph = L.merges[0];
  out.push({ at: "进化空态", x: mph.x + mph.w / 2, baseY: mph.y + mph.h / 2, maxW: mph.w - 16, px: FS.muted, align: "center" });
  return out;
}

/** 英雄屏的文本带:表头 / 详情(含缺图立绘首字)/ 技能四行 / 三枚按钮 / 列表行(已换算回绝对坐标) */
function heroTextBands(L: ReturnType<typeof heroLayoutAt>["L"], preview: boolean): TextRequest[] {
  const pad = UI.pad;
  const d = L.detail;
  const out: TextRequest[] = [
    { at: "表头标题", x: pad, baseY: 36, maxW: W - pad * 2 - UI.backW, px: FS.title, align: "left" },
    { at: "表头副信息", x: pad, baseY: 56, maxW: W - pad * 2, px: FS.muted, align: "left" },
    { at: "详情立绘首字", x: L.portrait.x + L.portrait.w / 2, baseY: L.portrait.y + L.portrait.h / 2, maxW: L.portrait.w, px: FS.display, align: "center" },
    { at: "详情技能小标", x: L.portrait.x, baseY: L.skillLabelY, maxW: 160, px: FS.micro, align: "left" },
    { at: "返回钮", x: L.backBtn.x + L.backBtn.w / 2, baseY: L.backBtn.y + L.backBtn.h / 2, maxW: L.backBtn.w, px: FS.muted, align: "center" },
    { at: "确定钮", x: L.confirm.x + L.confirm.w / 2, baseY: L.confirm.y + L.confirm.h / 2, maxW: L.confirm.w - 16, px: FS.body, align: "center" },
    { at: "不出战钮", x: L.clearBtn.x + L.clearBtn.w / 2, baseY: L.clearBtn.y + L.clearBtn.h / 2, maxW: L.clearBtn.w - 8, px: FS.muted, align: "center" },
  ];
  if (preview) {
    out.push(
      { at: "详情名", x: L.textX, baseY: L.nameY, maxW: L.loreW, px: FS.title, align: "left" },
      { at: "详情称号", x: L.textX, baseY: L.titleY, maxW: L.loreW, px: FS.muted, align: "left" },
      { at: "详情正文", x: L.textX, baseY: L.loreY, maxW: L.loreW, px: FS.muted, align: "left" }
    );
  } else {
    out.push(
      { at: "详情空态主行", x: d.x + d.w / 2, baseY: d.y + 180, maxW: d.w - 28, px: FS.section, align: "center" },
      { at: "详情空态副行", x: d.x + d.w / 2, baseY: d.y + 206, maxW: d.w - 28, px: FS.muted, align: "center" }
    );
  }
  for (const [i, sr] of L.skillRows.entries()) {
    out.push(
      { at: `技能${i}胶囊`, x: sr.chip.x + sr.chip.w / 2, baseY: sr.chip.y + sr.chip.h / 2, maxW: sr.chip.w, px: FS.micro, align: "center" },
      { at: `技能${i}名`, x: sr.rect.x + 68, baseY: sr.labelY, maxW: sr.descW, px: FS.body, align: "left" },
      { at: `技能${i}说明`, x: sr.rect.x + 68, baseY: sr.descY, maxW: sr.descW, px: FS.micro, align: "left" }
    );
  }
  for (const [i, row] of L.rows.entries()) {
    out.push(
      { at: `行${i}立绘首字`, x: row.portrait.x + row.portrait.w / 2, baseY: row.portrait.y + row.portrait.h / 2, maxW: row.portrait.w, px: FS.title, align: "center" },
      { at: `行${i}名`, x: row.textX, baseY: row.nameY, maxW: row.badge.x - row.textX - 10, px: FS.body, align: "left" },
      { at: `行${i}副`, x: row.textX, baseY: row.subY, maxW: row.badge.x - row.textX - 10, px: FS.micro, align: "left" },
      { at: `行${i}徽标`, x: row.badge.x + row.badge.w / 2, baseY: row.badge.y + row.badge.h / 2, maxW: row.badge.w, px: FS.micro, align: "center" }
    );
  }
  return out;
}

const rowCharBand = (row: ReturnType<typeof heroLayoutAt>["L"]["rows"][number]): Band => bandOf({ at: "首字", x: row.portrait.x + row.portrait.w / 2, baseY: 0, maxW: row.portrait.w, px: FS.title, align: "center" });
const rowNameBand = (row: ReturnType<typeof heroLayoutAt>["L"]["rows"][number]): Band => bandOf({ at: "名字", x: row.textX, baseY: 0, maxW: row.badge.x - row.textX - 10, px: FS.body, align: "left" });

describe("文本带右界(shopLayoutPure / heroSelectLayout 全网格)", () => {
  it("anchorBand 的 x 就是对齐锚点:起笔 / 中心 / 末笔三条恒成立", () => {
    expect([alignAx("left"), alignAx("center"), alignAx("right")]).toEqual([0, 0.5, 1]);
    const b = (align: TextAlign) => anchorBand(300, 58, 160, FS.micro, align, LIFT);
    expect(b("left").x).toBe(300);
    expect(b("center").x + b("center").w / 2).toBe(300);
    expect(b("right").x + b("right").w).toBe(300);
    // 基线口径:盒顶 = 基线 − 字号 × lift,行高 = 字号 × 1.25
    expect(b("left").y).toBe(Math.round(58 - FS.micro * LIFT));
    expect(b("left").h).toBe(Math.round(FS.micro * 1.25));
  });

  it("商店屏 0..8 武器 × 0..4 进化组全网格:每条文本带都落在 0..560", () => {
    for (let nw = 0; nw <= 8; nw++) {
      for (let nm = 0; nm <= 4; nm++) {
        const bands = shopTextBands(shopLayoutPure(nw, nm));
        expect(bands.length).toBeGreaterThan(30);
        expectInsideScreen(bands);
      }
    }
  });

  it("商店卡框换 frame_<品质> 贴图后:卡内每行文本都落在 nineMargin 内缩区(三档卡高全过)", () => {
    for (let nw = 0; nw <= 8; nw++) {
      for (let nm = 0; nm <= 4; nm++) {
        const bands = shopTextBands(shopLayoutPure(nw, nm));
        expect(bands.filter((t) => t.box).length).toBe(24);
        expectInsideNineMargin(bands);
      }
    }
    // 三档卡高各自实测一次,确认最矮那档(160)也还放得下五行
    for (const [nw, nm] of [[8, 4], [5, 1], [1, 1]] as const) {
      const L = shopLayoutPure(nw, nm);
      expectInsideNineMargin(shopTextBands(L));
    }
    expect([shopLayoutPure(8, 4).cardH, shopLayoutPure(5, 1).cardH, shopLayoutPure(1, 1).cardH]).toEqual([160, 176, 208]);
  });

  it("英雄屏 996 / 1246 两档 × 四季 × 首中末滚动位:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const seasonId of [1, 2, 3, 4]) {
        const maxScroll = heroLayoutAt(seasonId, h, 0).L.maxScroll;
        for (const offset of [0, Math.round(maxScroll / 2), maxScroll]) {
          const { L } = heroLayoutAt(seasonId, h, offset);
          expect(L.rows.length).toBeGreaterThan(0);
          expectInsideScreen(heroTextBands(L, false));
          expectInsideScreen(heroTextBands(L, true));
        }
      }
    }
  });

  it("行内立绘首字与名字互不相犯:首字带右沿 ≤ 名字起笔,且首字仍在立绘位内", () => {
    for (const h of [H_STD, H_TALL]) {
      const { L: top } = heroLayoutAt(4, h, 0);
      const { L: end } = heroLayoutAt(4, h, top.maxScroll);
      for (const row of [...top.rows, ...end.rows]) {
        const char = rowCharBand(row);
        const name = rowNameBand(row);
        expect(char.x).toBeGreaterThanOrEqual(row.rect.x);
        expect(char.x + char.w).toBeLessThanOrEqual(name.x);
      }
    }
  });
});
