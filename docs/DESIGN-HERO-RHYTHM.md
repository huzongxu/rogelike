# 英雄节律 × 独有技能 × 法宝（局内成长重构设计）

> 状态：**S1 全部与 S2 三项已落地**（2026-09-13；Q1–Q7 裁定见 §1，落地对账见 §12）。数值仍为初值。
> 解决的问题：升级三选一与章间商店卖同一种商品、体感割裂；英雄是纯皮肤、没有独有技能；触发器随机导致"职业技能体感奇怪"。
> 关系：本设计**替代** [DESIGN-SEASON-FEEL](DESIGN-SEASON-FEEL.md) 的 A2 商品口径、D2 六独有六常规、D3 道具；**保留**其 B（压力）、C（Boss）两批。对应关系见 §9。
> 数值纪律沿用 [DESIGN-VALUES-SPEC](DESIGN-VALUES-SPEC.md)：全部入表，禁止内联。`S/` = `cocos/assets/scripts/`，行号为撰写时事实。

---

## 0. 一句话结论

一张装备卡现在 = 效果 + 触发器 + 修饰器绑死（`S/game/data/equipmentGen.ts:46-59`）。本设计把三样拆成三种物品、三个决策时刻：

| 层 | 物品 | 归属 | 获得时刻 | 玩家在决定什么 |
| --- | --- | --- | --- | --- |
| 节律 | 触发条件（受击 / 周期 / 击杀 / 移动 / 连杀 / 低血） | **英雄本命 1 条**，局内分岔解锁第 2 条 | 选英雄 + 升级分岔 | 我怎么打 |
| 独有技能 | 每英雄 4 个，含核心 1 + 分岔 2（互斥）+ 进阶 1，各 5 阶 | 英雄独有 | **升级三选一，不花钱** | 我是谁 |
| 法宝 | 主动 14（现效果层）+ 被动 8（现修饰器层） | 全员通用 | **章间商店，唯一金币出口** | 我拿什么 |

质变来自两张共鸣表：**主动法宝 × 节律**（毒云挂移动出毒径）、**被动法宝 × 独有技能**（冷缩让荆棘领域不再中断）。同一张法宝在不同英雄手里默认就不一样，这是重开的理由。

---

## 1. 讨论纪要与裁定

| 编号 | 问题 | 裁定 | 关键理由 |
| --- | --- | --- | --- |
| Q1 | 升级弹层怎么处理 | **保留战场内三选一，商品换成独有技能，去掉金币重随** | 两层不再卖同一种东西；金币预算不再被弹层搅乱 |
| Q2 | 现有 14 通用效果去哪 | **B：改包装为主动法宝，全员可买** | 对照弹壳特攻队 / Hades / 雨中冒险 / 杀戮尖塔 / Brotato：头部产品全是"独有核心 + 通用道具池"，无一款全独占；现有引擎分支零重写 |
| Q4/Q5 | 触发器归属 | **触发器彻底离开法宝，成为英雄本命节律；第 2 节律由独有技能分岔解锁** | 同一法宝在不同英雄手里默认不同表现；法宝库从 24–28 缩回 14，卡面不用写发动条件 |
| Q6 | 法宝挂哪条节律 | **A：每个法宝只挂一条，默认按共鸣自动分配，商店可手动切换** | 给"自主选择"一个有信息的时刻，且总触发量不变、数值不膨胀 |
| Q7 | 开局选择 | **C：本命固定 + 首章法宝三选一（S1）+ 跨局解锁第二本命（S2）** | 零信息的开局选节律会退化为全选周期型；开局选择应具体、可见、带这局的信息 |
| — | 第 2 节律金币买 / 开局 2 本命 | 否决 | 前者钱能绕过取舍、每多一条节律 DPS 翻倍；后者身份糊掉一半、触发器概念后期消失 |

---

## 2. 节律（Rhythm）

### 2.1 定义

节律 = 现有 `TriggerType` 的 6 个常规值（`S/game/data/affixes.ts:11`），语义不变。`crit` / `elite` 两个隐藏触发器**退出节律体系**，转为稀有被动法宝的附带效果（见 §4.2）。

```
RhythmId = "hit" | "pulse" | "kill" | "move" | "combo" | "hurt"
```

节律有等级（1–5），由升级三选一里的「节律强化」卡提升：每级内置冷却 −8%、触发阈值 −6%（连杀所需数 / 移动距离 / 低血阈值上浮）。

### 2.2 十二英雄本命节律（初稿，可调）

每种节律恰好 2 个英雄，保证 6 种打法在英雄池里都有代表。分岔节律是该英雄两个分岔技能各自解锁的第 2 节律（§3）。

| 节律 | 英雄 | 套组（现 `setId`） | 现初始武器的暗示 | 分岔节律候选 |
| --- | --- | --- | --- | --- |
| 受击 hit | 薇拉 | thorn | 荆棘圆环 nova+hit | 低血 / 移动 |
| 受击 hit | 缪 | veil | 3 灵狼 · 回复系 | 周期 / 击杀 |
| 周期 pulse | 凯尔 | barrage | 寒霜风暴 ray 16 发 | 连杀 / 移动 |
| 周期 pulse | 诺拉 | glacier | 界碑冰棱 ray 5 束 | 受击 / 击杀 |
| 击杀 kill | 布兰 | ember | 连闪天火 chain | 周期 / 低血 |
| 击杀 kill | 奥登 | requiem | 镇魂安可 2 骷髅 | 连杀 / 受击 |
| 移动 move | 薇洛 | phantom | 影群哨笛 2 灵狼 | 击杀 / 周期 |
| 移动 move | 多兰 | magma | 熔核之心 meteor | 受击 / 连杀 |
| 连杀 combo | 洛卡 | blizzard | 白啸霜刃 knife 12 发 | 周期 / 移动 |
| 连杀 combo | 雷恩 | cinderfang | 炽牙雷殛 chain 5 跳 | 击杀 / 低血 |
| 低血 hurt | 希雅 | frost | 极北权杖 frost_ring | 受击 / 移动 |
| 低血 hurt | 莎莉 | plague | 瘟薪熔炉 cloud | 周期 / 击杀 |

