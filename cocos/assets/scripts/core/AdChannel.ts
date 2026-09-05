/** 微信激励视频广告位 id,上线前替换为真实值 */
export const REWARDED_AD_UNIT_ID = "adunit-xxxxxxxxxxxxxxxx";

/** 非微信环境的广告模拟时长(ms),与 Web 版 platform/adapter.ts 的 1000ms 同源 */
export const AD_SIMULATE_MS = 1000;

declare const wx: any;

/**
 * 微信小游戏宿主判定:`sys.Platform` 在 3.8 的 d.ts 里是枚举命名空间(没有可用的"当前平台"
 * 取值函数),所以按宿主全局特征判 —— wx.createCanvas 只有小游戏环境才注入。
 */
export function isWechat(): boolean {
    const g = globalThis as Record<string, any>;
    return !!(g.wx && typeof g.wx.createCanvas === "function");
}

/** 延时回调:宿主没有 setTimeout 时立即执行(不让广告链路卡在无回调上) */
function delayMs(ms: number, fn: () => void): void {
    const g = globalThis as Record<string, any>;
    if (typeof g.setTimeout === "function") g.setTimeout(fn, ms);
    else fn();
}

/**
 * 激励视频通道:Web/编辑器环境下按模拟时长直接判定完整观看,
 * 让"看广告补领/翻倍"链路在非微信端也能跑通验收。
 */
export function showRewardedAd(onResult: (ok: boolean) => void): void {
    if (!isWechat()) {
        delayMs(AD_SIMULATE_MS, () => onResult(true));
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

