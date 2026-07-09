/**
 * host 迁移后牌局继续 — 网络层行为测试(Phase 4 补强)
 *
 * 场景:BC transport 下 1 host + 2 joiner,原 host 主动把房主让给 seat 2,
 *      验证新 host 上任后仍能广播消息,旁观者能收到,牌局网络不中断。
 *
 * 用法: node src/common/network-host-migration-consecutive.test.js
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(` PASS ${name}`); pass++ }
  else { console.log(` FAIL ${name}`); fail++ }
}

async function makeInstance(tag, fixedUuid) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  if (fixedUuid !== undefined) {
    globalThis.sessionStorage = {
      _store: { 'guandan_session_uuid': fixedUuid },
      getItem(k) { return this._store[k] || null },
      setItem(k, v) { this._store[k] = v },
    }
  }
  return mod
}

function resetSessionStorage() {
  globalThis.sessionStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function settle(ms = 80) {
  await new Promise(r => setTimeout(r, ms))
}

console.log('\n=== host 迁移后连续对局:网络层行为 ===')
{
  resetSessionStorage()
  const roomId = 'mig-consecutive-' + Date.now()

  // 1. host 开房
  const Host = await makeInstance('host-mig', 'host-uuid-mig')
  Host.setRoomId(roomId)
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle()
  assert('host selfSeat = 0', Host.getSelfSeat() === 0)
  assert('host isHost = true', Host.isHost() === true)

  // 2. 两个 joiner 进房
  const J1 = await makeInstance('j1-mig', 'j1-uuid-mig')
  J1.joinRoom(roomId, { nickname: 'J1', avatar: '1' })
  await settle()

  const J2 = await makeInstance('j2-mig', 'j2-uuid-mig')
  J2.joinRoom(roomId, { nickname: 'J2', avatar: '2' })
  await settle()

  assert('J1 拿到 seat 1', J1.getSelfSeat() === 1)
  assert('J2 拿到 seat 2', J2.getSelfSeat() === 2)
  assert('Host peers.size = 3(host + 2 joiners)', Host.getPeers().size === 3)

  // 3. 监听 host:migrated 事件
  const j1Migrated = { fired: false, payload: null }
  const j2Migrated = { fired: false, payload: null }
  J1.on('host:migrated', (p) => { j1Migrated.fired = true; j1Migrated.payload = p })
  J2.on('host:migrated', (p) => { j2Migrated.fired = true; j2Migrated.payload = p })

  // 4. 原 host 主动让位给 seat 2(J2)
  Host.requestHostMigration(2, { testSnapshot: true })
  await settle()

  // 5. 验证迁移结果
  assert('J1 收到 host:migrated', j1Migrated.fired === true)
  assert('J2 收到 host:migrated', j2Migrated.fired === true)
  assert('J1 的 payload.isMyself = false', j1Migrated.payload?.isMyself === false)
  assert('J2 的 payload.isMyself = true', j2Migrated.payload?.isMyself === true)
  assert('J1 payload.newHostSeat = 2', j1Migrated.payload?.newHostSeat === 2)
  assert('J2 payload.newHostSeat = 2', j2Migrated.payload?.newHostSeat === 2)
  assert('J1 payload 携带 snapshot', j1Migrated.payload?.snapshot?.testSnapshot === true)

  assert('J2 迁移后 selfSeat = 0', J2.getSelfSeat() === 0)
  assert('J2 迁移后 isHost = true', J2.isHost() === true)
  assert('J1 迁移后 selfSeat 仍为 1', J1.getSelfSeat() === 1)
  assert('J1 迁移后 isHost = false', J1.isHost() === false)

  // 6. 新 host(J2) 广播一条游戏消息,验证旁观者 J1 能收到 → 牌局网络可继续
  const j1Msg = { received: false, payload: null }
  J1.on('message:TEST_CONTINUE', (p) => { j1Msg.received = true; j1Msg.payload = p })
  J2.broadcast({ type: 'TEST_CONTINUE', payload: { from: 'new-host', round: 2 } })
  await settle()

  assert('J1 收到新 host 的 TEST_CONTINUE 广播', j1Msg.received === true)
  assert('广播 payload 完整', j1Msg.payload?.from === 'new-host' && j1Msg.payload?.round === 2)

  // 7. 新 host peers Map 仍包含所有人(含旧 host seat)
  const j2Peers = J2.getPeers()
  assert('新 host peers 仍含 J1(seat 1)', j2Peers.has(1) === true)
  assert('新 host peers 仍含旧 host 信息(seat 0)', j2Peers.has(0) === true)

  // cleanup
  try { Host.close() } catch (e) {}
  try { J1.close() } catch (e) {}
  try { J2.close() } catch (e) {}
}

console.log(`\n========== host 迁移连续对局测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
