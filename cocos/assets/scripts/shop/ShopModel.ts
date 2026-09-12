/**
 * 章间商店的**状态机与文案构建**(纯逻辑,cc-free)。
 *
 * 分工对标 Web `src/game.ts`:共享层 `game/systems/battleWorld.ts` 明确不管"商店货品生成",
 * 所以进货 / 价目 / 购买 / 刷新 / 槽位 / 销毁 / 进化这套账本来都只在宿主侧。
 * 本文件把它写成 cc-free 的类,于是 node 侧能直接测,而 `shop/ShopView.ts` 只负责摆节点。
 *
 * 三条纪律:
 *  ① 几何一律问 `game/ui/shop.ts:shopLayoutPure()`,行数由实际武器/可进化组数给出,
 *     本文件不产任何矩形(顶缘底缘由共享层保证恒 64/948);
 *  ② 价格与曲线全部走共享规范表(`game/data/shop.ts` + `quality` 主表),这里只调用;
 *  ③ 随机数是注入的(`rand`),所以"售罄制 + 套组偏向 + 同款补位"三条链路可复现地测。
 */

import { SHOP_ROW_BOTTOM, shopLayoutPure, type ShopLayoutPure, type ShopRect, type ShopToolBtn } from "../game/ui/shop";
import {
  SHOP_SLOT_CAP,
  UPGRADE_MAIN_KEYS,
  canUpgrade,
  generateEquipment,
  generateSetEquipment,
  qualityBasePrice,
  thornPairOffer,
  upgradeCost,
  upgradeEquipment,
  type Equipment,
} from "../game/data/equipmentGen";
import { DESTROY_REFUND_RATE, DUPLICATE_OFFER_CHANCE, MERGE_FEE_MULT, RUN_AD_SLOT_LIMIT, SET_OFFER_BIAS, shopCardPrice, shopRefreshPrice } from "../game/data/shop";
import { QUALITY_MAX_LEVEL, qualityDef, qualityPowerRatio, qualityUpgrade, type Quality } from "../game/data/quality";
import { isSetPiece, setDef } from "../game/data/sets";
import type { SetId } from "../game/data/sets";
import { isSeasonBoosted, setMutation } from "../game/data/seasonSets";
import { rareBonusFor } from "../game/data/talents";
import type { TalentId } from "../game/data/talents";
import { chapterIntel } from "../game/data/intel";

/** 商店三张卡位(售罄后为 null;只有刷新才有新货) */
export const SHOP_CARD_SLOTS = 3;

/** 宿主注入的战场侧账本(BattleSim 与 BattleWorld 的窄切片;装备数组按引用原地改) */
export interface ShopWorld {
  /** 玩家场上装备(原地 push/splice,不重新赋值 —— 词缀引擎持有同一引用) */
  readonly equipment: Equipment[];
  gold(): number;
  setGold(v: number): void;
  slots(): number;
  /** 本局已购的额外槽位数(= Web player.runSlotBonus;槽位扩展价按它递增) */
  runSlotBonus(): number;
  addRunSlot(): void;
  chapter(): number;
  seasonId(): number;
  highestStage(): number;
  selectedSet(): SetId | null;
  ownedTalents(): readonly TalentId[];
  totalBought(): number;
  addTotalBought(): void;
  recordEquipment(eq: Equipment): void;
  /** 卡牌类型键(效果 + 品质):"同款"的唯一判据,复用共享层 BattleWorld.cardTypeKey */
  cardTypeKey(eq: Equipment): string;
  /** 可进化卡组(≥2 张同效果同品质);直接复用共享层的判定,不在本文件重算 */
  mergeGroups(): readonly MergeGroup[];
}

/** 共享层 `BattleWorld.mergeGroups()` 的返回形态(在此重述以便 cc-free 引用) */
export interface MergeGroup {
  name: string;
  quality: Quality;
  count: number;
  sample: Equipment;
}

/* ---------- 视图消费的文案(几何不在这里,只有"这一格写什么") ---------- */

export interface ShopToolView {
  id: ShopToolBtn["id"];
  text: string;
  enabled: boolean;
  /** danger = 重开/主页(破坏性操作,Web 走 dangerButton) */
  kind: "minor" | "danger";
}

