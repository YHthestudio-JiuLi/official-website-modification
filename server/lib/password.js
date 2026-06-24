const bcrypt = require('bcryptjs');

/** Laravel 使用 $2y$ 前缀的 bcrypt，bcryptjs 需转为 $2b$ 才能比对 */
function normalizeBcryptHash(hash) {
  if (typeof hash === 'string' && hash.startsWith('$2y$')) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
}

async function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, normalizeBcryptHash(hash));
}

module.exports = {
  normalizeBcryptHash,
  comparePassword
};
