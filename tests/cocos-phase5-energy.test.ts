/**
 * Phase 5 体力不足屏闸门:energy(开局被体力挡住 → 弹哪一屏 / 屏上显示什么 / 点了去哪)。
 *
 * 延续 cocos-phase4-* 与 cocos-phase5-gameover / -victory 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `energy/EnergyModel.ts` 经相对路径 import 的共享层
 *     (`game/data/daily` 的五支体力常量与那支 `regenEnergy`、`game/ui/energyLayout`)与 Web 侧
 *     经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同、常量值同数),于是
 *     「+5 上限截断」「今日 5 次」「10◆ 回满」「每 6 分钟一点」这四条规则不可能出现两份抄本;
 *  2. **断言按门控变量分档**:几何**只吃 `h`**——本屏是十六屏里第一个「形态位不改几何」到
 *     连入参都不需要的屏(`canAd` / `canDiamond` 只换配色与文案档),所以两档屏高的每一条
 *     几何都是常量表;文案与意图只吃「三个数」,没有随机源也没有 `Date.now()`;
 *  3. **视图无关**:本文件只吃 cc-free 的 `EnergyModel.ts` 与共享层纯布局;`EnergyView.ts` 与
 *     `GameShell.ts` / `ViewTable.ts` 那三侧 import 了 `cc`,node 不能直载,故只读源码文本。
 *
 * 本屏的几何重点是**两条纵向锚线 + 一条与屏高无关的屏幕角锚**:
 *  - `anchorY = h × 0.3`(横幅 / 标题 / 读数 / 提示四处)与 `btnAnchorY = h × 0.42`
 *    (三枚钮 `+0 / +62 / +118`),于是 996 → 1246 时文字族整体下沉 `Δh × 0.3 = 75`、
 *    按钮族下沉 `Δh × 0.42 = 105`、返回钮纹丝不动,两族之间的空档一起伸缩;
 *  - 三枚钮等高线递减 `52 / 46 / 40`、钮间距恒 10、钮心恒为屏心,纵向基线**全部走 `rowTextY`**
 *    (与死亡 / 通关屏那两枚贴底钮的裸偏移不同口径)。
 *
 * 另锁本屏照抄的 Web 口径(只列不改):广告回体力是累加带上限截断而钻石那支直接置满、
 * 两处守卫都在命中之后(用尽与不足仍返回动作、静默在写入意图里)、关闭与返回两支完全同效、
 * 读数行念的是恢复节奏而不是倒计时、`energyAdCount` 超过上限时 `adLeft` 原样给负数。
 *
 * 最后两条**跨层纪律**:
 *  - **import 完整性**:视图与宿主用到的每一个布局 / 模型出口都必须在自己的 import 清单里。
 *    通关屏曾经漏过 `victoryBadgeTextLine`,构建产物的 `error TS` 计数为 0 也照样放过去
 *    (门 3 的 Cocos 构建不做可靠类型检查),只有实机探针进屏那一刻才炸。这一条把它钉成断言,
 *    并同时钉住 victory 屏那一处已经修好的历史缺陷;
 *  - 视图层不内联魔法数:四枚盒与七处基线只能来自 `energyScreenLayout`。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import {
  ENERGY_AD_GAIN,
  ENERGY_AD_LIMIT,
  ENERGY_DIAMOND_COST,
  ENERGY_MAX,
  ENERGY_REGEN_SECONDS,
  regenEnergy,
} from "@game/data/daily";
import { fs as FS, rowTextY, theme, ui } from "@game/ui/theme";
import {
  EN_AD_H,
  EN_ANCHOR_RATIO,
  EN_BACK_Y,
  EN_BANNER_DY,
  EN_BANNER_H,
  EN_BANNER_W,
  EN_BANNER_DX,
  EN_BTN_ANCHOR_RATIO,
  EN_BTN_DX,
  EN_BTN_STROKE_W,
  EN_BTN_W,
  EN_CLOSE_DY,
  EN_CLOSE_H,
  EN_CONTENT_W,
  EN_DIA_DY,
  EN_DIA_H,
  EN_HINT_DY,
  EN_PAD,
  EN_PANEL_NINE,
  EN_STAT_DY,
  energyAdBtn,
  energyBackBtn,
  energyBtnTop,
  energyCloseBtn,
  energyDiamondBtn,
  energyLayout,
  energyScreenLayout,
  evenDown,
  type EnergyLayout,
  type EnRect,
} from "@game/ui/energyLayout";

/* ---------- Cocos 宿主侧的被测件(cc-free) ---------- */
import {
  buildEnergyContent,
  energyAdClaim,
  energyDiamondClaim,
  hitEnergy,
  type EnergySaveView,
} from "../cocos/assets/scripts/energy/EnergyModel";
import * as cocosEnergyLayout from "../cocos/assets/scripts/game/ui/energyLayout";
import * as cocosEnergyModel from "../cocos/assets/scripts/energy/EnergyModel";
import * as cocosDaily from "../cocos/assets/scripts/game/data/daily";
import * as cocosVictoryLayout from "../cocos/assets/scripts/game/ui/victoryLayout";
import * as cocosVictoryModel from "../cocos/assets/scripts/victory/VictoryModel";

/* ==================== 夹具 ==================== */

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = EN_PAD;
const BAND = W - PAD * 2;

/** 一份「体力 3 / 今日已看 1 次广告 / 持有 12◆」的存档切片 */
function save(over: Partial<EnergySaveView> = {}): EnergySaveView {
  return { energy: 3, energyAdCount: 1, diamond: 12, ...over };
}

function laid(h: number): EnergyLayout {
  return energyLayout(W, h);
}

/** 一帧几何 + 一屏文案(两个位由三个数折出,与宿主同一条口) */
function screen(s: EnergySaveView = save(), h: number = H_STD) {
  const L = laid(h);
  return { L, c: buildEnergyContent(s) };
}

