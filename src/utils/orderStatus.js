/** 订单履约状态（待支付 / 已支付 / 已发货 / 已签收） */
export const ORDER_STATUS_KEYS = ['pending', 'paid', 'shipped', 'delivered']

/** 将历史 completed 映射为 delivered */
export function normalizeOrderStatus(status) {
  if (status === 'completed') return 'delivered'
  return status
}

export const STATUS_RANK = {
  pending: 0,
  paid: 1,
  shipped: 2,
  delivered: 3,
  completed: 3,
}

export function isOrderStepDone(currentStatus, stepKey) {
  const normalized = normalizeOrderStatus(currentStatus)
  return (STATUS_RANK[normalized] ?? 0) >= (STATUS_RANK[stepKey] ?? 0)
}

/** 是否已进入履约阶段（已支付及之后） */
export function isFulfilled(status) {
  const normalized = normalizeOrderStatus(status)
  return STATUS_RANK[normalized] >= STATUS_RANK.paid
}

/** 是否展示「已签收」类成功页（已发货 / 已签收） */
export function isPostShipment(status) {
  const normalized = normalizeOrderStatus(status)
  return normalized === 'shipped' || normalized === 'delivered'
}

export function getOrderStatusLabel(status, t) {
  const normalized = normalizeOrderStatus(status)
  return t(`orders.status.${normalized}`, normalized)
}

export function getAdminOrderStatusLabel(status, t) {
  const normalized = normalizeOrderStatus(status)
  if (ORDER_STATUS_KEYS.includes(normalized)) {
    return t(`admin.orders.filter.${normalized}`)
  }
  return normalized
}
