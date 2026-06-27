/**
 * useGameLogic.js — GameView 纯逻辑 composable
 *
 * v2.4 task 1:把 GameView.vue 中**无 DOM 部分**(state / computed / methods / 生命周期)
 * 抽到本 composable,让 t2 (desktop) + t3 (mobile) 共享。
 *
 * 设计原则:
 *   - 纯 JS,无 .vue import
 *   - 不持有 DOM 引用(用 mainActionsRef 等 ref 让组件传进来)
 *   - 不调用 route / router(由组件层处理跳转)
 *   - 网络模块 import 默认实例,组件层如有测试 hook 可覆盖
 *
 * 入参: { selfSeat, ghostRank, isP2PMode, mainActionsRef }
 *   - selfSeat 0-3:自己的座位(联机时由父组件传)
 *   - ghostRank:鬼牌 rank(可选)
 *   - isP2PMode:是否 P2P 联机(可选,默认 false)
 *   - mainActionsRef:模板里 MainActions 的 ref,用于 setShowing(false)
 *
 * 返回:GameView 模板需要的所有 reactive / computed / methods
 */

import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { createGame } from '@/common/guandan-game.js'
import * as E from '@/common/guandan-engine.js'
import AI from '@/common/guandan-ai.js'
import dealAnim from '@/common/deal-animation.js'
import audio from '@/common/audio.js'
import { bombFxForType, floatingPosition } from '@/common/effects.js'
import net from '@/common/network.js'
import { rotateSeats } from '@/common/seat-rotation.js'
import storage from '@/common/storage.js'

const RANK_LABEL = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }

