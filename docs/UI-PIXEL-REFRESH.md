# UI 像素暗黑风格基准（翻新线）

本文档是 Cocos 侧 UI 视觉翻新的**唯一风格事实源**。逐屏落地，每落地一屏就把该屏的「换皮」列勾上；布局重排单独立项，与本表分行。

适用范围：`cocos/`。Web 自研 Canvas 版（`src/` + `public/assets/`）是冻结基准，不随本翻新变动。

---

## 1. 像素网格约定

| 项 | 值 | 事实源 |
| --- | --- | --- |
| module（1 art px 对应的逻辑 px） | 2 | `artwork/pixel-kit.json` `module` |
| export（PNG 相对 art 网格的落盘倍率） | 1（默认）／2（走九宫格的 key） | `artwork/pixel-kit.json` `export` 与逐格 `export` |
| 采样 | NEAREST / NEAREST + CLAMP_TO_EDGE | `cocos/assets/scripts/GameShell.ts:loadFrames()` |
| 几何 | 节点坐标与尺寸取偶数，落在 art 网格上 | 布局表 `cocos/assets/scripts/game/data/layoutMenu.ts` |

- 像素 key 的判定是一份纯数据清单：`cocos/assets/scripts/game/data/pixelArt.ts`（`PIXEL_ART_KEYS` / `isPixelArtKey()`）。清单只放数据，`setFilters()` 调用留在 GameShell 侧 —— `game/**` 受 `tests/shared-purity.test.ts` 约束，禁止 import `cc`。
- 非清单内的旧图保持导入器给的采样，不做全局改写。
- **走九宫格的 key 必须 `export: 2`**。Cocos 的 `SlicedSpriteAssembler` 按「inset 贴图像素 = inset 逻辑像素」画切边带，缩放系数 `S = min(1, 节点尺寸 ÷ 边距和)` 只会缩不会放，GPU 最近邻放大只作用在拉伸带与 SIMPLE 整图 sprite 上。因此九宫格贴图的 art 网格必须烘进 PNG，否则切边带会掉到 1 逻辑 px 的细颗粒，与 module=2 的图标对不上。
- 副作用可用作自检：把采样从 LINEAR 换走，该 SpriteFrame 就自动退出动态图集（`DynamicAtlasManager.insertSpriteFrame` 只收 LINEAR/LINEAR 的帧），不需要动 `SpriteFrame.packable`。

## 2. 深渊蓝黑调色板（33 色）

事实源 `artwork/pixel-kit.json.palette`，量化 + Bayer 抖动一律向这 33 色收敛。

| 组 | 色值 |
| --- | --- |
| 深渊蓝黑基阶（7） | `#05070c` `#0b0e14` `#121826` `#1a2233` `#232e44` `#2a3548` `#38465e` |
| 阶调与高光（6） | `#4a5a76` `#62738f` `#8391a8` `#a9b4c4` `#c8cdd6` `#e8ecf4` |
| 回响·翠（4） | `#0e3b36` `#17624f` `#2e9e7f` `#4dffc8` |
| 神秘·紫（4） | `#2b1f47` `#4b3a7a` `#8a6fd1` `#c8b6ff` |
| 黄金（4） | `#4a3410` `#8a6220` `#d9a63c` `#ffd76a` |
| 危险·赤（4） | `#3a1218` `#7a1f2a` `#c0374a` `#ff5a6e` |
| 寒冰·蓝（4） | `#10294a` `#1f4e8a` `#2f7fd1` `#4aa3ff` |

品质五色（common / rare / epic / legendary / hidden）**继续由代码 tint 承担，不进入贴图**：贴图统一按中性阶出图，运行时用 `Sprite.color` 上色。这条与 `cocos/assets/scripts/ui/Widgets.ts:HEX` 的既有品质色保持同一出口。

## 3. 九宫格切边规范

- `slice` 以 **art px** 计，写在 `artwork/pixel-kit.json` 的格子上；`viewTable.nineSlice.keys` 里写的是**逻辑 px 边距 = slice × module**。
- 生效链路：`cocos/assets/resources/config/viewTable.json` `nineSlice.keys` → `cocos/assets/scripts/core/ViewTable.ts:borderOf()`（共享公式在 `game/dev/labTable.ts:resolveBorder()`，表内显式值优先，缺省回落短边 × factor）→ `cocos/assets/scripts/ui/Widgets.ts:sliced()` 与 `menu/MenuLayoutView.ts:clonedInsets()` 写 `SpriteFrame.inset*` + `Sprite.Type.SLICED`。
- 可拉伸带的平整由 `scripts/pixel-kit.mjs` 的 `flattenSlices()` 保证：切边带内侧一圈被压成等高/等宽的平涂，因此任意拉伸不会出现「装饰带被拉进拉伸区」的斜切。
- 当前面板族边距（逻辑 px）：

