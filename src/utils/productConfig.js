/**
 * 商品可选配置（与 server/lib/productConfig.js、ProductNormalizer 字段对齐）
 */

export function normalizeProductConfigs(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => ({
      id: String(c.id || '').trim(),
      name: String(c.name || '').trim(),
      priceUsdt: Number(c.priceUsdt ?? c.price ?? 0),
    }))
    .filter((c) => c.id && c.name)
}

export function findProductConfig(configs, configId) {
  const id = String(configId || '').trim()
  if (!id) return null
  return configs.find((c) => c.id === id) || null
}

export function formatConfigPriceUsdt(cfg, tbdLabel) {
  const n = Number(cfg?.priceUsdt)
  if (Number.isFinite(n) && n > 0) return `${n} USDT`
  return tbdLabel
}
