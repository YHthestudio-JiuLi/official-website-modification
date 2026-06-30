/**
 * 前台用户会话失效时的跳转（与 adminSessionRedirect 分离）
 */
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { resetAllCsrfState } from '@/services/csrfResetRegistry'

const USER_AUTH_PATHS = [
  '/api/v2/auth/me',
  '/api/v2/auth/logout',
]

const USER_PROTECTED_PREFIXES = [
  '/api/v2/orders',
  '/api/v2/forum/',
  '/api/v2/cart',
]

let redirectInFlight = null

export function isUserSessionApi(url) {
  const path = String(url || '').split('?')[0]
  if (USER_AUTH_PATHS.some((p) => path === p || path.endsWith(p))) {
    return true
  }
  return USER_PROTECTED_PREFIXES.some((p) => path.startsWith(p))
}

export async function redirectToUserLogin(redirectPath) {
  if (redirectInFlight) {
    return redirectInFlight
  }

  redirectInFlight = (async () => {
    const authStore = useAuthStore()
    authStore.$patch({ user: null, checked: true })
    resetAllCsrfState()

    const route = router.currentRoute.value
    if (route.name === 'login') return

    const query = {}
    const redirect = redirectPath || (route.meta?.requiresAuth ? route.fullPath : null)
    if (redirect) {
      query.redirect = redirect
    }
    await router.push({ name: 'login', query })
  })()

  try {
    await redirectInFlight
  } finally {
    redirectInFlight = null
  }
}

export function handleUserSessionUnauthorized(url) {
  if (!isUserSessionApi(url)) return
  const path = String(url || '').split('?')[0]
  // /me 401 由 checkAuth 静默处理
  if (path.endsWith('/auth/me')) return
  redirectToUserLogin().catch(() => {})
}
