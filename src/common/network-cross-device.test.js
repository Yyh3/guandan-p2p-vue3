/**
 * network.js v2.2 task B — 跨设备 joinRemoteRoom 测试
 *
 * 覆盖:
 *   1. parseHostAddress 解析 'IP' / 'IP:port' / IPv6 '[::1]:port' / 非法格式
 *   2. joinRemoteRoom("IP:port", self) → 内部用 WebSocketTransport client
 *   3. joinRemoteRoom("IP", self) → 端口默认 8848
 *   4. joinRemoteRoom 错误处理(空 / 多余 ':' / 端口 0 / 端口 99999 / 非数字端口)
 *   5. joinRemoteRoom 端到端:host + 1 个 BC joiner + 1 个 WS joiner(模拟 4 人开局)
 *   6. WS joiner 收到 host broadcast 后事件正常触发('message:*' / 'connect')
 *
 * 跟 v2.1 P0 task (kick-player test) 的 pattern 对称 — 真起 WebSocketTransport host,
 * 不 mock transport (浏览器 native WebSocket 在 Node 20 全局可用 + 'ws' 模块兼容)。
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

async function settle(ms = 80) {
  await new Promise(r => setTimeout(r, ms))
}

/**
 * 创建一个独立的 network.js 实例(动态 import 隔离模块状态)。
 * 注入 fake timers 避免真启动 setInterval(heartbeat)。
 */
async function makeNetInstance(tag) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  const captured = { intervals: [], timeouts: [], cleared: [] }
  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms, cancelled: false }); return captured.intervals.length },
    clearInterval: (id) => {
      captured.cleared.push({ type: 'interval', id })
      if (id >= 1 && id <= captured.intervals.length) captured.intervals[id - 1].cancelled = true
    },
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms, cancelled: false }); return captured.timeouts.length },
    clearTimeout: (id) => {
      captured.cleared.push({ type: 'timeout', id })
      if (id >= 1 && id <= captured.timeouts.length) captured.timeouts[id - 1].cancelled = true
    },
  })
  return { mod, captured }
}

// ============== Test blocks ==============

console.log('\n=== 1. parseHostAddress 解析 IP / IP:port / IPv6 ===')
{
  const { mod: Net } = await makeNetInstance('pa1')

  // 基本:IP:port
  eq('parseHostAddress("192.168.1.5:8848")', Net.parseHostAddress('192.168.1.5:8848'),
    { hostIp: '192.168.1.5', hostPort: 8848 })

  // 无端口默认 8848
  eq('parseHostAddress("192.168.1.5") 默认 8848', Net.parseHostAddress('192.168.1.5'),
    { hostIp: '192.168.1.5', hostPort: 8848 })

  // 自定义端口
  eq('parseHostAddress("10.0.0.1:9999")', Net.parseHostAddress('10.0.0.1:9999'),
    { hostIp: '10.0.0.1', hostPort: 9999 })

  // IPv6 brackets
  eq('parseHostAddress("[::1]:8848")', Net.parseHostAddress('[::1]:8848'),
    { hostIp: '::1', hostPort: 8848 })

  // 127.0.0.1
  eq('parseHostAddress("127.0.0.1:8848")', Net.parseHostAddress('127.0.0.1:8848'),
    { hostIp: '127.0.0.1', hostPort: 8848 })

  // 空格 trim
  eq('parseHostAddress("  192.168.1.5:8848  ") trim', Net.parseHostAddress('  192.168.1.5:8848  '),
    { hostIp: '192.168.1.5', hostPort: 8848 })
}

console.log('\n=== 2. parseHostAddress 非法格式抛错 ===')
{
  const { mod: Net } = await makeNetInstance('pa2')

  // 空字符串
  let err = null
  try { Net.parseHostAddress('') } catch (e) { err = e }
  assert('parseHostAddress("") 抛错', err !== null)
  assert('错误信息提到"空"', err?.message?.includes('空') || err?.message?.includes('hostAddress'))

  // null
  err = null
  try { Net.parseHostAddress(null) } catch (e) { err = e }
  assert('parseHostAddress(null) 抛错', err !== null)

  // undefined
  err = null
  try { Net.parseHostAddress(undefined) } catch (e) { err = e }
  assert('parseHostAddress(undefined) 抛错', err !== null)

  // 端口 = 0
  err = null
  try { Net.parseHostAddress('1.2.3.4:0') } catch (e) { err = e }
  assert('parseHostAddress("1.2.3.4:0") 抛错(端口 > 0)', err !== null)

  // 端口 = 99999
  err = null
  try { Net.parseHostAddress('1.2.3.4:99999') } catch (e) { err = e }
  assert('parseHostAddress("1.2.3.4:99999") 抛错(端口 < 65536)', err !== null)

  // 端口 = "abc" (非数字)
  err = null
  try { Net.parseHostAddress('1.2.3.4:abc') } catch (e) { err = e }
  assert('parseHostAddress("1.2.3.4:abc") 抛错', err !== null)

  // 末尾 ':' (端口空)
  err = null
  try { Net.parseHostAddress('1.2.3.4:') } catch (e) { err = e }
  assert('parseHostAddress("1.2.3.4:") 抛错', err !== null)

  // 只有 ':'
  err = null
  try { Net.parseHostAddress(':') } catch (e) { err = e }
  assert('parseHostAddress(":") 抛错', err !== null)
}

