/**
 * 界面 chrome 程序化像素贴图的守卫(scripts/pixel-chrome.mjs ↔ cocos/assets/resources/textures)。
 *
 * 四条账:
 *  1. 规格 ↔ 贴图逐字节一致:把生成器跑到临时目录,与已入库的 png 逐键比对。规格或生成器改了
 *     却没重跑,或有人手改了贴图,这条就断。
 *  2. 只用 33 色深渊蓝黑表:任何一枚不透明像素落在表外都算越界(半透明也不允许,像素档 alpha 硬化)。
 *  3. 九宫格件的切边与 viewTable.nineSlice.keys 同源:表里给的 inset 必须小于贴图短边的一半,
 *     且规格里的 inset 与表值一致 —— 生成器按 inset 保证可拉伸带恒色,表值错位等于把纹理拉成条纹。
 *  4. 赛季变体:带 seasonAccent 的键按主题表出 t1..t3 文件,`seasonSkinFile()` 的映射与文件一一对应,
 *     且各主题贴图两两不同(否则换季无感)。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEASON_ACCENT_KEYS, seasonSkinFile } from "../cocos/assets/scripts/game/data/pixelArt";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEX = join(ROOT, "cocos", "assets", "resources", "textures");
const SPEC = JSON.parse(readFileSync(join(ROOT, "artwork", "pixel-kit-chrome.json"), "utf8")) as {
  seasonAccents: { themes: string[][] };
  singles: { key: string; keys?: string[]; kind: string; w: number; h: number; inset?: number; seasonAccent?: boolean }[];
};
const PALETTE = new Set<string>((JSON.parse(readFileSync(join(ROOT, "artwork", "pixel-kit.json"), "utf8")).palette as string[]).map((h) => h.toLowerCase()));
/** 关卡窗景裁自战场背景批,允许用该批的 56 色表(是 33 色表的严格超集) */
const BG_PALETTE = new Set<string>((JSON.parse(readFileSync(join(ROOT, "artwork", "pixel-kit-bg.json"), "utf8")).palette as string[]).map((h) => h.toLowerCase()));
const VIEW = JSON.parse(readFileSync(join(ROOT, "cocos", "assets", "resources", "config", "viewTable.json"), "utf8")) as {
  nineSlice: { keys: Record<string, number> };
};

/** PNG 解码走仓库自带的零依赖实现(与生成器同一份) */
async function decode(file: string): Promise<{ w: number; h: number; rgba: Buffer }> {
  const mod = await import(new URL("../scripts/lib/png.mjs", import.meta.url).href);
  return mod.decodePNG(readFileSync(file));
}

const THEME_COUNT = SPEC.seasonAccents.themes.length;
/** 基名(主题 0 / 无变体) */
const baseKeys = SPEC.singles.flatMap((s) => [s.key, ...(s.keys || [])]);
/** 全部落盘文件名 = 基名 + 变体名 */
const allKeys = SPEC.singles.flatMap((s) => {
  const names = [s.key, ...(s.keys || [])];
  if (!s.seasonAccent) return names;
  return names.flatMap((n) => [n, ...Array.from({ length: THEME_COUNT - 1 }, (_, i) => `${n}_t${i + 1}`)]);
});

