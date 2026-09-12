/**
 * 像素化后处理管线:把 AI 生图(平涂底 + 网格雪碧图)转成游戏内可用的像素贴图。
 *
 *   node scripts/pixel-kit.mjs [config] [--only=k1,k2] [--out=dir] [--contact] [--dry]
 *
 * 每一步都做确定性处理,同一份配置重跑逐字节一致:
 *   1 按 grid 切格 → 2 从格边洪水填充抠底(或 keyout="alpha":透明底源图按 alpha 阈值硬化)→ 3 内容 bbox 裁剪(可再按 crop 取子框)
 *   4 最近邻重采样到 art-pixel 网格(1 art px = module 逻辑 px) → 5 量化到统一调色板(可选 Bayer 抖动)
 *   6 alpha 硬化 → 7 九宫格可拉伸带平整 → 8 整数倍放大导出 RGBA PNG
 *
 * 纯 Node 实现(依赖 scripts/lib/png.mjs 的零依赖编解码)。
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
const CONFIG = path.resolve(ROOT, argOf("config", "artwork/pixel-kit.json"));
const ONLY = argOf("only", "") ? argOf("only").split(",").filter(Boolean) : null;
const OUT_DIR = path.resolve(ROOT, argOf("out", "cocos/assets/resources/textures"));
const CONTACT_DIR = path.resolve(ROOT, ".probe/px");

const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const MODULE = cfg.module ?? 2;
const EXPORT = cfg.export ?? 4;
const PALETTE = (cfg.palette || []).map(hexToRgb);
if (PALETTE.length === 0) throw new Error("config.palette 为空");
const KEY_TOL = cfg.keyout?.tolerance ?? 96;
const KEY_ERODE = cfg.keyout?.erode ?? 2;
/**
 * 量化落点用的距离:"rgb"(默认,= dist2,既有批次逐字节不变)/ "lab"(近似 CIELAB)。
 *
 * 为什么要 lab 档:深渊蓝黑表里挤着大一片低彩度中性色(骨白 #c8cdd6 / #e8ecf4 / 灰蓝
 * #a9b4c4),它们的亮度与生图里那圈淡饱和绿顶带几乎齐平,纯 RGB 加权距离只看「差多少」
 * 不看「往哪个方向差」,于是高饱和绿被灰白族抢走落点。近似 CIELAB 把明度、红绿轴、黄蓝轴
 * 分开算,色相与彩度差会实打实地进距离。只作用于调色板落点:抠底判据仍走 dist2,
 * 所以约定色 + 四角实测色的连通性判定不受影响。
 */
const QDIST = cfg.quant?.distance === "lab" ? "lab" : "rgb";
/** Lab 模式下预先把调色板换算一次;rgb 模式保持 null,量化路径与成本逐字节不变 */
const PALETTE_LAB = QDIST === "lab" ? PALETTE.map(rgbToLab) : null;

/* --------------------------------- 图像容器 -------------------------------- */

function img(w, h, fill = [0, 0, 0, 0]) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = fill[0]; rgba[i * 4 + 1] = fill[1];
    rgba[i * 4 + 2] = fill[2]; rgba[i * 4 + 3] = fill[3];
  }
  return { w, h, rgba };
}
const at = (im, x, y) => (y * im.w + x) * 4;
function put(im, x, y, p) {
  const i = at(im, x, y);
  im.rgba[i] = p[0]; im.rgba[i + 1] = p[1]; im.rgba[i + 2] = p[2]; im.rgba[i + 3] = p[3];
}
function get(im, x, y) {
  const i = at(im, x, y);
  return [im.rgba[i], im.rgba[i + 1], im.rgba[i + 2], im.rgba[i + 3]];
}
function dist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr * 0.9 + dg * dg * 1.1 + db * db * 0.8;
}

/** sRGB(0-255) → 近似 CIELAB(D65)。只做量化落点用,不追求色彩管理级的严谨。 */
function rgbToLab(p) {
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(p[0]), g = lin(p[1]), b = lin(p[2]);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDist2(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

/** 调色板落点距离:QDIST = "lab" 走近似 CIELAB,否则逐字节沿用 dist2 */
function palDist2(a, b) {
  return QDIST === "lab" ? labDist2(a, b) : dist2(a, b);
}

/** 取格边一圈的众数色,作为该格的底色(不假设生成器真按 #FF00FF 出图) */
function modalBorderColor(im, r) {
  const bins = new Map();
  const push = (p) => {
    const k = `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`;
    bins.set(k, (bins.get(k) || 0) + 1);
  };
  for (let x = r.x0; x < r.x1; x++) { push(get(im, x, r.y0)); push(get(im, x, r.y1 - 1)); }
  for (let y = r.y0; y < r.y1; y++) { push(get(im, r.x0, y)); push(get(im, r.x1 - 1, y)); }
  let bestK = null, bestN = -1;
  for (const [k, n] of bins) if (n > bestN) { bestN = n; bestK = k; }
  const [br, bg, bb] = bestK.split(",").map(Number);
  const acc = [0, 0, 0, 0];
  let cnt = 0;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const p = get(im, x, y);
      if ((p[0] >> 4) === br && (p[1] >> 4) === bg && (p[2] >> 4) === bb) {
        acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; cnt++;
      }
    }
  }
  return cnt ? [acc[0] / cnt, acc[1] / cnt, acc[2] / cnt, 255] : [br * 16 + 8, bg * 16 + 8, bb * 16 + 8, 255];
}

