/**
 * 解析订单收货地址字符串（支持 Name/Phone/Address 或中文键名）
 */
export function parseShippingAddress(shippingAddress) {
  const raw = String(shippingAddress || '').trim()
  if (!raw) return null

  const out = { name: '', phone: '', address: '', raw }
  const jsonParsed = tryParseAddressJson(raw)
  if (jsonParsed) {
    return { ...out, ...jsonParsed }
  }

  const parts = raw
    .split(/\||\n|；|;/)
    .map((s) => s.trim())
    .filter(Boolean)
  let parsed = false

  for (const part of parts) {
    const idx = part.search(/[:：]/)
    if (idx <= 0) continue
    const key = normalizeKey(part.slice(0, idx))
    const val = part.slice(idx + 1).trim()
    if (!val) continue

    if (isNameKey(key)) {
      out.name = val
      parsed = true
    } else if (isPhoneKey(key)) {
      out.phone = val
      parsed = true
    } else if (isAddressKey(key)) {
      out.address = val
      parsed = true
    }
  }

  if (!out.phone) {
    const phoneMatch = raw.match(/(1[3-9]\d{9})/)
    if (phoneMatch) {
      out.phone = phoneMatch[1]
    }
  }

  if (!parsed) {
    out.address = raw
  }

  return out
}

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function isNameKey(key) {
  return ['name', 'receiver', 'recipient', '收件人', '收货人', '姓名', '联系人'].includes(key)
}

function isPhoneKey(key) {
  return ['phone', 'mobile', 'tel', '电话', '手机号', '联系电话', '电话号码', '收件人电话'].includes(key)
}

function isAddressKey(key) {
  return ['address', 'addr', '地址', '收货地址', '收件地址', '详细地址'].includes(key)
}

function tryParseAddressJson(raw) {
  if (!raw.startsWith('{')) return null
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null

    const name = String(
      obj.name ?? obj.recipientName ?? obj.receiver ?? obj['收件人'] ?? obj['收货人'] ?? obj['姓名'] ?? ''
    ).trim()
    const phone = String(
      obj.phone ?? obj.mobile ?? obj.recipientPhone ?? obj['电话'] ?? obj['手机号'] ?? obj['联系电话'] ?? ''
    ).trim()
    const address = String(
      obj.address ?? obj.detail ?? obj.recipientAddress ?? obj['地址'] ?? obj['收货地址'] ?? obj['收件地址'] ?? ''
    ).trim()

    if (!name && !phone && !address) return null
    return { name, phone, address, raw }
  } catch (_e) {
    return null
  }
}
