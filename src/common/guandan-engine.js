/**
 * 掼蛋规则引擎 —— 纯 JS,无依赖
 *
 * 编码约定(全工程统一):
 *   花色 suit: 0=黑桃 1=红桃 2=梅花 3=方块
 *   点数 rank: 3..13(K), 14=A, 15=2, 16=小王, 17=大王
 *   内部数据: {suit, rank} 数组
 *
 * 顺序: 大王(17) > 小王(16) > 2(15) > A(14) > K(13) > ... > 3(3)
 * 注意"红桃级牌"(逢人配)由调用方在出牌时特殊处理,引擎不做判断
 */

// 严格牌型长度限制开关
// P1-04:竞技规则下,顺子只准 5 张,连对只准 3 对(6 张),钢板只准 2 组三张(6 张)
const STRICT_LENGTH_LIMITS = true

// ============ 基础数据 ============
const SUIT_NAMES = ['♠', '♥', '♣', '♦']
const RANK_NAMES = ['', '', '', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王']
// 升级序列:从打 2(rank=15)开始,按 2 → 3 → 4 → ... → A 顺序升级,最后回到 2
// 索引 0=2(15),1=3(3),2=4(4),...,12=A(14)
// v3.x P3-2 修复:不再 export — 没有任何调用方(getLevelRank 内部用 while 循环,不需要这个数组)
const LEVEL_SEQUENCE = [15, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

// ============ 牌组生成 ============
/**
 * 生成一副新牌(两副共108张)
 * 返回 [{suit, rank}, ...]
 */
function createDeck() {
  const deck = []
  for (let copy = 0; copy < 2; copy++) {
    // 普通牌:3..15(对应 3..K..A..2),13 个 rank
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 3; rank <= 15; rank++) {
        deck.push({ suit, rank })
      }
    }
    // 大小王
    deck.push({ suit: -1, rank: 16 }) // 小王
    deck.push({ suit: -1, rank: 17 }) // 大王
  }
  return deck
}

/**
  * 洗牌(Fisher-Yates)
  * 不传 seed → 用 Math.random()(单局/单机)
  * 传 seed → 走 mulberry32 PRNG,4-tab P2P 联机发同一手牌
  */
/**
 * mulberry32 — 32-bit 种子 PRNG,周期 2^32,均匀分布够用
 * 4-tab 联机用 seed 让 4 个 tab 发同一手牌(seed 是 32-bit int,joiners 收到后能复现)
 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, seed) {
  const a = arr.slice()
  const rand = seed == null ? Math.random : mulberry32(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 排序:从大到小。同 rank 时按 黑桃>红桃>梅花>方块(同色)排;王最大
 */
function sortHand(hand) {
  return hand.slice().sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank
    return a.suit - b.suit
  })
}

/**
 * 理牌排序:同数字的牌排在一起,数字从大到小,同数字按花色(黑桃>红桃>梅花>方块)。
 * 这是掼蛋玩家常见的"理牌"操作:把 4 张 3、3 张 5、2 张 K 这种成组相邻排好,方便找牌。
 * 王按大小并入末尾(小王 16 < 大王 17)。
 */
function sortHandGrouped(hand) {
  return hand.slice().sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank
    // 王(suit=-1) 强制排到同 rank 的最末(只在同 rank 时影响)
    if (a.suit === -1 && b.suit !== -1) return 1
    if (b.suit === -1 && a.suit !== -1) return -1
    return a.suit - b.suit
  })
}

/**
 * 判断一张牌是不是当前级牌(逢人配的备选 — 红桃级牌才是鬼牌)
 * @param {Card} c
 * @param {number} levelRank
 *
 * v3.x P2-15 修复:旧版把红桃 + 方块都当级牌,但 splitGhosts 只分离红桃。
 *   现在对齐 splitGhosts:**只有红桃级牌**才是级牌(可作万能)。方块级牌是普通牌。
 */