export function useGameLogic(opts = {}) {
  const mainActionsRef = opts.mainActionsRef || ref(null)

  // ★ 静态审查 BUG-G 修复:onNet + disposers 模式
  //   所有 net.on 调用通过 onNet 注册,自动 push 到 disposers,卸载时统一 off 掉,
  //   避免匿名监听器无法清理导致反复进出牌局后重复发快照或旧闭包触发。
  const disposers = []
  function onNet(event, handler) {
    net.on(event, handler)
    disposers.push(() => { try { net.off(event, handler) } catch (e) {} })
  }

  // ★ GD-RC-001 修复:"网络 host 身份"独立变量,不与 selfSeat 绑定。
  //   之前大量代码用 `selfSeat === 0` 判定"是否是 host/权威端",但 host 换队友后
  //   selfSeat 变成 2,本机仍是网络 host,旧判定会误判成"不是 host",导致
  //   准备 / 开局 / 发牌 / 下一局 / AI 接管 / 快照异常。
  //   修法:用 net.isHost() 取网络 host 身份(在 useGameLogic 整个生命周期
  //   都不会变,除非 host 迁移)。后续 host 迁移可单独处理。
  const isNetworkHost = ref((() => { try { return net.isHost ? !!net.isHost() : false } catch { return false } })())

  // ===== 顶层 state =====
  const round = ref(1)
  const levelRank = ref(15)
  const levelLabel = ref('2')
  const nextLevelLabel = ref('2')
  const levelUp = ref(0)
  const multiplier = ref(1)
  // ★ v0.4.9:AI 难度(从 game.state.difficulty 读,默认 'medium')
  const gameDifficulty = ref(opts.difficulty || 'medium')

  // 4 个玩家座位(0=下=自己, 1=左, 2=上=队友, 3=右)
  const players = ref([
    { name: '', avatar: '🀄', isAI: false, isMe: true, coins: 8888, level: 7 },
    { name: 'AI-东', avatar: '♠', isAI: true, isMe: false, coins: 6666, level: 5 },
    { name: 'AI-北', avatar: '♥', isAI: true, isMe: false, coins: 9999, level: 8 },
    { name: 'AI-西', avatar: '♦', isAI: true, isMe: false, coins: 5555, level: 4 },
  ])
  const myHand = ref([])
  const selected = ref([])
  const selectedColKeys = ref({})
  const tableCards = ref([])
  const lastPlay = ref(null)
  const phase = ref('idle')
  const currentPlayer = ref(0)
  const firstPlayer = ref(0)
  const turnTimeLeft = ref(30)
  const finishedOrder = ref([])
  const game = ref(null)
  const aiPlayers = [1, 2, 3]

  // v3 状态
  const isDealing = ref(false)
  const hintCards = ref([])
  const bombFx = ref(null)
  const floatingPasses = ref([])
  const playedHistory = ref([])
  const suitFilter = ref(null)
  const isShaking = ref(false)

  // v3.7:报数 tick
  const lastCardCounts = ref([27, 27, 27, 27])

  // v3.7:对局中禁改名
  const showNickToast = ref(false)
  let nickToastTimer = null
  function showNickToastBrief() {
    showNickToast.value = true
    if (nickToastTimer) clearTimeout(nickToastTimer)
    nickToastTimer = setTimeout(() => { showNickToast.value = false }, 2000)
  }
  function onNickEditRequest() {
    showNickToastBrief()
  }

  // v3.7 P1:聊天弹层 + 选中后 2s toast
  const showChatPanel = ref(false)
  const chatPhraseToast = ref('')
  let chatPhraseTimer = null
  function onChatSelect({ phrase }) {
    chatPhraseToast.value = phrase
    if (chatPhraseTimer) clearTimeout(chatPhraseTimer)
    chatPhraseTimer = setTimeout(() => { chatPhraseToast.value = '' }, 2000)
  }

  // v2.1 P3:host 迁移提示
  const hostMigrationToast = ref(null)
  const hostMigrationBadge = ref(false)
  let hostMigToastTimer = null
  function showHostMigrationToast({ isMyself, newHostSeat }) {
    if (isMyself) {
      hostMigrationToast.value = { text: '你已成为新房主', isMyself: true }
    } else {
      const name = players.value[newHostSeat]?.name || `玩家${newHostSeat}`
      hostMigrationToast.value = { text: `${name} 已成为新房主`, isMyself: false }
    }
    if (hostMigToastTimer) clearTimeout(hostMigToastTimer)
    hostMigToastTimer = setTimeout(() => {
      hostMigrationToast.value = null
    }, isMyself ? 5000 : 3000)
    hostMigrationBadge.value = true
  }
  // ★ BUG-RC2-003 修复:抽 refreshUiFromGameState() 公共函数
  //   任何 _applySnapshot / applySnapshot 之后都应统一刷新 UI refs
  //   之前 onP2PStateSnapshot 已修,但 onHostMigrated / ROUND_END fallback
  //   漏修,导致 host 迁移时 UI 跟 game state 不同步
  function refreshUiFromGameState() {
    if (!game.value || !game.value.getState) return
    const st = game.value.getState()
    currentPlayer.value = st.currentPlayer
    lastPlay.value = st.lastPlay
    tableCards.value = st.tableCards || []
    finishedOrder.value = st.finishedOrder || []
    phase.value = st.phase
    levelRank.value = st.levelRank
    levelUp.value = st.levelUp || 0
    // ★ v0.4.9:同步 difficulty(从 snapshot 接收时也更新)
    if (st.difficulty === 'medium' || st.difficulty === 'hard') {
      gameDifficulty.value = st.difficulty
    }
    if (Array.isArray(st.hands) && st.hands[selfSeat.value]) {
      myHand.value = E.sortHandGrouped(st.hands[selfSeat.value].slice())
      selected.value = new Array(myHand.value.length).fill(false)
      selectedColKeys.value = {}
    }
  }

  function onHostMigrated(payload) {
    if (!payload) return
    const isMyself = payload.isMyself === true
    const newHostSeat = payload.newHostSeat
    if (newHostSeat == null) return
    showHostMigrationToast({ isMyself, newHostSeat })
    // ★ BUG-RC2-001 修复:host 迁移必须同时迁移 network / game / UI 三层状态。
    //   之前 network 层把新 host 改成 seat 0 + isHostFlag=true,
    //   但 game 层(手牌 / currentPlayer / lastPlay.who / trickHistory)
    //   仍留在原 seat;UI 层 selfSeat / isNetworkHost / myHand 等没同步。
    //   修法:
    //   1) 同步 selfSeat.value / isNetworkHost.value 到 net 权威值
    //   2) 调 game.migrateHost(0, newHostSeat) 让手牌 remap
    //   3) applySnapshot 接 host 端权威完整 state(无 snapshot 时至少也要 migrate)
    //   4) refreshUiFromGameState() 刷 UI refs
    try {
      // 1) 同步 useGameLogic 内部状态
      const netSelfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
      selfSeat.value = netSelfSeat
      const netIsHost = (() => { try { return !!net.isHost && net.isHost() } catch { return false } })()
      isNetworkHost.value = netIsHost
      // ★ BUG-RC3-002 修复(2026-06-28):顺序改为「先 applySnapshot 再 migrateHost」。
      //   payload.snapshot 是 joiner 端在迁移前从 game.getState() 取的(seat 映射 = 旧)。
      //   旧顺序 migrateHost → applySnapshot 会把刚搬好的 hands[0](新 host) 用
      //   snapshot.hands[0](旧 host 手牌)覆盖回去,导致新 host 看到错误手牌。
      // 2) 先 applySnapshot — 把 state 恢复到"迁移前"完整状态(seat 映射 = 旧)
      if (game.value && payload.snapshot) {
        if (game.value.applySnapshot) game.value.applySnapshot(payload.snapshot)
        else if (game.value._applySnapshot) game.value._applySnapshot(payload.snapshot)
      }
      // 3) 再 migrateHost — 把 hands[newHostSeat] 搬到 hands[0],currentPlayer/abandonedSeats 重映射
      if (game.value && game.value.migrateHost) {
        game.value.migrateHost(0, newHostSeat)
      }
      // 4) 刷 UI refs(旁观者也走这条,跟新 host 同步最新 game state)
      refreshUiFromGameState()
    } catch (e) { console.warn('host migration state sync err', e) }
  }

  // v3.x P2-29(N-3 闭环):joiner 端兜底 — host 离开时主动提升自己为新 host
  //   触发场景:joiner 端 network 检测到 PEER_LEAVE { seat: 0 }(原 host 6-8s 心跳超时 / 主动 close)
  //   设计:每个 joiner 都监听,自己调 net.requestPromoteToHost(snapshot)
  //   竞态:network 内部 PROMOTE_HOST_REQUEST 处理会"先到先得"(peers.get(0) 已有新 host 时后到者让位)
  function onPeerLeave(payload) {
    if (!payload || payload.seat !== 0) return
    // ★ GD-RC-001 修复:用 isNetworkHost 判定(原 selfSeat===0 在 host 换队友后失效)
    if (isNetworkHost.value) return
    if (!isP2PMode.value) return
    // 当前对局已结束 → 不再触发(避免无效迁移)
    if (!game.value) return
    const st = game.value.getState()
    if (st.phase === 'finished') return
    // 取 snapshot:对局关键字段(joiner 端只关心手牌 / 当前出牌者 / 桌面 / 等级)
    const snapshot = {
      hands: st.hands,
      tableCards: st.tableCards,
      currentPlayer: st.currentPlayer,
      firstPlayer: st.firstPlayer,
      leaderPlayer: st.leaderPlayer,
      lastPlay: st.lastPlay,
      finishedOrder: st.finishedOrder,
      trickHistory: st.trickHistory,
      passCount: st.passCount,
      tribute: st.tribute,
      ghost: st.ghost,
      levelRank: st.levelRank,
      teamLevels: st.teamLevels,
      phase: st.phase,
    }
    try {
      net.requestPromoteToHost && net.requestPromoteToHost(snapshot)
    } catch (e) { console.warn('requestPromoteToHost err', e) }
  }

  // v3.7 P1:紧急蜂鸣
  const urgent = ref(false)
  let lastUrgentBeepAt = 0
  const URGENT_BEEP_COOLDOWN_MS = 1000

  // v3.7:NICK_UPDATE 远程同步
  function onRemoteNickUpdate(payload, from) {
    if (!payload || from == null || from < 0 || from > 3) return
    const next = { ...players.value[from] }
    if (payload.nickname) next.name = payload.nickname
    if (payload.avatar) next.avatar = payload.avatar
    players.value = [
      ...players.value.slice(0, from),
      next,
      ...players.value.slice(from + 1),
    ]
  }

  let timer = null
  let passFloatId = 0

  // ===== 计算属性 =====
  const myTurn = computed(() => {
    const seat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
    return currentPlayer.value === seat && phase.value === 'playing' && !isDealing.value
  })
  const currentPlayerName = computed(() =>
    players.value[currentPlayer.value]?.name || `玩家${currentPlayer.value}`
  )
  const firstPlayerName = computed(() =>
    players.value[firstPlayer.value]?.name || `玩家${firstPlayer.value}`
  )
  const firstPlayerEmoji = computed(() =>
    players.value[firstPlayer.value]?.avatar || '🤖'
  )
  const tipText = computed(() => {
    if (phase.value === 'finished') return '本局结束'
    if (isDealing.value) return '发牌中...'
    return `${currentPlayerName.value} 思考中`
  })

  function _seatShowCount(c) {
    if (c <= 0) return true
    return c <= 10
  }
  function _seatIsUrgent(c) {
    return c > 0 && c <= 5
  }
  const seatData = computed(() => {
    const st = game.value?.getState()
    const result = {}
    const selfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
    const { top: tmSeat, left: leftSeat, right: rightSeat } = rotateSeats(selfSeat)
    const t = players.value[tmSeat] || players.value[2]
    const tCount = st ? (st.finishedOrder.includes(tmSeat) ? 0 : st.hands[tmSeat]?.length ?? 27) : 27
    result.top = {
      role: 'teammate', name: t.name, avatar: t.avatar, coins: t.coins, level: t.level,
      cardCount: tCount,
      isTurn: currentPlayer.value === tmSeat && phase.value === 'playing',
      isDone: st?.finishedOrder.includes(tmSeat) ?? false,
      showCount: _seatShowCount(tCount), isUrgent: _seatIsUrgent(tCount),
    }
    const me = players.value[selfSeat] || players.value[0]
    const meCount = myHand.value.length
    result.bottom = {
      role: 'self', name: me.name, avatar: me.avatar, coins: me.coins, level: me.level,
      cardCount: meCount,
      isTurn: currentPlayer.value === selfSeat && phase.value === 'playing',
      isDone: st?.finishedOrder.includes(selfSeat) ?? false,
      showCount: _seatShowCount(meCount), isUrgent: _seatIsUrgent(meCount),
    }
    const l = players.value[leftSeat] || players.value[1]
    const lCount = st ? (st.finishedOrder.includes(leftSeat) ? 0 : st.hands[leftSeat]?.length ?? 27) : 27
    result.left = {
      role: 'opponent', name: l.name, avatar: l.avatar, coins: l.coins, level: l.level,
      cardCount: lCount,
      isTurn: currentPlayer.value === leftSeat && phase.value === 'playing',
      isDone: st?.finishedOrder.includes(leftSeat) ?? false,
      showCount: _seatShowCount(lCount), isUrgent: _seatIsUrgent(lCount),
    }
    const r = players.value[rightSeat] || players.value[3]
    const rCount = st ? (st.finishedOrder.includes(rightSeat) ? 0 : st.hands[rightSeat]?.length ?? 27) : 27
    result.right = {
      role: 'opponent', name: r.name, avatar: r.avatar, coins: r.coins, level: r.level,
      cardCount: rCount,
      isTurn: currentPlayer.value === rightSeat && phase.value === 'playing',
      isDone: st?.finishedOrder.includes(rightSeat) ?? false,
      showCount: _seatShowCount(rCount), isUrgent: _seatIsUrgent(rCount),
    }
    return result
  })

  // ===== 工具函数 =====
  function playerName(seat) {
    return players.value[seat]?.name || `玩家${seat}`
  }
  function formatCoins(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
    return String(n)
  }
  function cardKey(c) { return `${c.suit}-${c.rank}` }
  function handCardKey(c, i) { return `${i}-${cardKey(c)}` }
  function isHinted(c) { return hintCards.value.includes(cardKey(c)) }
  function isLevel(c) { return E.isLevelCard(c, levelRank.value) }
  function rankColor(i) { return ['gold', 'silver', 'bronze', 'last'][i] }

  // v3-2:按 rank 分组竖叠
  const handColumns = computed(() => E.groupHandByRank(myHand.value))
  function columnKey(col) {
    return col.isJoker ? `joker-${col.rank}` : `r${col.rank}`
  }
  function colMinHeight(col) {
    const n = col.cards.length
    return 96 + Math.max(0, n - 1) * 20
  }
  const RANK_LABELS = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }
  function colRankLabel(col) {
    if (col.isJoker) return '王'
    return RANK_LABELS[col.rank] || String(col.rank)
  }
  function toggleCol(col) {
    if (!myTurn.value) return
    const k = columnKey(col)
    selectedColKeys.value = { ...selectedColKeys.value, [k]: !selectedColKeys.value[k] }
  }
  const selectedCount = computed(() => Object.values(selectedColKeys.value).filter(Boolean).length)

  // ===== 计时器 =====
  function startTimer() {
    stopTimer()
    turnTimeLeft.value = 30
    urgent.value = false
    timer = setInterval(() => {
      turnTimeLeft.value--
      if (myTurn.value && turnTimeLeft.value <= 5 && turnTimeLeft.value > 0) {
        urgent.value = true
        const now = performance.now()
        if (now - lastUrgentBeepAt >= URGENT_BEEP_COOLDOWN_MS) {
          lastUrgentBeepAt = now
          audio.sfxUrgentBeep()
        }
      } else {
        urgent.value = false
      }
      if (turnTimeLeft.value <= 0) {
        stopTimer()
        urgent.value = false
        if (myTurn.value) {
          if (myHand.value.length > 0) {
            const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
            // ★ BUG-003:超时自动出牌走 commitPlay 统一广播
            commitPlay(selfSeat.value, [sorted[0]], 'timeout')
          } else {
            // ★ BUG-003:超时自动过牌走 commitPass 统一广播
            commitPass(selfSeat.value, 'timeout')
          }
        }
      }
    }, 1000)
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null }
    urgent.value = false
  }

  // ===== 发牌动画 =====
  function computeDealTargets() {
    const w = window.innerWidth
    const h = window.innerHeight
    return [
      { x: w / 2, y: h - 80 },
      { x: 50, y: 200 },
      { x: w / 2, y: 110 },
      { x: w - 50, y: 200 },
    ]
  }

  function applySettingsToAudio() {
    const s = storage.getSettings()
    audio.setBgmEnabled(!!s.bgmEnabled)
    audio.setSfxEnabled(!!s.sfxEnabled)
    audio.setBgmVolume(Number(s.bgmVolume ?? 0.5))
    audio.setSfxVolume(Number(s.sfxVolume ?? 0.7))
  }

  let dealTimeoutId = null
  function startDealAnimation() {
    isDealing.value = true
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    myHand.value = []
    selected.value = []
    selectedColKeys.value = {}
    tableCards.value = []
    lastPlay.value = null
    playedHistory.value = []
    floatingPasses.value = []

    audio.unlock()
    if (storage.getSettings().bgmEnabled) audio.startBgm()

    // 兜底:无论动画为何卡住(真机 WebView / 后台切回前台 / 容错),
    // 8 秒后强制 isDealing=false 并进 playing,玩家至少能玩,而不是永远卡 loading。
    // 27 张牌 × 55ms stagger + 380ms flight + 80ms 余量 ≈ 1.95s,8s 是真机慢网/真 WebView 的安全冗余。
    if (dealTimeoutId) clearTimeout(dealTimeoutId)
    dealTimeoutId = setTimeout(() => {
      if (isDealing.value) {
        isDealing.value = false
        finishDeal()
      }
      dealTimeoutId = null
    }, 8000)

    nextTick(() => {
      const container = document.querySelector('.page')
      if (!container) { isDealing.value = false; finishDeal(); return }
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const targets = computeDealTargets()
      // v2.5:stagger 55 → 70,flight 380 → 380,曲线 ease-out-back(微微 overshoot,更自然)
      dealAnim.start({
        container, center, targets,
        cardsPerSeat: 27, stagger: 70, flightDuration: 380,
        onComplete: () => {
          if (dealTimeoutId) { clearTimeout(dealTimeoutId); dealTimeoutId = null }
          isDealing.value = false
          finishDeal()
        },
      })
    })
  }

  function finishDeal() {
    // ★ BUG-002 修复:非房主发牌后读 hands[0] 会拿到 host 的牌 — 必须按 selfSeat 读
    //   P2P 联机时 joiner seat=1/2/3,只有 host 才看 hands[0]
    //   单机 AI 模式 selfSeat 默认 0,也走同一路径,行为不变
    const st = game.value?.getState()
    const seat = Number.isInteger(selfSeat.value) ? selfSeat.value : 0
    const hand = st?.hands?.[seat]
    if (!Array.isArray(hand)) {
      console.warn('finishDeal: invalid hand for selfSeat', seat, 'st=', !!st)
      myHand.value = []
    } else {
      myHand.value = E.sortHandGrouped(hand.slice())
    }
    selected.value = new Array(myHand.value.length).fill(false)
    selectedColKeys.value = {}
    phase.value = 'playing'
    startTimer()
  }

  // ===== 飘字 =====
  function showFloatingPass(seat, kind = 'pass') {
    passFloatId++
    const id = passFloatId
    const pos = floatingPosition(seat)
    const text = kind === 'skip' ? '过牌' : '不出'
    floatingPasses.value.push({
      id, kind, text,
      style: { left: pos.left, top: pos.top },
    })
    setTimeout(() => {
      floatingPasses.value = floatingPasses.value.filter(f => f.id !== id)
    }, 1200)
  }

  // ===== 炸弹/王炸特效 =====
  function showBombFx(type) {
    const fx = bombFxForType(type)
    if (!fx) return
    bombFx.value = fx
    isShaking.value = true
    setTimeout(() => { bombFx.value = null }, 1500)
    setTimeout(() => { isShaking.value = false }, 800)
  }

  // ===== 游戏初始化 =====
  function initGame(opts2 = {}) {
    const isP2P = opts2.isP2P === true
    const seed = opts2.seed
    const me = isP2P ? (selfSeat.value || 0) : 0
    if (opts2.forcedLevelRank != null) levelRank.value = opts2.forcedLevelRank
    // ★ GD-RC-001 修复:isHost 判定用 net.isHost()(网络 host 身份),不用 selfSeat === 0。
    //   host 换队友后 selfSeat 变成 2,但本机仍是网络 host,isHost 应仍为 true。
    const isNetworkHost = (() => { try { return net.isHost ? net.isHost() : !isP2P } catch { return !isP2P } })()
    game.value = createGame({
      seats: 4,
      levelRank: levelRank.value,
      isHost: isNetworkHost,
      aiPlayers: isP2P ? [] : aiPlayers,
      seed: seed,
      // ★ v0.4.9:透传 difficulty 给 createGame(联机时所有 AI 用相同难度)
      difficulty: gameDifficulty.value,
    })
    if (isP2P && game.value.setAIBroadcast) {
      game.value.setAIBroadcast((seat, cards, type) => {
        if (type === 'PLAY') net.broadcast({ type: 'PLAY', payload: { seat, cards } })
      })
    }
    // v0.4.8 N-2:AI 补位 — P2P host 开房时,把空 seat 自动填 AI(1-3 人开局也能跑)
    //   注意:必须在 setAIBroadcast 之后调,这样 game.scheduleAI 出牌时 aiBroadcast 已注入
    if (isP2P && isNetworkHost && typeof game.value.addAIPlayer === 'function') {
      _fillEmptySeatsWithAI()
    }
    if (typeof window !== 'undefined') {
      window.__gd_game = game.value
      window.__gd_selfSeat = selfSeat.value
      window.__gd_net = net
      // v2.4 t3:暴露 isDealing / myHand / phase / currentPlayer 给 dev/screenshot 工具
      window.__gd_isDealing = isDealing
      window.__gd_myHand = myHand
      window.__gd_myTurn = myTurn
      window.__gd_phase = phase
      window.__gd_currentPlayer = currentPlayer
    }
    game.value.on('dealt', ({ firstPlayer: fp, levelRank: lr }) => {
      firstPlayer.value = fp
      currentPlayer.value = fp
      levelRank.value = lr
      levelLabel.value = RANK_LABEL[lr]
      lastCardCounts.value = [27, 27, 27, 27]
      startDealAnimation()
    })
    game.value.on('turn', (seat, lp) => {
      currentPlayer.value = seat
      lastPlay.value = lp
      if (seat !== me) {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
      } else {
        selected.value = new Array(myHand.value.length).fill(false)
        selectedColKeys.value = {}
      }
      startTimer()
    })
    game.value.on('play', ({ seat, cards }) => {
      if (cards && cards.length > 0) {
        try {
          const r = E.recognize(cards)
          audio.playSfxForType(r?.type, cards.length)
          if (r?.type === 'JOKER_BOMB' || (typeof r?.type === 'string' && r.type.startsWith('BOMB'))) {
            showBombFx(r.type)
          } else if (r?.type === 'STRAIGHT_FLUSH') {
            showBombFx(r.type)
          }
        } catch (e) { audio.playSfxForType('SINGLE', 1) }
      }
      const oldCount = lastCardCounts.value[seat] ?? 27
      const newCount = Math.max(0, oldCount - (cards?.length || 0))
      const nextCounts = [...lastCardCounts.value]
      nextCounts[seat] = newCount
      lastCardCounts.value = nextCounts
      if (newCount > 0 && newCount <= 5) {
        audio.sfxCountdownWarn()
      } else if (newCount > 0 && newCount <= 10) {
        audio.sfxCountdownTick()
      }
      if (seat === me) {
        const remove = new Set(cards.map(c => cardKey(c)))
        myHand.value = myHand.value.filter(c => !remove.has(cardKey(c)))
        selected.value = new Array(myHand.value.length).fill(false)
        selectedColKeys.value = {}
      }
      tableCards.value = cards
      cards.forEach(c => playedHistory.value.push(c))
      if (seat !== 0) {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
      }
    })
    game.value.on('pass', ({ seat }) => {
      showFloatingPass(seat, 'pass')
    })
    game.value.on('roundEnd', ({ ranks, levelUp: lu, newLevelRank }) => {
      phase.value = 'finished'
      finishedOrder.value = ranks
      levelUp.value = lu
      levelRank.value = newLevelRank
      nextLevelLabel.value = RANK_LABEL[newLevelRank]
      stopTimer()
      hintCards.value = []
      mainActionsRef.value?.setShowing(false)
      // ★ GD-RC-003 修复:权威 ROUND_END — 携带完整 payload + roundId 去重
      //   旧版只发 { ranks, levelUp, newLevelRank },joiner 端用本地 state 重算,
      //   如果 joiner 状态延迟/丢消息,会用本地错误数据覆盖。
      //   新版加 roundId + tribute + teamLevels + round,joiner 端用
      //   applyRoundEndFromPayload 不读本地 state,直接用 host 的权威结果。
      if (isP2PMode.value && !suppressRoundEndBroadcast) {
        const st = game.value && game.value.getState ? game.value.getState() : null
        const payload = {
          ranks,
          levelUp: lu,
          newLevelRank,
          roundId: `r${Date.now()}-${st?.round ?? 0}-${(ranks || []).join('-')}`,
          tribute: st?.tribute ?? null,
          teamLevels: st?.teamLevels ?? [newLevelRank, newLevelRank],
          round: st?.round ?? 0,
        }
        net.broadcast({ type: 'ROUND_END', payload })
      }
      // ★ GD-RC-001 修复:网络 host 才写历史(原 selfSeat===0 在 host 换队友后失效)
      if (!isP2PMode.value || isNetworkHost.value) {
        storage.addHistory({
          time: Date.now(),
          ranks, levelUp: lu, levelRank: newLevelRank,
          players: players.value.map(p => ({ name: p.name, avatar: p.avatar })),
        })
      }
    })
    game.value.deal()
  }

  function toggleCard(i) {
    if (!myTurn.value) return
    const c = myHand.value[i]
    if (!c) return
    const col = handColumns.value.find(col => col.cards.some(cc => cardKey(cc) === cardKey(c)))
    if (col) toggleCol(col)
  }
  function onClear() {
    selectedColKeys.value = {}
    selected.value = new Array(myHand.value.length).fill(false)
  }

  function selectedCardsFromColumns() {
    const selCols = handColumns.value.filter(col => selectedColKeys.value[columnKey(col)])
    return selCols.flatMap(col => col.cards.slice())
  }

  function onSortHand() {
    if (!myTurn.value) return
    myHand.value = E.sortHandGrouped(myHand.value.slice())
    suitFilter.value = null
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
  }

  // ===== BUG-003 修复:统一 commitPlay / commitPass =====
