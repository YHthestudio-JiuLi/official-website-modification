<template>
  <AdminLayout>
    <template #header-title>{{ isEdit ? $t('admin.questionsForm.editTitle') : $t('admin.questionsForm.addTitle') }}</template>

    <div class="question-form-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-database"></i>
            {{ isEdit ? $t('admin.questionsForm.editTitle') : $t('admin.questionsForm.addTitle') }}
          </h2>
          <p>{{ isEdit ? $t('admin.questionsForm.editSubtitle') : $t('admin.questionsForm.addSubtitle') }}</p>
        </div>
        <router-link to="/admin/questions" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> {{ $t('admin.questionsForm.back') }}
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.questionsForm.loading') }}</span>
        </div>
      </div>

      <div v-else class="form-card">
        <form @submit.prevent="handleSubmit" class="form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-info-circle"></i> {{ $t('admin.questionsForm.sectionBasic') }}
            </h3>

            <div class="form-group">
              <label for="name">
                <i class="fas fa-tag"></i> {{ $t('admin.questionsForm.nameLabel') }}
                <span class="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                v-model="form.name"
                required
                class="form-input"
                :placeholder="$t('admin.questionsForm.namePlaceholder')"
              />
            </div>

            <div class="form-group">
              <label for="categorySelect">
                <i class="fas fa-folder-open"></i> {{ $t('admin.questionsForm.categoryLabel') }}
              </label>
              <select id="categorySelect" v-model="categorySelectValue" class="form-input">
                <option value="">{{ $t('admin.questionsForm.categoryUncategorized') }}</option>
                <option v-for="item in existingCategories" :key="item" :value="item">{{ item }}</option>
                <option value="__custom__">{{ $t('admin.questionsForm.categoryNew') }}</option>
              </select>
            </div>

            <div v-if="categorySelectValue === '__custom__'" class="form-group">
              <label for="categoryCustomInput">
                <i class="fas fa-plus-square"></i> {{ $t('admin.questionsForm.newCategoryLabel') }}
              </label>
              <input
                type="text"
                id="categoryCustomInput"
                v-model.trim="customCategoryValue"
                class="form-input"
                :placeholder="$t('admin.questionsForm.newCategoryPlaceholder')"
              />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-file-upload"></i> {{ $t('admin.questionsForm.sectionFiles') }}
            </h3>

            <div class="form-group">
              <label>
                <i class="fas fa-file-alt"></i> {{ $t('admin.questionsForm.dbFileLabel') }}
              </label>
              
              <div class="upload-area">
                <input
                  type="file"
                  id="dbFile"
                  ref="dbFileInput"
                  accept=".db,.sqlite,.sqlite3"
                  @change="handleDbFileSelect"
                  style="display: none"
                />
                
                <div v-if="!form.dbFile && !existingDbFile" class="upload-box" @click="$refs.dbFileInput.click()">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <p class="upload-text">{{ $t('admin.questionsForm.dbUploadText') }}</p>
                  <p class="upload-hint">{{ $t('admin.questionsForm.dbUploadHint') }}</p>
                </div>
                
                <div v-if="existingDbFile && !form.dbFile && !clearDbFileFlag" class="file-preview-card">
                  <div class="file-icon">
                    <i class="fas fa-file-alt"></i>
                  </div>
                  <div class="file-info">
                    <p class="file-name">{{ getFileName(existingDbFile) }}</p>
                    <p class="file-status existing">
                      <i class="fas fa-check-circle"></i>
                      {{ $t('admin.questionsForm.currentFile') }}
                      <span v-if="existingDbFileSize"> · {{ formatFileSize(existingDbFileSize) }}</span>
                    </p>
                  </div>
                  <div class="file-actions">
                    <button type="button" class="btn-file btn-replace" @click="$refs.dbFileInput.click()">
                      <i class="fas fa-exchange-alt"></i> {{ $t('admin.questionsForm.replace') }}
                    </button>
                    <button type="button" class="btn-file btn-remove" @click="clearDbFile">
                      <i class="fas fa-times"></i> {{ $t('admin.questionsForm.remove') }}
                    </button>
                  </div>
                </div>
                
                <div v-if="form.dbFile" class="file-preview-card new">
                  <div class="file-icon">
                    <i class="fas fa-file-alt"></i>
                  </div>
                  <div class="file-info">
                    <p class="file-name">{{ form.dbFile.name }}</p>
                    <p class="file-status new">
                      <i class="fas fa-clock"></i> {{ $t('admin.questionsForm.pendingUpload') }}
                    </p>
                    <p class="file-size">{{ formatFileSize(form.dbFile.size) }}</p>
                  </div>
                  <div class="file-actions">
                    <button type="button" class="btn-file btn-remove" @click="clearDbFileInput">
                      <i class="fas fa-times"></i> {{ $t('admin.questionsForm.cancelPending') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>
                <i class="fas fa-file-archive"></i> {{ $t('admin.questionsForm.indexFileLabel') }}
              </label>
              
              <div class="upload-area">
                <input
                  type="file"
                  id="vectorFile"
                  ref="vectorFileInput"
                  accept=".index"
                  @change="handleVectorFileSelect"
                  style="display: none"
                />
                
                <div v-if="!form.vectorFile && !existingVectorFile" class="upload-box" @click="$refs.vectorFileInput.click()">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <p class="upload-text">{{ $t('admin.questionsForm.indexUploadText') }}</p>
                  <p class="upload-hint">{{ $t('admin.questionsForm.indexUploadHint') }}</p>
                </div>
                
                <div v-if="existingVectorFile && !form.vectorFile && !clearVectorFileFlag" class="file-preview-card">
                  <div class="file-icon">
                    <i class="fas fa-file-archive"></i>
                  </div>
                  <div class="file-info">
                    <p class="file-name">{{ getFileName(existingVectorFile) }}</p>
                    <p class="file-status existing">
                      <i class="fas fa-check-circle"></i>
                      {{ $t('admin.questionsForm.currentFile') }}
                      <span v-if="existingVectorFileSize"> · {{ formatFileSize(existingVectorFileSize) }}</span>
                    </p>
                  </div>
                  <div class="file-actions">
                    <button type="button" class="btn-file btn-replace" @click="$refs.vectorFileInput.click()">
                      <i class="fas fa-exchange-alt"></i> {{ $t('admin.questionsForm.replace') }}
                    </button>
                    <button type="button" class="btn-file btn-remove" @click="clearVectorFile">
                      <i class="fas fa-times"></i> {{ $t('admin.questionsForm.remove') }}
                    </button>
                  </div>
                </div>
                
                <div v-if="form.vectorFile" class="file-preview-card new">
                  <div class="file-icon">
                    <i class="fas fa-file-archive"></i>
                  </div>
                  <div class="file-info">
                    <p class="file-name">{{ form.vectorFile.name }}</p>
                    <p class="file-status new">
                      <i class="fas fa-clock"></i> {{ $t('admin.questionsForm.pendingUpload') }}
                    </p>
                    <p class="file-size">{{ formatFileSize(form.vectorFile.size) }}</p>
                  </div>
                  <div class="file-actions">
                    <button type="button" class="btn-file btn-remove" @click="clearVectorFileInput">
                      <i class="fas fa-times"></i> {{ $t('admin.questionsForm.cancelPending') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <router-link to="/admin/questions" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{
                submitting
                  ? $t('admin.questionsForm.saving')
                  : isEdit
                    ? $t('admin.questionsForm.submitUpdate')
                    : $t('admin.questionsForm.submitCreate')
              }}
            </button>
          </div>
          <p v-if="uploadingChunks" class="upload-progress-tip">
            {{ $t('admin.questionsForm.uploadingProgress', { progress: chunkUploadProgress }) }}
          </p>
        </form>
      </div>

      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'
import { useAdminPermissions } from '@/composables/useAdminPermission'

const route = useRoute()
const router = useRouter()
const { has } = useAdminPermissions()
const { t, locale } = useI18n()

const isEdit = computed(() => route.name === 'admin-question-edit')

const form = ref({
  name: '',
  category_name: '',
  dbFile: null,
  vectorFile: null
})
const existingCategories = ref([])
const categorySelectValue = ref('')
const customCategoryValue = ref('')

const existingDbFile = ref(null)
const existingVectorFile = ref(null)
const existingDbFileSize = ref(null)
const existingVectorFileSize = ref(null)
const existingTotalFileSize = ref(0)
const clearDbFileFlag = ref(false)
const clearVectorFileFlag = ref(false)

const loading = ref(false)
const submitting = ref(false)
const uploadingChunks = ref(false)
const chunkUploadProgress = ref(0)
const error = ref('')

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

const isValid = computed(() => {
  if (!form.value.name) return false
  return true
})

watch(form, () => {
  error.value = ''
}, { deep: true })

onMounted(async () => {
  if (!has('question.edit')) {
    router.replace('/admin/questions')
    return
  }
  await fetchExistingCategories()
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await api.get(`/api/admin/questions/${route.params.id}`)
      form.value.name = response.data.name || ''
      form.value.category_name = (response.data.category_name || '').trim()
      existingDbFile.value = response.data.db_file_path || null
      existingVectorFile.value = response.data.vector_file_path || null
      existingDbFileSize.value = Number(response.data.db_file_size || 0) || null
      existingVectorFileSize.value = Number(response.data.vector_file_size || 0) || null
      existingTotalFileSize.value = Number(response.data.total_file_size || 0) || 0
      if (!form.value.category_name) {
        categorySelectValue.value = ''
      } else if (existingCategories.value.includes(form.value.category_name)) {
        categorySelectValue.value = form.value.category_name
      } else {
        categorySelectValue.value = '__custom__'
        customCategoryValue.value = form.value.category_name
      }
    } catch (err) {
      error.value = t('admin.questionsForm.loadError', {
        message: err.response?.data?.message || err.message
      })
      setTimeout(() => {
        router.push('/admin/questions')
      }, 2000)
    } finally {
      loading.value = false
    }
  }
})

watch([categorySelectValue, customCategoryValue], () => {
  if (categorySelectValue.value === '__custom__') {
    form.value.category_name = customCategoryValue.value.trim()
    return
  }
  form.value.category_name = categorySelectValue.value
}, { immediate: true })

async function fetchExistingCategories() {
  try {
    const response = await api.get('/api/admin/questions')
    const list = Array.isArray(response.data) ? response.data : []
    const values = [...new Set(list.map(item => String(item.category_name || '').trim()).filter(Boolean))]
    const collatorLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
    existingCategories.value = values.sort((a, b) => a.localeCompare(b, collatorLocale))
  } catch (_err) {
    existingCategories.value = []
  }
}

function handleDbFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    form.value.dbFile = file
    clearDbFileFlag.value = false
  }
}

function handleVectorFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    form.value.vectorFile = file
    clearVectorFileFlag.value = false
  }
}

function clearDbFileInput() {
  form.value.dbFile = null
  if (document.getElementById('dbFile')) {
    document.getElementById('dbFile').value = ''
  }
}

function clearVectorFileInput() {
  form.value.vectorFile = null
  if (document.getElementById('vectorFile')) {
    document.getElementById('vectorFile').value = ''
  }
}

function clearDbFile() {
  existingDbFile.value = null
  existingDbFileSize.value = null
  existingTotalFileSize.value = (existingVectorFileSize.value || 0)
  clearDbFileFlag.value = true
}

function clearVectorFile() {
  existingVectorFile.value = null
  existingVectorFileSize.value = null
  existingTotalFileSize.value = (existingDbFileSize.value || 0)
  clearVectorFileFlag.value = true
}

function getFileName(filePath) {
  if (!filePath) return '-'
  return filePath.split('/').pop() || filePath
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

async function handleSubmit() {
  if (!isValid.value) {
    error.value = t('admin.questionsForm.nameRequired')
    showToast(t('admin.questionsForm.nameRequired'), 'error')
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const formData = new FormData()
    formData.append('name', form.value.name)
    if (form.value.category_name) {
      formData.append('category_name', form.value.category_name)
    }
    
    const pendingUploads = []
    if (form.value.dbFile) pendingUploads.push({ file: form.value.dbFile, field: 'dbFile' })
    if (form.value.vectorFile) pendingUploads.push({ file: form.value.vectorFile, field: 'vectorFile' })
    if (pendingUploads.length > 0) {
      uploadingChunks.value = true
      chunkUploadProgress.value = 0
    }
    for (let index = 0; index < pendingUploads.length; index += 1) {
      const item = pendingUploads[index]
      const uploadId = await uploadQuestionFileInChunks(item.file, item.field, index, pendingUploads.length)
      if (item.field === 'dbFile') {
        formData.append('dbChunkUploadId', uploadId)
      } else if (item.field === 'vectorFile') {
        formData.append('vectorChunkUploadId', uploadId)
      }
    }
    
    if (isEdit.value) {
      if (clearDbFileFlag.value) {
        formData.append('clearDbFile', 'true')
      }
      if (clearVectorFileFlag.value) {
        formData.append('clearVectorFile', 'true')
      }
      
      // 大题库/向量上传由 api 拦截器统一延长超时，勿在此写 60s
      await api.put(`/api/admin/questions/${route.params.id}`, formData)
    } else {
      await api.post('/api/admin/questions', formData)
    }

    showToast(t('admin.questionsForm.saveSuccess'), 'success')
    setTimeout(() => {
      router.push('/admin/questions')
    }, 1500)
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || t('admin.questionsForm.saveError')
    error.value = errorMsg
    showToast(errorMsg, 'error')
  } finally {
    uploadingChunks.value = false
    chunkUploadProgress.value = 0
    submitting.value = false
  }
}

async function uploadQuestionFileInChunks(file, fileField, fileIndex, totalFiles) {
  const chunkSize = 5 * 1024 * 1024
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const initResp = await api.post('/api/admin/questions/upload/init', {
    fileName: file.name,
    fileField,
    fileSize: file.size,
    totalChunks
  })
  const uploadId = initResp.data?.uploadId
  if (!uploadId) {
    throw new Error(t('admin.questionsForm.uploadInitFailed'))
  }
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const chunk = file.slice(start, end)
    const fd = new FormData()
    fd.append('uploadId', uploadId)
    fd.append('chunkIndex', String(chunkIndex))
    fd.append('totalChunks', String(totalChunks))
    fd.append('chunk', chunk, `${file.name}.part${chunkIndex}`)
    await api.post('/api/admin/questions/upload/chunk', fd)
    const partProgress = (chunkIndex + 1) / totalChunks
    const progress = ((fileIndex + partProgress) / totalFiles) * 100
    chunkUploadProgress.value = Math.round(progress)
  }
  await api.post('/api/admin/questions/upload/complete', {
    uploadId,
    fileName: file.name,
    fileField,
    fileSize: file.size,
    totalChunks
  })
  return uploadId
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}
</script>

