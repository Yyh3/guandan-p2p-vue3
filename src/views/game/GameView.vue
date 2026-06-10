<template>
  <div class="page" :class="{ dealing: isDealing, bomb: isShaking }">
    <!-- 背景:渐变蓝紫底色 -->
    <div class="bg-deep"></div>

    <!-- 顶部 HUD -->
    <HudTop
      :level-label="levelLabel"
      :multiplier="multiplier"
      :seats="seatData"
      :show-clock="myTurn && !isDealing"
      :turn-seconds="turnTimeLeft"
      :is-my-turn="myTurn"
      :tip-text="tipText"
      :is-dealing="isDealing"
      :phase="phase"
      :allow-edit="false"
      @menu="showMenu"
      @seatClick="onSeatClick"
      @icon="onIcon"
      @editRequest="onNickEditRequest"
    />

    <!-- 中央牌桌 -->
    <TableCenter
      :table-cards="tableCards"
      :first-player-name="firstPlayerName"
      :first-player-emoji="firstPlayerEmoji"
      :is-level="isLevel"
      :is-dealing="isDealing"
      :level-label="levelLabel"
      :round="round"
      :multiplier="multiplier"
    />

    <!-- 特效层(覆盖全屏) -->
    <EffectLayer
      :bomb-fx="bombFx"
      :shaking="isShaking"
      :floating-texts="floatingPasses"
    />

    <!-- 玩家手牌(底部):按 rank 分组竖叠 -->
    <div class="hand-area" :class="{ disabled: !myTurn || isDealing, 'is-urgent': urgent }">
      <div class="hand-inner">
        <div
          v-for="col in handColumns"
          :key="columnKey(col)"
          class="hand-column"
          :class="[
            { 'is-selected': selectedColKeys[columnKey(col)] },
            col.isJoker ? 'is-joker' : (isLevel({ suit: 0, rank: col.rank }) ? 'is-level' : '')
          ]"
          :style="{ minHeight: colMinHeight(col) + 'px' }"
          @click="toggleCol(col)"
        >
          <!-- v3.6:列顶 rank 数字标签(7/9/10/K/2/王)-->
          <div
            class="col-rank"
            :class="{ 'is-level-rank': !col.isJoker && isLevel({ suit: 0, rank: col.rank }) }"
          >{{ colRankLabel(col) }}</div>
          <!-- v3-3:列底 ×N 小气泡,强化"一列一列"概念 -->
          <div class="col-count">×{{ col.cards.length }}</div>
          <div
            v-for="(c, i) in col.cards"
            :key="cardKey(c)"
            class="hand-card"
            :style="{ zIndex: i + 1, top: (i * -20) + 'px' }"
          >
            <CardPlay
              :card="c"
              :is-level="isLevel(c)"
              :selected="!!selectedColKeys[columnKey(col)]"
              :hinted="isHinted(c)"
              size="md"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 牌型快速选择(顶部花色按钮, 浮在手牌上方) -->
    <div v-if="myTurn && !isDealing" class="suit-tabs">
      <button
        v-for="s in [0, 3, 2, 1]"
        :key="s"
        class="suit-tab"
        :class="['suit-' + s, { active: suitFilter === s }]"
        @click="onSuitTab(s)"
      >{{ ['♠', '♦', '♣', '♥'][s] }}</button>
    </div>

    <!-- 右下角圆形按钮(理牌 / 一键理 / 聊天) -->
    <QuickActions
      v-if="myTurn && !isDealing"
      @sort="onSortHand"
      @autoFind="onAutoFindBest"
      @chat="onChat"
    />

    <!-- 底部主操作栏 -->
    <div v-if="myTurn && !isDealing" class="action-bar-wrap">
      <!-- v3.6:智能理牌显眼前置按钮(挂到 MainActions 的 smart-sort 插槽) -->
      <MainActions
        ref="mainActionsRef"
        :visible="true"
        :disabled="isDealing"
        :hint-count="hintCards.length"
        :can-pass="!!lastPlay"
        :can-play="selectedCount > 0"
        @pass="onPass"
        @play="onPlay"
        @hintToggle="onHintToggle"
        @autoPlay="onAutoPlay"
      >
        <template #smart-sort>
          <div class="auto-find-pill">
            <button
              class="auto-find-btn"
              :disabled="isDealing || myHand.length === 0"
              @click="onAutoFindBest"
              title="智能理牌 · 自动凑炸弹/顺子/三带二"
            >
              <span class="sparkle">✨</span>智能理牌
            </button>
          </div>
        </template>
      </MainActions>
      <div class="action-bar-sub">
        <button class="sub-btn" @click="onClear">🗑 清空</button>
      </div>
    </div>

    <!-- 结算遮罩 -->
    <div v-if="phase === 'finished'" class="result-mask" @click.self="onNext">
      <div class="result-card">
        <h2 class="result-title">本局结束</h2>
        <p class="result-meta">升 {{ levelUp }} 级 → 下一局打 {{ nextLevelLabel }}</p>
        <div class="result-list">
          <div
            v-for="(seat, i) in finishedOrder"
            :key="i"
            class="result-row"
            :class="rankColor(i)"
          >
            <span class="result-rank">{{ ['头游', '二游', '三游', '末游'][i] }}</span>
            <span class="result-name">{{ playerName(seat) }}</span>
            <span class="result-team">{{ i < 2 ? '🏆 胜方' : '💀 负方' }}</span>
          </div>
        </div>
        <div class="result-actions">
          <button class="r-btn ghost" @click="onBack">退出</button>
          <button class="r-btn primary" @click="onNext">下一局</button>
        </div>
      </div>
    </div>

    <!-- v3.7:对局中禁改名 toast(点自座位 ✎ 时弹出) -->
    <transition name="toast">
      <div v-if="showNickToast" class="nick-toast" role="status" aria-live="polite">
        对局中不能改名,请到首页或房间页修改
      </div>
    </transition>

    <!-- v3.7 P1:聊天快捷短语弹层(点 💬 时弹出) -->
    <ChatQuickPanel
      :visible="showChatPanel"
      @close="showChatPanel = false"
      @select="onChatSelect"
    />

    <!-- v3.7 P1:聊天短语 toast(选中后显示 2s) -->
    <transition name="toast">
      <div v-if="chatPhraseToast" class="nick-toast" role="status" aria-live="polite">
        💬 {{ chatPhraseToast }}
      </div>
    </transition>

    <!-- v3.7:NicknameEditor(本轮禁改名,showNickEditor 永远 false;保留挂载点便于将来放开) -->
    <NicknameEditor
      v-if="false"
      @close="() => {}"
      @confirmed="(p) => { storage.setNickname(p.nickname); storage.setAvatar(p.avatar); const selfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })(); players.value[selfSeat].name = p.nickname; players.value[selfSeat].avatar = p.avatar; net.broadcast({ type: 'NICK_UPDATE', payload: p }) }"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import { createGame } from '@/common/guandan-game.js'
