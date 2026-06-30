function createTelegramReplyTools({ dbOperations }) {
  /** 记录 Telegram 消息发送者（含匿名管理员 sender_chat） */
  function describeTgSender(msg) {
    if (!msg) return 'unknown';
    if (msg.from) {
      const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || '';
      return `user:${msg.from.id}${msg.from.is_bot ? ':bot' : ''}${name ? `:${name}` : ''}`;
    }
    if (msg.sender_chat) {
      return `sender_chat:${msg.sender_chat.id}:${msg.sender_chat.title || msg.sender_chat.username || ''}`;
    }
    return 'no-from';
  }

  /** 沿回复链向上查找已关联会话的 Telegram 消息（支持回复群主/客服已同步的中间消息） */
  async function findSessionLinkByReplyChain(chatId, replyMessage) {
    let current = replyMessage;
    let depth = 0;
    while (current && current.message_id != null && depth < 15) {
      const link = await dbOperations.chatTgLinks.findByTgMessage(Number(chatId), Number(current.message_id));
      if (link && link.session_id) {
        return { link, matchedMessageId: current.message_id, depth };
      }
      current = current.reply_to_message;
      depth += 1;
    }
    return null;
  }

  return {
    describeTgSender,
    findSessionLinkByReplyChain,
  };
}

module.exports = { createTelegramReplyTools };
