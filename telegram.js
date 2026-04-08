/**
 * Telegram Bot Integration with HTTP proxy
 */

const { HttpsProxyAgent } = require('hpagent');
const https = require('https');
const crypto = require('crypto');
const { dbOperations } = require('./database');

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
  return process.env.TELEGRAM_PROXY || 
         process.env.HTTPS_PROXY || 
         process.env.https_proxy || 
         process.env.HTTP_PROXY || 
         process.env.http_proxy || 
         '';
}

let agentCache = null;
const agentCacheMap = new Map(); // 为不同 token 缓存不同的 agent

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
      rejectUnauthorized: true
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

function cleanTelegramToken(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^\uFEFF/, '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D\u00AD]/g, '')
    .replace(/\r/g, '')
    .trim();
}

function cleanTelegramChatId(raw) {
  if (!raw) return '';
  return String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
}

/**
 * 按客服账号解析 Telegram 凭据：数据库优先，售前(sales)额外支持 TELEGRAM_SALES_* 环境变量回退
 */
function resolveTelegramForAdmin(admin) {
  if (!admin) {
    return { token: getBotToken(), chatId: getChatId() };
  }
  const uname = String(admin.username || '').toLowerCase();
  let token = cleanTelegramToken(admin.telegram_token);
  let chatId = cleanTelegramChatId(admin.telegram_chat_id);
  if (uname === 'sales') {
    token = token || cleanTelegramToken(process.env.TELEGRAM_SALES_BOT_TOKEN) || getBotToken();
    chatId = chatId || cleanTelegramChatId(process.env.TELEGRAM_SALES_CHAT_ID) || getChatId();
  } else {
    token = token || getBotToken();
    chatId = chatId || getChatId();
  }
  return { token, chatId };
}

function canSendTelegramForAdmin(admin) {
  const { token, chatId } = resolveTelegramForAdmin(admin);
  return !!(token && chatId);
}

const logged = new Set();
function logOnce(key, msg) {
  if (logged.has(key)) return;
  logged.add(key);
  console.warn('[Telegram]', msg);
}

function truncate(s, max) {
  const t = String(s);
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
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
      agent: agent,
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

function formatMsg(session, row) {
  console.log('[Telegram] formatMsg called with row:', row ? { id: row.id, body: row.body ? row.body.substring(0, 30) + '...' : 'NULL/EMPTY', type: typeof row } : 'NULL');
  const nick = String(session.nickname).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sid = String(session.id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const serviceType = String(session.service_type || 'support');
  const serviceLabel = serviceType === 'sales' ? '售前咨询' : '官方客服';
  const bodyStr = String(row.body || '');
  console.log('[Telegram] formatMsg bodyStr:', bodyStr ? bodyStr.substring(0, 50) + '...' : 'EMPTY STRING');
  const body = truncate(bodyStr, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const result = `👤 <b>${nick}</b>\n🆔 <code>${sid}</code>\n📮 <b>消息来源：</b>${serviceLabel}\n\n${body}\n\n<i>↩ Reply to answer.</i>`;
  console.log('[Telegram] formatMsg result:', result.substring(0, 80) + '...');
  return result;
}

function formatMsgPlain(session, row) {
  return `访客：${session.nickname}\n会话：${session.id}\n\n${truncate(row.body, 3500)}\n\n↩ 请回复此消息。`;
}

async function notifyUserMessage(session, messageRow, admin) {
  console.log('[Telegram] notifyUserMessage called');
  console.log('[Telegram] messageRow:', messageRow ? { id: messageRow.id, body: messageRow.body ? messageRow.body.substring(0, 50) + '...' : 'EMPTY' } : 'NULL');
  console.log('[Telegram] session:', session ? { id: session.id, nickname: session.nickname } : 'NULL');
  
  const resolved = resolveTelegramForAdmin(admin);
  const chatId = resolved.chatId;
  const token = resolved.token;
  if (!chatId) { logOnce('no-chat', 'TELEGRAM_CHAT_ID is empty'); return; }
  if (!token) { logOnce('no-token', 'TELEGRAM_BOT_TOKEN is empty'); return; }

  console.log('[Telegram] Sending user message to chatId:', chatId);
  
  if (!messageRow || !messageRow.body || String(messageRow.body).trim() === '') {
    console.error('[Telegram] EMPTY BODY - not sending');
    return;
  }

  const agent = getAgent();
  const url = new URL(`${botApiBase(token)}/sendMessage`);
  
  const payload = {
    chat_id: String(chatId),
    text: formatMsg(session, messageRow),
    parse_mode: 'HTML',
  };
  
  const payloadStr = JSON.stringify(payload);
  console.log('[Telegram] Payload text length:', payload.text.length);
  
  const req = https.request({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('[Telegram] API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
        if (parsed.ok && parsed.result && parsed.result.message_id != null) {
          dbOperations.chatTgLinks.create(parsed.result.chat.id, parsed.result.message_id, session.id, messageRow.id).catch(() => {});
        }
      } catch (e) {
        console.error('[Telegram] Parse response error:', e.message);
      }
    });
  });
  req.on('error', (e) => {
    console.error('[Telegram] Request error:', e.message);
  });
  req.write(payloadStr);
  req.end();
}

async function notifyAdminReply(session, messageRow, admin) {
  const resolved = resolveTelegramForAdmin(admin);
  const chatId = resolved.chatId;
  const token = resolved.token;
  if (!chatId) { logOnce('no-chat', 'TELEGRAM_CHAT_ID is empty'); return; }
  if (!token) { logOnce('no-token', 'TELEGRAM_BOT_TOKEN is empty'); return; }

  console.log('[Telegram] Sending admin reply to chatId:', chatId);

  const latestUserTgMsg = await dbOperations.chatTgLinks.findLatestUserTgMessage(session.id);
  let replyToMessageId = null;
  if (latestUserTgMsg && latestUserTgMsg.tg_message_id) {
    replyToMessageId = latestUserTgMsg.tg_message_id;
  }

  const text = `💬 客服回复\n👤 ${session.nickname}\n🆔 ${session.id}\n\n${truncate(messageRow.body, 3500)}`;
  
  const agent = getAgentForToken(token);
  const url = new URL(`${botApiBase(token)}/sendMessage`);
  
  const payload = {
    chat_id: String(chatId),
    text,
    reply_to_message_id: replyToMessageId || undefined,
  };
  
  console.log('[Telegram] Admin reply payload:', { chat_id: chatId, text: text.substring(0, 50) + '...', reply_to_message_id: replyToMessageId });
  
  const req = https.request({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('[Telegram] Admin reply API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
        if (parsed.ok && parsed.result && parsed.result.message_id != null) {
          dbOperations.chatTgLinks.create(parsed.result.chat.id, parsed.result.message_id, session.id, messageRow.id).catch(() => {});
        }
      } catch (e) {
        console.error('[Telegram] Parse response error:', e.message);
      }
    });
  });
  req.on('error', (e) => {
    console.error('[Telegram] Request error:', e.message);
  });
  req.write(JSON.stringify(payload));
  req.end();
}

