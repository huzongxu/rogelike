/**
 * 扭蛋机屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawGacha`
 * 的文案侧(3562-3702)、`doGacha` / `doGachaAd`(3490-3524)与 `onGachaClick`(3704-3742)
 * 的分支侧抽取。
 *
 * 分工与前四屏同构:几何一律问共享层 `game/ui/gachaLayout.ts`,本文件只产
 * "每处写什么文本、哪枚钮可点、这一抽该往存档写什么",外加命中判定与**写入意图**。
 * 颜色档不在这里 —— 与已落地四屏同一处置,取表(`core/ViewTable.ts` 的 `phase4` 段,键前缀 `gc`)。
 *
 * 三条纪律:
 *  ① 数值规则一律走共享层既有函数(`drawGacha` / `drawGacha10` / `GACHA_COST` /
 *     `GACHA_10_COST` / `DIAMOND_TICKET_COST` / `GACHA_EQUIPMENT_BASE_LEVEL` /
 *     `collectionBonus` / `qualityDef`),本文件不复制判据、不重写保底与重复判定;
 *  ② **本文件不写存档**:`gachaClaim()` 只返回一份增量描述,真正落字段与 `persist()`
 *     由宿主 `GameShell` 做,激励视频也只在宿主那一侧发起;
 *  ③ 随机是入参:`drawGacha` / `drawGacha10` 的第四个形参 `roll` 由本文件透传,
 *     默认 `Math.random`,于是一发十连可以在 node 侧钉死重放。
 *
 * 六条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **行以 `id` 为键**:内容层与命中层都按 `row.id` 回 `ownedGear` 里 `find`,
 *     id 重复时永远命中第一条匹配(与 Web `drawGacha` 的 `find` 与 `onGachaClick` 的
 *     `selectedGearId = r.id` 同式);`find` 落空那一行 Web 是 `continue`,本层给 null。
 *  2. **保底上限 10 与 50 在绘制侧是字面量**(标签 `史诗保底 n/10`、进度比 `n / 10`),
 *     真正的保底阈值住在共享层 `game/data/gacha.ts`(`EPIC_PITY` / `LEGENDARY_PITY`,
 *     默认 `GACHA_EPIC_PITY = 10` / `GACHA_LEGENDARY_PITY = 50`,可被 balance.json 的
 *     `gacha` 段覆盖)。这里照抄字面量,由 `tests/cocos-phase4-gacha.test.ts` 同时锁住
 *     `EPIC_PITY === 10`、`LEGENDARY_PITY === 50` 与"本串 === 由这两个常量插值出来的同一串"。
 *  3. **`pity` 是按引用改的**:Web 先拷 `{ pityEpic, pityLegendary }` 进局部对象、调
 *     `drawGacha*` 再把两值写回存档。本层同构 —— 交给共享层的是一次性拷贝,
 *     存档对象本身在模型里从不被写(测试用 `deepFreeze` 守这条)。
 *  4. **十连的重复判定只看抽之前的收藏**:`drawGacha10` 内部逐件查 `owned`,而新装备
 *     在整抽结束后才 push —— 于一发十连里同名的两件都算"不重复"、都进收藏。
 *     本层把结果汇总成 `newGear` 交回宿主按序 push,同一性质原样保留。
 *  5. **禁用态仍返回动作**:券不足 / 广告已用 / 钻石不足时,命中层照样给出动作,
 *     静默发生在 `gachaClaim` 的守卫里(全部落在扣费之前),与 Web 的 `doGacha` 内
 *     `return`、`if (dailyGachaAdUsed) return`、`if (diamond < COST) return` 同分层。
 *  6. **一次广告抽落两次盘**:广告抽的落账自己就 `persist` 一次,宿主在置上
 *     `dailyGachaAdUsed` 之后又落一次 —— 本层用 `markAdUsed` 把第二步显式交给宿主,
 *     不做合并(`watchAd` 自身为 `adWatchCount` / 钻石那笔还另落一次,与 Web 同数)。
 *
 * 另两条与本屏有关、但落在别处的事实:
 *  - 抽卡产出的新装备要进**词缀图鉴**(Web `recordEquipment`):Cocos 侧的对应物是
 *    `BattleSim.recordEquipment`,已经由 `sim.world.recordEquipment(eq)` 这条口暴露
 *    (章间商店与通关掉落都走它),故宿主落账时逐件调它,本层只把 `newGear` 交出去;
 *  - 收藏加成串走共享层 `collectionBonus(ownedGear)` 的**单实参**口径 —— 不传
 *    `gearLevels`,于是这一串不反映装备升级后的贡献,与 Web 的 `drawGacha` 同式
 *    (两个百分数也不经 `toFixed`,原样是浮点拼接)。
 */

