# 更新日志 (Changelog)

> 项目的所有重要变更,按版本倒序。

---

## v0.4.17 (2026-06-29) — v0.4.16 对抗性复查 5 项 V0416 真 bug 修复 + 1 项误报澄清(39 套件 / 1927 单测全过)

> v0.4.16 静态复查 6 项问题里 1 项误报 / 5 项真问题,本版本集中修 5 项 + 1 项误报澄清:
> 1. **V0416-02 (P0)** `network.js rebuildAsHost()` 顺序修复 — 旧版 close 旧 transport → 用新 transport 广播(无 client) → joiner 永远收不到新 host 地址。新流程:先起新 server → 用**旧 transport 引用**广播 → close 旧 → 切换
> 2. **V0416-03 (P1)** RoomView `onNet('peer:leave')` 检测 `seat===0`(host 离开) → joiner 立即跳首页 + 提示"房主已退出,房间解散"
> 3. **V0416-04 (P1)** 网络层 `_DISCONNECT payload.seat===-1` (joiner 端 ws.onclose) → emit `'host:lost'` 业务事件;GameViewDesktop 监听 → joiner 跳首页 + 提示
> 4. **V0416-06 (P2)** README 测试数字统一(删除 1887 作当前基线描述 + 测试覆盖段 v0.4.16 → 1889)
> 5. **V0416-05 (误报澄清)** 审查报告称 RoomView `netStatusClass` 有重复空字符串判断 — **实际代码用 emoji `🟢`/`🔴`**,新版本段固化这个事实
> 6. **V0416-01 (P0 未做)** 修复未合入默认 master 分支 — 下个 release 必须 fast-forward master

### A. V0416-02 rebuildAsHost 顺序关键修复(WS / AndroidWs 真机 host 迁移闭环)

**问题**: 旧版顺序 `close 旧 → 起新 → sendMessage 用新 transport` 但新 server 上没 client,广播消息发到空客户端集合,joiner 永远收不到。

**修复**: 关键顺序 — `起新 → 算地址 → 用旧 transport 引用广播 → close 旧 → 切换`。

**测试**: `v0417-adversarial-fixes.test.js` §2 — 9 case(顺序断言:open newTransport < broadcast < close old < switch)

### B. V0416-03 RoomView 房间页 host 退出 joiner 处理

**问题**: RoomView `onNet('peer:leave')` 只 `peers.delete(seat)`,joiner 还留在房间页但没人能开局。

**修复**: 加 seat===0 检测分支,joiner 端 cleanup + net.close + router.push 首页。

**测试**: `v0417-adversarial-fixes.test.js` §3 — 5 case

### C. V0416-04 网络层 _DISCONNECT → host:lost 业务事件

**问题**: WS / AndroidWs joiner 端 ws.onclose 触发 `_DISCONNECT payload.seat===-1`,但业务层 `peer:leave` 只看 `from===0` 路径 → joiner 端 client 关闭不产生业务事件 → "host 崩溃"静默卡住。

**修复**:
1. `network.js _onTransportMessage._DISCONNECT` 分支: 检测 `payload.seat===-1 && !isHostFlag` → emit `'host:lost'`
2. `GameViewDesktop.onMounted`: `net.on('host:lost', () => router.push('/?force_disconnected=1&reason=...'))`
3. `GameViewDesktop.onUnmounted`: `net.off('host:lost')` 清理

**测试**: `v0417-adversarial-fixes.test.js` §4 — 8 case

### D. V0416-05 误报澄清 + E. V0416-06 README 一致性

- V0416-05: 实际代码用 emoji `🟢`/`🔴`,不是空字符串。v0417 §5 固化
- V0416-06: README "完整工程化"段从 1887 → 1889 + 测试覆盖段 v0.4.16 补 1889

### F. V0416-01 修复未合入 master — 已知未做

v0.4.17 修复仍在 `codex/ui-mobile-joker-card-preview` 分支,`master` HEAD 仍是 v0.4.14。下个 release 必须 fast-forward master(或创建 PR)。

### 测试基线

- **1927 通过 / 0 失败**(v0.4.16 的 1889 + v0417-adversarial-fixes 38 case)
- `npm run build` ✓ 1.53s

---

## v0.4.16 (2026-06-29) — v0.4.14 对抗性复查 5 项 V0414 真 bug 修复(38 套件 / 1889 单测全过)

> v0.4.14 静态复查 6 项问题里 1 项误报 / 5 项真问题,本版本集中修 4 项 P0/P1/P2 + 1 项留 v0.4.17 follow-up:
> 1. **V0414-01 (P0)** RoomView → GameView 跳转 URL 加 role 参数,GameView isP2PMode 兼容 role=host
> 2. **V0414-02 (P0/P1)** `useGameLogic.onHostMigrated` 末尾 fire-and-forget 调 `net.rebuildAsHost()`
> 3. **V0414-03 (P1)** RoomView `showMenu` 中 host 端 `net.close({ broadcast: true })` 主动广播
> 4. **V0414-05 (P2)** `broadcastPeerLeave` snapshot 超 64KB fallback 保留 `newHostSeat`
> 5. V0414-06 (误报) — 实际是 emoji `🟢`/`🔴` 状态,非空字符串判断
> 6. V0414-04 (P1/P2 留 v0.4.17) — WS/AndroidWs 模式 `requestPromoteToHost` self-loop(scope 大)

### A. V0414-01 RoomView → GameView P2P 模式识别修复

**问题**: RoomView 跳转 `/game?roomNo=xxx` 不带 role,GameView `isP2PMode` computed 只判 `role==='joiner' || !!host` → 全部 P2P 进游戏页被误判为非 P2P,后续 P2P 同步链路全断。

**修复**:
- RoomView line 397 (joiner GAME_START 监听): `router.push('/game?roomNo=' + roomNo.value + '&role=joiner')`
- RoomView line 595 (host tryStartGame): `router.push('/game?roomNo=' + roomNo.value + '&role=host')`
- GameView line 86 `isP2PMode`: 加 `route.query.role === 'host'` 兼容

**测试**: `v0416-adversarial-fixes.test.js` §1 — 7 case

### B. V0414-02 host 迁移后 transport 重建接线

**问题**: `network.rebuildAsHost()` 已实现并导出,但 `useGameLogic.onHostMigrated` 没调。WS / AndroidWs 真机模式下新 host 的 transport 仍是 client 角色,其他设备无法连接。

**修复**: `onHostMigrated` 末尾(`refreshUiFromGameState` 之后)加 isMyself 分支 fire-and-forget 调 `net.rebuildAsHost()`,promise.catch 仅 warn 不阻塞。

**测试**: `v0416-adversarial-fixes.test.js` §2 — 7 case

### C. V0414-03 RoomView 主动退出 host 广播 PEER_LEAVE

**问题**: RoomView `showMenu` 中 `net.close()` 默认 `broadcast=false`,joiner 只能等 6-8s 心跳超时。