function createTelegramIntegration({ broadcastToChat }) {
  async function handleUpdate(update) {
    if (!update || !update.message) return;
    const msg = update.message;
    if (msg.from && msg.from.is_bot) return; // 忽略机器人自己的消息
    const text = msg.text != null ? String(msg.text) : '';
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return;

    console.log('[Telegram Long Poll] Received message from chatId:', chatId, 'text:', text.substring(0, 50) + '...');

    // 检查是否是回复消息
    const reply = msg.reply_to_message;
    if (reply && reply.message_id != null) {
      console.log('[Telegram] This is a reply to message_id:', reply.message_id);
      // 查找对应的 session
      const link = await dbOperations.chatTgLinks.findByTgMessage(String(chatId), reply.message_id);
      if (link && link.session_id) {
        console.log('[Telegram] Found session:', link.session_id);
        const body = text.trim();
        if (!body) return;
        // 创建管理员回复消息
        const row = {
          id: Date.now(),
          session_id: link.session_id,
          sender: 'admin',
          body: body,
          created_at: new Date().toISOString(),
          fromTelegram: true,
        };
        broadcastToChat(link.session_id, { type: 'message', message: row });
        console.log('[Telegram] Broadcasted admin reply to session:', link.session_id);
      } else {
        console.log('[Telegram] No session link found for this reply');
      }
    }
  }

  let timer = null, offset = 0;

  function startPollingIfEnabled() {
    if (process.env.TELEGRAM_USE_POLLING !== 'true') return;
    const token = getBotToken();
    if (!token) { console.error('[Telegram] TOKEN empty'); return; }

    async function poll() {
      let ms = 400;
      try {
        const data = await telegramRequest('getUpdates', { offset, timeout: 45 });
        if (!data.ok) { ms = 8000; console.error('[Telegram] getUpdates:', data.error_code, data.description); return; }
        for (const u of (data.result || [])) { offset = u.update_id + 1; await handleUpdate(u); }
      } catch (e) { ms = 5000; console.error('[Telegram] poll:', e.message); }
      timer = setTimeout(poll, ms);
    }

    console.log('[Telegram] Long polling enabled');
    (async () => {
      const me = await telegramRequest('getMe', {});
      if (!me.ok) { console.error('[Telegram] getMe:', me.description); return; }
      console.log('[Telegram] Bot:', me.result.username);
      await telegramRequest('deleteWebhook', {});
      poll();
    })();
  }

  return { notifyUserMessage, notifyAdminReply, handleUpdate, startPollingIfEnabled, setupMultiBotPolling };
}

// 为多个客服 Bot 启动长轮询（从数据库读取配置）
// 跟踪已经开始 polling 的 bot，防止重复启动
const activePollingBots = new Set();

