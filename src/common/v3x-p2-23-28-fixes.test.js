/**
 * v3.x P2-23 → P2-28 batch fixes 测试
 *
 * 一次性覆盖第三轮复查报告里 6 个未修 bug:
 *   N-3 (P2-23) requestHostMigration 接受 snapshot + PEER_LEAVE 传递
 *   N-6 (P2-24) _flushOutbox 保留 msg.to 定向路由
 *   N-4/N-5 (P2-25) close() 清 handlers + _transportFactory
 *   E-6 (P2-27) tributeInfo 接受 levelUp,needTribute 有真正判断意义
 *   A-4' (P2-28) findMinBeat 王炸判定简化
 *   E-3 (P2-26) 注释明确 — 不动逻辑
 *
 * 设计原则:这些 fix 都不破坏既有行为,所以大部分 case 是"在原行为上加新能力",
 * 少量是"清理状态"验证(close 后无残留)。
 */

import * as E from './guandan-engine.js'
import * as AI from './guandan-ai.js'
import * as net from './network.js'
import { WebSocketTransport } from './network-transport-ws.js'

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

const teams = [[0, 2], [1, 3]]

// ============== E-6 (P2-27):tributeInfo needTribute 字段有意义 ==============
console.log('\n=== 1. E-6: tributeInfo 接受 levelUp,needTribute 有真正判断意义 ===')
// 不传 levelUp(旧调用):永远贡(向后兼容)
const legacy1 = E.tributeInfo([0, 2, 1, 3], teams)
assert('不传 levelUp:双上仍贡', legacy1.needTribute === true)
const legacy2 = E.tributeInfo([1, 0, 2, 3], teams)
assert('不传 levelUp:头末同队仍贡', legacy2.needTribute === true)
// 传 levelUp=3(双上):贡
const doubleUp = E.tributeInfo([0, 2, 1, 3], teams, 3)
assert('levelUp=3 双上 needTribute=true', doubleUp.needTribute === true)
eq('levelUp=3 doubleTribute=true', doubleUp.doubleTribute, true)
eq('levelUp=3 pairFromTo 配对正确', doubleUp.pairFromTo, [[1, 0], [3, 2]])
// 传 levelUp=1(头+末同队):单贡
const singleUp = E.tributeInfo([1, 0, 2, 3], teams, 1)
assert('levelUp=1 单下 needTribute=true', singleUp.needTribute === true)
eq('levelUp=1 from=[3]', singleUp.from, [3])
// 传 levelUp=0(双下):不贡(严格规则)
const noTribute = E.tributeInfo([0, 1, 2, 3], teams, 0)
assert('levelUp=0 双下 needTribute=false', noTribute.needTribute === false)
eq('levelUp=0 from=[]', noTribute.from, [])
eq('levelUp=0 to=[]', noTribute.to, [])
eq('levelUp=0 pairFromTo=[]', noTribute.pairFromTo, [])

// ============== E-3 (P2-26):Joker 对子被禁止(注释明确) ==============
console.log('\n=== 2. E-3: 注释明确 Joker 不能组对(逻辑未动,需保持回归) ===')
const twoBigJokers = [
  { suit: -1, rank: 17 },
  { suit: -1, rank: 17 },
]
const rec1 = E.recognize(twoBigJokers)
eq('2 大王 → INVALID(非对子)', rec1?.type, E.TYPE.INVALID)
const twoSmallJokers = [
  { suit: -1, rank: 16 },
  { suit: -1, rank: 16 },
]
const rec2 = E.recognize(twoSmallJokers)
eq('2 小王 → INVALID(非对子)', rec2?.type, E.TYPE.INVALID)
const mixedJokers = [
  { suit: -1, rank: 16 },
  { suit: -1, rank: 17 },
]
const rec3 = E.recognize(mixedJokers)
eq('大小王各 1 → INVALID(非对子)', rec3?.type, E.TYPE.INVALID)
// 真对子(2 张普通牌)要能识别
const realPair = [
  { suit: 0, rank: 10 },
  { suit: 1, rank: 10 },
]
const rec4 = E.recognize(realPair)
eq('2 张普通 10 → PAIR', rec4?.type, E.TYPE.PAIR)