**修复**: `showMenu` 改 `net.close(isHost.value ? { broadcast: true } : {})` — host 主动广播 `PEER_LEAVE { migrate: true }`,joiner `onPeerLeave` 立即触发 N-3 兜底迁移。

**测试**: `v0416-adversarial-fixes.test.js` §3 — 4 case

### D. V0414-05 broadcastPeerLeave fallback 保留 newHostSeat

**问题**: snapshot > 64KB 时 fallback 用 inline `{ seat: 0, migrate: true }` 重新构造 payload,**丢 newHostSeat**。

**修复**: 构造 `minimal = { seat: 0, migrate: true }` 后从 `payload.newHostSeat` 复制:
```js
const minimal = { seat: 0, migrate: true }
if (payload.newHostSeat !== undefined) minimal.newHostSeat = payload.newHostSeat
return sendMessage({ type: 'PEER_LEAVE', payload: minimal })
```

**测试**: `v0416-adversarial-fixes.test.js` §4 — 7 case

### E. V0414-06 误报澄清 + F. V0414-04 follow-up

- V0414-06: 审查报告称 RoomView `netStatusClass` 有重复空字符串判断 — **实际代码用 emoji `🟢`/`🔴`,不是空字符串**。本版本 §5 测试用例固化。
- V0414-04: WS / AndroidWs 模式 `requestPromoteToHost` 没有 self-loop,host 真实崩溃时旧连接已不可达 — 本地选举协议 scope 较大,留 v0.4.17 处理。

### 测试基线

- **1889 通过 / 0 失败**(v0.4.15 的 1859 + v0.4.16 对抗性复查 30 case)
- `npm run build` ✓ 1.54s

---

## v0.4.15 (2026-06-29) — 对抗性复查 3 项瑕疵修复(37 套件 / 1859 单测全过)

> v0.4.14 静态复查后,实测发现 3 项残留瑕疵,本版本集中清理:
> 1. V0412-04 `_applySnapshot` 边缘防御(`lastAppliedRoundId` 显式 undefined 不写入)
> 2. CHANGELOG / commit message 基线数字修正(原 1887 → 实测 1857)
> 3. BUILD.md / README 加 `npm install` 必跑提醒(否则 build 报 html5-qrcode 找不到)

### A. V0412-04 边缘防御

`_applySnapshot` 的 `lastAppliedRoundId` 字段从 `if ('lastAppliedRoundId' in snap)` 改成 `if ('lastAppliedRoundId' in snap && snap.lastAppliedRoundId !== undefined)`。

- **问题**: 旧版只要 `in snap` 就写,如果 sender 显式 `snap.lastAppliedRoundId = undefined`,会把 state 污染成 undefined
- **触发条件**: 实际 JSON.parse(JSON.stringify(state)) 序列化会丢 undefined 字段,所以正常路径触发不到。但 manual `snap.lastAppliedRoundId = undefined` 这种代码模式可能写出
- **保留契约**: `null` 仍能清空 state(原 4.2 case 不破),只挡 `undefined`
- **测试**: v0414-adversarial-review §4.3 新增 2 case(r1-before 验证 + undefined 拒绝),套件总数 50 → 52

### B. 基线数字修正

v0.4.14 commit message 写"37 测试套件 / 1857 单测 / 0 失败",**实测基线是 37 套件 / 1857 单测**。
- npm test 串接 37 个 .test.js 文件,但其中 10 个不打印"测试结果"格式(其他格式 / silent pass)
- 37 行输出累计 1857 case 通过
- 1887 是历史数字,后续 commit 合并/精简过测试,但 commit message 没更新

本版本 v0.4.16 段末尾"测试基线"列**实测**数字,纠 commit message 误导。

### C. BUILD.md / README 加 `npm install` 提醒

新 clone 的工作区 `node_modules` 没装,直接 `npm run build` 会报:
```
[vite]: Rollup failed to resolve import "html5-qrcode" from "src/views/join/JoinView.vue"
```

`html5-qrcode ^2.3.8` 已在 `package.json` dependencies 声明,但需要先 `npm install` 才会生成 node_modules 实体。BUILD.md / README 加醒目标记。

### 测试基线

- **1889 通过 / 0 失败**(v0.4.14 的 50 + v0.4.16 边缘防御 2)
- `npm run build` ✓ 1.46s

---

## v0.4.14 (2026-06-29) — v0.4.12 对抗性复查 6 项 V0412 bug 修复(基线虚报,以 v0.4.16 实测 37 套件 / 1857 单测为准)

> 本版本基于外部审查者对 v0.4.13 master 的复查报告,集中修 6 项残留问题(1 项误报已标注)。
> 第一性原理精简:用 game.getSnapshot() 单一来源替代手写 snapshot 字段列表,彻底解决 V0412-05/V0412-07。

### A. v0.4.12 对抗性复查 6 项 V0412 bug 修复(本轮)

#### **V0412-01 误报验证(无代码改动)**

- 报告:"`requestPromoteToHost` 调用存在,但未看到公开实现/导出"。
- 本地 grep 验证:`network.js` line 1321 有 `function requestPromoteToHost(snapshot)` 实现,line 1417/1445 在 export 和 default net 中均导出。v045-bug-fixes / network-host-promote / v047-rc2-regression 三个套件共 30+ case 已覆盖。
- 原因:审稿人在 GitHub 网页源码检索上漏掉,本地仓库 grep 即得。
- 修法:无需代码改动,v0414-adversarial-review.test.js §1 增加 `typeof net.requestPromoteToHost === 'function'` 断言留作未来回归防御。

#### **V0412-02 (P0) guandan-game.js:`migrateHost` 末尾 filter `abandonedSeats` 不含 0**

- 现象:`migrateHost(oldHostSeat=0, newHostSeat)` 把 0 push 进 `state.abandonedSeats`,然后 `state.hands[0] = newHostHand`(迁移到逻辑 seat 0)。但 abandonedSeats 仍含 0,`nextTurn()` 用 `while (state.abandonedSeats.includes(next))` 循环会**永远跳过 seat 0(新 host)**——新 host 自己永远不能再获得回合,这是 host 迁移的核心逻辑错误。
- 复现:migrateHost(0,2) → 连续 12 次 applyPlay → seat 0 只在第一次出现,后续全跳过。
- 修法:
  - migrateHost 不再 push `oldHostSeat=0` 进 abandonedSeats(其他 seat 1/2/3 弃赛仍可放)
  - 末尾防御性 `state.abandonedSeats = state.abandonedSeats.filter(s => s !== 0)`,兜底历史 snapshot 同步进来带 0 的情况
- 验证:`v0414-adversarial-review.test.js` §2 (8 case,含 12 轮 nextTurn 中 seat 0 至少出现 1 次)
- 副作用修测试:`v047-rc2-regression.test.js` 5 个 case 断言反向(从"seat 0 在 abandonedSeats"改成"seat 0 NOT in abandonedSeats"),`guandan-game.test.js` §12 同步

#### **V0412-03 (P0/P1) guandan-game.js + useGameLogic.js:AI pass 也必须广播**

