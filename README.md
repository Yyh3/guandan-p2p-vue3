# 掼蛋 P2P 局域网版 — Vue 3 + Vite 版

> 离线 4 人联机掼蛋。一人开热点(无流量),4 人连上即玩。零公网、零账号、零广告、纯绿色。

---

## 一、一句话定义

**掼蛋(Guandan)是中国 4 人 2v2 扑克游戏**(类似升级+跑的快)。这个仓库是它的局域网 P2P 实现,Vue 3 + Vite 工程化,核心算法 100% 自实现。

**为什么离线**:
- 高铁 / 隧道 / 野外 / 飞机,常无公网
- 一人开热点 → 4 人秒连 → 一局 5-15 分钟
- 零流量 / 零卡顿 / 规则正版 / 不会被封号

---

## 二、3 步启动

```bash
# 1. 装依赖(0.5-1 min)
npm install

# 2. 启动开发服务器
npm run dev
# 浏览器自动打开 http://localhost:8848

# 3. 跑测试(可选,验证环境)
npm test
# 期望: 862 用例 / 0 失败
```

**4 标签联机测试**:
1. 标签 1:首页 → 「开热点建房」→ 拿到 6 位房间号
2. 标签 2-4:首页 → 「连热点加入」→ 输入房间号
3. 4 标签都点「准备」→ 房主点「开局」→ 进对局

---

## 三、核心特性

### 3.1 已完成(v0.4.0 / v3.x,2026-06-27)

- ✅ **完整掼蛋规则**:14 种牌型 + 逢人配(红桃级牌万能)+ 升级 + 进贡
- ✅ **AI 单机对战**:3 个 AI + 1 个玩家,中等难度
- ✅ **局域网 P2P 联机**:同浏览器 4 标签可联(BroadcastChannel 开发态)
- ✅ **真机跨设备联机**:AndroidWs 真机 host + 浏览器/真机 joiner 通过 WebSocket 加入(2 真机 + 2 浏览器 tab 已验证)
- ✅ **房主控制**:host 主动踢人(`self:kicked` Toast 跳页)+ host 崩溃后对家自动迁移
- ✅ **心跳 6-8s 精确释放**:掉线判定 2s/2s/6s 三段退避,目标 6-8s 窗口,AI 接管兜底
- ✅ **QR 兜底卡片**:扫码失败降级到 IP+端口文本,可手输
- ✅ **Capacitor Android APK 打包**:debug APK 4MB / production 6-8MB(详见 `BUILD.md`)
- ✅ **v3.x UI 重做(本版本)**:5 阶段全落地
  - tokens.css 扩展:翡翠绿 / 金 / 星空深蓝 40+ 新 token
  - CardPlay 重做:60×84 桌面 + 48×68 移动,金边奶油白 + 红色传统牌背
  - HomeView 重做:玻璃拟态 4 按钮 + 翡翠渐变
  - RoomView 重做:4 菱形座位 + 深蓝星空 + 玻璃面板
  - GameView Desktop+Mobile:椭圆 felt 桌面 + 木纹边 + 径向白光聚光
  - HudTop 加级别徽章(金)+ 房间号显示
- ✅ **JDK 21 环境**:Capacitor 8 / AGP 8.13 要求,`brew install openjdk@21` 已配 `JAVA_HOME`
- ✅ **零公网依赖**:无后端 / 无 fetch / 无远程字体 / 无 CDN
- ✅ **零第三方 UI 库**:Vue 3 + 原生 CSS + 自写设计 token
- ✅ **零账号系统**:本地 localStorage 存昵称 / 头像 / 设置 / 战绩
- ✅ **完整工程化**:1222 单元测试(v0.4.0 的 862 → 1222,+360 用例,BUG-001~008 修复贡献 +221)+ Chrome CDP 4-tab 联机回归
- ✅ **零依赖运行时**:核心算法 100% 自实现(`src/common/` 纯 JS,无 Vue 依赖)
- ✅ **P2P 同步修复 v0.4.x(2026-06-27)**:BUG-001~008 共 8 个 P2P 联机连环 bug 已修复,详见 §3.3 / §3.4