/** 从格边洪水填充抠底:只吃掉与外界连通的底色像素,图标内部的同色像素保住 */
function keyOut(im, r, bgRgb, tol) {
  const { x0, y0, x1, y1 } = r;
  const w = x1 - x0, h = y1 - y0;
  const isBg = (x, y) => {
    const p = get(im, x, y);
    return p[3] === 0 || dist2(p, bgRgb) < tol * tol;
  };
  const gone = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => { if (isBg(x, y) && !gone[(y - y0) * w + (x - x0)]) { gone[(y - y0) * w + (x - x0)] = 1; stack.push(x, y); } };
  for (let x = x0; x < x1; x++) { seed(x, y0); seed(x, y1 - 1); }
  for (let y = y0; y < y1; y++) { seed(x0, y); seed(x1 - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    const tryGo = (nx, ny) => {
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) return;
      const ni = (ny - y0) * w + (nx - x0);
      if (gone[ni] || !isBg(nx, ny)) return;
      gone[ni] = 1; stack.push(nx, ny);
    };
    tryGo(x + 1, y); tryGo(x - 1, y); tryGo(x, y + 1); tryGo(x, y - 1);
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (gone[(y - y0) * w + (x - x0)]) put(im, x, y, [0, 0, 0, 0]);
  }
  return gone;
}

/** 透明底键出:alpha < min 的像素置全透明,其余置不透明(生成器去背景导出的软边在此硬化,再交给腐蚀) */
function alphaKey(im, r, min) {
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const p = get(im, x, y);
      if (p[3] < min) put(im, x, y, [0, 0, 0, 0]);
      else if (p[3] !== 255) put(im, x, y, [p[0], p[1], p[2], 255]);
    }
  }
}

/** 全局键出:不做连通性判断,rect 内所有贴近约定品红的不透明像素直接置透明(治封闭字腔里洪水够不到的品红) */
function keyGlobalOut(im, r, keyRgb, tol) {
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const p = get(im, x, y);
      if (p[3] !== 0 && dist2(p, keyRgb) < tol * tol) put(im, x, y, [0, 0, 0, 0]);
    }
  }
}

/** 腐蚀 n 次:吃掉抗锯齿残留的软边,保证像素边缘硬。
 *  `legacy = true` 恢复旧语义（区域外按非实心）：已入库有 12 张是旧语义产物，逐键钉住以便复现全集。 */
function erodeAlpha(im, r, n, legacy = false) {
  for (let k = 0; k < n; k++) {
    const kill = [];
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        if (get(im, x, y)[3] === 0) continue;
        const solid = (dx, dy) => {
          const nx = x + dx, ny = y + dy;
          /**
           * 默认区域外按实心处理：r 是内容紧框（手钉 rects 或 alphaBBox 的结果），贴边像素本就是
           * 有效内容。若把越界判成非实心，腐蚀会无条件吃掉紧框最外一圈，而 resample 用 floor
           * 采样、取样点整体偏左上，于是只有输出的首行/首列落进那圈透明里 —— 表现为贴图
           * 恒定缺上边与左边。腐蚀的用途只是吃抗锯齿软边，只该在贴着真透明处生效。
           */
          if (nx < r.x0 || ny < r.y0 || nx >= r.x1 || ny >= r.y1) return !legacy;
          return get(im, nx, ny)[3] > 0;
        };
        if (!(solid(1, 0) && solid(-1, 0) && solid(0, 1) && solid(0, -1))) kill.push([x, y]);
      }
    }
    if (!kill.length) break;
    for (const [x, y] of kill) put(im, x, y, [0, 0, 0, 0]);
  }
}

/** 取框阈值保持 >0。曾试过 128 想排除抗锯齿发丝，实测反而造成回归
 *  （banner_title_gold_c 出品红描边、frame_* 多一条黑色左列），故否掉、不留该档。
 *  bar_capsule / btn_primary 的发丝问题根因在 flatCenter 取代表列与腐蚀的交互，另案修。 */
const FRAME_ALPHA_MIN = 0;

