import { invalidateCache } from '@/utils/getCache'
import { CACHE_NAMESPACE } from '@/utils/cachePolicy'

const CHANNEL_NAME = 'yh-popup-notice'
const STORAGE_KEY = 'yh-popup-notice-updated-at'

let sharedChannel = null

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(CHANNEL_NAME)
  }
  return sharedChannel
}

/**
 * 后台更新公告后调用：清理缓存并广播给当前页/其他标签页
 */
export function notifyPopupNoticeUpdated() {
  const payload = { at: Date.now() }
  invalidateCache(CACHE_NAMESPACE.POPUP)

  const channel = getChannel()
  if (channel) {
    channel.postMessage(payload)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANNEL_NAME, { detail: payload }))
    try {
      window.localStorage.setItem(STORAGE_KEY, String(payload.at))
    } catch {
      // 忽略隐私模式等不可写场景
    }
  }
}

/**
 * 订阅公告更新事件，支持同标签页和跨标签页
 */
export function subscribePopupNoticeUpdated(handler) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const onCustomEvent = (event) => {
    handler(event.detail || { at: Date.now() })
  }
  window.addEventListener(CHANNEL_NAME, onCustomEvent)

  const channel = getChannel()
  const onChannelMessage = (event) => {
    handler(event.data || { at: Date.now() })
  }
  if (channel) {
    channel.addEventListener('message', onChannelMessage)
  }

  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    handler({ at: Number(event.newValue) || Date.now() })
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(CHANNEL_NAME, onCustomEvent)
    if (channel) {
      channel.removeEventListener('message', onChannelMessage)
    }
    window.removeEventListener('storage', onStorage)
  }
}
