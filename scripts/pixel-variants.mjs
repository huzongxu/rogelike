/**
 * 像素变体派生管线:从已入库的基线像素件(enemy_<kind> / player)派生赛季换皮与英雄战斗件。
 *
 *   node scripts/pixel-variants.mjs [--config=artwork/pixel-kit-s1.json] [--out=dir] [--only=k1,k2] [--contact=path.png] [--dry] [--force]
 *   规格里 `frozen: true` 的格已被 AI 重绘批同键覆盖(`frozenBy` 指向那份规格),默认跳过,--force 才重出。
 *
 * 每一格 = 一枚源件 + 一串确定性算子,同一份规格重跑逐字节一致:
 *   remap   OKLCH 色相重映射:源件的主色族整体转到目标色相,明度逐色保留、彩度取源/目标折中,
 *           色内相对色相差按 hueSpread 收缩保留(暖高光 / 冷阴影的层次不丢)
 *   tint    指定源色列表按目标色相着色(明度不变、彩度给定),用于把玩家的灰白布料染成英雄主色
 *   recolor 指定源色列表做色相重映射(不触碰其它色)
 *   eyes    源件里高亮高彩且占比极小的色(眼 / 宝石)→ 主题亮色
 *   outline 贴着透明的近黑描边像素 → 主题暗色
 *   贴花    throat / chest / ripple / beads / afterimage / shell / cracks / blur / mirror /
 *           mouth / wall / pod / flank / network:只落在掩膜内(器官)或掩膜外(虚影 / 环 / 光晕),
 *           几何按源件包围盒比例取整,尺寸随 36→124 px 的件自然缩放
 *
 * 输出尺寸恒等于源件(export=1,1 贴图像素 = 1 逻辑 px),alpha 恒 0/255。
 * 纯 Node,只依赖 scripts/lib/png.mjs。
 */

import fs from "node:fs";
import path from "node:path";
import { decodePNG, encodePNG, hexToRgb } from "./lib/png.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const flagOn = (name) => argv.includes(`--${name}`);
const CONFIG = path.resolve(ROOT, argOf("config", "artwork/pixel-kit-s1.json"));
const ONLY = argOf("only", "") ? argOf("only").split(",").filter(Boolean) : null;
const OUT_DIR = path.resolve(ROOT, argOf("out", "cocos/assets/resources/textures"));
const SRC_DIR = path.resolve(ROOT, "cocos/assets/resources/textures");
const CONTACT = argOf("contact", "");
const DRY = flagOn("dry");

const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const ACCENT = cfg.accent || { main: "#7a5cff", light: "#c8b6ff", dark: "#1a1030" };

/* --------------------------------- 色彩空间 -------------------------------- */

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** sRGB 0..255 → OKLab */
function rgbToOklab([r8, g8, b8]) {
  const r = srgbToLin(r8 / 255), g = srgbToLin(g8 / 255), b = srgbToLin(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB 0..255;越界返回 null(调用方按彩度回退) */
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bb = linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  const eps = -0.002;
  if (r < eps || g < eps || bb < eps || r > 1.002 || g > 1.002 || bb > 1.002) return null;
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [q(r), q(g), q(bb)];
}

const toLch = (rgb) => {
  const [L, a, b] = rgbToOklab(rgb);
  return { L, C: Math.hypot(a, b), H: Math.atan2(b, a) };
};
/** LCH → sRGB;色域外时按 2% 步长收彩度直到落入 */
function fromLch({ L, C, H }) {
  for (let c = C; c >= 0; c -= Math.max(0.002, C * 0.02)) {
    const rgb = oklabToRgb([L, c * Math.cos(H), c * Math.sin(H)]);
    if (rgb) return rgb;
  }
  return oklabToRgb([L, 0, 0]) || [0, 0, 0];
}
const wrapAngle = (d) => Math.atan2(Math.sin(d), Math.cos(d));

/* --------------------------------- 图像容器 -------------------------------- */

const at = (im, x, y) => (y * im.w + x) * 4;
const inside = (im, x, y) => x >= 0 && y >= 0 && x < im.w && y < im.h;
const opaque = (im, x, y) => inside(im, x, y) && im.rgba[at(im, x, y) + 3] > 0;
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function clone(im) {
  return { w: im.w, h: im.h, rgba: Buffer.from(im.rgba) };
}
function setPx(im, x, y, rgb) {
  if (!inside(im, x, y)) return;
  const i = at(im, x, y);
  im.rgba[i] = rgb[0]; im.rgba[i + 1] = rgb[1]; im.rgba[i + 2] = rgb[2]; im.rgba[i + 3] = 255;
}
function clearPx(im, x, y) {
  if (!inside(im, x, y)) return;
  im.rgba[at(im, x, y) + 3] = 0;
}
/** 不透明像素的包围盒与质心 */
function bbox(im) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(im, x, y)) continue;
    n++; sx += x; sy += y;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  if (n === 0) return { x0: 0, y0: 0, x1: im.w - 1, y1: im.h - 1, w: im.w, h: im.h, cx: im.w / 2, cy: im.h / 2, n: 0 };
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sx / n, cy: sy / n, n };
}
/** 色直方图(仅不透明) */
function histogram(im) {
  const m = new Map();
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(im, x, y)) continue;
    const i = at(im, x, y);
    const k = hex(im.rgba[i], im.rgba[i + 1], im.rgba[i + 2]);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
