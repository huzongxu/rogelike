/**
 * 升级三选一弹层的**账本、内容与命中**(纯逻辑,cc-free)—— 批次 A · A2 的新屏
 * (需求 F9:升级时能选保留哪个 / 重新随机,重随有概率出隐藏触发器与修饰器)。
 *
 * 分工与已落地各屏同构,但**本件不是一张屏而是一层覆盖层**,两处因此与二次确认弹层同款:
 *  ① 它不挂路由(`core/ScreenRouter.ts` 的 `SCREEN_KEYS` 仍是 16 态,一枚键都不加),而是挂在宿主
 *     `Overlay` 常驻层上,开层时顶到末位压过懒建的 toast;
 *  ② 它**开着就把战斗停住**:弹层不挂路由,路由闸门 `blocksPlay()` 看不到它,所以宿主在主循环里
 *     另设一道同位闸门(选完即恢复)。
 *
 * 与二次确认弹层不同的一处:本件**有写入意图**,但写的全是**局内态**而不是存档 ——
 * 装备数组按引用原地 `push`(词缀引擎持同一引用,不得重新赋值)、金币账本经 `LevelUpWorld`
 * 的 `gold()/setGold()` 读写(与商店屏同一份账)、图鉴登记转调宿主的 `recordEquipment`。
 * 一个存档字段都不落,所以本节没有 `persist()`、也没有广告位(闸门只有 `GameShell.watchAd` 首行那一道)。
 *
 * 三条策略口径全部读表,本文件不内联任何数值:
 *  - 出几张卡 / 能锁几张 / 哪支天赋开保底稀有 → `game/data/levelUp.ts`;
 *  - 重随价 → `game/data/reroll.ts` 的 `rerollPrice(本章已重随次数)`(进下一章清零);
 *  - 隐藏概率与保底 → `rerollCard` 自己读 `REROLL_HIDDEN`,本文件只把"本局连续未出"那一支计数
 *    递进去(`hiddenDryStreak`)并在出货后清零。
 *
 * 几何一律转调共享层 `game/ui/levelUpLayout.ts`(盒 / 横幅 / 三张卡 / 每卡三枚钮 / 全部文本位),
 * 本文件一枚坐标都不算,只把矩形翻成"点在哪一片"。
 */

import { LEVELUP_ENSURE_RARE_TALENT, LEVELUP_LOCK_LIMIT, LEVELUP_MAIN_LABELS, LEVELUP_OFFER_COUNT } from "../game/data/levelUp";
import { rerollPrice, REROLL_HIDDEN } from "../game/data/reroll";
import { UPGRADE_MAIN_KEYS, equipmentDescription, generateChoices, rerollCard, upgradeEquipment, type Choice, type Equipment } from "../game/data/equipmentGen";
import { qualityDef } from "../game/data/quality";
import { rareBonusFor, type TalentId } from "../game/data/talents";
import type { SetId } from "../game/data/sets";
import {
  LV_DESC_CHARS,
  LV_DESC_MAX_LINES,
  levelUpScreenLayout,
  type LevelUpLayout,
  type LvRect,
} from "../game/ui/levelUpLayout";

/** 宿主注入的战场侧账本(BattleSim 与 BattleWorld 的窄切片;装备数组按引用原地改) */
export interface LevelUpWorld {
  /** 玩家场上装备(原地 push,不重新赋值 —— 词缀引擎持有同一引用) */
  readonly equipment: Equipment[];
  gold(): number;
  setGold(v: number): void;
  /** 总槽位(基础 + 天赋 + 本局广告开槽) */
  slots(): number;
  /** 局内章节(重随价按它分段:进下一章清零) */
  chapter(): number;
  /** 已解锁最高关卡(卡等级的另一半输入,与商店同一支算式) */
  highestStage(): number;
  ownedTalents(): readonly TalentId[];
  /** 出战套组:重随时其声明的词条一并进亲和池(英雄特色) */
  selectedSet(): SetId | null;
  /** 新装备入图鉴(只在新卡入场那一步调,强化不重复登记) */
  recordEquipment(eq: Equipment): void;
}

/** 一次「选它」的结果:成功带走哪一件,或失败在哪一支 */
export type LevelUpPick =
  | { ok: true; kind: "equip"; eq: Equipment }
  | { ok: true; kind: "upgrade"; eq: Equipment }
  /** `slots` = 空槽不够(新卡放不进);`missing` = 这一格没卡 / 强化目标已不在场上 */
  | { ok: false; reason: "slots" | "missing" };

