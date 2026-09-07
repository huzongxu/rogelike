/**
 * 像素贴图清单 —— 纯数据,不含渲染调用。
 *
 * 事实源 = `artwork/pixel-kit*.json`(主菜单 `pixel-kit.json` / 战斗 `pixel-kit-hud.json` /
 * 商店 `pixel-kit-shop.json` / 三屏 `pixel-kit-batch3.json` / 每日与委托 `pixel-kit-batch5.json`
 * 五份出图规格)。
 * 这里只回答一个问题:「哪些资产键的值是像素艺术,必须最近邻采样」。
 *
 * 分工:本文件被共享层与 Cocos 两侧同时读到,`setFilters()` 只发生在
 * `GameShell.loadFrames()`(共享层禁止 import cc,见 tests/shared-purity.test.ts)。
 *
 * 单位约定:除 `bg_menu` / `bg_shop` / `bg_stage_1` 按 1 逻辑 px = 1 贴图像素出图外,其余 key 的
 * 1 art px = 规格里的 `module`(=2)逻辑 px;走九宫格的那批在出图时已按 `export=2` 把 art
 * 网格烘进 PNG,所以它们的贴图像素 = 逻辑 px ÷ 1。
 */

/** 面板族与按钮族:走九宫格 SLICED,切边带由 Cocos 按 1 贴图像素 = 1 逻辑 px 绘制 */
const NINE_SLICE_KEYS: readonly string[] = [
  "menu_row_plate",
  "menu_note_plate",
  "menu_strip_plate",
  "menu_chip_plate",
  "menu_section_strip",
  "menu_set_plate",
  "menu_set_plate_selected",
  "menu_title_plate",
  "btn_primary",
  "btn_minor",
  /* 商店批(artwork/pixel-kit-shop.json):五档品质卡框,同一张中性板 + 各自顶带色 */
  "frame_common",
  "frame_rare",
  "frame_epic",
  "frame_legendary",
  "frame_hidden",
  /* 三屏批(artwork/pixel-kit-batch3.json):本批唯一走 Plate 的 slice 档的键,
     扭蛋 / 装备升级 / 通行证的面板底都落在这张上(export=2 已把 art 网格烘进 PNG) */
  "panel_dark_corners",
  /* 五批(artwork/pixel-kit-batch5.json):confirm 的标题横幅,Web 走 drawNine(切深 13),
     本批按 art 边 6 + export=2 出图,viewTable.nineSlice.keys 记 12(= 6 × module) */
  "banner_mid_navy",
];

/** 主菜单入口图标 */
const ENTRY_KEYS: readonly string[] = [
  "entry_forge",
  "entry_gacha",
  "entry_gearup",
  "entry_pass",
  "entry_quests",
  "entry_talents",
];

/** 货币图标 */
const CURRENCY_KEYS: readonly string[] = ["icon_gold", "icon_echo", "icon_stardust", "icon_ticket"];

/** 纹章(`crest` 是 `crest_echo` 的同图别名,供非菜单屏复用) */
const CREST_KEYS: readonly string[] = ["crest_echo", "crest"];

/** 像素数字与符号字形,键 = `pxnum_<字符>`,字符见 PIXEL_NUM_CHARS */
export const PIXEL_NUM_CHARS: readonly string[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  ",",
  "+",
  "×",
  "%",
  "/",
];

/** 字形 key:`pxnum_dot` / `pxnum_comma` …… 与 `pixel-kit.json` 的 digits 表同名 */
export const PIXEL_NUM_KEY_OF: Record<string, string> = {
  ".": "pxnum_dot",
  ",": "pxnum_comma",
  "+": "pxnum_plus",
  "×": "pxnum_times",
  "%": "pxnum_pct",
  "/": "pxnum_slash",
};

const PXNUM_KEYS: readonly string[] = [
  ...["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => `pxnum_${d}`),
  ...Object.values(PIXEL_NUM_KEY_OF),
];

/** 细网格底图:非粗像素,但仍由同一批管线产出,采样口径与本批一致 */
const BACKDROP_KEYS: readonly string[] = ["bg_menu", "bg_shop", "bg_stage_1"];

/** 战斗 HUD 批(artwork/pixel-kit-hud.json):双坞九宫格板 + 技能槽 + 胶囊条 + 摇杆两件套 */
const HUD_KEYS: readonly string[] = [
  "hud_dock_top",
  "hud_dock_bottom",
  "slot_skill",
  "bar_capsule",
  "joy_base",
  "joy_knob",
];

/**
 * 三屏批(artwork/pixel-kit-batch3.json)的整图拉伸件:两端都是 `assets.draw` / `skinBar` /
 * `skinHeader` 那一条路径,单个四边形拉满绘制矩形,永不切边;`module=2` → 屏上 2 倍最近邻。
 */
const BATCH3_STRETCH_KEYS: readonly string[] = [
  "banner_large_purple",
  "banner_title_gold_b",
  "bar_progress_blue_b",
  "bar_progress_purple",
  "bar_pass_nodes",
  "btn_back",
  "badge_gear_lv",
  "badge_pennant_purple",
  "mark_check_green",
];

/**
 * 五批(artwork/pixel-kit-batch5.json)的整图拉伸件:每日 / 委托两屏的标题横幅与进度条、
 * 羊皮纸面板与页签整条,以及后续屏的横幅件,单个四边形拉满绘制矩形,永不切边;
 * `module=2` → 屏上 2 倍最近邻。羊皮纸面板在 commission 走 Plate 的 stretch 档。
 */
const BATCH5_STRETCH_KEYS: readonly string[] = [
  "banner_title_gold_c",
  "banner_title_iron",
  "banner_purple_cosmic",
  "banner_mid_blue",
  "banner_mid_bronze",
  "banner_mid_black",
  "banner_large_navy_a",
  "banner_large_red",
  "bar_progress_teal",
  "tabs_talent_three",
  "panel_parchment",
];

/** 本批全部像素 key(去重后的稳定顺序) */
export const PIXEL_ART_KEYS: readonly string[] = [
  ...NINE_SLICE_KEYS,
  ...ENTRY_KEYS,
  ...CURRENCY_KEYS,
  ...CREST_KEYS,
  ...PXNUM_KEYS,
  ...BACKDROP_KEYS,
  ...HUD_KEYS,
  ...BATCH3_STRETCH_KEYS,
  ...BATCH5_STRETCH_KEYS,
];

const PIXEL_ART_SET = new Set<string>(PIXEL_ART_KEYS);

/** 该资产键是否属于像素艺术批次(决定要不要设 NEAREST) */
export function isPixelArtKey(key: string): boolean {
  return PIXEL_ART_SET.has(key);
}

/** 单个字符的像素字形 key;不在字形表内返回 "" —— 调用方据此回落系统字体 */
export function pixelNumKey(ch: string): string {
  return /^[0-9]$/.test(ch) ? `pxnum_${ch}` : PIXEL_NUM_KEY_OF[ch] ?? "";
}

/** 该资产键是否像素字形帧(pxnum_*):字形是掩码,加载期要键出封闭字腔的红族残留 */
export function isPixelNumFrameKey(key: string): boolean {
  return key.indexOf("pxnum_") === 0;
}

/** 整串是否都能用像素字形表达(空串不算) */
export function isPixelNumText(text: string): boolean {
  // Array.from 而非 [...text]:构建把字符串展开 downlevel 成 [].concat(text),整串会变单元素
  return text.length > 0 && Array.from(text).every((ch) => pixelNumKey(ch) !== "");
}
