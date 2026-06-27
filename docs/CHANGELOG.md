# 更新日志 (Changelog)

> 项目的所有重要变更,按版本倒序。

---

## v0.4.x (2026-06-27) — P2P 同步修复(8 个连环 bug,22 套件 1222 单测全过)

> v3.8 / v2.x 收官后实地复测,4-tab 联机 + 跨设备联机仍有 8 个连环 bug。本段集中记录 BUG-001~008 的 commit、修复概要、回归测试。**架构级变化**:把 v3.x UI 重做之外的 P2P 联机层做了一次"二次审计 + 回归测试加固",从 862 → 1222 单测(+360,+221 来自本次),把"看起来过的联机"变成"测试覆盖的联机"。

### BUG 清单(按 commit 时间倒序)

#### BUG-008 — README / CHANGELOG 状态与实际风险不一致

- 现象:README 声称 "局域网 P2P 联机 / 真机跨设备联机 / 862 用例 0 失败",与 v0.4.0 后 8 个 BUG 的修复事实不符。
- 修复:`README.md` §3.1 已完成列表 + §3.3 新增 P2P 同步修复记录 + §3.4 测试矩阵(7 场景)+ `docs/CHANGELOG.md` 新增 `## v0.4.x` 段。
- 回归:无新增独立测试套件,本次 5 套测试全部已存在并通过(见下方"5 套回归测试")。

#### BUG-007 — 踢人协议不统一,被踢 joiner 的 peer:leave 要等心跳超时

- commit: `3070ed2`(2026-06-27 17:41)
- 文件: `network.js` + `RoomView.vue` + `seat-swap-kick-protocol.test.js`(新)
- 修复:统一踢人协议 → 走 `KICKED` 消息 + 立即 peer Map 删除(不等 6-8s 心跳窗口)+ close 时清理 `_kickedSeats`(下次开房不残留)
- 回归: `src/common/seat-swap-kick-protocol.test.js` — 12 块 / **90 case**(`BUG-007` 标签块 6 个:host kick → host peer:leave 立即少 1,旁观 joiner 立即 peers.delete,KICKED 事件优先 PEER_LEAVE,延迟 HEARTBEAT/_DISCONNECT 不再触发二次 leave,kickPlayer 边界 5 个,close 后 _kickedSeats 清空)

#### BUG-006 — swapSeats 绕过网络层,RoomView 直接改本地 state 不广播

- commit: `2267191`(2026-06-27 17:37)
- 文件: `network.js` + `RoomView.vue`
- 修复:`swapSeats(a, b)` 提到网络层,host 端先改本地 + `broadcast(SEAT_SWAP_ACK)` 给其它 joiner;joiner 端收到 ACK 后应用。RoomView 走 `net.swapSeats()`,不再直接 `peers.set`。
- 回归:同上 `seat-swap-kick-protocol.test.js` — `BUG-006` 标签块 5 个(host swap 立即生效,joiner swap 立即生效,3 个旁观 joiner 都收 ACK 并同步,边界 a==b / 非法 seat / 自未连接,host swap 不动自己 seat)

#### BUG-005 — BC transport 不传 roomId,所有 joiner 进入全局 channel(房间号不隔离)

- commit: `c90457d`(2026-06-27 17:07)
- 文件: `network.js` + `network-transport-bc.js` + `network-roomid.test.js`(新)
- 修复:`BroadcastChannelTransport.open(selfSeat, roomId)` 把 roomId 写进 channel name(`guandan-p2p-<roomId>`),2 个 host(111111 / 222222)的 joiner 互相不可见。
- 回归: `src/common/network-roomid.test.js` — 5 块 / **36 case**(BC channel name 按 roomId 构造,2 host 反向隔离,joinRoom BC 路径用 roomId,空 roomId fallback `default`,`joinRoom('default', ...)` 兼容老 API)

#### BUG-004 — RoomView 退出房间不清理监听器,反复进退房间累积监听器泄漏

- commit: `fa9f45e`(2026-06-27 17:08)
- 文件: `RoomView.vue` + `network-cleanup.test.js`(新)
- 修复:RoomView 用 `disposers[]` 集中管理所有 `net.on(...)` + `onUnmounted` 时统一 `off` + `net.close()`。
- 回归: `src/common/network-cleanup.test.js` — 4 块 / **80 case**(5 cycles 进退房间后 `listenerCount === 0` + `_isClosed() === true`,off(event, handler) 精确解绑,off(event) 删该事件全部订阅,emit 不触发已 cleanup 的死 handler)

