<template>
  <IconBase name="robot" :size="size">
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <circle cx="9" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <path d="M9 17h6" />
    <path d="M12 8V5" />
    <circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
