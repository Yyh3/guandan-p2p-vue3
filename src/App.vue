<template>
  <router-view />
  <ToastOverlay />
  <ConfirmDialog />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import ToastOverlay from '@/components/ToastOverlay.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import storage from '@/common/storage.js'

// ★ v0.4.28 P1-3:牌桌主题 — 启动时挂载 class 到 <html>,并监听设置页切换
const THEME_IDS = ['classic', 'ocean', 'lacquer', 'porcelain']
function applyTableTheme(theme) {
  const id = THEME_IDS.includes(theme) ? theme : 'classic'
  const el = document.documentElement
  for (const t of THEME_IDS) el.classList.remove('theme-' + t)
  el.classList.add('theme-' + id)
}
function onThemeChange(e) { applyTableTheme(e && e.detail ? e.detail.theme : null) }
onMounted(() => {
  applyTableTheme(storage.getSettings().tableTheme)
  window.addEventListener('guandan:theme-change', onThemeChange)
})
onUnmounted(() => window.removeEventListener('guandan:theme-change', onThemeChange))
</script>

<style>
/* 全局样式,scoped 在子组件里 */
</style>
