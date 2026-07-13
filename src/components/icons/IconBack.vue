<template>
  <IconBase name="back" :size="size">
    <path d="M15 18l-6-6 6-6" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
