/**
 * 赛季主题怪单元测试(DESIGN-MONSTERS-SEASONS 批 1+2+3:S1/S2/S3/S4 共 120 种 + 赛季门控 + 机制参数化)。
 * 覆盖:名单配额 / 铁律(倍率均值守恒、单轴上限、xp·radius 继承)/
 *       变体 EnemyDef 合成与缓存 / 出场门控与倾向 / kind 分布零改动 / 敌情文案联动 /
 *       批 2 mech(slowOnHit → Player 减速通道、deathPool → 灼烧池几何)/
 *       批 3 revive(还魂体:首次致死原地复活一次,实体层)/
 *       批 4 skill(挂载纪律与基线免疫;原语行为测试在 monsterSkills.test.ts)。
 */

import { describe, it, expect } from "vitest";
import {
  SEASON_MONSTERS,
  SEASON_MONSTER_MECHS,
  SEASON_MONSTER_SKILLS,
  SEASON_MONSTER_TENDENCY,
  rollSeasonMonster,
  seasonMonster,
  seasonMonsterDef,
  seasonMonsterNames,
  seasonMonsterRowsOfBehavior,
  seasonMonsterThemeIndex,
  type SeasonMonsterRow,
  type SeasonMonsterTier,
} from "../src/data/seasonMonsters";
import { ENEMY_DEFS, type EnemyKind } from "../src/data/enemies";
import { spawnEnemy, tryRevive, splitBabies } from "../src/entities/enemy";
import { seasonMonsterDefFor } from "../src/systems/waves";
import { chapterIntel } from "../src/data/intel";
import { Player } from "../src/entities/player";
import { spawnBurnPool, tickObstacleTtl, isInPool, OBSTACLE, type Obstacle } from "../src/entities/objects";
import { PLAYER_BASE } from "../src/data/combat";
import { vec2 } from "../src/core/math";

/** 固定序列伪随机:先出 gate 值,再出选池值 */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length];
}

/** 每季配额(策划案 4.1);总表 = 4 季 × 30 */
const TIERS: Record<SeasonMonsterTier, number> = { basic: 8, swift: 5, heavy: 5, special: 6, elite: 4, boss: 2 };
const THEMES = [0, 1, 2, 3];

/* ---------- 名单与配额 ---------- */

describe("赛季主题怪名单(批 1+2+3 = S1/S2/S3/S4 各 30 种)", () => {
  it("配额:每季基础8/迅捷5/重甲5/特性6/精英4/首领2", () => {
    expect(SEASON_MONSTERS.length).toBe(120);
    const count = (t: SeasonMonsterTier, theme: number) =>
      SEASON_MONSTERS.filter((r) => r.tier === t && r.theme === theme).length;
    for (const theme of THEMES) {
      for (const [tier, want] of Object.entries(TIERS)) expect(count(tier as SeasonMonsterTier, theme)).toBe(want);
    }
  });
  it("id 与显示名全局唯一,行为均有基线怪,主题只落在已实装下标", () => {
    expect(new Set(SEASON_MONSTERS.map((r) => r.id)).size).toBe(120);
    expect(new Set(SEASON_MONSTERS.map((r) => r.name)).size).toBe(120);
    for (const r of SEASON_MONSTERS) {
      expect(ENEMY_DEFS[r.behavior].kind).toBe(r.behavior);
      expect(THEMES).toContain(r.theme);
      expect(seasonMonster(r.id)).toBe(r);
    }
    expect(seasonMonster("nope")).toBeNull();
  });
  it("特性/精英/首领覆盖全部机制行为(零新 AI)", () => {
    const behaviors = new Set(SEASON_MONSTERS.map((r) => r.behavior));
    for (const k of ["splitter", "hider", "reflector", "devourer", "shieldguard", "summoner", "elite", "boss"]) {
      expect(behaviors.has(k as EnemyKind)).toBe(true);
    }
  });
  it("批 3:四主题全部实装,派生索引全覆盖(幼体仍无变体)", () => {
    // chaser 组 = 4 季基础 8×4 + 凝滞之触 + 余烬孕体 = 34
    expect(seasonMonsterRowsOfBehavior("chaser").length).toBe(34);
    expect(seasonMonsterRowsOfBehavior("splitling").length).toBe(0);
    expect(seasonMonsterThemeIndex(1)).toBe(0);
    expect(seasonMonsterThemeIndex(5)).toBe(0);
    expect(seasonMonsterThemeIndex(2)).toBe(1);
    expect(seasonMonsterThemeIndex(4)).toBe(3);
  });
});

