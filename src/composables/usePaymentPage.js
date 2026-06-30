import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  fetchCheckoutPreview,
  createOrder,
  fetchOrder,
  confirmOrder,
  V2CheckoutRequiredError,
} from '@/services/orders'
import { resolveOrderSubmitError } from '@/utils/orderSubmitError'

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function buildCheckoutPreviewParams(query) {
  const productId = parsePositiveInt(query.productId)
  if (!productId) {
    throw new Error('productId missing')
  }
  const params = {
    productId,
    quantity: parsePositiveInt(query.quantity) || 1,
  }
  const configId = String(query.configId || '').trim()
  if (configId) {
    params.configId = configId
  }
  return params
}

async function loadCheckoutPreview(route) {
  const params = buildCheckoutPreviewParams(route.query)
  const response = await fetchCheckoutPreview(params)
  return response.data
}

async function loadLegacyOrder(route) {
  const response = await fetchOrder(route.params.id)
  return response.data
}

async function submitCheckoutOrder({ order, txHash, shippingAddress, router }) {
  const payload = {
    productId: Number(order.productId),
    quantity: Number(order.quantity || 1),
    txHash,
    shippingAddress,
  }
  if (order.configId) {
    payload.configId = String(order.configId)
  }
  const createRes = await createOrder(payload)
  const createdOrderId = Number(createRes.data?.orderId)
  const created = createRes.data?.order
  const orderId = Number.isFinite(createdOrderId) && createdOrderId > 0
    ? createdOrderId
    : Number(created?.id)

  if (Number.isFinite(orderId) && orderId > 0) {
    await router.replace({ name: 'payment', params: { id: String(orderId) } })
    if (created) return created
    const response = await fetchOrder(orderId)
    return response.data
  }

  return created || order
}

async function submitLegacyOrder({ orderId, txHash, shippingAddress }) {
  await confirmOrder(orderId, { txHash, shippingAddress })
  const response = await fetchOrder(orderId).catch((err) => {
    console.error('Failed to refresh order:', err)
    return null
  })
  return response?.data || null
}

/** 支付页：checkout 预览下单 或 legacy 确认 pending 订单 */
export function usePaymentPage() {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()

  const paymentMode = computed(() => route.meta.paymentMode || 'legacy')
  const isCheckout = computed(() => paymentMode.value === 'checkout')

  const order = ref(null)
  const loading = ref(true)
  const loadError = ref(false)
  const loadErrorMessage = ref('')
  const notFound = ref(false)
  const submitting = ref(false)

  async function load() {
    loading.value = true
    loadError.value = false
    loadErrorMessage.value = ''
    notFound.value = false
    try {
      order.value = isCheckout.value
        ? await loadCheckoutPreview(route)
        : await loadLegacyOrder(route)
    } catch (error) {
      console.error('Failed to load payment page:', error)
      if (error instanceof V2CheckoutRequiredError) {
        loadErrorMessage.value = t('products.detail.checkoutV2Required')
        loadError.value = true
        return
      }
      const status = error?.response?.status
      if (!isCheckout.value && status === 401) {
        return
      }
      if (!isCheckout.value && status === 404) {
        notFound.value = true
      } else {
        loadError.value = true
      }
    } finally {
      loading.value = false
    }
  }

  async function submit({ shippingAddress, txHash }) {
    submitting.value = true
    try {
      if (isCheckout.value) {
        order.value = await submitCheckoutOrder({
          order: order.value,
          txHash,
          shippingAddress,
          router,
        })
        return { ok: true }
      }

      const refreshed = await submitLegacyOrder({
        orderId: route.params.id,
        txHash,
        shippingAddress,
      })
      if (refreshed) {
        order.value = refreshed
      }
      return { ok: true }
    } catch (error) {
      console.error('Failed to submit payment:', error)
      const { message, deleted } = resolveOrderSubmitError(error, t)
      if (!isCheckout.value && deleted) {
        await router.push('/orders')
      }
      return { ok: false, message, deleted, error }
    } finally {
      submitting.value = false
    }
  }

  return {
    order,
    loading,
    loadError,
    loadErrorMessage,
    notFound,
    submitting,
    isCheckout,
    load,
    submit,
  }
}