const mid = (r: EnRect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const bottom = (r: EnRect): number => r.y + r.h;
const right = (r: EnRect): number => r.x + r.w;
/** 两片矩形是否相交(开区间重叠才算,贴边不算) */
const overlap = (a: EnRect, b: EnRect): boolean =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

/** 去掉注释后的代码体:源码纪律断言只该看代码,不该被文档注释里的字段名带跑 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 一份源码里所有 import 语句拼成的文本(横向扫 import 清单用) */
function importsOf(src: string): string {
  return [...src.matchAll(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm)].map((m) => m[0]).join("\n");
}

/** 去掉全部 import 之后的代码体 */
function bodyOf(src: string): string {
  return src.replace(/^import[\s\S]*?from\s*"[^"]+";\s*$/gm, "");
}

/** 读 Web 基准源码(仓库里是 CRLF,统一换行后再比对字面量) */
function webSource(): string {
  return readFileSync(new URL("../src/game.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function fileSource(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

/** 从 PHASE4_DEFAULTS 里抠出一张 `键 → 字面量` 的表(ViewTable 那侧 import 了 cc,node 不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = fileSource("../cocos/assets/scripts/core/ViewTable.ts");
  const block = src.slice(src.indexOf("export const PHASE4_DEFAULTS"), src.indexOf("/** 含义:Phase 3"));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{4}(\w+):\s*"([^"]*)",\s*$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web drawEnergy + energyLayout + onEnergyClick 的源码段(三件一体,4660-4781) */
function webDrawEnergy(): string {
  const web = webSource();
  return web.slice(web.indexOf("private energyLayout("), web.indexOf("private dailyLayout("));
}

/**
 * import 完整性检查:`file` 的代码体里凡是引用到 `ns` 的某个导出名,那个名字就必须出现在
 * `file` 的 import 清单里。漏 import 在 Cocos 构建里不是错误(门 3 不做可靠类型检查),
 * 只会以运行期 `ReferenceError` 的形式在进屏那一刻炸出来。
 */
function missingImports(file: string, specs: Array<{ label: string; ns: Record<string, unknown> }>): string[] {
  const src = fileSource(file);
  const imports = importsOf(src);
  const body = codeOf(bodyOf(src));
  const out: string[] = [];
  for (const spec of specs) {
    for (const name of Object.keys(spec.ns)) {
      const re = new RegExp(`(?<![\\w$.])${name}(?![\\w$])`);
      if (re.test(body) && !re.test(imports)) out.push(`${spec.label}::${name}`);
    }
  }
  return out;
}

/* ==================== 0. 端间同一实现 ==================== */

describe("端间共读同一份共享层", () => {
  it("energyLayout 与 daily 两个模块在两端是同一实例(函数引用相同)", () => {
    expect(cocosEnergyLayout.energyLayout).toBe(energyLayout);
    expect(cocosEnergyLayout.energyAdBtn).toBe(energyAdBtn);
    expect(cocosEnergyLayout.energyScreenLayout).toBe(energyScreenLayout);
    expect(cocosDaily.regenEnergy).toBe(regenEnergy);
  });

  it("本屏的体力口径没有宿主侧抄本:五个数一律转调共享层常量", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/energy/EnergyModel.ts"));
    for (const banned of ["= 20", ">= 10", "+ 5", "360"]) expect(model.includes(banned)).toBe(false);
    // 唯一的除法是作用在共享层常量上的秒 → 分,不落到任何字面量
    expect(model.includes("ENERGY_REGEN_SECONDS / 60")).toBe(true);
    expect(model.includes("Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN)")).toBe(true);
    expect(model.includes("ENERGY_MAX")).toBe(true);
    expect(model.includes("ENERGY_AD_LIMIT")).toBe(true);
    expect(model.includes("ENERGY_DIAMOND_COST")).toBe(true);
    expect(model.includes("ENERGY_REGEN_SECONDS")).toBe(true);
  });

  it("模型层不碰存档、不碰节点、不看时间与随机源", () => {
    const model = codeOf(fileSource("../cocos/assets/scripts/energy/EnergyModel.ts"));
    expect(model.includes("Date.now")).toBe(false);
    expect(model.includes("Math.random")).toBe(false);
    expect(model.includes(".persist")).toBe(false);
    expect(model.includes("save.energy =")).toBe(false);
    expect(model.includes("from \"cc\"")).toBe(false);
    expect(model.includes("Node")).toBe(false);
  });

  it("体力五支常量的当前值与 balance.json 的 energy 段逐项相同(表在,读数才有出处)", () => {
    const cfg = JSON.parse(readFileSync(new URL("../public/config/balance.json", import.meta.url), "utf8"));
    expect(cfg.energy.max).toBe(ENERGY_MAX);
    expect(cfg.energy.regenSeconds).toBe(ENERGY_REGEN_SECONDS);
    expect(cfg.energy.adGain).toBe(ENERGY_AD_GAIN);
    expect(cfg.energy.adLimit).toBe(ENERGY_AD_LIMIT);
    expect(cfg.energy.diamondRefillCost).toBe(ENERGY_DIAMOND_COST);
    expect(ENERGY_MAX).toBe(20);
    expect(ENERGY_REGEN_SECONDS).toBe(360);
    expect(ENERGY_AD_GAIN).toBe(5);
    expect(ENERGY_AD_LIMIT).toBe(5);
    expect(ENERGY_DIAMOND_COST).toBe(10);
  });
});

/* ==================== 1. 两档几何:996 ==================== */

describe("996 档几何(逐项对标 Web energyLayout / drawEnergy)", () => {
  const L = laid(H_STD);

  it("两条纵向锚线:比例档 298.8 / 418.32 经 evenDown 落偶数 298 / 418", () => {
    expect(EN_ANCHOR_RATIO).toBe(0.3);
    expect(EN_BTN_ANCHOR_RATIO).toBe(0.42);
    expect(L.anchorY).toBe(298);
    expect(L.btnAnchorY).toBe(418);
    expect(L.btnAnchorY).toBe(energyBtnTop(H_STD));
    // 取偶前的原始档仍是 Web 的两个比例
    expect(H_STD * EN_ANCHOR_RATIO).toBeCloseTo(298.8, 6);
    expect(H_STD * EN_BTN_ANCHOR_RATIO).toBeCloseTo(418.32, 6);
    expect(evenDown(H_STD * EN_ANCHOR_RATIO)).toBe(298);
    expect(evenDown(H_STD * EN_BTN_ANCHOR_RATIO)).toBe(418);
  });

  it("面板盒 = [pad, w−pad] × [pad, h−pad] 且键恒为 panel_dark_corners(Web panelPad 不传专属键)", () => {
    expect(L.panel).toEqual({ x: 16, y: 16, w: 528, h: 964 });
    expect(L.panelKey).toBe("panel_dark_corners");
    expect(L.panelNine).toBe(EN_PANEL_NINE);
    expect(EN_PANEL_NINE).toBe(32);
  });

  it("横幅盒 {170, 268, 220, 40}(a 上方 30,整幅拉伸)", () => {
    expect(L.banner.x).toBe(W / 2 - EN_BANNER_DX);
    expect(EN_BANNER_DX).toBe(evenDown(EN_BANNER_W / 2));
    expect(EN_BANNER_DX * 2).toBe(EN_BANNER_W);
    expect(EN_BANNER_W).toBe(220);
    expect(EN_BANNER_H).toBe(40);
    expect(EN_BANNER_DY).toBe(30);
    expect(L.banner.y).toBe(268);
    expect(L.banner.w).toBe(220);
    expect(L.banner.h).toBe(40);
    expect(L.banner.x).toBe(170);
  });

  it("三行文字基线 a / a+34 / a+58,字号 22 / 14 / 13,只有标题粗体", () => {
    expect([L.title.baseY, L.statLine.baseY, L.hint.baseY]).toEqual([298, 332, 356]);
    expect(EN_STAT_DY).toBe(34);
    expect(EN_HINT_DY).toBe(58);
    expect([L.title.px, L.statLine.px, L.hint.px]).toEqual([22, 14, 13]);
    expect([L.title.bold, L.statLine.bold, L.hint.bold]).toEqual([true, false, false]);
    expect([L.title.x, L.statLine.x, L.hint.x]).toEqual([280, 280, 280]);
  });

  it("三枚钮 {120, 418|480|536, 320} 高 52/46/44,步进 62 与 56", () => {
    expect(EN_BTN_DX).toBe(evenDown(EN_BTN_W / 2));
    expect(EN_BTN_DX * 2).toBe(EN_BTN_W);
    expect(EN_BTN_W).toBe(320);
    expect(EN_AD_H).toBe(52);
    expect(EN_DIA_H).toBe(46);
    expect(EN_CLOSE_H).toBe(ui.touchMin);
    expect(EN_DIA_DY).toBe(62);
    expect(EN_CLOSE_DY).toBe(118);
    expect([L.adBtn.x, L.diamondBtn.x, L.closeBtn.x]).toEqual([120, 120, 120]);
    expect([L.adBtn.y, L.diamondBtn.y, L.closeBtn.y]).toEqual([418, 480, 536]);
    expect([L.adBtn.h, L.diamondBtn.h, L.closeBtn.h]).toEqual([52, 46, 44]);
    expect(L.adToDiamondStep).toBe(62);
    expect(L.diamondToCloseStep).toBe(56);
    expect(L.btnX).toBe(120);
    expect(L.btnW).toBe(320);
  });

  it("钮列三枚的钮心都是屏心,钮间距恒 10(Web 的裸 +62 / +118 递减档)", () => {
    for (const r of [L.adBtn, L.diamondBtn, L.closeBtn]) expect(mid(r)[0]).toBe(280);
    expect(L.diamondBtn.y - bottom(L.adBtn)).toBe(10);
    expect(L.closeBtn.y - bottom(L.diamondBtn)).toBe(10);
  });

  it("钮内三处基线全走 rowTextY:449 / 507 / 563(Web 四处实参都是 rowTextY)", () => {
    expect(L.adText.baseY).toBe(rowTextY(L.adBtn.y, L.adBtn.h, 14));
    expect(L.diamondText.baseY).toBe(rowTextY(L.diamondBtn.y, L.diamondBtn.h, 13));
    expect(L.closeText.baseY).toBe(rowTextY(L.closeBtn.y, L.closeBtn.h, 14));
    expect([L.adText.baseY, L.diamondText.baseY, L.closeText.baseY]).toEqual([449, 507, 563]);
    expect([L.adText.px, L.diamondText.px, L.closeText.px]).toEqual([14, 13, 14]);
    expect([L.adText.bold, L.diamondText.bold, L.closeText.bold]).toEqual([true, true, false]);
  });

  it("返回钮 {472,22,72,44} 在右上角、与屏高无关,基线 48", () => {
    expect(EN_BACK_Y).toBe(22);
    expect(L.backBtn).toEqual({ x: W - PAD - ui.backW, y: 22, w: ui.backW, h: Math.max(ui.touchMin, ui.backH) });
    expect([L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h]).toEqual([472, 22, 72, 44]);
    expect(L.backBtn.h).toBeGreaterThanOrEqual(ui.touchMin);
    expect(L.backText.baseY).toBe(48);
    expect(L.backText.x).toBe(508);
    expect(L.backText.px).toBe(13);
    expect(L.backText.bold).toBe(false);
    // 贴右上角的那一行只能按钮宽限宽,否则折出来的文本盒会探出画布
    expect(L.backText.maxW).toBe(72);
  });

  it("四片热区互不相交(Web 的命中顺序因此只在重叠时才有意义,本屏永不重叠)", () => {
    const rects: Array<[string, EnRect]> = [["back", L.backBtn], ["ad", L.adBtn], ["diamond", L.diamondBtn], ["close", L.closeBtn]];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlap(rects[i][1], rects[j][1])).toBe(false);
      }
    }
  });

  it("居中文字一律整屏带宽 528;描边宽度取全项目约定档 1", () => {
    for (const t of [L.title, L.statLine, L.hint, L.adText, L.diamondText, L.closeText]) expect(t.maxW).toBe(BAND);
    expect(BAND).toBe(EN_CONTENT_W);
    expect(EN_BTN_STROKE_W).toBe(1);
  });

  it("四个矩形出口与整屏布局同数(绘制与命中共读同一份;energyBackBtn 只收宽,与屏高无关)", () => {
    expect(energyAdBtn(W, H_STD)).toEqual(L.adBtn);
    expect(energyDiamondBtn(W, H_STD)).toEqual(L.diamondBtn);
    expect(energyCloseBtn(W, H_STD)).toEqual(L.closeBtn);
    expect(energyBackBtn(W)).toEqual(L.backBtn);
    expect(energyBtnTop(H_STD)).toBe(L.adBtn.y);
  });
});

