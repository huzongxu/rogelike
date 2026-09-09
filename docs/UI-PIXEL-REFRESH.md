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
- **Cocos 侧退役清单**：`resources/textures/` 里已无文件的旧世代位图，靠两侧配套守卫记账——`scripts/sync-cocos.mjs` 的 `RETIRED_IN_COCOS`（拦住 Web→Cocos 镜像回灌）与 `GameShell.ts` 的 `RETIRED_FRAME_KEYS`（从 `restFrameKeys()` 流式加载队列摘出，否则每启动一条加载失败日志）。**两份名单必须同步**，只改一侧等于把旧图放回包里或让启动刷错误。
  入库判据是两条独立证据同时成立：① `cocos/assets/scripts` 全树 grep 无绘制点名（只剩 `ASSET_MANIFEST` 登记、`game/dev/*` 与注释里的提及）；② 17 屏逐 Sprite 实机清点（`.probe/p-px-oldgen.sh`）在该屏上从未采到该键。当前 27 枚：`badge_gem_purple`（每日屏钻石图标，改「替代字形 ◆ + 文本」）、`banner_large_navy_b` / `banner_mid_red` / `banner_mid_iron` / `banner_mid_navy_b` / `banner_mid_red_b` / `banner_title_abyss` / `banner_title_gold_a`（横幅族，改贴像素档 `banner_title_gold_b` / `banner_mid_navy` / `banner_large_red`）、`bar_hp` / `bar_boss_hp` / `bar_progress_blue` / `bar_progress_gold`（条族，改 `bar_capsule` 与像素档 `bar_progress_*_b`）、`affix_death_chain` 等 6 枚词缀（只有 `affix_boss` 有绘制点）、`badge_season` / `badge_star_gold`、`btn_close`（关闭钮走代码描边）、`divider_bar_dark`（分隔带走代码线）、`icon_wechat_share`（本机无微信通路）、`panel_gearup`（装备升级底改 `panel_dark_corners`）、`frame_highlight_gold`（品质框走 `frame_<品质>` 五档像素档，本键两头都不被该模板命中）、`gen-badge-gear-lv` / `gen-entry-gearup`（早期导入件，不在清单也不在 ASSET_MANIFEST）。
  **判据形状值得记住**：`ASSET_MANIFEST` 是两端共读的一份表，Web 冻结基准照旧读 `public/assets`，所以退役只发生在 Cocos 侧的文件与加载队列，清单条目一律不删。
- **仍有消费者的旧世代键不再挂账，而是按同名键重出像素档**，范围与批次见 §13。

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

### 10.4 本屏观感项台账

顶坞三行的基线越界已按行心栅格收口（见 §10.5）。其余五条都在贴图侧，逐条归到 §13 的重出程序：

| # | 件 | 口径 | 归属 |
| --- | --- | --- | --- |
| 1 | `hud_dock_top` 中央拉伸带 | 560 宽下呈约 54 逻辑 px 级色块（源 art 仅 18 宽，中央 10 列各摊 54px）。改法是中心平涂（`flatCenter`）或把中央带画宽 | 已修在 `pixel-kit-hud.json` 的 `flatCenter`，本条只留作拉伸带的选档判据 |
| 2 | xp(5) / chapter(6) 两条薄条 | 边距被钳到 1~2，胶囊板在薄条上只剩暗轨道观感 | §13 批 A：为薄条另出一枚更矮的 capsule（`artH` 3~4） |
| 3 | `bar_capsule` 右下角高光 texel | 一枚 `#a9b4c4` 经 sliced 落在条右端成浅色短划 | §13 批 A：出图抹除或切边改 5 |
| 4 | `slot_skill` 长宽比 | 源内容 1.50 与 24×24 盒差 >45%，槽内亮轨被横向拉宽 | §13 批 A：按 1:1 方格重出 |
| 5 | `joy_base` 底缘黑 texel | 一枚黑色「柄」为源图内容残留 | §13 批 A：重出（或接受为底座支架） |

### 10.5 顶坞行心栅格

顶坞 64 高、九宫边距 8 ⇒ 平涂内容带 `[8,56]` 三等分，行心 16 / 32 / 48。三行行心存在
`viewTable.hud.topRowCenters`（`[16,32,48]`，表值同时进 `resources/config/viewTable.json`），
坞内所有条、图标与文字基线都由行心推导：

