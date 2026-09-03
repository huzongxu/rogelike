/**
 * 主菜单布局规范表 —— 单一事实源(DESIGN-VALUES-SPEC 条款 1/3/4)。
 *
 * 分层:
 *  - `origin`:决定各区块**位置/尺寸**的锚点数(唯一可被拖动修改的一层);
 *  - `deco`:区块内部的装饰偏移(贴图上内缩、字号基线、图标间距等)。
 * 派生几何(行高/列表分布/九宫格角深)一律由 `src/ui/menuLayout.ts` 从本表算出,
 * 禁止在 draw 与 hit-test 两处各自重推 —— 这是本项目布局的硬约束。
 *
 * 热调:`public/config/balance.json` 的 `menuLayout` 段可按同名字段覆盖(refresh 即生效);
 * 微信小游戏端无外置配置,自动使用本表默认值(条款 4)。
 *
 * 术语:**设计 px** = 560 宽设计空间内的像素(竖屏翻版 v2,宽恒 560,高 996→1246 伸展)。
 */

/** 可热调字段的取值域:超出即视为非法 → 回退默认(不做钳制,避免"改错数还生效") */
export interface MenuLayoutOrigin {
  /** 含义:全界面统一边距(行/入口/标题栏左右内缩)。单位:设计 px。依据:UI 设计规范 v1。出处:src/ui/theme.ts ui.pad */
  pad: number;
  /** 含义:场外入口钮(扭蛋/天赋/…)高度。单位:设计 px。依据:触控最小高 44 的压缩档(图标+两字)。出处:UI-DESIGN v1 */
  entryH: number;
  /** 含义:入口行顶缘 Y。单位:设计 px(自上)。依据:紧贴标题横幅底缘不重叠。出处:主页截图对标 */
  entryY: number;
  /** 含义:武器套组卡高度。单位:设计 px。依据:底板 menu_set_plate 含上下凸饰,46 以下两行文字必压凸饰。出处:图4 反馈 */
  setH: number;
  /** 含义:套组说明板高度。单位:设计 px。依据:底板 menu_note_plate 源图 45 行带,两行文字净空。出处:图5 反馈 */
  setDescH: number;
  /** 含义:说明板与套组卡的竖向间隙(套组底缘 = 屏高 − 说明板高 − 套组高 − 本值)。单位:设计 px。依据:贴底通铺仅留一丝缝。出处:主页截图对标 */
  setGapY: number;
  /** 含义:分区标题条就绪时高度(未就绪归零退回纯文字标签)。单位:设计 px。依据:整图 512×73 等比可辨的最小高度。出处:主界面翻新批次 */
  sectionH: number;
  /** 含义:分区标题条源图宽。单位:源图 px。依据:menu_section_strip 实际尺寸。出处:assets 清单 */
  sectionSrcW: number;
  /** 含义:分区标题条源图高。单位:源图 px。依据:同上,宽高比决定绘制宽。出处:assets 清单 */
  sectionSrcH: number;
  /** 含义:有标题条时"主线关卡"标题带顶缘 Y。单位:设计 px。依据:入口行下方首块。出处:竖屏翻版 v2 */
  stageHdrY: number;
  /** 含义:无标题条时列表顶缘 Y。单位:设计 px。依据:文字标签基线让位。出处:竖屏翻版 v2 */
  listYNoSection: number;
  /** 含义:标题条底缘到列表顶缘的呼吸缝。单位:设计 px。依据:与行距下界一致。出处:主菜单重设计 */
  hdrBand: number;
  /** 含义:套组标题带相对套组卡顶缘的上抬量(带高 = sectionH)。单位:设计 px。依据:标题条不压卡。出处:主界面翻新批次 */
  setHdrGap: number;
  /** 含义:无限关钮底缘到套组标题带顶缘的间隙基值(有标题条时 = 本值 + sectionH + endlessGap2)。单位:设计 px。出处:主菜单重设计 */
  endlessGapSet: number;
  /** 含义:有标题条时标题带自身占位(与 setHdrGap 同量,但两处原式分别写死 → 保持独立可调)。单位:设计 px。出处:主菜单重设计 */
  endlessGapSet2: number;
  /** 含义:无标题条时无限关钮与套组区的间隙。单位:设计 px。依据:纯文字标签只需文字间距。出处:竖屏翻版 v2 */
  endlessGapFlat: number;
  /** 含义:无限关主按钮宽。单位:设计 px。依据:主按钮通栏半宽手感。出处:UI-DESIGN v1 */
  endlessW: number;
  /** 含义:无限关主按钮高。单位:设计 px。依据:主按钮标准高 44 的放大档。出处:UI-DESIGN v1 */
  endlessH: number;
  /** 含义:列表可用底界相对无限关钮顶缘的上提量(spreadRows 下界 = 钮顶 − 本值)。单位:设计 px。依据:末行不贴钮。出处:主菜单重设计 */
  endlessListGap: number;
  /** 含义:关卡行最小行高(spreadRows 下界)。单位:设计 px。依据:两行文字 + 42 徽章的最小可容。出处:theme.spreadRows */
  rowMinH: number;
  /** 含义:关卡行最大行高(spreadRows 上界)。单位:设计 px。依据:再高则列表稀疏失焦。出处:主菜单重设计 */
  rowMaxH: number;
  /** 含义:关卡行最大行距(spreadRows 富余上限,超出落列表尾留白)。单位:设计 px。依据:小列表拉全屏大缝凌乱。出处:theme.spreadRows 注释 */
  rowMaxGap: number;
  /** 含义:幻影榜筹码右锚宽度(x = 屏宽 − 本值,w = 本值 − pad)。单位:设计 px。依据:热区宽于可见筹码(大触控目标)。出处:条目 39 */
  phantomAnchor: number;
  /** 含义:幻影榜筹码顶缘 Y。单位:设计 px。依据:与货币行同基线。出处:主页截图对标 */
  phantomY: number;
  /** 含义:幻影榜筹码高。单位:设计 px。依据:横幅内次要行。出处:主页截图对标 */
  phantomH: number;
  /** 含义:入口钮横向间距。单位:设计 px。依据:同套组卡间距。出处:竖屏翻版 v2 */
  entryGap: number;
  /** 含义:入口钮个数(entryW = (屏宽 − 2pad − entryGap×(本值−1)) / 本值)。单位:个。依据:扭蛋/天赋/通行证/委托/每日/升级。出处:装备系统重构 */
  entryCount: number;
  /** 含义:套组卡横向间距。单位:设计 px。依据:与入口行同节奏。出处:需求优化 v2 */
  setGap: number;
  /** 含义:行底板九宫格角深系数(nineMargin 短边占比)。单位:0-1。依据:贴图集通用值。出处:assets.drawNineUniform */
  rowPlateF: number;
  /** 含义:套组卡装饰带高 = setH ×(本值/ setBandDen)。单位:源图行。依据:menu_set_plate 上下各 20 行贴边窄带(边缘扫描)。出处:薄边带模型 */
  setBandNum: number;
  /** 含义:套组卡源图总高(带厚换算分母)。单位:源图 px。依据:menu_set_plate 384×124。出处:薄边带模型 */
  setBandDen: number;
  /** 含义:说明板装饰带高 = setDescH ×(本值 / noteBandDen)。单位:源图行。依据:menu_note_plate 上下各 8/45 行。出处:薄边带模型 */
  noteBandNum: number;
  /** 含义:说明板源图总高。单位:源图 px。依据:menu_note_plate 源图高 45。出处:薄边带模型 */
  noteBandDen: number;
  /** 含义:英雄展示带自 setY 向上生长的高度(上界见 heroClearance)。单位:设计 px。依据:立绘 96 + 上下呼吸缝。出处:英雄系统 M4 */
  heroRise: number;
  /** 含义:展示带顶缘与无限关钮底缘的最小间隙(带高上界 = gapAboveSet − 本值)。单位:设计 px。依据:带再高必压主按钮。出处:英雄系统 M4 */
  heroClearance: number;
  /** 含义:「更换英雄」按钮宽。单位:设计 px。依据:四字 + 内距的最小可读档。出处:英雄系统 M4 */
  heroBtnW: number;
  /** 含义:「更换英雄」按钮高(带内垂直居中)。单位:设计 px。依据:与入口行同档的压缩触控高。出处:英雄系统 M4 */
  heroBtnH: number;
}

