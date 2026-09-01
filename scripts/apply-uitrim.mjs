/**
 * Holopix 控件包零件 → 资产清单接入脚本。
 *
 * 依赖 scripts/split-uitrim.mjs 的拆件产物(vibe_images/uitrim_parts/):
 *   1. 运行前把 public/assets 原图备份到 artwork/assets_backup_pre_uitrim/(仅首次)
 *   2. 按映射表裁切到槽位宽高比 → 品质框/头像环内部镂空 / 进度条内部填色 → 降采样
 *   3. 覆盖写入 public/assets/<key>.png
 *
 * 纯 Node(内置 zlib): node scripts/apply-uitrim.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const PARTS = path.join(ROOT, "vibe_images", "uitrim_parts");
const OUT = path.join(ROOT, "public", "assets");
const BACKUP = path.join(ROOT, "artwork", "assets_backup_pre_uitrim");

/* ---------------- PNG 编解码 ---------------- */

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
      if (data[8] !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error("unsupported PNG");
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
    const f = raw[y * (stride + 1)];
    const base = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rb = raw[base + x];
      const a = x >= chans ? line[x - chans] : 0;
      const b = prev[x];
      const c = x >= chans ? prev[x - chans] : 0;
      let v;
      switch (f) {
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
      line[x] = v & 255;
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
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4);
  ih[8] = 8; ih[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ih),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 图像操作 ---------------- */

function cropToAspect(img, aspect) {
  const cur = img.w / img.h;
  if (Math.abs(cur - aspect) < 0.02) return img;
  let [x0, y0, x1, y1] = [0, 0, img.w - 1, img.h - 1];
  if (cur > aspect) {
    const nw = Math.round(img.h * aspect);
    x0 = (img.w - nw) >> 1; x1 = x0 + nw - 1;
  } else {
    const nh = Math.round(img.w / aspect);
    y0 = (img.h - nh) >> 1; y1 = y0 + nh - 1;
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.rgba.copy(out, y * cw * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x1 + 1) * 4);
  }
  return { w: cw, h: ch, rgba: out };
}

/** 从种子点泛洪近白封闭区(框/环内部),tolerance 内视为内部 */
function interiorMask(img, tol = 46) {
  const { w, h, rgba } = img;
  const seed = (h >> 1) * w + (w >> 1);
  const si = seed * 4;
  const ref = [rgba[si], rgba[si + 1], rgba[si + 2]];
  if (rgba[si + 3] < 200) return null; // 中心已透明,无需处理
  const near = (i) =>
    rgba[i + 3] > 200 &&
    Math.abs(rgba[i] - ref[0]) <= tol &&
    Math.abs(rgba[i + 1] - ref[1]) <= tol &&
    Math.abs(rgba[i + 2] - ref[2]) <= tol;
  const mask = new Uint8Array(w * h);
  const stack = [seed];
  mask[seed] = 1;
  let count = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    const push = (np) => { if (!mask[np] && near(np * 4)) { mask[np] = 1; stack.push(np); count++; } };
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  return count > w * h * 0.02 ? mask : null; // 至少占 2% 才算内部
}

/** 内部镂空 + 边缘半透明羽化 */
function punchInterior(img) {
  const mask = interiorMask(img);
  if (!mask) return false;
  const { w, h, rgba } = img;
  for (let p = 0; p < w * h; p++) if (mask[p]) rgba[p * 4 + 3] = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (mask[p]) continue;
      let n = 0;
      if (mask[p - 1]) n++;
      if (mask[p + 1]) n++;
      if (mask[p - w]) n++;
      if (mask[p + w]) n++;
      if (n >= 2) rgba[p * 4 + 3] = Math.min(rgba[p * 4 + 3], 140);
    }
  }
  return true;
}

/** 内部填充竖向渐变(进度条"满条态",配 skinBar 遮罩法) */
function fillInterior(img, hex) {
  const mask = interiorMask(img);
  if (!mask) return false;
  const { w, h, rgba } = img;
  const r0 = parseInt(hex.slice(1, 3), 16), g0 = parseInt(hex.slice(3, 5), 16), b0 = parseInt(hex.slice(5, 7), 16);
  let minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (y < minY) minY = y; if (y > maxY) maxY = y; break; }
  }
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue;
    const y = (p / w) | 0;
    const t = (y - minY) / Math.max(1, maxY - minY); // 0 顶 → 1 底
    const lum = t < 0.45 ? 1 + (0.45 - t) : 1 - (t - 0.45) * 0.55;
    rgba[p * 4] = Math.min(255, r0 * lum);
    rgba[p * 4 + 1] = Math.min(255, g0 * lum);
    rgba[p * 4 + 2] = Math.min(255, b0 * lum);
    rgba[p * 4 + 3] = 255;
  }
  return true;
}

