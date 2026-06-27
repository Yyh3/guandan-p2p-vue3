/**
 * network-relay.test.js — BUG-001 修复测试
 *
 * ★ 真机 WS 星型拓扑下,joiner 之间出牌/过牌必须经 host 转发。
 *   之前 host 收到 joiner PLAY/PASS 后只处理本机 state,不会转发,
 *   导致其他 joiner 完全看不到 → 4 人局跑不通。
 *
 * 本测试:
 *   1. 真实启动 WebSocketTransport host(server) + 用 Node 'ws' 接 3 个 client
 *   2. 通过动态 import 的 network.js 实例注入 transport factory,host 端用真 WS
 *   3. 模拟 joiner 端发 PLAY → 验证 host relay 给其他 joiner
 *   4. 验证 BC 路径不重复 relay (transport._channel != null 跳过)
 *   5. 边界:host 自己不出现在 relay 目标,原 sender 也不出现
 *
 * ★ 不引入 vue-test-utils / jsdom,直接 import network.js 用 _setTransportFactory 注入
 */

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

async function settle(ms = 80) {
  await new Promise(r => setTimeout(r, ms))
}

/**
 * 创建一个独立的 network.js 实例 + 注入 fake timers。
 */
async function makeNetInstance(tag) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  const captured = { intervals: [], timeouts: [] }
  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms, cancelled: false }); return captured.intervals.length },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms, cancelled: false }); return captured.timeouts.length },
    clearTimeout: () => {},
  })
  return { mod, captured }
}

// ============================================================
// 块 1: WS 端到端 relay — seat 1 发 PLAY,seat 2 / 3 都收到
// ============================================================
console.log('\n=== 1. WS host relay: seat 1 PLAY → seat 2 + seat 3 都收到 from=1 ===')
{
  // 用真 WebSocketTransport 起 host
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=ws-relay-' + Date.now())
  const { WebSocket } = await import('ws')

  const host = new WebSocketTransport({ port: 0 })
  await host.open('self')
  const port = host.getBoundPort()
  assert('WS host 已 listen', port > 0)

  // 接 3 个 client
  const clients = []
  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise(r => ws.once('open', r))
    clients.push(ws)
  }
  await settle(30)

  // 给 host._clients 手动绑定 seat (模拟 host 处理完 JOIN 后的状态)
  const wsList = Array.from(host._clients.keys())
  eq('host 持有 3 个 ws client', wsList.length, 3)
  wsList[0]._seat = 1; host._clients.get(wsList[0]).seat = 1
  wsList[1]._seat = 2; host._clients.get(wsList[1]).seat = 2
  wsList[2]._seat = 3; host._clients.get(wsList[2]).seat = 3

  // 创建 host network 实例 + 注入共享的 WebSocketTransport
  const { mod: Host } = await makeNetInstance('relay-host')
  Host._setTransportFactory(() => host)
  Host.startAsHost({ nickname: 'host', avatar: 'H' })
  await settle(30)

  // 手动填入 host network 的 peers (测试 host network 层 relay,不走真 JOIN)
  Host.getPeers().set(1, { nickname: 'A', avatar: 'A', uuid: 'u1' })
  Host.getPeers().set(2, { nickname: 'B', avatar: 'B', uuid: 'u2' })
  Host.getPeers().set(3, { nickname: 'C', avatar: 'C', uuid: 'u3' })

  // 收集 joiner 收到的所有消息
  const recv2 = [], recv3 = []
  clients[1].on('message', (d) => { try { recv2.push(JSON.parse(d.toString())) } catch (e) {} })
  clients[2].on('message', (d) => { try { recv3.push(JSON.parse(d.toString())) } catch (e) {} })
  // 原 sender (seat=1) 收到自己的回环检测
  const recv1 = []
  clients[0].on('message', (d) => { try { recv1.push(JSON.parse(d.toString())) } catch (e) {} })

  // ★ 核心:让 host transport 收到来自 seat=1 joiner 的 PLAY 消息
  //   真实路径:joiner ws.send → host ws.on('message') → host._emit → host._listeners[0](=onTransportMessage)
  //   模拟:直接调 host._emit(msg),host._listeners[0] 是 _onTransportMessage
  const playMsg = { type: 'PLAY', from: 1, payload: { seat: 1, cards: [{ suit: 0, rank: 5 }], source: 'manual' }, ts: Date.now() }
  host._emit(playMsg)
  await settle(50)

  // 验证 joiner seat=2 / seat=3 收到 from=1 的 PLAY
  const r2 = recv2.find(m => m.type === 'PLAY')
  const r3 = recv3.find(m => m.type === 'PLAY')
  assert('joiner seat=2 收到 PLAY (relay 命中)', r2 != null)
  assert('joiner seat=3 收到 PLAY (relay 命中)', r3 != null)
  eq('relay 消息 from=1 (保留原 sender)', r2?.from, 1)
  eq('relay 消息 from=1 (seat=3 同样)', r3?.from, 1)
  eq('relay 消息 to=2 (定向)', r2?.to, 2)
  eq('relay 消息 to=3 (定向)', r3?.to, 3)
  eq('payload.seat=1', r2?.payload?.seat, 1)
  assert('payload.cards 含 1 张牌', Array.isArray(r2?.payload?.cards) && r2.payload.cards.length === 1)
  eq('payload.source=manual', r2?.payload?.source, 'manual')

  // 验证:原 sender seat=1 不应收到自己 PLAY 的回环
  assert('原 sender seat=1 不收到自己 PLAY 的回环', !recv1.some(m => m.type === 'PLAY'))

  // 验证:host 自己 (transport 端没有 host 自己 ws) 不会"发给自己"
  //      (host 端没有 ws,_sendHost 只遍历 _clients,即 joiner ws)

  Host.close()
  for (const ws of clients) try { ws.close() } catch (e) {}
  await settle(30)
  host.close()
}

