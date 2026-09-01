// 底板加工:生成图 → 修水印/包围盒/横带裁切/降采样/(半透明)→ public/assets/
// 菜单两板:横带裁切后整幅拉伸使用;战斗双坞板:条带比例==显示比例(8.75 / 11.667),绘制端直接拉伸。
// 旧 HUD 左右板 + 装备卡板已随双坞重排退役(见 docs/CONTEXT.md 条目 36)。
import fs from "node:fs";
import zlib from "node:zlib";

const VIBE = "H:/workspace/挂机游戏/vibe_images";
const OUT = "H:/workspace/挂机游戏/public/assets";

/* ---------- PNG 编解码 ---------- */
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- 操作 ---------- */
// 探测右下角白色半透明文字簇(水印):低饱和 + 亮度阈值,按行/列投影求包围盒
function detectWatermark(img, lumThr = 105, satSpan = 55, rowThr = 8) {
  const { w, h, rgba } = img;
  const x0 = Math.floor(w * 0.35), y0 = Math.floor(h * 0.4);
  const rowHits = new Int32Array(h);
  for (let y = y0; y < h; y++) {
    for (let x = x0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const lum = (r + g + b) / 3, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (lum > lumThr && mx - mn < satSpan) rowHits[y]++;
    }
  }
  const ys = [];
  for (let y = y0; y < h; y++) if (rowHits[y] > rowThr) ys.push(y);
  if (!ys.length) return null;
  // 按 12px 间隙分行,取最长的连续段集合(水印通常 1~2 行)
  const lines = [];
  let s = ys[0], p = ys[0];
  for (const y of ys.slice(1)) {
    if (y - p > 12) { lines.push([s, p]); s = y; }
    p = y;
  }
  lines.push([s, p]);
  const ly0 = lines[0][0], ly1 = lines[lines.length - 1][1];
  let minX = w, maxX = 0;
  for (let y = ly0; y <= ly1; y++) {
    if (rowHits[y] <= rowThr) continue;
    for (let x = x0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const lum = (r + g + b) / 3, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (lum > lumThr && mx - mn < satSpan) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
  }
  if (maxX < minX) return null;
  return { x0: minX, y0: ly0, x1: maxX, y1: ly1 };
}
// 用包围盒正下方(间隔 2 行)的像素向上覆盖水印区;若下方空间不足则用上方
function patchDetectedWatermark(img, bb, pad = 4) {
  if (!bb) return false;
  const { w, h, rgba } = img;
  const x0 = Math.max(0, bb.x0 - pad), x1 = Math.min(w - 1, bb.x1 + pad);
  const y0 = Math.max(0, bb.y0 - pad), y1 = Math.min(h - 1, bb.y1 + pad);
  const bh = y1 - y0 + 1;
  let srcTop = y1 + 3;
  if (srcTop + bh > h) {
    srcTop = y0 - 3 - bh;
    if (srcTop < 0) return false;
  }
  for (let y = y0; y <= y1; y++) {
    const sy = srcTop + (y - y0);
    for (let x = x0; x <= x1; x++) {
      const si = (sy * w + x) * 4, di = (y * w + x) * 4;
      rgba[di] = rgba[si]; rgba[di + 1] = rgba[si + 1]; rgba[di + 2] = rgba[si + 2]; rgba[di + 3] = rgba[si + 3];
    }
  }
  return true;
}
function cropRect(img, x0, y0, x1, y1) {
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.rgba.copy(out, y * cw * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x1 + 1) * 4);
  }
  return { w: cw, h: ch, rgba: out };
}
function downscale(img, nw, nh) {
  const { w, h, rgba } = img;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * h) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * w) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
      let r = 0, gg = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * w + sx) * 4;
        r += rgba[i]; gg += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; n++;
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = gg / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { w: nw, h: nh, rgba: out };
}
function applyAlpha(img, alpha) {
  for (let p = 3; p < img.rgba.length; p += 4) img.rgba[p] = alpha;
}
const isGold = (r, g, b) => r > 120 && g > 70 && b < g && r > b * 1.4;
const isPurpleGlow = (r, g, b) => b > 110 && b > r * 1.2 && g < b * 0.85;
const isBrightish = (r, g, b) => (r + g + b) / 3 > 70;
function maskBBox(img, pred, rowFrac = 0.01, colFrac = 0.01) {
  const { w, h, rgba } = img;
  const rows = new Int32Array(h), cols = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (pred(rgba[i], rgba[i + 1], rgba[i + 2])) { rows[y]++; cols[x]++; }
    }
  }
  const rThr = w * rowFrac, cThr = h * colFrac;
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < h; y++) if (rows[y] > rThr) { if (y0 < 0) y0 = y; y1 = y; }
  for (let x = 0; x < w; x++) if (cols[x] > cThr) { if (x0 < 0) x0 = x; x1 = x; }
  return { x0, y0, x1, y1 };
}
function newest(prefix) {
  const c = fs.readdirSync(VIBE).filter((f) => f.startsWith(prefix + "_") && f.endsWith(".png")).sort();
  if (!c.length) throw new Error(`缺生成图 ${prefix}`);
  return `${VIBE}/${c[c.length - 1]}`;
}
function finish(name, img) {
  fs.writeFileSync(`${OUT}/${name}.png`, encodePNG(img.w, img.h, img.rgba));
  const i = (Math.floor(img.h / 2) * img.w + Math.floor(img.w / 2)) * 4;
  console.log(`${name}.png  ${img.w}x${img.h}  中心色 [${img.rgba[i]},${img.rgba[i + 1]},${img.rgba[i + 2]}]`);
}

