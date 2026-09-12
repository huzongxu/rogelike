/**
 * 战场世界视图 —— Web 版 drawWorld 的节点化替换(网格/地形/领域云/金币/敌人/召唤物/
 * 玩家/弹道/特效贴花逐段对标,绘制顺序与 Web 一致)。
 * 逻辑实体全部来自 BattleSim(只读);每类实体一个 cc.NodePool,节点与实体按 id 配对。
 * 贴图优先、缺图回退 Graphics 描形,语义 = Web assets.draw 返回 false 的分支。
 *
 * 坐标:Web 相机恒为 cam=(0, HUD_TOP_H)(竞技场=一屏、纵向被坞带钳死,见 render() 的
 * clamp 推导),世界点 (x,y) 落在屏幕 (x, y-HUD_TOP_H);本视图以 placeRect(…, DESIGN_W, wh)
 * 一次性换算,战场根节点顶对齐、锁高 worldH()。
 */

import { Graphics, Node, NodePool, Rect, Sprite, SpriteFrame, UIOpacity, UITransform } from "cc";
import { DESIGN_W, logicalH, fullRect, coverRect, placeRect } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { hexToColor, makeNode } from "../ui/Widgets";
import { HUD_TOP_H } from "../game/ui/hud";
import { clamp } from "../game/core/math";
import { animCellRect, animCellSize, animCol, animDir, attackDuration } from "../game/ui/spriteAnim";
import type { Enemy } from "../game/entities/enemy";
import type { Projectile } from "../game/entities/projectile";
import type { Cloud, Gem, Minion, Obstacle } from "../game/entities/objects";
import type { Fx } from "../game/systems/equipmentEngine";
import type { BattleSim } from "./BattleSim";

/** Web 相机 y 恒等于竞技场顶(= 顶坞高):clamp(p-h/2, y0, max(y0, y1-h)) 在 y1-y0<h 时坍缩为 y0 */
const CAM_Y = HUD_TOP_H;

/** 特效贴花的贴图键与基准半径(对标 Web drawWorld 的 fxTex 表) */
const FX_TEX: Record<string, { key: string; r: number }> = {
    nova: { key: "fx_nova", r: 100 },
    explosion: { key: "fx_blast", r: 100 },
    lightning: { key: "fx_chain", r: 34 },
    shield: { key: "fx_shield", r: 22 },
    heal: { key: "fx_drain", r: 34 },
};

export class BattleWorldView {
    /** 屏幕根(挂 Screen:battle 下):背景 + 战场 + HUD/摇杆由壳层继续追加 */
    readonly root: Node;
    /** 战场根(锁高 worldH,顶对齐;震屏偏移作用在这个节点上) */
    readonly world: Node;
    /** FxView 接管的三个层节点(顺序 = Web:贴花 → 粒子 → 预警圈 → 飘字) */
    readonly fxParticlesNode: Node;
    readonly telegraphNode: Node;
    readonly floatTextNode: Node;

    private frames: Map<string, SpriteFrame>;
    /** 玩家朝向记忆:上一帧 x 与当前翻转符号(基线件面朝右) */
    private playerLastX = 0;
    private playerFaceSx = 1;
    /**
     * 序列帧图集(anim_<key>,行 = 朝向、列 = 帧,见 game/ui/spriteAnim):子帧按 `key#row#col` 懒建缓存,
     * 与整图 SpriteFrame 共用一张 NEAREST 纹理。命中图集的单位不再走翻转 + 小跳步的单帧路径。
     */
    private animCells = new Map<string, SpriteFrame>();
    /** 敌人动画状态:上一帧的接触冷却(冷却被重置 = 咬到玩家 = 起一次攻击动画)与攻击起始时刻 */
    private enemyAnim = new Map<number, { lastCd: number; attackT: number }>();
    /** 玩家动画状态:上一帧位置 / 弹体与特效计数(新增 = 施放 = 起攻击动画)/ 朝向 / 攻击起始时刻 */
    private playerAnim = { lastY: 0, lastProj: 0, lastFx: 0, dx: 0, dy: 1, attackT: -1 };

    /** 第一个在图集里有的键(整图 SpriteFrame 已加载且尺寸能按 7×5 整除) */
    private animKeyOf(keys: readonly string[]): string | null {
        for (const k of keys) {
            const sf = this.frames.get(k);
            if (sf && animCellSize(sf.width, sf.height)) return k;
        }
        return null;
    }

    /** 图集子帧(懒建);图集缺失或布局不整除返回 undefined,调用方回退单帧 */
    private animCell(key: string, row: number, col: number): SpriteFrame | undefined {
        const id = `${key}#${row}#${col}`;
        const hit = this.animCells.get(id);
        if (hit) return hit;
        const base = this.frames.get(key);
        if (!base || !base.texture) return undefined;
        const cell = animCellSize(base.width, base.height);
        if (!cell) return undefined;
        const r = animCellRect(row, col, cell.w, cell.h);
        const sf = new SpriteFrame();
        sf.texture = base.texture;
        sf.rect = new Rect(base.rect.x + r.x, base.rect.y + r.y, r.w, r.h);
        this.animCells.set(id, sf);
        return sf;
    }
    private cover: Sprite | null = null;
    private coverNode: Node;
    private dimNode: Node;
    private grid: Graphics;
    private fieldsLayer: Node;
    private cloudsLayer: Node;
    private gemsLayer: Node;
    private enemiesLayer: Node;
    private minionsLayer: Node;
    private playerLayer: Node;
    private projLayer: Node;
    private fxLayer: Node;
    private playerNode: Node;

