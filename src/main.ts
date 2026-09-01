/**
 * 入口 —— 启动游戏并把调试接口挂到 window。
 * 浏览器控制台可调用:
 *   game.debugEquipThorn()  荆棘反伤流
 *   game.debugEquipChain()  死亡连锁流
 *   game.debugEquipTurret() 移动炮台流
 * 策划配置:public/config/balance.json(见 docs/CONFIG-TABLES.md),改完刷新生效。
 */

import { Game } from "./game";
import { loadBalanceConfig } from "./platform/balance";

// 配置先行:任何失败只告警并走内置默认值,不阻塞启动
loadBalanceConfig()
  .catch(() => {})
  .then(() => {
    const game = new Game();
    window.game = game;
    console.log(
      "%c回响深渊 MVP 已启动 — 控制台调试: game.debugEquipThorn() / debugEquipChain() / debugEquipTurret()",
      "color:#5ac8fa"
    );
  });

declare global {
  interface Window {
    game: Game;
  }
}