- 条与图标：`rowBand(i, x, w, h)` 取盒（顶缘对齐到偶数，避免半像素采样）；
- 文字：`rowBase(i, px) = 行心 + 0.35 × 字号`，字号仍走 `hud.pxMain` / `pxSub` 表值。

实机（`.probe/oldgen-battle.json` 的逐节点盒 + `.probe/dock-battle.png`）：坞内绘制件 20 个，
条与图标全部落在 `[8,56]` 内——`bar_capsule` 10..22 与 30..35、`icon_echo`/`icon_stardust` 42..55、
`intel_horde` 42..54；Label 的行盒按字号留 19~20 高，顶缘 6 / 底缘 57 各压到 6..7 与 56..57 两条
斜角线上 1~2 px，而墨迹带（基线上下 0.72/0.2 字号）在 11.8..22.8 与 43.5..54.6，未触斜角，
截图目视三行文字与条、图标互不压线。

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

### 11.1 描边只在带面偏亮时成立

描边路径的成立条件是「字色 vs 描边」与「描边 vs 带面」**两段都有对比**。带面本身偏暗时，
`theme.bgDeep` 描边与带面同档，那一段归零，整条路径失效，可读性回落到「字色 vs 带面」的直接对比。

实测：`banner_large_red` 带心只有 `#3a1218`→`#7a1f2a`（暗红两档），红字 `#FF5A5A` 的开描边后
最差可辨识仅 3.37；对照 `banner_large_navy_a` 带心 `#05070c`→`#c8cdd6`（跨 7 档），金字达 12.10。

所以选档顺序是：**先看带心亮度跨度**——跨度大（≥4 档）才需要描边；带面整体偏暗时应直接选亮字
（`theme.textPrimary` 或 `HEX.gold`），描边只是补充而非替代。暗字 + 暗带 + 暗描边是三输组合。

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

两屏的立绘（`player_pose_1` / `player_pose_4`）与星数星形（`icon_star_gold`）都是像素档，
art 档 = 实机绘制盒、进 NEAREST 表，批次归属见 §13.4 的批 A / 批 B。

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

### 12.4 本屏台账

两屏中段是那条无上限呼吸缝，高屏档（1246）空白带更长，读起来偏「上内容 + 底钮」两段——**这是刻意保留的
呼吸位**（唯一能吸收任意屏高的机制），不作为待修项。其余三条按现行状态记：

| # | 件 | 现行状态 |
| --- | --- | --- |
| 1 | 星形 `icon_star_gold` 与立绘 `player_pose_1` / `player_pose_4` | 走 §13 的同名键重出程序（星形在批 A、通用立绘在批 B），与新皮同世代后进 NEAREST 表 |
| 2 | 死亡屏三钮 | 同族：三枚一律 `btn_minor` 贴图优先、缺图退代码底板（`GameOverView.ts` 的 `KEY_MINOR` 分支） |
| 3 | `Plate` 的 `Fallback` 子节点盒 | 由 `ui/PanelKit.ts:sizeFallback()` 跟随绘制盒，`Plate.show` 与 `qualityBox` 两条路径都调它；探针不再记到 100×100 幽灵盒 |

## 13. 全量翻新：旧世代位图清零

### 13.1 范围

2026-09-09 拍板：翻新范围含玩家、怪物、背景与前景道具，**不设保留档**。这条覆盖两处早先口径——
起手六条决策里的「人物和怪物先不生成」，以及 §5 记账里 `bg_*` 的「只记账不动资产」。
自此 Cocos 侧的贴图只剩一种状态：像素档（由 `artwork/pixel-kit*.json` 声明并受 sync 保护）。
四批落地后 `textures/` 的 158 枚 png 逐枚在表、双向对账无差集，旧世代位图清零。

### 13.2 盘点口径与数字

三道集合运算（脚本 `.probe/oldgen-inventory2.mjs`，2026-09-09 实测）：

```
ASSET_MANIFEST 全键 154
  − artwork/pixel-kit*.json 六份规格声明键 86
  − GameShell.ts:RETIRED_FRAME_KEYS 25
  = 72 枚待重出（textures/ 共 158 张 png = 86 像素档 + 72 旧世代，逐张读 IHDR 取源尺寸）
```

