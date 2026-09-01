/**
 * 精英/首领技能原语单元测试(批 4)。
 * updateSkill 为纯逻辑(事件回调记录),直接驱动验证触发时序/快照/参数预算。
 * M1 覆盖:slam(震击 → telegraph);M2 覆盖:summon/deathSummon/deathSplit(召唤家族);
 * M3 覆盖:pulse(区域/全场雾)/barrage(多点轰炸)/hideCycle/fireTrail/devour(控制与区域)。
 * M4 覆盖:charge(冲锋三段状态机)/aura(光环派生乘数,冲锋与光环)。
 * 表预算 + 折入独立性 + 基线免疫逐里程碑扩展。
 */

import { describe, it, expect } from "vitest";
import {
  SEASON_MONSTERS,
  SEASON_MONSTER_SKILLS,
  seasonMonster,
  seasonMonsterDef,
  seasonVariantDef,
} from "../src/data/seasonMonsters";
import { ENEMY_DEFS, SUMMON_SPREAD } from "../src/data/enemies";
import { OBSTACLE } from "../src/data/field";
import {
  spawnEnemy,
  updateSkill,
  updateEnemy,
  deathSummonSpecs,
  skillSplitBabies,
  auraMultAt,
  BOSS_SLAM,
  AURA_MULT_CAP,
  type Enemy,
  type EnemyDef,
  type EnemyKind,
  type EnemySkill,
  type SkillEvents,
  type SkillTelegraph,
} from "../src/entities/enemy";
import { PLAYER_BASE } from "../src/entities/player";
import { vec2, type Vec2 } from "../src/core/math";

/* ---------- 共用驱动器 ---------- */

function recorder() {
  const telegraphs: SkillTelegraph[] = [];
  const children: { kind: EnemyKind; pos: Vec2; def?: EnemyDef }[] = [];
  const chargeHits: { dmg: number; pos: Vec2; slow?: { factor: number; duration: number }; ignite?: { radius: number; duration: number } }[] = [];
  const pools: { pos: Vec2; radius: number; duration: number }[] = [];
  const ev: SkillEvents = {
    spawnChild: (kind, pos, def) => {
      children.push({ kind, pos, def });
    },
    onTelegraph: (t) => {
      telegraphs.push(t);
    },
    onChargeHit: (dmg, pos, slow, ignite) => {
      chargeHits.push({ dmg, pos, slow, ignite });
    },
    onDropPool: (pos, radius, duration) => {
      pools.push({ pos, radius, duration });
    },
  };
  return { telegraphs, children, chargeHits, pools, ev };
}

/** 按变体行造一只带技能的怪(折入后的 def;行为 = 行 behavior) */
function variant(id: string): Enemy {
  const row = seasonMonster(id);
  if (!row) throw new Error(`未知变体 ${id}`);
  return spawnEnemy(row.behavior, vec2(0, 0), 1, seasonMonsterDef(row, ENEMY_DEFS[row.behavior]));
}

/** 战场锁定尺寸 560×996(轰炸 field 落点均布用;与 game 层 arena 同构) */
const TEST_ARENA = { x0: 0, y0: 0, x1: 560, y1: 996 };

function tick(e: Enemy, ev: SkillEvents, secs: number, playerPos = vec2(100, 100), step = 0.1): void {
  const n = Math.round(secs / step);
  for (let i = 0; i < n; i++) updateSkill(e, step, playerPos, PLAYER_BASE.radius, TEST_ARENA, ev);
}

/** 表内带 slam 的键(当前 = M1 震击系 6 只) */
function slamKeys(): string[] {
  return Object.keys(SEASON_MONSTER_SKILLS).filter((k) => SEASON_MONSTER_SKILLS[k as keyof typeof SEASON_MONSTER_SKILLS]?.slam);
}

/** 表内带某槽位的键(11 原语槽位通用) */
function slotKeys(slot: keyof EnemySkill): string[] {
  return Object.keys(SEASON_MONSTER_SKILLS).filter((k) => {
    const s = SEASON_MONSTER_SKILLS[k as keyof typeof SEASON_MONSTER_SKILLS];
    return s ? Boolean(s[slot]) : false;
  });
}

/* ---------- 表自洽与预算 ---------- */

describe("SEASON_MONSTER_SKILLS:slam 参数预算(锚点 BOSS_SLAM,新手 maxHp 100)", () => {
  it("伤害分档封顶:精英 ≤ 0.7×、变体首领 ≤ 0.85×;蓄力 ≥ 0.9s、间隔 ≥ 6s、首触 > 0", () => {
    expect(slamKeys().length).toBeGreaterThan(0);
    for (const key of slamKeys()) {
      const slam = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.slam!;
      const row = seasonMonster(key)!;
      const cap = row.tier === "elite" ? 0.7 * BOSS_SLAM.damage : 0.85 * BOSS_SLAM.damage;
      expect(slam.damage, `${key} 伤害超档`).toBeLessThanOrEqual(cap);
      expect(slam.charge, `${key} 蓄力太短不可躲`).toBeGreaterThanOrEqual(0.9);
      expect(slam.interval, `${key} 间隔太密`).toBeGreaterThanOrEqual(6);
      expect(slam.first).toBeGreaterThan(0);
      expect(slam.radius).toBeGreaterThan(0);
      expect(slam.damage).toBeGreaterThan(0);
    }
  });

  it("震击系恰 6 只:3 精英 + 3 变体首领,键 = 行 id 且已挂载", () => {
    const keys = slamKeys();
    expect(keys).toHaveLength(6);
    let elites = 0;
    let bosses = 0;
    for (const key of keys) {
      const row = SEASON_MONSTERS.find((r) => r.id === key)!;
      expect(row.skill).toBe(key);
      if (row.tier === "elite") elites += 1;
      else if (row.tier === "boss") bosses += 1;
    }
    expect(elites).toBe(3);
    expect(bosses).toBe(3);
  });
});

