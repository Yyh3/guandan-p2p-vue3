<template>
  <div class="chart-card">
    <h3 class="chart-title">📊 战绩可视化</h3>
    <p class="chart-hint">近 {{ recentGames.length }} 局</p>

    <template v-if="recentGames.length === 0">
      <div class="chart-empty">还没有战绩数据,先开几局吧</div>
    </template>

    <template v-else>
      <!-- 柱状图:每局 4 颗(头游/二游/三游/末游) -->
      <div class="chart-block">
        <div class="chart-block-title">胜负分布(柱高 = 名次)</div>
        <svg
          class="chart-svg"
          :viewBox="`0 0 ${barView.w} ${barView.h}`"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="近 10 局胜负柱状图"
        >
          <!-- Y 轴标签:4 颗(头游) / 1 颗(末游) -->
          <g class="axis-y">
            <text
              v-for="(t, i) in barAxisLabels"
              :key="`yl-${i}`"
              :x="barView.padL - 4"
              :y="barY(i) + 3"
              text-anchor="end"
              class="axis-text"
            >{{ t }}</text>
            <line
              :x1="barView.padL"
              :x2="barView.w - barView.padR"
              :y1="barY(0)"
              :y2="barY(0)"
              class="axis-line"
            />
            <line
              :x1="barView.padL"
              :x2="barView.w - barView.padR"
              :y1="barY(3)"
              :y2="barY(3)"
              class="axis-line"
            />
          </g>

          <!-- 柱子 -->
          <g v-for="(g, gi) in recentGames" :key="`g-${gi}`">
            <g v-for="pos in 4" :key="`p-${gi}-${pos}`">
              <rect
                :x="barX(gi, pos)"
                :y="barY(pos - 1)"
                :width="barGeom.barW"
                :height="barGeom.barH"
                :class="['bar', `pos-${pos - 1}`]"
                rx="1.5"
              >
                <title>{{ formatGameLabel(gi) }} · {{ POS_NAMES[pos - 1] }}</title>
              </rect>
            </g>
            <!-- X 轴:局号(1=最新,N=最旧) -->
            <text
              :x="barGeom.groupCenter + barGeom.groupW / 2 - barGeom.barW * 2"
              :y="barView.h - 4"
              text-anchor="middle"
              class="axis-text"
            >{{ recentGames.length - gi }}</text>
          </g>
        </svg>
        <div class="chart-legend">
          <span class="lg pos-0"><i></i>头游</span>
          <span class="lg pos-1"><i></i>二游</span>
          <span class="lg pos-2"><i></i>三游</span>
          <span class="lg pos-3"><i></i>末游</span>
        </div>
      </div>

      <!-- 折线图:级数趋势 -->
      <div class="chart-block">
        <div class="chart-block-title">级数趋势(Y: 3-2)</div>
        <svg
          class="chart-svg"
          :viewBox="`0 0 ${lineView.w} ${lineView.h}`"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="近 10 局级数趋势折线图"
        >
          <!-- 网格横线(Y 每 2 级) -->
          <g class="grid">
            <line
              v-for="(ly, idx) in lineGridYs"
              :key="`gy-${idx}`"
              :x1="lineView.padL"
              :x2="lineView.w - lineView.padR"
              :y1="ly"
              :y2="ly"
              class="grid-line"
            />
          </g>
          <!-- Y 轴标签 -->
          <g class="axis-y">
            <text
              v-for="(rank, i) in lineAxisRanks"
              :key="`yl-${i}`"
              :x="lineView.padL - 4"
              :y="lineY(rank) + 3"
              text-anchor="end"
              class="axis-text"
            >{{ rankLabel(rank) }}</text>
          </g>
          <!-- 折线 path -->
          <path
            v-if="recentGames.length >= 2"
            :d="linePath"
            class="line-path"
            fill="none"
          />
          <!-- 数据点 -->
          <g>
            <circle
              v-for="(p, i) in linePoints"
              :key="`pt-${i}`"
              :cx="p.x"
              :cy="p.y"
              r="3"
              class="line-point"
            >
              <title>{{ formatGameLabel(i) }} · {{ rankLabel(p.rank) }}</title>
            </circle>
          </g>
          <!-- X 轴:局号 -->
          <g class="axis-x">
            <text
              v-for="(_, i) in recentGames"
              :key="`xl-${i}`"
              :x="lineX(i)"
              :y="lineView.h - 4"
              text-anchor="middle"
              class="axis-text"
            >{{ recentGames.length - i }}</text>
          </g>
        </svg>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  history: { type: Array, default: () => [] },
})

const POS_NAMES = ['头游', '二游', '三游', '末游']

// 只取最近 10 局(addHistory 已经是 unshift,所以 props.history[0] 是最新)
const recentGames = computed(() => (props.history || []).slice(0, 10))

