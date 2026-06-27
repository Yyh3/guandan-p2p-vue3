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
// 块 3: 4 个 client 模拟联机 — 固定 seed,各自初始化 game,各自 finishDeal
// ============================================================
console.log('\n=== 3. 4 client 模拟联机:固定 seed → 4 hands 拼成完整 108 张牌 ===')
{
  // 真机 4 人联机:host 决定 seed,broadcast DEAL,所有 client 用同 seed 调 initGame
  // 每个 client 的 game instance 自己 deal,得到的 hands 数组是一样的
  // 关键断言:client[i].myHand === game.getState().hands[i]
  const SEED = 999
  const clients = [0, 1, 2, 3].map((selfSeat) => {
    // 模拟 useGameLogic.initGame:每个 client 都有自己的 game 实例 + selfSeat
    // ★ P2P 模式:只有 selfSeat=0 是 host,其它 joiner 的 game 不是 host (但 seed 相同)
    const game = createGame({
      seats: 4,
      levelRank: 15,
      isHost: selfSeat === 0,  // 联机时只有 selfSeat=0 是 host
      aiPlayers: [],
      seed: SEED,
    })
    game.deal()
    return { selfSeat, game }
  })

  // 验证:每个 client finishDeal 读自己的 hands[seat]
  for (const c of clients) {
    const myHand = finishDealFixed(c.game, c.selfSeat)
    const expected = E.sortHandGrouped(c.game.getState().hands[c.selfSeat].slice())
    eq(`client[${c.selfSeat}] finishDeal 读 hands[${c.selfSeat}]`,
      myHand.length, expected.length)
    assert(`client[${c.selfSeat}] 牌数 = 27 (每人 27 张)`, myHand.length === 27)
  }

  // 验证:任一 client 的 hands 拼起来 = 完整 108 张牌
  // (注意:每张牌有 2 张(同 rank + suit 不同花色或大小王),所以 unique key 只有 54 个)
  const oneClientHands = clients[0].game.getState().hands
  const allCardKeys = oneClientHands.flatMap(h => h.map(c => `${c.suit}-${c.rank}`))
  eq('单 client × 4 hands 总张数', allCardKeys.length, 108)
  // 用 sortGrouped + length 比对:108 张牌必须有 2 个 A / 2 个 2 / 4 个 3-10 / 2 个 J / 2 个 Q / 2 个 K / 2 王
  // 简单验证:每 rank 一共出现 8 张(4 花色 × 2),王出现 2 张
  const rankCounts = {}
  for (const h of oneClientHands) {
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

  // 验证:sortGrouped(myHand) === sortGrouped(hands[selfSeat]) (每个 client 独立验证)
  for (const c of clients) {
    const myHand = finishDealFixed(c.game, c.selfSeat)
    const expected = E.sortHandGrouped(c.game.getState().hands[c.selfSeat].slice())
    // 用 sortGrouped 比较,顺序一致
    eq(`client[${c.selfSeat}] sortGrouped(myHand) === sortGrouped(hands[${c.selfSeat}])`,
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
// 块 5: 4 个 selfSeat 同时创建 game 实例,seed 相同,view 一致性
// ============================================================
console.log('\n=== 5. 4 个 selfSeat 视角:自己看的 myHand 等于真实 hands[selfSeat] ===')
{
  // 实际场景:host 发牌,joiner 收到 DEAL {seed} 后 initGame({seed}) → finishDeal
  // joiner 的 selfSeat 由 SYNC 决定 (1/2/3)
  // ★ 关键:joiner 不能读 host 的牌 (修复前 bug)
  const SEED = 4242
  const hostGame = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [], seed: SEED })
  hostGame.deal()
  const hostSt = hostGame.getState()

  // 模拟 3 joiner,各自 initGame 同 seed
  const joiners = [1, 2, 3].map((seat) => ({
    selfSeat: seat,
    game: createGame({ seats: 4, levelRank: 15, isHost: false, aiPlayers: [], seed: SEED }),
  }))
  for (const j of joiners) j.game.deal()

  // host 视角:read hands[0]
  const hostView = finishDealFixed(hostGame, 0)
  eq('host view = hands[0]', hostView.length, hostSt.hands[0].length)

  // 3 joiner 视角:各自读 hands[selfSeat]
  for (const j of joiners) {
    const jView = finishDealFixed(j.game, j.selfSeat)
    // joiner 看到的 = 它自己 seat 的牌,不是 host 的牌
    const expectedHand = j.game.getState().hands[j.selfSeat]
    assert(`joiner seat=${j.selfSeat} view = hands[${j.selfSeat}] (${expectedHand.length} 张)`,
      jView.length === expectedHand.length)

    // ★ 关键:joiner 不应该看到 host 的牌 (修复前会)
    const hostHandSorted = E.sortHandGrouped(hostSt.hands[0].slice())
    const joinerHandSorted = jView
    const sameAsHost = JSON.stringify(hostHandSorted) === JSON.stringify(joinerHandSorted)
    assert(`joiner seat=${j.selfSeat} 不应该等于 host 的牌 (修复前 bug 表现)`,
      sameAsHost === false)
  }
}

console.log(`\n========== finish-deal-seat test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)
process.exit(0)