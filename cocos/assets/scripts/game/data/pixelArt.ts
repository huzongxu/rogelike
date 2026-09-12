/**
 * 像素贴图清单 —— 纯数据,不含渲染调用。
 *
 * 事实源 = `artwork/pixel-kit*.json`(主菜单 `pixel-kit.json` / 战斗 `pixel-kit-hud.json` /
 * 商店 `pixel-kit-shop.json` / 三屏 `pixel-kit-batch3.json` / 每日与委托 `pixel-kit-batch5.json` /
 * 英雄立绘 `pixel-kit-heroes.json` / 图标与底板 `pixel-kit-icons.json` /
 * 战斗单位与姿态 `pixel-kit-units.json` / 特效与弹道 `pixel-kit-fx.json` /
 * 战场与外层背景 `pixel-kit-bg.json`(十份出图规格)。
 * 这里回答两个问题:「哪些资产键的值是像素艺术,必须最近邻采样」,
 * 以及「ready 之后这批键按什么顺序流式加载」(streamFrameKeys,纯数组运算)。
 *
 * 分工:本文件被共享层与 Cocos 两侧同时读到,`setFilters()` 只发生在
 * `GameShell.loadFrames()`(共享层禁止 import cc,见 tests/shared-purity.test.ts)。
 *
 * 单位约定:全幅背景族(`bg_menu` / `bg_shop` / `bg_stage_1` … `bg_stage_7` / `bg_outside`)
 * 与图标批、单位批的 SIMPLE 件按 `export=1` 出图,1 贴图像素 = 1 逻辑 px;其余整图拉伸件的
 * 1 art px = 规格里的 `module`(=2)逻辑 px;
 * 走九宫格的那批与特效批在出图时已按 `export=2` 把 art 网格烘进 PNG,所以它们的贴图像素 = 逻辑 px ÷ 1。
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
  /* 图标批(artwork/pixel-kit-icons.json):危险钮与当前行底板,art 边 8 + export=2 */
  "btn_danger",
  "menu_row_plate_current",
  /* 战斗 HUD v4(artwork/pixel-kit-chrome.json):底坞装备卡的铁框,art 边 8,透明心压在暗面上 */
  "hud_card_frame",
  /* v5 素材表(artwork/pixel-kit-v5.json):体力屏三钮 —— 金面 / 紫面 / 蓝面,art 边 10 */
  "btn_gold",
  "btn_tab", "btn_iron", "chip_eff", "btn_wide", "row_thin", "card_tall",
  "btn_purple",
  "btn_blue",
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

/**
 * 细网格底图:非粗像素,但仍由同一批管线产出,采样口径与本批一致。
 * 后七枚来自战场与外层背景批(artwork/pixel-kit-bg.json),绘制盒即全屏 560×996,
 * 由 `BattleWorldView.setBackdrop` 按 `bg_stage_<关卡>` / `bg_outside` 取用。
 */
const BACKDROP_KEYS: readonly string[] = [
  "bg_menu",
  "bg_shop",
  "bg_stage_1",
  "bg_stage_2",
  "bg_stage_3",
  "bg_stage_4",
  "bg_stage_5",
  "bg_stage_6",
  "bg_stage_7",
  "bg_outside",
];

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
/** 英雄立绘批（pixel-kit-heroes.json）：12 名半身像，行缩略与详情共用同一键 */
const HERO_KEYS: readonly string[] = [
  "hero_vera", "hero_kyle", "hero_bran", "hero_sia", "hero_nora", "hero_loka",
  "hero_doran", "hero_rayne", "hero_sally", "hero_willow", "hero_oden", "hero_mu",
];

/**
 * 图标批(artwork/pixel-kit-icons.json)的 SIMPLE 件:export=1 → 贴图像素 = 逻辑 px 1:1,
 * art 档 = 17 屏实机清点的绘制盒,整图拉伸、永不切边。
 */
const ICON_KEYS: readonly string[] = [
  "affix_boss", "icon_fragment",
  "intel_horde", "intel_armor", "intel_mutant", "intel_elite",
  "icon_set_barrage", "icon_set_ember", "icon_set_frost", "icon_set_magma", "icon_set_phantom", "icon_set_thorn",
  "avatar_common", "avatar_rare", "avatar_epic", "avatar_legendary", "avatar_hidden", "icon_star_gold",
  "icon_fx_knife", "icon_fx_nova", "icon_fx_skeleton", "icon_fx_cloud", "icon_fx_chain",
  "icon_fx_shield", "icon_fx_drain", "icon_fx_icelance", "icon_fx_frost_ring", "icon_fx_meteor", "icon_fx_magma_trail",
  "icon_fx_spirit_wolves", "icon_fx_haunt_crown", "icon_fx_ray",
  "emblem_flow_gold", "badge_shield_bronze", "card_soldout",
];

