<template>
  <th v-if="showColumn">{{ $t('admin.common.colCreatedBy') }}</th>
</template>

<script setup>
defineProps({
  showColumn: { type: Boolean, default: true },
})
</script>
