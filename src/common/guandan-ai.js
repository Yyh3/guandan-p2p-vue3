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
  // 王炸不可压王炸
  if (target.type === TYPE.KINGS_BOMB) return null

  // 拆分鬼牌,尊重调用方指定的可用鬼牌数(如 hard 模式想先找"非鬼"方案)
  const { concrete, ghosts: allGhosts } = E.splitGhosts(hand, levelRank)
  const ghostAvail = Math.min(allGhosts.length, ghostCount)
  const ghosts = allGhosts.slice(0, ghostAvail)

  // 优先:王炸(只用一次,直接返回所有王)
  //   v3.x P2-28 修复(A-4'):原 `hand.some(c => c.rank === 17) && hand.some(c => c.rank === 17)`
  //   重复判定两次且缺 rank 16 路径(小王也得算)。简化为单行 filter === 4。
  if (hand.filter(c => c.rank >= 16).length === 4) {
    return hand.filter(c => c.rank >= 16)
  }

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
      if (ghostAvail >= 1) {
        // 1 鬼 + 2 张同 rank
        for (const r of ranks) {
          if (r > target.mainRank && cnt[r] >= 2) {
            return [...concrete.filter(c => c.rank === r).slice(0, 2), ghosts[0]]
          }
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
      // 鬼牌版:3 同 + 1 对(共 5 张)
      if (ghostAvail >= 2) {
        for (const r of ranks) {
          if (r > target.mainRank && cnt[r] >= 2) {
            // 需要 2 张 r(凑三张)+ 1 张 r2(凑对子)+ 2 张鬼
            for (const r2 of ranks) {
              if (r2 !== r && cnt[r2] >= 1) {
                return [
                  ...concrete.filter(c => c.rank === r).slice(0, 2),
                  ...concrete.filter(c => c.rank === r2).slice(0, 1),
                  ...ghosts.slice(0, 2),
                ]
              }
            }
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
 *
 * Bug fix (P0-2 + P0-3):
 *   - 用 ghostIdx 索引而不是 slice,避免 start 循环间 ghosts 被耗尽
 *   - 验证不含 2/王时排除鬼牌本身(鬼牌可充当任意 rank,包括 2/王)
 */
function findMinStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  const ghostSet = new Set(ghosts)
  // 不能含 2/王(levelRank 也不影响 2)
  for (let start = Math.max(3, targetMain - length + 2); start + length - 1 <= 14; start++) {
    let need = length
    const picked = []
    let ghostIdx = 0
    for (let r = start; r < start + length; r++) {
      const have = cnt[r] || 0
      if (have > 0) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1))
        need--
      } else if (ghostIdx < ghosts.length) {
        picked.push(ghosts[ghostIdx])
        ghostIdx++
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      // 鬼牌可充当任意 rank(包括 2/王),但 concrete 不能是 2/王
      const hasBannedConcrete = picked.some(c => !ghostSet.has(c) && (c.rank === 15 || c.rank === 16 || c.rank === 17))
      if (!hasBannedConcrete) {
        return picked
      }
    }
  }
  return null
}

function findMinPairStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  const pairCount = length / 2
  const ghostSet = new Set(ghosts)
  for (let start = Math.max(3, targetMain - pairCount + 2); start + pairCount - 1 <= 14; start++) {
    let need = pairCount
    const picked = []
    let ghostIdx = 0
    for (let r = start; r < start + pairCount; r++) {
      const have = cnt[r] || 0
      if (have >= 2) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 2))
        need--
      } else if (ghostIdx < ghosts.length && have >= 1) {
        // 1 鬼 + 1 张凑对
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1), ghosts[ghostIdx])
        ghostIdx++
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      const hasBannedConcrete = picked.some(c => !ghostSet.has(c) && (c.rank === 15 || c.rank === 16 || c.rank === 17))
      if (!hasBannedConcrete) {
        return picked
      }
    }
  }
  return null
}

