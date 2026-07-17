<template>
  <div class="hint-group">
    <button
      class="app-btn app-btn-secondary hint-btn"
      :class="{ active: showing }"
      :disabled="disabled"
      @click="onToggle"
      :aria-label="showing ? '取消提示' : '提示'"
    >
      <span class="hint-icon" aria-hidden="true">{{ showing ? '✕' : '💡' }}</span>
      <span class="hint-text">{{ showing ? '取消' : '提示' }}</span>
    </button>
    <button
      v-if="showing"
      class="app-btn app-btn-primary auto-btn"
      @click="onAutoPlay"
      aria-label="按提示出牌"
    >
      <span class="hint-icon" aria-hidden="true">⚡</span>
      <span class="hint-text">按提示出</span>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  hasHint: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle', 'autoPlay'])

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
  min-width: 96px;
  height: 52px;
  padding: 0 16px;
  border-radius: var(--radius-lg, 12px);
  font: var(--font-button);
}
.hint-btn.active {
  background: rgba(244, 196, 94, 0.18);
  border-color: var(--gold-primary, #d4af37);
  color: var(--gold-bright, #ffd700);
}
.auto-btn {
  min-width: 96px;
  height: 52px;
  padding: 0 14px;
  border-radius: var(--radius-lg, 12px);
  font: var(--font-button);
  animation: hint-pulse 1.2s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { box-shadow: 0 4px 14px rgba(233, 173, 63, 0.25); }
  50%      { box-shadow: 0 4px 18px rgba(233, 173, 63, 0.45); }
}
.hint-icon { font-size: 16px; line-height: 1; }
.hint-text { font-size: 14px; line-height: 1; letter-spacing: 1px; }

@media (max-width: 480px) {
  .hint-btn, .auto-btn {
    min-width: 84px;
    height: 50px;
    padding: 0 10px;
  }
  .hint-text { font-size: 13px; }
}
</style>
