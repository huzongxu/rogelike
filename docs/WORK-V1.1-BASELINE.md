# Work V1.1｜Gate 0 基线证据

> 生成时间：2026-11-12。**本文件是 Work 端自测记录，不等于审阅签收。**
> 仓库：`H:\workspace\挂机游戏`；分支 `master`；HEAD `cff181dbe8e68c14f24e75c0ce2ef1e83c68b36e`；工作树 dirty **66** 项（含任务开始前既有 R18–R22 改动与本轮 V1.1 改动），未做任何 commit。

## 1. 版本与工作树

| 项 | 值 |
|---|---|
| HEAD | `cff181d`（2026-09-16 穆身份特効 R17） |
| 分支 | `master` |
| dirty 条目 | 66（`git status --porcelain \| wc -l`） |
| 已跟踪 diff | 51 files，+3869 / −1307；diff SHA256 `2b6c7aa4…19273af` |
| 未跟踪 | `heroBuild.ts`、`heroTree.ts`、`heroTreeLayout.ts`、`hero-build.test.ts`、`hero-tree.test.ts`、`DESIGN-COMPENDIUM.md`、`DESIGN-HERO-PIPELINE.md`、`DESIGN-HERO-BUILD.md`、`WORK-V1.1-*`、既有 `r22-*.json` 等 |
| 可恢复性 | 未 commit；按 `git stash`/`git checkout` 可回到 HEAD；本轮未修改任何账户存档字段 |

> 说明：工作树里 R18–R22 在任务开始前就未提交，本轮没有将其整理成单独 commit；`00_BASELINE` 的“可恢复旧状态”依赖 HEAD + 当前工作树快照，而不是一个干净 commit。

## 2. 源码入口映射（VERIFIED_CODE）

| 职责 | 实际文件 |
|---|---|
| 战场推进 / 章节切换 / 冻结 | `cocos/assets/scripts/game/systems/battleWorld.ts` |
| 宿主接线 / 结算 / 探针 | `cocos/assets/scripts/battle/BattleSim.ts`、`cocos/assets/scripts/GameShell.ts` |
| 技能表 / 分岔 / 节律 | `game/data/heroSkills.ts`、`game/data/rhythm.ts` |
| 章节节点层 | `game/data/heroBuild.ts`、`game/data/heroTree.ts` |
| 升级弹层 | `levelup/LevelUpModel.ts`、`levelup/LevelUpView.ts` |
| 英雄页 | `heroes/HeroSelectModel.ts`、`heroes/HeroSelectView.ts`、`game/ui/heroSelectLayout.ts`、`game/ui/heroTreeLayout.ts` |
| 引擎 | `game/systems/equipmentEngine.ts` |
| 模拟器 | `scripts/balance-sim.ts` |
| 测试 | `tests/hero-build.test.ts`、`tests/hero-tree.test.ts`、`tests/cocos-a2-levelup.test.ts` 等 |

## 3. 五道门 + smoke（本轮复跑）

| 门 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 单测 | `npm test` | 0 | 71 套 / 4020 条全绿（Gate 1 前）；Gate 1 后重跑结果见 §7 |
| Web 构建 | `npm run build` | 0 | dist 378.46 kB / gzip 121.46（Gate 1 前） |
| Cocos 构建 | `npm run build:cocos` | 0 | 业务 js 760,301 B（Gate 1 前） |
| Cocos 冒烟 | `npm run smoke:cocos` | 0 | 7/7 PASS（Gate 1 前） |
| Cocos 类型检查 | `npm run typecheck:cocos` | 0 | 工程内 0 / 基线 0（Gate 1 前） |

> 既有噪声：vitest 末尾 `[vitest-worker] Timeout calling "onTaskUpdate"` 仍出现，不归属具体用例；Cocos 构建的 SIGTERM/日志噪声不影响产物。

## 4. 36 节点现状（对照 09b 矩阵）

| 维度 | 状态 |
|---|---|
| 结构登记 | **VERIFIED**：6 分支 × 3 层 × 2 选项 = 36 行，`heroBuild.ts` + `tests/hero-build.test.ts` 数据完整性 4 例 |
| 逻辑行为 | **PARTIAL**：主循环与代表节点有行为断言（薇拉 A/B、凯尔 A/B、薇洛 A/B、回护/穿棘/双向反刺）；36 行逐条状态仍为 `NOT_RUN` |
| Cocos 真机 | **NOT_RUN**：Gate 1 探针入口已接，真实 Canvas 逐节点录像尚未执行 |
| 几何 | **REVIEW/PROTOTYPE_ONLY**：G01–G06 仍为近似，见 `docs/DESIGN-HERO-BUILD.md` §18.1b 与 V1.1 执行包 `07` |

