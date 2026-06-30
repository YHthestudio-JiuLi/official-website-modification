function createTelegramWebhookHandler({
  describeTgSender,
  findSessionLinkByReplyChain,
  broadcastToChat,
}) {
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
      console.log('[Telegram] This is a reply to message_id:', reply.message_id, 'sender:', describeTgSender(msg));
      const chainHit = await findSessionLinkByReplyChain(chatId, reply);
      const link = chainHit ? chainHit.link : null;
      if (link && link.session_id) {
        console.log('[Telegram] Found session:', link.session_id);
        const body = text.trim();
        if (!body) return;
        const row = {
          id: Date.now(),
          session_id: link.session_id,
          sender: 'admin',
          body,
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

  return { handleUpdate };
}

module.exports = { createTelegramWebhookHandler };
