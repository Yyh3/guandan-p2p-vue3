<template>
  <component
    :is="isMobile ? GameViewMobile : GameViewDesktop"
    :self-seat="selfSeat"
    :ghost-rank="ghostRank"
    :is-p2-p-mode="isP2PMode"
    :difficulty="difficulty"
    :initial-level-rank="initialLevelRank"
    :first-seat="firstSeat"
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
// v2.4 task 3 改:启用 matchMedia 切换桌面 / 移动布局。
// 轻做法(横屏自动走 desktop):
//   - 竖屏 + width ≤ 768px → mobile
//   - 横屏 + height ≤ 500px(小屏如 iPhone SE)→ mobile
//   - 其他(含手机横屏 iPad)→ desktop
// 这样手机横屏直接套用 1667 行 desktop 布局,免去"请使用竖屏"硬遮罩。
// ★ Phase3 UI 修复:isMobile 在组件挂载时只判定一次,不再监听 viewport 变化。
//   原因:游戏中反复切换横竖屏会导致 <component :is> 重新挂载 GameViewDesktop /
//   GameViewMobile,useGameLogic 生命周期重新执行,游戏状态丢失。
//   进入对局页时的设备形态即决定本次渲染用 desktop 或 mobile 布局。
function _computeIsMobile() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  const portrait = window.matchMedia('(orientation: portrait)').matches
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const shortH = window.matchMedia('(max-height: 500px)').matches
  return (portrait && narrow) || (!portrait && shortH)
}

// ★ P0-01 修复:首帧同步判定移动端,避免先挂载 desktop 再卸载换 mobile,
//   导致重复初始化 game / 重复发牌 / 旧 AI timer 残留。
const isMobile = ref(_computeIsMobile())

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
  // ?role=joiner / ?role=host / ?host=... 都视为 P2P 联机
  // ★ v0.4.16 对抗性审查 (V0414-01):加 role=host 兼容 — RoomView 现在 host 跳转也带
  //   &role=host(避免以前只有 roomNo 时 GameView 误判为非 P2P),role=host 必须识别为 P2P
  return route.query.role === 'joiner' || route.query.role === 'host' || !!route.query.host
})
const remoteHost = computed(() => String(route.query.host || ''))
const role = computed(() => String(route.query.role || ''))
// ★ v0.4.9:AI 难度参数(?difficulty=medium|hard,默认 medium)
const difficulty = computed(() => {
  const v = String(route.query.difficulty || 'medium')
  return (v === 'medium' || v === 'hard') ? v : 'medium'
})
// ★ LOGIC-01 修复:AI 页传入 ?levelRank=xxx,透传给逻辑层作为起始级牌
const initialLevelRank = computed(() => {
  const v = route.query.levelRank
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
})
// ★ Phase3 同步切牌:RoomView host 切牌后通过 URL 透传首家座位
const firstSeat = computed(() => {
  const v = route.query.firstSeat
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : undefined
})
</script>
