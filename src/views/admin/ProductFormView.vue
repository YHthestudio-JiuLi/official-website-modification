<template>
  <AdminLayout>
    <template #header-title>{{ isEdit ? $t('admin.productForm.editTitle') : $t('admin.productForm.addTitle') }}</template>

    <div class="product-form-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-box"></i>
            {{ isEdit ? $t('admin.productForm.editTitle') : $t('admin.productForm.addTitle') }}
          </h2>
          <p>{{ isEdit ? $t('admin.productForm.editSubtitle') : $t('admin.productForm.addSubtitle') }}</p>
        </div>
        <router-link to="/admin/products" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> {{ $t('admin.productForm.back') }}
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.productForm.loading') }}</span>
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
              <i class="fas fa-info-circle"></i> {{ $t('admin.productForm.basicSection') }}
            </h3>

            <div class="form-row form-row-2">
              <div class="form-group">
                <label for="name">
                  <i class="fas fa-tag"></i> {{ $t('admin.productForm.name') }}
                  <span class="required">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  v-model="form.name"
                  required
                  class="form-input"
                  :placeholder="$t('admin.productForm.namePlaceholder')"
                />
              </div>
              <div class="form-group">
                <label for="date">
                  <i class="fas fa-calendar"></i> {{ $t('admin.productForm.releaseDate') }}
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

            <div class="form-row form-row-2">
              <div class="form-group">
                <label for="categoryId">
                  <i class="fas fa-tags"></i> {{ $t('admin.productForm.category') }}
                </label>
                <select id="categoryId" v-model="form.categoryId" class="form-input">
                  <option :value="null">{{ $t('products.uncategorized') }}</option>
                  <option v-for="cat in parentCategories" :key="cat.id" :value="cat.id">
                    {{ cat.name }}{{ cat.nameEn ? ` / ${cat.nameEn}` : '' }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label for="subCategoryId">
                  <i class="fas fa-tag"></i> {{ $t('admin.productForm.subCategory') }}
                </label>
                <select
                  id="subCategoryId"
                  v-model="form.subCategoryId"
                  class="form-input"
                  :disabled="!form.categoryId || subCategories.length === 0"
                >
                  <option :value="null">{{ $t('admin.productForm.subCategoryNone') }}</option>
                  <option v-for="cat in subCategories" :key="cat.id" :value="cat.id">
                    {{ cat.name }}{{ cat.nameEn ? ` / ${cat.nameEn}` : '' }}
                  </option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group form-group-align-end">
                <router-link to="/admin/product-categories" class="btn btn-secondary btn-manage-categories">
                  <i class="fas fa-cog"></i> {{ $t('admin.productForm.manageCategories') }}
                </router-link>
              </div>
            </div>

            <div class="form-group">
              <label for="description">
                <i class="fas fa-align-left"></i> {{ $t('admin.productForm.description') }}
                <span class="required">*</span>
              </label>
              <textarea
                id="description"
                v-model="form.description"
                rows="4"
                required
                class="form-input textarea-input"
                :placeholder="$t('admin.productForm.descriptionPlaceholder')"
              ></textarea>
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                {{ $t('admin.productForm.descriptionHint') }}
              </p>
            </div>
          </div>

          <!-- 详情页「核心功能」卡片，与描述独立，存库为 JSON -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-th-large"></i> {{ $t('admin.productForm.featuresTitle') }}
            </h3>
            <p class="form-hint feature-intro">
              <i class="fas fa-info-circle"></i>
              {{ $t('admin.productForm.featuresIntro') }}
            </p>
            <div v-for="(row, idx) in featureRows" :key="idx" class="feature-row">
              <div class="feature-row-head">
                <span class="feature-row-label">{{ $t('admin.productForm.featureRowLabel', { n: idx + 1 }) }}</span>
                <button type="button" class="btn-icon-remove" @click="removeFeatureRow(idx)" :title="$t('admin.productForm.removeTitle')">
                  <i class="fas fa-times" />
                </button>
              </div>
              <div class="form-row form-row-3">
                <div class="form-group">
                  <label>{{ $t('admin.productForm.title') }}</label>
                  <input v-model="row.title" type="text" class="form-input" :placeholder="$t('admin.productForm.featureTitlePh')" />
                </div>
                <div class="form-group">
                  <label>{{ $t('admin.productForm.icon') }}</label>
                  <FaIconPicker v-model="row.icon" :options="iconOptions" />
                </div>
                <div class="form-group">
                  <label>{{ $t('admin.productForm.subtitle') }}</label>
                  <input v-model="row.description" type="text" class="form-input" :placeholder="$t('admin.productForm.featureSubtitlePh')" />
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-add-feature"
              :disabled="featureRows.length >= 12"
              @click="addFeatureRow"
            >
              <i class="fas fa-plus" /> {{ $t('admin.productForm.addFeature', { current: featureRows.length }) }}
            </button>
          </div>

          <!-- 详情页「技术规格」卡片，存库 specsJson，结构与功能卡相同 -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-microchip"></i> {{ $t('admin.productForm.specsTitle') }}
            </h3>
            <p class="form-hint feature-intro">
              <i class="fas fa-info-circle"></i>
              {{ $t('admin.productForm.specsIntro') }}
            </p>
            <div v-for="(row, idx) in specCardRows" :key="'s' + idx" class="feature-row">
              <div class="feature-row-head">
                <span class="feature-row-label">{{ $t('admin.productForm.specRowLabel', { n: idx + 1 }) }}</span>
                <button type="button" class="btn-icon-remove" @click="removeSpecCardRow(idx)" :title="$t('admin.productForm.removeTitle')">
                  <i class="fas fa-times" />
                </button>
              </div>
              <div class="form-row form-row-3">
                <div class="form-group">
                  <label>{{ $t('admin.productForm.title') }}</label>
                  <input v-model="row.title" type="text" class="form-input" :placeholder="$t('admin.productForm.specTitlePh')" />
                </div>
                <div class="form-group">
                  <label>{{ $t('admin.productForm.icon') }}</label>
                  <FaIconPicker v-model="row.icon" :options="iconOptions" />
                </div>
                <div class="form-group">
                  <label>{{ $t('admin.productForm.specValue') }}</label>
                  <input v-model="row.description" type="text" class="form-input" :placeholder="$t('admin.productForm.specValuePh')" />
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-add-feature"
              :disabled="specCardRows.length >= 12"
              @click="addSpecCardRow"
            >
              <i class="fas fa-plus" /> {{ $t('admin.productForm.addSpec', { current: specCardRows.length }) }}
            </button>
          </div>

          <!-- 详情页「重要说明」，存库 usageNoticeJson -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-info-circle"></i> {{ $t('admin.productForm.usageTitle') }}
            </h3>
            <p class="form-hint feature-intro">
              <i class="fas fa-info-circle"></i>
              {{ $t('admin.productForm.usageIntro') }}
            </p>
            <div v-for="(row, idx) in usageNoticeRows" :key="'u' + idx" class="feature-row">
              <div class="feature-row-head">
                <span class="feature-row-label">{{ $t('admin.productForm.usageRowLabel', { n: idx + 1 }) }}</span>
                <button type="button" class="btn-icon-remove" @click="removeUsageNoticeRow(idx)" :title="$t('admin.productForm.removeTitle')">
                  <i class="fas fa-times" />
                </button>
              </div>
              <div class="form-row form-row-usage-notice">
                <div class="form-group form-group-usage-notice-type">
                  <label :title="$t('admin.productForm.usageTypeLabelTitle')">{{ $t('admin.productForm.usageType') }}</label>
                  <select
                    v-model="row.mode"
                    class="form-input usage-notice-type-select"
                    :title="$t('admin.productForm.usageSelectTitle')"
                  >
                    <option value="check" :title="$t('admin.productForm.usageCheckTitle')">✓</option>
                    <option value="ban" :title="$t('admin.productForm.usageBanTitle')">⛔</option>
                  </select>
                </div>
                <div class="form-group form-group-usage-notice-text">
                  <label>{{ $t('admin.productForm.usageText') }}</label>
                  <input v-model="row.text" type="text" class="form-input" :placeholder="$t('admin.productForm.usageTextPh')" />
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-add-feature"
              :disabled="usageNoticeRows.length >= 20"
              @click="addUsageNoticeRow"
            >
              <i class="fas fa-plus" /> {{ $t('admin.productForm.addUsage', { current: usageNoticeRows.length }) }}
            </button>
          </div>

          <!-- Image -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-image"></i> {{ $t('admin.productForm.imageSection') }}
            </h3>

            <div class="form-group">
              <label for="image">
                <i class="fas fa-upload"></i> {{ $t('admin.productForm.uploadImages') }}
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
                {{ $t('admin.productForm.imageHint') }}
              </p>
              <div v-if="uploadingImage" class="uploading-text">
                <i class="fas fa-spinner fa-spin"></i> {{ $t('admin.productForm.uploadingImage') }}
              </div>
            </div>

            <div v-if="imageList.length" class="image-preview-section">
              <label class="preview-label">{{ $t('admin.productForm.previewLabel', { count: imageList.length }) }}</label>
              <div class="image-preview-grid">
                <div v-for="(img, idx) in imageList" :key="img + idx" class="image-preview-item">
                  <img
                    :src="img"
                    :alt="$t('admin.productForm.previewAlt')"
                    class="preview-image"
                    @error="handleImageError"
                  />
                  <button type="button" class="btn-delete-image" @click="removeImage(idx)">
                    <i class="fas fa-trash"></i>
                  </button>
                  <span v-if="idx === 0" class="cover-badge">{{ $t('admin.productForm.coverBadge') }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pricing -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-dollar-sign"></i> {{ $t('admin.productForm.pricingSection') }}
            </h3>

            <div class="form-group">
              <label for="priceUsdt">
                <i class="fab fa-bitcoin"></i> {{ $t('admin.productForm.priceUsdt') }}
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
                  :placeholder="$t('admin.productForm.pricePlaceholder')"
                />
                <span class="currency-label">USDT</span>
              </div>
              <p class="form-hint">
                <i class="fas fa-info-circle"></i>
                {{ $t('admin.productForm.priceHint') }}
              </p>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="form-actions">
            <router-link to="/admin/products" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting || uploadingImage || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{
                submitting
                  ? $t('admin.productForm.saving')
                  : isEdit
                    ? $t('admin.productForm.update')
                    : $t('admin.productForm.create')
              }}
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
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'
import FaIconPicker from '@/components/admin/FaIconPicker.vue'
import { getParentCategories, getSubCategories } from '@/utils/categorySort'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const isEdit = computed(() => route.name === 'admin-product-edit')

const form = ref({
  name: '',
  description: '',
  image: '',
  priceUsdt: 0,
  date: new Date().toISOString().split('T')[0],
  categoryId: null,
  subCategoryId: null
})

const categories = ref([])

const parentCategories = computed(() => getParentCategories(categories.value))

const subCategories = computed(() => {
  if (!form.value.categoryId) return []
  return getSubCategories(categories.value, form.value.categoryId)
})

const imageList = ref([])
/** 详情页功能卡行，提交时序列化为 featuresJson */
const featureRows = ref([])
/** 详情页技术规格卡行，提交时序列化为 specsJson */
const specCardRows = ref([])
/** 详情页重要说明行，提交时序列化为 usageNoticeJson */
const usageNoticeRows = ref([])
const uploadingImage = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

/** 可选图标（Font Awesome 6 + fas） */
/** label 仅用于图标选择器悬停提示，界面只显示图标 */
const iconDefs = [
  { value: 'fa-star', labelKey: 'admin.productForm.icons.faStar' },
  { value: 'fa-camera', labelKey: 'admin.productForm.icons.faCamera' },
  { value: 'fa-brain', labelKey: 'admin.productForm.icons.faBrain' },
  { value: 'fa-bolt', labelKey: 'admin.productForm.icons.faBolt' },
  { value: 'fa-chart-line', labelKey: 'admin.productForm.icons.faChartLine' },
  { value: 'fa-shield-halved', labelKey: 'admin.productForm.icons.faShieldHalved' },
  { value: 'fa-microchip', labelKey: 'admin.productForm.icons.faMicrochip' },
  { value: 'fa-plug', labelKey: 'admin.productForm.icons.faPlug' },
  { value: 'fa-database', labelKey: 'admin.productForm.icons.faDatabase' },
  { value: 'fa-battery-three-quarters', labelKey: 'admin.productForm.icons.faBatteryThreeQuarters' },
  { value: 'fa-weight-hanging', labelKey: 'admin.productForm.icons.faWeightHanging' },
  { value: 'fa-headset', labelKey: 'admin.productForm.icons.faHeadset' },
  { value: 'fa-coins', labelKey: 'admin.productForm.icons.faCoins' },
  { value: 'fa-wand-magic-sparkles', labelKey: 'admin.productForm.icons.faWandMagicSparkles' }
]

const iconOptions = computed(() => iconDefs.map((item) => ({ value: item.value, label: t(item.labelKey) })))

function loadFeatureRowsFromProduct(data) {
  if (data.featureCards && Array.isArray(data.featureCards)) {
    featureRows.value = data.featureCards.map((r) => ({
      title: r.title || '',
      description: r.description || '',
      icon: r.icon || 'fa-star'
    }))
    return
  }
  if (data.featuresJson && typeof data.featuresJson === 'string') {
    try {
      const v = JSON.parse(data.featuresJson)
      if (Array.isArray(v)) {
        featureRows.value = v.map((r) => ({
          title: r.title || '',
          description: r.description || '',
          icon: r.icon || 'fa-star'
        }))
        return
      }
    } catch (_e) {}
  }
  featureRows.value = []
}

function addFeatureRow() {
  if (featureRows.value.length >= 12) return
  featureRows.value.push({ title: '', description: '', icon: 'fa-star' })
}

function removeFeatureRow(index) {
  featureRows.value.splice(index, 1)
}

function loadSpecCardRowsFromProduct(data) {
  if (data.specCards && Array.isArray(data.specCards)) {
    specCardRows.value = data.specCards.map((r) => ({
      title: r.title || '',
      description: r.description || '',
      icon: r.icon || 'fa-star'
    }))
    return
  }
  if (data.specsJson && typeof data.specsJson === 'string') {
    try {
      const v = JSON.parse(data.specsJson)
      if (Array.isArray(v)) {
        specCardRows.value = v.map((r) => ({
          title: r.title || '',
          description: r.description || '',
          icon: r.icon || 'fa-star'
        }))
        return
      }
    } catch (_e) {}
  }
  specCardRows.value = []
}

function addSpecCardRow() {
  if (specCardRows.value.length >= 12) return
  specCardRows.value.push({ title: '', description: '', icon: 'fa-microchip' })
}

function removeSpecCardRow(index) {
  specCardRows.value.splice(index, 1)
}

function loadUsageNoticeRowsFromProduct(data) {
  if (data.usageNoticeLines && Array.isArray(data.usageNoticeLines)) {
    usageNoticeRows.value = data.usageNoticeLines.map((r) => ({
      text: r.text || '',
      mode: r.mode === 'ban' || r.mode === 'warn' ? 'ban' : 'check'
    }))
    return
  }
  if (data.usageNoticeJson && typeof data.usageNoticeJson === 'string') {
    try {
      const v = JSON.parse(data.usageNoticeJson)
      if (Array.isArray(v)) {
        usageNoticeRows.value = v.map((r) => ({
          text: (r && r.text) || '',
          mode: r && (r.mode === 'ban' || r.mode === 'warn') ? 'ban' : 'check'
        }))
        return
      }
    } catch (_e) {}
  }
  usageNoticeRows.value = []
}

function addUsageNoticeRow() {
  if (usageNoticeRows.value.length >= 20) return
  usageNoticeRows.value.push({ text: '', mode: 'check' })
}

function removeUsageNoticeRow(index) {
  usageNoticeRows.value.splice(index, 1)
}

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

watch(() => form.value.categoryId, () => {
  if (!form.value.subCategoryId) return
  const valid = subCategories.value.some((c) => c.id === form.value.subCategoryId)
  if (!valid) form.value.subCategoryId = null
})

onMounted(async () => {
  await loadCategories()
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await api.get(`/api/admin/products/${route.params.id}`)
      form.value = {
        name: response.data.name || '',
        description: response.data.description || '',
        image: response.data.image || '',
        priceUsdt: response.data.priceUsdt || response.data.price || 0,
        date: response.data.date || new Date().toISOString().split('T')[0],
        categoryId: response.data.categoryId ?? null,
        subCategoryId: response.data.subCategoryId ?? null
      }
      imageList.value = parseImageList(response.data.images?.length ? response.data.images : response.data.image)
      loadFeatureRowsFromProduct(response.data)
      loadSpecCardRowsFromProduct(response.data)
      loadUsageNoticeRowsFromProduct(response.data)
    } catch (err) {
      error.value = t('admin.productForm.errors.load', {
        message: err.response?.data?.message || err.message
      })
      setTimeout(() => {
        router.push('/admin/products')
      }, 2000)
    } finally {
      loading.value = false
    }
  }
})

