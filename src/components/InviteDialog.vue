<template>
  <div class="invite-overlay" @click.self="onClose">
    <div class="invite-card app-panel-dark">
      <button class="invite-close" @click="onClose" aria-label="关闭"><span aria-hidden="true">✕</span></button>
      <h3 class="invite-title">邀请好友</h3>
      <p class="invite-hint">让好友连接同一热点后加入</p>

      <div v-if="isHost && hostIp" class="invite-qr">
        <QrFallbackCard
          :host-ip="hostIp"
          :host-port="hostPort"
          :room-no="roomNo"
          :qrcode-url="qrDataUrl"
          @copied="onCopied"
        />
      </div>

      <div v-else class="invite-roomno">
        <div class="invite-label">房间号</div>
        <div class="invite-value">{{ roomNo }}</div>
        <button class="app-btn app-btn-secondary invite-copy" @click="copyRoomNo">
          复制房间号
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import QrFallbackCard from '@/components/QrFallbackCard.vue'

const props = defineProps({
  isHost: { type: Boolean, default: false },
  roomNo: { type: String, default: '' },
  hostIp: { type: String, default: '' },
  hostPort: { type: Number, default: 8848 },
  qrDataUrl: { type: String, default: '' },
})

const emit = defineEmits(['close', 'copied'])

function onClose() { emit('close') }
function onCopied(text) { emit('copied', text) }
function copyRoomNo() {
  navigator.clipboard.writeText(props.roomNo).then(
    () => emit('copied', props.roomNo),
    () => emit('copied', props.roomNo)
  )
}
</script>

<style scoped>
.invite-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
  z-index: 200;
  padding: 16px;
}
.invite-card {
  position: relative;
  width: min(360px, 100%);
  padding: 24px;
  text-align: center;
}
.invite-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
  cursor: pointer;
}
.invite-close:hover { background: rgba(255,255,255,0.18); color: #fff; }
.invite-title {
  margin: 0 0 6px;
  font-size: 20px;
  color: #fff;
}
.invite-hint {
  margin: 0 0 18px;
  font-size: 13px;
  color: rgba(255,255,255,0.6);
}
.invite-qr :deep(.qr-fallback-card) {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.invite-roomno {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 12px;
}
.invite-label { font-size: 12px; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 1px; }
.invite-value { font-size: 32px; font-weight: 800; color: var(--gold-bright, #ffd700); letter-spacing: 6px; }
.invite-copy { width: 100%; height: 44px; }
</style>
