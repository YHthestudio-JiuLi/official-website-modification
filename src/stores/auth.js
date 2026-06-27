import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { resetApiCsrf } from '@/services/api'
import * as authV2 from '@/services/v2/auth'
import { useV2Api } from '@/utils/apiPath'

const USE_V2 = useV2Api()

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const checked = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const username = computed(() => user.value?.username || '')

  async function checkAuth() {
    try {
      const response = USE_V2
        ? await authV2.fetchMe()
        : await api.get('/api/auth/me')
      user.value = response.data.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(credentials) {
    const response = USE_V2
      ? await authV2.login(credentials)
      : await api.post('/api/auth/login', credentials)
    user.value = response.data.user
    return response.data
  }

  async function register(userData) {
    const response = USE_V2
      ? await authV2.register(userData)
      : await api.post('/api/auth/register', userData)
    user.value = response.data.user
    return response.data
  }

  async function logout() {
    try {
      if (USE_V2) {
        await authV2.logout()
      } else {
        await api.post('/api/auth/logout')
      }
    } finally {
      user.value = null
      resetApiCsrf()
    }
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