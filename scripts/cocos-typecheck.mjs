#!/usr/bin/env node
// 门 5:Cocos 工程全 script 树类型检查。
// 存在的理由:根 tsconfig 的 include 只覆盖 cocos-prototype/assets/scripts/game,屏层(core/ battle/ */View GameShell)不在内,
// 而 Cocos CLI 构建的 error TS 计数为 0 也不代表做了类型检查 —— 漏 import 只有实机进屏才炸。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_DIR = join(ROOT, "cocos-prototype");
const BASE_CONFIG = join(PROJECT_DIR, "temp", "tsconfig.cocos.json");
const TSC_BIN = join(ROOT, "node_modules", "typescript", "bin", "tsc");

// 已核实保留的工程内报错:file(相对 assets/scripts, posix 分隔) + 错误码 + 条数 + 为什么留着
// 形状:{ file: "path/in/assets/scripts.ts", code: "TS0000", count: 1, why: "..." }
const BASELINE = [];

const TSC_ARGS = [
  TSC_BIN,
  "-p", join(PROJECT_DIR, "tsconfig.json"),
  "--noEmit",
  "--strictNullChecks",
  "--skipLibCheck",
  "--lib", "es2020,dom",
  "--pretty", "false",
];

function fail(msg) {
  console.error(`[typecheck:cocos] ${msg}`);
  process.exit(1);
}

if (!existsSync(BASE_CONFIG)) {
  fail(`缺 ${relative(ROOT, BASE_CONFIG)}(由编辑器或命令行构建生成)。先跑门 3:rm -rf cocos-prototype/temp && npm run build:cocos`);
}
if (!existsSync(TSC_BIN)) fail("缺 node_modules/typescript,先 npm install");

const run = spawnSync(process.execPath, TSC_ARGS, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
if (run.error) fail(`tsc 启动失败:${run.error.message}`);

const ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const project = [];
let external = 0;
let unparsed = 0;
for (const line of out.split(/\r?\n/)) {
  if (!line.trim()) continue;
  if (/^\s/.test(line)) continue;
  const m = ERROR_RE.exec(line);
  if (!m) { unparsed++; continue; }
  const abs = m[1].replace(/\\/g, "/");
  if (!abs.includes("cocos-prototype/assets/")) { external++; continue; }
  const file = abs.slice(abs.indexOf("assets/scripts/") + "assets/scripts/".length);
  project.push({ file, line: Number(m[2]), col: Number(m[3]), code: m[4], text: m[5] });
}
if (unparsed && run.status !== 0) fail(`tsc 非常规退出(exit=${run.status})且输出无法解析:\n${out.slice(0, 4000)}`);

const keyOf = (e) => `${e.file}#${e.code}`;
const actual = new Map();
for (const e of project) actual.set(keyOf(e), (actual.get(keyOf(e)) ?? 0) + 1);
const expected = new Map(BASELINE.map((b) => [`${b.file}#${b.code}`, b]));

const fresh = project.filter((e) => !expected.has(keyOf(e)));
const drift = [];
for (const [k, b] of expected) {
  const n = actual.get(k) ?? 0;
  if (n === 0) drift.push(`${k} 基线条目已失效(实际 0 条),从 BASELINE 删掉`);
  else if (n > b.count) drift.push(`${k} 实际 ${n} 条 > 基线 ${b.count} 条`);
}

console.log(`[typecheck:cocos] 工程内 ${project.length} 条 / 基线 ${BASELINE.reduce((s, b) => s + b.count, 0)} 条;工程外 ${external} 条(skipLibCheck)${unparsed ? `;未识别输出 ${unparsed} 行` : ""}`);
for (const e of fresh) console.log(`  新增 ${e.file}:${e.line}:${e.col} ${e.code} ${e.text}`);
for (const d of drift) console.log(`  漂移 ${d}`);
if (fresh.length === 0 && drift.length === 0 && project.length === BASELINE.reduce((s, b) => s + b.count, 0)) {
  for (const b of BASELINE) console.log(`  基线 ${b.file} ${b.code} ×${b.count} —— ${b.why}`);
  console.log("[typecheck:cocos] PASS");
  process.exit(0);
}
console.error("[typecheck:cocos] FAIL");
process.exit(1);
