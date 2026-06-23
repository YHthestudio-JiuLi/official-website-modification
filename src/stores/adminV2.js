import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/services/v2/admin/auth'
import { resetV2Csrf } from '@/services/v2/http'

export const useAdminV2Store = defineStore('adminV2', () => {
  const user = ref(null)
  const permissions = ref([])
  const menus = ref([])
  const checked = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const username = computed(() => user.value?.username || '')

  function hasPermission(name) {
    if (!name) return true
    if (permissions.value.includes('*')) return true
    return permissions.value.includes(name)
  }

  async function checkAuth() {
    try {
      const { data } = await authApi.fetchMe()
      user.value = data.user
      permissions.value = data.permissions || []
      await loadMenus()
    } catch {
      user.value = null
      permissions.value = []
      menus.value = []
    } finally {
      checked.value = true
    }
  }

  async function loadMenus() {
    try {
      const { data } = await authApi.fetchMenus()
      menus.value = data
    } catch {
      menus.value = []
    }
  }

  async function login(credentials) {
    const { data } = await authApi.adminLogin(credentials)
    user.value = data.user
    permissions.value = data.permissions || []
    checked.value = true
    await loadMenus()
    return data
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      user.value = null
      permissions.value = []
      menus.value = []
      resetV2Csrf()
    }
  }

  /** 与旧后台登录并行：旧 API 成功后静默建立 V2 会话 */
  async function syncLogin(credentials) {
    try {
      await login(credentials)
    } catch (e) {
      console.warn('[adminV2] sync login failed:', e?.response?.data || e.message)
      checked.value = true
    }
  }

  return {
    user,
    permissions,
    menus,
    checked,
    isLoggedIn,
    username,
    hasPermission,
    checkAuth,
    login,
    logout,
    syncLogin,
    loadMenus
  }
})
