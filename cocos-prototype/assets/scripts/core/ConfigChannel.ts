import { JsonAsset, resources } from "cc";

type JsonTable = Record<string, any>;

const cache = new Map<string, JsonTable>();

/**
 * 数值表通道。对应 Web 版 `fetch('/config/balance.json')`;
 * Cocos 侧统一走 resources bundle 的 JsonAsset,包内离线可读。
 */
export function loadJsonTable<T extends JsonTable = JsonTable>(path: string): Promise<T | null> {
    return new Promise((resolve) => {
        resources.load(path, JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                resolve(null);
                return;
            }
            const json = asset.json as T;
            cache.set(path, json as JsonTable);
            resolve(json);
        });
    });
}

let balance: JsonTable | null = null;

export function loadBalance(): Promise<JsonTable | null> {
    return loadJsonTable("config/balance").then((t) => {
        if (t) balance = t;
        return t;
    });
}

export function getBalance(): JsonTable | null {
    return balance;
}

export function cachedTable(path: string): JsonTable | null {
    return cache.get(path) || null;
}

/**
 * 取数并兜底,语义对齐 Web 版 applyBalance 的钳制:
 * 只有有限数字生效,其余(缺失/字符串/NaN/Infinity)一律回落默认值。
 */
export function num(table: JsonTable | null, section: string, key: string, fallback: number): number {
    const group = table ? table[section] : null;
    if (!group || typeof group !== "object") return fallback;
    const v = Number(group[key]);
    return Number.isFinite(v) ? v : fallback;
}
