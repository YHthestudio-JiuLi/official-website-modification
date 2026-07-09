import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchVerificationSettings,
  updateVerificationSettings
} from '@/services/v2/admin/devices'

/** 设备验证全局设置：冷却间隔与平台签名私钥 */
export function useDeviceVerificationSettings({ showToast, handleUnauthorized }) {
  const { t } = useI18n()

  const cooldownHours = ref(0)
  const signingPrivateKeyInput = ref('')
  const signingKeyConfigured = ref(false)
  const settingsSaving = ref(false)
  const signingKeySaving = ref(false)
  let signingKeySaveTimer = null

  function disposeSettings() {
    if (signingKeySaveTimer) {
      clearTimeout(signingKeySaveTimer)
      signingKeySaveTimer = null
    }
  }

  async function fetchDeviceSettings() {
    try {
      const response = await fetchVerificationSettings()
      const sec = response.data?.verify_cooldown_seconds
      const secNum = typeof sec === 'number' ? sec : parseInt(sec, 10) || 0
      cooldownHours.value = Number((secNum / 3600).toFixed(2))
      signingKeyConfigured.value = Boolean(response.data?.signing_key_configured)
    } catch (error) {
      if (await handleUnauthorized(error)) return
      showToast(t('admin.deviceVerification.loadSettingsError'), 'error')
    }
  }

  async function saveCooldownSettings() {
    const hours = parseFloat(cooldownHours.value)
    if (Number.isNaN(hours) || hours < 0 || hours > 8760) {
      showToast(t('admin.deviceVerification.cooldownInvalid'), 'error')
      return
    }
    const sec = Math.round(hours * 3600)
    settingsSaving.value = true
    try {
      await updateVerificationSettings({ verify_cooldown_seconds: sec })
      await fetchDeviceSettings()
      showToast(t('admin.deviceVerification.cooldownSaved'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.cooldownSaveError'), 'error')
    } finally {
      settingsSaving.value = false
    }
  }

  function scheduleSigningKeyAutoSave() {
    if (signingKeySaveTimer) {
      clearTimeout(signingKeySaveTimer)
    }
    signingKeySaveTimer = setTimeout(() => {
      signingKeySaveTimer = null
      void saveSigningPrivateKey()
    }, 700)
  }

  async function saveSigningPrivateKey() {
    const privateKey = signingPrivateKeyInput.value.trim()
    if (!privateKey || signingKeySaving.value) return

    signingKeySaving.value = true
    try {
      await updateVerificationSettings({ signing_private_key: privateKey })
      signingPrivateKeyInput.value = ''
      await fetchDeviceSettings()
      showToast(t('admin.deviceVerification.signingKeySaved'), 'success')
    } catch (error) {
      showToast(error.response?.data?.error || t('admin.deviceVerification.signingKeySaveError'), 'error')
    } finally {
      signingKeySaving.value = false
    }
  }

  return {
    cooldownHours,
    signingPrivateKeyInput,
    signingKeyConfigured,
    settingsSaving,
    signingKeySaving,
    fetchDeviceSettings,
    saveCooldownSettings,
    scheduleSigningKeyAutoSave,
    disposeSettings
  }
}
