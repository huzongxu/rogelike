/** 玩家:位置/生命/护盾/等级经验/装备槽。策划数值见 ../data/combat 规范表。 */

import { type Vec2, vec2, clamp } from "../core/math";
import type { Equipment } from "../data/equipmentGen";
import type { PassiveArtifact } from "../data/artifacts";
import { PASSIVE_SLOTS } from "../data/artifacts";
import { RHYTHM_MAX_LEVEL, type RhythmId } from "../data/rhythm";
import { PLAYER_BASE, xpToNext, LEVELUP_HEAL_PCT, RETALIATION_HEAL } from "../data/combat";

// 策划规范表符号经本模块再导出(历史导入路径兼容;唯一出处在 ../data/combat)
export { PLAYER_BASE, xpToNext } from "../data/combat";

export class Player {
  pos: Vec2 = vec2(0, 0);
  level = 1;
  xp = 0;
  hp: number;
  maxHp: number;
  /** 护盾:吸收量 + 剩余时间 */
  shield: number;
  shieldTtl: number;
  /** 主动法宝槽(docs/DESIGN-HERO-RHYTHM.md §4.3;历史名 equipment,引擎与商店持同一引用) */
  equipment: Equipment[] = [];
  /** 英雄独有技能(kind = skill;不占槽,升级三选一产出;引擎与主动法宝同列结算) */
  skills: Equipment[] = [];
  /** 被动法宝(全局生效;引擎 statsOf 折入,同 id 叠加按表衰减) */
  passives: PassiveArtifact[] = [];
  /** 已解锁节律(首条 = 英雄本命;分岔技能解锁第 2 条;开局由世界层写入) */
  rhythms: RhythmId[] = [];
  /** 节律等级(升级三选一「节律强化」卡提升;缺省 1) */
  rhythmLevel: Partial<Record<RhythmId, number>> = {};
  /** 已选分岔技能 id(null = 未选;选中即另一分岔永久消失) */
  branchChosen: string | null = null;
  /** 本局已重置分岔次数(上限见 ../data/shop 的 RESET_BRANCH_LIMIT) */
  branchResets = 0;
  /** 遗物「假命」本局是否已用 */
  spareLifeUsed = false;
  /** 天赋提供的额外主动法宝槽(额外武装 / 槽位扩展 I) */
  slotBonus = 0;
  /** 天赋提供的额外被动法宝槽(被动槽扩展) */
  passiveSlotBonus = 0;
  /** 本局内商店购买的额外装备槽(金币出口;每局清零) */
  runSlotBonus = 0;
  /** 首次升级经验缩放(快速启动:-20%) */
  firstXpScale = 1;
  /** 承伤反哺入池比例(0 = 未开;世界层每帧按 castList 里的 `retaliationHeal` 参数写入) */
  retaliationPct = 0;
  /** 承伤反哺池余量(承伤 × 比例转入,召唤物命中时抽取;半衰期与上限见 combat.RETALIATION_HEAL) */
  retaliationPool = 0;
  /** 主题怪受击减速(凝滞之触):剩余时长与移速系数(1 = 无减速);语义与 Enemy 侧同款 */
  slowTimer = 0;
  slowFactor = 1;
  /** 本帧移动距离(供移动触发器使用) */
  movedThisFrame = 0;
  alive = true;

  constructor() {
    this.maxHp = PLAYER_BASE.maxHp;
    this.hp = this.maxHp;
    this.shield = 0;
    this.shieldTtl = 0;
  }

  get slots(): number {
    return PLAYER_BASE.slots + this.slotBonus + this.runSlotBonus;
  }

  /** 剩余装备槽位 */
  get freeSlots(): number {
    return Math.max(0, this.slots - this.equipment.length);
  }

  /** 被动法宝槽总数 = 表值 + 天赋「被动槽扩展」 */
  get passiveSlots(): number {
    return PASSIVE_SLOTS + this.passiveSlotBonus;
  }

  /** 剩余被动槽 */
  get freePassiveSlots(): number {
    return Math.max(0, this.passiveSlots - this.passives.length);
  }

  /** 引擎结算列:独有技能在前、主动法宝在后(同一套触发 / 效果 / 修饰器管线) */
  get castList(): Equipment[] {
    return this.skills.length === 0 ? this.equipment : [...this.skills, ...this.equipment];
  }

  /** 某条节律的等级(未解锁 / 未强化 = 1) */
  rhythmLevelOf(r: RhythmId): number {
    return this.rhythmLevel[r] ?? 1;
  }

