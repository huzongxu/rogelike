/**
 * 像素绘制小工具:给 scripts/pixel-chrome.mjs 用的确定性画布与调色板。
 * 纯 Node,零依赖;颜色一律走 artwork/pixel-kit.json 的 33 色深渊蓝黑表(名字见 PAL)。
 */

import { hexToRgb } from "./png.mjs";

/** 33 色表按语义命名:阶调从深到浅,五个色族各四档 */
export const PAL = {
  // 深渊蓝黑基阶(7)
  ink: "#05070c",
  deep: "#0b0e14",
  navy0: "#121826",
  navy1: "#1a2233",
  navy2: "#232e44",
  slate0: "#2a3548",
  slate1: "#38465e",
  // 阶调与高光(6)
  steel0: "#4a5a76",
  steel1: "#62738f",
  steel2: "#8391a8",
  steel3: "#a9b4c4",
  bone0: "#c8cdd6",
  bone1: "#e8ecf4",
  // 回响·翠(4)
  teal0: "#0e3b36",
  teal1: "#17624f",
  teal2: "#2e9e7f",
  teal3: "#4dffc8",
  // 神秘·紫(4)
  violet0: "#2b1f47",
  violet1: "#4b3a7a",
  violet2: "#8a6fd1",
  violet3: "#c8b6ff",
  // 黄金(4)
  gold0: "#4a3410",
  gold1: "#8a6220",
  gold2: "#d9a63c",
  gold3: "#ffd76a",
  // 危险·赤(4)
  red0: "#3a1218",
  red1: "#7a1f2a",
  red2: "#c0374a",
  red3: "#ff5a6e",
  // 寒冰·蓝(4)
  blue0: "#10294a",
  blue1: "#1f4e8a",
  blue2: "#2f7fd1",
  blue3: "#4aa3ff",
};

const RGB = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, [...hexToRgb(v), 255]]));

/** 颜色参数:调色板名 / 十六进制 / null(透明) */
export function color(c) {
  if (c == null) return [0, 0, 0, 0];
  if (Array.isArray(c)) return c;
  if (RGB[c]) return RGB[c];
  if (typeof c === "string" && c[0] === "#") return [...hexToRgb(c), 255];
  throw new Error(`未知颜色: ${c}`);
}

export class Canvas {
  constructor(w, h, fill = null) {
    this.w = w;
    this.h = h;
    this.rgba = Buffer.alloc(w * h * 4);
    if (fill) this.rect(0, 0, w, h, fill);
  }
  idx(x, y) {
    return (y * this.w + x) * 4;
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const p = color(c);
    this.rgba.set(p, this.idx(x, y));
  }
  get(x, y) {
    const i = this.idx(x, y);
    return [this.rgba[i], this.rgba[i + 1], this.rgba[i + 2], this.rgba[i + 3]];
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  hline(x0, x1, y, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }
  vline(x, y0, y1, c) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }
  /** 空心矩形(1px 描边) */
  frame(x, y, w, h, c) {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }
  /** 把字符位图贴上来:rows 为等长字符串,legend 把字符映射到颜色;'.' 与 ' ' 为透明 */
  blit(x, y, rows, legend) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === "." || ch === " ") continue;
        const c = legend[ch];
        if (c === undefined) throw new Error(`位图字符 '${ch}' 无颜色映射`);
        this.set(x + i, y + j, c);
      }
    });
  }
  /** 水平镜像(x 轴对称)拷贝左半到右半 */
  mirrorX() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w >> 1; x++) this.rgba.set(this.get(x, y), this.idx(this.w - 1 - x, y));
  }
  /** 垂直镜像(y 轴对称)拷贝上半到下半 */
  mirrorY() {
    for (let y = 0; y < this.h >> 1; y++) for (let x = 0; x < this.w; x++) this.rgba.set(this.get(x, y), this.idx(x, this.h - 1 - y));
  }
  /** 整数倍最近邻放大 */
  scaled(k) {
    const out = new Canvas(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.rgba.set(this.get((x / k) | 0, (y / k) | 0), out.idx(x, y));
    return out;
  }
  /** 把 src 贴进来(alpha>0 才覆盖) */
  paste(src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const p = src.get(i, j);
      if (p[3] > 0) this.set(x + i, y + j, p);
    }
  }
  /** 列出用到的颜色数 */
  colorCount() {
    const s = new Set();
    for (let i = 0; i < this.rgba.length; i += 4) if (this.rgba[i + 3]) s.add(`${this.rgba[i]},${this.rgba[i + 1]},${this.rgba[i + 2]}`);
    return s.size;
  }
}

/**
 * 九宫格一致性自检:切边带(inset)之外的中段,上/下带每行、左/右带每列颜色必须恒定,
 * 中块必须单色(centerRows 档放宽为逐行恒色);否则 Cocos SLICED 拉伸会出条纹。返回违例描述数组(空 = 通过)。
 */
export function checkNineSlice(cv, inset, { centerRows = false } = {}) {
  const bad = [];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  const xs = [];
  for (let x = inset; x < cv.w - inset; x++) xs.push(x);
  const ys = [];
  for (let y = inset; y < cv.h - inset; y++) ys.push(y);
  for (const y of [...Array(inset).keys(), ...Array.from({ length: inset }, (_, i) => cv.h - inset + i)]) {
    const ref = cv.get(xs[0], y);
    for (const x of xs) if (!same(cv.get(x, y), ref)) { bad.push(`横带 y=${y} 在 x=${x} 变色`); break; }
  }
  for (const x of [...Array(inset).keys(), ...Array.from({ length: inset }, (_, i) => cv.w - inset + i)]) {
    const ref = cv.get(x, ys[0]);
    for (const y of ys) if (!same(cv.get(x, y), ref)) { bad.push(`竖带 x=${x} 在 y=${y} 变色`); break; }
  }
  if (xs.length && ys.length) {
    if (centerRows) {
      // 中块允许逐行变化(如卡框的品质横带:视图按拉伸比例换算行位),但每行必须恒色
      for (const y of ys) {
        const ref = cv.get(xs[0], y);
        for (const x of xs) if (!same(cv.get(x, y), ref)) { bad.push(`中块 y=${y} 在 x=${x} 变色`); break; }
      }
    } else {
      const ref = cv.get(xs[0], ys[0]);
      outer: for (const y of ys) for (const x of xs) if (!same(cv.get(x, y), ref)) { bad.push(`中块在 (${x},${y}) 非单色`); break outer; }
    }
  }
  return bad;
}
