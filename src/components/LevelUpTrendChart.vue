<template>
  <div class="trend-chart">
    <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" class="svg">
      <!-- 网格线 -->
      <line
        v-for="g in gridLines"
        :key="`grid-${g.y}`"
        :x1="padX" :x2="width - padR" :y1="g.y" :y2="g.y"
        stroke="rgba(255,255,255,0.1)" stroke-width="1"
      />
      <text
        v-for="g in gridLines"
        :key="`label-${g.y}`"
        :x="padX - 6" :y="g.y + 4" text-anchor="end"
        font-size="10" fill="rgba(255,255,255,0.5)"
      >{{ g.label }}</text>

      <!-- 折线 -->
      <polyline
        v-if="points.length >= 2"
        :points="linePoints"
        stroke="#4caf50" stroke-width="2" fill="none"
      />

      <!-- 数据点 -->
      <circle
        v-for="(p, i) in points"
        :key="`pt-${i}`"
        :cx="p.x" :cy="p.y" r="3"
        fill="#4caf50"
      />

      <!-- X 轴标签(每 5 局) -->
      <text
        v-for="x in xLabels"
        :key="`xlabel-${x.i}`"
        :x="x.x" :y="height - 4" text-anchor="middle"
        font-size="10" fill="rgba(255,255,255,0.5)"
      >{{ x.label }}</text>
    </svg>
    <p v-if="records.length < 2" class="empty-hint">需要至少 2 局战绩</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { computeLevelUpTrend } from '@/common/history.js'

const props = defineProps({
  records: { type: Array, required: true },
  windowSize: { type: Number, default: 5 },
})

const width = 320
const height = 120
const padX = 24
const padR = 8
const padT = 8
const padB = 18

// 计算滚动平均
const trend = computed(() => computeLevelUpTrend(props.records, props.windowSize))

// Y 轴范围(0..max + 10%)
const yMax = computed(() => {
  const max = Math.max(0, ...trend.value)
  return Math.max(2, Math.ceil(max * 1.1))  // 至少 2,避免 max=0 时图表太扁
})

// 数据点(SVG 坐标)
const points = computed(() => {
  const n = trend.value.length
  if (n === 0) return []
  const innerW = width - padX - padR
  const innerH = height - padT - padB
  return trend.value.map((v, i) => ({
    x: padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: padT + innerH - (v / yMax.value) * innerH,
    v,
  }))
})

const linePoints = computed(() =>
  points.value.map(p => `${p.x},${p.y}`).join(' ')
)

// 网格线(3 条:0%, 50%, 100%)
const gridLines = computed(() => {
  const innerH = height - padT - padB
  return [0, 0.5, 1].map(t => {
    const y = padT + innerH * (1 - t)
    return { y, label: (yMax.value * t).toFixed(1) }
  })
})

// X 轴标签(每 5 局)
const xLabels = computed(() => {
  const n = trend.value.length
  if (n === 0) return []
  const innerW = width - padX - padR
  const out = []
  // 第 0 局 + 每 5 局 + 最后一局
  const indices = new Set([0, n - 1])
  for (let i = 5; i < n - 1; i += 5) indices.add(i)
  for (const i of indices) {
    if (i < 0 || i >= n) continue
    const p = points.value[i]
    if (!p) continue
    out.push({
      i,
      x: p.x,
      label: `第${i + 1}局`,
    })
  }
  return out.sort((a, b) => a.i - b.i)
})
</script>

<style scoped>
.trend-chart { width: 100%; }
.svg { display: block; width: 100%; height: auto; max-width: 320px; margin: 0 auto; }
.empty-hint { text-align: center; font-size: 12px; color: rgba(255,255,255,0.4); }
</style>
