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
import { isMdnsAvailable, registerMdnsService, stopMdns, watchMdnsServices } from './network-mdns.js'

// ============== 模块状态 ==============
const handlers = {}
let selfInfo = null
let isHostFlag = false
let roomId = ''
let selfSeat = 0
let hostSeat = 0
let transport = null
let mdnsRegStop = null            // v0.4.22:mDNS 注册停止函数
const peers = new Map()           // seat -> {nickname, avatar, uuid, ready, ...}

// ============== Phase 2:hostEpoch 权威纪元 ==============
// hostEpoch 在每次 host 权威变更(开房/host 迁移/重建)时自增,
// 所有 host 权威消息必须携带并校验 epoch,防止 stale host 的过期消息被误用。
let hostEpoch = 0
function getHostEpoch() { return hostEpoch }
function setHostEpoch(v) { hostEpoch = (typeof v === 'number' && Number.isFinite(v)) ? v : 0 }
function _bumpHostEpoch() { hostEpoch = (hostEpoch >= Number.MAX_SAFE_INTEGER - 1) ? 1 : hostEpoch + 1 }
function _resetHostEpoch() { hostEpoch = 0 }

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

// ============== v0.4.22 P1:局域网房间扫描发现 ==============
const DEFAULT_WS_PORT = 8848
const ROOM_PROBE_TIMEOUT_MS = 1200
const SCAN_HTTP_TIMEOUT_MS = 800
const SCAN_CONCURRENCY = 8
const MAX_SCAN_CANDIDATES = 200
const COMMON_SUBNETS = ['192.168.43', '192.168.1', '192.168.0', '172.20.10', '10.0.0']

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

// ============== v0.4.22 P0-06:host 迁移私密状态暂存 ==============
// 主动 host 迁移时,完整四家手牌 snapshot 只定向发给新 host,
// 其他 joiner 只收到公开 PEER_LEAVE 迁移通知。此处保存本端收到的
// 定向 HOST_MIGRATION_SECRET_STATE,供后续 PEER_LEAVE migrate 分支读取。
let _pendingMigrationSecret = null

// ============== v0.4.20 peer hostAddress 持久化缓存 ==============
// 真正的"第二发现通道"纯 JS 实现(不依赖 mDNS / UDP / 固定服务):
//   joiner 端把所有 peer 的 hostAddress + canHost 缓存到 localStorage(跨 session),
//   host 崩溃后其他 joiner 用 smartReconnectToPeers() 循环 try-connect 缓存的地址,
//   找到第一个能连的就是新 host(新 host 已起 server 在该地址)。
//
// 局限:
//   - 本地 localStorage 只能存 joiner 自己见过的 peer;新加的 joiner 没缓存
//   - smart reconnect 是"猜",不是发现 — 但配合 v0.4.19 确定性选举已经够用:
//     新 host 升级后会广播 TRANSPORT_REBUILD_ANNOUNCE / PEER_LEAVE(含 newHostAddress)
//     其他 joiner 收到后能 connect;接收不到的 joiner 走 smartReconnectToPeers 兜底
//
// 存储格式: localStorage[`guandan-v0420-peer-cache-${roomNo}`] = JSON.stringify([
//   { seat, hostAddress, canHost, ts }
// ])
const PEER_CACHE_KEY_PREFIX = 'guandan-v0420-peer-cache-'
const PEER_CACHE_MAX_AGE_MS = 60 * 60 * 1000  // 1 小时

const isValidSeat = (s) => typeof s === 'number' && s >= 0 && s <= 3

function _peerCacheKey(roomNo) { return PEER_CACHE_KEY_PREFIX + (roomNo || 'default') }

function _loadPeerCache(roomNo) {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(_peerCacheKey(roomNo))
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    // 过滤过期(> 1 小时) + 字段缺失
    const now = Date.now()
    return arr.filter(e =>
      e && typeof e.hostAddress === 'string' && e.hostAddress &&
      typeof e.canHost === 'boolean' &&
      typeof e.ts === 'number' && (now - e.ts) < PEER_CACHE_MAX_AGE_MS
    )
  } catch (e) { return [] }
}

function _savePeerCache(roomNo, entries) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(_peerCacheKey(roomNo), JSON.stringify(entries))
  } catch (e) { /* quota / private mode */ }
}

// 写入/更新单个 peer 的 hostAddress 缓存
//   调用方:peer:join handler(收到 canHost + hostAddress 时)
function cachePeerHostAddress(roomNo, seat, hostAddress, canHost) {
  if (!roomNo || typeof seat !== 'number' || seat < 1 || seat > 3) return
  if (typeof hostAddress !== 'string' || !hostAddress) return
  const entries = _loadPeerCache(roomNo)
  const filtered = entries.filter(e => e.seat !== seat)
  filtered.push({ seat, hostAddress, canHost: !!canHost, ts: Date.now() })
  // 按 seat 去重后保留最多 8 条(seat 0/1/2/3 + 一些备份)
  const deduped = {}
  for (const e of filtered) deduped[e.seat] = e
  const final = Object.values(deduped).sort((a, b) => b.ts - a.ts).slice(0, 8)
  _savePeerCache(roomNo, final)
}

// 读取缓存的 peer 列表(按 canHost=true 优先,再按 ts 最新)
//   调用方:smartReconnectToPeers() / 调试 UI
function getCachedPeerHostAddresses(roomNo) {
  const entries = _loadPeerCache(roomNo)
  return entries
    .filter(e => e.canHost && e.hostAddress)
    .sort((a, b) => (b.ts - a.ts))  // 最新优先
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

// ============== Host 迁移去重 ==============
// v3.x P2-29:多个 joiner 同时调 requestPromoteToHost 时,记录第一个升级的 seat。
//   后续请求如果 newHostSeat !== _promotedHostSeat,直接走"让位"分支(旁观者更新 peers),
//   避免一房多主。
let _promotedHostSeat = null

// ============== V0419 确定性本地选举 ==============
// v0.4.19:选下一个 host 候选 — 避免 v0.4.18 多 joiner 同时本地升级冲突
//   算法:
//     1. 先筛掉 finishedOrder / abandonedSeats(已出完牌/弃赛)
//     2. 优先 canHost=true 候选(WS server / AndroidWs native / BC)
//     3. 同等条件下 UUID 字典序最小(确定性,所有 joiner 算出同一个结果)
//   返回:number (seat 1/2/3) 或 null(没有候选)
function selectNextHostCandidate(excludedSeats = []) {
  // 收集候选:[seat, uuid, canHost]
  const excluded = new Set(excludedSeats)
  const candidates = []
  for (let seat = 1; seat <= 3; seat++) {
    if (excluded.has(seat)) continue
    const info = peers.get(seat)
    if (!info || !info.uuid) continue
    candidates.push({ seat, uuid: info.uuid, canHost: info.canHost === true })
  }
  if (candidates.length === 0) return null
  // 优先 canHost=true
  const canHostList = candidates.filter(c => c.canHost)
  const pool = canHostList.length > 0 ? canHostList : candidates
  // UUID 字典序最小
  pool.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0))
  return pool[0].seat
}

// v0.4.19:本端 transport 是否有"作为新 host 起 server"的能力
//   - BC:共享 channel,本身就是 host 模式,canHost=true
//   - AndroidWs:用 Capacitor WsServer plugin,canHost=true
//   - WS:在 Node 环境有 ws server 能力(浏览器 ws 无),通过 typeof process 检测
function canHostAsNewHost() {
  if (!transport) return false
  const t = transport.type
  if (t === 'bc') return true
  if (t === 'android-ws') return true
  if (t === 'ws') {
    // 浏览器 ws 无 server 能力;Node ws 有(用 ws npm 包)
    // 检测:typeof process !== 'undefined' && process.versions?.node
    return !!(typeof process !== 'undefined' && process.versions && process.versions.node)
  }
  return false
}

