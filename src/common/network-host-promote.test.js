/**
 * v3.x P2-29(N-3 闭环)测试
 *
 * 覆盖:
 *   - requestPromoteToHost:joiner 端可调,host 端调返回 false
 *   - PROMOTE_HOST_REQUEST:被选中的 joiner 升为 host
 *   - PROMOTE_HOST_REQUEST:旁观者更新 peers Map
 *   - 竞态:seat 0 已有新 host 时后到者让位
 *   - requestPromoteToHost 接受 snapshot
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}\n    期望: ${JSON.stringify(b)}\n    实际: ${JSON.stringify(a)}`); fail++ }
}

async function makeFakeInstance(tag, fixedUuid) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  if (fixedUuid !== undefined) {
    globalThis.sessionStorage = {
      _store: { 'guandan_session_uuid': fixedUuid },
      getItem(k) { return this._store[k] || null },
      setItem(k, v) { this._store[k] = v },
    }
  }
  return { mod }
}
function resetSessionStorage() {
  globalThis.sessionStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}
async function settle(ms = 50) { await new Promise(r => setTimeout(r, ms)) }

console.log('\n=== 1. requestPromoteToHost API 签名 + 基础行为 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('p29-host', 'p29-host-uuid')
  Host.setRoomId('p29-r1')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  assert('host 已开房 isHost=true', Host.isHost() === true)
  // host 端调 requestPromoteToHost 应该返回 false
  const r1 = Host.requestPromoteToHost({ test: 1 })
  assert('host 调 requestPromoteToHost 返回 false', r1 === false)
  // 函数存在
  assert('requestPromoteToHost 是函数', typeof Host.requestPromoteToHost === 'function')
  assert('requestPromoteToHost.length === 1 (snapshot)', Host.requestPromoteToHost.length === 1)
}

console.log('\n=== 2. joiner 端调 requestPromoteToHost → 自己升为 host ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('p29b-host', 'p29b-host-uuid')
  Host.setRoomId('p29b-r1')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('p29b-j1', 'p29b-j1-uuid')
  J1.joinRoom('p29b-r1', { nickname: 'J1', avatar: '1' })
  await settle()
  assert('J1 seat=1', J1.getSelfSeat() === 1)
  assert('J1 isHost=false', J1.isHost() === false)

  // 先注册 on
  let migratedPayload = null
  J1.on('host:migrated', (p) => { migratedPayload = p })

  // J1 调 requestPromoteToHost
  const snap = { hands: 'mock', currentPlayer: 1, levelRank: 14 }
  const r = J1.requestPromoteToHost(snap)
  assert('joiner 调 requestPromoteToHost 返回 true', r === true)
  await settle()

  // J1 应该升为 host,但 logical seat 保持 1(座位稳定)
  assert('J1 升级后 isHost=true', J1.isHost() === true)
  assert('J1 升级后 selfSeat 保持 1', J1.getSelfSeat() === 1)
  assert('J1 升级后 hostSeat = 1', J1.getHostSeat() === 1)
  assert('J1 收到 host:migrated', migratedPayload !== null)
  assert('host:migrated.isMyself=true', migratedPayload?.isMyself === true)
  assert('host:migrated.snapshot 含 hands', migratedPayload?.snapshot?.hands === 'mock')
}

console.log('\n=== 3. 旁观者 joiner 收到 PROMOTE_HOST_REQUEST → 更新 peers Map ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('p29c-host', 'p29c-host-uuid')
  Host.setRoomId('p29c-r1')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('p29c-j1', 'p29c-j1-uuid')
  J1.joinRoom('p29c-r1', { nickname: 'J1', avatar: '1' })
  await settle()

  const { mod: J2 } = await makeFakeInstance('p29c-j2', 'p29c-j2-uuid')
  J2.joinRoom('p29c-r1', { nickname: 'J2', avatar: '2' })
  await settle()
  assert('J2 seat=2', J2.getSelfSeat() === 2)

  // J2 先注册 on
  let j2MigratedPayload = null
  J2.on('host:migrated', (p) => { j2MigratedPayload = p })

  // J1 调 requestPromoteToHost 让自己当 host
  J1.requestPromoteToHost({ levelRank: 14, currentPlayer: 1 })
  await settle()

  // J2 应该收到 host:migrated { isMyself: false }
  assert('J2 旁观者收到 host:migrated', j2MigratedPayload !== null)
  assert('J2 旁观者 isMyself=false', j2MigratedPayload?.isMyself === false)
  assert('J2 旁观者 newHostSeat=1', j2MigratedPayload?.newHostSeat === 1)
  assert('J2 旁观者 hostSeat = 1', J2.getHostSeat() === 1)
}

console.log('\n=== 4. 竞态:seat 0 已有新 host 时后到 joiner 让位 ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('p29d-host', 'p29d-host-uuid')
  Host.setRoomId('p29d-r1')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle()

  const { mod: J1 } = await makeFakeInstance('p29d-j1', 'p29d-j1-uuid')
  J1.joinRoom('p29d-r1', { nickname: 'J1', avatar: '1' })
  await settle()

  const { mod: J2 } = await makeFakeInstance('p29d-j2', 'p29d-j2-uuid')
  J2.joinRoom('p29d-r1', { nickname: 'J2', avatar: '2' })
  await settle()
  const { mod: J3 } = await makeFakeInstance('p29d-j3', 'p29d-j3-uuid')
  J3.joinRoom('p29d-r1', { nickname: 'J3', avatar: '3' })
  await settle()

  // J1 先升
  J1.requestPromoteToHost({ first: true })
  await settle()
  assert('J1 先到升 host', J1.isHost() === true)
  assert('J1 selfSeat 保持 1(座位稳定)', J1.getSelfSeat() === 1)
  assert('J1 hostSeat = 1', J1.getHostSeat() === 1)

  // J2 后调,seat 0 已被 J1 占 → J2 不应升级
  const j2SeatBefore = J2.getSelfSeat()
  J2.requestPromoteToHost({ second: true })
  await settle()
  assert('J2 后到不升级,seat 不变', J2.getSelfSeat() === j2SeatBefore)
  assert('J2 后到仍 isHost=false', J2.isHost() === false)
  assert('J2 后到 hostSeat 指向 J1(seat 1)', J2.getHostSeat() === 1)
}

console.log('\n=== 5. requestPromoteToHost 接受 null snapshot ===')
{
  resetSessionStorage()
  const { mod: Host } = await makeFakeInstance('p29e-host', 'p29e-host-uuid')
  Host.setRoomId('p29e-r1')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  await settle()
  const { mod: J1 } = await makeFakeInstance('p29e-j1', 'p29e-j1-uuid')
  J1.joinRoom('p29e-r1', { nickname: 'J1', avatar: '1' })
  await settle()
  // 不传 snapshot
  const r = J1.requestPromoteToHost()
  assert('joiner 不传 snapshot 调也返回 true', r === true)
  await settle()
  assert('J1 仍升为 host', J1.isHost() === true)
  assert('J1 selfSeat 仍保持 1(座位稳定)', J1.getSelfSeat() === 1)
}

console.log(`\n========== network-host-promote 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
// BroadcastChannel 持续运行(心跳 timer),100ms 后强制退出
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 100)
