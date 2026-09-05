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
| `src/dev/` | 3 | 1817 | 布局台：模型层住在共享层 `game/dev/{labModel,labSkin,labTable}.ts`（两端共用），`src/dev/` 是工作台的唯一宿主（交互层 + 入口垫片），同时充当未迁移屏幕的参照工具 |
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

**必须遵守的两条口径**：

1. `placeRect` 只对"父节点与设计空间同心"的节点成立。子节点内的局部矩形（行内文字、按钮内文字）必须把父节点尺寸传进去，即 `placeLine(node, x, baseY, maxW, px, align, { w: parentW, h: parentH })`。漏传父尺寸的表现是子文字整体飞到屏幕外。
2. 一行文本只有 `ui/PanelKit.placeLine` 一个入口，它的 `x` 沿用 Web `ctx.textAlign` + `fillText(t, x, baseY)` 的语义 —— 随对齐表示**起笔 / 中心 / 末笔**，`maxW` 是容器内宽。锚点折成盒的那一步集中在 cc-free 的 `ui/TextBand.ts:anchorBand`，`tests/cocos-phase3.test.ts` 第 7 节按两张布局表的全网格断言每条文本带落在 `0..560`。把锚点当盒左沿用，表现就是右对齐与居中的标签整体右移半个盒宽。

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

**删改脚本后必须清 `temp/` 再构建。**命令行构建复用 `cocos-prototype/temp/programming/packer-driver/` 里的编译缓存与 import-map，而这些缓存只在编辑器进程内随 asset-db 重扫更新。在编辑器外删掉或改名一个 `.ts`（连同 `.meta`）后直接构建，日志照样报成功，产物里却仍带着旧模块——认得出来的特征是 bundle 里那个模块 id 等于被删 `.meta` 的 uuid 压缩串。做法：`rm -rf cocos-prototype/temp` 后重跑 `build:cocos`，再 grep `build/web-desktop/assets/main/index.js` 确认被删的导出名归零、保留的符号仍在。

### 7.3 运行时探针（骨架阶段的主要验证手段）
web-desktop 构建里 `cc` 是全局对象，可直接内省真实节点树：

1. `navigate_page` 打开 `http://localhost:4181/?v=N`（换 `N` 破缓存）。
2. 一次同步调用设竖屏并重建代码树：`cc.view.setFrameSize(430, 932); cc.director.loadScene('Main')`。
3. 再发一次同步调用读节点树（此时 `boot()` 的异步加载已完成）。屏幕节点不在 `Canvas` 的直接子级下——`Canvas.children` 只有 `Camera` / `Background` / `World`，四屏挂在 `/Main/Canvas/World/Screen/` 下，名为 `Screen:battle` / `Screen:menu` / `Screen:shop` / `Screen:heroes`，所以探针要从场景根递归找，别按 `Canvas.getChildByName('Screen:menu')` 取。

三条硬性注意：
- **`evaluate_script` 里不能 await**。返回 Promise 的脚本会被回收（`"Promise was collected"`）或超时。加载与探针必须拆成两次独立调用。
- **`getComponent(cc.UITransform)` 会返回 null**——全局 `cc` 上的类引用与 bundle 内部构造器不同一。取组件一律用字符串形式：`getComponent('cc.UITransform')` / `'cc.Label'` / `'cc.Sprite'` / `'cc.UIOpacity'` / `'GameShell'`。
- **引擎必须先被"看见"一次才能起来。** 内置浏览器面板处于后台时，Chromium 对该表面的 rAF 是彻底挂起而非降频：干净加载后等 25 秒，`cc.game.inited` 仍为 `false`、`cc.director.getTotalFrames()` 仍为 `0`、`getScene()` 返回 `null`；手动调 `cc.game.init()` / `cc.game.run()` 也救不回来，且重复调 `setFrameSize` 会让设计分辨率累积放大（实测 visibleSize 从 560×1214 一路涨到 1280×2774，只能重新 navigate）。所以每期验证前请人把面板打开一次；**引擎初始化之后，即使面板再次转入后台，`cc.game.step(1 / 60)` 手动推进与抓图都照常可用**。

抓图不依赖 `take_screenshot`——面板不可见时它一律报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE … visible=false`，且 `bringToFront` 无效。改由页面自己 `canvas.toDataURL('image/png')` 返回整串 base64，经 `evaluate_script` 的 `filePath` 参数落盘（返回值写进文件、不进上下文），再用 node 解码成 PNG；Web 侧 Canvas2D 与 Cocos 侧 WebGL 都适用。两端取景对齐的办法是在页面内按内容包围盒裁切再缩放到同尺寸。Web 侧的循环可以直接手动驱动（`window.game` 已暴露，`game.update(1/60); game.render()`，开局调 `game.startStage(1)` 比派发键盘事件可靠），没有引擎起不来的问题。

`setFrameSize(430,932)` 后 visibleSize 为 560×1213.77，可稳定复现竖屏；桌面窗口下看到的横向裁切是 FIXED_WIDTH 下的取景结果，不是布局缺陷。

**两端取景对齐的精确口径**：Web 侧 `window.game` 已暴露 `offX / offY / scale / logicalW / logicalH`，桌面窗口下 `logicalW × logicalH` 就是 `560 × 996`（与 Cocos 侧 `worldH()` 的钳制值同源）。所以在页面内按 `drawImage(canvas, round(offX), round(offY), round(560*scale), round(996*scale), 0, 0, …)` 裁一次，得到的图与 Cocos 侧同一设计矩形逐像素可比（实测均为 684×1217）。`evaluate_script` 的 `filePath` 落的是**返回值字符串**，多层 `JSON.stringify` 会写成双重编码，node 侧解码要按 `typeof === "string"` 再 parse 一次。

已归档的 Web 基准图在 `.probe/`（gitignored，随取随重生成）：`web-menu.png` / `shop.png` / `heroes.png` / `web-battle-crop.png`，即 Phase 1/3 逐屏对标的对照面。

**设计坐标 → 浏览器 client 点（在页面里派发合成指针事件、复现一次热区命中时的换算口径）**：UI 节点的 `worldPosition` 原点在**左下角**（全屏 `Canvas` 自身 wp = `(W/2, H/2)`，`W/H` 即 `cc.view.getVisibleSize()`），所以左上原点的模型值 `(x, y)` 对应 `world = (x, H - y)`；换 client 用 `rect = canvas.getBoundingClientRect()`：

```
clientX = rect.left + wx * (rect.width  / W)
clientY = rect.top  + (H - wy) * (rect.height / H)
```

三个坑：① 分母必须是 `visibleSize`（设计 px），不是 `getFrameSize()`，也不是 CSS 布局框——`#GameDiv` 比画布宽得多，拿容器宽算会偏出画布；② 派发合成事件要打在 **canvas 元素**上（`pointerdown/move/up` 与 `mousemove` 同发最稳），打在 `window` / `document` 上的事件不会驱动节点热区；③ 行板是居中满宽节点，改 `pad` 变的是 `UITransform.width` 而不是 `worldPosition.x`（所有行的 x 恒为 280），核对这类改动要量宽度或子节点偏移，别量行中心。

### 7.4 已通过的骨架验收
- 启动链：`loadBalance` + `loadViewTable` + `loadFrames` 并行完成 → `buildLayers()` → 读档 → `router.show("battle")`，`ready === true`。
- 背景：`Cover p0,0 s694x1214 op140` + `Dim s560x1214`，居中与压暗均对标 Web。
- 战场：`BattleView s560x996` → `Grid s560x996`，8 个轨道占位成环，金色伤害飘字落在带内。
- 菜单：`menu_row_plate` 九宫格三行 + 金色标题，`RowText p0,-2`、`BackText p0,-4` 均在父矩形内居中。
- 路由：切 `menu` 时 `Screen:battle active=false`，战场占位与 HUD 不再漏画；切回 `battle` 时完整恢复。

### 7.5 门 5：全 script 树类型检查
`npm run typecheck:cocos`（`scripts/cocos-typecheck.mjs`）把 `cocos-prototype/assets/scripts/**/*.ts` 整棵树过一遍 `tsc --noEmit`，把类型检查补到门 2 与门 3 都够不着的那半棵树上：

- **覆盖面**：根 `tsconfig.json` 的 `include` = `src` / `tests` / `cocos-prototype/assets/scripts/game`，所以门 2 那次 `tsc --noEmit`（严格档、含 DOM）只看得到共享层；`game/` 之外的那半棵树 —— `core/`、`battle/`、各屏目录、`GameShell.ts`、`ui/PanelKit.ts` —— 只有门 3 的 CLI 构建会编译它们，而编译走打包器自己的 transpile，`error TS` 计数为 0 不代表做过类型检查。漏 import 一类的引用错误就落在这条缝里，只有实机进屏才炸。
- **口径**：`-p cocos-prototype/tsconfig.json` 继承编辑器生成的 `temp/tsconfig.cocos.json`（拿到 `cc` 的 `types` 与 `db://assets/*` 映射），命令行再覆盖三项 —— `--skipLibCheck`（引擎 `.d.ts` 自身不干净，屏蔽后工程外报错归 0）、`--strictNullChecks`（把档位抬到与根配置一致；`game/data/menuSkin.ts` 那条 TS2322 是缺这个开关造成的，抬上去就消失）、`--lib es2020,dom`（补 `window` / `localStorage` 之类宿主声明）。不取整档 `--strict`：那会给 `battle/HudView.ts` 的四枚 `@property` 字段带来 `TS2564` 误报（cc 组件的字段由编辑器注入）。
- **依赖门 3**：`temp/tsconfig.cocos.json` 由编辑器或命令行构建生成，`rm -rf temp` 后要等 `build:cocos` 跑完才有。缺它时本门直接给出这句话并退出，不去猜配置。
- **判据**：只数路径落在 `cocos-prototype/assets/` 下的报错，与脚本里的 `BASELINE` 逐条对账（键 = 文件 + 错误码 + 条数）。新增、条数超出基线、基线条目已失效这三种形态都判红，所以基线不会随时间只涨不落。
- **基线 0 条**（零容忍：任何工程内报错都判红）。唯一曾在基线上的 `battle/JoystickView.ts:71` `TS2322` 已修 —— cc typings 把 `EventTouch.getID()` 标成 `number | null`，而 `stickId` 字段是 `number`，赋值处改成落回本文件既有的无杆哨兵 `e.getID() ?? -1`（与构造初值和 `touchEnd` 复位值同一个 `-1`）。改动由 `.probe/probe-joystick.js` 14 条实机断言收口：起杆 → 拖动出单位方向 → 超程钳在底盘半径（表值 56，探针现读）→ 同 id 复位，外加右半屏不起杆、第二指不抢杆、异 id 的 move/end 不改状态，以及 `getID()` 真返回 `null` 时 `stickId` 仍是 `-1` 且不产生移动输入。
- 屏层的漏 import 另有 `tests/cocos-phase5-energy.test.ts` 的 `missingImports()` 做同口径对账（拿被测文件代码体与它的 import 清单互查，并反向量已落地的 `VictoryView`）。两条互补：那几处断言钉住被扫文件的"用到了就必须 import"，本门钉住整棵树的引用可解。

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

### Phase 2 — 布局模型上移与表驱动视图（已落地）

模型层整体上移到共享层；可视化调版集中在 Web 侧工作台一处，Cocos 侧只消费表。

- `game/dev/labModel.ts` —— 字段清单/取值域/步进/钳制/手柄锚点/参考框/拾取/导出。实现自 `src/dev/labModel.ts` 原样搬来；`pickHandle()` 从工作台内联代码升为共享函数，签名多一个 `offAxisFactor`。
- `game/dev/labSkin.ts` —— 结构树 7 面板 13 层、四段不可变更新、白名单导出；新增 `resolveSkinKey / isSkinHidden / isSkinTextHidden / skinInsetsOf / skinAssetKeys` 五个只读解析口，绘制层与结构树共用。
- `game/dev/labTable.ts` —— 第二条数据通道：`viewTable.json` 的 `nineSlice`（九宫格边距）与 `menu`（主菜单表现参数）两段，加 `lab` 段默认值与草稿编解码。`resolveBorder()` 是边距公式的唯一出处，`core/ViewTable.ts:borderOf()` 改为调它。
- `src/dev/` —— 工作台宿主：交互层 + `export * from "@game/dev/…"` 的入口垫片，dev-only 入口不进生产构建。拖手柄改数值、实时预览、导出写回 `balance.json` 的 `menuLayout` / `menuSkin` 段都在这条链上完成；两端读到的是同一批函数引用（单测按引用同一性卡死）。它同时是尚未迁移屏幕的参照工具。
- `menu/MenuLayoutView.ts` —— 表驱动的主菜单视图：矩形全部来自 `menuLayoutPure()`，皮肤五段经 `snapshotMenuSkin()` 生效，贴图形态对标 `drawMenu`（九宫格 / 整图拉伸），缺图与 `hidden` 走同一条代码回退链。

Cocos 侧的排版数值就是这三条通道：`balance.json` 的 `menuLayout` 段（`applySharedBalance()` → `game/data/layoutMenu.ts`）、`menuSkin` 段（→ `game/data/menuSkin.ts`），以及 `viewTable.json` 的 `nineSlice` / `menu` 段。节点落位由 `MenuLayoutView` 每次按表算出，场景文件里不另存一份坐标；排版数值的调整入口是配置文件与 Web 侧工作台。

验收实测：手柄 76（分区标题条就绪档，996 与 1246 同数）/ 字段 125（origin 37 + deco 88）；缺标题条的降级档为 70——七个标题条相关手柄按环境退化为 `listYNoSection` + `endlessGapFlat`。`tests/cocos-lab-parity.test.ts` 24 例覆盖计数与端间引用同一性、钳制口径（编辑器钳到边界 vs 加载器回退默认）、拖动倍率与符号、`pickHandle` 的绑轴判定与近邻优先、导出→回灌→再导出逐字节相同、草稿编解码幂等、viewTable 段合并幂等且保留未知段、边距公式与钳制。`npm test` 42 套件 / 1068 用例、`npm run build`、`npm run build:cocos` 全绿；`MenuLayoutView` / `resolveBorder` 出现在 `cocos-prototype/build/web-desktop/assets/main/index.js`。

**与 Web 侧的已知分歧**：`menu_section_strip` / `crest_echo` / `menu_title_plate` / `menu_strip_plate` 按 Web 口径整图绘制；`MenuLayoutView` 只给几何与占位文案，逐行锁定/通关减淡、英雄立绘、实时货币与红点判定留待 Phase 3；`nineSlice` 的边距值只在 Cocos 侧产生实际效果（Web 侧由角深自动推导）。

### Phase 3 — 菜单 / 商店 / 英雄（已落地）
`drawMenu` `drawShop` `drawHeroes` + `ui/{menuLayout,shop,heroSelectLayout,scrollList,heroPortrait}.ts` 的矩形包与滚动容器节点化。

三屏的 Web 实测形态（`.probe/` 基准图，560×996 逻辑矩形）：主菜单 = 标题带 + 赛季行 + 三枚货币 chip + 幻影榜 + 六入口行 + 分区条 + **7 行关卡**（带 ✓ 通关减淡与"20 章·Boss / 扭蛋券×N"）+ 无限关带 + 英雄带 + 底部套组注记两行；商店 = 顶部信息带（章间商店 / 本章敌情 / 套组与推荐 / 金币 / 槽位 / 卡价随购买递增）+ 四按钮行（刷新 10 金 / 融合 / 重开 / 主页）+ **3 张卡**（贴图 + 名 + 品质 + 效果串 + 价格）+ 槽位扩容条 + 武器管理段（含空态文案）+ 进化段（含空态文案）+ 底部下一章节敌情与推荐套组两行 + "开始第 N 章"主按钮；英雄页 = 上半列表 + 下半详情区（立绘 + 技能详情 4 条：初始武器 / 三件套 / 六件套 / 赛季联动）+ 底部"不出战 / 确定出战"双带。

英雄列表的行数由赛季门控决定，不是固定 12：S1 存档"已解锁 3/12"时 `heroLayout()` 出 6 行、屏内可见 5 行（未解锁项画成灰态"S2 解锁"）。996 屏高下这一档放得下，滚动与惯性要到高屏或解锁数增长才被触发——两端仍须共用 `scrollList` 的同一批函数，只是验收不能只靠"拖一下看看"来判。

验收实测（全绿）：`npm test` 43 套件 / 1100 用例（新增 `tests/cocos-phase3.test.ts` 772 行 / 6 组 / 32 例）、`npm run build`、`npm run build:cocos` 均通过；`HeroSelectView` / `HeroSelectModel` / `MenuContentModel` / `ShopView` 及 `openHeroes` / `tickHeroScroll` / `syncHeroes` / `onHeroAction` 全部命中 `build/web-desktop/assets/main/index.js`。新增文件与目录的 `.meta` 齐备。`src/**`、共享层 `game/**`、`tests/battle-fingerprint.test.ts` 全程零改动。

三屏的落地分工：几何与文案构建放 cc-free 的 `menu/MenuContentModel.ts`、`shop/ShopModel.ts`、`heroes/HeroSelectModel.ts`（可 node 直测），节点与绘制放 `menu/MenuLayoutView.ts`、`shop/ShopView.ts`、`heroes/HeroSelectView.ts`，共用新抽的 `ui/PanelKit.ts`（九宫格底板 / 文本带 / 图标位 / 行数裁剪）。`GameShell` 只保留装配与热区→玩法的分发：`buildShopScreen` / `openShop` / `closeShop` / `onShopAction` 与 `openHeroes` / `syncHeroes` / `onHeroAction` / `tickHeroScroll`，`heroes` 与 `shop` 并入 `buildScreens` 的 per-screen refresh 表，惯性由 `update(dt)` 在路由闸门前驱动。章间商店从"直接开下一章"改为真弹商店、买完再续下一章。滚动数学全部调 `game/ui/scrollList.ts` 的 `dragScrollFrom` / `flickOf` / `inertiaNext` / `SCROLL_TAP_SLOP`，出战只经 `applyHeroSelection`。

