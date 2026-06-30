/**
 * API 服务入口：仅在被直接执行时启动 HTTP 服务。
 * require('./api-server') 不会监听端口。
 */
const path = require('path');
// 必须在 bootstrap/telegram 之前加载根目录 .env（telegram 会间接 require bridge-token）
require('dotenv').config({ path: path.join(__dirname, '.env') });

const start = require('./server/bootstrap');

if (require.main === module) {
  start();
}

module.exports = { start };
