/**
 * pixel-kit 的 atlas 模式:一张网格雪碧图(同一角色的多帧)→ 一张 `<atlas>.png` 图集,
 * 格按 grid 原位拼、全部同 art 盒、不裁内容框(各帧脚位不跳)。图集尺寸必须能被 spriteAnim 的 7×5 整除。
 * 用合成源图跑真生成器核对:尺寸、各格落位、透明底硬化。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIM_COLS, ANIM_ROWS, animCellSize } from "../cocos/assets/scripts/game/ui/spriteAnim";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function png() {
  return import(new URL("../scripts/lib/png.mjs", import.meta.url).href) as Promise<{
    encodePNG: (w: number, h: number, rgba: Buffer) => Buffer;
    decodePNG: (b: Buffer) => { w: number; h: number; rgba: Buffer };
  }>;
}

/** 合成 7×5 品红底网格:每格中央一块色块,颜色按 (row, col) 编码,便于核对落位 */
function synthGrid(cell = 120): { w: number; h: number; rgba: Buffer } {
  const w = cell * ANIM_COLS, h = cell * ANIM_ROWS;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const col = Math.floor(x / cell), row = Math.floor(y / cell);
    const lx = x - col * cell, ly = y - row * cell;
    const inside = lx >= 30 && lx < 90 && ly >= 20 && ly < 100;
    if (inside) { rgba[i] = 20 + row * 40; rgba[i + 1] = 20 + col * 30; rgba[i + 2] = 200; }
    else { rgba[i] = 255; rgba[i + 1] = 0; rgba[i + 2] = 255; }
    rgba[i + 3] = 255;
  }
  return { w, h, rgba };
}

describe("pixel-kit:atlas 模式", () => {
  it("网格雪碧图合成 7×5 图集,格尺寸 = cellArt,各格色块落在各自格内", { timeout: 60_000 }, async () => {
    const { encodePNG, decodePNG } = await png();
    const dir = mkdtempSync(join(tmpdir(), "px-atlas-"));
    try {
      const src = synthGrid();
      writeFileSync(join(dir, "sheet_1.png"), encodePNG(src.w, src.h, src.rgba));
      const palette: string[] = ["#05070c"];
      for (let r = 0; r < ANIM_ROWS; r++) for (let c = 0; c < ANIM_COLS; c++) {
        palette.push(`#${(20 + r * 40).toString(16).padStart(2, "0")}${(20 + c * 30).toString(16).padStart(2, "0")}c8`);
      }
      const cfg = {
        module: 2, export: 1, palette, keyout: { color: "#ff00ff", tolerance: 60, erode: 1 },
        sheets: [{ src: join(dir, "sheet_1.png"), grid: { cols: ANIM_COLS, rows: ANIM_ROWS }, atlas: "anim_t", cellArt: [40, 40] }],
      };
      writeFileSync(join(dir, "cfg.json"), JSON.stringify(cfg));
      const out = join(dir, "out");
      execFileSync(process.execPath, [join(ROOT, "scripts", "pixel-kit.mjs"), `--config=${join(dir, "cfg.json")}`, `--out=${out}`], { cwd: ROOT, stdio: "pipe" });
      const atlas = decodePNG(readFileSync(join(out, "anim_t.png")));
      expect([atlas.w, atlas.h]).toEqual([40 * ANIM_COLS, 40 * ANIM_ROWS]);
      expect(animCellSize(atlas.w, atlas.h)).toEqual({ w: 40, h: 40 });
      for (let r = 0; r < ANIM_ROWS; r++) for (let c = 0; c < ANIM_COLS; c++) {
        // 格中心像素 = 该格的编码色(源格 120 内色块占 30..90 × 20..100,contain 到 40 后中心仍在色块内)
        const x = c * 40 + 20, y = r * 40 + 20;
        const i = (y * atlas.w + x) * 4;
        expect([atlas.rgba[i], atlas.rgba[i + 1], atlas.rgba[i + 2], atlas.rgba[i + 3]], `格 ${r},${c}`).toEqual([20 + r * 40, 20 + c * 30, 200, 255]);
        // 格角落是透明(品红被键出)
        const j = ((r * 40) * atlas.w + c * 40) * 4;
        expect(atlas.rgba[j + 3], `格 ${r},${c} 角`).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
