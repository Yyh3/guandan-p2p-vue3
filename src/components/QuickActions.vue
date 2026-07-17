<template>
  <!--
   * v3.6 右下角辅助小图标
   * 保留 3 个小图标(🃏 理牌 / ⚡ 一键理 / 💬 聊天),不删。
   * v3.6 调整:把 ⚡ 一键理降级为辅助入口(主入口搬到 GameView 中央"智能理牌"按钮),
   *          按钮尺寸 48 → 44,弱化"主操作"视觉(不再 primary 渐变)。
   -->
  <div class="quick-actions">
    <button class="qa-btn" :title="sortTitle" :aria-label="sortTitle" @click="$emit('sort')">
      <span class="qa-icon" aria-hidden="true">🃏</span>
    </button>
    <button class="qa-btn" :title="autoTitle" :aria-label="autoTitle" @click="$emit('autoFind')">
      <span class="qa-icon" aria-hidden="true">⚡</span>
    </button>
    <button class="qa-btn" :title="chatTitle" :aria-label="chatTitle" @click="$emit('chat')">
      <span class="qa-icon" aria-hidden="true">💬</span>
      <span v-if="unreadCount > 0" class="qa-badge">{{ unreadCount }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  sortTitle: { type: String, default: '理牌' },
  autoTitle: { type: String, default: '一键理(辅助入口,主入口在中央智能理牌按钮)' },
  chatTitle: { type: String, default: '聊天' },
  unreadCount: { type: Number, default: 0 },
})

defineEmits(['sort', 'autoFind', 'chat'])
</script>

<style scoped>
/* v3.6: 位置保持,只是尺寸缩小 + 弱化 ⚡ 视觉 */
.quick-actions {
  position: absolute;
  right: 12px;
  bottom: 196px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 6;
}

.qa-btn {
  position: relative;
  width: var(--quick-btn-size, 44px);
  height: var(--quick-btn-size, 44px);
  background: rgba(0, 0, 0, 0.55);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
}
.qa-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.4);
}
.qa-btn:active { transform: scale(0.92); }

/* v3.6: ⚡ 一键理不再是 primary 黄橙渐变,跟其他两个图标一致(降级为辅助入口) */
.qa-btn.primary {
  background: rgba(0, 0, 0, 0.55);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.qa-icon { font-size: 20px; line-height: 1; }

.qa-badge {
  position: absolute;
  top: -2px; right: -2px;
  background: var(--accent-red, #E53935);
  color: #fff;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
  border: 1.5px solid #fff;
}
</style>
