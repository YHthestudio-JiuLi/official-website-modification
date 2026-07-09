/** 设备验证 RPC/HTTP 错误码（契约源：shared/device_verification_codes.json） */
const manifest = require('../../shared/device_verification_codes.json');

const DEVICE_ERROR_HTTP = Object.fromEntries(
  Object.entries(manifest.errors).map(([code, meta]) => [code, meta.http_status])
);

const DEVICE_ERROR_MESSAGES = Object.fromEntries(
  Object.entries(manifest.errors).map(([code, meta]) => [code, meta.message])
);

const FINGERPRINT_ALGO_VERSION = manifest.fingerprint_algo_version;
const FINGERPRINT_HEX_LENGTH = manifest.fingerprint_hex_length;
const FINGERPRINT_HEX_RE = new RegExp(`^[0-9a-f]{${FINGERPRINT_HEX_LENGTH}}$`);

function mapDeviceVerificationRpcError(error) {
  const code = error && error.code;
  if (!code || !DEVICE_ERROR_HTTP[code]) {
    return null;
  }
  return {
    code,
    status: error.httpStatus || DEVICE_ERROR_HTTP[code],
    message: (error && error.message) || DEVICE_ERROR_MESSAGES[code]
  };
}

module.exports = {
  FINGERPRINT_ALGO_VERSION,
  FINGERPRINT_HEX_LENGTH,
  FINGERPRINT_HEX_RE,
  DEVICE_ERROR_HTTP,
  DEVICE_ERROR_MESSAGES,
  mapDeviceVerificationRpcError
};
