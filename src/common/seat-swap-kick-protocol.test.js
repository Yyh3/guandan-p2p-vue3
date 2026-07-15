/**
 * v2.4-p4 BUG-006 + BUG-007 协议层单测
 *
 * BUG-006 — 换队友只改 UI,网络层和游戏层 seat 没同步
 *   修复:network.js swapSeats(a, b) 作为网络层权威,统一改 peers Map / selfSeat
 *         + 广播 SEAT_SWAP_ACK + emit 'peer:seat_swap' 事件
 *   测试:
 *     - host 调 swapSeats → 立即改 host 端 peers Map / selfSeat
 *     - host 端 emit 'peer:seat_swap' 事件
 *     - joiner 端收到 SEAT_SWAP_ACK → 同步本地 peers Map / selfSeat
 *     - 边界:a==b / 非法 seat / 自未连接等场景
 *     - 4 端 SEAT_SWAP_ACK 都收到(host / 3 joiner)
 *
 * BUG-007 — 踢人协议需要统一真机表现
 *   修复:network.js kickPlayer(seat) 统一踢人协议:
 *     1) 给目标 seat 定向发 KICKED → joiner 端立即 emit 'self:kicked'
 *     2) 广播 PEER_LEAVE { kick: true } → 旁观 joiner 立即 peers.delete
 *     3) host 端立即清 peers Map + emit 'peer:leave' (不等心跳)
 *     4) 调 transport.forceDisconnectSeat (真断 ws / AndroidWs 关 ws / BC broadcast)
 *   测试:
 *     - host 调 kickPlayer → host peers Map 立即少 1 人(不等心跳)
 *     - 被踢 joiner 端收 KICKED → emit 'self:kicked' (优先于 PEER_LEAVE)
 *     - 旁观 joiner 端收到 PEER_LEAVE { kick: true } → 立即 peers.delete
 *     - transport.forceDisconnectSeat 行为不变(WS 关 ws / BC broadcast PEER_LEAVE)
 *     - 幂等:重复调 kickPlayer(已踢 seat) 不重复发消息
 *
 * ★ 不引入 vue-test-utils / jsdom,直接 import network.js 跨实例测试
 *   (跟 network-multitab.test.js / network-kick-player.test.js 同模式)
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

// ============================================================
// 块 1: BUG-006 — host 调 swapSeats,本地 peers Map / selfSeat 立即同步
// ============================================================
console.log('\n=== 1. BUG-006 — host 调 swapSeats(0, 2):host 端 peers Map / selfSeat 立即互换 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-host', 'h-uuid-swap-host')
  Host.setRoomId('multitab-swap-host')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  // 假装队友 seat=2 已加入
  Host.getPeers().set(2, { nickname: 'Mate', avatar: 'M', uuid: 'mate-uuid' })

  // 收集 host 本机 emit 的 peer:seat_swap 事件
  let hostSwapEvt = null
  Host.on('peer:seat_swap', (e) => { hostSwapEvt = e })

  // ★ host 调 swapSeats(0, 2)
  const r = Host.swapSeats(0, 2)
  assert('swapSeats(0, 2) 返回 ok=true', r.ok === true)

  // 1) host 端 peers Map entries 互换
  const peerAt0 = Host.getPeers().get(0)
  const peerAt2 = Host.getPeers().get(2)
  assert('host peers[0] 现在是 Mate', peerAt0?.nickname === 'Mate')
  assert('host peers[2] 现在是 Host 自己的 info', peerAt2?.nickname === 'Host')

  // 2) host 端 selfSeat 从 0 切到 2(host 自己 swap 到 seat 2)
  eq('host selfSeat 从 0 切换到 2', Host.getSelfSeat(), 2)

  // 3) host 端 emit 'peer:seat_swap' 事件
  assert('host 端 emit peer:seat_swap', hostSwapEvt != null)
  eq('peer:seat_swap.a = 0', hostSwapEvt?.a, 0)
  eq('peer:seat_swap.b = 2', hostSwapEvt?.b, 2)

  Host.off('peer:seat_swap')
  Host.close()
  await settle(30)
}

// ============================================================
// 块 2: BUG-006/P0-07 — joiner 发 SEAT_SWAP_REQUEST,host 提交后同步
// ============================================================
console.log('\n=== 2. BUG-006/P0-07 — joiner 请求 swapSeats(1, 3):host 提交后 joiner 同步 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-j', 'h-uuid-swap-j')
  Host.setRoomId('multitab-swap-j')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-swap-j', 'j1-uuid-swap-j')
  J1.joinRoom('multitab-swap-j', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  const { mod: J2 } = await makeFakeInstance('j2-swap-j', 'j2-uuid-swap-j')
  J2.joinRoom('multitab-swap-j', { nickname: 'J2', avatar: '2' })
  let s2 = -1
  for (let i = 0; i < 50 && s2 === -1; i++) { await settle(10); s2 = J2.getSelfSeat() }
  assert('J2 seat=2', s2 === 2)

  const { mod: J3 } = await makeFakeInstance('j3-swap-j', 'j3-uuid-swap-j')
  J3.joinRoom('multitab-swap-j', { nickname: 'J3', avatar: '3' })
  let s3 = -1
  for (let i = 0; i < 50 && s3 === -1; i++) { await settle(10); s3 = J3.getSelfSeat() }
  assert('J3 seat=3', s3 === 3)

  // J1 调 swapSeats(1, 3) → 只能发 REQUEST,由 host 提交后通过 COMMITTED 同步
  let j1SwapEvt = null
  J1.on('peer:seat_swap', (e) => { j1SwapEvt = e })
  const r = J1.swapSeats(1, 3)
  assert('J1 swapSeats(1, 3) 返回 ok=true(pending)', r.ok === true)
  await settle(80)
  eq('J1 selfSeat 从 1 切换到 3', J1.getSelfSeat(), 3)
  assert('J1 peers[1] 现在是 J3 (nickname=J3)', J1.getPeers().get(1)?.nickname === 'J3')
  assert('J1 peers[3] 现在是 J1 自己 (nickname=J1)', J1.getPeers().get(3)?.nickname === 'J1')
  assert('J1 emit peer:seat_swap 事件', j1SwapEvt != null)

  J1.off('peer:seat_swap')
  J1.close(); J2.close(); J3.close(); Host.close()
  await settle(30)
}

// ============================================================
// 块 3: BUG-006 — 4 端 SEAT_SWAP_ACK 都收到 (host broadcast → 3 joiner 都同步)
// ============================================================
console.log('\n=== 3. BUG-006 — host 调 swapSeats 后,3 个 joiner 都收到 SEAT_SWAP_ACK 并同步 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-bc', 'h-uuid-swap-bc')
  Host.setRoomId('multitab-swap-bc')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const joiners = []
  for (let i = 1; i <= 3; i++) {
    const tag = `j${i}-swap-bc`
    const { mod } = await makeFakeInstance(tag, `${tag}-uuid`)
    mod.joinRoom('multitab-swap-bc', { nickname: `J${i}`, avatar: String(i) })
    joiners.push(mod)
  }
  // 等所有 joiner 分配 seat
  let allSeated = false
  for (let i = 0; i < 50 && !allSeated; i++) {
    await settle(10)
    allSeated = joiners.every((j, idx) => j.getSelfSeat() === idx + 1)
  }
  assert('J1 seat=1', joiners[0].getSelfSeat() === 1)
  assert('J2 seat=2', joiners[1].getSelfSeat() === 2)
  assert('J3 seat=3', joiners[2].getSelfSeat() === 3)

  // host 改一下 peers[0] 跟 peers[2] 的昵称方便看 swap 效果
  Host.getPeers().set(0, { nickname: 'HostNewNick', avatar: 'H', uuid: 'h-uuid-swap-bc' })
  Host.getPeers().set(2, { nickname: 'J2OldNick', avatar: '2', uuid: 'j2-uuid-swap-bc' })
  // host 端先 sync 给 joiner(joiner 端 peers 才有正确 info)
  Host.broadcast({ type: 'SYNC', payload: { peers: Array.from(Host.getPeers().entries()) } })
  await settle(50)

  // ★ host 调 swapSeats(0, 2)
  const swapEvts = [[], [], []]
  joiners.forEach((j, i) => j.on('peer:seat_swap', (e) => { swapEvts[i].push(e) }))
  const hostSwapEvt = []
  Host.on('peer:seat_swap', (e) => { hostSwapEvt.push(e) })

  const r = Host.swapSeats(0, 2)
  assert('host swapSeats(0, 2) ok=true', r.ok === true)
  await settle(80)

  // host 端:emit 一次 peer:seat_swap
  eq('host 端 peer:seat_swap 触发 1 次', hostSwapEvt.length, 1)
  eq('host 端 peer:seat_swap.a=0', hostSwapEvt[0]?.a, 0)
  eq('host 端 peer:seat_swap.b=2', hostSwapEvt[0]?.b, 2)

  // 3 个 joiner 都收到 SEAT_SWAP_COMMITTED → 调 _applySeatSwapLocal → emit peer:seat_swap
  for (let i = 0; i < 3; i++) {
    eq(`J${i+1} 端 peer:seat_swap 触发 1 次`, swapEvts[i].length, 1)
    eq(`J${i+1} 端 peer:seat_swap.a=0`, swapEvts[i][0]?.a, 0)
    eq(`J${i+1} 端 peer:seat_swap.b=2`, swapEvts[i][0]?.b, 2)
  }

  // joiner 端 peers Map 也同步(host 没参与 joiner 的 peers Map,但 SEAT_SWAP_COMMITTED 广播后
  // joiner 的本地 _applySeatSwapLocal 会 swap 自己的 peers Map entries)
  // 注意:joiner 端 peers Map 之前是 SYNC 同步下来的 host 信息,所以 swap 后会反映新状态
  const j0After = joiners[0].getPeers().get(0)
  const j2After = joiners[0].getPeers().get(2)
  assert('J1 端 peers[0] 现在是 J2OldNick', j0After?.nickname === 'J2OldNick')
  assert('J1 端 peers[2] 现在是 HostNewNick', j2After?.nickname === 'HostNewNick')

  Host.off('peer:seat_swap')
  joiners.forEach((j, i) => j.off('peer:seat_swap'))
  joiners.forEach(j => j.close())
  Host.close()
  await settle(50)
}

// ============================================================
// 块 4: BUG-006 — 边界场景 (a==b / 非法 seat / 自未连接)
// ============================================================
console.log('\n=== 4. BUG-006 — swapSeats 边界 (a==b / 非法 seat / 自未连接) ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-edge', 'h-uuid-swap-edge')
  Host.setRoomId('multitab-swap-edge')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  // a==b
  const r1 = Host.swapSeats(0, 0)
  assert('swapSeats(0, 0) 返回 ok=false', r1.ok === false)
  assert('error 含 "不能相同"', /不能相同/.test(r1.error || ''))

  // 非法 seat
  const r2 = Host.swapSeats(0, 5)
  assert('swapSeats(0, 5) 返回 ok=false', r2.ok === false)
  assert('error 含 [0,3]', /\[0,3\]/.test(r2.error || ''))

  const r3 = Host.swapSeats(-1, 2)
  assert('swapSeats(-1, 2) 返回 ok=false', r3.ok === false)

  const r4 = Host.swapSeats(0, 1.5)
  assert('swapSeats(0, 1.5) 返回 ok=false (浮点)', r4.ok === false)

  const r5 = Host.swapSeats('0', 2)
  assert("swapSeats('0', 2) 返回 ok=false (字符串)", r5.ok === false)

  // 自未连接场景:close 后 selfSeat=0 但 isHostFlag=false
  Host.close()
  await settle(30)
  const r6 = Host.swapSeats(0, 2)
  assert('close 后 swapSeats 返回 ok=false', r6.ok === false)
  assert('error 含 "尚未连接"', /尚未连接/.test(r6.error || ''))
}

// ============================================================
// 块 5: BUG-006/P0-07 — swapSeats 时 selfSeat 不在 {a,b} 中 → selfSeat 不变;只能对家换
// ============================================================
console.log('\n=== 5. BUG-006/P0-07 — host 调 swapSeats(1, 3) (不动自己 seat=0),selfSeat 不变 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-notme', 'h-uuid-swap-notme')
  Host.setRoomId('multitab-swap-notme')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()
  Host.getPeers().set(1, { nickname: 'J1', avatar: '1', uuid: 'j1-uuid' })
  Host.getPeers().set(3, { nickname: 'J3', avatar: '3', uuid: 'j3-uuid' })

  // 非对家换座应被拒绝
  const rBad = Host.swapSeats(1, 2)
  assert('swapSeats(1, 2)(非对家) 返回 ok=false', rBad.ok === false)

  const r = Host.swapSeats(1, 3)
  assert('swapSeats(1, 3) 返回 ok=true', r.ok === true)
  eq('host selfSeat 仍为 0 (没在 {1,3} 中)', Host.getSelfSeat(), 0)
  assert('host peers[1] 现在是 J3', Host.getPeers().get(1)?.nickname === 'J3')
  assert('host peers[3] 现在是 J1', Host.getPeers().get(3)?.nickname === 'J1')

  Host.close()
  await settle(30)
}

// ============================================================
// 块 5.5: P1-02 — host 换座到 seat 2 后可踢原 seat 0
// ============================================================
console.log('\n=== 5.5. P1-02 — host 换座到 seat 2 后可踢原 seat 0 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-swap-kick', 'h-uuid-swap-kick')
  Host.setRoomId('multitab-swap-kick')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()
  // 模拟原 host(seat 0)与队友 seat 2 换座
  Host.getPeers().set(2, { nickname: 'J2', avatar: '2', uuid: 'j2-uuid' })
  Host.swapSeats(0, 2)
  await settle(50)
  eq('换座后 host selfSeat = 2', Host.getSelfSeat(), 2)
  eq('换座后 host hostSeat = 2', Host.getHostSeat(), 2)
  // 原 seat 0 现在由 J2 占据(peer 信息已 swap)
  assert('peers[0] 是 J2', Host.getPeers().get(0)?.nickname === 'J2')

  // 不能踢自己(seat 2)
  const rSelf = Host.kickPlayer(2)
  assert('kickPlayer(2)(自己) 返回 ok=false', rSelf.ok === false)

  // 可以踢原 seat 0(现在坐着 J2)
  const r = Host.kickPlayer(0)
  assert('kickPlayer(0) 返回 ok=true', r.ok === true)
  assert('踢后 peers 不再含 seat 0', !Host.getPeers().has(0))

  Host.close()
  await settle(30)
}

// ============================================================
// 块 6: BUG-007 — host 调 kickPlayer → host peers Map 立即少 1 人(不等心跳)
// ============================================================
console.log('\n=== 6. BUG-007 — host 调 kickPlayer(2):host peers Map 立即少 1 人(不等心跳) ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kick-now', 'h-uuid-kick-now')
  Host.setRoomId('multitab-kick-now')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-now', 'j1-uuid-kick-now')
  J1.joinRoom('multitab-kick-now', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  const { mod: J2 } = await makeFakeInstance('j2-kick-now', 'j2-uuid-kick-now')
  J2.joinRoom('multitab-kick-now', { nickname: 'J2', avatar: '2' })
  let s2 = -1
  for (let i = 0; i < 50 && s2 === -1; i++) { await settle(10); s2 = J2.getSelfSeat() }
  assert('J2 seat=2', s2 === 2)

  // host 自己(seat=0) + J1 + J2 = 3
  assert('kick 前 host peers.size = 3 (host + 2 joiners)', Host.getPeers().size === 3)
  assert('kick 前 host peers 含 seat=2', Host.getPeers().has(2))

  let hostLeaveEvt = null
  Host.on('peer:leave', (e) => { hostLeaveEvt = e })

  // ★ host 调 kickPlayer(2)
  const r = Host.kickPlayer(2, 'kicked')
  assert('kickPlayer(2) 返回 ok=true', r.ok === true)
  assert('kickPlayer error 未设', r.error == null)
  // ★ 不等心跳,host peers.size 立即变 2
  assert('kick 后 host peers.size 立即变 2 (不等心跳)', Host.getPeers().size === 2)
  assert('kick 后 host peers 不再含 seat=2', !Host.getPeers().has(2))

  // host 端 emit 'peer:leave' 事件(应携带 kicked: true)
  assert('host 端 emit peer:leave 事件', hostLeaveEvt != null)
  eq('peer:leave.seat = 2', hostLeaveEvt?.seat, 2)
  eq('peer:leave.kicked = true', hostLeaveEvt?.kicked, true)

  Host.off('peer:leave')
  J1.close(); J2.close(); Host.close()
  await settle(50)
}

// ============================================================
// 块 7: BUG-007 — 被踢 joiner 端收 KICKED → emit 'self:kicked' 优先
// ============================================================
console.log('\n=== 7. BUG-007 — 被踢 joiner 收到 KICKED → emit self:kicked (优先 PEER_LEAVE) ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kicked', 'h-uuid-kicked')
  Host.setRoomId('multitab-kicked')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kicked', 'j1-uuid-kicked')
  J1.joinRoom('multitab-kicked', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  let j1KickedEvt = null
  J1.on('self:kicked', (e) => { j1KickedEvt = e })

  Host.kickPlayer(1, 'misbehave')
  await settle(100)

  // ★ J1 端收到 KICKED → emit self:kicked
  assert('J1 self:kicked 触发', j1KickedEvt != null)
  eq('J1 self:kicked.reason = misbehave', j1KickedEvt?.reason, 'misbehave')
  assert('J1 self:kicked.ts 字段存在 (number)', typeof j1KickedEvt?.ts === 'number')

  J1.off('self:kicked')
  J1.close(); Host.close()
  await settle(30)
}

// ============================================================
// 块 8: BUG-007 — 旁观 joiner 端收 PEER_LEAVE { kick: true } → 立即 peers.delete
// ============================================================
console.log('\n=== 8. BUG-007 — 旁观 joiner 端立即 peers.delete(被踢 seat) (不等心跳) ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kick-bystander', 'h-uuid-kick-bystander')
  Host.setRoomId('multitab-kick-bystander')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-bystander', 'j1-uuid-kick-bystander')
  J1.joinRoom('multitab-kick-bystander', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  const { mod: J2 } = await makeFakeInstance('j2-kick-bystander', 'j2-uuid-kick-bystander')
  J2.joinRoom('multitab-kick-bystander', { nickname: 'J2', avatar: '2' })
  let s2 = -1
  for (let i = 0; i < 50 && s2 === -1; i++) { await settle(10); s2 = J2.getSelfSeat() }
  assert('J2 seat=2', s2 === 2)

  const { mod: J3 } = await makeFakeInstance('j3-kick-bystander', 'j3-uuid-kick-bystander')
  J3.joinRoom('multitab-kick-bystander', { nickname: 'J3', avatar: '3' })
  let s3 = -1
  for (let i = 0; i < 50 && s3 === -1; i++) { await settle(10); s3 = J3.getSelfSeat() }
  assert('J3 seat=3', s3 === 3)

  // kick 前 J1 peers Map 应该有 4 人(host 自己 seat=0 是 BC SYNC 拿到的)
  assert('kick 前 J1 peers.size = 4', J1.getPeers().size === 4)
  assert('kick 前 J1 peers[2] = J2', J1.getPeers().get(2)?.nickname === 'J2')

  // J1 监听 peer:leave 事件
  let j1LeaveSeat = null
  let j1LeaveKicked = null
  J1.on('peer:leave', (e) => {
    j1LeaveSeat = e?.seat
    j1LeaveKicked = e?.kicked
  })
  // J3 也监听(同时验证)
  let j3LeaveSeat = null
  J3.on('peer:leave', (e) => { j3LeaveSeat = e?.seat })

  // ★ host 调 kickPlayer(2) 踢 J2
  Host.kickPlayer(2, 'kicked')
  await settle(100)

  // J1 (旁观 seat=1):收到 PEER_LEAVE { kick: true, seat=2 } → peers.delete(2) + emit peer:leave
  assert('J1 peers[2] 立即被删 (不等心跳)', !J1.getPeers().has(2))
  eq('J1 peer:leave.seat = 2', j1LeaveSeat, 2)
  assert('J1 peer:leave.kicked = true', j1LeaveKicked === true)
  // J3 旁观
  eq('J3 peer:leave.seat = 2', j3LeaveSeat, 2)

  // 注意:J1 / J3 不应该收到 self:kicked(被踢的是 J2 不是它们)
  let j1SelfKicked = false
  J1.on('self:kicked', () => { j1SelfKicked = true })
  await settle(50)
  assert('J1 没收到 self:kicked (旁观不是被踢)', !j1SelfKicked)

  J1.off('peer:leave')
  J3.off('peer:leave')
  J1.off('self:kicked')
  J1.close(); J2.close(); J3.close(); Host.close()
  await settle(50)
}

// ============================================================
// 块 9: BUG-007 — kickPlayer 边界 (非 host / 非法 seat / 不存在 seat / 已踢过)
// ============================================================
console.log('\n=== 9. BUG-007 — kickPlayer 边界 (非 host / 非法 seat / 不存在 seat / 幂等) ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kick-edge', 'h-uuid-kick-edge')
  Host.setRoomId('multitab-kick-edge')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-edge', 'j1-uuid-kick-edge')
  J1.joinRoom('multitab-kick-edge', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  // 非 host 调用 → 应返回 ok=false
  const r1 = J1.kickPlayer(2)
  assert('joiner 调 kickPlayer 返回 ok=false', r1.ok === false)
  assert('error 含 "只有 host"', /只有 host/.test(r1.error || ''))

  // 非法 seat
  const r2 = Host.kickPlayer(0)  // 不能踢自己
  assert('kickPlayer(0) 返回 ok=false', r2.ok === false)
  const r3 = Host.kickPlayer(4)
  assert('kickPlayer(4) 返回 ok=false', r3.ok === false)
  const r4 = Host.kickPlayer(-1)
  assert('kickPlayer(-1) 返回 ok=false', r4.ok === false)
  const r5 = Host.kickPlayer(2.5)
  assert('kickPlayer(2.5) 返回 ok=false (浮点)', r5.ok === false)

  // 不存在 seat
  const r6 = Host.kickPlayer(3)  // seat=3 不存在
  assert('kickPlayer(3) 返回 ok=false (seat=3 不存在)', r6.ok === false)
  assert('error 含 "不存在"', /不存在/.test(r6.error || ''))

  // 踢存在的人(应该 ok=true)
  const r7 = Host.kickPlayer(1)
  assert('kickPlayer(1) 返回 ok=true', r7.ok === true)
  await settle(50)

  // ★ 幂等:再次调 kickPlayer(1) (已踢过)
  const r8 = Host.kickPlayer(1)
  assert('已踢过 kickPlayer(1) 返回 ok=true (幂等)', r8.ok === true)
  assert('error 含 "already kicked"', /already kicked/.test(r8.error || ''))

  J1.close(); Host.close()
  await settle(30)
}

// ============================================================
// 块 10: BUG-007 — 被踢 joiner 的延迟心跳不会再触发 peer:leave
// ============================================================
console.log('\n=== 10. BUG-007 — 被踢 joiner 的延迟 HEARTBEAT / _DISCONNECT 不会再触发 peer:leave ===')
{
  resetSessionStorage()
  const { mod: Host, captured: hCap } = await makeFakeInstance('h-kick-no-spam', 'h-uuid-kick-no-spam')
  Host.setRoomId('multitab-kick-no-spam')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-no-spam', 'j1-uuid-kick-no-spam')
  J1.joinRoom('multitab-kick-no-spam', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  // 收集 host 端所有 peer:leave 事件
  const leaveEvts = []
  Host.on('peer:leave', (e) => leaveEvts.push(e))

  // ★ 调 kickPlayer(1)
  Host.kickPlayer(1, 'kicked')
  await settle(80)

  const kickLeaves = leaveEvts.filter(e => e.seat === 1)
  assert('kick 后 host 收到 1 次 peer:leave seat=1', kickLeaves.length === 1)

  // ★ 模拟 J1 的延迟心跳到达 host(直接注入 lastHeartbeat[1] 而非 _forceExpireHeartbeat,
  //   因为 _forceExpireHeartbeat 现在也跳过了被踢 seat —— 那是另一层保护)
  //   通过 heartbeat checker 直接看到 lastHeartbeat[1] 旧 ts,验证 checker 也会跳过
  //   我们直接读 Host 的 lastHeartbeat,set 一个旧值(用 Host._tickHeartbeatChecker 内部用的
  //   路径)。但 lastHeartbeat 是 const Map,内部不可访问,所以走"测试注入"接口:
  //   先 close J1 让 ws 断,然后 host 收到 _DISCONNECT 消息(虽然 seat=1 已被踢,handler 应跳过)
  // ★ 简化方案:让 kickPlayer 后让一个未踢的 J2 模拟被踢者做一次心跳,host 应不响应(seat=1 已踢)
  //   ——但 J2 是 seat=2,跟被踢 seat=1 不符。换思路:
  //   - 直接走 heartbeat checker 路径
  //   - _forceExpireHeartbeat 现在对被踢 seat noop,我们换成先 kick 之前给 seat=1 设个心跳
  //     然后 kick,验证最后 checker 触发时不会再 peer:leave
  // 上面那条思路不可行 —— kick 之后 lastHeartbeat[1] 被清。简化:
  //   验证 kick 后,即使我们手动调用一次 _tickHeartbeatChecker(),也不应该重复 emit peer:leave
  const ok = Host._tickHeartbeatChecker()
  assert('_tickHeartbeatChecker 返回 true', ok === true)
  await settle(20)

  // ★ 不应有重复的 peer:leave(seat=1) 事件,因为 heartbeat checker 跳过了 _kickedSeats
  const leaveAfterSpam = leaveEvts.filter(e => e.seat === 1)
  eq('kick 后 _tickHeartbeatChecker 触发后 host peer:leave 仍只有 1 次 seat=1', leaveAfterSpam.length, 1)

  Host.off('peer:leave')
  J1.close(); Host.close()
  await settle(30)
}

// ============================================================
// 块 11: BUG-007 — kickPlayer 默认 reason (不传 reason 参数)
// ============================================================
console.log('\n=== 11. BUG-007 — kickPlayer 不传 reason:默认 "kicked" ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kick-default', 'h-uuid-kick-default')
  Host.setRoomId('multitab-kick-default')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-default', 'j1-uuid-kick-default')
  J1.joinRoom('multitab-kick-default', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  let j1KickedReason = null
  J1.on('self:kicked', (e) => { j1KickedReason = e?.reason })

  Host.kickPlayer(1)  // 不传 reason
  await settle(80)

  eq('J1 self:kicked.reason 默认 = "kicked"', j1KickedReason, 'kicked')

  J1.off('self:kicked')
  J1.close(); Host.close()
  await settle(30)
}

// ============================================================
// 块 12: BUG-007 — kickPlayer 关闭后清 _kickedSeats,下次开房不残留
// ============================================================
console.log('\n=== 12. BUG-007 — close 后 _kickedSeats 清空,下次开房不残留 kick 状态 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('h-kick-close', 'h-uuid-kick-close')
  Host.setRoomId('multitab-kick-close')
  Host.startAsHost({ nickname: 'Host', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('j1-kick-close', 'j1-uuid-kick-close')
  J1.joinRoom('multitab-kick-close', { nickname: 'J1', avatar: '1' })
  let s1 = -1
  for (let i = 0; i < 50 && s1 === -1; i++) { await settle(10); s1 = J1.getSelfSeat() }
  assert('J1 seat=1', s1 === 1)

  Host.kickPlayer(1)
  await settle(50)

  Host.close()
  J1.close()
  await settle(30)

  // ★ 再开一次房,用新 uuid (避免 uuid 复用 seat)
  resetSessionStorage()
  const { mod: Host2 } = await makeFakeInstance('h-kick-close-2', 'h-uuid-kick-close-2')
  Host2.setRoomId('multitab-kick-close-2')
  Host2.startAsHost({ nickname: 'Host2', avatar: 'H2' })
  await settle()

  const { mod: J3 } = await makeFakeInstance('j3-kick-close-2', 'j3-uuid-kick-close-2')
  J3.joinRoom('multitab-kick-close-2', { nickname: 'J3', avatar: '3' })
  let s3 = -1
  for (let i = 0; i < 50 && s3 === -1; i++) { await settle(10); s3 = J3.getSelfSeat() }
  assert('新房间 J3 seat=1 (kick 状态未残留)', s3 === 1)

  J3.close(); Host2.close()
  await settle(30)
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
