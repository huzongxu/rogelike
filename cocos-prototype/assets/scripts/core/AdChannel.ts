import { sys } from "cc";

/** 微信激励视频广告位 id,上线前替换为真实值 */
export const REWARDED_AD_UNIT_ID = "adunit-xxxxxxxxxxxxxxxx";

/** 非微信环境的广告模拟时长(ms),与 Web 版 platform/adapter.ts 的 1000ms 同源 */
export const AD_SIMULATE_MS = 1000;

declare const wx: any;

export function isWechat(): boolean {
    if (sys.Platform === sys.Platform.WECHAT_GAME) return true;
    const g: any = globalThis as any;
    return !!(g.wx && typeof g.wx.createCanvas === "function");
}

/**
 * 激励视频通道:Web/编辑器环境下按模拟时长直接判定完整观看,
 * 让"看广告补领/翻倍"链路在非微信端也能跑通验收。
 */
export function showRewardedAd(onResult: (ok: boolean) => void): void {
    if (!isWechat()) {
        setTimeout(() => onResult(true), AD_SIMULATE_MS);
        return;
    }
    try {
        const ad = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        const onClose = (res: any) => {
            ad.offClose(onClose);
            onResult(!!(res && res.isEnded));
        };
        ad.onClose(onClose);
        ad.show().catch(() => {
            ad.load()
                .then(() => ad.show())
                .catch(() => {
                    ad.offClose(onClose);
                    onResult(false);
                });
        });
    } catch {
        onResult(false);
    }
}
