import { view } from "cc";
import { DESIGN_H_MIN, DESIGN_W, designHeight, refreshDesignResolution } from "./DesignMetrics";
import { HEX } from "../ui/Widgets";

/**
 * 手机档视口：把构建包默认那块 1280×960 的横屏画布盒收成竖屏手机盒。
 *
 * 为什么要在 DOM 层做：`DesignMetrics.refreshDesignResolution()` 读的是 frameSize 的**宽高比**
 * （designH = round(frameH × 560 / frameW) 再钳进 996..1246）。横屏盒下 FIXED_WIDTH 会把
 * 560 设计宽映射到 1280 设备像素、996 设计高映射到 960 设备像素，两个方向的比例不同，
 * 于是整画面被非等比拉扁、像素档的 2 倍网格也跟着歪。让盒的宽高比恒等于设计档 560:996，
 * 缩放就是各向同性的一档，designH 也正好落回标定档 996。
 *
 * 桌面窗口常见高度与 996 同量级，所以默认进页面即接近 1:1 的像素档。
 */
export function applyPhoneViewport(): void {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const div = document.getElementById("GameDiv");
    if (!div) return;

    const availW = window.innerWidth || DESIGN_W;
    const availH = window.innerHeight || DESIGN_H_MIN;
    /**
     * 先按窗口比例选本帧设计高（`designHeight` 钳在 996..1246，与 refreshDesignResolution
     * 同一把尺），再按这一档等比求缩放：桌面 1280×960 落回 996 档，20:9 的长屏手机自动走
     * 更高一档并铺满，不会被钉死在 560:996 而白扔一截高度。
     */
    const designH = designHeight(availW, availH);
    /** 能 1:1 就 1:1（像素档最干净），放不下按短边等比缩，永不放大 */
    const scale = Math.max(0.1, Math.min(1, availW / DESIGN_W, availH / designH));
    const w = Math.max(1, Math.round(DESIGN_W * scale));
    const h = Math.max(1, Math.round(designH * scale));

    const style = div.style;
    style.position = "absolute";
    style.left = "50%";
    style.top = "50%";
    style.transform = "translate(-50%, -50%)";
    style.margin = "0";
    style.border = "0";
    style.borderRadius = "0";
    style.boxShadow = "none";
    style.width = `${w}px`;
    style.height = `${h}px`;

    // 模板自带的标题与页脚会把盒从视口中心顶开；页面底用与游戏内同一档深色，两侧留黑读作边框
    const body = document.body;
    if (body) {
        body.style.overflow = "hidden";
        body.style.backgroundColor = HEX.bgDeep;
        for (const cls of ["header", "footer"]) {
            for (const el of Array.from(document.getElementsByClassName(cls))) {
                (el as HTMLElement).style.display = "none";
            }
        }
        // 缩放档下浏览器默认平滑位图，像素档的硬边会糊成灰边；最近邻才保住 2 倍网格
        for (const cv of Array.from(document.getElementsByTagName("canvas"))) {
            (cv as HTMLCanvasElement).style.imageRendering = "pixelated";
        }
    }

    view.setFrameSize(w, h);
    refreshDesignResolution();
}

/** 挂一次窗口监听：盒随窗口重算，比例不变，所以任何尺寸下都不会再出现非等比拉伸 */
export function watchPhoneViewport(): void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener("resize", applyPhoneViewport);
}
