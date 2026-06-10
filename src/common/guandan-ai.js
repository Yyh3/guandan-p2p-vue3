/**
 * 掼蛋 AI 出牌引擎 —— 规则 + 贪心搜索,中等难度
 *
 * 输入:手牌 + 当前桌面牌(可为 null)+ 玩家位置(队友位置)+ 已知已出牌(可选)
 * 输出:{type: 'play', cards: [...]} 或 {type: 'pass'}
 *
 * 策略优先级(从强到弱):
 *   1. 领出(我是首家):尽量出能走掉的小牌,保留大牌/炸弹
 *   2. 跟牌(非首家):能压就压最小能压的;不能压就 pass
 *   3. 队友出牌后我接风:尽量出能清掉的小牌
 *   4. 对手出牌时:队友先过我后我才动,压不起就 pass(让队友处理)
 *
 * 简化:不做完整搜索,基于"牌型识别 + 最小可行牌" 贪心
 */

import * as E from './guandan-engine.js'
const { TYPE } = E

/**
 * 牌型权值(从大到小排序用)
 */
const TYPE_VALUE = {
  [TYPE.KINGS_BOMB]: 100,
  [TYPE.STRAIGHT_FLUSH]: 90,
  [TYPE.BOMB_8]: 80,
  [TYPE.BOMB_7]: 70,
  [TYPE.BOMB_6]: 60,
  [TYPE.BOMB_5]: 50,
  [TYPE.BOMB_4]: 40,
  [TYPE.STRAIGHT]: 30,
  [TYPE.PAIR_STRAIGHT]: 30,
  [TYPE.THREE_STRAIGHT]: 30,
  [TYPE.THREE_PAIR]: 25,
  [TYPE.THREE]: 20,
  [TYPE.PAIR]: 15,
  [TYPE.SINGLE]: 10,
  [TYPE.INVALID]: 0,
}

/**
 * 找最小可压的牌
 *
 * @param {Array} hand 完整手牌(含鬼牌)
 * @param {Object} target 当前桌面牌 {type, mainRank, length, suit?}
 * @param {Number} ghostCount 鬼牌数量(逢人配)
 * @param {Number} levelRank 当前级牌 rank
 * @returns {Array|null} 能压的最小牌组,无则 null
 */
function findMinBeat(hand, target, ghostCount, levelRank) {
  if (!target || target.type === TYPE.INVALID) return null

  // 优先:王炸(只用一次,直接返回所有王)
  if (hand.some(c => c.rank === 17) && hand.some(c => c.rank === 17) &&
      hand.filter(c => c.rank === 17).length === 2 &&
      hand.filter(c => c.rank === 16).length === 2) {
    return hand.filter(c => c.rank >= 16)
  }

  // 拆分鬼牌
  const { concrete, ghosts } = E.splitGhosts(hand, levelRank)
  const ghostAvail = ghosts.length

  // 同花顺/王炸 通常在炸弹里覆盖,这里单独处理同花顺
  if (target.type === TYPE.STRAIGHT_FLUSH || target.type === TYPE.KINGS_BOMB) {
    // 同花顺要压过只能同花顺(且更大),王炸要压过只能王炸
    if (target.type === TYPE.KINGS_BOMB) return null
    // 同花顺:遍历手牌所有 5 张同花连续
    const flush = findMinStraightFlush(concrete, target.mainRank)
    if (flush) return flush
    if (ghostAvail > 0) {
      // 用鬼牌凑:简化不做
    }
    return null
  }

  // 炸弹之间的压制
  const isTargetBomb = target.type >= TYPE.BOMB_4 && target.type <= TYPE.BOMB_8
  if (isTargetBomb) {
    // 找张数更大或同张数 rank 更大的炸弹
    const beatBomb = findMinBomb(concrete, target.length, target.mainRank, true)
    if (beatBomb) return beatBomb
    // 用鬼牌凑
    if (ghostAvail > 0) {
      // 简化:有 1 张鬼 + 3 张同 rank → 4 炸
      const c4 = tryBombWithGhosts(concrete, ghosts, target.length, target.mainRank)
      if (c4) return c4
    }
    return null
  }

  // 非炸弹目标:先尝试非炸弹压制(同类型),再考虑炸弹
  const same = findMinSameType(concrete, ghosts, target, levelRank)
  if (same) return same

  // 先尝试鬼牌凑炸(优先,因为 4 炸鬼可能最小)
  if (ghostAvail > 0) {
    const c4 = tryBombWithGhosts(concrete, ghosts, 0, 0)
    if (c4) return c4
  }

  // 找最小炸弹(任何炸弹都压非炸弹)
  const bomb = findMinBomb(concrete, 4, 0, false)
  if (bomb) return bomb

  return null
}

