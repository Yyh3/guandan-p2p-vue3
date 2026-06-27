<template>
  <!--
   * v3.6 顶部 HUD 覆盖层
   * 布局(用 absolute 定位到屏幕 4 边 + 4 角):
   *   - 顶部居中:    队友座位(距离顶 60px)
   *   - 顶部中央偏下: 倒计时/状态提示
   *   - 顶部左:      ≡ 菜单 + 本局打 + 倍数卡片
   *   - 顶部右:      4 个图标按钮(2x2 网格 🏆/📊/⋯/⚙)+ 信息紧凑条
   *   - 左侧居中:    对手座位(距离左 40px)
   *   - 右侧居中:    对手座位(距离右 40px)
   *   - 底部右(自):  自己座位(避开中央操作栏 / 一键理牌 / 手牌)
   * 容器是 fixed + pointer-events:none 让牌桌/手牌可点击;
   * 子元素单独 pointer-events:auto 保留交互。
   -->
  <div class="hud-overlay">
    <!-- ===== 4 玩家座位(屏幕四边) ===== -->
    <PlayerSeat
      v-if="seats.top"
      position="top"
      :class="['seat-top', { 'is-me-teammate': seats.top.role === 'teammate' }]"
      :role="seats.top.role"
      :name="seats.top.name"
      :avatar="seats.top.avatar"
      :avatar-suit="0"
      :coins="seats.top.coins"
      :level="seats.top.level"
      :card-count="seats.top.cardCount"
      :is-turn="seats.top.isTurn"
      :is-done="seats.top.isDone"
      :show-count="seats.top.showCount"
      :is-urgent="seats.top.isUrgent"
      @click="$emit('seatClick', 2, $event)"
    />
    <PlayerSeat
      v-if="seats.left"
      position="left"
      :class="['seat-left']"
      :role="seats.left.role"
      :name="seats.left.name"
      :avatar="seats.left.avatar"
      :avatar-suit="1"
      :coins="seats.left.coins"
      :level="seats.left.level"
      :card-count="seats.left.cardCount"
      :is-turn="seats.left.isTurn"
      :is-done="seats.left.isDone"
      :show-count="seats.left.showCount"
      :is-urgent="seats.left.isUrgent"
      @click="$emit('seatClick', 1, $event)"
    />
    <PlayerSeat
      v-if="seats.right"
      position="right"
      :class="['seat-right']"
      :role="seats.right.role"
      :name="seats.right.name"
      :avatar="seats.right.avatar"
      :avatar-suit="2"
      :coins="seats.right.coins"
      :level="seats.right.level"
      :card-count="seats.right.cardCount"
      :is-turn="seats.right.isTurn"
      :is-done="seats.right.isDone"
      :show-count="seats.right.showCount"
      :is-urgent="seats.right.isUrgent"
      @click="$emit('seatClick', 3, $event)"
    />
    <PlayerSeat
      v-if="seats.bottom"
      position="bottom"
      :class="['seat-bottom']"
      :role="seats.bottom.role"
      :name="seats.bottom.name"
      :avatar="seats.bottom.avatar"
      :avatar-suit="3"
      :coins="seats.bottom.coins"
      :level="seats.bottom.level"
      :card-count="seats.bottom.cardCount"
      :is-turn="seats.bottom.isTurn"
      :is-done="seats.bottom.isDone"
      :show-count="seats.bottom.showCount"
      :is-urgent="seats.bottom.isUrgent"
      :allow-edit="allowEdit"
      @click="$emit('seatClick', 0, $event)"
      @editRequest="$emit('editRequest', 0, $event)"
    />

    <!-- ===== 顶部左侧:菜单 + 本局打 + 倍数 ===== -->
    <div class="hud-topleft">
      <button class="menu-btn" @click="$emit('menu')" title="菜单">≡</button>
      <!-- v3.x:级别徽章 — 金色金属渐变 + 黑色"打 X" -->
      <div class="hud-card level-card badge-gold" :title="`本局打 ${levelLabel}`">
        <div class="hud-label">打</div>
        <div class="hud-value">{{ levelLabel }}</div>
      </div>
      <!-- v3.x:倍数 + 房间号 合并卡片(房间号 A3K7 字号 20px 等宽字体) -->
      <div class="hud-card mult-card">
        <div class="hud-label">×{{ multiplier }}</div>
        <div v-if="roomCode" class="hud-value room-code" :title="`房间号 ${roomCode}`">{{ roomCode }}</div>
      </div>
    </div>

    <!-- ===== 顶部右侧:v3.6 — 2x2 网格图标 + 信息紧凑条 ===== -->
    <div class="hud-topright">
      <div class="icon-grid">
        <button
          class="icon-btn"
          :class="{ active: iconActive === 'fight' }"
          @click="$emit('icon', 'fight')"
        >
          <span class="emoji">🏆</span>
          <span v-if="fightBadge > 0" class="badge">{{ fightBadge }}</span>
          <span class="tip">对局</span>
        </button>
        <button
          class="icon-btn"
          :class="{ active: iconActive === 'pattern' }"
          @click="$emit('icon', 'pattern')"
        >
          <span class="emoji">📊</span>
          <span class="tip">牌型</span>
        </button>
        <button
          class="icon-btn"
          :class="{ active: iconActive === 'more' }"
          @click="$emit('icon', 'more')"
        >
          <span class="emoji">⋯</span>
          <span class="tip">更多</span>
        </button>
        <button
          class="icon-btn"
          :class="{ active: iconActive === 'settings' }"
          @click="$emit('icon', 'settings')"
        >
          <span class="emoji">⚙</span>
          <span class="tip">设置</span>
        </button>
      </div>
      <!-- v3.6 对局信息紧凑条:打 X / ×N / 倒计时(替代 v3-5 已删的右侧小卡片位置) -->
      <div class="info-strip">
        <span>打 <b class="gold-v">{{ levelLabel }}</b></span>
        <span class="sep"></span>
        <span>×<b class="gold-v">{{ multiplier }}</b></span>
        <span class="sep"></span>
        <span class="clock">{{ clockText }}</span>
      </div>
    </div>

    <!-- ===== 顶部居中(队友座位下方):倒计时 / 状态提示 ===== -->
    <div class="hud-topcenter">
      <div class="status-area">
        <CountdownClock
          v-if="showClock"
          :seconds="turnSeconds"
          :paused="!isMyTurn"
        />
        <div v-else class="status-tip" :class="{ urgent: isDealing }">
          <span v-if="phase === 'finished'">本局结束</span>
          <span v-else-if="isDealing">发牌中</span>
          <span v-else>{{ tipText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import PlayerSeat from './PlayerSeat.vue'
import CountdownClock from './CountdownClock.vue'
// v3.x:获取房间号(本组件不依赖 useGameLogic,因为 useGameLogic 是 GameView 才挂的)
// 房间号存在 net 单例上,直接 read-only 调用即可
import net from '@/common/network.js'

const props = defineProps({
  // 当前级牌 rank 转 label
  levelLabel: { type: String, default: '2' },
  multiplier: { type: Number, default: 1 },
  // 4 玩家座位(2=上=队友, 1=左, 3=右)
  seats: {
    type: Object,
    default: () => ({}),
  },
  // 是否显示倒计时
  showClock: { type: Boolean, default: false },
  turnSeconds: { type: Number, default: 30 },
  isMyTurn: { type: Boolean, default: false },
  // 状态提示
  tipText: { type: String, default: '' },
  isDealing: { type: Boolean, default: false },
  phase: { type: String, default: 'playing' },
  // 4 个图标
  iconActive: { type: String, default: '' },
  fightBadge: { type: Number, default: 0 },
  // v3.7:改名按钮位置(预留接口,user 选 c 自座位图标,本轮 HudTop 不渲染)
  showEditNickname: { type: Boolean, default: false },
  nicknameHint: { type: String, default: '改名' },
  // v3.7:是否允许改名(传到底部自座位卡,本轮 default false)
  allowEdit: { type: Boolean, default: false },
})

defineEmits(['menu', 'seatClick', 'icon', 'editNickname', 'editRequest'])

// v3.6 信息条上的倒计时(没在用 CountdownClock 时用这个回退)
const clockText = computed(() => {
  if (props.showClock) return `${props.turnSeconds}s`
  return '25s'
})

// v3.x:房间号(A3K7 格式)从 net 单例直接读
// net.getRoomId() 返回 "A3K7" 格式字符串,失败时返回空串
const roomCode = computed(() => {
  try {
    if (net && typeof net.getRoomId === 'function') {
      const id = net.getRoomId()
      return id || ''
    }
  } catch (e) {
    // 离线模式或 net 未初始化,降级返回空
  }
  return ''
})
</script>

<style scoped>
/* ============================================================
 * HUD 覆盖层 — fixed 全屏,只拦截子元素
 * ============================================================ */
.hud-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}
.hud-overlay > * { pointer-events: auto; }

/* ============================================================
 * 4 玩家座位 — absolute 定位到屏幕四边
 * ============================================================ */
.seat-top {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
}
.seat-bottom {
  position: absolute;
  bottom: 240px;  /* HudTop 内默认位置;v3.6 由 GameView :deep() 覆盖到 380px */
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
}
.seat-left {
  /* v3.6: top: 50% → top: 220px,跟 mockup 一致(左右对手在屏幕中上) */
  position: absolute;
  top: 220px;
  left: 24px;
}
.seat-right {
  /* v3.6: top: 50% → top: 220px,right: 40px → right: 240px
   * 跟 mockup 一致,避开 self 座位(右下 bottom: 380px / right: 30px) */
  position: absolute;
  top: 220px;
  right: 240px;
}

/* ============================================================
 * 顶部左侧:菜单 + 本局打 + 倍数
 * ============================================================ */
.hud-topleft {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: flex-start;
}

.menu-btn {
  width: 36px; height: 36px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 50%;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease);
}
.menu-btn:hover { background: rgba(0, 0, 0, 0.75); }
.menu-btn:active { transform: scale(0.92); }

