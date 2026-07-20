<template>
  <!--
    ★ v0.4.28 P1-2:牌风雷达图(零依赖 SVG)
    四维:胜率 / 头游力 / 稳健度 / 升级速度,全部从现有战绩推导。
    金色数据多边形 + 翡翠网格环,与全局主题一致。
  -->
  <svg class="radar" :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="牌风雷达图">
    <!-- 网格环(4 层) -->
    <polygon
      v-for="ring in 4"
      :key="'ring' + ring"
      :points="ringPoints(ring / 4)"
      class="radar-ring"
    />
    <!-- 轴线 -->
    <line
      v-for="(a, i) in axes"
      :key="'axis' + i"
      :x1="cx" :y1="cy"
      :x2="cx + radius * Math.cos(angle(i))"
      :y2="cy + radius * Math.sin(angle(i))"
      class="radar-axis"
    />
    <!-- 数据多边形 -->
    <polygon :points="dataPoints" class="radar-data" />
    <circle
      v-for="(a, i) in axes"
      :key="'dot' + i"
      :cx="cx + radius * values[i] * Math.cos(angle(i))"
      :cy="cy + radius * values[i] * Math.sin(angle(i))"
      r="3.5"
      class="radar-dot"
    />
    <!-- 维度标签 -->
    <text
      v-for="(a, i) in axes"
      :key="'label' + i"
      :x="cx + (radius + 22) * Math.cos(angle(i))"
      :y="cy + (radius + 22) * Math.sin(angle(i))"
      class="radar-label"
      text-anchor="middle"
      dominant-baseline="middle"
    >{{ a }}</text>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // [胜率, 头游力, 稳健度, 升级速度],均为 0..1
  values: { type: Array, default: () => [0, 0, 0, 0] },
  size: { type: Number, default: 240 },
})

const axes = ['胜率', '头游', '稳健', '升级']
const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - 42)

// 第 i 个维度的角度(从正上方开始顺时针)
function angle(i) {
  return -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
}
function ringPoints(frac) {
  return axes.map((_, i) => {
    const x = cx.value + radius.value * frac * Math.cos(angle(i))
    const y = cy.value + radius.value * frac * Math.sin(angle(i))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
const dataPoints = computed(() => axes.map((_, i) => {
  const v = Math.max(0, Math.min(1, props.values[i] || 0))
  const x = cx.value + radius.value * v * Math.cos(angle(i))
  const y = cy.value + radius.value * v * Math.sin(angle(i))
  return `${x.toFixed(1)},${y.toFixed(1)}`
}).join(' '))
</script>

<style scoped>
.radar { width: 100%; max-width: 260px; height: auto; display: block; margin: 0 auto; }
.radar-ring {
  fill: rgba(31, 122, 85, 0.06);
  stroke: rgba(255, 255, 255, 0.14);
  stroke-width: 1;
}
.radar-axis { stroke: rgba(255, 255, 255, 0.12); stroke-width: 1; }
.radar-data {
  fill: rgba(255, 215, 0, 0.22);
  stroke: var(--gold-bright);
  stroke-width: 2;
  stroke-linejoin: round;
}
.radar-dot { fill: var(--gold-bright); stroke: rgba(0, 0, 0, 0.3); stroke-width: 1; }
.radar-label {
  fill: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}
</style>
