/**
 * P1-12:joiner 主动离开协议测试
 *
 * 覆盖:
 *   1. leaveRoom() 在 joiner 端发送 LEAVE_REQUEST
 *   2. host 收到 LEAVE_REQUEST 后立即清理 seat、emit peer:leave、广播 PEER_LEAVE/AI_TAKEOVER
 *   3. 同一 seat 后续 _DISCONNECT 不再重复触发 peer:leave
 *   4. host 调用 leaveRoom() 等价于 close({ broadcast: true })
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

console.log('\n=== 1. joiner leaveRoom() 触发 host 立即清理 ===')
{
  const { mod: Host } = await makeNetInstance('gl-host')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=glh' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('gl-room')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })

  let hostPort = null
  for (let i = 0; i < 60; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(20)
  }
  assert('host ws server 已 bind', hostPort !== null)
  if (!hostPort) throw new Error('host bind failed')

  const { mod: J1 } = await makeNetInstance('gl-j1')
  const r1 = J1.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: 'J1', avatar: 'A' })
  assert('J1 joinRemoteRoom ok', r1.ok === true)

  const { mod: J2 } = await makeNetInstance('gl-j2')
  const r2 = J2.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: 'J2', avatar: 'B' })
  assert('J2 joinRemoteRoom ok', r2.ok === true)

  // 等待 JOIN 完成(host self + 2 joiners = 3)
  for (let i = 0; i < 100; i++) {
    if (Host.getPeers().size >= 3) break
    await settle(50)
  }
  assert('host 看到 2 个 joiner', Host.getPeers().size === 3)

  const j1Seat = J1.getSelfSeat()
  assert('J1 分配到有效座位', typeof j1Seat === 'number' && j1Seat >= 1 && j1Seat <= 3)

  let hostPeerLeaveEvents = []
  Host.on('peer:leave', (ev) => hostPeerLeaveEvents.push(ev))
  let j2PeerLeaveEvents = []
  J2.on('peer:leave', (ev) => j2PeerLeaveEvents.push(ev))
  let j2AiTakeoverEvents = []
  J2.on('ai:takeover', (ev) => j2AiTakeoverEvents.push(ev))

  // J1 主动离开
  J1.leaveRoom()
  await settle(150)

  assert('host 收到 peer:leave 一次', hostPeerLeaveEvents.length === 1)
  assert('host peer:leave seat 正确', hostPeerLeaveEvents[0]?.seat === j1Seat)
  assert('host peers 只剩 1 个 joiner', Host.getPeers().size === 2 && !Host.getPeers().has(j1Seat))
  assert('J2 收到 peer:leave 一次', j2PeerLeaveEvents.length === 1)
  assert('J2 收到 ai:takeover 一次', j2AiTakeoverEvents.length === 1)
  assert('J2 收到 peer:leave seat 正确', j2PeerLeaveEvents[0]?.seat === j1Seat)
  assert('J1 已断开', J1.isConnected() === false)

  // 再等待一段时间,确认没有重复 peer:leave(即 _DISCONNECT 不会二次触发)
  await settle(200)
  assert('host 没有重复 peer:leave', hostPeerLeaveEvents.length === 1)
  assert('J2 没有重复 peer:leave', j2PeerLeaveEvents.length === 1)

  Host.close()
  J2.close()
}

console.log('\n=== 2. host leaveRoom() 等价于广播关闭 ===')
{
  const { mod: Host } = await makeNetInstance('gl-host2')
  const { WebSocketTransport: HST } = await import('./network-transport-ws.js?t=glh2' + Date.now())
  Host._setTransportFactory(() => new HST({ port: 0 }))
  Host.setRoomId('gl-room2')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })

  let hostPort = null
  for (let i = 0; i < 60; i++) {
    const t = Host._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { hostPort = t.getBoundPort(); break }
    await settle(20)
  }
  assert('host2 ws server 已 bind', hostPort !== null)
  if (!hostPort) throw new Error('host2 bind failed')

  const { mod: J } = await makeNetInstance('gl-j3')
  J.joinRemoteRoom(`127.0.0.1:${hostPort}`, { nickname: 'J', avatar: 'C' })
  for (let i = 0; i < 50; i++) {
    if (Host.getPeers().size >= 1) break
    await settle(20)
  }

  let jMigrated = null
  J.on('host:migrated', (p) => { jMigrated = p })

  Host.leaveRoom()
  await settle(150)

  assert('host 已关闭', Host.isConnected() === false)
  assert('J 收到 host 迁移或离开通知', jMigrated !== null || J.isConnected() === false)
  J.close()
}

console.log(`\n========== network-graceful-leave 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 100)
