<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">单机 AI 模式</h1>
    <p class="subtitle">无网络,3 个 AI 对手,适合练手</p>
    <div class="config-card">
      <h2 class="config-title">对局配置</h2>
      <div class="config-row">
        <span class="config-label">起始级牌</span>
        <div class="config-options">
          <button v-for="lv in levelOptions" :key="lv.rank"
            class="config-chip" :class="{ active: levelRank === lv.rank }"
            @click="levelRank = lv.rank">打 {{ lv.label }}</button>
        </div>
      </div>
    </div>
    <div class="action">
      <button class="action-btn" @click="onStart">开始对局</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const levelRank = ref(15)
const levelOptions = [
  { rank: 3, label: '3' },
  { rank: 5, label: '5' },
  { rank: 7, label: '7' },
  { rank: 10, label: '10' },
  { rank: 15, label: '2' },
]
function onStart() {
  router.push(`/game?levelRank=${levelRank.value}&ai=1`)
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #2a3464; padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(108, 195, 245, 0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(47, 138, 79, 0.3), transparent 50%); }
.title, .subtitle, .config-card, .action { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: bold; color: #fff; text-align: center; }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.6); text-align: center; margin-top: 6px; }
.config-card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 20px;
  margin-top: 24px;
  color: #fff;
}
.config-title { font-size: 17px; font-weight: bold; margin-bottom: 14px; }
.config-label { font-size: 14px; color: rgba(255,255,255,0.7); display: block; margin-bottom: 8px; }
.config-options { display: flex; flex-wrap: wrap; gap: 8px; }
.config-chip {
  background: rgba(255,255,255,0.1);
  color: #fff;
  padding: 6px 14px;
  border: 2px solid transparent;
  border-radius: 14px;
  font-size: 14px;
  cursor: pointer;
}
.config-chip.active {
  background: linear-gradient(180deg, #4caf50, #2e7d32);
  border-color: #fff;
}
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: #fff;
  border: none; border-radius: 14px;
  font-size: 17px; font-weight: bold;
  cursor: pointer;
}
</style>
