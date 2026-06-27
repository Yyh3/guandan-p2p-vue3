/**
 * 局域网 P2P 网络层
 *
 * v2.0 抽象为 Transport 接口,两个实现:
 *   - BroadcastChannelTransport: 浏览器 / Node 测试 (同 origin 多 tab / dynamic-import 多实例)
 *   - WebSocketTransport: 真机 / Capacitor WebView (局域网 ws server / client)
 *
 * 入口选择:
 *   - Capacitor (Android/iOS WebView): WebSocketTransport
 *   - 浏览器: BroadcastChannelTransport
 *
 * 公开 API 与 v3.8 完全一致:
 *   on / off / emit / close,
 *   isHost / isConnected / getSelfInfo / getPeers,
 *   getRoomId / setRoomId / getSelfSeat / setSelfSeat,
 *   startAsHost / joinRoom / send / broadcast / sendTo,
 *   scanLanRooms, ensureUuid,
 *   _sendHeartbeat / _tickHeartbeatChecker / _forceExpireHeartbeat,
 *   _setIntervalFn / _clearIntervalFn / _setTimeoutFn / _clearTimeoutFn,
 *   __installFakeTimers,
 *   HEARTBEAT_INTERVAL_MS / HEARTBEAT_CHECK_INTERVAL_MS / HEARTBEAT_TIMEOUT_MS / JOIN_RETRY_DELAY_MS,
 *   default export
 *
 * v3.8 → v2.0 修复:
 *   - P0 网络层重写: 引入 Transport 抽象,生产走 WebSocket,开发保留 BC
 *   - BUG-7: host 心跳检测 → 直接 emit 'ai:takeover' (不依赖 broadcast loopback,
 *     因为 BC 不回环 / WS host 自己不发给自己,原实现 host.aiPlayers 永远空)
 *   - 保留 v3.8 P1: UUID 复用 / 心跳超时 / 撞座 retry / sendTo 定向过滤
 */

import { BroadcastChannelTransport } from './network-transport-bc.js'
import { WebSocketTransport } from './network-transport-ws.js'
import { AndroidWsTransport } from './network-transport-android-ws.js'
import { isNativeCapacitor } from './ws-server.js'

// ============== 模块状态 ==============
const handlers = {}
let selfInfo = null
let isHostFlag = false
let roomId = ''
let selfSeat = 0
let transport = null
const peers = new Map()           // seat -> {nickname, avatar, uuid, ready, ...}

// ============== 时钟抽象(测试 fake timer 注入点) ==============
let _setIntervalFn = typeof setInterval !== 'undefined' ? setInterval : null
let _clearIntervalFn = typeof clearInterval !== 'undefined' ? clearInterval : null
let _setTimeoutFn = typeof setTimeout !== 'undefined' ? setTimeout : null
let _clearTimeoutFn = typeof clearTimeout !== 'undefined' ? clearTimeout : null

// ============== 心跳状态 ==============
// v2.1 心跳调优:从 3s/5s/10s 收到 2s/2s/6s,实测掉线 joiner 释放 13s → 6-8s 区间。
//   - HEARTBEAT_INTERVAL_MS = 2000:joiner 每 2s 发一次心跳
//   - HEARTBEAT_CHECK_INTERVAL_MS = 2000:host 每 2s 扫一次超时表
//   - HEARTBEAT_TIMEOUT_MS = 6000:6s 没收到心跳视为掉线
//  最坏释放延迟 ≈ TIMEOUT + CHECK_INTERVAL = 8s,平均 ≈ TIMEOUT + CHECK_INTERVAL/2 = 7s。
const HEARTBEAT_INTERVAL_MS = 2000
const HEARTBEAT_CHECK_INTERVAL_MS = 2000
const HEARTBEAT_TIMEOUT_MS = 6000
let heartbeatSendTimer = null
let heartbeatCheckTimer = null
const lastHeartbeat = new Map()   // host: seat -> ts

// ============== UUID 持久化 ==============
const UUID_KEY = 'guandan_session_uuid'

