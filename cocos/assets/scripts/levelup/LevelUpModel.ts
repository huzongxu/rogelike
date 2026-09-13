/**
 * 升级三选一弹层的**账本、内容与命中**(纯逻辑,cc-free)。
 *
 * 依据 docs/DESIGN-HERO-RHYTHM.md §3 / §6:这一层卖的是**英雄独有技能**(新技能 / 升阶 / 节律强化),
 * 不花金币;每章 1 次免费重随;锁 1 张跨弹层记忆;分岔二选一成对出现、选一张另一张永久消失,
 * 选中即解锁该分岔的第 2 节律。另有一个**首章法宝三选一**形态(`openFirstPick`):进第 1 章前
 * 从 3 张主动法宝里免费挑 1 张,至少 1 张与本命节律共鸣。
 *
 * 分工与已落地各屏同构,但**本件不是一张屏而是一层覆盖层**,两处因此与二次确认弹层同款:
 *  ① 它不挂路由(`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 仍是 16 态,一枚键都不加),而是挂在宿主
 *     `Overlay` 常驻层上,开层时顶到末位压过懒建的 toast;
 *  ② 它**开着就把战斗停住**:弹层不挂路由,路由闸门 `blocksPlay()` 看不到它,所以宿主在主循环里
 *     另设一道同位闸门(选完即恢复)。
 *
 * 本件**有写入意图,但写的全是局内态**而不是存档:技能数组 / 法宝数组按引用原地 `push`(词缀引擎持同一
 * 引用,不得重新赋值)、节律解锁与等级经 `LevelUpWorld` 回写玩家、兜底卡的金币与回血也走它。
 * 一个存档字段都不落,所以本节没有 `persist()`、也没有广告位。
 *
 * 策略口径全部读表,本文件不内联任何数值:出几张 / 锁几张 / 免费重随几次 / 首章几张与保底 →
 * `game/data/levelUp.ts`;出卡权重 / 分岔时机 / 兜底三张 → `game/data/heroSkills.ts`;
 * 几何一律转调共享层 `game/ui/levelUpLayout.ts`,本文件一枚坐标都不算。
 */

import {
  FIRST_PICK_COUNT,
  FIRST_PICK_RESONANCE_GUARANTEE,
  LEVELUP_FREE_REROLL_PER_CHAPTER,
  LEVELUP_LOCK_LIMIT,
  LEVELUP_MAIN_LABELS,
  LEVELUP_OFFER_COUNT,
} from "../game/data/levelUp";
import {
  UPGRADE_MAIN_KEYS,
  equipmentDescription,
  equipmentDisplayName,
  equipmentResonance,
  equipmentResonant,
  generateEquipment,
  makeSkillEquipment,
  upgradeEquipment,
  type Equipment,
} from "../game/data/equipmentGen";
import {
  FALLBACK_OFFERS,
  BRANCH_GUARANTEE_LEVEL,
  BRANCH_MIN_LEVEL,
  BRANCH_TEASE_LEVEL,
  GENERIC_HERO_SKILLS,
  HERO_SKILLS,
  RESET_GUARANTEE_ROUNDS,
  SKILL_MAX_RANK,
  heroSkillDef,
  offerKey,
  rollSkillOffers,
  type FallbackId,
  type HeroSkillDef,
  type SkillOffer,
} from "../game/data/heroSkills";
import { RHYTHM_MAX_LEVEL, rhythmDef, type RhythmId } from "../game/data/rhythm";
import { ARTIFACT_DEFS, PASSIVE_DEFS, PASSIVE_SLOTS, isRelicType, passiveDesc, type PassiveArtifact } from "../game/data/artifacts";
import { DESTROY_REFUND_RATE, RESET_BRANCH_LIMIT, resetBranchCost } from "../game/data/shop";
import { qualityBasePrice } from "../game/data/equipmentGen";
import { qualityDef } from "../game/data/quality";
import { rareBonusFor, type TalentId } from "../game/data/talents";
import type { HeroId } from "../game/data/heroes";
import {
  LV_DESC_CHARS,
  LV_DESC_MAX_LINES,
  levelUpScreenLayout,
  type LevelUpLayout,
  type LvRect,
} from "../game/ui/levelUpLayout";

