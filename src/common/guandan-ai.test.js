/**
 * AI 自测
 */
import * as AI from './guandan-ai.js'
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

// 工具
const c = (rank, suit = 0) => ({ suit, rank })
const R = (s) => s.split('').map(Number)  // 简化:把字符串 "3,4,5" 转成数组
const hand = (...cards) => cards
const levelRank = 5  // 打 5

console.log('\n=== 1. 领出:小牌优先 ===')
{
  const h = [c(5, 0), c(7, 1), c(13, 2), c(15, 3)]
  const r = AI.decide(h, null, levelRank)
  assert('有牌时领出 = play', r.type === 'play')
  eq('出最小单张 5', r.cards, [c(5, 0)])
}

console.log('\n=== 2. 跟单张:能压就压最小 ===')
{
  const h = [c(7, 0), c(8, 1), c(9, 2), c(15, 3)]
  // 桌面是单 7
  const target = { type: E.TYPE.SINGLE, mainRank: 7, length: 1 }
  const r = AI.decide(h, target, levelRank)
  eq('用 8 压 7', r.cards, [c(8, 1)])
}
{
  const h = [c(15, 0), c(15, 1)]  // 两张 2
  const target = { type: E.TYPE.SINGLE, mainRank: 14, length: 1 }
  const r = AI.decide(h, target, levelRank)
  assert('两张 2 必压', r.type === 'play')
}

console.log('\n=== 3. 跟对子:最小对能压 ===')
{
  const h = [c(5, 0), c(5, 1), c(7, 2), c(7, 3), c(9, 0)]
  const target = { type: E.TYPE.PAIR, mainRank: 5, length: 2 }
  const r = AI.decide(h, target, levelRank)
  eq('用 77 压 55', r.cards, [c(7, 2), c(7, 3)])
}
{
  const h = [c(3, 0), c(3, 1), c(4, 2), c(4, 3), c(5, 0)]
  const target = { type: E.TYPE.PAIR, mainRank: 5, length: 2 }
  const r = AI.decide(h, target, levelRank)
  // 没有 > 5 的对 → 应该用炸弹或 pass
  assert('压不起时考虑 pass 或炸弹', r.type === 'pass' || E.recognize(r.cards).type === E.TYPE.BOMB_4)
}

console.log('\n=== 4. 跟炸弹:同张数 rank 大 ===')
{
  const h = [
    c(8, 0), c(8, 1), c(8, 2), c(8, 3),  // 4 炸 8
    c(15, 0), c(15, 1),  // 2 张 2
  ]
  const target = { type: E.TYPE.BOMB_4, mainRank: 5, length: 4 }
  const r = AI.decide(h, target, levelRank)
  eq('4 炸 8 压 4 炸 5', r.cards, [c(8, 0), c(8, 1), c(8, 2), c(8, 3)])
}
{
  const h = [c(8, 0), c(8, 1), c(8, 2), c(8, 3)]
  const target = { type: E.TYPE.BOMB_5, mainRank: 5, length: 5 }  // 5 炸
  const r = AI.decide(h, target, levelRank)
  eq('4 炸压不了 5 炸', r.type, 'pass')
}

console.log('\n=== 5. 鬼牌凑牌 ===')
{
  // 手牌:红桃 5(鬼)+ 4 + 4 → 可以凑对 4
  const h = [c(4, 0), c(4, 1), { suit: 1, rank: 5 }]  // 红桃 5 = 鬼(打 5)
  const target = { type: E.TYPE.PAIR, mainRank: 3, length: 2 }
  const r = AI.decide(h, target, levelRank)
  assert('鬼+对4 压对 3', r.type === 'play')
  eq('出 2 张(鬼+4)', r.cards.length, 2)
}
{
  // 手牌:红桃 5(鬼)+ 3 张 6 → 能出 4 炸
  const h = [c(6, 0), c(6, 1), c(6, 2), { suit: 1, rank: 5 }]
  const target = { type: E.TYPE.SINGLE, mainRank: 14, length: 1 }  // 单 A
  const r = AI.decide(h, target, levelRank)
  assert('能压单张', r.type === 'play')
  // AI 会选择代价最小的:出 1 张鬼(1 张)优于 4 炸(4 张)
  eq('代价最小:出 1 张鬼', r.cards.length, 1)
}

console.log('\n=== 6. 队友接风:出小牌 ===')
{
  const h = [c(5, 0), c(7, 1), c(13, 2), c(15, 3)]
  // 队友刚出完 → isTeammateLast=true,自由出
  const target = { type: E.TYPE.SINGLE, mainRank: 15, length: 1 }
  const r = AI.decide(h, target, levelRank, { isTeammateLast: true })
  eq('接风:出最小单张 5', r.cards, [c(5, 0)])
}

