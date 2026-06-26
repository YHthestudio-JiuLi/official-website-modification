<template>
  <div class="no-permission-card">
    <i class="fas fa-lock"></i>
    <p>{{ $t(messageKey) }}</p>
  </div>
</template>

<script setup>
defineProps({
  messageKey: {
    type: String,
    default: 'admin.common.noPermission',
  },
})
</script>

<style scoped>
.no-permission-card {
  text-align: center;
  padding: 4rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-secondary);
}

.no-permission-card i {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: var(--text-secondary);
  opacity: 0.6;
  display: block;
}
</style>
