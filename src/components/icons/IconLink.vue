<template>
  <IconBase name="link" :size="size">
    <path d="M10 13a5 5 0 0 0 7.07.54l3.24-3.24a5 5 0 0 0-7.07-7.07L10.5 6.47" />
    <path d="M14 11a5 5 0 0 0-7.07-.54L3.69 13.69a5 5 0 0 0 7.07 7.07l2.74-2.74" />
  </IconBase>
</template>

<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