function alphaBBox(im, r) {
  let x0 = r.x1, y0 = r.y1, x1 = r.x0 - 1, y1 = r.y0 - 1;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (get(im, x, y)[3] > FRAME_ALPHA_MIN) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** 最近邻重采样到 art 网格:fit = contain(等比留边) / cover(等比裁切) / stretch(拉伸) */
function resample(src, box, artW, artH, fit, fillBox = false) {
  const out = img(artW, artH);
  const sw = box.x1 - box.x0, sh = box.y1 - box.y0;
  if (!sw || !sh) return { im: out, coverage: 0 };
  let s, ox, oy;
  const k = fit === "cover" ? Math.max(artW / sw, artH / sh) : Math.min(artW / sw, artH / sh);
  /**
   * `fillBox`(配 fit=stretch 用)= 源框整幅铺满 art 盒,不留居中边:贴边件(横幅、胶囊条、
   * 九宫格板)的比例与屏上绘制矩形本就不同,再叠一次居中会凭空多出一段透明边、并把另一侧
   * 内容挤出盒外。不开这一档时沿用等比档的居中落点,既有批次逐字节不变。
   */
  ox = fillBox ? 0 : Math.round((artW - sw * k) / 2);
  oy = fillBox ? 0 : Math.round((artH - sh * k) / 2);
  s = k;
  const scaleX = fit === "stretch" ? sw / artW : 1 / s;
  const scaleY = fit === "stretch" ? sh / artH : 1 / s;
  let filled = 0;
  for (let y = 0; y < artH; y++) {
    for (let x = 0; x < artW; x++) {
      const sx = Math.floor((x - ox) * scaleX);
      const sy = Math.floor((y - oy) * scaleY);
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const p = get(src, box.x0 + sx, box.y0 + sy);
      if (p[3] === 0) continue;
      put(out, x, y, p);
      filled++;
    }
  }
  return { im: out, coverage: filled / (artW * artH) };
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function nearestTwo(pal, p) {
  let i0 = 0, i1 = 0, d0 = Infinity, d1 = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const d = palDist2(pal[i], p);
    if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = i; }
    else if (d < d1) { d1 = d; i1 = i; }
  }
  return [i0, i1];
}

/** 量化到统一调色板;dither 打开时在"最近两色"之间按 Bayer 阈值抖动,得到像素画点阵渐变 */
function quantize(im, dither) {
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const p = get(im, x, y);
      if (p[3] === 0) continue;
      const [i0, i1] = PALETTE_LAB ? nearestTwo(PALETTE_LAB, rgbToLab(p)) : nearestTwo(PALETTE, p);
      let pick = i0;
      if (dither && i0 !== i1) {
        const c0 = PALETTE[i0], c1 = PALETTE[i1];
        const vx = c1[0] - c0[0], vy = c1[1] - c0[1], vz = c1[2] - c0[2];
        const nn = vx * vx + vy * vy + vz * vz;
        const f = nn ? ((p[0] - c0[0]) * vx + (p[1] - c0[1]) * vy + (p[2] - c0[2]) * vz) / nn : 0;
        if (f > BAYER4[y & 3][x & 3]) pick = i1;
      }
      const c = PALETTE[pick];
      put(im, x, y, [c[0], c[1], c[2], 255]);
    }
  }
  return im;
}

/**
 * 九宫格可拉伸带平整,保证拉伸不出接缝与重影。
 *
 * 四个单轴带:上下带按行取众数、左右带按列取众数(这两个方向只被拉一次)。
 * `flatCenter`:中块是九宫格里**唯一被双轴同时拉伸**的区域,源图里任何一个孤立
 * 抖动点都会被放大成一大块实心色斑(36 宽的板拉到 560 就是 15.5 倍),故整块收
 * 成中块众数色。默认关:只有确认中块本就该是纯色腔体的板类件才开,卡框与立绘板
 * 的中块是有设计的画面,收了就毁图。
 */
function flattenSlices(im, m, flatCenter = false) {
  /**
   * 单轴带用「段内第一个像素」。按像素偏移分桶时每个偏移各自一桶、计数恒为 1,取到的
   * 其实就是段首像素 —— 已验收的主菜单批全部出在这一行为上,改它等于重切那一批板,
   * 所以这里原样冻结,只把名字换成它真正做的事。
   */
  const segHead = (vals) => vals[0];
  /**
   * 中块用「真众数色」。中块是个二维区域,段首像素完全可能落在一枚装饰抖动点上
   * (hud_dock_top 中块首像素正是 #10294a),所以必须按颜色本身分桶;并列取扫描序
   * 先出现者,保证同配置逐字节可复现。
   */
  const modalColor = (vals) => {
    const bins = new Map();
    for (const o of vals) {
      const k = `${im.rgba[o]},${im.rgba[o + 1]},${im.rgba[o + 2]}`;
      const hit = bins.get(k);
      if (hit) hit.n++;
      else bins.set(k, { o, n: 1 });
    }
    let best = bins.values().next().value;
    for (const v of bins.values()) if (v.n > best.n) best = v;
    return best.o;
  };
  for (let y = 0; y < m; y++) {
    const seg = [];
    for (let x = m; x < im.w - m; x++) seg.push(at(im, x, y));
    if (seg.length) { const src = segHead(seg); for (let x = m; x < im.w - m; x++) im.rgba.set(im.rgba.subarray(src, src + 4), at(im, x, y)); }
  }
  for (let y = im.h - m; y < im.h; y++) {
    const seg = [];
    for (let x = m; x < im.w - m; x++) seg.push(at(im, x, y));
    if (seg.length) { const src = segHead(seg); for (let x = m; x < im.w - m; x++) im.rgba.set(im.rgba.subarray(src, src + 4), at(im, x, y)); }
  }
  for (let x = 0; x < m; x++) {
    const seg = [];
    for (let y = m; y < im.h - m; y++) seg.push(at(im, x, y));
    if (seg.length) { const src = segHead(seg); for (let y = m; y < im.h - m; y++) im.rgba.set(im.rgba.subarray(src, src + 4), at(im, x, y)); }
  }
  for (let x = im.w - m; x < im.w; x++) {
    const seg = [];
    for (let y = m; y < im.h - m; y++) seg.push(at(im, x, y));
    if (seg.length) { const src = segHead(seg); for (let y = m; y < im.h - m; y++) im.rgba.set(im.rgba.subarray(src, src + 4), at(im, x, y)); }
  }
  if (flatCenter) {
    const seg = [];
    for (let y = m; y < im.h - m; y++) for (let x = m; x < im.w - m; x++) seg.push(at(im, x, y));
    if (seg.length) {
      const src = modalColor(seg);
      for (let y = m; y < im.h - m; y++) for (let x = m; x < im.w - m; x++) im.rgba.set(im.rgba.subarray(src, src + 4), at(im, x, y));
    }
  }
  return im;
}

