<template>
  <!--
   * v2.4 task 3: GameViewMobile.vue — ≤768px 竖屏单手操作布局
   *
   * 设计原则:
   *   - 单手操作:底部固定操作栏(智能理牌 / 不出 / 提示 / 出牌)大拇指可达
   *   - 中央牌桌缩到 ~280×280,出牌区放大
   *   - 对家 / 对手座位压扁,只显示头像 + 名字 + 手牌数
   *   - 顶部 8% 给系统状态栏 / HUD,菜单 / level / 倍数 + 右上角浮动计时器
   *   - 手牌 9 列 rank,每列缩到 56px 宽,纵向叠 3 张
   *   - 操作栏 14% 给 4 大按钮
   *
   * viewport 分配(iPhone 13 375×812 / 通用 360×640 兜底):
   *   - 顶 HUD     8%  (~65px @812 / ~52px @640)
   *   - 对家座位   15% (~120px @812 / ~96px @640)
   *   - 中央牌桌   35% (~285px @812 / ~225px @640)
   *   - 手牌       28% (~225px @812 / ~180px @640)
   *   - 操作栏     14% (~115px @812 / ~90px @640)
   *
   * 关键技术点:
   *   1. 顶部 ≤ 8% 不堆计时器,计时器挪右上角浮动小标
   *   2. 对家座位压扁,Level / 金币 / 进度条隐藏(只显示头像 / 名字 / 手牌数)
   *   3. 左右对手座位:不渲染 PlayerSeat 整卡,改用 mini-pill 节省空间
   *   4. 智能理牌按钮 = 合并到操作栏(最左),不再独占中央下方
   *   5. 操作栏 4 大按钮:智能理牌 / 不出 / 提示 / 出牌(从左到右)
   *   6. 横屏自动走 desktop(由 GameView.vue 的 isMobile 检测处理),本组件不渲染
   *   7. touch-action: manipulation(避免双击放大延迟)
   *   8. 字号 16px+ 避免 iOS Safari 自动放大
   *
   * CSS 策略:
   *   - clamp() 做字号 + 间距(适配 360-430 屏宽)
   *   - 关键 hit area ≥ 44×44px(Apple HIG)
   *   - 不引入 vw / vh 极端单位(避免键盘弹出 / 状态栏变化抖动)
   *   - scroll 用 -webkit-overflow-scrolling: touch
   -->
  <div class="page" :class="{ dealing: isDealing, bomb: isShaking, 'is-landscape': isLandscape }">
    <!-- v3.x:背景 — 椭圆 felt 翡翠绿 + 木纹边(跟桌面端一致的视觉语言,UI-REDESIGN-V3-SPEC.md §3.1+§3.6) -->
    <div class="bg-felt"></div>
    <div class="bg-wood-edge" aria-hidden="true"></div>

    <!-- ===== 1. 顶部 HUD 8% (压缩版) ===== -->
    <div class="hud-top">
      <!-- 左:菜单 + 本局打 + 倍数 -->
      <div class="hud-left">
        <button class="menu-btn" @click="showMenu" title="菜单" aria-label="菜单">
          <span class="menu-icon" aria-hidden="true">≡</span>
        </button>
        <div class="hud-card level-card">
          <div class="hud-label">本局打</div>
          <div class="hud-value">{{ levelLabel }}</div>
        </div>
        <div class="hud-card mult-card">
          <div class="hud-label">倍数</div>
          <div class="hud-value">×{{ multiplier }}</div>
        </div>
      </div>

      <!-- 右:浮动计时器(我回合时显示,对手回合时显示对手剩余时间) -->
      <div class="hud-right">
        <div
          v-if="myTurn && !isDealing"
          class="clock-float"
          :class="{ urgent: turnTimeLeft <= 5 }"
        >
          <span class="clock-num">{{ turnTimeLeft }}</span>
          <span class="clock-unit">s</span>
        </div>
        <button
          v-else-if="!isDealing && phase === 'playing'"
          class="opponent-clock-float"
          :title="`${currentPlayerName} 思考中`"
        >
          <span class="opponent-name">{{ truncateName(currentPlayerName) }}</span>
          <span class="opponent-sep">·</span>
          <span class="opponent-time">{{ turnTimeLeft }}s</span>
        </button>
        <button class="chat-btn" @click="onChat" title="聊天" aria-label="聊天">
          <span class="chat-icon">💬</span>
        </button>
      </div>
    </div>

    <!-- ===== 2. 对家座位 15% (简版) ===== -->
    <div v-if="seatData.top" class="seat-teammate">
      <PlayerSeat
        position="top"
        class="teammate-compact"
        :role="seatData.top.role"
        :name="seatData.top.name"
        :avatar="seatData.top.avatar"
        :avatar-suit="0"
        :coins="null"
        :level="null"
        :card-count="seatData.top.cardCount"
        :is-turn="seatData.top.isTurn"
        :is-done="seatData.top.isDone"
        :show-count="seatData.top.showCount"
        :is-urgent="seatData.top.isUrgent"
        @click="$emit('seatClick', 2, $event)"
      />
    </div>

    <!-- ===== 3. 左右对手 mini-pill (左右各 1 个) ===== -->
    <div v-if="seatData.left" class="seat-left-mobile">
      <button
        class="opp-pill opp-left"
        :class="{ 'is-turn': seatData.left.isTurn, 'is-done': seatData.left.isDone }"
        @click="$emit('seatClick', 1, $event)"
      >
        <span class="opp-avatar">{{ seatData.left.avatar }}</span>
        <span class="opp-name">{{ truncateName(seatData.left.name) }}</span>
        <span v-if="seatData.left.showCount" class="opp-count" :class="{ urgent: seatData.left.isUrgent }">
          {{ seatData.left.cardCount }}
        </span>
        <span v-if="seatData.left.isDone" class="opp-done" aria-hidden="true">✓</span>
      </button>
    </div>
    <div v-if="seatData.right" class="seat-right-mobile">
      <button
        class="opp-pill opp-right"
        :class="{ 'is-turn': seatData.right.isTurn, 'is-done': seatData.right.isDone }"
        @click="$emit('seatClick', 3, $event)"
      >
        <span class="opp-avatar">{{ seatData.right.avatar }}</span>
        <span class="opp-name">{{ truncateName(seatData.right.name) }}</span>
        <span v-if="seatData.right.showCount" class="opp-count" :class="{ urgent: seatData.right.isUrgent }">
          {{ seatData.right.cardCount }}
        </span>
        <span v-if="seatData.right.isDone" class="opp-done" aria-hidden="true">✓</span>
      </button>
    </div>

    <!-- ===== 4. 中央牌桌 35% (小尺寸) ===== -->
    <!-- v3.x:中央牌桌舞台 + 径向白光聚光(spec §3.5)— 桌面上方微亮效果 -->
    <div class="table-area">
      <div class="table-glow" aria-hidden="true"></div>
      <TableCenter
        :table-cards="tableCards"
        :first-player-name="firstPlayerName"
        :first-player-emoji="firstPlayerEmoji"
        :is-level="isLevel"
        :is-dealing="isDealing"
        :level-label="levelLabel"
        :round="round"
        :multiplier="multiplier"
        :mode-label="isP2PMode ? '好友对局' : 'AI 对局'"
      />
    </div>

    <!-- ===== 5. 特效层 (覆盖全屏) ===== -->
    <EffectLayer
      :bomb-fx="bombFx"
      :shaking="isShaking"
      :floating-texts="floatingPasses"
    />

    <!-- ===== 6. 状态提示条 (发牌中 / 等待) ===== -->
    <div v-if="isDealing || phase === 'finished'" class="status-tip-mobile">
      <template v-if="isDealing">
        <!-- ★ v0.4.24 P2 修复:补 role/aria-live(对齐桌面端 deal-progress-label) -->
        <span role="status" aria-live="polite">🃏 发牌中 {{ dealProgress }}%</span>
        <div class="deal-progress-bar" aria-hidden="true">
          <div class="deal-progress-fill" :style="{ width: dealProgress + '%' }"></div>
        </div>
      </template>
      <span v-else-if="phase === 'finished'">本局结束</span>
    </div>

    <!-- ===== 6.6 发牌超时兜底 (mobile 版) ===== -->
    <div v-if="dealTimeout" class="deal-timeout-mask" @click.self>
      <div class="deal-timeout-card">
        <h3 class="deal-timeout-title">发牌超时</h3>
        <p class="deal-timeout-hint">请检查房间连接后重试</p>
        <div class="deal-timeout-actions">
          <button class="deal-timeout-btn ghost" @click="exitGame">返回大厅</button>
          <button class="deal-timeout-btn primary" @click="retryDeal">重试</button>
        </div>
      </div>
    </div>

    <!-- ===== 6.5 结算遮罩 (mobile 版) ===== -->
    <div v-if="phase === 'finished'" class="result-mask-mobile">
      <div class="result-card-mobile">
        <h2 class="result-title-mobile">{{ isRestartAfterA ? '本轮过 A' : '本局结束' }}</h2>
        <p class="result-meta-mobile" v-if="!isRestartAfterA">升 {{ levelUp }} 级 → 下一局打 {{ nextLevelLabel }}</p>
        <p class="result-meta-mobile" v-else>本轮已从 A 过关,点击下方按钮开启新一轮对局</p>
        <div class="result-list-mobile">
          <div
            v-for="(seat, i) in finishedOrder"
            :key="i"
            class="result-row-mobile"
            :class="rankColor(i)"
          >
            <span class="result-rank-mobile">{{ ['头游','二游','三游','末游'][i] }}</span>
            <span class="result-name-mobile">{{ playerName(seat) }}</span>
            <span class="result-team-mobile"><span aria-hidden="true">{{ isWinningSeat(seat) ? '🏆' : '💀' }}</span> {{ isWinningSeat(seat) ? '胜方' : '负方' }}</span>
          </div>
        </div>
        <div class="result-actions-mobile">
          <button class="r-btn-mobile ghost" @click="exitGame">返回首页</button>
          <!-- ★ P1-01 修复:恢复明确的「下一局/重开一轮」按钮 -->
          <button
            v-if="!isP2PMode"
            class="r-btn-mobile primary"
            @click="isRestartAfterA ? onRestartMatch() : onNext()"
          >
            {{ isRestartAfterA ? '重开一轮' : '下一局' }}
          </button>
          <button
            v-else-if="isNetworkHost"
            class="r-btn-mobile primary"
            @click="isRestartAfterA ? onRestartMatch() : onNext()"
          >
            {{ isRestartAfterA ? '重开一轮' : '开始下一局' }}
          </button>
          <button v-else class="r-btn-mobile primary" disabled>
            等待房主开始下一局
          </button>
          <button v-if="isP2PMode" class="r-btn-mobile ghost" @click="onBackToRoom">返回房间</button>
        </div>
      </div>
    </div>

    <!-- ===== 7. 手牌 28% (按 rank 分组竖叠,9 列 56px 宽) ===== -->
    <button
      class="smart-sort-float"
      :disabled="isDealing || phase !== 'playing' || myHand.length === 0"
      @click="onAutoFindBest"
      title="智能理牌 · 自动凑炸弹/顺子/三带二"
    >
      <span class="ss-icon" aria-hidden="true">✨</span>
      <span class="ss-text">理牌</span>
    </button>
    <div class="hand-area" :class="{ disabled: isDealing, 'is-urgent': urgent && myTurn }">
      <div class="hand-inner" :style="{ '--overlap': handOverlap + 'px' }">
        <div
          v-for="col in handColumns"
          :key="columnKey(col)"
          class="hand-column"
          :class="[
            { 'is-selected': selectedColKeys[columnKey(col)] },
            col.isJoker ? 'is-joker' : (isLevel({ suit: 0, rank: col.rank }) ? 'is-level' : '')
          ]"
          :style="{ minHeight: colMinHeight(col) + 'px' }"
        >
          <!-- v0.4.3:大小王列隐藏 col-rank 标签(卡通小丑已自带视觉标识) -->
          <div
            v-if="!col.isJoker"
            class="col-rank"
            :class="{ 'is-level-rank': isLevel({ suit: 0, rank: col.rank }) }"
          >{{ colRankLabel(col) }}</div>
          <div class="col-count">×{{ col.cards.length }}</div>
          <div
            v-for="(c, i) in col.cards"
            :key="cardKey(c)"
            class="hand-card"
            :style="{ zIndex: i + 1, top: (i * -12) + 'px' }"
            @click="onCardClick(c)"
            @touchstart="onCardTouchStart($event, col)"
            @touchend="onCardTouchEnd"
            @touchmove="onCardTouchEnd"
            @touchcancel="onCardTouchEnd"
          >
            <CardPlay
              :card="c"
              :is-level="isLevel(c)"
              :selected="isCardSelected(c)"
              :hinted="isHinted(c)"
              size="md"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 8. 操作栏 14% (3 大按钮) ===== -->
    <div v-if="myTurn && !isDealing" class="action-bar">
      <button
        class="action-btn-pass"
        :disabled="!lastPlay"
        @click="onPass"
        title="不出"
        aria-label="不出"
      >
        <span class="action-icon" aria-hidden="true">—</span>
        <span class="action-text">不出</span>
      </button>
      <button
        class="action-btn-hint"
        :disabled="myHand.length === 0"
        @click="onHintToggle(true)"
        :class="{ active: hintCards.length > 0 }"
        title="提示"
        aria-label="提示"
      >
        <span class="action-icon" aria-hidden="true">💡</span>
        <span class="action-text">提示</span>
      </button>
      <button
        class="action-btn-play"
        :disabled="selectedCount === 0"
        @click="onPlay"
        title="出牌"
        aria-label="出牌"
      >
        <span class="action-icon" aria-hidden="true">✓</span>
        <span class="action-text">出牌</span>
      </button>
    </div>

    <!-- ===== 9. 对局中禁改名 toast ===== -->
    <transition name="toast">
      <div v-if="showNickToast" class="nick-toast" role="status" aria-live="polite">
        对局中不能改名,请到首页或房间页修改
      </div>
    </transition>

    <!-- ===== 10. host 迁移提示 ===== -->
    <transition name="toast">
      <div v-if="hostMigrationToast" class="host-mig-toast" :class="{ 'is-self': hostMigrationToast.isMyself }" role="status" aria-live="polite">
        <span class="mig-icon" aria-hidden="true">👑</span>
        <span class="mig-text">{{ hostMigrationToast.text }}</span>
      </div>
    </transition>

    <!-- ===== 11. 聊天快捷短语弹层 ===== -->
    <ChatQuickPanel
      :visible="showChatPanel"
      @close="showChatPanel = false"
      @select="onChatSelect"
    />

    <!-- ===== 12. 聊天短语 toast ===== -->
    <transition name="toast">
      <div v-if="chatPhraseToast" class="nick-toast" role="status" aria-live="polite">
        💬 {{ chatPhraseToast }}
      </div>
    </transition>
  </div>
