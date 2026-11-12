import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@game": fileURLToPath(new URL("./cocos/assets/scripts/game", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
  test: {
    /**
     * 测试面只认 tests 目录。vitest 的默认 include 会递归匹配全部 .test.ts,
     * 于是把 gitignore 的 .probe 目录(临时探针与诊断脚本)也收进门 1,
     * 使全量套数不再是稳定基线。
     */
    include: ["tests/**/*.test.ts"],
  },
});
