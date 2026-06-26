<template>
  <div class="products-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-box"></i>
            {{ $t('admin.products.catalogTitle') }}
          </h2>
          <p>{{ $t('admin.products.subtitle') }}</p>
        </div>
        <router-link to="/admin/products/add" class="btn btn-primary" :title="$t('admin.products.addProduct')">
          <i class="fas fa-plus"></i>
          <span>{{ $t('admin.products.addProduct') }}</span>
        </router-link>
        <router-link v-if="!isScopedAgent" to="/admin/product-categories" class="btn btn-secondary" :title="$t('admin.products.categories')">
          <i class="fas fa-tags"></i>
          <span>{{ $t('admin.products.categories') }}</span>
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.products.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-box-open"></i>
            <span>{{ $t('admin.products.totalCount', { count: products.length }) }}</span>
          </div>
        </div>

        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.products.tableHint') }}
          </p>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ $t('admin.products.id') }}</th>
                <th>{{ $t('admin.products.product') }}</th>
                <th v-if="!isScopedAgent">{{ $t('admin.products.category') }}</th>
                <th>{{ $t('admin.products.description') }}</th>
                <th>{{ $t('admin.products.price') }}</th>
                <th>{{ $t('admin.products.date') }}</th>
                <th class="text-center">{{ $t('admin.products.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="product in products" :key="product.id">
                <td>
                  <span class="id-badge">#{{ product.id }}</span>
                </td>
                <td>
                  <div class="product-cell">
                    <div class="product-image-small">
                      <img :src="getProductImage(product)" :alt="product.name" @error="handleImageError" />
                    </div>
                    <span class="product-name">{{ product.name }}</span>
                  </div>
                </td>
                <td v-if="!isScopedAgent">
                  <span class="category-cell">
                    {{ product.categoryName || '—' }}
                    <template v-if="product.subCategoryName">
                      <span class="sub-category-sep"> / </span>
                      <span class="sub-category-name">{{ product.subCategoryName }}</span>
                    </template>
                  </span>
                </td>
                <td>
                  <span class="description-cell">{{ truncateDescription(product.description) }}</span>
                </td>
                <td>
                  <span class="price-tag">
                    <i class="fab fa-bitcoin"></i>
                    {{ (product.priceUsdt || product.price || 0).toFixed(2) }} USDT
                  </span>
                </td>
                <td>
                  <span class="date-cell">{{ product.date }}</span>
                </td>
                <td class="actions-cell">
                  <div class="action-group" role="group" :aria-label="$t('admin.products.actionsFor', { name: product.name })">
                    <router-link
                      :to="`/admin/products/edit/${product.id}`"
                      class="action-btn btn-edit"
                      :title="$t('admin.products.editTitle', { name: product.name })"
                    >
                      <i class="fas fa-edit"></i>
                      <span class="action-text">{{ $t('admin.products.edit') }}</span>
                    </router-link>
                    <button
                      @click="confirmDelete(product.id, product.name)"
                      class="action-btn btn-delete"
                      :title="$t('admin.products.deleteTitle', { name: product.name })"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('admin.products.delete') }}</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="products.length === 0">
                <td :colspan="isScopedAgent ? 6 : 7" class="empty-state">
                  <i class="fas fa-box-open"></i>
                  <h3>{{ $t('admin.products.emptyTitle') }}</h3>
                  <p>{{ $t('admin.products.emptyDesc') }}</p>
                  <router-link to="/admin/products/add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> {{ $t('admin.products.addFirst') }}
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="scroll-indicator">
          <i class="fas fa-arrows-alt-h"></i>
          <span>{{ $t('admin.products.scrollHint') }}</span>
        </div>
      </div>

      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.products.deleteModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.products.deleteConfirm') }}</p>
            <div class="product-info-box">
              <div class="product-preview">
                <img v-if="getProductImage(productToDelete)" :src="getProductImage(productToDelete)" alt="Product" @error="handleImageError" />
                <div v-else class="no-image">
                  <i class="fas fa-image"></i>
                </div>
              </div>
              <div class="product-details">
                <p class="product-name-text"><strong>{{ productToDelete?.name }}</strong></p>
                <p class="product-price-text">
                  <i class="fab fa-bitcoin"></i>
                  {{ formatPrice(productToDelete?.priceUsdt || productToDelete?.price) }} USDT
                </p>
              </div>
            </div>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.products.cannotUndo') }}</strong></p>
                <p>{{ $t('admin.products.deleteWarning') }}</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('admin.products.cancelKeep') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.products.deleteProduct') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchAdminProducts, deleteProduct } from '@/services/v2/catalog'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import { primaryProductImage } from '@/utils/productImages'

const route = useRoute()
const { t } = useI18n()
const { isScopedAgent } = useAdminPermissions()

const products = ref([])
const loading = ref(true)

const showDeleteModal = ref(false)
const productToDelete = ref(null)

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

watch(
  () => route.name,
  (name) => {
    if (name === 'admin-products') fetchProducts()
  },
  { immediate: true }
)

async function fetchProducts() {
  loading.value = true
  try {
    const response = await fetchAdminProducts()
    products.value = response.data
  } catch {
    showToast(t('admin.products.loadFailed'), 'error')
  } finally {
    loading.value = false
  }
}

function confirmDelete(id) {
  productToDelete.value = products.value.find(p => p.id === id)
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  productToDelete.value = null
}

async function executeDelete() {
  if (!productToDelete.value) return

  const productId = productToDelete.value.id
  const productName = productToDelete.value.name

  try {
    await deleteProduct(productId)
    closeDeleteModal()
    await fetchProducts()
    showToast(t('admin.products.deleteSuccess', { name: productName }), 'success')
  } catch (error) {
    const errMsg = error.response?.data?.message || t('common.unknownError')
    showToast(t('admin.products.deleteFailed', { error: errMsg }), 'error')
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}

function truncateDescription(description) {
  if (!description) return '-'
  return description.length > 50 ? description.substring(0, 50) + '...' : description
}

function formatPrice(price) {
  return (parseFloat(price) || 0).toFixed(2)
}

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">' +
    '<rect fill="#1a1f3a" width="100%" height="100%"/>' +
    '<text x="50%" y="50%" fill="#00d4ff" font-family="Arial" font-size="24" text-anchor="middle" dy=".35em">📦</text>' +
    '</svg>'
  )
}

