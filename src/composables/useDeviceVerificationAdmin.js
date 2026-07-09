import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceVerificationCatalog } from '@/composables/useDeviceVerificationCatalog'
import { formatDeviceDate, formatDeviceDateTime } from '@/utils/deviceVerificationDate'
import { fetchDevices as fetchDevicesApi } from '@/services/v2/admin/devices'
import { handleAdminApiFailure } from '@/utils/adminApiError'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import { useDeviceVerificationSettings } from '@/composables/useDeviceVerificationSettings'
import { useDeviceActionMenu } from '@/composables/useDeviceActionMenu'
import { useDeviceVerificationModals } from '@/composables/useDeviceVerificationModals'
import {
  normalizeDeviceIdValue,
  normalizeFingerprintValue,
  formatFingerprint,
} from '@/utils/deviceVerificationFields'

/** 设备验证管理页：列表、选择与全局编排 */
export function useDeviceVerificationAdmin() {
  const { has, isScopedAgent } = useAdminPermissions()
  const canManage = computed(() => has('device.view'))
  const canAccessPage = computed(() => canManage.value)
  const canManageGlobalSettings = computed(() => !isScopedAgent.value)

  const { t, locale } = useI18n()

  const devices = ref([])
  const loading = ref(true)
  const selectAll = ref(false)
  const selectedDevices = ref([])

  const toast = ref({
    visible: false,
    type: 'success',
    message: '',
  })

  function showToast(message, type = 'success') {
    toast.value = { visible: true, type, message }
    setTimeout(() => {
      toast.value.visible = false
    }, 4000)
  }

  async function handleUnauthorized(error) {
    return handleAdminApiFailure(error, {
      onForbidden: (msg) => showToast(msg, 'error'),
    })
  }

  async function fetchDevices() {
    loading.value = true
    try {
      const response = await fetchDevicesApi()
      devices.value = response.data.devices || []
    } catch (error) {
      if (await handleUnauthorized(error)) return
      showToast(t('admin.deviceVerification.loadError'), 'error')
    } finally {
      loading.value = false
    }
  }

  const {
    questions,
    firmwareItems,
    firmwareLoading,
    fetchQuestions,
    fetchFirmwareItems,
  } = useDeviceVerificationCatalog({ t, showToast, handleUnauthorized })

  const {
    cooldownHours,
    signingPrivateKeyInput,
    signingKeyConfigured,
    settingsSaving,
    signingKeySaving,
    fetchDeviceSettings,
    saveCooldownSettings,
    scheduleSigningKeyAutoSave,
    disposeSettings,
  } = useDeviceVerificationSettings({ showToast, handleUnauthorized })

  const modals = useDeviceVerificationModals({
    devices,
    selectedDevices,
    locale,
    t,
    showToast,
    fetchDevices,
  })

  const {
    openActionMenuDevice,
    actionMenuPanelRef,
    actionMenuPanelStyle,
    toggleActionMenu,
    closeActionMenu,
    positionActionMenu,
    onActionMenuViewportChange: handleActionMenuViewportChange,
  } = useDeviceActionMenu()

  function runDeviceAction(action) {
    const device = openActionMenuDevice.value
    closeActionMenu()
    if (!device) return
    action(device)
  }

  onMounted(() => {
    initPage()
    document.addEventListener('click', closeActionMenu)
    window.addEventListener('resize', handleActionMenuViewportChange)
    window.addEventListener('scroll', handleActionMenuViewportChange, true)
  })

  onUnmounted(() => {
    disposeSettings()
    document.removeEventListener('click', closeActionMenu)
    window.removeEventListener('resize', handleActionMenuViewportChange)
    window.removeEventListener('scroll', handleActionMenuViewportChange, true)
  })

  async function initPage() {
    if (!canAccessPage.value) {
      loading.value = false
      return
    }
    await Promise.all([
      ...(canManageGlobalSettings.value ? [fetchDeviceSettings()] : []),
      fetchDevices(),
    ])
    fetchQuestions()
    fetchFirmwareItems()
  }

  watch(selectedDevices, (newVal) => {
    selectAll.value = newVal.length > 0 && devices.value.every((d) => newVal.includes(d.id))
  }, { deep: true })

  function toggleSelectAll() {
    if (selectAll.value) {
      selectedDevices.value = devices.value.map((d) => d.id)
    } else {
      selectedDevices.value = []
    }
  }

  function getRemainingClass(device) {
    const remaining = device.max_verifications - device.verification_count
    if (remaining <= 0) return 'remaining-zero'
    if (remaining <= 5) return 'remaining-low'
    return 'remaining-ok'
  }

  function formatDate(dateStr) {
    return formatDeviceDate(dateStr, locale.value)
  }

  function formatFullDate(dateStr) {
    return formatDeviceDateTime(dateStr, locale.value)
  }

  return {
    canManage,
    canAccessPage,
    canManageGlobalSettings,
    isScopedAgent,
    devices,
    loading,
    selectAll,
    selectedDevices,
    questions,
    toast,
    firmwareItems,
    firmwareLoading,
    cooldownHours,
    signingPrivateKeyInput,
    signingKeyConfigured,
    settingsSaving,
    signingKeySaving,
    openActionMenuDevice,
    actionMenuPanelRef,
    actionMenuPanelStyle,
    toggleActionMenu,
    closeActionMenu,
    runDeviceAction,
    saveCooldownSettings,
    scheduleSigningKeyAutoSave,
    normalizeDeviceIdValue,
    normalizeFingerprintValue,
    formatFingerprint,
    toggleSelectAll,
    getRemainingClass,
    formatDate,
    formatFullDate,
    showToast,
    ...modals,
  }
}
