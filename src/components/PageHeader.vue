<template>
  <!--
    ★ v0.4.29 精简:页头共享组件(左上返回按钮 + 居中标题 + 副标题)。
    AIView / HistoryView / GuideView 复用,取代各自重复的 back-btn-top + title + subtitle 三件套与样式。
    需挂在 position:relative 的 .page 内(返回按钮 absolute 定位相对 .page)。
  -->
  <button class="back-btn-top" aria-label="返回" @click="router.back()">← 返回</button>
  <h1 class="title">{{ title }}</h1>
  <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
</script>

<style scoped>
.back-btn-top {
  position: absolute; top: 18px; left: 18px; z-index: 2;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.back-btn-top:hover { background: rgba(255,255,255,0.18); }
.title { position: relative; z-index: 1; font-size: 28px; font-weight: 900; color: #fff; text-align: center; text-shadow: 0 3px 12px rgba(0,0,0,0.35); }
.subtitle { position: relative; z-index: 1; font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 6px; }
</style>
