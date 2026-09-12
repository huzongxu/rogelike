/**
 * 序列帧素材的分件探针:把一张浅底(白 / 品红)网格图里的每个角色实例找出来,输出等尺寸、按脚底对齐的框,
 * 供 artwork/pixel-kit-*.json 的图集 cells 直接引用(rect)。
 *
 *   node scripts/anim-cells.mjs <sheet.png> [--bg=white|magenta] [--min=400] [--gap=24] [--box=auto|<px>]
 *
 * 判据:与底色距离 > 60 的像素为内容;按行 / 列投影切成格(空隙 ≥ gap 像素),每格取内容包围盒;
 * 输出框 = 以最大包围盒尺寸(或 --box)为边、底边对齐脚底、水平居中,保证各帧同比例、脚位不跳。
 * 纯 Node,只依赖 scripts/lib/png.mjs。
 */
import fs from "node:fs";
import { decodePNG } from "./lib/png.mjs";

const [, , SRC, ...rest] = process.argv;
if (!SRC) { console.error("用法: node scripts/anim-cells.mjs <sheet.png> [--bg=white|magenta] [--min=400] [--gap=24] [--box=auto|<px>]"); process.exit(1); }
const arg = (n, d) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BG = arg("bg", "white") === "magenta" ? [255, 0, 255] : [255, 255, 255];
const MIN = Number(arg("min", 400)), GAP = Number(arg("gap", 24)), BOX = arg("box", "auto");

const im = decodePNG(fs.readFileSync(SRC));
const { w, h, rgba } = im;
const isFg = (x, y) => {
  const i = (y * w + x) * 4;
  if (rgba[i + 3] < 128) return false;
  const d = Math.abs(rgba[i] - BG[0]) + Math.abs(rgba[i + 1] - BG[1]) + Math.abs(rgba[i + 2] - BG[2]);
  return d > 60;
};
/** 一维投影切段:连续非空段,段间空隙 < gap 时合并 */
function segments(len, filled) {
  const raw = [];
  let s = -1;
  for (let i = 0; i <= len; i++) {
    const on = i < len && filled(i);
    if (on && s < 0) s = i;
    if (!on && s >= 0) { raw.push([s, i - 1]); s = -1; }
  }
  const out = [];
  for (const r of raw) {
    if (out.length && r[0] - out[out.length - 1][1] < GAP) out[out.length - 1][1] = r[1];
    else out.push([...r]);
  }
  return out;
}
const rowsFilled = new Array(h).fill(false), colsFilledAll = new Array(w).fill(false);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isFg(x, y)) { rowsFilled[y] = true; colsFilledAll[x] = true; }
const bands = segments(h, (y) => rowsFilled[y]);
const cells = [];
for (const [y0, y1] of bands) {
  const colFilled = new Array(w).fill(false);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) if (!colFilled[x] && isFg(x, y)) colFilled[x] = true;
  for (const [x0, x1] of segments(w, (x) => colFilled[x])) {
    // 格内精确包围盒
    let bx0 = x1, by0 = y1, bx1 = x0, by1 = y0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isFg(x, y)) { n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (n < MIN) continue;
    cells.push({ band: bands.indexOf([y0, y1]) , x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1, n });
  }
}
const maxW = Math.max(...cells.map((c) => c.x1 - c.x0)), maxH = Math.max(...cells.map((c) => c.y1 - c.y0));
const box = BOX === "auto" ? Math.ceil(Math.max(maxW, maxH) * 1.06) : Number(BOX);
const rects = cells.map((c) => {
  const cx = Math.round((c.x0 + c.x1) / 2);
  const x0 = Math.max(0, Math.min(w - box, cx - Math.floor(box / 2)));
  const y1 = Math.min(h, c.y1 + Math.round(box * 0.03)); // 脚底之下留 3% 空
  const y0 = Math.max(0, y1 - box);
  return [x0, y0, x0 + box, y1];
});
console.log(JSON.stringify({ size: [w, h], count: cells.length, box, maxW, maxH, bboxes: cells.map((c) => [c.x0, c.y0, c.x1, c.y1]), rects }, null, 0));