console.log('\n=== 7. 跟同花顺 ===')
{
  // 手牌有 ♠ 6,7,8,9,10 → 同花顺
  const h = [
    c(6, 0), c(7, 0), c(8, 0), c(9, 0), c(10, 0),
    c(15, 0), c(15, 1),
  ]
  const target = { type: E.TYPE.STRAIGHT_FLUSH, mainRank: 5, length: 5 }  // 较小同花顺
  const r = AI.decide(h, target, levelRank)
  assert('同花顺压同花顺', r.type === 'play')
  assert('出 5 张', r.cards.length === 5)
  const rec = E.recognize(r.cards)
  assert('识别成同花顺', rec.type === E.TYPE.STRAIGHT_FLUSH)
}

console.log('\n=== 8. 完整一局(简化) ===')
{
  const dealt = E.deal()
  // 4 个 AI 对战
  const hands = dealt.hands
  const orders = [0, 1, 2, 3]  // 座位 0,1,2,3 轮流出
  let currentPlay = null
  let currentPlayer = 0
  const finished = []
  for (let round = 0; round < 500; round++) {
    const myHand = hands[currentPlayer]
    const ctx = {
      isTeammateLast: currentPlay && (currentPlayer + 2) % 4 === orders[(orders.indexOf(currentPlayer) + 1) % 4],
      mySeatIndex: currentPlayer,
      teammateSeatIndex: (currentPlayer + 2) % 4,
    }
    const r = AI.decide(myHand, currentPlay, 5, ctx)
    if (r.type === 'play') {
      // 验证牌在手里
      for (const card of r.cards) {
        const idx = myHand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
        if (idx < 0) {
          console.log(`  ✗ 牌不在手牌中! player=${currentPlayer}, card=`, card)
          fail++
          break
        }
        myHand.splice(idx, 1)
      }
      currentPlay = { ...E.recognize(r.cards) }
      if (myHand.length === 0) {
        finished.push(currentPlayer)
        if (finished.length >= 2) break
        // 出完牌后:接风给下家(下家是当前出完牌的人的对家,简化:下家继续)
      }
    } else {
      // pass
      currentPlay = null
    }
    currentPlayer = (currentPlayer + 1) % 4
  }
  assert('AI 完整打 1 局不出错', finished.length >= 1)
  console.log(`  ℹ  1 局结束,出完牌的人: ${finished.length}, 玩家 0 剩余 ${hands[0].length} 张`)
}

// =====================================================================
// autoPlayGrouped 测试
// =====================================================================
console.log('\n=== 9. autoPlayGrouped: 优先出炸弹 ===')
{
  // 手牌里有 4 张 5 + 散牌 → 应当出 4 炸
  const h = [
    c(5, 0), c(5, 1), c(5, 2), c(5, 3),  // 4 炸 5
    c(7, 0), c(9, 1), c(13, 2),
  ]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  assert('有炸弹时首选炸弹', r.type === 'play')
  eq('出 4 张 5 炸', r.cards.length, 4)
  // 验证是 4 炸
  const rec = E.recognize(r.cards)
  eq('识别为 BOMB_4', rec.type, E.TYPE.BOMB_4)
  eq('炸弹 mainRank=5', rec.mainRank, 5)
}

console.log('\n=== 10. autoPlayGrouped: 优先 5 炸 优于 4 炸 ===')
{
  // 同时有 5 张 8 和 4 张 3 → 出 5 炸(更值得出)
  // 用 levelRank=15(打 2)避免和测试数据冲突
  const lr = 15
  const h = [
    c(8, 0), c(8, 1), c(8, 2), c(8, 3), c(8, 0),  // 5 张 8(双副牌)
    c(3, 0), c(3, 1), c(3, 2), c(3, 3),  // 4 炸 3
  ]
  const r = AI.autoPlayGrouped(h, null, lr)
  eq('出 5 张', r.cards.length, 5)
  const rec = E.recognize(r.cards)
  eq('识别为 BOMB_5', rec.type, E.TYPE.BOMB_5)
  eq('炸弹 mainRank=8', rec.mainRank, 8)
}

console.log('\n=== 11. autoPlayGrouped: 凑顺子 ===')
{
  // 手牌:3 4 5 6 7 9 + 散牌 → 应当出 34567 顺子
  const h = [
    c(3, 0), c(4, 1), c(5, 2), c(6, 3), c(7, 0),
    c(9, 1), c(13, 2), c(15, 3),
  ]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  eq('出 5 张顺子', r.cards.length, 5)
  const rec = E.recognize(r.cards)
  eq('识别为 STRAIGHT', rec.type, E.TYPE.STRAIGHT)
  eq('顺子 mainRank=7', rec.mainRank, 7)
}

