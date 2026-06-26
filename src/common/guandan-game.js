/**
 * 掼蛋对局状态机
 *
 * 控制一局掼蛋的完整流程:
 *   发牌 → 翻牌定首家 → 轮流出牌 → 一家出完 → 计算名次 → 进贡/还贡 → 升级 → 下一局
 *
 * 状态:
 *   idle / dealing / playing / trick_end / finished
 *
 * 用法:
 *   const game = createGame({ seats, levelRank, isHost, aiPlayers })
 *   game.on('play', (play) => { ... })  // 监听出牌
 *   game.deal()        // 发牌
 *   game.playerPlay(seat, cards)  // 玩家出牌(本地校验)
 *   game.playerPass(seat)
 *   // 4-tab 联机用(收到广播后无校验应用,本地已经校验过)
 *   game.applyPlay(seat, cards)
 *   game.applyPass(seat)
 *   game.applyRoundEnd()  // 一局结束/升级/进贡
 *   game.getState()    // 取当前状态
 */

import * as E from './guandan-engine.js'
import * as AI from './guandan-ai.js'

function createGame(opts) {
  const { seats = 4, levelRank = 15, isHost = true, aiPlayers: initialAI = [], seed = null } = opts
  // ★ v3.8 P1:aiPlayers 用可变数组(支持运行时加 seat,例如断线 AI 接管)
  let aiPlayers = initialAI.slice()
  // ★ v3.8 P1:AI 出的牌要广播给其他 tab(由 GameView 注入)
  let aiBroadcast = null

  const state = {
    phase: 'idle',           // idle | dealing | playing | trick_end | finished
    round: 1,                // 当前局数
    levelRank,               // 当前级牌 rank
    hands: [[], [], [], []], // 4 个玩家手牌
    tableCards: [],          // 当前桌面已出牌(一轮)
    lastPlay: null,          // 当前桌面牌型 {type, mainRank, length, who, cards}
    currentPlayer: 0,        // 当前出牌的玩家(座位)
    firstPlayer: 0,          // 本轮首家
    leaderPlayer: 0,         // 本局领出者(头游)
    trickHistory: [],        // 历次出牌
    finishedOrder: [],       // 出完牌的顺序 [seat, seat, seat, seat]
    passCount: 0,            // 连续 pass 数
    tribute: null,           // 进贡信息
    ghost: null,             // 逢人配(红桃级牌)
    levelUp: 0,              // 本局升级数
  }

  const handlers = {}
  function on(event, fn) {
    if (!handlers[event]) handlers[event] = []
    handlers[event].push(fn)
  }
  function off(event) { delete handlers[event] }
  function emit(event, ...args) {
    const list = handlers[event] || []
    for (const fn of list) {
      try { fn(...args) } catch (e) { console.error(e) }
    }
  }

  function getState() { return state }

  // ============ 发牌 ============
  // ★ v3.8 P1 修复:4-tab 联机用 host 广播的 seed 发同一手牌
  // 不传 seed → 走引擎的随机(单机模式兼容)
  function deal(forcedSeed) {
    const useSeed = forcedSeed != null ? forcedSeed : seed
    const result = useSeed == null ? E.deal() : E.deal(useSeed)
    state.hands = result.hands
    state.phase = 'dealing'
    state.tableCards = []
    state.lastPlay = null
    state.finishedOrder = []
    state.passCount = 0
    state.trickHistory = []
    state.tribute = null
    state.levelUp = 0
    state.ghost = { suit: 1, rank: state.levelRank }  // 红桃级牌
    // 找红桃级牌的拥有者 → 翻牌定首家(简化:seeded 随机,4-tab 联机时所有 tab 拿同一家)
    if (useSeed != null && E.mulberry32) {
      const rng = E.mulberry32(useSeed ^ 0x5A5A5A5A)
      state.firstPlayer = Math.floor(rng() * 4)
    } else {
      state.firstPlayer = Math.floor(Math.random() * 4)
    }
    state.currentPlayer = state.firstPlayer
    state.leaderPlayer = state.firstPlayer
    state.phase = 'playing'
    emit('dealt', { hands: state.hands.map(h => h.length), firstPlayer: state.firstPlayer, levelRank: state.levelRank })
    emit('turn', state.currentPlayer, state.lastPlay, { isTeammateLast: false })
    // AI 自动出(联机模式 aiPlayers 空则跳过)
    if (aiPlayers.length > 0) scheduleAI()
  }

  // ============ 出牌 ============
  function playerPlay(seat, cards) {
    if (state.phase !== 'playing' && state.phase !== 'trick_end') {
      return { ok: false, error: '对局未开始' }
    }
    if (seat !== state.currentPlayer) {
      return { ok: false, error: '不是你的回合' }
    }
    if (state.finishedOrder.includes(seat)) {
      return { ok: false, error: '你已出完牌' }
    }
    // 验证牌都在手牌里
    const hand = state.hands[seat].slice()
    for (const card of cards) {
      const idx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
      if (idx < 0) return { ok: false, error: '牌不在手牌中' }
      hand.splice(idx, 1)
    }
    // 验证牌型
    const rec = E.recognize(cards)
    if (rec.type === E.TYPE.INVALID) return { ok: false, error: '非法牌型' }
    // 验证能压
    if (state.lastPlay && !E.canBeat(rec, state.lastPlay)) {
      return { ok: false, error: '压不过当前桌面牌' }
    }
    // ★ v3.8 P1:抽离出 applyPlay 让 P2P 同步复用
    applyPlay(seat, cards, hand, rec)
    return { ok: true }
  }

  /**
   * ★ v3.8 P1:无校验出牌,4-tab 联机同步用
   * 收到 host 广播的 PLAY 后,joiner 直接调这个,不重跑校验(避免 own broadcast 双重处理)
   * 也跳过 scheduleAI(联机 4 人都是真人,没 AI)
   */
  function applyPlay(seat, cards, hand, rec) {
    if (!hand) {
      // 兼容性调用:外部只传 seat+cards,从 state 取手牌
      hand = state.hands[seat].slice()
      for (const card of cards) {
        const idx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
        if (idx >= 0) hand.splice(idx, 1)
      }
    }
    if (!rec) rec = E.recognize(cards)
    state.hands[seat] = hand
    state.tableCards = cards
    state.lastPlay = { ...rec, who: seat, cards }
    state.passCount = 0
    state.trickHistory.push({ seat, cards, type: rec.type })
    emit('play', { seat, cards, type: rec.type })

    if (hand.length === 0) {
      state.finishedOrder.push(seat)
      emit('playerFinished', { seat, order: state.finishedOrder.length })
      // v3.x P0-5 修复:掼蛋标准规则 — 3 人出完(任意组合)即结束本局,因为
      // 必有某队 2 人都已出完(team seat+2)。原条件检查下一家是否 finished
      // 会漏掉"刚出完的玩家自己就是剩下的最后一个,且下一家已 finished"的情形,
      // 导致最后一人被迫独自打完手牌,违反标准规则。
      if (state.finishedOrder.length >= 3) {
        finishRound()
        return
      }
      nextTurn(true)
    } else {
      nextTurn(false)
    }
  }

  function playerPass(seat) {
    if (state.phase !== 'playing') return { ok: false, error: '非出牌阶段' }
    if (seat !== state.currentPlayer) return { ok: false, error: '不是你的回合' }
    if (!state.lastPlay) return { ok: false, error: '首家不能 pass' }
    applyPass(seat)
    return { ok: true }
  }

  /**
   * ★ v3.8 P1:无校验过牌,4-tab 联机同步用
   *
   * v3.x P0-4 修复:passCount 阈值由硬编码 3 改为 `activePlayers - 1`,
   * 其中 activePlayers = 4 - finishedOrder.length。理由:已出完的玩家无法
   * pass,真正能 pass 的是"除 leader 外的活跃玩家"。
   *   4 人都活跃 → 需要 3 次 pass
   *   3 人活跃(1 人 finished) → 需要 2 次 pass
   *   2 人活跃 → 需要 1 次 pass(残局)
   */
  function applyPass(seat) {
    state.passCount++
    state.trickHistory.push({ seat, pass: true })
    emit('pass', { seat })
    const activePlayers = 4 - state.finishedOrder.length
    if (state.passCount >= activePlayers - 1) {
      const leader = state.lastPlay.who
      state.leaderPlayer = leader
      state.firstPlayer = leader
      state.currentPlayer = leader
      state.lastPlay = null
      state.tableCards = []
      state.passCount = 0
      emit('trickEnd', { leader, handsRemaining: state.hands.map((h, i) => i in state.finishedOrder ? 0 : h.length) })
      // 联机模式:不调 scheduleAI(4 个真人,不需要 AI 接管)
    } else {
      nextTurn(false)
    }
  }

  function nextTurn(isFirstPlayer) {
    let next = (state.currentPlayer + 1) % 4
    // 跳过已出完牌的
    // v3.x P0-6 修复:加 safety 计数器,极端竞态下 4 人都进 finishedOrder
    // 时(理论上不该发生,playerPlay 处已 ≥3 直接 finishRound,但兜底)
    // 不能死循环
    let safety = 0
    while (state.finishedOrder.includes(next)) {
      next = (next + 1) % 4
      if (++safety >= 4) {
        // 所有 4 人都已 finished — 直接结束本局兜底
        finishRound()
        return
      }
    }
    state.currentPlayer = next
    const isTeammateLast = state.lastPlay && ((state.lastPlay.who + 2) % 4 === state.currentPlayer)
    emit('turn', state.currentPlayer, state.lastPlay, { isTeammateLast: !!isTeammateLast })
    // ★ v3.8 P1:联机模式(aiPlayers 空)跳过 AI 接管
    if (aiPlayers.length > 0) scheduleAI()
  }

  // ============ AI 自动出牌 ============
  function scheduleAI() {
    if (state.phase !== 'playing') return
    const seat = state.currentPlayer
    if (!aiPlayers.includes(seat)) return
    // v3.x P2-21 修复:之前 setTimeout ID 没存,状态变化时无法取消,可能触发过期回调
    if (state._aiTimer) clearTimeout(state._aiTimer)
    state._aiTimer = setTimeout(() => {
      state._aiTimer = null
      if (state.currentPlayer !== seat) return
      const hand = state.hands[seat]
      const ctx = {
        isTeammateLast: state.lastPlay && ((state.lastPlay.who + 2) % 4 === seat),
        mySeatIndex: seat,
        teammateSeatIndex: (seat + 2) % 4,
      }
      const r = AI.decide(hand, state.lastPlay, state.levelRank, ctx)
      if (r.type === 'play') {
        // ★ v3.8 P1:联机模式下 AI 出的牌要广播给其他 tab
        if (aiBroadcast) aiBroadcast(seat, r.cards, 'PLAY')
        playerPlay(seat, r.cards)
      } else {
        playerPass(seat)
      }
    }, 500 + Math.random() * 500)
  }

  // ============ 结算一局 ============
  function finishRound() {
    applyRoundEnd()
  }

  /**
   * ★ v3.8 P1:无校验结算,4-tab 联机同步用
   * host 收到自己 finishRound 后广播,joiner 收到 ROUND_END 直接调这个
   * 已经做过逻辑的幂等性保护:任何状态都可重入(roundEnd 会 push 到 finishedOrder)
   */
  function applyRoundEnd() {
    state.phase = 'finished'
    // 末位补齐
    if (state.finishedOrder.length === 3) {
      const last = [0, 1, 2, 3].find(s => !state.finishedOrder.includes(s))
      if (last != null) state.finishedOrder.push(last)
    }
    const ranks = state.finishedOrder.slice()
    const teams = [[0, 2], [1, 3]]
    const levelUp = E.calcLevelUp(ranks, teams)
    const tribute = E.tributeInfo(ranks, teams)
    state.levelUp = levelUp
    state.tribute = tribute
    state.levelRank = E.getLevelRank(state.levelRank, levelUp)
    state.round++
    emit('roundEnd', { ranks, levelUp, tribute, newLevelRank: state.levelRank })
  }

  // ============ 下一局(发新牌) ============
  function nextRound() {
    deal()
  }

  return {
    on, off, emit,
    getState,
    deal, nextRound,
    playerPlay, playerPass,
    // ★ v3.8 P1:无校验同步接口,4-tab 联机用
    applyPlay, applyPass, applyRoundEnd,
    // ★ v3.8 P1:运行时把某 seat 加入 AI 列表(断线接管)
    addAIPlayer(seat) {
      if (!aiPlayers.includes(seat)) aiPlayers.push(seat)
    },
    removeAIPlayer(seat) {
      const i = aiPlayers.indexOf(seat)
      if (i >= 0) aiPlayers.splice(i, 1)
    },
    getAIPlayers() { return aiPlayers.slice() },
    // ★ v3.8 P1:AI 出的牌要广播(GameView 注入回调)
    setAIBroadcast(fn) { aiBroadcast = fn },
    /**
     * ★ v2.1 P3:host 退场 → 座位重映射 + 状态转移
     *
     * 触发:旧 host 走人(关 App / 断网 / 自己踢自己),某个 joiner 按"队友优先"
     * 升级为新 host,接管牌局控制权。
     *
     * 重映射规则:
     *   - hands[] 数组索引按"逻辑 seat 0/1/2/3"重新分配
     *   - 新 host (oldSeat=newHostSeat) 的手牌 → 移动到 hands[0],他原 seat (newHostSeat) 的位置置空
     *   - 旧 host (oldHostSeat=0) 的手牌 → 标记"弃牌"(加入 finishedOrder 尾,作最末位)
     *   - 其他 joiner 的 hands[oldSeat] 保持不变(他们的 seat 不动)
     *   - finishedOrder / levelRank / round / phase 保留(但旧 host 加到 finishedOrder 末位)
     *
     * 副作用:
     *   - state.currentPlayer 调整:如果之前是旧 host 回合 → 切到新 host 回合(0 = new host)
     *   - state.firstPlayer / leaderPlayer 调整:同上
     *   - emit('host:migrated', { oldHostSeat, newHostSeat }) 让 UI 弹提示
     *
     * @param {number} oldHostSeat — 旧 host seat (这里恒为 0)
     * @param {number} newHostSeat — 升级者原 seat(1/2/3,队友优先=2)
     * @returns {boolean} true=成功,false=参数不合法
     */
    migrateHost(oldHostSeat, newHostSeat) {
      if (oldHostSeat !== 0) return false
      if (![1, 2, 3].includes(newHostSeat)) return false
      if (oldHostSeat === newHostSeat) return false
      // v3.x P2-23 修复:新 host 不能是已出完牌的玩家(他手牌已空,迁移过去会破坏回合计算)
      if (state.finishedOrder.includes(newHostSeat)) return false
      // 防御:手牌不存在时不做(空 hands)
      if (!state.hands[oldHostSeat] || !state.hands[newHostSeat]) return false

      // 1) 旧 host 走人 → 他的 27 张牌"弃牌" → 加入 finishedOrder 末位(算最末)
      //    这样 finishedOrder 长度可推进(让其他玩家计算"末位补齐"逻辑)
      const oldHostHand = state.hands[oldHostSeat]
      // 把旧 host 算作最末位(若他还不在 finishedOrder 里)
      if (!state.finishedOrder.includes(oldHostSeat)) {
        state.finishedOrder.push(oldHostSeat)
      }
      // 旧 host 的 27 张牌作废(清空)
      state.hands[oldHostSeat] = []

      // 2) 新 host 的手牌从 hands[newHostSeat] 移到 hands[0]
      //    hands[newHostSeat] 留空(他现在是 seat 0 了)
      const newHostHand = state.hands[newHostSeat].slice()
      state.hands[0] = newHostHand
      state.hands[newHostSeat] = []

      // 3) 调整 currentPlayer:如果当时是旧 host (0) 或新 host 原 seat (newHostSeat) 回合
      //    → 切到新 host 回合(逻辑 seat 0)
      //    其他 seat (1/2/3 中除 newHostSeat 外) 保持
      if (state.currentPlayer === oldHostSeat || state.currentPlayer === newHostSeat) {
        state.currentPlayer = 0  // 新 host 现在是 seat 0
      }
      if (state.firstPlayer === oldHostSeat || state.firstPlayer === newHostSeat) {
        state.firstPlayer = 0
      }
      if (state.leaderPlayer === oldHostSeat || state.leaderPlayer === newHostSeat) {
        state.leaderPlayer = 0
      }

      // 4) lastPlay.who 也要修正(如果在迁移前是这两个 seat 出的牌)
      if (state.lastPlay && (state.lastPlay.who === oldHostSeat || state.lastPlay.who === newHostSeat)) {
        state.lastPlay = { ...state.lastPlay, who: 0 }
      }

      // 5) trickHistory 也要修正(留 trace,但 seat 索引改 0)
      state.trickHistory = state.trickHistory.map(h => {
        if (h.seat === oldHostSeat || h.seat === newHostSeat) {
          return { ...h, seat: 0 }
        }
        return h
      })

      // 6) 旧 host 不再是 AI(他走人了),如果他是 AI(被 aiPlayers 含)就移除
      if (aiPlayers.includes(oldHostSeat)) {
        const i = aiPlayers.indexOf(oldHostSeat)
        if (i >= 0) aiPlayers.splice(i, 1)
      }
      // 新 host 不应该再被 AI 接管(他现在是真人 host)
      if (aiPlayers.includes(newHostSeat)) {
        const i = aiPlayers.indexOf(newHostSeat)
        if (i >= 0) aiPlayers.splice(i, 1)
      }

      emit('host:migrated', { oldHostSeat, newHostSeat, finishedOrder: state.finishedOrder.slice() })
      return true
    },

    // ★ v3.8 P1:断线重连用,joiner 收到 host 的 STATE_SNAPSHOT 后灌回 state
    // _ 开头为内部 API,使用方:GameView 的 onP2PStateSnapshot
    // v3.x P2-26 修复:加关键字段 sanity check,畸形数据(99 / 空 hands)不再裸赋值
    _applySnapshot(snap) {
      if (!snap) return
      const isValidSeat = (v) => typeof v === 'number' && v >= 0 && v <= 3
      const validPhase = ['idle', 'dealing', 'playing', 'trick_end', 'finished']
      if (snap.hands) {
        if (!Array.isArray(snap.hands) || snap.hands.length !== 4) return  // 畸形 hands 拒收
        state.hands = snap.hands.map(h => Array.isArray(h) ? h.slice() : [])
      }
      if (snap.tableCards) state.tableCards = snap.tableCards.slice()
      if ('lastPlay' in snap) state.lastPlay = snap.lastPlay
      if (isValidSeat(snap.currentPlayer)) state.currentPlayer = snap.currentPlayer
      if (isValidSeat(snap.firstPlayer)) state.firstPlayer = snap.firstPlayer
      if (isValidSeat(snap.leaderPlayer)) state.leaderPlayer = snap.leaderPlayer
      if (snap.trickHistory) state.trickHistory = snap.trickHistory.slice()
      if (snap.finishedOrder) {
        // finishedOrder 必须是 0..3 的子集
        const ok = Array.isArray(snap.finishedOrder) && snap.finishedOrder.every(s => isValidSeat(s))
        if (ok) state.finishedOrder = snap.finishedOrder.slice()
      }
      if (typeof snap.passCount === 'number') state.passCount = snap.passCount
      if (snap.tribute) state.tribute = snap.tribute
      if (snap.ghost) state.ghost = snap.ghost
      if (typeof snap.levelUp === 'number') state.levelUp = snap.levelUp
      if (typeof snap.levelRank === 'number') state.levelRank = snap.levelRank
      if (typeof snap.round === 'number') state.round = snap.round
      if (snap.phase && validPhase.includes(snap.phase)) state.phase = snap.phase
      // 同步发 turn 事件让 UI 重新渲染
      emit('turn', state.currentPlayer, state.lastPlay, { isTeammateLast: false })
    },
  }
}

export { createGame }