/** 装饰内缩/基线偏移表(绘制层专用;几何仍由 menuLayoutPure 一次算出) */
export interface MenuLayoutDeco {
  /** 含义:标题横幅左右外扩(横幅比内容区宽出一段以避开圆角端饰)。单位:设计 px。出处:主页截图对标 */
  banInset: number;
  /** 含义:标题横幅顶缘 Y。单位:设计 px。出处:主页截图对标 */
  banY: number;
  /** 含义:标题横幅高。单位:设计 px。依据:两行右对齐文字 + 纹章 26。出处:主界面翻新批次 */
  banH: number;
  /** 含义:纹章相对横幅左缘 x 偏移。单位:设计 px。出处:主界面翻新批次 */
  crestOffX: number;
  /** 含义:纹章相对横幅顶缘 y 偏移。单位:设计 px。出处:主界面翻新批次 */
  crestOffY: number;
  /** 含义:纹章宽。单位:设计 px。出处:crest_echo 绘制档 */
  crestW: number;
  /** 含义:纹章高。单位:设计 px。出处:crest_echo 绘制档 */
  crestH: number;
  /** 含义:标题文字基线 x(相对 pad)。单位:设计 px。依据:纹章右缘后再留隙。出处:主界面翻新批次 */
  titleOffX: number;
  /** 含义:标题文字基线 y(相对横幅顶)。单位:设计 px。出处:主界面翻新批次 */
  titleOffY: number;
  /** 含义:赛季行右缘内缩(相对屏宽 − pad)。单位:设计 px。出处:主界面翻新批次 */
  seasonInset: number;
  /** 含义:赛季行基线 y(相对横幅顶)。单位:设计 px。出处:主界面翻新批次 */
  seasonOffY: number;
  /** 含义:体力/钻石行基线 y(相对横幅顶)。单位:设计 px。出处:主界面翻新批次 */
  row2OffY: number;
  /** 含义:钻石图标相对数值左缘再左移量。单位:设计 px。出处:主界面翻新批次 */
  gemOffX: number;
  /** 含义:钻石图标相对基线上抬量。单位:设计 px。出处:主界面翻新批次 */
  gemOffY: number;
  /** 含义:钻石图标宽。单位:设计 px。出处:badge_gem_purple 绘制档 */
  gemW: number;
  /** 含义:钻石图标高。单位:设计 px。出处:badge_gem_purple 绘制档 */
  gemH: number;
  /** 含义:体力文字与钻石块的间隙。单位:设计 px。出处:主界面翻新批次 */
  energyGap: number;
  /** 含义:货币底板顶缘 Y。单位:设计 px。依据:紧贴横幅底缘。出处:主页截图对标 */
  stripY: number;
  /** 含义:货币底板高。单位:设计 px。依据:筹码 22 + 上下各 2。出处:主页截图对标 */
  stripH: number;
  /** 含义:筹码高(底板内垂直居中)。单位:设计 px。出处:筹码贴边修复 */
  chipH: number;
  /** 含义:第一筹码内容左缘(相对 pad)。单位:设计 px。依据:底板角深内缩后再留缓冲。出处:筹码贴边修复 */
  chipX1: number;
  /** 含义:第二筹码内容左缘(相对 pad)。单位:设计 px。出处:筹码贴边修复 */
  chipX2: number;
  /** 含义:第三筹码内容左缘(相对 pad)。单位:设计 px。出处:筹码贴边修复 */
  chipX3: number;
  /** 含义:筹码图标绘制宽(参与筹码最小宽估算)。单位:设计 px。出处:筹码贴边修复 */
  chipIconW: number;
  /** 含义:筹码图标与数值间隙。单位:设计 px。出处:筹码贴边修复 */
  chipIconGap: number;
  /** 含义:筹码角深探针的额外宽(取 nineMargin 时用)。单位:设计 px。出处:筹码贴边修复 */
  chipProbePad: number;
  /** 含义:筹码底板左移量(内容左缘 → 底板左缘)。单位:设计 px。出处:筹码贴边修复 */
  chipSlide: number;
  /** 含义:筹码内文字左侧内缩。单位:设计 px。出处:筹码贴边修复 */
  chipInnerGap: number;
  /** 含义:筹码数值右侧留尾。单位:设计 px。出处:筹码贴边修复 */
  chipTailPad: number;
  /** 含义:幻影筹码角深探针宽。单位:设计 px。出处:筹码贴边修复 */
  phChipProbeW: number;
  /** 含义:幻影筹码角深外缓冲。单位:设计 px。出处:筹码贴边修复 */
  phChipPadAdd: number;
  /** 含义:幻影筹码左右内缩下界。单位:设计 px。出处:筹码贴边修复 */
  phChipPadMin: number;
  /** 含义:幻影筹码右缘相对屏宽 − pad 的间隙(与入口行右侧留空同源)。单位:设计 px。出处:图2 反馈 */
  phRightGap: number;
  /** 含义:关卡行首行基线相对行中心的下移量(cy − 本值)。单位:设计 px。出处:行内两行居中 */
  rowC1Off: number;
  /** 含义:关卡行两行基线间距。单位:设计 px。依据:fs.section 行高节奏。出处:行内两行居中 */
  rowC2Gap: number;
  /** 含义:关卡行文字列起点(相对行左缘 + 角深)。单位:设计 px。依据:避开 42 徽章区。出处:行底板内缩 */
  rowTxOff: number;
  /** 含义:关卡行右列再内缩(避开行底板右侧凸饰)。单位:设计 px。出处:图3 反馈 */
  rowRightInset: number;
  /** 含义:有补星钮时右列额外避让(= 补星钮宽 + 间隙)。单位:设计 px。出处:§4.4 */
  rowMakeupReserve: number;
  /** 含义:补星钮宽。单位:设计 px。出处:§4.4 */
  makeupW: number;
  /** 含义:补星钮高。单位:设计 px。出处:§4.4 */
  makeupH: number;
  /** 含义:补星钮距行底板右缘内缩的附加量。单位:设计 px。出处:§4.4 */
  makeupRightGap: number;
  /** 含义:头像徽章圆心 x(相对行左缘 + 角深)。单位:设计 px。出处:行底板内缩 */
  badgeOffX: number;
  /** 含义:头像徽章绘制尺寸。单位:设计 px。出处:品质框图集 */
  badgeSize: number;
  /** 含义:缺图回退代码圆半径。单位:设计 px。出处:行底板内缩 */
  badgeR: number;
  /** 含义:缺图回退圆描边宽。单位:设计 px。出处:行底板内缩 */
  badgeStroke: number;
  /** 含义:回退圆内关卡号基线下移。单位:设计 px。出处:行底板内缩 */
  badgeTextOffY: number;
  /** 含义:通关勾相对关卡名右缘间隙。单位:设计 px。出处:行内两行居中 */
  checkOffX: number;
  /** 含义:通关勾相对基线上抬。单位:设计 px。出处:行内两行居中 */
  checkOffY: number;
  /** 含义:通关勾绘制尺寸。单位:设计 px。出处:mark_check_green 绘制档 */
  checkSize: number;
  /** 含义:通关勾占位宽(= checkSize + 间隙)。单位:设计 px。出处:行内两行居中 */
  checkAdvance: number;
  /** 含义:星形贴图尺寸。单位:设计 px。出处:icon_star_gold 绘制档 */
  starSize: number;
  /** 含义:星形横向间距。单位:设计 px。出处:星数绘制 */
  starGap: number;
  /** 含义:星数与关卡名间隙(同 checkOffX 语义,原式分别写死)。单位:设计 px。出处:星数绘制 */
  starOffX: number;
  /** 含义:星形相对首行基线上抬补偿。单位:设计 px。出处:星数绘制 */
  starLift: number;
  /** 含义:关卡描述裁切余量(可用宽 = 右列 − 文字列 − 本值)。单位:设计 px。出处:行内两行居中 */
  descClipPad: number;
  /** 含义:红点半径(委托/每日完成提示)。单位:设计 px。出处:委托红点 */
  dotR: number;
  /** 含义:红点圆心距宿主钮右缘内缩。单位:设计 px。出处:委托红点 */
  dotInsetX: number;
  /** 含义:红点圆心距宿主钮顶缘下移。单位:设计 px。出处:委托红点 */
  dotInsetY: number;
  /** 含义:分区标题文字裁切余量(标题条整图宽 − 本值)。单位:设计 px。出处:主界面翻新批次 */
  sectionTextPad: number;
  /** 含义:缺标题条时"主线关卡"文字基线 Y。单位:设计 px。依据:与 stageHdrY 带内基线一致。出处:竖屏翻版 v2 */
  listHintFallbackY: number;
  /** 含义:套组卡图标 x 偏移(相对卡左缘)。单位:设计 px。出处:图4 反馈 */
  setIconOffX: number;
  /** 含义:套组卡图标半高偏移(圆心对齐行中)。单位:设计 px。出处:图4 反馈 */
  setIconOffY: number;
  /** 含义:套组卡图标宽。单位:设计 px。出处:icon_set_* 绘制档 */
  setIconW: number;
  /** 含义:套组卡图标高。单位:设计 px。出处:icon_set_* 绘制档 */
  setIconH: number;
  /** 含义:选中态高亮框外扩。单位:设计 px。出处:套组卡底板 */
  setFramePad: number;
  /** 含义:选中态金星标 x 内缩(相对卡右缘)。单位:设计 px。出处:套组卡底板 */
  setBadgeInsetX: number;
  /** 含义:选中态金星标 y 上抬(相对卡顶缘,负向)。单位:设计 px。出处:套组卡底板 */
  setBadgeOffY: number;
  /** 含义:金星标尺寸。单位:设计 px。出处:badge_star_gold 绘制档 */
  setBadgeSize: number;
  /** 含义:套组卡内容列左偏移(图标右缘)。单位:设计 px。出处:图4 反馈 */
  setColPadL: number;
  /** 含义:套组卡内容列右内缩。单位:设计 px。出处:图4 反馈 */
  setColPadR: number;
  /** 含义:套组卡首行基线相对净空带顶。单位:设计 px。出处:薄边带模型 */
  setRow1Off: number;
  /** 含义:套组卡两行基线间距。单位:设计 px。出处:薄边带模型 */
  setRow2Gap: number;
  /** 含义:赛季标记与名称的间隙补偿(测量加宽)。单位:设计 px。出处:本赛季标记 */
  tagPad: number;
  /** 含义:说明板装饰带下限(带厚换算取大)。分子:menu_note_plate 端饰行高。单位:源图行。出处:薄边带模型 */
  noteCapNum: number;
  /** 含义:说明板装饰带换算分母。单位:源图 px(同 noteBandDen)。出处:薄边带模型 */
  noteCapDen: number;
  /** 含义:说明板顶缘相对套组卡底缘间隙(同 setGapY 语义,原式写死 −1)。单位:设计 px。出处:图5 反馈 */
  noteTopOff: number;
  /** 含义:说明板左右外扩总量(贴屏底通铺)。单位:设计 px。出处:图5 反馈 */
  noteInsetX: number;
  /** 含义:说明板左缘外扩(相对 pad)。单位:设计 px。出处:图5 反馈 */
  noteSlide: number;
  /** 含义:说明板首行基线相对带顶。单位:设计 px。出处:薄边带模型 */
  noteRow1Off: number;
  /** 含义:说明板两行基线间距。单位:设计 px。出处:薄边带模型 */
  noteRow2Gap: number;
  /** 含义:英雄展示带内缩(立绘左缘 / 按钮右缘 / 图文列间距共用同一节奏)。单位:设计 px。出处:英雄系统 M4 */
  heroPadX: number;
  /** 含义:英雄立绘盒宽(实图按 contain-fit 装入,永不裁切)。单位:设计 px。出处:英雄系统 M4 */
  heroPortW: number;
  /** 含义:英雄立绘盒高(带高不足时按带高收缩)。单位:设计 px。出处:英雄系统 M4 */
  heroPortH: number;
  /** 含义:立绘盒水平偏移(相对带左缘 + heroPadX)。单位:设计 px。出处:英雄系统 M4 */
  heroPortOffX: number;
  /** 含义:立绘盒竖直偏移(相对带内垂直居中;默认 0 = 居中,贴顶/贴底靠本值微调)。单位:设计 px。出处:英雄系统 M4 */
  heroPortOffY: number;
  /** 含义:英雄名基线相对带顶缘。单位:设计 px。出处:英雄系统 M4 */
  heroNameOffY: number;
  /** 含义:英雄名 → 称号·套组行基线间距。单位:设计 px。出处:英雄系统 M4 */
  heroRow2Gap: number;
  /** 含义:称号行 → 赛季说明行基线间距。单位:设计 px。出处:英雄系统 M4 */
  heroRow3Gap: number;
}