真机文本带复测（`430×766` 取景 → 设计 `560×998`，参照系 = `Canvas.getBoundingBoxToWorld()`，逐屏 `cc.game.step` 后遍历 `activeInHierarchy` 的 `cc.Label`）：战斗 13 / 主菜单 40 / 商店 47 / 英雄 32 枚活动标签的包围盒全部落在 560 宽内。落位口径按 §3 收敛到 `placeLine` 之后，商店屏原越界的 9 条（顶栏金币与槽位止于 546、卡价提示 546、分区右注 536、卡三居中三行 538、槽位条与进化空态 538、开始下一章 538）与英雄页详情副行 532 一并归位；英雄页行内立绘首字与名字起笔的间距从重叠 1px 变为 27px（首字带 39..61，名字起笔 88），行徽标回到徽章圆心。node 侧由 `tests/cocos-phase3.test.ts` 第 7 节（4 例，全表 36 例）按两张布局表的全网格兜住同类回归。

**尚未在本期闭环的验收项**：三屏与 `.probe/` 基准图的逐像素对标；1246 档的底锚与 restZone 取景；拖拽与甩动的手感、`Mask` 边缘裁切、单指 `touchId` 与触屏/微信滑动手势是否互斥；立绘入表后晚到贴图的换上时机。

**与 Web 的已知分歧**（均为有意）：英雄立绘 Web 是 `drawHeroPortrait` 程序化动画（呼吸 + 未解锁灰剪影），`hero_*` 不在 `ASSET_MANIFEST`，Cocos 侧退化为"主色方块 + 名字首字"、无动画；「不出战」在 Web 即刻落盘回菜单，这里先落预览位、由「确定」一次性写入，误触可撤销；未解锁行的徽标底色用 `hexA(textMuted,0.16)`，Web 是 `rgba(255,255,255,0.05)`；面板底走 `panel_dark_corners` 九宫格（Web 由 `panelPad` 自绘）；滚动多一条 `snap()` 回弹路径，终态与 Web 松手硬钳一致；三屏的底色/行色/滚动条已表化到 `viewTable` 的 `phase3.*`，默认值与 Web 逐档相同，改表只影响 Cocos 端。

### Phase 4 — 成长系统屏
`drawGacha` `drawPass` `drawDaily` `drawSeason` `drawLeaderboard` `drawGearUp` `drawPrestige` `drawFusion` `drawCommission(+Panel)`。含 `data/gacha.ts` 的 `drawGacha`/`drawGacha10` 贴图优先通道。

**九屏共同事实（2026-09-03 实测，源 `src/game.ts` + 共享层）**：均为暂停态；`watchAd` 置 `adBusy`，期间 `update` 早退、点击全吞；行高一律走共享 `theme.spreadRows` / `rowTextY`，面板底走 `panelPad` 九宫贴图；**九屏都没有共享层纯布局函数**（`game/ui/menuLayout.ts` 只管菜单侧入口钮），其中五屏在 `game.ts` 内已有"单一出口私有 layout 方法"（draw 与 click 同源，搬迁即可）：`gachaLayout` `dailyLayout` `prestigeLayout` `fusionLayout` `commissionLayout`；pass / season / leaderboard / gearup 的矩形内联在 `draw*` 里，需先抽成 cc-free 纯函数。九屏均无 Canvas 渐变（唯一 `createLinearGradient` 在 HUD dock）、无滚动惯性，`ui/scrollList.ts` 本期用不上。

**Cocos 侧接线点**：`GameShell.PENDING_SCREEN` 已随第八屏（词缀融合）落地**整表删除**（占位轻提示 0 条 —— 删完那张表就空了，商店工具钮的 `fusion` 分支换成真实 `openFusion()`，不再留 `toast(PENDING_SCREEN[x])` 那类 `undefined` 路径）；已落地屏逐屏换成真实 `router.show(...)`。**Phase 4 九屏现已全部落地。** `core/ScreenRouter.ts` 的 `SCREEN_KEYS` 为 16 态全量，路由实际注册 battle / menu / shop / heroes / leaderboard / daily / pass / gearup / gacha / prestige / commission / fusion / season 十三屏。`drawAvatarFrame` 住在 Web 侧 `src/ui/skin.ts`（Canvas2D），不在共享层 —— 排行屏的关卡框徽标按 Phase 3 立绘同款处置：贴图优先、缺图回退代码形状。

**逐屏形态（数量一律写"由什么门控"，不钉死数字）**：

| 屏 | 入口 | 返回 | 结构与门控变量 | 超屏 | 广告 | 写入面 | 时序/动效 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 排行 leaderboard | 仅菜单幻影榜钮 | → menu；无 Esc 分支 | 幽灵行数 = `PHANTOM_COUNT`，玩家行按 `rankAmong` 插位（未入榜则列末尾）；`save.frames` 非空时玩家行加框徽标 | 否 | 无 | **零写入**（纯只读） | 无 |
| 每日 daily | 菜单钮 / 键 b | Esc 或钮 → menu | 恒三组：宝箱（`DAILY_BOXES`）+ 每日天赋（`save.dailyTalents`，每日从 6 池 roll 3）+ 补领行；态由 `dailyBoxClaimed`/`dailyTalentClaimed`/`makeUpDate`/`dailyClearedDate==today` 门控 | 否 | 最密：宝箱全广告、天赋首次免费余广告、补领广告 | 领取产出 + `daily*` 标记 + `points`/`dayEcho`/`adWatchCount` | 跨天 `checkDailyReset` 清零 |
| 通行证 pass | 菜单钮 / 键 p | → menu；无 Esc 分支 | 档位数 = `PASS_TIERS` 常量；行态由 `save.passTier`（已领）与进度 `points + dayEcho + 星数×2` 门控；贴底总进度条 | 否 | 未激活时看广告 → `premiumPassSeason = seasonId`（赛季翻页后失效） | `passTier` + 产出 | 无；**命中语义特殊：任意行点击 = 顺序领第 `passTier` 档，行 rect 未参与命中** |
| 升级 gearup | 菜单钮 / 键 u | Esc 或钮 → menu | 行数 = `min(save.ownedGear.length, 14)`，超出**硬截断**并提示"仅显示前 14 件"，无滚动；每行 5 星徽（`GEAR_UPGRADE_MAX`）+ 升级钮（`gearUpgradeCost(lv)`，`lv = save.gearLevels[name]`） | 否 | 无 | `stardust`(-) / `gearLevels` | 无；行文本靠 `measureText` 截断（230/320px），Cocos 侧要换成 Label 溢出策略 |
| 扭蛋 gacha | 菜单钮 / 键 g（`openGacha` 清空结果） | → menu；不用 `overlayFrom` | 固定段：抽卡钮 + 钻石换券行 + 双保底条 + 最近抽取（存 8 显 ≤5）+ 收藏列表 n = `save.ownedGear.length`；`rowsTop` 随最近结果数 0–5 下移 | **唯一溢出风险屏**：收藏列表无滚动无截断，条数增长即溢出底边（首个越界件数已按 `spreadRows` 实测，见下方四格矩阵） | 每日 1 次广告免费抽（`dailyGachaAdUsed`） | `gachaTicket`/`gachaPity*`/`ownedGear`/`stardust`/`selectedGearId`/`diamond`/`collection` | 无抽卡动画，结果即时入列表 |
| prestige | 菜单天赋钮 / 键 t / 结算屏天赋钮 | **无返回钮、无 Esc**，唯一出口"开始新轮回" → `startNewRun` | 三系页签 + 当前路线恒 10 节点；条件块自底向上叠（`owns(targeted_search)` → 触发器钮组、`owns(blueprint)` → 效果钮组），列表被压缩；可购由派生 `availablePoints`（= points − Σ已购 cost）与 tier 门控 | 否 | 无 | `ownedTalents`（points 不扣减）；`runConfig` 两项仅会话不落盘 | 无 |
| 委托 commission | 菜单钮 / 键 c（`openCommission("menu")`） | Esc 或钮 → `overlayFrom` | **双形态互斥**：进行中槽 > 0 时只画 1–2 个面板（第二槽需 `double_commission` 天赋，`panelH` 恒定）并 return；否则画区域行（`REGIONS`，锁定由 prestiges/天赋门控）+ 难度钮（`DIFFICULTIES`）+ 开始钮 + 碎片兑换钮（`fragments ≥ 10` 才画） | 否 | 无 | `commission`/`commission2`/`fragments` + 按区域产出 | **实时时序**：`Date.now` 累计、时数文本每帧变、前段满额进度条、上限封顶（`eternal_factory` 解除）→ Cocos 侧需周期刷新文本与进度 |
| 融合 fusion | **仅商店右上工具钮**（装备 ≥ 2），`openFusion("shop")` → `overlayFrom = "shop"` | Esc（无 `pendingHidden` 时）或钮 → `overlayFrom`，实际恒回 shop | 行数 = `player.equipment.length`（槽上限随 `slot1/2` + `extra_gear` 增长，局内态非存档）；底部面板三形态：未选提示 / 双选预览 / 三选且 `tripleUnlocked`（天赋 ≥ 6）三重面板 | 否 | 无 | `stardust`(-cost)/`fusionPity`/`collection`；成品入 `player.equipment`（不落盘） | 无动画；保底 `HIDDEN_PITY_N` 触发 `drawHiddenChoice` 弹层（Esc 被禁、只响应卡片）—— 该弹层与 `drawTriplePanel` 都是融合屏自身的绘制件，随本屏一起落地（见下落地段） |
| 赛季 season | **无手动入口**：`syncSeason`（任意状态跑）检出 `seasonStartAt` 满周期 → 写 `seasonSummary`，仅当 `state == "menu"` 时自动弹 | Esc 或钮 → `closeSeason` → menu | **无面板**：全屏暗底 + 徽标 + 横幅 + 标题 + 四行摘要（由 `seasonSummary` 是否为空整支门控）+ 一枚贴底钮；数值取翻页瞬间的 `seasonScore(stageStars, seasonBest)` | 否 | 无 | 写入发生在**进屏前**：`stardust`+ / `seasonId`+1 / `seasonStartAt` 顺延 / `stageStars` 清零 / `seasonBest = 0` | 无 |

**验收**：每屏一张对标截图（`.probe/web-p4-*.png` 为 Web 基准，684×1217 同口径）+ 一次完整交互闭环（进入 → 操作 → 返回，`overlayFrom` 语义正确）；广告位 `adBusy` 期间世界不推进。逐屏的结构断言按上表的门控变量分档写（例：排行屏行数 = `PHANTOM_COUNT + 1` 且玩家行插位等于 `rankAmong`；升级屏行数 = `min(ownedGear, 14)` 且超出时出现截断提示），不写死数字。几何抽出的纯布局函数须与 `draw*`/`hit*` 同源，并按 Phase 3 的口径断言每条文本带落在 `0..560`。

**派单顺序（一屏一单，子 agent 150 turn 上限扛不住多屏）**：排行 → 每日 → 通行证 → 升级 → 扭蛋 → prestige → 委托 → 融合 → 赛季。理由是先用只读零写入的排行屏把"抽纯布局 + Cocos 视图 + 路由增键 + 热区分发 + 测试"这条链跑通，再依次引入广告与写入、文字测量截断、溢出风险、条件块压缩、实时时序、跨屏 `overlayFrom`，最后做没有手动入口、需要构造触发条件的赛季屏。

**已落地两屏与 Web 的已知分歧**（均为有意）：排行屏的关卡框徽标按 Phase 3 立绘同款处置（`avatar_<品质>` 贴图优先，缺图回退代码金圈 + 框心数字）。每日屏要用的五个贴图键（`banner_title_gold_c` 标题横幅、`player_pose_2` 装饰立绘、`badge_gem_purple` 资源行图标、`btn_minor` 行底板、`btn_primary` 补领底板）在 `ASSET_MANIFEST` 与 `resources/textures/` 里都在，一律贴图优先，三条缺图回退分支与 Web 同语义（横幅缺图 → 标题从"横幅内居中、基线 36−4"切到 `themePaint.header` 那一档"左起笔于 pad、基线 36"；图标缺图 → 文本从 `pad+13+4` 回到 `pad` 并前置「◆」；行底板缺图 → `rgba(255,255,255,0.05)` 底 + `rgba(255,255,255,0.15)` 描边）。两处照抄 Web 而非照抄排行屏：每日屏的返回钮是纯色 rect（`#2a3d55` + `rgba(255,255,255,0.3)`）而不是 `skinButtonBase`，所以不挂贴图；已领行恒走代码形状，因为 Web 的 `claimed || skinButtonBase(…)` 把贴图分支短路掉了，Cocos 侧给 `Plate` 传空键得到同一结果。三处口径差：Web `skinButtonBase` 的圆角实参（普通行 8 / 补领行 10）在 Cocos 侧没有消费者，九宫格边距走 `nineSlice.keys`（`btn_minor`/`btn_primary` 均为 71），与 Phase 2 已记的"边距值只在 Cocos 侧产生实际效果"同类，原值作为档位差留在共享布局的 `DL_ROW_PLATE` / `DL_MAKEUP_PLATE` 里供断言与取键；每日屏的几何常量（`listTop 92`、`labelH 24`、行高钳制 46–92、两行文本的 18px 固定行距、两种底板档位）住在共享层 `game/ui/dailyLayout.ts` 的具名常量里而不进 `viewTable` 的 `phase4` 段 —— 共享层读不到 import 了 `cc` 的 `core/ViewTable.ts`，同一个数放两边就成了两个事实源，`phase4` 段收的是纯表现项（键前缀 `dl`：覆盖底、两组区标签色、未领与已领三档的底/描边/文字色、补领两档、返回钮三色、资源行替代字形），默认值逐项对标 Web；Web 的 `fillText` 不限宽，Cocos 侧每段文本带都给了 `maxW`（名字与描述收到右对齐状态起笔前 10px，缺图档标题收到返回钮前 10px），超宽由 `fitOne` 截断补「…」，与排行屏同款。

**已落地两屏的宿主接线差异**（不是画面分歧）：激励视频收敛成 `GameShell.watchAd(onOk, onFail?)` 一个入口，语义逐项对标 Web `game.ts:watchAd` —— 在途期间不接受第二次点击，看完先记一次 `adWatchCount` 并在 `DIAMOND_AD_DAILY` 之内发 `DIAMOND_PER_AD` 钻石、落一次盘，再调 `onOk` 发本屏奖励，平台分流仍在 `core/AdChannel.showRewardedAd`。Phase 3 的回响筹码原先自己走一遍 `showRewardedAd` 且不回写 `adWatchCount`，现在改为调这一入口，于是点回响筹码也会让每日屏的"今日广告 N 次"+1 并在上限内 +1 钻。每日重置原先只随 `BattleSim.update()` 跑，而壳层在非战斗屏整帧早退（`router.blocksPlay()`），停在菜单或每日屏跨天就永远不清零、本屏会一直显示"已领取"；现在 `BattleSim.syncDaily()` 被提到路由闸门之前逐帧调，与 Web `update()` 里"任何状态下都执行"同口径，真的改了存档时顺带重排每日屏与主菜单的每日红点。**广告闸门的口径（2026-09-05 定）**：闸门只有 `watchAd` 首行那一道 `if (this.adPending) return;`，与 Web `watchAd` 首行的 `adBusy` 同位同义 —— 广告在途时**同步领取照常执行**，被挡的只有"第二次看广告"。各屏 action 开头一律不加这道闸：一方面每日免费天赋（`dailyTalentClaimed`）、补领（`dailyClearedDate` / `makeUpDate`）、通行证档位（`passTier`）这些领取本身已按存档状态幂等，屏级闸门并没有买到防重复发奖；另一方面它会让广告在途期间的整屏点击失效，与冻结基准分歧，并且外溢到装备升级 / 扭蛋 / 转生 / 委托四个**根本没有广告位**的屏（它们的点击会被别的屏发起的广告吞掉）。六个屏级 action 的这道早退已一并去掉，`tests/cocos-phase4-gacha.test.ts` 里加了反向守卫（action 段不含 `adPending`、全文件 `if (this.adPending) return;` 计数恒为 1）。**尚未验完**：构建包实机复核这条口径时 `.probe/probe-gacha.js` 在第 52 行就抛 `Cannot read properties of undefined (reading 'x')`，崩点在该探针第六节（广告段）之前、与本项改动无关，属既有探针腐化，故新口径目前只有单测与源码守卫覆盖。

**待界面翻新统一处理的画面偏差（本轮不修）**：每日屏七行的行底板装饰翼与行内文字存在可读性差 —— 名字下方那行描述（如 `扭蛋券 ×2 + 星尘 ×10`）与右对齐状态文字（`▶ 广告开启` / `免费领取`）会被本行贴图的左右装饰翼压住，读起来比基准吃力。布局侧已用实测排除：`plateBoxH` 与 `rowH` 同为 92、底板矩形就是行矩形、行间隔 20，上一行描述基线 y814 与本行底板顶缘 y770 之间净空 44，**没有跨行压字**；文本基线与 Web 共用同一份 `dailyLayout`，两侧同数。差异落在**九宫格 `slice` 的渲染口径**：Cocos 按 `nineSlice.keys` 的边距（`btn_minor` / `btn_primary` 均 71）切图，装饰翼保留接近贴图原始的比例；Web `skinButtonBase` 画进同一个行矩形时翼更收敛。整界面翻新会重出这批行皮肤与边距，届时一并处理。复核入口：同尺度对标图 `.probe/cocos-p4-daily-684.png` 对 `.probe/web-p4-daily.png`（都是 684 宽、设计 560×996），探针判据是逐行取 `getComponent('cc.UITransform').getBoundingBoxToWorld()` 的盒高与 `rowH` 对比。构建包侧的运行时账（26 枚标签全 active、`minLeft 14 / maxRight 536` 无越界、三种领取的存档增量与 `localStorage['echo-abyss-save-v1']` 落盘）已逐项实测通过。

