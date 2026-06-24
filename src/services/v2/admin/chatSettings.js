import v2 from '../http'

export function fetchChatAdmins() {
  return v2.get('/admin/chat-admins')
}

export function updateChatAdmin(id, payload) {
  return v2.put(`/admin/chat-admins/${id}`, payload)
}

export function updateChatbot(id, payload) {
  return v2.put(`/admin/chat-admins/${id}/chatbot`, payload)
}

export function fetchCommunityLinks() {
  return v2.get('/admin/chat/community-links')
}

export function updateCommunityLinks(payload) {
  return v2.put('/admin/chat/community-links', payload)
}