/**
 * 找最小"同类型且能压"的牌
 */
function findMinSameType(concrete, ghosts, target, levelRank) {
  const cnt = E.countByRank(concrete)
  const ranks = Object.keys(cnt).map(Number).sort((a, b) => a - b)
  const ghostAvail = ghosts.length

  switch (target.type) {
    case TYPE.SINGLE: {
      // 优先:最小 mainRank > target.mainRank 的实牌单张
      for (const r of ranks) {
        if (r > target.mainRank) {
          return concrete.filter(c => c.rank === r).slice(0, 1)
        }
      }
      // 无实牌可压:用鬼牌(鬼牌变任何 rank > target.mainRank)
      if (ghostAvail > 0) {
        return [ghosts[0]]
      }
      return null
    }
    case TYPE.PAIR: {
      for (const r of ranks) {
        if (r > target.mainRank && cnt[r] >= 2) {
          return concrete.filter(c => c.rank === r).slice(0, 2)
        }
      }
      if (ghostAvail > 0) {
        // 1 张鬼 + 1 张同 rank
        for (const r of ranks) {
          if (r > target.mainRank && cnt[r] >= 1) {
            return [...concrete.filter(c => c.rank === r).slice(0, 1), ghosts[0]]
          }
        }
      }
      return null
    }
    case TYPE.THREE: {
      for (const r of ranks) {
        if (r > target.mainRank && cnt[r] >= 3) {
          return concrete.filter(c => c.rank === r).slice(0, 3)
        }
      }
      if (ghostAvail >= 2) {
        // 2 鬼 + 1 张同 rank
        for (const r of ranks) {
          if (r > target.mainRank && cnt[r] >= 1) {
            return [...concrete.filter(c => c.rank === r).slice(0, 1), ...ghosts.slice(0, 2)]
          }
        }
      }
      return null
    }
    case TYPE.THREE_PAIR: {
      for (const r of ranks) {
        if (r > target.mainRank && cnt[r] >= 3) {
          // 还需要 1 对
          for (const r2 of ranks) {
            if (r2 !== r && cnt[r2] >= 2) {
              return [
                ...concrete.filter(c => c.rank === r).slice(0, 3),
                ...concrete.filter(c => c.rank === r2).slice(0, 2),
              ]
            }
          }
        }
      }
      // 鬼牌版:3 同 + 1 对
      if (ghostAvail >= 2) {
        for (const r of ranks) {
          if (r > target.mainRank && cnt[r] >= 2) {
            // 1 鬼 + 2 张 r → 三张; 另 1 鬼 + 1 张 r2 → 配对
            return [...concrete.filter(c => c.rank === r).slice(0, 2), ...ghosts.slice(0, 2)]
          }
        }
      }
      return null
    }
    case TYPE.STRAIGHT: {
      const beat = findMinStraight(concrete, ghosts, target.length, target.mainRank, levelRank)
      return beat
    }
    case TYPE.PAIR_STRAIGHT: {
      const beat = findMinPairStraight(concrete, ghosts, target.length, target.mainRank, levelRank)
      return beat
    }
    case TYPE.THREE_STRAIGHT: {
      const beat = findMinThreeStraight(concrete, ghosts, target.length, target.mainRank, levelRank)
      return beat
    }
  }
  return null
}

/**
 * 找最小的同长度顺子,主 rank > targetMain
 */
function findMinStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  // 不能含 2/王(levelRank 也不影响 2)
  for (let start = Math.max(3, targetMain - length + 2); start + length - 1 <= 13; start++) {
    let need = length
    const picked = []
    for (let r = start; r < start + length; r++) {
      const have = cnt[r] || 0
      if (have > 0) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1))
        need--
      } else if (ghosts.length > 0) {
        picked.push(ghosts[0])
        ghosts = ghosts.slice(1)
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      // 验证不含 2/王
      if (picked.every(c => c.rank !== 15 && c.rank !== 16 && c.rank !== 17)) {
        return picked
      }
    }
  }
  return null
}

function findMinPairStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  const pairCount = length / 2
  for (let start = Math.max(3, targetMain - pairCount + 2); start + pairCount - 1 <= 13; start++) {
    let need = pairCount
    const picked = []
    for (let r = start; r < start + pairCount; r++) {
      const have = cnt[r] || 0
      if (have >= 2) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 2))
        need--
      } else if (ghosts.length > 0 && have >= 1) {
        // 1 鬼 + 1 张凑对
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1), ghosts[0])
        ghosts = ghosts.slice(1)
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      if (picked.every(c => c.rank !== 15 && c.rank !== 16 && c.rank !== 17)) {
        return picked
      }
    }
  }
  return null
}

function findMinThreeStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  const groupCount = length / 3
  for (let start = Math.max(3, targetMain - groupCount + 2); start + groupCount - 1 <= 13; start++) {
    let need = groupCount
    const picked = []
    for (let r = start; r < start + groupCount; r++) {
      const have = cnt[r] || 0
      if (have >= 3) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 3))
        need--
      } else if (ghosts.length >= 2 && have >= 1) {
        // 2 鬼 + 1 张凑三
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1), ...ghosts.slice(0, 2))
        ghosts = ghosts.slice(2)
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      if (picked.every(c => c.rank !== 15 && c.rank !== 16 && c.rank !== 17)) {
        return picked
      }
    }
  }
  return null
}

/**
 * 找最小炸弹
 *  - isBeatBomb=true:压对方的炸弹(张数更大,或同张数 rank 更大)
 *  - isBeatBomb=false:任何最小炸弹(用来压非炸弹)
 */
function findMinBomb(cards, minLength, minRank, isBeatBomb) {
  const cnt = E.countByRank(cards)
  const ranks = Object.keys(cnt).map(Number).filter(r => r <= 15).sort((a, b) => a - b)  // 排除王
  // 4..8 张炸弹
  for (let len = 4; len <= 8; len++) {
    for (const r of ranks) {
      if (cnt[r] >= len) {
        if (isBeatBomb) {
          if (len > minLength || (len === minLength && r > minRank)) {
            return cards.filter(c => c.rank === r).slice(0, len)
          }
        } else {
          return cards.filter(c => c.rank === r).slice(0, len)
        }
      }
    }
  }
  return null
}

/**
 * 用鬼牌凑炸弹
 */
function tryBombWithGhosts(concrete, ghosts, minLength, minRank) {
  const cnt = E.countByRank(concrete)
  if (ghosts.length === 0) return null
  // 1 张鬼 + 3 张同 rank → 4 炸
  if (ghosts.length >= 1) {
    for (const r of Object.keys(cnt).map(Number)) {
      if (cnt[r] >= 3) {
        // 4 炸:鬼 + 3 张 r
        if (minLength < 4 || (minLength === 4 && r > minRank)) {
          return [...concrete.filter(c => c.rank === r).slice(0, 3), ghosts[0]]
        }
        // 5 炸:2 鬼 + 3 张 r
        if (ghosts.length >= 2 && cnt[r] >= 3) {
          if (minLength < 5 || (minLength === 5 && r > minRank)) {
            return [...concrete.filter(c => c.rank === r).slice(0, 3), ...ghosts.slice(0, 2)]
          }
        }
      }
    }
  }
  return null
}

/**
 * 找最小同花顺(用来压同花顺)
 */
function findMinStraightFlush(cards, targetMain) {
  // 5 张同花 + 连续
  const bySuit = {}
  for (const c of cards) {
    if (c.suit < 0) continue
    if (!bySuit[c.suit]) bySuit[c.suit] = []
    bySuit[c.suit].push(c)
  }
  for (const suit of [0, 1, 2, 3]) {
    const sc = bySuit[suit] || []
    const cnt = E.countByRank(sc)
    const ranks = Object.keys(cnt).map(Number).filter(r => r <= 13).sort((a, b) => a - b)
    // 找连续 5 张
    for (let i = 0; i + 4 < ranks.length; i++) {
      const a = ranks[i], b = ranks[i + 4]
      if (b - a === 4 && b > targetMain) {
        const picked = []
        for (let r = a; r <= b; r++) {
          picked.push(...sc.filter(c => c.rank === r).slice(0, 1))
        }
        return picked
      }
    }
  }
  return null
}

