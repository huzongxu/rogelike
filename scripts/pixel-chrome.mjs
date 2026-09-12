/**
 * 界面 chrome 程序化像素出图:按钮 / 面板 / 行板 / 双坞 / 技能槽 / 胶囊条 / 横幅 / 品质卡框 /
 * 进度条 / 页签条 / 返回钮 / 入口·敌情·套组小图标。
 *
 *   node scripts/pixel-chrome.mjs [--config=artwork/pixel-kit-chrome.json] [--out=dir]
 *                                 [--only=k1,k2] [--contact=path.png] [--dry] [--force]
 *
 * 规则(与 docs/UI-PIXEL-REFRESH.md §3 / §13.3 同源):
 *   - 同名键覆盖,PNG 尺寸与既有贴图逐字节等尺寸(不等则拒绝写入,除非 --force);
 *     切边(viewTable.nineSlice.keys)因此不必改,视图层零改动。
 *   - 颜色只取 33 色深渊蓝黑表(scripts/lib/pixel-draw.mjs:PAL)。
 *   - 九宫格件生成后跑 checkNineSlice():上下带逐行恒色、左右带逐列恒色、中块单色,
 *     违例即退出非零 —— Cocos SLICED 只拉伸这三块,任何纹理都会被拉成条纹。
 *   - 全流程确定性,同配置重跑逐字节一致。
 */

import fs from "node:fs";
import path from "node:path";
import { decodePNG, encodePNG, hexToRgb } from "./lib/png.mjs";
import { Canvas, checkNineSlice, color } from "./lib/pixel-draw.mjs";
import { BITMAPS, LEGEND } from "./lib/pixel-bitmaps.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const flagOn = (name) => argv.includes(`--${name}`);
const CONFIG = path.resolve(ROOT, argOf("config", "artwork/pixel-kit-chrome.json"));
const OUT_DIR = path.resolve(ROOT, argOf("out", "cocos/assets/resources/textures"));
const ONLY = argOf("only", "") ? argOf("only").split(",").filter(Boolean) : null;
const CONTACT = argOf("contact", "");
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));

/* ------------------------------ 九宫格斜面板 ------------------------------ */

/**
 * 斜面板:每个像素取到四条边的最短距离 d,按「上 → 左 → 下 → 右」的优先序选边,
 * 颜色 = 该边序列[d],序列用尽落到 face。上/左为受光边、下/右为阴影边,四角自然成 45° 拼缝。
 * 上下带每行、左右带每列因此恒色,中块恒为 face —— 正是 SLICED 拉伸要求的形状。
 */
function bevel(spec) {
  const { w, h } = spec;
  const cv = new Canvas(w, h);
  const arrs = { top: spec.top || [], left: spec.left || [], bottom: spec.bottom || [], right: spec.right || [] };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = { top: y, left: x, bottom: h - 1 - y, right: w - 1 - x };
      const m = Math.min(d.top, d.left, d.bottom, d.right);
      const edge = ["top", "left", "bottom", "right"].find((e) => d[e] === m);
      cv.set(x, y, arrs[edge][m] ?? spec.face);
    }
  }
  return cv;
}

/** 角上的像素切除(corner=1 切角点,2 切三个像素)与倒角(chamfer=n:x+y<n 透明,=n 墨线) */
function cutCorners(cv, corner, chamfer, spec) {
  const { w, h } = cv;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
      const s = dx + dy;
      if (chamfer) {
        if (s < chamfer) cv.set(x, y, null);
        else if (s === chamfer) cv.set(x, y, "ink");
        else if (s === chamfer + 1) cv.set(x, y, (y < h / 2 ? spec.top : spec.bottom)[1] ?? spec.face);
      } else if (corner && s < corner) cv.set(x, y, null);
    }
  }
}

const RIVET = {
  steel: { hi: "steel3", lo: "steel0" },
  teal: { hi: "teal3", lo: "teal1" },
  gold: { hi: "gold3", lo: "gold1" },
  goldDim: { hi: "gold2", lo: "gold0" },
};

