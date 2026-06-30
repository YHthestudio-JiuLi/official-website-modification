<template>
  <div>
    <AppHeader />
    <main>
      <div class="payment-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="loadError" class="load-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>{{ loadErrorMessage || $t('payment.loadFailed') }}</p>
          </div>

          <div v-else-if="notFound" class="empty-state">
            {{ $t('payment.notFound') }}
          </div>

          <div v-else-if="order" class="payment-container">
            <div class="payment-info">
              <div class="order-info-card">
                <h3><i class="fas fa-receipt"></i> {{ $t('payment.orderInfo') }}</h3>
                <div class="info-item">
                  <span>{{ $t('payment.orderNumber') }}: </span>
                  <span>{{ displayOrderNo(order) || '--' }}</span>
                </div>
                <div class="info-item">
                  <span>{{ $t('payment.productName') }}: </span>
                  <span>{{ order.productName }}</span>
                </div>
                <div class="info-item">
                  <span>{{ $t('payment.quantity') }}: </span>
                  <span>{{ order.quantity }}</span>
                </div>
                <div class="info-item">
                  <span>{{ $t('payment.paymentAmount') }}: </span>
                  <span class="amount-highlight">{{ order.totalAmount }} USDT</span>
                </div>
                <div v-if="order.status" class="info-item">
                  <span>{{ $t('payment.orderStatus') }}: </span>
                  <span :class="['status-badge', 'status-' + order.status]">
                    {{ getStatusText(order.status) }}
                  </span>
                </div>
                <div v-if="order.shippingAddress && order.status !== 'pending'" class="info-item">
                  <span>{{ $t('payment.recipientInfo') }}: </span>
                  <span>{{ order.shippingAddress }}</span>
                </div>
              </div>

              <div v-if="normalizeOrderStatus(order.status) === 'pending'" class="payment-instructions">
                <h3><i class="fab fa-bitcoin"></i> {{ $t('payment.instructionsTitle') }}</h3>
                <div class="wallet-address">
                  <label>{{ $t('payment.walletAddressLabel', { network: order.network || 'TRC20' }) }}: </label>
                  <div class="address-box">
                    <code id="wallet-address">{{ order.usdtWallet }}</code>
                    <button type="button" @click="copyAddress" class="btn-copy">
                      <i class="fas fa-copy"></i> {{ copied ? $t('payment.copied') : $t('payment.copyAddress') }}
                    </button>
                  </div>
                </div>
                <div class="payment-steps">
                  <h4>{{ $t('payment.stepsTitle') }}:</h4>
                  <ol>
                    <li>{{ $t('payment.step1', { network: order.network || 'TRC20' }) }}</li>
                    <li>{{ $t('payment.step2', { amount: order.totalAmount }) }}</li>
                    <li>{{ $t('payment.step3') }}</li>
                    <li>{{ $t('payment.step4') }}</li>
                  </ol>
                </div>
              </div>
            </div>

            <div v-if="normalizeOrderStatus(order.status) === 'pending'" class="payment-form-card">
              <h3><i class="fas fa-check-circle"></i> {{ $t('payment.confirmTitle') }}</h3>
              <form @submit.prevent="handleConfirmPayment" class="payment-form">
                <div class="form-group">
                  <label for="recipientName">
                    <i class="fas fa-user"></i> {{ $t('payment.recipientName') }} *
                  </label>
                  <input
                    type="text"
                    id="recipientName"
                    v-model="recipientName"
                    required
                    :placeholder="$t('payment.recipientNamePlaceholder')"
                  />
                </div>
                <div class="form-group">
                  <label for="recipientPhone">
                    <i class="fas fa-phone"></i> {{ $t('payment.recipientPhone') }} *
                  </label>
                  <input
                    type="text"
                    id="recipientPhone"
                    v-model="recipientPhone"
                    required
                    :placeholder="$t('payment.recipientPhonePlaceholder')"
                  />
                  <small>{{ $t('payment.recipientPhoneHint') }}</small>
                </div>
                <div class="form-group">
                  <label for="shippingAddressDetail">
                    <i class="fas fa-map-marker-alt"></i> {{ $t('payment.recipientAddress') }} *
                  </label>
                  <input
                    type="text"
                    id="shippingAddressDetail"
                    v-model="shippingAddressDetail"
                    required
                    :placeholder="$t('payment.recipientAddressPlaceholder')"
                  />
                </div>
                <div class="form-group">
                  <label for="txHash">
                    <i class="fas fa-hashtag"></i> {{ $t('payment.txHash') }} *
                  </label>
                  <input
                    type="text"
                    id="txHash"
                    v-model="txHash"
                    required
                    :placeholder="$t('payment.txHashPlaceholder')"
                  />
                  <small>{{ $t('payment.txHashHint') }}</small>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-large" :disabled="submitting">
                  <i class="fas fa-check"></i> {{ submitting ? $t('common.loading') : $t('payment.submit') }}
                </button>
              </form>
            </div>

            <div v-else-if="normalizeOrderStatus(order.status) === 'paid'" class="payment-success">
              <i class="fas fa-check-circle success-icon"></i>
              <h3>{{ $t('payment.successTitle') }}</h3>
              <p>{{ $t('payment.successDesc') }}</p>
              <div v-if="order.txHash" class="tx-hash">
                <span>{{ $t('payment.txHashDisplay') }}: </span>
                <code>{{ order.txHash }}</code>
              </div>
              <router-link to="/orders" class="btn btn-primary">{{ $t('payment.viewOrders') }}</router-link>
            </div>

            <div v-else-if="isPostShipment(order.status)" class="payment-success payment-success--completed">
              <i class="fas fa-box-open success-icon"></i>
              <h3>{{ $t('payment.completedTitle') }}</h3>
              <p>{{ $t('payment.completedDesc') }}</p>
              <router-link to="/orders" class="btn btn-primary">{{ $t('payment.viewOrders') }}</router-link>
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
import { useI18n } from 'vue-i18n'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import { displayOrderNo } from '@/utils/orderNo'
import { usePaymentPage } from '@/composables/usePaymentPage'
import { normalizeOrderStatus, isPostShipment, getOrderStatusLabel } from '@/utils/orderStatus'
import { copyText, openOkxAfterCopy } from '@/utils/paymentClipboard'