console.log('\n=== 12. autoPlayGrouped: 无可凑时出最大单张 ===')
{
  // 手牌只有散牌,没顺子/对/三/炸 → 出最大单张
  const h = [c(3, 0), c(7, 1), c(9, 2), c(13, 3)]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  eq('出 1 张', r.cards.length, 1)
  eq('出最大 K(13)', r.cards[0].rank, 13)
}

console.log('\n=== 13. autoPlayGrouped: 王炸最强 ===')
{
  // 手牌有 4 王 → 出王炸
  const h = [
    c(17, -1), c(17, -1), c(16, -1), c(16, -1),  // 4 王
    c(3, 0), c(5, 1),
  ]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  eq('出 4 王', r.cards.length, 4)
  const rec = E.recognize(r.cards)
  eq('识别为 KINGS_BOMB', rec.type, E.TYPE.KINGS_BOMB)
}

console.log('\n=== 14. autoPlayGrouped: 同花顺 ===')
{
  // 手牌有 ♠ 6,7,8,9,10 → 同花顺
  const h = [
    c(6, 0), c(7, 0), c(8, 0), c(9, 0), c(10, 0),
    c(3, 1), c(5, 2),
  ]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  eq('出 5 张同花顺', r.cards.length, 5)
  const rec = E.recognize(r.cards)
  eq('识别为 STRAIGHT_FLUSH', rec.type, E.TYPE.STRAIGHT_FLUSH)
  eq('同花顺 mainRank=10', rec.mainRank, 10)
}

console.log('\n=== 15. autoPlayGrouped: 钢板 ===')
{
  // 手牌:3 个 5,3 个 6 → 出钢板 56
  // 用 levelRank=15(打 2)避免 c(5,1)=红桃 5 被当鬼
  const lr = 15
  const h = [
    c(5, 0), c(5, 2), c(5, 3),
    c(6, 0), c(6, 1), c(6, 2),
    c(9, 3), c(13, 0),
  ]
  const r = AI.autoPlayGrouped(h, null, lr)
  eq('出 6 张钢板', r.cards.length, 6)
  const rec = E.recognize(r.cards)
  eq('识别为 THREE_STRAIGHT', rec.type, E.TYPE.THREE_STRAIGHT)
  eq('钢板 mainRank=6', rec.mainRank, 6)
}

console.log('\n=== 16. autoPlayGrouped: 连对 ===')
{
  // 手牌:4,5,6 各 2 张 → 出连对 456
  const h = [
    c(4, 0), c(4, 1), c(5, 2), c(5, 3), c(6, 0), c(6, 1),
    c(15, 0),
  ]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  eq('出 6 张连对', r.cards.length, 6)
  const rec = E.recognize(r.cards)
  eq('识别为 PAIR_STRAIGHT', rec.type, E.TYPE.PAIR_STRAIGHT)
}

console.log('\n=== 17. autoPlayGrouped: 三带二 ===')
{
  // 手牌:3 个 5 + 2 个 7 → 出三带二
  // 用 levelRank=15(打 2)避免 c(5,1)=红桃 5 被当鬼
  const lr = 15
  const h = [
    c(5, 0), c(5, 2), c(5, 3),
    c(7, 0), c(7, 2),
    c(9, 3),
  ]
  const r = AI.autoPlayGrouped(h, null, lr)
  eq('出 5 张三带二', r.cards.length, 5)
  const rec = E.recognize(r.cards)
  eq('识别为 THREE_PAIR', rec.type, E.TYPE.THREE_PAIR)
}

console.log('\n=== 18. autoPlayGrouped: 没可凑时 fallback ===')
{
  // 手牌:1 张 3 + 1 张 J(完全不可凑) → 退到出单张
  const h = [c(3, 0), c(11, 1)]
  const r = AI.autoPlayGrouped(h, null, levelRank)
  assert('仍能出牌', r.type === 'play')
  eq('出 1 张', r.cards.length, 1)
}

console.log('\n=== 19. autoPlayGrouped: 空手牌 pass ===')
{
  const r = AI.autoPlayGrouped([], null, levelRank)
  eq('空手牌 = pass', r.type, 'pass')
}

console.log(`\n========== AI 测试结果: ${pass} 通过 / ${fail} 失败 ==========\n`)
process.exit(fail > 0 ? 1 : 0)
