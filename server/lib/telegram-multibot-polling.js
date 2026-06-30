const { createTelegramReplyTools } = require('./telegram-reply-tools');

function createTelegramMultiBotPolling({
  telegramPollingAllowed,
  dbOperations,
  resolveTelegramForAdmin,
  getForumBotToken,
  getForumChatId,
  getOrderBotToken,
  getOrderChatId,
  getAgentForToken,
  botApiBase,
  https,
  handleTelegramCallbackQuery,
}) {
  // 跟踪已经开始 polling 的 bot，防止重复启动
  const activePollingBots = new Set();
  // 首次拉取客服列表失败（常见：Python 5100 未起）时防抖重试，避免锁死导致永不轮询
  let setupRetryTimer = null;
  let setupInProgress = false;
  let started = false;
  const stopFunctions = {};
  const { describeTgSender, findSessionLinkByReplyChain } = createTelegramReplyTools({ dbOperations });

  async function restartMultiBotPolling({ broadcastToChat }) {
    started = false;
    if (setupRetryTimer) {
      clearTimeout(setupRetryTimer);
      setupRetryTimer = null;
    }
    for (const [token, stopFn] of Object.entries(stopFunctions)) {
      try {
        stopFn();
      } catch {
        // 忽略停止轮询时的异常
      }
      activePollingBots.delete(token);
      delete stopFunctions[token];
    }
    activePollingBots.clear();
    await setupMultiBotPolling({ broadcastToChat });
  }

  async function setupMultiBotPolling({ broadcastToChat }) {
    if (!telegramPollingAllowed()) {
      console.log(
        '[Telegram Multi-Bot] 本实例未启用长轮询（避免多环境 409 抢 Bot）。'
        + ' 仅在一处设 TELEGRAM_POLLING_PRIMARY=true（生产或本地二选一）。'
      );
      return;
    }

    if (started) {
      console.log('[Telegram Multi-Bot] Already started, skipping');
      return;
    }
    if (setupInProgress) {
      console.log('[Telegram Multi-Bot] 初始化进行中，跳过重复调用');
      return;
    }
    setupInProgress = true;

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
        const chatIdStr = String(chatId);
        const list = byToken.get(token);
        // 同一 token + chatId 只保留一个监听项（优先 support，避免 sales 覆盖导致日志混乱）
        const dupIdx = list.findIndex((e) => String(e.chatId) === chatIdStr);
        if (dupIdx >= 0) {
          if (admin.username === 'support') {
            list[dupIdx] = { admin, chatId: chatIdStr };
          }
          continue;
        }
        list.push({ admin, chatId: chatIdStr });
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

      for (const runningToken of [...activePollingBots]) {
        if (!byToken.has(runningToken)) {
          stopBotPolling(runningToken);
          activePollingBots.delete(runningToken);
          console.log('[Telegram Multi-Bot] 已停止旧 Bot 轮询:', runningToken.substring(0, 12) + '...');
        }
      }

      for (const [token, entries] of byToken) {
        if (activePollingBots.has(token)) continue;
        activePollingBots.add(token);
        const labels = entries.map((e) => e.admin.username).join(', ');
        const chatIds = [...new Set(entries.map((e) => e.chatId))].join(', ');
        console.log('[Telegram Multi-Bot] Starting polling for token (listeners:', labels, ', chatIds:', chatIds, ')');
        startPollingForTokenGroup(token, entries, broadcastToChat);
      }
      started = true;
    } catch (e) {
      console.error('[Telegram Multi-Bot] Setup error:', e.message);
      const delayMs = Number(process.env.TELEGRAM_POLLING_SETUP_RETRY_MS) || 15000;
      if (setupRetryTimer) clearTimeout(setupRetryTimer);
      setupRetryTimer = setTimeout(() => {
        setupRetryTimer = null;
        setupMultiBotPolling({ broadcastToChat });
      }, delayMs);
      console.error(
        `[Telegram Multi-Bot] ${delayMs / 1000}s 后将重试（请确认 Python 后端已监听 PY_DB_URL，默认同机 127.0.0.1:5100）`
      );
    } finally {
      setupInProgress = false;
    }
  }

  // 停止指定 bot 的轮询
  function stopBotPolling(token, chatId) {
    void chatId;
    if (!stopFunctions[token]) return;
    stopFunctions[token]();
    delete stopFunctions[token];
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
    // 忽略机器人账号；匿名管理员无 from，仅有 sender_chat，不在此过滤
    if (msg.from && msg.from.is_bot) return;

    const text = msg.text != null ? String(msg.text) : '';
    const chatId = msg.chat && msg.chat.id;
    const sender = describeTgSender(msg);

    console.log(
      '[Telegram Multi-Bot]',
      admin.username,
      'received from chatId:',
      chatId,
      'sender:',
      sender,
      'text:',
      text.substring(0, 50) + '...',
    );

    if (String(chatId) !== String(expectedChatId)) {
      console.log('[Telegram Multi-Bot]', admin.username, 'ignoring message from wrong chatId:', chatId);
      return;
    }

    const reply = msg.reply_to_message;
    if (!reply || reply.message_id == null) {
      if (text.trim()) {
        console.warn(
          '[Telegram Multi-Bot] 收到群消息但未使用「回复」：Bot 可能未收到该条更新（隐私模式）或无法匹配会话。请对机器人推送的用户通知点「回复」。',
          { chatId, admin: admin.username, sender },
        );
      }
      return;
    }

    console.log(
      '[Telegram Multi-Bot]',
      admin.username,
      'is reply to:',
      reply.message_id,
      'reply-from:',
      describeTgSender(reply),
      reply.from && reply.from.is_bot ? '(bot-notification)' : '',
    );
    const chainHit = await findSessionLinkByReplyChain(chatId, reply);
    const link = chainHit ? chainHit.link : null;
    if (!link || !link.session_id) {
      console.warn('[Telegram Multi-Bot] 未找到 chat_tg_links 记录（请确认是对「网站推送的用户消息」点回复，且推送已成功写入关联）', {
        chatId,
        replyToMessageId: reply.message_id,
        sender,
      });
      return;
    }
    if (chainHit.depth > 0) {
      console.log('[Telegram Multi-Bot]', admin.username, 'matched via reply chain depth', chainHit.depth, 'tg_message_id', chainHit.matchedMessageId);
    }

    console.log('[Telegram Multi-Bot]', admin.username, 'found session:', link.session_id);
    const body = text.trim();
    if (!body) return;

    try {
      const savedMsg = await dbOperations.chatMessages.create(link.session_id, 'admin', body);
      const row = savedMsg
        ? { ...savedMsg, session_id: savedMsg.session_id || link.session_id }
        : {
          id: Date.now(),
          session_id: link.session_id,
          sender: 'admin',
          body,
          created_at: new Date().toISOString(),
          fromTelegram: true,
        };

      if (savedMsg && savedMsg.id) {
        await dbOperations.chatTgLinks.create(Number(chatId), msg.message_id, link.session_id, savedMsg.id);
      }

      broadcastToChat(link.session_id, { type: 'message', message: row });
      console.log('[Telegram Multi-Bot]', admin.username, 'broadcasted to session:', link.session_id);
    } catch (e) {
      console.error('[Telegram Multi-Bot] save error:', e.message);
    }
  }

  // 同一 Bot Token 对应多个 chat 时，单连接分发
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
          if (data.error_code === 409) {
            ms = 30000;
            console.error(
              '[Telegram Multi-Bot] getUpdates 409：另有实例在轮询同一 Bot Token，本条及后续 TG 回复可能丢失。'
            );
          } else {
            ms = 8000;
            console.error('[Telegram Multi-Bot]', labelAdmin.username, 'getUpdates failed:', JSON.stringify(data));
          }
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
            if (!admin) {
              console.warn(
                '[Telegram Multi-Bot] 收到 chatId',
                cid,
                '的消息，但未在监听列表',
                [...chatIdToAdmin.keys()].join(', '),
                '—— 请更新后台 Chat ID',
              );
              continue;
            }
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

    stopFunctions[token] = () => {
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

  return {
    setupMultiBotPolling,
    restartMultiBotPolling,
  };
}

module.exports = { createTelegramMultiBotPolling };
