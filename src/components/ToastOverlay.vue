<template>
  <transition name="toast">
    <div v-if="visible" class="toast-overlay" role="status" aria-live="polite">
      <div class="toast-card">
        <span class="toast-text">{{ message }}</span>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { onToast } from '@/common/dialog-bus.js'

const visible = ref(false)
const message = ref('')
let hideTimer = null
let unsubscribe = null

onMounted(() => {
  unsubscribe = onToast((msg, duration = 2000) => {
    message.value = String(msg)
    visible.value = true
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { visible.value = false }, duration)
  })
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.toast-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 500;
  padding: 16px;
}
.toast-card {
  max-width: min(320px, 90vw);
  padding: 14px 22px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: 15px;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(6px);
}
.toast-text {
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
