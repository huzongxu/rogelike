/**
 * 策划配置表加载器 —— public/config/balance.json → 各数值模块。
 *
 * 约定:
 *  - 配置缺失/字段非法:对应字段回退内置默认值,游戏照常运行(永不因配置炸掉)。
 *  - 每个数值模块(daily/stages/waves/chapters/gacha/equipmentGen/layoutMenu)各自暴露 applyBalance,
 *    本加载器只做 fetch + 分发;字段校验(类型/范围钳制)在各模块内部完成。
 *  - 浏览器刷新即重新读取(策划改 JSON → F5 生效,无需重构建)。
 *  - 微信小游戏端无 fetch:自动跳过,使用内置默认值。
 */

export interface BalanceLoadResult {
  ok: boolean;
  /** 加载/校验过程中的告警(字段非法被回退等) */
  warnings: string[];
  error?: string;
}

/** 拉取并应用策划配置;任何失败都只告警不抛出 */
export async function loadBalanceConfig(url = "config/balance.json"): Promise<BalanceLoadResult> {
  const warnings: string[] = [];
  if (typeof fetch !== "function") {
    return { ok: false, warnings, error: "当前平台不支持 fetch,使用内置默认数值" };
  }
  let json: unknown;
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, warnings, error: `HTTP ${res.status}` };
    json = await res.json();
  } catch (e) {
    return { ok: false, warnings, error: `读取失败:${e instanceof Error ? e.message : String(e)}` };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, warnings, error: "配置根节点必须是对象" };
  }
  const cfg = json as Record<string, unknown>;
  const section = (name: string): Record<string, unknown> | undefined => {
    const v = cfg[name];
    if (v === undefined) return undefined;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      warnings.push(`配置段 "${name}" 必须是对象,已忽略`);
      return undefined;
    }
    return v as Record<string, unknown>;
  };

  // 动态 import 避免平台层反向依赖数据层细节;各模块自行校验并回退
  const { applyBalance: applyEnergy } = await import("../data/daily");
  const { applyBalance: applyBattle } = await import("../data/stages");
  const { applyBalance: applyWaves } = await import("../systems/waves");
  const { applyBalance: applyChapterType } = await import("../data/chapters");
  const { applyBalance: applyGacha } = await import("../data/gacha");
  const { applyBalance: applyEconomy } = await import("../data/equipmentGen");
  const { applyBalance: applyMenuLayout, menuLayoutWarnings } = await import("../data/layoutMenu");
  const { applyMenuSkin, menuSkinWarnings } = await import("../data/menuSkin");

  applyEnergy({ energy: section("energy"), economy: section("economy") });
  const battle = section("battle");
  applyBattle(battle);
  // waves.chapterLength 未单独配置时,跟随 battle.chapterSeconds,避免两处时长不一致
  const wavesCfg = section("waves") ?? (battle && battle.chapterSeconds !== undefined ? { chapterLength: battle.chapterSeconds } : undefined);
  applyWaves(wavesCfg);
  applyChapterType(section("chapterTypes"));
  applyGacha(section("gacha"));
  applyEconomy(section("economy"));
  applyMenuLayout(section("menuLayout"));
  warnings.push(...menuLayoutWarnings);
  menuLayoutWarnings.length = 0;
  applyMenuSkin(section("menuSkin"));
  warnings.push(...menuSkinWarnings);
  menuSkinWarnings.length = 0;

  if (warnings.length) console.warn("[balance] 部分配置字段非法已回退:", warnings);
  console.info("[balance] 策划配置已应用:", Object.keys(cfg).join(", ") || "(空配置,全部默认值)");
  return { ok: true, warnings };
}
