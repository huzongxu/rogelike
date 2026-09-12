/**
 * pixel-kit 的两条新选项(为透明底单图产物而加,Holopix 等自带去背景导出的生成器走这条):
 *  - `keyout: "alpha"`:不做色键,按 alpha 阈值硬化;
 *  - `crop: [nx, ny, nw, nh]`:相对内容包围盒取子框 —— 同一张全身图既出战斗小人又出半身像。
 * 用合成源图跑真生成器到临时目录,核对尺寸、alpha 硬化与「半身像 = 全身上部」的取样关系。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function png() {
  return import(new URL("../scripts/lib/png.mjs", import.meta.url).href) as Promise<{
    encodePNG: (w: number, h: number, rgba: Buffer) => Buffer;
    decodePNG: (b: Buffer) => { w: number; h: number; rgba: Buffer };
  }>;
}

/** 合成一张 200×400 透明底「人形」:上 40% 是红色头块,下 60% 是蓝色身块,四周留透明边、边缘带半透明软边 */
function synthBody(): { w: number; h: number; rgba: Buffer } {
  const w = 200, h = 400;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inside = x >= 40 && x < 160 && y >= 40 && y < 360;
    if (!inside) continue;
    const head = y < 40 + 320 * 0.4;
    rgba[i] = head ? 220 : 30; rgba[i + 1] = head ? 40 : 60; rgba[i + 2] = head ? 40 : 200;
    const edge = x === 40 || x === 159 || y === 40 || y === 359;
    rgba[i + 3] = edge ? 90 : 255;
  }
  return { w, h, rgba };
}

describe("pixel-kit:keyout=alpha 与 crop 子框", () => {
  it("透明底单图 → 整框战斗件 + 上部子框半身像,alpha 硬化、半身像只含头块色", { timeout: 60_000 }, async () => {
    const { encodePNG, decodePNG } = await png();
    const dir = mkdtempSync(join(tmpdir(), "px-alpha-"));
    try {
      const body = synthBody();
      writeFileSync(join(dir, "body_1.png"), encodePNG(body.w, body.h, body.rgba));
      const cfg = {
        module: 2, export: 1,
        palette: ["#05070c", "#dc2828", "#1e3cc8", "#ffffff"],
        singles: [
          { key: "t_body", src: join(dir, "body_1.png"), keyout: "alpha", art: [44, 44], wm: false },
          { key: "t_bust", src: join(dir, "body_1.png"), keyout: "alpha", crop: [0, 0, 1, 0.4], art: [84, 84], fit: "cover", wm: false },
        ],
      };
      writeFileSync(join(dir, "cfg.json"), JSON.stringify(cfg));
      const out = join(dir, "out");
      execFileSync(process.execPath, [join(ROOT, "scripts", "pixel-kit.mjs"), `--config=${join(dir, "cfg.json")}`, `--out=${out}`], { cwd: ROOT, stdio: "pipe" });

      const bodyOut = decodePNG(readFileSync(join(out, "t_body.png")));
      const bustOut = decodePNG(readFileSync(join(out, "t_bust.png")));
      expect([bodyOut.w, bodyOut.h]).toEqual([44, 44]);
      expect([bustOut.w, bustOut.h]).toEqual([84, 84]);

      const colors = (im: { w: number; h: number; rgba: Buffer }) => {
        const set = new Set<string>();
        let opaque = 0;
        for (let i = 0; i < im.w * im.h; i++) {
          const a = im.rgba[i * 4 + 3];
          expect(a === 0 || a === 255, `alpha 未硬化: ${a}`).toBe(true);
          if (!a) continue;
          opaque++;
          set.add(`${im.rgba[i * 4]},${im.rgba[i * 4 + 1]},${im.rgba[i * 4 + 2]}`);
        }
        return { set, opaque };
      };
      const b = colors(bodyOut), u = colors(bustOut);
      // 全身件同时含头块红与身块蓝;半身像取的是内容框上 40%,只含头块红,且 cover 铺满盒(不透明像素占满)
      expect(b.set.has("220,40,40") && b.set.has("30,60,200")).toBe(true);
      expect(u.set.has("220,40,40")).toBe(true);
      expect(u.set.has("30,60,200")).toBe(false);
      expect(u.opaque).toBe(84 * 84);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
