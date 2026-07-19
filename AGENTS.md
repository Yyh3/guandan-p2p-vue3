# AGENTS.md

> 掼蛋 P2P 局域网版 —— AI agent / coding 工具的协作入口
>
> 任何 AI agent 接手本项目前**先读这个文件**，能少走 90% 的弯路。

## 当前任务记录

- 2026-07-17：完成 v0.4.24 四路并行对抗性审查修复 + UI/HCI 改进（细节见 git log `HEAD`）：
  - 3 个 P0：GameViewDesktop 补 `import * as haptics`（菜单/退出全灭）；host 主动退出迁移改 `game.getSnapshot()` + `net.close({broadcast,newHostSeat,newHostAddress})`（一退全房解散）；JoinView `parseHostAddress` 默认导出 + `{hostIp,hostPort}` 解构（真机加房全灭，network.js 迁移路径同源修复）。
  - P1 对局：`'play'` 数字 type 统一映射牌型名（炸弹特效/语音/音效复活）；`scheduleAI` 仅 host + 兜底 pass；AI 鬼牌不压 rank17；`dealTimeout` 导出 + 快照清理；超时自动行动 `findMinBeat`/`commitPass`；`_broadcastPerSeatDeal` 遍历 0..3 跳过自己；URL `firstSeat` 只消费一次；`getSnapshot()` 重算 `handCounts`。
  - P1 网络/房间：`smartReconnectToPeers` 三重修复；`_DISCONNECT` 读 `payload.seat`；`SEAT_SWAP_REQUEST` 先广播后应用；`ROOM_FULL` 走 `sendToConnection`；`RELAY_TYPES` 加 `CHAT_QUICK`；GAME_START 跳转带 `host`；RoomView 监听 `host:lost` + 加入 8s 超时 + 满房提示。
  - UI/HCI：战绩 `computeSummary` 逐条 `rec.mySeat`；HistoryChart 补 `barGroupLabelX`；HudTop 删死按钮/假 25s；桌面 Esc/去假金币/聊天常显；移动端长按吞合成 click；`CHAT_QUICK` 跨端聊天；InviteDialog 复制兜底；GuideView 文案重写；三页面补返回按钮；SettingsView `aria-expanded` 动态化。
  - 测试：新增 `v0424-game-fixes`（40）/ `v0424-gameview-fixes`（45）/ `v0424-room-join-fixes`（56）并注册；`network.test.js` 3 条、`history.test.js` 2 条断言按新正确行为反转。
  - 测试基线：`npm test` 59 套件 / 2106 case 全绿；`npm run build` 成功。
  - 暂缓（`tmp/v0424-progress.md`）：Android Java 侧 ROOM_PROBE 应答、uuid 复用 seat 防冒名、BC 模式伪造防线、mDNS playerCount、Windows 热点网段 192.168.137.x。

> 更早的任务记录已精简移除，历史变更见 `git log` 与 `docs/CHANGELOG.md`。

## 项目说明

离线局域网 4 人掼蛋游戏，专为高铁 / 隧道 / 野外无公网场景设计。一人开热点（无需流量），4 人连热点后秒开对局，全程无网、无流量、不卡顿、规则正版。

**核心约束（必读）**：
- 零公网依赖：无后端 / 域名 / 登录 / 房卡 / 数据库
- 纯局域网 P2P：所有对局数据仅在 4 台设备间传输
- 纯净绿色：无广告 / 充值 / 内购 / 分享 / 排行榜 / 用户注册
- 双模式：4 人局域网联机 + 本地单机 AI 人机

详细功能见 `README.md` / `BUILD.md` / `TROUBLESHOOTING.md`。

## Setup commands

```bash
npm install          # 装依赖
npm run dev          # 开发服务器（http://localhost:8848）
npm test             # 全部测试（59 套件 / 2106 case，v0.4.24 基线）
npm run test:engine  # 单套：规则引擎（另有 test:ai / test:game / test:anim / test:ws / test:rotation / test:kick / test:room）
npm run bench        # 性能基准
npm run build        # 生产构建（产物在 dist/）
npm run e2e          # Playwright E2E
```

## Project layout

