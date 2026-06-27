/**
 * history.js 纯函数库测试
 * v0.4.9 玩家统计 / 战绩趋势图
 */
import {
  isMyTeamWin, getMyRank,
  computeWinRate, computeAvgLevelUp, computeLevelUpTrend,
  computeRankDistribution, computeRecentForm, computeStreak,
  computeSummary,
} from './history.js'

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

// helper:造 1 局战绩,ranks 是座位数组
function mkRec(ranks, levelUp = 1, mySeat = 0) {
  return {
    time: Date.now(),
    ranks,
    players: ranks.reduce((acc, s, i) => {
      acc[s] = { name: `P${s}`, avatar: '🀄' }
      return acc
    }, {}),
    levelUp,
    mySeat,  // 冗余存,测试用
  }
}

console.log('\n=== 1. isMyTeamWin 判定 ===')
{
  // 我在 seat 0,头游 seat 0 → 胜(0%2=0)
  assert('★ seat 0 头游 = 胜', isMyTeamWin(mkRec([0, 1, 2, 3]), 0))
  // 我在 seat 0,头游 seat 2 → 胜(2%2=0,同队)
  assert('★ seat 0 队友头游(seat 2)= 胜', isMyTeamWin(mkRec([2, 1, 0, 3]), 0))
  // 我在 seat 0,头游 seat 1 → 败(1%2=1)
  assert('★ seat 0 对家头游(seat 1)= 败', !isMyTeamWin(mkRec([1, 0, 2, 3]), 0))
  // 我在 seat 1,头游 seat 0 → 败
  assert('★ seat 1 对家头游(seat 0)= 败', !isMyTeamWin(mkRec([0, 1, 2, 3]), 1))
  // 我在 seat 1,头游 seat 1 → 胜
  assert('★ seat 1 自己头游 = 胜', isMyTeamWin(mkRec([1, 0, 2, 3]), 1))
  // 无效 rec
  assert('空 rec 返回 false', !isMyTeamWin(null))
  assert('无 ranks 数组 返回 false', !isMyTeamWin({ time: 1 }))
}

console.log('\n=== 2. getMyRank 名次 ===')
{
  eq('seat 0 头游 → 0', getMyRank(mkRec([0, 1, 2, 3]), 0), 0)
  eq('seat 0 二游 → 1', getMyRank(mkRec([2, 0, 1, 3]), 0), 1)
  eq('seat 0 三游 → 2', getMyRank(mkRec([1, 2, 0, 3]), 0), 2)
  eq('seat 0 末游 → 3', getMyRank(mkRec([1, 2, 3, 0]), 0), 3)
  eq('seat 0 不在 ranks → -1', getMyRank({ time: 1, ranks: [1, 2, 3] }, 0), -1)
}

console.log('\n=== 3. computeWinRate 胜率 ===')
{
  eq('空战绩 = 0', computeWinRate([]), 0)
  eq('null = 0', computeWinRate(null), 0)
  // 3 局:2 胜 1 败
  const recs = [
    mkRec([0, 1, 2, 3]),  // 胜
    mkRec([2, 1, 0, 3]),  // 胜(seat 2 是队友)
    mkRec([1, 0, 2, 3]),  // 败
  ]
  eq('★ 3 局 2 胜 → 0.6667', computeWinRate(recs, 0), 0.6666666666666666)
  // 1 局
  eq('1 局 1 胜 → 1', computeWinRate([mkRec([0, 1, 2, 3])], 0), 1)
  // 全败
  eq('3 局 0 胜 → 0', computeWinRate([
    mkRec([1, 0, 2, 3]),
    mkRec([3, 2, 1, 0]),
    mkRec([1, 2, 3, 0]),
  ], 0), 0)
}

console.log('\n=== 4. computeAvgLevelUp 平均升级 ===')
{
  eq('空 = 0', computeAvgLevelUp([]), 0)
  eq('单局 levelUp=2 → 2', computeAvgLevelUp([mkRec([0, 1, 2, 3], 2)]), 2)
  // 3 局 levelUp = 1, 3, 2 → 平均 2
  eq('3 局 (1+3+2)/3 = 2',
    computeAvgLevelUp([
      mkRec([0, 1, 2, 3], 1),
      mkRec([0, 1, 2, 3], 3),
      mkRec([0, 1, 2, 3], 2),
    ]), 2)
}

console.log('\n=== 5. computeLevelUpTrend 滚动平均 ===')
{
  const recs = [
    mkRec([0], 1),
    mkRec([0], 2),
    mkRec([0], 3),
    mkRec([0], 4),
    mkRec([0], 5),
  ]
  // window=3
  const t = computeLevelUpTrend(recs, 3)
  // 第 0 局: 1/1=1
  eq('★ window 3 第 0 局 = 1', t[0], 1)
  // 第 1 局: (1+2)/2=1.5
  eq('★ window 3 第 1 局 = 1.5', t[1], 1.5)
  // 第 2 局: (1+2+3)/3=2
  eq('★ window 3 第 2 局 = 2', t[2], 2)
  // 第 3 局: (2+3+4)/3=3
  eq('★ window 3 第 3 局 = 3', t[3], 3)
  // 第 4 局: (3+4+5)/3=4
  eq('★ window 3 第 4 局 = 4', t[4], 4)
  // window=5
  const t5 = computeLevelUpTrend(recs, 5)
  eq('★ window 5 第 4 局 = 3', t5[4], 3)  // (1+2+3+4+5)/5=3
  // window=1
  const t1 = computeLevelUpTrend(recs, 1)
  eq('★ window 1 = 自身', t1, [1, 2, 3, 4, 5])
  // 空
  eq('空 = []', computeLevelUpTrend([]), [])
}

