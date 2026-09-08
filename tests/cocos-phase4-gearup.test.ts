/**
 * Phase 4 第四屏闸门:装备升级屏(星尘消费 + 收藏贡献)。
 *
 * 延续 cocos-phase4-daily / -pass 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `gearup/GearUpModel.ts` 经相对路径 import 的共享层,
 *     与 Web 侧经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),
 *     于是升级成本曲线与收藏贡献表不可能出现"两份抄本";
 *  2. **断言按门控变量分档**:行数 = `min(ownedGear.length, GU_ROWS_MAX)`、
 *     空态 = `ownedGear.length === 0`、截断提示 = `ownedGear.length > GU_ROWS_MAX`、
 *     `afford = !maxed && stardust >= gearUpgradeCost(lv)`、`maxed = lv >= GEAR_UPGRADE_MAX`、
 *     徽记点亮数 = `lv`、钮文取哪一档 = `maxed` —— 全部由存档与共享层常量推出来,
 *     不钉死随表变动的数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `GearUpModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,node 侧不能直载)。
 *
 * 覆盖派单要求的条目:996 与 1246 两档屏高下行不越界、每条文本带落在 0..560、三种形态的
 * 互斥关系、描述行由常量算出来且 `toFixed(0)` 的取整方向与拼接顺序与 Web 一致、
 * `GEAR_UPGRADE_STEP === 0.25` 与 `GEAR_UPGRADE_MAX === 5` 两条锁、升级链的星尘扣减与
 * 等级推进、**点行内非按钮区不产动作**(行左半 / 行右上空隙 / 行间空隙 等五处探针),
 * 以及 Web 的"行 rect 不参与命中"与"等级按装备名索引"两条原样口径。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { COLLECTION_ATK_PCT, GEAR_UPGRADE_MAX, GEAR_UPGRADE_STEP, gearUpgradeCost } from "@game/data/daily";
import { QUALITIES, qualityDef, type Quality } from "@game/data/quality";
import { ASSET_MANIFEST } from "@game/data/assets";
import { fs as FS, rowTextY, spreadRows, theme, ui as UI } from "@game/ui/theme";
import * as sharedDaily from "@game/data/daily";
import {
  evenDown,
  gearBtnHeight,
  gearStarStripW,
  gearUpBackBtn,
  gearUpHeadBandA,
  gearUpHeadBandB,
  gearUpHintBand,
  gearUpLayout,
  gearUpScreenLayout,
  GU_BACK_H,
  GU_BACK_ICON_BOX,
  GU_BACK_ICON_DX,
  GU_BACK_W,
  GU_BACK_Y,
  GU_BTN_H,
  GU_BTN_INSET,
  GU_BTN_V_INSET,
  GU_BTN_W,
  GU_CONTENT_W,
  GU_DUST_RESERVE_W,
  GU_HEAD_A_H,
  GU_HINT_BAND_H,
  GU_LINE1_DY,
  GU_LINE_SPACING,
  GU_LIST_GAP,
  GU_LIST_Y0,
  GU_PAD,
  GU_PANEL_KEY,
  GU_ROW_MAX_H,
  GU_ROW_MIN_H,
  GU_ROW_TEXT_DX,
  GU_ROWS_MAX,
  GU_STAR_BOX,
  GU_STAR_BTN_GAP,
  GU_STAR_GAP,
  GU_STAR_GLYPH_DY,
  GU_SUB_BAND_H,
  GU_SUB_GAP,
  GU_TEXT_SLACK,
  GU_TOP_Y,
  type GuRect,
  type GuTextLine,
} from "@game/ui/gearUpLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import { buildGearUpContent, gearLevelOf, gearUpClaim, hitGearUp, type GearUpSaveView } from "../cocos/assets/scripts/gearup/GearUpModel";
import * as cocosDaily from "../cocos/assets/scripts/game/data/daily";
import * as cocosGearLayout from "../cocos/assets/scripts/game/ui/gearUpLayout";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = GU_PAD;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

function save(over: Partial<GearUpSaveView> = {}): GearUpSaveView {
  return { stardust: 0, gearLevels: {}, ownedGear: [], ...over };
}

/** 一件收藏装备的最小形态(本屏只消费 name 与 quality 两列) */
const gear = (name: string, quality: Quality = "common"): { name: string; quality: Quality } => ({ name, quality });

/** 造 n 件装备(名字互不相同,品质按主表轮转,保证品质轴与等级轴都能铺到) */
function makeGear(n: number): { name: string; quality: Quality }[] {
  return Array.from({ length: n }, (_, i) => gear(`装备${i + 1}`, QUALITIES[i % QUALITIES.length].key));
}

/** 把一件装备的等级摆到 lv */
function atLevel(name: string, lv: number, quality: Quality = "common"): GearUpSaveView {
  return save({ ownedGear: [gear(name, quality)], gearLevels: { [name]: lv } });
}

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const center = (r: GuRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ==================== 0. 端间同一实现与两条常量锁 ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/data/daily 与 @game 解析到同一份升级成本曲线与收藏贡献表(不是两份抄本)", () => {
    expect(cocosDaily.gearUpgradeCost).toBe(gearUpgradeCost);
    expect(cocosDaily.gearUpgradeCost).toBe(sharedDaily.gearUpgradeCost);
    expect(cocosDaily.GEAR_UPGRADE_MAX).toBe(GEAR_UPGRADE_MAX);
    expect(cocosDaily.GEAR_UPGRADE_STEP).toBe(GEAR_UPGRADE_STEP);
    expect(cocosDaily.COLLECTION_ATK_PCT).toBe(COLLECTION_ATK_PCT);
  });

  it("gearUpScreenLayout 就是 gearUpLayout 那一份(几何单一出口只在共享层)", () => {
    expect(cocosGearLayout.gearUpLayout).toBe(gearUpLayout);
    for (const n of [0, 1, 14, 20]) {
      expect(gearUpScreenLayout(W, H_STD, n)).toEqual(gearUpLayout(W, H_STD, n));
      expect(gearUpScreenLayout(W, H_TALL, n)).toEqual(gearUpLayout(W, H_TALL, n));
    }
  });

  it("派单要求的两条常量锁:每级 +25% 贡献、上限 5 级", () => {
    expect(GEAR_UPGRADE_STEP).toBe(0.25);
    expect(GEAR_UPGRADE_MAX).toBe(5);
  });

  it("列表硬截断件数就是 14(提示文案里的那个 14 由此常量插值而来)", () => {
    expect(GU_ROWS_MAX).toBe(14);
  });

  it("升级成本随等级严格递增且为正整数(花费链的分子前提)", () => {
    for (let lv = 0; lv < GEAR_UPGRADE_MAX; lv++) {
      const c = gearUpgradeCost(lv);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
      if (lv > 0) expect(c).toBeGreaterThan(gearUpgradeCost(lv - 1));
    }
  });
});

/* ==================== 1. 三种形态互斥:行数 / 空态 / 截断提示都由 gearCount 推出 ==================== */