async function setupMultiBotPolling({ broadcastToChat }) {
  if (process.env.TELEGRAM_USE_POLLING !== 'true') return;
  
  if (setupMultiBotPolling._started) {
    console.log('[Telegram Multi-Bot] Already started, skipping');
    return;
  }
  setupMultiBotPolling._started = true;
  
  try {
    const admins = await dbOperations.chatAdmins.findAll();
    console.log('[Telegram Multi-Bot] Found', admins.length, 'admins');
    
    // 按 Bot Token 分组：同一 token 只建一条 getUpdates 长轮询，避免多客服共用一机时互相抢 offset
    const byToken = new Map();
    for (const admin of admins) {
      if (!admin.chatbot_enabled) {
        console.log('[Telegram Multi-Bot] Skipping admin', admin.username, '- chatbot disabled');
        continue;
      }
      const { token, chatId } = resolveTelegramForAdmin(admin);
      console.log('[Telegram Multi-Bot] Admin', admin.username, 'resolved token:', token ? token.substring(0, 20) + '...' : 'NULL', 'chatId:', chatId || 'NULL');
      if (!token || !chatId) {
        console.log('[Telegram Multi-Bot] Skipping admin', admin.username, '- 无 token/chatId（请在后台填写或配置 .env TELEGRAM_* / TELEGRAM_SALES_*）');
        continue;
      }
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push({ admin, chatId: String(chatId) });
    }
    
    const forumToken = getForumBotToken();
    const forumChatId = getForumChatId();
    if (forumToken && forumChatId) {
      if (!byToken.has(forumToken)) byToken.set(forumToken, []);
      const exists = byToken.get(forumToken).some((e) => String(e.chatId) === String(forumChatId));
      if (!exists) {
        byToken.get(forumToken).push({
          admin: { username: 'forum', chatbot_enabled: true },
          chatId: String(forumChatId),
        });
      }
    }

    const orderToken = getOrderBotToken();
    const orderChatId = getOrderChatId();
    if (orderToken && orderChatId) {
      if (!byToken.has(orderToken)) byToken.set(orderToken, []);
      const exists = byToken.get(orderToken).some((e) => String(e.chatId) === String(orderChatId));
      if (!exists) {
        byToken.get(orderToken).push({
          admin: { username: 'order', chatbot_enabled: true },
          chatId: String(orderChatId),
        });
      }
    }

    for (const [token, entries] of byToken) {
      if (activePollingBots.has(token)) continue;
      activePollingBots.add(token);
      const labels = entries.map((e) => e.admin.username).join(', ');
      console.log('[Telegram Multi-Bot] Starting polling for token (listeners:', labels, ')');
      startPollingForTokenGroup(token, entries, broadcastToChat);
    }
  } catch (e) {
    console.error('[Telegram Multi-Bot] Setup error:', e.message);
  }
}

