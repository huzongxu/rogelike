# 《回响深渊》Cocos Creator 迁移方案

把当前 Vite + TypeScript 自研 Canvas 2D 引擎的渲染层与主控循环，重写为 Cocos Creator 3.8.8 的场景/节点/组件体系。玩法数值、系统逻辑、数据表保持单一事实源，只换"怎样把一帧画出来、怎样把一次点击路由出去"。

- 编辑器：`C:/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe`
- 工程目录：`cocos-prototype/`
- 现有 Web 构建（`src/`、`public/`、`index.html`、`vite.config.*`）继续可用，作为逐屏对标的基准线。

---

## 1. 现状盘点（迁移工作量的事实源）

### 1.1 代码规模

| 位置 | 文件数 | 行数 | 迁移归属 |
| --- | --- | --- | --- |
| `src/game.ts` | 1 | 5426 | 拆解重写（本方案主体）；战斗编排已委托 `@game/systems/battleWorld` |
| `src/main.ts` | 1 | 29 | 由 `Bootstrap.ts` 取代 |
| `src/platform/adapter.ts` | 1 | 180 | 引擎通道，逐项替换 |
| `src/core/` | 3 | 504 | `math.ts` 已入共享层；`fxLayer` `input` 属宿主通道，Phase 1 节点化 |
| `src/data/` | 28 | 5568 | 28 张表全部已入共享层 |
| `src/entities/` | 4 | 1167 | 4 个全部已入共享层 |
| `src/systems/` | 4 | 1392 | `waves` `equipmentEngine` `onboarding` 已入共享层；`save` 走宿主存档通道 |
| `src/ui/` | 8 | 1628 | 布局/纯逻辑 6 个已入共享层；`theme` 的 Canvas2D 画笔拆到宿主侧 `themePaint.ts`，`skin` `heroPortrait` 留宿主侧 |
| `src/dev/` | 3 | 1817 | 布局台，Phase 2 重定向 |
| `public/assets/` | 152 PNG | — | 资源镜像 |
| `public/config/` | balance.json | — | 数据表镜像 |

### 1.2 `game.ts` 内部结构（拆解清单）

**状态机**：`type GameState`（:270）16 个字面量 —— `menu` `playing` `gameover` `victory` `prestige` `fusion` `commission` `gacha` `shop` `pass` `daily` `energy` `season` `leaderboard` `gearup` `heroes`；另有 `overlayFrom`（:458）记录覆盖层来源，以及 4 个非屏幕态标记 `confirm` / `pendingHidden` / `adBusy` / `bossBanner`。

**绘制方法**：30 个 `private draw*(g: CanvasRenderingContext2D, ...)`

- 战斗与 HUD（9）：`drawWorld` `drawHUD` `drawTopDock` `drawBottomDock` `drawDockPlate` `drawHudTicker` `drawRestZone` `drawGuideBanner` `drawJoystick`
- 屏幕（17：覆盖 `menu` `shop` `heroes` `gacha` `pass` `daily` `energy` `season` `leaderboard` `gearup` `prestige` `fusion` `commission` `gameover` `victory` 共 15 个状态，另加 `commission` 的子面板绘制器与 `confirm` 覆盖层绘制器；`playing` 的绘制器是 `drawWorld`，归在下一组）：`drawMenu` `drawShop` `drawHeroes` `drawGacha` `drawPass` `drawDaily` `drawEnergy` `drawSeason` `drawLeaderboard` `drawGearUp` `drawPrestige` `drawFusion` `drawCommission` `drawCommissionPanel` `drawGameOver` `drawVictory` `drawConfirm`
- 公共件（4）：`drawSectionHeader` `drawTriplePanel` `drawHiddenChoice` `drawSlamWarn`

外加导入的绘制器：`drawBar` `drawAvatarFrame` `drawQualityFrame`（`ui/skin.ts`）、`drawHeroPortrait`（`ui/heroPortrait.ts`）、`drawGacha`/`drawGacha10`（`data/gacha.ts`）、`assets.drawNine`/`drawNineUniform`（`platform/assets.ts`）。

**输入**：`handleTap`（:604）单点分发 + 13 个 `on*Click`（`onMenuClick` `onShopClick` `onGachaClick` `onPassClick` `onDailyClick` `onEnergyClick` `onGearUpClick` `onSeasonClick` `onLeaderboardClick` `onHeroesClick` `onPrestigeClick` `onFusionClick` `onCommissionClick`）+ `onPointerUp` `onKey` `onFusionEquipmentTap` `onDeath` `pickHiddenAffix`；命中测试 6 个具名（`hitPanelBack` `hitRestart` `hitTalentsBtn` `hitMenuBtn` `hitReviveBtn` `hitDoubleBtn`）+ 通用 `heroIn(p,r)`。