/* ---------- 1. 菜单标题板:水印恒在右下(探测扫描底界 x=896)→ 取左侧安全区并水平镜像补右半 → 底缘横带 → 580×61 ---------- */
{
  const img = decodePNG(fs.readFileSync(newest("menu_title_plate")));
  let bb = maskBBox(img, isGold, 0.005, 0.002);
  if (bb.y0 < 0 || bb.x0 < 0) bb = { x0: 0, y0: 0, x1: img.w - 1, y1: img.h - 1 };
  console.log("menu_title_plate bbox:", JSON.stringify(bb));
  const safeX1 = 650;
  let hits = 0;
  for (let y = bb.y0; y <= bb.y1; y++) {
    for (let x = 0; x <= safeX1; x++) {
      const i = (y * img.w + x) * 4;
      const r = img.rgba[i], g2 = img.rgba[i + 1], b = img.rgba[i + 2];
      if ((r + g2 + b) / 3 > 150 && Math.max(r, g2, b) - Math.min(r, g2, b) < 40) hits++;
    }
  }
  console.log("menu_title_plate 左区疑似文字亮像素:", hits);
  const cw = safeX1 + 1;
  const bandH = Math.round((cw * 2) / 9.45);
  const by0 = Math.max(bb.y0, bb.y1 - bandH + 1);
  const left = cropRect(img, 0, by0, safeX1, bb.y1);
  const mw = cw * 2;
  const mir = Buffer.alloc(mw * left.h * 4);
  for (let y = 0; y < left.h; y++) {
    left.rgba.copy(mir, y * mw * 4, y * cw * 4, (y + 1) * cw * 4);
    for (let x = 0; x < cw; x++) {
      const si = (y * cw + (cw - 1 - x)) * 4, di = (y * mw + cw + x) * 4;
      mir[di] = left.rgba[si]; mir[di + 1] = left.rgba[si + 1]; mir[di + 2] = left.rgba[si + 2]; mir[di + 3] = left.rgba[si + 3];
    }
  }
  finish("menu_title_plate", downscale({ w: mw, h: left.h, rgba: mir }, 580, 61));
}

/* ---------- 2. 菜单条带板:中心横带天然远离底缘水印,无需补丁 → 548×26 ---------- */
{
  const img = decodePNG(fs.readFileSync(newest("menu_strip_plate")));
  let bb = maskBBox(img, isGold, 0.005, 0.002);
  if (bb.y0 < 0 || bb.x0 < 0) bb = maskBBox(img, isBrightish, 0.01, 0.01);
  console.log("menu_strip_plate bbox:", JSON.stringify(bb));
  const bandH = Math.round((bb.x1 - bb.x0 + 1) / 21);
  const cy = Math.round((bb.y0 + bb.y1) / 2);
  const by0 = Math.max(bb.y0, cy - Math.floor(bandH / 2)), by1 = Math.min(bb.y1, by0 + bandH - 1);
  const c = cropRect(img, bb.x0, by0, bb.x1, by1);
  finish("menu_strip_plate", downscale(c, 548, 26));
}

/* ---------- 3/4. 战斗坞板:水印修补 → 紫光包围盒 → 中心条带裁切(比例==显示比例)→ @2x 输出 ----------
 * 显示宽 560(贴边全宽;实体活动区收窄到两坞之间,见 battleBandY) */
for (const [prefix, ratio, tw, th] of [["hud_dock_top", 560 / 64, 1120, 128], ["hud_dock_bottom", 560 / 48, 1120, 96]]) {
  const img = decodePNG(fs.readFileSync(newest(prefix)));
  const wm = detectWatermark(img);
  console.log(`${prefix} 水印:`, JSON.stringify(wm), "patched:", patchDetectedWatermark(img, wm));
  let bb = maskBBox(img, isPurpleGlow, 0.008, 0.008);
  if (bb.y0 < 0 || bb.x0 < 0) bb = maskBBox(img, isBrightish, 0.02, 0.02);
  console.log(`${prefix} bbox:`, JSON.stringify(bb));
  const bw = bb.x1 - bb.x0 + 1;
  const bandH = Math.round(bw / ratio);
  const cy = Math.round((bb.y0 + bb.y1) / 2);
  const by0 = Math.max(bb.y0, cy - Math.floor(bandH / 2));
  const by1 = Math.min(bb.y1, by0 + bandH - 1);
  const c = cropRect(img, bb.x0, by0, bb.x1, by1);
  const d = downscale(c, tw, th);
  applyAlpha(d, 235);
  finish(prefix, d);
}
console.log("完成:4 张底板写入", OUT);