| key | slice (art px) | 边距 (逻辑 px) | 贴图 (px) |
| --- | --- | --- | --- |
| `menu_row_plate` `menu_note_plate` `menu_strip_plate` `menu_chip_plate` `menu_section_strip` `menu_set_plate` | 8 | 16 | 74×48 |
| `menu_set_plate_selected` `menu_title_plate` | 8 | 16 | 76×48 |
| `btn_primary` | 10 | 20 | 86×56 |
| `btn_minor` | 8 | 16 | 60×40 |
| `hud_dock_top` `hud_dock_bottom` | 4 | 8 | 36×24 |
| `slot_skill` | 6 | 12 | 48×48 |
| `bar_capsule` | 4 | 8 | 32×20 |

- 仍在用旧图标的 key（`menu_row_plate_current` `btn_back` `btn_danger`）保留各自旧边距，等各自批次落地时再改。
- 凡底板来自这一族的区块，绘制模式必须是 `slice`。主菜单的标题横幅、货币条、分区标题条已从整图 `stretch` 切到 `slice`：整图拉伸会把切边带糊成横纹，几何矩形不变，因此不算重排。

## 4. AI 出图约定

一张雪碧图对应一批 key，改 `artwork/pixel-kit.json` 即可整批重跑：

```
node scripts/pixel-kit.mjs [--config=artwork/pixel-kit.json] [--out=dir] [--contact] [--only=k1,k2] [--dry]
```

配置只能用 `--config=` 指定（缺省 `artwork/pixel-kit.json`）；位置参数会被忽略，写错会静默按默认配置跑出一批不相干的键。`--out` 缺省直写 `cocos/assets/resources/textures/`，验证阶段请指到暂存目录。

源图要求：

1. 背景一律**平涂 `#FF00FF`**。抠底色恒为这个约定值（`pickKeyColor()` 无条件返回它）：贴边格的格边本身没有品红，按格边取众数色会把整板判成背景吃掉。
2. 按 `grid.cols × grid.rows` 均分，每格一枚内容；`inset` 是每格向内收缩的比例，用来躲开格线。生成器格距不等宽、相邻格共用外描边时，改用表级 `rects` 逐格钉死坐标框。
3. 每格内容两种模式之一：**贴边**（面板/底板类，内容铺满整格，靠洪水填充保不住 → 用 `fit: "stretch"` + `slice`）或**留空**（图标/字形类，四周留透明边距，`cropBBox` 会裁到内容包围盒）。
4. 目标 art 尺寸写在格子的 `art` / `artH` 上；生成图内容长宽比与 art 盒差 >45% 时管线会警告（重采样会失真）。
5. 手钉 `rects` 的框线压在品红隔条上时，框的最外 1~2 圈会带进**品红抗锯齿晕**（实测如 `#5a0647`、`#9f1387`、`#2b001f`）。这类晕色离约定品红太远，洪水抠底抓不到，量化后落成品红族假色贴在贴图边缘。给该格加 `"insetPx": 2` 把晕甩在框外。

管线步骤（确定性，同配置重跑逐字节一致）：切格 → 洪水填充抠底 → alpha 腐蚀 → 最近邻重采样到 art 网格 → 量化到 33 色（Bayer 抖动）→ alpha 硬化 → 九宫格可拉伸带平整 → 导出 PNG。腐蚀只吃**贴着真透明**的抗锯齿软边，区域外一律按实心处理；否则紧框最外一圈会被无条件删掉，叠加 `resample` 的 `Math.floor` 取样偏左上，贴图会恒定缺上边与左边。

源图前缀在 `vibe_images/`，文件名带时间戳后缀；`resolveSrc()` 自动取同前缀最新一张。

## 5. 落地资产的保护规则

