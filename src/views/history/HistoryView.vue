<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">本地战绩</h1>
    <p class="subtitle">只存本机,不上传任何服务器</p>

    <div v-if="history.length > 0" class="stat-card">
      <div class="stat-item"><div class="stat-num">{{ history.length }}</div><div class="stat-label">总对局</div></div>
      <div class="stat-item"><div class="stat-num">{{ winCount }}</div><div class="stat-label">胜方次数</div></div>
      <div class="stat-item"><div class="stat-num">{{ totalLevelUp }}</div><div class="stat-label">累计升级</div></div>
    </div>

    <!-- v3.7 P2:战绩图表(柱状 + 折线,零依赖 SVG) -->
    <HistoryChart :history="history" />

    <div v-if="history.length === 0" class="empty">
      <div class="empty-icon">📋</div>
      <p class="empty-text">还没有战绩</p>
      <p class="empty-hint">开局后会自动记录</p>
    </div>

    <div v-else class="history-list">
      <div v-for="(rec, i) in history" :key="i" class="history-item">
        <div class="item-header">
          <span class="item-time">{{ formatTime(rec.time) }}</span>
          <span class="item-level" :class="{ big: rec.levelUp >= 2 }">+{{ rec.levelUp }} 级</span>
        </div>
        <div class="item-ranks">
          <div v-for="(seat, j) in rec.ranks" :key="j" class="rank-cell" :class="rankColor(j)">
            <span class="rank-pos">{{ ['头游','二游','三游','末游'][j] }}</span>
            <span class="rank-name">{{ rec.players[seat]?.name }} {{ rec.players[seat]?.avatar }}</span>
          </div>
        </div>
        <div class="item-team">
          <span v-if="isMyTeamWin(rec, 0)" class="win">🏆 你方获胜</span>
          <span v-else class="lose">💀 对方获胜</span>
        </div>
      </div>
    </div>

    <div v-if="history.length > 0" class="action">
      <button class="action-btn warn" @click="onClear">清空战绩</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import storage from '@/common/storage.js'
import HistoryChart from '@/components/HistoryChart.vue'
const history = ref([])
const winCount = computed(() => history.value.filter(r => isMyTeamWin(r, 0)).length)
const totalLevelUp = computed(() => history.value.reduce((s, r) => s + r.levelUp, 0))
onMounted(() => { history.value = storage.getHistory() })
function isMyTeamWin(rec, mySeat) {
  const myTeam = mySeat % 2
  const winnerSeat = rec.ranks[0]
  return myTeam === winnerSeat % 2
}
function rankColor(pos) { return ['gold','silver','bronze','last'][pos] }
function formatTime(t) {
  const d = new Date(t)
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${M}-${D} ${h}:${m}`
}
function onClear() {
  if (confirm('清空所有战绩?此操作不可恢复')) {
    storage.clearHistory()
    history.value = []
  }
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #2a3464; padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(108, 195, 245, 0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(47, 138, 79, 0.3), transparent 50%); }
.title, .subtitle, .stat-card, .empty, .history-list, .action { position: relative; z-index: 1; }
/* v3.7 P2:让图表卡片也浮在 bg 之上 */
.chart-card { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: bold; color: #fff; text-align: center; }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.5); text-align: center; margin-top: 6px; }
.stat-card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 24px;
  display: flex; color: #fff;
}
.stat-item { flex: 1; text-align: center; }
.stat-num { font-size: 28px; font-weight: bold; color: #ffeb3b; }
.stat-label { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 2px; }
.empty { text-align: center; padding: 60px 0; color: #fff; }
.empty-icon { font-size: 60px; opacity: 0.5; }
.empty-text { font-size: 18px; margin-top: 12px; }
.empty-hint { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.history-list { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.history-item {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px;
  padding: 14px;
  color: #fff;
}
.item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.item-time { font-size: 12px; color: rgba(255,255,255,0.6); }
.item-level { font-size: 14px; font-weight: bold; color: #4caf50; }
.item-level.big { color: #ffeb3b; }
.item-ranks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rank-cell { background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px; }
.rank-pos { display: block; font-size: 12px; font-weight: bold; }
.rank-name { display: block; font-size: 12px; margin-top: 2px; }
.rank-cell.gold { border-left: 3px solid #ffd700; }
.rank-cell.gold .rank-pos { color: #ffd700; }
.rank-cell.silver { border-left: 3px solid #c0c0c0; }
.rank-cell.silver .rank-pos { color: #c0c0c0; }
.rank-cell.bronze { border-left: 3px solid #cd7f32; }
.rank-cell.bronze .rank-pos { color: #cd7f32; }
.rank-cell.last { border-left: 3px solid #666; }
.rank-cell.last .rank-pos { color: #999; }
.item-team { margin-top: 8px; text-align: center; }
.win { font-size: 13px; color: #4caf50; font-weight: bold; }
.lose { font-size: 13px; color: #e94560; font-weight: bold; }
.action { margin-top: 24px; }
.action-btn {
  width: 100%; height: 48px;
  background: rgba(244, 67, 54, 0.2);
  color: #e57373;
  border: 1px solid #e57373;
  border-radius: 12px;
  font-size: 15px; font-weight: bold;
  cursor: pointer;
}
</style>
