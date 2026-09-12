# S1「回响苏醒」怪物与英雄重绘:Holopix 工作流与 prompt 包

> 配套规格:`artwork/pixel-kit-s1-ai.json`(雪碧图 → 切格 / 抠底 / 裁框 / 量化);产线:`scripts/pixel-kit.mjs`。
> **已落地(2026-09-12)**:在 holopix.cn 画板 253432 用「全能编辑 V3 · 高清 2K · 16:9」出了三张 2048×1152 品红底雪碧图(英雄三人并排 / 特性 6 只 3×2 / 精英 4 + 首领 2 3×2),每张 35 算力,源图存 `vibe_images/px_sheet_s1_{heroes,a,b}_1.png`(gitignored)。18 枚贴图已同键落库:`hero_vera/kyle/bran`(半身像)、`player_vera/kyle/bran`(战斗件)、12 只 `monster_*`;`artwork/pixel-kit-s1.json` 里对应 15 格已打 frozen。下文第三、四节的 prompt 就是实际使用的版本;第二节的「一幅画出两枚贴图」在英雄表上按格实现(同一 rect 两个 cell)。
>
> **Holopix 操作要点**(自由画布,图片生成面板):模型选「全能编辑 V3」(35 算力/张,不必开企业专线的透明直出,品红底走既有色键);尺寸「高清 2K」+ 比例 16:9;「提示增强」是按下即扣 1 算力的一次性改写按钮,不点;输入框是 contenteditable,**「全部清空」会弹确认,不点「确定」内容不会清,直接再输入会插进旧 prompt 中间**(本次因此多花 35 算力出了一张英雄 + 怪物的混合表);任务进队列后没有取消入口;生成结果的原图 URL 形如 `https://genai.holopix.cn/<日期>/<uuid>.png`(去掉 `?x-oss-process=` 后缀即原图),可直接 curl 下载。

## 一、为什么用 Holopix 也不用换产线

Holopix AI(holopixai.art)是网页版游戏资产生成器:文生图 / 图生图、角色一致性(Pose Transfer / Clothing Transfer / Character Body Editor)、Background Remove、多风格模型;没有公开 API,所以生成在网页里手动做。产线只吃 PNG:把它导出的透明底图放进 `vibe_images/`,`pixel-kit` 负责 alpha 硬化、最近邻重采样到目标像素格、量化到 56 色深渊表。**像素风由产线最后一步保证**,生成器选像素风格模型只是让重采样后的块面更干净;它出的是高清像素风也好、普通插画也好,都能进。

## 二、半身像与战场小人一致:一幅画出两枚贴图

每位英雄**只生成一张全身图**(实际做法:三人并排一张表,规格里同一组 `rects` 挂两组 `cells`)。产线用同一张图:整框 → 战斗小人 `player_<id>`(44 px);内容框上部 `crop: [0.12, 0, 0.76, 0.4]` → 半身像 `hero_<id>`(84 px,`fit: cover` 铺满)。两枚贴图是同一幅画的两个取样,发色、服色、武器、纹样不可能对不上。生成器给出朝左的角色(本次是布兰)用格上的 `flipX: true` 掰正,半身像与战斗件同格同翻,仍一致。

因此全身图要满足:

- **竖幅、角色占满高度**,导出 ≥ 1024 px 高(头部约 200 px,缩到半身像 84 盒后仍有细节);
- **头肩区域在画面上 42% 以内**,头顶不出框、不戴超出肩宽太多的巨型头饰(裁半身时会切掉);
- **面朝右、正面偏 3/4**(引擎按移动方向水平翻转,基线件全部朝右);
- **不要地面、不要投影**;背景用 Holopix 的 Background Remove 去掉后导出透明 PNG(若导出的是品红平涂底,把规格里该格的 `keyout: "alpha"` 删掉即回到色键路径)。

半身像的构图(`crop` 的四个数)是按「头在上 42%」预设的,图到了之后看接触表微调 —— 只改数字,不用重出图。若想给半身像更好看的构图(比如侧脸、肩上有武器),可以用 Holopix 的图生图 / Quick edit 以全身图为参照另出一张胸像,**但必须和全身图同一次风格模型、同一套颜色**;落库前用 `--contact` 把两枚并排看,不一致就退回裁切方案。

## 三、英雄三人(`px_sheet_s1_heroes_*.png`,三人并排一张 16:9 表)

三人同一张表、同一段通用前缀,只换角色描述,风格天然一致。主色 = 各自套组色。实际提交的是「前缀 + 三段角色描述(LEFT / MIDDLE / RIGHT)」拼成的一条 prompt,并把背景写成 flat solid magenta #FF00FF。

通用前缀:

```
16-bit dark fantasy pixel art, full-body game character, standing pose facing right, front three-quarter view,
whole figure visible from head to feet, head and shoulders within the top 40% of the frame,
1px dark outline, flat shading with limited palette, cold abyss navy base tones,
plain solid background, no ground, no shadow, no text, no watermark.
```

