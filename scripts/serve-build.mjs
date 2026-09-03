#!/usr/bin/env node
// 起一个静态服务器托管 Cocos web-desktop 构建产物,便于浏览器实测。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(
    fileURLToPath(new URL(".", import.meta.url)), "..",
    "cocos-prototype", "build", process.argv[2] || "web-desktop"
);
const PORT = Number(process.argv[3] || 4173);
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
    ".scene": "application/octet-stream",
    ".prefab": "application/octet-stream",
};

createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "");
    try {
        const body = await readFile(join(ROOT, rel));
        res.writeHead(200, { "Content-Type": MIME[extname(rel)] || "application/octet-stream" });
        res.end(body);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
    }
}).listen(PORT, () => console.log(`[serve-build] http://localhost:${PORT}/  root=${ROOT}`));
