/**
 * 装备升级屏的**内容与命中 + 写入意图**(纯逻辑,cc-free)—— Web `src/game.ts:drawGearUp`
 * 的文案侧(3887-3977)与 `onGearUpClick` 的分支侧(3979-4000)抽取。
 *
 * 分工与 Phase 4 前三屏同构:几何一律问共享层 `game/ui/gearUpLayout.ts`,本文件只产
 * "每行写什么、升得起升不起、满级没满级、徽记点亮几颗",外加命中判定与**写入意图**。
 *
 * 三条纪律:
 *  ① 数值规则一律走共享层既有函数(`GEAR_UPGRADE_MAX` / `GEAR_UPGRADE_STEP` /
 *     `COLLECTION_ATK_PCT` / `gearUpgradeCost` / `qualityDef`),本文件不复制判据;
 *  ② **本文件不写存档**:`gearUpClaim()` 只返回一份增量描述(`GearClaim`),真正落字段与
 *     `persist()` 由宿主 `GameShell` 做;本屏没有广告位,`needsAd` 恒 false;
 *  ③ 模型不读全局:`lv` / `cost` / `afford` / `maxed` 都在本帧按存档现算,
 *     同一份意图可以被测试冻结比对。
 *
 * 四条 Web 原样口径(照抄,不在本层"修好"):
 *  1. **命中只看升级钮**:`onGearUpClick` 判完返回钮后只遍历每行的 `btn` 矩形,
 *     行 `rect`(品质框)完全不参与命中 —— 点行内非按钮区域什么都不发生。
 *     这与 pass 的"点任意非热区都领下一档"正相反。
 *  2. **等级按装备名索引**:`gearLevels[eq.name]`,不是 `eq.id`,也不是 `name + quality`。
 *     于是同名装备(不同品质)共用一格等级 —— Web 的 `ownedGear` 入收藏时按
 *     `name && quality` 去重,同名不同品质的两件确实会同时存在并共享等级。
 *  3. **禁用档也产动作**:满级或星尘不足时 `hitGearUp` 仍返回 `upgrade`(Web 的命中层
 *     不看状态),静默发生在 `gearUpClaim` 的守卫里(与 Web 在扣费前 `return` 同语义)。
 *  4. **描述里的两个百分数是 `toFixed(0)` 的产物**,取整方向与拼接顺序都原样保留,
 *     并由常量算出来:下一级贡献 = `COLLECTION_ATK_PCT[quality] × (1 + STEP × (lv + 1))`。
 */

import { COLLECTION_ATK_PCT, GEAR_UPGRADE_MAX, GEAR_UPGRADE_STEP, gearUpgradeCost } from "../game/data/daily";
import { qualityDef, type Quality } from "../game/data/quality";
import type { Equipment } from "../game/data/equipmentGen";
import { GU_ROWS_MAX, type GearUpLayout, type GuRect } from "../game/ui/gearUpLayout";

/**
 * 本屏要读的存档字段(SaveModel 结构上天然兼容)。
 * `ownedGear` 只需要名字与品质两列 —— 收藏贡献按品质查表,等级按名字取。
 */
export interface GearUpSaveView {
  stardust: number;
  /** 按装备名索引的等级字典(`normalizeSave` 的初值是 `{}`,缺失一律按 0 级) */
  gearLevels: Record<string, number>;
  ownedGear: readonly Pick<Equipment, "name" | "quality">[];
}

/** 一行内容:三档门控(`lv` / `maxed` / `afford`)决定底板、文字色与徽记点亮数 */
export interface GearUpRowContent {
  /** 对应 `ownedGear` 的下标(与 layout 的 `rows[i].index` 同值) */
  index: number;
  name: string;
  quality: Quality;
  /** 品质色(`qualityDef(quality).color`):品质框描边与名字色同源 */
  color: string;
  /** 当前等级(`gearLevels[name] ?? 0`) */
  lv: number;
  /** 下一级要花的星尘(`gearUpgradeCost(lv)`;满级时 Web 也照算,只是不进扣费分支) */
  cost: number;
  /** `lv >= GEAR_UPGRADE_MAX` */
  maxed: boolean;
  /** `!maxed && stardust >= cost` —— 唯一走"贴图底 + actionPrimary 文字"那一档的门控 */
  afford: boolean;
  /** 钮文:`maxed ? "已满级" : "<cost> ❋"`(两档,与 `maxed` 一一对应) */
  btnText: string;
  /**
   * 描述行:`Lv.lv/上限 · 收藏贡献 攻+当前% → 下一级%`。
   * 两个百分数是 `toFixed(0)` 的产物,拼接顺序与 Web 逐字一致。
   */
  descText: string;
  /** 徽记点亮颗数(Web 的 `s < lv` 全亮;上限就是 GEAR_UPGRADE_MAX,即徽记槽数) */
  litStars: number;
}

/** 一屏文案(三种形态都由 `ownedGear.length` 推出来) */
export interface GearUpContent {
  title: string;
  /**
   * 副标题 —— 串里的 `+25%` 与 `5 级` 在 Web 是**字面量**,语义分别来自
   * `GEAR_UPGRADE_STEP` 与 `GEAR_UPGRADE_MAX`。这里照抄字面量,由
   * `tests/cocos-phase4-gearup.test.ts` 同时锁住 `GEAR_UPGRADE_STEP === 0.25`、
   * `GEAR_UPGRADE_MAX === 5` 与"本串 === 由这两个常量插值出来的同一串":
   * 将来改数值时三条断言都会响,而当前实现仍与 Web 逐字一致。
   */
  subtitle: string;
  /** 右上星尘(Web `❋ ${save.stardust}`,一枚字面量星形符号 + 数值) */
  stardustText: string;
  /** 空态提示(仅 `ownedGear.length === 0` 时绘制) */
  emptyText: string;
  /** 截断提示(仅 `ownedGear.length > GU_ROWS_MAX` 时绘制;14 就是共享层的 GU_ROWS_MAX) */
  hintText: string;
  /** 是否画截断提示(Web 的 `gear.length > 14`) */
  showHint: boolean;
  rows: GearUpRowContent[];
  backText: string;
}

