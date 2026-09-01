/**
 * 章间商店纯布局测试(重设计):
 * 固定几何——内容不越顶信息条(≥64)、进化区底缘恒 942(贴底坞 948)、
 * 相邻区块零重叠、行高钳制、横向 ⊂[14,546]、常量与战斗双坞一致、与屏高无关。
 * 网格:武器 0..8 × 进化 0..4 全组合(含第 8 件可见化修复)。
 */

import { describe, it, expect } from "vitest";
import { shopLayoutPure, SHOP_TOP, SHOP_BOTTOM, SHOP_ROW_BOTTOM, SHOP_PAD } from "../src/ui/shop";
import { HUD_TOP_H, HUD_BOT_H } from "../src/ui/hud";

/** 区块包络(顶缘/底缘),用于相邻零重叠断言 */
function blocks(L: ReturnType<typeof shopLayoutPure>): { name: string; y0: number; y1: number }[] {
  const out: { name: string; y0: number; y1: number }[] = [];
  out.push({ name: "toolRow", y0: 72, y1: 108 });
  out.push({ name: "cards", y0: 116, y1: 116 + L.cardH });
  out.push({ name: "slotBtn", y0: L.slotBtn.y, y1: L.slotBtn.y + L.slotBtn.h });
  out.push({ name: "weaponHeader", y0: L.weaponLabelY, y1: L.weaponLabelY + 26 });
  L.weaponRows.forEach((r, i) => out.push({ name: `weaponRow${i}`, y0: r.y, y1: r.y + r.h }));
  out.push({ name: "mergeHeader", y0: L.mergeLabelY, y1: L.mergeLabelY + 26 });
  L.merges.forEach((r, i) => out.push({ name: `mergeRow${i}`, y0: r.y, y1: r.y + r.h }));
  return out.sort((a, b) => a.y0 - b.y0);
}

describe("商店几何常量(与战斗双坞同源)", () => {
  it("顶信息条底缘 = 战斗顶坞高 64", () => {
    expect(SHOP_TOP).toBe(64);
    expect(SHOP_TOP).toBe(HUD_TOP_H);
  });
  it("底操作条顶缘 = 996 − 战斗底坞高 = 948", () => {
    expect(SHOP_BOTTOM).toBe(948);
    expect(SHOP_BOTTOM).toBe(996 - HUD_BOT_H);
  });
  it("内容末行底缘 942(贴底坞留 6px 呼吸缝)", () => {
    expect(SHOP_ROW_BOTTOM).toBe(942);
    expect(SHOP_PAD).toBe(14);
  });
});

describe("商店布局网格(武器 0..8 × 进化 0..4)", () => {
  for (let nw = 0; nw <= 8; nw++) {
    for (let nm = 0; nm <= 4; nm++) {
      const L = shopLayoutPure(nw, nm);

      it(`weapons=${nw} merges=${nm}:首块顶缘 ≥64,内容不越顶信息条`, () => {
        for (const b of blocks(L)) {
          expect(b.y0).toBeGreaterThanOrEqual(64);
        }
        expect(L.toolBtns[0].y).toBe(72);
      });

      it(`weapons=${nw} merges=${nm}:进化区底缘恒 942(贴底坞)`, () => {
        const last = L.merges[L.merges.length - 1];
        expect(last.y + last.h).toBe(942);
      });

      it(`weapons=${nw} merges=${nm}:nextBtn 恒 (266,950,280,44) ⊂ 底坞 948..996`, () => {
        expect(L.nextBtn).toEqual({ x: 266, y: 950, w: 280, h: 44 });
        expect(L.nextBtn.y).toBeGreaterThanOrEqual(SHOP_BOTTOM);
        expect(L.nextBtn.y + L.nextBtn.h).toBeLessThanOrEqual(996);
      });

      it(`weapons=${nw} merges=${nm}:相邻区块零重叠`, () => {
        const bs = blocks(L);
        for (let i = 1; i < bs.length; i++) {
          expect(bs[i].y0, `${bs[i - 1].name} → ${bs[i].name}`).toBeGreaterThanOrEqual(bs[i - 1].y1);
        }
      });

      it(`weapons=${nw} merges=${nm}:行高钳制 + 横向 ⊂[14,546]`, () => {
        for (const r of L.weaponRows) {
          expect(r.h).toBeGreaterThanOrEqual(32);
          expect(r.h).toBeLessThanOrEqual(56);
        }
        for (const r of L.merges) {
          expect(r.h).toBeGreaterThanOrEqual(32);
          expect(r.h).toBeLessThanOrEqual(56);
        }
        const all = [
          ...L.toolBtns,
          ...L.cards,
          L.slotBtn,
          ...L.weaponRows,
          ...L.destroyRects,
          ...L.merges,
        ];
        for (const r of all) {
          expect(r.x).toBeGreaterThanOrEqual(14);
          expect(r.x + r.w).toBeLessThanOrEqual(546);
        }
      });

      it(`weapons=${nw} merges=${nm}:销毁钮含于所在武器行`, () => {
        L.weaponRows.forEach((r, i) => {
          const d = L.destroyRects[i];
          for (const b of [d]) {
            expect(b.x).toBeGreaterThanOrEqual(r.x);
            expect(b.x + b.w).toBeLessThanOrEqual(r.x + r.w);
            expect(b.y).toBeGreaterThanOrEqual(r.y);
            expect(b.y + b.h).toBeLessThanOrEqual(r.y + r.h);
          }
        });
      });
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

  it("卡高三档:行越多卡越矮", () => {
    expect(shopLayoutPure(1, 1).cardH).toBe(208); // N=2 ≤5
    expect(shopLayoutPure(4, 2).cardH).toBe(176); // N=6
    expect(shopLayoutPure(6, 4).cardH).toBe(160); // N=10
  });

  it("工具钮恒四枚:刷新/融合/重开/主页,等宽一行", () => {
    const L = shopLayoutPure(3, 1);
    expect(L.toolBtns.map((b) => b.id)).toEqual(["refresh", "fusion", "restart", "home"]);
    for (const b of L.toolBtns) {
      expect(b.h).toBe(36);
      expect(b.w).toBe(127);
      expect(b.y).toBe(72);
    }
    expect(L.toolBtns[3].x + L.toolBtns[3].w).toBe(546);
  });

  it("三张可购卡恒等宽 172 对齐内容列", () => {
    const L = shopLayoutPure(3, 1);
    expect(L.cards.length).toBe(3);
    expect(L.cards[0].x).toBe(14);
    expect(L.cards[2].x + L.cards[2].w).toBe(546);
  });

  it("与屏高无关:签名不收屏高,输出纯确定(双高等价的结构保证)", () => {
    const a = shopLayoutPure(5, 2);
    const b = shopLayoutPure(5, 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("最满形态(8 武器 + 4 进化)数值锚点", () => {
    const L = shopLayoutPure(8, 4);
    expect(L.cardH).toBe(160);
    expect(L.weaponRows[0].y).toBe(358); // 198+160
    expect(L.weaponRows[0].h).toBe(43);
    expect(L.merges[0].h).toBe(42);
    const last = L.merges[L.merges.length - 1];
    expect(last.y + last.h).toBe(942);
  });
});