| 英雄 | 套组 / 主色 | 角色描述(接在前缀后) |
|---|---|---|
| 薇拉 · 荆肤者 | 荆棘回响 `#4dffc8` | `Vera, a hooded rogue in dark leather, pale face half in shadow under the hood, twin daggers, thorn-vine tattoos glowing teal-green (#4dffc8) on arms and neck, teal trim and eyes` |
| 凯尔 · 织雨工匠 | 弹幕风暴 `#5ac8fa` | `Kyle, an armored artificer-knight in a plumed steel helmet with visor down, sky-blue (#5ac8fa) plume and shoulder gems, a compact repeating crossbow on the right arm, tool belt` |
| 布兰 · 燎原者 | 余烬天灾 `#ff9d2e` | `Bran, a broad bearded warrior with scarred face and heavy pauldrons, ember-orange (#ff9d2e) war paint and glowing eyes, a smoldering greatsword resting on the shoulder, embers drifting off the blade` |

原图下载后命名 `px_sheet_s1_heroes_<n>.png` 放进 `vibe_images/`(`resolveSrc()` 取同前缀最新一张)。

## 四、怪物 12 只(`px_sheet_s1_a_*.png` 特性 6 只 / `px_sheet_s1_b_*.png` 精英 4 + 首领 2,各一张 3×2 表)

一张表六只,同一段前缀 + 六段编号造型(Top row / Bottom row 左到右),品红底。首领两只在 prompt 里写明 larger than the others。表 b 的首领会横跨等分线,规格里按实测逐格手钉 `rects`。

通用前缀:

```
16-bit dark fantasy pixel art game enemy, single creature centered, facing right, front three-quarter view,
1px dark outline, flat shading, cold abyss navy base with violet "echo" glow accents (#7a5cff, hot spots #c8b6ff),
plain solid background, no ground, no shadow, no text, no watermark, silhouette readable at 40 px.
```

| 键 | 名 | 造型(接在前缀后) |
|---|---|---|
| monster_splitting_tone | 裂鸣体 | `a yellow-green slime mass covered in glowing violet fracture cracks about to split` |
| monster_mute_hider | 消音隐者 | `a deep-purple cloaked wraith whose silhouette dissolves into pixel mist at the edges, only two violet eyes inside the hood` |
| monster_wound_reflector | 鸣伤反射者 | `an ice-blue crystalline humanoid with a mirror chest plate reflecting violet light, faceted surfaces` |
| monster_sound_devourer | 吸声者 | `a teal eyeless devourer whose gaping mouth is half its body, pitch-black maw lit violet inside, jagged teeth` |
| monster_hum_wallguard | 驻鸣护壁 | `a grey-blue armored stout giant holding up a humming translucent sound-wall of concentric violet arcs in front` |
| monster_echo_seed | 回响之种 | `an orange-red robed summoner cradling a glowing violet seed pod veined with light` |
| monster_tone_leader | 领鸣者 | `a red-and-black armored elite wearing a shattered amethyst crown, a glowing violet throat sac` |
| monster_abyss_herald | 深渊传声者 | `a tall gaunt crimson herald with three violet throat sacs in a row on neck and chest, like bagpipes` |
| monster_myriad_bone_marshal | 万骸指挥 | `a bone-armored marshal holding a bone baton, shoulders hung with bone beads and tiny skulls, violet eye sockets` |
| monster_first_echo | 第一回音 | `a translucent violet humanoid after-image shaped like a swordsman silhouette, trailing two fainter echoes behind it` |
| monster_primeval_echo | 初代回响 | `(boss, fill the frame) a hulking demon whose body is a network of glowing violet sound sacs linked by light veins, one master sac on the chest, sound-wave arcs around it` |
| monster_empty_valley_lord | 空谷之主 | `(boss, fill the frame) an abyss behemoth with a wide flat maw spanning its whole head, pitch-black inside, curved horns on both sides` |

## 六、S1 英雄八方向序列帧 + 攻击帧 + 技能特效帧动画(2026-09-12 已落地,三英雄)

**布局约定**(`cocos/assets/scripts/game/ui/spriteAnim.ts`):单位图集 `anim_player_<hero>` = 5 行朝向 S / SE / E / NE / N × 7 列(行走 4 + 攻击 3),每格 44;朝西四向靠水平镜像东侧行。技能帧带 `anim_fx_<type>` = 1 行 × 6 列。渲染在 `battle/BattleWorldView.ts`:玩家按本帧位移方向选行(世界坐标 y 向下为正,与摇杆 / WASD 同向)、移动播行走 4 帧、静止停首帧并保持朝向;**玩家不播攻击帧**(技能自动施放,出手不该改写走位朝向;攻击 3 列现与站姿同源占位,留给日后手动技能);敌人按 facing 选行、接触冷却被重置时播攻击 3 帧;一次性特效按生命周期进度选帧,毒池 / 召唤阵按 elapsed 循环;缺图集一律回退单帧。