import * as E from '@/common/guandan-engine.js'
import AI from '@/common/guandan-ai.js'
import dealAnim from '@/common/deal-animation.js'
import audio from '@/common/audio.js'
import { bombFxForType, floatingPosition } from '@/common/effects.js'

import HudTop from '@/components/HudTop.vue'
import TableCenter from '@/components/TableCenter.vue'
import EffectLayer from '@/components/EffectLayer.vue'
import MainActions from '@/components/MainActions.vue'
import QuickActions from '@/components/QuickActions.vue'
import CardPlay from '@/components/CardPlay.vue'
import NicknameEditor from '@/components/NicknameEditor.vue'
import ChatQuickPanel from '@/components/ChatQuickPanel.vue'
import net from '@/common/network.js'

// 引入 tokens(全局变量)
import '@/styles/tokens.css'

const route = useRoute()
const router = useRouter()
const RANK_LABEL = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }

const roomNo = ref(route.query.roomNo || '------')
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
const selected = ref([])  // 旧:按手牌 index 选;保留为长度兜底,但 v3-2 改用 selectedColKeys
const selectedColKeys = ref({})  // 新:按列 key 选(v3-2 竖叠)
const tableCards = ref([])
const lastPlay = ref(null)
const phase = ref('idle')
const currentPlayer = ref(0)
const firstPlayer = ref(0)
const turnTimeLeft = ref(30)
const finishedOrder = ref([])
const levelUpInfo = ref(null)
const game = ref(null)
const aiPlayers = [1, 2, 3]

// v3 状态
const isDealing = ref(false)
const hintCards = ref([])
const playHintRef = ref(null)
const mainActionsRef = ref(null)
const bombFx = ref(null)
const floatingPasses = ref([])
const playedHistory = ref([])
const suitFilter = ref(null)
const isShaking = ref(false)

// v3.7:报数 tick — 跟踪每个玩家上一轮牌数(用于触发 sfxCountdownTick/Warn)
const lastCardCounts = ref([27, 27, 27, 27])

// v3.7:对局中禁改名 — 弹 toast 提示
const showNickToast = ref(false)
let nickToastTimer = null
function showNickToastBrief() {
  showNickToast.value = true
  if (nickToastTimer) clearTimeout(nickToastTimer)
  nickToastTimer = setTimeout(() => { showNickToast.value = false }, 2000)
}
function onNickEditRequest() {
  // v3.7:本轮对局中禁止改名,弹 toast
  showNickToastBrief()
}

// v3.7 P1:聊天弹层 + 选中后 2s toast
const showChatPanel = ref(false)
const chatPhraseToast = ref('')
let chatPhraseTimer = null
function onChatSelect({ phrase }) {
  // v3.7 P1:仅本地 toast,留 v2.0 P2P 接口
  chatPhraseToast.value = phrase
  if (chatPhraseTimer) clearTimeout(chatPhraseTimer)
  chatPhraseTimer = setTimeout(() => { chatPhraseToast.value = '' }, 2000)
  // v2.0:此处接 net.broadcast({ type: 'CHAT_QUICK', payload: { phrase, from: 0 } })
}

// v3.7 P1:紧急蜂鸣 + 手牌区闪红(turnTimeLeft <= 5 && myTurn)
const urgent = ref(false)
let lastUrgentBeepAt = 0
const URGENT_BEEP_COOLDOWN_MS = 1000

