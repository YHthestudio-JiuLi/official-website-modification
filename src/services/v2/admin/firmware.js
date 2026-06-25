import v2 from '../http'
import api from '@/services/api'

const UPLOAD_TIMEOUT = 7200000
export const FIRMWARE_CHUNK_SIZE = 5 * 1024 * 1024

export function fetchFirmwares() {
  return v2.get('/admin/device-firmwares')
}

export function fetchLocalFirmwareFiles() {
  return v2.get('/admin/device-firmwares/local-files')
}

export function registerLocalFirmware(payload) {
  return v2.post('/admin/device-firmwares/register-local', payload)
}

export function setDefaultFirmware(id) {
  return v2.put(`/admin/device-firmwares/${id}/default`)
}

export function updateFirmwareRemark(id, payload) {
  return v2.put(`/admin/device-firmwares/${id}/remark`, payload)
}

/** 直连 Node 删除（含 uploads 清理），避免 PHP 无权限删 root 所属文件 */
export async function deleteFirmware(id) {
  return api.delete(`/api/admin/device-firmwares/${id}`)
}

export function initFirmwareUpload(payload) {
  return api.post('/api/admin/device-firmwares/upload/init', payload)
}

export async function uploadFirmwareChunk(formData, config = {}) {
  return api.post('/api/admin/device-firmwares/upload/chunk', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export async function completeFirmwareUpload(payload) {
  return api.post('/api/admin/device-firmwares/upload/complete', payload, { timeout: UPLOAD_TIMEOUT })
}

export function uploadFirmwareLegacy(formData, config = {}) {
  return v2.post('/admin/device-firmwares/upload', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}