</template>

<script setup>
/**
 * GameViewMobile.vue — v2.4 task 3
 *
 * 移动端单手操作布局 (≤768px):
 *   - 复用 useGameLogic composable(同 desktop)
 *   - 复用子组件 PlayerSeat / TableCenter / EffectLayer / CardPlay / ChatQuickPanel
 *   - 改写 HUD / 操作栏 / 座位显示方式
 *   - 不调 useRouter() — 跳转由父组件 GameView 统一处理(本组件通过 emit + 父级方法)
 *
 * 边界:
 *   - props 只接 selfSeat / ghostRank / isP2PMode(透传 useGameLogic)
 *   - 不动 useGameLogic.js / 子组件 props / 路由 / 旋转公式
 *   - 不引入新依赖
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'

import PlayerSeat from '@/components/PlayerSeat.vue'
import TableCenter from '@/components/TableCenter.vue'
import EffectLayer from '@/components/EffectLayer.vue'
import CardPlay from '@/components/CardPlay.vue'
import ChatQuickPanel from '@/components/ChatQuickPanel.vue'

import { useGameLogic } from './useGameLogic.js'
import { useRouter, useRoute } from 'vue-router'
import net from '@/common/network.js'
import { showConfirm } from '@/common/dialog-bus.js'
import * as haptics from '@/common/haptics.js'

const router = useRouter()
const route = useRoute()
function goHome() { haptics.click(); router.push('/') }
// ★ P1-02 修复:返回房间时携带原 query,避免被误判为 host。
function onBackToRoom() {
  haptics.click()
  router.push({
    path: '/room',
    query: {
      roomNo: route.query.roomNo,
      role: route.query.role,
      host: route.query.host,
      nick: route.query.nick,
      avatar: route.query.avatar,
    },
  })
}
// ★ v0.4.24 P0 修复:exitGame 支持迁移参数 — host 退出时把 newHostSeat/newHostAddress
//   传给 net.close,保证旧 host 立即关闭时公开 PEER_LEAVE 仍带齐迁移字段
function exitGame(migration) {
  try {
    if (isNetworkHost.value) {
      net.close({
        broadcast: true,
        reason: 'user_leave',
        newHostSeat: migration?.newHostSeat,
        newHostAddress: migration?.newHostAddress,
      })
    } else {
      net.leaveRoom({ reason: 'user_leave' })
    }
  } catch (e) {}
  router.replace('/')
}

// props: 跟 desktop 一样接 selfSeat / ghostRank / isP2PMode
const props = defineProps({
  selfSeat: { type: Number, default: 0 },
  ghostRank: { type: Number, default: undefined },
  isP2PMode: { type: Boolean, default: false },
  // ★ v0.4.9:AI 难度
  difficulty: { type: String, default: 'medium' },
  // ★ LOGIC-01 修复:AI 页传入的起始级牌
  initialLevelRank: { type: Number, default: undefined },
  // ★ Phase3 同步切牌:首家座位
  firstSeat: { type: Number, default: undefined },
})

// 占位:给 useGameLogic 注入 mainActionsRef(虽然 mobile 不渲染桌面版 MainActions,
// 仍需要 ref 接口,内部多处调 setShowing(false) 关掉提示气泡)
const mainActionsRef = ref(null)

const {
  // state
  round, levelLabel, nextLevelLabel, levelUp, multiplier,
  players, myHand, selectedColKeys, selectedCardIds, tableCards, lastPlay,
  phase, currentPlayer, turnTimeLeft, finishedOrder,
  isDealing, dealProgress, dealTimeout, hintCards, bombFx, floatingPasses, suitFilter, isShaking,
  showNickToast, showChatPanel, chatPhraseToast,
  hostMigrationToast, hostMigrationBadge, urgent,
  isRestartAfterA, isNetworkHost, game,
  // computed
  myTurn, currentPlayerName, firstPlayerName, firstPlayerEmoji, tipText,
  seatData, handColumns, selectedCount,
  // methods
  onNickEditRequest, onChatSelect, onHostMigrated,
  playerName, cardKey, isHinted, isLevel, rankColor, isWinningSeat,
  columnKey, colMinHeight, colRankLabel, toggleCol, toggleCardId, isCardSelected, onClear,
  selectedCardsFromIds, selectedCardsFromColumns, onSortHand, onAutoFindBest, onSuitTab,
  onHintToggle, onAutoPlay, onPlay, onPass, onNext, onChat, onSeatClick,
  onRestartMatch,
  onIcon, retryDeal,
} = useGameLogic({
  mainActionsRef,
  selfSeat: props.selfSeat,
  ghostRank: props.ghostRank,
  isP2PMode: props.isP2PMode,
  // ★ v0.4.9:透传 AI 难度
  difficulty: props.difficulty,
  // ★ LOGIC-01 修复:AI 页传入的起始级牌
  initialLevelRank: props.initialLevelRank,
  // ★ Phase3 同步切牌:首家座位
  firstSeat: props.firstSeat,
})

// ★ P0-01:移动端长按某张牌选中整列(替代桌面双击)
// ★ v0.4.24 P1 修复:longPressFired 标志 — 长按触发 toggleCol 后,touchend 只清
//   timer 没拦合成事件,浏览器补发一个合成 click 把按住那张牌反选。
//   现在:长按真正触发时置 true,click 处理器(onCardClick)发现 true 则吞掉这次
//   click 并复位;touchstart 先复位上一轮残留标志(长按后滑走/取消没产生 click 的场景)。
const longPressTimer = ref(null)
const longPressFired = ref(false)
const LONG_PRESS_MS = 500
function onCardTouchStart(e, col) {
  longPressFired.value = false
  if (longPressTimer.value) clearTimeout(longPressTimer.value)
  longPressTimer.value = setTimeout(() => {
    longPressTimer.value = null
    longPressFired.value = true
    toggleCol(col)
  }, LONG_PRESS_MS)
}
function onCardTouchEnd() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}
function onCardClick(c) {
  // 长按后的合成 click:吞掉,不复位选择状态
  if (longPressFired.value) {
    longPressFired.value = false
    return
  }
  toggleCardId(cardKey(c))
}

// ★ P1-09 修复:动态计算手牌列重叠量,列数多时自动收紧,
//   避免固定 -16px 重叠导致总宽度超出 viewport 被 .page overflow:hidden 裁切。
//   首列 margin-left 强制为 0,保证最左列完整可见。
// ★ UX-P1-07 修复:用响应式 viewportWidth 监听 resize/visualViewport,
//   横竖屏切换后 handOverlap 自动重新计算。
const viewportWidth = ref(typeof window !== 'undefined' ? (window.visualViewport?.width || window.innerWidth) : 390)
function updateViewportWidth() {
  viewportWidth.value = (typeof window !== 'undefined') ? (window.visualViewport?.width || window.innerWidth) : 390
}
const handOverlap = computed(() => {
  const count = handColumns.value.length
  if (count <= 1) return 0
  const viewportW = viewportWidth.value
  const leftPad = 16
  const rightSafe = 74 // 70px 智能理牌胶囊 + 4px 缓冲
  const available = Math.max(0, viewportW - leftPad - rightSafe)
  const naturalWidth = count * 56
  if (naturalWidth <= available) return 0
  return Math.min(28, Math.floor((naturalWidth - available) / (count - 1)))
})

// ★ P1-03 修复:移动端 host 退出与桌面端行为一致,先尝试 host 迁移再退出。
// ★ v0.4.24 P0 修复(与桌面端对称):
//   (a) snapshot 改用 game.getSnapshot() 完整白名单(含 handCounts / difficulty / round /
//       levelUp / isRestartAfterA / previousLevelRank / abandonedSeats);之前手写字段
//       列表缺 handCounts 等 → 新 host promoteToHost 校验必失败,房主一退全房解散
//   (b) newHostSeat/newHostAddress 传入 exitGame → net.close,旧 host 立即关闭时
//       公开 PEER_LEAVE 仍带齐迁移字段(不再依赖三阶段 ACK 先完成)
//   (c) 顺带修复:onConfirm 里误用裸 isP2PMode.value(脚本作用域未定义,只在模板可用),
//       移动端 host 确认退出时直接 ReferenceError,迁移与退出都不执行;改用 props.isP2PMode
function showMenu() {
  haptics.click()
  showConfirm({
    title: '退出对局',
    message: '确定要退出对局吗？',
    confirmText: '退出',
    cancelText: '取消',
    onConfirm: () => {
      let migration = null
      if (props.isP2PMode && isNetworkHost.value && game.value) {
        const snapshot = game.value.getSnapshot()
        if (snapshot.phase === 'playing' || snapshot.phase === 'dealing' || snapshot.phase === 'trick_end') {
          const selfSeat = (typeof net.getSelfSeat === 'function') ? net.getSelfSeat() : 0
          const peers = net.getPeers ? net.getPeers() : new Map()
          const candidates = [
            (selfSeat + 2) % 4,
            (selfSeat + 1) % 4,
            (selfSeat + 3) % 4,
          ]
          const newHostSeat = candidates.find(s => s !== selfSeat && peers.has(s)) ?? 2
          const newHostAddress = peers.get(newHostSeat)?.hostAddress
          try { net.requestHostMigration && net.requestHostMigration(newHostSeat, snapshot) } catch (e) { /* swallow */ }
          migration = { newHostSeat, newHostAddress }
        }
      }
      exitGame(migration)
    },
  })
}

