/**
 * API 服务入口：仅在被直接执行时启动 HTTP 服务。
 * require('./api-server') 不会监听端口。
 */
const start = require('./server/bootstrap');

if (require.main === module) {
  start();
}

module.exports = { start };