console.log('\n=== 3. joinRemoteRoom 错误处理(不创建 transport) ===')
{
  const { mod: Net } = await makeNetInstance('jr1')
  const r1 = Net.joinRemoteRoom('', { nickname: 'X', avatar: 'X' })
  assert('joinRemoteRoom("") 返回 ok=false', r1.ok === false)
  assert('joinRemoteRoom("") 错误信息提到 hostAddress', /hostAddress/i.test(r1.error || ''))

  const r2 = Net.joinRemoteRoom(null, { nickname: 'X', avatar: 'X' })
  assert('joinRemoteRoom(null) 返回 ok=false', r2.ok === false)

  const r3 = Net.joinRemoteRoom('1.2.3.4:abc', { nickname: 'X', avatar: 'X' })
  assert('joinRemoteRoom("1.2.3.4:abc") 返回 ok=false', r3.ok === false)

  // 错误调用不应创建 transport
  assert('错误调用后 transport 为 null', Net._getTransport() === null)
  assert('错误调用后 isConnected() = false', Net.isConnected() === false)
}

console.log('\n=== 4. joinRemoteRoom 注入 WebSocketTransport(client) + 调用 joinRoom WS 路径 ===')
{
  const { mod: Net } = await makeNetInstance('jr2')
  // 在 joinRemoteRoom 之前注入 factory spy
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=jr2t' + Date.now())
  let factoryCallCount = 0
  let factoryCallsWithOpts = []
  Net._setTransportFactory((opts) => {
    factoryCallCount++
    factoryCallsWithOpts.push(opts)
    return new WebSocketTransport(opts || {})
  })

  // 调 joinRemoteRoom — 内部 factory 应被调,返回 ok:true
  const r = Net.joinRemoteRoom('127.0.0.1:8848', { nickname: 'J', avatar: 'A' })
  assert('joinRemoteRoom("127.0.0.1:8848") 返回 ok=true', r.ok === true)
  // factory 可能被调 1 次(joinRoom 内部 _createTransport)或 2 次(joinRemoteRoom 注入时预创建 + joinRoom 内部再创建)
  // 当前实现:joinRemoteRoom 只注入 factory,然后调用 joinRoom,_createTransport() 时调一次 → 应是 1 次
  assert('factory 被调 1 次', factoryCallCount === 1)
  // transport 已创建,transport 内部是 WebSocketTransport
  const t = Net._getTransport()
  assert('transport 是 WebSocketTransport', t?.constructor?.name === 'WebSocketTransport')
  // open 异步,这里 joinRemoteRoom 同步返回 ok:true 不等于 connect,但 transport 已 instantiate
  Net.close()
}

console.log('\n=== 5. 端到端:host + WS joiner 真实双向通信 ===')
{
  const { mod: Host } = await makeNetInstance('e2e-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=eh' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('test-e2e')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })

  // 等 host bind
  let hostPort = null
  for (let i = 0; i < 60; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(20)
  }
  assert('host ws server 已 bind', hostPort !== null)
  if (!hostPort) { throw new Error('host bind failed') }

  // create WS joiner — 模拟浏览器 joiner 调 joinRemoteRoom(127.0.0.1:port)
  const { mod: Joiner } = await makeNetInstance('e2e-wsj')
  const r = Joiner.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: 'WSJ', avatar: 'J' })
  assert('joiner joinRemoteRoom ok', r.ok === true)

  // 等 joiner 连上 + 收到 SYNC
  let joinerConnectEvent = null
  Joiner.on('connect', (data) => { joinerConnectEvent = data })

  let seat = -1
  for (let i = 0; i < 80; i++) {
    seat = Joiner.getSelfSeat()
    if (seat >= 1 && seat <= 3) break
    await settle(25)
  }
  assert('joiner 分配到 seat (>=1)', seat >= 1)
  assert('joiner connect event 触发', joinerConnectEvent !== null)
  eq('joiner connect event.seat === seat', joinerConnectEvent?.seat, seat)

  // 等 host peers 看到 joiner
  let hostSawJoiner = false
  for (let i = 0; i < 40; i++) {
    if (Host.getPeers().size >= 2) { hostSawJoiner = true; break }
    await settle(25)
  }
  assert('host peers >= 2(自己 + joiner)', hostSawJoiner)
  assert(`host peers 包含 seat ${seat}`, Host.getPeers().has(seat))

  // 测试跨 transport 广播:joiner 调 broadcast → host 收到 message:*
  let hostReceivedHello = false
  Host.on('message:TEST_HELLO', () => { hostReceivedHello = true })
  Joiner.broadcast({ type: 'TEST_HELLO', payload: { from: 'WSJ' } })
  await settle(100)
  assert('host 收到 joiner broadcast 的 TEST_HELLO', hostReceivedHello)

  // 反向:host broadcast → joiner 收到
  let joinerReceivedPing = false
  Joiner.on('message:TEST_PING', () => { joinerReceivedPing = true })
  Host.broadcast({ type: 'TEST_PING', payload: { from: 'H' } })
  await settle(100)
  assert('joiner 收到 host broadcast 的 TEST_PING', joinerReceivedPing)

  // 清理
  Host.close()
  Joiner.close()
}

