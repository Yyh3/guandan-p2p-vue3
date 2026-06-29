# AGENTS.md

> 掼蛋 P2P 局域网版 —— AI agent / coding 工具的协作入口
>
> 任何 AI agent 接手本项目前**先读这个文件**，能少走 90% 的弯路。

## 当前任务记录

- 2026-06-28：当前主目录有 MiniMax 与 Codex 并发工作，用户要求改为 `git worktree` 隔离。Codex 已切到独立目录 `/Users/yangyuanhao/Downloads/guandan-p2p-vue3-codex`，分支 `codex/ui-mobile-joker-card-preview-isolated`，后续 UI 预览只在此目录完成。
- 2026-06-28：用户提供手机掼蛋横屏对局参考图，要求先用代码渲染 UI 方向，再正式修改真实对局页。预览目标：删除「社区任务福利」、用户金币数、右上角「切换 / 牌数统计 / 同花顺」面板；牌面简洁，不出现一张牌两个数字；桌面已出牌远离手牌。
- 2026-06-28：用户继续要求手牌数字和花色更大、更美观，大小王要有专门小丑卡通图案。本 worktree 新增静态路由 `/#/ui-preview/table`，直接使用项目已有 `src/assets/cards/big-joker.png` 做 JOKER 图案，不接入网络层 / 出牌状态机。
- 2026-06-28 反馈：卡牌数字略大，且「提示 / 出牌」按钮不能压住牌桌上已出的牌。预览页需把手牌数字和大花色收小一档，并上移中心操作按钮，确保按钮与桌面出牌区分离。
- 2026-06-28 反馈：严格按参考截图排布牌面花色：每张露出的牌只显示左上角数字 + 小花色，只有每列最底下那张牌额外显示一个大花色；手牌堆叠顺序按从上到下展示。
- 2026-06-28 反馈：背景需更贴近参考图，不是完整椭圆桌面，而是手机横屏里露出半个牌桌弧面；预览页将桌布和木质边框整体下移、放大，形成下半屏半椭圆牌桌效果。
- 2026-06-28 反馈：背景顶部不能露出完整桌面上沿；桌面椭圆需整体上移到屏幕外，只保留下半个牌桌弧线和侧边暗角。
- 2026-06-28：用户要求将项目每个页面 UI 统一美化为类似参考图的主题和颜色；本次只做视觉层与演示页，不改真实掼蛋规则 / 联机状态机。新增全局 `src/styles/app-theme.css`，所有路由统一引入蓝紫半牌桌背景、玻璃面板、金色主按钮方向。
- 2026-06-28：新增静态演示路由 `/#/ui-preview/restart-after-a`，用于展示“完成对局过 A 后显示「重开一局」按钮”的目标 UI；真实逻辑交给 MiniMax 根据 `docs/restart-after-a-flow.md` 接入。

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

# 跑全部测试（38 套件 / 1889 通过 / 0 失败，v0.4.16 收官基线）
npm test

