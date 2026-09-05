/**
 * 死亡结算屏（阵亡）的**内容与命中 + 写入意图**（纯逻辑，cc-free）—— Web `src/game.ts:drawGameOver`
 * 的文案侧(4015-4113)、`handleTap` 的 gameover 分支(598-615)、`onDeath`(1166-1182)、
 * `revive`(1158-1164)、`settleEcho`(1797-1803) 与 `reviveLimit`(1130-1133) 的分支侧抽取。
 *
 * 分工与前九屏同构：几何一律问共享层 `game/ui/gameOverLayout.ts`，本文件只产「每处写什么文本、
 * 这一下该往存档写什么」。颜色档不在这里 —— 取表（`core/ViewTable.ts` 的 `phase4` 段，键前缀 `go`）。
 *
 * 三条纪律：
 *  ① 数值与判据一律走既有函数：回响折算走 `splitEcho`、复活上限走 `dailyTalentOf("extra_revive")`、
 *     时间格式在本层复刻 Web 的 `formatTime`。本文件不重写任何一条规则，也不复制任何一张表；
 *  ② **本文件不写存档**：`gameOverEchoClaim()` 只返回一份增量描述，落 `points` / `dayEcho` 与
 *     `persist()` 全在宿主 `GameShell`（`commitGameOverEcho`）；死亡本账那一笔（`settlePendingRun`）
 *     本来就在战斗层，宿主只在三个出口前调它；
 *  ③ **本文件没有随机源**：一屏内容全部由「本局读数 + 存档切片 + 两个形态位」决定，
 *     时间是入参（`elapsed` / `bestRun.seconds` 都由宿主投影进来），所以同一份入参永远同一屏。
 *
 * 五条 Web 原样口径（照抄，不在本层「修好」）：
 *  1. **广告双倍是「把同一笔回响再结一次」**：Web 领取时调 `settleEcho(pointsEarnedThisRun)`
 *     （内部按 40% 永久 / 60% 本日入档）并把 `doubleClaimed` 置真，但**不清 `pendingSettle`、
 *     也不改 `pointsEarnedThisRun`**，于是离开本屏时 `settleRun()` 里 `gained` 仍是同一个数、
 *     又结一次 —— 两笔同额相加就是「翻倍」。翻倍后屏上那行读数纹丝不动（念的仍是本局所得），
 *     只有括号里的「累计」和钮的配色会跟着变；
 *  2. **星尘那一行在本屏永远不出现**：Web 的 `onDeath` 把 `stardustEarnedThisRun` 写成 0、
 *     `startRun` 也写 0，只有 `victory()` 会写非零值，而胜利屏与死亡屏互斥 ——
 *     `if (stardustEarnedThisRun > 0)` 那一支是死亡屏上的死代码。本层原样保留这一支；
 *  3. **复活钮的剩余次数是「上限 − 已用」**，上限 = `1 + 不屈(value=1)`，也就是无天赋 1 次、
 *     当日本天赋里有「不屈」2 次；`reviveUsed` 在 `startRun` 清零（世界层），不入档；
 *  4. **复活那一下不产生任何存档写入**（战场满血 + 短无敌盾 + 清贴身 + `reviveUsed + 1` 与
 *     解除挂起都在世界层与会话态上）；唯一落盘的是 `watchAd` 通用段的「看完广告 +1 钻石」；
 *  5. **五个热区有严格先后**：复活 → 双倍 → 重开 → 天赋 → 菜单，前一支命中就 `return`，
 *     五支都不命中就什么都不做（本屏没有吞掉点击的弹层，也没有返回钮 —— 三钮行就是返回出口）。
 */

import { dailyTalentOf } from "../game/data/daily";
import { splitEcho } from "../game/data/stages";
import type { GameOverForms, GameOverLayout, GoRect } from "../game/ui/gameOverLayout";

/** 本屏要读的存档字段就这三项（累计回响 / 最佳纪录 / 当日已领的每日天赋）；本屏一个存档字段都不写 */
export interface GameOverSaveView {
  points: number;
  bestRun: { kills: number; seconds: number } | null;
  dailyTalentClaimed: readonly string[];
}