- 现象 1:`scheduleAI()` 中 `if (r.type === 'play')` 成功后 `aiBroadcast(seat, cards, 'PLAY')`,但 `else { playerPass(seat) }` 没调 `aiBroadcast('PASS')`。
- 现象 2:useGameLogic 注入的 setAIBroadcast 回调只处理 `type === 'PLAY'`,没处理 `'PASS'`。
- 后果:P2P 1-3 人开局 AI 接管场景,只要 AI 跟牌选择 pass,joiner 端 currentPlayer 不推进,后续 PLAY/PASS 校验失败 → joiner 卡住或多端状态分叉。
- 修法:
  - `scheduleAI` else 分支:`playerPass(seat)` 后 `if (aiBroadcast) aiBroadcast(seat, null, 'PASS')`(对称 PLAY 分支的 BUG-I 防御)
  - useGameLogic 注入回调补 `if (type === 'PASS') net.broadcast({type: 'PASS', payload: {seat, source: 'ai'}})`
- 验证:`v0414-adversarial-review.test.js` §3 (4 case,源码正则 + 接口存在)

#### **V0412-04 (P1) guandan-game.js:`_applySnapshot` 应用过 A 标志 / 上一局级牌 / 去重 id**

- 现象:`_applySnapshot` 接受并 apply 了大部分字段,但 V0410-02 新加的 `isRestartAfterA` / `previousLevelRank` / `lastAppliedRoundId` 三个字段没处理 → snapshot 同步时丢掉过 A 状态,UI refreshUiFromGameState 拿到旧值,按钮文案退回"下一局"。
- 修法:
  - `_applySnapshot` 末尾补:`if (typeof snap.isRestartAfterA === 'boolean')`、`if (typeof snap.previousLevelRank === 'number')`、`if ('lastAppliedRoundId' in snap)`(string / null 都接受)
  - **state 预声明**:`isRestartAfterA: false` / `previousLevelRank: null` / `lastAppliedRoundId: null` 写到 createGame 顶部 state 初始化,保证 `getSnapshot()` 返回对象这些字段存在(避免后续维护时漏 apply)
- 验证:`v0414-adversarial-review.test.js` §4 (5 case,含 null 清空路径)

#### **V0412-05 + V0412-07 (P2) guandan-game.js + useGameLogic.js:新增 `game.getSnapshot()` 单一来源**

- 现象:
  - `useGameLogic.onPeerLeave()` 手写 snapshot 字段列表,缺 `difficulty / round / levelUp / abandonedSeats / isRestartAfterA / previousLevelRank / lastAppliedRoundId`,且 `hands / tableCards / finishedOrder` 是直接引用不是 clone
  - `game.getState()` 直接返回可变内部 `state`,调用方能改 hands / tableCards 等核心字段
- 第一性原理精简:**新增 `game.getSnapshot()` 返回完整 state 的 JSON 深拷贝,作为 snapshot 构造的单一来源**,useGameLogic 委托它,删除 24 行手写 snapshot 构造代码。
- 修法:
  - `getSnapshot() { return JSON.parse(JSON.stringify(state)) }` —— 字段口径跟 `_applySnapshot` 接受范围一致(每加字段两处同时加)
  - `getState()` 保留兼容现有 UI 计算 / debug
  - useGameLogic `onPeerLeave()` 改调 `game.value.getSnapshot()` 替代手写 snapshot
- 性能:一次 deal 后 state < 5KB,JSON round-trip ~1ms,host 迁移 / 重连路径用得起
- 验证:`v0414-adversarial-review.test.js` §5 (24 case,含字段全集断言 + 深拷贝验证 + onPeerLeave 委托)

#### **V0412-06 (P2) useGameLogic.js:`onNext` P2P 非 host 不动 phase ref**

- 现象:`onNext()` 开头立刻 `phase.value = 'playing'`,然后 P2P 模式判断 + 非 host 直接 return。后果:joiner 在结算页点"下一局",phase 已被改 'playing',UI 提示文本从"本局结束"跳到"思考中",按钮状态混乱,在 host 真正发出 DEAL 前看起来卡住。
- 修法:`phase.value = 'playing'` 从 onNext 开头移到 P2P host 分支(真正进入 initGame 之前),P2P 非 host 路径保持 phase='finished',UI 仍是结算页。
- 验证:`v0414-adversarial-review.test.js` §6 (3 case,源码正则断言开头 5 行无 phase='playing')

### B. 新增测试套件

#### `v0414-adversarial-review.test.js` — 50 case 端到端覆盖

- **§1 V0412-01**:requestPromoteToHost 是 function + length === 1(误报防御)
- **§2 V0412-02**:migrateHost 后 abandonedSeats 不含 0 + 12 轮 nextTurn 中 seat 0 至少出现 1 次
- **§3 V0412-03**:scheduleAI pass 分支调 aiBroadcast('PASS') + setAIBroadcast 注入回调处理 PASS
- **§4 V0412-04**:_applySnapshot 应用 isRestartAfterA/previousLevelRank/lastAppliedRoundId + 接受 null 清空
- **§5 V0412-05/07**:game.getSnapshot() 深拷贝 + 字段全集(20 个)+ onPeerLeave 委托 getSnapshot
- **§6 V0412-06**:onNext 开头无 phase='playing' + P2P 非 host 分支 return

### C. 同步修测试

- `guandan-game.test.js` §12 migrateHost 测试:旧断言"seat 0 在 abandonedSeats" → 新断言"seat 0 NOT in abandonedSeats"
- `v047-rc2-regression.test.js` 5 个 case 断言反向(同上)
- `static-bug-fixes.test.js` §6 package.json version 0.4.13 → 0.4.14
- `v0410-bug-fixes.test.js` package.json 当前版本 0.4.13 → 0.4.14

### 测试基线

- **37 测试套件 / 1857 单测 / 0 失败**(v0.4.13 的 35 套件 / 1837 case + v0414-adversarial-review 1 套件 / 50 case)
- `npm run build` ✓ 1.46s

---

## v0.4.13 (2026-06-29) — v0.4.12 对抗性审查 8 项 P0/P1/P2 bug 修复(35 套件 / 1837 单测全过)

> 本版本基于 v0.4.12 master 静态对抗性审查,集中修 8 项 P2P / game / network 层缺陷。
> 全部修复自带测试,新增 `v0412-adversarial-fixes.test.js` 34 case 端到端覆盖。

### A. v0.4.12 对抗性审查 8 项 P0/P1/P2 bug 修复(本轮)

#### **P0-2 / P1-5 network.js:`canBroadcast()` 统一封装 + `broadcastPeerLeave()` + `close({broadcast})`**

- 现象 1:host 主动 close 时 joiner 必须等 6-8s 心跳超时才能发现 host 离开,期间游戏卡住。
- 现象 2:业务代码散落 `transport && transport.isReady && transport.isReady()` 防御写法,BC / WS / AndroidWs 三个 transport 的 ready 语义不一致。
- 修法:
  - 加 `canBroadcast()` 统一封装 transport 是否可发消息(用 try/catch 包 isReady 防御)
  - 加 `broadcastPeerLeave({snapshot, newHostSeat})` 主动广播 `PEER_LEAVE {seat:0, migrate:true}`
  - 改 `close(opts)` 接受 `{broadcast, snapshot, newHostSeat}`,**默认 broadcast=false** 避免 RoomView 退房误广播
  - snapshot >64KB 拒绝带上,避免 BC/WS buffer 爆
