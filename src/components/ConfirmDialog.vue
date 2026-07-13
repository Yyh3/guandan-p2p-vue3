<template>
  <transition name="confirm">
    <div v-if="visible" class="confirm-overlay" @click.self="onCancel" role="dialog" aria-modal="true">
      <div class="confirm-card">
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="onCancel">{{ cancelText }}</button>
          <button class="confirm-btn primary" @click="handleConfirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { onConfirm as onConfirmRequest } from '@/common/dialog-bus.js'

const visible = ref(false)
const title = ref('提示')
const message = ref('')
const confirmText = ref('确定')
const cancelText = ref('取消')
let pendingConfirm = null
let pendingCancel = null
let unsubscribe = null

onMounted(() => {
  unsubscribe = onConfirmRequest((opts) => {
    title.value = opts.title || '提示'
    message.value = String(opts.message || '')
    confirmText.value = opts.confirmText || '确定'
    cancelText.value = opts.cancelText || '取消'
    pendingConfirm = opts.onConfirm
    pendingCancel = opts.onCancel
    visible.value = true
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

function close() {
  visible.value = false
  pendingConfirm = null
  pendingCancel = null
}

function handleConfirm() {
  const cb = pendingConfirm
  close()
  if (typeof cb === 'function') cb()
}

function onCancel() {
  const cb = pendingCancel
  close()
  if (typeof cb === 'function') cb()
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
  z-index: 400;
  padding: 16px;
}
.confirm-card {
  width: min(360px, 92vw);
  padding: 24px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(45, 35, 80, 0.96), rgba(30, 22, 60, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
  color: #fff;
}
.confirm-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}
.confirm-message {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.82);
  text-align: center;
  white-space: pre-line;
}
.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.confirm-btn {
  flex: 1;
  padding: 11px 16px;
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.08s ease, opacity 0.15s ease;
}
.confirm-btn:active { transform: scale(0.97); }
.confirm-btn.cancel {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
}
.confirm-btn.cancel:hover { background: rgba(255, 255, 255, 0.18); }
.confirm-btn.primary {
  background: linear-gradient(180deg, #ffcf4d, #ff9a3d);
  color: #2a1a00;
}
.confirm-btn.primary:hover { filter: brightness(1.06); }

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-enter-active .confirm-card,
.confirm-leave-active .confirm-card {
  transition: transform 0.2s ease;
}
.confirm-enter-from .confirm-card,
.confirm-leave-to .confirm-card {
  transform: scale(0.92);
}
</style>
