/**
 * 本地成就 / 称号系统 (v0.4.28 P1-1)
 *
 * 离线留存的核心:给玩家一个"我在这副牌里攒了东西"的理由。
 * 全部成就从历史战绩(storage.getHistory())纯函数推导,零联网、可单测。
 *
 * 用法:
 *   import { checkNewUnlocks, getUnlockedIds, ACHIEVEMENTS } from '@/common/achievements.js'
 *   const fresh = checkNewUnlocks(storage.getHistory())  // 返回新解锁的成就定义数组(自动持久化)
 */

import {
  isMyTeamWin,
  computeStreak,
  computeRankDistribution,
} from './history.js'

const KEY_UNLOCKED = 'guandan_achievements'

/** 取单条记录的玩家座位(与 history.js 同口径:优先 rec.mySeat) */
function _seatOf(rec) {
  return (rec && typeof rec.mySeat === 'number') ? rec.mySeat : 0
}

/** 是否"双上":自己与队友包揽头游二游(同队包办前两名) */
function _isDoubleUp(rec) {
  if (!rec || !Array.isArray(rec.ranks) || rec.ranks.length < 2) return false
  const team = _seatOf(rec) % 2
  return (rec.ranks[0] % 2 === team) && (rec.ranks[1] % 2 === team)
}

/**
 * 成就定义 — 用掼蛋术语,check(records) 为纯函数判定。
 * icon 用 emoji(离线、无资源依赖)。
 */
export const ACHIEVEMENTS = [
  {
    id: 'first-win',
    name: '旗开得胜',
    desc: '赢得 1 局对局',
    icon: '🏆',
    check: (records) => records.some(r => isMyTeamWin(r)),
  },
  {
    id: 'double-up',
    name: '双上高手',
    desc: '与队友包揽头游、二游',
    icon: '🚀',
    check: (records) => records.some(_isDoubleUp),
  },
  {
    id: 'big-win',
    name: '大获全胜',
    desc: '单局升 3 级及以上',
    icon: '💥',
    check: (records) => records.some(r => (r.levelUp || 0) >= 3),
  },
  {
    id: 'head-3',
    name: '头游达人',
    desc: '累计 3 次拿下头游',
    icon: '👑',
    check: (records) => computeRankDistribution(records).first >= 3,
  },
  {
    id: 'streak-5',
    name: '常胜将军',
    desc: '达成 5 连胜',
    icon: '🔥',
    check: (records) => computeStreak(records) >= 5,
  },
  {
    id: 'veteran',
    name: '百战老兵',
    desc: '累计进行 10 局对局',
    icon: '🎖️',
    check: (records) => records.length >= 10,
  },
]

/** 读取已解锁成就 { id: 解锁时间戳 } */
export function getUnlockedMap() {
  try {
    const raw = localStorage.getItem(KEY_UNLOCKED)
    const obj = raw ? JSON.parse(raw) : {}
    return (obj && typeof obj === 'object') ? obj : {}
  } catch (e) { return {} }
}

/** 已解锁的成就 id 数组 */
export function getUnlockedIds() {
  return Object.keys(getUnlockedMap())
}

/** 某成就是否已解锁 */
export function isUnlocked(id) {
  return Object.prototype.hasOwnProperty.call(getUnlockedMap(), id)
}

/**
 * 给定战绩,返回"满足条件"的成就定义数组(不论是否已解锁)。
 * @param {Array} records - storage.getHistory() 的战绩数组
 */
export function evaluateAchievements(records) {
  const list = Array.isArray(records) ? records : []
  return ACHIEVEMENTS.filter(a => {
    try { return !!a.check(list) } catch (e) { return false }
  })
}

/**
 * 检查并持久化新解锁的成就。
 * @param {Array} records - 当前全部战绩
 * @returns {Array} 本次新解锁的成就定义数组(用于 UI 弹解锁动画)
 */
export function checkNewUnlocks(records) {
  const unlocked = getUnlockedMap()
  const met = evaluateAchievements(records)
  const fresh = met.filter(a => !Object.prototype.hasOwnProperty.call(unlocked, a.id))
  if (fresh.length === 0) return []
  const now = Date.now()
  for (const a of fresh) unlocked[a.id] = now
  try { localStorage.setItem(KEY_UNLOCKED, JSON.stringify(unlocked)) } catch (e) { /* swallow */ }
  return fresh
}

/** 清空成就(测试 / 重置用) */
export function resetAchievements() {
  try { localStorage.removeItem(KEY_UNLOCKED); return true } catch (e) { return false }
}