- 防御:close() 在 stopHeartbeat + transport.close() **之前**先 broadcast,确保 joiner 收得到
- 验证:`v0412-adversarial-fixes.test.js` §1 (8 case)

#### **P0-3 guandan-game.js:`createGame.destroy()` 销毁旧 game 实例**

- 现象:joiner 收到 host 重发的 DEAL 时,useGameLogic `onP2PDeal` 直接 `initGame()` 覆盖旧 game,但旧 game 的 `_aiTimer` setTimeout 仍在跑。500-1000ms 后 callback 触发旧 game 实例上的 `playerPlay` / `playerPass`,可能 throw 或出过期手牌。
- 修法:
  - `createGame` 返回值加 `destroy()` 方法:clear `_aiTimer` + 清 `handlers` Map + 清 `aiPlayers` + 标 `_destroyed`
  - useGameLogic `onP2PDeal` 收到 DEAL 时先 `game.value.destroy()` 再 `initGame`
  - 重置 UI phase ref (避免残留 'finished' 中间窗口)
- 验证:`v0412-adversarial-fixes.test.js` §2 (5 case)

#### **P0-4 useGameLogic.js:`onP2PStateSnapshot` 走 `refreshUiFromGameState` 单一来源**

- 现象:`onP2PStateSnapshot` 收到 snapshot 后,apply 完手写 15 行 UI 同步块。跟 `onHostMigrated` / `ROUND_END` 路径的 UI 同步代码重复,容易遗漏字段。
- 修法:apply 完直接 `refreshUiFromGameState()` 单一来源,删掉手写块
- 副作用:后续新增字段(如 isRestartAfterA、hostMigrationToast)只改 `refreshUiFromGameState` 一处
- 验证:`v0412-adversarial-fixes.test.js` §3 (3 case)

#### **P1-1 guandan-game.js:`migrateHost` 末尾 emit `'turn'` 触发 UI 同步**

- 现象:`migrateHost` 修改了 `state.currentPlayer / firstPlayer / leaderPlayer / lastPlay.who / trickHistory`,但只 emit `'host:migrated'`,不 emit `'turn'`。
- 防御:useGameLogic `onHostMigrated` 调 `refreshUiFromGameState()` 兜底,所以没爆。但 game 层 emit 是契约正确性 —— 任何外部直接调 `game.migrateHost()` 的人不应该需要知道要调 `refreshUiFromGameState`。
- 修法:`migrateHost` 末尾 `emit('turn', state.currentPlayer, state.lastPlay, {isTeammateLast, postMigration: true})`
- 验证:`v0412-adversarial-fixes.test.js` §4 (3 case)

#### **P1-2 useGameLogic.js:`onP2PRoundEnd` roundId 去重防止 UI 抖动**

- 现象:joiner 端收到 ROUND_END 后调 `applyRoundEndFromPayload`(内部 `lastAppliedRoundId` 去重 OK),但外层 useGameLogic 还会**再次**同步 UI ref + `stopTimer`。host 重传同一 roundId 时,UI refs 重复赋值 + `stopTimer` 重复调产生抖动。
- 修法:useGameLogic 闭包加 `_lastAppliedRoundEndId`,外层早 return
- 验证:`v0412-adversarial-fixes.test.js` §5 (3 case)

#### **P1-3 useGameLogic.js:`onP2PPeerJoin` 走 `applyNetworkPlayers` 单一路径**

- 现象:`onP2PPeerJoin` 和 `applyNetworkPlayers` 双路径更新 `players.value`,host 端 SYNC + JOIN 几乎同时到时可能 race —— 中间窗口 UI 显示 AI 名字,真人来后又改成真人名字,闪一下。
- 修法:`onP2PPeerJoin` 删掉手写 players.value 更新,委托 `applyNetworkPlayers()` 从 `net.getPeers()` 单一来源
- 验证:`v0412-adversarial-fixes.test.js` (行为修复,源码断言 §1 内嵌)

#### **P1-4 useGameLogic.js + guandan-game.js:`onP2PPlay` ts 去重 Set + `applyPlay` 防御 cards-not-found**

- 现象 1:WS 重传 / 多次 broadcast / 重连回放 history 时同一 PLAY 被收到多次,`applyPlay` 内部 `findIndex` 找不到 card 时 `splice(-1, 1)` **静默删末尾那张牌** (silent bug)。
- 现象 2:外层 `onP2PPlay` 没有去重,每次重传都重新 apply。
- 修法:
  - `game.applyPlay` 加防御:cards 中任何一张不在 hand → 直接 return
  - useGameLogic 加 `_appliedPlayIds` Set (FIFO 32 条淘汰) + `_dedupPlayId(payload.ts)` 去重
- 验证:`v0412-adversarial-fixes.test.js` §6 (8 case)

### B. 新增测试套件

#### `v0412-adversarial-fixes.test.js` — 34 case 端到端覆盖

- **§1 P0-2 / P1-5**:源码正则 (canBroadcast / broadcastPeerLeave / close opts 存在) + 64KB 防御 + 行为 (无 transport / 非 host 返回 false)
- **§2 P0-3**:`createGame.destroy()` 函数存在 + handlers 清空 + aiPlayers 清空 + 标 `_destroyed` + destroy 后 deal 不抛错
- **§3 P0-4**:源码正则 (onP2PStateSnapshot 调 refreshUiFromGameState) + 删除手写"同步刷新 UI refs"块
- **§4 P1-1**:源码正则 (migrateHost 末尾 emit turn) + 行为 (migrateHost 后 turn 事件触发) + emit 顺序 (turn 在 host:migrated 之后)
- **§5 P1-2**:源码正则 (_lastAppliedRoundEndId 字段去重) + 检查 payload.roundId === _lastAppliedRoundEndId 提前 return
- **§6 P1-4**:`game.applyPlay` 防御 (cards 不全在 hand 时 state 不变) + 正常出牌仍 work + useGameLogic `_appliedPlayIds` Set + `_dedupPlayId` 函数

### 测试基线

- **35 测试套件 / 0 失败**(v0.4.12 的 35 套件 / 1837 case + v0412-adversarial-fixes 1 套件 / 34 case)
- `npm run build` ✓ 1.55s

---

## v0.4.12 (2026-06-28) — v0.4.11 修复的 P2P 端到端回归测试补充(35 套件 / 1837 单测全过)

> 本版本纯增量:**为 v0.4.11 的 8 个 P2P bug 修复补充端到端回归测试**。无代码改动,只新增测试套件和文档同步。

### 新增测试套件

#### `v0410-p2p-regression.test.js` — 56 case 端到端回归