    private wh: number;
    private baseX = 0;
    private baseY = 0;

    private enemyPool = new NodePool();
    private rayPool = new NodePool();
    private knifePool = new NodePool();
    private gemPool = new NodePool();
    private cloudPool = new NodePool();
    private minionPool = new NodePool();
    private fxPool = new NodePool();
    private fieldPool = new NodePool();

    private enemyNodes = new Map<number, Node>();
    private projNodes = new Map<number, Node>();
    private gemNodes = new Map<number, Node>();
    private cloudNodes = new Map<number, Node>();
    private minionNodes = new Map<number, Node>();
    private fieldNodes = new Map<number, Node>();
    private fxNodes = new Map<Fx, Node>();
    /** 缺图回退 Graphics 的重绘签名缓存(形状参数不变不重画) */
    private sigs = new Map<Node, string>();

    constructor(parent: Node, frames: Map<string, SpriteFrame>, wh: number) {
        this.frames = frames;
        this.wh = wh;
        this.root = parent;

        // 章节/关卡背景(对标 Web render() 开头的满幅 cover + 压暗遮罩)
        this.coverNode = makeNode("Cover", parent);
        const op = this.coverNode.addComponent(UIOpacity);
        op.opacity = Math.round(viewTable().backdrop.coverAlpha * 255);
        this.cover = this.coverNode.addComponent(Sprite);
        this.cover.type = Sprite.Type.SIMPLE;
        this.cover.sizeMode = Sprite.SizeMode.CUSTOM;
        this.dimNode = makeNode("Dim", parent);
        const dimG = this.dimNode.addComponent(Graphics);
        dimG.fillColor = hexToColor(viewTable().backdrop.dimColor);
        const dimR = fullRect();
        dimG.rect(-dimR.w / 2, -dimR.h / 2, dimR.w, dimR.h);
        dimG.fill();
        placeRect(this.dimNode, dimR);

        this.world = makeNode("BattleRoot", parent);
        placeRect(this.world, { x: 0, y: 0, w: DESIGN_W, h: wh });
        this.baseX = this.world.position.x;
        this.baseY = this.world.position.y;

        this.grid = makeNode("Grid", this.world).addComponent(Graphics);
        this.fieldsLayer = makeNode("Fields", this.world);
        this.cloudsLayer = makeNode("Clouds", this.world);
        this.gemsLayer = makeNode("Gems", this.world);
        this.enemiesLayer = makeNode("Enemies", this.world);
        this.minionsLayer = makeNode("Minions", this.world);
        this.playerLayer = makeNode("PlayerLayer", this.world);
        this.projLayer = makeNode("Projectiles", this.world);
        this.fxLayer = makeNode("FxDecals", this.world);
        this.fxParticlesNode = makeNode("FxParticles", this.world);
        this.fxParticlesNode.addComponent(Graphics);
        this.telegraphNode = makeNode("Telegraphs", this.world);
        this.telegraphNode.addComponent(Graphics);
        this.floatTextNode = makeNode("FloatText", this.world);

        this.playerNode = this.makePlayerNode();
        this.drawGrid();
        this.prewarm();
    }

    /** 池预热:开局即建好空闲节点(容量读 viewTable.pool),峰值再按需增长 */
    private prewarm(): void {
        const p = viewTable().pool;
        for (let i = 0; i < p.enemies; i++) this.enemyPool.put(this.makeEnemyNode());
        for (let i = 0; i < p.projectiles; i++) {
            this.rayPool.put(this.makeRayNode());
            this.knifePool.put(this.makeKnifeNode());
        }
        for (let i = 0; i < p.gems; i++) this.gemPool.put(this.makeGemNode());
        for (let i = 0; i < p.clouds; i++) this.cloudPool.put(this.makeCloudNode());
        for (let i = 0; i < p.minions; i++) this.minionPool.put(this.makeMinionNode());
        for (let i = 0; i < p.fxDecals; i++) this.fxPool.put(this.makeFxNode());
        for (let i = 0; i < p.fields; i++) this.fieldPool.put(this.makeFieldNode());
    }

    /** 换章节/关卡背景(缺图 → 隐藏 cover 与遮罩,露出全局底色,等价 Web 回退纯色) */
    setBackdrop(key: string): void {
        const frame = this.frames.get(key) ?? null;
        if (this.cover) this.cover.spriteFrame = frame;
        this.coverNode.active = !!frame;
        this.dimNode.active = !!frame;
        if (frame) {
            placeRect(this.coverNode, coverRect(fullRect(), frame.width, frame.height));
        }
    }

