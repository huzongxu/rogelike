/**
 * 战斗双坞 HUD 布局纯逻辑测试:
 * pickTicker 六档优先级 / equipRowLayout 卡列几何 / 坞贴边几何 / 战场活动带 / 坞板比例常量 / 胶囊条填充宽。
 */

import { describe, it, expect } from "vitest";
import {
  HUD_TOP_H,
  HUD_BOT_H,
  HUD_PAD,
  DOCK_TOP_ASPECT,
  DOCK_BOT_ASPECT,
  battleBandY,
  pickTicker,
  equipRowLayout,
  barFillW,
  type TickerFlags,
} from "@game/ui/hud";
import { PLAYER_BASE } from "@game/entities/player";

const none: TickerFlags = { combo: false, commission: false, intel: false, env: false, thorn: false };

describe("pickTicker 优先级(连杀>委托>敌情>环境>荆棘>挂机)", () => {
  const order: (keyof TickerFlags)[] = ["combo", "commission", "intel", "env", "thorn"];
  const kinds = ["combo", "commission", "intel", "env", "thorn", "auto"] as const;

  it("全空兜底挂机", () => {
    expect(pickTicker(none)).toBe("auto");
  });

  // 两两覆盖:每一档打开它与其下全部档位时,必须压过所有更低档
  for (let i = 0; i <= order.length; i++) {
    const f: TickerFlags = { ...none };
    for (let j = i; j < order.length; j++) f[order[j]] = true;
    it(`第 ${i} 档(${kinds[i]})压过全部更低档`, () => {
      expect(pickTicker(f)).toBe(kinds[i]);
    });
  }

  it("单档独立命中", () => {
    for (let i = 0; i < order.length; i++) {
      const f: TickerFlags = { ...none, [order[i]]: true };
      expect(pickTicker(f)).toBe(order[i]);
    }
  });
});

describe("战场活动带(人物/怪物不越上下栏)", () => {
  it("活动带 = 顶坞下缘 .. 底坞上缘", () => {
    const band = battleBandY(996);
    expect(band.y0).toBe(HUD_TOP_H);
    expect(band.y0).toBe(64);
    expect(band.y1).toBe(996 - HUD_BOT_H);
    expect(band.y1).toBe(948);
  });
  it("高屏 wh 伸展时活动带随底坞上缘收缩", () => {
    expect(battleBandY(996).y1).toBe(948); // worldH 恒 996,底坞锚 worldH
  });
  it("纵向空气墙顶到上下坞边:钳制区间 = 活动带 ± 玩家半径(身体贴栏不越栏)", () => {
    // 墙由 battleBandY 派生,与双坞共用 HUD_TOP_H/HUD_BOT_H → 坞变高时墙自动同步
    const band = battleBandY(996);
    expect(band.y0 + PLAYER_BASE.radius).toBe(80);
    expect(band.y1 - PLAYER_BASE.radius).toBe(932);
  });
});

describe("equipRowLayout 底坞装备横排", () => {
  const zoneW = 560 - HUD_PAD * 2 - 190 - 8; // 平时右区 190 时的左区宽 = 342

  it("zoneW 口径:560-20-190-8=342", () => {
    expect(zoneW).toBe(342);
  });

  it("n=0 无卡无芯片", () => {
    const L = equipRowLayout(0, false, zoneW);
    expect(L.shown).toBe(0);
    expect(L.chip).toBe(false);
    expect(L.cardW).toBe(0);
  });

  for (const boss of [false, true]) {
    const limit = boss ? 3 : 4;
    for (let n = 1; n <= 8; n++) {
      it(`n=${n} boss=${boss}:上限 ${limit} 张,超出收 +N 芯片`, () => {
        const L = equipRowLayout(n, boss, zoneW);
        expect(L.shown).toBe(Math.min(n, limit));
        expect(L.chip).toBe(n > limit);
        expect(L.hidden).toBe(Math.max(0, n - limit));
        expect(L.chipW).toBe(30);
        expect(L.cardH).toBe(36);
        if (L.shown > 0) {
          expect(L.cardW).toBeGreaterThanOrEqual(64);
          expect(L.cardW).toBeLessThanOrEqual(168);
          if (L.cardW > 64) {
            const used = L.shown * L.cardW + (L.shown - 1) * L.gap + (L.chip ? L.chipW + L.gap : 0);
            expect(used).toBeLessThanOrEqual(zoneW);
          }
        }
      });
    }
  }

  it("168 封顶:超宽区域不放大卡", () => {
    expect(equipRowLayout(1, false, 2000).cardW).toBe(168);
  });

  it("64 保底:窄区不缩到不可读", () => {
    expect(equipRowLayout(4, false, 200).cardW).toBe(64);
  });
});

describe("坞板比例常量(贴边全宽 560)", () => {
  it("顶坞 1120×128 == 显示比 560×64", () => {
    expect(DOCK_TOP_ASPECT).toBeCloseTo(560 / HUD_TOP_H, 10);
    expect(DOCK_TOP_ASPECT).toBeCloseTo(1120 / 128, 10);
    expect(DOCK_TOP_ASPECT).toBeCloseTo(8.75, 10);
  });
  it("底坞 1120×96 == 显示比 560×48", () => {
    expect(DOCK_BOT_ASPECT).toBeCloseTo(560 / HUD_BOT_H, 10);
    expect(DOCK_BOT_ASPECT).toBeCloseTo(1120 / 96, 10);
  });
  it("几何常量", () => {
    expect(HUD_TOP_H).toBe(64);
    expect(HUD_BOT_H).toBe(48);
    expect(HUD_PAD).toBe(10);
  });
});

describe("barFillW 胶囊条填充宽", () => {
  it("frac≤0 零宽", () => {
    expect(barFillW(150, 12, 0)).toBe(0);
    expect(barFillW(150, 12, -0.5)).toBe(0);
  });
  it("frac>0 最小宽 = h 保胶囊头", () => {
    expect(barFillW(150, 12, 0.001)).toBe(12);
  });
  it("线性段与钳制", () => {
    expect(barFillW(150, 12, 0.5)).toBeCloseTo(75, 10);
    expect(barFillW(150, 12, 1)).toBe(150);
    expect(barFillW(150, 12, 1.5)).toBe(150);
  });
});
