function parseProductConfigsJson(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 与 src/utils/productConfig.js normalizeProductConfigs 字段对齐 */
function normalizeProductConfigs(raw) {
  return parseProductConfigsJson(raw)
    .map((c) => ({
      id: String(c.id || '').trim(),
      name: String(c.name || '').trim(),
      priceUsdt: Number(c.priceUsdt ?? c.price ?? 0),
    }))
    .filter((c) => c.id && c.name)
}

function findProductConfig(configs, configId) {
  const id = String(configId || '').trim()
  if (!id) return null
  return configs.find((c) => c.id === id) || null
}

/** 下单定价：无配置用商品基础价，有配置须匹配 configId */
function resolveCheckoutConfig(product, configId) {
  const configs = normalizeProductConfigs(product.configsJson)
  if (!configs.length) {
    return {
      price: Number(product.priceUsdt || product.price || 0),
      configId: null,
      configName: null,
    }
  }
  const selected = findProductConfig(configs, configId)
  if (!selected) {
    return { error: 'Configuration required' }
  }
  return {
    price: selected.priceUsdt,
    configId: selected.id,
    configName: selected.name,
  }
}

module.exports = {
  parseProductConfigsJson,
  normalizeProductConfigs,
  findProductConfig,
  resolveCheckoutConfig,
}