// 名字省略(对手 pill 用,最多 4 字)
function truncateName(s) {
  if (!s) return '玩家'
  return s.length > 4 ? s.slice(0, 3) + '…' : s
}

// emit:让父级 GameView 也能响应 seatClick(用于调试 / 后续扩展)
defineEmits(['seatClick', 'menu'])

// ★ P0-03 修复:移动端同样监听 host:lost,host 崩溃/断电/网络中断时提示并跳回首页,
//   避免手机玩家静默卡死。逻辑与 GameViewDesktop.vue 保持一致。
const onHostLost = async () => {
  try {
    const self = (() => {
      try { return net.getSelfInfo && net.getSelfInfo() } catch (e) { return null }
    })()
    if (self && typeof net.smartReconnectToPeers === 'function') {
      const routeRoomNo = String(route.query.roomNo || '')
      if (routeRoomNo) {
        const r = await net.smartReconnectToPeers(routeRoomNo, { self })
        if (r && r.ok) {
          console.info('[mobile host:lost] smartReconnectToPeers 找到新 host:', r.hostAddress)
          return
        }
        console.warn('[mobile host:lost] smartReconnectToPeers 失败:', r)
      }
    }
  } catch (e) {
    console.warn('[mobile host:lost] smartReconnectToPeers 异常:', e?.message || e)
  }
  router.push('/?force_disconnected=1&reason=' + encodeURIComponent('房主已断开连接,请重新开房'))
}

