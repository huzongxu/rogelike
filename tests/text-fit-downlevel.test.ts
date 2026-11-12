/**
 * 文本量字与折行的 downlevel 守卫(2026-09-26 实机抓到的一类静默失效)。
 *
 * Cocos 构建的 TS 目标是 ES2015 且没开 `downlevelIteration`,于是**对字符串取展开**会被降级成
 * `[].concat(text)` —— 整串变成"一个元素的数组",后果是:
 *  - `fitOne` 的逐字回退循环一次都不进 → 既不截断,又给整串补一个「…」(实机表现:文字一路顶到盒边被 CLAMP 裁掉);
 *  - `fitLines` / `levelUpDescLines` / `confirmFitLines` 的折行静默失效(升级卡面说明只剩一行)。
 * 数组展开(`[...arr]`)不受影响,受影响的只有字符串与 Set / Map 这类迭代器。
 * 正确写法 = `Array.from(text)`(仓库既有先例:`ui/PixelNumber.ts`、`game/data/pixelArt.ts` 里就写着这条注释)。
 *
 * 本文件守两件事:① 行为(折行真的折、截断真的截)—— 用两个 cc-free 的同款实现做实证;
 * ② 源码纪律:那四个量字出口里不得再出现对字符串的展开。
 * (`ui/PanelKit.ts` 与 `battle/HudView.ts` 引 `cc`,node 载不动,所以它们只进源码纪律那一节。)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { confirmFitLines } from "../cocos/assets/scripts/confirm/ConfirmModel";
import { levelUpDescLines } from "../cocos/assets/scripts/levelup/LevelUpModel";
import { LV_CARD_TEXT_MAX_W, LV_DESC_CHARS, LV_DESC_MAX_LINES, LV_DESC_PX } from "@game/ui/levelUpLayout";

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** 去掉注释再扫:那几处"为什么不用展开"的说明本身就写着展开写法 */
const codeOnly = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 只查"对字符串取展开"这一形:变量名固定几个,不误伤数组拷贝 */
const STRING_SPREAD = /\[\.\.\.(text|src|s|line|label|name|str|caption)\]/g;

/** 与 `PanelKit.approxW` 同一把尺的量字(CJK = 1×px,ASCII = 0.55×px,空格 = 0.3×px) */
const approxW = (t: string, px: number): number => {
  let w = 0;
  for (const c of Array.from(t)) {
    if (c === " ") w += px * 0.3;
    else if (c.charCodeAt(0) > 0x2e7f) w += px;
    else w += px * 0.55;
  }
  return w;
};
const measure = (t: string, px: number): number => approxW(t, px);

const DESC = "停下不动才攒荆棘层:站进怪群里养层再爆,半径与威力按层数给;代价是要挪位置时层数会断";

describe("折行实现的 downlevel 守卫", () => {
  it("升级卡面说明:按预算逐字折行,一行不超限、拼回去不丢字", () => {
    expect(LV_DESC_CHARS, "折行预算 = 卡内限宽 / 字号").toBe(Math.floor(LV_CARD_TEXT_MAX_W / LV_DESC_PX));
    const lines = levelUpDescLines([DESC], LV_DESC_CHARS, LV_DESC_MAX_LINES);
    expect(lines.length, "42 字 / 12 字一行 → 4 行").toBe(4);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(LV_DESC_CHARS);
    expect(lines.join("")).toBe(DESC);
  });

  it("确认弹层折行:逐码点试探、首字符再宽也单独成行、拼回去不丢字", () => {
    const lines = confirmFitLines(DESC, 96, 12, measure);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(measure(l, 12)).toBeLessThanOrEqual(96);
    expect(lines.join("")).toBe(DESC);
    // 代理对(emoji)按一个码点走:既不丢字,也不会被切成半个
    const emo = confirmFitLines("盾×0.2 🔥🔥", 24, 12, measure);
    expect(emo.length).toBeGreaterThan(1);
    expect(emo.join("")).toBe("盾×0.2 🔥🔥");
    for (const l of emo) expect(l.includes("\ufffd"), "不得出现半个码点").toBe(false);
  });

  it("源码纪律:四个量字出口里不得再出现对字符串的展开(必须 Array.from)", () => {
    for (const rel of [
      "../cocos/assets/scripts/ui/PanelKit.ts",
      "../cocos/assets/scripts/battle/HudView.ts",
      "../cocos/assets/scripts/confirm/ConfirmModel.ts",
      "../cocos/assets/scripts/levelup/LevelUpModel.ts",
    ]) {
      const hits = codeOnly(src(rel)).match(STRING_SPREAD) ?? [];
      expect(hits, `${rel}:Cocos 构建会把字符串展开降级成 [].concat → 截断与折行静默失效`).toEqual([]);
    }
  });
});
