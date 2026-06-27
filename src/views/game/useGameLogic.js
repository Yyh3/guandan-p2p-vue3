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

  // ===== 顶层 state =====
  const round = ref(1)
  const levelRank = ref(15)
  const levelLabel = ref('2')
  const nextLevelLabel = ref('2')
  const levelUp = ref(0)
  const multiplier = ref(1)

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
  function onHostMigrated(payload) {
    if (!payload) return
    const isMyself = payload.isMyself === true
    const newHostSeat = payload.newHostSeat
    if (newHostSeat == null) return
    showHostMigrationToast({ isMyself, newHostSeat })
    if (isMyself && game.value && payload.snapshot) {
      try { game.value._applySnapshot(payload.snapshot) } catch (e) {}
    }
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
    game.value = createGame({
      seats: 4,
      levelRank: levelRank.value,
      isHost: !isP2P || me === 0,
      aiPlayers: isP2P ? [] : aiPlayers,
      seed: seed,
    })
    if (isP2P && game.value.setAIBroadcast) {
      game.value.setAIBroadcast((seat, cards, type) => {
        if (type === 'PLAY') net.broadcast({ type: 'PLAY', payload: { seat, cards } })
      })
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
      if (isP2PMode.value) {
        net.broadcast({ type: 'ROUND_END', payload: { ranks, levelUp: lu, newLevelRank } })
      }
      if (!isP2PMode.value || selfSeat.value === 0) {
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
    const r = AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false })
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
        ? AI.decide(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false })
        : AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false })
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
      if (selfSeat.value === 0) {
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
    if (selfSeat.value === 0) return
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
    try { game.value.applyPass(payload.seat) } catch (e) { console.warn('applyPass err', e) }
  }
  function onP2PRoundEnd(payload) {
    if (!payload || !game.value) return
    try {
      game.value.applyRoundEnd()
    } catch (e) { console.warn('applyRoundEnd err', e) }
    finishedOrder.value = payload.ranks || []
    levelUp.value = payload.levelUp || 0
    if (payload.newLevelRank) {
      levelRank.value = payload.newLevelRank
      nextLevelLabel.value = RANK_LABEL[payload.newLevelRank]
    }
    phase.value = 'finished'
    stopTimer()
  }
  function onP2PStateSnapshot(payload) {
    if (!payload || !game.value || !payload.snapshot) return
    if (payload.seat === selfSeat.value) return
    try {
      if (game.value._applySnapshot) {
        game.value._applySnapshot(payload.snapshot)
      } else {
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
    if (cur === seat && selfSeat.value === 0) {
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
              const r = AI.default.decide(hand, st.lastPlay, st.levelRank, ctx)
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
    net.on('message:NICK_UPDATE', onRemoteNickUpdate)

    try {
      const peersCount = net.getPeers ? net.getPeers().size : 0
      isP2PMode.value = peersCount >= 2
    } catch { isP2PMode.value = false }
    if (isP2PMode.value) {
      net.on('message:DEAL', onP2PDeal)
      net.on('message:PLAY', onP2PPlay)
      net.on('message:PASS', onP2PPass)
      net.on('message:ROUND_END', onP2PRoundEnd)
      net.on('message:STATE_SNAPSHOT', onP2PStateSnapshot)
      net.on('message:AI_TAKEOVER', onP2PAITakeover)
      net.on('host:migrated', onHostMigrated)
      if (selfSeat.value === 0) {
        net.on('connect', ({ seat, info }) => {
          if (!game.value) return
          setTimeout(() => {
            const st = game.value.getState()
            net.broadcast({ type: 'STATE_SNAPSHOT', payload: { seat: 0, snapshot: st } })
          }, 200)
        })
      }
      if (selfSeat.value === 0) {
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
    try { net.off && net.off('message:NICK_UPDATE') } catch (e) {}
    try { net.off && net.off('message:DEAL') } catch (e) {}
    try { net.off && net.off('message:PLAY') } catch (e) {}
    try { net.off && net.off('message:PASS') } catch (e) {}
    try { net.off && net.off('message:ROUND_END') } catch (e) {}
    try { net.off && net.off('message:STATE_SNAPSHOT') } catch (e) {}
    try { net.off && net.off('message:AI_TAKEOVER') } catch (e) {}
    try { net.off && net.off('host:migrated') } catch (e) {}
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
    onRemoteNickUpdate, applySettingsToAudio, finishDeal,
    // ★ BUG-003:统一出牌/过牌入口 — 组件层也能直接调,带自动广播
    commitPlay, commitPass,
  }
}
