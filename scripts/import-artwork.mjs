/**
 * 美术资源导入脚本 —— 把美术图层包 + AI 补全图处理成 public/assets/ 命名资产。
 *
 * 1. 美术图层(Downloads/新建文件夹,108 张)中已覆盖清单的 27 张 → 重命名复制到 public/assets/;
 *    其余图层归档到 artwork/ui-kit/(语义命名),映射见 artwork/MAPPING.md。
 * 2. AI 生成的补全图(vibe_images/):去角落水印 → 敌人精灵抠白底 + 降采样 256 → public/assets/。
 *
 * 纯 Node 实现(内置 zlib),无第三方依赖:
 *   node scripts/import-artwork.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const ART_SRC = "C:/Users/Administrator/Downloads/新建文件夹";
const GEN_SRC = path.join(ROOT, "vibe_images");
const OUT = path.join(ROOT, "public/assets");
const KIT = path.join(ROOT, "artwork/ui-kit");

/* ---------------- PNG 编解码(最小实现,支持 8bit RGB/RGBA) ---------------- */

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a)
    throw new Error("not a PNG");
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6))
        throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const chans = colorType === 6 ? 4 : 3;
  const stride = w * chans;
  const rgba = Buffer.alloc(w * h * 4);
  // unfilter
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
      const si = x * chans, di = (y * w + x) * 4;
      rgba[di] = line[si];
      rgba[di + 1] = line[si + 1];
      rgba[di + 2] = line[si + 2];
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
    raw[y * (w * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 图像处理 ---------------- */

/** 去除右下角 "Qoder AI 生成" 水印:用上方同尺寸区域覆盖角落矩形 */
function patchWatermark(img, rw = 360, rh = 90) {
  const { w, h, rgba } = img;
  const x0 = Math.max(0, w - rw), y0 = Math.max(0, h - rh);
  for (let y = y0; y < h; y++) {
    const srcRow = (y - rh) * w;
    const dstRow = y * w;
    for (let x = x0; x < w; x++) {
      const si = (srcRow + x) * 4, di = (dstRow + x) * 4;
      rgba[di] = rgba[si];
      rgba[di + 1] = rgba[si + 1];
      rgba[di + 2] = rgba[si + 2];
      rgba[di + 3] = rgba[si + 3];
    }
  }
}

/** 从四边洪水填充清除背景色(取四角最亮色为参考),返回裁剪后的图像 */
function cutoutBackground(img, tolerance = 26) {
  const { w, h, rgba } = img;
  const corner = (x, y) => {
    const i = (y * w + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  };
  const corners = [corner(2, 2), corner(w - 3, 2), corner(2, h - 3), corner(w - 3, h - 3)];
  corners.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  const ref = corners[0];
  const isBg = (i) =>
    Math.abs(rgba[i] - ref[0]) <= tolerance &&
    Math.abs(rgba[i + 1] - ref[1]) <= tolerance &&
    Math.abs(rgba[i + 2] - ref[2]) <= tolerance;
  const dead = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!dead[p] && isBg(p * 4)) { dead[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) if (dead[p]) rgba[p * 4 + 3] = 0;
  // 边缘羽化:紧邻透明的高亮像素半透明,减轻硬边
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (dead[p]) continue;
      const i = p * 4;
      const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      if (lum < 210) continue;
      let n = 0;
      if (dead[p - 1]) n++;
      if (dead[p + 1]) n++;
      if (dead[p - w]) n++;
      if (dead[p + w]) n++;
      if (n >= 2) rgba[i + 3] = 110;
    }
  }
}

/** 暗底泛洪抠除:从四边泛洪,删暗且低饱和的背景像素(生成图带深灰/黑渐变底时用) */
function darkFloodCutout(img, lumMax = 110, satMax = 50) {
  const { w, h, rgba } = img;
  const isDarkBg = (i) => {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const lum = (r + g + b) / 3;
    return lum < lumMax && Math.max(r, g, b) - Math.min(r, g, b) < satMax;
  };
  const dead = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!dead[p] && isDarkBg(p * 4)) { dead[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let removed = 0;
  for (let p = 0; p < w * h; p++) if (dead[p]) { rgba[p * 4 + 3] = 0; removed++; }
  return removed;
}

/** 区域平均降采样 */
function downscale(img, nw, nh) {
  const { w, h, rgba } = img;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * h) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * w) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
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

/** 矩形裁切 */
function cropBox(img, [x0, y0, x1, y1]) {
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.rgba.copy(out, y * cw * 4, ((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x1 + 1) * 4);
  }
  return { w: cw, h: ch, rgba: out };
}

/** 按不透明像素收紧包围盒 */
function trimTransparent(img, pad = 2) {
  const { w, h, rgba } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] >= 32) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return cropBox(img, [x0, y0, x1, y1]);
}

