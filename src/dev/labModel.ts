/**
 * 布局台数据模型的 Web 侧入口。
 *
 * 实现已上移到两端共用的共享层 `@game/dev/labModel`(Cocos 侧 `assets/scripts/dev/LayoutLab.ts`
 * 读同一份),本文件只保留历史 import 路径,不承载第二套实现 ——
 * 手柄数/字段数在 Web 与 Cocos 天然相等,不会因为两份代码各自演化而漂移。
 */

export * from "@game/dev/labModel";
