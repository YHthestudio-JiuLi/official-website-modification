<template>
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
              <i class="fas fa-file-alt"></i>
              {{ isEdit && isScopedAgent ? $t('admin.questionsForm.sectionFilesReadonly') : $t('admin.questionsForm.sectionFiles') }}
            </h3>

            <QuestionFileSlot
              :label="$t('admin.questionsForm.dbFileLabel')"
              icon-class="fas fa-file-alt"
              accept=".db,.sqlite,.sqlite3"
              :upload-text="$t('admin.questionsForm.dbUploadText')"
              :upload-hint="$t('admin.questionsForm.dbUploadHint')"
              input-id="questionDbFile"
              :mode="dbFileSlotMode"
              :existing-file="existingDbFile"
              :existing-file-size="existingDbFileSize"
              :pending-file="form.dbFile"
              :cleared="clearDbFileFlag"
              :format-file-size="formatFileSize"
              :get-file-name="getFileName"
              @select="onDbFileSelected"
              @clear-existing="clearDbFile"
              @clear-pending="clearDbFileInput"
            />

            <QuestionFileSlot
              :label="$t('admin.questionsForm.indexFileLabel')"
              icon-class="fas fa-file-archive"
              accept=".index"
              :upload-text="$t('admin.questionsForm.indexUploadText')"
              :upload-hint="$t('admin.questionsForm.indexUploadHint')"
              input-id="questionVectorFile"
              :mode="vectorFileSlotMode"
              :existing-file="existingVectorFile"
              :existing-file-size="existingVectorFileSize"
              :pending-file="form.vectorFile"
              :cleared="clearVectorFileFlag"
              :format-file-size="formatFileSize"
              :get-file-name="getFileName"
              @select="onVectorFileSelected"
              @clear-existing="clearVectorFile"
              @clear-pending="clearVectorFileInput"
            />
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
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  fetchQuestions,
  fetchQuestion,
  createQuestion,
  updateQuestion,
  initQuestionUpload,
  uploadQuestionChunk,
  completeQuestionUpload,
  QUESTION_CHUNK_SIZE
} from '@/services/v2/admin/questions'
import { refreshV2Csrf } from '@/services/v2/http'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import QuestionFileSlot from '@/components/admin/QuestionFileSlot.vue'

const route = useRoute()
const router = useRouter()
const { has, isScopedAgent } = useAdminPermissions()
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
const clearDbFileFlag = ref(false)
const clearVectorFileFlag = ref(false)

const dbFileSlotMode = computed(() => {
  if (isEdit.value && isScopedAgent.value) {
    return existingDbFile.value ? 'readonly' : 'add-only'
  }
  return 'editable'
})

const vectorFileSlotMode = computed(() => {
  if (isEdit.value && isScopedAgent.value) {
    return existingVectorFile.value ? 'readonly' : 'add-only'
  }
  return 'editable'
})

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
  if (isEdit.value) {
    loading.value = true
    try {
      const [questionResp] = await Promise.all([
        fetchQuestion(route.params.id),
        fetchExistingCategories()
      ])
      form.value.name = questionResp.data.name || ''
      form.value.category_name = (questionResp.data.category_name || '').trim()
      existingDbFile.value = questionResp.data.db_file_path || null
      existingVectorFile.value = questionResp.data.vector_file_path || null
      existingDbFileSize.value = Number(questionResp.data.db_file_size || 0) || null
      existingVectorFileSize.value = Number(questionResp.data.vector_file_size || 0) || null
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
    return
  }
  await fetchExistingCategories()
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
    const response = await fetchQuestions()
    const list = Array.isArray(response.data) ? response.data : []
    const values = [...new Set(list.map(item => String(item.category_name || '').trim()).filter(Boolean))]
    const collatorLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
    existingCategories.value = values.sort((a, b) => a.localeCompare(b, collatorLocale))
  } catch (_err) {
    existingCategories.value = []
  }
}

function onDbFileSelected(file) {
  form.value.dbFile = file
  clearDbFileFlag.value = false
}

function onVectorFileSelected(file) {
  form.value.vectorFile = file
  clearVectorFileFlag.value = false
}

function clearDbFileInput() {
  form.value.dbFile = null
  const dbInput = document.getElementById('questionDbFile')
  if (dbInput) {
    dbInput.value = ''
  }
}

function clearVectorFileInput() {
  form.value.vectorFile = null
  const vectorInput = document.getElementById('questionVectorFile')
  if (vectorInput) {
    vectorInput.value = ''
  }
}

function clearDbFile() {
  existingDbFile.value = null
  existingDbFileSize.value = null
  clearDbFileFlag.value = true
}

function clearVectorFile() {
  existingVectorFile.value = null
  existingVectorFileSize.value = null
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

    const agentEdit = isScopedAgent.value && isEdit.value

    const pendingUploads = []
    if (agentEdit) {
      if (form.value.dbFile && !existingDbFile.value) {
        pendingUploads.push({ file: form.value.dbFile, field: 'dbFile' })
      }
      if (form.value.vectorFile && !existingVectorFile.value) {
        pendingUploads.push({ file: form.value.vectorFile, field: 'vectorFile' })
      }
    } else {
      if (form.value.dbFile) pendingUploads.push({ file: form.value.dbFile, field: 'dbFile' })
      if (form.value.vectorFile) pendingUploads.push({ file: form.value.vectorFile, field: 'vectorFile' })
    }
    if (pendingUploads.length > 0) {
      uploadingChunks.value = true
      chunkUploadProgress.value = 0
      const { prepareLegacyNodeUpload } = await import('@/utils/uploadBridge')
      await prepareLegacyNodeUpload()
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

    // 长时上传后 Sanctum CSRF 可能过期，保存前强制刷新
    if (pendingUploads.length > 0) {
      await refreshV2Csrf()
    }

    if (isEdit.value) {
      if (!agentEdit) {
        if (clearDbFileFlag.value) {
          formData.append('clearDbFile', 'true')
        }
        if (clearVectorFileFlag.value) {
          formData.append('clearVectorFile', 'true')
        }
      }
      
      // 大题库/向量上传由 api 拦截器统一延长超时，勿在此写 60s
      await updateQuestion(route.params.id, formData)
    } else {
      await createQuestion(formData)
    }

    showToast(t('admin.questionsForm.saveSuccess'), 'success')
    router.push('/admin/questions')
  } catch (err) {
    const data = err.response?.data
    const errorMsg =
      (typeof data === 'object' && data ? (data.error || data.message) : null) ||
      err.message ||
      t('admin.questionsForm.saveError')
    error.value = errorMsg
    showToast(errorMsg, 'error')
  } finally {
    uploadingChunks.value = false
    chunkUploadProgress.value = 0
    submitting.value = false
  }
}

async function uploadQuestionFileInChunks(file, fileField, fileIndex, totalFiles) {
  const chunkSize = QUESTION_CHUNK_SIZE
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const initResp = await initQuestionUpload({
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
    await uploadQuestionChunk(fd)
    const partProgress = (chunkIndex + 1) / totalChunks
    const progress = ((fileIndex + partProgress) / totalFiles) * 100
    chunkUploadProgress.value = Math.round(progress)
  }
  await completeQuestionUpload({
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
  animation: fadeIn 0.12s ease;
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
}
</style>