#### BUG-003 — commitPlay/commitPass 不广播,只有手动 onPlay 同步,自动出牌路径不同步

- commit: `23b6ee3`(2026-06-27 16:53)
- 文件: `useGameLogic.js` + `commit-play-broadcast.test.js`(新)
- 修复:抽出 `commitPlay(seat, cards, source)` / `commitPass(seat, source)` 统一包装 `playerPlay + isP2P 时 broadcast`,所有路径(`onPlay` / `onAutoPlay` / `onAutoFindBest` / timeout / AI 接管)都走这一条。
- 回归: `src/views/game/commit-play-broadcast.test.js` — 5 块 / **32 case**(4 BC client 集成 seat=1 commitPlay → 其它 joiner 收到,commitPass 同样广播,isP2PMode=false 不广播,commitPlay playerPlay 失败 ok=false 且不广播)

#### BUG-002 — finishDeal 写死读 hands[0](host 牌),joiner 拿 host 牌手牌视图错位

- commit: `ed3b33c`(2026-06-27 16:53)
- 文件: `useGameLogic.js` + `finish-deal-seat.test.js`(新)
- 修复:`finishDeal(game, selfSeat)` 按 selfSeat 读 `hands[selfSeat]`,joiner 拿到自己种子发的牌,而不是 host 的牌。
- 回归: `src/views/game/finish-deal-seat.test.js` — 5 块 / **48 case**(selfSeat=0/1/2/3 各自读自己的手牌不串号,buggy 版本自检 selfSeat=1/2/3 都误读 host 牌,4 client 同 seed hands 拼成完整 108 张,边界 selfSeat=NaN/null/-1/5 fallback,view 一致性 `sortGrouped(myHand) === sortGrouped(hands[selfSeat])`)

#### BUG-001 — host 不 relay joiner 消息给其它 joiner(WS 星型拓扑缺失)

- commit: `f4113e4`(2026-06-27 16:39)
- 文件: `network.js` + `network-relay.test.js`(新)
- 修复:`_handleWsMessage` 收到 joiner 发来的消息时,`broadcastExcept` 给其它 joiner(保留原 `from` 字段),不只 echo 给 sender。
- 回归: `src/common/network-relay.test.js` — 4 块 / **25 case**(WS host relay seat 1 发 PLAY → seat 2/3 都收到且 `from === 1`,joiner→host→其它 joiner 路径完整,from 字段不被覆盖)

### 5 套回归测试(总 221 case)

| # | 测试文件 | 块数 | case 数 | 覆盖 BUG |
|---|----------|------|---------|----------|
| 1 | `src/common/network-relay.test.js` | 4 | 25 | BUG-001 |
| 2 | `src/views/game/finish-deal-seat.test.js` | 5 | 48 | BUG-002 |
| 3 | `src/views/game/commit-play-broadcast.test.js` | 5 | 32 | BUG-003 |
| 4 | `src/common/network-cleanup.test.js` | 4 | 80 | BUG-004 |
| 5 | `src/common/network-roomid.test.js` | 5 | 36 | BUG-005 |
| | **小计** | **23** | **221** | BUG-001~005(+ BUG-006/007 在 `seat-swap-kick-protocol.test.js` 12 块 90 case) |

注:BUG-006 / BUG-007 的回归测试写在 `src/common/seat-swap-kick-protocol.test.js`(12 块 90 case),本次 5 套特指 BUG-001~005。

### 测试结果

- **22 测试套件 / 1222 用例 / 0 失败**(v0.4.0 的 862 → 1222,+360 用例)
- `npm run build` 成功

### 端到端

- **4 真机联机**(v0.3.0 / 2026-06-13):1 真机 host + 1 真机 joiner + 2 浏览器 tab 跨设备联机,开局 / 出牌 / 踢人 / host 迁移全跑通。
- **4-tab 联机**(v0.2.0 / 2026-06-10):Chrome CDP 4-tab 局域网联机 demo,全进对局、拿同手牌、出牌同步、AI 接管、截图回归。

### 已知 follow-up

- 详见 v0.4.0 §"已知 follow-up"

---

