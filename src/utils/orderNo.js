/** 展示用订单号：优先 orderNo，旧数据回退 numeric id */
export function displayOrderNo(order) {
  if (!order) return ''
  const no = order.orderNo ?? order.order_no
  if (no) return String(no)
  return order.id != null ? String(order.id) : ''
}