/** 宿主注入的战场侧账本(BattleSim 与 BattleWorld 的窄切片;数组按引用原地改) */
export interface LevelUpWorld {
  /** 玩家场上主动法宝(首章三选一原地 push,不重新赋值 —— 词缀引擎持有同一引用) */
  readonly equipment: Equipment[];
  /** 玩家独有技能(原地 push / 原地升阶) */
  readonly skills: Equipment[];
  /** 玩家被动法宝(可选;给了才有「被动管理」形态:列出、销毁回收半价) */
  readonly passives?: PassiveArtifact[];
  heroId(): HeroId | null;
  playerLevel(): number;
  /** 已解锁节律(首条 = 本命) */
  rhythms(): readonly RhythmId[];
  unlockRhythm(r: RhythmId): void;
  rhythmLevel(r: RhythmId): number;
  rhythmLevelUp(r: RhythmId): boolean;
  branchChosen(): string | null;
  setBranchChosen(id: string): void;
  /** 重置分岔(可选,老宿主不给 = 不出这张卡):撤掉已选分岔与其节律、法宝重挂;返回是否成功 */
  resetBranch?(): boolean;
  /** 本局已重置次数(与 resetBranch 成对) */
  branchResets?(): number;
  gold(): number;
  setGold(v: number): void;
  /** 兜底卡:按最大生命比例回血 / 加最大生命 */
  healPct(pct: number): void;
  addMaxHp(v: number): void;
  /** 总槽位(基础 + 天赋 + 本局广告开槽);首章法宝三选一要有空槽 */
  slots(): number;
  /** 局内章节(免费重随按它分段:进下一章清零) */
  chapter(): number;
  /** 赛季序号(可选;给了首章法宝与卡面才认赛季共鸣格 / 赛季法宝,R5) */
  seasonId?(): number;
  /** 已解锁最高关卡(法宝等级的另一半输入,与商店同一支算式) */
  highestStage(): number;
  ownedTalents(): readonly TalentId[];
  /** 新技能 / 新法宝入图鉴(升阶不重复登记) */
  recordEquipment(eq: Equipment): void;
}

/** 本轮的一张卡 */
export type Choice =
  /** 新技能(含分岔;`eq` 是已实例化、选中即入场的那件) */
  | { kind: "skill"; def: HeroSkillDef; eq: Equipment }
  /** 已有技能升一阶(`eq` 是预览用的升阶副本;选中时原地升场上那件) */
  | { kind: "rank"; skillId: string; eq: Equipment }
  /** 节律强化一级 */
  | { kind: "rhythm"; rhythm: RhythmId }
  /** 首章法宝三选一的一张主动法宝 */
  | { kind: "equip"; eq: Equipment }
  /** 重置分岔(花金币撤掉已选分岔,分岔二选一重来) */
  | { kind: "reset" }
  /** 被动管理形态的一格:一枚被动法宝(选它 = 销毁回收) */
  | { kind: "passive"; p: PassiveArtifact }
  /** 技能池耗尽后的兜底 */
  | { kind: "fallback"; id: FallbackId };

/** 一次「选它」的结果 */
export type LevelUpPick =
  | { ok: true; kind: Choice["kind"] }
  /** `slots` = 空槽不够(首章法宝放不进);`missing` = 这一格没卡 / 升阶目标已不在;`maxed` = 节律已满级;`gold` = 重置分岔钱不够 */
  | { ok: false; reason: "slots" | "missing" | "maxed" | "gold" };

/** 一张卡的文案与形态位(几何不在这里,只有"这一格写什么、按不按得动") */
export interface LevelUpCardContent {
  kind: Choice["kind"];
  nameText: string;
  /** `核心 · 2 阶` / `史诗 · Lv.5` */
  qualityText: string;
  color: string;
  frameKey: string;
  /** 共鸣高亮(法宝挂在本命共鸣节律上;技能卡恒 false)—— 复用旧"隐藏词条"那一档高亮 */
  hidden: boolean;
  descLines: string[];
  /** 升阶数值差一行(`伤害 50 → 56`);其余为空串 */
  deltaText: string;
  tagText: string;
  pickText: string;
  pickEnabled: boolean;
  rerollText: string;
  rerollEnabled: boolean;
  lockText: string;
  lockEnabled: boolean;
  locked: boolean;
}

export interface LevelUpContent {
  title: string;
  readoutText: string;
  hint: string;
  cards: LevelUpCardContent[];
}

export type LevelUpAction = { kind: "pick" | "reroll" | "lock"; index: number };

/** 弹层形态:升级三选一 / 首章法宝三选一 / 被动管理(商店「被动」钮,R2) */
export type LevelUpMode = "levelup" | "first" | "passives";

