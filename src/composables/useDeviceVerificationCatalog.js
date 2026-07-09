import { ref } from 'vue'
import { fetchQuestions as fetchQuestionsApi } from '@/services/v2/admin/questions'
import { fetchFirmwares as fetchFirmwaresApi } from '@/services/v2/admin/firmware'
import { readAdminApiError } from '@/utils/adminApiError'

/** 设备验证页：题库与固件下拉数据源 */
export function useDeviceVerificationCatalog({ t, showToast, handleUnauthorized }) {
  const questions = ref([])
  const firmwareItems = ref([])
  const firmwareLoading = ref(false)

  async function fetchQuestions() {
    try {
      const response = await fetchQuestionsApi()
      const data = response.data
      questions.value = Array.isArray(data) ? data : (data?.items || [])
    } catch (error) {
      if (await handleUnauthorized(error)) return
      showToast(readAdminApiError(error, t('admin.questions.loadError')), 'error')
    }
  }

  async function fetchFirmwareItems() {
    firmwareLoading.value = true
    try {
      const response = await fetchFirmwaresApi()
      firmwareItems.value = response.data.items || []
    } catch (error) {
      if (await handleUnauthorized(error)) return
      showToast(readAdminApiError(error, t('admin.deviceVerification.firmwareLoadListError')), 'error')
    } finally {
      firmwareLoading.value = false
    }
  }

  return {
    questions,
    firmwareItems,
    firmwareLoading,
    fetchQuestions,
    fetchFirmwareItems,
  }
}