function upscale(im, k) {
  const out = img(im.w * k, im.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) put(out, x, y, get(im, (x / k) | 0, (y / k) | 0));
  }
  return out;
}

/** 棋盘底 + 1x art 网格预览,用来肉眼判抠底与量化是否成立 */
function compositeOnChecker(im, cell = 4) {
  const out = img(im.w, im.h);
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const light = (((x / cell) | 0) + ((y / cell) | 0)) % 2 === 0;
      const p = get(im, x, y);
      put(out, x, y, p[3] > 0 ? p : light ? [150, 150, 150, 255] : [96, 96, 96, 255]);
    }
  }
  return out;
}

/* ---------------------------------- 主流程 --------------------------------- */

function resolveSrc(spec) {
  if (fs.existsSync(spec)) return spec;
  const dir = path.dirname(spec);
  const base = path.basename(spec, path.extname(spec));
  const cands = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png") && (f === path.basename(spec) || (f.startsWith(base + "_") && f.length > base.length + 1)));
  if (!cands.length) throw new Error(`找不到源图: ${spec}`);
  cands.sort();
  return path.join(dir, cands[cands.length - 1]);
}

const KEY_RGB = hexToRgb((cfg.keyout && cfg.keyout.color) || "#ff00ff");
const KEY_TIGHT = (cfg.keyout && cfg.keyout.keyTolerance) ?? 60;
/** 生成器水印固定压整幅右下角;归一化到格内坐标。默认档 `row` 把盒上方紧邻的一行向下拉伸，
 *  图标这类小件够用；全幅背景上它会拉出一梳竖向拖影，改走 `wmFill` 的 `mirror` / `slide`。 */
const WM_DEFAULT = [0.55, 0.86, 0.45, 0.14];

function inpaintRect(im, r, wm, fill = "row") {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const x0 = r.x0 + Math.round(w * wm[0]);
  const y0 = r.y0 + Math.round(h * wm[1]);
  const x1 = r.x0 + Math.round(w * (wm[0] + wm[2]));
  const y1 = r.y0 + Math.round(h * (wm[1] + wm[3]));
  const bw = x1 - x0;
  /** 三种取源都只读盒外（`y0` 之上 / `x0` 之左）的像素，写入不会污染后续读取。
   *  `mirror` 把盒正上方等高的块逐行镜像下来，盒顶接缝连续；`slide` 取盒左侧同宽的块
   *  平移过来，保住地面纹理的横向走向，代价是左侧若有醒目物件会被复现一次。 */
  for (let y = y0; y < y1; y++) {
    const srcY = fill === "mirror" ? Math.max(r.y0, y0 - 1 - (y - y0))
      : fill === "slide" ? y
      : Math.max(r.y0, y0 - 1);
    for (let x = x0; x < x1; x++) {
      const srcX = fill === "slide" ? Math.max(r.x0, x - bw) : x;
      const s = at(im, srcX, srcY);
      im.rgba.set(im.rgba.subarray(s, s + 4), at(im, x, y));
    }
  }
}

/** 取格四角实测底色(四角各 3x3、逐通道取中位)。生成器品红逐张漂移(实测 entry≈(128,42,84)、
 *  currency≈(208,30,120)、digits≈(224,4,140)),约定色 + 容差够不到时底色会烘进贴图。 */
function cornerMedian(im, r) {
  const rs = [], gs = [], bs = [];
  for (const cy of [r.y0, r.y1 - 1]) {
    for (const cx of [r.x0, r.x1 - 1]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < r.x0 || y < r.y0 || x >= r.x1 || y >= r.y1) continue;
          const p = get(im, x, y);
          rs.push(p[0]); gs.push(p[1]); bs.push(p[2]);
        }
      }
    }
  }
  if (!rs.length) return KEY_RGB;
  const med = (a) => { a.sort((m, n) => m - n); return a[a.length >> 1]; };
  return [med(rs), med(gs), med(bs), 255];
}

