# 架构总览

> 给接手这个项目的工程师的一份「系统骨架图」,读完你应该能在脑子里画出整个 App 是怎么跑起来的,数据从哪儿来、到哪儿去。

---

## 一、一句话总结

**一个零公网依赖的 4 人掼蛋游戏,Vue 3 + Vite 打包,核心算法(规则引擎/AI/对局状态机)用纯 JS 写成,UI 是 Vue 组件,网络层是浏览器版 BroadcastChannel 模拟(真机需替换)。**

设计原则:**业务核心不依赖 UI,UI 不直接调用游戏逻辑**。所有 View 组件都通过 `common/` 下的纯 JS 模块来推进对局。

---

## 二、分层架构

```
┌──────────────────────────────────────────────────────────┐
│                       Vue Views 视图层                    │
│  HomeView / RoomView / JoinView / GameView / AIView /     │
│  GuideView / HistoryView / SettingsView                   │
├──────────────────────────────────────────────────────────┤
│                   Vue Components 组件层                    │
│  HudTop / PlayerSeat / CardPlay / TableCenter /          │
│  MainActions / QuickActions / HistoryChart / ...          │
├──────────────────────────────────────────────────────────┤
│                  通用样式 token + 全局 CSS                 │
│         src/styles/tokens.css (设计变量 / 间距 / 阴影)      │
├──────────────────────────────────────────────────────────┤
│              Pure JS Modules 核心业务层(零 Vue 依赖)        │
│  guandan-engine.js  规则引擎                              │
│  guandan-ai.js      AI 出牌决策                            │
│  guandan-game.js    对局状态机                             │
│  audio.js           音效 / 音乐(零依赖 Web Audio API)      │
│  effects.js         视觉特效工具                           │
│  deal-animation.js  发牌动画                               │
│  card-api.js        卡牌数据 API(导出供测试)               │
│  network.js         P2P 网络抽象(浏览器版 BroadcastChannel) │
│  storage.js         localStorage 封装                     │
├──────────────────────────────────────────────────────────┤
│                    Browser Native                         │
│  BroadcastChannel / localStorage / Web Audio API /        │
│  Canvas (无) / Vite HMR / Vue 3 reactivity               │
└──────────────────────────────────────────────────────────┘
```

**关键不变量**:
- `common/` 下所有模块**不知道 Vue 存在**——可以单独在 Node 里跑、单独写测试
- `views/` 负责把状态从 `common/` 拉过来喂给组件,组件再 emit 事件回去
- 没有任何后端 API,没有 fetch / axios / WebSocket,运行时只连本机 8848 端口

---

## 三、数据流(以一局对局为例)

```
玩家点击 [出牌] 按钮
   │
   ▼
MainActions.vue emit('play', selectedCards)
   │
   ▼
GameView.vue 处理:
  1. validate 通过 game.playerPlay(seat, cards) ── 调用状态机
  2. 同步广播: net.broadcast({ type: 'PLAY', payload: cards, from: seat })
  3. 播放音效: audio.sfxPlay(type) / sfxBomb()
   │
   ▼
guandan-game.js 状态机:
  1. 验证牌型 ──── 调用 engine.recognize()
  2. 验证压制 ──── 调用 engine.canBeat()
  3. 推进状态: hands[], lastPlay, currentPlayer
  4. 触发 emit('play') / emit('turn') / emit('trickEnd') / emit('roundEnd')
   │
   ▼
GameView.vue 监听 state 变化:
  - tableCards = ...  (桌面牌)
  - lastPlay = ...     (桌面牌型)
  - currentPlayer = ... (下一个出牌人)
  - turnTimeLeft = ... (倒计时归零)
   │
   ▼
Vue 响应式触发组件重渲染
   │
   ▼
若 currentPlayer 是 AI 座位:
  500-1000ms 后 game.scheduleAI() 调用 AI.decide()
  AI 返回 { type: 'play', cards } → game.playerPlay(seat, cards)
   │
   ▼
若 currentPlayer 是真人,等待 socket 接收对方广播
```