export interface ShopCardView {
  soldOut: boolean;
  name: string;
  qualityName: string;
  color: string;
  /** 品质卡框贴图键 `frame_<品质>`;空串 = 无品质(售罄),视图走代码描边回退 */
  frameKey: string;
  /** 效果图标键;null = 视图走品质色圆底 + 效果首字回退 */
  iconKey: string | null;
  sub: string;
  priceText: string;
  afford: boolean;
  /** 属于出战套组时的角标文案(Web:套组名前三字) */
  setBadge: string | null;
  setBadgeColor: string | null;
}

export interface ShopWeaponView {
  id: number;
  name: string;
  sub: string;
  color: string;
  iconKey: string | null;
  selected: boolean;
  destroyText: string;
  /** 销毁可回收的金币数(文案已含在 destroyText 里,此项供测试与提示复用) */
  refund: number;
  /** 行内强化钮文案:含价格与"强化后主数值"预览(变化要一眼看见,不靠玩家自己算) */
  upgradeText: string;
  /** 强化所需金币(取自共享层 upgradeCost;不可强化时为 0) */
  upgradeCost: number;
  /** 是否还能强化(未达该品质的等级上限) */
  canUpgrade: boolean;
  /** 金币是否够这一次强化 */
  affordUpgrade: boolean;
}

export interface ShopMergeView {
  name: string;
  feeText: string;
  color: string;
  fullSet: boolean;
  fee: number;
}

export interface ShopContent {
  /** 顶信息条(与战斗顶坞同骨架):左标题 / 右金币 / 敌情 / 槽位 / 套组链 / 卡价提示 */
  titleText: string;
  goldText: string;
  intelText: string;
  intelIconKey: string | null;
  slotText: string;
  setText: string | null;
  setProgress: number;
  /** 出战套组主色(套组链与进度胶囊同色);null = 未选套组 */
  setColor: string | null;
  bonusText: string | null;
  recText: string;
  priceHint: string;
  tools: ShopToolView[];
  cards: ShopCardView[];
  slotBtn: { text: string; enabled: boolean };
  weaponHeader: { title: string; right: string };
  weapons: ShopWeaponView[];
  /** 空态文案(0 件武器时的占位行;null = 有货,不画空态) */
  weaponEmpty: string | null;
  mergeHeaderTitle: string;
  merges: ShopMergeView[];
  mergeEmpty: string | null;
  nextIntelText: string;
  nextRecText: string;
  /** 下一章推荐套组的主色;无推荐 = null */
  nextRecColor: string | null;
  nextText: string;
}

/** 敌情图标键(与 Web drawShop/HUD 的 intelIcon 同一张映射) */
const INTEL_ICON: Record<string, string> = { 尸潮: "intel_horde", 重甲: "intel_armor", 异变: "intel_mutant", 精英: "intel_elite" };

/** 商店工具钮的固定语义(顺序与 shopLayoutPure 的 toolBtns 同) */
const TOOL_DEFS: { id: ShopToolBtn["id"]; kind: "minor" | "danger" }[] = [
  { id: "refresh", kind: "minor" },
  { id: "fusion", kind: "minor" },
  { id: "restart", kind: "danger" },
  { id: "home", kind: "danger" },
];

