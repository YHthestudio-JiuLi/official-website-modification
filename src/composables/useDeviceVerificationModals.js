import { ref } from 'vue'
import {
  createDevice as createDeviceApi,
  updateDevice as updateDeviceApi,
  deleteDevice as deleteDeviceApi,
  resetDeviceCount,
  fetchDeviceLogs,
} from '@/services/v2/admin/devices'
import {
  FINGERPRINT_ALGO_VERSION,
  normalizeDeviceIdValue,
  normalizeFingerprintValue,
} from '@/utils/deviceVerificationFields'
import {
  formatDeviceDateTime,
  truncateUserAgent,
} from '@/utils/deviceVerificationDate'

/** 设备验证页：CRUD / 日志弹窗状态与操作 */
export function useDeviceVerificationModals({
  devices,
  selectedDevices,
  locale,
  t,
  showToast,
  fetchDevices,
}) {
  const showAddModal = ref(false)
  const newDevice = ref({
    device_id: '',
    max_verifications: 10,
    question_id: '',
    firmware_id: '',
    device_fingerprint: '',
  })

  const showEditModalVisible = ref(false)
  const editingDevice = ref(null)
  const editData = ref({
    max_verifications: null,
    add_count: 0,
    question_id: '',
    firmware_id: '',
    device_fingerprint: '',
  })

  const showDeleteModal = ref(false)
  const deviceToDelete = ref(null)

  const showBatchDeleteModal = ref(false)

  const showLogsModalVisible = ref(false)
  const logsDevice = ref(null)
  const logs = ref([])
  const logsTotal = ref(0)
  const logsLoading = ref(false)

  function closeAddModal() {
    showAddModal.value = false
    newDevice.value = {
      device_id: '',
      max_verifications: 10,
      question_id: '',
      firmware_id: '',
      device_fingerprint: '',
    }
  }

  async function addDevice() {
    const normalizedDeviceId = normalizeDeviceIdValue(newDevice.value.device_id)
    if (!normalizedDeviceId) {
      showToast(t('admin.deviceVerification.deviceIdFormatError'), 'error')
      return
    }

    try {
      const questionId = newDevice.value.question_id ? parseInt(newDevice.value.question_id, 10) : null
      const firmwareId = newDevice.value.firmware_id ? parseInt(newDevice.value.firmware_id, 10) : null
      const fingerprintRaw = String(newDevice.value.device_fingerprint || '').trim()
      const normalizedFingerprint = normalizeFingerprintValue(newDevice.value.device_fingerprint)
      if (!fingerprintRaw) {
        showToast(t('admin.deviceVerification.fingerprintRequired'), 'error')
        return
      }
      if (!normalizedFingerprint) {
        showToast(t('admin.deviceVerification.fingerprintFormatError'), 'error')
        return
      }

      await createDeviceApi({
        device_id: normalizedDeviceId,
        max_verifications: newDevice.value.max_verifications,
        question_id: questionId,
        firmware_id: firmwareId,
        device_fingerprint: normalizedFingerprint,
        fingerprint_algo_version: FINGERPRINT_ALGO_VERSION,
        is_whitelisted: false,
      })
      closeAddModal()
      await fetchDevices()
      showToast(t('admin.deviceVerification.addSuccess'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.addError'), 'error')
    }
  }

  function showEditModal(device) {
    editingDevice.value = device
    editData.value = {
      max_verifications: device.max_verifications,
      add_count: 0,
      question_id: device.question_id || '',
      firmware_id: device.firmware_id || '',
      device_fingerprint: device.device_fingerprint || '',
    }
    showEditModalVisible.value = true
  }

  function closeEditModal() {
    showEditModalVisible.value = false
    editingDevice.value = null
  }

  async function updateDevice() {
    if (!editingDevice.value) return

    try {
      const payload = {}
      if (editData.value.max_verifications !== editingDevice.value.max_verifications) {
        payload.max_verifications = editData.value.max_verifications
      }
      if (editData.value.add_count > 0) {
        payload.add_max_verifications = editData.value.add_count
      }
      const editQuestionId = editData.value.question_id ? parseInt(editData.value.question_id, 10) : null
      const deviceQuestionId = editingDevice.value.question_id
      if (editQuestionId !== deviceQuestionId) {
        payload.question_id = editQuestionId
      }
      const editFirmwareId = editData.value.firmware_id ? parseInt(editData.value.firmware_id, 10) : null
      const deviceFirmwareId = editingDevice.value.firmware_id || null
      if (editFirmwareId !== deviceFirmwareId) {
        payload.firmware_id = editFirmwareId
      }
      const currentFingerprint = normalizeFingerprintValue(editingDevice.value.device_fingerprint)
      const editFingerprintRaw = String(editData.value.device_fingerprint || '').trim()
      const editFingerprint = editFingerprintRaw ? normalizeFingerprintValue(editData.value.device_fingerprint) : null
      if (editFingerprintRaw && !editFingerprint) {
        showToast(t('admin.deviceVerification.fingerprintFormatError'), 'error')
        return
      }
      if (editFingerprint !== currentFingerprint) {
        payload.device_fingerprint = editFingerprint
      }
      if (editFingerprintRaw && editFingerprint !== currentFingerprint) {
        payload.fingerprint_algo_version = FINGERPRINT_ALGO_VERSION
      }
      if (Object.keys(payload).length === 0) {
        closeEditModal()
        return
      }

      await updateDeviceApi(editingDevice.value.device_id, payload)
      closeEditModal()
      await fetchDevices()
      showToast(t('admin.deviceVerification.updateSuccess'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.updateError'), 'error')
    }
  }

  async function toggleWhitelist(device) {
    const current = Number(device.is_whitelisted || 0) === 1
    try {
      await updateDeviceApi(device.device_id, {
        is_whitelisted: !current,
      })
      await fetchDevices()
      showToast(
        !current
          ? t('admin.deviceVerification.deviceEnabledToast')
          : t('admin.deviceVerification.deviceDisabledToast'),
        'success'
      )
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.deviceStatusUpdateError'), 'error')
    }
  }

  async function resetCount(device) {
    try {
      await resetDeviceCount(device.device_id)
      await fetchDevices()
      showToast(t('admin.deviceVerification.resetSuccess'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.resetError'), 'error')
    }
  }

  async function showLogsModal(device) {
    logsDevice.value = device
    logs.value = []
    logsTotal.value = 0
    showLogsModalVisible.value = true
    await fetchLogs()
  }

  function closeLogsModal() {
    showLogsModalVisible.value = false
    logsDevice.value = null
    logs.value = []
    logsTotal.value = 0
  }

  async function fetchLogs() {
    if (!logsDevice.value) return
    logsLoading.value = true
    try {
      const response = await fetchDeviceLogs(logsDevice.value.device_id)
      logs.value = response.data.logs || []
      logsTotal.value = response.data.total || 0
    } catch {
      showToast(t('admin.deviceVerification.loadLogsError'), 'error')
    } finally {
      logsLoading.value = false
    }
  }

  function formatDateTime(dateStr) {
    return formatDeviceDateTime(dateStr, locale.value)
  }

  function truncateUA(ua) {
    return truncateUserAgent(ua)
  }

  function confirmDelete(device) {
    deviceToDelete.value = device
    showDeleteModal.value = true
  }

  function closeDeleteModal() {
    showDeleteModal.value = false
    deviceToDelete.value = null
  }

  async function executeDelete() {
    if (!deviceToDelete.value) return

    try {
      await deleteDeviceApi(deviceToDelete.value.device_id)
      closeDeleteModal()
      await fetchDevices()
      showToast(t('admin.deviceVerification.deleteSuccess'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.deleteError'), 'error')
    }
  }

  function confirmBatchDelete() {
    if (selectedDevices.value.length === 0) return
    showBatchDeleteModal.value = true
  }

  function closeBatchDeleteModal() {
    showBatchDeleteModal.value = false
  }

  async function executeBatchDelete() {
    const selectedIds = [...selectedDevices.value]
    if (selectedIds.length === 0) return

    const targets = selectedIds
      .map((id) => devices.value.find((d) => d.id === id))
      .filter((device) => device?.device_id)

    if (targets.length === 0) {
      showToast(t('admin.deviceVerification.deleteError'), 'error')
      return
    }

    try {
      await Promise.all(targets.map((device) => deleteDeviceApi(device.device_id)))
      closeBatchDeleteModal()
      selectedDevices.value = []
      await fetchDevices()
      showToast(t('admin.deviceVerification.batchDeleteSuccess', { count: targets.length }), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.deleteError'), 'error')
    }
  }

  return {
    showAddModal,
    newDevice,
    showEditModalVisible,
    editingDevice,
    editData,
    showDeleteModal,
    deviceToDelete,
    showBatchDeleteModal,
    showLogsModalVisible,
    logsDevice,
    logs,
    logsTotal,
    logsLoading,
    closeAddModal,
    addDevice,
    showEditModal,
    closeEditModal,
    updateDevice,
    toggleWhitelist,
    resetCount,
    showLogsModal,
    closeLogsModal,
    formatDateTime,
    truncateUA,
    confirmDelete,
    closeDeleteModal,
    executeDelete,
    confirmBatchDelete,
    closeBatchDeleteModal,
    executeBatchDelete,
  }
}
