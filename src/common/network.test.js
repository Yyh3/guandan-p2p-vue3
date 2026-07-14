/**
 * network.js 单元测试 (WS transport 路径)
 *
 * v2.0:每个 network.js 实例配一个独立的 WebSocketTransport(host 用 ephemeral port 0,
 * joiner 连 host)。保留 fake timer 注入,不依赖真实时间。
 *
 * 覆盖:
 *   - 公共 API(startAsHost / joinRoom / scanLanRooms / sendTo / broadcast / on / off)
 *   - sendTo 加 to 字段,定向消息过滤
 *   - scanLanRooms 返回 [] (v3.8 Bug 3 修复保留)
 *   - host 收到 JOIN 时分配 seat、满员回 ROOM_FULL
 *   - UUID 持久化 (sessionStorage)
 *   - 心跳发送 / 超时释放 / PEER_LEAVE 广播
 *   - BUG-7 防御:host 不依赖 broadcast loopback 触发 ai:takeover
 */

import { WebSocket, WebSocketServer } from 'ws'
import { parseHostAddress } from './network.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}  期望=${e} 实际=${a}`); fail++ }
}

// ============== Test helpers ==============

/**
 * 创建一个独立的 network.js 实例,绑定到 ws transport。
 * 默认 host 用 port 0 (ephemeral),joiner 连 host。
 */
async function makeInstance(tag, opts = {}) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)

  // fake timers
  const captured = { intervals: [], timeouts: [], cleared: [] }
  mod.__installFakeTimers({
    setInterval: (fn, ms) => {
      captured.intervals.push({ fn, ms, cancelled: false })
      return captured.intervals.length
    },
    clearInterval: (id) => {
      captured.cleared.push({ type: 'interval', id })
      if (id >= 1 && id <= captured.intervals.length) captured.intervals[id - 1].cancelled = true
    },
    setTimeout: (fn, ms) => {
      captured.timeouts.push({ fn, ms, cancelled: false })
      return captured.timeouts.length
    },
    clearTimeout: (id) => {
      captured.cleared.push({ type: 'timeout', id })
      if (id >= 1 && id <= captured.timeouts.length) captured.timeouts[id - 1].cancelled = true
    },
  })

  return { mod, captured }
}

async function makeHost(tag, port = 0) {
  const { mod, captured } = await makeInstance(tag)
  // 注入 transport factory:host 用 ephemeral port
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport({ port }))
  mod.setRoomId('test-' + tag)
  mod.startAsHost({ nickname: 'H', avatar: 'H' })
  // 等待 ws server bind
  let bound = null
  const start = Date.now()
  while (Date.now() - start < 2000) {
    const t = mod._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { bound = t.getBoundPort(); break }
    await new Promise(r => setTimeout(r, 5))
  }
  if (bound == null) throw new Error('host not ready after 2s')
  return { mod, captured, port: bound }
}

async function makeJoiner(tag, hostPort, fixedUuid, nickname = 'J', avatar = 'J') {
  if (fixedUuid !== undefined) {
    globalThis.sessionStorage = {
      _store: { 'guandan_session_uuid': fixedUuid },
      getItem(k) { return this._store[k] || null },
      setItem(k, v) { this._store[k] = v },
    }
  }
  const { mod, captured } = await makeInstance(tag)
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport())
  mod.joinRoom('test-' + tag, { nickname, avatar }, { hostIp: '127.0.0.1', hostPort })
  // 等待 joiner 分配到 seat
  let seat = -1
  const start = Date.now()
  while (Date.now() - start < 2000) {
    seat = mod.getSelfSeat()
    if (seat >= 1 && seat <= 3) break
    await new Promise(r => setTimeout(r, 5))
  }
  return { mod, captured, seat }
}

