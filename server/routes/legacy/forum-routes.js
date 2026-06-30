function registerLegacyForumRoutes(app, deps) {
  const {
    dbOperations,
    requireUser,
    requireAdmin,
    notifyForumNewPost,
    notifyForumNewReply,
  } = deps;

  app.get('/api/forum/posts', async (req, res) => {
    const posts = await dbOperations.forumPosts.findAll();
    res.json(posts);
  });

  app.get('/api/forum/posts/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const post = await dbOperations.forumPosts.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  });

  app.post('/api/forum/posts', requireUser, async (req, res) => {
    const { title, content } = req.body;
    const date = new Date().toISOString().split('T')[0];
    const postId = await dbOperations.forumPosts.create(title, req.session.user.username, content, date, 0);

    try {
      const post = {
        id: postId,
        title,
        author: req.session.user.username,
        content,
        date,
      };
      notifyForumNewPost(post).catch((err) => {
        console.error('[Forum Telegram] Post notification error:', err.message || err);
      });
    } catch (err) {
      console.error('[Forum Telegram] Get post info error:', err.message || err);
    }

    res.json({ success: true });
  });

  app.get('/api/forum/posts/:id/replies', async (req, res) => {
    const id = parseInt(req.params.id);
    const replies = await dbOperations.forumReplies.findByPostId(id);
    res.json(replies);
  });

  app.post('/api/forum/posts/:id/replies', requireUser, async (req, res) => {
    const postId = parseInt(req.params.id);
    const { content, parentReplyId } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content required' });
    }

    let parentReplyIdInt = null;
    if (parentReplyId) {
      parentReplyIdInt = parseInt(parentReplyId);
      const parentReply = await dbOperations.forumReplies.findById(parentReplyIdInt);
      if (!parentReply || parentReply.postId !== postId) {
        return res.status(400).json({ error: 'Invalid parent reply' });
      }
    }

    await dbOperations.forumReplies.create(postId, req.session.user.username, content.trim(), parentReplyIdInt);

    try {
      const post = await dbOperations.forumPosts.findById(postId);
      const replies = await dbOperations.forumReplies.findByPostId(postId);
      const newReply = replies[replies.length - 1];

      let parentReply = null;
      if (parentReplyIdInt) {
        parentReply = await dbOperations.forumReplies.findById(parentReplyIdInt);
      }

      if (post && newReply) {
        notifyForumNewReply(newReply, post, parentReply).catch((err) => {
          console.error('[Forum Telegram] Reply notification error:', err.message || err);
        });
      }
    } catch (err) {
      console.error('[Forum Telegram] Get reply info error:', err.message || err);
    }

    res.json({ success: true });
  });

  app.delete('/api/forum/replies/:id', requireUser, async (req, res) => {
    const replyId = parseInt(req.params.id);
    const reply = await dbOperations.forumReplies.findById(replyId);

    if (!reply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (reply.author !== req.session.user.username && !req.session.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await dbOperations.forumReplies.delete(replyId);
    res.json({ success: true });
  });

  app.get('/api/admin/posts', requireAdmin, async (req, res) => {
    const posts = await dbOperations.forumPosts.findAll();
    res.json(posts);
  });

  app.get('/api/admin/posts/:id', requireAdmin, async (req, res) => {
    const post = await dbOperations.forumPosts.findById(parseInt(req.params.id));
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  });

  app.post('/api/admin/posts', requireAdmin, async (req, res) => {
    const { title, author, content, date } = req.body;
    const postDate = date || new Date().toISOString().split('T')[0];
    const postAuthor = author || 'Admin';
    await dbOperations.forumPosts.create(title, postAuthor, content, postDate, 0);
    res.json({ success: true });
  });

  app.put('/api/admin/posts/:id', requireAdmin, async (req, res) => {
    const { title, author, content, date, replies } = req.body;
    const postDate = date || new Date().toISOString().split('T')[0];
    const replyCount = parseInt(replies) || 0;
    const postAuthor = author || 'Admin';
    await dbOperations.forumPosts.update(parseInt(req.params.id), title, postAuthor, content, postDate, replyCount);
    res.json({ success: true });
  });

  app.post('/api/admin/posts/:id/pin', requireAdmin, async (req, res) => {
    await dbOperations.forumPosts.togglePin(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.delete('/api/admin/posts/:id', requireAdmin, async (req, res) => {
    await dbOperations.forumPosts.delete(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get('/api/admin/posts/:id/replies', requireAdmin, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (Number.isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    const post = await dbOperations.forumPosts.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const replies = await dbOperations.forumReplies.findByPostId(postId);
    res.json({ replies });
  });

  app.delete('/api/admin/replies/:id', requireAdmin, async (req, res) => {
    const replyId = parseInt(req.params.id);
    if (Number.isNaN(replyId)) {
      return res.status(400).json({ error: 'Invalid reply id' });
    }
    const reply = await dbOperations.forumReplies.findById(replyId);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found' });
    }
    const ok = await dbOperations.forumReplies.delete(replyId);
    if (!ok) {
      return res.status(404).json({ error: 'Reply not found' });
    }
    res.json({ success: true });
  });
}

module.exports = { registerLegacyForumRoutes };
