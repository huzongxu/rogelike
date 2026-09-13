/**
 * 英雄选择屏的**滚动状态机 + 热区判定 + 出战写入**(纯逻辑,cc-free)。
 *
 * 滚动数学一行都不在这里重写:拖拽 / 甩动 / 惯性 / 点击容差四个判据一律调共享层
 * `game/ui/scrollList.ts` 的 `dragScrollFrom` / `flickOf` / `inertiaNext` / `SCROLL_TAP_SLOP`
 * ——与 Web 端 `src/game.ts` 的英雄页引用的是同一批函数(Phase 2 定下的"两端同一函数引用"纪律)。
 * 几何同理:全部矩形来自 `game/ui/heroSelectLayout.ts:heroSelectLayout()`,本文件只喂屏高。
 *
 * 出战的唯一写入路径是 `game/data/heroes.ts:applyHeroSelection()`(它同时刷新派生镜像
 * `selectedSet`),所以本模块对外的 `commit()` 是唯一能改存档英雄字段的地方。
 *
 * 时间是入参:`begin/move` 收宿主给的 `now`(ms),`tick` 收 `dt`(s),不读全局时钟。
 */

import { HERO_ROW_GAP, HERO_ROW_H, heroSelectLayout, type HeroSelectLayout } from "../game/ui/heroSelectLayout";
import { SCROLL_TAP_SLOP, dragScrollFrom, flickOf, inertiaNext } from "../game/ui/scrollList";
import { allHeroes, applyHeroSelection, heroDef, heroSkillLines, releasedHeroes, type HeroId, type HeroSelection } from "../game/data/heroes";
import { seasonTheme } from "../game/data/seasonSets";
import { setDef } from "../game/data/sets";
import { clamp } from "../game/core/math";
import { theme } from "../game/ui/theme";
import { heroRhythm, heroRhythmOptions, type RhythmId } from "../game/data/rhythm";

/** 一次滚动的几何输入:内容高与视口高(都由 heroSelectLayout 给出,这里不另算) */
export interface ScrollGeometry {
  contentH: number;
  viewportH: number;
  maxScroll: number;
}

/**
 * 拖拽 + 松手甩动 + 逐帧惯性 + 越界回弹。
 * 语义与 Web 端英雄页逐条对齐:拖拽期允许越界(rubber 阻尼显示),松手硬钳回边界,
 * 位移超过 SCROLL_TAP_SLOP 即判为拖动并吞掉这次点击。
 */
export class ScrollModel {
  offset = 0;
  vel = 0;
  private drag: { startY: number; startOffset: number; lastOffset: number; lastT: number; vel: number; moved: boolean } | null = null;

  get dragging(): boolean {
    return this.drag !== null;
  }

  geometry(L: HeroSelectLayout): ScrollGeometry {
    return { contentH: L.contentH, viewportH: L.list.h, maxScroll: L.maxScroll };
  }

  /** 只有落在列表视口内的按下才接管为滚动手势(调用方先做视口命中) */
  begin(y: number, now: number): void {
    this.vel = 0;
    this.drag = { startY: y, startOffset: this.offset, lastOffset: this.offset, lastT: now, vel: 0, moved: false };
  }

  move(y: number, now: number, g: ScrollGeometry): void {
    const d = this.drag;
    if (!d) return;
    const { display, settled } = dragScrollFrom(d.startOffset, y - d.startY, g.contentH, g.viewportH);
    const inst = ((settled - d.lastOffset) / Math.max(1, now - d.lastT)) * 1000;
    d.vel = d.vel * 0.5 + inst * 0.5;
    d.lastOffset = settled;
    d.lastT = now;
    if (Math.abs(y - d.startY) > SCROLL_TAP_SLOP) d.moved = true;
    this.offset = display;
  }

  /** 松手:硬钳回边界并决定是否甩惯性。返回 false = 手势已被拖拽消费,调用方必须放弃点击判定 */
  end(g: ScrollGeometry): boolean {
    const d = this.drag;
    this.drag = null;
    if (!d) return true;
    // settled 位本就是同一几何的钳制结果,数值不变;再钳一次是让拖拽途中屏高换档也不会留在越界位
    this.offset = clamp(d.lastOffset, 0, g.maxScroll);
    this.vel = flickOf(d.vel);
    return !d.moved;
  }

