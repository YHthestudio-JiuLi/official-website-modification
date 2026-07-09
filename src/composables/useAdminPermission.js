import { computed } from 'vue'
import { useAdminV2Store } from '@/stores/adminV2'

/**
 * 后台 V2 权限（响应式，须在路由守卫完成 checkAuth 后使用）
 */
export function useAdminPermissions() {
  const store = useAdminV2Store()

  const authReady = computed(() => store.checked)

  function can(permission) {
    return computed(() => authReady.value && store.hasPermission(permission))
  }

  function canAny(permissions = []) {
    return computed(() => {
      if (!authReady.value) return false
      return permissions.some((p) => store.hasPermission(p))
    })
  }

  function has(permission) {
    return store.hasPermission(permission)
  }

  const isScopedAgent = computed(() => {
    if (!authReady.value || !store.user) return false
    if (typeof store.user.is_scoped_agent === 'boolean') {
      return store.user.is_scoped_agent
    }
    // 兼容未携带 is_scoped_agent 的旧会话载荷
    const roles = store.user.roles || []
    if (roles.includes('super_admin') || store.user.isAdmin) return false
    return roles.includes('agent')
  })

  const isSuperAdmin = computed(() => {
    if (!authReady.value || !store.user) return false
    const roles = store.user.roles || []
    return roles.includes('super_admin') || !!store.user.isAdmin
  })

  return {
    store,
    authReady,
    can,
    canAny,
    has,
    isScopedAgent,
    isSuperAdmin
  }
}
