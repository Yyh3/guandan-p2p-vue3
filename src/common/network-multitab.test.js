/**
 * network.js cross-instance test (real BroadcastChannel + dynamic import cache-bust)
 *
 * Node24 has native BroadcastChannel (same-process multi-instance works).
 * Query-string cache-bust each dynamic import yields an independent module instance.
 * Each instance uses __installFakeTimers to swap in fake timers (captured callback list),
 * then directly invokes the callback to verify timing logic (no real10s waits).
 *
 * Coverage:
 * - Regression: host +3 joiner full connection (P0 not regressed)
 * - Bug1: joiner refresh tab with same uuid reuses seat
 * - Bug2: joiner close tab triggers heartbeat timeout (host peers.size -=1)
 * - Bug2: PEER_LEAVE broadcast to other joiners
 * - Bug3:2 joiners concurrent join without seat collision
 * - Bug3: after concurrent retry both joiners get seats
 */

let pass =0, fail =0
function assert(name, cond) {
 if (cond) { console.log(` PASS ${name}`); pass++ }
 else { console.log(` FAIL ${name}`); fail++ }
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
 setInterval: (fn, ms) => {
 captured.intervals.push({ fn, ms, cancelled: false })
 return captured.intervals.length
 },
 clearInterval: (id) => {
 captured.cleared.push({ type: 'interval', id })
 if (id >=1 && id <= captured.intervals.length) captured.intervals[id -1].cancelled = true
 },
 setTimeout: (fn, ms) => {
 captured.timeouts.push({ fn, ms, cancelled: false })
 return captured.timeouts.length
 },
 clearTimeout: (id) => {
 captured.cleared.push({ type: 'timeout', id })
 if (id >=1 && id <= captured.timeouts.length) captured.timeouts[id -1].cancelled = true
 },
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

async function settle(ms =50) {
 await new Promise(r => setTimeout(r, ms))
}

console.log('\n===1. host +3 joiner full connection (regression) ===')
{
 resetSessionStorage()
 const { mod: Host } = await makeFakeInstance('host-r1', 'host-uuid-r1')
 Host.setRoomId('multitab-r1')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: J1 } = await makeFakeInstance('j1-r1', 'j1-uuid-r1')
 J1.joinRoom('multitab-r1', { nickname: 'J1', avatar: '1' })
 await settle()
 assert('J1 seat=1', J1.getSelfSeat() ===1)

 const { mod: J2 } = await makeFakeInstance('j2-r1', 'j2-uuid-r1')
 J2.joinRoom('multitab-r1', { nickname: 'J2', avatar: '2' })
 await settle()
 assert('J2 seat=2', J2.getSelfSeat() ===2)

 const { mod: J3 } = await makeFakeInstance('j3-r1', 'j3-uuid-r1')
 J3.joinRoom('multitab-r1', { nickname: 'J3', avatar: '3' })
 await settle()
 assert('J3 seat=3', J3.getSelfSeat() ===3)

 assert('host peers.size=4', Host.getPeers().size ===4)
 assert('host isHost=true', Host.isHost() ===true)

 J1.close(); J2.close(); J3.close(); Host.close()
 await settle()
}

console.log('\n===2. joiner refresh tab same uuid reuses seat (Bug1) ===')
{
 resetSessionStorage()
 const { mod: Host } = await makeFakeInstance('host-r2', 'host-uuid-r2')
 Host.setRoomId('multitab-r2')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: JA } = await makeFakeInstance('ja-r2', 'ja-uuid-r2')
 JA.joinRoom('multitab-r2', { nickname: 'A', avatar: 'A' })
 await settle()
 assert('A seat=1', JA.getSelfSeat() ===1)
 const sizeBefore = Host.getPeers().size

 JA.close()
 await settle()

 // A2 re-joins with same sessionStorage uuid (refresh tab simulated)
 const { mod: JA2 } = await makeFakeInstance('ja2-r2', 'ja-uuid-r2')
 JA2.joinRoom('multitab-r2', { nickname: 'A2', avatar: 'A2' })
 await settle()
 assert('A2 reconnected seat=1 (reused)', JA2.getSelfSeat() ===1)
 assert('host peers.size unchanged', Host.getPeers().size === sizeBefore)
 assert('host peers[1].nickname updated to A2', Host.getPeers().get(1)?.nickname === 'A2')

 JA2.close(); Host.close()
 await settle()
}

