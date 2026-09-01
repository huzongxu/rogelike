/**
 * 二次确认弹窗纯几何测试(条目 39):框屏幕居中 / 两钮横排居中对称 / 零重叠 / 触控高 / 双高等价。
 */

import { describe, it, expect } from "vitest";
import {
  confirmRects,
  CONFIRM_W,
  CONFIRM_H,
  CONFIRM_BTN_W,
  CONFIRM_BTN_H,
  CONFIRM_BTN_GAP,
} from "../src/ui/theme";

describe("confirmRects 确认弹窗几何", () => {
  it("常量口径", () => {
    expect(CONFIRM_W).toBe(360);
    expect(CONFIRM_H).toBe(170);
    expect(CONFIRM_BTN_W).toBe(150);
    expect(CONFIRM_BTN_H).toBe(44);
    expect(CONFIRM_BTN_GAP).toBe(14);
  });

  for (const h of [996, 1212, 1246]) {
    it(`h=${h}:框 360×170 屏幕居中`, () => {
      const L = confirmRects(560, h);
      expect(L.box).toEqual({ x: (560 - CONFIRM_W) / 2, y: (h - CONFIRM_H) / 2, w: CONFIRM_W, h: CONFIRM_H });
      expect(L.box.x).toBe(100);
    });

    it(`h=${h}:两钮 150×44 横排居中、间距 14、确认在左`, () => {
      const L = confirmRects(560, h);
      for (const r of [L.ok, L.cancel]) {
        expect(r.w).toBe(CONFIRM_BTN_W);
        expect(r.h).toBe(CONFIRM_BTN_H);
        expect(r.y).toBe(L.box.y + CONFIRM_H - 16 - CONFIRM_BTN_H);
      }
      // 确认(左)→取消(右),顺序不变
      expect(L.ok.x + L.ok.w + CONFIRM_BTN_GAP).toBe(L.cancel.x);
      // 钮行整体关于框中轴对称(左右留白相等)
      expect(L.ok.x - L.box.x).toBe(L.box.x + L.box.w - (L.cancel.x + L.cancel.w));
      expect(L.ok.x - L.box.x).toBe(23);
    });

    it(`h=${h}:钮 ⊂ 框、零重叠、底边留 16`, () => {
      const L = confirmRects(560, h);
      expect(L.ok.x).toBeGreaterThanOrEqual(L.box.x);
      expect(L.cancel.x + L.cancel.w).toBeLessThanOrEqual(L.box.x + L.box.w);
      expect(L.ok.x + L.ok.w).toBeLessThan(L.cancel.x);
      expect(L.ok.y + L.ok.h).toBe(L.box.y + L.box.h - 16);
    });
  }

  it("双高内容相对框的几何完全一致(仅框整体下移)", () => {
    const a = confirmRects(560, 996);
    const b = confirmRects(560, 1212);
    const dy = b.box.y - a.box.y;
    expect(dy).toBe((1212 - 996) / 2);
    expect(b.ok.x - b.box.x).toBe(a.ok.x - a.box.x);
    expect(b.ok.y - b.box.y).toBe(a.ok.y - a.box.y);
  });

  it("确定性:同输入同输出", () => {
    expect(confirmRects(560, 996)).toEqual(confirmRects(560, 996));
  });
});
