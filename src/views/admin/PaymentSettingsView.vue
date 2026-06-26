<template>
  <div class="payment-settings-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-wallet"></i> {{ $t('admin.paymentSettings.heading') }}</h2>
          <p>{{ $t('admin.paymentSettings.subtitle') }}</p>
        </div>
      </div>

      <AdminNoPermissionCard v-if="!canAccessPage" message-key="admin.paymentSettings.noPermission" />

      <div v-else-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.paymentSettings.loading') }}</span>
        </div>
      </div>

      <div v-else class="settings-card">
        <div class="settings-header">
          <i class="fas fa-cog"></i>
          <h3>{{ $t('admin.paymentSettings.cardTitle') }}</h3>
        </div>

        <form @submit.prevent="handleSubmit" class="settings-form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>
          <div v-if="success" class="alert alert-success">
            <i class="fas fa-check-circle"></i> {{ $t('admin.paymentSettings.saved') }}
          </div>

          <fieldset :disabled="!canManage" class="settings-fieldset">
          <div class="form-group">
            <label for="wallet_address">
              <i class="fas fa-wallet"></i> {{ $t('admin.paymentSettings.walletAddress') }}
              <span class="required">*</span>
            </label>
            <input
              type="text"
              id="wallet_address"
              v-model="form.wallet_address"
              required
              :disabled="!canManage"
              :placeholder="$t('admin.paymentSettings.walletAddressPlaceholder')"
              class="form-input"
            />
            <p class="form-hint">
              <i class="fas fa-info-circle"></i>
              {{ $t('admin.paymentSettings.walletAddressHint') }}
            </p>
          </div>

          <div class="form-group">
            <label for="network">
              <i class="fas fa-network-wired"></i> {{ $t('admin.paymentSettings.network') }}
              <span class="required">*</span>
            </label>
            <select id="network" v-model="form.network" class="form-input" :disabled="!canManage">
              <option value="TRC20">{{ $t('admin.paymentSettings.networkTrc20') }}</option>
              <option value="ERC20">{{ $t('admin.paymentSettings.networkErc20') }}</option>
              <option value="BEP20">{{ $t('admin.paymentSettings.networkBep20') }}</option>
            </select>
            <p class="form-hint">
              <i class="fas fa-exclamation-triangle"></i>
              {{ $t('admin.paymentSettings.networkHint') }}
            </p>
          </div>

          <div class="form-group">
            <label for="autoDeleteMinutes">
              <i class="fas fa-clock"></i> {{ $t('admin.paymentSettings.autoDeleteMinutes') }}
              <span class="required">*</span>
            </label>
            <input
              type="number"
              id="autoDeleteMinutes"
              v-model.number="form.autoDeleteMinutes"
              min="1"
              max="1440"
              required
              placeholder="30"
              class="form-input"
            />
            <p class="form-hint">
              <i class="fas fa-info-circle"></i>
              {{ $t('admin.paymentSettings.autoDeleteMinutesHint') }}
            </p>
          </div>

          <div class="form-section">
            <div class="section-heading">
              <i class="fas fa-link"></i>
              <div>
                <h4>{{ $t('admin.paymentSettings.txVerifySection') }}</h4>
                <p>{{ $t('admin.paymentSettings.txVerifySectionHint') }}</p>
              </div>
            </div>

            <div class="form-group">
              <label for="txVerifyMaxUnderpayUsdt">
                <i class="fas fa-coins"></i> {{ $t('admin.paymentSettings.txVerifyMaxUnderpayUsdt') }}
                <span class="required">*</span>
              </label>
              <input
                type="number"
                id="txVerifyMaxUnderpayUsdt"
                v-model.number="form.txVerifyMaxUnderpayUsdt"
                min="0"
                step="0.01"
                required
                placeholder="5"
                class="form-input"
              />
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                {{ $t('admin.paymentSettings.txVerifyMaxUnderpayUsdtHint') }}
              </p>
            </div>

            <div class="form-group">
              <label for="txVerifyMaxAgeHours">
                <i class="fas fa-hourglass-half"></i> {{ $t('admin.paymentSettings.txVerifyMaxAgeHours') }}
                <span class="required">*</span>
              </label>
              <input
                type="number"
                id="txVerifyMaxAgeHours"
                v-model.number="form.txVerifyMaxAgeHours"
                min="0"
                max="168"
                placeholder="2"
                class="form-input"
              />
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                {{ $t('admin.paymentSettings.txVerifyMaxAgeHoursHint') }}
              </p>
            </div>
          </div>
          </fieldset>

          <div class="form-actions">
            <p v-if="!canManage" class="form-hint read-only-hint">
              <i class="fas fa-lock"></i> {{ $t('admin.paymentSettings.readOnlyHint') }}
            </p>
            <div v-if="success" class="save-success-inline">
              <i class="fas fa-check-circle"></i> {{ $t('admin.paymentSettings.saved') }}
            </div>
            <button v-if="canManage" type="submit" class="btn btn-primary" :disabled="submitting">
              <i class="fas fa-save"></i>
              {{ submitting ? $t('admin.paymentSettings.saving') : $t('admin.paymentSettings.save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { fetchPaymentSettings, updatePaymentSettings } from '@/services/v2/admin/paymentSettings'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import AdminNoPermissionCard from '@/components/admin/AdminNoPermissionCard.vue'

const { has } = useAdminPermissions()
const canView = computed(() => has('payment.view') || has('payment.manage'))
const canManage = computed(() => has('payment.manage'))
const canAccessPage = computed(() => canView.value)

const { t } = useI18n()

const form = ref({
  wallet_address: '',
  network: 'TRC20',
  autoDeleteMinutes: 30,
  txVerifyMaxUnderpayUsdt: 5,
  txVerifyMaxAgeHours: 2,
})
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const success = ref(false)

function applySettings(data) {
  if (!data) return
  form.value = {
    wallet_address: data.wallet_address || '',
    network: data.network || 'TRC20',
    autoDeleteMinutes: data.autoDeleteMinutes ?? 30,
    txVerifyMaxUnderpayUsdt: data.txVerifyMaxUnderpayUsdt != null ? Number(data.txVerifyMaxUnderpayUsdt) : 5,
    txVerifyMaxAgeHours: data.txVerifyMaxAgeHours != null ? Number(data.txVerifyMaxAgeHours) : 2,
  }
}

function buildPayload() {
  const underpay = Number(form.value.txVerifyMaxUnderpayUsdt)
  const maxAge = Number(form.value.txVerifyMaxAgeHours)
  return {
    ...form.value,
    txVerifyMaxUnderpayUsdt: Number.isFinite(underpay) ? Math.max(0, underpay) : 0,
    txVerifyMaxAgeHours: Number.isFinite(maxAge) ? Math.max(0, Math.trunc(maxAge)) : 0,
  }
}

function extractSaveError(err) {
  const data = err.response?.data
  if (data?.message) return data.message
  const errors = data?.errors
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors).flat()[0]
    if (first) return first
  }
  return t('admin.paymentSettings.saveFailed')
}

onMounted(async () => {
  if (!canAccessPage.value) {
    loading.value = false
    return
  }
  try {
    const response = await fetchPaymentSettings()
    applySettings(response.data)
  } catch (err) {
    console.error('Failed to fetch settings:', err)
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  if (!canManage.value) return
  submitting.value = true
  error.value = ''
  success.value = false

  try {
    const response = await updatePaymentSettings(buildPayload())
    applySettings(response.data)
    success.value = true
    ElMessage.success(t('admin.paymentSettings.saved'))
    setTimeout(() => { success.value = false }, 3000)
  } catch (err) {
    error.value = extractSaveError(err)
    ElMessage.error(error.value)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.payment-settings-page {
  animation: fadeIn 0.12s ease;
}

.page-header {
  margin-bottom: 2rem;
}

.header-content h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-secondary);
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.settings-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  margin-bottom: 2rem;
  overflow: hidden;
}

.settings-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.settings-header i {
  font-size: 1.25rem;
  color: var(--primary-color);
}

.settings-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.settings-form {
  padding: 1.5rem;
}

.form-section {
  margin: 1.5rem 0;
  padding: 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.02);
}

.section-heading {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.section-heading > i {
  font-size: 1.25rem;
  color: var(--primary-color);
  margin-top: 0.15rem;
}

.section-heading h4 {
  margin: 0 0 0.35rem 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.section-heading p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.alert {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

.alert-success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-group label i {
  color: var(--primary-color);
}

.required {
  color: #f5576c;
  margin-left: 0.25rem;
}

.form-input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: all 0.3s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.form-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

select.form-input {
  cursor: pointer;
}

.form-hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.form-hint i {
  font-size: 0.85rem;
  margin-top: 0.1rem;
}

.form-actions {
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.form-actions .btn-primary {
  margin-left: auto;
}

.save-success-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #43e97b;
  font-size: 0.95rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .settings-form {
    padding: 1rem;
  }

  .form-section {
    padding: 1rem;
  }
}
</style>
