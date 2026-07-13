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

const isValidSeat = (v) => typeof v === 'number' && v >= 0 && v <= 3

function createGame(opts) {
  const { seats = 4, levelRank = 15, isHost = true, aiPlayers: initialAI = [], seed = null, difficulty = 'medium' } = opts
  // ★ v3.8 P1:aiPlayers 用可变数组(支持运行时加 seat,例如断线 AI 接管)
  let aiPlayers = initialAI.slice()
  // ★ v3.8 P1:AI 出的牌要广播给其他 tab(由 GameView 注入)
  let aiBroadcast = null
  // ★ P1-13:AI timer 是模块级变量,不应出现在可序列化 state 中
  let aiTimer = null
  // ★ P1-14/P2-07:game 生命周期 destroyed 标记
  let destroyed = false
  // ★ v0.4.9:AI 难度等级 'medium'(默认,原行为) | 'hard'(防守 + 炸弹保留)
  //   存到 state 里随 snapshot 同步,所有端共享
  if (difficulty !== 'medium' && difficulty !== 'hard') {
    throw new Error(`createGame: invalid difficulty "${difficulty}", must be 'medium' or 'hard'`)
  }

  const state = {
    phase: 'idle',           // idle | dealing | playing | trick_end | finished
    round: 1,                // 当前局数
    levelRank,               // 当前级牌 rank
    // ★ v0.4.9:AI 难度等级(随 snapshot 同步)
    difficulty,              // 'medium' | 'hard'
    hands: [[], [], [], []], // 4 个玩家手牌
    tableCards: [],          // 当前桌面已出牌(一轮)
    lastPlay: null,          // 当前桌面牌型 {type, mainRank, length, who, cards}
    currentPlayer: 0,        // 当前出牌的玩家(座位)
    firstPlayer: 0,          // 本轮首家
    leaderPlayer: 0,         // 本局领出者(头游)
    trickHistory: [],        // 历次出牌
    finishedOrder: [],       // 出完牌的顺序 [seat, seat, seat, seat]
    // ★ v3.x P2-30 修复(2):区分"出完牌"和"弃赛"
    //   finishedOrder 严格表示"打完全局已出完手牌"的玩家
    //   abandonedSeats 表示"中途弃赛/被踢"的玩家(本局手牌作废)
    //   之前 migrateHost 把旧 host 加进 finishedOrder,导致新 host(seat 0)也在
    //   finishedOrder 里,playerPlay 校验 line 128-130 拒绝 seat 0 出牌。
    //   修法:migrateHost 改用 abandonedSeats,playerPlay 仍查 finishedOrder
    //   (只拒绝"已出完牌"玩家),"弃赛"玩家不影响新 host 出牌。
    abandonedSeats: [],      // 弃赛/被踢的 seat 列表(中途,不算出完)
    passCount: 0,            // 连续 pass 数
    tribute: null,           // 进贡信息
    ghost: null,             // 逢人配(红桃级牌)
    levelUp: 0,              // 本局升级数
    // ★ v0.4.14 对抗性复查 (V0412-04 / V0412-05):预声明过 A 标志 / 上一局级牌 /
    //   ROUND_END 去重 id 到 state,这样 getSnapshot() 返回的对象里这些字段也存在,
    //   _applySnapshot 用 'in' 检测时能正确判定"快照含字段"。
    //   之前 applyRoundEndFromPayload 才写这些字段(getState 出来未结算时是 undefined),
    //   snapshot 接收端 _applySnapshot 看到的 snap.lastAppliedRoundId === undefined,
    //   'in' 检测 undefined vs 'lastAppliedRoundId' 还是 true 所以会写,逻辑上没爆,
    //   但 getSnapshot 返回的对象字段不全 → 对外契约不清晰。
    isRestartAfterA: false,  // 本局是否"打 A 后重开一局"(host 权威计算)
    previousLevelRank: null, // 上一局级牌(用于过 A 判定;null 表示首局)
    lastAppliedRoundId: null,// ROUND_END 去重 id(同一 roundId 重复应用跳过)
    // v3.x P2-22 修复(G-5):双方独立等级字段(简化实现下两队同升同降,但字段已分)
    //   索引 0 = [0,2] 队,索引 1 = [1,3] 队
    //   **当前简化**:不论赢家,两队 levelRank 始终同步(见 applyRoundEnd 内注释)。
    //   字段分开的目的是给未来差异化升级留 API 空间,避免破坏向后兼容。
    //   未来规则若实现"打 A 不过则只末家降级"之类差异化,可用两字段不同步。
    //   外部读取(UI / 序列化):getLevelRankForTeam(teamIdx) → state.teamLevels[teamIdx]
    //   推荐封装,避免直接读 state.teamLevels[0] / [1] 漏掉一致性维护。
    teamLevels: [levelRank, levelRank],
  }

  const handlers = {}
  function on(event, fn) {
    if (!handlers[event]) handlers[event] = []
    handlers[event].push(fn)
  }
  // v3.x P2-19 修复:off 支持可选 handler 参数 — 不传则删除该事件所有监听器(向后兼容),
  //   传了则只删除该 handler 的引用,避免一个组件卸载破坏其他组件的事件订阅
  function off(event, fn) {
    if (fn === undefined) {
      delete handlers[event]
      return
    }
    const list = handlers[event]
    if (!list) return
    const idx = list.indexOf(fn)
    if (idx >= 0) list.splice(idx, 1)
    if (list.length === 0) delete handlers[event]
  }
  function emit(event, ...args) {
    const list = handlers[event] || []
    for (const fn of list) {
      try { fn(...args) } catch (e) { console.error(e) }
    }
  }

  // ★ P0-02 辅助函数:判断座位是否已 inactive(出完/弃赛)
  function isInactiveSeat(seat) {
    return state.finishedOrder.includes(seat) || state.abandonedSeats.includes(seat)
  }

  // 从 startSeat 向后找下一个活跃座位;找不到返回 null
  function findNextActiveSeat(startSeat) {
    for (let i = 1; i <= 4; i++) {
      const seat = (startSeat + i) % 4
      if (!isInactiveSeat(seat)) return seat
    }
    return null
  }

  // 掼蛋接风规则:领出者已出完时,由其对家接风;对家也 inactive 则顺延下一个活跃玩家
  function findWindSeat(leader) {
    const teammate = (leader + 2) % 4
    if (!isInactiveSeat(teammate)) return teammate
    return findNextActiveSeat(leader)
  }

  function getState() {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(state) } catch (e) { /* fallback:可能含 Vue proxy / 不可 clone 对象 */ }
    }
    return JSON.parse(JSON.stringify(state))
  }

  /**
   * ★ v0.4.14 对抗性审查 (V0412-05 / V0412-07):返回完整 + 深拷贝的 state 快照。
   *
   * 设计动机:
   *   - getState() 直接返回内部 state 引用,任何调用方都能改 hands / tableCards
   *     等核心字段 — V0412-07 报告的"短期不爆但长期维护风险"
   *   - useGameLogic.onPeerLeave 手写 snapshot 字段不完整(缺 difficulty /
   *     round / levelUp / abandonedSeats / isRestartAfterA / previousLevelRank /
   *     lastAppliedRoundId),且数组字段是直接引用不是 clone — V0412-05 报告
   *
   * 修法:
   *   - 新增 getSnapshot() 返回完整 state 的深拷贝(JSON 序列化 / 反序列化)
   *   - 字段口径跟 _applySnapshot 接受的范围一致(每加字段要同时加到这两处)
   *   - getState() 保留兼容现有 UI 计算 / debug 用
   *
   * 注意:
   *   - JSON 深拷贝丢失 undefined / Symbol / Date / 函数等,本 game state 全是
   *     普通数据(数组 / 数字 / 字符串 / null),JSON 安全
   *   - 性能:一次 deal 后 state < 5KB,JSON round-trip ~1ms,host 迁移 / 重连
   *     路径用得起
   *
   * @returns {object} 深拷贝的 state(字段全集)
   */
  function getSnapshot() {
    // ★ P1-13:白名单克隆,只暴露必要字段,避免把内部临时变量/函数带入快照
    const keys = [
      'hands', 'tableCards', 'lastPlay', 'currentPlayer', 'firstPlayer', 'leaderPlayer',
      'trickHistory', 'finishedOrder', 'abandonedSeats', 'passCount', 'tribute', 'ghost',
      'levelUp', 'levelRank', 'teamLevels', 'round', 'phase',
      'isRestartAfterA', 'previousLevelRank', 'lastAppliedRoundId', 'difficulty',
    ]
    const snap = {}
    const clone = (v) => {
      if (typeof structuredClone === 'function') {
        try { return structuredClone(v) } catch (e) { /* fallback */ }
      }
      return JSON.parse(JSON.stringify(v))
    }
    for (const k of keys) snap[k] = clone(state[k])
    snap.schemaVersion = 2
    if ('matchId' in state) snap.matchId = state.matchId
    return snap
  }

  // ============ 发牌 ============
  // ★ v3.8 P1 修复:4-tab 联机用 host 广播的 seed 发同一手牌
  // 不传 seed → 走引擎的随机(单机模式兼容)
  // ★ UX 改进:支持 host 切牌指定首家(firstSeat)
  function deal(forcedSeed, firstSeat) {
    const alive = ensureAlive(); if (alive) return alive
    const useSeed = forcedSeed != null ? forcedSeed : seed
    const result = useSeed == null ? E.deal() : E.deal(useSeed)
    state.hands = result.hands
    state.phase = 'dealing'
    state.tableCards = []
    state.lastPlay = null
    state.finishedOrder = []
    // v3.x P2-30 修复(2):新一局清空 abandonedSeats
    state.abandonedSeats = []
    state.passCount = 0
    state.trickHistory = []
    state.tribute = null
    state.levelUp = 0
    state.ghost = { suit: 1, rank: state.levelRank }  // 红桃级牌
    // 切牌指定首家 > seeded 随机 > 纯随机
    if (isValidSeat(firstSeat)) {
      state.firstPlayer = firstSeat
    } else if (useSeed != null && E.mulberry32) {
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
    const alive = ensureAlive(); if (alive) return alive
    // v3.x P3-11 修复:playerPlay 之前接受 'trick_end' 阶段,但 playerPass 不接受 — 不一致。
    //   严格说,trick_end 是结算间隔阶段,玩家不能再出牌。统一为只接受 'playing'。
    if (state.phase !== 'playing') {
      return { ok: false, error: '对局未开始或已结束(phase=' + state.phase + ')' }
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
    // 验证牌型(含鬼牌具象化)
    const materialized = E.materializeGhosts(cards, state.levelRank, state.lastPlay)
    if (!materialized) return { ok: false, error: '非法牌型或无法压过当前桌面牌' }
    // ★ v3.8 P1:抽离出 applyPlay 让 P2P 同步复用
    applyPlay(seat, cards, hand, materialized.rec)
    return { ok: true }
  }

  /**
   * ★ v3.8 P1:无校验出牌,4-tab 联机同步用
   * 收到 host 广播的 PLAY 后,joiner 直接调这个,不重跑校验(避免 own broadcast 双重处理)
   * 也跳过 scheduleAI(联机 4 人都是真人,没 AI)
   */
function applyPlay(seat, cards, hand, rec) {
    const alive = ensureAlive(); if (alive) return alive
    // P1-02 修复:应用层必须校验阶段 / 当前玩家,不能再无条件应用
    if (state.phase !== 'playing') return { ok: false, error: 'not_playing' }
    if (seat !== state.currentPlayer) return { ok: false, error: 'not_your_turn' }

    // ★ v0.4.13 对抗性审查 (P1-4):防御性 — 重复 applyPlay(WS 重传 / 多次 broadcast)
    //   会让 hand 已空时 splice(-1, 1) 静默删末尾那张牌(silent bug)。
    //   修法:cards 任何一张不在 state.hands[seat] 里 → 直接 return,跳过这次 apply。
    //   防御场景:joiner 端已经 apply 过同一 PLAY,手牌已删,再 apply 时 hand 里查不到 cards。
    const sourceHand = state.hands[seat].slice()
    let allFound = true
    for (const card of cards) {
      const idx = sourceHand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
      if (idx < 0) {
        allFound = false
        break
      }
      sourceHand.splice(idx, 1)
    }
    if (!allFound) {
      // cards 中至少一张不在 hand 里 — 重复 apply 或错误数据,跳过
      return
    }

    // P1-02 修复:不信任外部传入的 rec,必须重新走 materializeGhosts 校验
    const materialized = E.materializeGhosts(cards, state.levelRank, state.lastPlay)
    if (!materialized || !materialized.rec || materialized.rec.type === E.TYPE.INVALID) {
      return { ok: false, error: 'illegal_play' }
    }
    rec = materialized.rec

    // 使用从 state.hands[seat] 移除 cards 后的手牌(忽略外部传入的 hand)
    hand = sourceHand
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
    const alive = ensureAlive(); if (alive) return alive
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
    const alive = ensureAlive(); if (alive) return alive
    // P1-02 修复:应用层过牌也必须校验阶段 / 当前玩家 / 是否有领出
    if (state.phase !== 'playing') return { ok: false, error: 'not_playing' }
    if (seat !== state.currentPlayer) return { ok: false, error: 'not_your_turn' }
    if (!state.lastPlay) return { ok: false, error: 'leader_cannot_pass' }
    state.passCount++
    state.trickHistory.push({ seat, pass: true })
    emit('pass', { seat })

    // ★ P0-02 修复:头游出完后,剩余活跃玩家都 pass 时由对家/下一活跃玩家接风,
    //   不能把回合交回已出完的 leader 导致卡局。
    const activePlayers = 4 - state.finishedOrder.length - state.abandonedSeats.length
    const leader = state.lastPlay.who
    const leaderInactive = isInactiveSeat(leader)
    // leader 已出完/弃赛时,其余所有活跃玩家都要 pass 才算本墩结束
    const requiredPasses = leaderInactive ? activePlayers : activePlayers - 1

    if (state.passCount >= requiredPasses) {
      let nextLeader = leader
      if (leaderInactive) {
        nextLeader = findWindSeat(leader)
        // 极端情况:4 人全部 inactive,直接结束本局
        if (nextLeader == null) {
          finishRound()
          return { ok: true }
        }
      }
      state.leaderPlayer = nextLeader
      state.firstPlayer = nextLeader
      state.currentPlayer = nextLeader
      state.lastPlay = null
      state.tableCards = []
      state.passCount = 0
      // ★ 静态审查 BUG-J 修复:`i in state.finishedOrder` 是判断"数组有 i 索引",
      //   不是"数组包含 i"。finishedOrder 长度 < 4 时 0/1/2/3 都会 in 命中,语义错误。
      //   改用 includes(i) 正确判断"玩家 i 是否已出完牌"。
      emit('trickEnd', {
        leader: nextLeader,
        originalLeader: leader,
        wind: leaderInactive,
        handsRemaining: state.hands.map((h, i) =>
          (state.finishedOrder.includes(i) || state.abandonedSeats.includes(i)) ? 0 : h.length
        ),
      })
      // ★ 静态审查 BUG-B 修复:一墩结束后只 emit('trickEnd') 不 emit('turn'),
      //   useGameLogic 主要通过 'turn' 事件同步 currentPlayer / lastPlay /
      //   tableCards 等 UI 状态,缺 'turn' 会导致 UI 与 game 状态不同步,
      //   若 leader 是 AI 也不会被调度。
      //   联机模式(4 真人)由 P2P 同步处理,这里只在有 AI 的场景发 turn。
      emit('turn', state.currentPlayer, state.lastPlay, {
        isTeammateLast: false,
        trickReset: true,
        wind: leaderInactive,
      })
      if (aiPlayers.length > 0) scheduleAI()
      return { ok: true }
    }

    nextTurn(false)
    return { ok: true }
  }

  function nextTurn(isFirstPlayer) {
    const alive = ensureAlive(); if (alive) return alive
    let next = (state.currentPlayer + 1) % 4
    // 跳过已出完牌 + 弃赛的
    // v3.x P0-6 修复:加 safety 计数器,极端竞态下 4 人都进 finishedOrder
    // 时(理论上不该发生,playerPlay 处已 ≥3 直接 finishRound,但兜底)
    // 不能死循环
    // v3.x P2-30 修复(2):弃赛玩家(abandonedSeats)也要跳过,避免 nextTurn 落到旧 host
    let safety = 0
    while (state.finishedOrder.includes(next) || state.abandonedSeats.includes(next)) {
      next = (next + 1) % 4
      if (++safety >= 4) {
        // 所有 4 人都已 finished / 弃赛 — 直接结束本局兜底
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
    // ★ P1-13:aiTimer 是模块级变量,不在可序列化 state 中
    if (aiTimer) clearTimeout(aiTimer)
    aiTimer = setTimeout(() => {
      aiTimer = null
      if (state.currentPlayer !== seat) return
      const hand = state.hands[seat]
      const ctx = {
        isTeammateLast: state.lastPlay && ((state.lastPlay.who + 2) % 4 === seat),
        mySeatIndex: seat,
        teammateSeatIndex: (seat + 2) % 4,
      }
      // ★ V0410-07 修复:传 state.difficulty 给 AI.decide,自动 AI 也用全局 AI 难度
      //   旧版只 useGameLogic 的提示/帮出路径传 difficulty,guandan-game 自己的
      //   scheduleAI 走默认 medium → AI 对手/接管场景 hard 难度不生效
      const r = AI.decide(hand, state.lastPlay, state.levelRank, ctx, state.difficulty)
      if (r.type === 'play') {
        // ★ 静态审查 BUG-I 修复:先调 playerPlay 本地校验,成功后再 broadcast,
        //   避免状态过期 / 牌型 bug 导致 playerPlay 校验失败但 aiBroadcast 已经
        //   把动作广播给其他端,其他端收到本端并不存在的动作造成状态发散
        const res = playerPlay(seat, r.cards)
        if (res?.ok !== false) {
          // ★ v3.8 P1:联机模式下 AI 出的牌要广播给其他 tab
          if (aiBroadcast) aiBroadcast(seat, r.cards, 'PLAY')
        }
      } else {
        // ★ v0.4.14 对抗性审查 (V0412-03):AI pass 也必须广播给 joiner,
        //   否则 joiner 端 currentPlayer 不推进,状态分叉。修法跟 PLAY 分支对称 —
        //   先 playerPass 本地校验,成功后再 aiBroadcast('PASS')。
        const res = playerPass(seat)
        if (res?.ok !== false) {
          if (aiBroadcast) aiBroadcast(seat, null, 'PASS')
        }
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
   *
   * 静态审查 BUG-A 修复:加幂等性保护 — 如果本轮已结算过(state.phase === 'finished'
   *   且 finishedOrder 已满 4 人),直接 return,不再 round++ / levelRank / emit('roundEnd')
   *   防御:虽然 useGameLogic 已有 suppressRoundEndBroadcast 标志,但作为底层 API
   *   仍需自带幂等性,避免上层漏调标志或未来新加的调用方重入
   *
   * ★ GD-RC-003 修复:加 applyRoundEndFromPayload(p) 权威结算接口。
   *   旧版 applyRoundEnd() 无参,会按本地 state.finishedOrder 重新计算 levelUp /
   *   newLevelRank,如果 joiner 端本地状态延迟 / 丢消息导致和 host 不一致,
   *   会用本地错误数据覆盖 UI ref(只有 UI ref 跟 payload 同步,内部 game.state
   *   仍然错误),后续继续用错误 game.state 导致状态分叉。
   *   修法:加权威结算接口,接 host 发的完整 payload(ranks/levelUp/newLevelRank
   *   /tribute/teamLevels/roundId),不去读本地 state 重新算。同时 roundId
   *   去重防止重复应用(同一 ROUND_END 被多次重传)。
   */
  function applyRoundEnd() {
    const alive = ensureAlive(); if (alive) return alive
    // 幂等性:已结算完成(phase=finished) → 直接返回
    //   防御:join 端重复收到 ROUND_END / 上层漏调标志 / 未来新调用方重入
    if (state.phase === 'finished') {
      return
    }
    state.phase = 'finished'
    // 末位补齐 — 排除已弃赛玩家(他们手牌已废,不是"出完牌"末位)
    if (state.finishedOrder.length === 3) {
      const last = [0, 1, 2, 3].find(s =>
        !state.finishedOrder.includes(s) && !state.abandonedSeats.includes(s)
      )
      if (last != null) state.finishedOrder.push(last)
    }
    const ranks = state.finishedOrder.slice()
    const teams = [[0, 2], [1, 3]]
    const levelUp = E.calcLevelUp(ranks, teams)
    // v3.x P2-27 修复(E-6):tributeInfo 接受 levelUp 参数,严格"双下不贡"规则下
    //   levelUp=0(实际 2v2 不可达)会返回 needTribute:false。让字段有真正判断意义。
    const tribute = E.tributeInfo(ranks, teams, levelUp, state.levelRank)
    // ★ v0.4.9:记录升级前的 levelRank,用于判定"过 A"重开
    //   严格规则:打 A(previousLevelRank=14)且本轮胜方继续升级(levelUp>0)→ 本轮过 A
    //   - previousLevelRank=14 + levelUp=0 → 本轮没升级,继续打 A
    //   - previousLevelRank=15(2) 升到 14(A) → 只是下一局打 A,不算过 A
    const previousLevelRank = state.levelRank
    state.previousLevelRank = previousLevelRank
    // P1-01 修复:只有胜方队伍升级,败方队伍等级保持不变
    // 防御:finishedOrder 不足 4 人时无法判定胜方,保持原等级不变
    const winnerTeam = ranks[0] != null ? ranks[0] % 2 : 0
    const winnerTeamOldLevel = ranks[0] != null ? state.teamLevels[winnerTeam] : state.levelRank
    const newLevelRank = E.getLevelRank(winnerTeamOldLevel, levelUp)
    const nextTeamLevels = state.teamLevels.slice()
    nextTeamLevels[winnerTeam] = newLevelRank
    state.teamLevels = nextTeamLevels
    state.levelRank = newLevelRank
    const isRestartAfterA = winnerTeamOldLevel === 14 && levelUp > 0
    state.levelUp = levelUp
    state.tribute = tribute
    // ★ v0.4.9:过 A 标志存到 state,getState() 可读 + 后续 restartMatch 消费
    state.isRestartAfterA = isRestartAfterA
    state.round++
    emit('roundEnd', {
      ranks, levelUp, tribute,
      previousLevelRank,
      newLevelRank: state.levelRank,
      teamLevels: state.teamLevels.slice(),
      isRestartAfterA,  // ★ v0.4.9:过 A 标志
    })
  }

  // ============ 下一局(发新牌) ============
  function nextRound() {
    const alive = ensureAlive(); if (alive) return alive
    // ★ 过 A 后下一局:清空上一局遗留标志,避免 UI 继续显示"重开一局"
    state.isRestartAfterA = false
    state.previousLevelRank = null
    state.levelUp = 0
    deal()
  }

  /**
   * ★ v0.4.13 对抗性审查修复 (P0-3):销毁 game 实例,清 _aiTimer + handlers
   *
   * 触发场景:onP2PDeal 收到 host 发的 DEAL 重新开局时,先 destroy 旧 game 实例,
   *   避免旧 scheduleAI 的 setTimeout callback 在旧 game 已 GC 后仍被触发。
   *
   * 调用方:
   *   - useGameLogic.js onP2PDeal 收到新 seed 时
   *   - 测试 teardown 强制清理
   *
   * 不变量:
   *   - destroy() 后 _aiTimer 被 clear,handlers 清空,aiPlayers 清空
   *   - destroy() 后再调任何方法(pay / pass / deal)是 noop,不会 crash
   */
  function ensureAlive() {
    if (destroyed) return { ok: false, error: 'game_destroyed' }
  }

  function destroy() {
    // ★ P1-13:aiTimer 是模块级变量
    if (aiTimer) {
      try { clearTimeout(aiTimer) } catch (e) {}
      aiTimer = null
    }
    // 清 handlers Map(防止旧 listener 在 emit 时被调用,虽然 destroy 后不再 emit)
    for (const k of Object.keys(handlers)) delete handlers[k]
    // 清 aiPlayers(避免旧 AI 配置残留)
    aiPlayers = []
    // 标记已 destroyed
    destroyed = true
    state._destroyed = true
  }

  // ★ v0.4.9:重开一局(过 A 后) — 清空本轮状态,levelRank 回到 15(打 2)
  //   参考 docs/restart-after-a-flow.md §"重开一局动作"
  //   - 清空 finishedOrder / tableCards / lastPlay / trickHistory / passCount
  //   - 清空 abandonedSeats(新局从干净状态开始)
  //   - 重置 levelRank / teamLevels 到指定值(默认 15)
  //   - 重置 round 到 1
  //   - 重新洗牌发牌(deal)
  //   - emit('matchRestart') 让 UI 弹"重开一局"提示
  //   保留:座位分配、玩家信息(room 范围)
  function restartMatch({ levelRank: newLevelRank = 15, seed: forcedSeed } = {}) {
    const alive = ensureAlive(); if (alive) return alive
    state.levelRank = newLevelRank
    state.teamLevels = [newLevelRank, newLevelRank]
    state.round = 1
    state.hands = [[], [], [], []]
    state.tableCards = []
    state.lastPlay = null
    state.currentPlayer = 0
    state.firstPlayer = 0
    state.leaderPlayer = 0
    state.trickHistory = []
    state.finishedOrder = []
    state.abandonedSeats = []
    state.passCount = 0
    state.tribute = null
    state.ghost = null
    state.levelUp = 0
    state.phase = 'dealing'  // 立即置为 dealing,deal() 后会变 playing
    state.lastAppliedRoundId = null
    // ★ V049-02 修复:重开一局时清空过 A 标志
    state.isRestartAfterA = false
    emit('matchRestart', { levelRank: newLevelRank })
    // ★ V049-03 修复:重开时支持 host 传入新 seed(无 seed 走 createGame 时闭包的 seed)
    //   传入 seed → deal(forcedSeed) 会强制用这个 seed,host/joiner 同 seed 保证牌局一致
    if (typeof forcedSeed === 'number' && Number.isFinite(forcedSeed)) {
      deal(forcedSeed)
    } else {
      deal()
    }
  }

  return {
    on, off, emit,
    getState,
    // ★ 测试/诊断用:返回内部 state 的可变引用(仅测试使用,生产代码不要写)
    _state: state,
    // ★ v0.4.14 对抗性审查 (V0412-05 / V0412-07):完整 + 深拷贝的 state 快照
    //   用于 host 迁移 / 重连 / 网络同步。getState() 仍保留兼容 UI 计算 / debug。
    getSnapshot,
    deal, nextRound,
    restartMatch,  // ★ v0.4.9:过 A 后重开
    // ★ v0.4.13 (P0-3):销毁旧 game 实例(清 timer / handlers / aiPlayers)
    destroy,
    playerPlay, playerPass,
    // ★ v3.8 P1:无校验同步接口,4-tab 联机用
    applyPlay, applyPass, applyRoundEnd,
    // ★ 静态审查 v0.4.5 N-3 闭环:加 applySnapshot 别名(去掉下划线,跟报告建议一致),
    //   原 _applySnapshot 保留(向后兼容旧调用)。语义:接 joiner 端 snapshot 后灌回 state。
    applySnapshot(snap) {
      const alive = ensureAlive(); if (alive) return alive
      return this._applySnapshot(snap)
    },
    // ★ GD-RC-003:权威结算 — 接 host 发的完整 payload,不去读本地 state 重新算
    // ★ P0-07 修复:先完整校验 payload,校验通过后再原子提交并记录去重 ID,
    //   防止畸形 ROUND_END 先占用 lastAppliedRoundId 导致后续正确结算被跳过。
    applyRoundEndFromPayload(p) {
      const alive = ensureAlive(); if (alive) return alive
      if (!p || typeof p !== 'object') return { ok: false, error: 'invalid_payload' }
      const rid = p.roundId

      // 1) 完整校验 payload(校验阶段不动 state)
      if (!Array.isArray(p.ranks) || p.ranks.length !== 4) {
        return { ok: false, error: 'invalid_ranks' }
      }
      const ranksSet = new Set(p.ranks)
      if (ranksSet.size !== 4 || ![...ranksSet].every(s => s >= 0 && s <= 3)) {
        return { ok: false, error: 'invalid_ranks' }
      }
      if (typeof p.levelUp !== 'number') return { ok: false, error: 'invalid_levelUp' }
      if (typeof p.newLevelRank !== 'number') return { ok: false, error: 'invalid_newLevelRank' }
      if ('round' in p && typeof p.round !== 'number') return { ok: false, error: 'invalid_round' }
      if (Array.isArray(p.teamLevels) && (p.teamLevels.length !== 2 || !p.teamLevels.every(t => typeof t === 'number'))) {
        return { ok: false, error: 'invalid_teamLevels' }
      }

      // 2) 去重检查(在校验之后,避免畸形包污染去重 ID)
      if (rid != null && state.lastAppliedRoundId === rid) {
        return { ok: true, duplicate: true }
      }

      // 3) 原子提交
      state.finishedOrder = p.ranks.slice()
      state.levelUp = p.levelUp
      state.levelRank = p.newLevelRank
      if ('tribute' in p) state.tribute = p.tribute
      if (Array.isArray(p.teamLevels)) state.teamLevels = p.teamLevels.slice()
      if (typeof p.round === 'number') state.round = p.round
      state.phase = 'finished'

      const isRestart = typeof p.isRestartAfterA === 'boolean'
        ? p.isRestartAfterA
        : (typeof p.previousLevelRank === 'number' && typeof p.levelUp === 'number'
            && p.previousLevelRank === 14 && p.levelUp > 0)
      state.isRestartAfterA = isRestart
      state.previousLevelRank = (typeof p.previousLevelRank === 'number') ? p.previousLevelRank : null

      // 4) 提交成功后再记录去重 ID
      if (rid != null) state.lastAppliedRoundId = rid

      emit('roundEnd', {
        ranks: state.finishedOrder.slice(),
        levelUp: state.levelUp,
        tribute: state.tribute,
        previousLevelRank: state.previousLevelRank,
        newLevelRank: state.levelRank,
        teamLevels: state.teamLevels.slice(),
        roundId: rid,
        isRestartAfterA: isRestart,
      })
      return { ok: true }
    },
    // ★ v3.8 P1:运行时把某 seat 加入 AI 列表(断线接管)
    addAIPlayer(seat) {
      if (!aiPlayers.includes(seat)) aiPlayers.push(seat)
    },
    removeAIPlayer(seat) {
      const i = aiPlayers.indexOf(seat)
      if (i >= 0) aiPlayers.splice(i, 1)
    },
    getAIPlayers() { return aiPlayers.slice() },
    // v0.4.8 N-2:AI 补位辅助 — 扫 peers Map,把不在 peers 的空 seat 自动加 aiPlayers
    //   返回:新加入 aiPlayers 的 seat 列表(空数组 = 没人需要补)
    //   参数:
    //     - hasPeer(seat):纯函数,外部传 "this seat 是否有真人"(用 peers.has 即可)
    //     - hostSeat:房主自己的 seat,跳过
    //   不修改 state.phase / hands / currentPlayer,纯 aiPlayers 列表操作
    //   hasPeer 不是 function 时:视为所有人都不是真人,全补 AI
    //     (生产中 hasPeer 一定是 (seat) => peers.has(seat) 函数,但单测 / mock 可能 undefined)
    fillEmptySeatsWithAI(hasPeer, hostSeat = 0) {
      const added = []
      for (let seat = 0; seat < 4; seat++) {
        if (seat === hostSeat) continue  // host 自己不是 AI
        if (typeof hasPeer === 'function' && hasPeer(seat)) continue  // 真人已占
        if (!aiPlayers.includes(seat)) {
          aiPlayers.push(seat)
          added.push(seat)
        }
      }
      return added
    },
    // ★ v3.8 P1:AI 出的牌要广播(GameView 注入回调)
    setAIBroadcast(fn) { aiBroadcast = fn },
    /**
     * ★ Phase 1:host 退场 → 座位稳定迁移
     *
     * 触发:旧 host 走人(关 App / 断网 / 自己踢自己),某个 joiner 按"队友优先"
     * 升级为新 host,接管牌局控制权。
     *
     * 座位稳定规则:
     *   - 每个玩家的逻辑 seat 0/1/2/3 保持不变
     *   - 旧 host 的 seat 标记 abandoned,手牌清空
     *   - 新 host 的手牌留在 hands[newHostSeat],不移动到 hands[0]
     *   - currentPlayer / firstPlayer / leaderPlayer / lastPlay.who 等指针
     *     从 oldHostSeat 重定向到 newHostSeat
     *   - trickHistory 中旧 host 出的牌标记 _originalSeat,seat 改为 newHostSeat
     *
     * @param {number} oldHostSeat — 旧 host 逻辑 seat(0/1/2/3)
     * @param {number} newHostSeat — 升级者逻辑 seat(0/1/2/3)
     * @returns {boolean} true=成功,false=参数不合法
     */
    migrateHost(oldHostSeat, newHostSeat) {
      const alive = ensureAlive(); if (alive) return alive
      if (!isValidSeat(oldHostSeat) || !isValidSeat(newHostSeat)) return false
      if (oldHostSeat === newHostSeat) return false
      if (state.finishedOrder.includes(newHostSeat)) return false
      if (!state.hands[oldHostSeat] || !state.hands[newHostSeat]) return false

      // 1) 旧 host 走人 → 座位保留,由 AI 接管,不标记 abandoned,不清空手牌
      //   网络 host 身份与游戏座位解耦:旧 host 只是控制器离线,其游戏座位继续参与,
      //   由 AI 替它出牌,确保最终 finishedOrder 仍能有 4 人排名。
      if (!state.finishedOrder.includes(oldHostSeat) && !aiPlayers.includes(oldHostSeat)) {
        aiPlayers.push(oldHostSeat)
      }

      // 2) 新 host 手牌保持在原 seat,不移动;新 host 控制器是人类,不应在 aiPlayers 中
      const newHostAIIdx = aiPlayers.indexOf(newHostSeat)
      if (newHostAIIdx >= 0) aiPlayers.splice(newHostAIIdx, 1)

      // 3) 游戏座位保持不变,不重定向 currentPlayer / firstPlayer / leaderPlayer / lastPlay.who / trickHistory
      //   这些指针代表的是游戏座位,不是网络 host 身份。

      // 4) 旧 host 不再交给 AI 接管的旧逻辑已删除,现在明确由 AI 接管旧 host 座位。

      emit('host:migrated', { oldHostSeat, newHostSeat,
        finishedOrder: state.finishedOrder.slice(),
        abandonedSeats: state.abandonedSeats.slice()
      })
      // ★ v0.4.13 对抗性审查 (P1-1):migrateHost 后必须 emit 'turn',
      //   让 useGameLogic.on('turn') 监听器刷新 currentPlayer / lastPlay / 计时器 /
      //   选中态。当前 useGameLogic.onHostMigrated 走 refreshUiFromGameState() 兜底,
      //   但 game 层 emit 是契约正确性 — 任何外部直接调 game.migrateHost() 的人
      //   不应该需要知道要调 refreshUiFromGameState。
      emit('turn', state.currentPlayer, state.lastPlay, {
        isTeammateLast: state.lastPlay && ((state.lastPlay.who + 2) % 4 === state.currentPlayer),
        postMigration: true,
      })
      return true
    },

    // ★ v3.8 P1:断线重连用,joiner 收到 host 的 STATE_SNAPSHOT 后灌回 state
    // _ 开头为内部 API,使用方:GameView 的 onP2PStateSnapshot
    // v3.x P2-26 修复:加关键字段 sanity check,畸形数据(99 / 空 hands)不再裸赋值
    // ★ P0-06 修复:snapshot 必须先完整校验并生成临时对象,最后一次性原子提交,
    //   任何字段非法都不能留下"应用一半"的损坏状态。
    _applySnapshot(snap) {
      if (!snap || typeof snap !== 'object') return
      const isValidSeat = (v) => typeof v === 'number' && v >= 0 && v <= 3
      const validPhase = ['idle', 'dealing', 'playing', 'trick_end', 'finished']

      // 先把所有要应用的字段校验并克隆到 next,最后一次性 Object.assign(state, next)
      const next = {}

      if ('hands' in snap) {
        if (!Array.isArray(snap.hands) || snap.hands.length !== 4) return
        next.hands = snap.hands.map(h => Array.isArray(h) ? h.slice() : [])
      }
      if ('tableCards' in snap) {
        if (!Array.isArray(snap.tableCards)) return
        next.tableCards = snap.tableCards.slice()
      }
      if ('lastPlay' in snap) next.lastPlay = snap.lastPlay

      if ('currentPlayer' in snap) {
        if (!isValidSeat(snap.currentPlayer)) return
        next.currentPlayer = snap.currentPlayer
      }
      if ('firstPlayer' in snap) {
        if (!isValidSeat(snap.firstPlayer)) return
        next.firstPlayer = snap.firstPlayer
      }
      if ('leaderPlayer' in snap) {
        if (!isValidSeat(snap.leaderPlayer)) return
        next.leaderPlayer = snap.leaderPlayer
      }
      if ('trickHistory' in snap) {
        if (!Array.isArray(snap.trickHistory)) return
        next.trickHistory = snap.trickHistory.slice()
      }
      if ('difficulty' in snap) {
        if (!['easy', 'medium', 'hard'].includes(snap.difficulty)) return
        next.difficulty = snap.difficulty
      }
      if ('finishedOrder' in snap) {
        if (!Array.isArray(snap.finishedOrder) ||
            !snap.finishedOrder.every(s => isValidSeat(s))) return
        next.finishedOrder = snap.finishedOrder.slice()
      }
      if ('abandonedSeats' in snap) {
        if (!Array.isArray(snap.abandonedSeats) ||
            !snap.abandonedSeats.every(s => isValidSeat(s))) return
        next.abandonedSeats = snap.abandonedSeats.slice()
      }

      // 计算应用后的 finished/abandoned,检查二者不重叠。
      const finalFinished = next.finishedOrder ?? state.finishedOrder
      const finalAbandoned = next.abandonedSeats ?? state.abandonedSeats
      if (finalFinished.some(s => finalAbandoned.includes(s))) return
      // ★ P0-03 修复:phase=finished 的合法快照允许 currentPlayer 在 finishedOrder 中
      //   (结算态没有"当前出牌者",seat 只作为占位)。非 finished 态仍拒绝 inactive currentPlayer。
      //   注意:phase 字段的正式校验在下方,这里先从 snap 读取最终 phase。
      const finalPhase = ('phase' in snap) ? snap.phase : state.phase
      const finalCurrentPlayer = ('currentPlayer' in next) ? next.currentPlayer : state.currentPlayer
      if (finalPhase !== 'finished' &&
          (finalFinished.includes(finalCurrentPlayer) || finalAbandoned.includes(finalCurrentPlayer))) return

      if ('passCount' in snap) {
        if (typeof snap.passCount !== 'number' || snap.passCount < 0 || snap.passCount > 3) return
        next.passCount = snap.passCount
      }
      if ('round' in snap) {
        if (typeof snap.round !== 'number' || snap.round < 1) return
        next.round = snap.round
      }
      if ('phase' in snap) {
        if (!validPhase.includes(snap.phase)) return
        next.phase = snap.phase
      }
      if ('levelUp' in snap) {
        if (typeof snap.levelUp !== 'number') return
        next.levelUp = snap.levelUp
      }
      if ('levelRank' in snap) {
        if (typeof snap.levelRank !== 'number') return
        next.levelRank = snap.levelRank
      }
      if ('teamLevels' in snap) {
        if (!Array.isArray(snap.teamLevels) || snap.teamLevels.length !== 2 ||
            !snap.teamLevels.every(t => typeof t === 'number')) return
        next.teamLevels = snap.teamLevels.slice()
      }
      if ('tribute' in snap) next.tribute = snap.tribute
      if ('ghost' in snap) next.ghost = snap.ghost
      if ('isRestartAfterA' in snap) {
        if (typeof snap.isRestartAfterA !== 'boolean') return
        next.isRestartAfterA = snap.isRestartAfterA
      }
      if ('previousLevelRank' in snap) {
        if (snap.previousLevelRank !== null && typeof snap.previousLevelRank !== 'number') return
        next.previousLevelRank = snap.previousLevelRank
      }
      if ('lastAppliedRoundId' in snap && snap.lastAppliedRoundId !== undefined) {
        next.lastAppliedRoundId = snap.lastAppliedRoundId
      }

      // 原子提交:所有字段一次性写回 state
      Object.assign(state, next)
      emit('turn', state.currentPlayer, state.lastPlay, { isTeammateLast: false })
    },
  }
}

export { createGame }