function isLevelCard(c, levelRank) {
  if (!c || c.suit === -1) return false
  // suit: 0=♠, 1=♥(红桃 — 鬼牌), 2=♣, 3=♦
  if (c.suit !== 1) return false  // 只红桃才是级牌
  return c.rank === levelRank
}

// ============ 牌型识别 ============
/**
 * 牌型枚举
 */
const TYPE = {
  INVALID: 0,
  SINGLE: 1,       // 单张
  PAIR: 2,         // 对子
  THREE: 3,        // 三张
  THREE_PAIR: 4,   // 三带二
  STRAIGHT: 5,     // 顺子(5+张)
  PAIR_STRAIGHT: 6,// 三连对(3+对)
  THREE_STRAIGHT: 7,// 钢板(2+组三张)
  BOMB_4: 8,       // 四张炸弹
  BOMB_5: 9,       // 五张炸弹
  BOMB_6: 10,      // 六张炸弹
  BOMB_7: 11,
  BOMB_8: 12,
  STRAIGHT_FLUSH: 13, // 同花顺(5张同花色连续)
  KINGS_BOMB: 14,  // 四王炸
}

/**
 * 关键工具:按 rank 统计
 * 返回 {rank: count}
 */
function countByRank(cards) {
  const m = {}
  for (const c of cards) {
    m[c.rank] = (m[c.rank] || 0) + 1
  }
  return m
}

/**
 * 判断一组牌是什么牌型
 * 返回 {type, mainRank, length, suit?}  type=0 即非法
 *
 * 简化约定(竞技规则):
 *  - 顺子/三连对/钢板 不能含大小王、不能含 2(除 A23 边界外,这里严格不允许)
 *  - 2 不可入顺
 *  - 同花顺 = 5 张同花色 + 连续
 *  - 王炸 = 4 张王
 *  - 炸弹张数从 4 起
 *
 * 逢人配(红桃级牌)由调用方先"补"出,引擎接收的是已"具象化"的牌
 *  —— 即调用方负责把红桃级牌替换成具体牌值,然后再调用本函数
 *  —— 这样引擎实现更简单,后续 AI/比较都能用同一套逻辑
 */
