/**
 * v2.4-p2 P1 cleanup — BUG-005 测试
 *
 * BUG-005:BC transport 房间号隔离失效
 *   - 2 个 host(房间号 111111 / 222222),joiner 输 111111 只能连 hostA,
 *     输 222222 只能连 hostB,输错房间号不能连上任何一个
 *   - 用真实 BroadcastChannel + dynamic-import 多实例
 *   - 验证 transport._roomId 跟传入的 roomId 一致
 *   - 验证 BC channel name 用 roomId 正确构造
 *   - 边界:roomId 空字符串 fallback "default"
 *
 * 设计要点:
 *   - 沿用 network-multitab.test.js 的 makeFakeInstance 模式
 *   - dynamic-import cache-bust → 独立 module 实例
 *   - fake timers 注入 → 无需真实等待
 *   - Node24 自带 BroadcastChannel,同进程多实例天然工作
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

async function makeFakeInstance(tag, fixedUuid) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  const captured = { intervals: [], timeouts: [], cleared: [] }

  if (fixedUuid !== undefined) {
    globalThis.sessionStorage = {
      _store: { 'guandan_session_uuid': fixedUuid },
      getItem(k) { return this._store[k] || null },
      setItem(k, v) { this._store[k] = v },
    }
  }

  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms, cancelled: false }); return captured.intervals.length },
    clearInterval: (id) => { captured.cleared.push({ type: 'interval', id }); if (id >= 1 && id <= captured.intervals.length) captured.intervals[id - 1].cancelled = true },
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms, cancelled: false }); return captured.timeouts.length },
    clearTimeout: (id) => { captured.cleared.push({ type: 'timeout', id }); if (id >= 1 && id <= captured.timeouts.length) captured.timeouts[id - 1].cancelled = true },
  })

  return { mod, captured }
}

function resetSessionStorage() {
  globalThis.sessionStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function settle(ms = 50) {
  await new Promise(r => setTimeout(r, ms))
}

// =========================================================================
// 块 1: BroadcastChannelTransport.open(mode, roomId) 正确用 roomId
// =========================================================================
console.log('\n=== 1. BroadcastChannelTransport.open(mode, roomId) 用 roomId 构造 channel ===')
{
  const { BroadcastChannelTransport } = await import('./network-transport-bc.js?tag=bc-test&t=' + Date.now())

  // 用 roomId='111111' 创建
  const tA = new BroadcastChannelTransport()
  await tA.open('self', '111111')
  assert('BC roomId=111111', tA._roomId === '111111')
  assert('BC channel name = guandan-p2p-111111',
    tA._channel && tA._channel.name === 'guandan-p2p-111111')
  tA.close()

  // 用 roomId='222222' 创建
  const tB = new BroadcastChannelTransport()
  await tB.open('self', '222222')
  assert('BC roomId=222222', tB._roomId === '222222')
  assert('BC channel name = guandan-p2p-222222',
    tB._channel && tB._channel.name === 'guandan-p2p-222222')
  tB.close()

  // 不传 roomId → fallback 'default'
  const tDef = new BroadcastChannelTransport()
  await tDef.open('self')
  assert('BC 不传 roomId → fallback "default"', tDef._roomId === 'default')
  assert('BC channel name = guandan-p2p-default',
    tDef._channel && tDef._channel.name === 'guandan-p2p-default')
  tDef.close()

  // 显式传 'default' → 等价
  const tDef2 = new BroadcastChannelTransport()
  await tDef2.open('self', 'default')
  assert('BC 显式 roomId="default" 等价', tDef2._roomId === 'default')
  assert('BC channel name = guandan-p2p-default',
    tDef2._channel && tDef2._channel.name === 'guandan-p2p-default')
  tDef2.close()

  // 'client' 模式也一样接受 roomId
  const tC = new BroadcastChannelTransport()
  await tC.open('client', '333333')
  assert('BC client mode + roomId=333333', tC._roomId === '333333')
  assert('BC client channel name = guandan-p2p-333333',
    tC._channel && tC._channel.name === 'guandan-p2p-333333')
  tC.close()
}

// =========================================================================
// 块 2: 2 host 不同 roomId → joiner 按 roomId 精确连接 + 反向隔离
// =========================================================================
console.log('\n=== 2. 2 host 不同 roomId → joiner 按 roomId 精确连接 ===')
{
  resetSessionStorage()

  // Host A:roomId=111111
  const { mod: HostA } = await makeFakeInstance('host-111', 'host-uuid-111')
  HostA.setRoomId('111111')
  HostA.startAsHost({ nickname: 'HostA', avatar: 'A' })
  await settle()

  // Host B:roomId=222222
  const { mod: HostB } = await makeFakeInstance('host-222', 'host-uuid-222')
  HostB.setRoomId('222222')
  HostB.startAsHost({ nickname: 'HostB', avatar: 'B' })
  await settle()

  // 验证两个 host 各自 transport 用不同的 BC channel
  const ta = HostA._getTransport()
  const tb = HostB._getTransport()
  assert('HostA transport type = BroadcastChannelTransport',
    ta && ta.constructor.name === 'BroadcastChannelTransport')
  assert('HostB transport type = BroadcastChannelTransport',
    tb && tb.constructor.name === 'BroadcastChannelTransport')
  assert('HostA BC roomId = 111111', ta._roomId === '111111')
  assert('HostB BC roomId = 222222', tb._roomId === '222222')
  assert('HostA 与 HostB BC channel name 不同',
    ta._channel.name !== tb._channel.name)

  // Joiner 1:roomNo=111111 → 应该连上 HostA
  const { mod: Joiner1 } = await makeFakeInstance('joiner-111', 'j1-uuid-111')
  let j1Connect = null
  Joiner1.on('connect', (e) => { j1Connect = e })
  Joiner1.joinRoom('111111', { nickname: 'J1', avatar: '1' })
  await settle()

  assert('Joiner1 收到 connect (连到 HostA)', j1Connect != null)
  assert('Joiner1 selfSeat ∈ [1,3]', Joiner1.getSelfSeat() >= 1 && Joiner1.getSelfSeat() <= 3)
  assert('HostA peers.size == 2 (host + J1)', HostA.getPeers().size === 2)
  assert('HostB peers.size == 1 (J1 串不到 HostB)', HostB.getPeers().size === 1)

  // Joiner 2:roomNo=222222 → 应该连上 HostB
  const { mod: Joiner2 } = await makeFakeInstance('joiner-222', 'j2-uuid-222')
  let j2Connect = null
  Joiner2.on('connect', (e) => { j2Connect = e })
  Joiner2.joinRoom('222222', { nickname: 'J2', avatar: '2' })
  await settle()

  assert('Joiner2 收到 connect (连到 HostB)', j2Connect != null)
  assert('HostA peers.size 仍 == 2 (J2 串不到 HostA)', HostA.getPeers().size === 2)
  assert('HostB peers.size == 2 (host + J2)', HostB.getPeers().size === 2)

  // Joiner 3:roomNo=333333 → 没有任何 host,不应收到 connect
  const { mod: Joiner3 } = await makeFakeInstance('joiner-333', 'j3-uuid-333')
  let j3Connect = null
  Joiner3.on('connect', (e) => { j3Connect = e })
  Joiner3.joinRoom('333333', { nickname: 'J3', avatar: '3' })
  await settle(200)

  assert('Joiner3 用错房间号,不收到 connect', j3Connect === null)
  assert('Joiner3 selfSeat 仍 == -1 (无 host 应答)', Joiner3.getSelfSeat() === -1)
  assert('HostA peers.size 仍 == 2', HostA.getPeers().size === 2)
  assert('HostB peers.size 仍 == 2', HostB.getPeers().size === 2)

  // 反向隔离:HostA 广播,Joiner2 不应收到
  let j2SawHostABroadcast = false
  Joiner2.on('message:NICK_UPDATE', () => { j2SawHostABroadcast = true })
  HostA.broadcast({ type: 'NICK_UPDATE', payload: { nickname: 'A-fan' } })
  await settle(100)
  assert('HostA 广播不串到 Joiner2 (不同房间)', !j2SawHostABroadcast)

  // 反向隔离:HostB 广播,Joiner1 不应收到
  let j1SawHostBBroadcast = false
  Joiner1.on('message:NICK_UPDATE', () => { j1SawHostBBroadcast = true })
  HostB.broadcast({ type: 'NICK_UPDATE', payload: { nickname: 'B-fan' } })
  await settle(100)
  assert('HostB 广播不串到 Joiner1 (不同房间)', !j1SawHostBBroadcast)

  // 正向广播:HostA 广播,Joiner1 应收到
  let j1SawHostABroadcast = false
  Joiner1.on('message:NICK_UPDATE', () => { j1SawHostABroadcast = true })
  HostA.broadcast({ type: 'NICK_UPDATE', payload: { nickname: 'A-fan-2' } })
  await settle(100)
  assert('HostA 广播应到达 Joiner1 (同房间)', j1SawHostABroadcast)

  // cleanup
  Joiner1.close(); Joiner2.close(); Joiner3.close()
  HostA.close(); HostB.close()
  await settle()
}

// =========================================================================
// 块 3: joinRoom BC 路径也必须传 roomId(回归测试)
// =========================================================================
console.log('\n=== 3. joinRoom BC 路径的 transport 用传入的 roomId ===')
{
  resetSessionStorage()

  const { mod: JoinerOnly } = await makeFakeInstance('joiner-bc-only', 'joiner-bc-uuid')
  JoinerOnly.joinRoom('555555', { nickname: 'Solo', avatar: 'S' })
  await settle(50)

  const tj = JoinerOnly._getTransport()
  assert('joiner transport 是 BC', tj && tj.constructor.name === 'BroadcastChannelTransport')
  assert('joiner BC roomId = 555555 (不是 default!)',
    tj._roomId === '555555')
  assert('joiner BC channel name = guandan-p2p-555555',
    tj._channel && tj._channel.name === 'guandan-p2p-555555')

  JoinerOnly.close()
  await settle()
}

// =========================================================================
// 块 4: 边界 — roomId 为空时 fallback 'default'
// =========================================================================
console.log('\n=== 4. 边界 — 空 roomId fallback "default" 而非空字符串 ===')
{
  const { mod: EdgeCase } = await makeFakeInstance('edge', 'edge-uuid')

  // setRoomId('') 模拟 host 漏掉 setRoomId
  EdgeCase.setRoomId('')
  EdgeCase.startAsHost({ nickname: 'Edge', avatar: 'E' })
  await settle()

  const t = EdgeCase._getTransport()
  assert('空 roomId 时 BC roomId fallback "default"(不是空串)',
    t._roomId === 'default')
  assert('channel name = guandan-p2p-default',
    t._channel && t._channel.name === 'guandan-p2p-default')

  EdgeCase.close()
  await settle()
}

// =========================================================================
// 块 5: joiner 默认 'default' fallback (老 API 兼容)
// =========================================================================
console.log('\n=== 5. joinRoom(\'default\', ...) 显式 fallback (兼容老 API) ===')
{
  resetSessionStorage()

  const { mod: JoinerOld } = await makeFakeInstance('joiner-old-api', 'joiner-old-uuid')
  JoinerOld.joinRoom('default', { nickname: 'OldAPI', avatar: 'O' })
  await settle(50)

  const t = JoinerOld._getTransport()
  assert('joiner(\'default\') → BC roomId="default"',
    t._roomId === 'default')
  assert('channel name = guandan-p2p-default',
    t._channel && t._channel.name === 'guandan-p2p-default')

  JoinerOld.close()
  await settle()
}

console.log(`\n========== roomid test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)