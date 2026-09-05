/**
 * Phase 4 第三屏闸门:赛季通行证(双轨领取 + 广告激活)。
 *
 * 延续 cocos-phase4-daily 的三条纪律:
 *  1. **端间同一实现**:Cocos 宿主侧 `pass/PassModel.ts` 经相对路径 import 的共享层,
 *     与 Web 侧经 `@game` 别名 import 的是同一个模块实例(函数引用 `toBe` 相同),
 *     于是档位表与进度公式不可能出现"两份抄本";
 *  2. **断言按门控变量分档**:行数 = `PASS_TIERS.length`、第 k 行是否已领 = `k < passTier`、
 *     右文三态取哪一档 = `claimed / unlocked / 否则`、倍率是否生效 = `premiumActive()`,
 *     全部由表长与存档推出来,不钉死随表变动的数字;
 *  3. **视图无关**:本文件只吃 cc-free 的 `PassModel.ts` 与共享层纯布局,不需要引擎与浏览器;
 *     配色档通过读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS` 字面量来锁
 *     (那一侧 import 了 `cc`,不能在 node 侧直载)。
 *
 * 覆盖派单要求的条目:几何在 996 与 1246 两档屏高下都不越界、全网格文本带落 0..560、
 * 三处文本逐字、`premiumActive` 两分支的文案与配色档、`premiumPassSeason` 与 `seasonId`
 * 比较的赛季作用域(翻页自动转假)、激活行点击写 `premiumPassSeason` 且走广告、
 * 领取按 `passTier` 顺序推进且倍率正确、**点任意非热区都领下一档**这条 Web 原样行为、
 * 以及 `PASS_PREMIUM_MULT === 2` 与"高级行文字仍是字面量 ×2"这一对锁。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ---------- 共享层(Web 与 Cocos 共用的单一事实源) ---------- */
import { PASS_PREMIUM_MULT, PASS_STAR_WEIGHT, PASS_TIERS, calcPassProgress } from "@game/data/pass";
import { fs as FS, rowTextY, ui as UI } from "@game/ui/theme";
import * as sharedPass from "@game/data/pass";
import {
  passLayout,
  passProgressRects,
  passScreenLayout,
  PS_ACT_H,
  PS_ACT_Y,
  PS_CHECK_BOX,
  PS_CHECK_DY,
  PS_CHECK_INSET,
  PS_ECHO_BASE_Y,
  PS_FREE_DY,
  PS_HEADER_H,
  PS_HEADER_INSET,
  PS_HEADER_TITLE_DY,
  PS_HEADER_W,
  PS_LIST_GAP,
  PS_LIST_BOTTOM_INSET,
  PS_NAME_DY,
  PS_NODE_TRACK_DY,
  PS_NODE_TRACK_H,
  PS_PREM_BADGE_H,
  PS_PREM_BADGE_W,
  PS_PREM_BADGE_Y,
  PS_PREM_BASE_Y,
  PS_PREMIUM_DY,
  PS_PREM_TEXT_GAP,
  PS_PROGRESS_BOTTOM_INSET,
  PS_PROGRESS_H,
  PS_PROGRESS_LABEL_DY,
  PS_ROW_MAX_GAP,
  PS_ROW_MAX_H,
  PS_ROW_MIN_H,
  PS_STATUS_INSET,
  PS_TEXT_DX,
  PS_TITLE_BASE_Y,
  type PsRect,
  type PsTextLine,
} from "@game/ui/passLayout";

/* ---------- Cocos 宿主侧(本文件的被测物;只吃 cc-free 模型,不碰视图) ---------- */
import {
  buildPassContent,
  passClaim,
  passProgress,
  hitPass,
  premiumActive,
  type PassAction,
  type PassSaveView,
} from "../cocos/assets/scripts/pass/PassModel";
import * as cocosPass from "../cocos/assets/scripts/game/data/pass";
import { alignAx, anchorBand, type Band, type TextAlign } from "../cocos/assets/scripts/ui/TextBand";

const W = 560;
const H_STD = 996;
const H_TALL = 1246;
const PAD = UI.pad;
/** lift 与运行时同源:表现参数只认 resources/config/viewTable.json 那一份 */
const LIFT: number = JSON.parse(readFileSync(new URL("../cocos/assets/resources/config/viewTable.json", import.meta.url), "utf8")).menu.baselineLift;

/** 够拿到最高档的进度(由表尾推导,不写死数值) */
const TOP_NEED = PASS_TIERS[PASS_TIERS.length - 1].need;
const RICH = TOP_NEED * 4;

function save(over: Partial<PassSaveView> = {}): PassSaveView {
  return {
    points: 0,
    dayEcho: 0,
    stageStars: [],
    seasonId: 1,
    premiumPass: false,
    premiumPassSeason: 0,
    passTier: 0,
    ...over,
  };
}

/** 高级轨生效与不生效两档存档(生效走"本赛季看广告激活"这一档,不碰遗留布尔) */
const PREM_ON = { premiumPassSeason: 1 };
const PREM_OFF = { premiumPassSeason: 0 };

/** 存档 → 累计回响(与模型同源,用于把进度精确摆到某一档的门槛上) */
const progOf = (s: PassSaveView): number => passProgress(s);

