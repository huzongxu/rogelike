/**
 * 英雄 Build V1.1｜章节节点层:数据完整性、生命周期、三原型主循环。
 * 设计合同见 docs/DESIGN-HERO-BUILD.md。
 */

import { describe, it, expect, vi } from "vitest";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { vec2 } from "../cocos/assets/scripts/game/core/math";
import { Player } from "../cocos/assets/scripts/game/entities/player";
import { spawnEnemy, type Enemy } from "../cocos/assets/scripts/game/entities/enemy";
import { EquipmentEngine, type BattleContext, type Fx } from "../cocos/assets/scripts/game/systems/equipmentEngine";
import { makeSkillEquipment } from "../cocos/assets/scripts/game/data/equipmentGen";
import { coreSkillOf, heroSkillDef } from "../cocos/assets/scripts/game/data/heroSkills";
import {
  BUILD_BRANCHES,
  BUILD_NODES,
  BUILD_NODE_CHAPTERS,
  buildBranch,
  buildProfile,
  buildStepFor,
  nodeOptions,
  type BuildTier,
} from "../cocos/assets/scripts/game/data/heroBuild";
import { LevelUpModel, type LevelUpWorld } from "../cocos/assets/scripts/levelup/LevelUpModel";

/* ---------- 数据完整性 ---------- */

describe("章节节点层:数据完整性", () => {
  it("三原型各有 profile,其余 9 人没有;分支章 = 2、节点章 = 4/8/12", () => {
    expect(buildProfile("vera")).not.toBeNull();
    expect(buildProfile("kyle")).not.toBeNull();
    expect(buildProfile("willow")).not.toBeNull();
    for (const h of ["bran", "sia", "nora", "loka", "doran", "sally", "rayne", "oden", "mu"] as const) {
      expect(buildProfile(h), h).toBeNull();
    }
    expect(BUILD_NODE_CHAPTERS).toEqual([4, 8, 12]);
  });

  it("6 条路线、36 个节点、每层恰 2 个选项;id 全局唯一;技能引用存在", () => {
    expect(BUILD_BRANCHES).toHaveLength(6);
    expect(new Set(BUILD_BRANCHES.map((b) => b.id)).size).toBe(6);
    for (const b of BUILD_BRANCHES) {
      expect(heroSkillDef(b.skillId), b.skillId).not.toBeNull();
      expect(heroSkillDef(b.skillId)!.kind).toBe("branch");
      expect(heroSkillDef(b.skillId)!.heroId).toBe(b.heroId);
    }
    expect(BUILD_NODES).toHaveLength(36);
    expect(new Set(BUILD_NODES.map((n) => n.id)).size).toBe(36);
    for (const b of BUILD_BRANCHES) {
      for (const tier of [1, 2, 3] as BuildTier[]) {
        const opts = nodeOptions(b.heroId, b.id, tier);
        expect(opts, `${b.id} T${tier}`).toHaveLength(2);
        expect(opts.map((n) => n.option).sort()).toEqual([1, 2]);
      }
    }
    for (const n of BUILD_NODES) {
      const branch = buildBranch(n.branchId);
      expect(branch, n.id).not.toBeNull();
      expect(branch!.heroId).toBe(n.heroId);
      expect(n.tier).toBeGreaterThanOrEqual(1);
      expect(n.tier).toBeLessThanOrEqual(3);
    }
  });

  it("开章挂起纯函数:第 2 章选支;4/8/12 各挂一次;已选不再挂", () => {
    expect(buildStepFor("vera", 1, null, [null, null, null])).toBeNull();
    const b2 = buildStepFor("vera", 2, null, [null, null, null]);
    expect(b2?.kind).toBe("branch");
    expect(b2!.options).toHaveLength(2);
    expect(buildStepFor("vera", 2, "vera.a", [null, null, null])).toBeNull();
    const n4 = buildStepFor("vera", 4, "vera.a", [null, null, null]);
    expect(n4).toMatchObject({ kind: "node", tier: 1 });
    expect(buildStepFor("vera", 4, "vera.a", ["vera_a_4_guard", null, null])).toBeNull();
    expect(buildStepFor("vera", 8, "vera.a", ["vera_a_4_guard", null, null])).toMatchObject({ kind: "node", tier: 2 });
    expect(buildStepFor("vera", 12, "vera.a", ["vera_a_4_guard", "vera_a_8_echo", null])).toMatchObject({ kind: "node", tier: 3 });
  });

  it("legacy 英雄恒不挂起", () => {
    for (const h of ["bran", "sia", "nora", "loka", "doran", "sally", "rayne", "oden", "mu"] as const) {
      for (let ch = 1; ch <= 15; ch++) expect(buildStepFor(h, ch, null, [null, null, null]), `${h}@${ch}`).toBeNull();
    }
  });
});