// v3.7:NICK_UPDATE 远程同步(从 net 接收到广播)
function onRemoteNickUpdate(payload, from) {
  if (!payload || from == null || from < 0 || from > 3) return
  // 更新 seatData 里对应玩家
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

// 计算属性
// ★ v3.8 P1 修复:4-tab 联机 myTurn 要按 selfSeat 判断(host=0,joiner=1/2/3)
const myTurn = computed(() => {
  const selfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
  return currentPlayer.value === selfSeat && phase.value === 'playing' && !isDealing.value
})
const currentPlayerName = computed(() =>
  players.value[currentPlayer.value]?.name || `玩家${currentPlayer.value}`
)
const firstPlayerName = computed(() =>
  players.value[firstPlayer.value]?.name || `玩家${firstPlayer.value}`
)
// v3.6: 首家 emoji 头像(给 TableCenter 的 .first-tip 用)
const firstPlayerEmoji = computed(() =>
  players.value[firstPlayer.value]?.avatar || '🤖'
)
const tipText = computed(() => {
  if (phase.value === 'finished') return '本局结束'
  if (isDealing.value) return '发牌中...'
  return `${currentPlayerName.value} 思考中`
})

// 4 玩家座位数据(给 HudTop 用,严格 上=队友/下=自己/左=对手/右=对手)
// v3.7:每个座位附带 showCount(cardCount <= 10) + isUrgent(cardCount > 0 && <= 5)
function _seatShowCount(c) {
  if (c <= 0) return true  // 已出完
  return c <= 10
}
function _seatIsUrgent(c) {
  return c > 0 && c <= 5
}
const seatData = computed(() => {
  const st = game.value?.getState()
  const result = {}
  // ★ v3.8 P1 修复:4-tab 联机时,每个 tab 按 selfSeat 旋转 seat 视图
  // 之前硬编码 seat 0=自己,只对 host 正确,joiner 看自己是 AI-西 等
  // 2v2 掼蛋:队友永远在正上方(self + 2) mod 4
  const selfSeat = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
  const tmSeat = (selfSeat + 2) % 4
  const leftSeat = (selfSeat + 3) % 4
  const rightSeat = (selfSeat + 1) % 4
  // 上 = 队友
  const t = players.value[tmSeat] || players.value[2]
  const tCount = st ? (st.finishedOrder.includes(tmSeat) ? 0 : st.hands[tmSeat]?.length ?? 27) : 27
  result.top = {
    role: 'teammate',
    name: t.name,
    avatar: t.avatar,
    coins: t.coins,
    level: t.level,
    cardCount: tCount,
    isTurn: currentPlayer.value === tmSeat && phase.value === 'playing',
    isDone: st?.finishedOrder.includes(tmSeat) ?? false,
    showCount: _seatShowCount(tCount),
    isUrgent: _seatIsUrgent(tCount),
  }
  // 下 = 自己
  const me = players.value[selfSeat] || players.value[0]
  const meCount = myHand.value.length
  result.bottom = {
    role: 'self',
    name: me.name,
    avatar: me.avatar,
    coins: me.coins,
    level: me.level,
    cardCount: meCount,
    isTurn: currentPlayer.value === selfSeat && phase.value === 'playing',
    isDone: st?.finishedOrder.includes(selfSeat) ?? false,
    showCount: _seatShowCount(meCount),
    isUrgent: _seatIsUrgent(meCount),
  }
  // 左 = (selfSeat + 3) % 4
  const l = players.value[leftSeat] || players.value[1]
  const lCount = st ? (st.finishedOrder.includes(leftSeat) ? 0 : st.hands[leftSeat]?.length ?? 27) : 27
  result.left = {
    role: 'opponent',
    name: l.name,
    avatar: l.avatar,
    coins: l.coins,
    level: l.level,
    cardCount: lCount,
    isTurn: currentPlayer.value === leftSeat && phase.value === 'playing',
    isDone: st?.finishedOrder.includes(leftSeat) ?? false,
    showCount: _seatShowCount(lCount),
    isUrgent: _seatIsUrgent(lCount),
  }
  // 右 = (selfSeat + 1) % 4
  const r = players.value[rightSeat] || players.value[3]
  const rCount = st ? (st.finishedOrder.includes(rightSeat) ? 0 : st.hands[rightSeat]?.length ?? 27) : 27
  result.right = {
    role: 'opponent',
    name: r.name,
    avatar: r.avatar,
    coins: r.coins,
    level: r.level,
    cardCount: rCount,
    isTurn: currentPlayer.value === rightSeat && phase.value === 'playing',
    isDone: st?.finishedOrder.includes(rightSeat) ?? false,
    showCount: _seatShowCount(rCount),
    isUrgent: _seatIsUrgent(rCount),
  }
  return result
})

// 工具函数
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
// v3.7:column min-height 根据牌数动态计算,让 N 张竖叠牌(N>2)不被 hand-area 顶边裁掉
// 公式:84(单张牌高) + (N-1) * 20(竖叠偏移) + 12(底/顶 padding + col-count 留位)
function colMinHeight(col) {
  const n = col.cards.length
  return 96 + Math.max(0, n - 1) * 20
}

// v3.6:列顶 rank 数字标签(7/9/10/K/2/王)
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
// v3-2:统计已选列数
const selectedCount = computed(() => Object.values(selectedColKeys.value).filter(Boolean).length)

// 计时器
function startTimer() {
  stopTimer()
  turnTimeLeft.value = 30
  urgent.value = false  // 初始非紧急
  timer = setInterval(() => {
    turnTimeLeft.value--
    // v3.7 P1:紧急蜂鸣 + 手牌区闪红(turnTimeLeft <= 5 && myTurn)
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
          // 自动出最小单张
          const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
          game.value.playerPlay(0, [sorted[0]])
        } else {
          game.value.playerPass(0)
        }
      }
    }
  }, 1000)
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
  urgent.value = false
}

// 发牌动画
function computeDealTargets() {
  const w = window.innerWidth
  const h = window.innerHeight
  return [
    { x: w / 2, y: h - 80 },   // 0: 自己
    { x: 50, y: 200 },          // 1: 左
    { x: w / 2, y: 110 },       // 2: 上(队友)
    { x: w - 50, y: 200 },      // 3: 右
  ]
}

function applySettingsToAudio() {
  const s = storage.getSettings()
  audio.setBgmEnabled(!!s.bgmEnabled)
  audio.setSfxEnabled(!!s.sfxEnabled)
  audio.setBgmVolume(Number(s.bgmVolume ?? 0.5))
  audio.setSfxVolume(Number(s.sfxVolume ?? 0.7))
}

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

  nextTick(() => {
    const container = document.querySelector('.page')
    if (!container) { isDealing.value = false; finishDeal(); return }
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const targets = computeDealTargets()
    dealAnim.start({
      container, center, targets,
      cardsPerSeat: 27, stagger: 55, flightDuration: 380,
      onComplete: () => { isDealing.value = false; finishDeal() },
    })
  })
}

function finishDeal() {
  myHand.value = E.sortHandGrouped(game.value.getState().hands[0].slice())
  selected.value = new Array(myHand.value.length).fill(false)
  selectedColKeys.value = {}
  phase.value = 'playing'
  startTimer()
}

// 飘字
function showFloatingPass(seat, kind = 'pass') {
  passFloatId++
  const id = passFloatId
  const pos = floatingPosition(seat)
  const text = kind === 'skip' ? '过牌' : '不出'
  floatingPasses.value.push({
    id,
    kind,
    text,
    style: { left: pos.left, top: pos.top },
  })
  setTimeout(() => {
    floatingPasses.value = floatingPasses.value.filter(f => f.id !== id)
  }, 1200)
}

// 炸弹/王炸特效
function showBombFx(type) {
  const fx = bombFxForType(type)
  if (!fx) return
  bombFx.value = fx
  isShaking.value = true
  setTimeout(() => { bombFx.value = null }, 1500)
  setTimeout(() => { isShaking.value = false }, 800)
}

