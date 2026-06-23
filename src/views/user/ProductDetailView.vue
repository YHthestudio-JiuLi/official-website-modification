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
            <!-- 公告横幅：与弹窗公告同源，横向滚动展示 -->
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

            <!-- 英雄区 -->
            <section class="pdc-hero">
              <div class="pdc-hero-grid">
                <div class="pdc-hero-copy">
                  <!-- 单行标题：商品名已足够，避免与下方描述重复堆叠 -->
                  <h2 class="pdc-hero-title">
                    <template v-if="heroParts">
                      {{ heroParts.prefix }}<span class="pdc-cyan">{{ heroParts.num }}</span>{{ heroParts.suffix }}
                    </template>
                    <template v-else>
                      <span class="pdc-cyan">{{ product.name }}</span>
                    </template>
                  </h2>
                  <p class="pdc-hero-desc">{{ product.description || $t('products.detail.noDescription') }}</p>
                  <div class="pdc-hero-actions">
                    <button
                      type="button"
                      class="pdc-btn pdc-btn-usdt"
                      :disabled="buySubmitting"
                      @click="onBuyNowClick"
                    >
                      <i class="fas fa-shopping-cart" />
                      {{ buySubmitting ? $t('products.detail.buyProcessing') : $t('products.detail.buyNow') }}
                    </button>
                    <router-link to="/products" class="pdc-btn pdc-btn-outline">
                      <i class="fas fa-list" /> {{ $t('products.detail.moreProducts') }}
                    </router-link>
                  </div>
                </div>
                <!-- 单图时主图只在英雄区展示；无图时仍保留占位框 -->
                <div class="pdc-hero-visual">
                  <div class="pdc-float-wrap">
                    <div class="pdc-img-frame pdc-img-frame-cyan">
                      <img :src="heroCoverImage" :alt="product.name" @error="handleImageError" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 核心功能：后台未配置功能卡时不渲染本区块 -->
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

            <!-- 产品展示：仅当有多张图时显示（首张已在英雄区）；其余图自上而下铺开，无副标题文案 -->
            <section v-if="galleryExtraImages.length > 0" class="pdc-section">
              <div class="pdc-section-head">
                <h2 class="pdc-h2">
                  <span class="pdc-pink">{{ $t('products.detail.galleryTitlePink') }}</span>
                  <span class="pdc-cyan">{{ $t('products.detail.galleryTitleCyan') }}</span>
                </h2>
              </div>
              <div class="pdc-gallery-stack">
                <div
                  v-for="(src, idx) in galleryExtraImages"
                  :key="'gal' + idx"
                  class="pdc-gallery-stack-item"
                >
                  <div
                    class="pdc-img-frame"
                    :class="idx % 2 === 0 ? 'pdc-img-frame-cyan' : 'pdc-img-frame-pink'"
                  >
                    <img
                      :src="src"
                      :alt="$t('products.detail.galleryAlt', { name: product.name, n: idx + 2 })"
                      @error="handleImageError"
                    />
                  </div>
                </div>
              </div>
            </section>

            <!-- 技术规格 / 重要说明：后台均未配置时不渲染；重要说明可单独存在 -->
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
                  <div class="pdc-spec-notice-panel">
                    <div class="pdc-spec-notice-head">
                      <span class="pdc-spec-notice-ico-wrap" aria-hidden="true">
                        <!-- 对齐参考稿：品红圆内白色感叹号（非 i 信息标） -->
                        <i class="fas fa-exclamation pdc-spec-notice-head-ico" />
                      </span>
                      <h3 class="pdc-spec-notice-title">{{ $t('products.detail.noticeTitle') }}</h3>
                    </div>
                    <ul class="pdc-spec-notice-list">
                      <li v-for="(row, nidx) in displayUsageNoticeLines" :key="'un' + nidx">
                        <i
                          :class="
                            row.mode === 'ban'
                              ? 'fas fa-ban pdc-spec-notice-ban'
                              : 'fas fa-check pdc-spec-notice-check'
                          "
                        />
                        <span :class="{ 'pdc-spec-notice-warn': row.mode === 'ban' }">{{ row.text }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div v-else-if="displayUsageNoticeLines.length" class="pdc-spec-notice-only">
                <div class="pdc-spec-notice-panel">
                  <div class="pdc-spec-notice-head">
                    <span class="pdc-spec-notice-ico-wrap" aria-hidden="true">
                      <i class="fas fa-exclamation pdc-spec-notice-head-ico" />
                    </span>
                    <h3 class="pdc-spec-notice-title">{{ $t('products.detail.noticeTitle') }}</h3>
                  </div>
                  <ul class="pdc-spec-notice-list">
                    <li v-for="(row, nidx) in displayUsageNoticeLines" :key="'uo' + nidx">
                      <i
                        :class="
                          row.mode === 'ban'
                            ? 'fas fa-ban pdc-spec-notice-ban'
                            : 'fas fa-check pdc-spec-notice-check'
                        "
                      />
                      <span :class="{ 'pdc-spec-notice-warn': row.mode === 'ban' }">{{ row.text }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- 价格与 USDT 说明 -->
            <section class="pdc-section pdc-section-last">
              <div class="pdc-section-head">
                <h2 class="pdc-h2">
                  <span class="pdc-pink">{{ $t('products.detail.planTitlePink') }}</span>
                  <span class="pdc-cyan">{{ $t('products.detail.planTitleCyan') }}</span>
                </h2>
                <div class="pdc-usdt-pill">
                  <i class="fas fa-coins" />
                  <span>{{ $t('products.detail.usdtOnly') }}</span>
                </div>
              </div>
              <div class="pdc-pricing-wrap">
                <div class="pdc-price-card">
                  <div class="pdc-price-ribbon">{{ $t('products.detail.currentProductRibbon') }}</div>
                  <h3 class="pdc-price-name">{{ product.name }}</h3>
                  <!-- 仅展示一个主价格：有 USDT 价则优先 USDT，否则人民币 -->
                  <div
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
                    {{ buySubmitting ? $t('products.detail.buyProcessing') : $t('products.detail.buyNow') }}
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
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import * as catalogApi from '@/services/catalog'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import { parseProductImages } from '@/utils/productImages'
import { useAuthStore } from '@/stores/auth'
import { startProductCheckout } from '@/utils/productCheckout'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const product = ref(null)
const loading = ref(true)
const buySubmitting = ref(false)
/** 未登录时由 ?checkout=1 触发过一次跳转登录，避免 watch 重复 replace */
const checkoutLoginRedirectLock = ref(false)
/** 登录回来自动下单只执行一次（成功后会清 query 并离开页面） */
const checkoutSubmitLock = ref(false)
/** 与弹窗公告接口同源，用于顶部滚动条 */
const popupNotice = ref(null)

const galleryImages = computed(() =>
  parseProductImages(product.value?.image, product.value?.images)
)

/** 主图固定为封面（首张），不轮播 */
const heroCoverImage = computed(() => galleryImages.value[0] || '')

/** 除首张外的图片：用于「产品展示」纵向列表（仅一张图时不渲染该区块） */
const galleryExtraImages = computed(() => {
  const arr = galleryImages.value
  if (!arr.length || arr.length <= 1) return []
  return arr.slice(1)
})

/** 弹窗公告正文去标签后拼标题，供跑马灯使用 */
function stripHtmlForMarquee(html) {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

const marqueePlainText = computed(() => {
  const n = popupNotice.value
  if (!n) return ''
  const title = String(n.title || '').trim()
  const body = stripHtmlForMarquee(String(n.content || ''))
  if (title && body) return t('products.detail.noticeMarqueeBoth', { title, body })
  return title || body
})

/** 字数多则滚得慢一些，避免看不清 */
const marqueeTrackStyle = computed(() => {
  const len = marqueePlainText.value.length
  const sec = Math.min(100, Math.max(22, len * 0.32))
  return { animationDuration: `${sec}s` }
})

/** 标题中「前缀+数字+后缀」拆字高亮，对齐参考稿 YH01 样式 */
const heroParts = computed(() => {
  const name = product.value?.name || ''
  const m = name.match(/^(.+?)(\d+)(.*)$/)
  if (m) return { prefix: m[1], num: m[2], suffix: m[3] }
  return null
})

/** 卡片内主价格：有 USDT 则只显示 USDT，否则只显示人民币 */
const primaryPriceKind = computed(() => {
  const p = product.value
  if (!p) return 'none'
  const usdtRaw = p.priceUsdt
  const usdtNum = usdtRaw != null && usdtRaw !== '' ? Number(usdtRaw) : NaN
  if (Number.isFinite(usdtNum) && usdtNum > 0) return 'usdt'
  const cny = p.price
  if (cny != null && cny !== '' && Number(cny) > 0) return 'cny'
  return 'none'
})

const primaryPriceText = computed(() => {
  const p = product.value
  if (!p) return t('products.detail.dash')
  const k = primaryPriceKind.value
  if (k === 'usdt') return `${Number(p.priceUsdt)} USDT`
  if (k === 'cny') return `¥${p.price}`
  return t('products.detail.priceTbd')
})

/** 仅使用接口返回的 featureCards（后台 featuresJson） */
const displayFeatureCards = computed(() => {
  const raw = product.value?.featureCards
  if (!Array.isArray(raw) || !raw.length) return []
  return raw
    .map((c) => ({
      title: String(c.title || '').trim(),
      description: String(c.description || '').trim(),
      icon: typeof c.icon === 'string' ? c.icon.trim() : ''
    }))
    .filter((c) => c.title || c.description)
    .slice(0, 12)
})

/** Font Awesome 图标 class：支持 "fa-camera" 或 "fa-solid fa-camera" */
function featureIconClass(item) {
  const ic = (item.icon || 'fa-star').trim()
  if (!ic) return ['fas', 'fa-star']
  if (/\s/.test(ic)) return ic.split(/\s+/).filter(Boolean)
  return ['fas', ic.startsWith('fa-') ? ic : `fa-${ic}`]
}

/** 规格卡图标（默认芯片，与功能卡区分） */
function specIconClass(item) {
  const ic = (item.icon || '').trim()
  if (!ic) return ['fas', 'fa-microchip']
  return featureIconClass({ ...item, icon: ic })
}

/** 技术规格卡：仅使用接口返回的 specCards（后台 specsJson） */
const displaySpecCards = computed(() => {
  const raw = product.value?.specCards
  if (!Array.isArray(raw) || !raw.length) return []
  return raw
    .map((c) => ({
      title: String(c.title || '').trim(),
      description: String(c.description || '').trim(),
      icon: typeof c.icon === 'string' ? c.icon.trim() : ''
    }))
    .filter((c) => c.title || c.description)
    .slice(0, 12)
})

/** 重要说明：接口 usageNoticeLines（后台 usageNoticeJson） */
const displayUsageNoticeLines = computed(() => {
  const raw = product.value?.usageNoticeLines
  if (!Array.isArray(raw) || !raw.length) return []
  return raw
    .map((r) => ({
      text: String(r.text || '').trim(),
      mode: r.mode === 'ban' ? 'ban' : 'check'
    }))
    .filter((r) => r.text)
    .slice(0, 20)
})

/** 规格区：有规格卡或重要说明之一即展示锚点区块 */
const showSpecsSection = computed(
  () => displaySpecCards.value.length > 0 || displayUsageNoticeLines.value.length > 0
)

async function fetchPopupNotice() {
  try {
    const res = await api.get('/api/popup-notice')
    popupNotice.value = res.data?.notice || null
  } catch (_e) {
    popupNotice.value = null
  }
}

async function loadProduct() {
  loading.value = true
  product.value = null
  try {
    const response = await catalogApi.getProduct(route.params.id)
    product.value = response.data
  } catch (error) {
    console.error('Failed to fetch product:', error)
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    checkoutLoginRedirectLock.value = false
    checkoutSubmitLock.value = false
    loadProduct()
    fetchPopupNotice()
  },
  { immediate: true }
)

/** 登录后回到带 ?checkout=1 的商品页：自动创建订单并进入支付 */
watch(
  () => [route.query.checkout, loading.value, product.value?.id, route.params.id, authStore.isLoggedIn],
  async () => {
    if (String(route.query.checkout || '') !== '1') {
      checkoutLoginRedirectLock.value = false
      checkoutSubmitLock.value = false
      return
    }
    if (loading.value) return
    if (!product.value?.id || String(product.value.id) !== String(route.params.id)) return

    if (!authStore.isLoggedIn) {
      if (checkoutLoginRedirectLock.value) return
      checkoutLoginRedirectLock.value = true
      await router.replace({
        name: 'login',
        query: { redirect: route.fullPath }
      })
      return
    }

    if (checkoutSubmitLock.value) return
    checkoutSubmitLock.value = true
    try {
      const res = await api.post('/api/orders', {
        productId: product.value.id,
        quantity: 1
      })
      await router.replace({
        name: 'product-detail',
        params: { id: String(route.params.id) },
        query: {}
      })
      await router.push({
        name: 'payment',
        params: { id: String(res.data.orderId) }
      })
    } catch (e) {
      console.error(e)
      checkoutSubmitLock.value = false
      await router.replace({
        name: 'product-detail',
        params: { id: String(route.params.id) },
        query: {}
      })
      alert(t('products.detail.checkoutErrorRetry'))
    }
  },
  { flush: 'post' }
)

/** 立即购买：已登录直接下单进支付；未登录先进登录再回来自动下单 */
async function onBuyNowClick() {
  if (!product.value?.id || buySubmitting.value) return
  buySubmitting.value = true
  try {
    await startProductCheckout(router, product.value.id)
  } catch (e) {
    console.error(e)
    alert(t('products.detail.checkoutErrorAuth'))
  } finally {
    buySubmitting.value = false
  }
}

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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Roboto+Mono:wght@400;500&display=swap');

/* 赛博配色（对齐参考稿 tailwind 扩展色） */
.product-detail-cyber {
  --pdc-cyan: #00f3ff;
  --pdc-pink: #ff00ff;
  --pdc-purple: #9d00ff;
  /* 页面基底色：与外层 main、页脚衔接区一致 */
  --pdc-dark: #0b0f15;
  --pdc-card: #12121a;
  --pdc-border: #1a3a5f;
  --pdc-usdt: #26a17b;
  --pdc-gray: #b8bcc8;
  position: relative;
  font-family: 'Roboto Mono', ui-monospace, monospace;
  /* 与外层 main 同色平铺；不用左右径向（会在主列竖边与两侧 gutter 之间形成明显「竖缝」） */
  background-color: var(--pdc-dark);
  background-image: none;
  /* 不向外负 margin，与外层居中容器对齐，两侧留白一致 */
  margin: 0;
  /* 底部少留白、无圆角，避免与页脚之间出现异色「缝隙带」 */
  padding: 0 0 0.35rem;
  overflow-x: clip;
  border-radius: 0;
}

.pdc-cyan {
  color: var(--pdc-cyan);
}
.pdc-pink {
  color: var(--pdc-pink);
}

.pdc-alert {
  background: linear-gradient(90deg, rgba(157, 0, 255, 0.22), rgba(0, 243, 255, 0.18));
  border-top: 1px solid var(--pdc-cyan);
  border-bottom: 1px solid var(--pdc-cyan);
  padding: 0.85rem 0;
  margin: 0 0 1.1rem;
  border-radius: 0.35rem;
}
.pdc-alert-inner {
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.65rem;
  width: 100%;
}
.pdc-alert-icon {
  color: var(--pdc-pink);
  font-size: 1.1rem;
  flex-shrink: 0;
}
.pdc-marquee-clip {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 8px, #000 calc(100% - 8px), transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8px, #000 calc(100% - 8px), transparent);
}
.pdc-marquee-track {
  display: inline-block;
  white-space: nowrap;
  animation: pdc-marquee-scroll linear infinite;
}
.pdc-marquee-seg {
  display: inline-block;
  padding-right: 3rem;
  font-size: clamp(0.78rem, 2.2vw, 0.9rem);
  line-height: 1.5;
  color: #e8eaef;
  font-family: Orbitron, sans-serif;
}
@keyframes pdc-marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pdc-marquee-track {
    animation: none;
    transform: none;
  }
  .pdc-marquee-clip {
    overflow-x: auto;
    mask-image: none;
    -webkit-mask-image: none;
  }
}

.pdc-hero {
  padding: 1rem 0 1.75rem;
  background: transparent;
}
.pdc-hero-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;
}
@media (min-width: 900px) {
  .pdc-hero-grid {
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
  }
}

.pdc-hero-title {
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.65rem, 4vw, 2.75rem);
  font-weight: 900;
  line-height: 1.2;
  color: #fff;
  margin-bottom: 1rem;
  word-break: break-word;
}
.pdc-hero-desc {
  color: #c4c8d4;
  font-size: 1rem;
  line-height: 1.75;
  white-space: pre-wrap;
  margin-bottom: 1.5rem;
}

