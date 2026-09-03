/**
 * 首局引导(需求规划:新玩家第 1 关前 5 分钟)。
 * 顺序教学步骤,条件满足才推进;展示 8 秒自动隐藏,可点「跳过引导」终止。
 * 只对主线第 1 关且未完成引导的存档生效(场外 tutorialDone 关闭)。
 * 纯状态机,不触碰渲染/平台,便于单测。
 */

/** 引导上下文:由 Game 每帧组装,供步骤条件判断 */
export interface GuideCtx {
  playing: boolean;
  shop: boolean;
  /** 本局已进行秒数 */
  elapsed: number;
  chapter: number;
  kills: number;
  equipmentCount: number;
  hasSet: boolean;
  /** 已选套组名(无套组时为空) */
  setInfo: string;
  /** 当前可三合一升品的卡组数 */
  mergesAvailable: number;
}

export interface GuideStep {
  id: string;
  /** 条件满足才显示(顺序推进,不满足则等) */
  when: (c: GuideCtx) => boolean;
  /** 展示文案(可按上下文生成,如套组名) */
  text: (c: GuideCtx) => string;
}

/** 教学步骤:按玩家真实进度自然解锁 */
export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "auto",
    when: (c) => c.playing && c.elapsed > 2.5,
    text: () => "你被尸潮包围了——角色会自动移动和攻击,你只需要看。想自己操作?按 F6 切换挂机/手动。",
  },
  {
    id: "gold",
    when: (c) => c.kills >= 8,
    text: () => "击杀掉落金币 ✦:金币是场内货币,章间商店用来买卡凑套。",
  },
  {
    id: "shop",
    when: (c) => c.shop,
    text: () => "章间商店:三张卡买完即售罄,点「刷新」花金币补货(价格递增)。槽满可销毁旧卡。",
  },
  {
    id: "set",
    when: (c) => c.shop,
    text: (c) =>
      c.hasSet
        ? `你选了「${c.setInfo}」套组:商店偏向刷本套卡,凑 3/6 件套激活质变加成。`
        : "主菜单可选武器套组,凑 3 件激活保底加成、6 件套质变(翻倍级)。",
  },
  {
    id: "merge",
    when: (c) => c.shop && c.mergesAvailable > 0,
    text: () => "场内成长:品质决定射速与弹量,进化(2 张同类卡)升品跃迁;6 件套质变 × 品质乘算收益最大。装备外侧可在主菜单「升级」里永久强化收藏。",
  },
  {
    id: "chapter2",
    when: (c) => c.playing && c.chapter >= 2 && c.elapsed % 60 < 4,
    text: () => "每章 60 秒限时,第 20 章是 Boss。看左上角敌情,按推荐套组针对构筑更容易。",
  },
];

/** 单条提示展示时长(秒) */
export const TIP_SECONDS = 8;

export class Onboarding {
  /** false = 已完成/跳过引导(不再显示) */
  enabled = true;
  /** 当前展示的提示(null = 无) */
  current: { text: string } | null = null;
  private cursor = 0;
  private timer = 0;

  /** 开始一局时重置(死亡重打会重新引导,直到完成/跳过) */
  reset(): void {
    this.cursor = 0;
    this.current = null;
    this.timer = 0;
  }

  /** 跳过全部(存档置 tutorialDone) */
  skipAll(): void {
    this.enabled = false;
    this.current = null;
  }

  /** 每帧驱动:展示计时 + 按顺序解锁下一步 */
  update(ctx: GuideCtx, dt: number): void {
    if (!this.enabled) return;
    if (this.current) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.current = null;
        this.timer = 0;
      }
      return;
    }
    if (this.cursor >= GUIDE_STEPS.length) return;
    const step = GUIDE_STEPS[this.cursor];
    if (step.when(ctx)) {
      this.current = { text: step.text(ctx) };
      this.timer = TIP_SECONDS;
      this.cursor += 1;
    }
  }

  get finished(): boolean {
    return this.cursor >= GUIDE_STEPS.length;
  }
}
