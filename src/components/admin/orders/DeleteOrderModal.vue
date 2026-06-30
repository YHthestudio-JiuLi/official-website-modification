<template>
  <div v-if="visible" class="modal-overlay" @click="$emit('close')">
    <div class="modal-container" @click.stop>
      <div class="modal-header danger">
        <i class="fas fa-exclamation-triangle" />
        <h3>{{ $t('admin.orders.deleteModal.title') }}</h3>
      </div>
      <div class="modal-body">
        <p>{{ $t('admin.orders.deleteModal.confirmText') }}</p>
        <div class="order-info-box">
          <div class="order-details">
            <p class="order-id-text">
              <strong>{{ $t('admin.orders.deleteModal.orderLabel', { id: orderLabel }) }}</strong>
            </p>
            <p class="order-customer-text">
              <i class="fas fa-user" /> {{ order?.username }}
            </p>
            <p class="order-amount-text">
              <i class="fas fa-dollar-sign" /> {{ order?.totalAmount }} USDT
            </p>
          </div>
        </div>
        <div class="warning-box">
          <i class="fas fa-exclamation-circle" />
          <div class="warning-content">
            <p><strong>{{ $t('admin.orders.deleteModal.cannotUndo') }}</strong></p>
            <p>{{ $t('admin.orders.deleteModal.permanentDelete') }}</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">
          <i class="fas fa-times" /> {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn btn-danger" @click="$emit('confirm')">
          <i class="fas fa-trash" /> {{ $t('admin.orders.deleteModal.deleteOrder') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Object,
    default: null,
  },
  orderLabel: {
    type: String,
    default: '',
  },
})

defineEmits(['close', 'confirm'])

const order = computed(() => props.order)
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
  max-width: 500px;
  width: 90%;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header.danger i {
  color: #ffc107;
  font-size: 1.3rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem;
  color: var(--text-secondary);
}

.order-info-box {
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  margin: 1rem 0;
}

.order-details p {
  margin: 0 0 0.5rem;
}

.order-id-text {
  color: var(--text-primary) !important;
  font-size: 1rem;
}

.order-customer-text,
.order-amount-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.order-amount-text {
  color: var(--primary-color) !important;
  font-weight: 600;
}

.warning-box {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(245, 87, 108, 0.1);
  border: 1px solid #f5576c;
  border-radius: 8px;
}

.warning-box i {
  color: #f5576c;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.warning-content p {
  color: #f5576c;
  margin: 0;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
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
  transition: all 0.3s ease;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
}

.btn-danger {
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
}
</style>