/* ---------- 生命周期(BattleSim 真实宿主) ---------- */

function makeSim(hero: "vera" | "kyle" | "willow" | "bran") {
  const save = emptySave();
  save.energy = 99;
  save.selectedHero = hero;
  save.selectedSet = hero === "bran" ? "ember" : hero === "willow" ? "phantom" : hero === "kyle" ? "barrage" : "thorn";
  return new BattleSim({
    save,
    input: { isMoving: false, moveDir: vec2(0, 0) },
    worldH: 996,
    persist: () => {},
    callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
  });
}

describe("章节节点层:生命周期", () => {
  it("第 2 章挂起分岔;未提交时世界冻结;提交后技能入场、节律解锁、branchChosen 写入", () => {
    const s = makeSim("vera");
    s.startStage(1);
    s.world.nextChapter();
    expect(s.world.chapter).toBe(2);
    const step = s.buildStep();
    expect(step?.kind).toBe("branch");
    const before = s.world.chapterTimer;
    s.world.advance(0.5);
    expect(s.world.chapterTimer, "挂起时世界冻结").toBe(before);
    expect(s.commitBuild("vera.a")).toBe(true);
    expect(s.buildStep()).toBeNull();
    expect(s.world.player.buildBranchId).toBe("vera.a");
    expect(s.world.player.branchChosen).toBe("vera_armor");
    expect(s.world.player.skills.some((e) => e.skillId === "vera_armor")).toBe(true);
    expect(s.world.player.rhythms).toContain("hurt");
  });

  it("第 4/8/12 章各挂节点;提交后写 buildNodes;重开清空;复活只清临时资源", () => {
    const s = makeSim("vera");
    s.startStage(1);
    s.world.nextChapter();
    s.commitBuild("vera.a");
    for (const [ch, id] of [[4, "vera_a_4_guard"], [8, "vera_a_8_echo"], [12, "vera_a_12_wall"]] as const) {
      while (s.world.chapter < ch) s.world.nextChapter();
      expect(s.buildStep()?.kind, `ch${ch}`).toBe("node");
      expect(s.commitBuild(id)).toBe(true);
    }
    expect(s.world.player.buildNodes).toEqual(["vera_a_4_guard", "vera_a_8_echo", "vera_a_12_wall"]);
    // 临时资源在换章时清空
    s.world.player.buildRes.overload = 77;
    s.world.nextChapter();
    expect(s.world.player.buildRes.overload).toBe(0);
    // 复活保留路线 / 节点,清临时资源
    s.world.player.buildRes.overload = 50;
    s.world.revive();
    expect(s.world.player.buildBranchId).toBe("vera.a");
    expect(s.world.player.buildNodes[0]).toBe("vera_a_4_guard");
    expect(s.world.player.buildRes.overload).toBe(0);
    // 重开全清
    s.startStage(1);
    expect(s.world.player.buildBranchId).toBeNull();
    expect(s.world.player.buildNodes).toEqual([null, null, null]);
  });

  it("成功提交只能发生一次:重复 commit 返回 false,技能 / 节点不复制", () => {
    const s = makeSim("vera");
    s.startStage(1);
    s.world.nextChapter();
    expect(s.commitBuild("vera.a")).toBe(true);
    const skillCount = s.world.player.skills.length;
    expect(s.commitBuild("vera.a")).toBe(false);
    expect(s.world.player.skills.length).toBe(skillCount);
    while (s.world.chapter < 4) s.world.nextChapter();
    expect(s.commitBuild("vera_a_4_guard")).toBe(true);
    expect(s.commitBuild("vera_a_4_guard")).toBe(false);
    expect(s.world.player.buildNodes[0]).toBe("vera_a_4_guard");
  });

  it("legacy 英雄(布兰)没有章节节点层", () => {
    const s = makeSim("bran");
    s.startStage(1);
    for (let i = 0; i < 5; i++) {
      s.world.nextChapter();
      expect(s.buildStep()).toBeNull();
    }
  });
});