/** 抠底色:声明了 `keyColor` 的格以该色为参照,否则沿用约定品红。参照色在容差内够得到实测底色
 *  就改用实测值(已验证的 digits/crest 逐字节不变;贴边板格边是内容、非底色,洪水播种天然不启动、
 *  板保持完整)。够不到时,仅当实测底色属品红族(绿道最低且红蓝够亮)才改用它救回漂移的图标格,
 *  否则判定格边是内容→退回参照色,板不被吃掉。 */
function pickKeyColor(im, r, keyRgb) {
  const m = cornerMedian(im, r);
  if (dist2(m, keyRgb) < KEY_TOL * KEY_TOL) return keyRgb;
  const magentaFamily = m[1] <= Math.min(m[0], m[2]) * 0.6 && Math.max(m[0], m[2]) >= 90;
  return magentaFamily ? m : keyRgb;
}

/**
 * 抹字:`erase = [nx, ny, nw, nh]` 是相对格框的归一化矩形,把它整块填成矩形一圈外沿(1px 环)的众数色。
 * 用于把生成器烘进按钮 / 横幅里的文案抹掉 —— 文字落在面上,环取到的正是面色;金线与角饰都在环外,
 * 不受影响。抹字发生在抠底之前、重采样之前,所以缩图后不留任何字形残影。
 */
function eraseRect(im, r, nrm) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const x0 = r.x0 + Math.round(w * nrm[0]), y0 = r.y0 + Math.round(h * nrm[1]);
  const x1 = r.x0 + Math.round(w * (nrm[0] + nrm[2])), y1 = r.y0 + Math.round(h * (nrm[1] + nrm[3]));
  const bins = new Map();
  const push = (x, y) => {
    if (x < r.x0 || y < r.y0 || x >= r.x1 || y >= r.y1) return;
    const p = get(im, x, y);
    const k = `${p[0] >> 3},${p[1] >> 3},${p[2] >> 3}`;
    const hit = bins.get(k);
    if (hit) { hit.n++; hit.acc[0] += p[0]; hit.acc[1] += p[1]; hit.acc[2] += p[2]; }
    else bins.set(k, { n: 1, acc: [p[0], p[1], p[2]] });
  };
  for (let x = x0 - 1; x <= x1; x++) { push(x, y0 - 1); push(x, y1); }
  for (let y = y0; y < y1; y++) { push(x0 - 1, y); push(x1, y); }
  let best = null;
  for (const v of bins.values()) if (!best || v.n > best.n) best = v;
  if (!best) return;
  const c = [Math.round(best.acc[0] / best.n), Math.round(best.acc[1] / best.n), Math.round(best.acc[2] / best.n), 255];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(im, x, y, c);
}

/**
 * 透明心:`hole = n` 把 art 盒四边各内缩 n 之内的像素 alpha 清零,只留一圈框。
 * 给行板用 —— 主界面关卡行框下铺战场窗景、委托行框下铺风景带,框心必须透出去;
 * 其余屏的行板透心后露出的是面板暗面,与示意图的暗蓝行面同调。n 取框线(金线 + 墨边)的厚度。
 */
function clearHole(art, n) {
  for (let y = n; y < art.h - n; y++) for (let x = n; x < art.w - n; x++) art.rgba[(y * art.w + x) * 4 + 3] = 0;
}

/**
 * 向上扩图:`extendTop = n` 在 art 之上再长 n 行,新行 = 顶带两侧天色与 art 顶行(横向盒滤后)按 t³ 渐混
 * (夜空 / 暗面这类顶部近乎均匀的件用;建筑落在底部,扩出来的是天),量化在扩图之后跑,
 * 拉伸出的过渡色都会落回色表,不留缝。用于把横幅比例的景填进更高的盒而主体仍贴底居中。
 */
function extendTop(art, n, band) {
  const out = img(art.w, art.h + n);
  const b = Math.max(1, Math.min(band, art.h));
  // 天色:顶带两侧各 1/4 宽的像素均值(避开中央的塔尖 / 光柱)
  const acc = [0, 0, 0];
  let cnt = 0;
  for (let y = 0; y < b; y++) for (let x = 0; x < art.w; x++) {
    if (x >= art.w / 4 && x <= (art.w * 3) / 4) continue;
    const p = get(art, x, y);
    acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; cnt++;
  }
  const sky = cnt ? acc.map((v) => v / cnt) : [0, 0, 0];
  // 新行:天色(越靠顶越暗 25%)与 art 顶行按 t² 混合 —— 接缝处 = 顶行原色,往上光柱渐隐进天色,不拉条纹
  // 顶行先横向 13 格盒滤(窄条不再往上拉成细线),再按 t³ 渐混进天色
  const R = 6;
  const tops = [];
  for (let x = 0; x < art.w; x++) {
    const a = [0, 0, 0];
    let m = 0;
    for (let dx = -R; dx <= R; dx++) {
      const xx = Math.min(art.w - 1, Math.max(0, x + dx));
      const p = get(art, xx, 0);
      a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; m++;
    }
    tops.push([a[0] / m, a[1] / m, a[2] / m]);
  }
  for (let y = 0; y < n; y++) {
    const t = (y + 1) / (n + 1);
    const w = t * t * t;
    const dark = 0.75 + 0.25 * t;
    for (let x = 0; x < art.w; x++) {
      const top = tops[x];
      put(out, x, y, [
        Math.round(sky[0] * dark * (1 - w) + top[0] * w),
        Math.round(sky[1] * dark * (1 - w) + top[1] * w),
        Math.round(sky[2] * dark * (1 - w) + top[2] * w),
        255,
      ]);
    }
  }
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) put(out, x, y + n, get(art, x, y));
  return out;
}

