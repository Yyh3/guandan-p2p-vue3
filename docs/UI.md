# UI 系统

> Vue 3 + 组件化 + 设计 token。改 UI 之前先看这个文档。

---

## 一、目录结构

```
src/
├── views/                          # 页面级组件(路由目标)
│   ├── index/HomeView.vue          # 首页(开房/加入/AI/历史/设置入口)
│   ├── room/RoomView.vue           # 房间页(4 座位 + 准备/开局)
│   ├── join/JoinView.vue           # 加入页(扫码/输入房间号)
│   ├── game/GameView.vue           # 对局页(1257 行,核心)
│   ├── ai/AIView.vue               # AI 单机配置
│   ├── guide/GuideView.vue         # 新手引导
│   ├── history/HistoryView.vue     # 战绩 + 图表
│   └── settings/SettingsView.vue   # 集中设置面板(v3.7 P2)
├── components/                     # 可复用组件
│   ├── HudTop.vue                  # 顶部 HUD(房间号/级牌/倒计时/座位)
│   ├── PlayerSeat.vue              # 单个玩家座位(650 行,大块)
│   ├── TableCenter.vue             # 中央牌桌(桌面牌/首家提示)
│   ├── CardPlay.vue                # 单张扑克牌渲染(支持级牌/大小王)
│   ├── MainActions.vue             # 底部主操作栏(出牌/不出/提示)
│   ├── QuickActions.vue            # 右下角圆形按钮(理牌/一键理/聊天)
│   ├── CountdownClock.vue          # 倒计时圆环
│   ├── EffectLayer.vue             # 全屏特效(炸弹震动/飘字)
│   ├── NicknameEditor.vue          # 昵称/头像编辑器(对局中禁用)
│   ├── ChatQuickPanel.vue          # 快捷聊天 10 颗 pill
│   ├── PlayHintButton.vue          # 智能理牌提示按钮
│   └── HistoryChart.vue            # 战绩可视化(零依赖 SVG,v3.7 P2)
├── styles/
│   └── tokens.css                  # 全局设计变量(色/间距/阴影/动效)
└── main.js                         # 路由注册 + App 挂载
```

---

## 二、路由表

`src/main.js` 集中管理,使用 `createWebHashHistory` (即 URL 是 `http://localhost:8848/#/game` 这种 hash 路由)。

```js
const routes = [
  { path: '/',          component: HomeView },        // 首页
  { path: '/room',      component: RoomView },        // 房间
  { path: '/join',      component: JoinView },        // 加入
  { path: '/game',      component: GameView },        // 对局
  { path: '/ai',        component: AIView },          // AI 单机
  { path: '/guide',     component: GuideView },       // 新手引导
  { path: '/history',   component: HistoryView },     // 战绩
  { path: '/settings',  component: SettingsView },    // 设置
]
```

**加新页面**:
1. 在 `src/views/<name>/` 建 `<Name>View.vue`
2. `src/main.js` 加 `{ path: '/<name>', component: <Name>View }`
3. 跳转:`router.push('/<name>')`

---

## 三、设计 Token(`src/styles/tokens.css`)

**所有 UI 颜色 / 间距 / 阴影 / 字号 / 动效都引用这里的 CSS 变量**。**改样式时优先改 token,不要在组件里写裸色值**。

### 3.1 主要 token 分组