/**
 * 领出时:选一个"出掉后让自己手牌最舒服"的牌
 *
 * 简化策略:
 *  - 优先出最小单张
 *  - 否则出最小对子
 *  - 否则出最小三张/三带二
 *  - 否则出最小炸弹(王炸 > 8炸 > ... > 4炸,优先出小的)
 *  - 否则出最小顺子
 */
function chooseLead(cards, levelRank) {
  if (cards.length === 0) return { type: 'pass' }
  const sorted = E.sortHand(cards)
  const { concrete, ghosts } = E.splitGhosts(cards, levelRank)
  const cnt = E.countByRank(concrete)

  // 1. 最小单张(非鬼,先走小牌)
  if (concrete.length > 0) {
    const sortedConcrete = E.sortHand(concrete)
    const smallest = sortedConcrete[sortedConcrete.length - 1]  // 已排序,末尾最小
    return { type: 'play', cards: [smallest] }
  }

  // 2. 全部是鬼?出一张
  if (concrete.length === 0 && ghosts.length > 0) {
    return { type: 'play', cards: [ghosts[0]] }
  }

  return { type: 'play', cards: [concrete[concrete.length - 1]] }
}

/**
 * 主入口
 *
 * @param {Array} hand 我的手牌
 * @param {Object} currentPlay 当前桌面牌(我首家时为 null)
 * @param {Number} levelRank 当前级牌 rank
 * @param {Object} ctx { isTeammateLast, mySeatIndex, teammateSeatIndex }
 *                      isTeammateLast: 上一个出牌的人是不是我队友
 * @returns {Object} { type: 'play' | 'pass', cards?: [...] }
 */
function decide(hand, currentPlay, levelRank, ctx = {}) {
  // 首家出牌
  if (!currentPlay || currentPlay.type === TYPE.INVALID) {
    return chooseLead(hand, levelRank)
  }

  // 队友最后出牌(我可以接风自由出)
  if (ctx.isTeammateLast) {
    // 接风:出小牌
    return chooseLead(hand, levelRank)
  }

  // 跟牌:找最小能压
  const beat = findMinBeat(hand, currentPlay, E.splitGhosts(hand, levelRank).ghosts.length, levelRank)
  if (beat && beat.length > 0) {
    return { type: 'play', cards: beat }
  }
  return { type: 'pass' }
}

// ============ 一键理(智能凑牌型) ============
/**
 * 智能凑牌型:扫描手牌找最值得出的牌型
 *
 * 策略(从强到弱):
 *   1. 王炸(4 王) - 最强
 *   2. 同花顺(5+ 张同花连续)
 *   3. 6+ 张炸 > 5 张炸 > 4 张炸(出最小可用炸)
 *   4. 钢板(2+ 组连续三张)
 *   5. 顺子(5+ 张连续)
 *   6. 连对(3+ 对连续)
 *   7. 三带二
 *   8. 三张
 *   9. 对子
 *  10. 单张
 *
 * @returns {{type: 'play', cards: Card[]}|{type: 'pass'}}
 */
function autoPlayGrouped(hand, lastPlay, levelRank, ctx = {}) {
  if (!hand || hand.length === 0) return { type: 'pass' }

  // 拆分鬼牌(逢人配)
  const { concrete, ghosts } = E.splitGhosts(hand, levelRank)
  const ghostAvail = ghosts.length

  // 1. 王炸(4 王)—— 仅在有 4 王时使用
  const kingCount = hand.filter(c => c.rank === 17).length + hand.filter(c => c.rank === 16).length
  if (kingCount === 4) {
    return { type: 'play', cards: hand.filter(c => c.rank >= 16) }
  }

  // 2. 同花顺(5+ 张同花色连续)
  const flush = findBestStraightFlush(concrete)
  if (flush) return { type: 'play', cards: flush }

  // 3. 炸弹(4+ 张同 rank)
  const bomb = findBestBomb(concrete, ghostAvail, ghosts)
  if (bomb) return { type: 'play', cards: bomb }

  // 4. 钢板
  const plate = findBestSteelPlate(concrete, ghostAvail, ghosts)
  if (plate) return { type: 'play', cards: plate }

  // 5. 顺子
  const straight = findBestStraight(concrete, ghostAvail, ghosts)
  if (straight) return { type: 'play', cards: straight }

  // 6. 连对
  const pairStraight = findBestPairStraight(concrete, ghostAvail, ghosts)
  if (pairStraight) return { type: 'play', cards: pairStraight }

  // 7. 三带二
  const triplePair = findBestThreePair(concrete, ghostAvail, ghosts)
  if (triplePair) return { type: 'play', cards: triplePair }

  // 8. 三张
  const triple = findBestTriple(concrete, ghostAvail, ghosts)
  if (triple) return { type: 'play', cards: triple }

  // 9. 对子
  const pair = findBestPair(concrete, ghostAvail, ghosts)
  if (pair) return { type: 'play', cards: pair }

  // 10. 单张(出最大单张)
  const single = findBestSingle(concrete, ghostAvail, ghosts)
  if (single) return { type: 'play', cards: single }

  return { type: 'pass' }
}

