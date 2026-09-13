/**
 * 升级三选一策划规范表 —— 局内玩家升级时弹出的那三张卡的全部策略数值与文案标签的唯一出处。
 *
 * 开发准则见 docs/DESIGN-VALUES-SPEC.md:改数值改本文件、备注同步、跑 `npm test`。
 * 依据 docs/DESIGN-SEASON-FEEL.md 批次 A · A2(需求 F9:升级时能选保留哪个 / 重新随机)。
 *
 * 与相邻两张表的分工:
 *  - 重随价格曲线与隐藏概率/保底在 ./reroll(`rerollPrice` / `REROLL_HIDDEN`),本文件不重述;
 *  - 卡等级与品质权重在 ./quality 与 ./equipmentGen(`generateChoices`),本文件不重算;
 *  - 本文件只放"这一屏自己"的策略档位:出几张卡、能锁几张、哪支天赋开保底稀有、
 *    以及强化数值差那一行要用的中文标签(键取自 `UPGRADE_MAIN_KEYS`,不另立第二份键表)。
 */

import { UPGRADE_MAIN_KEYS } from "./equipmentGen";
import type { TalentId } from "./talents";

/**
 * 每次升级弹出的卡数(三选一)。
 * 含义:一轮弹层里的卡片张数;单位:张;
 * 依据:docs/DESIGN-SEASON-FEEL.md 批次 A · A2「三张卡各带『选它 / 重随 / 锁定』」,
 *      与 `generateChoices(level, count, …)` 的 count 实参同一支。
 */
export const LEVELUP_OFFER_COUNT = 3;

/**
 * 同时最多锁定几张卡。
 * 含义:一轮弹层里处于锁定态的卡片上限;单位:张;
 * 依据:A2「同时最多锁 1 张,本局内跨弹层记忆」—— 玩家只能囤一张好卡等钱,
 *      多锁就没有取舍了。
 */
export const LEVELUP_LOCK_LIMIT = 1;

/**
 * 开启"三张卡里至少 1 件稀有及以上"保底的天赋(词缀鉴赏)。
 * 含义:天赋 id;单位:枚举;
 * 依据:./talents 主表 `affix_taste` 的 desc「升级时装备选项中至少有1件稀有品质」——
 *      那一支的落点就是本屏,与商店进货的同一支判据共用一个天赋 id,不另立第二份口径。
 */
export const LEVELUP_ENSURE_RARE_TALENT: TalentId = "affix_taste";

/**
 * 强化主数值的中文标签(卡面「数值差」那一行用)。
 * 键集**派生自** `UPGRADE_MAIN_KEYS`(equipmentGen 的唯一一份主数值键表),
 * 于是新增一个主数值键时这里会编译报错,不会出现"表里有键、卡面没标签"的静默失效。
 * 含义:主数值参数名 → 卡面显示名;单位:文案;
 * 依据:./equipmentGen 的 `describeEffect` 里各效果对这些键的既有中文叫法
 *      (damage = 伤害、dps = 每秒伤害、heal = 恢复生命、amount = 护盾吸收)。
 */
export const LEVELUP_MAIN_LABELS: Record<(typeof UPGRADE_MAIN_KEYS)[number], string> = {
  damage: "伤害",
  dps: "秒伤",
  heal: "治疗",
  amount: "护盾",
};

/**
 * 每章免费重随次数(次)。
 * 含义:升级弹层里「重随」钮一章内能按几次;进下一章清零;
 * 依据:docs/DESIGN-HERO-RHYTHM.md §6 —— 独有技能不花金币,金币重随退役,
 *      保留一次免费重随作为"三张全是烂牌"的补救。
 */
export const LEVELUP_FREE_REROLL_PER_CHAPTER = 1;

/**
 * 首章法宝三选一的张数(张)与共鸣保底(张)。
 * 含义:进第 1 章前从 N 张主动法宝里免费挑 1 张,其中至少 M 张与本命节律共鸣;
 * 依据:docs/DESIGN-HERO-RHYTHM.md §6 / Q7 裁定(开局选择要具体、可见、带这局的信息)。
 */
export const FIRST_PICK_COUNT = 3;
export const FIRST_PICK_RESONANCE_GUARANTEE = 1;