**本期尚未核实、动到该屏前要先测的**：装备槽上限中 `extra_gear → runSlotBonus` 的注入路径。

**同段挂账的第二条（装备升级屏，构建包实测）**：`panel_gearup` 这幅面板在 Cocos 侧的装饰比 Web 重 —— 顶部中置徽记与横带向下伸进头部区，压住副标题行 `收藏装备 · 永久基础数值(每级 +25% 贡献,上限 5 级)` 的中段；底部祭坛与两侧火盆链饰按接近原图的比例完整画出，而 Web 里同一张图在底部只剩右下角一小片。布局侧已用实测排除：14 件满载时末行底边 914 ≤ `h − pad = 982`、`rowH 56` 与行步进 60 都与 Web 同式、46 枚可见 Label 无一越出画布（`minLeft 14 / maxRight 546` 对称，纵向 83…978 落在 0…996 内），所以不是矩形或行高算错。差异与每日屏同源，落在**九宫格切边口径**：Web `panelPad` 用的是实参 32，Cocos 侧 `Sprite` 的 SLICED 切边取自 `nineSlice` 表，对这张 684×1083 的图两边取到的边距不同；本屏 `GU_PANEL_NINE = 32` 已进共享层但**该值在 Cocos 侧没有消费者**（与每日屏"圆角实参无消费者"同类），`panel_gearup` 的实际切边值本轮未钉死。整界面翻新重出面板皮肤时一并处理。复核入口：`.probe/cocos-p4-gearup-empty-560.png`（560×996，与游戏画布 1:1）对 `.probe/web-p4-gearup.png`（684×1217，同为设计 560×996 的放大截图，长宽比一致），满载 14 行的形态见 `.probe/cocos-p4-gearup-full14.png`。一条采集环境事实：构建产物 `index.html` 第 24 行带一个 `<h1 class="header">empty</h1>`，画布实际从 y≈85 起，截图前要先剥掉这层 DOM 外壳才能拿到 1:1 画面。

**每日屏这一单已核实掉的三条**：① `rollDailyTalents` 住在共享层 `game/data/daily.ts`，除 `Math.random` 之外是纯函数，`count` 与 `pool` 都是可注入的默认参数，返回条数不可能超过池子大小（池 6 条、默认取 `DAILY_TALENT_COUNT = 3`）。② `balance.json` 的 `energy` / `economy` 两段确实覆盖 `daily.ts` 的 `applyBalance`，当前值（`diamondPerAd 1` / `diamondAdDaily 10` / `max 20` / `regenSeconds 360` 等）与代码默认逐项相同；但 `DAILY_BOXES` 与 `DAILY_TALENT_COUNT` / `DAILY_TALENT_FREE` 不在表里，仍是代码常量。③ 按 `dailyLayout` 实测（非推算）：常规三档天赋条数（0 / 1 / 3）在 996 与 1246 两档屏高下补领行底边都是 916 或更靠上，稳稳落在 `h − pad` 之内；天赋条数长到 6（只能来自手改存档 —— `normalizeSave` 不钳 `dailyTalents` 长度）时行数变 10，996 档 `rowH` 收到 78、`gap` 收到 6、底边 974 仍在线内，1246 档 `rowH` 保持 92、`gap` 19、底边 1243 越过 `h − pad = 1232` 恰好 11px。这是 Web `dailyLayout` 同式的既有性质（行区预算按 `spreadRows` 摊，但标签带与补领让位是预算外追加的），两端一致，不修。

**升级屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/gearUpLayout.ts`（单一出口，按 `ownedGear.length` 现算行数），内容与写入意图在 cc-free 的 `gearup/GearUpModel.ts`，`GameShell` 的 `commitGearUpClaim` 是唯一的存档写入方（扣 `stardust`、写 `gearLevels[装备名]`、落一次盘），本屏没有广告位。五条 Web 口径按本屏原样带上：① 命中只比每行的升级钮矩形，行矩形（品质框）只用于绘制，点行内非按钮区与屏内空白都不产动作；② 满级与星尘不足仍返回动作，静默发生在扣费前的守卫里；③ 等级按装备名索引，同名不同品质的两件共用一格等级；④ 行步进是 `rowH + 4` 的硬编码，`spreadRows` 第五实参之外不再传 `maxGap`，其返回的 `gap` 被丢弃；⑤ 副标题里的 `+25%` 与 `5 级`、徽记颗数与 `gearLevels` 的插值都写成由 `GEAR_UPGRADE_STEP` / `GEAR_UPGRADE_MAX` 推出的形式，测试同时锁住 `STEP === 0.25`、`MAX === 5` 与逐字串相符。三处与已落地三屏不同的底板事实：面板贴图键是 `panel_gearup`（回落 `panel_dark_corners`）、标题是纯文字没有横幅、行底板走 `drawQualityFrame` 的 Cocos 等价物 `ui/PanelKit.qualityBox`（圆角 4、描边 1.5、内缩 2.5 的内发光 1、无顶栏，与 Web 实参同数）。返回钮描边取 `rgba(255,255,255,0.15)`：Web 那一笔 `strokeRect` 沿用了列表里禁档按钮留下的 `strokeStyle` 与 `lineWidth`，与 daily / pass 的 0.3 档不同，`phase4.guBackStroke` 单独一键。一处按绘制顺序复现的覆盖：右上星尘（基线 36、右末笔 `w − pad`）落在返回钮矩形 `(w − pad − backW, 22, backW, backH)` 之内，Web 先画星尘后画按钮，于是这串数字被按钮盖住 —— `GearUpView` 用同一节点顺序复现，几何与视图都不做平移，翻新阶段若要露出读数需要动 Web 基准（届时先改 `src/game.ts` 再同步）。表现项进 `phase4` 段的 `gu*` 共 20 键（覆盖底、头部三线色、空态与描述、按钮两档文字与两档底板、徽记两档色加替代字形「★」加未点亮 opacity 56、截断提示、返回钮三色），默认值逐项对标 Web；几何常量留在共享层。

**扭蛋屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/gachaLayout.ts`（单一出口 `gachaScreenLayout`，收 `ownedGear` 的 id 列表与瞬时最近结果条数两个入参，本层不读存档），内容与写入意图在 cc-free 的 `gacha/GachaModel.ts`，抽取本身复用共享层 `game/data/gacha.ts` 的 `drawGacha` / `drawGacha10`（模型带着一次性拷贝的 pity 调它，把 `newGear` / `stardustGain` / 保底目标值 / 新的瞬时结果列表作为写入意图交回）；`GameShell` 的 `commitGachaClaim` 是唯一的存档写入方，广告抽走唯一入口 `watchAd`。接线点计数：`PENDING_SCREEN` 由四条降到三条（`commission` / `talent` / `fusion`），路由实际注册九屏（battle / menu / shop / heroes / leaderboard / daily / pass / gearup / gacha），`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 仍是 16 态全量，本屏的 refresh 钩子接 `syncGacha`，菜单入口 `gacha` 从占位轻提示换成 `openGacha`。`openGacha` 先把宿主持有的瞬时态 `this.gachaResults` 清空再切屏（与 Web `openGacha` 同序，该字段不入档）；`update()` 里每日重置真的改了存档时本屏也重排一次，因为广告免费抽的可用态读 `dailyGachaAdUsed`，而重置把它清零 —— Web 逐帧重绘自然跟上，节点化后必须显式 sync。十条口径里本屏特有的部分：① 收藏行**以 `id` 为键**，绘制与命中都回 `ownedGear` 里 `find`（id 重复时永远命中第一条，两行内容同字、都算选中；`find` 落空那一行内容是 null 对应 Web 的 `continue`，但它仍是热区）；② 行区**既不截断也不滚动**，`rows` 长度恒等于 `ownedGear.length`；③ 行距步进用 `spreadRows` 返回的 `gap`（与 gearup 丢弃 `gap` 硬编码 4 正相反），仍是五个实参、`maxGap` 走默认 20；④ 保底标签与进度比分母在 Web 绘制侧是字面量 `10` / `50`，照抄后由测试三重锁住（`EPIC_PITY === 10`、`LEGENDARY_PITY === 50`、逐字串等于由该常量插值出来的同一串）；⑤ pity 是先拷 `{ pityEpic, pityLegendary }` 进局部对象、调 `drawGacha*` 再把两值交回宿主写档，模型从不写传入的存档（`deepFreeze` 守）；⑥ 命中七段依次为返回 → 单抽 → 十连 → 广告抽 → 钻石换券 → 逐行切换带入，热区之外没有"其余一律"兜底；⑦ 券不足 / 广告已用 / 钻石不足都照样返回动作，静默发生在 `gachaClaim` 的扣费前守卫里；⑧ 一次广告抽落两次盘（抽取落账一次、置上 `dailyGachaAdUsed` 后再一次），`watchAd` 自身为 `adWatchCount` 与钻石那笔另落一次，三处与 Web 同数、不做合并；⑨ 底板事实：面板 `panelPad(g, w, h)` 不传专属键（就是 `panel_dark_corners` 九宫 32）、遮罩 `rgba(8,10,16,0.86)`、标题 `banner_large_purple` 加显式 240×46（与 daily 同参数、与 gearup 的纯文字不同）、券数 `icon_ticket` 缺图退「✦」、单抽 `btn_minor` 与十连及广告钮 `btn_primary`（禁档传空键强制走代码底，Web 的 `can && skinButtonBase(...)` 短路掉了贴图分支）、换券条与收藏行全是纯代码矩形、保底条 `bar_progress_blue_b` 缺图退"轨道 `rgba(255,255,255,0.12)` + 史诗 `#c8b6ff` / 传奇 `#ffd76a` 填充"；⑩ 对齐口径：三枚钮与换券条居中并用 `rowTextY`，`重复→星尘+N` 与 `带入中` 右对齐（Web 画完立刻切回 left），行内名字在 `x+8`、`Lv.` 段在 `x+150` 是固定偏移而非右对齐。四条本屏才出现的 Web 原样性质：`nRes = 0` 那一支照样让出一整行 `resLineH`，所以 0 条与 1 条同高，`rowsTop` 只在 354 与 434 两档取值；两条保底条纵向互相压 2px（史诗条 244..250、传奇条 248..254），传奇标签基线 254 与传奇条底缘同高 —— 两处只在纵向上叠，横向不碰（标签列占 `pad..pad+100`，条从 `pad+110` 起），视图按 Web 的绘制顺序建节点复现该覆盖；`[...results, ...旧].slice(0, 8)` 会把一发十连的第 9、10 抽挤出展示窗口，而入账看的是全 10 抽；`drawGacha10` 的查重只看抽之前的收藏，新装备在整抽结束后才 push，所以一发十连里同名的两件都算"不重复"、都进收藏。收藏加成串走 `collectionBonus(ownedGear)` 的**单实参**口径（不传 `gearLevels`，于是这一串不反映装备升级后的贡献），两个百分数不经 `toFixed`，原样是浮点拼接。表现项进 `phase4` 段的 `gc*` 共 39 键（覆盖底、标题横幅文字、券数文字与替代字形、返回钮三色、三枚钮各自的启用底/描边/文字色、共用禁档底与两档禁档描边、换券条三色、保底标签与轨道与两档填充与贴图暗罩、最近抽取标签与重复串色、收藏标签与加成与空态、收藏行两档底与描边加两档文字色），默认值逐项对标 Web；几何常量留在共享层。`GC_PANEL_NINE = 32` 与升级屏的 `GU_PANEL_NINE` 同性质：九宫切深在 Cocos 侧由 `ViewTable.borderOf` 按图推导，该常量没有消费者，进共享层只是把 Web 的实参留在几何旁边供断言与翻新取用。

**扭蛋屏的行区溢出：四格矩阵实测值**（`h ∈ {996, 1246} × nRes ∈ {0, 5}`，行区预算 `[rowsTop, h − pad]`，`rowH` 钳在 40..64、`gap` 上限 20；数字由 `game/ui/theme.ts:spreadRows` 真实实现算出并由 `tests/cocos-phase4-gacha.test.ts` 实测钉死，每格同时与 `spreadRows` 直算值对照）：

| 屏高 × 最近结果条数 | rowsTop | 预算 | 最后一个不越界的件数 n（rowH / gap / 末行底边） | 首个越界的件数 n（rowH / gap / 末行底边 / 越界量） |
| --- | --- | --- | --- | --- |
| 996 × 0 条 | 354 | 628 | 14（40 / 5 / 979，余 3） | **15**（40 / 4 / 1010，**+28**） |
| 996 × 5 条 | 434 | 548 | 12（40 / 6 / 980，余 2） | **13**（40 / 4 / 1002，**+20**） |
| 1246 × 0 条 | 354 | 878 | 20（40 / 4 / 1230，余 2） | **21**（40 / 4 / 1274，**+42**） |
| 1246 × 5 条 | 434 | 798 | 18（40 / 4 / 1222，余 10） | **19**（40 / 4 / 1266，**+34**） |

越界之后是线性放大的：`rowH` 与 `gap` 的两个下限（40 与 4）同时兜住后，每多一件末行底边就多 44px（20 件在 996 档越出 248px）。这是 Web `gachaLayout` 同式的既有性质，两端一致，本屏照画所有行、不裁不缩，溢出的那一档留给界面翻新统一处理（收藏列表加滚动或改硬截断都要先动 `src/game.ts`）。

**扭蛋屏这一单核实掉的三条**：① `recordEquipment(eq)` 在 Cocos 侧**已有对应物** —— `BattleSim.recordEquipment` 写 `save.collection` 的 `triggers` / `effects` / `modifiers` 三列词缀名，与 Web `game.ts:1819` 同式，并且已经由 `BattleWorld.recordEquipment(eq)` → `inputs.recordEquipmentSeen` 这条口对外暴露（通关掉落与章间商店都走它）。前四屏没有处理过它，因为那四屏都不产新装备；本屏逐件接上：宿主 `commitGachaClaim` 在 `save.ownedGear.push(eq)` 之后调 `this.sim?.world.recordEquipment(eq)`。② `dailyGachaAdUsed` 由每日重置清零，两端各只有那一处：Web `src/game.ts:1066`，Cocos `BattleSim.checkDailyReset`（壳层在路由闸门之前逐帧调 `syncDaily()`，所以停在扭蛋屏跨天也会照常清零）。本屏不需要任何额外清零代码，只需要在被重置后重排一次画面 —— 已接进 `update()`。③ 四支常量的实际值与覆盖通道：`GACHA_COST = 1` 与 `GACHA_10_COST = 10` 是共享层 `gacha.ts` 的 `let`，由 `applyBalance(gacha)` 读 `balance.json` 的 `gacha.cost` / `cost10` 覆盖，当前表值同为 1 与 10；`DIAMOND_TICKET_COST = 2` 住在 `daily.ts`，由 `applyBalance({ energy, economy })` 读 `economy.diamondTicketCost` 覆盖，**表里确实有这一项且值同为 2**；`GACHA_EQUIPMENT_BASE_LEVEL = 5` 是 `quality.ts` 的 `export const`，`applyBalance` 的七段（`energy` / `economy` / `battle` / `waves` / `chapterTypes` / `gacha` / `menuSkin`）都不读它，因此没有任何表通道。同一支 `quality.ts` 里的 `GACHA_EPIC_PITY = 10` / `GACHA_LEGENDARY_PITY = 50` 才是保底逻辑的真值，经 `gacha.epicPity` / `legendaryPity` 可覆盖，当前表值同为 10 与 50 —— 与本屏绘制侧的字面量同数。

