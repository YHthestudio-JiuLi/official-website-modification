/**
 * Telegram Bot Integration with HTTP proxy
 */

const https = require('https');
const { dbOperations } = require('./database');
const { laravelDeleteForumPost, laravelDeleteForumReply } = require('./server/lib/laravel-internal');
const { createTelegramHttpClient } = require('./server/lib/telegram-http-client');
const { createTelegramCredentialsTools } = require('./server/lib/telegram-credentials');
const { telegramPollingAllowed } = require('./server/lib/telegram-polling-policy');
const { createTelegramCommonTools } = require('./server/lib/telegram-common');
const { createOrderTelegramTools } = require('./server/lib/telegram-order-notify');
const { createForumTelegramTools } = require('./server/lib/telegram-forum-notify');
const { createTelegramCallbackHandlers } = require('./server/lib/telegram-callback-handlers');
const { createTelegramMultiBotPolling } = require('./server/lib/telegram-multibot-polling');
const { createTelegramReplyTools } = require('./server/lib/telegram-reply-tools');
const { createTelegramWebhookHandler } = require('./server/lib/telegram-webhook-handler');
const { createTelegramChatNotifyTools } = require('./server/lib/telegram-chat-notify');

const {
  botApiBase,
  getAgentForToken,
  getBotToken,
  getChatId,
  telegramRequestWithToken,
} = createTelegramHttpClient();

const { resolveTelegramForAdmin, canSendTelegramForAdmin } = createTelegramCredentialsTools({
  getBotToken,
  getChatId,
});
const { logOnce, truncate } = createTelegramCommonTools();

const {
  notifyOrderPaid,
  getOrderBotToken,
  getOrderChatId,
  formatOrderNo,
} = createOrderTelegramTools({ telegramRequestWithToken });

const {
  getForumBotToken,
  getForumChatId,
  notifyForumNewPost,
  notifyForumNewReply,
} = createForumTelegramTools({
  truncate,
  logOnce,
  telegramRequestWithToken,
});
const forumDeleteProvider = process.env.TELEGRAM_FORUM_DELETE_PROVIDER || 'legacy';

const { handleTelegramCallbackQuery } = createTelegramCallbackHandlers({
  telegramRequestWithToken,
  dbOperations,
  laravelDeleteForumPost,
  laravelDeleteForumReply,
  formatOrderNo,
  forumDeleteProvider,
});

const { setupMultiBotPolling, restartMultiBotPolling } = createTelegramMultiBotPolling({
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
});

const { describeTgSender, findSessionLinkByReplyChain } = createTelegramReplyTools({ dbOperations });
const { notifyUserMessage, notifyAdminReply } = createTelegramChatNotifyTools({
  resolveTelegramForAdmin,
  logOnce,
  telegramRequestWithToken,
  truncate,
  dbOperations,
});

function createTelegramIntegration({ broadcastToChat }) {
  const { handleUpdate } = createTelegramWebhookHandler({
    describeTgSender,
    findSessionLinkByReplyChain,
    broadcastToChat,
  });

  return { notifyUserMessage, notifyAdminReply, handleUpdate, setupMultiBotPolling, restartMultiBotPolling: () => restartMultiBotPolling({ broadcastToChat }) };
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