```
guandan-p2p-vue3/
├── AGENTS.md / README.md / BUILD.md / TROUBLESHOOTING.md
├── package.json / vite.config.js / capacitor.config.json / index.html
├── src/
│   ├── main.js / App.vue / benchmark.js
│   ├── common/                 # 核心模块（纯 JS, 无 Vue 依赖）+ 全部 Node assert 单测
│   │   ├── guandan-engine.js        # 规则引擎（牌型识别 / 比较 / 升级 / 进贡）
│   │   ├── guandan-ai.js            # AI 出牌（规则 + 贪心；运行时动态导入,独立分包）
│   │   ├── guandan-game.js          # 对局状态机（deal/play/结算/host 迁移/snapshot）
│   │   ├── network.js               # P2P 网络抽象（事件总线 / 路由 / 迁移 / 发现）
│   │   ├── network-transport-bc.js  # BC transport（仅本机多标签 / dev）
│   │   ├── network-transport-ws.js  # WebSocket transport（跨设备 + 浏览器）
│   │   ├── network-transport-android-ws.js  # AndroidWsTransport（真机）
│   │   └── ws-server.js / qr-fallback.js / seat-rotation.js / deal-animation.js
│   │       / audio.js / storage.js / effects.js / history.js / dialog-bus.js / haptics.js
│   ├── components/             # Vue SFC（CardPlay / HudTop / PlayerSeat / TableCenter
│   │                           #   / MainActions / ChatQuickPanel / icons/ 等）
│   └── views/                  # 8 个路由页：index / room / join / game / ai / guide / history / settings
└── .harness/                   # Mavis 多 agent 团队配置（不影响运行）
```

## Code style

- **模块系统**：ESM（`import` / `export`），**不要用 `require` / `module.exports`**（`"type": "module"`）。
- **路径别名**：`@/` → `src/`。`import X from '@/common/storage.js'`。
- **命名**：文件 `kebab-case.js` / `PascalCase.vue`；函数 `camelCase`；常量 `UPPER_SNAKE`；类 `PascalCase`。
- **注释**：公共函数 1 行说明 + 参数 / 返回值标注。
- **行宽** 100 软限制；**缩进** 2 空格；**Vue 3** 统一 `<script setup>`；**导入顺序**：第三方 → `@/` → 相对路径。

## Testing instructions

测试全是 **Node 原生 assert / console.log**，没用测试框架。**基线：59 套件 / 2106 case 全绿（v0.4.24）。**

**测试文件规范**：
- 文件名 `<name>.test.js`，与被测文件同目录；顶部 `import * as X from './<name>.js'`
- `eq(name, actual, expected)` 比 JSON，`assert(name, cond)` 验布尔；块间 `console.log('\n=== N. 块名 ===')` 分隔
- 末尾打印 `========== 测试结果: X 通过 / Y 失败 ==========`；fail > 0 时 `process.exit(1)`
- **新套件必须注册进 `scripts/run-all-tests.js`**，否则 `npm test` 不会跑
- 涉及 `createGame` 的套件退出前调 `destroy()`，避免 AI timer 导致 Node 挂起
- 行为可测的写行为测试，UI/视图类用源码字符串断言（读文件断言关键代码，参照 `v0424-*.test.js`）

**改算法 / 加功能时必须加测试**——没测试的代码不能合。

## 核心模块契约

> 改 `common/` 时**严格遵守**这些接口，外部 `.vue` 都依赖它们。

### `guandan-engine.js`
```js
SUIT_NAMES, RANK_NAMES, TYPE, TYPE_ORDER, LEVEL_SEQUENCE
createDeck() → Card[108]   shuffle(deck) → Card[]   sortHand(hand) → Card[]
deal(seed?) → { hands: Card[4][27], deck }
countByRank(hand) → Map
recognize(cards, ghostRank?) → { type, mainRank, length, kicker } | null
canBeat(prev, curr, ghostRank?) → bool
splitGhosts(cards, ghostRank) → { ghosts, real }
canFormWithGhosts(hand, type, mainRank, length, ghostRank) → bool
calcLevelUp(ranks, winner) → number   getLevelRank(cur, upN) → number
tributeInfo(result) → { from, to, doubleTribute }
```

**卡牌数据**：`{ suit: 0|1|2|3, rank: 3..15 }`（黑/红/梅/方）；`{ suit: -1, rank: 16|17 }`（小王/大王）。

**牌型 TYPE（数字枚举）**：SINGLE / PAIR / TRIPLE / TRIPLE_PAIR / STRAIGHT / STRAIGHT_PAIR / STRAIGHT_TRIPLE / BOMB_4 / BOMB_5 / BOMB_6+ / STRAIGHT_FLUSH / JOKER_BOMB。**注意：type 是数字不是字符串**，UI/音效层比较前先映射名字（v0.4.24 教训）。

### `guandan-ai.js`
```js
decide(hand, lastPlay, levelRank, ctx, difficulty) → { type:'play', cards } | { type:'pass' }
findMinBeat(hand, target, ghostCount, levelRank) → Card[] | null
chooseLead(hand, ghostRank) → Card[]
TYPE_VALUE
```

### `guandan-game.js`
```js
createGame({ seats, levelRank, isHost, selfSeat, aiPlayers, seed, difficulty }) → {
  on/off/emit, getState(), getSnapshot(forSeat?),   // snapshot 深拷贝,handCounts 实时重算
  deal(seed?, firstSeat?, dealData?), playerPlay(seat, cards), playerPass(seat),
  applyPlay/applyPass/applyRoundEnd/applySnapshot,   // P2P 无校验同步接口
  promoteToHost(authoritativeState) → { ok, error? },  // 缺 hands/handCounts 拒绝
  migrateHost(old, new), restartMatch({ levelRank, seed }?), nextRound(),
  setAIBroadcast(fn), destroy(),                     // destroy 清 AI timer/handlers
}
// state.phase: 'idle' | 'dealing' | 'playing' | 'finished'
```

