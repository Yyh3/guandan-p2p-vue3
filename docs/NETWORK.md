# P2P 网络层 (`network.js`)

> 当前 v1.0 实现是浏览器版 (`BroadcastChannel`)。**真机跨设备联机需 v2.0 重写**。这份文档解释现状和迁移路径。

---

## 一、模块定位

**职责**:抽象 P2P 通信,提供「事件总线 + 房间管理 + 定向/广播消息」接口。

**不负责**:
- 不存游戏状态(只存 peers 元数据:昵称/头像/ready)
- 不调引擎/AI
- 不知道 Vue

**调用方**:
- `RoomView.vue` 用 `startAsHost / joinRoom / broadcast` 开房/加入/同步
- `GameView.vue` 用 `broadcast({ type: 'PLAY', ... })` 同步出牌
- `NicknameEditor.vue` 用 `broadcast({ type: 'NICK_UPDATE' })` 同步昵称

---

## 二、当前实现:`BroadcastChannel` 浏览器版

**v1.0 实现原理**:
- 浏览器 API `BroadcastChannel(name)` 创建同 origin 跨标签页通信通道
- 每个房间一个 channel:`guandan-p2p-<roomId>`
- 消息格式:`{ type, payload, from, to?, ts }`

**限制**:
- ❌ **跨设备完全不联**(`BroadcastChannel` 只在同浏览器同 origin 有效)
- ❌ 跨域名的两个浏览器窗口(Chrome vs Safari)不互通
- ✅ 适合开发/演示:同浏览器开 4 标签页模拟 4 玩家

**典型使用**:

```js
import net from '@/common/network.js'

// 1. 房主开房
net.setRoomId('123456')
net.on('peer:join', ({ seat, info }) => console.log('玩家加入', seat, info))
net.startAsHost({ nickname: '我', avatar: '🀄' })

// 2. 其他人加入
net.joinRoom('123456', { nickname: 'B', avatar: '♠' })

// 3. 发消息
net.broadcast({ type: 'READY', payload: { ready: true } })

// 4. 收消息
net.on('game:play', (payload, from) => { ... })
```

---

## 三、消息事件

`network.js` 内部用 `handlers` 字典维护事件订阅。

### 3.1 通用事件

| 事件 | payload | 触发时机 |
|------|---------|----------|
| `peer:join` | `{ seat, info }` | 新玩家加入 |
| `peer:leave` | `{ seat }` | 玩家离开 |
| `peer:update` | `{ seat, info }` | 玩家信息更新 |
| `connect` | `{ seat }` | 自己成功连接 |
| `error` | `{ error }` | 网络错误 |
| `message` | `(msg)` | 收到任何消息(原始) |
| `message:<type>` | `(payload, from, msg)` | 收到指定 type 的消息 |

### 3.2 业务事件(`type` 字段)

| type | 用途 | 调用方 |
|------|------|--------|
| `JOIN` | 玩家加入 | 状态机 / RoomView |
| `SYNC` | 房主同步当前所有 peers 给新加入者 | 状态机 |
| `NICK_UPDATE` | 昵称 / 头像更新 | NicknameEditor |
| `READY` | 准备 / 取消准备 | RoomView |
| `PLAY` | 出牌 | GameView |
| `PASS` | 过牌 | GameView |
| `CHAT_QUICK` | 快捷聊天(留 v2.0 接口) | GameView(v2.0) |
| `GAME_START` | 房主开局 | RoomView |
| `LEVEL_UP` | 升级 | GameView |

---

## 四、API 参考

### 4.1 生命周期

```js
// 房主
net.startAsHost(selfInfo)  // selfInfo: { nickname, avatar, ... }
  → { ok: true } | { ok: false, error }

// 加入者
net.joinRoom(hostRoomId, selfInfo)
  → { ok: true } | { ok: false, error }

// 关闭
net.close()
```

### 4.2 消息发送

```js
net.broadcast({ type: 'X', payload: {...} })  // 群发
net.sendTo(seat, { type: 'X', payload: {...} })  // 定向
net.send({ type: 'X', payload: {...} })  // 同 broadcast
```

### 4.3 状态查询

```js
net.isHost()          // bool
net.isConnected()     // bool
net.getSelfSeat()     // 0-3
net.getSelfInfo()     // { nickname, avatar, ... }
net.getPeers()        // Map<seat, peerInfo>
net.getRoomId()       // string
```

### 4.4 事件订阅

```js
net.on('event', handler)
net.off('event')  // 清空某事件所有 handler
```

---

