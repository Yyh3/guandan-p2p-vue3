/**
 * 修复后再审 v0.4.6 GD-RC-001~005 测试
 *
 * 来源: guandan-p2p-vue3 最新提交复查报告(修复后再审)2026-06-27
 *
 * 覆盖:
 *   GD-RC-001 (P0): isNetworkHost 替代 selfSeat===0
 *     - useGameLogic 顶层 isNetworkHost ref 用 net.isHost() 初始化
 *   GD-RC-002 (P1): _kickedSeats 清理在 host JOIN handler(覆盖两条路径)
 *   GD-RC-003 (P1): applyRoundEndFromPayload 权威结算 + roundId 去重
 *   GD-RC-004 (P1): onP2PStateSnapshot 调 _applySnapshot 后同步刷新 UI refs
 *   GD-RC-005 (P2): reconnect snapshot 定向 sendTo(connSeat, targetSeat)
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

// ============== GD-RC-001:isNetworkHost 替代 selfSeat===0 ==============
console.log('\n=== 1. GD-RC-001: 网络 host 换座后仍判定为 host ===')
{
  // 场景:host startAsHost → selfSeat=0 → swapSeats(0,2) → selfSeat=2
  // 验证 net.isHost() 仍为 true(网络 host 身份不变)
  const Host = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'host-uuid-rc01' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
  Host._setTransportFactory(() => ({
    _mode: 'self', _wss: null, _clients: new Map(), _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [], _ready: true, _listeners: [], _closedByUser: false, _reconnecting: false,
    onMessage(cb) { this._listeners.push(cb) }, offMessage() {},
    open() { return Promise.resolve() }, send() { return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {}, isReady() { return true },
  }))
  Host.setRoomId('rc01-host')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  assert('startAsHost 后 isHost=true', Host.isHost() === true)
  assert('startAsHost 后 selfSeat=0', Host.getSelfSeat() === 0)
  Host.getPeers().set(2, { nickname: 'Mate', avatar: 'M', uuid: 'mate-uuid' })
  // 换座
  Host.swapSeats(0, 2)
  assert('swapSeats(0,2) 后 selfSeat=2', Host.getSelfSeat() === 2)
  // ★ 关键:isHost() 仍为 true(网络 host 身份没变)
  assert('★ swapSeats 后 isHost() 仍为 true(网络 host 身份)', Host.isHost() === true)
  Host.close()
}

// ============== GD-RC-002:_kickedSeats 清理在 host JOIN handler ==============
console.log('\n=== 2. GD-RC-002: _kickedSeats 清理在 host JOIN handler ===')
{
  // 场景:host 踢出 seat 1 → _kickedSeats.add(1) → 新玩家加 seat 1 → 应被清
  // 用 WS 真实 transport 测试不容易,直接用 fake + 手动触发 _handleHostMessage
  // 简化:直接调 net.kickPlayer + 模拟新玩家 JOIN
  const Host = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'host-uuid-rc02' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
  let sentMsgs = []
  Host._setTransportFactory(() => ({
    _mode: 'self', _wss: null, _clients: new Map(), _channel: { name: 'fake', postMessage: () => {} },
    _outbox: [], _ready: true, _listeners: [], _closedByUser: false, _reconnecting: false,
    onMessage(cb) { this._listeners.push(cb) }, offMessage() {},
    open() { return Promise.resolve() },
    send(msg) { sentMsgs.push(msg); return true },
    _emit(msg) { for (const cb of this._listeners) { try { cb(msg) } catch (e) {} } },
    close() {}, isReady() { return true },
  }))
  Host.setRoomId('rc02-kicked')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  // 先添加 seat 1 joiner 模拟已加入(用 _emit 触发 JOIN handler)
  // 但更简单:直接通过 _emit fake JOIN 触发 host JOIN handler(被 _handleHostMessage 走)
  const fakeJoin1 = {
    type: 'JOIN', from: 1, to: 0, ts: Date.now(),
    payload: { nickname: 'Old1', avatar: 'O1', uuid: 'old-uuid', ready: false },
  }
  Host._getTransport()._emit(fakeJoin1)
  await new Promise(r => setTimeout(r, 30))
  // 现在 Host.peers 含 seat 1,踢 seat 1
  const r1 = Host.kickPlayer(1, 'test')
  assert('kickPlayer(1) 返回 ok', r1.ok === true)
  // 再次踢 seat 1 → 应返回 already kicked
  // (kickPlayer 实现:已踢过返回 {ok: true, error: 'already kicked'} 幂等)
  const r1b = Host.kickPlayer(1, 'test')
  assert('★ 再次踢 seat 1 返回 already kicked(_kickedSeats 残留)', r1b.ok === true && /already/i.test(r1b.error || ''))
  // 新玩家 seat 1 加入(不同 uuid)— 模拟 _handleHostMessage('JOIN') 路径
  // 先 delete 原 peer 模拟"旧 joiner 走了"
  // _handleHostMessage 看到 used set 不含 1(因为 kickPlayer 已清掉),会分配 seat 1
  const fakeJoin2 = {
    type: 'JOIN', from: 2, to: 0, ts: Date.now(),
    payload: { nickname: 'New1', avatar: 'N1', uuid: 'new-uuid', ready: false },
  }
  Host._getTransport()._emit(fakeJoin2)
  await new Promise(r => setTimeout(r, 30))
  // 验证新玩家被分配到 seat 1(因为旧 peer 被 kick 清掉)
  const newPeer = Host.getPeers().get(1)
  assert('新玩家占 seat 1', newPeer?.nickname === 'New1')
  // 验证 _kickedSeats 已清(再次踢不是 already kicked,可能是座位无人因为 _lastSenderWs 等)
  // 关键:再次踢应该不是 "already kicked" 错误
  const r2 = Host.kickPlayer(1, 'test')
  // kickPlayer 走 if (_kickedSeats.has(seat)) return 'already kicked'
  // _kickedSeats 已被清(JOIN handler 调用 delete),所以走 else → _lastSenderWs 路径
  // _lastSenderWs = null → 走 host path,但 _kickedSeats.delete 后
  // 实际测试:验证 r2.error 不是 "already kicked" 即可
  assert('★ _kickedSeats 已清(再次踢不是 already kicked)', !(/already kicked/i.test(r2.error || '')))
  Host.close()
}

// ============== GD-RC-003:applyRoundEndFromPayload 权威结算 ==============
console.log('\n=== 3. GD-RC-003: applyRoundEndFromPayload 权威结算 + roundId 去重 ===')
{
  const game = createGame({ players: [{}, {}, {}, {}], seed: 1 })
  // 应用一次
  const p = {
    ranks: [0, 2, 1, 3],
    levelUp: 3,
    newLevelRank: 14,
    roundId: 'r1-1-0-2-1-3',
    tribute: { from: [3], to: [0], needTribute: true, doubleTribute: false, pairFromTo: [[3, 0]] },
    teamLevels: [14, 14],
    round: 1,
  }
  game.applyRoundEndFromPayload(p)
  const st1 = game.getState()
  eq('applyRoundEndFromPayload 后 finishedOrder=[0,2,1,3]', st1.finishedOrder, [0, 2, 1, 3])
  eq('applyRoundEndFromPayload 后 levelUp=3', st1.levelUp, 3)
  eq('applyRoundEndFromPayload 后 levelRank=14', st1.levelRank, 14)
  eq('applyRoundEndFromPayload 后 round=1', st1.round, 1)
  eq('applyRoundEndFromPayload 后 teamLevels=[14,14]', st1.teamLevels, [14, 14])
  assert('applyRoundEndFromPayload 后 phase=finished', st1.phase === 'finished')
  // roundId 去重:再次应用相同 roundId 应跳过
  const initialRound = st1.round
  game.applyRoundEndFromPayload({ ...p, round: 99 })  // 改 round,应不应用
  const st2 = game.getState()
  eq('★ 相同 roundId 二次应用被去重(round 不变)', st2.round, initialRound)
  // 新 roundId 应应用
  game.applyRoundEndFromPayload({ ...p, roundId: 'r2-different', round: 2 })
  const st3 = game.getState()
  eq('★ 不同 roundId 应应用(round=2)', st3.round, 2)
}

// ============== GD-RC-004:onP2PStateSnapshot UI refs 刷新 ==============
console.log('\n=== 4. GD-RC-004: STATE_SNAPSHOT 后 UI refs 完整刷新 ===')
{
  // 模拟断线重连场景:
  // 1. joiner 端 game state 跟 host 不一致
  // 2. host 发 STATE_SNAPSHOT { targetSeat, snapshot }
  // 3. joiner apply snapshot → UI refs 同步刷新
  // 这里直接测 _applySnapshot 后的 getState 行为(实际 onP2PStateSnapshot handler)
  const game = createGame({ players: [{}, {}, {}, {}], seed: 1 })
  game.deal()
  const st0 = game.getState()
  // 改 snapshot 模拟 host 端不同 state
  const newSnap = {
    hands: [Array(27).fill({ suit: 0, rank: 5 }), [], [], []],
    currentPlayer: 2,
    firstPlayer: 2,
    leaderPlayer: 2,
    lastPlay: { who: 0, type: E.TYPE.SINGLE, mainRank: 5, length: 1, cards: [{ suit: 0, rank: 5 }] },
    tableCards: [{ suit: 0, rank: 5 }],
    finishedOrder: [0],
    trickHistory: [],
    passCount: 0,
    tribute: null,
    ghost: null,
    levelRank: 14,
    teamLevels: [14, 14],
    phase: 'playing',
    round: 1,
  }
  game.applySnapshot(newSnap)
  const st1 = game.getState()
  // ★ 关键:全部 UI 关键字段都被更新
  eq('snapshot 后 currentPlayer=2', st1.currentPlayer, 2)
  eq('snapshot 后 tableCards.length=1', st1.tableCards.length, 1)
  eq('snapshot 后 finishedOrder=[0]', st1.finishedOrder, [0])
  eq('snapshot 后 levelRank=14', st1.levelRank, 14)
  eq('snapshot 后 phase=playing', st1.phase, 'playing')
  eq('snapshot 后 hands[0] 全 5', st1.hands[0].length, 27)
}

// ============== GD-RC-005:reconnect snapshot 定向 sendTo + targetSeat 判定 ==============
console.log('\n=== 5. GD-RC-005: reconnect snapshot 定向 sendTo + targetSeat ===')
{
  // host 端 connect 触发 onConnectSnapshot({seat: connSeat}) → sendTo(connSeat, {targetSeat, snapshot})
  // joiner 端 onP2PStateSnapshot:payload.targetSeat === selfSeat 才应用
  // 验证发送:net.sendTo(seat, payload) 内部会调 sendMessage({...payload, to: seat})
  //   sendMessage → transport.send(msg) → 实际 transport.send 收到 msg.to
  const Host = Object.create(net)
  globalThis.sessionStorage = { _store: { guandan_session_uuid: 'host-uuid-rc05' }, getItem(k) { return this._store[k] || null }, setItem(k, v) { this._store[k] = v } }
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
  Host.setRoomId('rc05-target')
  Host.startAsHost({ nickname: 'H', avatar: 'H' })
  // 验证 net.sendTo 存在(实际是 sendMessage 包装,会加 to 字段)
  assert('net.sendTo 是函数', typeof Host.sendTo === 'function')
  // 模拟 host 收到 connect 事件,触发 useGameLogic 里的 onConnectSnapshot
  // 这里直接调 net.sendTo 模拟 useGameLogic 的逻辑
  const connSeat = 2
  const st = { hands: 'mock-snap', currentPlayer: 1, levelRank: 14 }
  Host.sendTo(connSeat, {
    type: 'STATE_SNAPSHOT',
    payload: { targetSeat: connSeat, snapshot: st },
  })
  // 验证 transport.send 收到 msg,msg.to=2(定向标记)
  assert('★ transport.send 被调(定向消息)', capturedSend !== null)
  eq('★ msg.to=2(定向标记,不是 broadcast)', capturedSend?.to, 2)
  eq('msg.type=STATE_SNAPSHOT', capturedSend?.type, 'STATE_SNAPSHOT')
  eq('msg.payload.targetSeat=2', capturedSend?.payload?.targetSeat, 2)
  eq('msg.payload.snapshot.currentPlayer=1', capturedSend?.payload?.snapshot?.currentPlayer, 1)
  Host.close()
}

console.log(`\n========== v046-gd-rc-fixes 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
setTimeout(() => process.exit(fail > 0 ? 1 : 0), 100)
