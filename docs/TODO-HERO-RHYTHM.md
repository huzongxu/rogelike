# 英雄节律重构 · 待办清单

> 状态：截至 2026-09-15（master `a76d01c`），`docs/DESIGN-HERO-RHYTHM.md` §11 裁定 R1–R15 全部落地，`docs/CONTEXT.md` 53–66 是逐轮记录（64 = R15 攒下的真机验证已清完，66 = 洛卡第 6 章剖面已出）。本文件只收**还没做完的事**，做完一条就删一条；新增待办也记在这里，不散落在 CONTEXT 里。

## 1. 数值层（真机口径 = `chapterReset + chapterTypes`，3 种子 21 / 123 / 7）

- **穆精英章之墙**：10 / 15 / 21。数值六根杠杆（狼伤 / 狼存活 / 狼数 / 底拍 / 站桩参数 / 精英加权）与机制两项（R11 跨章保留召唤物、R12 精英入场延迟）都做过，只有 R12 有效。剩下的方向是**站桩 AI 对精英的专门处理**（例如围数统计里精英按接触伤害加权而不是按只数——R6 时按只数加权越躲越没输出，可试"只对 HP < 50% 时生效"），或接受穆就是"高风险高上限"的身份。
- **标定口径统一**：`runSim` 默认仍是旧口径（不清场、不开章型），只有 boss / balance / chapters / terrain 四套显式传真机口径。`combos / seasonSets / hero-rhythm` 里的 sim 用例仍走旧口径。要么把默认切到真机口径并重锚这些用例，要么在每个用例注释口径；现在是两种口径并存，读数据时容易混。
- **Boss 末关 TTK 42s**：窗口 14–55 内，但离 60s 超时线只剩 18s；如果后续法宝 / 技能数值再上移，`BOSS_HP_CURVE.base` 5.0 要跟着看。
- **地形数量注释滞后**：R13 把 `OBSTACLE_PLACEMENT.countMax` 收到 1（真机实测每章恒 1 个，见 CONTEXT 64），但 `game/entities/objects.ts` 里 `rollChapterObstacles` 的头注释仍写「每章 2–4 个」、`want` 行注释仍写「1–2 个」。改注释即可，行为与表值都不动。

## 2. 内容层

- **S2–S4 赛季共鸣格与赛季法宝初值**（`artifacts.SEASON_RESONANCES / SEASON_ARTIFACTS`）全部是初值，没有任何赛季数据；等真有第 2 赛季（`save.seasonId = 2`）的对局再标。
- **S5+ 赛季表**：`SEASON_RESONANCES` 只到 S4，第 2 轮主题循环（S5 回响苏醒 …）目前只剩过季回响，没有新格、没有赛季法宝。
- **其余 6 英雄的专属技能表**（多兰 / 莎莉 / 雷恩 / 薇洛 / 奥登 / 穆）仍走通用职业包（守势 / 奔袭 / 专注），R4 裁定按赛季逐批补。
- **共鸣图鉴没有界面**：`save.collection.resonances` 已在落盘（键 `art:<效果|变体>:<节律>` / `skill:<id>`），发现横幅带赛季角标，但没有任何屏能翻看已发现的共鸣。

## 3. 工具与基建

- `equipmentEngine.rhythmProgress` 对**技能**的受击 / 击杀恒返 1（技能不走内置冷却，只有 `hitCd` / `hurtCd`）；如果要让受击核心也有"冷却在走"的可读性，得把 `hitCd` 折进去。
- `castKnife` 全向刃幕（spread ≥ 6 走 360° 等分）命中率低是洛卡弱的疑点之一，但没量过；平衡 sim 可加一个"弹体命中 / 发射"比的探针。
- `sim` 里 `strengthen` 只建模"每章最多 3 次最便宜强化"，真实玩家会优先强化核心输出件；这一项低估了后期 DPS，Boss 锚是按它标的。
- Web 冻结基准 `src/game.ts` 商店右上角仍是「融合」钮、装备体系仍是旧词缀池——**设计上冻结不改**，只在这里记一句免得再被当成 bug。
- `cocos/settings/v2/packages/information.json` 每次开编辑器都会写回，一直留在工作区未提交；要么一起收口，要么加进 `.gitignore`。

## 4. 已知噪声（不用再查）

- `npm run build:cocos` 退出码 36 / 日志里 `build-script` 子进程 SIGTERM 与 `~/.CocosCreator/editor/window.json` 解析报错：编辑器侧收尾噪声，产物完整（看 `cocos/build/web-desktop/assets/main/index.js` 时间戳与 grep 新文案即可）。
- vitest 末尾 `[vitest-worker]: Timeout calling "onTaskUpdate"`：worker RPC 超时，不是测试失败。
- `equipmentEngine.test`「击杀触发投掷飞刀」曾偶发失败：根因是击杀概率封顶 0.95，用例已把随机钉成 0，不会再掷硬币。
- 全套 vitest 跑时浏览器面板里的 Cocos 场景会停在 0 帧（CPU 被 worker 占满，资源加载停滞）：等全套跑完再刷新页面即可；面板隐藏时引擎没有 rAF、同样 0 帧。
