const { v4: uuidv4 } = require('uuid');
const { canSendTelegramForAdmin } = require('../../telegram');

function registerChatRoutes(app, deps) {
  const {
    dbOperations,
    broadcastToChat,
    adminTokens,
    requireAdmin
  } = deps;

  /** 校验当前请求是否可访问该聊天会话 */
  function canAccessChatSession(req, session) {
    if (!session) return false
    const uid = req.session?.user?.id
    if (!uid) return false
    if (session.user_id == null) return true
    return Number(session.user_id) === Number(uid)
  }

// 获取当前用户的聊天会话
app.get('/api/chat/user-session', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.json({ session: null });
    }
    // 通过用户 ID 查找活跃的聊天会话
    const sessions = await dbOperations.chatSessions.findByUserId(req.session.user.id);
    if (sessions && sessions.length > 0) {
      // 返回最近的活跃会话
      res.json({ session: sessions[0] });
    } else {
      res.json({ session: null });
    }
  } catch (error) {
    console.error('[API Error] /api/chat/user-session:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 获取当前用户的所有聊天会话
app.get('/api/chat/user-sessions', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.json({ sessions: [] });
    }
    const sessions = await dbOperations.chatSessions.findByUserId(req.session.user.id);
    res.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('[API Error] /api/chat/user-sessions:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/chat/community-links', async (req, res) => {
  try {
    const settings = await dbOperations.chatCommunitySettings.get();
    res.json(settings);
  } catch (error) {
    console.error('[API Error] /api/chat/community-links:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/chat/admins', async (req, res) => {
  try {
    const all = await dbOperations.chatAdmins.findAll();
    // 前台仅对接在线客服，不暴露售前账号
    const admins = all.filter((a) => a.username === 'support');
    res.json({ admins });
  } catch (error) {
    console.error('[API Error] /api/chat/admins:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/sessions', async (req, res) => {
  const { nickname, admin_id, service_type, user_id } = req.body || {};
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  const aid = Number(admin_id);
  const stype = service_type || 'support';

  // 已登录用户仅使用服务端会话中的 user_id，忽略客户端伪造
  const uid = (req.session && req.session.user) ? req.session.user.id : null;

  if (!name || name.length < 1) {
    return res.status(400).json({ error: 'Nickname required' });
  }
  if (!Number.isInteger(aid)) {
    return res.status(400).json({ error: 'Invalid admin' });
  }

// 检查是否已有该客服的活跃会话
  if (uid) {
    const existingSession = await dbOperations.chatSessions.findByUserIdAndAdminId(uid, aid);
    if (existingSession) {
      return res.json({ session: existingSession });
    }
  }

  const sessionId = uuidv4();
  try {
    const session = await dbOperations.chatSessions.create(sessionId, name, aid, stype, uid);
    if (!session) {
      return res.status(400).json({ error: 'Could not create session' });
    }
    return res.json({ session });
  } catch (e) {
    console.error('[API Error] POST /api/chat/sessions:', e.message);
    return res.status(500).json({ error: 'Could not create session' });
  }
});

app.get('/api/chat/sessions/:id', async (req, res) => {
  try {
    const session = await dbOperations.chatSessions.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!canAccessChatSession(req, session)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ session });
  } catch (error) {
    console.error('[API Error] /api/chat/sessions/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const sid = req.params.id;
    console.log('[Chat] Loading messages for session:', sid);
    
    const session = await dbOperations.chatSessions.findById(sid);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!canAccessChatSession(req, session)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let messages = await dbOperations.chatMessages.findBySessionId(sid);
    if (!messages) messages = [];
    
    console.log('[Chat] Loaded', messages.length, 'messages for session:', sid);

    res.json({ messages, fromTelegram: false });
  } catch (error) {
    console.error('[API Error] /api/chat/sessions/:id/messages:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/sessions/:id/messages', async (req, res) => {
  const { body, sender } = req.body || {};
  const sid = req.params.id;
  try {
    const session = await dbOperations.chatSessions.findById(sid);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!canAccessChatSession(req, session)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    let who = 'user';
    if (sender === 'admin') {
      const tok = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!tok || !adminTokens.has(tok)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      who = 'admin';
    }

    console.log('[Debug] POST message body:', body ? body.substring(0, 50) + '...' : 'EMPTY/NULL', 'sender:', sender, 'who:', who);

    // Get admin info for Telegram
    const adminInfo = session.admin_id ? await dbOperations.chatAdmins.findById(session.admin_id) : null;
    const useTelegram = adminInfo && canSendTelegramForAdmin(adminInfo);

    // Debug log for Telegram config
    console.log('[Debug] Session:', session.id, 'admin_id:', session.admin_id);
    console.log('[Debug] AdminInfo:', adminInfo ? {
      id: adminInfo.id,
      username: adminInfo.username,
      telegram_chat_id: adminInfo.telegram_chat_id ? 'set' : 'empty',
      telegram_token: adminInfo.telegram_token ? 'set' : 'empty',
      chatbot_enabled: adminInfo.chatbot_enabled
    } : 'null');
    console.log('[Debug] useTelegram:', useTelegram);

    // Validate body first
    const messageBody = String(body || '').trim();
    if (!messageBody) {
      console.log('[Debug] Empty message body rejected');
      return res.status(400).json({ error: 'Empty message' });
    }

// Save message to database first
    console.log('[Chat] Creating message for session:', sid, 'sender:', who);
    const savedMsg = await dbOperations.chatMessages.create(sid, who, messageBody);
    console.log('[Chat] Message saved:', savedMsg ? 'success' : 'failed');

    const row = savedMsg || {
      id: Date.now(),
      session_id: sid,
      sender: who,
      body: messageBody,
      created_at: new Date().toISOString(),
    };

    console.log('[Debug] Created message row:', { id: row.id, body: row.body.substring(0, 50) + '...' });

    const payload = { type: 'message', message: { ...row, session_id: row.session_id || sid } };
    broadcastToChat(sid, payload);

    res.json({ message: row });

    const telegram = deps.telegram;
    if (useTelegram && telegram) {
      console.log('[Telegram] Sending message to Telegram for session:', session.id, 'sender:', who);
      if (who === 'user') {
        telegram.notifyUserMessage(session, row, adminInfo).catch((err) => {
          console.error('[Telegram] notify:', err.message || err);
        });
      }
      if (who === 'admin') {
        telegram.notifyAdminReply(session, row, adminInfo).catch((err) => {
          console.error('[Telegram] admin reply:', err.message || err);
        });
      }
    } else if (useTelegram && !telegram) {
      console.warn('[Telegram] 集成未初始化，已跳过 Telegram 推送');
    }
  } catch (error) {
    console.error('[API Error] POST /api/chat/sessions/:id/messages:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/admin/login', (req, res) => {
  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  if (password === ADMIN_PASSWORD) {
    const token = uuidv4();
    adminTokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.get('/api/chat/admin/conversations', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const conversations = await dbOperations.chatSessions.findConversationsForAdmin();
    res.json({ conversations });
  } catch (error) {
    console.error('[API Error] /api/chat/admin/conversations:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// ==================== Admin Chat Settings ====================

app.get('/api/admin/chat/community-links', requireAdmin, async (req, res) => {
  try {
    const settings = await dbOperations.chatCommunitySettings.get();
    res.json(settings);
  } catch (error) {
    console.error('[API Error] GET /api/admin/chat/community-links:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/chat/community-links', requireAdmin, async (req, res) => {
  const { telegramGroupUrl, qqGroupUrl } = req.body || {};
  try {
    await dbOperations.chatCommunitySettings.update(
      typeof telegramGroupUrl === 'string' ? telegramGroupUrl : '',
      typeof qqGroupUrl === 'string' ? qqGroupUrl : ''
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/chat/community-links:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/admin/chat-admins', requireAdmin, async (req, res) => {
  try {
    const all = await dbOperations.chatAdmins.findAll();
    const admins = all.filter((a) => a.username === 'support');
    res.json({ admins });
  } catch (error) {
    console.error('[API Error] GET /api/admin/chat-admins:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/chat-admins/:id', requireAdmin, async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { display_name, bio, avatar_color, telegram_chat_id, telegram_token, chatbot_enabled } = req.body || {};
  if (Number.isNaN(adminId)) {
    return res.status(400).json({ error: 'Invalid admin ID' });
  }
  try {
    await dbOperations.chatAdmins.update(
      adminId,
      display_name,
      bio,
      avatar_color,
      telegram_chat_id,
      telegram_token,
      chatbot_enabled,
    );
    const updated = await dbOperations.chatAdmins.findById(adminId);
    res.json({ admin: updated });
    deps.telegram?.restartMultiBotPolling?.().catch((err) => {
      console.error('[Telegram] restart polling after config update:', err.message || err);
    });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/chat-admins/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/chat-admins/:id/chatbot', requireAdmin, async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { enabled } = req.body || {};
  if (Number.isNaN(adminId)) {
    return res.status(400).json({ error: 'Invalid admin ID' });
  }
  try {
    await dbOperations.chatAdmins.updateChatbotEnabled(adminId, Boolean(enabled));
    const updated = await dbOperations.chatAdmins.findById(adminId);
    res.json({ admin: updated });
    deps.telegram?.restartMultiBotPolling?.().catch((err) => {
      console.error('[Telegram] restart polling after chatbot toggle:', err.message || err);
    });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/chat-admins/:id/chatbot:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

}

module.exports = { registerChatRoutes };
