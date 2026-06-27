/** 商品图自动轮播间隔（毫秒），约 5 秒便于看清每张图 */
export const PRODUCT_IMAGE_ROTATION_MS = 5000

export function parseProductImages(imageField, fallbackImages) {
  if (Array.isArray(fallbackImages) && fallbackImages.length) {
    return fallbackImages.filter(Boolean)
  }
  if (!imageField) return []
  if (Array.isArray(imageField)) return imageField.filter(Boolean)
  if (typeof imageField !== 'string') return []
  const raw = imageField.trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
    } catch (_e) {}
  }
  return [raw]
}

export function primaryProductImage(product) {
  const images = parseProductImages(product?.image, product?.images)
  return images[0] || ''
}
