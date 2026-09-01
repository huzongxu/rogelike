// 把 banner_title_abyss 生成图加工成标题栏横幅:去水印 → 裁底部金线带 → 降采样 → public/assets/
import fs from "node:fs";
import zlib from "node:zlib";

const SRC = "H:/workspace/挂机游戏/vibe_images/banner_title_abyss_1787938264.png";
const OUT = "H:/workspace/挂机游戏/public/assets/banner_title_abyss.png";

function decodePNG(buf) {
  let w = 0, h = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
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
        default: throw new Error("bad filter");
      }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const si = x * chans, di = (y * w + x) * 4;
      rgba[di] = line[si]; rgba[di + 1] = line[si + 1]; rgba[di + 2] = line[si + 2];
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
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let img = decodePNG(fs.readFileSync(SRC));
const { w, h } = img;

// 1. 去水印:水印在金线(y≈1036-1041)下方的右下角,只修补底部 480×44 条带
{
  const rw = 480, rh = 44;
  const x0 = w - rw, y0 = h - rh;
  for (let y = y0; y < h; y++) {
    const srcRow = (y - rh) * w, dstRow = y * w;
    for (let x = x0; x < w; x++) {
      const si = (srcRow + x) * 4, di = (dstRow + x) * 4;
      img.rgba[di] = img.rgba[si];
      img.rgba[di + 1] = img.rgba[si + 1];
      img.rgba[di + 2] = img.rgba[si + 2];
      img.rgba[di + 3] = img.rgba[si + 3];
    }
  }
}

// 2. 裁切金线带:全宽, y 775 → 1045(紫域+雾霭+金线+两端角饰)
const by0 = 775, by1 = 1045;
const bw = w, bh = by1 - by0 + 1;
const band = Buffer.alloc(bw * bh * 4);
for (let y = 0; y < bh; y++) {
  img.rgba.copy(band, y * bw * 4, ((y + by0) * w) * 4, ((y + by0) * w + bw) * 4);
}

// 3. 区域平均降采样到 580×61(与显示比例 548×58 ≈ 9.45:1 一致)
function downscale(sw, sh, src, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * sh) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * sw) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
        }
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}
const final = downscale(bw, bh, band, 580, 61);
fs.writeFileSync(OUT, encodePNG(580, 61, final));
console.log("written:", OUT, "(580x61)");
