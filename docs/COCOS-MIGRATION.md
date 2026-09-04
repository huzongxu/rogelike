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

**Cocos 侧接线点**：`GameShell.PENDING_SCREEN` 剩三条占位轻提示（`commission` / `talent` / `fusion`，菜单入口在 `onMenuAction` 分发、融合在商店工具钮分发），已落地屏逐屏换成真实 `router.show(...)`；`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 为 16 态全量，路由实际注册 battle / menu / shop / heroes / leaderboard / daily / pass / gearup / gacha 九屏。`drawAvatarFrame` 住在 Web 侧 `src/ui/skin.ts`（Canvas2D），不在共享层 —— 排行屏的关卡框徽标按 Phase 3 立绘同款处置：贴图优先、缺图回退代码形状。

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
| 融合 fusion | **仅商店右上工具钮**（装备 ≥ 2），`openFusion("shop")` → `overlayFrom = "shop"` | Esc（无 `pendingHidden` 时）或钮 → `overlayFrom`，实际恒回 shop | 行数 = `player.equipment.length`（槽上限随 `slot1/2` + `extra_gear` 增长，局内态非存档）；底部面板三形态：未选提示 / 双选预览 / 三选且 `tripleUnlocked`（天赋 ≥ 6）三重面板 | 否 | 无 | `stardust`(-cost)/`fusionPity`/`collection`；成品入 `player.equipment`（不落盘） | 无动画；保底 `HIDDEN_PITY_N` 触发 `drawHiddenChoice` 弹层（Esc 被禁、只响应卡片）—— 该弹层属 Phase 5 |
| 赛季 season | **无手动入口**：`syncSeason`（任意状态跑）检出 `seasonStartAt` 满周期 → 写 `seasonSummary`，仅当 `state == "menu"` 时自动弹 | Esc 或钮 → `closeSeason` → menu | 单面板 + 贴底按钮；数值取翻页瞬间的 `seasonScore(stageStars, seasonBest)` | 否 | 无 | 写入发生在**进屏前**：`stardust`+ / `seasonId`+1 / `seasonStartAt` 顺延 / `stageStars` 清零 / `seasonBest = 0` | 无 |

**验收**：每屏一张对标截图（`.probe/web-p4-*.png` 为 Web 基准，684×1217 同口径）+ 一次完整交互闭环（进入 → 操作 → 返回，`overlayFrom` 语义正确）；广告位 `adBusy` 期间世界不推进。逐屏的结构断言按上表的门控变量分档写（例：排行屏行数 = `PHANTOM_COUNT + 1` 且玩家行插位等于 `rankAmong`；升级屏行数 = `min(ownedGear, 14)` 且超出时出现截断提示），不写死数字。几何抽出的纯布局函数须与 `draw*`/`hit*` 同源，并按 Phase 3 的口径断言每条文本带落在 `0..560`。

**派单顺序（一屏一单，子 agent 150 turn 上限扛不住多屏）**：排行 → 每日 → 通行证 → 升级 → 扭蛋 → prestige → 委托 → 融合 → 赛季。理由是先用只读零写入的排行屏把"抽纯布局 + Cocos 视图 + 路由增键 + 热区分发 + 测试"这条链跑通，再依次引入广告与写入、文字测量截断、溢出风险、条件块压缩、实时时序、跨屏 `overlayFrom`，最后做没有手动入口、需要构造触发条件的赛季屏。

**已落地两屏与 Web 的已知分歧**（均为有意）：排行屏的关卡框徽标按 Phase 3 立绘同款处置（`avatar_<品质>` 贴图优先，缺图回退代码金圈 + 框心数字）。每日屏要用的五个贴图键（`banner_title_gold_c` 标题横幅、`player_pose_2` 装饰立绘、`badge_gem_purple` 资源行图标、`btn_minor` 行底板、`btn_primary` 补领底板）在 `ASSET_MANIFEST` 与 `resources/textures/` 里都在，一律贴图优先，三条缺图回退分支与 Web 同语义（横幅缺图 → 标题从"横幅内居中、基线 36−4"切到 `themePaint.header` 那一档"左起笔于 pad、基线 36"；图标缺图 → 文本从 `pad+13+4` 回到 `pad` 并前置「◆」；行底板缺图 → `rgba(255,255,255,0.05)` 底 + `rgba(255,255,255,0.15)` 描边）。两处照抄 Web 而非照抄排行屏：每日屏的返回钮是纯色 rect（`#2a3d55` + `rgba(255,255,255,0.3)`）而不是 `skinButtonBase`，所以不挂贴图；已领行恒走代码形状，因为 Web 的 `claimed || skinButtonBase(…)` 把贴图分支短路掉了，Cocos 侧给 `Plate` 传空键得到同一结果。三处口径差：Web `skinButtonBase` 的圆角实参（普通行 8 / 补领行 10）在 Cocos 侧没有消费者，九宫格边距走 `nineSlice.keys`（`btn_minor`/`btn_primary` 均为 71），与 Phase 2 已记的"边距值只在 Cocos 侧产生实际效果"同类，原值作为档位差留在共享布局的 `DL_ROW_PLATE` / `DL_MAKEUP_PLATE` 里供断言与取键；每日屏的几何常量（`listTop 92`、`labelH 24`、行高钳制 46–92、两行文本的 18px 固定行距、两种底板档位）住在共享层 `game/ui/dailyLayout.ts` 的具名常量里而不进 `viewTable` 的 `phase4` 段 —— 共享层读不到 import 了 `cc` 的 `core/ViewTable.ts`，同一个数放两边就成了两个事实源，`phase4` 段收的是纯表现项（键前缀 `dl`：覆盖底、两组区标签色、未领与已领三档的底/描边/文字色、补领两档、返回钮三色、资源行替代字形），默认值逐项对标 Web；Web 的 `fillText` 不限宽，Cocos 侧每段文本带都给了 `maxW`（名字与描述收到右对齐状态起笔前 10px，缺图档标题收到返回钮前 10px），超宽由 `fitOne` 截断补「…」，与排行屏同款。

