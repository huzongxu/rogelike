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
import { SHOP_BOTTOM, SHOP_ROW_BOTTOM, SHOP_TOP, shopLayoutPure } from "@game/ui/shop";
import { SHOP_SLOT_CAP, generateEquipment, qualityBasePrice, slotExpandCost, type Equipment } from "@game/data/equipmentGen";
import { shopCardPrice, shopRefreshPrice } from "@game/data/shop";
import { DAILY_BOXES, ENERGY_MAX } from "@game/data/daily";
import { COMMISSION_READY_HOURS, type CommissionState } from "@game/data/commissions";
import { STAGES } from "@game/data/stages";
import type { TalentId } from "@game/data/talents";
import { theme } from "@game/ui/theme";

/* ---------- Web 侧存档层(出战镜像的对标物) ---------- */
import { loadSave } from "../src/systems/save";

/* ---------- Cocos 宿主侧(本文件的被测物) ---------- */
import { HeroSelectModel, type HeroSaveView, type ScrollGeometry } from "../cocos-prototype/assets/scripts/heroes/HeroSelectModel";
import { ShopModel, SHOP_CARD_SLOTS, SHOP_CONTENT_BOTTOM, type MergeGroup, type ShopWorld } from "../cocos-prototype/assets/scripts/shop/ShopModel";
import { buildMenuContent, menuCommissionReady, menuDailyDot, menuRowStates, menuStageOpen, starsGlyphs, type MenuSaveView } from "../cocos-prototype/assets/scripts/menu/MenuContentModel";
import { normalizeSave as cocosNormalizeSave } from "../cocos-prototype/assets/scripts/core/SaveModel";
import * as cocosScroll from "../cocos-prototype/assets/scripts/game/ui/scrollList";
import * as cocosHeroes from "../cocos-prototype/assets/scripts/game/data/heroes";

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

/** 996 标定档:视口 392 / maxScroll 560(= game/ui/heroSelectLayout 文件头的逐像素标定) */
const VIEW_996 = 392;
const MAX_996 = CONTENT_H - VIEW_996; // 560
/** 1246 伸展档:详情与按钮底锚不动,多余高度全部给列表 */
const H_TALL = 1246;
const VIEW_TALL = VIEW_996 + (H_TALL - 996); // 642
const MAX_TALL = CONTENT_H - VIEW_TALL; // 310

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

  it("996 档 offset=0 出 6 行,1246 档出 10 行;maxScroll 560 / 310", () => {
    const a = heroLayoutAt(1, 996).L;
    expect(a.list).toEqual({ x: 14, y: HERO_LIST_TOP, w: 532, h: VIEW_996 });
    expect(a.maxScroll).toBe(MAX_996);
    expect(a.first).toBe(0);
    expect(a.last).toBe(5);
    expect(a.rows).toHaveLength(6);
    expect(a.rows.map((r) => r.id)).toEqual(allHeroes().slice(0, 6).map((hh) => hh.id));
    expect(a.track).toEqual({ x: 550, y: HERO_LIST_TOP, w: 4, h: VIEW_996 });
    expect(a.thumb).not.toBe(null);
    expect(a.thumb!.x).toBe(550);
    expect(a.thumb!.y).toBe(HERO_LIST_TOP); // offset=0 → 滑块贴轨道顶
    expect(a.thumb!.h).toBeCloseTo((VIEW_996 * VIEW_996) / CONTENT_H, 6);

    const b = heroLayoutAt(1, H_TALL).L;
    expect(b.list.h).toBe(VIEW_TALL);
    expect(b.maxScroll).toBe(MAX_TALL);
    expect(b.first).toBe(0);
    expect(b.last).toBe(9);
    expect(b.rows).toHaveLength(10);
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

  it("进屏定位:open() 把当前出战那行滚到视口居中(996 档 index6 → offset 324)", () => {
    const m = new HeroSelectModel();
    const save: HeroSaveView = { selectedHero: "doran", selectedSet: heroDef("doran").setId, seasonId: 3 };
    m.open(save, W, 996);
    expect(m.scroll.offset).toBe(324); // 6×80 − (392−80)/2
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
        expect(L.nextBtn.y).toBeGreaterThanOrEqual(SHOP_BOTTOM);
        expect(L.nextBtn.y + L.nextBtn.h).toBeLessThanOrEqual(996);
        const last = L.merges[L.merges.length - 1];
        expect(last.y + last.h).toBe(SHOP_ROW_BOTTOM);
      }
    }
    // 底部带常量与宿主出口同数;且布局函数签名不收屏高 → "屏高变化仍成立" 是结构保证
    expect(SHOP_CONTENT_BOTTOM).toBe(SHOP_ROW_BOTTOM);
    expect([SHOP_TOP, SHOP_BOTTOM, SHOP_ROW_BOTTOM]).toEqual([64, 948, 942]);
    expect(shopLayoutPure.length).toBe(2); // 收不到屏高参数 → 屏高变化时几何必然不变
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
