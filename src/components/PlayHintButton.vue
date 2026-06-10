<template>
  <div class="hint-group">
    <button
      class="hint-btn"
      :class="{ active: showing }"
      :disabled="disabled"
      @click="onToggle"
    >
      <span class="hint-icon">{{ showing ? '✕' : '💡' }}</span>
      <span class="hint-text">{{ showing ? '取消提示' : '提示' }}</span>
    </button>
    <button
      v-if="showing"
      class="hint-btn auto"
      @click="onAutoPlay"
    >
      <span class="hint-icon">⚡</span>
      <span class="hint-text">按提示出牌</span>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  // 是否禁用(非玩家回合)
  disabled: { type: Boolean, default: false },
  // 当前是否有有效提示(影响"按提示出牌"二级按钮)
  hasHint: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle', 'autoPlay'])

// 是否处于提示高亮状态
const showing = ref(false)

function onToggle() {
  if (props.disabled) return
  showing.value = !showing.value
  emit('toggle', showing.value)
}

function onAutoPlay() {
  if (props.disabled) return
  emit('autoPlay')
  showing.value = false
}

// 暴露给父组件控制状态(用于牌型变化时自动取消)
function setShowing(v) { showing.value = !!v }
function isShowing() { return showing.value }

defineExpose({ setShowing, isShowing })
</script>

<style scoped>
.hint-group {
  display: flex;
  gap: 6px;
  align-items: center;
}
.hint-btn {
  background: linear-gradient(180deg, #ffd54f, #f57c00);
  color: #fff;
  border: none;
  border-radius: 18px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 6px rgba(245, 124, 0, 0.35);
  transition: filter 0.15s;
}
.hint-btn:hover:not(:disabled) { filter: brightness(1.08); }
.hint-btn:active:not(:disabled) { filter: brightness(0.92); }
.hint-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hint-btn.active {
  background: linear-gradient(180deg, #ff7043, #d84315);
  box-shadow: 0 2px 6px rgba(216, 67, 21, 0.5);
}
.hint-btn.auto {
  background: linear-gradient(180deg, #66bb6a, #2e7d32);
  box-shadow: 0 2px 6px rgba(102, 187, 106, 0.4);
  animation: hint-pulse 1.2s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
.hint-icon { font-size: 15px; line-height: 1; }
.hint-text { font-size: 13px; line-height: 1; }
</style>
