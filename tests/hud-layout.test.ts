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
  type TickerFlags, equipGridLayout, HUD_BOT_H_V4, castDockLayout,
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

describe("castDockLayout 两列表底坞(R10:上排技能 ≤3、下排法宝 4 / Boss 3)", () => {
  const zoneW = 560 - HUD_PAD * 2 - 136 - 8;
  it("两类都有 → 两排 + 分隔线;只有一类 → 单排无分隔;都没有 → 零排", () => {
    const both = castDockLayout(2, 3, false, zoneW, HUD_BOT_H_V4);
    expect(both.rows.map((r) => r.kind)).toEqual(["skill", "artifact"]);
    expect(both.divider).toBe(true);
    expect(both.rows[1].start).toBe(2);
    const onlySkill = castDockLayout(1, 0, false, zoneW, HUD_BOT_H_V4);
    expect(onlySkill.rows.map((r) => r.kind)).toEqual(["skill"]);
    expect(onlySkill.divider).toBe(false);
    const onlyArt = castDockLayout(0, 5, true, zoneW, HUD_BOT_H_V4);
    expect(onlyArt.rows.map((r) => r.kind)).toEqual(["artifact"]);
    expect(onlyArt.rows[0].start).toBe(0);
    expect(castDockLayout(0, 0, false, zoneW, HUD_BOT_H_V4).rows).toEqual([]);
  });
  it("每排各自算卡宽与 +N:技能排上限 3、法宝排平时 4 / Boss 3;整体在坞内垂直居中取偶、不越坞", () => {
    for (const boss of [false, true]) {
      const perRow = boss ? 3 : 4;
      for (let s = 0; s <= 4; s++) {
        for (let a = 0; a <= 8; a++) {
          const L = castDockLayout(s, a, boss, zoneW, HUD_BOT_H_V4);
          const tag = `boss=${boss} skills=${s} arts=${a}`;
          for (const r of L.rows) {
            const cap = r.kind === "skill" ? 3 : perRow;
            const n = r.kind === "skill" ? s : a;
            expect(r.shown, tag).toBe(Math.min(n, cap));
            expect(r.chip, tag).toBe(n > cap);
            expect(r.hidden, tag).toBe(n - r.shown);
            const rowW = r.shown * r.cardW + Math.max(0, r.shown - 1) * r.gap + (r.chip ? r.chipW + r.gap : 0);
            if (r.cardW > 64) expect(rowW, tag).toBeLessThanOrEqual(zoneW);
            expect(r.cardW, tag).toBeLessThanOrEqual(168);
          }
          const gridH = L.rows.length * L.cardH + Math.max(0, L.rows.length - 1) * L.rowGap;
          expect(L.y0 % 2, tag).toBe(0);
          expect(L.y0 + gridH, tag).toBeLessThanOrEqual(HUD_BOT_H_V4);
        }
      }
    }
    // 技能排只有 1–3 张 → 比法宝排更宽(两列表一眼可辨)
    const L = castDockLayout(2, 4, false, zoneW, HUD_BOT_H_V4);
    expect(L.rows[0].cardW).toBeGreaterThan(L.rows[1].cardW);
  });
});

describe("equipGridLayout v4 双排网格(坞高 96)", () => {
  const zoneW = 560 - HUD_PAD * 2 - 136 - 8;
  it("张数 ≤ 每排上限 → 单排且与旧横排同口径;超上限 → 两排;满 8 / 6 之外收 +N", () => {
    for (const boss of [false, true]) {
      const perRow = boss ? 3 : 4;
      for (let n = 0; n <= 12; n++) {
        const L = equipGridLayout(n, boss, zoneW, HUD_BOT_H_V4);
        const rows = n <= perRow ? 1 : 2;
        expect(L.rows).toBe(rows);
        expect(L.shown).toBe(Math.min(n, perRow * rows));
        expect(L.chip).toBe(n > perRow * 2);
        expect(L.hidden).toBe(n - L.shown);
        expect(L.cols).toBe(rows === 1 ? L.shown : perRow);
        // 网格连芯片都落在左区之内、纵向落在坞内且居中取偶
        const rowW = L.cols * L.cardW + Math.max(0, L.cols - 1) * L.gap + (L.chip ? L.chipW + L.gap : 0);
        if (L.cardW > 64) expect(rowW).toBeLessThanOrEqual(zoneW);
        const gridH = rows * L.cardH + (rows - 1) * L.rowGap;
        expect(L.y0 % 2).toBe(0);
        expect(L.y0 + gridH).toBeLessThanOrEqual(HUD_BOT_H_V4);
        if (n === 0) expect(L.cardW).toBe(0);
      }
    }
  });
  it("rowsMax = 1 退化成旧横排:同张数下 shown / chip / cardW 与 equipRowLayout 一致,y0 = 6", () => {
    for (const boss of [false, true]) {
      for (let n = 0; n <= 8; n++) {
        const a = equipRowLayout(n, boss, zoneW);
        const b = equipGridLayout(n, boss, zoneW, HUD_BOT_H, 1);
        expect([b.shown, b.chip, b.hidden, b.cardW]).toEqual([a.shown, a.chip, a.hidden, a.cardW]);
        expect(b.y0).toBe(6);
      }
    }
  });
  it("竞技场带随底坞高上收:battleBandY(996, 96).y1 = 900,缺省仍是 948", () => {
    expect(battleBandY(996, HUD_BOT_H_V4).y1).toBe(900);
    expect(battleBandY(996).y1).toBe(948);
    expect(HUD_BOT_H_V4).toBe(HUD_BOT_H * 2);
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