### 3.2 v0.4.0 后待办(等 v4.0+)

- ❌ **AI 难度分档**:当前只有中等难度(规则 + 贪心),Easy / Hard 暂未实现
- ❌ **录像回放**:一局打完后无法回看每手牌决策路径
- ❌ **iOS 脚手架**:Capacitor iOS 工程未建,Mac + Xcode 走一遍
- ❌ **多语言**:当前中文 UI 硬编码,英文/繁体未抽 i18n
- ❌ **救火 commit 单独 verifier**:v3.x 阶段 3 + 阶段 4 是 owner 救火 commit,verifier 未单独跑,final-integration 间接验证已通过

### 3.3 v0.4.x P2P 同步修复记录 (8 BUG,2026-06-27)

v3.8 / v2.x 收官后实地复测发现,4-tab 联机 + 跨设备联机仍有 8 个连环 bug。全部已修,每个修复都加了专项回归测试(见 §3.4 测试矩阵)。

| BUG | commit | 修复概要 |
|-----|--------|----------|
| BUG-001 | `f4113e4` | `network.js` host relay joiner 消息给其它 joiner(WS 星型拓扑) |
| BUG-002 | `ed3b33c` | `useGameLogic.js` `finishDeal` 按 `selfSeat` 取手牌(joiner 不再拿到 host 的牌) |
| BUG-003 | `23b6ee3` | `useGameLogic.js` `commitPlay`/`commitPass` 统一广播(自动出牌路径全覆盖) |
| BUG-004 | `fa9f45e` | `RoomView.vue` 退出房间清理监听器 + 关闭网络(防止进退房间 5 次后内存泄漏) |
| BUG-005 | `c90457d` | `network-transport-bc.js` 传 `roomId` 构造独立 channel name(房间号隔离) |
| BUG-006 | `2267191` | `network.js` `swapSeats` 网络层权威(RoomView 不再绕过直接改本地 state) |
| BUG-007 | `3070ed2` | `network.js` 统一踢人协议 `KICKED` + 立即 peer 删除(不等心跳超时) |
| BUG-008 | (本 commit) | `README.md` / `CHANGELOG.md` 同步 v0.4.x 修复记录 + 5 套回归测试矩阵 |

### 3.4 测试矩阵 (v0.4.x P2P 同步覆盖)

| # | 场景 | 范围 | 测试套件 | 用例 | 状态 |
|---|------|------|----------|------|------|
| 1 | WS host relay | 4 client BC 模拟,seat 1 发 PLAY → seat 2/3 都收到且 `from === 1` | `src/common/network-relay.test.js` | 25 | ✅ 通过 |
| 2 | selfSeat 手牌 | 4 client 同 seed,`myHand === sortGrouped(hands[selfSeat])` | `src/views/game/finish-deal-seat.test.js` | 48 | ✅ 通过 |
| 3 | commitPlay 广播 | seat 1 触发 `onAutoFindBest` → 其它端 `game.getState().lastPlay.who === 1` | `src/views/game/commit-play-broadcast.test.js` | 32 | ✅ 通过 |
| 4 | 退出房间清理 | 反复进退 5 轮,`listenerCount === 0` + `isClosed === true` | `src/common/network-cleanup.test.js` | 80 | ✅ 通过 |
| 5 | BC roomId 隔离 | 2 host(111111 / 222222),joiner 错号不能连,对号只连对应 host | `src/common/network-roomid.test.js` | 36 | ✅ 通过 |
| 6 | **端到端 4 真机** | 1 真机 host + 1 真机 joiner + 2 浏览器 tab(v2.2,2026-06-13) | 实地联机 + 截图存档 | — | ✅ 已通过(v0.3.0) |
| 7 | **端到端 4-tab** | Chrome CDP 4-tab 局域网联机 demo(v3.8,2026-06-10) | Playwright E2E + 截图 | — | ✅ 已通过(v0.2.0) |

**小计**:**22 测试套件 / 1222 用例 / 0 失败**(v0.4.0 的 862 → 1222,+360 用例)

---

## 四、目录结构