- 本批 39 张贴图落在 `cocos/assets/resources/textures/`，**同名覆盖、key 名不变**，加载通路沿用 `resources.load("textures/<key>/spriteFrame")`。
- `npm run sync:cocos` 是 Web→Cocos 单向镜像。`scripts/sync-cocos.mjs` 现在把 `artwork/pixel-kit*.json`（主菜单批 `pixel-kit.json` + 战斗 HUD 批 `pixel-kit-hud.json`）里声明的每个 key 当作 **Cocos 独占资产**：这些 png 一律不回灌，日志末尾打印保护条数。新增批次只要进任一规格表就自动受保护。
- `pxnum_*` 与 `crest` 不在 `ASSET_MANIFEST`（Web 侧会 404），由 `PIXEL_ART_KEYS` 直接进预载集；`restFrameKeys()` 已把它们从流式队列里摘出。
- **Cocos 侧退役件**：`badge_gem_purple`（旧世代钻石图标，87×112 拉进 14×14 盒）已退役——`resources/textures/` 里不再有该文件，`scripts/sync-cocos.mjs` 的 `RETIRED_IN_COCOS` 拦住镜像回灌，`GameShell.ts` 的 `RETIRED_FRAME_KEYS` 把它从流式加载队列摘出（否则每启动一条加载失败日志）。`ASSET_MANIFEST` 保留该键不动：Web 冻结基准照旧读 `public/assets`。每日屏资源行因此恒走「替代字形 ◆ + 文本」那一档，`dailyLayout` 的图标位与「带图标 / 缺图标」两档文本随之收成一条 `resText`。`icon_fragment`（委托屏碎片图标）仍是旧世代图，保持原图挂账。

### 5.1 共享层共读名单：「只改 Cocos」不等于「改动不碰 Web」

`@game` 别名指向 `cocos/assets/scripts/game`（`vite.config.ts` 与 `tsconfig.json` 的 paths），共享层**物理上只有一份**。
`src/game.ts` 实际 import 了其中一部分，**改这些模块等于同时改 Web 的渲染**：

- 共读（改即两端生效）：`@game/ui/theme`（`confirmRects` / `ui` / `fs` / `rowTextY` / `spreadRows`）、`@game/ui/hud`、`@game/ui/shop`、`@game/ui/menuLayout`、`@game/ui/heroSelectLayout`、`@game/ui/scrollList`，以及全部 `@game/data/*`。
- 不共读（Web 用的是 `src/game.ts` 自己带内联数的私有方法）：各屏 `*Layout.ts`（season / prestige / fusion / commission / energy / victory / gameOver）。注意同名易误判——`src/game.ts` 里的 `commissionLayout()` 是它自己的私有方法，不是 import。

**纪律：像素栅格类的对齐改动（页边距、取偶、热区、半宽推导）一律落在 Cocos 独有层**（该屏视图 / 模型 / 该屏 layout），不要动共读模块里的几何函数。确需动共读模块时，先按本名单评估 Web 侧影响并在提交说明里写明。

**已接受的记账**：批 2 改过共读的 `game/ui/shop.ts`（`SHOP_PAD` 14→16、布局由"几何恒定"改为"按屏高弹性分配"），因此 Web 商店自该笔起与刷新前差 **2px 横向右移、内容窄 4px**，996 以上不再在底坞以下留平色带而是把富余摊进行高/带距/卡高；996 档纵向与旧版同构。`shopLayoutPure` 的屏高参带默认值 996，Web 的两参旧调用不会取到 undefined。Web 为遗留参照、Web/Cocos 逐项对标判据已撤，故**接受该漂移、不做回补**；如需两端各持一把尺，改法是给 `shopLayoutPure` 加 pad 参（共享层默认 14、`ShopModel` 传 16），代价是共享层背两个 pad。

## 6. 像素数字字形

- 字形表：`pxnum_0..9` `pxnum_dot` `pxnum_comma` `pxnum_plus` `pxnum_times` `pxnum_pct` `pxnum_slash`，art 8×10（PNG 同为 8×10，1 贴图像素 = 1 逻辑 px 落屏，需要整体放大时用 `PixelNumber` 的整数 `scale`）。
- 组件：`cocos/assets/scripts/ui/PixelNumber.ts`。每个字形一枚 Sprite，等距推进（`advance` 默认 12 逻辑 px）、支持 tint、整数倍 scale、left/center/right 对齐；`setText()` 返回 `false` 表示串里有字形表外的字符，此时组件自我隐藏。
- 中文与混排（如 `12.5万`）继续走 `ui/Widgets.ts:label()` 系统字体通路。
- 本单接线范围：主菜单货币条三枚筹码的数字。其它屏待各自批次。

## 7. 逐屏翻新进度

「换皮」= 本批新贴图已接进该屏并跑通 NEAREST 通路；「重排」= 该屏的 layout 模块已按 art 网格（module=2、pad 16、热区 ≥44、越界 0）重排并重新基线几何测试。两列各自独立，换皮未必重排。