**布局**：12 个每帧调用的布局方法（`confirmLayout` `shopLayout` `passActRect` `heroLayout` `menuLayout` `gachaLayout` `prestigeLayout` `fusionLayout` `triplePanelRects` `energyLayout` `dailyLayout` `commissionLayout`）；纯构建器散布在 `ui/`（`nineMarginPure` `menuLayoutPure` `heroSelectLayout` `confirmRects` `spreadRows` `equipRowLayout` `scrollViewport` `scrollThumb`）；10 个持久矩形字段（`arena` `guideBanner` `commPanelBtns` `seasonBtn` `gearRows` `restartBtn` `talentsBtn` `menuBtn` `reviveBtn` `doubleBtn`）。

**主循环**：`private render()`（:3202）由 RAF（:538-545，`update` → `render`）驱动。绘制顺序：letterbox 底色 `#0b0e14` → `bgCoverKey` 满幅背景（`globalAlpha 0.55` + `rgba(11,14,20,0.35)` 遮罩）→ 屏幕背景 → `translate` + `drawWorld` → 按状态依次 `draw*` 屏幕 → `drawGuideBanner` `drawJoystick` `drawConfirm`。

**Canvas2D 原语调用点分布**（决定 Cocos 通道的优先级）

| 原语 | 次数 | 原语 | 次数 |
| --- | --- | --- | --- |
| `fillStyle` | 395 | `arc` | 43 |
| `font` | 256 | `beginPath` | 52 |
| `fillText` | 254 | `fill` | 37 |
| `textAlign` | 180 | `stroke` | 34 |
| `strokeStyle` | 108 | `globalAlpha` | 29 |
| `lineWidth` | 66 | `measureText` | 29 |
| `fillRect` | 119 | `assets.draw` | 58 |
| `strokeRect` | 75 | `drawImage` | 12 |
| `drawNine` / `drawNineUniform` | 9 / 4 | `setLineDash` | 4 |
| `createRadialGradient` / `createLinearGradient` | 3 / 1 | `setTransform` / `translate` / `rotate` | 6 / 6 / 1 |

---

## 2. 目标架构

### 2.1 一个画面 = 一条通道

| Web 侧 | Cocos 侧 | 说明 |
| --- | --- | --- |
| 单 `<canvas>` + RAF | `Main.scene` 的 Canvas + Camera，`GameShell.update(dt)` 驱动推进 | 渲染交给引擎，主循环只保留"推进世界" |
| `render()` 里的 `if (state === ...)` | `ScreenRouter` + Screen 层节点 `active` 切换 | 状态即屏幕，屏幕即节点子树 |
| `ctx.fillText` ×254 | `Label`（`useSystemFont`）+ `bindLabel` 缓存刷新 | 见 §4.2 |
| `ctx.fillRect`/`strokeRect` ×194 | `Graphics` / `solidRect` / `bar` | 见 §4.3 |
| `assets.draw` ×58 + `drawImage` ×12 | `Sprite`（`SIMPLE` / `cover`） | 见 §4.1 |
| `drawNine*` ×13 | `Sprite`（`SLICED`）+ 运行时 inset | 见 §4.1.2 |
| `globalAlpha` ×29 | `UIOpacity` | 不参与布局，可 tween |
| `arc`/`stroke`/`setLineDash` | `Graphics`（`circle`/`arc`/`line`） | 保留在需要程序化描图的少数场合 |
| 手工飘字/震屏计时 | `tween` + 对象池 | 见 §4.4 |
| `measureText` ×29 | `Label` 内容尺寸 / `UITransform.width` | 排版期不再量字 |

### 2.2 节点层级（骨架已落地并验证）

```
Main (scene)
└── Canvas                     560 × designH（FIXED_WIDTH）
    ├── Camera
    ├── Background             满幅
    │   ├── Cover              bg_menu 等满幅立绘，UIOpacity=backdrop.coverAlpha
    │   └── Dim                backdrop.dimColor 遮罩
    └── World
        ├── Screen             路由容器
        │   ├── Screen:battle  ← BattleView + Hud 挂在这条子树下
        │   ├── Screen:menu
        │   ├── Screen:heroes
        │   └── …（其余 13 屏 Phase 3/4 补）
        └── Overlay            confirm / 广告遮罩 / 引导，跨屏常驻
```