/* ==================== 2. 两档几何:1246 与跨档性质 ==================== */

describe("像素栅格闸(两档共用)", () => {
  it("两档六枚矩形四值全偶、文字起笔与限宽全偶,页边距 16 / 内容宽 528", () => {
    expect(PAD).toBe(16);
    expect(BAND).toBe(528);
    for (const h of [H_STD, H_TALL]) {
      const G = laid(h);
      const rects: Array<[string, EnRect]> = [["panel", G.panel], ["banner", G.banner], ["ad", G.adBtn], ["diamond", G.diamondBtn], ["close", G.closeBtn], ["back", G.backBtn]];
      for (const [name, r] of rects) {
        for (const v of [r.x, r.y, r.w, r.h]) expect(v % 2, `${h} ${name} ${JSON.stringify(r)}`).toBe(0);
        expect(r.x + r.w, `${h} ${name} 右缘`).toBeLessThanOrEqual(544);
      }
      for (const t of [G.title, G.statLine, G.hint, G.adText, G.diamondText, G.closeText, G.backText]) {
        expect(t.x % 2, JSON.stringify(t)).toBe(0);
        expect(t.maxW % 2).toBe(0);
      }
      expect(G.anchorY % 2).toBe(0);
      expect(G.btnAnchorY % 2).toBe(0);
    }
  });
});

