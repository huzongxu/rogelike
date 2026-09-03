/** 玩家:位置/生命/护盾/等级经验/装备槽。策划数值见 ../data/combat 规范表。 */

import { type Vec2, vec2, clamp } from "../core/math";
import type { Equipment } from "../data/equipmentGen";
import { PLAYER_BASE, xpToNext, LEVELUP_HEAL_PCT } from "../data/combat";

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
  /** 装备槽 */
  equipment: Equipment[] = [];
  /** 天赋提供的额外装备槽 */
  slotBonus = 0;
  /** 本局内商店购买的额外装备槽(金币出口;每局清零) */
  runSlotBonus = 0;
  /** 首次升级经验缩放(快速启动:-20%) */
  firstXpScale = 1;
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
    }
    return dmg;
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
