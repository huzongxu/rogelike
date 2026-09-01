/**
 * 美术资源管线单元测试:
 * 清单完整性 / 缺图回退(无图片环境不崩溃) / 就绪后绘制(含 cover 裁切)。
 */

import { describe, it, expect, vi } from "vitest";
import { AssetManager } from "../src/platform/assets";
import { ASSET_MANIFEST } from "../src/data/assets";
import { skinBar, skinHeader, iconText, skinIconButton } from "../src/ui/skin";

const created = vi.hoisted(() => [] as any[]);
vi.mock("../src/platform/adapter", () => ({
  platform: {
    isWeChat: false,
    createCanvas: () => ({} as HTMLCanvasElement),
    createImage: () => {
      const img: any = { src: "", onload: null, onerror: null, width: 100, height: 50 };
      created.push(img);
      return img;
    },
    assetRoot: () => "assets/",
    requestAnimationFrame: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    getStorage: () => null,
    setStorage: () => {},
  },
}));

function makeCtx(): CanvasRenderingContext2D & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    drawImage: (...args: unknown[]) => {
      calls.push(args);
    },
  } as CanvasRenderingContext2D & { calls: any[] };
}

describe("资源清单(ASSET_MANIFEST)", () => {
  it("条目非空且命名规范(小写字母数字下划线 .png)", () => {
    expect(Object.keys(ASSET_MANIFEST).length).toBeGreaterThan(30);
    for (const [key, file] of Object.entries(ASSET_MANIFEST)) {
      expect(key.length).toBeGreaterThan(0);
      expect(file).toMatch(/^[a-z0-9_]+\.png$/);
    }
  });
  it("核心资源键齐全(背景/卡框/玩家/敌人/套组)", () => {
    for (const k of ["bg_stage_1", "bg_stage_7", "frame_epic", "frame_hidden", "player", "enemy_boss", "enemy_tank", "icon_set_thorn", "icon_gold", "avatar_legendary"]) {
      expect(ASSET_MANIFEST[k], `缺少 ${k}`).toBeTruthy();
    }
  });
});

describe("AssetManager", () => {
  it("环境不支持 createImage(返回 null)→ 全部回退,draw 返回 false 不崩溃", () => {
    const am = new AssetManager({ bg_menu: "bg_menu.png" }, "assets/");
    // 让平台返回 null:清空 created 并用假 createImage
    vi.mocked(created).length = 0;
    am.beginLoad();
    expect(am.isReady("bg_menu")).toBe(false);
    expect(am.draw(makeCtx(), "bg_menu", 0, 0, 100, 100)).toBe(false);
  });

  it("图片就绪后 draw 返回 true 并调用 drawImage(stretch 模式)", () => {
    created.length = 0;
    const am = new AssetManager({ bg_menu: "bg_menu.png" }, "assets/");
    am.beginLoad();
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("assets/bg_menu.png");
    created[0].onload(); // 模拟加载完成
    const ctx = makeCtx();
    expect(am.isReady("bg_menu")).toBe(true);
    expect(am.draw(ctx, "bg_menu", 10, 20, 60, 30)).toBe(true);
    expect(ctx.calls).toHaveLength(1);
    // drawImage(src, x, y, w, h)
    expect(ctx.calls[0].slice(1)).toEqual([10, 20, 60, 30]);
  });

  it("cover 模式按等比放大裁切铺满", () => {
    created.length = 0;
    const am = new AssetManager({ bg_menu: "bg_menu.png" }, "assets/");
    am.beginLoad();
    created[0].onload();
    const ctx = makeCtx();
    // 图片 100x50,铺 50x100 → scale = max(0.5, 2) = 2 → 画 200x100,水平裁切
    am.draw(ctx, "bg_menu", 0, 0, 50, 100, "cover");
    expect(ctx.calls[0].length).toBe(5);
    const [, x, y, dw, dh] = ctx.calls[0];
    expect(dw).toBeCloseTo(200);
    expect(dh).toBeCloseTo(100);
    expect(x).toBeCloseTo(-75); // (50-200)/2
    expect(y).toBeCloseTo(0);
  });

  it("未在清单中的键 → draw 返回 false", () => {
    const am = new AssetManager({}, "assets/");
    expect(am.draw(makeCtx(), "ghost", 0, 0, 10, 10)).toBe(false);
  });
});

