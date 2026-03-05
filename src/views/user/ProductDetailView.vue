<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-box"></i> {{ product?.name || 'Product Detail' }}</h1>
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
                <span class="price-label">Price: </span>
                <span class="price-amount-large">{{ product.priceUsdt || product.price || 0 }} USDT</span>
              </div>

              <div class="product-detail-actions">
                <router-link :to="`/products/${product.id}/buy`" class="btn btn-primary btn-large">
                  <i class="fas fa-shopping-cart"></i> Buy Now
                </router-link>
                <router-link to="/products" class="btn btn-secondary btn-large">
                  <i class="fas fa-arrow-left"></i> Back to Product List
                </router-link>
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
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const router = useRouter()
const product = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const response = await api.get(`/api/products/${route.params.id}`)
    product.value = response.data
  } catch (error) {
    console.error('Failed to fetch product:', error)
  } finally {
    loading.value = false
  }
})

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
    '<rect fill="#1a1f3a" width="100%" height="100%"/>' +
    '<text x="50%" y="50%" fill="#00d4ff" font-family="Arial" font-size="20" text-anchor="middle" dy=".3em">No Image</text>' +
    '</svg>'
  )
}
</script>