// v2.5:横屏检测 → 给 .page 加 .is-landscape class,让 CSS 在 scoped 内直接覆盖
// 横屏标准:landscape + max-height: 500px(手机横屏 h ≤ 430)
// GameView.vue 的 matchMedia 把横屏 844x390 也路由到 GameViewMobile,
// 所以这里必须加 .is-landscape 兜底,否则手机横屏布局挤压
const isLandscape = ref(false)
let mqLandscape = null
const updateLandscape = () => {
  if (!mqLandscape) return
  isLandscape.value = mqLandscape.matches
}
onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mqLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
    updateLandscape()
    if (mqLandscape.addEventListener) {
      mqLandscape.addEventListener('change', updateLandscape)
    } else if (mqLandscape.addListener) {
      mqLandscape.addListener(updateLandscape)
    }
  }
  // ★ UX-P1-07 修复:监听 resize / visualViewport 变化,重新计算 handOverlap
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateViewportWidth)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportWidth)
    }
  }
  net.on('host:lost', onHostLost)
})
onUnmounted(() => {
  if (mqLandscape) {
    if (mqLandscape.removeEventListener) {
      mqLandscape.removeEventListener('change', updateLandscape)
    } else if (mqLandscape.removeListener) {
      mqLandscape.removeListener(updateLandscape)
    }
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateViewportWidth)
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', updateViewportWidth)
    }
  }
  if (typeof net.off === 'function') {
    try { net.off('host:lost', onHostLost) } catch (e) { /* swallow */ }
  }
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
})
</script>

<style scoped>
/* ============================================================
 * v2.4 task 3: GameViewMobile 全局基础
 * ============================================================ */
.page {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  min-height: 100dvh;            /* iOS Safari 动态视口 */
  overflow: hidden;
  color: #fff;
  /* 防止 iOS Safari 双击放大 */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* 背景渐变(跟 desktop 一致) */
.bg-deep {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center top, #2a3a7a 0%, transparent 60%),
    linear-gradient(180deg, #1a1f4a 0%, #0a1233 50%, #050a1f 100%);
  z-index: 0;
}

/* ============================================================
 * v3.x:背景 — 椭圆 felt 翡翠绿 + 桌面外圈深绿(spec §3.1 + §3.6)
 * 复用 desktop 的视觉语言,移动端只调整椭圆比例,适应竖屏窄长比
 * ============================================================ */
.bg-felt {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 18%, rgba(119, 142, 222, 0.45), transparent 45%),
    linear-gradient(180deg, #222744 0%, #19152a 56%, #090910 100%);
  z-index: 0;
}
.bg-felt::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -60vh;
  width: 110vw;
  height: 130vh;
  min-width: 720px;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 50% 38%, rgba(156, 184, 255, 0.36), transparent 28%),
    repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),
    radial-gradient(ellipse at 50% 42%, #7387ce 0%, #435690 44%, #2f3768 74%, #202548 100%);
  box-shadow:
    inset 0 -34px 72px rgba(0,0,0,0.42),
    inset 0 4px 16px rgba(255,255,255,0.12);
  pointer-events: none;
  z-index: 1;
}