/**
 * 本局读数切片 —— **宿主持有的会话态，不入档**（对标 Web 的 `elapsed` / `waves.wave` / `kills` /
 * `pointsEarnedThisRun` / `stardustEarnedThisRun` / `reviveUsed` / `rankImprovedTo` / `doubleClaimed`）。
 * 世界在 `over` 之后停止推进，所以这一份就是死亡那一刻的定格快照。
 */
export interface GameOverRunView {
  /** 本局生存秒数（Web 的 `this.elapsed`） */
  elapsed: number;
  /** 波次（Web 的 `this.waves.wave`） */
  wave: number;
  /** 本局击杀 */
  kills: number;
  /** 预计算的本局回响（实际入账在放弃时的 `settleRun`） */
  pointsEarnedThisRun: number;
  /** 本局星尘（死亡路径恒 0，见文件头第 2 条口径） */
  stardustEarnedThisRun: number;
  /** 本局已用复活次数（世界层 `reviveUsed`） */
  reviveUsed: number;
  /** 幻影榜名次提示（Web 的 `rankImprovedTo`） */
  rankImprovedTo: number | null;
  /** 本局双倍是否已领（Web 的 `doubleClaimed`） */
  doubleClaimed: boolean;
}

/** 复活上限（Web `reviveLimit()`：默认 1 次，当日天赋「不屈」额外 +value） */
export function gameOverReviveLimit(claimed: readonly string[]): number {
  return 1 + (claimed.includes("extra_revive") ? dailyTalentOf("extra_revive").value : 0);
}

/** 是否还能复活（Web `canRevive()`） */
export function gameOverCanRevive(claimed: readonly string[], reviveUsed: number): boolean {
  return reviveUsed < gameOverReviveLimit(claimed);
}

/** 两个形态位（视图与命中都读这一份；与 Web 的 `canRevive()` / `!doubleClaimed` 一一对应） */
export function gameOverForms(save: GameOverSaveView, run: GameOverRunView): GameOverForms {
  return {
    canRevive: gameOverCanRevive(save.dailyTalentClaimed, run.reviveUsed),
    canDouble: !run.doubleClaimed,
  };
}

/** mm:ss（逐行照 Web `formatTime`：分钟不补零、秒补零，向下取整） */
export function gameOverFormatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 一屏文案（`bestLine` / `rankLine` 在对应数据缺失时给空串，由视图收起那一行） */
export interface GameOverContent {
  title: string;
  timeLine: string;
  waveLine: string;
  /** 星尘档优先（Web 的 `if (stardustEarnedThisRun > 0)`；死亡路径走不到） */
  echoLine: string;
  /** 本行是不是星尘档（只影响 Web 那两档文案，颜色两档同为金） */
  echoIsStardust: boolean;
  bestLine: string;
  hasBest: boolean;
  reviveText: string;
  /** 复活钮剩余次数（文案与热区都用它；0 时 `canRevive` 已为假） */
  reviveRemain: number;
  restartText: string;
  prestigeText: string;
  menuText: string;
  rankText: string;
  hasRank: boolean;
  doubleText: string;
  canRevive: boolean;
  canDouble: boolean;
}