function recognize(cards) {
  if (!cards || cards.length === 0) return { type: TYPE.INVALID }

  const cnt = countByRank(cards)
  const counts = Object.values(cnt)
  const len = cards.length
  // 王牌特殊处理
  const jokerCnt = (cnt[16] || 0) + (cnt[17] || 0)

  // 王炸(4王) — P1-03 修复:必须是恰好 4 张且全为王(加 len===4 防止 4 王+N 张被误判)
  if (len === 4 && jokerCnt === 4) {
    return { type: TYPE.KINGS_BOMB, mainRank: 17, length: 4 }
  }

  // 炸弹
  if (jokerCnt === 0 && len >= 4 && len <= 8) {
    const ranks = Object.keys(cnt).map(Number)
    if (ranks.length === 1) {
      // 张数 → 类型
      const map = { 4: TYPE.BOMB_4, 5: TYPE.BOMB_5, 6: TYPE.BOMB_6, 7: TYPE.BOMB_7, 8: TYPE.BOMB_8 }
      if (map[len]) return { type: map[len], mainRank: ranks[0], length: len }
    }
  }

  // 同花顺(5 张同花色连续)
  if (len === 5 && jokerCnt === 0) {
    const first = cards[0]
    if (cards.every(c => c.suit === first.suit)) {
      const ranks = cards.map(c => c.rank).sort((a, b) => a - b)
      // 不能含 2 或王
      if (!ranks.includes(15) && !ranks.includes(16) && !ranks.includes(17)) {
        // 顺子内连续
        let ok = true
        for (let i = 1; i < ranks.length; i++) {
          if (ranks[i] !== ranks[i - 1] + 1) { ok = false; break }
        }
        if (ok) return { type: TYPE.STRAIGHT_FLUSH, mainRank: ranks[ranks.length - 1], length: 5, suit: first.suit }
      }
    }
  }

  // 单张
  if (len === 1) {
    return { type: TYPE.SINGLE, mainRank: cards[0].rank, length: 1 }
  }

  // 对子(注意大小王不可组成对子)
  //   v3.x P2-26 明确(E-3):掼蛋规则 — 王不能组对子(2 张小王 / 2 张大王都不行),
  //   王的合法组合只有王炸(4 张王一起)和单张。当前实现 jokerCnt === 0 是正确的,
  //   显式 reject jokerCnt === 2 的情形,避免误判为对子。
  if (len === 2 && jokerCnt === 0 && counts.length === 1) {
    return { type: TYPE.PAIR, mainRank: Number(Object.keys(cnt)[0]), length: 2 }
  }

  // 三张
  if (len === 3 && jokerCnt === 0 && counts.length === 1) {
    return { type: TYPE.THREE, mainRank: Number(Object.keys(cnt)[0]), length: 3 }
  }

  // 三带二
  if (len === 5 && jokerCnt === 0 && counts.length === 2) {
    const countsArr = Object.values(cnt).sort((a, b) => b - a)
    if (countsArr[0] === 3 && countsArr[1] === 2) {
      const mainRank = Number(Object.entries(cnt).find(([k, v]) => v === 3)[0])
      return { type: TYPE.THREE_PAIR, mainRank, length: 5 }
    }
  }

  // 钢板(连续三张,2+组)
  // P1-04:严格模式下只准 2 组三张(6 张)
  const threeStraightMinLen = STRICT_LENGTH_LIMITS ? 6 : 6
  const threeStraightMaxLen = STRICT_LENGTH_LIMITS ? 6 : 12
  if (jokerCnt === 0 && counts.length >= 2 && len >= threeStraightMinLen && len <= threeStraightMaxLen && len % 3 === 0) {
    // 每个 rank 出现 3 次,且 rank 连续
    if (counts.every(c => c === 3)) {
      const ranks = Object.keys(cnt).map(Number).sort((a, b) => a - b)
      let ok = true
      for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] !== ranks[i - 1] + 1) { ok = false; break }
      }
      if (ok && !ranks.includes(15) && !ranks.includes(16) && !ranks.includes(17)) {
        return { type: TYPE.THREE_STRAIGHT, mainRank: ranks[ranks.length - 1], length: len }
      }
    }
  }

  // 三连对(3+对)
  // P1-04:严格模式下只准 3 对(6 张)
  const pairStraightMinLen = STRICT_LENGTH_LIMITS ? 6 : 6
  const pairStraightMaxLen = STRICT_LENGTH_LIMITS ? 6 : 12
  if (jokerCnt === 0 && counts.length >= 3 && len >= pairStraightMinLen && len <= pairStraightMaxLen && len % 2 === 0) {
    if (counts.every(c => c === 2)) {
      const ranks = Object.keys(cnt).map(Number).sort((a, b) => a - b)
      let ok = true
      for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] !== ranks[i - 1] + 1) { ok = false; break }
      }
      if (ok && !ranks.includes(15) && !ranks.includes(16) && !ranks.includes(17)) {
        return { type: TYPE.PAIR_STRAIGHT, mainRank: ranks[ranks.length - 1], length: len }
      }
    }
  }

  // 顺子(5+张单张连续)
  // P1-04:严格模式下只准 5 张
  const straightMinLen = STRICT_LENGTH_LIMITS ? 5 : 5
  const straightMaxLen = STRICT_LENGTH_LIMITS ? 5 : 13
  if (jokerCnt === 0 && len >= straightMinLen && len <= straightMaxLen) {
    if (counts.length === len) {
      const ranks = Object.keys(cnt).map(Number).sort((a, b) => a - b)
      // 不能含 2、王
      if (!ranks.includes(15) && !ranks.includes(16) && !ranks.includes(17)) {
        // A23 特殊?这里按"严格不允许 2 出现"做最简化
        let ok = true
        for (let i = 1; i < ranks.length; i++) {
          if (ranks[i] !== ranks[i - 1] + 1) { ok = false; break }
        }
        if (ok) return { type: TYPE.STRAIGHT, mainRank: ranks[ranks.length - 1], length: len }
      }
    }
  }

  return { type: TYPE.INVALID }
}

