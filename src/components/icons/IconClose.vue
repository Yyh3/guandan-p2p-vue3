<template>
  <IconBase name="close" :size="size">
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
