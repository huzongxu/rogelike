/**
 * 商店策划规范表 —— 章间商店价格曲线与刷卡策略数值的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 品质基础价(基数)在 ./quality 主表;商店卡价 = 基础价 × 本表曲线。
 */

/** 商店卡价曲线:价格 = 品质基础价 × (1 + 本局已购 × perPurchase) × (1 + 章节 × perChapter) */
export const SHOP_PRICE_CURVE = {
  /** 本局每已购 1 张卡,后续卡价 +12%(局内金币出口节奏,防囤币扫货) */
  perPurchase: 0.12,
  /** 每章 +3%(局内通胀,随进程卡价自然上移) */
  perChapter: 0.03,
} as const;

/** 手动刷新价曲线:成本 = (base + 章节 × perChapter) × growth^本章已刷次数 */
export const SHOP_REFRESH_CURVE = {
  /** 刷新基础价(金) */
  base: 8,
  /** 每章 +2 金(后期刷新更贵) */
  perChapter: 2,
  /** 本章内每刷一次指数底数 ×1.6(几何增长,防无限刷新刷卡;进下一章清零) */
  growth: 1.6,
} as const;

/** 进化补位费倍率:2 张合 1 需付 品质基础价 × 本值;3 张满组合成免费(保留"凑满"奖励感) */
export const MERGE_FEE_MULT = 2;
/** 销毁回收比率:返还 品质基础价 × 本值(50%,与 quality 主表 basePrice 备注口径一致) */
export const DESTROY_REFUND_RATE = 0.5;
/** "合成可达成"援助概率:把一张商店卡替换为玩家已持有卡的同款(同效果+同品质),便于凑 3 张升品 */
export const DUPLICATE_OFFER_CHANCE = 0.4;
/** 套组专属卡池偏向:刷出本套卡的概率(选套组后生效;当季强化套更高,赛季结束回落) */
export const SET_OFFER_BIAS = {
  /** 赛季限定套当季强化中(策划案 DESIGN-SEASON-SETS:60% → 70%) */
  seasonBoosted: 0.7,
  /** 常规套组 */
  normal: 0.6,
} as const;

/** 商店卡价格(金):基础价 × 已购递增 × 章节递增 */
export function shopCardPrice(basePrice: number, totalBought: number, chapter: number): number {
  return Math.round(basePrice * (1 + totalBought * SHOP_PRICE_CURVE.perPurchase) * (1 + chapter * SHOP_PRICE_CURVE.perChapter));
}

/** 手动刷新价格(金):随章节与本关已刷次数递增 */
export function shopRefreshPrice(chapter: number, refreshesThisChapter: number): number {
  const c = SHOP_REFRESH_CURVE;
  return Math.round((c.base + chapter * c.perChapter) * Math.pow(c.growth, refreshesThisChapter));
}