**转生与天赋屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/prestigeLayout.ts`（单一出口 `prestigeScreenLayout(w, h, routeIds, hasBlueprint, hasTargetedSearch)` —— 行区预算底缘随**当前系的 id 序列**与**两个条件块在不在**现算，故与每日 / 扭蛋屏一样由宿主投影出存档切片再调共享层出口），内容与写入意图在 cc-free 的 `prestige/PrestigeModel.ts`，`GameShell` 的 `commitPrestigeClaim` 是唯一的存档写入方。**本屏没有广告位，也没有返回钮**。接线点计数：`PENDING_SCREEN` 由三条降到两条（`commission` / `fusion`），路由实际注册十屏，`SCREEN_KEYS` 仍是 16 态全量，refresh 钩子接 `syncPrestige`，菜单入口 `talent` 从占位轻提示换成 `openPrestige`。屏内两份瞬时态 `this.talentRoute` 与 `this.runConfig` 都由宿主持有且**不入档**，与 Web 的 `private talentRoute` / `private runConfig` 同形（`SaveData` 里没有这两项）。可支配点数走本轮新增的 `core/SaveModel.ts:availablePoints`，与 Web `src/systems/save.ts:263` 逐字同式（`points − Σ 已拥有天赋的 cost`），单价一律经共享层 `talentOf` 取，本层不复制定价表；形参收最小结构切片，于是 `SaveModel` 与各屏模型的窄切片都能直接喂进去。六条本屏特有的口径：① 买天赋入档**不扣 `points`** —— 可支配是派生量，入账只 `ownedTalents.push(id)`，随后调 `world.applyTalentBonuses()`（与 Web `buyTalent` 同序）再落一次盘；② `affordable` 是三个条件的合取 `!owned && avail >= cost && isTierUnlocked(ownedTalents, tier, currentRoute)`，与 Web `game.ts:4271` 逐字同式、缺一不可，它**只决定右列取哪个色档、不参与命中** —— 已拥有与买不起的行照样返回 `buy` 动作，静默发生在 `prestigeClaim` 的守卫里（与 Web `buyTalent` 开头三道 `return` 同分层）；③ 买入守卫查的是 `isTierUnlocked(ownedTalents, node.tier, routeOf(id))`，即该 id **自己所属**的路线，而绘制侧的 `affordable` 查的是**当前页签**那一系 —— 两端只在"当前页签就是该行所属系"时同值，本屏的行恒取自当前系故正常路径下重合，守卫仍照 Web 用 `routeOf(id)` 不改成当前系；④ 「开始新轮回」就是 `restartRun()`，**屏层不给这个钮任何写入意图**：`prestiges` 计的是死亡结算次数（Web 的 `+1` 只在 `settleRun`，`src/game.ts:1814`），这笔账由 `restartRun` 首行的 `settlePendingRun()` 统一结（与 Web `restart()` 同位，守门是 `if (!pendingSettle) return`，`src/game.ts:1186`）—— 从主菜单「天赋」入口进本屏时挂起标记是假的，所以点这个钮不会使 `prestiges + 1`；只有带着未结算的死亡局进本屏时才会结一次，那正是 Web 在进屏那一步（`hitTalentsBtn`）结掉的同一笔；⑤ 两个条件块各吃 46px 行区预算，效果块（`blueprint`）先让位、触发器块（`targeted_search`）后让位，于是效果钮那一排恒在触发器钮**下面**（996 档两块都在：触发器钮 y 846、效果钮 y 892），8 枚效果钮 gap 4 宽 63、6 枚触发器钮 gap 6 宽 83.67；⑥ 几何锚点逐项同 Web —— 开始钮 `{w/2−130, h−pad−52, 260, 52}` 底锚、页签 `(w−2pad)/3` 在 y 120 h 30（整条 `tabs_talent_three` 打底 + 逐签覆盖层）、行区顶缘恒 156、标题 `banner_purple_cosmic` 240×46 配 `player_pose_5` 在 `(252, 4, 38, 60)`、两行基线 `l1 = round(y + h/2 − 6)` 与 `l2 = l1 + 19`、「已拥有」左侧勾选标记 `mark_check_green` 的位置在 Web 由 `measureText("已拥有").width` 反推。命中五段依次为页签 → 节点行 → 触发器钮 → 效果钮 → 开始钮，热区之外没有兜底。**六格溢出矩阵**（`h ∈ {996, 1246} × 条件块 ∈ {无, 只有其一, 两者都有}`）：行区预算底缘在 912 / 866 / 820 与 1162 / 1116 / 1070 六档取值，`rowH` 钳 40..64、`gap` 上限 20，1246 档三格的 `rowH` 与 `gap` 同时顶到上限故 `rowsEnd` 恒 976 —— 由 `tests/cocos-phase4-prestige.test.ts` 对着纯函数钉死，并附一条"行区预算随屏高单调放宽"的跨档断言。表现项进 `phase4` 段的 `pt*` 共 66 键，默认值逐项对标 Web；几何常量留在共享层。`PT_PANEL_NINE = 32` 与 `GU_PANEL_NINE` / `GC_PANEL_NINE` 同性质：九宫切深在 Cocos 侧由 `ViewTable.borderOf` 按图推导，该常量没有消费者，进共享层只是把 Web 的实参留在几何旁边供断言与翻新取用。构建包实测（`.probe/probe-prestige.js`，560×996 与画布 1:1）：996 档 **44 条闭环全过** —— 几何逐项对标上述锚点、买天赋的四点门控（买得起入档 / 已拥有再点静默 / 可支配不足静默 / 点数够但层级未开静默）、三档页签切换与路线名文案跟随、两枚开局配置开关的往返与单选迁移、两份瞬时态确实不落盘、`prestiges` 不被本屏改动、996 三格的可见 Label 无一越界；定版截图 `.probe/cocos-p6-prestige-560.png`。产物 grep：`天赋尚未开放` 0 条、`委托尚未开放` 与 `融合尚未开放` 各 1 条，从 `PrestigeModel.ts` 抽出的 8 条中文字面量在产物与 `src/game.ts` 里逐字成对，12 个文案片段与 11 个接线符号都在包里。

**转生屏这一单的挂账与已决项（五条）**：① **「完美蓝图」开关已接到开局武器** —— Web `src/game.ts:5336` 是 `makeStarterEquipment(this.runConfig.blueprintEffect ?? "knife")`，Cocos 侧同口径：`BattleSimOptions.starterEffect?: () => EffectType | undefined` 由 `GameShell.buildBattle()` 传 `() => this.runConfig.blueprintEffect`，`BattleRunInputs.makeStarterEquipment` 在每次开局时现取（`makeStarterEquipment(starterEffect?.() ?? "knife")`）。做成 getter 而非构造时快照，是因为 Web 的 `runConfig` 整局会话内从不清零、跨多次开局持续生效。天赋门只在 UI 侧（`owns("blueprint")` 决定效果钮组画不画，Web `src/game.ts:4188`），战斗层不复查，两端同形；不注入时逐位等于原先的固定飞刀，故战斗指纹基线不动。覆盖：`tests/cocos-blueprint-starter.test.ts`（9 条：八枚效果钮逐个落地、改选装后下一局即换、`undefined` 回落飞刀、收藏件与套组两条既有优先级不被破坏，外加一条锁住 `buildBattle` 接线不被摘掉的源码守卫）+ 构建包实测 `.probe/probe-blueprint.js` **7 条全过**（真实点效果钮 → `runConfig` → `startStage(1)` → `player.equipment[0]` 的效果类型；取消后回落飞刀且带 `spread 16 / damage 40` 那组专属参数；选装不落 `localStorage`）。（「定向搜索」那枚在 **Web 侧同样没有消费方** —— `runConfig.targetTrigger` 只在绘制与开关两处出现，两端一致，不算分歧。）② **本屏没有返回路径**，照抄 Web：从主菜单「天赋」入口进来也回不去，键盘分支只认 `r`（开始新轮回）。③ **1246 档在构建包实机上进不去**：`refreshDesignResolution()` 只在 `Bootstrap.mount` 与 `GameShell.onLoad` 各跑一次，工程没有 window resize 监听，运行时改帧尺寸不会改档位，而 CDP 的 `Emulation.setDeviceMetricsOverride` 也落不到 Cocos 读的 canvas 尺寸上（实测 `getFrameSize()` 仍是窗口值）。这一档由纯函数单测覆盖，实机复核要等"竖屏热切换"那条欠项一起做。④ **启动期 `loadFrames` 回调抛 226 次 `TypeError: Cannot read properties of null (reading 'set')`**（产物 `assets/main/index.js:61`，源在 `GameShell.loadFrames` 的 `resources.load` 回调里写 `this.frames.set`）：`loadFrames` / `boot` 与 `game/data/assets.ts` 本轮均未改动，与已提交的扭蛋包是同一条通路同一批输入；存活实例的 `frames.size = 150`、本屏四张贴图（`banner_purple_cosmic` / `player_pose_5` / `tabs_talent_three` / `mark_check_green`）全在、画面与 44 条闭环均正常，故未观察到后果。抛出机制未钉死（怀疑是被销毁实例的在途回调），挂账待查。⑤ **死亡结算的账已补齐，但要等 Phase 5 的结算屏才真正生效**。`BattleSim.settlePendingRun()` 逐行照 Web `settlePendingRun` + `settleRun`（`src/game.ts:1185-1189` 与 `1805-1817`）：阵亡也记本关最远章节（`battleWorld.recordStageProgress` 为此从 private 放开）、回响按 `splitEcho` 的 40% 跨天 / 60% 本日入账、写 `bestRun` / `bestWave` / `seasonBest`、`prestiges += 1`、清挂起标记并落盘。挂在宿主三个 run-start 点上，且**必须排在 `startStage` / `startEndless` 之前** —— `startRun()` 会无条件清 `pendingSettle`，顺序错了这一笔就静默丢掉（Web 把它放 `restart()` 首行是同一理由）：菜单选关、菜单无限关、`restartRun()`（商店「重开」与转生屏「开始新轮回」共用）。**但这条通路目前在正常游玩下走不到**：工程里没有任何离开战斗屏的路径 —— `onDeath` / `onVictory` 都是空桩、HUD 没有菜单或暂停钮、所有 `router.show("menu")` 都是别的屏的返回钮，于是玩家死了就停在战斗屏，`pendingSettle` 永远等不到结算点。结算屏（`drawGameOver` 的重开 / 回主页 / 天赋三个出口）属 Phase 5，落地后这条通路即刻生效。**对委托屏的影响**：正常游玩下 `prestiges` 仍为 0，区域解锁 `regionUnlocked(region, prestiges, ownedTalents)` 只会开第一档；要验更高的档位只能改存档或走探针。覆盖：`tests/cocos-settle-pending.test.ts`（10 条，含"先开新局再结算 → 这一笔账整个丢掉"这条顺序危险的反向锁）+ 构建包实测 `.probe/probe-settle.js` 12 条全过（`prestiges` 0→1→2 并进 `localStorage`、回响两笔之和等于本局所得、`bestRun` 被更高击杀数改写、广告复活那一局不结、无挂起时重开是空操作）。

**委托挂机屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/commissionLayout.ts`（单一出口 `commissionScreenLayout(w, h, slotCount)`，`slotCount` 就是活动槽位数，两个分支的矩形互斥，故与每日 / 扭蛋 / 转生屏一样由宿主投影出存档切片再调共享层出口），内容与写入意图在 cc-free 的 `commission/CommissionModel.ts`，`GameShell` 的 `commitCommissionClaim` 是唯一的存档写入方。**本屏没有广告位**。接线点计数：`PENDING_SCREEN` 由两条降到一条（只剩 `fusion`，在商店工具钮分发），路由实际注册十一屏，`SCREEN_KEYS` 仍是 16 态全量，refresh 钩子接 `syncCommission`，菜单入口 `commission` 从占位轻提示换成 `openCommission`。屏内一份瞬时态 `this.commSel`（选中的区域与难度）由宿主持有且**不入档**，与 Web 的 `private commRegion`（默认 `"plains"`）/ `private commDifficulty`（默认 `1`）同形 —— `SaveData` 里没有这两项，整局会话内跨开屏 / 关屏保留。九条本屏特有的口径：① **双形态整体互斥** —— `activeCommissionSlots()` 非空时 Web 在 `src/game.ts:5134` 直接 `return`，只画表头 + 三项读数 + 兑换钮 + 返回钮 + 面板，区域行 / 难度说明 / 难度钮 / 开始钮一个都不画；`CommissionView` 用 `Panels` 与 `List` 两个容器节点的 `active` 整棵切换（不用透明度也不用位移藏），于是 `activeInHierarchy` 就是"这一支在不在画"的判据。② **面板态下兑换钮照画却点不动** —— 兑换钮的绘制在 `return` 之前（5106）、命中判定在它之后（5246）。③ 槽位分配与三处静默：`commission` 空 → 写 `commission`；否则 `commission2` 空**且**拥有 `double_commission` → 写 `commission2`；都不成立 → no-op；选中的区域锁着时点开始钮同样 no-op；点锁定行不改选中（Web 在命中之后才查 `regionUnlocked`）。三处都与 Web 一样全程无提示。④ 领取按区域分流到 `fragments` / `stardust` / `diamond` 三个字段之一，再加 `commissionTickets(effectiveHours(hours, bonus))`（`hours` 用同一个 `now` 重新算一遍），随后清空该槽；失败只体现在产出减半，不额外扣分。⑤ 放弃只清槽、不发奖、无二次确认（Web 在命中处直接 `save[slot] = null` + `persistSave`）。⑥ 兑换比例 `FRAGMENT_TO_STARDUST = 10`、`n = floor(fragments / 10)`，绘制与命中共用同一个前置条件。⑦ **时间与随机源都是入参**：模型里所有 `Date.now()` 的位置收成 `now`、`collectReward` 的 `roll` 做成默认形参，宿主传真实 `Date.now()` 与默认 roll，测试据此把成功与失败两条分别钉死。⑧ 面板进度条的比例是**未钳制**的 `hours / 2`（Web 原样交给 `skinBar`，钳制发生在 `skinBar` 内部的 `min(1, max(0, frac))`；缺图回退分支自己写了 `Math.min(1, hours / 2)`），两档钳制统一落在共享层 `commissionBarRects`。⑨ **实时时序**：面板三行读数与进度条都按 `Date.now()` 现算，Web 逐帧重绘，Cocos 侧由 `GameShell.tickCommission(dt)` 以 1 秒节奏重排（挂在主循环的路由闸门之前，与 `tickToast` / `tickHeroScroll` 同位），且只在面板态走 —— 列表态没有任何随时间变的文案；小时读数是 `toFixed(1)`，6 分钟才跳一档，1 秒足够跟上而不必逐帧重排 Label。底板事实：面板底走 `panelPad(g, w, h)` 不传专属键（就是 `panel_dark_corners` 九宫格，Web 的切深实参 32 在 Cocos 侧由 `ViewTable.borderOf` 按图推导，`CM_PANEL_NINE` 与已落地各屏的同类常量一样没有消费者）；标题走 `banner_title_iron` **不传宽高**，于是用 `skinHeader` 的默认 220×42（与 daily 的 244×42、gacha / prestige 显式给的 240×46 都不同档），横幅盒 `(pad − 8, 36 − 42 + 8, 220, 42)`；小立绘 `player_pose_6` 固定在 `(252, 4, 38, 60)`，无回退分支；两项读数走 `iconText`（`icon_fragment` 缺图退「✧」、`icon_stardust` 缺图退「❋」，size 13、基线 60，起笔 `pad` 与 `pad + 130`），`转生 N 次` 起笔 `pad + 250`；**面板底 `panel_parchment` 是整幅拉伸**（Web 走 `assets.draw`，不是 `drawNine`），Cocos 侧用 `Plate` 的 `"stretch"` 档（`Sprite.Type.SIMPLE` + `SizeMode.CUSTOM`）对齐，缺图回退 `rgba(255,255,255,0.05)` 填充 + `rgba(200,182,255,0.35)` 描边；羊皮纸**命中贴图时面板三行文字切深色**（第一行 `#2a2a33`、后两行 `#4a4a55`），缺图回退才用亮色（`#e8e8e8` / `#8f9bb3`）—— Web 注释点明的"唯一改文字色处"，两档四个色键都进表；进度条 `bar_progress_teal` 走 `skinBar` 的遮罩法（有图时用暗罩从 `x + w × frac` 起盖住空缺），缺图回退才是"轨道 `rgba(255,255,255,0.12)` + 填充 `#4dffc8`"；区域行、难度钮、开始钮、兑换钮与面板两枚钮全是纯代码矩形，开始钮描边宽度取共享层 `CM_START_STROKE_W = 2`（`flatBox` 的 `lineWidth` 只作用于自己那一份 Graphics，Web 的"画完复位为 1"在这里等价于不让 2px 泄漏到后续描边）。命中六段依次为返回钮 → 逐面板领取 / 放弃 → 区域行 → 难度钮 → 开始钮 → 兑换钮，热区之外没有"其余一律"兜底。

**委托屏的六格几何矩阵**（`h ∈ {996, 1246} × 分支 ∈ {列表态, 1 个面板, 2 个面板}`；数字由 `game/ui/theme.ts:spreadRows` 的真实实现算出并由 `tests/cocos-phase4-commission.test.ts` 实测钉死，每格同时与 `spreadRows` 直算值对照）：区域行区预算 `[100, diffY − 24]`，`rowH` 钳 52..88、`gap` 走默认上限 20，六格下两者同时顶到上限（`rowH 88` / `gap 20` / 行步进 108），于是**区域行的矩形在两档屏高下逐字相同**：行 y = 100 / 208 / 316 / 424 / 532 / 640，末行底边 728。996 档 `diffY 858`、预算底缘 834、开始钮 `{150, 930, 260, 52}`（底边 982 = `h − pad`）、末行底边与难度说明基线之间的空档 124；1246 档 `diffY 1108`、预算底缘 1084、开始钮 `{150, 1180, 260, 52}`（底边 1232 = `h − pad`）、同一段空档涨到 374。面板几何与屏高无关：`panelH 150`、`topY 84`、面板间距 12，两枚面板底边 234 / 396，面板内三行基线 `y + 24 / 48 / 68`、进度条 `(22, y + 92, 200, 8)`、领取钮 `{314, y + 106, 112, 36}`、放弃钮 `{434, y + 106, 112, 36}`。难度钮 `bw = (560 − 28 − 4×8)/5 = 100`、x 逐档 +108、`h 42`，钮内两行是固定偏移 `d.y + 17` / `d.y + 33`（不走 `rowTextY`）；返回钮 `{474, 22, 72, 34}`、兑换钮 `{396, 58, 150, 32}`。六格下所有矩形都不越出横向 `[pad, w − pad]`（标题横幅按 `skinHeader` 的 `bx = x − 8` 故意探出 pad，与 prestige / gacha 同性质）。这条跨档不变量 —— **顶边 100 起、行高被 `maxH` 封顶的列表不随屏高长个，而底边锚定 `h` 的难度行与开始钮随屏高下移，两档之间 250px 的差全落在两者之间的空档里** —— 已由测试锁住。表现项进 `phase4` 段的 `cm*` 共 47 键（覆盖底、标题色、两项读数色与两枚替代字形、转生行、兑换钮三件、返回钮三件、羊皮纸缺图回退两件与文字两档四件、进度条三件、领取与放弃各三件、区域行两档底板四件与名字三档与第二行与右对齐产出、难度说明与难度钮两档四件与文字两档、开始钮三件），默认值逐项对标 Web；几何常量留在共享层。`hud` 段既有的 `commissionText: "#c8b6ff"`（战场顶坞行情条那一串用）不在本屏重复定义。

