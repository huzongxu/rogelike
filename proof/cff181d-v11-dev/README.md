# Work V1.1 Gate 1 探针证据

- 基准：HEAD `cff181d` + 当前 dirty 工作树（未 commit）；Cocos debug 构建 `build:cocos:debug`。
- 运行环境：`environment.json`（ZCode IAB / 405×720 canvas / DPR 1 / `CC_DEBUG=true`）。
- 四章弹层：`vera-ch2.png` / `kyle-ch4.png` / `willow-ch8.png` / `vera-ch12.png`；对应 `states.json` 中 `overlay:true / paused:true`，此前节点已写入。
- 真实点击提交：在第 4 章弹层用 `cua.click` 点「选它」后，`buildNodes[0]=vera_a_4_guard`、`overlay:false / paused:false`（见 `states.json` 与 `WORK-V1.1-BASELINE` §7）。
- 英雄页技能树：`vera-hero-tree.png`（真实点「分岔」行打开、点「关闭」回五行）。
- 发布态隔离：`release-check.json`（release 包 `CC_DEBUG=false`、`typeof __abyssDev === "undefined"`）。
- P6 复现：`P6_repro.txt`（110/300/320 闸在 400/500/600px 外仍 HIT；**未修复**）。

> 这些是 PNG 静帧 + 状态 JSON；mp4 录像与 996/1246 双档矩阵尚未生产，按 Work V1.1 `05` 计 `PARTIAL`。
