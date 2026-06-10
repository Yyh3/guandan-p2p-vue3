/**
 * 牌面/理牌/级牌判断 API 自测
 * 用法: node common/card-api.test.js
 */
import * as E from './guandan-engine.js'

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

console.log('\n=== 1. sortHandGrouped: 同数字相邻, 数字从大到小 ===')
const hand1 = [
  { suit: 1, rank: 3 },   // ♥3
  { suit: 0, rank: 14 },  // ♠A
  { suit: 2, rank: 3 },   // ♣3
  { suit: 0, rank: 10 },  // ♠10
  { suit: 3, rank: 3 },   // ♦3
  { suit: 1, rank: 10 },  // ♥10
]
const sorted1 = E.sortHandGrouped(hand1)
eq('6 张排好', sorted1.map(c => `${c.suit}-${c.rank}`),
  ['0-14', '0-10', '1-10', '1-3', '2-3', '3-3'])
assert('3 张 3 在末尾相邻', sorted1.slice(-3).every(c => c.rank === 3))
assert('2 张 10 在中段相邻', sorted1.slice(1, 3).every(c => c.rank === 10))

console.log('\n=== 2. sortHandGrouped: 王排最后(大王 17 > 小王 16) ===')
// 注意:rank=15 表示牌"2", rank=14 表示牌"A", rank=2 表示牌"3"(数字 2 不存在)
const hand2 = [
  { suit: -1, rank: 16 },  // 小王
  { suit: 0, rank: 15 },    // ♠2
  { suit: -1, rank: 17 },  // 大王
  { suit: 3, rank: 14 },   // ♦A
]
const sorted2 = E.sortHandGrouped(hand2)
eq('大王 > 小王 > 2 > A',
  sorted2.map(c => `r${c.rank}`),
  ['r17', 'r16', 'r15', 'r14'])

console.log('\n=== 3. sortHandGrouped: 不修改原数组 ===')
const hand3 = [
  { suit: 1, rank: 3 },
  { suit: 0, rank: 5 },
]
const orig = hand3.map(c => `${c.suit}-${c.rank}`)
E.sortHandGrouped(hand3)
eq('原数组未变', hand3.map(c => `${c.suit}-${c.rank}`), orig)

console.log('\n=== 4. sortHandGrouped: 空数组/单张 ===')
eq('空数组', E.sortHandGrouped([]), [])
const one = [{ suit: 0, rank: 7 }]
eq('单张', E.sortHandGrouped(one), [{ suit: 0, rank: 7 }])

console.log('\n=== 5. isLevelCard: 红 10 是级牌, 黑 10 不是 ===')
// 默认 levelRank=15(2), 我们手动测不同 levelRank
assert('♠A(rank=14) 在 level=2 时不是级牌', E.isLevelCard({ suit: 0, rank: 14 }, 15) === false)
assert('♥10(rank=10) 在 level=2 时不是级牌', E.isLevelCard({ suit: 1, rank: 10 }, 15) === false)
assert('♥10(rank=10) 在 level=10 时是级牌', E.isLevelCard({ suit: 1, rank: 10 }, 10) === true)
assert('♦10(rank=10) 在 level=10 时是级牌', E.isLevelCard({ suit: 3, rank: 10 }, 10) === true)
assert('♠10(rank=10) 在 level=10 时不是级牌(只有红 10)', E.isLevelCard({ suit: 0, rank: 10 }, 10) === false)
assert('♣10(rank=10) 在 level=10 时不是级牌', E.isLevelCard({ suit: 2, rank: 10 }, 10) === false)
assert('小王不是级牌', E.isLevelCard({ suit: -1, rank: 16 }, 16) === false)
assert('大王不是级牌', E.isLevelCard({ suit: -1, rank: 17 }, 17) === false)
assert('null 不是级牌', E.isLevelCard(null, 10) === false)
assert('undefined 不是级牌', E.isLevelCard(undefined, 10) === false)

console.log('\n=== 6. 整体 27 张手牌理牌 ===')
const full = E.createDeck()
const shuffled = E.shuffle(full)
const dealt = E.deal().hands[0]
const grouped = E.sortHandGrouped(dealt)
eq('27 张手牌理牌后还是 27 张', grouped.length, 27)
// 验证排序正确(数字递减)
for (let i = 0; i < grouped.length - 1; i++) {
  if (grouped[i].rank < grouped[i + 1].rank) {
    assert(`第 ${i} 张 rank 不小于下一张`, false)
    break
  }
}
assert('手牌理牌后 rank 单调非增', true)

console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