```css
:root {
  /* 背景 */
  --bg-deep: #0a1233;
  --bg-table: #1a2a5e;
  --bg-table-soft: #2a3464;

  /* 强调色 */
  --accent-yellow: #FFC107;     /* 主黄(按钮) */
  --accent-orange: #FF9800;     /* 倒计时 */
  --accent-blue: #2196F3;       /* 出牌按钮 */
  --accent-red: #E53935;        /* 飘字红 / 不出 */
  --accent-green: #43A047;      /* 胜利绿 */
  --accent-purple: #7E57C2;     /* 对家 */

  /* 身份三色(v3.6) */
  --color-teammate: #42a5f5;    /* 队友 主蓝 */
  --color-opponent: #ef5350;    /* 对手 主红 */
  --color-self: #66bb6a;        /* 自己 主绿 */

  /* 牌面 */
  --red-card: #E74C3C;
  --black-card: #2C3E50;
  --card-bg: #FFFFFF;

  /* 间距 */
  --space-xs: 4px;  --space-sm: 8px;
  --space-md: 12px; --space-lg: 16px; --space-xl: 24px;

  /* 圆角 */
  --radius-sm: 4px;  --radius-md: 8px;
  --radius-lg: 12px; --radius-xl: 20px; --radius-pill: 999px;

  /* 字号 */
  --fs-xs: 10px; --fs-sm: 12px; --fs-md: 14px;
  --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 28px;
  --fs-3xl: 40px; --fs-display: 56px; --fs-bomb: 72px;

  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 3px 8px rgba(0,0,0,0.4);
  --shadow-lg: 0 6px 16px rgba(0,0,0,0.5);
  --shadow-glow-gold: 0 0 14px rgba(255,215,0,0.7);

  /* 动效 */
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --t-fast: 120ms; --t-med: 240ms;
  --t-slow: 400ms; --t-bomb: 1500ms;

  /* 组件尺寸 */
  --hand-card-w: 60px; --hand-card-h: 84px;
  --col-w: 78px;       /* 手牌列宽 */
  --avatar-size: 56px;
}
```

### 3.2 修改 token 的影响面

| 改这个 token | 影响 |
|--------------|------|
| `--bg-*` | 所有页面的背景渐变 |
| `--accent-yellow` | 顶部级牌标签、按钮 |
| `--color-self/teammate/opponent` | PlayerSeat 的身份配色 |
| `--red-card/black-card` | 所有扑克牌的红/黑 |
| `--hand-card-w/h` | 手牌 + 桌面牌尺寸 |
| `--col-w` | 手牌列宽(v3.6 起固定) |
| `--shadow-*` | 卡片 / 按钮 / 座位 |

**修改前先跑** `npm run build` 看产物大小,token 改动不会影响大小,但要肉眼检查所有页面没破。

---

## 四、关键组件详解

### 4.1 `GameView.vue`(对局页,1257 行)

**最大、最复杂的组件**。包含整个对局状态机的 UI 状态。

**核心 ref**:
```js
const myHand = ref([])              // 我的 27 张手牌
const selectedColKeys = ref({})     // 选中的列(按 key)
const tableCards = ref([])          // 桌面牌
const lastPlay = ref(null)          // 桌面牌型
const currentPlayer = ref(0)        // 当前出牌人
const turnTimeLeft = ref(30)        // 倒计时
const phase = ref('idle')           // 阶段
const isDealing = ref(false)        // 发牌中
const urgent = ref(false)           // 紧急蜂鸣状态
```

**关键事件**:
- `onSortHand` — 理牌(按 rank 分组)
- `onAutoFindBest` — 一键理(调 `ai.autoPlayGrouped`)
- `onPlay` — 出牌(调 `game.playerPlay` + `net.broadcast`)
- `onPass` — 过牌
- `onHintToggle` — 提示模式开关(高亮能出的牌)
- `onChatSelect` — 选快捷聊天短语

**键盘快捷键**(v3.7 P1):
- `A` — 提示模式
- `Space` — 出牌
- `P` — 不出
- `Esc` — 弹菜单

**不要碰的逻辑**:
- `setTimeout` cleanup(`onUnmounted`)
- `net.on` 监听器 cleanup
- 倒计时 timer 清理

### 4.2 `PlayerSeat.vue`(650 行)

**4 个玩家座位之一**。身份三色(队友/对手/自己)+ 头像 + 昵称 + 准备状态 + 报数 + 编辑昵称按钮。

**Props**:
- `seat`: 座位号 0-3
- `player`: `{ name, avatar, isAI, isMe, ... }`
- `isMyTurn`: 是不是该我出
- `showCount`: 显示报数(≤10 张时)
- `allowEdit`: 是否允许编辑昵称(对局中 false)
- `handCount`: 手牌数

