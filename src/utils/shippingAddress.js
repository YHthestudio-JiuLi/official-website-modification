/**
 * 解析订单收货地址字符串（支持 Name/Phone/Address 或中文键名）
 */
export function parseShippingAddress(shippingAddress) {
  const raw = String(shippingAddress || '').trim()
  if (!raw) return null

  const out = { name: '', phone: '', address: '', raw }
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean)
  let parsed = false

  for (const part of parts) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (!val) continue

    if (key === 'name' || key === '收件人' || key === '姓名') {
      out.name = val
      parsed = true
    } else if (key === 'phone' || key === '电话' || key === '手机号') {
      out.phone = val
      parsed = true
    } else if (key === 'address' || key === '地址') {
      out.address = val
      parsed = true
    }
  }

  if (!parsed) {
    out.address = raw
  }

  return out
}
