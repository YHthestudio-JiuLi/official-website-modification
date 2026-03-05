<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-shopping-cart"></i> {{ $t('buy.title') }}</h1>
        </div>
      </div>

      <div class="product-detail-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!product" class="empty-state">
            Product not found
          </div>

          <div v-else class="product-detail-grid">
            <div class="product-detail-image">
              <img :src="product.image" :alt="product.name" @error="handleImageError" />
            </div>
            <div class="product-detail-info">
              <h2>{{ product.name }}</h2>
              <p class="product-description">{{ product.description }}</p>

              <div class="product-detail-meta">
                <div class="meta-item">
                  <i class="fas fa-calendar"></i>
                  <span>Release Date: {{ product.date }}</span>
                </div>
              </div>

              <div class="product-detail-price">
                <span class="price-label">Unit Price: </span>
                <span class="price-amount-large">{{ product.priceUsdt || product.price || 0 }} USDT</span>
              </div>

              <form @submit.prevent="handleCreateOrder" class="buy-form">
                <div class="form-group">
                  <label for="quantity">
                    <i class="fas fa-hashtag"></i> {{ $t('buy.quantity') }}
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    v-model.number="quantity"
                    min="1"
                    required
                  />
                </div>

                <div class="order-summary">
                  <h3>Order Summary</h3>
                  <div class="summary-item">
                    <span>Product: </span>
                    <span>{{ product.name }}</span>
                  </div>
                  <div class="summary-item">
                    <span>Unit Price: </span>
                    <span>{{ product.priceUsdt || product.price || 0 }} USDT</span>
                  </div>
                  <div class="summary-item">
                    <span>Quantity: </span>
                    <span id="summary-quantity">{{ quantity }}</span>
                  </div>
                  <div class="summary-item total">
                    <span>Total: </span>
                    <span id="summary-total">{{ totalAmount }} USDT</span>
                  </div>
                </div>

                <div class="payment-method">
                  <h3><i class="fab fa-bitcoin"></i> Payment Method</h3>
                  <div class="payment-option selected">
                    <i class="fab fa-bitcoin"></i>
                    <span>USDT ({{ paymentSettings?.network || 'TRC20' }})</span>
                    <span class="check-icon"><i class="fas fa-check"></i></span>
                  </div>
                  <p class="payment-note">
                    Only USDT ({{ paymentSettings?.network || 'TRC20' }}) payment is supported
                  </p>
                </div>

                <div class="product-detail-actions">
                  <button type="submit" class="btn btn-primary btn-large" :disabled="submitting">
                    <i class="fas fa-credit-card"></i> {{ submitting ? $t('common.loading') : $t('buy.submit') }}
                  </button>
                  <router-link :to="`/products/${product.id}`" class="btn btn-secondary btn-large">
                    <i class="fas fa-arrow-left"></i> Back to Product
                  </router-link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const router = useRouter()

const product = ref(null)
const paymentSettings = ref(null)
const quantity = ref(1)
const loading = ref(true)
const submitting = ref(false)

const totalAmount = computed(() => {
  const price = product.value?.priceUsdt || product.value?.price || 0
  return (price * quantity.value).toFixed(2)
})

onMounted(async () => {
  try {
    const [productRes, settingsRes] = await Promise.all([
      api.get(`/api/products/${route.params.id}`),
      api.get('/api/payment-settings')
    ])
    product.value = productRes.data
    paymentSettings.value = settingsRes.data
  } catch (error) {
    console.error('Failed to fetch data:', error)
  } finally {
    loading.value = false
  }
})

async function handleCreateOrder() {
  submitting.value = true
  try {
    const response = await api.post('/api/orders', {
      productId: product.value.id,
      quantity: quantity.value
    })
    router.push(`/orders/${response.data.orderId}/pay`)
  } catch (error) {
    console.error('Failed to create order:', error)
  } finally {
    submitting.value = false
  }
}

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
    '<rect fill="#1a1f3a" width="100%" height="100%"/>' +
    '<text x="50%" y="50%" fill="#00d4ff" font-family="Arial" font-size="20" text-anchor="middle" dy=".3em">No Image</text>' +
    '</svg>'
  )
}
</script>
