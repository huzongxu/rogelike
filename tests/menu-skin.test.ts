/**
 * 主菜单皮肤表(menuSkin)接入测试:覆盖/校验回退/快照独立性。
 * 皮肤表是模块级可变状态,每个用例结束恢复默认(空 = 零画面变化)。
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  applyMenuSkin,
  snapshotMenuSkin,
  setMenuSkin,
  MENU_SKIN_DEFAULTS,
  menuSkinWarnings,
} from "@game/data/menuSkin";

afterEach(() => {
  applyMenuSkin();
  menuSkinWarnings.length = 0;
});

describe("皮肤表默认与快照", () => {
  it("默认全空(零画面变化前提)", () => {
    const s = snapshotMenuSkin();
    expect(s).toEqual(MENU_SKIN_DEFAULTS);
  });

  it("快照是深拷贝:改快照不影响生效表", () => {
    applyMenuSkin({ remap: { menu_section: "menu_strip" }, insets: { row: { t: 1, r: 2, b: 3, l: 4 } } });
    const s = snapshotMenuSkin();
    s.remap.menu_section = "menu_note_plate";
    s.insets.row!.t = 99;
    const again = snapshotMenuSkin();
    expect(again.remap.menu_section).toBe("menu_strip");
    expect(again.insets.row!.t).toBe(1);
  });
});

describe("applyMenuSkin 覆盖与回退", () => {
  it("合法配置全五项生效", () => {
    applyMenuSkin({
      remap: { menu_row_plate: "menu_note_plate" },
      insets: { title: { t: 1, r: -2, b: 3, l: 0 } },
      hidden: ["menu_strip"],
      textHidden: ["note"],
      layers: { "row.image": { name: "行板图" } },
    });
    const s = snapshotMenuSkin();
    expect(s.remap.menu_row_plate).toBe("menu_note_plate");
    expect(s.insets.title).toEqual({ t: 1, r: -2, b: 3, l: 0 });
    expect(s.hidden).toEqual(["menu_strip"]);
    expect(s.textHidden).toEqual(["note"]);
    expect(s.layers["row.image"]).toEqual({ name: "行板图" });
  });

  it("remap 目标不在资产清单:保留映射但告警(运行时按缺图回退)", () => {
    applyMenuSkin({ remap: { menu_section: "not_a_key" } });
    expect(snapshotMenuSkin().remap.menu_section).toBe("not_a_key");
    expect(menuSkinWarnings.some((w) => w.includes("不在资产清单"))).toBe(true);
  });

  it("remap 目标非字符串:忽略该项", () => {
    applyMenuSkin({ remap: { menu_section: 123 } });
    expect(snapshotMenuSkin().remap.menu_section).toBeUndefined();
    expect(menuSkinWarnings.length).toBeGreaterThan(0);
  });

  it("insets 未知面板/非法形状忽略;边值越界回退 0", () => {
    applyMenuSkin({
      insets: {
        ghost: { t: 1, r: 1, b: 1, l: 1 },
        row: "不是对象",
        chip: { t: 999, r: 5, b: "x", l: -100 },
      },
    });
    const s = snapshotMenuSkin();
    expect("ghost" in s.insets).toBe(false);
    expect(s.insets.row).toBeUndefined();
    expect(s.insets.chip).toEqual({ t: 0, r: 5, b: 0, l: -100 });
    expect(menuSkinWarnings.length).toBeGreaterThanOrEqual(3);
  });

  it("textHidden 未知面板忽略;数组非数组忽略", () => {
    applyMenuSkin({ textHidden: ["note", "ghost", 7], hidden: "不是数组" });
    const s = snapshotMenuSkin();
    expect(s.textHidden).toEqual(["note"]);
    expect(s.hidden).toEqual([]);
  });

  it("layers 非法项忽略", () => {
    applyMenuSkin({ layers: { "row.image": { name: 42 }, ok: { name: "好" }, bad: "x" } });
    const s = snapshotMenuSkin();
    expect(s.layers["row.image"]).toBeUndefined();
    expect(s.layers.ok).toEqual({ name: "好" });
    expect(s.layers.bad).toBeUndefined();
  });

  it("无参调用恢复全部默认", () => {
    applyMenuSkin({ hidden: ["menu_strip"], textHidden: ["note"] });
    applyMenuSkin();
    expect(snapshotMenuSkin()).toEqual(MENU_SKIN_DEFAULTS);
  });
});

describe("setMenuSkin(布局台写回)", () => {
  it("字段级整体替换,未传字段保留", () => {
    applyMenuSkin({ remap: { a: "b" }, hidden: ["k"] });
    setMenuSkin({ hidden: ["x", "y"] });
    const s = snapshotMenuSkin();
    expect(s.hidden).toEqual(["x", "y"]);
    expect(s.remap.a).toBe("b"); // 未传字段不动
  });

  it("写入是拷贝:外部再改入参不影响生效表", () => {
    const list = ["menu_strip"];
    setMenuSkin({ hidden: list });
    list.push("menu_section");
    expect(snapshotMenuSkin().hidden).toEqual(["menu_strip"]);
  });
});
