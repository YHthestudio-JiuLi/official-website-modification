function createTelegramCredentialsTools({
  getBotToken,
  getChatId,
}) {
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
   * 解析客服账号的 Telegram 凭据：数据库优先，未配置时回退到全局环境变量
   * 仅有在线客服，不再区分售前/官方
   */
  function resolveTelegramForAdmin(admin) {
    if (!admin) {
      return { token: getBotToken(), chatId: getChatId() };
    }
    const token = cleanTelegramToken(admin.telegram_token) || getBotToken();
    const chatId = cleanTelegramChatId(admin.telegram_chat_id) || getChatId();
    return { token, chatId };
  }

  function canSendTelegramForAdmin(admin) {
    const { token, chatId } = resolveTelegramForAdmin(admin);
    return !!(token && chatId);
  }

  return {
    cleanTelegramToken,
    cleanTelegramChatId,
    resolveTelegramForAdmin,
    canSendTelegramForAdmin,
  };
}

module.exports = { createTelegramCredentialsTools };
