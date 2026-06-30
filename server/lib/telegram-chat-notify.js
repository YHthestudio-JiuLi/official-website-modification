function createTelegramChatNotifyTools({
  resolveTelegramForAdmin,
  logOnce,
  telegramRequestWithToken,
  truncate,
  dbOperations,
}) {
  function formatMsg(session, row) {
    console.log('[Telegram] formatMsg called with row:', row ? { id: row.id, body: row.body ? row.body.substring(0, 30) + '...' : 'NULL/EMPTY', type: typeof row } : 'NULL');
    const nick = String(session.nickname).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sid = String(session.id).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const serviceLabel = '在线客服';
    const bodyStr = String(row.body || '');
    console.log('[Telegram] formatMsg bodyStr:', bodyStr ? bodyStr.substring(0, 50) + '...' : 'EMPTY STRING');
    const body = truncate(bodyStr, 3500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const result = `👤 <b>${nick}</b>\n🆔 <code>${sid}</code>\n📮 <b>消息来源：</b>${serviceLabel}\n\n${body}\n\n<i>↩ Reply to answer.</i>`;
    console.log('[Telegram] formatMsg result:', result.substring(0, 80) + '...');
    return result;
  }

  function formatMsgPlain(session, row) {
    return `访客：${session.nickname}\n会话：${session.id}\n\n${truncate(row.body, 3500)}\n\n↩ Reply to answer.`;
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

    const payload = {
      chat_id: String(chatId),
      text: formatMsg(session, messageRow),
      parse_mode: 'HTML',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: '请回复此会话…',
      },
    };

    console.log('[Telegram] Payload text length:', payload.text.length);
    const parsed = await telegramRequestWithToken(token, 'sendMessage', payload);
    console.log('[Telegram] API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
    if (parsed.ok && parsed.result && parsed.result.message_id != null) {
      dbOperations.chatTgLinks.create(parsed.result.chat.id, parsed.result.message_id, session.id, messageRow.id).catch((e) => {
        console.error('[Telegram] chatTgLinks.create 失败（将无法在 TG 用「回复」同步到网站）:', e.message || e);
      });
    }
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

    const payload = {
      chat_id: String(chatId),
      text,
      reply_to_message_id: replyToMessageId || undefined,
    };

    console.log('[Telegram] Admin reply payload:', { chat_id: chatId, text: text.substring(0, 50) + '...', reply_to_message_id: replyToMessageId });
    const parsed = await telegramRequestWithToken(token, 'sendMessage', payload);
    console.log('[Telegram] Admin reply API response:', parsed.ok ? 'OK' : 'FAILED', parsed.description || '');
    if (parsed.ok && parsed.result && parsed.result.message_id != null) {
      dbOperations.chatTgLinks.create(parsed.result.chat.id, parsed.result.message_id, session.id, messageRow.id).catch((e) => {
        console.error('[Telegram] chatTgLinks.create(客服回复) 失败:', e.message || e);
      });
    }
  }

  return {
    formatMsg,
    formatMsgPlain,
    notifyUserMessage,
    notifyAdminReply,
  };
}

module.exports = { createTelegramChatNotifyTools };