// 同一 Bot Token 对应多个 chat（官方客服群 + 售前群等）时，单连接分发
function startPollingForTokenGroup(token, entries, broadcastToChat) {
  const chatIdToAdmin = new Map();
  for (const { admin, chatId } of entries) {
    chatIdToAdmin.set(String(chatId), admin);
  }
  const labelAdmin = entries[0].admin;

  let offset = 0;
  let stopped = false;
  
  async function poll() {
    if (stopped) return;
    
    let ms = 400;
    try {
      const agent = getAgentForToken(token);
      
      const payload = JSON.stringify({ offset, timeout: 45, allowed_updates: ['message', 'callback_query'] });
      
      const data = await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${token}/getUpdates`,
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          agent,
          timeout: 60000,
        }, (res) => {
          let d = '';
          res.on('data', (chunk) => { d += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(d)); } catch { resolve({ ok: false, description: 'parse error' }); }
          });
        });
        req.on('error', (e) => {
          console.error('[Telegram Multi-Bot]', labelAdmin.username, 'request error:', e.message);
          resolve({ ok: false, description: e.message });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, description: 'timeout' });
        });
        req.write(payload);
        req.end();
      });
      
      if (!data.ok) {
        ms = 8000;
        console.error('[Telegram Multi-Bot]', labelAdmin.username, 'getUpdates failed:', JSON.stringify(data));
      } else {
        for (const u of (data.result || [])) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (u.callback_query) {
            const q = u.callback_query;
            const cid = String(q.message?.chat?.id || '');
            const admin = chatIdToAdmin.get(cid);
            if (!admin) continue;
            await handleUpdateForBot(u, cid, admin, broadcastToChat, token);
            continue;
          }
          if (!msg || !msg.chat) continue;
          const cid = String(msg.chat.id);
          const admin = chatIdToAdmin.get(cid);
          if (!admin) continue;
          await handleUpdateForBot(u, cid, admin, broadcastToChat, token);
        }
      }
    } catch (e) {
      ms = 5000;
      console.error('[Telegram Multi-Bot]', labelAdmin.username, 'poll:', e.message);
    }
    
    if (!stopped) {
      setTimeout(poll, ms);
    }
  }
  
  startPollingForTokenGroup.stopFunctions = startPollingForTokenGroup.stopFunctions || {};
  startPollingForTokenGroup.stopFunctions[token] = () => {
    stopped = true;
    activePollingBots.delete(token);
    console.log('[Telegram Multi-Bot] Stopped polling for token group');
  };
  
  (async () => {
    const agent = getAgentForToken(token);
    const baseUrl = botApiBase(token);
    console.log('[Telegram Multi-Bot]', labelAdmin.username, 'API base URL:', baseUrl.substring(0, 50) + '...');
    
    const getMe = await new Promise((resolve) => {
      const url = new URL(`${baseUrl}/getMe`);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        agent,
      }, (res) => {
        let d = '';
        res.on('data', (chunk) => { d += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); }
        });
      });
      req.on('error', () => resolve({ ok: false }));
      req.end();
    });
    
    if (!getMe.ok) {
      console.error('[Telegram Multi-Bot]', labelAdmin.username, 'getMe failed:', JSON.stringify(getMe));
      console.error('[Telegram Multi-Bot]', labelAdmin.username, 'Token format check - length:', token.length, 'contains colon:', token.includes(':'));
      activePollingBots.delete(token);
      return;
    }
    
    console.log('[Telegram Multi-Bot] Bot:', getMe.result.username, 'chats:', [...chatIdToAdmin.keys()].join(', '));
    
    await new Promise((resolve) => {
      const url = new URL(`${baseUrl}/deleteWebhook`);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        agent,
      }, resolve);
      req.on('error', resolve);
      req.end();
    });
    
    console.log('[Telegram Multi-Bot] Starting polling...');
    poll();
  })();
}

// 停止指定 bot 的轮询
function stopBotPolling(token, chatId) {
  void chatId;
  if (startPollingForTokenGroup.stopFunctions && startPollingForTokenGroup.stopFunctions[token]) {
    startPollingForTokenGroup.stopFunctions[token]();
    delete startPollingForTokenGroup.stopFunctions[token];
  }
}

// 处理单个 Bot 的更新
async function handleUpdateForBot(update, expectedChatId, admin, broadcastToChat, token) {
  if (!update) return;
  if (update.callback_query) {
    await handleTelegramCallbackQuery(update.callback_query, expectedChatId, token);
    return;
  }
  if (!update.message) return;
  const msg = update.message;
  if (msg.from && msg.from.is_bot) return;
  
  const text = msg.text != null ? String(msg.text) : '';
  const chatId = msg.chat && msg.chat.id;
  
  console.log('[Telegram Multi-Bot]', admin.username, 'received from chatId:', chatId, 'text:', text.substring(0, 50) + '...');
  
  if (String(chatId) !== String(expectedChatId)) {
    console.log('[Telegram Multi-Bot]', admin.username, 'ignoring message from wrong chatId:', chatId);
    return;
  }
  
  const reply = msg.reply_to_message;
  if (reply && reply.message_id != null) {
    console.log('[Telegram Multi-Bot]', admin.username, 'is reply to:', reply.message_id);
    const link = await dbOperations.chatTgLinks.findByTgMessage(String(chatId), reply.message_id);
    if (link && link.session_id) {
      console.log('[Telegram Multi-Bot]', admin.username, 'found session:', link.session_id);
      const body = text.trim();
      if (!body) return;
      
      // Save to database for history
      try {
        const savedMsg = await dbOperations.chatMessages.create(link.session_id, 'admin', body);
        const row = savedMsg || {
          id: Date.now(),
          session_id: link.session_id,
          sender: 'admin',
          body: body,
          created_at: new Date().toISOString(),
          fromTelegram: true,
        };
        
        // Save tg link
        if (savedMsg && savedMsg.id) {
          await dbOperations.chatTgLinks.create(String(chatId), msg.message_id, link.session_id, savedMsg.id);
        }
        
        broadcastToChat(link.session_id, { type: 'message', message: row });
        console.log('[Telegram Multi-Bot]', admin.username, 'broadcasted to session:', link.session_id);
      } catch (e) {
        console.error('[Telegram Multi-Bot] save error:', e.message);
      }
    }
  }
}

async function handleTelegramCallbackQuery(query, expectedChatId, token) {
  const callbackId = query?.id;
  const data = String(query?.data || '');
  const message = query?.message;
  const chatId = String(message?.chat?.id || '');
  const messageId = message?.message_id;
  if (!callbackId || !data || !messageId) return;
  if (chatId !== String(expectedChatId)) return;
  if (data.startsWith('forum_del_reply:')) {
    const parts = data.split(':');
    const replyId = parseInt(parts[1], 10);
    const postId = parseInt(parts[2], 10);
    if (Number.isNaN(replyId) || Number.isNaN(postId)) {
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '参数错误',
        show_alert: false,
      });
      return;
    }

    try {
      const reply = await dbOperations.forumReplies.findById(replyId);
      if (!reply) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '回复不存在或已删除',
          show_alert: false,
        });
        await telegramRequestWithToken(token, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
        return;
      }
      if (Number(reply.postId) !== postId) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '回复与帖子不匹配',
          show_alert: false,
        });
        return;
      }
      const ok = await dbOperations.forumReplies.delete(replyId);
      if (!ok) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '删除失败',
          show_alert: false,
        });
        return;
      }
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: `已删除回复 #${replyId}`,
        show_alert: false,
      });
      await telegramRequestWithToken(token, 'deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (e) {
      console.error('[Forum Telegram] callback delete error:', e.message);
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '删除异常，请稍后重试',
        show_alert: false,
      });
    }
    return;
  }

  if (!data.startsWith('order_del:')) return;
  const orderId = parseInt(data.split(':')[1], 10);
  if (Number.isNaN(orderId)) {
    await telegramRequestWithToken(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: '订单参数错误',
      show_alert: false,
    });
    return;
  }
  try {
    const order = await dbOperations.orders.findById(orderId);
    if (!order) {
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '订单不存在或已删除',
        show_alert: false,
      });
      await telegramRequestWithToken(token, 'deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }
    await dbOperations.orders.delete(orderId);
    await telegramRequestWithToken(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: `已删除订单 #${orderId}`,
      show_alert: false,
    });
    await telegramRequestWithToken(token, 'deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (e) {
    console.error('[Order Telegram] callback delete error:', e.message);
    await telegramRequestWithToken(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: '删除订单失败',
      show_alert: false,
    });
  }
}

