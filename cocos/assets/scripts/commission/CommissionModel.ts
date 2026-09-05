/**
 * 委托挂机屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawCommission`
 * 的文案侧(5088-5200)、`drawCommissionPanel`(5034-5086)、`onCommissionClick`(5202-5252)、
 * `commissionBonus`(5255-5263)、`startCommission`(5265-5277)与 `collectCommission`(5279-5297)
 * 的分支侧抽取。
 *
 * 分工与前六屏同构:几何一律问共享层 `game/ui/commissionLayout.ts`,本文件只产
 * "每处写什么文本、哪一枚算选中、这一下该往存档写什么",外加命中判定与**写入意图**。
 * 颜色档不在这里 —— 取表(`core/ViewTable.ts` 的 `phase4` 段,键前缀 `cm`)。
 *
 * 三条纪律:
 *  ① 数值与判据一律走既有函数:区域与难度查表走 `regionOf` / `difficultyOf`、解锁门走
 *     `regionUnlocked`、天赋加成四项走 `offlineBonusFor` / `commissionSpeedFor` /
 *     `commissionTimeScaleFor` / `uncappedCommissionFor`、衰减与产出走 `effectiveHours` /
 *     `accruedReward` / `collectReward`、券数走 `commissionTickets`、兑换比例走
 *     `FRAGMENT_TO_STARDUST`。本文件不复制任何一条判据、不重写曲线;
 *  ② **本文件不写存档**:`commissionClaim()` 只返回一份增量描述,落字段与 `persist()` 全在
 *     宿主 `GameShell`;
 *  ③ **时间与随机源都是入参**:所有 `Date.now()` 的位置收成 `now`,`collectReward` 的 `roll`
 *     也做成形参(默认 `Math.random`)。宿主调用时传真实 `Date.now()` 与默认 roll,测试据此钉死。
 *
 * 三条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **选中的区域与难度是会话级瞬时态**:Web 的 `commRegion`(默认 `"plains"`)与
 *     `commDifficulty`(默认 `1`)是 `Game` 的 private 字段,`SaveData` 里没有这两项,
 *     整局会话内跨开屏 / 关屏保留、从不落盘。于是这两类动作的写入意图 `persists: false`,
 *     宿主落的是内存字段。
 *  2. **有活动槽位时兑换钮照画却不可点**:Web `onCommissionClick` 在面板循环之后直接 `return`
 *     (5221),兑换钮的命中判定(5246)排在它后面 —— 于是面板态下点兑换钮什么都不发生,
 *     尽管它在 5106 那一支照画。命中层照抄这条顺序。
 *  3. **进度条比例是未钳制的 `hours / 2`**:Web 把它原样交给 `skinBar`(钳制发生在 `skinBar`
 *     内部的 `f = min(1, max(0, frac))`),缺图回退分支则自己写了 `Math.min(1, hours / 2)`。
 *     两条路径钳制落点不同、结果同值,本层给出未钳制的原值,钳制落在共享层
 *     `commissionBarRects`。
 *
 * 两条静默(Web 全程无提示,本层也不加):区域未解锁时点开始钮直接 no-op;两枚槽位都占满
 * 且没有「双委托」天赋时点开始钮也 no-op。锁定行被点中时同样吞掉点击、不改选中态。
 */

import {
  FRAGMENT_TO_STARDUST,
  accruedReward,
  collectReward,
  commissionTickets,
  difficultyOf,
  effectiveHours,
  regionOf,
  regionUnlocked,
  type CommissionBonus,
  type CommissionState,
  type RegionDef,
  type RegionId,
} from "../game/data/commissions";
import { commissionSpeedFor, commissionTimeScaleFor, offlineBonusFor, uncappedCommissionFor, type TalentId } from "../game/data/talents";
import type { CommissionLayout, CmRect } from "../game/ui/commissionLayout";

/** 两个槽位的存档字段名(Web `activeCommissionSlots` 的取值,`commission` 先、`commission2` 后) */
export type CommissionSlotId = "commission" | "commission2";