- **§1 V0410-01 回归**:ROUND_END 广播 host-only 守卫行为模拟 — joiner 不广播,host 广播 1 次,suppress=true 时 host 也不广播(防自循环)
- **§2 V0410-02 回归**:`applyRoundEndFromPayload` 后 `state.isRestartAfterA` + `state.previousLevelRank` 写回 + 同 roundId 二次应用去重(幂等) + 不同 roundId 视为新结算 + snapshot 序列化保留 isRestartAfterA
- **§3 V0410-03 回归**:MATCH_RESTART 三重门禁 — sender authority (from===0) + phase gate (phase==='finished' && isRestartAfterA===true) + restartId 去重(_appliedRestartIds Set)
- **§4 V0410-04 回归**:host / joiner 同 seed `restartMatch({seed})` 产生同手牌,不同 seed 不同手牌;`restartMatch` 后 `state.isRestartAfterA` 自动清空(消费掉)
- **§5 V0410-06 回归**:`applySettingsToAudio` 同步 6 项 (enabled / volume / bgmStyle / sfxMode) + audio 模块函数验证
- **§6 V0410-07 回归**:`scheduleAI` 传 `state.difficulty` + createGame 时 difficulty 字段透传到 state
- **§7 V0410-08 回归**:SettingsView 从 package.json 读版本号,模板用 `{{ appVersion }}` 动态渲染

### 设计说明

- 用源码正则 + 行为模拟,不直接挂载 Vue(useGameLogic 依赖 Vue ref)
- ROUND_END 守卫 / MATCH_RESTART 门禁用模拟函数验证逻辑分支
- applyRoundEndFromPayload / restartMatch 用真实 createGame 验证 state 写回行为
- 跨实例 BroadcastChannel 端到端测试已有 `network-multitab.test.js` 覆盖 4-tab BC 通信基础;P2P 业务层端到端由本套件补充

### 测试基线

- **35 测试套件 / 1837 用例 / 0 失败**(v0.4.11 的 34 套件 / 1781 用例 + v0410-p2p-regression 1 套件 / 56 用例)
- `npm test` 全过,`npm run build` ✓ 1.43s

---

## v0.4.11 (2026-06-28) — v0.4.10 静态审查 8 个 P0/P1/P2 bug 修复(34 套件 / 1781 单测全过)

> v0.4.10 发布后第二轮静态审查,集中修 P2P 联机的鉴权 / 落盘 / 重开门禁 / 音效解锁 / AI 难度全链路 / 版本号硬编码问题。

### A. v0.4.10 静态审查 8 个 bug 修复(本轮)

#### V0410-01 P0/P1:P2P `ROUND_END` 广播缺 host-only 守卫

- 现象:`roundEnd` handler 内只判断 `isP2PMode.value && !suppressRoundEndBroadcast`,没判断 `isNetworkHost.value`。joiner 端 `applyPlay()` 触发 finishRound 后也会广播 ROUND_END,多端重复结算;不同端 `Date.now()` 产生不同 `roundId`,接收端 `lastAppliedRoundId` 去重失效。
- 修复:
  - 加 `isNetworkHost.value` 守卫:只有网络 host 才广播
  - roundId 稳定化:用 `r${round}-${ranksKey}` 而非 `r${Date.now()}-...`,确保所有端一致
- 验证:`v0410-bug-fixes.test.js` §1 — 源码正则断言守卫 + roundId 格式。

#### V0410-02 P1:`applyRoundEndFromPayload()` 未写回 `state.isRestartAfterA`

- 现象:本地 `applyRoundEnd()` 把 `isRestartAfterA` 写到 state,但远端权威 `applyRoundEndFromPayload()` 只 emit roundEnd 事件,没写 `state.isRestartAfterA` / `state.previousLevelRank`。后续 `refreshUiFromGameState` 读 `st.isRestartAfterA` 还是 false → UI / snapshot / host 迁移后过 A 状态回退。
- 修复:`applyRoundEndFromPayload` 计算完 `isRestart` 后立即:
  ```js
  state.isRestartAfterA = isRestart
  state.previousLevelRank = (typeof p.previousLevelRank === 'number') ? p.previousLevelRank : null
  ```
- 验证:`v0410-bug-fixes.test.js` §2 — 行为测试:远端 applyRoundEndFromPayload({isRestartAfterA: true, previousLevelRank: 14}) 后 getState().isRestartAfterA === true。

#### V0410-03 P1:`MATCH_RESTART` 缺鉴权/去重/phase gate

- 现象:`onP2PMatchRestart` 没接收 `from` 参数、不校验 sender authority、不去重 restartId、不检查 phase,重复包或非 host 包能强制洗牌。
- 修复:
  ```js
  function onP2PMatchRestart(payload, from, msg) {
    if (typeof from === 'number' && from !== 0) return  // sender authority
    if (st0.phase !== 'finished') return                 // phase gate
    if (st0.isRestartAfterA !== true) return             // isRestart gate
    if (payload.restartId && _appliedRestartIds.has(payload.restartId)) return  // dedup
    _appliedRestartIds.add(payload.restartId)
    ...
  }
  ```
- 验证:`v0410-bug-fixes.test.js` §3 — 源码正则断言鉴权/phase/isRestart/dedup 四重门禁。

#### V0410-04 P2:P2P host 重开后未刷新本机 UI refs

- 现象:`onRestartMatch` P2P host 分支 `game.restartMatch` 后直接 `return`,没刷 `levelRank/myHand/selected/selectedColKeys/phase/isRestartAfterA` 等 UI refs → host 按钮/选择状态短时残留。
- 修复:抽出 `afterMatchRestartRefresh()` 统一刷新函数,host / joiner / 单机三处共用。
- 验证:`v0410-bug-fixes.test.js` §4 — 源码正则断言函数存在 + 包含所有必要字段 + 三处调用。

#### V0410-05 P2:真实 SFX fallback 成功后 `failedSlots` 不清理

- 现象:`playMp3Sfx` 用 `p.catch(noop)` 吞错,成功 resolve 时 slot 不会从 `failedSlots` 删除 → 该 slot 即使 unlock 后能正常播放,`_shouldUseMp3` 仍认为它坏 → 真实音效模式长期降级。
- 修复:`p.then(() => { failedSlots.delete(slot); unlockPending.delete(slot) }).catch(...)` 成功/失败都处理。
- 验证:`v0410-bug-fixes.test.js` §5 — 源码正则 + Node 环境行为测试。

#### V0410-06 P2:直接进游戏页未应用 `bgmStyle` / `sfxMode`

- 现象:`applySettingsToAudio` 只同步 enabled/volume,没同步用户在 SettingsView 保存的 bgmStyle / sfxMode → 直接进 GameView 时仍走默认 (energetic / synth),必须先进设置页再返回才生效。
- 修复:
  ```js
  if (typeof audio.setBgmStyle === 'function') audio.setBgmStyle(s.bgmStyle || 'energetic')
  if (typeof audio.setSfxMode === 'function') audio.setSfxMode(s.sfxMode || 'synth')
  ```
- 验证:`v0410-bug-fixes.test.js` §6 — 源码正则 + audio 模块函数存在性。

