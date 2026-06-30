const { HttpsProxyAgent } = require('hpagent');
const https = require('https');

function createTelegramHttpClient() {
  let agentCache = null;
  const agentCacheMap = new Map(); // 为不同 token 缓存不同的 agent

  function botApiBase(token) {
    // 清理 token 中的隐藏字符和空格
    const cleanToken = String(token)
      .replace(/^\uFEFF/, '')
      .replace(/\uFEFF/g, '')
      .replace(/[\u200B-\u200D\u00AD]/g, '')
      .replace(/\r/g, '')
      .trim();
    // Telegram API token 不需要 URL 编码冒号
    return `https://api.telegram.org/bot${cleanToken}`;
  }

  function getProxy() {
    // 尝试多种代理环境变量
    return process.env.TELEGRAM_PROXY
      || process.env.HTTPS_PROXY
      || process.env.https_proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || '';
  }

  function getAgent() {
    if (!agentCache) {
      const proxy = getProxy();
      if (proxy) {
        try {
          console.log('[Telegram] Using proxy:', proxy);
          agentCache = new HttpsProxyAgent({
            proxy,
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            maxFreeSockets: 10,
            rejectUnauthorized: false,
          });
          console.log('[Telegram] Agent created with rejectUnauthorized=false');
          return agentCache;
        } catch (e) {
          console.error('[Telegram] Proxy setup error:', e.message);
          console.log('[Telegram] Falling back to direct connection');
        }
      }
      agentCache = new https.Agent({
        keepAlive: true,
        rejectUnauthorized: true,
      });
    }
    return agentCache;
  }

  function getAgentForToken(token) {
    // 为不同 token 缓存不同的 agent（如果有代理需求可以扩展）
    if (!agentCacheMap.has(token)) {
      const proxy = getProxy();
      if (proxy) {
        try {
          agentCacheMap.set(token, new HttpsProxyAgent({
            proxy,
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            maxFreeSockets: 10,
            rejectUnauthorized: false,
          }));
        } catch (e) {
          agentCacheMap.set(token, new https.Agent({ keepAlive: true, rejectUnauthorized: true }));
        }
      } else {
        agentCacheMap.set(token, new https.Agent({ keepAlive: true, rejectUnauthorized: true }));
      }
    }
    return agentCacheMap.get(token);
  }

  function getBotToken() {
    const raw = process.env.TELEGRAM_BOT_TOKEN;
    if (!raw) return '';
    return String(raw).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
  }

  function getChatId() {
    const raw = process.env.TELEGRAM_CHAT_ID;
    if (!raw) return '';
    return String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  }

  function telegramRequest(method, payload) {
    return new Promise((resolve) => {
      const token = getBotToken();
      if (!token) { resolve({ ok: false, description: 'no token' }); return; }

      const url = new URL(`${botApiBase(token)}/${method}`);
      const agent = getAgent();

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify(payload)),
        },
        agent,
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, description: 'parse' }); } });
      });

      req.on('error', (e) => {
        console.error('[Telegram] request error:', e.message);
        resolve({ ok: false, description: e.message });
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  function telegramRequestWithToken(token, method, payload) {
    return new Promise((resolve) => {
      if (!token) { resolve({ ok: false, description: 'no token' }); return; }
      const url = new URL(`${botApiBase(token)}/${method}`);
      const agent = getAgentForToken(token);
      const body = JSON.stringify(payload || {});
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        agent,
        timeout: 30000,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, description: 'parse' }); }
        });
      });
      req.on('error', (e) => {
        console.error('[Telegram] request error:', e.message);
        resolve({ ok: false, description: e.message });
      });
      req.write(body);
      req.end();
    });
  }

  return {
    botApiBase,
    getAgentForToken,
    getBotToken,
    getChatId,
    telegramRequest,
    telegramRequestWithToken,
  };
}

module.exports = { createTelegramHttpClient };