按绘制点分桶：直接点名 27 枚、只被模板键命中 45 枚（`avatar_${quality}` 5 / `bg_stage_${id}` 6 +
`bg_outside` / `enemy_${kind}` 14 / `icon_fx_${effectType}` 14 / `icon_set_${setId}` 6）。
`frame_highlight_gold` 两头都不被命中（品质框走 `frame_<品质>` 五档像素档），按 §5 的两条独立证据
退役，因此它是第 27 枚 `RETIRED_FRAME_KEYS` 成员而非本批对象。

实机侧配一份 17 屏逐 Sprite 清点：`bash .probe/p-px-oldgen.sh` →
`node .probe/oldgen-box-summarize.mjs old` 给出**逐键实测绘制盒**（下表 art 档的来源），
同一次清点还给出 `dual=0`（每节点只收一个 UIRenderer，兜底层都在 `Fallback` 子节点）
与「退役键零上屏」两条旁证。本次快照上屏 17 枚。

批 B 落地后复测（2026-09-09）：`artwork/pixel-kit*.json` 八份规格声明 **143** 键，
`textures/` 共 158 张 png，差 **15** 枚即批 C（8 枚 fx / 弹道）+ 批 D（7 枚背景）；
`.probe/oldgen-inventory2.mjs` 同口径给出 drawn 8（批 C 全部在战斗屏上屏）+ manifestOnly 7
（批 D 的背景只被 `bg_stage_${id}` 模板命中）、orphan 0。
批 C 落地后同口径再测：九份规格声明 **151** 键、`textures/` 仍是 158 张（同名覆盖），
remaining **7** = 批 D 的 `bg_stage_2` … `bg_stage_7` 与 `bg_outside`，drawn 0 / orphan 0。
批 D 落地后收口：十份规格声明 **158** 键，与 `textures/` 的 158 张 png 双向对账、两侧差集皆空，
`oldgen-inventory2.mjs` 的 remaining / drawn / manifestOnly / orphan 四路全 0 —— 旧世代位图清零。
两侧差集之所以能空，还因为 Cocos 侧无绘制点名的旧世代位图已随本批从 `textures/` 物理移除
（26 枚 png 连同各自 `.meta`）：名单以 `GameShell.ts` 的 `RETIRED_FRAME_KEYS` 与
`scripts/sync-cocos.mjs` 的 `RETIRED_IN_COCOS` 两侧同源登记，`ASSET_MANIFEST` 的键位与
`public/assets/` 那份照旧不动。
字节侧同步收口：批 D 七枚 23,553,515 → 1,386,170 B，`textures/` 全目录 1,954,271 B（158 枚）。
`public/assets/` 的 152 枚 41,537,590 B 属冻结基准，本批未动。
上面那组 154 / 86 / 25 / 72 是批 A 之前的快照，批 A 后为 123 键 / 差 35 枚，保留是为了说明批次划分的来路。

### 13.3 同名重出的三条纪律

1. **键名与通路不动**：png 同名覆盖，`ASSET_MANIFEST` 条目不删，加载仍走
   `resources.load("textures/<key>/spriteFrame")`。改动面只有三处——贴图文件本身、
   `artwork/pixel-kit-*.json` 新增规格、`game/data/pixelArt.ts` 登记采样档。视图层零改动。
2. **art 档 = 实测绘制盒**：SIMPLE 件用 `export: 1` + `art = [盒宽, 盒高]`（取偶），
   贴图像素与逻辑 px 1:1；SLICED 件用 `export: 2` + `artH = 盒高 ÷ 2` + `fit: "stretch"`，
   边带 1 贴图像素 = 1 逻辑 px，只有中央带拉伸；cover 背景用 `fit: "cover"` +
   `keyout: false` + `cropBBox: false`。旧图普遍是 256 级 AI 原图落进 24~48 的盒（约 8~10 倍
   下采样），重出到 1:1 是这批的主要收益点。
   盒由版式算出（不是固定值）时，art 要让屏上倍率落在整数上：`card_soldout` 的章是
   `min(卡宽,卡高) − 16` = 156，art 取 78 得整 2 倍；取 72 时 2.17 倍最近邻会把圆周
   走成忽 1 忽 2 的台阶。
