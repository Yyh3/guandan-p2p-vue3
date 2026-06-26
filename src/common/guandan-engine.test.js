/**
 * 掼蛋引擎自测脚本
 * 用法: node common/guandan-engine.test.js
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

console.log('\n=== 1. 牌组生成 ===')
const deck = E.createDeck()
eq('108 张', deck.length, 108)
const cnt = {}
deck.forEach(c => { cnt[c.rank] = (cnt[c.rank] || 0) + 1 })
eq('3..15 每种 8 张', Object.keys(cnt).filter(r => r >= 3 && r <= 15).every(r => cnt[r] === 8), true)
eq('小王(rank=16) 2 张', cnt[16], 2)
eq('大王(rank=17) 2 张', cnt[17], 2)

console.log('\n=== 2. 牌型识别 ===')
let r
// 单 A
r = E.recognize([{ suit: 0, rank: 14 }])
eq('单 A', r, { type: E.TYPE.SINGLE, mainRank: 14, length: 1 })
// 单 2
r = E.recognize([{ suit: 0, rank: 15 }])
eq('单 2 mainRank=15', r.mainRank, 15)
// 对 7
r = E.recognize([{ suit: 0, rank: 7 }, { suit: 1, rank: 7 }])
eq('对 7 type', r.type, E.TYPE.PAIR)
eq('对 7 mainRank', r.mainRank, 7)
// 三张 9
r = E.recognize([{ suit: 0, rank: 9 }, { suit: 1, rank: 9 }, { suit: 2, rank: 9 }])
eq('三张 9', r.type, E.TYPE.THREE)
// 三带二
r = E.recognize([
  { suit: 0, rank: 5 }, { suit: 1, rank: 5 }, { suit: 2, rank: 5 },
  { suit: 0, rank: 3 }, { suit: 1, rank: 3 },
])
eq('三带二 5+3', r.type, E.TYPE.THREE_PAIR)
eq('三带二 mainRank=5', r.mainRank, 5)
// 顺子 34567
r = E.recognize([
  { suit: 0, rank: 3 }, { suit: 1, rank: 4 }, { suit: 2, rank: 5 },
  { suit: 3, rank: 6 }, { suit: 0, rank: 7 },
])
eq('顺子 34567 type', r.type, E.TYPE.STRAIGHT)
eq('顺子 mainRank=7', r.mainRank, 7)
// 含 2 顺子非法
r = E.recognize([
  { suit: 0, rank: 10 }, { suit: 1, rank: 11 }, { suit: 2, rank: 12 },
  { suit: 3, rank: 13 }, { suit: 0, rank: 15 },
])
eq('含 2 的"顺子"应非法', r.type, E.TYPE.INVALID)
// 10JQKA 合法
r = E.recognize([
  { suit: 0, rank: 10 }, { suit: 1, rank: 11 }, { suit: 2, rank: 12 },
  { suit: 3, rank: 13 }, { suit: 0, rank: 14 },
])
eq('10JQKA 顺子合法', r.type, E.TYPE.STRAIGHT)
// 9TJQK 合法
r = E.recognize([
  { suit: 0, rank: 9 }, { suit: 1, rank: 10 }, { suit: 2, rank: 11 },
  { suit: 3, rank: 12 }, { suit: 0, rank: 13 },
])
eq('9TJQK 顺子合法', r.type, E.TYPE.STRAIGHT)
// 三连对 567
r = E.recognize([
  { suit: 0, rank: 5 }, { suit: 1, rank: 5 },
  { suit: 0, rank: 6 }, { suit: 1, rank: 6 },
  { suit: 0, rank: 7 }, { suit: 1, rank: 7 },
])
eq('三连对 567', r.type, E.TYPE.PAIR_STRAIGHT)
// 钢板 9-10
r = E.recognize([
  { suit: 0, rank: 9 }, { suit: 1, rank: 9 }, { suit: 2, rank: 9 },
  { suit: 0, rank: 10 }, { suit: 1, rank: 10 }, { suit: 2, rank: 10 },
])
eq('钢板 9-10', r.type, E.TYPE.THREE_STRAIGHT)
// 4 张炸
r = E.recognize([
  { suit: 0, rank: 8 }, { suit: 1, rank: 8 }, { suit: 2, rank: 8 }, { suit: 3, rank: 8 },
])
eq('4 张炸 8', r.type, E.TYPE.BOMB_4)
// 王炸
r = E.recognize([
  { suit: -1, rank: 16 }, { suit: -1, rank: 16 }, { suit: -1, rank: 17 }, { suit: -1, rank: 17 },
])
eq('王炸 type', r.type, E.TYPE.KINGS_BOMB)
eq('王炸 mainRank=17', r.mainRank, 17)
// 同花顺
r = E.recognize([
  { suit: 0, rank: 6 }, { suit: 0, rank: 7 }, { suit: 0, rank: 8 },
  { suit: 0, rank: 9 }, { suit: 0, rank: 10 },
])
eq('同花顺 ♠6789T', r.type, E.TYPE.STRAIGHT_FLUSH)
// 非同花 → 顺子
r = E.recognize([
  { suit: 0, rank: 6 }, { suit: 1, rank: 7 }, { suit: 0, rank: 8 },
  { suit: 0, rank: 9 }, { suit: 0, rank: 10 },
])
eq('非同花 5 张 → 顺子', r.type, E.TYPE.STRAIGHT)

console.log('\n=== 3. 大小比较 ===')
assert('单 A(14) > 单 K(13)', E.canBeat({ type: E.TYPE.SINGLE, mainRank: 14, length: 1 }, { type: E.TYPE.SINGLE, mainRank: 13, length: 1 }))
assert('单 2(15) > 单 A(14)', E.canBeat({ type: E.TYPE.SINGLE, mainRank: 15, length: 1 }, { type: E.TYPE.SINGLE, mainRank: 14, length: 1 }))
assert('大王(17) > 小王(16)', E.canBeat({ type: E.TYPE.SINGLE, mainRank: 17, length: 1 }, { type: E.TYPE.SINGLE, mainRank: 16, length: 1 }))
assert('4 炸(8) > 单 A', E.canBeat({ type: E.TYPE.BOMB_4, mainRank: 3, length: 4 }, { type: E.TYPE.SINGLE, mainRank: 14, length: 1 }))
assert('5 炸 > 4 炸', E.canBeat({ type: E.TYPE.BOMB_5, mainRank: 3, length: 5 }, { type: E.TYPE.BOMB_4, mainRank: 14, length: 4 }))
assert('王炸 > 同花顺', E.canBeat({ type: E.TYPE.KINGS_BOMB, mainRank: 17, length: 4 }, { type: E.TYPE.STRAIGHT_FLUSH, mainRank: 10, length: 5 }))
assert('同花顺 > 5 炸', E.canBeat({ type: E.TYPE.STRAIGHT_FLUSH, mainRank: 10, length: 5 }, { type: E.TYPE.BOMB_5, mainRank: 14, length: 5 }))
assert('单张 < 对子', !E.canBeat({ type: E.TYPE.SINGLE, mainRank: 17, length: 1 }, { type: E.TYPE.PAIR, mainRank: 3, length: 2 }))
assert('顺子 45678 > 34567', E.canBeat({ type: E.TYPE.STRAIGHT, mainRank: 8, length: 5 }, { type: E.TYPE.STRAIGHT, mainRank: 7, length: 5 }))
assert('同花顺 Q > 同花顺 10', E.canBeat({ type: E.TYPE.STRAIGHT_FLUSH, mainRank: 12, length: 5 }, { type: E.TYPE.STRAIGHT_FLUSH, mainRank: 10, length: 5 }))

console.log('\n=== 4. 升级与进贡 ===')
const teams = [[0, 2], [1, 3]]
// 双上(头+二同队):[0,2,1,3] → 升 3 + 双贡
eq('双上升 3', E.calcLevelUp([0, 2, 1, 3], teams), 3)
// 头+三同队(对手末游):[1,0,3,2] 头 1(队1),三 3(队1) → 升 2
eq('头三同队升 2', E.calcLevelUp([1, 0, 3, 2], teams), 2)
// 头+末同队(对门末游):[1,0,2,3] 头 1(队1),末 3(队1) → 升 1
eq('头末同队升 1', E.calcLevelUp([1, 0, 2, 3], teams), 1)
// 三+末异队(对手分占 1/2 名):[0,1,2,3] 头 0(队0),二 1(队1) → 升 2
eq('对手分占 1/2 升 2', E.calcLevelUp([0, 1, 2, 3], teams), 2)

// 进贡
// 双上升 3 时:双下贡(两家输家 → 赢家两人)
const ti = E.tributeInfo([0, 2, 1, 3], teams)
assert('双上需要进贡(双下贡)', ti.needTribute)
assert('双上 doubleTribute=true', ti.doubleTribute)
eq('双上 from=输家[1,3]', ti.from, [1, 3])
eq('双上 to=赢家[0,2]', ti.to, [0, 2])

// 升 1:头+末同队 → 末向头单贡
const ti2 = E.tributeInfo([1, 0, 2, 3], teams)
assert('头末同队单下贡', ti2.needTribute)
assert('头末同队 doubleTribute=false', !ti2.doubleTribute)
eq('单下 from=[3]', ti2.from, [3])
eq('单下 to=[1]', ti2.to, [1])

// 升 2(头三同队):单下贡
const ti3 = E.tributeInfo([1, 0, 3, 2], teams)
assert('头三同队单下贡', ti3.needTribute)
assert('头三同队 doubleTribute=false', !ti3.doubleTribute)
eq('头三同队 from=[2]', ti3.from, [2])
eq('头三同队 to=[1]', ti3.to, [1])

console.log('\n=== 5. 发牌 ===')
const dealt = E.deal()
eq('4 人各 27 张', dealt.hands.every(h => h.length === 27), true)
eq('总牌数 108', dealt.hands.reduce((s, h) => s + h.length, 0), 108)
assert('手牌已排序(从大到小)', dealt.hands[0][0].rank >= dealt.hands[0][dealt.hands[0].length - 1].rank)

console.log('\n=== 5b. 种子发牌(4-tab 联机) ===')
// 同一 seed → 两边发同一手牌(关键:4-tab 联机 4 个 tab 拿同样 4 组手牌)
const dA = E.deal(20260610)
const dB = E.deal(20260610)
eq('同 seed 牌组 0 完全相同', JSON.stringify(dA.hands[0]), JSON.stringify(dB.hands[0]))
eq('同 seed 牌组 1 完全相同', JSON.stringify(dA.hands[1]), JSON.stringify(dB.hands[1]))
eq('同 seed 牌组 2 完全相同', JSON.stringify(dA.hands[2]), JSON.stringify(dB.hands[2]))
eq('同 seed 牌组 3 完全相同', JSON.stringify(dA.hands[3]), JSON.stringify(dB.hands[3]))
// 不同 seed → 牌组 0 必须不同(只要 1 张不同就说明真在打乱)
const dC = E.deal(20260611)
assert('不同 seed 牌组 0 不同', JSON.stringify(dA.hands[0]) !== JSON.stringify(dC.hands[0]))
// seed 不影响牌数
eq('seeded deal 也是 4×27', dA.hands.every(h => h.length === 27) && dA.hands.reduce((s, h) => s + h.length, 0) === 108, true)
// mulberry32 单测
const r1 = E.mulberry32(42)
const r2 = E.mulberry32(42)
eq('同 seed mulberry32 输出相同', r1() === r2() && r1() === r2(), true)
const seq1 = [E.mulberry32(1)(), E.mulberry32(1)(), E.mulberry32(1)()]
const seq2 = [E.mulberry32(1)(), E.mulberry32(1)(), E.mulberry32(1)()]
eq('mulberry32 三连值确定', JSON.stringify(seq1), JSON.stringify(seq2))

console.log('\n=== 6. 升级序列 ===')
eq('2(15) → A(14)', E.getLevelRank(15, 1), 14)
eq('2(15) → K(13) 升 2', E.getLevelRank(15, 2), 13)
eq('3(3) → 2(15)', E.getLevelRank(3, 1), 15)
eq('A(14) 升 1 → K(13)', E.getLevelRank(14, 1), 13)
eq('A(14) 升 2 → Q(12)', E.getLevelRank(14, 2), 12)
eq('Q(12) 升 1 → J(11)', E.getLevelRank(12, 1), 11)

console.log('\n=== 7. 逢人配分离 ===')
const hand = [
  { suit: 1, rank: 5 },
  { suit: 0, rank: 5 },
  { suit: 0, rank: 7 }, { suit: 1, rank: 7 },
]
const split = E.splitGhosts(hand, 5)
eq('鬼牌 1 张', split.ghosts.length, 1)
eq('实牌 3 张', split.concrete.length, 3)

console.log('\n=== 8. groupHandByRank: 基本分组 ===')
{
  // 手牌:A K Q J 10 9 8 7 6 5 4 3 2 各 1 张
  const h = []
  for (const r of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 15]) {
    h.push({ suit: 0, rank: r })
  }
  const groups = E.groupHandByRank(h)
  eq('13 列(无 JOKER)', groups.length, 13)
  eq('第一列 rank=A(14)', groups[0].rank, 14)
  eq('A 列 1 张', groups[0].cards.length, 1)
  eq('最后列 rank=2(15)', groups[groups.length - 1].rank, 15)
}

console.log('\n=== 9. groupHandByRank: 同 rank 多张竖叠 ===')
{
  // 4 张 5,3 张 K,2 张 A
  const h = [
    { suit: 0, rank: 5 }, { suit: 1, rank: 5 }, { suit: 2, rank: 5 }, { suit: 3, rank: 5 },
    { suit: 0, rank: 13 }, { suit: 1, rank: 13 }, { suit: 2, rank: 13 },
    { suit: 0, rank: 14 }, { suit: 1, rank: 14 },
  ]
  const groups = E.groupHandByRank(h)
  eq('3 列', groups.length, 3)
  // A 列 2 张
  const colA = groups.find(g => g.rank === 14)
  eq('A 列 2 张', colA.cards.length, 2)
  // K 列 3 张
  const colK = groups.find(g => g.rank === 13)
  eq('K 列 3 张', colK.cards.length, 3)
  // 5 列 4 张
  const col5 = groups.find(g => g.rank === 5)
  eq('5 列 4 张', col5.cards.length, 4)
  // A 列内部按花色排序 ♠ ♥ ♣ ♦
  eq('A 列同 suit 顺序 ♠→♥', colA.cards[0].suit, 0)
  eq('A 列同 suit 顺序 ♠→♥', colA.cards[1].suit, 1)
}

console.log('\n=== 10. groupHandByRank: JOKER 单列 ===')
{
  const h = [
    { suit: 0, rank: 14 }, { suit: 0, rank: 5 },
    { suit: -1, rank: 16 }, { suit: -1, rank: 17 },
  ]
  const groups = E.groupHandByRank(h)
  eq('3 列(1 JOKER + 2 普通)', groups.length, 3)
  eq('第 1 列 isJoker=true', groups[0].isJoker, true)
  eq('JOKER 列 2 张', groups[0].cards.length, 2)
  eq('JOKER 列 main rank=17', groups[0].rank, 17)
  // JOKER 内:大王 17 排前
  eq('JOKER 列内 大王 17 在前', groups[0].cards[0].rank, 17)
  eq('JOKER 列内 小王 16 在后', groups[0].cards[1].rank, 16)
}

console.log('\n=== 11. groupHandByRank: 顺序 = AKQJT98765432 ===')
{
  // 给 3,5,K,9,A,2 — 验证列序
  const h = [
    { suit: 0, rank: 3 }, { suit: 0, rank: 5 }, { suit: 0, rank: 13 },
    { suit: 0, rank: 9 }, { suit: 0, rank: 14 }, { suit: 0, rank: 15 },
  ]
  const groups = E.groupHandByRank(h)
  eq('6 列', groups.length, 6)
  const order = groups.map(g => g.rank)
  eq('列序 AKQJT98765432', order, [14, 13, 9, 5, 3, 15])
}

console.log('\n=== 12. groupHandByRank: 边界 ===')
{
  // 空手牌
  eq('空手牌 = []', E.groupHandByRank([]).length, 0)
  eq('null = []', E.groupHandByRank(null).length, 0)
  // 单张大王
  const j = E.groupHandByRank([{ suit: -1, rank: 17 }])
  eq('单 JOKER 1 列', j.length, 1)
  eq('JOKER 列 isJoker', j[0].isJoker, true)
}

console.log('\n=== 13. groupHandByRank: 完整 27 张手牌分组 ===')
{
  const dealt = E.deal()
  const groups = E.groupHandByRank(dealt.hands[0])
  // 27 张最多 14 列(JOKER + 13 rank)
  assert('27 张分组后列数 <= 14', groups.length <= 14)
  // 所有列的 cards.length 之和 = 27
  const total = groups.reduce((s, g) => s + g.cards.length, 0)
  eq('所有列总张数 = 27', total, 27)
  // 验证 JOKER 列在最前
  if (groups[0].isJoker) {
    assert('JOKER 列在 group 数组首位', true)
  } else {
    assert('无 JOKER 时首位是 A(14)', groups[0].rank === 14)
  }
}

console.log('\n=== 14. P0-1:canFormWithGhosts 不再崩,返回正确结果 ===')
{
  // v3.x 修复:原 generateGhostAssignments 返回扁平数字数组,导致 assignment.map 抛 TypeError
  // 现在枚举组合后正确返回 boolean
  // 语义:concreteCards + ghostCount 张鬼牌 一起能否组成 targetType
  // 注意:targetLength 是组合牌的张数(PAIR=2, TRIPLE=3, STRAIGHT 5/6/...)
  const lr = 5  // 打 5
  // 凑单张 7:0 concrete + 1 鬼 → 鬼变 7
  let ok = E.canFormWithGhosts(E.TYPE.SINGLE, 1, 7, [], 1, lr)
  assert('0 concrete + 1 鬼 → 可凑单张 7', ok === true)
  // 凑单张 7:1 concrete(rank=7) + 0 鬼 → 直接成
  ok = E.canFormWithGhosts(E.TYPE.SINGLE, 1, 7, [{ suit: 0, rank: 7 }], 0, lr)
  assert('1 concrete + 0 鬼 → 凑单张 7', ok === true)
  // 凑对子 9:1 concrete(rank=9) + 1 鬼 → 鬼变 9 = PAIR mainRank=9 length=2
  ok = E.canFormWithGhosts(E.TYPE.PAIR, 2, 9, [{ suit: 0, rank: 9 }], 1, lr)
  assert('1 concrete + 1 鬼 → 凑对子 9', ok === true)
  // 凑对子 7:1 concrete(rank=3) + 1 鬼 → 鬼变 7 + concrete 3 = 2 张不是对子 = false
  ok = E.canFormWithGhosts(E.TYPE.PAIR, 2, 7, [{ suit: 0, rank: 3 }], 1, lr)
  assert('1 concrete + 1 鬼 + 凑对子 7 = false(concrete rank 不对)', ok === false)
  // 0 鬼,concrete = 单张 9,凑单张 9
  ok = E.canFormWithGhosts(E.TYPE.SINGLE, 1, 9, [{ suit: 0, rank: 9 }], 0, lr)
  assert('0 鬼纯 concrete = 正常识别', ok === true)
  // 0 concrete + 2 鬼 → 对子(两鬼变同 rank)
  ok = E.canFormWithGhosts(E.TYPE.PAIR, 2, 11, [], 2, lr)
  assert('0 concrete + 2 鬼 → 凑对子 11', ok === true)
  // 1 concrete + 2 鬼 → 三张(1 concrete + 2 鬼变同 rank)
  ok = E.canFormWithGhosts(E.TYPE.THREE, 3, 9, [{ suit: 0, rank: 9 }], 2, lr)
  assert('1 concrete(rank 9) + 2 鬼 → 凑三张 9', ok === true)
  // 总张数不匹配 → false(concrete+ghost ≠ targetLength)
  ok = E.canFormWithGhosts(E.TYPE.PAIR, 2, 3, [{ suit: 0, rank: 3 }, { suit: 2, rank: 3 }], 2, lr)
  assert('2 concrete + 2 鬼 + targetLength=2 = false(总张数不匹配)', ok === false)
  // ghostCount > 2 不支持,返回 false
  ok = E.canFormWithGhosts(E.TYPE.SINGLE, 1, 5, [{ suit: 0, rank: 3 }], 3, lr)
  assert('3 张鬼 = false(不支持)', ok === false)
  // 不崩溃:大量组合枚举
  let crashed = false
  try {
    E.canFormWithGhosts(E.TYPE.PAIR, 2, 14, [{ suit: 0, rank: 3 }], 1, lr)
  } catch (e) { crashed = true }
  assert('canFormWithGhosts 不抛 TypeError', !crashed)
}

console.log('\n=== 15. P3-1 + P3-2:常量正确性回归 ===')
{
  // v3.x 修复:原注释写反(大王=16,小王=15),实际是 大王=17,小王=16
  eq('RANK_NAMES[16]=小王', E.RANK_NAMES[16], '小王')
  eq('RANK_NAMES[17]=大王', E.RANK_NAMES[17], '大王')
  // v3.x 修复:LEVEL_SEQUENCE 不再 export(无调用方,避免误导)
  assert('LEVEL_SEQUENCE 不在导出中', E.LEVEL_SEQUENCE === undefined)
}

console.log('\n=== 16. P3-4:王炸简化后仍识别 4 王 ===')
{
  // v3.x 修复:去掉冗余 len===4 检查后,仍能识别 4 王
  const jokers = [
    { suit: -1, rank: 16 }, { suit: -1, rank: 16 },
    { suit: -1, rank: 17 }, { suit: -1, rank: 17 },
  ]
  const r = E.recognize(jokers)
  eq('4 王 → KINGS_BOMB', r.type, E.TYPE.KINGS_BOMB)
  eq('4 王 mainRank=17', r.mainRank, 17)
  // 也测不规则排序的 4 王
  const shuffled = [
    { suit: -1, rank: 17 }, { suit: -1, rank: 16 },
    { suit: -1, rank: 17 }, { suit: -1, rank: 16 },
  ]
  const r2 = E.recognize(shuffled)
  eq('4 王乱序 → KINGS_BOMB', r2.type, E.TYPE.KINGS_BOMB)
}

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========\n`)
process.exit(fail > 0 ? 1 : 0)
