/**
 * 出战英雄的存档层测试。
 * 契约:selectedHero 是唯一事实源,selectedSet 是它的派生镜像,镜像只有 applyHeroSelection 一个写入路径。
 * 覆盖:写入契约 / persist↔load 往返 / 老档反查补齐 / 脏值归一。
 */

import { describe, it, expect, vi } from "vitest";

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

import { loadSave, persistSave, resetSave, type SaveData } from "../src/systems/save";
import { allHeroes, applyHeroSelection, heroDef, showcaseHero, type HeroId, type HeroSelection } from "@game/data/heroes";

const KEY = "echo-abyss-save-v1";

function emptySelection(): HeroSelection {
  return { selectedHero: null, selectedSet: null };
}

/** 写一份「英雄系统之前」的老档:selectedHero 字段不存在(JSON.stringify 会丢掉 undefined) */
function seedLegacySave(patches: Record<string, unknown> = {}): SaveData {
  const base = resetSave();
  const legacy: Record<string, unknown> = { ...base, selectedHero: undefined };
  store[KEY] = JSON.stringify({ ...legacy, ...patches });
  return base;
}

describe("applyHeroSelection:selectedHero → selectedSet 的唯一同步点", () => {
  it("12 个英雄逐个选,镜像恒等自身套组", () => {
    const sel = emptySelection();
    for (const h of allHeroes()) {
      applyHeroSelection(sel, h.id);
      expect(sel.selectedHero).toBe(h.id);
      expect(sel.selectedSet).toBe(heroDef(h.id).setId);
    }
  });

  it("连续换人不留旧镜像(每次都是成对写入)", () => {
    const sel = emptySelection();
    applyHeroSelection(sel, "doran");
    applyHeroSelection(sel, "sia");
    applyHeroSelection(sel, "mu");
    expect(sel).toEqual({ selectedHero: "mu", selectedSet: heroDef("mu").setId });
  });

  it("传 null = 不出战,两个字段同时清空", () => {
    const sel = emptySelection();
    applyHeroSelection(sel, "vera");
    applyHeroSelection(sel, null);
    expect(sel).toEqual({ selectedHero: null, selectedSet: null });
  });

  it("派生字段不自造事实:镜像套组的英雄反查回原人", () => {
    const sel = emptySelection();
    applyHeroSelection(sel, "rayne");
    expect(showcaseHero(sel)?.id).toBe("rayne");
  });
});

describe("落盘往返:主菜单展示带读到的就是玩家选的", () => {
  it("选英雄 → persistSave → loadSave 字段不变", () => {
    const s = resetSave();
    applyHeroSelection(s, "nora");
    persistSave(s);
    const back = loadSave();
    expect(back.selectedHero).toBe("nora");
    expect(back.selectedSet).toBe(heroDef("nora").setId);
    expect(showcaseHero(back)?.id).toBe("nora");
  });

  it("没选出战 → 两个 null 原样往返(不会凭空推荐)", () => {
    const s = resetSave();
    applyHeroSelection(s, null);
    persistSave(s);
    const back = loadSave();
    expect(back.selectedHero).toBeNull();
    expect(back.selectedSet).toBeNull();
    expect(showcaseHero(back)).toBeNull();
  });

  it("落盘文本里两个字段都在(不靠派生兜底混过去)", () => {
    const s = resetSave();
    applyHeroSelection(s, "willow");
    persistSave(s);
    const raw = JSON.parse(store[KEY]) as Record<string, unknown>;
    expect(raw.selectedHero).toBe("willow");
    expect(raw.selectedSet).toBe(heroDef("willow").setId);
  });
});

describe("老档迁移:selectedSet 反查补齐 selectedHero", () => {
  it("只有 selectedSet 的新套组(3 期) → 反查出对应英雄", () => {
    seedLegacySave({ selectedSet: "magma" });
    const s = loadSave();
    expect(s.selectedHero).toBe("doran");
    expect(s.selectedSet).toBe("magma");
  });

  it("只有 selectedSet 的后季新套(2 期) → 反查同样成立", () => {
    seedLegacySave({ selectedSet: "glacier" });
    expect(loadSave().selectedHero).toBe("nora");
  });

  it("selectedSet 为 null → 保持不出战,不默认推荐首发", () => {
    seedLegacySave({ selectedSet: null });
    const s = loadSave();
    expect(s.selectedHero).toBeNull();
    expect(s.selectedSet).toBeNull();
  });

  it("脏 selectedHero + 合法 selectedSet → 英雄归零后仍靠镜像补齐", () => {
    seedLegacySave({ selectedHero: "not_a_hero", selectedSet: "phantom" });
    const s = loadSave();
    expect(s.selectedHero).toBe("willow");
    expect(s.selectedSet).toBe("phantom");
  });

  it("两个字段都脏 → 双双归零(脏值不会变成随机英雄)", () => {
    seedLegacySave({ selectedHero: 42, selectedSet: "no_such_set" });
    const s = loadSave();
    expect(s.selectedHero).toBeNull();
    expect(s.selectedSet).toBeNull();
  });

  it("selectedHero 合法但与 selectedSet 不一致 → 以英雄为准重写镜像", () => {
    const s = resetSave();
    applyHeroSelection(s, "vera");
    persistSave(s);
    const tampered = JSON.parse(store[KEY]) as Record<string, unknown>;
    tampered.selectedSet = "barrage";
    store[KEY] = JSON.stringify(tampered);
    const back = loadSave();
    expect(back.selectedHero).toBe("vera");
    expect(back.selectedSet).toBe(heroDef("vera").setId);
  });

  it("未发布季的英雄也是合法 id(存档字段不做赛季门控,门控在列表页)", () => {
    const s = resetSave();
    s.seasonId = 1;
    applyHeroSelection(s, "mu" as HeroId);
    persistSave(s);
    const back = loadSave();
    expect(back.selectedHero).toBe("mu");
    expect(heroDef("mu").releaseSeason).toBe(4);
  });
});
