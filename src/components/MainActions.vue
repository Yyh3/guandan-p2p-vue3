<template>
  <!--
   * v3.x 主操作栏:不出 / 提示 / 出牌 + 智能理牌插槽
   * v3.x 视觉(spec §3.4 + §6):
   *   - 按钮高度 48 → 52px
   *   - 出牌(主):金色金属渐变 + 黑字 + 大写按钮
   *   - 不出 / 提示(副):玻璃拟态 + 金色边框 + 白字
   *   - 字号统一 --font-button(20px bold)
   *   - disabled: 玻璃 +50% 透明(opacity 0.5)
   *   - 保留 v3.6 smart-sort 插槽(橙色"✨ 智能理牌"胶囊挂在按钮上方)
   * 事件接口不变:pass / play / hintToggle / autoPlay
   -->
  <div class="main-actions-wrap" v-if="visible">
    <!-- 智能理牌插槽(v3.6 新增):放橙色"✨ 智能理牌"按钮 -->
    <slot name="smart-sort"></slot>

    <!-- 3 大主操作按钮(v3.x:金色主 + 玻璃副) -->
    <div class="main-actions">
      <button
        class="action-btn warn glass"
        :class="{ 'is-disabled-state': !canPass }"
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
        class="action-btn primary gold"
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
/* ============================================================
 * v3.x 玻璃拟态 + 金色金属渐变(UI-REDESIGN-V3-SPEC.md §3.4)
 * 按钮高度 48 → 52px,字号统一 --font-button
 * ============================================================ */
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
  gap: 12px;          /* v3.x: 10 → 12,按钮之间更舒展 */
  justify-content: center;
  align-items: center;
  z-index: 7;
}

.action-btn {
  flex: 1;
  max-width: 120px;
  height: 52px;                          /* v3.x: 48 → 52(覆盖 --action-btn-h) */
  min-width: 96px;
  border: 1.5px solid rgba(255, 215, 0, 0.4);
  border-radius: 14px;                  /* v3.x: 12 → 14,更圆润 */
  font-size: 20px;                      /* v3.x: 15 → 20(--font-button) */
  font-weight: 900;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform var(--t-fast, 120ms) var(--ease-out, ease),
              filter var(--t-fast, 120ms) var(--ease-out, ease),
              box-shadow var(--t-fast, 120ms) var(--ease-out, ease);
  position: relative;
  overflow: hidden;
  letter-spacing: 2px;
  font-family: inherit;
  /* 顶部高光内描边(玻璃感) */
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

/* 顶部光泽高光(玻璃感) */
.action-btn::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent);
  pointer-events: none;
}

.action-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.action-btn:active:not(:disabled) {
  transform: scale(0.96);
  filter: brightness(0.95);
}
/* v3.x:disabled 状态 +50% 透明(玻璃感更明显) */
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.3);
}

/* ============================================================
 * v3.x:金色金属渐变 — 出牌(主按钮)
 * 金色高光 + 中段主金 + 底部暗金,配合 1.5px 亮金边框
 * ============================================================ */
.action-btn.primary.gold {
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  color: #1a1a1a;                       /* 黑色文字(规格:金底黑字) */
  border-color: #fff8dc;                 /* 1.5px 亮金边 */
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
  box-shadow:
    0 4px 14px rgba(255, 215, 0, 0.5),
    0 0 18px rgba(255, 215, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.action-btn.primary.gold:hover:not(:disabled) {
  box-shadow:
    0 6px 20px rgba(255, 215, 0, 0.65),
    0 0 28px rgba(255, 215, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

/* ============================================================
 * v3.x:玻璃拟态 — 不出(副按钮)
 * 玻璃背景 + 金色边框 + 白字
 * ============================================================ */
.action-btn.warn.glass {
  background: var(--glass-bg, rgba(255, 255, 255, 0.08));
  border: 1.5px solid rgba(255, 215, 0, 0.35);
  color: #fff;
  backdrop-filter: var(--glass-blur, blur(12px));
  -webkit-backdrop-filter: var(--glass-blur, blur(12px));
  box-shadow:
    var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.3)),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
.action-btn.warn.glass:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 215, 0, 0.55);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.5),
    0 0 14px rgba(255, 215, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.btn-icon {
  font-size: 20px;     /* v3.x: 16 → 20,跟字号统一 */
  line-height: 1;
}
.btn-text {
  font-size: 20px;     /* v3.x: 15 → 20(--font-button) */
  letter-spacing: 3px; /* v3.x: 2 → 3,跟更大的字号匹配 */
  line-height: 1.1;
}

/* v3.x:窄屏微调(<=480px 屏宽,按钮缩小但保持 ≥ 48px) */
@media (max-width: 480px) {
  .action-btn {
    height: 52px;     /* 不缩,保持触摸目标 */
    max-width: 100px;
    min-width: 80px;
    font-size: 18px;
  }
  .btn-text { font-size: 18px; letter-spacing: 2px; }
  .main-actions { gap: 8px; }
}
</style>
