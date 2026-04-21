import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const checked = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const username = computed(() => user.value?.username || '')

  async function checkAuth() {
    try {
      const response = await api.get('/api/auth/me')
      user.value = response.data.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(credentials) {
    const response = await api.post('/api/auth/login', credentials)
    user.value = response.data.user
    return response.data
  }

  async function register(userData) {
    const response = await api.post('/api/auth/register', userData)
    user.value = response.data.user
    return response.data
  }

  async function logout() {
    await api.post('/api/auth/logout')
    user.value = null
  }

  return {
    user,
    checked,
    isLoggedIn,
    username,
    checkAuth,
    login,
    register,
    logout
  }
})