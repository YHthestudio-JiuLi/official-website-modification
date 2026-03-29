/**
 * Telegram Bot Integration with HTTP proxy
 */

const { HttpsProxyAgent } = require('hpagent');
const https = require('https');
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

function formatMsg(session, row) {
  console.log('[Telegram] formatMsg called with row:', row ? { id: row.id, body: row.body ? row.body.substring(0, 30) + '...' : 'NULL/EMPTY', type: typeof row } : 'NULL');
  const nick = String(session.nickname).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sid = String(session.id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bodyStr = String(row.body || '');
  console.log('[Telegram] formatMsg bodyStr:', bodyStr ? bodyStr.substring(0, 50) + '...' : 'EMPTY STRING');
  const body = truncate(bodyStr, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const result = `👤 <b>${nick}</b>\n🆔 <code>${sid}</code>\n\n${body}\n\n<i>↩ Reply to answer.</i>`;
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
  
  let chatId = admin && admin.telegram_chat_id ? admin.telegram_chat_id : getChatId();
  if (!chatId) { logOnce('no-chat', 'TELEGRAM_CHAT_ID is empty'); return; }
  
  let token = admin && admin.telegram_token ? admin.telegram_token : getBotToken();
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
  let chatId = admin && admin.telegram_chat_id ? admin.telegram_chat_id : getChatId();
  if (!chatId) { logOnce('no-chat', 'TELEGRAM_CHAT_ID is empty'); return; }
  
  let token = admin && admin.telegram_token ? admin.telegram_token : getBotToken();
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
    
    for (const admin of admins) {
      let token = admin.telegram_token;
      let chatId = admin.telegram_chat_id;
      const enabled = admin.chatbot_enabled;
      
      console.log('[Telegram Multi-Bot] Admin', admin.username, 'raw token:', token ? JSON.stringify(token) : 'NULL');
      console.log('[Telegram Multi-Bot] Admin', admin.username, 'raw chatId:', chatId ? JSON.stringify(chatId) : 'NULL');
      
      // 清理可能的隐藏字符
      if (token) token = String(token).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
      if (chatId) chatId = String(chatId).replace(/^\uFEFF/, '').replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\u00AD]/g, '').replace(/\r/g, '').trim();
      
      const botKey = `${token}:${chatId}`;
      
      console.log('[Telegram Multi-Bot] Admin', admin.username, 'cleaned token:', token ? token.substring(0, 20) + '...' : 'NULL');
      console.log('[Telegram Multi-Bot] Admin', admin.username, 'cleaned chatId:', chatId);
      
      if (!token || !chatId) {
        console.log('[Telegram Multi-Bot] Skipping admin', admin.username, '- no token or chatId');
        continue;
      }
      if (!enabled) {
        console.log('[Telegram Multi-Bot] Skipping admin', admin.username, '- chatbot disabled');
        continue;
      }
      if (activePollingBots.has(botKey)) {
        console.log('[Telegram Multi-Bot] Polling already running for', admin.username);
        continue;
      }
      
      console.log('[Telegram Multi-Bot] Starting polling for', admin.username, '(', admin.display_name, ')');
      activePollingBots.add(botKey);
      startPollingForBot(token, chatId, admin, broadcastToChat, botKey);
    }
  } catch (e) {
    console.error('[Telegram Multi-Bot] Setup error:', e.message);
  }
}

// 为单个 Bot 启动长轮询
function startPollingForBot(token, chatId, admin, broadcastToChat, botKey) {
  let offset = 0;
  let stopped = false;
  
  async function poll() {
    if (stopped) return;
    
    let ms = 400;
    try {
      const baseUrl = botApiBase(token);
      const agent = getAgentForToken(token);
      
      const payload = JSON.stringify({ offset, timeout: 45, allowed_updates: ['message'] });
      
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
          console.error('[Telegram Multi-Bot]', admin.username, 'request error:', e.message);
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
        console.error('[Telegram Multi-Bot]', admin.username, 'getUpdates failed:', JSON.stringify(data));
      } else {
        for (const u of (data.result || [])) {
          offset = u.update_id + 1;
          await handleUpdateForBot(u, chatId, admin, broadcastToChat);
        }
      }
    } catch (e) {
      ms = 5000;
      console.error('[Telegram Multi-Bot]', admin.username, 'poll:', e.message);
    }
    
    if (!stopped) {
      setTimeout(poll, ms);
    }
  }
  
  // 提供停止函数
  startPollingForBot.stopFunctions = startPollingForBot.stopFunctions || {};
  startPollingForBot.stopFunctions[botKey] = () => {
    stopped = true;
    activePollingBots.delete(botKey);
    console.log('[Telegram Multi-Bot] Stopped polling for', admin.username);
  };
  
  // 初始化
  (async () => {
    const agent = getAgentForToken(token);
    const baseUrl = botApiBase(token);
    console.log('[Telegram Multi-Bot]', admin.username, 'API base URL:', baseUrl.substring(0, 50) + '...');
    
    const getMe = await new Promise((resolve) => {
      const url = new URL(`${baseUrl}/getMe`);
      console.log('[Telegram Multi-Bot]', admin.username, 'getMe URL:', url.toString());
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
      console.error('[Telegram Multi-Bot]', admin.username, 'getMe failed:', JSON.stringify(getMe));
      console.error('[Telegram Multi-Bot]', admin.username, 'Token format check - length:', token.length, 'contains colon:', token.includes(':'));
      activePollingBots.delete(botKey);
      return;
    }
    
    console.log('[Telegram Multi-Bot] Bot:', getMe.result.username, 'for', admin.display_name);
    
    // 删除 webhook，使用轮询
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
    
    console.log('[Telegram Multi-Bot]', admin.username, 'Starting polling...');
    poll();
  })();
}

// 停止指定 bot 的轮询
function stopBotPolling(token, chatId) {
  const botKey = `${token}:${chatId}`;
  if (startPollingForBot.stopFunctions && startPollingForBot.stopFunctions[botKey]) {
    startPollingForBot.stopFunctions[botKey]();
    delete startPollingForBot.stopFunctions[botKey];
  }
}

// 处理单个 Bot 的更新
async function handleUpdateForBot(update, expectedChatId, admin, broadcastToChat) {
  if (!update || !update.message) return;
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

module.exports = { 
  createTelegramIntegration, 
  getBotToken, 
  getChatId,
  notifyForumNewPost,
  notifyForumNewReply
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
