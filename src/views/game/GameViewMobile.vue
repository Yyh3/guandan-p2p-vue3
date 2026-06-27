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
          <span class="menu-icon">≡</span>
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
        <span v-if="seatData.left.isDone" class="opp-done">✓</span>
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
        <span v-if="seatData.right.isDone" class="opp-done">✓</span>
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
      <span v-if="isDealing">🃏 发牌中...</span>
      <span v-else-if="phase === 'finished'">本局结束</span>
    </div>

    <!-- ===== 7. 手牌 28% (按 rank 分组竖叠,9 列 56px 宽) ===== -->
    <div class="hand-area" :class="{ disabled: !myTurn || isDealing, 'is-urgent': urgent && myTurn }">
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
          <!-- v0.4.3:大小王列隐藏 col-rank 标签(卡通小丑已自带视觉标识) -->
          <div
            v-if="!col.isJoker"
            class="col-rank"
            :class="{ 'is-level-rank': isLevel({ suit: 0, rank: col.rank }) }"
          >{{ colRankLabel(col) }}</div>
          <div class="col-count">×{{ col.cards.length }}</div>
          <div
            v-for="(c, i) in col.cards.slice(0, 3)"
            :key="cardKey(c) + '-' + i"
            class="hand-card"
            :style="{ zIndex: i + 1, top: (i * -16) + 'px' }"
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

    <!-- ===== 8. 操作栏 14% (4 大按钮) ===== -->
    <div v-if="myTurn && !isDealing" class="action-bar">
      <button
        class="action-btn-smart"
        :disabled="myHand.length === 0"
        @click="onAutoFindBest"
        title="智能理牌 · 自动凑炸弹/顺子/三带二"
      >
        <span class="action-icon">✨</span>
        <span class="action-text">理牌</span>
      </button>
      <button
        class="action-btn-pass"
        :disabled="!lastPlay"
        @click="onPass"
        title="不出"
      >
        <span class="action-icon">🚫</span>
        <span class="action-text">不出</span>
      </button>
      <button
        class="action-btn-hint"
        :disabled="myHand.length === 0"
        @click="onHintToggle(true)"
        :class="{ active: hintCards.length > 0 }"
        title="提示"
      >
        <span class="action-icon">💡</span>
        <span class="action-text">提示</span>
      </button>
      <button
        class="action-btn-play"
        :disabled="selectedCount === 0"
        @click="onPlay"
        title="出牌"
      >
        <span class="action-icon">✓</span>
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
        <span class="mig-icon">👑</span>
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
import { ref, onMounted, onUnmounted } from 'vue'

import PlayerSeat from '@/components/PlayerSeat.vue'
import TableCenter from '@/components/TableCenter.vue'
import EffectLayer from '@/components/EffectLayer.vue'
import CardPlay from '@/components/CardPlay.vue'
import ChatQuickPanel from '@/components/ChatQuickPanel.vue'

import { useGameLogic } from './useGameLogic.js'

// props: 跟 desktop 一样接 selfSeat / ghostRank / isP2PMode
const props = defineProps({
  selfSeat: { type: Number, default: 0 },
  ghostRank: { type: Number, default: undefined },
  isP2PMode: { type: Boolean, default: false },
  // ★ v0.4.9:AI 难度
  difficulty: { type: String, default: 'medium' },
})

// 占位:给 useGameLogic 注入 mainActionsRef(虽然 mobile 不渲染桌面版 MainActions,
// 仍需要 ref 接口,内部多处调 setShowing(false) 关掉提示气泡)
const mainActionsRef = ref(null)

const {
  // state
  round, levelLabel, multiplier,
  players, myHand, selectedColKeys, tableCards, lastPlay,
  phase, currentPlayer, turnTimeLeft,
  isDealing, hintCards, bombFx, floatingPasses, suitFilter, isShaking,
  showNickToast, showChatPanel, chatPhraseToast,
  hostMigrationToast, hostMigrationBadge, urgent,
  // computed
  myTurn, currentPlayerName, firstPlayerName, firstPlayerEmoji, tipText,
  seatData, handColumns, selectedCount,
  // methods
  onNickEditRequest, onChatSelect, onHostMigrated,
  playerName, cardKey, isHinted, isLevel, rankColor,
  columnKey, colMinHeight, colRankLabel, toggleCol, onClear,
  selectedCardsFromColumns, onSortHand, onAutoFindBest, onSuitTab,
  onHintToggle, onAutoPlay, onPlay, onPass, onNext, onChat, onSeatClick,
  onIcon, showMenu,
} = useGameLogic({
  mainActionsRef,
  selfSeat: props.selfSeat,
  ghostRank: props.ghostRank,
  isP2PMode: props.isP2PMode,
  // ★ v0.4.9:透传 AI 难度
  difficulty: props.difficulty,
})

// 名字省略(对手 pill 用,最多 4 字)
function truncateName(s) {
  if (!s) return '玩家'
  return s.length > 4 ? s.slice(0, 3) + '…' : s
}