| # | 屏 | 换皮 | 重排 |
| --- | --- | --- | --- |
| 1 | menu 主菜单 | ✅ | ✅ |
| 2 | battle 战斗 | ✅ | ✅ |
| 3 | shop 商店 | ✅ | ✅ |
| 4 | heroes 英雄 | ✅ | ✅ |
| 5 | gearup 装备 | ✅ | ✅ |
| 6 | gacha 扭蛋 | ✅ | ✅ |
| 7 | pass 通行证 | ✅ | ✅ |
| 8 | daily 每日 | ✅ | ✅ |
| 9 | commission 委托 | ✅ | ✅ |
| 10 | fusion 合成 | ✅ | ✅ |
| 11 | prestige 轮回 | ✅ | ✅ |
| 12 | season 赛季 | ✅ | ✅ |
| 13 | leaderboard 排行 | ✅ | ✅ |
| 14 | energy 体力 | ✅ | ✅ |
| 15 | victory 通关 | ✅ | ✅ |
| 16 | gameover 失败 | ✅ | ✅ |
| — | confirm 常驻弹层 | ✅ | ✅ |

「重排」列以各屏 `*Layout.ts` 的最后触及提交为准：`dailyLayout` / `commissionLayout` / `gearUpLayout` / `passLayout` 四份都在共享层 `game/ui/` 下，已按 art 网格（module=2、pad 16、内容宽 528、热区 ≥44）重排并重基线几何测试；四份都不与 Web 共读（Web 用的是 `src/game.ts` 自己的同名私有方法，见 §5.1）。

## 8. 验收判据

自本次翻新起，**「同尺度 Web/Cocos 逐项视觉对标」不再是主菜单（及后续各屏）的验收判据**。替代判据：

- 本文档的风格基准条目（网格 / 调色板 / 切边 / 出图约定）；
- 每屏落地时新基线截图，存放于 `.probe/px/`（gitignored，随取随重生成）。

不依赖外观的判据继续生效，一条不减：

- 文案对账（逐屏双命中扫描）；
- 点击热区 ≥ 44 逻辑 px；
- 越界 = 0；
- 五道门：`npm test` → `npm run build` → `npm run build:cocos` → `npm run smoke:cocos` → `npm run typecheck:cocos`。

`npm run sync:cocos` 追加一条幂等安全要求：连跑两遍，第二遍零拷贝，且第一遍即打印 Cocos 独占保护条数。

## 9. 主菜单重排

纵向骨架是**七条带自上而下**的一条八像素节奏线，几何全部出自 `game/ui/menuLayout.ts:menuLayoutPure()`，视图只负责按矩形画板（`menu/MenuLayoutView.ts`），点击判定只读同一批矩形（`menu/MenuContentModel.ts:hitMenu()`）。一份矩形，画面与热区不会分叉。

下表以 560×996 为基准档（`y` 从屏顶起算）。两条带随屏高浮动：关卡列表吃掉分区条到主 CTA 之间的剩余高度，尾块整块贴底。

| 带 | y 起点 | 高 | 贴图 key | 热区 |
| --- | --- | --- | --- | --- |
| 标题带 | 8 | 56 | `menu_title_plate`（slice）· `crest_echo`（stretch，纹章 40×40） | 非交互 |
| 赛季 · 货币带 | 96 | 44 | 板族 `menu_chip_plate`（slice）× 5 · 图标 `icon_ticket` `icon_echo` `icon_stardust` · 数字 `pxnum_*` | 货币筹码 96×44 × 3（第二枚 = 回响，挂激励视频「+」）· 能量板 84×44 非交互 · 幻影榜 108×44 |
| 入口带 | 148 | 44 | 板族 `btn_minor`（slice）× 6 · 图标 `entry_quests` `entry_gacha` `entry_talents` `entry_pass` `entry_forge` `entry_gearup`（槽位文案 委托·扭蛋·天赋·通行证·每日·升级） | 78×44 × 6 |
| 分区条 | 200 | 32 | `menu_section_strip`（slice，源 528×32） | 非交互 |
| 关卡列表 | 240 起 | 行 76 · 行距 8（1212 档撑到行 96 · 行距 20） | `menu_row_plate`（当前关走 `menu_row_plate_current`）· 序号牌 `menu_chip_plate` + `pxnum_*` · 补星 `btn_minor` | 整行 528×76 · 补星走 `L.makeupRect(row, rowMargin)`，与画面星位同一矩形 |
| 主 CTA | 828 | 56 | `btn_primary`（slice，边距 20） | 528×56 |
| 英雄面板 | 892 | 88 | `menu_note_plate`（slice）· 立绘盒 `heroPort` · 「更换英雄」钮 `btn_minor` | 钮 96×44 |

### 9.1 网格规则