3. **形状纪律**（§4 第 3 条按族落实）：底板与品质框 = 实心内板、无洞；chrome = 铺满整格
   （`cropBBox: false` + `fit: "stretch"` + `slice`）；图标 = 四周留空、不带背板。

### 13.4 批次划分

| 批 | 族 | 枚数 | 规格文件 | 状态 |
| --- | --- | --- | --- | --- |
| A | UI 图标、徽记与九宫格底板 | 37 | `artwork/pixel-kit-icons.json` | 已落地（2026-09-09 五道门绿） |
| B | 玩家、怪物与结算立绘 | 20 | `artwork/pixel-kit-units.json` | 已落地（2026-09-09 五道门绿） |
| C | 战斗特效与弹道贴花 | 8 | `artwork/pixel-kit-fx.json` | 已落地（2026-09-09 五道门绿 + 实机 8/8 上屏） |
| D | 战场与外层背景 | 7 | `artwork/pixel-kit-bg.json` | 已落地（2026-09-09 五道门绿 + 实机八档取景） |

四批合计 **72 枚**，全部按同名键覆盖既有贴图，`textures/` 的枚数因此不变（158 张）。
批 D 另把同一条水印修法回灌三枚已验收背景（`bg_stage_1` / `bg_shop` / `bg_menu`，见 §13.5）。
`bar_capsule` 去右下角高光 texel、`slot_skill` 按 1:1 方格、`joy_base` 去底缘残留柄三枚属
§10.4 那一轮的已验收像素档重出，本表不重复计入。重出已验收件先 `--only=` + `--out=` 暂存验完再回灌。

### 13.5 逐键 art 档

**批 A（37）**

| art | 键 | 绘制点 |
| --- | --- | --- |
| 12×12 | `intel_armor` `intel_mutant` `intel_elite` | 顶坞 R3 敌情图标、商店敌情行（同一张 2×2 雪碧图） |
| 12×12 | `intel_horde` | 同族，另起单图源：纯黑剪影在蓝黑底上不可读，重出为带冷灰 rim 的蝠群 |
| 14×14 | `icon_fragment` | 委托屏碎片行 |
| 14×16 | `badge_shield_bronze` | 顶坞 R1 护盾徽记（盒 14×17） |
| 18×18 | `affix_boss` | Boss 组件图标 |
| 18×18 | `icon_set_barrage` `icon_set_ember` `icon_set_frost` `icon_set_magma` `icon_set_phantom` `icon_set_thorn` | 套组卡图标（`layoutMenu.setIconW` = 18） |
| 24×24 | `avatar_common` `avatar_rare` `avatar_epic` `avatar_legendary` `avatar_hidden` | 通关屏与菜单关卡行框（`avatar_<品质>`） |
| 24×24 | `icon_star_gold` | 通关屏星标 |
| 36×36 | `icon_fx_knife` `icon_fx_nova` `icon_fx_skeleton` `icon_fx_cloud` `icon_fx_ray` `icon_fx_chain` `icon_fx_shield` `icon_fx_drain` `icon_fx_icelance` `icon_fx_frost_ring` `icon_fx_meteor` `icon_fx_magma_trail` `icon_fx_spirit_wolves` `icon_fx_haunt_crown` | 商店效果图标 36×36；HUD 技能行取 24×24，按 NEAREST 缩放 |
| 48×40 | `emblem_flow_gold` | 赛季屏徽记 |
| 78×78 | `card_soldout` | 商店卡位售罄章（盒 156 由版式算出，见 §13.3 第 2 条） |
| artH 20 / slice 8 / export 2 | `btn_danger` | 150×44、60×56、126×64 三档共用一张 |
| artH 24 / slice 8 / export 2 | `menu_row_plate_current` | 主菜单当前行底板 528×76 |

两枚九宫格件的 `viewTable.nineSlice.keys` 记 **16**（= slice 8 × export 2），与同族
`menu_row_plate` / `btn_minor` 同档；换图后旧值（34 / 71）是按退役图的源尺寸推的，
留在表里会把切带落错位置。

**批 B（20）** — 怪物盒 = `radius × battle.enemySpriteScale`（2.6）取偶：