describe("SEASON_MONSTER_SKILLS:召唤家族表自洽(节奏预算 + childVariant)", () => {
  it("周期召唤恰 7 只:首触 > 0、间隔 ≥ 6s、数量 1-4;子怪变体在册且 behavior 匹配、档位 = 基础/迅捷", () => {
    const keys = slotKeys("summon").sort();
    expect(keys).toEqual(
      ["cult_flame", "firevein_broodmother", "icevein_broodmother", "nether_tidelord", "primeval_echo", "troupe_master", "troupe_ringmaster"].sort()
    );
    for (const key of keys) {
      const s = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.summon!;
      expect(s.first, `${key} 首触无效`).toBeGreaterThan(0);
      expect(s.interval, `${key} 召唤太密`).toBeGreaterThanOrEqual(6);
      expect(s.count).toBeGreaterThanOrEqual(1);
      expect(s.count, `${key} 单次召唤超 4 只`).toBeLessThanOrEqual(4);
      expect(s.childVariant, `${key} 缺 childVariant`).toBeDefined();
      const child = seasonMonster(s.childVariant!);
      expect(child, `${key} 的子怪 ${s.childVariant} 不在册`).not.toBeNull();
      expect(child!.behavior, `${key} 子怪行为与 kind 不符`).toBe(s.kind);
      expect(child!.tier === "basic" || child!.tier === "swift", `${key} 子怪档位 ${child!.tier}`).toBe(true);
    }
  });

  it("死亡召唤恰 1 只(万骸指挥):数量 1-4,子怪变体在册且 behavior 匹配", () => {
    expect(slotKeys("deathSummon")).toEqual(["myriad_bone_marshal"]);
    const ds = SEASON_MONSTER_SKILLS.myriad_bone_marshal!.deathSummon!;
    expect(ds.count).toBeGreaterThanOrEqual(1);
    expect(ds.count).toBeLessThanOrEqual(4);
    const child = seasonMonster(ds.childVariant!)!;
    expect(child.behavior).toBe(ds.kind);
  });

  it("死亡分裂恰 3 只:数量 1-4(覆盖式;弱阀门在实例层断言)", () => {
    expect(slotKeys("deathSplit").sort()).toEqual(["cult_flame", "empty_valley_lord", "nether_tidelord"]);
    for (const key of slotKeys("deathSplit")) {
      const c = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.deathSplit!.count;
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(4);
    }
  });
});