/** 卡面文案的字面量(本屏没有 Web 基准,文案即设计口径,单立一处便于整屏翻新) */
export const LV_TEXT = {
  title: "升级!选择一项",
  titleFirst: "开局法宝 · 选一件带走",
  hint: "锁定可留到下一次升级;每章可免费重随 1 次",
  hintFirst: "标「共鸣」的法宝与你的本命节律相合,拿到即变形",
  pick: "选它",
  rerollPrefix: "重随(免费 ",
  rerollSuffix: ")",
  lockOn: "锁定",
  lockOff: "解锁",
  tagSkill: "新技能",
  tagBranch: "分岔 · 解锁",
  tagRank: "升阶",
  tagRhythm: "节律强化",
  tagEquip: "主动法宝",
  tagResonant: "共鸣!",
  tagFallback: "补给",
  tagReset: "重置分岔",
  resetName: "另辟蹊径",
  resetDesc: "撤掉已选的分岔技能与它解锁的节律,分岔二选一重新出现;挂在那条节律上的法宝改回本命",
  titlePassives: "被动法宝 · 管理",
  hintPassives: "销毁回收基础价一半;被动槽满了才腾得出位",
  destroyPrefix: "销毁 · 回收 ",
  destroySuffix: " 金",
  nextPage: "下一页",
  close: "关闭",
  tagPassive: "被动",
  tagPassiveRare: "稀有被动",
  tagPassiveRelic: "遗物",
  teaseBefore: "分岔将在 Lv.%s 后出现",
  teaseDue: "分岔最迟 Lv.%s",
  tagLocked: "已锁定",
  kindCore: "核心",
  kindBranch: "分岔",
  kindAdvance: "进阶",
} as const;

