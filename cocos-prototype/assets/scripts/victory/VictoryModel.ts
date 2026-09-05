/**
 * 通关结算屏的**内容与命中 + 写入意图**（纯逻辑，cc-free）—— Web `src/game.ts:drawVictory`
 * 的文案侧(3746-3849)、`handleTap` 的 victory 分支(582-596)、`victory()` 的会话态投影
 * (1704-1767) 与 `settleEcho`(1797-1803) 的分支侧抽取。
 *
 * 分工与前十屏同构：几何一律问共享层 `game/ui/victoryLayout.ts`，本文件只产「每处写什么文本、
 * 这一下该往存档写什么」。颜色档不在这里 —— 取表（`core/ViewTable.ts` 的 `phase4` 段，键前缀 `vi`）。
 *
 * 三条纪律：
 *  ① **本文件一笔账都不算**：通关账目（星数 / 首通翻倍 / 成长奖励 / 券 / 回响 / 星尘 / 装备掉落 /
 *     解锁下一关 / 名次提示）在战斗层 `BattleSim.victory()` 里已经按 Web 同位算完并落盘，
 *     屏上读的就是那一份 payload 的投影；本文件不重算第二遍，也不复制任何一张表；
 *  ② 数值与判据一律走既有函数：回响折算走 `splitEcho`、缺省回响回落走 `stageEchoReward`、
 *     关卡框贴图键走 `frameQualityForStage`、★/☆ 串走 `starsText`；
 *  ③ **本文件不写存档**：`victoryEchoClaim()` 只返回一份增量描述，落 `points` / `dayEcho` /
 *     `pointsEarnedThisRun` 与 `persist()` 全在宿主 `GameShell`（`commitVictoryEcho`）。
 *     本文件也没有随机源，一屏内容全部由「通关 payload + 双倍已领位」决定，同一份入参永远同一屏。
 *
 * 五条 Web 原样口径（照抄，不在本层「修好」）：
 *  1. **双倍回响的取数是 `pointsEarnedThisRun || stageEchoReward(currentStage?.id ?? 1)`**：
 *     正常路径下 `victory()` 刚把 `pointsEarnedThisRun` 写成 `echo`，那个回落取不到；只有
 *     `echo` 折算成 0 的极低关卡才会走回落档（回落用的是**关卡表基础值**，不带成长与首通倍率，
 *     于是那一档可能比屏上「回响点数 +0」那一行显示的数还大 —— Web 就这么写的，原样带上）。
 *     而 `currentStage` 在通关屏上必然非空（`victory()` 首行就 `if (!st) return`），
 *     那个 `?? 1` 是纯防御，本层把它做成显式入参以便单测覆盖无尽档；
 *  2. **双倍入账后屏上那三行读数纹丝不动**：它们念的是 `stageReward`（通关那一刻的定格），
 *     只有双倍钮的配色与文字会跟着 `doubleClaimed` 变；`settleEcho` 内部还会把
 *     `pointsEarnedThisRun` 改写成本次结算的 `total`，本层按同一口径产出、由宿主落，
 *     但那个字段在本屏与后续路径都不再被读（离开本屏只能回主菜单，下一个开局点会清零）；
 *  3. **通关屏与死亡屏互斥，`stardustEarnedThisRun` 只有这里会是非零**：Web 的星尘行读的是
 *     `stageReward.stardust`（不是那个会话字段），两者同源同数；死亡屏那一支才是死代码；
 *  4. **本屏只有两枚热区，且没有「重开 / 天赋」**：Web victory 分支就两支 ——
 *     双倍（带 `!doubleClaimed` 前置）与底部条 `x ∈ [w/2−95, w/2+95] ∧ y ∈ [h−62, h−18]`
 *     → `backToMenu()`，除此之外本屏不响应任何点击。返回落点因此是 `menu`，不是 `battle`；
 *  5. **关卡框行只在 `frameUnlockedThisRun != null` 时有**：那一格只在「本关首次拿满 3 星
 *     且框收藏里还没有」时非空（`stars === 3 && prevStars < 3 && frameNew`），补星拿到的框
 *     走菜单那条口、不经过本屏。
 */

import { frameQualityForStage } from "../game/data/quality";
import { stageEchoReward, splitEcho } from "../game/data/stages";
import { starsText } from "../game/data/season";
import type { VictoryLayout } from "../game/ui/victoryLayout";