function processOne(src, spec, sheetRect) {
  const base = decodePNG(fs.readFileSync(src));
  const r = sheetRect || { x0: 0, y0: 0, x1: base.w, y1: base.h };
  const im = { w: base.w, h: base.h, rgba: Buffer.from(base.rgba) };
  if (spec.wm !== false) inpaintRect(im, r, spec.wm || WM_DEFAULT, spec.wmFill || cfg.wmFill || "row");
  if (spec.erase) eraseRect(im, r, spec.erase);
  if (spec.keyout === "alpha") {
    // 透明底源图(生成器自带去背景导出):不做色键,按 alpha 阈值硬化后走同一条腐蚀
    alphaKey(im, r, spec.alphaMin ?? 128);
    erodeAlpha(im, r, spec.erode ?? KEY_ERODE, spec.legacyErode === true);
  } else if (spec.keyout !== false) {
    const bg = pickKeyColor(im, r, spec.keyColor ? hexToRgb(spec.keyColor) : KEY_RGB);
    keyOut(im, r, bg, spec.tolerance ?? KEY_TOL);
    if (spec.keyGlobal) keyGlobalOut(im, r, bg, spec.tolerance ?? KEY_TOL);
    erodeAlpha(im, r, spec.erode ?? KEY_ERODE, spec.legacyErode === true);
  }
  let box = spec.cropBBox === false ? r : alphaBBox(im, r) || r;
  /**
   * `crop = [nx, ny, nw, nh]`:相对内容包围盒的归一化子框。同一张全身图既出战斗小人(整框)
   * 又出半身像(上部子框),两枚贴图取自同一幅画,样貌天然一致;半身像配 fit=cover 铺满 art 盒。
   */
  if (spec.crop) {
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const c = spec.crop;
    box = {
      x0: box.x0 + Math.round(bw * c[0]), y0: box.y0 + Math.round(bh * c[1]),
      x1: box.x0 + Math.round(bw * (c[0] + c[2])), y1: box.y0 + Math.round(bh * (c[1] + c[3])),
    };
  }
  const bboxAspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  let [artW, artH] = spec.art || [0, 0];
  if (spec.artH) {
    artH = spec.artH;
    artW = Math.max(2 * (spec.slice || 0) + 8, Math.round(bboxAspect * artH));
  }
  let { im: art, coverage } = resample(im, box, artW, artH, spec.fit || "contain", spec.fillBox === true);
  if (spec.extendTop) {
    art = extendTop(art, spec.extendTop, spec.extendBand ?? 48);
    artH += spec.extendTop;
  }
  quantize(art, spec.dither !== false);
  /** `flipX`:水平镜像。基线单位件一律面朝右(引擎按朝向翻转),生成器偶尔给出朝左的角色,在此掰正 */
  if (spec.flipX) {
    for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w >> 1; x++) {
      const a = (y * art.w + x) * 4, b = (y * art.w + (art.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) { const t = art.rgba[a + k]; art.rgba[a + k] = art.rgba[b + k]; art.rgba[b + k] = t; }
    }
  }
  if (spec.slice) flattenSlices(art, spec.slice, spec.flatCenter === true);
  if (spec.hole) clearHole(art, spec.hole);
  return { art, coverage, box, artW, artH, bboxAspect };
}