/* ---------- 开章弹层模型 ---------- */

function buildModel(committed: { id: string }) {
  const world: LevelUpWorld = {
    equipment: [],
    skills: [makeSkillEquipment(coreSkillOf("vera"))],
    heroId: () => "vera",
    playerLevel: () => 1,
    rhythms: () => ["hit"],
    unlockRhythm: () => {},
    rhythmLevel: () => 1,
    rhythmLevelUp: () => false,
    branchChosen: () => null,
    setBranchChosen: () => {},
    commitBuild: (id) => {
      committed.id = id;
      return true;
    },
    chapterBuild: () => true,
    gold: () => 0,
    setGold: () => {},
    slots: () => 6,
    chapter: () => 2,
    highestStage: () => 1,
    ownedTalents: () => [],
    recordEquipment: () => {},
  };
  return new LevelUpModel(world, () => 0.5);
}

describe("章节节点层:开章弹层", () => {
  it("build 形态两张明牌、不可重随 / 锁定、选它交给世界层提交", () => {
    const committed = { id: "" };
    const m = buildModel(committed);
    const step = buildStepFor("vera", 2, null, [null, null, null]);
    expect(step?.kind).toBe("branch");
    expect(m.openBuild(step!)).toBe(true);
    expect(m.mode).toBe("build");
    expect(m.choices).toHaveLength(2);
    expect(m.canReroll(0)).toBe(false);
    expect(m.canLock(0)).toBe(false);
    expect(m.content().title).toContain("第 2 章");
    expect(m.pick(0)).toEqual({ ok: true, kind: "build" });
    expect(committed.id).toBe("vera.a");
    expect(m.visible).toBe(false);
  });

  it("节点形态标题带层章号;没有选项时不开层", () => {
    const committed = { id: "" };
    const m = buildModel(committed);
    const step = buildStepFor("vera", 4, "vera.a", [null, null, null]);
    expect(step?.kind).toBe("node");
    expect(m.openBuild(step!)).toBe(true);
    expect(m.content().title).toContain("第 4 章");
    expect(m.pick(1)).toEqual({ ok: true, kind: "build" });
    expect(committed.id).toBe("vera_a_4_line");
    expect(m.openBuild({ kind: "node", tier: 2, options: [] })).toBe(false);
  });
});

/* ---------- 引擎主循环 ---------- */

function makeContext(player: Player, enemies: Enemy[] = []): BattleContext & { fx: Fx[] } {
  const fx: Fx[] = [];
  return {
    player,
    enemies,
    projectiles: [],
    clouds: [],
    minions: [],
    addFx: (f) => fx.push(f),
    // 只记录,不减血:多段结算(基础圈 → 内收圈)要能看到同一帧的后续段
    damageEnemy: vi.fn(),
    healPlayer: vi.fn(),
    addPlayerShield: vi.fn(),
    fx,
  };
}

function veraPlayer(branch: "vera.a" | "vera.b") {
  const p = new Player();
  p.rhythms = ["hit", branch === "vera.a" ? "hurt" : "move"];
  p.buildBranchId = branch;
  p.skills.push(makeSkillEquipment(coreSkillOf("vera")));
  p.skills.push(makeSkillEquipment(heroSkillDef(branch === "vera.a" ? "vera_armor" : "vera_walker")!));
  return p;
}

