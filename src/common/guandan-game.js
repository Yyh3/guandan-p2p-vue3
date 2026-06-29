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
  const { seats = 4, levelRank = 15, isHost = true, aiPlayers: initialAI = [], seed = null, difficulty = 'medium' } = opts
  // ★ v3.8 P1:aiPlayers 用可变数组(支持运行时加 seat,例如断线 AI 接管)
  let aiPlayers = initialAI.slice()
  // ★ v3.8 P1:AI 出的牌要广播给其他 tab(由 GameView 注入)
  let aiBroadcast = null
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

  function getState() { return state }

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
    return JSON.parse(JSON.stringify(state))
  }

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
    // v3.x P2-30 修复(2):新一局清空 abandonedSeats
    state.abandonedSeats = []
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
    // ★ v0.4.13 对抗性审查 (P1-4):防御性 — 重复 applyPlay(WS 重传 / 多次 broadcast)
    //   会让 hand 已空时 splice(-1, 1) 静默删末尾那张牌(silent bug)。
    //   修法:cards 任何一张不在 hand 里 → 直接 return,跳过这次 apply。
    //   防御场景:joiner 端已经 apply 过同一 PLAY,手牌已删,再 apply 时 hand 里查不到 cards。
    if (!hand) {
      // 兼容性调用:外部只传 seat+cards,从 state 取手牌
      hand = state.hands[seat].slice()
      let allFound = true
      for (const card of cards) {
        const idx = hand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
        if (idx < 0) {
          allFound = false
          break
        }
        hand.splice(idx, 1)
      }
      if (!allFound) {
        // cards 中至少一张不在 hand 里 — 重复 apply 或错误数据,跳过
        return
      }
    }
    if (!rec) rec = E.recognize(cards)
    // 注:applyPlay 是 host 广播同步的内部 API,host 已校验 seat 不应再校验,
    //   否则 P0-6 safety 兜底测试无法构造"4 全 finished"场景
    //   finishedOrder 检查只在 playerPlay(用户 API)做
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
      // ★ 静态审查 BUG-J 修复:`i in state.finishedOrder` 是判断"数组有 i 索引",
      //   不是"数组包含 i"。finishedOrder 长度 < 4 时 0/1/2/3 都会 in 命中,语义错误。
      //   改用 includes(i) 正确判断"玩家 i 是否已出完牌"。
      emit('trickEnd', {
        leader,
        handsRemaining: state.hands.map((h, i) =>
          (state.finishedOrder.includes(i) || state.abandonedSeats.includes(i)) ? 0 : h.length
        ),
      })
      // ★ 静态审查 BUG-B 修复:一墩结束后只 emit('trickEnd') 不 emit('turn'),
      //   useGameLogic 主要通过 'turn' 事件同步 currentPlayer / lastPlay /
      //   tableCards 等 UI 状态,缺 'turn' 会导致 UI 与 game 状态不同步,
      //   leader 不会重新领出,若 leader 是 AI 也不会被调度。
      //   联机模式(4 真人)由 P2P 同步处理,这里只在有 AI 的场景发 turn。
      emit('turn', state.currentPlayer, state.lastPlay, {
        isTeammateLast: false,
        trickReset: true,
      })
      if (aiPlayers.length > 0) scheduleAI()
    } else {
      nextTurn(false)
    }
  }

  function nextTurn(isFirstPlayer) {
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
    const tribute = E.tributeInfo(ranks, teams, levelUp)
    // ★ v0.4.9:记录升级前的 levelRank,用于判定"过 A"重开
    //   严格规则:打 A(previousLevelRank=14)且本轮胜方继续升级(levelUp>0)→ 本轮过 A
    //   - previousLevelRank=14 + levelUp=0 → 本轮没升级,继续打 A
    //   - previousLevelRank=15(2) 升到 14(A) → 只是下一局打 A,不算过 A
    const previousLevelRank = state.levelRank
    const isRestartAfterA = previousLevelRank === 14 && levelUp > 0
    state.levelUp = levelUp
    state.tribute = tribute
    // v3.x P2-22 修复(G-5):升级时更新双方 teamLevels(简化:双方同步)
    //   当前简化策略:不论赢家是哪个队,两队的 levelRank 都被同步升 levelUp 级。
    //   严格掼蛋规则应是"赢家升、输家不升"(双上时输家甚至可能降级)。
    //   实施复杂度的代价:需要在 calcLevelUp 阶段追踪输家队的等级变化,影响
    //   state.levelRank / teamLevels / getLevelRank / 升级提示 / 升 A 不过 / 还原
    //   等多处逻辑。**当前作用域**:本游戏 P2P 局域网版不实现差异化升级,只用
    //   简化版(双方同步升),UI 上不显示"对方队"levelRank(只显示本队 levelRank)。
    //   未来真要做差异化,需新增 teamLevelUp[] 分别计算,再在 applyRoundEnd 里
    //   按 winnerTeam 升级 winner 队、保持 loser 队不变(可能需要根据 levelUp
    //   数值做"过 A 不过"等特殊规则)。
    //   - 未来差异化时:teamLevels[0] = winnerTeam===0 ? upgrade : maybe downgrade
    //   - 现状约束:teamLevels 字段已加(对外 API 兼容),但内部逻辑仍同步
    const newLevelRank = E.getLevelRank(state.levelRank, levelUp)
    state.teamLevels = [newLevelRank, newLevelRank]
    state.levelRank = newLevelRank
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
  function destroy() {
    if (state._aiTimer) {
      try { clearTimeout(state._aiTimer) } catch (e) {}
      state._aiTimer = null
    }
    // 清 handlers Map(防止旧 listener 在 emit 时被调用,虽然 destroy 后不再 emit)
    for (const k of Object.keys(handlers)) delete handlers[k]
    // 清 aiPlayers(避免旧 AI 配置残留)
    aiPlayers = []
    // 标记已 destroyed
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
    applySnapshot(snap) { return this._applySnapshot(snap) },
    // ★ GD-RC-003:权威结算 — 接 host 发的完整 payload,不去读本地 state 重新算
    applyRoundEndFromPayload(p) {
      if (!p) return
      const rid = p.roundId
      // 同一 roundId 已应用过则跳过(去重)
      if (rid != null) {
        if (state.lastAppliedRoundId === rid) return
        state.lastAppliedRoundId = rid
      }
      if (Array.isArray(p.ranks) && p.ranks.length === 4) {
        // 末位补齐(防御)
        const ranks = p.ranks.slice()
        state.finishedOrder = ranks
      }
      if (typeof p.levelUp === 'number') state.levelUp = p.levelUp
      if (typeof p.newLevelRank === 'number') state.levelRank = p.newLevelRank
      // ★ BUG-RC2-005 修复:nullable 字段用 'in' 判断,支持清空到 null
      //   旧版 if (p.tribute) 在 tribute=null 时不更新,残留上一局的 tribute 对象
      if ('tribute' in p) state.tribute = p.tribute
      if (Array.isArray(p.teamLevels) && p.teamLevels.length === 2) {
        state.teamLevels = p.teamLevels.slice()
      }
      state.phase = 'finished'
      // round 不在此处自增(round++ 在 host 端的 applyRoundEnd 走),权威语义:
      // host 端本地 round 已经走完一轮并 round++,joiner 端只接收结果
      if (typeof p.round === 'number') state.round = p.round
      // ★ v0.4.9:isRestartAfterA — host 权威计算(joiner 不重复推断)
      //   payload.isRestartAfterA 缺失时:回退到 host 已经写在 state.levelUp /
      //   levelRank 上的值(快照已经应用过),但更稳的判断是
      //   previousLevelRank + levelUp 都在 payload 里(都要在 p 里)
      const isRestart = typeof p.isRestartAfterA === 'boolean'
        ? p.isRestartAfterA
        : (typeof p.previousLevelRank === 'number' && typeof p.levelUp === 'number'
            && p.previousLevelRank === 14 && p.levelUp > 0)
      // ★ V0410-02 修复:写回 state.isRestartAfterA + state.previousLevelRank
      //   旧版只 emit roundEnd,state 没写 → refreshUiFromGameState 读 st.isRestartAfterA
      //   还是旧值(false) → UI / snapshot / host 迁移后过 A 状态会回退。
      //   现在写回 state 保证后续 getState() / snapshot / refresh 都拿到权威值。
      state.isRestartAfterA = isRestart
      state.previousLevelRank = (typeof p.previousLevelRank === 'number') ? p.previousLevelRank : null
      emit('roundEnd', {
        ranks: state.finishedOrder.slice(),
        levelUp: state.levelUp,
        tribute: state.tribute,
        previousLevelRank: state.previousLevelRank,
        newLevelRank: state.levelRank,
        teamLevels: state.teamLevels.slice(),
        roundId: rid,
        isRestartAfterA: isRestart,  // ★ v0.4.9
      })
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

      // 1) 旧 host 走人 → 他的 27 张牌"弃牌" → 加入 abandonedSeats
      //    v3.x P2-30 修复(2):改用 abandonedSeats 而不是 finishedOrder,
      //    避免新 host(seat 0)也在 finishedOrder 里导致 playerPlay 拒绝出牌
      //    finishedOrder 严格表示"出完牌"语义,弃赛不算出完
      // ★ v0.4.14 对抗性审查 (V0412-02):但 oldHostSeat=0 不能放 abandonedSeats,
      //   因为 0 已经被新 host 接管(下一步 hands[0] = newHostHand),如果 0 留在
      //   abandonedSeats,nextTurn() 会用 while 循环把新 host 永远跳过 —
      //   表现为新 host 自己永远不能再获得回合。修法:不要 push 0,旧 host 用
      //   finishedOrder 末位 + state.hands[0] = [] 的"事实清空"就够了。
      //   其他 seat(1/2/3)弃赛仍可放 abandonedSeats(比如 host 离开前某 joiner
      //   已弃赛),保留逻辑不变。
      const oldHostHand = state.hands[oldHostSeat]
      if (oldHostSeat !== 0 && !state.abandonedSeats.includes(oldHostSeat)) {
        state.abandonedSeats.push(oldHostSeat)
      }
      // 旧 host 的 27 张牌作废(清空)
      state.hands[oldHostSeat] = []

      // 2) 新 host 的手牌从 hands[newHostSeat] 移到 hands[0]
      //    hands[newHostSeat] 留空(他现在是 seat 0 了)
      const newHostHand = state.hands[newHostSeat].slice()
      state.hands[0] = newHostHand
      state.hands[newHostSeat] = []

      // ★ v0.4.14 对抗性审查 (V0412-02) 防御性清理:即使历史原因 abandonedSeats
      //   里残留 0(老 host 端收到了旧版本广播的 snapshot 带着 [0]),也要在这里
      //   filter 掉,保证新 host 不会被 nextTurn 跳过。
      if (state.abandonedSeats.includes(0)) {
        state.abandonedSeats = state.abandonedSeats.filter(s => s !== 0)
      }

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

      // 5) trickHistory 也要修正 — v3.x P3-8 修复:保留旧 seat 信息作 trace,
//    而不是丢信息直接映射为 0。新增 _originalSeat 字段记录迁移前的 seat。
state.trickHistory = state.trickHistory.map(h => {
  if (h.seat === oldHostSeat || h.seat === newHostSeat) {
    return { ...h, seat: 0, _originalSeat: h.seat }
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

      emit('host:migrated', { oldHostSeat, newHostSeat, finishedOrder: state.finishedOrder.slice(), abandonedSeats: state.abandonedSeats.slice() })
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
      // ★ v0.4.9:difficulty 字段同步(默认值 'medium' 兜底)
      if ('difficulty' in snap && (snap.difficulty === 'medium' || snap.difficulty === 'hard')) {
        state.difficulty = snap.difficulty
      }
      if (snap.finishedOrder) {
        // finishedOrder 必须是 0..3 的子集
        const ok = Array.isArray(snap.finishedOrder) && snap.finishedOrder.every(s => isValidSeat(s))
        if (ok) state.finishedOrder = snap.finishedOrder.slice()
      }
      // v3.x P2-30 修复(2):snapshot 应用 abandonedSeats(支持 P2P 同步 host 迁移)
      if (Array.isArray(snap.abandonedSeats) && snap.abandonedSeats.every(s => isValidSeat(s))) {
        state.abandonedSeats = snap.abandonedSeats.slice()
      }
      if (typeof snap.passCount === 'number') state.passCount = snap.passCount
      // ★ BUG-RC2-005 修复:nullable 字段用 'in' 判断,支持清空到 null
      //   旧版 if (snap.tribute) / if (snap.ghost) 在字段为 null 时不更新,
      //   残留旧值;新规则:snapshot 含字段就应用(含 null 表示清空)
      if ('tribute' in snap) state.tribute = snap.tribute
      if ('ghost' in snap) state.ghost = snap.ghost
      if (typeof snap.levelUp === 'number') state.levelUp = snap.levelUp
      if (typeof snap.levelRank === 'number') state.levelRank = snap.levelRank
    if (Array.isArray(snap.teamLevels) && snap.teamLevels.length === 2) {
      const tl = snap.teamLevels
      if (tl.every(t => typeof t === 'number')) state.teamLevels = tl.slice()
    }
      if (typeof snap.round === 'number') state.round = snap.round
      if (snap.phase && validPhase.includes(snap.phase)) state.phase = snap.phase
      // ★ v0.4.14 对抗性审查 (V0412-04):补齐 _applySnapshot 缺字段
      //   旧版只 apply 了基础字段,isRestartAfterA / previousLevelRank /
      //   lastAppliedRoundId 没处理 → snapshot 同步时丢掉过 A 标志、上一局级牌、
      //   ROUND_END 去重 id,refreshUiFromGameState 拿到旧值,UI 退回"下一局"文案
      if (typeof snap.isRestartAfterA === 'boolean') state.isRestartAfterA = snap.isRestartAfterA
      if (typeof snap.previousLevelRank === 'number') state.previousLevelRank = snap.previousLevelRank
      // lastAppliedRoundId 是 string 或 null(从未应用过),用 'in' 判字段存在
      if ('lastAppliedRoundId' in snap) state.lastAppliedRoundId = snap.lastAppliedRoundId
      // 同步发 turn 事件让 UI 重新渲染
      emit('turn', state.currentPlayer, state.lastPlay, { isTeammateLast: false })
    },
  }
}

export { createGame }