console.log('\n=== 6. 端到端:host + 3 WS joiner(模拟 1 真机 host + 1 真机 + 2 浏览器 joiner) ===')
{
  // 任务 v2.2 task B 用户实际场景:
  //   1 真机 host + 1 真机 joiner + 2 浏览器 joiner
  //   真机用 AndroidWsTransport;浏览器用 WebSocketTransport(走 native WebSocket)
  //   跨设备路径:2 浏览器 joiner 都连 host 的 ws://IP:8848 (即使在同一电脑,走 WS 路径是同 design)
  // 这里用 Node 测试环境的 'ws' 模块模拟跨设备 — 端到端验证 4 个 client 都能连同一 host
  const { mod: Host } = await makeNetInstance('mix-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=mh' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('mix-room')
  Host.startAsHost({ nickname: 'RealHost', avatar: 'R' })

  let hostPort = null
  for (let i = 0; i < 60; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(20)
  }
  assert('真机 host bind', hostPort !== null)
  if (!hostPort) throw new Error('host bind failed')

  // 3 个 WS joiner (1 真机 + 2 浏览器),全部走 joinRemoteRoom
  const joinerCount = 3
  const joiners = []
  for (let i = 0; i < joinerCount; i++) {
    const { mod: J } = await makeNetInstance(`mix-j${i}`)
    J.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: `J${i}`, avatar: `${i}` })
    joiners.push({ mod: J, tag: `J${i}` })
  }

  // 等所有 joiner 连上 + host peers 看到 4 人
  let hostPeerCount = 0
  for (let i = 0; i < 100; i++) {
    hostPeerCount = Host.getPeers().size
    if (hostPeerCount >= 1 + joinerCount) break
    await settle(40)
  }
  assert(`host 看到 ${1 + joinerCount} 个 peer`, hostPeerCount >= 1 + joinerCount)
  const peerSeats = Array.from(Host.getPeers().keys()).sort((a, b) => a - b)
  eq('host peer seats', peerSeats, [0, 1, 2, 3])

  // 每个 joiner 拿到 seat
  const joinerSeats = []
  for (let j of joiners) {
    let seat = -1
    for (let i = 0; i < 80; i++) {
      seat = j.mod.getSelfSeat()
      if (seat >= 1 && seat <= 3) break
      await settle(25)
    }
    assert(`${j.tag} 拿到 seat`, seat >= 1)
    joinerSeats.push(seat)
  }
  // 3 个 joiner seat 唯一(1/2/3 各一个,无冲突)
  eq('3 joiner seats 唯一', joinerSeats.slice().sort((a, b) => a - b), [1, 2, 3])

  // 跨 transport 双向通信:host → all joiners
  let received = [false, false, false]
  joiners.forEach((j, idx) => {
    j.mod.on('message:MIX_BROADCAST', () => { received[idx] = true })
  })
  Host.broadcast({ type: 'MIX_BROADCAST', payload: { v: 1 } })
  await settle(200)
  assert('joiner0 收到 host broadcast', received[0])
  assert('joiner1 收到 host broadcast', received[1])
  assert('joiner2 收到 host broadcast', received[2])

  // 反向:每个 joiner → host
  let hostGot = [false, false, false]
  joiners.forEach((j, idx) => {
    Host.on(`message:J${idx}_PING`, () => { hostGot[idx] = true })
  })
  joiners.forEach((j, idx) => {
    j.mod.broadcast({ type: `J${idx}_PING`, payload: { from: idx } })
  })
  await settle(200)
  assert('host 收到 joiner0 broadcast', hostGot[0])
  assert('host 收到 joiner1 broadcast', hostGot[1])
  assert('host 收到 joiner2 broadcast', hostGot[2])

  // 清理
  Host.close()
  joiners.forEach(j => j.mod.close())
}

console.log('\n=== 7. joinRemoteRoom transport 模式 ===')
{
  // 验证 joinRemoteRoom 后 transport 是 client 模式 + isReady 在 open 后 true
  const { mod: Host } = await makeNetInstance('mode-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=moh' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('mode-room')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  let hostPort = null
  for (let i = 0; i < 60; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(20)
  }
  if (!hostPort) throw new Error('host bind failed')

  const { mod: J } = await makeNetInstance('mode-wsj')
  J.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: 'J', avatar: 'J' })
  await settle(200)

  const t = J._getTransport()
  assert('joiner transport 是 WebSocketTransport', t?.constructor?.name === 'WebSocketTransport')
  assert('joiner transport isReady() = true', t.isReady() === true)

  // host 模式不变
  const ht = Host._getTransport()
  assert('host transport isReady() = true', ht.isReady() === true)
  assert('host transport 模式 = self', ht._mode === 'self')

  Host.close()
  J.close()
}

console.log(`\n========== cross-device test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)