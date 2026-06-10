# v3.6 对局页重设计说明

> 设计稿:`.harness/designs/v3-6-mockup.html`(1280×800 自包含 HTML)
> 截图:`.harness/designs/screenshots/v3-6-mockup.png`
> 实施日期:2026-06-07
> 设计参考:商业掼蛋游戏(jj / 欢乐斗地主)的成熟对局页布局
> 适用画布:1280×800 桌面端(本稿不做响应式)

---

## 一、设计意图(每个区域)

### 1. 中段(TableCenter)— 椭圆牌桌 + 装饰 + 出牌区

**现状问题(v3-5)**:
- 椭圆桌面 + 半透明大字"爱掼蛋"水印 + 散落桌面牌 → 中段视觉空、字水印大且低质
- 没有"出牌人 / 牌型 / 轮次"信息,出牌人靠 status-tip 文字飘在 HUD 顶部

**v3.6 改造**:
| 改造点 | 描述 |
|---|---|
| 去掉文字水印 | 改为装饰性几何花纹(SVG 圆环 + 十字 + 4 角点 + 中央 "PVP" 文字,18% 透明度),保留中央聚焦感 |
| 桌面顶光 + 暗角 | 用 `linear-gradient` 模拟光源,`radial-gradient` 加暗角,提升中心聚光 |
| 桌面顶部信息条 | 3 个紧凑 pill(打 X / 第 N 轮 / ×N 倍)浮动在桌面上沿,信息结构化 |
| 桌面中央出牌堆 | 5 张牌扇形展开(±6° 旋转 + 32px 错位),中央级牌"2♠"加金色高亮 + "级" 角标 |
| 桌面底部首家提示 | 圆角胶囊(头像 + 名字 + "出牌中 ▶"),金色描边,跟出牌人联动 |

**目的**:把"椭圆桌面 + 空文字"升级成"竞技感牌桌",每条信息都有视觉锚点。

### 2. 4 玩家座位卡(PlayerSeat)— 3D 卡片 + 身份三色

**现状问题(v3-5)**:
- 深蓝半透明背景 + 圆角色块(♠/♥/♦/♣) + 名字 + 金币 + 等级 → 简陋,卡片薄
- 身份色区分弱(队友=蓝,对手=灰,自己=绿但**绿色框几乎不可见**)

**v3.6 改造**:
| 改造点 | 描述 |
|---|---|
| 卡片化 | 圆角 12px + 渐变背景(`rgba(20,30,70,0.92)` → `rgba(10,18,51,0.96)`) + `backdrop-filter: blur(6px)` + 双层阴影(投影 + 内高光) |
| 身份三色清晰 | 队友=蓝(`#42a5f5` 边框 + 蓝色光晕) / 对手=红(`#ef5350` 边框 + 红色光晕) / 自己=绿+金(`#66bb6a` 边框 + 金色光晕) |
| 头像精致化 | 56×56 圆形 + 角色色双层描边 + 头像 emoji(🤖/🀄),`box-shadow` 模拟发光 |
| 角色角标 + emoji | 队友=🤝 队友 / 对手=⚔ 对手 / 自己=👑 自己(emoji 让身份一眼可读) |
| 思考气泡(队友专用) | 3 颗跳动的小点(蓝底),紧贴头像右上,告诉"他在想" |
| 出牌进度条 | 卡片底部细横条(4px)+ 角色色渐变填充,顶部右侧"剩 N 张"文字(给手牌数辅助信息) |
| 轮到出牌:头像亮环 | `is-turn` 状态头像外加 8px 金色脉冲环动画 |

**目的**:身份色一眼可分辨,卡片有 3D 层次,出牌进度让"剩多少张"可视化。

### 3. 右上角 4 个图标按钮(HudTop)— 2x2 网格 + 信息条

