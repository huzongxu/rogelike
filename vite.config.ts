import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@game": fileURLToPath(new URL("./cocos-prototype/assets/scripts/game", import.meta.url)),
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
});
