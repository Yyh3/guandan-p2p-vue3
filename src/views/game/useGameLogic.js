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
import dealAnim from '@/common/deal-animation.js'
import audio from '@/common/audio.js'

// ★ v0.4.23:AI 模块改为运行时动态导入,实现代码分割,避免打包进主 chunk。
let aiModulePromise = null
async function _loadAI() {
  if (aiModulePromise) return aiModulePromise
  aiModulePromise = import('../../common/guandan-ai.js')
  return aiModulePromise
}
import { bombFxForType, floatingPosition } from '@/common/effects.js'
import net from '@/common/network.js'
import { rotateSeats } from '@/common/seat-rotation.js'
import storage from '@/common/storage.js'
import { showToast } from '@/common/dialog-bus.js'
import * as haptics from '@/common/haptics.js'

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

  // ★ Phase3 UI 修复:统一 timer 生命周期管理
  //   所有 setTimeout 注册到 timers,卸载时批量清理,避免组件已卸载后旧闭包仍访问 refs
  //   或导致 Vue warn / 内存泄漏。单个 timer 重复 clearTimeout 是安全的。
  // ★ P2-06:timers 改为 Set,addTimer 在超时触发后自动删除 id,防止无界增长。
  const timers = new Set()
  function addTimer(callback, delay, ...args) {
    const id = setTimeout(() => {
      timers.delete(id)
      callback(...args)
    }, delay)
    timers.add(id)
    return id
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
  // ★ v0.4.9:过 A 标志(本轮打 A 升级后才为 true)→ GameView 按钮文案切换
  const isRestartAfterA = ref(false)
  const multiplier = ref(1)
  // ★ v0.4.9:AI 难度(从 game.state.difficulty 读,默认 'medium')
  const gameDifficulty = ref(opts.difficulty || 'medium')
  // ★ LOGIC-01 修复:AI 页传入的起始级牌,若合法则作为默认 levelRank
  if (opts.initialLevelRank != null && typeof opts.initialLevelRank === 'number') {
    levelRank.value = opts.initialLevelRank
    levelLabel.value = RANK_LABEL[levelRank.value] ?? '2'
  }
  // ★ UI-P0-03 修复:发牌超时标志,用于 UI 兜底提示
  const dealTimeout = ref(false)
  // ★ LOGIC-04 修复:当前 deal 标识,超时重试时避免本地 fork
  const currentDealId = ref('')
  // ★ P0-09:每轮比赛的唯一标识,用于 ROUND_END / 历史记录去重
  let matchInstanceId = ''

  // 4 个玩家座位(0=下=自己, 1=左, 2=上=队友, 3=右)
  const players = ref([
    { name: '', avatar: '🀄', isAI: false, isMe: true, coins: 8888, level: 7 },
    { name: 'AI-东', avatar: '♠', isAI: true, isMe: false, coins: 6666, level: 5 },
    { name: 'AI-北', avatar: '♥', isAI: true, isMe: false, coins: 9999, level: 8 },
    { name: 'AI-西', avatar: '♦', isAI: true, isMe: false, coins: 5555, level: 4 },
  ])
  const myHand = ref([])
  const selected = ref([])
  // ★ P0-01:单牌级选择源,以 cardKey(card id) 为键
  const selectedCardIds = ref(new Set())
  // 列级视觉反馈仍保留,但由 selectedCardIds 派生
  const selectedColKeys = computed(() => {
    const map = {}
    for (const col of handColumns.value) {
      if (col.cards.some(c => selectedCardIds.value.has(cardKey(c)))) {
        map[columnKey(col)] = true
      }
    }
    return map
  })
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
  const dealProgress = ref(0)
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
    nickToastTimer = addTimer(() => { showNickToast.value = false }, 2000)
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
    chatPhraseTimer = addTimer(() => { chatPhraseToast.value = '' }, 2000)
  }

  // ★ P2-01:selfSeat 有效性校验
  function isValidSeat(seat) { return Number.isInteger(seat) && seat >= 0 && seat < 4 }

  // v2.1 P3:host 迁移提示
  const hostMigrationToast = ref(null)
  const hostMigrationBadge = ref(false)
  let hostMigToastTimer = null
  let hostMigBadgeTimer = null
  function showHostMigrationToast({ isMyself, newHostSeat }) {
    if (isMyself) {
      hostMigrationToast.value = { text: '你已成为新房主', isMyself: true }
    } else {
      const name = players.value[newHostSeat]?.name || `玩家${newHostSeat}`
      hostMigrationToast.value = { text: `${name} 已成为新房主`, isMyself: false }
    }
    if (hostMigToastTimer) clearTimeout(hostMigToastTimer)
    hostMigToastTimer = addTimer(() => {
      hostMigrationToast.value = null
    }, isMyself ? 5000 : 3000)
    hostMigrationBadge.value = true
    if (hostMigBadgeTimer) clearTimeout(hostMigBadgeTimer)
    hostMigBadgeTimer = addTimer(() => {
      hostMigrationBadge.value = false
    }, 5000)
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
    // ★ V049-02 修复:从 game state 同步过 A 标志,保证 host 迁移 / snapshot 应用后
    //   isRestartAfterA.value 跟 game state 一致,避免按钮文案停留在「下一局」
    if (typeof st.isRestartAfterA === 'boolean') {
      isRestartAfterA.value = st.isRestartAfterA
    }
    // ★ P1-17:refreshUiFromGameState 统一重算 lastCardCounts
    // Phase 2:joiner 模式下远程 seat 的 hand 是空占位,真实张数从 handCounts 读
    lastCardCounts.value = st.hands.map((hand, seat) => {
      if (st.finishedOrder?.includes(seat)) return 0
      if (st.abandonedSeats?.includes(seat)) return 0
      return (Array.isArray(hand) ? hand.length : 0) || (Array.isArray(st.handCounts) ? st.handCounts[seat] : 0) || 0
    })
    if (Array.isArray(st.hands) && st.hands[selfSeat.value]) {
      myHand.value = E.sortHandGrouped(st.hands[selfSeat.value].slice())
      selected.value = new Array(myHand.value.length).fill(false)
      selectedCardIds.value = new Set()
    }
  }

  function onHostMigrated(payload) {
    if (!payload) return
    const isMyself = payload.isMyself === true
    const oldHostSeat = payload.oldHostSeat ?? 0
    const newHostSeat = payload.newHostSeat
    if (newHostSeat == null) return
    // ★ P0-03:本机成为新 host 时,必须先把 game 升到 host 权威模式,再 toast / rebuild。
    if (isMyself && game.value && game.value.promoteToHost) {
      const promoted = game.value.promoteToHost(payload.snapshot)
      if (!promoted?.ok) {
        showToast('房主迁移失败，本局将结束')
        try { net.emit && net.emit('host:lost', { reason: promoted?.error || 'promote_failed', ts: Date.now() }) } catch (_) {}
        return
      }
    } else if (!isMyself && game.value && payload.snapshot) {
      const applied = game.value.applySnapshot ? game.value.applySnapshot(payload.snapshot) : { ok: true }
      if (!applied?.ok) {
        console.warn('[P2P] host migration snapshot apply failed', applied?.error)
        return
      }
    }
    showHostMigrationToast({ isMyself, newHostSeat })
    // ★ Phase 1:host 迁移座位稳定。
    //   network 层保持新 host 原 seat 不变,isHostFlag=true;
    //   game 层只把旧 host seat 标记 abandoned,currentPlayer 等指向新 host;
    //   UI 层同步 selfSeat / isNetworkHost / myHand。
    try {
      // 1) 同步 useGameLogic 内部状态
      const netSelfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
      selfSeat.value = netSelfSeat
      const netIsHost = (() => { try { return !!net.isHost && net.isHost() } catch { return false } })()
      isNetworkHost.value = netIsHost
      // 2) 再 migrateHost — 旧 host 标记 abandoned,新 host 保持原 seat
      if (game.value && game.value.migrateHost) {
        game.value.migrateHost(oldHostSeat, newHostSeat)
      }
      // ★ P1-03:旧 host 座位由 AI 接管,同步 players UI(加 (AI) 后缀)
      onP2PAITakeover({ seat: oldHostSeat })
      // 3) 刷 UI refs(旁观者也走这条,跟新 host 同步最新 game state)
      refreshUiFromGameState()
    } catch (e) { console.warn('host migration state sync err', e) }
    // ★ v0.4.16 对抗性复查 (V0414-02):本机是新 host 时,必须重建服务端 transport
    //   旧版只迁了 game / network / UI 三层,但没调 net.rebuildAsHost() →
    //   WS / AndroidWs 真机模式下新 host 的 transport 仍是 client 角色,其他设备无法连接,
    //   后续 P2P 消息转发 / 心跳 / 重连全部失败,表现为"UI 显示迁移成功但真机联机不可用"
    //   修法:fire-and-forget 调 rebuildAsHost(),失败仅 warn 不阻塞(BC 模式下 rebuildAsHost
    //   内部判断 selfSeat==0 且 isHostFlag=true 会自处理,不会真触发重建)
    // ★ v0.4.18 对抗性审查 (V0414-04):rebuildAsHost 失败时 emit host:lost 让业务层跳首页
    //   典型场景:浏览器 ws joiner 走 V0414-04 本地 self-loop 升级自己,但浏览器无 ws server 能力,
    //   rebuildAsHost open('self') 失败 → emit host:lost → GameViewDesktop 监听 → router.push 首页。
    //   rebuildAsHost 内部失败分支已经在 network.js emit host:lost,这里补 promise.catch 路径
    if (isMyself && net.rebuildAsHost) {
      try {
        const p = net.rebuildAsHost()
        if (p && typeof p.catch === 'function') {
          p.catch((e) => {
            console.warn('[P2P] rebuildAsHost after migration failed:', e)
            try { net.emit && net.emit('host:lost', { reason: 'rebuildAsHost_failed', error: e?.message || String(e), ts: Date.now() }) } catch (_) {}
          })
        }
      } catch (e) { console.warn('[P2P] rebuildAsHost sync err:', e) }
    }
  }

  // v3.x P2-29(N-3 闭环):joiner 端兜底 — host 离开时主动提升自己为新 host
  //   触发场景:joiner 端 network 检测到 PEER_LEAVE { seat: hostSeat }(原 host 6-8s 心跳超时 / 主动 close)
  //   设计:每个 joiner 都监听,自己调 net.requestPromoteToHost(snapshot)
  //   竞态:network 内部 PROMOTE_HOST_REQUEST 处理会"先到先得"(_promotedHostSeat 已记录时后到者让位)
  function onPeerLeave(payload) {
    if (!payload) return
    // ★ Phase 1:host 离开检测不再依赖 seat === 0,而是看 migrate 标记或 seat 是否为当前 hostSeat
    const isHostLeaving = payload.migrate === true || payload.seat === net.getHostSeat()
    if (!isHostLeaving) return
    // ★ GD-RC-001 修复:用 isNetworkHost 判定(原 selfSeat===0 在 host 换队友后失效)
    if (isNetworkHost.value) return
    if (!isP2PMode.value) return
    // 当前对局已结束 → 不再触发(避免无效迁移)
    if (!game.value) return
    const st = game.value.getState()
    if (st.phase === 'finished') return
    // ★ v0.4.14 对抗性审查 (V0412-05 / V0412-07):不再手写 snapshot 字段列表,
    //   委托 game.getSnapshot() 拿到完整 + 深拷贝的 state。
    //   - 字段全集(避免遗漏 difficulty / round / levelUp / abandonedSeats /
    //     isRestartAfterA / previousLevelRank / lastAppliedRoundId)
    //   - 深拷贝(避免异步发送期间 snapshot 被后续本地动作污染)
    //   - 单一来源(getSnapshot 与 _applySnapshot 字段口径必须一致)
    let snapshot = null
    try {
      snapshot = (typeof game.value.getSnapshot === 'function')
        ? game.value.getSnapshot()
        : null
    } catch (e) { /* snapshot 构造失败就不发迁移请求 */ }
    if (!snapshot) return
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
    const tCount = st ? (st.finishedOrder.includes(tmSeat) ? 0 : (st.hands[tmSeat]?.length || st.handCounts?.[tmSeat] || 27)) : 27
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
    const lCount = st ? (st.finishedOrder.includes(leftSeat) ? 0 : (st.hands[leftSeat]?.length || st.handCounts?.[leftSeat] || 27)) : 27
    result.left = {
      role: 'opponent', name: l.name, avatar: l.avatar, coins: l.coins, level: l.level,
      cardCount: lCount,
      isTurn: currentPlayer.value === leftSeat && phase.value === 'playing',
      isDone: st?.finishedOrder.includes(leftSeat) ?? false,
      showCount: _seatShowCount(lCount), isUrgent: _seatIsUrgent(lCount),
    }
    const r = players.value[rightSeat] || players.value[3]
    const rCount = st ? (st.finishedOrder.includes(rightSeat) ? 0 : (st.hands[rightSeat]?.length || st.handCounts?.[rightSeat] || 27)) : 27
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
  function cardKey(c) { return typeof c.id === 'number' ? String(c.id) : `${c.suit}-${c.rank}` }
  function handCardKey(c, i) { return `${i}-${cardKey(c)}` }
  function isHinted(c) { return hintCards.value.includes(cardKey(c)) }
  function isLevel(c) { return E.isLevelCard(c, levelRank.value) }
  function rankColor(i) { return ['gold', 'silver', 'bronze', 'last'][i] }
  // ★ HCI-04 修复:以头游所在队伍为胜方,而不是简单前两名
  const winningTeam = computed(() => {
    const headSeat = finishedOrder.value?.[0]
    return Number.isInteger(headSeat) ? headSeat % 2 : null
  })
  function isWinningSeat(seat) {
    return winningTeam.value !== null && seat % 2 === winningTeam.value
  }

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
    if (isDealing.value) return
    const allSelected = col.cards.every(c => selectedCardIds.value.has(cardKey(c)))
    const next = new Set(selectedCardIds.value)
    for (const c of col.cards) {
      const k = cardKey(c)
      if (allSelected) next.delete(k)
      else next.add(k)
    }
    selectedCardIds.value = next
  }
  const selectedCount = computed(() => selectedCardIds.value.size)

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
    // ★ V0410-06 修复:补 setBgmStyle + setSfxMode
    //   旧版 applySettingsToAudio 只同步 enabled + volume,用户在 SettingsView 改的
    //   bgmStyle / sfxMode 不生效 → 直接进入 GameView 时仍走默认值(energetic / synth)
    //   现在同步所有音频设置,保证进入游戏页就生效
    if (typeof audio.setBgmStyle === 'function') {
      audio.setBgmStyle(String(s.bgmStyle || 'energetic'))
    }
    if (typeof audio.setSfxMode === 'function') {
      audio.setSfxMode(String(s.sfxMode || 'synth'))
    }
  }

  let dealTimeoutId = null
  function clearDealTimeout() {
    if (dealTimeoutId) {
      clearTimeout(dealTimeoutId)
      dealTimeoutId = null
    }
  }
  function startDealAnimation() {
    isDealing.value = true
    dealProgress.value = 0
    dealTimeout.value = false
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    myHand.value = []
    selected.value = []
    selectedCardIds.value = new Set()
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
    dealTimeoutId = addTimer(() => {
      if (isDealing.value) {
        isDealing.value = false
        // 8s 后仍没收到完成,先尝试 finishDeal;若 hand 仍无效再触发超时提示
        finishDeal()
        if (dealTimeout.value) {
          console.warn('[deal] 8s timeout and hand still invalid')
        }
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
        onProgress: (p) => { dealProgress.value = Math.round(p * 100) },
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
    if (!Array.isArray(hand) || hand.length !== 27) {
      console.warn('finishDeal: invalid hand for selfSeat', seat, 'len=', hand?.length, 'st=', !!st)
      myHand.value = []
      // ★ UI-P0-03 修复:hand 未就绪时不应永久卡在发牌,标记超时让 UI 显示重试
      dealTimeout.value = true
      return
    }
    myHand.value = E.sortHandGrouped(hand.slice())
    selected.value = new Array(myHand.value.length).fill(false)
    selectedCardIds.value = new Set()
    phase.value = 'playing'
    dealTimeout.value = false
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
    addTimer(() => {
      floatingPasses.value = floatingPasses.value.filter(f => f.id !== id)
    }, 1200)
  }

  // ===== 炸弹/王炸特效 =====
  function showBombFx(type) {
    const fx = bombFxForType(type)
    if (!fx) return
    bombFx.value = fx
    isShaking.value = true
    addTimer(() => { bombFx.value = null }, 1500)
    addTimer(() => { isShaking.value = false }, 800)
  }

  // ===== 游戏初始化 =====
  function initGame(opts2 = {}) {
    const isP2P = opts2.isP2P === true
    const seed = opts2.seed
    const firstSeat = opts2.firstSeat != null ? opts2.firstSeat : opts.firstSeat
    currentDealId.value = String(seed ?? Date.now())
    // ★ P0-09:每局新比赛生成唯一 matchInstanceId;reuse 时保留已有(如 retryDeal)
    if (opts2.reuse !== true || !matchInstanceId) {
      matchInstanceId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }
    // ★ Phase3 UI 修复:用 getter 替代常量快照,selfSeat 在 host 迁移后会变,
    //   旧常量 me 在事件监听器里不会更新,导致 turn/play 等事件按旧 seat 处理。
    // ★ P2-01:getMe 回退到 0 当 selfSeat 非法,避免 players[-1]
    const getMe = () => isP2P ? (isValidSeat(selfSeat.value) ? selfSeat.value : 0) : 0
    if (opts2.forcedLevelRank != null) levelRank.value = opts2.forcedLevelRank
    // ★ GD-RC-001 修复:isHost 判定用 net.isHost()(网络 host 身份),不用 selfSeat === 0。
    //   host 换队友后 selfSeat 变成 2,但本机仍是网络 host,isHost 应仍为 true。
    // Phase 2:单机模式(非 P2P)始终按 host 模式发牌;P2P 模式才看 net.isHost()
    const isNetworkHost = (() => { try { return !isP2P || (net.isHost ? net.isHost() : false) } catch { return !isP2P } })()
    // ★ Phase 4:支持复用已有 game 实例(如 retryDeal 先 replaceGame 再 attach listeners)
    if (!(opts2.reuse === true && game.value)) {
      replaceGame(() => createGame({
        seats: 4,
        levelRank: levelRank.value,
        isHost: isNetworkHost,
        selfSeat: selfSeat.value,
        aiPlayers: isP2P ? [] : aiPlayers,
        seed: seed,
        // ★ v0.4.9:透传 difficulty 给 createGame(联机时所有 AI 用相同难度)
        difficulty: gameDifficulty.value,
      }))
    }
    if (isP2P && game.value.setAIBroadcast) {
      game.value.setAIBroadcast((seat, cards, type) => {
        // ★ v0.4.14 对抗性审查 (V0412-03):AI pass 也必须广播 — 旧版只处理
        //   PLAY 分支,joiner 端收到 PLAY 校验过 currentPlayer === payload.seat 才 apply,
        //   但 AI PASS 时 joiner 端 currentPlayer 没推进,后续校验失败导致 joiner 卡住。
        //   修法:symmetrize PLAY / PASS 两个分支,都通过 net.broadcast 同步给 joiner。
        const ts = Date.now()
        // ★ P0-03:AI 只在 host 端运行,host 直接广播 COMMITTED
        if (type === 'PLAY') {
          net.broadcast({ type: 'PLAY_COMMITTED', payload: { seat, cards, source: 'ai', actionId: _generateActionId(), ts } })
        }
        if (type === 'PASS') {
          net.broadcast({ type: 'PASS_COMMITTED', payload: { seat, source: 'ai', actionId: _generateActionId(), ts } })
        }
      })
    }
    // v0.4.8 N-2:AI 补位 — P2P host 开房时,把空 seat 自动填 AI(1-3 人开局也能跑)
    //   注意:必须在 setAIBroadcast 之后调,这样 game.scheduleAI 出牌时 aiBroadcast 已注入
    if (isP2P && isNetworkHost && typeof game.value.addAIPlayer === 'function') {
      _fillEmptySeatsWithAI()
    }
    // ★ P0-01:调试全局变量只在 DEV 模式暴露,生产构建树摇掉该分支。
    //   不直接暴露完整 game ref,只暴露只读 UI 状态与必要 ref,防止手牌等敏感状态被 console 绕过。
    if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      window.__gd_selfSeat = selfSeat.value
      window.__gd_net = net
      // v2.4 t3:暴露 isDealing / myHand / phase / currentPlayer 给 dev/screenshot 工具
      window.__gd_isDealing = isDealing
      window.__gd_myHand = myHand
      window.__gd_myTurn = myTurn
      window.__gd_phase = phase
      window.__gd_currentPlayer = currentPlayer
      // 结算遮罩 E2E 需要能注入结果数据
      window.__gd_finishedOrder = finishedOrder
      window.__gd_isRestartAfterA = isRestartAfterA
      window.__gd_levelUp = levelUp
      window.__gd_nextLevelLabel = nextLevelLabel
      // 如需完整 state 调试,只通过 getState() 一次性拷贝,并截断非本 seat 手牌
      window.__gd_gameState = () => {
        const st = game.value?.getState?.()
        if (!st) return null
        return {
          ...st,
          hands: st.hands.map((h, i) => (i === selfSeat.value ? h : { length: h.length })),
        }
      }
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
      if (seat !== getMe()) {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
      } else {
        selected.value = new Array(myHand.value.length).fill(false)
        selectedCardIds.value = new Set()
      }
      startTimer()
    })
    game.value.on('play', ({ seat, cards, type }) => {
      // ★ P1-18:直接用 game 层已经识别好的 type,避免重复 recognize
      const playType = type || (() => { try { return E.recognize(cards)?.type } catch { return null } })()
      if (cards && cards.length > 0) {
        try {
          audio.playSfxForType(playType, cards.length)
          if (playType === 'JOKER_BOMB' || (typeof playType === 'string' && playType.startsWith('BOMB'))) {
            showBombFx(playType)
          } else if (playType === 'STRAIGHT_FLUSH') {
            showBombFx(playType)
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
      if (seat === getMe()) {
        const remove = new Set(cards.map(c => cardKey(c)))
        myHand.value = myHand.value.filter(c => !remove.has(cardKey(c)))
        selected.value = new Array(myHand.value.length).fill(false)
        selectedCardIds.value = new Set()
      }
      tableCards.value = cards
      cards.forEach(c => playedHistory.value.push(c))
      if (seat !== getMe()) {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
      }
    })
    game.value.on('pass', ({ seat }) => {
      showFloatingPass(seat, 'pass')
    })
    game.value.on('roundEnd', ({ ranks, levelUp: lu, newLevelRank, isRestartAfterA: ira, previousLevelRank }) => {
      phase.value = 'finished'
      finishedOrder.value = ranks
      levelUp.value = lu
      levelRank.value = newLevelRank
      nextLevelLabel.value = RANK_LABEL[newLevelRank]
      // ★ V049-02 修复:UI 端同步过 A 标志(host 已经在 game 层计算,这里接住)
      if (typeof ira === 'boolean') {
        isRestartAfterA.value = ira
      }
      stopTimer()
      hintCards.value = []
      mainActionsRef.value?.setShowing(false)
      // ★ GD-RC-003 修复:权威 ROUND_END — 携带完整 payload + roundId 去重
      //   旧版只发 { ranks, levelUp, newLevelRank },joiner 端用本地 state 重算,
      //   如果 joiner 状态延迟/丢消息,会用本地错误数据覆盖。
      //   新版加 roundId + tribute + teamLevels + round,joiner 端用
      //   applyRoundEndFromPayload 不读本地 state,直接用 host 的权威结果。
      // ★ V0410-01 修复:P2P 模式下只有网络 host 才能广播 ROUND_END
      //   旧版只判断 isP2PMode + !suppressRoundEndBroadcast,joiner 端在 applyPlay
      //   触发 finishRound 后也会发 ROUND_END → 多端重复结算,不同 roundId 竞争
      //   修复后:加 isNetworkHost.value 守卫,joiner 端静默走本地结算 + 等 host 广播
      if (isP2PMode.value && isNetworkHost.value && !suppressRoundEndBroadcast) {
        const st = game.value && game.value.getState ? game.value.getState() : null
        // ★ P0-09:roundId 包含 matchInstanceId,防止重开后与上一轮碰撞
        const ranksKey = (ranks || []).join('-') || 'none'
        const roundId = `${matchInstanceId}:r${st?.round ?? 0}:${ranksKey}`
        const payload = {
          ranks,
          levelUp: lu,
          newLevelRank,
          roundId,
          tribute: st?.tribute ?? null,
          teamLevels: st?.teamLevels ?? [newLevelRank, newLevelRank],
          round: st?.round ?? 0,
          matchInstanceId,
          // ★ V049-02 修复:ROUND_END payload 带过 A 标志 + 前等级
          //   joiner 端 onP2PRoundEnd 用权威值,不再从本地 state 推断
          isRestartAfterA: !!ira,
          previousLevelRank: (typeof previousLevelRank === 'number') ? previousLevelRank : null,
        }
        net.broadcast({ type: 'ROUND_END', payload })
      }
      // ★ GD-RC-001 修复:网络 host 才写历史(原 selfSeat===0 在 host 换队友后失效)
      // ★ P1-15/P1-16:历史记录增加 matchInstanceId,避免重开后去重碰撞
      if (!isP2PMode.value || isNetworkHost.value) {
        const st = game.value?.getState ? game.value.getState() : null
        storage.addHistory({
          time: Date.now(),
          ranks, levelUp: lu, levelRank: newLevelRank,
          players: players.value.map(p => ({ name: p.name, avatar: p.avatar })),
          matchId: net.getRoomId ? net.getRoomId() : 'local',
          matchInstanceId,
          roundId: st?.round ?? 0,
          mySeat: selfSeat.value,
          myPlayerId: (() => { try { return net.getSelfInfo?.()?.uuid || selfSeat.value } catch { return selfSeat.value } })(),
        })
      }
    })
    // ★ Phase 4:复用已有实例且已发牌时不再重复 deal,避免覆盖状态
    const shouldSkipDeal = opts2.reuse === true && game.value && game.value.getState().phase !== 'idle'
    // ★ Phase 2:host 模式(单机/P2P host)才本地发牌;joiner 模式等待 host 逐座 DEAL 消息,
    //   并用自己的真实手牌填充 game state,不再用 seed 本地还原四家完整手牌。
    if (!shouldSkipDeal && isNetworkHost) game.value.deal(seed, firstSeat)
  }

  function isCardSelected(c) {
    return selectedCardIds.value.has(cardKey(c))
  }
  function toggleCardId(id) {
    if (isDealing.value) return
    haptics.select()
    const next = new Set(selectedCardIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedCardIds.value = next
  }
  function toggleCard(i) {
    if (!myTurn.value) return
    const c = myHand.value[i]
    if (!c) return
    toggleCardId(cardKey(c))
  }
  function onClear() {
    haptics.click()
    selectedCardIds.value = new Set()
    selected.value = new Array(myHand.value.length).fill(false)
  }

  function selectedCardsFromIds() {
    return myHand.value.filter(c => selectedCardIds.value.has(cardKey(c)))
  }
  // 兼容旧调用
  function selectedCardsFromColumns() {
    return selectedCardsFromIds()
  }

  function onSortHand() {
    if (isDealing.value) return
    haptics.click()
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
  const actionId = _generateActionId()
  // ★ P0-03 host 权威模型:joiner 只发 PLAY_INTENT,不动本地 game;host 校验后广播 PLAY_COMMITTED
  if (isP2PMode.value && !isNetworkHost.value) {
    net.broadcast({ type: 'PLAY_INTENT', payload: { seat, cards, source, clientActionId: actionId, actionId, ts: Date.now() } })
    return { ok: true, pending: true }
  }
  const r = game.value.playerPlay(seat, cards)
  if (!r || !r.ok) return r || { ok: false, error: 'playerPlay 失败' }
  if (isP2PMode.value) {
    // ★ P0-02:host 直接出的牌也使用 commitId,joiner 统一按 commitId 去重
    net.broadcast({ type: 'PLAY_COMMITTED', payload: { seat, cards, source, commitId: actionId, actionId, ts: Date.now() } })
  }
  return r
}
function commitPass(seat, source = 'manual') {
  if (!game.value) return { ok: false, error: 'game not initialized' }
  const actionId = _generateActionId()
  if (isP2PMode.value && !isNetworkHost.value) {
    net.broadcast({ type: 'PASS_INTENT', payload: { seat, source, clientActionId: actionId, actionId, ts: Date.now() } })
    return { ok: true, pending: true }
  }
  const r = game.value.playerPass(seat)
  if (!r || !r.ok) return r || { ok: false, error: 'playerPass 失败' }
  if (isP2PMode.value) {
    net.broadcast({ type: 'PASS_COMMITTED', payload: { seat, source, commitId: actionId, actionId, ts: Date.now() } })
  }
  return r
}

  /**
   * ★ HCI-05 修复:"智能理牌"只选出推荐牌,不替用户出牌/过牌
   * 行为改为:用 AI 算当前局面最佳出牌,把对应列高亮选中,等用户点"出牌"确认。
   */
  function onAutoFindBest() {
    if (isDealing.value || phase.value !== 'playing' || myHand.value.length === 0) return
    haptics.click()
    onHintToggle(true)
  }
  function selectCardIds(ids) {
    selectedCardIds.value = new Set(ids)
  }

  function onSuitTab(suit) {
    if (suitFilter.value === suit) {
      suitFilter.value = null
      selectCardIds([])
      return
    }
    suitFilter.value = suit
    const next = {}
    for (const col of handColumns.value) {
      if (col.cards.some(c => c.suit === suit)) {
        next[columnKey(col)] = true
      }
    }
    const ids = []
    for (const col of handColumns.value) {
      if (next[columnKey(col)]) {
        for (const c of col.cards) ids.push(cardKey(c))
      }
    }
    selectCardIds(ids)
  }

  async function onHintToggle(show) {
    haptics.click()
    if (show) {
      // ★ V049-01 修复:onHintToggle 作用域内 diff 未定义,补齐
      const diff = gameDifficulty.value
      // 跟牌场景:用 AI.decide 找最小可压(autoPlayGrouped 贪最强,不看 lastPlay,会导致提示用炸弹)
      // 首家场景:lastPlay=null,继续用 autoPlayGrouped 领出
      const AI = await _loadAI()
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
        selectCardIds(hintCards.value)
      } else {
        hintCards.value = []
        mainActionsRef.value?.setShowing(false)
        if (!lastPlay.value && myHand.value.length > 0) {
          const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
          const minKey = cardKey(sorted[0])
          hintCards.value = [minKey]
          selectCardIds(hintCards.value)
        }
      }
    } else {
      hintCards.value = []
      selectCardIds([])
    }
  }

  function onAutoPlay() {
    if (hintCards.value.length === 0) { mainActionsRef.value?.setShowing(false); return }
    const cards = myHand.value.filter(c => hintCards.value.includes(cardKey(c)))
    if (cards.length === 0) { hintCards.value = []; return }
    // ★ BUG-003:走 commitPlay 统一广播
    const r = commitPlay(selfSeat.value, cards, 'auto')
    if (!r.ok) showToast(r.error || '出牌失败')
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
  }

  function onPlay() {
    const cards = selectedCardsFromIds()
    if (cards.length === 0) { haptics.error(); showToast('请先选牌'); return }
    // ★ BUG-003:走 commitPlay 统一广播 (保留本地 selected 重置)
    const r = commitPlay(selfSeat.value, cards, 'manual')
    if (!r.ok) { haptics.error(); showToast(r.error || '出牌失败'); return }
    haptics.action()
    const playedType = E.recognize(cards)
    if (playedType && (
      (playedType.type >= E.TYPE.BOMB_4 && playedType.type <= E.TYPE.BOMB_8) ||
      playedType.type === E.TYPE.KINGS_BOMB
    )) {
      haptics.impact('heavy')
    }
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    selectedCardIds.value = new Set()
    suitFilter.value = null
  }
  function onPass() {
    if (!lastPlay.value) { haptics.error(); showToast('首家不能过牌'); return }
    haptics.action()
    // ★ BUG-003:走 commitPass 统一广播
    const r = commitPass(selfSeat.value, 'manual')
    if (!r.ok) { showToast(r.error || '过牌失败'); return }
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
  }
  function onNext() {
    haptics.click()
    if (isP2PMode.value) {
      // ★ GD-RC-001 修复:下一局发牌由网络 host 负责(原 selfSeat===0 失效)
      if (isNetworkHost.value) {
        // ★ v0.4.14 对抗性审查 (V0412-06):phase='playing' 必须等真正进入新局
        //   才设,旧版开头先 phase.value='playing' 再判断 P2P 模式,P2P 非 host
        //   直接 return 但 phase 已被改,UI 提示文本从"本局结束"跳到"思考中"
        //   按钮状态混乱。修法:phase='playing' 移到 host 分支进入 initGame 之后
        pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
        currentDealId.value = String(pendingSeed)
        phase.value = 'playing'
        initGame({ isP2P: true, seed: pendingSeed })
        addTimer(() => {
          _broadcastPerSeatDeal()
        }, 500)
      }
      // P2P 非 host:什么都不做(等 host 广播 DEAL)
      // phase 保持 'finished',UI 仍是结算页,提示"等待房主开下一局"
      return
    }
    phase.value = 'playing'
    game.value.nextRound()
    myHand.value = E.sortHandGrouped(game.value.getState().hands[selfSeat.value].slice())
    selected.value = new Array(myHand.value.length).fill(false)
    selectedCardIds.value = new Set()
    startDealAnimation()
  }

  // ★ v0.4.9:过 A 后重开一局(逻辑接入 docs/restart-after-a-flow.md)
  //   AI/单机模式直接调 game.restartMatch;P2P 模式由 host 发起,广播 MATCH_RESTART
  // ★ V049-03 修复:host 重开时生成新 seed 并广播,避免复用旧 seed 导致牌局重复
  // ★ V0410-04 修复:抽出 afterMatchRestartRefresh() 统一 host / joiner / 单机 UI 重置
  //   旧版 P2P host 分支直接 return,没刷本机 UI refs → host 按钮/选择状态残留
  //   抽公共函数后三处调用统一:
  //     - 单机模式 onRestartMatch()
  //     - P2P host onRestartMatch()
  //     - P2P joiner onP2PMatchRestart()
  function _newRestartSeed() {
    // 高强度 seed:Date.now + 32 位 Math.random + 弱 entropy 来源
    return (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0
  }
  function afterMatchRestartRefresh() {
    if (!game.value || !game.value.getState) return
    const st = game.value.getState()
    // ★ V0410-04:统一刷 host/joiner/单机 共用的 UI refs
    //   之前 onRestartMatch 单机分支 + onP2PMatchRestart 都各自刷一遍,host 分支漏刷
    levelRank.value = st.levelRank
    if (Array.isArray(st.hands) && st.hands[selfSeat.value]) {
      myHand.value = E.sortHandGrouped(st.hands[selfSeat.value].slice())
      selected.value = new Array(myHand.value.length).fill(false)
      selectedCardIds.value = new Set()
    }
    phase.value = st.phase
    isRestartAfterA.value = false  // 消费掉,重置标志
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    // ★ Phase3 UI 修复:发牌动画由 game 的 'dealt' 事件统一触发(见 initGame 监听),
    //   这里再调 startDealAnimation() 会造成重开一局时动画被触发两次。
  }
  function onRestartMatch() {
    haptics.click()
    const newSeed = _newRestartSeed()
    // ★ P0-09:重开新一轮时生成新 matchInstanceId,清空上轮去重 ID
    matchInstanceId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    _lastAppliedRoundEndId = null
    if (isP2PMode.value) {
      // ★ V049-03 修复:P2P 模式下 host 广播新 seed + levelRank,
      //   joiner 收到后用同一 seed restartMatch 保证牌局一致
      // ★ V0410-04 修复:host 分支也刷本机 UI(原来直接 return 漏刷)
      if (isNetworkHost.value) {
        if (game.value && game.value.restartMatch) {
          currentDealId.value = String(newSeed)
          game.value.restartMatch({ levelRank: 15, seed: newSeed })
          // 广播 MATCH_RESTART 通知 joiner 进入等待,再逐座发新牌
          try {
            net.broadcast({
              type: 'MATCH_RESTART',
              payload: { levelRank: 15, seed: newSeed, restartId: `rr${Date.now()}`, matchInstanceId },
            })
          } catch (e) { /* 离线或非 host 时 noop */ }
          afterMatchRestartRefresh()
          addTimer(() => { _broadcastPerSeatDeal() }, 500)
        }
      }
      return
    }
    // AI/单机模式:直接调,带新 seed 让牌局每次都不同
    if (game.value && game.value.restartMatch) {
      game.value.restartMatch({ levelRank: 15, seed: newSeed })
    }
    afterMatchRestartRefresh()
  }

  // ★ v0.4.9:暴露主按钮动作分发(配合 GameView 按钮文案切换)
  function onPrimaryResultAction() {
    if (isRestartAfterA.value) {
      onRestartMatch()
    } else {
      onNext()
    }
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
    if (!payload) return
    // ★ Phase 2:DEAL 必须由当前 host 权威发出
    if (typeof net.isAuthorityMessage === 'function' && !net.isAuthorityMessage(msg)) return
    currentDealId.value = String(payload.dealId ?? payload.seed ?? Date.now())
    // ★ GD-RC-001 修复:网络 host 跳过(自己发的),用 isNetworkHost 判定
    if (isNetworkHost.value) return
    // ★ v0.4.13 对抗性审查 (P0-3):清理旧 game 实例,避免旧 scheduleAI 的 setTimeout
    //   在旧 game 已 GC 后仍被触发,或旧 handlers Map 残留的 listener 干扰新 game。
    //   触发场景:player 重连 / 重新进房 / host 重发 DEAL(换种子 / 重新开局)
    if (game.value && typeof game.value.destroy === 'function') {
      try { game.value.destroy() } catch (e) { /* swallow */ }
    }
    // 重置 UI phase ref,避免残留 'finished' 状态让中间窗口玩家以为对局结束
    phase.value = 'idle'
    finishedOrder.value = []
    tableCards.value = []
    lastPlay.value = null
    const dealFirstSeat = (typeof payload.firstSeat === 'number' && payload.firstSeat >= 0 && payload.firstSeat <= 3) ? payload.firstSeat : undefined

    // ★ Phase 2:新版 DEAL 携带 hands / handCounts,joiner 只应用自己的手牌
    if (Array.isArray(payload.hands) && payload.hands.length === 4 &&
        Array.isArray(payload.handCounts) && payload.handCounts.length === 4) {
      const seat = selfSeat.value
      if (!isValidSeat(seat)) return
      if (!Array.isArray(payload.hands[seat]) || payload.hands[seat].length !== 27) {
        console.warn('[P2P] DEAL rejected: invalid own hand for seat', seat)
        return
      }
      initGame({ isP2P: true, forcedLevelRank: payload.levelRank, firstSeat: dealFirstSeat })
      if (game.value) {
        try {
          game.value.deal(null, dealFirstSeat, { hands: payload.hands, handCounts: payload.handCounts })
        } catch (e) { console.warn('joiner deal apply err', e) }
      }
      return
    }

    // 旧版兼容:seed-only DEAL(不推荐,测试 / 旧端 fallback)
    if (payload.seed != null) {
      initGame({ isP2P: true, seed: payload.seed, forcedLevelRank: payload.levelRank, firstSeat: dealFirstSeat })
    }
  }
  // ★ Phase 2:host 逐座发送真实手牌,joiner 只收到自己的 27 张 + 四家张数
  function _broadcastPerSeatDeal() {
    if (!isNetworkHost.value || !game.value) return
    const st = game.value.getState()
    const counts = Array.isArray(st.handCounts) ? st.handCounts.slice() : st.hands.map(h => h.length)
    const firstSeat = st.firstPlayer
    const dealId = currentDealId.value
    const fullHands = st.hands
    for (let s = 1; s < 4; s++) {
      const hands = [[], [], [], []]
      if (Array.isArray(fullHands[s])) hands[s] = fullHands[s].slice()
      try {
        net.sendTo(s, {
          type: 'DEAL',
          payload: { hands, handCounts: counts, firstSeat, levelRank: st.levelRank, dealId, seed: null },
        })
      } catch (e) { console.warn('[P2P] broadcastPerSeatDeal seat', s, e) }
    }
  }

  // ★ Phase 2:PLAY/PASS 统一 actionId 去重(最近 2048 条)
  //   防御:WS 重传 / 多次 broadcast / 重连后回放 history 时,同一动作被收到多次。
  const _appliedActionIds = new Set()
  const _appliedActionIdsOrder = []  // FIFO 队列,用于淘汰最旧
  const _ACTION_DEDUP_MAX = 2048
  function _dedupActionId(actionId) {
    if (actionId == null) return false  // 无 id 不过滤(向下兼容老 broadcast)
    if (_appliedActionIds.has(actionId)) return true
    _appliedActionIds.add(actionId)
    _appliedActionIdsOrder.push(actionId)
    if (_appliedActionIdsOrder.length > _ACTION_DEDUP_MAX) {
      const old = _appliedActionIdsOrder.shift()
      _appliedActionIds.delete(old)
    }
    return false
  }
  // ★ P0-02:host 端按 playerUuid + clientActionId 去重 intent,防止恶意客户端复用旧 ID。
  const _processedClientIntents = new Set()
  const _processedClientIntentsOrder = []
  function _dedupClientIntent(seat, clientActionId) {
    if (clientActionId == null) return false
    const uuid = (() => { try { return net.getPeers()?.get(seat)?.uuid || net.getSelfInfo?.()?.uuid } catch { return null } })()
    const key = uuid ? `${uuid}:${clientActionId}` : `${seat}:${clientActionId}`
    if (_processedClientIntents.has(key)) return true
    _processedClientIntents.add(key)
    _processedClientIntentsOrder.push(key)
    if (_processedClientIntentsOrder.length > _ACTION_DEDUP_MAX) {
      const old = _processedClientIntentsOrder.shift()
      _processedClientIntents.delete(old)
    }
    return false
  }
  function _generateActionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
  // ★ P0-03 host 权威动作模型
  function _isHostAuthority(msg) {
    if (typeof net.isAuthorityMessage === 'function') return net.isAuthorityMessage(msg)
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    return msg && msg.from === hostSeat
  }

  function onP2PPlayIntent(payload, from, msg) {
    if (!payload || !game.value) return
    // 只有当前网络 host 处理 intent
    if (!isNetworkHost.value) return
    if (from !== payload.seat) return
    const clientActionId = payload.clientActionId ?? payload.actionId
    if (_dedupClientIntent(payload.seat, clientActionId)) return
    const st = game.value.getState()
    if (st.phase !== 'playing') return
    if (st.currentPlayer !== payload.seat) return
    if (!Array.isArray(payload.cards) || payload.cards.length === 0) return
    const r = game.value.playerPlay(payload.seat, payload.cards)
    if (r && r.ok) {
      // ★ P0-02:host 为每次权威提交生成新的 commitId,与 clientActionId 分离
      net.broadcast({ type: 'PLAY_COMMITTED', payload: { seat: payload.seat, cards: payload.cards, source: payload.source || 'manual', commitId: _generateActionId(), clientActionId, actionId: clientActionId, ts: payload.ts || Date.now() } })
    } else {
      net.sendTo(payload.seat, { type: 'PLAY_REJECTED', payload: { clientActionId, actionId: clientActionId, seat: payload.seat, error: r?.error || 'invalid_play' } })
    }
  }
  function onP2PPlayCommitted(payload, from, msg) {
    if (!payload || !game.value) return
    // 只接受当前 host 广播的 COMMITTED
    if (!_isHostAuthority(msg)) return
    // ★ P0-02:joiner 用 host 生成的 commitId 去重,不再受 clientActionId 复用影响
    if (_dedupActionId(payload.commitId ?? payload.actionId ?? payload.ts)) return
    try {
      game.value.applyPlay(payload.seat, payload.cards)
    } catch (e) { console.warn('applyPlay err', e) }
  }
  function onP2PPlayRejected(payload, from, msg) {
    if (!payload) return
    // ★ P1-12:只有 host 权威的拒绝才显示
    if (!_isHostAuthority(msg)) return
    if (payload.seat !== selfSeat.value) return
    showToast(payload.error || '出牌被 host 拒绝')
  }

  function onP2PPassIntent(payload, from, msg) {
    if (!payload || !game.value) return
    if (!isNetworkHost.value) return
    if (from !== payload.seat) return
    const clientActionId = payload.clientActionId ?? payload.actionId
    if (_dedupClientIntent(payload.seat, clientActionId)) return
    const st = game.value.getState()
    if (st.phase !== 'playing') return
    if (st.currentPlayer !== payload.seat) return
    if (!st.lastPlay) return
    const r = game.value.playerPass(payload.seat)
    if (r && r.ok) {
      net.broadcast({ type: 'PASS_COMMITTED', payload: { seat: payload.seat, source: payload.source || 'manual', commitId: _generateActionId(), clientActionId, actionId: clientActionId, ts: payload.ts || Date.now() } })
    } else {
      net.sendTo(payload.seat, { type: 'PASS_REJECTED', payload: { clientActionId, actionId: clientActionId, seat: payload.seat, error: r?.error || 'invalid_pass' } })
    }
  }
  function onP2PPassCommitted(payload, from, msg) {
    if (!payload || !game.value) return
    if (!_isHostAuthority(msg)) return
    if (_dedupActionId(payload.commitId ?? payload.actionId ?? payload.ts)) return
    try {
      game.value.applyPass(payload.seat)
    } catch (e) { console.warn('applyPass err', e) }
  }
  function onP2PPassRejected(payload, from, msg) {
    if (!payload) return
    // ★ P1-12:只有 host 权威的拒绝才显示
    if (!_isHostAuthority(msg)) return
    if (payload.seat !== selfSeat.value) return
    showToast(payload.error || '过牌被 host 拒绝')
  }
  // ★ 静态审查 BUG-A 修复:远端 ROUND_END 调 applyRoundEnd 时抑制再次广播
  // ★ v0.4.9:joiner 端 P2P MATCH_RESTART 处理器
  //   host 端 onRestartMatch 已经 broadcast MATCH_RESTART,joiner 端
  //   network._onTransportMessage 自动 emit('message:MATCH_RESTART')
  //   joiner 调 game.restartMatch 清状态 + 重新发牌 + 刷 UI
  //   防自循环:host 自己也 emit 了,但 onRestartMatch 用 isNetworkHost 判定
  //   只在 P2P 模式 broadcast,joiner 端不会重复 broadcast
  function onP2PMatchRestart(payload, from, msg) {
    if (!payload || !game.value) return
    // ★ Phase 2:sender authority 检查 — 只有当前权威 host 发出的 MATCH_RESTART 才被接受(epoch 校验)
    if (typeof net.isAuthorityMessage === 'function' && !net.isAuthorityMessage(msg)) return
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (typeof from !== 'number') return
    if (typeof from === 'number' && from !== hostSeat) return
    // ★ Phase 2:seed 必须存在且为安全整数,否则拒绝(避免多端洗牌不同)
    if (!Number.isSafeInteger(payload.seed)) {
      console.warn('[P2P] MATCH_RESTART rejected: invalid seed', payload.seed)
      return
    }
    // ★ Phase 2:restartId 必须是非空字符串
    if (typeof payload.restartId !== 'string' || payload.restartId === '') {
      console.warn('[P2P] MATCH_RESTART rejected: invalid restartId')
      return
    }
    // ★ V0410-03 修复:phase gate — 只有当前 phase=finished 且 isRestartAfterA=true
    //   才允许执行重开,防正常牌局中途收到旧 MATCH_RESTART 包被误清空
    try {
      const st0 = game.value.getState()
      if (st0.phase !== 'finished') return
      if (st0.isRestartAfterA !== true) return
    } catch (e) { return }
    // ★ V0410-03 修复:restartId 去重 — 同一 restartId 只应用一次,防重放攻击
    if (_appliedRestartIds.has(payload.restartId)) return
    _appliedRestartIds.add(payload.restartId)
    // ★ P0-09:同步 host 的 matchInstanceId,清空上轮 ROUND_END 去重
    matchInstanceId = payload.matchInstanceId || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    _lastAppliedRoundEndId = null
    const lr = (typeof payload.levelRank === 'number') ? payload.levelRank : 15
    // ★ Phase 2:joiner 不本地 restartMatch 发牌,而是重建 joiner 模式 game 等待 host 逐座 DEAL
    replaceGame(() => createGame({
      seats: 4,
      levelRank: lr,
      isHost: false,
      selfSeat: selfSeat.value,
      aiPlayers: [],
      seed: payload.seed,
      difficulty: gameDifficulty.value,
    }))
    // 重新挂载 game 事件监听
    initGame({ isP2P: true, seed: payload.seed, forcedLevelRank: lr, reuse: true })
    // 清空可能残留的 UI 状态,等待 DEAL 后由 game 'dealt' 事件驱动动画
    phase.value = 'idle'
    finishedOrder.value = []
    tableCards.value = []
    lastPlay.value = null
    myHand.value = []
    selected.value = []
    selectedCardIds.value = new Set()
    hintCards.value = []
    mainActionsRef.value?.setShowing(false)
    // V0410-04:统一刷公共 UI refs(兼容旧测试与后续字段扩展)
    afterMatchRestartRefresh()
  }
  // ★ V0410-03:restartId 去重集合(MATCH_RESTART 一次性应用)
  const _appliedRestartIds = new Set()
  // ★ v0.4.13 对抗性审查 (P1-2):ROUND_END roundId 去重 — 防止 host 重传时
  //   外层 UI 同步(refs 重复赋值 + stopTimer 重复调)产生抖动。
  //   内层 applyRoundEndFromPayload 已有 lastAppliedRoundId 去重,
  //   但外层 ref 同步不走内层 — 需要外层独立去重。
  let _lastAppliedRoundEndId = null

  // ★ GD-RC-003 修复:改用 applyRoundEndFromPayload 权威结算(不读本地 state)
  let suppressRoundEndBroadcast = false
  function onP2PRoundEnd(payload, from, msg) {
    if (!payload || !game.value) return
    // ★ P0-02:ROUND_END 只能由 host 权威发出(Phase 2 加 epoch 校验)
    if (typeof net.isAuthorityMessage === 'function' && !net.isAuthorityMessage(msg)) return
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hostSeat) return
    // roundId 去重:host 重传同一 ROUND_END 时跳过外层 UI 同步
    if (payload.roundId != null && _lastAppliedRoundEndId === payload.roundId) {
      return
    }
    suppressRoundEndBroadcast = true
    let applyResult = null
    try {
      // 优先用权威接口(接 host 完整 payload),fallback 旧 applyRoundEnd
      if (game.value.applyRoundEndFromPayload) {
        applyResult = game.value.applyRoundEndFromPayload({
          ranks: payload.ranks,
          levelUp: payload.levelUp,
          newLevelRank: payload.newLevelRank,
          roundId: payload.roundId,
          tribute: payload.tribute,
          teamLevels: payload.teamLevels,
          round: payload.round,
          isRestartAfterA: payload.isRestartAfterA,
          previousLevelRank: payload.previousLevelRank,
        })
      } else {
        game.value.applyRoundEnd()
        applyResult = { ok: true }
      }
    } catch (e) { console.warn('applyRoundEnd err', e) }
    finally {
      suppressRoundEndBroadcast = false
    }
    // ★ Phase 2:只有应用成功(且不是重复)才更新外层去重 ID,避免畸形包抢占 roundId
    if (!applyResult?.ok) {
      console.warn('[P2P] applyRoundEndFromPayload failed:', applyResult?.error)
      return
    }
    if (payload.roundId != null) _lastAppliedRoundEndId = payload.roundId
    finishedOrder.value = payload.ranks || []
    levelUp.value = payload.levelUp || 0
    if (payload.newLevelRank) {
      levelRank.value = payload.newLevelRank
      nextLevelLabel.value = RANK_LABEL[payload.newLevelRank]
    }
    // ★ v0.4.9:同步过 A 标志(host 权威)
    if (typeof payload.isRestartAfterA === 'boolean') {
      isRestartAfterA.value = payload.isRestartAfterA
    }
    phase.value = 'finished'
    stopTimer()
    // ★ P1-15:每个 joiner 客户端也保存自己的战绩(不再只由 host 写)
    if (isP2PMode.value && !isNetworkHost.value) {
      try {
        storage.addHistory({
          time: Date.now(),
          ranks: payload.ranks,
          levelUp: payload.levelUp || 0,
          levelRank: payload.newLevelRank,
          players: players.value.map(p => ({ name: p.name, avatar: p.avatar })),
          matchId: net.getRoomId ? net.getRoomId() : 'local',
          matchInstanceId: payload.matchInstanceId || matchInstanceId,
          roundId: payload.round,
          mySeat: selfSeat.value,
          myPlayerId: (() => { try { return net.getSelfInfo?.()?.uuid || selfSeat.value } catch { return selfSeat.value } })(),
        })
      } catch (e) { console.warn('[P2P] joiner save history failed', e) }
    }
  }
  // ★ GD-RC-005 修复:snapshot 接收端用 targetSeat 判定(原 seat: 0 语义混乱)
  //   host 定向 sendTo(connSeat, { type: 'STATE_SNAPSHOT', targetSeat, snapshot })
  //   joiner 收到后判断 targetSeat === selfSeat 才应用,避免非目标 joiner 也被覆盖
  function onP2PStateSnapshot(payload, from, msg) {
    if (!payload || !game.value || !payload.snapshot) return
    // ★ P0-02:STATE_SNAPSHOT 只能由 host 权威发出(Phase 2 加 epoch 校验)
    if (typeof net.isAuthorityMessage === 'function' && !net.isAuthorityMessage(msg)) return
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (from !== hostSeat) return
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
      // ★ v0.4.13 对抗性审查 (P0-4):applySnapshot 后统一调 refreshUiFromGameState(),
      //   删掉之前手写的 15 行 UI 同步块。refreshUiFromGameState 是单一来源,
      //   后续加新字段(比如 isRestartAfterA / hostMigrationToast)只改一处。
      //   旧版本 GD-RC-004 修过 _applySnapshot 后必须同步 UI refs,但实现是手写的,
      //   跟 onHostMigrated / ROUND_END 路径的 UI 同步代码重复,容易遗漏。
      if (game.value.applySnapshot) {
        game.value.applySnapshot(payload.snapshot)
      } else if (game.value._applySnapshot) {
        game.value._applySnapshot(payload.snapshot)
      } else {
        // 极端 fallback(旧版 game 没有 applySnapshot 接口):用 refreshUiFromGameState
        // 拿当前本地 state,但 snapshot 里的 levelRank / hands 仍要应用
        const snap = payload.snapshot
        if (snap.levelRank != null) {
          levelRank.value = snap.levelRank
          nextLevelLabel.value = RANK_LABEL[snap.levelRank]
        }
        if (Array.isArray(snap.hands) && snap.hands[selfSeat.value]) {
          myHand.value = E.sortHandGrouped(snap.hands[selfSeat.value].slice())
          selected.value = new Array(myHand.value.length).fill(false)
          selectedCardIds.value = new Set()
        }
      }
      refreshUiFromGameState()
    } catch (e) { console.warn('applyStateSnapshot err', e) }
  }

  // v0.4.8 N-2:joiner 加入时 host 端的反向操作 — 从 aiPlayers 移除 seat
  //   对称于 onP2PAITakeover(掉线/AI 接管时加 aiPlayers,真玩家进入时移除)
  // ★ v0.4.13 对抗性审查 (P1-3):删掉手写的 players.value 更新,
  //   统一走 applyNetworkPlayers() 从 net.getPeers() 拿权威数据,避免双路径更新
  //   产生 race(可能 UI 闪一下从 AI 名字切到真人名字)。
  function onP2PPeerJoin(payload) {
    if (!payload || typeof payload.seat !== 'number') return
    if (!isNetworkHost.value) return  // 只有 host 端维护 aiPlayers
    if (!game.value) return
    // 从 game.aiPlayers 移除
    if (typeof game.value.removeAIPlayer === 'function') {
      game.value.removeAIPlayer(payload.seat)
    }
    // 委托 applyNetworkPlayers 从 net.getPeers() 单一来源更新 UI
    applyNetworkPlayers()
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

  function onP2PAITakeover(payload, from, msg) {
    if (!payload || !game.value) return
    // ★ P0-02:网络 AI_TAKEOVER 消息只能由 host 权威发出(Phase 2 加 epoch 校验);
    //   本地 'ai:takeover' 事件不携带 from,允许通过。
    if (typeof from === 'number' && typeof net.isAuthorityMessage === 'function' && !net.isAuthorityMessage(msg)) return
    const hostSeat = (() => { try { return net.getHostSeat ? net.getHostSeat() : 0 } catch { return 0 } })()
    if (typeof from === 'number' && from !== hostSeat) return
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
      // ★ Phase3 UI 修复:500ms 后再读 state,避免 setTimeout 外读取的 st 过期
      //   (期间可能已有其他玩家出牌/过牌,currentPlayer / hand / lastPlay 都已变)。
      addTimer(async () => {
        if (!game.value) return
        const st = game.value.getState()
        if (st.phase !== 'playing' || st.currentPlayer !== seat) return
        const hand = st.hands[seat]
        if (hand && hand.length > 0) {
          const ctx = {
            isTeammateLast: st.lastPlay && ((st.lastPlay.who + 2) % 4 === seat),
            mySeatIndex: seat,
            teammateSeatIndex: (seat + 2) % 4,
          }
          // v0.4.23:AI 动态导入,避免进入主 chunk
          const AI = await _loadAI()
          const r = AI.decide(hand, st.lastPlay, st.levelRank, ctx, st.difficulty || 'medium')
          // ★ BUG-003:AI 接管出牌走 commitPlay 统一广播
          if (r.type === 'play') {
            commitPlay(seat, r.cards, 'ai')
          } else {
            commitPass(seat, 'ai')
          }
        }
      }, 500)
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

  // ★ LOGIC-04 修复:host 端响应 joiner 的 STATE_REQUEST,发送权威 snapshot
  function onStateRequest(payload, from) {
    if (!isNetworkHost.value) return
    if (!game.value || !game.value.getState) return
    if (!payload) return
    // 可选:校验 dealId 匹配,避免应用旧局快照
    const reqDealId = payload.dealId
    if (reqDealId != null && reqDealId !== currentDealId.value) {
      // dealId 不匹配也发当前快照(可能是新请求到达前已换局)
    }
    try {
      const snap = (typeof game.value.getSnapshot === 'function')
        ? game.value.getSnapshot(from)
        : game.value.getState()
      net.sendTo && net.sendTo(from, {
        type: 'STATE_SNAPSHOT',
        payload: { targetSeat: from, snapshot: snap },
      })
    } catch (e) { console.warn('STATE_REQUEST response failed', e) }
  }

  // ===== 生命周期 =====
  onMounted(() => {
    selfSeat.value = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
    // ★ P2-01:selfSeat 非法时进入等待同步,避免 players[-1]
    if (!isValidSeat(selfSeat.value)) {
      phase.value = 'waiting_sync'
    } else {
      players.value[selfSeat.value].name = storage.getNickname() || '我'
      players.value[selfSeat.value].avatar = storage.getAvatar() || '🀄'
    }
    applyNetworkPlayers()
    applySettingsToAudio()
    onNet('message:NICK_UPDATE', onRemoteNickUpdate)

    // ★ P0-05 修复:显式 P2P 模式不应被瞬时 peer 数量覆盖。
    //   路由已带 role=host/joiner 或 host=...,opts.isP2PMode 是权威来源;
    //   peers.size 可能因 SYNC 未到/重连/迁移而暂时 <2,不能据此降级为单机模式。
    try {
      const explicitP2P = opts.isP2PMode === true
      if (explicitP2P) {
        isP2PMode.value = true
      } else {
        isP2PMode.value =
          (net.isConnected && net.isConnected()) === true ||
          (net.isHost && net.isHost()) === true ||
          (net.getRoomId && !!net.getRoomId())
      }
    } catch { isP2PMode.value = false }
    if (isP2PMode.value) {
      onNet('message:DEAL', onP2PDeal)
      // ★ P0-03 host 权威动作模型
      onNet('message:PLAY_INTENT', onP2PPlayIntent)
      onNet('message:PLAY_COMMITTED', onP2PPlayCommitted)
      onNet('message:PLAY_REJECTED', onP2PPlayRejected)
      onNet('message:PASS_INTENT', onP2PPassIntent)
      onNet('message:PASS_COMMITTED', onP2PPassCommitted)
      onNet('message:PASS_REJECTED', onP2PPassRejected)
      onNet('message:ROUND_END', onP2PRoundEnd)
      // ★ v0.4.9:P2P 联机 host 发"重开一局"广播
      onNet('message:MATCH_RESTART', onP2PMatchRestart)
      onNet('message:STATE_SNAPSHOT', onP2PStateSnapshot)
      onNet('message:AI_TAKEOVER', onP2PAITakeover)
      // ★ 静态审查 BUG-C 修复:host 端心跳超时只本地 emit 'ai:takeover' + 广播
      //   AI_TAKEOVER,但游戏层之前只监听 'message:AI_TAKEOVER'(即远端消息),
      //   host 自己不监听本地 'ai:takeover' 事件 → host 端不会进入
      //   onP2PAITakeover(),掉线玩家轮到出牌时 host 不会让 AI 接管 → 牌局卡住
      //   修法:同时监听本地 'ai:takeover' 事件
      onNet('ai:takeover', onP2PAITakeover)
      onNet('message:STATE_REQUEST', onStateRequest)
      onNet('host:migrated', onHostMigrated)
      // ★ v0.4.17 对抗性审查 (V0416-04):joiner 端监听 'host:lost' — host 崩溃/断电
      //   业务事件(V0416-04 修复:网络层 _DISCONNECT payload.seat=-1 自动 emit),
      //   joiner 端明确提示"房主已断开,请重新开房"+ 跳回首页,不再静默卡住。
      //   实际 router.push 在 GameView / GameViewDesktop 组件层做(本 composable 不用 router)
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
          addTimer(() => {
            if (!game.value) return
            const snap = (typeof game.value.getSnapshot === 'function')
              ? game.value.getSnapshot(connSeat)
              : game.value.getState()
            // 定向:用 sendTo + targetSeat 标记接收方,接收端判断 target 决定是否应用
            try {
              net.sendTo && net.sendTo(connSeat, {
                type: 'STATE_SNAPSHOT',
                payload: { targetSeat: connSeat, snapshot: snap },
              })
            } catch (e) { /* fallback to broadcast if sendTo not available */ }
          }, 200)
        }
        onNet('connect', onConnectSnapshot)
      }
      if (isNetworkHost.value) {
        pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
        currentDealId.value = String(pendingSeed)
        initGame({ isP2P: true, seed: pendingSeed })
        addTimer(() => {
          _broadcastPerSeatDeal()
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
    // ★ Phase3 UI 修复:批量清理所有 setTimeout timer,防止组件卸载后闭包仍执行。
    // ★ P2-06:timers 是 Set,遍历清理。
    for (const id of timers) {
      try { clearTimeout(id) } catch (e) {}
    }
    timers.clear()
    if (nickToastTimer) clearTimeout(nickToastTimer)
    if (chatPhraseTimer) clearTimeout(chatPhraseTimer)
    // ★ P1-14/P2-07:组件卸载时销毁 game 实例,防止旧 scheduleAI / listener 泄漏
    if (game.value && typeof game.value.destroy === 'function') {
      try { game.value.destroy() } catch (e) {}
    }
    game.value = null
  })

  // ★ LOGIC-04 / LOGIC-12 修复:统一替换 game 实例,先清理旧实例
  function replaceGame(createFn) {
    clearDealTimeout()
    if (game.value && typeof game.value.destroy === 'function') {
      try { game.value.destroy() } catch (e) {}
    }
    game.value = createFn()
  }

  // ★ LOGIC-04 修复:发牌超时重试不再本地 fork
  function retryDeal() {
    haptics.click()
    dealTimeout.value = false
    if (isP2PMode.value) {
      if (isNetworkHost.value) {
        // host:重发当前各座真实手牌,让 joiner 重新进入当前局
        _broadcastPerSeatDeal()
      } else {
        // joiner:向 host 请求权威 state,不本地重新发牌
        try {
          net.send({ type: 'STATE_REQUEST', payload: { reason: 'deal_timeout', dealId: currentDealId.value, seat: selfSeat.value } })
        } catch (e) { console.warn('STATE_REQUEST failed', e) }
      }
      return
    }
    // 单机 / AI 模式:销毁旧实例后重新发牌
    replaceGame(() => createGame({
      seats: 4,
      levelRank: levelRank.value,
      aiPlayers,
      seed: _newRestartSeed(),
      difficulty: gameDifficulty.value,
    }))
    initGame({ reuse: true })
  }


  // ===== 导出(组件层需要的全部 reactive / computed / methods) =====
  return {
    // state
    round, levelRank, levelLabel, nextLevelLabel, levelUp, multiplier,
    players, myHand, selected, selectedCardIds, selectedColKeys, tableCards, lastPlay,
    phase, currentPlayer, firstPlayer, turnTimeLeft, finishedOrder, game,
    isDealing, dealProgress, hintCards, bombFx, floatingPasses, playedHistory,
    suitFilter, isShaking, lastCardCounts, showNickToast, showChatPanel,
    chatPhraseToast, hostMigrationToast, hostMigrationBadge, urgent,
    isRestartAfterA,  // ★ v0.4.9:过 A 标志
    isP2PMode, selfSeat, isNetworkHost,
    // computed
    myTurn, currentPlayerName, firstPlayerName, firstPlayerEmoji, tipText,
    seatData, handColumns, selectedCount,
    // methods
    showNickToastBrief, onNickEditRequest, onChatSelect, onHostMigrated, refreshUiFromGameState,
    retryDeal,
    playerName, formatCoins, cardKey, handCardKey, isHinted, isLevel, rankColor,
    isWinningSeat,
    columnKey, colMinHeight, colRankLabel, toggleCol, toggleCard, toggleCardId, isCardSelected, onClear,
    selectedCardsFromIds, selectedCardsFromColumns, onSortHand, onAutoFindBest, onSuitTab,
    onHintToggle, onAutoPlay, onPlay, onPass, onNext, onChat, onSeatClick,
    onIcon, showMenu, initGame, startDealAnimation, applyNetworkPlayers,
    // v0.4.8 N-2:AI 补位辅助函数(测试 / 外部 trigger 用)
    _fillEmptySeatsWithAI,
    // ★ Phase4 测试:暴露 P2P handler 入口供回归测试
    onP2PPlayIntent, onP2PPlayCommitted, onP2PPlayRejected,
    onP2PPassIntent, onP2PPassCommitted, onP2PPassRejected,
    onP2PRoundEnd, onP2PStateSnapshot, onP2PAITakeover,
    onRemoteNickUpdate, applySettingsToAudio, finishDeal,
    // ★ BUG-003:统一出牌/过牌入口 — 组件层也能直接调,带自动广播
    commitPlay, commitPass,
    // ★ v0.4.9:过 A 后重开
    onRestartMatch, onPrimaryResultAction,
    // ★ Phase4 测试:暴露 timers / showBombFx 供回归测试验证生命周期清理与特效
    __timers: timers,
    __showBombFx: showBombFx,
  }
}
