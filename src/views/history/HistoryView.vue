<template>
  <div class="page">
    <div class="bg"></div>
    <h1 class="title">本地战绩</h1>
    <p class="subtitle">只存本机,不上传任何服务器</p>

    <!-- ★ v0.4.9:扩展统计区(胜率 / 平均升级 / 连胜 / 名次分布) -->
    <div v-if="history.length > 0" class="stat-card stat-card-extended">
      <div class="stat-item">
        <div class="stat-num">{{ summary.totalGames }}</div>
        <div class="stat-label">总对局</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ summary.wins }}</div>
        <div class="stat-label">胜方次数</div>
      </div>
      <div class="stat-item">
        <div class="stat-num highlight">{{ (summary.winRate * 100).toFixed(1) }}%</div>
        <div class="stat-label">胜率</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ summary.avgLevelUp.toFixed(2) }}</div>
        <div class="stat-label">平均升级/局</div>
      </div>
    </div>

    <!-- ★ v0.4.9:连胜 + 最近 5 局胜负形 -->
    <div v-if="history.length > 0" class="form-card">
      <div class="form-row">
        <span class="form-label">当前连胜</span>
        <span class="form-value" :class="streakClass">
          <template v-if="summary.streak > 0">🔥 {{ summary.streak }} 连胜</template>
          <template v-else-if="summary.streak < 0">❄️ {{ -summary.streak }} 连败</template>
          <template v-else>— 平</template>
        </span>
      </div>
      <div class="form-row">
        <span class="form-label">最近 5 局</span>
        <span class="form-value form-recent">
          <span v-for="(r, i) in summary.recentForm" :key="i" :class="['form-cell', r === 'W' ? 'win' : 'lose']">
            {{ r }}
          </span>
          <span v-if="summary.recentForm.length === 0" class="form-empty">—</span>
        </span>
      </div>
      <div class="form-row">
        <span class="form-label">名次分布</span>
        <span class="form-value form-rank">
          <span class="rank-tag gold">头 {{ summary.rankDistribution.first }}</span>
          <span class="rank-tag silver">二 {{ summary.rankDistribution.second }}</span>
          <span class="rank-tag bronze">三 {{ summary.rankDistribution.third }}</span>
          <span class="rank-tag last">末 {{ summary.rankDistribution.last }}</span>
        </span>
      </div>
    </div>

    <!-- v3.7 P2:战绩图表(柱状 + 折线,零依赖 SVG) -->
    <HistoryChart :history="history" />

    <!-- ★ v0.4.9:升级速度趋势图(纯 SVG,无依赖) -->
    <div v-if="history.length >= 2" class="trend-card">
      <h3 class="trend-title">升级速度趋势(滚动平均 5 局)</h3>
      <LevelUpTrendChart :records="history" :window-size="5" />
    </div>

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
import LevelUpTrendChart from '@/components/LevelUpTrendChart.vue'
import { computeSummary, isMyTeamWin } from '@/common/history.js'

const history = ref([])

// ★ v0.4.9:用 computeSummary 一次拿全部统计
const summary = computed(() => computeSummary(history.value, 0))
const streakClass = computed(() => {
  const s = summary.value.streak
  if (s > 0) return 'streak-win'
  if (s < 0) return 'streak-lose'
  return ''
})

onMounted(() => { history.value = storage.getHistory() })
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
.page { position: relative; min-height: 100vh; background: var(--bg-deep); padding: 70px 20px 30px; }
.bg { position: fixed; inset: 0; background:
    radial-gradient(circle at 30% 20%, rgba(255, 215, 0, 0.10), transparent 55%),
    radial-gradient(ellipse 95% 70% at 50% 55%,
      var(--emerald-bright, #1f7a55) 0%,
      var(--emerald-base, #14533b) 55%,
      var(--emerald-deep, #0a3d2c) 100%),
    linear-gradient(180deg, var(--bg-deep) 0%, var(--emerald-deep, #0a3d2c) 100%);
  box-shadow: var(--felt-inner-shadow, inset 0 0 80px rgba(0, 0, 0, 0.4)); }
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
.stat-num.highlight { color: #4caf50; }
.stat-label { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 2px; }
/* ★ v0.4.9:扩展统计(4 项:总/胜/胜率/平均升级) */
.stat-card-extended { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
.stat-card-extended .stat-num { font-size: 22px; }

/* ★ v0.4.9:连胜 / 最近 5 局 / 名次分布 */
.form-card {
  position: relative; z-index: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 12px;
  color: #fff;
}
.form-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0;
  font-size: 14px;
}
.form-row + .form-row { border-top: 1px solid rgba(255, 255, 255, 0.08); }
.form-label { color: rgba(255, 255, 255, 0.7); }
.form-value { font-weight: 700; }
.streak-win { color: #4caf50; }
.streak-lose { color: #e94560; }
.form-recent { display: flex; gap: 4px; }
.form-cell {
  display: inline-grid; place-items: center;
  width: 22px; height: 22px;
  border-radius: 4px; font-size: 12px; font-weight: 900;
}
.form-cell.win { background: rgba(76, 175, 80, 0.3); color: #4caf50; }
.form-cell.lose { background: rgba(244, 67, 54, 0.25); color: #e57373; }
.form-empty { color: rgba(255, 255, 255, 0.4); }
.form-rank { display: flex; gap: 6px; flex-wrap: wrap; }
.rank-tag {
  display: inline-block; padding: 2px 8px;
  border-radius: 10px; font-size: 12px;
}
.rank-tag.gold { background: rgba(255, 215, 0, 0.18); color: #ffd700; }
.rank-tag.silver { background: rgba(192, 192, 192, 0.18); color: #c0c0c0; }
.rank-tag.bronze { background: rgba(205, 127, 50, 0.18); color: #cd7f32; }
.rank-tag.last { background: rgba(255, 255, 255, 0.1); color: #999; }

/* ★ v0.4.9:升级速度趋势卡片 */
.trend-card {
  position: relative; z-index: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 12px;
  color: #fff;
}
.trend-title { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
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
