/** 设备验证管理页：服务端时间解析与格式化 */
export function parseServerDate(dateStr) {
  if (typeof dateStr !== 'string') return null
  const raw = dateStr.trim()
  if (!raw) return null

  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)
  const isoLike = raw.replace(' ', 'T')
  const normalized = hasTimezone ? isoLike : `${isoLike}Z`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDeviceDate(dateStr, locale) {
  const parsed = parseServerDate(dateStr)
  if (!parsed) return dateStr || '-'
  const fmtLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  return parsed.toLocaleDateString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatDeviceDateTime(dateStr, locale) {
  const parsed = parseServerDate(dateStr)
  if (!parsed) return dateStr || '-'
  const fmtLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  return parsed.toLocaleString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function truncateUserAgent(ua) {
  if (!ua) return '-'
  if (ua.length <= 50) return ua
  return `${ua.substring(0, 50)}...`
}
