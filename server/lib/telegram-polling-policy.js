/**
 * 是否允许本进程执行 getUpdates 长轮询。
 * 同一 Bot Token 全局只能有一个消费者，否则会 409 并随机漏消息。
 */
function telegramPollingAllowed() {
  if (process.env.TELEGRAM_USE_POLLING !== 'true') return false;
  const primary = String(process.env.TELEGRAM_POLLING_PRIMARY || '').trim().toLowerCase();
  if (primary === 'false' || primary === '0' || primary === 'no') return false;
  if (primary === 'true' || primary === '1' || primary === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

module.exports = { telegramPollingAllowed };