describe("1246 档几何与跨档性质", () => {
  const A = laid(H_STD);
  const B = laid(H_TALL);

  it("1246 档逐项目标值:锚线 372 / 按钮族顶 522 / 三处基线 553·611·667", () => {
    expect(B.anchorY).toBe(372);
    expect(B.banner.y).toBe(342);
    expect([B.title.baseY, B.statLine.baseY, B.hint.baseY]).toEqual([372, 406, 430]);
    expect([B.adBtn.y, B.diamondBtn.y, B.closeBtn.y]).toEqual([522, 584, 640]);
    expect([B.adText.baseY, B.diamondText.baseY, B.closeText.baseY]).toEqual([553, 611, 667]);
    expect(B.panel.h).toBe(1214);
  });

  it("两档之间文字族整体下沉 74、按钮族下沉 104、返回钮纹丝不动(两条锚线的比例不同)", () => {
    expect(B.title.baseY - A.title.baseY).toBe(74);
    expect(B.hint.baseY - A.hint.baseY).toBe(74);
    expect(B.banner.y - A.banner.y).toBe(74);
    expect(B.adBtn.y - A.adBtn.y).toBe(104);
    expect(B.closeBtn.y - A.closeBtn.y).toBe(104);
    expect(B.backBtn).toEqual(A.backBtn);
  });

  it("三枚钮的形状与横向在两档完全相同(只有纵向走)", () => {
    expect([B.adBtn.x, B.adBtn.w, B.diamondBtn.w, B.closeBtn.w]).toEqual([A.adBtn.x, A.adBtn.w, A.diamondBtn.w, A.closeBtn.w]);
    expect([B.adBtn.h, B.diamondBtn.h, B.closeBtn.h]).toEqual([52, 46, 44]);
    expect(B.diamondBtn.y - bottom(B.adBtn)).toBe(10);
    expect(B.closeBtn.y - bottom(B.diamondBtn)).toBe(10);
  });

  it("钮列底缘到屏底的下沉随屏高变大(416 → 562),本屏没有贴底锚", () => {
    expect(A.btnColumnBottomGap).toBe(416);
    expect(B.btnColumnBottomGap).toBe(562);
    expect(B.btnColumnBottomGap - A.btnColumnBottomGap).toBe(146);
    expect(bottom(B.closeBtn)).toBeLessThan(B.panel.y + B.panel.h);
    expect(bottom(A.closeBtn)).toBeLessThan(A.panel.y + A.panel.h);
  });

  it("族内间距两档恒定、族间空档随屏高线性放大(比例差 0.12 × Δh = 30)", () => {
    // 提示行(a+58) 到广告钮顶(bt) 的空档:996 档 62、1246 档 92
    expect(A.adBtn.y - A.hint.baseY).toBe(62);
    expect(B.adBtn.y - B.hint.baseY).toBe(92);
    expect(B.adBtn.y - B.hint.baseY - (A.adBtn.y - A.hint.baseY)).toBe(30);
    // 族内:三枚钮的顶缘差与钮宽在两档逐位相同
    expect(B.diamondBtn.y - B.adBtn.y).toBe(62);
    expect(A.diamondBtn.y - A.adBtn.y).toBe(62);
    expect(B.adBtn.w).toBe(A.adBtn.w);
    const layout = fileSource("../cocos/assets/scripts/game/ui/energyLayout.ts");
    expect(layout.includes("spreadRows")).toBe(false);
  });
});