/**
 * 通关 payload 的会话态投影 —— **宿主持有，不入档**（对标 Web 的 `currentStage` / `victoryStars` /
 * `stageReward` / `stageDrops` / `firstClearBonus` / `frameUnlockedThisRun` / `rankImprovedTo` /
 * `pointsEarnedThisRun` / `doubleClaimed` 九个私有字段）。战斗层在 `world.over` 后停止推进，
 * 所以这一份就是通关那一刻的定格快照。
 */
export interface VictoryRunView {
  /** 本关定义的最小投影（Web 只读 `id` 与 `name`）；无尽局为 null */
  stage: { id: number; name: string } | null;
  /** 通关星数（Web 的 `victoryStars`，`calcStars` 的 1~3；0 表示这一支整棵不进） */
  stars: number;
  /** 通关那一刻的三行奖励（Web 的 `stageReward`；未通关时为 null，那一支整棵不进） */
  reward: { tickets: number; points: number; stardust: number } | null;
  /** 新入收藏的装备件数（Web 的 `stageDrops`：只数没重复的那些，重复的已折进 `save.stardust`） */
  drops: number;
  /** 每日首通加成是否生效（Web 的 `firstClearBonus`，同时是券 ×2 / 回响 ×1.5 的落账标记） */
  firstClearBonus: boolean;
  /** 本局新解锁的关卡框号（Web 的 `frameUnlockedThisRun`） */
  frameUnlocked: number | null;
  /** 幻影榜名次提示（Web 的 `rankImprovedTo`） */
  rankImprovedTo: number | null;
  /** 本局预结算回响（Web 的 `pointsEarnedThisRun`，双倍那一笔的取数） */
  pointsEarnedThisRun: number;
  /** 本局双倍是否已领（Web 的 `doubleClaimed`） */
  doubleClaimed: boolean;
}

/** 布局入参的两个位（视图与命中都读这一份；stars 决定星数行枚数，canDouble 只改配色与前置） */
export function victoryForms(run: VictoryRunView): { stars: number; canDouble: boolean } {
  return { stars: run.stars, canDouble: !run.doubleClaimed };
}

/** 一屏文案（八个 `has*` 位对应 Web 的八个 if 分支；视图按位整棵起落容器） */
export interface VictoryContent {
  title: string;
  stageLine: string;
  hasStage: boolean;
  /** 星数行的枚数（0 时整棵收起，Web 的 `if (this.victoryStars > 0)`） */
  stars: number;
  hasStars: boolean;
  /** 星数贴图整幅缺图时的替代字形（Web 的 `drawn === 0` 分支） */
  starText: string;
  firstClearText: string;
  hasFirstClear: boolean;
  /** Web 的 `const r = this.stageReward; if (r)` —— 三行奖励同进同退 */
  hasReward: boolean;
  ticketText: string;
  echoText: string;
  stardustText: string;
  /** Web 的 `if (r.stardust > 0)`；0 星尘的关卡这一行不出，图标也不出 */
  hasStardust: boolean;
  dropText: string;
  hasDrops: boolean;
  rankText: string;
  hasRank: boolean;
  frameText: string;
  hasFrame: boolean;
  /** 关卡框贴图键（`avatar_<品质>`，与 Web drawAvatarFrame 同一映射） */
  frameBadgeKey: string;
  /** 框心数字（Web 的 `String(stageId)`，只在贴图到位那一档被画出来） */
  frameBadgeText: string;
  menuText: string;
  doubleText: string;
  canDouble: boolean;
}

/** 关卡框贴图键（与 Web `drawAvatarFrame` 的 `avatar_${frameQualityForStage(stageId)}` 同一出口） */
export function victoryFrameBadgeKey(stageId: number): string {
  return `avatar_${frameQualityForStage(stageId)}`;
}