关键约定：**每个屏幕的视图节点必须挂在 `Screen:<key>` 之下**，路由的 `onShow/onHide` 只切 `node.active`。战斗占位与 HUD 一旦挂到 `World`，就会在菜单屏上漏画。

`BattleView` 子树（当前骨架）：

```
Screen:battle
├── BattleView                 560 × worldH()（钳到 996）
│   ├── Grid                   Graphics，rgba(255,255,255,0.05) 1px，步长 gridStep
│   ├── Enemies                对象池宿主，占位为 Graphics 方块
│   └── FloatText              伤害飘字池
└── Hud                        Wave / Echo 胶囊条（Phase 1 展开为双坞）
```

### 2.3 屏幕与路由

`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 与 16 个 `GameState` 等量对应，其中 15 项同名，唯一改名是 Web 的 `playing` → Cocos 的 `battle`，与 `BattleView` / `Screen:battle` 节点命名对齐。改名只发生在路由键这一层，存档与系统逻辑里的状态语义不变。

- `register(key, { active, onShow, onHide, refresh })`
- `show(key)` / `current` / `currentScreen` / `refresh` / `onChange`
- `blocksPlay()`：`current !== "battle"` 时暂停世界推进，等价于 Web 侧 `state !== "playing"` 不进 `update`。

`confirm` / `pendingHidden` / `adBusy` / `bossBanner` 不进 `SCREEN_KEYS`：它们是覆盖层，归 `Overlay`，用独立组件管理，避免"覆盖层把屏幕态冲掉"这类老问题在 Cocos 里复现。

---

## 3. 坐标与布局模型

**单一换算点**。纯布局函数继续输出 Web 时代的"左上原点设计像素矩形" `Rect{x,y,w,h}`，只在落到节点的那一刻调用 `placeRect()` 转成 Cocos 位置。这样 `ui/menuLayout.ts`、`ui/heroSelectLayout.ts`、`ui/shop.ts` 里的纯矩形包可以原样搬过来复用，包括布局台的实测数据。

```ts
placeRect(node, r, W = DESIGN_W, H = logicalH()):
  anchor = (0.5, 0.5)
  contentSize = (r.w, r.h)
  position = (r.x + r.w/2 - W/2,  H/2 - (r.y + r.h/2))