| art | 键 |
| --- | --- |
| 26×26 | `enemy_splitling` |
| 28×28 | `enemy_swift` |
| 32×32 | `enemy_hider` |
| 34×34 | `enemy_goldkind` |
| 36×36 | `enemy_chaser` `enemy_reflector` |
| 42×42 | `enemy_splitter` `enemy_devourer` |
| 44×44 | `player`（盒 45×45） |
| 46×46 | `enemy_shieldguard` `enemy_summoner` |
| 62×62 | `enemy_tank` |
| 88×88 | `enemy_elite` |
| 104×104 | `enemy_god` |
| 124×124 | `enemy_boss` |
| 58×92 | `player_pose_1`（通关屏）`player_pose_4`（死亡屏） |
| 44×60 | `player_pose_5`（转生屏） |
| 38×60 | `player_pose_2`（每日屏）`player_pose_6`（委托屏） |

本批 20 枚统一 `fit: "contain"`：怪物盒是方形（`radius × 2.6`）而生物是竖身，`stretch` 会把
石巨人压扁。contain 下宽身件只填宽度、上下留空，因此出图会报「内容长宽比与 art 盒差 >45%」
（`player_pose_4` 0.94 vs 0.63），这条是预期内，不是缺料。

**批 C（8）** — 贴花盒 = `FX_TEX.r × 2`，`export: 2` 把 art 网格烘进 PNG：

| art | 键 | 盒 |
| --- | --- | --- |
| 100×100 | `fx_nova` `fx_blast` | 200×200 |
| 34×34 | `fx_chain` `fx_drain` | 68×68 |
| 22×22 | `fx_shield` | 44×44 |
| 48×48 | `fx_poison` `fx_summon` | 数据驱动（毒池 `radius × 2`、仆从 `radius × minionSpriteScale`） |
| 18×24 | `proj_lightning` | `max(radius × rayScale, rayMinPx)` × `rayAspect` 0.76 |

**批 D（7）** — `bg_stage_2` … `bg_stage_7` 与 `bg_outside`（无限关背景）：绘制盒就是全屏
560×996，故 art 档 = 盒本身 + `export: 1`（1 贴图像素 = 1 逻辑 px），配 `fit: "cover"`、
`keyout: false`、`cropBBox: false`，与已验收的 `bg_stage_1` 同档。量化表取 56 档而非 33 档：
它是 33 基表的严格超集，多出的火族 / 苔绿 / 冰蓝三组正是裂谷火海、荒野求生、深渊之喉三个主题
的落点，用 33 档会把熔岩挤进金族、把裂隙挤进寒冰族。七枚构图纪律一致：俯视地面、无地平线
无灭点，中央竖带留低细节的安静地板（单位在这条带上打），细节压向两侧与两端，主题色只作边缘点缀。
水印逐枚钉 `"wm": [0.765, 0.945, 0.235, 0.055]` + 表级 `"wmFill": "slide"`（修法与三档对比见
§13.6 第 2 条末弹）。同一处修法回灌三枚已验收件 `bg_stage_1` / `bg_shop` / `bg_menu`——
它们入库时走默认大盒 + `row` 拉伸，角上留着一梳竖向拖影；key 与尺寸不变，三枚字节
403,458 → 428,654（平移填充搬来的是真纹理而非拉伸行，故略增）。

### 13.6 每批工序与验收