**委托屏这一单核实掉的五条**：① 七个资源键 `banner_title_iron` / `player_pose_6` / `icon_fragment` / `icon_stardust` / `btn_back` / `panel_parchment` / `bar_progress_teal` 在 `game/data/assets.ts` 的 `ASSET_MANIFEST` 与 `cocos-prototype/assets/resources/textures/` 里**逐个都在**（源图尺寸依次 1048×200 / 71×92 / 72×95 / 190×192 / 128×124 / 248×194 / 868×78），一律贴图优先，缺图回退分支与 Web 同语义，本屏没有需要换键或改布局的缺口。② `panel_parchment` 在 Web 侧走 `assets.draw`（整幅拉伸）而**不是** `drawNine`，Cocos 侧因此走 `Plate` 的 `"stretch"` 档而不是 `SLICED`，两端同口径 —— 与每日屏行底板、装备升级屏 `panel_gearup` 那两条"九宫格切边口径"挂账不同源，本屏不带这个偏差；同屏的 `panel_dark_corners` 那一步仍是九宫格（Web `panelPad` 用 `drawNine`），切边值由 `borderOf` 按图推导。③ 主菜单委托钮的红点通路接线后仍成立、**没有任何改动**：`MenuContentModel.menuCommissionReady(save, now)` 与战场顶坞行情条共用 `[commission, commission2].some(… ≥ COMMISSION_READY_HOURS)` 这一条判据（对标 Web `src/game.ts:1051-1054`），`MenuLayoutView` 的 `commDot` 读 `content.showCommissionDot`；宿主 `commitCommissionClaim` 末尾照已落地各屏的做法调 `refreshMenu()`，于是派遣 / 领取 / 放弃之后红点即时跟上。④ `BUILDER_ROUTE` 共 **10 枚**天赋，`save.ownedTalents` 是一个不设上限的数组字段（`normalizeSave` 只判 `Array.isArray`），所以"点满"在现有存档模型下可达，`星尘圣殿` 的 `unlockTreeFull` 分支能真解锁；验证方式是 `regionUnlocked(regionOf("sanctum"), 0, BUILDER_ROUTE.map(n => n.id)) === true` 而少一枚即假（`unlockPrestiges` 是 0，与转生次数无关），已写进测试。⑤ Web 的 `overlayFrom` 三态（`playing` / `shop` / `menu`）在 Cocos 侧**没有对应物** —— `ScreenRouter` 只有 `current`，不记录"从哪来"，已落地各屏的返回钮一律 `router.show("menu")`；本屏照这一口径接。Web 侧委托屏的两个入口（主菜单委托钮 `src/game.ts:3448` 与键盘 `c`，`src/game.ts:769`）都显式传 `"menu"`，于是 `openCommission` 那个 `from = "playing"` 默认档在 Web 侧也没有调用方，顶坞行情条只显示 `委托已完成!主菜单可领取`（`src/game.ts:2390-2394`）而不可点 —— 两端的 `overlayFrom` 实际恒为 `"menu"`，返回钮回主菜单与 Web 的 `state = overlayFrom` 同结果（Web 另有 Escape 分支 `src/game.ts:784-788`，键盘不在 Cocos 侧的迁移面内）。

**委托屏这一单的两条挂账**：① 正常游玩下 `prestiges` 仍为 0（死亡结算通路休眠，见转生屏挂账 ⑤），区域解锁只开枯萎平原一档，要验更高的档位只能改存档或走探针 —— `.probe/probe-commission.js` 就是按"直接摆存档再注入真实触摸"写的。② 1246 档在构建包实机上进不去（同转生屏挂账 ③），探针只在 996 档写断言，那一档由纯函数矩阵覆盖。覆盖：`tests/cocos-phase4-commission.test.ts`（129 条，含六格几何矩阵、跨档不变量、六个动作的写入意图分支与两条字面量锁：`开始委托(4h)` 与 `收益前2h 100%,之后降至 50%` 都是 Web 的字面量，测试同时锁住 `COMMISSION_DECAY.fullHours === 2` 与 `floorRate === 0.5`，改表就会撞上这条并被迫回头处理文案；那个 `4` 在表里没有对应常量 —— 封顶是 12、提醒门槛是 2、衰减终点才是 4）；构建包复核入口 `.probe/probe-commission.js`。

**词缀融合屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/fusionLayout.ts`（单一出口 `fusionScreenLayout(w, h, eqIds, forms)` —— `eqIds` 是局内装备的 id 序列（长度 = 行条数），`forms` 是 `{ hidden, triple }` 两个形态位、命中分派据此走，故与每日 / 扭蛋 / 转生 / 委托屏一样由宿主投影出切片再调共享层出口，本层不读存档也不查天赋），内容与写入意图在 cc-free 的 `fusion/FusionModel.ts`（融合执行 / 成本 / 保底候选 / 落词缀全部转调共享层 `game/data/fusion.ts` 的 `performFusion` / `performTripleFusion` / `inheritSource` / `fusionCost` / `tripleFusionCost` / `tripleUnlocked` / `rollHiddenCandidates` / `applyHiddenAffix`，本文件不重写任何一条规则），`GameShell` 的 `commitFusionClaim` 是唯一的存档与局内装备写入方。**本屏没有广告位**。接线点计数：`PENDING_SCREEN` 随本屏落地**整表删除**（占位轻提示 0 条），路由实际注册十二屏，`SCREEN_KEYS` 仍是 16 态全量，refresh 钩子接 `syncFusion`，商店工具钮 `fusion` 从占位轻提示换成 `openFusion()`，返回钮 `router.show("shop")`（本屏 `overlayFrom` 恒 `"shop"`，见核实 ③）。屏内三份瞬时态 `this.fusSel`（选中三件 id）/ `this.fusMode`（三重模式）/ `this.fusPending`（保底三选一暂存）都由宿主持有且**不入档**，与 Web 的 `private fusA/fusB/fusC` / `private tripleMode` / `private pendingHidden` 同形（`SaveData` 里没有这四项）；两处节奏照 Web `openFusion` —— 开屏清 `fusSel` 与 `fusPending`、**不清 `fusMode`**（三重模式跨开屏保留）。八条本屏特有的口径：① **必成功 + 自动继承** —— 这一版没有失败分支，双选 / 三重都 100% 出成品，部件继承品质更高一方（同品质取 A；三重按 A/B/C 取先），判据全在共享层 `performFusion` / `performTripleFusion` / `inheritSource`；② **保底触达转三选一暂存** —— `bumpFusionPity` 先 +1、到 `HIDDEN_PITY_N` 归零并触达，触达那一发素材照扣、成品**不直接入场也不落盘**而是暂存 `pendingHidden`（Web `afterFusionRoll` 的 `hitsPity` 分支：不出现"扣了星尘没拿到货"的中间态），玩家从 3 个候选选定后经 `applyHiddenAffix` 落上彩虹品质与词缀名再入场落档；③ **弹层打开时只响应卡片** —— Web `onFusionClick` 在 `pendingHidden` 分支里循环完卡片直接 `return`，返回钮 / 装备行 / 融合钮全被吞掉，三选一必须选定、没有放弃出口（Web 侧 Esc 也被禁，键盘不在 Cocos 迁移面内）；④ 隐藏词缀装备**可以点选但不可作素材** —— `onFusionEquipmentTap` 不看 `hiddenAffix`（点它照样进 A/B/C），`doFusion` 才拦（`mats.some(e => e.hiddenAffix)` → 静默 no-op），绘制侧行名换成 `【隐藏·名字】` 并标灰"不可作素材"；⑤ **三重未解锁（天赋 < 6）时选满三件仍走双选口径** —— `triple = fusC !== null && tripleUnlocked(ownedTalents.length)`，未解锁那一支即便 `fusC` 有值也只吃 A/B（成本按双选、C 原样留在列表里），与 Web `doFusion` 逐字同式；⑥ **随机源是入参** —— 保底三选一的候选走 `rollHiddenCandidates(roll)` 的 `roll` 形参（默认 `Math.random`），本屏**没有任何 `Date.now()` 消费点**（无实时读数，故没有委托屏那样的 `tick*` 周期重排）；⑦ 成品入的是**局内 `player.equipment`（内存态，不落盘、不进 `save.ownedGear`）**，图鉴记的是词缀名（触发器 / 效果 / 修饰器三个名字列表）经 `recordEquipment`；⑧ 四处静默 no-op：素材带隐藏词缀 / 星尘不足 / 三重态素材 find 落空 / 装备 < 2 件开屏被宿主拦（Web 全程无提示）。底板事实：面板底走 `panelPad(g, w, h)` 不传专属键（就是 `panel_dark_corners` 九宫格，切深实参 32 在 Cocos 侧由 `ViewTable.borderOf` 按图推导，`FU_PANEL_NINE` 与已落地各屏的同类常量一样没有消费者）；标题横幅 `banner_mid_blue` 是**裸 `assets.draw` 的整幅拉伸**（实参 `(pad − 6, 8, 190, 40)`，**不是 `skinHeader`**），Web 不接返回值 → 没有缺图回退档，缺图时横幅收成零位盒、标题恒左起笔于 `pad`、基线 36；星尘读数走 `iconText`（`icon_stardust`，size 14、基线 62，有图右移 `14 + 4`、缺图退「❋」）；返回钮 / 装备行 / 模式钮 / 融合钮 / 三选一卡片**全是纯代码矩形**（Web 那里就没有贴图），融合钮、卡片与选中行的描边宽度取共享层 `FU_FUSE_STROKE_W` / `FU_CARD_STROKE_W` / `FU_ROW_SEL_STROKE_W`（都是 2，`flatBox` 的 `lineWidth` 只作用于自己那一份 Graphics，等价于 Web "画完复位为 1"不让 2px 泄漏）。命中五段依次为（弹层）卡片 → 返回钮 → 装备行 →（三重态）模式钮 → 融合钮，热区之外没有"其余一律"兜底。

**融合屏的八格几何矩阵**（`h ∈ {996, 1246} × 件数 ∈ {2, 6, 7, 8}`；数字由 `game/ui/theme.ts:spreadRows` 的真实实现经布局函数实算，`tests/cocos-phase4-fusion.test.ts` 每格都再用 `spreadRows` 直算一遍对照，不是从布局函数里抄回来的）：行区预算 `[92, panelY − 12]`、`panelY = h − pad − 48 − 180`（996 → 754、1246 → 1004），故预算底缘 996 → 742、1246 → 992；`rowH` 钳 44..76、`gap` 上限走默认 20。**件数 ≤ 6**：`rowH` 76、`gap` 20 同时顶到封顶，两档屏高下行矩形**逐字相同**，屏高的差全落在末行底边与 `panelY` 之间的空档（996 档件数 2 → 空档 490、件数 6 → 106）。**件数 7 / 8 是分界**：996 档预算开始咬住 —— 件数 7 时 `gap` 收到 19（`rowH` 仍 76），件数 8 时 `rowH` 降到 75、`gap` 降到 7；而 1246 档件数 7 / 8 仍是 `rowH` 76 / `gap` 20。末行底边（件数 2/6/7/8）996 档 264 / 648 / 738 / 741、1246 档 264 / 648 / 744 / 840，八格都 ≤ 各自预算底缘。融合钮底边恒压 `h − pad`、模式钮与整个面板区底边锚定 `panelY`，屏高差由 `panelY` 底锚与行区空档吸收。三张三选一卡片一行 150×128、间距 16、`cx 39`、`cy = h/2 − 64 + 10`（996 → 444、1246 → 569），纵向随屏高走、横向两档逐字相同。

**融合屏这一单核实掉的五条**：① 三个贴图键 `banner_mid_blue` / `icon_stardust` / `panel_dark_corners` 在 `game/data/assets.ts` 的 `ASSET_MANIFEST` 与 `cocos-prototype/assets/resources/textures/` 里**逐个都在**（源图尺寸依次 1000×184 / 190×192 / 216×213），一律贴图优先，本屏没有需要换键或改布局的缺口。② 面板底 `panel_dark_corners` 走 `panelPad` 的 `drawNine`（**九宫格**，切深 32，Cocos 侧 `Plate` 的 `"slice"` 档、切边由 `borderOf` 按图推导），标题横幅 `banner_mid_blue` 走 `assets.draw`（**整幅拉伸**，Cocos 侧 `iconNode` / `Sprite.SIMPLE`），两端同口径 —— 本屏不带每日屏行底板、装备升级屏 `panel_gearup` 那两条"九宫格切边口径"挂账的偏差（不同源）。③ **入口与返回**：Web `openFusion(from)`（`"playing" | "shop"`）唯一活着的入口是章间商店工具钮（`src/game.ts:1565` 的 `openFusion("shop")`，全文件仅此一处调用；战斗内入口已移除，见 `src/game.ts:634` 注释"融合/委托已移至商店与主菜单"），返回钮 `state = overlayFrom` 在本屏恒回 shop；Cocos 侧 `ScreenRouter` 没有 `overlayFrom`、返回钮接 `router.show("shop")`，与 Web 同结果 —— 这与已落地七屏返回一律 `router.show("menu")` **不同**，因为本屏唯一入口是商店而非主菜单。④ **保底与三选一的数据来源**：`HIDDEN_PITY_N`(10) / `TRIPLE_FUSION_UNLOCK_TALENTS`(6) / `TRIPLE_FUSION_COST_MULT`(2) / `FUSION_COST_TABLE` / `FUSION_COST_FALLBACK`(60) 全住在共享层 `game/data/quality.ts`（`fusion.ts` 转出口 `fusionCost` / `HIDDEN_PITY_N`），**都不被 `balance.json` 覆盖** —— `applyBalance` 的七段（energy / economy / battle / waves / chapterTypes / gacha / menuSkin）没有融合对应通道，`FUSION_COST_TABLE` 在共享层也没有第二处改写点，两端读同一份常量；四个隐藏词缀候选在 `HIDDEN_AFFIXES`（`fusion.ts`），`rollHiddenCandidates` 抽 3 个互不重复。⑤ **成品进图鉴**：Web 在 `afterFusionRoll`（未触达档，`src/game.ts:732`）与 `pickHiddenAffix`（三选一落定，`src/game.ts:745`）两处调 `recordEquipment`，记的是词缀名（触发器 / 效果 / 修饰器三个名字列表）而非整件装备；Cocos 侧对应物是 `sim.world.recordEquipment(claim.result)`（与扭蛋屏 `commitGachaClaim` 同一条口），宿主在 `commitFusionClaim` 的未触达档与三选一档各调一次；成品本身入局内 `player.equipment`（内存态，不落盘、不进 `save.ownedGear`）。

**融合屏这一单的两条挂账**：① 正常游玩下本屏入口够不着 —— 唯一入口是章间商店工具钮，而商店只在章末弹出；三重形态还要天赋 ≥ 6（`ownedTalents` 靠回响点数买，而正常游玩 `prestiges` 恒为 0、死亡结算通路休眠，见转生屏挂账 ⑤），要验三重与更高档位只能改存档或走探针 —— `.probe/probe-fusion.js` 就是按"直接摆局内装备（克隆开局武器造素材）与存档、再注入真实触摸"写的。② 1246 档在构建包实机上进不去（同转生屏挂账 ③、委托屏挂账 ②），探针只在 996 档写断言，那一档由纯函数八格矩阵覆盖。覆盖：`tests/cocos-phase4-fusion.test.ts`（116 条，含八格几何矩阵、跨档不变量与件数 7/8 的分界、五段命中、四档写入意图分支、`deepFreeze` 纯度守与三处字面量锁：`≥6 个天赋节点` 里的 `6`、卡片描述折行的 `每行 10 字 / 最多 4 行` 都是 Web 的字面量，测试同时锁住 `TRIPLE_FUSION_UNLOCK_TALENTS === 6`、`FUSION_CARD_DESC_CHARS === 10`、`FU_CARD_DESC_MAX_LINES === 4`，改表就会撞上并被迫回头处理文案；`HIDDEN_PITY_N` 那三处是从常量插值、不是字面量，测试反向锁住"绘制段里没有裸 `10`"）；构建包复核入口 `.probe/probe-fusion.js`（996 档断言，与委托屏探针同款写法，留待复核阶段实机跑）。

**赛季屏的四格几何矩阵**（`h ∈ {996, 1246} × 摘要形态 ∈ {上屏, 收起}`；数字由 `game/ui/seasonLayout.ts` 的真实实现算出并由 `tests/cocos-phase4-season.test.ts` 实测钉死，形态位两支的矩形逐字相同）：本屏纵向只有两条锚线 —— `anchorY = h × 0.28`（996 → 278.88、1246 → 348.88）与 `by = h − 78`（996 → 918、1246 → 1168）。徽标盒 `{256, anchorY − 96, 48, 48}`（182.88 / 252.88）、横幅盒 `{160, anchorY − 32, 240, 44}`（246.88 / 316.88）、标题基线 `anchorY`，摘要四行基线 `anchorY + 34 / +62 / +86 / +114`（996 → 312.88 / 340.88 / 364.88 / 392.88），贴底钮 `{185, by, 190, 44}`、钮内文字基线 `by + 28`（946 / 1196）。**两档之间每个矩形都按 `h` 线性位移**（锚线段差 70、贴底段差 250），因为本屏**一次都不调 `spreadRows`** —— 内容条数恒为徽标 + 横幅 + 标题 + 四行摘要 + 一枚钮，没有任何"随屏高摊开"的行区，这与九屏共同事实里那句"行高一律走 `spreadRows` / `rowTextY`"是个例外。两处 Web 原样的贴边口径：钮底边落在 `h − 34` 而**不是** `h − pad`（Web 写的是裸 78；委托屏开始钮、融合屏融合钮与转生屏开始轮回钮的底边都压在 `h − pad` 上），钮内文字基线是裸偏移 `+28` 而**不走** `rowTextY`（同档实参下 `rowTextY` 会给 `+27`，差 1px）。六行文本全部 `textAlign = "center"`、锚点 `280`、限宽收成 `[pad, w − pad] = [14, 546]`。四格下所有矩形与文本带都落在横向 `[14, 546]`、纵向 `[0, h]` 内，摘要末行基线（392.88 / 462.88）与钮顶缘（918 / 1168）之间最短也有 525 的空档，不可能叠字。

**赛季结算屏这一单落地的口径与照抄项**：几何在共享层 `game/ui/seasonLayout.ts`（单一出口 `seasonScreenLayout(w, h, summary)`，`summary` 是摘要形态位、由宿主按 `seasonSummary` 是否为空折出，本层不读存档也不查时间），内容与写入意图在 cc-free 的 `season/SeasonModel.ts`（到期判据 `seasonEnded`、赛季分 `seasonScore`、星尘折算 `seasonStardust`、周期 `SEASON_DAYS × DAY_MS`、主题名 `seasonTheme` 全部转调共享层，本文件不重写任何一条规则），`GameShell` 的 `commitSeasonRoll` 是唯一的存档写入方。**本屏没有广告位，也没有手动入口**。接线点计数：路由实际注册十三屏（`SCREEN_KEYS` 仍是 16 态全量），refresh 钩子接 `syncSeason`（第 10 条），装配点 `buildSeasonScreen()` 排在 `buildFusionScreen()` 之后，晚到贴图流补 `setFrames` 与当前屏补排各一行；存档投影走复用的 `seasonSlice` 对象（`tickSeason` 每帧都读一发，与 `heroSlice` 同性质，不逐帧分配）。**翻页账本由战斗层上移到宿主**：原先只有 `BattleSim.update()` 里那发 `syncSeason()`，而它首行是 `if (!world.started || world.over) return`、壳层又在 `router.blocksPlay()` 处整帧早退 —— 于是只有"正在战斗的推进帧"才会翻页，停在菜单与任何一张静态屏时永不翻页，而且那发翻页也不产出摘要（Cocos 侧原本没有 `seasonSummary` 这条通路），本屏因此此前不可达。现在改由 `GameShell.tickSeason()` 逐帧跑在 `router.blocksPlay()` 闸门之前，与 `syncDaily()` 同一条口，语义覆盖 Web"任何状态下都执行"那一句，`BattleSim` 里那份抄本随之删除（连同 `DAY_MS` / `seasonEnded` / `seasonStardust` / `SEASON_DAYS` 四个失去消费者的导入；`seasonScore` 仍在用，战斗结算要它）。屏内一份瞬时态 `this.seasonSummary` 由宿主持有且**不入档**，与 Web 的 `private seasonSummary` 同形（`SaveData` 里没有这一项）。六条本屏特有的口径：① **进屏判据与写入时序**：Web 的 `syncSeason()` 先落五笔账再写摘要，紧随的 `if (seasonSummary && state === "menu") state = "season"` 才弹屏 —— 所以"写入发生在进屏前"，贴底钮那一下（`closeSeason`）只清摘要 + 回主菜单，**不产生任何存档写入意图**，模型层因此不给它建 claim 类型；② **翻页条件受 `state === "menu"` 门控**：Cocos 侧同构为 `router.current === "menu"`，停在其它屏时照样翻页、照样有摘要，只是不弹屏（探针第七节就把这一发钉在通行证屏上验）；③ **离线跨多赛季只留最近一次摘要**：Web 的 `while` 每轮覆写 `seasonSummary`，而 `stageStars` 与 `seasonBest` 在第一轮就被清零，于是跨 N 季展示的是**最后一个已结束赛季**、其分数与星尘都是 0，累加的 `stardustGain` 实际只有首轮那一笔（`seasonRoll` 逐字复现，测试用 2 季与 3 季两发钉死）；④ **摘要形态位在 Web 侧恒真**：进屏判据本身就要 `seasonSummary` 非空，`drawSeason` 里的 `if (s)` 是绘制层的防御分支 —— 视图仍按 `content.hasSummary` 用 `Summary` 容器的 `active` 整棵切换，两支矩形完全相同，该分支只能由 `openSeason()` 直调抵达（探针第六节）；⑤ **本屏没有倒计时**：四行摘要念的是已结算的账，没有任何随时间变的读数，所以不像委托屏那样挂 `tick*` 周期重排；⑥ 命中面只有一枚钮（Web `onSeasonClick` 只认 `seasonBtn`），钮外一律吞掉、也不落到主菜单的点击分发上。底板事实：**本屏没有面板** —— Web 只画一笔全屏暗底 `rgba(8,10,16,0.92)` 就起内容，既不调 `panelPad` 也不用 `drawNine`，所以视图里没有 `Plate`，也不产生九宫格切边口径的挂账；徽标 `emblem_flow_gold` 与横幅 `banner_mid_bronze` 都是**裸 `assets.draw` 的整幅拉伸且不接返回值**（没有缺图回退档），缺图时两枚收成零位盒、文字照落位；贴底钮是纯代码矩形（`#2a3d55` 底 + 金描边 + 白字），描边宽度取共享层 `SE_BTN_STROKE_W = 1`（Web 那一笔 `strokeRect` 没有显式设 `lineWidth`，取全项目"描边后复位 1"的约定档）。表现项进 `phase4` 段的 `se*` 共 9 键（覆盖底、标题、摘要四行各一色、钮底板与描边与文字），默认值逐项对标 Web，钮文字 Web 写的是 `#fff`、本表色键一律 6 位档故记作 `#FFFFFF`；几何常量与六档字号留在共享层。