.hud-card {
  background: linear-gradient(180deg, var(--accent-yellow, #FFC107) 0%, var(--accent-yellow-dark, #FFA000) 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 10px;
  padding: 4px 10px;
  text-align: center;
  min-width: 52px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.12);
  color: #4a2c00;
}
.hud-card.mult-card {
  background: linear-gradient(180deg, var(--accent-orange, #FF9800) 0%, var(--accent-orange-dark, #EF6C00) 100%);
}

/* v3.x:级别徽章 — 金色金属渐变(spec §3.4)+ 黑色"打 X" */
.hud-card.badge-gold {
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  border: 1.5px solid #fff8dc;
  color: #1a1a1a;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  box-shadow:
    0 3px 10px rgba(255, 215, 0, 0.45),
    0 0 14px rgba(255, 215, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.hud-card.badge-gold .hud-label,
.hud-card.badge-gold .hud-value {
  color: #1a1a1a;       /* 黑字 */
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}

.hud-label {
  font-size: 10px;       /* v3.x: 9 → 10 */
  color: rgba(74, 44, 0, 0.75);
  font-weight: 900;
  letter-spacing: 1px;
  line-height: 1.1;
}
.hud-value {
  font-size: 20px;
  font-weight: 900;
  line-height: 1.15;
}

/* v3.x:房间号 — A3K7 格式 20px 等宽字体(规格 §3.4) */
.hud-value.room-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'Monaco', monospace;
  font-size: 20px;
  letter-spacing: 1.5px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

/* ============================================================
 * v3.6 顶部右侧:2x2 网格图标按钮 + hover tooltip + active 状态
 * ============================================================ */
.hud-topright {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}
.icon-grid {
  display: grid;
  grid-template-columns: 36px 36px;
  grid-template-rows: 36px 36px;
  gap: 6px;
}
.icon-btn {
  position: relative;
  width: 36px; height: 36px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.icon-btn .emoji {
  font-size: 16px;
  line-height: 1;
}
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.75);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.35);
}
.icon-btn:active { transform: scale(0.92); }
.icon-btn.active {
  background: var(--color-teammate, #42a5f5);
  border-color: #82b1ff;
  box-shadow: 0 0 8px rgba(66, 165, 245, 0.6);
}

/* hover tooltip 气泡(中文) */
.icon-btn .tip {
  position: absolute;
  top: 42px;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  border: 1px solid rgba(255, 255, 255, 0.15);
  z-index: 12;
}
.icon-btn:hover .tip { opacity: 1; }

.badge {
  position: absolute;
  top: -4px; right: -4px;
  background: var(--color-opponent, #ef5350);
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 7px;
  min-width: 14px;
  text-align: center;
  border: 1.5px solid #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

/* ============================================================
 * v3.6 对局信息紧凑条(打 X / ×N / 倒计时)
 * 替代 v3-5 已删的右侧小卡片位置,严格不放 4×13 网格的牌型计数面板
 * ============================================================ */
.info-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  padding: 4px 10px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(6px);
  letter-spacing: 0.3px;
}
.info-strip .gold-v {
  color: var(--gold, #FFD700);
  font-weight: 900;
  margin: 0 1px;
}
.info-strip .sep {
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.2);
}
.info-strip .clock {
  color: var(--accent-orange, #FF9800);
  font-weight: 900;
  font-size: 12px;
  font-family: monospace;
}

/* ============================================================
 * 顶部居中(队友座位下方):倒计时 / 状态提示
 * ============================================================ */
.hud-topcenter {
  position: absolute;
  top: 138px;   /* v3.8 round 2: 改到 top-right HUD 下方,不再压中间信息条 */
  right: 60px;  /* 跟 .hud-topright (右侧 4 按钮区) 留 12px 间距 */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 6;
}

.status-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
}
.status-tip {
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: #fff;
  font-weight: bold;
  white-space: nowrap;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  letter-spacing: 1px;
}
.status-tip.urgent {
  background: var(--accent-red, #E53935);
  border-color: var(--accent-red, #E53935);
  animation: status-pulse 1s infinite;
}
@keyframes status-pulse { 50% { opacity: 0.65; } }

/* 响应式 — 小屏微调 */
@media (max-height: 600px) {
  .hud-topcenter { top: 130px; right: 30px; }  /* v3.8 round 2: 跟随主样式移到右上 HUD 下方 */
}
</style>