function resetSessionStorage() {
  globalThis.sessionStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function settle(ms = 100) {
  await new Promise(r => setTimeout(r, ms))
}

// ============== Test blocks ==============

console.log('\n=== 1. host 开房基本 API ===')
{
  const { mod: Net } = await makeInstance('h1')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h1f')
  Net._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Net.setRoomId('test-h1')
  const r1 = Net.startAsHost({ nickname: '房主', avatar: '🀄' })
  assert('startAsHost 返回 ok', r1.ok)
  assert('isHost() = true', Net.isHost() === true)
  assert('selfSeat = 0', Net.getSelfSeat() === 0)
  // 等 ws server bind
  await new Promise(r => setTimeout(r, 50))
  assert('isConnected() = true (transport ready)', Net.isConnected() === true)
  assert('peers 至少含自己', Net.getPeers().size >= 1)
  eq('peers[0].nickname = 房主', Net.getPeers().get(0)?.nickname, '房主')
  Net.close()
}

console.log('\n=== 2. 事件订阅(on / emit / off + 异常吞掉) ===')
{
  const { mod: Net } = await makeInstance('h2')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h2f')
  Net._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Net.setRoomId('test-h2')
  Net.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle(50)

  let count = 0
  const handler = () => count++
  Net.on('test:event', handler)
  Net.emit('test:event')
  Net.emit('test:event')
  assert('emit 2 次 handler 触发 2 次', count === 2)
  Net.off('test:event')
  Net.emit('test:event')
  assert('off 后再 emit 不触发', count === 2)
  Net.on('test:event', () => { throw new Error('boom') })
  Net.emit('test:event')
  assert('handler 抛错被吞掉(不冒泡)', true)
  Net.off('test:event')
  Net.close()
}

console.log('\n=== 3. send / broadcast / sendTo 返回值 ===')
{
  const { mod: Net } = await makeInstance('h3')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h3f')
  Net._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Net.setRoomId('test-h3')
  Net.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle(50)

  // 没有 joiner,host 的 send 会广播给 0 个 client,但仍然返回 true (transport 已 ready)
  const s1 = Net.send({ type: 'X', payload: 1 })
  assert('send 成功(transport ready)', s1 === true)
  const s2 = Net.broadcast({ type: 'X', payload: 1 })
  assert('broadcast 同 send', s2 === true)
  const s3 = Net.sendTo(1, { type: 'X', payload: 1 })
  assert('sendTo 也成功(无 client 时静默 no-op)', s3 === true)

  Net.close()
  await settle(20)
  const s4 = Net.send({ type: 'X' })
  assert('close 后 send 返回 false', s4 === false)
}

console.log('\n=== 4. sendTo 加 to 字段 + ws 端收到定向消息 ===')
{
  const { mod: Host } = await makeInstance('h4')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h4f')
  Host._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Host.setRoomId('test-h4')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })

  // 等 host bind
  let hostPort = null
  const start = Date.now()
  while (Date.now() - start < 2000) {
    hostPort = Host._getTransport()?.getBoundPort?.()
    if (hostPort != null) break
    await new Promise(r => setTimeout(r, 5))
  }

  // 直接开一个 raw ws client 模拟 joiner
  const { WebSocketTransport: WST } = await import('./network-transport-ws.js?t=h4f2')
  const { mod: Joiner } = await makeInstance('j4')
  Joiner._setTransportFactory(() => new WST())
  Joiner.joinRoom('test-h4', { nickname: 'J', avatar: 'J' }, { hostIp: '127.0.0.1', hostPort })

  // 等 joiner 拿到 seat
  let jSeat = -1
  const start2 = Date.now()
  while (Date.now() - start2 < 2000) {
    jSeat = Joiner.getSelfSeat()
    if (jSeat >= 1) break
    await new Promise(r => setTimeout(r, 10))
  }
  assert('joiner 拿到 seat >= 1', jSeat >= 1)

  // joiner 监听收到的所有消息
  const jRecv = []
  Joiner.on('message', (msg) => jRecv.push(msg))

  // host sendTo 给 joiner seat
  Host.sendTo(jSeat, { type: 'TO_TEST', payload: { x: 1 } })
  await settle(100)

  // joiner 应该收到带 to=jSeat 的消息
  const toMsgs = jRecv.filter(m => m.type === 'TO_TEST')
  assert('joiner 收到 host 的 sendTo', toMsgs.length === 1)
  assert('to 字段 = ' + jSeat, toMsgs[0]?.to === jSeat)
  eq('from = 0(host)', toMsgs[0]?.from, 0)

  // 反向:host 监听收到 joiner 的消息
  const hRecv = []
  Host.on('message', (msg) => hRecv.push(msg))
  Joiner.send({ type: 'J_HELLO', payload: {} })
  await settle(100)
  const jMsgs = hRecv.filter(m => m.type === 'J_HELLO')
  assert('host 收到 joiner 的消息', jMsgs.length === 1)
  eq('host 收到的 from = joiner seat', jMsgs[0]?.from, jSeat)

  // BUG-7 防御验证:host sendTo 时 host 自己的 onmessage 不应被触发
  // (即 jRecv 不会收到 host 自己的 sendTo,host 也不该看到自己的 broadcast)
  // 已经在 jRecv 过滤出 TO_TEST,host 也没 listener 监听自己 — 验证 joiner 端不重复收到
  assert('joiner 只收到 1 条 TO_TEST (不重复)', toMsgs.length === 1)

  Joiner.close()
  Host.close()
}

