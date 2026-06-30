import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchOrders as fetchOrdersApi,
  updateOrderStatus,
  deleteOrder,
} from '@/services/v2/admin/orders'
import { displayOrderNo } from '@/utils/orderNo'
import { normalizeOrderStatus, getAdminOrderStatusLabel } from '@/utils/orderStatus'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import { useAdminOrderTracking } from '@/composables/useAdminOrderTracking'

/**
 * 后台订单页状态与行为：列表、状态更新、删除、详情弹窗
 */
export function useAdminOrdersPage() {
  const { has } = useAdminPermissions()
  const canView = computed(() => has('order.view') || has('order.view_own_tree'))
  const canManage = computed(() => has('order.manage'))
  const canAccessPage = computed(() => canView.value)

  const { t, locale } = useI18n()

  const orders = ref([])
  const loading = ref(true)
  const statusFilter = ref('')

  const showDeleteModal = ref(false)
  const orderToDelete = ref(null)
  const showOrderDetailModal = ref(false)
  const selectedOrder = ref(null)

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

  const {
    trackingInput,
    savingTracking,
    bindOrder,
    scheduleTrackingSave,
    flushTrackingSave,
    clearTracking,
    closeTrackingSession,
  } = useAdminOrderTracking({ selectedOrder, orders, showToast, t })

  onMounted(fetchOrders)

  async function fetchOrders() {
    if (!canAccessPage.value) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const params = statusFilter.value ? { status: statusFilter.value } : {}
      const response = await fetchOrdersApi({ params })
      orders.value = response.data
    } catch {
      showToast(t('admin.orders.toast.loadFailed'), 'error')
    } finally {
      loading.value = false
    }
  }

  function getStatusText(status) {
    if (!status) return ''
    return getAdminOrderStatusLabel(status, t)
  }

  async function handleStatusUpdate(id, status) {
    try {
      await updateOrderStatus(id, { status })
      const row = orders.value.find((o) => o.id === id)
      if (row) {
        row.status = status
      }
      showToast(t('admin.orders.toast.updateSuccess', { id, status: getStatusText(status) }), 'success')
    } catch {
      showToast(t('admin.orders.toast.updateFailed'), 'error')
      fetchOrders()
    }
  }

  function confirmDelete(id) {
    orderToDelete.value = orders.value.find((o) => o.id === id) || null
    showDeleteModal.value = true
  }

  function closeDeleteModal() {
    showDeleteModal.value = false
    orderToDelete.value = null
  }

  async function executeDelete() {
    if (!orderToDelete.value) return

    try {
      await deleteOrder(orderToDelete.value.id)
      closeDeleteModal()
      await fetchOrders()
      showToast(t('admin.orders.toast.deleteSuccess'), 'success')
    } catch {
      showToast(t('admin.orders.toast.deleteFailed'), 'error')
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
    return new Date(dateStr).toLocaleString(fmtLocale)
  }

  function truncateHash(hash) {
    if (!hash) return '-'
    return hash.length > 16 ? `${hash.substring(0, 16)}...` : hash
  }

  function truncateAddress(address) {
    if (!address) return '-'
    return address.length > 30 ? `${address.substring(0, 30)}...` : address
  }

  async function copyAddress(address) {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      showToast(t('admin.orders.toast.addressCopied'), 'success')
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  async function copyTxHash(hash) {
    if (!hash) return
    try {
      await navigator.clipboard.writeText(hash)
      showToast(t('admin.orders.toast.txHashCopied'), 'success')
    } catch (err) {
      console.error('Failed to copy tx hash:', err)
    }
  }

  function openOrderDetail(order) {
    selectedOrder.value = order
    bindOrder(order)
    showOrderDetailModal.value = true
  }

  async function closeOrderDetailModal() {
    await closeTrackingSession()
    showOrderDetailModal.value = false
    selectedOrder.value = null
  }

  function setTrackingInput(value) {
    trackingInput.value = String(value ?? '')
  }

  return {
    canManage,
    canAccessPage,
    orders,
    loading,
    statusFilter,
    showDeleteModal,
    orderToDelete,
    showOrderDetailModal,
    selectedOrder,
    toast,
    trackingInput,
    savingTracking,
    scheduleTrackingSave,
    flushTrackingSave,
    clearTracking,
    setTrackingInput,
    fetchOrders,
    getStatusText,
    normalizeOrderStatus,
    handleStatusUpdate,
    confirmDelete,
    closeDeleteModal,
    executeDelete,
    formatDate,
    truncateHash,
    truncateAddress,
    copyAddress,
    copyTxHash,
    openOrderDetail,
    closeOrderDetailModal,
    displayOrderNo,
  }
}