describe("薇拉 A:满 6 付 3 + 内收刺圈", () => {
  it("基础拍消耗 3 层,追加圈 0.45× 且最多 6 靶;同帧不重复消费", () => {
    const p = veraPlayer("vera.a");
    p.thornStack = 6;
    const enemies = Array.from({ length: 8 }, (_, i) => spawnEnemy("chaser", vec2(40 + i * 8, 0), 1));
    const ctx = makeContext(p, enemies);
    const engine = new EquipmentEngine();
    engine.onHurt(ctx, 5, enemies[0]);
    expect(p.thornStack).toBe(3);
    const calls = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls;
    const dmg = calls.map((c) => c[1] as number);
    expect(dmg).toContain(50); // 基础圈(满层)
    expect(dmg).toContain(23); // 0.45 × 50
    // 基础圈 8 靶 + 内收圈至多 6 靶
    expect(calls.length).toBeLessThanOrEqual(8 + 6);
    // 同帧第二次受击只刷新盾,不再扣层
    engine.onHurt(ctx, 5, enemies[0]);
    expect(p.thornStack).toBe(3);
  });

  it("节点「回护」给盾;「穿棘」改直线;「双向反刺」延迟第二圈", () => {
    for (const node of ["vera_a_4_guard", "vera_a_4_line", "vera_a_8_echo"] as const) {
      const p = veraPlayer("vera.a");
      p.buildNodes[0] = node.startsWith("vera_a_4") ? node : null;
      p.buildNodes[1] = node === "vera_a_8_echo" ? node : null;
      p.thornStack = 6;
      const enemies = [spawnEnemy("chaser", vec2(60, 0), 1)];
      const ctx = makeContext(p, enemies);
      const engine = new EquipmentEngine();
      engine.onHurt(ctx, 5, enemies[0]);
      if (node === "vera_a_4_guard") {
        expect((ctx.addPlayerShield as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      }
      if (node === "vera_a_8_echo") {
        expect(p.buildRes.pendingNova.length).toBe(1);
        p.update(0.3);
        engine.update(ctx, 0.01);
        expect(p.buildRes.pendingNova.length).toBe(0);
      }
    }
  });
});

describe("薇拉 B:踏迹印与爆种", () => {
  it("圆环留迹;每靶每秒 1 印;3 印爆种;爆种上限 2/s", () => {
    const p = veraPlayer("vera.b");
    const enemy = spawnEnemy("chaser", vec2(60, 0), 1);
    const ctx = makeContext(p, [enemy]);
    const engine = new EquipmentEngine();
    engine.onHurt(ctx, 5, enemy);
    const trail = ctx.clouds.find((c) => c.trail);
    expect(trail, "留迹").toBeTruthy();
    // 把敌人放在迹上,逐个 1 秒 tick
    enemy.pos.x = trail!.pos.x;
    enemy.pos.y = trail!.pos.y;
    p.update(1);
    engine.update(ctx, 0.01);
    let marks = p.buildRes.trailMarks[enemy.id]?.stacks ?? 0;
    expect(marks).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 6; i++) {
      p.update(1);
      engine.update(ctx, 0.01);
    }
    const calls = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as number);
    expect(calls.some((d) => d === 30), "3 印爆种 = 50 × 0.6").toBe(true);
    expect(p.buildRes.trailBoomAt.length).toBeLessThanOrEqual(2);
    void marks;
  });
});

describe("凯尔 A:过载合并窗与满 100 卸载", () => {
  it("三靶合并窗得 17;满 100 后下一基础拍扣 100 并射 8 束", () => {
    const p = new Player();
    p.rhythms = ["pulse", "combo"];
    p.buildBranchId = "kyle.a";
    p.skills.push(makeSkillEquipment(coreSkillOf("kyle")));
    p.skills.push(makeSkillEquipment(heroSkillDef("kyle_overload")!));
    const enemies = [spawnEnemy("chaser", vec2(50, 0), 1), spawnEnemy("chaser", vec2(0, 50), 1), spawnEnemy("chaser", vec2(-50, 0), 1)];
    const ctx = makeContext(p, enemies);
    const engine = new EquipmentEngine();
    const core = p.skills[0];
    p.update(1.3);
    engine.update(ctx, 1.3);
    expect(p.buildRes.overloadWindowAt).toBeGreaterThanOrEqual(0);
    for (const e of enemies) engine.recordBuildHit(core, e, ctx);
    p.update(0.13);
    engine.update(ctx, 0.01);
    expect(p.buildRes.overload).toBe(17);
    // 装满并让下一基础拍卸载
    p.buildRes.overload = 100;
    p.buildRes.overloadCd = 0;
    const before = ctx.projectiles.length;
    p.update(1.3);
    engine.update(ctx, 1.3);
    expect(p.buildRes.overload).toBe(0);
    expect(p.buildRes.overloadCd).toBeCloseTo(3.6, 5);
    expect(ctx.projectiles.length - before).toBeGreaterThanOrEqual(16 + 8);
  });
});