.pdc-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.pdc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  font-family: Orbitron, sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  border-radius: 6px;
  transition: background 0.25s, border-color 0.25s, transform 0.2s;
  cursor: pointer;
  border: 2px solid transparent;
}
button.pdc-btn {
  appearance: none;
  -webkit-appearance: none;
}
.pdc-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}
.pdc-btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.pdc-btn-usdt {
  border-color: var(--pdc-usdt);
  color: #fff;
  box-shadow: 0 0 14px rgba(38, 161, 123, 0.35);
  background: transparent;
}
.pdc-btn-usdt:hover {
  background: rgba(38, 161, 123, 0.18);
}

.pdc-btn-outline {
  border-color: var(--pdc-cyan);
  color: var(--pdc-cyan);
  background: transparent;
}
.pdc-btn-outline:hover {
  background: rgba(0, 243, 255, 0.12);
}

.pdc-btn-buy {
  width: 100%;
  margin-top: 0.5rem;
  background: var(--pdc-usdt);
  color: var(--pdc-dark);
  border-color: var(--pdc-usdt);
  font-size: 1rem;
  padding: 0.9rem;
}
.pdc-btn-buy:not(:disabled):hover {
  filter: brightness(1.08);
}

.pdc-btn-ghost {
  border: 1px solid var(--pdc-border);
  color: var(--pdc-gray);
  background: rgba(18, 18, 26, 0.6);
}
.pdc-btn-ghost:hover {
  border-color: var(--pdc-cyan);
  color: var(--pdc-cyan);
}