// ============ 比较(谁大) ============
/**
 * 牌型优先级表(同类型再比 mainRank,炸弹之间独立比较)
 * STRAIGHT_FLUSH(同花顺) > BOMB_8 > BOMB_7 > BOMB_6 > BOMB_5 > BOMB_4 > KINGS_BOMB
 * 按竞技通用:
 *   王炸(4王) > 同花顺 > 8张炸 > 7张炸 > 6张炸 > 5张炸 > 4张炸
 *   普通牌(单/对/三/三带二/顺子/连对/钢板)之间,同类型按 mainRank 比
 *   炸弹可以压任何非炸弹
 */
const TYPE_ORDER = {
  [TYPE.SINGLE]: 0,
  [TYPE.PAIR]: 0,
  [TYPE.THREE]: 0,
  [TYPE.THREE_PAIR]: 0,
  [TYPE.STRAIGHT]: 0,
  [TYPE.PAIR_STRAIGHT]: 0,
  [TYPE.THREE_STRAIGHT]: 0,
  [TYPE.STRAIGHT_FLUSH]: 8, // 仅次于王炸
  [TYPE.BOMB_4]: 1,
  [TYPE.BOMB_5]: 2,
  [TYPE.BOMB_6]: 3,
  [TYPE.BOMB_7]: 4,
  [TYPE.BOMB_8]: 5,
  [TYPE.KINGS_BOMB]: 9,
}

/**
 * 比较 playA 是否能压 playB
 * playA, playB: { type, mainRank, length }
 * 返回 true 表示 A > B
 */
function canBeat(playA, playB) {
  if (!playB) return true  // 首家出牌必可
  if (playA.type === TYPE.INVALID) return false

  // 双方都是王炸
  if (playA.type === TYPE.KINGS_BOMB && playB.type === TYPE.KINGS_BOMB) return false
  if (playA.type === TYPE.KINGS_BOMB) return true
  if (playB.type === TYPE.KINGS_BOMB) return false

  // 双方都是同花顺,比 mainRank
  if (playA.type === TYPE.STRAIGHT_FLUSH && playB.type === TYPE.STRAIGHT_FLUSH) {
    return playA.mainRank > playB.mainRank
  }
  if (playA.type === TYPE.STRAIGHT_FLUSH) return true
  if (playB.type === TYPE.STRAIGHT_FLUSH) return false

  // 双方都是炸弹,比张数
  const aIsBomb = playA.type >= TYPE.BOMB_4 && playA.type <= TYPE.BOMB_8
  const bIsBomb = playB.type >= TYPE.BOMB_4 && playB.type <= TYPE.BOMB_8
  if (aIsBomb && bIsBomb) {
    if (playA.length !== playB.length) return playA.length > playB.length
    return playA.mainRank > playB.mainRank
  }
  if (aIsBomb) return true   // 炸弹压非炸弹
  if (bIsBomb) return false

  // 普通牌型之间:同类型且等长度才能比较 mainRank
  if (playA.type === playB.type && playA.length === playB.length) {
    return playA.mainRank > playB.mainRank
  }
  return false
}

// ============ 逢人配处理 ============
/**
 * 把"红桃级牌"从手牌中分离出来,返回 {concreteCards, ghostCards}
 * ghostCards 是红桃级牌(可作万能),调用方需要在出牌时把它们补成具体牌
 *
 * levelRank: 当前级别的 rank(打几就是几)
 */
function splitGhosts(hand, levelRank) {
  const concrete = []
  const ghosts = []
  for (const c of hand) {
    if (c.suit === 1 && c.rank === levelRank) ghosts.push(c)
    else concrete.push(c)
  }
  return { concrete, ghosts }
}