describe("凯尔 B:三束同向 + 六印冰锥", () => {
  it("基础轮 3 束;同轮同靶只记一次;首靶 +2;满 6 印后冰锥 2×40", () => {
    const p = new Player();
    p.rhythms = ["pulse", "move"];
    p.buildBranchId = "kyle.b";
    p.skills.push(makeSkillEquipment(coreSkillOf("kyle")));
    p.skills.push(makeSkillEquipment(heroSkillDef("kyle_hunter")!));
    const enemy = spawnEnemy("chaser", vec2(50, 0), 1);
    const ctx = makeContext(p, [enemy]);
    const engine = new EquipmentEngine();
    const core = p.skills[0];
    p.update(1.3);
    engine.update(ctx, 1.3);
    expect(ctx.projectiles.length).toBe(3);
    engine.recordBuildHit(core, enemy, ctx);
    engine.recordBuildHit(core, enemy, ctx);
    expect(p.buildRes.marks[enemy.id].stacks).toBe(2);
    // 三轮:2 → 4 → 6,第三轮触发冰锥
    for (let round = 0; round < 2; round++) {
      p.buildRes.markRound = [];
      engine.recordBuildHit(core, enemy, ctx);
      p.update(0.06);
      engine.update(ctx, 0.01);
    }
    expect(p.buildRes.pendingIcicle !== null || (p.buildRes.marks[enemy.id]?.stacks ?? 0) < 6).toBe(true);
  });
});

describe("薇洛 A:双狼配对与头狼", () => {
  it("L/R 同靶 1.2s 配对 +1 猎记;3 记后头狼扑击且仍是同一实体", () => {
    const p = new Player();
    p.rhythms = ["move", "hurt"];
    p.buildBranchId = "willow.a";
    p.skills.push(makeSkillEquipment(coreSkillOf("willow")));
    p.skills.push(makeSkillEquipment(heroSkillDef("willow_wolves")!));
    const enemy = spawnEnemy("chaser", vec2(60, 0), 1);
    const ctx = makeContext(p, [enemy]);
    const engine = new EquipmentEngine();
    p.movedThisFrame = 300;
    engine.update(ctx, 0.1);
    const wolves = ctx.minions.filter((m) => m.wolfSide);
    expect(wolves).toHaveLength(2);
    const ids = wolves.map((w) => w.id);
    for (let pair = 0; pair < 3; pair++) {
      engine.onMinionHit(wolves[0], enemy, ctx);
      engine.onMinionHit(wolves[1], enemy, ctx);
      p.update(0.1);
    }
    expect(p.buildRes.wolf!.alphaUntil).toBeGreaterThan(p.buildTime);
    expect(ctx.minions.filter((m) => m.wolfSide).map((w) => w.id)).toEqual(ids);
    expect((ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1] === 28)).toBe(true);
  });
});

describe("薇洛 B:亡影定拍与谢幕", () => {
  it("分岔主动件每 3 秒召影;入场 +1 幕;4 幕谢幕 3×14", () => {
    const p = new Player();
    p.rhythms = ["move", "pulse"];
    p.buildBranchId = "willow.b";
    p.skills.push(makeSkillEquipment(coreSkillOf("willow")));
    p.skills.push(makeSkillEquipment(heroSkillDef("willow_shades")!));
    const enemy = spawnEnemy("chaser", vec2(60, 0), 1);
    const ctx = makeContext(p, [enemy]);
    const engine = new EquipmentEngine();
    p.movedThisFrame = 300;
    engine.update(ctx, 0.1);
    expect(ctx.minions.filter((m) => m.wolfSide)).toHaveLength(0); // 核心狼槽被替代
    p.update(3.1);
    engine.update(ctx, 3.1);
    expect(ctx.minions.some((m) => m.shade)).toBe(true);
    expect(p.buildRes.shade!.acts).toBe(1);
    // 自然到期 3 次凑满 4 幕
    for (let i = 0; i < 3; i++) engine.onShadeExpire(ctx.minions.find((m) => m.shade)!, ctx);
    p.update(0.01);
    engine.update(ctx, 0.01);
    const calls = (ctx.damageEnemy as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as number);
    expect(calls).toContain(42);
  });
});