import { GACHA_10_COST, GACHA_COST, drawGacha, drawGacha10, type GachaResult } from "../game/data/gacha";
import { DIAMOND_TICKET_COST, collectionBonus } from "../game/data/daily";
import { GACHA_EQUIPMENT_BASE_LEVEL, qualityDef } from "../game/data/quality";
import type { Equipment } from "../game/data/equipmentGen";
import { GC_RES_MAX, type GachaLayout, type GcRect } from "../game/ui/gachaLayout";

/** 本屏要读的存档字段(SaveModel 结构上天然兼容);`gachaResults` 是宿主持有的瞬时态,不在这里 */
export interface GachaSaveView {
  gachaTicket: number;
  gachaPityEpic: number;
  gachaPityLegendary: number;
  dailyGachaAdUsed: boolean;
  diamond: number;
  /** 扭蛋装备等级随关卡进度成长,基准就是这一个字段 */
  highestStage: number;
  ownedGear: readonly Equipment[];
  selectedGearId: number | null;
}

/** 一行最近抽取(最多 5 条):名字走品质色,重复那一档另给右对齐的一串 */
export interface GachaRecentContent {
  name: string;
  /** 品质色(`qualityDef(r.eq.quality).color`):Web 的名字与品质色同源 */
  color: string;
  /** `重复→星尘+N`(Web 的 `r.duplicate` 档);非重复为 null(那一笔不画) */
  dupText: string | null;
}

/** 一行收藏装备 */
export interface GachaRowContent {
  /** 行键(= `layout.rows[i].id`) */
  id: number;
  name: string;
  color: string;
  /** `Lv.等级 品质名`(Web 把 level 与 `qualityDef(q).name` 拼在同一串里,固定偏移起笔) */
  levelText: string;
  /** `selectedGearId === 本行 id`:决定底板档与「带入中」 */
  selected: boolean;
}

/** 一屏文案 */
export interface GachaContent {
  title: string;
  /** `扭蛋券 ${n}`(Web iconText 的文字部分;替代字形「✦」由视图在缺图档前置) */
  ticketText: string;
  backText: string;
  singleText: string;
  tenText: string;
  /** `广告免费抽` / `今日广告抽已用` —— 两档由 `canAd` 决定 */
  adText: string;
  /** `钻石换扭蛋券(${COST}◆ = 1券 · 持有 ${n}◆)`,COST 取共享层 `DIAMOND_TICKET_COST` */
  swapText: string;
  /** `史诗保底 ${n}/10` —— 分母是 Web 绘制侧的字面量,见文件头口径 2 */
  pityEpicText: string;
  /** `传奇保底 ${n}/50` —— 同上 */
  pityLegendText: string;
  /** 两条进度条的 frac(Web 的 `pity / 10` 与 `pity / 50`,分母同样是字面量) */
  pityEpicFrac: number;
  pityLegendFrac: number;
  recentLabel: string;
  collLabel: string;
  /** `加成:攻+${atkPct}% 命+${hpPct}%` —— 两个百分数**不经 toFixed**,原样是浮点拼接 */
  bonusText: string;
  emptyText: string;
  /** 最近抽取的落位行数 = `min(recent.length, GC_RES_MAX)`(与 layout 的 nRes 同值) */
  nRes: number;
  recent: GachaRecentContent[];
  /** 与 `layout.rows` 逐位对齐;null = Web 的 find 落空那一支 */
  rows: (GachaRowContent | null)[];

  /* 四档门控:只决定底板与文字取哪一档,不参与命中(见文件头口径 5) */
  canSingle: boolean;
  canTen: boolean;
  canAd: boolean;
  canTicket: boolean;
}

/**
 * 一次点击落到的热区。顺序与 Web onGachaClick 逐项一致:
 * 返回 → 单抽 → 十连 → 广告抽 → 钻石换券 → 逐行切换带入;热区之外没有"其余一律"兜底。
 */
export type GachaAction =
  | { kind: "back" }
  | { kind: "single" }
  | { kind: "ten" }
  | { kind: "ad" }
  | { kind: "ticket" }
  | { kind: "select"; id: number };