# 跑单个测试套件
npm run test:engine      # 规则引擎
npm run test:ai          # AI 出牌引擎
npm run test:game        # 对局状态机
npm run test:anim        # 发牌动画 + 音效
npm run test:ws          # WebSocket transport（真机 host + 跨设备 client）
npm run test:rotation    # seat rotation（4 selfSeat × 4 position 覆盖）
npm run test:kick        # 房主踢人（host → 被踢 joiner self:kicked）

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
├── CHANGELOG.md             # 版本变更日志（v0.3.0 起每版本一段,在 docs/CHANGELOG.md）
├── package.json             # npm 配置
├── vite.config.js           # Vite 构建配置
├── capacitor.config.json    # Capacitor 配置（v2.0+，APK 构建）
├── index.html               # HTML 入口
├── src/
│   ├── main.js              # Vue 应用入口 + 路由
│   ├── App.vue              # 根组件
│   ├── benchmark.js         # 性能基准
│   ├── common/              # 核心模块（纯 JS, 无 Vue 依赖）
│   │   ├── guandan-engine.js       # 规则引擎（牌型识别 / 大小比较 / 升级）
│   │   ├── guandan-ai.js           # AI 出牌引擎（规则 + 贪心搜索）
│   │   ├── guandan-game.js         # 对局状态机（发牌 / 出牌 / 进贡 / 升级 / 迁移）
│   │   ├── network.js              # P2P 网络抽象（事件总线 + 传输层路由）
│   │   ├── network-transport-bc.js # BC transport（v2.0 拆出）
│   │   ├── network-transport-ws.js # WebSocket transport（v2.2，跨设备 + 浏览器）
│   │   ├── network-transport-android-ws.js # AndroidWsTransport（v2.0 真机）
│   │   ├── ws-server.js            # 真机 WS server 桥接封装（v2.0）
│   │   ├── seat-rotation.js        # 4 selfSeat 旋转纯函数（v2.1，从 GameView 抽出）
│   │   ├── qr-fallback.js          # QR 失败兜底纯函数（v2.2）
│   │   ├── deal-animation.js       # 发牌动画状态机
│   │   ├── audio.js                # Web Audio 出牌音 / BGM
│   │   ├── storage.js              # localStorage 封装
│   │   ├── effects.js              # 特效层
│   │   └── *.test.js               # 38 套件 Node assert 单测（1889 case 全过,v0.4.16）
│   ├── components/          # Vue SFC 业务组件
│   │   ├── CardPlay.vue        # 出牌按钮 + 提示
│   │   ├── ChatQuickPanel.vue  # 房间内快捷聊天
│   │   ├── CountdownClock.vue  # 倒计时
│   │   ├── EffectLayer.vue     # 特效层（炸弹 / 王炸 / 飞机动画）
│   │   ├── HistoryChart.vue    # 战绩柱状图
│   │   ├── HudTop.vue          # 顶部 HUD（级牌 / 头像 / 设置）
│   │   ├── MainActions.vue     # 主操作按钮（出牌 / 过牌 / 提示）
│   │   ├── NicknameEditor.vue  # 昵称 / 头像编辑器
│   │   ├── PlayHintButton.vue  # 出牌提示按钮
│   │   ├── PlayerSeat.vue      # 玩家座位（4 视图旋转）
│   │   ├── QrFallbackCard.vue  # QR 失败兜底卡片（v2.2）
│   │   ├── QuickActions.vue    # 房间内快捷操作
│   │   └── TableCenter.vue     # 桌面中央（出牌区 / 倒计时）
│   └── views/               # 路由页（8 个）
│       ├── index/HomeView.vue       # 首页
│       ├── room/RoomView.vue        # 房间页（开房 / 加入 / 4 座位）
│       ├── join/JoinView.vue        # 扫码加入 / 输入房间号 / 跨设备连接
│       ├── game/GameView.vue        # 对局页（出牌 / 跟牌 / 倒计时 / GameView.test.js）
│       ├── ai/AIView.vue            # AI 单机配置页
│       ├── guide/GuideView.vue      # 新手引导（开热点 / 加房间）
│       ├── history/HistoryView.vue  # 本地战绩页
│       └── settings/SettingsView.vue # 设置页（v3.7+，音效 / 动画 / 头像）
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

测试全是 **Node 原生 assert / console.log**，没用测试框架，简单直接。**v0.4.16 收官：38 套件 / 1889 case 全过。**