/* ==================== 3. 形态位不改几何 ==================== */

describe("两个形态位都不改一枚矩形(本层没有形态位入参)", () => {
  const base = JSON.stringify(laid(H_STD));

  it("energyScreenLayout 只收 (w, h) 两个实参,且与 energyLayout 同出口同结果", () => {
    expect(energyScreenLayout.length).toBe(2);
    expect(energyLayout.length).toBe(2);
    expect(JSON.stringify(energyScreenLayout(W, H_STD))).toBe(base);
  });

  it("四个极端读数下几何纹丝不动", () => {
    for (const s of [save({ energy: ENERGY_MAX }), save({ energyAdCount: ENERGY_AD_LIMIT }), save({ energyAdCount: ENERGY_AD_LIMIT + 3 }), save({ diamond: 0 })]) {
      buildEnergyContent(s);
      expect(JSON.stringify(laid(H_STD))).toBe(base);
    }
  });
});

/* ==================== 4. 内容分支 ==================== */

describe("一屏文案的分支(逐字对标 Web drawEnergy 的 fillText 实参)", () => {
  it("三行固定文字:标题 / 提示 / 关闭 / 返回", () => {
    const c = buildEnergyContent(save());
    expect(c.title).toBe("体力不足");
    expect(c.hint).toBe("补充体力继续闯关,或关闭回到主菜单");
    expect(c.closeText).toBe("关闭");
    expect(c.backText).toBe("返回");
  });

  it("读数行 = 体力 N/MAX · 每 X 分钟恢复 1 点,X 由共享层常量除以 60 且不取整", () => {
    const c = buildEnergyContent(save({ energy: 3 }));
    expect(c.statLine).toBe(`体力 3/${ENERGY_MAX} · 每 ${ENERGY_REGEN_SECONDS / 60} 分钟恢复 1 点`);
    expect(c.statLine).toBe("体力 3/20 · 每 6 分钟恢复 1 点");
    // 表值换成 90 就是 1.5 —— 这一行念的是节奏,不是倒计时,也没有 Math.round
    expect(c.statLine.includes("秒")).toBe(false);
    expect(c.statLine.includes("后")).toBe(false);
  });

  it("体力满档那一支没有专属文案:读数照写 20/20,提示行也不改", () => {
    const c = buildEnergyContent(save({ energy: ENERGY_MAX }));
    expect(c.statLine).toBe(`体力 ${ENERGY_MAX}/${ENERGY_MAX} · 每 ${ENERGY_REGEN_SECONDS / 60} 分钟恢复 1 点`);
    expect(c.hint).toBe("补充体力继续闯关,或关闭回到主菜单");
  });

  it("广告余量档:剩 N 次的读数与用尽档的整串提示(Web 的两档只差文案)", () => {
    expect(buildEnergyContent(save({ energyAdCount: 0 })).adText).toBe(`▶ 看广告 +${ENERGY_AD_GAIN} 体力(今日剩 ${ENERGY_AD_LIMIT} 次)`);
    expect(buildEnergyContent(save({ energyAdCount: 0 })).adText).toBe("▶ 看广告 +5 体力(今日剩 5 次)");
    expect(buildEnergyContent(save({ energyAdCount: ENERGY_AD_LIMIT - 1 })).adText).toBe("▶ 看广告 +5 体力(今日剩 1 次)");
    expect(buildEnergyContent(save({ energyAdCount: ENERGY_AD_LIMIT })).adText).toBe("今日广告回体力已用尽");
  });

  it("adLeft 是原样相减:次数被手改到上限之上时给负数,canAd 仍为假", () => {
    const over = buildEnergyContent(save({ energyAdCount: ENERGY_AD_LIMIT + 3 }));
    expect(over.adLeft).toBe(-3);
    expect(over.canAd).toBe(false);
    expect(over.adText).toBe("今日广告回体力已用尽");
    expect(buildEnergyContent(save({ energyAdCount: 0 })).canAd).toBe(true);
    expect(buildEnergyContent(save({ energyAdCount: ENERGY_AD_LIMIT - 1 })).adLeft).toBe(1);
  });

  it("钻石档:够与不够都写同一串,只有 canDiamond 变", () => {
    expect(buildEnergyContent(save({ diamond: 12 })).diamondText).toBe(`钻石回满体力(${ENERGY_DIAMOND_COST}◆ · 持有 12)`);
    expect(buildEnergyContent(save({ diamond: 0 })).diamondText).toBe("钻石回满体力(10◆ · 持有 0)");
    expect(buildEnergyContent(save({ diamond: ENERGY_DIAMOND_COST })).canDiamond).toBe(true);
    expect(buildEnergyContent(save({ diamond: ENERGY_DIAMOND_COST - 1 })).canDiamond).toBe(false);
    expect(buildEnergyContent(save({ diamond: 0 })).canDiamond).toBe(false);
  });

  it("同一份入参永远同一屏(没有随机源、没有时钟)", () => {
    const s = save({ energy: 7, energyAdCount: 2, diamond: 3 });
    expect(JSON.stringify(buildEnergyContent(s))).toBe(JSON.stringify(buildEnergyContent(s)));
  });
});

/* ==================== 5. 写入意图 ==================== */

