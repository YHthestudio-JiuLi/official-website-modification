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
              <!-- 一级分类筛选 -->
              <div v-if="parentCategories.length" class="category-bar">
                <span class="category-label">{{ $t('products.filterByCategory') }}</span>
                <div class="category-chips">
                  <button
                    type="button"
                    class="category-chip"
                    :class="{ active: !activeCategorySlug }"
                    @click="setCategory('', '')"
                  >
                    {{ $t('products.allCategories') }}
                  </button>
                  <button
                    v-for="cat in parentCategories"
                    :key="cat.id"
                    type="button"
                    class="category-chip"
                    :class="{ active: activeCategorySlug === cat.slug && !activeSubCategorySlug }"
                    @click="setCategory(cat.slug, '')"
                  >
                    {{ categoryLabel(cat) }}
                  </button>
                </div>
              </div>

              <!-- 二级分类筛选 -->
              <div v-if="activeSubCategories.length" class="category-bar sub-category-bar">
                <span class="category-label">{{ $t('products.filterBySubCategory') }}</span>
                <div class="category-chips">
                  <button
                    type="button"
                    class="category-chip category-chip-sub"
                    :class="{ active: !activeSubCategorySlug }"
                    @click="setCategory(activeCategorySlug, '')"
                  >
                    {{ $t('products.allSubCategories') }}
                  </button>
                  <button
                    v-for="cat in activeSubCategories"
                    :key="cat.id"
                    type="button"
                    class="category-chip category-chip-sub"
                    :class="{ active: activeSubCategorySlug === cat.slug }"
                    @click="setCategory(activeCategorySlug, cat.slug)"
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
import { getParentCategories, getSubCategories } from '@/utils/categorySort'

const route = useRoute()
const router = useRouter()
const { locale } = useI18n()

const products = ref([])
const categories = ref([])
const loading = ref(true)
const loadError = ref(false)

const parentCategories = computed(() => getParentCategories(categories.value))

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

const activeSubCategorySlug = computed(() => {
  const c = route.query.subCategory
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c[0] || ''
  return ''
})

const activeSubCategories = computed(() => {
  if (!activeCategorySlug.value) return []
  const parent = parentCategories.value.find((c) => c.slug === activeCategorySlug.value)
  if (!parent) return []
  return getSubCategories(categories.value, parent.id)
})

const hasActiveFilter = computed(() =>
  !!(searchQ.value.trim() || activeCategorySlug.value || activeSubCategorySlug.value)
)

function categoryLabel(cat) {
  if (locale.value === 'en' && cat.nameEn) return cat.nameEn
  return cat.name
}

const filteredProducts = computed(() => {
  let list = products.value
  const subSlug = activeSubCategorySlug.value
  const slug = activeCategorySlug.value

  if (subSlug) {
    list = list.filter((p) => p.subCategorySlug === subSlug)
  } else if (slug) {
    list = list.filter((p) => p.categorySlug === slug)
  }

  const q = searchQ.value
  if (q.trim()) {
    list = list.filter((p) => productMatchesSearch(p, q))
  }
  return list
})

function setCategory(categorySlug, subCategorySlug) {
  const query = { ...route.query }
  if (categorySlug) {
    query.category = categorySlug
  } else {
    delete query.category
  }
  if (subCategorySlug) {
    query.subCategory = subCategorySlug
  } else {
    delete query.subCategory
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

.sub-category-bar {
  margin-top: -8px;
  padding-left: 12px;
  border-left: 2px solid rgba(0, 212, 255, 0.2);
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

.category-chip-sub {
  font-size: 13px;
  padding: 6px 14px;
  border-color: rgba(255, 0, 170, 0.2);
  background: rgba(255, 0, 170, 0.05);
}

.category-chip:hover {
  border-color: rgba(0, 212, 255, 0.5);
  color: #fff;
}

.category-chip-sub:hover {
  border-color: rgba(255, 0, 170, 0.45);
}

.category-chip.active {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(255, 0, 170, 0.2));
  border-color: rgba(0, 212, 255, 0.6);
  color: #fff;
}

.category-chip-sub.active {
  background: linear-gradient(135deg, rgba(255, 0, 170, 0.22), rgba(0, 212, 255, 0.15));
  border-color: rgba(255, 0, 170, 0.5);
}

.results-info {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 20px;
  color: #8892b0;
  font-size: 14px;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #8892b0;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.load-error {
  text-align: center;
  padding: 60px 20px;
  color: #8892b0;
}

.load-error i {
  font-size: 48px;
  margin-bottom: 16px;
  color: #f87171;
}

.load-error-title {
  font-size: 16px;
}

.loading {
  text-align: center;
  padding: 60px;
  color: #8892b0;
}
</style>
