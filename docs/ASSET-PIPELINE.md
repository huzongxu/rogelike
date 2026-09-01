# 美术资源替换教程(ASSET PIPELINE)

> 美术给的图怎么进游戏:把图按**约定命名**丢进 `public/assets/`,游戏自动加载并替换代码绘制的形状;没放的图自动回退,不会报错。

## 一、目录与命令

| 用途 | 目录 | 命令 |
|---|---|---|
| 浏览器/开发 | `public/assets/` | `npm run dev` 后直接刷新即可看到 |
| 微信小游戏 | `minigame/assets/`(由构建自动同步) | `npm run build:minigame` |

- 图片统一放 `public/assets/`;**不要再改任何代码**。
- 微信包每次构建时自动把 `public/assets` 复制到 `minigame/assets`(脚本 `scripts/copy-assets.cjs`)。

## 二、命名规范(与 `src/data/assets.ts` 清单一一对应)

直接把美术图重命名成清单里的文件名即可,例如:

```
背景:   bg_menu.png / bg_stage_1.png ~ bg_stage_7.png / bg_outside.png
货币:   icon_gold.png / icon_echo.png / icon_stardust.png / icon_ticket.png / icon_fragment.png
卡框:   frame_common.png / frame_rare.png / frame_epic.png / frame_legendary.png / frame_hidden.png
套组:   icon_set_thorn.png / icon_set_barrage.png / icon_set_ember.png
玩家:   player.png
敌人:   enemy_chaser.png / enemy_swift.png / enemy_tank.png / enemy_elite.png / enemy_reflector.png
        enemy_splitter.png / enemy_hider.png / enemy_devourer.png / enemy_shieldguard.png
        enemy_summoner.png / enemy_splitling.png / enemy_god.png / enemy_boss.png
头像框: avatar_common.png ~ avatar_hidden.png(预留)
```

完整清单见 `src/data/assets.ts` 和 `public/assets/README.txt`。

## 三、规格要求

- **2x 出图**(逻辑分辨率 ×2);全屏背景按 480×854 逻辑 = **960×1708**。
- 格式 PNG(带透明)/ WebP;单图 ≤200KB,背景 ≤500KB(微信主包 4MB 限制)。
- 卡框/面板留出内边距,内容不贴边;敌人贴图**中心对齐**即可(代码按 2.6×半径绘制)。

## 四、现在已接好贴图的元素(丢图即生效)

| 元素 | 回退(没图时) |
|---|---|
| 菜单/战斗/场外背景 | 纯色深底 |
| 商店卡、装备行 5 档品质框 | 代码描边 |
| 13 种敌人 | 彩色圆形 |
| 玩家 | 蓝色圆形 |

## 五、想再接新元素(比如货币图标/按钮)—— 3 步模式

以货币图标为例:

```ts
// 1) src/data/assets.ts 清单里加一行(如果还没有)
icon_gold: "icon_gold.png",

// 2) 绘制处用 assets.draw,失败回退原绘制
//    (game.ts 的 currency 绘制处)
if (!this.assets.draw(g, "icon_gold", x, y, 22, 22)) {
  g.fillStyle = "#ffd76a";
  g.fillText("✦", x, y);
}
```

步骤只有两条:清单加 key → 绘制处 `assets.draw()` 优先、原画法兜底。`assets.draw(ctx, key, x, y, w, h, "cover"?)` 返回 `true/false`。

## 六、常见问题

- **图没显示?** 检查:文件名是否与清单完全一致(小写/下划线);浏览器刷新(可强制 Ctrl+F5);微信端需重新 `npm run build:minigame`。
- **图太大/背景变形?** 背景用 `cover` 模式(等比放大裁切),两侧多出的部分会被裁掉——出图按 9:16 竖屏比例最稳。
- **想用九宫格面板?** 当前卡框/面板是拉伸绘制;后续要做 9-slice 时在 `AssetManager` 加 `frame9` 方法即可(面板图标注切分线)。