**赛季屏这一单核实掉的六条**：① 两个贴图键 `emblem_flow_gold` / `banner_mid_bronze` 在 `game/data/assets.ts` 的 `ASSET_MANIFEST`（依次第 134 / 106 行）与 `cocos-prototype/assets/resources/textures/` 里**逐个都在**（源图尺寸依次 100×84 / 1000×184），本屏没有需要换键或改布局的缺口。徽标源图非方（100×84）而被画进 48×48 的盒，两端同比例横向压扁 —— 这是 Web 原样，不是 Cocos 侧新引入的形变。② **面板底与横幅口径**：本屏没有面板底（见上），两枚横幅/徽标都走 `assets.draw`（整幅拉伸）而**不是** `drawNine`，Cocos 侧对应 `iconNode` / `Sprite.Type.SIMPLE`，两端同口径，与每日屏行底板和 `panel_gearup` 那两条九宫切边挂账不同源。③ **入口与返回**：Web 侧赛季屏的入口全文件只有一处（`src/game.ts:830` 的自动弹屏），出口两处 —— 钮（`onSeasonClick` → `closeSeason`）与键盘 Escape（`src/game.ts:774-775` → 同一个 `closeSeason`），二者都写 `state = "menu"`，**没有 `overlayFrom` 参与**（`overlayFrom` 只服务 fusion / commission 那两张覆盖层屏）。所以 Cocos 侧返回落点接 `router.show("menu")` 与其余七屏同向、与融合屏（回 shop）不同向，且这里不存在"从哪来"的口径损失：能弹屏的前提就是正在 menu。键盘面不在迁移范围内（同前八屏）。④ **赛季常量各自住哪、有没有被 `balance.json` 覆盖**：`SEASON_DAYS`(14) / `SEASON_STARDUST_RATE`(1) / `DAY_MS` 与 `seasonScore`（`Σ非零星数 × 10 + seasonBest`）、`seasonStardust`、`seasonEnded`、`seasonDay`、`STAR_HP_THRESHOLD`、`THREE_STAR_TICKETS`(5)、`STAR_MAKEUP_COST`(5)、`FIRST_CLEAR_*` 全住在共享层 `game/data/season.ts`；`seasonTheme(seasonId)` 与四态主题表 `THEMES`（回响苏醒 / 永冻深渊 / 熔火回响 / 幽冥潮汐，按 `(id − 1) % 4` 轮换）、`setMutation` / `featuredSetId` / `isSeasonBoosted` 住在 `game/data/seasonSets.ts`；主题怪换皮在 `game/data/seasonMonsters.ts`。**`balance.json` 里没有任何 season 键，`applyBalance` 的七段（energy / economy / battle / waves / chapterTypes / gacha / menuSkin）也没有赛季通道**，故 `SEASON_DAYS`、`SEASON_STARDUST_RATE`、主题表与环境词缀加权两端都只能改代码，改不到表；同理 `theme.fs` 字阶表也没有通道（`menuSkin` 段覆盖的是主菜单的换图 / 四边间距 / 显隐），故本屏那三档表外字号两端都只能改代码、改不到表。⑤ **翻页判据在 Web 是每帧跑**（`update()` 里、暂停态闸门之前，任何状态都执行），Cocos 侧现在挂在 `GameShell.update()` 的 `tickSeason()`，位置与 `sim.syncDaily()` 同段、**在 `router.blocksPlay()` 之前**，因此不受该门控 —— 停在非战斗屏跨赛季时各屏读数是**即时**的：翻页落账后 `commitSeasonRoll` 调 `refreshMenu()`，`tickSeason` 再调一次 `router.refresh()` 把当前屏显式重排（Web 靠逐帧重绘自然跟上，节点化后必须显式做一次，与每日重置之后重排 daily / gacha 同一理由）。高级轨那条跨屏事实（`premiumPassSeason === seasonId`，翻页即失效）改前需要下一发战斗推进帧才可能生效，现在当帧生效，探针第七节在通行证屏上钉死。⑥ **改动的既有测试计数**：`cocos-phase4-{gacha,gearup,prestige,commission,fusion}.test.ts` 五个文件里"注册列表字面量"补 `"season"`（共 5 处）；`cocos-phase4-{gacha,prestige,commission,fusion}.test.ts` 四个文件的"sync 钩子计数"9 → 10、用例标题"路由实际注册十二屏"→ 十三屏（共 4 + 4 处）；`cocos-phase4-fusion.test.ts` 两处用 `/* ================= 主循环` 做的融合分节切片终点改到 `/* ================= 赛季结算屏`（新分节插在两者之间）；`cocos-phase4-gacha.test.ts` 一处用 `BattleSim` 的 `private syncSeason()` 做的切片终点改到紧随其后的 `/** 广告复活(结算屏调用)` 注释（该方法已上移宿主）。

**赛季屏这一单的两条挂账**：① 正常游玩下本屏要等真实时间走满 14 天才会自动弹出（`seasonStartAt` 由 `normalizeSave` 写成本机时间戳，无调试键可跳过），构建包实机复核只能按"直接摆存档 `seasonStartAt` 再注入真实触摸"写 —— `.probe/probe-season.js` 就是这么写的（含摘要收起那一支的 `openSeason()` 直调，与停在通行证屏跨赛季的即时性验证），留待复核阶段实机跑。② 1246 档在构建包实机上进不去（同转生屏挂账 ③、委托屏挂账 ②、融合屏挂账 ②），探针只在 996 档写断言，那一档由纯函数四格矩阵覆盖。覆盖：`tests/cocos-phase4-season.test.ts`（62 条，含四格几何矩阵与"形态位不改变任何矩形""两档线性位移"两条跨档不变量、三种赛季时态加到点即翻与跨两季与跨三季与零档共七发翻页、单枚热区四角与钮外吞掉、九键 `se*` 表与 Web 源码逐笔比对，以及四处字面量锁：六档字号里 `24` / `17` / `15` 三档**不在 `fs` 表内**（测试反向锁住 `fs` 全表为 12/13/14/16/22/28 且这三档不在其中，改字阶就会撞上并被迫回头处理与 Web 的像素差）、翻页清零的 `SE_STARS_RESET` 长度 8 === `STAGES.length + 1`（Web 写的是字面量八个 0）、`SEASON_STARDUST_RATE === 1` 使「赛季分 N」与「星尘 +N」两行同数（`SEASON_DAYS === 14`、`seasonScore` 的 `×10` 一并锁住）、说明行 `关卡/收藏/天赋永久保留` 是字面量而对应字段 `highestStage` / `ownedGear` / `ownedTalents` 逐个在档上；另有三条源码守卫：五件套齐备且装配点在融合屏之后、本屏分节内存档写入只在 `commitSeasonRoll`（`persist()` 计数恒为 1）、`onSeasonAction` 段不含 `adPending` 且全文件 `if (this.adPending) return;` 仍恒为 1 处）；构建包复核入口 `.probe/probe-season.js`（996 档断言，与委托 / 融合屏探针同款 prelude 与写法，越界判定的参考盒在断言处现取）。

### Phase 5 — 流程屏与覆盖层
`drawGameOver` `drawVictory` `drawConfirm` `drawSectionHeader` `drawSlamWarn` + `Overlay` 常驻层。（`drawTriplePanel` `drawHiddenChoice` 是融合屏自身的绘制件，已随 Phase 4 词缀融合屏落地，见上）其中 `drawGameOver` / `drawVictory` / **`drawConfirm`（已落地，见文末「Phase 5 二次确认弹层落地记」）**三件已落地，分别见文末对应小节。

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
| R5 | 文本落位口径：子局部矩形忘传父尺寸 / 把对齐锚点当盒左沿 | 文字飞出屏幕，或右对齐与居中标签整体右移半个盒宽（越出 560 右界、压住相邻文本） | 三屏文本统一走 `ui/PanelKit.placeLine`（唯一入口，`box` 为子局部矩形参数），锚点折盒集中在 cc-free 的 `ui/TextBand.ts:anchorBand`；`tests/cocos-phase3.test.ts` 第 7 节按 `shopLayoutPure` / `heroSelectLayout` 全网格断言每条文本带落在 `0..560`，Code Review 检查所有 `rect` 调用 |
| R6 | 视图节点挂到 `World` 而非 `Screen:<key>` | 屏幕间互相漏画 | §2.2 写成约定；Phase 1 起屏幕组件构造签名强制接收所属屏幕节点 |
| R7 | `addComponent(Sprite/Graphics/Label)` 自动附带 `UITransform` | 重复组件、尺寸设置失效 | 统一 `getComponent(UITransform) || addComponent(UITransform)` |
| R8 | 渐变/发光等 Canvas 效果直译 | 视觉回退或过度设计 Shader | 优先贴图 + `UIOpacity`；Shader 作为 Phase 6 之后的独立优化项 |
| R9 | 布局台（1817 行 dev 代码）与 Cocos 几何模型不兼容 | 失去"拖拽改表"这条已验证的高效通道 | 已闭合。模型层（字段/手柄/钳制/拾取/导出）上移为两端共用的 `game/dev/`，工作台宿主唯一在 Web 侧 `src/dev/`（dev-only 入口），手柄与字段数按引用同一性与实测数（76 / 125）钉在 `tests/cocos-lab-parity.test.ts`；Cocos 侧几何读同一份 `menuLayoutPure` 产物，由 `MenuLayoutView` 排节点，拖出来的数值经 `balance.json` 的 `menuLayout` / `menuSkin` 段进引擎，不存在第二套实现 |
| R10 | 存档跨端兼容 | 老玩家进度丢失 | 键名与结构不变（`echo-abyss-save-v1`），Phase 1 起每阶段做读旧档回归 |

---

## 10. 已确认的前提（2026-09-03 拍板）

1. **Web 版冻结为对标基准线**：迁移期间不改 `src/` 的渲染代码，只允许改纯逻辑（Phase 0 搬移）。每个 Phase 的验收都以"与 Web 截图逐屏对标"为闸门。
2. **目标端为 web-desktop + 微信小游戏**，iOS/Android 原生包暂不列入本轮。
3. **工程目录名 `cocos-prototype/`**：Phase 6 之后是否更名（例如 `cocos/`）由你定，改名会牵动 `build:cocos` / `serve:cocos` / `sync:cocos` 三条脚本。
4. **布局台在 Phase 2 重定向**（而不是先做完屏幕再回头补工具）。理由：后面 13 屏的几何调整都靠它，早一期拿到工具，后面省的是"标注→猜像素"的循环。
5. **包体与远程资源策略延后到 Phase 6**，但它是发布阻塞项，不随本轮重写关闭。
6. **逐模块重写的推进节奏**：一个 Phase 一次提交、一次截图对标、一次你的确认。需要更快时可以合并 Phase 3/4，但风险是单次对标面变宽。

## 逐屏视觉对标挂账（2026-09-05，Phase 4 三屏同尺度对标）

证据在 `.probe/pair/`（该目录被 `.gitignore` 忽略，不入提交）：三屏 8 张 **560×996** 的 Web/Cocos 对照图、逐元素表 `table-*.md`、定点取色 `color-*.md`、描边四边覆盖率剖面 `resample.md`，汇总见 `report.md`（A/B/C = 16/10/7）。四类机制按处置分列：

- **S1 / S2 描边不出图（已修在一处共享出口）**：`ui/PanelKit.ts` 的 `flatBox().draw()` 原先走 `lineWidth/strokeColor/rect/stroke`，实测 Cocos 侧描边**可见宽度恒为 `lineWidth − 1.5` 设备像素**（w=1 → 0 像素、w=2 → 两行各 0.50、w=4/8/16 → 2.5/6.5/14.5 行，五点共线），故 1px 档 21 处整条消失、2px 档 5 处只剩半强度。顶点与索引都正常、颜色也没被覆盖，丢在光栅。现改成四条 `fill` 拼成 `OUTER(外扩 lw/2) \ INNER(内缩 lw/2)` 环带，与 Web `strokeRect` 逐像素同分布（w=1 摊两行各 0.50、w=2 铺满 1.00）。带描边实参的调用点共 27 处：commission 7、fusion 5、prestige 4、gacha 3、pass 2、shop 2、season 1、daily 1、gearup 1、heroes 1。
- **同一出口下本次未动的两处**：同文件的 `qualityBox`（描边宽 1.5px / 1px）与 `Plate.show`（1px）仍走 `Graphics.stroke()`，按上面那条 −1.5 定律它们的描边同样接近 0 像素。**待另单**，与 S3/S4 一起处理。
- **S3 文字基线整体偏低**：委托列表 35 行里 33 行比 Web 低 4~7px（22px 粗体标题差 −2）、面板态可分的 10 行低 4~6px、融合 18 行低 4~7px、赛季 6 行低 6~8px（钮题落到钮中心下方）。**记账待整界面翻新**。
- **S4 贴图被拉满节点盒**：两侧节点盒逐位相同，Web 保比例内接、Cocos 直接铺满 —— 立绘 1.39×/1.28×、碎片图标 1.38×/1.27×、羊皮纸底板 1.088×/1.115×、赛季徽标 1.26×/1.31×。**这一条否证了赛季单里"徽标源图非方被画进 48×48、两端同样横向压扁"的旧口径**（Web 实测墨迹只有 38×36）。**记账待整界面翻新**。
- **判据教训**：门 4 用「grep 产物里的模块私有函数名」判「改动有没有编进去」会**假阴**——打包器会改名，私有符号根本不留名。能定论的只有导出名、文案字面量与像素。

