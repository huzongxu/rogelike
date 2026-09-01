/**
 * 美术贴图皮肤助手 —— 贴图优先、缺失回退,行为与原代码绘制完全一致。
 * 所有函数在 `assets.draw()` 返回 false 时落回调用方提供的原绘制路径,
 * 因此缺图/加载中不会改变任何界面表现。
 */

import type { AssetManager } from "../platform/assets";
import { header, theme, fs, F, hexA } from "./theme";
import { barFillW } from "./hud";
import { frameQualityForStage } from "../data/quality";
// 关卡头像框品质映射(§4.4)数值已抽离至 data/quality 品质规范表;保持从本模块导出
export { frameQualityForStage };

/**
 * 横幅标题:贴图底板 + 居中标题;缺失回退 `header()`。
 * (x, y) 沿用原 header 的文字基线锚点,底板画在文字上方区域。
 */
export function skinHeader(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  key: string,
  title: string,
  x: number,
  y: number,
  color: string,
  w = 220,
  h = 42
): void {
  const bx = x - 8;
  const by = y - h + 8;
  if (!assets.draw(g, key, bx, by, w, h)) {
    header(g, title, x, y, color);
    return;
  }
  g.fillStyle = color;
  g.font = F(fs.title, true);
  g.textAlign = "center";
  g.fillText(title, bx + w / 2, y - 4);
  g.textAlign = "left";
}

/**
 * 成品血条/进度条"遮罩法":整图拉伸进矩形,空缺部分盖深色遮罩。
 * 返回 false → 调用方画原代码条。端帽随整体拉伸,接受此变形(不做九宫格)。
 */
export function skinBar(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  dim = "rgba(10,12,18,0.72)"
): boolean {
  if (!assets.draw(g, key, x, y, w, h)) return false;
  const f = Math.min(1, Math.max(0, frac));
  if (f < 1) {
    g.fillStyle = dim;
    g.fillRect(x + w * f, y, w * (1 - f), h);
  }
  return true;
}

/**
 * 胶囊渐变条(战斗 HUD 用):暗色轨道 + 色彩填充 + 上半白色叠光 + 细描边,
 * 纯代码绘制,5-12px 小高度下保持锐利(替代贴图拉伸的 skinBar)。
 * `overlayFrac/overlayColor` 从左端起画盾类覆层。
 */
export function drawBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: string,
  opts?: { overlayFrac?: number; overlayColor?: string }
): void {
  const r = h / 2;
  const capsule = (pw: number) => {
    const rr = Math.min(r, pw / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + pw - rr, y);
    g.arc(x + pw - rr, y + r, rr, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + rr, y + h);
    g.arc(x + rr, y + r, rr, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
  };
  capsule(w);
  g.fillStyle = "rgba(6,8,14,0.8)";
  g.fill();
  const fw = barFillW(w, h, frac);
  if (fw > 0) {
    capsule(fw);
    g.fillStyle = color;
    g.fill();
    capsule(fw);
    g.save();
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.fillRect(x, y, fw, h / 2);
    g.restore();
  }
  if (opts?.overlayFrac && opts.overlayFrac > 0) {
    capsule(barFillW(w, h, opts.overlayFrac));
    g.fillStyle = opts.overlayColor ?? "rgba(90,200,250,0.75)";
    g.fill();
  }
  capsule(w);
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 1;
  g.stroke();
}

/**
 * 图标 + 文字行:图标收进 size×size 画在文字位置,文字右移;
 * 缺失用原字符号回退。调用前先设好字体。
 */
export function iconText(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  key: string,
  fallbackGlyph: string,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 14
): void {
  g.fillStyle = color;
  g.textAlign = "left";
  if (assets.draw(g, key, x, y - size + 2, size, size)) {
    g.fillText(text, x + size + 4, y);
  } else {
    g.fillText(`${fallbackGlyph} ${text}`, x, y);
  }
}

/**
 * 图标按钮:`drawBaseBg` 只画按钮底板(不含文字),文字由本函数单绘一次——
 * 有图标时居中于图标右侧剩余空间,缺图时整体居中。避免旧式"底绘一遍 +
 * 皮绘一遍"的双绘重叠。
 */
export function skinIconButton(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  drawBaseBg: () => void,
  color?: string
): void {
  drawBaseBg();
  const ih = h - 12;
  const hasIcon = ih >= 8 && assets.draw(g, key, x + 4, y + (h - ih) / 2, ih, ih);
  g.fillStyle = (color ?? theme.textSecondary) as string;
  g.font = F(fs.body, true);
  g.textAlign = "center";
  const cx = hasIcon ? x + 4 + ih + (w - 4 - ih) / 2 : x + w / 2;
  g.fillText(label, cx, y + h / 2 + 5);
  g.textAlign = "left";
}

/**
 * 按钮底板九宫格换皮(美术翻新):有贴图时整块盖住底,返回 true;
 * 缺失返回 false,调用方绘制原平面底。文字由调用方照常绘制。
 */
export function skinButtonBase(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  m = 10
): boolean {
  return assets.drawNine(g, key, x, y, w, h, m);
}

/**
 * 关卡头像框:品质框贴图 + 框心关卡数;缺图返回 false,调用方回退代码金圈。
 * (x, y) 为框中心,box 为边长。
 */
export function drawAvatarFrame(
  g: CanvasRenderingContext2D,
  assets: AssetManager,
  stageId: number,
  x: number,
  y: number,
  box: number
): boolean {
  const key = `avatar_${frameQualityForStage(stageId)}`;
  if (!assets.draw(g, key, x - box / 2, y - box / 2, box, box)) return false;
  g.fillStyle = "#ffd76a";
  g.font = F(fs.micro, true);
  g.textAlign = "center";
  g.fillText(String(stageId), x, y + 4);
  g.textAlign = "left";
  return true;
}

/**
 * 代码品质框:圆角暗底 + 品质色描边 + 内缩内发光(可选顶部品质色条)。
 * 配方抽自战斗底坞装备卡——任意宽高比零畸变(竖卡框贴图拉伸不可用时共用),
 * 商店可购卡与武器行同源。
 */
export function drawQualityFrame(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  opts?: { radius?: number; topBar?: boolean }
): void {
  const r = opts?.radius ?? 4;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.stroke();
  g.strokeStyle = hexA(color, 0.35);
  g.lineWidth = 1;
  g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  if (opts?.topBar) {
    g.fillStyle = color;
    g.fillRect(x + 3, y + 3, w - 6, 3);
  }
}
