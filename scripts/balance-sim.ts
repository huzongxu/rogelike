/**
 * 平衡模拟器 —— 在 Node 中用真实战斗系统跑长局,输出数值曲线。
 * 用法:vitest 内运行(见 tests/balance.test.ts);也导出 runSim 供手动调试。
 */

import { EquipmentEngine, type BattleContext } from "@game/systems/equipmentEngine";
import { Player, xpToNext } from "@game/entities/player";
import {
  spawnEnemy,
  updateEnemy,
  updateSpecial,
  reflectDamage,
  shieldguardDamageMult,
  splitBabies,
  applySlow,
  knockback,
  type Enemy,
  _resetEnemyUid,
} from "@game/entities/enemy";
import { updateProjectile, projectileHits, steerHoming, type Projectile, _resetProjectileUid } from "@game/entities/projectile";
import { spawnCloud, spawnGem, type Cloud, type Minion, type Gem, _resetObjectUids, type Obstacle, rollChapterObstacles, pushOutOfPillar, isInPool, OBSTACLE } from "@game/entities/objects";
import { WaveManager, type ArenaRect, type SpawnIntel } from "@game/systems/waves";
import { CHAPTER_ARENA } from "@game/data/stages";
import { chapterIntel } from "@game/data/intel";
import { chapterTypeInfo } from "@game/data/chapters";
import type { Equipment } from "@game/data/equipmentGen";
import { makeSetStarterEquipment, generateEquipment, generateSetEquipment, generatePassive, qualityBasePrice, SHOP_SLOT_CAP, qualityUpgrade, qualityPowerRatio, canUpgrade, upgradeCost, _resetEquipmentUid } from "@game/data/equipmentGen";
import { PASSIVE_SLOTS, type PassiveArtifact } from "@game/data/artifacts";
import { AI_PROFILE_PARAMS, RHYTHM_AI_PROFILE, isRhythm, type RhythmId } from "@game/data/rhythm";
import { RUN_AD_SLOT_LIMIT, shopCardPrice } from "@game/data/shop";
import { BOSS_GOLD, ELITE_GEM_COUNT, GOLD_PER_XP } from "@game/data/combat";
import { makeTrigger, makeEffect, makeModifier, type EffectType } from "@game/data/affixes";
import { makeSkillEquipment, resonanceBonusState, upgradeEquipment } from "@game/data/equipmentGen";
import { FALLBACK_OFFERS, SKILL_MAX_RANK, coreSkillOf, rollSkillOffers, type SkillOffer } from "@game/data/heroSkills";
import type { HeroId } from "@game/data/heroes";
import { RHYTHM_MAX_LEVEL } from "@game/data/rhythm";
import type { SetId } from "@game/data/sets";
import { comboStates, COMBO_OFF } from "@game/data/combos";
import { vec2, type Vec2 } from "@game/core/math";

export interface SimOptions {
  /** 使用的 Build */
  build: "starter" | "chain" | "turret" | "thorn" | "godly" | "barrage4" | "ember4" | "thorn4" | "set_thorn" | "set_barrage" | "set_ember" | "set_frost" | "set_magma" | "set_phantom" | "set_glacier" | "set_blizzard" | "set_plague" | "set_cinderfang" | "set_requiem" | "set_veil" | "shared6" | "frost4" | "magma4" | "phantom4" | "barrage6" | "combo_barrage" | "combo_rift" | "combo_thorn";
  /** 移动方式:挂机不动 / 绕圈风筝 */
  move: "idle" | "kite";
  /** 天赋加成(征服者):全局增伤/暴击/元素 */
  boosted?: boolean;
  /** 武器套组(2/4 件套联动;null = 无套组) */
  set?: SetId | null;
  /** 模拟章间商店成长:每章(60s)买最多 3 卡(售罄制,无强化;近似真实玩家) */
  shopGrowth?: boolean;
  /** 关卡生成密度缩放(对应关卡 spawnScale;默认 1) */
  spawnScale?: number;
  /** 是否刷神级敌人(游戏中由「神之挑战」天赋解锁;无天赋新手局为 false) */
  godEnemies?: boolean;
  /**
   * 章型建模(策划案 V3 §3.1,修复模拟与游戏失真):开启后按章节注入敌情加权
   * (主力敌种 +40% 血量、45% 生成倾向)与章型倍率(精英章密度 ×1.6、宝箱章混金怪)。
   * 默认关闭,已标定的曲线测试不受影响。
   */
  chapterTypes?: boolean;
  /**
   * 章首清场(镜像游戏 battleWorld.nextChapter):每 60s 清敌人 / 弹体 / 云 / 宝石,玩家回场心;
   * 召唤物默认**保留**并随主人回场心(R11);`clearMinionsOnChapter` = true 时按 R11 之前的口径一并清掉(对照用)。
   * 默认关闭,已标定基线逐帧不变。
   */
  chapterReset?: boolean;
  clearMinionsOnChapter?: boolean;
  /**
   * 跨套组合技结算(策划案 V3 §5):开启后按装备词缀实时结算三条组合技
   * (弹幕风暴/深渊裂隙/荆棘光环)。默认关闭,已标定基线逐帧不变;
   * 组合技强度验证用同一 build 开/关对照(见 tests/combos.test.ts)。
   */
  combos?: boolean;
  /**
   * 竞技场地形(策划案 V3 §6 / DESIGN-S4 §3):石柱挡路 + 毒池 DoT。
   * 默认关闭,已标定基线逐帧不变;开启后按章重生成(第 1 章净空),
   * 与游戏共用 rollChapterObstacles/pushOutOfPillar/isInPool 同款纯函数。
   */
  obstacles?: boolean;
  maxSeconds: number;
  /** 随机种子(确定性与可复现) */
  seed?: number;
}

export interface SimSnapshot {
  t: number;
  kills: number;
  level: number;
  wave: number;
  hp: number;
  enemyCount: number;
  gold: number;
  slots: number;
  cards: number;
  /** 累计造成伤害(差分可得窗口 DPS) */
  dmg: number;
}

export interface SimReport {
  seconds: number;
  wave: number;
  kills: number;
  level: number;
  died: boolean;
  /** 每分钟快照 */
  perMinute: SimSnapshot[];
  /** 局末金币(衡量出口是否消化得了收入) */
  finalGold: number;
  /** 局末槽位数 */
  finalSlots: number;
  /** 局末持卡数 */
  finalCards: number;
  /** 累计造成伤害(不受刷怪/截断封顶,衡量输出强度的确定性信号) */
  totalDamage: number;
  /** 毒池对玩家累计伤害(地形标定用;未开障碍为 0) */
  poolDamage: number;
  /** 局末装备 = 技能 + 主动法宝(供单标定测试复用,如 Boss 单目标 DPS 探针) */
  finalEquipment: Equipment[];
  /** 局末被动法宝(全局乘区;Boss DPS 探针要一起带上,否则终局输出被低估) */
  finalPassives: PassiveArtifact[];
}

