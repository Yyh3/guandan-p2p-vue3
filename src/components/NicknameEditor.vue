<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal-card" :class="{ 'is-inline': inline }" @click.stop>
      <h2 class="modal-title">设置昵称</h2>
      <p class="modal-tip">仅本机保存,不会上传任何服务器</p>

      <div class="avatar-grid">
        <!-- ★ v0.4.24 P2 修复:div → <button type="button">,去掉 aria-hidden 标记
             (之前 img 角色 + aria-label + aria-hidden 同时挂,aria-hidden 让前两个失效,
             且可点击 div 键盘不可达);button 天然可 Tab 聚焦 + Enter/Space 触发 -->
        <button
          v-for="a in avatars"
          :key="a"
          type="button"
          class="avatar-cell"
          :class="{ active: picked === a }"
          :aria-label="`头像 ${a}`"
          :aria-pressed="picked === a"
          @click="picked = a"
        >{{ a }}</button>
      </div>

      <div class="nickname-row">
        <span class="nickname-label">昵称</span>
        <input
          v-model="text"
          maxlength="10"
          placeholder="最多 10 个字"
          class="nickname-input"
        />
        <span class="nickname-count">{{ text.length }}/10</span>
      </div>

      <div class="modal-actions">
        <button class="btn btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn btn-confirm" @click="confirm">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import storage from '@/common/storage.js'

const props = defineProps({
  // v3.7:紧凑模式(GameView 内嵌用,尺寸更小)
  inline: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm', 'confirmed'])
const avatars = ['🀄', '♠', '♥', '♣', '♦', '🎴', '👑', '🐯', '🐲', '🍀', '⭐', '🔥']
const picked = ref(storage.getAvatar())
const text = ref(storage.getNickname())

function confirm() {
  const name = (text.value || '').trim() || ('玩家' + Math.floor(1000 + Math.random() * 9000))
  storage.setNickname(name)
  storage.setAvatar(picked.value)
  const payload = { nickname: name, avatar: picked.value }
  emit('confirm', payload)        // 兼容老命名
  emit('confirmed', payload)      // v3.7 规范命名
}
</script>

<style scoped>
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
.modal-card {
  width: 90%;
  max-width: 400px;
  background: linear-gradient(180deg, #fff, #f0f4ff);
  border-radius: 16px;
  padding: 24px;
  color: #2a3464;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
/* v3.7:inline 紧凑模式 — 宽度更窄 + padding 更紧 */
.modal-card.is-inline {
  max-width: 320px;
  padding: 16px;
  border-radius: 12px;
}
.modal-card.is-inline .modal-title { font-size: 18px; }
.modal-card.is-inline .modal-tip { font-size: 11px; margin-top: 2px; }
.modal-card.is-inline .avatar-grid { grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 10px 0; }
.modal-card.is-inline .avatar-cell { font-size: 22px; }
.modal-card.is-inline .nickname-row { padding: 8px 10px; margin-bottom: 14px; }
.modal-card.is-inline .btn { height: 40px; font-size: 14px; }

.modal-title { font-size: 20px; font-weight: bold; text-align: center; }
.modal-tip { font-size: 12px; color: #888; text-align: center; margin-top: 4px; }
.avatar-grid {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 8px; margin: 16px 0;
}
.avatar-cell {
  aspect-ratio: 1;
  background: #f5f7ff;
  border: 2px solid transparent;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  cursor: pointer;
  transition: all 0.1s;
  /* v0.4.24:div → button 后清掉 UA 默认样式 */
  padding: 0;
  font-family: inherit;
}
.avatar-cell.active {
  background: #fff8d9;
  border-color: #f2a93b;
  transform: scale(1.1);
}
.nickname-row {
  display: flex; align-items: center;
  background: #f5f7ff;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 20px;
}
.nickname-label { font-size: 16px; color: #555; margin-right: 8px; }
.nickname-input {
  flex: 1; font-size: 16px; color: #2a3464;
  border: none; outline: none; background: transparent;
  font-family: inherit;
}
.nickname-count { font-size: 12px; color: #aaa; }
.modal-actions { display: flex; gap: 12px; }
.btn {
  flex: 1; height: 48px; border-radius: 10px;
  border: none;
  font-size: 16px; font-weight: bold;
  cursor: pointer;
  font-family: inherit;
}
.btn-cancel { background: #eef0f5; color: #888; }
.btn-confirm { background: linear-gradient(180deg, #4caf50, #2e7d32); color: #fff; }
</style>