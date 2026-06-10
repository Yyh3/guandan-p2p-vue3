/**
 * 性能基准测试
 * 跑: node benchmark.js
 */
import * as E from './common/guandan-engine.js'
import * as AI from './common/guandan-ai.js'

function fmt(n) { return n.toFixed(2) }
function bytes(n) { return (n / 1024 / 1024).toFixed(2) + ' MB' }

console.log('\n========== 掼蛋 P2P 性能基准测试 ==========\n')

// 1. 牌组生成 + 洗牌 + 发牌
{
  const N = 1000
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) { E.createDeck(); E.shuffle(E.createDeck()); E.deal() }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`1. 牌组生成+洗牌+发牌  ×${N}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N * 1000)} μs/次, 吞吐: ${fmt(N / (ms / 1000))} 局/秒`)
}

// 2. 牌型识别
{
  const N = 10000
  const samples = [
    [{suit:0, rank:14}],
    [{suit:0, rank:5}, {suit:1, rank:5}],
    [{suit:0, rank:7}, {suit:1, rank:7}, {suit:2, rank:7}],
    [{suit:0, rank:3}, {suit:1, rank:4}, {suit:2, rank:5}, {suit:3, rank:6}, {suit:0, rank:7}],
    [{suit:0, rank:8}, {suit:1, rank:8}, {suit:2, rank:8}, {suit:3, rank:8}],
    [{suit:0, rank:9}, {suit:1, rank:9}, {suit:2, rank:9}, {suit:3, rank:9}, {suit:0, rank:9}],
  ]
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) for (const s of samples) E.recognize(s)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n2. 牌型识别(6 种典型牌型)  ×${N * samples.length}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N / samples.length * 1000)} μs/次, 吞吐: ${fmt(N * samples.length / (ms / 1000))} 次/秒`)
}

// 3. 大小比较
{
  const N = 100000
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) {
    E.canBeat({ type: E.TYPE.BOMB_5, mainRank: 5, length: 5 }, { type: E.TYPE.BOMB_4, mainRank: 14, length: 4 })
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n3. 大小比较  ×${N}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N * 1000)} μs/次, 吞吐: ${fmt(N / (ms / 1000))} 次/秒`)
}

// 4. 升级 + 进贡
{
  const N = 100000
  const teams = [[0, 2], [1, 3]]
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) {
    E.calcLevelUp([0, 2, 1, 3], teams)
    E.tributeInfo([0, 2, 1, 3], teams)
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n4. 升级+进贡  ×${N * 2}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N * 1000)} μs/次, 吞吐: ${fmt(N / (ms / 1000))} 次/秒`)
}

// 5. AI 决策(领出)
{
  const N = 1000
  const hand = []
  for (let r = 3; r <= 15; r++) for (let s = 0; s < 4 && hand.length < 27; s++) hand.push({ suit: s, rank: r })
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) AI.decide(hand, null, 5)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n5. AI 领出决策  ×${N}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N)} ms/次, 吞吐: ${fmt(N / (ms / 1000))} 次/秒`)
}

// 6. AI 跟牌
{
  const N = 1000
  const hand = []
  for (let r = 3; r <= 15; r++) for (let s = 0; s < 4 && hand.length < 27; s++) hand.push({ suit: s, rank: r })
  const target = { type: E.TYPE.SINGLE, mainRank: 8, length: 1 }
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) AI.decide(hand, target, 5)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n6. AI 跟牌决策(压单张)  ×${N}`)
  console.log(`   总耗时: ${fmt(ms)} ms, 平均: ${fmt(ms / N)} ms/次, 吞吐: ${fmt(N / (ms / 1000))} 次/秒`)
}

// 7. 完整 1 局 4 AI
{
  const t0 = process.hrtime.bigint()
  const result = E.deal()
  const hands = result.hands
  let currentPlayer = Math.floor(Math.random() * 4)
  let lastPlay = null
  let passCount = 0
  const finished = []
  let tricks = 0
  let loops = 0
  const startWall = Date.now()
  while (finished.length < 4 && loops < 500) {
    loops++
    if (finished.includes(currentPlayer)) {
      let n = (currentPlayer + 1) % 4
      let guard = 0
      while (finished.includes(n) && guard++ < 5) n = (n + 1) % 4
      currentPlayer = n
      continue
    }
    const r = AI.decide(hands[currentPlayer], lastPlay, 5, { isTeammateLast: lastPlay && ((lastPlay.who + 2) % 4 === currentPlayer) })
    if (r.type === 'play') {
      for (const card of r.cards) {
        const idx = hands[currentPlayer].findIndex(c => c.rank === card.rank && c.suit === card.suit)
        if (idx >= 0) hands[currentPlayer].splice(idx, 1)
      }
      const rec = E.recognize(r.cards)
      lastPlay = { who: currentPlayer, cards: r.cards, type: rec.type, mainRank: rec.mainRank, length: rec.length }
      passCount = 0
      tricks++
      if (hands[currentPlayer].length === 0) finished.push(currentPlayer)
    } else {
      passCount++
    }
    let n = (currentPlayer + 1) % 4
    let guard = 0
    while (finished.includes(n) && guard++ < 5) n = (n + 1) % 4
    if (passCount >= 3 && lastPlay) {
      let lead = lastPlay.who
      guard = 0
      while (finished.includes(lead) && guard++ < 5) lead = (lead + 1) % 4
      currentPlayer = lead
      lastPlay = null
      passCount = 0
    } else {
      currentPlayer = n
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`\n7. 完整 1 局(4 AI 同步)  ×1`)
  console.log(`   循环 ${loops} 次, 出牌 ${tricks} 次, 完成 ${finished.length}/4 人`)
  console.log(`   CPU 耗时: ${fmt(ms)} ms, 墙钟: ${Date.now() - startWall} ms`)
  console.log(`   每手牌决策: ${fmt(ms / tricks)} ms`)
}

const mem = process.memoryUsage()
console.log(`\n========== 内存占用 ==========`)
console.log(`  堆: ${bytes(mem.heapUsed)}`)
console.log(`  RSS: ${bytes(mem.rss)}`)
console.log(`  外部: ${bytes(mem.external)}`)

console.log('\n========== 测试完成 ==========\n')
