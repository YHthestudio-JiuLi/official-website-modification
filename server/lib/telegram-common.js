function createTelegramCommonTools() {
  const logged = new Set();

  function logOnce(key, msg) {
    if (logged.has(key)) return;
    logged.add(key);
    console.warn('[Telegram]', msg);
  }

  function truncate(s, max) {
    const text = String(s);
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
  }

  return {
    logOnce,
    truncate,
  };
}

module.exports = { createTelegramCommonTools };
