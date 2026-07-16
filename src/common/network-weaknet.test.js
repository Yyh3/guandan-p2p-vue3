/**
 * network-weaknet.test.js — 弱网压测
 *
 * 通过动态 import cache-bust 创建独立的 network.js 实例,
 * host 用真实 WebSocketTransport,joiner 用 LossyWsTransport 注入丢包/延迟。
 * 先用 0 丢包完成 4 人建联,再动态上调丢包率,验证消息到达率与稳定性。
 */
import { WebSocketTransport } from './network-transport-ws.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

async function makeNet(tag) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  return import(url)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function waitFor(fn, timeoutMs = 3000, intervalMs = 100) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await fn()
    if (r) return r
    await sleep(intervalMs)
  }
  return null
}

/** 可调丢包/延迟的 WS transport 包装 */
class LossyWsTransport {
  constructor({ lossRate = 0, delayMs = 0 } = {}) {
    this.type = 'ws'
    this._real = new WebSocketTransport()
    this._lossRate = lossRate
    this._delayMs = delayMs
    this._handler = null
    this._real.onMessage((msg) => {
      if (Math.random() < this._lossRate) return
      const h = this._handler
      if (!h) return
      if (this._delayMs > 0) setTimeout(() => h(msg), this._delayMs)
      else h(msg)
    })
  }
  setLossRate(v) { this._lossRate = Math.max(0, Math.min(1, v)) }
  setDelayMs(v) { this._delayMs = Math.max(0, v) }
  open(...args) { return this._real.open(...args) }
  close() { return this._real.close() }
  send(msg) {
    if (Math.random() < this._lossRate) return
    if (this._delayMs > 0) setTimeout(() => this._real.send(msg), this._delayMs)
    else this._real.send(msg)
  }
  onMessage(fn) { this._handler = fn }
  getHostIp() { return this._real.getHostIp() }
  getBoundPort() { return this._real.getBoundPort() }
  setHostSeat(seat) { return this._real.setHostSeat(seat) }
  setRoomInfoProvider(fn) { return this._real.setRoomInfoProvider(fn) }
}

console.log('\n=== 1. 先 0 丢包建联,再切到 15% 丢包 + 30ms 延迟 ===')
{
  const host = await makeNet('wn-host')
  host._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  host.setRoomId('weaknet-15')
  host.startAsHost({ nickname: 'H', avatar: 'H' })
  await sleep(300)
  const hostAddress = host.getSelfHostAddress()
  assert('host 已获取到 hostAddress', !!hostAddress)

  /** 保存 wrapper 引用,方便后续调丢包率 */
  const joinerTransports = []
  const joiners = []
  for (let i = 1; i <= 3; i++) {
    const j = await makeNet('wn-j' + i)
    let wrapper
    j._setTransportFactory(() => {
      wrapper = new LossyWsTransport({ lossRate: 0, delayMs: 0 })
      joinerTransports.push(wrapper)
      return wrapper
    })
    j.joinRoom(hostAddress, { nickname: 'J' + i, avatar: String(i) })
    joiners.push(j)
  }

  // 0 丢包下等待 4 人齐
  const ok = await waitFor(() => host.getPeers().size === 4, 4000)
  assert('0 丢包下 4 人全部上线(host peers=4)', ok === true)

  // 上调弱网参数
  joinerTransports.forEach(t => { t.setLossRate(0.15); t.setDelayMs(30) })

  console.log('\n=== 2. 15% 丢包广播仍有较高到达率 ===')
  const received = [0, 0, 0]
  joiners.forEach((j, idx) => {
    j.on('message:CHAT', () => { received[idx]++ })
  })
  for (let i = 0; i < 20; i++) {
    host.broadcast({ type: 'CHAT', payload: { text: 'ping-' + i } })
    await sleep(40)
  }
  await sleep(500)
  const minReceived = Math.min(...received)
  assert(`3 个 joiner 至少收到 12/20 条广播(实际 ${minReceived})`, minReceived >= 12)

  console.log('\n=== 3. 定向 sendTo 在弱网下最终可达 ===')
  const snapshotGot = [false, false, false]
  joiners.forEach((j, idx) => {
    j.on('message:STATE_SNAPSHOT', () => { snapshotGot[idx] = true })
  })
  // 连续发 5 次定向消息,只要收到一次就算成功
  for (let r = 0; r < 5; r++) {
    for (let s = 1; s <= 3; s++) {
      host.sendTo(s, { type: 'STATE_SNAPSHOT', payload: { round: r } })
    }
    await sleep(80)
  }
  await sleep(300)
  assert('3 个 joiner 都至少收到 1 次定向 STATE_SNAPSHOT', snapshotGot.every(Boolean))

  console.log('\n=== 4. 弱网下 kick 事件不崩溃 ===')
  let kicked = false
  joiners[2].on('self:kicked', () => { kicked = true })
  host.kickPlayer(3)
  await sleep(600)
  assert('被踢 joiner 收到 self:kicked', kicked)
  assert('host 端 peers 变为 3 人', host.getPeers().size === 3)

  // 清理
  joiners.forEach(j => j.close())
  host.close()
  await sleep(200)
}

console.log('\n=== 5. 30% 丢包 + 100ms 延迟下保持连接 ===')
{
  const host = await makeNet('wn-host2')
  host._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  host.setRoomId('weaknet-30')
  host.startAsHost({ nickname: 'H2', avatar: 'H' })
  await sleep(300)
  const hostAddress = host.getSelfHostAddress()

  let wrapper
  const j = await makeNet('wn-jh')
  j._setTransportFactory(() => {
    wrapper = new LossyWsTransport({ lossRate: 0, delayMs: 0 })
    return wrapper
  })
  j.joinRoom(hostAddress, { nickname: 'J', avatar: 'J' })

  let ok = await waitFor(() => host.getPeers().size === 2, 4000)
  assert('0 丢包下 joiner 先连上', ok === true)

  wrapper.setLossRate(0.30)
  wrapper.setDelayMs(100)

  // host 持续发心跳/广播,joiner 应仍在 3s 内不被心跳超时踢掉
  for (let i = 0; i < 10; i++) {
    host.broadcast({ type: 'CHAT', payload: { text: 'keepalive-' + i } })
    await sleep(200)
  }
  ok = await waitFor(() => host.getPeers().size === 2, 2000)
  assert('30% 丢包 + 100ms 延迟下 joiner 仍保持在线', ok === true)

  j.close()
  host.close()
  await sleep(200)
}

console.log(`\n========== 弱网压测结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
