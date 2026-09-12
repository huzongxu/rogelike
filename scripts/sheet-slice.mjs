/**
 * 白底素材表切件:把 AI 生成的 UI 素材表(白底、件与件之间留白)按连通域切成独立件,
 * 输出每件的外接框 JSON + 带编号的接触表,供人工命名后写进 pixel-kit 规格。
 *
 *   node scripts/sheet-slice.mjs <sheet.png> <outDir> [--white=235] [--min=120] [--gap=6]
 *
 *   --white  白底判据:RGB 三道都 ≥ 该值即视为背景
 *   --min    连通域最小像素数(过滤噪点与孤立文字)
 *   --gap    合并间距:两件外接框相距 ≤ gap 且纵向重叠 ≥ 50% 时并成一件(图标 + 文案同行)
 *
 * 纯 Node,只依赖 scripts/lib/png.mjs。
 */
import fs from "node:fs";
import path from "node:path";
import { decodePNG, encodePNG } from "./lib/png.mjs";

const [, , SRC, OUT_DIR, ...rest] = process.argv;
if (!SRC || !OUT_DIR) { console.error("用法: node scripts/sheet-slice.mjs <sheet.png> <outDir> [--white=235] [--min=120] [--gap=6]"); process.exit(1); }
const arg = (n, d) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? Number(h.slice(n.length + 3)) : d; };
const WHITE = arg("white", 235), MIN = arg("min", 120), GAP = arg("gap", 6);

const im = decodePNG(fs.readFileSync(SRC));
const { w, h, rgba } = im;
const isBg = (i) => rgba[i * 4] >= WHITE && rgba[i * 4 + 1] >= WHITE && rgba[i * 4 + 2] >= WHITE;

/* 连通域(4 邻接)标号 */
const label = new Int32Array(w * h).fill(-1);
const boxes = [];
const stack = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  if (label[i] >= 0 || isBg(i)) continue;
  const id = boxes.length;
  let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
  label[i] = id; stack.push(i);
  while (stack.length) {
    const p = stack.pop(); n++;
    const px = p % w, py = (p / w) | 0;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    const nb = [p - 1, p + 1, p - w, p + w];
    if (px === 0) nb[0] = -1; if (px === w - 1) nb[1] = -1;
    for (const q of nb) if (q >= 0 && q < w * h && label[q] < 0 && !isBg(q)) { label[q] = id; stack.push(q); }
  }
  boxes.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, n });
}

/* 过滤噪点,再按间距合并(同一行里图标与文案、被浅色缝切开的框) */
let parts = boxes.filter((b) => b.n >= MIN);
const overlapY = (a, b) => Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const near = (a, b) => {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  const ov = overlapY(a, b) / Math.min(a.y1 - a.y0, b.y1 - b.y0);
  return (dx <= GAP && dy === 0 && ov >= 0.5) || (dx === 0 && dy <= GAP && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0));
};
let merged = true;
while (merged) {
  merged = false;
  outer: for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (near(parts[i], parts[j])) {
      const a = parts[i], b = parts[j];
      parts[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
      parts.splice(j, 1); merged = true; break outer;
    }
  }
}
/* 阅读序:按行(y 中心分桶 40px)再按 x */
parts.sort((a, b) => (Math.round((a.y0 + a.y1) / 80) - Math.round((b.y0 + b.y1) / 80)) || (a.x0 - b.x0));
parts.forEach((p, i) => { p.id = i; p.w = p.x1 - p.x0; p.h = p.y1 - p.y0; });

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "parts.json"), JSON.stringify(parts.map(({ id, x0, y0, x1, y1, w, h, n }) => ({ id, rect: [x0, y0, x1, y1], w, h, px: n })), null, 1));

/* 接触表:原图缩 0.5,在每件左上角画编号(像素数字 pxnum_*,3 倍) */
const TEX = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../cocos/assets/resources/textures");
const digits = {};
for (let d = 0; d <= 9; d++) { try { digits[d] = decodePNG(fs.readFileSync(path.join(TEX, `pxnum_${d}.png`))); } catch {} }
const S = 2, W = w / S | 0, H = h / S | 0;
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = ((y * S) * w + x * S) * 4, o = (y * W + x) * 4;
  out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2]; out[o + 3] = 255;
}
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; };
for (const p of parts) {
  const bx0 = p.x0 / S | 0, by0 = p.y0 / S | 0, bx1 = p.x1 / S | 0, by1 = p.y1 / S | 0;
  for (let x = bx0; x < bx1; x++) { put(x, by0, [255, 0, 128]); put(x, by1 - 1, [255, 0, 128]); }
  for (let y = by0; y < by1; y++) { put(bx0, y, [255, 0, 128]); put(bx1 - 1, y, [255, 0, 128]); }
  const str = String(p.id);
  const K = 2, gw = 8 * K, gh = 10 * K;
  for (let x = -2; x < str.length * (gw + 2) + 2; x++) for (let y = -2; y < gh + 2; y++) put(bx0 + 2 + x, by0 + 2 + y, [255, 0, 128]);
  [...str].forEach((ch, k) => {
    const g = digits[ch]; if (!g) return;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const gi = (((y / K) | 0) * g.w + ((x / K) | 0)) * 4;
      if (g.rgba[gi + 3] > 0) put(bx0 + 2 + k * (gw + 2) + x, by0 + 2 + y, [255, 255, 255]);
    }
  });
}
fs.writeFileSync(path.join(OUT_DIR, "contact.png"), encodePNG(W, H, out));
console.log(`${path.basename(SRC)}: ${parts.length} 件 → ${OUT_DIR}/parts.json, contact.png`);
console.table(parts.map((p) => ({ id: p.id, x: p.x0, y: p.y0, w: p.w, h: p.h })));