### 2.3 同步爆发与挂机兼容（必做）

- **独立内置冷却**：每个主动法宝挂上节律后有自己的 `innerCd`（表 `ARTIFACT_DEFS[id].innerCd`），受击型另设全局 `HIT_RHYTHM_WINDOW = 0.5 s` 内只响一次，避免同帧齐放。
- **受击 / 低血英雄的挂机 AI**：`autoMove` 现为"贴身才躲"（`S/game/systems/battleWorld.ts:331`）。新增 `HeroDef.aiProfile: "kite" | "hold" | "orbit"`，受击型走 `hold`（允许被 ≤N 只围）、移动型走 `orbit`（持续绕场）。核心技能必须保证 `hold` 型英雄第 1 章不死（sim 验收）。

---

## 3. 独有技能（Hero Skills）

### 3.1 结构

每英雄 4 个，全部只出现在**升级三选一**：

| 槽 | 数量 | 获得 | 说明 |
| --- | --- | --- | --- |
| 核心 | 1 | 开局自带 1 阶 | 即现初始武器改写，绑定本命节律 |
| 分岔 | 2（互斥） | 三选一中出现，选一个另一个永久消失 | **选中即解锁该分岔的第 2 节律**；这是一局最重的决策 |
| 进阶 | 1 | 三选一中出现 | 被动型，改写核心技能的一条规则 |

每个技能 5 阶，三选一里"升阶"与"新技能"同池出现。一局约 25–35 级（[DESIGN-SEASON-FEEL](DESIGN-SEASON-FEEL.md) B2 口径），内容量 = 4 技能 × 5 阶 + 节律强化 2 × 5 = 30 次选择，与等级数匹配；耗尽后三选一改出「回血 30% / 金币 +80 / 下一章首刷免费」三张兜底。

### 3.2 S1 三英雄详表（荆棘 / 弹幕 / 余烬）

**薇拉 · 荆棘回响（本命：受击）**

| 槽 | 技能 | 效果 | 逐阶 | 共鸣被动 |
| --- | --- | --- | --- | --- |
| 核心 | 荆棘圆环 | 受击时向周围爆出荆棘（现 nova 50 / 半径 200，`equipmentGen.ts:497+`） | 伤害 +15% / 阶 | 范围 → 半径 ×1.5 且留 1.5 s 荆棘地 |
| 分岔 A | 荆甲 | 生命 <50% 时获得护盾，吸收 = 8% 最大生命；**解锁低血节律** | 阈值 +5% / 阶 | 持续 → 护盾不消失改为衰减 |
| 分岔 B | 棘行者 | 移动每 120 px 留一枚荆棘刺，踩中 20 伤；**解锁移动节律** | 间距 −10% / 阶 | 分裂 → 刺踩中分裂 3 枚 |
| 进阶 | 血棘 | 荆棘命中回复 1 生命，0.3 s 冷却 | 回复 +0.5 / 阶 | 吸血 → 无冷却 |

**凯尔 · 弹幕风暴（本命：周期）**

| 槽 | 技能 | 效果 | 逐阶 | 共鸣被动 |
| --- | --- | --- | --- | --- |
| 核心 | 寒霜齐射 | 每 1.2 s 向全向齐射 16 束冰弹（R6：节律调率 ×0.5，束数回到旧弹幕风暴的 16） | +1 束 / 阶 | 冷缩 → 齐射改为持续连射 |
| 分岔 A | 连杀过载 | 连杀 8 时下一次齐射伤害 ×2；**解锁连杀节律** | 所需连杀 −1 / 阶 | 增幅 → 过载不消耗，持续 3 s |
| 分岔 B | 猎手步伐 | 移动时齐射方向收拢为前向 60° 扇形，伤害 ×1.4；**解锁移动节律** | 角度 −5° 伤害 +5% / 阶 | 穿透 → 扇形弹穿透后留霜环 |
| 进阶 | 冰晶穿刺 | 冰弹命中减速 30% 持续 1 s | +0.2 s / 阶 | 连锁 → 减速目标间弹射 |

**布兰 · 余烬天灾（本命：击杀）**

| 槽 | 技能 | 效果 | 逐阶 | 共鸣被动 |
| --- | --- | --- | --- | --- |
| 核心 | 连闪天火 | 击杀时从尸体引出闪电链 4 跳（现 chain 50 / 4 跳） | +1 跳 / 阶 | 连锁 → 跳跃距离翻倍可跨屏 |
| 分岔 A | 余烬脉冲 | 每 3 s 在最近尸体处引燃 1 个火圈；**解锁周期节律** | 火圈 +1 / 阶 | 持续 → 火圈不消失，最多 6 个 |
| 分岔 B | 燎原怒火 | 生命 <40% 时下一次击杀引发全屏火浪 60 伤，冷却 12 s；**解锁低血节律** | 冷却 −1.5 s / 阶 | 爆炸 → 火浪留燃烧地 |
| 进阶 | 引燃 | 被闪电命中的敌人燃烧 3 s，每秒 4 伤 | +1 伤 / 阶 | 增幅 → 燃烧可叠 3 层 |

