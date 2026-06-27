import * as catalogV2 from '@/services/v2/catalog'
import api from '@/services/api'
import i18n from '@/i18n'
import { useV2Api } from '@/utils/apiPath'
import { cachedRequest, invalidateCache } from '@/utils/getCache'

const USE_V2 = useV2Api() && import.meta.env.VITE_USE_V2_CATALOG !== 'false'
const CATALOG_TTL = 60_000
const PRODUCT_DETAIL_TTL = 30_000

function langHeaders() {
  const locale = i18n.global.locale.value || 'en'
  return { headers: { 'Accept-Language': locale } }
}

function catalogLocaleKey() {
  return i18n.global.locale.value || 'en'
}

export function getProducts(config = {}) {
  const limit = config.params?.limit ?? 'all'
  const key = `catalog:products:${catalogLocaleKey()}:${limit}`
  if (USE_V2) {
    return cachedRequest(key, CATALOG_TTL, () => catalogV2.fetchProducts({ ...langHeaders(), ...config }))
  }
  return cachedRequest(key, CATALOG_TTL, () => api.get('/api/products', config))
}

export function getProduct(id) {
  const key = `catalog:product:${id}:${catalogLocaleKey()}`
  if (USE_V2) {
    return cachedRequest(key, PRODUCT_DETAIL_TTL, () => catalogV2.fetchProduct(id, langHeaders()))
  }
  return cachedRequest(key, PRODUCT_DETAIL_TTL, () => api.get(`/api/products/${id}`))
}

export function getProductCategories() {
  const key = 'catalog:categories'
  if (USE_V2) {
    return cachedRequest(key, CATALOG_TTL, () => catalogV2.fetchProductCategories())
  }
  return cachedRequest(key, CATALOG_TTL, () => api.get('/api/product-categories'))
}

export function getAdminProducts() {
  if (USE_V2) {
    return catalogV2.fetchAdminProducts()
  }
  return api.get('/api/admin/products')
}

export function getAdminProduct(id) {
  if (USE_V2) {
    return catalogV2.fetchAdminProduct(id)
  }
  return api.get(`/api/admin/products/${id}`)
}

export function saveProduct(id, payload) {
  if (USE_V2) {
    return (id ? catalogV2.updateProduct(id, payload) : catalogV2.createProduct(payload))
      .then((res) => {
        invalidateCache('catalog:')
        return res
      })
  }
  return (id
    ? api.put(`/api/admin/products/${id}`, payload)
    : api.post('/api/admin/products', payload))
    .then((res) => {
      invalidateCache('catalog:')
      return res
    })
}

export function removeProduct(id) {
  const run = USE_V2 ? catalogV2.deleteProduct(id) : api.delete(`/api/admin/products/${id}`)
  return run.then((res) => {
    invalidateCache('catalog:')
    return res
  })
}

export function getAdminCategories() {
  if (USE_V2) {
    return catalogV2.fetchAdminCategories()
  }
  return api.get('/api/admin/product-categories')
}

export function saveCategory(id, payload) {
  const run = USE_V2
    ? (id ? catalogV2.updateCategory(id, payload) : catalogV2.createCategory(payload))
    : (id
      ? api.put(`/api/admin/product-categories/${id}`, payload)
      : api.post('/api/admin/product-categories', payload))
  return run.then((res) => {
    invalidateCache('catalog:')
    return res
  })
}

export function removeCategory(id) {
  const run = USE_V2 ? catalogV2.deleteCategory(id) : api.delete(`/api/admin/product-categories/${id}`)
  return run.then((res) => {
    invalidateCache('catalog:')
    return res
  })
}

export function uploadProductImage(formData) {
  if (USE_V2) {
    return catalogV2.uploadProductImage(formData)
  }
  return api.post('/api/admin/upload/product-image', formData, { timeout: 120000 })
}

export function deleteProductImage(imagePath) {
  if (USE_V2) {
    return catalogV2.deleteProductImage(imagePath)
  }
  return api.delete('/api/admin/upload/product-image', { data: { image: imagePath } })
}