/** 铆钉/角饰色族:"accent" 取格子上由 withAccent() 写入的赛季主色,其余查 RIVET 表 */
function rivetFamily(fam, spec) {
  if (fam === "accent") {
    if (!spec.accent) throw new Error(`${spec.key}: 用了 accent 色族但格子没有 seasonAccent`);
    return spec.accent;
  }
  const c = RIVET[fam];
  if (!c) throw new Error(`未知色族: ${fam}`);
  return c;
}

/**
 * 赛季主色代入:把格子里的 A1/A2/A3(暗/中/亮)换成主题三档,并把 RIVET.accent 指到该主题。
 * 主题表在规格顶层 seasonAccents.themes,与 game/data/seasonSets.ts 的 THEMES 同序。
 */
function withAccent(spec, theme) {
  const [lo, mid, hi] = theme;
  const sub = (arr) => (arr || []).map((c) => (c === "A1" ? lo : c === "A2" ? mid : c === "A3" ? hi : c));
  return { ...spec, accent: { hi, lo: mid }, top: sub(spec.top), left: sub(spec.left), bottom: sub(spec.bottom), right: sub(spec.right), face: sub([spec.face])[0] };
}

/** 一格展开成的产物列表:[{ names, spec }],带 seasonAccent 的格子出 t0(基名)+ t1..t3(<key>_t<n>) */
function expand(spec) {
  const names = [spec.key, ...(spec.keys || [])];
  if (!spec.seasonAccent) return [{ names, spec }];
  const themes = (cfg.seasonAccents && cfg.seasonAccents.themes) || [];
  if (themes.length < 2) throw new Error(`${spec.key}: seasonAccent 需要规格顶层 seasonAccents.themes`);
  return themes.map((theme, i) => ({ names: i === 0 ? names : names.map((n) => `${n}_t${i}`), spec: withAccent(spec, theme) }));
}

/** 四角铆钉:2×2 亮面 + 右下暗点 + 一圈墨影,钉在距角 3px 处(始终落在角块内) */
function rivets(cv, fam, spec) {
  const c = rivetFamily(fam, spec);
  const put = (ox, oy, sx, sy) => {
    // (ox, oy) 角块原点,(sx, sy) 朝向板心的步进符号
    const P = (i, j, col) => cv.set(ox + sx * i, oy + sy * j, col);
    P(3, 3, c.hi); P(4, 3, c.hi); P(3, 4, c.hi); P(4, 4, c.lo);
    P(5, 3, "ink"); P(5, 4, "ink"); P(3, 5, "ink"); P(4, 5, "ink"); P(5, 5, "ink");
  };
  put(0, 0, 1, 1);
  put(cv.w - 1, 0, -1, 1);
  put(0, cv.h - 1, 1, -1);
  put(cv.w - 1, cv.h - 1, -1, -1);
}

/**
 * 大面板四角的小角饰:两臂各 9px、2px 厚的钢色 L 形贴在描边内侧,肘部一枚 3×3 菱形宝石。
 * 刻意只占角块最外 12px:各屏内容从屏边 14~16px 起排,面板本身落在 16px,32px 的切边带
 * 几乎整条都压在文字与图标之下,任何深入带内的装饰都会顶到内容。
 */