## v0.4.0 (2026-06-27) — v3.x UI 重做(翡翠绿 + 金 + 深蓝星空,5 阶段全落地)

> 一个版本内含第三方代码审查 + 用户 4 张效果图 → 完整 UI 重做 spec,5 阶段渐进实施。**架构级变化**:UI 从「基础可用」升到「高端棋牌游戏质感」(参考欢乐斗地主 / JJ 比赛),Java 环境从 JDK 18 升到 JDK 21(Capacitor 8 / AGP 8.13 强制要求)。

### 新增

#### v3.x spec + 审计(commits 7185580 → 5f6794f)

- `docs/UI-REDESIGN-V3-SPEC.md`(新)— 第三方审查报告 + 用户 4 张效果图,综合出 5 阶段完整 spec
  - 4 屏规格:HomeView / GameView / RoomView / CardPlay
  - 设计 token 扩展:emerald-* / gold-* / card-cream / 星空深蓝 room-bg-*
  - 文件影响清单:4506 → ~5500 行,+22%
- `src/styles/tokens.css` — 新增 v3.x token(emerald/gold/cream/星空深蓝)
- v3.x 审计 P0/P1/P2/P3 bug 修复(`5f6794f`):
  - P0-5:game finishedOrder 边界(>=3 触发 finishRound)
  - P1-5 / P1-9:AI 主动出牌结构化 + 按长度+rank 选炸弹
  - P1-11 / P1-12:host joiner 断连立即感知 + ws 指数退避重连
  - P2-15 / P2-19 / P2-22:isLevelCard 红桃对齐 / off 可选 handler / 独立 teamLevels
  - P3-5/6/10/11/13/14/15:UI 视觉/响应式小修

#### 阶段 1 — tokens.css + CardPlay.vue(`7d3b2ba`)

- `src/styles/tokens.css` 追加新 v3.x token(emerald/gold/cream/星空深蓝 40+ props)
- `src/components/CardPlay.vue` 重构 ~50%(330 行,60×84 桌面 / 48×68 移动)
  - 牌面:奶油白底 + 1.5px 金边 + 8px 圆角 + 阴影
  - 牌面花纹:内联 SVG `<pattern>` 卷草纹 opacity 6-10%
  - 牌背:深红 #8B1A1A → #5C0E0E 渐变 + 金色传统纹 + 中央徽章
  - 大王:金色金属渐变 / 小王:银灰金属渐变
  - 选中态:translateY(-12px) + 阴影增强 + 顶部金色亮线
- producer→verifier PASS

#### 阶段 2 — HomeView + PlayerSeat(`ae931f0`)

- `src/views/index/HomeView.vue` 重做 — 玻璃拟态 4 按钮(开房/加入/AI/规则)
- `src/components/PlayerSeat.vue` 加头像光环 + `isUrgent` + `allowEdit` props
- self 座位 pulse-glow 金色脉冲
- producer→verifier PASS

#### 阶段 3 — RoomView + room-ui 测试(`1a202c5`,救火 commit)

- `src/views/room/RoomView.vue` 739 → 1209 行
  - 4 菱形座位(top/left/right/bottom)+ 深蓝星空背景(50 颗星动画)+ 玻璃面板 + 金色按钮
  - 信息卡:房间号 + 主机 IP + 复制按钮(玻璃)
  - 保留所有现有 data-testid / emit / props
  - 1 个 position: fixed(只允许 copy-toast,守住 v2.2 红线)
- `src/common/room-ui.test.js` 141 → 391 行(断言更新以匹配新模板,断言数不减少)
- QrFallbackCard.vue 现有功能保留
- owner 救火:coder 15min timeout 前已完成所有 spec §4 改动 + 测试通过,owner 把 work commit(verifier 因 plan cycle 4 收尾 OWNER-SKIP)
- 救火 commit review:范围清晰 / spec §4 全覆盖 / 无回归

#### 阶段 4 — GameView Desktop+Mobile + HudTop + MainActions(`60f93cc`,救火 commit)

