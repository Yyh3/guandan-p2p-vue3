<template>
  <div class="page">
    <div class="bg app-half-table-bg"></div>
    <!-- ★ v0.4.24:补返回入口(与 JoinView/SettingsView 一致) -->
    <button class="back-btn-top" aria-label="返回" @click="router.back()">← 返回</button>
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

    <!-- ★ v0.4.28 P1-1:成就徽章墙 — 离线收集欲,回访动力;未解锁置灰,已解锁金亮 -->
    <div class="achv-card">
      <div class="achv-head">
        <h3 class="achv-title">成就徽章</h3>
        <span class="achv-count">{{ unlockedCount }}/{{ ACHIEVEMENTS.length }}</span>
      </div>
      <div class="achv-grid">
        <div
          v-for="a in ACHIEVEMENTS"
          :key="a.id"
          class="achv-item"
          :class="{ unlocked: isAchvUnlocked(a.id) }"
        >
          <span class="achv-icon" aria-hidden="true">{{ a.icon }}</span>
          <span class="achv-name">{{ a.name }}</span>
          <span class="achv-desc">{{ a.desc }}</span>
        </div>
      </div>
    </div>

    <!-- ★ v0.4.28 P1-2:牌风雷达 — 四维画像,给数字一个“我是什么风格”的谈资 -->
    <div v-if="history.length >= 3" class="radar-card">
      <h3 class="radar-card-title">我的牌风</h3>
      <PlayStyleRadar :values="radarValues" />
    </div>

    <!-- v3.7 P2:战绩图表(柱状 + 折线,零依赖 SVG) -->
    <HistoryChart :history="history" />

    <!-- ★ v0.4.9:升级速度趋势图(纯 SVG,无依赖) -->
    <div v-if="history.length >= 2" class="trend-card">
      <h3 class="trend-title">升级速度趋势(滚动平均 5 局)</h3>
      <LevelUpTrendChart :records="history" :window-size="5" />
    </div>

    <div v-if="history.length === 0" class="empty">
      <div class="empty-icon" aria-hidden="true">🏆</div>
      <p class="empty-text">暂无对局记录</p>
      <p class="empty-hint">完成第一局后，这里会显示胜率、升级趋势和最近战绩。</p>
      <button class="empty-action" @click="router.push('/')">去开一局</button>
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
          <span v-if="isMyTeamWin(rec, rec.mySeat ?? 0)" class="win"><span aria-hidden="true">🏆</span> 你方获胜</span>
          <span v-else class="lose"><span aria-hidden="true">💀</span> 对方获胜</span>
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
import { useRouter } from 'vue-router'
import storage from '@/common/storage.js'
import { showConfirm, showToast } from '@/common/dialog-bus.js'

const router = useRouter()
import HistoryChart from '@/components/HistoryChart.vue'
import LevelUpTrendChart from '@/components/LevelUpTrendChart.vue'
import PlayStyleRadar from '@/components/PlayStyleRadar.vue'
import { computeSummary, isMyTeamWin } from '@/common/history.js'
import { ACHIEVEMENTS, getUnlockedIds } from '@/common/achievements.js'

const history = ref([])
// ★ v0.4.28 P1-1:成就解锁状态
const unlockedIds = ref([])
const unlockedCount = computed(() => unlockedIds.value.length)
function isAchvUnlocked(id) { return unlockedIds.value.includes(id) }

// ★ v0.4.9:用 computeSummary 一次拿全部统计
// ★ v0.4.24:computeSummary 逐条按 rec.mySeat 计算(联机每局座位可能不同),
//   不再用 history[0].mySeat 一个座位套所有记录;缺 mySeat 的旧记录回退到 0
const summary = computed(() => computeSummary(history.value, 0))
const streakClass = computed(() => {
  const s = summary.value.streak
  if (s > 0) return 'streak-win'
  if (s < 0) return 'streak-lose'
  return ''
})
// ★ v0.4.28 P1-2:牌风雷达四维(0..1)— 胜率/头游力/稳健度/升级速度
const radarValues = computed(() => {
  const s = summary.value
  const n = s.totalGames || 1
  return [
    s.winRate,
    s.rankDistribution.first / n,
    1 - s.rankDistribution.last / n,
    Math.min(s.avgLevelUp / 3, 1),
  ]
})

