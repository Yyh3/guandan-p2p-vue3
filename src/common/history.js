/**
 * 战绩统计纯函数库 (无 Vue 依赖)
 *
 * v0.4.9 玩家统计 / 战绩趋势图
 *   - computeWinRate: 胜率(0..1)
 *   - computeLevelUpTrend: 升级速度(每局平均 levelUp,含滚动平均)
 *   - computeRankDistribution: 名次分布(头/二/三/末游次数)
 *   - computeRecentForm: 最近 N 局胜负形
 *   - computeStreak: 当前连胜 / 连败数(正数连胜,负数连败)
 *
 * 输入:历史战绩数组(由 storage.getHistory() 返回)
 *   格式:[
 *     { time, ranks: [seatA, seatB, seatC, seatD], players: {seat: {name, avatar}}, levelUp, ... }
 *   ]
 * 玩家自己座位固定 0(自己),用 ranks 数组判定胜负
 *
 * 用法:
 *   import { computeWinRate, ... } from '@/common/history.js'
 *   const wr = computeWinRate(history, 0)
 */

/**
 * 判定我方是否获胜
 * @param {Object} rec - 单局战绩
 * @param {number} mySeatIndex - 自己的座位(默认 0)
 * @returns {boolean}
 */
export function isMyTeamWin(rec, mySeatIndex = 0) {
  if (!rec || !Array.isArray(rec.ranks) || rec.ranks.length === 0) return false
  const myTeam = mySeatIndex % 2  // 0/2 一队, 1/3 一队
  const winnerSeat = rec.ranks[0]  // 头游
  return myTeam === (winnerSeat % 2)
}

/**
 * 判定我方名次
 * @returns {number} 0=头游, 1=二游, 2=三游, 3=末游, -1=无效
 */
export function getMyRank(rec, mySeatIndex = 0) {
  if (!rec || !Array.isArray(rec.ranks)) return -1
  const idx = rec.ranks.indexOf(mySeatIndex)
  return idx
}

/**
 * 胜率(我方胜局数 / 总对局数)
 * @returns {number} 0..1,无战绩返回 0
 */
export function computeWinRate(records, mySeatIndex = 0) {
  if (!Array.isArray(records) || records.length === 0) return 0
  const wins = records.filter(r => isMyTeamWin(r, mySeatIndex)).length
  return wins / records.length
}

/**
 * 升级速度(平均每局 levelUp)
 * @returns {number} 平均升级数(0 表示无数据)
 */
export function computeAvgLevelUp(records) {
  if (!Array.isArray(records) || records.length === 0) return 0
  const total = records.reduce((s, r) => s + (r.levelUp || 0), 0)
  return total / records.length
}

/**
 * 升级速度滚动平均(最近 N 局)
 * @param {number} windowSize - 窗口大小
 * @returns {Array<number>} 长度 === records.length,前 (windowSize-1) 项用 less-than-window 平均
 */
export function computeLevelUpTrend(records, windowSize = 5) {
  if (!Array.isArray(records) || records.length === 0) return []
  if (windowSize < 1) windowSize = 1
  const out = []
  for (let i = 0; i < records.length; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const slice = records.slice(start, i + 1)
    const avg = slice.reduce((s, r) => s + (r.levelUp || 0), 0) / slice.length
    out.push(Number(avg.toFixed(3)))
  }
  return out
}

/**
 * 名次分布(头/二/三/末游次数)
 * @returns {{first: number, second: number, third: number, last: number}}
 */
export function computeRankDistribution(records, mySeatIndex = 0) {
  const dist = { first: 0, second: 0, third: 0, last: 0 }
  if (!Array.isArray(records)) return dist
  for (const rec of records) {
    const r = getMyRank(rec, mySeatIndex)
    if (r === 0) dist.first++
    else if (r === 1) dist.second++
    else if (r === 2) dist.third++
    else if (r === 3) dist.last++
  }
  return dist
}

/**
 * 最近 N 局胜负形(用于"连胜 X"显示)
 * @returns {Array<'W'|'L'>} 从最早到最近
 */
export function computeRecentForm(records, n = 5, mySeatIndex = 0) {
  if (!Array.isArray(records) || records.length === 0) return []
  // records 是新→旧(由 addHistory unshift),反转让其变旧→新
  const ordered = records.slice(0, n).reverse()
  return ordered.map(r => isMyTeamWin(r, mySeatIndex) ? 'W' : 'L')
}

/**
 * 当前连胜 / 连败数(从最近一局往回数,相同结果连续到不同结果为止)
 * @returns {number} 正数=连胜, 负数=连败, 0=无战绩
 */
export function computeStreak(records, mySeatIndex = 0) {
  if (!Array.isArray(records) || records.length === 0) return 0
  // records 是新→旧,从第 0 局(最近)开始往回数
  const first = isMyTeamWin(records[0], mySeatIndex)
  let streak = 0
  for (const rec of records) {
    const win = isMyTeamWin(rec, mySeatIndex)
    if (win === first) {
      streak = first ? streak + 1 : streak - 1
    } else {
      break
    }
  }
  return streak
}

/**
 * 总体统计摘要 — UI 显示用,一次拿全部
 * @returns {Object} { totalGames, wins, winRate, avgLevelUp, rankDistribution, recentForm, streak }
 */
export function computeSummary(records, mySeatIndex = 0) {
  const wins = records.filter(r => isMyTeamWin(r, mySeatIndex)).length
  return {
    totalGames: records.length,
    wins,
    winRate: computeWinRate(records, mySeatIndex),
    avgLevelUp: computeAvgLevelUp(records),
    rankDistribution: computeRankDistribution(records, mySeatIndex),
    recentForm: computeRecentForm(records, 5, mySeatIndex),
    streak: computeStreak(records, mySeatIndex),
  }
}
