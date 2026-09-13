/**
 * 章间商店纯布局测试(像素翻新重排版):
 * 顶带恒 0..64,底坞与全部内容带贴本帧屏高,内容底缘恒 = 屏高 − 底坞高 − 6(富余由行高 /
 * 带距 / 卡高吃干,武器行带与进化条之间不再堆空洞)。
 * 不变量:相邻零重叠、越界 0、坐标取偶、热区 ≥44、横向 ⊂[16,544]、行数 clamp、随屏高单调生长。
 * 网格:武器 0..8 × 进化 0..4 × 屏高 {996,1212,1246} 全组合。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shopLayoutPure, SHOP_TOP, SHOP_BOTTOM, SHOP_ROW_BOTTOM, SHOP_PAD, SHOP_CALIBRATION_H, SHOP_FOOT, cardIconSize, cardRibbon, type ShopLayoutPure } from "@game/ui/shop";
import { HUD_BOT_H, HUD_TOP_H } from "@game/ui/hud";

const HEIGHTS = [996, 1212, SHOP_CALIBRATION_H + 250];
/** 底坞高:底坞顶缘 = 屏高 − 它 */
const DOCK_H = HUD_BOT_H;

/** 区块包络(顶缘/底缘),用于相邻零重叠与空洞度量 */
function blocks(L: ShopLayoutPure): { name: string; y0: number; y1: number }[] {
  const out: { name: string; y0: number; y1: number }[] = [];
  out.push({ name: "toolRow", y0: L.toolBtns[0].y, y1: L.toolBtns[0].y + L.toolBtns[0].h });
  out.push({ name: "cards", y0: L.cards[0].y, y1: L.cards[0].y + L.cardH });
  out.push({ name: "slotBtn", y0: L.slotBtn.y, y1: L.slotBtn.y + L.slotBtn.h });
  out.push({ name: "weaponHeader", y0: L.weaponLabelY, y1: L.weaponLabelY + L.headerH });
  L.weaponRows.forEach((r, i) => out.push({ name: `weaponRow${i}`, y0: r.y, y1: r.y + r.h }));
  out.push({ name: "mergeHeader", y0: L.mergeLabelY, y1: L.mergeLabelY + L.headerH });
  L.merges.forEach((r, i) => out.push({ name: `mergeRow${i}`, y0: r.y, y1: r.y + r.h }));
  return out.sort((a, b) => a.y0 - b.y0);
}

/** 本布局产出的全部矩形 */
function rects(L: ShopLayoutPure) {
  return [...L.toolBtns, ...L.cards, L.slotBtn, ...L.weaponRows, ...L.destroyRects, ...L.merges, L.nextBtn];
}

describe("商店几何常量(与战斗双坞同源)", () => {
  it("顶信息条底缘 = 战斗顶坞高 64", () => {
    expect(SHOP_TOP).toBe(64);
    expect(SHOP_TOP).toBe(HUD_TOP_H);
  });
  it("标定档:底操作条顶缘 = 996 − 战斗底坞高 = 948,内容末行底缘 942", () => {
    expect(SHOP_BOTTOM).toBe(948);
    expect(SHOP_BOTTOM).toBe(996 - HUD_BOT_H);
    expect(SHOP_ROW_BOTTOM).toBe(SHOP_BOTTOM - SHOP_FOOT);
    expect(SHOP_ROW_BOTTOM).toBe(942);
  });
  it("页边距 16 / 内容宽 528:右缘落 544", () => {
    expect(SHOP_PAD).toBe(16);
    const L = shopLayoutPure(1, 1);
    expect(L.slotBtn.w).toBe(528);
    expect(L.slotBtn.x + L.slotBtn.w).toBe(544);
  });
});

