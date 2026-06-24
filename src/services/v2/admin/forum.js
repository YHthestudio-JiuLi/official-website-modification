import v2 from '../http'

export function fetchPosts() {
  return v2.get('/admin/posts')
}

export function fetchPost(id) {
  return v2.get(`/admin/posts/${id}`)
}

export function createPost(payload) {
  return v2.post('/admin/posts', payload)
}

export function updatePost(id, payload) {
  return v2.put(`/admin/posts/${id}`, payload)
}

export function pinPost(id) {
  return v2.post(`/admin/posts/${id}/pin`)
}

export function deletePost(id) {
  return v2.delete(`/admin/posts/${id}`)
}

export function fetchReplies(postId) {
  return v2.get(`/admin/posts/${postId}/replies`)
}

export function deleteReply(id) {
  return v2.delete(`/admin/replies/${id}`)
}
