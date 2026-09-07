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
node scripts/pixel-kit.mjs [--out=dir] [--contact] [--only=k1,k2] [--dry]
```

源图要求：

1. 背景一律**平涂 `#FF00FF`**（管线按格边众数色自动抠底，不依赖这个字面值，但平涂底是最稳的）。
2. 按 `grid.cols × grid.rows` 均分，每格一枚内容；`inset` 是每格向内收缩的比例，用来躲开格线。
3. 每格内容两种模式之一：**贴边**（面板/底板类，内容铺满整格，靠洪水填充保不住 → 用 `fit: "stretch"` + `slice`）或**留空**（图标/字形类，四周留透明边距，`cropBBox` 会裁到内容包围盒）。
4. 目标 art 尺寸写在格子的 `art` / `artH` 上；生成图内容长宽比与 art 盒差 >45% 时管线会警告（重采样会失真）。

管线步骤（确定性，同配置重跑逐字节一致）：切格 → 洪水填充抠底 → alpha bbox 裁剪 → 最近邻重采样到 art 网格 → 量化到 33 色（Bayer 抖动）→ alpha 硬化 → 九宫格可拉伸带平整 → 导出 PNG。

源图前缀在 `vibe_images/`，文件名带时间戳后缀；`resolveSrc()` 自动取同前缀最新一张。

## 5. 落地资产的保护规则

- 本批 39 张贴图落在 `cocos/assets/resources/textures/`，**同名覆盖、key 名不变**，加载通路沿用 `resources.load("textures/<key>/spriteFrame")`。
- `npm run sync:cocos` 是 Web→Cocos 单向镜像。`scripts/sync-cocos.mjs` 现在把 `artwork/pixel-kit*.json`（主菜单批 `pixel-kit.json` + 战斗 HUD 批 `pixel-kit-hud.json`）里声明的每个 key 当作 **Cocos 独占资产**：这些 png 一律不回灌，日志末尾打印保护条数。新增批次只要进任一规格表就自动受保护。
- `pxnum_*` 与 `crest` 不在 `ASSET_MANIFEST`（Web 侧会 404），由 `PIXEL_ART_KEYS` 直接进预载集；`restFrameKeys()` 已把它们从流式队列里摘出。

## 6. 像素数字字形

- 字形表：`pxnum_0..9` `pxnum_dot` `pxnum_comma` `pxnum_plus` `pxnum_times` `pxnum_pct` `pxnum_slash`，art 8×10（PNG 同为 8×10，1 贴图像素 = 1 逻辑 px 落屏，需要整体放大时用 `PixelNumber` 的整数 `scale`）。
- 组件：`cocos/assets/scripts/ui/PixelNumber.ts`。每个字形一枚 Sprite，等距推进（`advance` 默认 12 逻辑 px）、支持 tint、整数倍 scale、left/center/right 对齐；`setText()` 返回 `false` 表示串里有字形表外的字符，此时组件自我隐藏。
- 中文与混排（如 `12.5万`）继续走 `ui/Widgets.ts:label()` 系统字体通路。
- 本单接线范围：主菜单货币条三枚筹码的数字。其它屏待各自批次。

## 7. 逐屏翻新进度

「换皮」= 新贴图接进现有布局并跑通通路；「重排」= 按 art 网格调整几何（独立单，尚未开工）。

| # | 屏 | 换皮 | 重排 |
| --- | --- | --- | --- |
| 1 | menu 主菜单 | ✅ | ☐ |
| 2 | battle 战斗 | ✅ | ☐ |
| 3 | shop 商店 | ✅ | ☐ |
| 4 | heroes 英雄 | ☐ | ☐ |
| 5 | gearup 装备 | ☐ | ☐ |
| 6 | gacha 扭蛋 | ☐ | ☐ |
| 7 | pass 通行证 | ☐ | ☐ |
| 8 | daily 每日 | ☐ | ☐ |
| 9 | commission 委托 | ☐ | ☐ |
| 10 | fusion 合成 | ☐ | ☐ |
| 11 | prestige 轮回 | ☐ | ☐ |
| 12 | season 赛季 | ☐ | ☐ |
| 13 | leaderboard 排行 | ☐ | ☐ |
| 14 | energy 体力 | ☐ | ☐ |
| 15 | victory 通关 | ☐ | ☐ |
| 16 | gameover 失败 | ☐ | ☐ |
| — | confirm 常驻弹层 | ☐ | ☐ |

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