const center = (r: PsRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ==================== 0. 端间同一实现(R1/R9 纪律延续到 Phase 4) ==================== */

describe("Cocos 宿主与共享层的模块同一性", () => {
  it("宿主侧 game/data/pass 与 @game 解析到同一份档位表与公式(不是两份抄本)", () => {
    expect(cocosPass.calcPassProgress).toBe(calcPassProgress);
    expect(cocosPass.calcPassProgress).toBe(sharedPass.calcPassProgress);
    expect(cocosPass.PASS_TIERS).toBe(PASS_TIERS);
    expect(cocosPass.PASS_PREMIUM_MULT).toBe(PASS_PREMIUM_MULT);
    expect(cocosPass.PASS_STAR_WEIGHT).toBe(PASS_STAR_WEIGHT);
  });

  it("passScreenLayout 就是 passLayout 那一份(几何单一出口只在共享层)", () => {
    expect(passScreenLayout(W, H_STD)).toEqual(passLayout(W, H_STD));
    expect(passScreenLayout(W, H_TALL)).toEqual(passLayout(W, H_TALL));
  });

  it("派单要求的倍率锁:PASS_PREMIUM_MULT === 2", () => {
    expect(PASS_PREMIUM_MULT).toBe(2);
  });
});

/* ==================== 1. 行数与行区:spreadRows 六实参的口径原样带上 ==================== */

describe("档位行几何(996 与 1246 两档屏高)", () => {
  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:行数 = PASS_TIERS.length、行区在 [listY0, h − ${PS_LIST_BOTTOM_INSET}] 内摊开且不越界`, () => {
      const L = passLayout(W, h);
      expect(L.rowCount).toBe(PASS_TIERS.length);
      expect(L.rows).toHaveLength(PASS_TIERS.length);
      expect(L.listY0).toBe(PS_ACT_Y + PS_ACT_H + PS_LIST_GAP);
      // 第六实参 maxGap 与 minH/maxH 三档都来自 Web 的调用位,不是 daily 用的默认档
      expect(L.rowH).toBeGreaterThanOrEqual(PS_ROW_MIN_H);
      expect(L.rowH).toBeLessThanOrEqual(PS_ROW_MAX_H);
      expect(L.gap).toBeGreaterThanOrEqual(0);
      expect(L.gap).toBeLessThanOrEqual(PS_ROW_MAX_GAP);
      const step = L.rowH + L.gap;
      const bottomLimit = h - PS_LIST_BOTTOM_INSET;
      L.rows.forEach((row, i) => {
        expect(row.index).toBe(i);
        expect(row.rect.y, `行${i} 递推`).toBe(L.listY0 + i * step);
        expect(row.rect.x).toBe(PAD);
        expect(row.rect.w).toBe(W - PAD * 2);
        expect(row.rect.h).toBe(L.rowH);
        expect(row.rect.x).toBeGreaterThanOrEqual(0);
        expect(row.rect.x + row.rect.w).toBeLessThanOrEqual(W);
        expect(row.rect.y + row.rect.h, `行${i} 底边`).toBeLessThanOrEqual(bottomLimit);
      });
      // 行区首行在激活行之下,末行底边在总进度条之上(三处纵向热区互不重叠)
      expect(L.rows[0].rect.y).toBeGreaterThanOrEqual(L.actRect.y + L.actRect.h + PS_LIST_GAP);
      expect(L.rows[L.rows.length - 1].rect.y + L.rowH).toBeLessThanOrEqual(L.progressBar.y);
    });
  }

  it("行距上限就是第六实参的 60(Web 传 60,daily 用默认 20 —— 两屏不同,不许统一)", () => {
    expect(PS_ROW_MAX_GAP).toBe(60);
    for (const h of [H_STD, H_TALL]) expect(passLayout(W, h).gap).toBe(PS_ROW_MAX_GAP);
  });

  it("屏高变高只把行区留白挪到列表尾,行高与行距按同一钳制档走", () => {
    const a = passLayout(W, H_STD);
    const b = passLayout(W, H_TALL);
    expect(b.rowH).toBe(a.rowH);
    expect(b.gap).toBe(a.gap);
    expect(b.listY0).toBe(a.listY0);
    // 进度条与返回钮才是跟着屏高走的两个贴底/贴顶件
    expect(b.progressBar.y - a.progressBar.y).toBe(H_TALL - H_STD);
    expect(b.backBtn.y).toBe(a.backBtn.y);
  });
});

/* ==================== 2. 屏级矩形:激活行 / 节点轨道 / 总进度条 / 返回钮 / 横幅 ==================== */

describe("屏级矩形与 Web 的实参逐位对应", () => {
  it("激活行 = passActRect(pad, 92, w − pad×2, 40),绘制与命中同一矩形来源", () => {
    const L = passLayout(W, H_STD);
    expect(L.actRect).toEqual({ x: PAD, y: PS_ACT_Y, w: W - PAD * 2, h: PS_ACT_H });
  });

  it("节点轨道贴在 listY0 之上 10px(Web 的 `listY0 - 10`,缺图就是不画)", () => {
    const L = passLayout(W, H_STD);
    expect(L.nodeTrack).toEqual({ x: PAD, y: L.listY0 + PS_NODE_TRACK_DY, w: W - PAD * 2, h: PS_NODE_TRACK_H });
    expect(L.nodeTrack.y + L.nodeTrack.h).toBeLessThanOrEqual(L.rows[0].rect.y);
  });

  it("总进度条贴底 pbY = h − 44,文字基线在条顶之上 6", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = passLayout(W, h);
      expect(L.progressBar).toEqual({ x: PAD, y: h - PS_PROGRESS_BOTTOM_INSET, w: W - PAD * 2, h: PS_PROGRESS_H });
      expect(L.progressLabel.baseY).toBe(L.progressBar.y + PS_PROGRESS_LABEL_DY);
      expect(L.progressLabel.px).toBe(FS.micro);
    }
  });

  it("标题横幅用 skinHeader 的默认宽 220(daily 显式传 244,两屏不同)", () => {
    const L = passLayout(W, H_STD);
    expect(L.headerPlate).toEqual({ x: PAD - PS_HEADER_INSET, y: PS_TITLE_BASE_Y - PS_HEADER_H + PS_HEADER_INSET, w: PS_HEADER_W, h: PS_HEADER_H });
    expect(L.headerPlate.y + L.headerPlate.h).toBeLessThan(PS_ECHO_BASE_Y);
    expect(PS_HEADER_W).toBe(220);
    expect(L.titleOnBanner.x).toBe(L.headerPlate.x + PS_HEADER_W / 2);
    expect(L.titleOnBanner.baseY).toBe(PS_TITLE_BASE_Y - PS_HEADER_TITLE_DY);
    expect(L.titleOnBanner.align).toBe("center");
    expect(L.titleBare.x).toBe(PAD);
    expect(L.titleBare.baseY).toBe(PS_TITLE_BASE_Y);
    expect(L.titleBare.align).toBe("left");
    // 横幅在屏幕上不越过返回钮左界
    expect(L.headerPlate.x + L.headerPlate.w).toBeLessThan(L.backBtn.x);
  });

  it("返回钮:贴图盒 + 两档文字位(Web skinIconButton 的 hasIcon 分支)", () => {
    const L = passLayout(W, H_STD);
    expect(L.backBtn).toEqual({ x: W - PAD - UI.backW, y: L.backBtn.y, w: UI.backW, h: UI.backH });
    const ih = UI.backH - 12;
    expect(L.backIcon).toEqual({ x: L.backBtn.x + 4, y: L.backBtn.y + (UI.backH - ih) / 2, w: ih, h: ih });
    expect(L.backTextBare.x).toBe(L.backBtn.x + UI.backW / 2);
    expect(L.backTextWithIcon.x).toBe(L.backBtn.x + 4 + ih + (UI.backW - 4 - ih) / 2);
    expect(L.backTextWithIcon.maxW).toBe(UI.backW - 4 - ih);
    for (const t of [L.backTextBare, L.backTextWithIcon]) {
      expect(t.baseY).toBe(L.backBtn.y + UI.backH / 2 + 5);
      expect(t.px).toBe(FS.body);
      expect(t.align).toBe("center");
    }
  });
});

/* ==================== 3. 行内四段文本:三段左 + 一段右(两档基线) ==================== */

describe("行内文本锚点(与 drawPass 的 fillText 实参逐位对应)", () => {
  for (const h of [H_STD, H_TALL]) {
    it(`h=${h}:左三段起笔都是 pad+8,基线是 y + rowH/2 ${PS_NAME_DY} / +${PS_FREE_DY} / +${PS_PREMIUM_DY}`, () => {
      const L = passLayout(W, h);
      for (const row of L.rows) {
        const mid = row.rect.y + row.rect.h / 2;
        for (const line of [row.name, row.free, row.premium]) expect(line.x).toBe(PAD + PS_TEXT_DX);
        expect(row.name.baseY).toBe(mid + PS_NAME_DY);
        expect(row.free.baseY).toBe(mid + PS_FREE_DY);
        expect(row.premium.baseY).toBe(mid + PS_PREMIUM_DY);
        expect(row.name.px).toBe(FS.body);
        expect(row.free.px).toBe(FS.muted);
        expect(row.premium.px).toBe(FS.muted);
        // 三段都在行内
        expect(row.name.baseY).toBeGreaterThanOrEqual(row.rect.y);
        expect(row.premium.baseY).toBeLessThanOrEqual(row.rect.y + row.rect.h);
      }
    });

    it(`h=${h}:右列末笔锚点 w − pad − 8,基线按字号分两档(可领取用 body)`, () => {
      const L = passLayout(W, h);
      for (const row of L.rows) {
        const statusX = W - PAD - PS_STATUS_INSET;
        expect(row.statusMuted.x).toBe(statusX);
        expect(row.statusBody.x).toBe(statusX);
        expect(row.statusMuted.align).toBe("right");
        expect(row.statusBody.align).toBe("right");
        expect(row.statusMuted.baseY).toBe(rowTextY(row.rect.y, row.rect.h, FS.muted));
        expect(row.statusBody.baseY).toBe(rowTextY(row.rect.y, row.rect.h, FS.body));
        expect(row.statusBody.baseY).toBeGreaterThanOrEqual(row.statusMuted.baseY);
        expect(row.statusMuted.px).toBe(FS.muted);
        expect(row.statusBody.px).toBe(FS.body);
        // 对勾贴图位(Web 只在已领分支画)
        expect(row.check).toEqual({ x: W - PAD - PS_CHECK_INSET, y: row.rect.y + row.rect.h / 2 + PS_CHECK_DY, w: PS_CHECK_BOX, h: PS_CHECK_BOX });
        expect(row.check.x + row.check.w).toBeLessThan(statusX);
      }
    });
  }

  it("回响统计行与高级轨状态行的基线就是 Web 的两个字面量位", () => {
    const L = passLayout(W, H_STD);
    expect(L.echo).toMatchObject({ x: PAD, baseY: PS_ECHO_BASE_Y, px: FS.body, align: "left" });
    expect(L.premBadge).toEqual({ x: PAD, y: PS_PREM_BADGE_Y, w: PS_PREM_BADGE_W, h: PS_PREM_BADGE_H });
    expect(L.premTextWithBadge.x).toBe(PAD + PS_PREM_TEXT_GAP);
    expect(L.premTextBare.x).toBe(PAD);
    expect(L.premTextWithBadge.baseY).toBe(PS_PREM_BASE_Y);
    expect(L.premTextBare.baseY).toBe(PS_PREM_BASE_Y);
    expect(L.premTextBare.px).toBe(FS.muted);
  });

  it("激活行两档文字:已激活左起笔于 pad(muted 基线),未激活整屏居中(body 基线)", () => {
    const L = passLayout(W, H_STD);
    expect(L.actDoneText).toMatchObject({ x: PAD, baseY: rowTextY(PS_ACT_Y, PS_ACT_H, FS.muted), px: FS.muted, align: "left" });
    expect(L.actBtnText).toMatchObject({ x: W / 2, baseY: rowTextY(PS_ACT_Y, PS_ACT_H, FS.body), px: FS.body, align: "center" });
    expect(L.actPlate).toEqual({ key: "btn_primary", radius: 10 });
  });
});

/* ==================== 4. 全网格文本带落在 0..560(右对齐与两档返回钮尤其) ==================== */

interface TextRequest {
  at: string;
  x: number;
  baseY: number;
  maxW: number;
  px: number;
  align: TextAlign;
}

const bandOf = (t: TextRequest): Band => anchorBand(t.x, t.baseY, t.maxW, t.px, t.align, LIFT);
const lineReq = (at: string, l: PsTextLine): TextRequest => ({ at, x: l.x, baseY: l.baseY, maxW: l.maxW, px: l.px, align: l.align });

/** 逐条对应 PassView.sync 里的 Txt.set 调用(两档分支都收,与 Web 一样按贴图在否二选一) */
function textBands(h: number): TextRequest[] {
  const L = passLayout(W, h);
  const out: TextRequest[] = [
    lineReq("标题(横幅内)", L.titleOnBanner),
    lineReq("标题(缺图回退)", L.titleBare),
    lineReq("回响统计行", L.echo),
    lineReq("高级轨(带徽标)", L.premTextWithBadge),
    lineReq("高级轨(缺徽标)", L.premTextBare),
    lineReq("激活行(已激活)", L.actDoneText),
    lineReq("激活行(按钮)", L.actBtnText),
    lineReq("返回钮(有图标)", L.backTextWithIcon),
    lineReq("返回钮(缺图标)", L.backTextBare),
    lineReq("总进度文字", L.progressLabel),
  ];
  L.rows.forEach((row, i) => {
    out.push(
      lineReq(`行${i}档位`, row.name),
      lineReq(`行${i}免费`, row.free),
      lineReq(`行${i}高级`, row.premium),
      lineReq(`行${i}状态(muted)`, row.statusMuted),
      lineReq(`行${i}状态(body)`, row.statusBody)
    );
  });
  return out;
}

describe("文本带右界(passLayout 全网格)", () => {
  it("anchorBand 的对齐锚点三条恒成立(起笔 / 中心 / 末笔)", () => {
    expect([alignAx("left"), alignAx("center"), alignAx("right")]).toEqual([0, 0.5, 1]);
    const b = (align: TextAlign) => anchorBand(300, 58, 160, FS.muted, align, LIFT);
    expect(b("left").x).toBe(300);
    expect(b("center").x + b("center").w / 2).toBe(300);
    expect(b("right").x + b("right").w).toBe(300);
  });

  it("两档屏高 × 全部行:每条文本带都落在 0..560", () => {
    for (const h of [H_STD, H_TALL]) {
      const bands = textBands(h);
      expect(bands.length, `h=${h}`).toBe(10 + PASS_TIERS.length * 5);
      const bad = bands
        .map((t) => {
          const b = bandOf(t);
          return b.x < 0 || b.x + b.w > W ? `${t.at} [${t.align}] 锚点${t.x} 限宽${t.maxW} → ${b.x}..${b.x + b.w}` : null;
        })
        .filter((s): s is string => !!s);
      expect(bad).toEqual([]);
    }
  });

  it("右对齐状态带末笔贴 w − pad − 8,不越右界(Phase 3 的翻车点)", () => {
    for (const h of [H_STD, H_TALL]) {
      const L = passLayout(W, h);
      for (const row of L.rows) {
        for (const line of [row.statusMuted, row.statusBody]) {
          const b = bandOf(lineReq("状态", line));
          expect(b.x + b.w, "末笔 = 右界锚点").toBe(W - PAD - PS_STATUS_INSET);
          expect(b.x + b.w).toBeLessThanOrEqual(W);
          expect(b.x).toBeGreaterThanOrEqual(0);
        }
        // 左三段限宽收到状态起笔前 10px,带子不压到右列
        for (const line of [row.name, row.free, row.premium]) {
          expect(bandOf(lineReq("左段", line)).x + bandOf(lineReq("左段", line)).w).toBeLessThanOrEqual(row.statusMuted.x);
        }
      }
    }
  });
});

/* ==================== 5. 内容:三处文本逐字 + premiumActive 两分支 ==================== */

describe("屏级文案逐字(对标 Web drawPass 的三处 fillText)", () => {
  it("回响统计行:`累计回响 prog · 本日 dayEcho · 永久 points`", () => {
    const s = save({ points: 120, dayEcho: 7, stageStars: [3, 2] });
    expect(progOf(s)).toBe(120 + 7 + (3 + 2) * PASS_STAR_WEIGHT);
    const c = buildPassContent(s);
    expect(c.echoText).toBe(`累计回响 ${progOf(s)} · 本日 7 · 永久 120`);
    expect(c.title).toBe("赛季通行证");
    expect(c.backText).toBe("返回");
  });

  it("高级轨状态行与徽标键两分支:已激活才尝试画徽标", () => {
    const on = buildPassContent(save(PREM_ON));
    const off = buildPassContent(save(PREM_OFF));
    expect(on.premText).toBe("高级轨已激活(奖励翻倍)");
    expect(off.premText).toBe("高级轨未激活");
    expect(on.premBadgeKey).toBe("badge_pennant_purple");
    // 未激活时 Web 根本不进 assets.draw 那一支
    expect(off.premBadgeKey).toBe("");
    expect(on.actButton).toBe(false);
    expect(off.actButton).toBe(true);
  });

  it("激活行三档文案由 premiumActive() 与 premiumPass 门控", () => {
    const ad = buildPassContent(save({ premiumPassSeason: 1 }));
    const legacy = buildPassContent(save({ premiumPass: true }));
    const off = buildPassContent(save({ premiumPass: false, premiumPassSeason: 0 }));
    expect(off.actText).toBe("▶ 看广告激活高级轨(奖励×2 · 本赛季有效)");
    expect(legacy.actText).toBe("✓ 已激活 · 档位奖励 ×2");
    expect(ad.actText).toBe("✓ 本赛季已看广告激活 · 档位奖励 ×2(下赛季需重新激活)");
    // 三条都是"已激活"档 → 这一格不放按钮底板
    for (const c of [ad, legacy]) expect(c.actButton).toBe(false);
  });

  it("档位行三处文本逐字:档位标题 / 免费轨 / 高级轨(后者在 Web 里是字面量)", () => {
    const c = buildPassContent(save({ points: RICH }));
    PASS_TIERS.forEach((tier, i) => {
      expect(c.rows[i].nameText).toBe(`档位 ${i + 1} · 回响 ${tier.need}`);
      expect(c.rows[i].freeText).toBe(`免费:扭蛋券×${tier.tickets} + 星尘×${tier.stardust}`);
      expect(c.rows[i].premiumText).toBe("高级:×2");
    });
  });

  it("`高级:×2` 的字面量锁:改倍率时这条与 PASS_PREMIUM_MULT 那条会一起响", () => {
    const c = buildPassContent(save());
    expect(c.rows[0].premiumText).toBe(`高级:×${PASS_PREMIUM_MULT}`);
    expect(PASS_PREMIUM_MULT).toBe(2);
  });

  it("总进度文字与分子分母:maxNeed = 表尾 need,分子取 min(prog, maxNeed)", () => {
    const low = buildPassContent(save({ points: 1 }));
    expect(low.maxNeed).toBe(TOP_NEED);
    expect(low.progressText).toBe(`总进度 1/${TOP_NEED}`);
    expect(low.progressFrac).toBeCloseTo(1 / TOP_NEED, 10);
    const high = buildPassContent(save({ points: RICH }));
    expect(high.progressText).toBe(`总进度 ${TOP_NEED}/${TOP_NEED}`);
    expect(high.progressFrac).toBeGreaterThan(1);
  });
});

/* ==================== 6. premiumActive 的赛季作用域(翻页自动转假,无需重置代码) ==================== */

describe("premiumActive:premiumPass 或 premiumPassSeason === seasonId", () => {
  it("本赛季看广告激活 → 真;赛季翻页后同一份 premiumPassSeason 自动转假", () => {
    expect(premiumActive(save({ premiumPassSeason: 1, seasonId: 1 }))).toBe(true);
    expect(premiumActive(save({ premiumPassSeason: 1, seasonId: 2 }))).toBe(false);
    expect(buildPassContent(save({ premiumPassSeason: 1, seasonId: 2 })).actButton).toBe(true);
    expect(buildPassContent(save({ premiumPassSeason: 1, seasonId: 2 })).actText).toBe("▶ 看广告激活高级轨(奖励×2 · 本赛季有效)");
  });

  it("遗留布尔 premiumPass 恒真(与 seasonId 无关),但不影响 seasonId 比较档", () => {
    expect(premiumActive(save({ premiumPass: true, premiumPassSeason: 0, seasonId: 9 }))).toBe(true);
    expect(premiumActive(save({ premiumPass: false, premiumPassSeason: 0, seasonId: 1 }))).toBe(false);
  });

  it("0 档存档不会误判:premiumPassSeason 初值 0 与 seasonId 1 不相等", () => {
    expect(premiumActive(save())).toBe(false);
  });
});

/* ==================== 7. 配色档:phase4 表的 ps* 默认值逐项对上 Web 字面量 ==================== */

/** 读 `core/ViewTable.ts` 源码里那段 `PHASE4_DEFAULTS`(那一侧 import cc,node 侧不能直载) */
function phase4Defaults(): Record<string, string> {
  const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
  const head = src.indexOf("export const PHASE4_DEFAULTS: Phase4Params = {");
  const body = src.slice(src.indexOf("{", head), src.indexOf("\n};", head));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s+(\w+):\s*"([^"]*)",$/gm)) out[m[1]] = m[2];
  return out;
}

/** Web 侧通行证屏的绘制与命中源码段(drawPass + onPassClick + 两个私有方法) */
function webPassSource(): string {
  const src = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
  const from = src.indexOf("private passProgress()");
  const to = src.indexOf("/* ---------- 幻影榜");
  return src.slice(from, to);
}

const PS_KEYS = [
  "psDim", "psTitle", "psEcho", "psPremOn", "psPremOff", "psActDone", "psActFallbackBg", "psActFallbackStroke", "psActText",
  "psRowClaimedBg", "psRowBg", "psRowStrokeUnlocked", "psRowStrokeLocked", "psRowNameUnlocked", "psRowNameLocked",
  "psRowFree", "psRowPremOn", "psRowPremOff", "psStatusClaimed", "psStatusReady", "psStatusLocked",
  "psProgressLabel", "psBarFallbackTrack", "psBarFallbackFill", "psBarCover", "psBackBg", "psBackStroke", "psBackText",
] as const;

describe("phase4 表的通行证配色档", () => {
  const defs = phase4Defaults();
  const web = webPassSource();

  it("每个 ps* 键都在表里给了默认值(Web 绘制路径里的内联字面量不留裸值在视图文件)", () => {
    for (const k of PS_KEYS) expect(defs[k], k).toBeTruthy();
  });

  it("每个 ps* 键都在 Phase4Params 接口里声明(typedMerge 的整段接线不漏键)", () => {
    const src = readFileSync(new URL("../cocos/assets/scripts/core/ViewTable.ts", import.meta.url), "utf8");
    const iface = src.slice(src.indexOf("export interface Phase4Params"), src.indexOf("export const PHASE4_DEFAULTS"));
    for (const k of PS_KEYS) expect(new RegExp(`^\\s+${k}: string;$`, "m").test(iface), k).toBe(true);
  });

  it("色值逐个能在 Web drawPass 源码段里找到同一写法(大小写不比对,数值必须一致)", () => {
    const webLower = web.toLowerCase();
    for (const k of PS_KEYS) {
      // psBarCover 是 skinBar 的默认 dim 实参(skin.ts 里),不在 drawPass 段内
      if (k === "psBarCover") continue;
      expect(webLower.includes(defs[k].toLowerCase()), `${k} = ${defs[k]} 应在 Web drawPass 出现`).toBe(true);
    }
  });

  it("高级轨两档色就是 Web 的 #ffd76a / #8f9bb3,右列三态是三档独立色", () => {
    expect(defs.psPremOn.toLowerCase()).toBe("#ffd76a");
    expect(defs.psPremOff.toLowerCase()).toBe("#8f9bb3");
    expect(new Set([defs.psStatusClaimed, defs.psStatusReady, defs.psStatusLocked].map((v) => v.toLowerCase()))).toEqual(
      new Set(["#4dffc8", "#ffd76a", "#5a6a80"])
    );
    expect(defs.psDim).toBe("rgba(8,10,16,0.86)");
    expect(defs.psRowClaimedBg).toBe("rgba(77,255,200,0.08)");
    expect(defs.psRowBg).toBe("rgba(255,255,255,0.05)");
    expect(defs.psRowStrokeLocked).toBe("rgba(255,255,255,0.15)");
  });
});

/* ==================== 8. 内容分档:claimed = k < passTier,unlocked = prog >= need ==================== */

describe("档位行三态分档(门控变量推出来的档位,不钉死数字)", () => {
  for (let k = 0; k <= PASS_TIERS.length; k++) {
    it(`passTier = ${k} 且进度拉满:前 ${k} 行已领取、其余可领取`, () => {
      const c = buildPassContent(save({ passTier: k, points: RICH }));
      expect(c.rows).toHaveLength(PASS_TIERS.length);
      c.rows.forEach((row, i) => {
        expect(row.claimed, `行${i}`).toBe(i < k);
        expect(row.unlocked, `行${i}`).toBe(true);
        expect(row.showCheck).toBe(i < k);
        expect(row.status).toBe(i < k ? "claimed" : "ready");
        expect(row.statusText).toBe(i < k ? "已领取" : "可领取");
      });
    });
  }

  it("进度为 0:零行可领,全部走「未解锁」档", () => {
    const c = buildPassContent(save({ points: 0 }));
    expect(c.rows.every((r) => !r.claimed && !r.unlocked)).toBe(true);
    expect(c.rows.map((r) => r.statusText)).toEqual(PASS_TIERS.map(() => "未解锁"));
    expect(c.rows.map((r) => r.status)).toEqual(PASS_TIERS.map(() => "locked"));
  });

  it("把进度精确摆到第 k 档门槛:恰好前 k 档 unlocked(= 且不是 >)", () => {
    for (let k = 1; k <= PASS_TIERS.length; k++) {
      const c = buildPassContent(save({ points: PASS_TIERS[k - 1].need }));
      c.rows.forEach((row, i) => expect(row.unlocked, `档${k}门槛下的行${i}`).toBe(i < k));
    }
  });

  it("星数加权项也算进进度:points 为 0、满星也能解锁首档", () => {
    const first = PASS_TIERS[0];
    const stars = new Array(PASS_TIERS.length).fill(3);
    const s = save({ stageStars: stars });
    expect(progOf(s)).toBe(stars.length * 3 * PASS_STAR_WEIGHT);
    expect(buildPassContent(s).rows[0].unlocked).toBe(first.need <= progOf(s));
  });
});

/* ==================== 9. 命中:返回钮 → 激活行 → 其余一律 claimNext(Web 原样行为) ==================== */

describe("命中判定(Web onPassClick 的三段顺序)", () => {
  const L = passLayout(W, H_STD);
  const cOff = buildPassContent(save({ points: RICH }));
  const cOn = buildPassContent(save({ points: RICH, ...PREM_ON }));

  it("返回钮 → back(四角都在热区内)", () => {
    const b = L.backBtn;
    for (const p of [center(b), { x: b.x + 1, y: b.y + 1 }, { x: b.x + b.w - 1, y: b.y + b.h - 1 }]) {
      expect(hitPass(L, cOff, p.x, p.y)).toEqual({ kind: "back" });
    }
  });

  it("激活行未激活 → activate(不看广告就什么都不写)", () => {
    const a = L.actRect;
    expect(hitPass(L, cOff, center(a).x, center(a).y)).toEqual({ kind: "activate" });
    expect(hitPass(L, cOff, a.x + 1, a.y + 1)).toEqual({ kind: "activate" });
    expect(hitPass(L, cOff, a.x + a.w - 1, a.y + a.h - 1)).toEqual({ kind: "activate" });
  });

  it("激活行已激活 → null,且**不穿透到领取**(Web 判完这一格就 return)", () => {
    const a = L.actRect;
    expect(hitPass(L, cOn, center(a).x, center(a).y)).toBe(null);
    expect(hitPass(L, cOn, a.x + 1, a.y + 1)).toBe(null);
    // 同一坐标在未激活存档下是 activate,在已激活下是 null —— 两档都只可能落在这两种结果
    expect(hitPass(L, cOn, center(a).x, center(a).y)).not.toEqual({ kind: "claimNext" });
  });

  it("点档位 1 与点档位 5 得到同一个动作(领取不按行命中)", () => {
    const r0 = center(L.rows[0].rect);
    const rN = center(L.rows[L.rows.length - 1].rect);
    expect(hitPass(L, cOff, r0.x, r0.y)).toEqual({ kind: "claimNext" });
    expect(hitPass(L, cOff, rN.x, rN.y)).toEqual({ kind: "claimNext" });
    // 落账结果也相同:都领当前 passTier 那一档
    const s = save({ points: RICH, passTier: 0 });
    expect(passClaim(s, hitPass(L, cOff, r0.x, r0.y)!)).toEqual(passClaim(s, hitPass(L, cOff, rN.x, rN.y)!));
  });

  it("屏内其余任何位置都算领下一档(行间隙 / 左右留白 / 进度条 / 标题带下方空白)", () => {
    const probes: [string, number, number][] = [
      ["行间隙", center(L.rows[0].rect).x, L.rows[0].rect.y + L.rows[0].rect.h + L.gap / 2],
      ["左留白", 2, H_STD / 2],
      ["右留白", W - 2, H_STD / 2],
      ["末行之下", center(L.rows[L.rows.length - 1].rect).x, L.rows[L.rows.length - 1].rect.y + L.rows[L.rows.length - 1].rect.h + 20],
      ["进度条", center(L.progressBar).x, center(L.progressBar).y],
      ["激活行与列表之间", W / 2, L.actRect.y + L.actRect.h + PS_LIST_GAP / 2],
      ["屏中央", W / 2, H_STD / 2],
    ];
    for (const [at, x, y] of probes) expect(hitPass(L, cOff, x, y), at).toEqual({ kind: "claimNext" });
  });
});

/* ==================== 10. 领取:按 passTier 顺序推进 + 倍率 + 进度门控 ==================== */

describe("领取意图(passClaim 的 claimNext 分支)", () => {
  it("倍率两档:未激活 ×1,高级轨生效 ×PASS_PREMIUM_MULT", () => {
    for (const tierIndex of PASS_TIERS.map((_, i) => i)) {
      const tier = PASS_TIERS[tierIndex];
      const base = { passTier: tierIndex, points: RICH };
      const off = passClaim(save(base), { kind: "claimNext" })!;
      const on = passClaim(save({ ...base, ...PREM_ON }), { kind: "claimNext" })!;
      expect(off.mult).toBe(1);
      expect(off.gachaTicket).toBe(tier.tickets);
      expect(off.stardust).toBe(tier.stardust);
      expect(on.mult).toBe(PASS_PREMIUM_MULT);
      expect(on.gachaTicket).toBe(tier.tickets * PASS_PREMIUM_MULT);
      expect(on.stardust).toBe(tier.stardust * PASS_PREMIUM_MULT);
      expect(on.passTierDelta).toBe(1);
      expect(on.needsAd).toBe(false);
      expect(on.premiumPassSeason).toBe(null);
    }
  });

  it("顺序推进:一路领到底 = 表长次,每次 passTier += 1,之后静默", () => {
    let passTier = 0;
    let tickets = 0;
    let dust = 0;
    const s = save({ points: RICH });
    for (let i = 0; i < PASS_TIERS.length; i++) {
      const claim = passClaim({ ...s, passTier }, { kind: "claimNext" })!;
      expect(claim, `第${i}次领取`).not.toBe(null);
      tickets += claim.gachaTicket;
      dust += claim.stardust;
      passTier += claim.passTierDelta;
    }
    expect(passTier).toBe(PASS_TIERS.length);
    expect(tickets).toBe(PASS_TIERS.reduce((a, t) => a + t.tickets, 0));
    expect(dust).toBe(PASS_TIERS.reduce((a, t) => a + t.stardust, 0));
    // 表尾之后不存在下一档 → 静默(Web 的 `if (!tier) return`)
    expect(passClaim({ ...s, passTier }, { kind: "claimNext" })).toBe(null);
  });

  it("进度不足时静默:门槛差 1 就不发(Web 的 `passProgress() < tier.need`)", () => {
    const s = save({ points: PASS_TIERS[0].need - 1 });
    expect(passClaim(s, { kind: "claimNext" })).toBe(null);
    expect(passClaim(save({ points: PASS_TIERS[0].need }), { kind: "claimNext" })).not.toBe(null);
  });

  it("激活意图:只看广告、只写 premiumPassSeason = seasonId,不发任何奖励", () => {
    const claim = passClaim(save({ seasonId: 3 }), { kind: "activate" })!;
    expect(claim.needsAd).toBe(true);
    expect(claim.premiumPassSeason).toBe(3);
    expect([claim.gachaTicket, claim.stardust, claim.passTierDelta]).toEqual([0, 0, 0]);
    // 已激活再点(命中层已给 null,这里再锁一层意图)
    expect(passClaim(save({ seasonId: 3, premiumPassSeason: 3 }), { kind: "activate" })).toBe(null);
    expect(passClaim(save({ seasonId: 3, premiumPass: true }), { kind: "activate" })).toBe(null);
    // 翻页后的遗留赛季值不再算激活(与 premiumActive 的赛季比较同一条门控)
    expect(passClaim(save({ seasonId: 3, ...PREM_ON }), { kind: "activate" })).not.toBe(null);
  });

  it("返回不产任何写入意图", () => {
    expect(passClaim(save({ points: RICH }), { kind: "back" })).toBe(null);
  });

  it("倍率档下 premiumActive 与 mult 同一条门控", () => {
    const on = save({ points: RICH, premiumPass: true });
    expect(premiumActive(on)).toBe(true);
    expect(passClaim(on, { kind: "claimNext" })!.mult).toBe(PASS_PREMIUM_MULT);
    const off = save({ points: RICH });
    expect(premiumActive(off)).toBe(false);
    expect(passClaim(off, { kind: "claimNext" })!.mult).toBe(1);
  });
});

/* ==================== 11. 总进度条两档矩形(skinBar 遮罩法与缺图档同口径) ==================== */

describe("总进度条矩形", () => {
  const L = passLayout(W, H_STD);
  const t = L.progressBar;

  it("frac = 1 时不画遮罩(Web skinBar 的 `if (f < 1)`)", () => {
    expect(passProgressRects(L, 1).cover).toBe(null);
    expect(passProgressRects(L, 1).fill.w).toBe(t.w);
  });

  it("frac 越界钳到 0..1,超分母时填充仍是整条宽", () => {
    expect(passProgressRects(L, 3).fill.w).toBe(t.w);
    expect(passProgressRects(L, 3).cover).toBe(null);
    // 遮罩档走 skinBar 的双向钳制;填充档 Web 缺图分支只写 min(1, frac),分子由存档求和恒 ≥ 0
    expect(passProgressRects(L, -1).cover).toEqual({ x: t.x, y: t.y, w: t.w, h: t.h });
    expect(passProgressRects(L, 0).fill.w).toBe(0);
    expect(passProgressRects(L, 0).cover).toEqual({ x: t.x, y: t.y, w: t.w, h: t.h });
  });

  it("frac = 0.5:填充与遮罩正好接上,合起来等于轨道宽", () => {
    const { fill, cover } = passProgressRects(L, 0.5);
    expect(fill.x).toBe(t.x);
    expect(fill.w).toBeCloseTo(t.w / 2, 10);
    expect(cover).not.toBe(null);
    expect(cover!.x).toBeCloseTo(t.x + t.w / 2, 10);
    expect(cover!.x + cover!.w).toBeCloseTo(t.x + t.w, 10);
    expect(cover!.h).toBe(t.h);
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
  it("buildPassContent / hitPass / passClaim / passProgress / premiumActive 都不改传入存档", () => {
    const s = deepFreeze(save({ points: RICH, dayEcho: 5, stageStars: [3, 2, 1], passTier: 1, premiumPassSeason: 1 }));
    const before = JSON.stringify(s);
    const L = passScreenLayout(W, H_STD);
    for (const c of [buildPassContent(s), buildPassContent({ ...s, premiumPassSeason: 0 })]) {
      const acts: PassAction[] = [
        { kind: "back" },
        { kind: "activate" },
        { kind: "claimNext" },
      ];
      // 命中层结果可能是 null(已激活时点激活行),只把非空的动作喂给意图层
      for (const p of [center(L.actRect), center(L.rows[0].rect), { x: W / 2, y: H_STD / 2 }]) {
        const a = hitPass(L, c, p.x, p.y);
        if (a) acts.push(a);
      }
      for (const a of acts) passClaim(s, a);
    }
    for (const h of [H_STD, H_TALL]) {
      const l2 = passLayout(W, h);
      hitPass(l2, buildPassContent(s), W / 2, H_STD / 2);
      hitPass(l2, buildPassContent(s), l2.backBtn.x + 2, l2.backBtn.y + 2);
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it("意图是独立对象:同一动作两次调用互不影响", () => {
    const s = save({ points: RICH });
    const a = passClaim(s, { kind: "claimNext" })!;
    const b = passClaim(s, { kind: "claimNext" })!;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

/* ==================== 13. 纯布局与宿主模型 cc-free 守卫 ==================== */

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;
const ABSOLUTE_GAME = /from\s*["']@game\//;

const PURE_FILES = [
  "../cocos/assets/scripts/game/ui/passLayout.ts",
  "../cocos/assets/scripts/pass/PassModel.ts",
];

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
});

/* ==================== 14. 视图层纪律:文本只走 placeLine,几何只问共享层 ==================== */

describe("PassView 的落位纪律(R5)", () => {
  const src = readFileSync(new URL("../cocos/assets/scripts/pass/PassView.ts", import.meta.url), "utf8");

  it("文本只经 placeLine 一个入口,视图不自己按对齐摆节点", () => {
    expect(src.includes("placeLine(")).toBe(true);
    // 对齐只在 Txt 内部换一次;别处再碰 horizontalAlign 就是绕开了 anchorBand 的第二套落位口径
    expect((src.match(/lb\.horizontalAlign\s*=/g) ?? []).length).toBe(1);
    expect((src.match(/placeLine\(/g) ?? []).length).toBe(1);
  });

  it("视图不产几何:行矩形与文本锚点都从 layout 取", () => {
    expect(src.includes("spreadRows")).toBe(false);
    expect(src.includes("rowTextY")).toBe(false);
    expect(src.includes("ui.pad")).toBe(true); // 只有面板内缩这一处按既有同屏口径读主题 pad
  });
});