**现状问题(v3-5)**:
- ⚔/🃏/···/⚙ 横排,user 误以为是"计牌器"(v3-5 已删 CardCounter,但**这 4 个图标的视觉风格还是像"高级操作面板"**,user 看到就联想到记牌器)
- 没有 tooltip,没有 active 状态,图标含义不直观

**v3.6 改造**:
| 改造点 | 描述 |
|---|---|
| 图标换更直观 | ⚔ → 🏆(对局)/ 🃏 → 📊(牌型)/ ··· → ⋯(更多)/ ⚙ → ⚙(设置) |
| 布局改 2x2 网格 | 36×36 圆角方形,2 行 2 列,紧凑不占位 |
| hover tooltip | 鼠标悬停显示中文气泡(对局/牌型/更多/设置),淡入 0.15s |
| active 状态 | 点击后蓝色背景 + 描边 + 微缩放 + 蓝色光晕 |
| 角标 | 🏆 右上小红圆"2"角标(对局消息数),v3-3 已有,保留 |
| 对局信息紧凑条 | 2x2 网格下方加一行"打 2 / ×1 / 25s",水平排列,替代 v3-5 删掉的右侧小卡片位置 — **不放记牌器** |

**目的**:消除"右上角是计牌器"的误解,信息密度更高,操作意图清晰。

### 4. 一键理牌 promote(从角落小图标 → 显眼前置)

**现状问题(v3-5)**:
- 一键理牌是 QuickActions 里的 ⚡ 圆形小图标,在右下角,**和"理牌 🃏"图标挤在一起**
- user 没意识到这是个核心功能,以为"只能手动理"

**v3.6 改造**:
| 改造点 | 描述 |
|---|---|
| 提取成显眼前置按钮 | 位置从"右下角圆形小图标" → "操作栏上方"中央,显眼大按钮 |
| 视觉强 | 24px 圆角胶囊(50px 高) + 橙渐变(`#FFB300` → `#FF6D00`) + 白色双层描边 + 橙色光晕 + 金色光晕叠加 |
| 文案 + emoji | "✨ 智能理牌"(不是空图标,告诉用户这个按钮是"智能凑牌"功能) |
| hover 反馈 | scale(1.05) + 强化光晕,告诉用户"可点" |
| 角落小图标保留 | QuickActions 仍保留 🃏/⚡/💬 三个小图标作为辅助入口(不删,只是降级) |

**目的**:让 v3-2 已经实现的"autoPlayGrouped 智能凑牌"功能**视觉上对得起它的复杂度**,user 一眼能找。

### 5. 同 rank 竖叠 promote(列顶 rank 标签 + 渐变分隔)

**现状问题(v3-5)**:
- `groupHandByRank` 已经实现同 rank 竖叠 + 列底 ×N 标签,**功能 100% 工作**
- user 没注意到,是因为"列"的概念不够强,只有底部的橙色 ×N 小气泡

**v3.6 改造**:
| 改造点 | 描述 |
|---|---|
| 列顶 rank 数字标签 | 每列顶部加 22×16 圆角标签(深蓝底 + 金色描边 + 金色文字),大字 rank("7"/"9"/"10"/"K"/"2"/"王") |
| 级牌列特殊 | 2 列(级牌)的 rank 标签用橙色背景(`#FFA000` → `#FF6F00`),文字白色,跟级牌高亮呼应 |
| 王列特殊 | Joker 列 rank 标签用红色背景(`#b71c1c` → `#4a0000`),文字白色 |
| 列间分隔加重 | 从 1px `rgba(255,255,255,0.12)` → 2px 渐变(border-image: 透明 → 18% 白 → 30% 金 → 18% 白 → 透明) |
| 选中态强化 | 已部分实现,可强化:整列金色描边 + 抬升 18px(原 16px)+ 0 0 16px 黄色光晕 + 整列内每张牌也加金色描边 |

**目的**:让"一列一列"概念一眼可读,**不改 groupHandByRank 的实现**,只改 CSS 视觉。

### 6. 整体协调