module.exports = { 
  createTelegramIntegration, 
  getBotToken, 
  getChatId,
  resolveTelegramForAdmin,
  canSendTelegramForAdmin,
  notifyForumNewPost,
  notifyForumNewReply,
  notifyOrderPaid
};

// ==================== 论坛 Telegram 通知功能 ====================

function getForumBotToken() {
  const raw = process.env.FORUM_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!raw) return '';
  return String(raw).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
}

function getForumChatId() {
  const raw = process.env.FORUM_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!raw) return '';
  return String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
}

function isForumTelegramEnabled() {
  const enabled = process.env.FORUM_TELEGRAM_ENABLED;
  return enabled === 'true' || enabled === undefined || enabled === '';
}

// 格式化新帖子通知消息
function formatForumPostMessage(post) {
  const title = truncate(String(post.title || ''), 500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const author = truncate(String(post.author || ''), 100).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = truncate(String(post.content || ''), 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const postId = String(post.id || '');
  const date = String(post.date || new Date().toISOString().split('T')[0]);
  
  return `📢 <b>新论坛帖子</b>

📝 <b>主题：</b>${title}
👤 <b>作者：</b>${author}
📅 <b>日期：</b>${date}
🆔 <b>帖子ID：</b><code>${postId}</code>

💬 <b>内容：</b>
${content}

<i>请去官网查看详细内容</i>`;
}

// 格式化回复通知消息
function formatForumReplyMessage(reply, post, parentReply) {
  const postId = String(post.id || '');
  const postTitle = truncate(String(post.title || ''), 200).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replyAuthor = truncate(String(reply.author || ''), 100).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replyContent = truncate(String(reply.content || ''), 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replyId = String(reply.id || '');
  
  let message = `💬 <b>论坛新回复</b>

📝 <b>帖子：</b>${postTitle} (ID: <code>${postId}</code>)
`;
  
  if (parentReply) {
    const parentAuthor = truncate(String(parentReply.author || ''), 100).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    message += `👤 <b>回复者：</b>${replyAuthor}
🎯 <b>回复给：</b>${parentAuthor}
🆔 <b>回复ID：</b><code>${replyId}</code>

💬 <b>回复内容：</b>
${replyContent}
`;
  } else {
    message += `👤 <b>回复者：</b>${replyAuthor}
🆔 <b>回复ID：</b><code>${replyId}</code>

💬 <b>回复内容：</b>
${replyContent}
`;
  }
  
  message += `\n<i>请去官网查看详细内容</i>`;
  return message;
}

// 通知新帖子
async function notifyForumNewPost(post) {
  if (!isForumTelegramEnabled()) {
    console.log('[Forum Telegram] Forum notifications disabled');
    return;
  }
  
  const chatId = getForumChatId();
  if (!chatId) {
    logOnce('forum-no-chat', 'FORUM_TELEGRAM_CHAT_ID is empty');
    return;
  }
  
  const token = getForumBotToken();
  if (!token) {
    logOnce('forum-no-token', 'FORUM_TELEGRAM_BOT_TOKEN is empty');
    return;
  }
  
  console.log('[Forum Telegram] Sending new post notification to chatId:', chatId);
  console.log('[Forum Telegram] Post:', { id: post.id, title: post.title, author: post.author });
  
  const agent = getAgentForToken(token);
  const url = new URL(`${botApiBase(token)}/sendMessage`);
  
  const payload = {
    chat_id: String(chatId),
    text: formatForumPostMessage(post),
    parse_mode: 'HTML',
  };
  
  const payloadStr = JSON.stringify(payload);
  console.log('[Forum Telegram] Payload length:', payload.text.length);
  
  const req = https.request({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('[Forum Telegram] API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
      } catch (e) {
        console.error('[Forum Telegram] Parse response error:', e.message);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error('[Forum Telegram] Request error:', e.message);
  });
  
  req.write(payloadStr);
  req.end();
}

// 通知新回复
async function notifyForumNewReply(reply, post, parentReply) {
  if (!isForumTelegramEnabled()) {
    console.log('[Forum Telegram] Forum notifications disabled');
    return;
  }
  
  const chatId = getForumChatId();
  if (!chatId) {
    logOnce('forum-no-chat', 'FORUM_TELEGRAM_CHAT_ID is empty');
    return;
  }
  
  const token = getForumBotToken();
  if (!token) {
    logOnce('forum-no-token', 'FORUM_TELEGRAM_BOT_TOKEN is empty');
    return;
  }
  
  console.log('[Forum Telegram] Sending new reply notification to chatId:', chatId);
  console.log('[Forum Telegram] Reply:', { id: reply.id, author: reply.author, postId: post.id });
  if (parentReply) {
    console.log('[Forum Telegram] Parent reply:', { id: parentReply.id, author: parentReply.author });
  }
  
  const agent = getAgentForToken(token);
  const url = new URL(`${botApiBase(token)}/sendMessage`);
  
  const payload = {
    chat_id: String(chatId),
    text: formatForumReplyMessage(reply, post, parentReply),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🗑 删除此回复',
          callback_data: `forum_del_reply:${String(reply.id || '')}:${String(post.id || '')}`
        }
      ]]
    }
  };
  
  const payloadStr = JSON.stringify(payload);
  console.log('[Forum Telegram] Payload length:', payload.text.length);
  
  const req = https.request({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('[Forum Telegram] API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
      } catch (e) {
        console.error('[Forum Telegram] Parse response error:', e.message);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error('[Forum Telegram] Request error:', e.message);
  });
  
  req.write(payloadStr);
  req.end();
}

function getOrderBotToken() {
  const raw = process.env.ORDER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!raw) return '';
  return String(raw).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
}

