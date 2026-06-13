<template>
  <component
    :is="isMobile ? GameViewMobile : GameViewDesktop"
    :self-seat="selfSeat"
    :ghost-rank="ghostRank"
    :is-p2-p-mode="isP2PMode"
  />
</template>

<script setup>
/**
 * GameView.vue — v2.4 task 2 router 入口
 *
 * 职责:
 *   1. viewport 检测(<=768px → mobile,>768px → desktop)
 *   2. 路由 query 解析(selfSeat / ghostRank / isP2PMode / remoteHost / role)
 *   3. 选 GameViewDesktop 或 GameViewMobile 二选一渲染
 *
 * 所有业务逻辑(出牌 / 跟牌 / 计时器 / 发牌 / P2P 同步 / host 迁移 / AI 接管)
 * 都在 useGameLogic.js composable + GameViewDesktop.vue 模板里,本文件**不**持有任何
 * 业务状态,纯路由调度。
 *
 * P2P / join 逻辑(原 GameView 的 onMounted 块)由子组件 useGameLogic 在初始化时处理。
 * 本文件 onMounted 只挂 matchMedia 监听。
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

import GameViewDesktop from './GameViewDesktop.vue'
import GameViewMobile from './GameViewMobile.vue'

const route = useRoute()

// ===== 1. viewport 检测 =====
// t2 期间 isMobile 临时 hardcode false,留待 t3 写完 mobile 布局后启用。
// 避免 t2 / t3 之间被 matchMedia 误触发导致布局闪烁。
const isMobile = ref(false)
let mq = null
const handleChange = (e) => {
  // t2 锁定: t3 完成前无视 matchMedia 变化
  if (handleChange._locked) return
  isMobile.value = e.matches
}
handleChange._locked = true  // 标记锁定,t3 完成后清掉

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(max-width: 768px)')
    isMobile.value = false  // t2 hardcode; t3 时改为 mq.matches
    mq.addEventListener('change', handleChange)
  }
})
onUnmounted(() => {
  if (mq) mq.removeEventListener('change', handleChange)
})

// ===== 2. 路由 query 解析 =====
const selfSeat = computed(() => {
  const v = route.query.selfSeat
  if (v === undefined || v === null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
})
const ghostRank = computed(() => {
  const v = route.query.ghostRank
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
})
const isP2PMode = computed(() => {
  // ?role=joiner 或 ?host=... 都视为 P2P 联机
  return route.query.role === 'joiner' || !!route.query.host
})
const remoteHost = computed(() => String(route.query.host || ''))
const role = computed(() => String(route.query.role || ''))
</script>
