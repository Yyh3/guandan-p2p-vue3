<template>
  <div class="page" :class="{ dealing: isDealing, bomb: isShaking, 'is-landscape': isLandscape }">
    <!-- v3.x:背景 — 椭圆牌桌 --felt-base 渐变 + 木纹边 + 桌面外圈深绿径向渐变到 --bg-deep (spec §3.1) -->
    <div class="bg-felt"></div>
    <div class="bg-wood-edge" aria-hidden="true"></div>

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

    <!-- v3.x:中央牌桌容器 — 加 3D 透视 + 径向白光聚光 + 木纹边 -->
    <div class="table-stage">
      <!-- 桌面上方微模糊 + 中央径向白光聚光(spec §3.5) -->
      <div class="table-glow" aria-hidden="true"></div>
      <div class="table-backdrop" aria-hidden="true"></div>
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
          <!-- v3.6:列顶 rank 数字标签(7/9/10/K/2)
                 v0.4.3:大小王列隐藏 rank 标签(卡通小丑占满牌面已自带视觉标识,不需要"王"字) -->
          <div
            v-if="!col.isJoker"
            class="col-rank"
            :class="{ 'is-level-rank': isLevel({ suit: 0, rank: col.rank }) }"
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

    <!-- v2.1 P3:host 迁移提示 — 新 host 显示"你已成为新房主",旁观者显示"X 已成为新房主" -->
    <transition name="toast">
      <div v-if="hostMigrationToast" class="host-mig-toast" :class="{ 'is-self': hostMigrationToast.isMyself }" role="status" aria-live="polite">
        <span class="mig-icon">👑</span>
        <span class="mig-text">{{ hostMigrationToast.text }}</span>
      </div>
    </transition>

    <!-- v2.1 P3:host 迁移角标 — 标题旁的小标签(让用户知道已迁移) -->
    <div v-if="hostMigrationBadge" class="host-mig-badge" title="host 已迁移">
      已迁移
    </div>

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
      @confirmed="onNickEditorConfirmed"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'

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

import { useGameLogic } from './useGameLogic.js'

const router = useRouter()

// v2.4 task 2:本组件是 desktop 布局,从父组件 GameView.vue 接 props:
//   - selfSeat (Number 0-3):自己的座位(联机时由父组件传)
//   - ghostRank (Number,可选):鬼牌 rank
//   - isP2PMode (Boolean,可选):是否 P2P 联机
// props 透传给 useGameLogic composable
const props = defineProps({
  selfSeat: { type: Number, default: 0 },
  ghostRank: { type: Number, default: undefined },
  isP2PMode: { type: Boolean, default: false },
  // ★ v0.4.9:AI 难度
  difficulty: { type: String, default: 'medium' },
})

// v2.4 task 1:纯逻辑抽到 useGameLogic.js composable
// 这里只声明 mainActionsRef,让 composable 拿到 setShowing(false) 接口
const mainActionsRef = ref(null)

// v2.5:横屏检测 → 给 .page 加 .is-landscape class,让 CSS 在 scoped 内直接覆盖(不依赖 :deep + @media 嵌套)
// 横屏标准:landscape + max-height: 500px(手机横屏 h ≤ 430)
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

const {
  // state
  round, levelLabel, nextLevelLabel, levelUp, multiplier,
  players, myHand, selectedColKeys, tableCards, lastPlay,
  phase, currentPlayer, firstPlayer, turnTimeLeft, finishedOrder,
  isDealing, hintCards, bombFx, floatingPasses, suitFilter, isShaking,
  showNickToast, showChatPanel, chatPhraseToast,
  hostMigrationToast, hostMigrationBadge, urgent,
  isP2PMode, selfSeat, game,
  // computed
  myTurn, currentPlayerName, firstPlayerName, firstPlayerEmoji, tipText,
  seatData, handColumns, selectedCount,
  // methods
  onNickEditRequest, onChatSelect, onHostMigrated,
  playerName, cardKey, isHinted, isLevel, rankColor,
  columnKey, colMinHeight, colRankLabel, toggleCol, onClear,
  selectedCardsFromColumns, onSortHand, onAutoFindBest, onSuitTab,
  onHintToggle, onAutoPlay, onPlay, onPass, onNext, onChat, onSeatClick,
  onIcon, initGame,
} = useGameLogic({
  mainActionsRef,
  selfSeat: props.selfSeat,
  ghostRank: props.ghostRank,
  isP2PMode: props.isP2PMode,
  // ★ v0.4.9:透传 AI 难度(从 URL query 读)
  difficulty: props.difficulty,
})