- **页边距 16，内容宽 528**：`pad = 16`，所有横贯带的板都取 `x = 16`、`w = 560 − 16×2 = 528`。
- **坐标取偶数**：面板、按钮、行的 `x` 与 `w`（以及行高、行距）一律经 `evenGrid()` 落偶数，落在 `module = 2` 的 art 网格上。奇数坐标会让 16 像素的九宫边距与 2px 模块错相，切边带糊出软边。
- **右缘基准 544**：顶部整条筹码带从右界 `屏宽 − pad = 544` 反推（幻影榜 → 能量 → 三枚货币依次左挂），赛季行同样右靠 544。因此顶部右侧元素右边缘恒 ≤ 544。
- **列间距 12 / 8**：筹码带内 `chipGap = 12`、入口带内 `entryGap = 12`（六枚 78 宽恰好铺满 528）；关卡行距与纵向带间节奏取 8。
- **八像素节奏**：首带顶缘 8，带间缝 8，尾块底缘 = `屏高 − 16`。主 CTA 贴英雄带上沿、列表底缘贴主 CTA 上沿，两处各留 8。
- **列表不留空洞**：`spreadRowsGrid()` 先把行距钉在下界 8 解出可行行高，富余先加行高、加到 `rowMaxH` 才加行距，剩下的余数（≤ `rowMaxGap`）落在**末行与主 CTA 之间的那条缝**里。所以高屏档只会长高行高，不会在列表下方堆出一块空白。
- **面板内容必走 nineMargin**：文字与图标只允许落在 `L.rowMargin` / `L.nineMargin` 内缩区。角深由贴图源尺寸与节点尺寸等比推出（`nineMarginPure()`，`f = 0.35`），行板实测 16 —— 与九宫切边带厚度同源，装饰带里不压字。

### 9.2 关卡行序号牌

行左槽用 `menu_chip_plate` 方板 + `pxnum_*` 像素数字排当行序号，与顶部货币筹码同一板族。取这个方案的理由：

- 序号是**行的身份**，品质徽记不是。旧槽放的是按品质 tint 的头像小图，40×40 的盒子里既读不出「第几关」，也不随通关状态变化。
- `pxnum_*` 是烘进 art 网格的字形，40×40 盒子内数字占 16×20，NEAREST 采样下边缘仍是硬阶梯，任意档位都清晰；头像小图在这个尺寸上必然糊成一团。
- 板族收敛：序号牌、货币筹码、能量板共用 `menu_chip_plate` 一族，切边厚度一致，横向读过去是一条连续的像素语言，而不是「一处面板 + 一处贴图残片」。
- 序号数字走 `PixelNumber` 通路，取不到字形时回落 `badgeText` 文本，锁定行与解锁行同一套排布。

### 9.3 实机取证基线

判据来自 `.probe/px/menu-px560.png`（560×996）与 `.probe/px/menu-px1080.png`（560×1212 逻辑 → 1080×2337 物理），由 `.probe/p-px-grid.sh` 一次跑完两档：贴图就绪探针 + 越界/网格/热区探针 + 按 canvas 矩形裁剪的截图。探针每档独立 serve 端口、调试端口与 user-data-dir，每条探针自带一次 `Page.navigate`，参考盒不跨运行复用。

实测口径与通过值：

| 检查 | 口径 | 560 档 | 1080 档 |
| --- | --- | --- | --- |
| 热区越界 | 20 枚热区矩形对照 (0,0,560,H)，四条边各自算超出量 | 0 | 0 |
| 节点越界 | `getBoundingBoxToWorld()` 对照 Canvas 世界盒，90 个 Sprite/Label 节点 | 0 | 0（仅 `Cover` 背景按 cover 填充左右各出血 60.72，非交互层） |
| 右缘基准 | 顶部右侧元素右边缘 ≤ 544 | 最大 544（赛季行 · 幻影榜） | 同 |
| 偶数对齐 | 热区与标题带 / 纹章 / 英雄带的 `x`、`w` 落 2px 网格 | 违例 0 | 违例 0 |
| 热区下限 | 每枚热区 ≥ 44×44 | 违例 0（最窄 78×44） | 同 |

一处待收的偏差：能量板 `d.strip` 占 340–424，而挂在它上面的 `EnergyText`（`⚡ 5/20`）量到 387–432，文字盒越过板右缘 8 逻辑 px，仍在画布与 544 基准线内、距幻影榜热区左缘 436 还有 4 px。其余横板（标题带 / 分区条 / 关卡行 / 主 CTA / 英雄带）的文字与图标都落在 nineMargin 内缩区。


## 10. 战斗 HUD（第二屏）

### 10.1 键名映射