/**
 * 找最大的同花顺(5+ 张同花连续)。王/2 不可入顺。
 */
function findBestStraightFlush(cards) {
  if (cards.length < 5) return null
  for (const suit of [0, 1, 2, 3]) {
    const sc = cards.filter(c => c.suit === suit && c.rank <= 14)
    if (sc.length < 5) continue
    const cnt = E.countByRank(sc)
    const ranks = Object.keys(cnt).map(Number).sort((a, b) => a - b)
    // 找最长的连续段
    let bestStart = -1, bestLen = 0
    let curStart = ranks[0], curLen = 1
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] === ranks[i - 1] + 1) {
        curLen++
      } else {
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
        curStart = ranks[i]
        curLen = 1
      }
    }
    if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    if (bestLen >= 5) {
      // 取末 5 张(让 mainRank 最大)
      const picked = []
      for (let r = bestStart + bestLen - 5; r < bestStart + bestLen; r++) {
        const card = sc.find(c => c.rank === r)
        if (card) picked.push(card)
      }
      if (picked.length === 5) return picked
    }
  }
  return null
}

/**
 * 找最大的炸弹(4+ 张同 rank)。有鬼牌优先尝试凑。
 * 优先级:6+ 张炸 > 5 张炸 > 4 张炸,同长度取 rank 最小(留大牌)
 */
function findBestBomb(cards, ghostAvail, ghosts) {
  const cnt = E.countByRank(cards)
  // 1) 纯实牌炸弹:优先大炸(张数多),同长度取最大 rank
  // 因为我们要主动出,大炸是优势
  for (let len = 8; len >= 4; len--) {
    const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= len && r <= 15).sort((a, b) => a - b)
    if (ranks.length > 0) {
      const r = ranks[ranks.length - 1]  // 最大 rank
      return cards.filter(c => c.rank === r).slice(0, len)
    }
  }
  // 2) 鬼牌凑 5 炸:2 鬼 + 3 同 rank(优先 5 炸)
  if (ghostAvail >= 2) {
    for (const r of Object.keys(cnt).map(Number)) {
      if (cnt[r] >= 3) {
        return [...cards.filter(c => c.rank === r).slice(0, 3), ...ghosts.slice(0, 2)]
      }
    }
  }
  // 3) 鬼牌凑 4 炸:1 鬼 + 3 同 rank
  if (ghostAvail >= 1) {
    for (const r of Object.keys(cnt).map(Number)) {
      if (cnt[r] >= 3) {
        return [...cards.filter(c => c.rank === r).slice(0, 3), ghosts[0]]
      }
    }
  }
  return null
}

/**
 * 找最大钢板(2+ 组连续三张)
 */
function findBestSteelPlate(cards, ghostAvail, ghosts) {
  if (cards.length < 6) return null
  const cnt = E.countByRank(cards)
  // 找连续 rank 数 >= 2 且每个 rank >= 3 张
  const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 3 && r <= 14).sort((a, b) => a - b)
  if (ranks.length < 2) return null
  // 找最长连续段
  let bestStart = -1, bestLen = 0
  let curStart = ranks[0], curLen = 1
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      curLen++
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
      curStart = ranks[i]
      curLen = 1
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
  if (bestLen >= 2) {
    const picked = []
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      picked.push(...cards.filter(c => c.rank === r).slice(0, 3))
    }
    return picked
  }
  return null
}

/**
 * 找最大顺子(5+ 张单张连续)
 */