/** 等比降采样到最长边 ≤ maxSide */
function downscaleFit(img, maxSide) {
  const m = Math.max(img.w, img.h);
  if (m <= maxSide) return img;
  const nw = Math.round((img.w * maxSide) / m), nh = Math.round((img.h * maxSide) / m);
  return downscale(img, Math.max(1, nw), Math.max(1, nh));
}

/** 按钮板:按亮度投影找板体包围盒(背景为暗色渐变),裁出条带 */
function cropButtonPlate(img, thr = 48, margin = 4) {
  const { w, h, rgba } = img;
  const rowMax = new Float32Array(h);
  const colMax = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11;
      if (lum > rowMax[y]) rowMax[y] = lum;
      if (lum > colMax[x]) colMax[x] = lum;
    }
  }
  let y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
  while (y0 < h && rowMax[y0] < thr) y0++;
  while (y1 > y0 && rowMax[y1] < thr) y1--;
  while (x0 < w && colMax[x0] < thr) x0++;
  while (x1 > x0 && colMax[x1] < thr) x1--;
  y0 = Math.max(0, y0 - margin); y1 = Math.min(h - 1, y1 + margin);
  x0 = Math.max(0, x0 - margin); x1 = Math.min(w - 1, x1 + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    rgba.copy(out, y * cw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4);
  }
  return { w: cw, h: ch, rgba: out };
}

/* ---------------- 映射表 ---------------- */

