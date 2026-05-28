<template>
  <div>
    <AppHeader />
    <main>
      <!-- Hero Section -->
      <div class="hero-section">
        <div class="hero-background">
          <div class="grid-overlay"></div>
          <div class="particles"></div>
        </div>
        <div class="hero-content">
          <h1 class="hero-title">
            <span class="gradient-text">YHthestudio</span>
          </h1>
          <p class="hero-subtitle">Innovative Technology · Leading the Future</p>
          <p class="hero-description">Explore cutting-edge technology, connect innovative thinking, build the digital future</p>
          <div class="hero-buttons">
            <router-link to="/products" class="btn btn-primary btn-large">
              <i class="fas fa-rocket"></i> Explore Products
            </router-link>
            <router-link to="/forum" class="btn btn-secondary btn-large">
              <i class="fas fa-comments"></i> Join Forum
            </router-link>
          </div>
        </div>
      </div>

      <!-- Products Section -->
      <div class="products-preview" v-if="products.length > 0">
        <div class="container">
          <h2 class="section-title">Latest Products</h2>
          <div class="products-grid">
            <div v-for="product in products" :key="product.id" class="product-card">
              <div class="product-image">
                <img :src="getProductImage(product)" :alt="product.name" @error="handleImageError" />
                <div class="product-overlay">
                  <router-link :to="`/products/${product.id}`" class="btn btn-primary">View Details</router-link>
                </div>
              </div>
              <div class="product-info">
                <h3 :title="product.name">{{ product.name }}</h3>
                <p :title="product.description">{{ truncateDescription(product.description) }}</p>
                <div class="product-price-small">
                  <span class="price-amount">{{ product.priceUsdt || product.price || 0 }} USDT</span>
                </div>
                <div class="product-meta-small">
                  <span class="product-date">
                    <i class="fas fa-calendar"></i> {{ product.date }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="text-center" style="margin-top: 3rem;">
            <router-link to="/products" class="btn btn-secondary">View All Products</router-link>
          </div>
        </div>
      </div>

    </main>
    <AppFooter />
    <PopupNotice />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import PopupNotice from '@/components/common/PopupNotice.vue'
import { primaryProductImage } from '@/utils/productImages'

const products = ref([])

onMounted(async () => {
  try {
    const response = await api.get('/api/products')
    products.value = response.data.slice(0, 3)
  } catch (error) {
    console.error('Failed to fetch products:', error)
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

function truncateDescription(description) {
  if (!description) return ''
  return description.length > 100 ? description.substring(0, 100) + '...' : description
}

function getProductImage(product) {
  return primaryProductImage(product)
}

function truncateContent(content) {
  if (!content) return ''
  return content.length > 120 ? content.substring(0, 120) + '...' : content
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  })
}
</script>