**朝向核对(2026-09-12 二轮)**:生成器的八方向图**左右并不对称**,不能按「环形布局」推朝向,必须逐格实看(脸朝哪边、武器指哪边、背面看近侧是哪只手臂):薇拉中右 / 下右是 W / NW 不是 E / NE;凯尔上排四个全是正面、下排 1/3/4 才是背面;布兰上左是 SW 不是 SE。首版按环形假设选格,E / NE 行拿到了朝左的图,再被引擎按 E 不翻转、W 翻转 → 玩家往右走面朝左、往左走面朝右,即「朝向与操作相反」。修正后每位英雄的五格在 `artwork/pixel-kit-anim-s1.json` 的 `$comment` 里逐格写明。

**Holopix 素材链(每位英雄)**:
1. 「八方向行走模板图」(角色模板,35 算力):输入角色正面图 → 2400×1792 白底八朝向图。布局不稳定:薇拉 / 布兰第二版是 3-2-3 环形(上正面 / 中侧面 / 下背面),凯尔是 4-2-4(上背面 / 中侧面 / 下正面),布兰第一版没出背面 → 用「自定义动作」写明 top row must be the BACK views 重出。逐格用 `scripts/anim-cells.mjs` 探包围盒,再手钉 S/SE/E/NE/N 五个格。
2. 「八方向行走动画」(视频模板,MiniMax H3 首尾帧,270 算力):首帧 = 尾帧 = 同一张八方向图 → 5 s 768P 视频里 8 个朝向原地行走。
3. 「转序列帧」(25 算力,固定 8 fps):43 帧 1024×768,直链 `genai.holopix.cn/<日期>/Holopix<ts>-<hash>_000NN_.png`。行走 4 帧按东向格的自相似周期取(薇拉 17 帧 → f10/f14/f18/f23,凯尔 / 布兰 14 帧 → f07/f11/f14/f18、f08/f12/f15/f19),各帧用同一组固定框(视频格 = 八方向图框 × 1024/2400)。
4. 攻击:「八方向行走模板图」+ 自定义动作(35 算力)出八朝向攻击姿势,攻击 3 列 = 站姿(蓄力)+ 攻击姿势 ×2。
5. 「动作帧生成器」(角色图 + 动作模板 → 关键帧)试过一次:侧面走路 10 帧里 5 帧是灰色人偶,不可用,弃。

**技能特效**:「技能特效分镜」(通用模板,35 算力,全能编辑 V3,6 镜 = 3×2 黑底分镜板;输入参考图必填,用页内 canvas 画的色块草图即可)。已出 nova / explosion / lightning(chain)/ shield / heal(drain)/ poison / summon 七种,规格 `artwork/pixel-kit-anim-fx.json`(色键黑 + keyGlobal,`atlasCols: 6, atlasRows: 1` 把 3×2 板重排成帧带)。

**产线新能力**(`scripts/pixel-kit.mjs`):`atlas` / `cellArt` / `cellSpec`(网格 → 图集)、逐格 `src` / `rect`(一个图集多来源)、`atlasCols` / `atlasRows`(输出布局 ≠ 源网格)、`flipX`、白底色键;守卫 `tests/pixel-kit-atlas.test.ts`、`tests/spriteAnim.test.ts`。

**本轮算力账**:1685 → 约 270(英雄 3 × (35 + 270 + 25 + 35) + 布兰重出 35 + 凯尔重复一张 35 + 技能 7 × 35 + 动作帧试验 35)。

## 五、落库步骤

1. 图放进 `vibe_images/` 后先跑到暂存目录看接触表:
   ```
   node scripts/pixel-kit.mjs --config=artwork/pixel-kit-s1-ai.json --out=.probe/px/s1-ai --contact
   ```
2. 按接触表调:半身像构图改 `crop`;去背景残留软边改 `alphaMin`(默认 128)或 `erode`;品红底源图删 `keyout` 走色键。
3. 通过后去掉 `--out` 落库;把 `artwork/pixel-kit-s1.json` 里被覆盖的格子加 `"frozen": true, "frozenBy": "pixel-kit-s1-ai.json"`,并同步 `tests/pixel-variants.test.ts` 的冻结口径。
4. 五道门:`npm test`、`npm run build:cocos`、`npm run smoke:cocos`(PowerShell)、`npm run typecheck:cocos`、战斗 / 英雄页实机截图(`.probe/shot.mjs`,`SEASON=1 HERO=<id>`,键 `heroes` 与 `battle_st<n>`)。
5. 其余 9 位英雄(S2–S4)照第三节同一套前缀与命名重做,规格里按同样的「一张全身图两格」复制条目即可。
