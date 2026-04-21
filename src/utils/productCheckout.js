import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'

/**
 * 校验登录回跳路径，避免开放重定向（仅允许站内 hash 或相对路径）
 */
function isSafeInternalRedirect(path) {
  if (typeof path !== 'string' || !path.length || path === '/') return false
  if (path.startsWith('//')) return false
  if (path.startsWith('#/')) return true
  if (path.startsWith('/#')) return true
  // 部分环境下 fullPath 为 /products/1?checkout=1（仍属本站路由）
  if (path.startsWith('/') && !path.startsWith('//')) return true
  return false
}

/**
 * 立即购买：已登录则创建订单并跳转支付；未登录则跳转登录，登录后由商品页 ?checkout=1 自动下单
 * @param {import('vue-router').Router} router
 * @param {string|number} productId
 */
export async function startProductCheckout(router, productId) {
  const authStore = useAuthStore()
  const id = parseInt(String(productId), 10)
  if (!Number.isFinite(id)) return

  if (!authStore.isLoggedIn) {
    const { fullPath } = router.resolve({
      name: 'product-detail',
      params: { id: String(id) },
      query: { checkout: '1' }
    })
    await router.push({
      name: 'login',
      query: { redirect: fullPath }
    })
    return
  }

  const res = await api.post('/api/orders', { productId: id, quantity: 1 })
  await router.push({
    name: 'payment',
    params: { id: String(res.data.orderId) }
  })
}

export { isSafeInternalRedirect }