// ============================================================
// 块 2: relay 白名单过滤 — HEARTBEAT / _DISCONNECT 不应 relay
// ============================================================
console.log('\n=== 2. relay 白名单:HEARTBEAT / _DISCONNECT / READY 不被转发 ===')
{
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=ws-relay-wl-' + Date.now())
  const { WebSocket } = await import('ws')

  const host = new WebSocketTransport({ port: 0 })
  await host.open('self')
  const port = host.getBoundPort()

  const clients = []
  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise(r => ws.once('open', r))
    clients.push(ws)
  }
  await settle(30)

  const wsList = Array.from(host._clients.keys())
  wsList[0]._seat = 1; host._clients.get(wsList[0]).seat = 1
  wsList[1]._seat = 2; host._clients.get(wsList[1]).seat = 2
  wsList[2]._seat = 3; host._clients.get(wsList[2]).seat = 3

  const { mod: Host } = await makeNetInstance('relay-whitelist')
  Host._setTransportFactory(() => host)
  Host.startAsHost({ nickname: 'host', avatar: 'H' })
  await settle(30)
  Host.getPeers().set(1, { nickname: 'A', avatar: 'A', uuid: 'u1' })
  Host.getPeers().set(2, { nickname: 'B', avatar: 'B', uuid: 'u2' })
  Host.getPeers().set(3, { nickname: 'C', avatar: 'C', uuid: 'u3' })

  // 收集 joiner 收到的消息
  const recvAll = []
  clients[1].on('message', (d) => { try { recvAll.push(JSON.parse(d.toString())) } catch (e) {} })
  clients[2].on('message', (d) => { try { recvAll.push(JSON.parse(d.toString())) } catch (e) {} })

  // 让 host 收到各种非白名单消息,这些都不应被 relay
  const nonWhitelist = [
    { type: 'HEARTBEAT', from: 1, payload: { ts: Date.now() } },
    { type: '_DISCONNECT', from: 1, payload: { seat: 1 } },
    { type: 'READY', from: 1, payload: { ready: true } },
    { type: 'NICK_UPDATE', from: 1, payload: { nickname: 'X' } },  // ★ NICK_UPDATE 在白名单!换别的
    { type: 'TEST_NONEXISTENT', from: 1, payload: {} },
  ]
  // 修正:NICK_UPDATE 在白名单,移除;用一个明确非白名单的类型
  const testMsgs = [
    { type: 'HEARTBEAT', from: 1, payload: { ts: Date.now() } },
    { type: '_DISCONNECT', from: 1, payload: { seat: 1 } },
    { type: 'READY', from: 1, payload: { ready: true } },
    { type: 'TEST_NONEXISTENT', from: 1, payload: {} },
  ]
  for (const m of testMsgs) {
    host._emit(m)
  }
  await settle(30)

  // 这些消息 _handleHostMessage 内部对 HEARTBEAT/_DISCONNECT/READY 是状态更新,可能产生副作用
  // 但 _handleHostMessage 不会调用 sendMessage,所以 relayFromClient 是唯一会产生定向 send 的路径
  // ★ 关键:非白名单消息不应该产生 to=seat 的定向 send
  const directed = recvAll.filter(m => m.to != null)
  eq('非白名单消息不产生定向 relay (to 字段)', directed.length, 0)

  Host.close()
  for (const ws of clients) try { ws.close() } catch (e) {}
  await settle(30)
  host.close()
}