function caps(cv, fam, spec) {
  const gem = rivetFamily(fam, spec);
  const put = (ox, oy, sx, sy) => {
    const P = (i, j, col) => cv.set(ox + sx * i, oy + sy * j, col);
    for (let i = 2; i <= 10; i++) { P(i, 2, "steel3"); P(i, 3, "steel1"); }
    for (let j = 2; j <= 10; j++) { P(2, j, "steel3"); P(3, j, "steel1"); }
    P(11, 2, "ink"); P(11, 3, "ink"); P(2, 11, "ink"); P(3, 11, "ink");
    for (let k = 4; k <= 10; k++) { P(k, 4, "ink"); P(4, k, "ink"); }
    // 肘部宝石:中心亮、四邻中档、外圈墨线
    P(5, 5, gem.hi); P(6, 5, gem.lo); P(5, 6, gem.lo); P(6, 6, gem.hi);
    P(7, 5, "ink"); P(7, 6, "ink"); P(5, 7, "ink"); P(6, 7, "ink"); P(7, 7, "ink");
  };
  put(0, 0, 1, 1);
  put(cv.w - 1, 0, -1, 1);
  put(0, cv.h - 1, 1, -1);
  put(cv.w - 1, cv.h - 1, -1, -1);
}

function plate(spec) {
  const cv = bevel(spec);
  cutCorners(cv, spec.corner ?? 0, spec.chamfer ?? 0, spec);
  if (spec.rivet) rivets(cv, spec.rivet, spec);
  if (spec.cap) caps(cv, spec.cap, spec);
  return cv;
}

/* ------------------------------ 品质卡框 ------------------------------ */

const FRAME_IRON = {
  face: "navy0",
  top: ["ink", "steel1", "slate1", "navy2", "navy1", "slate0", "navy1", "navy1"],
  left: ["ink", "steel0", "slate0", "navy2", "navy1", "slate0", "navy1", "navy1"],
  bottom: ["ink", "deep", "navy0", "navy1", "navy1", "deep", "navy1", "navy1"],
  right: ["ink", "deep", "navy0", "navy1", "navy1", "deep", "navy1", "navy1"],
};

/**
 * 卡框 = 铁质斜面板 + 品质横带。横带落在可拉伸带内(行位 ribbon 由 viewTable.cardFrame 读取),
 * 因此只在中段列 [inset, w−inset) 上画且逐行恒色;左右切边带那几列不碰,保持逐列恒色。
 */
function cardFrame(spec) {
  const cv = plate({ ...FRAME_IRON, w: spec.w, h: spec.h, corner: 1, rivet: "steel" });
  const [r0, r1] = spec.ribbon;
  const [lo, mid, hi] = spec.quality;
  const x0 = spec.inset, x1 = spec.w - spec.inset - 1;
  for (let y = r0; y <= r1; y++) {
    let c = mid;
    if (y === r0 || y === r1 || y === r1 - 1) c = "ink";
    else if (y === r0 + 1 || y === r0 + 2) c = hi;
    else if (y === r1 - 2 || y === r1 - 3) c = lo;
    cv.hline(x0, x1, y, c);
  }
  return cv;
}

/* ------------------------------ 绸带横幅(整图拉伸) ------------------------------ */

/** 绸带:主体三阶 + 顶亮线 + 底暗线,两端折入暗档并剪出燕尾 */
function ribbon(spec) {
  const { w, h, fold } = spec;
  const [lo, midA, midB, hi] = spec.tones;
  const cv = new Canvas(w, h);
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    let c = midA;
    if (y === 0 || y === h - 1) c = "ink";
    else if (y === 1) c = hi;
    else if (y === 2) c = midB;
    else if (y === h - 2 || y === h - 3) c = lo;
    cv.hline(0, w - 1, y, c);
  }
  // 两端:折痕墨线 + 折入的暗档 + 燕尾缺口
  for (const side of [0, 1]) {
    const X = (x) => (side ? w - 1 - x : x);
    for (let x = 0; x < fold; x++) {
      for (let y = 1; y < h - 1; y++) {
        const dy = Math.abs(y - cy);
        const t = fold - 2 - x; // 缺口半高:越靠端越深
        if (t >= 0 && dy <= t) cv.set(X(x), y, null);
        else if (t >= -1 && dy <= t + 1) cv.set(X(x), y, "ink");
        else if (x < fold - 1) cv.set(X(x), y, y === 1 ? midB : y >= h - 3 ? "ink" : lo);
        else cv.set(X(x), y, "ink");
      }
    }
    cv.set(X(fold), 1, hi);
  }
  if (spec.stars) {
    // 固定坐标的星点(确定性),只落在主体带内
    const pts = [[0.12, 0.35], [0.2, 0.7], [0.31, 0.3], [0.42, 0.62], [0.5, 0.4], [0.6, 0.72], [0.69, 0.33], [0.8, 0.6], [0.88, 0.4]];
    for (const [fx, fy] of pts) {
      const x = fold + Math.round((w - 2 * fold - 1) * fx), y = 3 + Math.round((h - 7) * fy);
      cv.set(x, y, spec.stars);
    }
  }
  return cv;
}

