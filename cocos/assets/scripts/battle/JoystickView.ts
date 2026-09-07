/**
 * 虚拟摇杆 + 键盘移动 —— Web 版 core/input.ts 与 drawJoystick 的节点化替换。
 * 全屏 TOUCH_START/MOVE/END 驱动:左半屏起杆(右半屏留给 UI 点击,与 Web 同一分区规则),
 * 键盘 WASD/方向键优先于摇杆(与 Web Input.update 同一合成顺序),F6 切换挂机/手动。
 * 视觉:joy_base 底盘 + joy_knob 旋钮两枚像素贴图(半径仍读 viewTable.joystick);
 * 缺图回退底盘描边圆 + 旋钮填充圆的 Graphics 画法。
 */

import { EventKeyboard, EventTouch, Graphics, Input, KeyCode, Node, Sprite, SpriteFrame, UITransform, input as ccInput, view } from "cc";
import { DESIGN_W, logicalH, placeRect, fullRect, Rect } from "../core/DesignMetrics";
import { viewTable } from "../core/ViewTable";
import { hexToColor, makeNode } from "../ui/Widgets";
import { type Vec2, vec2 } from "../game/core/math";
import type { MoveInput } from "./BattleSim";

const MOVE_KEYS: Record<number, Vec2> = {
    [KeyCode.KEY_W]: vec2(0, -1),
    [KeyCode.ARROW_UP]: vec2(0, -1),
    [KeyCode.KEY_S]: vec2(0, 1),
    [KeyCode.ARROW_DOWN]: vec2(0, 1),
    [KeyCode.KEY_A]: vec2(-1, 0),
    [KeyCode.ARROW_LEFT]: vec2(-1, 0),
    [KeyCode.KEY_D]: vec2(1, 0),
    [KeyCode.ARROW_RIGHT]: vec2(1, 0),
};

export class JoystickView implements MoveInput {
    readonly root: Node;
    private gfx: Graphics;
    /** 归一化移动方向(0,0 = 无输入);语义 = Web input.moveDir */
    moveDir: Vec2 = vec2(0, 0);

    private keys = new Set<number>();
    private stickId = -1;
    private stickStart = vec2(0, 0);
    private knob = vec2(0, 0);
    private visible = false;

    /** 像素皮两枚(joy_base / joy_knob);缺图恒 null,绘制回落 Graphics 圆 */
    private baseSpr: Sprite | null = null;
    private knobSpr: Sprite | null = null;

    /** F6 等宿主级按键回调(挂机/手动切换) */
    onToggleAuto: (() => void) | null = null;

    constructor(parent: Node, frames: Map<string, SpriteFrame>) {
        this.root = makeNode("Joystick", parent);
        placeRect(this.root, fullRect());
        const ui = this.root.getComponent(UITransform) || this.root.addComponent(UITransform);
        ui.setContentSize(DESIGN_W, logicalH());
        this.gfx = makeNode("Stick", this.root).addComponent(Graphics);
        const baseFrame = frames.get("joy_base");
        const knobFrame = frames.get("joy_knob");
        if (baseFrame) {
            const n = makeNode("Base", this.root);
            this.baseSpr = n.addComponent(Sprite);
            this.baseSpr.spriteFrame = baseFrame;
            this.baseSpr.sizeMode = Sprite.SizeMode.CUSTOM;
            n.active = false;
        }
        if (knobFrame) {
            const n = makeNode("Knob", this.root);
            this.knobSpr = n.addComponent(Sprite);
            this.knobSpr.spriteFrame = knobFrame;
            this.knobSpr.sizeMode = Sprite.SizeMode.CUSTOM;
            n.active = false;
        }

        this.root.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.root.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.root.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.root.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        ccInput.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        ccInput.on(Input.EventType.KEY_UP, this.keyUp, this);
    }

    get isMoving(): boolean {
        return this.moveDir.x !== 0 || this.moveDir.y !== 0;
    }

    /** 触摸 UI 坐标(左下原点)→ 设计空间(左上原点,与 Web screenToContent 同口径) */
    private toDesign(e: EventTouch): Vec2 {
        const loc = e.getUILocation();
        return vec2(loc.x, view.getVisibleSize().height - loc.y);
    }