其余 9 英雄 S1 用**通用职业技能包**过渡：核心 = 现初始武器；分岔 A「守势」（低血护盾，解锁低血）/ 分岔 B「奔袭」（移动留痕，解锁移动）；进阶「专注」（本命节律冷却 −15%）。S2 起每季替换 3 个英雄为专属表。

---

## 4. 法宝（Artifacts）

### 4.1 主动法宝（14）

即现 `EffectType` 14 个（`affixes.ts:12-`），引擎 cast 分支不变。**卡面不写发动条件**，发动由所挂节律决定。

| 类别 | id | 名 | 共鸣节律（×3 权重 / 变形） | 变形 |
| --- | --- | --- | --- | --- |
| 通用 | knife | 飞刀符 | pulse / combo | 连杀：飞刀数 = 连杀数 / 4 |
| 通用 | nova | 新星符 | pulse / hurt | 低血：新星附带 1 s 无敌 |
| 通用 | skeleton | 骸骨符 | pulse / kill | 击杀：骷髅从尸体起身 |
| 通用 | cloud | 毒云符 | move / pulse | 移动：连续毒径而非圆云 |
| 通用 | ray | 冰射符 | pulse / hit | 受击：射线朝来袭方向反打 |
| 通用 | chain | 雷链符 | kill / combo | 连杀：跳数 = 连杀 / 3 |
| 通用 | shield | 护盾符 | hurt / hit | 受击：盾破时反弹 30% |
| 通用 | drain | 汲取符 | hurt / hit | 低血：汲取 ×2 |
| 赛季 | icelance | 冰锥符 | pulse / kill | 击杀：冰锥连锁冻结 |
| 赛季 | frost_ring | 霜环符 | move / hurt | 移动：霜环跟随身后 |
| 赛季 | meteor | 陨星符 | pulse / combo | 连杀：陨星数 +1 / 5 连杀 |
| 赛季 | magma_trail | 熔迹符 | move / pulse | 移动：熔迹不消失直到章末 |
| 赛季 | spirit_wolves | 灵狼符 | kill / pulse | 击杀：狼吞尸回血 |
| 赛季 | haunt_crown | 冠冕符 | kill / combo | 连杀：冠冕范围随连杀扩大 |

共鸣节律直接取现 `SKILL_AFFINITY[effect].triggers`（`S/game/data/reroll.ts:40-55`），零新数据。

- 品质 5 档保留（`quality.ts:57-95`），决定件数 / 射速 / 数值。
- **进化**保留：2 张同 id 同品质 → 升一档（现 `ShopModel.ts:351-379` 逻辑不变）。
- **节律分配**：`artifact.rhythm: RhythmId`，默认 = 已解锁节律中共鸣权重最高者；商店武器行加「切换节律」钮，免费，不限次。未解锁的节律不可选。

### 4.2 被动法宝（8 + 2 稀有）

即现 `ModifierType` 8 个常规值（`affixes.ts:31`）升格为**全局**被动，对全部主动法宝与独有技能生效。

| id | 名 | 效果 | 共鸣技能（举例，S1） |
| --- | --- | --- | --- |
| haste | 冷缩 | 全体触发冷却 −12% | 寒霜齐射 → 连射 |
| power | 增幅 | 伤害 +15% | 连杀过载 / 引燃 |
| duration | 恒久 | 持续 +25% | 荆甲 / 余烬脉冲 |
| explode | 爆裂 | 命中处爆炸 20% 伤害 | 燎原怒火 |
| split | 分裂 | 弹体命中分裂 2 枚 | 棘行者 |
| pierce | 穿透 | 弹体穿透 +1 | 猎手步伐 |
| chain | 连锁 | 命中弹射 1 次 | 连闪天火 / 冰晶穿刺 |
| lifesteal | 吸血 | 伤害 3% 回血 | 血棘 |
| echo（稀有） | 回响 | 0.35 s 后 50% 二次触发（现值 `equipmentGen.ts:180-185`） | 附带 crit 触发：暴击时必回响 |
| condemned（稀有） | 送葬 | 目标 <30% 血 ×1.45 | 附带 elite 触发：杀精英刷新全部冷却 |

被动法宝可叠：同 id 第 2 张起效果 ×0.6 递减（`PASSIVE_STACK_DECAY = 0.6`），上限 3 张。

### 4.3 槽位

| 槽 | 基础 | 广告 | 硬顶 |
| --- | --- | --- | --- |
| 主动法宝 | 4 | 每局 1 次 +1（`grantSlotByAd`，`RUN_AD_SLOT_LIMIT`） | 6（`SHOP_SLOT_CAP`） |
| 被动法宝 | 4 | 不扩；天赋「被动槽扩展」+1 | 5 |
| 独有技能 | 不占槽 | — | — |

天赋：「额外武装」「槽位扩展 I」各给主动槽 +1（满天赋 4 + 2 = 6 即硬顶，此时广告开槽显示「槽位已满」）；「槽位扩展 II」（id `slot2` 不变，兼容存档）改为被动槽 +1。落地见 R7。

---

## 5. 共鸣（质变）规则

两张表，各自有界：

1. **主动法宝 × 节律**（14 × 6，只填 2 格/行）：命中共鸣格时法宝**改名 + 变形**（§4.1「变形」列），卡面标「与你的 X 节律共鸣」。非共鸣格只按节律正常发动。
2. **被动法宝 × 独有技能**（8 × 4/英雄，只填 1 格/技能）：拿到共鸣被动时技能**改名 + 改写一条规则**（§3.2「共鸣被动」列）。