// ====== 柱状图几何 ======
const barView = { w: 600, h: 200, padL: 28, padR: 8, padT: 12, padB: 18 }
const barAxisLabels = computed(() => ['头游', '二游', '三游', '末游'])
// 4 颗并列柱,每组宽度按局数自适应
const barGeom = computed(() => {
  const innerW = barView.w - barView.padL - barView.padR
  const usableW = innerW - 4 // 留点缝
  const n = Math.max(recentGames.value.length, 1)
  const groupW = usableW / n
  const barW = Math.max(Math.min(groupW / 5, 10), 2)
  const barH = (barView.h - barView.padT - barView.padB) / 4
  return { groupW, groupCenter: 0, barW, barH }
})

function barY(posIdx) {
  // posIdx: 0=头游(顶), 3=末游(底)
  // 顶 y 小,底 y 大
  return barView.padT + posIdx * barGeom.value.barH
}
function barX(gi, pos) {
  // pos: 1..4
  const groupStart = barView.padL + gi * barGeom.value.groupW + 2
  const barW = barGeom.value.barW
  return groupStart + (pos - 1) * barW
}
function formatGameLabel(gi) {
  return `第 ${recentGames.value.length - gi} 局`
}

// ====== 折线图几何 ======
const lineView = { w: 600, h: 180, padL: 28, padR: 12, padT: 12, padB: 18 }
const RANK_MIN = 2   // 2
const RANK_MAX = 14  // A
// 隔 2 级画一条网格线 + 标签(2/4/6/8/10/12/14)
const lineAxisRanks = computed(() => {
  const ranks = []
  for (let r = RANK_MIN; r <= RANK_MAX; r += 2) ranks.push(r)
  return ranks
})
function rankLabel(r) {
  // 2..10 用数字,11=J 12=Q 13=K 14=A
  if (r === 11) return 'J'
  if (r === 12) return 'Q'
  if (r === 13) return 'K'
  if (r === 14) return 'A'
  return String(r)
}
function lineY(rank) {
  // rank=RANK_MAX 在最顶,RANK_MIN 在最底
  const usable = lineView.h - lineView.padT - lineView.padB
  const ratio = (rank - RANK_MIN) / (RANK_MAX - RANK_MIN)
  return lineView.padT + (1 - ratio) * usable
}
function lineX(i) {
  const usable = lineView.w - lineView.padL - lineView.padR
  const n = recentGames.value.length
  if (n === 1) return lineView.padL + usable / 2
  return lineView.padL + (i / (n - 1)) * usable
}
const linePoints = computed(() => {
  return recentGames.value.map((g, i) => {
    const r = Number(g.levelRank) || RANK_MIN
    const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, r))
    return { x: lineX(i), y: lineY(clamped), rank: clamped }
  })
})
const linePath = computed(() => {
  if (linePoints.value.length < 2) return ''
  return linePoints.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
})
const lineGridYs = computed(() => {
  return lineAxisRanks.value.map(r => lineY(r))
})
</script>

<style scoped>
.chart-card {
  position: relative;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 14px;
  padding: 16px;
  margin-top: 20px;
  color: #fff;
}
.chart-title { font-size: 16px; font-weight: bold; margin: 0 0 4px; }
.chart-hint { font-size: 11px; color: rgba(255,255,255,0.55); margin: 0 0 12px; }
.chart-empty {
  text-align: center;
  padding: 24px 0;
  color: rgba(255,255,255,0.5);
  font-size: 13px;
}
.chart-block { margin-top: 14px; }
.chart-block:first-of-type { margin-top: 0; }
.chart-block-title {
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  background: rgba(0,0,0,0.18);
  border-radius: 8px;
}
.axis-text {
  fill: rgba(255,255,255,0.55);
  font-size: 9px;
  font-family: inherit;
}
.axis-line {
  stroke: rgba(255,255,255,0.15);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.grid-line {
  stroke: rgba(255,255,255,0.07);
  stroke-width: 1;
  stroke-dasharray: 1 4;
}
.line-path {
  stroke: #6cc3f5;
  stroke-width: 1.8;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.line-point {
  fill: #ffeb3b;
  stroke: #2a3464;
  stroke-width: 1;
}
/* 柱状图配色:头游金/二游银/三游铜/末游灰 */
.bar { stroke: rgba(0,0,0,0.35); stroke-width: 0.5; }
.bar.pos-0 { fill: #ffd700; }   /* gold */
.bar.pos-1 { fill: #c0c0c0; }   /* silver */
.bar.pos-2 { fill: #cd7f32; }   /* bronze */
.bar.pos-3 { fill: #6c6c6c; }   /* gray */

.chart-legend {
  display: flex; flex-wrap: wrap; gap: 10px;
  margin-top: 8px; padding-left: 4px;
  font-size: 11px; color: rgba(255,255,255,0.7);
}
.chart-legend .lg { display: inline-flex; align-items: center; gap: 4px; }
.chart-legend .lg i {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 2px;
}
.chart-legend .lg.pos-0 i { background: #ffd700; }
.chart-legend .lg.pos-1 i { background: #c0c0c0; }
.chart-legend .lg.pos-2 i { background: #cd7f32; }
.chart-legend .lg.pos-3 i { background: #6c6c6c; }
</style>
