# 美术资源替换教程(ASSET PIPELINE)

> 美术给的图怎么进游戏:把图按**约定命名**丢进 `public/assets/`,游戏自动加载并替换代码绘制的形状;没放的图自动回退,不会报错。

## 一、目录与命令

| 用途 | 目录 | 命令 |
|---|---|---|
| 浏览器/开发(Web 基准树) | `public/assets/` | `npm run dev` 后直接刷新即可看到 |
| Cocos 构建包(现役) | `cocos/assets/resources/textures/` | `npm run sync:cocos`(单向同步,只新增与覆盖;受保护键清单在脚本里) |
| 微信小游戏 | `minigame/assets/`(由构建自动同步) | `npm run build:minigame` |

- 图片统一放 `public/assets/`;**不要再改任何代码**。Cocos 侧读同一份键名与文件名,加载路径是 `resources.load("textures/<key>/spriteFrame")`,**同名覆盖即生效、视图层零改动**。
- 微信包每次构建时自动把 `public/assets` 复制到 `minigame/assets`(脚本 `scripts/copy-assets.cjs`)。
- 像素档(16-bit 风)不是手丢图:由 `scripts/pixel-kit.mjs`(雪碧图切件 / `atlas` 序列帧)、`scripts/pixel-variants.mjs`(基线件派生赛季变体)、`scripts/pixel-chrome.mjs`(九宫格控件)按 `artwork/pixel-kit-*.json` 规格生成,产线与验收口径见 `docs/UI-PIXEL-REFRESH.md`。

## 二、命名规范(与 `game/data/assets.ts` 清单一一对应,现 154 键)

直接把美术图重命名成清单里的文件名即可,例如:

```
背景:   bg_menu.png / bg_stage_1.png ~ bg_stage_7.png / bg_outside.png
货币:   icon_gold.png / icon_echo.png / icon_stardust.png / icon_ticket.png / icon_fragment.png
卡框:   frame_common.png / frame_rare.png / frame_epic.png / frame_legendary.png / frame_hidden.png
套组:   icon_set_<setId>.png(12 套:thorn/barrage/ember/frost/magma/phantom/glacier/
        blizzard/plague/cinderfang/requiem/veil)
技能图标: icon_fx_<effectType>.png(14 个效果)
玩家:   player.png(缺省件)+ player_<heroId>.png(12 英雄战场件)+ hero_<heroId>.png(半身像)
敌人:   enemy_chaser.png / enemy_swift.png / enemy_tank.png / enemy_elite.png / enemy_reflector.png
        enemy_splitter.png / enemy_hider.png / enemy_devourer.png / enemy_shieldguard.png
        enemy_summoner.png / enemy_splitling.png / enemy_god.png / enemy_boss.png / enemy_goldkind.png
        —— 共 14 个基线 kind;赛季主题怪走 monster_<variantId>.png(120 只,缺图回退 enemy_<kind>)
序列帧: anim_player_<heroId>.png(5 行朝向 × 7 列)/ anim_fx_<type>.png(1×6 帧带)
头像框: avatar_common.png ~ avatar_hidden.png(已接入幻影榜徽标与胜利解锁行)
```

完整清单见 `cocos/assets/scripts/game/data/assets.ts` 和 `public/assets/README.txt`。

## 三、规格要求

- **2x 出图**(设计分辨率 ×2);设计空间宽恒 **560**,战场高锁 **996**(整屏高按屏比在 996~1246 间伸展),全屏背景按此比例出图最稳(超出部分 `cover` 裁切)。
- 格式 PNG(带透明)/ WebP。体积已不再是瓶颈:像素档全量复测后 Cocos 包内贴图 **158 枚共 1,954,271 B**、整包 6,144,511 B(见 `docs/COCOS-MIGRATION.md` Phase 6 实测节)。
- 卡框/面板留出内边距,内容不贴边;敌人贴图**中心对齐**即可(代码按 2.6×半径绘制)。
- 九宫格件(面板/按钮/条底板)必须在 `PIXEL_ART_KEYS` / `NINE_SLICE_KEYS` 里以 `export: 2` 出图,角深由 `drawNineUniform` 自动推导(见 `docs/UI-PIXEL-REFRESH.md`)。

## 四、现在已接好贴图的元素(丢图即生效)

| 元素 | 回退(没图时) |
|---|---|
| 菜单/战斗/场外背景 | 纯色深底 |
| 商店卡、装备行品质框 | 代码描边(`drawQualityFrame`;`frame_*` 竖卡框已退役) |
| 敌人:14 个基线 kind + 120 只赛季变体(`monster_<id>`) | 变体缺图回退 `enemy_<kind>`,再缺才用 `def.color` 圆形 |
| 玩家:`player.png` + 12 枚 `player_<hero>` | 蓝色圆形 |
| 技能/被动/套组图标、序列帧、九宫格底板 | 代码绘制形状 |

## 五、想再接新元素(比如货币图标/按钮)—— 3 步模式

以货币图标为例:

```ts
// 1) cocos/assets/scripts/game/data/assets.ts 清单里加一行(如果还没有)
icon_gold: "icon_gold.png",

// 2) 绘制处用 assets.draw,失败回退原绘制
//    (game.ts 的 currency 绘制处)
if (!this.assets.draw(g, "icon_gold", x, y, 22, 22)) {
  g.fillStyle = "#ffd76a";
  g.fillText("✦", x, y);
}
```

步骤只有两条:清单加 key → 绘制处 `assets.draw()` 优先、原画法兜底。`assets.draw(ctx, key, x, y, w, h, "cover"?)` 返回 `true/false`。Cocos 侧同一枚键走 `GameShell.loadFrames` 的帧注册表 + 视图层 `frames.get(key)`,缺帧时落回同一套代码绘制,两侧语义一致。

## 六、常见问题

- **图没显示?** 检查:文件名是否与清单完全一致(小写/下划线);浏览器刷新(可强制 Ctrl+F5);微信端需重新 `npm run build:minigame`。
- **图太大/背景变形?** 背景用 `cover` 模式(等比放大裁切),两侧多出的部分会被裁掉——出图按 9:16 竖屏比例最稳。
- **想用九宫格面板?** 已经有了:Web 侧 `drawNine`(`src/ui/skin.ts`),Cocos 侧 `drawNineUniform`(角深按源图自动推导),键要登记进 `game/data/pixelArt.ts` 的 `NINE_SLICE_KEYS` 并以 `export: 2` 出图,否则角饰会被整幅拉伸压扁。
