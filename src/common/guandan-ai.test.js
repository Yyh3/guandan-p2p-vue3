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

console.log('\n=== 10. autoPlayGrouped: 主动出最小炸弹(留大炸弹防守) ===')
{
  // v3.x P1-9 修复:同时有 5 张 8 和 4 张 3 → 主动出 4 张 3(留 5 炸防守)
  //   旧版出 5 张 8(扔最大炸弹)浪费防守资源,新版主动出最小炸弹
  //   用 levelRank=15(打 2)避免和测试数据冲突
  const lr = 15
  const h = [
    c(8, 0), c(8, 1), c(8, 2), c(8, 3), c(8, 0),  // 5 张 8(双副牌)— 留作防守
    c(3, 0), c(3, 1), c(3, 2), c(3, 3),  // 4 炸 3 — 主动出
  ]
  const r = AI.autoPlayGrouped(h, null, lr)
  eq('出 4 张(最小炸弹)', r.cards.length, 4)
  const rec = E.recognize(r.cards)
  eq('识别为 BOMB_4', rec.type, E.TYPE.BOMB_4)
  eq('炸弹 mainRank=3', rec.mainRank, 3)
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

console.log('\n=== 23. P1-7:三带二(THREE_PAIR)鬼牌凑出 5 张 ===')
{
  // 修复前:2 concrete(r) + 2 鬼 = 4 张,非法(THREE_PAIR 要 5 张)
  // 修复后:2 concrete(r) + 1 concrete(r2) + 2 鬼 = 5 张
  const lr = 15  // 打 2,避免红桃级牌歧义
  // 手牌:2 张 5(rank=5) + 1 张 7(rank=7) + 2 张红心 2(鬼)
  const h = [
    c(5, 0), c(5, 2),  // 2 张 5 → 凑三张(2 + 1 鬼)
    c(7, 3),             // 1 张 7 → 凑对子(1 + 1 鬼)
    c(15, 1), c(15, 1),  // 2 张鬼(红心 2)
  ]
  // 跟对方的三带二 mainRank=3
  const target = { type: E.TYPE.THREE_PAIR, mainRank: 3, length: 5 }
  const r = AI.decide(h, target, lr)
  assert('P1-7:三带二鬼牌凑出 = play', r.type === 'play')
  if (r.type === 'play') {
    // bug 修了之后应返回 5 张(2 concrete + 1 concrete + 2 鬼 = 5)
    // 老版本只返 4 张(2 concrete + 2 鬼 = 4,非法)
    eq('P1-7:出 5 张(不是 4 张)', r.cards.length, 5)
    // 验证鬼牌在 result 里(没被吞掉)
    const ghostCount = r.cards.filter(c => c.suit === 1 && c.rank === lr).length
    eq('P1-7:result 包含 2 张鬼', ghostCount, 2)
    // 不直接调 E.recognize — 鬼牌没被具象化,recognize 不认识
    // 但 5 张牌 + 2 张鬼 + 3 张 concrete(2 个 r + 1 个 r2) → 正确组成 THREE_PAIR 形态
  }
}

console.log('\n=== 20. P0-2:findMinStraight 鬼牌不耗尽(多 start 候选间) ===')
{
  // 测试:第 1 个 start 失败时,鬼牌仍可用于第 2 个 start
  // 桌面要求 3 张顺子 main > 5(concrete 给不出,必须用鬼)
  // 之前 bug:第 1 个 start 用完鬼牌后,后续 start 没鬼牌可用
  const lr = 5
  const ghost = { suit: 1, rank: lr }
  // 手牌:concrete 7,8 + 鬼
  // 顺子 main > 5 → 候选 start:6(需 6,7,8),7(需 7,8,9)
  // 第 1 个 start=6:concrete 有 7,8,缺 6 → 用鬼补 6 → 成功 (但 main=6)
  // 实际我们想要 main > target,所以用更高 target 测
  // target main=6 → start 候选 7(7,8,9):concrete 有 7,8,缺 9 → 用鬼补 9
  const target = { type: E.TYPE.STRAIGHT, mainRank: 6, length: 3 }
  // 用 decide 测试,验证能出牌
  const r = AI.decide([c(7, 0), c(8, 2), ghost], target, lr)
  assert('decide 能出 7,8,鬼 顺子压 6', r.type === 'play')
  eq('出 3 张', r.cards.length, 3)
}

console.log('\n=== 21. P0-3:打 2 时鬼牌(rank=15)允许在顺子里 ===')
{
  // bug:打 2 时鬼牌是红心 2(rank=15),filter 15/16/17 会错误拒绝
  // 修后:鬼牌允许充当 2/王,顺子里的 concrete 不能是 2/王 即可
  const lr = 15  // 打 2
  const ghost = { suit: 1, rank: 15 }  // 红心 2 = 鬼
  // 手牌:7,8 + 鬼,跟 5 起顺子(target mainRank=5)
  const target = { type: E.TYPE.STRAIGHT, mainRank: 5, length: 3 }
  const r = AI.decide([c(7, 0), c(8, 2), ghost], target, lr)
  assert('打 2 时鬼牌可补顺子', r.type === 'play')
  eq('出 3 张', r.cards.length, 3)
  // 验证出牌 rank = [7,8,15] 或等价排列
  const ranks = r.cards.map(x => x.rank).sort((a, b) => a - b)
  eq('ranks 含 15(鬼)', ranks.includes(15), true)
}

console.log('\n=== 22. P0-2 多鬼牌版:findMinPairStraight 鬼牌不耗尽 ===')
{
  // 跟牌:连对 target mainRank=5
  // 第 1 个 pair 候选 start=6(6,7,8 三对),第 2 个 start=7(7,8,9)
  // concrete: 7x2, 8x2, 9x2 + 1 鬼(打 5 时鬼=红心 5)
  // start=7 需要 7,8,9 三对 → 都用 concrete 凑出,不需要鬼
  // 这场景是测鬼牌不被无谓消耗
  const lr = 5
  const ghost = { suit: 1, rank: lr }
  const target = { type: E.TYPE.PAIR_STRAIGHT, mainRank: 5, length: 6 }  // 3 对
  const h = [
    c(7, 0), c(7, 2),  // 7 对
    c(8, 0), c(8, 2),  // 8 对
    c(9, 0), c(9, 2),  // 9 对
    ghost,
  ]
  const r = AI.decide(h, target, lr)
  assert('连对 7-8-9 可出', r.type === 'play')
  eq('出 6 张', r.cards.length, 6)
}

// ============================================================
// v0.4.9 Hard 难度测试
// ============================================================
console.log('\n=== 23. Hard 难度:API 存在性 + 默认行为 ===')
{
  const AI = await import('./guandan-ai.js')
  assert('★ chooseLeadHard 是 function', typeof AI.chooseLeadHard === 'function')
  assert('★ findMinBeatHard 是 function', typeof AI.findMinBeatHard === 'function')
  // hard 难度 decide 路由
  const hand = [{ suit: 0, rank: 3 }, { suit: 1, rank: 5 }, { suit: 2, rank: 7 }, { suit: 3, rank: 9 }]
  const r1 = AI.decide(hand, null, 2, {}, 'hard')
  assert('★ hard 首家:有出牌结果', r1.type === 'play')
  // medium 难度 decide 默认行为(无 difficulty 参数)
  const r2 = AI.decide(hand, null, 2, {})
  assert('★ medium 首家:有出牌结果', r2.type === 'play')
}

console.log('\n=== 24. Hard 难度:炸弹保留(手牌 ≤ 6 张且有炸弹) ===')
{
  const AI = await import('./guandan-ai.js')
  // 6 张手牌:含 4 张 3 (4 炸) + 2 张单牌 5/7
  // hard 难度:不出 4 张炸(留作关键时刻),改出对子 5/7?没有对子 → 出单张
  const hand = [
    { suit: 0, rank: 3 }, { suit: 1, rank: 3 }, { suit: 2, rank: 3 }, { suit: 3, rank: 3 },
    { suit: 0, rank: 5 }, { suit: 1, rank: 7 },
  ]
  const rHard = AI.chooseLeadHard(hand, 2)
  // hard 不出 4 张炸(preserveBomb 触发),应出 1 张单牌
  assert('★ hard 手牌 6 张含 4 炸:不出 4 张炸', rHard.cards.length < 4)
}

console.log('\n=== 25. Hard 难度:手牌 > 6 张时主动出炸弹 ===')
{
  const AI = await import('./guandan-ai.js')
  // 10 张手牌:含 4 张 3 (4 炸) + 6 张单牌
  const hand = [
    { suit: 0, rank: 3 }, { suit: 1, rank: 3 }, { suit: 2, rank: 3 }, { suit: 3, rank: 3 },
    { suit: 0, rank: 5 }, { suit: 1, rank: 6 }, { suit: 2, rank: 7 },
    { suit: 3, rank: 8 }, { suit: 0, rank: 9 }, { suit: 1, rank: 10 },
  ]
  const rHard = AI.chooseLeadHard(hand, 2)
  console.log('  [debug 25] rHard.cards =', rHard.cards.map(c => `${c.suit}-${c.rank}`))
  // hard 手牌 > 6 张:可以出 4 张炸
  assert('★ hard 手牌 10 张含 4 炸:出 4 张炸(不 preserve)', rHard.cards.length === 4)
  assert('★ hard 出的 4 张炸是 rank 最小(3)', rHard.cards.every(c => c.rank === 3))
}

console.log('\n=== 26. Hard 难度:优先出小成组(对子/三张 rank <= 10) ===')
{
  const AI = await import('./guandan-ai.js')
  // 7 张手牌:含 K 对子(2 张 K) + 9 对子(2 张 9) + 5/6/7 单张
  //   hard:优先出"小成组"(9 对子,rank<=10),不出 K 对子(大对子)
  const hand = [
    { suit: 0, rank: 13 }, { suit: 1, rank: 13 },  // K 对子
    { suit: 0, rank: 9 }, { suit: 1, rank: 9 },    // 9 对子
    { suit: 2, rank: 5 }, { suit: 3, rank: 6 }, { suit: 0, rank: 7 },
  ]
  const rHard = AI.chooseLeadHard(hand, 2)
  // hard 应出 9 对子(2 张,rank 9)
  assert('★ hard 优先出小成组对子(不是大 K 对子)',
    rHard.cards.length === 2 && rHard.cards.every(c => c.rank === 9))
}

console.log('\n=== 27. Hard 难度:鬼牌保留(2+ 张鬼牌时不出) ===')
{
  const AI = await import('./guandan-ai.js')
  // 7 张手牌:2 张鬼牌(逢人配=levelRank=14 红桃) + 5 张小牌
  const hand = [
    { suit: 1, rank: 14 }, { suit: 1, rank: 14 },  // 2 张鬼(红桃级牌)
    { suit: 0, rank: 3 }, { suit: 1, rank: 5 }, { suit: 2, rank: 7 },
    { suit: 3, rank: 9 }, { suit: 0, rank: 11 },
  ]
  const rHard = AI.chooseLeadHard(hand, 14)
  // hard 应出 concrete 单牌,不出鬼牌
  const hasGhost = rHard.cards.some(c => c.suit === 1 && c.rank === 14)
  assert('★ hard 有 2 张鬼牌时不出鬼(preserveGhosts)', !hasGhost)
}

console.log('\n=== 28. Hard 难度:跟牌 findMinBeatHard 炸弹保护(手牌 ≤ 6) ===')
{
  const AI = await import('./guandan-ai.js')
  // 6 张手牌:含 4 张 5 炸弹 + 2 张小牌
  //   对手出单张 7,findMinBeatHard 应:
  //     - 不出 4 张 5 炸弹(对手单张 7,浪费炸弹,留作关键时刻)
  //     - 返回 null 让 AI pass
  const hand = [
    { suit: 0, rank: 5 }, { suit: 1, rank: 5 }, { suit: 2, rank: 5 }, { suit: 3, rank: 5 },
    { suit: 0, rank: 9 }, { suit: 1, rank: 11 },
  ]
  const currentPlay = { type: 'SINGLE', mainRank: 7, length: 1, cards: [{ suit: 0, rank: 7 }] }
  const beatHard = AI.findMinBeatHard(hand, currentPlay, 0, 2)
  // hard 不出 4 张炸 → findMinBeatHard 返回 null(让 AI pass)
  assert('★ hard 跟单张不出 4 张炸(PASS)', beatHard === null)
  // 反向:不传鬼牌时 findMinBeat(medium 默认)应该能跟(出 9 或其他)
  const beatNoGhost = AI.findMinBeat(hand, currentPlay, 0, 2)
  assert('★ findMinBeat(跟单张 7) 不为 null(能跟)',
    beatNoGhost !== null && beatNoGhost.length > 0)
}

console.log('\n=== 29. Hard 难度:autoPlayGrouped 保留王炸/同花顺(手牌 > 8) ===')
{
  const AI = await import('./guandan-ai.js')
  // 10 张手牌:含 4 王(王炸) + 5 张同花顺 + 1 张单牌
  const hand = [
    { suit: 0, rank: 16 }, { suit: 1, rank: 17 },  // 2 张王
    { suit: 2, rank: 16 }, { suit: 3, rank: 17 },  // 凑齐 4 王
    // 同花顺 ♠ 3-4-5-6-7
    { suit: 0, rank: 3 }, { suit: 0, rank: 4 }, { suit: 0, rank: 5 }, { suit: 0, rank: 6 }, { suit: 0, rank: 7 },
    { suit: 1, rank: 9 },
  ]
  // hard 手牌 > 8:不出王炸/同花顺/炸弹 → 应该出最大 4 张炸?手牌没有 4 张炸 → 出 3 张 / 对子 / 单张
  const rHard = AI.autoPlayGrouped(hand, null, 2, {}, 'hard')
  console.log('  [debug 29] rHard.cards =', rHard.cards.map(c => `${c.suit}-${c.rank}`))
  // 简化断言:hard 不出 4 王(王炸),也不出 5 张同花顺
  const isJokerBomb = rHard.cards.length === 4 && rHard.cards.every(c => c.rank >= 16)
  const isFlush = rHard.cards.length === 5 && rHard.cards.every(c => c.suit === 0 && c.rank <= 7)
  assert('★ hard 一键理不出 4 王炸', !isJokerBomb)
  assert('★ hard 一键理不出 5 张同花顺', !isFlush)
}

console.log('\n=== 30. Hard 难度:decide(hand, currentPlay, levelRank, ctx, difficulty) 路由 ===')
{
  const AI = await import('./guandan-ai.js')
  // 6 张手牌:含 4 张 5 炸弹 + 2 张小牌;对手出单张 7
  const hand = [
    { suit: 0, rank: 5 }, { suit: 1, rank: 5 }, { suit: 2, rank: 5 }, { suit: 3, rank: 5 },
    { suit: 0, rank: 9 }, { suit: 1, rank: 11 },
  ]
  const currentPlay = { type: 'SINGLE', mainRank: 7, length: 1, cards: [{ suit: 0, rank: 7 }] }
  // hard 跟牌:不出 4 张炸(返回 pass)
  const rHard = AI.decide(hand, currentPlay, 2, {}, 'hard')
  assert('★ hard decide(跟单张 7) → pass(不出 4 炸)', rHard.type === 'pass')
}

console.log('\n=== 31. Phase 1 修复行为回归 ===')
  {
    const AI = await import('./guandan-ai.js')
    // 31.1 chooseLead 优先出成组牌(对子)
    {
      const hand = [c(5, 0), c(5, 2), c(7, 1), c(9, 3)]
      const r = AI.chooseLead(hand, 2)
      assert('chooseLead 有对子时不出单张', r.cards.length === 2)
      assert('chooseLead 出最小对子 5', r.cards.every(c => c.rank === 5))
    }
    // 31.2 findMinBeat 尊重 ghostCount=0(不用鬼牌)
    {
      // 只有鬼牌能压时,ghostCount=0 应返回 null
      const hand = [{ suit: 1, rank: 2 }]
      const target = { type: E.TYPE.SINGLE, mainRank: 14, length: 1 }
      const withGhost = AI.findMinBeat(hand, target, 1, 2)
      const noGhost = AI.findMinBeat(hand, target, 0, 2)
      assert('ghostCount=1 可用鬼牌跟单张 A', withGhost && withGhost.length === 1)
      assert('ghostCount=0 禁用鬼牌时无法跟', noGhost === null)
    }
    // 31.3 王炸不可压王炸
    {
      const hand = [c(16, -1), c(16, -1), c(17, -1), c(17, -1)]
      const target = { type: E.TYPE.KINGS_BOMB, mainRank: 17, length: 4 }
      const r = AI.findMinBeat(hand, target, 0, 2)
      assert('王炸对王炸不能压', r === null)
    }
    // 31.4 A 高顺子可被找出
    {
      const hand = [c(10, 0), c(11, 1), c(12, 0), c(13, 2), c(14, 1)]
      const target = { type: E.TYPE.STRAIGHT, mainRank: 9, length: 5 }
      const r = AI.findMinBeat(hand, target, 0, 2)
      assert('A 高顺子(10-J-Q-K-A)能压 9 高顺', r && r.length === 5)
    }
    // 31.5 三张可用 2 实牌 + 1 鬼
    {
      const hand = [c(8, 0), c(8, 2), { suit: 1, rank: 2 }]
      const target = { type: E.TYPE.THREE, mainRank: 5, length: 3 }
      const r = AI.findMinBeat(hand, target, 1, 2)
      assert('2 实牌 + 1 鬼可压三张', r && r.length === 3)
    }
    // 31.6 autoPlayGrouped 用鬼牌填补顺子中间缺张
    {
      const hand = [c(3, 0), c(4, 0), c(5, 0), c(7, 0), c(8, 0), { suit: 1, rank: 2 }]
      const r = AI.autoPlayGrouped(hand, null, 2)
      // ★ P1-04:严格模式下顺子恰好 5 张
      assert('autoPlayGrouped 用鬼补顺子(长度=5)', r.cards.length === 5)
      const concrete = r.cards.filter(c => !(c.suit === 1 && c.rank === 2))
      const ghostCount = r.cards.length - concrete.length
      let canForm = false
      for (let main = 3; main <= 14; main++) {
        if (E.canFormWithGhosts(E.TYPE.STRAIGHT, r.cards.length, main, concrete, ghostCount, 2)) {
          canForm = true
          break
        }
      }
      assert('补齐后可具象化为合法顺子', canForm)
    }
  }

console.log(`\n========== AI 测试结果: ${pass} 通过 / ${fail} 失败 ==========\n`)
process.exit(fail > 0 ? 1 : 0)