## 五、v1.0 内部实现细节

### 5.0 v3.8 修复说明(2026-06-09)

> 详细 spec: `.harness/specs/v3.8-network-p0.md`  本节是简要索引

| Bug | 表现 | 根因 | 修复 |
|---|---|---|---|
| **Bug 1 死锁**(P0 致命) | 4-tab 联机永远卡在「等待对方准备」 | `joinRoom` 创建 channel 后啥也不发,`startAsHost` 创建后啥也不广播,互相等 | joiner 创建 channel 后**立即**发 `JOIN`,host 收到后回 `SYNC`(含完整 peers 列表);joiner 收到 SYNC 后反查 `peers[].nickname === self.nickname` 找到自己 seat |
| **Bug 2 `sendTo` 不过滤**(P0 高) | `sendTo(1, X)` 三个 joiner 全收到 | host/joiner 的 `onmessage` 顶部不看 `msg.to` | host + joiner **对称**加 `if (msg.to != null && msg.to !== selfSeat) return` |
| **Bug 3 `scanLanRooms` 假数据**(P0 中) | JoinView 显示假房间「本机(广播通道)」 | 旧实现返回 `[{ip: '127.0.0.1', name: '...'}]` | 改返回 `[]`,JSDoc 说明浏览器版不支持 LAN 扫描 |

**配套修复(PM 审计发现)**:`src/views/room/RoomView.vue` 调用顺序错——`startAsHost` 在 `setRoomId` 之前,导致 host channel name 永远 = `default`,joiner 用 6 位数字 roomNo 永远对不上。已调换顺序(先 `setRoomId` 再 `startAsHost`)。

**自洽性验证**(Bug 1):
- joiner 发的 JOIN `from = -1`
- joiner 端 `from === selfSeat`(`-1 === -1`)= **过滤掉**(joiner 不处理自己发的)✓
- host 端 `from === selfSeat`(`-1 === 0`)= **不过滤**(继续)✓
- host 回 SYNC `to: -1`
- joiner 端 `msg.to !== selfSeat`(`-1 !== -1`)= **不过滤**(继续)✓

**新增测试**:
- `src/common/network.test.js` — 单实例 + Mock BroadcastChannel(38 用例)
- `src/common/network-multitab.test.js` — 跨实例 + 真实 BroadcastChannel(40 用例,模拟多 tab 联调)

**已知未做**(留给 v3.8 后面的 round):
- joiner 突然 `close()` 时 host 释放 seat(目前 seat 永久占用,直到 4-tab 跑完一局)
- 心跳检测 + 断线重连(v2.0 真机再做)

### 5.1 房主开房流程

```js
function startAsHost(self) {
  selfInfo = self
  isHostFlag = true
  selfSeat = 0                        // 房主固定坐 0(下)
  peers.set(0, self)                  // 自己入 peers
  channel = new BroadcastChannel('guandan-p2p-' + roomId)

  channel.onmessage = (event) => {
    const msg = event.data
    if (msg.from === selfSeat) return  // 忽略自己的消息
    emit('message', msg)
    emit('message:' + msg.type, msg.payload, msg.from, msg)

    if (msg.type === 'JOIN') {
      peers.set(msg.from, msg.payload)         // 记录新玩家
      emit('connect', { seat: msg.from, info: msg.payload })
      // 同步当前所有 peers 给新加入者
      sendMessage({ type: 'SYNC', payload: { peers: [...peers] }, to: msg.from })
    }
    // ... 处理 NICK_UPDATE / READY
  }
}
```

### 5.2 加入者流程

```js
function joinRoom(hostRoomId, self) {
  channel = new BroadcastChannel('guandan-p2p-' + hostRoomId)
  selfSeat = -1  // 等待分配
  channel.onmessage = (event) => {
    const msg = event.data
    if (msg.type === 'SYNC' && msg.payload.peers) {
      // 把房主传来的 peers 全记录
      for (const [seat, info] of msg.payload.peers) peers.set(seat, info)
      // 找空位
      const used = new Set([...peers.keys()])
      for (let i = 1; i < 4; i++) {
        if (!used.has(i)) { selfSeat = i; break }
      }
      peers.set(selfSeat, self)
      // 通知房主
      sendMessage({ type: 'JOIN', payload: self })
      emit('connect', { seat: selfSeat })
    }
  }
}
```

**座位分配**:
- 房主固定 seat 0
- 加入者从 seat 1 开始找空位
- 上限 4 人

---

## 六、v2.0 真机联机迁移路径

### 6.1 目标