    private drawGrid(): void {
        const t = viewTable().battle;
        const step = t.gridStep;
        const g = this.grid;
        g.clear();
        g.lineWidth = 1;
        g.strokeColor = hexToColor(t.gridColor);
        const ui = this.grid.node.getComponent(UITransform) || this.grid.node.addComponent(UITransform);
        ui.setContentSize(DESIGN_W, this.wh);
        placeRect(this.grid.node, { x: 0, y: 0, w: DESIGN_W, h: this.wh }, DESIGN_W, this.wh);
        // Web:竖线 x 从 max(arena.x0,0) 步长 100 到 cam.x+560+100,纵跨 arena(64..wh-48)
        const top = this.localY(CAM_Y);
        const bottom = this.localY(this.wh - 48);
        for (let x = 0; x <= DESIGN_W + step; x += step) {
            const lx = x - DESIGN_W / 2;
            g.moveTo(lx, top);
            g.lineTo(lx, bottom);
        }
        // Web:横线 y 从 max(arena.y0, floor(cam.y/step)*step)=64 起步长 100,横跨 arena 全宽
        const yEnd = CAM_Y + logicalH() + step;
        for (let y = CAM_Y; y <= yEnd; y += step) {
            const ly = this.localY(y);
            g.moveTo(-DESIGN_W / 2, ly);
            g.lineTo(DESIGN_W / 2, ly);
        }
        g.stroke();
    }

    /** 世界坐标(左上原点,含坞带偏移)→ 战场根局部坐标 */
    private localX(x: number): number {
        return x - DESIGN_W / 2;
    }

    private localY(y: number): number {
        return this.wh / 2 - (y - CAM_Y);
    }

    /** 世界中心点 + 半径 → placeRect(单一换算点) */
    private placeWorld(node: Node, cx: number, cy: number, w: number, h: number): void {
        placeRect(node, { x: cx - w / 2, y: cy - CAM_Y - h / 2, w, h }, DESIGN_W, this.wh);
    }

    /* ================= 每帧绑定 ================= */

    sync(sim: BattleSim): void {
        const shake = sim.fxLayer.shake;
        // Web: translate(-cam + shake);shake.y 为屏幕向下正,节点 y 向上取反
        this.world.setPosition(this.baseX + shake.x, this.baseY - shake.y, 0);
        this.syncFields(sim);
        this.syncClouds(sim);
        this.syncGems(sim);
        this.syncEnemies(sim);
        this.syncMinions(sim);
        this.syncPlayer(sim);
        this.syncProjectiles(sim);
        this.syncFxDecals(sim);
    }

    /* ---------- 地形(毒池/灼烧池/石柱) ---------- */

