<template>
  <!--
   * v3.7 P1: 聊天快捷短语弹层
   *
   * 用途:
   *   - 点击右下角 💬 按钮,弹 10 颗 pill 短语
   *   - 点击短语 → emit `select` 由父组件处理(toast 显示 2s + 联机时广播给同桌玩家) + 自动关闭
   *   - v0.4.24:提示文案更新,去掉过时的「尚未接入广播,仅本地显示」说明
   *
   * 关闭:
   *   - 点遮罩(半透明背景)
   *   - 按 Esc
   *   - 选完短语
   *   - emit 'close'
   -->
  <transition name="chat-fade">
    <div
      v-if="visible"
      class="chat-mask"
      role="dialog"
      aria-modal="true"
      aria-label="聊天快捷短语"
      @click.self="$emit('close')"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="chat-panel" @click.stop>
        <div class="chat-header">
          <span class="chat-title"><span aria-hidden="true">💬</span> 聊天</span>
          <button class="chat-close" @click="$emit('close')" title="关闭(Esc)">×</button>
        </div>
        <div class="chat-hint">快捷短语会发送给同桌玩家</div>
        <div class="chat-grid">
          <button
            v-for="p in phrases"
            :key="p"
            class="chat-pill"
            :title="p"
            @click="onSelect(p)"
          >{{ p }}</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
/**
 * 聊天快捷短语弹层
 * @emits close  - 弹层关闭(点遮罩 / Esc / 选完短语)
 * @emits select - { phrase: string } 选中某个短语
 */
defineProps({
  visible: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'select'])

// 10 颗预定义中文短语
const phrases = [
  '快点啊',
  '打的不错',
  '别炸我',
  '谢谢',
  '接风',
  '我先走',
  '等一下',
  '好牌',
  '再来一局',
  '辛苦了',
]

function onSelect(phrase) {
  emit('select', { phrase })
  emit('close')
}
</script>

<style scoped>
/* ============================================================
 * v3.7 P1: 聊天快捷短语弹层
 * ============================================================ */
.chat-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  padding: 24px;
}

.chat-panel {
  width: 100%;
  max-width: 480px;
  background: linear-gradient(180deg, var(--emerald-deep, #0a3d2c) 0%, var(--emerald-base, #14533b) 100%);
  border: 2px solid var(--gold, #FFD700);
  border-radius: 18px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
  padding: 18px 20px 22px;
  color: #fff;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.chat-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--gold, #FFD700);
}
.chat-close {
  width: 32px;
  height: 32px;
  background: rgba(0, 0, 0, 0.4);
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
}
.chat-close:hover {
  background: rgba(229, 57, 53, 0.8);
  border-color: #fff;
  transform: scale(1.05);
}
.chat-close:active { transform: scale(0.92); }

.chat-hint {
  font-size: 11px;
  opacity: 0.7;
  margin-bottom: 14px;
  letter-spacing: 0.5px;
}

.chat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.chat-pill {
  display: block;
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1.5px solid rgba(255, 215, 0, 0.45);
  border-radius: 999px;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all var(--t-fast, 120ms) var(--ease-out, ease);
  font-family: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-pill:hover {
  background: rgba(255, 215, 0, 0.2);
  border-color: var(--gold, #FFD700);
  color: var(--gold, #FFD700);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(255, 215, 0, 0.3);
}
.chat-pill:active { transform: scale(0.97); }

/* 弹层显隐动画 */
.chat-fade-enter-active, .chat-fade-leave-active {
  transition: opacity 0.2s ease;
}
.chat-fade-enter-from, .chat-fade-leave-to {
  opacity: 0;
}
.chat-fade-enter-active .chat-panel,
.chat-fade-leave-active .chat-panel {
  transition: transform 0.2s var(--ease-out, ease);
}
.chat-fade-enter-from .chat-panel {
  transform: scale(0.92) translateY(8px);
}
.chat-fade-leave-to .chat-panel {
  transform: scale(0.96) translateY(4px);
}

/* 移动端单列 */
@media (max-width: 480px) {
  .chat-grid {
    grid-template-columns: 1fr;
  }
  .chat-pill {
    padding: 10px 12px;
    font-size: 14px;
  }
}
</style>