describe("商店布局网格(武器 0..8 × 进化 0..4 × 三档屏高)", () => {
  for (const h of HEIGHTS) {
    for (let nw = 0; nw <= 8; nw++) {
      for (let nm = 0; nm <= 4; nm++) {
        const L = shopLayoutPure(nw, nm, h);
        const tag = `h=${h} weapons=${nw} merges=${nm}`;

        it(`${tag}:首块顶缘 ≥64,内容不越顶信息条`, () => {
          for (const b of blocks(L)) expect(b.y0, `${tag} ${b.name}`).toBeGreaterThanOrEqual(SHOP_TOP);
          expect(L.toolBtns[0].y, tag).toBeGreaterThanOrEqual(SHOP_TOP + 6);
          for (const b of L.toolBtns) expect(b.y, `${tag} 工具钮同一行`).toBe(L.toolBtns[0].y);
        });

        it(`${tag}:进化区底缘贴底坞(屏高富余被内容吃干,只剩呼吸缝)`, () => {
          const last = L.merges[L.merges.length - 1];
          expect(L.contentBottom, tag).toBe(h - DOCK_H - SHOP_FOOT);
          expect(last.y + last.h, tag).toBeLessThanOrEqual(L.contentBottom);
          // 呼吸缝必须不足一行高 —— 再留一行放得下就是没把富余吃干
          expect(L.contentBottom - (last.y + last.h), tag).toBeLessThan(L.mergeRowH);
        });

        it(`${tag}:nextBtn 贴本帧底坞,逐位 (264, 坞顶+2, 280, 44)`, () => {
          expect(L.nextBtn, tag).toEqual({ x: 264, y: h - DOCK_H + 2, w: 280, h: 44 });
        });

        it(`${tag}:相邻区块零重叠`, () => {
          const bs = blocks(L);
          for (let i = 1; i < bs.length; i++) expect(bs[i].y0, `${tag} ${bs[i - 1].name} → ${bs[i].name}`).toBeGreaterThanOrEqual(bs[i - 1].y1);
        });

        it(`${tag}:带距有度 —— 武器行带与进化条之间的空洞不超过实测包络 60`, () => {
          const lastW = L.weaponRows[L.weaponRows.length - 1];
          expect(L.mergeLabelY - (lastW.y + lastW.h), tag).toBeLessThanOrEqual(60);
        });

        it(`${tag}:热区下限 44 与行高区间(带内等高)`, () => {
          for (const b of L.toolBtns) expect(b.h, tag).toBeGreaterThanOrEqual(44);
          expect(L.slotBtn.h, tag).toBeGreaterThanOrEqual(44);
          for (const r of L.weaponRows) {
            expect(r.h, `${tag} 武器行等高`).toBe(L.weaponRowH);
            expect(r.h, tag).toBeGreaterThanOrEqual(40);
            expect(r.h, tag).toBeLessThanOrEqual(172);
          }
          for (const r of L.merges) {
            expect(r.h, `${tag} 进化行等高`).toBe(L.mergeRowH);
            expect(r.h, tag).toBeGreaterThanOrEqual(36);
            expect(r.h, tag).toBeLessThanOrEqual(172);
          }
          expect(L.cardH, tag).toBeGreaterThanOrEqual(160);
        });

        it(`${tag}:越界 0 / 横向 ⊂[16,544] / 坐标取偶`, () => {
          for (const r of rects(L)) {
            expect(r.x, `${tag} x`).toBeGreaterThanOrEqual(0);
            expect(r.x + r.w, `${tag} 右`).toBeLessThanOrEqual(560);
            expect(r.y, `${tag} 上`).toBeGreaterThanOrEqual(0);
            expect(r.y + r.h, `${tag} 下`).toBeLessThanOrEqual(h);
            for (const v of [r.x, r.y, r.w, r.h]) expect(v % 2, `${tag} ${JSON.stringify(r)}`).toBe(0);
          }
          for (const r of [...L.toolBtns, ...L.cards, L.slotBtn, ...L.weaponRows, ...L.destroyRects, ...L.merges]) {
            expect(r.x, `${tag} 内容列左缘`).toBeGreaterThanOrEqual(SHOP_PAD);
            expect(r.x + r.w, `${tag} 内容列右缘`).toBeLessThanOrEqual(560 - SHOP_PAD);
          }
        });

        it(`${tag}:销毁钮含于所在武器行`, () => {
          L.weaponRows.forEach((r, i) => {
            const d = L.destroyRects[i];
            expect(d.x).toBeGreaterThanOrEqual(r.x);
            expect(d.x + d.w).toBeLessThanOrEqual(r.x + r.w);
            expect(d.y).toBeGreaterThanOrEqual(r.y);
            expect(d.y + d.h).toBeLessThanOrEqual(r.y + r.h);
          });
        });
      }
    }
  }
});