    private makeFieldNode(): Node {
        const n = makeNode("Field");
        const spr = makeNode("Spr", n);
        const sp = spr.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        this.fieldsLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncFields(sim: BattleSim): void {
        const alive = new Set<number>();
        for (const ob of sim.obstacles) {
            alive.add(ob.id);
            let n = this.fieldNodes.get(ob.id);
            if (!n) {
                n = this.fieldPool.get() || this.makeFieldNode();
                if (!n.parent) this.fieldsLayer.addChild(n);
                n.active = true;
                this.fieldNodes.set(ob.id, n);
            }
            this.placeWorld(n, ob.pos.x, ob.pos.y, ob.radius * 2, ob.radius * 2);
            const spr = n.getChildByName("Spr")!;
            const g = n.getChildByName("Fill")!.getComponent(Graphics)!;
            const poisonTex = ob.kind === "pool" && !ob.burn ? this.frames.get("fx_poison") : undefined;
            spr.active = !!poisonTex;
            if (poisonTex) {
                const sp = spr.getComponent(Sprite)!;
                if (sp.spriteFrame !== poisonTex) sp.spriteFrame = poisonTex;
                const ui = spr.getComponent(UITransform) || spr.addComponent(UITransform);
                ui.setContentSize(ob.radius * 2, ob.radius * 2);
            }
            // 池底/石柱本体 + 毒池冒泡(气泡随 elapsed 动画,逐帧重绘;石柱静态一次成画)
            const sig = `${ob.kind}|${ob.burn ? 1 : 0}|${ob.radius}|${ob.id}`;
            if (ob.kind === "pillar") {
                if (this.sigs.get(n) !== sig) {
                    this.sigs.set(n, sig);
                    g.clear();
                    g.fillColor = hexToColor("#5c6672");
                    g.circle(0, 0, ob.radius);
                    g.fill();
                    g.lineWidth = 3;
                    g.strokeColor = hexToColor("#39404a");
                    g.circle(0, 0, ob.radius);
                    g.stroke();
                    g.fillColor = hexToColor("rgba(255,255,255,0.12)");
                    g.ellipse(-ob.radius * 0.25, ob.radius * 0.3, ob.radius * 0.5, ob.radius * 0.32);
                    g.fill();
                }
            } else {
                const burn = ob.burn === true;
                g.clear();
                g.fillColor = hexToColor(burn ? "rgba(255,120,40,0.24)" : "rgba(140,90,220,0.22)");
                g.circle(0, 0, ob.radius);
                g.fill();
                g.lineWidth = 1;
                g.strokeColor = hexToColor(burn ? "rgba(255,157,46,0.5)" : "rgba(180,120,255,0.4)");
                g.circle(0, 0, ob.radius);
                g.stroke();
                for (let i = 0; i < 4; i++) {
                    const ph = (sim.elapsed * 0.5 + i * 0.25 + ob.id * 0.37) % 1;
                    const bx = Math.sin((i + ob.id) * 2.1) * ob.radius * 0.6;
                    const by = ph * 14 - Math.cos((i + ob.id) * 1.7) * ob.radius * 0.6;
                    g.fillColor = hexToColor(burn ? `rgba(255,170,90,${0.4 * (1 - ph)})` : `rgba(190,140,255,${0.35 * (1 - ph)})`);
                    g.circle(bx, by, 3 + ph * 2);
                    g.fill();
                }
            }
        }
        this.fieldNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.fieldNodes.delete(id);
            this.sigs.delete(n);
            n.active = false;
            this.fieldPool.put(n);
        });
    }

    /* ---------- 领域云(毒云/回血池/霜环/陨星 telegraph) ---------- */

    private makeCloudNode(): Node {
        const n = makeNode("Cloud");
        n.addComponent(Graphics);
        this.cloudsLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncClouds(sim: BattleSim): void {
        const alive = new Set<number>();
        for (const c of sim.clouds) {
            alive.add(c.id);
            let n = this.cloudNodes.get(c.id);
            if (!n) {
                n = this.cloudPool.get() || this.makeCloudNode();
                if (!n.parent) this.cloudsLayer.addChild(n);
                n.active = true;
                this.cloudNodes.set(c.id, n);
            }
            this.placeWorld(n, c.pos.x, c.pos.y, c.radius * 2, c.radius * 2);
            const g = n.getComponent(Graphics)!;
            const alpha = clamp(c.ttl / c.maxTtl, 0.15, 0.5);
            g.clear();
            if (c.meteor) {
                const progress = 1 - clamp(c.ttl / c.maxTtl, 0, 1);
                g.fillColor = hexToColor(`rgba(255,120,40,${0.1 + progress * 0.18})`);
                g.circle(0, 0, c.radius * (1 - progress * 0.5));
                g.fill();
                g.lineWidth = 2;
                g.strokeColor = hexToColor(`rgba(255,157,46,${0.5 + progress * 0.4})`);
                g.circle(0, 0, c.radius);
                g.stroke();
            } else if (c.ring) {
                g.lineWidth = 3;
                g.strokeColor = hexToColor(`rgba(140,220,255,${Math.min(0.85, alpha + 0.25)})`);
                g.circle(0, 0, c.radius);
                g.stroke();
                g.lineWidth = 1;
                g.strokeColor = hexToColor(`rgba(90,200,250,${alpha * 0.5})`);
                g.circle(0, 0, Math.max(1, c.radius - 5));
                g.stroke();
            } else {
                const warm = c.fxEmber || c.source?.effect.def.type === "magma_trail";
                g.fillColor = hexToColor(
                    c.heals ? `rgba(90,230,210,${alpha})` : warm ? `rgba(255,130,50,${alpha})` : `rgba(120,220,90,${alpha})`
                );
                g.circle(0, 0, c.radius);
                g.fill();
                g.lineWidth = 1;
                g.strokeColor = hexToColor(c.heals ? "rgba(140,255,235,0.35)" : warm ? "rgba(255,180,90,0.35)" : "rgba(160,255,120,0.3)");
                g.circle(0, 0, c.radius);
                g.stroke();
            }
        }
        this.cloudNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.cloudNodes.delete(id);
            n.active = false;
            this.cloudPool.put(n);
        });
    }

    /* ---------- 金币(脉冲圆点) ---------- */

    private makeGemNode(): Node {
        const n = makeNode("Gem");
        const g = n.addComponent(Graphics);
        const t = viewTable().battle;
        g.fillColor = hexToColor(t.gemColor);
        g.circle(0, 0, t.gemPulseBase);
        g.fill();
        this.gemsLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncGems(sim: BattleSim): void {
        const t = viewTable().battle;
        const alive = new Set<number>();
        for (const gem of sim.gems) {
            alive.add(gem.id);
            let n = this.gemNodes.get(gem.id);
            if (!n) {
                n = this.gemPool.get() || this.makeGemNode();
                if (!n.parent) this.gemsLayer.addChild(n);
                n.active = true;
                this.gemNodes.set(gem.id, n);
            }
            this.placeWorld(n, gem.pos.x, gem.pos.y, t.gemPulseBase * 2, t.gemPulseBase * 2);
            const pulse = t.gemPulseBase + Math.sin(sim.elapsed * t.gemPulseRate + gem.id) * t.gemPulseAmp;
            n.setScale(pulse / t.gemPulseBase, pulse / t.gemPulseBase, 1);
            const want = gem.delay > 0 ? t.gemDelayColor : t.gemColor;
            if (this.sigs.get(n) !== want) {
                this.sigs.set(n, want);
                const g = n.getComponent(Graphics)!;
                g.clear();
                g.fillColor = hexToColor(want);
                g.circle(0, 0, t.gemPulseBase);
                g.fill();
            }
        }
        this.gemNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.gemNodes.delete(id);
            this.sigs.delete(n);
            n.setScale(1, 1, 1);
            n.active = false;
            this.gemPool.put(n);
        });
    }

    /* ---------- 敌人(贴图 + 血条 + 护盾弧 + 隐身透明) ---------- */

    private makeEnemyNode(): Node {
        const n = makeNode("Enemy");
        n.addComponent(UIOpacity);
        const spr = makeNode("Spr", n);
        const sp = spr.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        const bar = makeNode("Bar", n);
        bar.addComponent(Graphics);
        const arc = makeNode("Arc", n);
        arc.addComponent(Graphics);
        bar.active = false;
        arc.active = false;
        this.enemiesLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncEnemies(sim: BattleSim): void {
        const t = viewTable().battle;
        const alive = new Set<number>();
        for (const e of sim.enemies) {
            alive.add(e.id);
            let n = this.enemyNodes.get(e.id);
            if (!n) {
                n = this.enemyPool.get() || this.makeEnemyNode();
                if (!n.parent) this.enemiesLayer.addChild(n);
                n.active = true;
                this.enemyNodes.set(e.id, n);
            }
            const r = e.def.radius;
            const spr = Math.round(r * t.enemySpriteScale * 10) / 10;
            // 序列帧优先:anim_monster_<variantId> → anim_enemy_<kind>;命中则按朝向选行、按状态选列
            const vkey = e.def.variantId ? `monster_${e.def.variantId}` : "";
            const animKey = this.animKeyOf(vkey !== "" ? [`anim_${vkey}`, `anim_enemy_${e.kind}`] : [`anim_enemy_${e.kind}`]);
            let st = this.enemyAnim.get(e.id);
            if (!st) { st = { lastCd: e.hitCooldown, attackT: -1 }; this.enemyAnim.set(e.id, st); }
            // 接触冷却被重置(变大)= 这一帧咬到了玩家;冲锋中持续按攻击帧播
            if (e.hitCooldown > st.lastCd + 1e-6 || e.skillState?.skillDashing) st.attackT = sim.elapsed;
            st.lastCd = e.hitCooldown;
            // 行走起伏只给单帧件:|sin| 抬升成小跳步,相位按 speed/72 缩放(迅捷步频高、石巨步频低),id 错相不齐步
            const bob = !animKey && t.enemyBobPx > 0
                ? Math.abs(Math.sin(sim.elapsed * t.enemyBobRate * (e.def.speed / 72) + e.id * 1.7)) * t.enemyBobPx
                : 0;
            this.placeWorld(n, e.pos.x, e.pos.y - bob, spr, spr);
            n.getComponent(UIOpacity)!.opacity = e.hidden ? Math.round(t.hiddenAlpha * 255) : 255;

            // 贴图优先:序列帧 → monster_<variantId> → enemy_<kind> → 代码圆
            let frame: SpriteFrame | undefined;
            let sx = e.facing.x < 0 ? -1 : 1;
            if (animKey) {
                const d = animDir(e.facing.x, e.facing.y);
                const attacking = st.attackT >= 0 && sim.elapsed - st.attackT < attackDuration(t.animAttackFps);
                const col = attacking
                    ? animCol("attack", sim.elapsed - st.attackT, t.animAttackFps)
                    : animCol("walk", sim.elapsed * (e.def.speed / 72) + e.id * 0.37, t.animWalkFps);
                frame = this.animCell(animKey, d.row, col);
                sx = d.flip ? -1 : 1;
            }
            if (!frame) frame = (vkey !== "" ? this.frames.get(vkey) : undefined) ?? this.frames.get(`enemy_${e.kind}`);
            const sprNode = n.getChildByName("Spr")!;
            const fillNode = n.getChildByName("Fill")!;
            sprNode.active = !!frame;
            fillNode.active = !frame;
            if (frame) {
                const sp = sprNode.getComponent(Sprite)!;
                if (sp.spriteFrame !== frame) sp.spriteFrame = frame;
                const ui = sprNode.getComponent(UITransform) || sprNode.addComponent(UITransform);
                ui.setContentSize(spr, spr);
                // 单帧件按朝向水平翻转(基线件面朝右);序列帧按 spriteAnim 的镜像位
                if (sprNode.scale.x !== sx) sprNode.setScale(sx, 1, 1);
            } else {
                const sig = `fill|${e.def.color}|${r}`;
                if (this.sigs.get(fillNode) !== sig) {
                    this.sigs.set(fillNode, sig);
                    const g = fillNode.getComponent(Graphics)!;
                    g.clear();
                    g.fillColor = hexToColor(e.def.color);
                    g.circle(0, 0, r);
                    g.fill();
                }
            }

            // 血条(受伤显示;精英不显示,与 Web 同口径)
            const barNode = n.getChildByName("Bar")!;
            const showBar = e.hp < e.maxHp && !e.isElite;
            barNode.active = showBar;
            if (showBar) {
                const frac = clamp(e.hp / e.maxHp, 0, 1);
                const sig = `bar|${r}|${Math.ceil(e.hp)}|${e.maxHp}`;
                if (this.sigs.get(barNode) !== sig) {
                    this.sigs.set(barNode, sig);
                    const g = barNode.getComponent(Graphics)!;
                    const yBottom = -(r + t.enemyBarGap + t.enemyBarH);
                    g.clear();
                    g.fillColor = hexToColor(t.enemyBarBg);
                    g.rect(-r, yBottom, r * 2, t.enemyBarH);
                    g.fill();
                    g.fillColor = hexToColor(t.enemyBarFill);
                    g.rect(-r, yBottom, r * 2 * frac, t.enemyBarH);
                    g.fill();
                }
            }

            // 护盾卫士正面弧线(朝向随帧变化,量化后重绘)
            const arcNode = n.getChildByName("Arc")!;
            const showArc = e.kind === "shieldguard";
            arcNode.active = showArc;
            if (showArc) {
                const a = Math.atan2(e.facing.y, e.facing.x);
                const qa = Math.round(a * 20) / 20;
                const sig = `arc|${r}|${qa}`;
                if (this.sigs.get(arcNode) !== sig) {
                    this.sigs.set(arcNode, sig);
                    const g = arcNode.getComponent(Graphics)!;
                    g.clear();
                    g.lineWidth = t.guardArcWidth;
                    g.strokeColor = hexToColor(t.guardArcColor);
                    // canvas 角 a(y 向下)在节点空间(y 向上)取 -a;弧跨 ±60°
                    g.arc(0, 0, r + t.guardArcPad, -qa - Math.PI / 3, -qa + Math.PI / 3, false);
                    g.stroke();
                }
            }
        }
        this.enemyNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.enemyNodes.delete(id);
            this.enemyAnim.delete(id);
            this.recycleEnemy(n);
        });
    }

    private recycleEnemy(n: Node): void {
        n.getComponent(UIOpacity)!.opacity = 255;
        n.getChildByName("Bar")!.active = false;
        n.getChildByName("Arc")!.active = false;
        this.sigs.delete(n.getChildByName("Fill")!);
        this.sigs.delete(n.getChildByName("Bar")!);
        this.sigs.delete(n.getChildByName("Arc")!);
        n.active = false;
        this.enemyPool.put(n);
    }

    /* ---------- 召唤物 ---------- */

    private makeMinionNode(): Node {
        const n = makeNode("Minion");
        const spr = makeNode("Spr", n);
        const sp = spr.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        this.minionsLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncMinions(sim: BattleSim): void {
        const t = viewTable().battle;
        const alive = new Set<number>();
        for (const m of sim.minions) {
            alive.add(m.id);
            let n = this.minionNodes.get(m.id);
            if (!n) {
                n = this.minionPool.get() || this.makeMinionNode();
                if (!n.parent) this.minionsLayer.addChild(n);
                n.active = true;
                this.minionNodes.set(m.id, n);
            }
            const s = m.radius * t.minionSpriteScale;
            this.placeWorld(n, m.pos.x, m.pos.y, s, s);
            const frame = this.frames.get("fx_summon");
            const sprNode = n.getChildByName("Spr")!;
            const fillNode = n.getChildByName("Fill")!;
            sprNode.active = !!frame;
            fillNode.active = !frame;
            if (frame) {
                const sp = sprNode.getComponent(Sprite)!;
                if (sp.spriteFrame !== frame) sp.spriteFrame = frame;
                const ui = sprNode.getComponent(UITransform) || sprNode.addComponent(UITransform);
                ui.setContentSize(s, s);
            } else {
                const sig = `m|${m.color}|${m.radius}`;
                if (this.sigs.get(fillNode) !== sig) {
                    this.sigs.set(fillNode, sig);
                    const g = fillNode.getComponent(Graphics)!;
                    g.clear();
                    g.fillColor = hexToColor(m.color);
                    g.circle(0, 0, m.radius);
                    g.fill();
                    g.fillColor = hexToColor("#2a2f3a");
                    g.rect(-5, 5, 3, 3);
                    g.rect(2, 5, 3, 3);
                    g.fill();
                }
            }
        }
        this.minionNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.minionNodes.delete(id);
            this.sigs.delete(n.getChildByName("Fill")!);
            n.active = false;
            this.minionPool.put(n);
        });
    }

    /* ---------- 玩家 ---------- */

    private makePlayerNode(): Node {
        const n = makeNode("Player", this.playerLayer);
        const spr = makeNode("Spr", n);
        const sp = spr.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        const shield = makeNode("Shield", n);
        shield.addComponent(Graphics);
        shield.active = false;
        n.active = false;
        return n;
    }

    private syncPlayer(sim: BattleSim): void {
        const t = viewTable().battle;
        const p = sim.player;
        const n = this.playerNode;
        n.active = p.alive;
        if (!p.alive) return;
        const radius = 16; // PLAYER_BASE.radius(碰撞圆半径,数据表值;贴图边长 = ×playerSpriteScale)
        const s = radius * t.playerSpriteScale;
        this.placeWorld(n, p.pos.x, p.pos.y, s, s);
        // 出战英雄专属战斗件 player_<heroId>,缺图回退通用 player;序列帧 anim_player_<heroId> → anim_player 优先
        const hero = sim.save.selectedHero;
        const pa = this.playerAnim;
        // 朝向:移动时按本帧位移;静止时朝最近敌人;都没有则保持
        const mdx = p.pos.x - this.playerLastX, mdy = p.pos.y - pa.lastY;
        const moving = Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01;
        if (moving) { pa.dx = mdx; pa.dy = mdy; }
        // 施放检测:弹体或特效数量比上一帧多 = 本帧出手;攻击朝向取最近敌人
        if (sim.projectiles.length > pa.lastProj || sim.fx.length > pa.lastFx) {
            pa.attackT = sim.elapsed;
            let best: { x: number; y: number } | null = null, bd = Infinity;
            for (const e of sim.enemies) {
                if (e.hidden) continue;
                const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2;
                if (d < bd) { bd = d; best = e.pos; }
            }
            if (best) { pa.dx = best.x - p.pos.x; pa.dy = best.y - p.pos.y; }
        }
        pa.lastProj = sim.projectiles.length;
        pa.lastFx = sim.fx.length;
        if (p.pos.x < this.playerLastX - 0.01) this.playerFaceSx = -1;
        else if (p.pos.x > this.playerLastX + 0.01) this.playerFaceSx = 1;
        this.playerLastX = p.pos.x;
        pa.lastY = p.pos.y;
        let frame: SpriteFrame | undefined;
        let faceSx = this.playerFaceSx;
        const animKey = this.animKeyOf(hero ? [`anim_player_${hero}`, "anim_player"] : ["anim_player"]);
        if (animKey) {
            const d = animDir(pa.dx, pa.dy);
            const attacking = pa.attackT >= 0 && sim.elapsed - pa.attackT < attackDuration(t.animAttackFps);
            const col = attacking
                ? animCol("attack", sim.elapsed - pa.attackT, t.animAttackFps)
                : animCol(moving ? "walk" : "idle", sim.elapsed, t.animWalkFps);
            frame = this.animCell(animKey, d.row, col);
            faceSx = d.flip ? -1 : 1;
        }
        if (!frame) frame = (hero ? this.frames.get(`player_${hero}`) : undefined) ?? this.frames.get("player");
        const sprNode = n.getChildByName("Spr")!;
        const fillNode = n.getChildByName("Fill")!;
        sprNode.active = !!frame;
        fillNode.active = !frame;
        if (frame) {
            const sp = sprNode.getComponent(Sprite)!;
            if (sp.spriteFrame !== frame) sp.spriteFrame = frame;
            const ui = sprNode.getComponent(UITransform) || sprNode.addComponent(UITransform);
            ui.setContentSize(s, s);
            if (sprNode.scale.x !== faceSx) sprNode.setScale(faceSx, 1, 1);
        } else {
            const sig = "p|fill";
            if (this.sigs.get(fillNode) !== sig) {
                this.sigs.set(fillNode, sig);
                const g = fillNode.getComponent(Graphics)!;
                g.clear();
                g.fillColor = hexToColor("#5ac8fa");
                g.circle(0, 0, radius);
                g.fill();
                g.fillColor = hexToColor("#0b0e14");
                g.circle(0, 0, 5);
                g.fill();
            }
        }
        const shieldNode = n.getChildByName("Shield")!;
        shieldNode.active = p.shield > 0;
        if (p.shield > 0) {
            const sig = `sh|${radius}`;
            if (this.sigs.get(shieldNode) !== sig) {
                this.sigs.set(shieldNode, sig);
                const g = shieldNode.getComponent(Graphics)!;
                g.clear();
                g.lineWidth = 3;
                g.strokeColor = hexToColor("rgba(90,200,250,0.7)");
                g.circle(0, 0, radius + 7);
                g.stroke();
            }
        }
    }

    /* ---------- 投射物(闪电贴图旋转 / 飞刀圆点) ---------- */

    private makeRayNode(): Node {
        const n = makeNode("Ray");
        const spr = n.addComponent(Sprite);
        spr.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        fill.active = false;
        this.projLayer.addChild(n);
        n.active = false;
        return n;
    }

    private makeKnifeNode(): Node {
        const n = makeNode("Knife");
        n.addComponent(Graphics);
        this.projLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncProjectiles(sim: BattleSim): void {
        const t = viewTable().battle;
        const alive = new Set<number>();
        for (const proj of sim.projectiles) {
            alive.add(proj.id);
            let n = this.projNodes.get(proj.id);
            const isRay = proj.kind === "ray";
            if (!n) {
                n = isRay ? this.rayPool.get() || this.makeRayNode() : this.knifePool.get() || this.makeKnifeNode();
                if (!n.parent) this.projLayer.addChild(n);
                n.active = true;
                this.projNodes.set(proj.id, n);
            }
            if (n.name !== (isRay ? "Ray" : "Knife")) continue; // 池类型错配(不会发生,防御)
            if (isRay) {
                const s = Math.max(proj.radius * t.rayScale, t.rayMinPx);
                const dw = s * t.rayAspect;
                this.placeWorld(n, proj.pos.x, proj.pos.y, dw, s);
                const frame = this.frames.get("proj_lightning");
                const sp = n.getComponent(Sprite)!;
                const fillNode = n.getChildByName("Fill")!;
                if (frame) {
                    fillNode.active = false;
                    if (sp.spriteFrame !== frame) sp.spriteFrame = frame;
                    sp.enabled = true;
                    const ui = n.getComponent(UITransform) || n.addComponent(UITransform);
                    ui.setContentSize(dw, s);
                } else {
                    sp.enabled = false;
                    fillNode.active = true;
                    const g = fillNode.getComponent(Graphics)!;
                    g.clear();
                    g.fillColor = hexToColor("#7fd8ff");
                    g.circle(0, 0, proj.radius);
                    g.fill();
                }
                // Web: rotate(ang + π/2) 让贴图纵轴对齐速度;节点空间 y 向上 → angle = -ang - 90°
                const ang = Math.atan2(proj.vel.y, proj.vel.x);
                n.angle = (-ang * 180) / Math.PI - 90;
            } else {
                const d = proj.radius * 2;
                this.placeWorld(n, proj.pos.x, proj.pos.y, d, d);
                const sig = `k|${proj.radius}`;
                if (this.sigs.get(n) !== sig) {
                    this.sigs.set(n, sig);
                    const g = n.getComponent(Graphics)!;
                    g.clear();
                    g.fillColor = hexToColor(t.knifeColor);
                    g.circle(0, 0, proj.radius);
                    g.fill();
                }
            }
        }
        this.projNodes.forEach((n, id) => {
            if (alive.has(id)) return;
            this.projNodes.delete(id);
            n.angle = 0;
            n.active = false;
            if (n.name === "Ray") {
                n.getChildByName("Fill")!.active = false;
                this.rayPool.put(n);
            } else {
                this.sigs.delete(n);
                this.knifePool.put(n);
            }
        });
    }

    /* ---------- 特效贴(nova/explosion/lightning/shield/heal/knife) ---------- */

    private makeFxNode(): Node {
        const n = makeNode("FxDecal");
        n.addComponent(UIOpacity);
        const spr = makeNode("Spr", n);
        const sp = spr.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const fill = makeNode("Fill", n);
        fill.addComponent(Graphics);
        this.fxLayer.addChild(n);
        n.active = false;
        return n;
    }

    private syncFxDecals(sim: BattleSim): void {
        const alive = new Set<Fx>();
        for (const f of sim.fx) {
            alive.add(f);
            let n = this.fxNodes.get(f);
            if (!n) {
                n = this.fxPool.get() || this.makeFxNode();
                if (!n.parent) this.fxLayer.addChild(n);
                n.active = true;
                this.fxNodes.set(f, n);
            }
            const t = 1 - f.ttl / f.maxTtl;
            const tex = FX_TEX[f.type];
            let r = tex ? tex.r : 40;
            if (f.type === "nova" || f.type === "explosion") {
                r = (f.radius ?? (tex ? tex.r : 100)) * (f.type === "nova" ? t : 1 - 0.4 * t);
            }
            r = Math.max(r, 8);
            this.placeWorld(n, f.pos.x, f.pos.y, r * 2, r * 2);
            n.getComponent(UIOpacity)!.opacity = Math.round(clamp(1 - t, 0, 1) * 255);
            const frame = tex ? this.frames.get(tex.key) : undefined;
            const sprNode = n.getChildByName("Spr")!;
            const fillNode = n.getChildByName("Fill")!;
            sprNode.active = !!frame;
            fillNode.active = !frame;
            if (frame) {
                const sp = sprNode.getComponent(Sprite)!;
                if (sp.spriteFrame !== frame) sp.spriteFrame = frame;
                const ui = sprNode.getComponent(UITransform) || sprNode.addComponent(UITransform);
                ui.setContentSize(r * 2, r * 2);
            } else {
                // 缺图回退:代码描形(与 Web drawWorld 的回退分支同参)
                const g = fillNode.getComponent(Graphics)!;
                g.clear();
                const fade = 1 - t;
                if (f.type === "nova" || f.type === "explosion") {
                    g.lineWidth = 3;
                    g.strokeColor = hexToColor(f.type === "nova" ? `rgba(255,140,60,${0.7 * fade})` : `rgba(255,180,80,${0.8 * fade})`);
                    g.circle(0, 0, r);
                    g.stroke();
                } else if (f.type === "lightning") {
                    g.lineWidth = 2;
                    g.strokeColor = hexToColor(`rgba(140,220,255,${0.9 * fade})`);
                    g.circle(0, 0, 18 + t * 20);
                    g.stroke();
                } else if (f.type === "heal") {
                    g.fillColor = hexToColor(`rgba(120,255,160,${0.5 * fade})`);
                    g.circle(0, 0, 16 + t * 18);
                    g.fill();
                } else if (f.type === "shield") {
                    g.lineWidth = 2;
                    g.strokeColor = hexToColor(`rgba(90,200,250,${0.8 * fade})`);
                    g.circle(0, 0, 22);
                    g.stroke();
                } else if (f.type === "knife") {
                    g.lineWidth = 2;
                    g.strokeColor = hexToColor(`rgba(255,215,106,${0.8 * fade})`);
                    g.circle(0, 0, 14);
                    g.stroke();
                }
            }
        }
        this.fxNodes.forEach((n, f) => {
            if (alive.has(f)) return;
            this.fxNodes.delete(f);
            n.getComponent(UIOpacity)!.opacity = 255;
            n.active = false;
            this.fxPool.put(n);
        });
    }

    /** 世界高度变化(设计分辨率刷新)时重建网格与根节点几何 */
    setWorldHeight(wh: number): void {
        this.wh = wh;
        placeRect(this.world, { x: 0, y: 0, w: DESIGN_W, h: wh });
        this.baseX = this.world.position.x;
        this.baseY = this.world.position.y;
        this.drawGrid();
    }
}