/**
 * 给定一组"已确定牌型"的牌 + 鬼牌(逢人配)数量
 * 询问能否凑出指定牌型
 *
 * 简化策略:枚举所有"补成什么" —— 复杂度较高,这里只支持"出 1 张/2 张鬼"的最常见情况
 * 更稳健的做法:用 DP,这里给出基础版
 */
function canFormWithGhosts(targetType, targetLength, targetMainRank, concreteCards, ghostCount, levelRank) {
  // ★ v3.x 修复:加总张数 sanity check — concrete.length + ghostCount 必须等于 targetLength
  // 否则根本凑不出目标牌型(比如 2 concrete + 2 鬼 = 4 张,凑不出 PAIR length=2)
  if (concreteCards.length + ghostCount !== targetLength) return false

  // 先尝试纯 concrete 牌
  if (ghostCount === 0) {
    const r = recognize(concreteCards)
    return r.type === targetType && r.length === targetLength && r.mainRank === targetMainRank
  }

  // 简化:每个鬼都可以变成"想要的 rank"
  // 这里限制:只支持 ghostCount <= 2 的情况(2 张红桃级牌就是全部)
  if (ghostCount > 2) return false

  // 枚举 ghostCount 个 rank 的组合(允许重复),逐个验证
  // ghostCount=1 → 15 种,ghostCount=2 → 120 种非递减组合(鬼牌无序),可控
  const allRanks = generateGhostAssignments(targetType, targetMainRank, targetLength, levelRank)
  const combos = combosWithReplacement(allRanks, ghostCount)
  // 同花顺需要鬼牌与 concrete 同花色;其它牌型花色不影响识别
  const ghostSuit = targetType === TYPE.STRAIGHT_FLUSH
    ? (concreteCards.length > 0 ? concreteCards[0].suit : 1)
    : 1
  for (const ranks of combos) {
    const virtual = concreteCards.concat(ranks.map(rank => ({ suit: ghostSuit, rank })))
    const r = recognize(virtual)
    if (r.type === targetType && r.length === targetLength && r.mainRank === targetMainRank) {
      return true
    }
  }
  return false
}

/**
 * 把含鬼牌(红桃级牌)的出牌具象化为可识别的 concrete 牌
 *
 * @param {Card[]} cards 玩家实际选择的牌(可含红桃级牌)
 * @param {number} levelRank 当前级牌 rank
 * @param {Object|null} targetPlay 当前桌面牌 {type, mainRank, length};首家传 null
 * @returns {{cards: Card[], rec: Object}|null} 具象化后的牌组 + 识别结果;无法具象化返回 null
 *
 * 设计:
 *   - 无鬼牌时直接 recognize
 *   - 有鬼牌时枚举鬼牌代表的 rank,找出一个合法且能压过 targetPlay 的解释
 *   - 鬼牌数量 ≤2 时组合数可控(15/225), brute-force 足够
 */
function materializeGhosts(cards, levelRank, targetPlay = null) {
  const { concrete, ghosts } = splitGhosts(cards, levelRank)
  if (ghosts.length === 0) {
    const rec = recognize(cards)
    return rec.type === TYPE.INVALID ? null : { cards, rec }
  }
  if (ghosts.length > 2) return null

  // P0-05 修复:先尝试字面义解释 — 红桃级牌本身就是合法的级牌(当普通牌用)
  // 例如单张红桃级牌应识别为 SINGLE mainRank=levelRank,而不是被具象化成 rank 3
  const literalRec = recognize(cards)
  if (literalRec.type !== TYPE.INVALID) {
    if (!targetPlay) {
      return { cards: cards.map(c => ({ ...c })), rec: literalRec, usedAsGhost: false }
    }
    if (canBeat(literalRec, targetPlay)) {
      return { cards: cards.map(c => ({ ...c })), rec: literalRec, usedAsGhost: false }
    }
  }

  const allRanks = generateGhostAssignments(null, null, null, levelRank)
  const combos = combosWithReplacement(allRanks, ghosts.length)
  // 若 concrete 全部同花色,鬼牌也使用该花色(支持同花顺);否则默认红桃
  const concreteSuits = new Set(concrete.filter(c => c.suit >= 0).map(c => c.suit))
  const ghostSuit = concreteSuits.size === 1 ? [...concreteSuits][0] : 1
  for (const ranks of combos) {
    const concreteCards = concrete.concat(ranks.map(rank => ({ suit: ghostSuit, rank })))
    const rec = recognize(concreteCards)
    if (rec.type === TYPE.INVALID) continue
    if (!targetPlay) return { cards: concreteCards, rec }
    if (canBeat(rec, targetPlay)) return { cards: concreteCards, rec }
  }
  return null
}