## Phase 5 死亡结算屏落地记

三层新文件：`game/ui/gameOverLayout.ts`（纯几何）+ `gameover/GameOverModel.ts`（内容与命中与写入意图）+ `gameover/GameOverView.ts`（只管节点）；接线在 `GameShell`（八件套：`buildGameOverScreen` / `gameOverSave` / `gameOverRun` / `resetGameOverTransients` / `openGameOver` / `syncGameOver` / `onGameOverAction` / `commitGameOverEcho`）、`core/ScreenRouter`（实际注册 14 屏、`sync*` 钩子 11 条）、`core/ViewTable.phase4`（22 档 `go*` 配色）。

- **进屏判据两端同一事实源**：Web 是 `onDeath()` 里那句 `state = "gameover"`；Cocos 侧 `BattleSim.onDeath`（由共享世界层 `onPlayerDown` 与 `onStageFailed` 两条事件汇流）已把 `world.over` / `pendingSettle` / 预计算回响 / 名次提示四件事做完并抛 `cb.onDeath`，宿主回调只有一句 `openGameOver()`。全仓 `openGameOver()` 调用点只有这一处。
- **三出口 + 两处广告位**：`重开` 复用 `restartRun()`（首行 `settlePendingRun` → 当前关带门控豁免重开、无限关重掷词缀）；`天赋` 就地 `settlePendingRun` 后 `openPrestige()`；`菜单` 就地 `settlePendingRun` 后 `router.show("menu")`。`看广告复活` 与 `广告 ×2 回响` 都走 `watchAd` 唯一入口，屏级 action 段不含 `adPending`（全文件闸门仍只有一道）。
- **休眠通路已激活**：54dc2a6 那条 `settlePendingRun` 通路此前没有触发面（工程里没有离开战斗屏的路径），本屏落地后正常游玩下阵亡即弹屏，`prestiges` 会真实累加，主菜单与其下挂的十一张屏由「选关 / 无限关 / 天赋 / 委托」四条正常路径可达，不再依赖探针直调 `shell.open*()`。

本屏照抄的 Web 怪癖（只列不改）：

1. **广告双倍 = 把同一笔回响结两次**：领取时 `settleEcho(pointsEarnedThisRun)` 入账，但既不清 `pendingSettle` 也不改 `pointsEarnedThisRun`，离开本屏时 `settleRun()` 用同一个数额再结一次；屏上「回响点数 +N」那一行领取前后不变，只有括号里的「累计」和钮的配色会动。
2. **「星尘 +…」那一行是死代码**：Web 的 `onDeath` 与 `startRun` 都把 `stardustEarnedThisRun` 写 0，唯一非零写入在 `victory()`，而胜利屏与死亡屏互斥。宿主按 `openGameOver` 同位写 0，两端同样取不到那一支。
3. **复活那一下不写任何账**：满血 / 无敌盾 / 清贴身 / `reviveUsed + 1` 都在世界层与会话态，`persist` 一次都没有；上限 = `1 + 不屈(1)`，当日天赋决定 1 或 2 次，`startRun` 清零、不入档。
4. **热区矩形在 Web 由上一帧绘制写入**（`restartBtn` / `talentsBtn` / `menuBtn` / `reviveBtn` / `doubleBtn` 都是 draw 里赋值的私有字段，共 6 笔赋值）；Cocos 侧几何是 `(w, h, 形态位)` 的纯函数，不存在「首帧未绘制 → 热区为空」这一族时序问题。双倍钮已领后热区仍然存在，只是那一支进不去。
5. **键盘 `T` 与点击 `T` 不同账**：Web 的 gameover 键盘分支 `this.state = "prestige"` 少了点击分支里那句 `settlePendingRun()`，靠下一个开局点兜底。Cocos 侧没有键盘通路，本屏只有点击那一条口（更严）。
6. **`gameover` 状态没有 Escape 出口**，三钮行就是返回出口；返回落点因此不是"回菜单"这一刀切，而是本屏真实的三个落点。
7. **三处钮内文字基线都是裸偏移**（`+21 / +28 / +22`），其中三钮行那一档与 `rowTextY` 不同源（996 档 `rowTextY` 给 496、Web 落 496.8）；「看广告复活(剩余 1 次)」按 15px 量出来比 220 的钮宽，Web 就是让它压出钮缘，所以本屏所有居中文本的限宽一律给整屏带宽，避免 `fitOne` 造出 Web 没有的「…」。

已知偏差与待办（不在本单修）：

- **体力不足时的回落**：Web 的 `restart()` → `startStage` 在体力不够时切到 `energy` 面板并把这次重开挂成闭包，Cocos 侧同一条口（见下一节「Phase 5 体力不足屏落地记」的开局漏斗）；死亡本账已在 `restartRun` 首行结清，领完体力续上开局时不会重复入账（`pendingSettle` 已清，漏斗自身不结算）。
- **广告 `onFail`**：Web 复活那一支没有 `onFail`（没看完就静默无事发生），本屏按派单口径补了轻提示（复活 / 双倍各一条），属于宿主侧新增反馈、不入账面。
- **背景与暗底**：Web 的 `render` 把战场与 HUD 都门控在 `state === "playing"`，所以阵亡屏是暗底压住 `bg_outside`；Cocos 路由切屏把战斗屏整棵隐藏，语义一致。暗底色值 `rgba(0,0,0,0.8)` 已进表，S3 / S4 那两类共享出口偏差（文字基线、贴图拉满盒、`Plate.show` 描边）在本屏同样存在，随上一节一起处理。
- **通关（victory）屏**：本屏落地时 `onVictory` 仍是空实现；现已由下一节的通关结算屏接上，两张结算屏共用同一套接线纪律与同一个广告闸门。

## Phase 5 通关结算屏落地记

三层新文件：`game/ui/victoryLayout.ts`（纯几何）+ `victory/VictoryModel.ts`（内容与命中与写入意图）+ `victory/VictoryView.ts`（只管节点）；接线在 `GameShell`（六件套：`buildVictoryScreen` / `victoryRun` / `openVictory` / `syncVictory` / `onVictoryAction` / `commitVictoryEcho`，并让 `resetGameOverTransients` 多清一项 `victoryInfo`）、`core/ScreenRouter`（实际注册 15 屏、`sync*` 钩子 12 条，`SCREEN_KEYS` 仍是 16 态全量，只剩 `energy` 没注册）、`core/ViewTable.phase4`（22 档 `vi*` 配色）。覆盖：`tests/cocos-phase5-victory.test.ts` 63 条 + 构建包探针 `.probe/probe-victory.js`。

- **账不在本屏**：Web 的 `victory()`(1704-1766) 与 Cocos 的 `BattleSim.victory()`(415-472) 早已逐字段对齐 —— 星数、每日首通翻倍、成长奖励、券、回响按 40/60 分账、星尘、装备掉落（重复折星尘）、解锁下一关、名次提示、`doubleClaimed` 复位十件事全在战斗层并当场落盘，然后一次性抛 `cb.onVictory(VictoryInfo)`。本屏读的就是那份 payload，模型里 `calcStars` / `CLEAR_REWARD_GROWTH` / `stageDropCount` / `generateEquipment` 出现 0 次，测试用一条源码守卫钉住"不许在屏上重算第二遍"。
- **进屏判据两端同一事实源**：Web 是 `victory()` 尾部那句 `state = "victory"`（全仓唯一），Cocos 是宿主回调那一句 `openVictory(info)`（全仓唯一，`router.show("victory")` 也只有这一处）。
- **两枚热区、一个广告位、落点是 menu**：Web victory 分支只有两支 —— 双倍回响（带 `!doubleClaimed` 前置）与底部条 `{x ∈ [w/2−95, w/2+95], y ∈ [h−62, h−18]}` → `backToMenu()`。返回钮因此接 `sim.settlePendingRun()` + `router.show("menu")`，不是 `battle` 也不是 `prestige`；除此之外本屏不响应任何点击。`settlePendingRun` 在通关路径上是恒空守卫（`victory()` 从不置 `pendingSettle`），按 Web `backToMenu` 同位带上。
- **本屏是唯一会读到非零本局星尘的屏**：`stardustEarnedThisRun` 在两端都只由 `victory()` 写非零（死亡路径与四个开局点都写 0），而通关与阵亡互斥，所以死亡屏那一支恒为死代码 —— 两张屏共用这条口径。屏上那一行星尘读 `stageReward.stardust`（与本源同数）。
- **照抄的 Web 口径四条**：① 双倍取数是 `pointsEarnedThisRun || stageEchoReward(currentStage?.id ?? 1)`，回落档读的是**关卡表基础值**（不带成长与首通倍率），而 `?? 1` 在通关屏上永远取不到（`victory()` 首行 `if (!st) return`），做成显式入参以便单测钉住无尽档；② 领取后 `settleEcho` 顺手把 `pointsEarnedThisRun` 改成本次 `total`，而屏上三行读数念的是 payload，于是领取前后纹丝不动、只有钮的配色与文字会动；③ 立绘 `player_pose_1` 挂在**屏心右侧**（`w/2 + 132`，死亡屏那枚是左侧 `w/2 − 196`），且本屏没有任何半透明贴图件（Web 这里一次都不动 `globalAlpha`）；④ 星数行的替代 ★/☆ 字形只在**第一枚**贴图缺失时才落（Web 的循环 `break` 使 `drawn === 0` 等价于首枚失败），关卡框那枚 `drawAvatarFrame` **没有代码回退形状**（缺图时提前 `return false` 且调用方不接返回值），与幻影榜那处的金圈分支不同形。
- **一处 Web 的画布状态泄漏被原样带上（本屏最大的反直觉项）**：`drawAvatarFrame` 成功分支结尾把 `g.textAlign` 复位成 `"left"`、并在框心那一笔里把 `fillStyle` / `font` 换成金 / `fs.micro` 粗体，而 `drawVictory` 在调用它之前设好的 `#c8b6ff / 16px` 之后再没被重设 —— 于是「解锁关卡框 · 第 N 关」那一行的实际外观取决于**框贴图到不到位**：有图（五档 `avatar_*` 在两端资源里都在，这就是线上档）走**金色 12px 粗体、以屏心为左起笔**，缺图才回到 `#c8b6ff 16px` 屏心居中。布局层把两档都算出来（`frameLineLeaked` / `frameLineFlat`，基线同一个 `a + 210`），视图按 `iconNode.show()` 的返回值取档；两端读同一份资源表故必然同档。探针直接把这一档钉成实机断言（`fontSize === 12 && isBold && horizontalAlign === LEFT && color === #FFD76A`）。
- **几何要点**：整屏仍是 `a = h × 0.3` 一族的十一处基线 + 两枚贴底钮（底边分别 `h − 82` 与 `h − 18`），两档之间锚线族平移 75px、贴底族平移 250px；**三枚奖励行的前置图标与关卡框的横向位置跟随文案量宽**（Web 的 `g.measureText(...).width`，Cocos 侧走 `PanelKit.approxW`），布局层因此把「行锚 + 边长 + 间距」与「量宽 → 矩形」分成两个出口（`victoryIconRect` 左上角锚 / `victoryBadgeRect` 框心锚，间距分别是 20 与 18 且都量在「文字左缘 ←→ 该点」之间）；星数行是**唯一一个随内容变枚数的几何族**，故 `stars` 是布局入参而非形态位，`canDouble` 则一律不改矩形（Web 的 `doubleBtn = dbl` 无条件赋值）。本屏没有面板底，`rgba(8,10,16,0.86)` 那一笔就是全部背景（与死亡屏的 `rgba(0,0,0,0.8)` 不同值）。

挂账与待办：

- **`energy` 屏已接上**：`SCREEN_KEYS` 的 16 把键至此全部有屏，体力不足时的开局（含死亡后的重开）会挂起并切到 `energy` 面板，详见下一节。
- **本屏没有键盘出口**：Web 的 victory 键盘分支 `r` / `m` 都只走 `backToMenu()`，与底部条同落点；Cocos 侧没有键盘通路，本屏只有点击那一条口（更严）。
- **共享出口的三类视觉偏差在本屏同样存在**：S3 文字基线偏低、S4 贴图拉满盒、`Plate.show` 残余描边（见上一节「逐屏视觉对标挂账」），本轮按既定口径不动、不开新单。

## Phase 5 体力不足屏落地记

三层新文件：`game/ui/energyLayout.ts`（纯几何）+ `energy/EnergyModel.ts`（内容与命中与写入意图）+ `energy/EnergyView.ts`（只管节点）；接线在 `GameShell`（`buildEnergyScreen` / `energySave` / `enterBattleRun` / `requestStage` / `requestEndless` / `openEnergy` / `syncEnergy` / `onEnergyAction` / `commitEnergyAd` / `commitEnergyDiamond` / `continueEnergyPending` / `tickEnergy`）、`core/ScreenRouter`（实际注册 16 屏、`sync*` 钩子 13 条，与 `SCREEN_KEYS` 的 16 态全量配平）、`core/ViewTable.phase4`（22 键 `en*` 配色）。覆盖：`tests/cocos-phase5-energy.test.ts` 60 条 + 构建包探针 `.probe/probe-energy.js` 51 条（996 档，独立 profile、`CDP_MATCH` + `CDP_GOTO`、自举等待 12s）。

