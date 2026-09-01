# 美术图层映射表(108 张)

来源:美术交付的图层包(`Downloads/新建文件夹/`,`N - layer_HASH.png`,N=0..107)。
处理脚本:`scripts/import-artwork.mjs`(纯 Node,可重复执行)。

两个去向:
- **96 张**对应 `src/data/assets.ts` 清单 → 复制进 `public/assets/`(首批 27 张 + 本次全量实装新增 69 张);
- **全部 108 张**按语义命名归档到 `artwork/ui-kit/`,清单键名即归档名(两个 NOTE 后缀已去掉:`badge_star_gold`、`icon_wechat_share`)。

清单中未被美术覆盖的 16 个 key(10 背景 + 6 敌人)由 AI 按同风格补全,见文末。
清单现为 **129 key**(美术翻新批次新增 4 键:3 按钮板 + 金星图标;标题栏批次专属生成 1 键 `banner_title_abyss`;圈定底板批次新增 5 键,其中 `hud_panel_left`/`hud_panel_right`/`equip_card_plate` 已随战斗双坞重排退役;双坞批次新增 2 键 `hud_dock_top`/`hud_dock_bottom`;HUD 二轮批次新增 8 键 `icon_fx_*` 装备效果图标),与 `public/assets/` 文件一一对应;接线方式见「三、实装归宿」。

---

## 一、进游戏的 27 张(美术 → public/assets/)

| 图层# | 归档名 | 游戏资产 |
|---|---|---|
| 0 | avatar_frame_legendary | avatar_legendary.png |
| 1 | avatar_frame_rare | avatar_rare.png |
| 2 | avatar_frame_epic | avatar_epic.png |
| 3 | avatar_frame_common | avatar_common.png |
| 4 | avatar_frame_hidden | avatar_hidden.png |
| 5 | icon_gold | icon_gold.png |
| 6 | icon_echo | icon_echo.png |
| 7 | icon_stardust | icon_stardust.png |
| 8 | icon_ticket | icon_ticket.png |
| 9 | icon_fragment | icon_fragment.png |
| 37 | card_frame_common | frame_common.png |
| 38 | card_frame_rare | frame_rare.png |
| 39 | card_frame_epic | frame_epic.png |
| 40 | card_frame_legendary | frame_legendary.png |
| 41 | card_frame_hidden | frame_hidden.png |
| 49 | icon_set_thorn | icon_set_thorn.png |
| 50 | icon_set_barrage | icon_set_barrage.png |
| 51 | icon_set_ember | icon_set_ember.png |
| 67 | player_pose_3_main | player.png(主角主姿态) |
| 85 | enemy_chaser | enemy_chaser.png |
| 86 | enemy_splitter | enemy_splitter.png |
| 87 | enemy_tank | enemy_tank.png |
| 88 | enemy_elite | enemy_elite.png |
| 89 | enemy_devourer | enemy_devourer.png |
| 90 | enemy_swift | enemy_swift.png |
| 91 | enemy_summoner | enemy_summoner.png |
| 98 | enemy_boss | enemy_boss.png |

注:`icon_*`、`icon_set_*` 已接入货币行/套组按钮/奖励行(见「三、实装归宿」);`avatar_*` 头像框已接入幻影榜玩家行徽标与胜利面板解锁行(美术翻新批次,`drawAvatarFrame`)。

## 二、归档全量(图层# → artwork/ui-kit/ 语义名)

### 头像框 / 图标 / 徽章(0-9)
| # | 名称 |
|---|---|
| 0-4 | avatar_frame_legendary / rare / epic / common / hidden |
| 5-9 | icon_gold / icon_echo / icon_stardust / icon_ticket / icon_fragment |
| 10 | crest_echo(回响纹章) |

### 按钮(11-15)
| # | 名称 |
|---|---|
| 11 | btn_close |
| 12 | btn_back |
| 13 | btn_settings |
| 14 | btn_sound_on |
| 15 | btn_sound_off |

### 标题横幅 / 大横幅(16-21)
| # | 名称 |
|---|---|
| 16-18 | banner_title_gold_a/b/c |
| 19 | banner_title_iron |
| 20-21 | banner_large_navy_a/b |

### 徽章 / 头像底(22-26)
| # | 名称 |
|---|---|
| 22 | avatar_default_silhouette |
| 23 | badge_shield_bronze |
| 24 | badge_pennant_purple |
| 25 | badge_star_gold_NOTE_selection_box(疑似选框,用途待确认) |
| 26 | badge_gem_purple |