/* ------------------------------ 其它 ------------------------------ */

function bar(spec) {
  const cv = new Canvas(spec.w, spec.h);
  spec.tones.forEach((c, y) => cv.hline(0, spec.w - 1, y, c));
  return cv;
}

function tabs(spec) {
  const cv = new Canvas(spec.w, spec.h);
  const tabW = (spec.w - spec.gap * (spec.count - 1)) / spec.count;
  if (!Number.isInteger(tabW)) throw new Error(`tabs: (${spec.w} − ${spec.gap}×${spec.count - 1}) 不能被 ${spec.count} 整除`);
  const one = plate({
    w: tabW, h: spec.h, corner: 1, face: "navy1",
    top: ["ink", "steel1", "slate0"], left: ["ink", "slate1"], bottom: ["ink", "deep"], right: ["ink", "navy0"],
  });
  for (let i = 0; i < spec.count; i++) cv.paste(one, i * (tabW + spec.gap), 0);
  return cv;
}

function bitmap(spec) {
  const rows = BITMAPS[spec.key];
  if (!rows) throw new Error(`缺少位图: ${spec.key}`);
  if (rows.length !== spec.h || rows.some((r) => r.length !== spec.w)) {
    throw new Error(`${spec.key}: 位图 ${rows[0].length}×${rows.length} 与规格 ${spec.w}×${spec.h} 不符`);
  }
  const cv = new Canvas(spec.w, spec.h);
  cv.blit(0, 0, rows, LEGEND);
  return cv;
}


/* ------------------------------ v4「深渊铭刻」:铁骨金饰框 / 勋章 / 关卡窗景 ------------------------------ */

/** 框族三阶:受光 / 正 / 阴影 */
const FRAME_TONES = {
  iron: { hi: "steel3", mid: "steel1", lo: "slate1" },
  gold: { hi: "gold3", mid: "gold2", lo: "gold1" },
  bone: { hi: "bone1", mid: "steel3", lo: "steel1" },
};

/**
 * 框:外墨线 → 亮/暗棱 → 正色 → 内墨线 → 内晕(可选)→ face(可选,缺省透明中心)。
 * 颜色只按「到最近边的距离」定,因此九宫格四带逐行/逐列恒色;铆钉只钉在四角块内。
 * 透明中心配合视图里先画的窗景 / 立绘,实现「框压在画面上」。
 */
function frameKind(spec) {
  const T = FRAME_TONES[spec.tone || "iron"];
  if (!T) throw new Error(`${spec.key}: 未知 tone ${spec.tone}`);
  const { w, h } = spec;
  const cv = new Canvas(w, h);
  // transparent:整图透明(分区条只留文字,占位保住 sectionStripReady 的几何分支)
  if (spec.transparent) return cv;
  const rings = [["ink"], [T.hi, T.lo], [T.mid], ["ink"]];
  if (spec.glow) rings.push([spec.glow]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y), d = Math.min(dx, dy);
    if (dx + dy < (spec.corner ?? 2)) continue;
    if (d >= rings.length) { if (spec.face) cv.set(x, y, spec.face); continue; }
    const lit = dy <= dx ? y < h / 2 : x < w / 2;
    const r = rings[d];
    cv.set(x, y, r.length === 1 ? r[0] : lit ? r[0] : r[1]);
  }
  if (spec.rivet) {
    const c = rivetFamily(spec.rivet, spec);
    const put = (cx, cy) => { cv.frame(cx - 1, cy - 1, 4, 4, "ink"); cv.set(cx, cy, c.hi); cv.set(cx + 1, cy, c.hi); cv.set(cx, cy + 1, c.hi); cv.set(cx + 1, cy + 1, c.lo); };
    put(3, 3); put(w - 5, 3); put(3, h - 5); put(w - 5, h - 5);
  }
  return cv;
}