onMounted(() => {
  history.value = storage.getHistory()
  unlockedIds.value = getUnlockedIds()
})
function rankColor(pos) { return ['gold','silver','bronze','last'][pos] }
function formatTime(t) {
  const d = new Date(t)
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${M}-${D} ${h}:${m}`
}
// ★ P2-03 修复:战绩页清空统一走项目 ConfirmDialog / ToastOverlay,不用原生弹窗。
function onClear() {
  showConfirm({
    title: '清空战绩',
    message: '清空所有战绩?此操作不可恢复',
    confirmText: '清空',
    cancelText: '取消',
    onConfirm: () => {
      storage.clearHistory()
      history.value = []
      showToast('战绩已清空')
    },
  })
}
</script>

<style scoped>
.page { position: relative; min-height: 100vh; background: #080b16; padding: 70px 20px 30px; overflow: hidden; }
/* ★ v0.4.24:左上角返回按钮 */
.back-btn-top {
  position: absolute; top: 18px; left: 18px; z-index: 2;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.back-btn-top:hover { background: rgba(255,255,255,0.18); }
.bg { z-index: 0; }
.title, .subtitle, .stat-card, .empty, .history-list, .action { position: relative; z-index: 1; }
/* v3.7 P2:让图表卡片也浮在 bg 之上 */
.chart-card { position: relative; z-index: 1; }
.title { font-size: 28px; font-weight: 900; color: #fff; text-align: center; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.subtitle { font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 6px; }
.stat-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 16px;
  margin-top: 24px;
  display: flex; color: #fff;
  box-shadow: 0 18px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
  backdrop-filter: blur(14px);
}
.stat-item { flex: 1; text-align: center; }
.stat-num { font-size: 28px; font-weight: bold; color: #ffe37c; }
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

/* ★ v0.4.28 P1-1:成就徽章墙 — 已解锁金亮/未解锁置灰,hover 微抬 */
.achv-card {
  position: relative; z-index: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 12px;
  color: #fff;
}
.achv-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.achv-title { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 2px; }
.achv-count {
  font-size: 12px; font-weight: 800;
  color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.3);
  padding: 2px 10px; border-radius: 999px;
}
.achv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 420px) { .achv-grid { grid-template-columns: repeat(2, 1fr); } }
.achv-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
  filter: grayscale(1);
  opacity: 0.42;
  transition: transform var(--t-fast) var(--ease-out), box-shadow 200ms var(--ease-out), filter 200ms var(--ease-out), opacity 200ms var(--ease-out);
}
.achv-item.unlocked {
  filter: none;
  opacity: 1;
  background: linear-gradient(160deg, rgba(255, 215, 0, 0.14), rgba(255, 215, 0, 0.04));
  border-color: rgba(255, 215, 0, 0.4);
  box-shadow: 0 4px 14px rgba(212, 175, 55, 0.18);
}
.achv-item.unlocked:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3); }
.achv-icon { font-size: 26px; line-height: 1; }
.achv-item.unlocked .achv-icon { text-shadow: 0 0 12px rgba(255, 215, 0, 0.5); }
.achv-name { font-size: 13px; font-weight: 800; letter-spacing: 1px; }
.achv-item.unlocked .achv-name { color: var(--gold-bright); }
.achv-desc { font-size: 10px; color: rgba(255, 255, 255, 0.55); line-height: 1.4; }

/* ★ v0.4.28 P1-2:牌风雷达卡片 */
.radar-card {
  position: relative; z-index: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 12px;
  color: #fff;
}
.radar-card-title { margin: 0 0 8px; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-align: center; }

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
.empty-hint { font-size: 13px; color: rgba(255,255,255,0.55); margin-top: 8px; line-height: 1.5; padding: 0 24px; }
.empty-action {
  margin-top: 18px;
  padding: 12px 28px;
  background: linear-gradient(180deg, #fff2a8 0%, #ffd24e 42%, #ce8e1b 100%);
  color: #3a2308;
  border: none;
  border-radius: 24px;
  font-size: 16px; font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(233, 173, 63, 0.26);
}
.history-list { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.history-item {
  background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 12px;
  padding: 14px;
  color: #fff;
  box-shadow: 0 14px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.14);
  backdrop-filter: blur(14px);
}
.item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.item-time { font-size: 12px; color: rgba(255,255,255,0.6); }
.item-level { font-size: 14px; font-weight: bold; color: #4caf50; }
.item-level.big { color: #ffeb3b; }
.item-ranks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rank-cell { background: rgba(4, 8, 22, 0.36); padding: 6px 10px; border-radius: 6px; }
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
  background: rgba(225, 75, 80, 0.18);
  color: #ffaaa8;
  border: 1px solid rgba(255, 132, 128, 0.55);
  border-radius: 12px;
  font-size: 15px; font-weight: bold;
  cursor: pointer;
}
</style>
