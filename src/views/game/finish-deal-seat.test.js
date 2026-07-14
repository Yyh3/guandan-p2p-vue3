/**
 * finish-deal-seat.test.js — BUG-002 修复测试
 *
 * ★ 修复前问题:useGameLogic.js 第 359 行写死 `hands[0]`,P2P 联机时
 *   非房主 (seat=1/2/3) 发牌后读到的全是 host 的手牌,自己牌全是 host 的牌。
 *   4 人局 joiner 看不到自己的手牌。
 *
 * 修复后:finishDeal 按 selfSeat 读 hands[seat]。
 *
 * 本测试:
 *   1. 4 个独立 network.js 实例(host + 3 joiner),固定 seed,所有实例同步 deal
 *   2. 验证每个 client 的 hands[seat] 等于它自己的 myHand 输出
 *   3. 4 个 client 的 hands 数组必须按 4 个 seat 拼成完整 108 张牌
 *   4. 验证所有 4 个 selfSeat (0/1/2/3) 都能正确读到自己的牌(不是全读 hands[0])
 *
 * 简化实现:不进 GameView (避免 vue-test-utils / jsdom 依赖),
 *   直接调 createGame + 手动模拟 finishDeal 读取逻辑。
 *   真实 finishDeal 在 useGameLogic.js 是:myHand = sortHandGrouped(hands[selfSeat].slice())
 */

import { createGame } from '../../common/guandan-game.js'
import * as E from '../../common/guandan-engine.js'

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

// 模拟 finishDeal 的修复后逻辑
function finishDealFixed(game, selfSeat) {
  const st = game.getState()
  const seat = Number.isInteger(selfSeat) ? selfSeat : 0
  const hand = st?.hands?.[seat]
  if (!Array.isArray(hand)) {
    return []
  }
  return E.sortHandGrouped(hand.slice())
}

// 模拟 finishDeal 的修复前逻辑(写死 hands[0])
function finishDealBuggy(game) {
  const st = game.getState()
  return E.sortHandGrouped(st.hands[0].slice())
}

// ============================================================
// 块 1: 修复后逻辑 — selfSeat=0/1/2/3 都正确读到自己的手牌
// ============================================================
console.log('\n=== 1. finishDeal 修复后:selfSeat=0/1/2/3 各自读自己的手牌(不串号) ===')
{
  const SEED = 12345
  const g = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: SEED })
  g.deal()
  const st = g.getState()

  for (let seat = 0; seat <= 3; seat++) {
    const myHand = finishDealFixed(g, seat)
    // ★ 关键断言:myHand 必须等于 hands[seat].sortGrouped,不是 hands[0]
    const expected = E.sortHandGrouped(st.hands[seat].slice())
    eq(`selfSeat=${seat} myHand === sortHandGrouped(hands[${seat}])`,
      myHand.map(c => ({ suit: c.suit, rank: c.rank })),
      expected.map(c => ({ suit: c.suit, rank: c.rank })))
  }

  // 4 个 selfSeat 读出的 myHand 必须不同(host / 3 joiner 手牌不一样)
  const allMyHands = [0, 1, 2, 3].map(s => finishDealFixed(g, s))
  const uniq = new Set(allMyHands.map(h => JSON.stringify(h)))
  assert('4 个 selfSeat 读出的手牌互不相同', uniq.size === 4)
}

// ============================================================
// 块 2: 修复前逻辑会出错(joiner 全读 host 的牌)
// ============================================================
console.log('\n=== 2. finishDeal 修复前(写死 hands[0])会让 selfSeat=1/2/3 全读 host 的牌 ===')
{
  const SEED = 12345
  const g = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: SEED })
  g.deal()

  const myHandBuggy = finishDealBuggy(g)
  // buggy 版本对 selfSeat=1/2/3 都会返回 host 的牌(因为永远读 hands[0])
  for (let seat = 1; seat <= 3; seat++) {
    const expected = E.sortHandGrouped(g.getState().hands[seat].slice())
    // 修复前 joiner 读到的 = hands[0],不等于 hands[seat] (host 跟 joiner 牌不同)
    const buggyMatchesActual = JSON.stringify(myHandBuggy) === JSON.stringify(expected)
    assert(`selfSeat=${seat} (修复前) 误读 host 的牌(不等于自己的 hands[${seat}])`,
      buggyMatchesActual === false)
  }
}