```
guandan-p2p-vue3/
├── README.md                # ← 你正在读
├── AGENTS.md                # AI agent 入口(必读)
├── BUILD.md                 # 打包 / 部署教程
├── TROUBLESHOOTING.md       # 排错指南
├── CHANGELOG.md             # 版本变更(在 docs/)
│
├── docs/                    # 详细文档
│   ├── ARCHITECTURE.md      # 系统架构 ⭐
│   ├── ENGINE.md            # 规则引擎
│   ├── AI.md                # AI 决策
│   ├── NETWORK.md           # 网络层
│   ├── UI.md                # UI 系统
│   ├── TESTING.md           # 测试规范
│   ├── STYLE.md             # 代码风格
│   ├── HOWTO-EXTEND.md      # 扩展指南 ⭐
│   ├── ROADMAP.md           # 路线图
│   └── CHANGELOG.md         # 更新日志
│
├── package.json             # npm 配置(零依赖:Vue 3 + Vite)
├── vite.config.js           # Vite 配置(端口 8848)
├── index.html               # HTML 入口
│
├── src/
│   ├── main.js              # Vue 应用入口 + 路由
│   ├── App.vue              # 根组件
│   ├── benchmark.js         # 性能基准
│   ├── styles/
│   │   └── tokens.css       # 设计 token(色/间距/阴影/动效)
│   ├── common/              # ⭐ 核心模块(纯 JS,无 Vue 依赖)
│   │   ├── guandan-engine.js   # 规则引擎(牌型识别/比较/升级)
│   │   ├── guandan-engine.test.js
│   │   ├── guandan-ai.js       # AI 出牌(规则+贪心)
│   │   ├── guandan-ai.test.js
│   │   ├── guandan-game.js     # 对局状态机
│   │   ├── guandan-game.test.js
│   │   ├── audio.js            # 音效 + BGM(Web Audio API)
│   │   ├── audio.test.js
│   │   ├── deal-animation.js   # 发牌动画
│   │   ├── deal-animation.test.js
│   │   ├── card-api.js         # 卡牌数据 API
│   │   ├── card-api.test.js
│   │   ├── effects.js          # 视觉特效
│   │   ├── network.js          # P2P 网络(BC / WS / AndroidWs 三 transport)
│   │   ├── network-transport-bc.js       # 浏览器开发态 transport
│   │   ├── network-transport-ws.js       # 浏览器↔真机 WS 客户端
│   │   ├── network-transport-android-ws.js # 真机 host transport
│   │   ├── ws-server.js        # 浏览器端 WsServer 桥(配合 Android plugin)
│   │   ├── qr-fallback.js      # QR 兜底卡片纯函数(formatHostAddress 等)
│   │   ├── seat-rotation.js    # 座位旋转纯函数(GameView 抽出)
│   │   ├── network.test.js / network-multitab.test.js
│   │   ├── network-kick-player.test.js  # 房主踢人单测
│   │   ├── network-cross-device.test.js # 跨设备联机单测
│   │   ├── ws-server.test.js   # WsServer 单测
│   │   ├── qr-fallback.test.js # QR 兜底纯函数单测
│   │   └── storage.js          # localStorage 封装
│   ├── components/          # Vue 组件
│   │   ├── HudTop.vue          # 顶部 HUD
│   │   ├── PlayerSeat.vue      # 玩家座位
│   │   ├── TableCenter.vue     # 中央牌桌
│   │   ├── CardPlay.vue        # 单张牌
│   │   ├── MainActions.vue     # 底部操作栏
│   │   ├── QuickActions.vue    # 右下快捷按钮
│   │   ├── CountdownClock.vue  # 倒计时
│   │   ├── EffectLayer.vue     # 全屏特效
│   │   ├── NicknameEditor.vue  # 昵称编辑器
│   │   ├── ChatQuickPanel.vue  # 快捷聊天
│   │   ├── PlayHintButton.vue  # 智能理牌
│   │   ├── QrFallbackCard.vue  # QR 兜底卡片(扫码失败降级 IP 文本)
│   │   └── HistoryChart.vue    # 战绩图表
│   └── views/               # 页面级组件
│       ├── index/HomeView.vue     # 首页
│       ├── room/RoomView.vue      # 房间页(host IP/QR/踢人)
│       ├── join/JoinView.vue      # 加入页(hostIp:hostPort)
│       ├── game/GameView.vue      # 对局页(1257 行,seat 旋转薄壳)
│       ├── game/GameView.test.js  # seat rotation 56 case 单测
│       ├── ai/AIView.vue          # AI 单机
│       ├── guide/GuideView.vue    # 新手引导
│       ├── history/HistoryView.vue# 战绩
│       └── settings/SettingsView.vue # 设置
│
└── .harness/                # Mavis 多 agent 团队配置(不影响运行)
```

