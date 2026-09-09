/**
 * 首屏贴图分档的账:ready 前 await 谁、ready 之后流谁、按什么顺序流。
 *
 * 三档之间的差集必须为空。漏掉任何一枚键,那枚贴图就永远不会加载,对应画面静默缺图
 * —— 引擎不会报错,只有画面少东西,所以这条账只能靠本文件的差集断言守住。
 * 分档本身的理由:ready 时间随 await 枚数线性上涨(实测约 5 ms/枚),而每帧从 frames
 * 现读的件晚到只是晚出现,不必让它们堵在建界面之前。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ASSET_MANIFEST } from "../cocos/assets/scripts/game/data/assets";
import {
  BATTLE_FIRST_PAINT_KEYS,
  PIXEL_ART_KEYS,
  isPixelArtKey,
  streamFrameKeys,
} from "../cocos/assets/scripts/game/data/pixelArt";

const shellSrc = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** 从锚点(带 `const` 的声明前缀)起取第一个方括号数组里的字符串字面量(方括号配平扫描) */
function literals(src: string, anchor: string): string[] {
  const at = src.indexOf(anchor);
  expect(at >= 0, `找不到 ${anchor} —— 分档表改名了要同步本测试`).toBe(true);
  const open = src.indexOf("[", at);
  let depth = 0;
  let close = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  return (src.slice(open, close).match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
}

const awaited = literals(shellSrc, "const HUD_PRELOAD_KEYS = ");
const retired = literals(shellSrc, "const RETIRED_FRAME_KEYS = ");
const manifest = Object.keys(ASSET_MANIFEST);
const stream = streamFrameKeys(awaited, retired, manifest);
const loaded = new Set([...awaited, ...stream]);

describe("首屏贴图分档:await 集 / 流式队列 / 退役名单", () => {
  it("像素批次没有键落在两档之外", () => {
    const missing = PIXEL_ART_KEYS.filter((k) => !loaded.has(k));
    expect(missing, `这些像素件既不 await 也不流,画面上会永久缺图: ${missing.join(", ")}`).toEqual([]);
  });

  it("清单里未退役的键全部会加载", () => {
    const missing = manifest.filter((k) => retired.indexOf(k) < 0 && !loaded.has(k));
    expect(missing, `清单键两头不沾: ${missing.join(", ")}`).toEqual([]);
  });

  it("流式队列不夹带退役件,也不与 await 集重叠", () => {
    expect(stream.filter((k) => retired.indexOf(k) >= 0), "退役件已从 textures/ 物理移除,进队列只会换来加载失败").toEqual([]);
    expect(stream.filter((k) => awaited.indexOf(k) >= 0), "已 await 的键不该再流一次").toEqual([]);
  });

  it("队列无重复键", () => {
    expect(stream.length, new Set(stream).size !== stream.length ? `重复: ${stream.filter((k, i) => stream.indexOf(k) !== i).join(", ")}` : "").toBe(new Set(stream).size);
  });

  it("队首就是战斗第一拍那批,顺序与表一致", () => {
    const head = BATTLE_FIRST_PAINT_KEYS.filter((k) => awaited.indexOf(k) < 0);
    expect(stream.slice(0, head.length)).toEqual(head);
    expect(head.length, "队首应覆盖字形 + 敌人 + 玩家 + 特效弹道").toBeGreaterThanOrEqual(30);
  });

  it("战斗第一拍的每一枚都在 NEAREST 覆盖面内", () => {
    const notPixel = BATTLE_FIRST_PAINT_KEYS.filter((k) => !isPixelArtKey(k));
    expect(notPixel, `这些键不属于像素批次,拿不到最近邻采样: ${notPixel.join(", ")}`).toEqual([]);
  });

  it("await 枚数按实测斜率是要 conscious 的预算", () => {
    // 每多 await 一枚 PNG,ready 约晚 5 ms(实测 22→158 枚对应 2,452→3,115 ms)。
    // 要往这张表里加件,先确认它是 buildLayers 定格的(不是每帧热换),再回来改这个数。
    expect(awaited.length).toBe(27);
  });

  it("退役名单与 Cocos 侧镜像闸门两侧同源", () => {
    const syncSrc = readFileSync(new URL("../scripts/sync-cocos.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    // sync 侧按文件名登记、GameShell 侧按资产键登记,比对前统一去后缀
    const mirror = literals(syncSrc, "const RETIRED_IN_COCOS = ").map((s) => s.replace(/\.png$/, ""));
    expect(new Set(mirror).size, "sync 侧退役表自身有重复").toBe(mirror.length);
    const onlyShell = retired.filter((k) => mirror.indexOf(k) < 0);
    expect(onlyShell, `GameShell 放行而 sync 未登记的键会被镜像回灌: ${onlyShell.join(", ")}`).toEqual([]);
  });
});
