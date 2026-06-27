/** 认证 API 中英文提示（读取 Accept-Language） */

const MESSAGES = {
  en: {
    invalid_credentials: 'Invalid username or password',
    username_taken: 'Username already exists',
    email_taken: 'Email already in use',
    unauthorized: 'Unauthorized',
  },
  zh: {
    invalid_credentials: '用户名或密码错误',
    username_taken: '用户名已存在',
    email_taken: '邮箱已被注册',
    unauthorized: '未登录或会话已失效',
  },
};

function localeFromRequest(req) {
  const raw = String(req.headers['accept-language'] || 'en').toLowerCase();
  return raw.startsWith('zh') ? 'zh' : 'en';
}

function authMessage(req, code) {
  const loc = localeFromRequest(req);
  return MESSAGES[loc]?.[code] || MESSAGES.en[code] || code;
}

function sendAuthError(res, req, { code, status = 401, field = 'username' }) {
  const message = authMessage(req, code);
  return res.status(status).json({
    message,
    error_code: code,
    errors: { [field]: [message] },
  });
}

module.exports = {
  authMessage,
  sendAuthError,
};
