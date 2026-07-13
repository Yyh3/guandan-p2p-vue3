<template>
  <router-view />
  <ToastOverlay />
  <ConfirmDialog />
</template>

<script setup>
import ToastOverlay from '@/components/ToastOverlay.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
</script>

<style>
/* 全局样式,scoped 在子组件里 */
</style>