/* ---------- 铁律:只换皮不换曲线 ---------- */

describe("铁律:主题怪不抬高怪物曲线", () => {
  const groups = new Map<string, SeasonMonsterRow[]>();
  for (const r of SEASON_MONSTERS) {
    const key = `${r.theme}:${r.behavior}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  for (const [key, rows] of groups) {
    it(`${key} 组三轴倍率均值恒等于 1.0(期望威胁与基线怪逐轴相等)`, () => {
      for (const axis of ["hpMult", "speedMult", "dmgMult"] as const) {
        const sum = rows.reduce((a, r) => a + r[axis], 0);
        expect(Math.abs(sum - rows.length)).toBeLessThan(1e-9);
      }
    });
  }

  it("单轴偏移 ≤ ±15%", () => {
    for (const r of SEASON_MONSTERS) {
      for (const axis of ["hpMult", "speedMult", "dmgMult"] as const) {
        expect(Math.abs(r[axis] - 1)).toBeLessThanOrEqual(0.15 + 1e-9);
      }
    }
  });

  it("机制怪/精英/首领钉死 1.0(承载机制与 TTK 标定)", () => {
    for (const r of SEASON_MONSTERS.filter((x) => x.tier === "special" || x.tier === "boss")) {
      expect([r.hpMult, r.speedMult, r.dmgMult]).toEqual([1, 1, 1]);
    }
  });

  it("批 2+3:挂 mech 的行只出自声明的机制键,且仍是钉死 1.0 的特性档", () => {
    const mechRows = SEASON_MONSTERS.filter((r) => r.mech !== undefined);
    expect(mechRows.map((r) => r.id).sort()).toEqual(["ember_broodmother", "returning_soul", "stagnation_touch"]);
    for (const r of mechRows) {
      expect(SEASON_MONSTER_MECHS[r.mech!].type).toBe(r.mech);
      expect(r.tier).toBe("special");
      expect([r.hpMult, r.speedMult, r.dmgMult]).toEqual([1, 1, 1]);
    }
  });
});

/* ---------- 变体 EnemyDef 合成 ---------- */

describe("seasonMonsterDef:换皮不改动经济与几何", () => {
  const row = seasonMonster("echo_walker")!;
  const base = ENEMY_DEFS.chaser;

  it("折入三维与外观,并打上 variantId", () => {
    const def = seasonMonsterDef(row, base);
    expect(def.kind).toBe("chaser");
    expect(def.name).toBe("回响行尸");
    expect(def.color).toBe(row.color);
    expect(def.variantId).toBe("echo_walker");
    expect(def.hp).toBe(Math.round(base.hp * 1.08));
    expect(def.speed).toBeCloseTo(base.speed * 0.92, 10);
    expect(def.contactDmg).toBe(Math.round(base.contactDmg * 0.95));
  });

  it("xp 与 radius 原样继承(金币经济/碰撞贴图几何不动),基线表不被污染", () => {
    const def = seasonMonsterDef(row, base);
    expect(def.xp).toBe(base.xp);
    expect(def.radius).toBe(base.radius);
    expect(def.special).toBe(base.special);
    expect(ENEMY_DEFS.chaser).toBe(base);
    expect(base.variantId).toBeUndefined();
    expect(base.hp).toBe(30);
  });

  it("同 id 恒返回同一引用(与 ENEMY_DEFS[kind] 一样是共享只读行)", () => {
    expect(seasonMonsterDef(row, base)).toBe(seasonMonsterDef(seasonMonster("echo_walker")!, ENEMY_DEFS.chaser));
  });

  it("幼体/召唤子怪无变体(换皮不扩散)", () => {
    expect(seasonMonsterNames(1, "splitling")).toEqual([]);
    expect(rollSeasonMonster("splitling", 1, 9, seq(0))).toBeNull();
  });
});

/* ---------- 出场门控与倾向 ---------- */

describe("出场门控(seasonId / 新手区 / 过季)", () => {
  const { inSeason, offSeason, minChapter } = SEASON_MONSTER_TENDENCY;

  it("seasonId < 1 或 chapter < minChapter 一律不换皮(默认路径逐帧一致)", () => {
    expect(rollSeasonMonster("chaser", 0, 99, seq(0, 0))).toBeNull();
    expect(rollSeasonMonster("chaser", 1, minChapter - 1, seq(0, 0))).toBeNull();
    expect(seasonMonsterDefFor("chaser", 0, 99)).toBeUndefined();
  });
  it("命中阈值时从当季池取一只,未命中保持基线外观", () => {
    const hit = rollSeasonMonster("chaser", 1, minChapter, seq(inSeason - 0.01, 0));
    expect(hit?.id).toBe("echo_walker");
    expect(rollSeasonMonster("chaser", 1, minChapter, seq(inSeason, 0))).toBeNull();
    expect(seasonMonsterDefFor("chaser", 1, minChapter, seq(inSeason - 0.01, 0))).toBe(seasonMonsterDef(hit!, ENEMY_DEFS.chaser));
  });
  it("批 3 实装后,seasonId 4 = 当季主题 3:从本主题池取怪,倾向 = inSeason", () => {
    const pool = seasonMonsterNames(4, "chaser");
    expect(pool.length).toBe(8); // S4 基础 8(还魂体行为=splitter,不进 chaser 池)
    expect(rollSeasonMonster("chaser", 4, minChapter, seq(inSeason - 0.01, 0))!.theme).toBe(3);
    expect(rollSeasonMonster("chaser", 4, minChapter, seq(inSeason, 0))).toBeNull();
  });
  it("过季回退:当季主题无该行为时取其它主题存量,倾向降为 offSeason(S2/S3 无召唤师)", () => {
    const pool = seasonMonsterNames(2, "summoner"); // seasonId 2 = 主题 1,无 summoner
    expect(pool.length).toBe(2); // 回响之种(主题0) + 引潮孕母(主题3)
    expect(pool).toContain("回响之种");
    expect(pool).toContain("引潮孕母");
    expect(rollSeasonMonster("summoner", 2, minChapter, seq(offSeason - 0.01, 0))!.theme).not.toBe(1);
    expect(rollSeasonMonster("summoner", 2, minChapter, seq(offSeason, 0))).toBeNull();
  });
  it("倾向统计:当季 ≈ inSeason,池内近似均匀", () => {
    const N = 20000;
    let hits = 0;
    const ids = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const r = rollSeasonMonster("chaser", 1, 9, Math.random);
      if (r) {
        hits++;
        ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
      }
    }
    expect(Math.abs(hits / N - inSeason)).toBeLessThan(0.02);
    expect(ids.size).toBe(8);
    for (const c of ids.values()) expect(c).toBeGreaterThan((N * inSeason * 0.5) / 8);

    // S2(seasonId 2 = 主题 1)当季 chaser 池含凝滞之触 = 9 只
    const s2 = new Set(seasonMonsterNames(2, "chaser"));
    expect(s2.size).toBe(9);
    expect(s2.has("凝滞之触")).toBe(true);

    // S4(seasonId 4 = 主题 3)当季,重甲按 inSeason 出场
    let s4tank = 0;
    for (let i = 0; i < N; i++) if (rollSeasonMonster("tank", 4, 9, Math.random)) s4tank++;
    expect(Math.abs(s4tank / N - inSeason)).toBeLessThan(0.02);

    // 过季:seasonId 2(主题 1)无召唤师 → 回退存量,按 offSeason
    let off = 0;
    for (let i = 0; i < N; i++) if (rollSeasonMonster("summoner", 2, 9, Math.random)) off++;
    expect(Math.abs(off / N - offSeason)).toBeLessThan(0.01);
  });
});

/* ---------- 批 2+3:mech 参数化(3 个引擎行为 tag) ---------- */

describe("seasonMonsterDef:mech 折入(批 2+3)", () => {
  it("凝滞之触 → 变体 def 携带 slowOnHit 参数,kind 仍是 chaser(零新 AI)", () => {
    const row = seasonMonster("stagnation_touch")!;
    const def = seasonMonsterDef(row, ENEMY_DEFS.chaser);
    expect(def.kind).toBe("chaser");
    expect(def.variantId).toBe("stagnation_touch");
    expect(def.mech).toEqual({ type: "slowOnHit", factor: 0.7, duration: 1.5 });
    expect(def.mech).not.toBe(SEASON_MONSTER_MECHS.slowOnHit); // 拷贝入表,共享只读行不被外部改
  });

  it("余烬孕体 → 变体 def 携带 deathPool 参数,基线表与纯换皮变体不被污染", () => {
    const row = seasonMonster("ember_broodmother")!;
    const def = seasonMonsterDef(row, ENEMY_DEFS.chaser);
    expect(def.mech).toEqual({ type: "deathPool", radius: 60, duration: 4, cap: 6 });
    expect(ENEMY_DEFS.chaser.mech).toBeUndefined();
    expect(seasonMonsterDef(seasonMonster("ice_skater")!, ENEMY_DEFS.swift).mech).toBeUndefined();
  });

  it("还魂体 → 变体 def 携带 revive 参数,kind 仍是 splitter(零新 AI)", () => {
    const row = seasonMonster("returning_soul")!;
    const def = seasonMonsterDef(row, ENEMY_DEFS.splitter);
    expect(def.kind).toBe("splitter");
    expect(def.variantId).toBe("returning_soul");
    expect(def.mech).toEqual({ type: "revive", hpFrac: 0.5 });
    expect(def.mech).not.toBe(SEASON_MONSTER_MECHS.revive); // 拷贝入表
    expect(ENEMY_DEFS.splitter.mech).toBeUndefined(); // 基线分裂体不被污染
  });

  it("机制参数表自洽:减速是软控非硬控,灼烧池严格小于地形毒池,复活不回满血", () => {
    const slow = SEASON_MONSTER_MECHS.slowOnHit;
    expect(slow.factor).toBeGreaterThan(0.6);
    expect(slow.factor).toBeLessThan(1);
    expect(slow.duration).toBeLessThanOrEqual(2);
    const pool = SEASON_MONSTER_MECHS.deathPool;
    expect(pool.radius).toBeLessThan(OBSTACLE.poolRadius);
    expect(pool.cap).toBeGreaterThanOrEqual(1);
    // 单池总伤 = duration × poolDps,须显著低于新手血墙(惩罚可读)
    expect(pool.duration * OBSTACLE.poolDps).toBeLessThan(PLAYER_BASE.maxHp / 3);
    const rev = SEASON_MONSTER_MECHS.revive;
    expect(rev.hpFrac).toBeGreaterThan(0);
    // 不给满血:还魂体本就是分裂行为,满血复活 = 双倍威胁预算(违背曲线守恒)
    expect(rev.hpFrac).toBeLessThan(1);
  });
});

describe("还魂体:首次致死原地复活(批 3,实体层)", () => {
  const reviveDef = () => seasonMonsterDef(seasonMonster("returning_soul")!, ENEMY_DEFS.splitter);

  it("首次致死:hp ≤ 0 → 复活回 hpFrac×maxHp,置位复活标记", () => {
    const e = spawnEnemy("splitter", vec2(0, 0), 1, reviveDef());
    e.hp = 0;
    expect(tryRevive(e)).toBe(true);
    expect(e.hp).toBe(Math.max(1, Math.round(e.maxHp * 0.5)));
    expect(e.revivedOnce).toBe(true);
  });

  it("每只限一次:再次致死不再复活;血量未归零不触发", () => {
    const e = spawnEnemy("splitter", vec2(0, 0), 1, reviveDef());
    e.hp = 0;
    expect(tryRevive(e)).toBe(true);
    e.hp = 0;
    expect(tryRevive(e)).toBe(false);
    expect(e.hp).toBe(0);
    const fresh = spawnEnemy("splitter", vec2(0, 0), 1, reviveDef());
    expect(fresh.hp).toBeGreaterThan(0);
    expect(tryRevive(fresh)).toBe(false); // hp > 0 不算致死
  });

  it("无 revive 机制的怪不复活(基线分裂体 / slowOnHit / deathPool 变体)", () => {
    const defs = [
      ENEMY_DEFS.splitter,
      seasonMonsterDef(seasonMonster("stagnation_touch")!, ENEMY_DEFS.chaser),
      seasonMonsterDef(seasonMonster("ember_broodmother")!, ENEMY_DEFS.chaser),
    ];
    for (const def of defs) {
      const e = spawnEnemy(def.kind, vec2(0, 0), 1, def);
      e.hp = 0;
      expect(tryRevive(e)).toBe(false);
      expect(e.hp).toBe(0);
    }
  });

  it("复活后行为不变:仍是分裂体(二次致死照常分裂),零新 AI", () => {
    const e = spawnEnemy("splitter", vec2(0, 0), 1, reviveDef());
    e.hp = 0;
    expect(tryRevive(e)).toBe(true);
    expect(e.kind).toBe("splitter");
    expect(splitBabies(e).length).toBeGreaterThan(0);
  });
});

describe("玩家减速通道(凝滞之触的受击侧)", () => {
  it("未受减速 = 1.0;applySlow 后 speedMult = factor;update 到期自动恢复", () => {
    const p = new Player();
    expect(p.speedMult).toBe(1);
    p.applySlow(0.7, 1.5);
    expect(p.speedMult).toBe(0.7);
    p.update(1.4);
    expect(p.speedMult).toBe(0.7);
    p.update(0.2);
    expect(p.speedMult).toBe(1);
  });
  it("叠加 = 单一共享快照(factor 取最慢、剩余取最长,与 Enemy 侧同款)", () => {
    const p = new Player();
    p.applySlow(0.9, 2);
    p.applySlow(0.7, 1.5);
    expect(p.speedMult).toBe(0.7); // 弱源不抬强源
    p.update(1.6); // 计时取 max(2, 1.5) = 2 → 剩 0.4s,最慢快照仍挂着
    expect(p.speedMult).toBe(0.7);
    p.applySlow(0.95, 5); // 弱源续上最长剩余,factor 不被改写
    expect(p.speedMult).toBe(0.7);
    p.update(5); // 共享计时归零才恢复
    expect(p.speedMult).toBe(1);
  });
});

describe("灼烧池几何(余烬孕体的死亡侧)", () => {
  it("spawnBurnPool:kind 仍是 pool → isInPool 逐帧复用毒池 DoT 判定口径", () => {
    const pool = spawnBurnPool(vec2(100, 100), 60, 4);
    expect(pool.kind).toBe("pool");
    expect(pool.burn).toBe(true);
    expect(pool.ttl).toBe(4);
    expect(isInPool(vec2(140, 100), [pool])).toBe(true);
    expect(isInPool(vec2(170, 100), [pool])).toBe(false);
    expect(isInPool(vec2(0, 0), [{ kind: "pillar", pos: vec2(0, 0), radius: 40 } as Obstacle])).toBe(false);
  });
  it("tickObstacleTtl:到期移除;地形障碍(无 ttl)不受影响", () => {
    const terrain = { id: 1, kind: "pool", pos: vec2(0, 0), radius: 90 } satisfies Obstacle;
    const obs = [terrain, spawnBurnPool(vec2(1, 1), 60, 4), spawnBurnPool(vec2(2, 2), 60, 0.5)];
    tickObstacleTtl(obs, 1);
    expect(obs.length).toBe(2); // 0.5s 池已到期被移除,4s 池剩 3s
    tickObstacleTtl(obs, 4);
    expect(obs).toEqual([terrain]);
  });
});

/* ---------- 敌情文案联动 ---------- */

describe("章节敌情(season-aware desc)", () => {
  it("无赛季/未启用 → 基线文案不变", () => {
    expect(chapterIntel(1).desc).toBe("大量腐尸与迅捷鬼涌入");
    expect(chapterIntel(1, 0).desc).toBe("大量腐尸与迅捷鬼涌入");
    expect(chapterIntel(3, 1).desc).toBe("分裂体与反射者出没"); // 异变章无主力敌种
    expect(chapterIntel(2, 1).prefer).toBe("tank");
  });
  it("当季主力敌种改报主题怪名,数量与实际出场池一致", () => {
    expect(chapterIntel(1, 1).desc).toBe("回响行尸、共鸣尸 等 8 种");
    expect(chapterIntel(2, 1).desc).toBe("共鸣甲壳、混响岩铠 等 5 种");
    expect(chapterIntel(4, 1).desc).toBe("颤音疾骸、残响掠影 等 5 种");
    expect(chapterIntel(1, 1).desc).toContain(seasonMonsterNames(1, "chaser")[0]);
  });
  it("同一章永远同一敌情(确定性:标题/推荐/倍率不随赛季变)", () => {
    for (const c of [1, 2, 3, 4, 7]) {
      const a = chapterIntel(c, 1);
      const b = chapterIntel(c, 1);
      expect(b.title).toBe(a.title);
      expect(b.prefer).toBe(a.prefer);
      expect(b.recommended).toBe(a.recommended);
      expect(seasonMonsterNames(1, a.prefer ?? "chaser").length).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ---------- 批 4:技能管线骨架(挂载纪律 + 基线免疫) ---------- */

describe("批 4 技能管线:挂载纪律与基线免疫", () => {
  it("挂载纪律:row.skill 键必在表内、键 = 行 id(1:1)、仅精英/首领档携带;表键无孤儿", () => {
    for (const r of SEASON_MONSTERS) {
      if (!r.skill) continue;
      expect(SEASON_MONSTER_SKILLS[r.skill], `行 ${r.id} 缺表项`).toBeDefined();
      expect(r.skill).toBe(r.id);
      expect(r.tier === "elite" || r.tier === "boss").toBe(true);
    }
    for (const key of Object.keys(SEASON_MONSTER_SKILLS)) {
      const row = seasonMonster(key);
      expect(row, `孤儿技能键 ${key}`).not.toBeNull();
      expect(row!.skill).toBe(key);
    }
  });

  it("基线免疫:基线精英/首领无技能,无技能变体行折入后仍为 undefined", () => {
    expect(ENEMY_DEFS.elite.skill).toBeUndefined();
    expect(ENEMY_DEFS.boss.skill).toBeUndefined();
    // echo_walker(基础档)恒无技能 → 折入继承基线 undefined(批 4 不改基线行为)
    expect(seasonMonsterDef(seasonMonster("echo_walker")!, ENEMY_DEFS.chaser).skill).toBeUndefined();
  });

  it("全量核账:恰 24 行携带技能(4 季 × 精英4 + 首领2 = 16 + 8),精英/首领行全员挂载", () => {
    const carriers = SEASON_MONSTERS.filter((r) => r.skill !== undefined);
    expect(carriers).toHaveLength(24);
    expect(carriers.filter((r) => r.tier === "elite")).toHaveLength(16);
    expect(carriers.filter((r) => r.tier === "boss")).toHaveLength(8);
    // 每季恰 6 只(4 精英 + 2 首领)
    for (const theme of [0, 1, 2, 3]) {
      expect(carriers.filter((r) => r.theme === theme), `S${theme + 1} 挂载数`).toHaveLength(6);
    }
    // 无遗漏:全部精英/首领行都在挂载集合内
    for (const r of SEASON_MONSTERS) {
      if (r.tier === "elite" || r.tier === "boss") expect(r.skill, `${r.id} 缺技能挂载`).toBeDefined();
    }
  });
});
