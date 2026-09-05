/**
 * 体力不足屏的**内容与命中 + 写入意图**（纯逻辑，cc-free）—— Web `src/game.ts:drawEnergy`
 * 的文案侧(4674-4745)、`onEnergyClick`(4746-4781) 与 `startStage`(1660-1668) /
 * `startEndless`(1677-1683) 的闸门侧抽取。
 *
 * 分工与已落地十五屏同构：几何一律问共享层 `game/ui/energyLayout.ts`，本文件只产「每处写什么
 * 文本、这一下该往存档写什么」。颜色档不在这里 —— 取表（`core/ViewTable.ts` 的 `phase4` 段，
 * 键前缀 `en`）。
 *
 * 四条纪律：
 *  ① **本文件不读存档也不写存档**：宿主投影一份 `EnergySaveView`（三个数）进来，本文件按它
 *     出一屏文案；落 `energy` / `energyAdCount` / `diamond` 与 `persist()` 全在宿主
 *     `GameShell`（`commitEnergyAd` / `commitEnergyDiamond`）；
 *  ② 数值口径一律转调共享层 `game/data/daily.ts` 的 `ENERGY_MAX` / `ENERGY_REGEN_SECONDS` /
 *     `ENERGY_AD_GAIN` / `ENERGY_AD_LIMIT` / `ENERGY_DIAMOND_COST`（这五支可被
 *     `balance.json` 的 `energy` 段覆盖，Web 与 Cocos 同表同源），本文件不复制任何一张表；
 *  ③ **本文件没有随机源也没有 `Date.now()`**：一屏内容全部由「三个数」决定，同一份入参永远
 *     同一屏。体力自然恢复那一步（Web 的 `syncEnergy()`）留在宿主与战斗层同位出口，本文件
 *     只在写入意图的守卫里读传入的 `energy`；
 *  ④ **「续上这次开局」不是一枚写入意图，而是宿主持有的闭包**：Web 的 `energyPending` 是
 *     `() => this.startStage(id, bypassGate)` 或 `() => this.startEndless()`，本文件不碰它，
 *     只把「点在哪一片」翻成 `EnergyAction`，由宿主决定领完体力之后调不调那个闭包。
 *
 * 六条 Web 原样口径（照抄，不在本层「修好」）：
 *  1. **读数行念的是恢复节奏而不是倒计时**：Web 那一行是 `体力 N/MAX · 每 X 分钟恢复 1 点`，
 *     `X = ENERGY_REGEN_SECONDS / 60`（当前表值 360 → 6），**本屏没有任何「下一点还有几秒」的
 *     读数**。屏上那个 `N` 之所以会自己往上跳，是因为 Web 的 `drawEnergy` 首行调 `syncEnergy()`
 *     而它每帧重绘；节点化后由宿主 `GameShell.tickEnergy()` 在同一条口补一次 sync + 重排。
 *     除法不取整（表值改成 90 就是 `1.5`），照 Web 原样是浮点拼接；
 *  2. **体力已满那一档没有专属文案**：Web 本屏只有 `if (canAd)` / `if (canDia)` 两处配色分支，
 *     读数行恒写 `体力 N/MAX`，所以 `energy === ENERGY_MAX` 时屏面照常，只是那一行读满；
 *  3. **广告次数上限只改文案与配色，不改热区**：Web 的 `onEnergyClick` 在广告分支里
 *     `if (this.save.energyAdCount >= ENERGY_AD_LIMIT) return;` —— 命中照样命中，静默发生在
 *     守卫里（于是 `energyAdCount` 被手改到上限之上时那一格仍是热区，只是点了什么都不做）；
 *  4. **钻石不足同理**：`if (this.save.diamond < ENERGY_DIAMOND_COST) return;` 在命中之后；
 *     钻石钮的文案恒写 `钻石回满体力(C◆ · 持有 D)`，不足时只是变灰，不减价也不改串；
 *  5. **广告回体力是「加上限」而不是「回满」**：`energy = Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN)`，
 *     而钻石那一支是 `energy = ENERGY_MAX`（先 `syncEnergy()` 再直接置满），两支不同口径；
 *  6. **关闭与返回两支完全同效**：都是 `energyPending = null` + 回主菜单，Web 就是写了两个出口
 *     （返回钮在右上角、关闭钮在钮列末尾），本层不做合并、也不改成「返回上一屏」。
 */

import { ENERGY_AD_GAIN, ENERGY_AD_LIMIT, ENERGY_DIAMOND_COST, ENERGY_MAX, ENERGY_REGEN_SECONDS } from "../game/data/daily";
import type { EnergyLayout, EnRect } from "../game/ui/energyLayout";

/**
 * 宿主投影进来的存档切片 —— **只有三个数**（对标 Web 本屏实际读到的 `this.save.energy` /
 * `this.save.energyAdCount` / `this.save.diamond`）。`energy` 必须是宿主 `syncEnergy()` 之后
 * 的那一份，否则读数会停在上一帧。
 */
export interface EnergySaveView {
  energy: number;
  energyAdCount: number;
  diamond: number;
}