// emit:让父级 GameView 也能响应 seatClick(用于调试 / 后续扩展)
defineEmits(['seatClick', 'menu'])

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
})
onUnmounted(() => {
  if (mqLandscape) {
    if (mqLandscape.removeEventListener) {
      mqLandscape.removeEventListener('change', updateLandscape)
    } else if (mqLandscape.removeListener) {
      mqLandscape.removeListener(updateLandscape)
    }
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
  top: -86vh;
  width: 124vw;
  height: 160vh;
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
  top: -98vh;
  width: 132vw;
  height: 178vh;
  min-width: 760px;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 50% 48%, transparent 0 66%, rgba(67, 40, 24, 0.94) 67%, #c18b51 71%, #6e4024 76%, transparent 77%),
    conic-gradient(from 18deg, #754425, #c18b51, #6d3e21, #ad7441, #553019, #c7965b, #754425);
  box-shadow: 0 28px 54px rgba(0, 0, 0, 0.56), inset 0 0 28px rgba(255, 235, 180, 0.17);
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
  top: 32%;             /* 抬到 mini-pill 下方,不再被遮挡 */
  left: 50%;
  transform: translateX(-50%);
  width: clamp(240px, 70vw, 300px);
  height: clamp(150px, 22vh, 200px);
  z-index: 4;
  pointer-events: none;
}
/* 移动端 TableCenter 缩放:整体 transform scale */
.table-area :deep(.table-center-wrap) {
  margin-top: 0;
  height: 100%;
  width: 100%;
  transform: scale(0.6);
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
  padding: 8px 16px;
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
  margin-left: -16px;      /* v2.5: -10 → -16,列视觉更紧 */
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
.hand-column:first-child { margin-left: 0; }
.hand-column:active { background: rgba(255, 255, 255, 0.07); }
.hand-column:last-child { border-right: none; }
.hand-column.is-selected {
  transform: translateY(-12px);
  background: rgba(255, 215, 0, 0.12);
  box-shadow: inset 0 0 0 2px var(--gold, #FFD700), 0 0 12px var(--gold-soft, rgba(255, 215, 0, 0.2));
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
.action-bar {
  position: fixed;
  left: 0; right: 0;
  bottom: 0;                              /* 贴屏幕底,iOS 安全区自适应 */
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr; /* 4 等分 */
  gap: 6px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.7) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 8;
}

.action-bar button {
  height: 56px;                            /* Apple HIG: ≥44,这里加到 56 让大拇指舒服 */
  min-height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 16px;                          /* iOS Safari 避免自动放大的下限 */
  font-weight: 900;
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
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

.action-btn-smart {
  background: linear-gradient(180deg, var(--orange-warm, #FFB300) 0%, var(--orange-bright, #FF6D00) 100%);
  color: #4a2c00;
  border: 1.5px solid #fff;
  box-shadow:
    0 3px 8px rgba(255, 109, 0, 0.5),
    0 0 12px rgba(255, 179, 0, 0.4);
}
.action-btn-pass {
  background: linear-gradient(180deg, #ffc107 0%, #ff8f00 100%);
  color: #4a2c00;
}
.action-btn-hint {
  background: linear-gradient(180deg, #78909c 0%, #455a64 100%);
  color: #fff;
}
.action-btn-hint.active {
  background: linear-gradient(180deg, #ff9800 0%, #ef6c00 100%);
  box-shadow:
    0 3px 8px rgba(255, 109, 0, 0.5),
    0 0 12px rgba(255, 179, 0, 0.6);
  animation: hint-pulse 1.1s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { box-shadow: 0 3px 8px rgba(255, 109, 0, 0.5), 0 0 12px rgba(255, 179, 0, 0.6); }
  50%      { box-shadow: 0 3px 8px rgba(255, 109, 0, 0.7), 0 0 20px rgba(255, 179, 0, 0.9); }
}
.action-btn-play {
  background: linear-gradient(180deg, #42a5f5 0%, #1976d2 100%);
  color: #fff;
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
  padding: 4px 6px;
}
.page.is-landscape .hud-value { font-size: 13px; }
.page.is-landscape .hud-label { font-size: 8px; }
.page.is-landscape .menu-btn,
.page.is-landscape .chat-btn {
  width: 36px;
  height: 36px;
  font-size: 16px;
}
.page.is-landscape .clock-float {
  height: 36px;
  min-width: 40px;
  padding: 0 8px;
}
.page.is-landscape .clock-num { font-size: 14px; }
.page.is-landscape .opponent-clock-float {
  height: 36px;
  min-width: 40px;
  padding: 0 8px;
  font-size: 10px;
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

/* 手牌:bottom 14vh → bottom 50px(操作栏之上)
 * v2.5 patch: overflow hidden 改成 visible + 加 padding-top 12 + max-height 110,
 *   否则 col-rank (top -10) 浮在 .hand-area 顶外的部分会被裁,用户看不到"级"badge */
.page.is-landscape .hand-area {
  bottom: 50px;
  padding: 12px 4px 6px;
  max-height: 110px;
  overflow: visible;
}
.page.is-landscape .hand-inner {
  min-height: 50px;
  padding: 4px 16px 6px;
  gap: 0;
}
.page.is-landscape .hand-column {
  width: 36px;
  min-height: 40px;
  margin-left: -6px;
  padding: 6px 0 2px;
}
.page.is-landscape .hand-column .hand-card {
  left: 2px;
  width: 32px;
  height: 46px;
  --hand-card-w: 32px;
  --hand-card-h: 46px;
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
  height: 11px;
  font-size: 8px;
  min-width: 14px;
  z-index: 6;
}
.page.is-landscape .col-count {
  bottom: -4px;
  height: 10px;
  font-size: 8px;
  min-width: 14px;
  padding: 0 2px;
  z-index: 6;
}

/* 操作栏:bottom 0,height 50px */
.page.is-landscape .action-bar {
  bottom: 0;
  height: 50px;
  padding: 4px 6px;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 4px;
}
.page.is-landscape .action-bar button {
  height: 42px;
  min-height: 42px;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.page.is-landscape .action-icon { font-size: 14px; }
.page.is-landscape .action-text { font-size: 9px; }

/* toast 缩 */
.page.is-landscape .nick-toast,
.page.is-landscape .host-mig-toast {
  top: 60px;
  font-size: 11px;
  padding: 6px 14px;
}
</style>
