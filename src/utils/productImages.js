export const PRODUCT_IMAGE_ROTATION_MS = 5000

/** Legacy Node 商品图路径 → V2 路径（V2 接口已规范化时可原样透传） */
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
