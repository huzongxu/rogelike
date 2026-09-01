/**
 * 微信小游戏包冒烟测试 —— 用 wx 桩在 Node 中模拟微信环境,
 * require minigame/game.js,泵若干帧,验证游戏能启动并运行(不抛错)。
 * 运行:node scripts/smoke-wechat.js
 */

const store = {};
const rafQueue = [];

// ---- 2D 上下文桩 ----
const ctxStub = {
  canvas: null,
  measureText: () => ({ width: 10 }),
};
for (const m of [
  "clearRect", "fillRect", "strokeRect", "beginPath", "closePath", "clip", "arc", "arcTo", "fill", "stroke",
  "moveTo", "lineTo", "setTransform", "save", "restore", "fillText", "translate", "drawImage",
]) {
  ctxStub[m] = () => {};
}
ctxStub.createLinearGradient = () => ({ addColorStop: () => {} });
const canvas = {
  width: 405,
  height: 720,
  style: {},
  getContext: () => ctxStub,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 405, height: 720 }),
};

// ---- wx 桩 ----
global.wx = {
  createCanvas: () => canvas,
  requestAnimationFrame: (cb) => {
    rafQueue.push(cb);
  },
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => {
    store[k] = v;
  },
  getSystemInfoSync: () => ({ windowWidth: 405, windowHeight: 720, pixelRatio: 1 }),
  getPerformance: () => ({ now: () => Date.now() }),
};

// ---- 环境 shim(与 minigame/game.js 一致)----
global.window = global;
global.document = {
  getElementById: () => canvas,
  createElement: () => ({ getContext: () => null }),
  addEventListener: () => {},
};
global.location = { hash: "", href: "" };
global.performance = { now: () => Date.now() };
window.innerWidth = 405;
window.innerHeight = 720;
window.devicePixelRatio = 1;
window.addEventListener = () => {};
window.requestAnimationFrame = (cb) => wx.requestAnimationFrame(cb);

// ---- 加载游戏包(与 minigame/game.js 相同的 shim + require)----
require("../minigame/js/game.bundle.cjs");

// 入口是 loadBalanceConfig().then(() => window.game = new Game()):game 在微任务里才挂上,
// setImmediate 排在微任务之后,此时句柄必已就绪。
setImmediate(run);

function run() {
  const game = global.window.game;
  if (!game) {
    console.error("FAIL: window.game 未创建");
    process.exit(1);
  }
  console.log("入口加载 OK,state =", game.state, "(菜单)");

  // 门控校验(进度制:天数不参与门控,关卡靠推图进度解锁)
  game.startStage(2);
  if (game.state !== "menu") {
    console.error("FAIL: 新存档第 2 关应未解锁(未通关第 1 关),state =", game.state);
    process.exit(1);
  }
  console.log("第 2 关进度门控生效(未解锁),state =", game.state);

  // 从菜单进入无限关(常开,泵帧验证包体可运行)
  game.startEndless();
  if (game.state !== "playing") {
    console.error("FAIL: 无限关应常开可直接进入,state =", game.state);
    process.exit(1);
  }
  console.log("进入无限关(常开),state =", game.state);

  // 泵 60 帧,模拟运行 1 秒
  for (let i = 0; i < 60; i++) {
    const cb = rafQueue.shift();
    if (!cb) {
      console.error("FAIL: 第", i, "帧时 rAF 队列为空(循环未继续注册)");
      process.exit(1);
    }
    cb(1000 + i * 16.6);
  }

  const s = game.state;
  const eq = game.player.equipment.length;
  console.log(`60 帧运行 OK:state=${s} 装备=${eq} 敌人=${game.enemies.length} 环境词缀=${game.envAffixes.join(",") || "无"}`);

  // 续泵帧直到产生击杀(结算回响依赖本局战果;最多模拟 ~20 秒)
  let t = 1000 + 60 * 16.6;
  let guard = 0;
  while (game.state === "playing" && game.kills < 2 && guard < 1200) {
    const cb = rafQueue.shift();
    if (!cb) {
      console.error("FAIL: 等击杀时 rAF 队列为空(循环未继续注册)");
      process.exit(1);
    }
    t += 16.6;
    cb(t);
    guard += 1;
  }
  console.log(`战斗模拟 OK:击杀=${game.kills} 用时=${game.elapsed.toFixed(1)}s state=${game.state}`);

  // 玩家阵亡 → 结算界面(死亡结算挂起:先看广告复活机会,放弃才入账)
  if (game.state === "playing") {
    game.player.hp = 0;
    game.player.alive = false;
    for (let i = 0; i < 3; i++) {
      const cb = rafQueue.shift();
      if (!cb) break;
      t += 16.6;
      cb(t);
    }
  }
  if (game.state !== "gameover") {
    console.error("FAIL: 死亡后 state 应为 gameover:", game.state);
    process.exit(1);
  }

  // 放弃本局 → 死亡结算真正入账并写存档(与玩家点"回菜单"同路径)
  game.backToMenu();
  const raw = store["echo-abyss-save-v1"];
  if (!raw) {
    console.error("FAIL: 死亡结算未写入 wx storage");
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const totalEcho = (parsed.points || 0) + (parsed.dayEcho || 0);
  if (!(totalEcho >= 2)) {
    console.error("FAIL: 死亡结算点数异常:", parsed);
    process.exit(1);
  }
  console.log(`存档持久化 OK(本局回响 ${totalEcho} = 永久 ${parsed.points} + 本日 ${parsed.dayEcho})`);

  console.log("\nSMOKE PASS: 微信小游戏包可在 wx 环境运行");
}