/**
 * ★ 唯一出牌入口。所有出牌路径(手动 onPlay / 自动 onAutoPlay / 提示 onAutoFindBest /
 *   AI 接管)必须走 commitPlay 或 commitPass,确保 P2P 模式下广播统一触发。
 *
 * 修法:
 *   - 手动出牌 / 自动出牌 / AI 接管都通过 commitPlay(seat, cards, source) 走同一路径
 *   - commitPlay 内部:game.playerPlay → isP2PMode 时 net.broadcast PLAY
 *   - commitPass 同理
 *
 * source 参数('manual' / 'auto' / 'ai' / 'timeout')用于 debug / 统计 / 以后做回放,
 *   当前实现只用作 payload 字段,不改变网络层行为。
 */
function commitPlay(seat, cards, source = 'manual') {
  if (!game.value) return { ok: false, error: 'game not initialized' }
  const r = game.value.playerPlay(seat, cards)
  if (!r || !r.ok) return r || { ok: false, error: 'playerPlay 失败' }
  if (isP2PMode.value) {
    net.broadcast({ type: 'PLAY', payload: { seat, cards, source } })
  }
  return r
}
function commitPass(seat, source = 'manual') {
  if (!game.value) return { ok: false, error: 'game not initialized' }
  const r = game.value.playerPass(seat)
  if (!r || !r.ok) return r || { ok: false, error: 'playerPass 失败' }
  if (isP2PMode.value) {
    net.broadcast({ type: 'PASS', payload: { seat, source } })
  }
  return r
}