/** 图层号 → 清单文件名(进 public/assets/) */
const MANIFEST_MAP = {
  5: "icon_gold.png", 6: "icon_echo.png", 7: "icon_stardust.png", 8: "icon_ticket.png", 9: "icon_fragment.png",
  37: "frame_common.png", 38: "frame_rare.png", 39: "frame_epic.png", 40: "frame_legendary.png", 41: "frame_hidden.png",
  49: "icon_set_thorn.png", 50: "icon_set_barrage.png", 51: "icon_set_ember.png",
  3: "avatar_common.png", 1: "avatar_rare.png", 2: "avatar_epic.png", 0: "avatar_legendary.png", 4: "avatar_hidden.png",
  67: "player.png",
  85: "enemy_chaser.png", 90: "enemy_swift.png", 87: "enemy_tank.png", 88: "enemy_elite.png",
  86: "enemy_splitter.png", 89: "enemy_devourer.png", 91: "enemy_summoner.png", 98: "enemy_boss.png",
  // 2026-08-28 UI 全量实装:按钮/横幅/面板/徽章/图标/条/特效/姿态/入口
  11: "btn_close.png", 12: "btn_back.png",
  16: "banner_title_gold_a.png", 17: "banner_title_gold_b.png", 18: "banner_title_gold_c.png", 19: "banner_title_iron.png",
  20: "banner_large_navy_a.png", 21: "banner_large_navy_b.png", 31: "banner_large_red.png", 32: "banner_large_purple.png",
  27: "banner_mid_navy.png", 28: "banner_mid_navy_b.png", 29: "banner_mid_red.png", 30: "banner_mid_black.png",
  33: "banner_mid_iron.png", 34: "banner_mid_blue.png", 35: "banner_mid_red_b.png", 36: "banner_mid_bronze.png",
  45: "banner_purple_cosmic.png",
  23: "badge_shield_bronze.png", 24: "badge_pennant_purple.png", 25: "badge_star_gold.png", 26: "badge_gem_purple.png",
  43: "panel_dark_corners.png", 44: "panel_parchment.png", 46: "tabs_talent_three.png",
  95: "frame_highlight_gold.png", 96: "emblem_flow_gold.png", 97: "mark_check_green.png", 10: "crest_echo.png",
  99: "icon_wechat_share.png",
  58: "affix_space_warp.png", 59: "affix_heal_aura.png", 60: "affix_time_dilation.png", 61: "affix_reflect_field.png",
  62: "affix_death_chain.png", 63: "affix_mist.png", 64: "affix_boss.png",
  54: "intel_horde.png", 55: "intel_armor.png", 56: "intel_mutant.png", 57: "intel_elite.png",
  76: "bar_hp.png", 106: "bar_boss_hp.png", 84: "bar_progress_blue.png", 92: "bar_progress_gold.png",
  100: "bar_progress_purple.png", 102: "bar_progress_teal.png", 101: "bar_progress_blue_b.png",
  93: "bar_pass_nodes.png", 107: "divider_bar_dark.png",
  77: "fx_nova.png", 78: "fx_poison.png", 79: "fx_shield.png", 80: "fx_drain.png",
  81: "fx_blast.png", 82: "fx_chain.png", 83: "fx_summon.png", 94: "proj_lightning.png",
  65: "player_pose_1.png", 66: "player_pose_2.png", 68: "player_pose_4.png", 69: "player_pose_5.png", 70: "player_pose_6.png",
  71: "entry_gacha.png", 72: "entry_talents.png", 73: "entry_pass.png", 74: "entry_quests.png", 75: "entry_forge.png",
};