  /** 解锁一条节律(重复解锁无副作用);返回是否新增 */
  unlockRhythm(r: RhythmId): boolean {
    if (this.rhythms.includes(r)) return false;
    this.rhythms.push(r);
    return true;
  }

  /** 节律强化一级(到上限返回 false) */
  rhythmLevelUp(r: RhythmId): boolean {
    const cur = this.rhythmLevelOf(r);
    if (cur >= RHYTHM_MAX_LEVEL) return false;
    this.rhythmLevel[r] = cur + 1;
    return true;
  }

  /**
   * 撤掉已选分岔:移除那件技能、收回它解锁的节律(本命不动)、分岔选择归零。
   * 返回被收回的节律(null = 没有分岔可撤)。法宝的重新挂节律由世界层做(它知道归一化规则)。
   */
  resetBranch(): { skillId: string; rhythm: RhythmId | null } | null {
    if (!this.branchChosen) return null;
    const idx = this.skills.findIndex((s) => s.skillId === this.branchChosen);
    const skill = idx >= 0 ? this.skills[idx] : null;
    if (idx >= 0) this.skills.splice(idx, 1);
    const r = (skill?.triggers[0]?.def.type ?? null) as RhythmId | null;
    let removed: RhythmId | null = null;
    if (r && this.rhythms.indexOf(r) > 0) {
      this.rhythms.splice(this.rhythms.indexOf(r), 1);
      delete this.rhythmLevel[r];
      removed = r;
    }
    const id = this.branchChosen;
    this.branchChosen = null;
    this.branchResets += 1;
    return { skillId: id, rhythm: removed };
  }

  addXp(v: number): boolean {
    this.xp += v;
    let leveled = false;
    while (this.xp >= xpToNext(this.level)) {
      // 快速启动:仅第一次升级所需经验减少
      const need = this.level === 1 ? Math.floor(xpToNext(1) * this.firstXpScale) : xpToNext(this.level);
      if (this.xp < need) break;
      this.xp -= need;
      this.level += 1;
      leveled = true;
    }
    if (leveled) {
      // 升级恢复少量生命
      this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp * LEVELUP_HEAL_PCT));
    }
    return leveled;
  }

  levelUpGrowth(): void {
    this.maxHp += PLAYER_BASE.hpPerLevel;
    this.hp = Math.min(this.hp + PLAYER_BASE.hpPerLevel, this.maxHp);
  }

  takeDamage(raw: number): number {
    if (!this.alive) return 0;
    let dmg = raw;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      this.hp -= dmg;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
      }
      // 承伤反哺:按比例入池(护盾挡掉的不计 —— 那是"没挨到打")
      if (this.retaliationPct > 0) {
        this.retaliationPool = Math.min(
          this.retaliationPool + dmg * this.retaliationPct,
          this.maxHp * RETALIATION_HEAL.capMaxHpPct,
        );
      }
    }
    return dmg;
  }

  /** 反哺池按半衰期流失(世界层每帧调用;没开反哺时直接短路) */
  tickRetaliation(dt: number): void {
    if (this.retaliationPool <= 0) return;
    this.retaliationPool *= Math.pow(0.5, dt / RETALIATION_HEAL.halfLifeSec);
    if (this.retaliationPool < 0.5) this.retaliationPool = 0;
  }

  /**
   * 召唤物命中时从池里抽取追加回血:最多 `cap` ,抽多少扣多少。
   * 反哺总量因此恒 ≤ 承伤 × 入池比例,与场上召唤物数量无关。
   */
  drawRetaliation(cap: number): number {
    if (this.retaliationPool <= 0 || cap <= 0) return 0;
    const got = Math.min(cap, this.retaliationPool);
    this.retaliationPool -= got;
    return got;
  }

  heal(v: number): void {
    this.hp = clamp(this.hp + v, 0, this.maxHp);
  }

  /** 受击减速(凝滞之触):取更强系数与更长时长,与 Enemy.applySlow 同语义 */
  applySlow(factor: number, duration: number): void {
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 当前移速乘数(减速中 < 1,否则 1);移动结算处乘入 */
  get speedMult(): number {
    return this.slowTimer > 0 ? this.slowFactor : 1;
  }

  addShield(amount: number, duration: number): void {
    this.shield = Math.max(this.shield, amount);
    this.shieldTtl = Math.max(this.shieldTtl, duration);
  }

  update(dt: number): void {
    if (this.shieldTtl > 0) {
      this.shieldTtl -= dt;
      if (this.shieldTtl <= 0) this.shield = 0;
    }
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }
  }
}
