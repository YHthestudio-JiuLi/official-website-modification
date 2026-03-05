<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-box"></i> {{ $t('products.title') }}</h1>
          <p>Explore innovative technology, experience cutting-edge solutions</p>
        </div>
      </div>

      <div class="products-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="products.length === 0" class="empty-state">
            {{ $t('products.empty') }}
          </div>

          <div v-else class="products-grid">
            <div v-for="product in products" :key="product.id" class="product-card">
              <div class="product-image">
                <img :src="product.image" :alt="product.name" @error="handleImageError" />
                <div class="product-overlay">
                  <router-link :to="`/products/${product.id}`" class="btn btn-primary">View Details</router-link>
                </div>
              </div>
              <div class="product-info">
                <h3 :title="product.name">{{ product.name }}</h3>
                <p :title="product.description">{{ product.description }}</p>
                <div class="product-price-small">
                  <span class="price-amount">{{ product.priceUsdt || product.price || 0 }} USDT</span>
                </div>
                <div class="product-meta-small">
                  <span class="product-date">
                    <i class="fas fa-calendar"></i> {{ product.date }}
                  </span>
                </div>
                <div class="product-actions-small">
                  <router-link :to="`/products/${product.id}`" class="btn btn-secondary btn-sm">
                    View Details
                  </router-link>
                  <router-link :to="`/products/${product.id}/buy`" class="btn btn-primary btn-sm">
                    <i class="fas fa-shopping-cart"></i> Buy Now
                  </router-link>
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

const products = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const response = await api.get('/api/products')
    products.value = response.data
  } catch (error) {
    console.error('Failed to fetch products:', error)
  } finally {
    loading.value = false
  }
})

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180">' +
    '<rect fill="#1a1f3a" width="100%" height="100%"/>' +
    '<text x="50%" y="50%" fill="#00d4ff" font-family="Arial" font-size="20" text-anchor="middle" dy=".3em">No Image</text>' +
    '</svg>'
  )
}
</script>