describe("pixel-chrome:规格 ↔ 入库贴图", () => {
  it("每个键(含赛季变体)都有入库 png,且尺寸与规格一致", async () => {
    for (const s of SPEC.singles) {
      for (const k of allKeys.filter((n) => n === s.key || n.startsWith(s.key + "_t") || (s.keys || []).some((a) => n === a || n.startsWith(a + "_t")))) {
        const im = await decode(join(TEX, `${k}.png`));
        expect([im.w, im.h], k).toEqual([s.w, s.h]);
      }
    }
  });

  it("生成器重跑逐字节复现入库贴图(确定性 + 未手改)", { timeout: 60_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), "px-chrome-"));
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts", "pixel-chrome.mjs"), `--out=${out}`], { stdio: "pipe" });
      const produced = readdirSync(out).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")).sort();
      expect(produced).toEqual([...allKeys].sort());
      for (const k of produced) {
        const a = readFileSync(join(out, `${k}.png`));
        const b = readFileSync(join(TEX, `${k}.png`));
        expect(a.equals(b), `${k}.png 与生成器输出不一致 —— 重跑 node scripts/pixel-chrome.mjs`).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("只用 33 色表(窗景件走背景批 56 色表),alpha 非 0 即 255", { timeout: 60_000 }, async () => {
    const sceneKeys = new Set(SPEC.singles.filter((s) => s.kind === "sceneCrop").map((s) => s.key));
    for (const k of allKeys) {
      const pal = sceneKeys.has(k) ? BG_PALETTE : PALETTE;
      const im = await decode(join(TEX, `${k}.png`));
      const seen = new Set<string>();
      for (let i = 0; i < im.rgba.length; i += 4) {
        const a = im.rgba[i + 3];
        if (a === 0) continue;
        expect(a, `${k} 有半透明像素`).toBe(255);
        seen.add("#" + [im.rgba[i], im.rgba[i + 1], im.rgba[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""));
      }
      const off = [...seen].filter((c) => !pal.has(c));
      expect(off, `${k} 用了表外颜色`).toEqual([]);
    }
  });
});

describe("pixel-chrome:九宫格切边与 viewTable 同源", () => {
  const sliced = SPEC.singles.filter((s) => s.inset);
  it("规格 inset = viewTable.nineSlice.keys 表值(主键与别名逐个;变体走基名,不入表)", () => {
    for (const s of sliced) {
      for (const k of [s.key, ...(s.keys || [])]) {
        expect(VIEW.nineSlice.keys[k], `${k} 不在 nineSlice.keys 里`).toBeDefined();
        expect(VIEW.nineSlice.keys[k], `${k} 切边`).toBe(s.inset);
      }
    }
    expect(Object.keys(VIEW.nineSlice.keys).filter((k) => /_t\d+$/.test(k)), "变体名不该进切边表").toEqual([]);
  });
  it("切边小于短边一半,留得下可拉伸带", () => {
    for (const s of sliced) expect(s.inset! * 2, s.key).toBeLessThan(Math.min(s.w, s.h));
  });
});

describe("pixel-chrome:赛季变体", () => {
  const accentKeys = SPEC.singles.filter((s) => s.seasonAccent).flatMap((s) => [s.key, ...(s.keys || [])]);
  it("SEASON_ACCENT_KEYS 与规格里带 seasonAccent 的键集合相等", () => {
    expect([...SEASON_ACCENT_KEYS].sort()).toEqual([...accentKeys].sort());
  });
  it("seasonSkinFile 对每个主题都指向一枚已入库文件;非变体键与主题 0 原名返回", () => {
    const files = new Set(readdirSync(TEX).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")));
    for (const k of accentKeys) {
      for (let t = 0; t < THEME_COUNT; t++) {
        const f = seasonSkinFile(k, t);
        expect(files.has(f), `${k} 主题 ${t} → ${f}.png 不存在`).toBe(true);
        if (t === 0) expect(f).toBe(k);
      }
    }
    expect(seasonSkinFile("btn_back", 2)).toBe("btn_back");
    expect(baseKeys.indexOf("btn_back") >= 0).toBe(true);
  });
  it("同一键的四个主题贴图两两不同", () => {
    for (const k of accentKeys) {
      const bufs = Array.from({ length: THEME_COUNT }, (_, t) => readFileSync(join(TEX, `${seasonSkinFile(k, t)}.png`)));
      for (let i = 0; i < bufs.length; i++) for (let j = i + 1; j < bufs.length; j++) {
        expect(bufs[i].equals(bufs[j]), `${k} 主题 ${i} 与 ${j} 贴图相同`).toBe(false);
      }
    }
  });
});
