<template>
  <IconBase name="ban" :size="size">
    <circle cx="12" cy="12" r="9" />
    <path d="M5.64 5.64l12.72 12.72" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