```

**必须遵守的推论**：`placeRect` 只对"父节点与设计空间同心"的节点成立。子节点内的局部矩形（行内文字、按钮内文字）必须把父节点尺寸传进去，即 `label(..., { rect, box: { w: parentW, h: parentH } })`。漏传 `box` 的表现是子文字整体飞到屏幕外。

设计分辨率：`view.setDesignResolutionSize(560, designHeight, FIXED_WIDTH)`，宽度恒 560，高度按窗口比例取整并钳到 `[996, 1246]`；战场高度另钳 `WORLD_H_CAP = 996`，与 Web 版"战场锁 560×996"同源。多出的高度用于顶部/底部坞与休息区，`drawRestZone` 的等价逻辑由坞节点的自然高度承担。

`coverRect(r, srcW, srcH)` 返回**同心外溢矩形**（`x - (w-r.w)/2`），与 `src/platform/assets.ts:100` 的 cover 语义一致；只放大宽高而不回移原点会让背景偏移半个溢出量。

---

## 4. 渲染方案

### 4.1 Sprite

#### 4.1.1 满幅背景与立绘
`Sprite.Type.SIMPLE` + `sizeMode = CUSTOM`，尺寸取 `coverRect(...)`，透明度取 `viewTable().backdrop.coverAlpha`，其上再叠 `Dim` 遮罩矩形。对应 Web `render()` 开头三段。

#### 4.1.2 九宫格
边距不写进代码，运行时从 `resources/config/viewTable.json` 推导：

```json
"nineSlice": { "factor": 0.35, "keys": { "menu_row_plate": 33, "hud_dock_top": 44, ... } }
```

`borderOf(key, srcW, srcH)` = 表内显式值，缺省回落 `floor(min(srcW,srcH) * factor)`，与 Web `drawNineUniform` 的角深自动推导同源。落地方式：`frame.clone()` → 写 `insetLeft/Right/Top/Bottom` → `Sprite.Type.SLICED`。每张图克隆一份，避免污染共享 SpriteFrame。

已入表的 15 个键覆盖 `menu_row_plate(_current)` `menu_strip_plate` `menu_note_plate` `menu_section_strip` `menu_set_plate` `menu_chip_plate` `btn_*` `hud_dock_*`；源图尺寸已实测（如 `menu_row_plate` 1024×95、`btn_primary` 640×205、`bg_menu` 1024×1792），显式边距即据此定。

#### 4.1.3 缺图兜底
`assets.draw` 在 Web 侧找不到 key 会返回 false，调用方回落到代码描形。Cocos 侧保持同一语义：`frames.get(key)` 取不到就建 `Graphics` 占位（`BattleView.makeOrbitNode` 已按此实现）。**注意 `addComponent(Sprite)` 会自动带一个 `UITransform`，后续要 `getComponent(UITransform) || addComponent(UITransform)`，否则节点上会出现两个 UITransform。**

### 4.2 Label
系统字体（`useSystemFont = true`，`fontFamily = "system-ui, sans-serif"`），随包不分发字体文件。字阶令牌 `FS = { display:28, title:22, section:16, body:14, muted:13, micro:12 }`，与 `src/ui/theme.ts` 的 `fs` 同源。

刷新走 `bindLabel(lb, text)`：内部比较 `lb.string`，同文本直接返回，避免每帧重排文本。这是 HUD 与飘字性能的关键——Web 侧每帧 `fillText` 无所谓，Cocos 侧改 `Label.string` 会触发重排与网格重建。

`textAlign` 的 180 个调用点映射到 `horizontalAlign` + 节点锚点；`drawHeroPortrait` 与品质框内的居中文字，靠 `box` 局部矩形解决，不做像素量字。

### 4.3 Graphics
用于纯色矩形、圆角条、进度条、地面网格、预警圈、虚线。`solidRect(name,parent,rect,color)` 与 `bar(name,parent,bg,radius).draw(ratio,color)` 已覆盖 `fillRect` 与 HP/能量/经验条两类高频形态。

网格严格对标 `src/game.ts:3299`：`rgba(255,255,255,0.05)`、`lineWidth 1`、步长 `gridStep`、按 `arena` 钳边。骨架里用 `new Color(255,255,255,14)`，与 Web 的 alpha≈13 视觉等价。

`createRadialGradient`（3 处）与 `createLinearGradient`（1 处）优先改用美术贴图 + `UIOpacity`；确有需要的场合保留 Graphics 描形，不引入 Shader——这是后续可选优化项。

### 4.4 对象池与动画
- 敌人/弹道/粒子/飘字：`NodePoolLite`（骨架已实现，空闲列表上限 64）→ Phase 1 换 `cc.NodePool`，池宿主是 `Enemies` / `FloatText` 节点。
- 飘字：出池 → `tween` 上移 + `UIOpacity` 淡出 → 回池。替代 Web 侧手写 `life` 计时。
- 震屏/闪烁：`tween` 节点位置与 `UIOpacity`，替代 `translate` + `globalAlpha`。
- `core/fxLayer.ts` 的 `Particle` / `Ring` / `BurstOpts` / `RingOpts` 是纯数据时间轴，保留；只把"画"换成节点，"推进"仍由 `FxLayer.tick(dt)` 驱动，这样 14 个玩家技能 + 10 类敌人机制特效的既有配置不用重做。

---

## 5. 输入迁移

`handleTap` + 13 个 `on*Click` + 6 个 `hit*` 全部退役，改为节点事件：

| Web | Cocos |
| --- | --- |
| 画布 `pointerdown` → 坐标换算 → `handleTap` 按状态分发 | 每个可点节点 `node.on(Node.EventType.TOUCH_END, ...)` |
| `hit*(p, rect)` 手写矩形判定 | 引擎命中（节点 `UITransform` 即热区） |
| `heroIn(p, r)` | 列表项节点各自监听 |
| `onKey` | `input.on(Input.EventType.KEY_DOWN, ...)` |
| 摇杆（`drawJoystick` + 拖拽判定） | 全屏 `TOUCH_START/MOVE/END` + 一个 `JoystickView` 组件 |
| 滚动列表（`ui/scrollList.ts` 的 `clampScroll` `dragScrollFrom` `flickOf` `inertiaNext`） | `ScrollView` + `ScrollBar`，惯性参数搬到 `viewTable.json` |

保留一条规则：**热区尺寸与视觉底板可以分离**。Web 侧"宽热区"（如布局台里补星命中的 `makeupRect`）在 Cocos 里用一个透明父节点承载，避免为了热区去改贴图。

`onDeath` / `pickHiddenAffix` / `onFusionEquipmentTap` 属于流程回调，不变成事件，仍由系统层调用，屏幕组件只提供"显示 + 收集一次输入"。

---

## 6. 数据表、存档与平台通道

| 通道 | Cocos 实现 | 状态 |
| --- | --- | --- |
| 数值表 `balance.json` | `resources.load("config/balance", JsonAsset)`，`num(table, section, key, fallback)` 带 `Number.isFinite` 钳制 | 已落地 |
| 渲染参数表 `viewTable.json` | 同上；`nineSlice` / `battle` / `backdrop` 三段 | 已落地 |
| 存档 | `sys.localStorage`，键 `echo-abyss-save-v1`，读写各包 `try/catch` | 已落地 |
| 激励广告 | `sys.Platform.WECHAT_GAME` 判端；微信走 `createRewardedVideoAd` + `onClose`/`offClose`，其他端 `setTimeout(AD_SIMULATE_MS)` 模拟 | 已落地（单元 ID 待填真实值） |
| 平台判定 | `sys.Platform.WECHAT_GAME` / `globalThis.wx.createCanvas` | 已落地 |

**注意 `cc` 不导出名为 `resource` 的资源管理器**；`assets/resources/**` 下的资源一律通过 `resources` Bundle 加载，JSON 用 `JsonAsset`，贴图用 `"textures/<key>/spriteFrame"` + `SpriteFrame`。

数据表纪律沿用 `docs/DESIGN-VALUES-SPEC.md`：凡是"数据与逻辑有关联"的值都进表。`backdrop.coverAlpha` / `backdrop.dimColor` 就是按这条规则进 `viewTable.json` 而不是写进 `GameShell` 的。

Phase 0 的表扩展：`viewTable.json` 增加 `label`（字阶/行距系数）、`scroll`（惯性/回弹）、`fx`（飘字时长/位移/淡出曲线）、`pool`（各类池预容量）四段，把 §4 里剩下的常量收干净。

---

## 7. 构建链路与验证方法

### 7.1 资源镜像
`npm run sync:cocos`（`scripts/sync-cocos.mjs`）把 `public/assets/*.png` → `cocos-prototype/assets/resources/textures/`，`public/config/*.json` → `resources/config/`。只新增与覆盖，不删除。PNG 的 `.meta` 由编辑器 asset-db 自动生成（含 texture + spriteFrame 两个 subMeta）。

当前校验用的构建含 36 张贴图；全量 152 张镜像后需重建一次，确认包体与加载耗时（见 §9 风险 R2）。

### 7.2 命令行构建 + 本地服务
```bash
npm run build:cocos                      # CocosCreator --project cocos-prototype --build "platform=web-desktop"
node scripts/serve-build.mjs web-desktop 4181   # 静态服务构建产物
```
`build:cocos` 日志里 `Exit process with code:null, signal:SIGTERM in task build-script` 出现在每次成功之后，属编辑器收尾噪声，判成败看 `build Task (web-desktop) Finished`。

### 7.3 运行时探针（骨架阶段的主要验证手段）
web-desktop 构建里 `cc` 是全局对象，可直接内省真实节点树：

1. `navigate_page` 打开 `http://localhost:4181/?v=N`（换 `N` 破缓存）。
2. 一次同步调用设竖屏并重建代码树：`cc.view.setFrameSize(430, 932); cc.director.loadScene('Main')`。
3. 再发一次同步调用读节点树（此时 `boot()` 的异步加载已完成）。

三条硬性注意：
- **`evaluate_script` 里不能 await**。返回 Promise 的脚本会被回收（`"Promise was collected"`）或超时。加载与探针必须拆成两次独立调用。
- **`getComponent(cc.UITransform)` 会返回 null**——全局 `cc` 上的类引用与 bundle 内部构造器不同一。取组件一律用字符串形式：`getComponent('cc.UITransform')` / `'cc.Label'` / `'cc.Sprite'` / `'cc.UIOpacity'` / `'GameShell'`。
- **引擎必须先被"看见"一次才能起来。** 内置浏览器面板处于后台时，Chromium 对该表面的 rAF 是彻底挂起而非降频：干净加载后等 25 秒，`cc.game.inited` 仍为 `false`、`cc.director.getTotalFrames()` 仍为 `0`、`getScene()` 返回 `null`；手动调 `cc.game.init()` / `cc.game.run()` 也救不回来，且重复调 `setFrameSize` 会让设计分辨率累积放大（实测 visibleSize 从 560×1214 一路涨到 1280×2774，只能重新 navigate）。所以每期验证前请人把面板打开一次；**引擎初始化之后，即使面板再次转入后台，`cc.game.step(1 / 60)` 手动推进与抓图都照常可用**。

抓图不依赖 `take_screenshot`——面板不可见时它一律报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE … visible=false`，且 `bringToFront` 无效。改由页面自己 `canvas.toDataURL('image/png')` 返回整串 base64，经 `evaluate_script` 的 `filePath` 参数落盘（返回值写进文件、不进上下文），再用 node 解码成 PNG；Web 侧 Canvas2D 与 Cocos 侧 WebGL 都适用。两端取景对齐的办法是在页面内按内容包围盒裁切再缩放到同尺寸。Web 侧的循环可以直接手动驱动（`window.game` 已暴露，`game.update(1/60); game.render()`，开局调 `game.startStage(1)` 比派发键盘事件可靠），没有引擎起不来的问题。

`setFrameSize(430,932)` 后 visibleSize 为 560×1213.77，可稳定复现竖屏；桌面窗口下看到的横向裁切是 FIXED_WIDTH 下的取景结果，不是布局缺陷。

### 7.4 已通过的骨架验收
- 启动链：`loadBalance` + `loadViewTable` + `loadFrames` 并行完成 → `buildLayers()` → 读档 → `router.show("battle")`，`ready === true`。
- 背景：`Cover p0,0 s694x1214 op140` + `Dim s560x1214`，居中与压暗均对标 Web。
- 战场：`BattleView s560x996` → `Grid s560x996`，8 个轨道占位成环，金色伤害飘字落在带内。
- 菜单：`menu_row_plate` 九宫格三行 + 金色标题，`RowText p0,-2`、`BackText p0,-4` 均在父矩形内居中。
- 路由：切 `menu` 时 `Screen:battle active=false`，战场占位与 HUD 不再漏画；切回 `battle` 时完整恢复。

---

## 8. 分期计划

### Phase 0 — 纯逻辑单一事实源（已落地）

共享层位于 `cocos-prototype/assets/scripts/game/`，42 个文件：`core/math.ts`、`data/`（28 张表）、`entities/`（4）、`systems/`（`waves` `equipmentEngine` `onboarding`）、`ui/`（`theme` `hud` `menuLayout` `shop` `heroSelectLayout` `scrollList`）。两端读同一份源码。

**引用约定**：Web 侧（`src/`、`tests/`、`scripts/`）一律用 `@game/*` alias，由 `vite.config.ts` / `vite.config.minigame.ts` 的 `resolve.alias` 与 `tsconfig.json` 的 `paths` 双处声明（vitest 无独立配置，直接读 `vite.config.ts`）。共享层内部一律用相对路径 —— Cocos 的 `temp/tsconfig.cocos.json` 只映射 `db://assets/*`，alias 在那一侧解析不到。

**宿主边界**：碰 Canvas2D / DOM / `localStorage` 的模块留在 Web 侧，Phase 1–3 各自换成 Cocos 通道 —— `core/fxLayer.ts`、`core/input.ts`、`systems/save.ts`、`ui/skin.ts`、`ui/heroPortrait.ts`、`ui/themePaint.ts`。其中 `ui/theme.ts` 按"色板/字阶/矩形几何入共享层，7 个 Canvas2D 画笔留宿主侧"拆分，`themePaint.ts` 反向依赖 `@game/ui/theme` 的 token。

**守卫**：`tests/shared-purity.test.ts` 四条断言 —— 共享目录存在且有内容；不得 `from "cc"` / `import("cc")` / `require("cc")`；不得出现 `CanvasRenderingContext2D`；不得直接使用 `window` `document` `navigator` `localStorage` `requestAnimationFrame` `performance`。

**依赖**：新增 devDependency `@types/node ^22`，供 `vite.config.ts` 的 `fileURLToPath` alias 写法与守卫测试的 `node:fs` / `node:path` / `node:url` 使用（`types: ["vite/client"]` 不提供，显式 import 仍需包在盘上）。

验收（已逐项实测通过）：`npm run build`（Web，tsc `--noEmit` + vite build）与 `npm run build:cocos`（web-desktop）均通过；`npm test` 40 套件 / 1039 用例全绿；守卫测试对注入的 `from "cc"` 报错；`public/config/balance.json` 与 `cocos-prototype/assets/resources/config/balance.json` 逐字节相同（由 `npm run sync:cocos` 镜像）。共享层确实进入 Cocos 产物：`spreadRows` / `confirmRects` 出现在 `cocos-prototype/build/web-desktop/assets/main/index.js`。

### Phase 1 — 战斗主屏（已落地）

`cocos-prototype/assets/scripts/battle/` 六个模块：`BattleSim`（共享层适配器，注入 `FxLayerData` 作绘制桥）、`BattleWorldView`（实体渲染 + `cc.NodePool` 对象池）、`HudView`（顶坞 64 / 底坞 48，几何全部走 `game/ui/hud.ts`）、`FxView` + `FxCore`（`fxLayer` 的纯数据时间轴保留，只把"画"换成节点；含飘字池）、`JoystickView`（全屏 `TOUCH_START/MOVE/END` + 键盘）。`GameShell` 收敛为搭层级、装载资源、跑路由、交 dt 四件事。`viewTable.json` 扩 `battle`/`fx`/`pool`/`hud`/`joystick` 五段。

**顺带关闭了 R1**：战斗编排层（每帧推进顺序、`updatePlayer`/`updateEnemies`/`updateProjectiles`/`updateClouds`/`updateMinions`/`updateGems`、`damageEnemy` 倍率管线、`killEnemy`、接触与震击伤害、章节与 Boss 流程、飘字与特效事件的数据层）抽入 `game/systems/battleWorld.ts`，`src/game.ts` 与 `BattleSim` 共用同一份。接缝是 `BattleRunInputs`（宿主喂数值上下文）、`BattleWorldHost`（章末/死亡/通关回报宿主）、`FxBridge`（各端注入绘制桥）；存档 schema 留在宿主侧 `core/SaveModel.ts`，共享层不经任何持久化通道。

验收（已实测）：战斗画面与 Web 逐屏截图比对通过；HUD 14 条实时文案与 Web 模板逐字吻合（含 `初入尸潮 ·  · 第 1/20 章` 的双分隔符 —— `chapterTypeLabel()` 对普通章返回空串，属 Web 原样，移植中不要"修"）；顶坞 `560×64 @ y=466`、底坞 `560×48 @ y=-474` 与 `hud.ts` 常量精确吻合；敌人节点数与逻辑实体数逐采样一致，池峰值不越 `LIMITS`；`npm test` 41 套件 / 1044 用例、`npm run build`、`npm run build:cocos` 全绿。

**尚未在本期闭环的验收项**：60 帧稳定与 `bindLabel` 命中率打点未做量化采样；死亡/胜利结算屏属 Phase 5，当前死亡是静默冻结；章节结束直接 `nextChapter` 跳过商店（商店屏属 Phase 3）；粒子光晕用半透明圆替代 Web 的叠加径向渐变（符合 R8 的"优先贴图，不引 Shader"）；环境词缀的行情图标省略。

**编排层的行为保护**：`tests/battle-fingerprint.test.ts` 用定种子 `Math.random` 与固定 `Date.now` 驱动 `BattleSim` 跑 3000 帧，把每 500 帧的状态计数与敌人/弹道集合的 FNV-1a 哈希钉成内联快照，另有四条不依赖基线的不变量（实体数组引用身份稳定、不越 `LIMITS`、玩家留在竞技场带内、确实在产出击杀/金币/飘字）。改动 `battleWorld` 的推进顺序、倍率管线、钳制边界或掉落规则都会在这里显形；更新基线 `npx vitest run tests/battle-fingerprint.test.ts -u`。

### Phase 2 — 布局台重定向
`src/dev/{labModel,labSkin,layoutWorkbench}.ts` 改为消费 Cocos 节点几何，`?lab=1` 在 web-desktop 构建内可用，导出仍写 `balance.json` 的 `menuLayout` 段与 `viewTable.json`。

验收：拖拽手柄改位置/尺寸 → 画面实时跟随 → 导出 JSON → 重新加载后一致；`menuSkin` 五段通道（换图/四边间距/显隐）在 Cocos 侧生效；双通道换图（配置 remap + 本地预览）行为与 Web 相同。

### Phase 3 — 菜单 / 商店 / 英雄
`drawMenu` `drawShop` `drawHeroes` + `ui/{menuLayout,shop,heroSelectLayout,scrollList,heroPortrait}.ts` 的矩形包与滚动容器节点化。

验收：三屏与 Web 截图对标；主菜单文字无遮挡（行板内缩语义由 `box` 局部矩形保证）；英雄列表 12 项滚动惯性手感与 Web 一致；`selectedHero` 变更 → `selectedSet` 派生镜像同步。

### Phase 4 — 成长系统屏
`drawGacha` `drawPass` `drawDaily` `drawSeason` `drawLeaderboard` `drawGearUp` `drawPrestige` `drawFusion` `drawCommission(+Panel)`。含 `data/gacha.ts` 的 `drawGacha`/`drawGacha10` 贴图优先通道。

验收：每屏一张对标截图 + 一次完整交互闭环（进入→操作→返回，`overlayFrom` 语义正确）；广告位 `adBusy` 期间世界不推进。

### Phase 5 — 流程屏与覆盖层
`drawGameOver` `drawVictory` `drawConfirm` `drawTriplePanel` `drawHiddenChoice` `drawSectionHeader` `drawSlamWarn` + `Overlay` 常驻层。

验收：确认框在任意屏之上正确弹出且关闭后回到来源屏幕；Boss 登场横幅与 `bossBanner` 标记一致。

### Phase 6 — 发布链路
微信小游戏构建、包体与远程资源策略、首屏加载、`smoke` 脚本迁移。

验收：见 §9 R2/R3 的处置结论落地；真机（或官方模拟器）跑通 Phase 1/3/4 的核心闭环。

---

## 9. 风险清单

| 编号 | 风险 | 影响 | 处置 |
| --- | --- | --- | --- |
| R1 | 纯逻辑与 Cocos 侧各留一份拷贝 | 数值/系统行为双端漂移，回归成本极高 | 已闭合。Phase 0 把 42 个纯逻辑文件进共享层 + `@game` alias；Phase 1 把战斗编排层也抽进 `game/systems/battleWorld.ts`，`src/game.ts` 与 `BattleSim` 共用同一份（`damageEnemy`/`killEnemy`/`updateProjectiles` 等在 `src/game.ts` 中已各 0 处）。两道测试守住：`tests/shared-purity.test.ts` 挡宿主依赖混入共享层，`tests/battle-fingerprint.test.ts` 挡编排行为漂移 |
| R2 | 152 张 PNG 全量入 `resources` | 包体超限、首屏变慢 | Phase 6 前保持按需镜像；分组进 bundle（战斗/皮肤/背景），背景与皮肤走远程资源 |
| R3 | 微信小游戏端资源与广告 API | 上线受阻 | `AdChannel` 已按端分流；Phase 6 用 `scripts/smoke-wechat.cjs` 的思路补 Cocos 版冒烟 |
| R4 | `Label` 每帧改文本 | 明显掉帧 | 全量走 `bindLabel`；Phase 1 加命中率打点 |
| R5 | 子局部矩形忘传 `box` | 文字飞出屏幕 | 骨架已验证该形态；`label()` 的 `box` 为唯一入口，Code Review 检查所有 `rect` 调用 |
| R6 | 视图节点挂到 `World` 而非 `Screen:<key>` | 屏幕间互相漏画 | §2.2 写成约定；Phase 1 起屏幕组件构造签名强制接收所属屏幕节点 |
| R7 | `addComponent(Sprite/Graphics/Label)` 自动附带 `UITransform` | 重复组件、尺寸设置失效 | 统一 `getComponent(UITransform) || addComponent(UITransform)` |
| R8 | 渐变/发光等 Canvas 效果直译 | 视觉回退或过度设计 Shader | 优先贴图 + `UIOpacity`；Shader 作为 Phase 6 之后的独立优化项 |
| R9 | 布局台（1817 行 dev 代码）与 Cocos 几何模型不兼容 | 失去"拖拽改表"这条已验证的高效通道 | Phase 2 单列一期，验收要求实测手柄数与字段数不低于 Web 侧（76 手柄 / 125 字段） |
| R10 | 存档跨端兼容 | 老玩家进度丢失 | 键名与结构不变（`echo-abyss-save-v1`），Phase 1 起每阶段做读旧档回归 |

---

## 10. 已确认的前提（2026-09-03 拍板）

1. **Web 版冻结为对标基准线**：迁移期间不改 `src/` 的渲染代码，只允许改纯逻辑（Phase 0 搬移）。每个 Phase 的验收都以"与 Web 截图逐屏对标"为闸门。
2. **目标端为 web-desktop + 微信小游戏**，iOS/Android 原生包暂不列入本轮。
3. **工程目录名 `cocos-prototype/`**：Phase 6 之后是否更名（例如 `cocos/`）由你定，改名会牵动 `build:cocos` / `serve:cocos` / `sync:cocos` 三条脚本。
4. **布局台在 Phase 2 重定向**（而不是先做完屏幕再回头补工具）。理由：后面 13 屏的几何调整都靠它，早一期拿到工具，后面省的是"标注→猜像素"的循环。
5. **包体与远程资源策略延后到 Phase 6**，但它是发布阻塞项，不随本轮重写关闭。
6. **逐模块重写的推进节奏**：一个 Phase 一次提交、一次截图对标、一次你的确认。需要更快时可以合并 Phase 3/4，但风险是单次对标面变宽。
