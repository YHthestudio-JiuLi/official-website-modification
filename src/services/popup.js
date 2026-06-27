import * as popupV2 from '@/services/v2/popup'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'
import { cachedRequest, invalidateCache } from '@/utils/getCache'

const USE_V2 = useV2Api()
const POPUP_TTL = 60_000

/** 首页弹窗公告 */
export function fetchHomePopupNotice() {
  const key = 'popup:home'
  const fetcher = USE_V2
    ? () => popupV2.fetchActivePopup()
    : () => api.get('/api/popup-notice', { params: { scope: 'popup' } })
  return cachedRequest(key, POPUP_TTL, fetcher).then((res) => {
    if (!res?.data?.notice) {
      invalidateCache(key)
    }
    return res
  })
}

/** 商品详情等页面的滚动展示公告 */
export function fetchDisplayNotice() {
  const key = 'popup:display'
  const fetcher = USE_V2
    ? () => popupV2.fetchActiveDisplay()
    : () => api.get('/api/popup-notice', { params: { scope: 'display' } })
  return cachedRequest(key, POPUP_TTL, fetcher).then((res) => {
    if (!res?.data?.notice) {
      invalidateCache(key)
    }
    return res
  })
}
