import v2 from './http'

/** 公开商品列表 */
export function fetchProducts(config = {}) {
  return v2.get('/products', config)
}

/** 商城聚合读：商品 + 分类一次返回，减少 PHP-FPM 并发 */
export function fetchStorefront(config = {}) {
  return v2.get('/catalog/storefront', config)
}

/** 公开商品详情 */
export function fetchProduct(id, config = {}) {
  return v2.get(`/products/${id}`, config)
}

/** 公开分类列表 */
export function fetchProductCategories() {
  return v2.get('/product-categories')
}

/** 管理端商品 */
export function fetchAdminProducts() {
  return v2.get('/admin/products')
}

export function fetchAdminProduct(id) {
  return v2.get(`/admin/products/${id}`)
}

export function createProduct(payload) {
  return v2.post('/admin/products', payload)
}

export function updateProduct(id, payload) {
  return v2.put(`/admin/products/${id}`, payload)
}

export function deleteProduct(id) {
  return v2.delete(`/admin/products/${id}`)
}

/** 管理端分类 */
export function fetchAdminCategories() {
  return v2.get('/admin/product-categories')
}

export function createCategory(payload) {
  return v2.post('/admin/product-categories', payload)
}

export function updateCategory(id, payload) {
  return v2.put(`/admin/product-categories/${id}`, payload)
}

export function deleteCategory(id) {
  return v2.delete(`/admin/product-categories/${id}`)
}

/** 商品图上传 */
export function uploadProductImage(formData, config = {}) {
  return v2.post('/admin/upload/product-image', formData, {
    timeout: 120000,
    ...config
  })
}

export function deleteProductImage(imagePath) {
  return v2.delete('/admin/upload/product-image', { data: { image: imagePath } })
}
