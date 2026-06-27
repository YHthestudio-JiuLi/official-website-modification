import v2 from './http'

/** 首页弹窗（scope=popup） */
export function fetchActivePopup() {
  return v2.get('/popup-notice', { params: { scope: 'popup' } })
}

/** 页面内滚动展示（scope=display） */
export function fetchActiveDisplay() {
  return v2.get('/popup-notice', { params: { scope: 'display' } })
}
