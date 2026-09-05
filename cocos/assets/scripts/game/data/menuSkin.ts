/**
 * 主菜单皮肤规范表 —— 单一事实源(DESIGN-VALUES-SPEC 条款 1/3/4)。
 *
 * 与布局表 `layoutMenu.ts` 的分工:
 *  - 布局表管"在哪、多大"(锚点/装饰字段 → 派生几何);
 *  - 皮肤表管"长什么样"的运行时可热调部分:换图(键→键映射)、图-文四边间距增量、
 *    图层显隐。四项全部经 `public/config/balance.json` 的 `menuSkin` 段热调,
 *    浏览器+微信同源;微信端无外置配置 → 自动使用本表默认(全空 = 零画面变化)。
 *
 * 硬约束:
 *  - **insets 是加性增量**:deco 仍是唯一基准事实源,本表四边值在
 *    `src/ui/menuLayout.ts` `menuLayoutPure()` 内对派生字段做叠加,绝不回写 deco。
 *  - 缺省(全空)必须逐像素等价于无本表 —— 这是"默认零画面变化"铁律在皮肤层的投影。
 */

import { ASSET_MANIFEST } from "./assets";

/** 含义:面板四边间距增量。单位:设计 px(正=内缩/远离,负=外扩/贴近)。依据:图-文间距需按边独立调。出处:布局台结构树需求 */
export interface SkinInsets {
  t: number;
  r: number;
  b: number;
  l: number;
}

/**
 * 含义:主菜单面板枚举(与 drawMenu 七个贴图区块一一对应,按绘制序排列)。
 * 依据:结构树拓扑固定 7 面板,不提供增删。出处:布局台结构树需求
 */
export type MenuPanelId = "title" | "strip" | "chip" | "section" | "row" | "setCard" | "note";

/** 面板全集(校验与遍历共用;顺序 = 绘制序) */
export const MENU_PANEL_IDS: readonly MenuPanelId[] = ["title", "strip", "chip", "section", "row", "setCard", "note"];

/** 含义:insets 每边取值域(越界回退该边默认 0)。单位:设计 px。依据:deco 域 ±200 的一半,间距增量无大位移语义。出处:本表立项 */
export const MENU_SKIN_INSET_RANGE: readonly [number, number] = [-100, 100];

/**
 * 含义:运行时生效的皮肤表。
 *  - `remap`:资产键→资产键的换图映射(目标键未加载自动走缺图回退);
 *  - `insets`:面板四边间距增量(加性叠加在布局派生字段上);
 *  - `hidden`:整图隐藏的资产键(走与缺图完全相同的回退形状链路);
 *  - `textHidden`:隐藏文字层的面板(图照画);
 *  - `layers`:图层命名(运行时不消费,仅随配置透传,布局台结构树读写)。
 * 依据:用户拍板"换图两种都要 + 结构树"。出处:布局台结构树需求
 */
export interface MenuSkinTable {
  remap: Record<string, string>;
  insets: Partial<Record<MenuPanelId, SkinInsets>>;
  hidden: string[];
  textHidden: MenuPanelId[];
  layers: Record<string, { name?: string }>;
}

/** 含义:皮肤表默认(全空 = 无皮肤)。单位:-。依据:默认零画面变化铁律。出处:本表立项 */
export const MENU_SKIN_DEFAULTS: MenuSkinTable = {
  remap: {},
  insets: {},
  hidden: [],
  textHidden: [],
  layers: {},
};

const cloneInsets = (ins: Partial<Record<MenuPanelId, SkinInsets>>): Partial<Record<MenuPanelId, SkinInsets>> => {
  const out: Partial<Record<MenuPanelId, SkinInsets>> = {};
  for (const id of MENU_PANEL_IDS) {
    const v = ins[id];
    if (v) out[id] = { ...v };
  }
  return out;
};

const cloneSkin = (t: MenuSkinTable): MenuSkinTable => ({
  remap: { ...t.remap },
  insets: cloneInsets(t.insets),
  hidden: [...t.hidden],
  textHidden: [...t.textHidden],
  layers: Object.fromEntries(Object.entries(t.layers).map(([k, v]) => [k, { ...v }])),
});

/** 当前生效表(规范表默认 + balance.json 覆盖);消费方经 snapshotMenuSkin() 取快照 */
export let menuSkinTable: MenuSkinTable = cloneSkin(MENU_SKIN_DEFAULTS);

/** 校验告警(由加载器读取后统一打印) */
export const menuSkinWarnings: string[] = [];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const insetEdge = (v: unknown, where: string): number => {
  const n = typeof v === "number" ? v : Number(v);
  const [min, max] = MENU_SKIN_INSET_RANGE;
  if (!Number.isFinite(n) || n < min || n > max) {
    menuSkinWarnings.push(`menuSkin.${where}=${String(v)} 越界[${min},${max}],已回退 0`);
    return 0;
  }
  return n;
};

