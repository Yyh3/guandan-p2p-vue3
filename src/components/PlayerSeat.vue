<template>
  <!--
   * v3.7 玩家座位 — v3.x UI 重做(UI-REDESIGN-V3-SPEC.md §3.3)
   * 4 种角色:self / teammate / opponent / empty(同 v3.6)
   * 4 个位置变体:top / bottom / left / right(同 v3.6)
   * v3.x 改造(头像相关):
   *   - 头像圆形 64px(桌面端)/ 48px(移动端,@media 自动缩放)
   *   - 金色 2px 边框 + 角色色微调(teammate/opponent 覆盖)
   *   - 当前回合(is-turn):头像金色脉冲光环(引用 tokens.css @keyframes pulse-glow,1.5s 周期)
   *   - 已出完牌(isDone):头像 grayscale + opacity 0.6
   *   - 已就绪(done-mark):右上角绿色 ✓ 角标(玻璃拟态圆,圆升级)
   *
   * v3.6 保留:
   *   - 卡片化:12px 圆角 + 渐变背景 + 3D 阴影 + backdrop-filter
   *   - role 角标 emoji(队友 🤝 / 对手 ⚔ / 自己 👑)
   *   - 底部 4px 进度条 + 角色色渐变填充 + 顶部"剩 N 张"文字
   *   - 思考气泡(3 颗跳动小点)
   *
   * v3.7 报数规则:
   *   - cardCount > 10: 完全隐藏 进度条 / 牌堆 / 数字
   *   - 0 < cardCount <= 10: 显示进度条 + 牌堆 + 数字
   *   - 0 < cardCount <= 5 (isUrgent): 数字红色脉动 + 光晕
   *   - cardCount = 0: 显示"已出完"
   *
   * v3.7 自座位改名按钮 ✎:
   *   - role === 'self' 时右上角显示 18x18 ✎ 图标
   *   - allowEdit=true 时点 ✎ 触发 editRequest 事件(GameView 处理)
   *   - allowEdit=false 时点 ✎ 仅触发 editRequest(GameView 弹 toast 提示)
   -->
  <div
    class="player-seat"
    :class="[
      `pos-${position}`,
      `role-${role}`,
      { 'is-turn': isTurn, 'is-done': isDone, 'is-active': active, 'is-empty': role === 'empty' }
    ]"
    @click="$emit('click', $event)"
  >
    <!-- 角色角标(队友 🤝 / 对手 ⚔ / 自己 👑)— 左上角悬浮 -->
    <div v-if="roleTag" class="seat-tag" :class="`tag-${role}`">
      <span class="tag-emoji">{{ roleEmoji }}</span>
      {{ roleTag }}
    </div>

    <!-- 思考中气泡(队友/AI 思考时) -->
    <div v-if="isThinking" class="thinking-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>

    <!-- 已出完对勾 -->
    <div v-if="isDone" class="done-mark">✓</div>

    <!-- v3.7:自座位改名按钮 ✎(右上角,18x18)— 只在 role=self 显示 -->
    <button
      v-if="role === 'self' && !isDone"
      class="seat-edit-btn"
      :title="allowEdit ? '改名' : '对局中不能改名'"
      @click.stop="$emit('editRequest', $event)"
    >✎</button>

    <!-- 主卡:头像 + 信息 -->
    <div class="seat-main">
      <!-- 头像框(56x56 圆形,emoji) -->
      <div class="seat-avatar">
        <span class="avatar-icon">{{ avatar }}</span>
      </div>

      <!-- 右侧信息列 -->
      <div class="seat-info">
        <div class="seat-name" :title="name">{{ truncateName(name) }}</div>
        <div class="seat-meta">
          <span class="meta-coins" v-if="coins != null">
            <span class="coin-ico">💰</span>{{ formatCoins(coins) }}
          </span>
          <span class="meta-level" v-if="level != null">LV{{ level }}</span>
        </div>
      </div>
    </div>

    <!-- v3.7:报数规则 — cardCount > 10 时整个 .progress 隐藏 -->
    <div v-if="showCount" class="progress" :class="{ urgent: isUrgent }">
      <span class="progress-label">剩 {{ cardCount }} 张</span>
      <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- v3.7:牌堆 — showCount(报数阶段)或 isDone 时显示 -->
    <div v-if="showCount || isDone" class="seat-cardpile" :class="[`pile-${position}`, { urgent: isUrgent }]">
      <div
        v-for="i in cardCountDisplay"
        :key="i"
        class="mini-back"
        :style="miniBackStyle(i)"
      ></div>
      <div v-if="isDone" class="pile-done">已出完</div>
      <div v-else-if="cardCount > 0" class="pile-count" :class="{ urgent: isUrgent }">{{ cardCount }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 位置: top / bottom / left / right(决定主轴方向)
  position: { type: String, default: 'top' },
  // 角色: self / teammate / opponent / empty
  role: { type: String, default: 'opponent' },
  // 名字
  name: { type: String, default: '玩家' },
  // 头像 emoji
  avatar: { type: String, default: '🀄' },
  // 头像花色(0=♠ / 1=♥ / 2=♣ / 3=♦)— v3.6 头像改为圆 + 角色色描边,不再用花色背景
  avatarSuit: { type: Number, default: 0 },
  // 金币数
  coins: { type: Number, default: 0 },
  // 等级
  level: { type: Number, default: 1 },
  // 剩余手牌数
  cardCount: { type: Number, default: 27 },
  // 是否正在出牌
  isTurn: { type: Boolean, default: false },
  // 是否已出完
  isDone: { type: Boolean, default: false },
  // 是否在思考中(自己 + AI 思考时显示气泡)
  isThinking: { type: Boolean, default: false },
  // 高亮(用于菜单展开)
  active: { type: Boolean, default: false },
  // v3.7:是否显示牌数(默认 cardCount <= 10)— >10 时整个进度条/牌堆全隐藏
  showCount: { type: Boolean, default: true },
  // v3.7:是否进入红色脉动状态(cardCount > 0 && <= 5)
  isUrgent: { type: Boolean, default: false },
  // v3.7:是否允许改名(role=self 时控制 ✎ 行为;false 时点 ✎ 仅触发 editRequest 不开编辑器)
  allowEdit: { type: Boolean, default: false },
})