#### V0410-07 P2:`scheduleAI` 未传入 `state.difficulty`

- 现象:只有 useGameLogic 的提示/帮出路径传 `gameDifficulty.value`,guandan-game 自己的 `scheduleAI` 调 `AI.decide(...)` 不传 difficulty → AI 对手/接管场景 hard 难度不生效。
- 修复:`AI.decide(hand, state.lastPlay, state.levelRank, ctx, state.difficulty)`。
- 验证:`v0410-bug-fixes.test.js` §7 — 行为测试:`createGame({difficulty: 'hard'})` 后 `getState().difficulty === 'hard'`。

#### V0410-08 P3:SettingsView 版本号硬编码

- 现象:`SettingsView.vue` 模板写死 `掼蛋 P2P 局域网版 v0.4.8`,每次发版要手动改,容易忘。
- 修复:
  ```js
  import pkg from '@/../package.json'
  const appVersion = String(pkg.version || '0.0.0')
  // 模板: 掼蛋 P2P 局域网版 v{{ appVersion }}
  ```
- 验证:`v0410-bug-fixes.test.js` §8 — 源码正则断言。

### 测试基线

- **34 测试套件 / 1781 用例 / 0 失败**(v0.4.10 的 33 套件 / 1675 用例 + v0410-bug-fixes 1 套件 / 40 用例)
- `npm test` 全过,`npm run build` ✓ 1.43s

---

## v0.4.10 (2026-06-28) — 移动端响应式文档化 + v0.4.9 P0/P1 修复(33 套件 / 1675 单测全过)

> 本版本整合两个独立工作:1) v2.5 已落地的移动端响应式正式文档化 2) v0.4.9 静态审查报告 9 个 bug 的 P0/P1/P2/P3 修复。

### A. v0.4.9 静态审查 9 个 bug 修复(本轮新增)

#### V049-01 P0:onHintToggle 提示按钮崩溃(`diff is not defined`)

- 现象:`useGameLogic.js` `onHintToggle(show)` 函数体直接引用 `diff` 变量,但只在 `onAutoFindBest` 内定义,导致点"提示"或按 A 快捷键时 ReferenceError。
- 修复:在 `onHintToggle` 函数体内补 `const diff = gameDifficulty.value`(L750 后)。
- 验证:`v049-bug-fixes.test.js` §1 用源码正则断言函数体含 diff 赋值声明。

#### V049-02 P0:`isRestartAfterA` UI/P2P 状态未贯通

- 现象:game 层结算时计算 `isRestartAfterA`(A 级升级)写到 state,但:
  - `roundEnd` handler 解构只取 `ranks/levelUp/newLevelRank`,丢了 `isRestartAfterA` + `previousLevelRank`
  - `ROUND_END` broadcast payload 没带这俩字段,joiner 端只能从本地推断
  - `refreshUiFromGameState` 没读 `st.isRestartAfterA`,host 迁移 / snapshot 应用后 UI 不同步
- 修复:
  - `roundEnd` handler 解构加 `isRestartAfterA: ira, previousLevelRank` → 同步到 `isRestartAfterA.value`
  - `ROUND_END` payload 加 `isRestartAfterA: !!ira, previousLevelRank`
  - `refreshUiFromGameState` 加 `isRestartAfterA.value = st.isRestartAfterA` 同步
  - `game.restartMatch` 内清空 `state.isRestartAfterA = false`
- 验证:`v049-bug-fixes.test.js` §2 用源码正则 + 行为测试双重覆盖。

#### V049-03 P1:`MATCH_RESTART` 不带新 seed,重开可能复用旧牌局

- 现象:`onRestartMatch` 调用 `restartMatch({ levelRank: 15 })`,joiner 收到后 `restartMatch` 走 `deal()` 无 seed 路径,触发 host/joiner 牌局重复或一致性依赖旧闭包 seed。
- 修复:
  - `useGameLogic.js` 新增 `_newRestartSeed()` 生成 `(Date.now() ^ Math.random()*0xFFFFFFFF) >>> 0`
  - `onRestartMatch` 单机/P2P 模式都生成新 seed,传入 `restartMatch({ levelRank: 15, seed })` 并 broadcast `{ levelRank, seed, restartId }`
  - `onP2PMatchRestart` 从 payload 提取 seed 传给 restartMatch
  - `guandan-game.js` `restartMatch` 签名加 `seed: forcedSeed`,有 seed 时 `deal(forcedSeed)`、无 seed 时 `deal()`
- 验证:`v049-bug-fixes.test.js` §3 — 同 seed 产生同手牌,不同 seed 产生不同手牌。

#### V049-04 P1:`MATCH_RESTART` 未加入 WS relay 白名单

- 现象:`RELAY_TYPES` Set 漏掉新加的 `MATCH_RESTART`,joiner/迁移后 host 发起的 MATCH_RESTART 不会被 host relay 给其它 joiner。
- 修复:`network.js` L321 RELAY_TYPES 加 `'MATCH_RESTART'`。
- 验证:`v049-bug-fixes.test.js` §4 — 源码正则断言。

#### V049-05 P1:真实音效 0 字节 MP3 + async 失败不 fallback

- 现象(报告时):`sfx-bomb.mp3`、`sfx-deal.mp3` 显示为 0 字节,`playMp3Sfx()` async play() 失败被 .catch 静默吞,上层 `playSfxForType` 同步拿到 `true` 不知道失败。
- 修复:
  - 当前 minimax worktree 的 SFX MP3 已全部 > 1KB(`v049-bug-fixes.test.js` §8 加 CI 级 size 断言防御 0 字节回归)
  - `playMp3Sfx()`:同步检查 `el.error` 返 false;async catch 内累计 `entry.failedSlots`(Set),标记此 slot 失败
  - 新增 `_shouldUseMp3(trackName)` 工具:pool 全坏时返 false → playSfxForType 走 synth fallback
  - `playSfxForType()` 先 `_shouldUseMp3(type)` 探测,失败再 `playMp3Sfx(type)`,返 false 自动降级合成音
- 验证:`v049-bug-fixes.test.js` §5 — 源码正则 + Node 环境行为测试(playSfxForType 不抛错)。

#### V049-06 P1:`setSettings` 局部保存会重置其他设置

- 现象:`storage.setSettings(s)` 实现是 `JSON.stringify({ ...DEFAULT_SETTINGS, ...s })`,调用方传局部字段(如只 `aiDifficulty`)会把 bgmEnabled / sfxMode / bgmVolume / sfxVolume / theme / bgmStyle 等其他用户设置悄悄恢复默认。
- 修复:`setSettings` 改为先 `getSettings()` 拿当前(已合并默认值的完整对象),再叠加本次 `s`:
  ```js
  const current = getSettings()
  const next = { ...current, ...s }
  ```
- 验证:`v049-bug-fixes.test.js` §6 — 行为测试:设 `{bgmEnabled:false, sfxMode:'real'}` 再设 `{aiDifficulty:'hard'}`,断言 bgmEnabled / sfxMode 不变。