<style scoped>
.question-form-page {
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

.form-group {
  margin-bottom: 1.5rem;
}

.size-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.size-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.04);
}

.size-item.total {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.1);
}

.size-label {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.size-value {
  font-size: 1rem;
  color: var(--text-primary);
  font-weight: 600;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
  font-weight: 500;
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

.upload-area {
  position: relative;
}

.upload-box {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(0, 212, 255, 0.02);
}

.upload-box:hover {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.05);
}

.upload-box i {
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
  opacity: 0.6;
}

.upload-box:hover i {
  opacity: 1;
}

.upload-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 1rem;
}

.upload-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.file-preview-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.03);
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.3s ease;
}

.file-preview-card.new {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.08);
}

.file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 212, 255, 0.15);
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon i {
  font-size: 1.5rem;
  color: var(--primary-color);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  margin: 0 0 0.25rem 0;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-status {
  margin: 0;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.file-status.existing {
  color: #43e97b;
}

.file-status.new {
  color: var(--primary-color);
}

.file-size {
  margin: 0.25rem 0 0 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-file {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-replace {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-replace:hover {
  background: rgba(0, 212, 255, 0.25);
}

.btn-remove {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.btn-remove:hover {
  background: rgba(245, 87, 108, 0.25);
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.upload-progress-tip {
  margin: 0.85rem 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

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
  .form {
    padding: 1.5rem;
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

  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }

  .file-preview-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .upload-box {
    padding: 1.5rem;
  }

  .upload-box i {
    font-size: 2rem;
  }
}
</style>