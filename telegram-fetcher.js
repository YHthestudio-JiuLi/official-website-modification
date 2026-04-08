/**
 * Telegram Message Fetcher
 * Fetch messages from Telegram API based on session ID
 * Note: Telegram Bot API does not support getChatHistory
 * We use getUpdates to get recent messages (limited to ~24h)
 */

const https = require('https');
const { dbOperations } = require('./database');
const { resolveTelegramForAdmin } = require('./telegram');

function botApiBase(token) {
  const cleanToken = String(token)
    .replace(/^\uFEFF/, '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D\u00AD]/g, '')
    .replace(/\r/g, '')
    .trim();
  return `https://api.telegram.org/bot${cleanToken}`;
}

let agentCache = null;
function getAgent() {
  if (!agentCache) {
    const proxy = process.env.TELEGRAM_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || '';
    if (proxy) {
      try {
        const { HttpsProxyAgent } = require('hpagent');
        agentCache = new HttpsProxyAgent({
          proxy,
          keepAlive: true,
          rejectUnauthorized: false,
        });
        return agentCache;
      } catch (e) {
        console.error('[Telegram Fetcher] Proxy setup error:', e.message);
      }
    }
    agentCache = new https.Agent({ keepAlive: true });
  }
  return agentCache;
}

function telegramRequest(token, method, payload = {}) {
  return new Promise((resolve) => {
    const url = new URL(`${botApiBase(token)}/${method}`);
    const agent = getAgent();
    
    const payloadStr = JSON.stringify(payload);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
      },
      agent: agent,
      timeout: 30000,
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, description: 'parse_error' });
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('[Telegram Fetcher] request error:', e.message);
      resolve({ ok: false, description: e.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, description: 'timeout' });
    });
    
    req.write(payloadStr);
    req.end();
  });
}

async function getSessionTelegramInfo(sessionId) {
  const session = await dbOperations.chatSessions.findById(sessionId);
  if (!session) return null;
  
  const admin = await dbOperations.chatAdmins.findById(session.admin_id);
  if (!admin) return null;
  
  const { token, chatId } = resolveTelegramForAdmin(admin);
  
  if (!token || !chatId) return null;
  
  return { token, chatId, admin, session };
}

async function fetchMessagesFromTelegram(sessionId, limit = 100) {
  const tgInfo = await getSessionTelegramInfo(sessionId);
  if (!tgInfo) {
    return { messages: [], fromTelegram: false };
  }
  
  const { token, chatId, session } = tgInfo;
  
  // Get updates from Telegram (limited to ~24h)
  const result = await telegramRequest(token, 'getUpdates', {
    offset: 0,
    limit: Math.min(limit, 100),
    timeout: 0,
  });
  
  if (!result.ok) {
    console.error('[Telegram Fetcher] getUpdates failed:', result.description);
    return { messages: [], fromTelegram: false };
  }
  
  const messages = [];
  const updates = result.result || [];
  
  // Get all tg_links for this session to match messages
  const links = await dbOperations.chatTgLinks.findBySession(sessionId);
  const linkMap = new Map();
  if (links) {
    for (const link of (Array.isArray(links) ? links : [links])) {
      linkMap.set(String(link.tg_message_id), link);
    }
  }
  
  for (const update of updates) {
    if (!update.message || !update.message.text) continue;
    const msg = update.message;
    const msgChatId = String(msg.chat?.id || '');
    
    // Only include messages from the configured chat
    if (msgChatId !== String(chatId)) continue;
    
    const isFromBot = msg.from && msg.from.is_bot;
    const replyTo = msg.reply_to_message?.message_id;
    
    // Check if this message is linked to our session
    const isLinkedToSession = linkMap.has(String(msg.message_id)) || 
                               (replyTo && linkMap.has(String(replyTo)));
    
    // If it's a reply to a linked message, include it
    if (isLinkedToSession || isFromBot) {
      messages.push({
        id: msg.message_id,
        session_id: sessionId,
        sender: isFromBot ? 'admin' : 'user',
        body: msg.text,
        created_at: new Date(msg.date * 1000).toISOString(),
        fromTelegram: true,
      });
    }
  }
  
  // Sort by date
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  return { messages, fromTelegram: true };
}

module.exports = {
  fetchMessagesFromTelegram,
  getSessionTelegramInfo,
  telegramRequest,
};