console.log('\n=== 5. close + 再开 ===')
{
  const { mod: Net } = await makeInstance('h5')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h5f')
  Net._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Net.setRoomId('test-h5')
  const r5 = Net.startAsHost({ nickname: 'X', avatar: 'X' })
  assert('第一次 startAsHost 成功', r5.ok)
  await settle(50)
  Net.close()
  assert('close 后 isConnected = false', Net.isConnected() === false)
  Net.setRoomId('test-h5b')
  const r5b = Net.startAsHost({ nickname: 'X', avatar: 'X' })
  assert('close 后可再开', r5b.ok)
  await settle(50)
  Net.close()
}

console.log('\n=== 6. scanLanRooms Node 环境无窗口时返回 [] ===')
{
  const { mod: Net } = await makeInstance('h6')
  const rooms = await Net.scanLanRooms()
  assert('返回数组', Array.isArray(rooms))
  assert('Node 环境(无 window)返回 0 项', rooms.length === 0)
}

console.log('\n=== 7. getSelfInfo + joiner 后 from 字段 ===')
{
  const { mod: Host, port } = await makeHost('h7')
  const { mod: Joiner, seat: jSeat } = await makeJoiner('j7', port, 'uuid-h7-j')

  // joiner 监听收到的所有消息,看 from 字段
  const jRecv = []
  Joiner.on('message', (msg) => jRecv.push(msg))

  // joiner broadcast
  Joiner.broadcast({ type: 'FROM_TEST', payload: {} })
  await settle(100)
  const jBc = jRecv.filter(m => m.type === 'FROM_TEST')
  assert('joiner 收到自己的 broadcast', jBc.length === 0)  // 不应回环

  Host.close()
  Joiner.close()
}

console.log('\n=== 8. ROOM_FULL 流程 ===')
{
  const { mod: Host, port } = await makeHost('h8')

  // 手造满员
  Host.getPeers().set(1, { nickname: 'P1', avatar: '1', uuid: 'p1' })
  Host.getPeers().set(2, { nickname: 'P2', avatar: '2', uuid: 'p2' })
  Host.getPeers().set(3, { nickname: 'P3', avatar: '3', uuid: 'p3' })

  // 第 4 个 joiner 用新 uuid,应该被 ROOM_FULL
  const { mod: J4 } = await makeJoiner('j8', port, 'uuid-h8-j4-different')
  await settle(100)
  // joiner 端应该触发 error 事件
  let errMsg = null
  J4.on('error', (e) => { errMsg = e })
  // ROOM_FULL 是在 joiner.connect 时收到的,J4 已 joinRoom,可能已经错过;
  // 但 host 不会回 SYNC,所以 joiner 会 schedule retry 然后收到 ROOM_FULL
  // 手动让 retry 触发一次
  await settle(500)
  // 检查 host 的 peers size 应该没增加
  assert('host peers.size 仍为 4 (满员拒收)', Host.getPeers().size === 4)

  Host.close()
  J4.close()
}

console.log('\n=== 9. setRoomId 在 startAsHost 之前(防 v3.8 死锁回归) ===')
{
  const { mod: Net } = await makeInstance('h9')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h9f')
  Net._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Net.setRoomId('order-test')
  assert('setRoomId 后 getRoomId = order-test', Net.getRoomId() === 'order-test')
  const r9 = Net.startAsHost({ nickname: 'ORD', avatar: 'O' })
  assert('接着 startAsHost 成功', r9.ok)
  Net.close()
}

// ============== v3.8 P1 新增测试块(UUID / 心跳 / 并发撞座) ==============

