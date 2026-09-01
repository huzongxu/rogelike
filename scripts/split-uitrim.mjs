/**
 * Holopix「生成整套界面控件」产物拆件脚本。
 *
 * 输入 vibe_images/uitrim_*.png(2048x1158 白底控件合集,由 scripts 之外的浏览器流程下载):
 *   1. 四边洪水填充去白底(与 import-artwork.mjs 同算法)
 *   2. 8 邻接连通域标记,按面积过滤碎片,行分组排序
 *   3. 逐件裁切导出 vibe_images/uitrim_parts/<批>_<序>.png + parts.json
 *
 * 纯 Node(内置 zlib),无第三方依赖:
 *   node scripts/split-uitrim.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "vibe_images");
const OUT = path.join(SRC, "uitrim_parts");

/* ---------------- PNG 编解码(同 import-artwork.mjs) ---------------- */

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a)
    throw new Error("not a PNG");
  let w = 0, h = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || (colorType !== 2 && colorType !== 6))
        throw new Error(`unsupported PNG: depth=${data[8]} color=${colorType}`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const chans = colorType === 6 ? 4 : 3;
  const stride = w * chans;
  const rgba = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ftype = raw[y * (stride + 1)];
    const base = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rb = raw[base + x];
      const a = x >= chans ? line[x - chans] : 0;
      const b = prev[x];
      const c = x >= chans ? prev[x - chans] : 0;
      let v;
      switch (ftype) {
        case 0: v = rb; break;
        case 1: v = rb + a; break;
        case 2: v = rb + b; break;
        case 3: v = rb + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${ftype}`);
      }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const si = x * chans, di = (y * w + x) * 4;
      rgba[di] = line[si];
      rgba[di + 1] = line[si + 1];
      rgba[di + 2] = line[si + 2];
      rgba[di + 3] = chans === 4 ? line[si + 3] : 255;
    }
    line.copy(prev);
  }
  return { w, h, rgba };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 图像处理 ---------------- */

/** 四边洪水填充去白底(角取样+容差),含边缘羽化 */
function cutoutBackground(img, tolerance = 30) {
  const { w, h, rgba } = img;
  const corner = (x, y) => {
    const i = (y * w + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  };
  const corners = [corner(2, 2), corner(w - 3, 2), corner(2, h - 3), corner(w - 3, h - 3)];
  corners.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  const ref = corners[0];
  const isBg = (i) =>
    Math.abs(rgba[i] - ref[0]) <= tolerance &&
    Math.abs(rgba[i + 1] - ref[1]) <= tolerance &&
    Math.abs(rgba[i + 2] - ref[2]) <= tolerance;
  const dead = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!dead[p] && isBg(p * 4)) { dead[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) if (dead[p]) rgba[p * 4 + 3] = 0;
  // 边缘羽化:邻接透明区的高亮像素降 alpha,弱化白边
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (dead[p]) continue;
      const i = p * 4;
      const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      if (lum < 200) continue;
      let n = 0;
      if (dead[p - 1]) n++;
      if (dead[p + 1]) n++;
      if (dead[p - w]) n++;
      if (dead[p + w]) n++;
      if (n >= 2) rgba[i + 3] = 120;
    }
  }
}

/** 8 邻接连通域,返回 {minX,minY,maxX,maxY,area}[] */
function components(img, minArea) {
  const { w, h, rgba } = img;
  const seen = new Uint8Array(w * h);
  const comps = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 16) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (!seen[np] && rgba[np * 4 + 3] >= 16) {
            seen[np] = 1;
            stack.push(np);
          }
        }
      }
    }
    if (area >= minArea) comps.push({ minX, minY, maxX, maxY, area });
  }
  return comps;
}

/** 行分组(垂直重叠>30% 归同行)+行内按 x 排序 */
function orderComponents(comps) {
  const rows = [];
  for (const c of [...comps].sort((a, b) => a.minY - b.minY)) {
    const cy = (c.minY + c.maxY) / 2;
    const row = rows.find((r) => {
      const rc = (r.minY + r.maxY) / 2;
      const overlap = Math.min(r.maxY, c.maxY) - Math.max(r.minY, c.minY);
      const minH = Math.min(r.maxY - r.minY, c.maxY - c.minY);
      return overlap > minH * 0.3 && Math.abs(rc - cy) < minH;
    });
    if (row) {
      row.items.push(c);
      row.minY = Math.min(row.minY, c.minY);
      row.maxY = Math.max(row.maxY, c.maxY);
    } else {
      rows.push({ minY: c.minY, maxY: c.maxY, items: [c] });
    }
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.minX - b.minX));
}

function cropBox(img, [x0, y0, x1, y1]) {
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.rgba.copy(out, y * cw * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x1 + 1) * 4);
  }
  return { w: cw, h: ch, rgba: out };
}

/* ---------------- 执行 ---------------- */

fs.mkdirSync(OUT, { recursive: true });
const batches = (process.argv.slice(2).length ? process.argv.slice(2) : ["hud", "btn", "icon"])
  .map((b) => `uitrim_${b}_01.png`);
const manifest = {};
for (const name of batches) {
  const file = path.join(SRC, name);
  if (!fs.existsSync(file)) { console.warn(`[warn] 缺 ${name}`); continue; }
  const img = decodePNG(fs.readFileSync(file));
  cutoutBackground(img, 30);
  const comps = orderComponents(components(img, 1200));
  const tag = name.match(/uitrim_(\w+)_/)[1];
  manifest[tag] = [];
  comps.forEach((c, i) => {
    const pad = 2;
    const box = [
      Math.max(0, c.minX - pad), Math.max(0, c.minY - pad),
      Math.min(img.w - 1, c.maxX + pad), Math.min(img.h - 1, c.maxY + pad),
    ];
    const part = cropBox(img, box);
    const outName = `uitrim_${tag}_${String(i + 1).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(OUT, outName), encodePNG(part.w, part.h, part.rgba));
    manifest[tag].push({ file: outName, w: part.w, h: part.h, area: c.area });
  });
  console.log(`${tag}: ${comps.length} 件 → ${OUT}`);
}
fs.writeFileSync(path.join(OUT, "parts.json"), JSON.stringify(manifest, null, 1));
console.log("完成,清单写回 parts.json");
