<template>
  <AdminLayout>
    <template #header-title>{{ headerTitle }}</template>
    <router-view v-slot="{ Component }">
      <component :is="Component" :key="route.fullPath" />
    </router-view>
  </AdminLayout>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const route = useRoute()
const { t } = useI18n()

const headerTitle = computed(() => {
  if (route.name === 'admin-user-form') {
    return route.params.id ? t('admin.users.editUser') : t('admin.users.addUser')
  }
  const key = route.meta?.titleKey
  return key ? t(key) : t('admin.title')
})
</script>
