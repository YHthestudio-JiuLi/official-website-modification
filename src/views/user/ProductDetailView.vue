<template>
  <div>
    <AppHeader />
    <main class="product-detail-main">
      <div class="product-detail-page">
        <div class="container product-detail-main-container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!product" class="empty-state">
            {{ $t('products.detail.notFound') }}
          </div>

          <div v-else class="product-detail-cyber">
            <div v-if="marqueePlainText" class="pdc-alert">
              <div class="pdc-alert-inner">
                <i class="fas fa-bullhorn pdc-alert-icon" aria-hidden="true" />
                <div class="pdc-marquee-clip">
                  <div class="pdc-marquee-track" :style="marqueeTrackStyle">
                    <span class="pdc-marquee-seg">{{ marqueePlainText }}　　</span>
                    <span class="pdc-marquee-seg" aria-hidden="true">{{ marqueePlainText }}　　</span>
                  </div>
                </div>
              </div>
            </div>

            <section class="pdc-hero">
              <div class="pdc-hero-grid">
                <div class="pdc-hero-copy">
                  <h2 class="pdc-hero-title">
                    <template v-if="heroParts">
                      {{ heroParts.prefix }}<span class="pdc-cyan">{{ heroParts.num }}</span>{{ heroParts.suffix }}
                    </template>
                    <template v-else>
                      <span class="pdc-cyan">{{ product.name }}</span>
                    </template>
                  </h2>
                  <p class="pdc-hero-desc">{{ product.description || $t('products.detail.noDescription') }}</p>

                  <ProductConfigPicker
                    v-if="productConfigs.length"
                    id="pdc-config-picker"
                    v-model="selectedConfigId"
                    :configs="productConfigs"
                    :highlight="configPickerHighlight"
                    variant="hero"
                    key-prefix="hero-"
                    @update:model-value="onConfigSelected"
                  />

                  <div class="pdc-hero-actions">
                    <button
                      type="button"
                      class="pdc-btn pdc-btn-usdt"
                      :disabled="buySubmitting"
                      @click="onBuyNowClick"
                    >
                      <i class="fas fa-shopping-cart" />
                      {{ buyNowLabel }}
                    </button>
                    <router-link to="/products" class="pdc-btn pdc-btn-outline">
                      <i class="fas fa-list" /> {{ $t('products.detail.moreProducts') }}
                    </router-link>
                  </div>
                </div>
                <div class="pdc-hero-visual">
                  <div class="pdc-float-wrap">
                    <div class="pdc-img-frame pdc-img-frame-cyan">
                      <img :src="heroDisplayImage" :alt="product.name" @error="handleImageError" />
                    </div>
                  </div>
                  <div v-if="galleryImages.length > 1" class="pdc-thumb-strip-wrap">
                    <div class="pdc-thumb-strip" role="listbox" :aria-label="$t('products.detail.galleryThumbLabel')">
                      <button
                        v-for="(src, idx) in galleryImages"
                        :key="'thumb-' + idx"
                        type="button"
                        class="pdc-thumb"
                        :class="{ active: selectedGalleryIndex === idx }"
                        role="option"
                        :aria-selected="selectedGalleryIndex === idx"
                        @click="selectGalleryImage(idx)"
                      >
                        <img
                          :src="src"
                          :alt="$t('products.detail.galleryAlt', { name: product.name, n: idx + 1 })"
                          @error="handleImageError"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section v-if="displayFeatureCards.length" class="pdc-section">
              <div class="pdc-section-head">
                <h2 class="pdc-h2">
                  <span class="pdc-cyan">{{ $t('products.detail.coreTitleCyan') }}</span>
                  <span class="pdc-pink">{{ $t('products.detail.coreTitlePink') }}</span>
                </h2>
              </div>
              <div class="pdc-feature-grid">
                <div
                  v-for="(item, idx) in displayFeatureCards"
                  :key="idx"
                  class="pdc-feature-card"
                  :class="'tone-' + (idx % 3)"
                >
                  <div class="pdc-feature-icon">
                    <i :class="featureIconClass(item)" />
                  </div>
                  <h3 class="pdc-feature-title">{{ item.title }}</h3>
                  <p class="pdc-feature-desc">{{ item.description }}</p>
                </div>
              </div>
            </section>

            <section v-if="showSpecsSection" id="specs" class="pdc-section pdc-section-specs">
              <div v-if="displaySpecCards.length" class="pdc-specs-panel">
                <div class="pdc-specs-panel-head">
                  <h2 class="pdc-specs-title">{{ $t('products.detail.specsTitle') }}</h2>
                </div>
                <div class="pdc-specs-grid">
                  <div
                    v-for="(item, idx) in displaySpecCards"
                    :key="'sp' + idx"
                    class="pdc-spec-card"
                  >
                    <div class="pdc-spec-card-icon" aria-hidden="true">
                      <i :class="specIconClass(item)" />
                    </div>
                    <div class="pdc-spec-card-body">
                      <div class="pdc-spec-card-label">{{ item.title }}</div>
                      <div class="pdc-spec-card-value">{{ item.description }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="displayUsageNoticeLines.length" class="pdc-spec-notice-below">
                  <ProductUsageNotice :lines="displayUsageNoticeLines" key-prefix="un-" />
                </div>
              </div>
              <div v-else-if="displayUsageNoticeLines.length" class="pdc-spec-notice-only">
                <ProductUsageNotice :lines="displayUsageNoticeLines" key-prefix="uo-" />
              </div>
            </section>

            <section class="pdc-section pdc-section-last">
              <div class="pdc-pricing-wrap">
                <div class="pdc-price-card">
                  <div class="pdc-price-ribbon">{{ $t('products.detail.currentProductRibbon') }}</div>
                  <h3 class="pdc-price-name">{{ product.name }}</h3>

                  <div v-if="productConfigs.length && selectedConfig" class="pdc-price-config-summary">
                    <span class="pdc-price-config-name">{{ selectedConfig.name }}</span>
                  </div>
                  <p v-else-if="productConfigs.length" class="pdc-price-config-hint">
                    {{ $t('products.detail.selectConfigHint') }}
                  </p>

                  <div
                    v-if="!productConfigs.length || selectedConfig"
                    class="pdc-price-single"
                    :class="{ 'pdc-price-single-cny': primaryPriceKind === 'cny' }"
                  >
                    {{ primaryPriceText }}
                  </div>
                  <div v-if="displayFeatureCards.length" class="pdc-price-core">
                    <p class="pdc-price-core-title">{{ $t('products.detail.priceCoreTitle') }}</p>
                    <ul class="pdc-price-features">
                      <li v-for="(item, idx) in displayFeatureCards" :key="'pfc' + idx">
                        <i class="fas fa-check" />
                        <span>
                          <template v-if="item.title">
                            <strong>{{ item.title }}</strong>
                            <template v-if="item.description">{{ $t('products.detail.listColon') }}{{ item.description }}</template>
                          </template>
                          <template v-else>{{ item.description }}</template>
                        </span>
                      </li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    class="pdc-btn pdc-btn-buy"
                    :disabled="buySubmitting"
                    @click="onBuyNowClick"
                  >
                    <i class="fas fa-shopping-cart" />
                    {{ buyNowLabel }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as catalogApi from '@/services/catalog'
import { fetchDisplayNotice, fetchDisplayNoticeFresh } from '@/services/popup'
import { subscribePopupNoticeUpdated } from '@/utils/popupNoticeSync'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ProductConfigPicker from '@/components/user/ProductConfigPicker.vue'
import ProductUsageNotice from '@/components/user/ProductUsageNotice.vue'
import { useProductCheckout } from '@/composables/useProductCheckout'
import { useProductDetailPresentation } from '@/composables/useProductDetailPresentation'

const route = useRoute()
const router = useRouter()
const product = ref(null)
const loading = ref(true)
const popupNotice = ref(null)

const {
  selectedConfigId,
  configExplicitlySelected,
  configPickerHighlight,
  buySubmitting,
  productConfigs,
  selectedConfig,
  buyNowLabel,
  resetCheckoutLocks,
  resetConfigState,
  onConfigSelected,
  restoreConfigFromQuery,
  onBuyNowClick,
} = useProductCheckout({ route, router, product, loading })

const {
  selectedGalleryIndex,
  galleryImages,
  heroDisplayImage,
  selectGalleryImage,
  resetGallery,
  marqueePlainText,
  marqueeTrackStyle,
  heroParts,
  primaryPriceKind,
  primaryPriceText,
  displayFeatureCards,
  displaySpecCards,
  displayUsageNoticeLines,
  showSpecsSection,
  featureIconClass,
  specIconClass,
} = useProductDetailPresentation({
  product,
  popupNotice,
  productConfigs,
  selectedConfig,
  configExplicitlySelected,
})

async function fetchPopupNotice({ fresh = false } = {}) {
  try {
    const res = await (fresh ? fetchDisplayNoticeFresh() : fetchDisplayNotice())
    popupNotice.value = res.data?.notice || null
  } catch (_e) {
    popupNotice.value = null
  }
}

async function loadProduct() {
  loading.value = true
  product.value = null
  resetGallery()
  resetConfigState()
  try {
    const response = await catalogApi.getProduct(route.params.id)
    product.value = response.data
    restoreConfigFromQuery(route.query.configId)
  } catch (error) {
    console.error('Failed to fetch product:', error)
  } finally {
    loading.value = false
  }
}

async function reloadPage() {
  resetCheckoutLocks()
  await Promise.all([loadProduct(), fetchPopupNotice()])
}

watch(
  () => route.params.id,
  () => {
    reloadPage()
  },
  { immediate: true }
)

let unsubscribePopupNoticeSync = null
onMounted(() => {
  unsubscribePopupNoticeSync = subscribePopupNoticeUpdated(() => {
    fetchPopupNotice({ fresh: true })
  })
})
onUnmounted(() => {
  unsubscribePopupNoticeSync?.()
})

function handleImageError(e) {
  e.target.src =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
        '<rect fill="#0b0f15" width="100%" height="100%"/>' +
        '<text x="50%" y="50%" fill="#00f3ff" font-family="Arial" font-size="18" text-anchor="middle" dy=".3em">No Image</text>' +
        '</svg>'
    )
}
</script>

<style scoped src="./product-detail-view.css"></style>
