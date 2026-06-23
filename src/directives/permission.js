import { watch } from 'vue'
import { useAdminV2Store } from '@/stores/adminV2'

/** 记录元素原始 display，便于恢复 */
function rememberDisplay(el) {
  if (el.dataset.permDisplay === undefined) {
    el.dataset.permDisplay = el.style.display || ''
  }
}

function applyPermission(el, binding) {
  const store = useAdminV2Store()
  const perm = binding.value
  rememberDisplay(el)

  // 会话未校验完成前不隐藏，避免刷新后按钮永久消失
  if (!store.checked) {
    el.style.display = el.dataset.permDisplay
    return
  }

  const allowed = store.hasPermission(perm)
  el.style.display = allowed ? el.dataset.permDisplay : 'none'
}

/**
 * 按钮/区块级权限：v-permission="'role.manage'"
 * 随 adminV2 权限列表变化自动更新显示
 */
export default {
  mounted(el, binding) {
    applyPermission(el, binding)
    const store = useAdminV2Store()
    el._permissionStop = watch(
      () => [store.checked, store.permissions],
      () => applyPermission(el, binding),
      { deep: true }
    )
  },
  updated(el, binding) {
    applyPermission(el, binding)
  },
  unmounted(el) {
    el._permissionStop?.()
    delete el._permissionStop
  }
}