defineEmits(['click', 'editRequest'])

// 角色标签文字
const roleTag = computed(() => {
  if (props.role === 'teammate') return '队友'
  if (props.role === 'self') return '自己'
  if (props.role === 'opponent') return '对手'
  return ''
})

// 角色角标 emoji(v3.6 新增)
const ROLE_EMOJI = { teammate: '🤝', self: '👑', opponent: '⚔' }
const roleEmoji = computed(() => ROLE_EMOJI[props.role] || '')

// 牌背显示上限(避免 27 张全渲染)
const cardCountDisplay = computed(() => Math.min(props.cardCount, 8))

// 进度条百分比(v3.6 新增,基于 27 张满手)
const progressPct = computed(() => {
  return Math.max(0, Math.min(100, Math.round((props.cardCount / 27) * 100)))
})

// 牌背倾斜 / 偏移(按位置决定方向)
function miniBackStyle(i) {
  if (props.position === 'left' || props.position === 'right') {
    return {
      transform: `translateY(${(i - 1) * 4}px)`,
      zIndex: i,
    }
  }
  return {
    transform: `translateX(${(i - 1) * 4}px)`,
    zIndex: i,
  }
}

// 名字省略(最多 6 字 + …)
function truncateName(s) {
  if (!s) return '玩家'
  return s.length > 6 ? s.slice(0, 5) + '…' : s
}

// 金币数字简化(万/亿单位)
function formatCoins(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return String(n)
}
</script>

<style scoped>
/* ============================================================
 * 玩家座位 — 卡片化设计(v3.6)
 * 圆角 12px + 渐变背景 + 3D 阴影 + backdrop-filter
 * 身份三色边框 + 角色色光晕
 * ============================================================ */