  cancel(): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    this.offset = d.lastOffset;
    this.vel = 0;
  }

  /** 逐帧推进惯性(拖拽期间由手势接管,不叠加)。返回 offset 是否变化(视图据此决定是否重排) */
  tick(dt: number, g: ScrollGeometry): boolean {
    if (this.dragging || this.vel === 0) return false;
    const before = this.offset;
    const next = inertiaNext({ offset: this.offset, vel: this.vel }, dt, g.contentH, g.viewportH);
    this.offset = next.offset;
    this.vel = next.vel;
    return before !== this.offset;
  }

  /** 越界回弹:松手后若停在边界外(阻尼显示位),按最短路径线性收回 */
  snap(g: ScrollGeometry): boolean {
    const target = clamp(this.offset, 0, g.maxScroll);
    if (target === this.offset) return false;
    this.offset = target;
    return true;
  }

  /** 把第 index 行滚到视口中部(进入本页时定位当前出战英雄) */
  focusIndex(index: number, g: ScrollGeometry): void {
    const step = HERO_ROW_H + HERO_ROW_GAP;
    this.offset = clamp(index * step - (g.viewportH - step) / 2, 0, g.maxScroll);
  }
}

/** 本屏的存档切片 */
export interface HeroSaveView extends HeroSelection {
  seasonId: number;
  /** 跨局解锁的第二本命(docs/DESIGN-HERO-RHYTHM.md Q7 / S2);老宿主不给 = 全未解锁 */
  heroRhythmUnlock?: Partial<Record<HeroId, boolean>>;
  /** 该英雄当前选用的本命节律 */
  heroRhythmChoice?: Partial<Record<HeroId, RhythmId>>;
}

/** 一次点击落到的热区(rhythm = 详情区第 4 行「本命节律」,已解锁第二本命时轮转) */
export type HeroAction = { kind: "back" } | { kind: "row"; id: HeroId } | { kind: "clear" } | { kind: "confirm" } | { kind: "rhythm" };

/** 列表行的展示数据(几何仍由 layout 的行给,这里只补"写什么、什么色") */
export interface HeroRowView {
  id: HeroId;
  index: number;
  released: boolean;
  name: string;
  sub: string;
  badgeText: string;
  /** 徽标圆底色与文字色(当前出战 = 金色,已解锁 = 英雄主色,未解锁 = 灰) */
  color: string;
  /** 预览行(详情区正在看的那一行)高亮 */
  active: boolean;
  /** 存档里正在出战的那一行(徽标写「出战」) */
  current: boolean;
}

export class HeroSelectModel {
  readonly scroll = new ScrollModel();
  /** 详情区预览的英雄;null = 「不出战」 */
  preview: HeroId | null = null;
  private selected: HeroId | null = null;
  private seasonId = 1;
  /** 第二本命解锁与选择(存档切片的镜像;`rhythm` 动作只改 choice 预览,confirm 才落盘) */
  private rhythmUnlock: Partial<Record<HeroId, boolean>> = {};
  private rhythmChoice: Partial<Record<HeroId, RhythmId>> = {};

  /** 进入本页:预览对齐存档,并把已出战那行滚进视口居中 */
  open(save: HeroSaveView, w: number, h: number): void {
    this.selected = save.selectedHero;
    this.seasonId = save.seasonId;
    this.preview = save.selectedHero;
    this.rhythmUnlock = save.heroRhythmUnlock ?? {};
    this.rhythmChoice = { ...(save.heroRhythmChoice ?? {}) };
    this.scroll.vel = 0;
    const L = this.layout(save, w, h);
    const id = save.selectedHero;
    if (!id) return;
    const idx = allHeroes().findIndex((hh) => hh.id === id);
    if (idx >= 0) this.scroll.focusIndex(idx, this.scroll.geometry(L));
  }

  /** 几何单一出口:draw、命中测试与惯性都读这一个返回值(滚动位为唯一变量) */
  layout(save: HeroSaveView, w: number, h: number): HeroSelectLayout {
    this.selected = save.selectedHero;
    this.seasonId = save.seasonId;
    return heroSelectLayout(w, h, allHeroes(), save.seasonId, this.scroll.offset);
  }

