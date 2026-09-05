/**
 * 赛季通行证屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawPass`
 * 的文案侧(2618-2713)与 `onPassClick` 的分支侧(2715-2743)抽取,外加两个私有方法的语义搬运。
 *
 * 分工与 Phase 4 前两屏同构:几何一律问共享层 `game/ui/passLayout.ts`,本文件只产
 * "每行写什么、解锁没解锁、领了没领、右文三态取哪一档",外加命中判定与**写入意图**。
 *
 * 三条纪律:
 *  ① 数值规则一律走共享层既有函数(`PASS_TIERS` / `PASS_PREMIUM_MULT` / `calcPassProgress`),
 *     本文件不复制判据;
 *  ② **本文件不写存档**:`passClaim()` 只返回一份增量描述(`PassClaim`),真正落字段与
 *     `persist()` 由宿主 `GameShell` 做,激励视频也只在宿主那一侧发起(唯一入口 `watchAd`);
 *  ③ 模型不读全局:存档与赛季都以入参给出,同一份意图可以被测试冻结比对。
 *
 * 两个私有方法的搬运口径(逐项对标 Web):
 *  - `passProgress()` = `calcPassProgress(save.points, save.dayEcho, Σ save.stageStars)`,
 *    即"累计回响 = 永久回响 + 本日回响 + 关卡星数 × PASS_STAR_WEIGHT"(策划案 V3 §4.2);
 *  - `premiumActive()` = `save.premiumPass || save.premiumPassSeason === save.seasonId`,
 *    遗留布尔(调试/发放)**或**本赛季看广告激活。赛季翻页只递增 `seasonId`、不动
 *    `premiumPassSeason`,于是比较自然转假 —— 本屏不需要任何重置代码。
 *
 * 两条 Web 原样行为(照抄,不在本层"修好"):
 *  1. **领取不按行命中**:`onPassClick` 判完返回钮与激活行后不再算点在第几行,任何一次点击
 *     都去领 `PASS_TIERS[save.passTier]` 这一档(不满足条件就静默 return)。所以 `hitPass`
 *     的三个分支就是"返回钮 → 激活行 → 其余一律 claimNext",档位行的矩形根本不参与命中。
 *  2. **顺序领取 + 倍率**:只有 `i < passTier` 的行显示"已领取";只有当前 `passTier` 档在
 *     `prog >= need` 时可领;`premiumActive()` 时券与星尘都乘 `PASS_PREMIUM_MULT`。
 */

import { PASS_PREMIUM_MULT, PASS_TIERS, calcPassProgress } from "../game/data/pass";
import type { PassLayout, PsRect } from "../game/ui/passLayout";

/**
 * 本屏要读的存档字段(SaveModel 结构上天然兼容)。
 * `stageStars` 是 `passProgress()` 的星数加权项,与 `points` / `dayEcho` 同属进度输入。
 */
export interface PassSaveView {
  points: number;
  dayEcho: number;
  stageStars: readonly number[];
  seasonId: number;
  premiumPass: boolean;
  premiumPassSeason: number;
  passTier: number;
}

/** 累计回响(Web `passProgress()` 的同款口径:永久 + 本日 + 星数加权) */
export function passProgress(save: PassSaveView): number {
  const stars = save.stageStars.reduce((s, n) => s + n, 0);
  return calcPassProgress(save.points, save.dayEcho, stars);
}

/** 高级轨是否生效(Web `premiumActive()` 的同款口径:遗留布尔或本赛季看广告激活) */
export function premiumActive(save: PassSaveView): boolean {
  return save.premiumPass || save.premiumPassSeason === save.seasonId;
}

/** 右列三态(与配色/字号/基线档位一一对应) */
export type PassStatusKind = "claimed" | "ready" | "locked";

/** 一个档位行的内容:claimed 决定行底色与右文,unlocked 决定行边线与左列首行色档 */
export interface PassRowContent {
  index: number;
  need: number;
  /** `档位 i · 回响 need` */
  nameText: string;
  /** `免费:扭蛋券×n + 星尘×m` */
  freeText: string;
  /**
   * `高级:×2` —— **Web 里是字面量**,不随 `PASS_PREMIUM_MULT` 插值。
   * 这里原样照抄,并由 `tests/cocos-phase4-pass.test.ts` 同时锁住
   * `PASS_PREMIUM_MULT === 2` 与"本串 === `高级:×${PASS_PREMIUM_MULT}`":
   * 将来改倍率时两条断言都会响,而当前实现仍与 Web 逐字一致。
   */
  premiumText: string;
  statusText: string;
  status: PassStatusKind;
  /** prog >= need(行边线与左列首行的色档) */
  unlocked: boolean;
  /** i < passTier(行底色、右文与对勾) */
  claimed: boolean;
  /** Web 仅在 claimed 分支 draw `mark_check_green` */
  showCheck: boolean;
}