.player-seat {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 8px 6px;
  cursor: pointer;
  user-select: none;
  z-index: 5;
  /* v3.6:卡片化渐变 + 3D 阴影 + backdrop-filter */
  background: linear-gradient(180deg, rgba(20, 30, 70, 0.92) 0%, rgba(10, 18, 51, 0.96) 100%);
  border-radius: 12px;
  box-shadow: var(--shadow-card-3d, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1));
  backdrop-filter: blur(6px);
  border: 2px solid rgba(255, 255, 255, 0.12);
  min-width: 180px;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease),
              box-shadow var(--t-fast, 120ms) var(--ease-out, ease),
              border-color var(--t-fast, 120ms) var(--ease-out, ease);
}
.player-seat:hover {
  transform: translateY(-2px);
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

/* 左右位置:主轴竖排 */
.pos-left, .pos-right {
  flex-direction: column;
  padding: 8px 6px 6px;
  gap: 4px;
  align-items: center;
}
.pos-left { align-items: flex-start; }
.pos-right { align-items: flex-end; }

/* ============================================================
 * 身份色 — 边框 + 光晕(v3.6 强化)
 * 队友 = 蓝 / 对手 = 红 / 自己 = 绿+金
 * ============================================================ */
.role-teammate {
  border-color: var(--color-teammate, #42a5f5);
  background: linear-gradient(180deg, rgba(30, 60, 130, 0.92) 0%, rgba(10, 18, 51, 0.96) 100%);
  box-shadow: var(--shadow-glow-teammate, 0 0 12px rgba(66,165,245,0.5)), var(--shadow-card-3d, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1));
}
.role-self {
  border-color: var(--color-self, #66bb6a);
  background: linear-gradient(180deg, rgba(20, 90, 50, 0.92) 0%, rgba(8, 50, 30, 0.96) 100%);
  box-shadow: var(--shadow-glow-self, 0 0 16px rgba(102,187,106,0.55)), var(--shadow-card-3d, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1));
}
.role-opponent {
  border-color: var(--color-opponent, #ef5350);
  background: linear-gradient(180deg, rgba(120, 30, 30, 0.92) 0%, rgba(60, 10, 10, 0.96) 100%);
  box-shadow: var(--shadow-glow-opponent, 0 0 10px rgba(239,83,80,0.4)), var(--shadow-card-3d, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1));
}
.role-empty {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.12);
  opacity: 0.6;
  background: rgba(20, 30, 70, 0.6);
}

/* 轮到出牌:金色脉冲环 + 强化光晕 */
.is-turn {
  border-color: var(--gold, #FFD700) !important;
  box-shadow:
    0 0 14px rgba(255, 215, 0, 0.5),
    0 4px 12px rgba(0, 0, 0, 0.5) !important;
  animation: seat-pulse 1.4s ease-in-out infinite;
}
@keyframes seat-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.03); }
}

/* 已出完(v3.x):灰化效果已搬到 .is-done .seat-avatar(头像层)— 见上
 * 整卡保留轻微降亮(0.85),但不再 grayscale 整张卡(避免影响名字/进度条可读性) */
.is-done {
  opacity: 0.92;
}

/* ============================================================
 * 角色角标(队友 🤝 / 对手 ⚔ / 自己 👑)— v3.6 emoji 增强
 * ============================================================ */