/** 按颜色映射表整图替换(仅不透明像素) */
function applyColorMap(im, map) {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(im, x, y)) continue;
    const i = at(im, x, y);
    const to = map.get(hex(im.rgba[i], im.rgba[i + 1], im.rgba[i + 2]));
    if (to) { im.rgba[i] = to[0]; im.rgba[i + 1] = to[1]; im.rgba[i + 2] = to[2]; }
  }
}
/** 确定性伪随机(mulberry32),种子取自 key 字符串 */
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------- 颜色算子 -------------------------------- */

/**
 * remap:主色族整体转到目标色相。
 * 参与的色:明度 (0.18, 0.97)、彩度 > minChroma;其余(描边近黑、纯白高光)不动。
 * 主色相 = 参与色按 (像素数 × 彩度) 加权的圆均值;每色新色相 = 目标色相 + (自身 − 主色相) × hueSpread。
 */
function opRemap(im, o) {
  const tgt = toLch(hexToRgb(o.color));
  const minC = o.minChroma ?? 0.02;
  const spread = o.hueSpread ?? 0.35;
  const lMix = o.lightMix ?? 0.2;
  const cMix = o.chromaMix ?? 0.5;
  const hist = histogram(im);
  const parts = [];
  for (const [k, n] of hist) {
    const lch = toLch(hexToRgb(k));
    if (lch.L <= 0.18 || lch.L >= 0.97 || lch.C <= minC) continue;
    parts.push({ k, n, lch });
  }
  if (parts.length === 0) return;
  let sx = 0, sy = 0;
  for (const p of parts) { const w = p.n * p.lch.C; sx += Math.cos(p.lch.H) * w; sy += Math.sin(p.lch.H) * w; }
  const dom = Math.atan2(sy, sx);
  const map = new Map();
  for (const p of parts) {
    const H = tgt.H + wrapAngle(p.lch.H - dom) * spread;
    const C = p.lch.C * (1 - cMix) + tgt.C * cMix;
    const L = p.lch.L * (1 - lMix) + tgt.L * lMix;
    map.set(p.k, fromLch({ L, C, H }));
  }
  applyColorMap(im, map);
}

/** tint:指定源色按目标色相着色(明度保留,彩度给定) */
function opTint(im, o) {
  const tgt = toLch(hexToRgb(o.color));
  const map = new Map();
  for (const k of o.sources) {
    const lch = toLch(hexToRgb(k));
    map.set(k.toLowerCase(), fromLch({ L: lch.L + (o.lightShift ?? 0), C: o.chroma ?? 0.08, H: tgt.H }));
  }
  applyColorMap(im, map);
}

/** recolor:指定源色做色相重映射(彩度取源/目标较大者,明度保留) */
function opRecolor(im, o) {
  const tgt = toLch(hexToRgb(o.color));
  const map = new Map();
  for (const k of o.sources) {
    const lch = toLch(hexToRgb(k));
    map.set(k.toLowerCase(), fromLch({ L: lch.L + (o.lightShift ?? 0), C: Math.max(lch.C, tgt.C), H: tgt.H }));
  }
  applyColorMap(im, map);
}

