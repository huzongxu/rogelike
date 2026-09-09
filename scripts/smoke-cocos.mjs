#!/usr/bin/env node
/**
 * Cocos web-desktop 构建产物冒烟测试 —— scripts/smoke-wechat.cjs 的 Cocos 对应物。
 * smoke-wechat 在 Node 里用 wx 桩泵帧模拟微信环境；本脚本用本机无头 Edge 真实启动
 * cocos/build/web-desktop 产物，断言四件事：
 *   ① 产物齐全（index.html、业务 js、assets/resources 的贴图与序列化 config、引擎 js、settings）；
 *   ② 引擎自举（cc.game.inited === true）且 GameShell 组件存在、ready === true、首帧已画出；
 *   ③ SCREEN_KEYS 的 16 个屏节点都在 /Main/Canvas/World/Screen/ 下（Screen:<key>，
 *      注意它们不是 Canvas 的直接子级；键清单运行时从 core/ScreenRouter.ts 解析，不手抄）；
 *   ④ 页面没有白名单之外的未捕获异常（CDP Runtime.exceptionThrown 计数）。
 * 逐项打印 PASS/FAIL，全过 exit 0，任何一项不过 exit 1。
 *
 * 运行：npm run smoke:cocos
 * 零新依赖：node 内置模块 + 全局 fetch/WebSocket（Node >= 22）+ 本机 Edge
 * （路径候选与 .probe/p28-confirm.sh 同）。本机没有微信开发者工具，本脚本不依赖它，
 * 也不碰 bundle 分组 / 远程资源 / wechatgame 平台构建。
 *
 * 异常判据（白名单式，另见 docs/COCOS-MIGRATION.md「Phase 6 包体与首屏实测」一节）：
 *   GameShell.loadFrames（源 cocos/assets/scripts/GameShell.ts）的贴图回调防护过组件销毁 ——
 *   ready 前只 await 27 枚 HUD 构建期定格的贴图，其余 131 枚在 ready 之后后台流式加载，
 *   此期间页面内重建场景（loadScene）会销毁带在飞回调的 GameShell（引擎 destroy 把实例字段
 *   置 null）。修复前落进已销毁组件的回调读 `this.frames.set(...)` 会抛
 *   `TypeError: Cannot read properties of null (reading 'set')`，每条在飞加载一枚；
 *   现在的写法是进 Promise 前捕获 frames 引用，销毁后的回调只推进计数。
 *   修复前实测：ready 点重载场景 → 128 条（全部在飞，.probe/p29-loadscene2-test.mjs）；
 *   p28 探针 harness（探针开头条件式 loadScene('Main') 与自举抢跑）→ 113 条；
 *   单次冷导航（本脚本与 p29 三轮的形态）→ 0 条，不触发。
 *   白名单签名：异常描述以该 TypeError 文本开头 且 首个栈帧 URL 含 "/assets/main/index.js"。
 *   「未捕获异常」的 FAIL 判据只数白名单之外的异常；白名单命中单独计数打印 ——
 *   既不让这条既有挂账把冒烟判红，也不把它当成「没有异常」。计数是报告值不是硬断言：
 *   命中数随触发时在飞加载数在 0~128 之间浮动，0 同样通过。
 *
 * 计时口径：Edge 先落在一个 404 占位页（fresh user-data-dir，冷缓存），CDP attach 并
 * Runtime.enable 之后才导航到 index.html —— 保证从导航起的所有异常都被捕获。
 * 「耗时」为 node 侧 500ms 轮询粒度，仅作报告，不作断言（首屏精确计时见 .probe/p29-size-boot.sh）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const BUILD = path.join(ROOT, "cocos", "build", "web-desktop");
const ROUTER_TS = path.join(ROOT, "cocos", "assets", "scripts", "core", "ScreenRouter.ts");
const EDGE_CANDIDATES = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BOOT_TIMEOUT_MS = 60000;
const WHITELIST_PREFIX = "TypeError: Cannot read properties of null (reading 'set')";
const WHITELIST_URL_MARK = "/assets/main/index.js";

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = (name, pass, detail) => {
    results.push({ name, pass });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
};

const exceptions = []; // { whitelisted, firstLine, topUrl }
let server = null;
let edgeProc = null;
let profileDir = null;
let ws = null;

function cleanup() {
    try { if (ws && ws.readyState === ws.OPEN) ws.close(); } catch {}
    if (edgeProc && edgeProc.exitCode === null && edgeProc.pid) {
        try {
            if (process.platform === "win32") spawn("taskkill", ["/pid", String(edgeProc.pid), "/T", "/F"], { stdio: "ignore" });
            else edgeProc.kill();
        } catch {}
    }
    try { if (server) server.close(); } catch {}
    if (profileDir) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} }
}

function finish(code, tailMessage) {
    const passed = results.filter((r) => r.pass).length;
    console.log(`\n共 ${results.length} 项：${passed} PASS / ${results.length - passed} FAIL`);
    console.log(tailMessage);
    cleanup();
    process.exit(code);
}

/* ---------- ① 产物齐全 ---------- */
function walkFiles(dir, pred) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const q = path.join(d, e.name);
            if (e.isDirectory()) walk(q);
            else if (e.isFile() && (!pred || pred(q))) out.push(q);
        }
    };
    walk(dir);
    return out;
}

