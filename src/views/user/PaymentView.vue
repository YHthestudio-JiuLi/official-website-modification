<template>
  <div>
    <AppHeader />
    <main>
      <div class="payment-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="!order" class="empty-state">
            {{ $t('payment.notFound') }}
          </div>

          <div v-else class="payment-container">
            <div class="payment-info">
              <div class="order-info-card">
                <h3><i class="fas fa-receipt"></i> {{ $t('payment.orderInfo') }}</h3>
                <div class="info-item">
                  <span>{{ $t('payment.orderNumber') }}: </span>
                  <span>{{ displayOrderNo(order) }}</span>
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
                <div v-if="order.status === 'pending'" class="info-item">
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

              <div v-if="order.status === 'pending'" class="payment-instructions">
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

            <div v-if="order.status === 'pending'" class="payment-form-card">
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
                  <small>{{ $t('payment.recipientHint') }}</small>
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

            <div v-else-if="order.status === 'paid'" class="payment-success">
              <i class="fas fa-check-circle success-icon"></i>
              <h3>{{ $t('payment.successTitle') }}</h3>
              <p>{{ $t('payment.successDesc') }}</p>
              <div v-if="order.txHash" class="tx-hash">
                <span>{{ $t('payment.txHashDisplay') }}: </span>
                <code>{{ order.txHash }}</code>
              </div>
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
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import { displayOrderNo } from '@/utils/orderNo'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const order = ref(null)
const txHash = ref('')
const recipientName = ref('')
const recipientPhone = ref('')
const shippingAddressDetail = ref('')
const loading = ref(true)
const submitting = ref(false)
const copied = ref(false)

onMounted(async () => {
  try {
    const response = await api.get(`/api/orders/${route.params.id}`)
    order.value = response.data
  } catch (error) {
    console.error('Failed to fetch order:', error)
  } finally {
    loading.value = false
  }
})

function getStatusText(status) {
  const key = `orders.status.${status}`
  const translated = t(key)
  return translated !== key ? translated : status
}

async function copyAddress() {
  const copiedOk = await copyText(order.value.usdtWallet || '')
  if (copiedOk) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } else {
    console.error('Failed to copy wallet address')
  }

  openOkxAfterCopy()
}

async function copyText(text) {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 忽略并进入回退方案
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function openOkxAfterCopy() {
  const { deepLink, universalLink } = buildOkxLinks()
  if (isMobileBrowser()) {
    if (/Android/i.test(navigator.userAgent || '')) {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = deepLink
      document.body.appendChild(iframe)
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    } else {
      window.location.href = deepLink
    }
    return
  }
  window.open(universalLink, '_blank', 'noopener,noreferrer')
}

function buildOkxLinks() {
  const address = order.value?.usdtWallet || ''
  const amount = order.value?.totalAmount || ''
  const network = (order.value?.network || 'TRC20').toUpperCase()
  const params = new URLSearchParams({
    toAddress: address,
    amount: String(amount),
    chain: network,
    token: 'USDT'
  })
  const query = params.toString()
  return {
    deepLink: `okx://wallet/transfer?${query}`,
    universalLink: `https://www.okx.com/web3?open=wallet/transfer&${query}`
  }
}

function isMobileBrowser() {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

async function handleConfirmPayment() {
  if (!recipientName.value || !recipientName.value.trim()) {
    alert(t('payment.recipientNameRequired'))
    return
  }
  if (!recipientPhone.value || !recipientPhone.value.trim()) {
    alert(t('payment.recipientPhoneRequired'))
    return
  }
  if (!shippingAddressDetail.value || !shippingAddressDetail.value.trim()) {
    alert(t('payment.addressRequired'))
    return
  }
  if (!txHash.value || !txHash.value.trim()) {
    alert(t('payment.txHashRequired'))
    return
  }
  const shippingAddress = t('payment.shippingAddressValue', {
    name: recipientName.value.trim(),
    phone: recipientPhone.value.trim(),
    address: shippingAddressDetail.value.trim(),
  })
  submitting.value = true
  try {
    await api.post(`/api/orders/${route.params.id}/confirm`, {
      txHash: txHash.value.trim(),
      shippingAddress
    })
    try {
      const response = await api.get(`/api/orders/${route.params.id}`)
      order.value = response.data
    } catch (refreshError) {
      console.error('Failed to refresh order:', refreshError)
    }
  } catch (error) {
    console.error('Failed to confirm payment:', error)
    const data = error.response?.data || {}
    if (data.deleted) {
      alert(data.message || t('payment.orderDeleted'))
      router.push('/orders')
      return
    }
    alert(data.message || data.errors?.txHash?.[0] || t('payment.submitFailed'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
</style>
