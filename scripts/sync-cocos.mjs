#!/usr/bin/env node
// 把 web 侧资源镜像到 Cocos 工程的 resources bundle,供 Creator 导入。
// 只新增/覆盖,从不删除:编辑器生成的 .meta 与手工换图不受影响。
// 例外:Cocos 独占 key —— 像素翻新批次只存在于 resources/textures,
// public/assets 里是同名的旧图,镜像过来会把新皮覆盖回去,故一律跳过。
// 另一条例外:Cocos 侧已退役的 key(见 RETIRED_IN_COCOS)同样不镜像,
// 免得旧世代图重新进包;Web 侧照旧读 public/assets,不受影响。
import { readdirSync, statSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "cocos", "assets", "resources");
const ART_DIR = join(ROOT, "artwork");

/**
 * Cocos 独占资产名清单(含 .png 后缀)。
 * 事实源 = artwork/pixel-kit*.json 的出图规格(主菜单批 pixel-kit.json +
 * 战斗 HUD 批 pixel-kit-hud.json):管线每次落盘都写进 resources/textures,
 * 所以这些表里出现的每个 key 都是「Cocos 侧拥有、Web 侧不该反向覆盖」的文件。
 */
function cocosOnlyAssets() {
    const keys = new Set();
    if (!existsSync(ART_DIR)) return new Set();
    const specs = readdirSync(ART_DIR)
        .filter((f) => f.startsWith("pixel-kit") && f.endsWith(".json"))
        .sort();
    for (const spec of specs) {
        const cfg = JSON.parse(readFileSync(join(ART_DIR, spec), "utf8"));
        for (const sheet of cfg.sheets || []) {
            // atlas 模式的产物是一张图集(键 = sheet.atlas),格子本身不落盘
            if (sheet.atlas) keys.add(sheet.atlas);
            for (const cell of sheet.cells || []) {
                if (cell.key) keys.add(cell.key);
                for (const k of cell.keys || []) keys.add(k);
            }
        }
        for (const one of cfg.singles || []) {
            if (one.key) keys.add(one.key);
            for (const k of one.keys || []) keys.add(k);
        }
    }
    return new Set(Array.from(keys).map((k) => `${k}.png`));
}

const COCOS_ONLY = cocosOnlyAssets();

/**
 * Cocos 侧已退役的资产名(含 .png 后缀):Web 冻结基准照旧读 public/assets,
 * 但 Cocos 侧已无消费者、resources/textures 里也不再存文件,镜像回来就是旧世代图重新进包。
 * badge_gem_purple —— 每日屏资源行的钻石图标,退役后那一行走替代字形 + 文本。
 * banner_large_navy_b —— 引导横幅底,改贴像素档 banner_mid_navy(缺帧走代码暗底)。
 * banner_mid_red —— Boss 警告横幅底,改贴像素档 banner_large_red 九宫格。
 * gen-badge-gear-lv / gen-entry-gearup —— 早期美术导入留下的单张原生成件,不在 ASSET_MANIFEST 里,
 *   两侧都无消费者;像素档 badge_gear_lv / entry_gearup 已在出,留着只是包体重量。
 * 下面 21 个是「Cocos 侧无绘制点名」的旧世代位图(逐个 grep 过 scripts 全树 + resources/config,
 * 只剩 ASSET_MANIFEST 登记;屏上实测 17 屏的旧世代抽样也没出现),对应新画法一律走像素档或代码描边:
 *   横幅族 banner_mid_iron / banner_mid_navy_b / banner_mid_red_b / banner_title_abyss / banner_title_gold_a
 *     → 标题档 banner_title_gold_b,引导档 banner_mid_navy,Boss 档 banner_large_red;
 *   条族 bar_hp / bar_boss_hp / bar_progress_blue / bar_progress_gold → bar_capsule 与像素档 bar_progress_*_b;
 *   词缀族 affix_death_chain / affix_heal_aura / affix_mist / affix_reflect_field / affix_space_warp /
 *     affix_time_dilation → 只有 affix_boss 有绘制点,其余六枚两侧都从未上屏;
 *   徽标族 badge_season / badge_star_gold → badge_gear_lv 等像素档 + 代码星标;
 *   通用件 btn_close(关闭钮走代码描边)、divider_bar_dark(分隔带走代码线)、
 *     icon_wechat_share(本机无微信通路)、panel_gearup(装备升级底改 panel_dark_corners);
 *   品质框 frame_highlight_gold → 现行档是 frame_<品质> 五档(frame_common/rare/epic/legendary/hidden),
 *     本键两头都不被该模板命中,全树无绘制点、17 屏逐 Sprite 清点从未采到。
 */
const RETIRED_IN_COCOS = new Set([
    "badge_gem_purple.png",
    "banner_large_navy_b.png",
    "banner_mid_red.png",
    "gen-badge-gear-lv.png",
    "gen-entry-gearup.png",
    "banner_mid_iron.png",
    "banner_mid_navy_b.png",
    "banner_mid_red_b.png",
    "banner_title_abyss.png",
    "banner_title_gold_a.png",
    "bar_hp.png",
    "bar_boss_hp.png",
    "bar_progress_blue.png",
    "bar_progress_gold.png",
    "affix_death_chain.png",
    "affix_heal_aura.png",
    "affix_mist.png",
    "affix_reflect_field.png",
    "affix_space_warp.png",
    "affix_time_dilation.png",
    "badge_season.png",
    "badge_star_gold.png",
    "btn_close.png",
    "divider_bar_dark.png",
    "icon_wechat_share.png",
    "panel_gearup.png",
    "frame_highlight_gold.png",
]);

const PAIRS = [
    { from: join(ROOT, "public", "assets"), to: join(OUT, "textures"), filter: (f) => f.endsWith(".png") },
    { from: join(ROOT, "public", "config"), to: join(OUT, "config"), filter: (f) => f.endsWith(".json") },
];

function needsCopy(src, dst) {
    if (!existsSync(dst)) return true;
    const a = statSync(src);
    const b = statSync(dst);
    return a.size !== b.size || a.mtimeMs > b.mtimeMs;
}

let copied = 0;
let skipped = 0;
let guarded = 0;
let retired = 0;
for (const { from, to, filter } of PAIRS) {
    if (!existsSync(from)) {
        console.warn(`[sync-cocos] 源目录不存在,跳过:${from}`);
        continue;
    }
    mkdirSync(to, { recursive: true });
    let pairGuarded = 0;
    for (const file of readdirSync(from)) {
        if (!filter(file)) continue;
        if (COCOS_ONLY.has(file)) {
            guarded++;
            pairGuarded++;
            continue;
        }
        if (RETIRED_IN_COCOS.has(file)) {
            retired++;
            continue;
        }
        const src = join(from, file);
        const dst = join(to, file);
        if (!needsCopy(src, dst)) {
            skipped++;
            continue;
        }
        copyFileSync(src, dst);
        copied++;
        console.log(`[sync-cocos] ${basename(to)}/${file}`);
    }
    if (pairGuarded) console.log(`[sync-cocos] ${basename(to)}:保留 Cocos 独占 ${pairGuarded} 个(不回灌)`);
}
console.log(`[sync-cocos] 完成:新增/更新 ${copied} 个,已是最新 ${skipped} 个,Cocos 独占保护 ${guarded} 个,Cocos 侧退役不镜像 ${retired} 个`);
