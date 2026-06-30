const http = require('http');
const https = require('https');
const { getNodeInternalSecret } = require('./bridge-token');

const LARAVEL_API_BASE = (
  process.env.LARAVEL_API_URL
  || process.env.LARAVEL_INTERNAL_URL
  || 'http://127.0.0.1:8000/api/v2'
).replace(/\/$/, '');

/**
 * 调用 Laravel V2 内部接口（Telegram 删帖等，与前台 API 同源并失效缓存）
 */
function laravelInternalRequest(method, path) {
  const nodeInternalSecret = getNodeInternalSecret();
  if (!nodeInternalSecret) {
    return Promise.resolve({ ok: false, status: 503, error: 'NODE_INTERNAL_SECRET not set' });
  }

  const url = new URL(`${LARAVEL_API_BASE}${path}`);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'X-Internal-Secret': nodeInternalSecret,
          Accept: 'application/json',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let data = null;
          try {
            data = body ? JSON.parse(body) : null;
          } catch {
            data = { raw: body };
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data,
            error: data?.error || null,
          });
        });
      },
    );
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
    req.end();
  });
}

async function laravelDeleteForumPost(postId) {
  return laravelInternalRequest('DELETE', `/internal/forum/posts/${postId}`);
}

async function laravelDeleteForumReply(replyId) {
  return laravelInternalRequest('DELETE', `/internal/forum/replies/${replyId}`);
}

module.exports = {
  laravelDeleteForumPost,
  laravelDeleteForumReply,
};