function onAutoFindBest() {
    if (!myTurn.value) return
    const diff = gameDifficulty.value  // ★ v0.4.9:从 game state 取 difficulty 透传给 AI
    const r = AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false }, diff)
    if (r?.type === 'play' && Array.isArray(r.cards) && r.cards.length > 0) {
      const cards = r.cards
      const remove = new Set(cards.map(c => cardKey(c)))
      const actual = myHand.value.filter(c => remove.has(cardKey(c)))
      if (actual.length === cards.length) {
        // ★ BUG-003:走 commitPlay 统一广播
        const pr = commitPlay(selfSeat.value, actual, 'auto')
        if (!pr.ok) alert(pr.error || '出牌失败')
      } else {
        alert('无可出的牌型组合')
      }
    } else if (lastPlay.value) {
      // ★ BUG-003:走 commitPass 统一广播
      commitPass(selfSeat.value, 'auto')
    } else {
      const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
      // ★ BUG-003:走 commitPlay 统一广播
      commitPlay(selfSeat.value, [sorted[0]], 'auto')
    }
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    selectedColKeys.value = {}
  }

  function onSuitTab(suit) {
    if (suitFilter.value === suit) {
      suitFilter.value = null
      selectedColKeys.value = {}
      return
    }
    suitFilter.value = suit
    const next = {}
    for (const col of handColumns.value) {
      if (col.cards.some(c => c.suit === suit)) {
        next[columnKey(col)] = true
      }
    }
    selectedColKeys.value = next
  }

  function onHintToggle(show) {
    if (show) {
      // 跟牌场景:用 AI.decide 找最小可压(autoPlayGrouped 贪最强,不看 lastPlay,会导致提示用炸弹)
      // 首家场景:lastPlay=null,继续用 autoPlayGrouped 领出
      const r = lastPlay.value
        ? AI.decide(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false }, diff)
        : AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false }, diff)
      if (r?.type === 'play' && Array.isArray(r.cards) && r.cards.length > 0) {
        hintCards.value = r.cards.map(c => cardKey(c))
        const next = {}
        for (const col of handColumns.value) {
          if (col.cards.some(c => hintCards.value.includes(cardKey(c)))) {
            next[columnKey(col)] = true
          }
        }
        selectedColKeys.value = next
      } else {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
        if (!lastPlay.value && myHand.value.length > 0) {
          const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
          const minKey = cardKey(sorted[0])
          hintCards.value = [minKey]
          const next = {}
          for (const col of handColumns.value) {
            if (col.cards.some(c => cardKey(c) === minKey)) {
              next[columnKey(col)] = true
              break
            }
          }
          selectedColKeys.value = next
        }
      }
    } else {
      hintCards.value = []
      selectedColKeys.value = {}
    }
  }

  function onAutoPlay() {
    if (hintCards.value.length === 0) { mainActionsRef.value?.setShowing(false); return }
    const cards = myHand.value.filter(c => hintCards.value.includes(cardKey(c)))
    if (cards.length === 0) { hintCards.value = []; return }
    // ★ BUG-003:走 commitPlay 统一广播
    const r = commitPlay(selfSeat.value, cards, 'auto')
    if (!r.ok) alert(r.error || '出牌失败')
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
  }

  function onPlay() {
    const cards = selectedCardsFromColumns()
    if (cards.length === 0) { alert('请先选牌'); return }
    // ★ BUG-003:走 commitPlay 统一广播 (保留本地 selected 重置)
    const r = commitPlay(selfSeat.value, cards, 'manual')
    if (!r.ok) { alert(r.error || '出牌失败'); return }
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    selectedColKeys.value = {}
    suitFilter.value = null
  }
  function onPass() {
    if (!lastPlay.value) { alert('首家不能过牌'); return }
    // ★ BUG-003:走 commitPass 统一广播
    const r = commitPass(selfSeat.value, 'manual')
    if (!r.ok) { alert(r.error || '过牌失败'); return }
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
  }
  function onNext() {
    phase.value = 'playing'
    if (isP2PMode.value) {
      // ★ GD-RC-001 修复:下一局发牌由网络 host 负责(原 selfSeat===0 失效)
      if (isNetworkHost.value) {
        pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
        initGame({ isP2P: true, seed: pendingSeed })
        setTimeout(() => {
          net.broadcast({ type: 'DEAL', payload: { seed: pendingSeed, levelRank: levelRank.value, newRound: true } })
        }, 500)
      }
      return
    }
    game.value.nextRound()
    myHand.value = E.sortHandGrouped(game.value.getState().hands[selfSeat.value].slice())
    selected.value = new Array(myHand.value.length).fill(false)
    selectedColKeys.value = {}
    startDealAnimation()
  }
  function showMenu() { /* 路由跳转留给组件层 */ }
  function onChat() { showChatPanel.value = true }
  function onSeatClick(seat, e) { /* 占位 */ }
  function onIcon(name) {
    if (name === 'settings') showMenu()
  }

  // v3.7 P1:桌面端快捷键
  function onKeyDown(e) {
    if (!e) return
    const t = e.target
    const tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key
    if (k === 'a' || k === 'A') {
      if (!myTurn.value) return
      e.preventDefault()
      onHintToggle(true)
    } else if (k === ' ' || k === 'Spacebar') {
      if (!myTurn.value) return
      e.preventDefault()
      onPlay()
    } else if (k === 'p' || k === 'P') {
      if (!myTurn.value) return
      e.preventDefault()
      onPass()
    } else if (k === 'Escape' || k === 'Esc') {
      e.preventDefault()
      showMenu()
    }
  }

  // ===== v3.8 P1 P2P 模式 =====
  const isP2PMode = ref(opts.isP2PMode === true)
  const selfSeat = ref(opts.selfSeat ?? 0)
  let pendingSeed = null

  function onP2PDeal(payload, from, msg) {
    if (!payload || payload.seed == null) return
    // ★ GD-RC-001 修复:网络 host 跳过(自己发的),用 isNetworkHost 判定
    if (isNetworkHost.value) return
    initGame({ isP2P: true, seed: payload.seed, forcedLevelRank: payload.levelRank })
  }
  function onP2PPlay(payload) {
    if (!payload || !game.value) return
    try {
      const st = game.value.getState()
      if (st.currentPlayer === payload.seat) {
        game.value.applyPlay(payload.seat, payload.cards)
      }
    } catch (e) { console.warn('applyPlay err', e) }
  }
  function onP2PPass(payload) {
    if (!payload || !game.value) return
    if (payload.seat === selfSeat.value) return
    // ★ BUG-RC2-004 修复:onP2PPass 加 currentPlayer 校验(与 onP2PPlay 对齐)。
    //   之前只跳过本机 seat,直接 applyPass,迟到/重复/乱序/来自错误 seat 的 PASS
    //   会直接推进 passCount,可能提前结束一墩。
    try {
      const st = game.value.getState()
      if (st.phase !== 'playing') return
      if (st.currentPlayer !== payload.seat) return
      if (!st.lastPlay) return
      game.value.applyPass(payload.seat)
    } catch (e) { console.warn('applyPass err', e) }
  }
  // ★ 静态审查 BUG-A 修复:远端 ROUND_END 调 applyRoundEnd 时抑制再次广播
  // ★ GD-RC-003 修复:改用 applyRoundEndFromPayload 权威结算(不读本地 state)
  let suppressRoundEndBroadcast = false
  function onP2PRoundEnd(payload) {
    if (!payload || !game.value) return
    suppressRoundEndBroadcast = true
    try {
      // 优先用权威接口(接 host 完整 payload),fallback 旧 applyRoundEnd
      if (game.value.applyRoundEndFromPayload) {
        game.value.applyRoundEndFromPayload({
          ranks: payload.ranks,
          levelUp: payload.levelUp,
          newLevelRank: payload.newLevelRank,
          roundId: payload.roundId,
          tribute: payload.tribute,
          teamLevels: payload.teamLevels,
          round: payload.round,
        })
      } else {
        game.value.applyRoundEnd()
      }
    } catch (e) { console.warn('applyRoundEnd err', e) }
    finally {
      suppressRoundEndBroadcast = false
    }
    finishedOrder.value = payload.ranks || []
    levelUp.value = payload.levelUp || 0
    if (payload.newLevelRank) {
      levelRank.value = payload.newLevelRank
      nextLevelLabel.value = RANK_LABEL[payload.newLevelRank]
    }
    phase.value = 'finished'
    stopTimer()
  }
  // ★ GD-RC-005 修复:snapshot 接收端用 targetSeat 判定(原 seat: 0 语义混乱)
  //   host 定向 sendTo(connSeat, { type: 'STATE_SNAPSHOT', targetSeat, snapshot })
  //   joiner 收到后判断 targetSeat === selfSeat 才应用,避免非目标 joiner 也被覆盖
  function onP2PStateSnapshot(payload) {
    if (!payload || !game.value || !payload.snapshot) return
    // 旧版本(无 targetSeat 字段)是 broadcast,所有非发送方都应用;新版本定向
    // 旧字段 payload.seat 仍兼容:payload.seat 是发送方 seat,跳过自己
    if (payload.targetSeat != null) {
      // 新版定向:只 targetSeat 等于自己时应用
      if (payload.targetSeat !== selfSeat.value) return
    } else if (payload.seat != null) {
      // 旧版 broadcast:跳过发送方
      if (payload.seat === selfSeat.value) return
    }
    try {
      // ★ GD-RC-004 修复:_applySnapshot 之后必须同步刷新 UI refs。
      //   之前 _applySnapshot 写内部 state + emit('turn') → useGameLogic turn 监听
      //   只更新 currentPlayer / lastPlay / 计时器 / 选中态,不更新 myHand /
      //   tableCards / finishedOrder / phase / levelUp。断线重连后 UI 会和
      //   内部 state 不同步(下次出牌校验失败或 UI 卡住)。
      if (game.value._applySnapshot || game.value.applySnapshot) {
        if (game.value.applySnapshot) game.value.applySnapshot(payload.snapshot)
        else game.value._applySnapshot(payload.snapshot)
        // 同步刷新 UI refs
        const st = game.value.getState()
        currentPlayer.value = st.currentPlayer
        lastPlay.value = st.lastPlay
        tableCards.value = st.tableCards || []
        finishedOrder.value = st.finishedOrder || []
        phase.value = st.phase
        levelRank.value = st.levelRank
        levelUp.value = st.levelUp || 0
        if (Array.isArray(st.hands) && st.hands[selfSeat.value]) {
          myHand.value = E.sortHandGrouped(st.hands[selfSeat.value].slice())
          selected.value = new Array(myHand.value.length).fill(false)
          selectedColKeys.value = {}
        }
      } else {
        // 旧 fallback(没有 _applySnapshot / applySnapshot 的情况)
        const st = game.value.getState()
        currentPlayer.value = payload.snapshot.currentPlayer ?? st.currentPlayer
        lastPlay.value = payload.snapshot.lastPlay ?? st.lastPlay
        finishedOrder.value = payload.snapshot.finishedOrder || []
        if (payload.snapshot.levelRank) {
          levelRank.value = payload.snapshot.levelRank
          nextLevelLabel.value = RANK_LABEL[payload.snapshot.levelRank]
        }
        if (payload.snapshot.hands && payload.snapshot.hands[selfSeat.value]) {
          myHand.value = E.sortHandGrouped(payload.snapshot.hands[selfSeat.value].slice())
        }
      }
    } catch (e) { console.warn('applyStateSnapshot err', e) }
  }

  let _aiModule = null
  async function import_AI() {
    if (!_aiModule) _aiModule = await import('@/common/guandan-ai.js')
    return _aiModule
  }
  // v0.4.8 N-2:joiner 加入时 host 端的反向操作 — 从 aiPlayers 移除 seat
  //   对称于 onP2PAITakeover(掉线/AI 接管时加 aiPlayers,真玩家进入时移除)
  function onP2PPeerJoin(payload) {
    if (!payload || typeof payload.seat !== 'number') return
    if (!isNetworkHost.value) return  // 只有 host 端维护 aiPlayers
    if (!game.value) return
    const seat = payload.seat
    // 从 game.aiPlayers 移除
    if (typeof game.value.removeAIPlayer === 'function') {
      game.value.removeAIPlayer(seat)
    }
    // 更新 UI(用真玩家 nickname/avatar,不再 isAI)
    const realName = payload.info?.nickname || null
    const realAvatar = payload.info?.avatar || null
    const next = [...players.value]
    if (next[seat]) {
      next[seat] = {
        ...next[seat],
        isAI: false,
        name: realName || next[seat].name,
        avatar: realAvatar || next[seat].avatar,
      }
      players.value = next
    }
  }

  // v0.4.8 N-2:AI 补位 — host 端扫 peers,把空 seat 自动填 AI
  //   触发场景:host startAsHost 后立即调,initGame 后再调一次(此时 peers 是当前真实状态)
  //   也可在 joiner 进入/离开时调(动态调整 aiPlayers)
  //   注:joiner 端不进此函数(isNetworkHost=false)
  function _fillEmptySeatsWithAI() {
    if (!game.value) return
    if (typeof game.value.fillEmptySeatsWithAI !== 'function') return
    try {
      const peers = net.getPeers ? net.getPeers() : null
      const hostSeat = net.getSelfSeat ? net.getSelfSeat() : 0
      const hasPeer = (seat) => !!(peers && peers.has && peers.has(seat))
      const filled = game.value.fillEmptySeatsWithAI(hasPeer, hostSeat)
      // 更新 UI + broadcast AI_TAKEOVER 给 joiner 端
      const aiNames = ['AI-东','AI-南','AI-西','AI-北']
      for (const seat of filled) {
        const next = [...players.value]
        if (next[seat]) {
          next[seat] = { ...next[seat], isAI: true, name: aiNames[seat] || ('AI-' + seat) }
          players.value = next
        }
        try { net.broadcast({ type: 'AI_TAKEOVER', payload: { seat } }) } catch (e) { /* swallow */ }
      }
      return filled
    } catch (e) {
      console.warn('_fillEmptySeatsWithAI err', e)
      return []
    }
  }

  function onP2PAITakeover(payload) {
    if (!payload || !game.value) return
    const seat = payload.seat
    if (typeof seat !== 'number') return
    if (game.value.addAIPlayer) game.value.addAIPlayer(seat)
    const next = [...players.value]
    if (next[seat]) {
      next[seat] = { ...next[seat], isAI: true, name: (next[seat].name || '玩家') + ' (AI)' }
      players.value = next
    }
    const cur = game.value.getState().currentPlayer
    // ★ GD-RC-001 修复:网络 host 端自动出牌判定
    if (cur === seat && isNetworkHost.value) {
      const st = game.value.getState()
      if (st.phase === 'playing') {
        setTimeout(() => {
          const hand = st.hands[seat]
          if (hand && hand.length > 0) {
            const ctx = {
              isTeammateLast: st.lastPlay && ((st.lastPlay.who + 2) % 4 === seat),
              mySeatIndex: seat,
              teammateSeatIndex: (seat + 2) % 4,
            }
            import_AI().then(AI => {
              const r = AI.default.decide(hand, st.lastPlay, st.levelRank, ctx, st.difficulty || 'medium')
              // ★ BUG-003:AI 接管出牌走 commitPlay 统一广播
              if (r.type === 'play') {
                commitPlay(seat, r.cards, 'ai')
              } else {
                commitPass(seat, 'ai')
              }
            })
          }
        }, 500)
      }
    }
  }

  function applyNetworkPlayers() {
    try {
      const peers = net.getPeers ? net.getPeers() : null
      if (!peers) return
      const next = [...players.value]
      for (const [seat, info] of peers.entries()) {
        if (seat < 0 || seat > 3) continue
        if (!info) continue
        const realName = info.nickname || next[seat]?.name
        const realAvatar = info.avatar || next[seat]?.avatar
        if (realName) next[seat] = { ...next[seat], name: realName, avatar: realAvatar, isAI: false }
      }
      players.value = next
    } catch (e) {
      console.warn('applyNetworkPlayers failed:', e)
    }
  }

  // ===== 生命周期 =====
  onMounted(() => {
    selfSeat.value = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
    players.value[selfSeat.value].name = storage.getNickname() || '我'
    players.value[selfSeat.value].avatar = storage.getAvatar() || '🀄'
    applyNetworkPlayers()
    applySettingsToAudio()
    onNet('message:NICK_UPDATE', onRemoteNickUpdate)

    try {
      const peersCount = net.getPeers ? net.getPeers().size : 0
      isP2PMode.value = peersCount >= 2
    } catch { isP2PMode.value = false }
    if (isP2PMode.value) {
      onNet('message:DEAL', onP2PDeal)
      onNet('message:PLAY', onP2PPlay)
      onNet('message:PASS', onP2PPass)
      onNet('message:ROUND_END', onP2PRoundEnd)
      onNet('message:STATE_SNAPSHOT', onP2PStateSnapshot)
      onNet('message:AI_TAKEOVER', onP2PAITakeover)
      // ★ 静态审查 BUG-C 修复:host 端心跳超时只本地 emit 'ai:takeover' + 广播
      //   AI_TAKEOVER,但游戏层之前只监听 'message:AI_TAKEOVER'(即远端消息),
      //   host 自己不监听本地 'ai:takeover' 事件 → host 端不会进入
      //   onP2PAITakeover(),掉线玩家轮到出牌时 host 不会让 AI 接管 → 牌局卡住
      //   修法:同时监听本地 'ai:takeover' 事件
      onNet('ai:takeover', onP2PAITakeover)
      onNet('host:migrated', onHostMigrated)
      // ★ v3.x P2-29(N-3 闭环):joiner 端监听 host 离开,调 requestPromoteToHost 兜底
      onNet('peer:leave', onPeerLeave)
      // v0.4.8 N-2:AI 补位 — host 端监听 peer:join,移除该 seat 的 AI 标记
      //   注意 joiner 端不需要这个逻辑(joiner 不管 host 的 aiPlayers)
      onNet('peer:join', onP2PPeerJoin)
      // ★ GD-RC-001 修复:网络 host 才接 connect 发 snapshot + 初始发牌
      //   原 selfSeat===0 在 host 换队友后失效,导致 snapshot 由错误端发 / DEAL 由错误端发
      if (isNetworkHost.value) {
        // ★ 静态审查 BUG-G 修复:connect 监听器改命名函数 + 加入 disposers,
        //   卸载时 onNet disposers 一起清,避免匿名监听器无法清理导致重复发快照
        // ★ GD-RC-005 修复:reconnect snapshot 定向发送给新连接 seat 而非广播
        const onConnectSnapshot = ({ seat: connSeat }) => {
          if (!game.value) return
          setTimeout(() => {
            if (!game.value) return
            const st = game.value.getState()
            // 定向:用 sendTo + targetSeat 标记接收方,接收端判断 target 决定是否应用
            try {
              net.sendTo && net.sendTo(connSeat, {
                type: 'STATE_SNAPSHOT',
                payload: { targetSeat: connSeat, snapshot: st },
              })
            } catch (e) { /* fallback to broadcast if sendTo not available */ }
          }, 200)
        }
        onNet('connect', onConnectSnapshot)
      }
      if (isNetworkHost.value) {
        pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
        initGame({ isP2P: true, seed: pendingSeed })
        setTimeout(() => {
          net.broadcast({ type: 'DEAL', payload: { seed: pendingSeed, levelRank: levelRank.value } })
        }, 500)
      }
    } else {
      initGame()
    }

    document.addEventListener('keydown', onKeyDown)
  })

  onUnmounted(() => {
    stopTimer()
    audio.stopBgm()
    // ★ 静态审查 BUG-G 修复:统一清所有 onNet 注册的监听器(disposers)
    while (disposers.length) {
      try { disposers.pop()() } catch (e) {}
    }
    try { document.removeEventListener('keydown', onKeyDown) } catch (e) {}
    if (nickToastTimer) clearTimeout(nickToastTimer)
    if (chatPhraseTimer) clearTimeout(chatPhraseTimer)
  })

  // ===== 导出(组件层需要的全部 reactive / computed / methods) =====
  return {
    // state
    round, levelRank, levelLabel, nextLevelLabel, levelUp, multiplier,
    players, myHand, selected, selectedColKeys, tableCards, lastPlay,
    phase, currentPlayer, firstPlayer, turnTimeLeft, finishedOrder, game,
    isDealing, hintCards, bombFx, floatingPasses, playedHistory,
    suitFilter, isShaking, lastCardCounts, showNickToast, showChatPanel,
    chatPhraseToast, hostMigrationToast, hostMigrationBadge, urgent,
    isP2PMode, selfSeat,
    // computed
    myTurn, currentPlayerName, firstPlayerName, firstPlayerEmoji, tipText,
    seatData, handColumns, selectedCount,
    // methods
    showNickToastBrief, onNickEditRequest, onChatSelect, onHostMigrated,
    playerName, formatCoins, cardKey, handCardKey, isHinted, isLevel, rankColor,
    columnKey, colMinHeight, colRankLabel, toggleCol, toggleCard, onClear,
    selectedCardsFromColumns, onSortHand, onAutoFindBest, onSuitTab,
    onHintToggle, onAutoPlay, onPlay, onPass, onNext, onChat, onSeatClick,
    onIcon, showMenu, initGame, startDealAnimation, applyNetworkPlayers,
    // v0.4.8 N-2:AI 补位辅助函数(测试 / 外部 trigger 用)
    _fillEmptySeatsWithAI,
    onRemoteNickUpdate, applySettingsToAudio, finishDeal,
    // ★ BUG-003:统一出牌/过牌入口 — 组件层也能直接调,带自动广播
    commitPlay, commitPass,
  }
}
