/** 分析抠图后的套图:透明占比 + 连通域包围盒(用于拆图) */
import fs from "node:fs";
import zlib from "node:zlib";

function decodePNG(buf) {
  let w = 0, h = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const chans = colorType === 6 ? 4 : 3;
  const stride = w * chans;
  const rgba = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ftype = raw[y * (stride + 1)], base = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rb = raw[base + x];
      const a = x >= chans ? line[x - chans] : 0, b = prev[x], c = x >= chans ? prev[x - chans] : 0;
      let v;
      switch (ftype) {
        case 0: v = rb; break;
        case 1: v = rb + a; break;
        case 2: v = rb + b; break;
        case 3: v = rb + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error("bad filter " + ftype);
      }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const si = x * chans, di = (y * w + x) * 4;
      rgba[di] = line[si]; rgba[di + 1] = line[si + 1]; rgba[di + 2] = line[si + 2]; rgba[di + 3] = chans === 4 ? line[si + 3] : 255;
    }
    line.copy(prev);
  }
  return { w, h, rgba };
}

const img = decodePNG(fs.readFileSync("vibe_images/gen-batch-ui-set-cutout.png"));
const { w, h, rgba } = img;
let transparent = 0, opaque = 0;
const mask = new Uint8Array(w * h);
for (let p = 0; p < w * h; p++) {
  const a = rgba[p * 4 + 3];
  if (a < 128) transparent++; else { opaque++; mask[p] = 1; }
}
console.log(`size ${w}x${h}  transparent ${transparent} (${(100 * transparent / (w * h)).toFixed(1)}%)  opaque ${opaque}`);

const label = new Int32Array(w * h).fill(-1);
const boxes = [];
const stack = new Int32Array(w * h);
for (let p0 = 0; p0 < w * h; p0++) {
  if (!mask[p0] || label[p0] >= 0) continue;
  const id = boxes.length;
  let sp = 0; stack[sp++] = p0; label[p0] = id;
  let x0 = w, y0 = h, x1 = 0, y1 = 0, cnt = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w, y = (p / w) | 0;
    cnt++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = ny * w + nx;
      if (mask[np] && label[np] < 0) { label[np] = id; stack[sp++] = np; }
    }
  }
  boxes.push({ id, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, px: cnt });
}
const big = boxes.filter(b => b.px > 3000).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
console.log(`components>3000px: ${big.length}`);
for (const b of big) console.log(`  #${b.id} [${b.x0},${b.y0}]-[${b.x1},${b.y1}] ${b.w}x${b.h} px=${b.px}`);
fs.writeFileSync("vibe_images/.tmp-boxes.json", JSON.stringify(big));
