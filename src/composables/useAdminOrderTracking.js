import { ref } from 'vue'
import { updateOrderTracking } from '@/services/v2/admin/orders'

/**
 * 后台订单详情：物流单号自动保存
 */
export function useAdminOrderTracking({ selectedOrder, orders, showToast, t }) {
  const trackingInput = ref('')
  const lastSavedTracking = ref('')
  const savingTracking = ref(false)
  let trackingSaveTimer = null

  function bindOrder(order) {
    const saved = order?.trackingNumber || ''
    trackingInput.value = saved
    lastSavedTracking.value = saved
  }

  function clearTrackingSaveTimer() {
    if (trackingSaveTimer) {
      clearTimeout(trackingSaveTimer)
      trackingSaveTimer = null
    }
  }

  function scheduleTrackingSave() {
    clearTrackingSaveTimer()
    trackingSaveTimer = setTimeout(() => {
      trackingSaveTimer = null
      saveTracking()
    }, 700)
  }

  async function flushTrackingSave() {
    clearTrackingSaveTimer()
    await saveTracking()
  }

  async function saveTracking() {
    if (!selectedOrder.value || savingTracking.value) return

    const trimmed = trackingInput.value.trim()
    if (trimmed === lastSavedTracking.value) return

    savingTracking.value = true
    try {
      const response = await updateOrderTracking(selectedOrder.value.id, {
        trackingNumber: trimmed,
      })
      const updated = response.data?.order
      if (updated) {
        selectedOrder.value = { ...selectedOrder.value, ...updated }
        const idx = orders.value.findIndex((o) => o.id === updated.id)
        if (idx >= 0) {
          orders.value[idx] = { ...orders.value[idx], ...updated }
        }
        const saved = updated.trackingNumber || ''
        trackingInput.value = saved
        lastSavedTracking.value = saved
      }
      showToast(t('admin.orders.toast.trackingSaved'), 'success')
    } catch (error) {
      showToast(t('admin.orders.toast.trackingSaveFailed'), 'error')
    } finally {
      savingTracking.value = false
    }
  }

  async function clearTracking() {
    trackingInput.value = ''
    await saveTracking()
  }

  async function closeTrackingSession() {
    await flushTrackingSave()
    trackingInput.value = ''
    lastSavedTracking.value = ''
    savingTracking.value = false
  }

  return {
    trackingInput,
    savingTracking,
    bindOrder,
    scheduleTrackingSave,
    flushTrackingSave,
    saveTracking,
    clearTracking,
    closeTrackingSession,
  }
}