/** 本屏要读的存档字段(SaveModel 结构上天然兼容);选中态是宿主瞬时态,不在这里 */
export interface CommissionSaveView {
  fragments: number;
  stardust: number;
  prestiges: number;
  ownedTalents: readonly TalentId[];
  commission: CommissionState | null;
  commission2: CommissionState | null;
}

/** 选中的区域与难度(= Web 的 `commRegion` / `commDifficulty`,会话级瞬时态) */
export interface CommissionSelection {
  region: RegionId;
  difficulty: number;
}

/** 两个瞬时态的默认值(逐字对标 Web 的实例字段初值) */
export const COMMISSION_DEFAULT_SELECTION: CommissionSelection = { region: "plains", difficulty: 1 };

/** 一个区域行的文案与三档态 */
export interface CommissionRowContent {
  id: RegionId;
  name: string;
  /** `${region.output} · ${unlockNote}` */
  subText: string;
  /** `产出 ${region.baseRate}/h` —— **仅解锁档绘制**(Web 的 `if (unlocked)`) */
  rateText: string;
  unlocked: boolean;
  sel: boolean;
}

/** 一枚难度钮的文案与选中档 */
export interface CommissionDiffContent {
  level: number;
  /** `×${mult}`(倍率原样拼接,不经 toFixed) */
  multText: string;
  /** `${Math.round(fail × 100)}%败` */
  failText: string;
  sel: boolean;
}

/** 一个进行中面板的三行文字与进度 */
export interface CommissionPanelContent {
  slot: CommissionSlotId;
  /** `委托中:${region.name} · 难度${c.difficulty}` —— 难度是**数字本身**,不是难度名 */
  line1: string;
  /** `已进行 …h · 有效时长 …h · 预计 N 单位` */
  line2: string;
  /** `成功率 N% · 收益前2h 100%,之后降至 50%`(后半句是 Web 的字面量) */
  line3: string;
  /** 未钳制的 `hours / 2`(钳制落在共享层 `commissionBarRects`) */
  barFrac: number;
  /** 原始经过时长(小时;`(now − startedAt) / 3600000`) */
  hours: number;
  /** `effectiveHours(hours, bonus)` */
  effHours: number;
  /** `accruedReward(c, now, bonus)` */
  reward: number;
  collectText: string;
  abandonText: string;
}

/** 一屏文案 */
export interface CommissionContent {
  title: string;
  /** `词缀碎片 ${fragments}` */
  fragmentsText: string;
  /** `星尘 ${stardust}` */
  stardustText: string;
  /** `转生 ${prestiges} 次` */
  prestigesText: string;
  /** `兑换星尘 ×${floor(fragments / FRAGMENT_TO_STARDUST)}` */
  exchangeText: string;
  /** 兑换钮在不在(Web 的绘制与命中都带 `fragments ≥ FRAGMENT_TO_STARDUST` 前置) */
  showExchange: boolean;
  backText: string;
  /** 面板态:`true` = 有活动槽位,Web 在 5134 直接 return,列表侧四件一个都不画 */
  panelMode: boolean;
  /** 与 `layout.panels` 逐位对齐 */
  panels: CommissionPanelContent[];
  /** 与 `layout.rows` 逐位对齐 */
  rows: CommissionRowContent[];
  /** 与 `layout.diffs` 逐位对齐 */
  diffs: CommissionDiffContent[];
  /** `难度(产出倍率/失败率)` */
  diffLabel: string;
  /** `开始委托(4h)` —— Web 的字面量,那个 4 在表里没有对应常量 */
  startText: string;
}

/**
 * 一次点击落到的热区。顺序与 Web onCommissionClick 逐项一致:
 * 返回钮 → (面板态)逐面板领取 / 放弃 → (列表态)区域行 → 难度钮 → 开始钮 → 兑换钮。
 */
