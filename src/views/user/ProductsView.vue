<template>
  <div>
    <AppHeader />
    <main class="products-list-main">
      <div class="products-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else>
            <div v-if="loadError" class="load-error">
              <i class="fas fa-plug" />
              <p class="load-error-title">{{ $t('products.loadFailed') }}</p>
            </div>

            <template v-if="!loadError">
              <!-- 分类筛选 -->
              <div v-if="categories.length" class="category-bar">
                <span class="category-label">{{ $t('products.filterByCategory') }}</span>
                <div class="category-chips">
                  <button
                    type="button"
                    class="category-chip"
                    :class="{ active: !activeCategorySlug }"
                    @click="setCategory('')"
                  >
                    {{ $t('products.allCategories') }}
                  </button>
                  <button
                    v-for="cat in categories"
                    :key="cat.id"
                    type="button"
                    class="category-chip"
                    :class="{ active: activeCategorySlug === cat.slug }"
                    @click="setCategory(cat.slug)"
                  >
                    {{ categoryLabel(cat) }}
                  </button>
                </div>
              </div>

              <div class="results-info" v-if="filteredProducts.length > 0">
                <span>{{ filteredProducts.length }} / {{ products.length }} {{ $t('products.results') }}</span>
              </div>

              <div v-if="filteredProducts.length === 0" class="empty-state">
                <i :class="hasActiveFilter ? 'fas fa-search' : 'fas fa-box-open'" />
                <p>{{ hasActiveFilter ? $t('products.noResults') : $t('products.empty') }}</p>
              </div>

              <div v-else class="products-grid">
                <ProductCard
                  v-for="product in filteredProducts"
                  :key="product.id"
                  :product="product"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ProductCard from '@/components/user/ProductCard.vue'
import { productMatchesSearch } from '@/utils/productSearch'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const products = ref([])
const categories = ref([])
const loading = ref(true)
const loadError = ref(false)

const searchQ = computed(() => {
  const q = route.query.q
  if (typeof q === 'string') return q
  if (Array.isArray(q)) return q[0] || ''
  return ''
})

const activeCategorySlug = computed(() => {
  const c = route.query.category
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c[0] || ''
  return ''
})

const hasActiveFilter = computed(() => !!(searchQ.value.trim() || activeCategorySlug.value))

function categoryLabel(cat) {
  if (locale.value === 'en' && cat.nameEn) return cat.nameEn
  return cat.name
}

const filteredProducts = computed(() => {
  let list = products.value
  const slug = activeCategorySlug.value
  if (slug) {
    list = list.filter((p) => p.categorySlug === slug)
  }
  const q = searchQ.value
  if (q.trim()) {
    list = list.filter((p) => productMatchesSearch(p, q))
  }
  return list
})

function setCategory(slug) {
  const query = { ...route.query }
  if (slug) {
    query.category = slug
  } else {
    delete query.category
  }
  router.push({ path: route.path, query })
}

onMounted(async () => {
  loadError.value = false
  try {
    const [productsRes, categoriesRes] = await Promise.all([
      api.get('/api/products'),
      api.get('/api/product-categories')
    ])
    products.value = productsRes.data
    categories.value = categoriesRes.data || []
  } catch (error) {
    console.error('Failed to fetch products:', error)
    loadError.value = true
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.products-list-main {
  background: #0b0f15;
}

.products-page {
  padding: 28px 0 40px;
  min-height: 60vh;
}

.category-bar {
  margin-bottom: 20px;
}

.category-label {
  display: block;
  font-size: 13px;
  color: #8892b0;
  margin-bottom: 10px;
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.category-chip {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(0, 212, 255, 0.25);
  background: rgba(0, 212, 255, 0.06);
  color: #b8c5e0;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-chip:hover {
  border-color: rgba(0, 212, 255, 0.5);
  color: #fff;
}

.category-chip.active {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(255, 0, 170, 0.2));
  border-color: rgba(0, 212, 255, 0.6);
  color: #fff;
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
