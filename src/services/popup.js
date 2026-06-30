import * as popupV2 from '@/services/v2/popup'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'
import { cachedV2OrLegacy, invalidateCache } from '@/utils/getCache'
import { CACHE_NAMESPACE, CACHE_TTL } from '@/utils/cachePolicy'

const USE_V2 = useV2Api()

function popupFetcher({ cacheKey, apiScope, v2Fn, fresh = false }) {
  if (fresh) {
    invalidateCache(cacheKey)
  }

  return cachedV2OrLegacy({
    key: cacheKey,
    ttl: CACHE_TTL.POPUP_NOTICE,
    useV2: USE_V2,
    v2: v2Fn,
    legacy: () => api.get('/api/popup-notice', { params: { scope: apiScope } }),
  }).then((res) => {
    if (!res?.data?.notice) {
      // 公告为空时不固化缓存，避免后台刚启用后前台仍命中空值
      invalidateCache(cacheKey)
    }
    return res
  })
}

function fetchHomePopupNoticeBase(fresh = false) {
  return popupFetcher({
    cacheKey: `${CACHE_NAMESPACE.POPUP}home`,
    apiScope: 'popup',
    v2Fn: () => popupV2.fetchActivePopup(),
    fresh,
  })
}

function fetchDisplayNoticeBase(fresh = false) {
  return popupFetcher({
    cacheKey: `${CACHE_NAMESPACE.POPUP}display`,
    apiScope: 'display',
    v2Fn: () => popupV2.fetchActiveDisplay(),
    fresh,
  })
}

export function fetchHomePopupNotice() {
  return fetchHomePopupNoticeBase(false)
}

export function fetchHomePopupNoticeFresh() {
  return fetchHomePopupNoticeBase(true)
}

export function fetchDisplayNotice() {
  return fetchDisplayNoticeBase(false)
}

export function fetchDisplayNoticeFresh() {
  return fetchDisplayNoticeBase(true)
}