export type CommissionAction =
  | { kind: "back" }
  | { kind: "collect"; index: number }
  | { kind: "abandon"; index: number }
  | { kind: "region"; id: RegionId }
  | { kind: "difficulty"; level: number }
  | { kind: "start" }
  | { kind: "exchange" };

/** 派遣一枚委托:写其中一个槽位(槽位归属由本层按 Web `startCommission` 的次序定) */
export interface CommissionStartClaim {
  kind: "start";
  persists: true;
  slot: CommissionSlotId;
  state: CommissionState;
}

/** 领取:按区域产出分流到三个字段之一,外加扭蛋券;随后清空该槽 */
export interface CommissionCollectClaim {
  kind: "collect";
  persists: true;
  slot: CommissionSlotId;
  fragments: number;
  stardust: number;
  diamond: number;
  gachaTicket: number;
  /** 实发产出(失败档已减半),只用于诊断与断言 */
  reward: number;
  /** 失败只体现在 reward 减半,不额外扣分 */
  failed: boolean;
}

/** 放弃:只清空该槽,不发奖、无确认弹窗 */
export interface CommissionAbandonClaim {
  kind: "abandon";
  persists: true;
  slot: CommissionSlotId;
}

/** 碎片兑换星尘:`n = floor(fragments / FRAGMENT_TO_STARDUST)` */
export interface CommissionExchangeClaim {
  kind: "exchange";
  persists: true;
  count: number;
  fragmentsCost: number;
  stardustGain: number;
}

/** 改选中的区域:只改宿主持有的瞬时态,**不入档** */
export interface CommissionRegionClaim {
  kind: "region";
  persists: false;
  region: RegionId;
}

/** 改选中的难度:同上 */
export interface CommissionDifficultyClaim {
  kind: "difficulty";
  persists: false;
  difficulty: number;
}

export type CommissionClaim =
  | CommissionStartClaim
  | CommissionCollectClaim
  | CommissionAbandonClaim
  | CommissionExchangeClaim
  | CommissionRegionClaim
  | CommissionDifficultyClaim;

