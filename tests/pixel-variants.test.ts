/**
 * S1 派生像素批的守卫(scripts/pixel-variants.mjs ↔ artwork/pixel-kit-s1.json ↔ cocos/assets/resources/textures)。
 *
 * 四条账:
 *  1. 规格 ↔ 贴图逐字节一致:生成器跑到临时目录与入库 png 逐键比对 —— 改了规格或算子没重跑、或手改了贴图,这条就断。
 *  2. 尺寸与源件逐键相等(export=1,战斗里按半径缩放的绘制盒是按基线件定的),alpha 非 0 即 255。
 *  3. 键登记:每个键都在 PIXEL_ART_KEYS(拿到 NEAREST 与流式加载);S1 的 30 个 monster_ 键与 seasonMonsters.ts 主题 0 的行 id 一一对应。
 *  4. 换皮可辨:每枚变体与其源件像素不同,同源件的变体两两不同(否则赛季怪在战场上仍与基线一致)。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PIXEL_ART_KEYS, S1_MONSTER_KEYS, PLAYER_HERO_KEYS, BATTLE_FIRST_PAINT_KEYS } from "../cocos/assets/scripts/game/data/pixelArt";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEX = join(ROOT, "cocos", "assets", "resources", "textures");
const SPEC = JSON.parse(readFileSync(join(ROOT, "artwork", "pixel-kit-s1.json"), "utf8")) as {
  singles: { key: string; from: string; color: string; ops: unknown[]; frozen?: boolean }[];
};

async function decode(file: string): Promise<{ w: number; h: number; rgba: Buffer }> {
  const mod = await import(new URL("../scripts/lib/png.mjs", import.meta.url).href);
  return mod.decodePNG(readFileSync(file));
}

/** 未冻结的格才由派生批负责;frozen 格已被 AI 重绘批(frozenBy)同键覆盖,只核对键登记 */
const live = SPEC.singles.filter((s) => !s.frozen);
const keys = live.map((s) => s.key);
const allKeys = SPEC.singles.map((s) => s.key);

describe("pixel-variants:规格 ↔ 入库贴图", () => {
  it("生成器重跑逐字节复现入库贴图(确定性 + 未手改)", { timeout: 60_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), "px-variants-"));
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts", "pixel-variants.mjs"), `--out=${out}`], { cwd: ROOT, stdio: "pipe" });
      for (const k of keys) {
        const a = readFileSync(join(out, `${k}.png`));
        const b = readFileSync(join(TEX, `${k}.png`));
        expect(a.equals(b), `${k} 入库贴图与规格重跑结果不一致`).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("尺寸与源件逐键相等,alpha 非 0 即 255", async () => {
    for (const s of live) {
      const im = await decode(join(TEX, `${s.key}.png`));
      const src = await decode(join(TEX, `${s.from}.png`));
      expect([im.w, im.h], s.key).toEqual([src.w, src.h]);
      for (let i = 0; i < im.w * im.h; i++) {
        const a = im.rgba[i * 4 + 3];
        if (a !== 0 && a !== 255) throw new Error(`${s.key} 像素 ${i} alpha=${a}`);
      }
    }
  });
});

describe("pixel-variants:键登记", () => {
  it("规格里的每个键都在 PIXEL_ART_KEYS 与战斗第一拍集合里", () => {
    const px = new Set(PIXEL_ART_KEYS);
    const first = new Set(BATTLE_FIRST_PAINT_KEYS);
    expect(allKeys.filter((k) => !px.has(k))).toEqual([]);
    expect(allKeys.filter((k) => !first.has(k))).toEqual([]);
  });

  it("S1_MONSTER_KEYS = seasonMonsters.ts 主题 0 的 30 行 id;PLAYER_HERO_KEYS = 规格里的 player_ 键", () => {
    const src = readFileSync(join(ROOT, "cocos", "assets", "scripts", "game", "data", "seasonMonsters.ts"), "utf8").replace(/\r\n/g, "\n");
    const ids = Array.from(src.matchAll(/\{ id: "([a-z_]+)",[^\n]*theme: 0,/g), (m) => m[1]);
    expect(ids.length).toBe(30);
    expect([...S1_MONSTER_KEYS]).toEqual(ids.map((id) => `monster_${id}`));
    expect([...S1_MONSTER_KEYS, ...PLAYER_HERO_KEYS].sort()).toEqual([...allKeys].sort());
  });
});

describe("pixel-variants:换皮可辨", () => {
  it("每枚变体与源件不同,同源件的变体两两不同", async () => {
    const bySrc = new Map<string, { key: string; buf: Buffer }[]>();
    for (const s of live) {
      const im = await decode(join(TEX, `${s.key}.png`));
      const src = await decode(join(TEX, `${s.from}.png`));
      expect(im.rgba.equals(src.rgba), `${s.key} 与源件 ${s.from} 像素一致`).toBe(false);
      const list = bySrc.get(s.from) || [];
      list.push({ key: s.key, buf: im.rgba });
      bySrc.set(s.from, list);
    }
    for (const list of bySrc.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        expect(list[i].buf.equals(list[j].buf), `${list[i].key} 与 ${list[j].key} 像素一致`).toBe(false);
      }
    }
  });
});
