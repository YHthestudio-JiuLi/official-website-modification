<template>
  <router-link
    :to="{ name: 'product-detail', params: { id: String(product.id) } }"
    class="product-card product-card-link"
  >
    <div class="product-image">
      <img
        v-if="coverImage"
        :src="coverImage"
        :alt="product.name"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        @error="handleImageError"
      />
    </div>
    <div class="product-info">
      <h3 :title="product.name">{{ product.name }}</h3>
      <p :title="product.description">{{ truncatedDescription }}</p>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { primaryProductImage } from '@/utils/productImages'

const props = defineProps({
  product: {
    type: Object,
    required: true
  }
})

/** 列表卡片仅展示封面，避免多图轮播触发大量 /api/v2/product-images 并发 */
const coverImage = computed(() => primaryProductImage(props.product))

const truncatedDescription = computed(() => {
  const desc = props.product.description
  return desc && desc.length > 100 ? desc.substring(0, 100) + '...' : desc
})

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