describe("SEASON_MONSTER_SKILLS:M3 控制与区域表自洽(脉冲/轰炸/隐身/火带/吞噬)", () => {
  it("脉冲恰 4 只:蓄力 ≥ 0.9s、间隔 ≥ 6s、首触 > 0;区域型伤害 ≤ 档位上限;全场雾型零伤害纯减速", () => {
    const keys = slotKeys("pulse").sort();
    expect(keys).toEqual(["abyss_icemarrow", "darktide_priest", "nether_tidelord", "permafrost_priest"].sort());
    for (const key of keys) {
      const p = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.pulse!;
      const row = seasonMonster(key)!;
      expect(p.first, `${key} 首触无效`).toBeGreaterThan(0);
      expect(p.charge, `${key} 蓄力太短不可躲`).toBeGreaterThanOrEqual(0.9);
      expect(p.interval, `${key} 间隔太密`).toBeGreaterThanOrEqual(6);
      if (p.global) {
        expect(p.damage, `${key} 全场雾不得带伤害`).toBe(0);
        expect(p.slow, `${key} 全场雾须带减速`).toBeDefined();
      } else {
        const cap = row.tier === "elite" ? 0.7 * BOSS_SLAM.damage : 0.85 * BOSS_SLAM.damage;
        expect(p.damage, `${key} 伤害超档`).toBeLessThanOrEqual(cap);
        expect(p.damage).toBeGreaterThan(0);
        expect(p.radius, `${key} 区域半径无效`).toBeGreaterThan(0);
      }
      if (p.slow) {
        expect(p.slow.factor, `${key} 软控过强`).toBeGreaterThan(0.6);
        expect(p.slow.factor, `${key} 减速系数须 < 1`).toBeLessThan(1);
        expect(p.slow.duration, `${key} 减速时长无效`).toBeGreaterThan(0);
      }
    }
  });

  it("轰炸恰 2 只:单点伤害 ≤ 档位上限、落点 1-6、蓄力 ≥ 0.9s、间隔 ≥ 6s;aroundPlayer 须给散布", () => {
    const keys = slotKeys("barrage").sort();
    expect(keys).toEqual(["moltencore_priest", "skyburn_colossus"].sort());
    for (const key of keys) {
      const b = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.barrage!;
      const row = seasonMonster(key)!;
      const cap = row.tier === "elite" ? 0.7 * BOSS_SLAM.damage : 0.85 * BOSS_SLAM.damage;
      expect(b.damage, `${key} 单点伤害超档`).toBeLessThanOrEqual(cap);
      expect(b.damage).toBeGreaterThan(0);
      expect(b.count).toBeGreaterThanOrEqual(1);
      expect(b.count, `${key} 单次落点超 6`).toBeLessThanOrEqual(6);
      expect(b.charge, `${key} 蓄力太短不可躲`).toBeGreaterThanOrEqual(0.9);
      expect(b.interval, `${key} 间隔太密`).toBeGreaterThanOrEqual(6);
      expect(b.radius, `${key} 落点半径无效`).toBeGreaterThan(0);
      if (b.aim === "aroundPlayer") expect(b.spread, `${key} 散布缺失`).toBeGreaterThan(0);
    }
  });

  it("隐身周期恰 2 只:隐身占比 ≤ 0.2(可见/周期 ≥ 0.8)", () => {
    const keys = slotKeys("hideCycle").sort();
    expect(keys).toEqual(["abyss_icemarrow", "tide_gravewarden"].sort());
    for (const key of keys) {
      const h = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.hideCycle!;
      expect(h.cycle).toBeGreaterThan(0);
      expect(h.visible, `${key} 可见时长无效`).toBeGreaterThan(0);
      // ε 容差:5.6/7 之类的十进制分数在二进制浮点下略小于 0.8
      expect(h.visible / h.cycle, `${key} 隐身占比超 0.2`).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it("火带恰 1 只(熔核之心):池伤 duration×poolDps ≤ 25、间隔 ≥ 6s、cap ≥ 1", () => {
    expect(slotKeys("fireTrail")).toEqual(["molten_heart_core"]);
    const f = SEASON_MONSTER_SKILLS.molten_heart_core!.fireTrail!;
    expect(f.first).toBeGreaterThan(0);
    expect(f.interval, "火带间隔太密").toBeGreaterThanOrEqual(6);
    expect(f.duration * OBSTACLE.poolDps, "池伤超预算").toBeLessThanOrEqual(25);
    expect(f.radius).toBeGreaterThan(0);
    expect(f.cap).toBeGreaterThanOrEqual(1);
  });

  it("吞噬恰 1 只(极渊之颚):吸收比例 ∈ (0, 1]", () => {
    expect(slotKeys("devour")).toEqual(["polarabyss_jaw"]);
    const d = SEASON_MONSTER_SKILLS.polarabyss_jaw!.devour!;
    expect(d.healRate).toBeGreaterThan(0);
    expect(d.healRate).toBeLessThanOrEqual(1);
  });
});

describe("SEASON_MONSTER_SKILLS:M4 冲锋与光环表自洽(预算 + 子参数)", () => {
  it("冲锋恰 3 只且全精英:伤害 ≤ 0.7× 封顶、windup ≥ 0.9s、间隔 ≥ 6s、首触 > 0、冲刺快于常速", () => {
    const keys = slotKeys("charge").sort();
    expect(keys).toEqual(["first_echo", "frostfang_wolf", "wildfire_wolf"]);
    for (const key of keys) {
      const c = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.charge!;
      const row = seasonMonster(key)!;
      expect(row.skill, `${key} 未挂载`).toBe(key);
      expect(row.tier, `${key} 冲锋为精英专属`).toBe("elite");
      expect(c.damage, `${key} 撞击伤害超档`).toBeLessThanOrEqual(0.7 * BOSS_SLAM.damage);
      expect(c.damage).toBeGreaterThan(0);
      expect(c.windup, `${key} 蓄力太短不可反应`).toBeGreaterThanOrEqual(0.9);
      expect(c.interval, `${key} 冲锋间隔太密`).toBeGreaterThanOrEqual(6);
      expect(c.first).toBeGreaterThan(0);
      expect(c.duration, `${key} 冲刺时长无效`).toBeGreaterThan(0);
      expect(c.speedMult, `${key} 冲刺须快于常速`).toBeGreaterThan(1);
    }
  });

  it("冲锋子参数预算:软控 factor ∈ (0.6, 1)、点燃池伤 ≤ 25、slow/ignite 逐怪互斥", () => {
    const frost = SEASON_MONSTER_SKILLS.frostfang_wolf!.charge!;
    expect(frost.slow, "霜咬须带减速").toBeDefined();
    expect(frost.slow!.factor, "软控过强").toBeGreaterThan(0.6);
    expect(frost.slow!.factor).toBeLessThan(1);
    expect(frost.slow!.duration).toBeGreaterThan(0);
    expect(frost.ignite).toBeUndefined();
    const wild = SEASON_MONSTER_SKILLS.wildfire_wolf!.charge!;
    expect(wild.ignite, "燎原须带点燃").toBeDefined();
    expect(wild.ignite!.duration * OBSTACLE.poolDps, "点燃池伤超预算").toBeLessThanOrEqual(25);
    expect(wild.ignite!.radius).toBeGreaterThan(0);
    expect(wild.slow).toBeUndefined();
    const first = SEASON_MONSTER_SKILLS.first_echo!.charge!;
    expect(first.slow).toBeUndefined();
    expect(first.ignite).toBeUndefined();
  });

  it("光环恰 2 只:单轴光环(领鸣者速 / 百鬼统领伤),半径 > 0,乘数 ∈ (1, AURA_MULT_CAP]", () => {
    const keys = slotKeys("aura").sort();
    expect(keys).toEqual(["hundred_ghost_commander", "tone_leader"]);
    for (const key of keys) {
      const a = SEASON_MONSTER_SKILLS[key as keyof typeof SEASON_MONSTER_SKILLS]!.aura!;
      const row = seasonMonster(key)!;
      expect(row.skill, `${key} 未挂载`).toBe(key);
      expect(a.radius, `${key} 光环半径无效`).toBeGreaterThan(0);
      const axes = [a.speedMult, a.dmgMult].filter((m): m is number => m !== undefined);
      expect(axes, `${key} 须为单轴光环`).toHaveLength(1);
      expect(axes[0], `${key} 乘数须为增益`).toBeGreaterThan(1);
      expect(axes[0], `${key} 乘数超钳制`).toBeLessThanOrEqual(AURA_MULT_CAP);
    }
    expect(SEASON_MONSTER_SKILLS.tone_leader!.aura!.speedMult, "领鸣者 = 速度光环").toBeDefined();
    expect(SEASON_MONSTER_SKILLS.hundred_ghost_commander!.aura!.dmgMult, "百鬼统领 = 伤害光环").toBeDefined();
  });
});

describe("折入:技能随 def 走,实例独立", () => {
  it("def.skill 深等于表值且非同引用(逐槽克隆;覆盖全部已填表键)", () => {
    for (const key of Object.keys(SEASON_MONSTER_SKILLS)) {
      const k = key as keyof typeof SEASON_MONSTER_SKILLS;
      const row = seasonMonster(key)!;
      const def = seasonMonsterDef(row, ENEMY_DEFS[row.behavior]);
      expect(def.skill, `${key} 折入缺失`).toEqual(SEASON_MONSTER_SKILLS[k]);
      expect(def.skill).not.toBe(SEASON_MONSTER_SKILLS[k]);
    }
  });
});

/* ---------- slam 原语行为 ---------- */

describe("updateSkill:slam(震击 → telegraph)", () => {
  it("入场 first 秒首触,预警参数 = 表值,圈色 = 载体色", () => {
    const e = variant("abyss_herald");
    const r = recorder();
    const slam = SEASON_MONSTER_SKILLS.abyss_herald!.slam!;
    tick(e, r.ev, slam.first - 0.15);
    expect(r.telegraphs).toHaveLength(0);
    tick(e, r.ev, 0.2);
    expect(r.telegraphs).toHaveLength(1);
    const t = r.telegraphs[0];
    expect(t.radius).toBe(slam.radius);
    expect(t.charge).toBe(slam.charge);
    expect(t.damage).toBe(slam.damage);
    expect(t.color).toBe(e.def.color);
    expect(t.global).toBeFalsy();
    expect(t.slow).toBeUndefined();
  });

  it("位置快照:预警点 = 触发瞬间玩家位置,其后玩家跑开不改动(可躲)", () => {
    const e = variant("farnorth_guard");
    const r = recorder();
    const playerPos = vec2(100, 100);
    tick(e, r.ev, 3.05, playerPos);
    expect(r.telegraphs).toHaveLength(1);
    const t = r.telegraphs[0];
    expect(t.pos).toEqual({ x: 100, y: 100 });
    expect(t.pos).not.toBe(playerPos); // 是拷贝,不是引用
    playerPos.x = 999;
    expect(t.pos.x).toBe(100);
  });

  it("周期 = interval,长时间计数精确不漂移", () => {
    const e = variant("tide_gravewarden");
    const r = recorder();
    const slam = SEASON_MONSTER_SKILLS.tide_gravewarden!.slam!;
    // first 3 + k×8(k=0..4)落在 42.95s 内 = 5 次;第 6 次恰在 43s 整点,退半步避开
    tick(e, r.ev, slam.first + 5 * slam.interval - 0.05);
    expect(r.telegraphs).toHaveLength(5);
    tick(e, r.ev, slam.interval);
    expect(r.telegraphs).toHaveLength(6);
  });

  it("死亡载体不触发", () => {
    const e = variant("abyss_herald");
    const r = recorder();
    e.hp = 0;
    tick(e, r.ev, 30);
    expect(r.telegraphs).toHaveLength(0);
  });

  it("变体首领附加层不触碰三阶段字段(只出 telegraph,不占 bossSlamCharge)", () => {
    const e = variant("primeval_echo");
    const r = recorder();
    tick(e, r.ev, 20);
    expect(r.telegraphs.length).toBeGreaterThanOrEqual(2);
    expect(e.bossSlamCharge).toBe(0);
    expect(e.bossSlamPos).toBeNull();
  });
});

/* ---------- summon 原语行为(周期召唤) ---------- */

describe("updateSkill:summon(周期召唤 → spawnChild)", () => {
  it("入场 first 秒首触:数量/行为 = 表值;子怪携带 childVariant 折入定义(与记忆化缓存同引用),落点绕载体", () => {
    const e = variant("icevein_broodmother");
    const r = recorder();
    const s = SEASON_MONSTER_SKILLS.icevein_broodmother!.summon!;
    tick(e, r.ev, s.first - 0.15);
    expect(r.children).toHaveLength(0);
    tick(e, r.ev, 0.2);
    expect(r.children).toHaveLength(s.count);
    const cached = seasonVariantDef("icevein_worm");
    expect(cached).not.toBeNull();
    for (const c of r.children) {
      expect(c.kind).toBe("chaser");
      expect(c.def).toBe(cached);
      expect(c.def?.variantId).toBe("icevein_worm");
      expect(Math.abs(c.pos.x)).toBeLessThanOrEqual(SUMMON_SPREAD / 2);
      expect(Math.abs(c.pos.y)).toBeLessThanOrEqual(SUMMON_SPREAD / 2);
    }
  });

  it("周期 = interval:连续三波计数精确不漂移(4 只/次的剧团之主)", () => {
    const e = variant("troupe_master");
    const r = recorder();
    const s = SEASON_MONSTER_SKILLS.troupe_master!.summon!;
    // first 4 + k×8(k=0,1)落在 19.85s 内 = 2 波;第 3 波恰在 20s 整点,退半步避开
    tick(e, r.ev, s.first + 2 * s.interval - 0.15);
    expect(r.children).toHaveLength(s.count * 2);
    tick(e, r.ev, s.interval);
    expect(r.children).toHaveLength(s.count * 3);
  });

  it("剧团班主召唤迅捷档子怪(潮影疾鬼)", () => {
    const e = variant("troupe_ringmaster");
    const r = recorder();
    tick(e, r.ev, SEASON_MONSTER_SKILLS.troupe_ringmaster!.summon!.first + 0.05);
    expect(r.children).toHaveLength(2);
    for (const c of r.children) {
      expect(c.kind).toBe("swift");
      expect(c.def?.variantId).toBe("tide_shadeimp");
    }
  });

  it("死亡载体不召唤", () => {
    const e = variant("firevein_broodmother");
    const r = recorder();
    e.hp = 0;
    tick(e, r.ev, 30);
    expect(r.children).toHaveLength(0);
  });
});

/* ---------- pulse 原语行为(区域脉冲 / 全场雾) ---------- */

describe("updateSkill:pulse(脉冲 → telegraph)", () => {
  it("区域型(永冻祭司):入场 first 秒触发,快照玩家位置,伤害/减速透传表值(克隆不共享引用)", () => {
    const e = variant("permafrost_priest");
    const r = recorder();
    const p = SEASON_MONSTER_SKILLS.permafrost_priest!.pulse!;
    const playerPos = vec2(100, 100);
    tick(e, r.ev, p.first - 0.15, playerPos);
    expect(r.telegraphs).toHaveLength(0);
    tick(e, r.ev, 0.3, playerPos); // 明确越过 first 整点(整点上浮点累计误差可能未触发)
    expect(r.telegraphs).toHaveLength(1);
    const t = r.telegraphs[0];
    expect(t.pos).toEqual({ x: 100, y: 100 });
    expect(t.pos).not.toBe(playerPos);
    expect(t.radius).toBe(p.radius);
    expect(t.charge).toBe(p.charge);
    expect(t.damage).toBe(p.damage);
    expect(t.slow).toEqual(p.slow);
    expect(t.slow).not.toBe(p.slow); // 克隆透传,不共享表引用
    expect(t.global).toBeFalsy();
    expect(t.color).toBe(e.def.color);
  });

  it("全场雾型(深渊冰髓):global 标记 + 零伤害纯减速", () => {
    const e = variant("abyss_icemarrow");
    const r = recorder();
    const p = SEASON_MONSTER_SKILLS.abyss_icemarrow!.pulse!;
    tick(e, r.ev, p.first - 0.15);
    expect(r.telegraphs).toHaveLength(0);
    tick(e, r.ev, 0.3); // 明确越过 first 整点
    expect(r.telegraphs).toHaveLength(1);
    const t = r.telegraphs[0];
    expect(t.global).toBe(true);
    expect(t.damage).toBe(0);
    expect(t.slow).toEqual({ factor: 0.85, duration: 2 });
    expect(t.color).toBe(e.def.color);
  });
});

/* ---------- barrage 原语行为(多点轰炸 → N 条 telegraph) ---------- */

describe("updateSkill:barrage(多点轰炸)", () => {
  it("aroundPlayer(熔核祭司):一次 3 条,落点绕玩家快照 ±spread/2,参数 = 表值", () => {
    const e = variant("moltencore_priest");
    const r = recorder();
    const b = SEASON_MONSTER_SKILLS.moltencore_priest!.barrage!;
    const playerPos = vec2(100, 100);
    tick(e, r.ev, b.first - 0.15, playerPos);
    expect(r.telegraphs).toHaveLength(0);
    tick(e, r.ev, 0.3, playerPos); // 明确越过 first 整点
    expect(r.telegraphs).toHaveLength(b.count);
    for (const t of r.telegraphs) {
      expect(Math.abs(t.pos.x - 100), "落点超出散布窗").toBeLessThanOrEqual(b.spread / 2);
      expect(Math.abs(t.pos.y - 100), "落点超出散布窗").toBeLessThanOrEqual(b.spread / 2);
      expect(t.radius).toBe(b.radius);
      expect(t.charge).toBe(b.charge);
      expect(t.damage).toBe(b.damage);
      expect(t.global).toBeFalsy();
      expect(t.color).toBe(e.def.color);
    }
  });

  it("field(焚天巨像):一次 6 条,落点均布战场矩形内", () => {
    const e = variant("skyburn_colossus");
    const r = recorder();
    const b = SEASON_MONSTER_SKILLS.skyburn_colossus!.barrage!;
    tick(e, r.ev, b.first - 0.15);
    expect(r.telegraphs).toHaveLength(0);
    tick(e, r.ev, 0.3); // 明确越过 first 整点
    expect(r.telegraphs).toHaveLength(b.count);
    for (const t of r.telegraphs) {
      expect(t.pos.x).toBeGreaterThanOrEqual(TEST_ARENA.x0);
      expect(t.pos.x).toBeLessThanOrEqual(TEST_ARENA.x1);
      expect(t.pos.y).toBeGreaterThanOrEqual(TEST_ARENA.y0);
      expect(t.pos.y).toBeLessThanOrEqual(TEST_ARENA.y1);
      expect(t.damage).toBe(b.damage);
      expect(t.global).toBeFalsy();
    }
  });
});

/* ---------- hideCycle 原语行为(隐身周期) ---------- */

describe("updateSkill:hideCycle(隐身周期)", () => {
  it("潮汐墓守:可见段起步 → visible 后隐身 → 跨周期回可见;周期本身零召唤/零落池", () => {
    const e = variant("tide_gravewarden");
    const r = recorder();
    expect(e.hidden).toBe(false);
    tick(e, r.ev, 5.4); // visible = 5.6 之前仍可见
    expect(e.hidden).toBe(false);
    tick(e, r.ev, 0.3); // t = 5.7 ≥ 5.6 → 隐身
    expect(e.hidden).toBe(true);
    tick(e, r.ev, 1.4); // t = 7.1 → 7.1 % 7 = 0.1 → 回可见
    expect(e.hidden).toBe(false);
    expect(r.children).toHaveLength(0);
    expect(r.pools).toHaveLength(0);
  });
});

/* ---------- fireTrail 原语行为(行进火带 → onDropPool) ---------- */

describe("updateSkill:fireTrail(行进火带)", () => {
  it("熔核之心:入场 first 秒落池,参数 = 表值,落点 = 触发瞬间载体位置快照", () => {
    const e = variant("molten_heart_core");
    const r = recorder();
    const f = SEASON_MONSTER_SKILLS.molten_heart_core!.fireTrail!;
    e.pos.x = 300;
    e.pos.y = 400;
    tick(e, r.ev, f.first - 0.15);
    expect(r.pools).toHaveLength(0);
    tick(e, r.ev, 0.2);
    expect(r.pools).toHaveLength(1);
    const pool = r.pools[0];
    expect(pool.radius).toBe(f.radius);
    expect(pool.duration).toBe(f.duration);
    expect(pool.pos).toEqual({ x: 300, y: 400 });
    expect(pool.pos).not.toBe(e.pos); // 快照拷贝:载体离开不改池位置
    e.pos.x = 0;
    expect(pool.pos.x).toBe(300);
  });

  it("周期 = interval:第二池恰在 first+interval", () => {
    const e = variant("molten_heart_core");
    const r = recorder();
    const f = SEASON_MONSTER_SKILLS.molten_heart_core!.fireTrail!;
    tick(e, r.ev, f.first - 0.15); // t = 2.8,未触发
    expect(r.pools).toHaveLength(0);
    tick(e, r.ev, 0.2); // t = 3.0 → 首池
    expect(r.pools).toHaveLength(1);
    tick(e, r.ev, f.interval - 0.25); // t = 9.7,第二池(整点 10)未到
    expect(r.pools).toHaveLength(1);
    tick(e, r.ev, 0.35); // t = 10.1 → 第二池
    expect(r.pools).toHaveLength(2);
  });
});

/* ---------- 死亡结算钩子:deathSummonSpecs / skillSplitBabies ---------- */

describe("deathSummonSpecs(死亡召唤)", () => {
  it("万骸指挥:4 只腐尸落点绕尸体,携带回响行尸折入定义", () => {
    const e = variant("myriad_bone_marshal");
    e.pos.x = 300;
    e.pos.y = 300;
    const specs = deathSummonSpecs(e);
    expect(specs).toHaveLength(4);
    const cached = seasonVariantDef("echo_walker");
    for (const s of specs) {
      expect(s.kind).toBe("chaser");
      expect(s.def).toBe(cached);
      expect(s.def?.variantId).toBe("echo_walker");
      expect(Math.abs(s.pos.x - 300)).toBeLessThanOrEqual(SUMMON_SPREAD / 2);
      expect(Math.abs(s.pos.y - 300)).toBeLessThanOrEqual(SUMMON_SPREAD / 2);
    }
  });

  it("无 deathSummon 技能 = 空表(基线精英/首领)", () => {
    expect(deathSummonSpecs(spawnEnemy("elite", vec2(0, 0), 20))).toHaveLength(0);
    expect(deathSummonSpecs(spawnEnemy("boss", vec2(0, 0), 20))).toHaveLength(0);
  });
});

describe("skillSplitBabies(死亡分裂覆盖式)", () => {
  it("空谷之主(满配):3 只分裂幼体,覆盖基线首领的 2 只", () => {
    const e = variant("empty_valley_lord");
    const babies = skillSplitBabies(e);
    expect(babies).not.toBeNull();
    expect(babies!).toHaveLength(3);
    for (const b of babies!) expect(b.kind).toBe("splitling");
  });

  it("教团之焰:2 只;置弱后为空表(弱化阀门同基线语义)", () => {
    const e = variant("cult_flame");
    expect(skillSplitBabies(e)).toHaveLength(2);
    e.bossVariant = "weak";
    expect(skillSplitBabies(e)).toEqual([]);
  });

  it("无 deathSplit 技能 = null(调用方回落基线):基线首领/分裂体/震击变体", () => {
    expect(skillSplitBabies(spawnEnemy("boss", vec2(0, 0), 20))).toBeNull();
    expect(skillSplitBabies(spawnEnemy("splitter", vec2(0, 0), 20))).toBeNull();
    expect(skillSplitBabies(variant("abyss_herald"))).toBeNull();
  });
});

/* ---------- charge 原语行为(三段状态机:standby → windup → dash) ---------- */

describe("updateSkill:charge(冲锋三段状态机)", () => {
  it("第一回音:首触 5s 进蓄力 → 冲刺单次撞击 → 复位按 interval 进下一轮", () => {
    const e = variant("first_echo");
    const r = recorder();
    const c = SEASON_MONSTER_SKILLS.first_echo!.charge!;
    e.pos = vec2(200, 100); // 玩家在 (100,100):冲锋方向 = −x
    tick(e, r.ev, c.first - 0.15);
    expect(e.skillState!.chargePhase).toBe(0);
    expect(r.chargeHits).toHaveLength(0);
    tick(e, r.ev, 0.3); // 越过首触 → windup
    expect(e.skillState!.chargePhase).toBe(1);
    expect(e.skillState!.skillDashing).toBe(true);
    // windup 原地:位移为零
    const wx = e.pos.x;
    tick(e, r.ev, 0.8);
    expect(e.pos.x).toBe(wx);
    expect(e.skillState!.chargePhase).toBe(1);
    tick(e, r.ev, 0.3); // 越过 windup → dash
    expect(e.skillState!.chargePhase).toBe(2);
    tick(e, r.ev, 0.8); // dash 0.6s 结束 → 复位
    expect(r.chargeHits).toHaveLength(1);
    expect(r.chargeHits[0].dmg).toBe(c.damage);
    expect(e.skillState!.chargePhase).toBe(0);
    expect(e.skillState!.skillDashing).toBe(false);
    expect(e.pos.x).toBeLessThan(wx); // 朝玩家冲过一段
    // 下一轮 = interval(退 0.25 避开整点浮点残差,再跨半步)
    tick(e, r.ev, c.interval - 0.25);
    expect(e.skillState!.chargePhase).toBe(0);
    tick(e, r.ev, 0.4);
    expect(e.skillState!.chargePhase).toBe(1);
  });

  it("方向锁:蓄力结束瞬间快照玩家方向,冲刺中玩家侧移不改轨迹(可预判躲)", () => {
    const e = variant("first_echo");
    const r = recorder();
    e.pos = vec2(200, 100);
    const playerPos = vec2(100, 100);
    tick(e, r.ev, 4.85, playerPos);
    tick(e, r.ev, 0.3, playerPos); // windup
    tick(e, r.ev, 1.1, playerPos); // windup 结束 + 2 帧 dash(方向锁 −x)
    expect(e.skillState!.chargePhase).toBe(2);
    playerPos.y = 400; // 冲刺途中玩家纵向闪避
    tick(e, r.ev, 0.3, playerPos);
    expect(e.pos.y).toBe(100); // 轨迹不变
    expect(e.pos.x).toBeLessThan(140);
  });

  it("冲刺够不着 = 空撞(不计伤害)", () => {
    const e = variant("first_echo");
    const r = recorder();
    e.pos = vec2(200, 500); // 与玩家距离 ≈ 412 > 冲刺位移 ≈ 187
    const playerPos = vec2(100, 100);
    tick(e, r.ev, 4.85, playerPos);
    tick(e, r.ev, 0.3, playerPos);
    tick(e, r.ev, 1.1, playerPos);
    tick(e, r.ev, 0.8, playerPos);
    expect(r.chargeHits).toHaveLength(0);
    expect(e.skillState!.chargePhase).toBe(0);
  });

  it("位置钳制:贴墙冲锋不出战场(钳到 arena + 半径),撞墙也算命中", () => {
    const e = variant("first_echo");
    const r = recorder();
    e.pos = vec2(60, 500);
    const playerPos = vec2(10, 500); // 正 −x,直冲左墙
    tick(e, r.ev, 4.85, playerPos);
    tick(e, r.ev, 0.3, playerPos);
    tick(e, r.ev, 1.1, playerPos);
    tick(e, r.ev, 0.8, playerPos);
    expect(e.pos.x).toBe(TEST_ARENA.x0 + e.def.radius);
    expect(r.chargeHits).toHaveLength(1);
  });

  it("霜咬巨狼:撞击携带减速参数(透传给受击管线),无点燃", () => {
    const e = variant("frostfang_wolf");
    const r = recorder();
    e.pos = vec2(200, 100);
    tick(e, r.ev, 4.85);
    tick(e, r.ev, 0.3);
    tick(e, r.ev, 1.1);
    tick(e, r.ev, 0.8);
    expect(r.chargeHits).toHaveLength(1);
    expect(r.chargeHits[0].slow).toEqual({ factor: 0.7, duration: 2 });
    expect(r.chargeHits[0].ignite).toBeUndefined();
  });

  it("燎原狼王:撞击携带点燃参数(落池用),无减速", () => {
    const e = variant("wildfire_wolf");
    const r = recorder();
    e.pos = vec2(200, 100);
    tick(e, r.ev, 4.85);
    tick(e, r.ev, 0.3);
    tick(e, r.ev, 1.1);
    tick(e, r.ev, 0.8);
    expect(r.chargeHits).toHaveLength(1);
    expect(r.chargeHits[0].ignite).toEqual({ radius: 55, duration: 3 });
    expect(r.chargeHits[0].slow).toBeUndefined();
  });

  it("死亡载体不冲锋", () => {
    const e = variant("first_echo");
    const r = recorder();
    e.hp = 0;
    tick(e, r.ev, 30);
    expect(r.chargeHits).toHaveLength(0);
    expect(e.skillState).toBeUndefined();
  });
});

/* ---------- aura 原语行为(派生乘数,不改写目标) ---------- */

describe("auraMultAt(光环派生乘数)", () => {
  it("圈内吃增益 / 圈外归 1;自己也在自己的光环里", () => {
    const carrier = variant("tone_leader");
    carrier.pos = vec2(100, 100);
    const target = spawnEnemy("chaser", vec2(200, 100), 1); // 100px < 130
    expect(auraMultAt(target, [carrier]).speed).toBe(1.1);
    expect(auraMultAt(target, [carrier]).dmg).toBe(1);
    target.pos = vec2(240, 100); // 140px > 130
    expect(auraMultAt(target, [carrier]).speed).toBe(1);
    expect(auraMultAt(carrier, [carrier]).speed).toBe(1.1);
  });

  it("伤害光环只抬伤害轴(百鬼统领 1.15)", () => {
    const carrier = variant("hundred_ghost_commander");
    carrier.pos = vec2(300, 300);
    const target = spawnEnemy("chaser", vec2(350, 300), 1);
    const m = auraMultAt(target, [carrier]);
    expect(m.dmg).toBe(1.15);
    expect(m.speed).toBe(1);
  });

  it("死亡载体不出光环", () => {
    const carrier = variant("tone_leader");
    carrier.pos = vec2(100, 100);
    carrier.hp = 0;
    const target = spawnEnemy("chaser", vec2(150, 100), 1);
    expect(auraMultAt(target, [carrier]).speed).toBe(1);
  });

  it("多载体连乘钳制:5 × 速度 1.1 = 1.6105 → AURA_MULT_CAP", () => {
    const carriers: Enemy[] = [];
    for (let i = 0; i < 5; i++) {
      const c = variant("tone_leader");
      c.pos = vec2(100, 100);
      carriers.push(c);
    }
    const target = spawnEnemy("chaser", vec2(120, 100), 1);
    expect(auraMultAt(target, carriers).speed).toBe(AURA_MULT_CAP);
  });
});

/* ---------- updateEnemy 接线:冲锋让位 + 光环速度尾参 ---------- */

describe("updateEnemy:冲锋让位与光环速度乘数", () => {
  it("skillDashing = true:常规移动让位,位置不变(位移归冲锋分支结算)", () => {
    const e = variant("first_echo");
    const r = recorder();
    e.pos = vec2(200, 100);
    tick(e, r.ev, 4.85);
    tick(e, r.ev, 0.3); // 进 windup:skillDashing = true
    expect(e.skillState!.skillDashing).toBe(true);
    updateEnemy(e, vec2(100, 400), PLAYER_BASE.radius, 0.5);
    expect(e.pos.x).toBe(200);
    expect(e.pos.y).toBe(100);
  });

  it("speedMult 尾参:乘数 2 → 同帧位移恰 2 倍(同 id 对齐抖动项)", () => {
    const a = spawnEnemy("chaser", vec2(200, 200), 1);
    const b = spawnEnemy("chaser", vec2(200, 200), 1);
    b.id = a.id;
    updateEnemy(a, vec2(400, 200), PLAYER_BASE.radius, 0.1);
    updateEnemy(b, vec2(400, 200), PLAYER_BASE.radius, 0.1, 2);
    const da = Math.hypot(a.pos.x - 200, a.pos.y - 200);
    const db = Math.hypot(b.pos.x - 200, b.pos.y - 200);
    expect(db / da).toBeCloseTo(2, 10);
  });
});

/* ---------- 基线免疫 ---------- */

describe("基线免疫:无技能怪 60s 零事件", () => {
  it("基线精英", () => {
    const e = spawnEnemy("elite", vec2(0, 0), 20);
    const r = recorder();
    tick(e, r.ev, 60);
    expect(r.telegraphs).toHaveLength(0);
    expect(r.children).toHaveLength(0);
    expect(r.chargeHits).toHaveLength(0);
    expect(r.pools).toHaveLength(0);
    expect(e.skillState).toBeUndefined();
  });

  it("基线首领", () => {
    const e = spawnEnemy("boss", vec2(0, 0), 20);
    const r = recorder();
    tick(e, r.ev, 60);
    expect(r.telegraphs).toHaveLength(0);
    expect(e.skillState).toBeUndefined();
  });
});