function getOrderChatId() {
  const raw = process.env.ORDER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!raw) return '';
  return String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
}

function parseRecipientInfo(shippingAddress) {
  const raw = String(shippingAddress || '').trim();
  const out = { name: '', phone: '', address: raw };
  if (!raw) return out;
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const idx = p.indexOf(':');
    if (idx <= 0) continue;
    const key = p.slice(0, idx).trim().toLowerCase();
    const val = p.slice(idx + 1).trim();
    if (!val) continue;
    if (key === 'name' || key === '收件人' || key === '姓名') out.name = val;
    if (key === 'phone' || key === '电话' || key === '手机号') out.phone = val;
    if (key === 'address' || key === '地址') out.address = val;
  }
  return out;
}

function getExplorerLink(network, txHash) {
  const h = encodeURIComponent(String(txHash || '').trim());
  if (!h) return '';
  const n = String(network || '').toUpperCase();
  let chainPath = 'tron';
  if (n.includes('ERC20') || n.includes('ETH')) chainPath = 'eth';
  if (n.includes('BEP20') || n.includes('BSC')) chainPath = 'bsc';
  return `https://www.oklink.com/${chainPath}/tx/${h}`;
}

function toOklinkChainShortName(network) {
  const n = String(network || '').toUpperCase();
  if (n.includes('TRC20') || n.includes('TRON')) return 'tron';
  if (n.includes('ERC20') || n.includes('ETH')) return 'eth';
  if (n.includes('BEP20') || n.includes('BSC')) return 'bsc';
  return 'tron';
}

function decodeTrc20AmountFromInputData(inputData) {
  const raw = String(inputData || '').trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/^0x/, '');
  if (!cleaned.startsWith('a9059cbb')) return null;
  if (cleaned.length < 8 + 64 + 64) return null;
  const amountHex = cleaned.slice(8 + 64, 8 + 64 + 64);
  try {
    const amountInt = BigInt('0x' + amountHex);
    const base = 1000000n;
    const integer = amountInt / base;
    const fraction = amountInt % base;
    if (fraction === 0n) return `${integer.toString()} USDT`;
    const frac = fraction.toString().padStart(6, '0').replace(/0+$/, '');
    return `${integer.toString()}.${frac} USDT`;
  } catch {
    return null;
  }
}

function formatUsdtFromRawValue(raw) {
  try {
    const n = BigInt(String(raw || '0'));
    const base = 1000000n;
    const integer = n / base;
    const fraction = n % base;
    if (fraction === 0n) return `${integer.toString()} USDT`;
    const frac = fraction.toString().padStart(6, '0').replace(/0+$/, '');
    return `${integer.toString()}.${frac} USDT`;
  } catch {
    return 'N/A';
  }
}