| 命令 | 测试范围 | 用例数 |
|---|---|---|
| `npm run test:engine` | 规则引擎：牌组 / 牌型识别 / 大小比较 / 升级 / 进贡 / 种子发牌 / groupHandByRank | 109 |
| `npm run test:ai` | AI：领出 / 跟牌 / 鬼牌凑牌 / 炸弹 / 接风 / autoPlayGrouped | 68 |
| `npm run test:game` | 对局状态机：发牌 / 出牌 / 非法牌型 / 首家 pass / v3.8 P1 联机同步 / v2.1 P3 host 迁移 | 128 |
| `npm run test:anim` | 发牌动画 + 音效（deal-animation + audio,playSfxForType × 牌型 × count 全覆盖） | 13 + 135 |
| `npm run test:ws` | WebSocket server + 真机 transport 桥接 + parseHostAddress + joinRemoteRoom | 29 + 50 |
| `npm run test:rotation` | seat-rotation 4 selfSeat × 4 position 全覆盖（GameView.test.js） | 65 |
| `npm run test:kick` | 房主踢人 3 transport 对称实现 + self:kicked 事件 | 51 |
| `npm run test:room` | 房间 UI 字符串断言（room-ui + RoomView, v3.x 菱形 + 星空） | 60 + 11 |
| `npm test` | 全部 38 套件 | **1889 / 0 fail** (v0.4.16,含 v0412-adversarial-fixes 34 + v0414-adversarial-review 50 + v0.4.15 边缘防御 2 case + v0416-adversarial-fixes 30 case) |

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
  migrateHost(oldHostSeat, newHostSeat) → bool  // v2.1 P3：座位重映射 + currentPlayer / lastPlay.who / trickHistory 修正 + 清理 aiPlayers
}
```

### `network.js`
```js
// 事件总线 + 状态
on(event, handler) / off(event, handler) / emit(event, data)  // 事件总线
close()
isHost / isConnected / getSelfInfo() / getPeers()
getRoomId() / setRoomId() / getSelfSeat() / setSelfSeat()
startAsHost(roomId)  / joinRoom(hostIp, roomId)             // v1.0：兼容房间号 / hostIp:hostPort
send(seat, msg) / broadcast(msg) / sendTo(seat, msg)
scanLanRooms() → Promise<{ ip, name }[]>

// v2.0+ 跨设备 / 真机
joinRemoteRoom(hostAddress, selfInfo) → Promise            // v2.2：hostAddress = "IP:port" 解析 + 创建 WS client
parseHostAddress(hostAddress) → { host, port }             // v2.2：纯函数，支持 IPv4 / IPv6 / 默认端口
// v2.1 forceDisconnectSeat(seat) 在 transport 层(见 network-transport-ws.js / network-transport-android-ws.js / network-transport-bc.js)

// v2.1 Host 迁移
requestHostMigration() → { newHost, reason }              // v2.1 P3：自动选下一候选 host
selectNextHostCandidate() → number                         // v2.1 P3：座位优先级 2>1>3，纯函数

