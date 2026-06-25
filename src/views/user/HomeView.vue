<template>
  <div class="corp-home">
    <AppHeader />
    <main>
      <!-- 首屏 Banner -->
      <section class="corp-hero">
        <div class="corp-hero__bg" aria-hidden="true" />
        <div class="container corp-hero__inner">
          <div class="corp-hero__text">
            <span class="corp-hero__badge">{{ $t('home.hero.badge') }}</span>
            <p class="corp-hero__brand">{{ $t('home.hero.subtitle') }}</p>
            <h1 class="corp-hero__title">{{ $t('home.hero.title') }}</h1>
            <p class="corp-hero__desc">{{ $t('home.hero.description') }}</p>
            <div class="corp-hero__actions">
              <router-link to="/products" class="corp-btn corp-btn--primary">
                <i class="fas fa-store" aria-hidden="true" />
                {{ $t('home.hero.ctaShop') }}
              </router-link>
              <router-link to="/chat" class="corp-btn corp-btn--outline">
                <i class="fas fa-headset" aria-hidden="true" />
                {{ $t('home.hero.ctaChat') }}
              </router-link>
            </div>
          </div>
          <div class="corp-hero__visual" aria-hidden="true">
            <div class="corp-hero__orbit corp-hero__orbit--outer" />
            <div class="corp-hero__orbit corp-hero__orbit--inner" />
            <svg class="corp-hero__lines" viewBox="0 0 360 360">
              <line x1="180" y1="180" x2="300" y2="70" />
              <line x1="180" y1="180" x2="55" y2="260" />
              <line x1="180" y1="180" x2="310" y2="200" />
              <line x1="180" y1="180" x2="120" y2="55" />
            </svg>
            <div class="corp-hero__hub">
              <div class="corp-hero__hub-logo-wrap">
                <img src="/favicon.png" alt="YHthestudio" class="corp-hero__hub-logo" />
              </div>
            </div>
            <div class="corp-hero__card corp-hero__card--1">
              <i class="fas fa-microchip" />
              <span>{{ $t('home.hero.visual.hardware') }}</span>
            </div>
            <div class="corp-hero__card corp-hero__card--2">
              <i class="fas fa-code" />
              <span>{{ $t('home.hero.visual.software') }}</span>
            </div>
            <div class="corp-hero__card corp-hero__card--3">
              <i class="fas fa-shield-alt" />
              <span>{{ $t('home.hero.visual.secure') }}</span>
            </div>
            <div class="corp-hero__card corp-hero__card--4">
              <i class="fas fa-globe" />
              <span>{{ $t('home.hero.visual.global') }}</span>
            </div>
            <span v-for="n in 8" :key="n" class="corp-hero__dot" :class="`corp-hero__dot--${n}`" />
          </div>
        </div>
      </section>

      <!-- 关于我们 -->
      <section class="corp-about">
        <div class="container corp-about__inner">
          <div class="corp-about__media">
            <div class="corp-about__image-wrap">
              <div class="corp-about__logo-ring" aria-hidden="true" />
              <div class="corp-about__logo-wrap">
                <img src="/favicon.png" alt="YHthestudio" class="corp-about__logo" />
              </div>
            </div>
          </div>
          <div class="corp-about__content">
            <span class="corp-label">{{ $t('home.about.label') }}</span>
            <h2 class="corp-section-title corp-section-title--left">{{ $t('home.about.title') }}</h2>
            <p class="corp-about__desc">{{ $t('home.about.description') }}</p>
            <ul class="corp-about__list">
              <li><i class="fas fa-check-circle" aria-hidden="true" />{{ $t('home.about.point1') }}</li>
              <li><i class="fas fa-check-circle" aria-hidden="true" />{{ $t('home.about.point2') }}</li>
              <li><i class="fas fa-check-circle" aria-hidden="true" />{{ $t('home.about.point3') }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 核心优势 -->
      <section class="corp-features">
        <div class="container">
          <div class="corp-section-head">
            <span class="corp-label">{{ $t('home.features.title') }}</span>
            <h2 class="corp-section-title">{{ $t('home.features.subtitle') }}</h2>
          </div>
          <div class="corp-features__grid">
            <article v-for="item in featureItems" :key="item.key" class="corp-feature-card">
              <div class="corp-feature-card__icon">
                <i :class="item.icon" aria-hidden="true" />
              </div>
              <h3>{{ $t(`home.features.${item.key}.title`) }}</h3>
              <p>{{ $t(`home.features.${item.key}.description`) }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- 数据概览 -->
      <section class="corp-stats">
        <div class="container corp-stats__grid">
          <div v-for="stat in statItems" :key="stat.key" class="corp-stat">
            <div class="corp-stat__icon"><i :class="stat.icon" aria-hidden="true" /></div>
            <div class="corp-stat__value">{{ stat.value }}</div>
            <div class="corp-stat__label">{{ $t(`home.stats.${stat.key}`) }}</div>
          </div>
        </div>
      </section>

      <!-- 精选产品（商城入口） -->
      <section v-if="products.length > 0" class="corp-products">
        <div class="container">
          <div class="corp-section-head">
            <span class="corp-label">{{ $t('home.products.label') }}</span>
            <h2 class="corp-section-title">{{ $t('home.products.title') }}</h2>
            <p class="corp-section-sub">{{ $t('home.products.subtitle') }}</p>
          </div>
          <div class="corp-products__grid">
            <ProductCard
              v-for="product in products"
              :key="product.id"
              :product="product"
              class="corp-product-item"
            />
          </div>
          <div class="corp-products__more">
            <router-link to="/products" class="corp-btn corp-btn--outline">
              {{ $t('home.products.viewAll') }}
              <i class="fas fa-arrow-right" aria-hidden="true" />
            </router-link>
          </div>
        </div>
      </section>

      <!-- 底部号召 -->
      <section class="corp-cta">
        <div class="container corp-cta__inner">
          <h2>{{ $t('home.cta.title') }}</h2>
          <p>{{ $t('home.cta.description') }}</p>
          <div class="corp-cta__actions">
            <router-link to="/products" class="corp-btn corp-btn--light">
              {{ $t('home.cta.shop') }}
            </router-link>
            <router-link to="/forum" class="corp-btn corp-btn--ghost">
              {{ $t('home.cta.forum') }}
            </router-link>
          </div>
        </div>
      </section>
    </main>
    <AppFooter />
    <PopupNotice />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import * as catalogApi from '@/services/catalog'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import PopupNotice from '@/components/common/PopupNotice.vue'
import ProductCard from '@/components/user/ProductCard.vue'

const products = ref([])
const productTotal = ref(0)

const featureItems = [
  { key: 'quality', icon: 'fas fa-award' },
  { key: 'support', icon: 'fas fa-headset' },
  { key: 'secure', icon: 'fas fa-lock' },
  { key: 'community', icon: 'fas fa-users' }
]

const statItems = computed(() => [
  { key: 'products', icon: 'fas fa-box-open', value: productTotal.value || '—' },
  { key: 'support', icon: 'fas fa-comments', value: '7×24' },
  { key: 'secure', icon: 'fas fa-shield-alt', value: '100%' }
])

onMounted(async () => {
  try {
    const response = await catalogApi.getProducts({ params: { limit: 3 } })
    const list = response.data || []
    products.value = list
    productTotal.value = list.length >= 3 ? '3+' : list.length
  } catch (error) {
    console.error('Failed to fetch products:', error)
  }
})
</script>

<style scoped>
.corp-home {
  --corp-bg: #0b1120;
  --corp-surface: #111827;
  --corp-surface-2: #1a2332;
  --corp-border: rgba(148, 163, 184, 0.12);
  --corp-text: #f1f5f9;
  --corp-muted: #94a3b8;
  --corp-accent: #3b82f6;
  --corp-accent-soft: rgba(59, 130, 246, 0.12);
}

/* ── 首屏 ── */
.corp-hero {
  position: relative;
  min-height: calc(100vh - 72px);
  display: flex;
  align-items: center;
  overflow: hidden;
  background: var(--corp-bg);
}

.corp-hero__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(59, 130, 246, 0.15), transparent),
    radial-gradient(ellipse 50% 40% at 10% 80%, rgba(14, 165, 233, 0.08), transparent),
    linear-gradient(180deg, #0b1120 0%, #0f172a 100%);
}

.corp-hero__inner {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
  padding-top: 4rem;
  padding-bottom: 4rem;
}

.corp-hero__badge {
  display: inline-block;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #93c5fd;
  background: var(--corp-accent-soft);
  border: 1px solid rgba(59, 130, 246, 0.25);
  margin-bottom: 1.25rem;
}

.corp-hero__brand {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--corp-accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}

.corp-hero__title {
  font-size: clamp(2rem, 4.5vw, 3rem);
  font-weight: 700;
  line-height: 1.2;
  color: var(--corp-text);
  margin-bottom: 1.25rem;
}

.corp-hero__desc {
  font-size: 1.05rem;
  line-height: 1.75;
  color: var(--corp-muted);
  max-width: 520px;
  margin-bottom: 2rem;
}

.corp-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.corp-hero__visual {
  position: relative;
  width: 100%;
  max-width: 400px;
  height: 400px;
  margin: 0 auto;
}

.corp-hero__orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  border-radius: 50%;
  border: 1px solid rgba(59, 130, 246, 0.18);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.corp-hero__orbit--outer {
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.04) 0%, transparent 65%);
  animation: corp-orbit-spin 48s linear infinite;
}