/** 词条描述折行(与融合屏 `hiddenCardDescLines` 同一形状):按字符预算逐段切、最多 `maxLines` 行 */
export function levelUpDescLines(lines: readonly string[], chars: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const src of lines) {
    const cs = [...src];
    for (let k = 0; k * chars < cs.length; k++) out.push(cs.slice(k * chars, k * chars + chars).join(""));
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

/** 升阶数值差一行:读 `UPGRADE_MAIN_KEYS` 里第一个真变了的键,给 `标签 旧 → 新`;没有主数值变化返回空串 */
export function levelUpDeltaText(source: Equipment | null, upgraded: Equipment): string {
  if (!source) return "";
  for (const k of UPGRADE_MAIN_KEYS) {
    const a = source.effect.params[k];
    const b = upgraded.effect.params[k];
    if (typeof a === "number" && typeof b === "number" && a !== b) return `${LEVELUP_MAIN_LABELS[k]} ${a} → ${b}`;
  }
  return "";
}

function cloneEq(eq: Equipment): Equipment {
  return JSON.parse(JSON.stringify(eq)) as Equipment;
}

export class LevelUpModel {
  choices: Choice[] = [];
  lockedIndex = -1;
  visible = false;
  mode: LevelUpMode = "levelup";
  /** 本章已用的免费重随次数(进下一章清零) */
  rerolls = 0;

  private lock: Choice | null = null;
  private chapterSeen = 0;
  /** 重置保底账:分岔选定后开过几轮升级、这段时间里重置卡有没有出现过(分岔换了 / 撤了就归零) */
  private branchSeen: string | null = null;
  private roundsSinceBranch = 0;
  private resetOfferedSinceBranch = false;

  constructor(private readonly w: LevelUpWorld, private readonly rand: () => number = Math.random) {}

  /* ================= 账本查询 ================= */

  /** 法宝等级 = max(局内章节 + 1, 已解锁最高关卡)(与商店 `ShopModel.cardLevel` 同一支算式) */
  cardLevel(): number {
    return Math.max(this.w.chapter() + 1, this.w.highestStage());
  }

  /** 本章还剩几次免费重随 */
  rerollsLeft(): number {
    return Math.max(0, LEVELUP_FREE_REROLL_PER_CHAPTER - this.rerolls);
  }

  freeSlots(): number {
    return Math.max(0, this.w.slots() - this.w.equipment.length);
  }

  lockLeft(): number {
    return Math.max(0, LEVELUP_LOCK_LIMIT - (this.lock ? 1 : 0));
  }

  canReroll(i: number): boolean {
    if (!this.visible || !this.choices[i]) return false;
    // 被动管理:重随钮 = 翻页,有下一页才亮
    if (this.mode === "passives") return this.passivePages() > 1;
    if (this.lockedIndex === i) return false;
    return this.rerollsLeft() > 0;
  }

  /** 这一格的锁定按不按得动:首章法宝不可锁;升级形态任一格都可按 —— 已有锁定时按别的格就是换锁(上一格释放) */
  canLock(i: number): boolean {
    if (!this.visible || !this.choices[i]) return false;
    if (this.mode === "first") return false;
    // 被动管理:锁定钮 = 关闭,恒可按
    if (this.mode === "passives") return true;
    return this.lockedIndex === i || this.lockLeft() > 0 || this.lockedIndex >= 0;
  }

  canPick(i: number): boolean {
    const c = this.choices[i];
    if (!this.visible || !c) return false;
    switch (c.kind) {
      case "rank":
        return this.w.skills.some((e) => e.skillId === c.skillId && e.level < SKILL_MAX_RANK);
      case "rhythm":
        return this.w.rhythmLevel(c.rhythm) < RHYTHM_MAX_LEVEL;
      case "equip":
        return this.freeSlots() > 0;
      case "reset":
        return this.resetAvailable() && this.w.gold() >= this.resetCost();
      case "passive":
        return (this.w.passives ?? []).includes(c.p);
      default:
        return true;
    }
  }

  /** 重置分岔的价(金):共享表 resetBranchCost(章) */
  resetCost(): number {
    return resetBranchCost(this.w.chapter());
  }

  /** 这一轮能不能出「重置分岔」:宿主接了 resetBranch、已选分岔、次数未用完、金币够 */
  private resetAvailable(): boolean {
    if (!this.w.resetBranch || !this.w.branchChosen()) return false;
    return (this.w.branchResets?.() ?? 0) < RESET_BRANCH_LIMIT && this.w.gold() >= this.resetCost();
  }

  /* ================= 开层 ================= */

  private offerInput(exclude?: ReadonlySet<string>) {
    const owned = new Map<string, number>();
    for (const s of this.w.skills) if (s.skillId) owned.set(s.skillId, s.level);
    const rhythms = new Map<RhythmId, number>();
    for (const r of this.w.rhythms()) rhythms.set(r, this.w.rhythmLevel(r));
    return {
      heroId: this.w.heroId(),
      owned,
      branchChosen: this.w.branchChosen(),
      playerLevel: this.w.playerLevel(),
      rhythms,
      exclude,
      resetAvailable: this.resetAvailable(),
      // 保底(RESET_GUARANTEE_ROUNDS):分岔选定后到第 N 轮仍没见过重置卡 → 这一轮必出
      resetGuaranteed: this.roundsSinceBranch >= RESET_GUARANTEE_ROUNDS && !this.resetOfferedSinceBranch,
    };
  }

  /** 每次开升级轮先记账:分岔换了就重新数;这一轮开完后若卡里有重置就把"已出现"记上 */
  private trackBranchRounds(): void {
    const b = this.w.branchChosen();
    if (b !== this.branchSeen) {
      this.branchSeen = b;
      this.roundsSinceBranch = 0;
      this.resetOfferedSinceBranch = false;
    }
    if (b) this.roundsSinceBranch += 1;
  }

  /**
   * 「分岔预告」(R3):BRANCH_TEASE_LEVEL 起、未选分岔、本轮卡里没有分岔成对、英雄表里确有分岔时,
   * 读数行末尾提示分岔何时出现;到 BRANCH_MIN_LEVEL 仍未出改提「最迟」;BRANCH_GUARANTEE_LEVEL 起必出,不再提示。
   */
  branchTease(): string {
    const lv = this.w.playerLevel();
    if (lv < BRANCH_TEASE_LEVEL || lv >= BRANCH_GUARANTEE_LEVEL) return "";
    if (this.w.branchChosen()) return "";
    if (this.choices.some((c) => c.kind === "skill" && c.def.kind === "branch")) return "";
    const hero = this.w.heroId();
    const table = hero ? HERO_SKILLS[hero] : GENERIC_HERO_SKILLS;
    if (!table.some((d) => d.kind === "branch")) return "";
    return lv < BRANCH_MIN_LEVEL ? LV_TEXT.teaseBefore.replace("%s", String(BRANCH_MIN_LEVEL)) : LV_TEXT.teaseDue.replace("%s", String(BRANCH_GUARANTEE_LEVEL));
  }

  /** 身份 → 卡(实例化技能 / 升阶预览) */
  private materialize(o: SkillOffer): Choice {
    switch (o.kind) {
      case "skill":
        return { kind: "skill", def: o.def, eq: makeSkillEquipment(o.def) };
      case "rank": {
        const live = this.w.skills.find((e) => e.skillId === o.skillId);
        const preview = live ? upgradeEquipment(cloneEq(live)) : makeSkillEquipment(heroSkillDef(o.skillId)!);
        return { kind: "rank", skillId: o.skillId, eq: preview };
      }
      case "rhythm":
        return { kind: "rhythm", rhythm: o.rhythm };
      case "reset":
        return { kind: "reset" };
      case "fallback":
        return { kind: "fallback", id: o.id };
    }
  }

  private keyOf(c: Choice): string {
    switch (c.kind) {
      case "skill":
        return `skill:${c.def.id}`;
      case "rank":
        return `rank:${c.skillId}`;
      case "rhythm":
        return `rhythm:${c.rhythm}`;
      case "reset":
        return "reset";
      case "fallback":
        return `fallback:${c.id}`;
      case "equip":
        return `equip:${c.eq.id}`;
      case "passive":
        return `passive:${c.p.id}`;
    }
  }

  /**
   * 开一轮升级三选一。章节换了就把免费重随清零;锁定卡恒落第 0 格(下一轮必再出现是结构性的),
   * 其余格由 `rollSkillOffers` 现出(分岔到期时成对占两格)。
   */
  open(): void {
    this.mode = "levelup";
    const ch = this.w.chapter();
    if (ch !== this.chapterSeen) {
      this.chapterSeen = ch;
      this.rerolls = 0;
    }
    // 锁定的升阶卡要按场上现阶重新预览(上一轮到这一轮之间那件可能已经升过阶)
    if (this.lock?.kind === "rank") {
      const live = this.w.skills.find((e) => e.skillId === (this.lock as { skillId: string }).skillId);
      if (!live || live.level >= SKILL_MAX_RANK) this.lock = null;
      else this.lock = { kind: "rank", skillId: live.skillId!, eq: upgradeEquipment(cloneEq(live)) };
    }
    const exclude = this.lock ? new Set([this.keyOf(this.lock)]) : undefined;
    const need = this.lock ? LEVELUP_OFFER_COUNT - LEVELUP_LOCK_LIMIT : LEVELUP_OFFER_COUNT;
    this.trackBranchRounds();
    const fresh = rollSkillOffers(this.offerInput(exclude), need, this.rand).map((o) => this.materialize(o));
    this.choices = this.lock ? [this.lock, ...fresh] : fresh;
    this.lockedIndex = this.lock ? 0 : -1;
    if (this.choices.some((c) => c.kind === "reset")) this.resetOfferedSinceBranch = true;
    this.visible = true;
  }

  /* ================= 被动管理形态(商店「被动」钮) ================= */

  /** 被动管理翻到第几页(每页 LEVELUP_OFFER_COUNT 枚) */
  passivePage = 0;

  /** 打开被动管理:列出玩家被动(分页),选它 = 销毁回收半价;重随钮 = 翻页;锁定钮 = 关闭 */
  openPassives(): void {
    this.mode = "passives";
    this.passivePage = 0;
    this.lockedIndex = -1;
    this.refreshPassives();
    this.visible = true;
  }

  private refreshPassives(): void {
    const list = this.w.passives ?? [];
    const pages = Math.max(1, Math.ceil(list.length / LEVELUP_OFFER_COUNT));
    this.passivePage = Math.min(this.passivePage, pages - 1);
    const start = this.passivePage * LEVELUP_OFFER_COUNT;
    this.choices = list.slice(start, start + LEVELUP_OFFER_COUNT).map((p) => ({ kind: "passive" as const, p }));
  }

  /** 被动管理还有没有下一页 */
  passivePages(): number {
    return Math.max(1, Math.ceil((this.w.passives ?? []).length / LEVELUP_OFFER_COUNT));
  }

  /** 关闭弹层(被动管理的「关闭」钮;其余形态由选它自然关) */
  close(): void {
    this.choices = [];
    this.lockedIndex = -1;
    this.visible = false;
  }

  /** 销毁回收额(金):品质基础价 × 商店同一份回收率 */
  passiveRefund(p: PassiveArtifact): number {
    return Math.round(qualityBasePrice(p.quality) * DESTROY_REFUND_RATE);
  }

  /** 首章法宝三选一:3 张主动法宝,至少 1 张与本命节律共鸣;不花钱、不可锁、可用本章免费重随 */
  openFirstPick(): void {
    this.mode = "first";
    this.chapterSeen = this.w.chapter();
    this.choices = this.rollFirstPicks(FIRST_PICK_COUNT);
    this.lockedIndex = -1;
    this.visible = true;
  }

  private rollFirstPicks(count: number): Choice[] {
    const rareBonus = rareBonusFor(this.w.ownedTalents());
    const rhythms = this.w.rhythms();
    const out: Choice[] = [];
    const season = this.w.seasonId?.();
    for (let i = 0; i < count; i++) {
      let eq = generateEquipment(this.cardLevel(), "common", false, rareBonus, rhythms, season);
      for (let tries = 0; tries < 8 && out.some((c) => c.kind === "equip" && c.eq.effect.def.type === eq.effect.def.type); tries++) {
        eq = generateEquipment(this.cardLevel(), "common", false, rareBonus, rhythms, season);
      }
      out.push({ kind: "equip", eq });
    }
    // 共鸣保底:不足时把首张换成本命共鸣的效果(按法宝表序找第一个与本命共鸣且未出现的)
    const resonant = out.filter((c) => c.kind === "equip" && equipmentResonant(c.eq, season)).length;
    if (resonant < FIRST_PICK_RESONANCE_GUARANTEE) {
      const native = rhythms[0];
      const types = Object.values(ARTIFACT_DEFS).filter((d) => d.resonance.includes(native)).map((d) => d.effect);
      for (const t of types) {
        if (out.some((c) => c.kind === "equip" && c.eq.effect.def.type === t)) continue;
        let eq = generateEquipment(this.cardLevel(), "common", false, rareBonus, rhythms, season);
        for (let tries = 0; tries < 40 && eq.effect.def.type !== t; tries++) eq = generateEquipment(this.cardLevel(), "common", false, rareBonus, rhythms, season);
        if (eq.effect.def.type === t) {
          out[0] = { kind: "equip", eq };
          break;
        }
      }
    }
    return out;
  }

  /* ================= 三个动作 ================= */

  /**
   * 选它。新技能原地 push 进技能数组(分岔:解锁其节律 + 记下选择,另一分岔从此不出);升阶原地升场上那件;
   * 节律强化回写玩家;首章法宝要有空槽,入场即登记图鉴;兜底卡直接结算。带走锁定卡时把锁定一并清掉。
   */
  pick(i: number): LevelUpPick {
    const c = this.choices[i];
    if (!this.visible || !c) return { ok: false, reason: "missing" };
    switch (c.kind) {
      case "skill": {
        this.w.skills.push(c.eq);
        this.w.recordEquipment(c.eq);
        if (c.def.kind === "branch") {
          this.w.unlockRhythm(c.def.rhythm);
          this.w.setBranchChosen(c.def.id);
        }
        break;
      }
      case "rank": {
        const live = this.w.skills.find((e) => e.skillId === c.skillId);
        if (!live || live.level >= SKILL_MAX_RANK) return { ok: false, reason: "missing" };
        upgradeEquipment(live);
        break;
      }
      case "rhythm": {
        if (!this.w.rhythmLevelUp(c.rhythm)) return { ok: false, reason: "maxed" };
        break;
      }
      case "reset": {
        const cost = this.resetCost();
        if (!this.w.resetBranch || !this.w.branchChosen()) return { ok: false, reason: "missing" };
        if (this.w.gold() < cost) return { ok: false, reason: "gold" };
        if (!this.w.resetBranch()) return { ok: false, reason: "missing" };
        this.w.setGold(this.w.gold() - cost);
        break;
      }
      case "equip": {
        if (this.freeSlots() <= 0) return { ok: false, reason: "slots" };
        this.w.equipment.push(c.eq);
        this.w.recordEquipment(c.eq);
        break;
      }
      case "passive": {
        // 被动管理:销毁这一枚、回收半价;弹层留着(还有被动就刷这一页,空了才关)
        const list = this.w.passives;
        const idx = list ? list.indexOf(c.p) : -1;
        if (!list || idx < 0) return { ok: false, reason: "missing" };
        list.splice(idx, 1);
        this.w.setGold(this.w.gold() + this.passiveRefund(c.p));
        if (list.length === 0) this.close();
        else this.refreshPassives();
        return { ok: true, kind: "passive" };
      }
      case "fallback": {
        const fb = FALLBACK_OFFERS.find((f) => f.id === c.id)!;
        if ("healPct" in fb) this.w.healPct(fb.healPct);
        if ("gold" in fb) this.w.setGold(this.w.gold() + fb.gold);
        if ("maxHp" in fb) this.w.addMaxHp(fb.maxHp);
        break;
      }
    }
    this.closeWith(c);
    return { ok: true, kind: c.kind };
  }

  /**
   * 免费重随这一格(每章 `LEVELUP_FREE_REROLL_PER_CHAPTER` 次):锁定卡不进重随池、次数用完时
   * **一个状态都不改**。升级形态按身份重抽(排除本轮其余两格);首章形态换一张不同效果的法宝。
   */
  reroll(i: number): boolean {
    if (!this.canReroll(i)) return false;
    if (this.mode === "passives") {
      // 翻页(不占免费重随次数)
      this.passivePage = (this.passivePage + 1) % this.passivePages();
      this.refreshPassives();
      return true;
    }
    if (this.mode === "first") {
      const others = this.choices.filter((_, k) => k !== i);
      let eq = generateEquipment(this.cardLevel(), "common", false, rareBonusFor(this.w.ownedTalents()), this.w.rhythms(), this.w.seasonId?.());
      for (let tries = 0; tries < 12 && others.some((c) => c.kind === "equip" && c.eq.effect.def.type === eq.effect.def.type); tries++) {
        eq = generateEquipment(this.cardLevel(), "common", false, rareBonusFor(this.w.ownedTalents()), this.w.rhythms(), this.w.seasonId?.());
      }
      this.choices[i] = { kind: "equip", eq };
    } else {
      const exclude = new Set(this.choices.map((c) => this.keyOf(c)));
      const [o] = rollSkillOffers(this.offerInput(exclude), 1, this.rand);
      if (!o) return false;
      this.choices[i] = this.materialize(o);
    }
    this.rerolls += 1;
    return true;
  }

  /** 锁定 / 解锁这一格(上限读表;换锁就是把上一格释放掉,于是恒 ≤ 上限) */
  toggleLock(i: number): boolean {
    if (!this.canLock(i)) return false;
    if (this.mode === "passives") {
      this.close();
      return true;
    }
    if (this.lockedIndex === i) {
      this.lock = null;
      this.lockedIndex = -1;
      return true;
    }
    this.lock = this.choices[i];
    this.lockedIndex = i;
    return true;
  }

  /** 本局开始:清锁定、清计数(锁定是"本局内跨弹层记忆",不跨局) */
  resetRun(): void {
    this.lock = null;
    this.lockedIndex = -1;
    this.rerolls = 0;
    this.chapterSeen = 0;
    this.choices = [];
    this.visible = false;
    this.mode = "levelup";
    this.branchSeen = null;
    this.roundsSinceBranch = 0;
    this.resetOfferedSinceBranch = false;
  }

  private closeWith(picked: Choice): void {
    if (this.lock && this.lock === picked) this.lock = null;
    this.lockedIndex = -1;
    this.choices = [];
    this.visible = false;
  }

  /* ================= 几何与文案 ================= */

  layout(w: number, screenH: number): LevelUpLayout {
    return levelUpScreenLayout(w, screenH);
  }

  content(): LevelUpContent {
    if (this.mode === "passives") {
      const list = this.w.passives ?? [];
      return {
        title: LV_TEXT.titlePassives,
        readoutText: `被动 ${list.length}/${PASSIVE_SLOTS} · 第 ${this.passivePage + 1}/${this.passivePages()} 页 · 金币 ${this.w.gold()}`,
        hint: LV_TEXT.hintPassives,
        cards: this.choices.map((c, i) => this.cardContent(c, i)),
      };
    }
    const first = this.mode === "first";
    const rhythmText = this.w.rhythms().map((r) => `${rhythmDef(r).name} Lv.${this.w.rhythmLevel(r)}`).join(" / ");
    const tease = first ? "" : this.branchTease();
    return {
      title: first ? LV_TEXT.titleFirst : LV_TEXT.title,
      readoutText: `Lv.${this.w.playerLevel()} · 节律:${rhythmText} · 本章免费重随 ${this.rerollsLeft()}${tease ? ` · ${tease}` : ""}`,
      hint: first ? LV_TEXT.hintFirst : LV_TEXT.hint,
      cards: this.choices.map((c, i) => this.cardContent(c, i)),
    };
  }

  private kindLabel(def: HeroSkillDef): string {
    return def.kind === "core" ? LV_TEXT.kindCore : def.kind === "branch" ? LV_TEXT.kindBranch : LV_TEXT.kindAdvance;
  }

  private cardContent(c: Choice, i: number): LevelUpCardContent {
    const locked = this.lockedIndex === i;
    const base = {
      pickText: LV_TEXT.pick,
      pickEnabled: this.canPick(i),
      rerollText: `${LV_TEXT.rerollPrefix}${this.rerollsLeft()}${LV_TEXT.rerollSuffix}`,
      rerollEnabled: this.canReroll(i),
      lockText: locked ? LV_TEXT.lockOff : LV_TEXT.lockOn,
      lockEnabled: this.canLock(i),
      locked,
    };
    switch (c.kind) {
      case "skill": {
        const q = qualityDef(c.def.kind === "branch" ? "epic" : "rare");
        const branch = c.def.kind === "branch";
        return {
          ...base,
          kind: c.kind,
          nameText: c.def.name,
          qualityText: `${this.kindLabel(c.def)} · 1 阶`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: false,
          descLines: levelUpDescLines([c.def.desc, ...equipmentDescription(c.eq).slice(1)], LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: locked ? LV_TEXT.tagLocked : branch ? `${LV_TEXT.tagBranch}【${rhythmDef(c.def.rhythm).name}】节律` : LV_TEXT.tagSkill,
        };
      }
      case "rank": {
        const live = this.w.skills.find((e) => e.skillId === c.skillId) ?? null;
        const def = heroSkillDef(c.skillId);
        const q = qualityDef("rare");
        return {
          ...base,
          kind: c.kind,
          nameText: def?.name ?? c.eq.name,
          qualityText: `${def ? this.kindLabel(def) : ""} · ${live ? live.level : c.eq.level - 1} → ${c.eq.level} 阶`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: false,
          descLines: levelUpDescLines(equipmentDescription(c.eq).slice(1), LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: levelUpDeltaText(live, c.eq),
          tagText: locked ? LV_TEXT.tagLocked : LV_TEXT.tagRank,
        };
      }
      case "rhythm": {
        const q = qualityDef("legendary");
        const lv = this.w.rhythmLevel(c.rhythm);
        const d = rhythmDef(c.rhythm);
        return {
          ...base,
          kind: c.kind,
          nameText: `${d.name}节律`,
          qualityText: `节律 · Lv.${lv} → ${Math.min(RHYTHM_MAX_LEVEL, lv + 1)}`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: false,
          descLines: levelUpDescLines([d.desc, "该节律上的全部技能与法宝:冷却 −8%,阈值放宽 6%"], LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: locked ? LV_TEXT.tagLocked : LV_TEXT.tagRhythm,
        };
      }
      case "equip": {
        const info = equipmentResonance(c.eq, this.w.seasonId?.());
        const resonant = info !== null;
        const q = qualityDef(resonant ? "hidden" : c.eq.quality);
        const lines = [...equipmentDescription(c.eq)];
        if (info) lines.unshift(`【${info.name}】${info.desc}${info.kind === "season" ? "(本季新共鸣)" : info.kind === "echo" ? "(回响共鸣)" : ""}`);
        return {
          ...base,
          kind: c.kind,
          nameText: equipmentDisplayName(c.eq, undefined, this.w.seasonId?.()),
          qualityText: `${qualityDef(c.eq.quality).name} · Lv.${c.eq.level}`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: resonant,
          descLines: levelUpDescLines(lines, LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: resonant ? LV_TEXT.tagResonant : LV_TEXT.tagEquip,
        };
      }
      case "passive": {
        const q = qualityDef(PASSIVE_DEFS[c.p.type].rare ? "hidden" : c.p.quality);
        const relic = isRelicType(c.p.type);
        const lines = [passiveDesc(c.p)];
        return {
          ...base,
          kind: c.kind,
          nameText: c.p.name,
          qualityText: `${qualityDef(c.p.quality).name} · 被动`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: PASSIVE_DEFS[c.p.type].rare,
          descLines: levelUpDescLines(lines, LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: PASSIVE_DEFS[c.p.type].rare ? LV_TEXT.tagPassiveRare : relic ? LV_TEXT.tagPassiveRelic : LV_TEXT.tagPassive,
          pickText: `${LV_TEXT.destroyPrefix}${this.passiveRefund(c.p)}${LV_TEXT.destroySuffix}`,
          rerollText: LV_TEXT.nextPage,
          lockText: LV_TEXT.close,
        };
      }
      case "reset": {
        const q = qualityDef("epic");
        const cost = this.resetCost();
        return {
          ...base,
          kind: c.kind,
          nameText: LV_TEXT.resetName,
          qualityText: `${LV_TEXT.tagReset} · ${cost} 金`,
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: false,
          descLines: levelUpDescLines([LV_TEXT.resetDesc, `本局剩 ${Math.max(0, RESET_BRANCH_LIMIT - (this.w.branchResets?.() ?? 0))} 次 · 金币 ${this.w.gold()}`], LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: locked ? LV_TEXT.tagLocked : LV_TEXT.tagReset,
        };
      }
      case "fallback": {
        const fb = FALLBACK_OFFERS.find((f) => f.id === c.id)!;
        const q = qualityDef("common");
        return {
          ...base,
          kind: c.kind,
          nameText: fb.name,
          qualityText: "补给",
          color: q.color,
          frameKey: `frame_${q.key}`,
          hidden: false,
          descLines: levelUpDescLines([fb.desc], LV_DESC_CHARS, LV_DESC_MAX_LINES),
          deltaText: "",
          tagText: locked ? LV_TEXT.tagLocked : LV_TEXT.tagFallback,
        };
      }
    }
  }
}

/**
 * 命中判定:先按卡序、卡内按 选它 → 重随 → 锁定 三枚钮,九片矩形互不相交,**九片之外一律 `null`**
 * (语义是"吞掉、什么都不做":宿主视图那张整屏 Capture 对每一下都停止事件传播)。
 */
export function hitLevelUp(L: LevelUpLayout, x: number, y: number): LevelUpAction | null {
  const inRect = (r: LvRect): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  for (const card of L.cards) {
    if (inRect(card.pick.rect)) return { kind: "pick", index: card.idx };
    if (inRect(card.reroll.rect)) return { kind: "reroll", index: card.idx };
    if (inRect(card.lock.rect)) return { kind: "lock", index: card.idx };
  }
  return null;
}

/** 供宿主 / 测试用:身份键(与 heroSkills.offerKey 同源) */
export { offerKey };
