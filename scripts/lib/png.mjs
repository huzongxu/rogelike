/**
 * 零依赖 PNG 编解码(纯 Node 内置 zlib)。支持 bitDepth 8 的灰度/RGB/调色板/RGBA 输入,
 * 输出统一为 RGBA8888;编码固定写 RGBA + filter none。
 */

import zlib from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @returns {{w:number,h:number,rgba:Buffer}} rgba 为 w*h*4 字节 */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("not a PNG");
  }
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (bitDepth !== 8) throw new Error(`unsupported bitDepth=${bitDepth}`);
      if (![0, 2, 3, 4, 6].includes(colorType)) throw new Error(`unsupported colorType=${colorType}`);
    } else if (type === "PLTE") {
      plte = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const chans = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  const stride = w * chans;
  const rgba = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ftype = raw[y * (stride + 1)];
    const base = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[base + x];
      const a = x >= chans ? line[x - chans] : 0;
      const b = prev[x];
      const c = x >= chans ? prev[x - chans] : 0;
      let v;
      switch (ftype) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${ftype}`);
      }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const si = x * chans;
      const di = (y * w + x) * 4;
      let r, g, b2, al = 255;
      if (colorType === 3) {
        const idx = line[si] * 3;
        r = plte[idx]; g = plte[idx + 1]; b2 = plte[idx + 2];
        if (trns && line[si] < trns.length) al = trns[line[si]];
      } else if (colorType === 0) {
        r = g = b2 = line[si];
      } else if (colorType === 4) {
        r = g = b2 = line[si];
        al = line[si + 1];
      } else if (colorType === 2) {
        r = line[si]; g = line[si + 1]; b2 = line[si + 2];
      } else {
        r = line[si]; g = line[si + 1]; b2 = line[si + 2]; al = line[si + 3];
      }
      rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b2; rgba[di + 3] = al;
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
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** @param {Buffer} rgba w*h*4 字节 */
export function encodePNG(w, h, rgba) {
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
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function hexToRgb(hex) {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