.corp-hero__orbit--inner {
  width: 220px;
  height: 220px;
  border-style: dashed;
  border-color: rgba(59, 130, 246, 0.22);
  animation: corp-orbit-spin 32s linear infinite reverse;
}

@keyframes corp-orbit-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.corp-hero__lines {
  position: absolute;
  inset: 20px;
  width: calc(100% - 40px);
  height: calc(100% - 40px);
  pointer-events: none;
}

.corp-hero__lines line {
  stroke: rgba(59, 130, 246, 0.2);
  stroke-width: 1;
  stroke-dasharray: 4 6;
}

.corp-hero__hub {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 118px;
  height: 118px;
  padding: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, rgba(59, 130, 246, 0.18) 0%, rgba(15, 23, 42, 0.95) 55%, #0b1220 100%);
  border: 1px solid rgba(96, 165, 250, 0.38);
  box-shadow:
    0 0 0 7px rgba(59, 130, 246, 0.07),
    0 0 32px rgba(59, 130, 246, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  z-index: 2;
}

.corp-hero__hub-logo-wrap {
  width: 94px;
  height: 94px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, #1a2740 0%, #0a0f1a 100%);
}

.corp-hero__hub-logo {
  width: 128%;
  height: auto;
  max-width: none;
  object-fit: contain;
  object-position: center;
  /* 金色 Logo 保留，黑色底与深蓝背景融合 */
  mix-blend-mode: lighten;
  filter: drop-shadow(0 0 8px rgba(234, 179, 8, 0.22));
}

.corp-hero__card {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 80px;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  background: rgba(26, 35, 50, 0.92);
  border: 1px solid var(--corp-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-size: 0.72rem;
  color: var(--corp-muted);
  z-index: 3;
  backdrop-filter: blur(8px);
}

.corp-hero__card i {
  font-size: 1.35rem;
  color: var(--corp-accent);
}

.corp-hero__card span {
  white-space: nowrap;
  font-weight: 500;
}

.corp-hero__card--1 { top: 4%; right: 6%; }
.corp-hero__card--2 { bottom: 8%; left: 0; }
.corp-hero__card--3 { top: 38%; right: -4%; }
.corp-hero__card--4 { top: 6%; left: 8%; }

.corp-hero__dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
  z-index: 1;
}

.corp-hero__dot--1 { top: 50%; left: 2%; transform: translateY(-50%); }
.corp-hero__dot--2 { top: 14%; left: 28%; }
.corp-hero__dot--3 { top: 14%; right: 28%; }
.corp-hero__dot--4 { top: 50%; right: 2%; transform: translateY(-50%); }
.corp-hero__dot--5 { bottom: 14%; right: 28%; }
.corp-hero__dot--6 { bottom: 14%; left: 28%; }
.corp-hero__dot--7 { top: 32%; left: 50%; transform: translateX(-50%); opacity: 0.5; }
.corp-hero__dot--8 { bottom: 32%; left: 50%; transform: translateX(-50%); opacity: 0.5; }

/* ── 通用 ── */
.corp-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--corp-accent);
  margin-bottom: 0.75rem;
}

