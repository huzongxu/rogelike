/**
 * 共享层纯净度守卫。
 *
 * cocos-prototype/assets/scripts/game 是 Web 与 Cocos 两端共用的单一事实源:
 * Cocos 侧 tsconfig 不带 DOM lib,一旦这里引入 cc、DOM 或 Canvas2D,
 * 同一份逻辑就无法在两端同时编译,单一事实源随即失效。
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHARED = path.join(ROOT, "cocos-prototype", "assets", "scripts", "game");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = fs.existsSync(SHARED) ? collect(SHARED) : [];
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

const CC_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']cc(?:\/[^"']*)?["']/;
const CTX_TYPE = /\bCanvasRenderingContext2D\b/;
const DOM_GLOBAL = /(?:^|[^.\w$])(window|document|navigator|localStorage|requestAnimationFrame|performance)\s*[.[]/m;

describe("共享层纯净度", () => {
  it("共享目录确实存在且有内容", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("不得引用 cc 运行时", () => {
    const bad = files.filter((f) => CC_IMPORT.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });

  it("不得使用 Canvas2D 上下文类型", () => {
    const bad = files.filter((f) => CTX_TYPE.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });

  it("不得直接使用 DOM / 宿主全局", () => {
    const bad = files
      .map((f) => ({ f, hits: (fs.readFileSync(f, "utf8").match(new RegExp(DOM_GLOBAL.source, "gm")) ?? []) }))
      .filter((r) => r.hits.length > 0)
      .map((r) => `${rel(r.f)}: ${r.hits.join(", ")}`);
    expect(bad).toEqual([]);
  });
});
