/**
 * v0.4.25 对抗性审查(55fb3cc 报告)修复回归测试
 *
 * 覆盖报告 P0/P1 项:
 * - P0-01:UUID 冒名 — host 下发 resumeToken,重连必须 uuid+token;原主在线时
 *   无 token 同 uuid 连接被拒(DUPLICATE_SESSION)且 peers 不被替换
 * - P0-05:RoomView 角色以 network 为准(迁移后的新 host 返回房间不被降级)
 * - P0-07:seat 0 hostAddress 可进入重连缓存
 * - P0-08:snapshot 四手牌之间 card id 全局唯一
 * - P1-01/02:host 候选选举统一走 selectNextHostCandidate,无候选不迁移(不再 ?? 2)
 * - P1-15:横屏 safe-area 四值 shorthand 左右顺序(right→inset-right)
 *
 * 说明:P0-01 用真 WS host/joiner 链路(network.test.js 同款 harness);
 *      P0-05/P1-01/02/P1-15 是 UI/样式修复,用源码字符串断言锁定。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { WebSocket, WebSocketServer } from 'ws'
import { cachePeerHostAddress, getCachedPeerHostAddresses } from './network.js'
import { createGame } from './guandan-game.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const roomViewSrc = fs.readFileSync(path.join(repoRoot, 'src/views/room/RoomView.vue'), 'utf-8')
const desktopSrc = fs.readFileSync(path.join(repoRoot, 'src/views/game/GameViewDesktop.vue'), 'utf-8')
const mobileSrc = fs.readFileSync(path.join(repoRoot, 'src/views/game/GameViewMobile.vue'), 'utf-8')

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

// ============== WS harness(network.test.js 同款) ==============
async function makeInstance(tag) {
  const mod = await import('./network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random())
  const captured = { intervals: [], timeouts: [] }
  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms }); return captured.intervals.length },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms }); return captured.timeouts.length },
    clearTimeout: () => {},
  })
  return { mod, captured }
}

async function makeHost(tag) {
  const { mod } = await makeInstance(tag)
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  mod.setRoomId('test-' + tag)
  mod.startAsHost({ nickname: 'H', avatar: 'H' })
  let bound = null
  const start = Date.now()
  while (Date.now() - start < 2000) {
    const t = mod._getTransport()
    if (t && t.getBoundPort && t.getBoundPort() !== null) { bound = t.getBoundPort(); break }
    await new Promise(r => setTimeout(r, 5))
  }
  if (bound == null) throw new Error('host not ready after 2s')
  return { mod, port: bound }
}

function mockSession(store) {
  globalThis.sessionStorage = {
    _store: store,
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function makeJoiner(tag, hostPort, store, nickname = 'J', avatar = 'J') {
  mockSession(store)
  const { mod } = await makeInstance(tag)
  const { WebSocketTransport } = await import('./network-transport-ws.js?tag=' + tag + '&t=' + Date.now())
  mod._setTransportFactory(() => new WebSocketTransport())
  mod.joinRoom('test-' + tag, { nickname, avatar }, { hostIp: '127.0.0.1', hostPort })
  const start = Date.now()
  let seat = -1
  while (Date.now() - start < 2500) {
    seat = mod.getSelfSeat()
    if (seat >= 1 && seat <= 3) break
    await new Promise(r => setTimeout(r, 5))
  }
  return { mod, seat }
}

async function settle(ms = 100) { await new Promise(r => setTimeout(r, ms)) }

// ============== 1. P0-01:resumeToken 下发与合法重连 ==============
console.log('\n=== 1. P0-01:JOIN 下发 resumeToken,同 uuid+token 重连复用 seat ===')
{
  const { mod: Host, port } = await makeHost('r1')
  const store = { 'guandan_session_uuid': 'victim-uuid' }
  const { mod: V, seat } = await makeJoiner('r1a', port, store, 'V', 'V')
  assert('受害者拿到 seat 1', seat === 1)
  // host 端 token 已生成(不暴露 API,通过行为验证:广播 SYNC 不含 token)
  assert('store 中已存 resumeToken(SYNC 下发)', typeof store['guandan_resume_ws'] === 'string' && store['guandan_resume_ws'].length >= 8)
  const sizeBefore = Host.getPeers().size
  V.close()
  await settle(120)

  // 同一设备(共享 store → 带 token)重连
  const { mod: V2, seat: seat2 } = await makeJoiner('r1b', port, store, 'V2', 'V2')
  await settle(150)
  assert('合法重连复用 seat 1', seat2 === 1)
  assert('peers.size 不增长', Host.getPeers().size === sizeBefore)
  assert('peers[1] 更新为重连者', Host.getPeers().get(1)?.nickname === 'V2')
  Host.close()
  V2.close()
}

// ============== 2. P0-01:冒名攻击 — 原主在线,无 token 同 uuid 被拒 ==============
console.log('\n=== 2. P0-01:原主在线 + 无 token 同 uuid → DUPLICATE_SESSION,peers 不被替换 ===')
{
  const { mod: Host, port } = await makeHost('r2')
  const victimStore = { 'guandan_session_uuid': 'shared-uuid' }
  const { mod: V, seat } = await makeJoiner('r2a', port, victimStore, 'Victim', 'V')
  assert('受害者 seat 1', seat === 1)

  // 攻击者:同 uuid 但全新 store(无 token)
  const atkStore = { 'guandan_session_uuid': 'shared-uuid' }
  const { mod: ATK, seat: atkSeat } = await makeJoiner('r2b', port, atkStore, 'Attacker', 'A')
  await settle(200)
  assert('攻击者拿不到 seat(被拒)', atkSeat === -1)
  assert('host peers[1] 仍是受害者', Host.getPeers().get(1)?.nickname === 'Victim')
  assert('host peers.size 不变(2)', Host.getPeers().size === 2)
  assert('受害者仍持有 seat 1', V.getSelfSeat() === 1)
  Host.close()
  V.close()
  ATK.close()
}

// ============== 3. P0-01:原主已断线 + 无 token 同 uuid → 不顶替,按新玩家分配 ==============
console.log('\n=== 3. P0-01:原主断线 + 无 token 同 uuid → 新 seat,原 entry 保留 ===')
{
  const { mod: Host, port } = await makeHost('r3')
  const victimStore = { 'guandan_session_uuid': 'gone-uuid' }
  const { mod: V, seat } = await makeJoiner('r3a', port, victimStore, 'Gone', 'G')
  assert('原主 seat 1', seat === 1)
  V.close()
  await settle(200)  // 等 host 收 _DISCONNECT

  // 无 token 同 uuid → 不得顶替 seat 1,按新玩家分 seat 2
  const atkStore = { 'guandan_session_uuid': 'gone-uuid' }
  const { mod: ATK, seat: atkSeat } = await makeJoiner('r3b', port, atkStore, 'NewGuy', 'N')
  await settle(150)
  assert('无 token 同 uuid 不顶替原 seat', atkSeat !== 1 && atkSeat >= 2)
  assert('原 peers[1] entry 保留(仍属原主)', Host.getPeers().get(1)?.nickname === 'Gone')
  assert('攻击者作为新 peer 存在', Host.getPeers().get(atkSeat)?.nickname === 'NewGuy')

  // 原主持 token 仍可复用 seat 1
  const { mod: V2, seat: v2Seat } = await makeJoiner('r3c', port, victimStore, 'GoneBack', 'G')
  await settle(150)
  assert('原主持 token 复用 seat 1', v2Seat === 1)
  assert('复用后 peers[1] 更新', Host.getPeers().get(1)?.nickname === 'GoneBack')
  Host.close()
  ATK.close()
  V2.close()
}

// ============== 4. P0-07:seat 0 hostAddress 可缓存 ==============
console.log('\n=== 4. P0-07:seat 0 hostAddress 进入重连缓存 ===')
{
  const store = {}
  globalThis.localStorage = {
    getItem(k) { return store[k] ?? null },
    setItem(k, v) { store[k] = String(v) },
    removeItem(k) { delete store[k] },
  }
  cachePeerHostAddress('room-p007', 0, '192.168.1.5:8848', true)
  const list = getCachedPeerHostAddresses('room-p007')
  assert('seat 0 已缓存', list.length === 1 && list[0].hostAddress === '192.168.1.5:8848')
  // 非法 seat 仍拒绝
  cachePeerHostAddress('room-p007', 4, '192.168.1.6:8848', true)
  cachePeerHostAddress('room-p007', -1, '192.168.1.7:8848', true)
  assert('seat 4 / -1 仍拒绝', getCachedPeerHostAddresses('room-p007').length === 1)
  delete globalThis.localStorage
}

// ============== 5. P0-08:snapshot 全局 card id 唯一 ==============
console.log('\n=== 5. P0-08:snapshot 四手牌 id 全局唯一 ===')
{
  const g1 = createGame({ seats: [0, 1, 2, 3], levelRank: 3, isHost: true, selfSeat: 0, aiPlayers: [], seed: 42 })
  g1.deal(42)
  const snap = g1.getSnapshot()
  assert('正常 snapshot 校验通过', (() => {
    const g2 = createGame({ seats: [0, 1, 2, 3], levelRank: 3, isHost: true, selfSeat: 0, aiPlayers: [], seed: 99 })
    const r = g2.applySnapshot(snap)
    g2.destroy()
    return r.ok === true
  })())
  // 把 seat 0 的一张牌复制到 seat 1(同一实体 id 出现两次)
  const dup = JSON.parse(JSON.stringify(snap))
  dup.hands[1][0] = { ...dup.hands[0][0] }
  const g3 = createGame({ seats: [0, 1, 2, 3], levelRank: 3, isHost: true, selfSeat: 0, aiPlayers: [], seed: 99 })
  const r3 = g3.applySnapshot(dup)
  assert('跨手牌重复 id 被拒绝', r3.ok === false)
  g3.destroy()
  g1.destroy()
}

// ============== 6. P0-05:RoomView 角色以 network 为准 ==============
console.log('\n=== 6. P0-05:RoomView 活跃 session 角色以 network 为准(源码断言) ===')
{
  assert('RoomView 进入时检测活跃 session', roomViewSrc.includes('sessionActiveAtEntry'))
  assert('isHost 初始化以 network 为准',
    roomViewSrc.includes('sessionActiveAtEntry ? net.isHost() : route.query.role !== \'joiner\''))
}

// ============== 7. P1-01/02:候选选举统一 + 无候选不迁移 ==============
console.log('\n=== 7. P1-01/02:两端候选选举走 selectNextHostCandidate,无 ?? 2(源码断言) ===')
{
  for (const [name, src] of [['Desktop', desktopSrc], ['Mobile', mobileSrc]]) {
    assert(`${name} 用 net.selectNextHostCandidate 选举`, src.includes('net.selectNextHostCandidate([selfSeat])'))
    assert(`${name} 无候选不迁移(?? null)`, src.includes('?? null'))
    assert(`${name} 迁移候选不再默认 seat 2`, !src.includes('peers.has(s)) ?? 2'))
  }
}

// ============== 8. P1-15:横屏 safe-area 左右顺序 ==============
console.log('\n=== 8. P1-15:safe-area 四值 shorthand 左右正确(源码断言) ===')
{
  // 四值顺序 top right bottom left:第 2 值(右侧)必须 inset-right
  const hudLine = mobileSrc.match(/\.page\.is-landscape \.hud-top \{[\s\S]*?padding: ([^;]+);/)
  assert('hud-top 右侧用 inset-right', !!hudLine && hudLine[1].includes('calc(6px + env(safe-area-inset-right, 0px)) 4px'))
  const handLine = mobileSrc.match(/\.page\.is-landscape \.hand-area \{[\s\S]*?padding: ([^;]+);/)
  assert('hand-area 右侧用 inset-right', !!handLine && handLine[1].includes('env(safe-area-inset-right'))
  const actionLine = mobileSrc.match(/\.page\.is-landscape \.action-bar \{[\s\S]*?padding: ([^;]+);/)
  assert('action-bar 用 inset-right', !!actionLine && actionLine[1].includes('env(safe-area-inset-right'))
}

console.log(`\n========== v0.4.25 对抗性审查修复测试: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
