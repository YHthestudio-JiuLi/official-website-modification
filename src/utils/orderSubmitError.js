export function resolveOrderSubmitError(error, t) {
  const data = error?.response?.data || {}
  if (data.deleted) {
    return {
      deleted: true,
      message: data.message || t('payment.orderDeleted'),
    }
  }
  const message =
    data.message ||
    data.errors?.txHash?.[0] ||
    data.errors?.shippingAddress?.[0] ||
    t('payment.submitFailed')

  return { deleted: false, message }
}