首次达成任一共鸣：全屏横幅 + 0.4 s 时停 + 图鉴记录（复用 [OPTIMIZATION-REVIEW](OPTIMIZATION-REVIEW.md) §7 #5 的"构筑发现时刻"）。

### 5.1 赛季共鸣（R5）

`S/game/data/artifacts.ts` 的 `SEASON_RESONANCES[seasonId]`：`pairs`（3 对新格，S1 为空）、`face`（赛季法宝 id，S1 无）、`featured`（S1 的 3 格首发角标）。判定与命名走 `equipmentGen.equipmentResonance(eq, seasonId)`：基础格 > 变体自带格 > 赛季格（当季 `season` / 过季 `echo`），不给 `seasonId` = 老口径只看基础格。宿主把 `save.seasonId` 一路传到：引擎 `ctx.seasonId`（变形补丁）、世界层 `detectResonance`（横幅角标「本季新共鸣 / 回响共鸣 / 本季首发」，图鉴键变体法宝用变体 id）、商店 / 首章三选一 / HUD（改名、角标「本季新 / 回响 / 赛季」）、`generateEquipment(..., seasonId)`（赛季法宝掷点）。

| 赛季 | 主题 | 新格（法宝 × 节律 → 变形） | 赛季法宝 |
| --- | --- | --- | --- |
| S1 | 回响苏醒 | 无新格；首发角标：毒径 / 反打冰射 / 连杀雷链 | — |
| S2 | 永冻深渊 | 霜环 × 受击 → 霜甲环；冰锥 × 低血 → 绝境冰雨；冰射 × 连杀 → 连杀冰束 | 霜牢符（冰锥变体，受击 → 冰牢） |
| S3 | 熔火回响 | 陨星 × 受击 → 反击陨星；熔迹 × 击杀 → 尸焰熔迹；新星 × 击杀 → 连爆新星 | 熔核符（陨星变体，受击 → 熔核反击） |
| S4 | 幽冥潮汐 | 骸骨 × 低血 → 绝境亡军；冠冕 × 低血 → 濒死冠冕；灵狼 × 移动 → 随行狼群 | 招魂符（冠冕变体，低血 → 招魂） |

数值全是初值（乘区 ≤ 基础表同类格，整数项 ≤ 2）；S1 行为与 R5 之前完全一致（战斗指纹不动）。

**套装体系退役**：`isSetPiece` / 3 件 6 件（`sets.ts:199-204,320-322`）由「共鸣数」里程碑替代：本局共鸣 2 / 4 / 6 处 → 现 `bonus3` / `bonus6` 的数值加成挂在 2 / 4 处，6 处给该英雄的"极"质变。`SET_BONUSES` 表内容保留、只换触发条件。跨套组合技 3 条（`combos.ts:36-`）改为「法宝组合」：判定源从效果 + 修饰器改为主动 + 被动法宝 id，内容不变。

---

## 6. 一局流程

```
选英雄（本命节律已定）
 └► 首章法宝三选一（免费，3 张主动法宝，标共鸣）
     └► 第 1 章 60 s ── 升级 ► 三选一【独有技能 / 升阶 / 节律强化】（不花钱，每章 1 次免费重随，锁 1 张）
         └► 章末商店【3 法宝位 · 刷新 · 强化 · 进化 · 切换节律 · 销毁 · 重置分岔】
             └► 第 2 章 … ► 第 6 级前后出现分岔二选一（解锁第 2 节律）
                 └► … ► 第 20 章 Boss（C 批口径）
```

- **升级弹层**（`S/levelup/LevelUpModel.ts`）：商品源从 `generateChoices` 换成 `HeroSkillPool.offer(hero, owned, 3)`；金币重随退役，`LEVELUP_FREE_REROLL_PER_CHAPTER = 1`；锁定沿用 `lock/lockedIndex`。分岔卡成对出现在同一轮（左右并排），选一张另一张标灰消失。
- **商店**（`S/shop/ShopModel.ts`）：卡位商品改为法宝（主动 / 被动混出，主动 : 被动 = 2 : 1）；武器行新增「切换节律」；新增「重置分岔」1 次/局，价 `RESET_BRANCH_COST = 400 × (1 + 章 × 0.05)`，重置后分岔二选一在下次升级重新出现。热区顺序：工具钮 → 槽位 → 三卡 → 法宝行（切换节律 > 强化 > 销毁）→ 进化 → 下一章。
- **首章三选一**：复用升级弹层几何（`S/game/ui/levelUpLayout.ts`），商品 = 3 张主动法宝 common 品质，`FIRST_PICK_RESONANCE_GUARANTEE = 1`（至少 1 张与本命共鸣）。

---

## 7. 数值初值（全部入表）

