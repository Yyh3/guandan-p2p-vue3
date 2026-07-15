/**
 * Phase 2 网络层修复行为回归测试
 *
 * 覆盖 Plan C 中网络层 12 项关键修复,以行为断言为主,避免纯源码正则。
 */

import { BroadcastChannelTransport } from './network-transport-bc.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '期望=', e, '实际=', a) }
}

// 构造一个 WS-like fake transport,用于 network.js 行为测试
function makeFakeWsTransport() {
  const sent = []
  const t = {
    type: 'ws',
    _mode: 'self',
    _channel: null,
    _ready: true,
    _outbox: [],
    _listeners: [],
    sent,
    onMessage(cb) { this._listeners.push(cb) },
    offMessage() {},
    open() { return Promise.resolve() },
    send(msg) { sent.push(msg); return true },
    close() {},
    isReady() { return true },
    getHostIp() { return '192.168.1.2' },
    getBoundPort() { return 8848 },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
  }
  return t
}

console.log('\n=== 1. transport.type 稳定字段(防 minification) ===')
{
  assert('BroadcastChannelTransport.type === "bc"', new BroadcastChannelTransport().type === 'bc')
  // WebSocketTransport / AndroidWsTransport 在 Node 可直接实例化
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=p2-' + Date.now())
  const { AndroidWsTransport } = await import('./network-transport-android-ws.js?tag=p2-type-' + Date.now())
  assert('WebSocketTransport.type === "ws"', new WebSocketTransport().type === 'ws')
  assert('AndroidWsTransport.type === "android-ws"', new AndroidWsTransport().type === 'android-ws')
}

console.log('\n=== 2. WebSocketTransport host 模式 getHostIp() 非空 ===')
{
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=p2-hostip-' + Date.now())
  const t = new WebSocketTransport({ port: 0, host: '0.0.0.0' })
  try {
    await t.open('self')
    const ip = t.getHostIp()
    assert('server bind 后 getHostIp() 返回字符串', typeof ip === 'string' && ip.length > 0)
    assert('getHostIp() 不是 0.0.0.0', ip !== '0.0.0.0')
  } finally {
    try { await t.close() } catch (e) {}
  }
}

console.log('\n=== 3. IPv6 hostAddress 解析与 URL 括号 ===')
{
  const tag = 'p2-ipv6-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  let transport = null
  net._setTransportFactory(() => {
    const { WebSocketTransport } = require ? {} : {}
    // 动态 import 同一个 tag 的 transport 模块
    return transport
  })
  // 直接构造 WebSocketTransport 并通过 joinRemoteRoom 复用 factory
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag)
  transport = new WebSocketTransport()
  net._setTransportFactory(() => transport)
  const r = net.joinRemoteRoom('[::1]:8848', { nickname: 'J', avatar: 'J' })
  assert('joinRemoteRoom IPv6 返回 ok', r.ok === true)
  // 等待微任务让 transport.open 设置 _url
  await new Promise(r => setTimeout(r, 50))
  eq('transport._url 使用括号 IPv6', transport._url, 'ws://[::1]:8848/')
  net.close()
}

console.log('\n=== 4. startAsHost 在 transport open 后刷新 canHost/hostAddress ===')
{
  const tag = 'p2-hostinfo-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  const fake = makeFakeWsTransport()
  net._setTransportFactory(() => fake)
  net.startAsHost({ nickname: 'H', avatar: 'H' })
  assert('初始 canHost 为 false', net.getSelfInfo().canHost === false)
  assert('初始 hostAddress 为 null', net.getSelfInfo().hostAddress === null)
  await new Promise(r => setTimeout(r, 50))
  assert('open 后 canHost 为 true', net.getSelfInfo().canHost === true)
  eq('open 后 hostAddress 正确', net.getSelfInfo().hostAddress, '192.168.1.2:8848')
  net.close()
}

console.log('\n=== 5. relayFromClient 保留定向 msg.to ===')
{
  const tag = 'p2-relay-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  const fake = makeFakeWsTransport()
  net._setTransportFactory(() => fake)
  net.startAsHost({ nickname: 'H', avatar: 'H' })
  await new Promise(r => setTimeout(r, 50))
  net.getPeers().set(1, { nickname: 'J1', uuid: 'u1' })
  net.getPeers().set(2, { nickname: 'J2', uuid: 'u2' })
  net.getPeers().set(3, { nickname: 'J3', uuid: 'u3' })
  fake._emit({ type: 'CHAT', from: 1, to: 2, payload: { text: 'hi' } })
  await new Promise(r => setTimeout(r, 10))
  eq('只 relay 给 seat 2', fake.sent.length, 1)
  eq('relay 消息 to 仍为 2', fake.sent[0]?.to, 2)
  net.close()
}