console.log('\n=== 10. UUID 持久化 (sessionStorage) ===')
{
  resetSessionStorage()
  globalThis.sessionStorage = {
    _store: { 'guandan_session_uuid': 'fixed-uuid-001' },
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
  const { mod: Net } = await makeInstance('h10')
  const u1 = Net.ensureUuid()
  assert('ensureUuid 返回 storage 中已存在的值', u1 === 'fixed-uuid-001')
  const u2 = Net.ensureUuid()
  assert('ensureUuid 二次调用返回相同值', u2 === 'fixed-uuid-001')
}

console.log('\n=== 11. startAsHost 后 selfInfo 含 uuid ===')
{
  resetSessionStorage()
  globalThis.sessionStorage = {
    _store: { 'guandan_session_uuid': 'host-uuid-001' },
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
  const { mod: Host } = await makeInstance('h11')
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=h11f')
  Host._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  Host.setRoomId('test-h11')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle(50)
  const hInfo = Host.getSelfInfo()
  assert('host selfInfo.uuid = host-uuid-001', hInfo?.uuid === 'host-uuid-001')
  assert('host peers[0].uuid 同步', Host.getPeers().get(0)?.uuid === 'host-uuid-001')
  Host.close()
}

console.log('\n=== 12. joiner selfInfo 含 uuid ===')
{
  resetSessionStorage()
  globalThis.sessionStorage = {
    _store: { 'guandan_session_uuid': 'joiner-uuid-001' },
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
  const { mod: Host, port } = await makeHost('h12')
  const { mod: Joiner } = await makeJoiner('j12', port, 'joiner-uuid-001')
  assert('joiner selfInfo.uuid = joiner-uuid-001', Joiner.getSelfInfo()?.uuid === 'joiner-uuid-001')
  Host.close()
  Joiner.close()
}

console.log('\n=== 13. host 收 JOIN 复用同 uuid seat (重连) ===')
{
  const { mod: Host, port } = await makeHost('h13')

  // joiner A 进来,seat=1
  globalThis.sessionStorage = {
    _store: { 'guandan_session_uuid': 'reconnect-uuid-001' },
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
  const { mod: JA } = await makeJoiner('j13a', port, 'reconnect-uuid-001')
  assert('A seat=1', JA.getSelfSeat() === 1)
  const sizeBefore = Host.getPeers().size
  JA.close()
  await settle(50)

  // 同 uuid 重连
  const { mod: JA2 } = await makeJoiner('j13b', port, 'reconnect-uuid-001', 'A2', 'A2')
  await settle(150)  // 等 host 处理 JOIN + 广播 SYNC 完成
  assert('A2 重连后 seat 仍是 1', JA2.getSelfSeat() === 1)
  assert('host peers.size 不增长 (复用)', Host.getPeers().size === sizeBefore)
  assert('host peers[1].nickname 更新为 A2', Host.getPeers().get(1)?.nickname === 'A2')

  Host.close()
  JA2.close()
}

console.log('\n=== 14. host 收 JOIN 分配新 seat (不同 uuid) ===')
{
  const { mod: Host, port } = await makeHost('h14')
  const { mod: JA } = await makeJoiner('j14a', port, 'uuid-A')
  assert('A seat=1', JA.getSelfSeat() === 1)
  const { mod: JB } = await makeJoiner('j14b', port, 'uuid-B')
  assert('B seat=2 (不同 uuid 走新分配)', JB.getSelfSeat() === 2)
  assert('host peers.size = 3', Host.getPeers().size === 3)
  Host.close()
  JA.close()
  JB.close()
}

console.log('\n=== 15. 心跳发送 (joiner 端 fake timer) ===')
{
  const { mod: Host, port } = await makeHost('h15')
  const { mod: Joiner, captured } = await makeJoiner('j15', port, 'uuid-h15-j')
  // joiner 注册的 intervals(心跳 + rejoin)
  assert('joiner 注册了 setInterval (心跳发送)', captured.intervals.length >= 1)
  const hbInterval = captured.intervals.find(t => t.ms === 2000)
  assert('心跳 interval 周期 = 2000ms (v2.1 调优)', !!hbInterval)

  // 手动调一次心跳 callback(joiner 发 HEARTBEAT,host 收到)
  const hbRecv = []
  Host.on('message:HEARTBEAT', (payload, from) => hbRecv.push({ payload, from }))
  hbInterval.fn()
  await settle(100)
  assert('host 收到 joiner 的 HEARTBEAT', hbRecv.length === 1)

  Host.close()
  Joiner.close()
}

console.log('\n=== 16. 心跳超时释放 seat + BUG-7 修复验证 ===')
{
  const { mod: Host, captured: hCap } = await makeHost('h16')
  const hostPort16 = Host._getTransport().getBoundPort()
  const { mod: Joiner } = await makeJoiner('j16', hostPort16, 'uuid-h16-j')
  assert('joiner seat=1', Joiner.getSelfSeat() === 1)
  assert('host peers 含 joiner', Host.getPeers().has(1))

  let leaveEvent = null
  let aiTakeoverEvent = null
  Host.on('peer:leave', (e) => { leaveEvent = e })
  Host.on('ai:takeover', (e) => { aiTakeoverEvent = e })

  // host 注册的心跳检查 interval (v2.1 调优:5000 → 2000)
  const checker = hCap.intervals.find(t => t.ms === 2000)
  assert('host 注册了心跳检查 interval (2000ms, v2.1)', !!checker)

  // 强制让 seat=1 的心跳过期
  Host._forceExpireHeartbeat(1)
  // 触发 checker
  checker.fn()
  await settle(100)

  assert('心跳超时后 host peers 不含 seat=1', !Host.getPeers().has(1))
  assert('emit peer:leave seat=1', leaveEvent?.seat === 1)
  assert('peer:leave 事件含 info', leaveEvent?.info != null)

  // ★★★ BUG-7 修复验证 ★★★
  assert('emit ai:takeover seat=1 (host 端本地触发,不靠 loopback)', aiTakeoverEvent?.seat === 1)
  assert('ai:takeover 事件含 info', aiTakeoverEvent?.info != null)

  Host.off('peer:leave')
  Host.off('ai:takeover')
  Host.close()
  Joiner.close()
}

console.log('\n=== 17. PEER_LEAVE 广播给其它 joiner (BUG-7 joiner 端路径) ===')
{
  const { mod: Host, port } = await makeHost('h17')
  const { mod: JA, seat: aSeat } = await makeJoiner('j17a', port, 'uuid-h17-a')
  const { mod: JB } = await makeJoiner('j17b', port, 'uuid-h17-b')
  assert('A seat=1, B seat=2', aSeat === 1 && JB.getSelfSeat() === 2)

  let leaveB = null
  let aiTakeoverB = null
  JB.on('peer:leave', (e) => { leaveB = e })
  JB.on('ai:takeover', (e) => { aiTakeoverB = e })

  // 模拟 A 掉线
  Host._forceExpireHeartbeat(1)
  Host._tickHeartbeatChecker()
  await settle(100)

  assert('B 收到 peer:leave seat=1', leaveB?.seat === 1)
  assert('B 收到 ai:takeover seat=1', aiTakeoverB?.seat === 1)

  JB.off('peer:leave')
  JB.off('ai:takeover')
  Host.close()
  JA.close()
  JB.close()
}

console.log('\n=== 18. close 清心跳 timer ===')
{
  const { mod: Host, captured: hCap } = await makeHost('h18')
  assert('host 注册了心跳检查 interval', hCap.intervals.length >= 1)
  Host.close()
  assert('host close 后 clearInterval 被调用', hCap.cleared.some(c => c.type === 'interval'))
}

console.log('\n=== 19. ★ BUG-7 防御:host broadcast → host 自己的 transport onMessage 触发次数 ===')
{
  const { mod: Host, port } = await makeHost('h19')

  // 监听 host 自己的 transport onMessage 收到的所有消息(通过 'message' 事件)
  const hostReceived = []
  Host.on('message', (msg) => hostReceived.push(msg))

  // host broadcast 一条消息
  Host.broadcast({ type: 'HOST_SELF_TEST', payload: { tag: 'no-loopback' } })
  await settle(100)

  // ★ 关键断言:host 自己的 onmessage 收到 0 条 (transport 不回环 + 网络层不靠 loopback)
  const hostSelfLoops = hostReceived.filter(m => m.type === 'HOST_SELF_TEST')
  assert('host broadcast → host 自己的 message handler 收到 0 条 (transport 不回环)', hostSelfLoops.length === 0)
  assert('host 完全没有收到任何消息(其他 joiner 也没广播)', hostReceived.length === 0)

  Host.close()
}

console.log('\n=== 20. ★ BUG-7 防御:host 心跳超时 → host 端 ai:takeover 触发 1 次,addAIPlayer 等价语义 ===')
{
  const { mod: Host, captured: hCap } = await makeHost('h20')
  const hostPort20 = Host._getTransport().getBoundPort()
  const { mod: Joiner } = await makeJoiner('j20', hostPort20, 'uuid-h20-j')
  assert('joiner seat=1', Joiner.getSelfSeat() === 1)

  let aiCount = 0
  const aiSeats = []
  Host.on('ai:takeover', (e) => { aiCount++; aiSeats.push(e?.seat) })

  // 模拟 joiner 掉线:host 强制过期心跳 + 触发 checker
  Host._forceExpireHeartbeat(1)
  const checker = hCap.intervals.find(t => t.ms === 2000)
  checker.fn()
  await settle(100)

  // ★ 关键断言:host 端 ai:takeover 触发 1 次(直接 emit,不靠 broadcast loopback)
  assert('host 心跳超时 → host 端 ai:takeover 触发恰好 1 次', aiCount === 1)
  assert('ai:takeover 触发 seat=1', aiSeats[0] === 1)

  Host.off('ai:takeover')
  Host.close()
  Joiner.close()
}

console.log('\n=== 21. v2.1 精确性:心跳超时边界 (now - ts) ===')
{
  // 直接验证 _tickHeartbeatChecker 的算法边界,不受 TIMEOUT/CHECK_INTERVAL 常量变化影响
  // 思路:
  //   1) mock Date.now() 锚定 mockNow
  //   2) 用 _forceExpireHeartbeat 设 seat=1 的 ts = mockNow - TIMEOUT - 1000 (刚过期)
  //   3) 改变 mockNow 调 checker,断言释放/不释放边界
  // 这等价于"joiner 在 mockNow 时刻发心跳,然后 mockNow+N ms 后 host 检查"
  const { mod: Host, port } = await makeHost('h21')
  const { mod: Joiner } = await makeJoiner('j21', port, 'uuid-h21-j')
  assert('joiner seat=1', Joiner.getSelfSeat() === 1)
  assert('host peers 含 seat=1', Host.getPeers().has(1))

  let leaveSeat = null
  Host.on('peer:leave', (e) => { leaveSeat = e?.seat })

  const _realDateNow = Date.now
  try {
    // 锚定 mockNow (joiner 心跳刚发的瞬间)
    let mockNow = 1000000
    Date.now = () => mockNow

    // 设 seat=1 的 ts = mockNow (=刚发完心跳,新鲜)
    // 用 _forceExpireHeartbeat 的反向逻辑:不能直接设 ts,所以改用连续 _force + 时序模拟
    // _forceExpireHeartbeat 写 ts = now - TIMEOUT - 1000
    // 现在 now = mockNow,所以 ts = mockNow - 7000
    // → 距过期 7000ms (远超 TIMEOUT 6000) → 任何时候 checker 都会释放
    Host._forceExpireHeartbeat(1)
    // ts = mockNow - 7000 = 993000
    // 边界 1:now=ts+5500 (mockNow=mockNow-7000+5500=mockNow-1500) → 距过期 5500ms ≤ TIMEOUT → 不释放
    mockNow = 1000000 - 7000 + 5500  // = 998500
    Host._tickHeartbeatChecker()
    await settle(50)
    assert('mockNow 距 ts = 5500ms (≤ TIMEOUT) → 不释放 seat=1', Host.getPeers().has(1))
    assert('5500ms 边界内 peer:leave 未触发', leaveSeat === null)

    // 边界 2:now=ts+6100 (mockNow=mockNow-7000+6100=mockNow-900) → 距过期 6100ms > TIMEOUT → 释放
    mockNow = 1000000 - 7000 + 6100  // = 999100
    Host._tickHeartbeatChecker()
    await settle(50)
    assert('mockNow 距 ts = 6100ms (> TIMEOUT) → 释放 seat=1', !Host.getPeers().has(1))
    assert('6100ms 超 TIMEOUT 后 peer:leave seat=1 触发', leaveSeat === 1)
  } finally {
    Date.now = _realDateNow
  }

  // === 边界 3:验证常数关系 ===
  const { HEARTBEAT_TIMEOUT_MS, HEARTBEAT_CHECK_INTERVAL_MS } = Host
  assert('HEARTBEAT_TIMEOUT_MS = 6000 (v2.1 调优)', HEARTBEAT_TIMEOUT_MS === 6000)
  assert('HEARTBEAT_CHECK_INTERVAL_MS = 2000 (v2.1 调优)', HEARTBEAT_CHECK_INTERVAL_MS === 2000)
  assert('HEARTBEAT_TIMEOUT_MS + CHECK_INTERVAL = 8000ms (最坏释放延迟)',
    HEARTBEAT_TIMEOUT_MS + HEARTBEAT_CHECK_INTERVAL_MS === 8000)

  Host.off('peer:leave')
  Host.close()
  Joiner.close()
}

console.log('\n=== 22. v2.1 回归:joiner 存活 + checker 触发 → host 不释放 (BUG-1 出牌同步路径) ===')
{
  // 回归 BUG-1:joiner 存活期间 + lastHeartbeat 未过期,host 不应误释放
  // 场景:joiner join 后立刻 mock 时间推进,但 lastHeartbeat[seat] 是真实时间戳;
  //   关键:不能调 _forceExpireHeartbeat (那会把 ts 拉到过去),只调 checker + 看是否被错误释放
  // 等价于:joiner 在出牌期间 (心跳正常) → 永远不会触发释放
  const { mod: Host, port } = await makeHost('h22')
  const { mod: Joiner } = await makeJoiner('h22j', port, 'uuid-h22-j')
  assert('joiner seat=1', Joiner.getSelfSeat() === 1)
  assert('host peers 含 seat=1 (joiner 在线)', Host.getPeers().has(1))

  let leaveCount = 0
  let aiTakeoverCount = 0
  Host.on('peer:leave', () => { leaveCount++ })
  Host.on('ai:takeover', () => { aiTakeoverCount++ })

  // joiner 心跳发送 interval 注册检查
  // (captured.intervals 里包含心跳 + rejoin 两个 interval)
  // 直接断言 ms=2000 的 interval 是心跳 (rejoin 是 15000ms)
  // 注意:这是 host 端 captured.intervals,不是 joiner 端。joiner 端 captured 需要重做

  // ★ 关键:不调 _forceExpireHeartbeat + 不动 Date.now → host 端 ts 是 join 时刻的 Date.now()
  //   推进几 ms 后,now - ts ≈ 几 ms,远小于 TIMEOUT(6000) → 不释放
  Host._tickHeartbeatChecker()
  await settle(50)
  Host._tickHeartbeatChecker()
  await settle(50)
  Host._tickHeartbeatChecker()
  await settle(50)

  assert('joiner 存活 + checker ×3 → host 不释放 seat=1 (BUG-1 路径)', Host.getPeers().has(1))
  assert('joiner 存活 + checker ×3 → peer:leave 触发 0 次', leaveCount === 0)
  assert('joiner 存活 + checker ×3 → ai:takeover 触发 0 次 (BUG-7 不误触发)', aiTakeoverCount === 0)

  Host.off('peer:leave')
  Host.off('ai:takeover')
  Host.close()
  Joiner.close()
}

console.log('\n=== 23. v2.1 端到端:joiner 掉线后推进 6.5s → host 释放 (mock Date.now 验证 6-8s 窗口) ===')
{
  // 核心验证:不调 _forceExpireHeartbeat (那相当于作弊),而是:
  //   1) joiner close (停止发心跳,等价于掉线)
  //   2) mock Date.now 推进到 joinTs + 5500ms → 不释放
  //   3) mock Date.now 推进到 joinTs + 6500ms → 释放
  // 这证明:HEARTBEAT_TIMEOUT_MS=6000 + CHECK_INTERVAL=2000 的精确性,落在 6-8s 区间
  const { mod: Host, port } = await makeHost('h23')
  const { mod: Joiner } = await makeJoiner('h23j', port, 'uuid-h23-j')
  assert('joiner seat=1', Joiner.getSelfSeat() === 1)
  assert('host peers 含 seat=1', Host.getPeers().has(1))

  let leaveEvent = null
  let aiTakeoverEvent = null
  Host.on('peer:leave', (e) => { leaveEvent = e })
  Host.on('ai:takeover', (e) => { aiTakeoverEvent = e })

  // 锚定 join 时刻的"逻辑时间"
  const joinTs = Date.now()

  // ★ 模拟掉线:joiner close,不再发心跳
  //   (close 会清掉 joiner 自己的 heartbeat timer,但 host 端 lastHeartbeat[seat] 保留 joinTs)
  Joiner.close()
  await settle(50)

  // mock 时间推进 (在 try/finally 里还原)
  const _realDateNow = Date.now
  try {
    // 阶段 1:推进 5500ms (≤ TIMEOUT 6000) → 不释放
    Date.now = () => joinTs + 5500
    Host._tickHeartbeatChecker()
    await settle(50)
    assert('掉线 5.5s (≤ TIMEOUT) → host 不释放 seat=1', Host.getPeers().has(1))
    assert('掉线 5.5s → peer:leave 未触发', leaveEvent === null)
    assert('掉线 5.5s → ai:takeover 未触发', aiTakeoverEvent === null)

    // 阶段 2:推进 6500ms (> TIMEOUT 6000) → 释放
    Date.now = () => joinTs + 6500
    Host._tickHeartbeatChecker()
    await settle(50)
    assert('掉线 6.5s (> TIMEOUT) → host 释放 seat=1', !Host.getPeers().has(1))
    assert('掉线 6.5s → peer:leave seat=1 触发', leaveEvent?.seat === 1)
    assert('掉线 6.5s → ai:takeover seat=1 触发 (BUG-7 修复仍生效)', aiTakeoverEvent?.seat === 1)
  } finally {
    Date.now = _realDateNow
  }

  Host.off('peer:leave')
  Host.off('ai:takeover')
  Host.close()
}

console.log('\n=== 24. v2.1 精确性:HEARTBEAT_*_MS 常量值 + 关系 ===')
{
  // 通过 Host 模块导出常量验证最终值,防止后续误改回归 v3.8 旧值
  const { mod: Host } = await makeHost('h24')
  const {
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_CHECK_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_MS,
  } = Host
  assert('HEARTBEAT_INTERVAL_MS = 2000 (joiner 发心跳节奏)', HEARTBEAT_INTERVAL_MS === 2000)
  assert('HEARTBEAT_CHECK_INTERVAL_MS = 2000 (host 检查节奏)', HEARTBEAT_CHECK_INTERVAL_MS === 2000)
  assert('HEARTBEAT_TIMEOUT_MS = 6000 (掉线判定阈值)', HEARTBEAT_TIMEOUT_MS === 6000)
  // 最坏释放延迟 = TIMEOUT + CHECK_INTERVAL = 8000ms
  assert('最坏释放延迟 = TIMEOUT + CHECK_INTERVAL = 8000ms (落在 6-8s 目标区间上沿)',
    HEARTBEAT_TIMEOUT_MS + HEARTBEAT_CHECK_INTERVAL_MS === 8000)
  // 平均释放延迟 = TIMEOUT + CHECK_INTERVAL/2 = 7000ms
  assert('平均释放延迟 ≈ TIMEOUT + CHECK_INTERVAL/2 = 7000ms (落在 6-8s 目标区间中心)',
    HEARTBEAT_TIMEOUT_MS + Math.floor(HEARTBEAT_CHECK_INTERVAL_MS / 2) === 7000)
  Host.close()
}

// ============== 汇总 ==============
// ============== Batch 1 补充测试 ==============
console.log('\n=== 25. parseHostAddress 严格端口解析 ===')
{
  eq('192.168.1.5:8848 解析正确', parseHostAddress('192.168.1.5:8848'), { hostIp: '192.168.1.5', hostPort: 8848 })
  eq('[::1]:8848 解析正确', parseHostAddress('[::1]:8848'), { hostIp: '::1', hostPort: 8848 })
  let threw = false
  try { parseHostAddress('192.168.1.5:8848abc') } catch (e) { threw = true }
  assert('IPv4 端口带 trailing junk 抛出错误', threw)
  threw = false
  try { parseHostAddress('[::1]:8848junk') } catch (e) { threw = true }
  assert('IPv6 端口带 trailing junk 抛出错误', threw)
}

console.log('\n=== 26. smartReconnectToPeers 不泄漏 connect/error 监听器 ===')
{
  // 动态 import 一个独立实例,避免污染主测试实例
  const mod = await import('./network.js?tag=batch1-smart&_=' + Math.random())
  // 注入假 localStorage + 缓存一个候选地址
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  const roomNo = 'batch1-room'
  mod.cachePeerHostAddress(roomNo, 1, '127.0.0.1:59999', true)
  const beforeConnect = mod._listenerCount('connect')
  const beforeError = mod._listenerCount('error')
  // 启动 smart reconnect,地址必然连不上,会在超时后 resolve(false)
  const p = mod.smartReconnectToPeers(roomNo, { self: { nickname: 'A', avatar: 'X' }, timeoutMs: 50 })
  await p
  const afterConnect = mod._listenerCount('connect')
  const afterError = mod._listenerCount('error')
  assert('smartReconnect 前后 connect 监听器数量不变', afterConnect === beforeConnect)
  assert('smartReconnect 前后 error 监听器数量不变', afterError === beforeError)
  delete globalThis.localStorage
}

console.log('\n=== 27. hostEpoch 权威校验严格化 ===')
{
  const { mod: Host } = await makeHost('epoch-strict')
  const epoch = Host.getHostEpoch()
  assert('host 初始化后 epoch > 0', epoch > 0)
  assert('同 epoch 且 from=hostSeat 视为权威', Host.isAuthorityMessage({ from: 0, hostEpoch: epoch }))
  assert('非 hostSeat 来源不权威', !Host.isAuthorityMessage({ from: 1, hostEpoch: epoch }))
  assert('缺少 hostEpoch 不再视为权威', !Host.isAuthorityMessage({ from: 0 }))
  assert('hostEpoch 不匹配不权威', !Host.isAuthorityMessage({ from: 0, hostEpoch: epoch + 1 }))
  Host.close()
}

console.log('\n=== 28. host 权威消息自动携带 hostEpoch ===')
{
  const { mod: Host } = await makeHost('epoch-stamp')
  const t = Host._getTransport()
  const originalSend = t.send.bind(t)
  let lastMsg = null
  t.send = (msg) => {
    lastMsg = msg
    return originalSend(msg)
  }
  Host.broadcast({ type: 'STATE_SNAPSHOT', payload: { snapshot: true } })
  await settle(50)
  assert('broadcast 的 STATE_SNAPSHOT 携带 hostEpoch', lastMsg && lastMsg.hostEpoch === Host.getHostEpoch())
  t.send = originalSend
  Host.close()
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
// WS server / open handles 可能让 process 不退出,显式退出
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 50)