1. ImageGen 出源图：平涂 `#FF00FF`、按 `grid` 均分、格间留品红沟，形状纪律见 §13.3 第 3 条。
2. 钉抠底参数（批 A 立五条、批 B 补三条、批 C 补四条、批 D 补一条）：
   - 生成器的「平涂品红」会逐张漂到玫红族（批 A 实测 a1 `#a5647a` / intel `#cc63a5` /
     a3 `#aa567f` / a5 `#a1547c` / a6 `#b5598a`；批 B 两张 b1 `#bf3390` / b2 `#b73a8f`）。按张量四角中位数取实测底色写进 `keyColor`，
     `tolerance` 从默认 96 收到 36——容差宽了紫色族图标会被连坐抠穿。
   - 带柔光晕的件反过来要放宽：`icon_fx_ray` 取 140，把品红混色晕整圈吃掉。
   - 外缘有抗锯齿混色环的九宫格件加深 `erode`（`menu_row_plate_current` 取 12），
     否则左切片里那圈环会被拉伸成一条通高红边。
   - 单图源若把品红场画在一圈生成器灰底框内，或内容越过分格线（批 B 的 `enemy_god` 光环伸到
     x416，而均分格线在 384），用 `rect` 手钉场盒（`singles` 与 `sheets.rects`
     同一坐标口径），让播种、水印内缩与 alpha bbox 都只在场内跑。
   - 水印落在钉好的框外时 `"wm": false`——默认水印带是格内相对坐标，开着会 repaint 内容。
   - **脚底有品红滩**（批 B）：生成器给每个站立件画一圈接触阴影椭圆，椭圆内的品红被边界洪泛
     封成闭合腔、抠不掉。按张在规格顶层开 `keyGlobal: true`（全图同色一并抠）即可收干。
     自带品红光环的件是反例，要在格上单独关：`enemy_god` 在 `tolerance: 30` 下开全局通道，不透明
     像素实测掉 18%（5022 → 4133），放宽到表级 36 掉 24%，光环外圈被当成底吃掉。判据是
     `dist2 < tolerance²`，而它的焰光主色 `#ff2d8f` 与实测底色 `#bf3390` 的 RGB 平方距离只有
     4133（开方 64.3），默认容差 96（9216）会把整圈光焰连底一起判掉。
   - **水印压在贴图上缘**（批 B）：本批的件填满到格底，`"wm": false` 只能关掉内缩、挡不住
     水印本身，改成把 `rects` 下缘钉到水印上沿以下、脚底以上（b1 的 `enemy_elite` 988 → 986、
     b2 的姿态件 968 → 962），水印整条落在场外。
   - **抠干净了仍然有品红滩**（批 B）：这一类不在 alpha 通道上，而在量化表里。接触阴影的暗部
     texel 实测量化进粉族的 `#7a1040` / `#c01f6a`（每枚 15~64 像素、全落在脚底最后一行），
     在蓝黑战场上读成一块品红水洼。去掉这两档后同一批暗部落进已有的 `#7a1f2a` / `#3a1218`，
     神之敌的焰光靠剩下的 `#ff2d8f` / `#ff8fc0` 两档仍然成梯度。`palette` 只有规格顶层这一个
     口径（`pixel-kit.mjs` 不认表级覆盖），改一处即全批生效，所以调表之前先确认这批没有别的件
     靠那两档做主体色。
   - **整批都是发光件**（批 C）：`tolerance` 取 64 而非批 A/B 的 36——火环、电球、脉冲池的外缘
     是一圈品红混色光晕，容差窄了留粉边。上限压在 116 以下：毒池紫体 `#8a6fd1` 与实测底色
     `#a71c84` 的 RGB 平方距离只有 116.9，再宽就连本体一起抠。
   - **空心环**（批 C）：`fx_nova` / `fx_shield` 的环心是被本体围死的品红腔，边界洪泛播种进不去，
     整表开 `keyGlobal: true`，否则环心留一块品红实心盘。
   - **高饱和霓虹主体**（批 C）：量化走 `distance: "lab"`。纯 RGB 距离下紫池液面（实测 `#8f2cb4`）
     被判给亮粉 `#ff2d8f` 而非灰紫 `#8a6fd1`，池心冒一撮 4 像素的粉斑；补一档同相 `#8f2cb4`
     （本批唯一新增色，表 56 → 57）后池体整片落回紫族。
   - **水印只压中一格**（批 C）：`sheets[0].wm: false` 整表关，再给那一格按格内归一化框重钉
     `"wm": [0.41, 0.87, 0.56, 0.11]`（`proj_lightning`，实测字带 x1318..1513 / y968..1004），
     镜像修补正好盖住字而不碰弹体。
   - **全幅背景的水印要 tight 盒 + 平移填充**（批 D）：生图右下角是「半透明暗底板 + 浅灰文字」，
     八张源图（含已入库的 `bg_stage_1`）底板盒实测一致落在 x 788..1024 / y 1700..1792
     （1024×1792 源），归一化 `[0.765, 0.945, 0.235, 0.055]` 逐枚钉进 `wm`。默认 `WM_DEFAULT`
     的 45%×14% 大盒会连带吃掉底板上方一整块地面，而它的默认填充 `row` 是把盒上方紧邻的一行
     向下拉伸——小图标上看不出来，全幅背景上读成一梳竖向拖影，入库的 `bg_stage_1` / `bg_shop`
     即此状。三档填充同图实测：`row` 出梳；`mirror`（盒正上方等高块逐行镜像下来）在角上留一条
     竖直镜像轴，树根与熔岩被对成蝴蝶纹；`slide`（盒左侧同宽、同高、同行的块平移过来）保住地面
     纹理的横向走向，唯一 tell 是左侧醒目物件（栅栏 / 符文 / 车轮）在角上复现一次，读作多堆杂物。
     批 D 取 `slide`（表级 `wmFill`，七枚同口径），三枚已验收件同法回灌。