#### V049-09 P3:`parseQrScanResult` 输入校验太宽松

- 现象:正则匹配数字格式但未校验 octet 0-255 + port 1-65535,可能接受 `999.999.999.999:99999` 等明显非法值。
- 修复:
  - 新增 `_isValidIpv4Octets(octets)` 校验 4 octets 0-255,且拒绝全 0 / 全 255 边界
  - 新增 `_isValidPort(p)` 校验整数 1-65535
  - parseQrScanResult 两条分支(纯 IP:port + http URL)都先过校验再返对象
- 验证:`v049-bug-fixes.test.js` §9 — 17 个 case 覆盖合法 / 边界 / 非法 / URL 形式 / 域名拒绝 / 空 / null。

### B. 移动端响应式正式文档化(代码 v2.5 已落地)

#### GameViewMobile 横屏兜底(.is-landscape class)

- `GameView.vue` 95 行薄壳路由:`matchMedia` 三段检测
  - `(orientation: portrait) and (max-width: 768px)` → mobile
  - `(orientation: landscape) and (max-height: 500px)` → mobile
  - 其他 → desktop
- `GameViewMobile.vue` 1333 行双布局:
  - **竖屏布局**(iPhone 13 375×812 / 通用 360×640 兜底):8% HUD / 15% 队友 / 35% 桌面 / 28% 手牌 / 14% 操作栏
  - **横屏兜底**(.is-landscape class,844×390 等手机横屏):50(顶HUD) / 80(队友+左右AI) / 100(桌面) / 110(手牌) / 50(操作栏)
- `GameViewDesktop.vue` 桌面 1280×800 布局(不受响应式影响)
- 测试:`GameView.test.js` §6 共 7 case 覆盖 7 种 viewport 组合(竖屏窄/宽、横屏矮/高、桌面拉扁等)

### 测试基线

- **33 测试套件 / 1675 用例 / 0 失败**(v0.4.9 的 32 套件 / 1609 用例 + v049-bug-fixes 1 套件 / 66 用例)
- `npm test` 全过,`npm run build` ✓ 1.57s

---

## v0.4.9 (2026-06-28) — AI 难度分档 + 二维码真扫码 + 战绩趋势图 + 真实 SFX + 过 A 重开(32 套件 / 1609 单测全过)

> 本版本主要是**文档化** v2.5 已经在代码里实现的移动端响应式,确保 README / ROADMAP / AGENTS 三处状态一致。代码无新增,所有变更走 `docs:` commit。

### 已落地的移动端响应式(v2.5 / v0.4.0 era 已写,本轮文档同步)

- `GameView.vue` 95 行薄壳路由:`matchMedia` 三段检测
  - `(orientation: portrait) and (max-width: 768px)` → mobile
  - `(orientation: landscape) and (max-height: 500px)` → mobile
  - 其他 → desktop
- `GameViewMobile.vue` 1333 行双布局:
  - **竖屏布局**(iPhone 13 375×812 / 通用 360×640 兜底):8% HUD / 15% 队友 / 35% 桌面 / 28% 手牌 / 14% 操作栏
  - **横屏兜底**(.is-landscape class,844×390 等手机横屏):50(顶HUD) / 80(队友+左右AI) / 100(桌面) / 110(手牌) / 50(操作栏)
- `GameViewDesktop.vue` 桌面 1280×800 布局(不受响应式影响)
- 测试:`GameView.test.js` §6 共 7 case 覆盖 7 种 viewport 组合(竖屏窄/宽、横屏矮/高、桌面拉扁等)

### 测试基线

- **32 测试套件 / 1610 用例 / 0 失败**(v0.4.9 的 1609 + 静态文件版本号断言 1 case)
- `npm test` 全过,`npm run build` ✓ 1.47s

---

## v0.4.9 (2026-06-28) — AI 难度分档 + 二维码真扫码 + 战绩趋势图 + 真实 SFX + 过 A 重开(32 套件 / 1609 单测全过)

> v0.4.8 收官后的 6 大功能增量,完整闭环 mobile+desktop P2P 体验。

### 6 大功能

#### 1. AI 难度分档(`59be6f2`)— Easy / Medium / Hard

- 现象:v0.4.8 只有 Medium(规则 + 贪心),用户要求三档。
- 修复:`guandan-ai.js` 新增 `decideByDifficulty(hand, level)`:
  - **Easy**:Medium + 30% 概率随机 pass
  - **Medium**:现有 `decide()` 不变
  - **Hard**:防守优先(跟牌而非领出)+ 炸弹保留(只用作同长度反压或最后兜底)+ 逢人配延迟使用
- 接入:`AIView.vue` 加难度 radio + `storage.js` 持久化 `aiDifficulty`(默认 medium)
- 验证:`guandan-ai.test.js` §「Hard 难度」共 14 case(防守优先触发炸弹保留,Easy 随机 pass 30%,三档对应到不同手牌胜率基线)。

#### 2. 二维码真扫码加入(`6cec587`)— html5-qrcode 集成

- 现象:v0.4.8 二维码需要手输 IP+端口(用户体验差,开热点场景下尤其)。
- 修复:`JoinView.vue` 接入 `html5-qrcode@2.3.8`:
  - 用 `<video>` + `Html5Qrcode` 调起手机摄像头扫码
  - 扫到 `guandan://<hostIp:hostPort>` URL 自动解析填充
  - 失败降级到 `QrFallbackCard` 文本输入(原有兜底路径保留)
- 验证:`join-view-qrcode.test.js` 8 case(URL 解析 / 摄像头权限失败 fallback / iOS Safari 兼容 / 重复扫码去重)。

#### 3. 战绩趋势图 + 玩家统计(`daa06ca`)— `HistoryChart` 升级

- 现象:v0.4.8 战绩只有原始 record 列表,看不出趋势。
- 修复:`HistoryChart.vue` 升级为多图表:
  - **柱状图**:近 10 局胜负 + 升级数
  - **折线图**:最近 30 局升级趋势
  - **统计卡片**:总胜率 / 平均升级 / 最长连胜 / 当前连胜 / 等级分布
- 数据层:`history.js` 加 `summarize(records)` 纯函数,空 records 返回 `summary = null`,UI 显示「还没有战绩」空态。
- 验证:`history.test.js` §「summary」共 18 case(空 records / 单 record / 多 records / 等级分布边界 / streak 计算)。

#### 4. 真实 SFX + BGM 增强(`b5bbda7` + `daa06ca`)

- 现象:v0.4.8 BGM 走 Kevin MacLeod MP3(7 首),但 SFX 还是 Web Audio 合成(单调)。
- 修复:`audio.js` SFX 部分升级:
  - 单实例 → **4-实例 audio pool 轮询**(快速连击不卡顿)
  - autoplay unlock retry(用户首次手势后再激活 AudioContext)
  - bomb / joker-bomb / pair / straight 用新 ffmpeg 合成(多频段 + ADSR + 噪声爆裂)