/**
 * 为"凑出某牌型"枚举鬼牌可补的 rank 候选
 */
function generateGhostAssignments(targetType, targetMainRank, targetLength, levelRank) {
  // 普通 rank 范围 3..15,大小王 16/17
  // 鬼牌是百搭,可以变任何 rank(包括 2/王)
  // 但 STRAIGHT 类牌型不能含 2/王(具体由 recognize 保证,这里候选给全部)
  return [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
}

/**
 * 枚举从 src 中取 k 个元素(允许重复)的所有组合
 * 例:combosWithReplacement([1,2], 2) → [[1,1],[1,2],[2,2]]
 */
function combosWithReplacement(src, k) {
  if (k === 0) return [[]]
  const result = []
  for (let i = 0; i < src.length; i++) {
    const rest = combosWithReplacement(src.slice(i), k - 1)
    for (const r of rest) {
      result.push([src[i], ...r])
    }
  }
  return result
}

// ============ 发牌与开局 ============
/**
 * 4 人发牌:返回 { hands:[[],[],[],[]], bottom:[] }
 * 不传 seed → 随机发牌(单机/单局)
 * 传 seed → 确定性发牌(4-tab P2P 联机,host 广播 seed 后所有 joiner 拿同一手牌)
 */
function deal(seed) {
  const deck = seed == null ? shuffle(createDeck()) : shuffle(createDeck(), seed)
  const hands = [[], [], [], []]
  for (let i = 0; i < 108; i++) {
    hands[i % 4].push(deck[i])
  }
  // 掼蛋不留底牌(简化:2v2 不扣底),这里 bottom 给 8 张最后给庄家换成闲
  // 暂用经典版本:无底牌模式(每人 27 张)
  return { hands: hands.map(h => sortHand(h)), bottom: [] }
}

// ============ 展示层:按 rank 分组竖叠 ============
/**
 * 把手牌按 rank 分组,返回 RankGroup[]
 * RankGroup = { rank: number, cards: Card[], isJoker: bool }
 *
 * 排序规则:
 *  - JOKER(rank 16/17)成一列,放在最前(最左)
 *  - 普通牌按 [A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2] 顺序
 *  - 同 rank 内按花色 ♠(0) > ♥(1) > ♣(2) > ♦(3) 排
 *  - rank 2 = 15 排最后(spec column header 末位)
 *
 * 用法:UI 把手牌渲染成"每列一个 rank"的竖叠排版,
 *      同 rank 一起出(对子/三张/炸弹)只需点击一列即可。
 *
 * @param {Array} hand 完整手牌
 * @returns {Array<{rank:number, cards:Array, isJoker:boolean}>}
 */
function groupHandByRank(hand) {
  if (!hand || hand.length === 0) return []

  // 1. 分桶:JOKER 单独,其他按 rank
  const byRank = {}
  for (const c of hand) {
    if (c.suit === -1) {
      // JOKER
      if (!byRank.__joker__) byRank.__joker__ = []
      byRank.__joker__.push(c)
    } else {
      if (!byRank[c.rank]) byRank[c.rank] = []
      byRank[c.rank].push(c)
    }
  }

  // 2. 同 rank 内按花色排序:♠(0) > ♥(1) > ♣(2) > ♦(3)
  function sortInGroup(arr) {
    return arr.slice().sort((a, b) => a.suit - b.suit)
  }

  const groups = []

  // 3. JOKER 列放最前
  if (byRank.__joker__ && byRank.__joker__.length > 0) {
    // 同 rank 内大王(17)排前,小王(16)排后
    const jokers = byRank.__joker__.slice().sort((a, b) => b.rank - a.rank)
    groups.push({ rank: 17, cards: jokers, isJoker: true })
  }

  // 4. 普通牌按 [A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2] 顺序
  const ORDER = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 15]
  for (const r of ORDER) {
    if (byRank[r] && byRank[r].length > 0) {
      groups.push({ rank: r, cards: sortInGroup(byRank[r]), isJoker: false })
    }
  }

  return groups
}

