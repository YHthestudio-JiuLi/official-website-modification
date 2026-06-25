<template>
  <div v-if="isRouterPending" class="route-loading" role="status" aria-live="polite">
    <div class="route-loading-card">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{{ $t('common.loading') }}</span>
    </div>
  </div>
  <router-view />
</template>

<script setup>
import { isRouterPending } from '@/router'
</script>

<style>
.route-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 23, 0.72);
  backdrop-filter: blur(2px);
}

.route-loading-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: rgba(22, 28, 40, 0.95);
  color: #e8edf7;
  font-size: 0.95rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.route-loading-card .fa-spinner {
  font-size: 1.1rem;
  color: #4f8cff;
}
</style>