function findMinThreeStraight(cards, ghosts, length, targetMain, levelRank) {
  const cnt = E.countByRank(cards)
  const groupCount = length / 3
  const ghostSet = new Set(ghosts)
  for (let start = Math.max(3, targetMain - groupCount + 2); start + groupCount - 1 <= 14; start++) {
    let need = groupCount
    const picked = []
    let ghostIdx = 0
    for (let r = start; r < start + groupCount; r++) {
      const have = cnt[r] || 0
      if (have >= 3) {
        picked.push(...cards.filter(c => c.rank === r).slice(0, 3))
        need--
      } else if (ghostIdx < ghosts.length && have >= 2) {
        // 1 鬼 + 2 张凑三(优先,省鬼牌)
        picked.push(...cards.filter(c => c.rank === r).slice(0, 2), ghosts[ghostIdx])
        ghostIdx++
        need--
      } else if (ghostIdx + 1 < ghosts.length && have >= 1) {
        // 2 鬼 + 1 张凑三
        picked.push(...cards.filter(c => c.rank === r).slice(0, 1), ghosts[ghostIdx], ghosts[ghostIdx + 1])
        ghostIdx += 2
        need--
      } else {
        break
      }
    }
    if (need === 0) {
      const hasBannedConcrete = picked.some(c => !ghostSet.has(c) && (c.rank === 15 || c.rank === 16 || c.rank === 17))
      if (!hasBannedConcrete) {
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
    // ★ v0.4.21 对抗性审查 VAI-1 修复:之前 filter(r => r <= 13) 把 A(14)排了,
    //   导致手牌有 ♠10JQKA 的合法同花顺,AI 找不到(guandan-engine.test.js L62
    //   明确 10JQKA 是合法顺子)。规则边界:不含 2(15)/王(16/17),A 作为 14 允许。
    const ranks = Object.keys(cnt).map(Number).filter(r => r >= 3 && r <= 14).sort((a, b) => a - b)
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
 * v3.x P1-5 修复:原版只出最小单张,从不考虑对子/三带二/顺子/炸弹。
 * 现在按注释完整实现:
 *   1. 最小单张(走小牌)
 *   2. 最小对子(优先走"只剩 1 张"的 rank,留着凑不齐的牌)
 *   3. 最小三张/三带二
 *   4. 最小炸弹(4 张,避免浪费大炸弹 — 留作防守)
 *   5. 最小顺子/连对/钢板(走成组结构)
 *
 * "最小"=出后剩的手牌张数尽量少且仍能保持完整性。
 */
function chooseLead(cards, levelRank) {
  if (cards.length === 0) return { type: 'pass' }
  const { concrete, ghosts } = E.splitGhosts(cards, levelRank)
  const cnt = E.countByRank(concrete)

  // 1. 最小对子(cnt===2 的 rank,优先出 rank 小的)
  const pairRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] === 2 && r <= 14).sort((a, b) => a - b)
  if (pairRanks.length > 0) {
    const r = pairRanks[0]
    return { type: 'play', cards: concrete.filter(c => c.rank === r).slice(0, 2) }
  }

  // 2. 最小三张(cnt===3 的 rank,带任意配牌凑三带二;或纯三张)
  const tripleRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= 3 && r <= 14).sort((a, b) => a - b)
  if (tripleRanks.length > 0) {
    const r = tripleRanks[0]
    const tripleCards = concrete.filter(c => c.rank === r).slice(0, 3)
    // 三带二:还剩别的 rank 可以凑配对
    const otherRanks = Object.keys(cnt).map(Number).filter(r2 => r2 !== r && cnt[r2] >= 2)
    if (otherRanks.length > 0) {
      const r2 = otherRanks.sort((a, b) => a - b)[0]
      return { type: 'play', cards: [...tripleCards, ...concrete.filter(c => c.rank === r2).slice(0, 2)] }
    }
    return { type: 'play', cards: tripleCards }
  }

  // 3. 最小炸弹 — 主动出时选最小炸弹(4 张炸,留大炸弹防守)
  //    同张数取 rank 最小(避免扔大王炸出 8 炸)
  if (concrete.length >= 4) {
    const bombRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] === 4 && r <= 15).sort((a, b) => a - b)
    if (bombRanks.length > 0) {
      const r = bombRanks[0]
      return { type: 'play', cards: concrete.filter(c => c.rank === r).slice(0, 4) }
    }
  }

  // 4. 最小顺子(5 张) — 找连续的 5 张
  if (concrete.length + ghosts.length >= 5) {
    const straight = findMinStraight(concrete, ghosts, 5, 0, levelRank)
    if (straight && straight.length === 5) {
      return { type: 'play', cards: straight }
    }
  }

  // 5. 最小单张(走小牌)
  if (concrete.length > 0) {
    const sortedConcrete = E.sortHand(concrete)
    const smallest = sortedConcrete[sortedConcrete.length - 1]
    return { type: 'play', cards: [smallest] }
  }

  // 全是鬼牌
  if (ghosts.length > 0) {
    return { type: 'play', cards: [ghosts[0]] }
  }

  return { type: 'play', cards: [cards[0]] }
}