/** 图层号 → 归档语义名(进 artwork/ui-kit/) */
const KIT_MAP = {
  0: "avatar_frame_legendary.png", 1: "avatar_frame_rare.png", 2: "avatar_frame_epic.png",
  3: "avatar_frame_common.png", 4: "avatar_frame_hidden.png",
  5: "icon_gold.png", 6: "icon_echo.png", 7: "icon_stardust.png", 8: "icon_ticket.png", 9: "icon_fragment.png",
  10: "crest_echo.png",
  11: "btn_close.png", 12: "btn_back.png", 13: "btn_settings.png", 14: "btn_sound_on.png", 15: "btn_sound_off.png",
  16: "banner_title_gold_a.png", 17: "banner_title_gold_b.png", 18: "banner_title_gold_c.png", 19: "banner_title_iron.png",
  20: "banner_large_navy_a.png", 21: "banner_large_navy_b.png",
  22: "avatar_default_silhouette.png", 23: "badge_shield_bronze.png", 24: "badge_pennant_purple.png",
  25: "badge_star_gold_NOTE_selection_box.png", 26: "badge_gem_purple.png",
  27: "banner_mid_navy.png", 28: "banner_mid_navy_b.png", 29: "banner_mid_red.png", 30: "banner_mid_black.png",
  31: "banner_large_red.png", 32: "banner_large_purple.png",
  33: "banner_mid_iron.png", 34: "banner_mid_blue.png", 35: "banner_mid_red_b.png", 36: "banner_mid_bronze.png",
  37: "card_frame_common.png", 38: "card_frame_rare.png", 39: "card_frame_epic.png",
  40: "card_frame_legendary.png", 41: "card_frame_hidden.png",
  42: "panel_equip_grid.png", 43: "panel_dark_corners.png", 44: "panel_parchment.png",
  45: "banner_purple_cosmic.png", 46: "tabs_talent_three.png",
  47: "mock_menu_entries.png", 48: "panel_ranking.png",
  49: "icon_set_thorn.png", 50: "icon_set_barrage.png", 51: "icon_set_ember.png",
  52: "panel_pass_tracks.png", 53: "panel_evolve_slots.png",
  54: "intel_horde.png", 55: "intel_armor.png", 56: "intel_mutant.png", 57: "intel_elite.png",
  58: "affix_space_warp.png", 59: "affix_heal_aura.png", 60: "affix_time_dilation.png",
  61: "affix_reflect_field.png", 62: "affix_death_chain.png", 63: "affix_mist.png", 64: "affix_boss.png",
  65: "player_pose_1.png", 66: "player_pose_2.png", 67: "player_pose_3_main.png",
  68: "player_pose_4.png", 69: "player_pose_5.png", 70: "player_pose_6.png",
  71: "entry_gacha.png", 72: "entry_talents.png", 73: "entry_pass.png", 74: "entry_quests.png", 75: "entry_forge.png",
  76: "bar_hp.png",
  77: "fx_nova.png", 78: "fx_poison.png", 79: "fx_shield.png", 80: "fx_drain.png",
  81: "fx_blast.png", 82: "fx_chain.png", 83: "fx_summon.png",
  84: "bar_progress_blue.png", 92: "bar_progress_gold.png", 100: "bar_progress_purple.png",
  101: "bar_progress_blue_b.png", 102: "bar_progress_teal.png", 93: "bar_pass_nodes.png",
  85: "enemy_chaser.png", 86: "enemy_splitter.png", 87: "enemy_tank.png", 88: "enemy_elite.png",
  89: "enemy_devourer.png", 90: "enemy_swift.png", 91: "enemy_summoner.png", 98: "enemy_boss.png",
  94: "proj_lightning.png", 95: "frame_highlight_gold.png", 96: "emblem_flow_gold.png", 97: "mark_check_green.png",
  99: "icon_wechat_share_NOTE_cropped.png",
  103: "dmgtext_normal.png", 104: "dmgtext_crit.png", 105: "dmgtext_heal.png",
  106: "bar_boss_hp.png", 107: "divider_bar_dark.png",
};

