<template>
  <!--
   * v4.x 主操作栏: 不出 / 提示 / 出牌
   * - 出牌: 金色主按钮
   * - 提示: 灰蓝次级按钮
   * - 不出: 文字/透明按钮
   * - 智能理牌通过 smart-sort 插槽由父组件提供
   * 事件接口不变: pass / play / hintToggle / autoPlay
   * 继续暴露 setShowing / isShowing 供 useGameLogic 调用
   -->
  <div class="main-actions-wrap" v-if="visible">
    <slot name="smart-sort"></slot>

    <div class="main-actions">
      <button
        class="app-btn app-btn-text pass-btn"
        :class="{ 'is-disabled-state': !canPass }"
        :disabled="!canPass"
        @click="$emit('pass')"
      >
        <span class="btn-icon">—</span>
        <span class="btn-text">不出</span>
      </button>

      <PlayHintButton
        ref="playHintRef"
        :disabled="disabled"
        :has-hint="hintCount > 0"
        @toggle="$emit('hintToggle', $event)"
        @autoPlay="$emit('autoPlay')"
      />

      <button
        class="app-btn app-btn-primary play-btn"
        :class="{ 'is-disabled-state': !canPlay }"
        :disabled="!canPlay"
        @click="$emit('play')"
      >
        <span class="btn-icon">✓</span>
        <span class="btn-text">出牌</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import PlayHintButton from './PlayHintButton.vue'

const props = defineProps({
  visible: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  hintCount: { type: Number, default: 0 },
  canPass: { type: Boolean, default: true },
  canPlay: { type: Boolean, default: true },
})

defineEmits(['pass', 'play', 'hintToggle', 'autoPlay'])

const playHintRef = ref(null)
defineExpose({
  setShowing: (v) => playHintRef.value?.setShowing(v),
  isShowing: () => playHintRef.value?.isShowing() ?? false,
})
</script>

<style scoped>
.main-actions-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  z-index: 7;
}

.main-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  z-index: 7;
}

.main-actions .app-btn {
  min-width: 96px;
  height: 52px;
  padding: 0 20px;
  border-radius: var(--radius-lg, 12px);
  font: var(--font-button);
}

.pass-btn {
  color: rgba(255, 255, 255, 0.75);
}
.pass-btn:disabled {
  opacity: 0.35;
}

.play-btn {
  min-width: 110px;
}

.btn-icon {
  font-size: 18px;
  line-height: 1;
}
.btn-text {
  letter-spacing: 2px;
}

@media (max-width: 480px) {
  .main-actions .app-btn {
    height: 50px;
    min-width: 84px;
    padding: 0 14px;
  }
  .play-btn { min-width: 96px; }
}
</style>