```
S/game/data/rhythm.ts
  RHYTHM_MAX_LEVEL          = 5
  RHYTHM_CD_PER_LEVEL       = 0.08
  RHYTHM_THRESHOLD_PER_LEVEL= 0.06
  HIT_RHYTHM_WINDOW         = 0.5      // s
  HERO_RHYTHM : Record<HeroId, RhythmId>          // §2.2

S/game/data/heroSkills.ts
  HERO_SKILLS : Record<HeroId, HeroSkillDef[4]>   // §3.2；kind: "core" | "branch" | "advance"
  SKILL_MAX_RANK            = 5
  BRANCH_MIN_LEVEL          = 5        // 分岔卡最早出现的玩家等级
  BRANCH_GUARANTEE_LEVEL    = 8        // 到此级未出现则必出
  FALLBACK_OFFERS           = [heal30, gold80, freeRefresh]

S/game/data/artifacts.ts
  ARTIFACT_DEFS : Record<EffectType, { name, innerCd, resonance: RhythmId[2], morph }>
  PASSIVE_DEFS  : Record<ModifierType, { name, value, resonanceSkills: SkillId[] }>
  PASSIVE_STACK_DECAY       = 0.6
  PASSIVE_STACK_CAP         = 3
  ACTIVE_SLOTS = 4 / ACTIVE_SLOT_CAP = 6 / PASSIVE_SLOTS = 4
  SHOP_ACTIVE_PASSIVE_RATIO = 2 : 1

S/game/data/levelUp.ts（改）
  LEVELUP_FREE_REROLL_PER_CHAPTER = 1
  REROLL_CURVE / REROLL_HIDDEN     → 退役（隐藏词条改走稀有被动法宝）

S/game/data/shop.ts（改）
  RESET_BRANCH_COST_BASE    = 400
  FIRST_PICK_RESONANCE_GUARANTEE = 1

S/game/data/combat.ts（改）
  levelUpGrowth() 接线（+8 maxHp，现零调用 `player.ts:68`）
```

金币曲线沿用 A4 已落地值（`GOLD_PER_XP 1`、`perPurchase 0.18`、`perChapter 0.05`）。法宝 basePrice 沿用品质表。**因升级层不再花钱，商店是唯一出口**，A4 的"后期盈余"需重跑 `tests/gold-economy.test.ts` 口径：出口 = 3 法宝 + 1 强化 + 1 进化 + 重置分岔。

---

## 8. 数据结构与改动面

| 文件 | 改动 |
| --- | --- |
| `S/game/data/heroes.ts` | `HeroDef` 加 `rhythm: RhythmId`、`aiProfile`；"英雄无数值"纪律改为"英雄只有节律与技能表，无属性数值" |
| `S/game/data/equipmentGen.ts` | `Equipment` 拆为 `Artifact { id, kind: "active" \| "passive", level, quality, rhythm?, hiddenAffix? }`；`triggers[]` / `modifiers[]` 字段退役；`generateChoices` 改为法宝生成，`rerollCard` 退役 |
| `S/game/systems/equipmentEngine.ts` | 触发分发从 `eq.triggers` 遍历（`:150,177,242`）改为按 `artifact.rhythm` 查 `player.rhythms`；被动法宝从 per-eq 修饰器改为 `statsOf` 全局乘区；新增 `HeroSkill` cast 入口 |
| `S/levelup/*` | 商品源换 `HeroSkillPool`；金币重随退役；分岔成对展示 |
| `S/shop/ShopModel.ts` | 法宝商品、切换节律、重置分岔；套组进度行改共鸣数 |
| `S/game/data/sets.ts` `combos.ts` | 计件源改共鸣 / 法宝 id，表内容不动 |
| `S/core/SaveModel.ts` | `gearLevels` 键从 `eq.name` 改 `artifact.id`（一次性迁移）；`collection` 加 `resonances: string[]`；S2 加 `heroUnlocks: Record<HeroId, { secondRhythm?: RhythmId }>` |
| 存档兼容 | 局内制物品不入档，无迁移；跨局只有 `gearLevels` 键迁移 |

---

## 9. 与 DESIGN-SEASON-FEEL 的关系

| 原项 | 处置 |
| --- | --- |
| A1 强化 / A3 广告槽 / A4 金币 | 保留，对象从装备改法宝 |
| A2 三选一 + 金币重随 + 隐藏词条 | **商品替换**为独有技能；金币重随退役；隐藏触发/修饰器转稀有被动法宝 |
| B1–B5 压力与成长 | 保留，B2 的等级收益由本设计接线 |
| C1–C4 Boss | 保留不动 |
| D1 技能等级入口 | 改为**独有技能跨局熟练度**（每技能 Lv 1–5，星尘购买，加初始阶数上限），gearup 键迁移一并做 |
| D2 六独有 + 六常规 | **替代**：4 独有 + 14 主动法宝 + 8 被动法宝 |
| D3 道具 8 件 | **并入被动法宝**：dice / core / hourglass / lens / stabilizer / yoke / mirror / spare_life 作为 S2 被动法宝扩充池 |

---

## 10. 分期与验收

| 期 | 内容 | 验收 |
| --- | --- | --- |
| S1-a | 节律表 + 法宝拆分 + 引擎分发改造 + 商店法宝化 + 节律切换 | 单测：14 法宝 × 6 节律全部可发动；共鸣格变形生效；被动叠加衰减；`npm test` 基线不降 |
| S1-b | 独有技能池 + 升级弹层换商品 + 分岔互斥 + 首章三选一 | 单测：分岔选一另一永久消失；解锁第 2 节律后法宝可切；30 级内技能池不耗尽 |
| S1-c | 三英雄专属表 + 通用职业包 + 挂机 AI 三档 + 共鸣发现横幅 | sim：`hold` 型英雄第 1 章存活；三英雄第 20 章 TTK 落在 C2 区间；实机录三英雄各一局 |
| S2 | 跨局第二本命解锁 + D3 道具并入被动池 + 再补 3 英雄专属表 | 存档兼容测试 |

每期跑 `npm test` → `npm run typecheck:cocos` → `npm run build:cocos && npm run smoke:cocos` → 删档冷加载。战斗指纹必然移动，按 P6 单独签字。

---

## 11. 待裁定