/** AI 生成图:vibe_images 前缀 → 清单文件名;敌人需抠图,按钮裁条带,星图去白底 */
const GEN_MAP = {
  bg_menu: { file: "bg_menu.png" }, bg_outside: { file: "bg_outside.png" }, bg_shop: { file: "bg_shop.png" },
  bg_stage_1: { file: "bg_stage_1.png" }, bg_stage_2: { file: "bg_stage_2.png" },
  bg_stage_3: { file: "bg_stage_3.png" }, bg_stage_4: { file: "bg_stage_4.png" },
  bg_stage_5: { file: "bg_stage_5.png" }, bg_stage_6: { file: "bg_stage_6.png" }, bg_stage_7: { file: "bg_stage_7.png" },
  enemy_reflector: { file: "enemy_reflector.png", sprite: true },
  enemy_hider: { file: "enemy_hider.png", sprite: true },
  enemy_shieldguard: { file: "enemy_shieldguard.png", sprite: true },
  enemy_splitling: { file: "enemy_splitling.png", sprite: true },
  enemy_god: { file: "enemy_god.png", sprite: true },
  enemy_goldkind: { file: "enemy_goldkind.png", sprite: true },
  // 2026-08-28 UI 美术翻新批次:宽幅按钮板(裁中心条带→宽 640)+ 单颗金星(去白底→128²)
  btn_primary: { file: "btn_primary.png", button: true },
  btn_minor: { file: "btn_minor.png", button: true },
  btn_danger: { file: "btn_danger.png", button: true },
  icon_star_gold: { file: "icon_star_gold.png", star: true },
  // 2026-08-29 战斗装备卡效果图标批次:白底抠图 → 96²(与敌人精灵同管线)
  icon_fx_knife: { file: "icon_fx_knife.png", icon: true },
  icon_fx_nova: { file: "icon_fx_nova.png", icon: true },
  icon_fx_skeleton: { file: "icon_fx_skeleton.png", icon: true },
  icon_fx_cloud: { file: "icon_fx_cloud.png", icon: true },
  icon_fx_ray: { file: "icon_fx_ray.png", icon: true, darkbg: true },
  icon_fx_chain: { file: "icon_fx_chain.png", icon: true },
  icon_fx_shield: { file: "icon_fx_shield.png", icon: true },
  icon_fx_drain: { file: "icon_fx_drain.png", icon: true },
  // 2026-08-30 装备升级界面批次:站点一键抠图后拆分;单图走透明底降采样
  gen_entry_gearup: { file: "entry_gearup.png", transparent96: true, size: 48 },
  gen_badge_gear_lv: { file: "badge_gear_lv.png", transparent96: true, size: 32 },
  // 站点「雪碧图拆分」产物:逐件独立透明 PNG,仅修边+等比降采样
  gen_split_00001: { file: "panel_gearup.png", split: true },
  gen_split_00003: { file: "badge_season.png", split: true, maxSide: 128 },
  gen_split_00004: { file: "icon_fx_icelance.png", split: true, maxSide: 96 },
  gen_split_00005: { file: "icon_fx_frost_ring.png", split: true, maxSide: 96 },
  gen_split_00006: { file: "icon_fx_meteor.png", split: true, maxSide: 96 },
  gen_split_00007: { file: "icon_fx_magma_trail.png", split: true, maxSide: 96 },
  gen_split_00008: { file: "icon_fx_haunt_crown.png", split: true, maxSide: 96 },
  gen_split_00009: { file: "icon_fx_spirit_wolves.png", split: true, maxSide: 96 },
  gen_split_00010: { file: "icon_set_frost.png", split: true, maxSide: 96 },
  gen_split_00011: { file: "icon_set_magma.png", split: true, maxSide: 96 },
  gen_split_00012: { file: "icon_set_phantom.png", split: true, maxSide: 96 },
  // 2026-08-30 主菜单翻新批次:关卡行/套组卡/筹码/分区条/说明板 + 重出的无文字售罄印章
  gen_split_00013: { file: "menu_row_plate.png", split: true, maxSide: 1024 },
  gen_split_00014: { file: "menu_row_plate_current.png", split: true, maxSide: 1024 },
  gen_split_00015: { file: "menu_set_plate.png", split: true, maxSide: 384 },
  gen_split_00016: { file: "menu_set_plate_selected.png", split: true, maxSide: 384 },
  gen_split_00017: { file: "card_soldout.png", split: true, maxSide: 256 },
  gen_split_00018: { file: "menu_chip_plate.png", split: true, maxSide: 192 },
  gen_split_00019: { file: "menu_section_strip.png", split: true, maxSide: 512 },
  gen_split_00020: { file: "menu_note_plate.png", split: true, maxSide: 1024 },
};

/* ---------------- 执行 ---------------- */

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(KIT, { recursive: true });

