/**
 * 「完美蓝图」开局效果注入(BattleSim 的 starterEffect 通道)。
 *
 * Web 侧的通路是 `runConfig.blueprintEffect`(转生屏点选,`src/game.ts:4378`)→ `makeStarter()`
 * (`src/game.ts:5335-5336`,`makeStarterEquipment(this.runConfig.blueprintEffect ?? "knife")`)
 * → `inputs.makeStarterEquipment`(`src/game.ts:294`)。三个要点:
 *  1. **现取**:`runConfig` 在每次开局时才被读,且整局会话内从不清零,跨多次开局持续生效;
 *  2. **缺省飞刀**:未点选时是 `"knife"`,而飞刀在工厂里有专属参数覆盖(spread/pierce/damage);
 *  3. **天赋门只在 UI**:`owns("blueprint")`(`src/game.ts:4188`)只决定效果钮组画不画,
 *     `makeStarter()` 本身不复查,所以战斗层也不复查。
 * 本用例把这三点连同开局装备的既有优先级(收藏件 > 套组初始 > 宿主初始武器)一起钉死。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { vec2 } from "@game/core/math";
import { makeSetStarterEquipment, makeStarterEquipment } from "@game/data/equipmentGen";
import { PT_EFFECT_TYPES } from "@game/ui/prestigeLayout";
import { effectDef, type EffectType } from "@game/data/affixes";
import { emptySave } from "../cocos/assets/scripts/core/SaveModel";
import { BattleSim } from "../cocos/assets/scripts/battle/BattleSim";

/** 造一个已开局第 1 关的 sim;starterEffect 按宿主形态传成现取的 getter */
function makeSim(starterEffect?: () => EffectType | undefined): BattleSim {
  const save = emptySave();
  save.energy = 99;
  const sim = new BattleSim({
    save,
    input: { isMoving: false, moveDir: vec2(0, 0) },
    worldH: 996,
    persist: () => {},
    callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
    starterEffect,
  });
  if (!sim.startStage(1)) throw new Error("startStage(1) 未开局,开局装备无从测起");
  return sim;
}

describe("完美蓝图:开局武器效果由宿主注入", () => {
  it("不注入时仍是飞刀,且带工厂里那组飞刀专属参数(战斗指纹不动的依据)", () => {
    const sim = makeSim();
    expect(sim.player.equipment.length, "无收藏件无套组时开局只带一件").toBe(1);
    expect(sim.player.equipment[0]).toEqual(makeStarterEquipment("knife"));
    const p = sim.player.equipment[0].effect.params;
    expect([p.spread, p.pierce, p.damage]).toEqual([16, 1, 40]);
  });

  it("注入 undefined 时回落飞刀(对标 Web 的 ?? \"knife\")", () => {
    const sim = makeSim(() => undefined);
    expect(sim.player.equipment[0]).toEqual(makeStarterEquipment("knife"));
  });

  it("注入哪个效果就带哪个:名字、触发器与参数全走工厂同一条路", () => {
    const sim = makeSim(() => "nova");
    const starter = sim.player.equipment[0];
    expect(starter).toEqual(makeStarterEquipment("nova"));
    expect(starter.effect.def.type).toBe("nova");
    expect(starter.name).toBe(`周期脉冲·${effectDef("nova").name}`);
    expect(starter.triggers[0].def.type, "触发器固定周期脉冲,保证开局可破局").toBe("pulse");
  });

  it("转生屏那八枚效果钮逐个都能落到开局武器上", () => {
    expect(PT_EFFECT_TYPES.length).toBe(8);
    for (const type of PT_EFFECT_TYPES) {
      const sim = makeSim(() => type);
      expect(sim.player.equipment[0].effect.def.type, `按钮 ${type} 与战斗层消费的 EffectType 对不上`).toBe(type);
    }
  });

  it("每次开局现取:改了选装,下一局就换武器(Web 的 runConfig 从不快照)", () => {
    let chosen: EffectType | undefined = "nova";
    const sim = makeSim(() => chosen);
    expect(sim.player.equipment[0].effect.def.type).toBe("nova");
    chosen = "chain";
    if (!sim.startStage(1)) throw new Error("第二次 startStage(1) 未开局");
    expect(sim.player.equipment[0].effect.def.type, "第二次开局要读到改后的值").toBe("chain");
    chosen = undefined;
    if (!sim.startStage(1)) throw new Error("第三次 startStage(1) 未开局");
    expect(sim.player.equipment[0].effect.def.type, "取消选装后回落飞刀").toBe("knife");
  });

  it("不拥有「完美蓝图」天赋也照样生效:门在 UI 侧,战斗层不复查(Web 同形)", () => {
    const sim = makeSim(() => "skeleton");
    expect(sim.save.ownedTalents.includes("blueprint")).toBe(false);
    expect(sim.player.equipment[0].effect.def.type).toBe("skeleton");
  });

  it("选了套组时走套组初始武器,宿主注入的效果不参与(既有优先级不变)", () => {
    const save = emptySave();
    save.energy = 99;
    save.selectedSet = "thorn";
    const sim = new BattleSim({
      save,
      input: { isMoving: false, moveDir: vec2(0, 0) },
      worldH: 996,
      persist: () => {},
      callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
      starterEffect: () => "nova",
    });
    if (!sim.startStage(1)) throw new Error("startStage(1) 未开局");
    expect(sim.player.equipment[0]).toEqual(makeSetStarterEquipment("thorn"));
  });

  it("带了收藏件时走收藏件,宿主注入的效果同样不参与", () => {
    const save = emptySave();
    save.energy = 99;
    const owned = makeStarterEquipment("ray");
    save.ownedGear = [owned];
    save.selectedGearId = owned.id;
    const sim = new BattleSim({
      save,
      input: { isMoving: false, moveDir: vec2(0, 0) },
      worldH: 996,
      persist: () => {},
      callbacks: { onDamage: () => {}, onDeath: () => {}, onVictory: () => {}, onChapterShop: () => {} },
      starterEffect: () => "nova",
    });
    if (!sim.startStage(1)) throw new Error("startStage(1) 未开局");
    expect(sim.player.equipment[0].effect.def.type, "收藏件优先于宿主初始武器").toBe("ray");
    expect(sim.player.equipment[0]).toEqual(owned);
  });

  it("宿主接线在 buildBattle 里:现取 runConfig.blueprintEffect 传给 starterEffect", () => {
    const src = readFileSync(new URL("../cocos/assets/scripts/GameShell.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const battle = src.slice(src.indexOf("private buildBattle()"), src.indexOf("private refreshBackdrop()"));
    expect(battle.includes("starterEffect: () => this.runConfig.blueprintEffect,"), "通道被摘掉的话开局武器就永远只是飞刀").toBe(true);
  });
});
