export const SCREEN_KEYS = [
    "battle",
    "menu",
    "shop",
    "pass",
    "victory",
    "gameover",
    "prestige",
    "fusion",
    "commission",
    "gacha",
    "daily",
    "energy",
    "season",
    "leaderboard",
    "gearup",
    "heroes",
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface ScreenNode {
    active: boolean;
    onShow?: () => void;
    onHide?: () => void;
    refresh?: () => void;
}

/**
 * 16 态 UI 状态机的宿主。Web 版里由 `state.screen` 字符串 + 主循环 if-else 分发,
 * 迁移后每个屏幕是一个挂在 Screen 层下的节点,路由只负责切换 active 与回调。
 */
export class ScreenRouter {
    private _screens = new Map<ScreenKey, ScreenNode>();
    private _current: ScreenKey = "battle";

    onChange: ((prev: ScreenKey | null, next: ScreenKey) => void) | null = null;

    register(key: ScreenKey, node: ScreenNode): void {
        this._screens.set(key, node);
    }

    get current(): ScreenKey {
        return this._current;
    }

    show(key: ScreenKey): boolean {
        const next = this._screens.get(key);
        if (!next) return false;
        const prev = this._current;
        if (prev !== key) {
            const old = this._screens.get(prev);
            if (old && old.active) {
                old.active = false;
                if (old.onHide) old.onHide();
            }
        }
        this._current = key;
        if (!next.active) {
            next.active = true;
            if (next.onShow) next.onShow();
        }
        if (next.refresh) next.refresh();
        if (this.onChange) this.onChange(prev === key ? null : prev, key);
        return true;
    }

    currentScreen(): ScreenNode | null {
        return this._screens.get(this._current) || null;
    }

    /** 战斗以外的屏幕暂停战斗推进,与 Web 版 `screen !== "battle"` 门控等价 */
    blocksPlay(): boolean {
        return this._current !== "battle";
    }

    refresh(): void {
        const node = this._screens.get(this._current);
        if (node && node.refresh) node.refresh();
    }
}