function makeRichCtx() {
  const rec = { drawImage: [] as unknown[][], fillRect: [] as unknown[][], fillText: [] as unknown[][] };
  const ctx = {
    rec,
    fillStyle: "",
    font: "",
    textAlign: "",
    drawImage: (...args: unknown[]) => rec.drawImage.push(args),
    fillRect: (...args: unknown[]) => rec.fillRect.push(args),
    fillText: (...args: unknown[]) => rec.fillText.push(args),
  } as unknown as CanvasRenderingContext2D & { rec: typeof rec };
  return ctx;
}

function readyAm(key: string): AssetManager {
  created.length = 0;
  const am = new AssetManager({ [key]: `${key}.png` }, "assets/");
  am.beginLoad();
  created[0].onload();
  return am;
}

describe("skin 助手(贴图优先/缺失回退)", () => {
  it("skinBar:缺图返回 false,就绪且未满时画遮罩,满条不画遮罩", () => {
    const miss = makeRichCtx();
    expect(skinBar(miss, new AssetManager({}, "assets/"), "bar_hp", 0, 0, 100, 10, 0.5)).toBe(false);
    expect(miss.rec.drawImage).toHaveLength(0);

    const am = readyAm("bar_hp");
    const half = makeRichCtx();
    expect(skinBar(half, am, "bar_hp", 10, 20, 100, 10, 0.4)).toBe(true);
    expect(half.rec.drawImage).toHaveLength(1);
    expect(half.rec.fillRect).toHaveLength(1);
    expect(half.rec.fillRect[0].slice(0, 2)).toEqual([50, 20]); // 10 + 100*0.4

    const full = makeRichCtx();
    expect(skinBar(full, am, "bar_hp", 10, 20, 100, 10, 1)).toBe(true);
    expect(full.rec.fillRect).toHaveLength(0);
  });

  it("skinHeader:缺图回退纯文字,就绪画底板+居中标题", () => {
    const miss = makeRichCtx();
    skinHeader(miss, new AssetManager({}, "assets/"), "banner_mid_red", "标题", 20, 40, "#fff");
    expect(miss.rec.drawImage).toHaveLength(0);
    expect(miss.rec.fillText).toHaveLength(1);
    expect(miss.rec.fillText[0][0]).toBe("标题");

    const ctx = makeRichCtx();
    skinHeader(ctx, readyAm("banner_mid_red"), "banner_mid_red", "标题", 20, 40, "#fff");
    expect(ctx.rec.drawImage).toHaveLength(1);
    expect(ctx.rec.fillText).toHaveLength(1);
    expect(ctx.textAlign).toBe("left"); // 收尾恢复左对齐
  });

  it("iconText:缺图用字符号回退,就绪画图标+右移文字", () => {
    const miss = makeRichCtx();
    iconText(miss, new AssetManager({}, "assets/"), "icon_gold", "✦", "123", 10, 30, "#fff");
    expect(miss.rec.fillText[0][0]).toBe("✦ 123");

    const ctx = makeRichCtx();
    iconText(ctx, readyAm("icon_gold"), "icon_gold", "✦", "123", 10, 30, "#fff");
    expect(ctx.rec.drawImage).toHaveLength(1);
    expect(ctx.rec.fillText[0][0]).toBe("123");
    expect(ctx.rec.fillText[0][1]).toBe(28); // 10 + 14 + 4
  });

  it("skinIconButton:总画回退底,就绪才叠图标", () => {
    let base = 0;
    const drawBase = () => { base++; };
    skinIconButton(makeRichCtx(), new AssetManager({}, "assets/"), "entry_gacha", 0, 0, 70, 24, "扭蛋", drawBase);
    expect(base).toBe(1);

    const ctx = makeRichCtx();
    skinIconButton(ctx, readyAm("entry_gacha"), "entry_gacha", 0, 0, 70, 24, "扭蛋", drawBase);
    expect(base).toBe(2);
    expect(ctx.rec.drawImage).toHaveLength(1);
  });
});