const { t } = useI18n()
const { order, loading, loadError, loadErrorMessage, notFound, submitting, isCheckout, load, submit } = usePaymentPage()

const txHash = ref('')
const recipientName = ref('')
const recipientPhone = ref('')
const shippingAddressDetail = ref('')
const copied = ref(false)

onMounted(() => {
  load()
})

function getStatusText(status) {
  return getOrderStatusLabel(status, t)
}

async function copyAddress() {
  const copiedOk = await copyText(order.value?.usdtWallet || '')
  if (copiedOk) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
    openOkxAfterCopy(order.value)
  } else {
    console.error('Failed to copy wallet address')
  }
}

async function handleConfirmPayment() {
  if (order.value?.status !== 'pending') return
  if (!recipientName.value?.trim()) {
    alert(t('payment.recipientNameRequired'))
    return
  }
  if (!recipientPhone.value?.trim()) {
    alert(t('payment.recipientPhoneRequired'))
    return
  }
  if (!shippingAddressDetail.value?.trim()) {
    alert(t('payment.addressRequired'))
    return
  }
  if (!txHash.value?.trim()) {
    alert(t('payment.txHashRequired'))
    return
  }
  const shippingAddress = t('payment.shippingAddressValue', {
    name: recipientName.value.trim(),
    phone: recipientPhone.value.trim(),
    address: shippingAddressDetail.value.trim(),
  })
  const result = await submit({
    shippingAddress,
    txHash: txHash.value.trim(),
  })
  if (!result.ok) {
    if (result.message) {
      alert(result.message)
    }
    return
  }
  if (isCheckout.value) {
    txHash.value = ''
  }
}
</script>

<style scoped>
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
</style>
