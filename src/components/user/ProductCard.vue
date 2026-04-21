<template>
  <router-link
    :to="{ name: 'product-detail', params: { id: String(product.id) } }"
    class="product-card product-card-link"
  >
    <div class="product-image">
      <img
        :src="currentImage"
        :alt="product.name"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseProductImages } from '@/utils/productImages'

const props = defineProps({
  product: {
    type: Object,
    required: true
  }
})

const imageIndex = ref(0)
const imageTimer = ref(null)
const imageList = computed(() => parseProductImages(props.product?.image, props.product?.images))
const currentImage = computed(() => imageList.value[imageIndex.value] || '')

const truncatedDescription = computed(() => {
  const desc = props.product.description
  return desc && desc.length > 100 ? desc.substring(0, 100) + '...' : desc
})

function startImageRotation() {
  if (imageTimer.value) {
    clearInterval(imageTimer.value)
    imageTimer.value = null
  }
  imageIndex.value = 0
  if (imageList.value.length <= 1) return
  imageTimer.value = setInterval(() => {
    imageIndex.value = (imageIndex.value + 1) % imageList.value.length
  }, 2500)
}

watch(imageList, startImageRotation, { immediate: true })
onMounted(startImageRotation)
onBeforeUnmount(() => {
  if (imageTimer.value) clearInterval(imageTimer.value)
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