/**
 * 单位批(artwork/pixel-kit-units.json)的 SIMPLE 件:13 枚敌人 + 关底、玩家本体与 5 枚姿态立绘。
 * 与图标批同口径(export=1 → 贴图像素 = 逻辑 px 1:1,art 档 = 实机清点的绘制盒),
 * 整图 contain 绘制、永不切边;战斗里随半径缩放的那批同样走这张表,所以也必须最近邻。
 */
const ENEMY_KEYS: readonly string[] = [
  "enemy_chaser", "enemy_swift", "enemy_hider", "enemy_goldkind", "enemy_reflector", "enemy_splitter",
  "enemy_splitling", "enemy_devourer", "enemy_shieldguard", "enemy_summoner", "enemy_tank", "enemy_elite",
  "enemy_god", "enemy_boss",
];

/** 玩家本体 + 5 枚姿态立绘(姿态件只在结算与英雄展示上屏,战斗里画的是 `player`) */
const PLAYER_KEYS: readonly string[] = ["player", "player_pose_1", "player_pose_2", "player_pose_4", "player_pose_5", "player_pose_6"];

const UNIT_KEYS: readonly string[] = [...ENEMY_KEYS, ...PLAYER_KEYS];

/**
 * S1「回响苏醒」赛季怪 30 枚 + S1 三英雄战斗件(artwork/pixel-kit-s1.json,scripts/pixel-variants.mjs 派生):
 * 由基线 enemy_<kind> / player 做 OKLCH 色相重映射 + 回响主题贴花得到,export=1、尺寸与基线件逐键相等,
 * 战斗里随半径缩放,同样必须最近邻。渲染链 monster_<variantId> → enemy_<kind> 已就位,这批把 S1 的 30 个键填满。
 */
export const S1_MONSTER_KEYS: readonly string[] = [
  "monster_echo_walker", "monster_resonance_body", "monster_hollow_hum", "monster_whisper_rot",
  "monster_tremor_body", "monster_echo_shell", "monster_after_tone", "monster_first_awake",
  "monster_vibrant_cadaver", "monster_afterimage_echo", "monster_harmonics_ghost", "monster_rapid_hum", "monster_echo_lurker",
  "monster_resonant_carapace", "monster_reverb_rockmail", "monster_huming_shieldwalker", "monster_echo_giantshell", "monster_standing_wave_hulk",
  "monster_splitting_tone", "monster_mute_hider", "monster_wound_reflector", "monster_sound_devourer", "monster_hum_wallguard", "monster_echo_seed",
  "monster_tone_leader", "monster_abyss_herald", "monster_myriad_bone_marshal", "monster_first_echo",
  "monster_primeval_echo", "monster_empty_valley_lord",
];

/** 出战英雄的战斗件 player_<heroId>(S1 三人;缺图回退通用 player) */
export const PLAYER_HERO_KEYS: readonly string[] = ["player_vera", "player_kyle", "player_bran"];

/**
 * 特效批(artwork/pixel-kit-fx.json)的贴花与弹道:export=2 把 art 网格按 2× 烘进 PNG,
 * 满张绘制盒恰好等于 PNG 尺寸(1 贴图像素 = 1 逻辑 px)。绘制盒随特效生命周期伸缩
 * (nova 从 0 涨到 200、爆炸反向收缩),缩放是设计意图,但采样档仍必须是最近邻。
 */
const FX_KEYS: readonly string[] = [
  "fx_nova", "fx_blast", "fx_chain", "fx_drain", "fx_shield", "fx_poison", "fx_summon", "proj_lightning",
];

/**
 * 战斗第一拍要画的像素件:像素数字字形 + 玩家本体 + 敌人 + 特效弹道。
 * ready 前只 await `HUD_PRELOAD_KEYS`(坞板那批构建期定格的件),这一批改为 ready 之后
 * **排在流式队列最前**先到位——它们是每帧从 frames 现读的,晚到一拍只是晚出现,不会永久缺图;
 * 而把它们放在 await 集合里会让 ready 时间按枚数线性上涨(实测约 5 ms/枚)。
 */
export const BATTLE_FIRST_PAINT_KEYS: readonly string[] = [
  ...PXNUM_KEYS,
  ...ENEMY_KEYS,
  ...S1_MONSTER_KEYS,
  "player",
  ...PLAYER_HERO_KEYS,
  ...FX_KEYS,
];