| 编号 | 事项 | 当前初值 | 说明 |
| --- | --- | --- | --- |
| R1 | 被动法宝是否也占商店 3 卡位 | ✅ 已裁定（2026-09-13）：三卡位**第三格恒为被动**（`SHOP_PASSIVE_SLOTS` = 1），刷新时跟着换 | 每章必见一张被动，被动与主动争同一份金币的取舍稳定可读；混出会有整章见不到被动的落空 |
| R2 | 融合（fusion，星尘、场外）去留 | ✅ 已裁定（2026-09-13）：**融合搬到主菜单**（第 7 枚入口，操作存档收藏 `ownedGear`，融合屏本体不动）；商店那格工具钮改为**被动管理**（借升级弹层列出被动，选它销毁回收基础价 × `DESTROY_REFUND_RATE`，翻页 / 关闭） | 融合是场外星尘养成，与局内买法宝节奏两条线；分开后商店只剩局内决策，被动槽满了有出口 |
| R3 | 分岔出现等级 | ✅ 已裁定（2026-09-13）：**保持 5–8 级**（`BRANCH_MIN_LEVEL` 5 起 50%，`BRANCH_GUARANTEE_LEVEL` 8 保底）+ **分岔预告**：`BRANCH_TEASE_LEVEL` 3 起升级弹层读数行提示「分岔将在 Lv.5 后出现」，5 级未出改「分岔最迟 Lv.8」；分岔已选 / 本轮成对在场 / 英雄表无分岔时不提示 | 5 级落在首章末到第 2 章中，已拿首章法宝、见过商店，选方向有信息；预告让前两次升级有盘算（囤升阶还是节律强化），拿到「提前定方向」的目标感而不付盲选代价；再晚则分岔只剩 2–3 阶成长 |
| R4 | 通用职业包是否允许与专属表共存 | 不共存，替换制 | S2 换表时老玩家该英雄进度按熟练度折算 |
| R5 | 赛季新鲜感层怎么落在法宝体系上 | ✅ 已裁定（2026-09-13，「B+」）：**每季换共鸣格**——S2–S4 各 3 对「法宝 × 节律」新格（填基础表空格），当季全量、过季降为**回响共鸣**（改名保留、补丁 ×`SEASON_ECHO_MULT` 0.5）；**每季 1 枚赛季法宝**（现效果变体，自带 1 条共鸣格，与本季一对同节律），上市季商店按 `SEASON_FACE_OFFER_CHANCE` 0.25 偏向，过季进通用池按件数均摊、常驻可收藏；S1 不加新格，只标 3 格基础共鸣为「本季首发」 | 换共鸣改的是「任何一次挂法宝」的期待值，每局都碰得到；老组合不消失只回落，重学成本是找新组合；赛季法宝是图鉴里那一格「脸」。S5+ 无表 = 只剩回响，第 2 轮主题循环时补 |
| R6 | 12 英雄节律分配（§2.2） | 初稿；**复审数据已出**（2026-09-13，`balance-sim` 12 英雄 × 2 种子、1200s、商店成长 + 章型、风筝挡）：首章击杀全部 59–66（无节律在前期掉队）；最终深度按英雄分化而非按节律 —— 同为周期的 kyle 7 / 10 章 vs nora 11 / 21 章，同为低血的 sia 11 / 11 vs sally 21 / 21，同为移动的 willow 19 / 19 vs doran 11 / 9，同为连杀的 loka 15 / 8 vs rayne 21 / 19；受击 vera 21 / 19、mu 15 / 21，击杀 bran / oden 四局全满 | ✅ 已裁定（2026-09-14，A）：**节律表不动**，核心技能带「节律调率」`CORE_RHYTHM_TUNE`（kyle / nora 周期 ×0.5 → 1.2s、loka 连杀数 ×0.6 → 3、doran 移动距离 ×0.7、sia 低血阈值 ×1.4 → 0.7），并给事件节律核心加**底拍**（`CORE_BASELINE_INTERVAL` 3.0s 慢周期，vera ×0.7、loka ×0.5）。复审时把 sim 核心改成与真机同口径后暴露冷启动死锁：击杀 / 连杀本命英雄开局零输出、真机 13s 阵亡，底拍即修复。复跑：12 英雄首章全部存活，最弱 kyle / loka 在种子 123 于第 6 章精英台阶阵亡（另一种子 21 / 11 章），其余 ≥ 10 章；64 种子地形聚合下 kyle 失败谷过半（8 束 × 1.2s 仍只有旧弹幕 3/8 密度）→ 核心束数回到 16（21 / 21）；数值 pass（3 种子对照）：loka 底拍 0.5 → 0.4（1.2s）得 21 / 17，mu 狼伤 11 → 14 得 15 / 10；穆第 10 / 15 章精英开场之墙:狼存活 / 狼数 / 风筝 / 站桩逃血线 / 围数 / 精英加权 / 狼命中回血六根数值杠杆全部无效(CONTEXT 56),只留身份项「狼命中回血」,机制层(章首保留召唤物 / 精英开场延迟)留 TODO |
| R7 | 主动槽经济（§4.3 的 4 / 6） | ✅ 已裁定（2026-09-13，B）：**基础 4、硬顶 6**（`PLAYER_BASE.slots` 4、`SHOP_SLOT_CAP` 6）；天赋「额外武装」「槽位扩展 I」各 +1，「槽位扩展 II」改为**被动槽 +1**（id 不变）；本局广告开槽 `RUN_AD_SLOT_LIMIT` 1 | 3 技能 + 4 法宝 = 7 个施放源，每件看得清；取舍提前到第 2–3 章；共鸣 2 / 4 处成为要凑的目标。金币出口转到强化 / 进化 → 20 章到达态品质上移，Boss 血量曲线 `BOSS_HP_CURVE.base` 2.0 → 4.0 重锚（TTK 首关 ≈18s / 末关 ≈34s） |
| R8 | 「重置分岔」落点 | ✅ 已裁定（2026-09-13）：**升级弹层**的一张卡（权重 1，已选分岔、金币够、本局未用过时进候选），价走商店表 `resetBranchCost`；**保底**：分岔选定后最迟第 `RESET_GUARANTEE_ROUNDS`（3）轮升级必出现一次 | 商店工具钮行 4 钮已满，加钮要动几何；分岔本就在升级层做，重置放同一层更顺；保底消掉"等不到"的挫败 |
| R11 | 召唤物是否跨章保留 | ✅ 已裁定（2026-09-15，A）：`nextChapter` 不再清空 `minions`，召唤物跟主人回场心（`MINION_CARRY_SPREAD` 80 内散布），剩余存活照常倒数、上限仍 `LIMITS.minions` 24；`startRun` 仍清空。B「精英章开场延迟 3s」不采用（磨平全员的台阶感只为救一个流派） | 召唤流的"资产感"：军队是上一章攒下来的，越打越满；正好补穆在精英章开场那 10s 的空窗。sim 本来就不清召唤物，复审数据不变，真机只会更好 |
| R10 | 技能与法宝在界面上是否同列 | ✅ 已裁定（2026-09-15，用户「法宝和技能应该分俩个列表」→ C）：**HUD 底坞两排**——上排独有技能（≤3，技能排卡框描节律色细边），下排主动法宝（平时 4 / Boss 3，多的收 +N），排间 1px 分隔线，只有一类时单排；**商店**在槽位钮与法宝管理之间加一段只读「独有技能」行（≤3 行、行高 28：名 / 核心·分岔·进阶 / 节律 / 阶数），没有技能或宿主没接时该段不出、几何与之前逐位相同 | 技能不占槽、不能销毁 / 切节律，混在一列里看不出谁是谁；分列后 HUD 一眼能对上「哪招在放」，商店里也能对照阶数选升级 |
| R9 | 第二本命解锁条件 | ✅ 已裁定（2026-09-13）：该英雄任一关 **3 星通关** | 考的是玩得好不好而非玩得久，第 1 关就能拿到，门槛一句话能说清；累计共鸣次数的进度藏在图鉴里不可读 |
| R4 | （补记）通用职业包的替换节奏 | ✅ 已裁定（2026-09-13）：按赛季走，S3 补熔核三人、S4 补亡影三人 | — |

