import { view, Node, UITransform, ResolutionPolicy } from "cc";

export const DESIGN_W = 560;
export const DESIGN_H_MIN = 996;
export const DESIGN_H_MAX = 1246;

/** 战斗世界纵向钳制高度,与 Web 版战场锁 560×996 同源 */
export const WORLD_H_CAP = DESIGN_H_MIN;

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

let _designH = DESIGN_H_MIN;

export function designHeight(winW: number, winH: number): number {
    if (winW <= 0) return DESIGN_H_MIN;
    const h = Math.round((winH * DESIGN_W) / winW);
    return Math.min(DESIGN_H_MAX, Math.max(DESIGN_H_MIN, h));
}

export function refreshDesignResolution(): number {
    const size = view.getFrameSize();
    _designH = designHeight(size.width, size.height);
    view.setDesignResolutionSize(DESIGN_W, _designH, ResolutionPolicy.FIXED_WIDTH);
    return _designH;
}

export function logicalH(): number {
    return _designH;
}

export function worldH(): number {
    return Math.min(_designH, WORLD_H_CAP);
}

export function fullRect(): Rect {
    return { x: 0, y: 0, w: DESIGN_W, h: _designH };
}

/**
 * 把沿用自 Web 版的"左上原点设计像素矩形"一次性换算为 Cocos 节点位置。
 * 纯布局函数继续输出左上坐标,只在落到节点上的这一刻做转换。
 * ax/ay = 锚点(默认居中);左对齐文本传 ax=0、右对齐传 ax=1、顶对齐传 ay=1,
 * 位置公式对任意锚点成立:Label 的 NONE 溢出会改写 contentSize,锚点定位不受内容宽度影响。
 */
export function placeRect(node: Node, r: Rect, W: number = DESIGN_W, H: number = logicalH(), ax = 0.5, ay = 0.5): void {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setAnchorPoint(ax, ay);
    ui.setContentSize(r.w, r.h);
    node.setPosition(r.x + r.w * ax - W / 2, H / 2 - (r.y + r.h * (1 - ay)), 0);
}

/** 源图按矩形做 cover 裁剪后的实际尺寸(替代 Sprite.SizeMode.FITTED 的自算版本) */
export function coverRect(r: Rect, srcW: number, srcH: number): Rect {
    if (srcW <= 0 || srcH <= 0) return r;
    const scale = Math.max(r.w / srcW, r.h / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}