// v2.1 测试 hook（仅测试环境挂载，生产构建 tree-shake 掉）
__installFakeTimers(opts)                                  // 注入假定时器，替换 setInterval/clearInterval；测试用 mod.__installFakeTimers({ ... })
```

**事件名**：
- `peer:join` / `peer:leave` / `peer:update`
- `game:start` / `game:play` / `game:pass` / `game:trick_end` / `game:level_up`
- `chat:msg`
- `host:migration:request` / `host:migration:announce` / `host:migrated`  // v2.1 P3 host 迁移
- `self:kicked`                                                // v2.1：被踢 joiner 立即跳页
- `connection:heartbeat_tick`                                 // v2.1 心跳内部（debug 用，生产一般不订阅）

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
5. **AI 三档难度（easy / medium / hard）**（规则 + 贪心搜索，**非**深度学习；v0.4.9 加 hard 难度——防守优先 + 炸弹保留）
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

## 已修的 v1.0 限制（v2.0 - v2.3 收官）

- ~~网络层是浏览器版实现（BroadcastChannel），真机跨设备无法联机~~ → **v2.0 接 AndroidWsTransport（真机 host）+ v2.2 WebSocketTransport 客户端 WS，跨设备 2 真机 + 2 浏览器实测可联**
- ~~没有原生 APK / IPA 构建配置~~ → **v2.0 Capacitor + `android/app/build/outputs/apk/debug/app-debug.apk` 真机调试包**
- ~~心跳太松（10s）掉线感知慢~~ → **v2.1 调到 HEARTBEAT_INTERVAL_MS=2000 / CHECK_INTERVAL_MS=2000 / TIMEOUT_MS=6000，6-8s 释放窗口（精确性测试断言 6.5s 触发释放）**
- ~~4-tab 联机不稳（随机种子手牌不一致 / __installFakeTimers 没暴露 / rotation 公式耦合 GameView）~~ → **v2.0 种子发牌 + v2.1 __installFakeTimers hook + v2.1 seat-rotation.js 抽出纯函数 + GameView.test.js 56 case 覆盖**
- ~~QR 库失败没兜底~~ → **v2.2 QrFallbackCard.vue + qr-fallback.js 纯函数（36 case 测 formatHostAddress / buildJoinUrl / shouldShowFallback / describeFallbackMode / clipboardPayload）**
- ~~BUG-7 host self-broadcast 导致 ai:takeover 误触发~~ → **v2.1 transport onMessage 路径加 host 自屏蔽 + ai:takeover 触发次数限制**

## 真没做（v4.0+ 候选）

- 录像回放——对局过程没存盘
- iOS 脚手架——只有 Android（Capacitor 配了 ios/ 但未跑过 `cap add ios`）
- 弱网 / 隧道 / 高铁 压测数据——只在高速局域网 + WiFi 测过

### v0.4.10 已落地

- ✅ 移动端响应式（GameView 桌面 1280×800 → 手机竖屏 + 横屏双布局,`GameViewMobile.vue` 1333 行,横屏 .is-landscape 兜底）

### v0.4.14 已落地

- ✅ v0.4.12 对抗性复查 6 项 V0412 bug 修复(V0412-02 migrateHost abandonedSeats 不 push 0(避免 nextTurn 跳过新 host);V0412-03 scheduleAI pass 分支 + aiBroadcast('PASS');V0412-04 _applySnapshot 应用 isRestartAfterA/previousLevelRank/lastAppliedRoundId + state 预声明;V0412-05/07 新增 game.getSnapshot() 深拷贝完整 snapshot,useGameLogic.onPeerLeave 委托;V0412-06 onNext P2P 非 host 不动 phase ref)——`v0414-adversarial-review.test.js` 50 case
- ✅ V0412-01 误报验证:requestPromoteToHost 已在 network.js line 1321 实现 + export,审稿人 GitHub 网页检索漏掉
- ✅ 同步修测试:v047-rc2-regression 5 个 case 断言反向(旧行为"seat 0 在 abandonedSeats" → 新行为"seat 0 NOT in abandonedSeats")

### v0.4.13 已落地

- ✅ v0.4.12 对抗性审查 8 项 P0/P1/P2 bug 修复(network.js `canBroadcast()` + `broadcastPeerLeave()` + `close({broadcast})` 主动 close 广播 PEER_LEAVE;guandan-game.js `createGame.destroy()` 清 _aiTimer/handlers/aiPlayers;useGameLogic `onP2PStateSnapshot` 走 `refreshUiFromGameState` 单一来源;`migrateHost` 末尾 emit 'turn';`onP2PRoundEnd` roundId 去重;`onP2PPeerJoin` 走 `applyNetworkPlayers` 单一路径;`onP2PPlay` ts 去重 Set + `applyPlay` 防御 cards-not-found)——`v0412-adversarial-fixes.test.js` 34 case

### v0.4.12 已落地

- ✅ v0.4.11 修复的 P2P 端到端回归测试 56 case 补充(ROUND_END host-only 行为模拟 / applyRoundEndFromPayload 幂等 / MATCH_RESTART sender authority + phase gate + restartId dedup / 同 seed restartMatch 一致性 / afterMatchRestartRefresh 副作用 / applySettingsToAudio 同步 6 项 / scheduleAI difficulty / SettingsView 版本号)——`v0410-p2p-regression.test.js`

### v0.4.11 已落地

- ✅ v0.4.10 静态审查 8 bug 修复(V0410-01 ROUND_END host-only / V0410-02 过 A 落盘 / V0410-03 MATCH_RESTART 鉴权去重 / V0410-04 host UI refresh / V0410-05 音效 unlock 清理 / V0410-06 bgmStyle+sfxMode / V0410-07 scheduleAI difficulty / V0410-08 版本号动态化)——`v0410-bug-fixes.test.js` 40 case

### v0.4.10 已落地

- ✅ v0.4.9 静态审查 9 bug 修复(V049-01 onHintToggle `diff` / V049-02 isRestartAfterA 贯通 / V049-03 MATCH_RESTART seed / V049-04 relay 白名单 / V049-05 真实音效 fallback / V049-06 setSettings 合并当前值 / V049-09 IP/port 校验)——`v049-bug-fixes.test.js` 66 case

### v0.4.9 已落地

- ✅ AI 难度分档（Easy / Medium / Hard）——`59be6f2` + AIView 接入
- ✅ 玩家统计 / 战绩趋势图——`daa06ca` + HistoryChart 升级
- ✅ 二维码真扫码加入——`6cec587` + html5-qrcode 集成

## Agent 团队（本仓库专属）

Mavis 多 agent 团队配置在 `.harness/`：

- `coder`（global）—— 写代码
- `verifier`（global）—— 跑测试 / 验证
- `users-yangyuanhao-downloads-guandan-p2p-vue3--pm`（项目 rein）—— 提需求 / 拆解 / 反馈
- `mavis`（orchestrator）—— 路由

## Owner 工作流偏好（2026-06-07 基线）

- **bug 自动修**：verifier 找出的 bug 100% 自动按反馈修，不要每条都问 user
- **plan 配置**：`auto_reject_retries: 2-3`（verifier FAIL 自动 retry），`plan_complete: true` 由 owner 主动控制
- **新功能**：用 mavis team plan 跑，不要单 worker 单打
- **producer prompt 模板**：显式写明 "verifier FAIL 时按反馈直接修，不要问 user"

## Owner 实战教训（2026-06-08+，v2.x 收官刷新）

### Worker scope drift 教训（v2.1 4-tab E2E）

- 拿到"4-tab E2E"任务的 worker 容易自己往 5-tab 加 dev hook（超范围）
- **producer prompt 显式写边界**：4-tab / 不加 hook / 不重写 rotation 公式
- verifier FAIL 直接 retry，不要先问 user

### 优化路径破坏既有 fix（v2.0 P0 sendToClient 教训）

- 优化"立即清理 host state"听起来对，但会破 v2.0 P0 修复（host state 死锁）
- **producer prompt 显式写保护边界**：遵守 v2.0 P0 保护 / 不动 `_handleDisconnect` 立即清 host state
- 既有 fix 的 invariant 要先 grep git log 找出来

### Task spec vs 项目约定的偏差（v2.2 t1-qr-fallback 教训）

- spec 写 `src/components/QrFallbackCard.test.js`，但项目已有 `GameView.test.js + seat-rotation.js` 放 `src/common/` 的模式
- worker 给 3 条理由接受偏差：
  1. 项目约定统一
  2. 避免 vue-test-utils + jsdom 100+ MB dev dep tree
  3. 36 case 远超 spec 4-6 case，测试覆盖更细
- **verifier 接受偏差**：但要在 deliverable.md 写清楚（a）新增什么（b）production 影响 0（c）如何还原

### 边界保护（v2.1 host 迁移教训）

- "立即"反应（立即清 peers / 立即跳页）经常会和"延迟"机制（心跳释放窗口）打架
- 正确做法：立即反应只走**新事件**或**UI 层 reactive state**，不动底层 state machine
- 让既有 fix 的计时器自然触发释放，状态变更解耦

### 测试时间预算（v2.2 cross-device + kick 教训）

- 跨实例 mock BC 测试加 2-3s 到 npm test（35 套件 1837 case 总耗时 ~12s 还能接受）
- 不要无脑加 mock 跨实例测试，先看现有 mock 是否够用
- 真 BroadcastChannel 跨实例需要 `globalThis.BroadcastChannel` 注入 + dynamic-import cache-bust (`?tag=xxx&t=Date.now()`)

### 多文档同步必须靠 board（v2.3 release 教训）

- v2.3 同时改 README / CHANGELOG / TROUBLESHOOTING / AGENTS.md / BUILD.md
- 每个 worker 只看自己 task spec 容易漏：实际项目状态 vs 文档状态
- **解决**：每个 task 跑完先在 board.md 写"+XX/-YY 行，commit XXXX"，后续 worker 校对当前状态

## 出问题先看

1. `TROUBLESHOOTING.md` —— 80% 的常见问题都在
2. `npm test` 输出 —— 基础功能有没有坏
3. 浏览器 F12 控制台 —— 前端错误
4. 终端输出 —— Vite / Node 错误

**仍然卡住？** 把"做了什么 + 期望什么 + 实际得到什么 + 完整报错"打包给开发者。