async function loadCategories() {
  try {
    const res = await api.get('/api/admin/product-categories')
    categories.value = res.data || []
  } catch (_e) {
    categories.value = []
  }
}

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
        throw new Error(t('admin.productForm.errors.imageTooLarge'))
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
        throw new Error(t('admin.productForm.errors.invalidUpload'))
      }
      imageList.value.push(imageUrl)
    }
    form.value.image = imageList.value[0] || ''
  } catch (err) {
    error.value = err.response?.data?.error || err.message || t('admin.productForm.errors.uploadFailed')
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
    error.value = t('admin.productForm.errors.requiredFields')
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const normalizedImages = imageList.value.filter(Boolean)
    const featureCards = featureRows.value
      .map((r) => ({
        title: (r.title || '').trim(),
        description: (r.description || '').trim(),
        icon: (r.icon || 'fa-star').trim()
      }))
      .filter((r) => r.title || r.description)
    const specCards = specCardRows.value
      .map((r) => ({
        title: (r.title || '').trim(),
        description: (r.description || '').trim(),
        icon: (r.icon || 'fa-star').trim()
      }))
      .filter((r) => r.title || r.description)
    const usageNoticeLines = usageNoticeRows.value
      .map((r) => ({
        text: (r.text || '').trim(),
        mode: r.mode === 'ban' ? 'ban' : 'check'
      }))
      .filter((r) => r.text)
    const submitData = {
      ...form.value,
      image: normalizedImages.length > 1 ? JSON.stringify(normalizedImages) : (normalizedImages[0] || ''),
      priceUsdt: parseFloat(form.value.priceUsdt) || 0,
      featureCards,
      specCards,
      usageNoticeLines
    }

    if (isEdit.value) {
      await api.put(`/api/admin/products/${route.params.id}`, submitData)
    } else {
      await api.post('/api/admin/products', submitData)
    }

    showToast(t('admin.productForm.success.saved'), 'success')
    setTimeout(() => {
      router.back()
    }, 1500)
  } catch (err) {
    error.value = err.response?.data?.message || t('admin.productForm.errors.saveFailed')
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

/* 重要说明：类型列窄（图标下拉）、文案列占满剩余宽度 */
.form-row-usage-notice {
  grid-template-columns: minmax(3.75rem, 4.75rem) minmax(0, 1fr);
  gap: 0.75rem 1rem;
  align-items: end;
}

.form-row-usage-notice .form-group {
  margin-bottom: 0;
}

.usage-notice-type-select {
  text-align: center;
  font-size: 1.25rem;
  line-height: 1.2;
  padding-left: 0.35rem;
  padding-right: 0.35rem;
  min-height: 2.75rem;
}

.form-row-3 {
  grid-template-columns: 1.15fr 0.95fr 1.9fr;
  align-items: end;
}

.feature-intro {
  margin-bottom: 1rem;
}

.feature-row {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  background: rgba(0, 0, 0, 0.12);
}

.feature-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.65rem;
}

.feature-row-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.btn-icon-remove {
  border: none;
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-icon-remove:hover {
  background: rgba(245, 87, 108, 0.28);
}

.btn-add-feature {
  margin-top: 0.25rem;
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

  .form-row-3 {
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

.form-group-align-end {
  display: flex;
  align-items: flex-end;
}

.btn-manage-categories {
  width: 100%;
  justify-content: center;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