function checkArtifacts() {
    if (!fs.existsSync(BUILD)) {
        record("构建产物存在", false, `${BUILD} 不存在 —— 先跑 npm run build:cocos`);
        return finish(1, "SMOKE FAIL: 无构建产物");
    }
    const required = [
        "index.html",
        "application.js",
        "cocos-js/cc.js",
        "src/settings.json",
        "assets/main/index.js", // 业务 js
        "assets/resources/config.json", // resources bundle 清单
    ];
    const missing = required.filter((rel) => !fs.existsSync(path.join(BUILD, rel)));
    // 贴图：assets/resources/native 下的 PNG（构建把源 textures/*.png 按 uuid 落进 native/）
    const nativePngs = walkFiles(path.join(BUILD, "assets", "resources", "native"), (f) => f.endsWith(".png"));
    const srcPngs = walkFiles(path.join(ROOT, "cocos", "assets", "resources", "textures"), (f) => f.endsWith(".png"));
    // config：balance.json / viewTable.json 在产物里被序列化成 JsonAsset 落在 resources/import 下
    const importJsons = walkFiles(path.join(BUILD, "assets", "resources", "import"), (f) => f.endsWith(".json"));
    const findSer = (name) => importJsons.some((f) => {
        try { return fs.statSync(f).size <= 65536 && fs.readFileSync(f, "utf8").slice(0, 400).includes(`"${name}"`); }
        catch { return false; }
    });
    const cfgOk = { balance: findSer("balance"), viewTable: findSer("viewTable") };

    const problems = [];
    if (missing.length) problems.push(`缺关键文件: ${missing.join(", ")}`);
    if (nativePngs.length === 0) problems.push("assets/resources/native 下没有贴图 PNG");
    else if (srcPngs.length > 0 && nativePngs.length !== srcPngs.length)
        problems.push(`产物贴图 ${nativePngs.length} 枚 != 源图 ${srcPngs.length} 枚（产物可能落后于资源，重跑 npm run build:cocos）`);
    if (!cfgOk.balance) problems.push("resources/import 里找不到序列化的 balance.json");
    if (!cfgOk.viewTable) problems.push("resources/import 里找不到序列化的 viewTable.json");

    const mainJsBytes = fs.existsSync(path.join(BUILD, "assets/main/index.js"))
        ? fs.statSync(path.join(BUILD, "assets/main/index.js")).size : 0;
    record(
        "构建产物齐全",
        problems.length === 0,
        problems.length
            ? problems.join("；")
            : `index.html/application.js/cocos-js/settings.json 在位；业务 js assets/main/index.js ${mainJsBytes} B；贴图 native PNG ×${nativePngs.length}（源图 ×${srcPngs.length}）；config 序列化 balance=${cfgOk.balance} viewTable=${cfgOk.viewTable}`
    );
    if (problems.length) return finish(1, "SMOKE FAIL: 构建产物不完整");
}

/* ---------- SCREEN_KEYS（运行时解析源文件，不手抄 16 键） ---------- */
function readScreenKeys() {
    const src = fs.readFileSync(ROUTER_TS, "utf8");
    const m = src.match(/export const SCREEN_KEYS = \[([\s\S]*?)\] as const/);
    if (!m) return null;
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* ---------- ② 临时静态服务（listen(0) 自选空闲端口，避免与探针 harness 撞口） ---------- */
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
    ".bin": "application/octet-stream",
    ".scene": "application/octet-stream",
    ".prefab": "application/octet-stream",
};
function startServer() {
    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            const url = decodeURIComponent((req.url || "/").split("?")[0]);
            const rel = path.normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "");
            fs.readFile(path.join(BUILD, rel), (err, body) => {
                if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
                res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] || "application/octet-stream" });
                res.end(body);
            });
        });
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
}