/**
 * 主菜单 v4「深渊铭刻」新增件(artwork/pixel-kit-chrome.json):关卡行窗景(各关战场背景裁条,528×76,
 * SIMPLE 拉伸铺满行框)、行序号勋章两档、英雄像框。都是 SIMPLE 件,贴图像素 = 逻辑 px。
 */
const MENU_V4_KEYS: readonly string[] = [
  "menu_row_medal", "menu_row_medal_cur", "menu_port_frame",
  "menu_scene_1", "menu_scene_2", "menu_scene_3", "menu_scene_4", "menu_scene_5", "menu_scene_6", "menu_scene_7",
];

/**
 * v5 素材表(artwork/pixel-kit-v5.json,用户给的示意图素材切件):行图标 / 勋章 / 立绘 / 横幅,
 * 全部 SIMPLE、export=1。chrome 覆盖件(btn_primary 等)沿用原键,不在此重复登记。
 */
/** v6:第二批示意图素材表(artwork/pixel-kit-v6.json)的整图件;切边件已在 NINE_SLICE_KEYS */
const V6_KEYS: readonly string[] = [
  "lv_emblem_1", "lv_emblem_2", "lv_emblem_3", "shop_art_1", "shop_art_2", "shop_art_3", "scene_menu_top", "scene_castle", "scene_castle_strip",
];

const V5_KEYS: readonly string[] = [
  "pass_progress_banner", "ribbon_dark", "pass_tier_1", "pass_tier_2", "pass_tier_3", "pass_tier_4",
  "pass_tier_5", "daily_box_wood", "daily_box_silver", "daily_box_gold", "daily_talent_1", "daily_talent_2",
  "daily_talent_3", "comm_region_1", "comm_region_2", "comm_region_3", "comm_region_4", "comm_region_5",
  "comm_region_6", "rank_medal_1", "rank_medal_2", "rank_medal_3", "rank_medal_4", "rank_medal_5",
  "rank_medal_6", "rank_medal_7", "rank_medal_8", "rank_medal_9", "rank_medal_10", "rank_medal_11",
  "energy_emblem", "victory_scene", "gameover_scene", "emblem_common", "emblem_rare", "emblem_epic",
  "emblem_legendary", "emblem_hidden", "daily_potion", "emblem_a_1", "emblem_a_2", "emblem_a_3",
  "emblem_a_4", "emblem_a_5", "emblem_a_6", "emblem_a_7", "emblem_a_8", "emblem_a_9",
  "emblem_a_10", "emblem_a_11", "shop_chest_gold", "shop_chest_purple", "shop_chest_blue",
];

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
  ...HERO_KEYS,
  ...ICON_KEYS,
  ...UNIT_KEYS,
  ...S1_MONSTER_KEYS,
  ...PLAYER_HERO_KEYS,
  ...FX_KEYS,
  ...MENU_V4_KEYS,
  ...V5_KEYS,
  ...V6_KEYS,
];

/**
 * ready 之后要流式加载的完整队列(纯数组运算,单测可直接调)。
 * 队首是战斗第一拍那批,其后依次是像素批次的其余件、清单里其余的世界美术;
 * 三份输入里出现过的键只出一次,已 await 与已退役的不进队列。
 * 「谁在 ready 前 await」由调用方传进来,本函数不认识 GameShell 的那两张表。
 */
export function streamFrameKeys(
  awaited: readonly string[],
  retired: readonly string[],
  manifestKeys: readonly string[],
): string[] {
  const seen = new Set<string>([...awaited, ...retired]);
  const out: string[] = [];
  const push = (keys: readonly string[]) => {
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  };
  push(BATTLE_FIRST_PAINT_KEYS);
  push(PIXEL_ART_KEYS);
  push(manifestKeys);
  return out;
}

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

/**
 * 随赛季主题换色的 chrome 键(artwork/pixel-kit-chrome.json 里带 `seasonAccent` 的格子):
 * 主题 0 用基名文件,主题 n≥1 用 `<key>_t<n>.png`。frames 里始终以**基名**登记,视图与
 * viewTable.nineSlice.keys 都只认基名;文件名的选择只发生在 `GameShell.loadFrames()` 那一处。
 * 主题下标 = `seasonThemeIndex(seasonId)`(game/data/seasonSets.ts),与主题表同序循环。
 */
export const SEASON_ACCENT_KEYS: readonly string[] = ["menu_title_plate", "menu_set_plate_selected"];

export function seasonSkinFile(key: string, themeIndex: number): string {
  if (themeIndex <= 0 || SEASON_ACCENT_KEYS.indexOf(key) < 0) return key;
  return `${key}_t${Math.floor(themeIndex)}`;
}
