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

export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}

export function cachedV2OrLegacy({ key, ttl, useV2, v2, legacy }) {
  const fetcher = useV2 ? v2 : legacy
  return cachedRequest(key, ttl, fetcher)
}

export function afterCacheMutation(run, prefix) {
  return run.then((res) => {
    invalidateCache(prefix)
    return res
  })
}
