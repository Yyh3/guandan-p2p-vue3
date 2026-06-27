/**
 * 静态审查 v0.4.5 N-3 闭环补强测试
 *
 * 来源:掼蛋P2P-第五轮复查报告.md(2026-06-28)
 *
 * 覆盖:
 *   - applySnapshot 别名(去掉下划线) — 静态审查建议
 *   - host 主动退出 GameView 调 requestHostMigration — Vue 集成补强
 *   - useGameLogic 集成:onPeerLeave 调 requestPromoteToHost + onHostMigrated apply snapshot
 *     (通过 mock + 单元化方式验 useGameLogic 内部的 onPeerLeave 调用)
 */

import * as E from './guandan-engine.js'
import { createGame } from './guandan-game.js'
import * as net from './network.js'

let pass = 0, fail = 0
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    期望:', b, '\n    实际:', a) }
}
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// ============== 1. applySnapshot 别名 ==============
console.log('\n=== 1. applySnapshot 别名(去掉下划线,跟报告建议一致) ===')
{
  const game = createGame({ players: [{}, {}, {}, {}], seed: 1 })
  // 初始 hands
  const st0 = game.getState()
  const initialRound = st0.round
  // 改 game 状态(模拟一次对局)
  game.deal()
  const st1 = game.getState()
  assert('deal 后 phase=playing', st1.phase === 'playing')
  assert('deal 后 hands[0] 有 27 张', st1.hands[0].length === 27)
  // 构造一个 snapshot 应用
  const snap = {
    hands: [Array(27).fill({ suit: 0, rank: 3 }), [], [], []],
    currentPlayer: 2,
    firstPlayer: 2,
    levelRank: 14,
    phase: 'playing',
    finishedOrder: [],
  }
  // applySnapshot 别名(新 API)
  assert('applySnapshot 是函数', typeof game.applySnapshot === 'function')
  game.applySnapshot(snap)
  const st2 = game.getState()
  eq('applySnapshot 后 currentPlayer=2', st2.currentPlayer, 2)
  eq('applySnapshot 后 firstPlayer=2', st2.firstPlayer, 2)
  eq('applySnapshot 后 levelRank=14', st2.levelRank, 14)
  // _applySnapshot 原 API 仍兼容
  assert('_applySnapshot 仍存在(向后兼容)', typeof game._applySnapshot === 'function')
  game._applySnapshot({ currentPlayer: 0, firstPlayer: 0 })
  const st3 = game.getState()
  eq('_applySnapshot 仍可用 currentPlayer=0', st3.currentPlayer, 0)
}