function initGame(opts = {}) {
  // ★ v3.8 P1:4-tab 联机模式
  // - opts.isP2P: 网络联机(由 host/joiner 决定)
  // - opts.seed: 确定性发牌用(joiner 收到 host 广播的 DEAL 后会传 seed)
  // - opts.forcedLevelRank: joiner 用 host 广播的 levelRank,确保 4 tab 一致
  // - P2P 模式下 4 个都是真人,aiPlayers 传空(跳过 AI 调度)
  const isP2P = opts.isP2P === true
  const seed = opts.seed
  const me = isP2P ? (selfSeat.value || 0) : 0
  if (opts.forcedLevelRank != null) levelRank.value = opts.forcedLevelRank
  game.value = createGame({
    seats: 4,
    levelRank: levelRank.value,
    isHost: !isP2P || me === 0,  // P2P 模式只有 host 算 isHost;单机模式 seat 0 算 host
    aiPlayers: isP2P ? [] : aiPlayers,  // P2P 模式不调度 AI
    seed: seed,  // v3.8 P1:确定性发牌
  })
  // ★ v3.8 P1:联机模式让 AI 出的牌广播给其他 tab
  if (isP2P && game.value.setAIBroadcast) {
    game.value.setAIBroadcast((seat, cards, type) => {
      if (type === 'PLAY') net.broadcast({ type: 'PLAY', payload: { seat, cards } })
      // PASS 由 scheduleAI 内部调用 playerPass 走的是 validate 路径,直接 emit 'pass'
      // 其他 tab 的 onP2PPass 跳过自己 seat 的,这里 seat 是 AI 不是自己
    })
  }
  // ★ v3.8 P1:暴露 game / selfSeat / net 给浏览器测试用(端到端验证同步)
  if (typeof window !== 'undefined') {
    window.__gd_game = game.value
    window.__gd_selfSeat = selfSeat.value
    window.__gd_net = net  // 让 eval 能调 net.broadcast
  }
  game.value.on('dealt', ({ firstPlayer: fp, levelRank: lr }) => {
    firstPlayer.value = fp
    currentPlayer.value = fp
    levelRank.value = lr
    levelLabel.value = RANK_LABEL[lr]
    // v3.7:重置每个座位牌数跟踪
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
    // v3.7:报数 tick — 计算出牌后的剩余牌数,触发 sfxCountdownTick/Warn
    const oldCount = lastCardCounts.value[seat] ?? 27
    const newCount = Math.max(0, oldCount - (cards?.length || 0))
    // 用数组 copy 触发响应式
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
    // ★ v3.8 P1:4-tab 联机广播 ROUND_END,joiner 收到后调 applyRoundEnd 同步
    // 注意:本地已经 apply 过了(在 finishRound → applyRoundEnd 里),joiner 端跳过
    if (isP2PMode.value) {
      net.broadcast({ type: 'ROUND_END', payload: { ranks, levelUp: lu, newLevelRank } })
    }
    // 只在本机存战绩(host 存,joiner 不重复存)
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
  // v3-2:已弃用(改用列选)。保留兜底——取第 i 张所属列并 toggle。
  if (!myTurn.value) return
  const c = myHand.value[i]
  if (!c) return
  const col = handColumns.value.find(col => col.cards.some(cc => cardKey(cc) === cardKey(c)))
  if (col) toggleCol(col)
}
function onClear() {
  selectedColKeys.value = {}
  // 同步旧 selected[] 长度兜底
  selected.value = new Array(myHand.value.length).fill(false)
}

// 工具:把 selectedColKeys 映射回 card 列表(给 onPlay 用)
function selectedCardsFromColumns() {
  const selCols = handColumns.value.filter(col => selectedColKeys.value[columnKey(col)])
  return selCols.flatMap(col => col.cards.slice())
}

// 理牌
function onSortHand() {
  if (!myTurn.value) return
  // 保留当前列选状态(理牌是同 rank 内的顺序变化,列不会变)
  myHand.value = E.sortHandGrouped(myHand.value.slice())
  suitFilter.value = null
  hintCards.value = []
  mainActionsRef.value?.setShowing(false)
}

// 一键理(v3-2):用 autoPlayGrouped 智能凑炸弹/顺子/三带二等
function onAutoFindBest() {
  if (!myTurn.value) return
  const r = AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false })
  if (r?.type === 'play' && Array.isArray(r.cards) && r.cards.length > 0) {
    const cards = r.cards
    const remove = new Set(cards.map(c => cardKey(c)))
    const actual = myHand.value.filter(c => remove.has(cardKey(c)))
    if (actual.length === cards.length) {
      const pr = game.value.playerPlay(0, actual)
      if (!pr.ok) alert(pr.error || '出牌失败')
    } else {
      // 部分牌没找到(鬼牌)→ 给出提示
      alert('无可出的牌型组合')
    }
  } else if (lastPlay.value) {
    game.value.playerPass(0)
  } else {
    // 首家无可凑,出最小单张
    const sorted = [...myHand.value].sort((a, b) => a.rank - b.rank)
    game.value.playerPlay(0, [sorted[0]])
  }
  hintCards.value = []
  mainActionsRef.value?.setShowing(false)
  selectedColKeys.value = {}
}