  /** 命中判定(顺序对标 Web onHeroesClick):落在列表内就不再往下走 */
  hit(L: HeroSelectLayout, x: number, y: number): HeroAction | null {
    const inRect = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inRect(L.backBtn)) return { kind: "back" };
    if (inRect(L.list)) {
      for (const row of L.rows) {
        if (!row.released || !inRect(row.rect)) continue;
        return { kind: "row", id: row.id };
      }
      return null;
    }
    if (inRect(L.clearBtn)) return { kind: "clear" };
    if (inRect(L.confirm)) return { kind: "confirm" };
    // 详情区第 4 行「本命节律」:已解锁第二本命的英雄可点行轮转(未解锁 / 不出战时不产热区)
    const rhythmRow = L.skillRows[3];
    if (rhythmRow && this.preview && this.rhythmOptions(this.preview).length > 1 && inRect(rhythmRow.rect)) return { kind: "rhythm" };
    return null;
  }

  /** 该英雄可选的本命节律:未解锁 = [本命];已解锁 = [本命, ...分岔节律] */
  rhythmOptions(id: HeroId): readonly RhythmId[] {
    return this.rhythmUnlock[id] ? heroRhythmOptions(id) : [heroRhythm(id)];
  }

  /** 该英雄当前选用的本命(预览态;不合法的存档值回落表内本命) */
  rhythmOf(id: HeroId): RhythmId {
    const opts = this.rhythmOptions(id);
    const c = this.rhythmChoice[id];
    return c && opts.includes(c) ? c : opts[0];
  }

  /** 热区 → 状态变化;返回是否需要重排画面 */
  apply(a: HeroAction): boolean {
    if (a.kind === "row") {
      if (this.preview === a.id) return false;
      this.preview = a.id;
      return true;
    }
    if (a.kind === "clear") {
      this.preview = null;
      return true;
    }
    if (a.kind === "rhythm") {
      if (!this.preview) return false;
      const opts = this.rhythmOptions(this.preview);
      if (opts.length <= 1) return false;
      const cur = this.rhythmOf(this.preview);
      this.rhythmChoice[this.preview] = opts[(opts.indexOf(cur) + 1) % opts.length];
      return true;
    }
    return false;
  }

  /** 确定出战 / 确认不出战:唯一写入路径,派生镜像 selectedSet 由 applyHeroSelection 同步;本命选择一并落盘 */
  commit(save: HeroSelection & { heroRhythmChoice?: Partial<Record<HeroId, RhythmId>> }): HeroId | null {
    applyHeroSelection(save, this.preview);
    this.selected = this.preview;
    if (save.heroRhythmChoice) {
      for (const [id, r] of Object.entries(this.rhythmChoice) as [HeroId, RhythmId | undefined][]) if (r) save.heroRhythmChoice[id] = r;
    }
    return this.preview;
  }

  /* ---------- 文案构建(视图只读这里) ---------- */

  header(): { title: string; sub: string } {
    const total = allHeroes().length;
    const n = releasedHeroes(this.seasonId).length;
    return {
      title: `出战英雄 · S${this.seasonId}「${seasonTheme(this.seasonId).name}」`,
      sub: `已解锁 ${n}/${total} · 后面赛季的英雄解锁后可继续出战`,
    };
  }

  /** 可视行文案(未解锁行带锁标语义,徽标只写首发赛季) */
  rows(L: HeroSelectLayout): HeroRowView[] {
    return L.rows.map((row) => {
      const hero = heroDef(row.id);
      const current = hero.id === this.selected;
      return {
        id: hero.id,
        index: row.index,
        released: row.released,
        name: hero.name,
        sub: row.released ? `${hero.title} · ${setDef(hero.setId).name}` : `S${hero.releaseSeason} 解锁`,
        badgeText: current ? "出战" : `S${hero.releaseSeason}`,
        color: current ? theme.gold : row.released ? hero.accentColor : theme.textMuted,
        active: hero.id === this.preview,
        current,
      };
    });
  }

  /** 详情区;preview 为 null = 「不出战」那一屏 */
  detail(): { empty: boolean; name: string; title: string; lore: string; skills: { tag: string; label: string; desc: string }[]; color: string } {
    if (!this.preview) return { empty: true, name: "不出战", title: "通用卡池 · 无套组加成", lore: "", skills: [], color: theme.textSecondary };
    const hero = heroDef(this.preview);
    return {
      empty: false,
      name: hero.name,
      title: `${hero.title} · ${setDef(hero.setId).name}`,
      lore: hero.lore,
      skills: heroSkillLines(this.preview, this.seasonId, { rhythm: this.rhythmOf(this.preview), unlocked: !!this.rhythmUnlock[this.preview] }).map((l) => ({ tag: l.tag, label: l.label, desc: l.desc })),
      color: hero.accentColor,
    };
  }

  /** 确定按钮文案(预览为不出战时明确写出后果) */
  confirmText(): string {
    return this.preview ? "确定出战" : "确认不出战";
  }
}
