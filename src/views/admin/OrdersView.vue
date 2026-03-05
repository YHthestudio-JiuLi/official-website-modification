<template>
  <AdminLayout>
    <template #header-title>Order Management</template>

    <div class="orders-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-shopping-cart"></i> Order Management</h2>
          <p>Process and track customer orders</p>
        </div>
      </div>

      <!-- Filter Section -->
      <div class="filter-section">
        <div class="filter-form">
          <div class="filter-group">
            <label for="status-filter">
              <i class="fas fa-filter"></i> Filter by Status:
            </label>
            <select
              id="status-filter"
              v-model="statusFilter"
              @change="fetchOrders"
              class="filter-select"
            >
              <option value="">All Orders</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div class="filter-summary">
            <span class="filter-count">
              <i class="fas fa-list"></i> Total <strong>{{ orders.length }}</strong> orders
            </span>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading orders...</span>
        </div>
      </div>

      <div v-else class="table-wrapper">
        <div class="table-scroll-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th class="col-id">Order #</th>
                <th class="col-customer">Customer</th>
                <th class="col-product">Product</th>
                <th class="col-qty">Qty</th>
                <th class="col-amount">Amount</th>
                <th class="col-status">Status</th>
                <th class="col-date">Date</th>
                <th class="col-tx">TX Hash</th>
                <th class="col-address">Address</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id">
                <td class="col-id">
                  <span class="order-id">#{{ order.id }}</span>
                </td>
                <td class="col-customer">
                  <div class="customer-cell">
                    <i class="fas fa-user"></i>
                    {{ order.username }}
                  </div>
                </td>
                <td class="col-product">
                  <span class="product-name">{{ order.productName }}</span>
                </td>
                <td class="col-qty">{{ order.quantity }}</td>
                <td class="col-amount">
                  <span class="amount">{{ order.totalAmount }} USDT</span>
                </td>
                <td class="col-status">
                  <span :class="['status-badge', 'status-' + order.status]">
                    {{ getStatusText(order.status) }}
                  </span>
                </td>
                <td class="col-date">{{ formatDate(order.createdAt) }}</td>
                <td class="col-tx">
                  <span v-if="order.txHash" class="tx-hash" :title="order.txHash" @dblclick="copyTxHash(order.txHash)">
                    {{ truncateHash(order.txHash) }}
                  </span>
                  <span v-else class="no-data">-</span>
                </td>
                <td class="col-address">
                  <span v-if="order.shippingAddress" class="address-text" :title="order.shippingAddress" @dblclick="copyAddress(order.shippingAddress)">
                    {{ truncateAddress(order.shippingAddress) }}
                  </span>
                  <span v-else class="no-data">-</span>
                </td>
                <td class="col-actions">
                  <div class="action-group">
                    <button @click="openOrderDetail(order)" class="btn-view" title="View Details">
                      <i class="fas fa-eye"></i>
                      <span class="btn-text">View</span>
                    </button>
                    <select
                      :value="order.status"
                      @change="handleStatusUpdate(order.id, $event.target.value)"
                      class="status-select"
                      :title="`Update status - Current: ${getStatusText(order.status)}`"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button 
                      @click="confirmDelete(order.id, '#'+order.id)" 
                      class="btn-delete"
                      :title="`Delete order ${order.id}`"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="btn-text">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="orders.length === 0">
                <td colspan="10" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>No orders found</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 滚动提示 -->
        <div class="scroll-hint">
          <i class="fas fa-arrows-alt-h"></i>
          <span>Scroll horizontally to see all columns</span>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Confirm Order Deletion</h3>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete this order:</p>
            <div class="order-info-box">
              <div class="order-details">
                <p class="order-id-text"><strong>Order #{{ orderToDelete?.id }}</strong></p>
                <p class="order-customer-text">
                  <i class="fas fa-user"></i> {{ orderToDelete?.username }}
                </p>
                <p class="order-amount-text">
                  <i class="fas fa-dollar-sign"></i> {{ orderToDelete?.totalAmount }} USDT
                </p>
              </div>
            </div>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>This action cannot be undone!</strong></p>
                <p>This order will be permanently deleted from the system.</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> Cancel
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> Delete Order
            </button>
          </div>
        </div>
      </div>

      <!-- Order Detail Modal -->
      <div v-if="showOrderDetailModal" class="modal-overlay" @click="closeOrderDetailModal">
        <div class="modal-container modal-large" @click.stop>
          <div class="modal-header">
            <i class="fas fa-shopping-cart"></i>
            <h3>Order Details #{{ selectedOrder?.id }}</h3>
            <button @click="closeOrderDetailModal" class="modal-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="order-detail-grid">
              <div class="detail-section">
                <h4><i class="fas fa-user"></i> Customer Information</h4>
                <div class="detail-item">
                  <span class="detail-label">Username:</span>
                  <span class="detail-value">{{ selectedOrder?.username }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">User ID:</span>
                  <span class="detail-value">#{{ selectedOrder?.userId }}</span>
                </div>
              </div>

              <div class="detail-section">
                <h4><i class="fas fa-box"></i> Product Information</h4>
                <div class="detail-item">
                  <span class="detail-label">Product Name:</span>
                  <span class="detail-value">{{ selectedOrder?.productName }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Quantity:</span>
                  <span class="detail-value">{{ selectedOrder?.quantity }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Unit Price:</span>
                  <span class="detail-value">{{ selectedOrder?.price }} USDT</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Total Amount:</span>
                  <span class="detail-value highlight">{{ selectedOrder?.totalAmount }} USDT</span>
                </div>
              </div>

              <div class="detail-section">
                <h4><i class="fas fa-map-marker-alt"></i> Shipping Address</h4>
                <div class="detail-item full-width">
                  <span class="detail-value">{{ selectedOrder?.shippingAddress || 'No shipping address provided' }}</span>
                </div>
              </div>

              <div class="detail-section">
                <h4><i class="fas fa-link"></i> Transaction Information</h4>
                <div class="detail-item">
                  <span class="detail-label">TX Hash:</span>
                  <span class="detail-value tx-hash-value">{{ selectedOrder?.txHash || 'N/A' }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Status:</span>
                  <span :class="['status-badge', 'status-' + selectedOrder?.status]">
                    {{ getStatusText(selectedOrder?.status) }}
                  </span>
                </div>
              </div>

              <div class="detail-section">
                <h4><i class="fas fa-calendar"></i> Timestamps</h4>
                <div class="detail-item">
                  <span class="detail-label">Created At:</span>
                  <span class="detail-value">{{ formatDate(selectedOrder?.createdAt) }}</span>
                </div>
                <div v-if="selectedOrder?.paidAt" class="detail-item">
                  <span class="detail-label">Paid At:</span>
                  <span class="detail-value">{{ formatDate(selectedOrder?.paidAt) }}</span>
                </div>
                <div v-if="selectedOrder?.completedAt" class="detail-item">
                  <span class="detail-label">Completed At:</span>
                  <span class="detail-value">{{ formatDate(selectedOrder?.completedAt) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeOrderDetailModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> Close
            </button>
          </div>
        </div>
      </div>

      <!-- Toast Notification -->
      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const { t } = useI18n()
const orders = ref([])
const loading = ref(true)
const statusFilter = ref('')

const showDeleteModal = ref(false)
const orderToDelete = ref(null)

const showOrderDetailModal = ref(false)
const selectedOrder = ref(null)

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

const copiedContent = ref(null)

const statusTextMap = {
  'pending': 'Pending',
  'paid': 'Paid',
  'completed': 'Completed',
  'cancelled': 'Cancelled'
}

onMounted(fetchOrders)

async function fetchOrders() {
  loading.value = true
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : {}
    const response = await api.get('/api/admin/orders', { params })
    orders.value = response.data
  } catch (error) {
    showToast('Failed to load orders', 'error')
  } finally {
    loading.value = false
  }
}

function getStatusText(status) {
  return statusTextMap[status] || status
}

async function handleStatusUpdate(id, status) {
  try {
    await api.put(`/api/admin/orders/${id}/status`, { status })
    showToast(`Order #${id} updated to ${getStatusText(status)}`, 'success')
  } catch (error) {
    showToast('Failed to update status', 'error')
    fetchOrders()
  }
}

function confirmDelete(id, orderId) {
  orderToDelete.value = orders.value.find(o => o.id === id)
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  orderToDelete.value = null
}

async function executeDelete() {
  if (!orderToDelete.value) return

  try {
    await api.delete(`/api/admin/orders/${orderToDelete.value.id}`)
    closeDeleteModal()
    await fetchOrders()
    showToast('Order deleted successfully', 'success')
  } catch (error) {
    showToast('Failed to delete order', 'error')
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US')
}

function truncateHash(hash) {
  if (!hash) return '-'
  return hash.length > 16 ? hash.substring(0, 16) + '...' : hash
}

function truncateAddress(address) {
  if (!address) return '-'
  return address.length > 30 ? address.substring(0, 30) + '...' : address
}

async function copyAddress(address) {
  if (!address) return
  try {
    await navigator.clipboard.writeText(address)
    copiedContent.value = address
    showToast('Address copied', 'success')
    setTimeout(() => { copiedContent.value = null }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function copyTxHash(hash) {
  if (!hash) return
  try {
    await navigator.clipboard.writeText(hash)
    copiedContent.value = hash
    showToast('TX Hash copied', 'success')
    setTimeout(() => { copiedContent.value = null }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function openOrderDetail(order) {
  selectedOrder.value = order
  showOrderDetailModal.value = true
}

function closeOrderDetailModal() {
  showOrderDetailModal.value = false
  selectedOrder.value = null
}
</script>

<style scoped>
/* ========== Page Layout ========== */
.orders-page {
  padding: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-header p {
  margin: 0;
  color: var(--text-secondary);
}

/* ========== Filter Section ========== */
.filter-section {
  background: var(--bg-card);
  padding: 1rem 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  margin-bottom: 1rem;
}

.filter-form {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-group label {
  font-weight: 500;
  white-space: nowrap;
}

.filter-select {
  padding: 0.5rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  min-width: 140px;
}

.filter-count {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.filter-count strong {
  color: var(--primary-color);
}

/* ========== Loading ========== */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  background: var(--bg-card);
  border-radius: 10px;
  border: 1px solid var(--border-color);
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

/* ========== Table Styles ========== */
.table-wrapper {
  background: var(--bg-card);
  border-radius: 10px;
  border: 1px solid var(--border-color);
  position: relative;
  /* 关键修改：确保它不会溢出父级 */
  width: 100%;
  max-width: 100%; 
  overflow: hidden; /* 防止内部溢出干扰 */
}

.table-scroll-container {
  overflow-x: auto !important;
  overflow-y: block !important;
  width: 100%;
  /* 解决 iOS 滑动卡顿 */
  -webkit-overflow-scrolling: touch;
}

.orders-table {
  /* 这里的 min-width 会强制产生滚动条 */
  min-width: 1200px !important; 
  width: 100%;
  border-collapse: collapse;
}

/* Custom scrollbar */
.table-scroll-container::-webkit-scrollbar {
  height: 10px;
}

.table-scroll-container::-webkit-scrollbar-track {
  background: var(--bg-darker);
  border-radius: 5px;
}

.table-scroll-container::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 5px;
}

.orders-table thead {
  background: var(--bg-darker);
}

.orders-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-color);
}

.orders-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.orders-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.03);
}

/* Column widths - force table to be wider */
.col-id { min-width: 90px; }
.col-customer { min-width: 140px; }
.col-product { min-width: 180px; }
.col-qty { min-width: 70px; text-align: center; }
.col-amount { min-width: 110px; }
.col-status { min-width: 100px; }
.col-date { min-width: 150px; }
.col-tx { min-width: 180px; }
.col-address { min-width: 200px; }
.col-actions { min-width: 200px; text-align: center; }

/* Cell content */
.order-id {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.customer-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.customer-cell i {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.product-name {
  display: block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount {
  color: var(--primary-color);
  font-weight: 600;
}

.status-badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.status-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.status-badge.status-paid {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.status-badge.status-completed {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

.status-badge.status-cancelled {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.tx-hash {
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--primary-color);
}

.address-text {
  display: block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-data {
  color: var(--text-secondary);
}

/* ========== Action Buttons ========== */
.action-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.status-select {
  padding: 0.5rem 0.75rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
  min-width: 100px;
}

.status-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.btn-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 70px;
  height: 36px;
  padding: 0 0.75rem;
  background: rgba(245, 87, 108, 0.15);
  border: none;
  border-radius: 6px;
  color: #f5576c;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-delete:hover {
  background: #f5576c;
  color: white;
}

.btn-delete i {
  font-size: 0.9rem;
}

.btn-text {
  display: none;
}

@media (min-width: 1400px) {
  .btn-text {
    display: inline;
  }
}

.btn-view {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 70px;
  height: 36px;
  padding: 0 0.75rem;
  background: rgba(0, 212, 255, 0.15);
  border: none;
  border-radius: 6px;
  color: var(--primary-color);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  text-decoration: none;
}

.btn-view:hover {
  background: var(--primary-color);
  color: white;
}

.address-text {
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.address-text:hover {
  background: rgba(0, 212, 255, 0.1);
}

.tx-hash {
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.tx-hash:hover {
  background: rgba(0, 212, 255, 0.1);
}

/* ========== Scroll Hint ========== */
.scroll-hint {
  display: none;
  padding: 0.5rem 1rem;
  background: var(--bg-darker);
  border-top: 1px solid var(--border-color);
  border-radius: 0 0 10px 10px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: center;
  gap: 0.5rem;
}

@media (max-width: 1200px) {
  .scroll-hint {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ========== Table Wrapper ========== */
.table-wrapper {
  background: var(--bg-card);
  border-radius: 10px;
  border: 1px solid var(--border-color);
  position: relative;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: visible;
}

.table-scroll-container {
  overflow-x: auto !important;
  overflow-y: visible !important;
  -webkit-overflow-scrolling: touch;
  display: block !important;
  width: 100%;
  border-radius: 10px;
}

.table-scroll-container::-webkit-scrollbar {
  height: 10px;
}

.table-scroll-container::-webkit-scrollbar-track {
  background: var(--bg-darker);
  border-radius: 5px;
}

.table-scroll-container::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 5px;
}

.table-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #00b8e6;
}

.orders-table {
  width: 100% !important;
  max-width: max-content !important;
  min-width: 1200px !important;
  border-collapse: collapse;
  white-space: nowrap;
  display: table;
}

/* ========== Empty State ========== */
.empty-state {
  text-align: center;
  padding: 3rem !important;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
}

/* ========== Modal ========== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-container.modal-large {
  max-width: 800px;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  position: relative;
}

.modal-header.danger i {
  color: #ffc107;
  font-size: 1.3rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  flex: 1;
}

/* Order Detail Modal */
.order-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.detail-section {
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.25rem;
}

.detail-section h4 {
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-section h4 i {
  color: var(--primary-color);
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 1rem;
}

.detail-item.full-width {
  flex-direction: column;
}

.detail-label {
  color: var(--text-secondary);
  font-size: 0.85rem;
  white-space: nowrap;
}

.detail-value {
  color: var(--text-primary);
  font-size: 0.9rem;
  text-align: right;
  word-break: break-word;
}

.detail-value.highlight {
  color: var(--primary-color);
  font-weight: 600;
  font-size: 1.1rem;
}

.detail-value.tx-hash-value {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  transition: color 0.3s ease;
}

.modal-close:hover {
  color: var(--primary-color);
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary);
}

.order-info-box {
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  margin: 1rem 0;
}

.order-details p {
  margin: 0 0 0.5rem 0;
}

.order-id-text {
  color: var(--text-primary) !important;
  font-size: 1rem;
}

.order-customer-text,
.order-amount-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.order-amount-text {
  color: var(--primary-color) !important;
  font-weight: 600;
}

.warning-box {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(245, 87, 108, 0.1);
  border: 1px solid #f5576c;
  border-radius: 8px;
  margin-top: 1rem;
}

.warning-box i {
  color: #f5576c;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.warning-content p {
  color: #f5576c;
  margin: 0;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

.btn-danger {
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
}

/* ========== Toast ========== */
.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.875rem 1.25rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 2001;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease;
}

.toast.success {
  background: var(--bg-card);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.toast.error {
  background: var(--bg-card);
  border: 1px solid #f5576c;
  color: #f5576c;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ========== Responsive ========== */
@media (max-width: 992px) {
  .orders-page {
    width: 100%;
    max-width: 100%;
  }

  .filter-form {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-group {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-select {
    width: 100%;
  }
}

@media (max-width: 576px) {
  .admin-content {
    padding: 0.5rem;
  }
  
  .orders-table {
    min-width: 1000px !important;
  }
  
  .order-detail-grid {
    grid-template-columns: 1fr;
  }
  
  .detail-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .detail-value {
    text-align: left;
  }
}
</style>