// v0.4.19:取本端 hostAddress(WS server bind 后的 IP:port)
//   - WS / AndroidWs:用 transport.getHostIp() + getBoundPort()
//   - BC:null(共享 channel 无 hostAddress 概念)
function getSelfHostAddress() {
  if (!transport) return null
  if (typeof transport.getHostIp !== 'function') return null
  const ip = transport.getHostIp()
  if (!ip) return null
  if (typeof transport.getBoundPort !== 'function') return null
  const port = transport.getBoundPort()
  if (!port) return null
  return `${ip}:${port}`
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
function getHostSeat() { return hostSeat }

/**
 * v0.4.22 P0-08:统一设置 hostSeat,并同步到 transport 层(避免 host-only 广播 from 硬编码 0)。
 * @param {number} seat
 */
function _setHostSeat(seat) {
  hostSeat = seat
  if (transport && typeof transport.setHostSeat === 'function') {
    try { transport.setHostSeat(seat) } catch (_) {}
  }
}
function isHost() { return isHostFlag }
function isAuthorityMessage(msg) {
  if (!msg || msg.from !== hostSeat) return false
  // ★ P0 修复:host 权威消息必须携带 hostEpoch。
  //   - 不再兼容"无 epoch"旧消息,杜绝 stale host 的过期消息被误用。
  //   - 本地 epoch 为 0(尚未初始化)时,host 第一条 SYNC 会带 epoch,joiner 用此值完成自举,
  //     之后严格按此 epoch 校验。epoch 自举完成后不再接受任何外部修改。
  if (msg.hostEpoch == null) return false
  if (hostEpoch === 0) {
    hostEpoch = msg.hostEpoch
    return true
  }
  return msg.hostEpoch === hostEpoch
}

function sendMessage(msg) {
  if (!transport) return false
  const payload = { ...msg, from: selfSeat, ts: Date.now() }
  // host 发出的权威消息自动带 epoch,joiner 带自己的 epoch 无意义
  if (isHostFlag && payload.hostEpoch == null) payload.hostEpoch = hostEpoch
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
        // ★ v2.4-p4 BUG-007:被踢的 seat 即使心跳超时也不重复处理
        //   kickPlayer 已经清掉 lastHeartbeat / peers / emit 过 peer:leave,
        //   任何延迟心跳到达都不会重新触发 (HEARTBEAT 消息 handler 也会跳过 _kickedSeats)
        //   这里再保险一次:即使被踢 seat 在 lastHeartbeat 里残留(测试或边缘 race),
        //   也不应该再触发 peer:leave
        if (_kickedSeats.has(seat)) {
          lastHeartbeat.delete(seat)
          continue
        }
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
  //   host 不能过滤,因为 host 需要 relay 定向消息给目标 seat。
  if (msg.to != null && !isHostFlag && msg.to !== selfSeat) return
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
  // ★ P0-03:PLAY/PASS 改为 host 权威 COMMITTED 广播,不再由 joiner 直接 relay
  'PLAY_COMMITTED', 'PLAY_REJECTED', 'PASS_COMMITTED', 'PASS_REJECTED',
  'STATE_SNAPSHOT', 'ROUND_END', 'CHAT', 'NICK_UPDATE', 'READY',
  // ★ V049-04 修复:把 MATCH_RESTART 加入 WS relay 白名单
  //   之前遗漏导致 joiner 端发起的 MATCH_RESTART(异常恢复 / 迁移后 host)无法被 host relay 给其它 joiner
  'MATCH_RESTART',
  // ★ P0-07:SEAT_SWAP 改为 host 权威 COMMITTED 广播
  'SEAT_SWAP_COMMITTED',
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

  // ★ Phase 2 修复:保留 joiner 指定的定向 to,不要覆盖成广播
  if (msg.to != null) {
    if (msg.to <= 0 || msg.to === msg.from || !peers.has(msg.to)) return
    try {
      transport.send({
        ...msg,
        from: msg.from,
        ts: Date.now(),
      })
    } catch (e) {}
    return
  }

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
  // v0.4.22 P1:未绑定 seat 的扫描请求,host 直接回复房间摘要
  if (msg.type === 'ROOM_PROBE') {
    sendMessage({
      type: 'ROOM_PROBE_ACK',
      payload: {
        roomNo: roomId,
        playerCount: peers.size,
        maxPlayers: 4,
        hostNickname: selfInfo?.nickname || '',
      },
    })
    return
  }
  if (msg.type === 'JOIN') {
    const newUuid = msg.payload?.uuid
    let assignedSeat = -1
    // ★ v3.8 P1:先扫 peers 找同 uuid → 复用 seat
    if (newUuid) {
      for (const [s, p] of peers.entries()) {
        if (s === hostSeat) continue  // 当前 host 座位不让
        if (p && p.uuid === newUuid) { assignedSeat = s; break }
      }
    }
    if (assignedSeat !== -1) {
      const updated = { ...peers.get(assignedSeat), ...msg.payload, uuid: newUuid }
      peers.set(assignedSeat, updated)
      lastHeartbeat.set(assignedSeat, Date.now())
      // ★ GD-RC-002 修复:host 端 _kickedSeats 在新玩家分配/复用 seat 时清理。
      //   之前清理代码写在 joiner 端 SYNC handler(line 468 附近),
      //   joiner 端 _kickedSeats 通常为空,清没意义;host 端残留未真正清理
      //   → 新玩家 HEARTBEAT 仍被 host 忽略 → 再次踢人返回 already kicked
      if (_kickedSeats.has(assignedSeat)) {
        _kickedSeats.delete(assignedSeat)
      }
      emit('peer:update', { seat: assignedSeat, info: updated })
      // ★ v0.4.20 V0420 修复:peer:update 触发 hostAddress 缓存
      //   joiner 上报 hostAddress + canHost 时,host 端缓存到 localStorage
      //   供 host 崩溃后其他 joiner smartReconnectToPeers 用
      if (updated.hostAddress) {
        try { cachePeerHostAddress(roomId, assignedSeat, updated.hostAddress, updated.canHost) } catch (_) {}
      }
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
    // ★ GD-RC-002 修复:同上,新分配 seat 时清理 _kickedSeats
    if (_kickedSeats.has(assignedSeat)) {
      _kickedSeats.delete(assignedSeat)
    }
    if (transport && typeof transport.bindLastSenderSeat === 'function') {
      transport.bindLastSenderSeat(assignedSeat)
    }
    emit('connect', { seat: assignedSeat, info: msg.payload })
    // v0.4.8 N-2:AI 补位通知 — host 端 emit peer:join,useGameLogic 监听后
    //   从 game.aiPlayers 移除该 seat,更新 UI
    emit('peer:join', { seat: assignedSeat, info: msg.payload })
    // ★ v0.4.20 V0420 修复:peer:join 触发 hostAddress 缓存
    //   joiner 上报 hostAddress + canHost 时,host 端缓存到 localStorage
    //   供 host 崩溃后其他 joiner smartReconnectToPeers 用
    if (msg.payload && msg.payload.hostAddress) {
      try { cachePeerHostAddress(roomId, assignedSeat, msg.payload.hostAddress, msg.payload.canHost) } catch (_) {}
    }
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
    // ★ Phase 2:host 端校验 READY payload 合法
    if (!peers.has(msg.from)) return
    if (typeof msg.payload?.ready !== 'boolean') return
    peers.set(msg.from, { ...peers.get(msg.from), ready: msg.payload.ready })
    // ★ P1-05 修复:host 广播权威 READY_COMMITTED,让所有 joiner 的 ready 状态一致。
    //   原 READY 消息继续 relay 作为兼容,但 joiner 应以 READY_COMMITTED 为准。
    broadcast({
      type: 'READY_COMMITTED',
      payload: { seat: msg.from, ready: msg.payload.ready }
    })
  } else if (msg.type === 'SEAT_SWAP_REQUEST') {
    // ★ P0-07:只有 host 能提交座位交换;joiner 只能发 REQUEST
    if (!isHostFlag) return
    if (!msg.payload) return
    const { a, b } = msg.payload
    const requester = msg.from
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) return
    if (a < 0 || a > 3 || b < 0 || b > 3) return
    // 只允许对家互换,且请求者必须是 a/b 之一
    if (!((a + 2) % 4 === b || (b + 2) % 4 === a)) return
    if (requester !== a && requester !== b) return
    _applySeatSwapLocal(a, b)
    // 广播 COMMITTED(走 RELAY_TYPES 让 WS host 转发给其它 joiner)
    sendMessage({ type: 'SEAT_SWAP_COMMITTED', payload: { a, b, ts: Date.now() } })
  } else if (msg.type === 'HEARTBEAT') {
    if (peers.has(msg.from)) {
      // ★ v2.4-p4 BUG-007:被踢 joiner 在 ws 完全关闭前可能还有最后一帧心跳,
      //   跳过被踢 seat,防止 6-8s 心跳窗口把"被踢的"重新认作"在房"。
      if (_kickedSeats.has(msg.from)) return
      lastHeartbeat.set(msg.from, Date.now())
    }
  } else if (msg.type === '_DISCONNECT') {
    // v3.x P1-11 修复(N-1):host 端立即感知 joiner 断连,不再等 6-8s 心跳超时
    // joiner 端 ws.onclose 会 emit _DISCONNECT 上来
    const seat = msg.from
    if (peers.has(seat)) {
      // ★ v2.4-p4 BUG-007:被踢 joiner 的 ws.onclose 触发的 _DISCONNECT 不要再触发清理
      //   (kickPlayer 已经清过 peers / lastHeartbeat / emit 过 peer:leave)
      if (_kickedSeats.has(seat)) return
      // 标记 lastHeartbeat 为 -1,让 checker 立即知道该 joiner 断了
      lastHeartbeat.set(seat, -1)
      // 可选:立即触发 peer:leave(但 joiner 端 close 时也会触发,避免重复)
      // emit('peer:leave', { seat })
    }
  }
}

function _handleJoinerMessage(msg) {
  if (msg.type === '_DISCONNECT') {
    // ★ P0-02 修复:joiner 端 transport(client)关闭时 payload.seat === -1,
    //   说明与 host 的 WebSocket 已断开(host 崩溃/断电/杀进程/网络中断)。
    //   原逻辑错误地写在 _handleHostMessage 中,因 isHostFlag 永远为 true 而不会触发;
    //   现在放到 joiner 端处理,emit host:lost 让 GameView/RoomView 提示并跳回首页。
    if (msg.payload && msg.payload.seat === -1 && !isHostFlag && !_kickedSeats.has(-1)) {
      emit('host:lost', { reason: 'client_disconnect', ts: Date.now() })
    }
  } else if (msg.type === 'SEAT_SWAP_COMMITTED') {
    // ★ P0-07:joiner 端只接受 host 权威的座位交换提交
    if (!isAuthorityMessage(msg)) return
    if (!msg.payload) return
    const a = msg.payload.a
    const b = msg.payload.b
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) return
    if (a < 0 || a > 3 || b < 0 || b > 3) return
    _applySeatSwapLocal(a, b)
  } else if (msg.type === 'READY_COMMITTED') {
    // ★ P1-05 修复:joiner 只接受 host 权威的 ready 状态提交。
    if (!isAuthorityMessage(msg)) return
    if (!msg.payload) return
    const { seat, ready } = msg.payload
    if (!isValidSeat(seat)) return
    if (typeof ready !== 'boolean') return
    if (peers.has(seat)) {
      peers.set(seat, { ...peers.get(seat), ready })
    }
  } else if (msg.type === 'KICKED') {
    // ★ v2.4-p4 BUG-007:joiner 端收到 host 定向发的 KICKED,立即跳页
    //   KICKED 比 PEER_LEAVE 优先级更高,因为它直达被踢者,不需要根据 seat 字段匹配
    //   注意:KICKED 是定向消息(to=seat),其它 joiner 不会收到
    const payload = msg.payload || {}
    _emitSelfKicked(payload.reason, payload.ts)
    // ★ 通知 host 端 transport 关闭(joiner 端 transport 自己 close 会触发 _DISCONNECT)
    //   不在这里主动 close transport,留给 ws.onclose 自然路径,避免与 _DISCONNECT 重复
  } else if (msg.type === 'SYNC' && msg.payload && msg.payload.peers) {
    // ★ Phase 2:SYNC 只能由 host 权威发出
    if (!isAuthorityMessage(msg)) return
    peers.clear()
    for (const [seat, info] of msg.payload.peers) {
      peers.set(seat, info)
      // ★ 静态审查 BUG-D 修复:新玩家被分配到某 seat 时,如果该 seat 之前
      //   已被踢过(_kickedSeats 包含),需要清掉该标记。否则该玩家后续
      //   心跳的 from===seat 会被 host 忽略,被误判掉线,无法正常再次踢出。
      if (_kickedSeats.has(seat)) {
        _kickedSeats.delete(seat)
      }
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
  } else if (msg.type === 'HOST_MIGRATION_SECRET_STATE') {
    // ★ P0-06 修复:host 主动迁移的完整 state 只定向发给新 host,
    //   非目标 seat 应忽略;收到后先暂存,等公开 PEER_LEAVE migrate 到达时一并应用。
    if (msg.to !== selfSeat) return
    const p = msg.payload || {}
    if (p.newHostSeat !== selfSeat) return
    _pendingMigrationSecret = {
      oldHostSeat: p.oldHostSeat,
      newHostSeat: p.newHostSeat,
      snapshot: p.snapshot || null,
    }
  } else if (msg.type === 'PEER_LEAVE') {
    const seat = msg.payload?.seat
    const kicked = msg.payload?.kick === true
    const migrate = msg.payload?.migrate === true
    if (seat != null && peers.has(seat)) {
      peers.delete(seat)
      // ★ v2.4-p4 BUG-007:joiner 端 emit peer:leave 时携带 kicked 标记
      //   让旁观 joiner 的 UI 立即响应(不等心跳)
      emit('peer:leave', { seat, kicked })
    }
    // ★ v2.1 P1 host 主动踢人:被踢的 joiner 自己跳到 /?force_disconnected=1
    //   BC 路径:host broadcast PEER_LEAVE { kick: true, seat } → 只有被踢的 joiner 命中此分支
    //   WS / AndroidWs 路径:joiner 端 ws.onclose → emit _DISCONNECT → 自己也会走 close 路径,
    //                          但踢人消息走网络层更可靠 (即使 ws onclose 没及时触发也能 navigate)
    if (kicked && seat === selfSeat) {
      // ★ v2.4-p4 BUG-007:兼容 KICKED 协议,携带 ts 字段(joiner 端可能在 KICKED
      //   之前收到 PEER_LEAVE 时也跳页,所以 self:kicked 必须有完整 payload)
      _emitSelfKicked(msg.payload?.reason, msg.payload?.ts)
    }
    // ★ v2.1 P3:host 迁移标记 — joiner 收到 PEER_LEAVE { seat: oldHostSeat, migrate: true }
    //   座位稳定:新旧 host 都保持各自逻辑 seat 不变,只切换 isHostFlag / hostSeat。
    if (migrate) {
      const oldHostSeat = seat
      const newHostSeat = msg.payload?.newHostSeat
      // v3.x P2-23 修复(N-3):公开 PEER_LEAVE 不再携带 snapshot(P0-06 防泄露),
      //   新 host 从定向 HOST_MIGRATION_SECRET_STATE 读取,旁观者无 snapshot。
      let snap = msg.payload?.snapshot ?? null
      if (!snap && _pendingMigrationSecret && _pendingMigrationSecret.newHostSeat === selfSeat) {
        snap = _pendingMigrationSecret.snapshot
      }
      if (newHostSeat != null && newHostSeat === selfSeat) {
        // 我就是新 host:权威切换到本 seat,不搬动 selfSeat
        peers.delete(oldHostSeat)
        _setHostSeat(selfSeat)
        _resetHostEpoch()
        _bumpHostEpoch()
        isHostFlag = true
        emit('host:migrated', { oldHostSeat, newHostSeat, snapshot: snap, isMyself: true })
      } else if (newHostSeat != null) {
        // 旁观者:同步 hostSeat,保留新 host peer 在原 seat;重置 epoch 以接受新 host
        peers.delete(oldHostSeat)
        _setHostSeat(newHostSeat)
        _resetHostEpoch()
        _bumpHostEpoch()
        emit('host:migrated', { oldHostSeat, newHostSeat, snapshot: snap, isMyself: false })
      }
      // 迁移处理完毕,清理私密暂存
      _pendingMigrationSecret = null
    }
  } else if (msg.type === 'AI_TAKEOVER') {
    // ★ Phase 2:AI_TAKEOVER 只能由 host 权威发出
    if (!isAuthorityMessage(msg)) return
    // ★ v2.0 BUG-7:joiner 端收到 AI_TAKEOVER → 触发本地 ai:takeover
    const seat = msg.payload?.seat
    if (seat != null) {
      emit('ai:takeover', { seat })
    }
  } else if (msg.type === 'NEW_HOST') {
    // ★ v2.1 P3:某 joiner 升级为新 host,广播通知所有 joiner
    //   座位稳定:新 host 保持原逻辑 seat,只同步 hostSeat。
    const newHostSeat = msg.payload?.newHostSeat
    if (newHostSeat == null) return
    // 检查自己是否就是新 host(自己已经处理过,跳过)
    if (selfSeat === newHostSeat) return
    if (peers.has(newHostSeat)) {
      _setHostSeat(newHostSeat)
      _resetHostEpoch()
      _bumpHostEpoch()
      emit('host:migrated', { oldHostSeat: null, newHostSeat, snapshot: msg.payload?.snapshot })
    }
  } else if (msg.type === 'PROMOTE_HOST_REQUEST') {
    // ★ v3.x P2-29(N-3 闭环):joiner 端兜底提升
    //   触发场景:原 host 掉线,joiner 端 GameView 监听到 peer:leave { seat: hostSeat }
    //     后调 requestPromoteToHost(snapshot) 广播本消息
    //   竞态保护:_promotedHostSeat 全局标记记录第一个升级的 seat,后续到者让位
    //   座位稳定:不搬动任何 peer 的 seat,只切换 hostSeat / isHostFlag。
    const newHostSeat = msg.payload?.newHostSeat
    const snap = msg.payload?.snapshot ?? null
    if (newHostSeat == null || newHostSeat < 1 || newHostSeat > 3) return
    // 全局去重:已有别的新 host 升级 → 这次请求让位
    if (_promotedHostSeat != null && _promotedHostSeat !== newHostSeat) {
      // 让位分支:旁观者同步 hostSeat,保留先到的 _promotedHostSeat peer 在原 seat
      if (peers.has(_promotedHostSeat)) {
        _setHostSeat(_promotedHostSeat)
        _resetHostEpoch()
      }
      emit('host:migrated', { oldHostSeat: null, newHostSeat: _promotedHostSeat, snapshot: snap, isMyself: false })
      return
    }
    if (selfSeat === newHostSeat) {
      // 我就是被选中的新 host
      if (isHostFlag) return  // 防御:本端已经升过
      _promotedHostSeat = newHostSeat
      _setHostSeat(selfSeat)
      _resetHostEpoch()
      _bumpHostEpoch()
      isHostFlag = true
      emit('host:migrated', { oldHostSeat: null, newHostSeat, snapshot: snap, isMyself: true })
    } else if (peers.has(newHostSeat)) {
      // 旁观:同步 hostSeat,保留新 host peer 在原 seat;重置 epoch 以接受新 host
      _setHostSeat(newHostSeat)
      _resetHostEpoch()
      _bumpHostEpoch()
      _promotedHostSeat = newHostSeat
      emit('host:migrated', { oldHostSeat: null, newHostSeat, snapshot: snap, isMyself: false })
    }
  } else if (msg.type === 'TRANSPORT_REBUILD_ANNOUNCE') {
    // v0.4.8 N-1:新 host 端 broadcast 自己的新 IP:port,其它 joiner 收到后
    //   关闭旧 client transport,重建 client 连新 IP。
    //
    // 触发场景:
    //   - joiner 升为新 host,关掉原 client(连旧 host IP:port),起 server 在自己 IP:8848
    //   - 广播 { type: 'TRANSPORT_REBUILD_ANNOUNCE', payload: { newHostSeat, newHostAddress } }
    //     注意此时新 host 的 transport 已是 server mode,不再接收自己广播(BC spec / WS 模式都
    //     不回环),但其它 joiner 仍能收到
    //
    // 处理:
    //   1. 仅当 transport 类型是 WS / AndroidWs(需要真 rebuild)时才执行
    //      BC 模式:同 channel 仍在,无需 rebuild,只需把新 hostSeat 同步到 peers Map
    //   2. 关 current transport,创建新 WebSocketTransport client,open 连新 IP:port
    //   3. 完成 emit 'transport:rebuild:done' 给 UI 监听
    //
    // 注意:这条消息走的是 _handleJoinerMessage(joiner 端处理),不是 _handleHostMessage
    const newHostAddress = msg.payload?.newHostAddress
    const announceHostSeat = msg.payload?.newHostSeat
    if (typeof newHostAddress !== 'string') return
    // BC 模式:不需要 transport rebuild,但需要同步 hostSeat
    if (transport && transport.type === 'bc') {
      // joiner 端:保留新 host peer 在原 seat,只改 hostSeat
      if (announceHostSeat != null && peers.has(announceHostSeat)) {
        _setHostSeat(announceHostSeat)
        _resetHostEpoch()
        _bumpHostEpoch()
      }
      emit('transport:rebuild:announce', { newHostSeat: announceHostSeat, newHostAddress, mode: 'bc' })
      emit('transport:rebuild:done', { newHostSeat: announceHostSeat, newHostAddress, mode: 'bc' })
      return
    }
    // WS / AndroidWs 模式:真 transport rebuild
    if (!transport) return
    // 解析 newHostAddress → { host, port }
    let parsed
    try {
      parsed = parseHostAddress(newHostAddress)
    } catch (e) {
      emit('error', 'transport:rebuild:announce 解析失败: ' + (e?.message || e))
      return
    }
    // 异步 rebuild,不阻塞当前 message 处理循环
    ;(async () => {
      try {
        await transport.rebuildAsClient(parsed.host, parsed.port)
        // 同步 hostSeat(joiner 端保留新 host peer 在原 seat)
        if (announceHostSeat != null && peers.has(announceHostSeat)) {
          _setHostSeat(announceHostSeat)
          _resetHostEpoch()
          _bumpHostEpoch()
        }
        emit('transport:rebuild:done', { newHostSeat: announceHostSeat, newHostAddress, mode: 'ws' })
      } catch (e) {
        emit('error', 'transport:rebuild:announce rebuild failed: ' + (e?.message || e))
      }
    })()
    emit('transport:rebuild:announce', { newHostSeat: announceHostSeat, newHostAddress, mode: 'ws' })
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
  // ★ v0.4.19 V0419-02:selfInfo 加 canHost + hostAddress 字段
  //   canHost:本端 transport 是否有 server 能力(WS Node / AndroidWs / BC = true,浏览器 ws = false)
  //   hostAddress:WS server bind 后的 IP:port(BC = null)
  //   这两个字段让其他 joiner 收到 peer:join 时能知道"我能升级吗 + 怎么连我"
  // ★ Phase 2 修复:transport 创建前 canHostAsNewHost/getSelfHostAddress 无法返回有效值,
  //   先用占位值,等 transport open 后再刷新。
  const uuid = ensureUuid()
  selfInfo = { ...self, uuid, canHost: false, hostAddress: null }
  isHostFlag = true
  selfSeat = 0
  _setHostSeat(0)
  _bumpHostEpoch()
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
  const openPromise = (transport.type === 'bc')
    ? transport.open('self', roomId || 'default')
    : transport.open('self')
  openPromise.then(() => {
    if (!transport) return
    selfInfo = { ...self, uuid, canHost: canHostAsNewHost(), hostAddress: getSelfHostAddress() }
    // 只在 seat 0 仍是自己(或空)时刷新,避免覆盖 swapSeats 等后续操作已变更的 seat 0
    const current0 = peers.get(0)
    if (!current0 || current0.uuid === uuid) {
      peers.set(0, { ...selfInfo })
    }
    // v0.4.22 P0-08:transport 创建完成后同步一次 host seat
    try { transport.setHostSeat(hostSeat) } catch (_) {}
    // v0.4.22 P1:让扫描端能通过 /room-info 或 ROOM_PROBE 发现本房间
    _bindRoomInfoProvider(transport)
    // v0.4.22 P3:原生环境额外注册 mDNS 服务,真机无需知道 IP 即可发现房间
    _registerHostMdns()
  }).catch((err) => {
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
  // ★ v0.4.19 V0419-02:selfInfo 加 canHost + hostAddress 字段(同上 startAsHost)
  // ★ Phase 2 修复:transport 创建后再刷新 canHost/hostAddress,避免初始为 false/null。
  const uuid = ensureUuid()
  selfInfo = { ...self, uuid, canHost: false, hostAddress: null }
  isHostFlag = false
  selfSeat = -1
  _setHostSeat(0)
  _resetHostEpoch()
  // 兼容签名: hostRoomId 含 ':' 或 '[' 时解析为 ws host:port 形式 (Android Capacitor / IPv6 路径)
  // 不含 ':' 或解析失败时 → 当 BC 房间号 (浏览器路径)
  let parsedHostIp = (opts && opts.hostIp) || null
  let parsedHostPort = (opts && opts.hostPort) || null
  let isWsMode = false
  if (parsedHostIp && parsedHostPort) {
    isWsMode = true
  } else if (typeof hostRoomId === 'string' && (hostRoomId.indexOf(':') >= 0 || hostRoomId.startsWith('['))) {
    try {
      const parsed = parseHostAddress(hostRoomId)
      parsedHostIp = parsed.hostIp
      parsedHostPort = parsed.hostPort
      isWsMode = true
    } catch (e) {
      // 解析失败 → 回退到 BC 房间号
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
  } else if (transport.type === 'bc') {
    openPromise = transport.open('client', roomId || 'default')
  } else {
    openPromise = transport.open('client', null, null)
  }
  openPromise.then(() => {
    if (!transport) return
    // transport 就绪后刷新 selfInfo,再发 JOIN
    selfInfo = { ...self, uuid, canHost: canHostAsNewHost(), hostAddress: getSelfHostAddress() }
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
    const portStr = rest.slice(1)
    if (!/^\d+$/.test(portStr)) throw new Error('hostAddress 端口非法: ' + portStr)
    const port = parseInt(portStr, 10)
    if (port <= 0 || port >= 65536) {
      throw new Error('hostAddress 端口非法: ' + portStr)
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
  if (!/^\d+$/.test(portStr)) throw new Error('hostAddress 端口非法: ' + portStr)
  const port = parseInt(portStr, 10)
  if (port <= 0 || port >= 65536) {
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

/**
 * ★ v0.4.13 对抗性审查修复 (P0-2 / P1-5):统一广播能力检查 + 主动 close 广播 PEER_LEAVE
 *
 * 旧问题:
 *   - host 主动 close 时 joiner 必须等 6-8s 心跳超时才能发现
 *   - 业务代码散落 `transport && transport.isReady && transport.isReady()` 防御写法
 *   - 语义不统一,BC / WS / AndroidWs 各 transport 的 ready 判定时机不同
 *
 * 修法:
 *   - canBroadcast() 统一封装 transport 是否可发消息的判定
 *   - broadcastPeerLeave(opts) 主动广播 host 离开(触发 joiner 走 N-3 兜底迁移)
 *   - close({ broadcast, snapshot, newHostSeat }) 显式 opt-in,默认不广播
 *     (避免 RoomView 退房 / 测试 teardown 误广播污染 joiner)
 *
 * @returns {boolean} transport 存在且 isReady() 返回 true
 */
function canBroadcast() {
  if (!transport) return false
  if (typeof transport.isReady !== 'function') return false
  try { return !!transport.isReady() } catch (e) { return false }
}

/**
 * 主动广播 host 离开 PEER_LEAVE { seat:0, migrate, snapshot?, newHostSeat?, newHostAddress? }
 *
 * 触发场景:host 主动 close (RoomView showMenu / 用户退房 / App 关闭 / kill switch)。
 *   joiner 端 onPeerLeave 收到 seat === 当前 hostSeat + migrate=true 立即触发
 *   requestPromoteToHost 走 N-3 兜底迁移路径,不等 6-8s 心跳超时。
 *
 * v0.4.19 V0419-03:加 newHostAddress 字段
 *   - host 关闭前如果已经选了新 host(newHostSeat 的 peer 有 canHost+hostAddress),
 *     把 newHostAddress 塞 PEER_LEAVE payload
 *   - joiner 收到后能直接 connect(newHostAddress) → 不需要等新 host 起 server 广播 TRANSPORT_REBUILD_ANNOUNCE
 *   - 这是 V0419-04 "第二发现通道"的简化版 — host 主动退出场景下有效;
 *     host 崩溃场景(无 close 广播)还是要靠 joiner 本地选举 + 新 host 起 server
 *
 * @param {object} [opts]
 * @param {object} [opts.snapshot]       - 当前 game state 快照,joiner 端可直接 applySnapshot
 * @param {number} [opts.newHostSeat]    - 推荐的新 host seat (1/2/3),不传 joiner 自选
 * @param {string} [opts.newHostAddress] - 新 host 的 IP:port(可选,joiner 端可直接 connect)
 * @returns {boolean} true=广播成功,false=无 transport / 非 host
 */
function broadcastPeerLeave(opts = {}) {
  if (!isHostFlag) return false
  if (!canBroadcast()) return false
  const leavingSeat = hostSeat
  const payload = { seat: leavingSeat, migrate: true }
  if (Number.isInteger(opts.newHostSeat) && opts.newHostSeat >= 1 && opts.newHostSeat <= 3) {
    payload.newHostSeat = opts.newHostSeat
    // ★ v0.4.19 V0419-03:自动从 peers[newHostSeat].hostAddress 取
    //   调用方不传 newHostAddress 时,自动填充让 joiner 拿到完整新 host 信息
    if (!opts.newHostAddress) {
      const newHostInfo = peers.get(opts.newHostSeat)
      if (newHostInfo && newHostInfo.hostAddress) {
        payload.newHostAddress = newHostInfo.hostAddress
      }
    }
  }
  if (opts.newHostAddress && typeof opts.newHostAddress === 'string') {
    payload.newHostAddress = opts.newHostAddress
  }
  if (opts.snapshot && typeof opts.snapshot === 'object') {
    // 防御:序列化测大小,超大快照 (>64KB) 拒绝带上,避免 BC / WS buffer 爆掉
    let serialized = ''
    try { serialized = JSON.stringify(opts.snapshot) } catch (e) { return false }
    if (serialized.length > 64 * 1024) {
      // snapshot 太大,只发 migrate 标记不带 snapshot,joiner 走 STATE_SNAPSHOT 兜底
      // ★ v0.4.16 对抗性审查 (V0414-05):fallback 也必须保留 newHostSeat(不能丢)
      //   旧版 fallback 用 { seat: 0, migrate: true } 直接丢 newHostSeat,接收端只能
      //   本地推断新 host,多端状态可能不一致;现在构造 minimal 携带已计算的 newHostSeat
      // ★ v0.4.19 V0419-03:fallback 也保留 newHostAddress
      const minimal = { seat: leavingSeat, migrate: true }
      if (payload.newHostSeat !== undefined) minimal.newHostSeat = payload.newHostSeat
      if (payload.newHostAddress !== undefined) minimal.newHostAddress = payload.newHostAddress
      try { return sendMessage({ type: 'PEER_LEAVE', payload: minimal }) } catch (e) { return false }
    }
    payload.snapshot = opts.snapshot
  }
  try {
    return sendMessage({ type: 'PEER_LEAVE', payload })
  } catch (e) {
    return false
  }
}

/**
 * 关闭网络连接 + 清理所有 state。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.broadcast=false] - 是否主动广播 PEER_LEAVE 给 joiner
 *                                          (仅 host 生效;默认 false 避免误广播)
 * @param {object} [opts.snapshot]        - 配合 broadcast 发送 game state 快照
 * @param {number} [opts.newHostSeat]     - 推荐的新 host seat
 */
function close(opts = {}) {
  // ★ P0-2 修复:host 主动 close 时,若调用方显式 opt-in 则先广播 PEER_LEAVE 再清 state
  //   必须在 stopHeartbeat + transport.close() 之前,确保 joiner 收得到
  if (opts.broadcast === true) {
    // ★ v0.4.19 V0419-04:close 关闭前广播完整新 host 信息
    //   调用方传 newHostSeat + newHostAddress → joiner 收到 PEER_LEAVE 后能直接
    //   connect 新 host,不需要等新 host 起 server + 广播 TRANSPORT_REBUILD_ANNOUNCE
    //   调用方传 newHostSeat 但没传 newHostAddress → broadcastPeerLeave 内部自动
    //   从 peers[newHostSeat].hostAddress 取(V0419-03 修复)
    try {
      broadcastPeerLeave({
        snapshot: opts.snapshot,
        newHostSeat: opts.newHostSeat,
        newHostAddress: opts.newHostAddress,
      })
    } catch (e) { /* swallow */ }
  }
  stopHeartbeat()
  stopHeartbeatChecker()
  cancelJoinRetry()
  if (mdnsRegStop) { try { mdnsRegStop() } catch (e) {} mdnsRegStop = null }
  stopMdns().catch(() => {})
  if (transport) { try { transport.close() } catch (e) {} transport = null }
  selfInfo = null
  isHostFlag = false
  selfSeat = 0
  _setHostSeat(0)
  _resetHostEpoch()
  peers.clear()
  lastHeartbeat.clear()
  // ★ v2.4-p4 BUG-007:清理 kick 状态,避免下次开房时被踢者还在 _kickedSeats 里
  _kickedSeats.clear()
  _selfKickedEmitted = false
  // ★ v3.x P2-29:清理 host 迁移去重标记,避免下次开房时新 joiner 误让位给旧标记
  _promotedHostSeat = null
  // ★ P0-06:清理迁移私密状态暂存
  _pendingMigrationSecret = null
  // ★ v3.x P2-25 修复(N-4):清空事件总线 listeners,避免旧组件订阅的 handler 残留到下次开房
  //   RoomView / GameView 卸载时如果忘了 off(),close 后这些 handler 还在 handlers 对象里,
  //   下次 startAsHost 时如果新组件又 on() 同一事件,会触发两次回调(旧 + 新)
  for (const k of Object.keys(handlers)) delete handlers[k]
  // ★ v3.x P2-25 修复(N-5):重置 transport factory,让下次开房回到默认选择
  //   joinRemoteRoom 会注入 WebSocketTransport factory,close 后应该清掉,否则下次浏览器开
  //   host 会用上次的 WS factory,导致 host 起 ws server 而不是 BC channel
  _transportFactory = null
}

// ============== v2.4-p4 BUG-006:网络层 swapSeats 权威 ==============
/**
 * 互换两个 seat 的玩家信息 —— **网络层权威**(BUG-006 修复)
 *
 * 之前 RoomView.vue 的 onSwapWithTeammate 直接改本地 reactive peers Map + 广播
 *   SEAT_SWAP,但 network.js 内部的 peers Map、selfSeat、GameView 初始化时
 *   的玩家座位可能没同步 → 出现"UI 看到换座但 network / game 层没换"的 stale state。
 *
 * 修法:把 swap 的"权威"放在 network.js,所有 seat 状态变更(peers Map / selfSeat /
 *   transport routing)统一由本函数处理:
 *   1. 互换 peers Map 的 seatA / seatB entries(若某 seat 不存在,跳过该 seat 的拷贝)
 *   2. 如果 selfSeat 在 {a, b} 中,更新 selfSeat 到另一个 seat
 *   3. 广播 SEAT_SWAP_ACK { a, b, ts } 让所有 joiner 走同一份逻辑(joiner 端
 *      _handleJoinerMessage 收到后调 _applySeatSwapLocal 同步状态)
 *   4. emit 'peer:seat_swap' 事件给本机 UI 监听者(RoomView 的 peers Map / GameView
 *      初始化读 net.getPeers() 拿最新)
 *
 * 调用方:
 *   - host / joiner 任何想换 seat 的人都可调,通常是 host 换队友(RoomView.vue)
 *   - GameView 初始化时**不再**自己合并 UI 临时 state,直接读 net.getPeers() 拿权威
 *
 * 不变量:
 *   - 调用前 peers / selfSeat 反映"换前"状态,调用后立即反映"换后"状态(同步)
 *   - 任何 joiner 收到 SEAT_SWAP_ACK 后,自己 peers / selfSeat 立即同步
 *     (不等 broadcast loopback / 6-8s 心跳)
 *   - emit 'peer:seat_swap' 永远在本地 state 改完之后再触发
 *
 * @param {number} a seat (0-3)
 * @param {number} b seat (0-3)
 * @returns {{ok:boolean, error?:string}}
 */
function swapSeats(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return { ok: false, error: 'seat 必须是整数' }
  }
  if (a < 0 || a > 3 || b < 0 || b > 3) {
    return { ok: false, error: 'seat 必须在 [0,3] 范围' }
  }
  if (a === b) {
    return { ok: false, error: 'seat a 和 b 不能相同' }
  }
  // ★ P0-07:只允许对家换座
  if ((a + 2) % 4 !== b) {
    return { ok: false, error: '只能和队友(对家)换座' }
  }
  if (!transport) {
    // 没有 transport → 已 close 或尚未 startAsHost / joinRoom
    return { ok: false, error: '尚未连接到房间,不能 swap' }
  }
  // joiner 只能发 REQUEST,由 host 提交
  if (!isHostFlag) {
    sendMessage({ type: 'SEAT_SWAP_REQUEST', payload: { a, b, ts: Date.now() } })
    return { ok: true, pending: true }
  }
  // ★ 1) 互换 peers Map 的 entries(如果某 seat 不存在,跳过该侧的拷贝)
  const infoA = peers.get(a)
  const infoB = peers.get(b)
  if (infoA) peers.set(b, infoA)
  else peers.delete(b)
  if (infoB) peers.set(a, infoB)
  else peers.delete(a)
  // ★ 2) 广播 SEAT_SWAP_COMMITTED(host 权威提交)
  //   注意:host 自己也在 {a,b} 中时,必须先发送再更新 selfSeat/hostSeat,
  //   否则消息 from 会变成新 host seat,joiner 的 epoch/authority 校验会拒绝。
  sendMessage({
    type: 'SEAT_SWAP_COMMITTED',
    payload: { a, b, ts: Date.now() },
  })
  // ★ 3) 如果 selfSeat 在 {a, b} 中,切换到另一个 seat
  if (selfSeat === a) selfSeat = b
  else if (selfSeat === b) selfSeat = a
  // ★ LOGIC-14 修复:同步更新 hostSeat 权威座位
  if (hostSeat === a) _setHostSeat(b)
  else if (hostSeat === b) _setHostSeat(a)
  // ★ 4) 本机 UI 通知 — RoomView 监听 'peer:seat_swap' 同步 reactive peers Map
  emit('peer:seat_swap', { a, b, infoA: infoA || null, infoB: infoB || null })
  return { ok: true }
}

/**
 * joiner 端收到 SEAT_SWAP_COMMITTED 后,在 _handleJoinerMessage 里调此函数同步本地状态。
 *
 * ★ 重要:不调 broadcast / sendMessage,只改本机 state。joiner 之间互不通信。
 *
 * @param {number} a
 * @param {number} b
 */
function _applySeatSwapLocal(a, b) {
  const infoA = peers.get(a)
  const infoB = peers.get(b)
  if (infoA) peers.set(b, infoA)
  else peers.delete(b)
  if (infoB) peers.set(a, infoB)
  else peers.delete(a)
  if (selfSeat === a) selfSeat = b
  else if (selfSeat === b) selfSeat = a
  if (hostSeat === a) _setHostSeat(b)
  else if (hostSeat === b) _setHostSeat(a)
  emit('peer:seat_swap', { a, b, infoA: infoA || null, infoB: infoB || null })
}

// ============== v2.4-p4 BUG-007:统一踢人协议 (kickPlayer) ==============
/**
 * 已被踢的 seat 集合(host 端)—— 防止被踢 joiner 的延迟心跳回来再次触发 peer:leave,
 *   或 6-8s 心跳窗口里 host 端误以为 joiner 还在场。
 *
 * 该 set 在 host 调 kickPlayer() 时写入,在 close() 时清理(下次开房不残留)。
 *
 * ★ 不影响 transport / transport.forceDisconnectSeat 的行为,只是 network.js 内部状态标记。
 *
 * @type {Set<number>}
 */
const _kickedSeats = new Set()
let _selfKickedEmitted = false

function _emitSelfKicked(reason, ts) {
  if (_selfKickedEmitted) return
  _selfKickedEmitted = true
  emit('self:kicked', { reason: reason || 'kicked', ts: ts || Date.now() })
}

/**
 * Host 统一踢人接口 —— 网络层权威 (BUG-007 修复)
 *
 * 之前 RoomView.vue onKickPlayer 直接调 transport.forceDisconnectSeat(seat),
 *   但 WS / Android WS 路径下被踢 joiner 端需要先收 KICKED 再 ws.close()。
 *   而且其它旁观 joiner 需要立即从 peers Map 删被踢者(不等 6-8s 心跳超时)。
 *
 * 真做机制(4 步):
 *   1) 给目标 seat 定向发 KICKED { reason, ts } —— 让被踢 joiner 收到后立刻 emit 'self:kicked'
 *      (优先于 ws.onclose 异步触发,WS / AndroidWs joiner 端立即跳页)
 *   2) 广播 PEER_LEAVE { seat, kick: true } 给其它 joiner —— 让旁观 joiner **立即**
 *      peers.delete(seat) + emit 'peer:leave',不等 6-8s 心跳超时
 *   3) host 端本机立即 peers.delete(seat) + lastHeartbeat.delete(seat) +
 *      emit 'peer:leave' + 把 seat 写入 _kickedSeats(防止后续 _DISCONNECT 重复处理)
 *   4) 调 transport.forceDisconnectSeat(seat) —— 真断 ws 连接(WS / AndroidWs 关 ws,
 *      BC broadcast PEER_LEAVE)
 *
 * ★ 跟 v2.1 P1 kick player 的区别:
 *   - v2.1 P1:host 不动 network.js 内部 peers Map,留给 6-8s 心跳窗口
 *   - v2.4-p4 BUG-007:host **立即**清 peers Map(其它 joiner 端也立即清),避免 6-8s 空窗
 *   - KICKED 消息是新增的协议层,被踢 joiner 端 _handleJoinerMessage 优先触发 self:kicked
 *
 * 不变量:
 *   - transport.forceDisconnectSeat 行为**不**变(WS 关 ws / AndroidWs 关 ws / BC broadcast)
 *   - KICKED 协议只走 sendTo(seat, ...) 定向消息,不广播
 *   - PEER_LEAVE { kick: true } 仍广播,保证旁观 joiner 端路径对称
 *
 * @param {number} seat 要踢的 seat (1-3,host 自己 seat=0 不能踢)
 * @param {string} [reason='kicked'] 踢人原因
 * @returns {{ok:boolean, error?:string}}
 */
function kickPlayer(seat, reason) {
  if (!isHostFlag) return { ok: false, error: '只有 host 可以踢人' }
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    return { ok: false, error: 'seat 必须在 [0,3] 范围' }
  }
  // ★ P1-02:host 换座后 hostSeat 可能不是 0,禁止踢自己(按当前 hostSeat 判定)
  if (seat === hostSeat) {
    return { ok: false, error: '不能踢自己' }
  }
  if (_kickedSeats.has(seat)) {
    // 已踢过(幂等) — 不重复发消息,但仍返回 ok:true 让调用方知道踢过
    return { ok: true, error: 'already kicked' }
  }
  if (!peers.has(seat)) {
    return { ok: false, error: 'seat ' + seat + ' 不存在' }
  }
  _kickedSeats.add(seat)
  const ts = Date.now()
  const finalReason = reason || 'kicked'
  // ★ 1) 给目标 seat 定向发 KICKED(WS / AndroidWs 走 sendTo,BC sendTo 跟 broadcast 等价)
  //   joiner 端 _handleJoinerMessage 收到 KICKED → 立即 emit 'self:kicked' → UI 跳页
  sendMessage({
    type: 'KICKED',
    payload: { reason: finalReason, ts },
    to: seat,
  })
  // ★ 2) 广播 PEER_LEAVE { seat, kick: true } —— 旁观 joiner 立即从 peers Map 删
  //   同时 host 自己 emit('peer:leave', ...) 给本机 listener(RoomView / GameView)
  // ★ 3) host 端立即清 peers Map + lastHeartbeat(不再等 6-8s 心跳)
  const removedInfo = peers.get(seat) || null
  peers.delete(seat)
  lastHeartbeat.delete(seat)
  emit('peer:leave', { seat, info: removedInfo, kicked: true })
  // 广播 PEER_LEAVE 给所有 joiner(定向或广播都行,这里用 broadcast 让 BC / WS 路径都通)
  sendMessage({
    type: 'PEER_LEAVE',
    payload: { seat, kick: true, reason: finalReason, ts },
  })
  // ★ 4) 真断 ws 连接(WS 关 ws / AndroidWs 关 ws / BC broadcast PEER_LEAVE)
  //   BC 模式下 forceDisconnectSeat 已经 broadcast 过 PEER_LEAVE { kick: true },
  //   我们刚才发的 PEER_LEAVE 会变成"双份",但 BC joiner 端 _handleJoinerMessage
  //   收到后只是 peers.delete + emit,重复处理幂等(peers.has 检查 + emit 都会覆盖)
  //   为了避免 BC 双份,只在 WS / AndroidWs 路径下调 forceDisconnectSeat。
  //   简单判定:transport._mode === 'self' 且 transport._channel == null 才是 ws-like host
  const isWsLikeHost = transport && transport._mode === 'self' && transport._channel == null
  if (isWsLikeHost && typeof transport.forceDisconnectSeat === 'function') {
    // ★ WS / AndroidWs 路径:调 transport 真的关 ws + 关 client
    //   注意:AndroidWsTransport.forceDisconnectSeat 内部已经 broadcast 了
    //   PEER_LEAVE { kick: true },会跟我们刚才 broadcast 的重复。joiner 端
    //   _handleJoinerMessage 对重复消息幂等(peers.delete 重复无害),所以允许。
    transport.forceDisconnectSeat(seat)
  }
  return { ok: true }
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
// v2.1 P3 旧版:按 seat 优先级选下一个 host 候选(队友优先)
//   保留作向后兼容 — v0.4.19 用新的 `selectNextHostCandidate`(UUID 字典序 + canHost 过滤)
//   调用方:requestHostMigration(主动发起迁移,host 还在时)
//   新版 `selectNextHostCandidate`(V0419-01)用于 requestPromoteToHost(host 已死场景)
function selectNextHostBySeat() {
  // 优先级相对当前 host:队友 > 左手 > 右手,跳过旧 host 自己
  const order = [(hostSeat + 2) % 4, (hostSeat + 1) % 4, (hostSeat + 3) % 4]
  for (const seat of order) {
    if (seat === hostSeat) continue
    if (peers.has(seat)) return seat
  }
  return hostSeat  // 没其他 peer,只能自己继续(调用方应视为未真正迁移)
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
 * v3.x P2-23 修复(N-3):接受 snapshot 参数,通过 PEER_LEAVE { migrate: true, snapshot }
 *   传给所有 joiner,让新 host / 旁观者立即拿到 game state(无需等 NEW_HOST 后手广播)
 *
 * @param {number} newHostSeat 选中的新 host 原 seat(1/2/3)
 * @param {object} [snapshot] 当前 game state 快照(可选)
 *   - 包含: { state, hands, table, currentSeat, levelRank, teamLevels, ... }
 *   - 调用方(GameView)从 game.value 取需要的字段
 * @returns {boolean} true=成功发起
 */
function requestHostMigration(newHostSeat, snapshot) {
  const oldHostSeat = hostSeat
  if (!isHostFlag) return false
  const isValidSeat = (v) => Number.isInteger(v) && v >= 0 && v <= 3
  if (!isValidSeat(newHostSeat) || newHostSeat === oldHostSeat) {
    // 调用方没传或传了自己 → 自动选
    newHostSeat = selectNextHostBySeat()
    if (newHostSeat === oldHostSeat) return false  // 没其他 peer,牌局结束
  }
  // ★ P0-06 修复:公开 PEER_LEAVE 不再携带完整四家手牌 snapshot(防手牌泄露),
  //   只携带迁移元数据;完整 state 通过定向 HOST_MIGRATION_SECRET_STATE 只发给新 host。
  const payload = { seat: oldHostSeat, migrate: true, newHostSeat }
  const newHostInfo = peers.get(newHostSeat)
  if (newHostInfo && newHostInfo.hostAddress) {
    payload.newHostAddress = newHostInfo.hostAddress
  }
  if (snapshot && typeof snapshot === 'object') {
    sendMessage({
      type: 'HOST_MIGRATION_SECRET_STATE',
      payload: { oldHostSeat, newHostSeat, snapshot },
      to: newHostSeat,
    })
  }
  sendMessage({ type: 'PEER_LEAVE', payload })
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

/**
 * v0.4.8 N-1:joiner 升为新 host 后,把 client transport 切到 server mode。
 *
 * 触发场景:
 *   - 原 host 掉线 / 主动 close
 *   - joiner 端 GameView useGameLogic 调 requestPromoteToHost(snapshot)
 *   - 收到 PROMOTE_HOST_REQUEST 后,新 host 端在 'host:migrated' { isMyself: true } 事件回调里
 *     调 rebuildAsHost()
 *
 * 流程:
 *   1. 关当前 client transport(断开连旧 host 的 ws)
 *   2. 创建新 WebSocketTransport 实例(open('self') = server mode)
 *   3. 启动 ws server,绑定新 IP:port(默认 8848)
 *   4. 广播 TRANSPORT_REBUILD_ANNOUNCE { newHostSeat: 0, newHostAddress: '<self-ip>:<port>' }
 *   5. 其它 joiner 收到后,关闭旧 client,重建 client 连新 IP:port
 *
 * 限制(已知):
 *   - 当前实现要求 joiner 在调本函数前先通过 requestPromoteToHost(snapshot) 让
 *     peer map 完成升级(否则 broadcast 时 isHostFlag 还是 false,sendMessage 走空)
 *   - BC 模式:transport 仍用原 channel,无需真 rebuild,只走 peer map 升级路径。
 *     本函数检测到 BC transport 直接返回 { ok: true, skipped: 'bc' }
 *   - WS 模式:rebuild 后新 transport 走 self mode,_onTransportMessage 仍由 network.js 挂载。
 *
 * @returns {Promise<{ok:boolean, newHostAddress?:string, skipped?:string, error?:string}>}
 */
async function rebuildAsHost() {
  if (!isHostFlag) {
    return { ok: false, error: '当前不是 host(请先调 requestPromoteToHost)' }
  }
  if (!transport) {
    return { ok: false, error: 'transport 不存在' }
  }
  // BC 模式不需要 rebuild(同 channel)
  if (transport.type === 'bc') {
    return { ok: true, skipped: 'bc' }
  }
  // ★ v0.4.17 对抗性审查 (V0416-02):WS / AndroidWs 拓扑关键修复
  //   旧流程:close 旧 client → 起新 server → sendMessage(用新 transport 变量)
  //     → 但 sendMessage 走新 transport.sendMessage,而新 transport 是新 server,此时还
  //     没有 client 连接过来(其他 joiner 还连在旧 host server 上)→ 广播消息发到空客户端集合,
  //     其他 joiner 永远收不到 TRANSPORT_REBUILD_ANNOUNCE → 无法自动重连到新 host。
  //   新流程(关键顺序):
  //     1) 先创建新 transport 实例(不开 server,避免占位冲突)
  //     2) 起新 server open('self') → 拿到 newHostAddress
  //     3) 用**旧 transport 引用**(连旧 host server 的 client)广播 TRANSPORT_REBUILD_ANNOUNCE
  //        — 此时旧 host server 还活着,会转发给其他 joiner → joiner 收到新地址立即 connect
  //     4) 把新 transport 挂到全局 transport 变量
  //     5) close 旧 transport
  //     6) emit + 重启心跳
  let newTransport
  try {
    newTransport = _createTransport()
  } catch (e) {
    // ★ v0.4.18 V0414-04:rebuildAsHost 失败 → emit host:lost 让业务层跳首页
    //   浏览器 ws joiner 走这里:浏览器无 ws server 能力,不能当新 host。
    //   业务层 GameViewDesktop 已经监听 host:lost → router.push 首页
    const errMsg = 'transport 工厂失败: ' + (e?.message || e)
    emit('host:lost', { reason: 'rebuildAsHost_failed', error: errMsg, ts: Date.now() })
    return { ok: false, error: errMsg }
  }
  // 1) 起新 server,拿地址
  try {
    // 复用原 port(host 通常用 8848;若是 ephemeral 测试,这里会失败 — 测试环境另行 mock)
    await newTransport.open('self')
  } catch (e) {
    // ★ v0.4.18 V0414-04:同上,open(self) 失败(典型场景:浏览器 ws joiner 无 server 能力)
    const errMsg = '新 transport open(self) 失败: ' + (e?.message || e)
    emit('host:lost', { reason: 'rebuildAsHost_failed', error: errMsg, ts: Date.now() })
    return { ok: false, error: errMsg }
  }
  // 2) 计算新 IP:port
  const newPort = (typeof newTransport.getBoundPort === 'function') ? newTransport.getBoundPort() : null
  let newIp = null
  if (typeof newTransport.getHostIp === 'function') {
    newIp = newTransport.getHostIp()
  }
  if (!newIp) {
    // fallback:用 selfInfo 里之前记录的 host IP(可能不对,但至少有地址)
    newIp = selfInfo?.hostIp || '127.0.0.1'
  }
  const newHostAddress = `${newIp}:${newPort || 8848}`
  // 3) ★关键:用**旧 transport 引用**广播(旧 host server 还活着,会转发给其他 joiner)
  //   不用新的 transport 变量,因为那时新 server 还没有 joiner 客户端连接过来。
  //   这里捕获异常不致命 — 即使广播失败,新 host 自身状态已重建,joiner 走 reconnect:failed fallback。
  try {
    if (typeof transport.sendMessage === 'function') {
      transport.sendMessage({
        type: 'TRANSPORT_REBUILD_ANNOUNCE',
        payload: { newHostSeat: selfSeat, newHostAddress, ts: Date.now() },
      })
    } else {
      sendMessage({
        type: 'TRANSPORT_REBUILD_ANNOUNCE',
        payload: { newHostSeat: selfSeat, newHostAddress, ts: Date.now() },
      })
    }
  } catch (e) {
    // 广播失败不算致命 — 新 host 自己的 transport 已 ready
    console.warn('[rebuildAsHost] pre-close broadcast failed:', e?.message || e)
  }
  // 4) 把新 transport 挂到 network.js 全局变量 + 挂 _onTransportMessage
  try { await transport.close() } catch (e) { /* swallow */ }
  transport = newTransport
  transport.onMessage(_onTransportMessage)
  // v0.4.22 P1:重建后仍然提供扫描端点
  _bindRoomInfoProvider(transport)
  // 5) emit 本端事件
  emit('transport:rebuild:announce', { newHostSeat: selfSeat, newHostAddress, mode: 'ws', isMyself: true })
  emit('transport:rebuild:done', { newHostSeat: selfSeat, newHostAddress, mode: 'ws', isMyself: true })
  // 6) 重启心跳
  startHeartbeatChecker()
  return { ok: true, newHostAddress }
}

/**
 * v3.x P2-29(N-3 闭环):joiner 端主动请求"提升自己为新 host"
 *
 * 触发场景:原 host 6-8s 心跳掉线 / 主动 close / 浏览器关掉
 *   - joiner 端 network 检测到 PEER_LEAVE { seat: hostSeat } 后,由 GameView 调本函数
 *   - 广播 PROMOTE_HOST_REQUEST { newHostSeat: selfSeat, snapshot }
 *   - 所有 joiner 收到后:
 *     - 如果 payload.newHostSeat === selfSeat:自己升为 host(emit host:migrated { isMyself: true, snapshot })
 *     - 否则:旁观,同步 hostSeat(保留新 host peer 在原 seat)
 *
 * 竞态:多个 joiner 同时调本函数时,各自广播自己的 PROMOTE_HOST_REQUEST。
 *   第一个到达的 joiner 把自己升为 host,后续到达的 joiner 由于 _promotedHostSeat 已记录,
 *   会"认新主"不升级(避免一房多主)。本实现简单可靠,不需要复杂去重。
 *
 * 调用方:GameView useGameLogic.js 监听 `peer:leave { seat: hostSeat }` 后调本函数。
 *
 * @param {object} [snapshot] 当前 game state 快照(可选)
 * @returns {boolean} true=成功发起
 */
function requestPromoteToHost(snapshot) {
  if (isHostFlag) return false  // 已经是 host 不需要再提升自己
  // 广播 PROMOTE_HOST_REQUEST(可能因旧 host transport 死掉失败,失败不致命)
  try {
    sendMessage({
      type: 'PROMOTE_HOST_REQUEST',
      payload: { newHostSeat: selfSeat, snapshot: snapshot || null, ts: Date.now() },
    })
  } catch (e) {
    // ★ v0.4.18 对抗性审查 (V0414-04):WS / AndroidWs 模式下旧 host transport 可能已死
    //   sendMessage 失败不算致命 — 本地 self-loop (下面) 保证升级仍然能发生
    console.warn('[requestPromoteToHost] sendMessage failed (host transport likely dead):', e?.message || e)
  }
  // ★ v0.4.19 V0419-01 整合:确定性本地选举 — 不再每个 joiner 都本地升级
  //   旧版 (v0.4.18) 每个 joiner 都本地 self-loop,会多 host 冲突。
  //   新版:用 selectNextHostCandidate() 算出"应该是谁当 host":
  //     - 如果算法选本端(selfSeat === candidate):本地 self-loop 升级 + emit host:migrated
  //     - 如果算法选别的 joiner:本地模拟"收到新 host 是 candidate"消息,本端旁观让位
  //   所有 joiner 用同一算法 + 同一 peers Map 视图 → 确定性选出同一个 host
  const excluded = []
  if (snapshot) {
    if (Array.isArray(snapshot.finishedOrder)) excluded.push(...snapshot.finishedOrder)
    if (Array.isArray(snapshot.abandonedSeats)) excluded.push(...snapshot.abandonedSeats)
  }
  const candidate = (typeof selectNextHostCandidate === 'function')
    ? selectNextHostCandidate(excluded)
    : null
  if (candidate != null && candidate !== selfSeat) {
    // 旁观分支:不升级自己,模拟"收到别人升级"消息,本地让位
    if (transport) {
      _onTransportMessage({
        type: 'PROMOTE_HOST_REQUEST',
        from: candidate,
        to: null,
        ts: Date.now(),
        payload: { newHostSeat: candidate, snapshot: snapshot || null, ts: Date.now() },
      })
    }
    return true
  }
  // ★ v0.4.18 对抗性审查 (V0414-04):本地 self-loop — 不依赖旧 host transport
  //   旧版只在 BC 模式下 self-loop。WS / AndroidWs 模式下旧 host transport 已死时
  //   (host 崩溃 / 杀进程 / 断电),joiner 发的 PROMOTE_HOST_REQUEST 发不出去 → 永远不升级
  //   现在统一:不论 transport 类型,都本地 self-loop 一次,让 joiner 端能确定性地升级。
  //   _handleJoinerMessage 内部 _promotedHostSeat 去重(本进程内) + 旁观分支(其他 joiner 让位)。
  //   多 joiner 同时本地升级:每个进程独立去重,可能多 host。靠 rebuildAsHost 内部判断
  //   (浏览器 ws 客户端无 server 能力 → open('self') 失败 → onHostMigrated isMyself+rebuildAsHost
  //    failed → emit host:lost → 业务层跳首页让用户重连)。
  //   兼容原 BC 逻辑:BC 不回环,必须本地 self-loop;WS 回环(理论),但 host transport 死了
  //   也得本地 self-loop,所以现在统一都做。
  // ★ v0.4.19 进一步约束:仅当本端 canHostAsNewHost() === true 才本地 self-loop,
  //   浏览器 ws joiner(canHost=false)直接走 host:lost 路径,不假装自己是 host
  if (transport && canHostAsNewHost()) {
    _onTransportMessage({
      type: 'PROMOTE_HOST_REQUEST',
      from: selfSeat,
      to: null,
      ts: Date.now(),
      payload: { newHostSeat: selfSeat, snapshot: snapshot || null, ts: Date.now() },
    })
  } else if (transport) {
    // 浏览器 ws joiner:本端无 server 能力,不能升级
    //   emit host:lost 让业务层跳首页让用户重连(选新 host 重连或自己开房)
    emit('host:lost', { reason: 'no_server_capability', ts: Date.now() })
  }
  return true
}

function isConnected() {
  if (!transport) return false
  if (typeof transport.isReady !== 'function') return true
  try { return !!transport.isReady() } catch (e) { return false }
}
function getPeers() { return peers }
function getSelfInfo() { return selfInfo }

// ============== v0.4.20 V0420 真正的"第二发现通道"(纯 JS 版)==============
// smartReconnectToPeers(roomNo, opts):
//   循环尝试 connect 所有缓存的 peer hostAddress(canHost=true 优先,ts 最新优先)
//   找到第一个能连的就是新 host(他升级后已经起 server 在该地址)
//   成功后调 joinRoom(...) 自动重新进房
//
// 参数:
//   roomNo: 房间号(必传)
//   opts:
//     - self: { nickname, avatar } 重新进房用的玩家信息(必传)
//     - onSuccess: (newHostAddress) => {} 找到新 host 回调
//     - onFail: (tried) => {} 全部失败回调(tried 是尝试过的地址列表)
//     - timeoutMs: 每个地址尝试超时(默认 2000ms)
//     - maxRetries: 最多尝试几个地址(默认 5)
//
// 局限:
//   - 本地 localStorage 只能存 joiner 自己见过的 peer;新加的 joiner 没缓存
//   - 这是"猜",不是真正发现 — 配合 v0.4.19 确定性选举 + v0.4.17 TRANSPORT_REBUILD_ANNOUNCE
//     兜底(host 主动退出场景能直接收到地址,host 崩溃场景走 smartReconnectToPeers)
async function smartReconnectToPeers(roomNo, opts = {}) {
  if (!roomNo) return { ok: false, reason: 'no_room' }
  const candidates = getCachedPeerHostAddresses(roomNo)
  if (candidates.length === 0) {
    return { ok: false, reason: 'no_candidates', tried: [] }
  }
  const self = opts.self || (selfInfo && { nickname: selfInfo.nickname, avatar: selfInfo.avatar })
  if (!self) {
    return { ok: false, reason: 'no_self_info', tried: [] }
  }
  const timeoutMs = opts.timeoutMs || 2000
  const maxRetries = Math.min(opts.maxRetries || 5, candidates.length)

  const tried = []
  for (let i = 0; i < maxRetries; i++) {
    const c = candidates[i]
    tried.push(c.hostAddress)
    // ★ 解析 hostAddress 为 hostIp:hostPort → 调 joinRoom
    let parsed = null
    try { parsed = parseHostAddress(c.hostAddress) } catch (e) { continue }
    try {
      // joinRoom 是同步的(open 是异步 fire-and-forget),连接成功由 transport 内部 emit 'connect'
      //   失败由 transport 内部 emit 'error' 或 '_DISCONNECT'
      //   这里我们用 Promise 包装 listen 'connect'/'error' 事件
      // ★ v0.4.21 对抗性审查 V0420-1 修复:之前用 off('connect') 不传 fn 会清空所有
      //   connect 监听器(包含 useGameLogic.onConnectSnapshot),导致新 joiner 拿不到初始快照。
      //   修法:保存 handler 引用,off 传具体 handler;onConnect/onError 里 clearTimeout
      //   避免 setTimeout 泄漏(每次循环泄漏 1 个 → 1 小时反复调用越积越多)。
      // ★ P1-06:handler 引用必须在 Promise 外声明,否则 off 时 ReferenceError 且监听器泄漏。
      let onConnect, onError, timer
      const cleanup = () => {
        if (timer) { clearTimeout(timer); timer = null }
        try { off('connect', onConnect) } catch (_) {}
        try { off('error', onError) } catch (_) {}
      }
      const ok = await new Promise((resolve) => {
        let resolved = false
        timer = null
        onConnect = () => {
          if (resolved) return
          resolved = true
          cleanup()
          resolve(true)
        }
        onError = () => {
          if (resolved) return
          resolved = true
          cleanup()
          resolve(false)
        }
        timer = setTimeout(() => {
          if (resolved) return
          resolved = true
          cleanup()
          resolve(false)
        }, timeoutMs)
        try {
          on('connect', onConnect)
          on('error', onError)
          // 同步调 joinRoom(open 是异步,transport 内部 emit 'connect'/'error')
          joinRoom(roomNo, self, { hostIp: parsed.hostIp, hostPort: parsed.hostPort })
        } catch (e) {
          if (!resolved) { resolved = true; cleanup(); resolve(false) }
        }
      })
      if (ok) {
        if (typeof opts.onSuccess === 'function') opts.onSuccess(c.hostAddress)
        return { ok: true, hostAddress: c.hostAddress, tried }
      }
    } catch (e) { /* try next */ }
  }
  if (typeof opts.onFail === 'function') opts.onFail(tried)
  return { ok: false, reason: 'all_failed', tried }
}

// 清除某房间的 peer 缓存(开新房前调用,避免旧房数据污染)
function clearPeerHostAddressCache(roomNo) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(_peerCacheKey(roomNo))
  } catch (e) { /* swallow */ }
}

/**
 * v0.4.22 P1:把当前 host 房间摘要绑定到 transport 的 /room-info HTTP 端点。
 */
function _bindRoomInfoProvider(tr) {
  if (!tr || typeof tr.setRoomInfoProvider !== 'function') return
  tr.setRoomInfoProvider(() => ({
    roomNo: roomId,
    playerCount: peers.size,
    maxPlayers: 4,
    hostNickname: selfInfo?.nickname || '',
  }))
}

/**
 * v0.4.22 P3:原生环境注册 mDNS 服务,让同局域网 joiner 无需猜测 IP。
 */
async function _registerHostMdns() {
  if (!isMdnsAvailable()) return
  if (!transport || typeof transport.getBoundPort !== 'function') return
  const port = transport.getBoundPort()
  if (!port || !roomId) return
  // 停止旧注册(防止重建 transport 后残留)
  if (mdnsRegStop) { try { await mdnsRegStop() } catch (_) {} mdnsRegStop = null }
  const safeName = String(roomId).replace(/[^a-zA-Z0-9_-]/g, '')
  const name = `guandan-${safeName || 'room'}`
  const r = await registerMdnsService({ name, port, roomNo: roomId })
  if (r.ok && r.stop) mdnsRegStop = r.stop
}

/**
 * 生成候选 host 地址列表(浏览器环境无 UDP/多播,只能猜测常见热点网段 + 当前页来源)。
 */
function _generateLanCandidates() {
  const list = []
  // 只在浏览器 / Capacitor WebView 环境猜测常见热点网段;
  // Node 测试环境没有 window,避免每次跑 100+ 个 HTTP 探测导致超时。
  const isBrowserLike = typeof window !== 'undefined'
  if (isBrowserLike) {
    for (const subnet of COMMON_SUBNETS) {
      list.push(`${subnet}.1:${DEFAULT_WS_PORT}`)
      for (let i = 2; i <= 20; i++) list.push(`${subnet}.${i}:${DEFAULT_WS_PORT}`)
    }
  }
  try {
    const loc = typeof location !== 'undefined' ? location : null
    if (loc && loc.host) list.push(loc.host)
  } catch (_) {}
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(PEER_CACHE_KEY_PREFIX)) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          for (const e of arr) {
            if (e && typeof e.hostAddress === 'string' && e.hostAddress) list.push(e.hostAddress)
          }
        }
      }
    }
  } catch (_) {}
  const seen = new Set()
  const out = []
  for (const addr of list) {
    if (seen.has(addr)) continue
    seen.add(addr)
    try { parseHostAddress(addr); out.push(addr) } catch (_) {}
  }
  return out
}

function _normalizeRoomInfo(hostIp, hostPort, payload) {
  const roomNo = String(payload.roomNo || '')
  const playerCount = typeof payload.playerCount === 'number' ? payload.playerCount : 0
  const maxPlayers = typeof payload.maxPlayers === 'number' ? payload.maxPlayers : 4
  const hostNickname = payload.hostNickname || ''
  const name = roomNo
    ? `${hostNickname || '房主'}的房间 · ${roomNo} (${playerCount}/${maxPlayers})`
    : `${hostNickname || '房主'}的房间 (${playerCount}/${maxPlayers})`
  return {
    ip: hostIp,
    port: hostPort,
    roomNo,
    playerCount,
    maxPlayers,
    hostNickname,
    name,
    key: `${hostIp}:${hostPort}:${roomNo}`,
  }
}

async function _probeHostHttp(hostAddress, timeoutMs) {
  if (typeof fetch === 'undefined') return null
  let parsed
  try { parsed = parseHostAddress(hostAddress) } catch (e) { return null }
  const { hostIp, hostPort } = parsed
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null
  let timer = null
  if (controller) {
    timer = _setTimeoutFn(() => { try { controller.abort() } catch {} }, timeoutMs)
  }
  try {
    const bracketed = (hostIp.includes(':') && !hostIp.startsWith('[')) ? `[${hostIp}]` : hostIp
    const res = await fetch(`http://${bracketed}:${hostPort}/room-info`, { signal: controller?.signal })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !data.roomNo) return null
    return _normalizeRoomInfo(hostIp, hostPort, data)
  } catch (e) {
    return null
  } finally {
    if (timer) _clearTimeoutFn(timer)
  }
}

function _probeHostWs(hostAddress, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') return resolve(null)
    let ws = null
    let timer = null
    let done = false
    const finish = (v) => {
      if (done) return
      done = true
      if (timer) { _clearTimeoutFn(timer); timer = null }
      if (ws) { try { ws.close() } catch (_) {} ws = null }
      resolve(v)
    }
    try {
      const { hostIp, hostPort } = parseHostAddress(hostAddress)
      const bracketed = (hostIp.includes(':') && !hostIp.startsWith('[')) ? `[${hostIp}]` : hostIp
      ws = new WebSocket(`ws://${bracketed}:${hostPort}/`)
      ws.addEventListener('open', () => {
        try { ws.send(JSON.stringify({ type: 'ROOM_PROBE', payload: { ts: Date.now() } })) } catch (_) { finish(null) }
      })
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg && msg.type === 'ROOM_PROBE_ACK' && msg.payload) {
            finish(_normalizeRoomInfo(hostIp, hostPort, msg.payload))
          }
        } catch (_) {}
      })
      ws.addEventListener('error', () => finish(null))
      ws.addEventListener('close', () => finish(null))
      timer = _setTimeoutFn(() => finish(null), timeoutMs)
    } catch (_) {
      finish(null)
    }
  })
}