// 1. 美术图层:清单图 → public/assets;全部图层 → artwork/ui-kit
//    源目录缺失时(图层包已清理)从 artwork/ui-kit 归档按 KIT_MAP 名回退复制
const layerFiles = new Map();
const haveSrc = fs.existsSync(ART_SRC);
if (haveSrc) {
  for (const f of fs.readdirSync(ART_SRC)) {
    const m = f.match(/^(\d+) - layer_/);
    if (m) layerFiles.set(parseInt(m[1], 10), f);
  }
} else {
  console.log("[info] 美术源目录缺失,改用 artwork/ui-kit 归档回退复制");
}
let copied = 0, kitted = 0;
for (const [num, f] of layerFiles) {
  const src = path.join(ART_SRC, f);
  const kitName = KIT_MAP[num];
  if (!kitName) { console.warn(`[warn] 图层 ${num} 无归档映射,跳过`); continue; }
  fs.copyFileSync(src, path.join(KIT, kitName));
  kitted++;
  const manifestName = MANIFEST_MAP[num];
  if (manifestName) {
    fs.copyFileSync(src, path.join(OUT, manifestName));
    copied++;
  }
}
if (!haveSrc) {
  for (const [numStr, name] of Object.entries(MANIFEST_MAP)) {
    const kitName = KIT_MAP[parseInt(numStr, 10)];
    if (!kitName) { console.warn(`[warn] 图层 ${numStr} 无归档映射,跳过 ${name}`); continue; }
    const kitPath = path.join(KIT, kitName);
    if (!fs.existsSync(kitPath)) { console.warn(`[warn] 归档缺失 ${kitName},跳过 ${name}`); continue; }
    fs.copyFileSync(kitPath, path.join(OUT, name));
    copied++;
  }
}
console.log(`美术图层: ${copied} 张进 public/assets,${kitted} 张归档 artwork/ui-kit`);

// 2. AI 生成图:去水印(+ 抠图/降采样)→ public/assets
const genFiles = fs.readdirSync(GEN_SRC);
let generated = 0;
for (const [prefix, spec] of Object.entries(GEN_MAP)) {
  const candidates = genFiles
    .filter((f) => (f.startsWith(prefix + "_") || f === prefix + ".png") && f.endsWith(".png"))
    .sort();
  if (!candidates.length) { console.warn(`[warn] 缺生成图 ${prefix}`); continue; }
  const src = path.join(GEN_SRC, candidates[candidates.length - 1]); // 取最新
  let img = decodePNG(fs.readFileSync(src));
  if (spec.split) {
    // 站点雪碧图拆分产物:已是逐件透明底,仅修边+按需等比降采样
    let part = trimTransparent(img);
    if (spec.maxSide) part = downscaleFit(part, spec.maxSide);
    fs.writeFileSync(path.join(OUT, spec.file), encodePNG(part.w, part.h, part.rgba));
    generated++;
    console.log(`拆分素材 ${prefix} → ${spec.file} (${part.w}x${part.h})`);
    continue;
  }
  patchWatermark(img, spec.button ? 420 : 360, spec.button ? 110 : 90);
  if (spec.transparent96) {
    cutoutBackground(img);
    const ts = spec.size ?? 96;
    img = downscale(img, ts, ts);
    fs.writeFileSync(path.join(OUT, spec.file), encodePNG(img.w, img.h, img.rgba));
    generated++;
    console.log(`生成图 ${prefix} → ${spec.file} (${img.w}x${img.h}, 已抠白底)`);
    continue;
  }
  if (spec.sprite) {
    cutoutBackground(img);
    const ss = spec.size ?? 256;
    img = downscale(img, ss, ss);
  }
  if (spec.button) {
    img = cropButtonPlate(img);
    const tw = 640;
    img = downscale(img, tw, Math.max(1, Math.round((img.h * tw) / img.w)));
  }
  if (spec.star) {
    cutoutBackground(img);
    img = downscale(img, 128, 128);
  }
  if (spec.icon) {
    if (spec.darkbg) darkFloodCutout(img);
    cutoutBackground(img);
    const is = spec.size ?? 96;
    img = downscale(img, is, is);
  }
  fs.writeFileSync(path.join(OUT, spec.file), encodePNG(img.w, img.h, img.rgba));
  generated++;
  const tag = spec.sprite ? ", 已抠图" : spec.button ? ", 已裁条带" : spec.star ? ", 已去白底" : spec.icon ? ", 已抠白底" : "";
  console.log(`生成图 ${prefix} → ${spec.file} (${img.w}x${img.h}${tag})`);
}
console.log(`完成: public/assets 现有 ${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length} 张贴图`);
