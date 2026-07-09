import v2 from '../http'
import api from '@/services/api'

const UPLOAD_TIMEOUT = 7200000
/** 与 Node questionChunkUpload 限制及 PHP-FPM 兼容；直连 Node 时可用 5MB */
export const QUESTION_CHUNK_SIZE = 5 * 1024 * 1024

export function fetchQuestions() {
  return v2.get('/admin/questions')
}

export function fetchQuestion(id) {
  return v2.get(`/admin/questions/${id}`)
}

/** 含分片 uploadId 的保存须直连 Node，与 chunk/complete 共用内存态 */
export function createQuestion(formData, config = {}) {
  return api.post('/api/admin/questions', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export function updateQuestion(id, formData, config = {}) {
  return api.put(`/api/admin/questions/${id}`, formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

/** 与上传相同，走 Laravel v2 删除（含归属校验与文件清理） */
export async function deleteQuestion(id) {
  return v2.delete(`/admin/questions/${id}`)
}

export function initQuestionUpload(payload) {
  return api.post('/api/admin/questions/upload/init', payload)
}

export async function uploadQuestionChunk(formData, config = {}) {
  return api.post('/api/admin/questions/upload/chunk', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export async function completeQuestionUpload(payload) {
  return api.post('/api/admin/questions/upload/complete', payload, { timeout: UPLOAD_TIMEOUT })
}
