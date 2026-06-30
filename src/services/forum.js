import * as forumV2 from '@/services/v2/forum'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'
import { cachedV2OrLegacy, afterCacheMutation, invalidateCache } from '@/utils/getCache'
import { CACHE_NAMESPACE, CACHE_TTL } from '@/utils/cachePolicy'

const USE_V2 = useV2Api()

export function getForumPosts(config = {}) {
  return cachedV2OrLegacy({
    key: `${CACHE_NAMESPACE.FORUM}posts`,
    ttl: CACHE_TTL.FORUM_LIST,
    useV2: USE_V2,
    v2: () => forumV2.fetchPosts(config),
    legacy: () => api.get('/api/forum/posts', config),
  })
}

export function getForumPost(id) {
  return cachedV2OrLegacy({
    key: `${CACHE_NAMESPACE.FORUM}post:${id}`,
    ttl: CACHE_TTL.FORUM_DETAIL,
    useV2: USE_V2,
    v2: () => forumV2.fetchPost(id),
    legacy: () => api.get(`/api/forum/posts/${id}`),
  })
}

export function getForumReplies(postId) {
  return cachedV2OrLegacy({
    key: `${CACHE_NAMESPACE.FORUM}replies:${postId}`,
    ttl: CACHE_TTL.FORUM_DETAIL,
    useV2: USE_V2,
    v2: () => forumV2.fetchReplies(postId),
    legacy: () => api.get(`/api/forum/posts/${postId}/replies`),
  })
}

function afterForumMutation(run, postId) {
  return afterCacheMutation(run, CACHE_NAMESPACE.FORUM).then((res) => {
    if (postId) {
      invalidateCache(`${CACHE_NAMESPACE.FORUM}post:${postId}`)
      invalidateCache(`${CACHE_NAMESPACE.FORUM}replies:${postId}`)
    }
    return res
  })
}

export function createForumPost(payload) {
  const run = USE_V2 ? forumV2.createPost(payload) : api.post('/api/forum/posts', payload)
  return afterForumMutation(run)
}

export function createForumReply(postId, payload) {
  const run = USE_V2
    ? forumV2.createReply(postId, payload)
    : api.post(`/api/forum/posts/${postId}/replies`, payload)
  return afterForumMutation(run, postId)
}

export function deleteForumReply(id, postId) {
  const run = USE_V2 ? forumV2.deleteReply(id) : api.delete(`/api/forum/replies/${id}`)
  return afterForumMutation(run, postId)
}
