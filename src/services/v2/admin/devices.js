import v2 from '../http'

export function fetchVerificationSettings() {
  return v2.get('/admin/device-verification/settings')
}

export function updateVerificationSettings(payload) {
  return v2.put('/admin/device-verification/settings', payload)
}

export function fetchDevices(params = {}) {
  return v2.get('/admin/devices', { params })
}

export function fetchDevice(id) {
  return v2.get(`/admin/devices/${id}`)
}

export function createDevice(payload) {
  return v2.post('/admin/devices', payload)
}

export function updateDevice(deviceId, payload) {
  return v2.put(`/admin/devices/${encodeURIComponent(deviceId)}`, payload)
}

export function deleteDevice(deviceId) {
  return v2.delete(`/admin/devices/${encodeURIComponent(deviceId)}`)
}

export function resetDeviceCount(deviceId) {
  return v2.post(`/admin/devices/${encodeURIComponent(deviceId)}/reset-count`)
}

export function fetchDeviceLogs(deviceId, params = {}) {
  return v2.get(`/admin/devices/${encodeURIComponent(deviceId)}/logs`, { params })
}