/** 挖掉中央徽记:裁掉 [x0f,x1f] 区间,左右两半拼接,接缝做 32px 线性融合 */
function spliceCenter(img, [x0f, x1f]) {
  const { w, h, rgba } = img;
  const x0 = Math.round(w * x0f), x1 = Math.round(w * x1f);
  const gap = x1 - x0;
  const nw = w - gap;
  const out = Buffer.alloc(nw * h * 4);
  const BLEND = 32; // 接缝两侧融合宽度
  for (let y = 0; y < h; y++) {
    // 左半 [0, x0) → [0, x0)
    rgba.copy(out, (y * nw) * 4, (y * w) * 4, (y * w + x0) * 4);
    // 右半 [x1, w) → [x0, nw)
    rgba.copy(out, (y * nw + x0) * 4, (y * w + x1) * 4, ((y + 1) * w) * 4);
    // 接缝融合:seam 在 x0,左侧取 x0-BLEND..x0 与右侧对应列按权重混合
    for (let b = 0; b < BLEND; b++) {
      const dx = x0 - BLEND + b; // 左半列
      const sx = x1 - BLEND + b; // 右半对应列
      if (dx < 0 || sx >= w) continue;
      const t = b / BLEND; // 0→左图, 1→右图
      for (let yy = 0; yy < 1; yy++) {} // noop
      const di = (y * nw + dx) * 4;
      const si = (y * w + sx) * 4;
      for (let ch = 0; ch < 4; ch++) {
        out[di + ch] = Math.round(out[di + ch] * (1 - t) + rgba[si + ch] * t);
      }
    }
  }
  return { w: nw, h, rgba: out };
}

/** 中段烘暗带:在 [x0f,x1f]×[y0f,y1f] 区域内按双向羽化叠加暗色,让文字区"长在"板材上(端饰保持鲜亮) */
function bakeShade(img, [x0f, x1f], [y0f, y1f], alphaMax, featherX = 0.06, featherY = 0.18) {
  const { w, h, rgba } = img;
  const x0 = w * x0f, x1 = w * x1f, y0 = h * y0f, y1 = h * y1f;
  const fx = w * featherX, fy = h * featherY;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let y = 0; y < h; y++) {
    const ay = smooth(Math.min(y - y0, y1 - y) / fy);
    if (ay <= 0) continue;
    for (let x = Math.floor(x0); x < Math.min(w, x1); x++) {
      const ax = smooth(Math.min(x - x0, x1 - x) / fx);
      const a = alphaMax * ax * ay;
      if (a <= 0.01) continue;
      const i = (y * w + x) * 4;
      const inv = 1 - a;
      rgba[i] = rgba[i] * inv + 9 * a;
      rgba[i + 1] = rgba[i + 1] * inv + 11 * a;
      rgba[i + 2] = rgba[i + 2] * inv + 18 * a;
    }
  }
  return img;
}

function downscale(img, nw, nh) {
  const { w, h, rgba } = img;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor((y * h) / nh), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor((x * w) / nw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * w + sx) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; n++;
        }
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { w: nw, h: nh, rgba: out };
}

/* ---------------- 映射表 ----------------
 * aspect: 槽位宽高比(优先代码绘制盒,缺省用旧资产比例)
 * punch:  内部镂空; fill: 内部填色(skinBar 遮罩法需要满条态)
 */
