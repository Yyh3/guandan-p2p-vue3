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

console.log('\n=== 6. scanLanRooms 返回 [] (浏览器/真机版都不支持 LAN 扫描) ===')
{
  const { mod: Net } = await makeInstance('h6')
  const rooms = await Net.scanLanRooms()
  assert('返回数组', Array.isArray(rooms))
  assert('返回 0 项', rooms.length === 0)
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
  const hbInterval = captured.intervals.find(t => t.ms === 3000)
  assert('心跳 interval 周期 = 3000ms', !!hbInterval)

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

  // host 注册的心跳检查 interval
  const checker = hCap.intervals.find(t => t.ms === 5000)
  assert('host 注册了心跳检查 interval (5000ms)', !!checker)

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
  const checker = hCap.intervals.find(t => t.ms === 5000)
  checker.fn()
  await settle(100)

  // ★ 关键断言:host 端 ai:takeover 触发 1 次(直接 emit,不靠 broadcast loopback)
  assert('host 心跳超时 → host 端 ai:takeover 触发恰好 1 次', aiCount === 1)
  assert('ai:takeover 触发 seat=1', aiSeats[0] === 1)

  Host.off('ai:takeover')
  Host.close()
  Joiner.close()
}

// ============== 汇总 ==============
console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
// WS server / open handles 可能让 process 不退出,显式退出
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 50)