**关键样式**:
- `.is-self` — 自座位(底部居中突出)
- `.is-teammate` — 队友
- `.is-opponent` — 对手
- `.is-urgent` — 报数紧急
- `.is-playing` — 当前出牌人

### 4.3 `CardPlay.vue`(单张牌)

**Props**:
- `card`: `{ suit, rank }`
- `isLevel`: 是不是级牌
- `selected`: 选中态
- `hinted`: 提示态
- `size`: `sm | md | lg`

**特殊处理**:
- 大小王:用内联 SVG 画小丑头像(不是 emoji,headless 渲染 emoji 会成白方块)
- 级牌:加金色边框
- 选中:加亮色边框 + 阴影

### 4.4 `MainActions.vue`(底部操作栏)

**Props**:
- `visible`: 是否显示
- `disabled`: 是否禁用
- `hintCount`: 提示牌数
- `canPass`: 能否不出
- `canPlay`: 能否出牌

**Emit**:
- `pass`, `play`, `hintToggle`, `autoPlay`

**Slot**:
- `#smart-sort`: 智能理牌按钮(v3.6 加)

### 4.5 `TableCenter.vue`(中央牌桌)

**Props**:
- `tableCards`: 当前桌面牌
- `firstPlayerName/Emoji`: 首家信息
- `isLevel`: 桌面牌是不是级牌
- `isDealing`: 发牌中
- `levelLabel`: 当前级牌
- `round`: 局数
- `multiplier`: 倍数

**显示内容**:
- 桌面牌(v-if 桌面有牌)
- 首家提示(谁先出)
- 倍数 / 局数

### 4.6 `HudTop.vue`(顶部 HUD,466 行)

**Props**: 一堆,从 GameView 传
**Emit**: `menu`, `seatClick`, `icon`, `editRequest`

**包含**:
- 顶部 bar(返回 + 房间号 + 级牌标签 + 倍数 + 倒计时 + 菜单)
- 4 个 PlayerSeat 缩略版
- 顶部位移效果(出牌时下沉)

### 4.7 `HistoryChart.vue`(v3.7 P2 新)

**零依赖 SVG 柱状图 + 折线图**。

**Props**:
- `history`: `[{ rank, levelRank, ts, players }]`

**特点**:
- 柱状:4 颗名次柱并列(头游金/二游银/三游铜/末游灰)
- 折线:Y 轴 2-A 的级数曲线
- 空态/1 局/10+ 局自适应

---

## 五、组件设计原则

### 5.1 单向数据流

```
Parent (GameView)
  ↓ props
Child (PlayerSeat, CardPlay, ...)
  ↓ emit
Parent 处理事件
  ↓ 调 common/
状态推进
  ↓ state 变化
Vue 响应式触发 child 重渲染
```

**禁止**:
- Child 直接调 `common/`(除了纯工具函数如 `engine.groupHandByRank`)
- Child 之间互相 emit / 共享状态
- Child 直接改 prop

### 5.2 组件复用边界

| 类型 | 例子 | 何时抽组件 |
|------|------|-----------|
| 页面级 | HomeView, RoomView, GameView | 路由目标 |
| 容器级 | HudTop, TableCenter | 包含多个子组件,有局部逻辑 |
| 展示级 | CardPlay, PlayerSeat | 纯展示,只接 props/emit |
| 工具级 | CountdownClock | 一个文件一个小组件,通用 |

**判断标准**:
- 用了 2+ 次 → 抽组件
- 单一职责 → 抽组件
- 跨 view 复用 → 抽组件(放 `src/components/`)

### 5.3 `<script setup>` 组合式 API

**全项目统一用 `<script setup>`**。**不要混 Options API**。

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import CardPlay from './CardPlay.vue'

const props = defineProps({
  card: { type: Object, required: true }
})

const emit = defineEmits(['play', 'pass'])

const isSelected = ref(false)

function onClick() {
  emit('play', props.card)
}

