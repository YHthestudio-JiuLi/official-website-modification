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
                <i class="fas fa-upload"></i> Upload Images
                <span class="required">*</span>
              </label>
              <input
                type="file"
                id="image"
                accept="image/*"
                class="form-input"
                multiple
                @change="handleImageSelect"
              />
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                支持多张图片。格式：JPG、PNG、GIF、WebP、SVG；单张最大 5MB
              </p>
              <div v-if="uploadingImage" class="uploading-text">
                <i class="fas fa-spinner fa-spin"></i> Uploading image...
              </div>
            </div>

            <div v-if="imageList.length" class="image-preview-section">
              <label class="preview-label">Image Preview ({{ imageList.length }})</label>
              <div class="image-preview-grid">
                <div v-for="(img, idx) in imageList" :key="img + idx" class="image-preview-item">
                  <img
                    :src="img"
                    alt="Product preview"
                    class="preview-image"
                    @error="handleImageError"
                  />
                  <button type="button" class="btn-delete-image" @click="removeImage(idx)">
                    <i class="fas fa-trash"></i>
                  </button>
                  <span v-if="idx === 0" class="cover-badge">封面</span>
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
            <button type="submit" class="btn btn-primary" :disabled="submitting || uploadingImage || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{ submitting ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Toast Notification -->
    <div v-if="toast.visible" :class="['toast', toast.type]">
      <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
      <span>{{ toast.message }}</span>
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

const imageList = ref([])
const uploadingImage = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

// Form validation
const isValid = computed(() => {
  if (!form.value.name || !form.value.description) return false
  if (!imageList.value.length) return false
  if (!form.value.date) return false
  if (form.value.priceUsdt < 0) return false
  return true
})

function parseImageList(rawImage) {
  if (!rawImage) return []
  if (Array.isArray(rawImage)) return rawImage.filter(Boolean)
  if (typeof rawImage !== 'string') return []
  const raw = rawImage.trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
    } catch (_e) {}
  }
  return [raw]
}

// Clear error on form change
watch(form, () => {
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
      imageList.value = parseImageList(response.data.images?.length ? response.data.images : response.data.image)
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
  // 占位：预览失败时不影响提交流程
}

async function handleImageSelect(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  uploadingImage.value = true
  error.value = ''

  try {
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image is too large. Max size is 5MB.')
      }
      const formData = new FormData()
      formData.append('image', file)
      const response = await api.post('/api/admin/upload/product-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      const imageUrl = response.data?.image
      if (!imageUrl) {
        throw new Error('Invalid upload response')
      }
      imageList.value.push(imageUrl)
    }
    form.value.image = imageList.value[0] || ''
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to upload image'
  } finally {
    uploadingImage.value = false
    event.target.value = ''
  }
}

async function removeImage(index) {
  const target = imageList.value[index]
  if (!target) return
  imageList.value.splice(index, 1)
  form.value.image = imageList.value[0] || ''
  if (typeof target === 'string' && target.startsWith('/uploads/products/')) {
    try {
      await api.delete('/api/admin/upload/product-image', { data: { image: target } })
    } catch (_e) {}
  }
}

async function handleSubmit() {
  if (!isValid.value) {
    error.value = 'Please fill in all required fields correctly'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const normalizedImages = imageList.value.filter(Boolean)
    const submitData = {
      ...form.value,
      image: normalizedImages.length > 1 ? JSON.stringify(normalizedImages) : (normalizedImages[0] || ''),
      priceUsdt: parseFloat(form.value.priceUsdt) || 0
    }

    if (isEdit.value) {
      await api.put(`/api/admin/products/${route.params.id}`, submitData)
    } else {
      await api.post('/api/admin/products', submitData)
    }

    showToast('Product saved successfully', 'success')
    setTimeout(() => {
      router.back()
    }, 1500)
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save product. Please try again.'
  } finally {
    submitting.value = false
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
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

.uploading-text {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.image-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}

.image-preview-item {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-darker);
  border: 2px solid var(--border-color);
}

.preview-image {
  width: 100%;
  height: 140px;
  object-fit: cover;
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

.btn-delete-image {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(245, 87, 108, 0.95);
  color: #fff;
  cursor: pointer;
}

.cover-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
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

/* Toast Notification */
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: slideInRight 0.3s ease;
  z-index: 2000;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.toast.success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.toast.error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 768px) {
  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }
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
