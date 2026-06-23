import * as catalogV2 from '@/services/v2/catalog'
import api from '@/services/api'
import i18n from '@/i18n'
import { useV2Api } from '@/utils/apiPath'

const USE_V2 = useV2Api() && import.meta.env.VITE_USE_V2_CATALOG !== 'false'

function langHeaders() {
  const locale = i18n.global.locale.value || 'en'
  return { headers: { 'Accept-Language': locale } }
}

export function getProducts() {
  if (USE_V2) {
    return catalogV2.fetchProducts(langHeaders())
  }
  return api.get('/api/products')
}

export function getProduct(id) {
  if (USE_V2) {
    return catalogV2.fetchProduct(id, langHeaders())
  }
  return api.get(`/api/products/${id}`)
}

export function getProductCategories() {
  if (USE_V2) {
    return catalogV2.fetchProductCategories()
  }
  return api.get('/api/product-categories')
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
    return id ? catalogV2.updateProduct(id, payload) : catalogV2.createProduct(payload)
  }
  return id
    ? api.put(`/api/admin/products/${id}`, payload)
    : api.post('/api/admin/products', payload)
}

export function removeProduct(id) {
  if (USE_V2) {
    return catalogV2.deleteProduct(id)
  }
  return api.delete(`/api/admin/products/${id}`)
}

export function getAdminCategories() {
  if (USE_V2) {
    return catalogV2.fetchAdminCategories()
  }
  return api.get('/api/admin/product-categories')
}

export function saveCategory(id, payload) {
  if (USE_V2) {
    return id ? catalogV2.updateCategory(id, payload) : catalogV2.createCategory(payload)
  }
  return id
    ? api.put(`/api/admin/product-categories/${id}`, payload)
    : api.post('/api/admin/product-categories', payload)
}

export function removeCategory(id) {
  if (USE_V2) {
    return catalogV2.deleteCategory(id)
  }
  return api.delete(`/api/admin/product-categories/${id}`)
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