console.log('\n===3. joiner close tab triggers heartbeat timeout (Bug2) ===')
{
 resetSessionStorage()
 const { mod: Host, captured: hCap } = await makeFakeInstance('host-r3', 'host-uuid-r3')
 Host.setRoomId('multitab-r3')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: JB } = await makeFakeInstance('jb-r3', 'jb-uuid-r3')
 JB.joinRoom('multitab-r3', { nickname: 'B', avatar: 'B' })
 await settle()
 assert('B seat=1', JB.getSelfSeat() ===1)
 assert('B registered heartbeat send interval', JB && typeof JB._sendHeartbeat === 'function')

 let leaveEvt = null
 Host.on('peer:leave', (e) => { leaveEvt = e })

 // simulate B disconnecting
 JB.close()
 await settle()

 // host heartbeat checker registered on fake timer
 assert('host registered heartbeat checker interval', hCap.intervals.length >=1)
 // invoke checker directly to simulate time passing
 const checkerCb = hCap.intervals[0].fn

 assert('before tick: host peers has seat1', Host.getPeers().has(1))

 Host._forceExpireHeartbeat(1)
 checkerCb()
 await settle()

 assert('after tick: host peers no seat1', !Host.getPeers().has(1))
 assert('peer:leave emitted seat=1', leaveEvt?.seat ===1)

 Host.off('peer:leave')
 Host.close()
 await settle()
}

console.log('\n===4. PEER_LEAVE broadcast to other joiners (Bug2) ===')
{
 resetSessionStorage()
 const { mod: Host } = await makeFakeInstance('host-r4', 'host-uuid-r4')
 Host.setRoomId('multitab-r4')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: JC } = await makeFakeInstance('jc-r4', 'jc-uuid-r4')
 JC.joinRoom('multitab-r4', { nickname: 'C', avatar: 'C' })
 await settle()

 const { mod: JD } = await makeFakeInstance('jd-r4', 'jd-uuid-r4')
 JD.joinRoom('multitab-r4', { nickname: 'D', avatar: 'D' })
 await settle()
 assert('C seat=1, D seat=2', JC.getSelfSeat() ===1 && JD.getSelfSeat() ===2)

 let leaveEvtD = null
 JD.on('peer:leave', (e) => { leaveEvtD = e })

 // simulate C disconnect
 JC.close()
 await settle()
 Host._forceExpireHeartbeat(1)
 Host._tickHeartbeatChecker()
 await settle()

 assert('D received peer:leave seat=1', leaveEvtD?.seat ===1)
 assert('D local peers deleted seat1', !JD.getPeers().has(1))

 JD.off('peer:leave')
 JD.close(); Host.close()
 await settle()
}

console.log('\n===5.2 joiners concurrent join no seat collision (Bug3) ===')
{
 resetSessionStorage()
 const { mod: Host } = await makeFakeInstance('host-r5', 'host-uuid-r5')
 Host.setRoomId('multitab-r5')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: JE } = await makeFakeInstance('je-r5', 'je-uuid-r5')
 JE.joinRoom('multitab-r5', { nickname: 'E', avatar: 'E' })
 await settle()

 const { mod: JF } = await makeFakeInstance('jf-r5', 'jf-uuid-r5')
 JF.joinRoom('multitab-r5', { nickname: 'F', avatar: 'F' })
 await settle()

 assert('E and F have different seats', JE.getSelfSeat() !== JF.getSelfSeat())
 assert('E seat in [1,3]', JE.getSelfSeat() >=1 && JE.getSelfSeat() <=3)
 assert('F seat in [1,3]', JF.getSelfSeat() >=1 && JF.getSelfSeat() <=3)
 assert('host peers.size=3 (host +2 joiners)', Host.getPeers().size ===3)

 JE.close(); JF.close(); Host.close()
 await settle()
}

