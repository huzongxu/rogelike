/**
 * 死亡结算通路(BattleSim.settlePendingRun)。
 *
 * Web 侧死亡结算是 `settlePendingRun()` → `settleRun()`(`src/game.ts:1185-1189` 与 `1805-1817`),
 * 只在**放弃本局**时执行(看广告复活不结算)。Cocos 侧原先只把 `pendingSettle` 挂起、入账延到
 * Phase 5 的结算屏,于是 `prestiges` / `bestRun` / `bestWave` / `seasonBest` 与死亡那一份回响
 * 一个都不写 —— 而委托屏的区域解锁 `regionUnlocked(region, prestiges, …)` 正吃 `prestiges`。
 * 本用例把这条通路逐项钉死,并锁住一个顺序危险:`startRun()` 会清 `pendingSettle`,
 * 所以结算必须排在任何 `startStage` / `startEndless` 之前(Web 把它放 `restart()` 首行同理)。
 */

import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { vec2 } from "@game/core/math";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";

interface Harness {
  sim: BattleSim;
  save: ReturnType<typeof emptySave>;
  persists: () => number;
  deathPoints: () => number | null;
}

/** 造一个已开局的 sim;死亡靠把 player.alive 置假再推一帧触发真实的 onPlayerDown → onDeath 通路 */
function makeSim(): Harness {
  const save = emptySave();
  save.energy = 99;
  let persists = 0;
  let deathPoints: number | null = null;
  const sim = new BattleSim({
    save,
    input: { isMoving: false, moveDir: vec2(0, 0) },
    worldH: 996,
    persist: () => {
      persists += 1;
    },
    callbacks: {
      onDamage: () => {},
      onDeath: (info) => {
        deathPoints = info.points;
      },
      onVictory: () => {},
      onChapterShop: () => {},
    },
  });
  if (!sim.startStage(1)) throw new Error("startStage(1) 未开局,结算无从测起");
  return { sim, save, persists: () => persists, deathPoints: () => deathPoints };
}

/** 把本局的账面摆成可预期的数,再走真实死亡通路 */
function kill(h: Harness, kills: number, chapter: number, elapsed: number): void {
  const w = h.sim.world;
  w.kills = kills;
  w.chapter = chapter;
  w.elapsed = elapsed;
  w.player.alive = false;
  h.sim.update(1 / 60);
}

describe("死亡结算:放弃本局时把账结清", () => {
  it("死亡只挂起、不入账(与 Web 同分层:给广告复活留机会)", () => {
    const h = makeSim();
    const before = { p: h.save.prestiges, pts: h.save.points, day: h.save.dayEcho, best: h.save.bestRun, wave: h.save.bestWave, season: h.save.seasonBest };
    kill(h, 7, 3, 65.4);
    expect(h.sim.pendingSettle, "死亡后挂起标记置真").toBe(true);
    expect(h.save.prestiges).toBe(before.p);
    expect(h.save.points).toBe(before.pts);
    expect(h.save.dayEcho).toBe(before.day);
    expect(h.save.bestRun).toEqual(before.best);
    expect(h.save.bestWave).toBe(before.wave);
    expect(h.save.seasonBest).toBe(before.season);
    expect(h.deathPoints(), "死亡事件带出预计算的回响").not.toBeNull();
  });

  it("结算写全五项:回响按 splitEcho 分流入账、最佳纪录、最高章节、赛季最佳、prestiges + 1", () => {
    const h = makeSim();
    const pts0 = h.save.points;
    const day0 = h.save.dayEcho;
    kill(h, 7, 3, 65.4);
    const gained = h.deathPoints() as number;
    h.sim.settlePendingRun();
    expect(h.save.prestiges, "每次死亡结算计 1 次").toBe(1);
    expect(h.save.points - pts0 + (h.save.dayEcho - day0), "跨天 + 本日两笔之和 = 本局所得").toBe(gained);
    expect(h.save.bestRun, "最佳纪录按击杀数取,秒数向下取整").toEqual({ kills: 7, seconds: 65 });
    expect(h.save.bestWave).toBe(3);
    expect(h.save.seasonBest).toBe(3);
    expect(h.sim.pendingSettle, "结完清挂起").toBe(false);
  });

  it("结算落盘并记本关最远章节(阵亡也计进度);落盘次数随进度是否破纪录分两档,与 Web 同口径", () => {
    // 破纪录档:recordStageFurthest 自己落一次(Web src/game.ts:305-311 同式)+ 结算末尾一次 = 2
    const h = makeSim();
    const spy = vi.spyOn(h.sim.world, "recordStageProgress");
    kill(h, 4, 2, 30);
    const p0 = h.persists();
    h.sim.settlePendingRun();
    expect(spy, "Web settlePendingRun 首行就是 recordStageProgress").toHaveBeenCalledTimes(1);
    expect(h.save.stageFurthest[1], "阵亡也记进度").toBe(2);
    expect(h.persists() - p0, "进度破纪录:两次落盘").toBe(2);

    // 不破纪录档:只剩结算末尾那一次
    const h2 = makeSim();
    h2.save.stageFurthest[1] = 9;
    kill(h2, 4, 2, 30);
    const q0 = h2.persists();
    h2.sim.settlePendingRun();
    expect(h2.save.stageFurthest[1], "没破纪录就不改写").toBe(9);
    expect(h2.persists() - q0, "只有结算自己那一次").toBe(1);
  });

  it("击杀数不高于旧纪录时 bestRun 不被覆盖", () => {
    const h = makeSim();
    h.save.bestRun = { kills: 99, seconds: 10 };
    kill(h, 4, 2, 30);
    h.sim.settlePendingRun();
    expect(h.save.bestRun, "只有更高的击杀数才改写").toEqual({ kills: 99, seconds: 10 });
    expect(h.save.prestiges, "纪录没破也照样计一次转生").toBe(1);
  });

  it("再结算一次不重复入账", () => {
    const h = makeSim();
    kill(h, 7, 3, 65.4);
    h.sim.settlePendingRun();
    const snap = { p: h.save.prestiges, pts: h.save.points, day: h.save.dayEcho, wave: h.save.bestWave, season: h.save.seasonBest, best: h.save.bestRun };
    const persists = h.persists();
    h.sim.settlePendingRun();
    expect(h.save.prestiges).toBe(snap.p);
    expect(h.save.points).toBe(snap.pts);
    expect(h.save.dayEcho).toBe(snap.day);
    expect(h.save.bestWave).toBe(snap.wave);
    expect(h.save.seasonBest).toBe(snap.season);
    expect(h.save.bestRun).toEqual(snap.best);
    expect(h.persists(), "挂起标记已清,第二次直接早退不落盘").toBe(persists);
  });

  it("看广告复活则不结算(挂起标记在 revive 里就清了)", () => {
    const h = makeSim();
    kill(h, 7, 3, 65.4);
    h.sim.revive();
    const snap = { p: h.save.prestiges, pts: h.save.points, day: h.save.dayEcho, best: h.save.bestRun };
    h.sim.settlePendingRun();
    expect(h.sim.pendingSettle).toBe(false);
    expect(h.save.prestiges).toBe(snap.p);
    expect(h.save.points).toBe(snap.pts);
    expect(h.save.dayEcho).toBe(snap.day);
    expect(h.save.bestRun).toEqual(snap.best);
  });

  it("没死过就调结算是空操作", () => {
    const h = makeSim();
    const persists = h.persists();
    h.sim.settlePendingRun();
    expect(h.save.prestiges).toBe(0);
    expect(h.persists()).toBe(persists);
  });
});