/** 抽取意图:一次单抽 / 十连 / 广告抽的全部落账面 */
export interface GachaDrawClaim {
  kind: "draw";
  /** 广告抽走 `watchAd` 通道(宿主发起),落账在回调里;另两档 false */
  needsAd: boolean;
  /** 抽完要不要把 `dailyGachaAdUsed` 置真(只有广告抽这一档),并因此多落一次盘 */
  markAdUsed: boolean;
  /** 扣减的扭蛋券(Web 的 `save.gachaTicket -= cost`;广告抽为 0) */
  ticketCost: number;
  /** 保底计数的**目标值**(一次性拷贝被 `drawGacha*` 改过之后的两值) */
  pityEpic: number;
  pityLegendary: number;
  /** 新入收藏的装备:宿主按序 push 进 `ownedGear`,并逐件登记词缀图鉴 */
  newGear: Equipment[];
  /** 重复折算的星尘合计 */
  stardustGain: number;
  /** 瞬时态 `gachaResults` 的新值(`[...本次, ...旧].slice(0, 8)`;不入档) */
  recent: GachaResult[];
}

/** 钻石换券意图 */
export interface GachaTicketClaim {
  kind: "ticket";
  needsAd: false;
  markAdUsed: false;
  /** 扣减的钻石(= 共享层 `DIAMOND_TICKET_COST`) */
  diamondCost: number;
  /** 增加的券(Web 恒 +1) */
  ticketGain: number;
}

/** 切换开局带入意图(null = 取消带入) */
export interface GachaSelectClaim {
  kind: "select";
  needsAd: false;
  markAdUsed: false;
  /** Web 的 `selectedGearId === r.id ? null : r.id` */
  selectedGearId: number | null;
}

export type GachaClaim = GachaDrawClaim | GachaTicketClaim | GachaSelectClaim;

const inRect = (r: GcRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 扭蛋装备等级(Web `gachaLevel`:`GACHA_EQUIPMENT_BASE_LEVEL + (highestStage - 1)`) */
export function gachaLevel(highestStage: number): number {
  return GACHA_EQUIPMENT_BASE_LEVEL + (highestStage - 1);
}

/** 存档 + 瞬时最近结果 + 一帧几何 → 一屏文案(行序与限宽都与 layout 同源) */
export function buildGachaContent(save: GachaSaveView, recent: readonly GachaResult[], L: GachaLayout): GachaContent {
  const cb = collectionBonus(save.ownedGear);
  const nRes = Math.min(recent.length, GC_RES_MAX);
  return {
    title: "扭蛋机",
    ticketText: `扭蛋券 ${save.gachaTicket}`,
    backText: "返回",
    singleText: "单抽",
    tenText: "十连(保底史诗)",
    adText: save.dailyGachaAdUsed ? "今日广告抽已用" : "广告免费抽",
    swapText: `钻石换扭蛋券(${DIAMOND_TICKET_COST}◆ = 1券 · 持有 ${save.diamond}◆)`,
    pityEpicText: `史诗保底 ${save.gachaPityEpic}/10`,
    pityLegendText: `传奇保底 ${save.gachaPityLegendary}/50`,
    pityEpicFrac: save.gachaPityEpic / 10,
    pityLegendFrac: save.gachaPityLegendary / 50,
    recentLabel: "最近抽取:",
    collLabel: "永久收藏(点选开局带入)",
    bonusText: `加成:攻+${cb.atkPct}% 命+${cb.hpPct}%`,
    emptyText: "还没有收藏,先抽一发吧",
    nRes,
    recent: recent.slice(0, nRes).map((r) => ({
      name: r.eq.name,
      color: qualityDef(r.eq.quality).color,
      dupText: r.duplicate ? `重复→星尘+${r.stardust}` : null,
    })),
    rows: L.rows.map((row) => {
      // Web 的原样口径:行按 id 回 ownedGear 反查(id 重复时永远是第一条匹配),落空就跳过这一行
      const gear = save.ownedGear.find((g) => g.id === row.id);
      if (!gear) return null;
      const q = qualityDef(gear.quality);
      return {
        id: row.id,
        name: gear.name,
        color: q.color,
        levelText: `Lv.${gear.level} ${q.name}`,
        selected: save.selectedGearId === row.id,
      };
    }),
    canSingle: save.gachaTicket >= GACHA_COST,
    canTen: save.gachaTicket >= GACHA_10_COST,
    canAd: !save.dailyGachaAdUsed,
    canTicket: save.diamond >= DIAMOND_TICKET_COST,
  };
}

/**
 * 命中判定(对标 Web onGachaClick 的七段顺序)。
 * 热区依次是 返回 → 单抽 → 十连 → 广告抽 → 钻石换券 → 逐行(按 id),循环走完没有命中
 * 就是 null —— 点热区之外的空白什么都不发生(Web 没有"其余一律"兜底)。
 * 券不足 / 广告已用 / 钻石不足都照样返回动作,静默留给 `gachaClaim`(命中层不看状态)。
 */
export function hitGacha(L: GachaLayout, x: number, y: number): GachaAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  if (inRect(L.singleBtn, x, y)) return { kind: "single" };
  if (inRect(L.tenBtn, x, y)) return { kind: "ten" };
  if (inRect(L.adBtn, x, y)) return { kind: "ad" };
  if (inRect(L.ticketBtn, x, y)) return { kind: "ticket" };
  for (const r of L.rows) {
    if (inRect(r.rect, x, y)) return { kind: "select", id: r.id };
  }
  return null;
}