- `src/views/game/GameViewDesktop.vue` 加 `.bg-felt`(椭圆 felt 翡翠绿)+ `.bg-wood-edge`(木纹边)+ `.table-stage` + `.table-glow`(径向白光聚光)
- `src/views/game/GameViewMobile.vue` 同步桌面端视觉语言,只调整椭圆比例
- `src/components/HudTop.vue` 加 `.badge-gold` 级别徽章(金色金属渐变 + 黑字)+ 房间号 A3K7 显示(net 单例只读,降级空)
- `src/components/MainActions.vue` 147 行重做(出牌/过牌/提示玻璃按钮)
- 救火 commit review:spec §3.1+§3.5+§3.6 全覆盖 / 无 data-testid 契约破坏 / net 单例只读 try/catch 降级

#### 阶段 5 — final integration + 视觉验证(`final-integration` task)

- verifier agent 跑全套:`npm test` 16 套件 862/0 + `npm run build` 成功
- 4 张视觉对比截图(`docs/screenshots/v3-ui-redesign-final/`):
  - 01-home-final.png — 首页玻璃按钮 + 翡翠渐变
  - 02-room-final.png — 房间菱形座位 + 深蓝星空
  - 03-game-final.png — 对局页椭圆 felt 桌面
  - 04-card-hover-final.png — 卡牌选中态金边高光
- baseline 对照(`docs/screenshots/v3-baseline/`)保留 8 张 v3.0 前截图

### 改动

- `src/styles/tokens.css` — 追加新 v3.x token 段(老 token 全部保留)
- `src/views/index/HomeView.vue` — 重做(v3.x 玻璃按钮)
- `src/views/room/RoomView.vue` — 重做(v3.x 菱形 + 星空 + 玻璃)
- `src/views/game/GameViewDesktop.vue` — 重做背景层(v3.x felt + 聚光)
- `src/views/game/GameViewMobile.vue` — 重做背景层(同视觉语言)
- `src/components/CardPlay.vue` — 重做(v3.x 金边奶油白 + 红色传统牌背)
- `src/components/PlayerSeat.vue` — 加 isUrgent / allowEdit / 头像光环
- `src/components/HudTop.vue` — 级别徽章金色 + 房间号显示
- `src/components/MainActions.vue` — 重做(玻璃按钮)
- `package.json` — version 0.3.0 → 0.4.0

### 环境

- **JDK 18 → JDK 21**(Capacitor 8 / AGP 8.13.0 强制要求):
  - 装 `brew install openjdk@21`(21.0.11 已装)
  - `~/.zshrc` 末尾加:`export JAVA_HOME=/opt/homebrew/opt/openjdk@21`
  - `./gradlew assembleDebug` / `npx cap sync android` 都读这个变量
  - 详见 `BUILD.md` §〇

### 测试

- engine 109 / ai 54 / game 102 / deal-animation 13 / audio 117 / card-api 19
- network 89 / network-multitab 28 / network-kick-player 51 / network-cross-device 50 / network-ws-http 29
- ws-server 29 / qr-fallback 36 / GameView 65 / room-ui 60 / RoomView 11
- **总计 16 套件 / 862 用例 / 0 失败**(v0.3.0 的 701 → 862,+161 用例)
- `npm run build` 成功(dist/ 1.0s)

### 已知 follow-up

- ⚠️ **救火 commit(1a202c5 + 60f93cc)** — owner review 过,质量接近 producer 交付,无回归,verifier 未单独跑(已通过 final-integration 全套测试 + build 间接验证)
- 💭 **AI 难度分档** — 当前只有中等难度(规则 + 贪心),Easy / Hard 暂未实现
- 💭 **录像回放** — 一局打完后无法回看每手牌决策路径
- 💭 **iOS 脚手架** — Capacitor iOS 工程未建,Mac + Xcode 走一遍
- 💭 **多语言** — 当前中文 UI 硬编码,英文/繁体未抽 i18n

---

## v0.3.0 (2026-06-13) — v2.x 收官(真机跨设备 + 房主控制 + QR 兜底)

> 一个版本内含 v2.0 / v2.1 / v2.2 三个里程碑,17 个 commit。**架构级变化**:网络层从 BroadcastChannel 单机换成"开发态 BC + 真机/跨设备态 WebSocket"双轨,打包链路从纯 H5 升级到 Capacitor Android APK 可发。

### 新增

#### v2.0 — AndroidWs 真机 host + Capacitor 打包(commits 44a93c7 → f5dafee)

