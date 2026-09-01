/**
 * 首局引导单元测试(需求规划:新玩家第 1 关前 5 分钟教学)。
 * 覆盖:顺序解锁 / 条件等待 / 自动隐藏 / 跳过 / 完成关闭 / 存档迁移。
 */

import { describe, it, expect, vi } from "vitest";
import { Onboarding, GUIDE_STEPS, TIP_SECONDS, type GuideCtx } from "../src/systems/onboarding";

// 存档模块依赖平台存储,这里 mock 掉 platform(与 prestige.test 一致)
const store = vi.hoisted(() => ({} as Record<string, string>));
vi.mock("../src/platform/adapter", () => ({
  platform: {
    isWeChat: false,
    createCanvas: () => ({} as HTMLCanvasElement),
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

import { loadSave } from "../src/systems/save";

function ctx(partial: Partial<GuideCtx> = {}): GuideCtx {
  return {
    playing: false,
    shop: false,
    elapsed: 0,
    chapter: 1,
    kills: 0,
    equipmentCount: 0,
    hasSet: false,
    setInfo: "",
    mergesAvailable: 0,
    ...partial,
  };
}

/** 推进直到当前提示出现(避免 expect 断言缩窄 o.current 影响后续读取) */
function stepUntil(o: Onboarding, c: GuideCtx, dt = 0.1, maxTicks = 200): void {
  for (let i = 0; i < maxTicks; i++) {
    o.update(c, dt);
    if (o.current) return;
  }
}

/** 每次重新读取当前提示文案(绕开 TS 对 o.current 的缩窄) */
function cur(o: Onboarding): { text: string } | null {
  return o.current;
}

describe("首局引导(顺序解锁)", () => {
  it("6 个步骤按顺序出现,条件不满足就等待", () => {
    const o = new Onboarding();
    expect(GUIDE_STEPS).toHaveLength(6);

    // 步骤 1:开局 2.5s 后播放中才显示
    stepUntil(o, ctx({ playing: true, elapsed: 1 }));
    expect(cur(o)).toBeNull();
    stepUntil(o, ctx({ playing: true, elapsed: 3 }));
    expect(cur(o)?.text).toContain("自动");
    o.current = null;

    // 步骤 2:击杀 ≥8
    stepUntil(o, ctx({ playing: true, elapsed: 5, kills: 7 }));
    expect(cur(o)).toBeNull();
    stepUntil(o, ctx({ playing: true, elapsed: 5, kills: 8 }));
    expect(cur(o)?.text).toContain("金币");
  });

  it("商店提示按顺序(商店→套组→三合一),套组文案随选择变化", () => {
    // 推进前两步(自动/金币,playing 状态)
    const advance = (o: Onboarding) => {
      stepUntil(o, ctx({ playing: true, elapsed: 3 })); // 1 自动
      o.current = null;
      stepUntil(o, ctx({ playing: true, elapsed: 10, kills: 40 })); // 2 金币
      o.current = null;
    };
    // 3 商店
    const o1 = new Onboarding();
    advance(o1);
    stepUntil(o1, ctx({ shop: true, elapsed: 61, kills: 40 }));
    expect(cur(o1)?.text).toContain("章间商店");
    // 4 套组(未选)
    o1.current = null;
    stepUntil(o1, ctx({ shop: true, elapsed: 61, kills: 40 }));
    expect(cur(o1)?.text).toContain("武器套组");
    expect(cur(o1)?.text).toContain("主菜单可选");
    // 5 强化与进化(商店有可进化卡组时)
    o1.current = null;
    stepUntil(o1, ctx({ shop: true, elapsed: 61, kills: 40, mergesAvailable: 1 }));
    expect(cur(o1)?.text).toContain("强化");
    expect(cur(o1)?.text).toContain("进化");
    // 已选套组:换一局,套组步骤文案不同
    const o2 = new Onboarding();
    advance(o2);
    stepUntil(o2, ctx({ shop: true, elapsed: 61, kills: 40 }));
    o2.current = null;
    stepUntil(o2, ctx({ shop: true, elapsed: 61, kills: 40, hasSet: true, setInfo: "弹幕风暴" }));
    expect(cur(o2)?.text).toContain("弹幕风暴");
    expect(cur(o2)?.text).toContain("3/6 件套");
  });

  it("自动隐藏:TIP_SECONDS 秒后隐藏并允许下一提示", () => {
    const o = new Onboarding();
    stepUntil(o, ctx({ playing: true, elapsed: 3 }));
    expect(cur(o)).not.toBeNull();
    o.update(ctx({ playing: true, elapsed: 3 }), TIP_SECONDS + 0.1);
    expect(cur(o)).toBeNull();
  });

  it("跳过:终止引导并标记完成", () => {
    const o = new Onboarding();
    o.skipAll();
    expect(o.enabled).toBe(false);
    expect(o.current).toBeNull();
    o.update(ctx({ playing: true, elapsed: 3 }), 0.1);
    expect(o.current).toBeNull();
  });

  it("禁用(enabled=false)后不再显示任何提示", () => {
    const o = new Onboarding();
    o.enabled = false;
    stepUntil(o, ctx({ playing: true, elapsed: 10, kills: 50 }));
    expect(o.current).toBeNull();
  });

  it("全部步骤走完后 finished=true", () => {
    const o = new Onboarding();
    const play = (elapsed: number, kills = 50, chapter = 1) => ctx({ playing: true, elapsed, chapter, kills });
    // 1:自动(需 elapsed>2.5)
    stepUntil(o, play(3)); o.current = null;
    // 2:金币(kills≥8)
    stepUntil(o, play(10)); o.current = null;
    // 3:商店
    stepUntil(o, ctx({ shop: true, elapsed: 61, kills: 50 })); o.current = null;
    // 4:套组
    stepUntil(o, ctx({ shop: true, elapsed: 61, kills: 50 })); o.current = null;
    // 5:三合一
    stepUntil(o, ctx({ shop: true, elapsed: 61, kills: 50, mergesAvailable: 1 })); o.current = null;
    // 6:第 2 章
    stepUntil(o, play(62, 50, 2));
    expect(cur(o)?.text).toContain("Boss");
    expect(o.finished).toBe(true);
  });
});

describe("存档迁移", () => {
  it("旧存档无 tutorialDone 字段 → 默认为 false(未完成,继续显示引导)", () => {
    store["echo-abyss-save-v1"] = JSON.stringify({
      points: 5,
      ownedTalents: [],
      collection: { triggers: [], effects: [], modifiers: [], enemies: [] },
      bestRun: null,
      bestWave: 0,
      stardust: 0,
      gachaTicket: 0,
      highestStage: 1,
      ownedGear: [],
      gachaPityEpic: 0,
      gachaPityLegendary: 0,
      selectedGearId: null,
      dayEcho: 0,
      premiumPass: false,
      passTier: 0,
      prestiges: 0,
      fragments: 0,
      commission: null,
      commission2: null,
      selectedSet: null,
      // 无 tutorialDone:旧存档
    });
    const save = loadSave();
    expect(save.tutorialDone).toBe(false);
  });

  it("tutorialDone=true 的存档 → 加载后保留为已完成", () => {
    store["echo-abyss-save-v1"] = JSON.stringify({ points: 1, tutorialDone: true });
    const save = loadSave();
    expect(save.tutorialDone).toBe(true);
  });
});