/** eyes:高亮高彩且占比 ≤ maxShare 的源色 → 主题亮色(在 remap 之前按源色判定,调用方保证顺序) */
function opEyes(im, o, src) {
  const hist = histogram(src);
  const total = Array.from(hist.values()).reduce((a, b) => a + b, 0);
  const to = hexToRgb(o.color || ACCENT.light);
  const map = new Map();
  for (const [k, n] of hist) {
    const lch = toLch(hexToRgb(k));
    if (lch.L > (o.minLight ?? 0.78) && lch.C > (o.minChroma ?? 0.1) && n / total <= (o.maxShare ?? 0.04)) map.set(k, to);
  }
  // 源色 → 现色的对应:按像素位置逐点替换(remap 可能已改了颜色)
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(src, x, y)) continue;
    const i = at(src, x, y);
    if (map.has(hex(src.rgba[i], src.rgba[i + 1], src.rgba[i + 2]))) setPx(im, x, y, to);
  }
}

/** outline:贴着透明的近黑像素 → 主题暗色 */
function opOutline(im, o) {
  const to = hexToRgb(o.color || ACCENT.dark);
  const maxL = o.maxLight ?? 0.2;
  const hits = [];
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(im, x, y)) continue;
    const i = at(im, x, y);
    if (toLch([im.rgba[i], im.rgba[i + 1], im.rgba[i + 2]]).L > maxL) continue;
    if (!opaque(im, x - 1, y) || !opaque(im, x + 1, y) || !opaque(im, x, y - 1) || !opaque(im, x, y + 1)) hits.push([x, y]);
  }
  for (const [x, y] of hits) setPx(im, x, y, to);
}

/* --------------------------------- 贴花算子 -------------------------------- */

const col = (name, o) => hexToRgb(o[name] || ACCENT[name] || ACCENT.main);

/** 实心圆点(只落掩膜内 / 外 / 任意) */
function blob(im, cx, cy, r, rgb, where = "in") {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + 0.25) continue;
    const on = opaque(im, x, y);
    if (where === "in" && !on) continue;
    if (where === "out" && on) continue;
    setPx(im, x, y, rgb);
  }
}
/** 发光器官:暗环 + 主色 + 亮心 */
function glowSpot(im, cx, cy, r, o) {
  blob(im, cx, cy, r + 1, col("dark", o), "in");
  blob(im, cx, cy, r, col("main", o), "in");
  blob(im, cx, cy, Math.max(0.5, r - 1), col("light", o), "in");
}