function getProductImage(product) {
  return primaryProductImage(product)
}
</script>

<style scoped>
.products-page {
  animation: fadeIn 0.12s ease;
  position: relative;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-content h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
}

.btn-danger {
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.table-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: visible;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
}

.table-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.table-info i {
  color: var(--primary-color);
}

.table-info-bar {
  padding: 0.75rem 1.5rem;
  background: rgba(0, 212, 255, 0.05);
  border-bottom: 1px solid var(--border-color);
}

.info-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-text i {
  color: var(--primary-color);
}

.table-responsive {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  display: block;
  width: 100%;
}

.data-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  display: table;
}

.table-responsive::-webkit-scrollbar {
  height: 8px;
}

.table-responsive::-webkit-scrollbar-track {
  background: var(--bg-darker);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #00b8e6;
}

.scroll-indicator {
  display: none;
  padding: 0.5rem 1rem;
  background: var(--bg-darker);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.scroll-indicator i {
  font-size: 0.8rem;
}

@media (max-width: 1200px) {
  .scroll-indicator {
    display: flex;
  }
}

@media (max-width: 768px) {
  .products-page {
    width: 100%;
    max-width: 100%;
  }

  .table-card {
    border-radius: 8px;
  }

  .table-header,
  .table-info-bar {
    padding: 0.75rem 1rem;
  }
}

@media (max-width: 576px) {
  .data-table {
    min-width: 1000px;
  }
}

.data-table thead {
  background: var(--bg-darker);
}

.data-table th {
  padding: 1rem 1.5rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table th.text-center {
  text-align: center;
}

.data-table td {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.id-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.product-image-small {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-darker);
  flex-shrink: 0;
}

.product-image-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-name {
  color: var(--text-primary);
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.price-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  background: rgba(0, 212, 255, 0.1);
  border-radius: 6px;
  color: var(--primary-color);
  font-weight: 600;
  font-size: 0.9rem;
}

.actions-cell {
  text-align: center;
}

.action-group {
  display: inline-flex;
  gap: 0.5rem;
  justify-content: center;
  align-items: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 80px;
  height: 40px;
  padding: 0 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
}

.action-btn i {
  font-size: 1rem;
  flex-shrink: 0;
}

.action-text {
  display: none;
  white-space: nowrap;
  line-height: 1;
}

@media (min-width: 1200px) {
  .action-text {
    display: inline;
  }
}

.btn-edit {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-edit:hover {
  background: var(--primary-color);
  color: white;
}

.btn-delete {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.btn-delete:hover {
  background: #f5576c;
  color: white;
}

.empty-state {
  text-align: center;
  padding: 4rem !important;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 1rem 0 0.5rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 0 1.5rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  max-width: 550px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header.danger i {
  color: #ffc107;
  font-size: 1.5rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary);
}

.product-info-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
  margin: 1rem 0;
}

.product-preview {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-darker);
  flex-shrink: 0;
}

.product-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-preview .no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.product-details {
  flex: 1;
}

.product-name-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.product-price-text {
  margin: 0;
  color: var(--primary-color);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.warning-box {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(245, 87, 108, 0.1);
  border: 1px solid #f5576c;
  border-radius: 8px;
  color: #f5576c;
}

.warning-box i {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.warning-content p {
  margin: 0;
  color: #f5576c;
}

.warning-content p:first-child {
  margin-bottom: 0.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: slideInRight 0.3s ease;
  z-index: 1001;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.toast.success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.toast.error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

.toast i {
  font-size: 1.2rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .product-info-box {
    flex-direction: column;
  }

  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }

  .modal-footer {
    flex-direction: column;
  }

  .modal-footer .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
