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
