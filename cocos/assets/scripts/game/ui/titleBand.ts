/**
 * v5「示意图素材」顶带徽记几何(共享层,cc-free):v4 通栏 64 高的标题带左端挂一枚 36 见方的
 * 圆徽记(素材表 emblem_a_N),标题起笔随之从 16 右移到 60。八个带顶带的屏共用这一份数,
 * 体力屏经 energyLayout.enV4Title 间接读它(该屏视图不得出现内联数字)。
 */
export interface TbRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 徽记盒:左缘 12、带内垂直居中(64 − 36 = 28 → 14) */
export const TB_ICON: TbRect = { x: 12, y: 14, w: 36, h: 36 };
/** 标题右移量 = 徽记左缘 + 边长 − 原起笔 16 + 一道 8 的缝 */
export const TB_TITLE_DX = TB_ICON.x + TB_ICON.w - 16 + 8;
export const TB_TITLE_X = 16 + TB_TITLE_DX;