**单向 + 事件驱动**:
- 数据从底层 `common/` 推上来,触发 UI 变化
- 用户操作从顶层 `views/` 走下去,落到 `common/`
- 跨玩家通信:真人发牌 → 走 `net.broadcast` → 其他人收 → 调 `game.playerPlay` 推到对局

---

## 四、关键模块角色

| 模块 | 行数 | 职责 | 不应做什么 |
|------|------|------|----------|
| `guandan-engine.js` | 539 | 牌型识别、大小比较、升级计算、逢人配 | 不存状态、不发事件 |
| `guandan-ai.js` | 766 | AI 出牌决策(规则+贪心) | 不修改手牌、不发事件 |
| `guandan-game.js` | 226 | 对局状态机(发牌/出牌/接风/升级) | 不直接渲染 UI |
| `audio.js` | ~759 | 音效 + BGM(Web Audio API 零依赖合成) | 不读 Vue 状态 |
| `network.js` | 148 | P2P 事件总线 + 房间管理 | 不存游戏状态 |
| `storage.js` | 83 | localStorage 封装 + 默认值合并 | 不处理业务逻辑 |
| `effects.js` | ~50 | 视觉特效工厂函数 | 不改全局状态 |
| `deal-animation.js` | ~120 | 发牌动画的物理参数 | 不调 network |

---

## 五、跨设备的运行时

| 环境 | 网络层 | 用途 |
|------|--------|------|
| 浏览器 dev | `BroadcastChannel` | 开发调试,4 标签联机 |
| 浏览器 prod | `BroadcastChannel` | H5 演示(同 origin 即可) |
| Capacitor APK | `BroadcastChannel` (内置 H5) | 临时演示,**真机不互通** |
| 真机 v2.0 | **待实现** (TCP Socket / WiFi Direct) | 4 手机热点对局 |

**当前 v1.0 网络限制**:跨设备不联(详见 `docs/NETWORK.md`)。
**v2.0 目标**:实现 TCP Socket 网络层,提供 Capacitor 原生插件。

---

## 六、状态机长什么样

`guandan-game.js` 维护一个 `state` 对象:

```js
{
  phase: 'idle' | 'dealing' | 'playing' | 'trick_end' | 'finished',
  round: 1,
  levelRank: 15,                  // 当前级牌 (2→A→K→Q→...→3→2 循环)
  hands: [[], [], [], []],        // 4 个玩家手牌
  tableCards: [],                 // 当前桌面牌
  lastPlay: null,                 // { type, mainRank, length, who, cards }
  currentPlayer: 0,               // 当前出牌人
  firstPlayer: 0,                 // 本轮首家
  leaderPlayer: 0,                // 本局领出者(头游)
  trickHistory: [],               // 历次出牌
  finishedOrder: [],              // 出完顺序 [头, 二, 三, 末]
  passCount: 0,
  tribute: null,                  // 进贡信息
  ghost: { suit: 1, rank: 15 },   // 逢人配(红桃级牌)
  levelUp: 0,                     // 本局升几级
}
```

**状态转换**:
```
idle ──deal()──> dealing ──> playing
playing ──出完→ 判定胜者 ──> trick_end ──> playing(继续) | finished
finished ──nextRound()──> dealing(下一局,升级)
```

**事件**(用 `game.on('xxx', fn)` 订阅):
- `dealt` — 发牌完成
- `play` — 某玩家出牌 `{ seat, cards, type }`
- `pass` — 某玩家过牌 `{ seat }`
- `turn` — 轮到某人 `{ seat, lastPlay, isTeammateLast }`
- `playerFinished` — 某玩家出完牌
- `trickEnd` — 一轮结束(3人都 pass) `{ leader, handsRemaining }`
- `roundEnd` — 一局结束 `{ ranks, levelUp, tribute, newLevelRank }`

---

## 七、Vue 状态管理

**没用 Vuex / Pinia**。GameView.vue 直接用 `ref` + `computed` 维护视图状态:

```js
// GameView.vue
const myHand = ref([])
const tableCards = ref([])
const lastPlay = ref(null)
const currentPlayer = ref(0)
// ... 一个状态一个 ref
```

