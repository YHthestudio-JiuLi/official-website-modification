<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-shopping-bag"></i> {{ $t('orders.title') }}</h1>
        </div>
      </div>

      <div class="orders-view">
        <div class="container">
          <div v-if="loading" class="ov-loading">{{ $t('common.loading') }}</div>

          <div v-else-if="loadError" class="ov-load-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>{{ $t('orders.loadFailed') }}</p>
          </div>

          <div v-else-if="orders.length === 0" class="ov-empty">
            <i class="fas fa-shopping-bag"></i>
            <h3>{{ $t('orders.empty') }}</h3>
            <p>{{ $t('orders.emptyHint') }}</p>
            <router-link to="/products" class="btn btn-primary">
              <i class="fas fa-store"></i> {{ $t('orders.goShopping') }}
            </router-link>
          </div>

          <div v-else class="ov-list">
            <div class="ov-summary">
              <i class="fas fa-list-ul"></i>
              {{ $t('orders.totalCount', { count: orders.length }) }}
            </div>

            <article v-for="order in orders" :key="order.id" class="ov-card">
              <header class="ov-card-head">
                <div class="ov-card-id">
                  <span class="ov-id-icon"><i class="fas fa-receipt"></i></span>
                  <div>
                    <span class="ov-id-label">{{ $t('orders.orderNumber') }}</span>
                    <strong>{{ displayOrderNo(order) }}</strong>
                  </div>
                </div>
                <span :class="['ov-status', 'ov-status--' + order.status]">
                  {{ getStatusText(order.status) }}
                </span>
              </header>

              <div class="ov-card-main">
                <section class="ov-product">
                  <div class="ov-product-visual">
                    <i class="fas fa-cube"></i>
                  </div>
                  <h3 class="ov-product-name">{{ order.productName }}</h3>
                  <div class="ov-chips">
                    <span class="ov-chip">
                      <i class="fas fa-layer-group"></i>
                      {{ $t('orders.quantity') }} {{ order.quantity }}
                    </span>
                    <span class="ov-chip">
                      <i class="fas fa-tag"></i>
                      {{ $t('orders.unitPrice') }} {{ order.price }} USDT
                    </span>
                    <span v-if="order.paymentMethod" class="ov-chip">
                      <i class="fab fa-bitcoin"></i>
                      {{ order.paymentMethod }}
                      <template v-if="order.network">· {{ order.network }}</template>
                    </span>
                  </div>
                  <div class="ov-amount">
                    <span>{{ $t('orders.total') }}</span>
                    <strong>{{ order.totalAmount }} USDT</strong>
                  </div>
                </section>

                <section class="ov-meta" :class="{ 'ov-meta--solo': !order._address }">
                  <div v-if="order._address" class="ov-meta-block">
                    <h4><i class="fas fa-map-marker-alt"></i> {{ $t('orders.shippingAddress') }}</h4>
                    <ul class="ov-meta-rows">
                      <li v-if="order._address.name">
                        <span>{{ $t('orders.recipientName') }}</span>
                        <em>{{ order._address.name }}</em>
                      </li>
                      <li v-if="order._address.phone">
                        <span>{{ $t('orders.recipientPhone') }}</span>
                        <em>{{ order._address.phone }}</em>
                      </li>
                      <li v-if="order._address.address">
                        <span>{{ $t('orders.addressDetail') }}</span>
                        <em>{{ order._address.address }}</em>
                      </li>
                    </ul>
                  </div>

                  <div class="ov-meta-block ov-meta-block--compact">
                    <h4><i class="fas fa-info-circle"></i> {{ $t('orders.orderInfo') }}</h4>
                    <ul class="ov-meta-rows">
                      <li v-if="order.txHash">
                        <span>{{ $t('orders.transactionHash') }}</span>
                        <em
                          class="ov-hash"
                          @dblclick="copyTxHash(order.txHash)"
                          :title="$t('orders.copyHint')"
                        >{{ order.txHash }}</em>
                      </li>
                      <li v-if="order.paymentMethod">
                        <span>{{ $t('orders.paymentMethod') }}</span>
                        <em>{{ order.paymentMethod }}</em>
                      </li>
                      <li v-if="order.network">
                        <span>{{ $t('orders.paymentNetwork') }}</span>
                        <em>{{ order.network }}</em>
                      </li>
                    </ul>
                  </div>
                </section>
              </div>

              <div class="ov-progress" :class="'ov-progress--' + order.status">
                <div
                  v-for="step in progressSteps"
                  :key="step.key"
                  :class="['ov-step', { 'ov-step--done': isStepDone(order.status, step.key), 'ov-step--active': order.status === step.key }]"
                >
                  <span class="ov-step-dot"><i :class="step.icon"></i></span>
                  <span class="ov-step-label">{{ $t(step.label) }}</span>
                </div>
              </div>

              <footer class="ov-card-foot">
                <div class="ov-times">
                  <span><i class="fas fa-clock"></i>{{ $t('orders.createdAt') }} {{ formatDate(order.createdAt) }}</span>
                  <span v-if="order.paidAt"><i class="fas fa-check-circle"></i>{{ $t('orders.paidAt') }} {{ formatDate(order.paidAt) }}</span>
                  <span v-if="order.completedAt"><i class="fas fa-flag-checkered"></i>{{ $t('orders.completedAt') }} {{ formatDate(order.completedAt) }}</span>
                </div>
                <div class="ov-actions">
                  <router-link :to="`/orders/${order.id}`" class="btn btn-secondary btn-sm">
                    <i class="fas fa-eye"></i> {{ $t('orders.details') }}
                  </router-link>
                  <router-link
                    v-if="order.status === 'pending'"
                    :to="`/orders/${order.id}/pay`"
                    class="btn btn-primary btn-sm"
                  >
                    <i class="fas fa-credit-card"></i> {{ $t('orders.payNow') }}
                  </router-link>
                </div>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import { parseShippingAddress } from '@/utils/shippingAddress'
