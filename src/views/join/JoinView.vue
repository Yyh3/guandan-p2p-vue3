<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">连热点加入房间</h1>

    <!-- Capacitor / Android 真机:用 IP 加入 -->
    <div v-if="isNative" class="card">
      <h2 class="card-title">方式 1:扫码 / 输入房主 IP</h2>
      <p class="card-hint">让房主把手机开热点,你连上同一热点后,扫码或输入他的 IP</p>
      <div class="input-row">
        <span class="input-label">IP:端口</span>
        <input
          v-model="hostAddress"
          placeholder="192.168.43.1:8848"
          class="input"
        />
      </div>
      <div class="qr-row" v-if="route.query.scanHost">
        <p class="card-hint">扫到的房主地址:{{ route.query.scanHost }}</p>
        <button class="action-btn-small" @click="useScan">使用该地址</button>
      </div>
    </div>

    <!-- 浏览器版:用 6 位房间号 -->
    <div v-else class="card">
      <h2 class="card-title">方式 1:输入房间号</h2>
      <div class="input-row">
        <span class="input-label">房间号</span>
        <input v-model="roomNo" maxlength="6" placeholder="6 位数字" class="input" />
      </div>
      <p class="card-hint">房主开热点后,会显示一个 6 位数字房间号</p>
    </div>

    <div class="card">
      <h2 class="card-title">方式 2:本机模拟(同浏览器多标签)</h2>
      <p class="card-hint">
        浏览器内已用 BroadcastChannel 自动通信,
        <span v-if="isNative">暂未启用</span>
        <span v-else>直接用房间号加入即可</span>
      </p>
    </div>

    <div class="action">
      <button class="action-btn" :class="{ disabled: !canJoin }" @click="onJoin">加入房间</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { isNativeCapacitor } from '@/common/ws-server.js'

const router = useRouter()
const route = useRoute()
const isNative = ref(false)
const hostAddress = ref('')
const roomNo = ref(route.query.roomNo ? String(route.query.roomNo) : '')

onMounted(() => {
  isNative.value = isNativeCapacitor()
  // 预填扫码传入的 host
  if (route.query.host) {
    hostAddress.value = String(route.query.host)
  } else if (route.query.scanHost) {
    hostAddress.value = String(route.query.scanHost)
  } else if (route.query.ip) {
    // 兼容:从 URL ?ip=1.2.3.4&port=8848 预填
    const p = route.query.port ? String(route.query.port) : '8848'
    hostAddress.value = `${String(route.query.ip)}:${p}`
  }
})

const canJoin = computed(() => {
  if (isNative.value) {
    // 校验 IP:端口 形式
    return /^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(hostAddress.value.trim())
  }
  return roomNo.value.length >= 4
})

function useScan() {
  if (route.query.scanHost) hostAddress.value = String(route.query.scanHost)
}

function onJoin() {
  if (!canJoin.value) return
  if (isNative.value) {
    // ws 模式:URL ?role=joiner&host=1.2.3.4:8848
    router.push(`/room?role=joiner&host=${encodeURIComponent(hostAddress.value.trim())}`)
  } else {
    router.push(`/room?role=joiner&roomNo=${roomNo.value}`)
  }
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: var(--bg-deep); padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background:
    radial-gradient(circle at 50% 20%, rgba(255, 215, 0, 0.10), transparent 55%),
    radial-gradient(ellipse 95% 70% at 50% 55%,
      var(--emerald-bright, #1f7a55) 0%,
      var(--emerald-base, #14533b) 55%,
      var(--emerald-deep, #0a3d2c) 100%),
    linear-gradient(180deg, var(--bg-deep) 0%, var(--emerald-deep, #0a3d2c) 100%);
  box-shadow: var(--felt-inner-shadow, inset 0 0 80px rgba(0, 0, 0, 0.4)); }
.title, .card, .action { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: bold; color: #fff; text-align: center; margin-bottom: 24px; }
.card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 16px;
  color: #fff;
}
.card-title { font-size: 17px; font-weight: bold; margin-bottom: 14px; }
.card-hint { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 8px; }
.input-row {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 10px 14px;
}
.input-label { font-size: 15px; color: #fff; width: 80px; }
.input {
  flex: 1; background: transparent; border: none; outline: none;
  color: #fff; font-size: 17px;
  font-family: inherit;
}
.qr-row { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.action-btn-small {
  background: rgba(212, 175, 55, 0.25);
  color: #fff; border: none; border-radius: 6px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: var(--gold-metallic, linear-gradient(135deg, #ffd700 0%, #d4af37 50%, #a8862a 100%));
  color: #1a1a1a; border: none; border-radius: 14px;
  font-size: 17px; font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 215, 0, 0.35);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}
.action-btn.disabled { background: rgba(255,255,255,0.2); cursor: not-allowed; }
</style>
