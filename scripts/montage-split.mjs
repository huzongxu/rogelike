/** 雪碧图拆分产物:透明占比统计 + 4x3 拼图(棋盘底)供目检 */
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
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
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

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  for (const b of td) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const cb = Buffer.alloc(4); cb.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, td, cb]);
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ids = ["00001","00002","00003","00004","00005","00006","00007","00008","00009","00010","00011","00012"];
const imgs = [];
for (const id of ids) {
  const p = `vibe_images/gen_split_${id}.png`;
  const img = decodePNG(fs.readFileSync(p));
  let tr = 0;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 128) tr++;
  console.log(`#${ids.indexOf(id) + 1} ${id}: ${img.w}x${img.h} 透明 ${(100 * tr / (img.w * img.h)).toFixed(1)}%`);
  imgs.push(img);
}

const CELL = 380, PAD = 10, COLS = 4, ROWS = 3;
const W = COLS * CELL, H = ROWS * CELL;
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, ck = ((x >> 4) + (y >> 4)) & 1;
  out[i] = ck ? 200 : 120; out[i + 1] = ck ? 200 : 120; out[i + 2] = ck ? 200 : 120; out[i + 3] = 255;
}
imgs.forEach((img, idx) => {
  const cx = (idx % COLS) * CELL, cy = ((idx / COLS) | 0) * CELL;
  const scale = Math.min((CELL - 2 * PAD) / img.w, (CELL - 2 * PAD) / img.h);
  const dw = Math.round(img.w * scale), dh = Math.round(img.h * scale);
  const ox = cx + ((CELL - dw) >> 1), oy = cy + ((CELL - dh) >> 1);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.min(img.w - 1, (x / scale) | 0), sy = Math.min(img.h - 1, (y / scale) | 0);
    const si = (sy * img.w + sx) * 4, di = ((oy + y) * W + ox + x) * 4;
    const a = img.rgba[si + 3] / 255;
    out[di] = out[di] * (1 - a) + img.rgba[si] * a;
    out[di + 1] = out[di + 1] * (1 - a) + img.rgba[si + 1] * a;
    out[di + 2] = out[di + 2] * (1 - a) + img.rgba[si + 2] * a;
  }
  // 序号标记:左上角二进制圆点(满=1 空=0),低位在左,便于核对
  const n = idx + 1;
  for (let b = 0; b < 4; b++) {
    const on = (n >> b) & 1;
    const bx = cx + 14 + b * 22, by = cy + 14;
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
      if (x * x + y * y > 49) continue;
      const di = ((by + y) * W + bx + x) * 4;
      const v = on ? 255 : 40;
      out[di] = v; out[di + 1] = on ? 200 : 40; out[di + 2] = 40;
    }
  }
});
fs.writeFileSync("vibe_images/.tmp-split-montage.png", encodePNG(W, H, out));
console.log(`拼图已写: vibe_images/.tmp-split-montage.png (${W}x${H})`);
