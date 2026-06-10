# AGENTS.md

> 掼蛋 P2P 局域网版 —— AI agent / coding 工具的协作入口
>
> 任何 AI agent 接手本项目前**先读这个文件**，能少走 90% 的弯路。

## 项目说明

离线局域网 4 人掼蛋游戏，专为高铁 / 隧道 / 野外无公网场景设计。一人开热点（无需流量），4 人连热点后秒开对局，全程无网、无流量、不卡顿、规则正版。

**核心约束（必读）**：
- 零公网依赖：删除所有后端 / 域名 / 登录 / 房卡 / 数据库代码
- 纯局域网 P2P：所有对局数据仅在 4 台设备间传输
- 纯净绿色：无广告 / 充值 / 内购 / 分享 / 排行榜 / 用户注册
- 双模式：4 人局域网联机 + 本地单机 AI 人机

完整需求见对话历史。详细功能见 `README.md` / `BUILD.md` / `TROUBLESHOOTING.md`。

## Setup commands

```bash
# 装依赖
npm install

# 启动开发服务器（http://localhost:8848）
npm run dev

# 跑全部测试（engine 60 + ai 17 + game 4 = 81 个）
npm test

# 跑单个测试套件
npm run test:engine
npm run test:ai
npm run test:game

# 跑性能基准
npm run bench

# 生产构建（产物在 dist/）
npm run build
```

## Project layout

```
guandan-p2p-vue3/
├── AGENTS.md                # ← 你正在读
├── README.md                # 项目入口说明
├── BUILD.md                 # 打包 / 部署教程
├── TROUBLESHOOTING.md       # 排错指南
├── package.json             # npm 配置
├── vite.config.js           # Vite 构建配置
├── index.html               # HTML 入口
├── src/
│   ├── main.js              # Vue 应用入口 + 路由
│   ├── App.vue              # 根组件
│   ├── benchmark.js         # 性能基准
│   ├── common/              # 核心模块（纯 JS, 无 Vue 依赖）
│   │   ├── guandan-engine.js   # 规则引擎（牌型识别 / 大小比较 / 升级）
│   │   ├── guandan-ai.js       # AI 出牌引擎（规则 + 贪心搜索）
│   │   ├── guandan-game.js     # 对局状态机（发牌 / 出牌 / 进贡 / 升级）
│   │   ├── network.js          # P2P 网络抽象（浏览器版用 BroadcastChannel）
│   │   ├── storage.js          # localStorage 封装
│   │   └── *.test.js           # 单元测试
│   ├── components/
│   │   └── NicknameEditor.vue  # 昵称 / 头像编辑器
│   └── views/
│       ├── index/HomeView.vue       # 首页
│       ├── room/RoomView.vue        # 房间页（开房 / 加入 / 4 座位）
│       ├── join/JoinView.vue        # 扫码加入 / 输入房间号
│       ├── game/GameView.vue        # 对局页（出牌 / 跟牌 / 倒计时）
│       ├── ai/AIView.vue            # AI 单机配置页
│       ├── guide/GuideView.vue      # 新手引导（开热点 / 加房间）
│       └── history/HistoryView.vue  # 本地战绩页
└── .harness/                # Mavis 多 agent 团队配置（不影响运行）
    ├── agent.md
    └── reins/
        └── pm/agent.md      # PM 角色定义
```

## Code style

- **模块系统**：ESM（`import` / `export`），**不要再用 `require` / `module.exports`**。`package.json` 标了 `"type": "module"`，CJS 写法 Node 跑不动。
- **路径别名**：`@/` → `src/`（`vite.config.js` 里配的）。`import X from '@/common/storage.js'`。
- **命名**：
  - 文件：`kebab-case.js` 或 `PascalCase.vue`
  - 函数：`camelCase`（`createDeck` / `playerPlay`）
  - 常量：`UPPER_SNAKE`（`SUIT_NAMES` / `TYPE`）
  - 类 / 构造器：`PascalCase`
- **注释**：所有公共函数必须有 1 行说明 + 参数 / 返回值标注
- **行宽**：100 字符软限制
- **缩进**：2 空格
- **Vue 3**：统一用 `<script setup>` 组合式 API
- **导入顺序**：先第三方 → 再项目内（绝对路径 `@/`）→ 再相对路径

