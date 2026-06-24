import v2 from './http'

export function fetchPaymentSettings() {
  return v2.get('/payment-settings')
}