- 资源:`src/assets/audio/sfx-{bomb,deal,joker-bomb,pair,single,tick}.mp3`(6 个,16-50KB 范围)
- 验证:`audio.test.js` §14 共 5 case(pool 轮询 / autoplay unlock / 6 SFX 合法性)。

#### 5. 过 A 后「重开一局」P2P 联机(`7b9efb7` + `b5bbda7`)

- 现象:v0.4.8 一局打完需要全部玩家手动回首页 + 重新开房,体验割裂。
- 修复:
  - `useGameLogic.js` `restartMatch()` 新增:重置 `hands/table/currentPlayer/trickHistory/finishedOrder`,保留 `state/level/players/seed`
  - P2P 同步:host 端 `restartMatch` 后 `broadcast(MATCH_RESTART { seed, ghostRank })` → joiner 端 `onMessage` 收到后调用本地 `restartMatch`
  - UI:`GameView.vue` 「过 A」后桌面中央显示「重开一局」金色按钮(只有 host 可点,joiner 等待 toast)
- 验证:`v047-rc2-regression.test.js` §8 共 7 case(host restart 立即生效 + joiner 收到 MATCH_RESTART 后 hands/currentPlayer 同步 + restart 后 playerPlay 正常 + 同 seed 复现原牌序)。

#### 6. UI 主题刷新(`c3af518`)— refresh guandan ui theme

- 现象:v0.4.8 HomeView / RoomView / GameView 视觉风格与 v0.4.x 暗色调有断层。
- 修复:`src/styles/tokens.css` + 各 View 视觉层重做:
  - 翡翠绿(#1e6b3a)统一主色
  - 金(#f5c842)强调色
  - 深蓝星空(#0a1228 / #1a2347)背景
  - 玻璃面板 + 渐变按钮统一样式
- 范围:**视觉层** + **演示层**,不改真实掼蛋规则 / 联机状态机 / 测试套件。

### 测试基线

- **32 测试套件 / 1609 用例 / 0 失败**(v0.4.8 的 972 → 1609,+637 用例)
- 新增/升级套件:
  - `guandan-ai.test.js` 54 → 68(+14,Hard 难度)
  - `history.test.js` 32 → 50(+18,summary + 统计)
  - `v047-rc2-regression.test.js` 56 → 63(+7,MATCH_RESTART)
  - `audio.test.js` 130 → 135(+5,pool + unlock)
  - 其它:扫到的小修 +2
- `npm test` 全过,`npm run build` 6 个新 SFX MP3 全打入 dist/assets/

### 已知问题(留给 v0.4.10)

- GameView 桌面 1280×800 布局在手机横屏(800×360 / 1000×400)下手牌区被压,需重做响应式
- 过 A 重开 host 退出/掉线后 joiner 端 reconnect 路径未覆盖(单元测试只测 happy path)

---

## v0.4.8 (2026-06-28) — BUG-RC3 修复 + 真实 BGM 集成确认(21 套件 / 972 单测全过)

> 复审报告 `guandan-p2p-vue3-recheck-after-latest-claimed-fixes-20260627.md` 列出 5 个残留 bug。本轮集中修 001/002/004/005,003 在 master 已修,真实 BGM 已在 master 接入。

### BUG 清单

#### BUG-RC3-002 — `onHostMigrated` 顺序错误(hand remap 被覆盖)

- 现象:`useGameLogic.js` 原顺序先 `migrateHost` 再 `applySnapshot`。joiner 端在迁移前取的 `payload.snapshot` 是旧 seat 映射,applySnapshot 会把刚搬到 `hands[0]` 的新 host 手牌覆盖回旧 host 的空牌。
- 修复:`src/views/game/useGameLogic.js` 第 178-187 行改为「先 `applySnapshot` 再 `migrateHost`」,先恢复到"迁移前"完整状态,再做座位重映射。
- 验证:`v047-rc2-regression.test.js` §5.5 共 8 case,直接对比两种顺序下 `hands[0]` 的最终手牌,断言只有正确顺序时新 host 看到自己的牌。

#### BUG-RC3-003 — `migrateHost` 用 `abandonedSeats` 区分弃赛(已修,本轮加测试)

- 现象:旧 host 加入 `finishedOrder` 导致新 host(seat 0)被标记为已出完,`playerPlay(0, ...)` 被拒。
- 修复:master 已在 `guandan-game.js:488-495` 改为用 `abandonedSeats`,`playerPlay` 仍只查 `finishedOrder`。
- 验证:`v047-rc2-regression.test.js` §5.6 共 6 case,迁移后 `playerPlay(0, [card])` 返回 `ok:true` 且 `currentPlayer` 推进到下一位。

#### BUG-RC3-004 — host 迁移回归测试覆盖不足(本轮补)

- 现象:原测试只覆盖 `migrateHost` 内部 remap,没覆盖 useGameLogic 顺序、network API 存在性、新 host 出牌。
- 修复:§5.5/5.6/5.7 三块共 19 case 覆盖三大场景(顺序 / 出牌 / API)。
- 验证:v047-rc2-regression.test.js 48 case 全过(原 29 + 新 19)。

#### BUG-RC3-005 — README / package.json / 测试数不一致(本轮修)

- 现象:package.json version 0.4.4,README 写 27 套件 / 1296 用例 / 22 套件 / 1222 用例,v0.4.6/v0.4.x 混用,实际 master HEAD 是 21 套件 / 953 case。
- 修复:
  - `package.json` `version: 0.4.4` → `0.4.8`
  - `README.md` 6 处过时数字统一为 21 套件 / 972 用例 / v0.4.8
  - `AGENTS.md` 测试基线改为 21 套件 / 972 case
  - `docs/CHANGELOG.md` 新增本段

### BUG-RC3-001 — `network.requestPromoteToHost` 存在性(master 已修,本轮加测试)

- 现象:报告指出 useGameLogic 调 `net.requestPromoteToHost` 但 network.js 无该 API。
- 修复:master 已在 `network.js:1246` 实现,带 snapshot 参数,BC 模式本地回环处理升级。
- 验证:`v047-rc2-regression.test.js` §5.7 5 case,`typeof === 'function'` + `selectNextHostCandidate` 默认行为。

### 真实 BGM 集成确认

- master HEAD `842e421` `feat(audio): v0.4.8 N-3 真实 BGM — 7 首 Kevin MacLeod CC-BY MP3` 已在 `audio.js` 接入:
  - `startMp3Bgm()` 用 `<audio>` 加载 22MB MP3
  - 加载失败时降级 Web Audio 合成(保留旧版)
  - 7 种 BGM_TRACKS key(energetic / calm / bossa / ripples / intense / warm / casual)对应 7 首 MP3
  - SettingsView.vue:141-142 已加致谢 `BGM by Kevin MacLeod (incompetech.com), CC BY 4.0`
  - v048-mp3-bgm.test.js 50 case 全过(MP3 合法性 / 风格映射 / 降级 / 音量同步)

### 测试基线

- **21 测试套件 / 972 用例 / 0 失败**(master 953 + BUG-RC3-002/003/004 回归 +19)
- `npm test` 全过,`npm run build` 7 首 MP3 全打入 dist/assets/

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