| 源件（`artwork/pixel-kit-hud.json`） | manifest 键 | 贴图 px | 落屏逻辑尺寸 | slice（art→逻辑） | 通路 |
| --- | --- | --- | --- | --- | --- |
| `px_sheet_hud2` 格 1 | `hud_dock_top` | 36×24 | 顶坞满幅 560×64 | 4→8 | sliced |
| `px_sheet_hud2` 格 2 | `hud_dock_bottom` | 36×24 | 底坞满幅 560×48 | 4→8 | sliced |
| `px_sheet_hud2` 格 3 | `slot_skill` | 48×48 | 装备卡内技能槽 28×28（图标盒 24×24 同中心） | 6→12 | sliced |
| `px_sheet_hud2` 格 4 | `bar_capsule` | 32×20 | 四条胶囊条原矩形 150×12 / 150×5 / 240×10 / 170×6 | 4→8；薄条按条高钳到 ⌊h/2⌋−1 | sliced 板 + Graphics 内填充（语义色不变） |
| `px_sheet_joystick2` 格 1 | `joy_base` | 32×32 | 2×baseRadius = 112×112 | — | SIMPLE |
| `px_sheet_joystick2` 格 2 | `joy_knob` | 16×16 | 2×knobRadius = 48×48 | — | SIMPLE |
| `px_bg_stage_1` | `bg_stage_1` | 560×996 | 满幅 cover | — | SIMPLE cover + `backdrop.coverAlpha`/`dimColor` 压暗 |

- 新增键 `slot_skill` / `bar_capsule` / `joy_base` / `joy_knob` 进 `ASSET_MANIFEST`、`PIXEL_ART_KEYS`（NEAREST）与 `HUD_PRELOAD_KEYS`（构建期一次性读取）；`bg_stage_1` 覆盖旧键并同进 NEAREST 清单与预载集（否则会被 `restFrameKeys()` 摘去流式队列、开局读不到）。
- 九宫格四键在规格表内逐格覆写 `export: 2`：§1 的硬规则是切边带必须把 art 网格烘进 PNG，Cocos 的 sliced 组装器按「inset 贴图像素 = inset 逻辑像素」画带，export=1 会让切边带掉到 1 逻辑 px 颗粒。
- 胶囊条换皮后 Graphics 只画内填充（四周内缩 2 逻辑 px 让板沿露出），填充/叠光/盾覆层颜色仍走 `viewTable.hud` 的语义色；缺图回退旧的纯 Graphics 轨道画法。摇杆只换绘制，起杆分区、死区、钳半径与键盘合成顺序一律未动。

### 10.2 空气墙不变量

战场纵钳 = `game/ui/hud.ts:battleBandY(wh)` = `[HUD_TOP_H, wh − HUD_BOT_H]`，实体层 clamp 只读这两个常量，墙随坞高自动同步。本单不改坞高（64 / 48），墙不变。探针以 180 步采样玩家与全敌的 `pos ± radius`：越墙计数 0，实测纵范围 [80, 908] ⊂ [64, 948]；560 与 1213 两档同值（`worldH()` 恒钳 996）。

### 10.3 实机取证

`.probe/p-px-battle.sh`：两档各一套独立 serve 端口 / 调试端口 / user-data-dir / URL 标记，复量探针与截图同页跑（探针内合成 touch 持杆，截图带摇杆新皮）。产物 `.probe/px/battle-px560.png`（560×996）与 `.probe/px/battle-px1080.png`（1080×2340）。

| 检查 | 口径 | 560 档 | 1080 档 |
| --- | --- | --- | --- |
| 节点越界 | Hud + Joystick 子树全部 Sprite/Label 的 `getBoundingBoxToWorld()` 对照 Canvas 世界盒，四边各算超出量 | 0 | 0 |
| 可点节点越界 / 热区下限 | 摇杆全屏捕获节点（引导跳过钮仅首局横幅激活态存在，48×18 属 onboarding 瞬态，本单未动） | 0 / 无违例 | 0 / 无违例 |
| 偶数对齐 | 双坞、胶囊条、可点节点的 x/y/w/h 落 2px 网格 | 仅 `xpBar` h=5（表值，改前即奇） | 同左 + 全屏捕获节点 h=1213（档高本身为奇） |
| 空气墙 | 180 步采样 `pos ± radius` 对照 battleBand | 0 违例 | 0 违例 |
| 摇杆起杆 | 合成 touch 后 base/knob 世界中心对照 stickStart/knob 设计坐标 | 重合（140,760 / 176,736） | 同 |

### 10.4 本屏挂账观感项

1. 坞板中央拉伸带在 560 宽下呈约 54 逻辑 px 级色块（源 art 仅 18 宽，中央 10 列各摊 54px）。要重出图（加宽 art 或中心平涂）。
2. 顶坞 R3 量链文字盒底缘越 nineMargin(8) 约 5px、R1 顶缘约 1px；改基线属重排，本单不动。
3. xp(5) / chapter(6) 两条薄条的边距被钳到 1~2，胶囊板在薄条上只剩暗轨道观感。接线可修（为薄条另出一枚更矮的 capsule）。
4. `bar_capsule` 源右下角一枚高光 texel（#a9b4c4）经 sliced 落在条右端成浅色短划。接线可修（切边改 5 或出图抹除）。
5. `slot_skill` 源内容长宽比 1.50 与 24×24 盒差 >45%（管线警告），槽内亮轨被横向拉宽。要重出图。
6. `joy_base` 底缘一枚黑色「柄」texel 为源图内容残留。要重出图（或接受为底座支架）。