- `network.js` 引入 `WebSocketTransport`,BC 退为开发态默认,真机/跨设备态用 WS
- `src/common/network-transport-bc.js` / `network-transport-ws.js` / `network-transport-android-ws.js` 三 transport 抽象(同一接口,可插拔)
- `src/common/ws-server.js` 浏览器端 WsServer 桥(配合 Android plugin)
- `android/` Capacitor 8 脚手架 + cleartext + 3 个 manifest 权限(INTERNET / ACCESS_NETWORK_STATE / ACCESS_WIFI_STATE)
- `WsServerPlugin` 原生 Java 插件(真机起 WS server + 接受浏览器/真机 joiner)
- `@capacitor/app + preferences + splash-screen + status-bar` 5MB 体积下限
- 修 `sendToClient` seatMap 路由(P0 验证发现)
- dedup 3 个 manifest 权限(顶部已列)
- `RoomView.vue` host IP/QR 重新接 UI(扫码/手输 host IP 都能加入)
- `BUILD.md` 真机测试指南 + APK 产物文档

#### v2.1 — 心跳调参 + 4-tab 健壮性 + 房主控制(commits ebe57d3 → c65e9be)

- `network.js` 心跳参数 2s/2s/6s,目标 6-8s 精确释放窗口
- `RoomView.vue` 暴露 `__gd_net` hook(4-tab 端到端 E2E 测试用)
- `src/common/seat-rotation.js` 抽纯函数(`rotateSeats` / `rotateSeatView`),`GameView.vue` 改薄壳
- `src/views/game/GameView.test.js` 56 case seat rotation 单测
- `network.js` `forceDisconnectSeat` 真做(host 主动踢人三 transport 对称实现)
- `RoomView.vue` host 加踢人按钮 + joiner 收 `self:kicked` 事件跳 Toast
- `migrateHost(seat)` host 崩溃/退房时由对家接管(WARN-2 fix)
- 心跳超时 AI 接管(`AI_TAKEOVER` 广播)

#### v2.2 — QR 兜底卡片 + 跨设备联机(commits f87c6fb → 08cde9a)

- `QrFallbackCard.vue` 二维码加载失败时降级到 IP+端口文本(扫不到码可手输)
- `qrcode` 依赖上线,`RoomView.vue` 渲染 host 房间的 QR
- `network.js` `joinRemoteRoom(hostIp, hostPort)` 跨设备加入接口
- 浏览器原生 WebSocket 客户端(无需 Capacitor 也能用真机作 host)
- `src/common/qr-fallback.js` 抽 5 个纯函数(`formatHostAddress` / `buildJoinUrl` / `shouldShowFallback` / `describeFallbackMode` / `clipboardPayload`)
- 跨设备端到端:2 真机 + 2 浏览器 tab 成功联机
- Chrome 4-tab 联机 demo:全进对局、拿同手牌、出牌同步、踢人/host 迁移

### 修复

- WS seatMap 路由错误(P0)
- 4-tab 联机 7 个连环 bug(合入 v0.2.0)
- AndroidWs 重复 manifest 权限
- `bindLastSenderSeat` 不再 no-op,真正调 WsServer.bindSeat

### 测试

- engine: 93 / 0(原 85, +8)
- AI: 44 / 0
- game: 78 / 0(原 24, +54 联机/AI 接管/seeded deal)
- deal-animation: 11 / 0
- audio: 117 / 0
- card-api: 19 / 0
- network: 89 / 0(原 71, +18 多 transport / 心跳调参)
- multitab: 28 / 0
- kick-player: **51 / 0**(新)
- cross-device: **50 / 0**(新)
- ws-server: **29 / 0**(新)
- qr-fallback: **36 / 0**(新)
- seat-rotation / GameView: **56 / 0**(新)
- **701 / 0 全过**(v0.1.0 基线 279 + v3.8 新增 117 + v2.x 新增 305)

### 端到端

- 1 真机(host,AndroidWs)+ 3 浏览器 tab 联机:开局/出牌/踢人/host 迁移全跑通
- 2 真机(host A + joiner B)+ 2 浏览器 tab:跨设备联机 + QR 兜底卡片
- Chrome + CDP 4-tab 联机 demo + 截图回归

---

## v0.2.0 (2026-06-10) — v3.8 4-tab 局域网联机 P0+P1+P2

### 新增

#### v3.8 P0 — 4-tab 局域网联机基础(7 个连环 bug 修复)

