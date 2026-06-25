<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1>
            <i class="fas fa-truck"></i>
            {{ $t('orders.tracking.title') }}
          </h1>
        </div>
      </div>

      <div class="order-detail-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!order" class="empty-state">
            {{ $t('orders.notFound') }}
          </div>

          <div v-else class="order-detail-container">
            <div class="order-detail-card tracking-card">
              <div class="tracking-head">
                <h3><i class="fas fa-truck"></i> {{ $t('orders.tracking.title') }}</h3>
                <button
                  v-if="tracking?.trackingNumber"
                  type="button"
                  class="btn-refresh"
                  :disabled="trackingLoading"
                  @click="loadTracking"
                >
                  <i :class="trackingLoading ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'"></i>
                  {{ $t('orders.tracking.refresh') }}
                </button>
              </div>

              <div v-if="trackingLoading && !tracking" class="tracking-loading">
                {{ $t('orders.tracking.loading') }}
              </div>

              <template v-else-if="tracking?.trackingNumber">
                <div class="tracking-meta">
                  <div class="tracking-row">
                    <span class="label">{{ $t('orders.tracking.number') }}</span>
                    <code class="tracking-no" @dblclick="copyTrackingNumber" :title="$t('orders.copyHint')">
                      {{ tracking.trackingNumber }}
                    </code>
                  </div>
                  <div class="tracking-row">
                    <span class="label">{{ $t('orders.tracking.carrier') }}</span>
                    <span class="value">{{ $t('orders.tracking.carrierSf') }}</span>
                  </div>
                </div>

                <p v-if="tracking.routes?.length" class="tracking-live-hint">
                  <i class="fas fa-satellite-dish"></i> {{ $t('orders.tracking.liveHint') }}
                </p>

                <ul v-if="tracking.routes?.length" class="route-timeline">
                  <li v-for="(route, idx) in tracking.routes" :key="idx" class="route-item">
                    <span class="route-dot" aria-hidden="true"></span>
                    <div class="route-body">
                      <time>{{ route.time }}</time>
                      <p v-if="route.location" class="route-loc">{{ route.location }}</p>
                      <p class="route-remark">{{ route.remark }}</p>
                    </div>
                  </li>
                </ul>

                <p v-else-if="!trackingLoading && !tracking.routes?.length && tracking.apiEnabled" class="tracking-empty">
                  {{ $t('orders.tracking.noRoutes') }}
                </p>

                <button
                  v-if="tracking.externalUrl"
                  type="button"
                  class="btn btn-secondary btn-sf-link"
                  @click="openSfTracking"
                >
                  <i class="fas fa-external-link-alt"></i> {{ $t('orders.tracking.viewOnSf') }}
                </button>
                <p v-if="externalCopiedHint" class="tracking-copy-hint">{{ externalCopiedHint }}</p>
              </template>

              <p v-else class="tracking-empty">
                {{ $t('orders.tracking.noTracking') }}
              </p>
            </div>

            <div class="action-buttons">
              <router-link to="/orders" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> {{ $t('orders.backToOrders') }}
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const { t } = useI18n()
const order = ref(null)
const loading = ref(true)
const tracking = ref(null)
const trackingLoading = ref(false)
const externalCopiedHint = ref('')

onMounted(async () => {
  loading.value = true
  try {
    const response = await api.get(`/api/orders/${route.params.id}`)
    order.value = response.data
    loadTracking()
  } catch (error) {
    console.error('Failed to fetch order:', error)
  } finally {
    loading.value = false
  }
})

async function loadTracking() {
  trackingLoading.value = true
  try {
    const response = await api.get(`/api/orders/${route.params.id}/tracking`)
    tracking.value = response.data
  } catch (error) {
    console.error('Failed to fetch tracking:', error)
    tracking.value = order.value?.trackingNumber
      ? { trackingNumber: order.value.trackingNumber, routes: [], externalUrl: null }
      : null
  } finally {
    trackingLoading.value = false
  }
}

async function copyTrackingNumber() {
  if (!tracking.value?.trackingNumber) return
  try {
    await navigator.clipboard.writeText(tracking.value.trackingNumber)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

async function openSfTracking() {
  const num = tracking.value?.trackingNumber
  const url = tracking.value?.externalUrl || 'https://www.sf-express.com/chn/sc/waybill'
  if (num) {
    try {
      await navigator.clipboard.writeText(num)
      externalCopiedHint.value = t('orders.tracking.externalCopied')
      setTimeout(() => { externalCopiedHint.value = '' }, 4000)
    } catch (err) {
      externalCopiedHint.value = t('orders.tracking.externalHint')
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.order-detail-page {
  padding: 2rem 0;
}

.order-detail-container {
  max-width: 800px;
  margin: 0 auto;
}

.order-detail-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-color);
}

.order-detail-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 2rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  border: none;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 3rem;
  color: var(--primary-color);
}

.tracking-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.tracking-head h3 {
  margin: 0;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.08);
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-refresh:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tracking-loading,
.tracking-empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.tracking-meta {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.tracking-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.tracking-row .label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.tracking-no {
  font-family: 'Courier New', monospace;
  font-size: 0.95rem;
  color: var(--primary-color);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.08);
  cursor: pointer;
}

.tracking-live-hint {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.tracking-live-hint i {
  color: var(--primary-color);
  margin-right: 0.35rem;
}

.tracking-copy-hint {
  margin: 0.65rem 0 0;
  font-size: 0.8rem;
  color: #43e97b;
}

.route-timeline {
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0 0 0 0.5rem;
  border-left: 2px solid rgba(0, 212, 255, 0.25);
}

.route-item {
  position: relative;
  padding: 0 0 1.1rem 1.25rem;
}

.route-dot {
  position: absolute;
  left: -0.55rem;
  top: 0.35rem;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
}

.route-item:first-child .route-dot {
  background: #43e97b;
  box-shadow: 0 0 0 3px rgba(67, 233, 123, 0.2);
}

.route-body time {
  display: block;
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-bottom: 0.2rem;
}

.route-loc {
  margin: 0 0 0.15rem;
  font-size: 0.88rem;
  color: var(--text-primary);
  font-weight: 500;
}

.route-remark {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.btn-sf-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  border: none;
}
</style>
