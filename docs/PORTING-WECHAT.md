# 移植到微信小游戏

策划案目标平台为微信小游戏(竖屏、首包 4MB 内、即点即玩)。**微信工程已就绪,可直接导入微信开发者工具运行**;当前产物出自 Web 基准树(见文末验证清单那条)。

## 快速开始

```bash
npm run build:minigame   # 打包 → minigame/js/game.bundle.cjs
npm run smoke:wechat     # 用 wx 桩在 Node 中冒烟测试包(无需微信开发者工具)
```

然后用微信开发者工具**导入 `minigame/` 目录**(appid 用"游客模式"即可),即可在模拟器/真机预览。

## 工程结构

```
minigame/
├── game.js               # 微信入口:环境 shim(window/document/performance) + require 游戏包
├── game.json             # 竖屏配置
├── project.config.json   # 开发者工具配置(compileType: game)
└── js/game.bundle.cjs    # 构建产物(npm run build:minigame 生成,306 kB / gzip ≈98 kB)
```

## 平台隔离设计

- 所有平台 API 收口在 `src/platform/adapter.ts`:加载时检测 `wx`,`wx.createCanvas()` / `wx.onTouchStart` / `wx.requestAnimationFrame` / `wx.setStorageSync` 全走微信原生;浏览器走 DOM。
- 游戏代码不直接触碰 `document/window/wx`,唯一例外是 `game.ts` 里的少量 `window.addEventListener`(键盘/缩放)与 `main.ts` 的 `window.game` 调试句柄——由 `game.js` 的 shim 提供无操作实现。
- **UI 点击**:微信端没有 PointerEvent,`game.ts` 检测到 `window.PointerEvent` 不存在时,用触摸模拟点击(短按且无明显位移 = 点击),升级选卡/按钮全可用;摇杆限定左半屏,右半屏留给 UI 点击。
- **兼容性兜底**:`structuredClone` 在部分微信 JS 引擎缺失,存档改用 JSON 深拷贝。

## 打包流程(每改完代码后)

```bash
npm run build:minigame   # 重新生成 game.bundle.cjs
npm run smoke:wechat     # 冒烟:加载 → 跑 60 帧 → 死亡结算写 storage
```

## 验证清单

- [x] `game.json` 竖屏
- [x] 首包 306 kB(`minigame/js/game.bundle.cjs`,gzip ≈98 kB;远低于 4MB)
- [x] 冒烟测试通过(Node + wx 桩):游戏循环/敌人生成/环境词缀/存档持久化
- [ ] 真机触摸摇杆与 UI 点击(需微信开发者工具真机预览)
- [ ] 低端机性能(实体上限已内置:`LIMITS` = 敌人 340 / 投射物 420 / 毒云 44 / 召唤物 24 / 宝石 420)
- [ ] Cocos 侧 `wechatgame` 平台构建(当前 `npm run build:minigame` 走 `vite.config.minigame.ts` 的 `entry: "src/main.ts"`,打出的是 Web 基准树;Cocos 工程出微信包属 `docs/COCOS-MIGRATION.md` Phase 6 未完项)

## 注意事项

- 真机预览前把 `project.config.json` 的 `appid` 换成你的小游戏 appid(当前为 `touristappid` 游客模式)。
- 若需接入微信登录/云开发/分享,在 `game.js` 与 `src/platform/adapter.ts` 扩展即可。
- 开发者工具勾选"ES6 转 ES5"兼容旧机型(`setting.es6` 已开启)。