describe("顺序危险:startRun 会清挂起标记,所以结算必须排在开新局之前", () => {
  it("先开新局再结算 → 这一笔账整个丢掉(宿主三个 run-start 点因此都要结算在前)", () => {
    const h = makeSim();
    kill(h, 7, 3, 65.4);
    expect(h.sim.pendingSettle).toBe(true);
    h.sim.startStage(1);
    expect(h.sim.pendingSettle, "startRun 无条件清挂起标记").toBe(false);
    h.sim.settlePendingRun();
    expect(h.save.prestiges, "账已丢:这就是宿主要先结算的理由").toBe(0);
    expect(h.save.bestRun).toBeNull();
  });

  it("先结算再开新局 → 账在,且新局把展示量归零", () => {
    const h = makeSim();
    kill(h, 7, 3, 65.4);
    h.sim.settlePendingRun();
    expect(h.save.prestiges).toBe(1);
    h.sim.startStage(1);
    expect(h.save.prestiges, "开新局不回滚已结的账").toBe(1);
    expect(h.sim.pendingSettle).toBe(false);
  });
});

describe("宿主接线:六个放弃/开局入口都要结算在前", () => {
  it("GameShell 的选关 / 无限关 / 重开与两张结算屏的天赋 / 菜单共六处都在切屏之前调 settlePendingRun", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(src.split("sim.settlePendingRun();").length - 1, "六个入口各一次真实调用").toBe(6);
    // 逐处确认结算排在开新局 / 切屏之前
    const stageAt = src.indexOf("sim.settlePendingRun();\n                this.requestStage(a.id);");
    const endlessAt = src.indexOf("sim.settlePendingRun();\n                this.requestEndless();");
    const restartAt = src.indexOf("sim.settlePendingRun(); // Web restart() 首行同位");
    const prestigeAt = src.indexOf("sim.settlePendingRun();\n            this.openPrestige();");
    const menuAt = src.indexOf("sim.settlePendingRun();\n        this.router.show(\"menu\");");
    // 通关屏的底部条(Web 同位是 backToMenu,那里那句结算在通关路径上恒为守卫)
    const victoryMenuAt = src.indexOf("sim.settlePendingRun();", src.indexOf("private onVictoryAction"));
    expect(stageAt, "菜单选关:结算紧贴开局请求之前").toBeGreaterThan(0);
    expect(endlessAt, "菜单无限关:结算紧贴开局请求之前").toBeGreaterThan(0);
    expect(restartAt, "重开本局:结算在 restartRun 首行").toBeGreaterThan(0);
    expect(prestigeAt, "结算屏「天赋」:结算紧贴切屏之前(Web 点击分支同两条语句)").toBeGreaterThan(0);
    expect(menuAt, "结算屏「菜单」:结算紧贴切回主菜单之前(Web backToMenu 同位)").toBeGreaterThan(0);
    expect(victoryMenuAt, "通关屏「返回菜单」:结算紧贴切回主菜单之前(Web backToMenu 同位)").toBeGreaterThan(src.indexOf("private onVictoryAction"));
    // 开局漏斗自己不含结算:体力不足挂起的那次开局在领完体力后重跑漏斗,重跑不该再结一次
    const funnel = src.slice(src.indexOf("private requestStage("), src.indexOf("private openEnergy()"));
    expect(funnel.includes("sim.settlePendingRun();")).toBe(false);
    // boot 那一处开局不需要结算(刚启动时挂起标记必为假),别顺手加进去
    expect(src.indexOf("if (!this.sim.startStage(1)) this.sim.startEndless();")).toBeGreaterThan(0);
  });
});
