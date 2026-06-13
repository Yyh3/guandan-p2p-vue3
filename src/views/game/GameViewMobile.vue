<template>
  <div class="game-view-mobile-stub">
    mobile layout TODO (v2.4 task 3)
  </div>
</template>

<script setup>
// v2.4 task 2: stub — 真实布局留给 t3 GameViewMobile
// t2 期间 isMobile hardcode false,所以本 stub 不会被渲染
// 本组件保留 import 路径,让 GameView.vue 的 <component :is="..."> 解析不报错
</script>

<style scoped>
.game-view-mobile-stub {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  min-height: 100vh;
  color: #fff;
  background: #1a1f4a;
  font-size: 14px;
}
</style>