## 11. 压在横幅贴图上的标题

绸带类贴图的**带心区亮度跨度可达 5~6 档**（紫绸实测 `#2b1f47`→`#c8b6ff`、铁带 `#1a2233`→`#a9b4c4`），
任何单一字色都无法处处达对比——实测四屏压带标题的最坏对比只有 1.16~3.54。

标准解法是**字形描边**，把对比面从「字色 vs 带面」换成「字色 vs 描边」：

- 出口：`ui/Widgets.ts:setTextOutline(lb, width, colorHex)`（幂等，`width` 传 0 即关闭，
  所以缺图那一档不调描边）。
- 宽度：`viewTable.phase4.bannerTitleOutlineW`（默认 2 逻辑 px），**不在视图里内联字面量**。
- 描边色：沿用 `theme.bgDeep`，不另开色键。
- 字色：亮字族（`HEX.gold` / `p4.fuTitle` / `p4.cmTitle`）。

改后四屏最差可辨识度（按「字→描边→带面」全链路取每个像素的最大可辨路径）：

| 屏 | 改前 | 改后 |
| --- | --- | --- |
| prestige | 1.31 | 4.02 |
| fusion | 2.06 | 4.02 |
| season | 3.54 | 3.94 |
| commission | 1.16 | 4.02 |

**例外**：每日屏的 `banner_title_gold_c` 带心只有两档亮度（`#d9a63c`→`#ffd76a`），深字直接 8.71，
故维持深色字不开描边——按带面实况选档，不为统一而改已验收屏。

四屏各有一条源码闸盯住这件事（`tests/cocos-phase4-<屏>.test.ts` 末节的「压带标题描边闸」）：
视图必须调 `setTextOutline(this.title.lb…)`、必须读 `bannerTitleOutlineW`、不得自己写 `outlineWidth =`。

## 12. 结算两屏（通关 / 死亡）

两屏的几何在 `game/ui/victoryLayout.ts` 与 `game/ui/gameOverLayout.ts`，绘制在 `victory/VictoryView.ts`
与 `gameover/GameOverView.ts`，命中读同一份矩形（`hitVictory` / `hitGameOver`）。

### 12.1 键名映射

| 件 | 贴图 key | art / PNG | 绘制盒（逻辑 px） | 通路 |
| --- | --- | --- | --- | --- |
| 通关标题横幅 | `banner_large_navy_a` | 120×24 | 240×48（精确 2 倍） | SIMPLE 整幅拉伸，无缺图回退档 |
| 死亡标题横幅 | `banner_large_red` | 120×24 | 240×48（精确 2 倍） | 同上 |
| 屏底板（两屏） | `panel_dark_corners` | 128×96 | `[16,16,528,evenDown(h)−16]` | SLICED，边距 32 |
| 主 CTA（双倍 / 复活） | `btn_primary` | 84×56 | 220×44 | SLICED，边距 20；缺图退 `Plate` 代码底板 |
| 次级钮（返回 / 重开） | `btn_minor` | 60×40 | 通关 220×44、死亡 168×44 | SLICED，边距 16；缺图同上 |
| 奖励行前置图标 | `icon_ticket` `icon_echo` `icon_stardust` | 14×14 | 16×16 | SIMPLE，缺图收成零位盒 |

两屏的立绘与星数星形维持旧世代档（见 12.4 挂账），不进 NEAREST 表、不做像素化。

### 12.2 栅格口径

- **页边距 16 / 内容宽 528**（`VI_PAD` / `GO_PAD`、`VI_CONTENT_W` / `GO_CONTENT_W`），居中文字限宽
  就是这个内容宽；`ui.pad`（Web 冻结档 14）在两屏的共享层已不再 import，两条源码闸锁住这件事。
- **一律偶数**：屏高先 `evenDown`，锚线 `a = evenDown(hh × 0.3)`、屏心 `cx = evenDown(w / 2)`；
  跟随字宽的前置贴图位（`victoryIconRect` / `victoryBadgeRect`）把量出来的任意实数再 `evenDown` 一次。