function tronHexToBase58(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/^0x/, '');
  if (!raw) return 'N/A';
  let hex = raw;
  if (hex.startsWith('41') && hex.length === 42) {
    // ok
  } else if (hex.length === 40) {
    hex = '41' + hex;
  } else if (hex.length > 42) {
    hex = hex.slice(-40);
    hex = '41' + hex;
  } else {
    return input;
  }
  const payload = Buffer.from(hex, 'hex');
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const full = Buffer.concat([payload, hash2.subarray(0, 4)]);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let x = BigInt('0x' + full.toString('hex'));
  let out = '';
  while (x > 0n) {
    const mod = Number(x % 58n);
    out = alphabet[mod] + out;
    x = x / 58n;
  }
  for (let i = 0; i < full.length && full[i] === 0; i += 1) {
    out = '1' + out;
  }
  return out || 'N/A';
}

async function queryTronUsdtTransferByTxHash(txHash) {
  const hash = String(txHash || '').trim();
  if (!hash) return null;
  try {
    const [eventsRes, txInfoRes, txRes] = await Promise.all([
      fetch(`https://api.trongrid.io/v1/transactions/${hash}/events`),
      fetch('https://api.trongrid.io/wallet/gettransactioninfobyid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: hash }),
      }),
      fetch('https://api.trongrid.io/wallet/gettransactionbyid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: hash }),
      }),
    ]);
    const eventsJson = await eventsRes.json();
    const txInfoJson = await txInfoRes.json();
    const txJson = await txRes.json();
    const events = Array.isArray(eventsJson?.data) ? eventsJson.data : [];
    // 优先找 USDT(TR7N...) 的 Transfer 事件
    const transfer = events.find((e) =>
      String(e?.event_name || '').toLowerCase() === 'transfer' &&
      String(e?.contract_address || '').toUpperCase() === 'TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T'
    ) || events.find((e) => String(e?.event_name || '').toLowerCase() === 'transfer');
    const contractValue = txJson?.raw_data?.contract?.[0]?.parameter?.value || {};
    const ownerAddressHex = String(contractValue?.owner_address || '').trim();
    const dataHex = String(contractValue?.data || '').trim().toLowerCase();
    let toAddressHex = '';
    let amountRaw = '';
    if (dataHex.length >= (8 + 64 * 3)) {
      const arg2 = dataHex.slice(8 + 64, 8 + 128);
      const arg3 = dataHex.slice(8 + 128, 8 + 192);
      toAddressHex = arg2.slice(-40);
      amountRaw = String(BigInt('0x' + arg3));
    }
    const fromAddress = ownerAddressHex ? tronHexToBase58(ownerAddressHex) : tronHexToBase58(String(transfer?.result?.from || transfer?.result?.['0'] || ''));
    const toAddress = toAddressHex ? tronHexToBase58(toAddressHex) : tronHexToBase58(String(transfer?.result?.to || transfer?.result?.['1'] || ''));
    const rawValue = amountRaw || String(transfer?.result?.value || transfer?.result?.['2'] || '0');
    const paidAmount = formatUsdtFromRawValue(rawValue);
    const status = String(txInfoJson?.receipt?.result || txInfoJson?.result || 'UNKNOWN');
    return { status, fromAddress, toAddress, paidAmount };
  } catch (e) {
    console.error('[Order Telegram] query tron event error:', e.message);
    return null;
  }
}

async function queryTxStatus(network, txHash) {
  const hash = String(txHash || '').trim();
  if (!hash) return { status: 'N/A', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A' };
  const n = String(network || '').toUpperCase();
  if (n.includes('TRC20') || n.includes('TRON')) {
    const tron = await queryTronUsdtTransferByTxHash(hash);
    if (tron) {
      return { ...tron, missingApiKey: false };
    }
  }
  const chainShortName = toOklinkChainShortName(network);
  const apiKey = String(process.env.OKLINK_API_KEY || '').trim();
  if (!apiKey) {
    return queryTxStatusFromOklinkPage(network, hash);
  }
  try {
    const u = new URL('https://www.oklink.com/api/v5/explorer/transaction/transaction-fills');
    u.searchParams.set('chainShortName', chainShortName);
    u.searchParams.set('txid', hash);
    const r = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        'Ok-Access-Key': apiKey,
      },
    });
    const j = await r.json();
    const item = Array.isArray(j?.data) && j.data.length > 0 ? (j.data[0] || {}) : {};
    const status = String(
      item?.txStatus ||
      item?.state ||
      item?.status ||
      (j?.code === '0' ? 'SUCCESS' : 'UNKNOWN')
    );
    const fromAddress = String(item?.from || item?.sender || item?.fromAddress || 'N/A');
    const toAddress = String(item?.to || item?.receiver || item?.toAddress || 'N/A');
    const paidAmount = String(
      item?.amount ||
      item?.txAmount ||
      item?.transferAmount ||
      item?.tokenAmount ||
      item?.value ||
      'N/A'
    );
    return { status, fromAddress, toAddress, paidAmount, missingApiKey: false };
  } catch (e) {
    console.error('[Order Telegram] query tx error:', e.message);
  }
  return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: false };
}

