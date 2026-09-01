import { defineConfig } from "vite";

/**
 * 微信小游戏构建 —— 输出 CommonJS 包到 minigame/js/game.bundle.js,
 * 由 minigame/game.js(先做环境 shim)require 加载。
 */
export default defineConfig({
  build: {
    outDir: "minigame/js",
    emptyOutDir: false,
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "game.bundle.cjs",
    },
    target: "es2017",
    minify: true,
    sourcemap: false,
  },
});