console.log('\n=== 6. computeRankDistribution 名次分布 ===')
{
  // 5 局:头游 2 次,二游 1 次,三游 1 次,末游 1 次
  const recs = [
    mkRec([0, 1, 2, 3]),  // 头游
    mkRec([1, 0, 2, 3]),  // 二游
    mkRec([1, 2, 0, 3]),  // 三游
    mkRec([1, 2, 3, 0]),  // 末游
    mkRec([0, 1, 2, 3]),  // 头游
  ]
  eq('★ 头游 2 次', computeRankDistribution(recs, 0).first, 2)
  eq('★ 二游 1 次', computeRankDistribution(recs, 0).second, 1)
  eq('★ 三游 1 次', computeRankDistribution(recs, 0).third, 1)
  eq('★ 末游 1 次', computeRankDistribution(recs, 0).last, 1)
  eq('空 = 4 个 0', computeRankDistribution([]), { first: 0, second: 0, third: 0, last: 0 })
}

console.log('\n=== 7. computeRecentForm 最近 N 局胜负形 ===')
{
  // records 是新→旧(unshift 顺序),recentForm 返回旧→新
  const recs = [
    mkRec([0, 1, 2, 3]),  // 0:胜(新)
    mkRec([1, 0, 2, 3]),  // 1:败
    mkRec([2, 1, 0, 3]),  // 2:胜
    mkRec([0, 1, 2, 3]),  // 3:胜(更旧)
  ]
  // 取最近 3 局:slice(0,3) = [W, L, W] → reverse 还是 [W, L, W](对称)
  eq('★ 最近 3 局(对称序列)→ W,L,W', computeRecentForm(recs, 3, 0), ['W', 'L', 'W'])
  // 取最近 5 局(全 4 局):反转后(旧→新)W, W, L, W
  eq('★ 最近 5 局(<5)→ 全反转(旧→新)', computeRecentForm(recs, 5, 0), ['W', 'W', 'L', 'W'])
  // 空
  eq('空 = []', computeRecentForm([]), [])
}

console.log('\n=== 8. computeStreak 当前连胜/连败 ===')
{
  // 新→旧序列
  // 3 连胜:WWW
  eq('★ 3 连胜', computeStreak([
    mkRec([0, 1, 2, 3]),  // 0: W(新)
    mkRec([0, 1, 2, 3]),  // 1: W
    mkRec([0, 1, 2, 3]),  // 2: W
  ], 0), 3)
  // 2 连败后 1 胜 → 1
  eq('★ 2 连败 + 1 胜 → 1', computeStreak([
    mkRec([0, 1, 2, 3]),  // 0: W(新)
    mkRec([1, 0, 2, 3]),  // 1: L
    mkRec([1, 0, 2, 3]),  // 2: L
  ], 0), 1)
  // 3 连败
  eq('★ 3 连败 = -3', computeStreak([
    mkRec([1, 0, 2, 3]),  // 0: L(新)
    mkRec([1, 0, 2, 3]),  // 1: L
    mkRec([1, 0, 2, 3]),  // 2: L
  ], 0), -3)
  // 1 胜 1 败 1 胜(最近是胜)→ 1
  eq('★ WLW 末尾 W → 1', computeStreak([
    mkRec([0, 1, 2, 3]),
    mkRec([1, 0, 2, 3]),
    mkRec([0, 1, 2, 3]),
  ], 0), 1)
  // 1 胜 1 败 1 胜(最近是败)→ -1
  eq('★ WLW 末尾 L → -1', computeStreak([
    mkRec([1, 0, 2, 3]),
    mkRec([0, 1, 2, 3]),
    mkRec([1, 0, 2, 3]),
  ], 0), -1)
  // 空
  eq('空 = 0', computeStreak([]), 0)
}

console.log('\n=== 9. computeSummary 一次拿全部 ===')
{
  const recs = [
    mkRec([0, 1, 2, 3], 2),  // W
    mkRec([0, 1, 2, 3], 3),  // W
    mkRec([1, 0, 2, 3], 0),  // L
    mkRec([0, 1, 2, 3], 1),  // W
  ]
  const s = computeSummary(recs, 0)
  eq('★ totalGames = 4', s.totalGames, 4)
  eq('★ wins = 3', s.wins, 3)
  eq('★ winRate = 0.75', s.winRate, 0.75)
  eq('★ avgLevelUp = 1.5', s.avgLevelUp, 1.5)
  eq('★ rankDistribution', s.rankDistribution, { first: 3, second: 1, third: 0, last: 0 })
  eq('★ recentForm (5 局取 4) = W,L,W,W', s.recentForm, ['W', 'L', 'W', 'W'])
  eq('★ streak = 2 (最近 2 胜后中断)', s.streak, 2)
  // 空 summary
  const empty = computeSummary([], 0)
  eq('空 summary', empty, {
    totalGames: 0, wins: 0, winRate: 0, avgLevelUp: 0,
    rankDistribution: { first: 0, second: 0, third: 0, last: 0 },
    recentForm: [], streak: 0,
  })
}

console.log('\n========== history 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