/* ---------- ③ 无头 Edge + CDP ---------- */
function launchEdge(blankUrl) {
    const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
    if (!edge) {
        record("本机 Edge 可用", false, `两个候选路径都不存在: ${EDGE_CANDIDATES.join(" | ")}`);
        finish(1, "SMOKE FAIL: 找不到本机 Edge");
    }
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-cocos-"));
    return new Promise((resolve, reject) => {
        // --remote-debugging-port=0：让 Edge 自选空闲调试端口，从 stderr 的
        // "DevTools listening on ws://127.0.0.1:<port>/..." 读回来，杜绝与探针 harness 抢固定口。
        edgeProc = spawn(edge, [
            "--headless=new",
            "--remote-debugging-port=0",
            `--user-data-dir=${profileDir}`,
            "--window-size=684,1217",
            blankUrl,
        ], { stdio: ["ignore", "ignore", "pipe"] });
        let stderrBuf = "";
        const timer = setTimeout(() => reject(new Error("等 DevTools listening 超时(30s)。stderr: " + stderrBuf.slice(0, 500))), 30000);
        edgeProc.stderr.setEncoding("utf8");
        edgeProc.stderr.on("data", (chunk) => {
            stderrBuf += chunk;
            const m = stderrBuf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
            if (m) { clearTimeout(timer); resolve(Number(m[1])); }
        });
        edgeProc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Edge 提前退出 code=${code} stderr=${stderrBuf.slice(0, 300)}`)); });
    });
}

async function connectPage(debugPort, urlMark) {
    const deadline = Date.now() + 20000;
    let lastErr = null;
    while (Date.now() < deadline) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
            const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl && t.url.includes(urlMark));
            if (page) {
                ws = new WebSocket(page.webSocketDebuggerUrl);
                await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket connect failed")); });
                return;
            }
            lastErr = new Error("no page target yet");
        } catch (e) { lastErr = e; }
        await sleep(500);
    }
    throw lastErr || new Error("connectPage failed");
}

let mid = 0;
const pend = new Map();
function wireWs() {
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pend.has(m.id)) {
            const p = pend.get(m.id);
            pend.delete(m.id);
            if (m.error) p.rej(new Error(JSON.stringify(m.error)));
            else p.res(m.result);
            return;
        }
        if (m.method === "Runtime.exceptionThrown") {
            const d = m.params.exceptionDetails || {};
            const desc = (d.exception && (d.exception.description || `${d.exception.className} ${d.exception.message}`)) || d.text || "";
            const topUrl = (((d.stackTrace && d.stackTrace.callFrames) || [])[0] || {}).url || "";
            exceptions.push({
                whitelisted: desc.startsWith(WHITELIST_PREFIX) && topUrl.includes(WHITELIST_URL_MARK),
                firstLine: desc.split("\n")[0],
                topUrl,
            });
        }
    };
}
const send = (method, params = {}) =>
    new Promise((res, rej) => {
        const id = ++mid;
        pend.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
    });
async function evaluateJson(expression) {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error("evaluate threw: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return JSON.parse(r.result.value);
}

/* ---------- 主流程 ---------- */
async function main() {
    checkArtifacts();
    const screenKeys = readScreenKeys();
    if (!screenKeys || screenKeys.length !== 16) {
        record("SCREEN_KEYS 解析 = 16 键", false, `从 ${ROUTER_TS} 解析到 ${screenKeys ? screenKeys.length : 0} 键`);
        return finish(1, "SMOKE FAIL: SCREEN_KEYS 解析异常");
    }
    record("SCREEN_KEYS 解析 = 16 键", true, screenKeys.join(","));

    const port = await startServer();
    const blankUrl = `http://127.0.0.1:${port}/__smoke_blank__`;
    const debugPort = await launchEdge(blankUrl);
    await connectPage(debugPort, "__smoke_blank__");
    wireWs();
    await send("Runtime.enable"); // 必须在导航之前 enable，异常计数才盖得住整个启动期
    await send("Page.enable");

    const url = `http://127.0.0.1:${port}/index.html?smoke=${process.pid}-${Date.now()}`;
    const t0 = Date.now();
    await send("Page.navigate", { url });

    // 轮询自举（500ms 粒度；fresh profile + 首次真实导航 = 冷缓存）
    const bootExpr = `(() => {
        try {
            const cc = window.cc;
            if (!cc || !cc.game) return JSON.stringify({ stage: "engine-not-loaded" });
            const o = { stage: "engine", inited: !!cc.game.inited, frames: cc.director ? cc.director.getTotalFrames() : -1 };
            if (o.inited && cc.director) {
                const scene = cc.director.getScene();
                o.scene = scene ? scene.name : null;
                if (scene) {
                    let shell = null;
                    const walk = (n) => { if (shell) return; const c = n.getComponent && n.getComponent("GameShell"); if (c) { shell = c; return; } for (const k of (n.children || [])) walk(k); };
                    walk(scene);
                    o.shell = !!shell;
                    o.ready = !!(shell && shell.ready);
                }
            }
            return JSON.stringify(o);
        } catch (e) { return JSON.stringify({ stage: "probe-error", msg: String(e) }); }
    })()`;
    let st = { stage: "not-polled" };
    while (Date.now() - t0 < BOOT_TIMEOUT_MS) {
        await sleep(500);
        try { st = await evaluateJson(bootExpr); } catch { /* 导航瞬间上下文失效，下一拍重试 */ }
        if (st.ready && st.frames > 0) break;
    }
    const bootMs = Date.now() - t0;

    record("引擎自举 cc.game.inited === true", !!st.inited, st.inited ? `导航后约 ${bootMs} ms 内观察到(500ms 轮询粒度)` : `超时 ${BOOT_TIMEOUT_MS}ms，最后状态 ${JSON.stringify(st)}`);
    record("GameShell 组件存在且 ready === true", !!(st.shell && st.ready), st.shell ? `ready=${st.ready} scene=${st.scene || "?"}` : "场景里找不到 GameShell 组件(getComponent('GameShell') 字符串口径)");
    record("首帧已画出 cc.director.getTotalFrames() > 0", st.frames > 0, `frames=${st.frames}`);

    // 16 屏节点：显式走 /Main/Canvas/World/Screen 路径 + 逐键取 Screen:<key>
    const finalExpr = `(() => {
        try {
            const cc = window.cc;
            const scene = cc.director.getScene();
            const canvas = scene && scene.getChildByName("Canvas");
            const world = canvas && canvas.getChildByName("World");
            const screenLayer = world && world.getChildByName("Screen");
            const pathOf = (n) => { const parts = []; let c = n; while (c && c !== scene) { parts.unshift(c.name); c = c.parent; } if (scene) parts.unshift(scene.name); return parts.join("/"); };
            const keys = ${JSON.stringify(screenKeys)};
            const missing = [];
            let found = 0;
            for (const k of keys) {
                const n = screenLayer && screenLayer.getChildByName("Screen:" + k);
                if (n) found += 1; else missing.push(k);
            }
            return JSON.stringify({
                sceneName: scene ? scene.name : null,
                screenLayerPath: screenLayer ? pathOf(screenLayer) : null,
                keysExpected: keys.length, screensFound: found, screensMissing: missing,
            });
        } catch (e) { return JSON.stringify({ fatal: String(e) }); }
    })()`;
    let fin = { fatal: "final evaluate 未执行" };
    try { fin = await evaluateJson(finalExpr); } catch (e) { fin = { fatal: String(e) }; }
    const screensOk = !fin.fatal && fin.screenLayerPath === "Main/Canvas/World/Screen" && fin.screensFound === 16 && fin.screensMissing.length === 0;
    record(
        "16 个屏节点齐全(Screen:<key> ×16)",
        screensOk,
        fin.fatal ? fin.fatal : `路径 ${fin.screenLayerPath}；找到 ${fin.screensFound}/${fin.keysExpected}${fin.screensMissing.length ? "；缺 " + fin.screensMissing.join(",") : ""}`
    );

    // 异常计数：ready 之后后台仍在流式加载其余贴图（loadFrames 噪声源），等计数稳定再结账
    let lastCount = -1, stableMs = 0, settleMs = 0;
    while (settleMs < 30000) {
        await sleep(1000); settleMs += 1000;
        if (exceptions.length === lastCount) { stableMs += 1000; if (stableMs >= 3000) break; }
        else { stableMs = 0; lastCount = exceptions.length; }
    }
    const whitelisted = exceptions.filter((e) => e.whitelisted);
    const outsiders = exceptions.filter((e) => !e.whitelisted);
    record(
        "未捕获异常(白名单外) = 0",
        outsiders.length === 0,
        `白名单外 ${outsiders.length} 条${outsiders.length ? "：" + outsiders.slice(0, 3).map((e) => `${e.firstLine} @${e.topUrl}`).join(" | ") : ""}；` +
        `白名单内 loadFrames 既有噪声单独计数 n=${whitelisted.length}（判据见文件头注释与 docs/COCOS-MIGRATION.md，不计入 FAIL，也不视作「没有异常」）`
    );

    const failed = results.filter((r) => !r.pass);
    if (failed.length === 0) finish(0, "SMOKE PASS: Cocos web-desktop 构建产物可在无头 Edge 冷启动并进战斗屏");
    else finish(1, `SMOKE FAIL: ${failed.length} 项未过 —— ${failed.map((f) => f.name).join("；")}`);
}

main().catch((e) => {
    console.error("SMOKE FAIL: 冒烟脚本自身异常:", e && e.stack ? e.stack : e);
    cleanup();
    process.exit(1);
});
