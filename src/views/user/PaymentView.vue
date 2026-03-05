<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-credit-card"></i> {{ $t('payment.title') }} #{{ order?.id }}</h1>
        </div>
      </div>

      <div class="payment-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!order" class="empty-state">
            Order not found
          </div>

          <div v-else class="payment-container">
            <div class="payment-info">
              <div class="order-info-card">
                <h3><i class="fas fa-receipt"></i> Order Information</h3>
                <div class="info-item">
                  <span>Order Number: </span>
                  <span>#{{ order.id }}</span>
                </div>
                <div class="info-item">
                  <span>Product: </span>
                  <span>{{ order.productName }}</span>
                </div>
                <div class="info-item">
                  <span>Quantity: </span>
                  <span>{{ order.quantity }}</span>
                </div>
                <div class="info-item">
                  <span>Payment Amount: </span>
                  <span class="amount-highlight">{{ order.totalAmount }} USDT</span>
                </div>
                <div v-if="order.status === 'pending'" class="info-item">
                  <span>Order Status: </span>
                  <span :class="['status-badge', 'status-' + order.status]">
                    {{ getStatusText(order.status) }}
                  </span>
                </div>
                <div v-if="order.shippingAddress && order.status !== 'pending'" class="info-item">
                  <span>Address: </span>
                  <span>{{ order.shippingAddress }}</span>
                </div>
              </div>

              <div v-if="order.status === 'pending'" class="payment-instructions">
                <h3><i class="fab fa-bitcoin"></i> USDT Payment Instructions</h3>
                <div class="wallet-address">
                  <label>Wallet Address ({{ order.network || 'TRC20' }}): </label>
                  <div class="address-box">
                    <code id="wallet-address">{{ order.usdtWallet }}</code>
                    <button @click="copyAddress" class="btn-copy">
                      <i class="fas fa-copy"></i> {{ copied ? 'Copied!' : 'Copy' }}
                    </button>
                  </div>
                </div>
                <div class="payment-steps">
                  <h4>Payment Steps:</h4>
                  <ol>
                    <li>Open your USDT wallet (supporting {{ order.network || 'TRC20' }} network)</li>
                    <li>Transfer <strong>{{ order.totalAmount }} USDT</strong> to the address above</li>
                    <li>Wait for blockchain confirmation (usually takes a few minutes)</li>
                    <li>Copy the transaction hash (TX Hash) and submit</li>
                  </ol>
                </div>
              </div>
            </div>

            <div v-if="order.status === 'pending'" class="payment-form-card">
              <h3><i class="fas fa-check-circle"></i> Confirm Payment</h3>
              <form @submit.prevent="handleConfirmPayment" class="payment-form">
                <div class="form-group">
                  <label for="shippingAddress">
                    <i class="fas fa-map-marker-alt"></i> Address *
                  </label>
                  <input
                    type="text"
                    id="shippingAddress"
                    v-model="shippingAddress"
                    required
                    placeholder="Please enter your shipping address"
                  />
                  <small>Please ensure the address is correct, otherwise the order cannot be confirmed</small>
                </div>
                <div class="form-group">
                  <label for="txHash">
                    <i class="fas fa-hashtag"></i> Transaction Hash (TX Hash) *
                  </label>
                  <input
                    type="text"
                    id="txHash"
                    v-model="txHash"
                    required
                    placeholder="Please enter your USDT transaction hash"
                  />
                  <small>Please ensure the transaction hash is correct, otherwise the order cannot be confirmed</small>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-large" :disabled="submitting">
                  <i class="fas fa-check"></i> {{ submitting ? $t('common.loading') : $t('payment.submit') }}
                </button>
              </form>
            </div>

            <div v-else-if="order.status === 'paid'" class="payment-success">
              <i class="fas fa-check-circle success-icon"></i>
              <h3>Payment Successful!</h3>
              <p>Your order payment has been confirmed, we are processing it.</p>
              <div v-if="order.txHash" class="tx-hash">
                <span>Transaction Hash: </span>
                <code>{{ order.txHash }}</code>
              </div>
              <router-link to="/orders" class="btn btn-primary">View My Orders</router-link>
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
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const order = ref(null)
const txHash = ref('')
const shippingAddress = ref('')
const loading = ref(true)
const submitting = ref(false)
const copied = ref(false)

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

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(order.value.usdtWallet)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function handleConfirmPayment() {
  if (!shippingAddress.value || !shippingAddress.value.trim()) {
    alert('Please enter your address')
    return
  }
  if (!txHash.value || !txHash.value.trim()) {
    alert('Please enter your transaction hash')
    return
  }
  submitting.value = true
  try {
    await api.post(`/api/orders/${route.params.id}/confirm`, {
      txHash: txHash.value,
      shippingAddress: shippingAddress.value.trim()
    })
    await onMounted()
  } catch (error) {
    console.error('Failed to confirm payment:', error)
    alert(error.response?.data?.message || 'Submission failed, please try again')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
</style>