## 5. 900s / 1200s 口径

- 主线：`stages.CHAPTERS_PER_STAGE = 15`、`CHAPTER_SECONDS = 60` → 一关 **900s**；第 15 章 Boss，超时判负。
- `balance-sim` 的历史锚点多用 `maxSeconds: 1200`（20 章时代的延伸比较），不是主线通关时长；读 1200s 结果时必须注明“延伸段”，不得当作 15 章内结论。
- `runSim` 不按 15 章封顶，`wave` 会继续增长；正式 15 章结论只看 `wave ≤ 15` 或显式截断。

## 6. 与 V1.0 报告的差异

- V1.0 说“36 节点已定义、代表节点已测”：**定义 = VERIFIED**，**行为 = PARTIAL**，**真机 = NOT_VERIFIED**。
- V1.0 说“五道门全绿”：本轮独立复跑一致（见 §3），但这是 `USER_REPORTED` 升级为 `VERIFIED` 的工程门，不等于体验/数值签收。
- 旧 V1.0 的“每章一次普通轮 / 12HP/s 全来源封顶 / 完整铭刻”均未采用（V1.1 裁定 D05 / D12 / D08）。

## 7. Gate 1 后复跑（2026-11-12）

> 英雄页技能树 + 开发态探针合入后重跑；§3 保留为“Gate 1 前”对照。

| 门 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 单测 | `npm test` | 0 | **72 套 / 4027 条全绿**（新增 `hero-tree.test.ts` 6 例、`hero-build` +1 例；仍有 worker `onTaskUpdate` 噪声） |
| Web 构建 | `npm run build` | 0 | dist **379.08 kB / gzip 121.80** |
| Cocos 构建 | `npm run build:cocos` | 0 | 业务 js **767,931 B**；debug 探针构建另跑 `build:cocos:debug` |
| Cocos 冒烟 | `npm run smoke:cocos` | 0 | **7/7 PASS** |
| Cocos 类型检查 | `npm run typecheck:cocos` | 0 | 工程内 0 / 基线 0 |

### Gate 1 真机探针（真实 Canvas，非 BattleSim）

- 入口：`__abyssDev.start(hero, chapter)` / `jump` / `before` / `commit` / `clearOverlays` / `heroPage`；仅 `CC_DEBUG` 构建存在（`docs/WORK-V1.1-PROBE.md`）。
- 已实测：`vera@2` 选支、`kyle@4` 节点、`willow@8` 节点、`vera@12` 节点均返回 `overlay: true / paused: true`，且此前节点已写入；真实 `cua.click` 点「选它」后 `nodes[0] = vera_a_4_guard`、`overlay:false`、`paused:false`（exactly-once 单测另锁）。
- 英雄页：真实点击「分岔」行打开「技能树 · 薇拉」，两列 A/B + 4/8/12 节点可读；点「关闭」回到五行详情。
- 证据：`proof/cff181d-v11-dev/`（`vera-ch2.png` / `kyle-ch4.png` / `willow-ch8.png` / `vera-ch12.png` / `vera-hero-tree.png` / `states.json` / `environment.json` / `release-check.json`）。
- 发布态：release 包 `CC_DEBUG=false`、`typeof __abyssDev === "undefined"`（`release-check.json`）。
- 未做：mp4 录像、996/1246 两档截图、低帧/切屏/失焦/进程重启矩阵；`09b` 36 行真机状态仍为 `NOT_RUN`。

## 8. P6 `nearestEnemy` 复现（未修复）

`.probe` 一次性复现（输出 `proof/cff181d-v11-dev/P6_repro.txt`）：

```text
[P6] range=110 dist=400 -> HIT (阈值 12100)
[P6] range=300 dist=500 -> HIT (阈值 90000)
[P6] range=320 dist=600 -> HIT (阈值 102400)
```

- 世界层 `battleWorld.nearestEnemy` 与 `balance-sim` 两份镜像均为 `bestD = range * range` + 线性 `d` 比较；边界用例证明 110/300/320 闸在 400/500/600px 外仍放行。
- 按 Work V1.1 `06` 要求，修复必须独立分支/commit、重签指纹、重出 12 人基线；当前工作树含任务前 R18–R22 改动，**未擅自混入**。`T018 = REPRODUCED`，`T019–T022 = P6_PENDING`。
