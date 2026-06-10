/**
 * 局域网 P2P 网络层（浏览器版）
 *
 * 浏览器没有原生 TCP，用 BroadcastChannel + LocalStorage 模拟
 * 适用于：同浏览器多标签页联机（开发/演示用）
 *
 * 真机部署：用 plus.android.* / plus.ios.* 替换 send/broadcast
 *
 * v3.8 修复记录：
 *   - P0 Bug 1（死锁）：joiner 创建 channel 后立即发 JOIN，host 收到后回 SYNC；
 *     joiner 自己发的 JOIN 不会被自己的 onmessage 吞掉（from===selfSeat 过滤
 *     是 joiner 端 selfSeat=-1 时 -1===-1，等于过滤掉；host 端 selfSeat=0，
 *     -1!==0 不过滤——自洽性已验）。
 *   - P0 Bug 2（sendTo 不过滤）：host + joiner 的 onmessage 顶部对称加
 *     `if (msg.to != null && msg.to !== selfSeat) return`。
 *   - P0 Bug 3（scanLanRooms 假数据）：返回 []，并加 JSDoc 说明浏览器版不支持
 *     真实 LAN 扫描。
 *   - P1 Bug 1（UUID 去重）：UUID 由 network.js 内部 sessionStorage 注入，
 *     joiner 重连（刷新 tab）后 host 按 uuid 复用原 seat，不分配新座位。
 *   - P1 Bug 2（心跳 + 断线检测）：joiner 每 3s 发 HEARTBEAT，host 每 5s 扫
 *     lastHeartbeat，超 10s 未收到则释放 seat 并广播 PEER_LEAVE。
 *   - P1 Bug 3（并发撞座）：joiner 收到 SYNC 但找不到自己时 300ms 重发 JOIN，
 *     host 走 Bug 1 复用路径分配 seat。
 */

const handlers = {}
let selfInfo = null
let isHostFlag = false
let roomId = ''
let selfSeat = 0
let channel = null
const peers = new Map()  // seat -> {nickname, avatar, uuid, ready, ...}

// ============== 时钟抽象（测试 fake timer 注入点） ==============
let _setIntervalFn = typeof setInterval !== 'undefined' ? setInterval : null
let _clearIntervalFn = typeof clearInterval !== 'undefined' ? clearInterval : null
let _setTimeoutFn = typeof setTimeout !== 'undefined' ? setTimeout : null
let _clearTimeoutFn = typeof clearTimeout !== 'undefined' ? clearTimeout : null

// ============== 心跳状态 ==============
const HEARTBEAT_INTERVAL_MS = 3000       // joiner 发心跳间隔
const HEARTBEAT_CHECK_INTERVAL_MS = 5000 // host 检查间隔
const HEARTBEAT_TIMEOUT_MS = 10000       // host 判定 joiner 断线阈值
let heartbeatSendTimer = null            // joiner 端
let heartbeatCheckTimer = null           // host 端
const lastHeartbeat = new Map()          // host: seat -> ts

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

// ============== 并发撞座 retry ==============
let joinRetryTimer = null
const JOIN_RETRY_DELAY_MS = 300

function scheduleJoinRetry() {
  if (joinRetryTimer) return  // ★ 去抖：已有定时器就不排
  joinRetryTimer = _setTimeoutFn(() => {
    joinRetryTimer = null
    if (!channel) return
    // 重发 JOIN，host 走 Bug 1 复用路径分配 seat
    sendMessage({ type: 'JOIN', payload: selfInfo })
  }, JOIN_RETRY_DELAY_MS)
}

function cancelJoinRetry() {
  if (joinRetryTimer) {
    _clearTimeoutFn(joinRetryTimer)
    joinRetryTimer = null
  }
}

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
  if (!channel) return false
  const payload = { ...msg, from: selfSeat, ts: Date.now() }
  channel.postMessage(payload)
  return true
}