/** throat:喉部声囊(上 38%) */
function decalThroat(im, o, b) {
  const r = Math.max(1, Math.round(b.w * (o.size ?? 0.06)));
  glowSpot(im, Math.round(b.x0 + b.w * (o.x ?? 0.5)), Math.round(b.y0 + b.h * (o.y ?? 0.38)), r, o);
}
/** chest:胸腔裂纹发光(中心亮点 + 两道斜裂) */
function decalChest(im, o, b) {
  const cx = Math.round(b.x0 + b.w * (o.x ?? 0.5)), cy = Math.round(b.y0 + b.h * (o.y ?? 0.55));
  const r = Math.max(1, Math.round(b.w * 0.05));
  glowSpot(im, cx, cy, r, o);
  const len = Math.max(2, Math.round(b.w * 0.12));
  for (let i = 1; i <= len; i++) {
    if (opaque(im, cx - r - i, cy - Math.floor(i / 2))) setPx(im, cx - r - i, cy - Math.floor(i / 2), col("main", o));
    if (opaque(im, cx + r + i, cy + Math.floor(i / 2))) setPx(im, cx + r + i, cy + Math.floor(i / 2), col("main", o));
  }
}
/** ripple:身体两侧向外扩的声波弧「)))」(掩膜外,只画水平轴 ±span 弧度内的弧段,免得读成选中环) */
function decalRipple(im, o, b) {
  const cx = b.x0 + (b.w - 1) / 2, cy = b.y0 + (b.h - 1) / 2;
  const rings = o.rings ?? 1;
  const span = o.span ?? 0.6;
  for (let k = 0; k < rings; k++) {
    const R = Math.min(im.w, im.h) / 2 - 1 - k * 3;
    const steps = Math.max(24, Math.round(R * 6));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const off = Math.min(Math.abs(wrapAngle(a)), Math.abs(wrapAngle(a - Math.PI)));
      if (off > span) continue;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R * (o.squash ?? 1));
      if (!opaque(im, x, y)) setPx(im, x, y, k % 2 ? col("dark", o) : col("main", o));
    }
  }
}
/** beads:骨珠亮点散落(掩膜内下半身) */
function decalBeads(im, o, b, key) {
  const r = rng(key + ":beads");
  const n = o.count ?? Math.max(3, Math.round(b.w / 8));
  let placed = 0, guard = 0;
  while (placed < n && guard++ < 400) {
    const x = Math.round(b.x0 + r() * b.w), y = Math.round(b.y0 + b.h * (o.top ?? 0.45) + r() * b.h * (1 - (o.top ?? 0.45)));
    if (!opaque(im, x, y) || !opaque(im, x + 1, y) || !opaque(im, x, y + 1)) continue;
    setPx(im, x, y, col("light", o));
    if (b.w >= 48) { setPx(im, x + 1, y, col("main", o)); setPx(im, x, y + 1, col("main", o)); }
    placed++;
  }
}
/** afterimage:朝后(左)平移的暗色残影(掩膜外) */
function decalAfterimage(im, o, b, src) {
  const dx = Math.max(2, Math.round(b.w * (o.shift ?? 0.14)));
  const layers = o.layers ?? 2;
  for (let k = layers; k >= 1; k--) {
    // 小件(< 48 px)首层实心才读得出轮廓;大件一律棋盘点划、首层用主色,免得糊成一片
    const big = b.w >= 48;
    const rgb = k === 1 ? col("main", o) : col("dark", o);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      if (!opaque(src, x, y)) continue;
      const tx = x - dx * k;
      if (!inside(im, tx, y) || opaque(src, tx, y)) continue;
      if (((tx + y) & 1) === 0 || (k === 1 && !big)) setPx(im, tx, y, rgb);
    }
  }
}
/** shell:背部螺壳(掩膜内左上象限的同心弧) */
function decalShell(im, o, b) {
  const cx = b.x0 + b.w * 0.35, cy = b.y0 + b.h * 0.42;
  const R0 = b.w * 0.16;
  for (let k = 0; k < 3; k++) {
    const R = R0 + k * Math.max(2, b.w * 0.07);
    const steps = Math.round(R * 8) + 12;
    for (let s = 0; s < steps; s++) {
      const a = Math.PI * 0.9 + (s / steps) * Math.PI * 1.25;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
      if (opaque(im, x, y)) setPx(im, x, y, k === 1 ? col("main", o) : col("dark", o));
    }
  }
  glowSpot(im, Math.round(cx), Math.round(cy), Math.max(1, Math.round(R0 * 0.5)), o);
}
/** cracks:通体裂纹(掩膜内若干折线) */
function decalCracks(im, o, b, key) {
  const r = rng(key + ":cracks");
  const n = o.count ?? Math.max(3, Math.round(b.w / 9));
  for (let i = 0; i < n; i++) {
    let x = Math.round(b.x0 + b.w * (0.25 + r() * 0.5)), y = Math.round(b.y0 + b.h * (0.2 + r() * 0.5));
    const len = Math.max(3, Math.round(b.h * 0.22));
    let dx = r() < 0.5 ? -1 : 1;
    for (let s = 0; s < len; s++) {
      if (opaque(im, x, y)) setPx(im, x, y, s % 3 === 1 ? col("light", o) : col("main", o));
      y += 1;
      if (r() < 0.45) x += dx;
      if (r() < 0.2) dx = -dx;
    }
  }
}
/** blur:轮廓模糊化——边缘一圈按棋盘抠掉,再向外补一圈主题暗色棋盘 */
function decalBlur(im, o, b, src) {
  const edge = [];
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!opaque(src, x, y)) continue;
    if (!opaque(src, x - 1, y) || !opaque(src, x + 1, y) || !opaque(src, x, y - 1) || !opaque(src, x, y + 1)) edge.push([x, y]);
  }
  for (const [x, y] of edge) if (((x + y) & 1) === 0) clearPx(im, x, y);
  for (const [x, y] of edge) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const tx = x + ox, ty = y + oy;
    if (!inside(im, tx, ty) || opaque(src, tx, ty)) continue;
    if (((tx + ty) & 1) === 1) setPx(im, tx, ty, col("dark", o));
  }
}
/** mirror:镜面胸甲(掩膜内中部亮板 + 斜高光) */
function decalMirror(im, o, b) {
  const w = Math.max(3, Math.round(b.w * 0.26)), h = Math.max(3, Math.round(b.h * 0.22));
  const x0 = Math.round(b.x0 + b.w * 0.5 - w / 2), y0 = Math.round(b.y0 + b.h * (o.y ?? 0.42));
  const face = hexToRgb(o.face || "#a8e4ff"), rim = hexToRgb(o.rim || "#1f4e8a"), hi = hexToRgb("#e8ecf4");
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!opaque(im, x, y)) continue;
    const onRim = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
    setPx(im, x, y, onRim ? rim : (x - x0) - (y - y0) === 1 || (x - x0) - (y - y0) === 2 ? hi : face);
  }
}
/** mouth:宽扁巨口(掩膜内下部暗椭圆 + 亮唇 + 齿点) */
function decalMouth(im, o, b) {
  const cx = b.x0 + b.w * 0.5, cy = b.y0 + b.h * (o.y ?? 0.62);
  const rx = b.w * (o.rx ?? 0.3), ry = b.h * (o.ry ?? 0.1);
  // 口腔近黑、唇线取主题暗色(主色唇线在大件上会读成一只紫碗)
  const cav = hexToRgb("#0b0e14"), lip = hexToRgb(o.lip || ACCENT.dark), tooth = hexToRgb("#e8ecf4");
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (!opaque(im, x, y) || d > 1.25) continue;
    setPx(im, x, y, d > 0.9 ? lip : cav);
  }
  for (let x = Math.round(cx - rx * 0.7); x <= cx + rx * 0.7; x += 2) if (opaque(im, x, Math.round(cy - ry * 0.5))) setPx(im, x, Math.round(cy - ry * 0.5), tooth);
}
/** wall:身前(右侧)竖向音壁弧(掩膜外) */
function decalWall(im, o, b) {
  const cx = b.x0 + b.w * 0.5, cy = b.y0 + b.h * 0.5;
  for (let k = 0; k < (o.arcs ?? 2); k++) {
    const R = b.w * 0.5 + 1 + k * 2;
    const steps = Math.round(R * 6) + 12;
    for (let s = 0; s < steps; s++) {
      const a = -Math.PI * 0.42 + (s / steps) * Math.PI * 0.84;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
      if (inside(im, x, y) && !opaque(im, x, y) && (k === 0 || (s & 1) === 0)) setPx(im, x, y, k === 0 ? col("light", o) : col("main", o));
    }
  }
}
/** pod:球状种荚(掩膜内下腹亮球 + 荚脉) */
function decalPod(im, o, b) {
  const r = Math.max(2, Math.round(b.w * 0.12));
  const cx = Math.round(b.x0 + b.w * 0.5), cy = Math.round(b.y0 + b.h * 0.62);
  blob(im, cx, cy, r + 1, col("dark", o), "in");
  blob(im, cx, cy, r, col("main", o), "in");
  for (let y = -r; y <= r; y++) if (opaque(im, cx, cy + y)) setPx(im, cx, cy + y, col("light", o));
  for (let x = -r; x <= r; x++) if (opaque(im, cx + x, cy)) setPx(im, cx + x, cy, col("light", o));
}
/** flank:两侧各一枚缩小的同族残影(掩膜外,尸群) */
function decalFlank(im, o, b, src) {
  // 取色读当前(已 remap)的本体,掩膜判定仍用源件
  const pal = clone(im);
  const k = o.scale ?? 0.55;
  const sw = Math.round(b.w * k), sh = Math.round(b.h * k);
  const place = (ox) => {
    const baseY = b.y1 - sh + 1;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const sx = b.x0 + Math.floor(x / k), sy = b.y0 + Math.floor(y / k);
      if (!opaque(src, sx, sy)) continue;
      const tx = ox + x, ty = baseY + y;
      if (!inside(im, tx, ty) || opaque(src, tx, ty)) continue;
      const i = at(pal, sx, sy);
      const lch = toLch([pal.rgba[i], pal.rgba[i + 1], pal.rgba[i + 2]]);
      setPx(im, tx, ty, fromLch({ L: lch.L * 0.75, C: lch.C * 0.8, H: lch.H }));
    }
  };
  place(Math.max(0, b.x0 - Math.round(sw * 0.55)));
  place(Math.min(im.w - sw, b.x1 - Math.round(sw * 0.45)));
}
/** network:全身声囊网络(多枚发光器官 + 连线) */
function decalNetwork(im, o, b, key) {
  const r = rng(key + ":network");
  const n = o.count ?? 6;
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 500) {
    const x = Math.round(b.x0 + b.w * (0.2 + r() * 0.6)), y = Math.round(b.y0 + b.h * (0.15 + r() * 0.65));
    if (!opaque(im, x, y)) continue;
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < b.w * 0.14)) continue;
    pts.push([x, y]);
  }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s <= steps; s += 2) {
      const x = Math.round(ax + ((bx - ax) * s) / steps), y = Math.round(ay + ((by - ay) * s) / steps);
      if (opaque(im, x, y)) setPx(im, x, y, col("main", o));
    }
  }
  const rr = Math.max(1, Math.round(b.w * 0.035));
  for (const [x, y] of pts) glowSpot(im, x, y, rr, o);
}