/** 一屏文案 */
export interface PassContent {
  title: string;
  /** 回响统计行正文(Web 单行三段:`累计回响 X · 本日 Y · 永久 Z`) */
  echoText: string;
  /** 高级轨状态行正文 */
  premText: string;
  /** 徽标贴图键;空串 = 不尝试绘制(Web 的非 prem 分支根本不 draw) */
  premBadgeKey: string;
  /** 未激活 → 这一格是"看广告激活"按钮(底板取 `L.actPlate`);已激活 → 只是一行状态文字 */
  actButton: boolean;
  /** 激活行正文(两档文案都由 premiumActive() 门控) */
  actText: string;
  /** 累计回响(进度分子),与 `maxNeed` 一起决定总进度条 */
  prog: number;
  /** 最高档需求(分母);Web `PASS_TIERS[last]?.need ?? 1` */
  maxNeed: number;
  /** 0..1 之外的值由 `passProgressRects` 钳制(Web skinBar 同口径) */
  progressFrac: number;
  /** 总进度文字 `总进度 min(prog,maxNeed)/maxNeed` */
  progressText: string;
  rows: PassRowContent[];
  backText: string;
}

/**
 * 一次点击落到的热区。第三个分支就是 Web 的原样语义:
 * 判完前两个热区后**不再按行命中**,屏内其余任何位置都算"领下一档"。
 */
export type PassAction = { kind: "back" } | { kind: "activate" } | { kind: "claimNext" };

/**
 * 写入意图:宿主照着它逐字段落账。模型只描述"该加多少、该把哪个赛季 id 写进
 * `premiumPassSeason`、`passTier` 该推进几档",不持有存档引用。
 */
export interface PassClaim {
  /** 是否要先看完一次激励视频(激活高级轨为 true;领取档位恒为 false) */
  needsAd: boolean;
  /** 加法式增量(宿主 `save.x += claim.x`) */
  gachaTicket: number;
  stardust: number;
  /** 写入 `premiumPassSeason` 的赛季 id(null = 不动这一字段) */
  premiumPassSeason: number | null;
  /** `passTier` 的增量(0 = 不动;Web 的领取是 `+= 1`) */
  passTierDelta: number;
  /** 生效的奖励倍率(仅用于宿主提示与测试断言,不落字段) */
  mult: number;
}

const inRect = (r: PsRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 存档 → 一屏文案。行数恒 = PASS_TIERS.length,与 layout 同源 */
export function buildPassContent(save: PassSaveView): PassContent {
  const prog = passProgress(save);
  const prem = premiumActive(save);
  const maxNeed = PASS_TIERS[PASS_TIERS.length - 1]?.need ?? 1;
  return {
    title: "赛季通行证",
    echoText: `累计回响 ${prog} · 本日 ${save.dayEcho} · 永久 ${save.points}`,
    premText: prem ? "高级轨已激活(奖励翻倍)" : "高级轨未激活",
    premBadgeKey: prem ? "badge_pennant_purple" : "",
    actButton: !prem,
    actText: prem
      ? save.premiumPass
        ? "✓ 已激活 · 档位奖励 ×2"
        : "✓ 本赛季已看广告激活 · 档位奖励 ×2(下赛季需重新激活)"
      : "▶ 看广告激活高级轨(奖励×2 · 本赛季有效)",
    prog,
    maxNeed,
    progressFrac: prog / maxNeed,
    progressText: `总进度 ${Math.min(prog, maxNeed)}/${maxNeed}`,
    rows: PASS_TIERS.map((tier, i) => {
      const unlocked = prog >= tier.need;
      const claimed = i < save.passTier;
      return {
        index: i,
        need: tier.need,
        nameText: `档位 ${i + 1} · 回响 ${tier.need}`,
        freeText: `免费:扭蛋券×${tier.tickets} + 星尘×${tier.stardust}`,
        premiumText: "高级:×2",
        statusText: claimed ? "已领取" : unlocked ? "可领取" : "未解锁",
        status: claimed ? "claimed" : unlocked ? "ready" : "locked",
        unlocked,
        claimed,
        showCheck: claimed,
      };
    }),
    backText: "返回",
  };
}

/**
 * 命中判定(对标 Web onPassClick 的三段顺序:返回钮 → 激活行 → 其余一律领下一档)。
 * 已激活时点激活行返回 null(Web 在那里也什么都不做),但**不会穿透到领取**,
 * 因为 Web 判完这一格就 return 了 —— 这是第二条原样行为的另一半,必须保持。
 */
export function hitPass(L: PassLayout, c: PassContent, x: number, y: number): PassAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  if (inRect(L.actRect, x, y)) return c.actButton ? { kind: "activate" } : null;
  return { kind: "claimNext" };
}

/**
 * 动作 → 写入意图(纯)。领取档不存在(`passTier` 越界)或进度不够一律 null,
 * 与 Web 在那里直接 return 同一语义(点了没反应)。
 * `activate` 只写 `premiumPassSeason = seasonId`(赛季翻页自然失效),不发任何奖励。
 */
export function passClaim(save: PassSaveView, a: PassAction): PassClaim | null {
  switch (a.kind) {
    case "back":
      return null;
    case "activate": {
      if (premiumActive(save)) return null;
      return { needsAd: true, gachaTicket: 0, stardust: 0, premiumPassSeason: save.seasonId, passTierDelta: 0, mult: 1 };
    }
    case "claimNext": {
      const tier = PASS_TIERS[save.passTier];
      if (!tier) return null;
      if (passProgress(save) < tier.need) return null;
      const prem = premiumActive(save);
      const mult = prem ? PASS_PREMIUM_MULT : 1;
      return {
        needsAd: false,
        gachaTicket: tier.tickets * mult,
        stardust: tier.stardust * mult,
        premiumPassSeason: null,
        passTierDelta: 1,
        mult,
      };
    }
  }
}