/** 一张卡的文案与形态位(几何不在这里,只有"这一格写什么、按不按得动") */
export interface LevelUpCardContent {
  kind: "equip" | "upgrade";
  /** 卡名(`buildName` 的产出,重随后会变) */
  nameText: string;
  /** `史诗 · Lv.5` */
  qualityText: string;
  /** 卡框与卡名的品质色;命中隐藏词条时改走隐藏档色(见 `hidden`) */
  color: string;
  /** 卡框贴图键 `frame_<品质>`;命中隐藏词条时改走 `frame_hidden` */
  frameKey: string;
  /** 本轮重随是否命中了隐藏词条(卡面高亮的唯一判据) */
  hidden: boolean;
  /** 词条描述行(已按 `LV_DESC_CHARS` 折好,条数 ≤ `LV_DESC_MAX_LINES`) */
  descLines: string[];
  /** 强化数值差一行(`伤害 12 → 13`);非强化卡为空串 */
  deltaText: string;
  /** 状态标签一行 */
  tagText: string;
  pickText: string;
  pickEnabled: boolean;
  /** 重随钮文案(带价,价格来自 `rerollPrice`,本文件不写死任何数字) */
  rerollText: string;
  rerollEnabled: boolean;
  lockText: string;
  lockEnabled: boolean;
  /** 这一格当前是不是被锁定的那一张 */
  locked: boolean;
}

/** 一屏文案 */
export interface LevelUpContent {
  title: string;
  /** 读数行:金币 / 下一次重随价 / 隐藏保底进度 */
  readoutText: string;
  hint: string;
  cards: LevelUpCardContent[];
}

/** 热区 → 动作(三枚钮 × 三张卡;两段之外一律 `null`,语义是"吞掉、什么都不做") */
export type LevelUpAction = { kind: "pick" | "reroll" | "lock"; index: number };

/** 卡面文案的字面量(本屏没有 Web 基准,文案即设计口径,单立一处便于整屏翻新) */
export const LV_TEXT = {
  title: "升级!选择一张",
  hint: "锁定可留到下一次升级;重随要花金币,有概率出隐藏词条",
  pick: "选它",
  rerollPrefix: "重随 ",
  rerollSuffix: " 金",
  lockOn: "锁定",
  lockOff: "解锁",
  tagNew: "新装备",
  tagUpgrade: "强化现有",
  tagLocked: "已锁定",
  tagHidden: "隐藏词条!",
} as const;

/**
 * 词条描述折行(与融合屏 `hiddenCardDescLines` 同一形状):按字符预算逐段切、最多 `maxLines` 行。
 * CJK 一字 ≈ 1×px,故预算 = 卡内限宽 / 字号(共享层 `LV_DESC_CHARS` 已算好,这里不重算)。
 * 截断而不是缩字号:卡宽恒定,缩字号会掉出 `fs` 表档。
 */
