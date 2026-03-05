<template>
  <AdminLayout>
    <template #header-title>Payment Settings</template>

    <div class="payment-settings-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-wallet"></i> Payment Configuration</h2>
          <p>Configure USDT payment wallet and order auto-deletion settings</p>
        </div>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading settings...</span>
        </div>
      </div>

      <div v-else class="settings-card">
        <div class="settings-header">
          <i class="fas fa-cog"></i>
          <h3>Payment Settings</h3>
        </div>

        <form @submit.prevent="handleSubmit" class="settings-form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>
          <div v-if="success" class="alert alert-success">
            <i class="fas fa-check-circle"></i> Settings saved successfully!
          </div>

          <div class="form-group">
            <label for="wallet_address">
              <i class="fas fa-wallet"></i> USDT Wallet Address
              <span class="required">*</span>
            </label>
            <input
              type="text"
              id="wallet_address"
              v-model="form.wallet_address"
              required
              placeholder="Enter your USDT wallet address (e.g., TRC20 address)"
              class="form-input"
            />
            <p class="form-hint">
              <i class="fas fa-info-circle"></i>
              This is the wallet address where customers will send USDT payments
            </p>
          </div>

          <div class="form-group">
            <label for="network">
              <i class="fas fa-network-wired"></i> Network Type
              <span class="required">*</span>
            </label>
            <select id="network" v-model="form.network" class="form-input">
              <option value="TRC20">TRC20 (Tron Network) - Recommended</option>
              <option value="ERC20">ERC20 (Ethereum Network)</option>
              <option value="BEP20">BEP20 (BSC Network)</option>
            </select>
            <p class="form-hint">
              <i class="fas fa-exclamation-triangle"></i>
              TRC20 is recommended for lower transaction fees
            </p>
          </div>

          <div class="form-group">
            <label for="autoDeleteMinutes">
              <i class="fas fa-clock"></i> Auto-Delete Unpaid Orders (minutes)
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
              Unpaid orders will be automatically deleted after this time (1-1440 minutes)
            </p>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              <i class="fas fa-save"></i>
              {{ submitting ? 'Saving...' : 'Save Settings' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Payment Guide -->
      <div class="guide-card">
        <div class="guide-header">
          <i class="fas fa-book"></i>
          <h3>Payment Process Guide</h3>
        </div>
        <div class="guide-content">
          <div class="guide-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Customer Places Order</h4>
              <p>Customer selects products and creates an order in the system</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Payment Page Display</h4>
              <p>System shows your USDT wallet address and payment amount</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Customer Sends Payment</h4>
              <p>Customer transfers USDT to the displayed wallet address</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="step-number">4</div>
            <div class="step-content">
              <h4>Submit Transaction Hash</h4>
              <p>Customer submits the TX hash for verification</p>
            </div>
          </div>
          <div class="guide-step">
            <div class="step-number">5</div>
            <div class="step-content">
              <h4>Admin Verification</h4>
              <p>You verify the payment and update order status in admin panel</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const form = ref({
  wallet_address: '',
  network: 'TRC20',
  autoDeleteMinutes: 30
})
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const success = ref(false)

onMounted(async () => {
  try {
    const response = await api.get('/api/admin/payment-settings')
    if (response.data) {
      form.value = {
        wallet_address: response.data.wallet_address || '',
        network: response.data.network || 'TRC20',
        autoDeleteMinutes: response.data.autoDeleteMinutes || 30
      }
    }
  } catch (err) {
    console.error('Failed to fetch settings:', err)
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  submitting.value = true
  error.value = ''
  success.value = false

  try {
    await api.put('/api/admin/payment-settings', form.value)
    success.value = true
    setTimeout(() => { success.value = false }, 3000)
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save settings'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.payment-settings-page {
  animation: fadeIn 0.5s ease;
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

/* Payment Guide Card */
.guide-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.guide-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(67, 233, 123, 0.03);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.guide-header i {
  font-size: 1.25rem;
  color: #43e97b;
}

.guide-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.guide-content {
  padding: 1.5rem;
}

.guide-step {
  display: flex;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border-color);
}

.guide-step:last-child {
  border-bottom: none;
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--gradient-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1rem;
  flex-shrink: 0;
}

.step-content h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.step-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
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

  .guide-content {
    padding: 1rem;
  }
}
</style>