describe("整屏三形态(由 ownedGear.length 门控)", () => {
  for (const n of [0, 1, 5, 13, 14, 15, 40]) {
    it(`gearCount = ${n}:rowCount = min(n, ${GU_ROWS_MAX})、empty = (n === 0)、showHint = (n > ${GU_ROWS_MAX})`, () => {
      const L = gearUpLayout(W, H_STD, n);
      expect(L.gearCount).toBe(n);
      expect(L.rowCount).toBe(Math.min(n, GU_ROWS_MAX));
      expect(L.rows).toHaveLength(Math.min(n, GU_ROWS_MAX));
      expect(L.empty).toBe(n === 0);
      expect(L.showHint).toBe(n > GU_ROWS_MAX);
      // 空态:一行都没有,截断提示也不出现(Web 那一支既不画行也不画提示)
      if (n === 0) {
        expect(L.rows).toEqual([]);
        expect(L.showHint).toBe(false);
      }
      // 内容层的三形态与几何层同源(同一个件数推出来的同一批门控)
      const c = buildGearUpContent(save({ ownedGear: makeGear(n) }));
      expect(c.rows).toHaveLength(L.rowCount);
      expect(c.showHint).toBe(L.showHint);
      // 下标与 ownedGear 的原序一一对应(Web 的 row.idx 就是 list 下标)
      L.rows.forEach((row, i) => {
        expect(row.index).toBe(i);
        expect(c.rows[i].index).toBe(i);
        expect(c.rows[i].name).toBe(`装备${i + 1}`);
      });
    });
  }

  it("行距步进 = rowH + spreadRows 的 gap;两者都过 evenDown、gap 落在 4..20(富余摊进行距)", () => {
    for (const n of [1, 5, GU_ROWS_MAX]) {
      const L = gearUpLayout(W, H_STD, n);
      expect(L.rowStep).toBe(L.rowH + L.rowGap);
      expect(evenDown(L.rowH), "行高应为偶数").toBe(L.rowH);
      expect(evenDown(L.rowGap), "行距应为偶数").toBe(L.rowGap);
      expect(L.rowGap).toBeLessThanOrEqual(20);
    }
    // 单行没有"行距"可言:gap 归零、步进等于行高;多行时 gap 有 4 的下限
    expect(gearUpLayout(W, H_STD, 1).rowGap).toBe(0);
    for (const n of [2, GU_ROWS_MAX]) expect(gearUpLayout(W, H_STD, n).rowGap).toBeGreaterThanOrEqual(4);
  });

  it("spreadRows 用五个实参(第六个 maxGap 走默认 20;pass 是六个的 60 —— 两屏不同,不许统一)", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/game/ui/gearUpLayout.ts", import.meta.url), "utf8"));
    const call = /=\s*spreadRows\(([^)]*)\)/.exec(src);
    expect(call, "本屏应有一处 spreadRows 调用").not.toBe(null);
    const args = call![1].split(",").map((s) => s.trim());
    expect(args).toHaveLength(5);
    // 五个实参全部由具名常量/派生量给出(不留裸数字),行区底缘就是贴底提示带的顶缘
    expect(args).toEqual(["rowCount", "listY0", "listBottom", "GU_ROW_MIN_H", "GU_ROW_MAX_H"]);
    expect(GU_ROW_MIN_H).toBe(56);
    expect(GU_ROW_MAX_H).toBe(72);
    // 行高下限必须容得下抬到热区下限的升级钮(上下各留 GU_BTN_V_INSET)
    expect(GU_ROW_MIN_H - GU_BTN_V_INSET).toBeGreaterThanOrEqual(GU_BTN_H);
    expect(GU_BTN_H).toBeGreaterThanOrEqual(UI.touchMin);
    for (const h of [H_STD, H_TALL]) {
      for (const n of [1, 3, GU_ROWS_MAX]) {
        const L = gearUpLayout(W, h, n);
        expect(L.rowH).toBeGreaterThanOrEqual(GU_ROW_MIN_H);
        expect(L.rowH).toBeLessThanOrEqual(GU_ROW_MAX_H);
        expect(L.rowGap).toBeLessThanOrEqual(20);
        const direct = spreadRows(n, L.listY0, L.listBottom, GU_ROW_MIN_H, GU_ROW_MAX_H);
        expect(L.rowH).toBe(evenDown(direct.rowH));
        expect(L.rowGap).toBe(evenDown(direct.gap));
      }
    }
  });
});

/* ==================== 2. 行区在 996 与 1246 两档都不越界、且不与截断提示相碰 ==================== */

describe("行区纵向边界(996 与 1246 两档屏高 × 三种形态)", () => {
  for (const h of [H_STD, H_TALL]) {
    for (const n of [0, 1, 7, GU_ROWS_MAX, GU_ROWS_MAX + 6]) {
      it(`h=${h}、gearCount=${n}:行顶缘 ≥ ${GU_LIST_Y0}、行底缘 ≤ 行区底缘、截断提示带顶缘在末行之下`, () => {
        const L = gearUpLayout(W, h, n);
        const hh = evenDown(h);
        expect(L.listY0).toBe(GU_LIST_Y0);
        expect(L.listBottom).toBe(gearUpHintBand(hh).y);
        for (const row of L.rows) {
          expect(row.rect.x).toBe(PAD);
          expect(row.rect.w).toBe(GU_CONTENT_W);
          expect(row.rect.h).toBe(L.rowH);
          expect(row.rect.y).toBeGreaterThanOrEqual(GU_LIST_Y0);
          expect(row.rect.x).toBeGreaterThanOrEqual(PAD);
          expect(row.rect.x + row.rect.w).toBeLessThanOrEqual(W - PAD);
          expect(row.rect.y + row.rect.h, `行${row.index} 底边`).toBeLessThanOrEqual(L.listBottom);
          expect(row.rect.y).toBe(GU_LIST_Y0 + row.index * L.rowStep);
          // module = 2:行矩形与两行基线、钮矩形全落在栅格上
          for (const v of [row.rect.x, row.rect.y, row.rect.w, row.rect.h, row.name.baseY, row.desc.baseY, row.btn.x, row.btn.y, row.btn.w, row.btn.h]) {
            expect(evenDown(v), `${v} 应为偶数`).toBe(v);
          }
        }
        // 屏底板内缩页边距 16:右缘恒落 544、底缘恒落 evenDown(h) − pad
        expect(L.panel).toEqual({ x: PAD, y: PAD, w: GU_CONTENT_W, h: hh - PAD * 2 });
        expect(L.panel.x + L.panel.w).toBe(W - PAD);
        expect(L.rows.length > 0).toBe(!L.empty);
        // 屏高富余只进末行与贴底提示带之间那条呼吸缝,缝恒非负且就是两者的差
        const lastBottom = L.rows.length ? L.rows[L.rows.length - 1].rect.y + L.rowH : L.listY0;
        expect(L.seamAboveHint).toBe(L.listBottom - lastBottom);
        expect(L.seamAboveHint).toBeGreaterThanOrEqual(0);
        if (L.rows.length) expect(lastBottom).toBeLessThanOrEqual(L.panel.y + L.panel.h);
        if (L.showHint) {
          // 截断提示的文本带顶缘在末行底边之下(两者都会画,不能相碰)
          const band = anchorBand(L.hint.x, L.hint.baseY, L.hint.maxW, L.hint.px, "left", LIFT);
          expect(band.y).toBeGreaterThan(lastBottom);
        }
      });
    }
  }

  it("屏高从 996 抬到 1246:首行 y 不动、行高单调不降,富余全进呼吸缝与贴底件", () => {
    const a = gearUpLayout(W, H_STD, GU_ROWS_MAX);
    const b = gearUpLayout(W, H_TALL, GU_ROWS_MAX);
    expect(b.rows[0].rect.y).toBe(a.rows[0].rect.y);
    expect(b.rowH).toBeGreaterThanOrEqual(a.rowH);
    expect(b.listBottom - a.listBottom).toBe(H_TALL - H_STD);
    expect(b.seamAboveHint).toBeGreaterThanOrEqual(a.seamAboveHint);
    expect(b.hint.baseY - a.hint.baseY).toBe(H_TALL - H_STD);
    expect(b.emptyText.baseY).toBeGreaterThan(a.emptyText.baseY);
    expect(b.backBtn.y).toBe(a.backBtn.y);
    expect(b.panel.h - a.panel.h).toBe(H_TALL - H_STD);
    // 两档都不越界:末行底边 ≤ 行区底缘
    for (const L of [a, b]) expect(L.rows[L.rows.length - 1].rect.y + L.rowH).toBeLessThanOrEqual(L.listBottom);
  });
});

/* ==================== 3. 行内几何:品质框 / 两行文本 / 升级钮 / 徽记带 ==================== */