onMounted(() => { /* ... */ })
</script>
```

**重要约束**:
- `<script>` 块在 `<template>` 下面(Vue SFC 顺序)
- 必填: `<template>` + `<script setup>`,可选: `<style scoped>`
- 三个块都要齐全,即使 `<script setup>` 只有一行

---

## 六、响应式 + 样式约束

### 6.1 桌面端固定 1280×800

**整个项目针对 1280×800 画布固定布局**。**没有响应式**。

设计动机:掼蛋是 4 人对局游戏,牌桌需要稳定布局;移动端是 v2.0 的事。

**改宽高前**:检查每个 view 在 1280×800 下不破。

### 6.2 CSS 规范

- **不引第三方 UI 库**(Element Plus / Vant 全 NO)
- **不引 CSS-in-JS**(style scoped + tokens.css 够用)
- **不引 CSS 预处理器**(Sass / Less 全 NO,原生 CSS 变量够用)
- **scoped**:每个组件样式都加 `scoped`,不污染全局
- **类命名**:`kebab-case`(BEM 风格不强制)

### 6.3 动效

- **优先 transform**(硬件加速,不重排)
- **不改 width/height**(触发重排)
- **统一用 token**:`--ease-out / --t-med` 等

---

## 七、加新 UI 元素的常见场景

### 场景 1:加一种新页面(如「商店」)

1. `src/views/shop/ShopView.vue` — 新建 SFC
2. `src/main.js` 加路由 `{ path: '/shop', component: ShopView }`
3. 从首页加按钮 `router.push('/shop')`

### 场景 2:加一种新卡片样式

不要在 `CardPlay.vue` 里加 if/else,做新组件:
- `src/components/SpecialCard.vue` — 继承 CardPlay 的样式 token,加新 props
- 在 GameView / 其他 view 里用

### 场景 3:加一种新特效

1. `src/common/effects.js` 加工厂函数 `createXxxEffect()`
2. `EffectLayer.vue` 接新 props + 触发
3. GameView 在需要时 `bombFx.value = createXxxEffect()`

### 场景 4:加一种新音效

1. `src/common/audio.js` 加 `function sfxXxx()` + 导出
2. 在 GameView / 状态机需要时 `audio.sfxXxx()`
3. `src/common/audio.test.js` 加 1 个测试

### 场景 5:加一种新设计色

1. `src/styles/tokens.css` 加新 token
2. 在需要的地方用 `var(--xxx)`
3. 不在组件里写裸色值

---

## 八、修改 checklist

改 UI 前:

1. **改样式前看 token** —— 是不是已经有对应 token?能复用就复用
2. **加组件前看 components/** —— 是不是已经类似组件能复用?
3. **改 GameView 前看注释** —— GameView 1257 行,改动前先 `grep` 看相关逻辑在哪
4. **加键盘快捷键前** —— GameView 已有 A/Space/P/Esc 4 个,新加的别冲突
5. **改 CardPlay 前** —— 改了渲染逻辑会影响所有 view 的牌,Playwright 截图回归
6. **测试 / 截图** —— UI 改动跑 Playwright 截图对比 4 view 渲染

---

## 九、调试 UI 的 5 个技巧

### 9.1 Vue DevTools

装 Vue DevTools 浏览器扩展,直接看组件树 + ref 值 + 事件。

### 9.2 localStorage 查

```js
localStorage.getItem('guandan_settings')  // 设置
localStorage.getItem('guandan_history')   // 战绩
localStorage.getItem('guandan_nickname')  // 昵称
```

### 9.3 看 Vue 响应式 ref 值

```js
// 在浏览器控制台
__VUE_DEVTOOLS_GLOBAL_HOOK__
```

### 9.4 强制刷新

`Cmd+Shift+R`(macOS) / `Ctrl+Shift+R`(Windows)。**HMR 缓存可能让 CSS 改动不生效**。

### 9.5 跑 Playwright 截图

用 MCP 工具 `browser_navigate` + `browser_take_screenshot`,对比改动前后的图。

---

**下一步**:
- 改设计 token → `src/styles/tokens.css`
- 改 GameView → 先读完整文件 1257 行
- 加新 view → `src/main.js` 注册路由