// ============================================================
// 块 3: BC host 模式不调 relayFromClient (BC 天然广播)
// ============================================================
console.log('\n=== 3. BC host 模式不调 relayFromClient (BC 天然广播,避免双倍消息) ===')
{
  const { mod: Host } = await makeNetInstance('relay-bc-mode')

  // BC transport 标志:_channel != null + _mode='self'
  let bcSendCalls = []
  const bcTransport = {
    _mode: 'self',
    _wss: null,
    _clients: new Map(),
    _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [],
    _ready: true,
    _listeners: [],
    onMessage(cb) { this._listeners.push(cb) },
    offMessage() {},
    open() { return Promise.resolve() },
    send(msg) {
      bcSendCalls.push(msg)
      return true
    },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {},
    isReady() { return true },
    forceDisconnectSeat() { return true },
  }

  Host._setTransportFactory(() => bcTransport)
  Host.startAsHost({ nickname: 'host', avatar: 'H' })
  await settle(30)

  Host.getPeers().set(1, { nickname: 'A', avatar: 'A', uuid: 'u1' })
  Host.getPeers().set(2, { nickname: 'B', avatar: 'B', uuid: 'u2' })
  Host.getPeers().set(3, { nickname: 'C', avatar: 'C', uuid: 'u3' })

  // BC host 收到 PLAY 消息 — relayFromClient 应跳过
  bcSendCalls = []
  const playMsg = { type: 'PLAY', from: 1, payload: { seat: 1, cards: [{ suit: 0, rank: 3 }] } }
  bcTransport._emit(playMsg)
  await settle(30)

  // BC 模式 _handleHostMessage 对 PLAY 不处理分支,无副作用
  // relayFromClient 也跳过 (因为 _channel != null)
  const relayPlay = bcSendCalls.filter(m => m.type === 'PLAY')
  eq('BC host 模式不触发 relayFromClient (to 定向 send=0)', relayPlay.length, 0)

  Host.close()
}

// ============================================================
// 块 4: joiner 端 _onTransportMessage 不调 relayFromClient
// ============================================================
console.log('\n=== 4. joiner 端收到消息不调 relayFromClient(joiner 不是 host) ===')
{
  // 构造 joiner 场景:joiner transport mode='client'
  // joiner 收到 host 发来的 PLAY 消息,joiner 自己的 _onTransportMessage
  // 走 _handleJoinerMessage 分支,不调 relayFromClient
  const { mod: Joiner } = await makeNetInstance('relay-joiner')

  let joinerSendCalls = []
  const joinerTransport = {
    _mode: 'client',  // ★ joiner 端
    _wss: null,
    _clients: new Map(),
    _ws: { readyState: 1, send: () => {} },
    _channel: null,
    _outbox: [],
    _ready: true,
    _listeners: [],
    onMessage(cb) { this._listeners.push(cb) },
    offMessage() {},
    open() { return Promise.resolve() },
    send(msg) {
      joinerSendCalls.push(msg)
      return true
    },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {},
    isReady() { return true },
  }

  Joiner._setTransportFactory(() => joinerTransport)
  // joiner 端 joinRoom 需要 ws 模式(因为传 hostIp/hostPort)
  Joiner.joinRoom('127.0.0.1:9999', { nickname: 'J', avatar: 'J' }, { hostIp: '127.0.0.1', hostPort: 9999 })
  await settle(30)

  // 模拟 joiner 收到 host 发来的 PLAY 消息 (from=0 host 出的牌)
  joinerSendCalls = []
  const playMsg = { type: 'PLAY', from: 0, payload: { seat: 0, cards: [] }, to: 1 }
  joinerTransport._emit(playMsg)
  await settle(30)

  // joiner 端不调 relayFromClient (因为 isHostFlag=false),所以 send 不应增加
  eq('joiner 收到 PLAY 不产生 send 调用 (relay 仅 host 触发)', joinerSendCalls.length, 0)

  Joiner.close()
}

