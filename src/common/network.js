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
const HEARTBEAT_INTERVAL_MS = 3000
const HEARTBEAT_CHECK_INTERVAL_MS = 5000
const HEARTBEAT_TIMEOUT_MS = 10000
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
 *   - Capacitor WebView: WebSocketTransport
 *   - 其他 (浏览器 / Node 测试): BroadcastChannelTransport
 */
function _defaultTransport() {
  if (typeof window !== 'undefined' && window.Capacitor) {
    return new WebSocketTransport()
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
function off(event) { delete handlers[event] }
function emit(event, ...args) {
  const list = handlers[event] || []
  for (const h of list) { try { h(...args) } catch (e) {} }
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
  } else {
    _handleJoinerMessage(msg)
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
    if (seat != null && peers.has(seat)) {
      peers.delete(seat)
      emit('peer:leave', { seat })
    }
  } else if (msg.type === 'AI_TAKEOVER') {
    // ★ v2.0 BUG-7:joiner 端收到 AI_TAKEOVER → 触发本地 ai:takeover
    const seat = msg.payload?.seat
    if (seat != null) {
      emit('ai:takeover', { seat })
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
  transport.open('self').catch((err) => {
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
  roomId = hostRoomId

  try {
    transport = _createTransport()
  } catch (e) {
    return { ok: false, error: e?.message || 'Transport 创建失败' }
  }
  transport.onMessage(_onTransportMessage)
  // 异步 open。WS joiner 等 ws 连接建立后,再发 JOIN
  const hostIp = (opts && opts.hostIp) || null
  const hostPort = (opts && opts.hostPort) || null
  transport.open('client', hostIp, hostPort).then(() => {
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
  startAsHost, joinRoom, send, broadcast, sendTo,
  scanLanRooms,
  ensureUuid,
  // ★ 测试辅助(不属于公开 API)
  _sendHeartbeat, _tickHeartbeatChecker, _forceExpireHeartbeat,
  _setIntervalFn, _clearIntervalFn, _setTimeoutFn, _clearTimeoutFn,
  __installFakeTimers,
  _setTransportFactory, _resetTransportFactory,
  _getTransport, _getTransportType,
  HEARTBEAT_INTERVAL_MS, HEARTBEAT_CHECK_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS,
  JOIN_RETRY_DELAY_MS,
}

const net = {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat,
  startAsHost, joinRoom, send, broadcast, sendTo,
  scanLanRooms,
}
export default net