import { displayOrderNo } from '@/utils/orderNo'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const { t, locale } = useI18n()
const orders = ref([])
const loading = ref(true)
const loadError = ref(false)

const progressSteps = [
  { key: 'pending', label: 'orders.progress.pending', icon: 'fas fa-wallet' },
  { key: 'paid', label: 'orders.progress.paid', icon: 'fas fa-check' },
  { key: 'completed', label: 'orders.progress.completed', icon: 'fas fa-box' },
]

const statusRank = { pending: 0, paid: 1, completed: 2, cancelled: -1 }

onMounted(async () => {
  try {
    const response = await api.get('/api/orders')
    orders.value = response.data.map((order) => ({
      ...order,
      _address: parseShippingAddress(order.shippingAddress),
    }))
  } catch (error) {
    console.error('Failed to fetch orders:', error)
    if (error.response?.status !== 401) {
      loadError.value = true
    }
  } finally {
    loading.value = false
  }
})

function getStatusText(status) {
  return t(`orders.status.${status}`, status)
}

function isStepDone(currentStatus, stepKey) {
  if (currentStatus === 'cancelled') return false
  return (statusRank[currentStatus] ?? 0) >= (statusRank[stepKey] ?? 0)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(dateStr).toLocaleString(fmtLocale)
}