const inRect = (r: CmRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 拥有某枚天赋(Web `owns`:就是 `ownedTalents.includes`) */
export function commissionOwns(owned: readonly TalentId[], id: TalentId): boolean {
  return owned.includes(id);
}

/**
 * 进行中的槽位(双委托天赋可同时 2 个)。顺序逐字对标 Web `activeCommissionSlots`:
 * `commission` 先、`commission2` 后 —— 面板序号与命中动作的 `index` 都按这个序。
 */
export function commissionSlots(save: CommissionSaveView): { slot: CommissionSlotId; state: CommissionState }[] {
  const out: { slot: CommissionSlotId; state: CommissionState }[] = [];
  if (save.commission) out.push({ slot: "commission", state: save.commission });
  if (save.commission2) out.push({ slot: "commission2", state: save.commission2 });
  return out;
}

/** 委托天赋加成四项(Web `commissionBonus` 逐字:效率专家路线,策划案 5.2) */
export function commissionBonus(save: CommissionSaveView): CommissionBonus {
  const owned = save.ownedTalents;
  return {
    rewardMult: offlineBonusFor(owned),
    speedMult: commissionSpeedFor(owned),
    timeScale: commissionTimeScaleFor(owned),
    uncapped: uncappedCommissionFor(owned),
  };
}

/** 区域行第二行的解锁说明(Web 5153-5157 的三元链,顺序不能换) */
export function commissionUnlockNote(region: RegionDef): string {
  return region.unlockTreeFull ? "需天赋树点满" : region.unlockPrestiges > 0 ? `需转生 ${region.unlockPrestiges} 次` : "初始解锁";
}

/** 区域是否解锁(转调共享层判据,本文件不复制规则) */
export function commissionRegionOpen(region: RegionDef, save: CommissionSaveView): boolean {
  return regionUnlocked(region, save.prestiges, save.ownedTalents);
}

/** 兑换钮的档数与可见性共读这一个数(Web 的 `Math.floor(fragments / FRAGMENT_TO_STARDUST)`) */
export function commissionExchangeCount(fragments: number): number {
  return Math.floor(fragments / FRAGMENT_TO_STARDUST);
}

/** 产出单位名(Web 5056 的三元链) */
export function commissionUnit(region: RegionDef): string {
  return region.givesStardust ? "星尘" : region.givesDiamond ? "钻石" : "碎片";
}

/**
 * 面板第三行后半句:Web 5058 的**字面量**,照抄而不从 `COMMISSION_DECAY` 插值 ——
 * 表里 `fullHours = 2` / `floorRate = 0.5` 与这串同数,改表的人要靠测试回头处理这句文案。
 */
export const COMMISSION_DECAY_NOTE = "收益前2h 100%,之后降至 50%";

/** 开始钮文案:Web 的字面量 `开始委托(4h)`(那个 4 在表里没有对应常量:封顶是 12、提醒门槛是 2) */
export const COMMISSION_START_TEXT = "开始委托(4h)";

/** 存档 + 选中态 + 时间源 + 一帧几何 → 一屏文案(行序与面板序都与 layout 同源) */
export function buildCommissionContent(save: CommissionSaveView, sel: CommissionSelection, now: number, L: CommissionLayout): CommissionContent {
  const slots = commissionSlots(save);
  const bonus = commissionBonus(save);
  return {
    title: "委托挂机",
    fragmentsText: `词缀碎片 ${save.fragments}`,
    stardustText: `星尘 ${save.stardust}`,
    prestigesText: `转生 ${save.prestiges} 次`,
    exchangeText: `兑换星尘 ×${commissionExchangeCount(save.fragments)}`,
    showExchange: save.fragments >= FRAGMENT_TO_STARDUST,
    backText: "返回",
    panelMode: slots.length > 0,
    panels: L.panels.slice(0, slots.length).map((p) => {
      const hit = slots[p.index];
      const c = hit.state;
      const region = regionOf(c.region);
      const hours = (now - c.startedAt) / 3600000;
      const eff = effectiveHours(hours, bonus);
      const reward = accruedReward(c, now, bonus);
      const diff = difficultyOf(c.difficulty);
      return {
        slot: hit.slot,
        line1: `委托中:${region.name} · 难度${c.difficulty}`,
        line2: `已进行 ${hours.toFixed(1)}h · 有效时长 ${eff.toFixed(2)}h · 预计 ${reward} ${commissionUnit(region)}`,
        line3: `成功率 ${Math.round((1 - diff.fail) * 100)}% · ${COMMISSION_DECAY_NOTE}`,
        barFrac: hours / 2,
        hours,
        effHours: eff,
        reward,
        collectText: "领取",
        abandonText: "放弃",
      };
    }),
    rows: L.rows.map((row) => {
      const region = regionOf(row.id);
      const unlocked = commissionRegionOpen(region, save);
      return {
        id: row.id,
        name: region.name,
        subText: `${region.output} · ${commissionUnlockNote(region)}`,
        rateText: `产出 ${region.baseRate}/h`,
        unlocked,
        sel: sel.region === row.id,
      };
    }),
    diffs: L.diffs.map((d) => {
      const dd = difficultyOf(d.level);
      return { level: d.level, multText: `×${dd.mult}`, failText: `${Math.round(dd.fail * 100)}%败`, sel: sel.difficulty === d.level };
    }),
    diffLabel: "难度(产出倍率/失败率)",
    startText: COMMISSION_START_TEXT,
  };
}

/**
 * 命中判定(对标 Web onCommissionClick 的六段顺序)。
 * 面板态在逐面板循环之后**直接返回 null** —— 兑换钮虽然照画却不参与命中(Web 5221 的 return);
 * 列表态依次是 区域行 → 难度钮 → 开始钮 → 兑换钮。热区之外没有"其余一律"兜底。
 * 锁定行与买不起的兑换照样返回动作,静默留给 `commissionClaim`(命中层不看状态)。
 */
export function hitCommission(L: CommissionLayout, x: number, y: number): CommissionAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  if (L.slotCount > 0) {
    for (const p of L.panels) {
      if (inRect(p.collect, x, y)) return { kind: "collect", index: p.index };
      if (inRect(p.abandon, x, y)) return { kind: "abandon", index: p.index };
    }
    return null;
  }
  for (const r of L.rows) {
    if (inRect(r.rect, x, y)) return { kind: "region", id: r.id };
  }
  for (const d of L.diffs) {
    if (inRect(d.rect, x, y)) return { kind: "difficulty", level: d.level };
  }
  if (inRect(L.startBtn, x, y)) return { kind: "start" };
  if (inRect(L.exchangeBtn, x, y)) return { kind: "exchange" };
  return null;
}

