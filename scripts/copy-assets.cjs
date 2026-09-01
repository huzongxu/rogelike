/**
 * 微信小游戏资源同步:public/assets → minigame/assets。
 * 构建 minigame 时把美术贴图复制进小游戏包(微信资源相对入口解析为 assets/)。
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "public", "assets");
const dst = path.join(__dirname, "..", "minigame", "assets");

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(s)) {
    const ss = path.join(s, f);
    const dd = path.join(d, f);
    if (fs.statSync(ss).isDirectory()) copyDir(ss, dd);
    else fs.copyFileSync(ss, dd);
  }
  // 镜像清理:目标侧多余文件/空目录同步删除,避免退役贴图残留进小游戏包
  for (const f of fs.readdirSync(d)) {
    const ss = path.join(s, f);
    const dd = path.join(d, f);
    if (!fs.existsSync(ss)) fs.rmSync(dd, { recursive: true, force: true });
  }
}

if (!fs.existsSync(src)) {
  fs.mkdirSync(src, { recursive: true });
  console.log("[assets] 创建 public/assets/ 目录(把美术图按清单命名放进来)");
} else {
  copyDir(src, dst);
  const n = fs.readdirSync(src).length;
  console.log(`[assets] public/assets → minigame/assets 已同步(${n} 个文件)`);
}