/**
 * 抽取的公共部分:一次性拷贝 pity(口径 3)→ 共享层抽 → 汇总成落账面。
 * 券不足这一道守卫就是 Web `doGacha` 开头的 `if (gachaTicket < cost) return`;
 * 广告抽不扣券(Web 的 `doGachaAd` 里没有 cost 一项)。
 */
function gachaDrawClaim(
  save: GachaSaveView,
  recent: readonly GachaResult[],
  count: number,
  needsAd: boolean,
  roll?: () => number
): GachaDrawClaim | null {
  const cost = count === 10 ? GACHA_10_COST : GACHA_COST;
  if (!needsAd && save.gachaTicket < cost) return null;
  const owned = save.ownedGear;
  const level = gachaLevel(save.highestStage);
  // Web 的 `const pity = { pityEpic: save.gachaPityEpic, pityLegendary: save.gachaPityLegendary }`:
  // 共享层的 drawGacha* 按引用改这个局部对象,两值再由本函数交回宿主落档(口径 3)
  const pity = { pityEpic: save.gachaPityEpic, pityLegendary: save.gachaPityLegendary };
  const results = count === 10 ? drawGacha10(level, pity, owned, roll) : [drawGacha(level, pity, owned, roll)];
  const newGear: Equipment[] = [];
  let stardustGain = 0;
  for (const r of results) {
    if (r.duplicate) stardustGain += r.stardust;
    else newGear.push(r.eq);
  }
  return {
    kind: "draw",
    needsAd,
    markAdUsed: needsAd,
    ticketCost: needsAd ? 0 : cost,
    pityEpic: pity.pityEpic,
    pityLegendary: pity.pityLegendary,
    newGear,
    stardustGain,
    recent: [...results, ...recent].slice(0, 8),
  };
}

/**
 * 动作 → 写入意图(纯)。四道守卫与 Web 的扣费前 `return` 逐条对应:
 * 券不足(单抽 / 十连)、广告抽已用(`dailyGachaAdUsed`)、钻石不足,一律 null;
 * `back` 也不产任何写入意图。`recent` 是宿主持有的瞬时态,由本函数算出新值交回宿主覆写。
 */
export function gachaClaim(
  save: GachaSaveView,
  recent: readonly GachaResult[],
  a: GachaAction,
  roll?: () => number
): GachaClaim | null {
  switch (a.kind) {
    case "back":
      return null;
    case "single":
      return gachaDrawClaim(save, recent, 1, false, roll);
    case "ten":
      return gachaDrawClaim(save, recent, 10, false, roll);
    case "ad":
      // Web: if (this.save.dailyGachaAdUsed) return;
      if (save.dailyGachaAdUsed) return null;
      return gachaDrawClaim(save, recent, 1, true, roll);
    case "ticket":
      // Web: if (this.save.diamond < DIAMOND_TICKET_COST) return;
      if (save.diamond < DIAMOND_TICKET_COST) return null;
      return { kind: "ticket", needsAd: false, markAdUsed: false, diamondCost: DIAMOND_TICKET_COST, ticketGain: 1 };
    case "select":
      // Web: this.save.selectedGearId = this.save.selectedGearId === r.id ? null : r.id;
      return { kind: "select", needsAd: false, markAdUsed: false, selectedGearId: save.selectedGearId === a.id ? null : a.id };
  }
}
