/** 确保 express-session 写入后再响应（反代 HTTPS 环境下 Cookie 更可靠） */
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { saveSession };
