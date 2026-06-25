import { logoutNodeAdmin } from '@/services/legacyNodeAuth'
import { finalizeAdminLogout } from '@/utils/adminLogout'
import { LEGACY_NODE_BRIDGE_TOKEN_KEY } from '@/constants/legacyNodeBridge'

/** 避免 logout 请求 401 再次触发跳转 */
let suppress401Redirect = false
/** 并发 401 只跳转一次 */
let redirectInFlight = null

const AUTH_EXEMPT_PATHS = [
  '/api/v2/auth/admin/login',
  '/api/v2/auth/admin/logout',
  '/api/admin/auth/login',
  '/api/admin/auth/logout',
  '/api/admin/auth/establish',
]

/** 上传分片 401 应展示错误，勿整页踢出登录 */
const UPLOAD_NO_REDIRECT_PREFIXES = [
  '/api/admin/questions/upload',
  '/api/admin/device-firmwares/upload',
]

/**
 * 是否为后台受保护 API（401 时应退出到登录页）
 */
export function isAdminSessionApi(url) {
  const path = String(url || '').split('?')[0]
  if (AUTH_EXEMPT_PATHS.some((p) => path === p || path.endsWith(p))) {
    return false
  }
  if (UPLOAD_NO_REDIRECT_PREFIXES.some((p) => path.startsWith(p))) {
    return false
  }
  return (
    path.includes('/api/v2/auth/admin/')
    || path.includes('/api/v2/admin/')
    || path.includes('/api/admin/')
  )
}

export function isAdminSessionRedirectActive() {
  return suppress401Redirect || redirectInFlight !== null
}

/**
 * 后台会话失效：清本地状态并跳转登录页（保留当前页路径供登录后回跳）
 * @param {{ skipServerLogout?: boolean }} options - 401 时会话已失效，跳过服务端 logout 避免长时间挂起
 */
export async function redirectToAdminLogin(options = {}) {
  const { skipServerLogout = false } = options
  if (suppress401Redirect) return
  if (redirectInFlight) return redirectInFlight

  redirectInFlight = (async () => {
    const { default: router } = await import('@/router')
    const { useAdminStore } = await import('@/stores/admin')
    const { useAdminV2Store } = await import('@/stores/adminV2')

    const route = router.currentRoute.value
    if (route.name === 'admin-login') return

    const adminStore = useAdminStore()
    const adminV2Store = useAdminV2Store()

    if (skipServerLogout) {
      sessionStorage.removeItem(LEGACY_NODE_BRIDGE_TOKEN_KEY)
      const [{ resetApiCsrf }, { resetV2Csrf }] = await Promise.all([
        import('@/services/api'),
        import('@/services/v2/http')
      ])
      resetApiCsrf()
      resetV2Csrf()
    } else {
      await logoutNodeAdmin().catch(() => {})

      suppress401Redirect = true
      try {
        await finalizeAdminLogout(adminStore, adminV2Store)
      } finally {
        suppress401Redirect = false
      }
    }

    adminStore.$patch({ admin: null, checked: true })
    adminV2Store.$patch({ user: null, permissions: [], menus: [], checked: true })

    const query = { reauth: '1' }
    if (route.meta?.requiresAdmin && route.fullPath) {
      query.redirect = route.fullPath
    }

    await router.replace({ name: 'admin-login', query })
  })()

  try {
    await redirectInFlight
  } finally {
    redirectInFlight = null
  }
}

/** axios 401 拦截器入口 */
export function handleAdminSessionUnauthorized(url) {
  if (isAdminSessionRedirectActive() || !isAdminSessionApi(url)) return

  const path = String(url || '').split('?')[0]
  // /me 401 由 checkAuth 处理，避免登录页加载时误触发 legacy logout
  if (path.includes('/auth/admin/me')) return

  redirectToAdminLogin({ skipServerLogout: true }).catch(() => {})
}