.seat-tag {
  position: absolute;
  top: -10px; left: 8px;
  display: flex; align-items: center; gap: 3px;
  font-size: 10px;
  padding: 2px 8px 2px 5px;
  border-radius: 9px;
  color: #fff;
  font-weight: 700;
  letter-spacing: 1px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  z-index: 6;
  border: 1.5px solid rgba(255, 255, 255, 0.5);
}
.tag-emoji {
  font-size: 11px;
  line-height: 1;
}
.tag-teammate {
  background: linear-gradient(180deg, #42a5f5 0%, #1976d2 100%);
  color: #cce8ff;
}
.tag-self {
  background: linear-gradient(180deg, #66bb6a 0%, #2e7d32 100%);
  color: #d6f5d6;
}
.tag-opponent {
  background: linear-gradient(180deg, #ef5350 0%, #b71c1c 100%);
  color: #ffd6d6;
}

/* ============================================================
 * v3.7 自座位改名按钮 ✎(右上角,18x18)— 只在 role=self 显示
 * ============================================================ */
.seat-edit-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  color: var(--gold, #FFD700);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  z-index: 7;
  transition: all 0.15s ease;
  backdrop-filter: blur(4px);
}
.seat-edit-btn:hover {
  background: rgba(255, 215, 0, 0.3);
  border-color: var(--gold, #FFD700);
  transform: scale(1.15);
}
.seat-edit-btn:active {
  transform: scale(0.92);
}

/* ============================================================
 * v3.x 头像框(64px 桌面 / 48px 移动)— UI-REDESIGN-V3-SPEC.md §3.3
 * - 圆形 + 金色 2px 边框(基础)
 * - 角色色微调描边(teammate=蓝 / self=绿 / opponent=红)
 * - 当前回合:金色脉冲光环(pulse-glow 1.5s,引用 tokens)
 * - 已出完:grayscale + opacity 0.6
 * ============================================================ */
.seat-avatar {
  position: relative;
  width: 64px; height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(180deg, var(--emerald-deep, #0a3d2c), var(--emerald-base, #14533b));
  border: 2px solid var(--gold-primary, #d4af37);
  box-shadow:
    0 0 8px rgba(255, 215, 0, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  transition: filter 200ms var(--ease-out, ease), opacity 200ms var(--ease-out, ease);
}
.seat-avatar::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  pointer-events: none;
}
/* 角色色头像描边(v3.6 保留)— 在金色基础上叠加角色色光晕 */
.role-teammate .seat-avatar {
  border-color: var(--color-teammate, #42a5f5);
  box-shadow: 0 0 8px rgba(66, 165, 245, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.3);
}
.role-self .seat-avatar {
  border-color: var(--color-self, #66bb6a);
  box-shadow: 0 0 10px rgba(102, 187, 106, 0.55), inset 0 -2px 4px rgba(0, 0, 0, 0.3);
}
.role-opponent .seat-avatar {
  border-color: var(--color-opponent, #ef5350);
  box-shadow: 0 0 8px rgba(239, 83, 80, 0.5), inset 0 -2px 4px rgba(0, 0, 0, 0.3);
}

/* v3.x 当前回合:头像金色脉冲光环(引用 tokens.css @keyframes pulse-glow)
 * --avatar-halo-gold / --avatar-halo-active 由 tokens.css 定义 */
.is-turn .seat-avatar {
  animation: pulse-glow 1.5s ease-in-out infinite;
}
/* 兼容:头像外的金色装饰环(保留 v3.6 ring-pulse)— 跟 pulse-glow 共存 */
.is-turn .seat-avatar::before {
  content: '';
  position: absolute;
  inset: -8px;
  border: 2px solid var(--gold-bright, #ffd700);
  border-radius: 50%;
  animation: ring-pulse 1.5s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ring-pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.06); }
}

/* v3.x 已出完(isDone):头像 grayscale + opacity 0.6(从整卡移动到头像) */
.is-done .seat-avatar {
  filter: grayscale(1);
  opacity: 0.6;
}
.is-done .seat-avatar::before { display: none; }

.avatar-icon {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

/* 移动端(< 768px)头像缩小到 48px */
@media (max-width: 768px) {
  .seat-avatar { width: 48px; height: 48px; }
  .avatar-icon { font-size: 24px; }
}

/* ============================================================
 * 信息区(名字 + 金币 + 等级)
 * ============================================================ */
.seat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.seat-name {
  font-size: 15px;
  color: #fff;
  font-weight: 700;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  line-height: 1.1;
}
.seat-meta {
  display: flex;
  gap: 4px;
  font-size: 10px;
  align-items: center;
}
.meta-coins {
  color: var(--gold, #FFD700);
  font-weight: 700;
  display: inline-flex; align-items: center; gap: 1px;
  background: rgba(255, 215, 0, 0.12);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255, 215, 0, 0.25);
}
.coin-ico { font-size: 10px; }
.meta-level {
  color: #fff;
  font-weight: 700;
  background: linear-gradient(180deg, #ff9800 0%, #ef6c00 100%);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 左右位置时:信息横排到头像下面 */
.pos-left .seat-main,
.pos-right .seat-main {
  flex-direction: column;
  gap: 4px;
  align-items: center;
}
.pos-left .seat-info,
.pos-right .seat-info {
  align-items: center;
}
.pos-left .seat-name,
.pos-right .seat-name { max-width: 64px; }
.pos-left .seat-meta,
.pos-right .seat-meta { justify-content: center; }

/* ============================================================
 * v3.6 进度条(4px + 角色色渐变 + 顶部"剩 N 张"文字)
 * v3.7:卡片数 > 10 时整个 .progress 隐藏(由父 v-if 控制)
 * ============================================================ */
.progress {
  position: relative;
  height: 4px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.progress-label {
  position: absolute;
  right: 0; top: -14px;
  font-size: var(--fs-5, 9px);
  color: rgba(255, 255, 255, 0.5);
  font-weight: 700;
  letter-spacing: 0.3px;
}
.progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, var(--gold, #FFD700) 0%, var(--accent-orange, #FF9800) 100%);
  border-radius: 2px;
  box-shadow: 0 0 4px rgba(255, 215, 0, 0.4);
  transition: width var(--t-med, 240ms) var(--ease-out, ease);
}
.role-opponent .progress-fill {
  background: linear-gradient(90deg, #ef5350, #ff8a80);
}
.role-teammate .progress-fill {
  background: linear-gradient(90deg, #42a5f5, #80d6ff);
}
.role-self .progress-fill {
  background: linear-gradient(90deg, #66bb6a, #ffd54f);
}

/* v3.7:报数 urgent(cardCount <= 5)— 红色脉动 */
.progress.urgent .progress-fill {
  background: linear-gradient(90deg, #ff1744 0%, #ff5252 100%);
  box-shadow: 0 0 8px rgba(255, 23, 68, 0.6);
  animation: count-pulse 0.8s ease-in-out infinite;
}
@keyframes count-pulse {
  0%, 100% { opacity: 1; transform: scaleX(1); }
  50%      { opacity: 0.7; transform: scaleX(1.04); }
}

/* 左右位置:进度条横到底边 */
.pos-left .progress,
.pos-right .progress {
  width: calc(100% - 4px);
  margin: 6px 2px 0;
}

/* ============================================================
 * 思考气泡(队友/AI 思考时) — 右上角
 * ============================================================ */
.done-mark {
  position: absolute;
  right: -4px; top: -4px;
  width: 24px; height: 24px;
  background: linear-gradient(180deg,
    rgba(67, 160, 71, 0.85) 0%,
    rgba(46, 125, 50, 0.95) 100%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #fff;
  border-radius: 50%;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--gold-primary, #d4af37);
  font-weight: bold;
  z-index: 10;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.5),
    0 0 8px rgba(67, 160, 71, 0.4);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
}

.thinking-bubble {
  position: absolute;
  top: -10px; right: -8px;
  background: var(--color-teammate, #42a5f5);
  color: #fff;
  padding: 4px 8px;
  border-radius: 12px;
  display: flex; align-items: center; gap: 2px;
  z-index: 11;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  border: 1.5px solid #fff;
  animation: thinking-bob 1s ease-in-out infinite;
}
.thinking-bubble .dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #fff;
  animation: dot-bounce 1.2s ease-in-out infinite;
}
.thinking-bubble .dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-bubble .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes thinking-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}
@keyframes dot-bounce {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50%      { transform: translateY(-3px); opacity: 1; }
}

/* ============================================================
 * 手牌堆(座位上代表手牌的小牌背)— 保留 v3-5
 * v3.7:牌堆 + 数字 仅在 showCount(cardCount <= 10)或 isDone 时显示
 * v3.7:isUrgent(cardCount <= 5)时 数字红色脉动 + 光晕
 * ============================================================ */
.seat-cardpile {
  position: relative;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 36px; min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  flex-shrink: 0;
}
.seat-cardpile.urgent {
  border-color: rgba(255, 23, 68, 0.6);
  box-shadow: 0 0 12px rgba(255, 23, 68, 0.55);
  background: rgba(255, 23, 68, 0.1);
}
.pile-top, .pile-bottom {
  flex-direction: row;
  margin-left: 2px;
}
.pile-left, .pile-right {
  flex-direction: column;
  margin-top: 2px;
}

.mini-back {
  position: absolute;
  width: 14px; height: 20px;
  background: linear-gradient(135deg, #1e88e5 0%, #0d47a1 100%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.pile-left .mini-back, .pile-right .mini-back {
  position: relative;
  margin-bottom: -16px;
}
.pile-top .mini-back, .pile-bottom .mini-back {
  position: relative;
  margin-right: -10px;
}

.pile-count {
  position: relative;
  z-index: 10;
  font-size: 11px;
  font-weight: 900;
  color: var(--gold, #FFD700);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.5);
  padding: 0 4px;
  border-radius: 6px;
  min-width: 18px;
  text-align: center;
}
/* v3.7:报数 urgent(cardCount <= 5)— 红色脉动 + 光晕 */
.pile-count.urgent {
  color: #ff1744;
  text-shadow: 0 0 8px rgba(255, 23, 68, 0.8);
  background: rgba(255, 23, 68, 0.15);
  border: 1.5px solid rgba(255, 23, 68, 0.7);
  font-size: 13px;
  animation: count-pulse 0.8s ease-in-out infinite;
  box-shadow: 0 0 12px rgba(255, 23, 68, 0.7);
}
.pile-done {
  position: relative;
  z-index: 10;
  font-size: 10px;
  color: var(--accent-green, #43A047);
  font-weight: bold;
  background: rgba(0, 0, 0, 0.5);
  padding: 0 4px;
  border-radius: 4px;
}
</style>