export interface MenuLayoutTable {
  origin: MenuLayoutOrigin;
  deco: MenuLayoutDeco;
}

export const MENU_LAYOUT_DEFAULTS: MenuLayoutTable = {
  origin: {
    pad: 14,
    entryH: 36,
    entryY: 100,
    setH: 50,
    setDescH: 46,
    setGapY: 1,
    sectionH: 32,
    sectionSrcW: 512,
    sectionSrcH: 73,
    stageHdrY: 140,
    listYNoSection: 152,
    hdrBand: 4,
    setHdrGap: 13,
    endlessGapSet: 29,
    endlessGapSet2: 13,
    endlessGapFlat: 34,
    endlessW: 260,
    endlessH: 48,
    endlessListGap: 12,
    rowMinH: 72,
    rowMaxH: 84,
    rowMaxGap: 30,
    phantomAnchor: 180,
    phantomY: 64,
    phantomH: 24,
    entryGap: 8,
    entryCount: 6,
    setGap: 8,
    rowPlateF: 0.35,
    setBandNum: 20,
    setBandDen: 124,
    noteBandNum: 8,
    noteBandDen: 45,
    heroRise: 60,
    heroClearance: 8,
    heroBtnW: 88,
    heroBtnH: 36,
  },
  deco: {
    banInset: 6,
    banY: 6,
    banH: 58,
    crestOffX: 2,
    crestOffY: 16,
    crestW: 26,
    crestH: 26,
    titleOffX: 34,
    titleOffY: 36,
    seasonInset: 6,
    seasonOffY: 24,
    row2OffY: 47,
    gemOffX: 18,
    gemOffY: 13,
    gemW: 14,
    gemH: 16,
    energyGap: 12,
    stripY: 66,
    stripH: 26,
    chipH: 22,
    chipX1: 6,
    chipX2: 90,
    chipX3: 188,
    chipIconW: 15,
    chipIconGap: 4,
    chipProbePad: 20,
    chipSlide: 5,
    chipInnerGap: 4,
    chipTailPad: 11,
    phChipProbeW: 40,
    phChipPadAdd: 8,
    phChipPadMin: 14,
    phRightGap: 8,
    rowC1Off: 3,
    rowC2Gap: 19,
    rowTxOff: 54,
    rowRightInset: 26,
    rowMakeupReserve: 66,
    makeupW: 56,
    makeupH: 26,
    makeupRightGap: 2,
    badgeOffX: 26,
    badgeSize: 42,
    badgeR: 18,
    badgeStroke: 2,
    badgeTextOffY: 6,
    checkOffX: 4,
    checkOffY: 11,
    checkSize: 13,
    checkAdvance: 16,
    starSize: 13,
    starGap: 2,
    starOffX: 4,
    starLift: 2,
    descClipPad: 10,
    dotR: 5,
    dotInsetX: 8,
    dotInsetY: 7,
    sectionTextPad: 30,
    listHintFallbackY: 144,
    setIconOffX: 6,
    setIconOffY: 9,
    setIconW: 18,
    setIconH: 18,
    setFramePad: 2,
    setBadgeInsetX: 16,
    setBadgeOffY: 6,
    setBadgeSize: 18,
    setColPadL: 28,
    setColPadR: 34,
    setRow1Off: 12,
    setRow2Gap: 15,
    tagPad: 4,
    noteCapNum: 20,
    noteCapDen: 45,
    noteTopOff: 1,
    noteInsetX: 12,
    noteSlide: 6,
    noteRow1Off: 12,
    noteRow2Gap: 14,
    heroPadX: 10,
    heroPortW: 96,
    heroPortH: 96,
    heroPortOffX: 0,
    heroPortOffY: 0,
    heroNameOffY: 34,
    heroRow2Gap: 18,
    heroRow3Gap: 16,
  },
};

