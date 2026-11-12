/** 玩家:位置/生命/护盾/等级经验/装备槽。策划数值见 ../data/combat 规范表。 */

import { type Vec2, vec2, clamp } from "../core/math";
import type { Equipment } from "../data/equipmentGen";
import type { PassiveArtifact } from "../data/artifacts";
import { PASSIVE_SLOTS } from "../data/artifacts";
import { RHYTHM_MAX_LEVEL, type RhythmId } from "../data/rhythm";
import { PLAYER_BASE, xpToNext, LEVELUP_HEAL_PCT, RETALIATION_HEAL, THORN_STACK, type ThornGainMode } from "../data/combat";
import { createBuildRuntime, type BuildRuntime } from "../data/heroBuild";

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
  /** 本局章节节点层:已选路线(`BuildBranchDef.id`;null = 未选) */
  buildBranchId: string | null = null;
  /** 每层已选节点 id(第 4 / 8 / 12 章;null = 未选) */
  buildNodes: (string | null)[] = [null, null, null];
  /** 本局职业资源(过载 / 冰印 / 踏迹印 / 狼配对 / 亡影幕);换章与复活清空,重开重置 */
  buildRes: BuildRuntime = createBuildRuntime();
  /** 局内时间(秒):节点窗口 / 印记到期 / 幕计时统一读它,由 `update(dt)` 推进 */
  buildTime = 0;
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
  /** 荆棘层(站位资源;贴身积累、脱离掉层,只放大带 stack* 参数的施放源;规则见 combat.THORN_STACK) */
  thornStack = 0;
  /**
   * 荆棘层的**接触记忆**(单位 = 围数,不是层):怪从贴身闸里消失(多半是被自己的圆环清掉)后,
   * 它的围数按 `THORN_STACK.contactEchoDecayPerSec` 退去,退完之前照旧喂层。
   * 存在的理由是稀怪章的怪进闸 ≈0.5 秒就死,没有记忆时"贴身"这个前提几乎不成立(R22 试玩实测)。
   * 只放宽两态共有的贴身前提,不碰姿势那一条;恒 ≤ 最近一帧的真实围数峰值,不会自己长。
   */
  thornContactEcho = 0;
  /**
   * 本局的荆棘层姿势(两态之一;含义 = 这一局"站定才涨"还是"边走边涨",贴身是两态共有的前提)。
   * 由局首二选一写入(`levelup/LevelUpModel` 的 stance 模式 → `battleWorld.setThornGainMode`)。
   * 缺省 `"still"` = `heroSkills.VERA_STANCES[0]` 那一档,给"没走到弹层"的局(模拟器 / 机器人 / 老档)一个确定值。
   */
  thornGainMode: ThornGainMode = "still";
  /** 本局是否走荆棘层续航(世界层每帧写入;为真时"按最大生命比例"的受击回血一律让位给层数结算) */
  stackDriven = false;
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

  /**
   * 荆棘层每帧结算(世界层 `updatePlayer` 在**移动之后**调用;只有带 `stackRadiusPer` / `sustainHeal`
   * 施放源的英雄传 `on = true`,其他人恒为 0 层 → 逐帧与加这一层之前一致)。
   * `contacts` = 贴身 `THORN_STACK.contactRadius` 内的存活敌数(与挂机 hold 档的围数同一口径);
   * `movedPx` = 本帧实际位移(与移动触发器同一个数);
   * `mode` = 本局姿势(两态:`still` 站定才涨 / `move` 边走边涨,类型与规则见 ../data/combat 的 ThornGainMode;
   *   贴身距离闸是两态共有的前提,由 `contacts` 那一个数承担);
   * `gainMult` = 荆棘三档「棘肤」给倍率(数值见 ../data/sets)。
   * 喂层的数不是本帧的 `contacts` 而是**接触记忆** `thornContactEcho`(= 本帧围数与上一帧记忆减速衰减的较大者):
   * 怪在闸里待过就算这一拍,治"稀怪章怪半秒就死、层永远养不起来"(表值与依据见 `THORN_STACK.contactEchoDecayPerSec`)。
   * 姿势那一条照旧读"本帧动不动",记忆只放宽贴身前提,不放宽"站定不许走 / 绕场不许停"。
   * 顺带把"本局是否走层数续航"记到 `stackDriven`:那两条按最大生命比例的受击回血据此让位。
   */
  tickThornStack(dt: number, contacts: number, movedPx: number, on: boolean, mode: ThornGainMode, gainMult = 1): void {
    this.stackDriven = on;
    if (!on) {
      this.thornStack = 0;
      this.thornContactEcho = 0;
      return;
    }
    const cfg = THORN_STACK;
    const moving = movedPx > 0.001;
    // 接触记忆:有新的贴身敌就抬到当前围数,没有就按速率退去(退到 0 为止)
    this.thornContactEcho = Math.max(contacts, this.thornContactEcho - cfg.contactEchoDecayPerSec * dt);
    // 两态共有的前提 = 贴身有敌(记忆里的围数也算);姿势只加"不许动"或"必须动"这一条
    const fed = this.thornContactEcho;
    const gained = fed > 0 && (mode === "still" ? !moving : moving) ? fed : 0;
    if (gained > 0) this.thornStack = Math.min(cfg.cap, this.thornStack + gained * cfg.perContactPerSec * gainMult * dt);
    else if (this.thornStack > 0) this.thornStack = Math.max(0, this.thornStack - cfg.decayPerSec * dt);
  }

  /** 荆棘层比例 0-1(HUD 节律进度条与半径 / 威力加成共用同一个数,不各算一遍) */
  get thornStackFrac(): number {
    return Math.min(1, this.thornStack / THORN_STACK.cap);
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

  /** 清空本局职业资源(换章 / 复活:路线与节点保留,临时印 / 过载 / 配对 / 幕全部归零) */
  clearBuildTemp(): void {
    this.buildRes = createBuildRuntime();
  }

  /** 整局重置(重开:路线与节点一并清空) */
  resetBuild(): void {
    this.buildBranchId = null;
    this.buildNodes = [null, null, null];
    this.buildRes = createBuildRuntime();
    this.buildTime = 0;
  }

  update(dt: number): void {
    this.buildTime += dt;
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
