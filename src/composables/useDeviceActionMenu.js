import { ref, nextTick } from 'vue'

/** 设备列表「更多操作」浮动菜单定位 */
export function useDeviceActionMenu() {
  const openActionMenuDevice = ref(null)
  const actionMenuPanelRef = ref(null)
  const actionMenuPanelStyle = ref({})
  let actionMenuTriggerEl = null

  async function toggleActionMenu(device, event) {
    if (openActionMenuDevice.value?.id === device.id) {
      closeActionMenu()
      return
    }
    openActionMenuDevice.value = device
    actionMenuTriggerEl = event.currentTarget
    await nextTick()
    positionActionMenu()
    await nextTick()
    positionActionMenu()
  }

  function positionActionMenu() {
    if (!actionMenuTriggerEl) return

    const rect = actionMenuTriggerEl.getBoundingClientRect()
    const panel = actionMenuPanelRef.value
    const panelHeight = panel?.offsetHeight || 240
    const panelWidth = Math.max(panel?.offsetWidth || 160, rect.width)
    const gap = 6
    const margin = 8

    let top = rect.bottom + gap
    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - gap - panelHeight)
    }

    let left = rect.right - panelWidth
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

    actionMenuPanelStyle.value = {
      top: `${top}px`,
      left: `${left}px`,
      minWidth: `${rect.width}px`
    }
  }

  function closeActionMenu() {
    openActionMenuDevice.value = null
    actionMenuTriggerEl = null
    actionMenuPanelStyle.value = {}
  }

  function onActionMenuViewportChange() {
    if (!openActionMenuDevice.value) return
    if (!actionMenuTriggerEl || !document.body.contains(actionMenuTriggerEl)) {
      closeActionMenu()
      return
    }
    positionActionMenu()
  }

  return {
    openActionMenuDevice,
    actionMenuPanelRef,
    actionMenuPanelStyle,
    toggleActionMenu,
    closeActionMenu,
    positionActionMenu,
    onActionMenuViewportChange
  }
}
