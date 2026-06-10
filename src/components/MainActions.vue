<template>
  <!--
   * v3.6 主操作栏:不出 / 提示 / 出牌 + 智能理牌插槽
   * 3 大按钮(不出/提示/出牌)位置和样式不变。
   * v3.6 改造:通过 named slot "smart-sort" 暴露插槽位置,
   *          让 GameView 在操作栏上方挂"✨ 智能理牌"橙色胶囊。
   -->
  <div class="main-actions-wrap" v-if="visible">
    <!-- 智能理牌插槽(v3.6 新增):放橙色"✨ 智能理牌"按钮 -->
    <slot name="smart-sort"></slot>

    <!-- 3 大主操作按钮 -->
    <div class="main-actions">
      <button
        class="action-btn warn"
        :disabled="!canPass"
        @click="$emit('pass')"
      >
        <span class="btn-icon">🚫</span>
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
        class="action-btn primary"
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
  // 是否禁用(非玩家回合 / 发牌中)
  disabled: { type: Boolean, default: false },
  // 是否有有效提示
  hintCount: { type: Number, default: 0 },
  // 首家不能过
  canPass: { type: Boolean, default: true },
  // 是否选了牌
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
/* v3.6: 包一层 wrap,放插槽在按钮上方 */
.main-actions-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;          /* 插槽和主按钮之间的间距 */
  padding: 0 16px;
  z-index: 7;
}

.main-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  z-index: 7;
}

.action-btn {
  flex: 1;
  max-width: 110px;
  height: var(--action-btn-h, 48px);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease), filter var(--t-fast, 120ms) var(--ease-out, ease);
  position: relative;
  overflow: hidden;
}
.action-btn::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent);
  pointer-events: none;
}
.action-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.action-btn:active:not(:disabled) { transform: scale(0.95); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.action-btn.warn {
  background: linear-gradient(180deg, #ffc107 0%, #ff8f00 100%);
  color: #4a2c00;
}
.action-btn.primary {
  background: linear-gradient(180deg, #42a5f5 0%, #1976d2 100%);
  color: #fff;
}
.btn-icon { font-size: 16px; }
.btn-text { font-size: 15px; letter-spacing: 2px; }
</style>
