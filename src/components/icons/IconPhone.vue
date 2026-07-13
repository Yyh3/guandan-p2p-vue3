<template>
  <IconBase name="phone" :size="size">
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M12 18h.01" stroke-width="2.5" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