- **半宽由宽度推导**：`VI_BANNER_DX = evenDown(VI_BANNER_W / 2)`，`VI_DOUBLE_DX` / `VI_MENU_DX` /
  `GO_REVIVE_DX` / `GO_DOUBLE_DX` 同一写法。钮宽 190 → 220、星数行 `22+6` → `24+8`、
  死亡屏三钮行 `118×3+8×2` → `168×3+12×2 = 528`，都是为了让 `cx − W/2` 与 `total/2` 落在偶数上；
  三钮行因此正好铺满内容带（左起 16、右缘 544）。
- **热区 ≥ 44**：双倍钮 34 → 44、复活钮 32 → 44，钮内文字基线统一走 28 档。
- **屏底板**：`Plate`（兜底 `Graphics` 挂在子节点，避开「每节点只收一个 UIRenderer」）；
  通关屏的返回钮底边就落在板的下缘 `hh − 16`。
- **呼吸缝**：两屏各有一条无上限的缝（`seamAboveButtons`），标定档 996 下通关 372、死亡 358；
  屏高涨到 1246 时分别涨到 548 / 534，涨的正是贴底族与锚线族之差 `Δh − (a₂ − a₁)`。
  行距、钮高、字号这一族全是常量，不吃富余。

### 12.3 实机取证（`.probe/px/victory-px560.png`、`.probe/px/gameover-px560.png`）

`.probe/p-px-b7-settle.sh`（两档各一套 serve 端口 / 调试端口 / user-data-dir / URL 标记，
每条 eval 与 shot 自带 `CDP_GOTO` + `CDP_MATCH`）。两屏在正常游玩里都进不去，探针先 `requestEndless()`
起一局，再用战斗层的 `sim.victory()` / `sim.onDeath()` 弹屏。

| 检查 | 口径 | victory | gameover |
| --- | --- | --- | --- |
| 贴图落位 | `EXPECT` 表逐节点比对键与盒 | 8/9 命中（`StardustIcon` 该局 `stardust = 0`，整棵按分支不起） | 6/6 |
| 节点越界 | 自身盒对照 Canvas 设计盒 | 仅 `Fallback` 子节点计 1 条（`Graphics` 已被 `clear()`，不绘任何像素） | 0 |
| 偶数对齐 | 贴图盒与热区 x/y/w/h | 违例 0 | 违例 0 |
| 右缘 / 左缘基准 | 非文字内容件 ≤544、≥16 | 违例 0 | 违例 0 |
| 热区下限 | 每枚 ≥44 | 2/2（220×44） | 5/5（220×44 与 168×44） |
| 同节点双 UIRenderer | 贴图已上仍挂 Graphics | 0 | 0 |
| 目视 | 横幅 / 标题描边 / 屏底板 / 兜底残块 / 像素边缘 / 品红 | 绸带完整未拉满、金标题带深描边清晰、底板四角在位、无蓝块、边缘硬、无品红 | 红绸带在位、标题描边可辨、三钮行对齐 16→544、无蓝块、无品红 |

### 12.4 本屏挂账

1. `icon_star_gold`（2048 源、未像素化）与两枚立绘 `player_pose_1` / `player_pose_4` 仍是旧世代档，
   与新皮并置时清晰度落差明显；按用户要求人物暂不出图，星形也未进 NEAREST 表。
2. 死亡屏的「天赋」「菜单」两枚在 Web 那里就没有贴图档（`fillRect` + `strokeRect`），本单维持原样，
   因此三钮行里出现「贴图钮 + 纯色代码钮」混排；统一成 `btn_minor` 需要一次口径拍板。
3. 两屏中段是那条无上限呼吸缝，高屏档（1246）空白带更长，读起来偏「上内容 + 底钮」两段。
4. `Plate` 的 `Fallback` 子节点UITransform 恒为 100×100，探针按节点盒计量会在贴底小钮上记一条越界
   （绘制内容已 `clear()`，不落像素）。要收的是 `ui/PanelKit.ts` 这一处共享出口，不在本单范围。

### 11.1 描边只在带面偏亮时成立

描边路径的成立条件是「字色 vs 描边」与「描边 vs 带面」**两段都有对比**。带面本身偏暗时，
`theme.bgDeep` 描边与带面同档，那一段归零，整条路径失效，可读性回落到「字色 vs 带面」的直接对比。

实测：`banner_large_red` 带心只有 `#3a1218`→`#7a1f2a`（暗红两档），红字 `#FF5A5A` 的开描边后
最差可辨识仅 3.37；对照 `banner_large_navy_a` 带心 `#05070c`→`#c8cdd6`（跨 7 档），金字达 12.10。

所以选档顺序是：**先看带心亮度跨度**——跨度大（≥4 档）才需要描边；带面整体偏暗时应直接选亮字
（`theme.textPrimary` 或 `HEX.gold`），描边只是补充而非替代。暗字 + 暗带 + 暗描边是三输组合。
