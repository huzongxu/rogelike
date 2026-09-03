/**
 * Cocos 宿主存档模型 —— 与 Web 版 src/systems/save.ts 的 SaveData 同构。
 *
 * 放在宿主侧(core/,不在 game/ 共享目录内):共享层只接接受显式的
 * "局外配置"入参(cocos-prototype/assets/scripts/game/systems/battleWorld.ts 的 BattleRunInputs),
 * 不复制存档结构;读原始 JSON → 归一化 → 派生入参这条链路由各端宿主各自负责。
 * 持久化走 core/SaveChannel.ts(sys.localStorage)。
 */

import { type TalentId } from "../game/data/talents";
import type { CommissionState } from "../game/data/commissions";
import type { Equipment } from "../game/data/equipmentGen";
import type { SetId } from "../game/data/sets";
import type { HeroId } from "../game/data/heroes";
import { applyHeroSelection, heroOfSetOrNull, normalizeHeroId } from "../game/data/heroes";
import { ENERGY_MAX } from "../game/data/daily";

/** 词缀图鉴:转生后保留,用于定向搜索/词缀预览 */
export interface Collection {
    triggers: string[];
    effects: string[];
    modifiers: string[];
    /** 已遭遇过的敌人:基线怪 = Enemy.kind,赛季主题怪 = variantId */
    enemies: string[];
}

export interface SaveModel {
    points: number;
    ownedTalents: TalentId[];
    collection: Collection;
    bestRun: { kills: number; seconds: number } | null;
    bestWave: number;
    stardust: number;
    gearLevels: Record<string, number>;
    gachaTicket: number;
    highestStage: number;
    stageFurthest: Record<number, number>;
    ownedGear: Equipment[];
    gachaPityEpic: number;
    gachaPityLegendary: number;
    fusionPity: number;
    selectedGearId: number | null;
    dayEcho: number;
    premiumPass: boolean;
    premiumPassSeason: number;
    passTier: number;
    prestiges: number;
    fragments: number;
    commission: CommissionState | null;
    commission2: CommissionState | null;
    selectedHero: HeroId | null;
    selectedSet: SetId | null;
    tutorialDone: boolean;
    energy: number;
    lastEnergyAt: number;
    diamond: number;
    adWatchCount: number;
    energyAdCount: number;
    dailyDate: string;
    dailyBoxClaimed: string[];
    dailyGachaAdUsed: boolean;
    dailyTalentClaimed: string[];
    dailyTalents: string[];
    shopRefreshCount: number;
    seasonId: number;
    seasonStartAt: number;
    stageStars: number[];
    seasonBest: number;
    dailyClearedDate: string;
    dailyClearedStage: number;
    frames: number[];
    makeUpDate: string;
}

/** 关卡星数归一化:固定 8 元素(索引 1–7),每格钳制为 0–3 整数 */
function normalizeStars(raw: unknown): number[] {
    const arr = Array.isArray(raw) ? raw : [];
    const out = [0];
    for (let i = 1; i <= 7; i++) {
        const n = Math.floor(Number(arr[i]) || 0);
        out.push(Math.min(3, Math.max(0, n)));
    }
    return out;
}

/** 归一化存档(与 Web loadSave 同口径;宿主负责读原始 JSON 并注入) */
export function normalizeSave(parsed: any): SaveModel {
    const s: SaveModel = {
        points: Number(parsed?.points) || 0,
        ownedTalents: Array.isArray(parsed?.ownedTalents) ? parsed.ownedTalents : [],
        collection: {
            triggers: parsed?.collection?.triggers ?? [],
            effects: parsed?.collection?.effects ?? [],
            modifiers: parsed?.collection?.modifiers ?? [],
            enemies: parsed?.collection?.enemies ?? [],
        },
        bestRun: parsed?.bestRun ?? null,
        bestWave: Number(parsed?.bestWave) || 0,
        stardust: Number(parsed?.stardust) || 0,
        gearLevels: parsed?.gearLevels && typeof parsed.gearLevels === "object" ? parsed.gearLevels : {},
        gachaTicket: Number(parsed?.gachaTicket) || 0,
        highestStage: Math.max(1, Number(parsed?.highestStage) || 1),
        stageFurthest:
            parsed?.stageFurthest && typeof parsed.stageFurthest === "object" && !Array.isArray(parsed.stageFurthest)
                ? Object.fromEntries(Object.entries(parsed.stageFurthest).map(([k, v]) => [Number(k), Math.max(0, Number(v) || 0)]))
                : {},
        ownedGear: Array.isArray(parsed?.ownedGear) ? parsed.ownedGear : [],
        gachaPityEpic: Number(parsed?.gachaPityEpic) || 0,
        gachaPityLegendary: Number(parsed?.gachaPityLegendary) || 0,
        fusionPity: Number(parsed?.fusionPity) || 0,
        selectedGearId: parsed?.selectedGearId ?? null,
        dayEcho: Number(parsed?.dayEcho) || 0,
        premiumPass: !!parsed?.premiumPass,
        premiumPassSeason: Number(parsed?.premiumPassSeason) || 0,
        passTier: Number(parsed?.passTier) || 0,
        prestiges: Number(parsed?.prestiges) || 0,
        fragments: Number(parsed?.fragments) || 0,
        commission: parsed?.commission ?? null,
        commission2: parsed?.commission2 ?? null,
        selectedHero: normalizeHeroId(parsed?.selectedHero),
        selectedSet: parsed?.selectedSet ?? null,
        tutorialDone: !!parsed?.tutorialDone,
        energy: Number(parsed?.energy) || ENERGY_MAX,
        lastEnergyAt: Number(parsed?.lastEnergyAt) || Date.now(),
        diamond: Number(parsed?.diamond) || 0,
        adWatchCount: Number(parsed?.adWatchCount) || 0,
        energyAdCount: Number(parsed?.energyAdCount) || 0,
        dailyDate: String(parsed?.dailyDate ?? ""),
        dailyBoxClaimed: Array.isArray(parsed?.dailyBoxClaimed) ? parsed.dailyBoxClaimed : [],
        dailyGachaAdUsed: !!parsed?.dailyGachaAdUsed,
        dailyTalentClaimed: Array.isArray(parsed?.dailyTalentClaimed) ? parsed.dailyTalentClaimed : [],
        dailyTalents: Array.isArray(parsed?.dailyTalents) ? parsed.dailyTalents : [],
        shopRefreshCount: Number(parsed?.shopRefreshCount) || 0,
        seasonId: Math.max(1, Number(parsed?.seasonId) || 1),
        seasonStartAt: Number(parsed?.seasonStartAt) || Date.now(),
        stageStars: normalizeStars(parsed?.stageStars),
        seasonBest: Number(parsed?.seasonBest) || 0,
        dailyClearedDate: String(parsed?.dailyClearedDate ?? ""),
        dailyClearedStage: Number(parsed?.dailyClearedStage) || 0,
        frames: Array.isArray(parsed?.frames) ? parsed.frames.filter((n: unknown) => Number(n) >= 1 && Number(n) <= 7).map(Number) : [],
        makeUpDate: String(parsed?.makeUpDate ?? ""),
    };
    // 老档只写 selectedSet → 反查其英雄补齐;镜像恒经唯一写入路径同步
    applyHeroSelection(s, s.selectedHero ?? heroOfSetOrNull(s.selectedSet)?.id ?? null);
    return s;
}

/** 空存档(与 Web EMPTY 同构;体力上限以运行时配置为准) */
export function emptySave(): SaveModel {
    return normalizeSave(null);
}