| 维度 | 现状(v3-5) | v3.6 |
|---|---|---|
| 主色 | 深蓝底 + 黄/橙/金/绿/红/紫 各色卡片混搭,信息色之间没有 hierarchy | 深蓝紫渐变底 + 金色主调(选中/级牌/进度) + 单一强调色(橙 #FF9800) + 身份三色(蓝/红/绿) |
| 字号 | 16/14/12 三档,但层级不清晰 | 16-20(标题:名字/状态) / 12-14(副标题:等级/金币) / 10-12(正文:标签/进度文字) |
| 留白 | 卡片"塞满",无呼吸感 | 卡片 padding 8-12px,圆角 12-14px,卡片间距 16-20px,呼吸舒服 |
| 参考对象 | 偏"工具感" | 参考 jj / 欢乐斗地主的"商业游戏感" |

---

## 二、配色 Token(给 coder 用)

### 背景
```css
--bg-deep:        #0a1233;       /* 屏幕最深底色 */
--bg-mid:         #161d4a;       /* 渐变中间色 */
--bg-table:       #1a2a5e;       /* 牌桌中心色 */
--bg-table-edge:  #2a1a4e;       /* 牌桌边缘色 */
--wood-edge:      #8B5A2B;       /* 椭圆牌桌木边 */
--wood-edge-hi:   #b07a3f;       /* 木边高光 */
```

### 身份三色(对比强、一眼可分辨)
```css
/* 队友(上) */
--color-teammate:    #42a5f5;    /* 主蓝 */
--color-teammate-bg: rgba(33,150,243,0.22);
--color-teammate-glow: rgba(66,165,245,0.55);

/* 对手(左/右) */
--color-opponent:    #ef5350;    /* 主红 */
--color-opponent-bg: rgba(229,57,53,0.18);
--color-opponent-glow: rgba(239,83,80,0.5);

/* 自己(下) */
--color-self:        #66bb6a;    /* 主绿 */
--color-self-bg:     rgba(67,160,71,0.22);
--color-self-glow:   rgba(102,187,106,0.55);
```

### 强调色
```css
--gold:         #FFD700;          /* 金色(选中/级牌/进度条) */
--gold-dark:    #C9A227;
--gold-soft:    rgba(255,215,0,0.2);

--orange:       #FF9800;          /* 单一强调色(主操作) */
--orange-dark:  #EF6C00;          /* 深橙(智能理牌渐变末端) */
--orange-soft:  rgba(255,152,0,0.25);
--orange-warm:  #FFB300;          /* 暖橙(智能理牌渐变顶端) */
--orange-bright:#FF6D00;          /* 亮橙(智能理牌 hover) */
```

### 文字
```css
--text-1: #FFFFFF;                /* 标题/名字 */
--text-2: rgba(255,255,255,0.78); /* 副标题/金币 */
--text-3: rgba(255,255,255,0.5);  /* 辅助文字/进度标签 */
--text-on-card: #1A237E;          /* 卡牌内文字(深蓝) */
```

### 中性色(描边/分割/次要文字)
```css
--border-soft:   rgba(255,255,255,0.18);   /* 卡片描边(浅) */
--border-med:    rgba(255,255,255,0.35);   /* 中等描边 */
--divider:       rgba(255,255,255,0.12);   /* 分割线 */
--card-bg-dark:  rgba(0,0,0,0.55);         /* 卡片背景(深色半透明) */
--card-bg-light: rgba(0,0,0,0.35);         /* 浅色半透明 */
```

### 牌面
```css
--red-card:   #E74C3C;             /* 红桃/方块 */
--black-card: #2C3E50;             /* 梅花/黑桃 */
--card-bg:    #FFFFFF;             /* 牌白底 */
--card-level-bg: linear-gradient(180deg, #fff9c4, #ffe082);  /* 级牌底 */
--card-level-border: #FFA000;      /* 级牌边 */
```

### 圆角 / 间距 / 字号
```css
--r-sm: 6px;  --r-md: 10px;  --r-lg: 14px;  --r-pill: 999px;
--space-xs: 4px;  --space-sm: 8px;  --space-md: 12px;  --space-lg: 16px;  --space-xl: 24px;
--fs-1: 18px; --fs-2: 15px;  --fs-3: 12px;  --fs-4: 10px;  --fs-5: 9px;
```

### 阴影
```css
--shadow-card-3d:
  0 4px 12px rgba(0,0,0,0.5),       /* 外投影 */
  inset 0 1px 0 rgba(255,255,255,0.1); /* 内高光 */

--shadow-glow-gold:    0 0 14px rgba(255,215,0,0.7);
--shadow-glow-teammate:0 0 12px rgba(66,165,245,0.5);
--shadow-glow-opponent:0 0 10px rgba(239,83,80,0.4);
--shadow-glow-self:    0 0 16px rgba(102,187,106,0.55);
--shadow-glow-orange:  0 4px 12px rgba(255,109,0,0.5), 0 0 16px rgba(255,179,0,0.4);
```

### 动效曲线(已用,保持)
```css
--ease-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--t-fast: 120ms;  --t-med: 240ms;  --t-slow: 400ms;
```

---

## 三、改动清单(具体到文件 + 改什么)

### 1. `src/styles/tokens.css`
- **加**:身份三色 token(`--color-teammate/--color-opponent/--color-self` + 各自的 bg/glow)
- **加**:橙色 token(`--orange-warm` / `--orange-bright`,智能理牌渐变用)
- **加**:3D 卡片阴影 token(`--shadow-card-3d` + 4 个 glow 变体)
- **加**:字号 `--fs-5: 9px`(进度文字用)
- **保持**:现有的 --gold / --orange / --text-* / --r-* / --space-* / --shadow-*,不要删

### 2. `src/components/TableCenter.vue`
- **改**:删除 `.watermark` 元素(div + 文字),改用 `.table-deco` 装饰花纹(SVG 圆环 + 十字 + 角点 + 中央 PVP)
- **加**:`.table-info-top` 信息条(打 X / 第 N 轮 / ×N 倍)
- **改**:`.first-tip` 增强为"头像 + 名字 + 出牌中 ▶" 胶囊
- **加**:`.table-toplight` + `.table-vignette` 立体光影
- **保持**:`.ellipse-table` 的木边 / 渐变结构,**只是去掉水印 + 加装饰**
- **保持**:`.card-stack` 的堆叠逻辑(±6° 旋转 + 16-32px 错位,已实现)

### 3. `src/components/PlayerSeat.vue`
- **改**:卡片化 — 圆角 12px + 渐变背景 + 3D 阴影 + backdrop-filter
- **改**:头像 60×60 → 56×56 圆形(去掉方角)+ 角色色双层描边 + 发光
- **加**:role 角标 emoji(队友 🤝 / 对手 ⚔ / 自己 👑)
- **加**:is-turn 状态头像外金色脉冲环(已部分实现,强化)
- **加**:卡片底部出牌进度条 + "剩 N 张"文字
- **加**:思考气泡(队友专用,AI 思考时显示 3 颗跳动小点)
- **保持**:`is-done` 灰化 + 头像 emoji(🀄/🤖 等)

### 4. `src/components/HudTop.vue`
- **改**:`.hud-topright` 从 4 横排 → 2x2 网格(`grid-template-columns: 36px 36px`)
- **改**:图标 emoji(⚔ → 🏆 / 🃏 → 📊 / ··· → ⋯ / ⚙ → ⚙)
- **加**:hover tooltip 气泡(中文,绝对定位在按钮下方)
- **加**:active 状态(蓝色背景 + 描边 + 光晕)
- **加**:`.info-strip` 对局信息紧凑条(打 X / ×N / 倒计时 25s)— 放在 2x2 网格下方
- **保持**:`.hud-topleft` 的本局打 / 倍数卡片(已成型,不重做)
- **保持**:队友座位(顶)、左/右对手座位的位置

### 5. `src/components/QuickActions.vue`
- **保持**:3 个小图标(🃏 理牌 / ⚡ 一键理 / 💬 聊天),**不删**
- **降低优先级**:把"⚡ 一键理"小图标降级为辅助入口,**主入口搬到操作栏附近**

### 6. `src/components/MainActions.vue`(若需要)
- **加**:一个"✨ 智能理牌"插槽位置(放在 .act-btn 3 按钮上方/下方),让 designer 的橙色按钮能挂上来
- **保持**:3 大按钮(不出/提示/出牌)不变

### 7. `src/views/game/GameView.vue`
- **加**:在 `.action-bar-wrap` 之前加一个 `.auto-find-pill` 容器,绑定 `onAutoFindBest`(已存在)
- **改**:`:deep(.seat-bottom)` 位置 — 从 `bottom: 60px right: 30px` → `bottom: 380px right: 30px`(避开中央操作栏 / 一键理牌 / 手牌)
- **加**:`.col-rank` 列顶 rank 数字标签(模板里在 v-for col 加 .col-rank 元素,样式在 scoped CSS)
- **改**:`.hand-column` 边框 — 从 1px `rgba(255,255,255,0.12)` → 2px 渐变(border-image)
- **改**:`.hand-column.is-selected` 抬升 — 16px → 18px,加 `0 0 16px var(--gold-soft)` 外光晕
- **保持**:`groupHandByRank` 调用、`toggleCol` 逻辑、`selectedColKeys` 数据流,全部不动

---

## 四、不要做(明确禁止)

### 1. **不要重写 `src/common/guandan-engine.js:408` 的 `groupHandByRank`**
- 已实现并测试通过(213/213)
- 改它会破坏 60 个 engine 测试
- v3-6 只改 **CSS 视觉**(列顶 rank 标签 + 列间渐变分隔 + 选中态强化),不改函数实现

### 2. **不要重写 `src/common/guandan-ai.js:453` 的 `autoPlayGrouped`**
- 已实现并测试通过(17 个 AI 测试)
- 改它会破坏 AI 智能凑牌逻辑
- v3-6 只把它的入口"⚡ 一键理"从角落小图标 promote 到显眼大按钮

### 3. **不要加回 CardCounter / 记牌器**
- v3-5 已删,grep 全仓 0 匹配
- user 在 2026-06-07 需求里明确说"把计牌器去掉"
- 右上角"信息紧凑条"严格不展示 4×13 网格的已出/剩余数字

### 4. **不要改 `src/common/` 下的引擎 / AI / 对局逻辑**
- 纯 UI 改造,业务规则不动
- 包括 `guandan-engine.js` / `guandan-ai.js` / `guandan-game.js` / `network.js` / `storage.js` / `deal-animation.js` / `audio.js` / `effects.js`
- 改 UI 视觉不会破坏 81 个测试

### 5. **不要改 4 个图标按钮的语义**
- 🏆 = 对局(可点开"对局信息"侧栏,后续 v3.7 实施)
- 📊 = 牌型(可点开"牌型参考"侧栏,后续 v3.7 实施)
- ⋯ = 更多(聊天/战绩/反馈 — 后续 v3.7 实施)
- ⚙ = 设置(打开设置弹窗,已 emit 'icon' 事件,后续 v3.7 实施)
- v3-6 阶段这 4 个按钮可以**只做视觉**(图标 + tooltip + active),**不接业务逻辑**

### 6. **不要做响应式**
- 桌面端 1280×800 画布固定
- 移动端布局留给 v3.5 / v3.6 之后的 v3.7 单独处理

### 7. **不要改 `src/components/CardPlay.vue`**
- 单张牌的样式已经按 v3-3 商业级做好了(白底 + 4 角数字 + 中央花色 + 级牌红"级" + JOKER 大字)
- v3-6 只用 CardPlay 渲染手牌和桌面牌,不改它的样式

---

## 五、验收对照表

| 改造项 | v3-5 状态 | v3-6 目标 | 验证方式 |
|---|---|---|---|
| 中段不再是空椭圆 + 大水印 | 大字"爱掼蛋"水印 | 装饰花纹 + 桌面信息条 + 出牌堆 + 首家提示 | 看 .harness/designs/screenshots/v3-6-mockup.png 中段 |
| 4 角色卡视觉差异 | 边框颜色弱 | 队友=蓝/对手=红/自己=绿 + 三色光晕 | 截图里 4 张卡边框颜色清晰 |
| 4 角色卡有质感 | 卡片薄 | 圆角 12px + 渐变背景 + 3D 阴影 + 进度条 | 截图里卡片有 3D 感 |
| 右上 4 图标不是计牌器 | 视觉风格像面板 | 2x2 网格 + 直观 emoji + hover tooltip | 截图里右上 2x2 + tooltip(hover) |
| 一键理牌显眼 | 角落小图标 ⚡ | 中央"✨ 智能理牌"橙色胶囊 | 截图里橙色按钮 |
| 同 rank 竖叠突出 | 只有底部 ×N | 列顶 rank 标签 + 列间渐变分隔 + 选中态金色 | 截图里手牌每列顶部有 7/9/10/K/2/王 标签 |
| 整体配色统一 | 5+ 种色混搭 | 深蓝紫底 + 金主调 + 橙强调 + 身份三色 | 截图里颜色不超过 4 类(蓝紫底/金/橙/身份三色) |
| 不加重写 `groupHandByRank` | — | 函数实现不动,只改 CSS 视觉 | `git diff` src/common/guandan-engine.js 应无变化 |
| 不加回 CardCounter | — | 右上不放 4×13 网格 | `grep -r "CardCounter" src/` 应 0 匹配 |
| HTML 自包含 | — | `<style>` 标签完整,无外部 link | 看 mockup.html head |
| 配色 token 具体可读 | — | hex 色值全列在第二节 | 第二节 配色 Token |

---

## 六、给 coder 的实施提示

1. **改动的优先级**(从 user 痛点出发):
   - P0:中段去水印 + 4 角色卡升级(用户最不满意的两块)
   - P0:一键理牌 promote(用户根本没意识到有这个功能)
   - P1:右上角 4 图标改造(消除"以为是计牌器"的误解)
   - P1:同 rank 竖叠视觉强化(功能已有,只缺视觉锚点)
   - P2:整体配色统一(其他都是局部的,这个是全局的)

2. **改动文件的依赖关系**:
   - `tokens.css` 改完 → `PlayerSeat.vue` / `TableCenter.vue` / `HudTop.vue` 改样式时引用新 token
   - `PlayerSeat.vue` 改完 → `HudTop.vue` 不用动(`<PlayerSeat>` 通过 prop 传数据,样式独立)
   - `GameView.vue` 改 `:deep(.seat-bottom)` 位置 + 加 `.auto-find-pill` + 改 `.hand-column` 边框 — 这是最后改的

3. **不要触碰的代码路径**:
   - `common/guandan-engine.js` 的 `groupHandByRank`(line 408)
   - `common/guandan-ai.js` 的 `autoPlayGrouped`(line 453)
   - `GameView.vue` 的 `handColumns` / `toggleCol` / `onAutoFindBest` 函数实现(只动 template 里的 class 和 CSS)

4. **截图验证**:
   - 改完用 `npm run dev` 起服务
   - 浏览器开 `http://localhost:8848/game?roomNo=xxx`
   - 走到自己回合(让 hand 出现),截图保存到 `.harness/designs/screenshots/v3-6-after-impl.png`
   - 对比 v3-6-mockup.png,逐项打勾