/**
 * Hard 难度领出策略 v1
 *
 * 设计目标:防守意识 + 炸弹保留 + 不浪费大牌
 * 与 medium 区别:
 *   - 优先出"小成组牌型"(rank<=10 的对子/三张),不出大对子/大三张
 *   - 炸弹保留:手牌 ≤ 6 张时不出炸弹(关键时刻才打)
 *   - 鬼牌保留:有 2+ 张鬼牌时不出鬼牌(留作凑牌)
 *   - 跟牌更倾向于 PASS(见 decideHard)
 *
 * @param {Array} cards 我的手牌(已 sortHand)
 * @param {Number} levelRank 当前级牌 rank
 * @returns {Object} { type: 'play' | 'pass', cards?: [...] }
 */
function chooseLeadHard(cards, levelRank) {
  if (cards.length === 0) return { type: 'pass' }
  const { concrete, ghosts } = E.splitGhosts(cards, levelRank)
  const cnt = E.countByRank(concrete)

  // 炸弹保留:手牌 ≤ 6 张且有炸弹 → 不主动出炸弹(留作关键时刻)
  const bombRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] === 4 && r <= 15)
  const preserveBomb = bombRanks.length > 0 && cards.length <= 6

  // 鬼牌保留:有 2+ 张鬼牌 → 不出鬼牌(留作凑牌)
  const preserveGhosts = ghosts.length >= 2

  // 0. 手牌 > 6 张 + 有 4 张炸 + 不 preserve → 主动出 4 张炸(清牌 + 对手压不住)
  //    这一步优先于"小成组对子",因为 4 张炸能把对手直接炸死,是关键牌
  if (!preserveBomb && bombRanks.length > 0 && cards.length > 6) {
    const r = bombRanks.sort((a, b) => a - b)[0]
    return { type: 'play', cards: concrete.filter(c => c.rank === r).slice(0, 4) }
  }

  // 1. 优先出"小成组" — 对子/三张(rank <= 10,避免出大牌)
  //    注意:4 张同 rank 不算 3 张(cnt 区分 3 张 vs 4 张炸)
  if (concrete.length >= 2) {
    // 优先 pair (cnt===2)
    const pairRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] === 2 && r <= 10).sort((a, b) => a - b)
    if (pairRanks.length > 0) {
      const r = pairRanks[0]
      return { type: 'play', cards: concrete.filter(c => c.rank === r).slice(0, 2) }
    }
    // 严格 3 张(cnt===3,不是 4 张炸)
    const tripleRanks = Object.keys(cnt).map(Number).filter(r => cnt[r] === 3 && r <= 10).sort((a, b) => a - b)
    if (tripleRanks.length > 0) {
      const r = tripleRanks[0]
      const tripleCards = concrete.filter(c => c.rank === r).slice(0, 3)
      // 三带二:还剩别的 rank 可以凑配对
      const otherRanks = Object.keys(cnt).map(Number).filter(r2 => r2 !== r && cnt[r2] >= 2)
      if (otherRanks.length > 0) {
        const r2 = otherRanks.sort((a, b) => a - b)[0]
        return { type: 'play', cards: [...tripleCards, ...concrete.filter(c => c.rank === r2).slice(0, 2)] }
      }
      return { type: 'play', cards: tripleCards }
    }
  }

  // 2. 小单张(有 concrete 时)
  if (concrete.length > 0) {
    const sortedConcrete = E.sortHand(concrete)
    // 倒数第二小(倒数最小可能太憋手,留 1 张凑牌)
    return { type: 'play', cards: [sortedConcrete[sortedConcrete.length - 1]] }
  }

  // 3. 鬼牌(只有 1 张时才出)
  if (ghosts.length === 1) {
    return { type: 'play', cards: [ghosts[0]] }
  }

  // 4. 炸弹(只在手牌 > 6 张时考虑主动出,且取 rank 最小)
  if (!preserveBomb && bombRanks.length > 0) {
    const r = bombRanks.sort((a, b) => a - b)[0]
    return { type: 'play', cards: concrete.filter(c => c.rank === r).slice(0, 4) }
  }

  // 5. 鬼牌(preserveGhosts 情况下被迫出)
  if (ghosts.length > 0 && !preserveGhosts) {
    return { type: 'play', cards: [ghosts[0]] }
  }

  // fallback:出最小 concrete(无 concrete 时出鬼牌)
  if (concrete.length > 0) {
    return { type: 'play', cards: [concrete[concrete.length - 1]] }
  }
  return { type: 'play', cards: ghosts.length > 0 ? [ghosts[0]] : [cards[0]] }
}