const DECALS = {
  throat: decalThroat, chest: decalChest, ripple: decalRipple, beads: decalBeads, afterimage: decalAfterimage,
  shell: decalShell, cracks: decalCracks, blur: decalBlur, mirror: decalMirror,
  mouth: decalMouth, wall: decalWall, pod: decalPod, flank: decalFlank, network: decalNetwork,
};

/* --------------------------------- 主流程 -------------------------------- */

function deriveOne(one) {
  const srcPath = path.join(SRC_DIR, `${one.from}.png`);
  const src = decodePNG(fs.readFileSync(srcPath));
  const im = clone(src);
  const ops = one.ops || [];
  // 颜色算子先于贴花;eyes 按源色判定,放在 remap 之后仍读 src
  for (const raw of ops) {
    const o = typeof raw === "string" ? { op: raw } : raw;
    switch (o.op) {
      case "remap": opRemap(im, { color: one.color, ...o }); break;
      case "tint": opTint(im, o); break;
      case "recolor": opRecolor(im, o); break;
      case "eyes": opEyes(im, o, src); break;
      case "outline": opOutline(im, o); break;
      default: {
        const fn = DECALS[o.op];
        if (!fn) throw new Error(`${one.key}: 未知算子 ${o.op}`);
        fn(im, o, bbox(im), one.key, src);
      }
    }
  }
  // alpha 硬化
  for (let i = 0; i < im.w * im.h; i++) im.rgba[i * 4 + 3] = im.rgba[i * 4 + 3] > 127 ? 255 : 0;
  return im;
}

