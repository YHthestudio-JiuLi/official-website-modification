import v2 from '../http'

export function fetchAgents(params) {
  return v2.get('/admin/agents', { params })
}

/** 可开通代理的已注册用户（尚未成为代理） */
export function fetchEligibleUsers(params) {
  return v2.get('/admin/agents/eligible-users', { params })
}

export function createAgent(payload) {
  return v2.post('/admin/agents', payload)
}

export function updateAgent(id, payload) {
  return v2.put(`/admin/agents/${id}`, payload)
}

export function deleteAgent(id) {
  return v2.delete(`/admin/agents/${id}`)
}