---

## 五、文档地图(给新工程师)

| 你是... | 先读... |
|---------|---------|
| 接手项目的工程师 | **本 README** → `docs/ARCHITECTURE.md` |
| 改规则的工程师 | `docs/ENGINE.md` → `docs/TESTING.md` |
| 改 AI 的工程师 | `docs/AI.md` → `docs/TESTING.md` |
| 改 UI 的工程师 | `docs/UI.md` → `docs/STYLE.md` → `docs/UI-REDESIGN-V3-SPEC.md`(v3.x 5 阶段 spec) |
| 改联机的工程师 | `docs/NETWORK.md`(三 transport 抽象 + 跨设备流程 + 心跳调参) |
| 准备打 APK/IPA | `BUILD.md` |
| 遇到 bug | `TROUBLESHOOTING.md` |
| 想加新功能 | `docs/HOWTO-EXTEND.md` |
| AI agent 接手 | `AGENTS.md` |

---

## 六、常用命令

```bash
# 开发
npm run dev               # 起 Vite dev server(http://localhost:8848)
npm run build             # 生产构建(产物 dist/)
npm run preview           # 预览 dist/

# 测试
npm test                  # 全部 22 套件 / 1222 用例(v0.4.x 后)
npm run test:engine       # 规则引擎 109 用例
npm run test:ai           # AI 54 用例
npm run test:game         # 状态机 102 用例
npm run test:anim         # 发牌动画 + 音频 130 用例
npm run test:ws           # WsServer + 跨设备 79 用例(v2.0/v2.2)
npm run test:kick         # 房主踢人 51 用例(v2.1)
npm run test:rotation     # 座位旋转 + viewport + 发牌 65 用例(v2.1)
npm run test:room         # 房间 UI 71 用例(v3.x)
# v0.4.x P2P 同步修复新增套件
node src/common/network-relay.test.js         # WS host relay 25 case(BUG-001)
node src/views/game/finish-deal-seat.test.js  # selfSeat 手牌 48 case(BUG-002)
node src/views/game/commit-play-broadcast.test.js # commitPlay 广播 32 case(BUG-003)
node src/common/network-cleanup.test.js      # 退出房间清理 80 case(BUG-004)
node src/common/network-roomid.test.js       # BC roomId 隔离 36 case(BUG-005)

# 性能
npm run bench             # 跑性能基准
```

---

## 七、产品决策(已确定,改前看)

> 这 6 条都是 user 已经拍板的,改任何产品逻辑前先回看。

1. **换座 = 只跟队友(对家)换**(不能随便换座位)
2. **昵称 + 头像可自设**(自己挑,不强制随机)
3. **改昵称后其他玩家实时看到**(本地存 + P2P 广播)
4. **对局中禁止改名**(防作弊,v3.7 加)
5. **AI 中等难度**(规则 + 贪心搜索,**非**深度学习)
6. **纯自实现**(不借鉴任何已有掼蛋项目,版权干净)

---

## 八、设计原则

- **离线优先**:零公网、零账号、零流量、零广告
- **零依赖**:Vue 3 + Vite + 原生 CSS,无第三方 UI 库
- **核心独立**:`src/common/` 纯 JS,无 Vue 依赖,可单独在 Node 跑
- **测试覆盖**:862 单测(v0.3.0 的 701 + 161),改算法必加测试
- **设计 token 化**:`src/styles/tokens.css` 集中管理,改色改间距改这里
- **响应式?**:桌面 1280×800 固定布局,移动适配 v2.0

---

## 九、关键技术选择