async function copyTxHash(hash) {
  try {
    await navigator.clipboard.writeText(hash)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
.orders-view {
  padding: 2rem 0 3.5rem;
  min-height: 55vh;
}

.ov-loading {
  text-align: center;
  padding: 4rem;
  color: var(--primary-color);
}

.ov-load-error {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.ov-load-error i {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: #f87171;
}

.ov-empty {
  text-align: center;
  padding: 4rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  color: var(--text-secondary);
}

.ov-empty i {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  opacity: 0.45;
}

.ov-empty h3 {
  margin: 0 0 0.5rem;
  color: var(--text-primary);
}

.ov-empty p {
  margin: 0 0 1.5rem;
}

.ov-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: rgba(0, 212, 255, 0.06);
  border: 1px solid rgba(0, 212, 255, 0.15);
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.ov-summary i {
  color: var(--primary-color);
}

.ov-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ov-card {
  background: linear-gradient(145deg, rgba(0, 212, 255, 0.04) 0%, var(--bg-card) 40%);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.ov-card:hover {
  border-color: rgba(0, 212, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0, 212, 255, 0.1);
}

.ov-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
}

.ov-card-id {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ov-id-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 212, 255, 0.12);
  color: var(--primary-color);
}

.ov-id-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.1rem;
}

.ov-card-id strong {
  font-size: 1.1rem;
  color: var(--text-primary);
}

.ov-status {
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.ov-status--pending { background: rgba(255, 193, 7, 0.15); color: #ffc107; }
.ov-status--paid { background: rgba(0, 212, 255, 0.15); color: var(--primary-color); }
.ov-status--completed { background: rgba(67, 233, 123, 0.15); color: #43e97b; }
.ov-status--cancelled { background: rgba(245, 87, 108, 0.15); color: #f5576c; }

.ov-card-main {
  display: grid;
  grid-template-columns: minmax(240px, 0.9fr) minmax(0, 1.4fr);
  gap: 0;
  min-height: 220px;
}

.ov-product {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.5rem;
  border-right: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.12);
}

.ov-product-visual {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  color: var(--primary-color);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.05));
  border: 1px solid rgba(0, 212, 255, 0.25);
}

.ov-product-name {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.ov-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.ov-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
}

.ov-chip i {
  color: var(--primary-color);
  font-size: 0.72rem;
}

.ov-amount {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px dashed rgba(0, 212, 255, 0.25);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.ov-amount span {
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.ov-amount strong {
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--primary-color);
  letter-spacing: 0.02em;
}

.ov-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 0;
}

.ov-meta-block {
  padding: 1.35rem 1.5rem;
  height: 100%;
}

.ov-meta--solo {
  grid-template-columns: 1fr;
}

.ov-meta--solo .ov-meta-block:first-child {
  border-right: none;
}

.ov-meta:not(.ov-meta--solo) .ov-meta-block:first-child {
  border-right: 1px solid var(--border-color);
}

.ov-meta-block h4 {
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ov-meta-block h4 i {
  color: var(--primary-color);
}

.ov-meta-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.ov-meta-rows li {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ov-meta-rows span {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.ov-meta-rows em {
  font-style: normal;
  font-size: 0.92rem;
  color: var(--text-primary);
  word-break: break-word;
  line-height: 1.45;
}

.ov-hash {
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--primary-color);
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.06);
  border: 1px solid rgba(0, 212, 255, 0.2);
}

.ov-hash:hover {
  background: rgba(0, 212, 255, 0.12);
}

.ov-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 1rem 2rem;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.ov-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  position: relative;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.ov-step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 1rem;
  left: calc(50% + 1.1rem);
  width: calc(100% - 2.2rem);
  height: 2px;
  background: var(--border-color);
}

.ov-step--done:not(:last-child)::after,
.ov-step--active:not(:last-child)::after {
  background: linear-gradient(90deg, var(--primary-color), rgba(0, 212, 255, 0.3));
}

.ov-step-dot {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid var(--border-color);
  position: relative;
  z-index: 1;
}

.ov-step--done .ov-step-dot,
.ov-step--active .ov-step-dot {
  background: rgba(0, 212, 255, 0.15);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.ov-step--active .ov-step-dot {
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.35);
}

.ov-progress--cancelled .ov-step {
  opacity: 0.45;
}

.ov-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 1.5rem;
}

.ov-times {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.ov-times span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.ov-times i {
  color: var(--primary-color);
  width: 0.85rem;
}

.ov-actions {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 0.5rem 1.1rem;
  font-size: 0.85rem;
}

@media (max-width: 960px) {
  .ov-card-main {
    grid-template-columns: 1fr;
  }

  .ov-product {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .ov-meta {
    grid-template-columns: 1fr;
  }

  .ov-meta-block:first-child {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
}

@media (max-width: 640px) {
  .ov-card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .ov-progress {
    padding: 1rem;
  }

  .ov-step-label {
    font-size: 0.7rem;
  }

  .ov-card-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .ov-actions {
    justify-content: flex-end;
  }
}
</style>