/** 字段取值域(非法/越界 → 回退默认;见各字段备注)。布局台共用同一常量,保证"所见即所存" */
export const MENU_LAYOUT_RANGE: Record<keyof MenuLayoutOrigin, [number, number]> = {
  pad: [0, 40],
  entryH: [20, 60],
  entryY: [40, 160],
  setH: [34, 90],
  setDescH: [30, 90],
  setGapY: [0, 20],
  sectionH: [0, 60],
  sectionSrcW: [1, 2048],
  sectionSrcH: [1, 2048],
  stageHdrY: [100, 300],
  listYNoSection: [100, 300],
  hdrBand: [0, 20],
  setHdrGap: [0, 40],
  endlessGapSet: [0, 80],
  endlessGapSet2: [0, 80],
  endlessGapFlat: [0, 80],
  endlessW: [120, 560],
  endlessH: [30, 80],
  endlessListGap: [0, 40],
  rowMinH: [40, 120],
  rowMaxH: [40, 160],
  rowMaxGap: [0, 60],
  phantomAnchor: [60, 560],
  phantomY: [20, 160],
  phantomH: [14, 60],
  entryGap: [0, 20],
  entryCount: [1, 12],
  setGap: [0, 20],
  rowPlateF: [0.05, 0.5],
  setBandNum: [0, 200],
  setBandDen: [1, 512],
  noteBandNum: [0, 200],
  noteBandDen: [1, 512],
  heroRise: [8, 160],
  heroClearance: [0, 40],
  heroBtnW: [40, 200],
  heroBtnH: [20, 60],
};