/**
 * 一次点击落到的热区。与 pass 的三分支不同,这一屏**没有"其余一律"兜底**:
 * 判完返回钮与逐行升级钮后,Web 的 for 循环走完就什么都不做,所以行内非按钮区
 * 与行外空白都返回 null。
 */
export type GearUpAction = { kind: "back" } | { kind: "upgrade"; row: number };

/**
 * 写入意图:宿主照着它逐字段落账。模型只描述"该扣多少星尘、该把哪个键写成几级",
 * 不持有存档引用,于是同一份意图可以被测试冻结比对。
 */
export interface GearClaim {
  /** 本屏没有广告位:恒 false(与 PassClaim 同形,宿主可共用 needsAd 分支) */
  needsAd: false;
  /** 扣减的星尘(宿主 `save.stardust -= claim.stardustCost`) */
  stardustCost: number;
  /** 写入 `gearLevels` 的键 = 装备名(Web 按 name 索引,不按 id) */
  gearLevelKey: string;
  /** 写入 `gearLevels[gearLevelKey]` 的等级值(= 当前 lv + 1) */
  gearLevelTo: number;
  /** 升级前的等级(仅用于宿主提示与测试断言,不落字段) */
  levelFrom: number;
}

const inRect = (r: GuRect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 当前等级(Web 的两处都是 `save.gearLevels[eq.name] ?? 0`,同一出口只写一次) */
export function gearLevelOf(save: GearUpSaveView, name: string): number {
  return save.gearLevels[name] ?? 0;
}

/** 一行的收藏贡献百分比(当前等级或 lv + 1 档):`COLLECTION_ATK_PCT[q] × (1 + STEP × lv)`,`toFixed(0)` 由调用处负责 */
function atkPctAt(quality: Quality, lv: number): number {
  return COLLECTION_ATK_PCT[quality] * (1 + GEAR_UPGRADE_STEP * lv);
}

/** 存档 → 一屏文案。行数 = `min(ownedGear.length, GU_ROWS_MAX)`,与 layout 同源 */
export function buildGearUpContent(save: GearUpSaveView): GearUpContent {
  const gear = save.ownedGear;
  const list = gear.slice(0, GU_ROWS_MAX);
  return {
    title: "装备升级",
    subtitle: "收藏装备 · 永久基础数值(每级 +25% 贡献,上限 5 级)",
    stardustText: `❋ ${save.stardust}`,
    emptyText: "收藏还空着 —— 通关掉落的装备会进入收藏,可在此外侧升级",
    hintText: `仅显示前 ${GU_ROWS_MAX} 件(共 ${gear.length} 件)`,
    showHint: gear.length > GU_ROWS_MAX,
    rows: list.map((eq, i) => {
      const lv = gearLevelOf(save, eq.name);
      const maxed = lv >= GEAR_UPGRADE_MAX;
      const cost = gearUpgradeCost(lv);
      const afford = !maxed && save.stardust >= cost;
      return {
        index: i,
        name: eq.name,
        quality: eq.quality,
        color: qualityDef(eq.quality).color,
        lv,
        cost,
        maxed,
        afford,
        btnText: maxed ? "已满级" : `${cost} ❋`,
        descText: `Lv.${lv}/${GEAR_UPGRADE_MAX} · 收藏贡献 攻+${atkPctAt(eq.quality, lv).toFixed(0)}% → ${atkPctAt(eq.quality, lv + 1).toFixed(0)}%`,
        litStars: lv,
      };
    }),
    backText: "返回",
  };
}

/**
 * 命中判定(对标 Web onGearUpClick 的两段顺序:返回钮 → 逐行只比 `btn` 矩形)。
 * 行 `rect` 不参与命中,循环走完没有命中就是 null —— 点行内非按钮区与点屏内空白
 * 都什么都不发生(与 pass 的"其余一律领下一档"正相反)。
 * 满级与星尘不足都照样返回动作,静默留给 `gearUpClaim`(Web 的命中层不看状态)。
 */
export function hitGearUp(L: GearUpLayout, x: number, y: number): GearUpAction | null {
  if (inRect(L.backBtn, x, y)) return { kind: "back" };
  for (const row of L.rows) {
    if (inRect(row.btn, x, y)) return { kind: "upgrade", row: row.index };
  }
  return null;
}

/**
 * 动作 → 写入意图(纯)。三条守卫与 Web 的扣费前 `return` 逐条对应:
 * 取不到装备(`ownedGear[row]` 越界)、已满级、星尘不足,一律 null。
 * 本屏唯一写的两个字段是 `stardust`(-) 与 `gearLevels[name]`(+1 级)。
 */
export function gearUpClaim(save: GearUpSaveView, a: GearUpAction): GearClaim | null {
  if (a.kind === "back") return null;
  const eq = save.ownedGear[a.row];
  if (!eq) return null;
  const lv = gearLevelOf(save, eq.name);
  if (lv >= GEAR_UPGRADE_MAX) return null;
  const cost = gearUpgradeCost(lv);
  if (save.stardust < cost) return null;
  return { needsAd: false, stardustCost: cost, gearLevelKey: eq.name, gearLevelTo: lv + 1, levelFrom: lv };
}