- `RoomView.vue` 房间号改用 `?roomNo=` URL 参数(joiner 不会自己随机生成新号)
- `RoomView.vue` host 房间号持久化到 `sessionStorage`(HMR/刷新不丢)
- `JoinView.vue` 预填 URL 里的 `?roomNo=`
- `RoomView.vue` 预填 URL 里的 `?nick=&avatar=`(扫码加入)
- `network.js` 删掉老的 `message:JOIN` handler,改用 `connect` 事件(seat=-1 死锁修复)
- `RoomView.vue` host 自己手动 `peers.set(0, ...)`(开局按钮卡在"准备"修复)
- `RoomView.vue` 4-tab 跳转时 `broadcast({ type: 'GAME_START' })`,joiner 也跳 `/game`
- `RoomView.vue` 移除 `onUnmounted(net.close)`(joiner 跳 /game 时 channel 不会关)

#### v3.8 P1 — 4-tab 真玩家名 + 出牌同步

- `network.js` host 收到新 joiner 时也 `broadcast SYNC` 给老 joiner(否则后到的玩家不被老 joiner 知道)
- `network.js` joiner 每 15s 自动 re-JOIN(host 刷新/网络闪断自动恢复)
- `guandan-engine.js` 加 `mulberry32` PRNG 和 `deal(seed)`(4-tab 联机确定性发牌)
- `guandan-game.js` `createGame` 接 `seed` 参数,`firstPlayer` 也用 seeded 随机
- `guandan-game.js` 新增 `applyPlay`/`applyPass`/`applyRoundEnd` 无校验接口(4-tab 联机同步用)
- `guandan-game.js` `aiPlayers=[]` 时跳过 AI 调度(联机 4 人都是真人)
- `guandan-game.js` 新增 `_applySnapshot(snap)` 断线重连用
- `guandan-game.js` 新增 `addAIPlayer`/`removeAIPlayer`/`setAIBroadcast` 动态 AI 接管
- `GameView.vue` `seatData` 按 `selfSeat` 旋转 seat 视图(joiner 不会看错队友)
- `GameView.vue` `myTurn` 按 `selfSeat` 判断(joiner 能出牌)
- `GameView.vue` `applyNetworkPlayers` 从 `net.getPeers()` 覆盖 AI 占位
- `GameView.vue` P2P 模式:host 广播 DEAL(带 seed)→ joiner 用同 seed 发同一手牌
- `GameView.vue` P2P 模式:本地出牌 `broadcast(PLAY)`,其他 tab 监听调 `applyPlay`
- `GameView.vue` P2P 模式:本地过牌 `broadcast(PASS)`,其他 tab 监听调 `applyPass`
- `GameView.vue` P2P 模式:结算广播 `ROUND_END`,所有 tab 同步结算/升级
- `GameView.vue` P2P 模式:断线重连广播 `STATE_SNAPSHOT`,joiner 收到覆盖本地 state
- `GameView.vue` P2P 模式:心跳超时广播 `AI_TAKEOVER`,掉线玩家被 AI 接管

### 修复

- 4-tab 进对局后之前显示 AI-东/北/西 默认名 → 显示真玩家名
- 4-tab 各自发不同手牌 → 同 seed 发同一手牌
- 4-tab 出牌后只有本地更新 → 4 tab 同步更新
- joiner 跳 /game 后 channel 被关 → 不再关
- host 自己不算 seat 0 导致开局按钮不显示 → 手动加
- 4-tab 跳 /game 时 joiner 永远卡在 /room → 广播 GAME_START

### 测试

- engine: 93 / 0(原 85, +8 seeded deal + mulberry32)
- AI: 44 / 0
- game: 24 / 0(原 11, +13 apply/seed/P2P 测试)
- audio: 117 / 0
- card-api: 19 / 0
- network: 71 / 0
- multitab: 28 / 0(原 25, +3 SYNC 广播回归)
- **396 / 0 全过**

### 端到端

- Chrome + CDP 4-tab 联机 demo:4 tab 全进对局、拿同手牌、出牌同步、AI 接管
- 4-tab 截图存档

---

## v0.1.0 (2026-06-09) — v3.7 体验优化 + 完整文档

### 新增