.corp-section-head {
  text-align: center;
  margin-bottom: 3rem;
}

.corp-section-title {
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
  color: var(--corp-text);
  margin-bottom: 0.75rem;
}

.corp-section-title--left {
  text-align: left;
}

.corp-section-sub {
  color: var(--corp-muted);
  font-size: 1.05rem;
  max-width: 560px;
  margin: 0 auto;
}

.corp-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.25s ease;
  cursor: pointer;
  border: none;
}

.corp-btn--primary {
  background: var(--corp-accent);
  color: #fff;
}

.corp-btn--primary:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);
}

.corp-btn--outline {
  background: transparent;
  color: var(--corp-text);
  border: 1px solid var(--corp-border);
}

.corp-btn--outline:hover {
  border-color: var(--corp-accent);
  color: #93c5fd;
}

.corp-btn--light {
  background: #fff;
  color: #1e293b;
}

.corp-btn--light:hover {
  background: #f1f5f9;
}

.corp-btn--ghost {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.corp-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* ── 关于 ── */
.corp-about {
  padding: 5rem 0;
  background: var(--corp-surface);
  border-top: 1px solid var(--corp-border);
  border-bottom: 1px solid var(--corp-border);
}

.corp-about__inner {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 4rem;
  align-items: center;
}

.corp-about__image-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  max-width: 320px;
  margin: 0 auto;
  border-radius: 20px;
  background: radial-gradient(circle at 50% 42%, rgba(59, 130, 246, 0.14) 0%, var(--corp-surface-2) 48%, var(--corp-bg) 100%);
  border: 1px solid rgba(59, 130, 246, 0.15);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.corp-about__logo-ring {
  position: absolute;
  width: 78%;
  height: 78%;
  border-radius: 50%;
  border: 1px dashed rgba(59, 130, 246, 0.18);
  pointer-events: none;
}

.corp-about__logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(circle, #1a2740 0%, #0a0f1a 100%);
  border: 1px solid rgba(96, 165, 250, 0.32);
  box-shadow:
    0 0 0 8px rgba(59, 130, 246, 0.06),
    0 0 36px rgba(59, 130, 246, 0.12);
}

.corp-about__logo {
  width: 138%;
  height: auto;
  max-width: none;
  object-fit: contain;
  object-position: center;
  mix-blend-mode: lighten;
  filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.24));
}