- **本屏是「开局被挡住」才出现的屏，所以出口是续上那次开局**。Web 的两条进屏路径都在体力闸门那一支：`startStage(id, bypassGate)` 挂 `() => this.startStage(id, bypassGate)`、`startEndless()` 挂 `() => this.startEndless()`，并把 `state` 切成 `"energy"`。Cocos 侧同位做成一对**开局漏斗** `requestStage` / `requestEndless`：成功就走 `enterBattleRun()`（清会话态 + 换背景 + 切战斗屏，对标 Web `startRun()` 尾部那句 `state = "playing"`），失败就把这次开局挂成 `energyPending` 闭包并弹本屏。三个开局入口（菜单关卡行、菜单无限关、`restartRun` —— 后者同时是商店重开、转生「开始新轮回」与死亡屏「重开」的共用出口）全部走这一对漏斗，所以「第一次点」与「领完体力续上」在结算、复位、换背景、切屏这四件事上没有第二份实现。`energyPending` 是宿主持有的**瞬时闭包、不入档**（`SaveData` 里没有这一项）。
- **`settlePendingRun` 留在三个调用点，漏斗自己不结算**（与 Web 完全同位：Web 的 `startStage` 里也没有这一句，是点击分支与 `restart()` 首行在结）。于是挂起的开局在领完体力后重跑漏斗时只重跑「门控 + 体力 + 开局」那一段，不会重复结算死亡账。测试 `tests/cocos-settle-pending.test.ts` 把「六处入口各一次、且都排在开局请求之前」与「漏斗体内不含结算」两条钉死。
- **进屏判据全工程只有一处 `router.show("energy")`**：`openEnergy()`，且只被那两条漏斗的失败分支调用；`GameShell.buildBattle()` 里 boot 那一发 `if (!this.sim.startStage(1)) this.sim.startEndless();` 仍是直接调战斗层（刚启动时挂起标记必为假、也不需要弹补体力屏），这一支按原样保留。
- **返回落点是本屏真实入口决定的两支**：广告与钻石两支领完即 `continueEnergyPending()` —— 有闭包就跑它（切战斗屏），没有就 `router.show("menu")`（Web 同一句 `if (act) act(); else this.state = "menu"`）；关闭与返回两支完全同效，`energyPending = null` + 回主菜单，Web 就是写了两个出口（右上角返回钮 + 钮列末尾关闭钮），本层不合并、也不改成"回上一屏"。热区顺序也照 Web：返回 → 广告 → 钻石 → 关闭，四片矩形互不相交。
- **两个形态位都不改一枚矩形**，所以本层是十六屏里唯一一个 `layout(w, h)` 无形态入参的屏：`canAd`（今日广告余量 > 0）与 `canDiamond`（钻石 ≥ 价）只换配色档、文案档与"要不要试 `btn_primary` 贴图"这三件事。两处守卫都在**命中之后**（Web 的 `if (adCount >= LIMIT) return;` / `if (diamond < COST) return;` 都在点击分支里），所以模型层照样返回 `ad` / `diamond` 动作，静默发生在 `energyAdClaim` / `energyDiamondClaim` 的守卫里；测试与探针都按这个分层写（用尽与不足时 `adWatchCount`、`energy`、`energyAdCount` 三数全不动，`adPending` 仍是 `false`）。
- **两支领体力的口径不同**：广告是 `Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN)` 累加（贴顶时只补到顶，探针实测 18 → 20 只补 2 点），并记 `energyAdCount += 1`；钻石是先扣 `ENERGY_DIAMOND_COST`、再 `syncEnergy()`、然后 `energy = ENERGY_MAX` 直接置满，不记广告次数。两支都在自己的 `commit*` 里落一次盘，然后 `continueEnergyPending()`。自然恢复那一步转调战斗层同位出口 `sim.syncEnergy()`（= Web `syncEnergy`，同一支共享层 `regenEnergy`）。
- **本屏没有倒计时读数**：Web 那一行是 `体力 N/MAX · 每 ${ENERGY_REGEN_SECONDS / 60} 分钟恢复 1 点`，念的是**恢复节奏**（当前表值 360 秒 → 6），除的是共享层常量、不取整。屏上那个 `N` 会自己往上跳，是因为 Web `drawEnergy` 首行调 `syncEnergy()` 且逐帧重绘；节点化后由 `GameShell.tickEnergy()` 接上（挂在主循环的路由闸门之前、与 `tickToast` / `tickCommission` 同位，只在本屏现取、只在真的多了一点时重排一次）。探针实测：停在屏上把时间戳摆到 3 点差 1.5 秒，2.8 秒后读数与内容层同串（1 → 4）。与 Web 同口径的一点是：**自然恢复只改内存不落盘**（`persistSave` 不在 `syncEnergy` 里），要等下一次写入（开局或领取）才带上，探针把这前后两拍都钉住了。
- **递归那一支实机可达**：`ENERGY_AD_GAIN`(5) 恰好等于第 1 关的 `stageCosts[0]`(5)，所以"领完一次仍然不够"只在消耗更高的关卡上才可达 —— 探针把 `highestStage` 摆到 5（`stageUnlocked` 的 `stageId <= highestStage` 那一支）后点第 5 行（消耗 7），实测第一次广告后仍留在本屏（读数 5、余量剩 4 次、闭包仍在），第二次广告才续上开局并落 3 点。
- **体力五支常量全在共享层 `game/data/daily.ts`**（`ENERGY_MAX` / `ENERGY_REGEN_SECONDS` / `ENERGY_AD_GAIN` / `ENERGY_AD_LIMIT` / `ENERGY_DIAMOND_COST`，可被 `balance.json` 的 `energy` 段覆盖，当前表值 20 / 360 / 5 / 5 / 10 与代码默认逐项相同），布局层与模型层都不出现它们的抄本；关卡与无限关的消耗（`stageCosts` / `endlessCost`）只在战斗层的闸门里用，本屏不读。
- **底板事实**：本屏**有面板底** —— Web 先一笔全屏暗底 `rgba(8,10,16,0.92)`（与赛季屏同值、与通关屏的 0.86 与死亡屏的 0.8 都不同值），再 `panelPad(g, w, h)` **不传专属键**，即 `panel_dark_corners` 九宫格铺满 `[pad, w − pad] × [pad, h − pad]`（切深实参 32 在 Cocos 侧由 `ViewTable.borderOf` 按图推导，`EN_PANEL_NINE` 与已落地各屏的同类常量一样没有消费者，只是把 Web 实参留在几何旁供断言与翻新取用）。标题横幅 `banner_mid_black` 是裸 `assets.draw` 的**整幅拉伸且不接返回值**（没有缺图回退档，缺图收成零位盒、文字照落位）；三枚钮里只有广告与钻石两枚在**可用档**试 `btn_primary`（Web 的 `canX && skinButtonBase(...)` 短路掉了禁档的贴图分支，视图因此给禁档传空键），关闭与返回两枚全是纯代码矩形。本屏没有半透明贴图件。
- **几何要点**：两条纵向锚线 —— 文字族 `a = h × 0.3`（横幅 / 标题 / 读数 / 提示）、按钮族 `bt = h × 0.42`（三枚钮 `bt + 0 / +62 / +118`，高依次 52 / 46 / 40、钮间距恒 10、钮心恒屏心），另有屏幕角锚的返回钮 `{w − pad − 72, 22, 72, 34}` 与屏高无关。两档之间文字族下沉 75、按钮族下沉 105、返回钮不动，族间空档随屏高线性放大（61.52 → 91.52，差 30 = Δh × 0.12）；四处钮内文字基线**全走 `rowTextY`**（996 档实测 449 / 508 / 561，返回钮 43），与死亡、通关两屏的裸偏移口径不同。七处字号 22 / 14 / 13 / 14 / 13 / 14 / 13 全在 `fs` 表内 —— 本屏是结算两屏之后第一个没有 Web 表外字号档的屏。
- **一条跨层新纪律**：派单点名的那类缺陷（视图用到某个布局出口但 import 清单漏了它，门 3 的 `error TS = 0` 照样放行、只有实机进屏才炸）在本单被钉成断言 —— `missingImports()` 拿被测文件的代码体与它的 import 清单对账，对 `energyLayout` / `EnergyModel` 的每一个出口，凡在体内出现就必须出现在清单里；同一把尺子反向量已落地的 `VictoryView`（含曾经漏掉的那枚 `victoryBadgeTextLine`）。energy 屏自身的实机证据也在：探针 51 条里第一组就是进屏与七处文字上屏。

挂账与待办：

- **宿主侧新增一条轻提示**：`广告未看完,体力未入账` 是本屏 `watchAd` 的 `onFail` 文案，Web 的 `onEnergyClick` 没有 `onFail`（没看完就静默无事发生）。这条与已落地各屏的同类提示（复活 / 双倍 / 每日 / 扭蛋 / 委托各一条）同口径，属于宿主侧新增反馈、不入账面，因此**门 4 的双命中扫描面只含本屏三层**（13/13 全配对），宿主分节单独出诊断行。
- **本屏没有键盘出口**：Web 的 `daily / energy / gearup` 共用一条 Escape → `state = "menu"`，且**不清 `energyPending`**；Cocos 侧没有键盘通路，两支放弃出口都清挂起，比 Web 更严。
- **1246 档在构建包实机上进不去**（同转生 / 委托 / 融合 / 赛季屏挂账），探针只在 996 档写断言，那一档由纯函数矩阵覆盖（`tests/cocos-phase5-energy.test.ts` 的 1246 段：锚线 373.8、按钮族顶 523.32、三处基线 554 / 613 / 666、返回钮逐位相同）。
- **共享出口的三类视觉偏差在本屏同样存在**：S3 文字基线偏低、S4 贴图拉满盒、`qualityBox` / `Plate.show` 残余描边（见「逐屏视觉对标挂账」一节），本轮按既定口径正常调用这些出口、不对齐也不绕过、不开新单。

## Phase 5 二次确认弹层落地记

新文件两件:`confirm/ConfirmModel.ts`(几何 + 内容 + 命中,cc-free)与 `confirm/ConfirmView.ts`(唯一节点层)。**本件没有第三层布局文件** —— 与十六屏「共享层一张布局函数」的范式不同,这里的盒与两枚钮的矩形**整体转调共享层 `game/ui/theme.ts:confirmRects(w, h)`**(97 行,`CONFIRM_W 360 / CONFIRM_H 170 / CONFIRM_BTN_W 150 / CONFIRM_BTN_H 44 / CONFIRM_BTN_GAP 14`,`btnY = by + CONFIRM_H − 16 − CONFIRM_BTN_H`),而那一份**就是 Web `confirmLayout()` 的返回值本体**(Web `src/game.ts:1198` 也是直接 `return confirmRects(this.logicalW, this.logicalH)`),所以模型层不重算、也不抄写其中任何一个数;模型层只补 Web `drawConfirm`(1208-1240)里那些**内联在绘制代码中**的几何:标题横幅盒 `(b.x+14, b.y+10, b.w−28, 30)`(九宫切深 13)、标题基线 `b.y+30`、正文两行档 `b.y+67` / `b.y+89` 与一行档 `b.y+80`、两枚钮内文字基线 `y+h/2+4`(确认)与 `y+h/2+5`(取消)。接线在 `GameShell`(四件套:`buildConfirmLayer` / `openConfirm` / `syncConfirm` / `onConfirmAction`,外加 `confirm` 与 `confirmFrame` 两个字段、商店右上角工具钮的 `restart` / `home` 两支改走确认)、`core/ScreenRouter`(**一枚键都不加**,见下)、`core/ViewTable.phase4`(13 键 `cf*`)。覆盖:`tests/cocos-phase5-confirm.test.ts` 70 条 + 构建包探针 `.probe/probe-confirm.js` 46 条(996 档,独立 profile、`CDP_MATCH` + `CDP_GOTO`、自举等待 12s;定版截图 `.probe/cocos-p28-confirm-open-560.png`)。

- **本件是一层覆盖层,不是一张屏,所以不挂路由**。`SCREEN_KEYS` 仍是 16 态、路由实际注册仍 16 屏、`sync*` 钩子仍 13 条,一件都不加:Web 的 `if (this.confirm) this.drawConfirm(...)` 是 `render()` 的**最后一步**(1927),覆盖在所有屏之上且**不随 `state` 切换消失**,挂进任何 `Screen:<key>` 都会在切屏那一刻跟着 `active = false` 一起没掉。弹层节点挂在 `Overlay` 常驻层上(与轻提示 toast 同一条通路,`buildLayers` 里 `Overlay` 建出之后紧跟着装配),探针实测祖先链是 `ConfirmView < Overlay < World < Canvas < Main`、一个 `Screen:` 节点都没有,并且切到主菜单与战斗屏之后弹层仍 `activeInHierarchy === true`、挂着的闭包一次都没跑。
- **点击拦截排在所有屏级热区之前,靠的是两件事**:① 引擎的触摸派发按兄弟序自上而下取第一个命中就 `break`(`2d/event/pointer-event-dispatcher.ts` 的 `dispatchEventTouch`,且 TOUCH_END 只发给 TOUCH_START 时 claim 过的节点),而 `Overlay` 是 `World` 的末子节点(兄弟序 1,晚于 `Screen` 的 0),所以弹层开着时它那张整屏 Capture 先于任何屏级 Capture 拿到 TOUCH_START,屏级热区连 claim 都拿不到;② Capture 的回调里显式 `propagationStopped = true`,并且**`hitConfirm` 给 `null` 也照样吃掉这一下**(Web `src/game.ts:562` 那一段末尾是无条件 `return`,不落到下面的屏级分发)。探针把这条钉在弹层开着时合成点击打刷新钮 / 武器行 / 下一章钮 / 屏角 / 盒内空白上:金币、货品、刷新计数、选中态、当前屏全不动,弹层仍开。
- **几何分界与两档矩阵**:盒 `{100,(h−170)/2,360,170}`、确认钮 `{123,by+110,150,44}`、取消钮 `{287,by+110,150,44}` 三枚整体来自 `confirmRects`(钮行底边距盒底 16、左右留白各 23、间距 14);横幅与七处基线是上文的内联数。996 档横幅 `{114,423,332,30}`、标题基线 443、正文一行档 493、两行档 480 / 502、确认钮文字 549、取消钮文字 550;1246 档**每个矩形与每处基线都整体平移 Δh/2 = 125**,横向与宽高逐位相同(盒是屏幕居中、不是角锚),盒内相对几何两档逐位相同 —— 本件没有一条随屏高伸缩的锚线,也不调 `spreadRows` / `rowTextY`。两条反直觉的 Web 原样:**正文最多画两行**(折出三行以上时第三行起根本不画,不是缩字号也不是滚动)与**一行档 / 两行档是两套不同基线**(一行档 `+80` 正好落在两行档中缝 `+78` 附近而不是 `+67` 那一条),测试用「折出四行只取前两行」与「0 / 1 / 2 / 3 行四档下盒与钮逐位相同」两条钉死。
- **量字与折行**:正文按 `b.w − 40`(= 320)折行,算法逐行对标 Web `src/game.ts:5308-5322` 的 `fitLines`(逐码点试探、已有内容才断行、末尾余行补推)。Web 量字用 `ctx.measureText`,Cocos 侧没有 Canvas2D,而宿主侧那一份近似量字 `ui/PanelKit.approxW` 住在引了 `cc` 的文件里、cc-free 的模型层不能 import,于是量字函数 `measure` 做成**入参**:宿主注入 `approxW`,模型层不复制那两个系数(0.55 / 0.3)、也不另写一套。折行发生在模型层而不是视图层,是因为**正文条数会改基线档**(一行 `+80` / 两行 `+67`·`+89`),「量字 → 折行 → 基线」是一条几何链;视图只做 `fitOne` 那一道截断。两条真实文案(20 字与 16 字)在「每个字符都按 CJK 全宽」这个最保守口径下也都是一行(280 / 224 ≤ 320),所以实机只走一行档,近似量字与真实 `measureText` 的差在本件不构成端间分歧。
- **命中与执行顺序照 Web 逐字**:先确认钮、再取消钮,两段之外一律 `null`;确认命中是 `const ok = this.confirm.ok; this.confirm = null; ok();` —— **先清空再执行**,所以闭包里再切屏(重开可能弹体力屏、回主页切菜单)时读到的是已收掉的弹层;取消只清空、不执行任何闭包。两个触发点都在商店右上角工具钮,文案逐字照抄 Web(`确定重开本局?当前章节进度与金币将丢失。` 与 `确定返回主菜单?本局进度将丢失。`,问号半角、句号全角),确认后执行的仍是原来那两个调用(`restartRun()` / `closeShop(false)`),弹层自身一个存档字段都不改、也没有 `commit*`。
- **底板与配色**:全屏暗底 `rgba(0,0,0,0.62)`(十六屏里唯一一个纯黑、也是不透明度最低的一档);盒底垫 `panel_dark_corners` 走 `drawNine` 的九宫格(切深 32,缺图回退 `panel()` 的代码底板 + `#ffd76a` 描边);标题横幅 `banner_mid_navy` 同样是九宫格(切深 13)且 **Web 显式写了缺图回退**(平面 `rgba(18,24,44,0.88)` + 1px `rgba(255,215,106,0.35)` 描边)—— 与体力屏那枚「整幅拉伸且不接返回值」的横幅不同档,所以视图用 `Plate` 而不是 `iconNode`;确认钮 `btn_danger`、取消钮 `btn_minor` 都是贴图优先、缺图退各自的代码底板,**本件没有任何形态位**,两枚钮恒试贴图。四枚键在 `ASSET_MANIFEST` 与两端资源目录里都在,探针实测四个 Sprite 全部 `enabled && spriteFrame` 到位。表现项进 `phase4` 段的 `cf*` 共 13 键(暗底、盒底垫回退两件、横幅回退两件、标题、正文、两枚钮各三件),默认值逐项对标 Web 字面量,已有键一枚未动。
- **两枚钮的文字档不对称,是 Web `themePaint` 的原样**:确认钮 `dangerButton` 用 `F(fs.muted)`(13px **不粗**)、取消钮 `minorButton` 用 `F(fs.body, true)`(14px **粗**),标题 `F(fs.body, true)`、正文 `F(fs.body)`;两枚钮的文字基线走裸偏移 `+4` / `+5` 而不是 `rowTextY`(同档实参下 `rowTextY` 会给 `+26` / `+27`,差 4px 与 5px),与死亡 / 通关屏那两枚贴底钮同口径、与体力屏「四处全走 `rowTextY`」不同口径。
- **一处 Web 有而 Cocos 没有的出口**:Web 的 `onKey`(754-755)在 `confirm` 非空时只认 Escape → 清空并**整段 return**(弹层期间键盘的其余分支也一并失效);Cocos 侧没有键盘通路,这一支不迁,与体力屏同口径 —— 也就是 Cocos 比 Web 少了这条键盘出口,放弃只能点取消钮。
- **与 toast 的相对层级**:toast 节点是**懒建**的(第一次 `toast(...)` 才挂到 `Overlay` 上),若它先于弹层建出来就会压在暗底之上;Web 的 `drawConfirm` 是 `render()` 的最后一步、压过一切,所以 `syncConfirm` 在每次开层时把弹层顶到 `Overlay` 末位(`setSiblingIndex(children.length − 1)`,渲染与触摸派发都按兄弟序,一并跟上)。探针先 `toast(...)` 再开层,实测弹层兄弟序 == `Overlay.children.length − 1`。
- **接线计数不变**:路由一枚键都不加(上文),全文件 `if (this.adPending) return;` 仍只有 `watchAd` 首行那 1 处、弹层分节里一个 `adPending` / `watchAd` / `showRewardedAd` 都没有(本件没有广告位),屏级 action 段也没有被塞进「弹层开着就 return」这类早退;`buildLayers` 里装配点排在 `Overlay` 建出之后、14 处 `build*Screen()` 全部之后。

挂账与待办:

- **本件没有键盘出口**(见上,Web 的 Escape → 清空那一条不迁)。
- **1246 档在构建包实机上进不去**(同转生 / 委托 / 融合 / 赛季 / 体力屏挂账),探针只在 996 档写断言,那一档由纯函数矩阵覆盖(`tests/cocos-phase5-confirm.test.ts` 的 1246 段:盒 `{100,538}`、横幅 `{114,548}`、两枚钮 y 648、标题基线 568、正文一行档 618 / 两行档 605 / 627、两枚钮文字 674 / 675,与 996 档逐位差 125)。
- **共享出口的三类视觉偏差在本件同样存在**:S3 文字基线偏低、S4 贴图拉满盒、`Plate.show` 残余描边(见「逐屏视觉对标挂账」一节),本轮按既定口径正常调用这些出口、不对齐也不绕过、不开新单。
- **跨层纪律一条**:门 5(`npm run typecheck:cocos`)之外,`tests/cocos-phase5-confirm.test.ts` 的 `missingImports()` 继续做「代码体与 import 清单对账」—— 对 `ConfirmModel` 的每一个出口,凡在 `ConfirmView` 或 `GameShell` 的代码体里出现就必须出现在各自的 import 清单里(`ui/PanelKit` 那一份引了 `cc` 不能直载,故手列出口名交给同一把尺子),同一把尺子反向量已落地的 `EnergyView` / `VictoryView` 与 `GameShell` 的 energy 出口;视图层另有「数字只允许 0 / 1 / 1.25 / 2」与「不出现 `rowTextY` / `confirmRects` / `CONFIRM_*` / 折行函数」两条源码守卫。
