/**
 * v5「示意图素材」行图标几何(共享层,cc-free):通行证 / 每日 / 委托三屏的列表行在左侧挂一枚
 * 40 见方的图标(档位盾 / 宝箱 / 区域圆图),行内文字整体右移 `ROW_ICON_SHIFT`;委托行另铺一条
 * 风景带(`rowSceneRect`)在图标右侧到行右缘之间。几何只在这里算一次,视图不产第二套数。
 */
export interface RowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 图标边长 / 左缘内缩 / 文字右移量(= 内缩 + 边长 + 一道 8 的缝) */
export const ROW_ICON_BOX = 40;
export const ROW_ICON_DX = 12;
export const ROW_ICON_SHIFT = ROW_ICON_DX + ROW_ICON_BOX + 8 - 16;

/** 行图标盒:左缘 `rect.x + ROW_ICON_DX`,行内垂直居中,偶数落位 */
export function rowIconRect(rect: RowRect): RowRect {
  const size = Math.min(ROW_ICON_BOX, rect.h - 8);
  const y = rect.y + Math.floor((rect.h - size) / 4) * 2;
  return { x: rect.x + ROW_ICON_DX, y, w: size, h: size };
}

/** 行风景带:图标右侧到行右缘,上下各内缩 4(框线之内) */
export function rowSceneRect(rect: RowRect): RowRect {
  const x = rect.x + ROW_ICON_DX + ROW_ICON_BOX + 4;
  return { x, y: rect.y + 4, w: rect.x + rect.w - 4 - x, h: rect.h - 8 };
}