async function queryTxStatusFromOklinkPage(network, txHash) {
  const link = getExplorerLink(network, txHash);
  if (!link) {
    return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: true };
  }
  try {
    const r = await fetch(link, { method: 'GET' });
    const html = await r.text();
    const text = String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{2,}/g, '\n');

    const statusMatch = text.match(/Status:\s*([^\n]+)/i) || text.match(/Result:\s*([^\n]+)/i);
    const fromMatch = text.match(/From:\s*([A-Za-z0-9]{20,})/i);
    const toMatch = text.match(/To:\s*([A-Za-z0-9]{20,})/i) || text.match(/Contract address:\s*([A-Za-z0-9]{20,})/i);
    const amountMatch = text.match(/Transfer amount:\s*([^\n]+)/i);
    const inputDataMatch = text.match(/Input data:\s*([a-fA-F0-9]+)/i);
    const decodedTokenAmount = decodeTrc20AmountFromInputData(inputDataMatch ? inputDataMatch[1] : '');
    const normalizedAmount = amountMatch ? amountMatch[1].trim() : 'N/A';
    const isZeroNativeAmount = /^0(\.0+)?(?:\s*[A-Za-z]+)?$/i.test(normalizedAmount);
    const paidAmount = (decodedTokenAmount && (normalizedAmount === 'N/A' || isZeroNativeAmount))
      ? decodedTokenAmount
      : normalizedAmount;

    return {
      status: statusMatch ? statusMatch[1].trim() : 'UNKNOWN',
      fromAddress: fromMatch ? fromMatch[1].trim() : 'N/A',
      toAddress: toMatch ? toMatch[1].trim() : 'N/A',
      paidAmount,
      missingApiKey: true,
    };
  } catch (e) {
    console.error('[Order Telegram] scrape tx error:', e.message);
    return { status: 'UNKNOWN', fromAddress: 'N/A', toAddress: 'N/A', paidAmount: 'N/A', missingApiKey: true };
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPaidAmountAsUsdt(rawAmount) {
  const raw = String(rawAmount || '').trim();
  if (!raw || raw.toUpperCase() === 'N/A') return 'N/A USDT';
  if (/\bUSDT\b/i.test(raw)) return raw.replace(/\busdt\b/i, 'USDT');
  const num = raw.match(/[\d.,]+/);
  if (num) return `${num[0]} USDT`;
  return `${raw} USDT`;
}

async function notifyOrderPaid(order) {
  const chatId = getOrderChatId();
  const token = getOrderBotToken();
  if (!chatId || !token) return;
  const recipient = parseRecipientInfo(order?.shippingAddress);
  const tx = await queryTxStatus(order?.network, order?.txHash);
  const explorer = getExplorerLink(order?.network, order?.txHash);
  const fallbackToAddress = String(order?.usdtWallet || '').trim() || 'N/A';
  const toAddress = tx.toAddress && tx.toAddress !== 'N/A' ? tx.toAddress : fallbackToAddress;
  const paidAmountRaw = tx.paidAmount && tx.paidAmount !== 'N/A' ? tx.paidAmount : 'N/A';
  const paidAmount = formatPaidAmountAsUsdt(paidAmountRaw);
  const statusLine = tx.missingApiKey
    ? '（来自页面解析）'
    : String(tx.status || 'UNKNOWN');
  const text = `🧾 <b>新订单支付通知</b>

🆔 <b>订单号:</b> <code>${esc(order?.id)}</code>
👤 <b>用户:</b> ${esc(order?.username || '')}
📦 <b>商品:</b> ${esc(order?.productName || '')}
🔢 <b>数量:</b> ${esc(order?.quantity)}
💰 <b>订单金额:</b> ${esc(order?.totalAmount)} USDT
💳 <b>支付金额:</b> ${esc(order?.totalAmount)} USDT
🔗 <b>网络:</b> ${esc(order?.network || 'TRC20')}
👥 <b>收件人:</b> ${esc(recipient.name || '')}
📞 <b>电话:</b> ${esc(recipient.phone || '')}
📍 <b>地址:</b> ${esc(recipient.address || '')}

🧾 <b>哈希:</b> <code>${esc(order?.txHash || '')}</code>
⛓ <b>链上状态:</b> ${esc(statusLine)}
🏦 <b>付款地址:</b> <code>${esc(tx.fromAddress)}</code>
💸 <b>付款金额:</b> ${esc(paidAmount)}
🎯 <b>收款地址:</b> <code>${esc(toAddress)}</code>
${explorer ? `🔎 <a href="${explorer}">区块链浏览器查看交易</a>` : ''}`;

  const payload = {
    chat_id: String(chatId),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🗑 删除订单',
          callback_data: `order_del:${String(order?.id || '')}`
        }
      ]]
    }
  };
  await telegramRequestWithToken(token, 'sendMessage', payload);
}
