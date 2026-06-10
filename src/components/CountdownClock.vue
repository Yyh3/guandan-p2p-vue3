<template>
  <!-- 倒计时闹钟:橙色卡片 + 数字 + ≤10s 抖动 -->
  <div class="countdown-clock" :class="{ urgent: isUrgent, expired: isExpired, paused: paused }">
    <div class="clock-body">
      <div class="clock-top"></div>
      <div class="clock-bell clock-bell-l"></div>
      <div class="clock-bell clock-bell-r"></div>
      <div class="clock-face">
        <template v-if="isExpired">
          <span class="face-icon">⏰</span>
          <span class="face-text">已超时</span>
        </template>
        <template v-else>
          <span class="face-num">{{ display }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 剩余秒数
  seconds: { type: Number, default: 30 },
  // 是否暂停
  paused: { type: Boolean, default: false },
})

// 是否紧急(≤10s)
const isUrgent = computed(() => props.seconds > 0 && props.seconds <= 10)
// 是否已超时
const isExpired = computed(() => props.seconds <= 0)
// 显示文字
const display = computed(() => Math.max(props.seconds, 0))
</script>

<style scoped>
.countdown-clock {
  display: inline-block;
  position: relative;
}

/* 圆形橙色闹钟 */
.clock-body {
  position: relative;
  width: var(--clock-size);
  height: var(--clock-size);
  background: linear-gradient(180deg, var(--accent-orange) 0%, var(--accent-orange-dark) 100%);
  border: 2.5px solid #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 8px rgba(239, 108, 0, 0.5), inset 0 -2px 4px rgba(0,0,0,0.15);
  animation: clock-tick 1s ease-in-out infinite;
}

/* 顶上的小柄 */
.clock-top {
  position: absolute;
  top: -6px; left: 50%;
  transform: translateX(-50%);
  width: 10px; height: 5px;
  background: #6d4c41;
  border-radius: 3px 3px 0 0;
  z-index: 2;
}
/* 左右小铃铛 */
.clock-bell {
  position: absolute;
  top: -1px;
  width: 7px; height: 7px;
  background: #6d4c41;
  border-radius: 50%;
  z-index: 2;
}
.clock-bell-l { left: 3px; }
.clock-bell-r { right: 3px; }

/* 数字 / 图标 */
.clock-face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  font-weight: bold;
}
.face-num { font-size: 18px; line-height: 1; }
.face-icon { font-size: 14px; line-height: 1; }
.face-text { font-size: 8px; line-height: 1; margin-top: 1px; letter-spacing: 0.5px; }

/* 正常状态:左右摆动 */
@keyframes clock-tick {
  0%, 100% { transform: rotate(0deg); }
  25%      { transform: rotate(-4deg); }
  75%      { transform: rotate(4deg); }
}

/* 紧急状态:变红 + 抖动 */
.urgent .clock-body {
  background: linear-gradient(180deg, #ef5350 0%, #c62828 100%);
  box-shadow: 0 3px 12px rgba(198, 40, 40, 0.7), inset 0 -2px 4px rgba(0,0,0,0.2);
  animation: clock-shake 0.4s ease-in-out infinite;
}
@keyframes clock-shake {
  0%, 100% { transform: rotate(0) translateX(0); }
  20%      { transform: rotate(-6deg) translateX(-1px); }
  40%      { transform: rotate(6deg) translateX(1px); }
  60%      { transform: rotate(-4deg) translateX(-1px); }
  80%      { transform: rotate(4deg) translateX(1px); }
}

/* 已超时:灰 */
.expired .clock-body {
  background: linear-gradient(180deg, #757575 0%, #424242 100%);
  animation: none;
}

/* 暂停 */
.paused .clock-body { animation: none; opacity: 0.6; }
</style>