console.log('\n=== 6. SEAT_SWAP_REQUEST → host 提交 SEAT_SWAP_COMMITTED ===')
{
  const tag = 'p2-swap-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  const fake = makeFakeWsTransport()
  net._setTransportFactory(() => fake)
  net.startAsHost({ nickname: 'H', avatar: 'H' })
  await new Promise(r => setTimeout(r, 50))
  net.getPeers().set(1, { nickname: 'J1', uuid: 'u1' })
  net.getPeers().set(2, { nickname: 'J2', uuid: 'u2' })
  net.getPeers().set(3, { nickname: 'J3', uuid: 'u3' })
  fake.sent.length = 0
  // joiner 只能发 REQUEST,且只能和队友换座;1 与 2 不是队友,应被拒绝
  fake._emit({ type: 'SEAT_SWAP_REQUEST', from: 1, payload: { a: 1, b: 2 } })
  await new Promise(r => setTimeout(r, 10))
  assert('非队友换座请求被忽略(本地 seat 1/2 不变)', net.getPeers().get(1)?.nickname === 'J1')
  // 1 与 3 是队友,host 应提交并广播 COMMITTED
  fake._emit({ type: 'SEAT_SWAP_REQUEST', from: 1, payload: { a: 1, b: 3 } })
  await new Promise(r => setTimeout(r, 10))
  const committed = fake.sent.filter(m => m.type === 'SEAT_SWAP_COMMITTED')
  assert('host 广播 SEAT_SWAP_COMMITTED', committed.length >= 1)
  assert('host 本地已交换 seat 1/3', net.getPeers().get(1)?.nickname === 'J3')
  // REQUEST 不在 relay 白名单,不应被转发
  const relayedRequest = fake.sent.filter(m => m.type === 'SEAT_SWAP_REQUEST')
  assert('SEAT_SWAP_REQUEST 不被 relay', relayedRequest.length === 0)
  net.close()
}

console.log('\n=== 7. selectNextHostCandidate 排除 finished/abandoned seats ===')
{
  const tag = 'p2-cand-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  const fake = makeFakeWsTransport()
  net._setTransportFactory(() => fake)
  net.startAsHost({ nickname: 'H', avatar: 'H' })
  await new Promise(r => setTimeout(r, 50))
  net.getPeers().set(1, { nickname: 'J1', uuid: 'b-uuid' })
  net.getPeers().set(2, { nickname: 'J2', uuid: 'a-uuid' })
  net.getPeers().set(3, { nickname: 'J3', uuid: 'c-uuid' })
  // 排除 seat 2 后,候选只剩 1/3;UUID 字典序 b < c,应选 1
  const c1 = net.selectNextHostCandidate([2])
  eq('排除 seat 2 后选 seat 1', c1, 1)
  // 排除 1/2 后只剩 3
  const c2 = net.selectNextHostCandidate([1, 2])
  eq('排除 seat 1/2 后选 seat 3', c2, 3)
  // 全排除
  const c3 = net.selectNextHostCandidate([1, 2, 3])
  eq('全排除后返回 null', c3, null)
  net.close()
}

console.log('\n=== 8. canHostAsNewHost 不依赖 constructor.name ===')
{
  const tag = 'p2-name-' + Date.now()
  const net = await import('./network.js?tag=' + tag)
  net.close()
  // 构造一个 type='bc' 但 class name 被改掉的 transport
  class RenamedBC {
    constructor() { this.type = 'bc'; this._mode = 'self'; this._channel = {}; this._listeners = [] }
    onMessage(cb) { this._listeners.push(cb) }
    offMessage() {}
    open() { return Promise.resolve() }
    send() { return true }
    close() {}
    isReady() { return true }
  }
  Object.defineProperty(RenamedBC, 'name', { value: 'X' })
  net._setTransportFactory(() => new RenamedBC())
  net.startAsHost({ nickname: 'H', avatar: 'H' })
  await new Promise(r => setTimeout(r, 50))
  assert('class name 被改名后 canHostAsNewHost 仍为 true', net.canHostAsNewHost() === true)
  net.close()
}

console.log('\n=== 9. AndroidWsTransport outbox 保留 msg.to ===')
{
  const { AndroidWsTransport: AT } = await import('./network-transport-android-ws.js?tag=p2-android-' + Date.now())
  const t = new AT()
  t._mode = 'self'
  t._ready = false
  t.send({ type: 'X', payload: {}, to: 2 })
  eq('outbox 项保留 msg.to', t._outbox.length, 1)
  eq('outbox[0].msg.to === 2', t._outbox[0]?.msg?.to, 2)
  const calls = []
  t._sendHost = async (data, msg) => { calls.push({ data, msg }) }
  t._ready = true
  t._flushOutbox()
  const toCalls = calls.filter(c => c.msg?.to === 2)
  const bcCalls = calls.filter(c => c.msg?.to == null)
  eq('flush 时调用定向 sendHost(to=2)', toCalls.length, 1)
  eq('flush 时没有误 broadcast', bcCalls.length, 0)
}

console.log('\n=== 10. WS reconnect 计数器在手动 open 成功后清零 ===')
{
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=p2-reconn-' + Date.now())
  // 起一个真实 server,让 client 能连上
  const host = new WebSocketTransport({ port: 0, host: '127.0.0.1' })
  try {
    await host.open('self')
    const port = host.getBoundPort()
    const client = new WebSocketTransport()
    client._reconnectAttempts = 2
    client._reconnecting = true
    await client.open('client', '127.0.0.1', port)
    assert('client open 后 _reconnectAttempts 清零', client._reconnectAttempts === 0)
    assert('client open 后 _reconnecting 为 false', client._reconnecting === false)
    await client.close()
  } finally {
    await host.close()
  }
}

console.log(`\n========== Phase 2 网络层测试结果: ${pass} 通过 / ${fail} 失败 ==========\n`)
if (fail > 0) process.exit(1)
