<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-receipt"></i> {{ $t('orders.title') }}</h1>
        </div>
      </div>

      <div class="orders-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="orders.length === 0" class="empty-orders">
            <i class="fas fa-shopping-cart"></i>
            <h3>No Orders</h3>
            <p>You don't have any orders yet</p>
            <router-link to="/products" class="btn btn-primary">Go Shopping</router-link>
          </div>

          <div v-else>
            <div class="orders-filter">
              <span>Total <strong>{{ orders.length }}</strong> orders</span>
            </div>
            <div class="orders-list">
              <div v-for="order in orders" :key="order.id" class="order-card">
                <div class="order-header">
                  <div class="order-id">
                    <span>Order #: </span>
                    <strong>#{{ order.id }}</strong>
                  </div>
                  <span :class="['status-badge', 'status-' + order.status]">
                    <i :class="getStatusIcon(order.status)"></i>
                    {{ getStatusText(order.status) }}
                  </span>
                </div>
                <div class="order-body">
                  <div class="order-product">
                    <h3><i class="fas fa-box"></i> {{ order.productName }}</h3>
                    <div class="order-details">
                      <p><i class="fas fa-hashtag"></i> Order #: <strong>#{{ order.id }}</strong></p>
                      <p><i class="fas fa-shopping-bag"></i> Quantity: <strong>{{ order.quantity }}</strong></p>
                      <p><i class="fas fa-dollar-sign"></i> Unit Price: <strong>{{ order.price }} USDT</strong></p>
                      <p v-if="order.shippingAddress">
                        <i class="fas fa-map-marker-alt"></i> Address:
                        <span class="address-text" @dblclick="copyAddress(order.shippingAddress)" title="Double click to copy">
                          {{ order.shippingAddress }}
                          <i v-if="copiedAddress === order.shippingAddress" class="fas fa-check check-icon"></i>
                        </span>
                      </p>
                      <p v-if="order.txHash">
                        <i class="fas fa-link"></i> Transaction Hash:
                        <code class="tx-hash">{{ order.txHash }}</code>
                      </p>
                    </div>
                  </div>
                  <div class="order-amount">
                    <span class="amount-label">Total: </span>
                    <span class="amount-value">{{ order.totalAmount }} USDT</span>
                  </div>
                </div>
                <div class="order-footer">
                  <div class="order-dates">
                    <div class="order-date">
                      <i class="fas fa-calendar-plus"></i>
                      <span>Created At: {{ formatDate(order.createdAt) }}</span>
                    </div>
                    <div v-if="order.paidAt" class="order-date">
                      <i class="fas fa-check-circle"></i>
                      <span>Paid At: {{ formatDate(order.paidAt) }}</span>
                    </div>
                    <div v-if="order.completedAt" class="order-date">
                      <i class="fas fa-check-double"></i>
                      <span>Completed At: {{ formatDate(order.completedAt) }}</span>
                    </div>
                  </div>
                  <div class="order-actions">
                    <router-link
                      :to="`/orders/${order.id}`"
                      class="btn btn-secondary btn-sm"
                    >
                      <i class="fas fa-eye"></i> Details
                    </router-link>
                    <router-link
                      v-if="order.status === 'pending'"
                      :to="`/orders/${order.id}/pay`"
                      class="btn btn-primary btn-sm"
                    >
                      <i class="fas fa-credit-card"></i> Pay Now
                    </router-link>
                    <span v-else-if="order.status === 'paid'" class="status-text status-paid">
                      <i class="fas fa-hourglass-half"></i> Processing...
                    </span>
                    <span v-else-if="order.status === 'completed'" class="status-text status-completed">
                      <i class="fas fa-check-circle"></i> Completed
                    </span>
                    <span v-else-if="order.status === 'cancelled'" class="status-text status-cancelled">
                      <i class="fas fa-times-circle"></i> Cancelled
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const orders = ref([])
const loading = ref(true)
const copiedAddress = ref(null)

onMounted(async () => {
  try {
    const response = await api.get('/api/orders')
    orders.value = response.data
  } catch (error) {
    console.error('Failed to fetch orders:', error)
  } finally {
    loading.value = false
  }
})

async function copyAddress(address) {
  if (!address) return
  try {
    await navigator.clipboard.writeText(address)
    copiedAddress.value = address
    setTimeout(() => { copiedAddress.value = null }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function getStatusText(status) {
  const statusMap = {
    'pending': 'Pending Payment',
    'paid': 'Paid',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  }
  return statusMap[status] || status
}

function getStatusIcon(status) {
  const iconMap = {
    'pending': 'fas fa-clock',
    'paid': 'fas fa-check',
    'completed': 'fas fa-check-double',
    'cancelled': 'fas fa-times'
  }
  return iconMap[status] || 'fas fa-circle'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-US')
}
</script>

<style scoped>
.orders-page {
  padding: 2rem 0;
}

.loading,
.empty-orders {
  text-align: center;
  padding: 3rem;
}

.empty-orders i {
  font-size: 4rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.empty-orders h3 {
  margin: 1rem 0;
  color: var(--text-primary);
}

.empty-orders p {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.orders-filter {
  margin-bottom: 1.5rem;
  color: var(--text-secondary);
}

.orders-filter strong {
  color: var(--primary-color);
}

.orders-list {
  display: grid;
  gap: 1.5rem;
}

.order-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.3s ease;
}

.order-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.1);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-darker);
  border-bottom: 1px solid var(--border-color);
}

.order-id {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.order-id strong {
  color: var(--text-primary);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
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

.order-body {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem;
  gap: 1.5rem;
}

.order-product {
  flex: 1;
}

.order-product h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.order-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.order-details p {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  line-height: 1.5;
}

.order-details i {
  font-size: 0.85rem;
  margin-top: 0.15rem;
}

.tx-hash {
  font-family: 'Courier New', monospace;
  color: var(--primary-color);
  word-break: break-all;
}

.address-text {
  color: var(--text-primary);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.address-text:hover {
  background: rgba(0, 212, 255, 0.1);
}

.address-text .check-icon {
  color: #43e97b;
}

.order-amount {
  text-align: right;
  flex-shrink: 0;
}

.amount-label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.amount-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
}

.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 1rem;
}

.order-dates {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.order-date {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.order-date i {
  font-size: 0.75rem;
}

.order-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.85rem;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

.btn-sm {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: #00b8e6;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

.status-text {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-text.status-paid {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
}

.status-text.status-completed {
  background: rgba(67, 233, 123, 0.1);
  color: #43e97b;
}

.status-text.status-cancelled {
  background: rgba(245, 87, 108, 0.1);
  color: #f5576c;
}

@media (max-width: 768px) {
  .order-body {
    flex-direction: column;
  }

  .order-amount {
    text-align: left;
    width: 100%;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .order-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .order-actions {
    justify-content: flex-end;
  }
}
</style>
