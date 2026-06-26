import i18n from '@/i18n'

/** 后端 error_code → i18n 键 */
const ERROR_CODE_KEYS = {
  invalid_credentials: 'auth.errorCodes.invalidCredentials',
  account_suspended: 'auth.errorCodes.accountSuspended',
  no_admin_access: 'auth.errorCodes.noAdminAccess',
  username_taken: 'auth.errorCodes.usernameTaken',
  email_taken: 'auth.errorCodes.emailTaken',
  password_min: 'auth.errorCodes.passwordMin',
  username_required: 'auth.errorCodes.usernameRequired',
  email_required: 'auth.errorCodes.emailRequired',
  email_invalid: 'auth.errorCodes.emailInvalid',
  password_required: 'auth.errorCodes.passwordRequired',
  admin_ip_denied: 'auth.errorCodes.adminIpDenied',
  unauthorized: 'auth.errorCodes.unauthorized',
  validation_failed: 'auth.errorCodes.validationFailed',
}

/** 兼容旧版纯文本响应 */
const LEGACY_MESSAGE_CODES = {
  'invalid credentials': 'invalid_credentials',
  'invalid username or password': 'invalid_credentials',
  'username already exists': 'username_taken',
  'email already in use': 'email_taken',
  'account suspended': 'account_suspended',
  'no admin access': 'no_admin_access',
  '用户名或密码错误': 'invalid_credentials',
  '用户名已存在': 'username_taken',
  '邮箱已被注册': 'email_taken',
  '账号已被停用': 'account_suspended',
}

function normalizeMessage(value) {
  return String(value || '').trim().toLowerCase()
}

function codeFromLegacyText(text) {
  if (!text) return null
  return LEGACY_MESSAGE_CODES[normalizeMessage(text)] || null
}

function translateCode(code) {
  if (!code) return null
  const { t, te } = i18n.global
  const key = ERROR_CODE_KEYS[code]
  if (key && te(key)) return t(key)
  return null
}

function firstFieldError(errors) {
  if (!errors || typeof errors !== 'object') return null
  for (const field of ['username', 'email', 'password']) {
    const row = errors[field]
    if (Array.isArray(row) && row[0]) return row[0]
  }
  const firstKey = Object.keys(errors)[0]
  const row = firstKey ? errors[firstKey] : null
  return Array.isArray(row) ? row[0] : null
}

/**
 * 将登录/注册接口错误解析为当前界面语言的提示
 * @param {unknown} err axios 错误
 * @param {{ context?: 'login'|'register'|'admin' }} [options]
 */
export function resolveAuthError(err, options = {}) {
  const context = options.context || 'login'
  const { t } = i18n.global
  const status = err?.response?.status
  const data = err?.response?.data || {}

  if (status === 429) {
    return context === 'admin'
      ? t('admin.login.tooManyRequests')
      : t('auth.login.error.tooManyRequests')
  }
  if (status >= 500) {
    return context === 'admin'
      ? t('admin.login.serverUnavailable')
      : t('auth.login.error.serverUnavailable')
  }

  const code = data.error_code || codeFromLegacyText(data.message) || codeFromLegacyText(data.error)
  const fromCode = translateCode(code)
  if (fromCode) return fromCode

  const fieldError = firstFieldError(data.errors)
  const fromField = translateCode(codeFromLegacyText(fieldError))
  if (fromField) return fromField
  if (fieldError) return fieldError

  if (data.message) return data.message
  if (data.error) return data.error

  if (context === 'register') {
    return t('auth.register.error.validationFailed')
  }
  if (context === 'admin') {
    return t('admin.login.error')
  }
  return t('auth.login.error.invalidCredentials')
}

/** 供 axios 拦截器附带当前语言 */
export function currentAcceptLanguage() {
  const lang = i18n.global.locale.value
  return lang === 'zh' ? 'zh-CN,zh;q=0.9' : 'en-US,en;q=0.9'
}
