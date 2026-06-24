import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'

export const useAdminStore = defineStore('admin', () => {
  const admin = ref(null)
  const checked = ref(false)

  const isLoggedIn = computed(() => !!admin.value)
  const username = computed(() => admin.value?.username || '')

  async function checkAuth() {
    // V2 模式走 Laravel 会话，Node /api/admin/auth/me 仅用于 legacy 模块
    if (useV2Api()) {
      checked.value = true
      return
    }
    try {
      const response = await api.get('/api/admin/auth/me')
      admin.value = response.data.admin
    } catch {
      admin.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(credentials) {
    if (useV2Api()) {
      const { useAdminV2Store } = await import('@/stores/adminV2')
      return useAdminV2Store().login(credentials)
    }
    const response = await api.post('/api/admin/auth/login', credentials)
    admin.value = response.data.admin
    return response.data
  }

  async function logout() {
    if (useV2Api()) {
      admin.value = null
      return
    }
    try {
      await api.post('/api/admin/auth/logout')
    } finally {
      admin.value = null
    }
  }

  return {
    admin,
    checked,
    isLoggedIn,
    username,
    checkAuth,
    login,
    logout
  }
})