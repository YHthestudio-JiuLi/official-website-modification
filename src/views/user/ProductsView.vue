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

          <div v-else>
            <!-- 搜索和筛选栏 -->
            <div class="search-filter-bar">
              <div class="search-box">
                <i class="fas fa-search"></i>
                <input
                  type="text"
                  v-model="searchQuery"
                  :placeholder="$t('products.searchPlaceholder')"
                  @input="filterProducts"
                />
              </div>
              <div class="filter-box">
                <select v-model="sortOrder" @change="filterProducts">
                  <option value="default">{{ $t('products.sort.default') }}</option>
                  <option value="price-asc">{{ $t('products.sort.priceAsc') }}</option>
                  <option value="price-desc">{{ $t('products.sort.priceDesc') }}</option>
                  <option value="name-asc">{{ $t('products.sort.nameAsc') }}</option>
                  <option value="date-desc">{{ $t('products.sort.dateDesc') }}</option>
                </select>
              </div>
            </div>

            <!-- 结果统计 -->
            <div class="results-info" v-if="filteredProducts.length > 0">
              <span>{{ filteredProducts.length }} / {{ products.length }} {{ $t('products.results') }}</span>
            </div>

            <!-- 空状态 -->
            <div v-if="filteredProducts.length === 0" class="empty-state">
              <i class="fas fa-search"></i>
              <p>{{ $t('products.noResults') }}</p>
            </div>

            <!-- 产品列表 -->
            <div v-else class="products-grid">
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
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ProductCard from '@/components/user/ProductCard.vue'

const products = ref([])
const filteredProducts = ref([])
const loading = ref(true)
const searchQuery = ref('')
const sortOrder = ref('default')

onMounted(async () => {
  try {
    const response = await api.get('/api/products')
    products.value = response.data
    filteredProducts.value = response.data
  } catch (error) {
    console.error('Failed to fetch products:', error)
  } finally {
    loading.value = false
  }
})

function filterProducts() {
  let result = [...products.value]

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase()
    result = result.filter(product =>
      product.name.toLowerCase().includes(query) ||
      (product.description && product.description.toLowerCase().includes(query))
    )
  }

  // 排序
  switch (sortOrder.value) {
    case 'price-asc':
      result.sort((a, b) => (a.priceUsdt || a.price || 0) - (b.priceUsdt || b.price || 0))
      break
    case 'price-desc':
      result.sort((a, b) => (b.priceUsdt || b.price || 0) - (a.priceUsdt || a.price || 0))
      break
    case 'name-asc':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'date-desc':
      result.sort((a, b) => new Date(b.date) - new Date(a.date))
      break
  }

  filteredProducts.value = result
}
</script>

<style scoped>
.products-page {
  padding: 40px 0;
  min-height: 60vh;
}

.search-filter-bar {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 250px;
  position: relative;
}

.search-box i {
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
  color: #8892b0;
}

.search-box input {
  width: 100%;
  padding: 12px 15px 12px 45px;
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid #233554;
  border-radius: 8px;
  color: #e6f1ff;
  font-size: 14px;
  transition: all 0.3s;
}

.search-box input:focus {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.filter-box select {
  padding: 12px 20px;
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid #233554;
  border-radius: 8px;
  color: #e6f1ff;
  font-size: 14px;
  cursor: pointer;
  min-width: 180px;
  transition: all 0.3s;
}

.filter-box select:focus {
  outline: none;
  border-color: #00d4ff;
}

.results-info {
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

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 30px;
}

@media (max-width: 768px) {
  .search-filter-bar {
    flex-direction: column;
  }

  .search-box,
  .filter-box {
    width: 100%;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
  }
}
</style>