function findBestStraight(cards, ghostAvail, ghosts) {
  if (cards.length + ghostAvail < 5) return null
  const cnt = E.countByRank(cards)
  const ranks = Object.keys(cnt).map(Number).filter(r => r <= 14).sort((a, b) => a - b)
  // 找最长的连续段
  let bestStart = -1, bestLen = 0
  let curStart = ranks[0] || 0, curLen = ranks.length > 0 ? 1 : 0
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      curLen++
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
      curStart = ranks[i]
      curLen = 1
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
  if (bestLen >= 5) {
    const picked = []
    let ghostPool = ghosts.slice()
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const have = cards.filter(c => c.rank === r)
      if (have.length > 0) picked.push(have[0])
      else if (ghostPool.length > 0) picked.push(ghostPool.shift())
      else return null
    }
    return picked
  }
  return null
}

/**
 * 找最大连对(3+ 对连续)
 */
function findBestPairStraight(cards, ghostAvail, ghosts) {
  if (cards.length + ghostAvail < 6) return null
  const cnt = E.countByRank(cards)
  const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 2 && r <= 14).sort((a, b) => a - b)
  // 找最长的连续段
  let bestStart = -1, bestLen = 0
  let curStart = ranks[0] || 0, curLen = ranks.length > 0 ? 1 : 0
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1] + 1) {
      curLen++
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
      curStart = ranks[i]
      curLen = 1
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
  if (bestLen >= 3) {
    const picked = []
    let ghostPool = ghosts.slice()
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const have = cards.filter(c => c.rank === r).slice(0, 2)
      if (have.length === 2) picked.push(...have)
      else if (ghostPool.length > 0) {
        const oneCard = cards.find(c => c.rank === r)
        if (oneCard) picked.push(oneCard, ghostPool.shift())
        else return null
      } else {
        return null
      }
    }
    return picked
  }
  return null
}

/**
 * 找最大三带二
 */
function findBestThreePair(cards, ghostAvail, ghosts) {
  const cnt = E.countByRank(cards)
  const tripleRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 3).sort((a, b) => b - a)
  const pairRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 2 && !tripleRanks.includes(r)).sort((a, b) => a - b)
  if (tripleRanks.length === 0 || pairRanks.length === 0) return null
  // 出最大三张 + 最小对(走小牌,留大牌)
  const tr = tripleRanks[0]
  const pr = pairRanks[0]
  return [
    ...cards.filter(c => c.rank === tr).slice(0, 3),
    ...cards.filter(c => c.rank === pr).slice(0, 2),
  ]
}

/**
 * 找最大三张
 */
function findBestTriple(cards, ghostAvail, ghosts) {
  const cnt = E.countByRank(cards)
  const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 3).sort((a, b) => b - a)  // 最大在前
  if (ranks.length === 0) {
    // 鬼牌凑
    if (ghostAvail >= 2) {
      for (const r of Object.keys(cnt).map(Number)) {
        if (cnt[r] >= 1) {
          return [cards.find(c => c.rank === r), ...ghosts.slice(0, 2)]
        }
      }
    }
    return null
  }
  return cards.filter(c => c.rank === ranks[0]).slice(0, 3)
}

/**
 * 找最大对子
 */
function findBestPair(cards, ghostAvail, ghosts) {
  const cnt = E.countByRank(cards)
  const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 2).sort((a, b) => b - a)
  if (ranks.length === 0) {
    // 鬼牌凑
    if (ghostAvail >= 1) {
      for (const r of Object.keys(cnt).map(Number)) {
        if (cnt[r] >= 1) {
          return [cards.find(c => c.rank === r), ghosts[0]]
        }
      }
    }
    return null
  }
  return cards.filter(c => c.rank === ranks[0]).slice(0, 2)
}

/**
 * 找最大单张
 */
function findBestSingle(cards, ghostAvail, ghosts) {
  if (cards.length === 0) {
    if (ghosts.length > 0) return [ghosts[0]]
    return null
  }
  // 出最大
  const sorted = E.sortHand(cards)
  return [sorted[0]]
}

export {
  decide,
  findMinBeat,
  chooseLead,
  autoPlayGrouped,
  TYPE_VALUE,
}

// Default export for convenient `import AI from '@/common/guandan-ai.js'`
const AI = {
  decide,
  findMinBeat,
  chooseLead,
  autoPlayGrouped,
  TYPE_VALUE,
}
export default AI
