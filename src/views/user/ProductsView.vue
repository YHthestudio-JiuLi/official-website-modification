<template>
  <div>
    <AppHeader />
    <main class="products-list-main">
      <div class="products-page">
        <!-- 与顶栏、页脚共用 .container（--layout-content-*），统计行与卡片网格左缘对齐 -->
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else>
            <!-- 接口失败时避免与「无搜索结果」混淆 -->
            <div v-if="loadError" class="load-error">
              <i class="fas fa-plug" />
              <p class="load-error-title">{{ $t('products.loadFailed') }}</p>
            </div>

            <!-- 结果统计 -->
            <div class="results-info" v-if="!loadError && filteredProducts.length > 0">
              <span>{{ filteredProducts.length }} / {{ products.length }} {{ $t('products.results') }}</span>
            </div>

            <!-- 空状态：仅请求成功后才展示「无结果 / 无商品」 -->
            <div v-if="!loadError && filteredProducts.length === 0" class="empty-state">
              <i :class="searchQ.trim() ? 'fas fa-search' : 'fas fa-box-open'" />
              <p>{{ searchQ.trim() ? $t('products.noResults') : $t('products.empty') }}</p>
            </div>

            <!-- 产品列表 -->
            <div v-else-if="!loadError" class="products-grid">
              <ProductCard
                v-for="product in filteredProducts"
                :key="product.id"
                :product="product"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ProductCard from '@/components/user/ProductCard.vue'
import { productMatchesSearch } from '@/utils/productSearch'

const route = useRoute()
const products = ref([])
const loading = ref(true)
/** 列表接口失败，与「库里无商品」区分 */
const loadError = ref(false)

const searchQ = computed(() => {
  const q = route.query.q
  if (typeof q === 'string') return q
  if (Array.isArray(q)) return q[0] || ''
  return ''
})

const filteredProducts = computed(() => {
  const list = products.value
  const q = searchQ.value
  if (!q.trim()) return list
  return list.filter((p) => productMatchesSearch(p, q))
})

onMounted(async () => {
  loadError.value = false
  try {
    const response = await api.get('/api/products')
    products.value = response.data
  } catch (error) {
    console.error('Failed to fetch products:', error)
    loadError.value = true
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* 与商品详情、顶栏同系底色，避免主区与导航之间色差线 */
.products-list-main {
  background: #0b0f15;
}

.products-page {
  padding: 28px 0 40px;
  min-height: 60vh;
}

.results-info {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 20px;
  color: #8892b0;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #8892b0;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 15px;
  display: block;
  opacity: 0.5;
}

.load-error {
  text-align: center;
  padding: 32px 20px 48px;
  color: #f0a96e;
  border: 1px solid rgba(240, 169, 110, 0.35);
  border-radius: 12px;
  background: rgba(240, 169, 110, 0.06);
  margin-bottom: 24px;
}
.load-error i {
  font-size: 40px;
  margin-bottom: 12px;
  display: block;
  opacity: 0.9;
}
.load-error-title {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: #f5c09a;
}

.products-grid {
  width: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 22px;
}

@media (max-width: 768px) {
  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
  }
}
</style>