.bg-wood-edge {
  position: absolute;
  left: 50%;
  top: -64vh;
  width: 112vw;
  height: 136vh;
  min-width: 720px;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 50% 48%, transparent 0 67%, rgba(67, 40, 24, 0.9) 68%, #c18b51 72%, #6e4024 76%, transparent 77%),
    conic-gradient(from 18deg, #754425, #c18b51, #6d3e21, #ad7441, #553019, #c7965b, #754425);
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.5), inset 0 0 22px rgba(255, 235, 180, 0.14);
  z-index: 1;
  pointer-events: none;
}

/* v3.x:中央牌桌径向白光聚光(移动端)— 浮在桌面上方 */
.table-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 320px;
  height: 70%;
  pointer-events: none;
  background: radial-gradient(ellipse at center,
    rgba(255, 255, 255, 0.22) 0%,
    rgba(255, 250, 220, 0.1) 25%,
    transparent 70%);
  z-index: 1;
  mix-blend-mode: screen;
  animation: stage-glow-breathe 4s ease-in-out infinite;
}
@keyframes stage-glow-breathe {
  0%, 100% { opacity: 0.95; }
  50%      { opacity: 1; }
}

/* 全局按钮:touch-action 防止双击放大 */
button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-family: inherit;
}

/* ============================================================
 * 1. 顶部 HUD 8%(≤65px @812)
 * ============================================================ */
.hud-top {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: clamp(52px, 8vh, 65px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  z-index: 11;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.25) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: auto;
}

.hud-left {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.menu-btn {
  width: 44px;             /* Apple HIG ≥44px */
  height: 44px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease);
}
.menu-btn:active { transform: scale(0.92); }
.menu-icon { line-height: 1; }