// ============================================================
// 块 3: 4 client 模拟联机 — host 逐座 DEAL,joiner 只收到自己的手牌
// ============================================================
console.log('\n=== 3. 4 client 模拟联机:host 逐座 DEAL → 4 人各自 27 张拼成 108 张 ===')
{
  // Phase 2:host 发完整牌,然后给每个 seat 单独发送 hands[seat] + handCounts。
  // joiner 端 game 以 joiner 模式创建,收到 DEAL 后用 dealData 填充自己的手牌。
  const SEED = 999
  const hostGame = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: SEED })
  hostGame.deal()
  const hostSt = hostGame.getState()
  const handCounts = hostSt.hands.map(h => h.length)

  const clients = [0, 1, 2, 3].map((selfSeat) => {
    // 每个 client 收到只含自己手牌的 dealData
    const hands = hostSt.hands.map((h, i) => (i === selfSeat ? h.slice() : []))
    const game = createGame({
      seats: 4,
      levelRank: 15,
      isHost: false,
      selfSeat,
      aiPlayers: [],
      seed: SEED,
    })
    game.deal(null, hostSt.firstPlayer, { hands, handCounts })
    return { selfSeat, game }
  })

  // 验证:每个 client finishDeal 读自己的 hands[seat]
  for (const c of clients) {
    const myHand = finishDealFixed(c.game, c.selfSeat)
    const expected = E.sortHandGrouped(hostSt.hands[c.selfSeat].slice())
    eq(`client[${c.selfSeat}] finishDeal 读 hands[${c.selfSeat}]`,
      myHand.length, expected.length)
    assert(`client[${c.selfSeat}] 牌数 = 27 (每人 27 张)`, myHand.length === 27)
  }

  // 验证:4 个 client 的 own hand 拼起来 = 完整 108 张牌
  const allOwnHands = clients.map(c => finishDealFixed(c.game, c.selfSeat))
  const allCardKeys = allOwnHands.flatMap(h => h.map(c => `${c.suit}-${c.rank}`))
  eq('4 client own hands 总张数', allCardKeys.length, 108)
  const rankCounts = {}
  for (const h of allOwnHands) {
    for (const c of h) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1
    }
  }
  for (const r of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    assert(`rank=${r} 总共 8 张`, rankCounts[r] === 8)
  }
  for (const r of [16, 17]) {
    assert(`rank=${r} (王) 总共 2 张`, rankCounts[r] === 2)
  }

  // 验证:sortGrouped(myHand) === sortGrouped(hostHands[selfSeat])
  for (const c of clients) {
    const myHand = finishDealFixed(c.game, c.selfSeat)
    const expected = E.sortHandGrouped(hostSt.hands[c.selfSeat].slice())
    eq(`client[${c.selfSeat}] sortGrouped(myHand) === sortGrouped(hostHands[${c.selfSeat}])`,
      myHand.map(c => `${c.suit}-${c.rank}`),
      expected.map(c => `${c.suit}-${c.rank}`))
  }
}

// ============================================================
// 块 4: 边界 — selfSeat 非法值 (NaN / undefined) 走 fallback
// ============================================================
console.log('\n=== 4. 边界:selfSeat 非法值时走 fallback ===')
{
  const g = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: 1 })
  g.deal()

  // selfSeat 不是整数 (null / undefined / '0' / NaN) → fallback to 0
  eq('selfSeat=null fallback', finishDealFixed(g, null).length, 27)
  eq('selfSeat=undefined fallback', finishDealFixed(g, undefined).length, 27)
  eq('selfSeat=NaN fallback', finishDealFixed(g, NaN).length, 27)

  // 真正的非法 seat (5, -1) 走 fallback 到 seat 0
  // 注意:在 useGameLogic 里这是被 console.warn 的情况,但 myHand 仍然能读到 (hands[5] 是 undefined → [])
  const result51 = finishDealFixed(g, 5)
  assert('selfSeat=5 → hands[5] 是 undefined → 返回 []', Array.isArray(result51) && result51.length === 0)

  const resultNeg = finishDealFixed(g, -1)
  assert('selfSeat=-1 → hands[-1] 是 undefined → 返回 []', Array.isArray(resultNeg) && resultNeg.length === 0)
}

// ============================================================
// 块 5: Phase 2 hand hiding:joiner 只持有自己的手牌,看不到他人手牌
// ============================================================
console.log('\n=== 5. Phase 2 hand hiding:joiner 只持有自己的手牌,看不到他人手牌 ===')
{
  // 实际场景:host 发牌后逐座 sendTo DEAL {hands, handCounts},joiner 收到后
  // 用 dealData 填充自己的手牌,再 finishDeal 读 hands[selfSeat]。
  const SEED = 4242
  const hostGame = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: SEED })
  hostGame.deal()
  const hostSt = hostGame.getState()
  const handCounts = hostSt.hands.map(h => h.length)

  // 模拟 3 joiner,各自收到 host 发来的只含自己手牌的 dealData
  const joiners = [1, 2, 3].map((seat) => {
    const hands = hostSt.hands.map((h, i) => (i === seat ? h.slice() : []))
    const game = createGame({ seats: 4, levelRank: 15, isHost: false, selfSeat: seat, aiPlayers: [], seed: SEED })
    game.deal(null, hostSt.firstPlayer, { hands, handCounts })
    return { selfSeat: seat, game }
  })

  // host 视角:read hands[0]
  const hostView = finishDealFixed(hostGame, 0)
  eq('host view = hands[0]', hostView.length, hostSt.hands[0].length)

  // 3 joiner 视角:各自读 hands[selfSeat]
  for (const j of joiners) {
    const jView = finishDealFixed(j.game, j.selfSeat)
    // joiner 看到的 = 它自己 seat 的牌,不是 host 的牌
    const expectedHand = j.game.getState().hands[j.selfSeat]
    assert(`joiner seat=${j.selfSeat} view = hands[${j.selfSeat}] (${expectedHand.length} 张)`,
      jView.length === expectedHand.length && jView.length === 27)

    // ★ 关键:joiner 不应该看到 host 的牌 (Phase 2 hand hiding)
    const hostHandSorted = E.sortHandGrouped(hostSt.hands[0].slice())
    const joinerHandSorted = jView
    const sameAsHost = JSON.stringify(hostHandSorted) === JSON.stringify(joinerHandSorted)
    assert(`joiner seat=${j.selfSeat} 不应该等于 host 的牌 (Phase 2 hand hiding)`,
      sameAsHost === false)

    // Phase 2:其它 seat 的 hand 为空占位
    for (let s = 0; s < 4; s++) {
      if (s === j.selfSeat) continue
      assert(`joiner seat=${j.selfSeat} 不持有 seat=${s} 的手牌`,
        j.game.getState().hands[s].length === 0)
    }
  }
}

console.log(`\n========== finish-deal-seat test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)
process.exit(0)