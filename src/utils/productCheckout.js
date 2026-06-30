import { useAuthStore } from '@/stores/auth'
import i18n from '@/i18n'
import { useV2Api } from '@/utils/apiPath'
import { isSafeInternalRedirect } from '@/utils/internalRedirect'

/**
 * 立即购买：已登录则进入支付页填写收货信息+TxHash 后验单并创建订单；
 * 未登录则跳转登录，登录后由商品页 ?checkout=1 自动跳转支付页
 * @param {import('vue-router').Router} router
 * @param {string|number} productId
 * @param {{ configId?: string|null }} [options]
 */
export async function startProductCheckout(router, productId, options = {}) {
  const authStore = useAuthStore()
  const id = parseInt(String(productId), 10)
  if (!Number.isFinite(id)) return

  const checkoutQuery = { checkout: '1' }
  if (options.configId) {
    checkoutQuery.configId = String(options.configId)
  }

  if (!authStore.isLoggedIn) {
    const { fullPath } = router.resolve({
      name: 'product-detail',
      params: { id: String(id) },
      query: checkoutQuery
    })
    await router.push({
      name: 'login',
      query: { redirect: fullPath }
    })
    return
  }

  if (!useV2Api()) {
    alert(i18n.global.t('products.detail.checkoutV2Required'))
    return
  }

  const paymentQuery = { productId: String(id), quantity: '1' }
  if (options.configId) {
    paymentQuery.configId = String(options.configId)
  }
  await router.push({
    name: 'checkout-pay',
    query: paymentQuery,
  })
}

export { isSafeInternalRedirect }