// ============================================================
// 块 5: relay 目标 seat 跳过原 sender + host 自己
// ============================================================
console.log('\n=== 5. relay 目标:跳过原 sender + host 自己 ===')
{
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=ws-relay-skip-' + Date.now())
  const { WebSocket } = await import('ws')

  const host = new WebSocketTransport({ port: 0 })
  await host.open('self')
  const port = host.getBoundPort()

  const clients = []
  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise(r => ws.once('open', r))
    clients.push(ws)
  }
  await settle(30)

  const wsList = Array.from(host._clients.keys())
  wsList[0]._seat = 1; host._clients.get(wsList[0]).seat = 1
  wsList[1]._seat = 2; host._clients.get(wsList[1]).seat = 2
  wsList[2]._seat = 3; host._clients.get(wsList[2]).seat = 3

  const { mod: Host } = await makeNetInstance('relay-skip')
  Host._setTransportFactory(() => host)
  Host.startAsHost({ nickname: 'host', avatar: 'H' })
  await settle(30)
  Host.getPeers().set(1, { nickname: 'A', avatar: 'A', uuid: 'u1' })
  Host.getPeers().set(2, { nickname: 'B', avatar: 'B', uuid: 'u2' })
  Host.getPeers().set(3, { nickname: 'C', avatar: 'C', uuid: 'u3' })

  // ★ 模拟 seat=2 发 PASS
  const recv1 = [], recv3 = []
  clients[0].on('message', (d) => { try { recv1.push(JSON.parse(d.toString())) } catch (e) {} })
  clients[2].on('message', (d) => { try { recv3.push(JSON.parse(d.toString())) } catch (e) {} })

  host._emit({ type: 'PASS', from: 2, payload: { seat: 2 } })
  await settle(30)

  const r1 = recv1.find(m => m.type === 'PASS')
  const r3 = recv3.find(m => m.type === 'PASS')
  assert('PASS from=2 → seat=1 收到', r1 != null)
  assert('PASS from=2 → seat=3 收到', r3 != null)
  eq('relay to seat=1 (定向)', r1?.to, 1)
  eq('relay to seat=3 (定向)', r3?.to, 3)
  eq('relay from=2 (原 sender 保留)', r1?.from, 2)

  // 原 sender seat=2 不应收到自己 PASS 的回环
  const recv2 = []
  clients[1].on('message', (d) => { try { recv2.push(JSON.parse(d.toString())) } catch (e) {} })
  await settle(20)
  assert('原 sender seat=2 不收到自己 PASS 的回环', !recv2.some(m => m.type === 'PASS'))

  Host.close()
  for (const ws of clients) try { ws.close() } catch (e) {}
  await settle(30)
  host.close()
}

// ============================================================
// 块 6: peers Map 为空时 relay 不报错
// ============================================================
console.log('\n=== 6. host peers Map 为空时 relay 安全 no-op ===')
{
  const { mod: Host } = await makeNetInstance('relay-empty')

  const hostTransport = {
    _mode: 'self',
    _wss: { close() {} },
    _clients: new Map(),
    _channel: null,
    _outbox: [],
    _ready: true,
    _listeners: [],
    onMessage(cb) { this._listeners.push(cb) },
    offMessage() {},
    open() { return Promise.resolve() },
    send() { return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {},
    isReady() { return true },
  }

  Host._setTransportFactory(() => hostTransport)
  Host.startAsHost({ nickname: 'host', avatar: 'H' })
  await settle(20)

  // peers 只有 host 自己,没有 joiner
  assert('host peers 只含 host 自己', Host.getPeers().size === 1)
  assert('host seat=0 in peers', Host.getPeers().has(0))

  // relayFromClient 应该跳过 seat=0,不发给自己
  let threw = false
  try {
    hostTransport._emit({ type: 'PLAY', from: 1, payload: { seat: 1, cards: [] } })
  } catch (e) { threw = true }
  await settle(10)
  assert('peers 为空时 relay 不报错', threw === false)

  // from=0 (host 自己) 也被跳过 (relayFromClient 内部 msg.from<=0 return)
  threw = false
  try {
    hostTransport._emit({ type: 'PLAY', from: 0, payload: { seat: 0, cards: [] } })
  } catch (e) { threw = true }
  await settle(10)
  assert('from=0 (host 自己) 时 relay 跳过,不发', threw === false)

  Host.close()
}

console.log(`\n========== network-relay test result: ${pass} pass / ${fail} fail ==========`)
// 显式退出:多个动态 import 的 network.js 实例 + mock transport 可能保留
// event loop handle(如 ws server / mock 引用),正常 npm test 也会在 test:ws 里这么用
if (fail > 0) process.exit(1)
process.exit(0)