/** 命中矩形助手(视图与测试同读) */
export const rectHit = (r: ShopRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 内容带底缘(= 末行销毁/进化行的下限,几何由共享层保证) */
export const SHOP_CONTENT_BOTTOM = SHOP_ROW_BOTTOM;

/** 一次点击落到的商店热区 */
export type ShopAction =
  | { kind: "tool"; id: ShopToolBtn["id"] }
  | { kind: "slot" }
  | { kind: "card"; index: number }
  | { kind: "weapon"; id: number }
  | { kind: "destroy"; id: number }
  | { kind: "upgrade"; id: number }
  | { kind: "merge"; sample: Equipment }
  | { kind: "next" };

export class ShopModel {
  private w: ShopWorld;
  private rand: () => number;
  /** 三张可购卡(null = 该位已售罄) */
  offers: (Equipment | null)[] = [];
  /** 本章已手动刷新次数(进店清零,成本按指数抬升) */
  refreshes = 0;
  /** 武器管理里点选的那件(仅影响选中框与文案,不改战场) */
  selectedWeaponId: number | null = null;
  /** v4「深渊铭刻」版式(宿主按 viewTable.phase3.shopV4 打开;draw 与 hitTest 共读本开关) */
  v4 = false;

  constructor(world: ShopWorld, rand: () => number = Math.random) {
    this.w = world;
    this.rand = rand;
  }

  /* ================= 账本查询 ================= */

  /** 商店卡等级:局内章节 + 已解锁最高关卡(数值墙:通关越后面,解锁越高级装备) */
  cardLevel(): number {
    return Math.max(this.w.chapter() + 1, this.w.highestStage());
  }

  priceOf(eq: Equipment): number {
    return shopCardPrice(qualityBasePrice(eq.quality), this.w.totalBought(), this.w.chapter());
  }

  refreshCost(): number {
    return shopRefreshPrice(this.w.chapter(), this.refreshes);
  }

  /** 本局还能用广告开几个槽:受"局上限"与"总槽上限"双重钳制 */
  adSlotLeft(): number {
    return Math.max(0, Math.min(RUN_AD_SLOT_LIMIT - this.w.runSlotBonus(), SHOP_SLOT_CAP - this.w.slots()));
  }

  /** 槽位是否已到总上限(到了就与广告无关,纯没地方放) */
  slotMaxed(): boolean {
    return this.w.slots() >= SHOP_SLOT_CAP;
  }

  /** 场上武器行(≤8 件,与 shopLayoutPure 的行数上限同口径) */
  weapons(): Equipment[] {
    return this.w.equipment.slice(0, 8);
  }

  merges(): readonly MergeGroup[] {
    return this.w.mergeGroups();
  }

  /** 纯几何 + 身份:行数由实际持有量决定,纵向由本帧逻辑屏高决定,视图只按数组落位 */
  layout(screenH?: number): ShopLayoutPure {
    return shopLayoutPure(this.weapons().length, this.merges().length, screenH, this.v4 ? { v4: true, slotCount: this.w.slots() } : undefined);
  }

  /* ================= 操作 ================= */

  /** 进入商店:刷三张货 + 复位本章刷新阶梯 + 清选中(对标 Web openShop) */
  open(): void {
    this.refreshes = 0;
    this.selectedWeaponId = null;
    this.rollOffers();
  }

  /** 生成三张卡:套组偏向 → 词缀鉴赏保底稀有 → 荆棘配对 → 概率刷已有同款(便于凑 3 张升品) */
  rollOffers(): void {
    const rareBonus = rareBonusFor(this.w.ownedTalents());
    const level = this.cardLevel();
    const setId = this.w.selectedSet();
    const modBias = setId ? setMutation(this.w.seasonId(), setId)?.modifierBias : undefined;
    const bias = setId && isSeasonBoosted(this.w.seasonId(), setId) ? SET_OFFER_BIAS.seasonBoosted : SET_OFFER_BIAS.normal;
    const offers: Equipment[] = [];
    for (let i = 0; i < SHOP_CARD_SLOTS; i++) {
      offers.push(setId && this.rand() < bias ? generateSetEquipment(setId, level, rareBonus, modBias) : generateEquipment(level, undefined, false, rareBonus));
    }
    if (this.w.ownedTalents().includes("affix_taste") && !offers.some((o) => o.quality !== "common")) {
      offers[0] = generateEquipment(level, "rare");
    }
    const pair = thornPairOffer(this.w.equipment, level);
    if (pair) offers[0] = pair;
    if (this.w.equipment.length > 0 && this.rand() < DUPLICATE_OFFER_CHANCE) {
      const src = this.w.equipment[Math.floor(this.rand() * this.w.equipment.length)];
      offers[1] = cloneAsOffer(src, -(this.w.chapter() * 100 + 1));
    }
    this.offers = offers;
  }

  /** 手动刷新(售罄制):金币换三张新卡,成本随本章已刷次数指数抬升 */
  refresh(): boolean {
    const cost = this.refreshCost();
    if (this.w.gold() < cost) return false;
    this.w.setGold(this.w.gold() - cost);
    this.refreshes += 1;
    this.rollOffers();
    return true;
  }

  /** 购买卡牌:金币扣减、嵌入槽位、该卡位转售罄 */
  buy(index: number): boolean {
    const eq = this.offers[index];
    if (!eq) return false;
    const price = this.priceOf(eq);
    if (this.w.gold() < price) return false;
    if (this.freeSlots() <= 0) return false;
    this.w.setGold(this.w.gold() - price);
    this.w.equipment.push(eq);
    this.w.addTotalBought();
    this.w.recordEquipment(eq);
    this.offers[index] = null;
    return true;
  }

  /** 空槽数:总槽位 − 场上件数(Web 侧 player.freeSlots 的同一算式) */
  freeSlots(): number {
    return Math.max(0, this.w.slots() - this.w.equipment.length);
  }

  /**
   * 广告开槽的**入账半边**:宿主看完广告后回调本方法,它只在两个上限内加一格。
   * 模型不碰广告也不碰金币 —— 广告走宿主侧唯一的 `watchAd` 闸门(见 GameShell),
   * 广告没看完 / 无库存时宿主就不调本方法,槽位不落地、也**不回退成金币价**(避免同一格出现两种价)。
   */
  grantSlotByAd(): boolean {
    if (this.adSlotLeft() <= 0) return false;
    this.w.addRunSlot();
    return true;
  }

  /** 销毁武器:释放槽位,按品质基础价回收一半金币 */
  destroy(id: number): boolean {
    const idx = this.w.equipment.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const eq = this.w.equipment[idx];
    this.w.setGold(this.w.gold() + Math.round(qualityBasePrice(eq.quality) * DESTROY_REFUND_RATE));
    this.w.equipment.splice(idx, 1);
    if (this.selectedWeaponId === id) this.selectedWeaponId = null;
    return true;
  }

  /**
   * 场内强化(金币深出口):等级 +1,数值按共享层成长系数放大。
   * 价格与上限都问共享层(`upgradeCost` / `canUpgrade`),本文件不算任何强化数值。
   * 原地改数组里那个对象 —— 词缀引擎持同一引用,与 `merge` 同纪律,不重新赋值。
   * 不调 `recordEquipment`:等级提升不产生新的卡牌身份(那件在购入时已登记图鉴);`merge` 要调是因为品质变了。
   */
  upgradeWeapon(id: number): boolean {
    const eq = this.w.equipment.find((e) => e.id === id);
    if (!eq || !canUpgrade(eq)) return false;
    const cost = upgradeCost(eq);
    if (this.w.gold() < cost) return false;
    this.w.setGold(this.w.gold() - cost);
    upgradeEquipment(eq);
    return true;
  }

  /** 点选武器行(再点取消);只影响选中框 */
  selectWeapon(id: number): void {
    this.selectedWeaponId = this.selectedWeaponId === id ? null : id;
  }

  /**
   * 进化(形态变化):2 张同效果同品质 → 升一档品质。3 张免费,2 张付品质基础价 ×2 补位费。
   * 保留修饰器最多的那张,其余原地 splice 摘除(不重新赋值数组 —— 引擎持同一引用)。
   */
  merge(sample: Equipment): boolean {
    const pool = this.w.equipment;
    const key = this.w.cardTypeKey(sample);
    const same = pool.filter((x) => this.w.cardTypeKey(x) === key);
    if (same.length < 2) return false;
    const upgrade = qualityUpgrade(sample.quality);
    if (!upgrade) return false;
    const fullSet = same.length >= 3;
    if (!fullSet) {
      const fee = qualityBasePrice(sample.quality) * MERGE_FEE_MULT;
      if (this.w.gold() < fee) return false;
      this.w.setGold(this.w.gold() - fee);
    }
    const keep = [...same].sort((a, b) => b.modifiers.length - a.modifiers.length)[0];
    const removeCount = fullSet ? 2 : 1;
    const removeIds = new Set(same.filter((x) => x.id !== keep.id).slice(0, removeCount).map((x) => x.id));
    keep.quality = upgrade;
    const ratio = qualityPowerRatio(sample.quality, upgrade);
    const p = keep.effect.params as unknown as Record<string, unknown>;
    for (const k of ["damage", "dps", "heal", "amount"] as const) {
      const v = p[k];
      if (typeof v === "number") p[k] = Math.round(v * ratio);
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      if (removeIds.has(pool[i].id)) pool.splice(i, 1);
    }
    this.w.recordEquipment(keep);
    return true;
  }

  /* ================= 点击判定 ================= */

  /**
   * 热区顺序对标 Web `onShopClick`:工具钮 → 槽位 → 三卡 → 武器行 → 进化 → 下一章。
   * 武器行内优先级:强化 > 销毁 > 整行点选。强化钮是本批新增的场内出口,Web 冻结基准里没有对应物,
   * 其余顺序与 Web 一致。空态占位行不产热区(没有可操作的武器)。
   */
  hitTest(x: number, y: number, screenH?: number): ShopAction | null {
    const L = this.layout(screenH);
    for (const b of L.toolBtns) {
      if (rectHit(b, x, y)) return { kind: "tool", id: b.id };
    }
    if (rectHit(L.slotBtn, x, y)) return { kind: "slot" };
    for (let i = 0; i < L.cards.length; i++) {
      if (rectHit(L.cards[i], x, y)) return { kind: "card", index: i };
    }
    const eqs = this.weapons();
    for (let i = 0; i < eqs.length; i++) {
      const r = L.weaponRows[i];
      if (!r || !rectHit(r, x, y)) continue;
      const u = L.upgradeRects[i];
      if (u && rectHit(u, x, y)) return { kind: "upgrade", id: eqs[i].id };
      const d = L.destroyRects[i];
      if (d && rectHit(d, x, y)) return { kind: "destroy", id: eqs[i].id };
      return { kind: "weapon", id: eqs[i].id };
    }
    const groups = this.merges();
    for (let i = 0; i < groups.length; i++) {
      const r = L.merges[i];
      if (r && rectHit(r, x, y)) return { kind: "merge", sample: groups[i].sample };
    }
    if (rectHit(L.nextBtn, x, y)) return { kind: "next" };
    return null;
  }

  /* ================= 文案构建(视图只读这里,不再算字符串) ================= */

  content(): ShopContent {
    const w = this.w;
    const eqs = this.weapons();
    const gold = w.gold();
    const intel = chapterIntel(w.chapter(), w.seasonId());
    const iconKey = INTEL_ICON[intel.title] ?? null;
    const setId = w.selectedSet();
    const set = setId ? setDef(setId) : null;
    const pieces = set ? eqs.filter((e) => isSetPiece(e, set.id)).length : 0;
    const slotMaxed = w.slots() >= SHOP_SLOT_CAP;
    const tools: ShopToolView[] = TOOL_DEFS.map((t) => ({
      id: t.id,
      kind: t.kind,
      text: t.id === "refresh" ? `刷新 ${this.refreshCost()}金` : t.id === "fusion" ? "融合" : t.id === "restart" ? "重开" : "主页",
      enabled: t.id === "refresh" ? gold >= this.refreshCost() : t.id === "fusion" ? eqs.length >= 2 : true,
    }));

    const cards: ShopCardView[] = [];
    for (let i = 0; i < SHOP_CARD_SLOTS; i++) {
      const eq = this.offers[i];
      if (!eq) {
        cards.push({ soldOut: true, name: "售 罄", qualityName: "", color: "#3a465c", frameKey: "", iconKey: null, sub: "点「刷新」补货", priceText: "", afford: false, setBadge: null, setBadgeColor: null });
        continue;
      }
      const q = qualityDef(eq.quality);
      const price = this.priceOf(eq);
      const trig = eq.triggers.map((t) => t.def.name).join("/");
      const mod = eq.modifiers.map((m) => m.def.name).join("/");
      cards.push({
        soldOut: false,
        name: eq.effect.def.name,
        qualityName: q.name,
        color: q.color,
        frameKey: `frame_${eq.quality}`,
        iconKey: `icon_fx_${eq.effect.def.type}`,
        sub: `${trig}${mod ? "·" + mod : ""}`,
        priceText: gold >= price && this.freeSlots() > 0 ? `购买 ${price}金` : `¥${price}`,
        afford: gold >= price && this.freeSlots() > 0,
        setBadge: setId && isSetPiece(eq, setId) ? setDef(setId).name.slice(0, 3) : null,
        setBadgeColor: setId && isSetPiece(eq, setId) ? setDef(setId).color : null,
      });
    }

    const next = chapterIntel(w.chapter() + 1, w.seasonId());
    const rec = next.recommended ? setDef(next.recommended) : null;
    return {
      titleText: "章间商店",
      goldText: String(gold),
      intelText: `第 ${w.chapter()} 章 · 敌情:${intel.title}(${intel.desc})`,
      intelIconKey: iconKey,
      slotText: `槽位 ${this.w.equipment.length}/${w.slots()}`,
      setText: set ? `套组:${set.name} ${pieces}/4` : null,
      setProgress: pieces / 6,
      setColor: set ? set.color : null,
      bonusText: set ? `3件·${set.bonus3.name} / 6件·${set.bonus6.name}` : null,
      recText: set ? "" : `未选套组(通用卡池)${intel.recommended ? ` · 推荐:${setDef(intel.recommended).name}` : ""}`,
      priceHint: "卡价随购买递增",
      tools,
      cards,
      slotBtn: {
        text: slotMaxed
          ? `槽位已满 ${w.slots()}/${SHOP_SLOT_CAP}`
          : this.adSlotLeft() > 0
            ? `看广告开槽 → ${w.slots() + 1}(本局剩 ${this.adSlotLeft()} 次)`
            : `本局广告开槽已用完(${RUN_AD_SLOT_LIMIT}/${RUN_AD_SLOT_LIMIT})`,
        // 不再看金币:这颗钮已经不走金币通道,金币不足不该让它变灰
        enabled: !slotMaxed && this.adSlotLeft() > 0,
      },
      weaponHeader: { title: "武器管理(点选 · 强化 · 销毁)", right: this.freeSlots() > 0 ? `空槽 ${this.freeSlots()}` : "槽已满,销毁武器腾槽" },
      weapons: eqs.map((eq) => {
        const q = qualityDef(eq.quality);
        const maxLv = QUALITY_MAX_LEVEL[eq.quality];
        const upgradable = canUpgrade(eq);
        const cost = upgradable ? upgradeCost(eq) : 0;
        // 强化后的主数值:复制一份走共享层同一函数,本文件不重算成长系数
        const preview = upgradable ? upgradeEquipment(cloneAsOffer(eq, -1)) : null;
        const now = upgradable ? mainValueOf(eq) : null;
        const next = preview ? mainValueOf(preview) : null;
        return {
          id: eq.id,
          name: eq.effect.def.name + (this.selectedWeaponId === eq.id ? " ✓" : ""),
          sub: `${q.name} · ${eq.level >= maxLv ? `Lv.${eq.level} 满` : `Lv.${eq.level}/${maxLv}`}`,
          color: this.selectedWeaponId === eq.id ? "#5AC8FA" : q.color,
          iconKey: `icon_fx_${eq.effect.def.type}`,
          selected: this.selectedWeaponId === eq.id,
          destroyText: "销毁",
          refund: Math.round(qualityBasePrice(eq.quality) * DESTROY_REFUND_RATE),
          upgradeText: !upgradable ? "已满级" : now != null && next != null ? `${now}→${next} · ${cost}金` : `强化 ${cost}金`,
          upgradeCost: cost,
          canUpgrade: upgradable,
          affordUpgrade: upgradable && gold >= cost,
        };
      }),
      weaponEmpty: eqs.length === 0 ? "还没有武器,先从商店购买吧" : null,
      mergeHeaderTitle: "进化(2 张同款 → 升档;3 张免费)",
      merges: this.merges().map((g) => {
        const q = qualityDef(g.quality);
        const fullSet = g.count >= 3;
        const fee = fullSet ? 0 : qualityBasePrice(g.quality) * MERGE_FEE_MULT;
        return { name: `${g.name} ×${g.count}`, feeText: fullSet ? "免费升品" : `升品 ${fee}金`, color: q.color, fullSet, fee };
      }),
      mergeEmpty: this.merges().length === 0 ? "暂无可进化的卡(需 2 张同效果同品质)" : null,
      nextIntelText: `下一章敌情:${next.title}(${next.desc})`,
      nextRecText: rec ? `推荐套组:${rec.name}(${rec.desc})` : "无特别克制,通用构筑即可",
      nextRecColor: rec ? rec.color : null,
      nextText: `▶ 开始第 ${w.chapter() + 1} 章`,
    };
  }
}

/** 展示用主数值:按共享层的键序取第一个存在的数值(伤害/秒伤/治疗/护盾);无则 null */
function mainValueOf(eq: Equipment): number | null {
  const p = eq.effect.params as unknown as Record<string, unknown>;
  for (const k of UPGRADE_MAIN_KEYS) {
    const v = p[k];
    if (typeof v === "number") return v;
  }
  return null;
}

/** 把已持有的卡复制成一份商店货(同款补位援助):新的负 id,避免与场上件撞号 */
function cloneAsOffer(src: Equipment, id: number): Equipment {
  return {
    id,
    level: src.level,
    quality: src.quality,
    name: src.name,
    triggers: src.triggers.map((t) => ({ def: t.def, params: { ...t.params } })),
    effect: { def: src.effect.def, params: { ...src.effect.params }, level: src.effect.level },
    modifiers: src.modifiers.map((m) => ({ def: m.def, params: { ...m.params } })),
  };
}