/** 一屏文案（本屏没有条件容器：七处文字恒画，两处钮只换配色档与文案档） */
export interface EnergyContent {
  title: string;
  /** `体力 N/MAX · 每 X 分钟恢复 1 点`（X 不取整，见口径 1） */
  statLine: string;
  hint: string;
  /** 广告钮文案两档：有余量时带余量读数，用尽时换成整串提示 */
  adText: string;
  /** 今日广告余量（可以为负 —— 手改存档时 `adCount > LIMIT`，Web 同样原样相减） */
  adLeft: number;
  canAd: boolean;
  diamondText: string;
  canDiamond: boolean;
  closeText: string;
  backText: string;
}

/** 读数快照 → 一屏文案；七处字面量与 Web drawEnergy 的 fillText 实参逐字对应 */
export function buildEnergyContent(save: EnergySaveView): EnergyContent {
  const adLeft = ENERGY_AD_LIMIT - save.energyAdCount;
  const canAd = adLeft > 0;
  const canDiamond = save.diamond >= ENERGY_DIAMOND_COST;
  return {
    title: "体力不足",
    statLine: `体力 ${save.energy}/${ENERGY_MAX} · 每 ${ENERGY_REGEN_SECONDS / 60} 分钟恢复 1 点`,
    hint: "补充体力继续闯关,或关闭回到主菜单",
    adText: canAd ? `▶ 看广告 +${ENERGY_AD_GAIN} 体力(今日剩 ${adLeft} 次)` : "今日广告回体力已用尽",
    adLeft,
    canAd,
    diamondText: `钻石回满体力(${ENERGY_DIAMOND_COST}◆ · 持有 ${save.diamond})`,
    canDiamond,
    closeText: "关闭",
    backText: "返回",
  };
}

/**
 * 写入意图：看一次广告换体力。守卫是 Web 命中分支首行的 `energyAdCount >= ENERGY_AD_LIMIT`
 * （越界即 null，宿主据此不发起广告），入账口径是 `Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN)`。
 * 满体力时 `gained` 为 0 但意图仍然成立 —— Web 那一支照样把 `energyAdCount` 加一、照样落盘、
 * 照样续上那次开局，本层不在这里"修好"。
 */
export interface EnergyAdClaim {
  kind: "ad";
  persists: true;
  /** 本次真正加上的点数（受上限截断） */
  gained: number;
  energyAfter: number;
  adCountAfter: number;
}

export function energyAdClaim(energy: number, adCount: number): EnergyAdClaim | null {
  if (adCount >= ENERGY_AD_LIMIT) return null;
  const energyAfter = Math.min(ENERGY_MAX, energy + ENERGY_AD_GAIN);
  return { kind: "ad", persists: true, gained: energyAfter - energy, energyAfter, adCountAfter: adCount + 1 };
}

/**
 * 写入意图：钻石回满体力。守卫是 Web 的 `diamond < ENERGY_DIAMOND_COST`（不足即 null）。
 * 两支的实质差别：这一支是 `energy = ENERGY_MAX`（不看当前值、没有 `gained` 上限截断的语义），
 * 扣费与置满同一次落盘；广告那支是累加。`gained` 这里只用于断言与提示，不参与决策。
 */
export interface EnergyDiamondClaim {
  kind: "diamond";
  persists: true;
  spent: number;
  diamondAfter: number;
  gained: number;
  energyAfter: number;
}

export function energyDiamondClaim(energy: number, diamond: number): EnergyDiamondClaim | null {
  if (diamond < ENERGY_DIAMOND_COST) return null;
  return {
    kind: "diamond",
    persists: true,
    spent: ENERGY_DIAMOND_COST,
    diamondAfter: diamond - ENERGY_DIAMOND_COST,
    gained: ENERGY_MAX - energy,
    energyAfter: ENERGY_MAX,
  };
}

/**
 * 热区：四片，顺序与 Web `onEnergyClick` 逐条对应 —— 返回 → 广告 → 钻石 → 关闭。
 * 本层**不带形态前置**：广告用尽与钻石不足都照样返回动作，静默发生在 `energyAdClaim` /
 * `energyDiamondClaim` 的守卫里（与 Web 的「命中之后再 return」同分层）。
 * 四类落点：`ad` 与 `diamond` 领成功即续上挂起的那次开局（Web 的 `energyPending`），
 * `close` 与 `back` 清掉挂起并回主菜单；热区之外一律吞掉。
 */
export type EnergyAction = { kind: "ad" } | { kind: "diamond" } | { kind: "close" } | { kind: "back" };

/** 命中判定（对标 Web onEnergyClick 的四段 if：按序、其余吞掉） */
export function hitEnergy(L: EnergyLayout, x: number, y: number): EnergyAction | null {
  const inRect = (r: EnRect): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inRect(L.backBtn)) return { kind: "back" };
  if (inRect(L.adBtn)) return { kind: "ad" };
  if (inRect(L.diamondBtn)) return { kind: "diamond" };
  if (inRect(L.closeBtn)) return { kind: "close" };
  return null;
}