---

## 12. 落地对账（2026-09-13）

| 项 | 状态 | 落点 |
| --- | --- | --- |
| §2 节律表、本命分配、节律等级、参数表、挂机三档 | ✅ | `S/game/data/rhythm.ts`；挂机档位 `battleWorld.updatePlayer` / `balance-sim` 同款 |
| §3 独有技能：三英雄专属表 + 九英雄通用职业包 + 出卡策略 | ✅（技能语义用现有原语近似，见表内 desc） | `S/game/data/heroSkills.ts`；实例化 `equipmentGen.makeSkillEquipment` |
| §3 升级三选一换商品：新技能 / 升阶 / 节律强化 / 分岔成对 / 兜底；免费重随 1 次/章；锁 1 张 | ✅ | `S/levelup/LevelUpModel.ts`、`S/game/data/levelUp.ts` |
| §4.1 主动法宝：14 效果改包装、无修饰器、触发器 = 所挂节律、默认分配 / 切换 / 归一化、共鸣改名 | ✅ | `S/game/data/artifacts.ts`、`equipmentGen.generateEquipment / assignRhythm / normalizeArtifact` |
| §4.2 被动法宝：8 常规 + 2 稀有、全局折入、叠加衰减、被动槽 4 | ✅ | `artifacts.ts`、`Player.passives`、`equipmentEngine.applyModifier` |
| §4.3 槽位（R7） | ✅ 基础 4 / 硬顶 6 / 广告 1 / `slot2` → 被动槽 +1；Boss 曲线 base 4.0 重锚；sim 补强化建模 | `combat.PLAYER_BASE.slots`、`equipmentGen.SHOP_SLOT_CAP`、`shop.RUN_AD_SLOT_LIMIT`、`talents.slotBonusFor / passiveSlotBonusFor`、`Player.passiveSlotBonus`、`enemies.BOSS_HP_CURVE`、`scripts/balance-sim.ts` |
| §5 共鸣表 1（法宝 × 节律）：14 条变形补丁全部接入引擎 | ✅ | `ARTIFACT_DEFS[*].morph` → `statsOf` 乘区 + 施放护盾 / 尸体落点 / 连杀加发 / 反打朝向 |
| §5 共鸣表 2（被动 × 技能） | ✅ 每技能 `resonancePassive` + `resonanceMorph`；拿到那枚被动即改名并叠补丁 | `equipmentGen.skillResonant`、`equipmentEngine.morphOf` |
| §5 套装退役 → 共鸣数 | ✅ `ctx.setBonus` = `resonanceBonusState`（共鸣 2 / 4 处 → 原 bonus3 / bonus6，表 `RESONANCE_TIERS`）；`SET_BONUSES` 数值不变 | `sets.ts`、`battleWorld` ctx、`balance-sim` 同口径 |
| §5 共鸣发现横幅 + 时停 + 图鉴 | ✅ 首次达成 → 横幅 2s + 战斗停 0.4s + `save.collection.resonances` | `battleWorld.detectResonance`、`DISCOVERY` 表、HUD 复用 Boss 横幅节点 |
| §6 首章法宝三选一（免费、≥1 共鸣、不可锁） | ✅ | `LevelUpModel.openFirstPick`，宿主 `enterBattleRun` 弹出 |
| §6 商店：法宝货位前两格主动、第三格恒被动（R1）、点行切节律、被动进被动槽、头部改共鸣 / 节律 / 被动 | ✅ | `S/shop/ShopModel.ts`（几何未动：切节律复用整行点选热区） |
| R3 分岔预告 | ✅ `LevelUpModel.branchTease()` 拼进 readoutText 末尾 | `heroSkills.BRANCH_TEASE_LEVEL`、`LV_TEXT.teaseBefore / teaseDue` |
| §3 核心技能节律调率 + 底拍（R6） | ✅ `HeroSkillDef.rhythmTune`、`skillTriggerParams`、`skillTriggers`（首条本命 + 底拍 `pulse`）；世界层第二本命换节律同走 `skillTriggers`；sim 核心改 `makeSkillEquipment(coreSkillOf)` 同口径；Boss 曲线 base 3.5 重锚 | `heroSkills.CORE_RHYTHM_TUNE / CORE_BASELINE_INTERVAL`、`equipmentGen.skillTriggers`、`battleWorld.startRun`、`scripts/balance-sim.ts`、`enemies.BOSS_HP_CURVE` |
| R11 章首保留召唤物 | ✅ `battleWorld.nextChapter` 去掉 `minions.length = 0`，加回场心散布 | `S/game/systems/battleWorld.ts`（`MINION_CARRY_SPREAD`） |
| R10 两列表 | ✅ `hud.castDockLayout`（技能排 + 法宝排，各自卡宽 / +N）、`HudView.dockCells / rebuildCards` 重排 + 分隔线 + 技能排细边（`hud.colors.skillEdge`）；`shopLayoutPure(opts.skillCount)` 在槽位钮后插 4 档技能段（0 时四档全 0）；`ShopModel.skills() / content().skills / skillHeader`、`ShopView` 3 行只读槽；`GameShell` ShopWorld 接 `skills` | `S/game/ui/hud.ts`、`S/battle/HudView.ts`、`S/game/ui/shop.ts`、`S/shop/ShopModel.ts`、`S/shop/ShopView.ts` |
| §5.1 赛季共鸣（R5） | ✅ 表 + 判定 + 引擎 / 世界 / 商店 / 弹层 / HUD 全链路接 `seasonId`；`Equipment.variant` 入档随收藏走 | `artifacts.SEASON_RESONANCES / SEASON_ARTIFACTS / echoMorph`、`equipmentGen.equipmentResonance / rollSeasonVariant / defaultRhythmOf`、`equipmentEngine.morphOf(ctx.seasonId)`、`battleWorld.detectResonance` 角标 |
| R2 融合入口移主菜单 + 商店被动管理 | ✅ 主菜单入口带 7 枚（`MENU_LAYOUT_DEFAULTS.origin.entryCount` = 7，等宽取偶 64）；`GameShell.openFusion` 守卫「收藏 < 2 件」轻提示；`LevelUpModel.openPassives()` 形态 `passives`：每页 3 枚、重随钮 = 翻页、锁定钮 = 关闭、选它 = 销毁回收 | `S/menu/MenuContentModel.ts`、`S/game/ui/menuLayout.ts`、`S/levelup/LevelUpModel.ts`、`S/shop/ShopModel.ts`（工具钮 `passive`） |
| §6 「重置分岔」 | ✅ 落点改为升级弹层的一张卡（R8）；每局 1 次，价 `resetBranchCost(章)`；撤技能 + 收节律 + 法宝重挂 | `LevelUpModel`（kind `reset`）、`Player.resetBranch`、`battleWorld.resetBranch` |
| §7 数值初值 | ✅ 全部入表 | 各表见上 |
| B2 等级收益 +8 生命 | ✅ | `battleWorld.killEnemy` 按级数调 `levelUpGrowth` |
| 战斗指纹 / Boss TTK 锚 / 平衡 sim | 🔁 重标（P6）：sim 补技能自动选卡、被动购买、广告槽、A4 金币口径；Boss 血量曲线按新 DPS 锚重取 | `scripts/balance-sim.ts`、`tests/battle-fingerprint.test.ts`、`tests/boss.test.ts` |
| HUD 显示技能 + 法宝（含共鸣改名） | ✅ | `HudView` 读 `player.castList` + `equipmentDisplayName(eq, passives)` |
| S2 跨局第二本命 | ✅ 任一关 3 星通关解锁（R9）→ 英雄页第 4 行「本命节律」点行在本命与两条分岔节律间轮转，确定出战落盘；开局核心技能与挂机档跟着所选节律 | `save.heroRhythmUnlock / heroRhythmChoice`、`HeroSelectModel`、`battleWorld.startRun` |
| S2 D3 道具并入被动池 | ✅ 8 枚遗物类被动（命运骰 / 裂核 / 沙漏 / 透镜 / 稳定器 / 磁轭 / 护心镜 / 假命），常规池修饰器 : 遗物 = 2 : 1；沙漏 / 透镜 / 稳定器走引擎，其余挂世界层结算位 | `artifacts.ts` 的 `RELIC_DEFS / RELIC_VALUES`、`battleWorld.hurtPlayer / contactMult / updateGems / damageEnemy` |
| S2 再补 3 英雄专属表 | ✅ 极北（希雅）/ 冰川（诺拉）/ 白啸（洛卡）各 4 技能；其余 6 英雄仍走通用职业包 | `heroSkills.ts`（`BESPOKE_HEROES`） |
| 英雄页四行 | ✅ 改为核心 / 分岔 / 进阶 / 本命节律 | `heroes.heroSkillLines` |