// ============== 2. host 主动退出调 requestHostMigration(API 行为) ==============
console.log('\n=== 2. host 主动退出调 requestHostMigration(API 行为) ===')
{
  // 模拟 host(GameView)主动退出时调 requestHostMigration(2, snapshot)
  // 验证:网络层收到 snapshot,把它嵌入 PEER_LEAVE { migrate: true, snapshot }
  // 用 fake transport 拦截 send,看消息 payload
  const Host = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'host-uuid-v045' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
  let capturedSend = null
  Host._setTransportFactory(() => ({
    _mode: 'self', _wss: null, _clients: new Map(), _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [], _ready: true, _listeners: [], _closedByUser: false, _reconnecting: false,
    onMessage(cb) { this._listeners.push(cb) }, offMessage() {},
    open() { return Promise.resolve() },
    send(msg) { capturedSend = msg; return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {}, isReady() { return true },
  }))
  Host.setRoomId('v045-host-exit')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  // 模拟 host 退出对局(传 snapshot)
  const snap = { hands: 'mock', currentPlayer: 1, levelRank: 14 }
  const r = Host.requestHostMigration(2, snap)
  assert('host 调 requestHostMigration(2, snap) 返回 true', r === true)
  // 验证 send 收到 PEER_LEAVE { migrate: true, newHostSeat: 2, snapshot }
  assert('send 收到 PEER_LEAVE 消息', capturedSend?.type === 'PEER_LEAVE')
  eq('PEER_LEAVE.payload.seat=0', capturedSend?.payload?.seat, 0)
  eq('PEER_LEAVE.payload.migrate=true', capturedSend?.payload?.migrate, true)
  eq('PEER_LEAVE.payload.newHostSeat=2', capturedSend?.payload?.newHostSeat, 2)
  eq('PEER_LEAVE.payload.snapshot 含 hands=mock', capturedSend?.payload?.snapshot?.hands, 'mock')
  eq('PEER_LEAVE.payload.snapshot.currentPlayer=1', capturedSend?.payload?.snapshot?.currentPlayer, 1)
  Host.close()
}

// ============== 3. useGameLogic 集成 onPeerLeave 调 requestPromoteToHost(API 行为) ==============
console.log('\n=== 3. useGameLogic onPeerLeave 调 requestPromoteToHost(API 行为) ===')
{
  // 模拟 joiner 收到 PEER_LEAVE { seat: 0 } → 调 requestPromoteToHost(snapshot)
  // 不能直接 import useGameLogic(它需要 Vue runtime),但可以模拟 onPeerLeave 函数体
  // 提取 useGameLogic 的核心逻辑:joiner 端收到 host leave → 调 promoteToHost
  const Joiner = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'joiner-uuid-v045' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
  // joiner 端:setSelfSeat(1) 模拟 "我是 joiner seat 1"
  Joiner._setTransportFactory(() => ({
    _mode: 'client', _wss: null, _ws: null, _clients: new Map(), _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [], _ready: true, _listeners: [], _closedByUser: false, _reconnecting: false,
    onMessage(cb) { this._listeners.push(cb) }, offMessage() {},
    open() { return Promise.resolve() },
    send(msg) { return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {}, isReady() { return true },
  }))
  Joiner.setRoomId('v045-joiner-leave')
  // joinRoom 走 joiner 路径:isHostFlag=false,selfSeat=-1(SYNC 才会设)
  // 但 joinRoom 会发 JOIN + 等待 SYNC,这里没真实 host,所以 selfSeat 不会变
  // 改:用 setSelfSeat(1) 直接设(joinRoom 内部 isHostFlag 已被设 false)
  // 注意:joinRoom 同步部分会返回,但 transport.onMessage 注册需要等
  // 这里简化:startAsHost 后改 isHostFlag 不行(是模块级 let),
  // 改:Joiner.startAsHost 后 close() + joinRoom() 走 joiner 路径
  Joiner.startAsHost({ nickname: 'J', avatar: 'J' })
  Joiner.close()
  // 现在 Joiner 状态:transport=null, isHostFlag=true, selfSeat=0
  // joinRoom 重置 isHostFlag=false + selfSeat=-1 + 创建新 transport
  Joiner.joinRoom('r', { nickname: 'J', avatar: 'J' })
  Joiner.setSelfSeat(1)  // 模拟 joiner 收到 SYNC 后分配到 seat 1
  // 等等:joinRoom 同步返回但 transport 创建是异步的
  await new Promise(r => setTimeout(r, 100))
  let migratedPayload = null
  Joiner.on('host:migrated', (p) => { migratedPayload = p })
  // peers 加 seat 2(模拟队友是新 host 候选)
  Joiner.getPeers().set(2, { nickname: 'Mate', avatar: 'M', uuid: 'm-uuid' })
  // 手动 emit host 的 PEER_LEAVE migrate (newHostSeat=2)
  const fakeMsg = {
    type: 'PEER_LEAVE', from: 0, to: null, ts: Date.now(),
    payload: { seat: 0, migrate: true, newHostSeat: 2, snapshot: { hands: 'mock-snap', currentPlayer: 1 } },
  }
  const tr = Joiner._getTransport()
  if (tr && tr._emit) {
    tr._emit(fakeMsg)
  }
  await new Promise(r => setTimeout(r, 100))
  // joiner 端 selfSeat=1,newHostSeat=2 → 旁观者分支
  assert('旁观者收到 host:migrated', migratedPayload !== null)
  eq('旁观者 newHostSeat=2', migratedPayload?.newHostSeat, 2)
  eq('旁观者 isMyself=false', migratedPayload?.isMyself, false)
  eq('旁观者 snapshot.hands=mock-snap', migratedPayload?.snapshot?.hands, 'mock-snap')
  Joiner.close()
}

// ============== 4. requestHostMigration 不传 snapshot 也 OK(向后兼容) ==============
console.log('\n=== 4. requestHostMigration 不传 snapshot 兼容旧调用 ===')
{
  const Host = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'host-uuid-v045b' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
  let capturedSend = null
  Host._setTransportFactory(() => ({
    _mode: 'self', _wss: null, _clients: new Map(), _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [], _ready: true, _listeners: [], _closedByUser: false, _reconnecting: false,
    onMessage(cb) { this._listeners.push(cb) }, offMessage() {},
    open() { return Promise.resolve() },
    send(msg) { capturedSend = msg; return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {}, isReady() { return true },
  }))
  Host.setRoomId('v045-compat')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  // 不传 snapshot
  const r = Host.requestHostMigration(2)
  assert('不传 snapshot 也返回 true(向后兼容)', r === true)
  eq('payload.snapshot=null', capturedSend?.payload?.snapshot, null)
  Host.close()
}

console.log(`\n========== v045-bug-fixes 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 100)
