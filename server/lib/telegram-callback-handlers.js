function createTelegramCallbackHandlers({
  telegramRequestWithToken,
  dbOperations,
  laravelDeleteForumPost,
  laravelDeleteForumReply,
  formatOrderNo,
  forumDeleteProvider,
}) {
  const resolvedForumDeleteProvider = String(forumDeleteProvider || 'legacy').trim().toLowerCase() === 'laravel'
    ? 'laravel'
    : 'legacy';

  async function deleteForumPostFromLegacy(postId) {
    const post = await dbOperations.forumPosts.findById(postId);
    if (!post) {
      return { ok: true, notFound: true };
    }
    await dbOperations.forumPosts.delete(postId);
    return { ok: true, notFound: false };
  }

  async function deleteForumPostFromLaravel(postId) {
    if (typeof laravelDeleteForumPost !== 'function') {
      return { ok: false, error: 'Laravel forum delete handler unavailable' };
    }
    const result = await laravelDeleteForumPost(postId);
    if (result.ok || result.status === 404) {
      return { ok: true, notFound: result.status === 404 };
    }
    return { ok: false, error: result.error || `status=${result.status || 0}` };
  }

  async function deleteForumReplyFromLegacy(replyId, expectedPostId) {
    const reply = await dbOperations.forumReplies.findById(replyId);
    if (!reply) {
      return { ok: true, notFound: true };
    }
    if (Number(reply.postId) !== expectedPostId) {
      return { ok: false, error: '回复与帖子不匹配' };
    }
    const ok = await dbOperations.forumReplies.delete(replyId);
    if (!ok) {
      return { ok: false, error: '删除失败' };
    }
    return { ok: true, notFound: false };
  }

  async function deleteForumReplyFromLaravel(replyId, expectedPostId) {
    if (typeof laravelDeleteForumReply !== 'function') {
      return { ok: false, error: 'Laravel forum delete handler unavailable' };
    }
    const result = await laravelDeleteForumReply(replyId);
    if (result.ok) {
      const actualPostId = result.data?.postId;
      if (actualPostId != null && Number(actualPostId) !== expectedPostId) {
        return { ok: false, error: '回复与帖子不匹配' };
      }
      return { ok: true, notFound: false };
    }
    if (result.status === 404) {
      return { ok: true, notFound: true };
    }
    return { ok: false, error: result.error || `status=${result.status || 0}` };
  }

  async function deleteForumPostFromSite(postId) {
    if (resolvedForumDeleteProvider === 'laravel') {
      return deleteForumPostFromLaravel(postId);
    }
    return deleteForumPostFromLegacy(postId);
  }

  async function deleteForumReplyFromSite(replyId, expectedPostId) {
    if (resolvedForumDeleteProvider === 'laravel') {
      return deleteForumReplyFromLaravel(replyId, expectedPostId);
    }
    return deleteForumReplyFromLegacy(replyId, expectedPostId);
  }

  async function handleTelegramCallbackQuery(query, expectedChatId, token) {
    const callbackId = query?.id;
    const data = String(query?.data || '');
    const message = query?.message;
    const chatId = String(message?.chat?.id || '');
    const messageId = message?.message_id;
    if (!callbackId || !data || !messageId) return;
    if (chatId !== String(expectedChatId)) return;

    if (data.startsWith('forum_del_post:')) {
      const postId = parseInt(data.split(':')[1], 10);
      if (Number.isNaN(postId)) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '参数错误',
          show_alert: false,
        });
        return;
      }
      try {
        const outcome = await deleteForumPostFromSite(postId);
        if (!outcome.ok) {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: outcome.error || '删除失败',
            show_alert: false,
          });
          return;
        }
        if (outcome.notFound) {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: '帖子不存在或已删除',
            show_alert: false,
          });
        } else {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: `已删除帖子 #${postId}`,
            show_alert: false,
          });
        }
        await telegramRequestWithToken(token, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
      } catch (e) {
        console.error('[Forum Telegram] callback delete post error:', e.message);
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '删除异常，请稍后重试',
          show_alert: false,
        });
      }
      return;
    }

    if (data.startsWith('forum_del_reply:')) {
      const parts = data.split(':');
      const replyId = parseInt(parts[1], 10);
      const postId = parseInt(parts[2], 10);
      if (Number.isNaN(replyId) || Number.isNaN(postId)) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '参数错误',
          show_alert: false,
        });
        return;
      }

      try {
        const outcome = await deleteForumReplyFromSite(replyId, postId);
        if (!outcome.ok) {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: outcome.error || '删除失败',
            show_alert: false,
          });
          return;
        }
        if (outcome.notFound) {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: '回复不存在或已删除',
            show_alert: false,
          });
        } else {
          await telegramRequestWithToken(token, 'answerCallbackQuery', {
            callback_query_id: callbackId,
            text: `已删除回复 #${replyId}`,
            show_alert: false,
          });
        }
        await telegramRequestWithToken(token, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
      } catch (e) {
        console.error('[Forum Telegram] callback delete error:', e.message);
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '删除异常，请稍后重试',
          show_alert: false,
        });
      }
      return;
    }

    if (!data.startsWith('order_del:')) return;
    const orderId = parseInt(data.split(':')[1], 10);
    if (Number.isNaN(orderId)) {
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '订单参数错误',
        show_alert: false,
      });
      return;
    }
    try {
      const order = await dbOperations.orders.findById(orderId);
      if (!order) {
        await telegramRequestWithToken(token, 'answerCallbackQuery', {
          callback_query_id: callbackId,
          text: '订单不存在或已删除',
          show_alert: false,
        });
        await telegramRequestWithToken(token, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
        return;
      }
      await dbOperations.orders.delete(orderId);
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: `已删除订单 ${formatOrderNo(order)}`,
        show_alert: false,
      });
      await telegramRequestWithToken(token, 'deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (e) {
      console.error('[Order Telegram] callback delete error:', e.message);
      await telegramRequestWithToken(token, 'answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '删除订单失败',
        show_alert: false,
      });
    }
  }

  return { handleTelegramCallbackQuery };
}

module.exports = { createTelegramCallbackHandlers };