const jobs = [];
for (const sheet of cfg.sheets || []) {
  const src = resolveSrc(path.resolve(ROOT, sheet.src));
  const probe = decodePNG(fs.readFileSync(src));
  const cols = sheet.grid.cols, rows = sheet.grid.rows;
  const inset = sheet.inset ?? 0;
  // rects = 逐格的整幅坐标框,长度与 cells 等齐。生成器的雪碧图常出现格距不等宽、
  // 相邻格共用一条外描边这类情形,均匀 grid + inset 对不上格线;用它直接钉格,
  // 免得为一次出图另存派生源件。缺省仍走 grid/inset 等分,既有批次逐字节不变。
  const rects = sheet.rects || null;
  /**
   * atlas 模式:`atlas: "anim_xxx"` + `cellArt: [w, h]`,不写 cells —— 网格里每一格都是同一角色的一帧,
   * 全部按同一 art 盒、不裁内容框(cropBBox=false,否则各帧脚位会跳)处理,最后按 grid 原位拼成一张图集
   * `<atlas>.png`(宽 = cols×w,高 = rows×h),不落单格文件。布局约定见 game/ui/spriteAnim.ts。
   */
  if (sheet.atlas && sheet.cells) {
    // 显式 cells 的图集:补齐 atlas 缺省(同 art、不裁框、无水印),并允许键名省略
    sheet.cells = sheet.cells.map((c, i) => ({ key: `${sheet.atlas}__${i}`, art: sheet.cellArt, cropBBox: false, wm: false, ...(sheet.cellSpec || {}), ...c }));
  }
  if (sheet.atlas && !sheet.cells) {
    sheet.cells = Array.from({ length: cols * rows }, (_, i) => ({
      key: `${sheet.atlas}__${i}`, art: sheet.cellArt, cropBBox: false, wm: false, ...(sheet.cellSpec || {}),
    }));
  }
  if (rects && rects.length !== sheet.cells.length) throw new Error(`${sheet.src}: rects 长度须与 cells 等齐(${sheet.cells.length})`);
  sheet.cells.forEach((cell, i) => {
    let rect;
    /** 逐格另指源图与框(`cell.src` / `cell.rect`):图集的各帧可以来自不同的生成结果(八方向图 + 走路帧图) */
    const cellSrc = cell.src ? resolveSrc(path.resolve(ROOT, cell.src)) : src;
    if (cell.rect) {
      const q = cell.rect;
      rect = { x0: q[0], y0: q[1], x1: q[2], y1: q[3] };
    } else if (rects) {
      const q = rects[i];
      rect = { x0: q[0], y0: q[1], x1: q[2], y1: q[3] };
    } else {
      const cx = i % cols, cy = (i / cols) | 0;
      const cw = probe.w / cols, ch = probe.h / rows;
      rect = {
        x0: Math.round(cx * cw + cw * inset),
        x1: Math.round((cx + 1) * cw - cw * inset),
        y0: Math.round(cy * ch + ch * inset),
        y1: Math.round((cy + 1) * ch - ch * inset),
      };
    }
    const inherit = {};
    for (const k of ["keyGlobal", "tolerance", "keyColor", "wm", "keyout", "alphaMin"]) if (sheet[k] !== undefined) inherit[k] = sheet[k];
    const spec = { ...inherit, ...cell };
    /**
     * `insetPx`：手钉 rects 常把生成器的品红抗锯齿晕一并框进来。晕色（如 #5a0647）离约定品红
     * 太远，洪水抠底抓不到，量化后落成品红族假色贴在贴图边上。四边各内缩 insetPx 源像素把它甩在框外。
     */
    const ip = spec.insetPx ?? 0;
    const rect2 = ip ? { x0: rect.x0 + ip, y0: rect.y0 + ip, x1: rect.x1 - ip, y1: rect.y1 - ip } : rect;
    // atlasCols / atlasRows:图集输出布局(缺省 = 源网格);技能特效分镜出的是 3×2 板,引擎要的是 1×6 帧带
    jobs.push({ key: cell.key, src: cellSrc, spec, rect: rect2, atlas: sheet.atlas ? { key: sheet.atlas, cols: sheet.atlasCols ?? cols, rows: sheet.atlasRows ?? rows, index: i } : null });
  });
}
for (const one of cfg.singles || []) {
  /** `rect`：单图源整幅带生成器边框（如四周一圈灰底、中间才是品红场）时，手钉内容框，
   *  让抠底播种、水印内缩和 alpha bbox 都只在场内跑，不必另存派生源件。 */
  const q = one.rect;
  const rect = q ? { x0: q[0], y0: q[1], x1: q[2], y1: q[3] } : null;
  jobs.push({ key: one.key, src: resolveSrc(path.resolve(ROOT, one.src)), spec: one, rect });
}

const results = [];
const warnings = [];
/** atlas 键 → { cols, rows, parts: index → art } */
const atlases = new Map();
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const job of jobs) {
  if (ONLY && !ONLY.includes(job.key) && !(job.spec.keys || []).some((k) => ONLY.includes(k)) && !(job.atlas && ONLY.includes(job.atlas.key))) continue;
  if (job.spec.frozen) {
    console.log(`[frozen] ${job.key} 跳过：源图已冻结/丢失，保留已入库贴图`);
    continue;
  }
  const { art, coverage, bboxAspect, artW, artH } = processOne(job.src, job.spec, job.rect);
  if (job.atlas) {
    const a = atlases.get(job.atlas.key) || { cols: job.atlas.cols, rows: job.atlas.rows, parts: new Map() };
    a.parts.set(job.atlas.index, art);
    atlases.set(job.atlas.key, a);
    if (coverage < 0.05) warnings.push(`${job.key}: 覆盖率 ${(coverage * 100).toFixed(1)}% 偏低,该帧疑似空格或被抠底吃掉`);
    continue;
  }
  const k = job.spec.export ?? EXPORT;
  const png = encodePNG(art.w * k, art.h * k, k === 1 ? art.rgba : upscale(art, k).rgba);
  const colors = new Set();
  for (let i = 0; i < art.rgba.length; i += 4) if (art.rgba[i + 3]) colors.add(`${art.rgba[i]},${art.rgba[i + 1]},${art.rgba[i + 2]}`);
  const names = [job.key, ...(job.spec.keys || [])];
  for (const name of names) {
    if (!flagOn("dry")) fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), png);
    results.push({ key: name, art, bytes: png.length, colors: colors.size, coverage });
  }
  if (coverage < 0.18) warnings.push(`${names.join("/")}: 覆盖率 ${(coverage * 100).toFixed(1)}% 偏低,疑似抠底吃掉了内容`);
  if (Math.abs(bboxAspect - artW / artH) / (artW / artH) > 0.45) {
    warnings.push(`${names.join("/")}: 内容长宽比 ${bboxAspect.toFixed(2)} 与 art 盒 ${(artW / artH).toFixed(2)} 差 >45%,重采样会失真`);
  }
  if (job.spec.slice) {
    const m = job.spec.slice;
    let centre = 0, offCentre = 0, distinct = 0, verdict = "中块-";
    if (art.w > m * 2 && art.h > m * 2) {
      const bins = new Map();
      for (let y = m; y < art.h - m; y++) for (let x = m; x < art.w - m; x++) {
        const p = get(art, x, y);
        const k = `${p[0]},${p[1]},${p[2]}`;
        bins.set(k, (bins.get(k) || 0) + 1); centre++;
      }
      let top = 0;
      for (const n of bins.values()) if (n > top) top = n;
      offCentre = centre ? Math.round(((centre - top) / centre) * 100) : 0;
      distinct = bins.size;
      verdict = `中块 ${distinct} 色/离众数 ${offCentre}%${job.spec.flatCenter ? "(已平整)" : ""}`;
    }
    console.log(`  ${names.join("/")}: art ${artW}x${artH} slice=${m} → 逻辑 border=${m * MODULE}px, flatCenter=${!!job.spec.flatCenter}, ${verdict}`);
  }
}