.hud-card {
  background: linear-gradient(180deg, var(--accent-yellow, #FFC107) 0%, var(--accent-yellow-dark, #FFA000) 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 10px;
  padding: 2px 8px;
  text-align: center;
  min-width: 48px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  color: #4a2c00;
}
.hud-card.mult-card {
  background: linear-gradient(180deg, var(--accent-orange, #FF9800) 0%, var(--accent-orange-dark, #EF6C00) 100%);
}
.hud-label {
  font-size: 9px;
  color: rgba(74, 44, 0, 0.75);
  font-weight: bold;
  letter-spacing: 0.5px;
  line-height: 1.1;
}
.hud-value {
  font-size: 16px;          /* 桌面 20 → 移动 16,适配 56px 卡片 */
  font-weight: 900;
  line-height: 1.1;
}

.hud-right {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

/* 浮动计时器(我回合时) */
.clock-float {
  display: flex;
  align-items: baseline;
  gap: 1px;
  min-width: 48px;
  height: 44px;            /* 跟 menu-btn 一致,Apple HIG */
  padding: 0 10px;
  background: linear-gradient(180deg, var(--accent-orange, #FF9800) 0%, var(--accent-orange-dark, #EF6C00) 100%);
  border: 1.5px solid #fff;
  border-radius: 22px;
  color: #fff;
  font-weight: 900;
  box-shadow: 0 2px 8px rgba(239, 108, 0, 0.5);
  justify-content: center;
}
.clock-float.urgent {
  background: linear-gradient(180deg, #ef5350 0%, #c62828 100%);
  box-shadow: 0 2px 8px rgba(198, 40, 40, 0.7);
  animation: clock-shake 0.4s ease-in-out infinite;
}
@keyframes clock-shake {
  0%, 100% { transform: rotate(0) translateX(0); }
  20% { transform: rotate(-4deg) translateX(-1px); }
  40% { transform: rotate(4deg) translateX(1px); }
  60% { transform: rotate(-3deg) translateX(-1px); }
  80% { transform: rotate(3deg) translateX(1px); }
}
.clock-num { font-size: 18px; line-height: 1; }
.clock-unit { font-size: 11px; opacity: 0.85; }

/* 对手回合浮动条 */
.opponent-clock-float {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 48px;
  height: 44px;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 22px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: default;
  letter-spacing: 0.3px;
}
.opponent-name { max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opponent-sep { opacity: 0.4; }
.opponent-time { color: var(--accent-orange, #FF9800); font-weight: 900; font-family: monospace; }

/* 聊天按钮 */
.chat-btn {
  width: 44px;
  height: 44px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease);
}
.chat-btn:active { transform: scale(0.92); }
.chat-icon { line-height: 1; }

/* ============================================================
 * 2. 对家座位 15% (≤120px @812)
 * 复用 PlayerSeat,但通过 :deep() 隐藏 level / coins / progress
 * ============================================================ */
.seat-teammate {
  position: fixed;
  top: clamp(56px, 8vh, 70px);  /* HUD 下方 */
  left: 0; right: 0;
  display: flex;
  justify-content: center;
  z-index: 9;
  pointer-events: none;
}
.seat-teammate :deep(.teammate-compact) {
  pointer-events: auto;
  transform: scale(0.85);
  transform-origin: top center;
  /* 隐藏 level / coins / progress — 简化移动端显示 */
}
/* 移动端 teammate 只显示:头像 + 名字 + 牌堆 + 进度条(简化版) */
:deep(.teammate-compact .meta-coins),
:deep(.teammate-compact .meta-level) {
  display: none !important;
}
:deep(.teammate-compact .seat-info .seat-name) {
  max-width: 80px;
  font-size: 13px;
}
:deep(.teammate-compact) {
  min-width: auto;
  padding: 4px 6px 6px;
  gap: 4px;
}
:deep(.teammate-compact .seat-avatar) {
  width: 44px;
  height: 44px;
}
:deep(.teammate-compact .avatar-icon) {
  font-size: 22px;
}
:deep(.teammate-compact .seat-cardpile) {
  min-width: 28px;
  min-height: 22px;
  padding: 1px;
}
:deep(.teammate-compact .mini-back) {
  width: 10px;
  height: 14px;
}
:deep(.teammate-compact .pile-count) {
  font-size: 9px;
  min-width: 14px;
  padding: 0 2px;
}

/* ============================================================
 * 3. 左右对手 mini-pill
 * 不渲染整张 PlayerSeat,改用绝对定位 pill 节省空间
 * v2.4-p3: 位置从 50% (中央桌面正中央) 改到 24% (对家座位下方 + 桌面之上),
 *         避让 .table-area (top 32% + height ~22vh),不再被中央桌面遮挡
 * ============================================================ */
.seat-left-mobile,
.seat-right-mobile {
  position: fixed;
  top: 24%;
  z-index: 9;
  pointer-events: auto;
}
.seat-left-mobile { left: 6px; }
.seat-right-mobile { right: 6px; }

.opp-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 44px;            /* Apple HIG */
  padding: 0 8px;
  background: linear-gradient(180deg, rgba(20, 30, 70, 0.92) 0%, rgba(10, 18, 51, 0.96) 100%);
  border: 1.5px solid var(--color-opponent, #ef5350);
  border-radius: 22px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease);
  /* 窄屏上压缩 */
  max-width: 96px;
}
.opp-pill.is-turn {
  border-color: var(--gold, #FFD700);
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.5);
  animation: opp-pulse 1.2s ease-in-out infinite;
}
.opp-pill.is-done {
  opacity: 0.5;
  filter: grayscale(0.6);
}
.opp-pill:active { transform: scale(0.95); }
@keyframes opp-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}

.opp-avatar {
  font-size: 18px;
  line-height: 1;
  width: 28px;
  height: 28px;
  background: linear-gradient(180deg, var(--emerald-deep, #0a3d2c), var(--emerald-base, #14533b));
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.opp-name {
  max-width: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.opp-count {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--gold, #FFD700);
  border-radius: 9px;
  font-size: 10px;
  font-weight: 900;
  color: var(--gold, #FFD700);
  line-height: 16px;
  text-align: center;
  flex-shrink: 0;
}
.opp-count.urgent {
  background: rgba(255, 23, 68, 0.2);
  border-color: #ff1744;
  color: #ff1744;
  box-shadow: 0 0 8px rgba(255, 23, 68, 0.6);
  animation: opp-count-pulse 0.8s ease-in-out infinite;
}
@keyframes opp-count-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.1); }
}
.opp-done {
  color: var(--accent-green, #43A047);
  font-weight: bold;
  font-size: 14px;
}

/* ============================================================
 * 4. 中央牌桌 35%
 * 缩到 ~280×280,出牌区放大
 * v2.4-p3: top 23% → 32% (避开左右 mini-pill 的 24% 区域),
 *         height 缩到 clamp(150px, 22vh, 200px) 给手牌留更多空间
 * ============================================================ */
.table-area {
  position: fixed;
  top: 30%;
  left: 50%;
  transform: translateX(-50%);
  width: clamp(260px, 80vw, 360px);
  height: clamp(170px, 26vh, 240px);
  z-index: 4;
  pointer-events: none;
}
/* 移动端 TableCenter 缩放:整体放大到 0.75 */
.table-area :deep(.table-center-wrap) {
  margin-top: 0;
  height: 100%;
  width: 100%;
  transform: scale(0.75);
  transform-origin: center center;
}
.table-area :deep(.ellipse-table) {
  width: 100%;
  height: 100%;
  max-width: none;
}
.table-area :deep(.table-deco svg) {
  width: 220px;
  height: 110px;
}
/* 出牌堆放大,适合移动端触摸识别 */
.table-area :deep(.card-stack) {
  width: 240px;
  height: 110px;
}
.table-area :deep(.stack-card) {
  /* 让 CardPlay size=lg 在移动端保持 60x84,不变形 */
}
/* 信息条 pill 字号缩到 9px */
.table-area :deep(.table-info-pill) {
  font-size: 9px;
  padding: 2px 7px;
}
.table-area :deep(.first-tip-bottom .tip-emoji) { font-size: 11px; }
.table-area :deep(.first-tip-bottom .tip-name) { font-size: 10px; }
.table-area :deep(.first-tip-bottom .tip-act) { font-size: 10px; }

/* 状态条(发牌中 / 等待) */
.status-tip-mobile {
  position: fixed;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  z-index: 7;
  letter-spacing: 2px;
  backdrop-filter: blur(6px);
  min-width: 120px;
  text-align: center;
}
.deal-progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.deal-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd54f, #ffca28);
  border-radius: 2px;
  transition: width 80ms linear;
}

/* ============================================================
 * 5. 手牌 28%(≤225px @812)
 * 9 列 rank,每列 56px 宽,纵向叠 3 张
 * ============================================================ */
.hand-area {
  position: fixed;
  left: 0; right: 0;
  bottom: clamp(76px, 14vh, 115px);   /* 操作栏上方 */
  padding: 0 4px 6px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.55));
  z-index: 5;
  /* v2.5:发牌完手牌"立刻可见",去掉 opacity transition */
  transition: none;
}
.hand-area.disabled { opacity: 0.3; pointer-events: none; }
/* v2.5:发牌中手牌区隐藏(立刻切换,无 transition) */
.dealing .hand-area { opacity: 0; pointer-events: none; transition: none; }
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
  min-height: 110px;
  /* v2.5:左右 padding 4 → 16,加 12px 黑边(用户反馈"左右两侧留一些空间") */
  /* ★ P1-06 修复:右侧留出 ≥60px 安全区,避免智能理牌胶囊压住最右列 */
  padding: 8px 70px 8px 16px;
  gap: 0;
  /* v3.9:overflow-x auto + overflow-y visible 会被 CSS spec 强制升级为 auto
   *   (如果 overflow-x 不是 visible,overflow-y 必须也非 visible),导致竖叠多张同 rank
   *   牌的最上牌 top:-32 溢出手牌区顶部 32px 全部被裁 → 用户看到"4/5/7 牌上半看不到"。
   *   两个方向都 visible:牌可以溢出上下边界(顶部溢出 rank badge,底部溢出 count badge) */
  overflow: visible;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
/* 移动端手牌列:56px 宽,纵向叠 3 张
 * v2.4-p3: 列负 margin 让相邻牌的视觉边距从 12px 压到 2px,
 *         列 width 56px 不变 → 点击 hit area 仍 ≥ 44px (移动端规范)
 * v2.5: 列负 margin -10 → -16,列视觉间距更紧(用户反馈"自己手里的牌可以更紧密一些"),
 *       同时 .hand-inner 左右 padding 加到 16 让两侧留 12px 黑边 */
.hand-column {
  position: relative;
  width: 56px;             /* 桌面 78 → 移动 56(每屏装 9 列) */
  min-height: 84px;
  flex-shrink: 0;
  margin: 0;
  margin-left: calc(-1 * var(--overlap, 16px)); /* v2.5: 动态重叠,列数多时自动收紧避免裁切 */
  padding: 12px 0 2px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  border-right: 1.5px solid;
  border-image: linear-gradient(180deg,
    transparent,
    rgba(255, 255, 255, 0.18) 30%,
    rgba(255, 215, 0, 0.3) 50%,
    rgba(255, 255, 255, 0.18) 70%,
    transparent) 1;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease),
              background var(--t-fast, 120ms) var(--ease-out, ease);
}
.hand-column:first-child { margin-left: 0 !important; }
.hand-column:active { background: rgba(255, 255, 255, 0.07); }
.hand-column:last-child { border-right: none; }
.hand-column.is-selected {
  transform: translateY(-12px);
  background: rgba(255, 215, 0, 0.12);
  box-shadow: inset 0 0 0 2px var(--gold, #FFD700), 0 0 12px var(--gold-soft, rgba(255, 215, 0, 0.2));
}
.hand-column.is-selected::after {
  content: "";
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: -4px;
  height: 3px;
  border-radius: 3px;
  background: var(--gold-primary, #d4af37);
}

.col-rank {
  position: absolute;
  /* v3.9: top -16px → -52px,让 rank badge 真正浮在牌柱顶部上方
   *   (hand-card 多张同 rank 牌用 inline top: i*-16px,i=2 时 top=-32
   *    让最上牌溢出 hand-column 顶部 32px,旧 -16 会跟最上牌角标重叠,
   *    z-index 5 反而把"3♥"角标下半遮住 → 用户看到"3 牌上半看不到") */
  top: -52px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 18px;
  height: 14px;
  padding: 0 4px;
  background: linear-gradient(180deg, var(--emerald-deep, #0a3d2c), var(--emerald-base, #14533b));
  border: 1px solid var(--gold, #FFD700);
  color: var(--gold, #FFD700);
  font-size: 9px;
  font-weight: 900;
  line-height: 12px;
  text-align: center;
  border-radius: 7px;
  z-index: 5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.col-rank.is-level-rank {
  background: linear-gradient(180deg, #FFA000, #FF6F00);
  color: #fff;
  border-color: #FFD54F;
}
.hand-column.is-joker .col-rank {
  background: linear-gradient(180deg, #b71c1c, #4a0000);
  color: #fff;
  border-color: var(--red-card, #E74C3C);
}

.col-count {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 18px;
  height: 12px;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--accent-orange, #FF9800);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 12px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 50;
}
.hand-column.is-selected .col-count {
  background: var(--gold, #FFD700);
  color: var(--text-on-card, #1A237E);
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.6);
}

/* 单张手牌:56 列宽 → 牌 44×62 居中 */
.hand-card {
  position: absolute;
  left: 6px;               /* (56 - 44) / 2 = 6 居中 */
  width: 44px;
  height: 62px;
  --hand-card-w: 44px;
  --hand-card-h: 62px;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease);
}

/* ============================================================
 * 6. 操作栏 14%(≤115px @812)
 * 4 大按钮:智能理牌 / 不出 / 提示 / 出牌
 * ============================================================ */
/* 智能理牌悬浮按钮(手牌区右上角) */
.smart-sort-float {
  position: fixed;
  right: 10px;
  bottom: calc(clamp(76px, 14vh, 115px) + 12px);
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
}
.smart-sort-float:active:not(:disabled) { transform: scale(0.95); }
.smart-sort-float:disabled { opacity: 0.4; cursor: not-allowed; }
/* ★ P1-06 修复:悬浮按钮本身可点击 */
.smart-sort-float { pointer-events: auto; }
.ss-icon { font-size: 14px; line-height: 1; }
.ss-text { line-height: 1; }

.action-bar {
  position: fixed;
  left: 0; right: 0;
  bottom: 0;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr; /* 出牌略宽 */
  gap: 8px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.7) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 8;
  /* ★ P1-06 修复:底栏透明区域不拦截其上方手牌区下沿的点击 */
  pointer-events: none;
}

.action-bar button {
  pointer-events: auto;
  height: 56px;
  min-height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease),
              filter var(--t-fast, 120ms) var(--ease-out, ease);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  letter-spacing: 1px;
}
.action-bar button:active:not(:disabled) { transform: scale(0.95); }
.action-bar button:disabled { opacity: 0.4; cursor: not-allowed; }

.action-icon { font-size: 20px; line-height: 1; }
.action-text { font-size: 12px; line-height: 1; }

.action-btn-pass {
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.action-btn-hint {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.action-btn-hint.active {
  background: rgba(244, 196, 94, 0.18);
  border-color: var(--gold-primary, #d4af37);
  color: var(--gold-bright, #ffd700);
  animation: hint-pulse 1.1s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(244, 196, 94, 0); }
  50%      { box-shadow: 0 0 12px rgba(244, 196, 94, 0.35); }
}
.action-btn-play {
  background: linear-gradient(180deg, #ffd978 0%, #e9ad3f 100%);
  color: #2a1d08;
  border: 1.5px solid #fff8dc;
  box-shadow: 0 6px 18px rgba(233, 173, 63, 0.28);
}

/* ============================================================
 * 7. Toast(禁改名 / host 迁移 / 聊天短语) — 跟 desktop 一致
 * ============================================================ */
.nick-toast {
  position: fixed;
  top: 110px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  border: 1.5px solid var(--gold, #FFD700);
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  white-space: nowrap;
  pointer-events: none;
}

.host-mig-toast {
  position: fixed;
  top: 110px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.95), rgba(255, 165, 0, 0.95));
  border: 2px solid #fff;
  border-radius: 12px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 800;
  color: #1a1f4a;
  letter-spacing: 1px;
  z-index: 250;
  box-shadow: 0 6px 24px rgba(255, 165, 0, 0.6);
  white-space: nowrap;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.host-mig-toast.is-self {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(33, 150, 243, 0.95));
  color: #fff;
  box-shadow: 0 6px 24px rgba(33, 150, 243, 0.6);
}
.mig-icon { font-size: 18px; }
.mig-text { font-size: 13px; }

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

/* ============================================================
 * 8. v2.5:横屏兜底(.page.is-landscape)
 * 844x390 手机横屏走 GameViewMobile(因为 GameView.vue matchMedia 判定 landscape + h≤500 → mobile),
 * 原本竖屏布局的 4 区域分配(8% / 15% / 35% / 28% / 14%)挤不下 390 高度,
 * 用 .is-landscape class 钩子重新分配:50(顶HUD) / 80(队友+左右AI) / 100(桌面) / 110(手牌) / 50(操作栏)
 * ============================================================ */
.page.is-landscape {
  /* 重新分配高度:5 段堆叠 */
}

/* 顶 HUD 压缩到 50px */
.page.is-landscape .hud-top {
  height: 50px;
  padding: 4px calc(6px + env(safe-area-inset-left, 0px)) 4px calc(6px + env(safe-area-inset-right, 0px));
}
.page.is-landscape .hud-value { font-size: 14px; }
.page.is-landscape .hud-label { font-size: 10px; }
.page.is-landscape .menu-btn,
.page.is-landscape .chat-btn {
  width: 44px;
  height: 44px;
  font-size: 18px;
}
.page.is-landscape .clock-float {
  height: 44px;
  min-width: 44px;
  padding: 0 10px;
}
.page.is-landscape .clock-num { font-size: 16px; }
.page.is-landscape .opponent-clock-float {
  height: 44px;
  min-width: 44px;
  padding: 0 10px;
  font-size: 12px;
}

/* 队友座位(顶 HUD 之下):top 8% → top 50px,缩 0.6 */
.page.is-landscape .seat-teammate {
  top: 50px;
}
.page.is-landscape .seat-teammate :deep(.teammate-compact) {
  transform: scale(0.55);
  transform-origin: top center;
  animation: none;
}

/* 左右 AI 座位(队友之下):top 24% → top 90px,缩 0.55 */
.page.is-landscape .seat-left-mobile,
.page.is-landscape .seat-right-mobile {
  top: 90px;
}
.page.is-landscape .opp-pill {
  transform: scale(0.7);
  transform-origin: top left;
  animation: none;
}
.page.is-landscape .seat-right-mobile .opp-pill {
  transform-origin: top right;
}

/* 中央桌面:top 32% → top 140px,height 22vh → 90px */
.page.is-landscape .table-area {
  top: 140px;
  height: 90px;
  width: clamp(180px, 40vw, 260px);
}
.page.is-landscape .table-area :deep(.table-center-wrap) {
  height: 100%;
  width: 100%;
  margin-top: 0;
  transform: none;  /* 取消 mobile 缩 0.6,直接渲染 */
}
.page.is-landscape .table-area :deep(.ellipse-table) {
  width: 100%;
  height: 100%;
  max-width: none;
}
.page.is-landscape .table-area :deep(.table-deco svg) {
  width: 160px;
  height: 80px;
}
.page.is-landscape .table-area :deep(.card-stack) {
  width: 160px;
  height: 70px;
}
.page.is-landscape .table-area :deep(.table-info-pill) {
  font-size: 8px;
  padding: 1px 5px;
}
.page.is-landscape .table-area :deep(.table-info-top) {
  top: -16px;
  gap: 4px;
}
.page.is-landscape .table-area :deep(.first-tip-bottom) {
  /* v3.9:first-tip-bottom 已挪进 ellipse-table 内部,这里 bottom 用正值
   *   (4px) 让胶囊贴椭圆底内沿,溢出椭圆部分被 ellipse overflow:hidden 裁掉
   *   → 横屏 9 个手牌顶数字再也不被胶囊压住 */
  bottom: 4px;
  padding: 2px 8px;
  font-size: 10px;
}

/* 状态条:从 top 18% 挪到顶 HUD 之下 */
.page.is-landscape .status-tip-mobile {
  top: 110px;
}

/* 手牌:bottom 14vh → bottom 56px(操作栏之上)
 * v2.5 patch: overflow hidden 改成 visible + 加 padding-top 12 + max-height 110,
 *   否则 col-rank (top -10) 浮在 .hand-area 顶外的部分会被裁,用户看不到"级"badge */
.page.is-landscape .hand-area {
  bottom: 56px;
  padding: 12px calc(4px + env(safe-area-inset-left, 0px)) 6px calc(4px + env(safe-area-inset-right, 0px));
  max-height: 120px;
  overflow: visible;
}
.page.is-landscape .hand-inner {
  min-height: 50px;
  padding: 4px 16px 6px;
  gap: 0;
}
.page.is-landscape .hand-column {
  width: 44px;
  min-height: 44px;
  margin-left: -6px;
  padding: 6px 0 2px;
}
.page.is-landscape .hand-column .hand-card {
  left: 4px;
  width: 36px;
  height: 50px;
  --hand-card-w: 36px;
  --hand-card-h: 50px;
}
/* 限制手牌卡竖叠 top,牌顶不浮出 .hand-area(只 col-rank 浮出 8px) */
.page.is-landscape .hand-column .hand-card:nth-child(1) { top: 0 !important; }
.page.is-landscape .hand-column .hand-card:nth-child(2) { top: -4px !important; }
.page.is-landscape .hand-column .hand-card:nth-child(3) { top: -8px !important; }
.page.is-landscape .hand-column .hand-card:nth-child(n+4) { top: -12px !important; }
.page.is-landscape .col-rank {
  /* v3.9: top -8px → -34px,横屏 hand-card 最多 top:-28px,
   *   让 rank badge 浮在最上牌之上,不被遮挡 */
  top: -34px;
  height: 13px;
  font-size: 10px;
  min-width: 16px;
  z-index: 6;
}
.page.is-landscape .col-count {
  bottom: -4px;
  height: 12px;
  font-size: 10px;
  min-width: 16px;
  padding: 0 2px;
  z-index: 6;
}

/* 操作栏:bottom 0,height 50px */
.page.is-landscape .action-bar {
  bottom: 0;
  height: 56px;
  padding: 4px calc(6px + env(safe-area-inset-left, 0px)) calc(4px + env(safe-area-inset-bottom, 0px)) calc(6px + env(safe-area-inset-right, 0px));
  grid-template-columns: 0.9fr 0.9fr 1.2fr; /* ★ UX-P1-01 修复:3 个按钮对应 3 列 */
  gap: 6px;
}
.page.is-landscape .action-bar button {
  height: 48px;
  min-height: 44px;
  font-size: 14px;
  letter-spacing: 0.5px;
}
.page.is-landscape .action-icon { font-size: 18px; }
.page.is-landscape .action-text { font-size: 12px; }

/* toast 缩 */
.page.is-landscape .nick-toast,
.page.is-landscape .host-mig-toast {
  top: 60px;
  font-size: 11px;
  padding: 6px 14px;
}

/* ===== 结算遮罩 (mobile) ===== */
.result-mask-mobile {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
  padding: 16px;
}
.result-card-mobile {
  width: 100%;
  max-width: 340px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,244,255,0.94));
  border: 1px solid rgba(255,255,255,0.55);
  border-radius: 18px;
  padding: 20px 18px 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  color: #1a1a2e;
}
.result-title-mobile {
  margin: 0 0 6px;
  font-size: 22px;
  text-align: center;
  background: linear-gradient(90deg, #2b2b52, #4a4a8a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.result-meta-mobile {
  margin: 0 0 14px;
  text-align: center;
  font-size: 13px;
  color: #555;
}
.result-list-mobile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.result-row-mobile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(0,0,0,0.04);
  font-size: 14px;
}
.result-row-mobile.rank-0 { background: linear-gradient(90deg, rgba(255,215,0,0.18), rgba(255,215,0,0.05)); }
.result-row-mobile.rank-1 { background: rgba(212,175,55,0.12); }
.result-row-mobile.rank-2 { background: rgba(120,120,150,0.12); }
.result-row-mobile.rank-3 { background: rgba(180,80,80,0.12); }
.result-rank-mobile { font-weight: 800; min-width: 38px; }
.result-name-mobile { flex: 1; text-align: center; }
.result-team-mobile { font-size: 12px; }
.result-actions-mobile {
  display: flex;
  gap: 10px;
}
.r-btn-mobile {
  flex: 1;
  padding: 12px 0;
  border: none;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.r-btn-mobile.primary {
  background: linear-gradient(180deg, #f7d06f, #d4a827);
  color: #2a1f08;
  box-shadow: 0 4px 12px rgba(212,160,39,0.35);
}
.r-btn-mobile.ghost {
  background: rgba(0,0,0,0.06);
  color: #444;
  border: 1px solid rgba(0,0,0,0.12);
}

/* 发牌超时兜底 */
.deal-timeout-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 110;
  backdrop-filter: blur(6px);
  padding: 16px;
}
.deal-timeout-card {
  width: 100%; max-width: 300px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,244,255,0.92));
  border-radius: 18px; padding: 22px 18px 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  color: #1a1a2e; text-align: center;
}
.deal-timeout-title { margin: 0 0 6px; font-size: 20px; }
.deal-timeout-hint { margin: 0 0 18px; font-size: 13px; color: #555; }
.deal-timeout-actions { display: flex; gap: 10px; }
.deal-timeout-btn { flex: 1; padding: 12px 0; border: none; border-radius: 24px; font-size: 15px; font-weight: 700; cursor: pointer; }
.deal-timeout-btn.primary { background: linear-gradient(180deg, #f7d06f, #d4a827); color: #2a1f08; }
.deal-timeout-btn.ghost { background: rgba(0,0,0,0.06); color: #444; border: 1px solid rgba(0,0,0,0.12); }
</style>