.pdc-btn-wide {
  min-width: 200px;
}

.pdc-float-wrap {
  position: relative;
}
.pdc-img-frame {
  border-radius: 1rem;
  overflow: hidden;
  animation: pdc-float 6s ease-in-out infinite;
}
.pdc-img-frame-cyan {
  border: 2px solid var(--pdc-cyan);
  box-shadow: 0 0 18px rgba(0, 243, 255, 0.28);
}
.pdc-img-frame-pink {
  border: 2px solid var(--pdc-pink);
  box-shadow: 0 0 18px rgba(255, 0, 255, 0.22);
}
.pdc-img-frame img {
  width: 100%;
  display: block;
  vertical-align: middle;
  background: var(--pdc-dark);
}
@keyframes pdc-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.pdc-section {
  padding: 2rem 0;
  /* 避免继承或层叠产生与父级不同的底色块 */
  background: transparent;
}
.pdc-section-last {
  padding-bottom: 0.5rem;
}
.pdc-section-head {
  text-align: center;
  margin-bottom: 2rem;
}
.pdc-h2 {
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.5rem;
}
.pdc-sub {
  color: var(--pdc-gray);
  max-width: 36rem;
  margin: 0 auto;
  font-size: 0.9rem;
}

.pdc-feature-empty {
  text-align: center;
  padding: 2rem 1rem;
  border: 1px dashed var(--pdc-border);
  border-radius: 0.85rem;
  color: #8b92a8;
  font-size: 0.9rem;
  line-height: 1.6;
  max-width: 28rem;
  margin: 0 auto;
}
.pdc-feature-empty i {
  display: block;
  font-size: 2rem;
  color: var(--pdc-cyan);
  opacity: 0.5;
  margin-bottom: 0.75rem;
}
.pdc-feature-empty p {
  margin: 0;
}

