/**
 * 布局台皮肤模型(结构树/往返/白名单导出)—— 批次③验收。
 *
 * 关注点:
 *  1. 固定拓扑:7 面板 13 层,默认树全可见/无换图/零间距;
 *  2. 各 apply* 的往返与不可变性;
 *  3. 导出白名单:脏键/非法值必被滤掉;空皮肤导出 = "{}"(零画面变化前提)。
 */

import { describe, it, expect } from "vitest";
import { MENU_SKIN_DEFAULTS, type MenuSkinTable } from "@game/data/menuSkin";
import {
  SKIN_TREE,
  buildSkinTree,
  applyToggle,
  applyRemap,
  applyInsets,
  applyLayerName,
  exportSkinJson,
  mergeExport,
} from "../src/dev/labSkin";

const fresh = (): MenuSkinTable => ({
  remap: {},
  insets: {},
  hidden: [],
  textHidden: [],
  layers: {},
});

describe("SKIN_TREE 拓扑与默认树", () => {
  it("7 面板按绘制序、13 层(除货币条无文字层外各 2 层)", () => {
    expect(SKIN_TREE.map((p) => p.id)).toEqual(["title", "strip", "chip", "section", "row", "setCard", "note"]);
    expect(SKIN_TREE.map((p) => p.z)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const layers = SKIN_TREE.flatMap((p) => p.layers);
    expect(layers).toHaveLength(13);
    expect(SKIN_TREE.find((p) => p.id === "strip")!.layers.map((l) => l.kind)).toEqual(["image"]);
    expect(new Set(layers.map((l) => l.id)).size).toBe(13);
  });

  it("默认树:全可见、无换图(解析后 = 原键)、零间距、默认层名", () => {
    const tree = buildSkinTree(fresh());
    for (const node of tree) {
      for (const row of node.layers) {
        expect(row.visible).toBe(true);
        expect(row.insets).toEqual({ t: 0, r: 0, b: 0, l: 0 });
        expect(row.displayName).not.toBe("");
        for (const k of row.assetKeys) expect(row.resolved[k]).toBe(k);
      }
    }
  });

  it("图键与 drawMenu 实际使用键一致(抽检多图层面板)", () => {
    const row = buildSkinTree(fresh()).find((n) => n.panelId === "row")!;
    expect(row.layers[0].assetKeys).toEqual(["menu_row_plate", "menu_row_plate_current"]);
    const setCard = buildSkinTree(fresh()).find((n) => n.panelId === "setCard")!;
    expect(setCard.layers[0].assetKeys).toEqual(["menu_set_plate", "menu_set_plate_selected"]);
  });
});

describe("applyToggle 图层显隐", () => {
  it("图:整层全部键进 hidden;再开还原;往返后表不变", () => {
    const s0 = fresh();
    const s1 = applyToggle(s0, "row.image", false);
    expect(s1.hidden.sort()).toEqual(["menu_row_plate", "menu_row_plate_current"]);
    expect(buildSkinTree(s1).find((n) => n.panelId === "row")!.layers[0].visible).toBe(false);
    const s2 = applyToggle(s1, "row.image", true);
    expect(s2.hidden).toEqual([]);
    expect(buildSkinTree(s2).find((n) => n.panelId === "row")!.layers[0].visible).toBe(true);
  });

  it("文:面板进 textHidden;图不受影响", () => {
    const s1 = applyToggle(fresh(), "chip.text", false);
    expect(s1.textHidden).toEqual(["chip"]);
    expect(s1.hidden).toEqual([]);
    const node = buildSkinTree(s1).find((n) => n.panelId === "chip")!;
    expect(node.layers[0].visible).toBe(true);
    expect(node.layers[1].visible).toBe(false);
    const s2 = applyToggle(s1, "chip.text", true);
    expect(s2.textHidden).toEqual([]);
  });

  it("未知图层 → 原表原样返回", () => {
    const s0 = fresh();
    expect(applyToggle(s0, "ghost.image", false)).toBe(s0);
  });
});

describe("applyRemap 换图映射", () => {
  it("设置后树显示解析键;同键/还原删除映射", () => {
    const s1 = applyRemap(fresh(), "menu_set_plate", "menu_set_plate_selected");
    expect(s1.remap).toEqual({ menu_set_plate: "menu_set_plate_selected" });
    const node = buildSkinTree(s1).find((n) => n.panelId === "setCard")!;
    expect(node.layers[0].resolved["menu_set_plate"]).toBe("menu_set_plate_selected");
    expect(node.layers[0].resolved["menu_set_plate_selected"]).toBe("menu_set_plate_selected");

    expect(applyRemap(s1, "menu_set_plate", null).remap).toEqual({});
    expect(applyRemap(s1, "menu_set_plate", "menu_set_plate").remap).toEqual({});
  });
});

describe("applyInsets 四边间距", () => {
  it("合并现值、钳位 [-100,100]、四边归零删段", () => {
    const s1 = applyInsets(fresh(), "note", { l: 3 });
    expect(s1.insets.note).toEqual({ t: 0, r: 0, b: 0, l: 3 });
    const s2 = applyInsets(s1, "note", { r: 500 }); // 越界钳到 100
    expect(s2.insets.note).toEqual({ t: 0, r: 100, b: 0, l: 3 });
    const s3 = applyInsets(s2, "note", { t: -200, r: -100, l: -3 }); // t 钳 -100;未提供的 b 保留现值
    expect(s3.insets.note).toEqual({ t: -100, r: -100, b: 0, l: -3 });
    const s4 = applyInsets(s3, "note", { t: 0, r: 0, l: 0 }); // b 已是 0 → 四边全零删段
    expect("note" in s4.insets).toBe(false);
  });

  it("树上显示为所在层行的 insets", () => {
    const s1 = applyInsets(fresh(), "title", { t: 2, b: -2 });
    const node = buildSkinTree(s1).find((n) => n.panelId === "title")!;
    for (const row of node.layers) expect(row.insets).toEqual({ t: 2, r: 0, b: -2, l: 0 });
  });
});

describe("applyLayerName 图层改名", () => {
  it("设名后树显示自定义名;空名恢复默认;未知图层忽略", () => {
    const s0 = fresh();
    const s1 = applyLayerName(s0, "row.text", " 关卡文字 ");
    expect(s1.layers["row.text"]).toEqual({ name: "关卡文字" });
    expect(buildSkinTree(s1).find((n) => n.panelId === "row")!.layers[1].displayName).toBe("关卡文字");
    const s2 = applyLayerName(s1, "row.text", "   ");
    expect(s2.layers).toEqual({});
    expect(applyLayerName(s0, "nope.text", "x")).toBe(s0);
  });
});

describe("不可变性", () => {
  it("所有 apply* 不改入参", () => {
    const s0 = fresh();
    const snap = JSON.stringify(s0);
    applyToggle(s0, "title.image", false);
    applyRemap(s0, "a", "b");
    applyInsets(s0, "row", { t: 5 });
    applyLayerName(s0, "row.text", "x");
    expect(JSON.stringify(s0)).toBe(snap);
  });
});

describe("exportSkinJson 白名单导出", () => {
  it("空皮肤导出 = \"{}\"", () => {
    expect(exportSkinJson(fresh())).toBe("{}");
    expect(exportSkinJson(MENU_SKIN_DEFAULTS)).toBe("{}");
  });

  it("合法段按白名单输出,空段省略", () => {
    const s = applyLayerName(applyInsets(applyToggle(applyRemap(fresh(), "menu_note_plate", "menu_chip_plate"), "note.image", false), "note", { t: 4 }), "note.text", "板说明");
    expect(JSON.parse(exportSkinJson(s))).toEqual({
      remap: { menu_note_plate: "menu_chip_plate" },
      insets: { note: { t: 4, r: 0, b: 0, l: 0 } },
      hidden: ["menu_note_plate"],
      layers: { "note.text": { name: "板说明" } },
    });
  });

  it("脏键/非法值必被滤掉(顶层脏段、未知面板、非字符串、恒等映射)", () => {
    const dirty = {
      remap: { a: "b", self: "self", num: 42 },
      insets: { ghost: { t: 1 }, row: { t: 3, junk: 9 }, bad: 7 },
      hidden: ["menu_row_plate", 42, "menu_row_plate"],
      textHidden: ["row", "nope", 3],
      layers: { "row.text": { name: "ok" }, "ghost.x": { name: "n" }, "chip.text": { name: 5 } },
      evilTopLevel: { drop: true },
    } as unknown as MenuSkinTable;
    expect(JSON.parse(exportSkinJson(dirty))).toEqual({
      remap: { a: "b" },
      insets: { row: { t: 3, r: 0, b: 0, l: 0 } },
      hidden: ["menu_row_plate"],
      textHidden: ["row"],
      layers: { "row.text": { name: "ok" } },
    });
  });

  it("导出恒为五段白名单的子集(随机合法皮肤抽样)", () => {
    const s = applyToggle(applyInsets(fresh(), "chip", { l: 1, r: 2 }), "chip.text", false);
    const out = JSON.parse(exportSkinJson(s));
    for (const k of Object.keys(out)) expect(["remap", "insets", "hidden", "textHidden", "layers"]).toContain(k);
  });
});

describe("mergeExport 合并导出", () => {
  it("两段都有 → {menuLayout, menuSkin}", () => {
    const merged = JSON.parse(mergeExport('{"origin":{"pad":14}}', '{"hidden":["x"]}'));
    expect(merged).toEqual({ menuLayout: { origin: { pad: 14 } }, menuSkin: { hidden: ["x"] } });
  });

  it("单段 / 皮肤段为 {} 时省略 / 全无 → {}", () => {
    expect(JSON.parse(mergeExport('{"origin":{}}', null))).toEqual({ menuLayout: { origin: {} } });
    expect(JSON.parse(mergeExport(null, '{"insets":{"row":{"t":1,"r":0,"b":0,"l":0}}}'))).toEqual({
      menuSkin: { insets: { row: { t: 1, r: 0, b: 0, l: 0 } } },
    });
    expect(mergeExport(null, "{}")).toBe("{}");
    expect(mergeExport(null, null)).toBe("{}");
  });

  it("坏 JSON 直接抛出(不放行坏配置)", () => {
    expect(() => mergeExport("{bad", null)).toThrow();
    expect(() => mergeExport(null, "{bad")).toThrow();
  });
});
