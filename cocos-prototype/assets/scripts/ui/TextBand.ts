/**
 * 文本带的对齐换算(纯数学,cc-free)。
 *
 * Web 侧一行文本只有一个入口:`ctx.textAlign` + `fillText(t, x, baseY)`,其中 x **随对齐改变语义**
 * —— left 是起笔、center 是中心、right 是末笔。共享层布局函数(`game/ui/shop.ts`、
 * `game/ui/heroSelectLayout.ts`)交回来的也是这些锚点值,视图层因此不该再套任何二次平移。
 *
 * Cocos 侧 `placeRect` 吃的是**盒**。本文件就是两者之间唯一的那一步:按对齐把锚点折回盒左沿。
 * 折错一档的表现是"右对齐与居中的标签整体右移半个盒宽",越出屏幕右缘或压住相邻文本。
 *
 * 单独成文件的原因:这段数学必须能在 node 侧直测(没有真机也要挡得住同类回归),
 * 所以不能和 `cc` 的 Node/Label 放在同一个模块里。
 */

/** 文本横向对齐,取值与 `ctx.textAlign` 一致 */
export type TextAlign = "left" | "center" | "right";

/** 盒(左上原点设计像素),与 `core/DesignMetrics.Rect` 同形 */
export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 对齐 → 横向锚点系数:盒左沿 + w × ax 就是该对齐下的锚点位 */
export function alignAx(align: TextAlign): number {
  return align === "left" ? 0 : align === "right" ? 1 : 0.5;
}

/**
 * 一行文本的盒。
 * @param x      Web fillText 的锚点 x(左=起笔 / 中=中心 / 右=末笔)
 * @param baseY  Web fillText 的基线 y
 * @param maxW   限宽(= 容器内宽,已扣内缩);文本超宽由 `fitOne` 截断到这里
 * @param px     字号
 * @param lift   基线抬升系数(`viewTable().menu.baselineLift`,由调用方给,保持本文件无表依赖)
 *
 * 不变式:`盒右沿 = x + maxW × (1 − ax) ≤ x + maxW`,于是只要锚点本身在容器内,盒必在容器内。
 */
export function anchorBand(x: number, baseY: number, maxW: number, px: number, align: TextAlign, lift: number): Band {
  const ax = alignAx(align);
  return { x: x - maxW * ax, y: Math.round(baseY - px * lift), w: maxW, h: Math.round(px * 1.25) };
}