/** 读数 + 存档 → 一屏文案；十处字面量与 Web drawGameOver 的 fillText 实参逐字对应 */
export function buildGameOverContent(save: GameOverSaveView, run: GameOverRunView, L: GameOverLayout): GameOverContent {
  const canRevive = gameOverCanRevive(save.dailyTalentClaimed, run.reviveUsed);
  const canDouble = !run.doubleClaimed;
  const stardust = run.stardustEarnedThisRun > 0;
  return {
    title: "阵亡",
    timeLine: `生存 ${gameOverFormatTime(run.elapsed)}`,
    waveLine: `波次 ${run.wave} · 击杀 ${run.kills}`,
    echoLine: stardust
      ? `星尘 +${run.stardustEarnedThisRun}(天赋已满,回响点数转化为星尘)`
      : `回响点数 +${run.pointsEarnedThisRun}(累计 ${save.points})`,
    echoIsStardust: stardust,
    bestLine: save.bestRun ? `最佳纪录:击杀 ${save.bestRun.kills} · ${gameOverFormatTime(save.bestRun.seconds)}` : "",
    hasBest: !!save.bestRun,
    reviveText: `看广告复活(剩余 ${gameOverReviveLimit(save.dailyTalentClaimed) - run.reviveUsed} 次)`,
    reviveRemain: Math.max(0, gameOverReviveLimit(save.dailyTalentClaimed) - run.reviveUsed),
    restartText: "重开 (R)",
    prestigeText: "天赋 (T)",
    menuText: "菜单 (M)",
    rankText: run.rankImprovedTo != null ? `已超越幻影第 ${run.rankImprovedTo} 名` : "",
    hasRank: run.rankImprovedTo != null,
    doubleText: canDouble ? "广告 ×2 回响" : "已领双倍",
    canRevive: canRevive && L.canRevive,
    canDouble: canDouble && L.canDouble,
  };
}

/**
 * 写入意图：广告双倍回响那一笔。字段与 Web `settleEcho(pointsEarnedThisRun)` 的两笔入账
 * 一一对应（`permanent → save.points`、`day → save.dayEcho`），外加把会话态 `doubleClaimed` 置真。
 * **已领 / 数额为 0 时返回 null**（Web 那里是 `!doubleClaimed && hitDoubleBtn` 的前置闸门，
 * 领过一次就再也进不了这一支）。
 */
export interface GameOverEchoClaim {
  kind: "echo";
  persists: true;
  /** 结算进 `points` 的永久部分（Web `splitEcho` 的 40%） */
  permanent: number;
  /** 结算进 `dayEcho` 的本日部分（Web `splitEcho` 的 60%，次日清零） */
  day: number;
  /** 被翻倍的那一笔本局回响（展示值，不改） */
  total: number;
}

/** 双倍回响的写入意图（纯函数：只吃「本局回响 + 是否已领」两个入参） */
export function gameOverEchoClaim(total: number, claimed: boolean): GameOverEchoClaim | null {
  if (claimed) return null;
  const { permanent, day } = splitEcho(total);
  return { kind: "echo", persists: true, permanent, day, total };
}

/**
 * 热区：五枚，顺序与 Web handleTap 的 gameover 分支逐条对应。
 *  - `revive` 与 `double` 都各自带形态前置（Web 的 `canRevive()` 与 `!doubleClaimed`），
 *    形态不成立时那一片就不再是热区，点击会**继续往下走**后面的判定（Web 同语义：
 *    那两支只是 `if` 没进去，三钮行照判）；
 *  - 三钮行互不重叠（118 + 8 步进），但复活钮与三钮行之间、双倍钮与三钮行之间都留有空档，
 *    那些空档以及横幅 / 立绘 / 读数一律不命中；
 *  - 复活与双倍命中的那一下都**不离开本屏**（复活成功才切回战斗，双倍留在原地改配色），
 *    所以它们不产生「换屏」这件事，只有 `double` 产写入意图。
 */
export type GameOverAction =
  | { kind: "revive" }
  | { kind: "double" }
  | { kind: "restart" }
  | { kind: "prestige" }
  | { kind: "menu" };

const inRect = (r: GoRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 命中判定（对标 Web handleTap 的 gameover 分支：五支按序、其余一律吞掉） */
export function hitGameOver(L: GameOverLayout, x: number, y: number): GameOverAction | null {
  if (L.canRevive && inRect(L.reviveBtn, x, y)) return { kind: "revive" };
  if (L.canDouble && inRect(L.doubleBtn, x, y)) return { kind: "double" };
  if (inRect(L.restartBtn, x, y)) return { kind: "restart" };
  if (inRect(L.prestigeBtn, x, y)) return { kind: "prestige" };
  if (inRect(L.menuBtn, x, y)) return { kind: "menu" };
  return null;
}