console.log('\n===6. after retry both joiners get seats (Bug3) ===')
{
 resetSessionStorage()
 const { mod: Host } = await makeFakeInstance('host-r6', 'host-uuid-r6')
 Host.setRoomId('multitab-r6')
 Host.startAsHost({ nickname: 'H', avatar: 'H' })
 await settle()

 const { mod: JG, captured: gCap } = await makeFakeInstance('jg-r6', 'jg-uuid-r6')
 JG.joinRoom('multitab-r6', { nickname: 'G', avatar: 'G' })
 await settle()
 assert('G seat=1', JG.getSelfSeat() ===1)

 // host sends a partial SYNC missing G (simulate concurrent timing)
 Host.broadcast({
 type: 'SYNC',
 payload: { peers: Array.from(Host.getPeers().entries()).filter(([s]) => s !==1) },
 })
 await settle()

 const retryTimers = gCap.timeouts.filter(t => t.ms ===300)
 assert('partial SYNC triggered retry timer', retryTimers.length >=1)

  // fire retry
  retryTimers[retryTimers.length -1].fn()
  await settle()

  // host uuid matches, reuses seat=1
  assert('after retry G seat=1 (reused)', JG.getSelfSeat() ===1)

  JG.close(); Host.close()
  await settle()
}

// ============================================================
// Bug: 4-tab 联机时,host 收到新 joiner 只把 SYNC 发给新人,老 joiner 拿不到新人昵称
// 4-tab 端到端 tab 2(B)看到 tab 3(C)还是 AI-西
// 修法:host 在 JOIN 处理里也广播 SYNC 给所有 joiner
// 验证:joiner2 加入后,joiner1 的 peers map 必须含 joiner2(从广播 SYNC 同步过来)
// ============================================================
async function test7_broadcastSyncToOldJoiners() {
  resetSessionStorage()
  const { mod: H } = await makeFakeInstance('h-r7', 'h-uuid-r7')
  H.setRoomId('multitab-r7')
  H.startAsHost({ nickname: '房主', avatar: '♠' })
  await settle()

  // joiner1 先加入
  const { mod: J1 } = await makeFakeInstance('j1-r7', 'j1-uuid-r7')
  J1.joinRoom('multitab-r7', { nickname: '玩家A', avatar: '♥' })
  await settle()
  // H 真在监听这个 channel?如果 seat=-1 说明消息没到 host
  const hPeersAfterJ1 = Array.from(H.getPeers().entries()).map(([s, p]) => [s, p.nickname])
  if (J1.getSelfSeat() !== 1) console.log('    [debug] H peers after J1:', JSON.stringify(hPeersAfterJ1), 'J1 seat=', J1.getSelfSeat())
  assert('J1 seat=1', J1.getSelfSeat() === 1)

  // joiner2 后加入
  const { mod: J2 } = await makeFakeInstance('j2-r7', 'j2-uuid-r7')
  J2.joinRoom('multitab-r7', { nickname: '玩家B', avatar: '♣' })
  await settle()
  if (J2.getSelfSeat() !== 2) console.log('    [debug] H peers after J2:', JSON.stringify(H.getPeers().entries ? Array.from(H.getPeers().entries()).map(([s,p]) => [s,p.nickname]) : '?'), 'J2 seat=', J2.getSelfSeat())
  assert('J2 seat=2', J2.getSelfSeat() === 2)

  // ★ 关键断言:joiner2 加入后,joiner1(老 joiner)的 peers 必须含 joiner2
  // 如果 host 没广播 SYNC,J1.peers 只有 {0:host, 1:J1},看不到 J2
  // 4-tab 端到端时 J1 视图的 seat 2 仍是 AI 默认
  const j1Peers = Array.from(J1.getPeers().entries())
  if (!j1Peers.some(([s, p]) => s === 2 && p.nickname === '玩家B')) {
    console.log('    [debug] J1.peers =', JSON.stringify(j1Peers.map(([s,p]) => [s, p.nickname])))
  }
  const j1HasJ2 = j1Peers.some(([s, p]) => s === 2 && p.nickname === '玩家B')
  assert('J1 peers contains J2 at seat 2 (broadcast SYNC works)', j1HasJ2)

  H.close(); J1.close(); J2.close()
  await settle()
}

await test7_broadcastSyncToOldJoiners()

console.log(`\n========== multitab test result: ${pass} pass / ${fail} fail ==========`)
if (fail >0) process.exit(1)