/**
 * 动作 → 写入意图(纯)。`now` 与 `roll` 都是入参:宿主传真实 `Date.now()` 与默认 `Math.random`,
 * 测试传钉死的值。
 *  - `back` 不产写入意图:Web 是 `this.state = overlayFrom`,Cocos 侧本屏只从主菜单进入,
 *    那三态恒为 `"menu"`,由宿主 `router.show("menu")` 承担;
 *  - `start` 的三道守卫与 Web `startCommission` 逐条对应:区域未解锁 → null;
 *    `commission` 空 → 写 `commission`;否则 `commission2` 空**且**拥有 `double_commission` →
 *    写 `commission2`;都不成立 → null(Web 全程静默无提示);
 *  - `collect` 照 Web `collectCommission`:`collectReward` 的产出按区域分流到
 *    碎片 / 星尘 / 钻石,券数用**重新按 now 算的** hours 过 `effectiveHours`,失败只减半不扣分;
 *  - `region` 只在区域解锁时改选中(锁定行吞掉点击),`difficulty` 无条件改。
 */
export function commissionClaim(
  save: CommissionSaveView,
  sel: CommissionSelection,
  a: CommissionAction,
  now: number,
  roll: () => number = Math.random
): CommissionClaim | null {
  switch (a.kind) {
    case "back":
      return null;
    case "region": {
      if (!commissionRegionOpen(regionOf(a.id), save)) return null;
      return { kind: "region", persists: false, region: a.id };
    }
    case "difficulty":
      return { kind: "difficulty", persists: false, difficulty: a.level };
    case "exchange": {
      const n = commissionExchangeCount(save.fragments);
      if (save.fragments < FRAGMENT_TO_STARDUST || n <= 0) return null;
      return { kind: "exchange", persists: true, count: n, fragmentsCost: n * FRAGMENT_TO_STARDUST, stardustGain: n };
    }
    case "start": {
      const region = regionOf(sel.region);
      if (!commissionRegionOpen(region, save)) return null;
      const state: CommissionState = { region: sel.region, difficulty: sel.difficulty, startedAt: now };
      if (!save.commission) return { kind: "start", persists: true, slot: "commission", state };
      if (!save.commission2 && commissionOwns(save.ownedTalents, "double_commission")) return { kind: "start", persists: true, slot: "commission2", state };
      return null;
    }
    case "collect":
    case "abandon": {
      const hit = commissionSlots(save)[a.index];
      if (!hit) return null;
      if (a.kind === "abandon") return { kind: "abandon", persists: true, slot: hit.slot };
      const c = hit.state;
      const region = regionOf(c.region);
      const bonus = commissionBonus(save);
      const { reward, failed } = collectReward(c, now, roll, bonus);
      const out = { fragments: 0, stardust: 0, diamond: 0 };
      if (region.givesStardust) out.stardust = reward;
      else if (region.givesDiamond) out.diamond = reward;
      else out.fragments = reward;
      const hours = (now - c.startedAt) / 3600000;
      return {
        kind: "collect",
        persists: true,
        slot: hit.slot,
        ...out,
        gachaTicket: commissionTickets(effectiveHours(hours, bonus)),
        reward,
        failed,
      };
    }
  }
}