| 决策 | 方案 | 为什么 |
|------|------|--------|
| 前端框架 | Vue 3 | 组合式 API + Vite 编译快 + Vue DevTools |
| 构建工具 | Vite | 极快冷启动 + 原生 ESM |
| 网络层(v1.0) | BroadcastChannel | 浏览器原生、零依赖,够开发/演示 |
| 网络层(v2.0) | WebSocket(浏览器原生 + AndroidWs plugin) | 跨设备,真机 host + 浏览器/真机 joiner |
| 网络层(v2.2) | `WebSocketTransport` 客户端(浏览器原生 ws) | 浏览器开 BC 模式可作 joiner,无需 Capacitor |
| 样式 | 原生 CSS + scoped + tokens | 零依赖,版权干净 |
| 测试 | Node 原生 assert + console.log | 零测试框架依赖 |
| 状态管理 | Vue ref + computed | 单页复杂状态,Pinia 过度 |
| 打包 | Capacitor (v2.0) | 跨平台,配置少 |
| 桌面/移动 | 仅 H5 优先 | 移动端 v2.0 |

---

## 十、版本与路线图

| 版本 | 状态 | 主题 |
|------|------|------|
| v1.0 | ✅ 完成 | 规则 + AI + 浏览器版联机 |
| v3.0-3.6 | ✅ 完成 | UI/UX 优化 |
| v3.7 | ✅ 完成 | 体验优化(报数/音效/快捷键/设置) |
| v3.8 | ✅ 完成 | 4-tab 局域网联机 P0+P1+P2 |
| v2.0 | ✅ 完成 | AndroidWs 真机 host + Capacitor 打包 + WsServerPlugin |
| v2.1 | ✅ 完成 | 心跳调参 + 4-tab 健壮性 + 房主踢人 + host 迁移 |
| v2.2 | ✅ 完成 | QR 兜底 + 跨设备联机(2 真机 + 2 浏览器) |
| v3.x | ✅ 完成 | 5 阶段 UI 重做(翡翠绿 + 金 + 深蓝星空),tokens + 4 屏重做 |
| v0.3.0 | ✅ 完成 | v2.x 三里程碑收官,701/0 单测 |
| v0.4.0 | ✅ 完成 | v3.x UI 重做收官,16 套件 / 862/0 单测,JDK 21 |
| v0.4.x | ✅ 当前 | P2P 同步修复 8 BUG,22 套件 / 1222/0 单测(+360) |
| v4.0 | 💭 构思 | AI 三档难度 + 录像回放 + iOS 脚手架 |

详见 `docs/ROADMAP.md` / `docs/CHANGELOG.md`。

---

## 十一、贡献者公约

- 改 `common/` 必须有测试(`docs/TESTING.md`)
- 改 UI 用 Playwright 截图回归
- 改 token 跑全页面肉眼对比
- 提交前 `npm test` + `npm run build` 双绿
- Commit 走 Conventional Commits(`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`)
- 描述里写「why」不写「what」

---

## 十二、出问题先看

1. **`TROUBLESHOOTING.md`** — 80% 的常见问题都在
2. **`npm test` 输出** — 基础功能有没有坏
3. **浏览器 F12 控制台** — 前端错误
4. **终端输出** — Vite / Node 错误

**仍然卡住?** 把「做了什么 + 期望什么 + 实际得到什么 + 完整报错」打包给开发者。

---

## 十三、相关链接

- 项目入口:本文件
- AI agent 入口:[AGENTS.md](./AGENTS.md)
- 打包教程:[BUILD.md](./BUILD.md)
- 排错指南:[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- 详细文档:[docs/](./docs/)
- 当前版本:`v0.4.x`(2026-06-27,v3.x UI 重做收官 + P2P 同步修复 8 BUG,22 套件 / 1222/0 单测,JDK 21)

---

**最后更新**:2026-06-27(v0.4.x P2P 同步修复:BUG-001~008 全部 commit + 5 套回归测试 221 case 覆盖,22 套件 / 1222 单测全过 + v3.x UI 重做:5 阶段全落地 — tokens + CardPlay + HomeView + RoomView + GameView Desktop/Mobile + HudTop + MainActions,JDK 21,真机 APK 可发)