describe("行内几何(品质框 / 两行文本 / 升级钮 / 徽记带)", () => {
  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:左两行起笔 rect.x + ${GU_ROW_TEXT_DX},基线 l1 = evenDown(mid − ${GU_LINE1_DY}) 与 l1 + ${GU_LINE_SPACING},限宽由徽记带左缘推导`, () => {
      const L = gearUpLayout(W, h, 6);
      for (const row of L.rows) {
        const l1 = evenDown(row.rect.y + row.rect.h / 2 - GU_LINE1_DY);
        expect(row.name.x).toBe(row.rect.x + GU_ROW_TEXT_DX);
        expect(row.desc.x).toBe(row.rect.x + GU_ROW_TEXT_DX);
        expect(row.name.baseY).toBe(l1);
        expect(row.desc.baseY).toBe(l1 + GU_LINE_SPACING);
        // 限宽只有一个事实源:徽记带左缘 − 余量 − 起笔位(不留第二份宽度常量)
        expect(row.name.maxW).toBe(evenDown(row.stars[0].x - GU_TEXT_SLACK - row.name.x));
        expect(row.desc.maxW).toBe(row.name.maxW);
        expect(row.name.px).toBe(FS.body);
        expect(row.desc.px).toBe(FS.micro);
        expect(row.name.align).toBe("left");
        expect(row.desc.align).toBe("left");
        // 两行文本的基线都在行内
        expect(row.name.baseY).toBeGreaterThan(row.rect.y);
        expect(row.desc.baseY).toBeLessThan(row.rect.y + row.rect.h);
      }
    });

    it(`h=${h}:升级钮 = { x: 行右缘 − ${GU_BTN_INSET} − ${GU_BTN_W}, w: ${GU_BTN_W}, h: min(rowH − ${GU_BTN_V_INSET}, ${GU_BTN_H}) } 纵向居中且高 ≥ 热区下限`, () => {
      const L = gearUpLayout(W, h, 6);
      for (const row of L.rows) {
        const btnH = gearBtnHeight(L.rowH);
        expect(row.btn).toEqual({
          x: row.rect.x + row.rect.w - GU_BTN_INSET - GU_BTN_W,
          y: evenDown(row.rect.y + (row.rect.h - btnH) / 2),
          w: GU_BTN_W,
          h: btnH,
        });
        // 热区:钮高恒 ≥ ui.touchMin(旧档 30 低于下限),钮宽不小于钮高
        expect(row.btn.h).toBeGreaterThanOrEqual(UI.touchMin);
        expect(row.btn.w).toBeGreaterThanOrEqual(row.btn.h);
        // 钮右缘距行右缘就是 GU_BTN_INSET,且不出内容宽
        expect(row.rect.x + row.rect.w - (row.btn.x + row.btn.w)).toBe(GU_BTN_INSET);
        expect(row.btn.x + row.btn.w).toBeLessThanOrEqual(W - PAD);
        expect(row.btn.y).toBeGreaterThanOrEqual(row.rect.y);
        expect(row.btn.y + row.btn.h).toBeLessThanOrEqual(row.rect.y + row.rect.h);
        // 钮文居中于钮、基线按 micro 字号垂直居中于钮
        expect(row.btnText.x).toBe(evenDown(row.btn.x + GU_BTN_W / 2));
        expect(row.btnText.baseY).toBe(evenDown(rowTextY(row.btn.y, row.btn.h, FS.micro)));
        expect(row.btnText.px).toBe(FS.micro);
        expect(row.btnText.align).toBe("center");
        expect(row.btnText.maxW).toBe(GU_BTN_W);
      }
    });

    it(`h=${h}:徽记带在按钮左侧,颗数 = GEAR_UPGRADE_MAX、边长 ${GU_STAR_BOX}、缝 ${GU_STAR_GAP}、与钮之间留 ${GU_STAR_BTN_GAP}`, () => {
      const L = gearUpLayout(W, h, 6);
      for (const row of L.rows) {
        expect(row.stars).toHaveLength(GEAR_UPGRADE_MAX);
        const strip = gearStarStripW();
        expect(strip).toBe(GEAR_UPGRADE_MAX * GU_STAR_BOX + (GEAR_UPGRADE_MAX - 1) * GU_STAR_GAP);
        const sx0 = row.btn.x - strip - GU_STAR_BTN_GAP;
        const sy0 = evenDown(row.rect.y + (row.rect.h - GU_STAR_BOX) / 2);
        row.stars.forEach((star, s) => {
          expect(star).toEqual({ x: sx0 + s * (GU_STAR_BOX + GU_STAR_GAP), y: sy0, w: GU_STAR_BOX, h: GU_STAR_BOX });
          expect(star.x + star.w).toBeLessThanOrEqual(row.btn.x - GU_STAR_BTN_GAP);
          // module = 2:每颗徽记的 x/y 都在栅格上(旧的 3px 颗间缝会算出奇数)
          expect(evenDown(star.x), `徽记 x ${star.x}`).toBe(star.x);
          expect(evenDown(star.y), `徽记 y ${star.y}`).toBe(star.y);
        });
        // 缺图回退的文字星:基线 = sy0 + starS − 2,字号 micro,左对齐于该颗左沿
        expect(row.starGlyphBaseY).toBe(sy0 + GU_STAR_BOX - GU_STAR_GLYPH_DY);
        expect(row.starGlyphPx).toBe(FS.micro);
        // 徽记带与描述行文本带互不相碰(限宽的右界在首颗徽记之前)
        expect(row.desc.x + row.desc.maxW).toBeLessThan(row.stars[0].x);
        // 徽记带与行左沿相切不出行
        expect(sx0).toBeGreaterThan(row.rect.x);
      }
    });
  }

  it("品质框矩形就是行矩形(四个值直接交给 qualityBox)", () => {
    const L = gearUpLayout(W, H_STD, 3);
    L.rows.forEach((row) => {
      expect(row.rect.h).toBe(L.rowH);
      // 行矩形只用于绘制:它与升级钮共面而更大,命中只认 btn(见第 8 节五处探针)
      expect(row.rect.x).toBeLessThan(row.btn.x);
      expect(row.rect.y).toBeLessThan(row.btn.y);
    });
  });
});

/* ==================== 4. 屏级矩形与三处头部文本 ==================== */

describe("屏级几何(面板 / 标题 / 副标题 / 星尘 / 空态 / 截断提示 / 返回钮)", () => {
  it("屏底板键是 panel_dark_corners(与已重排各屏同一张九宫格):没有回落键、没有切深常量、视图只调一次 show", () => {
    const L = gearUpLayout(W, H_STD, 0);
    expect(L.panelKey).toBe("panel_dark_corners");
    expect(GU_PANEL_KEY).toBe("panel_dark_corners");
    expect(Object.keys(L)).not.toContain("panelKeyFallback");
    expect(ASSET_MANIFEST.panel_dark_corners).toBe("panel_dark_corners.png");
    // 旧世代未像素化的专属底板退役:几何层与视图层都不再出现它的键与切深常量
    const lay = codeOf(readFileSync(new URL("../cocos/assets/scripts/game/ui/gearUpLayout.ts", import.meta.url), "utf8"));
    expect(lay.includes("panel_gearup")).toBe(false);
    expect(lay.includes("GU_PANEL_NINE")).toBe(false);
    const view = codeOf(readFileSync(new URL("../cocos/assets/scripts/gearup/GearUpView.ts", import.meta.url), "utf8"));
    expect(view.includes("panel_gearup")).toBe(false);
    expect(view.includes("panelKeyFallback")).toBe(false);
    expect(view.match(/this\.panel\.show\(/g)).toHaveLength(1);
    // 贴图文件本身不删(退役清单里记账),只是不再被消费
    expect(ASSET_MANIFEST.panel_gearup).toBe("panel_gearup.png");
  });

  it("头部两带:A 带标题与返回钮同带、B 带副标题与星尘同带;星尘右末笔落 w − pad", () => {
    const L = gearUpLayout(W, H_STD, 1);
    const bandA = gearUpHeadBandA();
    const bandB = gearUpHeadBandB();
    expect(bandA).toEqual({ x: PAD, y: GU_TOP_Y, w: GU_CONTENT_W, h: GU_HEAD_A_H });
    expect(bandB).toEqual({ x: PAD, y: bandA.y + bandA.h + GU_SUB_GAP, w: GU_CONTENT_W, h: GU_SUB_BAND_H });
    expect(L.title).toMatchObject({ x: PAD, baseY: evenDown(rowTextY(bandA.y, bandA.h, FS.title)), px: FS.title, align: "left" });
    expect(L.subtitle).toMatchObject({ x: PAD, baseY: evenDown(rowTextY(bandB.y, bandB.h, FS.muted)), px: FS.muted, align: "left" });
    expect(L.stardust).toMatchObject({ x: W - PAD, baseY: evenDown(rowTextY(bandB.y, bandB.h, FS.body)), px: FS.body, align: "right" });
    // 三条基线都在栅格上、且各落在自己那一带之内
    for (const t of [L.title, L.subtitle, L.stardust]) expect(evenDown(t.baseY), `${t.baseY} 应为偶数`).toBe(t.baseY);
    expect(L.title.baseY).toBeGreaterThan(bandA.y);
    expect(L.title.baseY).toBeLessThan(bandA.y + bandA.h);
    for (const t of [L.subtitle, L.stardust]) {
      expect(t.baseY).toBeGreaterThan(bandB.y);
      expect(t.baseY).toBeLessThan(bandB.y + bandB.h);
    }
    // 限宽各自收到邻居之前:标题→返回钮左缘,副标题→星尘预留宽
    expect(L.title.maxW).toBe(evenDown(L.backBtn.x - GU_TEXT_SLACK - PAD));
    expect(L.subtitle.maxW).toBe(evenDown(GU_CONTENT_W - GU_DUST_RESERVE_W - GU_TEXT_SLACK));
    expect(L.stardust.maxW).toBe(GU_DUST_RESERVE_W);
    // 列表顶缘在 B 带之下,且副标题基线在列表顶缘之上
    expect(L.listY0).toBe(bandB.y + bandB.h + GU_LIST_GAP);
    expect(GU_LIST_Y0).toBeGreaterThan(L.subtitle.baseY);
  });

  it("本屏没有标题横幅:几何里不产出横幅矩形(与 daily / pass 的横幅档不同)", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/game/ui/gearUpLayout.ts", import.meta.url), "utf8"));
    expect(src.includes("headerPlate")).toBe(false);
    expect(src.includes("banner_title")).toBe(false);
    expect(src.includes("skinHeader")).toBe(false);
    const L = gearUpLayout(W, H_STD, 1);
    expect(Object.keys(L)).not.toContain("headerPlate");
    expect(Object.keys(L).some((k) => k.toLowerCase().includes("banner"))).toBe(false);
  });

  it("空态基线居中于行区、截断提示落在恒定让位的贴底带里", () => {
    for (const h of [H_STD, H_TALL]) {
      const hh = evenDown(h);
      const L = gearUpLayout(W, h, GU_ROWS_MAX + 3);
      const band = gearUpHintBand(hh);
      // 提示带恒定让出:底缘落 evenDown(h) − pad,与 showHint 在不在无关
      expect(band).toEqual({ x: PAD, y: hh - PAD - GU_HINT_BAND_H, w: GU_CONTENT_W, h: GU_HINT_BAND_H });
      expect(L.listBottom).toBe(band.y);
      expect(L.emptyText).toMatchObject({ x: PAD, baseY: evenDown(rowTextY(L.listY0, L.listBottom - L.listY0, FS.body)), px: FS.body, align: "left" });
      expect(L.hint).toMatchObject({ x: PAD, baseY: evenDown(rowTextY(band.y, band.h, FS.micro)), px: FS.micro, align: "left" });
      expect(L.hint.baseY).toBeGreaterThan(band.y);
      expect(L.hint.baseY).toBeLessThan(band.y + band.h);
      expect(L.emptyText.baseY).toBeGreaterThan(L.listY0);
      expect(L.emptyText.baseY).toBeLessThan(L.listBottom);
    }
  });

  it("返回钮:热区 ≥ ui.touchMin、右缘落 w − pad、图标取 art 整倍档并纵向居中", () => {
    const L = gearUpLayout(W, H_STD, 1);
    expect(GU_BACK_Y).toBe(GU_TOP_Y);
    expect(GU_BACK_H).toBeGreaterThanOrEqual(UI.touchMin);
    expect(evenDown(GU_BACK_H)).toBe(GU_BACK_H);
    expect(L.backBtn).toEqual(gearUpBackBtn(W));
    expect(L.backBtn).toEqual({ x: W - PAD - GU_BACK_W, y: GU_BACK_Y, w: GU_BACK_W, h: GU_BACK_H });
    expect(L.backBtn.x + L.backBtn.w).toBe(W - PAD);
    // 图标边长 = btn_back 固有 11×11 art px × module 2(不做非整倍缩放)
    expect(GU_BACK_ICON_BOX).toBe(22);
    expect(L.backIcon).toEqual({
      x: L.backBtn.x + GU_BACK_ICON_DX,
      y: evenDown(L.backBtn.y + (GU_BACK_H - GU_BACK_ICON_BOX) / 2),
      w: GU_BACK_ICON_BOX,
      h: GU_BACK_ICON_BOX,
    });
    expect(L.backTextBare.x).toBe(evenDown(L.backBtn.x + GU_BACK_W / 2));
    expect(L.backTextWithIcon.x).toBe(evenDown(L.backIcon.x + GU_BACK_ICON_BOX + (GU_BACK_W - GU_BACK_ICON_DX - GU_BACK_ICON_BOX) / 2));
    expect(L.backTextWithIcon.maxW).toBe(GU_BACK_W - GU_BACK_ICON_DX - GU_BACK_ICON_BOX);
    for (const t of [L.backTextBare, L.backTextWithIcon]) {
      expect(t.baseY).toBe(evenDown(rowTextY(L.backBtn.y, L.backBtn.h, FS.body)));
      expect(t.px).toBe(FS.body);
      expect(t.align).toBe("center");
    }
  });

  it("星尘读数不再被返回钮盖住:文本带顶缘在钮底缘之下,标题带右界在钮左缘之前", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = gearUpLayout(W, h, 0);
      const band = anchorBand(L.stardust.x, L.stardust.baseY, L.stardust.maxW, L.stardust.px, "right", LIFT);
      expect(band.x + band.w).toBe(W - PAD);
      expect(band.y).toBeGreaterThanOrEqual(L.backBtn.y + L.backBtn.h);
      const tb = anchorBand(L.title.x, L.title.baseY, L.title.maxW, L.title.px, "left", LIFT);
      expect(tb.x + tb.w).toBeLessThanOrEqual(L.backBtn.x);
    }
  });
});

/* ==================== 5. 全网格文本带落在 0..560(右对齐的星尘与两档返回钮尤其) ==================== */

interface TextRequest {
  at: string;
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: TextAlign;
}

const bandOf = (t: TextRequest): Band => anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
const lineReq = (at: string, l: GuTextLine): TextRequest => ({ at, x: l.x, baseY: l.baseY, maxW: l.maxW, px: l.px, align: l.align });
/** 徽记缺图时那一颗的文字星:左对齐于该颗左沿、限宽就是徽记边长 */
const starReq = (at: string, star: GuRect, row: { starGlyphBaseY: number; starGlyphPx: number }): TextRequest =>
  lineReq(at, { x: star.x, baseY: row.starGlyphBaseY, maxW: star.w, px: row.starGlyphPx, align: "left" });

/** 逐条对应 GearUpView.sync 里的 Txt.set 调用(空态与截断提示按各自门控收) */
function textBands(h: number, gearCount: number): TextRequest[] {
  const L = gearUpLayout(W, h, gearCount);
  const out: TextRequest[] = [
    lineReq("标题", L.title),
    lineReq("副标题", L.subtitle),
    lineReq("星尘", L.stardust),
    lineReq("返回钮(有图标)", L.backTextWithIcon),
    lineReq("返回钮(缺图标)", L.backTextBare),
  ];
  if (L.empty) out.push(lineReq("空态提示", L.emptyText));
  if (L.showHint) out.push(lineReq("截断提示", L.hint));
  L.rows.forEach((row, i) => {
    out.push(lineReq(`行${i}名字`, row.name), lineReq(`行${i}描述`, row.desc), lineReq(`行${i}钮文`, row.btnText));
    row.stars.forEach((star, s) => out.push(starReq(`行${i}徽记${s}`, star, row)));
  });
  return out;
}

describe("文本带右界(gearUpLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    expect([alignAx("left"), alignAx("center"), alignAx("right")]).toEqual([0, 0.5, 1]);
    const b = (align: TextAlign) => anchorBand(300, 58, 160, FS.muted, align, LIFT);
    expect(b("left").x).toBe(300);
    expect(b("center").x + b("center").w / 2).toBe(300);
    expect(b("right").x + b("right").w).toBe(300);
  });

  it("两档屏高 × 三形态 × 全部行:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      for (const n of [0, 1, GU_ROWS_MAX, GU_ROWS_MAX + 8]) {
        const L = gearUpLayout(W, h, n);
        const bands = textBands(h, n);
        const perRow = 3 + GEAR_UPGRADE_MAX;
        expect(bands.length, `h=${h} n=${n}`).toBe(5 + (L.empty ? 1 : 0) + (L.showHint ? 1 : 0) + L.rowCount * perRow);
        const bad = bands
          .map((t) => {
            const b = bandOf(t);
            return b.x < 0 || b.x + b.w > W ? `${t.at} [${t.align}] 锚点${t.x} 限宽${t.maxW} → ${b.x}..${b.x + b.w}` : null;
          })
          .filter((s): s is string => !!s);
        expect(bad).toEqual([]);
      }
    }
  });

  it("星尘右对齐:带末笔贴 w − pad,不越右界(Phase 3 的翻车点)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = gearUpLayout(W, h, 1);
      const b = bandOf(lineReq("星尘", L.stardust));
      expect(b.x + b.w, "末笔 = 右界锚点").toBe(W - PAD);
      expect(b.x).toBeGreaterThanOrEqual(0);
      // 钮文居中档:带中心 = 锚点,整条带子仍在按钮之内
      const row = L.rows[0];
      const cb = bandOf(lineReq("钮文", row.btnText));
      expect(cb.x + cb.w / 2).toBe(row.btn.x + row.btn.w / 2);
      expect(cb.x).toBeGreaterThanOrEqual(row.btn.x);
      expect(cb.x + cb.w).toBeLessThanOrEqual(row.btn.x + row.btn.w);
    }
  });

  it("左两行限宽收到徽记带之前,每颗文字星各占自己那格的宽", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = gearUpLayout(W, h, GU_ROWS_MAX);
      for (const row of L.rows) {
        for (const line of [row.name, row.desc]) expect(bandOf(lineReq("左段", line)).x + bandOf(lineReq("左段", line)).w).toBeLessThanOrEqual(row.stars[0].x);
        row.stars.forEach((star, s) => {
          const b = bandOf(starReq("徽记", star, row));
          expect(b.x).toBe(star.x);
          expect(b.x + b.w).toBe(star.x + GU_STAR_BOX);
          const next = row.stars[s + 1];
          if (next) expect(b.x + b.w).toBeLessThanOrEqual(next.x);
        });
      }
    }
  });
});

/* ==================== 6. 内容:逐字文案 ==================== */

describe("屏级文案逐字(对标 Web drawGearUp 的 fillText 实参)", () => {
  it("标题 / 星尘 / 返回 三条逐字", () => {
    const c = buildGearUpContent(save({ stardust: 1234 }));
    expect(c.title).toBe("装备升级");
    expect(c.stardustText).toBe("❋ 1234");
    expect(c.backText).toBe("返回");
  });

  it("副标题的字面量锁:与由 STEP / MAX 插值出来的同一串逐字相同,且两条常量各自锁死", () => {
    const c = buildGearUpContent(save());
    expect(c.subtitle).toBe("收藏装备 · 永久基础数值(每级 +25% 贡献,上限 5 级)");
    expect(c.subtitle).toBe(`收藏装备 · 永久基础数值(每级 +${GEAR_UPGRADE_STEP * 100}% 贡献,上限 ${GEAR_UPGRADE_MAX} 级)`);
    expect(GEAR_UPGRADE_STEP).toBe(0.25);
    expect(GEAR_UPGRADE_MAX).toBe(5);
  });

  it("空态与截断提示两串逐字;提示里的件数 = 当前总件数、上限取 GU_ROWS_MAX", () => {
    expect(buildGearUpContent(save()).emptyText).toBe("收藏还空着 —— 通关掉落的装备会进入收藏,可在此外侧升级");
    const over = buildGearUpContent(save({ ownedGear: makeGear(GU_ROWS_MAX + 3) }));
    expect(over.hintText).toBe(`仅显示前 ${GU_ROWS_MAX} 件(共 ${GU_ROWS_MAX + 3} 件)`);
    expect(over.showHint).toBe(true);
    expect(buildGearUpContent(save({ ownedGear: makeGear(GU_ROWS_MAX) })).showHint).toBe(false);
  });

  for (const q of QUALITIES.map((t) => t.key)) {
    it(`描述行逐字(${q}):由 COLLECTION_ATK_PCT / STEP / MAX 算出来,toFixed(0) 的取整方向与拼接顺序与 Web 一致`, () => {
      for (let lv = 0; lv <= GEAR_UPGRADE_MAX; lv++) {
        const base = COLLECTION_ATK_PCT[q];
        // 独立复算一遍 Web 的裸表达式(不走模型的私有 helper)
        const want =
          `Lv.${lv}/${GEAR_UPGRADE_MAX} · 收藏贡献 攻+${(base * (1 + GEAR_UPGRADE_STEP * lv)).toFixed(0)}% → ${(base * (1 + GEAR_UPGRADE_STEP * (lv + 1))).toFixed(0)}%`;
        expect(buildGearUpContent(atLevel("武器", lv, q)).rows[0].descText).toBe(want);
      }
    });
  }

  it("描述行里的两个百分数确实是 toFixed(0) 的产物(半数向上进位,不是截断)", () => {
    // 取一档会让 `× (1 + STEP × lv)` 出现 .5 的品质,验证取整方向与 Web 的 toFixed 一致
    const q = QUALITIES.map((t) => t.key).find((k) => {
      const v = COLLECTION_ATK_PCT[k] * (1 + GEAR_UPGRADE_STEP * 1);
      return Math.abs(v - Math.floor(v) - 0.5) < 1e-9;
    });
    expect(q, "应存在一档使当前贡献带 .5 的品质(共同前提)").toBeTruthy();
    const base = COLLECTION_ATK_PCT[q!];
    const probe = buildGearUpContent(atLevel("武器", 1, q!)).rows[0].descText;
    expect(probe).toContain(`攻+${(base * (1 + GEAR_UPGRADE_STEP)).toFixed(0)}%`);
    expect(probe).toContain(`→ ${(base * (1 + GEAR_UPGRADE_STEP * 2)).toFixed(0)}%`);
    // 2 × 1.25 = 2.5 → toFixed(0) 给 "3",小数点不该出现在这一行里
    expect(probe).not.toContain(".5");
  });

  it("品质色就是 qualityDef 那一档的颜色(Web 的 q.color 同源于此)", () => {
    const c = buildGearUpContent(save({ ownedGear: QUALITIES.map((t, i) => gear(`装${i}`, t.key)) }));
    c.rows.forEach((row, i) => {
      expect(row.quality).toBe(QUALITIES[i].key);
      expect(row.color).toBe(qualityDef(row.quality).color);
      expect(row.color).toBe(QUALITIES[i].color);
    });
  });
});

/* ==================== 7. 三态分档:lv / maxed / afford / 徽记点亮数 / 钮文档位 ==================== */

describe("每行三态由门控变量推出(不钉死数字)", () => {
  for (let lv = 0; lv <= GEAR_UPGRADE_MAX + 1; lv++) {
    it(`lv = ${lv}:maxed = (lv ≥ MAX)、cost = gearUpgradeCost(lv)、litStars = lv、钮文取哪一档由 maxed 决定`, () => {
      const cost = gearUpgradeCost(lv);
      const maxed = lv >= GEAR_UPGRADE_MAX;
      const r0 = buildGearUpContent({ ...atLevel("武器", lv), stardust: cost + 500 }).rows[0];
      expect(r0.lv).toBe(lv);
      expect(r0.cost).toBe(cost);
      expect(r0.maxed).toBe(maxed);
      expect(r0.afford).toBe(!maxed);
      expect(r0.litStars).toBe(lv);
      expect(r0.btnText).toBe(maxed ? "已满级" : `${cost} ❋`);
      // 星尘刚好等于 cost → 可升(≥ 而不是 >);差 1 → 不可升
      expect(buildGearUpContent({ ...atLevel("武器", lv), stardust: cost }).rows[0].afford).toBe(!maxed);
      expect(buildGearUpContent({ ...atLevel("武器", lv), stardust: maxed ? 0 : cost - 1 }).rows[0].afford).toBe(false);
    });
  }

  it("徽记槽数 = GEAR_UPGRADE_MAX,点亮判定就是 Web 的 `s < lv`", () => {
    const L = gearUpLayout(W, H_STD, 1);
    for (let lv = 0; lv <= GEAR_UPGRADE_MAX + 1; lv++) {
      const c = buildGearUpContent(atLevel("武器", lv));
      expect(L.rows[0].stars).toHaveLength(GEAR_UPGRADE_MAX);
      const lit = L.rows[0].stars.map((_, s) => s < c.rows[0].litStars);
      expect(lit).toEqual(L.rows[0].stars.map((_, s) => s < lv));
      expect(lit.filter(Boolean).length).toBe(Math.min(lv, GEAR_UPGRADE_MAX));
    }
  });

  it("gearLevels 缺该键 → 0 级(normalizeSave 的初值形态就是空字典)", () => {
    const s = save({ ownedGear: [gear("新货")] });
    expect(gearLevelOf(s, "新货")).toBe(0);
    const c = buildGearUpContent(s);
    expect(c.rows[0].lv).toBe(0);
    expect(c.rows[0].cost).toBe(gearUpgradeCost(0));
    expect(c.rows[0].btnText).toBe(`${gearUpgradeCost(0)} ❋`);
    expect(c.rows[0].litStars).toBe(0);
  });

  it("Web 原样口径:等级按装备名索引 → 同名不同品质共用一格等级", () => {
    const s = save({ ownedGear: [gear("同名剑", "common"), gear("同名剑", "epic")], gearLevels: { 同名剑: 2 }, stardust: 9999 });
    const c = buildGearUpContent(s);
    expect(c.rows[0].lv).toBe(2);
    expect(c.rows[1].lv).toBe(2);
    // 品质轴仍各走各的(描述里的贡献百分数按各自品质查表、框色与名字色也各自取)
    expect(c.rows[0].descText).not.toBe(c.rows[1].descText);
    expect(c.rows[0].color).not.toBe(c.rows[1].color);
  });

  it("ownedGear 超出 GU_ROWS_MAX 时只有前 14 件进 content(硬截断,与几何同源)", () => {
    const n = GU_ROWS_MAX + 5;
    const c = buildGearUpContent(save({ ownedGear: makeGear(n) }));
    expect(c.rows).toHaveLength(GU_ROWS_MAX);
    expect(c.rows.map((r) => r.name)).toEqual(makeGear(n).slice(0, GU_ROWS_MAX).map((g) => g.name));
  });
});

/* ==================== 8. 命中:返回钮 → 逐行只比 btn 矩形(Web 原样行为) ==================== */

describe("命中判定(Web onGearUpClick 的两段顺序)", () => {
  const L = gearUpLayout(W, H_STD, 3);

  it("返回钮 → back(中心与两角都在热区内)", () => {
    const b = L.backBtn;
    for (const p of [center(b), { x: b.x + 1, y: b.y + 1 }, { x: b.x + b.w - 1, y: b.y + b.h - 1 }]) {
      expect(hitGearUp(L, p.x, p.y)).toEqual({ kind: "back" });
    }
  });

  it("每行的 btn → upgrade 且带自己的下标(点第 0 行与第 2 行得到不同 row)", () => {
    L.rows.forEach((row) => {
      for (const p of [center(row.btn), { x: row.btn.x + 1, y: row.btn.y + 1 }, { x: row.btn.x + row.btn.w - 1, y: row.btn.y + row.btn.h - 1 }]) {
        expect(hitGearUp(L, p.x, p.y), `行${row.index} 内一点`).toEqual({ kind: "upgrade", row: row.index });
      }
    });
  });

  it("点行内非按钮区不产动作:行左半 / 行右上空隙 / 行间空隙 / 徽记带 / 行框内缩留白 五处探针", () => {
    const r0 = L.rows[0];
    const probes: [string, number, number][] = [
      ["行左半(名字与描述那列)", r0.rect.x + 40, center(r0.rect).y],
      ["行右上空隙(钮右那 16px 内缩留白)", r0.rect.x + r0.rect.w - 5, r0.rect.y + 2],
      ["行间空隙", center(r0.rect).x, r0.rect.y + r0.rect.h + L.rowGap / 2],
      ["徽记带(第 3 颗正中)", r0.stars[2].x + r0.stars[2].w / 2, r0.stars[2].y + r0.stars[2].h / 2],
      ["行框左下内缩留白", r0.rect.x + 2, r0.rect.y + r0.rect.h - 3],
    ];
    for (const [at, x, y] of probes) expect(hitGearUp(L, x, y), at).toBe(null);
  });

  it("屏内其余空白 / 截断提示带 / 副标题带都不产动作", () => {
    const Lt = gearUpLayout(W, H_STD, GU_ROWS_MAX + 4);
    const last = Lt.rows[Lt.rowCount - 1];
    const probes: [string, number, number][] = [
      ["左留白(面板外)", 2, H_STD / 2],
      ["面板底缘之下", W / 2, H_STD - 2],
      ["截断提示那一行", PAD + 30, Lt.hint.baseY],
      ["副标题那一行", PAD + 30, Lt.subtitle.baseY],
      ["末行之下直到屏底的行区留白", W / 2, last.rect.y + last.rect.h + 30],
    ];
    for (const [at, x, y] of probes) expect(hitGearUp(Lt, x, y), at).toBe(null);
  });

  it("空态:没有任何行 → 除返回钮外整屏不产动作", () => {
    const Le = gearUpLayout(W, H_STD, 0);
    expect(Le.rows).toEqual([]);
    expect(hitGearUp(Le, W / 2, H_STD / 2)).toBe(null);
    expect(hitGearUp(Le, Le.emptyText.x + 20, Le.emptyText.baseY)).toBe(null);
    expect(hitGearUp(Le, center(Le.backBtn).x, center(Le.backBtn).y)).toEqual({ kind: "back" });
  });

  it("按钮边缘的闭区间口径与 Web 的 `>=` / `<=` 一致", () => {
    const b = L.rows[1].btn;
    expect(hitGearUp(L, b.x, b.y)).toEqual({ kind: "upgrade", row: 1 });
    expect(hitGearUp(L, b.x + b.w, b.y + b.h)).toEqual({ kind: "upgrade", row: 1 });
    expect(hitGearUp(L, b.x - 1, b.y)).toBe(null);
    expect(hitGearUp(L, b.x + b.w + 1, b.y)).toBe(null);
  });
});

/* ==================== 9. 写入意图:扣星尘 + 等级 +1 + 三条守卫 ==================== */

describe("升级意图(gearUpClaim)", () => {
  it("正常一档:扣 gearUpgradeCost(lv)、把 gearLevels[装备名] 写成 lv + 1、不需要广告", () => {
    for (let lv = 0; lv < GEAR_UPGRADE_MAX; lv++) {
      const cost = gearUpgradeCost(lv);
      const claim = gearUpClaim({ ...atLevel("武器", lv), stardust: cost }, { kind: "upgrade", row: 0 });
      expect(claim, `lv=${lv}`).not.toBe(null);
      expect(claim!.needsAd).toBe(false);
      expect(claim!.stardustCost).toBe(cost);
      expect(claim!.gearLevelKey).toBe("武器");
      expect(claim!.gearLevelTo).toBe(lv + 1);
      expect(claim!.levelFrom).toBe(lv);
    }
  });

  it("星尘差 1 就静默(Web 的 `if (stardust < cost) return`)", () => {
    const cost = gearUpgradeCost(0);
    expect(gearUpClaim({ ...atLevel("武器", 0), stardust: cost - 1 }, { kind: "upgrade", row: 0 })).toBe(null);
    expect(gearUpClaim({ ...atLevel("武器", 0), stardust: cost }, { kind: "upgrade", row: 0 })).not.toBe(null);
  });

  it("已满级静默(即使星尘管够)", () => {
    expect(gearUpClaim({ ...atLevel("武器", GEAR_UPGRADE_MAX), stardust: 999999 }, { kind: "upgrade", row: 0 })).toBe(null);
    expect(gearUpClaim(atLevel("武器", GEAR_UPGRADE_MAX + 3), { kind: "upgrade", row: 0 })).toBe(null);
  });

  it("下标越界静默(Web 的 `const eq = ownedGear[row.idx]; if (!eq) return`)", () => {
    expect(gearUpClaim(save({ ownedGear: [gear("只有一件")] }), { kind: "upgrade", row: 7 })).toBe(null);
    expect(gearUpClaim(save({ ownedGear: [] }), { kind: "upgrade", row: 0 })).toBe(null);
  });

  it("返回不产任何写入意图", () => {
    expect(gearUpClaim({ ...atLevel("武器", 0), stardust: 9999 }, { kind: "back" })).toBe(null);
  });

  it("一路升到顶:总花费 = Σ gearUpgradeCost(0..MAX−1)、等级逐格 +1、顶格后再点静默", () => {
    const name = "毕业装";
    const total = Array.from({ length: GEAR_UPGRADE_MAX }, (_, lv) => gearUpgradeCost(lv)).reduce((a, b) => a + b, 0);
    const s: GearUpSaveView = { stardust: total, gearLevels: {}, ownedGear: [gear(name, "legendary")] };
    for (let lv = 0; lv < GEAR_UPGRADE_MAX; lv++) {
      const claim = gearUpClaim(s, { kind: "upgrade", row: 0 });
      expect(claim, `第 ${lv} 次升级`).not.toBe(null);
      expect(claim!.stardustCost).toBe(gearUpgradeCost(lv));
      // 落账(壳层做的两件事,这里在测试里照做一遍)
      s.stardust -= claim!.stardustCost;
      s.gearLevels[claim!.gearLevelKey] = claim!.gearLevelTo;
      expect(s.gearLevels[name]).toBe(lv + 1);
      // 内容层跟着新等级走
      const c = buildGearUpContent(s);
      expect(c.rows[0].lv).toBe(lv + 1);
      expect(c.rows[0].litStars).toBe(lv + 1);
    }
    expect(s.stardust).toBe(0);
    expect(s.gearLevels[name]).toBe(GEAR_UPGRADE_MAX);
    expect(gearUpClaim(s, { kind: "upgrade", row: 0 })).toBe(null);
    const top = buildGearUpContent({ ...s, stardust: 999999 });
    expect(top.rows[0].maxed).toBe(true);
    expect(top.rows[0].afford).toBe(false);
    expect(top.rows[0].btnText).toBe("已满级");
  });

  it("禁用档也产动作但静默不落账(命中层不看状态,与 Web 同分层)", () => {
    const L = gearUpLayout(W, H_STD, 2);
    const s = save({ stardust: 0, ownedGear: makeGear(2), gearLevels: { 装备1: GEAR_UPGRADE_MAX } });
    const a0 = hitGearUp(L, center(L.rows[0].btn).x, center(L.rows[0].btn).y);
    const a1 = hitGearUp(L, center(L.rows[1].btn).x, center(L.rows[1].btn).y);
    expect(a0).toEqual({ kind: "upgrade", row: 0 });
    expect(a1).toEqual({ kind: "upgrade", row: 1 });
    expect(gearUpClaim(s, a0!)).toBe(null); // 已满级
    expect(gearUpClaim(s, a1!)).toBe(null); // 星尘不足
  });

  it("同一动作两次调用给出等值但互相独立的意图对象", () => {
    const s = { ...atLevel("武器", 1), stardust: 9999 };
    const a = gearUpClaim(s, { kind: "upgrade", row: 0 })!;
    const b = gearUpClaim(s, { kind: "upgrade", row: 0 })!;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

/* ==================== 10. 存档形态:字段都在、初值形态与 normalizeSave 一致 ==================== */

describe("存档字段(派单要求:先确认 Cocos 侧字段齐备)", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/core/SaveModel.ts", import.meta.url), "utf8");

  it("stardust / gearLevels / ownedGear 三个字段都在 SaveModel 上", () => {
    expect(/stardust:\s*number;/.test(src)).toBe(true);
    expect(/gearLevels:\s*Record<string, number>;/.test(src)).toBe(true);
    expect(/ownedGear:\s*Equipment\[\];/.test(src)).toBe(true);
  });

  it("gearLevels 是按名字索引的字典、初值 {};ownedGear 是数组、初值 []", () => {
    expect(src.includes('gearLevels: parsed?.gearLevels && typeof parsed.gearLevels === "object" ? parsed.gearLevels : {}')).toBe(true);
    expect(src.includes("ownedGear: Array.isArray(parsed?.ownedGear) ? parsed.ownedGear : []")).toBe(true);
  });

  it("模型窄切片能直接吃 SaveModel 形状(结构兼容,宿主不需要补字段)", () => {
    const slice: GearUpSaveView = { stardust: 1, gearLevels: {}, ownedGear: [gear("甲")] };
    expect(buildGearUpContent(slice).rows).toHaveLength(1);
  });
});

/* ==================== 11. 配色档:phase4 表的 gu* 默认值逐项对上 Web ==================== */

/** 读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS`(那一侧 import cc,node 侧不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
  const head = src.indexOf("export const PHASE4_DEFAULTS: Phase4Params = {");
  const body = src.slice(src.indexOf("{", head), src.indexOf("\n};", head));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s+(\w+):\s*"([^"]*)",$/gm)) out[m[1]] = m[2];
  for (const m of body.matchAll(/^\s+(\w+):\s*(\d+(?:\.\d+)?),$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web 侧装备升级屏的绘制与命中源码段(drawGearUp + onGearUpClick) */
function webGearSource(): string {
  const src = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
  const from = src.indexOf("private drawGearUp(");
  const to = src.indexOf("private onSeasonClick(");
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

/** 走共享 theme 令牌的那几键:值 = theme[token](Web 那里写的就是 theme.xxx) */
const GU_THEME_KEYS: Record<string, keyof typeof theme> = {
  guTitle: "gold",
  guSubtitle: "textSecondary",
  guStardust: "stardust",
  guDesc: "textSecondary",
  guBtnTextAfford: "actionPrimary",
  guBtnTextDisabled: "textMuted",
  guStarLit: "stardust",
  guHint: "textMuted",
  guBackText: "echo",
};

/** Web drawGearUp / onGearUpClick 段里以字面量出现的表现项 */
const GU_LITERAL_KEYS = ["guDim", "guEmpty", "guBtnDisabledBg", "guBtnDisabledStroke", "guStarDim", "guStarGlyph", "guBackBg", "guBackStroke"];

/** 住在 Web 宿主侧 themePaint.minorButtonBg 里的缺图回退两色 */
const GU_PAINT_KEYS = ["guBtnMinorFallbackBg", "guBtnMinorFallbackStroke"];

const GU_KEYS = [...Object.keys(GU_THEME_KEYS), ...GU_LITERAL_KEYS, ...GU_PAINT_KEYS, "guStarDimAlpha"];

describe("phase4 表的装备升级屏配色档", () => {
  const defs = phase4Defaults();
  const webRaw = webGearSource();
  const web = webRaw.toLowerCase();
  const paint = readFileSync(new URL("../src/ui/themePaint.ts", import.meta.url), "utf8").toLowerCase();

  it("每个 gu* 键都在表里给了默认值(Web 绘制路径里的内联字面量不留裸值在视图文件)", () => {
    for (const k of GU_KEYS) expect(defs[k], k).toBeTruthy();
  });

  it("表里的 gu* 键集合与测试清单逐键相同(没有漏断言的孤儿键)", () => {
    expect(Object.keys(defs).filter((k) => k.startsWith("gu")).sort()).toEqual([...GU_KEYS].sort());
  });

  it("每个 gu* 键都在 Phase4Params 接口里声明(typedMerge 的整段接线不漏键)", () => {
    const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
    const iface = src.slice(src.indexOf("export interface Phase4Params"), src.indexOf("export const PHASE4_DEFAULTS"));
    for (const k of GU_KEYS) expect(new RegExp(`^\\s+${k}: (?:string|number);$`, "m").test(iface), k).toBe(true);
  });

  it("走 theme 令牌的那几键与共享 theme 同值", () => {
    for (const [k, token] of Object.entries(GU_THEME_KEYS)) expect(defs[k].toLowerCase(), `${k} 应等于 theme.${token}`).toBe(String(theme[token]).toLowerCase());
  });

  it("字面量键都能在 Web drawGearUp / onGearUpClick 源码段里找到同一写法", () => {
    for (const k of GU_LITERAL_KEYS) expect(web.includes(defs[k].toLowerCase()), `${k} = ${defs[k]} 应在 Web drawGearUp 段出现`).toBe(true);
  });

  it("btn_minor 缺图回退两色取自 Web themePaint.minorButtonBg(与禁态按钮那一档不同)", () => {
    for (const k of GU_PAINT_KEYS) expect(paint.includes(defs[k].toLowerCase()), `${k} = ${defs[k]} 应在 minorButtonBg 出现`).toBe(true);
    expect(defs.guBtnDisabledBg.toLowerCase()).not.toBe(defs.guBtnMinorFallbackBg.toLowerCase());
    expect(defs.guBtnDisabledStroke).not.toBe(defs.guBtnMinorFallbackStroke);
  });

  it("未点亮徽记的 opacity 就是 Web globalAlpha 0.22 折成 0..255", () => {
    expect(web.includes("globalalpha = s < lv ? 1 : 0.22")).toBe(true);
    expect(Number(defs.guStarDimAlpha)).toBe(Math.round(0.22 * 255));
  });

  it("返回钮描边与 daily / pass 那两屏不同档(照抄 Web 那里继承来的上一笔,不共用)", () => {
    expect(defs.guBackStroke).not.toBe(defs.psBackStroke);
    expect(defs.guBackStroke).not.toBe(defs.dlBackStroke);
    expect(defs.guBackText.toLowerCase()).not.toBe(defs.psBackText.toLowerCase());
    expect(defs.guBackText.toLowerCase()).not.toBe(defs.dlBackText.toLowerCase());
    // Web 的回退闭包只写了 fillRect,strokeRect 沿用上一笔 → 取列表里禁档按钮的 0.15 档
    expect(webRaw.includes('g.fillStyle = "#1A1F2A";')).toBe(true);
    expect(webRaw.includes("g.strokeRect(w - pad - ui.backW, 22, ui.backW, ui.backH);")).toBe(true);
  });

  it("本屏用到的五枚贴图键都在 ASSET_MANIFEST 里,且 Web 段确实用到了它们", () => {
    for (const k of ["panel_gearup", "panel_dark_corners", "badge_gear_lv", "btn_minor", "btn_back"]) expect(ASSET_MANIFEST[k], k).toBeTruthy();
    expect(webRaw.includes('"panel_gearup"')).toBe(true);
    expect(web.includes('"badge_gear_lv"')).toBe(true);
    expect(web.includes("minorbuttonbg")).toBe(true);
    expect(web.includes("drawqualityframe")).toBe(true);
    expect(web.includes('"btn_back"')).toBe(true);
  });
});

/* ==================== 12. 模型纯度:不写存档 ==================== */

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe("模型纯度(存档只读,写入意图是返回值)", () => {
  it("buildGearUpContent / hitGearUp / gearUpClaim / gearLevelOf 都不改传入存档", () => {
    const s = deepFreeze(save({ stardust: 9999, gearLevels: { 装备1: 2, 装备2: 5 }, ownedGear: makeGear(GU_ROWS_MAX + 2) }));
    const before = JSON.stringify(s);
    for (const h of [H_STD, H_TALL]) {
      const L = gearUpLayout(W, h, s.ownedGear.length);
      const c = buildGearUpContent(s);
      const pts = [center(L.backBtn), ...L.rows.map((r) => center(r.btn)), ...L.rows.map((r) => center(r.rect)), { x: 2, y: h / 2 }];
      for (const p of pts) {
        const a = hitGearUp(L, p.x, p.y);
        if (a) gearUpClaim(s, a);
      }
      for (const row of c.rows) gearLevelOf(s, row.name);
    }
    expect(JSON.stringify(s)).toBe(before);
  });
});

/* ==================== 13. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = ["../cocos/assets/scripts/game/ui/gearUpLayout.ts", "../cocos/assets/scripts/gearup/GearUpModel.ts"];

describe("纯布局与宿主模型 cc-free", () => {
  for (const rel of PURE_FILES) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    it(`${rel.split("/").pop()}:无 cc / 无 Canvas2D / 无 DOM 全局 / 无 @game 别名`, () => {
      expect(CC_IMPORT.test(src), "不得 import cc").toBe(false);
      expect(CTX_TYPE.test(src), "不得用 CanvasRenderingContext2D").toBe(false);
      expect(DOM_GLOBAL.test(src), "不得用 DOM/宿主全局").toBe(false);
      // 共享层与宿主模型内部一律相对路径 import,别名只在 Web 侧有效
      expect(ABSOLUTE_GAME.test(src), "内部不得用 @game/ 别名").toBe(false);
    });
  }

  it("共享层不留 Web 的 gearRows 侧信道:矩形由布局现算,绘制与命中同源", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/game/ui/gearUpLayout.ts", import.meta.url), "utf8"));
    expect(src.includes("gearRows")).toBe(false);
    // 行 y 由 index × rowStep 递推,不靠循环里累加的 let y(那条是 Web dailyLayout 的写法)
    expect(/let y\s*=/.test(src)).toBe(false);
  });
});

/* ==================== 14. 视图层纪律:文本只走 placeLine,几何只问共享层 ==================== */

describe("GearUpView 的落位纪律(R5)", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/gearup/GearUpView.ts", import.meta.url), "utf8");

  it("文本只经 placeLine 一个入口,视图不自己按对齐摆节点", () => {
    expect(src.includes("placeLine(")).toBe(true);
    // 对齐只在 Txt 内部换一次;别处再碰 horizontalAlign 就是绕开了 anchorBand 的第二套落位口径
    expect((src.match(/lb\.horizontalAlign\s*=/g) ?? []).length).toBe(1);
    expect((src.match(/placeLine\(/g) ?? []).length).toBe(1);
  });

  it("视图不产几何:行/钮/徽记矩形与文本锚点都从 layout 取", () => {
    expect(src.includes("spreadRows")).toBe(false);
    expect(src.includes("rowTextY")).toBe(false);
    expect(src.includes("btn.x")).toBe(false);
    expect(src.includes("rect.w")).toBe(false);
    expect(src.includes("GEAR_UPGRADE_MAX * ")).toBe(false);
  });

  it("行槽一次建满 GU_ROWS_MAX、徽记槽按 GEAR_UPGRADE_MAX 建,不做按需增建", () => {
    expect(src.includes("for (let i = 0; i < GU_ROWS_MAX; i++)")).toBe(true);
    expect(src.includes("for (let s = 0; s < GEAR_UPGRADE_MAX; s++)")).toBe(true);
  });

  it("本屏不碰广告通道,也不写存档", () => {
    const src = codeOf(readFileSync(new URL("../cocos/assets/scripts/gearup/GearUpView.ts", import.meta.url), "utf8"));
    expect(src.includes("watchAd")).toBe(false);
    expect(src.includes("AdChannel")).toBe(false);
    expect(src.includes("persist")).toBe(false);
    expect(src.includes("gearLevels[")).toBe(false);
  });
});

/* ==================== 15. 宿主接线:五件套 + 路由注册 + 占位提示下线 ==================== */

describe("GameShell 的装备升级屏接线", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8");

  it("五件套齐全并在 buildLayers / 路由钩子里各就各位", () => {
    for (const m of ["buildGearUpScreen", "gearUpSave", "openGearUp", "syncGearUp", "onGearUpAction", "commitGearUpClaim"]) {
      expect(src.includes(`private ${m}(`), m).toBe(true);
    }
    expect(src.includes("this.buildGearUpScreen();")).toBe(true);
    // buildGearUpScreen 排在 buildPassScreen 之后
    expect(src.indexOf("this.buildGearUpScreen();")).toBeGreaterThan(src.indexOf("this.buildPassScreen();"));
    expect(src.includes("gearup: () => this.syncGearUp(),")).toBe(true);
    expect(src.includes('"pass", "gearup", "gacha", "prestige", "commission", "fusion", "season", "gameover", "victory", "energy"]')).toBe(true);
  });

  it("入口从占位轻提示换成 openGearUp,占位表已随最后一屏落地整表下线", () => {
    expect(src.includes('if (a.entry === "gearup")')).toBe(true);
    expect(src.includes("this.openGearUp();")).toBe(true);
    expect(src.includes("升级尚未开放")).toBe(false);
    expect(src.includes("PENDING_SCREEN")).toBe(false);
  });

  it("本屏不走广告入口(没有为它新增 watchAd 调用)", () => {
    const seg = src.slice(src.indexOf("private buildGearUpScreen"), src.indexOf("/* ================= 扭蛋机屏"));
    expect(seg.includes("watchAd")).toBe(false);
    expect(seg.includes("this.commitGearUpClaim(claim)")).toBe(true);
    expect(seg.includes("this.sim?.persist()")).toBe(true);
  });
});

/* ==================== 16. 与 Web 的对照:行步进、截断件数、命中分层 ==================== */

describe("Web 基准的三条反直觉口径已原样带上", () => {
  const web = webGearSource();

  it("Web 的行步进是 `rowH + 4`(硬编码);Cocos 侧改用 spreadRows 的 gap 并让位给贴底提示带", () => {
    expect(web.includes("const y = y0 + idx * (rowH + 4);")).toBe(true);
    expect(web.includes("const { rowH } = spreadRows(list.length, y0, h - pad - 8, 40, 56);")).toBe(true);
    // 有意分歧:Cocos 侧行距取 spreadRows 的 gap(富余摊进行距),行区底缘是提示带顶缘
    const L = gearUpLayout(W, H_STD, GU_ROWS_MAX);
    expect(L.rowStep).toBe(L.rowH + L.rowGap);
    expect(L.listY0).toBe(GU_LIST_Y0);
    expect(L.listBottom).toBe(evenDown(H_STD) - GU_PAD - GU_HINT_BAND_H);
    expect(GU_LIST_Y0).not.toBe(78);
  });

  it("Web 的命中只比 row.btn,不比 row.rect", () => {
    const click = web.slice(web.indexOf("private onGearUpClick("));
    expect(click.includes("row.btn.x")).toBe(true);
    expect(click.includes("row.rect")).toBe(false);
  });

  it("Web 的列表切片是 `gear.slice(0, 14)`,与共享层的 GU_ROWS_MAX 同值", () => {
    expect(web.includes("gear.slice(0, 14)")).toBe(true);
    expect(web.includes("if (gear.length > 14)")).toBe(true);
    expect(GU_ROWS_MAX).toBe(14);
  });

  it("Web 的星尘那行没有图标件:就是一串右对齐文字", () => {
    expect(web.includes("g.fillText(`❋ ${this.save.stardust}`, w - pad, 36);")).toBe(true);
  });
});