export function buildEquipment(build: SimOptions["build"]): Equipment[] {
  switch (build) {
    case "starter":
      return [
        { id: 1, level: 1, quality: "common", name: "初始", triggers: [makeTrigger("pulse", { interval: 1.2 })], effect: makeEffect("knife", { damage: 40, speed: 520, radius: 640, spread: 16, pierce: 1 }, 1), modifiers: [] },
      ];
    case "chain":
      return [
        { id: 2, level: 3, quality: "legendary", name: "死亡连锁", triggers: [makeTrigger("kill", { chance: 0.4 })], effect: makeEffect("knife", { damage: 28, speed: 540, radius: 480 }, 3), modifiers: [makeModifier("chain", { targets: 3 })] },
        { id: 3, level: 3, quality: "rare", name: "骷髅前排", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("skeleton", { count: 1, damage: 18, duration: 12 }, 3), modifiers: [] },
      ];
    case "turret":
      return [
        { id: 4, level: 3, quality: "epic", name: "移动毒云", triggers: [makeTrigger("move", { distance: 500 })], effect: makeEffect("cloud", { dps: 16, radius: 120, duration: 4 }, 3), modifiers: [makeModifier("explode", { radius: 120, damageMult: 1.2 })] },
        { id: 5, level: 3, quality: "rare", name: "分裂飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 20, speed: 560, radius: 460 }, 3), modifiers: [makeModifier("split", { extra: 4 })] },
      ];
    case "thorn":
      return [
        { id: 6, level: 3, quality: "epic", name: "荆棘", triggers: [makeTrigger("hurt", { hpThreshold: 0.8 })], effect: makeEffect("nova", { damage: 50, radius: 140 }, 3), modifiers: [makeModifier("power", { pct3: 0.2 })] },
      ];
    case "godly":
      return [
        { id: 7, level: 6, quality: "legendary", name: "死亡连锁", triggers: [makeTrigger("kill", { chance: 0.5 })], effect: makeEffect("knife", { damage: 64, speed: 560, radius: 500 }, 6), modifiers: [makeModifier("chain", { targets: 4 }), makeModifier("power", { pct3: 0.3 })] },
        { id: 8, level: 6, quality: "rare", name: "骷髅前排", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("skeleton", { count: 1, damage: 42, duration: 15 }, 6), modifiers: [] },
        { id: 9, level: 6, quality: "rare", name: "分裂飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 48, speed: 580, radius: 480, spread: 2 }, 6), modifiers: [makeModifier("split", { extra: 4 })] },
        { id: 10, level: 6, quality: "epic", name: "荆棘新星", triggers: [makeTrigger("hurt", { hpThreshold: 0.7 })], effect: makeEffect("nova", { damage: 112, radius: 160 }, 6), modifiers: [makeModifier("explode", { radius: 140, damageMult: 1.2 })] },
        { id: 11, level: 6, quality: "rare", name: "汲取脉冲", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("drain", { heal: 64 }, 6), modifiers: [] },
      ];
    case "barrage4":
      // 弹幕风暴 4 件套:2 飞刀 + 2 射线(齐射 +1 弹幕 / 穿透风暴 ×1.25 + 穿透)
      return [
        { id: 12, level: 4, quality: "epic", name: "齐射飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 26, speed: 540, radius: 640, spread: 2 }, 4), modifiers: [makeModifier("haste", { pct2: 0.1 })] },
        { id: 13, level: 4, quality: "rare", name: "移动飞刀", triggers: [makeTrigger("move", { distance: 400 })], effect: makeEffect("knife", { damage: 30, speed: 560, radius: 640 }, 4), modifiers: [] },
        { id: 14, level: 4, quality: "epic", name: "冰霜射线", triggers: [makeTrigger("pulse", { interval: 1.4 })], effect: makeEffect("ray", { damage: 24, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 4), modifiers: [makeModifier("split", { extra: 1 })] },
        { id: 15, level: 4, quality: "rare", name: "击杀射线", triggers: [makeTrigger("kill", { chance: 0.4 })], effect: makeEffect("ray", { damage: 28, speed: 620, radius: 640 }, 4), modifiers: [] },
      ];
    case "ember4":
      // 余烬天灾 4 件套:火焰/毒云/闪电/召唤(余烬扩散范围·持续 / 元素天灾 ×1.3)
      return [
        { id: 16, level: 4, quality: "epic", name: "击杀新星", triggers: [makeTrigger("kill", { chance: 0.45 })], effect: makeEffect("nova", { damage: 55, radius: 150 }, 4), modifiers: [makeModifier("explode", { radius: 130, damageMult: 0.8 })] },
        { id: 17, level: 4, quality: "rare", name: "脉冲毒云", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("cloud", { dps: 16, radius: 120, duration: 4 }, 4), modifiers: [] },
        { id: 18, level: 4, quality: "epic", name: "连杀闪电", triggers: [makeTrigger("combo", { count: 5, window: 2 })], effect: makeEffect("chain", { damage: 40, jumps: 4, radius: 380 }, 4), modifiers: [makeModifier("power", { pct3: 0.2 })] },
        { id: 19, level: 4, quality: "rare", name: "召唤骷髅", triggers: [makeTrigger("pulse", { interval: 2.5 })], effect: makeEffect("skeleton", { count: 1, damage: 22, duration: 12 }, 4), modifiers: [] },
      ];
    case "set_thorn":
      return [makeSetStarterEquipment("thorn")];
    case "set_barrage":
      return [makeSetStarterEquipment("barrage")];
    case "set_ember":
      return [makeSetStarterEquipment("ember")];
    case "set_frost":
      // S2 赛季套组初始武器标定(DESIGN-SEASON-SETS §3.5):第 1 章 60s 存活 HP>50
      return [makeSetStarterEquipment("frost")];
    case "set_magma":
      // S3 赛季套组初始武器标定(DESIGN-SEASON-SETS §3.5):对标 60s 清第 1 章
      return [makeSetStarterEquipment("magma")];
    case "set_phantom":
      // S4 赛季套组初始武器标定(DESIGN-SEASON-SETS §3.5):召唤流,对标 309-356s 带
      return [makeSetStarterEquipment("phantom")];
    case "set_glacier":
      // S2 冰川界碑初始武器(英雄系统:每季 3 套专属)
      return [makeSetStarterEquipment("glacier")];
    case "set_blizzard":
      // S2 白啸霜刃初始武器
      return [makeSetStarterEquipment("blizzard")];
    case "set_plague":
      // S3 熔毒瘟薪初始武器
      return [makeSetStarterEquipment("plague")];
    case "set_cinderfang":
      // S3 炽牙雷殛初始武器
      return [makeSetStarterEquipment("cinderfang")];
    case "set_requiem":
      // S4 镇魂安可初始武器:召唤流
      return [makeSetStarterEquipment("requiem")];
    case "set_veil":
      // S4 雾缚噬灵初始武器:召唤 + 回复流
      return [makeSetStarterEquipment("veil")];
    case "shared6":
      // 多对一归属回归:6 张射线(同时计入弹幕风暴与冰川界碑的 6 件档)
      return ([
        { id: 70, level: 4, quality: "epic", name: "脉冲射线", triggers: [makeTrigger("pulse", { interval: 1.1 })], effect: makeEffect("ray", { damage: 26, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 4), modifiers: [] },
      ] as Equipment[]).concat(
        [71, 72, 73, 74, 75].map((id) => ({
          id,
          level: 4,
          quality: "rare" as const,
          name: `计件射线${id}`,
          triggers: [makeTrigger("kill", { chance: 0.2 })],
          effect: makeEffect("ray", { damage: 24, speed: 620, radius: 640 }, 4),
          modifiers: [],
        }))
      );
    case "frost4":
      // 极北冰脉 4 件套:2 冰锥 + 2 霜环(锋寒射程 +12% / 极北威压 冰系×1.3·冰锥×1.25)
      return [
        { id: 40, level: 4, quality: "epic", name: "脉冲冰锥", triggers: [makeTrigger("pulse", { interval: 1.2 })], effect: makeEffect("icelance", { damage: 55, speed: 700, radius: 640, homing: 4 }, 4), modifiers: [makeModifier("power", { pct3: 0.2 })] },
        { id: 41, level: 4, quality: "rare", name: "击杀冰锥", triggers: [makeTrigger("kill", { chance: 0.4 })], effect: makeEffect("icelance", { damage: 60, speed: 700, radius: 640, homing: 4 }, 4), modifiers: [] },
        { id: 42, level: 4, quality: "epic", name: "脉冲霜环", triggers: [makeTrigger("pulse", { interval: 1.8 })], effect: makeEffect("frost_ring", { damage: 30, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 }, 4), modifiers: [makeModifier("pierce", { count: 1 })] },
        { id: 43, level: 4, quality: "rare", name: "移动霜环", triggers: [makeTrigger("move", { distance: 450 })], effect: makeEffect("frost_ring", { damage: 35, radius: 240, expandSpeed: 260, slow: 0.35, duration: 1 }, 4), modifiers: [] },
      ];
    case "magma4":
      // 熔核教团 4 件套:2 陨星 + 2 熔岩足迹(地火奔涌持续+1s / 烈焰统治 火系×1.3·范围×1.2)
      return [
        { id: 44, level: 4, quality: "epic", name: "脉冲陨星", triggers: [makeTrigger("pulse", { interval: 1.6 })], effect: makeEffect("meteor", { damage: 90, radius: 140, delay: 1 }, 4), modifiers: [makeModifier("explode", { radius: 120, damageMult: 0.8 })] },
        { id: 45, level: 4, quality: "rare", name: "击杀陨星", triggers: [makeTrigger("kill", { chance: 0.45 })], effect: makeEffect("meteor", { damage: 100, radius: 140, delay: 1 }, 4), modifiers: [] },
        { id: 46, level: 4, quality: "epic", name: "移动熔岩", triggers: [makeTrigger("move", { distance: 400 })], effect: makeEffect("magma_trail", { dps: 16, radius: 60, duration: 3 }, 4), modifiers: [makeModifier("duration", { sec: 1 })] },
        { id: 47, level: 4, quality: "rare", name: "脉冲熔岩", triggers: [makeTrigger("pulse", { interval: 2.2 })], effect: makeEffect("magma_trail", { dps: 18, radius: 60, duration: 3 }, 4), modifiers: [makeModifier("power", { pct3: 0.15 })] },
      ];
    case "barrage6":
      // 弹幕风暴 6 件套(3/6 档位制质变验证):barrage4 + 2 张同派系(齐射 3 件 + 弹幕翻倍 6 件)
      return ([
        { id: 60, level: 4, quality: "epic", name: "齐射飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 26, speed: 540, radius: 640, spread: 2 }, 4), modifiers: [makeModifier("haste", { pct2: 0.1 })] },
        { id: 61, level: 4, quality: "rare", name: "贯穿射线", triggers: [makeTrigger("pulse", { interval: 1.4 })], effect: makeEffect("ray", { damage: 26, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 4), modifiers: [] },
      ] as Equipment[]).concat(buildEquipment("barrage4"));
    case "phantom4":
      // 亡影剧团 4 件套:2 灵狼 + 2 亡灵冠冕(群影 ×1.2 / 亡者行军 ×1.35·持续+3s)
      return [
        { id: 48, level: 4, quality: "epic", name: "脉冲灵狼", triggers: [makeTrigger("pulse", { interval: 2.2 })], effect: makeEffect("spirit_wolves", { count: 2, damage: 26, duration: 12 }, 4), modifiers: [makeModifier("power", { pct3: 0.15 })] },
        { id: 49, level: 4, quality: "rare", name: "移动灵狼", triggers: [makeTrigger("move", { distance: 500 })], effect: makeEffect("spirit_wolves", { count: 2, damage: 30, duration: 12 }, 4), modifiers: [] },
        { id: 50, level: 4, quality: "epic", name: "击杀亡影", triggers: [makeTrigger("kill", { chance: 0.3 })], effect: makeEffect("haunt_crown", { count: 1, damage: 40, duration: 8 }, 4), modifiers: [makeModifier("duration", { sec: 1 })] },
        { id: 51, level: 4, quality: "rare", name: "连杀亡影", triggers: [makeTrigger("combo", { count: 5, window: 2 })], effect: makeEffect("haunt_crown", { count: 2, damage: 45, duration: 8 }, 4), modifiers: [] },
      ];
    case "thorn4":
      // 荆棘回响 4 件套:受击/受伤触发伤害卡 + 汲取/护盾续航(棘肤回血 + 反伤回响)
      return [
        { id: 20, level: 4, quality: "epic", name: "受伤新星", triggers: [makeTrigger("hurt", { hpThreshold: 0.7 })], effect: makeEffect("nova", { damage: 60, radius: 150 }, 4), modifiers: [makeModifier("power", { pct3: 0.2 })] },
        { id: 21, level: 4, quality: "rare", name: "受击射线", triggers: [makeTrigger("hit", {})], effect: makeEffect("ray", { damage: 45, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 4), modifiers: [] },
        { id: 22, level: 4, quality: "rare", name: "汲取脉冲", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("drain", { heal: 50 }, 4), modifiers: [] },
        { id: 23, level: 4, quality: "epic", name: "护盾脉冲", triggers: [makeTrigger("kill", { chance: 0.4 })], effect: makeEffect("shield", { amount: 70, duration: 6 }, 4), modifiers: [makeModifier("lifesteal", { pct: 0.06 })] },
      ];
    // 组合技验证 build(策划案 V3 §5 / DESIGN-S4 §2.4):同底座用 combos 开关对照强度
    case "combo_barrage":
      // 弹幕风暴:修饰器 连锁+分裂+穿透 各 1 卡 + 输出底座(三张脉冲弹幕墙)
      return [
        { id: 24, level: 4, quality: "epic", name: "连锁飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 26, speed: 560, radius: 480, spread: 2 }, 4), modifiers: [makeModifier("chain", { targets: 2 })] },
        { id: 25, level: 4, quality: "epic", name: "分裂飞刀", triggers: [makeTrigger("pulse", { interval: 1 })], effect: makeEffect("knife", { damage: 26, speed: 560, radius: 480, spread: 2 }, 4), modifiers: [makeModifier("split", { extra: 1 })] },
        { id: 26, level: 4, quality: "rare", name: "穿透射线", triggers: [makeTrigger("pulse", { interval: 1.2 })], effect: makeEffect("ray", { damage: 24, speed: 620, radius: 480 }, 4), modifiers: [makeModifier("pierce", { count: 1 })] },
      ];
    case "combo_rift":
      // 深渊裂隙:效果 新星+毒云+汲取 + 受伤触发底座(荆棘流新星)
      return [
        { id: 27, level: 4, quality: "epic", name: "脉冲新星", triggers: [makeTrigger("pulse", { interval: 1.6 })], effect: makeEffect("nova", { damage: 45, radius: 140 }, 4), modifiers: [] },
        { id: 28, level: 4, quality: "rare", name: "脉冲毒云", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("cloud", { dps: 14, radius: 120, duration: 4 }, 4), modifiers: [] },
        { id: 29, level: 4, quality: "rare", name: "汲取脉冲", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("drain", { heal: 40 }, 4), modifiers: [] },
        { id: 30, level: 4, quality: "epic", name: "受伤新星", triggers: [makeTrigger("hurt", { hpThreshold: 0.7 })], effect: makeEffect("nova", { damage: 55, radius: 150 }, 4), modifiers: [] },
      ];
    case "combo_thorn":
      // 荆棘光环:护盾效果 + 吸血修饰器 + 受击触发,底座 = thorn4 改件(护盾卡改脉冲触发)
      return [
        { id: 31, level: 4, quality: "epic", name: "受伤新星", triggers: [makeTrigger("hurt", { hpThreshold: 0.7 })], effect: makeEffect("nova", { damage: 60, radius: 150 }, 4), modifiers: [makeModifier("power", { pct3: 0.2 })] },
        { id: 32, level: 4, quality: "rare", name: "受击射线", triggers: [makeTrigger("hit", {})], effect: makeEffect("ray", { damage: 45, speed: 620, radius: 640, slow: 0.45, duration: 2 }, 4), modifiers: [] },
        { id: 33, level: 4, quality: "rare", name: "汲取脉冲", triggers: [makeTrigger("pulse", { interval: 2 })], effect: makeEffect("drain", { heal: 50 }, 4), modifiers: [] },
        { id: 34, level: 4, quality: "epic", name: "护盾脉冲", triggers: [makeTrigger("pulse", { interval: 2.5 })], effect: makeEffect("shield", { amount: 70, duration: 6 }, 4), modifiers: [makeModifier("lifesteal", { pct: 0.06 })] },
      ];
  }
}

/**
 * 单件初始武器 build → 出战英雄(docs/DESIGN-HERO-RHYTHM.md §3:核心技能与独有技能池的键)。
 * 多件锚点 build(chain / turret / godly / *4 / combo_*)不在表内 = 不走升级三选一,保持旧标定语义。
 */
const HERO_BY_BUILD: Partial<Record<SimOptions["build"], HeroId | null>> = {
  starter: null, // 未选英雄:通用职业包 + 周期节律
  set_thorn: "vera",
  set_barrage: "kyle",
  set_ember: "bran",
  set_frost: "sia",
  set_glacier: "nora",
  set_blizzard: "loka",
  set_magma: "doran",
  set_plague: "sally",
  set_cinderfang: "rayne",
  set_phantom: "willow",
  set_requiem: "oden",
  set_veil: "mu",
};

/** 深拷贝一张卡并换新 id(模拟商店"刷已持卡同款",供进化凑组) */
function cloneCard(src: Equipment, id: number): Equipment {
  return {
    id,
    level: src.level,
    quality: src.quality,
    name: src.name,
    triggers: src.triggers.map((t) => ({ def: t.def, params: { ...t.params } })),
    effect: { def: src.effect.def, params: { ...src.effect.params }, level: src.effect.level },
    modifiers: src.modifiers.map((m) => ({ def: m.def, params: { ...m.params } })),
    kind: src.kind,
    skillId: src.skillId,
  };
}

export function runSim(opts: SimOptions): SimReport {
  // 种子化 Math.random(可复现;结束后恢复)
  const origRandom = Math.random;
  if (opts.seed !== undefined) {
    let s = opts.seed;
    Math.random = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }
  try {
    return runSimInner(opts);
  } finally {
    Math.random = origRandom;
  }
}

function runSimInner(opts: SimOptions): SimReport {
  // 归零全部 id 计数(装备从 1000 起,避开预置卡 1-23/9001+ 与克隆卡 100000+ 段):
  // 敌人抖动按 id 哈希、商店合并按 id 去重,不归零会随进程上下文漂移
  _resetEnemyUid();
  _resetProjectileUid();
  _resetObjectUids();
  _resetEquipmentUid(1000);
  const player = new Player();
  player.equipment = buildEquipment(opts.build);
  // 节律体系(docs/DESIGN-HERO-RHYTHM.md):单件初始武器的 build 把那一件当核心技能(不占主动槽),
  // 本命节律 = 它的触发器;多件锚点 build 保留为主动法宝,已解锁节律 = 其触发器集合
  const heroId = HERO_BY_BUILD[opts.build];
  const levelUps = heroId !== undefined;
  if (levelUps) {
    // 与游戏同口径(battleWorld.startRun):选了英雄 → 核心技能按技能表实例化(节律表 × 调率,R6);
    // 未选英雄(starter)→ 沿用宿主初始武器当核心。此前直接把套组旧初始武器当核心,节拍比真机快一倍,复审数据失真
    const core = heroId ? makeSkillEquipment(coreSkillOf(heroId)) : { ...player.equipment[0], kind: "skill" as const, skillId: coreSkillOf(null).id };
    player.skills = [core];
    player.equipment = [];
  } else {
    // 多件锚点 build 就是玩家手里的主动法宝:标 active 才参与共鸣(变形 + 共鸣里程碑),与真实商店货同口径
    for (const eq of player.equipment) if (!eq.kind) eq.kind = "active";
  }
  const rhythmSet = new Set<RhythmId>();
  // 技能只看首条触发器(第二条是核心的「底拍」慢周期,不算已解锁节律);法宝看全部
  for (const eq of player.castList) for (const t of eq.kind === "skill" ? eq.triggers.slice(0, 1) : eq.triggers) if (isRhythm(t.def.type)) rhythmSet.add(t.def.type);
  player.rhythms = rhythmSet.size > 0 ? [...rhythmSet] : ["pulse"];
  /**
   * 升级三选一的自动选择(镜像游戏:升级 → 三张独有技能卡 → 选一张)。策略固定可复现:
   * 分岔(首个)> 新技能 > 核心升阶 > 其余升阶 > 节律强化 > 兜底回血。
   */
  const autoPick = (): void => {
    const owned = new Map<string, number>();
    for (const s of player.skills) if (s.skillId) owned.set(s.skillId, s.level);
    const rhythms = new Map<RhythmId, number>();
    for (const r of player.rhythms) rhythms.set(r, player.rhythmLevelOf(r));
    const offers = rollSkillOffers({ heroId: heroId ?? null, owned, branchChosen: player.branchChosen, playerLevel: player.level, rhythms }, 3);
    const rank = (o: SkillOffer): number => {
      if (o.kind === "skill") return o.def.kind === "branch" ? 0 : 1;
      if (o.kind === "rank") return o.skillId === coreSkillOf(heroId ?? null).id ? 2 : 3;
      if (o.kind === "rhythm") return 4;
      return 5;
    };
    const pick = [...offers].sort((a, b) => rank(a) - rank(b))[0];
    if (!pick) return;
    switch (pick.kind) {
      case "skill": {
        player.skills.push(makeSkillEquipment(pick.def));
        if (pick.def.kind === "branch") {
          player.unlockRhythm(pick.def.rhythm);
          player.branchChosen = pick.def.id;
        }
        break;
      }
      case "rank": {
        const live = player.skills.find((s) => s.skillId === pick.skillId);
        if (live && live.level < SKILL_MAX_RANK) upgradeEquipment(live);
        break;
      }
      case "rhythm":
        if (player.rhythmLevelOf(pick.rhythm) < RHYTHM_MAX_LEVEL) player.rhythmLevelUp(pick.rhythm);
        break;
      case "fallback": {
        const fb = FALLBACK_OFFERS.find((f) => f.id === pick.id)!;
        if ("healPct" in fb) player.heal(Math.round(player.maxHp * fb.healPct));
        if ("maxHp" in fb) {
          player.maxHp += fb.maxHp;
          player.heal(fb.maxHp);
        }
        break;
      }
    }
  };
  const engine = new EquipmentEngine();
  const waves = new WaveManager();
  const enemies: ReturnType<typeof spawnEnemy>[] = [];
  const projectiles: Projectile[] = [];
  const clouds: Cloud[] = [];
  const minions: Minion[] = [];
  const gems: Gem[] = [];
  let kills = 0;
  /** 场内金币(击杀掉落),章间商店消费;仅在 shopGrowth 时参与成长决策 */
  let gold = 0;
  /** 已购卡数(驱动商店卡价递增,与游戏 totalBought 一致) */
  let totalBought = 0;
  /** 模拟克隆卡的自增 id(避开 generateEquipment 的 id 空间) */
  let simCardId = 100000;

  // 天赋加成(征服者)
  const damageMult = opts.boosted ? 1.25 : 1;
  const critOn = opts.boosted;
  const elementMult = opts.boosted ? 1.15 : 1;
  const elemental = (t: EffectType) => t === "nova" || t === "ray" || t === "cloud" || t === "chain";
  // 反射预算(与游戏一致:每秒上限 = 最大生命 15%)
  let reflectBudget = 0;
  let reflectTimer = 0;
  let totalDmg = 0;
  // 连杀狂潮(与游戏一致:每 10 连杀触发 2 秒全装备加速)
  let comboCount = 0;
  let comboTimer = 0;
  let frenzyTimer = 0;

  function applyReflect(dmg: number): void {
    const taken = Math.max(0, Math.min(dmg, reflectBudget));
    reflectBudget -= taken;
    if (taken > 0) player.takeDamage(taken);
  }

  function damageEnemy(e: ReturnType<typeof spawnEnemy>, dmg: number, source: Equipment, lifesteal: number, kb: number, from?: Vec2, fromSplit = false): void {
    if (e.hidden) return;
    if (from) dmg = Math.round(dmg * shieldguardDamageMult(e, from));
    if (dmg <= 0) return;
    let mult = damageMult;
    if (critOn && Math.random() < 0.1) mult *= 1.25;
    if (elemental(source.effect.def.type)) mult *= elementMult;
    // 荆棘套 4 件「反伤回响」:受击/受伤触发伤害再 +50%(与游戏 Game.damageEnemy 一致)
    const sb = resonanceBonusState(player.castList, player.passives, opts.set ?? null);
    if (sb && sb.id === "thorn" && sb.bonus6 && source.triggers.some((t) => t.def.type === "hurt" || t.def.type === "hit")) {
      mult *= 1.5;
    }
    dmg = Math.round(dmg * mult);
    applyReflect(reflectDamage(e, dmg));
    e.hp -= dmg;
    totalDmg += dmg;
    if (lifesteal > 0) player.heal(dmg * lifesteal);
    if (kb > 0 && from) knockback(e, from, kb);
    if (e.hp <= 0) killEnemy(e, source, fromSplit);
  }

  function killEnemy(e: ReturnType<typeof spawnEnemy>, source: Equipment, fromSplit = false): void {
    kills += 1;
    comboCount += 1;
    comboTimer = 3;
    if (comboCount % 10 === 0) frenzyTimer = 2;
    for (const b of splitBabies(e)) {
      if (enemies.length < 340) enemies.push(spawnEnemy(b.kind, b.pos, waves.wave));
    }
    // 金币口径与游戏同表(A4 重标后:GOLD_PER_XP 1 / Boss 45 / 精英 6 堆)
    const n = e.isElite ? ELITE_GEM_COUNT : 1;
    const goldValue = e.kind === "boss" ? BOSS_GOLD : e.def.xp * GOLD_PER_XP;
    gold += n * goldValue;
    for (let i = 0; i < n; i++) {
      gems.push(spawnGem(vec2(e.pos.x + (Math.random() - 0.5) * 20, e.pos.y + (Math.random() - 0.5) * 20), goldValue));
    }
    if (gems.length > 300) gems.splice(0, gems.length - 300);
    // 经验入口(镜像 battleWorld.killEnemy):升级 → +hpPerLevel 最大生命 → 自动选一张独有技能卡
    if (levelUps) {
      const lvBefore = player.level;
      if (player.addXp(e.def.xp)) {
        for (let i = lvBefore; i < player.level; i++) {
          player.levelUpGrowth();
          autoPick();
        }
      }
    }
    engine.onKill(ctx, e, { fromSplit, source });
  }

  const ctx: BattleContext = {
    player,
    enemies,
    projectiles,
    clouds,
    minions,
    globalPulseMult: 1,
    setBonus: resonanceBonusState(player.castList, player.passives, opts.set ?? null),
    // 组合技结算:默认关闭(已标定基线逐帧不变);开启时实时结算(同游戏 getter 口径)
    get comboActive() {
      return opts.combos ? comboStates(player.castList) : COMBO_OFF;
    },
    // 连杀数:共鸣变形「连杀飞刃 / 连杀雷链」的输入(同游戏 getter 口径)
    get comboCount() {
      return comboCount;
    },
    addFx: () => {},
    damageEnemy: (e, dmg, o) => damageEnemy(e, dmg, o.source, o.lifesteal ?? 0, o.knockbackPower ?? 0, o.from),
    healPlayer: (v) => player.heal(v),
    addPlayerShield: (a, d) => player.addShield(a, d),
  };

  function nearest(from: Vec2, range: number, exclude?: Set<number>) {
    let best = null;
    let bestD = range * range;
    for (const e of enemies) {
      if (e.hp <= 0 || e.hidden) continue;
      if (exclude?.has(e.id)) continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  const dt = 0.05; // 20 帧/秒模拟步长(平衡曲线精度足够,速度可控)
  const arena: ArenaRect = { x0: 0, y0: 0, x1: CHAPTER_ARENA.w, y1: CHAPTER_ARENA.h }; // 有限竞技场(框定区域)
  // 地形状态:生成走独立随机流(见下),交互与游戏共用同款纯函数
  let obstacles: Obstacle[] = [];
  let simChapter = 1;
  let poolTickAcc = 0;
  let poolDamage = 0;
  // 地形(与游戏同款纯函数):独立随机流 —— 若直接吃 Math.random,每章抽障碍会平移
  // 商店/进化的取数序列,开/关对照会被"商店运气"污染(曾出现开地形反升 12 章的假信号)
  let obsState = ((opts.seed ?? 1) * 48271) % 2147483647;
  if (obsState <= 0) obsState = 1;
  const obsRng = () => {
    obsState = (obsState * 16807) % 2147483647;
    return obsState / 2147483647;
  };
  const perMinute: SimSnapshot[] = [];
  let lastMinute = 0;
  let t = 0;

  // 章间商店成长:每章(60s)买最多 3 卡(槽位内;强化已移除)
  let shopTimer = 60;
  let resetChapter = 1;
  for (; t < opts.maxSeconds; t += dt) {
    // 地形按章重生成(镜像游戏 nextChapter;第 1 章净空,模拟无 Boss 章)
    if (opts.obstacles) {
      const ch = Math.floor(t / 60) + 1;
      if (ch !== simChapter) {
        simChapter = ch;
        obstacles = rollChapterObstacles(ch, arena, obsRng);
        poolTickAcc = 0;
      }
    }
    if (opts.chapterReset) {
      const ch = Math.floor(t / 60) + 1;
      if (ch !== resetChapter) {
        resetChapter = ch;
        if (ch > 1) {
          // 与 battleWorld.nextChapter 同序:清场、回场心;召唤物保留并散在主人身边(R11),对照口径则清掉
          enemies.length = 0;
          projectiles.length = 0;
          clouds.length = 0;
          gems.length = 0;
          player.pos.x = (arena.x0 + arena.x1) / 2;
          player.pos.y = (arena.y0 + arena.y1) / 2;
          if (opts.clearMinionsOnChapter) minions.length = 0;
          else for (const m of minions) { m.pos.x = player.pos.x + (Math.random() - 0.5) * 80; m.pos.y = player.pos.y + (Math.random() - 0.5) * 80; }
        }
      }
    }
    if (opts.shopGrowth) {
      shopTimer -= dt;
      if (shopTimer <= 0) {
        shopTimer = 60;
        const chapter = Math.floor(t / 60) + 1;
        // 卡价与游戏同表(A4 重标后的曲线;被动法宝同价)
        const priceOf = (eq: { quality: Equipment["quality"] }) => shopCardPrice(qualityBasePrice(eq.quality), totalBought, chapter);
        // 1) 槽位扩展:游戏里是广告解锁(每局 RUN_AD_SLOT_LIMIT 次、不花金币,docs/DESIGN-SEASON-FEEL.md A3;R7 后 1 次),
        //    模拟按"每进一次商店看一次广告"近似 —— 首章 +1 槽,金币全留给法宝与强化
        if (player.runSlotBonus < RUN_AD_SLOT_LIMIT && player.slots < SHOP_SLOT_CAP) player.runSlotBonus += 1;
        // 2) 买卡:有空槽且买得起就买(最多 3 张/章;选套后 60% 刷本套卡对应游戏,40% 刷已持卡同款;
        //    每三次尝试约一次是被动法宝 —— 对应商店三格里恒有一格被动(SHOP_PASSIVE_SLOTS),被动槽满就跳过那一格)
        const buyUpTo3 = () => {
          let bought = 0;
          let tries = 0;
          while (player.freeSlots > 0 && bought < 3 && tries < 6) {
            tries += 1;
            if (Math.random() < 1 / 3) {
              if (player.passives.length >= PASSIVE_SLOTS) continue;
              const pa = generatePassive(chapter);
              const pp = priceOf(pa);
              if (gold < pp) break;
              gold -= pp;
              player.passives.push(pa);
              totalBought += 1;
              bought += 1;
              continue;
            }
            const setOffer = opts.set && Math.random() < 0.6 ? generateSetEquipment(opts.set, chapter, 0, undefined, player.rhythms) : null;
            const offer =
              setOffer
                ? cloneCard(setOffer, ++simCardId)
                : player.equipment.length > 0 && Math.random() < 0.4
                  ? cloneCard(player.equipment[Math.floor(Math.random() * player.equipment.length)], ++simCardId)
                  : generateEquipment(chapter, undefined, false, 0, player.rhythms);
            const p = priceOf(offer);
            if (gold < p) break;
            gold -= p;
            player.equipment.push(offer);
            totalBought += 1;
            bought += 1;
          }
        };
        buyUpTo3();
        // 2b) 售罄制刷新:余钱就花在刷新上换新货(金币出口 + 难度策略,对应游戏 refreshCost 阶梯)
        for (let r = 0; r < 10; r++) {
          if (player.freeSlots <= 0) break;
          const rcost = Math.round((8 + chapter * 2) * Math.pow(1.6, r));
          if (gold < rcost * 2) break; // 留一手买卡钱
          gold -= rcost;
          buyUpTo3();
        }
        // 3) 强化(A1 保留、对象改法宝,docs/DESIGN-HERO-RHYTHM.md §9;商店「法宝管理 · 强化」同一份 upgradeCost / canUpgrade):
        //    余钱按「最便宜的一次强化」逐次买,每章最多 3 次(真实玩家一次进店点几下),留一手下章买卡钱(基础价 × 2)。
        //    R7 收槽后金币出口不再是铺槽,不建模强化会让 sim 玩家比真人弱一大截(20 章囤 1.8 万金)
        for (let u = 0; u < 3; u++) {
          const cands = player.equipment.filter((e) => canUpgrade(e));
          if (cands.length === 0) break;
          const target = cands.reduce((a, b) => (upgradeCost(a) <= upgradeCost(b) ? a : b));
          const cost = upgradeCost(target);
          if (gold < cost + qualityBasePrice("common") * 2) break;
          gold -= cost;
          upgradeEquipment(target);
        }
        // 4) 进化(形态跃迁):2 张同效果同品质 → 升档(补基础价×2),3 张免费
        // 只在槽位已满时进化:进化 2 合 1 会缩面板,槽位没满时应先铺满宽度(真实玩家也是卡满才进化)
        let evolved = true;
        while (evolved) {
          if (player.freeSlots > 0) break;
          evolved = false;
          const byKey = new Map<string, Equipment[]>();
          for (const c of player.equipment) {
            const k = c.effect.def.type + "|" + c.quality;
            let arr = byKey.get(k);
            if (!arr) {
              arr = [];
              byKey.set(k, arr);
            }
            arr.push(c);
          }
          for (const group of byKey.values()) {
            if (group.length < 2) continue;
            const sample = group[0];
            const up = qualityUpgrade(sample.quality);
            if (!up) continue;
            const fullSet = group.length >= 3;
            if (!fullSet) {
              const fee = qualityBasePrice(sample.quality) * 2;
              if (gold < fee) continue;
              gold -= fee;
            }
            const keep = [...group].sort((a, b) => b.modifiers.length - a.modifiers.length)[0];
            const ratio = qualityPowerRatio(sample.quality, up);
            const prm = keep.effect.params;
            for (const k of ["damage", "dps", "heal", "amount"] as const) {
              if (typeof prm[k] === "number") prm[k] = Math.round(prm[k] * ratio);
            }
            keep.quality = up;
            const others = group.filter((x) => x !== keep);
            const removeIds = new Set(others.slice(0, fullSet ? 2 : 1).map((x) => x.id));
            player.equipment = player.equipment.filter((x) => !removeIds.has(x.id));
            evolved = true;
            break;
          }
        }
        ctx.setBonus = resonanceBonusState(player.castList, player.passives, opts.set ?? null);
      }
    }
    // 玩家移动:挂机不动 / 绕圈风筝(有限竞技场,框定区域)
    player.movedThisFrame = 0;
    if (opts.move === "kite") {
      // 与游戏挂机 AI 一致:按本命节律取挂机档位(docs/DESIGN-HERO-RHYTHM.md §2.3)——
      // kite 贴身才躲(110px)平时巡场;hold 允许被围、只在围数过多或血量过低时才躲;orbit 持续绕场
      const profile = RHYTHM_AI_PROFILE[player.rhythms[0] ?? "pulse"];
      const near = nearest(player.pos, 110);
      let dodge = !!near;
      if (near && profile === "hold") {
        const around = enemies.filter((e) => e.hp > 0 && Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y) <= 110).length;
        dodge = around >= AI_PROFILE_PARAMS.hold.maxContacts || player.hp / player.maxHp < AI_PROFILE_PARAMS.hold.fleeHpPct;
      }
      if (near && profile === "orbit") {
        dodge = Math.hypot(near.pos.x - player.pos.x, near.pos.y - player.pos.y) <= AI_PROFILE_PARAMS.orbit.dodgeRadius;
      }
      let mvx = 0;
      let mvy = 0;
      if (near && dodge) {
        const dx = player.pos.x - near.pos.x;
        const dy = player.pos.y - near.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        mvx = dx / d;
        mvy = dy / d;
        const side = Math.sin(t * 2.3) > 0 ? 1 : -1;
        mvx += (-dy / d) * side * 0.6;
        mvy += (dx / d) * side * 0.6;
        const l = Math.hypot(mvx, mvy) || 1;
        mvx /= l;
        mvy /= l;
      } else if (profile === "hold" && near) {
        // 站桩承伤:不躲(受击节律要挨打才有输出)
        mvx = 0;
        mvy = 0;
      } else {
        const ang = t * 0.4;
        mvx = Math.cos(ang);
        mvy = Math.sin(ang);
      }
      const sp = 240;
      if (mvx !== 0 || mvy !== 0) {
        player.pos.x = Math.min(arena.x1 - 30, Math.max(arena.x0 + 30, player.pos.x + mvx * sp * dt));
        player.pos.y = Math.min(arena.y1 - 30, Math.max(arena.y0 + 30, player.pos.y + mvy * sp * dt));
        player.movedThisFrame = sp * dt; // 实际移动距离
      }
    }
    // 地形:石柱推挤 + 毒池 DoT(与游戏 updatePlayer 同款;不走受击管线)
    if (obstacles.length > 0) {
      for (const ob of obstacles) pushOutOfPillar(player.pos, 16, ob);
      if (isInPool(player.pos, obstacles)) {
        poolTickAcc += dt;
        while (poolTickAcc >= OBSTACLE.poolTick) {
          poolTickAcc -= OBSTACLE.poolTick;
          const dmg = OBSTACLE.poolDps * OBSTACLE.poolTick;
          poolDamage += dmg;
          player.takeDamage(dmg);
        }
      } else {
        poolTickAcc = 0;
      }
    }
    player.update(dt);
    // 连杀狂潮计时
    comboTimer -= dt;
    if (comboTimer <= 0) comboCount = 0;
    if (frenzyTimer > 0) frenzyTimer -= dt;
    // 反射预算每秒重置
    reflectTimer -= dt;
    if (reflectTimer <= 0) {
      reflectTimer = 1;
      reflectBudget = Math.round(player.maxHp * 0.15);
    }
    ctx.globalPulseMult = frenzyTimer > 0 ? 0.6 : 1;
    engine.update(ctx, dt);

    // 敌人
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      updateEnemy(e, player.pos, 16, dt);
      updateSpecial(e, dt, (kind, pos) => {
        if (enemies.length < 340) enemies.push(spawnEnemy(kind, pos, waves.wave));
      });
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y);
      if (d <= e.def.radius + 16 && e.hitCooldown <= 0) {
        e.hitCooldown = 0.8;
        player.takeDamage(e.def.contactDmg);
        engine.onHurt(ctx, e.def.contactDmg, e);
      }
    }
    // 石柱统一推挤 pass(与游戏 updateEnemies 同款)
    if (obstacles.length > 0) {
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        for (const ob of obstacles) pushOutOfPillar(e.pos, e.def.radius, ob);
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) enemies.splice(i, 1);
    }

    // 投射物
    for (const p of projectiles) {
      updateProjectile(p, dt);
      // 追踪转向(冰锥 icelance):与游戏 updateProjectiles 同款
      if (p.homing) steerHoming(p, enemies, dt);
      if (p.ttl <= 0) continue;
      // 石柱阻挡(与游戏 updateProjectiles 同款):命中即消亡
      if (obstacles.length > 0) {
        let blocked = false;
        for (const ob of obstacles) {
          if (ob.kind === "pillar" && projectileHits(p, { pos: ob.pos, radius: ob.radius })) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          p.ttl = -1;
          continue;
        }
      }
      for (const e of enemies) {
        if (e.hp <= 0 || p.hit.has(e.id)) continue;
        if (projectileHits(p, { pos: e.pos, radius: e.def.radius })) {
          p.hit.add(e.id);
          if (e.kind === "devourer") {
            e.hp = Math.min(e.maxHp, e.hp + Math.round(p.damage * 0.5));
            p.ttl = -1;
            break;
          }
          damageEnemy(e, p.damage, p.source, p.lifesteal, 30, p.pos, p.splitChild === true);
          if (p.kind === "ray" && p.slow) applySlow(e, p.slow, p.slowDuration ?? 2);
          if (p.explode) engine.explode(p.source, ctx, p.pos, p.explode, { power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: p.lifesteal, pierce: 0 });
          if (p.chainLeft > 0) {
            const next = nearest(p.pos, 300, p.hit);
            if (next) {
              p.chainLeft -= 1;
              const dx = next.pos.x - p.pos.x;
              const dy = next.pos.y - p.pos.y;
              const l = Math.hypot(dx, dy) || 1;
              const sp = Math.hypot(p.vel.x, p.vel.y);
              p.vel.x = (dx / l) * sp;
              p.vel.y = (dy / l) * sp;
            }
          } else if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            p.ttl = -1;
            break;
          }
        }
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].ttl <= 0) projectiles.splice(i, 1);
    }

    // 毒云
    for (const c of clouds) {
      c.ttl -= dt;
      c.tickAcc += dt;
      if (c.meteor) continue; // 陨星 telegraph:倒计时由消散通路引爆,不做周期 tick
      if (c.ring) {
        // 霜环(极北冰脉):与游戏 updateClouds 同款——扩张 + 扫过一次性伤害 + 减速
        c.radius += c.ring.expandSpeed * dt;
        for (const e of enemies) {
          if (e.hp <= 0 || c.ring.hits.has(e.id)) continue;
          if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
            c.ring.hits.add(e.id);
            damageEnemy(e, Math.round(c.dps), c.source, 0, 0);
            if (c.ring.slow) applySlow(e, c.ring.slow, c.ring.slowDuration);
          }
        }
        continue;
      }
      if (c.tickAcc >= 0.25) {
        c.tickAcc = 0;
        if (c.heals) {
          // 回血池(组合技「深渊裂隙」):只治疗玩家,不伤敌
          if (player.alive && Math.hypot(player.pos.x - c.pos.x, player.pos.y - c.pos.y) <= c.radius + 16) {
            player.heal(c.dps * 0.25);
          }
          continue;
        }
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y);
          if (d <= c.radius + e.def.radius) damageEnemy(e, Math.round(c.dps * 0.25), c.source, 0, 0);
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      if (clouds[i].ttl <= 0) {
        const c = clouds[i];
        if (c.meteor) {
          // 陨星落点引爆(与游戏 updateClouds 同款)
          for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
              damageEnemy(e, Math.round(c.dps), c.source, 0, 60, c.pos);
            }
          }
          clouds.push(spawnCloud({ pos: { x: c.pos.x, y: c.pos.y }, radius: c.meteor.burnRadius, dps: c.meteor.burnDps, duration: c.meteor.burnDuration, source: c.source }));
        }
        if (c.explode) engine.explode(c.source, ctx, c.pos, c.explode, { power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: 0, pierce: 0 });
        clouds.splice(i, 1);
      }
    }

    // 骷髅
    for (const m of minions) {
      m.ttl -= dt;
      m.attackCd -= dt;
      const target = nearest(m.pos, 320);
      if (target && m.attackCd <= 0) {
        const d = Math.hypot(target.pos.x - m.pos.x, target.pos.y - m.pos.y);
        if (d <= 100) {
          m.attackCd = m.attackInterval;
          damageEnemy(target, m.damage, m.source, 0, 20, m.pos);
          if (m.healOnHit) player.heal(Math.round(m.damage * 0.3));
        } else {
          const dx = target.pos.x - m.pos.x;
          const dy = target.pos.y - m.pos.y;
          const l = Math.hypot(dx, dy) || 1;
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      } else if (!target) {
        const dx = player.pos.x - m.pos.x;
        const dy = player.pos.y - m.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (l > 60) {
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      }
    }
    for (let i = minions.length - 1; i >= 0; i--) {
      if (minions[i].ttl <= 0) minions.splice(i, 1);
    }

    // 宝石
    for (const gem of gems) {
      if (gem.delay > 0) {
        gem.delay -= dt;
        continue;
      }
      const d = Math.hypot(gem.pos.x - player.pos.x, gem.pos.y - player.pos.y);
      if (d < 420 && d > 1) {
        gem.pos.x += ((player.pos.x - gem.pos.x) / d) * gem.magnet * dt;
        gem.pos.y += ((player.pos.y - gem.pos.y) / d) * gem.magnet * dt;
      }
      if (d <= 24) {
        gem.picked = true;
        // 需求优化 v2:金币经济,击杀掉落金币(不再升级);成长走章间商店
      }
    }
    for (let i = gems.length - 1; i >= 0; i--) {
      if (gems[i].picked) gems.splice(i, 1);
    }

    // 章型建模(策划案 V3 §3.1):按章节注入敌情加权 + 章型倍率,与游戏主线一致;
    // 关闭时保持旧行为(无倾向),已标定曲线不受影响
    let simIntel: SpawnIntel | undefined;
    let simGoldMix = 0;
    let scale = opts.spawnScale ?? 1;
    if (opts.chapterTypes) {
      const ct = chapterTypeInfo(waves.wave);
      const base = chapterIntel(waves.wave);
      simIntel = { prefer: ct.intelPrefer ?? base.prefer, hpBuff: 0.4, bias: ct.intelPrefer ? ct.intelBias : 0.45 };
      scale *= ct.spawnScaleMult;
      simGoldMix = ct.goldMix;
    }
    waves.update(dt, enemies, player.pos, scale, arena, simIntel, opts.godEnemies ?? false, simGoldMix);
    // 敌人上限(对应游戏 LIMITS.enemies=340 的同款"超员移除最旧"机制,模拟取 220 保证速度)
    if (enemies.length > 220) enemies.splice(0, enemies.length - 220);

    if (!player.alive) break;

    const minute = Math.floor(t / 60);
    if (minute > lastMinute) {
      lastMinute = minute;
      perMinute.push({ t: Math.round(t), kills, level: player.level, wave: waves.wave, hp: Math.round(player.hp), enemyCount: enemies.length, gold, slots: player.slots, cards: player.equipment.length, dmg: Math.round(totalDmg) });
    }
  }

  // finalEquipment = 技能 + 主动法宝(Boss 单目标 DPS 探针要连核心技能一起量)
  return {
    seconds: Math.round(t),
    wave: waves.wave,
    kills,
    level: player.level,
    died: !player.alive,
    perMinute,
    finalGold: gold,
    finalSlots: player.slots,
    finalCards: player.equipment.length,
    totalDamage: totalDmg,
    poolDamage: Math.round(poolDamage),
    finalEquipment: player.castList.map((e) => JSON.parse(JSON.stringify(e))),
    finalPassives: player.passives.map((p) => JSON.parse(JSON.stringify(p))),
  };
}

/** 打印一份友好的曲线报告 */
export function formatReport(r: SimReport): string {
  const lines = [`存活 ${r.seconds}s · 波次 ${r.wave} · 击杀 ${r.kills} · 等级 ${r.level} · 金币 ${r.finalGold} · 槽位 ${r.finalSlots} · 持卡 ${r.finalCards} · ${r.died ? "阵亡" : "存活"}`];
  for (const m of r.perMinute) {
    lines.push(`  ${m.t}s: 击杀 ${m.kills} · Lv.${m.level} · 波${m.wave} · HP ${m.hp} · 敌人 ${m.enemyCount} · 金 ${m.gold} · 槽 ${m.slots} · 卡 ${m.cards} · 伤 ${m.dmg}`);
  }
  return lines.join("\n");
}

/* ---------- Boss 单目标 DPS 标定(Boss 血量曲线用) ----------
 * 人群场景的 totalDamage 受刷怪速率封顶(所有 build ≈ 1200-1400 dps),
 * 无法区分单目标输出;Boss 战停刷小怪,是纯单目标场景,需单独标定。 */

export interface BossDpsResult {
  seconds: number;
  /** 窗口内对 Boss 累计造成伤害 */
  damage: number;
  /** 平均单目标 DPS = damage / seconds */
  dps: number;
}

/**
 * 测量一套装备对「大血量 Boss 木桩」的平均单目标 DPS。
 * 复刻真实战斗循环(引擎/投射物/毒云/骷髅/风筝走位),含 Boss 正面减伤与 15% 反射;
 * 不跑阶段事件与召唤(纯单目标 = 保守口径:击杀触发卡在窗口内无目标,
 * 与真实 Boss 战的停刷阶段一致;P2 召唤小怪只会让实战 DPS 更高,曲线偏安全侧)。
 */
export function measureBossDps(
  equipment: Equipment[],
  opts?: { set?: SetId | null; boosted?: boolean; seconds?: number; seed?: number; passives?: PassiveArtifact[] }
): BossDpsResult {
  const origRandom = Math.random;
  let s = opts?.seed ?? 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  try {
    return measureBossDpsInner(equipment, opts);
  } finally {
    Math.random = origRandom;
  }
}

function measureBossDpsInner(
  equipment: Equipment[],
  opts?: { set?: SetId | null; boosted?: boolean; seconds?: number; seed?: number; passives?: PassiveArtifact[] }
): BossDpsResult {
  _resetEnemyUid();
  _resetProjectileUid();
  _resetObjectUids();
  const seconds = opts?.seconds ?? 45;
  const player = new Player();
  player.equipment = JSON.parse(JSON.stringify(equipment));
  player.passives = JSON.parse(JSON.stringify(opts?.passives ?? []));
  // 木桩血量池:玩家不会死,比例类触发器不受干扰(风筝走位下 Boss 本就难以贴身)
  player.maxHp = 1_000_000;
  player.hp = player.maxHp;
  const engine = new EquipmentEngine();
  const arena: ArenaRect = { x0: 0, y0: 0, x1: CHAPTER_ARENA.w, y1: CHAPTER_ARENA.h };
  player.pos = vec2(arena.x1 / 2, arena.y1 / 2);
  // 木桩 = 第 20 章 Boss(正面减伤/反射与真实一致),血量抬高到打不死
  const dummy = spawnEnemy("boss", vec2(arena.x1 / 2 + 200, arena.y1 / 2), 20);
  dummy.maxHp = dummy.hp = 1_000_000_000;
  const enemies = [dummy];
  const projectiles: Projectile[] = [];
  const clouds: Cloud[] = [];
  const minions: Minion[] = [];

  const damageMult = opts?.boosted ? 1.25 : 1;
  const critOn = !!opts?.boosted;
  const elementMult = opts?.boosted ? 1.15 : 1;
  const elemental = (t: EffectType) => t === "nova" || t === "ray" || t === "cloud" || t === "chain";
  let reflectBudget = 0;
  let reflectTimer = 0;
  let totalDmg = 0;

  function applyReflect(dmg: number): void {
    const taken = Math.max(0, Math.min(dmg, reflectBudget));
    reflectBudget -= taken;
    if (taken > 0) player.takeDamage(taken);
  }

  function damageEnemy(e: Enemy, dmg: number, source: Equipment, lifesteal: number, kb: number, from?: Vec2, _fromSplit = false): void {
    if (e.hidden) return;
    if (from) dmg = Math.round(dmg * shieldguardDamageMult(e, from));
    if (dmg <= 0) return;
    let mult = damageMult;
    if (critOn && Math.random() < 0.1) mult *= 1.25;
    if (elemental(source.effect.def.type)) mult *= elementMult;
    const sb = resonanceBonusState(player.castList, player.passives, opts?.set ?? null);
    if (sb && sb.id === "thorn" && sb.bonus6 && source.triggers.some((t) => t.def.type === "hurt" || t.def.type === "hit")) {
      mult *= 1.5;
    }
    dmg = Math.round(dmg * mult);
    applyReflect(reflectDamage(e, dmg));
    e.hp -= dmg;
    totalDmg += dmg;
    if (lifesteal > 0) player.heal(dmg * lifesteal);
    if (kb > 0 && from) knockback(e, from, kb);
  }

  const ctx: BattleContext = {
    player,
    enemies,
    projectiles,
    clouds,
    minions,
    globalPulseMult: 1,
    setBonus: resonanceBonusState(player.castList, player.passives, opts?.set ?? null),
    // Boss DPS 标定基线不结算组合技(口径稳定;组合技强度走 runSim 对照)
    comboActive: COMBO_OFF,
    addFx: () => {},
    damageEnemy: (e, dmg, o) => damageEnemy(e, dmg, o.source, o.lifesteal ?? 0, o.knockbackPower ?? 0, o.from),
    healPlayer: (v) => player.heal(v),
    addPlayerShield: (a, d) => player.addShield(a, d),
  };

  function nearest(from: Vec2, range: number, exclude?: Set<number>) {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of enemies) {
      if (e.hp <= 0 || e.hidden) continue;
      if (exclude?.has(e.id)) continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  const dt = 0.05;
  for (let t = 0; t < seconds; t += dt) {
    // 风筝走位(与 runSim/游戏挂机 AI 一致:贴身才躲,平时巡场)
    player.movedThisFrame = 0;
    const near = nearest(player.pos, 110);
    let mvx = 0;
    let mvy = 0;
    if (near) {
      const dx = player.pos.x - near.pos.x;
      const dy = player.pos.y - near.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      mvx = dx / d;
      mvy = dy / d;
      const side = Math.sin(t * 2.3) > 0 ? 1 : -1;
      mvx += (-dy / d) * side * 0.6;
      mvy += (dx / d) * side * 0.6;
      const l = Math.hypot(mvx, mvy) || 1;
      mvx /= l;
      mvy /= l;
    } else {
      const ang = t * 0.4;
      mvx = Math.cos(ang);
      mvy = Math.sin(ang);
    }
    const sp = 240;
    player.pos.x = Math.min(arena.x1 - 30, Math.max(arena.x0 + 30, player.pos.x + mvx * sp * dt));
    player.pos.y = Math.min(arena.y1 - 30, Math.max(arena.y0 + 30, player.pos.y + mvy * sp * dt));
    player.movedThisFrame = sp * dt;
    player.update(dt);
    reflectTimer -= dt;
    if (reflectTimer <= 0) {
      reflectTimer = 1;
      reflectBudget = Math.round(player.maxHp * 0.15);
    }
    engine.update(ctx, dt);

    // Boss 木桩:追击 + 更新朝向(正面减伤依赖朝向);不跑阶段/召唤(纯单目标口径)
    updateEnemy(dummy, player.pos, 16, dt);
    const d = Math.hypot(dummy.pos.x - player.pos.x, dummy.pos.y - player.pos.y);
    if (d <= dummy.def.radius + 16 && dummy.hitCooldown <= 0) {
      dummy.hitCooldown = 0.8;
      player.takeDamage(dummy.def.contactDmg);
      engine.onHurt(ctx, dummy.def.contactDmg, dummy);
    }

    // 投射物(与 runSim 一致;单目标无吞噬者/击杀分支)
    for (const p of projectiles) {
      updateProjectile(p, dt);
      if (p.homing) steerHoming(p, enemies, dt);
      if (p.ttl <= 0) continue;
      for (const e of enemies) {
        if (e.hp <= 0 || p.hit.has(e.id)) continue;
        if (projectileHits(p, { pos: e.pos, radius: e.def.radius })) {
          p.hit.add(e.id);
          damageEnemy(e, p.damage, p.source, p.lifesteal, 30, p.pos, p.splitChild === true);
          if (p.kind === "ray" && p.slow) applySlow(e, p.slow, p.slowDuration ?? 2);
          if (p.explode) engine.explode(p.source, ctx, p.pos, p.explode, { power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: p.lifesteal, pierce: 0 });
          if (p.chainLeft > 0) {
            const next = nearest(p.pos, 300, p.hit);
            if (next) {
              p.chainLeft -= 1;
              const dx = next.pos.x - p.pos.x;
              const dy = next.pos.y - p.pos.y;
              const l = Math.hypot(dx, dy) || 1;
              const pv = Math.hypot(p.vel.x, p.vel.y);
              p.vel.x = (dx / l) * pv;
              p.vel.y = (dy / l) * pv;
            }
          } else if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            p.ttl = -1;
            break;
          }
        }
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].ttl <= 0) projectiles.splice(i, 1);
    }

    // 毒云
    for (const c of clouds) {
      c.ttl -= dt;
      c.tickAcc += dt;
      if (c.meteor) continue; // 陨星 telegraph:倒计时由消散通路引爆,不做周期 tick
      if (c.ring) {
        // 霜环(极北冰脉):与游戏 updateClouds 同款——扩张 + 扫过一次性伤害 + 减速
        c.radius += c.ring.expandSpeed * dt;
        for (const e of enemies) {
          if (e.hp <= 0 || c.ring.hits.has(e.id)) continue;
          if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
            c.ring.hits.add(e.id);
            damageEnemy(e, Math.round(c.dps), c.source, 0, 0);
            if (c.ring.slow) applySlow(e, c.ring.slow, c.ring.slowDuration);
          }
        }
        continue;
      }
      if (c.tickAcc >= 0.25) {
        c.tickAcc = 0;
        if (c.heals) {
          if (player.alive && Math.hypot(player.pos.x - c.pos.x, player.pos.y - c.pos.y) <= c.radius + 16) {
            player.heal(c.dps * 0.25);
          }
          continue;
        }
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          const cd = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y);
          if (cd <= c.radius + e.def.radius) damageEnemy(e, Math.round(c.dps * 0.25), c.source, 0, 0);
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      if (clouds[i].ttl <= 0) {
        const c = clouds[i];
        if (c.meteor) {
          // 陨星落点引爆(与游戏 updateClouds 同款)
          for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y) <= c.radius + e.def.radius) {
              damageEnemy(e, Math.round(c.dps), c.source, 0, 60, c.pos);
            }
          }
          clouds.push(spawnCloud({ pos: { x: c.pos.x, y: c.pos.y }, radius: c.meteor.burnRadius, dps: c.meteor.burnDps, duration: c.meteor.burnDuration, source: c.source }));
        }
        if (c.explode) engine.explode(c.source, ctx, c.pos, c.explode, { power: 1, haste: 0, durationBonus: 0, chainTargets: 0, splitExtra: 0, lifesteal: 0, pierce: 0 });
        clouds.splice(i, 1);
      }
    }

    // 骷髅
    for (const m of minions) {
      m.ttl -= dt;
      m.attackCd -= dt;
      const target = nearest(m.pos, 320);
      if (target && m.attackCd <= 0) {
        const md = Math.hypot(target.pos.x - m.pos.x, target.pos.y - m.pos.y);
        if (md <= 100) {
          m.attackCd = m.attackInterval;
          damageEnemy(target, m.damage, m.source, 0, 20, m.pos);
          if (m.healOnHit) player.heal(Math.round(m.damage * 0.3));
        } else {
          const dx = target.pos.x - m.pos.x;
          const dy = target.pos.y - m.pos.y;
          const l = Math.hypot(dx, dy) || 1;
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      } else if (!target) {
        const dx = player.pos.x - m.pos.x;
        const dy = player.pos.y - m.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        if (l > 60) {
          m.pos.x += (dx / l) * m.speed * dt;
          m.pos.y += (dy / l) * m.speed * dt;
        }
      }
    }
    for (let i = minions.length - 1; i >= 0; i--) {
      if (minions[i].ttl <= 0) minions.splice(i, 1);
    }
  }

  return { seconds, damage: Math.round(totalDmg), dps: totalDmg / seconds };
}

export { xpToNext };