// 花色 tab(v3-2):按花色筛列(同 suit 的所有列全选)
function onSuitTab(suit) {
  if (suitFilter.value === suit) {
    suitFilter.value = null
    selectedColKeys.value = {}
    return
  }
  suitFilter.value = suit
  // 把所有含目标花色的列 toggle 上
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
    // v3-2:同样用 autoPlayGrouped 提示最优出牌
    const r = AI.autoPlayGrouped(myHand.value, lastPlay.value, levelRank.value, { isTeammateLast: false })
    if (r?.type === 'play' && Array.isArray(r.cards) && r.cards.length > 0) {
      hintCards.value = r.cards.map(c => cardKey(c))
      // 把命中提示牌的列 toggle 上
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
        // 找到包含该牌的列
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
  const r = game.value.playerPlay(0, cards)
  if (!r.ok) alert(r.error || '出牌失败')
  hintCards.value = []
  mainActionsRef.value?.setShowing(false)
}

function onPlay() {
  const cards = selectedCardsFromColumns()
  if (cards.length === 0) { alert('请先选牌'); return }
  const seat = selfSeat.value
  const r = game.value.playerPlay(seat, cards)
  if (!r.ok) { alert(r.error || '出牌失败'); return }
  // ★ v3.8 P1:本地已 apply 完(在 playerPlay 内部),广播给其他 tab
  if (isP2PMode.value) {
    net.broadcast({ type: 'PLAY', payload: { seat, cards } })
  }
  hintCards.value = []
  mainActionsRef.value?.setShowing(false)
  selectedColKeys.value = {}
  suitFilter.value = null
}
function onPass() {
  if (!lastPlay.value) { alert('首家不能过牌'); return }
  const seat = selfSeat.value
  const r = game.value.playerPass(seat)
  if (!r.ok) { alert(r.error || '过牌失败'); return }
  if (isP2PMode.value) {
    net.broadcast({ type: 'PASS', payload: { seat } })
  }
  hintCards.value = []
  mainActionsRef.value?.setShowing(false)
}
function onNext() {
  phase.value = 'playing'
  // ★ v3.8 P1:4-tab 联机,只有 host 能发起下一局(用同 seed 发牌)
  // joiner 等 host 的 DEAL 消息重新 initGame
  if (isP2PMode.value) {
    if (selfSeat.value === 0) {
      pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
      initGame({ isP2P: true, seed: pendingSeed })
      setTimeout(() => {
        net.broadcast({ type: 'DEAL', payload: { seed: pendingSeed, levelRank: levelRank.value, newRound: true } })
      }, 500)
    }
    // joiner 不做,等 DEAL
    return
  }
  game.value.nextRound()
  myHand.value = E.sortHandGrouped(game.value.getState().hands[selfSeat.value].slice())
  selected.value = new Array(myHand.value.length).fill(false)
  selectedColKeys.value = {}
  startDealAnimation()
}
function onBack() { audio.stopBgm(); router.push('/') }
function showMenu() { if (confirm('退出对局?')) { audio.stopBgm(); router.push('/') } }
function onChat() { showChatPanel.value = true }
function onSeatClick(seat, e) { /* 弹出菜单占位 */ }
function onIcon(name) {
  if (name === 'settings') showMenu()
}

// v3.7 P1:桌面端快捷键(A=提示 / Space=出牌 / P=不出 / Esc=暂停)
// input/textarea 焦点时不触发
function onKeyDown(e) {
  if (!e) return
  const t = e.target
  const tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
  // 修饰键组合不抢(避免 Ctrl+R / Cmd+W 等系统快捷键被吞)
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key
  if (k === 'a' || k === 'A') {
    // A 触发提示(同 hintToggle)
    if (!myTurn.value) return
    e.preventDefault()
    onHintToggle(true)
  } else if (k === ' ' || k === 'Spacebar') {
    // Space 出牌
    if (!myTurn.value) return
    e.preventDefault()
    onPlay()
  } else if (k === 'p' || k === 'P') {
    // P 不出
    if (!myTurn.value) return
    e.preventDefault()
    onPass()
  } else if (k === 'Escape' || k === 'Esc') {
    // Esc:打开/关闭菜单
    e.preventDefault()
    showMenu()
  }
}

// ★ v3.8 P1:4-tab 联机模式开关 — 联机时 host 才发起 DEAL,joiner 等 DEAL
const isP2PMode = ref(false)
const selfSeat = ref(0)
// ★ v3.8 P1:确定性发牌用 seed(联机模式 host 随机生成并广播 DEAL)
let pendingSeed = null

onMounted(() => {
  // ★ v3.8 P1 修复:自己 setName 按 selfSeat,joiner 改自己名不写到 host 位置
  selfSeat.value = (() => { try { return net.getSelfSeat ? net.getSelfSeat() : 0 } catch { return 0 } })()
  players.value[selfSeat.value].name = storage.getNickname() || '我'
  players.value[selfSeat.value].avatar = storage.getAvatar() || '🀄'
  // ★ v3.8 P1 修复:从网络 peers 拿真玩家替换 AI 占位
  // 4-tab 联机时 seat 1/2/3 是真 joiner,必须用真昵称,不能显示 AI-东/北/西
  applyNetworkPlayers()
  applySettingsToAudio()
  // v3.7:P2P NICK_UPDATE 实时同步
  net.on('message:NICK_UPDATE', onRemoteNickUpdate)

  // ★ v3.8 P1:4-tab 联机同步
  // 检测 P2P 模式:network 已连接 + 有 peers(说明是 /game 通过 room 进入,不是 /ai 单机)
  try {
    const peersCount = net.getPeers ? net.getPeers().size : 0
    isP2PMode.value = peersCount >= 2  // host+至少 1 joiner
  } catch { isP2PMode.value = false }
  if (isP2PMode.value) {
    // 注册 P2P 出牌/过牌/发牌同步监听
    net.on('message:DEAL', onP2PDeal)
    net.on('message:PLAY', onP2PPlay)
    net.on('message:PASS', onP2PPass)
    net.on('message:ROUND_END', onP2PRoundEnd)
    // ★ v3.8 P1:断线重连同步
    // host 在 connect 事件里把当前 state 推给新连入的 joiner(覆盖 P2P 局中重连场景)
    // joiner 收到后直接覆盖本地 game state
    net.on('message:STATE_SNAPSHOT', onP2PStateSnapshot)
    // ★ v3.8 P1:断线 AI 接管 — joiner 掉线后,host 检测到心跳超时
    // 广播 AI_TAKEOVER { seat },所有 tab 把该 seat 加到 aiPlayers
    // host 端 game 调度 AI 接管该 seat;其他 tab 收到 PLAY 后 apply
    net.on('message:AI_TAKEOVER', onP2PAITakeover)
    if (selfSeat.value === 0) {
      // host:有 joiner 连入时,广播当前 state
      net.on('connect', ({ seat, info }) => {
        if (!game.value) return
        // 200ms 后再发,等 joiner 端 register listener 完成
        setTimeout(() => {
          const st = game.value.getState()
          net.broadcast({ type: 'STATE_SNAPSHOT', payload: { seat: 0, snapshot: st } })
        }, 200)
      })
    }
    // host 先发牌(带 seed),joiner 等 DEAL
    if (selfSeat.value === 0) {
      pendingSeed = Math.floor(Math.random() * 0x7FFFFFFF)
      initGame({ isP2P: true, seed: pendingSeed })
      // ★ v3.8 P1:延迟 500ms 广播 DEAL,等 joiner 完成 GameView 挂载 + 注册 DEAL 监听
      // 否则 joiner 收到 GAME_START 跳 /game 时,如果 host 的 DEAL 先到,joiner 的 onP2PDeal 还没注册,消息丢失
      setTimeout(() => {
        net.broadcast({ type: 'DEAL', payload: { seed: pendingSeed, levelRank: levelRank.value } })
      }, 500)
    }
    // joiner 不调 initGame,等 onP2PDeal 触发
  } else {
    // 单机 AI 模式,本地发牌
    initGame()
  }

  // v3.7 P1:桌面端快捷键
  document.addEventListener('keydown', onKeyDown)
})

/**
 * ★ v3.8 P1:joiner 收到 host 的 DEAL 广播,用同 seed 重新发牌
 * network emit 签名是 emit('message:TYPE', payload, from, msg)
 * 所以 onP2PDeal 收到的是 (payload, from, msg)
 */
function onP2PDeal(payload, from, msg) {
  if (!payload || payload.seed == null) return
  if (selfSeat.value === 0) return  // host 不响应自己
  initGame({ isP2P: true, seed: payload.seed, forcedLevelRank: payload.levelRank })
}

/**
 * ★ v3.8 P1:收到广播的 PLAY,本地 applyPlay(不校验)
 */
function onP2PPlay(payload) {
  if (!payload || !game.value) return
  if (payload.seat === selfSeat.value) return  // 自己刚出的,本地 onPlay 已经 apply 过了
  try { game.value.applyPlay(payload.seat, payload.cards) } catch (e) { console.warn('applyPlay err', e) }
}

/**
 * ★ v3.8 P1:收到广播的 PASS
 */
function onP2PPass(payload) {
  if (!payload || !game.value) return
  if (payload.seat === selfSeat.value) return
  try { game.value.applyPass(payload.seat) } catch (e) { console.warn('applyPass err', e) }
}

/**
 * ★ v3.8 P1:joiner 收到 host 广播的 ROUND_END(结算/升级)
 * 跟 PLAY/PASS 不同,本机可能也已经 finishRound(因为 host 触发的是全局),所以不 skip
 * 但 applyRoundEnd 是幂等的,二次调用也是更新 finishedOrder 末尾补齐
 */
function onP2PRoundEnd(payload) {
  if (!payload || !game.value) return
  try {
    game.value.applyRoundEnd()
  } catch (e) { console.warn('applyRoundEnd err', e) }
  // 同步 UI 状态(applyRoundEnd 也 emit roundEnd 事件,但保险起见直接 set)
  finishedOrder.value = payload.ranks || []
  levelUp.value = payload.levelUp || 0
  if (payload.newLevelRank) {
    levelRank.value = payload.newLevelRank
    nextLevelLabel.value = RANK_LABEL[payload.newLevelRank]
  }
  phase.value = 'finished'
  stopTimer()
}

/**
 * ★ v3.8 P1:收到 host 的 STATE_SNAPSHOT,断线重连后用
 * host 发的快照包含 currentPlayer/lastPlay/passCount/finishedOrder/levelRank
 * joiner 直接覆盖本地 state
 */
function onP2PStateSnapshot(payload) {
  if (!payload || !game.value || !payload.snapshot) return
  if (payload.seat === selfSeat.value) return  // 自己刚发的,跳过
  try {
    // 通过 game.js 暴露的 reset 接口把 state 灌回去
    if (game.value._applySnapshot) {
      game.value._applySnapshot(payload.snapshot)
    } else {
      // 降级:只用 UI 状态覆盖,游戏状态走完 emit 后单独由 PLAY/PASS/ROUND_END 事件驱动
      // 这种降级在 joiner 刚连入时 host 还没发 PLAY/PASS 时会有短暂偏差
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

/**
 * ★ v3.8 P1:某 seat 的 joiner 掉线,host 检测到心跳超时后广播 AI_TAKEOVER
 * 所有 tab 把该 seat 加入 aiPlayers,host 端的 game 会调度 AI 接管出牌
 * 真人玩家 (host+其他 2 joiner) 继续正常出牌,AI 帮掉线的那个人打
 */
function onP2PAITakeover(payload) {
  if (!payload || !game.value) return
  const seat = payload.seat
  if (typeof seat !== 'number') return
  // 把这个 seat 标记为 AI
  if (game.value.addAIPlayer) game.value.addAIPlayer(seat)
  // 同步 UI:这个 seat 的 player 标 isAI=true,名字后缀 "(AI)"
  const next = [...players.value]
  if (next[seat]) {
    next[seat] = { ...next[seat], isAI: true, name: (next[seat].name || '玩家') + ' (AI)' }
    players.value = next
  }
  // 如果当前轮就是 AI seat,触发 AI 出牌
  const cur = game.value.getState().currentPlayer
  if (cur === seat) {
    // 调一次 scheduleAI(通过 emit turn 触发)
    // 实际上 addAIPlayer 后,scheduleAI 在 nextTurn 时会触发
    // 但如果 AI seat 当前就是 currentPlayer,需要手动触发
    // 直接调 game 的 applyPlay 不可(没有牌),用 scheduleAI 路径
    // 这里通过 emit 一个 turn 事件触发
    const st = game.value.getState()
    if (st.phase === 'playing') {
      // 触发 AI 决策:等待 1s 让 UI 看到通知
      setTimeout(() => {
        // 重新调一次 scheduleAI(通过 turn 事件)
        // 直接调 game 的内部方法
        const hand = st.hands[seat]
        if (hand && hand.length > 0) {
          const ctx = {
            isTeammateLast: st.lastPlay && ((st.lastPlay.who + 2) % 4 === seat),
            mySeatIndex: seat,
            teammateSeatIndex: (seat + 2) % 4,
          }
          import_AI().then(AI => {
            const r = AI.default.decide(hand, st.lastPlay, st.levelRank, ctx)
            if (r.type === 'play') {
              net.broadcast({ type: 'PLAY', payload: { seat, cards: r.cards } })
              game.value.playerPlay(seat, r.cards)
            } else {
              net.broadcast({ type: 'PASS', payload: { seat } })
              game.value.playerPass(seat)
            }
          })
        }
      }, 500)
    }
  }
}

// 动态 import AI module(避免循环依赖)
let _aiModule = null
async function import_AI() {
  if (!_aiModule) _aiModule = await import('@/common/guandan-ai.js')
  return _aiModule
}

/**
 * ★ v3.8 P1:从 network 模块读真玩家,覆盖 AI 占位
 * - 如果某 seat 在 peers 里有真人 → 用真昵称/头像,isAI=false
 * - 如果没真人(单人 AI 模式 / joiner 还没来) → 保留 AI 默认
 * network.getPeers() 返回 host 自己 + 所有 joiner(seat 0~3)
 */
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
onUnmounted(() => {
  stopTimer()
  audio.stopBgm()
  // v3.7:清理 NICK_UPDATE 监听
  try { net.off && net.off('message:NICK_UPDATE') } catch (e) {}
  // ★ v3.8 P1:清理 P2P 出牌同步监听
  try { net.off && net.off('message:DEAL') } catch (e) {}
  try { net.off && net.off('message:PLAY') } catch (e) {}
  try { net.off && net.off('message:PASS') } catch (e) {}
  try { net.off && net.off('message:ROUND_END') } catch (e) {}
  try { net.off && net.off('message:STATE_SNAPSHOT') } catch (e) {}
  try { net.off && net.off('message:AI_TAKEOVER') } catch (e) {}
  // v3.7 P1:清理 keydown 监听
  try { document.removeEventListener('keydown', onKeyDown) } catch (e) {}
  // 清理 toast timer
  if (nickToastTimer) clearTimeout(nickToastTimer)
  if (chatPhraseTimer) clearTimeout(chatPhraseTimer)
})
</script>

<style scoped>
/* ============================================================
 * v3 UI 全局布局(组合所有子组件)
 * ============================================================ */
.page {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: #fff;
}

/* 背景渐变 */
.bg-deep {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center top, #2a3a7a 0%, transparent 60%),
    linear-gradient(180deg, #1a1f4a 0%, #0a1233 50%, #050a1f 100%);
  z-index: 0;
}

/* 玩家手牌(v3-2 竖叠列) */
.hand-area {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 8px 0 60px;  /* 留出底部操作栏空间 */
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.6));
  z-index: 5;
  transition: opacity var(--t-med) var(--ease-out);
}
.hand-area.disabled { opacity: 0.3; pointer-events: none; }
/* v3.7 P1:倒计时 <=5s 时,自己回合手牌区闪红 */
.hand-area.is-urgent {
  background: linear-gradient(180deg, transparent, rgba(229, 57, 53, 0.35));
  box-shadow: inset 0 4px 24px rgba(229, 57, 53, 0.45);
  animation: hand-urgent-pulse 0.6s ease-in-out infinite;
}
@keyframes hand-urgent-pulse {
  0%   { box-shadow: inset 0 4px 24px rgba(229, 57, 53, 0.25); }
  50%  { box-shadow: inset 0 4px 36px rgba(229, 57, 53, 0.75), inset 0 0 8px rgba(255, 100, 100, 0.5); }
  100% { box-shadow: inset 0 4px 24px rgba(229, 57, 53, 0.25); }
}
.hand-inner {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-end;
  flex-wrap: nowrap;
  min-height: 120px;
  padding: 8px 12px 22px;  /* 底部留空间给列数标签 */
  gap: 4px;                 /* v3-3:列与列之间固定 4px 间隙 */
  /* v3.8 bug fix: 不要用 `overflow: auto visible`,CSS spec 会强制把
     overflow-y 也算成 auto,把竖叠牌的顶端裁掉。
     1280px 固定画布下根本不需要横向滚动,直接全部 visible。 */
  overflow: visible;
  scrollbar-width: thin;
}
/* v3-3:手牌列 — 浅底 + 描边 + 列间竖线,让"一列一列"清晰可见 */
.hand-column {
  position: relative;
  width: 78px;                                  /* 60 → 78,留白更明显 */
  min-height: 98px;
  flex-shrink: 0;
  margin: 0;
  padding: 18px 0 2px;                         /* v3.6: 上 18px 给 .col-rank 标签留位 */
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);        /* 列底浅色 */
  /* v3.6: 列间竖线 1px → 2px 渐变(透明→18%白→30%金→18%白→透明) */
  border-right: 2px solid;
  border-image: linear-gradient(180deg,
    transparent,
    rgba(255, 255, 255, 0.18) 30%,
    rgba(255, 215, 0, 0.3) 50%,
    rgba(255, 255, 255, 0.18) 70%,
    transparent) 1;
  border-radius: 6px;                          /* 圆角软化 */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);  /* 内描边 */
  transition:
    transform var(--t-fast) var(--ease-out),
    background var(--t-fast) var(--ease-out),
    box-shadow var(--t-fast) var(--ease-out);
}
.hand-column:hover {
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}
.hand-column:last-child { border-right: none; }  /* 最后一列不加竖线 */
.hand-column.is-selected {
  /* v3.6: 抬升 16px → 18px,加金色外光晕 */
  transform: translateY(-18px);
  background: rgba(255, 215, 0, 0.12);
  box-shadow:
    inset 0 0 0 2px var(--gold),
    0 0 16px var(--gold-soft);
}
.hand-column.is-selected .hand-card {
  box-shadow: 0 0 0 1.5px var(--gold), 0 6px 12px rgba(255, 215, 0, 0.4);
}

/* v3.6:列顶 rank 数字标签(7/9/10/K/2/王) */
/* v3.7:标签上移 top -8 → -22,跟列底 .col-count(bottom: -10)对称,完全脱离牌面,不再压住 A/K/Q 牌角 */
.col-rank {
  position: absolute;
  top: -22px;                                   /* v3.7: -8 → -22,跟 .col-count 对称,完全脱离牌面 */
  left: 50%;
  transform: translateX(-50%);
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  background: linear-gradient(180deg, #1a237e, #0a1233);
  border: 1.5px solid var(--gold);
  color: var(--gold);
  font-size: 10px;
  font-weight: 900;
  line-height: 15px;
  text-align: center;
  border-radius: 9px;
  z-index: 5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.3px;
  pointer-events: none;
}
/* v3.6:级牌列(2)的 rank 标签用橙色背景 */
.col-rank.is-level-rank {
  background: linear-gradient(180deg, #FFA000, #FF6F00);
  color: #fff;
  border-color: #FFD54F;
}
/* v3.6:王列(JOKER)的 rank 标签用红色背景 */
.hand-column.is-joker .col-rank {
  background: linear-gradient(180deg, #b71c1c, #4a0000);
  color: #fff;
  border-color: var(--red-card);
}
.hand-card {
  position: absolute;
  left: 9px;       /* (78 - 60) / 2 = 9 居中 */
  width: 60px;
  height: 84px;
  transition: transform var(--t-fast) var(--ease-out);
}
/* v3-3:列底 ×N 标签,强化"列"的概念 */
.col-count {
  position: absolute;
  bottom: -10px;                /* 浮在列底部下方,避免与最后一张牌重叠 */
  left: 50%;
  transform: translateX(-50%);
  min-width: 22px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--accent-orange);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 50;
  letter-spacing: 0.3px;
}
.hand-column.is-selected .col-count {
  background: var(--gold);
  color: var(--text-on-card);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}
/* JOKER 单列:宽度与其他列保持一致,内部 2 张自然居中 */
/* 响应式:窄屏列宽自动缩到 50px */
@media (max-width: 768px) {
  /* v3-5:右侧 padding 从 8 加大到 72,给 QuickActions 按钮(48px + 8px 右偏移 + 16 安全距离)留空间,最右一手牌不再被挤 */
  .hand-inner { gap: 2px; padding: 8px 72px 22px 8px; }
  .hand-column { width: 52px; min-height: 92px; padding: 4px 0 2px; }
  /* v3-4:CardPlay 在窄屏同步缩到 44x62(原 60x84),装得下 52px 列宽 */
  /* 同步修改 CSS 变量,让 CardPlay .size-md 也按 44x62 渲染 */
  .hand-card {
    left: 4px;                                 /* (52 - 44) / 2 = 4 居中 */
    width: 44px;
    height: 62px;                              /* 保持 60:84 ≈ 5:7 比例 */
    --hand-card-w: 44px;
    --hand-card-h: 62px;
  }
  .col-count { bottom: -8px; height: 14px; font-size: 9px; min-width: 20px; }
  .hand-area { padding: 8px 0 100px; }          /* 底部 padding 加大,手牌顶端有更舒服的位置 */
  /* v3-5:QuickActions 在窄屏进一步上移到 240,避开 self 座位(现 110)+ suit-tabs(320)之间的区域 */
  :deep(.quick-actions) { bottom: 240px; right: 8px; }
}

/* 花色 tab */
.suit-tabs {
  position: fixed;
  left: 50%;
  bottom: 320px;  /* v3-4:从 200 上移到 320,叠在 action-bar 上方,两层不打架 */
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  z-index: 6;
  background: var(--mask-dark);
  border-radius: var(--radius-pill);
  padding: 4px;
  backdrop-filter: blur(4px);
}
.suit-tab {
  width: 36px; height: 36px;
  background: transparent;
  border: none;
  border-radius: 50%;
  font-size: 18px;
  color: #fff;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
}
.suit-tab:hover { background: rgba(255,255,255,0.15); }
.suit-tab.active { background: rgba(255,255,255,0.25); }
.suit-tab.suit-1.active, .suit-tab.suit-3.active { color: #ff5252; }
.suit-tab.suit-0.active, .suit-tab.suit-2.active { color: #fff; }

/* 底部主操作栏容器 */
.action-bar-wrap {
  position: fixed;
  left: 0; right: 0; bottom: 220px;  /* v3-4:从 130 改 220,提到手牌区上方留 16px 间隙,不再盖住手牌 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 7;
}

/* ============================================================
 * v3.6 智能理牌(显眼前置按钮)— 橙色胶囊
 * 挂在 MainActions 的 smart-sort 插槽里
 * ============================================================ */
.auto-find-pill {
  display: flex;
  justify-content: center;
  align-items: center;
}
.auto-find-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  background: linear-gradient(180deg, var(--orange-warm, #FFB300) 0%, var(--orange-bright, #FF6D00) 100%);
  border: 2px solid #fff;
  border-radius: 24px;
  color: #4a2c00;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  box-shadow:
    0 4px 12px rgba(255, 109, 0, 0.5),
    0 0 16px rgba(255, 179, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
  font-family: inherit;
}
.auto-find-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow:
    0 6px 18px rgba(255, 109, 0, 0.6),
    0 0 24px rgba(255, 215, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
.auto-find-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.auto-find-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.auto-find-btn .sparkle {
  font-size: 16px;
  line-height: 1;
}

/* v3-5:self 座位面板从中央(bottom 380)改到右下角,让出中央牌桌空间,避免跟椭圆牌桌下半圆视觉重叠 */
/* v3.6:self 座位右下角 → 右中(避开中央操作栏 / 一键理牌 / 手牌) */
/* v3.7:user 决策 C — 改回"中下(操作栏上方)居中" */
/*    操作栏 bottom: 220px,自座位移到操作栏上方 100px 处,bottom: 380 不变,但居中 */
:deep(.seat-bottom) {
  bottom: 380px;  /* 操作栏正上方 ~100px,避开 .auto-find-pill / .action-bar / .hand-area */
  left: 50%;                              /* v3.7:居中显示 */
  transform: translateX(-50%);            /* v3.7:水平居中补偿 */
  right: auto;                            /* v3.7:取消右偏移,改居中 */
  z-index: 8;     /* 提到 hand-area(5) 之上,不被手牌遮 */
}
@media (max-width: 768px) {
  /* v3-5 移动端 self 座位:
   *   移动端 hand-inner padding-right:72 只能让出 72px,而座位宽 ~196,
   *   放在底部右下角会盖住最右一列手牌。
   *   改成右上角(icon 行下方) + 缩到 0.4,完全避开手牌/牌桌/AI-北队友。
   *   关键:.is-turn 的 seat-pulse 动画在 keyframe 里写死了 transform: scale(1~1.03),
   *         会盖掉这里的 scale(0.4),所以必须 animation: none 一并关掉。
   */
  :deep(.seat-bottom) {
    top: 60px;     /* icon 行(top 12, 36 高)下方,留 12px 间隙 */
    right: 8px;
    bottom: auto;
    transform: scale(0.4);
    transform-origin: top right;
    animation: none;   /* 覆盖 is-turn 的 seat-pulse,让 scale(0.4) 生效 */
  }
}
.action-bar-sub {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 0 16px;
}
.sub-btn {
  background: var(--mask-dark);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 14px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.sub-btn:hover { background: rgba(0,0,0,0.7); }

/* 结算遮罩 */
.result-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
}
.result-card {
  width: 90%; max-width: 400px;
  background: linear-gradient(180deg, #fff, #f0f4ff);
  border-radius: var(--radius-lg);
  padding: 24px;
  color: var(--text-on-card);
  box-shadow: var(--shadow-lg);
}
.result-title { font-size: 22px; font-weight: bold; text-align: center; }
.result-meta { font-size: 14px; color: #ff7e3d; text-align: center; margin: 8px 0 16px; }
.result-list .result-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid #eee;
}
.result-rank { font-size: 16px; font-weight: bold; width: 60px; }
.result-name { flex: 1; font-size: 16px; }
.result-team { font-size: 12px; opacity: 0.7; }
.result-row.gold { border-left: 4px solid var(--gold); padding-left: 8px; }
.result-row.gold .result-rank { color: var(--gold); }
.result-row.silver { border-left: 4px solid #c0c0c0; padding-left: 8px; }
.result-row.silver .result-rank { color: #c0c0c0; }
.result-row.bronze { border-left: 4px solid #cd7f32; padding-left: 8px; }
.result-row.bronze .result-rank { color: #cd7f32; }
.result-row.last { border-left: 4px solid #666; padding-left: 8px; }
.result-row.last .result-rank { color: #999; }
.result-actions { display: flex; gap: 12px; margin-top: 16px; }
.r-btn { flex: 1; height: 48px; border: none; border-radius: var(--radius-md); font-size: 15px; font-weight: bold; cursor: pointer; }
.r-btn.primary { background: linear-gradient(180deg, #4caf50, #2e7d32); color: #fff; }
.r-btn.ghost { background: #eef0f5; color: #888; }

/* 发牌中:手牌 + 座位牌背 隐藏 */
.dealing .hand-area { opacity: 0; pointer-events: none; }

/* ============================================================
 * v3.7:对局中禁改名 toast
 * ============================================================ */
.nick-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 999px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  white-space: nowrap;
  pointer-events: none;
}
.toast-enter-active, .toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
.toast-enter-to, .toast-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
