function createForumTelegramTools({ truncate, logOnce, telegramRequestWithToken }) {
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

    const payload = {
      chat_id: String(chatId),
      text: formatForumPostMessage(post),
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🗑 删除此帖',
            callback_data: `forum_del_post:${String(post.id || '')}`,
          },
        ]],
      },
    };

    console.log('[Forum Telegram] Payload length:', payload.text.length);
    const response = await telegramRequestWithToken(token, 'sendMessage', payload);
    console.log('[Forum Telegram] API response:', response.ok ? 'OK' : 'FAILED', response.description || '');
  }

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

    const payload = {
      chat_id: String(chatId),
      text: formatForumReplyMessage(reply, post, parentReply),
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🗑 删除此回复',
            callback_data: `forum_del_reply:${String(reply.id || '')}:${String(post.id || '')}`,
          },
        ]],
      },
    };

    console.log('[Forum Telegram] Payload length:', payload.text.length);
    const response = await telegramRequestWithToken(token, 'sendMessage', payload);
    console.log('[Forum Telegram] API response:', response.ok ? 'OK' : 'FAILED', response.description || '');
  }

  return {
    getForumBotToken,
    getForumChatId,
    notifyForumNewPost,
    notifyForumNewReply,
  };
}

module.exports = { createForumTelegramTools };
