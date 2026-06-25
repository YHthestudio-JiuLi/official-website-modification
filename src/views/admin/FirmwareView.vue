<template>
  <div class="firmware-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-microchip"></i>
            {{ $t('admin.firmware.listTitle') }}
          </h2>
          <p>{{ $t('admin.firmware.description') }}</p>
        </div>
        <div v-if="canEdit" class="header-actions">
          <input ref="firmwareInputRef" type="file" class="firmware-file-input" @change="onFirmwareFileChange" />
          <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="triggerFirmwareSelect">
            <i class="fas fa-upload"></i>
            <span>
              {{ firmwareUploading
                ? $t('admin.firmware.uploading', { progress: firmwareUploadProgress })
                : $t('admin.firmware.upload') }}
            </span>
          </button>
          <button type="button" class="btn btn-secondary" :disabled="firmwareUploading" @click="registerFirmwareFromServer">
            <i class="fas fa-server"></i>
            <span>{{ $t('admin.firmware.registerFromServer') }}</span>
          </button>
        </div>
      </div>

      <div v-if="!canAccessPage" class="no-permission-card">
        <i class="fas fa-lock"></i>
        <p>{{ $t('admin.firmware.noPermission') }}</p>
      </div>

      <div v-else-if="firmwareLoading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.firmware.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-microchip"></i>
            <span>{{ $t('admin.firmware.count', { total: firmwareItems.length }) }}</span>
          </div>
        </div>

        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.firmware.tableHint') }}
          </p>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{{ $t('admin.firmware.colFileName') }}</th>
                <th>{{ $t('admin.firmware.colRemark') }}</th>
                <th>{{ $t('admin.firmware.colFileSize') }}</th>
                <th>{{ $t('admin.firmware.colChecksum') }}</th>
                <th>{{ $t('admin.firmware.colDefault') }}</th>
                <th>{{ $t('admin.firmware.colCreatedAt') }}</th>
                <th class="text-center">{{ $t('admin.firmware.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in tableItems" :key="item.id">
                <td>
                  <span class="id-badge">#{{ item.id }}</span>
                </td>
                <td>
                  <span class="file-name">
                    <i class="fas fa-file-archive"></i>
                    {{ item.file_name }}
                  </span>
                </td>
                <td>
                  <div v-if="canEdit" class="remark-cell">
                    <template v-if="editingRemarkId === item.id">
                      <input
                        :data-remark-input="item.id"
                        v-model="inlineRemarkDraft"
                        type="text"
                        class="remark-inline-input"
                        maxlength="500"
                        :placeholder="$t('admin.firmware.remarkPlaceholder')"
                        :disabled="remarkSavingId === item.id"
                        @blur="commitInlineRemark(item)"
                        @keydown.enter.prevent="commitInlineRemark(item)"
                        @keydown.esc.prevent="cancelInlineRemark"
                      />
                      <i
                        v-if="remarkSavingId === item.id"
                        class="fas fa-spinner fa-spin remark-saving-icon"
                      />
                    </template>
                    <template v-else>
                      <span
                        v-if="item.remark"
                        class="remark-text"
                        :title="item.remark"
                      >{{ item.remark }}</span>
                      <span v-else class="empty-cell">{{ $t('admin.firmware.noRemark') }}</span>
                      <button
                        type="button"
                        class="remark-edit-btn"
                        :title="$t('admin.firmware.editRemarkTitle')"
                        @click="startInlineRemark(item)"
                      >
                        <i class="fas fa-pen"></i>
                      </button>
                    </template>
                  </div>
                  <span
                    v-else-if="item.remark"
                    class="remark-text readonly"
                    :title="item.remark"
                  >{{ item.remark }}</span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span class="size-cell">{{ formatFirmwareSize(item.file_size) }}</span>
                </td>
                <td>
                  <span
                    v-if="item.checksum_sha256"
                    class="checksum-cell"
                    :title="item.checksum_sha256"
                  >
                    {{ item.checksum_sha256.slice(0, 12) }}...
                  </span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span v-if="item.is_default" class="default-badge">
                    {{ $t('admin.firmware.defaultBadge') }}
                  </span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span class="date-cell">{{ item.createdAtText }}</span>
                </td>
                <td class="actions-cell">
                  <div v-if="canEdit || canDelete" class="action-group">
                    <button
                      v-if="canEdit"
                      type="button"
                      class="action-btn btn-default"
                      :disabled="item.is_default"
                      :title="$t('admin.firmware.setDefault')"
                      @click="setDefaultFirmware(item)"
                    >
                      <i class="fas fa-thumbtack"></i>
                      <span class="action-text">{{ $t('admin.firmware.setDefault') }}</span>
                    </button>
                    <button
                      v-if="canDelete"
                      type="button"
                      class="action-btn btn-delete"
                      :title="$t('admin.firmware.deleteTitle')"
                      @click="confirmDelete(item)"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('common.delete') }}</span>
                    </button>
                  </div>
                  <span v-else class="empty-cell">-</span>
                </td>
              </tr>
              <tr v-if="firmwareItems.length === 0">
                <td colspan="8" class="empty-state">
                  <i class="fas fa-microchip"></i>
                  <h3>{{ $t('admin.firmware.emptyAllTitle') }}</h3>
                  <p>{{ $t('admin.firmware.emptyAllDesc') }}</p>
                  <div v-if="canEdit" class="empty-actions">
                    <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="triggerFirmwareSelect">
                      <i class="fas fa-upload"></i> {{ $t('admin.firmware.upload') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="showUploadModal" class="modal-overlay" @click="closeUploadModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-upload"></i>
            <h3>{{ $t('admin.firmware.uploadModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p class="upload-file-name">
              <i class="fas fa-file-archive"></i>
              <strong>{{ pendingUploadFile?.name }}</strong>
            </p>
            <label class="form-label" for="uploadRemark">{{ $t('admin.firmware.remarkLabel') }}</label>
            <textarea
              id="uploadRemark"
              v-model.trim="uploadRemark"
              class="form-textarea"
              rows="3"
              maxlength="500"
              :placeholder="$t('admin.firmware.remarkPlaceholder')"
            />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" :disabled="firmwareUploading" @click="closeUploadModal">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="confirmUpload">
              <i :class="firmwareUploading ? 'fas fa-spinner fa-spin' : 'fas fa-upload'"></i>
              {{ firmwareUploading
                ? $t('admin.firmware.uploading', { progress: firmwareUploadProgress })
                : $t('admin.firmware.uploadConfirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showRegisterModal" class="modal-overlay" @click="closeRegisterModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-server"></i>
            <h3>{{ $t('admin.firmware.registerModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <label class="form-label" for="registerFileName">{{ $t('admin.firmware.colFileName') }}</label>
            <input
              id="registerFileName"
              v-model.trim="registerFileName"
              type="text"
              class="form-input"
              :placeholder="$t('admin.firmware.registerFromServerPrompt')"
            />
            <label class="form-label" for="registerRemark">{{ $t('admin.firmware.remarkLabel') }}</label>
            <textarea
              id="registerRemark"
              v-model.trim="registerRemark"
              class="form-textarea"
              rows="3"
              maxlength="500"
              :placeholder="$t('admin.firmware.remarkPlaceholder')"
            />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeRegisterModal">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="registerSubmitting" @click="confirmRegisterFromServer">
              <i :class="registerSubmitting ? 'fas fa-spinner fa-spin' : 'fas fa-check'"></i>
              {{ $t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.firmware.deleteModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.firmware.deleteModalText') }}</p>
            <div class="firmware-info-box">
              <p class="firmware-name-text"><strong>{{ firmwareToDelete?.file_name }}</strong></p>
              <p class="firmware-meta">ID: {{ firmwareToDelete?.id }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.firmware.deleteConfirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchFirmwares,
  initFirmwareUpload,
  uploadFirmwareChunk,
  completeFirmwareUpload,
  FIRMWARE_CHUNK_SIZE,
  registerLocalFirmware,
  updateFirmwareRemark,
  setDefaultFirmware as setDefaultFirmwareApi,
  deleteFirmware as deleteFirmwareApi
} from '@/services/v2/admin/firmware'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import { readAdminApiError, handleAdminApiFailure } from '@/utils/adminApiError'

const { has } = useAdminPermissions()
const { t, locale } = useI18n()

const canView = computed(() => has('firmware.view'))
const canEdit = computed(() => has('firmware.edit'))
const canDelete = computed(() => has('firmware.delete'))
const canAccessPage = computed(() => canView.value || canEdit.value || canDelete.value)

const firmwareItems = ref([])
const firmwareLoading = ref(false)
const firmwareUploading = ref(false)
const firmwareUploadProgress = ref(0)
const firmwareInputRef = ref(null)
const showDeleteModal = ref(false)
const firmwareToDelete = ref(null)
const showUploadModal = ref(false)
const pendingUploadFile = ref(null)
const uploadRemark = ref('')
const showRegisterModal = ref(false)
const registerFileName = ref('')
const registerRemark = ref('')
const registerSubmitting = ref(false)
const editingRemarkId = ref(null)
const inlineRemarkDraft = ref('')
const remarkSavingId = ref(null)

const tableItems = computed(() => {
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return firmwareItems.value.map((item) => ({
    ...item,
    createdAtText: formatDateTime(item.created_at, fmtLocale)
  }))
})

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

onMounted(initPage)

async function initPage() {
  if (!canAccessPage.value) {
    firmwareLoading.value = false
    return
  }
  await fetchFirmwareItems()
}

async function fetchFirmwareItems() {
  firmwareLoading.value = true
  try {
    const response = await fetchFirmwares()
    firmwareItems.value = response.data.items || []
  } catch (error) {
    if (await handleAdminApiFailure(error, {
      onForbidden: (msg) => showToast(msg, 'error')
    })) return
    showToast(readAdminApiError(error, t('admin.firmware.loadError')), 'error')
  } finally {
    firmwareLoading.value = false
  }
}

function triggerFirmwareSelect() {
  firmwareInputRef.value?.click()
}

function onFirmwareFileChange(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  pendingUploadFile.value = file
  uploadRemark.value = ''
  showUploadModal.value = true
}

function closeUploadModal() {
  if (firmwareUploading.value) return
  showUploadModal.value = false
  pendingUploadFile.value = null
  uploadRemark.value = ''
  if (firmwareInputRef.value) {
    firmwareInputRef.value.value = ''
  }
}

async function confirmUpload() {
  const file = pendingUploadFile.value
  if (!file) return
  firmwareUploading.value = true
  firmwareUploadProgress.value = 0
  try {
    const { prepareLegacyNodeUpload } = await import('@/utils/uploadBridge')
    await prepareLegacyNodeUpload()
    const remark = uploadRemark.value.trim() || null
    const chunkSize = FIRMWARE_CHUNK_SIZE
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
    const initResp = await initFirmwareUpload({
      fileName: file.name,
      fileSize: file.size,
      totalChunks
    })
    const uploadId = initResp.data?.uploadId
    if (!uploadId) {
      throw new Error('Missing uploadId')
    }
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * chunkSize
      const end = Math.min(file.size, start + chunkSize)
      const chunk = file.slice(start, end)
      const chunkFormData = new FormData()
      chunkFormData.append('uploadId', uploadId)
      chunkFormData.append('chunkIndex', String(chunkIndex))
      chunkFormData.append('totalChunks', String(totalChunks))
      chunkFormData.append('chunk', chunk, `${file.name}.part${chunkIndex}`)
      await uploadFirmwareChunk(chunkFormData)
      firmwareUploadProgress.value = Math.round(((chunkIndex + 1) / totalChunks) * 100)
    }
    await completeFirmwareUpload({
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      remark
    })
    closeUploadModal()
    await fetchFirmwareItems()
    showToast(t('admin.firmware.uploadSuccess'), 'success')
  } catch (error) {
    showToast(resolveUploadErrorMessage(error), 'error')
  } finally {
    firmwareUploading.value = false
    firmwareUploadProgress.value = 0
  }
}

function registerFirmwareFromServer() {
  registerFileName.value = ''
  registerRemark.value = ''
  showRegisterModal.value = true
}

function closeRegisterModal() {
  if (registerSubmitting.value) return
  showRegisterModal.value = false
  registerFileName.value = ''
  registerRemark.value = ''
}

async function confirmRegisterFromServer() {
  const normalizedName = registerFileName.value.trim()
  if (!normalizedName) {
    showToast(t('admin.firmware.registerFromServerNameRequired'), 'error')
    return
  }
  registerSubmitting.value = true
  try {
    await registerLocalFirmware({
      file_name: normalizedName,
      remark: registerRemark.value.trim() || null
    })
    closeRegisterModal()
    await fetchFirmwareItems()
    showToast(t('admin.firmware.registerFromServerSuccess'), 'success')
  } catch (error) {
    showToast(
      error.response?.data?.error || t('admin.firmware.registerFromServerError'),
      'error'
    )
  } finally {
    registerSubmitting.value = false
  }
}

async function startInlineRemark(item) {
  if (editingRemarkId.value && editingRemarkId.value !== item.id) {
    const prev = firmwareItems.value.find((f) => f.id === editingRemarkId.value)
    if (prev) await commitInlineRemark(prev)
  }
  editingRemarkId.value = item.id
  inlineRemarkDraft.value = item.remark || ''
  await nextTick()
  const input = document.querySelector(`[data-remark-input="${item.id}"]`)
  input?.focus()
  input?.select()
}

function cancelInlineRemark() {
  editingRemarkId.value = null
  inlineRemarkDraft.value = ''
}

async function commitInlineRemark(item) {
  if (editingRemarkId.value !== item.id || remarkSavingId.value === item.id) return

  const newRemark = inlineRemarkDraft.value.trim() || null
  const oldRemark = (item.remark || '').trim() || null
  if (newRemark === oldRemark) {
    cancelInlineRemark()
    return
  }

  remarkSavingId.value = item.id
  try {
    const response = await updateFirmwareRemark(item.id, {
      remark: newRemark
    })
    const savedRemark = response.data?.firmware?.remark ?? newRemark
    const idx = firmwareItems.value.findIndex((f) => f.id === item.id)
    if (idx >= 0) {
      firmwareItems.value[idx] = { ...firmwareItems.value[idx], remark: savedRemark }
    }
    cancelInlineRemark()
    showToast(t('admin.firmware.editRemarkSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.firmware.editRemarkError'), 'error')
  } finally {
    if (remarkSavingId.value === item.id) {
      remarkSavingId.value = null
    }
  }
}

function resolveUploadErrorMessage(error) {
  const code = error?.code
  const status = error?.response?.status
  const data = error.response?.data
  let msg =
    (data && typeof data === 'object' && (data.error || data.message)) ||
    (typeof data === 'string' && data.length < 240 ? data.trim().slice(0, 200) : '')
  if (status === 401 && (!msg || msg === 'Unauthorized')) {
    return t('admin.firmware.upload401')
  }
  if (status === 503 && (!msg || String(msg).toLowerCase().includes('database service unavailable'))) {
    return t('admin.firmware.upload503')
  }
  if (!msg && (code === 'ECONNABORTED' || error?.message?.includes('timeout'))) {
    return t('admin.firmware.uploadTimeout')
  }
  if (!msg && status === 408) return t('admin.firmware.uploadTimeout')
  if (!msg && status === 413) return t('admin.firmware.upload413')
  if (!msg && status === 401) return t('admin.firmware.upload401')
  if (!msg && status === 403) return t('admin.firmware.upload403')
  if (!msg && status === 503) return t('admin.firmware.upload503')
  if (!msg && (status === 502 || status === 504)) {
    return t('admin.firmware.uploadGateway')
  }
  if (!msg && !error.response) return t('admin.firmware.uploadNetwork')
  return msg || t('admin.firmware.uploadError')
}

async function setDefaultFirmware(item) {
  if (!item || item.is_default) return
  try {
    await setDefaultFirmwareApi(item.id)
    await fetchFirmwareItems()
    showToast(t('admin.firmware.setDefaultSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.firmware.setDefaultError'), 'error')
  }
}

function confirmDelete(item) {
  firmwareToDelete.value = item
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  firmwareToDelete.value = null
}

async function executeDelete() {
  if (!firmwareToDelete.value) return
  try {
    await deleteFirmwareApi(firmwareToDelete.value.id)
    closeDeleteModal()
    await fetchFirmwareItems()
    showToast(t('admin.firmware.deleteSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.firmware.deleteError'), 'error')
  }
}

function formatDateTime(dateStr, fmtLocale = 'en-US') {
  if (!dateStr) return '-'
  const normalized = String(dateStr).includes('T') ? dateStr : dateStr.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function formatFirmwareSize(size) {
  const n = Number(size || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}
</script>

<style scoped>
.firmware-page {
  animation: fadeIn 0.12s ease;
  position: relative;
}

.no-permission-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.no-permission-card i {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  opacity: 0.6;
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
  margin: 0 0 0.25rem;
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

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.firmware-file-input {
  display: none;
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
  font-size: 0.9rem;
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
}

.btn-danger {
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.table-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: visible;
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.table-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.table-info i {
  color: var(--primary-color);
}

.table-info-bar {
  padding: 0.75rem 1.5rem;
  background: rgba(0, 212, 255, 0.05);
  border-bottom: 1px solid var(--border-color);
}

.info-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.table-responsive {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
}

.data-table thead {
  background: var(--bg-darker);
}

.data-table th {
  padding: 1rem 1.5rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table th.text-center {
  text-align: center;
}

.data-table td {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.id-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.file-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
}

.file-name i {
  color: var(--primary-color);
}

.remark-cell {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  max-width: 220px;
}

.remark-text {
  flex: 1;
  color: var(--text-primary);
  font-size: 0.88rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.remark-text.readonly {
  max-width: 220px;
}

.remark-edit-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.remark-edit-btn:hover {
  color: var(--primary-color);
  border-color: rgba(0, 212, 255, 0.4);
  background: rgba(0, 212, 255, 0.08);
}

.remark-inline-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--primary-color);
  background: var(--bg-input, var(--bg-card));
  color: var(--text-primary);
  font-size: 0.88rem;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.15);
}

.remark-inline-input:disabled {
  opacity: 0.7;
}

.remark-saving-icon {
  flex-shrink: 0;
  color: var(--primary-color);
  font-size: 0.85rem;
}

.size-cell,
.date-cell {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.checksum-cell {
  font-family: ui-monospace, monospace;
  font-size: 0.82rem;
  color: var(--text-primary);
  cursor: help;
}

.default-badge {
  display: inline-flex;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(67, 233, 123, 0.16);
  color: #43e97b;
  font-size: 0.8rem;
}

.empty-cell {
  color: var(--text-secondary);
  opacity: 0.5;
}

.actions-cell {
  text-align: center;
}

.action-group {
  display: inline-flex;
  gap: 0.5rem;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 80px;
  height: 40px;
  padding: 0 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
  font-weight: 500;
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-default {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

.btn-default:hover:not(:disabled) {
  background: #43e97b;
  color: #0d1117;
}

.btn-delete {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.btn-delete:hover {
  background: #f5576c;
  color: white;
}

.empty-state {
  text-align: center;
  padding: 4rem !important;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 1rem 0 0.5rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 0 1.5rem;
}

.empty-actions {
  display: flex;
  justify-content: center;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  width: 100%;
  max-width: 480px;
  overflow: hidden;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header.danger {
  background: rgba(245, 87, 108, 0.1);
  color: #f5576c;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.modal-header:not(.danger) {
  background: rgba(0, 212, 255, 0.08);
  color: var(--text-primary);
}

.upload-file-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.form-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-input, var(--bg-card));
  color: var(--text-primary);
  font-size: 0.9rem;
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
  min-height: 88px;
  margin-bottom: 0.25rem;
}

.form-input {
  margin-bottom: 1rem;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem;
  color: var(--text-secondary);
}

.firmware-info-box {
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.5rem;
}

.firmware-name-text {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
}

.firmware-meta {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 0.85rem 1.25rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 2000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  animation: slideInRight 0.3s ease;
}

.toast.success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid rgba(67, 233, 123, 0.4);
  color: #43e97b;
}

.toast.error {
  background: rgba(255, 107, 107, 0.15);
  border: 1px solid rgba(255, 107, 107, 0.4);
  color: #ff6b6b;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .action-text {
    display: none;
  }

  .action-btn {
    min-width: 40px;
    padding: 0 0.75rem;
  }

  .toast {
    left: 1rem;
    right: 1rem;
  }
}
</style>
