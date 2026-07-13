<template>
  <IconBase name="chevron-down" :size="size">
    <path d="M6 9l6 6 6-6" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