/**
 * 扫描局域网房间 —— v0.4.22 P1 真正第二发现通道
 *
 * 浏览器环境无 UDP/多播,通过对常见热点网段做 HTTP / WebSocket 探测,
 * 发现正在广播的 host。返回 { ip, port, roomNo, playerCount, maxPlayers, hostNickname, name, key }[]。
 *
 * opts:
 *   - candidates?: string[] 可覆盖候选地址(单测 / 高级用法)
 *   - signal?: AbortSignal 支持外部取消扫描
 *
 * @param {{candidates?:string[], signal?:AbortSignal}} [opts]
 * @returns {Promise<object[]>}
 */
async function scanLanRooms(opts = {}) {
  if (typeof WebSocket === 'undefined' && typeof fetch === 'undefined') return []
  const signal = opts?.signal
  const [httpWs, mdns] = await Promise.all([
    _scanHttpWsRooms(opts),
    _scanMdnsRooms(signal, 800),
  ])
  if (signal?.aborted) return httpWs
  const seen = new Set(httpWs.map(r => r.key))
  for (const r of mdns) {
    if (!seen.has(r.key)) {
      seen.add(r.key)
      httpWs.push(r)
    }
  }
  return httpWs
}

async function _scanHttpWsRooms(opts = {}) {
  let candidates = Array.isArray(opts?.candidates) ? opts.candidates : _generateLanCandidates()
  if (candidates.length > MAX_SCAN_CANDIDATES) candidates = candidates.slice(0, MAX_SCAN_CANDIDATES)
  if (candidates.length === 0) return []
  const found = []
  const seen = new Set()
  const signal = opts?.signal
  const processOne = async (hostAddress) => {
    if (signal?.aborted) return
    try {
      if (typeof fetch !== 'undefined') {
        const httpInfo = await _probeHostHttp(hostAddress, SCAN_HTTP_TIMEOUT_MS)
        if (httpInfo && httpInfo.roomNo && !seen.has(httpInfo.key)) {
          seen.add(httpInfo.key)
          found.push(httpInfo)
          return
        }
      }
    } catch (_) {}
    if (signal?.aborted) return
    try {
      const wsInfo = await _probeHostWs(hostAddress, ROOM_PROBE_TIMEOUT_MS)
      if (wsInfo && wsInfo.roomNo && !seen.has(wsInfo.key)) {
        seen.add(wsInfo.key)
        found.push(wsInfo)
      }
    } catch (_) {}
  }
  for (let i = 0; i < candidates.length; i += SCAN_CONCURRENCY) {
    if (signal?.aborted) break
    await Promise.all(candidates.slice(i, i + SCAN_CONCURRENCY).map(processOne))
  }
  return found
}