    private touchStart(e: EventTouch): void {
        if (this.stickId >= 0) return;
        const c = this.toDesign(e);
        // 摇杆只占左半屏,右半屏留给 UI 点击(与 Web touchStart 同一分区)
        if (c.x >= DESIGN_W / 2) return;
        this.stickId = e.getID() ?? -1;
        this.stickStart = vec2(c.x, c.y);
        this.knob = vec2(c.x, c.y);
        this.visible = true;
        this.redraw();
        e.propagationStopped = true;
    }

    private touchMove(e: EventTouch): void {
        if (e.getID() !== this.stickId) return;
        const j = viewTable().joystick;
        const c = this.toDesign(e);
        const dx = c.x - this.stickStart.x;
        const dy = c.y - this.stickStart.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > j.baseRadius) {
            const k = j.baseRadius / d;
            this.knob = vec2(this.stickStart.x + dx * k, this.stickStart.y + dy * k);
        } else {
            this.knob = vec2(c.x, c.y);
        }
        this.redraw();
        e.propagationStopped = true;
    }

    private touchEnd(e: EventTouch): void {
        if (e.getID() !== this.stickId) return;
        this.stickId = -1;
        this.visible = false;
        this.knob = vec2(0, 0);
        this.stickStart = vec2(0, 0);
        this.redraw();
    }

    private keyDown(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.F6) {
            if (this.onToggleAuto) this.onToggleAuto();
            return;
        }
        this.keys.add(e.keyCode);
    }

    private keyUp(e: EventKeyboard): void {
        this.keys.delete(e.keyCode);
    }

    /** 每帧由壳层调用:键盘优先、摇杆次之(与 Web Input.update 同一合成顺序) */
    update(): void {
        const j = viewTable().joystick;
        let x = 0;
        let y = 0;
        this.keys.forEach((code) => {
            const d = MOVE_KEYS[code];
            if (d) {
                x += d.x;
                y += d.y;
            }
        });
        const len = Math.sqrt(x * x + y * y);
        if (len > 0) {
            this.moveDir = vec2(x / len, y / len);
            return;
        }
        if (this.stickId >= 0) {
            const dx = this.knob.x - this.stickStart.x;
            const dy = this.knob.y - this.stickStart.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > j.deadZone) {
                const k2 = Math.min(1, d / j.baseRadius);
                this.moveDir = vec2((dx / d) * k2, (dy / d) * k2);
                return;
            }
        }
        this.moveDir = vec2(0, 0);
    }

    /** 设计空间(左上原点)→ 本节点局部坐标 */
    private lx(x: number): number {
        return x - DESIGN_W / 2;
    }

    private ly(y: number): number {
        return logicalH() / 2 - y;
    }

    private redraw(): void {
        const j = viewTable().joystick;
        const g = this.gfx;
        g.clear();
        if (!this.visible) {
            if (this.baseSpr) this.baseSpr.node.active = false;
            if (this.knobSpr) this.knobSpr.node.active = false;
            return;
        }
        if (this.baseSpr && this.knobSpr) {
            const baseRect: Rect = {
                x: this.stickStart.x - j.baseRadius,
                y: this.stickStart.y - j.baseRadius,
                w: j.baseRadius * 2,
                h: j.baseRadius * 2,
            };
            placeRect(this.baseSpr.node, baseRect, DESIGN_W, logicalH());
            this.baseSpr.node.active = true;
            const knobRect: Rect = {
                x: this.knob.x - j.knobRadius,
                y: this.knob.y - j.knobRadius,
                w: j.knobRadius * 2,
                h: j.knobRadius * 2,
            };
            placeRect(this.knobSpr.node, knobRect, DESIGN_W, logicalH());
            this.knobSpr.node.active = true;
            return;
        }
        g.lineWidth = j.lineWidth;
        g.strokeColor = hexToColor(j.baseColor);
        g.circle(this.lx(this.stickStart.x), this.ly(this.stickStart.y), j.baseRadius);
        g.stroke();
        g.fillColor = hexToColor(j.knobColor);
        g.circle(this.lx(this.knob.x), this.ly(this.knob.y), j.knobRadius);
        g.fill();
    }

    destroy(): void {
        this.root.targetOff(this);
        ccInput.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        ccInput.off(Input.EventType.KEY_UP, this.keyUp, this);
    }
}