把 `network.js` 内部实现从 `BroadcastChannel` 换成 **TCP Socket**(主机开热点,4 手机连热点,1 个 host 3 个 client)。

### 6.2 推荐方案

**TCP Socket + 移动热点**

- 房主开热点,启动 TCP Server 监听 `0.0.0.0:8849`
- 加入者连房主 IP(如 `192.168.43.1:8849`)
- 4 人通过长连接 + 房间号配对
- 消息走 JSON over TCP,加长度前缀

### 6.3 实现步骤

**Step 1:平台抽象层**

新建 `src/common/network-platform.js`:

```js
// 平台接口
export interface NetPlatform {
  listen(port: number): Promise<void>           // 房主:开 server
  connect(host: string, port: number): Promise<void>  // 加入者
  send(data: any): void
  onMessage(callback: (data: any) => void): void
  close(): void
}
```

**Step 2:平台实现**

- `network-platform.web.js` — 浏览器版(BroadcastChannel,当前实现)
- `network-platform.capacitor.js` — Capacitor 版(用 `@capacitor/network` 或自定义插件)
- `network-platform.tcp-android.js` — Android 原生 TCP
- `network-platform.tcp-ios.js` — iOS GameKit Multipeer Connectivity

**Step 3:`network.js` 改用平台抽象**

```js
import { getPlatform } from './network-platform.js'
const platform = getPlatform()

// 内部用 platform.listen / platform.send / platform.onMessage
// 对外 API 不变(startAsHost / joinRoom / broadcast / on)
```

**Step 4:Capacitor 插件**

- Android:用 Java/Kotlin 写 TCP Socket 服务,通过 `registerPlugin` 暴露给 JS
- iOS:用 Swift 写 Multipeer Connectivity 桥接

### 6.4 备选方案对比

| 方案 | 难度 | 兼容性 | 延迟 | 实现成本 |
|------|------|--------|------|----------|
| TCP Socket + 热点 | 中 | 全平台 | < 100ms | 中 |
| WiFi Direct (Android) | 中 | 仅 Android 7+ | < 200ms | 中 |
| Multipeer Connectivity (iOS) | 中 | 仅 iOS 7+ | < 200ms | 中 |
| 蓝牙 BLE | 高 | 全平台 | 200-500ms | 高 |

**推荐**:先做 **TCP Socket + 热点**,跨平台 SDK 最好,延迟低。

### 6.5 迁移期间保留

- `network.js` 对外 API 不变 → 现有 View 不用改
- `BroadcastChannel` 实现可作为 web 平台的 fallback
- 在 `startAsHost` 内部加 platform 判断:浏览器走 BroadcastChannel,真机走 TCP

---

## 七、调试技巧

### 7.1 看消息流

```js
// 在 network.js onmessage 顶部加:
console.log('[NET]', msg)
```

### 7.2 测 4 标签联机

1. `npm run dev` 启动
2. 浏览器开 4 个标签页(同一浏览器)
3. 标签 1 → 首页 → 开热点建房 → 拿到房间号
4. 标签 2-4 → 首页 → 连热点加入 → 输入房间号
5. 4 标签同步,F12 控制台看 `[NET]` 日志

### 7.3 测真机(等 v2.0)

1. 4 台手机连同一 WiFi
2. 1 台开热点
3. 其他 3 台连热点
4. APK 安装,扫码或输入房主 IP

---

## 八、修改 checklist

改 `network.js` 前:

1. **不破坏对外 API**:`startAsHost / joinRoom / broadcast / on / off` 签名稳定
2. **保持纯事件驱动**:不引入 Promise 替代事件
3. **不存游戏状态**:peers 只存元数据,不存手牌/牌型
4. **支持 web + 真机**:内部用平台抽象,不要硬编码 BroadcastChannel
5. **加测试**:消息路由、座位分配、peers 同步是测试重点

---

## 九、安全注意

- ❌ **不验证消息内容**:当前实现信任所有 peer,真机联机需加签名/校验防作弊
- ❌ **不限制延迟**:网络不好时会卡住,真机版可加心跳检测 + 断线重连
- ✅ **零公网依赖**:消息只走局域网,无外泄风险

**v2.0 候选**:
- 消息来源校验(防伪)
- 超时断线(30s 没收到心跳 → 视为掉线)
- 断线重连(自动重试,带重连状态)

---

**下一步**:
- 改 View 接网络事件 → `docs/UI.md`
- 加消息事件 → 改 `network.js` 顶层 + View 监听
- v2.0 真机迁移 → 单独开 plan,先实现 TCP Socket