/** 热重载入口:布局台"导出 JSON → 粘进 balance.json → F5"与生产配置共用同一通道 */
export function applyMenuSkin(cfg?: Record<string, unknown>): void {
  const b = cfg ?? {};
  const next = cloneSkin(MENU_SKIN_DEFAULTS);

  if (b.remap !== undefined) {
    if (isObj(b.remap)) {
      for (const [k, v] of Object.entries(b.remap)) {
        if (typeof v !== "string" || !v) {
          menuSkinWarnings.push(`menuSkin.remap.${k} 目标键必须是非空字符串,已忽略`);
          continue;
        }
        if (!(v in ASSET_MANIFEST)) menuSkinWarnings.push(`menuSkin.remap.${k}→${v}:目标键不在资产清单,按缺图回退`);
        next.remap[k] = v;
      }
    } else {
      menuSkinWarnings.push("menuSkin.remap 必须是对象,已忽略");
    }
  }

  if (b.insets !== undefined) {
    if (isObj(b.insets)) {
      for (const [k, v] of Object.entries(b.insets)) {
        if (!(MENU_PANEL_IDS as readonly string[]).includes(k)) {
          menuSkinWarnings.push(`menuSkin.insets.${k} 不是已知面板,已忽略`);
          continue;
        }
        if (!isObj(v)) {
          menuSkinWarnings.push(`menuSkin.insets.${k} 必须是 {t,r,b,l} 对象,已忽略`);
          continue;
        }
        next.insets[k as MenuPanelId] = {
          t: insetEdge(v.t, `insets.${k}.t`),
          r: insetEdge(v.r, `insets.${k}.r`),
          b: insetEdge(v.b, `insets.${k}.b`),
          l: insetEdge(v.l, `insets.${k}.l`),
        };
      }
    } else {
      menuSkinWarnings.push("menuSkin.insets 必须是对象,已忽略");
    }
  }

  if (b.hidden !== undefined) {
    if (Array.isArray(b.hidden)) {
      for (const v of b.hidden) {
        if (typeof v === "string" && v) next.hidden.push(v);
        else menuSkinWarnings.push(`menuSkin.hidden 含非字符串项 ${String(v)},已忽略`);
      }
    } else {
      menuSkinWarnings.push("menuSkin.hidden 必须是数组,已忽略");
    }
  }

  if (b.textHidden !== undefined) {
    if (Array.isArray(b.textHidden)) {
      for (const v of b.textHidden) {
        if (typeof v === "string" && (MENU_PANEL_IDS as readonly string[]).includes(v)) next.textHidden.push(v as MenuPanelId);
        else menuSkinWarnings.push(`menuSkin.textHidden 含未知面板 ${String(v)},已忽略`);
      }
    } else {
      menuSkinWarnings.push("menuSkin.textHidden 必须是数组,已忽略");
    }
  }

  if (b.layers !== undefined) {
    if (isObj(b.layers)) {
      for (const [k, v] of Object.entries(b.layers)) {
        if (isObj(v) && (v.name === undefined || typeof v.name === "string")) next.layers[k] = { ...(v.name !== undefined ? { name: v.name } : {}) };
        else menuSkinWarnings.push(`menuSkin.layers.${k} 格式非法,已忽略`);
      }
    } else {
      menuSkinWarnings.push("menuSkin.layers 必须是对象,已忽略");
    }
  }

  menuSkinTable = next;
}

/** 深拷贝快照:皮肤每帧读取,快照避免绘制过程中被并发改表(口径同 snapshotMenuLayout) */
export function snapshotMenuSkin(): MenuSkinTable {
  return cloneSkin(menuSkinTable);
}

/** 布局台写回:仅改内存即时生效(不落盘;落盘由导出 JSON 完成)。字段级整体替换 */
export function setMenuSkin(patch: Partial<MenuSkinTable>): void {
  const cur = cloneSkin(menuSkinTable);
  menuSkinTable = {
    remap: patch.remap !== undefined ? { ...patch.remap } : cur.remap,
    insets: patch.insets !== undefined ? cloneInsets(patch.insets) : cur.insets,
    hidden: patch.hidden !== undefined ? [...patch.hidden] : cur.hidden,
    textHidden: patch.textHidden !== undefined ? [...patch.textHidden] : cur.textHidden,
    layers:
      patch.layers !== undefined
        ? Object.fromEntries(Object.entries(patch.layers).map(([k, v]) => [k, { ...v }]))
        : cur.layers,
  };
}