## Testing instructions

测试全是 **Node 原生 assert / console.log**，没用测试框架，简单直接。

| 命令 | 测试范围 | 用例数 |
|---|---|---|
| `npm run test:engine` | 规则引擎：牌组 / 牌型识别 / 大小比较 / 升级 / 进贡 | 60 |
| `npm run test:ai` | AI：领出 / 跟牌 / 鬼牌凑牌 / 炸弹 / 接风 | 17 |
| `npm run test:game` | 对局状态机：发牌 / 出牌 / 非法牌型 / 首家 pass | 4 |
| `npm test` | 全部 | 81 |

**测试文件规范**：
- 文件名：`<name>.test.js`，跟被测文件同目录
- 顶部 `import * as X from './<name>.js'`
- 用 `eq(name, actual, expected)` 比 JSON，用 `assert(name, cond)` 验布尔
- 每个测试块用 `console.log('\n=== N. 块名 ===')` 分隔
- 末尾打印 `========== 测试结果: X 通过 / Y 失败 ==========`
- **失败不能掩盖**：fail > 0 时 `process.exit(1)`

**改算法 / 加功能时必须加测试**——没测试的代码不能合。

## 核心模块契约

> AI agent 改 `common/` 时**严格遵守**这些接口，外部 `.vue` 都依赖它们。

### `guandan-engine.js`
```js
// 常量
SUIT_NAMES, RANK_NAMES, TYPE, TYPE_ORDER, LEVEL_SEQUENCE

// 牌组
createDeck() → Card[]               // 108 张
shuffle(deck) → Card[]              // 洗牌（不修改原数组）
sortHand(hand) → Card[]             // 从大到小排序
deal(seed?) → { hands: Card[4][27], deck: Card[] }

// 工具
countByRank(hand) → Map             // 按 rank 计数

// 识别
recognize(cards, ghostRank?) → { type, mainRank, length, kicker } | null
canBeat(prev, curr, ghostRank?) → bool
splitGhosts(cards, ghostRank) → { ghosts: Card[], real: Card[] }
canFormWithGhosts(hand, type, mainRank, length, ghostRank) → bool

// 升级
calcLevelUp(ranks, winner) → number          // 升几级
getLevelRank(currentLevel, upN) → number      // 升级后的级牌 rank
tributeInfo(result) → { from, to, doubleTribute }  // 进贡信息
```

**卡牌数据**：
```js
{ suit: 0|1|2|3, rank: 3..15 }      // suit: 黑桃/红桃/梅花/方块
{ suit: -1, rank: 16|17 }            // 小王 16, 大王 17
```

**牌型 TYPE**（`type: TYPE.X`，`mainRank` 是比较用的大小基准）：
- SINGLE 单张、PAIR 对子、TRIPLE 三张、TRIPLE_PAIR 三带二
- STRAIGHT 顺子（5+）、STRAIGHT_PAIR 连对（3+ 对）、STRAIGHT_TRIPLE 钢板（2+ 三张）
- BOMB_4 4 张炸、BOMB_5 5 张炸、BOMB_6+ 6+ 张炸
- STRAIGHT_FLUSH 同花顺（5+）、JOKER_BOMB 王炸

### `guandan-ai.js`
```js
decide({ hand, table, seat, teammate, ghostRank, playedCards }) → { type: 'play', cards: Card[] } | { type: 'pass' }
findMinBeat(prevCards, hand, ghostRank) → Card[] | null
chooseLead(hand, ghostRank) → Card[]
TYPE_VALUE                              // 牌型强度映射
```

### `guandan-game.js`
```js
createGame({ players, seed, ghostRank }) → {
  state,    // 'idle' | 'dealing' | 'playing' | 'trick_end' | 'finished'
  hands,    // Card[4][]
  table,    // 桌面牌
  currentSeat,
  play(seat, cards): { ok, error? }    // 玩家出牌
  pass(seat): { ok, error? }            // 玩家过牌
  // ... 状态推进
}
```

