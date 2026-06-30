<template>
  <div v-if="visible" class="modal-overlay" @click="$emit('close')">
    <div class="modal-container modal-large" @click.stop>
      <div class="modal-header">
        <i class="fas fa-shopping-cart" />
        <h3>{{ $t('admin.orders.detail.title', { id: displayOrderNo(order || {}) }) }}</h3>
        <button type="button" class="modal-close" @click="$emit('close')">
          <i class="fas fa-times" />
        </button>
      </div>
      <div class="modal-body">
        <div class="order-detail-grid">
          <div class="detail-section">
            <h4><i class="fas fa-user" /> {{ $t('admin.orders.detail.customerInfo') }}</h4>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.username') }}</span>
              <span class="detail-value">{{ order?.username }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.userId') }}</span>
              <span class="detail-value">#{{ order?.userId }}</span>
            </div>
          </div>

          <div class="detail-section">
            <h4><i class="fas fa-box" /> {{ $t('admin.orders.detail.productInfo') }}</h4>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.productName') }}</span>
              <span class="detail-value">{{ order?.productName }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.quantity') }}</span>
              <span class="detail-value">{{ order?.quantity }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.unitPrice') }}</span>
              <span class="detail-value">{{ order?.price }} USDT</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.totalAmount') }}</span>
              <span class="detail-value highlight">{{ order?.totalAmount }} USDT</span>
            </div>
          </div>

          <div class="detail-section">
            <h4><i class="fas fa-map-marker-alt" /> {{ $t('admin.orders.detail.shippingAddress') }}</h4>
            <div class="detail-item full-width">
              <span class="detail-value">{{ order?.shippingAddress || $t('admin.orders.detail.noShippingAddress') }}</span>
            </div>
          </div>

          <div class="detail-section">
            <h4><i class="fas fa-link" /> {{ $t('admin.orders.detail.transactionInfo') }}</h4>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.txHash') }}</span>
              <span class="detail-value tx-hash-value">{{ order?.txHash || $t('admin.orders.na') }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.status') }}</span>
              <span :class="['status-badge', 'status-' + normalizeOrderStatus(order?.status)]">
                {{ getStatusText(order?.status) }}
              </span>
            </div>
          </div>

          <div class="detail-section">
            <h4><i class="fas fa-calendar" /> {{ $t('admin.orders.detail.timestamps') }}</h4>
            <div class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.createdAt') }}</span>
              <span class="detail-value">{{ formatDate(order?.createdAt) }}</span>
            </div>
            <div v-if="order?.paidAt" class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.paidAt') }}</span>
              <span class="detail-value">{{ formatDate(order?.paidAt) }}</span>
            </div>
            <div v-if="order?.shippedAt" class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.shippedAt') }}</span>
              <span class="detail-value">{{ formatDate(order?.shippedAt) }}</span>
            </div>
            <div v-if="order?.completedAt" class="detail-item">
              <span class="detail-label">{{ $t('admin.orders.detail.completedAt') }}</span>
              <span class="detail-value">{{ formatDate(order?.completedAt) }}</span>
            </div>
          </div>

          <div class="detail-section detail-section--logistics">
            <h4><i class="fas fa-truck" /> {{ $t('admin.orders.detail.logistics') }}</h4>
            <div class="tracking-form">
              <label class="detail-label" for="tracking-number-input">
                {{ $t('admin.orders.detail.trackingNumber') }}
              </label>
              <input
                id="tracking-number-input"
                :value="trackingInput"
                type="text"
                class="tracking-input"
                :placeholder="$t('admin.orders.detail.trackingPlaceholder')"
                maxlength="64"
                :disabled="savingTracking"
                @input="onTrackingInput"
                @blur="$emit('flush-save')"
                @keyup.enter="$emit('flush-save')"
              >
              <p v-if="savingTracking" class="tracking-save-status">
                <i class="fas fa-spinner fa-spin" /> {{ $t('admin.orders.detail.trackingSaving') }}
              </p>
              <div v-if="trackingInput" class="tracking-footer">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-clear-tracking"
                  :disabled="savingTracking"
                  @click="$emit('clear-tracking')"
                >
                  <i class="fas fa-eraser" /> {{ $t('admin.orders.detail.clearTracking') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">
          <i class="fas fa-times" /> {{ $t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { displayOrderNo } from '@/utils/orderNo'
import { normalizeOrderStatus, getAdminOrderStatusLabel } from '@/utils/orderStatus'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Object,
    default: null,
  },
  trackingInput: {
    type: String,
    default: '',
  },
  savingTracking: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'tracking-input', 'schedule-save', 'flush-save', 'clear-tracking'])
const { t, locale } = useI18n()

function onTrackingInput(event) {
  emit('tracking-input', event.target.value)
  emit('schedule-save')
}

function getStatusText(status) {
  if (!status) return ''
  return getAdminOrderStatusLabel(status, t)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(dateStr).toLocaleString(fmtLocale)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-container.modal-large {
  max-width: 800px;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  flex: 1;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
}

.modal-close:hover {
  color: var(--primary-color);
}

.modal-body {
  padding: 1.5rem;
}

.order-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.detail-section {
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.25rem;
}

.detail-section h4 {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-section h4 i {
  color: var(--primary-color);
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 1rem;
}

.detail-item.full-width {
  flex-direction: column;
}

.detail-label {
  color: var(--text-secondary);
  font-size: 0.85rem;
  white-space: nowrap;
}

.detail-value {
  color: var(--text-primary);
  font-size: 0.9rem;
  text-align: right;
  word-break: break-word;
}

.detail-value.highlight {
  color: var(--primary-color);
  font-weight: 600;
  font-size: 1.1rem;
}

.detail-value.tx-hash-value {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.status-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.status-badge.status-paid {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.status-badge.status-shipped {
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
}

.status-badge.status-delivered,
.status-badge.status-completed {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

.detail-section--logistics {
  padding: 1rem 1.15rem;
}

.detail-section--logistics h4 {
  margin-bottom: 0.65rem;
  font-size: 0.9rem;
}

.tracking-form {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.tracking-input {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-darker, rgba(0, 0, 0, 0.2));
  color: var(--text-primary);
  font-size: 0.92rem;
}

.tracking-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.15);
}

.tracking-save-status {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.tracking-save-status i {
  margin-right: 0.35rem;
  color: var(--primary-color);
}

.tracking-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.15rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

@media (max-width: 576px) {
  .order-detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .detail-value {
    text-align: left;
  }
}
</style>