// 路由相关的 UI 跳转(只能组件层做)
function onBack() { router.push('/') }
function showMenu() {
  if (!confirm('退出对局?')) return
  // ★ 静态审查 v0.4.5 N-3 闭环:host 主动退出时,把对局让给队友(seat 2)
  //   之前 host 直接关掉 net → joiner 端走兜底(6-8s 心跳超时感知 host 掉线),
  //   现在 host 主动调 requestHostMigration 把当前 game state 传给新 host,
  //   joiner 端实时收到 host:migrated 事件,牌局无缝继续。
  //   仅当:isP2P 模式 + host(selfSeat=0) + 对局进行中(phase=playing/dealing/trick_end)
  if (isP2PMode.value && selfSeat.value === 0 && game.value) {
    const st = game.value.getState()
    if (st.phase === 'playing' || st.phase === 'dealing' || st.phase === 'trick_end') {
      const snapshot = {
        hands: st.hands, tableCards: st.tableCards, currentPlayer: st.currentPlayer,
        firstPlayer: st.firstPlayer, leaderPlayer: st.leaderPlayer,
        lastPlay: st.lastPlay, finishedOrder: st.finishedOrder,
        trickHistory: st.trickHistory, passCount: st.passCount,
        tribute: st.tribute, ghost: st.ghost,
        levelRank: st.levelRank, teamLevels: st.teamLevels, phase: st.phase,
      }
      try { net.requestHostMigration && net.requestHostMigration(2, snapshot) } catch (e) { /* swallow */ }
    }
  }
  router.push('/')
}
// NicknameEditor 用 — 仅占位保留挂载点(永远 false,见 template v-if="false")
function onNickEditorConfirmed(p) {
  storage.setNickname(p.nickname)
  storage.setAvatar(p.avatar)
  try {
    const seat = (typeof net !== 'undefined' && net.getSelfSeat) ? net.getSelfSeat() : 0
    players.value[seat].name = p.nickname
    players.value[seat].avatar = p.avatar
  } catch (e) {}
  try { net.broadcast({ type: 'NICK_UPDATE', payload: p }) } catch (e) {}
}
</script>

<style scoped>
/* ============================================================
 * v3.x UI 全局布局(UI-REDESIGN-V3-SPEC.md §3.1-3.5)
 * 椭圆 felt 牌桌 + 木纹边 + 径向白光聚光 + 桌面外圈深绿径向
 * 保留:4-tab P2P 联机事件接口 + 现有 emit / props / 触摸目标
 * ============================================================ */
.page {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: #fff;
}

/* ============================================================
 * v3.x:椭圆 felt 牌桌底色 — 翡翠绿径向渐变(spec §3.1)
 * 渐变从中心亮(emerald-bright)→ 中段(emerald-base)→ 边缘深(emerald-deep)
 * 跟 --felt-base token 一致,这里直接用变量以便后续调整
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

/* 兼容旧 .bg-deep 类名(防止其它 view / 旧 CSS 引用)— 兜底深绿 */
.bg-deep {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, #1f7a55 0%, #14533b 60%, #0a3d2c 100%);
  z-index: 0;
}

/* ============================================================
 * v3.x:中央牌桌舞台(table-stage) — 3D 透视倾斜 + 径向白光聚光 + 桌面微模糊 (spec §3.2+§3.5)
 *  - 3D 透视: rotate(-2deg) perspective(800px) 营造"俯视感"
 *  - 径向白光: 桌面中央 + 头顶聚光效果
 *  - 桌面微模糊: backdrop-filter: blur(2px)
 * 不动 TableCenter 子组件内部布局,只在 stage 层叠效果
 * ============================================================ */
.table-stage {
  position: relative;
  z-index: 2;
  /* 3D 透视倾斜: rotate(-2deg) 比 -3deg 更温和,避免影响触摸定位 */
  transform: rotate(-2deg) perspective(800px);
  transform-origin: center 30%;
  /* 微模糊(spec §3.5 末段):整个桌面上方有朦胧感 */
  isolation: isolate;
}

/* v3.x:中央牌组的径向白光聚光 — 浮在桌面上,营造"打灯"效果 */
.table-glow {
  position: fixed;
  top: 30%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 70vw;
  max-width: 720px;
  height: 60vh;
  max-height: 480px;
  pointer-events: none;
  background: radial-gradient(ellipse at center,
    rgba(255, 255, 255, 0.18) 0%,
    rgba(255, 250, 220, 0.08) 25%,
    transparent 70%);
  z-index: 2;
  mix-blend-mode: screen;
  /* 微微"呼吸" — 不影响测试断言(keyframe 只动 opacity) */
  animation: stage-glow-breathe 4s ease-in-out infinite;
}
@keyframes stage-glow-breathe {
  0%, 100% { opacity: 0.95; }
  50%      { opacity: 1; }
}

