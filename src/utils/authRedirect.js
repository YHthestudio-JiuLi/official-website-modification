import { isSafeInternalRedirect } from '@/utils/productCheckout'

export { isSafeInternalRedirect }

/** 登录/注册页本身不作为回跳目标 */
function isAuthEntryPath(path) {
  if (!path || path === '/') return true
  return path === '/login' || path === '/register' || path.startsWith('/login?') || path.startsWith('/register?')
}

/**
 * 从当前路由解析登录后应回跳的站内路径（优先 query.redirect，否则为当前页）
 */
export function resolveRedirectFromRoute(route) {
  const fromQuery = route.query.redirect
  if (typeof fromQuery === 'string' && isSafeInternalRedirect(fromQuery)) {
    return fromQuery
  }
  const path = route.fullPath
  if (isAuthEntryPath(path)) return null
  return isSafeInternalRedirect(path) ? path : null
}

export function buildLoginRoute(redirect) {
  if (redirect && isSafeInternalRedirect(redirect)) {
    return { name: 'login', query: { redirect } }
  }
  return { name: 'login' }
}

export function buildRegisterRoute(redirect) {
  if (redirect && isSafeInternalRedirect(redirect)) {
    return { name: 'register', query: { redirect } }
  }
  return { name: 'register' }
}

/** 登录成功后的跳转（含客服页自动开聊） */
export async function navigateAfterAuth(router, redirect) {
  if (typeof redirect === 'string' && isSafeInternalRedirect(redirect)) {
    if (redirect === '/chat' || redirect.startsWith('/chat?')) {
      sessionStorage.setItem('chat_auto_start', '1')
    }
    await router.push(redirect)
    return
  }
  await router.push('/')
}