/* atlas 合成:各格按 grid 原位拼进一张图,格尺寸取该 atlas 的 cellArt(所有格同尺寸);缺帧留透明并告警 */
for (const [key, a] of atlases) {
  const any = a.parts.values().next().value;
  if (!any) continue;
  const cw = any.w, ch = any.h;
  const sheet = img(a.cols * cw, a.rows * ch);
  let missing = 0;
  for (let i = 0; i < a.cols * a.rows; i++) {
    const part = a.parts.get(i);
    if (!part) { missing++; continue; }
    if (part.w !== cw || part.h !== ch) throw new Error(`${key}: 第 ${i} 格 ${part.w}x${part.h} 与图集格 ${cw}x${ch} 不等`);
    const ox = (i % a.cols) * cw, oy = ((i / a.cols) | 0) * ch;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) put(sheet, ox + x, oy + y, get(part, x, y));
  }
  if (missing) warnings.push(`${key}: 图集缺 ${missing} 格(ONLY 只选了部分格?),缺格留透明`);
  const png = encodePNG(sheet.w, sheet.h, sheet.rgba);
  if (!flagOn("dry")) fs.writeFileSync(path.join(OUT_DIR, `${key}.png`), png);
  const colors = new Set();
  for (let i = 0; i < sheet.rgba.length; i += 4) if (sheet.rgba[i + 3]) colors.add(`${sheet.rgba[i]},${sheet.rgba[i + 1]},${sheet.rgba[i + 2]}`);
  results.push({ key, art: sheet, bytes: png.length, colors: colors.size, coverage: 1 });
  console.log(`  [atlas] ${key}: ${a.cols}×${a.rows} 格 × ${cw}x${ch} → ${sheet.w}x${sheet.h}`);
}

if (flagOn("contact") && results.length) {
  fs.mkdirSync(CONTACT_DIR, { recursive: true });
  const pad = 6, cols = Math.min(4, results.length);
  const maxW = Math.max(...results.map((r) => r.art.w));
  const maxH = Math.max(...results.map((r) => r.art.h));
  const rowsN = Math.ceil(results.length / cols);
  const sheet = img(cols * (maxW + pad) + pad, rowsN * (maxH + pad) + pad, [40, 44, 56, 255]);
  results.forEach((r, i) => {
    const on = compositeOnChecker(r.art);
    const ox = pad + (i % cols) * (maxW + pad), oy = pad + ((i / cols) | 0) * (maxH + pad);
    for (let y = 0; y < on.h; y++) for (let x = 0; x < on.w; x++) put(sheet, ox + x, oy + y, get(on, x, y));
  });
  const big = upscale(sheet, 3);
  const contactPath = path.join(CONTACT_DIR, "contact.png");
  fs.writeFileSync(contactPath, encodePNG(big.w, big.h, big.rgba));
  console.log(`联络表: ${path.relative(ROOT, contactPath)} (${big.w}x${big.h}, 棋盘底=透明)`);
}

console.table(results.map((r) => ({
  key: r.key,
  art: `${r.art.w}x${r.art.h}`,
  逻辑: `${r.art.w * MODULE}x${r.art.h * MODULE}`,
  B: r.bytes,
  色数: r.colors,
  覆盖率: `${(r.coverage * 100).toFixed(0)}%`,
})));
if (warnings.length) {
  console.log("\n警告:");
  for (const w of warnings) console.log("  - " + w);
}
console.log(`输出目录: ${path.relative(ROOT, OUT_DIR)}  (${results.length} 张, 共 ${results.reduce((a, b) => a + b.bytes, 0)} B)`);