describe("两笔写入意图(守卫与入账口径逐项对标 Web onEnergyClick)", () => {
  it("广告:不足上限时 +GAIN 并把次数加一,写盘位为真", () => {
    const claim = energyAdClaim(3, 1);
    expect(claim).toEqual({ kind: "ad", persists: true, gained: ENERGY_AD_GAIN, energyAfter: 3 + ENERGY_AD_GAIN, adCountAfter: 2 });
  });

  it("广告:贴顶时按上限截断,gained 只剩到顶的那一截", () => {
    const near = energyAdClaim(ENERGY_MAX - 2, 0);
    expect(near?.energyAfter).toBe(ENERGY_MAX);
    expect(near?.gained).toBe(2);
    const full = energyAdClaim(ENERGY_MAX, 0);
    expect(full?.gained).toBe(0);
    expect(full?.energyAfter).toBe(ENERGY_MAX);
    expect(full?.adCountAfter).toBe(1);
  });

  it("广告:次数到上限即 null(发起广告之前的那一道守卫)", () => {
    expect(energyAdClaim(3, ENERGY_AD_LIMIT - 1)).not.toBeNull();
    expect(energyAdClaim(3, ENERGY_AD_LIMIT)).toBeNull();
    expect(energyAdClaim(3, ENERGY_AD_LIMIT + 5)).toBeNull();
  });

  it("钻石:够价时扣一笔并把体力直接置满(与广告那支的累加不同口径)", () => {
    const claim = energyDiamondClaim(3, 12);
    expect(claim).toEqual({ kind: "diamond", persists: true, spent: ENERGY_DIAMOND_COST, diamondAfter: 12 - ENERGY_DIAMOND_COST, gained: ENERGY_MAX - 3, energyAfter: ENERGY_MAX });
  });

  it("钻石:恰好等于价就够;少 1 就 null", () => {
    expect(energyDiamondClaim(0, ENERGY_DIAMOND_COST)?.diamondAfter).toBe(0);
    expect(energyDiamondClaim(0, ENERGY_DIAMOND_COST - 1)).toBeNull();
    expect(energyDiamondClaim(ENERGY_MAX, 99)?.energyAfter).toBe(ENERGY_MAX);
  });

  it("钻石回满不看当前体力:满档时 gained 为 0 但意图仍成立(Web 无 if (energy < MAX) 前置)", () => {
    const c = energyDiamondClaim(ENERGY_MAX, 50);
    expect(c).not.toBeNull();
    expect(c?.gained).toBe(0);
    expect(c?.diamondAfter).toBe(50 - ENERGY_DIAMOND_COST);
  });

  it("自然恢复那一步仍归共享层 regenEnergy:满值时只把时间戳推到 now,不足时按整段补", () => {
    const t0 = 1_000_000;
    expect(regenEnergy(ENERGY_MAX, t0, t0 + 999999)).toEqual({ energy: ENERGY_MAX, lastEnergyAt: t0 + 999999 });
    const one = regenEnergy(5, t0, t0 + ENERGY_REGEN_SECONDS * 1000);
    expect(one.energy).toBe(6);
    expect(one.lastEnergyAt).toBe(t0 + ENERGY_REGEN_SECONDS * 1000);
    const capped = regenEnergy(ENERGY_MAX - 1, t0, t0 + ENERGY_REGEN_SECONDS * 1000 * 99);
    expect(capped.energy).toBe(ENERGY_MAX);
  });
});

/* ==================== 6. 命中 ==================== */

