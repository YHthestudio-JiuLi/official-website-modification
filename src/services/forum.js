import * as forumV2 from '@/services/v2/forum'
import api from '@/services/api'
import { useV2Api } from '@/utils/apiPath'
import { cachedRequest, invalidateCache } from '@/utils/getCache'

const USE_V2 = useV2Api()
const FORUM_LIST_TTL = 60_000
const FORUM_DETAIL_TTL = 30_000

export function getForumPosts(config = {}) {
  const key = 'forum:posts'
  if (USE_V2) {
    return cachedRequest(key, FORUM_LIST_TTL, () => forumV2.fetchPosts(config))
  }
  return cachedRequest(key, FORUM_LIST_TTL, () => api.get('/api/forum/posts', config))
}

export function getForumPost(id) {
  const key = `forum:post:${id}`
  if (USE_V2) {
    return cachedRequest(key, FORUM_DETAIL_TTL, () => forumV2.fetchPost(id))
  }
  return cachedRequest(key, FORUM_DETAIL_TTL, () => api.get(`/api/forum/posts/${id}`))
}

export function getForumReplies(postId) {
  const key = `forum:replies:${postId}`
  if (USE_V2) {
    return cachedRequest(key, FORUM_DETAIL_TTL, () => forumV2.fetchReplies(postId))
  }
  return cachedRequest(key, FORUM_DETAIL_TTL, () => api.get(`/api/forum/posts/${postId}/replies`))
}

function clearForumCache(postId) {
  invalidateCache('forum:')
  if (postId) {
    invalidateCache(`forum:post:${postId}`)
    invalidateCache(`forum:replies:${postId}`)
  }
}

export function createForumPost(payload) {
  const run = USE_V2 ? forumV2.createPost(payload) : api.post('/api/forum/posts', payload)
  return run.then((res) => {
    clearForumCache()
    return res
  })
}

export function createForumReply(postId, payload) {
  const run = USE_V2
    ? forumV2.createReply(postId, payload)
    : api.post(`/api/forum/posts/${postId}/replies`, payload)
  return run.then((res) => {
    clearForumCache(postId)
    return res
  })
}

export function deleteForumReply(id) {
  const run = USE_V2 ? forumV2.deleteReply(id) : api.delete(`/api/forum/replies/${id}`)
  return run.then((res) => {
    invalidateCache('forum:')
    return res
  })
}