3. 先落暂存：`node scripts/pixel-kit.mjs --config=artwork/pixel-kit-<批>.json --out=.probe/px-stage --contact`。
   `--out` 不可省：省了直接写进 `cocos/assets/resources/textures/`。
4. 逐张目视接触表：边缘无品红假色、无发丝列、量化不糊、chrome 铺满格、图标留空。
   可读性也在这一步判：批 A 的 `intel_horde` 源件是纯黑剪影，抠完主色亮度只有 7，
   在蓝黑底上等于不存在，为此单独重出源图而不是调参救。
5. 回灌正式目录 → `npm run sync:cocos` 跑两遍（第二遍须报 新增/更新 0）→ 五道门
   （`test` / `build` / `build:cocos` / `smoke:cocos` / `typecheck:cocos`）。
6. 登记采样档：SIMPLE 进 `PIXEL_ART_KEYS`、九宫格进 `NINE_SLICE_KEYS`（`game/data/pixelArt.ts`），
   漏登记等于把这枚贴图交回 bilinear。九宫格件另需在 `viewTable.nineSlice.keys` 落切深。
7. 实机复拍：`bash .probe/p-px-oldgen.sh` 后本批键从 `old` 表消失，
   `node .probe/oldgen-inventory2.mjs` 的 remaining 计数按批递减，四批跑完归 0。
   批 A 的复拍另配 `.probe/p-px-ba.sh`（五屏逐 Sprite 回报贴图尺寸 : 绘制盒倍率）。
   批 B 的复拍另配 `bash .probe/p-px-bb.sh`（六屏：战斗 + 五张立绘屏。帧表侧回报 20 枚键的
   贴图尺寸与采样档，上屏侧回报实测绘制盒）。战斗屏这一跑要顶两个前提：把 `waves.elapsed`
   推到第十二章、并把玩家血量抬满，否则一次采样只出第一章的两三种怪，或中途翻到结算屏。
   采样档不能只读 `filterLine`——该字段在部分版本上是空的，要顺着 `_samplerInfo.magFilter`
   → `_sampler.magFilter` → `getFilters()` 回落，并且把 `cc.Texture2D.Filter` 的枚举值一并打出来。
   本批的取证面：帧表侧 20/20 枚按 art 尺寸进表且 `filt=1`；上屏侧 16 枚实见绘制
   （战斗屏 11 枚 = 10 种怪 + 玩家本体，五张立绘屏各出自己那枚）。`enemy_elite`
   `enemy_goldkind` `enemy_god` `enemy_boss` 四枚要精英波、金币怪、神之挑战与关底才上场，
   一次采样走不全，这轮的判据停在帧表 + 接触表两层。绘制盒与贴图允许 ±1 的差：
   盒是 `radius × 2.6` 的非整积（本批实测 31/47/29/45），art 按取偶口径落在 32/46/28/44。

   批 C 的取证面分三个窗口（`bash .probe/p-px-c.sh`，三轮各起一套独立页面；`ONLY=<phase>`
   只重跑一条）：帧表侧 8/8 枚按 art ×2 进表且 `filt=1`；`organic` 窗口 600 帧自然战斗只出
   `fx_blast`（盒 27..43，正是 `r = 22 × (1 − 0.4t)` 的区间），其余七枚要特定天赋 / 词缀 /
   武器才上场；`driven` 窗口每轮往世界数组里摆一枚、验完撤下，8/8 上屏，满张盒 = art × 2
   （`fx_blast` 184..186、`fx_chain` `fx_drain` 68、`fx_shield` 44、`fx_poison` `fx_summon` 48、
   `proj_lightning` 24×18——弹体 18×24 被 `angle` 转 90°，AABB 两轴互换）；`still` 窗口把 8 枚
   钉在固定 2×4 scene 栅格同帧摆上，出 `.probe/px/pc-still.png`（`CDP_SHOT_SCALE=2`）作目视档。
   四条实机口径批 D 直接复用：
   ① 视图每帧的 `sync()` 一旦在中途抛异常，排在它后面的图层整帧都不画，所以驱动窗口必须
      一轮一枚各自判通过；② 手搓实体字面量要照抄真对象的字段——投射物少一个 `hit: Set`
      就在 `updateProjectiles` 里抛、弹道根本走不到视图（照抄当场一枚真弹最省事），
      `Fx` 的生命周期字段是 `maxTtl` 而非 `maxTTL`，写成后者 `t` 变 NaN、整枚贴花不显形；
   ③ 贴花半径与不透明度同由 `t` 驱动且反向（nova 走 `r × t`、alpha 走 `(1 − t) × 255`），
      静帧里「满张」与「看得见」不能同时成立，静帧取 t=0.5、满张尺寸由 driven 的区间回报核；
   ④ 世界 → scene 实测为 `scene_x = 玩家 scene_x + dx`、`scene_y = 玩家 scene_y − dy`
      （画布 scene 0..560 × 0..996、y 向上，顶坞压在 scene_y≈866 以上），玩家会游走，
      摆位先读玩家节点的 scene 中心再反解。

   批 D 的取证面是**取景**而不是上屏枚数：背景一屏只画一枚，判据是每档关卡取到该取的那张。
   `bash .probe/p-px-bdx.sh` 起八轮（`bg_stage_1` … `bg_stage_7` + 无限关 `bg_outside`，
   `BD_ONLY=<stage>` 只重跑一档），每轮 `buildBattle()` → `sim.startStage(id, true)` /
   `startEndless()` → `refreshBackdrop()` → `router.show("battle")`，回报十枚 `bg_*` 的贴图尺寸
   与采样档、`Cover` 实际取到的 frame 与绘制盒、修补区几何与底坞的覆盖关系、该绘制点的序栈。
   八轮结论一致：10/10 枚以 560×996 `filt=1` 进帧表，missing 0 / notNearest 0，`Cover` 绘制
   560×996 @0,0（1:1）、UIOpacity 140 且 `Dim` 在位，每轮取到本档那张。截图侧用零依赖块匹配
   坐实（`.probe/px-bg-which.mjs`：对十枚源图做 ±60 位移搜索的零均值 NCC），八档全部本档第一、
   off=0,0，ncc 99~148 对次名 28~48。修补区可见性一并量出：贴图上 x 428..560 / y 941..996 的
   修补块绘制后落在底坞（0,0 560×48）之后，八档一致只露出 7 行，`.probe/px/bdx-band2.png`
   把八档该角 4 倍放大纵排，逐档目视无接缝、无梳状拖影。两条驱动前提记下来：
   ① `cdp-eval.mjs` 与 `cdp-shot.mjs` 是同页两次导航、共用一个 profile，前一轮扣掉的体力会带进
      后一轮，截图轮必须自己把体力顶满；② 顶体力要写到 `shell.sim.save` 而非只写 `shell.save`
      ——开局闸门读前者，写错了 `startStage` 静默返回 false、画面停在上一档背景上，八张图会全部
      拍成 `bg_outside`。回报里带 `scaffold` 与 `energy` 两个字段就是为了当场识破这种
      「图拍到了、拍的不是它」。

验收判据是画面而不是计数：每批出 560×996 实机截图与翻新前同屏对照，逐屏目视通过后再进下一批。
四批（A 图标与底板 / B 单位与立绘 / C 特效与弹道 / D 背景）都按这条走完后，`.probe/px/` 留有
逐屏对照图与八档取景图，`textures/` 目录 158 枚全部为像素档。

收口一轮（2026-09-09）的实机读数：`bash .probe/p-px-oldgen.sh` 跑满 17 屏（exit 全 0）后
`node .probe/oldgen-box-summarize.mjs old` 输出 **0 行**，同口径的像素档为 115 行逐键绘制盒；
`node .probe/oldgen-inventory2.mjs` 的 drawn / manifestOnly / orphan 三路同为 0。画面与计数两条
判据在此一致。