/** 读数快照 → 一屏文案；十三处字面量与 Web drawVictory 的 fillText 实参逐字对应 */
export function buildVictoryContent(run: VictoryRunView, L: VictoryLayout): VictoryContent {
  const r = run.reward;
  const canDouble = !run.doubleClaimed;
  return {
    title: "通关!",
    stageLine: run.stage ? `第${run.stage.id}关 · ${run.stage.name}` : "",
    hasStage: !!run.stage,
    stars: L.stars,
    hasStars: L.stars > 0,
    starText: starsText(L.stars),
    firstClearText: "每日首通!奖励 ×2 / 回响 ×1.5",
    hasFirstClear: run.firstClearBonus,
    hasReward: !!r,
    ticketText: r ? `扭蛋券 +${r.tickets}` : "",
    echoText: r ? `回响点数 +${r.points}` : "",
    stardustText: r ? `星尘 +${r.stardust}` : "",
    hasStardust: !!r && r.stardust > 0,
    dropText: run.drops > 0 ? `掉落装备 ×${run.drops}(已入收藏 · 提供基础数值)` : "",
    hasDrops: run.drops > 0,
    rankText: run.rankImprovedTo != null ? `已超越幻影第 ${run.rankImprovedTo} 名` : "",
    hasRank: run.rankImprovedTo != null,
    frameText: run.frameUnlocked != null ? `解锁关卡框 · 第 ${run.frameUnlocked} 关` : "",
    hasFrame: run.frameUnlocked != null,
    frameBadgeKey: run.frameUnlocked != null ? victoryFrameBadgeKey(run.frameUnlocked) : "",
    frameBadgeText: run.frameUnlocked != null ? String(run.frameUnlocked) : "",
    menuText: "返回菜单 (R)",
    doubleText: canDouble ? "广告 ×2 回响" : "已领双倍",
    canDouble: canDouble && L.canDouble,
  };
}

/** 双倍那一笔的取数（Web 的 `this.pointsEarnedThisRun || stageEchoReward(this.currentStage?.id ?? 1)`） */
export function victoryEchoTotal(pointsEarnedThisRun: number, stageId: number | null): number {
  return pointsEarnedThisRun || stageEchoReward(stageId ?? 1);
}

/**
 * 写入意图：广告双倍回响那一笔。字段与 Web `settleEcho(echo)` 的三笔改写一一对应
 * （`permanent → save.points`、`day → save.dayEcho`、`total → pointsEarnedThisRun`），
 * 外加把会话态 `doubleClaimed` 置真。
 * **已领时返回 null**（Web 那里是 `!doubleClaimed && hitDoubleBtn` 的前置闸门，
 * 领过一次就再也进不了这一支）。数额为 0 时仍给意图 —— Web 没有 `if (total > 0)` 前置。
 */
export interface VictoryEchoClaim {
  kind: "echo";
  persists: true;
  /** 结算进 `points` 的永久部分（Web `splitEcho` 的 40%） */
  permanent: number;
  /** 结算进 `dayEcho` 的本日部分（Web `splitEcho` 的 60%，次日清零） */
  day: number;
  /** 本次结算的总额（Web `settleEcho` 顺手写进 `pointsEarnedThisRun` 的那个值） */
  total: number;
}

/** 双倍回响的写入意图（纯函数：只吃「取数结果 + 是否已领」两个入参） */
export function victoryEchoClaim(total: number, claimed: boolean): VictoryEchoClaim | null {
  if (claimed) return null;
  const { permanent, day } = splitEcho(total);
  return { kind: "echo", persists: true, permanent, day, total };
}

/**
 * 热区：两枚，顺序与 Web handleTap 的 victory 分支逐条对应。
 *  - `double` 带形态前置（Web 的 `!this.doubleClaimed`），领取后那一片不再是热区，点击会
 *    **继续往下走**返回条的判定（Web 同语义：那一支只是 `if` 没进去）；
 *  - 两枚矩形不相交（双倍钮底边 `h − 82`、返回钮顶缘 `h − 62`，中间 20px 缝）；
 *  - 双倍命中不离开本屏（只改配色与文字），返回命中切 `menu`；除此之外本屏一律吞掉点击。
 */
export type VictoryAction = { kind: "double" } | { kind: "menu" };

/** 命中判定（对标 Web handleTap 的 victory 分支：两支按序、其余一律吞掉） */
export function hitVictory(L: VictoryLayout, x: number, y: number): VictoryAction | null {
  const inRect = (r: { x: number; y: number; w: number; h: number }): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (L.canDouble && inRect(L.doubleBtn)) return { kind: "double" };
  if (inRect(L.menuBtn)) return { kind: "menu" };
  return null;
}
