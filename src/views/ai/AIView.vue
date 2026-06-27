<template>
  <div class="page">
    <div class="bg app-half-table-bg"></div>
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
      <!-- ★ v0.4.9:AI 难度选择(medium 默认 / hard 防守+炸弹保留) -->
      <div class="config-row">
        <span class="config-label">AI 难度</span>
        <div class="config-options">
          <button
            class="config-chip"
            :class="{ active: difficulty === 'medium' }"
            @click="difficulty = 'medium'">
            中等
            <small class="chip-hint">规则 + 贪心</small>
          </button>
          <button
            class="config-chip"
            :class="{ active: difficulty === 'hard' }"
            @click="difficulty = 'hard'">
            困难
            <small class="chip-hint">防守 + 炸弹保留</small>
          </button>
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
// ★ v0.4.9:AI 难度(默认 medium)
const difficulty = ref('medium')
function onStart() {
  router.push(`/game?levelRank=${levelRank.value}&ai=1&difficulty=${difficulty.value}`)
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #080b16; padding: 70px 20px 30px; overflow: hidden; }
.bg { z-index: 0; }
.title, .subtitle, .config-card, .action { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: 900; color: #fff; text-align: center; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 6px; }
.config-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 20px;
  margin-top: 24px;
  color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.config-title { font-size: 17px; font-weight: 800; margin-bottom: 14px; color: #ffe37c; }
.config-label { font-size: 14px; color: rgba(255,255,255,0.75); display: block; margin-bottom: 8px; }
.config-options { display: flex; flex-wrap: wrap; gap: 8px; }
.config-chip {
  background: rgba(4, 8, 22, 0.36);
  color: #fff;
  padding: 6px 14px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}
.config-chip.active {
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border-color: rgba(255,255,255,0.7);
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.28);
}
.chip-hint {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
  letter-spacing: 0;
}
.config-chip.active .chip-hint {
  color: var(--gold-primary, #d4af37);
}
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 56px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border: none; border-radius: 12px;
  font-size: 17px; font-weight: 900;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(255, 178, 24, 0.38), inset 0 1px 0 rgba(255,255,255,0.72);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
}
</style>
