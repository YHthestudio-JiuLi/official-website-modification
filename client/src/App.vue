<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useAdminStore } from '@/stores/admin'

const authStore = useAuthStore()
const adminStore = useAdminStore()

onMounted(async () => {
  await authStore.checkAuth()
  await adminStore.checkAuth()
})
</script>

<style>
/* Global styles are imported in main.js */
</style>