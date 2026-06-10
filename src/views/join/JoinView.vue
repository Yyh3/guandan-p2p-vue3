<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">连热点加入房间</h1>
    <div class="card">
      <h2 class="card-title">方式 1:输入房间号</h2>
      <div class="input-row">
        <span class="input-label">房间号</span>
        <input v-model="roomNo" maxlength="6" placeholder="6 位数字" class="input" />
      </div>
      <p class="card-hint">房主开热点后,会显示一个 6 位数字房间号</p>
    </div>
    <div class="card">
      <h2 class="card-title">方式 2:本机模拟(同浏览器多标签)</h2>
      <p class="card-hint">浏览器内已用 BroadcastChannel 自动通信,直接用房间号加入即可</p>
    </div>
    <div class="action">
      <button class="action-btn" :class="{ disabled: !canJoin }" @click="onJoin">加入房间</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
// URL ?roomNo=xxxxxx 直接预填(分享链接 / 扫码加入)
const roomNo = ref(route.query.roomNo ? String(route.query.roomNo) : '')
const canJoin = computed(() => roomNo.value.length >= 4)
function onJoin() {
  if (!canJoin.value) return
  router.push(`/room?role=joiner&roomNo=${roomNo.value}`)
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #2a3464; padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background: radial-gradient(circle at 50% 20%, rgba(108, 195, 245, 0.15), transparent 50%); }
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
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: #fff; border: none; border-radius: 14px;
  font-size: 17px; font-weight: bold;
  cursor: pointer;
}
.action-btn.disabled { background: rgba(255,255,255,0.2); cursor: not-allowed; }
</style>
