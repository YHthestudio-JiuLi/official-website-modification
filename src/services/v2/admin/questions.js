import v2 from '../http'
import api from '@/services/api'
import { prepareLegacyNodeUpload } from '@/utils/uploadBridge'

const UPLOAD_TIMEOUT = 7200000
/** 与 Node questionChunkUpload 限制及 PHP-FPM 兼容；直连 Node 时可用 5MB */
export const QUESTION_CHUNK_SIZE = 5 * 1024 * 1024

export function fetchQuestions() {
  return v2.get('/admin/questions')
}

export function fetchQuestion(id) {
  return v2.get(`/admin/questions/${id}`)
}

export function createQuestion(formData, config = {}) {
  return v2.post('/admin/questions', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export function updateQuestion(id, formData, config = {}) {
  return v2.put(`/admin/questions/${id}`, formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export function deleteQuestion(id) {
  return v2.delete(`/admin/questions/${id}`)
}

export function initQuestionUpload(payload) {
  return v2.post('/admin/questions/upload/init', payload)
}

export async function uploadQuestionChunk(formData, config = {}) {
  await prepareLegacyNodeUpload()
  return api.post('/api/admin/questions/upload/chunk', formData, {
    timeout: UPLOAD_TIMEOUT,
    ...config
  })
}

export function completeQuestionUpload(payload) {
  return v2.post('/admin/questions/upload/complete', payload, { timeout: UPLOAD_TIMEOUT })
}
