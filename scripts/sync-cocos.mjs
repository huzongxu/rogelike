#!/usr/bin/env node
// 把 web 侧资源镜像到 Cocos 工程的 resources bundle,供 Creator 导入。
// 只新增/覆盖,从不删除:编辑器生成的 .meta 与手工换图不受影响。
import { readdirSync, statSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "cocos-prototype", "assets", "resources");

const PAIRS = [
    { from: join(ROOT, "public", "assets"), to: join(OUT, "textures"), filter: (f) => f.endsWith(".png") },
    { from: join(ROOT, "public", "config"), to: join(OUT, "config"), filter: (f) => f.endsWith(".json") },
];

function needsCopy(src, dst) {
    if (!existsSync(dst)) return true;
    const a = statSync(src);
    const b = statSync(dst);
    return a.size !== b.size || a.mtimeMs > b.mtimeMs;
}

let copied = 0;
let skipped = 0;
for (const { from, to, filter } of PAIRS) {
    if (!existsSync(from)) {
        console.warn(`[sync-cocos] 源目录不存在,跳过:${from}`);
        continue;
    }
    mkdirSync(to, { recursive: true });
    for (const file of readdirSync(from)) {
        if (!filter(file)) continue;
        const src = join(from, file);
        const dst = join(to, file);
        if (!needsCopy(src, dst)) {
            skipped++;
            continue;
        }
        copyFileSync(src, dst);
        copied++;
        console.log(`[sync-cocos] ${basename(to)}/${file}`);
    }
}
console.log(`[sync-cocos] 完成:新增/更新 ${copied} 个,已是最新 ${skipped} 个`);
