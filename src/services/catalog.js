import * as catalogV2 from '@/services/v2/catalog'
import api from '@/services/api'
import i18n, { DEFAULT_LOCALE } from '@/i18n'
import { useV2Api } from '@/utils/apiPath'
import { cachedRequest, cachedV2OrLegacy, afterCacheMutation } from '@/utils/getCache'
import { CACHE_NAMESPACE, CACHE_TTL } from '@/utils/cachePolicy'

const USE_V2 = useV2Api() && import.meta.env.VITE_USE_V2_CATALOG !== 'false'

function langHeaders() {
  const locale = i18n.global.locale.value || DEFAULT_LOCALE
  return { headers: { 'Accept-Language': locale } }
}

function catalogLocaleKey() {
  return i18n.global.locale.value || DEFAULT_LOCALE
}

export function getProducts(config = {}) {
  const limit = config.params?.limit ?? 'all'
  const key = `${CACHE_NAMESPACE.CATALOG}products:${catalogLocaleKey()}:${limit}`
  return cachedV2OrLegacy({
    key,
    ttl: CACHE_TTL.CATALOG_LIST,
    useV2: USE_V2,
    v2: () => catalogV2.fetchProducts({ ...langHeaders(), ...config }),
    legacy: () => api.get('/api/products', config),
  })
}

export function getStorefront(config = {}) {
  const limit = config.params?.limit ?? 'all'
  const withCategories = config.params?.categories !== false
  const key = `${CACHE_NAMESPACE.CATALOG}storefront:${catalogLocaleKey()}:${limit}:${withCategories ? 1 : 0}`
  if (USE_V2) {
    return cachedRequest(key, CACHE_TTL.CATALOG_LIST, () =>
      catalogV2.fetchStorefront({
        ...langHeaders(),
        params: {
          ...(config.params || {}),
          categories: withCategories ? 1 : 0,
        },
      })
    )
  }
  return Promise.all([
    getProducts(config),
    withCategories ? getProductCategories() : Promise.resolve({ data: [] }),
  ]).then(([productsRes, categoriesRes]) => ({
    data: {
      products: productsRes.data,
      categories: categoriesRes.data,
    },
  }))
}

export function getProduct(id) {
  const key = `${CACHE_NAMESPACE.CATALOG}product:${id}:${catalogLocaleKey()}`
  return cachedV2OrLegacy({
    key,
    ttl: CACHE_TTL.CATALOG_DETAIL,
    useV2: USE_V2,
    v2: () => catalogV2.fetchProduct(id, langHeaders()),
    legacy: () => api.get(`/api/products/${id}`),
  })
}

export function getProductCategories() {
  const key = `${CACHE_NAMESPACE.CATALOG}categories`
  return cachedV2OrLegacy({
    key,
    ttl: CACHE_TTL.CATALOG_LIST,
    useV2: USE_V2,
    v2: () => catalogV2.fetchProductCategories(),
    legacy: () => api.get('/api/product-categories'),
  })
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
  const run = USE_V2
    ? (id ? catalogV2.updateProduct(id, payload) : catalogV2.createProduct(payload))
    : (id
      ? api.put(`/api/admin/products/${id}`, payload)
      : api.post('/api/admin/products', payload))
  return afterCacheMutation(run, CACHE_NAMESPACE.CATALOG)
}

export function removeProduct(id) {
  const run = USE_V2 ? catalogV2.deleteProduct(id) : api.delete(`/api/admin/products/${id}`)
  return afterCacheMutation(run, CACHE_NAMESPACE.CATALOG)
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
  return afterCacheMutation(run, CACHE_NAMESPACE.CATALOG)
}

export function removeCategory(id) {
  const run = USE_V2 ? catalogV2.deleteCategory(id) : api.delete(`/api/admin/product-categories/${id}`)
  return afterCacheMutation(run, CACHE_NAMESPACE.CATALOG)
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