.pdc-feature-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}
@media (min-width: 640px) {
  .pdc-feature-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 1024px) {
  .pdc-feature-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.pdc-feature-card {
  background: var(--pdc-card);
  border: 2px solid var(--pdc-cyan);
  border-radius: 0.85rem;
  padding: 1.5rem;
  transition: transform 0.25s, box-shadow 0.25s;
}
.pdc-feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 28px rgba(0, 243, 255, 0.12);
}
/* 外框统一为青色霓虹；tone 仅保留图标/标题色相变化 */

.pdc-feature-icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, rgba(0, 243, 255, 0.35), rgba(157, 0, 255, 0.2));
  color: #fff;
  font-size: 1.35rem;
}
.tone-1 .pdc-feature-icon {
  background: linear-gradient(135deg, rgba(255, 0, 255, 0.35), rgba(0, 243, 255, 0.15));
}
.tone-2 .pdc-feature-icon {
  background: linear-gradient(135deg, rgba(157, 0, 255, 0.45), rgba(0, 243, 255, 0.12));
}

.pdc-feature-title {
  font-family: Orbitron, sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--pdc-cyan);
  margin-bottom: 0.5rem;
}
.tone-1 .pdc-feature-title {
  color: var(--pdc-pink);
}
.tone-2 .pdc-feature-title {
  color: #c9a6ff;
}
.pdc-feature-desc {
  color: #aeb4c5;
  font-size: 0.88rem;
  line-height: 1.6;
}