**已落地两屏的宿主接线差异**（不是画面分歧）：激励视频收敛成 `GameShell.watchAd(onOk, onFail?)` 一个入口，语义逐项对标 Web `game.ts:watchAd` —— 在途期间不接受第二次点击，看完先记一次 `adWatchCount` 并在 `DIAMOND_AD_DAILY` 之内发 `DIAMOND_PER_AD` 钻石、落一次盘，再调 `onOk` 发本屏奖励，平台分流仍在 `core/AdChannel.showRewardedAd`。Phase 3 的回响筹码原先自己走一遍 `showRewardedAd` 且不回写 `adWatchCount`，现在改为调这一入口，于是点回响筹码也会让每日屏的"今日广告 N 次"+1 并在上限内 +1 钻。每日重置原先只随 `BattleSim.update()` 跑，而壳层在非战斗屏整帧早退（`router.blocksPlay()`），停在菜单或每日屏跨天就永远不清零、本屏会一直显示"已领取"；现在 `BattleSim.syncDaily()` 被提到路由闸门之前逐帧调，与 Web `update()` 里"任何状态下都执行"同口径，真的改了存档时顺带重排每日屏与主菜单的每日红点。

**待界面翻新统一处理的画面偏差（本轮不修）**：每日屏七行的行底板装饰翼与行内文字存在可读性差 —— 名字下方那行描述（如 `扭蛋券 ×2 + 星尘 ×10`）与右对齐状态文字（`▶ 广告开启` / `免费领取`）会被本行贴图的左右装饰翼压住，读起来比基准吃力。布局侧已用实测排除：`plateBoxH` 与 `rowH` 同为 92、底板矩形就是行矩形、行间隔 20，上一行描述基线 y814 与本行底板顶缘 y770 之间净空 44，**没有跨行压字**；文本基线与 Web 共用同一份 `dailyLayout`，两侧同数。差异落在**九宫格 `slice` 的渲染口径**：Cocos 按 `nineSlice.keys` 的边距（`btn_minor` / `btn_primary` 均 71）切图，装饰翼保留接近贴图原始的比例；Web `skinButtonBase` 画进同一个行矩形时翼更收敛。整界面翻新会重出这批行皮肤与边距，届时一并处理。复核入口：同尺度对标图 `.probe/cocos-p4-daily-684.png` 对 `.probe/web-p4-daily.png`（都是 684 宽、设计 560×996），探针判据是逐行取 `getComponent('cc.UITransform').getBoundingBoxToWorld()` 的盒高与 `rowH` 对比。构建包侧的运行时账（26 枚标签全 active、`minLeft 14 / maxRight 536` 无越界、三种领取的存档增量与 `localStorage['echo-abyss-save-v1']` 落盘）已逐项实测通过。

**本期尚未核实、动到该屏前要先测的**：`startNewRun → restart` 是否必然使 `save.prestiges + 1`（`+1` 写在 `settleRun`，调用链未逐行核）；装备槽上限中 `extra_gear → runSlotBonus` 的注入路径；委托时长文案与 `COMMISSION_MAX_HOURS`、衰减曲线参数的一致性。

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
