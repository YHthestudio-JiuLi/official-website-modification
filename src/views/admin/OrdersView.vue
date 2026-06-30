<template>
  <div class="orders-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-shopping-cart"></i> {{ $t('admin.orders.title') }}</h2>
          <p>{{ $t('admin.orders.subtitle') }}</p>
        </div>
      </div>

      <!-- Filter Section -->
      <div v-if="canAccessPage" class="filter-section">
        <div class="filter-form">
          <div class="filter-group">
            <label for="status-filter">
              <i class="fas fa-filter"></i> {{ $t('admin.orders.filterByStatus') }}
            </label>
            <select
              id="status-filter"
              v-model="statusFilter"
              @change="fetchOrders"
              class="filter-select"
            >
              <option value="">{{ $t('admin.orders.allOrders') }}</option>
              <option value="pending">{{ $t('admin.orders.filter.pending') }}</option>
              <option value="paid">{{ $t('admin.orders.filter.paid') }}</option>
              <option value="shipped">{{ $t('admin.orders.filter.shipped') }}</option>
              <option value="delivered">{{ $t('admin.orders.filter.delivered') }}</option>
            </select>
          </div>
          <div class="filter-summary">
            <span class="filter-count">
              <i class="fas fa-list"></i> {{ $t('admin.orders.totalCount', { count: orders.length }) }}
            </span>
          </div>
        </div>
      </div>

      <AdminNoPermissionCard v-if="!canAccessPage" message-key="admin.orders.noPermission" />

      <div v-else-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.orders.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-wrapper">
        <div class="table-scroll-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th class="col-id">{{ $t('admin.orders.orderNumber') }}</th>
                <th class="col-customer">{{ $t('admin.orders.customer') }}</th>
                <th class="col-product">{{ $t('admin.orders.product') }}</th>
                <th class="col-qty">{{ $t('admin.orders.qty') }}</th>
                <th class="col-amount">{{ $t('admin.orders.amount') }}</th>
                <th class="col-status">{{ $t('admin.orders.status') }}</th>
                <th class="col-date">{{ $t('admin.orders.date') }}</th>
                <th class="col-tx">{{ $t('admin.orders.txHash') }}</th>
                <th class="col-address">{{ $t('admin.orders.address') }}</th>
                <th class="col-actions">{{ $t('admin.orders.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id">
                <td class="col-id">
                  <span class="order-id">{{ displayOrderNo(order) }}</span>
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
                  <span :class="['status-badge', 'status-' + normalizeOrderStatus(order.status)]">
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
                    <button @click="openOrderDetail(order)" class="btn-view" :title="$t('admin.orders.viewDetails')">
                      <i class="fas fa-eye"></i>
                      <span class="btn-text">{{ $t('admin.orders.view') }}</span>
                    </button>
                    <select
                      v-if="canManage"
                      :value="normalizeOrderStatus(order.status)"
                      @change="handleStatusUpdate(order.id, $event.target.value)"
                      class="status-select"
                      :title="$t('admin.orders.updateStatusTitle', { status: getStatusText(order.status) })"
                    >
                      <option value="pending">{{ $t('admin.orders.filter.pending') }}</option>
                      <option value="paid">{{ $t('admin.orders.filter.paid') }}</option>
                      <option value="shipped">{{ $t('admin.orders.filter.shipped') }}</option>
                      <option value="delivered">{{ $t('admin.orders.filter.delivered') }}</option>
                    </select>
                    <span v-else :class="['status-badge-inline', 'status-' + order.status]">
                      {{ getStatusText(order.status) }}
                    </span>
                    <button
                      v-if="canManage"
                      @click="confirmDelete(order.id)"
                      class="btn-delete"
                      :title="$t('admin.orders.deleteOrderTitle', { id: displayOrderNo(order) })"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="btn-text">{{ $t('admin.orders.delete') }}</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="orders.length === 0">
                <td colspan="10" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>{{ $t('admin.orders.empty') }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 滚动提示 -->
        <div class="scroll-hint">
          <i class="fas fa-arrows-alt-h"></i>
          <span>{{ $t('admin.orders.scrollHint') }}</span>
        </div>
      </div>

      <DeleteOrderModal
        :visible="showDeleteModal"
        :order="orderToDelete"
        :order-label="displayOrderNo(orderToDelete || {})"
        @close="closeDeleteModal"
        @confirm="executeDelete"
      />

      <OrderDetailModal
        :visible="showOrderDetailModal"
        :order="selectedOrder"
        :tracking-input="trackingInput"
        :saving-tracking="savingTracking"
        @close="closeOrderDetailModal"
        @tracking-input="setTrackingInput"
        @schedule-save="scheduleTrackingSave"
        @flush-save="flushTrackingSave"
        @clear-tracking="clearTracking"
      />

      <!-- Toast Notification -->
      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
</template>

<script setup>
import AdminNoPermissionCard from '@/components/admin/AdminNoPermissionCard.vue'
import DeleteOrderModal from '@/components/admin/orders/DeleteOrderModal.vue'
import OrderDetailModal from '@/components/admin/orders/OrderDetailModal.vue'
import { useAdminOrdersPage } from '@/composables/useAdminOrdersPage'

const {
  canManage,
  canAccessPage,
  orders,
  loading,
  statusFilter,
  showDeleteModal,
  orderToDelete,
  showOrderDetailModal,
  selectedOrder,
  toast,
  trackingInput,
  savingTracking,
  scheduleTrackingSave,
  flushTrackingSave,
  clearTracking,
  setTrackingInput,
  fetchOrders,
  getStatusText,
  normalizeOrderStatus,
  handleStatusUpdate,
  confirmDelete,
  closeDeleteModal,
  executeDelete,
  formatDate,
  truncateHash,
  truncateAddress,
  copyAddress,
  copyTxHash,
  openOrderDetail,
  closeOrderDetailModal,
  displayOrderNo,
} = useAdminOrdersPage()
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: visible;
}

.table-scroll-container {
  overflow-x: auto !important;
  overflow-y: visible !important;
  width: 100%;
  -webkit-overflow-scrolling: touch;
  display: block !important;
  border-radius: 10px;
}

.orders-table {
  min-width: 1200px !important;
  width: 100% !important;
  max-width: max-content !important;
  border-collapse: collapse;
  white-space: nowrap;
  display: table;
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

.status-badge.status-shipped {
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
}

.status-badge.status-delivered,
.status-badge.status-completed {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

.tx-hash {
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
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

.address-text:hover,
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