/* —— #specs 技术规格：外层霓虹面板 + 4 列横向功能卡（对齐参考截图） —— */
.pdc-section-specs {
  padding-top: 2.25rem;
}

/* 整块规格区：深色底 + 青色霓虹描边/光晕 */
.pdc-specs-panel {
  max-width: min(72rem, 100%);
  margin: 0 auto;
  padding: clamp(1.25rem, 3vw, 2rem) clamp(1rem, 2.5vw, 1.75rem) clamp(1.35rem, 2.8vw, 1.85rem);
  border-radius: 1rem;
  /* 与页面基色同系，避免面板内出现「纯黑块」与周围色差线 */
  background: linear-gradient(165deg, rgba(16, 18, 26, 0.97), rgba(11, 15, 21, 0.99));
  border: 1px solid rgba(0, 243, 255, 0.55);
  box-shadow:
    0 0 0 1px rgba(0, 243, 255, 0.12),
    0 0 28px rgba(0, 243, 255, 0.22),
    0 0 56px rgba(0, 243, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.pdc-specs-panel-head {
  text-align: center;
  margin-bottom: clamp(1.25rem, 3vw, 1.85rem);
}

/* 标题：青 → 品红渐变字 */
.pdc-specs-title {
  margin: 0 0 0.5rem;
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.55rem, 3.6vw, 2.35rem);
  font-weight: 900;
  letter-spacing: 0.04em;
  background: linear-gradient(90deg, var(--pdc-cyan), #7af0ff 42%, var(--pdc-pink));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.pdc-specs-sub {
  margin: 0 auto;
  max-width: 36rem;
  color: #8b92a8;
  font-size: 0.88rem;
  line-height: 1.55;
}

.pdc-specs-empty {
  text-align: center;
  padding: 2rem 1rem;
  border: 1px dashed rgba(0, 243, 255, 0.35);
  border-radius: 0.85rem;
  color: #8b92a8;
  font-size: 0.9rem;
  line-height: 1.6;
  max-width: 28rem;
  margin: 0 auto;
}
.pdc-specs-empty i {
  display: block;
  font-size: 2rem;
  color: var(--pdc-cyan);
  opacity: 0.55;
  margin-bottom: 0.75rem;
}
.pdc-specs-empty p {
  margin: 0;
}

/* 桌面 4×N；平板 2 列；手机 1 列 */
.pdc-specs-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
}
@media (min-width: 520px) {
  .pdc-specs-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }
}
@media (min-width: 1024px) {
  .pdc-specs-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }
}