function ensureUuid() {
  try {
    const storage = (typeof sessionStorage !== 'undefined') ? sessionStorage : null
    if (storage) {
      let u = storage.getItem(UUID_KEY)
      if (u) return u
      u = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      try { storage.setItem(UUID_KEY, u) } catch (e) { /* quota / private mode */ }
      return u
    }
  } catch (e) { /* sessionStorage 抛错走 fallback */ }
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ============== Transport 工厂 ==============
let _transportFactory = null

/**
 * 默认 Transport 选择:
 *   - Capacitor WebView (native Android): AndroidWsTransport
 *     (host 走原生 WsServer 插件,joiner 走 WebView 自带 WebSocket)
 *   - 浏览器 / Node 测试: BroadcastChannelTransport
 *   - 浏览器版 v1.0 fallback: WebSocketTransport (test only,需要 npm 'ws')
 */
function _defaultTransport() {
  if (isNativeCapacitor()) {
    return new AndroidWsTransport()
  }
  return new BroadcastChannelTransport()
}

function _createTransport() {
  return _transportFactory ? _transportFactory() : _defaultTransport()
}

/** 测试 / 高级用法:注入自定义 transport 工厂(返回 BroadcastChannelTransport 或 WebSocketTransport 实例) */
function _setTransportFactory(fn) {
  _transportFactory = fn
}

function _resetTransportFactory() {
  _transportFactory = null
}

// ============== 并发撞座 retry ==============
let joinRetryTimer = null
const JOIN_RETRY_DELAY_MS = 300

function scheduleJoinRetry() {
  if (joinRetryTimer) return
  joinRetryTimer = _setTimeoutFn(() => {
    joinRetryTimer = null
    if (!transport) return
    sendMessage({ type: 'JOIN', payload: selfInfo })
  }, JOIN_RETRY_DELAY_MS)
}

function cancelJoinRetry() {
  if (joinRetryTimer) {
    _clearTimeoutFn(joinRetryTimer)
    joinRetryTimer = null
  }
}

// ============== 事件总线 ==============
function on(event, fn) {
  if (!handlers[event]) handlers[event] = []
  handlers[event].push(fn)
}
// v3.x P2-19 修复:off 支持可选 handler 参数 — 不传则删除该事件所有监听器(向后兼容),
//   传了则只删除该 handler 的引用,避免一个组件卸载破坏其他组件的事件订阅
function off(event, fn) {
  if (fn === undefined) {
    delete handlers[event]
    return
  }
  const list = handlers[event]
  if (!list) return
  const idx = list.indexOf(fn)
  if (idx >= 0) list.splice(idx, 1)
  if (list.length === 0) delete handlers[event]
}
function emit(event, ...args) {
  const list = handlers[event] || []
  for (const h of list) { try { h(...args) } catch (e) {} }
}

/**
 * 测试辅助:返回某事件的监听器数量(用于验证 on/off cleanup)。
 * 不属于公开 API,仅测试用。
 */
function _listenerCount(event) {
  const list = handlers[event]
  return list ? list.length : 0
}

/** 测试辅助:返回所有事件名(用于白盒断言 — 某事件监听器是否残留) */
function _listTrackedEvents() {
  return Object.keys(handlers).filter(k => handlers[k] && handlers[k].length > 0)
}

/** 测试辅助:network 是否处于关闭状态(无 transport + 无心跳) */
function _isClosed() {
  return !transport && !heartbeatSendTimer && !heartbeatCheckTimer
}

function getRoomId() { return roomId }
function setRoomId(id) { roomId = id }
function getSelfSeat() { return selfSeat }
function setSelfSeat(i) { selfSeat = i }
function isHost() { return isHostFlag }

function sendMessage(msg) {
  if (!transport) return false
  const payload = { ...msg, from: selfSeat, ts: Date.now() }
  return transport.send(payload)
}

// ============== 心跳(joiner 发送) ==============
const REJOIN_INTERVAL_MS = 15000
let rejoinSendTimer = null
function startHeartbeat() {
  if (heartbeatSendTimer) return
  heartbeatSendTimer = _setIntervalFn(() => {
    if (!transport) return
    sendMessage({ type: 'HEARTBEAT', payload: { ts: Date.now() } })
  }, HEARTBEAT_INTERVAL_MS)
  if (rejoinSendTimer) return
  rejoinSendTimer = _setIntervalFn(() => {
    if (!transport) return
    sendMessage({ type: 'JOIN', payload: selfInfo })
  }, REJOIN_INTERVAL_MS)
}

function stopHeartbeat() {
  if (heartbeatSendTimer) {
    _clearIntervalFn(heartbeatSendTimer)
    heartbeatSendTimer = null
  }
  if (rejoinSendTimer) {
    _clearIntervalFn(rejoinSendTimer)
    rejoinSendTimer = null
  }
}

// ============== 心跳(host 检查) ==============
/**
 * host 心跳检查器,定期扫 lastHeartbeat,超时 seat 释放 + 触发 AI 接管。
 *
 * ★★★ BUG-7 修复要点(以后改的人请勿回退) ★★★
 * 根因:之前 host 检测到 joiner 掉线后,只 broadcast AI_TAKEOVER 消息,
 *       期待自己的 onmessage 收到后调 addAIPlayer。但 BroadcastChannel spec 不回环、
 *       WebSocketTransport host 自己也不接自己 send 出去的消息 → host.aiPlayers 永远空,
 *       AI 接管在 host 端失效,游戏卡住。
 * 修法:host 检测到掉线时,本端直接 emit('ai:takeover', ...) + emit('peer:leave', ...),
 *       不依赖 broadcast 回来再处理。broadcast 仍然发出,目的是通知 joiner 各自
 *       的 onmessage 触发相同事件(joiner 端没有 host 的本地状态,只能靠消息)。
 * 同样适用于:host 自己出牌广播后立刻更新本地桌牌(直接调 game layer,不绕 onmessage)
 */
function startHeartbeatChecker() {
  if (heartbeatCheckTimer) return
  heartbeatCheckTimer = _setIntervalFn(() => {
    const now = Date.now()
    for (const [seat, ts] of lastHeartbeat.entries()) {
      if (now - ts > HEARTBEAT_TIMEOUT_MS) {
        lastHeartbeat.delete(seat)
        const info = peers.get(seat)
        peers.delete(seat)
        // ★ v2.0 BUG-7 修复:host 自己直接 emit 本地事件,不等 broadcast loopback
        emit('peer:leave', { seat, info })
        emit('ai:takeover', { seat, info })
        // 通知 joiner:每个 joiner 端自己的 onmessage 会触发 peer:leave + ai:takeover
        sendMessage({ type: 'PEER_LEAVE', payload: { seat } })
        sendMessage({ type: 'AI_TAKEOVER', payload: { seat } })
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS)
}

function stopHeartbeatChecker() {
  if (heartbeatCheckTimer) {
    _clearIntervalFn(heartbeatCheckTimer)
    heartbeatCheckTimer = null
  }
  lastHeartbeat.clear()
}

// ============== Transport 消息处理 ==============
/**
 * 收到 transport 转发的消息。
 *
 * ★ v2.0 设计原则(消除 BUG-7):
 *   - 不做 self-from 过滤。host 自己的状态变化(AI 接管、本地出牌等)走内部
 *     emit / 直接方法调用,不依赖 broadcast 回来再处理。
 *   - 两个 transport 都保证 host 不会收到自己的 broadcast:
 *       BC: spec 不回环 (BroadcastChannel.postMessage 不发给同实例)
 *       WS: host.send 只遍历 ws client 列表,host 自己不在列表里
 *   - 因此这里只需要做「定向消息过滤」(to != null && to !== selfSeat)
 */
function _onTransportMessage(msg) {
  if (!msg || !msg.type) return
  // 定向消息过滤(to 字段:仅给某 seat 的消息,其他人忽略)
  if (msg.to != null && msg.to !== selfSeat) return
  emit('message', msg)
  emit('message:' + msg.type, msg.payload, msg.from, msg)
  if (isHostFlag) {
    _handleHostMessage(msg)
    // ★ BUG-001:host 处理完本机状态后,把 joiner 消息转发给其它 joiner
    //   必须在 _handleHostMessage 之后调用 — 这样 host 自己的 peers/heartbeat 更新完毕
    //   转发时目标 seat 列表才是最新状态
    //   注:BC 模式下 transport.send 天然广播,relayFromClient 内部已识别 BC 不重复发
    relayFromClient(msg)
  } else {
    _handleJoinerMessage(msg)
  }
}

// ============== BUG-001 修复:host relay joiner 消息 ==============
/**
 * ★ P0 修复:真机 WS 星型拓扑下,joiner 之间的消息(PLAY / PASS / 等)需要 host 转发,
 *   否则 joiner A 出牌,joiner B / C 完全看不见 → 4 人局跑不通。
 *
 * 在 _handleHostMessage 末尾对白名单内的消息调一次,host 把收到的 joiner 消息
 * 转发给其它 joiner(from != msg.from)。
 *
 * 设计要点:
 *   - 只在 isHost 时 relay(joiner 端不转发,避免回环)
 *   - 白名单 RELAY_TYPES 严格控制(防止把 HEARTBEAT / JOIN / _DISCONNECT 等 host-only
 *     消息错误广播给 joiner,这些消息走 host.send 路径即可)
 *   - 转发时覆盖 from(保留原 from),覆盖 to(定向到每个目标 joiner),ts 更新
 *     — 不能直接 transport.send(msg),否则 last sender ws 路由会错乱
 *   - 单 seat 失败不中断其他(try/catch 包住 transport.send)
 *
 * 注:BC 模式下消息天然广播给所有 tab,会自然到达其它 joiner;
 *   WS 模式下 host 必须显式 relay,这是 BUG-001 的修复目标。
 */
const RELAY_TYPES = new Set([
  'PLAY', 'PASS', 'STATE_SNAPSHOT', 'ROUND_END', 'CHAT', 'NICK_UPDATE',
])

function relayFromClient(msg) {
  if (!isHostFlag || !transport || !msg || !RELAY_TYPES.has(msg.type)) return
  if (msg.from == null || msg.from <= 0) return
  // ★ BC 模式天然广播,无需显式 relay(否则会变成 2 倍消息,joiner 端 _handleJoinerMessage
  //   会收到双份,触发双倍 apply)。
  // 只有 WS-like host (server mode)需要显式定向 relay:
  //   - WebSocketTransport host (_mode='self' + _wss != null)
  //   - AndroidWsTransport host (_mode='self',plugin sendToClient)
  // 判定:transport._mode === 'self' 且 transport._channel == null (BroadcastChannelTransport 才有 _channel)
  const isWsLikeHost = transport._mode === 'self' && transport._channel == null
  if (!isWsLikeHost) return
  for (const [seat] of peers.entries()) {
    if (seat <= 0 || seat === msg.from) continue  // 跳过 host 自己 + 原 sender
    try {
      transport.send({
        ...msg,
        from: msg.from,
        to: seat,
        ts: Date.now(),
      })
    } catch (e) {
      // 单 seat 失败不中断其他 — WS 路径下某 joiner ws 可能已 close
    }
  }
}

function _handleHostMessage(msg) {
  if (msg.type === 'JOIN') {
    const newUuid = msg.payload?.uuid
    let assignedSeat = -1
    // ★ v3.8 P1:先扫 peers 找同 uuid → 复用 seat
    if (newUuid) {
      for (const [s, p] of peers.entries()) {
        if (s === 0) continue  // 房主位不让
        if (p && p.uuid === newUuid) { assignedSeat = s; break }
      }
    }
    if (assignedSeat !== -1) {
      const updated = { ...peers.get(assignedSeat), ...msg.payload, uuid: newUuid }
      peers.set(assignedSeat, updated)
      lastHeartbeat.set(assignedSeat, Date.now())
      emit('peer:update', { seat: assignedSeat, info: updated })
      // ★ WebSocket:告诉 transport 这个 ws 对应哪个 seat,后续定向消息才能路由
      if (transport && typeof transport.bindLastSenderSeat === 'function') {
        transport.bindLastSenderSeat(assignedSeat)
      }
      sendMessage({
        type: 'SYNC',
        payload: { peers: Array.from(peers.entries()) },
        to: msg.from,
      })
      // 顺便广播给老 joiner,让他们看到新昵称
      sendMessage({
        type: 'SYNC',
        payload: { peers: Array.from(peers.entries()) },
      })
      return
    }
    // 否则分配新 seat
    const used = new Set(Array.from(peers.keys()))
    for (let i = 1; i < 4; i++) {
      if (!used.has(i)) { assignedSeat = i; break }
    }
    if (assignedSeat === -1) {
      sendMessage({ type: 'ROOM_FULL', payload: { reason: '房间已满' }, to: msg.from })
      return
    }
    peers.set(assignedSeat, msg.payload)
    lastHeartbeat.set(assignedSeat, Date.now())
    if (transport && typeof transport.bindLastSenderSeat === 'function') {
      transport.bindLastSenderSeat(assignedSeat)
    }
    emit('connect', { seat: assignedSeat, info: msg.payload })
    sendMessage({
      type: 'SYNC',
      payload: { peers: Array.from(peers.entries()) },
      to: assignedSeat,  // ★ 改成 assignedSeat,因为 BC 模式下 msg.from=-1 也能通,WS 必须用 assignedSeat
    })
    // 顺便广播给老 joiner
    sendMessage({
      type: 'SYNC',
      payload: { peers: Array.from(peers.entries()) },
    })
  } else if (msg.type === 'NICK_UPDATE') {
    if (peers.has(msg.from)) {
      peers.set(msg.from, { ...peers.get(msg.from), ...msg.payload })
    }
  } else if (msg.type === 'READY') {
    if (peers.has(msg.from)) {
      peers.set(msg.from, { ...peers.get(msg.from), ready: msg.payload.ready })
    }
  } else if (msg.type === 'HEARTBEAT') {
    if (peers.has(msg.from)) {
      lastHeartbeat.set(msg.from, Date.now())
    }
  } else if (msg.type === '_DISCONNECT') {
    // v3.x P1-11 修复(N-1):host 端立即感知 joiner 断连,不再等 6-8s 心跳超时
    // joiner 端 ws.onclose 会 emit _DISCONNECT 上来
    const seat = msg.from
    if (peers.has(seat)) {
      // 标记 lastHeartbeat 为 -1,让 checker 立即知道该 joiner 断了
      lastHeartbeat.set(seat, -1)
      // 可选:立即触发 peer:leave(但 joiner 端 close 时也会触发,避免重复)
      // emit('peer:leave', { seat })
    }
  }
}

function _handleJoinerMessage(msg) {
  if (msg.type === 'SYNC' && msg.payload && msg.payload.peers) {
    peers.clear()
    for (const [seat, info] of msg.payload.peers) {
      peers.set(seat, info)
    }
    // 用 uuid 找自己
    let assignedSeat = -1
    for (let i = 1; i < 4; i++) {
      const p = peers.get(i)
      if (p && p.uuid === selfInfo?.uuid) { assignedSeat = i; break }
    }
    if (assignedSeat === -1) {
      // ★ v3.8 P1:撞座 / SYNC 没带自己 → 300ms 后重发 JOIN
      scheduleJoinRetry()
      return
    }
    cancelJoinRetry()
    selfSeat = assignedSeat
    peers.set(selfSeat, selfInfo)
    emit('connect', { seat: selfSeat })
  } else if (msg.type === 'ROOM_FULL') {
    cancelJoinRetry()
    emit('error', msg.payload?.reason || '房间已满')
  } else if (msg.type === 'PEER_LEAVE') {
    const seat = msg.payload?.seat
    const kicked = msg.payload?.kick === true
    const migrate = msg.payload?.migrate === true
    if (seat != null && peers.has(seat)) {
      peers.delete(seat)
      emit('peer:leave', { seat })
    }
    // ★ v2.1 P1 host 主动踢人:被踢的 joiner 自己跳到 /?force_disconnected=1
    //   BC 路径:host broadcast PEER_LEAVE { kick: true, seat } → 只有被踢的 joiner 命中此分支
    //   WS / AndroidWs 路径:joiner 端 ws.onclose → emit _DISCONNECT → 自己也会走 close 路径,
    //                          但踢人消息走网络层更可靠 (即使 ws onclose 没及时触发也能 navigate)
    if (kicked && seat === selfSeat) {
      emit('self:kicked', { reason: msg.payload?.reason || 'kicked' })
    }
    // ★ v2.1 P3:host 迁移标记 — joiner 收到 PEER_LEAVE { seat: 0, migrate: true }
    //   如果自己是被选中的新 host(newHostSeat) → 升级
    if (migrate && seat === 0) {
      const newHostSeat = msg.payload?.newHostSeat
      if (newHostSeat != null && newHostSeat === selfSeat) {
        // 我就是新 host:把自己升到 seat 0
        const myInfo = peers.get(selfSeat) || selfInfo
        peers.delete(selfSeat)
        peers.set(0, myInfo)
        selfSeat = 0
        isHostFlag = true
        emit('host:migrated', { newHostSeat, snapshot: null, isMyself: true })
      } else if (newHostSeat != null) {
        // 旁观者:等新 host 广播 NEW_HOST,或者这里先占位
        emit('host:migrated', { newHostSeat, snapshot: null, isMyself: false })
      }
    }
  } else if (msg.type === 'AI_TAKEOVER') {
    // ★ v2.0 BUG-7:joiner 端收到 AI_TAKEOVER → 触发本地 ai:takeover
    const seat = msg.payload?.seat
    if (seat != null) {
      emit('ai:takeover', { seat })
    }
  } else if (msg.type === 'NEW_HOST') {
    // ★ v2.1 P3:某 joiner 升级为新 host,广播通知所有 joiner
    const newHostSeat = msg.payload?.newHostSeat
    if (newHostSeat == null) return
    // 检查自己是否就是新 host(自己已经处理过,跳过)
    if (selfSeat === newHostSeat) return
    // 旁观 joiner:更新 host 信息(peers 里 seat 0 = 新 host)
    if (peers.has(newHostSeat)) {
      // 旧 host 已被踢出(在 PEER_LEAVE 时清理),这里把新 host 升到 seat 0
      const newHostInfo = peers.get(newHostSeat)
      peers.delete(newHostSeat)
      peers.set(0, newHostInfo)
      // 新 host 那个 joiner 端之前 setSelfSeat 已经是 0 了(他在 announceNewHost 之前就调了)
      // 旁观者的 selfSeat 不变
      emit('host:migrated', { newHostSeat, snapshot: msg.payload?.snapshot })
    }
  }
}

// ============== 公开 API ==============
/**
 * host 开房。
 *
 * 返回是同步的 `{ok,error?}`(与 v3.8 兼容),不 await transport.open。
 *   - BC: open 同步,直接 ready
 *   - WS: open 异步(server bind),transport 在 ready 之前缓存所有 send,ready 后 flush
 *
 * 错误通过 'error' 事件通知,startAsHost 始终返回 {ok:true}(除非 transport 创建失败)
 */
function startAsHost(self) {
  peers.clear()
  lastHeartbeat.clear()
  selfInfo = { ...self, uuid: ensureUuid() }
  isHostFlag = true
  selfSeat = 0
  peers.set(0, { ...selfInfo })

  try {
    transport = _createTransport()
  } catch (e) {
    return { ok: false, error: e?.message || 'Transport 创建失败' }
  }
  transport.onMessage(_onTransportMessage)
  // 异步 open,fire-and-forget。WS 模式下 send 在 ready 前会被 transport 缓存。
  // ★ BUG-005 修复:BC transport 需要 roomId 构造独立 channel name (`guandan-p2p-<roomId>`),
  //   否则所有 host 都用 'default' channel → 多个 host 串号 / joiner 串房
  //   WS / AndroidWs transport 不需要 roomId(走 ws host:port 直连,不走 BC channel name)
  const openPromise = (transport instanceof BroadcastChannelTransport)
    ? transport.open('self', roomId || 'default')
    : transport.open('self')
  openPromise.catch((err) => {
    emit('error', err?.message || 'Transport open failed')
  })
  startHeartbeatChecker()
  return { ok: true }
}

/**
 * joiner 加入房间。
 *
 * @param {string} hostRoomId
 * @param {{nickname:string,avatar:string}} self
 * @param {object} [opts] —— 可选,用于 WebSocketTransport 模式
 * @param {string} [opts.hostIp] —— host IP (WS 必填,例如 '192.168.1.5' / '127.0.0.1')
 * @param {number} [opts.hostPort] —— 默认 8848
 */
function joinRoom(hostRoomId, self, opts) {
  selfInfo = { ...self, uuid: ensureUuid() }
  isHostFlag = false
  selfSeat = -1
  // 兼容签名: hostRoomId 含 ':' 时解析为 ws host:port 形式 (Android Capacitor 路径)
  // 不含 ':' 或 ':' 后面没合法端口时 → 当 BC 房间号 (浏览器路径)
  let parsedHostIp = (opts && opts.hostIp) || null
  let parsedHostPort = (opts && opts.hostPort) || null
  let isWsMode = false
  if (parsedHostIp && parsedHostPort) {
    isWsMode = true
  } else if (typeof hostRoomId === 'string' && hostRoomId.indexOf(':') >= 0) {
    const idx = hostRoomId.lastIndexOf(':')
    const candidateIp = hostRoomId.slice(0, idx)
    const candidatePort = parseInt(hostRoomId.slice(idx + 1), 10)
    if (candidateIp && !Number.isNaN(candidatePort) && candidatePort > 0 && candidatePort < 65536) {
      parsedHostIp = candidateIp
      parsedHostPort = candidatePort
      isWsMode = true
    }
  }
  roomId = isWsMode ? 'ws' : hostRoomId

  try {
    transport = _createTransport()
  } catch (e) {
    return { ok: false, error: e?.message || 'Transport 创建失败' }
  }
  transport.onMessage(_onTransportMessage)
  // 异步 open。WS joiner 等 ws 连接建立后,再发 JOIN
  // ★ BUG-005 修复:BC transport 需要 roomId 构造独立 channel name,否则 joiner 用任何
  //   roomId 都连到 'default' channel,跟 host 房号对不上 → 4-tab 联机不同房间串号
  //   WS 模式:传 hostIp/hostPort 给 transport.open(走 ws server,不走 BC channel name)
  //   WS 模式 joiner 走的是 ws 直连,不依赖 roomId 隔离
  let openPromise
  if (isWsMode) {
    openPromise = transport.open('client', parsedHostIp, parsedHostPort)
  } else if (transport instanceof BroadcastChannelTransport) {
    openPromise = transport.open('client', roomId || 'default')
  } else {
    openPromise = transport.open('client', null, null)
  }
  openPromise.then(() => {
    if (!transport) return
    // 立即发 JOIN。joiner 端 selfSeat=-1,host 会按 uuid 复用或分配新 seat
    sendMessage({ type: 'JOIN', payload: selfInfo })
    // 启动心跳发送
    startHeartbeat()
  }).catch((err) => {
    emit('error', err?.message || 'Transport open failed')
  })
  return { ok: true }
}

function send(payload) { return sendMessage(payload) }
function broadcast(payload) { return sendMessage(payload) }
function sendTo(seat, payload) { return sendMessage({ ...payload, to: seat }) }

// ============== v2.2 task B:跨设备 joinRemoteRoom ==============
/**
 * 解析 hostAddress 字符串为 {hostIp, hostPort}。
 *
 * 接受的格式:
 *   - '192.168.1.5:8848' → {hostIp: '192.168.1.5', hostPort: 8848}
 *   - '192.168.1.5'      → {hostIp: '192.168.1.5', hostPort: 8848} (默认端口)
 *   - '[2001:db8::1]:8848' → IPv6 with brackets
 *
 * 抛出 Error 当格式无效(空 / 多余的 ':' / 端口非法 / IP 段数不对)。
 *
 * @param {string} hostAddress
 * @returns {{hostIp: string, hostPort: number}}
 */
function parseHostAddress(hostAddress) {
  if (typeof hostAddress !== 'string') {
    throw new Error('hostAddress 必须是字符串')
  }
  const trimmed = hostAddress.trim()
  if (!trimmed) {
    throw new Error('hostAddress 不能为空')
  }
  // IPv6 [::1]:8848
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']')
    if (close < 0) throw new Error('hostAddress IPv6 格式错误(缺少 "]")')
    const hostIp = trimmed.slice(1, close)
    const rest = trimmed.slice(close + 1)
    if (!rest.startsWith(':')) throw new Error('hostAddress IPv6 缺少端口(":" )')
    const port = parseInt(rest.slice(1), 10)
    if (Number.isNaN(port) || port <= 0 || port >= 65536) {
      throw new Error('hostAddress 端口非法: ' + rest.slice(1))
    }
    return { hostIp, hostPort: port }
  }
  // IPv4 / hostname:port or IPv4
  const colonIdx = trimmed.lastIndexOf(':')
  if (colonIdx < 0) {
    // 无端口,默认 8848
    return { hostIp: trimmed, hostPort: 8848 }
  }
  const hostIp = trimmed.slice(0, colonIdx)
  const portStr = trimmed.slice(colonIdx + 1)
  if (!hostIp) {
    throw new Error('hostAddress 缺少 IP(空)')
  }
  if (!portStr) {
    // 末尾 ':' — 非法
    throw new Error('hostAddress 端口为空')
  }
  const port = parseInt(portStr, 10)
  if (Number.isNaN(port) || port <= 0 || port >= 65536) {
    throw new Error('hostAddress 端口非法: ' + portStr)
  }
  // 拒绝像 'foo:bar' (端口非数字) 但允许 host 内多 ':' (IPv4 用 :8888,host 部分 ':' 不是合法 IPv4,
  // 实际 IPv4 不会含 ':',所以 portStr 非数字就 throw)
  return { hostIp, hostPort: port }
}

/**
 * ★ v2.2 task B:跨设备 joiner API
 *
 * 浏览器 joiner 通过 WebSocketTransport 远程连入真机 / 另一台电脑 host。
 *
 * 跟 joinRoom(roomId, self, opts) 的区别:
 *   - joinRoom(roomId='ws-host:port', self, {hostIp, hostPort}) 走 WS 模式
 *     **前提**是 transport 是 WebSocketTransport。浏览器默认走 BCTransport,
 *     所以 joiner 在浏览器里调 joinRoom 传 hostIp,会拿到 BCTransport,hostIp 被忽略,
 *     BC 模式没有远程连接能力。
 *   - joinRemoteRoom(hostAddress, self) 显式注入 WebSocketTransport 作为 client,
 *     然后走 joinRoom 的 WS 路径,让浏览器能连远程 ws://host:8848。
 *
 * 调用方(RoomView.vue)在 ?host=IP:port URL 参数存在时调本方法。
 * 完成后行为与 joinRoom 一致:'connect' / 'error' / 'self:kicked' / 'peer:leave'
 * / 'message:*' 等事件正常触发。
 *
 * @param {string} hostAddress —— 'IP' / 'IP:port',端口默认 8848
 * @param {{nickname:string,avatar:string}} self
 * @returns {{ok: boolean, error?: string}}
 */
function joinRemoteRoom(hostAddress, self) {
  let parsed
  try {
    parsed = parseHostAddress(hostAddress)
  } catch (e) {
    return { ok: false, error: e?.message || 'hostAddress 解析失败' }
  }
  // 注入 transport factory:把当前 transport 换成 WebSocketTransport client。
  // ★ 仅当用户没注入过 factory 时才注入默认 factory(避免覆盖测试 / 高级用法已注入的 factory)。
  //   如果用户之前调过 _setTransportFactory(fn),我们尊重他们的选择,假设 fn 会返回合适的 WS 客户端。
  if (!_transportFactory) {
    _setTransportFactory(() => new WebSocketTransport())
  }
  // 复用 joinRoom 的 WS 路径 — 它内部会解析 hostIp/hostPort,创建 transport,open,发 JOIN,启心跳
  return joinRoom(hostAddress, self, { hostIp: parsed.hostIp, hostPort: parsed.hostPort })
}

function close() {
  stopHeartbeat()
  stopHeartbeatChecker()
  cancelJoinRetry()
  if (transport) { try { transport.close() } catch (e) {} transport = null }
  selfInfo = null
  isHostFlag = false
  selfSeat = 0
  peers.clear()
  lastHeartbeat.clear()
}

// ============== v2.1 P3:Host 迁移 ==============
/**
 * 选下一个 host 候选 —— 队友优先(seat 2),然后左手对手(1)、右手对手(3)
 *
 * ★ 简化设计:不弹选人 UI,直接按规则选第一个还在场的 joiner
 * (按 seats 数组顺序: 2, 1, 3)
 *
 * @returns {number} 新 host 候选 seat(0/1/2/3),0 表示无候选(全掉光)
 */
function selectNextHostCandidate() {
  // 优先级:seat 2 (队友) > seat 1 (左手) > seat 3 (右手)
  for (const seat of [2, 1, 3]) {
    if (peers.has(seat)) return seat
  }
  return 0  // 没人了
}

/**
 * Host 主动发起迁移 —— host 自踢或心跳超时后调用
 *
 * ★ 跟 task B kick player 的区别:
 *   - kick player:踢某个 joiner,host 自己留下继续
 *   - host 迁移:host 自己走,选个 joiner 升为新 host
 *
 * 流程:
 *   1) 选候选升级者(队友优先)
 *   2) 广播 PEER_LEAVE { seat: 0, migrate: true } 给所有 joiner
 *   3) joiner 端收到后选自己是否为新 host(seat === newHostSeat)
 *   4) 升级者把 selfSeat 改为 0,广播 NEW_HOST 消息
 *
 * ★ 调用前提:调用方需保证已经在 GameView 层调 game.value.migrateHost(0, newHostSeat)
 *
 * @param {number} newHostSeat 选中的新 host 原 seat(1/2/3)
 * @returns {boolean} true=成功发起
 */
function requestHostMigration(newHostSeat) {
  if (!isHostFlag) return false
  if (![1, 2, 3].includes(newHostSeat)) {
    // 调用方没传 → 自动选
    newHostSeat = selectNextHostCandidate()
    if (newHostSeat === 0) return false  // 没人了,牌局结束
  }
  // 广播 PEER_LEAVE + 迁移标记
  sendMessage({
    type: 'PEER_LEAVE',
    payload: { seat: 0, migrate: true, newHostSeat },
  })
  return true
}

/**
 * 升级者收到自己被选中,广播 NEW_HOST 通知所有 joiner
 *
 * @param {object} [snapshot] — 当前 game state 快照(可选,joiner 端用来同步)
 */
function announceNewHost(snapshot) {
  if (isHostFlag) return false  // 自己已经是 host,不需要
  sendMessage({
    type: 'NEW_HOST',
    payload: { newHostSeat: selfSeat, snapshot: snapshot || null },
  })
  return true
}

function isConnected() { return !!transport }
function getPeers() { return peers }
function getSelfInfo() { return selfInfo }

/**
 * 扫描局域网房间 —— v1.0 浏览器版 / v2.0 都不返回真实数据,JoinView 显示空状态
 */
async function scanLanRooms() { return [] }

// ============== 测试辅助 API ==============
function _sendHeartbeat() {
  if (!transport) return
  sendMessage({ type: 'HEARTBEAT', payload: { ts: Date.now() } })
}

function _tickHeartbeatChecker() {
  if (!heartbeatCheckTimer) return false
  const now = Date.now()
  for (const [seat, ts] of lastHeartbeat.entries()) {
    if (now - ts > HEARTBEAT_TIMEOUT_MS) {
      lastHeartbeat.delete(seat)
      const info = peers.get(seat)
      peers.delete(seat)
      emit('peer:leave', { seat, info })
      emit('ai:takeover', { seat, info })  // ★ v2.0 BUG-7
      sendMessage({ type: 'PEER_LEAVE', payload: { seat } })
      sendMessage({ type: 'AI_TAKEOVER', payload: { seat } })
    }
  }
  return true
}

function _forceExpireHeartbeat(seat) {
  lastHeartbeat.set(seat, Date.now() - HEARTBEAT_TIMEOUT_MS - 1000)
}

function __installFakeTimers(opts) {
  if (opts && typeof opts.setInterval === 'function') _setIntervalFn = opts.setInterval
  if (opts && typeof opts.clearInterval === 'function') _clearIntervalFn = opts.clearInterval
  if (opts && typeof opts.setTimeout === 'function') _setTimeoutFn = opts.setTimeout
  if (opts && typeof opts.clearTimeout === 'function') _clearTimeoutFn = opts.clearTimeout
}

/** 测试用:获取当前 transport(用于诊断端口等) */
function _getTransport() { return transport }
function _getTransportType() {
  if (!transport) return null
  return transport.constructor.name
}

export {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat,
  startAsHost, joinRoom, joinRemoteRoom, parseHostAddress, send, broadcast, sendTo,
  scanLanRooms,
  ensureUuid,
  // ★ v2.1 P3:host 迁移 API
  selectNextHostCandidate, requestHostMigration, announceNewHost,
  // ★ 测试辅助(不属于公开 API)
  _sendHeartbeat, _tickHeartbeatChecker, _forceExpireHeartbeat,
  _setIntervalFn, _clearIntervalFn, _setTimeoutFn, _clearTimeoutFn,
  __installFakeTimers,
  _setTransportFactory, _resetTransportFactory,
  _getTransport, _getTransportType,
  // ★ BUG-004/005 测试辅助:验证监听器 cleanup + roomId 隔离
  _listenerCount, _listTrackedEvents, _isClosed,
  HEARTBEAT_INTERVAL_MS, HEARTBEAT_CHECK_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS,
  JOIN_RETRY_DELAY_MS,
}

const net = {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat,
  startAsHost, joinRoom, joinRemoteRoom, send, broadcast, sendTo,
  scanLanRooms,
  // ★ v2.1 P3:host 迁移
  selectNextHostCandidate, requestHostMigration, announceNewHost,
}
export default net