### 中幅横幅(27-36)
| # | 名称 |
|---|---|
| 27-28 | banner_mid_navy / banner_mid_navy_b |
| 29 | banner_mid_red |
| 30 | banner_mid_black |
| 31 | banner_large_red |
| 32 | banner_large_purple |
| 33 | banner_mid_iron |
| 34 | banner_mid_blue |
| 35 | banner_mid_red_b |
| 36 | banner_mid_bronze |

### 品质卡框(37-41)
| # | 名称 |
|---|---|
| 37-41 | card_frame_common / rare / epic / legendary / hidden |

### 面板 / 页签 / 排版样例(42-48)
| # | 名称 |
|---|---|
| 42 | panel_equip_grid |
| 43 | panel_dark_corners |
| 44 | panel_parchment |
| 45 | banner_purple_cosmic |
| 46 | tabs_talent_three |
| 47 | mock_menu_entries(菜单排版稿) |
| 48 | panel_ranking |

### 套组图标(49-51)
| # | 名称 |
|---|---|
| 49-51 | icon_set_thorn / icon_set_barrage / icon_set_ember |

### 通行证 / 进化槽(52-53)
| # | 名称 |
|---|---|
| 52 | panel_pass_tracks |
| 53 | panel_evolve_slots |

### 敌情情报(54-57)
| # | 名称 |
|---|---|
| 54-57 | intel_horde / intel_armor / intel_mutant / intel_elite |

### 环境词缀图标(58-64)
| # | 名称 |
|---|---|
| 58 | affix_space_warp |
| 59 | affix_heal_aura |
| 60 | affix_time_dilation |
| 61 | affix_reflect_field |
| 62 | affix_death_chain |
| 63 | affix_mist |
| 64 | affix_boss |

### 主角姿态(65-70)
| # | 名称 |
|---|---|
| 65-70 | player_pose_1..6(67 = 主姿态,已用作 player.png) |

### 主菜单入口(71-75)
| # | 名称 |
|---|---|
| 71-75 | entry_gacha / entry_talents / entry_pass / entry_quests / entry_forge |

### 血条 / 特效 / 弹体(76-83, 94)
| # | 名称 |
|---|---|
| 76 | bar_hp |
| 77-83 | fx_nova / fx_poison / fx_shield / fx_drain / fx_blast / fx_chain / fx_summon |
| 94 | proj_lightning |

### 进度条(84, 92-93, 100-102)
| # | 名称 |
|---|---|
| 84 | bar_progress_blue |
| 92 | bar_progress_gold |
| 100 | bar_progress_purple |
| 101 | bar_progress_blue_b |
| 102 | bar_progress_teal |
| 93 | bar_pass_nodes |

### 敌人像素图(85-91, 98)—— 已进游戏
见第一表。

### 杂项(95-99)
| # | 名称 |
|---|---|
| 95 | frame_highlight_gold |
| 96 | emblem_flow_gold |
| 97 | mark_check_green |
| 99 | icon_wechat_share_NOTE_cropped(带裁切痕迹,接入分享前需确认) |

### 伤害数字 / Boss 条 / 分隔(103-107)
| # | 名称 |
|---|---|
| 103-105 | dmgtext_normal / dmgtext_crit / dmgtext_heal |
| 106 | bar_boss_hp |
| 107 | divider_bar_dark |

---

## 三、实装归宿(本次新增 69 张 → 渲染层)

原则:**原位换皮**——布局/命中矩形不动,贴图优先(`assets.draw()`),缺失自动回退原代码绘制(`src/ui/skin.ts` 助手 + 调用点内联回退)。

