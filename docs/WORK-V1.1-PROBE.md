# V1.1 Work 包｜开发态章节点直达探针

> 仅 `CC_DEBUG` 构建暴露 `globalThis.__abyssDev`；发布构建该全局不存在。探针不写存档、不扣体力，直接走 `world.startRun()` + 生产 `nextChapter` / `commitBuild`。

## 启动

先构建调试包（`CC_DEBUG=true`）：

```bash
npm run build:cocos:debug
npm run serve:cocos
```

在 Cocos 构建的浏览器调试页打开控制台：

```js
__abyssDev.start("vera", 4)
```

`start(hero, chapter)`：在内存里把出战英雄切到指定英雄（不落盘），开一局第 1 关并推进到目标章；沿途遇到开章二选一取第一项自动提交。

## 逐节点取证

```js
__abyssDev.start("vera", 1)          // 新局，第1章
__abyssDev.jump(2, "vera.a")        // 第2章：提交 A 支
__abyssDev.jump(4, null, ["vera_a_4_guard"])   // 第4章：提交回护
__abyssDev.before(8)                 // 推到第8章之前并挂起，弹层打开、不提交
__abyssDev.commit("vera_a_8_echo")   // 提交双向反刺
__abyssDev.state()                   // {chapter, hero, branch, nodes, step, overlay, paused}
__abyssDev.closeOverlay()            // 只关弹层不提交（世界仍冻结，用于重开/恢复取证）
```

- `jump(chapter, branchId?, nodeIds?)`：只推进到目标章；如果目标章有待选，弹层打开但**不自动提交**。
- `before(chapter)`：推进到 `chapter-1`，再 `nextChapter()` 把目标章的待选挂起。
- `commit(id?)`：提交当前挂起项；不传 id 取第一项。
- `state()`：返回当前章、英雄、路线、三层节点、待选步骤、弹层可见与世界冻结标记，直接 `JSON.stringify` 即为事件快照。

## 取证纪律

- 每次点击/提交前后各 `state()` 一次，记录 `chapter / step / branch / nodes`。
- 真实 Canvas 截图/录像用宿主画面，不以 `state()` 代替点击验收。
- 探针不落盘；若需恢复用户环境，刷新页面即可（探针只改内存存档字段，未调用 `persist`）。
- 发布包检查：构建产物中搜不到 `__abyssDev`。