// ============ 升级与进贡 ============
/**
 * 计算升级数
 * ranks: [头游rank, 二游rank, 三游rank, 末游rank]  rank 是 0/1/2/3 的玩家下标
 * teams: [[0,2],[1,3]]  对家关系
 * 返回 升级数(0/1/2/3)
 *
 * v3.x P3-5 修复:旧版 `return 0` 在 ranks 长度 < 4 时不可达,会因 ranks[2]/ranks[3]
 *   返回 undefined 导致 teamOf(undefined) = -1,错误命中 "双上" 分支。
 *   现加 length check + warn,数据损坏时显式记录但返回 0 不抛错(避免破坏调用方流程)。
 */
function calcLevelUp(ranks, teams) {
  if (!Array.isArray(ranks) || ranks.length !== 4) {
    console.warn('[calcLevelUp] ranks 应为 4 元素数组,实际:', JSON.stringify(ranks))
    return 0
  }
  if (!Array.isArray(teams) || teams.length !== 2) {
    console.warn('[calcLevelUp] teams 应为 [[a,b],[c,d]],实际:', JSON.stringify(teams))
    return 0
  }
  const teamOf = (p) => teams.findIndex(t => t.includes(p))
  const winnerTeam = teamOf(ranks[0])
  const secondTeam = teamOf(ranks[1])
  if (winnerTeam === secondTeam) return 3      // 双上
  if (winnerTeam === teamOf(ranks[3])) return 1 // 头+末同队
  if (winnerTeam === teamOf(ranks[2])) return 2 // 头+三同队
  return 0                                        // 双下(异常兜底 — length check 已拦截)
}

/**
 * 当前级牌是什么 rank
 * 起始打 2 (rank=15),升级顺序:2 → 3 → 4 → ... → A → 回到 2
 * 序列:2(15),3(3),4(4),5(5),6(6),7(7),8(8),9(9),10(10),J(11),Q(12),K(13),A(14)
 *
 * 严格规则:打 A 时本队获头游才算过 A,否则退回打 K
 * 本函数不实现"过 A"特殊逻辑,仅作线性升级。
 * 调用方需根据业务判断是否过 A。
 */
function getLevelRank(currentLevelRank, levelUp) {
  // P0-04 修复:改为基于 LEVEL_SEQUENCE 的索引推进,正确顺序 2→3→...→A
  const idx = LEVEL_SEQUENCE.indexOf(currentLevelRank)
  if (idx < 0) throw new Error(`getLevelRank: currentLevelRank=${currentLevelRank} 不在升级序列中`)
  const nextIndex = Math.min(idx + levelUp, LEVEL_SEQUENCE.length - 1)
  return LEVEL_SEQUENCE[nextIndex]
}