### `network.js`
```js
on(event, handler) / off(event, handler) / emit(event, data)  // 事件总线
close()
isHost / isConnected / getSelfInfo() / getPeers()
getRoomId() / setRoomId() / getSelfSeat() / setSelfSeat()
startAsHost(roomId)  / joinRoom(hostIp, roomId)
send(seat, msg) / broadcast(msg) / sendTo(seat, msg)
scanLanRooms() → Promise<{ ip, name }[]>
```

**事件名**：
- `peer:join` / `peer:leave` / `peer:update`
- `game:start` / `game:play` / `game:pass` / `game:trick_end` / `game:level_up`
- `chat:msg`

### `storage.js`
```js
getNickname() / setNickname(name)        // 昵称
getAvatar() / setAvatar(dataUrl)          // 头像（base64 dataURL）
getSettings() / setSettings(obj)          // { sound, animation, ... }
getHistory() / addHistory(record) / clearHistory()  // 战绩
```

## 6 个用户已确认的产品决策

> 改产品逻辑前**先回看这 6 条**，避免推翻之前的决定。

1. **换座 = 只跟队友（对家）换**（不能随便换座位）
2. **昵称 + 头像可自设**（自己挑，不强制随机）
3. **改昵称后其他玩家实时看到**（本地存 + P2P 广播）
4. **对局中禁止改名**（防作弊）
5. **AI 中等难度**（规则 + 贪心搜索，**非**深度学习）
6. **纯自实现**（不借鉴任何已有掼蛋项目，版权干净）

## 修改 / 扩展约定

- 改规则引擎：必须加测试（在 `guandan-engine.test.js` 加对应 case），跑 `npm run test:engine` 全过后再 commit
- 改 AI：同上（`guandan-ai.test.js`）
- 加新页面：在 `src/views/<name>/` 建 `<Name>View.vue` + 在 `src/main.js` 注册路由
- 加新事件：在 `network.js` 加 emit + 文档化事件名
- 改 `package.json` 依赖：先确认 npm 包协议（避免引入 GPL 等污染版权）

## PR & commit conventions

- 分支名：`<type>/<short-desc>`（`feat/ai-hard` / `fix/sync-bug` / `docs/build-md`）
- Commit message：Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`）
- 提交前：`npm test` + `npm run build` 双绿
- 描述里写「why」不写「what」

## Security

- 永不提交 secrets / keystore / 证书到仓库（`.gitignore` 默认排除 `dist/` / `node_modules/`，但**不**排除 `*.keystore` / `*.jks` / `*.p12` / `.env*`——手动加）
- 不引入联网依赖（axios / fetch 第三方 CDN / 字体 CDN）——破坏离线原则
- 不收集用户数据 / 不上报埋点
- localStorage 只存本机数据，不外传

## 已知的 v1.0 限制

- **网络层是浏览器版实现**（BroadcastChannel），**真机跨设备无法联机**——v2.0 要接 TCP Socket / WiFi Direct / Multipeer
- **没有原生 APK/IPA 构建配置**——v2.0 加 Capacitor
- AI 只有中等难度，没分 Easy / Hard

## Agent 团队（本仓库专属）

Mavis 多 agent 团队配置在 `.harness/`：

- `coder`（global）—— 写代码
- `verifier`（global）—— 跑测试 / 验证
- `users-yangyuanhao-downloads-guandan-p2p-vue3--pm`（项目 rein）—— 提需求 / 拆解 / 反馈
- `mavis`（orchestrator）—— 路由

## Owner 工作流偏好（2026-06-07）

- **bug 自动修**：verifier 找出的 bug 100% 自动按反馈修，不要每条都问 user
- **plan 配置**：`auto_reject_retries: 2-3`（verifier FAIL 自动 retry），`plan_complete: true` 由 owner 主动控制
- **新功能**：用 mavis team plan 跑，不要单 worker 单打
- **producer prompt 模板**：显式写明 "verifier FAIL 时按反馈直接修，不要问 user"

## 出问题先看

1. `TROUBLESHOOTING.md` —— 80% 的常见问题都在
2. `npm test` 输出 —— 基础功能有没有坏
3. 浏览器 F12 控制台 —— 前端错误
4. 终端输出 —— Vite / Node 错误

**仍然卡住？** 把"做了什么 + 期望什么 + 实际得到什么 + 完整报错"打包给开发者。
