<template>
  <AdminLayout>
    <template #header-title>{{ isEdit ? 'Edit Product' : 'Add Product' }}</template>

    <div class="product-form-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-box"></i>
            {{ isEdit ? 'Edit Product' : 'Add Product' }}
          </h2>
          <p>{{ isEdit ? 'Update product information and pricing' : 'Add a new product to your catalog' }}</p>
        </div>
        <router-link to="/admin/products" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> Back to List
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading product data...</span>
        </div>
      </div>

      <div v-else class="form-card">
        <form @submit.prevent="handleSubmit" class="form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>
          <div v-if="success" class="alert alert-success">
            <i class="fas fa-check-circle"></i> Product saved successfully!
          </div>

          <!-- Basic Information -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-info-circle"></i> Basic Information
            </h3>

            <div class="form-row form-row-2">
              <div class="form-group">
                <label for="name">
                  <i class="fas fa-tag"></i> Product Name
                  <span class="required">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  v-model="form.name"
                  required
                  class="form-input"
                  placeholder="e.g., Smart AI Assistant"
                />
              </div>
              <div class="form-group">
                <label for="date">
                  <i class="fas fa-calendar"></i> Release Date
                  <span class="required">*</span>
                </label>
                <input
                  type="date"
                  id="date"
                  v-model="form.date"
                  required
                  class="form-input"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="description">
                <i class="fas fa-align-left"></i> Product Description
                <span class="required">*</span>
              </label>
              <textarea
                id="description"
                v-model="form.description"
                rows="4"
                required
                class="form-input textarea-input"
                placeholder="Describe the product features, benefits, and specifications..."
              ></textarea>
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                Provide a clear and detailed description to help customers understand the product
              </p>
            </div>
          </div>

          <!-- Image -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-image"></i> Product Image
            </h3>

            <div class="form-group">
              <label for="image">
                <i class="fas fa-link"></i> Image URL
                <span class="required">*</span>
              </label>
              <input
                type="url"
                id="image"
                v-model="form.image"
                required
                class="form-input"
                placeholder="https://example.com/product-image.jpg"
              />
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                Enter a valid image URL. Supported formats: JPG, PNG, SVG, WebP
              </p>
            </div>

            <div v-if="form.image || previewUrl" class="image-preview-section">
              <label class="preview-label">Image Preview</label>
              <div class="image-preview-container">
                <img
                  :src="previewUrl"
                  alt="Product preview"
                  class="preview-image"
                  @error="handleImageError"
                />
                <div v-if="imageError" class="image-error">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>Failed to load image. Please check the URL.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pricing -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-dollar-sign"></i> Pricing
            </h3>

            <div class="form-group">
              <label for="priceUsdt">
                <i class="fab fa-bitcoin"></i> Price (USDT)
                <span class="required">*</span>
              </label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="priceUsdt"
                  v-model.number="form.priceUsdt"
                  step="0.01"
                  min="0"
                  required
                  class="form-input price-input"
                  placeholder="0.00"
                />
                <span class="currency-label">USDT</span>
              </div>
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                Enter the product price in USDT. Accepts decimal values up to 2 decimal places.
              </p>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="form-actions">
            <router-link to="/admin/products" class="btn btn-secondary">
              <i class="fas fa-times"></i> Cancel
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{ submitting ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => route.name === 'admin-product-edit')

const form = ref({
  name: '',
  description: '',
  image: '',
  priceUsdt: 0,
  date: new Date().toISOString().split('T')[0]
})

const previewUrl = ref('')
const imageError = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref(false)

// Form validation
const isValid = computed(() => {
  if (!form.value.name || !form.value.description) return false
  if (!form.value.image) return false
  if (!form.value.date) return false
  if (form.value.priceUsdt < 0) return false
  return true
})

// Watch for image changes
watch(() => form.value.image, (newVal) => {
  previewUrl.value = newVal
  imageError.value = false
}, { immediate: true })

// Clear messages on form change
watch(form, () => {
  success.value = false
  error.value = ''
}, { deep: true })

onMounted(async () => {
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await api.get(`/api/admin/products/${route.params.id}`)
      form.value = {
        name: response.data.name || '',
        description: response.data.description || '',
        image: response.data.image || '',
        priceUsdt: response.data.priceUsdt || response.data.price || 0,
        date: response.data.date || new Date().toISOString().split('T')[0]
      }
      previewUrl.value = form.value.image
    } catch (err) {
      error.value = 'Failed to load product data: ' + (err.response?.data?.message || err.message)
      setTimeout(() => {
        router.push('/admin/products')
      }, 2000)
    } finally {
      loading.value = false
    }
  }
})

function handleImageError() {
  imageError.value = true
}

async function handleSubmit() {
  if (!isValid.value) {
    error.value = 'Please fill in all required fields correctly'
    return
  }

  submitting.value = true
  error.value = ''
  success.value = false

  try {
    const submitData = {
      ...form.value,
      priceUsdt: parseFloat(form.value.priceUsdt) || 0
    }

    if (isEdit.value) {
      await api.put(`/api/admin/products/${route.params.id}`, submitData)
      success.value = true
    } else {
      await api.post('/api/admin/products', submitData)
      success.value = true
    }

    setTimeout(() => {
      router.push('/admin/products')
    }, 1500)
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save product. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.product-form-page {
  animation: fadeIn 0.5s ease;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
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

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
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

.form-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.form {
  padding: 2rem;
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

.form-section {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
}

.form-section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-title {
  font-size: 1.1rem;
  margin: 0 0 1.25rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.section-title i {
  color: var(--primary-color);
}

.form-row {
  display: grid;
  gap: 1.25rem;
}

.form-row-2 {
  grid-template-columns: 2fr 1fr;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
}

.form-group label i {
  color: var(--primary-color);
  font-size: 0.9rem;
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

.form-input.textarea-input {
  min-height: 120px;
  resize: vertical;
  font-family: inherit;
}

.form-hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  line-height: 1.4;
}

.form-hint i {
  font-size: 0.85rem;
  margin-top: 0.1rem;
  flex-shrink: 0;
}

/* Image Preview */
.image-preview-section {
  margin-top: 1rem;
}

.preview-label {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.image-preview-container {
  position: relative;
  display: inline-block;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-darker);
  border: 2px solid var(--border-color);
}

.preview-image {
  max-width: 100%;
  max-height: 300px;
  display: block;
}

.image-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(245, 87, 108, 0.9);
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

/* Price Input */
.price-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.price-input {
  flex: 1;
  padding-right: 80px;
}

.currency-label {
  position: absolute;
  right: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  pointer-events: none;
}

/* Form Actions */
.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover:not(:disabled) {
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
  .form {
    padding: 1.5rem;
  }

  .form-row-2 {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