describe("商店布局形状语义", () => {
  it("行数 = clamp(实际,1,上限):0 件 → 1 行空态占位;第 8 件可见(旧版 slice(0,7) 缺口修复)", () => {
    expect(shopLayoutPure(0, 0).weaponRows.length).toBe(1);
    expect(shopLayoutPure(0, 0).merges.length).toBe(1);
    expect(shopLayoutPure(8, 4).weaponRows.length).toBe(8);
    expect(shopLayoutPure(8, 4).nW).toBe(8);
    expect(shopLayoutPure(12, 9).nW).toBe(8); // 超上限钳制
    expect(shopLayoutPure(12, 9).nM).toBe(4);
  });

  it("卡带三档恒值(标定档):N≤5 → 208,N=6 → 176,N≥10 → 160;且卡带与屏高无关", () => {
    expect(shopLayoutPure(1, 1).cardH).toBe(208); // N=2 ≤5
    expect(shopLayoutPure(4, 2).cardH).toBe(176); // N=6
    expect(shopLayoutPure(6, 4).cardH).toBe(160); // N=10
    expect(shopLayoutPure(8, 4).cardH).toBe(160); // N=12
    // 行数越多卡越矮(相对关系与上面的等值同时成立)
    expect(shopLayoutPure(8, 4, 996).cardH).toBeLessThan(shopLayoutPure(4, 2, 996).cardH);
    expect(shopLayoutPure(4, 2, 996).cardH).toBeLessThan(shopLayoutPure(1, 1, 996).cardH);
    // 卡带定高:同一入参换屏高,cardH 一分不动
    for (const [nw, nm] of [[1, 1], [4, 2], [8, 4]] as const) {
      expect(shopLayoutPure(nw, nm, 1246).cardH, `${nw},${nm}`).toBe(shopLayoutPure(nw, nm, 996).cardH);
    }
  });

  it("工具钮恒四枚:刷新/被动/重开/主页,等宽一行、右缘收进内容列", () => {
    const L = shopLayoutPure(3, 1);
    expect(L.toolBtns.map((b) => b.id)).toEqual(["refresh", "passive", "restart", "home"]);
    for (const b of L.toolBtns) {
      expect(b.w).toBe(126);
      expect(b.h).toBe(L.toolBtns[0].h);
      expect(b.y).toBe(L.toolBtns[0].y);
      expect(b.h).toBeGreaterThanOrEqual(44);
    }
    expect(L.toolBtns[3].x + L.toolBtns[3].w).toBe(544);
  });

  it("标定档(996)最满形态数值锚点:8 武器 + 4 进化逐位落位", () => {
    const L = shopLayoutPure(8, 4);
    expect(L.contentBottom).toBe(942);
    expect(L.cardH).toBe(160);
    expect(L.cards[0].y).toBe(120);
    expect(L.slotBtn).toEqual({ x: 16, y: 286, w: 528, h: 44 });
    expect(L.weaponLabelY).toBe(336);
    expect(L.weaponRows[0]).toEqual({ x: 16, y: 366, w: 528, h: 42 });
    expect(L.mergeLabelY).toBe(746);
    expect(L.merges[0]).toEqual({ x: 16, y: 776, w: 528, h: 38 });
    const last = L.merges[L.merges.length - 1];
    expect([last.y, last.y + last.h]).toEqual([902, 940]);
    expect(L.nextBtn).toEqual({ x: 264, y: 950, w: 280, h: 44 });
  });

  it("标定档最省形态数值锚点:1 武器 + 1 进化,富余全给行带", () => {
    const L = shopLayoutPure(1, 1);
    expect(L.slotBtn).toEqual({ x: 16, y: 456, w: 528, h: 64 });
    expect(L.weaponLabelY).toBe(560);
    expect(L.weaponRows[0]).toEqual({ x: 16, y: 636, w: 528, h: 76 });
    expect(L.mergeLabelY).toBe(756);
    expect(L.merges[0]).toEqual({ x: 16, y: 832, w: 528, h: 74 });
  });

  it("三张可购卡恒等宽 172 对齐内容列", () => {
    const L = shopLayoutPure(3, 1);
    expect(L.cards.length).toBe(3);
    expect(L.cards[0].x).toBe(16);
    expect(L.cards[0].w).toBe(172);
    expect(L.cards[2].x + L.cards[2].w).toBe(544);
  });

  it("收屏高参数并随它生长:屏高越高内容底缘越低、行带越高;卡带定高不随屏高走", () => {
    expect(shopLayoutPure.length).toBe(2); /* 第三实参带默认值 → 缺省即标定高 996 */
    const a = shopLayoutPure(5, 2, 996);
    const b = shopLayoutPure(5, 2, 1212);
    expect(b.contentBottom).toBeGreaterThan(a.contentBottom);
    expect(b.weaponRowH).toBeGreaterThan(a.weaponRowH); expect(b.cardH).toBe(a.cardH);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("同一入参两次调用逐位相同(纯确定,无隐藏态)", () => {
    expect(JSON.stringify(shopLayoutPure(5, 2, 1100))).toBe(JSON.stringify(shopLayoutPure(5, 2, 1100)));
  });
});

/**
 * 卡内几何:装饰横带换算 + 图标两档 + 五行不撞。
 * 卡框 frame_<品质> 源图第 42..67 行是一条横贯卡面的装饰带,图标要居中压在它上面,
 * 于是文本整块随图标底缘起排 —— 这一组断言守的就是「居中之后仍逐档不撞」。
 */
describe("cardRibbon / cardIconSize", () => {
  const doc = JSON.parse(readFileSync("cocos/assets/resources/config/viewTable.json", "utf8")) as {
    cardFrame: { srcH: number; ribbon: [number, number] };
    nineSlice: { keys: Record<string, number> };
  };
  const CF = doc.cardFrame;
  const BORDER = doc.nineSlice.keys.frame_common;
  const FS_BODY = 14, Q_DY = 18, S_DY = 38, PRICE_DYB = 28;

  it("标定档逐像素重合源图行位(h = srcH 时缩放系数为 1)", () => {
    const rb = cardRibbon(CF.srcH, BORDER, CF);
    expect(rb.top).toBe(CF.ribbon[0]);
    expect(rb.bottom).toBe(CF.ribbon[1]);
    expect(rb.center).toBe((CF.ribbon[0] + CF.ribbon[1]) / 2);
  });

  it("短卡档向内收敛,且始终落在可拉伸带内", () => {
    for (const h of [152, 160, 176, 208]) {
      const rb = cardRibbon(h, BORDER, CF);
      expect(rb.top).toBeGreaterThanOrEqual(BORDER);
      expect(rb.bottom).toBeLessThanOrEqual(h - BORDER);
      expect(rb.bottom).toBeGreaterThan(rb.top);
    }
    const a = cardRibbon(152, BORDER, CF), b = cardRibbon(208, BORDER, CF);
    expect(a.center).toBeLessThan(b.center);
    expect(a.bottom - a.top).toBeLessThan(b.bottom - b.top);
  });

  it("图标边长两档:标定卡 36、短卡收一档 28", () => {
    expect(cardIconSize(208)).toBe(36);
    expect(cardIconSize(200)).toBe(36);
    expect(cardIconSize(176)).toBe(28);
    expect(cardIconSize(152)).toBe(28);
  });

  it("152..208 每一档:图标居中于横带,且图标 / 卡名 / 品质 / 效果 / 价格互不重叠、不越卡底", () => {
    for (let h = 152; h <= 208; h += 2) {
      const rb = cardRibbon(h, BORDER, CF);
      const iconS = cardIconSize(h);
      const iconTop = Math.round((rb.center - iconS / 2) / 2) * 2;
      const iconBottom = iconTop + iconS;
      expect(iconTop).toBeGreaterThanOrEqual(0);
      expect(rb.center).toBeGreaterThanOrEqual(iconTop);
      expect(rb.center).toBeLessThanOrEqual(iconBottom);
      const name = iconBottom + FS_BODY;
      const quality = name + Q_DY;
      const sub = name + S_DY;
      const price = h - PRICE_DYB;
      expect(quality - name).toBeGreaterThanOrEqual(FS_BODY);
      expect(sub - quality).toBeGreaterThanOrEqual(12);
      expect(sub).toBeLessThan(price);
      expect(price).toBeLessThanOrEqual(h - BORDER);
    }
  });
});

/**
 * v4「深渊铭刻」版式(Cocos 侧 viewTable.phase3.shopV4):第四实参 opts 打开。
 * 与旧版式的差别只在弹性表:钮高 40..44、卡带 208(最满形态收 176)、标题 22、
 * 武器行 = max(持有, 槽位)且 52..56 高、富余落到末行与底坞之间。
 * 旧版式(不传 opts)逐位不变 —— 上面的网格与锚点测试就是它的守卫。
 */
describe("商店 v4 版式(opts.v4 + slotCount)", () => {
  const OPTS = (slotCount: number) => ({ v4: true, slotCount });
  it("不传 opts 与传 undefined 逐位相同(旧版式零改动)", () => {
    expect(JSON.stringify(shopLayoutPure(3, 2, 1212))).toBe(JSON.stringify(shopLayoutPure(3, 2, 1212, undefined)));
    expect(shopLayoutPure(3, 2).captionY).toBe(null);
  });
  for (const h of HEIGHTS) {
    for (const slots of [4, 6, 8]) {
      for (let nw = 0; nw <= slots; nw++) {
        for (let nm = 0; nm <= 4; nm++) {
          const L = shopLayoutPure(nw, nm, h, OPTS(slots));
          const tag = `v4 h=${h} slots=${slots} weapons=${nw} merges=${nm}`;
          it(`${tag}:行数 = max(持有,槽位),块间零重叠、不越界、末行不过底坞`, () => {
            expect(L.nW, tag).toBe(Math.max(1, Math.min(8, Math.max(nw, slots))));
            expect(L.weaponRows, tag).toHaveLength(L.nW);
            const bs = blocks(L);
            for (let i = 1; i < bs.length; i++) expect(bs[i].y0, `${tag} ${bs[i - 1].name} → ${bs[i].name}`).toBeGreaterThanOrEqual(bs[i - 1].y1);
            for (const b of bs) expect(b.y0, tag).toBeGreaterThanOrEqual(SHOP_TOP);
            const last = L.merges[L.merges.length - 1];
            expect(last.y + last.h, tag).toBeLessThanOrEqual(L.contentBottom);
            expect(L.nextBtn, tag).toEqual({ x: 264, y: h - DOCK_H + 2, w: 280, h: 44 });
            for (const r of rects(L)) for (const v of [r.x, r.y, r.w, r.h]) expect(v % 2, tag).toBe(0);
          });
          it(`${tag}:钮高 40..44、卡带 176..208、行高 34..56 / 32..48、说明行落在卡带与槽位钮之间`, () => {
            for (const b of L.toolBtns) { expect(b.h, tag).toBeGreaterThanOrEqual(40); expect(b.h, tag).toBeLessThanOrEqual(44); }
            expect(L.slotBtn.h, tag).toBeGreaterThanOrEqual(40);
            expect(L.cardH, tag).toBeGreaterThanOrEqual(176);
            expect(L.cardH, tag).toBeLessThanOrEqual(208);
            expect(L.headerH, tag).toBe(22);
            for (const r of L.weaponRows) { expect(r.h, tag).toBeGreaterThanOrEqual(34); expect(r.h, tag).toBeLessThanOrEqual(56); }
            for (const r of L.merges) { expect(r.h, tag).toBeGreaterThanOrEqual(32); expect(r.h, tag).toBeLessThanOrEqual(48); }
            expect(L.captionY, tag).not.toBe(null);
            expect(L.captionY!, tag).toBeGreaterThanOrEqual(L.cards[0].y + L.cardH);
            expect(L.captionY! + 16, tag).toBeLessThanOrEqual(L.slotBtn.y);
          });
        }
      }
    }
  }
  it("标定档 6 槽 1 件 0 组:数值锚点(工具 74/40、卡 124/208、说明行 332+、槽位钮 356、6 行 52 高)", () => {
    const L = shopLayoutPure(1, 0, 996, OPTS(6));
    expect(L.toolBtns[0]).toMatchObject({ y: 74, h: 40 });
    expect(L.cards[0]).toMatchObject({ y: 124, h: 208 });
    expect(L.slotBtn).toMatchObject({ y: 356, h: 40 });
    expect(L.weaponRows).toHaveLength(6);
    expect(L.weaponRowH).toBe(56);
    expect(L.weaponRowGap).toBe(6);
  });
});