/**
 * v0.4.22 P3:原生环境通过 mDNS 扫描房间(无需猜测 IP)。
 */
async function _scanMdnsRooms(signal, timeoutMs = 800) {
  if (!isMdnsAvailable()) return []
  const found = []
  let watcher = null
  try {
    watcher = await watchMdnsServices((svc) => {
      if (!svc.roomNo) return
      found.push(_normalizeRoomInfo(svc.ip, svc.port, {
        roomNo: svc.roomNo,
        playerCount: 0,
        maxPlayers: 4,
        hostNickname: '',
      }))
    })
  } catch (e) {
    return []
  }
  await new Promise((resolve) => {
    const timer = _setTimeoutFn(resolve, timeoutMs)
    if (signal) {
      const onAbort = () => { _clearTimeoutFn(timer); resolve() }
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  try { await watcher.stop() } catch (_) {}
  return found
}

// ============== 测试辅助 API ==============
function _sendHeartbeat() {
  if (!transport) return
  sendMessage({ type: 'HEARTBEAT', payload: { ts: Date.now() } })
}

function _tickHeartbeatChecker() {
  if (!heartbeatCheckTimer) return false
  const now = Date.now()
  for (const [seat, ts] of lastHeartbeat.entries()) {
    // ★ Phase 2 修复:被踢 seat 已在 kickPlayer 中清理,如果 lastHeartbeat 还有残留则跳过,
    //   避免重复 emit peer:leave / ai:takeover。
    if (_kickedSeats.has(seat)) {
      lastHeartbeat.delete(seat)
      continue
    }
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
  // ★ v2.4-p4 BUG-007:测试辅助,不污染被踢 seat 的 lastHeartbeat
  //   (被踢 seat 已被 kickPlayer 清掉 lastHeartbeat;测试不应主动加回,否则
  //    heartbeat checker 会再次触发 peer:leave 重复事件)
  if (_kickedSeats.has(seat)) return
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
  return transport.type
}

export {
  on, off, emit, close,
  isHost, isConnected, getSelfInfo, getPeers,
  getRoomId, setRoomId, getSelfSeat, setSelfSeat, getHostSeat, getHostEpoch, setHostEpoch, isAuthorityMessage,
  startAsHost, joinRoom, joinRemoteRoom, parseHostAddress, send, broadcast, sendTo,
  // ★ v2.4-p4 BUG-006/007:swapSeats 网络层权威 + kickPlayer 统一踢人协议
  swapSeats, kickPlayer,
  scanLanRooms,
  ensureUuid,
  // ★ v2.1 P3:host 迁移 API
  // v2.1 旧版 seat-based 选举函数,保留作向后兼容(requestHostMigration 用)
  selectNextHostBySeat, requestHostMigration, announceNewHost,
  // v0.4.19 V0419-01:确定性 UUID-based 选举(requestPromoteToHost 用)
  selectNextHostCandidate,
  // ★ v3.x P2-29(N-3 闭环):joiner 端兜底提升
  requestPromoteToHost,
  // ★ v0.4.8 N-1:host 迁移后 transport rebuild(client → server)
  rebuildAsHost,
  // ★ v0.4.13 对抗性审查 (P0-2 / P1-5):广播能力统一 + 主动 close 广播
  canBroadcast, broadcastPeerLeave,
  // ★ v0.4.19 V0419-01/02:确定性本地选举 + host 能力检测 + hostAddress 探测
  canHostAsNewHost, getSelfHostAddress,
  // ★ v0.4.20 V0420:真正的"第二发现通道"(纯 JS 实现)— peer hostAddress 缓存 + smart reconnect
  cachePeerHostAddress, getCachedPeerHostAddresses,
  smartReconnectToPeers, clearPeerHostAddressCache,
  // ★ v0.4.22 P1:局域网扫描发现内部 helper(单测用)
  _generateLanCandidates, _probeHostHttp, _probeHostWs, _normalizeRoomInfo,
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
  getRoomId, setRoomId, getSelfSeat, setSelfSeat, getHostSeat, getHostEpoch, setHostEpoch, isAuthorityMessage,
  startAsHost, joinRoom, joinRemoteRoom, send, broadcast, sendTo,
  // ★ v2.4-p4 BUG-006/007
  swapSeats, kickPlayer,
  scanLanRooms,
  // ★ v2.1 P3:host 迁移
  selectNextHostBySeat, requestHostMigration, announceNewHost,
  // ★ v0.4.19 V0419-01:确定性本地选举
  selectNextHostCandidate,
  // ★ v3.x P2-29:joiner 端兜底提升
  requestPromoteToHost,
  // ★ v0.4.8 N-1:host 迁移后 transport rebuild
  rebuildAsHost,
  // ★ v0.4.13 (P0-2 / P1-5)
  canBroadcast, broadcastPeerLeave,
  // ★ v0.4.19 V0419-01/02:确定性本地选举 + 能力检测
  canHostAsNewHost, getSelfHostAddress,
  // ★ v0.4.20 V0420:peer hostAddress 缓存 + smart reconnect
  cachePeerHostAddress, getCachedPeerHostAddresses,
  smartReconnectToPeers, clearPeerHostAddressCache,
}
export default net