const MAP = [
  // 战斗 HUD 坞板(skinBar 拉伸绘制;splice 挖掉中央徽记,shade 中段烘暗带承接文字)
  { part: "uitrim_hud_01", key: "hud_dock_top", splice: [0.40, 0.60], shade: { x: [0.085, 0.915], y: [0.04, 0.96], a: 0.58 }, aspect: 8.75, out: [1120, 128] },
  { part: "uitrim_hud_02", key: "hud_dock_bottom", splice: [0.40, 0.60], shade: { x: [0.085, 0.915], y: [0.04, 0.96], a: 0.66 }, aspect: 11.67, out: [1120, 96] },
  // 进度条(skinBar 遮罩法:内部满条填充)
  { part: "uitrim_hud_07", key: "bar_progress_purple", aspect: 11.4, out: [868, 76], fill: "#9d66f2" },
  { part: "uitrim_hud_06", key: "bar_progress_blue_b", aspect: 11.1, out: [868, 78], fill: "#3f9bff" },
  { part: "uitrim_hud_06", key: "bar_progress_teal", aspect: 11.1, out: [868, 78], fill: "#2fd0bd" },
  // 按钮(九宫格)
  { part: "uitrim_btn_01", key: "btn_primary", aspect: 3.12, out: [640, 205] },
  { part: "uitrim_btn_03", key: "btn_minor", aspect: 3.5, out: [640, 183] },
  { part: "uitrim_btn_06", key: "btn_danger", aspect: 2.78, out: [640, 230] },
  { part: "uitrim_btn_04", key: "btn_back", out: [128, 124] },
  { part: "uitrim_btn_05", key: "btn_close", out: [128, 116] },
  { part: "uitrim_btn_07", key: "tabs_talent_three", aspect: 4.69, out: [778, 166] },
  { part: "uitrim_btn_08", key: "divider_bar_dark", aspect: 11.1, out: [868, 78] },
  // 货币 / 星标
  { part: "uitrim_icon_01", key: "icon_gold", out: [180, 184] },
  { part: "uitrim_icon_02", key: "icon_echo", out: [154, 188] },
  { part: "uitrim_icon_03", key: "icon_stardust", out: [190, 192] },
  { part: "uitrim_icon_04", key: "icon_ticket", out: [172, 190] },
  { part: "uitrim_icon_05", key: "icon_star_gold", out: [256, 256] },
  // 品质卡框(内部镂空,商店卡内容透出)
  { part: "uitrim_icon_06", key: "frame_common", punch: true, out: [274, 388] },
  { part: "uitrim_icon_07", key: "frame_rare", punch: true, out: [274, 388] },
  { part: "uitrim_icon_08", key: "frame_epic", punch: true, out: [274, 388] },
  { part: "uitrim_icon_09", key: "frame_legendary", punch: true, out: [274, 388] },
  { part: "uitrim_icon_10", key: "frame_hidden", punch: true, out: [274, 388] },
  // 头像框(内部镂空,中心要写关卡数)
  { part: "uitrim_icon_11", key: "avatar_common", punch: true, out: [256, 256] },
  { part: "uitrim_icon_12", key: "avatar_rare", punch: true, out: [256, 256] },
  { part: "uitrim_icon_13", key: "avatar_epic", punch: true, out: [256, 256] },
  { part: "uitrim_icon_14", key: "avatar_legendary", punch: true, out: [256, 256] },
  { part: "uitrim_icon_15", key: "avatar_hidden", punch: true, out: [256, 256] },
  // 横幅(skinHeader / 结算 240x48 盒)
  { part: "uitrim_banner_01", key: "banner_title_gold_a", aspect: 5.24, out: [1048, 200] },
  { part: "uitrim_banner_06", key: "banner_title_iron", aspect: 5.24, out: [1048, 200] },
  { part: "uitrim_banner_03", key: "banner_large_navy_a", aspect: 5.0, out: [1000, 200] },
  { part: "uitrim_banner_02", key: "banner_large_navy_b", aspect: 5.0, out: [1000, 200] },
  { part: "uitrim_banner_05", key: "banner_large_red", aspect: 5.0, out: [1000, 200] },
  { part: "uitrim_banner_04", key: "banner_mid_blue", aspect: 5.45, out: [1000, 184] },
  { part: "uitrim_banner_07", key: "banner_mid_bronze", aspect: 5.45, out: [1000, 184] },
  { part: "uitrim_banner_08", key: "menu_section_strip", aspect: 7.01, out: [1024, 146] },
];

/* ---------------- 执行 ---------------- */

if (!fs.existsSync(BACKUP)) {
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, f), path.join(BACKUP, f));
  console.log(`已备份原素材 → ${path.relative(ROOT, BACKUP)}`);
}

let done = 0;
for (const m of MAP) {
  const src = path.join(PARTS, `${m.part}.png`);
  if (!fs.existsSync(src)) { console.warn(`[warn] 缺零件 ${m.part}`); continue; }
  let img = decodePNG(fs.readFileSync(src));
  if (m.splice) img = spliceCenter(img, m.splice);
  if (m.aspect) img = cropToAspect(img, m.aspect);
  if (m.shade) bakeShade(img, m.shade.x, m.shade.y, m.shade.a);
  if (m.punch) punchInterior(img);
  if (m.fill) fillInterior(img, m.fill);
  img = downscale(img, m.out[0], m.out[1]);
  fs.writeFileSync(path.join(OUT, `${m.key}.png`), encodePNG(img.w, img.h, img.rgba));
  done++;
  console.log(`${m.part} → ${m.key}.png (${img.w}x${img.h}${m.punch ? ", 已镂空" : ""}${m.fill ? ", 已填色" : ""})`);
}
console.log(`完成: 覆盖 ${done} 个资产`);