| 资产组 | 实装点 |
|---|---|
| banner_large_navy_a | 主菜单标题底板 + 胜利结算标题底板 |
| banner_large_navy_b | 新手引导横幅底板 |
| banner_large_red / banner_large_purple | 阵亡标题底板 / 扭蛋标题底板 |
| banner_title_gold_b / banner_title_gold_c | 通行证 / 每日福利 标题(原商店消费点条目 38 移除;gold_a 预留未接) |
| banner_title_iron | 委托挂机标题 |
| banner_mid_navy | 确认弹窗标题小底板 + 商店分区标题条(武器管理/进化,条目 38) |
| banner_mid_red / banner_mid_red_b | Boss 出场横幅 / 连杀计数底板 |
| banner_mid_black / banner_mid_blue / banner_mid_bronze | 体力不足 / 装备融合 / 赛季结算 标题底板 |
| banner_purple_cosmic | 转生与天赋标题底板 |
| btn_close / btn_back | 确认弹窗取消钮图标 / 扭蛋·通行证·委托返回钮图标 |
| panel_dark_corners / panel_parchment | 确认弹窗面板 / 委托进行面板(贴图上文字切深色) |
| tabs_talent_three | 天赋三系页签整条打底 |
| badge_shield_bronze | 玩家护盾>0 时血条右端徽标 |
| badge_pennant_purple / badge_gem_purple / badge_star_gold | 通行证高级轨行首 / 钻石货币图标 / 选中套组角标 |
| crest_echo / emblem_flow_gold | 主菜单标题角饰 / 赛季结算纹章 |
| mark_check_green | 关卡已通✓ / 天赋已拥有 / 通行证已领取 |
| frame_highlight_gold | 选中套组按钮包框(原商店选中武器行包框条目 38 改代码品质卡框选中色) |
| affix_*(7) | HUD 环境词缀行图标 + Boss 条标签 |
| intel_*(4) | HUD/商店敌情行图标 |
| bar_hp / bar_boss_hp | 玩家血条 / Boss 血条(遮罩法)—— 战斗态已改代码胶囊渐变条 `drawBar`(HUD 二轮,条目 37);贴图仍服务非战斗 `skinBar` 消费点(套组/通行证/保底/离线) |
| bar_progress_blue/gold/purple/teal/blue_b | 套组进度 / ~~章节倒计时~~(战斗态改代码胶囊条 `drawBar`,条目 37)/ 通行证总进度 / 委托全额收益窗口 / 扭蛋保底×2 |
| bar_pass_nodes | 通行证档位轨道打底 |
| divider_bar_dark | 预留未接(原"商店武器管理分隔"从未绘制;条目 38 分区标题条改走 banner_mid_navy) |
| fx_*(7) | 特效贴图化(新星→nova、爆炸→blast、闪电→chain、护盾→shield、治疗→drain、毒池垫底→poison、骷髅召唤→summon) |
| proj_lightning | 射线弹体旋转贴图 |
| player_pose_1/2/4/5/6 | 胜利 / 每日 / 阵亡(半透明) / 天赋 / 委托 装饰 |
| entry_*(5) | 主菜单五入口按钮图标(每日钮复用 entry_forge) |
| btn_primary / btn_minor / btn_danger(AI 生成) | 九宫格按钮底板(`skinButtonBase`/按钮组件):广告主操作 / 次级按钮 / 危险操作;禁用态保持平面灰 |
| panel_dark_corners | 8 屏全屏面板底垫(`panelPad` 九宫格内缩铺满):通行证/扭蛋/委托/每日/幻影榜/体力/转生/融合(商店条目 38 改双坞骨架退出) |
| icon_star_gold(AI 生成) | 菜单关卡行与胜利面板星数图标(缺图回退 ★ 字形) |
| banner_title_abyss(AI 生成) | ~~主菜单标题栏专属横幅~~ → 被 `menu_title_plate` 取代(条目 35);键与文件保留 |
| avatar_common/rare/epic/legendary | 幻影榜玩家行徽标 + 胜利面板关卡框解锁行(`drawAvatarFrame`,缺图回退代码金圈) |
| menu_title_plate(AI 生成) | 主菜单标题栏底板(580×61,九宫格拉伸;缺图回退深紫平面面板) |
| menu_strip_plate(AI 生成) | 主菜单货币行/幻影榜条带底板(548×26;缺图回退深藏青平板 + 金色细描边) |
| ~~hud_panel_left / hud_panel_right(AI 生成)~~ | 被 `hud_dock_top`/`hud_dock_bottom` 取代(条目 36:战斗双坞重排);键与文件已删除 |
| ~~equip_card_plate(AI 生成)~~ | 被双坞装备横排取代(条目 36);卡底改代码深底,键与文件已删除 |
| hud_dock_top / hud_dock_bottom(AI 生成) | 战斗上下双坞底板 + 商店顶信息条/底操作条复用(条目 38;1120×128 / 1120×96,比例==显示比例 8.75 / 11.667,直接等比拉伸零变形;缺图回退深色渐变 + 1px 紫光描边) |
| icon_fx_knife/nova/skeleton/cloud/ray/chain/shield/drain(AI 生成) | 底坞装备卡效果图标(24×24,键 = `icon_fx_${效果类型}`,HUD 二轮批次条目 37;缺图回退代码品质色圆底 + 效果名首字) |
| bg_shop | 商店态背景 + 信箱 cover(条目 38 首接;此前在册从未绘制;其上单层 `rgba(8,10,16,0.82)` 压暗) |
| ~~frame_common..hidden(37-41)~~ | 原商店竖卡框拉伸消费(畸变)条目 38 改代码品质卡框 `drawQualityFrame`(圆角暗底 + 品质色描边/内发光/顶条);键与文件保留转预留 |

