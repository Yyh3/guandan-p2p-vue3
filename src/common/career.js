/**
 * AI 生涯模式 (v0.4.28 P1-4)
 *
 * 给单机玩家一个"从 2 打到 A"的爬梯进度:赢一局升一级,输一局降一级,
 * 对手随段位变强(配套 AI 性格 flavor),全部离线存 localStorage。
 *
 * 爬梯与引擎升级体系对齐:LEVEL_SEQUENCE = [15(2), 3, 4, ..., 14(A)] 共 13 级。
 *
 * 用法:
 *   import { getCareer, recordCareerResult, careerLevelRank } from '@/common/career.js'
 *   const c = getCareer()
 *   const { promoted } = recordCareerResult(true)   // 赢了 → 升级
 */

import { LEVEL_SEQUENCE, RANK_NAMES } from './guandan-engine.js'

const KEY_CAREER = 'guandan_career'

/** 段位对应的 AI 对手 flavor(每 2 级一档,难度随段位 medium → hard) */
const AI_TIERS = [
  { name: '邻居小萌', trait: '刚学会,出牌随性', difficulty: 'medium' },
  { name: '慢热老张', trait: '先松后紧,后程发力', difficulty: 'medium' },
  { name: '炸弹狂魔小李', trait: '有炸就扔,不讲武德', difficulty: 'medium' },
  { name: '稳重老周', trait: '防守优先,沉得住气', difficulty: 'hard' },
  { name: '记牌师老王', trait: '记牌精准,算无遗策', difficulty: 'hard' },
  { name: '掼蛋之王', trait: '攻守兼备,步步紧逼', difficulty: 'hard' },
  { name: '传说·蛋神', trait: '登峰造极,只等被你拉下马', difficulty: 'hard' },
]

/** 读取生涯进度 { levelIndex, wins, losses, best } */
export function getCareer() {
  const fallback = { levelIndex: 0, wins: 0, losses: 0, best: 0 }
  try {
    const raw = localStorage.getItem(KEY_CAREER)
    const c = raw ? JSON.parse(raw) : {}
    if (!c || typeof c !== 'object') return fallback
    const maxIdx = LEVEL_SEQUENCE.length - 1
    return {
      levelIndex: Math.min(Math.max(Number(c.levelIndex) || 0, 0), maxIdx),
      wins: Number(c.wins) || 0,
      losses: Number(c.losses) || 0,
      best: Number(c.best) || 0,
    }
  } catch (e) { return fallback }
}

/** 当前生涯级牌 rank(传给 /game?levelRank=) */
export function careerLevelRank(career) {
  const c = career || getCareer()
  return LEVEL_SEQUENCE[c.levelIndex]
}

/** 当前生涯级牌显示名(2/3/.../A) */
export function careerLevelLabel(career) {
  const c = career || getCareer()
  return RANK_NAMES[LEVEL_SEQUENCE[c.levelIndex]]
}

/** 当前段位对应的 AI 对手(名字 + 性格 + 难度) */
export function careerOpponent(career) {
  const c = career || getCareer()
  const tier = Math.min(Math.floor(c.levelIndex / 2), AI_TIERS.length - 1)
  return AI_TIERS[tier]
}

/** 当前段位推荐难度 */
export function careerDifficulty(career) {
  return careerOpponent(career).difficulty
}

/** 是否已登顶(打过 A) */
export function isChampion(career) {
  const c = career || getCareer()
  return c.levelIndex >= LEVEL_SEQUENCE.length - 1
}

/**
 * 记录一局生涯结果并持久化。
 * @param {boolean} win - 本局是否获胜
 * @returns {{career, promoted, demoted, champion}} promoted=升级 demoted=降级 champion=登顶
 */
export function recordCareerResult(win) {
  const c = getCareer()
  let promoted = false, demoted = false, champion = false
  const maxIdx = LEVEL_SEQUENCE.length - 1
  if (win) {
    c.wins += 1
    if (c.levelIndex < maxIdx) { c.levelIndex += 1; promoted = true }
    else { champion = true }
    c.best = Math.max(c.best, c.levelIndex)
  } else {
    c.losses += 1
    if (c.levelIndex > 0) { c.levelIndex -= 1; demoted = true }
  }
  try { localStorage.setItem(KEY_CAREER, JSON.stringify(c)) } catch (e) { /* swallow */ }
  return { career: c, promoted, demoted, champion }
}

/** 重置生涯(测试 / 重新挑战用) */
export function resetCareer() {
  try { localStorage.removeItem(KEY_CAREER); return true } catch (e) { return false }
}

/** 爬梯全级标签(2→A),供 AIView 画进度轨 */
export function careerLadder() {
  return LEVEL_SEQUENCE.map(r => RANK_NAMES[r])
}
