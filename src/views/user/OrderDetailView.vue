<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-receipt"></i> Order Details #{{ order?.id }}</h1>
        </div>
      </div>

      <div class="order-detail-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!order" class="empty-state">
            Order not found
          </div>

          <div v-else class="order-detail-container">
            <div class="order-detail-card">
              <h3><i class="fas fa-info-circle"></i> Order Information</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="label">Order Number:</span>
                  <span class="value">#{{ order.id }}</span>
                </div>
                <div class="info-item">
                  <span class="label">Order Date:</span>
                  <span class="value">{{ formatDate(order.createdAt) }}</span>
                </div>
                <div class="info-item">
                  <span class="label">Product:</span>
                  <span class="value">{{ order.productName }}</span>
                </div>
                <div class="info-item">
                  <span class="label">Quantity:</span>
                  <span class="value">{{ order.quantity }}</span>
                </div>
                <div class="info-item">
                  <span class="label">Unit Price:</span>
                  <span class="value">{{ order.price }} USDT</span>
                </div>
                <div class="info-item">
                  <span class="label">Total Amount:</span>
                  <span class="value amount-highlight">{{ order.totalAmount }} USDT</span>
                </div>
                <div class="info-item">
                  <span class="label">Order Status:</span>
                  <span :class="['status-badge', 'status-' + order.status]">
                    {{ getStatusText(order.status) }}
                  </span>
                </div>
                <div class="info-item">
                  <span class="label">Payment Method:</span>
                  <span class="value">{{ order.paymentMethod }} ({{ order.network || 'TRC20' }})</span>
                </div>
              </div>
            </div>

            <div v-if="order.shippingAddress" class="order-detail-card">
              <h3><i class="fas fa-map-marker-alt"></i> Shipping Address</h3>
              <div class="address-box" @dblclick="copyAddress" title="Double click to copy">
                <p>{{ order.shippingAddress }}</p>
                <span v-if="addressCopied" class="copy-feedback">
                  <i class="fas fa-check"></i> Copied!
                </span>
              </div>
            </div>

            <div v-if="order.txHash" class="order-detail-card">
              <h3><i class="fas fa-link"></i> Transaction Hash</h3>
              <div class="tx-hash-box" @dblclick="copyTxHash" title="Double click to copy">
                <code>{{ order.txHash }}</code>
                <span v-if="txCopied" class="copy-feedback">
                  <i class="fas fa-check"></i> Copied!
                </span>
              </div>
            </div>

            <div v-if="order.paidAt" class="order-detail-card">
              <h3><i class="fas fa-clock"></i> Payment Time</h3>
              <p class="value">{{ formatDate(order.paidAt) }}</p>
            </div>

            <div v-if="order.completedAt" class="order-detail-card">
              <h3><i class="fas fa-check-circle"></i> Completion Time</h3>
              <p class="value">{{ formatDate(order.completedAt) }}</p>
            </div>

            <div class="action-buttons">
              <router-link to="/orders" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Orders
              </router-link>
              <a v-if="order.usdtWallet" :href="`/orders/${order.id}/pay`" class="btn btn-primary">
                <i class="fas fa-credit-card"></i> Go to Payment
              </a>
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
import { useRoute } from 'vue-router'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const order = ref(null)
const loading = ref(true)
const addressCopied = ref(false)
const txCopied = ref(false)

onMounted(async () => {
  try {
    const response = await api.get(`/api/orders/${route.params.id}`)
    order.value = response.data
  } catch (error) {
    console.error('Failed to fetch order:', error)
  } finally {
    loading.value = false
  }
})

function getStatusText(status) {
  const statusMap = {
    'pending': 'Pending',
    'paid': 'Paid',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  }
  return statusMap[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US')
}

async function copyAddress() {
  if (!order.value?.shippingAddress) return
  try {
    await navigator.clipboard.writeText(order.value.shippingAddress)
    addressCopied.value = true
    setTimeout(() => { addressCopied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function copyTxHash() {
  if (!order.value?.txHash) return
  try {
    await navigator.clipboard.writeText(order.value.txHash)
    txCopied.value = true
    setTimeout(() => { txCopied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
.order-detail-page {
  padding: 2rem 0;
}

.order-detail-container {
  max-width: 800px;
  margin: 0 auto;
}

.order-detail-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-color);
}

.order-detail-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-item .label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.info-item .value {
  font-size: 1rem;
  color: var(--text-primary);
  font-weight: 500;
}

.amount-highlight {
  color: var(--primary-color);
  font-size: 1.25rem;
  font-weight: 700;
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

.address-box,
.tx-hash-box {
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.address-box:hover,
.tx-hash-box:hover {
  background: rgba(0, 212, 255, 0.1);
}

.address-box p {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.5;
}

.tx-hash-box code {
  font-family: 'Courier New', monospace;
  color: var(--primary-color);
  font-size: 0.9rem;
  word-break: break-all;
}

.copy-feedback {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: #43e97b;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 2rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  border: none;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: #00b8e6;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 3rem;
  color: var(--primary-color);
}
</style>
