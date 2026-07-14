/**
 * v0.4.22 P1 — 真正的第二发现通道测试
 *
 * 覆盖:
 *   1. _generateLanCandidates 包含常见热点网段、当前页来源、缓存地址,并去重/过滤非法地址
 *   2. _probeHostHttp 通过 transport 的 /room-info 拿到房间摘要
 *   3. _probeHostWs 通过 ROOM_PROBE / ROOM_PROBE_ACK 拿到房间摘要
 *   4. scanLanRooms({ candidates }) 发现真实 host(HTTP 快速路径)
 *   5. scanLanRooms 空候选时返回 []
 *   6. _normalizeRoomInfo 缺省字段兜底
 */

import { WebSocket } from 'ws'

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

console.log('\n=== 1. _generateLanCandidates 浏览器环境包含常见热点网段 ===')
{
  // 模拟浏览器环境,让 _generateLanCandidates 走网段猜测分支
  const prevWindow = globalThis.window
  globalThis.window = {}
  try {
    const { mod: Net } = await makeNetInstance('cand-base')
    const list = Net._generateLanCandidates()
    assert('候选列表非空', list.length > 0)
    assert('包含常见热点网关', list.some(a => a.includes('192.168.43.1:8848')))
    assert('包含热点子网前 20 个 IP', list.some(a => a === '192.168.43.20:8848'))
    assert('不包含非法地址', !list.some(a => a.includes('..') || a.includes(' ')))
    assert('无重复地址', list.length === new Set(list).size)
  } finally {
    globalThis.window = prevWindow
  }
}

console.log('\n=== 2. _generateLanCandidates 包含当前页来源和缓存地址 ===')
{
  const { mod: Net } = await makeNetInstance('cand-extra')
  const prevLoc = globalThis.location
  const prevLocalStorage = globalThis.localStorage
  try {
    globalThis.location = { host: '10.20.30.40:9999' }
    const cacheKey = 'guandan-v0420-peer-cache-r1'
    const store = {
      [cacheKey]: JSON.stringify([
        { seat: 1, hostAddress: '172.16.1.1:8848', canHost: true, ts: Date.now() },
        { seat: 2, hostAddress: 'bad::address', canHost: true, ts: Date.now() },
      ]),
    }
    globalThis.localStorage = {
      get length() { return Object.keys(store).length },
      key: (i) => Object.keys(store)[i] || null,
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v },
      removeItem: (k) => { delete store[k] },
    }
    const list = Net._generateLanCandidates()
    assert('包含当前页 host', list.includes('10.20.30.40:9999'))
    assert('包含 localStorage 缓存地址', list.includes('172.16.1.1:8848'))
    assert('过滤掉非法地址', !list.includes('bad::address'))
    assert('缓存地址去重后只出现一次',
      list.filter(a => a === '172.16.1.1:8848').length === 1)
  } finally {
    globalThis.location = prevLoc
    globalThis.localStorage = prevLocalStorage
  }
}

console.log('\n=== 3. transport /room-info HTTP 探测 ===')
{
  const { WebSocketTransport } = await import('./network-transport-ws.js?t=dhttp' + Date.now())
  const tr = new WebSocketTransport({ port: 0 })
  tr.setRoomInfoProvider(() => ({ roomNo: 'R12345', playerCount: 3, maxPlayers: 4, hostNickname: 'HostA' }))
  await tr.open('self')
  const port = tr.getBoundPort()
  assert('server 已绑定端口', typeof port === 'number' && port > 0)

  const { mod: Net } = await makeNetInstance('http-probe')
  const info = await Net._probeHostHttp(`127.0.0.1:${port}`, 1000)
  eq('HTTP 探测返回 roomNo', info?.roomNo, 'R12345')
  eq('HTTP 探测返回 playerCount', info?.playerCount, 3)
  eq('HTTP 探测返回 hostNickname', info?.hostNickname, 'HostA')
  eq('HTTP 探测返回 ip/port', { ip: info?.ip, port: info?.port }, { ip: '127.0.0.1', port })
  assert('HTTP 探测返回 name 包含房间号', info?.name?.includes('R12345'))

  await tr.close()
}

console.log('\n=== 4. network.js host WebSocket ROOM_PROBE/ACK 探测 ===')
{
  const { mod: Host } = await makeNetInstance('ws-probe-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=wspro' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('ws-probe-room')
  Host.startAsHost({ nickname: 'WsProbeHost', avatar: 'W' })

  let hostPort = null
  for (let i = 0; i < 80; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(25)
  }
  assert('ws probe host 已绑定端口', hostPort !== null)
  if (!hostPort) throw new Error('host bind failed')

  const prevWs = globalThis.WebSocket
  globalThis.WebSocket = WebSocket
  const { mod: Net } = await makeNetInstance('ws-probe')
  try {
    const info = await Net._probeHostWs(`127.0.0.1:${hostPort}`, 1500)
    eq('WS 探测返回 roomNo', info?.roomNo, 'ws-probe-room')
    eq('WS 探测返回 hostNickname', info?.hostNickname, 'WsProbeHost')
    assert('WS 探测返回 playerCount >= 1', (info?.playerCount || 0) >= 1)
    eq('WS 探测返回 ip/port', { ip: info?.ip, port: info?.port }, { ip: '127.0.0.1', port: hostPort })
  } finally {
    globalThis.WebSocket = prevWs
    Host.close()
  }
}

console.log('\n=== 5. scanLanRooms 通过 candidates 发现真实 host ===')
{
  const { mod: Host } = await makeNetInstance('scan-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=sh' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('scan-room')
  Host.startAsHost({ nickname: 'ScanHost', avatar: 'S' })

  let hostPort = null
  for (let i = 0; i < 80; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(25)
  }
  assert('scan host 已绑定端口', hostPort !== null)
  if (!hostPort) throw new Error('host bind failed')

  // 使用独立 scanner 实例,显式指定候选
  const { mod: Scanner } = await makeNetInstance('scanner')
  const prevWs = globalThis.WebSocket
  globalThis.WebSocket = WebSocket
  let rooms = []
  try {
    rooms = await Scanner.scanLanRooms({ candidates: [`127.0.0.1:${hostPort}`] })
  } finally {
    globalThis.WebSocket = prevWs
  }
  assert('scanLanRooms 发现一个房间', rooms.length === 1)
  eq('发现房间 roomNo', rooms[0]?.roomNo, 'scan-room')
  assert('发现房间 playerCount >= 1', (rooms[0]?.playerCount || 0) >= 1)
  eq('发现房间 hostNickname', rooms[0]?.hostNickname, 'ScanHost')
  assert('发现房间 name 包含 hostNickname', rooms[0]?.name?.includes('ScanHost'))

  Host.close()
}

console.log('\n=== 6. scanLanRooms 空候选返回 [] ===')
{
  const { mod: Net } = await makeNetInstance('empty-scan')
  const rooms = await Net.scanLanRooms({ candidates: [] })
  eq('空候选返回空数组', rooms, [])
}

console.log('\n=== 7. _normalizeRoomInfo 缺省字段兜底 ===')
{
  const { mod: Net } = await makeNetInstance('norm')
  const info = Net._normalizeRoomInfo('192.168.1.5', 8848, {})
  eq('缺省 roomNo 为空字符串', info.roomNo, '')
  eq('缺省 playerCount 为 0', info.playerCount, 0)
  eq('缺省 maxPlayers 为 4', info.maxPlayers, 4)
  eq('缺省 hostNickname 为空', info.hostNickname, '')
  assert('name 在 roomNo 为空时不含 "·"', !info.name.includes('·'))
}

console.log(`\n========== discovery test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)
