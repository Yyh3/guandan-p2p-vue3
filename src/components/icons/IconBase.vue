<template>
  <svg
    class="icon-svg"
    :class="`icon-${name}`"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <slot />
  </svg>
</template>

<script setup>
/**
 * IconBase — SVG 图标基础包装
 * @param {string} name - 图标类名后缀
 * @param {number|string} size - 宽高(默认 20)
 */
defineProps({
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 20 },
})
</script>

<style scoped>
.icon-svg {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
