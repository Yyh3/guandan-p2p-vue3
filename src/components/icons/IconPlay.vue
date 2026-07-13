<template>
  <IconBase name="play" :size="size">
    <path d="M6 4l14 10-14 10z" fill="currentColor" stroke="none" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
