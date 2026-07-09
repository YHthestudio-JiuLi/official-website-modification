import deviceVerificationManifest from '../../shared/device_verification_codes.json'

export const FINGERPRINT_ALGO_VERSION = String(deviceVerificationManifest.fingerprint_algo_version)
const FINGERPRINT_HEX_LENGTH = Number(deviceVerificationManifest.fingerprint_hex_length)
const FINGERPRINT_HEX_RE = new RegExp(`^[0-9a-f]{${FINGERPRINT_HEX_LENGTH}}$`)

/** 管理端设备 ID：备注标签，非指纹 */
export function normalizeDeviceIdValue(value) {
  const id = String(value || '').trim()
  if (!id || id.length < 2 || id.length > 128) return null
  if (/[\/\\?#&\x00-\x1F]/.test(id)) return null
  return id
}

/** 设备指纹：与服务端 shared manifest 一致的 hex 长度校验 */
export function normalizeFingerprintValue(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (!FINGERPRINT_HEX_RE.test(raw)) return null
  return raw
}

export function formatFingerprint(value) {
  const normalized = normalizeFingerprintValue(value)
  if (!normalized) return '-'
  if (normalized.length <= 16) return normalized
  return `${normalized.slice(0, 8)}…${normalized.slice(-8)}`
}