/* v3.x:桌面上方微模糊层 — 跟 stage 重叠的 backdrop-filter 层 */
.table-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: none;
  /* 仅对 stage 区域做微模糊(用 radial mask 让模糊只出现在中央) */
  background: radial-gradient(ellipse 70% 50% at 50% 35%,
    rgba(31, 122, 85, 0.15) 0%,
    transparent 70%);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 2;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 90%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 90%);
}

/* v3.x:中央出牌区卡牌透视 — 主牌 scale(1.05) / 副牌 scale(0.95) (spec §3.2)
 *  .card-stack 在 TableCenter 内部,这里用 :deep() 跨组件选择
 *  注意:不修改 TableCenter.vue(不在本阶段 scope),只通过外层 transform 影响
 *  v3.x 已对 .table-stage 加 rotate(-2deg) perspective(800px),所有子元素自然继承透视
 */
:deep(.table-center-wrap) {
  /* 让透视 800px 在 stage 层就生效,这里只继承 */
  transform-style: preserve-3d;
}
/* 主牌(中间那张)— 抬升 1.05,阴影加深 */
:deep(.table-center-wrap .card-stack .stack-card:nth-child(3n+2)) {
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.5));
}
/* 副牌(两侧)— 缩小 0.95,略微下沉 */
:deep(.table-center-wrap .card-stack .stack-card:not(:nth-child(3n+2))) {
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

/* 玩家手牌(v3-2 竖叠列) */
.hand-area {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 8px 0 60px;  /* 留出底部操作栏空间 */
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.6));
  z-index: 5;
  /* v2.5:发牌完手牌"立刻可见",去掉 opacity transition(默认 240ms → 0ms)
   * 之前 transition: opacity var(--t-med) var(--ease-out)(240ms 渐显)让用户感觉"发牌完还要等 240ms 才看到牌" */
  transition: none;
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
  background: linear-gradient(180deg, var(--emerald-deep, #0a3d2c), var(--emerald-base, #14533b));
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
  /* v2.5:左侧 padding 8 → 16,跟 mobile 同步,让手牌"左右两侧留一些空间" */
  .hand-inner { gap: 2px; padding: 8px 72px 22px 16px; }
  .hand-column { width: 52px; min-height: 92px; padding: 4px 0 2px; margin-left: -12px; }
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

/* ============================================================
 * v2.5:横屏兜底(.page.is-landscape)
 * 手机横屏(h ≤ 430px)默认走 GameViewDesktop 桌面布局,但桌面布局是给 16:9 宽屏设计的,
 * 在手机横屏 2.17:1 比例下元素挤压、座位被裁出屏。
 * v2.5 用 .is-landscape class 钩子(JS matchMedia 触发),不用 @media + :deep 嵌套,
 * 避免 Vue scoped CSS 处理 :deep + @media 的 quirk。
 * 4 座位(顶 + 左 + 右)缩 0.55 + 桌面顶 + 手牌中 + 操作栏底
 * ========================================================= */
.page.is-landscape {
  /* 隐藏自座位:用户手牌就是自己的牌背,无需重复显示 */
}
.page.is-landscape :deep(.seat-bottom) {
  display: none;
}
/* 队友座位(顶):从 top: 60 改 top: 4,缩 0.55 */
.page.is-landscape :deep(.seat-top) {
  top: 4px;
  transform: scale(0.55);
  transform-origin: top center;
  animation: none;
}
/* 左右 AI 座位:top: 220 → 56,缩 0.55,避开队友座位下方 */
.page.is-landscape :deep(.seat-left) {
  top: 56px;
  left: 4px;
  transform: scale(0.55);
  transform-origin: top left;
  animation: none;
}
.page.is-landscape :deep(.seat-right) {
  top: 56px;
  right: 4px;
  transform: scale(0.55);
  transform-origin: top right;
  animation: none;
}
/* 顶部 HUD 元素缩小 */
.page.is-landscape :deep(.hud-topleft),
.page.is-landscape :deep(.hud-topright) {
  transform: scale(0.65);
  transform-origin: top left;
}
.page.is-landscape :deep(.hud-topright) {
  transform-origin: top right;
}
/* 中央桌面:margin-top 180 → 20,height 360 → 120 */
.page.is-landscape :deep(.table-center-wrap) {
  margin-top: 20px;
  height: 120px;
}
.page.is-landscape :deep(.ellipse-table) {
  width: 60%;
  max-width: 380px;
  height: 80%;
}
/* 信息条字号缩到 9px(本来 10px) */
.page.is-landscape :deep(.table-info-pill) {
  font-size: 9px;
  padding: 2px 7px;
}
.page.is-landscape :deep(.table-info-top) {
  top: -20px;
}
/* 出牌堆扇形紧凑 */
.page.is-landscape :deep(.card-stack) {
  width: 180px;
  height: 80px;
}
/* 手牌 area:贴底,限制 max-height,避免顶到桌面 */
.page.is-landscape .hand-area {
  bottom: 0;
  padding: 4px 0 4px;
  max-height: 150px;
  overflow: hidden;
}
.page.is-landscape .hand-inner {
  min-height: 60px;
  padding: 4px 16px 6px;
  gap: 0;
}
.page.is-landscape .hand-column {
  width: 44px;
  min-height: 56px;
  margin-left: -10px;
}
.page.is-landscape .hand-card {
  left: 4px;
  width: 36px;
  height: 50px;
  --hand-card-w: 36px;
  --hand-card-h: 50px;
}
.page.is-landscape .hand-card:nth-child(1) { top: 0 !important; }
.page.is-landscape .hand-card:nth-child(2) { top: -8px !important; }
.page.is-landscape .hand-card:nth-child(3) { top: -16px !important; }
.page.is-landscape .hand-card:nth-child(4) { top: -24px !important; }
.page.is-landscape .hand-card:nth-child(n+5) { top: -28px !important; }
.page.is-landscape .col-rank {
  top: -16px;
  height: 14px;
  font-size: 9px;
  min-width: 18px;
}
.page.is-landscape .col-count {
  bottom: -6px;
  height: 11px;
  font-size: 8px;
  min-width: 18px;
}
/* 操作栏贴底 */
.page.is-landscape .action-bar-wrap {
  bottom: 0;
  height: 56px;
  padding: 0;
}
.page.is-landscape .suit-tabs {
  bottom: 180px;
}
/* 智能理牌 / 不出 / 提示 / 出牌按钮字号缩 */
.page.is-landscape :deep(.auto-find-btn) {
  font-size: 11px;
  padding: 4px 14px;
}
.page.is-landscape :deep(.main-actions .m-btn) {
  font-size: 11px;
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
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,244,255,0.94));
  border: 1px solid rgba(255,255,255,0.55);
  border-radius: 16px;
  padding: 24px;
  color: var(--text-on-card);
  box-shadow: 0 24px 50px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.7);
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
.r-btn.primary { background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%); color: #3a2308; box-shadow: 0 8px 18px rgba(255, 178, 24, 0.32); }
.r-btn.ghost { background: #eef0f5; color: #667; }

/* 发牌中:手牌 + 座位牌背 隐藏
 * v2.5:加 transition: none 确保发牌完 .dealing class 移除时,手牌区"立刻"恢复 opacity 1,
 * 不会有 240ms 渐显延迟 */
.dealing .hand-area { opacity: 0; pointer-events: none; transition: none; }

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

/* ============================================================
 * v2.1 P3:host 迁移提示
 * ============================================================ */
.host-mig-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.95), rgba(255, 165, 0, 0.95));
  border: 2px solid #fff;
  border-radius: 12px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 800;
  color: #1a1f4a;
  letter-spacing: 1px;
  z-index: 250;
  box-shadow: 0 6px 24px rgba(255, 165, 0, 0.6);
  white-space: nowrap;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.host-mig-toast.is-self {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(33, 150, 243, 0.95));
  color: #fff;
  box-shadow: 0 6px 24px rgba(33, 150, 243, 0.6);
}
.mig-icon {
  font-size: 20px;
}

/* v2.1 P3:已迁移角标 — 标题旁小标签 */
.host-mig-badge {
  position: fixed;
  top: 16px;
  right: 70px;
  background: rgba(255, 165, 0, 0.85);
  color: #1a1f4a;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 10px;
  border: 1px solid #fff;
  z-index: 150;
  letter-spacing: 0.5px;
  pointer-events: none;
  animation: badge-pulse 2s ease-in-out infinite;
}
@keyframes badge-pulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; box-shadow: 0 0 12px rgba(255, 165, 0, 0.8); }
}
</style>
