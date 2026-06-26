import * as popupV2 from '@/services/v2/popup'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'

const USE_V2 = useV2Api()

/** 首页弹窗公告 */
export function fetchHomePopupNotice() {
  if (USE_V2) {
    return popupV2.fetchActivePopup()
  }
  return api.get('/api/popup-notice', { params: { scope: 'popup' } })
}

/** 商品详情等页面的滚动展示公告 */
export function fetchDisplayNotice() {
  if (USE_V2) {
    return popupV2.fetchActiveDisplay()
  }
  return api.get('/api/popup-notice', { params: { scope: 'display' } })
}