/** 圆勋章:外墨圈 → 亮/暗环 → 正色环 → 内墨圈 → 深色心;顶部一枚尖饰 */
function medal(spec) {
  const T = FRAME_TONES[spec.tone || "iron"];
  const { w, h } = spec;
  const cv = new Canvas(w, h);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, R = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > R) continue;
    let c;
    if (d > R - 1) c = "ink";
    else if (d > R - 3) c = y < cy ? T.hi : T.lo;
    else if (d > R - 5) c = T.mid;
    else if (d > R - 6) c = "ink";
    else c = d > R - 11 ? "navy0" : "deep";
    cv.set(x, y, c);
  }
  cv.set(Math.floor(cx), 0, T.hi); cv.set(Math.ceil(cx), 0, T.hi); cv.set(Math.floor(cx) - 1, 1, T.mid); cv.set(Math.ceil(cx) + 1, 1, T.mid);
  return cv;
}

/**
 * 关卡窗景:从战场背景贴图裁一条横带(1:1 像素),再压一层左深右浅的暗罩给文字留读面,
 * 最后量化回该背景批的调色板(artwork/pixel-kit-bg.json,56 档),保证仍是像素档。
 */
const BG_PAL = (() => {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(ROOT, "artwork/pixel-kit-bg.json"), "utf8"));
  return (cfg.palette || []).map(hexToRgb);
})();
function sceneCrop(spec) {
  const im = decodePNG(fs.readFileSync(path.resolve(ROOT, "cocos/assets/resources/textures", `${spec.src}.png`)));
  const { w, h } = spec;
  const x0 = spec.x0 ?? Math.floor((im.w - w) / 2), y0 = spec.y0 ?? 0;
  if (x0 < 0 || y0 < 0 || x0 + w > im.w || y0 + h > im.h) throw new Error(`${spec.key}: 取景框越出 ${spec.src}`);
  const shade = spec.shade || [0.8, 0.55, 0.25, 0.6]; // 左缘 / 40% / 70% / 右缘 的压暗强度
  const ink = hexToRgb("#05070c");
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
  const d2 = (a, b) => { const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return dr * dr * 0.9 + dg * dg * 1.1 + db * db * 0.8; };
  const cv = new Canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * im.w + x0 + x) * 4;
    const t = x / (w - 1);
    const k = t < 0.4 ? shade[0] + (shade[1] - shade[0]) * (t / 0.4) : t < 0.7 ? shade[1] + (shade[2] - shade[1]) * ((t - 0.4) / 0.3) : shade[2] + (shade[3] - shade[2]) * ((t - 0.7) / 0.3);
    const p = [0, 1, 2].map((c) => im.rgba[i + c] * (1 - k) + ink[c] * k);
    let i0 = 0, i1 = 0, d0 = Infinity, d1 = Infinity;
    for (let j = 0; j < BG_PAL.length; j++) { const d = d2(BG_PAL[j], p); if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = j; } else if (d < d1) { d1 = d; i1 = j; } }
    let pick = i0;
    if (i0 !== i1) {
      const c0 = BG_PAL[i0], c1 = BG_PAL[i1];
      const v = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]], nn = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      const f = nn ? ((p[0] - c0[0]) * v[0] + (p[1] - c0[1]) * v[1] + (p[2] - c0[2]) * v[2]) / nn : 0;
      if (f > BAYER[y & 3][x & 3]) pick = i1;
    }
    cv.set(x, y, [...BG_PAL[pick], 255]);
  }
  return cv;
}

