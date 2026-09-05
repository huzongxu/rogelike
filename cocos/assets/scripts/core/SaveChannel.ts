import { sys } from "cc";

/** 与 Web 版 src/systems/save.ts 的 KEY 同源,存档结构直接复用 */
export const SAVE_KEY = "echo-abyss-save-v1";

export function readSave<T = any>(): T | null {
    try {
        const raw = sys.localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function writeSave(data: any): boolean {
    try {
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

export function clearSave(): void {
    try {
        sys.localStorage.removeItem(SAVE_KEY);
    } catch {
        /* 存储不可用时忽略 */
    }
}