/* 单卡：左圆标 + 右双行文案 */
.pdc-spec-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.85rem 0.95rem;
  border-radius: 0.65rem;
  background: rgba(18, 20, 30, 0.92);
  border: 1px solid rgba(0, 243, 255, 0.18);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pdc-spec-card:hover {
  border-color: rgba(0, 243, 255, 0.42);
  box-shadow: 0 0 18px rgba(0, 243, 255, 0.12);
}

.pdc-spec-card-icon {
  flex-shrink: 0;
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  color: #fff;
  background: rgba(0, 243, 255, 0.88);
  box-shadow: 0 0 14px rgba(0, 243, 255, 0.45);
}
.pdc-spec-card-icon i {
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.35));
}

.pdc-spec-card-body {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.pdc-spec-card-label {
  font-size: 0.72rem;
  line-height: 1.35;
  color: #7a8194;
  margin-bottom: 0.2rem;
  word-break: break-word;
}

.pdc-spec-card-value {
  font-family: Orbitron, sans-serif;
  font-size: clamp(0.82rem, 1.9vw, 0.95rem);
  font-weight: 700;
  color: #fff;
  line-height: 1.35;
  word-break: break-word;
}

/* 多图时：首张在英雄区；此处大屏两列自动换行，小屏单列自上而下 */
.pdc-gallery-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  width: 100%;
  max-width: min(72rem, 100%);
  margin: 0 auto;
}
@media (min-width: 900px) {
  .pdc-gallery-stack {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.75rem 1.5rem;
  }
}
.pdc-gallery-stack-item {
  min-width: 0;
}

/* 仅有重要说明、无「技术规格」霓虹外框时的容器宽度 */
.pdc-spec-notice-only {
  max-width: min(72rem, 100%);
  margin: 0 auto;
}

