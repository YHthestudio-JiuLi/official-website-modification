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
  deleteFirmware as deleteFirmwareApi,
} from '@/services/v2/admin/firmware'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import { readAdminApiError, handleAdminApiFailure } from '@/utils/adminApiError'

/** 固件管理页：列表、分片上传与备注编辑 */
export function useFirmwareAdmin() {
  const { has, isScopedAgent } = useAdminPermissions()
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
      createdAtText: formatDateTime(item.created_at, fmtLocale),
    }))
  })

  const toast = ref({
    visible: false,
    type: 'success',
    message: '',
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
        onForbidden: (msg) => showToast(msg, 'error'),
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
    finishFirmwareUploadUi()
  }

  function finishFirmwareUploadUi() {
    firmwareUploading.value = false
    firmwareUploadProgress.value = 0
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
        totalChunks,
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
        remark,
      })
      finishFirmwareUploadUi()
      await fetchFirmwareItems()
      showToast(t('admin.firmware.uploadSuccess'), 'success')
    } catch (error) {
      showToast(resolveUploadErrorMessage(error), 'error')
    } finally {
      finishFirmwareUploadUi()
    }
  }

  function registerFirmwareFromServer() {
    registerFileName.value = ''
    registerRemark.value = ''
    showRegisterModal.value = true
  }

  function closeRegisterModal() {
    if (registerSubmitting.value) return
    resetRegisterModalState()
  }

  function resetRegisterModalState() {
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
        remark: registerRemark.value.trim() || null,
      })
      await fetchFirmwareItems()
      showToast(t('admin.firmware.registerFromServerSuccess'), 'success')
    } catch (error) {
      showToast(
        error.response?.data?.error || t('admin.firmware.registerFromServerError'),
        'error',
      )
    } finally {
      registerSubmitting.value = false
      resetRegisterModalState()
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
        remark: newRemark,
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
    const target = firmwareToDelete.value
    try {
      const { prepareLegacyNodeUpload } = await import('@/utils/uploadBridge')
      await prepareLegacyNodeUpload()
      await deleteFirmwareApi(target.id)
      closeDeleteModal()
      fetchFirmwareItems().catch(() => {})
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
      hour12: false,
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

  return {
    isScopedAgent,
    canView,
    canEdit,
    canDelete,
    canAccessPage,
    firmwareItems,
    firmwareLoading,
    firmwareUploading,
    firmwareUploadProgress,
    firmwareInputRef,
    showDeleteModal,
    firmwareToDelete,
    showUploadModal,
    pendingUploadFile,
    uploadRemark,
    showRegisterModal,
    registerFileName,
    registerRemark,
    registerSubmitting,
    editingRemarkId,
    inlineRemarkDraft,
    remarkSavingId,
    tableItems,
    toast,
    triggerFirmwareSelect,
    onFirmwareFileChange,
    closeUploadModal,
    confirmUpload,
    registerFirmwareFromServer,
    closeRegisterModal,
    confirmRegisterFromServer,
    startInlineRemark,
    cancelInlineRemark,
    commitInlineRemark,
    setDefaultFirmware,
    confirmDelete,
    closeDeleteModal,
    executeDelete,
    formatFirmwareSize,
  }
}
