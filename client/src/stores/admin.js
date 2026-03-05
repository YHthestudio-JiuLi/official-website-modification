import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useAdminStore = defineStore('admin', () => {
  const admin = ref(null)
  const checked = ref(false)

  const isLoggedIn = computed(() => !!admin.value)
  const username = computed(() => admin.value?.username || '')

  async function checkAuth() {
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
    const response = await api.post('/api/admin/auth/login', credentials)
    admin.value = response.data.admin
    return response.data
  }

  async function logout() {
    await api.post('/api/admin/auth/logout')
    admin.value = null
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