// 贴花里有三枚需要源图(afterimage / blur / flank),把签名统一成 (im, o, b, key, src)
for (const name of ["afterimage", "blur", "flank"]) {
  const fn = DECALS[name];
  DECALS[name] = (im, o, b, key, src) => fn(im, o, b, src);
}
for (const name of ["beads", "cracks", "network"]) {
  const fn = DECALS[name];
  DECALS[name] = (im, o, b, key) => fn(im, o, b, key);
}

function main() {
  // frozen 格 = 已被 AI 重绘批(frozenBy)同键覆盖,重跑派生不回滚它们;--force 才重出
  const singles = (cfg.singles || []).filter((s) => (!ONLY || ONLY.includes(s.key)) && (!s.frozen || flagOn("force")));
  if (singles.length === 0) { console.error("没有可处理的格子"); process.exit(1); }
  const outs = [];
  for (const one of singles) {
    const im = deriveOne(one);
    outs.push({ key: one.key, im });
    if (!DRY) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${one.key}.png`), encodePNG(im.w, im.h, im.rgba));
    }
    console.log(`${DRY ? "[dry] " : ""}${one.key}  ${im.w}x${im.h}  ← ${one.from}  ops=${(one.ops || []).map((o) => (typeof o === "string" ? o : o.op)).join("+")}`);
  }
  if (CONTACT) {
    const scale = Number(argOf("scale", 3)), cols = Number(argOf("cols", 6));
    const cell = Math.max(...outs.map((o) => Math.max(o.im.w, o.im.h))) * scale + 6;
    const rows = Math.ceil(outs.length / cols);
    const W = cols * cell, H = rows * cell;
    const sheet = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { sheet[i * 4] = 30; sheet[i * 4 + 1] = 34; sheet[i * 4 + 2] = 48; sheet[i * 4 + 3] = 255; }
    outs.forEach((o, idx) => {
      const ox = (idx % cols) * cell + 3, oy = Math.floor(idx / cols) * cell + 3;
      for (let y = 0; y < o.im.h * scale; y++) for (let x = 0; x < o.im.w * scale; x++) {
        const s = (Math.floor(y / scale) * o.im.w + Math.floor(x / scale)) * 4;
        if (!o.im.rgba[s + 3]) continue;
        const d = ((oy + y) * W + ox + x) * 4;
        sheet[d] = o.im.rgba[s]; sheet[d + 1] = o.im.rgba[s + 1]; sheet[d + 2] = o.im.rgba[s + 2];
      }
    });
    const p = path.resolve(ROOT, CONTACT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, encodePNG(W, H, sheet));
    console.log(`接触表 → ${p} (${W}x${H})`);
  }
}

main();