/**
 * 进贡判定
 * ranks: [头游, 二游, 三游, 末游]
 * teams: [[0,2],[1,3]]
 * levelRank: 当前级牌 rank — 用于判断"打 A 是否过 A"特殊规则
 * 返回 {
 *   needTribute: bool,            // 是否需要进贡
 *   from: [fromPlayer, ...],      // 进贡方
 *   to: [toPlayer, ...],          // 收贡方
 *   doubleTribute: bool           // 双下 → 两人都要贡
 *   pairFromTo: [[from,to], ...]  // v3.x G-12:明确"谁给谁"配对,双贡时用
 * }
 *
 * v3.x P3-6 修复:旧版永远 needTribute=true,因为简化实现没考虑 "打 A 没过头游" 特殊规则。
 *   严格掼蛋规则:打 A 时,若本队**没拿到头游**,本轮不升级也不进贡,仍打 K。
 *   现在加 levelRank 入参 + 头游校验,处理打 A 不过的情况。
 *
 * v3.x G-12 修复:增加 pairFromTo 明确"谁给谁",双贡时按"下游给上游"配对:
 *   - 单下贡(头+末/头+三同队):from=[末],to=[头]
 *   - 双下贡(双上):下游(三+末游)分别给上游(头+二游)
 *
 * v3.x P2-27 修复(E-6):旧版两个返回路径都硬编码 needTribute=true,字段无判断意义。
 *   新增可选 levelUp 参数:严格"双下不贡"规则下,头+二+三+末分占两队(对应 levelUp=0)
 *   时不贡。2v4 划分下 levelUp=0 实际不可达(calcLevelUp 的 4 个分支都对应需贡),
 *   此分支是防御性 fallback,让 needTribute 字段有真正的判断意义。
 *   旧调用方(不传 levelUp)行为完全不变。
 *
 * @param {Array<number>} ranks
 * @param {Array<Array<number>>} teams
 * @param {number} [levelUp] —— 升级数(0/1/2/3)。可选,不传则按 2v2 永远贡的旧行为。
 * @param {number} [levelRank] —— 当前级牌 rank(可选,用于打 A 不过的特殊规则)
 */
function tributeInfo(ranks, teams, levelUp, levelRank) {
  // v3.x P2-27 修复(E-6):严格规则下,levelUp === 0(头+二+三+末分占两队,即真"双下")不贡
  //   实际 2v2 划分下 levelUp=0 不可达,此分支是防御性 + 让字段有判断意义
  if (levelUp === 0) {
    return {
      needTribute: false,
      from: [],
      to: [],
      doubleTribute: false,
      pairFromTo: [],
    }
  }

  const head = ranks[0]
  const second = ranks[1]
  const third = ranks[2]
  const last = ranks[3]
  const headTeam = teams.findIndex(t => t.includes(head))
  const lastTeam = teams.findIndex(t => t.includes(last))
  const thirdTeam = teams.findIndex(t => t.includes(third))
  const secondTeam = teams.findIndex(t => t.includes(second))

  // 严格规则:打 A 时,头游队没过 A → 不升级不贡
  // 简化判定:打 A(levelRank===14) 且本局没有升级(levelUp===0) → 未过 A,不进贡
  if (levelRank === 14 /* A */ && levelUp === 0) {
    return {
      needTribute: false,
      from: [],
      to: [],
      doubleTribute: false,
      pairFromTo: [],
    }
  }

  if (headTeam === secondTeam) {
    // 双上:三+末游(下游两人)各贡一张给头+二游(上游两人)
    return {
      needTribute: true,
      from: teams[lastTeam],          // 输家两人
      to: teams[headTeam],            // 赢家两人
      doubleTribute: true,
      // v3.x G-12:明确配对 — 三游给头游,末游给二游(下游对应上游)
      pairFromTo: [
        [third, head],
        [last, second],
      ],
    }
  }
  // 其他(升 1 或 2):末向头单贡
  return {
    needTribute: true,
    from: [last],
    to: [head],
    doubleTribute: false,
    pairFromTo: [[last, head]],
  }
}

// ============ 导出 ============
export {
  // 常量
  SUIT_NAMES, RANK_NAMES, TYPE, TYPE_ORDER,
  // 牌组
  createDeck, shuffle, sortHand, sortHandGrouped, isLevelCard, deal,
  // PRNG(4-tab 联机用 seeded firstPlayer)
  mulberry32,
  // 工具
  countByRank,
  // 识别
  recognize, canBeat, splitGhosts, canFormWithGhosts, materializeGhosts,
  // 展示层
  groupHandByRank,
  // 升级
  calcLevelUp, getLevelRank, tributeInfo,
}