### `network.js`
```js
on/off/emit   close(opts?)   leaveRoom()            // leaveRoom: joiner 优雅离开(LEAVE_REQUEST)
isHost() / isConnected() / getSelfInfo() / getPeers()
getRoomId() / setRoomId() / getSelfSeat() / setSelfSeat() / getHostSeat()
startAsHost(roomId)   joinRoom(hostIp, roomId)
joinRemoteRoom(hostAddress, selfInfo, roomNo?)      // 跨设备 WS client
parseHostAddress(hostAddress) → { hostIp, hostPort }  // ★ 不是 {host,port},解构错即 TypeError
send(seat, msg) / broadcast(msg) / sendTo(seat, msg)
scanLanRooms() → Promise<Room[]>                    // HTTP /room-info + WS ROOM_PROBE
requestHostMigration(newHostSeat, snapshot)         // 三阶段 ACK 握手
isAuthorityMessage(msg)                             // hostEpoch 权威校验
smartReconnectToPeers(opts)                         // host 掉线后按缓存 hostAddress 重连
__installFakeTimers(opts)                           // 测试 hook(生产 tree-shake)
```

**事件名**：`peer:join` / `peer:leave` / `peer:update` / `self:kicked` / `host:lost` / `ai:takeover` / `chat:msg` / `host:migrated` / `message:<TYPE>`（如 `message:SYNC` / `message:CHAT_QUICK`）。

### `storage.js`
```js
getNickname() / setNickname(name)   getAvatar() / setAvatar(dataUrl)
getSettings() / setSettings(obj)    getHistory() / addHistory(record) / clearHistory()
```

## 6 个用户已确认的产品决策

> 改产品逻辑前**先回看这 6 条**，避免推翻之前的决定。

1. **换座 = 只跟队友（对家）换**（不能随便换座位）
2. **昵称 + 头像可自设**（自己挑，不强制随机）
3. **改昵称后其他玩家实时看到**（本地存 + P2P 广播）
4. **对局中禁止改名**（防作弊）
5. **AI 难度 medium / hard**（规则 + 贪心搜索，**非**深度学习；hard = 防守优先 + 炸弹保留）
6. **纯自实现**（不借鉴任何已有掼蛋项目，版权干净）

## 修改 / 扩展约定

- 改规则引擎 / AI：必须加测试（`guandan-engine.test.js` / `guandan-ai.test.js`），对应套件全绿再 commit
- 加新页面：`src/views/<name>/<Name>View.vue` + `src/main.js` 注册路由
- 加新事件：`network.js` 加 emit + 文档化事件名；需 relay 的类型加进 `RELAY_TYPES`
- 改 `package.json` 依赖：先确认 npm 包协议（避免 GPL 污染版权）

## PR & commit conventions

- 分支名 `<type>/<short-desc>`；Commit message Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`）
- 提交前：`npm test` + `npm run build` 双绿；描述写「why」不写「what」

## Security

- 永不提交 secrets / keystore / 证书（`.gitignore` **不**默认排除 `*.keystore` / `*.jks` / `*.p12` / `.env*`——手动加）
- 不引入联网依赖（axios / 第三方 CDN / 字体 CDN）——破坏离线原则
- 不收集用户数据 / 不上报埋点；localStorage 只存本机数据

## 真没做（v4.0+ 候选）

- iOS 脚手架——只有 Android（Capacitor 配了 ios/ 但未跑过 `cap add ios`）
- 弱网 / 隧道 / 高铁真实场景压测数据——只有模拟弱网单测（`network-weaknet.test.js`）

## Agent 团队与 Owner 偏好

Mavis 多 agent 团队配置在 `.harness/`（coder / verifier / pm / mavis orchestrator）。

- **bug 自动修**：verifier 找出的 bug 直接按反馈修，不要每条都问 user
- **新功能**：用 mavis team plan 跑；producer prompt 显式写边界与保护范围（防 scope drift、防优化破坏既有 fix）
- **既有 fix 的 invariant 先 grep git log 再找**：「立即」动作常和「延迟」机制（心跳窗口等）打架，立即反应只走新事件 / UI 层 reactive state
- **多文档同步靠 board**：跨 README / CHANGELOG / AGENTS.md 的改动，task 跑完先记 board 再继续

## 出问题先看

1. `TROUBLESHOOTING.md` —— 80% 的常见问题都在
2. `npm test` 输出 —— 基础功能有没有坏
3. 浏览器 F12 控制台 —— 前端错误
4. 终端输出 —— Vite / Node 错误

**仍然卡住？** 把"做了什么 + 期望什么 + 实际得到什么 + 完整报错"打包给开发者。