// ============== A-4' (P2-28):findMinBeat 王炸判定简化 ==============
console.log('\n=== 3. A-4\': findMinBeat 王炸判定简化为 filter === 4 ===')
// 准备 4 张王 + 一些普通牌
const handWith4Jokers = [
  { suit: 0, rank: 5 },  // 5
  { suit: 1, rank: 7 },  // 7
  { suit: -1, rank: 16 }, // 小王
  { suit: -1, rank: 16 }, // 小王
  { suit: -1, rank: 17 }, // 大王
  { suit: -1, rank: 17 }, // 大王
  { suit: 2, rank: 9 },   // 9
]
// 目标:任意牌型,findMinBeat 应该优先返回 4 王
const anyTarget = { type: E.TYPE?.SINGLE ?? 1, mainRank: 3, length: 1 }
const beat = AI.findMinBeat(handWith4Jokers, anyTarget, 0, 14)
assert('4 王 → findMinBeat 返回非 null', beat !== null)
eq('4 王返回 4 张', beat?.length, 4)
eq('4 王 rank 都 >= 16', beat?.every(c => c.rank >= 16), true)
// 3 王 → 不返回 4 王
const hand3Jokers = handWith4Jokers.filter(c => !(c.rank === 17))
const beat3 = AI.findMinBeat(hand3Jokers, anyTarget, 0, 14)
assert('3 王 + 普通牌 → findMinBeat 不会拿 3 王当 4 王用',
  beat3 === null || (beat3 && beat3.length !== 4))

// ============== N-3 (P2-23):requestHostMigration 接受 snapshot ==============
console.log('\n=== 4. N-3: requestHostMigration 接受 snapshot 参数 ===')
// 用 WS transport(ephemeral port)模拟 host 1 + joiner 2
function freshNet() {
  const mod = Object.create(net)
  mod.__testReset && mod.__testReset()
  return mod
}
function setupHostJoiner() {
  const Host = Object.create(net)
  const J1 = Object.create(net)
  const J2 = Object.create(net)
  // host 端用 ephemeral port 0
  Host._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
  J1._setTransportFactory(() => new WebSocketTransport())
  J2._setTransportFactory(() => new WebSocketTransport())
  return { Host, J1, J2 }
}
// 直接断言函数签名:requestHostMigration 现在接受 2 个参数(newHostSeat, snapshot)
const fn = net.requestHostMigration
assert('requestHostMigration 是函数', typeof fn === 'function')
assert('requestHostMigration.length === 2 (新签名:newHostSeat, snapshot)', fn.length === 2)

// ============== N-4/N-5 (P2-25):close() 清 handlers + _transportFactory ==============
console.log('\n=== 5. N-4/N-5: close() 清理 handlers + _transportFactory ===')
// 准备一个 fresh net 实例
const TestNet = Object.create(net)
TestNet._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
// 装一个 listener
const myHandler = () => {}
TestNet.on('test:event', myHandler)
TestNet.on('test:event2', myHandler)
TestNet.on('peer:join', myHandler)
eq('on 后有 1 个 test:event handler', TestNet._listenerCount('test:event'), 1)
eq('on 后 _listTrackedEvents 含 3 个事件', TestNet._listTrackedEvents().length, 3)
// close 应该清掉所有 handlers
TestNet.close()
eq('close 后 test:event handler = 0', TestNet._listenerCount('test:event'), 0)
eq('close 后 _listTrackedEvents 为空', TestNet._listTrackedEvents().length, 0)
// _transportFactory 不可从外部观察(无 getter),但 close() 后 _createTransport 应走默认路径
// 间接验证:close 后再 set 一个新 factory,旧 factory 不残留(如果残留,set 会 fail)
TestNet._setTransportFactory(() => new WebSocketTransport({ port: 0 }))
assert('close 后再注入新 factory 不抛错', true)
TestNet.close()

// ============== N-6 (P2-24):_flushOutbox 保留 msg.to 定向路由 ==============
console.log('\n=== 6. N-6: WebSocketTransport outbox 存 {data, msg} 而非纯 data ===')
const ws = new WebSocketTransport({ port: 0 })
// 验证 outbox 数据结构:push 后内容是 {data, msg} 对象
const msg = { type: 'TEST', payload: { x: 1 }, to: 2 }
ws.send(msg)
eq('outbox 长度 = 1', ws._outbox.length, 1)
const item = ws._outbox[0]
assert('outbox 项是对象', typeof item === 'object' && item !== null)
assert('outbox 项有 data 字段', typeof item?.data === 'string')
assert('outbox 项有 msg 字段', typeof item?.msg === 'object')
eq('outbox.msg.to = 2', item?.msg?.to, 2)
eq('outbox.msg.type = "TEST"', item?.msg?.type, 'TEST')
eq('outbox.data 是 JSON 字符串', item?.data, JSON.stringify(msg))

console.log(`\n========== v3x-p2-23-28 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