/* 重要说明：参考稿 — 深紫→墨青渐变底、亮青标题、浅灰正文、品红警示 */
.pdc-spec-notice-below {
  margin-top: clamp(1.25rem, 3vw, 1.75rem);
}

.pdc-spec-notice-panel {
  text-align: left;
  padding: clamp(1.15rem, 2.8vw, 1.45rem) clamp(1.2rem, 3vw, 1.6rem);
  border-radius: 0.75rem;
  /* 与参考图一致：左深紫、右墨青 */
  background: linear-gradient(90deg, #1a0b35 0%, #101820 45%, #0a181b 100%);
  border: 1px solid rgba(0, 229, 255, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 24px rgba(26, 11, 53, 0.5);
}

.pdc-spec-notice-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.pdc-spec-notice-ico-wrap {
  flex-shrink: 0;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ff00ff;
  color: #fff;
  font-size: 0.72rem;
  box-shadow: 0 0 14px rgba(255, 0, 255, 0.55);
}

/* 标题内感叹号加粗，贴近参考 HTML 视觉比重 */
.pdc-spec-notice-head-ico {
  font-size: 0.95rem;
  font-weight: 900;
  line-height: 1;
}

.pdc-spec-notice-title {
  margin: 0;
  font-family: Orbitron, sans-serif;
  font-size: clamp(0.95rem, 2.2vw, 1.08rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #00e5ff;
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.35);
}

.pdc-spec-notice-list {
  list-style: none;
  padding: 0;
  margin: 0;
  /* 列表整体右移：对勾/禁止标与标题「重」字左缘对齐（等于左侧圆标 1.85rem + 与标题间距 0.65rem） */
  padding-left: calc(1.85rem + 0.65rem);
  box-sizing: border-box;
}
.pdc-spec-notice-list li {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.5rem;
  color: #d1d1d1;
  font-size: 0.86rem;
  line-height: 1.55;
}
.pdc-spec-notice-list li:last-child {
  margin-bottom: 0;
}
/* 列表对勾：与标题同系亮青 */
.pdc-spec-notice-check {
  color: #00e5ff;
  margin-top: 0.18rem;
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
}
/* 禁止标 / 警示行：参考稿品红 */
.pdc-spec-notice-ban {
  color: #ff00ff;
  margin-top: 0.16rem;
  flex-shrink: 0;
  font-size: 0.92rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 10px rgba(255, 0, 255, 0.45);
}
.pdc-spec-notice-warn {
  color: #ff00ff;
  font-weight: 700;
}

.pdc-usdt-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #26a17b, #1a8a6a);
  color: #fff;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  font-family: Orbitron, sans-serif;
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.pdc-pricing-wrap {
  max-width: 32rem;
  margin: 0 auto;
}
.pdc-price-card {
  position: relative;
  background: var(--pdc-card);
  border: 2px solid var(--pdc-usdt);
  border-radius: 1rem;
  padding: 2rem 1.5rem 1.5rem;
  box-shadow: 0 0 20px rgba(38, 161, 123, 0.25);
}
.pdc-price-ribbon {
  position: absolute;
  top: -0.65rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--pdc-usdt);
  color: var(--pdc-dark);
  font-family: Orbitron, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.25rem 0.9rem;
  border-radius: 999px;
}
.pdc-price-name {
  font-family: Orbitron, sans-serif;
  font-size: 1.25rem;
  color: #fff;
  margin-bottom: 0.35rem;
}
.pdc-price-single {
  font-family: Orbitron, sans-serif;
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--pdc-usdt);
  margin: 0.35rem 0 1rem;
  line-height: 1.2;
}
.pdc-price-single-cny {
  color: #fff;
}
.pdc-price-core {
  margin-bottom: 1rem;
}
.pdc-price-core-title {
  font-family: Orbitron, sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--pdc-cyan);
  letter-spacing: 0.06em;
  margin: 0 0 0.5rem;
}
.pdc-price-core-empty {
  color: #8b92a8;
  font-size: 0.85rem;
  line-height: 1.5;
  margin: 0;
}
.pdc-price-features {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.88rem;
  color: #d5dae6;
}
.pdc-price-features li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
  line-height: 1.45;
}
.pdc-price-features .fa-check {
  color: var(--pdc-usdt);
  margin-top: 0.2rem;
  flex-shrink: 0;
}
</style>
