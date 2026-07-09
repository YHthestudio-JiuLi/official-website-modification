<template>
  <td v-if="showCell">
    <span v-if="username" class="category-badge">{{ username }}</span>
    <span v-else class="empty-cell">{{ $t('admin.common.createdByUnknown') }}</span>
  </td>
</template>

<script setup>
defineProps({
  showCell: { type: Boolean, default: true },
  username: { type: String, default: null },
})
</script>

<style scoped>
.category-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.12);
  color: var(--primary-color);
  font-size: 0.82rem;
}

.empty-cell {
  color: var(--text-secondary);
  opacity: 0.5;
}
</style>
