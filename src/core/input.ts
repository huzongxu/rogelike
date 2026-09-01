/**
 * 输入系统:桌面端 WASD/方向键,移动端虚拟摇杆(屏幕左半区拖动)。
 * 输出统一的移动方向向量,供玩家角色消费。
 */

import { platform, type TouchPoint } from "../platform/adapter";
import { type Vec2, vec2 } from "./math";

export class Input {
  /** 归一化移动方向(0,0 = 无输入) */
  moveDir: Vec2 = vec2(0, 0);

  /** 屏幕坐标 → 设计空间坐标换算(由 Game.resize 注入;未注入时按 1:1 处理) */
  xform: (x: number, y: number) => { x: number; y: number } = (x, y) => ({ x, y });
  /** 内容宽度(设计空间),摇杆"左半屏"判定基准 */
  contentW = 560;

  /** 摇杆可视位置(仅移动端用),无输入时为空 */
  joystickVisible = false;
  joystickOrigin = vec2(0, 0);
  joystickKnob = vec2(0, 0);

  private keys = new Set<string>();
  private stickId = -1;
  private stickStart = vec2(0, 0);
  private readonly stickRadius = 56;

  constructor() {
    this.bindKeyboard();
    this.bindTouch();
  }

  private bindKeyboard(): void {
    const down = (e: KeyboardEvent) => {
      this.keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => this.keys.clear());
  }

  private bindTouch(): void {
    platform.onTouchStart((touches) => this.touchStart(touches));
    platform.onTouchMove((touches) => this.touchMove(touches));
    platform.onTouchEnd(() => this.touchEnd());
  }

  private touchStart(touches: TouchPoint[]): void {
    if (this.stickId < 0 && touches.length > 0) {
      const t = touches[0];
      // 摇杆只占左半屏,右半屏留给 UI 点击(升级选卡/按钮);坐标先换算到设计空间
      const c = this.xform(t.x, t.y);
      if (c.x >= this.contentW / 2) return;
      this.stickId = t.id;
      this.stickStart = vec2(c.x, c.y);
      this.joystickVisible = true;
      this.joystickOrigin = vec2(c.x, c.y);
      this.updateKnob(c.x, c.y);
    }
  }

  private touchMove(touches: TouchPoint[]): void {
    for (const t of touches) {
      if (t.id === this.stickId) {
        const c = this.xform(t.x, t.y);
        this.updateKnob(c.x, c.y);
        return;
      }
    }
  }

  private touchEnd(): void {
    this.stickId = -1;
    this.joystickVisible = false;
    this.joystickKnob = vec2(0, 0);
    this.joystickOrigin = vec2(0, 0);
  }

  private updateKnob(x: number, y: number): void {
    const dx = x - this.stickStart.x;
    const dy = y - this.stickStart.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > this.stickRadius) {
      const k = this.stickRadius / d;
      this.joystickKnob = vec2(this.stickStart.x + dx * k, this.stickStart.y + dy * k);
    } else {
      this.joystickKnob = vec2(x, y);
    }
  }

  update(): void {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has("w") || k.has("arrowup")) y -= 1;
    if (k.has("s") || k.has("arrowdown")) y += 1;
    if (k.has("a") || k.has("arrowleft")) x -= 1;
    if (k.has("d") || k.has("arrowright")) x += 1;
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) {
      this.moveDir = vec2(x / len, y / len);
      return;
    }
    if (this.stickId >= 0) {
      const dx = this.joystickKnob.x - this.stickStart.x;
      const dy = this.joystickKnob.y - this.stickStart.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 4) {
        const k2 = Math.min(1, d / this.stickRadius);
        this.moveDir = vec2((dx / d) * k2, (dy / d) * k2);
        return;
      }
    }
    this.moveDir = vec2(0, 0);
  }

  /** 是否按下了任意移动键/摇杆 */
  get isMoving(): boolean {
    return this.moveDir.x !== 0 || this.moveDir.y !== 0;
  }
}

export const input = new Input();
