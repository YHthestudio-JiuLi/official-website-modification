/** 商品图自动轮播间隔（毫秒），约 5 秒便于看清每张图 */
export const PRODUCT_IMAGE_ROTATION_MS = 5000

/** 历史 /api/product-images/{id} → /api/v2/product-images/{id}（img 标签不走 axios 重写） */
export function normalizeProductImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  const legacy = trimmed.match(/^\/api\/product-images\/(\d+)$/)
  if (legacy) return `/api/v2/product-images/${legacy[1]}`
  return trimmed
}

export function parseProductImages(imageField, fallbackImages) {
  if (Array.isArray(fallbackImages) && fallbackImages.length) {
    return fallbackImages.filter(Boolean).map(normalizeProductImageUrl)
  }
  if (!imageField) return []
  if (Array.isArray(imageField)) {
    return imageField.filter(Boolean).map(normalizeProductImageUrl)
  }
  if (typeof imageField !== 'string') return []
  const raw = imageField.trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(normalizeProductImageUrl)
      }
    } catch (_e) {}
  }
  return [normalizeProductImageUrl(raw)]
}

export function primaryProductImage(product) {
  const images = parseProductImages(product?.image, product?.images)
  return images[0] || ''
}