describe("四片热区(顺序与 Web onEnergyClick 逐条对应)", () => {
  const L = laid(H_STD);

  it("四片各自的中点命中自己", () => {
    expect(hitEnergy(L, ...mid(L.backBtn))).toEqual({ kind: "back" });
    expect(hitEnergy(L, ...mid(L.adBtn))).toEqual({ kind: "ad" });
    expect(hitEnergy(L, ...mid(L.diamondBtn))).toEqual({ kind: "diamond" });
    expect(hitEnergy(L, ...mid(L.closeBtn))).toEqual({ kind: "close" });
  });

  it("边界inclusive:四条边的端点都算命中(Web 的 >= 与 <=)", () => {
    for (const [r, kind] of [[L.adBtn, "ad"], [L.diamondBtn, "diamond"], [L.closeBtn, "close"], [L.backBtn, "back"]] as Array<[EnRect, string]>) {
      expect(hitEnergy(L, r.x, r.y)?.kind).toBe(kind);
      expect(hitEnergy(L, right(r), r.y)?.kind).toBe(kind);
      expect(hitEnergy(L, r.x, bottom(r))?.kind).toBe(kind);
      expect(hitEnergy(L, right(r), bottom(r))?.kind).toBe(kind);
    }
  });

  it("钮缝与屏角与文字区都被吞掉(Web 没有「其余一律」兜底)", () => {
    expect(hitEnergy(L, 280, bottom(L.adBtn) + 5)).toBeNull();
    expect(hitEnergy(L, 280, bottom(L.diamondBtn) + 5)).toBeNull();
    expect(hitEnergy(L, 280, 299)).toBeNull();
    expect(hitEnergy(L, 280, 357)).toBeNull();
    expect(hitEnergy(L, 4, 4)).toBeNull();
    expect(hitEnergy(L, 280, bottom(L.closeBtn) + 20)).toBeNull();
    expect(hitEnergy(L, 119, mid(L.adBtn)[1])).toBeNull();
    expect(hitEnergy(L, 441, mid(L.adBtn)[1])).toBeNull();
  });

  it("返回钮在按钮列之外:缘外 1px 不命中、钮心命中,同一 y 上左右两片互不越界", () => {
    expect(L.backBtn.x).toBe(472);
    expect(hitEnergy(L, L.backBtn.x - 1, 39)).toBeNull();
    expect(hitEnergy(L, right(L.backBtn) + 1, 39)).toBeNull();
    expect(hitEnergy(L, mid(L.backBtn)[0], 39)?.kind).toBe("back");
    expect(right(L.backBtn)).toBeLessThanOrEqual(W - PAD);
    expect(L.backBtn.x).toBeGreaterThanOrEqual(bottom(L.adBtn) - L.adBtn.h);
    expect(L.backBtn.x > right(L.adBtn)).toBe(true);
  });

  it("用尽与不足都照样返回动作:静默在写入意图的守卫里(Web 命中之后再 return)", () => {
    const exhausted = save({ energyAdCount: ENERGY_AD_LIMIT, diamond: 0 });
    const c = buildEnergyContent(exhausted);
    expect(c.canAd).toBe(false);
    expect(c.canDiamond).toBe(false);
    // 命中层不看这两个位:同一坐标仍然返回 ad / diamond
    expect(hitEnergy(L, ...mid(L.adBtn))).toEqual({ kind: "ad" });
    expect(hitEnergy(L, ...mid(L.diamondBtn))).toEqual({ kind: "diamond" });
    // 宿主据此不发起广告、不扣钻石
    expect(energyAdClaim(exhausted.energy, exhausted.energyAdCount)).toBeNull();
    expect(energyDiamondClaim(exhausted.energy, exhausted.diamond)).toBeNull();
  });

  it("命中顺序与 Web 一致:返回 → 广告 → 钻石 → 关闭(四片互不相交故顺序不产生差别)", () => {
    const src = webDrawEnergy();
    const order = ["L.backBtn", "L.adBtn", "L.diamondBtn", "L.closeBtn"].map((k) => src.indexOf(`if (p.x >= ${k}.x`));
    expect(order.every((v) => v > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});

/* ==================== 7. 文案逐字对标 Web ==================== */

describe("文案与热区字面量在 Web 基准里逐字成对", () => {
  const web = webDrawEnergy();

  it("四处整串字面量在 src/game.ts 里逐字命中", () => {
    for (const lit of ["体力不足", "补充体力继续闯关,或关闭回到主菜单", "今日广告回体力已用尽", "关闭", "返回"]) {
      expect(web.includes(lit)).toBe(true);
    }
  });

  it("三处模板串的静态段逐段命中(整串比对必然假阴)", () => {
    const { c } = screen(save({ energy: 3, energyAdCount: 0, diamond: 12 }));
    /** 从 Web 源码里抠出模板字面量本体,再按 `${` 切成静态段 */
    const statics = (re: RegExp): string[] => {
      const m = web.match(re);
      if (!m) throw new Error("Web 模板串找不到:" + re.source);
      return m[1].split(/\$\{[^}]*\}/).filter((s) => s.length > 0);
    };
    const byLine = statics(/fillText\(`(体力 \$\{[^`]*?)`, w \/ 2, h \* 0\.3 \+ 34\)/);
    expect(byLine.length).toBe(4);
    expect([byLine[0], byLine[1], byLine[2], byLine[3]]).toEqual(["体力 ", "/", " · 每 ", " 分钟恢复 1 点"]);
    expect(byLine[0] + 3 + byLine[1] + ENERGY_MAX + byLine[2] + ENERGY_REGEN_SECONDS / 60 + byLine[3]).toBe(c.statLine);
    const byAd = statics(/fillText\(canAd \? `(▶ 看广告 [^`]*?)` :/);
    expect(byAd.length).toBe(3);
    expect(byAd[0] + ENERGY_AD_GAIN + byAd[1] + ENERGY_AD_LIMIT + byAd[2]).toBe(c.adText);
    const byDia = statics(/fillText\(`(钻石回满体力[^`]*?)`,/);
    expect(byDia.length).toBe(3);
    expect(byDia[0] + ENERGY_DIAMOND_COST + byDia[1] + 12 + byDia[2]).toBe(c.diamondText);
    // 关键静态段直接钉住
    for (const seg of ["体力 ", " · 每 ", " 分钟恢复 1 点", "▶ 看广告 +", " 体力(今日剩 ", " 次)", "钻石回满体力(", "◆ · 持有 "]) {
      expect(web.includes(seg)).toBe(true);
    }
  });

  it("模型里出现的每一段中文字面量都能在 Web drawEnergy 段里找到", () => {
    const model = fileSource("../cocos/assets/scripts/energy/EnergyModel.ts");
    const code = codeOf(model);
    const lits = [...code.matchAll(/"([^"\n]*[㐀-鿿][^"\n]*)"/g)].map((m) => m[1]);
    expect(lits.length).toBeGreaterThanOrEqual(5);
    for (const lit of lits) expect(web.includes(lit)).toBe(true);
  });
});

/* ==================== 8. phase4 表的 en* 段 ==================== */

describe("phase4 表的 en* 段(默认值逐项对标 Web drawEnergy)", () => {
  const D = phase4Defaults();

  it("覆盖底与三行文字色", () => {
    expect(D.enDim).toBe("rgba(8,10,16,0.92)");
    expect(D.enTitle).toBe(theme.select.toUpperCase());
    expect(D.enTitle).toBe("#5AC8FA");
    expect(D.enStat).toBe("#E8E8E8");
    expect(D.enHint).toBe("#8F9BB3");
  });

  it("广告钮两档:可用 #1d3d2e + #4dffc8,用尽 #1a1f2a + rgba(255,255,255,0.15) 且文字 #5a6a80", () => {
    expect(D.enAdFallbackBg).toBe("#1D3D2E");
    expect(D.enAdFallbackStroke).toBe(theme.actionPrimary);
    expect(D.enAdText).toBe("#4DFFC8");
    expect(D.enAdOffBg).toBe("#1A1F2A");
    expect(D.enAdOffStroke).toBe("rgba(255,255,255,0.15)");
    expect(D.enAdTextOff).toBe(theme.textMuted.toUpperCase());
  });

  it("钻石钮两档:充足 #3a3320 + theme.gold,不足与广告用尽同套禁态配色", () => {
    expect(D.enDiamondFallbackBg).toBe("#3A3320");
    expect(D.enDiamondFallbackStroke).toBe("#FFD76A");
    expect(D.enDiamondText).toBe(theme.gold);
    expect(D.enDiamondOffBg).toBe(D.enAdOffBg);
    expect(D.enDiamondOffStroke).toBe(D.enAdOffStroke);
    expect(D.enDiamondTextOff).toBe(D.enAdTextOff);
  });

  it("两枚纯代码钮:关闭 #2a3d55 + #8f9bb3,返回 #2a3d55 + rgba(255,255,255,0.3),文字同为 #cfcfcf", () => {
    expect(D.enCloseBg).toBe("#2A3D55");
    expect(D.enCloseStroke).toBe("#8F9BB3");
    expect(D.enCloseText).toBe("#CFCFCF");
    expect(D.enBackBg).toBe("#2A3D55");
    expect(D.enBackStroke).toBe("rgba(255,255,255,0.3)");
    expect(D.enBackText).toBe("#CFCFCF");
  });

  it("本屏 22 个键全部存在且都被视图层取用(没有孤儿键)", () => {
    const keys = Object.keys(D).filter((k) => /^en[A-Z]/.test(k));
    expect(keys.length).toBe(22);
    const view = codeOf(fileSource("../cocos/assets/scripts/energy/EnergyView.ts"));
    for (const k of keys) expect(view.includes(`p4.${k}`)).toBe(true);
  });

  it("色值与 Web 字面量同数:小写字面量按本表大写档记录,不引入 theme 之外的色", () => {
    for (const [k, v] of Object.entries(D)) {
      if (!/^en[A-Z]/.test(k)) continue;
      expect(v.startsWith("rgba(") || /^#[0-9A-F]{6}$/.test(v)).toBe(true);
    }
  });
});

/* ==================== 9. 层职责纪律 ==================== */

describe("三层分工的源码纪律", () => {
  it("视图层不内联任何一枚盒与基线:几何只能来自 energyScreenLayout", () => {
    const view = codeOf(fileSource("../cocos/assets/scripts/energy/EnergyView.ts"));
    const body = bodyOf(view);
    // 视图里出现的数字只允许是零位盒(0)、缓存哨兵(-1 的 1)、lineHeight 系数(1.25)
    // 与暗底折中心锚点的除数(2)
    const nums = [...body.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    const allowed = new Set([0, 1, 1.25, 2]);
    const offenders = nums.filter((n) => !allowed.has(n));
    expect(offenders).toEqual([]);
    expect((body.match(/-r\.w \/ 2|-r\.h \/ 2/g) || []).length).toBe(2);
    expect(body.includes("L.adBtn")).toBe(true);
    expect(body.includes("L.diamondBtn")).toBe(true);
    expect(body.includes("L.closeBtn")).toBe(true);
    expect(body.includes("L.backBtn")).toBe(true);
    expect(body.includes("L.panelKey")).toBe(true);
  });

  it("视图层用 rowTextY 的只有几何层:视图内不出现 rowTextY", () => {
    expect(bodyOf(codeOf(fileSource("../cocos/assets/scripts/energy/EnergyView.ts"))).includes("rowTextY")).toBe(false);
    expect(fileSource("../cocos/assets/scripts/game/ui/energyLayout.ts").includes("rowTextY")).toBe(true);
  });

  it("布局层不读存档也不查体力表", () => {
    const layout = codeOf(fileSource("../cocos/assets/scripts/game/ui/energyLayout.ts"));
    for (const banned of ["ENERGY_MAX", "ENERGY_AD_LIMIT", "ENERGY_DIAMOND_COST", "save."]) expect(layout.includes(banned)).toBe(false);
    expect(layout.includes("from \"./theme\"")).toBe(true);
  });

  it("字号七档全在 fs 表内(本屏没有 Web 写死的表外档)", () => {
    const L = laid(H_STD);
    const inFs: number[] = [FS.display, FS.title, FS.section, FS.body, FS.muted, FS.micro];
    for (const px of [L.title.px, L.statLine.px, L.hint.px, L.adText.px, L.diamondText.px, L.closeText.px, L.backText.px]) {
      expect(inFs.includes(px)).toBe(true);
    }
    expect([L.title.px, L.statLine.px, L.hint.px, L.adText.px, L.diamondText.px, L.closeText.px, L.backText.px]).toEqual([22, 14, 13, 14, 13, 14, 13]);
  });

  it("三枚钮的贴图档与 Web 同一条写法:可用档才试 btn_primary", () => {
    const view = codeOf(fileSource("../cocos/assets/scripts/energy/EnergyView.ts"));
    expect(view.includes('c.canAd ? KEY_PRIMARY : ""')).toBe(true);
    expect(view.includes('c.canDiamond ? KEY_PRIMARY : ""')).toBe(true);
    expect(webDrawEnergy().includes('skinButtonBase(g, this.assets, "btn_primary"')).toBe(true);
  });
});

/* ==================== 10. import 完整性(门 3 抓不到的那一类) ==================== */

describe("import 完整性:每一个用到的出口都必须在 import 清单里", () => {
  const layoutSpec = { label: "energyLayout", ns: cocosEnergyLayout as unknown as Record<string, unknown> };
  const modelSpec = { label: "EnergyModel", ns: cocosEnergyModel as unknown as Record<string, unknown> };

  it("EnergyView 用到的布局/模型出口全部在它的 import 清单里", () => {
    expect(missingImports("../cocos/assets/scripts/energy/EnergyView.ts", [layoutSpec, modelSpec])).toEqual([]);
  });

  it("GameShell 用到的 energy 三层出口全部在它的 import 清单里", () => {
    expect(missingImports("../cocos/assets/scripts/GameShell.ts", [layoutSpec, modelSpec])).toEqual([]);
  });

  it("EnergyModel 用到的布局出口也在清单里", () => {
    expect(missingImports("../cocos/assets/scripts/energy/EnergyModel.ts", [layoutSpec])).toEqual([]);
  });

  it("同一把尺子量已落地的通关屏:曾经漏掉的 victoryBadgeTextLine 现在在清单里", () => {
    expect(
      missingImports("../cocos/assets/scripts/victory/VictoryView.ts", [
        { label: "victoryLayout", ns: cocosVictoryLayout as unknown as Record<string, unknown> },
        { label: "VictoryModel", ns: cocosVictoryModel as unknown as Record<string, unknown> },
      ])
    ).toEqual([]);
  });
});
