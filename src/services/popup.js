import * as popupV2 from '@/services/v2/popup'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'
import { cachedRequest } from '@/utils/getCache'

const USE_V2 = useV2Api()
const POPUP_TTL = 120_000

/** 首页弹窗公告 */
export function fetchHomePopupNotice() {
  const key = 'popup:home'
  if (USE_V2) {
    return cachedRequest(key, POPUP_TTL, () => popupV2.fetchActivePopup())
  }
  return cachedRequest(key, POPUP_TTL, () => api.get('/api/popup-notice', { params: { scope: 'popup' } }))
}

/** 商品详情等页面的滚动展示公告 */
export function fetchDisplayNotice() {
  const key = 'popup:display'
  if (USE_V2) {
    return cachedRequest(key, POPUP_TTL, () => popupV2.fetchActiveDisplay())
  }
  return cachedRequest(key, POPUP_TTL, () => api.get('/api/popup-notice', { params: { scope: 'display' } }))
}