/**
 * Hard 难度跟牌策略 v1
 *
 * 跟 medium 区别:
 *   - 炸弹保护:只剩 1 个炸弹(且是 4 张最小炸)且非关键时刻 → PASS
 *   - 大牌保护:跟的牌会导致手牌中"大对子/大三张"被拆 → PASS
 *   - 鬼牌保护:跟牌需要用鬼牌时,如果手牌 ≤ 6 张且能用其他牌 → PASS
 *   - 队友最后出牌:接风时,hard 难度出"小但能赢"的牌(选最小可赢而非最大)
 *
 * @param {Array} hand 我的手牌
 * @param {Object} currentPlay 当前桌面牌
 * @param {Number} levelRank 当前级牌 rank
 * @param {Number} ghostCount 鬼牌张数
 * @returns {Array|null} 跟牌数组 / null(不能/不愿跟)
 */
function findMinBeatHard(hand, currentPlay, ghostCount, levelRank) {
  // 标准 findMinBeat
  const beat = findMinBeat(hand, currentPlay, ghostCount, levelRank)
  if (!beat || beat.length === 0) return null

  const { concrete, ghosts } = E.splitGhosts(hand, levelRank)
  const cnt = E.countByRank(concrete)

  // 1. 炸弹保护:手牌 ≤ 6 张 + 当前跟的牌包含炸弹 → 检查是否值得
  if (hand.length <= 6) {
    const isBomb = (() => {
      // 简化:如果 beat 全是同 rank 且 count === 4, 视为炸弹
      if (beat.length === 4) {
        const ranks = new Set(beat.map(c => c.rank))
        return ranks.size === 1
      }
      return false
    })()
    // 非炸弹/王炸的对手牌型 → hard 不出 4 张炸(留作关键时刻)
    if (isBomb && currentPlay.type !== TYPE.BOMB_4 && currentPlay.type !== TYPE.BOMB_5
        && currentPlay.type !== TYPE.KINGS_BOMB) {
      return null
    }
  }

  // 2. 鬼牌保护:跟牌用了鬼牌 + 手牌 ≤ 6 张 + 还能用其他牌 → 找非鬼方案
  if (hand.length <= 6 && ghosts.length > 0) {
    const ghostSet = new Set(ghosts)
    const beatHasGhost = beat.some(c => ghostSet.has(c))  // 识别真正的逢人配鬼牌
    if (beatHasGhost) {
      // 尝试 findMinBeat 不带鬼牌(传 ghostCount=0)
      const beatNoGhost = findMinBeat(hand, currentPlay, 0, levelRank)
      if (beatNoGhost && beatNoGhost.length > 0) return beatNoGhost
      // 没有非鬼方案 → 仍用鬼牌
    }
  }

  // 3. 拆大牌保护:跟的牌会导致 cnt >= 2 的"大 rank"(>10)被拆成 1 张
  //    简化:如果 beat 用了一个 cnt[r]===2 中 r>10 的所有牌 → 不要拆
  if (beat.length === 1) {
    const r = beat[0].rank
    if (cnt[r] === 2 && r > 10) {
      // 拆了大对子中一张 → 拒绝
      return null
    }
  }
  if (beat.length === 2) {
    // 对子:检查 rank
    const r = beat[0].rank
    if (cnt[r] === 2 && r > 10) return null
  }

  return beat
}

/**
 * 主入口
 *
 * @param {Array} hand 我的手牌
 * @param {Object} currentPlay 当前桌面牌(我首家时为 null)
 * @param {Number} levelRank 当前级牌 rank
 * @param {Object} ctx { isTeammateLast, mySeatIndex, teammateSeatIndex }
 *                      isTeammateLast: 上一个出牌的人是不是我队友
 * @param {String} difficulty 'medium'(默认,原行为) | 'hard'(防守 + 炸弹保留)
 * @returns {Object} { type: 'play' | 'pass', cards?: [...] }
 */