const KINDS = { plate, cardFrame, ribbon, bar, tabs, bitmap, frame: frameKind, medal, sceneCrop };

/* ------------------------------ 主流程 ------------------------------ */

function existingSize(file) {
  if (!fs.existsSync(file)) return null;
  const im = decodePNG(fs.readFileSync(file));
  return { w: im.w, h: im.h };
}

const results = [];
let failed = 0;
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const one of cfg.singles) {
  for (const { names, spec } of expand(one)) {
    if (ONLY && !names.some((k) => ONLY.includes(k))) continue;
    const gen = KINDS[spec.kind];
    if (!gen) throw new Error(`${spec.key}: 未知 kind ${spec.kind}`);
    const cv = gen(spec);
    if (cv.w !== spec.w || cv.h !== spec.h) throw new Error(`${spec.key}: 生成 ${cv.w}×${cv.h} ≠ 规格 ${spec.w}×${spec.h}`);
    const issues = [];
    if (spec.inset) issues.push(...checkNineSlice(cv, spec.inset, { centerRows: spec.kind === "cardFrame" }));
    for (const name of names) {
      const file = path.join(OUT_DIR, `${name}.png`);
      const prev = existingSize(file);
      if (prev && (prev.w !== cv.w || prev.h !== cv.h) && !flagOn("force")) {
        issues.push(`尺寸 ${cv.w}×${cv.h} 与既有 ${name}.png ${prev.w}×${prev.h} 不符(切边表按旧尺寸定,--force 才覆盖)`);
      }
    }
    if (issues.length) {
      failed++;
      console.error(`✗ ${names.join("/")}`);
      for (const s of issues) console.error(`    ${s}`);
      continue;
    }
    const png = encodePNG(cv.w, cv.h, cv.rgba);
    for (const name of names) {
      if (!flagOn("dry")) fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), png);
      results.push({ key: name, kind: spec.kind, size: `${cv.w}×${cv.h}`, inset: spec.inset ?? "-", colors: cv.colorCount(), bytes: png.length, cv });
    }
  }
}

if (CONTACT && results.length) {
  // 接触表:每键最近邻 3×,紫灰底(与任何贴图主色都不同,便于看边缘)
  const K = 3, PAD = 12;
  const uniq = results.filter((r, i) => results.findIndex((q) => q.cv === r.cv) === i);
  const cellW = Math.min(1500, Math.max(...uniq.map((r) => r.cv.w * K)));
  const cols = Math.max(1, Math.floor(1500 / (cellW + PAD)));
  const heights = uniq.map((r) => r.cv.h * K);
  const rowsN = Math.ceil(uniq.length / cols);
  const rowH = [];
  for (let r = 0; r < rowsN; r++) rowH.push(Math.max(...heights.slice(r * cols, r * cols + cols)));
  const W = cols * (cellW + PAD) + PAD, H = rowH.reduce((a, b) => a + b + PAD, PAD);
  const sheet = new Canvas(W, H, [90, 60, 110, 255]);
  let y = PAD;
  uniq.forEach((r, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    if (c === 0 && i) y += rowH[row - 1] + PAD;
    sheet.paste(r.cv.scaled(K), PAD + c * (cellW + PAD), y);
  });
  fs.mkdirSync(path.dirname(path.resolve(ROOT, CONTACT)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, CONTACT), encodePNG(sheet.w, sheet.h, sheet.rgba));
  console.log(`接触表: ${CONTACT} (${sheet.w}×${sheet.h})`);
}

console.table(results.map(({ cv, ...r }) => r));
console.log(`输出目录: ${path.relative(ROOT, OUT_DIR)}  (${results.length} 张, 共 ${results.reduce((a, b) => a + b.bytes, 0)} B)${flagOn("dry") ? "  [dry]" : ""}`);
if (failed) {
  console.error(`\n${failed} 键未通过自检,未写入。`);
  process.exit(1);
}