**为什么不引入 Pinia**:
- 项目就 1 个核心页面 `GameView.vue` 需要复杂状态,其他都是表单/列表
- Pinia 多一层抽象,新工程师上手反而绕
- `ref` + Vue 响应式已经够用,后端状态从 `common/` 推上来直接赋 ref

**模式**:
```js
game.on('play', ({ seat, cards, type }) => {
  // 1. 从 common/ 推过来的事件
  tableCards.value = cards
  lastPlay.value = { type, cards, who: seat }
  // 2. 触发响应式,UI 自动重渲染
})
```

---

## 八、模块依赖图

```
                    ┌─────────────────────┐
                    │   main.js (路由)     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        HomeView.vue     RoomView.vue     GameView.vue  ...
              │                │                │
              │                │                │
              ▼                ▼                ▼
        storage.js      network.js       ┌──────────────┐
                          + storage      │  guandan-    │
                                          │  game.js     │
                          ┌───────────────┤  (状态机)    │
                          │               └──────┬───────┘
                          ▼                      │
                    net events           ┌──────┴──────┐
                          │              ▼             ▼
                          └────────> guandan-      guandan-ai.js
                                     engine.js
                                     (规则)
                                        
                       全局: tokens.css / audio.js / effects.js
```

**关键依赖约束**:
- `common/` 内部:`engine` 不知道 `ai/game` 存在,`ai` 引用 `engine`,`game` 引用 `engine + ai`
- `components/` 不能反向依赖 `views/`,只能依赖 `common/`
- `views/` 可以引用一切

---

## 九、典型迭代场景的入口

| 需求 | 改什么 | 文档 |
|------|--------|------|
| 加一种牌型(如「飞机带翅膀」) | `engine.js` recognize + canBeat + 测试 | `docs/HOWTO-EXTEND.md` |
| 改 AI 难度 | `ai.js` 决策函数 + 测试 | `docs/AI.md` |
| 加一种特效 | `effects.js` 工厂函数 + GameView 接 | `docs/UI.md` |
| 加一种音效 | `audio.js` 加 sfxXxx 函数 + 测试 | `docs/UI.md` |
| 加一个新页面 | `views/<name>/<Name>View.vue` + main.js 注册路由 | `docs/UI.md` |
| 改级牌 / 升级规则 | `engine.js` getLevelRank + calcLevelUp | `docs/ENGINE.md` |
| 真机联机(TCP Socket) | 替换 `network.js` 内部实现 | `docs/NETWORK.md` |
| 接 WiFi Direct (Android) | 加 Capacitor 插件 + `network.js` 平台分支 | `docs/NETWORK.md` |
| 改测试规范 | 加 `*.test.js` 文件 | `docs/TESTING.md` |
| 改设计 token | `src/styles/tokens.css` | `docs/UI.md` |

---

## 十、不要做的事

写完代码前先看一眼这份黑名单,别在 review 时被驳回:

1. **不要在 `common/` 里 import Vue** —— 这是纯 JS 业务层
2. **不要在 common 里调 setTimeout/setInterval 做长期任务** —— `game.js` 的 `scheduleAI` 是个特例(AI 出牌节奏),其他场景请用 Vue 生命周期
3. **不要引入联网依赖** —— axios / 第三方 CDN / 远程字体全 NO,破坏离线原则
4. **不要碰 `guandan-engine.js` 已有函数签名** —— 外部调用方多,改签名必爆;要扩展就加新函数
5. **不要在 `.vue` 里写 CJS `require`** —— 项目标了 `"type": "module"`
6. **不要把游戏状态存到 localStorage** —— `storage.js` 只存昵称/头像/设置/战绩,游戏状态只在内存里
7. **不要改 AGENTS.md 里 6 条产品决策** —— 都是 user 已经拍板的,要改先开 v3.x RFC

---

**下一步阅读**:
- 业务逻辑核心 → `docs/ENGINE.md` / `docs/AI.md`
- 联机原理 → `docs/NETWORK.md`
- UI 系统 → `docs/UI.md`
- 怎么动手改 → `docs/HOWTO-EXTEND.md`