export function levelUpDescLines(lines: readonly string[], chars: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const src of lines) {
    const cs = [...src];
    for (let k = 0; k * chars < cs.length; k++) out.push(cs.slice(k * chars, k * chars + chars).join(""));
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

/**
 * 强化数值差一行:读 `UPGRADE_MAIN_KEYS` 里第一个真变了的键,给 `标签 旧 → 新`。
 * 成长比例一个数都不碰(全在 `upgradeEquipment` 里),标签走 `LEVELUP_MAIN_LABELS` 那张表;
 * 没有主数值变化的强化卡(例如只涨 radius)返回空串,槽位仍在、只是不写字。
 */
export function levelUpDeltaText(source: Equipment | null, upgraded: Equipment): string {
  if (!source) return "";
  for (const k of UPGRADE_MAIN_KEYS) {
    const a = source.effect.params[k];
    const b = upgraded.effect.params[k];
    if (typeof a === "number" && typeof b === "number" && a !== b) return `${LEVELUP_MAIN_LABELS[k]} ${a} → ${b}`;
  }
  return "";
}

/** 锁定态的一格:被锁的 `Choice` 与它当时是否已命中隐藏(下一轮照旧高亮) */
interface LockSlot {
  choice: Choice;
  hidden: boolean;
}

export class LevelUpModel {
  /** 本轮的三张卡(`generateChoices` 的产出 + 可能的锁定卡) */
  choices: Choice[] = [];
  /** 本轮哪一格被锁(−1 = 没锁) */
  lockedIndex = -1;
  /** 本轮每张卡是否命中隐藏词条(与 `choices` 逐位对齐) */
  hiddenHit: boolean[] = [];
  /** 弹层是否开着(宿主的主循环闸门与视图的起落都读它) */
  visible = false;
  /** 本章已重随次数(重随价的指数;进下一章清零) */
  rerolls = 0;
  /** 本局连续未出隐藏的重随次数(达 `REROLL_HIDDEN.pity` 必出;出货即清零,跨章不清) */
  hiddenDry = 0;

  private lock: LockSlot | null = null;
  /** 上一次开层时的章节:与 `w.chapter()` 不等就把重随阶梯清零 */
  private chapterSeen = 0;

  constructor(private readonly w: LevelUpWorld, private readonly rand: () => number = Math.random) {}

  /* ================= 账本查询 ================= */

  /** 卡等级 = max(局内章节 + 1, 已解锁最高关卡)(与商店 `ShopModel.cardLevel` 同一支算式) */
  cardLevel(): number {
    return Math.max(this.w.chapter() + 1, this.w.highestStage());
  }

  /** 下一次重随的价(金):唯一出处是 `rerollPrice`,本文件与视图都不写死价格 */
  rerollCost(): number {
    return rerollPrice(this.rerolls);
  }

  /** 空槽数 = 总槽位 − 场上件数(与商店屏同一支算式) */
  freeSlots(): number {
    return Math.max(0, this.w.slots() - this.w.equipment.length);
  }

  /** 还能再锁几张(锁定上限读表) */
  lockLeft(): number {
    return Math.max(0, LEVELUP_LOCK_LIMIT - (this.lock ? 1 : 0));
  }

  /** 这一格的重随按不按得动:锁定卡不进重随池、金币不足禁用 */
  canReroll(i: number): boolean {
    if (!this.visible || !this.choices[i]) return false;
    if (this.lockedIndex === i) return false;
    return this.w.gold() >= this.rerollCost();
  }

  /** 这一格的锁定按不按得动:已锁的那一格恒可按(再点一次解锁),其余看锁定余量 */
  canLock(i: number): boolean {
    if (!this.visible || !this.choices[i]) return false;
    return this.lockedIndex === i || this.lockLeft() > 0;
  }

  /** 这一格的「选它」按不按得动:新卡要有空槽,强化卡的目标要还在场上 */
  canPick(i: number): boolean {
    const c = this.choices[i];
    if (!this.visible || !c) return false;
    return c.kind === "upgrade" ? this.w.equipment.some((e) => e.id === c.sourceId) : this.freeSlots() > 0;
  }

  /* ================= 开层与三个动作 ================= */

  /**
   * 开一轮三选一。章节换了就把重随阶梯清零(价格曲线按章分段),隐藏保底计数**不清** ——
   * 它是本局累计口径。锁定卡恒落第 0 格(于是"下一轮必再出现"是结构性的,不靠概率),
   * 其余格由 `generateChoices` 现生(自带 1 张强化卡与去重)。
   */
  open(): void {
    const ch = this.w.chapter();
    if (ch !== this.chapterSeen) {
      this.chapterSeen = ch;
      this.rerolls = 0;
    }
    const owned = this.w.ownedTalents();
    const fresh = generateChoices(
      this.cardLevel(),
      this.lock ? LEVELUP_OFFER_COUNT - LEVELUP_LOCK_LIMIT : LEVELUP_OFFER_COUNT,
      owned.includes(LEVELUP_ENSURE_RARE_TALENT),
      rareBonusFor(owned),
      this.w.equipment
    );
    this.choices = this.lock ? [this.lock.choice, ...fresh] : fresh;
    this.lockedIndex = this.lock ? 0 : -1;
    this.hiddenHit = this.choices.map((_, i) => i === this.lockedIndex && !!this.lock?.hidden);
    this.visible = true;
  }

  /**
   * 选它。强化卡**原地改场上那件**(词缀引擎持同一引用)且不重复登记图鉴 —— 与商店的强化钮同口径;
   * 新卡要有空槽,入场即登记图鉴。带走锁定卡时把锁定一并清掉(它已经兑现了)。
   */
  pick(i: number): LevelUpPick {
    const c = this.choices[i];
    if (!this.visible || !c) return { ok: false, reason: "missing" };
    if (c.kind === "upgrade") {
      const live = this.w.equipment.find((e) => e.id === c.sourceId);
      if (!live) return { ok: false, reason: "missing" };
      upgradeEquipment(live);
      this.closeWith(c);
      return { ok: true, kind: "upgrade", eq: live };
    }
    if (this.freeSlots() <= 0) return { ok: false, reason: "slots" };
    this.w.equipment.push(c.eq);
    this.w.recordEquipment(c.eq);
    this.closeWith(c);
    return { ok: true, kind: "equip", eq: c.eq };
  }

  /**
   * 单卡重随(需求 F9 的主体):花局内金币换这一格的触发器 + 修饰器,效果/品质/等级不变。
   * 两支守卫都在扣钱之前 —— 锁定卡不进重随池、金币不足时**一个状态都不改**(不扣钱、不重随、
   * 不动阶梯与保底计数)。价格与隐藏概率/保底全在表里,本函数只递计数。
   */
  reroll(i: number): boolean {
    if (!this.canReroll(i)) return false;
    const cost = this.rerollCost();
    this.w.setGold(this.w.gold() - cost);
    const res = rerollCard(this.choices[i].eq, { roll: this.rand, hiddenDryStreak: this.hiddenDry, setId: this.w.selectedSet() });
    this.rerolls += 1;
    this.hiddenDry = res.hidden ? 0 : this.hiddenDry + 1;
    this.hiddenHit[i] = res.hidden;
    return true;
  }

  /** 锁定 / 解锁这一格(上限读表;换锁就是把上一格释放掉,于是恒 ≤ 上限) */
  toggleLock(i: number): boolean {
    if (!this.canLock(i)) return false;
    if (this.lockedIndex === i) {
      this.lock = null;
      this.lockedIndex = -1;
      return true;
    }
    this.lock = { choice: this.choices[i], hidden: !!this.hiddenHit[i] };
    this.lockedIndex = i;
    return true;
  }

  /** 本局开始:清锁定、清两支计数(锁定是"本局内跨弹层记忆",不跨局) */
  resetRun(): void {
    this.lock = null;
    this.lockedIndex = -1;
    this.rerolls = 0;
    this.hiddenDry = 0;
    this.chapterSeen = 0;
    this.choices = [];
    this.hiddenHit = [];
    this.visible = false;
  }

  private closeWith(picked: Choice): void {
    if (this.lock && this.lock.choice === picked) this.lock = null;
    this.lockedIndex = -1;
    this.choices = [];
    this.hiddenHit = [];
    this.visible = false;
  }

  /* ================= 几何与文案 ================= */

  /** 一帧几何(转调共享层单一出口;本文件不算任何矩形,宽高由宿主给) */
  layout(w: number, screenH: number): LevelUpLayout {
    return levelUpScreenLayout(w, screenH);
  }

  /** 一屏文案(卡序与 `layout().cards` 逐位对齐) */
  content(): LevelUpContent {
    const cost = this.rerollCost();
    return {
      title: LV_TEXT.title,
      readoutText: `金币 ${this.w.gold()} · 重随 ${cost} 金 · 隐藏保底 ${Math.min(this.hiddenDry, REROLL_HIDDEN.pity)}/${REROLL_HIDDEN.pity}`,
      hint: LV_TEXT.hint,
      cards: this.choices.map((c, i) => this.cardContent(c, i, cost)),
    };
  }

  private cardContent(c: Choice, i: number, cost: number): LevelUpCardContent {
    const eq = c.eq;
    const hidden = !!this.hiddenHit[i];
    // 命中隐藏词条 → 整张卡改走隐藏档的色与框(quality 主表的 hidden 档,不在此另写一份色值)
    const q = qualityDef(hidden ? "hidden" : eq.quality);
    const locked = this.lockedIndex === i;
    const source = c.kind === "upgrade" ? this.w.equipment.find((e) => e.id === c.sourceId) ?? null : null;
    return {
      kind: c.kind,
      nameText: eq.name,
      qualityText: `${qualityDef(eq.quality).name} · Lv.${eq.level}`,
      color: q.color,
      frameKey: `frame_${q.key}`,
      hidden,
      descLines: levelUpDescLines(equipmentDescription(eq), LV_DESC_CHARS, LV_DESC_MAX_LINES),
      deltaText: levelUpDeltaText(source, eq),
      tagText: hidden ? LV_TEXT.tagHidden : locked ? LV_TEXT.tagLocked : c.kind === "upgrade" ? LV_TEXT.tagUpgrade : LV_TEXT.tagNew,
      pickText: LV_TEXT.pick,
      pickEnabled: this.canPick(i),
      rerollText: `${LV_TEXT.rerollPrefix}${cost}${LV_TEXT.rerollSuffix}`,
      rerollEnabled: this.canReroll(i),
      lockText: locked ? LV_TEXT.lockOff : LV_TEXT.lockOn,
      lockEnabled: this.canLock(i),
      locked,
    };
  }
}

/**
 * 命中判定:先按卡序、卡内按 选它 → 重随 → 锁定 三枚钮,九片矩形互不相交
 * (三张卡横向留 12 的缝、卡内三枚钮纵向留 6 的缝),**九片之外一律 `null`**。
 * `null` 在本件的语义与二次确认弹层同款 —— 不是"交给下一层"而是"吞掉、什么都不做":
 * 宿主视图那张整屏 Capture 对每一下都停止事件传播,弹层开着时战斗屏的摇杆收不到触摸。
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