## 四、预留不接(附理由)

| 资产 | 理由 |
|---|---|
| btn_settings / btn_sound_on / btn_sound_off | 无设置/声音系统,待功能落地 |
| icon_wechat_share | 入清单不调用;分享需平台适配层新 API |
| avatar_default_silhouette | 默认头像底,暂无头像选择界面(5 个品质框已在幻影榜/胜利面板接入) |
| dmgtext_normal/crit/heal | 数字烤死在图里("1125"),无法组任意数值;现有飘字配色已达成同语义 |
| panel_equip_grid / panel_pass_tracks / panel_ranking / mock_menu_entries / panel_evolve_slots | 内容烤死的排版样稿,仅归档参考 |
| banner_mid_navy_b / banner_mid_iron | 横幅坑位储备 |

---

## 五、AI 补全(34 张,同风格生成后处理)

生成源图在 `vibe_images/`,经脚本处理(去右下角生成水印;敌人精灵抠背景 + 降采样 256×256;效果图标抠白底 + 降采样 96×96)后写入 `public/assets/`。

| 资产 | 尺寸 | 说明 |
|---|---|---|
| bg_menu / bg_outside / bg_shop | 1024×1792 | 黑暗奇幻绘画风 |
| bg_stage_1..7 | 1024×1792 | 对应 7 章场景(尸潮→王座之间) |
| enemy_reflector / enemy_hider / enemy_shieldguard / enemy_splitling / enemy_god / enemy_goldkind | 256×256 | 16-bit 像素风,与美术敌人同规格;含金怪(清单新增 `enemy_goldkind`) |
| btn_primary / btn_minor / btn_danger | 640×~200 | 美术翻新批次:暗黑奇幻金属按钮板;亮度投影裁边(`cropButtonPlate`)+ 降采样宽 640,九宫格拉伸使用 |
| icon_star_gold | 128×128 | 美术翻新批次:金色星星图标;抠背景 + 降采样,星数显示用(缺图回退 ★ 字形) |
| banner_title_abyss | 580×61 | 标题栏批次:深渊紫域 + 两端回响焰 + 底部金线;源图 2560×1080,修补右下角水印后裁横带 y775–1045 + 区域平均降采样;处理脚本 `scripts/build-title-banner.mjs` |
| menu_title_plate | 580×61 | 圈定底板批次:哥特紫框面板底缘横带;源图 2560×1080,取左侧水印安全区(亮像素审计=0)+ 水平镜像补右半,按 9.45:1 裁底带降采样 |
| menu_strip_plate | 548×26 | 圈定底板批次:藏青金饰横幅中心平滑带;源图 2560×1080,中心横带天然远离底缘水印,直接裁带降采样 |
| ~~hud_panel_left / hud_panel_right~~ | 已退役(条目 36):九宫格把 96-129px 角饰压进 12-14px(7-8:1)装饰全丢,随双坞重排删除 |
| ~~equip_card_plate~~ | 已退役(条目 36):同上,装备卡改底坞横排代码深底,删除 |
| hud_dock_top / hud_dock_bottom | 1120×128 / 1120×96 | 双坞批次:满幅暗色拉丝金属条板,源图 2560×1080;探测式水印修补 → 紫光包围盒 → 中心条带裁切(比例==显示比例 560/64、560/48)→ @2x 降采样 + alpha 235 |
| icon_fx_knife/nova/skeleton/cloud/ray/chain/shield/drain(8 张) | 96×96 | HUD 二轮批次(条目 37):16-bit 像素风暗黑奇幻技能图标,**纯白背景**源图(`cutoutBackground` 吃白底)→ 水印修补 + 抠白底(tolerance 26)+ 降采样 96(`import-artwork.mjs` sprite 降采样尺寸由硬编 256 参数化为规格表 `size` 字段);边缘审计:水印残留特征 ≈0、白底残留边缘 ≈0 |

以上处理脚本 `scripts/build-ui-plates.mjs`(纯 Node PNG 编解码,可复现;现输出 4 张:菜单两板 + 战斗双坞板)。

清单 129 key 现已全部有文件;缺图回退逻辑仍保留,删图不会崩。
