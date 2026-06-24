import v2 from './http'

export function fetchPosts(config = {}) {
  return v2.get('/forum/posts', config)
}

export function fetchPost(id) {
  return v2.get(`/forum/posts/${id}`)
}

export function fetchReplies(postId) {
  return v2.get(`/forum/posts/${postId}/replies`)
}

export function createPost(payload) {
  return v2.post('/forum/posts', payload)
}

export function createReply(postId, payload) {
  return v2.post(`/forum/posts/${postId}/replies`, payload)
}

export function deleteReply(id) {
  return v2.delete(`/forum/replies/${id}`)
}