const DECOS = Object.keys(MENU_LAYOUT_DEFAULTS.deco) as (keyof MenuLayoutDeco)[];

/** deco 统一取值域(布局台输入校验与本文件回退判定共用) */
export const MENU_LAYOUT_DECO_RANGE: [number, number] = [-200, 200];

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** 当前生效表(规范表默认 + balance.json 覆盖);消费方经 snapshotMenuLayout() 取快照 */
export let menuLayoutTable: MenuLayoutTable = {
  origin: { ...MENU_LAYOUT_DEFAULTS.origin },
  deco: { ...MENU_LAYOUT_DEFAULTS.deco },
};

/** 校验告警(由加载器读取后统一打印) */
export const menuLayoutWarnings: string[] = [];

const inRange = (v: unknown, min: number, max: number): boolean => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
};

/** 热重载入口:布局台"导出 JSON → 粘进 balance.json → F5"与生产配置共用同一通道 */
export function applyBalance(cfg?: Record<string, unknown>): void {
  const b = cfg ?? {};
  const originSection = b.origin;
  const decoSection = b.deco;
  const next: MenuLayoutTable = { origin: { ...MENU_LAYOUT_DEFAULTS.origin }, deco: { ...MENU_LAYOUT_DEFAULTS.deco } };
  if (originSection && typeof originSection === "object" && !Array.isArray(originSection)) {
    const o = originSection as Record<string, unknown>;
    for (const key of Object.keys(MENU_LAYOUT_RANGE) as (keyof MenuLayoutOrigin)[]) {
      if (o[key] === undefined) continue;
      const [min, max] = MENU_LAYOUT_RANGE[key];
      if (!inRange(o[key], min, max)) menuLayoutWarnings.push(`menuLayout.origin.${key}=${String(o[key])} 越界[${min},${max}],已回退默认`);
      next.origin[key] = num(o[key], min, max, MENU_LAYOUT_DEFAULTS.origin[key]);
    }
  } else if (originSection !== undefined) {
    menuLayoutWarnings.push("menuLayout.origin 必须是对象,已忽略");
  }
  if (decoSection && typeof decoSection === "object" && !Array.isArray(decoSection)) {
    const d = decoSection as Record<string, unknown>;
    const [dmin, dmax] = MENU_LAYOUT_DECO_RANGE;
    for (const key of DECOS) {
      if (d[key] === undefined) continue;
      if (!inRange(d[key], dmin, dmax)) menuLayoutWarnings.push(`menuLayout.deco.${key}=${String(d[key])} 越界[${dmin},${dmax}],已回退默认`);
      next.deco[key] = num(d[key], dmin, dmax, MENU_LAYOUT_DEFAULTS.deco[key]);
    }
  } else if (decoSection !== undefined) {
    menuLayoutWarnings.push("menuLayout.deco 必须是对象,已忽略");
  }
  // 行高下界不得高于上界(否则 spreadRows 语义反转)
  if (next.origin.rowMinH > next.origin.rowMaxH) {
    menuLayoutWarnings.push(`menuLayout.origin.rowMinH(${next.origin.rowMinH}) > rowMaxH(${next.origin.rowMaxH}),已互换`);
    const min = next.origin.rowMaxH;
    next.origin.rowMaxH = next.origin.rowMinH;
    next.origin.rowMinH = min;
  }
  menuLayoutTable = next;
}

/** 深拷贝快照:布局每帧重算,快照避免绘制过程中被并发改表 */
export function snapshotMenuLayout(): MenuLayoutTable {
  return { origin: { ...menuLayoutTable.origin }, deco: { ...menuLayoutTable.deco } };
}

/** 布局台写回:仅改内存即时生效(不落盘;落盘由导出 JSON 完成) */
export function setMenuLayoutOrigin(patch: Partial<MenuLayoutOrigin>): void {
  menuLayoutTable = { origin: { ...menuLayoutTable.origin, ...patch }, deco: { ...menuLayoutTable.deco } };
}

/**
 * 布局台写回(装饰层)。与 origin 同一口径:只改内存,不做越界校验
 * —— 越界回退是 applyBalance 的职责,布局台自己按 MENU_LAYOUT_RANGE 钳输入。
 */
export function setMenuLayoutDeco(patch: Partial<MenuLayoutDeco>): void {
  menuLayoutTable = { origin: { ...menuLayoutTable.origin }, deco: { ...menuLayoutTable.deco, ...patch } };
}
