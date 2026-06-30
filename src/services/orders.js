import api from '@/services/api'
import * as ordersV2 from '@/services/v2/orders'
import { useV2Api } from '@/utils/apiPath'

const USE_V2 = useV2Api()

/** 新结账预览与验单创建仅 V2 实现 */
export class V2CheckoutRequiredError extends Error {
  constructor() {
    super('Checkout requires V2 API')
    this.name = 'V2CheckoutRequiredError'
  }
}

export function assertV2Checkout() {
  if (!USE_V2) {
    throw new V2CheckoutRequiredError()
  }
}

export function fetchCheckoutPreview(params) {
  assertV2Checkout()
  return ordersV2.fetchCheckoutPreview(params)
}

export function createOrder(payload) {
  assertV2Checkout()
  return ordersV2.createOrder(payload)
}

export function fetchOrder(id) {
  if (USE_V2) {
    return ordersV2.fetchOrder(id)
  }
  return api.get(`/api/orders/${id}`)
}

export function confirmOrder(id, payload) {
  if (USE_V2) {
    return ordersV2.confirmOrder(id, payload)
  }
  return api.post(`/api/orders/${id}/confirm`, payload)
}