.corp-about__desc {
  color: var(--corp-muted);
  line-height: 1.8;
  margin-bottom: 1.5rem;
}

.corp-about__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.corp-about__list li {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  color: var(--corp-text);
  font-size: 0.95rem;
}

.corp-about__list i {
  color: #22c55e;
  margin-top: 0.2rem;
  flex-shrink: 0;
}

/* ── 优势 ── */
.corp-features {
  padding: 5rem 0;
  background: var(--corp-bg);
}

.corp-features__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

.corp-feature-card {
  padding: 2rem 1.5rem;
  border-radius: 12px;
  background: var(--corp-surface);
  border: 1px solid var(--corp-border);
  transition: border-color 0.25s, transform 0.25s;
}

.corp-feature-card:hover {
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-4px);
}

.corp-feature-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--corp-accent-soft);
  color: var(--corp-accent);
  font-size: 1.25rem;
  margin-bottom: 1.25rem;
}

.corp-feature-card h3 {
  font-size: 1.1rem;
  color: var(--corp-text);
  margin-bottom: 0.65rem;
}

.corp-feature-card p {
  font-size: 0.9rem;
  color: var(--corp-muted);
  line-height: 1.65;
  margin: 0;
}

/* ── 数据条 ── */
.corp-stats {
  padding: 3.5rem 0;
  background: linear-gradient(90deg, #1e3a5f 0%, #1e40af 50%, #1e3a5f 100%);
}

.corp-stats__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  text-align: center;
}

.corp-stat__icon {
  font-size: 1.5rem;
  color: #93c5fd;
  margin-bottom: 0.5rem;
}

.corp-stat__value {
  font-size: 2.25rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.corp-stat__label {
  font-size: 0.9rem;
  color: #bfdbfe;
  margin-top: 0.35rem;
}

/* ── 产品 ── */
.corp-products {
  padding: 5rem 0;
  background: var(--corp-surface);
}

.corp-products__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}

.corp-products__more {
  text-align: center;
}

/* ── CTA ── */
.corp-cta {
  padding: 4.5rem 0;
  background: var(--corp-bg);
}

.corp-cta__inner {
  text-align: center;
  padding: 3rem 2rem;
  border-radius: 16px;
  background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.corp-cta__inner h2 {
  font-size: clamp(1.5rem, 3vw, 2rem);
  color: #fff;
  margin-bottom: 0.75rem;
}

.corp-cta__inner p {
  color: #bfdbfe;
  max-width: 520px;
  margin: 0 auto 1.75rem;
  line-height: 1.7;
}

.corp-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

/* ── 响应式 ── */
@media (max-width: 1024px) {
  .corp-features__grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .corp-products__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .corp-hero__inner {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding-top: 2.5rem;
    padding-bottom: 2.5rem;
  }

  .corp-hero__visual {
    height: 320px;
    max-width: 340px;
  }

  .corp-hero__orbit--outer { width: 280px; height: 280px; }
  .corp-hero__orbit--inner { width: 180px; height: 180px; }

  .corp-hero__hub {
    width: 100px;
    height: 100px;
  }

  .corp-hero__hub-logo-wrap {
    width: 80px;
    height: 80px;
  }

  .corp-hero__card {
    min-width: 68px;
    padding: 0.55rem 0.65rem;
    font-size: 0.65rem;
  }

  .corp-hero__card i { font-size: 1.1rem; }

  .corp-about__inner {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .corp-about__logo-wrap {
    width: 168px;
    height: 168px;
  }

  .corp-features__grid,
  .corp-products__grid,
  .corp-stats__grid {
    grid-template-columns: 1fr;
  }
}
</style>