- 完整开发者文档(9 篇 `docs/*.md`)
- `docs/ARCHITECTURE.md` — 系统架构
- `docs/ENGINE.md` — 规则引擎
- `docs/AI.md` — AI 决策
- `docs/NETWORK.md` — 网络层
- `docs/UI.md` — UI 系统
- `docs/TESTING.md` — 测试规范
- `docs/STYLE.md` — 代码风格
- `docs/ROADMAP.md` — 路线图
- `docs/HOWTO-EXTEND.md` — 扩展指南
- 重新梳理的 `README.md`

### 修复 (v3.7 尾巴)

- 动画开关 disabled 状态不再显示绿色(改灰色,避免误导)
- BGM 风格切换持久化到 localStorage(刷新保留)

### 测试

- 279/0 全过
- 新增 6 个 v3.7 验证截图

---

## v0.1.0 (2026-06-08) — v3.7 体验优化三个等级

### 新增

- **P0**:报数规则 / 对局中禁改名 / 炸弹音效 / BGM 折中 / 自座位位置 C
- **P1**:出牌音效分级 / 紧急蜂鸣 / 桌面快捷键 / 快捷聊天
- **P2**:战绩图表 / 集中设置面板 / /settings 路由

### 改动

- `src/common/audio.js` — 重写 6 种 SFX + Web Audio 拍鼓点 BGM
- `src/components/PlayerSeat.vue` — 报数 + 紧急 + 头像
- `src/components/NicknameEditor.vue` — inline 模式
- `src/components/HudTop.vue` — 自座位位置 C
- `src/views/game/GameView.vue` — 接 urgent / 快捷键 / 聊天
- `src/components/ChatQuickPanel.vue`(新) — 10 颗 pill
- `src/components/HistoryChart.vue`(新) — 零依赖 SVG
- `src/views/settings/SettingsView.vue`(新) — 集中设置
- `src/views/history/HistoryView.vue` — 插图表
- `src/views/index/HomeView.vue` — 加设置入口
- `src/main.js` — 注册 /settings 路由

### 测试

- engine 85 / ai 44 / game 3 / deal-anim 11 / audio 117 / card-api 19
- **总计 279 用例 / 0 失败**

---

## v0.1.0-v3.6 (2026-06) — UI/UX 优化

### v3.6 — 视觉打磨

- 4 角单字(左上玩家名 / 右上倍数 / 左下级牌 / 右下轮数)
- 智能理牌渐变按钮
- 列底 ×N 数量提示
- 大小王 SVG 化(headless 渲染兼容)
- 智能理牌(调 `ai.autoPlayGrouped`)
- 一键理按钮

### v3.5 — Bug 修复

- 修组件重叠 / 牌显示不全
- 大小王用红色/灰色小丑 SVG(替代 emoji,emoji 在 headless 渲染失败)
- 顶 tip 合并
- 列高动态 96+(n-1)*20

### v3.0-3.4 — 核心 UI 重设计

- 顶部 HUD 重组
- 中央牌桌 + 桌面牌 + 首家提示
- 手牌竖叠排版(每列一个 rank)
- 身份三色(自己绿 / 队友蓝 / 对手红)
- 设计 token 系统(`tokens.css`)

---

## v0.1.0-v1.0 (2026-05) — 基础可用

### 完成

- 牌组生成 / 洗牌 / 发牌
- 14 种牌型识别
- 大小比较 + 升级 + 进贡
- 逢人配(红桃级牌万能)
- AI 出牌决策(规则 + 贪心,中等难度)
- 对局状态机(发牌 / 出牌 / 过牌 / 一轮结束 / 一局结束)
- 浏览器版网络层(BroadcastChannel)
- localStorage 存储(昵称 / 头像 / 设置 / 战绩)
- Vue 3 + Vite 工程化
- 80+ 单元测试
- 8 个 view:Home / Room / Join / Game / AI / Guide / History / Settings
- 12 个 component:HudTop / PlayerSeat / TableCenter / CardPlay / ...

### 已知限制

- ❌ 网络层只支持同浏览器标签联机(真机需 v2.0 重写)
- ❌ AI 只有中等难度
- ❌ 没原生 APK/IPA 打包
- ❌ 无录像回放

---

## 版本约定

```
vMAJOR.MINOR.PATCH

MAJOR: 架构级变化(网络层 / 打包)
MINOR: 新功能
PATCH: Bug 修复 / 小调整
```

**当前**:`0.3.0`(v2.x 收官,真机跨设备联机 + Capacitor Android 可发)

**首发目标**:`v1.0.0`(H5 公开版本)
