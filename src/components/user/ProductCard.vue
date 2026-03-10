<template>
  <div class="product-card">
    <div class="product-image">
      <img
        :src="product.image"
        :alt="product.name"
        @error="handleImageError"
      />
      <div class="product-overlay">
        <router-link :to="`/products/${product.id}`" class="btn btn-primary">
          {{ $t('products.viewDetails') }}
        </router-link>
      </div>
    </div>
    <div class="product-info">
      <h3 :title="product.name">{{ product.name }}</h3>
      <p :title="product.description">{{ truncatedDescription }}</p>
      <div class="product-price-small">
        <span class="price-amount">{{ product.priceUsdt || product.price || 0 }} USDT</span>
      </div>
      <div class="product-meta-small">
        <span class="product-date">
          <i class="fas fa-calendar"></i> {{ product.date }}
        </span>
      </div>
      <div class="product-actions">
        <button class="btn btn-secondary btn-sm" @click="addToCart" :class="{ 'added': isInCart }">
          <i class="fas" :class="isInCart ? 'fas fa-check' : 'fas fa-cart-plus'"></i>
          {{ isInCart ? $t('products.added') : $t('products.addToCart') }}
        </button>
        <router-link :to="`/products/${product.id}/buy`" class="btn btn-primary btn-sm">
          <i class="fas fa-bolt"></i> {{ $t('products.buyNow') }}
        </router-link>
      </div>
    </div>
    
    <!-- 添加成功提示 -->
    <div v-if="showAddedToast" class="added-toast">
      <i class="fas fa-check-circle"></i>
      <span>{{ $t('products.addedToCart') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  product: {
    type: Object,
    required: true
  }
})

const router = useRouter()
const route = useRoute()
const cartStore = useCartStore()
const authStore = useAuthStore()

const showAddedToast = ref(false)
const isInCart = computed(() => cartStore.isInCart(props.product.id))

const truncatedDescription = computed(() => {
  const desc = props.product.description
  return desc && desc.length > 100 ? desc.substring(0, 100) + '...' : desc
})

async function addToCart() {
  // 检查是否登录
  if (!authStore.isLoggedIn) {
    // 保存当前页面路径，登录后跳转回来
    router.push({
      name: 'login',
      query: { redirect: route.fullPath }
    })
    return
  }

  const result = await cartStore.addItem(props.product)
  if (result.success) {
    // 根据是否已在购物车中显示不同的提示
    if (result.wasInCart) {
      // 商品已在购物车中，数量已更新
      showAddedToast.value = true
      setTimeout(() => {
        showAddedToast.value = false
      }, 2000)
    } else {
      // 商品已添加到购物车
      showAddedToast.value = true
      setTimeout(() => {
        showAddedToast.value = false
      }, 2000)
    }
  } else {
    // 显示错误提示
    alert(result.error || 'Failed to add item to cart')
  }
}

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect fill="#1a1f3a" width="400" height="300"/>
      <text fill="#667eea" font-family="sans-serif" font-size="48" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">
        <tspan x="200" y="135">📷</tspan>
        <tspan x="200" y="180" font-size="14">Image not available</tspan>
      </text>
    </svg>
  `)
}
</script>