// ============== 心跳（joiner 发送） ==============
// ★ v3.8 P1 修复：joiner 每 15s 重发一次 JOIN（连同心跳）
// 场景：host 刷新 / 网络闪断 / 多 tab 中 host 实例被替换 → joiner 自动恢复
// host 的 JOIN 处理对同 uuid 是幂等的（合并更新，不重复分配 seat）
const REJOIN_INTERVAL_MS = 15000
let rejoinSendTimer = null
function startHeartbeat() {
  if (heartbeatSendTimer) return
  heartbeatSendTimer = _setIntervalFn(() => {
    if (!channel) return
    sendMessage({ type: 'HEARTBEAT', payload: { ts: Date.now() } })
  }, HEARTBEAT_INTERVAL_MS)
  if (rejoinSendTimer) return
  rejoinSendTimer = _setIntervalFn(() => {
    if (!channel) return
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

// ============== 心跳（host 检查） ==============
function startHeartbeatChecker() {
  if (heartbeatCheckTimer) return
  heartbeatCheckTimer = _setIntervalFn(() => {
    const now = Date.now()
    for (const [seat, ts] of lastHeartbeat.entries()) {
      if (now - ts > HEARTBEAT_TIMEOUT_MS) {
        lastHeartbeat.delete(seat)
        const info = peers.get(seat)
        peers.delete(seat)
        emit('peer:leave', { seat, info })
        // 广播通知其它 joiner（PEER_LEAVE 由各 joiner 端 onmessage 处理）
        // 同时通知对局:这个 seat 已被 AI 接管,其他 3 人继续打
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

function startAsHost(self) {
  peers.clear()
  lastHeartbeat.clear()
  // ★ P1 Bug 1：自动注入 uuid（不依赖调用方）
  selfInfo = { ...self, uuid: ensureUuid() }
  isHostFlag = true
  selfSeat = 0
  peers.set(0, { ...selfInfo })
  try {
    channel = new BroadcastChannel('guandan-p2p-' + (roomId || 'default'))
  } catch (e) {
    return { ok: false, error: 'BroadcastChannel 不支持' }
  }
  channel.onmessage = (event) => {
    const msg = event.data
    if (!msg || msg.from === selfSeat) return
    // ★ v3.8 Bug 2 修复：定向消息过滤
    if (msg.to != null && msg.to !== selfSeat) return
    emit('message', msg)
    emit('message:' + msg.type, msg.payload, msg.from, msg)
    if (msg.type === 'JOIN') {
      // ★ P1 Bug 1：先扫 peers 找同 uuid → 复用 seat
      const newUuid = msg.payload?.uuid
      let assignedSeat = -1
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
        sendMessage({
          type: 'SYNC',
          payload: { peers: Array.from(peers.entries()) },
          to: msg.from,
        })
        return  // 复用完成，不分配新 seat
      }
      // 否则正常找下一个空位
      const used = new Set(Array.from(peers.keys()))
      for (let i = 1; i < 4; i++) {
        if (!used.has(i)) { assignedSeat = i; break }
      }
      if (assignedSeat === -1) {
        sendMessage({ type: 'ROOM_FULL', payload: { reason: '房间已满' }, to: msg.from })
        return
      }
      peers.set(assignedSeat, msg.payload)
      lastHeartbeat.set(assignedSeat, Date.now())  // ★ P1 Bug 2：初始心跳时间
      emit('connect', { seat: assignedSeat, info: msg.payload })
      sendMessage({
        type: 'SYNC',
        payload: { peers: Array.from(peers.entries()) },
        to: msg.from,
      })
      // ★ v3.8 P1 修复:也广播给老 joiner,否则后加入的玩家不被老 joiner 知道
      // (老 joiner 拿不到新玩家昵称,4-tab 端到端会显示 AI-西/北/东)
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
      // ★ P1 Bug 2：host 收到 joiner 心跳，更新 lastHeartbeat
      if (peers.has(msg.from)) {
        lastHeartbeat.set(msg.from, Date.now())
      }
    }
  }
  // ★ P1 Bug 2：启动 host 心跳检查
  startHeartbeatChecker()
  return { ok: true }
}

function joinRoom(hostRoomId, self) {
  // ★ P1 Bug 1：自动注入 uuid（不依赖调用方）
  selfInfo = { ...self, uuid: ensureUuid() }
  isHostFlag = false
  selfSeat = -1  // 等待 host 分配
  roomId = hostRoomId
  try {
    channel = new BroadcastChannel('guandan-p2p-' + hostRoomId)
  } catch (e) {
    return { ok: false, error: 'BroadcastChannel 不支持' }
  }
  channel.onmessage = (event) => {
    const msg = event.data
    if (!msg || msg.from === selfSeat) return
    // ★ v3.8 Bug 2 修复：定向消息过滤（对称）
    if (msg.to != null && msg.to !== selfSeat) return
    emit('message', msg)
    emit('message:' + msg.type, msg.payload, msg.from, msg)
    if (msg.type === 'SYNC' && msg.payload.peers) {
      peers.clear()
      for (const [seat, info] of msg.payload.peers) {
        peers.set(seat, info)
      }
      // ★ P1 Bug 1：用 uuid 找自己（nickname 可能重复，uuid 不会）
      let assignedSeat = -1
      for (let i = 1; i < 4; i++) {
        const p = peers.get(i)
        if (p && p.uuid === selfInfo.uuid) { assignedSeat = i; break }
      }
      if (assignedSeat === -1) {
        // ★ P1 Bug 3：并发撞座 / SYNC 没带自己 → 300ms 后重发 JOIN
        scheduleJoinRetry()
        return
      }
      cancelJoinRetry()  // 成功分配，清 retry
      selfSeat = assignedSeat
      // 覆盖 host 占位，刷新成自己最新 info
      peers.set(selfSeat, selfInfo)
      emit('connect', { seat: selfSeat })
      // ★ v3.8 Bug 1 修复：不再回 JOIN，host 已经通过 SYNC 知道我们的 seat
    } else if (msg.type === 'ROOM_FULL') {
      cancelJoinRetry()
      emit('error', msg.payload?.reason || '房间已满')
    } else if (msg.type === 'PEER_LEAVE') {
      // ★ P1 Bug 2：joiner 收到 host 广播的 PEER_LEAVE → 释放本地 seat 视图
      const seat = msg.payload?.seat
      if (seat != null && peers.has(seat)) {
        peers.delete(seat)
        emit('peer:leave', { seat })
      }
    }
  }
  // ★ v3.8 Bug 1 修复：创建 channel 后立即发 JOIN，host 收到后回 SYNC
  // P1: payload 现在含 uuid（selfInfo 注入后）
  sendMessage({ type: 'JOIN', payload: selfInfo })
  // ★ P1 Bug 2：启动 joiner 心跳发送
  startHeartbeat()
  return { ok: true }
}

function send(payload) { return sendMessage(payload) }
function broadcast(payload) { return sendMessage(payload) }
function sendTo(seat, payload) { return sendMessage({ ...payload, to: seat }) }

function close() {
  // ★ P1 Bug 2：关闭前清心跳 timer（防内存泄漏）
  stopHeartbeat()
  stopHeartbeatChecker()
  cancelJoinRetry()
  if (channel) { try { channel.close() } catch (e) {} channel = null }
}

function isConnected() { return !!channel }
function getPeers() { return peers }
function getSelfInfo() { return selfInfo }

/**
 * 扫描局域网房间
 * @returns {Promise<Array<{ip: string, name: string}>>}
 *
 * v1.0 浏览器版不支持真实 LAN 扫描（BroadcastChannel 只在同 origin 同浏览器互通），
 * 始终返回空数组。真实 LAN 扫描需 v2.0 接入 TCP 平台（见 docs/NETWORK.md §6）。
 *
 * JoinView 收到 [] 时，UI 应显示「未发现房间，请让房主把房间号发你」并允许手动输入房间号。
 */
async function scanLanRooms() {
  return []
}

// ============== 测试辅助 API（下划线开头，不属于公开 API） ==============
/** joiner：模拟一次心跳发送（直接调 callback） */
function _sendHeartbeat() {
  if (!channel) return
  sendMessage({ type: 'HEARTBEAT', payload: { ts: Date.now() } })
}
/** host：手动驱动一次心跳检查（直接调 callback） */
function _tickHeartbeatChecker() {
  if (!heartbeatCheckTimer) return false
  // 回调内部会跑检查逻辑，模拟时间走过
  const now = Date.now()
  for (const [seat, ts] of lastHeartbeat.entries()) {
    if (now - ts > HEARTBEAT_TIMEOUT_MS) {
      lastHeartbeat.delete(seat)
      const info = peers.get(seat)
      peers.delete(seat)
      emit('peer:leave', { seat, info })
      sendMessage({ type: 'PEER_LEAVE', payload: { seat } })
    }
  }
  return true
}
/** host：把某 seat 的 lastHeartbeat 强制设到 11s 前 */
function _forceExpireHeartbeat(seat) {
  lastHeartbeat.set(seat, Date.now() - HEARTBEAT_TIMEOUT_MS - 1000)
}


/**
 * fake timer injection (ESM exports are read-only)
 */
function __installFakeTimers(opts) {
 if (opts && typeof opts.setInterval === 'function') _setIntervalFn = opts.setInterval
 if (opts && typeof opts.clearInterval === 'function') _clearIntervalFn = opts.clearInterval
 if (opts && typeof opts.setTimeout === 'function') _setTimeoutFn = opts.setTimeout
 if (opts && typeof opts.clearTimeout === 'function') _clearTimeoutFn = opts.clearTimeout
}

export {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat,
  startAsHost, joinRoom, send, broadcast, sendTo,
  scanLanRooms,
  ensureUuid,
  // ★ 测试辅助（不属于公开 API）
  _sendHeartbeat, _tickHeartbeatChecker, _forceExpireHeartbeat,
  _setIntervalFn, _clearIntervalFn, _setTimeoutFn, _clearTimeoutFn,
 __installFakeTimers,
  HEARTBEAT_INTERVAL_MS, HEARTBEAT_CHECK_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS,
  JOIN_RETRY_DELAY_MS,
}

// Default export for convenient `import net from '@/common/network.js'`
const net = {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat,
  startAsHost, joinRoom, send, broadcast, sendTo,
  scanLanRooms,
}
export default net