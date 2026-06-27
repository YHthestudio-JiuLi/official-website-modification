/** 前端 GET 短缓存：合并并发、减少重复请求 */

const store = new Map()
const inflight = new Map()

/**
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} fetcher
 * @returns {Promise<T>}
 */
export function cachedRequest(key, ttlMs, fetcher) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && now - hit.ts < ttlMs) {
    return Promise.resolve(hit.value)
  }

  if (inflight.has(key)) {
    return inflight.get(key)
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      store.set(key, { ts: Date.now(), value })
      inflight.delete(key)
      return value
    })
    .catch((error) => {
      inflight.delete(key)
      throw error
    })

  inflight.set(key, promise)
  return promise
}

/** 按前缀清除缓存（数据变更后调用） */
export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}