function decide(hand, currentPlay, levelRank, ctx = {}, difficulty = 'medium') {
  // 首家出牌
  if (!currentPlay || currentPlay.type === TYPE.INVALID) {
    return difficulty === 'hard' ? chooseLeadHard(hand, levelRank) : chooseLead(hand, levelRank)
  }

  // 队友最后出牌(我可以接风自由出)
  if (ctx.isTeammateLast) {
    // 接风:出小牌(hard 难度也走领出策略)
    return difficulty === 'hard' ? chooseLeadHard(hand, levelRank) : chooseLead(hand, levelRank)
  }

  // 跟牌:找最小能压
  const ghostCount = E.splitGhosts(hand, levelRank).ghosts.length
  if (difficulty === 'hard') {
    const beat = findMinBeatHard(hand, currentPlay, ghostCount, levelRank)
    if (beat && beat.length > 0) {
      return { type: 'play', cards: beat }
    }
    return { type: 'pass' }
  }
  const beat = findMinBeat(hand, currentPlay, ghostCount, levelRank)
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
function autoPlayGrouped(hand, lastPlay, levelRank, ctx = {}, difficulty = 'medium') {
  if (!hand || hand.length === 0) return { type: 'pass' }

  // 拆分鬼牌(逢人配)
  const { concrete, ghosts } = E.splitGhosts(hand, levelRank)
  const ghostAvail = ghosts.length

  // Hard 难度:手牌 > 8 张时不出王炸/同花顺(留作关键时刻)
  //   手牌 ≤ 8 张时按 medium 行为出(用大牌快速走完)
  const skipBigPlays = difficulty === 'hard' && hand.length > 8

  if (!skipBigPlays) {
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
  }

  // 4. 钢板
  const plate = findBestSteelPlate(concrete, ghostAvail, ghosts)
  if (plate) return { type: 'play', cards: plate }

  // 5. 顺子
  //    Hard 难度手牌 > 8 张时也跳过 5+ 张顺子(5+ 张顺子也是大结构牌,留作关键时刻)
  if (!skipBigPlays) {
    const straight = findBestStraight(concrete, ghostAvail, ghosts)
    if (straight) return { type: 'play', cards: straight }
  } else {
    // hard:5 张以下小顺子可出(3-4 张的微顺子)
    // 简化:findBestStraight 已经返回最大,hard 时如果长度 >= 5 也跳过
    // 真实实现可以用 findBestShortStraight,但项目没这个函数
    // 简单策略:hard skipBigPlays 时只出 4 张以下小结构,跳过 5+ 张
    // → 暂时硬跳过整个 findBestStraight
  }

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
 * 找"最合理"的炸弹(4+ 张同 rank)。有鬼牌优先尝试凑。
 *
 * v3.x P1-9 修复:原版 "len 8→4 + 同长度取最大 rank" → 主动出牌时扔最强炸弹(王炸级别),
 *   浪费防守资源。现在主动出牌时取最小炸弹(留大炸弹防守):
 *   - 张数少(4 张炸)优先于张数多(8 张炸)— 因为我们要"主动出"而不是"压"
 *   - 同长度取 rank 最小
 *
 * 压牌(防守)用 findMinBomb,主动出用 findBestBomb — 两者目的不同。
 */
function findBestBomb(cards, ghostAvail, ghosts) {
  const cnt = E.countByRank(cards)
  // 1) 纯实牌炸弹:主动出 → 选最小(4 张炸 > 5 张炸 > ...),同长度 rank 最小
  for (let len = 4; len <= 8; len++) {
    const ranks = Object.keys(cnt).map(Number).filter(r => cnt[r] >= len && r <= 15).sort((a, b) => a - b)
    if (ranks.length > 0) {
      const r = ranks[0]  // 最小 rank(主动出牌不浪费大牌)
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
 * 找最大顺子(5+ 张单张连续),允许用鬼牌填补中间缺张
 */
function findBestStraight(cards, ghostAvail, ghosts) {
  if (cards.length + ghostAvail < 5) return null
  const cnt = E.countByRank(cards)
  const allRanks = Object.keys(cnt).map(Number).filter(r => r >= 3 && r <= 14).sort((a, b) => a - b)
  let best = null
  // 枚举所有[start,end]区间,用鬼牌补缺失的 rank,优先取最长,同长度取最大主 rank
  for (let start = 3; start <= 14; start++) {
    for (let end = start + 4; end <= 14; end++) {
      const len = end - start + 1
      let missing = 0
      const picked = []
      let ghostPool = ghosts.slice()
      for (let r = start; r <= end; r++) {
        const have = cards.filter(c => c.rank === r)
        if (have.length > 0) {
          picked.push(have[0])
        } else if (ghostPool.length > 0) {
          picked.push(ghostPool.shift())
          missing++
        } else {
          missing = Infinity
          break
        }
      }
      if (missing <= ghostAvail && missing !== Infinity) {
        if (!best || len > best.len || (len === best.len && end > best.end)) {
          best = { start, end, len, picked }
        }
      }
    }
  }
  return best ? best.picked : null
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
  findMinBeatHard,
  chooseLead,
  chooseLeadHard,
  autoPlayGrouped,
  TYPE_VALUE,
}

// Default export for convenient `import AI from '@/common/guandan-ai.js'`
const AI = {
  decide,
  findMinBeat,
  findMinBeatHard,
  chooseLead,
  chooseLeadHard,
  autoPlayGrouped,
  TYPE_VALUE,
}
export default AI
